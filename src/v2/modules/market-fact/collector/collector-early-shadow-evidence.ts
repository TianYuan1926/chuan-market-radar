import { createHash } from "node:crypto";
import { TARGET_VENUES } from "../../../domain/product-constitution";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../../universe/stable-artifact";
import {
  parseM1CollectorObservationLog,
  serializeM1CollectorObservationLog,
} from "./collector-observation-log";
import {
  type M1CollectorProcessSummary,
  parseM1CollectorProcessSummary,
} from "./collector-process-contract";
import {
  evaluateM1CollectorShadowEvidence,
  M1_COLLECTOR_SHADOW_SLO_POLICIES,
} from "./collector-shadow-evidence";
import type { M1CollectorWorkerCycle } from "./collector-worker-contract";

const EARLY_SHADOW_CYCLE_COUNT = 31;
const EARLY_SHADOW_INTERVAL_MS = 60_000;
const MAX_PROCESS_OUTPUT_BYTES = 32 * 1024 * 1024;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export const M1_COLLECTOR_EARLY_SHADOW_EVIDENCE_SCHEMA_VERSION =
  "v2-m1-collector-early-shadow-evidence.v2" as const;

type CountRecord = Readonly<{ count: number; value: string }>;

export type M1CollectorEarlyShadowEvidence = Readonly<{
  authorityMode: "NO_AUTHORITY";
  automaticTradingAllowed: false;
  businessGate: Readonly<{
    conclusion: "FAIL" | "PASS";
    earlyShadowSloPassed: boolean;
    m1ExitClaimed: false;
    reasons: readonly string[];
  }>;
  capture: Readonly<{
    aggregate: Readonly<{
      maximumEligibleCount: number;
      minimumAccountedCount: number;
      minimumCollectedCount: number;
      minimumCollectionCoverageRatio: number;
      minimumEligibleCount: number;
      minimumFreshCount: number;
      minimumFreshCoverageRatio: number;
      minimumPriceUsabilityCoverageRatio: number;
      minimumUsablePriceCount: number;
    }>;
    checkpointStatuses: readonly CountRecord[];
    cycleCount: 31;
    dataQualityStates: readonly CountRecord[];
    firstCompletedAt: string;
    firstScheduledAt: string;
    lastCompletedAt: string;
    lastScheduledAt: string;
    notReadyCycleCount: number;
    operationalReadyCycleCount: number;
    persistenceStates: readonly CountRecord[];
    providerFailureCycleCount: number;
    providerFailureReasons: readonly CountRecord[];
    runtimeReasons: readonly CountRecord[];
    triggerCounts: readonly CountRecord[];
    venues: readonly Readonly<{
      maximumEligibleCount: number;
      minimumAccountedCount: number;
      minimumCollectedCount: number;
      minimumCollectionCoverageRatio: number;
      minimumEligibleCount: number;
      minimumFreshCount: number;
      minimumFreshCoverageRatio: number;
      minimumPriceUsabilityCoverageRatio: number;
      minimumUsablePriceCount: number;
      providerFailureCycleCount: number;
      venue: (typeof TARGET_VENUES)[number];
    }>[];
    workerRunId: string;
  }>;
  evidenceDigest: string;
  evidenceId: string;
  evaluatedAt: string;
  process: M1CollectorProcessSummary;
  releaseId: string;
  runtimeConfigDigest: string;
  schemaVersion: typeof M1_COLLECTOR_EARLY_SHADOW_EVIDENCE_SCHEMA_VERSION;
  sourceArtifacts: Readonly<{
    observationBytes: number;
    observationDigest: string;
    observationLineCount: 31;
    processOutputBytes: number;
    processOutputDigest: string;
    processOutputLineCount: 32;
  }>;
  slo: ReturnType<typeof evaluateM1CollectorShadowEvidence>;
  status:
    | "CAPTURE_COMPLETE_BUSINESS_FAIL"
    | "CAPTURE_COMPLETE_BUSINESS_PASS";
}>;

export type ParsedM1CollectorEarlyShadowProcessOutput = Readonly<{
  canonicalObservationJsonLines: string;
  cycles: readonly M1CollectorWorkerCycle[];
  processOutput: string;
  summary: M1CollectorProcessSummary;
}>;

function fail(message: string): never {
  throw new Error(`collector early shadow evidence rejected: ${message}`);
}

function byteDigest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function minimum(values: readonly number[]): number {
  if (values.length === 0) {
    return fail("metric denominator is empty");
  }
  return Math.min(...values);
}

function maximum(values: readonly number[]): number {
  if (values.length === 0) {
    return fail("metric denominator is empty");
  }
  return Math.max(...values);
}

function countValues(values: readonly string[]): readonly CountRecord[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, count]) => deepFreezeArtifact({ count, value }));
}

function parseJson(line: string, label: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return fail(`${label} contains invalid JSON`);
  }
}

export function parseM1CollectorEarlyShadowProcessOutput(
  output: string,
): ParsedM1CollectorEarlyShadowProcessOutput {
  const bytes = Buffer.byteLength(output);
  if (bytes === 0 || bytes > MAX_PROCESS_OUTPUT_BYTES || !output.endsWith("\n")) {
    return fail("process output size or terminal newline is invalid");
  }
  const lines = output.slice(0, -1).split("\n");
  if (
    lines.length !== EARLY_SHADOW_CYCLE_COUNT + 1 ||
    lines.some((line) => line.length === 0 || line.includes("\r"))
  ) {
    return fail("process output must contain exactly 31 observations and one summary");
  }
  const cycles = lines.slice(0, EARLY_SHADOW_CYCLE_COUNT).map((line, index) => {
    const observation = parseM1CollectorObservationLog(
      parseJson(line, `observation ${index + 1}`),
    );
    if (serializeM1CollectorObservationLog(observation.cycle) !== line) {
      return fail(`observation ${index + 1} is not canonical JSONL`);
    }
    return observation.cycle;
  });
  const summary = parseM1CollectorProcessSummary(
    parseJson(lines.at(-1)!, "process summary"),
  );
  if (
    summary.runProfile !== "EARLY_30_MINUTES" ||
    summary.cycleCount !== EARLY_SHADOW_CYCLE_COUNT ||
    summary.restore.status !== "COLD_START"
  ) {
    return fail("process summary is not one atomic early-shadow run");
  }
  return deepFreezeArtifact({
    canonicalObservationJsonLines: `${lines.slice(0, -1).join("\n")}\n`,
    cycles,
    processOutput: output,
    summary,
  });
}

function validateAtomicSchedule(
  cycles: readonly M1CollectorWorkerCycle[],
): void {
  const workerRunIds = new Set(cycles.map((cycle) => cycle.workerRunId));
  const runtimeConfigDigests = new Set(
    cycles.map((cycle) => cycle.runtimeConfigDigest),
  );
  if (workerRunIds.size !== 1 || runtimeConfigDigests.size !== 1) {
    fail("stitched worker runs or mixed runtime configuration are forbidden");
  }
  for (const [index, cycle] of cycles.entries()) {
    if (cycle.cycleIndex !== index + 1) {
      fail("cycle indexes must be contiguous from one through thirty-one");
    }
    if (index === 0) {
      if (
        cycle.runtime.trigger !== "STARTUP_FULL" ||
        cycle.missedScheduleStarts !== 0
      ) {
        fail("the first cycle must be an unmissed full startup");
      }
      continue;
    }
    const previous = cycles[index - 1]!;
    const scheduledDelta = Date.parse(cycle.scheduledAt) -
      Date.parse(previous.scheduledAt);
    const expectedDelta = EARLY_SHADOW_INTERVAL_MS *
      (cycle.missedScheduleStarts + 1);
    if (scheduledDelta !== expectedDelta) {
      fail("scheduled cadence does not account exactly for missed starts");
    }
    if (
      Date.parse(cycle.startedAt) < Date.parse(previous.completedAt) ||
      Date.parse(cycle.completedAt) <= Date.parse(previous.completedAt)
    ) {
      fail("cycle order is overlapping or non-monotonic");
    }
  }
}

function summarizeCoverage(cycles: readonly M1CollectorWorkerCycle[]) {
  const aggregateCoverages = cycles.map((cycle) => cycle.runtime.coverage);
  const venues = [...TARGET_VENUES].sort().map((venue) => {
    const coverages = cycles.map((cycle) => {
      const coverage = cycle.runtime.coverage.venues.find(
        (item) => item.venue === venue,
      );
      if (coverage === undefined) {
        return fail(`venue ${venue} is absent from one cycle`);
      }
      return coverage;
    });
    return deepFreezeArtifact({
      maximumEligibleCount: maximum(coverages.map((item) => item.eligibleCount)),
      minimumAccountedCount: minimum(coverages.map((item) => item.accountedCount)),
      minimumCollectedCount: minimum(coverages.map((item) => item.collectedCount)),
      minimumCollectionCoverageRatio: minimum(coverages.map(
        (item) => item.collectionCoverage.ratio ?? 0,
      )),
      minimumEligibleCount: minimum(coverages.map((item) => item.eligibleCount)),
      minimumFreshCount: minimum(coverages.map((item) => item.freshCount)),
      minimumFreshCoverageRatio: minimum(coverages.map(
        (item) => item.freshCoverage.ratio ?? 0,
      )),
      minimumPriceUsabilityCoverageRatio: minimum(coverages.map(
        (item) => item.priceUsabilityCoverage.ratio ?? 0,
      )),
      minimumUsablePriceCount: minimum(coverages.map(
        (item) => item.usablePriceCount,
      )),
      providerFailureCycleCount: coverages.filter(
        (item) => item.providerFailures.length > 0,
      ).length,
      venue,
    });
  });
  return {
    aggregate: deepFreezeArtifact({
      maximumEligibleCount: maximum(
        aggregateCoverages.map((item) => item.eligibleCount),
      ),
      minimumAccountedCount: minimum(
        aggregateCoverages.map((item) => item.accountedCount),
      ),
      minimumCollectedCount: minimum(
        aggregateCoverages.map((item) => item.collectedCount),
      ),
      minimumCollectionCoverageRatio: minimum(aggregateCoverages.map(
        (item) => item.collectionCoverage.ratio ?? 0,
      )),
      minimumEligibleCount: minimum(
        aggregateCoverages.map((item) => item.eligibleCount),
      ),
      minimumFreshCount: minimum(
        aggregateCoverages.map((item) => item.freshCount),
      ),
      minimumFreshCoverageRatio: minimum(aggregateCoverages.map(
        (item) => item.freshCoverage.ratio ?? 0,
      )),
      minimumPriceUsabilityCoverageRatio: minimum(aggregateCoverages.map(
        (item) => item.priceUsabilityCoverage.ratio ?? 0,
      )),
      minimumUsablePriceCount: minimum(aggregateCoverages.map(
        (item) => item.usablePriceCount,
      )),
    }),
    venues,
  };
}

export function verifyM1CollectorEarlyShadowEvidence(
  evidence: M1CollectorEarlyShadowEvidence,
): M1CollectorEarlyShadowEvidence {
  if (!SHA256_PATTERN.test(evidence.evidenceDigest)) {
    fail("evidence digest is invalid");
  }
  const { evidenceDigest, evidenceId, ...core } = evidence;
  if (
    evidenceDigest !== stableContentHash(core) ||
    evidenceId !==
      `v2-m1-b1b0:${evidenceDigest.slice("sha256:".length)}`
  ) {
    fail("evidence content address is inconsistent");
  }
  if (
    evidence.schemaVersion !==
      M1_COLLECTOR_EARLY_SHADOW_EVIDENCE_SCHEMA_VERSION ||
    evidence.authorityMode !== "NO_AUTHORITY" ||
    evidence.automaticTradingAllowed ||
    evidence.businessGate.m1ExitClaimed ||
    evidence.capture.cycleCount !== EARLY_SHADOW_CYCLE_COUNT ||
    evidence.sourceArtifacts.observationLineCount !==
      EARLY_SHADOW_CYCLE_COUNT ||
    evidence.sourceArtifacts.processOutputLineCount !==
      EARLY_SHADOW_CYCLE_COUNT + 1
  ) {
    fail("evidence authority, scope, schema or denominator is invalid");
  }
  const expectedStatus = evidence.businessGate.conclusion === "PASS"
    ? "CAPTURE_COMPLETE_BUSINESS_PASS"
    : "CAPTURE_COMPLETE_BUSINESS_FAIL";
  if (
    evidence.status !== expectedStatus ||
    evidence.businessGate.earlyShadowSloPassed !==
      (evidence.businessGate.conclusion === "PASS") ||
    evidence.slo.conclusion !== evidence.businessGate.conclusion
  ) {
    fail("capture status cannot overstate the independent business Gate");
  }
  return evidence;
}

export function buildM1CollectorEarlyShadowEvidence(input: {
  evaluatedAt: string;
  processOutput: string;
  releaseId: string;
}): M1CollectorEarlyShadowEvidence {
  if (new Date(input.evaluatedAt).toISOString() !== input.evaluatedAt) {
    fail("evaluation time must be canonical ISO-8601");
  }
  const parsed = parseM1CollectorEarlyShadowProcessOutput(input.processOutput);
  if (
    parsed.summary.releaseId !== input.releaseId ||
    parsed.cycles.some((cycle) => cycle.releaseId !== input.releaseId)
  ) {
    fail("process, cycle and requested release identities differ");
  }
  validateAtomicSchedule(parsed.cycles);
  const slo = evaluateM1CollectorShadowEvidence({
    evaluatedAt: input.evaluatedAt,
    jsonLines: parsed.canonicalObservationJsonLines,
    profile: "EARLY_30_MINUTES",
    releaseId: input.releaseId,
  });
  if (slo.conclusion === "INSUFFICIENT_EVIDENCE") {
    fail("thirty-one-cycle evidence remains temporally insufficient");
  }
  const coverage = summarizeCoverage(parsed.cycles);
  const operationalReadyCycleCount = parsed.cycles.filter(
    (cycle) => cycle.operationalReadiness === "READY",
  ).length;
  const providerFailures = parsed.cycles.flatMap(
    (cycle) => cycle.runtime.providerFailures,
  );
  const core = deepFreezeArtifact({
    authorityMode: "NO_AUTHORITY" as const,
    automaticTradingAllowed: false as const,
    businessGate: {
      conclusion: slo.conclusion,
      earlyShadowSloPassed: slo.conclusion === "PASS",
      m1ExitClaimed: false as const,
      reasons: slo.reasons,
    },
    capture: {
      aggregate: coverage.aggregate,
      checkpointStatuses: countValues(
        parsed.cycles.map((cycle) => cycle.checkpoint.status),
      ),
      cycleCount: EARLY_SHADOW_CYCLE_COUNT as 31,
      dataQualityStates: countValues(
        parsed.cycles.map((cycle) => cycle.dataQuality),
      ),
      firstCompletedAt: parsed.cycles[0]!.completedAt,
      firstScheduledAt: parsed.cycles[0]!.scheduledAt,
      lastCompletedAt: parsed.cycles.at(-1)!.completedAt,
      lastScheduledAt: parsed.cycles.at(-1)!.scheduledAt,
      notReadyCycleCount:
        EARLY_SHADOW_CYCLE_COUNT - operationalReadyCycleCount,
      operationalReadyCycleCount,
      persistenceStates: countValues(
        parsed.cycles.map((cycle) => cycle.runtime.persistence),
      ),
      providerFailureCycleCount: parsed.cycles.filter(
        (cycle) => cycle.runtime.providerFailures.length > 0,
      ).length,
      providerFailureReasons: countValues(providerFailures.map(
        (failure) =>
          `${failure.venue}:${failure.operation}:${failure.kind}:${failure.reasonCode}`,
      )),
      runtimeReasons: countValues(parsed.cycles.flatMap(
        (cycle) => cycle.runtime.reasons,
      )),
      triggerCounts: countValues(
        parsed.cycles.map((cycle) => cycle.runtime.trigger),
      ),
      venues: coverage.venues,
      workerRunId: parsed.cycles[0]!.workerRunId,
    },
    evaluatedAt: input.evaluatedAt,
    process: parsed.summary,
    releaseId: input.releaseId,
    runtimeConfigDigest: parsed.cycles[0]!.runtimeConfigDigest,
    schemaVersion: M1_COLLECTOR_EARLY_SHADOW_EVIDENCE_SCHEMA_VERSION,
    sourceArtifacts: {
      observationBytes: Buffer.byteLength(
        parsed.canonicalObservationJsonLines,
      ),
      observationDigest: byteDigest(parsed.canonicalObservationJsonLines),
      observationLineCount: EARLY_SHADOW_CYCLE_COUNT as 31,
      processOutputBytes: Buffer.byteLength(parsed.processOutput),
      processOutputDigest: byteDigest(parsed.processOutput),
      processOutputLineCount: (EARLY_SHADOW_CYCLE_COUNT + 1) as 32,
    },
    slo,
    status: slo.conclusion === "PASS"
      ? "CAPTURE_COMPLETE_BUSINESS_PASS" as const
      : "CAPTURE_COMPLETE_BUSINESS_FAIL" as const,
  });
  const evidenceDigest = stableContentHash(core);
  return verifyM1CollectorEarlyShadowEvidence(deepFreezeArtifact({
    ...core,
    evidenceDigest,
    evidenceId: `v2-m1-b1b0:${evidenceDigest.slice("sha256:".length)}`,
  }));
}

export const M1_COLLECTOR_EARLY_SHADOW_LOCKED_POLICY =
  M1_COLLECTOR_SHADOW_SLO_POLICIES.EARLY_30_MINUTES;
