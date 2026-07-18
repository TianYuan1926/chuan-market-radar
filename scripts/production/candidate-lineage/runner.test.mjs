import assert from "node:assert/strict";
import test from "node:test";

import { evaluateCycleObservation } from
  "../candidate-cycle-continuation/observation-runner.mjs";
import {
  buildCandidateLineageEvidence,
  LINEAGE_PASS,
  validateCandidateLineageEvidence,
} from "./runner.mjs";

const unifiedExpected = {
  authorityEpoch: 1,
  commit: "b".repeat(40),
  migrationId: "candidate-episode-v1-cycle-3",
  releaseId: "candidate-shadow-lineage-cycle-3",
};

function completedAt(index) {
  return 2_957 + Math.floor(index * (10_020 - 2_957) / 288);
}

function unifiedSample(index) {
  const completedWrites = completedAt(index);
  return {
    schemaVersion: "candidate-validation-cycle-observation-sample.v2",
    sampledAt: new Date(Date.parse("2026-07-15T00:00:00.000Z") + index * 300_000)
      .toISOString(),
    commit: unifiedExpected.commit,
    migrationId: unifiedExpected.migrationId,
    releaseId: unifiedExpected.releaseId,
    phase: "shadow_capture",
    epoch: unifiedExpected.authorityEpoch,
    deadlineAt: "2026-07-18T00:00:00.000Z",
    completedWrites,
    unresolvedOutbox: 0,
    activeCycles: 1,
    health: {
      ok: true,
      level: "ready",
      scanFreshness: "fresh",
      database: "ready",
      redis: "healthy",
      candidateWorker: "healthy",
      workersHealthy: true,
    },
    candidate: {
      ok: true,
      mode: "active",
      runtime: {
        enabled: true,
        blockers: [],
        authorityEpoch: unifiedExpected.authorityEpoch,
        expectedReleaseId: unifiedExpected.releaseId,
      },
      monitor: {
        status: "ready",
        phase: "shadow_capture",
        migrationId: unifiedExpected.migrationId,
        authorityEpoch: unifiedExpected.authorityEpoch,
        blockers: [],
        warnings: [],
        metrics: {
          outboxRetryWaitTotal: 0,
          outboxQuarantinedTotal: 0,
          unresolvedQuarantineTotal: 0,
          unresolvedTotal: 0,
          oldestPendingAgeSeconds: null,
          outboxCompletedTotal: completedWrites,
        },
      },
    },
    database: { lockWaiters: 0, longTransactions: 0 },
  };
}

function fixture() {
  const samples = Array.from({ length: 289 }, (_, index) => unifiedSample(index));
  return {
    unified: {
      expected: unifiedExpected,
      final: evaluateCycleObservation(samples, unifiedExpected),
      samples,
    },
    database: {
      controls: [
        {
          authorityEpoch: 6,
          deadlineAt: "2026-07-14T00:00:00.000Z",
          migrationId: "candidate-episode-v1",
          phase: "legacy",
          releaseId: "candidate-shadow-lineage-cycle-1",
          startedAt: "2026-07-11T00:00:00.000Z",
          writeFrozen: true,
        },
        {
          authorityEpoch: 2,
          deadlineAt: "2026-07-15T00:00:00.000Z",
          migrationId: "candidate-episode-v1-cycle-2",
          phase: "legacy",
          releaseId: "candidate-shadow-lineage-cycle-2",
          startedAt: "2026-07-12T00:00:00.000Z",
          writeFrozen: true,
        },
        {
          authorityEpoch: unifiedExpected.authorityEpoch,
          deadlineAt: "2026-07-18T00:00:00.000Z",
          migrationId: unifiedExpected.migrationId,
          phase: "shadow_capture",
          releaseId: unifiedExpected.releaseId,
          startedAt: "2026-07-15T00:00:00.000Z",
          writeFrozen: false,
        },
      ],
      releaseCompletedWrites: [
        { completedWrites: 2_957, releaseId: "candidate-shadow-lineage-cycle-1" },
        { completedWrites: 0, releaseId: "candidate-shadow-lineage-cycle-2" },
        { completedWrites: 7_063, releaseId: unifiedExpected.releaseId },
      ],
      statusCounts: {
        claimed: 0,
        completed: 10_020,
        outsideLineage: 0,
        pending: 0,
        resolvedQuarantine: 0,
        retryWait: 0,
        unresolvedQuarantine: 0,
        unresolvedTotal: 0,
      },
    },
  };
}

test("lineage evidence is rebuilt from one Cycle-3 observation and all database controls", () => {
  const result = buildCandidateLineageEvidence(fixture());
  assert.equal(result.status, LINEAGE_PASS);
  assert.equal(result.completedWrites, 10_020);
  assert.equal(result.activationSamples, 289);
  assert.equal(result.activationCoverageSeconds, 86_400);
  assert.equal(result.maximumSampleGapSeconds, 600);
  assert.equal(result.minimumCompletionAdvances, 2);
  assert.equal(result.unresolvedMaximum, 0);
  assert.equal(result.sourceReleaseWindows.length, 3);
  assert.deepEqual(result.sourceReleaseWindows.map((window) => ({
    cycle: window.migrationId,
    epoch: window.controlEpoch,
    phase: window.phase,
    frozen: window.writeFrozen,
  })), [
    { cycle: "candidate-episode-v1", epoch: 6, phase: "legacy", frozen: true },
    { cycle: "candidate-episode-v1-cycle-2", epoch: 2, phase: "legacy", frozen: true },
    { cycle: "candidate-episode-v1-cycle-3", epoch: 1,
      phase: "shadow_capture", frozen: false },
  ]);
  assert.equal(validateCandidateLineageEvidence(result), result);
  for (const key of [
    "unifiedEvidenceSha256", "unifiedSamplesSha256", "controlSnapshotSha256",
  ]) assert.match(result[key], /^[0-9a-f]{64}$/u);
});

test("only a recomputed v2 Cycle-3 PASS can become unified lineage evidence", () => {
  const wrongCycle = fixture();
  wrongCycle.unified.expected = {
    ...wrongCycle.unified.expected,
    migrationId: "candidate-episode-v1-cycle-2",
  };
  assert.throws(() => buildCandidateLineageEvidence(wrongCycle), /unified_cycle_not_cycle3/u);

  const tampered = fixture();
  tampered.unified.final.completedWrites = 99_999;
  assert.throws(() => buildCandidateLineageEvidence(tampered),
    /unified_final_recompute_mismatch/u);

  const historicalSchema = fixture();
  historicalSchema.unified.samples[0].schemaVersion =
    "candidate-validation-cycle-observation-sample.v1";
  assert.throws(() => buildCandidateLineageEvidence(historicalSchema),
    /sample_schema_invalid/u);
});

test("three-control lineage, frozen history, and zero unresolved state fail closed", () => {
  const missing = fixture();
  missing.database.controls.shift();
  missing.database.releaseCompletedWrites.shift();
  assert.throws(() => buildCandidateLineageEvidence(missing), /database_controls_invalid/u);

  const relabeledHistory = fixture();
  relabeledHistory.database.controls[1].phase = "shadow_capture";
  relabeledHistory.database.controls[1].writeFrozen = false;
  assert.throws(() => buildCandidateLineageEvidence(relabeledHistory),
    /database_retired_control_not_frozen/u);

  const outside = fixture();
  outside.database.statusCounts.outsideLineage = 1;
  assert.throws(() => buildCandidateLineageEvidence(outside), /database_outsideLineage_not_zero/u);

  const aggregateDrift = fixture();
  aggregateDrift.database.releaseCompletedWrites[2].completedWrites = 7_062;
  assert.throws(() => buildCandidateLineageEvidence(aggregateDrift),
    /database_completed_aggregate_mismatch/u);
});

test("future-stage claims remain false after lineage capture", () => {
  const lineage = buildCandidateLineageEvidence(fixture());
  assert.throws(() => validateCandidateLineageEvidence({
    ...lineage, productionReconciliationExecuted: true,
  }), /lineage_future_stage_claim_invalid/u);
});
