import { z } from "zod";
import {
  OPPORTUNITY_FAMILIES,
  OPPORTUNITY_PATTERNS,
} from "../../domain/product-constitution";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  PositiveDecimalStringSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";
import {
  M1_ASSET_DOMAINS,
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
} from "../source-capability/source-capability-contract";
import {
  M1_LISTING_LIFECYCLE_STATES,
} from "../multi-asset-universe/multi-asset-identity-contract";

export const M3_MULTI_ASSET_DECISION_AUTHORITY =
  "RESEARCH_ONLY_NO_CANDIDATE_SIGNAL_STRATEGY_READY_OR_EXECUTION_AUTHORITY" as const;

export const M3_MULTI_ASSET_DECISION_LANES = [
  "FOUR_VENUE_ESTABLISHED_CRYPTO",
  "CRYPTO_LISTING_WARMUP",
  "SINGLE_NAME_EQUITY_ESTABLISHED",
  "EQUITY_INDEX_ETF_ESTABLISHED",
] as const;

export const M3_MULTI_ASSET_EXECUTION_DOMAINS = [
  "CRYPTO_LINEAR_PERPETUAL",
  "EQUITY_SINGLE_NAME_PERPETUAL",
  "EQUITY_INDEX_ETF_PERPETUAL",
] as const;

export const M3_MULTI_ASSET_EQUITY_DOMAINS = [
  "EQUITY_SINGLE_NAME_PERPETUAL",
  "EQUITY_INDEX_ETF_PERPETUAL",
] as const;

export const M3_MULTI_ASSET_OPPORTUNITY_FAMILIES = [
  ...OPPORTUNITY_FAMILIES,
  "LISTING_AND_VENUE_EVENT",
  "EQUITY_EVENT_AND_BASIS",
] as const;

export const M3_MULTI_ASSET_OPPORTUNITY_PATTERNS = [
  ...OPPORTUNITY_PATTERNS,
  "LISTING_ANNOUNCEMENT",
  "ASSET_OR_SPOT_LISTING_WITHOUT_CONTRACT",
  "PRE_LAUNCH_TRANSITION",
  "TRADING_WARMUP",
  "VENUE_RULE_CHANGE",
  "DELISTING_OR_SUSPENSION",
  "TRADING_RESUMPTION",
  "EARNINGS_OR_CORPORATE_ACTION",
  "TRADITIONAL_SESSION_TRANSITION",
  "OFF_HOURS_BASIS_DISLOCATION",
  "REFERENCE_PRICE_DIVERGENCE",
  "EQUITY_LIQUIDITY_SHIFT",
] as const;

export const M3_MULTI_ASSET_PATTERNS_BY_FAMILY = Object.freeze({
  PRE_MOVE: [
    "PRE_MOVE_COMPRESSION",
    "PRE_MOVE_FLOW_DIVERGENCE",
    "PRE_MOVE_LIQUIDITY_SHIFT",
  ],
  BREAKOUT_RETEST: ["BREAKOUT_EDGE", "ROLE_FLIP_RETEST"],
  TREND_CONTINUATION: [
    "TREND_COMPRESSION",
    "STRUCTURAL_PULLBACK_RESUMPTION",
  ],
  REVERSAL_RANGE: ["KEY_LEVEL_REVERSAL", "RANGE_EDGE"],
  RELATIVE_STRENGTH: ["RELATIVE_STRENGTH", "RELATIVE_WEAKNESS"],
  DERIVATIVES_FLOW: [
    "PRICE_OI_DIVERGENCE",
    "CROWDING_RELEASE",
    "FUNDING_BASIS_DISLOCATION",
  ],
  LISTING_AND_VENUE_EVENT: [
    "LISTING_ANNOUNCEMENT",
    "ASSET_OR_SPOT_LISTING_WITHOUT_CONTRACT",
    "PRE_LAUNCH_TRANSITION",
    "TRADING_WARMUP",
    "VENUE_RULE_CHANGE",
    "DELISTING_OR_SUSPENSION",
    "TRADING_RESUMPTION",
  ],
  EQUITY_EVENT_AND_BASIS: [
    "EARNINGS_OR_CORPORATE_ACTION",
    "TRADITIONAL_SESSION_TRANSITION",
    "OFF_HOURS_BASIS_DISLOCATION",
    "REFERENCE_PRICE_DIVERGENCE",
    "EQUITY_LIQUIDITY_SHIFT",
  ],
} as const satisfies Record<
  (typeof M3_MULTI_ASSET_OPPORTUNITY_FAMILIES)[number],
  readonly (typeof M3_MULTI_ASSET_OPPORTUNITY_PATTERNS)[number][]
>);

export const M3_MULTI_ASSET_FAMILIES_BY_LANE = Object.freeze({
  FOUR_VENUE_ESTABLISHED_CRYPTO: OPPORTUNITY_FAMILIES,
  CRYPTO_LISTING_WARMUP: [
    "LISTING_AND_VENUE_EVENT",
    "PRE_MOVE",
    "BREAKOUT_RETEST",
    "DERIVATIVES_FLOW",
  ],
  SINGLE_NAME_EQUITY_ESTABLISHED: [
    ...OPPORTUNITY_FAMILIES,
    "EQUITY_EVENT_AND_BASIS",
  ],
  EQUITY_INDEX_ETF_ESTABLISHED: [
    ...OPPORTUNITY_FAMILIES,
    "EQUITY_EVENT_AND_BASIS",
  ],
} as const satisfies Record<
  (typeof M3_MULTI_ASSET_DECISION_LANES)[number],
  readonly (typeof M3_MULTI_ASSET_OPPORTUNITY_FAMILIES)[number][]
>);

export const M3_MULTI_ASSET_ANALYSIS_CATEGORIES = [
  "IDENTITY",
  "LISTING_LIFECYCLE",
  "POINT_IN_TIME_MARKET",
  "STRUCTURE",
  "LOCATION",
  "SPACE",
  "PARTICIPATION",
  "LIQUIDITY",
  "MARKET_CONTEXT",
  "JURISDICTION",
  "MARK_INDEX_REFERENCE",
  "DERIVATIVES_POSITIONING",
  "CROSS_VENUE",
  "TRADITIONAL_MARKET_SESSION",
  "UNDERLYING_REFERENCE",
  "CORPORATE_ACTION",
  "FX_REFERENCE",
  "CLOSED_SESSION_BASIS",
  "CONTRACT_SPECIFICATIONS",
  "LISTING_WARMUP_BEHAVIOR",
] as const;

export const M3_MULTI_ASSET_COMMON_ANALYSIS_REQUIREMENTS = [
  "IDENTITY",
  "LISTING_LIFECYCLE",
  "POINT_IN_TIME_MARKET",
  "STRUCTURE",
  "LOCATION",
  "SPACE",
  "PARTICIPATION",
  "LIQUIDITY",
  "MARKET_CONTEXT",
  "JURISDICTION",
] as const;

export const M3_MULTI_ASSET_CRYPTO_ANALYSIS_REQUIREMENTS = [
  "MARK_INDEX_REFERENCE",
  "DERIVATIVES_POSITIONING",
  "CROSS_VENUE",
] as const;

export const M3_MULTI_ASSET_EQUITY_ANALYSIS_REQUIREMENTS = [
  "TRADITIONAL_MARKET_SESSION",
  "UNDERLYING_REFERENCE",
  "CORPORATE_ACTION",
  "FX_REFERENCE",
  "CLOSED_SESSION_BASIS",
  "CONTRACT_SPECIFICATIONS",
] as const;

export const M3_MULTI_ASSET_WARMUP_ANALYSIS_REQUIREMENT =
  "LISTING_WARMUP_BEHAVIOR" as const;

export const M3_MULTI_ASSET_NON_DIRECTIONAL_CATEGORIES = [
  "IDENTITY",
  "LISTING_LIFECYCLE",
  "JURISDICTION",
  "MARK_INDEX_REFERENCE",
  "TRADITIONAL_MARKET_SESSION",
  "UNDERLYING_REFERENCE",
  "CORPORATE_ACTION",
  "FX_REFERENCE",
  "CLOSED_SESSION_BASIS",
  "CONTRACT_SPECIFICATIONS",
] as const;

export const M3_MULTI_ASSET_STRUCTURAL_LEVEL_EVIDENCE_CATEGORIES = [
  "POINT_IN_TIME_MARKET",
  "STRUCTURE",
  "LOCATION",
  "LIQUIDITY",
] as const;

export const M3_MULTI_ASSET_REGIMES = [
  "TREND",
  "RANGE",
  "TRANSITION",
  "STRESS",
  "UNKNOWN",
] as const;

export const M3_MULTI_ASSET_DIRECTIONS = [
  "LONG",
  "SHORT",
  "NEUTRAL",
  "UNKNOWN",
] as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

function uniqueArray<T extends z.ZodTypeAny>(schema: T) {
  return z.array(schema).superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "values must be unique",
      });
    }
  });
}

export const M3MultiAssetScopeBindingSchema = z.strictObject({
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: NonEmptyStringSchema,
  decisionLane: z.enum(M3_MULTI_ASSET_DECISION_LANES),
  venue: z.enum(M1_VENUE_SOURCE_IDS),
  assetDomain: z.enum(M1_ASSET_DOMAINS),
  lifecycleState: z.enum(M1_LISTING_LIFECYCLE_STATES),
  canonicalInstrumentId: NonEmptyStringSchema,
  underlyingGroupId: NonEmptyStringSchema,
  identityEpoch: NonEmptyStringSchema,
  listingEpoch: NonEmptyStringSchema,
}).superRefine((binding, context) => {
  const expected = {
    FOUR_VENUE_ESTABLISHED_CRYPTO: {
      assetDomain: "CRYPTO_LINEAR_PERPETUAL",
      lifecycleState: "ESTABLISHED",
    },
    CRYPTO_LISTING_WARMUP: {
      assetDomain: "CRYPTO_LINEAR_PERPETUAL",
      lifecycleState: "TRADING_WARMUP",
    },
    SINGLE_NAME_EQUITY_ESTABLISHED: {
      assetDomain: "EQUITY_SINGLE_NAME_PERPETUAL",
      lifecycleState: "ESTABLISHED",
    },
    EQUITY_INDEX_ETF_ESTABLISHED: {
      assetDomain: "EQUITY_INDEX_ETF_PERPETUAL",
      lifecycleState: "ESTABLISHED",
    },
  } as const;
  const lane = expected[binding.decisionLane];
  if (
    binding.assetDomain !== lane.assetDomain ||
    binding.lifecycleState !== lane.lifecycleState
  ) {
    context.addIssue({
      code: "custom",
      message: "decision lane must match its exact asset domain and lifecycle",
      path: ["decisionLane"],
    });
  }
});

export type M3MultiAssetScopeBinding = z.infer<
  typeof M3MultiAssetScopeBindingSchema
>;

export const M3MultiAssetSegmentBindingSchema = z.strictObject({
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: NonEmptyStringSchema,
  decisionLane: z.enum(M3_MULTI_ASSET_DECISION_LANES),
  venue: z.enum(M1_VENUE_SOURCE_IDS),
  assetDomain: z.enum(M3_MULTI_ASSET_EXECUTION_DOMAINS),
  lifecycleState: z.enum(["TRADING_WARMUP", "ESTABLISHED"]),
}).superRefine((segment, context) => {
  const syntheticBinding = {
    ...segment,
    canonicalInstrumentId: "segment-validation-instrument",
    underlyingGroupId: "segment-validation-underlying",
    identityEpoch: "segment-validation-identity",
    listingEpoch: "segment-validation-listing",
  };
  const parsed = M3MultiAssetScopeBindingSchema.safeParse(syntheticBinding);
  if (!parsed.success) {
    context.addIssue({
      code: "custom",
      message: "segment lane must match its exact asset domain and lifecycle",
      path: ["decisionLane"],
    });
  }
});

export type M3MultiAssetSegmentBinding = z.infer<
  typeof M3MultiAssetSegmentBindingSchema
>;

export const M3MultiAssetEvidenceReferenceSchema = z.strictObject({
  evidenceId: NonEmptyStringSchema,
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: NonEmptyStringSchema,
  venue: z.enum(M1_VENUE_SOURCE_IDS),
  assetDomain: z.enum(M1_ASSET_DOMAINS),
  lifecycleState: z.enum(M1_LISTING_LIFECYCLE_STATES),
  canonicalInstrumentId: NonEmptyStringSchema,
  underlyingGroupId: NonEmptyStringSchema,
  identityEpoch: NonEmptyStringSchema,
  listingEpoch: NonEmptyStringSchema,
  status: z.enum(["PASS", "BLOCKED", "UNAVAILABLE"]),
  sourceCutoff: IsoDateTimeSchema,
  availableAt: IsoDateTimeSchema,
  factIds: uniqueArray(NonEmptyStringSchema).min(1),
  digest: DigestSchema,
  reasonCodes: ReasonCodesSchema,
}).superRefine((evidence, context) => {
  if (Date.parse(evidence.sourceCutoff) > Date.parse(evidence.availableAt)) {
    context.addIssue({
      code: "custom",
      message: "evidence cannot be available before its source cutoff",
      path: ["availableAt"],
    });
  }
  if (new Set(evidence.reasonCodes).size !== evidence.reasonCodes.length) {
    context.addIssue({
      code: "custom",
      message: "evidence reason codes must be unique",
      path: ["reasonCodes"],
    });
  }
});

export type M3MultiAssetEvidenceReference = z.infer<
  typeof M3MultiAssetEvidenceReferenceSchema
>;

export const M3MultiAssetAnalysisObservationSchema = z.strictObject({
  observationId: NonEmptyStringSchema,
  category: z.enum(M3_MULTI_ASSET_ANALYSIS_CATEGORIES),
  stance: z.enum(["SUPPORTING", "CONTRADICTING", "MISSING"]),
  direction: z.enum(M3_MULTI_ASSET_DIRECTIONS),
  evidence: M3MultiAssetEvidenceReferenceSchema,
  reasonCodes: ReasonCodesSchema.min(1),
}).superRefine((observation, context) => {
  if (
    observation.stance === "MISSING" &&
    observation.evidence.status === "PASS"
  ) {
    context.addIssue({
      code: "custom",
      message: "missing observation cannot carry PASS evidence",
      path: ["evidence", "status"],
    });
  }
  if (
    observation.stance !== "MISSING" &&
    observation.evidence.status !== "PASS"
  ) {
    context.addIssue({
      code: "custom",
      message: "observed evidence must have PASS status",
      path: ["evidence", "status"],
    });
  }
  if (new Set(observation.reasonCodes).size !== observation.reasonCodes.length) {
    context.addIssue({
      code: "custom",
      message: "observation reason codes must be unique",
      path: ["reasonCodes"],
    });
  }
  if (
    observation.stance === "MISSING" &&
    observation.direction !== "UNKNOWN"
  ) {
    context.addIssue({
      code: "custom",
      message: "missing evidence cannot express a market direction",
      path: ["direction"],
    });
  }
  if (
    observation.stance !== "MISSING" &&
    (
      M3_MULTI_ASSET_NON_DIRECTIONAL_CATEGORIES as readonly string[]
    ).includes(observation.category) &&
    observation.direction !== "NEUTRAL"
  ) {
    context.addIssue({
      code: "custom",
      message: "non-directional prerequisites must remain neutral",
      path: ["direction"],
    });
  }
});

export type M3MultiAssetAnalysisObservation = z.infer<
  typeof M3MultiAssetAnalysisObservationSchema
>;

export const M3MultiAssetStructuralLevelSchema = z.strictObject({
  levelId: NonEmptyStringSchema,
  kind: z.enum([
    "SUPPORT",
    "RESISTANCE",
    "RANGE_EDGE",
    "LIQUIDITY",
    "FIB_ZONE",
  ]),
  price: PositiveDecimalStringSchema,
  timeframe: NonEmptyStringSchema,
  evidenceIds: uniqueArray(NonEmptyStringSchema).min(1),
  reasonCodes: ReasonCodesSchema.min(1),
}).superRefine((level, context) => {
  if (new Set(level.reasonCodes).size !== level.reasonCodes.length) {
    context.addIssue({
      code: "custom",
      message: "structural level reason codes must be unique",
      path: ["reasonCodes"],
    });
  }
});

export type M3MultiAssetStructuralLevel = z.infer<
  typeof M3MultiAssetStructuralLevelSchema
>;

export const M3MultiAssetOpportunitySchema = z.strictObject({
  episodeId: NonEmptyStringSchema,
  thesisId: NonEmptyStringSchema,
  opportunityFamily: z.enum(M3_MULTI_ASSET_OPPORTUNITY_FAMILIES),
  opportunityPatterns: uniqueArray(
    z.enum(M3_MULTI_ASSET_OPPORTUNITY_PATTERNS),
  ).min(1),
});

export type M3MultiAssetOpportunity = z.infer<
  typeof M3MultiAssetOpportunitySchema
>;

export function isM3MultiAssetExecutionDomain(
  assetDomain: (typeof M1_ASSET_DOMAINS)[number],
): assetDomain is (typeof M3_MULTI_ASSET_EXECUTION_DOMAINS)[number] {
  return (M3_MULTI_ASSET_EXECUTION_DOMAINS as readonly string[])
    .includes(assetDomain);
}

export function isM3MultiAssetEquityDomain(
  assetDomain: (typeof M1_ASSET_DOMAINS)[number],
): assetDomain is (typeof M3_MULTI_ASSET_EQUITY_DOMAINS)[number] {
  return (M3_MULTI_ASSET_EQUITY_DOMAINS as readonly string[])
    .includes(assetDomain);
}

export function isM3MultiAssetDecisionLifecycle(
  lifecycleState: (typeof M1_LISTING_LIFECYCLE_STATES)[number],
): lifecycleState is "TRADING_WARMUP" | "ESTABLISHED" {
  return lifecycleState === "TRADING_WARMUP" ||
    lifecycleState === "ESTABLISHED";
}

export function isM3MultiAssetOpportunityPatternForFamily(
  family: (typeof M3_MULTI_ASSET_OPPORTUNITY_FAMILIES)[number],
  pattern: (typeof M3_MULTI_ASSET_OPPORTUNITY_PATTERNS)[number],
): boolean {
  return (
    M3_MULTI_ASSET_PATTERNS_BY_FAMILY[family] as readonly string[]
  ).includes(pattern);
}

export function isM3MultiAssetFamilyAllowedForLane(
  lane: (typeof M3_MULTI_ASSET_DECISION_LANES)[number],
  family: (typeof M3_MULTI_ASSET_OPPORTUNITY_FAMILIES)[number],
): boolean {
  return (
    M3_MULTI_ASSET_FAMILIES_BY_LANE[lane] as readonly string[]
  ).includes(family);
}

export function segmentBindingFromScope(
  binding: M3MultiAssetScopeBinding,
): M3MultiAssetSegmentBinding {
  return M3MultiAssetSegmentBindingSchema.parse({
    scopeEpoch: binding.scopeEpoch,
    releaseId: binding.releaseId,
    decisionLane: binding.decisionLane,
    venue: binding.venue,
    assetDomain: binding.assetDomain,
    lifecycleState: binding.lifecycleState,
  });
}

export type M3MultiAssetAnalysisCategory =
  (typeof M3_MULTI_ASSET_ANALYSIS_CATEGORIES)[number];

export function requiredM3MultiAssetAnalysisCategories(
  assetDomain: (typeof M1_ASSET_DOMAINS)[number],
  lifecycleState: (typeof M1_LISTING_LIFECYCLE_STATES)[number],
): readonly M3MultiAssetAnalysisCategory[] {
  const domainRequirements = assetDomain === "CRYPTO_LINEAR_PERPETUAL"
    ? M3_MULTI_ASSET_CRYPTO_ANALYSIS_REQUIREMENTS
    : isM3MultiAssetEquityDomain(assetDomain)
      ? M3_MULTI_ASSET_EQUITY_ANALYSIS_REQUIREMENTS
      : [];
  return [...new Set([
    ...M3_MULTI_ASSET_COMMON_ANALYSIS_REQUIREMENTS,
    ...domainRequirements,
    ...(lifecycleState === "TRADING_WARMUP"
      ? [M3_MULTI_ASSET_WARMUP_ANALYSIS_REQUIREMENT]
      : []),
  ])].sort() as M3MultiAssetAnalysisCategory[];
}

export function sameM3MultiAssetBinding(
  binding: M3MultiAssetScopeBinding,
  evidence: M3MultiAssetEvidenceReference,
): boolean {
  return evidence.scopeEpoch === binding.scopeEpoch &&
    evidence.releaseId === binding.releaseId &&
    evidence.venue === binding.venue &&
    evidence.assetDomain === binding.assetDomain &&
    evidence.lifecycleState === binding.lifecycleState &&
    evidence.canonicalInstrumentId === binding.canonicalInstrumentId &&
    evidence.underlyingGroupId === binding.underlyingGroupId &&
    evidence.identityEpoch === binding.identityEpoch &&
    evidence.listingEpoch === binding.listingEpoch;
}

export function sameM3MultiAssetSegment(
  left: M3MultiAssetSegmentBinding,
  right: M3MultiAssetSegmentBinding,
): boolean {
  return left.scopeEpoch === right.scopeEpoch &&
    left.releaseId === right.releaseId &&
    left.decisionLane === right.decisionLane &&
    left.venue === right.venue &&
    left.assetDomain === right.assetDomain &&
    left.lifecycleState === right.lifecycleState;
}

export function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

export const M3MultiAssetDigestSchema = DigestSchema;
export const M3MultiAssetPositiveDecimalSchema =
  PositiveDecimalStringSchema;
