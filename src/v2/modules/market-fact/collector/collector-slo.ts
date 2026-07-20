import { deepFreezeArtifact, stableContentHash } from "../../universe/stable-artifact";
import {
  type M1CollectorWorkerCycle,
  M1CollectorWorkerCycleSchema,
} from "./collector-worker-contract";

export const M1_COLLECTOR_SLO_REPORT_SCHEMA_VERSION =
  "v2-m1-collector-slo-report.v1" as const;

export type CollectorSloPolicy = Readonly<{
  maxMissedScheduleStarts: number;
  maxP95CycleDurationMs: number;
  maxProviderFailureCycleRatio: number;
  maxRssBytes: number;
  maxScheduleLagMs: number;
  minCheckpointRatio: number;
  minCycles: number;
  minFreshCoverageRatio: number;
  minObservationMs: number;
  minOperationalReadyRatio: number;
}>;

export type M1CollectorSloReport = Readonly<{
  authorityMode: "NO_AUTHORITY";
  automaticTradingAllowed: false;
  conclusion: "FAIL" | "INSUFFICIENT_EVIDENCE" | "PASS";
  evaluatedAt: string;
  metrics: Readonly<{
    checkpointRatio: number | null;
    cycleCount: number;
    maxRssBytes: number | null;
    maxScheduleLagMs: number | null;
    minAccountedCount: number | null;
    minEligibleCount: number | null;
    minFreshCoverageRatio: number | null;
    missedScheduleStarts: number;
    observationMs: number;
    operationalReadyRatio: number | null;
    p95CycleDurationMs: number | null;
    providerFailureCycleRatio: number | null;
    reconciledProviderObservedMinimum: number | null;
  }>;
  policy: CollectorSloPolicy;
  policyDigest: string;
  reasons: readonly string[];
  releaseId: string;
  schemaVersion: typeof M1_COLLECTOR_SLO_REPORT_SCHEMA_VERSION;
}>;

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function p95(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null;
}

function minimum(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.min(...values);
}

function maximum(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.max(...values);
}

function validatePolicy(policy: CollectorSloPolicy): void {
  const ratios = [
    policy.maxProviderFailureCycleRatio,
    policy.minCheckpointRatio,
    policy.minFreshCoverageRatio,
    policy.minOperationalReadyRatio,
  ];
  if (
    !Number.isSafeInteger(policy.minCycles) ||
    policy.minCycles <= 0 ||
    !Number.isSafeInteger(policy.minObservationMs) ||
    policy.minObservationMs < 0 ||
    !Number.isSafeInteger(policy.maxMissedScheduleStarts) ||
    policy.maxMissedScheduleStarts < 0 ||
    !Number.isSafeInteger(policy.maxP95CycleDurationMs) ||
    policy.maxP95CycleDurationMs <= 0 ||
    !Number.isSafeInteger(policy.maxRssBytes) ||
    policy.maxRssBytes <= 0 ||
    !Number.isSafeInteger(policy.maxScheduleLagMs) ||
    policy.maxScheduleLagMs < 0 ||
    ratios.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
  ) {
    throw new Error("collector SLO policy is invalid");
  }
}

export function evaluateM1CollectorSlo(input: {
  cycles: readonly M1CollectorWorkerCycle[];
  evaluatedAt: string;
  policy: CollectorSloPolicy;
  releaseId: string;
}): M1CollectorSloReport {
  validatePolicy(input.policy);
  if (!Number.isFinite(Date.parse(input.evaluatedAt))) {
    throw new Error("collector SLO evaluation time is invalid");
  }
  const cycles = input.cycles.map((cycle) => {
    const parsed = M1CollectorWorkerCycleSchema.safeParse(cycle);
    if (!parsed.success) {
      throw new Error("collector SLO input contains invalid cycle telemetry");
    }
    return parsed.data;
  });
  const releaseMismatch = cycles.some((cycle) =>
    cycle.releaseId !== input.releaseId);
  const mixedRuntimeConfig = new Set(
    cycles.map((cycle) => cycle.runtimeConfigDigest),
  ).size > 1;
  const duplicateCycleIds = new Set(
    cycles.map((cycle) => cycle.runtime.cycleId),
  ).size !== cycles.length;
  const chronological = [...cycles].sort((left, right) =>
    Date.parse(left.startedAt) - Date.parse(right.startedAt));
  const overlappingCycles = chronological.some((cycle, index) =>
    index > 0 &&
    Date.parse(cycle.startedAt) <
      Date.parse(chronological[index - 1]!.completedAt));
  const cycleCount = cycles.length;
  const firstStartedMs = cycleCount === 0
    ? Date.parse(input.evaluatedAt)
    : Math.min(...cycles.map((cycle) => Date.parse(cycle.startedAt)));
  const lastCompletedMs = cycleCount === 0
    ? firstStartedMs
    : Math.max(...cycles.map((cycle) => Date.parse(cycle.completedAt)));
  if (Date.parse(input.evaluatedAt) < lastCompletedMs) {
    throw new Error("collector SLO evaluation cannot precede observed cycles");
  }
  const observationMs = Math.max(0, lastCompletedMs - firstStartedMs);
  const readyCount = cycles.filter(
    (cycle) => cycle.operationalReadiness === "READY",
  ).length;
  const checkpointCount = cycles.filter((cycle) =>
    cycle.checkpoint.status === "INSERTED" ||
    cycle.checkpoint.status === "IDEMPOTENT_REPLAY").length;
  const providerFailureCycles = cycles.filter(
    (cycle) => cycle.runtime.providerFailures.length > 0,
  ).length;
  const freshRatios = cycles
    .map((cycle) => cycle.runtime.coverage.freshCoverage.ratio)
    .filter((value): value is number => value !== null);
  const reconciledObserved = cycles
    .map((cycle) => cycle.runtime.coverage.providerObservedCount)
    .filter((value): value is number => value !== null);
  const metrics = {
    checkpointRatio: ratio(checkpointCount, cycleCount),
    cycleCount,
    maxRssBytes: maximum(cycles.map((cycle) => cycle.resources.rssBytes)),
    maxScheduleLagMs: maximum(cycles.map((cycle) => cycle.scheduleLagMs)),
    minAccountedCount: minimum(cycles.map(
      (cycle) => cycle.runtime.coverage.accountedCount,
    )),
    minEligibleCount: minimum(cycles.map(
      (cycle) => cycle.runtime.coverage.eligibleCount,
    )),
    minFreshCoverageRatio: minimum(freshRatios),
    missedScheduleStarts: cycles.reduce(
      (sum, cycle) => sum + cycle.missedScheduleStarts,
      0,
    ),
    observationMs,
    operationalReadyRatio: ratio(readyCount, cycleCount),
    p95CycleDurationMs: p95(cycles.map(
      (cycle) => cycle.runtime.durationMs,
    )),
    providerFailureCycleRatio: ratio(providerFailureCycles, cycleCount),
    reconciledProviderObservedMinimum: minimum(reconciledObserved),
  };

  const hardFailures = [
    ...(releaseMismatch ? ["mixed_or_wrong_release"] : []),
    ...(mixedRuntimeConfig ? ["mixed_runtime_configuration"] : []),
    ...(duplicateCycleIds ? ["duplicate_collector_cycle"] : []),
    ...(overlappingCycles ? ["overlapping_collector_cycles"] : []),
    ...(cycles.some((cycle) => cycle.runtime.persistence === "FAILED")
      ? ["artifact_persistence_failed"]
      : []),
    ...(checkpointCount !== cycleCount && cycleCount > 0
      ? ["checkpoint_incomplete"]
      : []),
    ...(cycles.some((cycle) => cycle.runtime.coverage.eligibleCount === 0)
      ? ["eligible_denominator_zero"]
      : []),
  ];
  const insufficient = [
    ...(cycleCount < input.policy.minCycles
      ? ["minimum_cycle_count_not_met"]
      : []),
    ...(observationMs < input.policy.minObservationMs
      ? ["minimum_observation_window_not_met"]
      : []),
  ];
  const thresholdFailures = [
    ...(metrics.checkpointRatio !== null &&
      metrics.checkpointRatio < input.policy.minCheckpointRatio
      ? ["checkpoint_ratio_below_slo"]
      : []),
    ...(metrics.minFreshCoverageRatio !== null &&
      metrics.minFreshCoverageRatio < input.policy.minFreshCoverageRatio
      ? ["fresh_coverage_below_slo"]
      : []),
    ...(metrics.operationalReadyRatio !== null &&
      metrics.operationalReadyRatio < input.policy.minOperationalReadyRatio
      ? ["operational_ready_ratio_below_slo"]
      : []),
    ...(metrics.providerFailureCycleRatio !== null &&
      metrics.providerFailureCycleRatio > input.policy.maxProviderFailureCycleRatio
      ? ["provider_failure_ratio_above_slo"]
      : []),
    ...(metrics.p95CycleDurationMs !== null &&
      metrics.p95CycleDurationMs > input.policy.maxP95CycleDurationMs
      ? ["cycle_duration_p95_above_slo"]
      : []),
    ...(metrics.maxScheduleLagMs !== null &&
      metrics.maxScheduleLagMs > input.policy.maxScheduleLagMs
      ? ["schedule_lag_above_slo"]
      : []),
    ...(metrics.missedScheduleStarts > input.policy.maxMissedScheduleStarts
      ? ["missed_schedule_starts_above_slo"]
      : []),
    ...(metrics.maxRssBytes !== null &&
      metrics.maxRssBytes > input.policy.maxRssBytes
      ? ["rss_above_slo"]
      : []),
  ];
  const conclusion = hardFailures.length > 0 || thresholdFailures.length > 0
    ? "FAIL"
    : insufficient.length > 0
      ? "INSUFFICIENT_EVIDENCE"
      : "PASS";
  const reasons = conclusion === "INSUFFICIENT_EVIDENCE"
    ? insufficient
    : [...hardFailures, ...thresholdFailures];

  return deepFreezeArtifact({
    authorityMode: "NO_AUTHORITY" as const,
    automaticTradingAllowed: false as const,
    conclusion,
    evaluatedAt: new Date(input.evaluatedAt).toISOString(),
    metrics,
    policy: { ...input.policy },
    policyDigest: stableContentHash(input.policy),
    reasons: [...new Set(reasons)].sort(),
    releaseId: input.releaseId,
    schemaVersion: M1_COLLECTOR_SLO_REPORT_SCHEMA_VERSION,
  });
}
