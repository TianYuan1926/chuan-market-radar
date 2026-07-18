#!/usr/bin/env node

import { readFile } from "node:fs/promises";

export const MINIMUM_COMPARED_WRITES = 10_000;
export const MINIMUM_STABILITY_SECONDS = 1_800;
export const MINIMUM_SAMPLES = 7;
export const MINIMUM_ACTIVATION_HOURS = 24;
export const MINIMUM_ACTIVATION_SAMPLES = 289;
export const MAXIMUM_SAMPLE_GAP_SECONDS = 600;
export const DEADLINE_SAFETY_SECONDS = 21_600;
export const MAXIMUM_TRANSIENT_UNRESOLVED_AGE_SECONDS = 300;
export const MAXIMUM_HEALTH_RECHECK_SECONDS = 180;
export const HEALTH_RECHECK_INTERVAL_SECONDS = 15;
export const MAXIMUM_DATABASE_BRACKET_SECONDS = 60;

export class CandidateCycleObservationError extends Error {
  constructor(reason) {
    super(`candidate cycle observation rejected: ${reason}`);
    this.name = "CandidateCycleObservationError";
    this.reason = reason;
  }
}

function ensure(condition, reason) {
  if (!condition) throw new CandidateCycleObservationError(reason);
}

function integer(value, reason, minimum = 0) {
  ensure(Number.isSafeInteger(value) && value >= minimum, reason);
  return value;
}

function timestamp(value, reason) {
  const parsed = Date.parse(value);
  ensure(Number.isFinite(parsed), reason);
  return parsed;
}

function exactKeys(value, expected, reason) {
  ensure(value && typeof value === "object" && !Array.isArray(value), reason);
  ensure(Object.keys(value).sort().join("\n") === [...expected].sort().join("\n"), reason);
}

const DATABASE_SNAPSHOT_KEYS = Object.freeze([
  "activeCycles", "completedWrites", "database", "deadlineAt", "epoch", "migrationId",
  "phase", "releaseId", "sampledAt", "unresolvedOutbox",
]);

function validateDatabaseSnapshot(snapshot, expected, prefix) {
  exactKeys(snapshot, DATABASE_SNAPSHOT_KEYS, `${prefix}_shape_invalid`);
  exactKeys(snapshot.database, ["lockWaiters", "longTransactions"],
    `${prefix}_database_shape_invalid`);
  ensure(snapshot.migrationId === expected.migrationId, `${prefix}_cycle_mismatch`);
  ensure(snapshot.releaseId === expected.releaseId, `${prefix}_release_mismatch`);
  ensure(snapshot.phase === "shadow_capture", `${prefix}_phase_invalid`);
  integer(snapshot.epoch, `${prefix}_epoch_invalid`, 1);
  ensure(snapshot.epoch % 2 === 1, `${prefix}_epoch_not_active`);
  ensure(integer(snapshot.activeCycles, `${prefix}_active_cycle_count_invalid`) === 1,
    `${prefix}_active_cycle_count_invalid`);
  integer(snapshot.completedWrites, `${prefix}_completed_writes_invalid`);
  ensure(integer(snapshot.unresolvedOutbox, `${prefix}_unresolved_invalid`) === 0,
    `${prefix}_unresolved_outbox`);
  const sampledAtMs = timestamp(snapshot.sampledAt, `${prefix}_time_invalid`);
  const deadlineAtMs = timestamp(snapshot.deadlineAt, `${prefix}_deadline_invalid`);
  ensure(deadlineAtMs > sampledAtMs, `${prefix}_deadline_expired`);
  ensure(integer(snapshot.database.lockWaiters, `${prefix}_lock_waiters_invalid`) === 0,
    `${prefix}_lock_waiters`);
  ensure(integer(snapshot.database.longTransactions,
    `${prefix}_long_transactions_invalid`) === 0, `${prefix}_long_transaction`);
  return { ...snapshot, sampledAtMs, deadlineAtMs };
}

export function classifyCycleObservationHealth(snapshot) {
  exactKeys(snapshot, [
    "bodyOk", "candidateWorker", "database", "httpStatus", "level", "redis",
    "scanFreshness", "workersHealthy",
  ], "health_recheck_shape_invalid");
  if (snapshot.httpStatus !== 200) {
    return { action: "reject", reason: "health_http_not_ok" };
  }
  if (snapshot.bodyOk !== true) {
    return { action: "reject", reason: "health_body_not_ok" };
  }
  if (snapshot.database !== "ready") {
    return { action: "reject", reason: "health_database_not_ready" };
  }
  if (snapshot.redis !== "healthy") {
    return { action: "reject", reason: "health_redis_not_healthy" };
  }
  if (snapshot.candidateWorker !== "healthy") {
    return { action: "reject", reason: "health_candidate_worker_not_healthy" };
  }
  if (snapshot.workersHealthy !== true) {
    return { action: "reject", reason: "health_worker_set_not_healthy" };
  }
  if (snapshot.level === "ready" && snapshot.scanFreshness === "fresh") {
    return { action: "accept_fresh", reason: null };
  }
  if (snapshot.level === "degraded" && snapshot.scanFreshness === "aging") {
    return { action: "retry_aging", reason: "scan_freshness_aging" };
  }
  return { action: "reject", reason: "health_freshness_state_invalid" };
}

export function validateCycleObservationSample(sample, expected) {
  exactKeys(sample, [
    "activeCycles", "candidate", "commit", "completedWrites", "database", "deadlineAt",
    "databaseWindow", "epoch", "health", "migrationId", "phase", "releaseId", "sampledAt",
    "schemaVersion", "unresolvedOutbox",
  ], "sample_shape_invalid");
  exactKeys(sample.health, [
    "candidateWorker", "database", "level", "ok", "redis", "scanFreshness", "workersHealthy",
  ], "sample_health_shape_invalid");
  exactKeys(sample.database, ["lockWaiters", "longTransactions"],
    "sample_database_shape_invalid");
  ensure(sample.schemaVersion === "candidate-validation-cycle-observation-sample.v3",
    "sample_schema_invalid");
  exactKeys(sample.databaseWindow, ["after", "before"], "sample_database_window_shape_invalid");
  const before = validateDatabaseSnapshot(sample.databaseWindow.before, expected,
    "sample_database_before");
  const after = validateDatabaseSnapshot(sample.databaseWindow.after, expected,
    "sample_database_after");
  const databaseBracketSeconds = (after.sampledAtMs - before.sampledAtMs) / 1_000;
  ensure(databaseBracketSeconds >= 0
      && databaseBracketSeconds <= MAXIMUM_DATABASE_BRACKET_SECONDS,
  "sample_database_bracket_duration_invalid");
  for (const key of [
    "activeCycles", "completedWrites", "deadlineAt", "epoch", "migrationId", "phase",
    "releaseId", "sampledAt", "unresolvedOutbox",
  ]) ensure(sample[key] === after[key], `sample_database_after_mismatch:${key}`);
  ensure(JSON.stringify(sample.database) === JSON.stringify(after.database),
    "sample_database_after_mismatch:database");
  ensure(before.epoch === after.epoch, "sample_database_bracket_epoch_drift");
  ensure(before.deadlineAt === after.deadlineAt, "sample_database_bracket_deadline_drift");
  ensure(before.completedWrites <= after.completedWrites,
    "sample_database_bracket_completed_regressed");
  ensure(sample.commit === expected.commit, "sample_commit_mismatch");
  ensure(sample.migrationId === expected.migrationId, "sample_cycle_mismatch");
  ensure(sample.releaseId === expected.releaseId, "sample_release_mismatch");
  ensure(sample.phase === "shadow_capture", "sample_phase_invalid");
  integer(sample.epoch, "sample_epoch_invalid", 1);
  ensure(sample.epoch % 2 === 1, "sample_epoch_not_active");
  ensure(integer(sample.activeCycles, "sample_active_cycle_count_invalid") === 1,
    "sample_active_cycle_count_invalid");
  integer(sample.completedWrites, "sample_completed_writes_invalid");
  ensure(integer(sample.unresolvedOutbox, "sample_unresolved_invalid") === 0,
    "sample_unresolved_outbox");
  const sampledAt = timestamp(sample.sampledAt, "sample_time_invalid");
  const deadlineAt = timestamp(sample.deadlineAt, "sample_deadline_invalid");
  ensure(deadlineAt > sampledAt, "sample_cycle_deadline_expired");
  ensure(sample.health.ok === true, "sample_health_not_ok");
  ensure(sample.health.level === "ready", "sample_health_not_ready");
  ensure(sample.health.scanFreshness === "fresh", "sample_scan_not_fresh");
  ensure(sample.health.database === "ready", "sample_database_not_ready");
  ensure(sample.health.redis === "healthy", "sample_redis_not_healthy");
  ensure(sample.health.candidateWorker === "healthy", "sample_candidate_worker_not_healthy");
  ensure(sample.health.workersHealthy === true, "sample_worker_set_not_healthy");
  ensure(sample.candidate?.ok === true && sample.candidate.mode === "active",
    "sample_candidate_api_not_active");
  ensure(sample.candidate.runtime?.enabled === true, "sample_runtime_not_enabled");
  ensure(Array.isArray(sample.candidate.runtime?.blockers)
      && sample.candidate.runtime.blockers.length === 0, "sample_runtime_blocked");
  ensure(integer(sample.candidate.runtime?.authorityEpoch,
    "sample_runtime_epoch_invalid", 1) === sample.epoch, "sample_runtime_epoch_mismatch");
  ensure(sample.candidate.runtime?.expectedReleaseId === expected.releaseId,
    "sample_runtime_release_mismatch");
  const monitor = sample.candidate.monitor;
  ensure(monitor?.status === "ready" && monitor.phase === "shadow_capture",
    "sample_monitor_not_ready");
  ensure(monitor.migrationId === expected.migrationId, "sample_monitor_cycle_mismatch");
  ensure(integer(monitor.authorityEpoch, "sample_monitor_epoch_invalid", 1) === sample.epoch,
    "sample_monitor_epoch_mismatch");
  ensure(Array.isArray(monitor.blockers) && monitor.blockers.length === 0,
    "sample_monitor_blocked");
  ensure(Array.isArray(monitor.warnings) && monitor.warnings.length === 0,
    "sample_monitor_warning");
  const metrics = monitor.metrics;
  exactKeys(metrics, [
    "oldestPendingAgeSeconds", "outboxClaimedTotal", "outboxCompletedTotal",
    "outboxPendingTotal", "outboxQuarantinedTotal", "outboxRetryWaitTotal",
    "unresolvedQuarantineTotal", "unresolvedTotal",
  ], "sample_monitor_metrics_shape_invalid");
  const pending = integer(metrics.outboxPendingTotal, "sample_pending_invalid");
  const claimed = integer(metrics.outboxClaimedTotal, "sample_claimed_invalid");
  const retryWait = integer(metrics.outboxRetryWaitTotal, "sample_retry_wait_invalid");
  const unresolvedQuarantine = integer(
    metrics.unresolvedQuarantineTotal,
    "sample_unresolved_quarantine_invalid",
  );
  const unresolved = integer(metrics.unresolvedTotal, "sample_unresolved_total_invalid");
  ensure(unresolved === pending + claimed + retryWait + unresolvedQuarantine,
    "sample_unresolved_arithmetic_invalid");
  ensure(retryWait === 0,
    "sample_retry_wait_present");
  ensure(integer(metrics.outboxQuarantinedTotal, "sample_quarantine_invalid") === 0,
    "sample_quarantine_present");
  ensure(unresolvedQuarantine === 0, "sample_unresolved_quarantine");
  if (unresolved === 0) {
    ensure(metrics.oldestPendingAgeSeconds === null, "sample_oldest_pending_without_work");
  } else {
    ensure(typeof metrics.oldestPendingAgeSeconds === "number"
        && Number.isFinite(metrics.oldestPendingAgeSeconds)
        && metrics.oldestPendingAgeSeconds >= 0
        && metrics.oldestPendingAgeSeconds < MAXIMUM_TRANSIENT_UNRESOLVED_AGE_SECONDS,
    "sample_oldest_pending_too_old");
  }
  const monitorCompleted = integer(metrics.outboxCompletedTotal,
    "sample_monitor_completed_invalid");
  ensure(monitorCompleted >= before.completedWrites && monitorCompleted <= after.completedWrites,
    "sample_monitor_completed_outside_database_bracket");
  return {
    ...sample,
    databaseBracketSeconds,
    monitorCompletedWrites: monitorCompleted,
    sampledAtMs: sampledAt,
    deadlineAtMs: deadlineAt,
  };
}

export function evaluateCycleObservation(samples, expected, options = {}) {
  ensure(Array.isArray(samples) && samples.length > 0, "observation_samples_missing");
  const minimumComparedWrites = options.minimumComparedWrites ?? MINIMUM_COMPARED_WRITES;
  const minimumStabilitySeconds = options.minimumStabilitySeconds ?? MINIMUM_STABILITY_SECONDS;
  const minimumSamples = options.minimumSamples ?? MINIMUM_SAMPLES;
  const minimumActivationHours = options.minimumActivationHours ?? MINIMUM_ACTIVATION_HOURS;
  const minimumActivationSamples = options.minimumActivationSamples ?? MINIMUM_ACTIVATION_SAMPLES;
  const maximumSampleGapSeconds = options.maximumSampleGapSeconds ?? MAXIMUM_SAMPLE_GAP_SECONDS;
  const deadlineSafetySeconds = options.deadlineSafetySeconds ?? DEADLINE_SAFETY_SECONDS;
  ensure(minimumComparedWrites === MINIMUM_COMPARED_WRITES,
    "minimum_compared_writes_cannot_change");
  ensure(minimumStabilitySeconds >= MINIMUM_STABILITY_SECONDS,
    "minimum_stability_cannot_shorten");
  ensure(minimumSamples >= MINIMUM_SAMPLES, "minimum_samples_cannot_lower");
  ensure(minimumActivationHours >= MINIMUM_ACTIVATION_HOURS,
    "minimum_activation_window_cannot_shorten");
  ensure(minimumActivationSamples >= MINIMUM_ACTIVATION_SAMPLES,
    "minimum_activation_samples_cannot_lower");
  ensure(maximumSampleGapSeconds <= MAXIMUM_SAMPLE_GAP_SECONDS,
    "maximum_sample_gap_cannot_expand");
  ensure(deadlineSafetySeconds >= DEADLINE_SAFETY_SECONDS,
    "deadline_safety_cannot_shorten");
  const validated = samples.map((sample) => validateCycleObservationSample(sample, expected));
  for (let index = 1; index < validated.length; index += 1) {
    const gapSeconds = (validated[index].sampledAtMs - validated[index - 1].sampledAtMs) / 1_000;
    ensure(gapSeconds > 0 && gapSeconds <= maximumSampleGapSeconds,
      "observation_sample_gap_invalid");
    ensure(validated[index].epoch === validated[0].epoch, "observation_epoch_drift");
    ensure(validated[index].deadlineAt === validated[0].deadlineAt, "observation_deadline_drift");
    ensure(validated[index].completedWrites >= validated[index - 1].completedWrites,
      "observation_completed_writes_regressed");
  }
  const first = validated[0];
  const latest = validated.at(-1);
  const elapsedSeconds = Math.floor((latest.sampledAtMs - first.sampledAtMs) / 1_000);
  const completionAdvances = validated.slice(1).filter((sample, index) => (
    sample.completedWrites > validated[index].completedWrites
  )).length;
  const deadlineRemainingSeconds = Math.floor((latest.deadlineAtMs - latest.sampledAtMs) / 1_000);
  const stable = validated.length >= minimumSamples
    && elapsedSeconds >= minimumStabilitySeconds
    && completionAdvances >= 2;
  const thresholdReached = latest.completedWrites >= minimumComparedWrites;
  const accumulationReady = stable && thresholdReached;
  const freshActivationReady = validated.length >= minimumActivationSamples
    && elapsedSeconds >= minimumActivationHours * 60 * 60;
  let status = "IN_PROGRESS_FRESH_ACTIVATION_AND_ACCUMULATION";
  if (freshActivationReady && accumulationReady) {
    status = "PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE";
  } else if (deadlineRemainingSeconds < deadlineSafetySeconds) {
    status = "FAIL_CYCLE_CAPACITY_EXHAUSTED_REQUIRES_NEXT_ADJACENT_CYCLE";
  } else if (accumulationReady) {
    status = "IN_PROGRESS_FRESH_ACTIVATION_OBSERVATION";
  } else if (freshActivationReady) {
    status = "IN_PROGRESS_ACCUMULATING_REAL_WRITES";
  }
  return {
    schemaVersion: "candidate-validation-cycle-observation.v2",
    status,
    migrationId: expected.migrationId,
    releaseId: expected.releaseId,
    commit: expected.commit,
    authorityEpoch: first.epoch,
    samples: validated.length,
    elapsedSeconds,
    completionAdvances,
    completedWrites: latest.completedWrites,
    minimumComparedWrites,
    accumulationReady,
    freshActivationReady,
    activationSamples: validated.length,
    minimumActivationSamples,
    activationCoverageSeconds: elapsedSeconds,
    minimumActivationHours,
    deadlineAt: latest.deadlineAt,
    deadlineRemainingSeconds,
    unresolvedOutbox: latest.unresolvedOutbox,
    thresholdsChanged: false,
    productionReconciliationExecuted: false,
    shadowVerifyStarted: false,
    canonicalAuthorityChanged: false,
    g0Completed: false,
  };
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    ensure(rest[index]?.startsWith("--") && rest[index + 1] !== undefined,
      "cli_arguments_invalid");
    options[rest[index].slice(2)] = rest[index + 1];
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  ensure(command === "evaluate", "cli_command_invalid");
  const samples = (await readFile(options.input, "utf8")).trim().split("\n")
    .filter(Boolean).map((line) => JSON.parse(line));
  const result = evaluateCycleObservation(samples, {
    commit: options.commit,
    migrationId: options["migration-id"],
    releaseId: options["release-id"],
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
