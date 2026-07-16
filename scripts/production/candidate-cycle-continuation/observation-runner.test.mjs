import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateCycleObservation,
  validateCycleObservationSample,
} from "./observation-runner.mjs";

const expected = {
  commit: "a".repeat(40),
  migrationId: "candidate-episode-v1-cycle-2",
  releaseId: "candidate-shadow-cycle-2-release",
};

function sample(index, completedWrites = 9_990) {
  const sampledAt = new Date(Date.parse("2026-07-17T00:00:00.000Z") + index * 300_000);
  return {
    schemaVersion: "candidate-validation-cycle-observation-sample.v1",
    sampledAt: sampledAt.toISOString(),
    commit: expected.commit,
    migrationId: expected.migrationId,
    releaseId: expected.releaseId,
    phase: "shadow_capture",
    epoch: 1,
    deadlineAt: "2026-07-20T00:00:00.000Z",
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
  };
}

test("cycle sample binds exact runtime identity and fails closed on degraded truth", () => {
  assert.equal(validateCycleObservationSample(sample(0), expected).epoch, 1);
  assert.throws(() => validateCycleObservationSample({
    ...sample(0), health: { ...sample(0).health, scanFreshness: "aging" },
  }, expected), /sample_scan_not_fresh/u);
  assert.throws(() => validateCycleObservationSample({
    ...sample(0), migrationId: "candidate-episode-v1",
  }, expected), /sample_cycle_mismatch/u);
  assert.throws(() => validateCycleObservationSample({
    ...sample(0), unresolvedOutbox: 1,
  }, expected), /sample_unresolved_outbox/u);
});

test("real 10000 write threshold needs stability and two completion advances", () => {
  const samples = Array.from({ length: 7 }, (_, index) => sample(
    index,
    index < 2 ? 9_990 : index < 4 ? 9_995 : 10_005,
  ));
  const result = evaluateCycleObservation(samples, expected);
  assert.equal(result.status, "PASS_ACCUMULATION_READY_FOR_FRESH_VERIFICATION_CYCLE");
  assert.equal(result.completedWrites, 10_005);
  assert.equal(result.completionAdvances, 2);
  assert.equal(result.thresholdsChanged, false);
  assert.equal(result.productionReconciliationExecuted, false);
  assert.equal(result.g0Completed, false);
});

test("threshold cannot be lowered and deadline exhaustion never fabricates PASS", () => {
  const samples = Array.from({ length: 7 }, (_, index) => ({
    ...sample(index, 9_000 + index),
    deadlineAt: "2026-07-17T06:00:00.000Z",
  }));
  const result = evaluateCycleObservation(samples, expected);
  assert.equal(result.status, "FAIL_CYCLE_CAPACITY_EXHAUSTED_REQUIRES_NEXT_ADJACENT_CYCLE");
  assert.throws(() => evaluateCycleObservation(samples, expected, {
    minimumComparedWrites: 9_000,
  }), /minimum_compared_writes_cannot_change/u);
});

test("sample gaps epoch drift and write regression invalidate the window", () => {
  const samples = Array.from({ length: 7 }, (_, index) => sample(index, 9_000 + index));
  assert.throws(() => evaluateCycleObservation(samples.map((value, index) => (
    index === 4 ? { ...value, epoch: 3 } : value
  )), expected), /observation_epoch_drift/u);
  assert.throws(() => evaluateCycleObservation(samples.map((value, index) => (
    index === 4 ? { ...value, completedWrites: 1 } : value
  )), expected), /observation_completed_writes_regressed/u);
});
