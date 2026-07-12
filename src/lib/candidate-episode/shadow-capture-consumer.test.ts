import assert from "node:assert/strict";
import test from "node:test";
import {
  CandidateShadowCaptureConsumer,
  ShadowCaptureHardStopError,
  type ShadowCaptureMetric,
} from "./shadow-capture-consumer";
import { hashShadowCandidatePayload, type ShadowCandidateObservationV1 } from "./shadow-capture-source";
import type { CandidateOutboxClaim } from "./outbox-service";

function payload(): ShadowCandidateObservationV1 {
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
    observationPriceFactId: "fact:1",
    discoveryReasons: ["volume_expansion"],
    priorityTier: "A",
    maturity: "deep_candidate",
    directionState: "unknown",
    expiresAt: "2026-07-13T00:00:00.000Z",
    releaseId: "shadow-rehearsal-v1",
    sourceScanCycleId: "scan-1",
  };
}

function claim(overrides: Partial<CandidateOutboxClaim> = {}): CandidateOutboxClaim {
  const value = payload();
  return {
    outboxId: "018f47d6-2c40-7e30-8a20-000000000001",
    scope: "production_radar",
    sourceType: "legacy_scan_candidate",
    sourceId: "scan-1:BINANCE:BTCUSDT:PERPETUAL",
    sourceVersion: "2026-07-12T00:01:00.000Z",
    payloadVersion: "shadow-candidate-observation.v1",
    payload: value,
    payloadHash: hashShadowCandidatePayload(value),
    idempotencyKey: "shadow-capture:scan-1:BINANCE:BTCUSDT:PERPETUAL",
    status: "claimed",
    attemptCount: 1,
    maxAttempts: 8,
    nextAttemptAt: null,
    runtimeId: "shadow-runtime-a",
    claimExpiresAt: "2026-07-12T00:06:00.000Z",
    fencingToken: 1,
    errorClass: null,
    errorMessageRedacted: null,
    createdAt: "2026-07-12T00:00:30.000Z",
    completedAt: null,
    quarantinedAt: null,
    migrationId: "candidate-episode-v1",
    authorityEpoch: 2,
    ...overrides,
  };
}

type SubjectOptions = {
  claims?: CandidateOutboxClaim[];
  projectionError?: unknown;
  completeError?: unknown;
  retryStatus?: "retry_wait" | "quarantined";
};

function subject({
  claims = [claim()],
  projectionError,
  completeError,
  retryStatus = "retry_wait" as "retry_wait" | "quarantined",
}: SubjectOptions = {}) {
  const calls: string[] = [];
  const metrics: ShadowCaptureMetric[] = [];
  const consumer = new CandidateShadowCaptureConsumer({
    outbox: {
      async claimShadowCandidates() {
        calls.push("claim");
        return claims;
      },
      async complete() {
        calls.push("complete");
        if (completeError) throw completeError;
        return { outboxId: claims[0]!.outboxId, status: "completed" as const };
      },
      async retryOrQuarantine() {
        calls.push("retryOrQuarantine");
        return { outboxId: claims[0]!.outboxId, status: retryStatus };
      },
      async quarantine() {
        calls.push("quarantine");
        return { outboxId: claims[0]!.outboxId, status: "quarantined" as const };
      },
    },
    episodes: {
      async openOrRefreshEpisode(command) {
        calls.push(`project:${command.idempotencyKey}`);
        if (projectionError) throw projectionError;
        return { episodeId: "episode-1", created: true, rowVersion: 1 };
      },
    },
    onMetric: (metric) => metrics.push(metric),
  });
  return { calls, consumer, metrics };
}

test("consumer projects and completes only legacy candidate claims", async () => {
  const testSubject = subject();
  const result = await testSubject.consumer.runBatch({
    scope: "production_radar",
    runtimeId: "shadow-runtime-a",
    now: "2026-07-12T00:02:00.000Z",
    limit: 10,
    migrationId: "candidate-episode-v1",
    authorityEpoch: 2,
  });
  assert.deepEqual(testSubject.calls, [
    "claim",
    "project:shadow-projection:018f47d6-2c40-7e30-8a20-000000000001",
    "complete",
  ]);
  assert.equal(result.completed, 1);
  assert.equal(testSubject.metrics[0]?.name, "shadow_projection_success_total");
  assert.equal("payload" in testSubject.metrics[0]!, false);
});

test("invalid payload is quarantined without projection", async () => {
  const invalid = claim({ payload: { ...payload(), tradePlan: { entry: 100 } } });
  const testSubject = subject({ claims: [invalid] });
  const result = await testSubject.consumer.runBatch({
    scope: "production_radar",
    runtimeId: "shadow-runtime-a",
    now: "2026-07-12T00:02:00.000Z",
    limit: 10,
    migrationId: "candidate-episode-v1",
    authorityEpoch: 2,
  });
  assert.deepEqual(testSubject.calls, ["claim", "quarantine"]);
  assert.equal(result.quarantined, 1);
});

test("temporary failure retries and the eighth failure quarantines", async () => {
  const temporary = Object.assign(new Error("connection reset"), { code: "08006" });
  const retrySubject = subject({ projectionError: temporary });
  const retryResult = await retrySubject.consumer.runBatch({
    scope: "production_radar",
    runtimeId: "shadow-runtime-a",
    now: "2026-07-12T00:02:00.000Z",
    limit: 10,
    migrationId: "candidate-episode-v1",
    authorityEpoch: 2,
  });
  assert.equal(retryResult.retryWait, 1);

  const exhaustedSubject = subject({
    claims: [claim({ attemptCount: 8 })],
    projectionError: temporary,
    retryStatus: "quarantined",
  });
  const exhausted = await exhaustedSubject.consumer.runBatch({
    scope: "production_radar",
    runtimeId: "shadow-runtime-a",
    now: "2026-07-12T00:02:00.000Z",
    limit: 10,
    migrationId: "candidate-episode-v1",
    authorityEpoch: 2,
  });
  assert.equal(exhausted.quarantined, 1);
  assert.equal(exhaustedSubject.metrics[0]?.name, "outbox_attempt_exhausted_total");
});

test("payload hash conflict quarantines and hard-stops the batch", async () => {
  const conflict = claim({ payloadHash: `sha256:${"f".repeat(64)}` });
  const testSubject = subject({ claims: [conflict] });
  await assert.rejects(
    () => testSubject.consumer.runBatch({
      scope: "production_radar",
      runtimeId: "shadow-runtime-a",
      now: "2026-07-12T00:02:00.000Z",
      limit: 10,
      migrationId: "candidate-episode-v1",
      authorityEpoch: 2,
    }),
    ShadowCaptureHardStopError,
  );
  assert.deepEqual(testSubject.calls, ["claim", "quarantine"]);
  assert.equal(testSubject.metrics[0]?.name, "outbox_payload_hash_conflict_total");
});

test("stale completion after idempotent projection leaves the item for the current lease owner", async () => {
  const stale = Object.assign(new Error("stale fence"), { code: "40001" });
  const testSubject = subject({ completeError: stale });
  const result = await testSubject.consumer.runBatch({
    scope: "production_radar",
    runtimeId: "shadow-runtime-a",
    now: "2026-07-12T00:02:00.000Z",
    limit: 10,
    migrationId: "candidate-episode-v1",
    authorityEpoch: 2,
  });
  assert.equal(result.leaseLost, 1);
  assert.equal(testSubject.calls.includes("retryOrQuarantine"), false);
});
