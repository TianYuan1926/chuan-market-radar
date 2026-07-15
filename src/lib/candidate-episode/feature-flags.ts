export const CANDIDATE_FEATURE_FLAG_NAMES = [
  "CANDIDATE_EPISODE_CANONICAL_WRITE",
  "CANDIDATE_EPISODE_SHADOW_WRITE",
  "CANDIDATE_EPISODE_DUAL_READ",
  "CANDIDATE_EPISODE_CANONICAL_READ",
  "CANDIDATE_EPISODE_REVIEW_READ",
] as const;

export type CandidateFeatureFlagName = (typeof CANDIDATE_FEATURE_FLAG_NAMES)[number];
export type CandidateFeatureFlags = Readonly<Record<CandidateFeatureFlagName, boolean>>;

export const CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED = true as const;

export const CANDIDATE_AUTHORITY_PHASES = [
  "legacy",
  "shadow_capture",
  "shadow_verify",
  "canonical_compat",
  "canonical",
] as const;

export type CandidateAuthorityPhase = (typeof CANDIDATE_AUTHORITY_PHASES)[number];

export const CANDIDATE_DUAL_PROJECTION_DEADLINE_MS = 72 * 60 * 60 * 1_000;
export const CANDIDATE_CLEAN_WINDOW_MS = 24 * 60 * 60 * 1_000;
export const CANDIDATE_MINIMUM_WRITE_ATTEMPTS = 10_000;

export type CandidateCutoverEligibilityReason =
  | "comparison_differences"
  | "deadline_exceeded"
  | "deadline_mismatch"
  | "insufficient_clean_window"
  | "insufficient_write_attempts"
  | "invalid_input";

export type CandidateCutoverEligibility = Readonly<{
  eligible: boolean;
  status: "blocked" | "eligible" | "expired" | "invalid";
  expectedDeadlineAt: string | null;
  cleanWindowMs: number | null;
  reasons: readonly CandidateCutoverEligibilityReason[];
}>;

const disabledCandidateFeatureFlags: CandidateFeatureFlags = Object.freeze({
  CANDIDATE_EPISODE_CANONICAL_WRITE: false,
  CANDIDATE_EPISODE_SHADOW_WRITE: false,
  CANDIDATE_EPISODE_DUAL_READ: false,
  CANDIDATE_EPISODE_CANONICAL_READ: false,
  CANDIDATE_EPISODE_REVIEW_READ: false,
});

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isAuthorityEpoch(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function invalidCutoverEligibility(
  expectedDeadlineAt: string | null,
  reason: "deadline_mismatch" | "invalid_input",
): CandidateCutoverEligibility {
  return {
    eligible: false,
    status: "invalid",
    expectedDeadlineAt,
    cleanWindowMs: null,
    reasons: [reason],
  };
}

export function isCandidateAuthorityPhase(value: unknown): value is CandidateAuthorityPhase {
  return (
    typeof value === "string" &&
    CANDIDATE_AUTHORITY_PHASES.includes(value as CandidateAuthorityPhase)
  );
}

export function isMonotonicCandidateAuthorityEpoch(
  currentEpoch: unknown,
  nextEpoch: unknown,
): boolean {
  return (
    isAuthorityEpoch(currentEpoch) &&
    isAuthorityEpoch(nextEpoch) &&
    nextEpoch > currentEpoch
  );
}

export function isCurrentCandidateAuthorityEpoch(
  expectedEpoch: unknown,
  actualEpoch: unknown,
): boolean {
  return (
    isAuthorityEpoch(expectedEpoch) &&
    isAuthorityEpoch(actualEpoch) &&
    expectedEpoch === actualEpoch
  );
}

export function calculateCandidateCutoverDeadline(shadowStartedAt: unknown): string | null {
  const startedAtMs = parseTimestamp(shadowStartedAt);
  if (startedAtMs === null) {
    return null;
  }

  return new Date(startedAtMs + CANDIDATE_DUAL_PROJECTION_DEADLINE_MS).toISOString();
}

export function calculateCandidateCutoverEligibility(
  input: unknown,
): CandidateCutoverEligibility {
  if (!isPlainRecord(input)) {
    return invalidCutoverEligibility(null, "invalid_input");
  }

  const {
    shadowStartedAt,
    deadlineAt,
    evaluatedAt,
    cleanWindowStartedAt,
    comparisonDiffCount,
    writeAttempts,
  } = input;
  const startedAtMs = parseTimestamp(shadowStartedAt);
  const deadlineAtMs = parseTimestamp(deadlineAt);
  const evaluatedAtMs = parseTimestamp(evaluatedAt);
  const cleanWindowStartedAtMs = parseTimestamp(cleanWindowStartedAt);
  const expectedDeadlineAt = calculateCandidateCutoverDeadline(shadowStartedAt);

  if (
    startedAtMs === null ||
    deadlineAtMs === null ||
    evaluatedAtMs === null ||
    cleanWindowStartedAtMs === null ||
    !isAuthorityEpoch(comparisonDiffCount) ||
    !isAuthorityEpoch(writeAttempts) ||
    evaluatedAtMs < startedAtMs ||
    cleanWindowStartedAtMs < startedAtMs ||
    cleanWindowStartedAtMs > evaluatedAtMs
  ) {
    return invalidCutoverEligibility(expectedDeadlineAt, "invalid_input");
  }

  const expectedDeadlineAtMs = startedAtMs + CANDIDATE_DUAL_PROJECTION_DEADLINE_MS;
  if (deadlineAtMs !== expectedDeadlineAtMs) {
    return invalidCutoverEligibility(expectedDeadlineAt, "deadline_mismatch");
  }

  const cleanWindowMs = evaluatedAtMs - cleanWindowStartedAtMs;
  if (evaluatedAtMs > deadlineAtMs) {
    return {
      eligible: false,
      status: "expired",
      expectedDeadlineAt,
      cleanWindowMs,
      reasons: ["deadline_exceeded"],
    };
  }

  const reasons: CandidateCutoverEligibilityReason[] = [];
  if (cleanWindowMs < CANDIDATE_CLEAN_WINDOW_MS) {
    reasons.push("insufficient_clean_window");
  }
  if (comparisonDiffCount > 0) {
    reasons.push("comparison_differences");
  }
  if (writeAttempts < CANDIDATE_MINIMUM_WRITE_ATTEMPTS) {
    reasons.push("insufficient_write_attempts");
  }

  return {
    eligible: reasons.length === 0,
    status: reasons.length === 0 ? "eligible" : "blocked",
    expectedDeadlineAt,
    cleanWindowMs,
    reasons,
  };
}

export function resolveCandidateFeatureFlags({
  environment,
  explicitRehearsalEnablement = false,
  requested,
}: {
  environment: string;
  explicitRehearsalEnablement?: boolean;
  requested?: unknown;
}): CandidateFeatureFlags {
  if (
    environment !== "rehearsal" ||
    explicitRehearsalEnablement !== true ||
    !isPlainRecord(requested)
  ) {
    return disabledCandidateFeatureFlags;
  }

  const requestedKeys = Object.keys(requested);
  if (
    requestedKeys.some(
      (key) => !CANDIDATE_FEATURE_FLAG_NAMES.includes(key as CandidateFeatureFlagName),
    ) ||
    requestedKeys.some((key) => typeof requested[key] !== "boolean")
  ) {
    return disabledCandidateFeatureFlags;
  }

  return Object.freeze(
    Object.fromEntries(
      CANDIDATE_FEATURE_FLAG_NAMES.map((name) => [name, requested[name] === true]),
    ) as Record<CandidateFeatureFlagName, boolean>,
  );
}
