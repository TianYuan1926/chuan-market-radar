import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeProbeReport } from "../runtime/worker-heartbeat";
import type { MarketRadarSnapshot, ScanArchiveSummary } from "./types";
import { buildScanStabilityReport } from "./scan-stability";

function runtime(overrides: Partial<RuntimeProbeReport> = {}): RuntimeProbeReport {
  return {
    generatedAt: "2026-06-21T08:00:00.000Z",
    redis: {
      checkedAt: "2026-06-21T08:00:00.000Z",
      detail: "Redis healthy",
      status: "healthy",
    },
    staleAfterSeconds: 900,
    workers: [
      {
        ageSec: 20,
        detail: "ok",
        key: "scanner-worker",
        lastSeenAt: "2026-06-21T08:00:00.000Z",
        name: "scanner-worker",
        status: "healthy",
        task: "scan",
      },
    ],
    ...overrides,
  };
}

function archive(overrides: Partial<ScanArchiveSummary> = {}): ScanArchiveSummary {
  return {
    anomalyCount: 2,
    candidateCount: 5,
    generatedAt: "2026-06-21T08:00:00.000Z",
    id: "archive-1",
    notes: [],
    scannedCount: 24,
    source: "coinglass",
    status: "ready",
    topSymbols: ["TIAUSDT"],
    ...overrides,
  };
}

function snapshot(overrides: Partial<MarketRadarSnapshot> = {}): MarketRadarSnapshot {
  return {
    archive: undefined,
    derivatives: [],
    heatmap: [],
    instrumentPool: {
      instruments: [],
      rejected: [],
      summary: {
        accepted: 720,
        duplicatesRemoved: 0,
        marketTypes: ["perpetual"],
        minVolume24hUsd: 0,
        quoteAssets: ["USDT"],
        rejected: 0,
        total: 820,
      },
    },
    instruments: [],
    journalEvents: [],
    metadata: {
      anomalyCount: 2,
      cadenceMinutes: 15,
      candidateCount: 5,
      coverage: {
        batchIndex: 2,
        coveragePercent: 10,
        eligible: 720,
        nextBatchIndex: 3,
        pending: 648,
        pendingAssets: [],
        scanned: 72,
        scannedAssets: [],
        skipped: 0,
        skippedAssets: [],
        total: 820,
        totalBatches: 30,
      },
      generatedAt: "2026-06-21T08:00:00.000Z",
      id: "scan-1",
      isRealtime: true,
      mode: "scheduled",
      nextScanAt: "2026-06-21T08:15:00.000Z",
      notes: [],
      riskGate: "on",
      scannedCount: 72,
      source: "coinglass",
      staleAfterMinutes: 30,
      status: "ready",
    },
    signals: [],
    tickers: [],
    ...overrides,
  };
}

test("buildScanStabilityReport marks healthy rotation and does not create trading authority", () => {
  const report = buildScanStabilityReport({
    archives: [archive()],
    now: new Date("2026-06-21T08:05:00.000Z"),
    runtimeProbes: runtime(),
    snapshot: snapshot(),
  });

  assert.equal(report.status, "healthy");
  assert.equal(report.rotation.eligibleAssets, 720);
  assert.equal(report.rotation.scannedAssets, 72);
  assert.equal(report.rotation.estimatedFullCycleMinutes, 450);
  assert.equal(report.runtime.workerHealthy, 1);
  assert.match(report.guardrail, /不能直接生成交易信号/);
});

test("buildScanStabilityReport blocks stale scans and missing worker heartbeats", () => {
  const report = buildScanStabilityReport({
    archives: [],
    now: new Date("2026-06-21T09:00:00.000Z"),
    runtimeProbes: runtime({
      redis: {
        checkedAt: "2026-06-21T09:00:00.000Z",
        detail: "Redis down",
        status: "down",
      },
      workers: [
        {
          ageSec: null,
          detail: "missing",
          key: "scanner-worker",
          lastSeenAt: null,
          name: "scanner-worker",
          status: "down",
          task: null,
        },
      ],
    }),
    snapshot: snapshot({
      metadata: {
        ...snapshot().metadata,
        coverage: {
          ...snapshot().metadata.coverage!,
          coveragePercent: 0.28,
          scanned: 2,
        },
        generatedAt: "2026-06-21T08:00:00.000Z",
        scannedCount: 2,
      },
    }),
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.issues.some((issue) => issue.code === "archive_empty"), true);
  assert.equal(report.issues.some((issue) => issue.code === "scan_stale"), true);
  assert.equal(report.issues.some((issue) => issue.code === "redis_unhealthy"), true);
  assert.equal(report.issues.some((issue) => issue.code === "worker_down"), true);
  assert.equal(report.issues.some((issue) => issue.code === "coverage_collapsed"), true);
  assert.equal(report.score < 100, true);
});
