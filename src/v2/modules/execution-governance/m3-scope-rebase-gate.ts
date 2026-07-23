import { z } from "zod";
import {
  M1_ASSET_DOMAINS,
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
} from "../source-capability/source-capability-contract";
import { M1_LISTING_LIFECYCLE_STATES } from "../multi-asset-universe/multi-asset-identity-contract";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";

export const M3_SCOPE_REBASE_GATE_VERSION =
  "v2-m3-scope-rebase-gate.v1" as const;
export const M3_SCOPE_REBASE_RESULT_VERSION =
  "v2-m3-scope-rebase-result.v1" as const;
export const M3_SCOPE_REBASE_AUTHORITY =
  "GOVERNANCE_ONLY_NO_FEASIBILITY_SIGNAL_STRATEGY_OR_READY_AUTHORITY" as const;

export const M3_SCOPE_REBASE_ACCEPTANCE_AXES = Object.freeze([
  "BITGET_VENUE",
  "LISTING_LIFECYCLE",
  "EQUITY_ASSET_DOMAIN",
  "DATA_MAXIMIZATION",
] as const);

export const M3_SCOPE_REBASE_COMMON_REQUIREMENTS = Object.freeze([
  "VENUE_CAPABILITY_AND_IDENTITY",
  "LISTING_LIFECYCLE",
  "RUNTIME_ADAPTER",
  "MULTI_ASSET_SHADOW",
  "EXPANDED_SCOPE_CAPACITY",
  "POINT_IN_TIME_FACTS",
  "DATA_MAXIMIZATION_LINEAGE",
  "DOMAIN_DETECTOR_COHORT",
  "DOMAIN_UNTOUCHED_HOLDOUT",
  "DOMAIN_ANALYSIS",
  "DOMAIN_QUALIFICATION",
  "DOMAIN_STRATEGY",
  "JURISDICTION_AVAILABILITY",
  "EXECUTION_COST_MODEL",
] as const);

export const M3_SCOPE_REBASE_CRYPTO_REQUIREMENTS = Object.freeze([
  "MARK_INDEX_REFERENCE",
  "FUNDING_FEE_SCHEDULE",
  "DEPTH_SLIPPAGE",
] as const);

export const M3_SCOPE_REBASE_EQUITY_REQUIREMENTS = Object.freeze([
  "TRADITIONAL_MARKET_SESSION",
  "UNDERLYING_REFERENCE",
  "CORPORATE_ACTION",
  "FX_REFERENCE",
  "CLOSED_SESSION_BASIS",
  "CONTRACT_SPECIFICATIONS",
  "FUNDING_FEE_SLIPPAGE",
] as const);

export const M3_SCOPE_REBASE_WARMUP_REQUIREMENT =
  "LISTING_WARMUP_EXECUTION_CALIBRATION" as const;

export const M3_SCOPE_REBASE_REQUIREMENT_IDS = Object.freeze([
  ...M3_SCOPE_REBASE_COMMON_REQUIREMENTS,
  ...M3_SCOPE_REBASE_CRYPTO_REQUIREMENTS,
  ...M3_SCOPE_REBASE_EQUITY_REQUIREMENTS,
  M3_SCOPE_REBASE_WARMUP_REQUIREMENT,
] as const);

const M3_EXECUTION_ELIGIBLE_ASSET_DOMAINS = Object.freeze([
  "CRYPTO_LINEAR_PERPETUAL",
  "EQUITY_SINGLE_NAME_PERPETUAL",
  "EQUITY_INDEX_ETF_PERPETUAL",
] as const);

const M3_EQUITY_ASSET_DOMAINS = Object.freeze([
  "EQUITY_SINGLE_NAME_PERPETUAL",
  "EQUITY_INDEX_ETF_PERPETUAL",
] as const);

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const RequirementIdSchema = z.enum(M3_SCOPE_REBASE_REQUIREMENT_IDS);
const AssetDomainSchema = z.enum(M1_ASSET_DOMAINS);
const VenueSchema = z.enum(M1_VENUE_SOURCE_IDS);

const EvidenceReferenceSchema = z.strictObject({
  evidenceId: NonEmptyStringSchema,
  releaseId: NonEmptyStringSchema,
  digest: DigestSchema,
});

const ScopeRebaseProofSchema = z.strictObject({
  requirementId: RequirementIdSchema,
  status: z.enum(["PASS", "BLOCKED", "UNAVAILABLE"]),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  venue: VenueSchema,
  assetDomain: AssetDomainSchema,
  lifecycleState: z.enum(M1_LISTING_LIFECYCLE_STATES),
  releaseId: NonEmptyStringSchema,
  evidenceRefs: z.array(EvidenceReferenceSchema).max(32),
  reasonCodes: ReasonCodesSchema,
}).superRefine((proof, context) => {
  if (proof.status === "PASS" && proof.evidenceRefs.length === 0) {
    context.addIssue({
      code: "custom",
      message: "PASS scope-rebase proof requires immutable evidence references",
      path: ["evidenceRefs"],
    });
  }
  const evidenceKeys = proof.evidenceRefs.map((reference) =>
    `${reference.releaseId}:${reference.evidenceId}:${reference.digest}`);
  if (new Set(evidenceKeys).size !== evidenceKeys.length) {
    context.addIssue({
      code: "custom",
      message: "scope-rebase evidence references must be unique",
      path: ["evidenceRefs"],
    });
  }
  if (proof.evidenceRefs.some((reference) =>
    reference.releaseId !== proof.releaseId)) {
    context.addIssue({
      code: "custom",
      message: "scope-rebase evidence must bind the proof release",
      path: ["evidenceRefs"],
    });
  }
  if (new Set(proof.reasonCodes).size !== proof.reasonCodes.length) {
    context.addIssue({
      code: "custom",
      message: "scope-rebase reason codes must be unique",
      path: ["reasonCodes"],
    });
  }
});

export const M3ScopeRebaseInputSchema = z.strictObject({
  schemaVersion: z.literal(M3_SCOPE_REBASE_GATE_VERSION),
  reviewId: NonEmptyStringSchema,
  assessedAt: IsoDateTimeSchema,
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: NonEmptyStringSchema,
  venue: VenueSchema,
  assetDomain: AssetDomainSchema,
  lifecycleState: z.enum(M1_LISTING_LIFECYCLE_STATES),
  proofs: z.array(ScopeRebaseProofSchema),
}).superRefine((input, context) => {
  const requirementIds = input.proofs.map((proof) => proof.requirementId);
  if (new Set(requirementIds).size !== requirementIds.length) {
    context.addIssue({
      code: "custom",
      message: "scope-rebase requirements must appear at most once",
      path: ["proofs"],
    });
  }
});

export type M3ScopeRebaseInput = z.infer<typeof M3ScopeRebaseInputSchema>;
export type M3ScopeRebaseRequirementId =
  (typeof M3_SCOPE_REBASE_REQUIREMENT_IDS)[number];

export type M3ScopeRebaseIssue = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type M3ScopeRebaseResult = Readonly<{
  schemaVersion: typeof M3_SCOPE_REBASE_RESULT_VERSION;
  status:
    | "READY_FOR_SCOPE_V2_M3_4_CONTRACT_IMPLEMENTATION"
    | "BLOCKED_SCOPE_REBASE";
  authority: typeof M3_SCOPE_REBASE_AUTHORITY;
  reviewId: string | null;
  scopeEpoch: typeof M1_SCOPE_EPOCH | null;
  releaseId: string | null;
  venue: (typeof M1_VENUE_SOURCE_IDS)[number] | null;
  assetDomain: (typeof M1_ASSET_DOMAINS)[number] | null;
  lifecycleState: (typeof M1_LISTING_LIFECYCLE_STATES)[number] | null;
  acceptanceAxes: typeof M3_SCOPE_REBASE_ACCEPTANCE_AXES;
  requiredRequirementIds: readonly M3ScopeRebaseRequirementId[];
  passedRequirementIds: readonly M3ScopeRebaseRequirementId[];
  blockers: readonly string[];
  issues: readonly M3ScopeRebaseIssue[];
  resultHash: string;
}>;

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

function result(
  body: Omit<M3ScopeRebaseResult, "resultHash">,
): M3ScopeRebaseResult {
  return deepFreezeArtifact({
    ...body,
    resultHash: stableContentHash(body),
  });
}

function invalidInputResult(
  issues: readonly M3ScopeRebaseIssue[],
): M3ScopeRebaseResult {
  const sortedIssues = [...issues].sort((left, right) =>
    `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`));
  return result({
    schemaVersion: M3_SCOPE_REBASE_RESULT_VERSION,
    status: "BLOCKED_SCOPE_REBASE",
    authority: M3_SCOPE_REBASE_AUTHORITY,
    reviewId: null,
    scopeEpoch: null,
    releaseId: null,
    venue: null,
    assetDomain: null,
    lifecycleState: null,
    acceptanceAxes: M3_SCOPE_REBASE_ACCEPTANCE_AXES,
    requiredRequirementIds: [],
    passedRequirementIds: [],
    blockers: ["m3_scope_rebase_input_schema_rejected"],
    issues: sortedIssues,
  });
}

export function requiredM3ScopeRebaseRequirements(
  assetDomain: (typeof M1_ASSET_DOMAINS)[number],
  lifecycleState: (typeof M1_LISTING_LIFECYCLE_STATES)[number],
): readonly M3ScopeRebaseRequirementId[] {
  const domainRequirements = assetDomain === "CRYPTO_LINEAR_PERPETUAL"
    ? M3_SCOPE_REBASE_CRYPTO_REQUIREMENTS
    : M3_EQUITY_ASSET_DOMAINS.includes(
      assetDomain as (typeof M3_EQUITY_ASSET_DOMAINS)[number],
    )
      ? M3_SCOPE_REBASE_EQUITY_REQUIREMENTS
      : [];
  return uniqueSorted([
    ...M3_SCOPE_REBASE_COMMON_REQUIREMENTS,
    ...domainRequirements,
    ...(lifecycleState === "TRADING_WARMUP"
      ? [M3_SCOPE_REBASE_WARMUP_REQUIREMENT]
      : []),
  ]);
}

function lifecycleBlocker(
  lifecycleState: (typeof M1_LISTING_LIFECYCLE_STATES)[number],
): string | null {
  if (lifecycleState === "ESTABLISHED" || lifecycleState === "TRADING_WARMUP") {
    return null;
  }
  return `lifecycle_not_execution_eligible:${lifecycleState.toLowerCase()}`;
}

export function assessM3ScopeRebaseReadiness(
  input: unknown,
): M3ScopeRebaseResult {
  const parsed = M3ScopeRebaseInputSchema.safeParse(input);
  if (!parsed.success) {
    return invalidInputResult(parsed.error.issues.map((schemaIssue) => ({
      code: "m3_scope_rebase_input_schema_rejected",
      path: schemaIssue.path.length === 0 ? "$" : schemaIssue.path.join("."),
      message: schemaIssue.message,
    })));
  }

  const value = parsed.data;
  const requiredRequirementIds = requiredM3ScopeRebaseRequirements(
    value.assetDomain,
    value.lifecycleState,
  );
  const requiredSet = new Set<M3ScopeRebaseRequirementId>(
    requiredRequirementIds,
  );
  const proofByRequirement = new Map(
    value.proofs.map((proof) => [proof.requirementId, proof]),
  );
  const blockers: string[] = [];
  const passedRequirementIds: M3ScopeRebaseRequirementId[] = [];

  if (
    !M3_EXECUTION_ELIGIBLE_ASSET_DOMAINS.includes(
      value.assetDomain as
        (typeof M3_EXECUTION_ELIGIBLE_ASSET_DOMAINS)[number],
    )
  ) {
    blockers.push(
      `asset_domain_not_execution_eligible:${value.assetDomain.toLowerCase()}`,
    );
  }
  const lifecycleReason = lifecycleBlocker(value.lifecycleState);
  if (lifecycleReason) blockers.push(lifecycleReason);

  for (const proof of value.proofs) {
    if (!requiredSet.has(proof.requirementId)) {
      blockers.push(
        `unexpected_scope_rebase_requirement:${proof.requirementId.toLowerCase()}`,
      );
    }
  }

  for (const requirementId of requiredRequirementIds) {
    const proof = proofByRequirement.get(requirementId);
    if (!proof) {
      blockers.push(`missing_scope_rebase_requirement:${requirementId.toLowerCase()}`);
      continue;
    }
    if (
      proof.scopeEpoch !== value.scopeEpoch ||
      proof.releaseId !== value.releaseId ||
      proof.venue !== value.venue ||
      proof.assetDomain !== value.assetDomain ||
      proof.lifecycleState !== value.lifecycleState
    ) {
      blockers.push(`scope_rebase_binding_mismatch:${requirementId.toLowerCase()}`);
      continue;
    }
    if (proof.status !== "PASS") {
      blockers.push(
        `scope_rebase_requirement_${proof.status.toLowerCase()}:${requirementId.toLowerCase()}`,
      );
      continue;
    }
    passedRequirementIds.push(requirementId);
  }

  const normalizedBlockers = uniqueSorted(blockers);
  return result({
    schemaVersion: M3_SCOPE_REBASE_RESULT_VERSION,
    status: normalizedBlockers.length === 0
      ? "READY_FOR_SCOPE_V2_M3_4_CONTRACT_IMPLEMENTATION"
      : "BLOCKED_SCOPE_REBASE",
    authority: M3_SCOPE_REBASE_AUTHORITY,
    reviewId: value.reviewId,
    scopeEpoch: value.scopeEpoch,
    releaseId: value.releaseId,
    venue: value.venue,
    assetDomain: value.assetDomain,
    lifecycleState: value.lifecycleState,
    acceptanceAxes: M3_SCOPE_REBASE_ACCEPTANCE_AXES,
    requiredRequirementIds,
    passedRequirementIds: uniqueSorted(passedRequirementIds),
    blockers: normalizedBlockers,
    issues: [],
  });
}
