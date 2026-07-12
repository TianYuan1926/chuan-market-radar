import assert from "node:assert/strict";
import test from "node:test";
import type { MarketRadarSnapshot, ScanArchiveSummary, ScanReplayFrame } from "../market/types";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import {
  CandidateShadowCaptureComposition,
  CANDIDATE_SHADOW_MIGRATION_ID,
} from "./shadow-capture-composition";
import type { PostgresTransactionAdapter, TransactionContext } from "./transaction-adapter";

const generatedAt = "2026-07-12T00:00:00.000Z";

function summary(): ScanArchiveSummary {
  return {
    anomalyCount: 1,
    candidateCount: 1,
    generatedAt,
    id: "scan-composition-1",
    notes: [],
    scannedCount: 1,
    source: "coinglass",
    status: "ready",
    topSymbols: ["BTCUSDT"],
  };
}

function replayFrame(): ScanReplayFrame {
  return {
    anomalyCount: 1,
    cadenceMinutes: 5,
    candidateCount: 1,
    generatedAt,
    id: "scan-composition-1",
    nextScanAt: "2026-07-12T00:05:00.000Z",
    scannedCount: 1,
    signals: [],
    source: "coinglass",
    status: "ready",
  };
}

function snapshot(): MarketRadarSnapshot {
  return {
    derivatives: [],
    heatmap: [],
    instrumentPool: {
      instruments: [],
      rejected: [],
      summary: {
        accepted: 1,
        duplicatesRemoved: 0,
        marketTypes: ["perpetual"],
        minVolume24hUsd: 0,
        quoteAssets: ["USDT"],
        rejected: 0,
        total: 1,
      },
    },
    instruments: [{
      baseAsset: "BTC",
      exchange: "BINANCE",
      id: "BINANCE:BTCUSDT:PERPETUAL",
      isActive: true,
      lastSeenAt: generatedAt,
      marketType: "perpetual",
      quoteAsset: "USDT",
      symbol: "BTCUSDT",
      tags: [],
      volume24hUsd: 1_000_000,
    }],
    journalEvents: [],
    metadata: {
      anomalyCount: 1,
      cadenceMinutes: 5,
      candidateCount: 1,
      generatedAt,
      id: "scan-composition-1",
      isRealtime: true,
      lightScan: {
        acceptedCount: 1,
        candidateCount: 1,
        generatedAt,
        notes: [],
        requestCount: 1,
        source: "binance",
        status: "ready",
        topCandidates: [{
          baseAsset: "BTC",
          changePercent24h: 4,
          distanceFromHighPercent: 2,
          distanceFromLowPercent: 8,
          price: 100,
          reasons: ["volume expansion"],
          score: 82,
          state: "HOT",
          symbol: "BTCUSDT",
          volatilityPercent: 4,
          volume24hUsd: 1_000_000,
        }],
        universeCount: 1,
      },
      mode: "scheduled",
      nextScanAt: "2026-07-12T00:05:00.000Z",
      notes: [],
      riskGate: "on",
      scannedCount: 1,
      source: "composite",
      staleAfterMinutes: 15,
      status: "ready",
    },
    signals: [],
    tickers: [{
      changePercent24h: 4,
      exchange: "BINANCE",
      high24h: 104,
      low24h: 96,
      price: 100,
      symbol: "BTCUSDT",
      updatedAt: generatedAt,
      volume24hUsd: 1_000_000,
    }],
  };
}

function transactionAdapter({ controlReadFails = false } = {}) {
  const sql: string[] = [];
  const adapter: PostgresTransactionAdapter = {
    async withTransaction(_options, work) {
      const tx: TransactionContext = {
        async query<T>(statement: string, params: unknown[] = []) {
          sql.push(statement);
          if (/candidate_migration_control/.test(statement)) {
            if (controlReadFails) throw new Error("synthetic control read failure");
            return { rows: [{
              approved_release_id: "release-composition-1",
              database_now: generatedAt,
              deadline_at: "2026-07-13T00:00:00.000Z",
              epoch: 3,
              phase: "shadow_capture",
              write_frozen: false,
            }] as T[] };
          }
          if (/INSERT INTO scan_archives/.test(statement)) {
            return { rows: [{ inserted: true }] as T[] };
          }
          if (/enqueue_shadow_candidate_outbox_v2/.test(statement)) {
            return { rows: [{
              outbox_id: "018f47d6-2c40-7e30-8a20-000000000002",
              payload_hash: String(params[5]),
              status: "pending",
            }] as T[] };
          }
          return { rows: [] as T[] };
        },
        async withSavepoint<T>(nested: (context: TransactionContext) => Promise<T>) {
          return nested(tx);
        },
      };
      return work(tx);
    },
  };
  return { adapter, sql };
}

test("production composition stays dormant when environment intent is true but code authorization is false", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "chuan-prod" });
  const transactions = transactionAdapter();
  const composition = new CandidateShadowCaptureComposition({
    codeActivationAllowed: false,
    env: {
      CANDIDATE_EPISODE_SHADOW_WRITE: "true",
      CANDIDATE_RUNTIME_RELEASE_ID: "release-composition-1",
    },
    now: () => new Date(generatedAt),
    repository,
    consumerTransactions: transactions.adapter,
    monitorTransactions: transactions.adapter,
    sourceTransactions: transactions.adapter,
  });

  const result = await composition.persistScanArchive(summary(), replayFrame(), snapshot());

  assert.equal(result.runtime.mode, "dormant");
  assert.equal(result.runtime.blockers.includes("release_not_authorized_in_code"), true);
  assert.equal((await repository.listScanArchives())[0]?.id, "scan-composition-1");
  assert.equal(transactions.sql.some((sql) => /enqueue_shadow_candidate_outbox_v2/.test(sql)), false);
});

test("authorized composition atomically writes immutable archive and source outbox before forward-map support", async () => {
  const memory = createMemoryPersistenceRepository({ scope: "chuan-prod" });
  let legacyArchiveCalls = 0;
  let forwardMapCalls = 0;
  const repository = {
    ...memory,
    mode: "database" as const,
    async addScanArchive(...args: Parameters<typeof memory.addScanArchive>) {
      legacyArchiveCalls += 1;
      return memory.addScanArchive(...args);
    },
    async addV3ForwardMapSnapshots(frame: ScanReplayFrame) {
      forwardMapCalls += 1;
      return memory.addV3ForwardMapSnapshots(frame);
    },
  };
  const transactions = transactionAdapter();
  const composition = new CandidateShadowCaptureComposition({
    codeActivationAllowed: true,
    env: {
      CANDIDATE_EPISODE_SHADOW_WRITE: "true",
      CANDIDATE_RUNTIME_RELEASE_ID: "release-composition-1",
    },
    now: () => new Date(generatedAt),
    repository,
    consumerTransactions: transactions.adapter,
    monitorTransactions: transactions.adapter,
    sourceTransactions: transactions.adapter,
  });

  const result = await composition.persistScanArchive(summary(), replayFrame(), snapshot());
  assert.equal(legacyArchiveCalls, 0);
  assert.equal(forwardMapCalls, 1);
  assert.equal(result.runtime.mode, "active");
  assert.equal(result.mapping?.observations.length, 1);
  assert.equal(transactions.sql.some((sql) => /INSERT INTO scan_archives/.test(sql)), true);
  assert.equal(transactions.sql.some((sql) => /enqueue_shadow_candidate_outbox_v2/.test(sql)), true);
});

test("control read failure fails closed to legacy archive without candidate writes", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "chuan-prod" });
  const transactions = transactionAdapter({ controlReadFails: true });
  const composition = new CandidateShadowCaptureComposition({
    codeActivationAllowed: true,
    env: {
      CANDIDATE_EPISODE_SHADOW_WRITE: "true",
      CANDIDATE_RUNTIME_RELEASE_ID: "release-composition-1",
    },
    repository,
    consumerTransactions: transactions.adapter,
    monitorTransactions: transactions.adapter,
    sourceTransactions: transactions.adapter,
  });

  const result = await composition.persistScanArchive(summary(), replayFrame(), snapshot());
  assert.equal(result.runtime.blockers.includes("control_read_failed"), true);
  assert.equal((await repository.listScanArchives()).length, 1);
  assert.equal(transactions.sql.some((sql) => /enqueue_shadow_candidate_outbox_v2/.test(sql)), false);
  assert.equal(result.runtime.migrationId, CANDIDATE_SHADOW_MIGRATION_ID);
});

test("active composition hard-stops unresolved identity instead of silently dropping a candidate", async () => {
  const memory = createMemoryPersistenceRepository({ scope: "chuan-prod" });
  const repository = { ...memory, mode: "database" as const };
  const transactions = transactionAdapter();
  const composition = new CandidateShadowCaptureComposition({
    codeActivationAllowed: true,
    env: {
      CANDIDATE_EPISODE_SHADOW_WRITE: "true",
      CANDIDATE_RUNTIME_RELEASE_ID: "release-composition-1",
    },
    now: () => new Date(generatedAt),
    repository,
    consumerTransactions: transactions.adapter,
    monitorTransactions: transactions.adapter,
    sourceTransactions: transactions.adapter,
  });
  const unresolved = snapshot();
  unresolved.metadata.lightScan!.topCandidates.push({
    ...unresolved.metadata.lightScan!.topCandidates[0]!,
    symbol: "MISSINGUSDT",
  });

  await assert.rejects(
    () => composition.persistScanArchive(summary(), replayFrame(), unresolved),
    /shadow_candidate_identity_mapping_incomplete/,
  );
  assert.equal(transactions.sql.some((sql) => /INSERT INTO scan_archives/.test(sql)), false);
  assert.equal(transactions.sql.some((sql) => /enqueue_shadow_candidate_outbox_v2/.test(sql)), false);
});
