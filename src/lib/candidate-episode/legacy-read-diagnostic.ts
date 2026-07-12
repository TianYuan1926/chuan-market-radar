import { createHash } from "node:crypto";
import type { JournalEvent } from "../analysis/types";
import {
  normalizeCandidateCanonicalReadPolicy,
  type CandidateCanonicalReadPolicy,
} from "./canonical-read-model";

export const LEGACY_CANDIDATE_DIAGNOSTIC_SCHEMA_VERSION = "legacy-candidate-diagnostic.v1" as const;

export const LEGACY_UNSUPPORTED_CANONICAL_FIELDS = [
  "episodeId",
  "singleActiveEpisodeConstraint",
  "immutableFirstSeenAt",
  "observationPriceFactId",
  "venueContext",
  "releaseLineage",
  "sourceScanCycleLineage",
  "checkpointId",
  "checkpointKindCohort",
  "checkpointFencingState",
  "terminalOutcomeUniqueness",
  "evidenceGradeVersion",
  "authoritativeReviewDenominators",
  "nullSafeMfeMae",
] as const;

export type LegacyCandidateDiagnosticObservation = Readonly<{
  legacyEventId: string;
  rawInstrument: string;
  observedAt: string;
  explicitDirection: "long" | "short" | "neutral" | null;
}>;

export type LegacyCandidateDiagnosticRead = Readonly<{
  schemaVersion: typeof LEGACY_CANDIDATE_DIAGNOSTIC_SCHEMA_VERSION;
  status: "diagnostic_only" | "partial" | "empty" | "unavailable";
  authority: "legacy_projection_non_authoritative";
  allowedUse: "compatibility_diagnostics_only";
  canProveCanonicalParity: false;
  canAuthorizeCutover: false;
  canCreateTradePlan: false;
  canMutateLiveRanking: false;
  requestedPolicy: CandidateCanonicalReadPolicy | null;
  diagnosticOverlapFields: readonly [
    "legacyEventId",
    "rawInstrument",
    "observedAt",
    "explicitDirection",
  ];
  unsupportedCanonicalFields: typeof LEGACY_UNSUPPORTED_CANONICAL_FIELDS;
  observations: readonly LegacyCandidateDiagnosticObservation[] | null;
  blockers: readonly string[];
  contentHash: string | null;
}>;

function hash(value: unknown) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function unavailable(): LegacyCandidateDiagnosticRead {
  return {
    schemaVersion: LEGACY_CANDIDATE_DIAGNOSTIC_SCHEMA_VERSION,
    status: "unavailable",
    authority: "legacy_projection_non_authoritative",
    allowedUse: "compatibility_diagnostics_only",
    canProveCanonicalParity: false,
    canAuthorizeCutover: false,
    canCreateTradePlan: false,
    canMutateLiveRanking: false,
    requestedPolicy: null,
    diagnosticOverlapFields: [
      "legacyEventId",
      "rawInstrument",
      "observedAt",
      "explicitDirection",
    ],
    unsupportedCanonicalFields: LEGACY_UNSUPPORTED_CANONICAL_FIELDS,
    observations: null,
    blockers: ["legacy_diagnostic_input_invalid"],
    contentHash: null,
  };
}

export function buildLegacyCandidateDiagnosticRead({
  events,
  policy,
}: {
  events: readonly JournalEvent[];
  policy: CandidateCanonicalReadPolicy;
}): LegacyCandidateDiagnosticRead {
  let requestedPolicy: CandidateCanonicalReadPolicy;
  try {
    requestedPolicy = normalizeCandidateCanonicalReadPolicy(policy);
  } catch {
    return unavailable();
  }

  const from = Date.parse(requestedPolicy.observationCohort.from);
  const toExclusive = Date.parse(requestedPolicy.observationCohort.toExclusive);
  const asOf = Date.parse(requestedPolicy.asOf);
  const blockers = [
    "legacy_release_lineage_unavailable",
    "legacy_checkpoint_cohort_unavailable",
    "legacy_evidence_grade_policy_unavailable",
    "legacy_authoritative_denominators_unavailable",
  ];
  const observations: LegacyCandidateDiagnosticObservation[] = [];

  for (const event of events) {
    const observedAt = Date.parse(event.createdAt);
    if (!Number.isFinite(observedAt)) {
      blockers.push(`legacy_event_timestamp_invalid:${event.id}`);
      continue;
    }
    if (observedAt < from || observedAt >= toExclusive || observedAt > asOf) continue;
    if (!event.id.trim() || !event.symbol.trim()) {
      blockers.push(`legacy_event_identity_invalid:${event.id || "missing"}`);
      continue;
    }
    observations.push({
      legacyEventId: event.id,
      rawInstrument: event.symbol,
      observedAt: new Date(observedAt).toISOString(),
      explicitDirection: event.direction ?? null,
    });
  }
  observations.sort((left, right) => (
    left.observedAt.localeCompare(right.observedAt)
      || left.legacyEventId.localeCompare(right.legacyEventId)
  ));
  const hasInvalidRows = blockers.some((blocker) => blocker.startsWith("legacy_event_"));
  const status = hasInvalidRows ? "partial" : observations.length === 0 ? "empty" : "diagnostic_only";
  return {
    schemaVersion: LEGACY_CANDIDATE_DIAGNOSTIC_SCHEMA_VERSION,
    status,
    authority: "legacy_projection_non_authoritative",
    allowedUse: "compatibility_diagnostics_only",
    canProveCanonicalParity: false,
    canAuthorizeCutover: false,
    canCreateTradePlan: false,
    canMutateLiveRanking: false,
    requestedPolicy,
    diagnosticOverlapFields: [
      "legacyEventId",
      "rawInstrument",
      "observedAt",
      "explicitDirection",
    ],
    unsupportedCanonicalFields: LEGACY_UNSUPPORTED_CANONICAL_FIELDS,
    observations,
    blockers: [...new Set(blockers)],
    contentHash: hash({ requestedPolicy, observations, unsupported: LEGACY_UNSUPPORTED_CANONICAL_FIELDS }),
  };
}
