import { deepFreezeArtifact } from "../../universe/stable-artifact";
import {
  parseM1CollectorObservationLog,
} from "./collector-observation-log";
import {
  type CollectorSloPolicy,
  evaluateM1CollectorSlo,
  type M1CollectorSloReport,
} from "./collector-slo";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const M1_COLLECTOR_SHADOW_SLO_POLICIES = deepFreezeArtifact({
  EARLY_30_MINUTES: {
    maxMissedScheduleStarts: 0,
    maxP95CycleDurationMs: 30_000,
    maxProviderFailureCycleRatio: 0,
    maxRssBytes: 512 * 1024 * 1024,
    maxScheduleLagMs: 5_000,
    minCheckpointRatio: 1,
    minCycles: 30,
    minFreshCoverageRatio: 1,
    minObservationMs: 30 * MINUTE_MS,
    minOperationalReadyRatio: 1,
  },
  SUSTAINED_24_HOURS: {
    maxMissedScheduleStarts: 0,
    maxP95CycleDurationMs: 30_000,
    maxProviderFailureCycleRatio: 0.005,
    maxRssBytes: 512 * 1024 * 1024,
    maxScheduleLagMs: 5_000,
    minCheckpointRatio: 1,
    minCycles: 1_200,
    minFreshCoverageRatio: 1,
    minObservationMs: 24 * HOUR_MS,
    minOperationalReadyRatio: 0.995,
  },
} satisfies Readonly<Record<string, CollectorSloPolicy>>);

export type M1CollectorShadowSloProfile =
  keyof typeof M1_COLLECTOR_SHADOW_SLO_POLICIES;

export function parseM1CollectorObservationJsonLines(
  input: string,
) {
  const lines = input.split(/\r?\n/u).filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    throw new Error("collector observation evidence is empty");
  }
  return deepFreezeArtifact(lines.map((line) => {
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      throw new Error("collector observation evidence contains invalid JSON");
    }
    return parseM1CollectorObservationLog(value).cycle;
  }));
}

export function evaluateM1CollectorShadowEvidence(input: {
  evaluatedAt: string;
  jsonLines: string;
  profile: M1CollectorShadowSloProfile;
  releaseId: string;
}): M1CollectorSloReport {
  return evaluateM1CollectorSlo({
    cycles: parseM1CollectorObservationJsonLines(input.jsonLines),
    evaluatedAt: input.evaluatedAt,
    policy: M1_COLLECTOR_SHADOW_SLO_POLICIES[input.profile],
    releaseId: input.releaseId,
  });
}
