import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseClientDiagnostics } from "../persistence/database-client";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import { buildSystemHealthReport } from "./system-health";
import type { MarketRadarSnapshot, ScanArchiveSummary, ScanReplayFrame } from "../market/types";

function snapshot(
  metadata: Partial<MarketRadarSnapshot["metadata"]> = {},
): MarketRadarSnapshot {
  return {
    metadata: {
      id: "scan-health",
      mode: "demo",
      status: "ready",
      source: "mock",
      isRealtime: false,
      cadenceMinutes: 15,
      scannedCount: 24,
      anomalyCount: 4,
      candidateCount: 4,
      riskGate: "on",
      generatedAt: "2026-06-12T10:00:00.000Z",
      nextScanAt: "2026-06-12T10:15:00.000Z",
      staleAfterMinutes: 30,
      notes: ["演示数据", "scan runtime: updated from Demo Market Provider"],
      ...metadata,
    },
    instrumentPool: {
      instruments: [],
      rejected: [],
      summary: {
        total: 29,
        accepted: 24,
        rejected: 4,
        duplicatesRemoved: 1,
        minVolume24hUsd: 5_000_000,
        quoteAssets: ["USDT"],
        marketTypes: ["perpetual"],
      },
    },
    instruments: [],
    tickers: [],
    derivatives: [],
    heatmap: [],
    signals: [],
    journalEvents: [],
  };
}

function archiveSummary(): ScanArchiveSummary {
  return {
    id: "scan-health",
    source: "mock",
    status: "ready",
    generatedAt: "2026-06-12T10:00:00.000Z",
    scannedCount: 24,
    anomalyCount: 4,
    candidateCount: 4,
    topSymbols: ["ENAUSDT"],
    notes: ["演示数据"],
  };
}

function replayFrame(): ScanReplayFrame {
  return {
    id: "scan-health",
    source: "mock",
    status: "ready",
    generatedAt: "2026-06-12T10:00:00.000Z",
    nextScanAt: "2026-06-12T10:15:00.000Z",
    cadenceMinutes: 15,
    scannedCount: 24,
    anomalyCount: 4,
    candidateCount: 4,
    signals: [],
  };
}

test("buildSystemHealthReport marks mock and memory mode as a visible preview state", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  await repository.addScanArchive(archiveSummary(), replayFrame());

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T10:04:30.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.level, "preview");
  assert.equal(report.dataSource.mode, "demo");
  assert.equal(report.dataSource.activeSource, "mock");
  assert.equal(report.dataSource.configuredProvider, "mock");
  assert.equal(report.persistence.mode, "memory");
  assert.equal(report.persistence.durable, false);
  assert.equal(report.archive.entries, 1);
  assert.equal(report.scan.freshness, "fresh");
  assert.equal(report.scan.ageMinutes, 5);
  assert.deepEqual(report.guards.map((guard) => guard.id), [
    "data-source",
    "persistence",
    "freshness",
    "archive",
  ]);
});

test("buildSystemHealthReport reports a degraded provider when CoinGlass is requested without a key", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "coinglass" },
    now: new Date("2026-06-12T10:02:00.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.level, "degraded");
  assert.equal(report.dataSource.configuredProvider, "coinglass");
  assert.equal(report.dataSource.status, "missing_key");
  assert.match(report.dataSource.detail, /COINGLASS_API_KEY/);
  assert.equal(report.guards.find((guard) => guard.id === "data-source")?.state, "degraded");
});

test("buildSystemHealthReport exposes database fallback diagnostics instead of hiding them behind memory mode", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "chuan-public" });
  const database: DatabaseClientDiagnostics = {
    connectionStringEnv: "DATABASE_URL",
    detail: "检测到 DATABASE_URL，但还没有注入服务端 SQL client，当前安全回落到内存存储。",
    driver: "neon",
    durable: false,
    hasDatabaseUrl: true,
    reason: "sql_client_missing",
    scope: "chuan-public",
    status: "fallback",
  };

  const report = await buildSystemHealthReport({
    database,
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T10:04:30.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.persistence.databaseStatus, "fallback");
  assert.equal(report.persistence.databaseDriver, "neon");
  assert.equal(report.persistence.databaseReason, "sql_client_missing");
  assert.match(report.persistence.detail, /SQL client/);
  assert.match(
    report.guards.find((guard) => guard.id === "persistence")?.detail ?? "",
    /SQL client/,
  );
});

test("buildSystemHealthReport escalates stale scans past the stale window", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T10:45:00.000Z"),
    repository,
    snapshot: snapshot({
      status: "stale",
      generatedAt: "2026-06-12T10:00:00.000Z",
      staleAfterMinutes: 30,
    }),
  });

  assert.equal(report.level, "degraded");
  assert.equal(report.scan.freshness, "expired");
  assert.equal(report.scan.ageMinutes, 45);
  assert.equal(report.guards.find((guard) => guard.id === "freshness")?.state, "degraded");
});
