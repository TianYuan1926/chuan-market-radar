import { createHash } from "node:crypto";
import type {
  CandidateCanonicalReadPolicy,
  CandidateCanonicalReadResult,
  CandidateReadParity,
} from "./canonical-read-model";
import type { LegacyCandidateDiagnosticRead } from "./legacy-read-diagnostic";

export const CANDIDATE_CANONICAL_API_RESOURCE_SCHEMA_VERSION =
  "candidate-canonical-api-resource.v1" as const;

export type CandidateReadResourceMode =
  | "legacy_only"
  | "dual_read_legacy_authority"
  | "canonical_compat_candidate"
  | "canonical_authority";

export type CandidateReadResourceSource = "legacy" | "legacy_fallback" | "candidate";

export type CandidateReadResourceInput = Readonly<{
  mode: CandidateReadResourceMode;
  source: CandidateReadResourceSource;
  result: CandidateCanonicalReadResult | LegacyCandidateDiagnosticRead;
  parity: CandidateReadParity | null;
  routeBlockers?: readonly string[];
}>;

export type CandidateCanonicalApiResource = Readonly<{
  schemaVersion: typeof CANDIDATE_CANONICAL_API_RESOURCE_SCHEMA_VERSION;
  status: "ready" | "partial" | "unavailable" | "diagnostic_only" | "empty";
  mode: CandidateReadResourceMode;
  readSource: CandidateReadResourceSource | "none";
  authority:
    | "candidate_authority"
    | "legacy_projection_non_authoritative"
    | "resource_contract_unavailable";
  allowedUse:
    | "candidate_lifecycle_and_review_only"
    | "compatibility_diagnostics_only"
    | "none";
  policy: CandidateCanonicalReadPolicy | null;
  parity: CandidateReadParity | null;
  data: Readonly<{
    candidateCanonical: CandidateCanonicalReadResult | null;
    legacyDiagnostic: LegacyCandidateDiagnosticRead | null;
  }>;
  candidateCanonicalReviewUsable: boolean;
  canAuthorizeCutover: false;
  canCreateTradePlan: false;
  canMutateLiveRanking: false;
  automaticPhaseAdvance: false;
  blockers: readonly string[];
  contentHash: string;
}>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]));
  }
  if (typeof value === "number" && Object.is(value, -0)) return 0;
  return value;
}

function hash(value: unknown) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex")}`;
}

function isLegacy(
  result: CandidateReadResourceInput["result"],
): result is LegacyCandidateDiagnosticRead {
  return result.authority === "legacy_projection_non_authoritative";
}

function isCandidate(
  result: CandidateReadResourceInput["result"],
): result is CandidateCanonicalReadResult {
  return result.authority === "candidate_authority";
}

function validHash(value: string | null) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function parityPass(parity: CandidateReadParity | null) {
  return parity?.status === "pass"
    && parity.differenceCount === 0
    && parity.differences.length === 0
    && validHash(parity.comparisonHash);
}

function validResultBoundary(result: CandidateReadResourceInput["result"]) {
  if (result.canCreateTradePlan !== false || result.canMutateLiveRanking !== false) return false;
  if (isLegacy(result)) {
    if (result.allowedUse !== "compatibility_diagnostics_only"
        || result.canProveCanonicalParity !== false
        || result.canAuthorizeCutover !== false) return false;
    if (result.status === "unavailable") {
      return result.requestedPolicy === null
        && result.observations === null
        && result.contentHash === null;
    }
    return result.requestedPolicy !== null
      && Array.isArray(result.observations)
      && validHash(result.contentHash);
  }
  if (result.allowedUse !== "candidate_lifecycle_and_review_only") return false;
  if (result.status === "unavailable") {
    return result.policy === null
      && result.episodes === null
      && result.page === null
      && result.review === null
      && result.contentHash === null;
  }
  return result.policy !== null
    && Array.isArray(result.episodes)
    && result.page !== null
    && result.review !== null
    && validHash(result.contentHash);
}

function validCombination(input: CandidateReadResourceInput) {
  if (!validResultBoundary(input.result)) return false;
  if (input.mode === "legacy_only") {
    return input.source === "legacy" && isLegacy(input.result) && input.parity === null;
  }
  if (input.mode === "dual_read_legacy_authority") {
    return input.source === "legacy" && isLegacy(input.result) && input.parity !== null;
  }
  if (input.mode === "canonical_compat_candidate") {
    if (input.source === "candidate") {
      return isCandidate(input.result)
        && input.result.status === "ready"
        && parityPass(input.parity);
    }
    return input.source === "legacy_fallback"
      && isLegacy(input.result)
      && input.parity !== null
      && !parityPass(input.parity);
  }
  return input.source === "candidate" && isCandidate(input.result) && input.parity === null;
}

function unavailableResource(
  mode: CandidateReadResourceMode,
  blockers: readonly string[],
): CandidateCanonicalApiResource {
  const body = {
    schemaVersion: CANDIDATE_CANONICAL_API_RESOURCE_SCHEMA_VERSION,
    status: "unavailable",
    mode,
    readSource: "none",
    authority: "resource_contract_unavailable",
    allowedUse: "none",
    policy: null,
    parity: null,
    data: { candidateCanonical: null, legacyDiagnostic: null },
    candidateCanonicalReviewUsable: false,
    canAuthorizeCutover: false,
    canCreateTradePlan: false,
    canMutateLiveRanking: false,
    automaticPhaseAdvance: false,
    blockers: [...new Set(["candidate_read_resource_contract_invalid", ...blockers])].sort(),
  } as const;
  return { ...body, contentHash: hash(body) };
}

export function buildCandidateCanonicalApiResource(
  input: CandidateReadResourceInput,
): CandidateCanonicalApiResource {
  const routeBlockers = [...new Set(input.routeBlockers ?? [])].sort();
  if (!validCombination(input)) {
    return unavailableResource(input.mode, routeBlockers);
  }

  if (isLegacy(input.result)) {
    const blockers = [...new Set([
      "legacy_projection_non_authoritative",
      ...input.result.blockers,
      ...routeBlockers,
      ...(input.source === "legacy_fallback" ? ["candidate_reference_parity_not_pass"] : []),
    ])].sort();
    const body = {
      schemaVersion: CANDIDATE_CANONICAL_API_RESOURCE_SCHEMA_VERSION,
      status: input.result.status,
      mode: input.mode,
      readSource: input.source,
      authority: "legacy_projection_non_authoritative",
      allowedUse: "compatibility_diagnostics_only",
      policy: input.result.requestedPolicy,
      parity: input.parity,
      data: { candidateCanonical: null, legacyDiagnostic: input.result },
      candidateCanonicalReviewUsable: false,
      canAuthorizeCutover: false,
      canCreateTradePlan: false,
      canMutateLiveRanking: false,
      automaticPhaseAdvance: false,
      blockers,
    } as const;
    return { ...body, contentHash: hash(body) };
  }

  const blockers = [...new Set([
    ...(input.result.status === "unavailable" ? [input.result.reason] : input.result.blockers),
    ...routeBlockers,
  ])].sort();
  const body = {
    schemaVersion: CANDIDATE_CANONICAL_API_RESOURCE_SCHEMA_VERSION,
    status: input.result.status,
    mode: input.mode,
    readSource: "candidate",
    authority: "candidate_authority",
    allowedUse: "candidate_lifecycle_and_review_only",
    policy: input.result.policy,
    parity: input.parity,
    data: { candidateCanonical: input.result, legacyDiagnostic: null },
    candidateCanonicalReviewUsable: input.result.status === "ready",
    canAuthorizeCutover: false,
    canCreateTradePlan: false,
    canMutateLiveRanking: false,
    automaticPhaseAdvance: false,
    blockers,
  } as const;
  return { ...body, contentHash: hash(body) };
}
