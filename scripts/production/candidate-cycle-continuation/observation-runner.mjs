#!/usr/bin/env node

import { readFile } from "node:fs/promises";

export const MINIMUM_COMPARED_WRITES = 10_000;
export const MINIMUM_STABILITY_SECONDS = 1_800;
export const MINIMUM_SAMPLES = 7;
export const MAXIMUM_SAMPLE_GAP_SECONDS = 600;
export const DEADLINE_SAFETY_SECONDS = 21_600;

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

export function validateCycleObservationSample(sample, expected) {
  exactKeys(sample, [
    "activeCycles", "commit", "completedWrites", "deadlineAt", "epoch", "health",
    "migrationId", "phase", "releaseId", "sampledAt", "schemaVersion", "unresolvedOutbox",
  ], "sample_shape_invalid");
  exactKeys(sample.health, [
    "candidateWorker", "database", "level", "redis", "scanFreshness", "workersHealthy",
  ], "sample_health_shape_invalid");
  ensure(sample.schemaVersion === "candidate-validation-cycle-observation-sample.v1",
    "sample_schema_invalid");
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
  ensure(sample.health.level === "ready", "sample_health_not_ready");
  ensure(sample.health.scanFreshness === "fresh", "sample_scan_not_fresh");
  ensure(sample.health.database === "ready", "sample_database_not_ready");
  ensure(sample.health.redis === "healthy", "sample_redis_not_healthy");
  ensure(sample.health.candidateWorker === "healthy", "sample_candidate_worker_not_healthy");
  ensure(sample.health.workersHealthy === true, "sample_worker_set_not_healthy");
  return { ...sample, sampledAtMs: sampledAt, deadlineAtMs: deadlineAt };
}

export function evaluateCycleObservation(samples, expected, options = {}) {
  ensure(Array.isArray(samples) && samples.length > 0, "observation_samples_missing");
  const minimumComparedWrites = options.minimumComparedWrites ?? MINIMUM_COMPARED_WRITES;
  const minimumStabilitySeconds = options.minimumStabilitySeconds ?? MINIMUM_STABILITY_SECONDS;
  const minimumSamples = options.minimumSamples ?? MINIMUM_SAMPLES;
  const maximumSampleGapSeconds = options.maximumSampleGapSeconds ?? MAXIMUM_SAMPLE_GAP_SECONDS;
  const deadlineSafetySeconds = options.deadlineSafetySeconds ?? DEADLINE_SAFETY_SECONDS;
  ensure(minimumComparedWrites === MINIMUM_COMPARED_WRITES,
    "minimum_compared_writes_cannot_change");
  ensure(minimumStabilitySeconds >= MINIMUM_STABILITY_SECONDS,
    "minimum_stability_cannot_shorten");
  ensure(minimumSamples >= MINIMUM_SAMPLES, "minimum_samples_cannot_lower");
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
  let status = "IN_PROGRESS_ACCUMULATING_REAL_WRITES";
  if (stable && thresholdReached) {
    status = "PASS_ACCUMULATION_READY_FOR_FRESH_VERIFICATION_CYCLE";
  } else if (!thresholdReached && deadlineRemainingSeconds < deadlineSafetySeconds) {
    status = "FAIL_CYCLE_CAPACITY_EXHAUSTED_REQUIRES_NEXT_ADJACENT_CYCLE";
  }
  return {
    schemaVersion: "candidate-validation-cycle-observation.v1",
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
