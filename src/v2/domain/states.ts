export const CANDIDATE_PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export type CandidatePriority = (typeof CANDIDATE_PRIORITIES)[number];

export const EVIDENCE_GRADES = ["A", "B", "C", "INSUFFICIENT"] as const;
export type EvidenceGrade = (typeof EVIDENCE_GRADES)[number];

export const SETUP_GRADES = [
  "PREMIUM",
  "QUALIFIED",
  "MARGINAL",
  "INVALID",
  "UNKNOWN",
] as const;
export type SetupGrade = (typeof SETUP_GRADES)[number];

export const ACTION_STATES = [
  "OBSERVE",
  "WAIT",
  "BLOCKED",
  "TRADE_PLAN_READY",
] as const;
export type ActionState = (typeof ACTION_STATES)[number];

export const USER_FITS = [
  "SUITABLE",
  "CONDITIONAL",
  "UNSUITABLE",
  "UNAVAILABLE",
] as const;
export type UserFit = (typeof USER_FITS)[number];

export const CANDIDATE_LIFECYCLE_STATES = [
  "DISCOVERED",
  "QUEUED",
  "VALIDATING",
  "EVIDENCE_READY",
  "PROMOTED",
  "REJECTED",
  "EXPIRED",
  "DATA_UNAVAILABLE",
] as const;
export type CandidateLifecycleState =
  (typeof CANDIDATE_LIFECYCLE_STATES)[number];

export const DETECTOR_LIFECYCLE_STATES = [
  "DRAFT",
  "REPLAY_VALIDATED",
  "SHADOW",
  "LIMITED",
  "ACTIVE",
  "SUSPENDED",
  "RETIRED",
] as const;
export type DetectorLifecycleState =
  (typeof DETECTOR_LIFECYCLE_STATES)[number];

export const DETECTOR_EMISSION_SCOPES = [
  "REPLAY",
  "SHADOW",
  "LIMITED",
  "PRODUCTION",
] as const;
export type DetectorEmissionScope = (typeof DETECTOR_EMISSION_SCOPES)[number];

export const DETECTOR_ALLOWED_EMISSION_SCOPES = Object.freeze({
  DRAFT: [],
  REPLAY_VALIDATED: ["REPLAY"],
  SHADOW: ["REPLAY", "SHADOW"],
  LIMITED: ["REPLAY", "SHADOW", "LIMITED"],
  ACTIVE: ["REPLAY", "SHADOW", "LIMITED", "PRODUCTION"],
  SUSPENDED: [],
  RETIRED: [],
} as const satisfies Record<DetectorLifecycleState, readonly DetectorEmissionScope[]>);

export function canDetectorEmit(
  lifecycle: DetectorLifecycleState,
  scope: DetectorEmissionScope,
): boolean {
  return (DETECTOR_ALLOWED_EMISSION_SCOPES[lifecycle] as readonly DetectorEmissionScope[])
    .includes(scope);
}

export const CANDIDATE_LIFECYCLE_TRANSITIONS = Object.freeze({
  DISCOVERED: ["QUEUED", "REJECTED", "EXPIRED", "DATA_UNAVAILABLE"],
  QUEUED: ["VALIDATING", "REJECTED", "EXPIRED", "DATA_UNAVAILABLE"],
  VALIDATING: ["EVIDENCE_READY", "REJECTED", "EXPIRED", "DATA_UNAVAILABLE"],
  EVIDENCE_READY: ["PROMOTED", "REJECTED", "EXPIRED", "DATA_UNAVAILABLE"],
  PROMOTED: [],
  REJECTED: [],
  EXPIRED: [],
  DATA_UNAVAILABLE: [],
} as const satisfies Record<CandidateLifecycleState, readonly CandidateLifecycleState[]>);

export function isCandidateLifecycleTransitionAllowed(
  previous: CandidateLifecycleState,
  next: CandidateLifecycleState,
): boolean {
  return (CANDIDATE_LIFECYCLE_TRANSITIONS[previous] as readonly CandidateLifecycleState[])
    .includes(next);
}

export const DATA_QUALITY_STATES = [
  "FRESH",
  "PARTIAL",
  "STALE",
  "UNAVAILABLE",
  "RATE_LIMITED",
  "AUTH_ERROR",
  "TRANSPORT_ERROR",
  "INVALID",
] as const;
export type DataQualityState = (typeof DATA_QUALITY_STATES)[number];

export const STATE_DIMENSIONS = Object.freeze({
  actionState: ACTION_STATES,
  candidatePriority: CANDIDATE_PRIORITIES,
  evidenceGrade: EVIDENCE_GRADES,
  setupGrade: SETUP_GRADES,
  userFit: USER_FITS,
});

export function isActionState(value: unknown): value is ActionState {
  return typeof value === "string" &&
    ACTION_STATES.some((state) => state === value);
}
