import assert from "node:assert/strict";
import test from "node:test";
import {
  CandidateShadowCaptureSourceWriter,
  hashShadowCandidatePayload,
  type ShadowCandidateObservationV1,
} from "./shadow-capture-source";
import type {
  PostgresTransactionAdapter,
  TransactionContext,
  TransactionOptions,
} from "./transaction-adapter";

function fixture(): ShadowCandidateObservationV1 {
  return {
    schemaVersion: "shadow-candidate-observation.v1",
    canonicalInstrumentId: "BINANCE:BTCUSDT:PERPETUAL",
    venueContext: {
      schemaVersion: "shadow-venue-context.v1",
      venue: "BINANCE",
      venueInstrumentId: "BTCUSDT",
      contractType: "perpetual",
      settlementAsset: "USDT",
      resolutionStatus: "resolved",
      identityEvidenceIds: ["synthetic:identity:btc"],
    },
    firstSeenAt: "2026-07-12T00:00:00.000Z",
    lastSeenAt: "2026-07-12T00:01:00.000Z",
    observationPrice: "100",
    observationPriceFactId: "fact:btc:1",
    discoveryReasons: ["volume_expansion"],
    priorityTier: "A",
    maturity: "deep_candidate",
    directionState: "unknown",
    expiresAt: "2026-07-13T00:00:00.000Z",
    releaseId: "shadow-rehearsal-v1",
    sourceScanCycleId: "scan-1",
  };
}

function subject() {
  const calls: Array<{ params: unknown[]; sql: string }> = [];
  const tx: TransactionContext = {
    async query<T>(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (sql.includes("WITH inserted AS")) return { rows: [{ inserted: true }] as T[] };
      if (sql.includes("enqueue_shadow_candidate_outbox_v2")) {
        return {
          rows: [{
            outbox_id: "018f47d6-2c40-7e30-8a20-000000000001",
            payload_hash: params[5],
            status: "pending",
          }] as T[],
        };
      }
      return { rows: [] as T[] };
    },
    async withSavepoint<T>(work: (nested: TransactionContext) => Promise<T>) {
      return work(tx);
    },
  };
  const transactions: PostgresTransactionAdapter = {
    async withTransaction<T>(
      _options: TransactionOptions,
      work: (context: TransactionContext) => Promise<T>,
    ) {
      return work(tx);
    },
  };
  return { calls, transactions };
}

test("source writer stores immutable scan archive and candidate outbox in one transaction", async () => {
  const mock = subject();
  const writer = new CandidateShadowCaptureSourceWriter(mock.transactions, {
    generateId: () => "018f47d6-2c40-7e30-8a20-000000000001",
  });
  const candidate = fixture();
  const result = await writer.persist({
    legacyScope: "production",
    candidateScope: "production_radar",
    migrationId: "candidate-episode-v1",
    authorityEpoch: 2,
    summary: {
      id: "scan-1",
      source: "coinglass",
      status: "ready",
      generatedAt: "2026-07-12T00:01:00.000Z",
      scannedCount: 24,
      anomalyCount: 2,
      candidateCount: 1,
      topSymbols: ["BTCUSDT"],
      notes: [],
    },
    replayFrame: {
      id: "scan-1",
      source: "coinglass",
      status: "ready",
      generatedAt: "2026-07-12T00:01:00.000Z",
      nextScanAt: "2026-07-12T00:06:00.000Z",
      cadenceMinutes: 5,
      scannedCount: 24,
      anomalyCount: 2,
      candidateCount: 1,
      signals: [],
    },
    candidates: [candidate],
  });

  assert.equal(result.sourceInserted, true);
  assert.equal(result.outbox.length, 1);
  assert.match(mock.calls[0]!.sql, /insert into scan_archives/i);
  assert.match(mock.calls[1]!.sql, /enqueue_shadow_candidate_outbox_v2/);
  assert.equal(mock.calls[1]!.params[5], hashShadowCandidatePayload(candidate));
  assert.equal(mock.calls[1]!.params[7], "candidate-episode-v1");
  assert.equal(mock.calls[1]!.params[8], 2);
});

test("source writer rejects duplicate identity and trade-plan maturity before opening a transaction", async () => {
  const mock = subject();
  const writer = new CandidateShadowCaptureSourceWriter(mock.transactions);
  const candidate = fixture();
  const base = {
    legacyScope: "production",
    candidateScope: "production_radar" as const,
    migrationId: "candidate-episode-v1",
    authorityEpoch: 2,
    summary: {
      id: "scan-1",
      source: "coinglass" as const,
      status: "ready" as const,
      generatedAt: "2026-07-12T00:01:00.000Z",
      scannedCount: 24,
      anomalyCount: 2,
      candidateCount: 1,
      topSymbols: ["BTCUSDT"],
      notes: [],
    },
    replayFrame: {
      id: "scan-1",
      source: "coinglass" as const,
      status: "ready" as const,
      generatedAt: "2026-07-12T00:01:00.000Z",
      nextScanAt: "2026-07-12T00:06:00.000Z",
      cadenceMinutes: 5,
      scannedCount: 24,
      anomalyCount: 2,
      candidateCount: 1,
      signals: [],
    },
  };

  await assert.rejects(
    () => writer.persist({ ...base, candidates: [candidate, candidate] }),
    /duplicate_candidate_identity/,
  );
  await assert.rejects(
    () => writer.persist({
      ...base,
      candidates: [{ ...candidate, maturity: "trade_plan_ready" } as never],
    }),
    /shadow_maturity_not_candidate_only/,
  );
  await assert.rejects(
    () => writer.persist({
      ...base,
      candidates: [{ ...candidate, maturity: "evidence_observe" } as never],
    }),
    /shadow_maturity_not_candidate_only/,
  );
  await assert.rejects(
    () => writer.persist({
      ...base,
      candidates: [{ ...candidate, directionState: "long" } as never],
    }),
    /direction_state_invalid/,
  );
  await assert.rejects(
    () => writer.persist({
      ...base,
      candidates: [{
        ...candidate,
        venueContext: {
          ...candidate.venueContext,
          tradePlan: { entry: 100 },
        },
      } as never],
    }),
    /venue_context_keys_invalid/,
  );
  await assert.rejects(
    () => writer.persist({
      ...base,
      candidates: [{
        ...candidate,
        venueContext: {
          ...candidate.venueContext,
          resolutionStatus: "unresolved",
        },
      } as never],
    }),
    /venue_context_identity_unresolved/,
  );
  assert.equal(mock.calls.length, 0);
});

test("shadow payload hash is canonical and excludes strategy or outcome fields by exact-key validation", () => {
  const candidate = fixture();
  const reordered = Object.fromEntries(Object.entries(candidate).reverse()) as ShadowCandidateObservationV1;
  assert.equal(hashShadowCandidatePayload(candidate), hashShadowCandidatePayload(reordered));
  assert.match(hashShadowCandidatePayload(candidate), /^sha256:[a-f0-9]{64}$/);
});
