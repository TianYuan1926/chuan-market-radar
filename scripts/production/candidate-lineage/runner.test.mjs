import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCandidateLineageEvidence,
  LINEAGE_PASS,
  validateCandidateLineageEvidence,
} from "./runner.mjs";

const activationExpected = {
  authorityEpoch: 3,
  commit: "a".repeat(40),
  migrationId: "candidate-episode-v1",
  releaseId: "candidate-shadow-lineage-cycle-1",
};
const freshExpected = {
  authorityEpoch: 1,
  commit: "b".repeat(40),
  migrationId: "candidate-episode-v1-cycle-2",
  releaseId: "candidate-shadow-lineage-cycle-2",
};

function activationSample(index) {
  const completed = index + 1;
  return {
    schemaVersion: "candidate-shadow-observation-sample.v1",
    sampledAt: new Date(Date.parse("2026-07-11T00:00:00.000Z") + index * 300_000).toISOString(),
    commit: activationExpected.commit,
    releaseId: activationExpected.releaseId,
    health: {
      ok: true,
      level: "ready",
      scanFreshness: "fresh",
      databaseStatus: "ready",
      redisStatus: "healthy",
      workers: [
        "scanner-worker", "websocket-light-worker", "coinglass-worker", "signal-worker",
        "dynamic-scan-scheduler", "macro-worker", "candidate-shadow-worker",
      ].map((key) => ({ ageSec: 5, key, status: "healthy" })),
    },
    candidate: {
      ok: true,
      mode: "active",
      runtime: {
        enabled: true,
        blockers: [],
        authorityEpoch: activationExpected.authorityEpoch,
        expectedReleaseId: activationExpected.releaseId,
      },
      monitor: {
        status: "ready",
        phase: "shadow_capture",
        authorityEpoch: activationExpected.authorityEpoch,
        blockers: [],
        warnings: [],
        metrics: {
          outboxRetryWaitTotal: 0,
          unresolvedQuarantineTotal: 0,
          outboxQuarantinedTotal: 0,
          oldestPendingAgeSeconds: null,
          outboxCompletedTotal: completed,
        },
      },
    },
    database: { identityErrors: 0, lockWaiters: 0, longTransactions: 0 },
  };
}

function cycleSamples(expected, start, values, deadlineAt) {
  return values.map((completedWrites, index) => ({
    schemaVersion: "candidate-validation-cycle-observation-sample.v1",
    sampledAt: new Date(Date.parse(start) + index * 300_000).toISOString(),
    commit: expected.commit,
    migrationId: expected.migrationId,
    releaseId: expected.releaseId,
    phase: "shadow_capture",
    epoch: expected.authorityEpoch,
    deadlineAt,
    completedWrites,
    unresolvedOutbox: 0,
    activeCycles: 1,
    health: {
      level: "ready",
      scanFreshness: "fresh",
      database: "ready",
      redis: "healthy",
      candidateWorker: "healthy",
      workersHealthy: true,
    },
  }));
}

function fixture() {
  const activationSamples = Array.from({ length: 289 }, (_, index) => activationSample(index));
  const accumulationSamples = cycleSamples(
    activationExpected,
    "2026-07-13T00:00:00.000Z",
    [9_990, 9_990, 9_995, 9_995, 10_005, 10_005, 10_005],
    "2026-07-14T00:00:00.000Z",
  );
  const freshSamples = cycleSamples(
    freshExpected,
    "2026-07-13T01:05:00.000Z",
    [10_005, 10_005, 10_010, 10_010, 10_020, 10_020, 10_020],
    "2026-07-16T01:00:00.000Z",
  );
  const activationFinal = {
    status: "PASS_ACTIVATE_AND_OBSERVE",
    automaticPhaseAdvance: false,
    comparedWritesGateEvaluated: false,
    completedWrites: 289,
    coverageHours: 24,
    maximumGapSeconds: 300,
    sampleCount: 289,
  };
  const cycleFinal = (expected, samples, completedWrites) => ({
    schemaVersion: "candidate-validation-cycle-observation.v1",
    status: "PASS_ACCUMULATION_READY_FOR_FRESH_VERIFICATION_CYCLE",
    migrationId: expected.migrationId,
    releaseId: expected.releaseId,
    commit: expected.commit,
    authorityEpoch: expected.authorityEpoch,
    samples: 7,
    elapsedSeconds: 1800,
    completionAdvances: 2,
    completedWrites,
    minimumComparedWrites: 10_000,
    deadlineAt: samples[0].deadlineAt,
    deadlineRemainingSeconds: Math.floor(
      (Date.parse(samples[0].deadlineAt) - Date.parse(samples.at(-1).sampledAt)) / 1_000,
    ),
    unresolvedOutbox: 0,
    thresholdsChanged: false,
    productionReconciliationExecuted: false,
    shadowVerifyStarted: false,
    canonicalAuthorityChanged: false,
    g0Completed: false,
  });
  return {
    activation: {
      expected: activationExpected,
      final: activationFinal,
      samples: activationSamples,
    },
    accumulation: {
      expected: activationExpected,
      final: cycleFinal(activationExpected, accumulationSamples, 10_005),
      samples: accumulationSamples,
    },
    fresh: {
      expected: freshExpected,
      final: cycleFinal(freshExpected, freshSamples, 10_020),
      samples: freshSamples,
    },
    database: {
      controls: [
        {
          authorityEpoch: 4,
          deadlineAt: "2026-07-14T00:00:00.000Z",
          migrationId: activationExpected.migrationId,
          phase: "legacy",
          releaseId: activationExpected.releaseId,
          startedAt: "2026-07-11T00:00:00.000Z",
          writeFrozen: true,
        },
        {
          authorityEpoch: 1,
          deadlineAt: "2026-07-16T01:00:00.000Z",
          migrationId: freshExpected.migrationId,
          phase: "shadow_capture",
          releaseId: freshExpected.releaseId,
          startedAt: "2026-07-13T01:00:00.000Z",
          writeFrozen: false,
        },
      ],
      releaseCompletedWrites: [
        { completedWrites: 10_005, releaseId: activationExpected.releaseId },
        { completedWrites: 15, releaseId: freshExpected.releaseId },
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

test("lineage evidence is rebuilt from activation, accumulation, fresh-cycle, and database truth", () => {
  const result = buildCandidateLineageEvidence(fixture());
  assert.equal(result.status, LINEAGE_PASS);
  assert.equal(result.completedWrites, 10_020);
  assert.equal(result.sourceReleaseWindows.length, 2);
  assert.equal(result.sourceReleaseWindows[0].authorityEpoch, 3);
  assert.equal(result.sourceReleaseWindows[1].authorityEpoch, 1);
  assert.equal(validateCandidateLineageEvidence(result), result);
  for (const key of [
    "activationEvidenceSha256", "activationSamplesSha256",
    "accumulationEvidenceSha256", "accumulationSamplesSha256",
    "freshEvidenceSha256", "freshSamplesSha256", "controlSnapshotSha256",
  ]) assert.match(result[key], /^[0-9a-f]{64}$/u);
});

test("fresh cycle must be adjacent and must start after the accumulation PASS sample", () => {
  const sameCycle = fixture();
  sameCycle.fresh.expected = activationExpected;
  sameCycle.fresh.samples = sameCycle.fresh.samples.map((sample) => ({
    ...sample,
    commit: activationExpected.commit,
    epoch: activationExpected.authorityEpoch,
    migrationId: activationExpected.migrationId,
    releaseId: activationExpected.releaseId,
  }));
  sameCycle.fresh.final = {
    ...sameCycle.fresh.final,
    authorityEpoch: activationExpected.authorityEpoch,
    commit: activationExpected.commit,
    migrationId: activationExpected.migrationId,
    releaseId: activationExpected.releaseId,
  };
  assert.throws(() => buildCandidateLineageEvidence(sameCycle),
    /fresh_database_identity_mismatch|fresh_cycle_not_adjacent/u);

  const early = fixture();
  early.database.controls[1].startedAt = "2026-07-13T00:15:00.000Z";
  early.database.controls[1].deadlineAt = "2026-07-16T00:15:00.000Z";
  early.fresh.samples = early.fresh.samples.map((sample) => ({
    ...sample, deadlineAt: "2026-07-16T00:15:00.000Z",
  }));
  early.fresh.final.deadlineAt = "2026-07-16T00:15:00.000Z";
  early.fresh.final.deadlineRemainingSeconds = Math.floor(
    (Date.parse(early.fresh.final.deadlineAt)
      - Date.parse(early.fresh.samples.at(-1).sampledAt)) / 1_000,
  );
  assert.throws(() => buildCandidateLineageEvidence(early),
    /fresh_cycle_started_before_accumulation_pass/u);
});

test("missing control, outside-lineage rows, and completed aggregate drift fail closed", () => {
  const missing = fixture();
  missing.database.controls.shift();
  missing.database.releaseCompletedWrites.shift();
  assert.throws(() => buildCandidateLineageEvidence(missing), /database_controls_invalid/u);

  const outside = fixture();
  outside.database.statusCounts.outsideLineage = 1;
  assert.throws(() => buildCandidateLineageEvidence(outside), /database_outsideLineage_not_zero/u);

  const drift = fixture();
  drift.database.releaseCompletedWrites[1].completedWrites = 14;
  assert.throws(() => buildCandidateLineageEvidence(drift),
    /database_completed_aggregate_mismatch/u);
});

test("tampered raw evidence and future-stage lineage claims are rejected", () => {
  const input = fixture();
  input.accumulation.final.completedWrites = 99_999;
  assert.throws(() => buildCandidateLineageEvidence(input),
    /accumulation_final_recompute_mismatch/u);

  const lineage = buildCandidateLineageEvidence(fixture());
  assert.throws(() => validateCandidateLineageEvidence({
    ...lineage, productionReconciliationExecuted: true,
  }), /lineage_future_stage_claim_invalid/u);
});
