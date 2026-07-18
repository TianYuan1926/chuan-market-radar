import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCycleObservationHealth,
  evaluateCycleObservation,
  HEALTH_RECHECK_INTERVAL_SECONDS,
  MAXIMUM_DATABASE_BRACKET_SECONDS,
  MAXIMUM_HEALTH_RECHECK_SECONDS,
  validateCycleObservationSample,
} from "./observation-runner.mjs";

const expected = {
  commit: "a".repeat(40),
  migrationId: "candidate-episode-v1-cycle-2",
  releaseId: "candidate-shadow-cycle-2-release",
};

function sample(index, completedWrites = 9_990) {
  const sampledAt = new Date(Date.parse("2026-07-17T00:00:00.000Z") + index * 300_000);
  const beforeSampledAt = new Date(sampledAt.getTime() - 1_000);
  const databaseSnapshot = (databaseSampledAt) => ({
    sampledAt: databaseSampledAt.toISOString(),
    migrationId: expected.migrationId,
    releaseId: expected.releaseId,
    phase: "shadow_capture",
    epoch: 1,
    deadlineAt: "2026-07-20T00:00:00.000Z",
    completedWrites,
    unresolvedOutbox: 0,
    activeCycles: 1,
    database: {
      lockWaiters: 0,
      longTransactions: 0,
    },
  });
  return {
    schemaVersion: "candidate-validation-cycle-observation-sample.v3",
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
          outboxPendingTotal: 0,
          outboxClaimedTotal: 0,
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
    databaseWindow: {
      before: databaseSnapshot(beforeSampledAt),
      after: databaseSnapshot(sampledAt),
    },
  };
}

function healthSnapshot(changes = {}) {
  return {
    httpStatus: 200,
    bodyOk: true,
    level: "ready",
    scanFreshness: "fresh",
    database: "ready",
    redis: "healthy",
    candidateWorker: "healthy",
    workersHealthy: true,
    ...changes,
  };
}

test("health classifier accepts fresh and retries only the exact healthy aging boundary", () => {
  assert.equal(MAXIMUM_HEALTH_RECHECK_SECONDS, 180);
  assert.equal(HEALTH_RECHECK_INTERVAL_SECONDS, 15);
  assert.deepEqual(classifyCycleObservationHealth(healthSnapshot()), {
    action: "accept_fresh",
    reason: null,
  });
  assert.deepEqual(classifyCycleObservationHealth(healthSnapshot({
    level: "degraded",
    scanFreshness: "aging",
  })), {
    action: "retry_aging",
    reason: "scan_freshness_aging",
  });
});

test("health classifier rejects stale or unhealthy critical subsystems without retry", () => {
  for (const changes of [
    { level: "degraded", scanFreshness: "stale" },
    { database: "unavailable" },
    { redis: "unhealthy" },
    { candidateWorker: "unhealthy" },
    { workersHealthy: false },
    { httpStatus: 503, level: "degraded", scanFreshness: "aging" },
    { bodyOk: false, level: "degraded", scanFreshness: "aging" },
  ]) {
    assert.equal(classifyCycleObservationHealth(healthSnapshot(changes)).action, "reject");
  }
});

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
  const locked = sample(0);
  locked.database = { lockWaiters: 1, longTransactions: 0 };
  locked.databaseWindow.before.database.lockWaiters = 1;
  locked.databaseWindow.after.database.lockWaiters = 1;
  assert.throws(() => validateCycleObservationSample(locked, expected),
    /sample_database_before_lock_waiters/u);
  const wrongCycle = sample(0);
  wrongCycle.migrationId = "candidate-episode-v1";
  wrongCycle.databaseWindow.before.migrationId = wrongCycle.migrationId;
  wrongCycle.databaseWindow.after.migrationId = wrongCycle.migrationId;
  assert.throws(() => validateCycleObservationSample(wrongCycle, expected),
    /sample_database_before_cycle_mismatch/u);
  const unresolved = sample(0);
  unresolved.unresolvedOutbox = 1;
  unresolved.databaseWindow.before.unresolvedOutbox = 1;
  unresolved.databaseWindow.after.unresolvedOutbox = 1;
  assert.throws(() => validateCycleObservationSample(unresolved, expected),
    /unresolved_outbox/u);
});

test("accepts the exact production transient-claim race without hiding backlog", () => {
  const productionRace = sample(0, 3_705);
  productionRace.candidate.monitor.metrics = {
    ...productionRace.candidate.monitor.metrics,
    outboxClaimedTotal: 38,
    unresolvedTotal: 38,
    oldestPendingAgeSeconds: 29.526496,
  };
  assert.equal(validateCycleObservationSample(productionRace, expected).completedWrites, 3_705);
});

test("accepts monitor progress only when two database snapshots bracket it", () => {
  const productionRace = sample(0, 4_602);
  productionRace.sampledAt = "2026-07-17T00:00:10.000Z";
  productionRace.candidate.monitor.metrics = {
    ...productionRace.candidate.monitor.metrics,
    outboxCompletedTotal: 4_578,
    outboxClaimedTotal: 24,
    unresolvedTotal: 24,
    oldestPendingAgeSeconds: 22.116749,
  };
  productionRace.databaseWindow = {
    before: {
      sampledAt: "2026-07-17T00:00:00.000Z",
      migrationId: expected.migrationId,
      releaseId: expected.releaseId,
      phase: "shadow_capture",
      epoch: 1,
      deadlineAt: productionRace.deadlineAt,
      completedWrites: 4_556,
      unresolvedOutbox: 0,
      activeCycles: 1,
      database: { lockWaiters: 0, longTransactions: 0 },
    },
    after: {
      sampledAt: "2026-07-17T00:00:10.000Z",
      migrationId: expected.migrationId,
      releaseId: expected.releaseId,
      phase: "shadow_capture",
      epoch: 1,
      deadlineAt: productionRace.deadlineAt,
      completedWrites: 4_602,
      unresolvedOutbox: 0,
      activeCycles: 1,
      database: { lockWaiters: 0, longTransactions: 0 },
    },
  };
  assert.equal(validateCycleObservationSample(productionRace, expected).completedWrites, 4_602);
});

test("rejects monitor progress outside the database bracket or a stale bracket", () => {
  const below = sample(0, 4_602);
  below.databaseWindow.before.completedWrites = 4_580;
  below.candidate.monitor.metrics.outboxCompletedTotal = 4_578;
  assert.throws(() => validateCycleObservationSample(below, expected),
    /sample_monitor_completed_outside_database_bracket/u);

  const above = sample(0, 4_602);
  above.candidate.monitor.metrics.outboxCompletedTotal = 4_603;
  assert.throws(() => validateCycleObservationSample(above, expected),
    /sample_monitor_completed_outside_database_bracket/u);

  const stale = sample(0, 4_602);
  stale.databaseWindow.before.sampledAt = "2026-07-16T23:58:59.000Z";
  assert.equal(MAXIMUM_DATABASE_BRACKET_SECONDS, 60);
  assert.throws(() => validateCycleObservationSample(stale, expected),
    /sample_database_bracket_duration_invalid/u);
});

test("rejects legacy unbracketed sample evidence", () => {
  const legacy = sample(0);
  legacy.schemaVersion = "candidate-validation-cycle-observation-sample.v2";
  delete legacy.databaseWindow;
  assert.throws(() => validateCycleObservationSample(legacy, expected),
    /sample_shape_invalid/u);
});

test("rejects stale, inconsistent, retrying or quarantined transient work", () => {
  const transform = (changes) => {
    const value = sample(0);
    value.candidate.monitor.metrics = { ...value.candidate.monitor.metrics, ...changes };
    return value;
  };
  for (const value of [
    transform({ outboxClaimedTotal: 38, unresolvedTotal: 37, oldestPendingAgeSeconds: 20 }),
    transform({ outboxClaimedTotal: 1, unresolvedTotal: 1, oldestPendingAgeSeconds: 300 }),
    transform({ outboxRetryWaitTotal: 1, unresolvedTotal: 1, oldestPendingAgeSeconds: 20 }),
    transform({
      outboxQuarantinedTotal: 1,
      unresolvedQuarantineTotal: 1,
      unresolvedTotal: 1,
      oldestPendingAgeSeconds: 20,
    }),
  ]) assert.throws(() => validateCycleObservationSample(value, expected));
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
  const samples = Array.from({ length: 7 }, (_, index) => {
    const value = sample(index, 9_000 + index);
    value.deadlineAt = "2026-07-17T06:00:00.000Z";
    value.databaseWindow.before.deadlineAt = value.deadlineAt;
    value.databaseWindow.after.deadlineAt = value.deadlineAt;
    return value;
  });
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
      databaseWindow: {
        before: { ...value.databaseWindow.before, epoch: 3 },
        after: { ...value.databaseWindow.after, epoch: 3 },
      },
      candidate: {
        ...value.candidate,
        runtime: { ...value.candidate.runtime, authorityEpoch: 3 },
        monitor: { ...value.candidate.monitor, authorityEpoch: 3 },
      },
    } : value
  )), expected), /observation_epoch_drift/u);
  assert.throws(() => evaluateCycleObservation(samples.map((value, index) => (
    index === 4 ? {
      ...sample(index, 1),
    } : value
  )), expected), /observation_completed_writes_regressed/u);
});
