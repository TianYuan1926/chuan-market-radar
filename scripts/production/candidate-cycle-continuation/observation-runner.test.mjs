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
    schemaVersion: "candidate-validation-cycle-observation-sample.v2",
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
        authorityEpoch: 1,
        expectedReleaseId: expected.releaseId,
      },
      monitor: {
        status: "ready",
        migrationId: expected.migrationId,
        phase: "shadow_capture",
        authorityEpoch: 1,
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
    database: {
      lockWaiters: 0,
      longTransactions: 0,
    },
  };
}

test("cycle sample binds runtime, monitor, database, and health truth", () => {
  assert.equal(validateCycleObservationSample(sample(0), expected).epoch, 1);
  assert.throws(() => validateCycleObservationSample({
    ...sample(0), health: { ...sample(0).health, scanFreshness: "aging" },
  }, expected), /sample_scan_not_fresh/u);
  assert.throws(() => validateCycleObservationSample({
    ...sample(0), candidate: {
      ...sample(0).candidate,
      monitor: { ...sample(0).candidate.monitor, warnings: ["retry_wait_present"] },
    },
  }, expected), /sample_monitor_warning/u);
  assert.throws(() => validateCycleObservationSample({
    ...sample(0), database: { lockWaiters: 1, longTransactions: 0 },
  }, expected), /sample_database_lock_waiters/u);
  assert.throws(() => validateCycleObservationSample({
    ...sample(0), migrationId: "candidate-episode-v1",
  }, expected), /sample_cycle_mismatch/u);
  assert.throws(() => validateCycleObservationSample({
    ...sample(0), unresolvedOutbox: 1,
  }, expected), /sample_unresolved_outbox/u);
});

test("10000 writes and 30 minutes cannot replace fresh 24 hour activation", () => {
  const samples = Array.from({ length: 7 }, (_, index) => sample(
    index,
    index < 2 ? 9_990 : index < 4 ? 9_995 : 10_005,
  ));
  const result = evaluateCycleObservation(samples, expected);
  assert.equal(result.status, "IN_PROGRESS_FRESH_ACTIVATION_OBSERVATION");
  assert.equal(result.accumulationReady, true);
  assert.equal(result.freshActivationReady, false);
  assert.equal(result.g0Completed, false);
});

test("fresh 289 sample 24 hour activation cannot replace 10000 real writes", () => {
  const samples = Array.from({ length: 289 }, (_, index) => sample(index, 9_000 + index));
  const result = evaluateCycleObservation(samples, expected);
  assert.equal(result.status, "IN_PROGRESS_ACCUMULATING_REAL_WRITES");
  assert.equal(result.freshActivationReady, true);
  assert.equal(result.accumulationReady, false);
  assert.equal(result.activationSamples, 289);
  assert.equal(result.activationCoverageSeconds, 86_400);
});

test("fresh activation and real-write accumulation must both pass", () => {
  const samples = Array.from({ length: 289 }, (_, index) => sample(
    index,
    index < 2 ? 9_990 : index < 4 ? 9_995 : 10_005,
  ));
  const result = evaluateCycleObservation(samples, expected);
  assert.equal(result.status, "PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE");
  assert.equal(result.completedWrites, 10_005);
  assert.equal(result.completionAdvances, 2);
  assert.equal(result.freshActivationReady, true);
  assert.equal(result.accumulationReady, true);
  assert.equal(result.thresholdsChanged, false);
  assert.equal(result.productionReconciliationExecuted, false);
  assert.equal(result.g0Completed, false);
});

test("thresholds cannot be lowered and deadline exhaustion never fabricates PASS", () => {
  const samples = Array.from({ length: 7 }, (_, index) => ({
    ...sample(index, 9_000 + index),
    deadlineAt: "2026-07-17T06:00:00.000Z",
  }));
  const result = evaluateCycleObservation(samples, expected);
  assert.equal(result.status, "FAIL_CYCLE_CAPACITY_EXHAUSTED_REQUIRES_NEXT_ADJACENT_CYCLE");
  assert.throws(() => evaluateCycleObservation(samples, expected, {
    minimumComparedWrites: 9_000,
  }), /minimum_compared_writes_cannot_change/u);
  assert.throws(() => evaluateCycleObservation(samples, expected, {
    minimumActivationSamples: 288,
  }), /minimum_activation_samples_cannot_lower/u);
  assert.throws(() => evaluateCycleObservation(samples, expected, {
    minimumActivationHours: 23,
  }), /minimum_activation_window_cannot_shorten/u);
});

test("sample gaps epoch drift and write regression invalidate the window", () => {
  const samples = Array.from({ length: 7 }, (_, index) => sample(index, 9_000 + index));
  assert.throws(() => evaluateCycleObservation(samples.map((value, index) => (
    index === 4 ? {
      ...value,
      epoch: 3,
      candidate: {
        ...value.candidate,
        runtime: { ...value.candidate.runtime, authorityEpoch: 3 },
        monitor: { ...value.candidate.monitor, authorityEpoch: 3 },
      },
    } : value
  )), expected), /observation_epoch_drift/u);
  assert.throws(() => evaluateCycleObservation(samples.map((value, index) => (
    index === 4 ? {
      ...value,
      completedWrites: 1,
      candidate: {
        ...value.candidate,
        monitor: {
          ...value.candidate.monitor,
          metrics: { ...value.candidate.monitor.metrics, outboxCompletedTotal: 1 },
        },
      },
    } : value
  )), expected), /observation_completed_writes_regressed/u);
});
