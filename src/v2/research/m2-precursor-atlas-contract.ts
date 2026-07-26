import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  RatioSchema,
  ReasonCodesSchema,
} from "../runtime-schema/primitives";
import {
  M1_LISTING_LIFECYCLE_STATES,
} from "../modules/multi-asset-universe/multi-asset-identity-contract";
import {
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
} from "../modules/source-capability/source-capability-contract";
import {
  M1_MARKET_MECHANICS_AXES,
  M1_MARKET_MECHANICS_FEATURE_DEFINITIONS,
} from "../modules/microstructure/m1-microstructure-contract";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../modules/universe/stable-artifact";

export const M2_PRECURSOR_ATLAS_VERSION =
  "v2-m2-bidirectional-precursor-atlas.v1" as const;
export const M2_SECTOR_SNAPSHOT_VERSION =
  "v2-m2-point-in-time-sector-snapshot.v1" as const;
export const M2_PRECURSOR_RESEARCH_EVIDENCE_VERSION =
  "v2-m2-precursor-research-evidence.v1" as const;
export const M2_PRECURSOR_RESEARCH_RESULT_VERSION =
  "v2-m2-precursor-research-readiness.v1" as const;
export const M2_PRECURSOR_RESEARCH_AUTHORITY =
  "RESEARCH_ONLY_NO_CANDIDATE_SIGNAL_GRADE_STRATEGY_OR_READY_AUTHORITY" as const;

export const M2_PRECURSOR_FAMILIES = [
  "COMPRESSION_ENERGY",
  "QUIET_ACCUMULATION_DISTRIBUTION",
  "FLOW_PRICE_DIVERGENCE_ABSORPTION",
  "POSITION_BUILD_UNWIND",
  "LIQUIDITY_SHIFT",
  "RELATIVE_SECTOR_PROPAGATION",
  "FAILED_AUCTION_TRAP",
  "EVENT_LISTING_TRANSITION",
] as const;

export const M2_PRECURSOR_DIRECTIONS = [
  "LONG",
  "SHORT",
  "UNKNOWN",
] as const;

export const M2_PRECURSOR_OUTCOME_CLASSES = [
  "UP_EXPANSION",
  "DOWN_EXPANSION",
  "NO_EXPANSION",
] as const;

export const M2_PRECURSOR_EVIDENCE_DOMAINS = [
  "PRICE_STRUCTURE",
  "MICROSTRUCTURE",
  "DERIVATIVES_POSITIONING",
  "RELATIVE_SECTOR",
  "EVENT_LISTING",
] as const;

export const M2_PRECURSOR_ABLATION_GROUPS = [
  "PRICE_STRUCTURE",
  "ORDER_WALL_LIFECYCLE",
  "AGGRESSIVE_FLOW_RESPONSE",
  "DERIVATIVES_POSITIONING",
  "SECTOR_PROPAGATION",
  "EVENT_AND_SUPPLEMENTAL_CONTEXT",
] as const;

const additionalFeatureDefinitions = [
  {
    featureKey: "VOLATILITY_COMPRESSION",
    evidenceDomain: "PRICE_STRUCTURE",
    sourceModule: "point_in_time_feature_engine",
  },
  {
    featureKey: "STRUCTURE_ACCEPTANCE",
    evidenceDomain: "PRICE_STRUCTURE",
    sourceModule: "point_in_time_feature_engine",
  },
  {
    featureKey: "FAILED_AUCTION_RECLAIM",
    evidenceDomain: "PRICE_STRUCTURE",
    sourceModule: "point_in_time_feature_engine",
  },
  {
    featureKey: "RELATIVE_STRENGTH_BTC_ETH",
    evidenceDomain: "RELATIVE_SECTOR",
    sourceModule: "market_context",
  },
  {
    featureKey: "OPEN_INTEREST_CHANGE",
    evidenceDomain: "DERIVATIVES_POSITIONING",
    sourceModule: "point_in_time_feature_engine",
  },
  {
    featureKey: "FUNDING_BASIS_STATE",
    evidenceDomain: "DERIVATIVES_POSITIONING",
    sourceModule: "point_in_time_feature_engine",
  },
  {
    featureKey: "LIQUIDATION_IMBALANCE",
    evidenceDomain: "DERIVATIVES_POSITIONING",
    sourceModule: "point_in_time_feature_engine",
  },
  {
    featureKey: "SECTOR_LEAD_LAG",
    evidenceDomain: "RELATIVE_SECTOR",
    sourceModule: "market_context",
  },
  {
    featureKey: "LISTING_EVENT_STATE",
    evidenceDomain: "EVENT_LISTING",
    sourceModule: "market_context",
  },
] as const;

export const M2_PRECURSOR_FEATURE_REGISTRY = Object.freeze([
  ...M1_MARKET_MECHANICS_FEATURE_DEFINITIONS.map((definition) => ({
    featureKey: definition.featureId,
    evidenceDomain: "MICROSTRUCTURE" as const,
    sourceModule: "point_in_time_feature_engine" as const,
  })),
  ...additionalFeatureDefinitions,
].map((definition) => ({
  ...definition,
  pointInTimeRequired: true as const,
  missingMayBecomeZero: false as const,
  productionThresholdAuthority: false as const,
  candidateEmissionAllowed: false as const,
})));

export type M2PrecursorFeatureKey =
  (typeof M2_PRECURSOR_FEATURE_REGISTRY)[number]["featureKey"];

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const FamilySchema = z.enum(M2_PRECURSOR_FAMILIES);
const DirectionSchema = z.enum(M2_PRECURSOR_DIRECTIONS);
const DirectionalSchema = z.enum(["LONG", "SHORT"]);
const VenueSchema = z.enum(M1_VENUE_SOURCE_IDS);
const EligibleLifecycleSchema = z.enum([
  "TRADING_WARMUP",
  "ESTABLISHED",
] as const satisfies readonly (typeof M1_LISTING_LIFECYCLE_STATES)[number][]);
const FeatureKeySchema = z.enum(
  M2_PRECURSOR_FEATURE_REGISTRY.map((entry) => entry.featureKey) as [
    M2PrecursorFeatureKey,
    ...M2PrecursorFeatureKey[],
  ],
);
const UniqueStringsSchema = z.array(NonEmptyStringSchema).superRefine(
  (values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "research lineage values must be unique",
      });
    }
  },
);
const UniqueFeatureKeysSchema = z.array(FeatureKeySchema).superRefine(
  (values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "precursor feature keys must be unique",
      });
    }
  },
);

function omitArtifactFields(
  value: object,
  fields: readonly string[],
): Record<string, unknown> {
  const content = {
    ...(value as Record<string, unknown>),
  };
  for (const field of fields) delete content[field];
  return content;
}

const PrecursorFeatureRegistryEntrySchema = z.strictObject({
  featureKey: FeatureKeySchema,
  evidenceDomain: z.enum(M2_PRECURSOR_EVIDENCE_DOMAINS),
  sourceModule: z.enum([
    "point_in_time_feature_engine",
    "market_context",
  ]),
  pointInTimeRequired: z.literal(true),
  missingMayBecomeZero: z.literal(false),
  productionThresholdAuthority: z.literal(false),
  candidateEmissionAllowed: z.literal(false),
});

const PrecursorHypothesisSchema = z.strictObject({
  hypothesisId: NonEmptyStringSchema,
  family: FamilySchema,
  direction: DirectionSchema,
  mechanicsAxes: z.array(z.enum(M1_MARKET_MECHANICS_AXES)).min(2),
  requiredFeatureKeys: UniqueFeatureKeysSchema.min(2),
  optionalFeatureKeys: UniqueFeatureKeysSchema,
  counterEvidenceKeys: UniqueFeatureKeysSchema.min(1),
  unavailableReasonCodes: ReasonCodesSchema.min(1),
  thresholdLearningScope: z.literal("TRAIN_ONLY_UNFITTED"),
  evidenceMode: z.enum([
    "FORWARD_ONLY_REQUIRED",
    "HISTORICAL_ALLOWED_ONLY_WITH_POINT_IN_TIME_EVIDENCE",
  ]),
  lifecycle: z.literal("DRAFT_UNCALIBRATED"),
  probabilityOutputAllowed: z.literal(false),
  candidateEmissionAllowed: z.literal(false),
  automaticPromotionAllowed: z.literal(false),
}).superRefine((hypothesis, context) => {
  if (new Set(hypothesis.mechanicsAxes).size !== hypothesis.mechanicsAxes.length) {
    context.addIssue({
      code: "custom",
      message: "market-mechanics axes must be unique",
      path: ["mechanicsAxes"],
    });
  }
  const required = new Set(hypothesis.requiredFeatureKeys);
  if (
    hypothesis.optionalFeatureKeys.some((feature) => required.has(feature)) ||
    hypothesis.counterEvidenceKeys.some((feature) => required.has(feature))
  ) {
    context.addIssue({
      code: "custom",
      message: "support, optional and counter feature sets must stay independent",
      path: ["requiredFeatureKeys"],
    });
  }
  const expectedId = `precursor:${hypothesis.family}:${hypothesis.direction}`;
  if (hypothesis.hypothesisId !== expectedId) {
    context.addIssue({
      code: "custom",
      message: "precursor hypothesis id must preserve family and direction",
      path: ["hypothesisId"],
    });
  }
});

const precursorAtlasCoreShape = {
  schemaVersion: z.literal(M2_PRECURSOR_ATLAS_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  atlasVersion: NonEmptyStringSchema,
  frozenAt: IsoDateTimeSchema,
  featureRegistry: z.array(PrecursorFeatureRegistryEntrySchema).length(
    M2_PRECURSOR_FEATURE_REGISTRY.length,
  ),
  hypotheses: z.array(PrecursorHypothesisSchema).length(
    M2_PRECURSOR_FAMILIES.length * M2_PRECURSOR_DIRECTIONS.length,
  ),
  outcomeClasses: z.tuple([
    z.literal("UP_EXPANSION"),
    z.literal("DOWN_EXPANSION"),
    z.literal("NO_EXPANSION"),
  ]),
  matchedControlRequired: z.literal(true),
  untouchedHoldoutRequired: z.literal(true),
  featureAblationRequired: z.literal(true),
  futureLeakAllowed: z.literal(false),
  directionMayBeSignFlip: z.literal(false),
  totalScoreAuthorityAllowed: z.literal(false),
  candidateEmissionAllowed: z.literal(false),
  signalGradeAllowed: z.literal(false),
  readyAuthorityAllowed: z.literal(false),
  authority: z.literal(M2_PRECURSOR_RESEARCH_AUTHORITY),
} as const;

type AtlasCore = z.infer<z.ZodObject<typeof precursorAtlasCoreShape>>;

function validatePrecursorAtlas(
  atlas: AtlasCore,
  context: z.RefinementCtx,
): void {
  const registryKeys = atlas.featureRegistry.map((entry) => entry.featureKey);
  const expectedRegistryKeys = M2_PRECURSOR_FEATURE_REGISTRY.map(
    (entry) => entry.featureKey,
  );
  if (
    new Set(registryKeys).size !== expectedRegistryKeys.length ||
    expectedRegistryKeys.some((key) => !registryKeys.includes(key))
  ) {
    context.addIssue({
      code: "custom",
      message: "precursor feature registry denominator is incomplete",
      path: ["featureRegistry"],
    });
  }

  const hypothesisKeys = atlas.hypotheses.map((hypothesis) =>
    `${hypothesis.family}:${hypothesis.direction}`);
  if (new Set(hypothesisKeys).size !== atlas.hypotheses.length) {
    context.addIssue({
      code: "custom",
      message: "precursor hypotheses must be unique by family and direction",
      path: ["hypotheses"],
    });
  }
  for (const family of M2_PRECURSOR_FAMILIES) {
    for (const direction of M2_PRECURSOR_DIRECTIONS) {
      if (!hypothesisKeys.includes(`${family}:${direction}`)) {
        context.addIssue({
          code: "custom",
          message: "every precursor family requires LONG, SHORT and UNKNOWN hypotheses",
          path: ["hypotheses"],
        });
      }
    }
    const long = atlas.hypotheses.find((hypothesis) =>
      hypothesis.family === family && hypothesis.direction === "LONG");
    const short = atlas.hypotheses.find((hypothesis) =>
      hypothesis.family === family && hypothesis.direction === "SHORT");
    if (
      long !== undefined &&
      short !== undefined &&
      JSON.stringify([...long.requiredFeatureKeys].sort()) ===
        JSON.stringify([...short.requiredFeatureKeys].sort())
    ) {
      context.addIssue({
        code: "custom",
        message: "LONG and SHORT precursor hypotheses cannot be a sign-flipped copy",
        path: ["hypotheses"],
      });
    }
  }
}

export const M2PrecursorAtlasInputSchema = z
  .strictObject(precursorAtlasCoreShape)
  .superRefine(validatePrecursorAtlas);

export const M2PrecursorAtlasSchema = z.strictObject({
  ...precursorAtlasCoreShape,
  atlasId: NonEmptyStringSchema,
  contentHash: DigestSchema,
}).superRefine((atlas, context) => {
  validatePrecursorAtlas(atlas, context);
  const content = omitArtifactFields(atlas, ["atlasId", "contentHash"]);
  const expectedHash = stableContentHash(content);
  if (atlas.contentHash !== expectedHash) {
    context.addIssue({
      code: "custom",
      message: "precursor atlas content hash mismatch",
      path: ["contentHash"],
    });
  }
  if (
    atlas.atlasId !== `precursor-atlas:${expectedHash.slice(7, 31)}`
  ) {
    context.addIssue({
      code: "custom",
      message: "precursor atlas id mismatch",
      path: ["atlasId"],
    });
  }
});

export type M2PrecursorAtlasInput = z.infer<
  typeof M2PrecursorAtlasInputSchema
>;
export type M2PrecursorAtlas = z.infer<typeof M2PrecursorAtlasSchema>;

export function buildM2PrecursorAtlas(
  rawInput: M2PrecursorAtlasInput,
): M2PrecursorAtlas {
  const input = M2PrecursorAtlasInputSchema.parse(rawInput);
  const canonicalInput = {
    ...input,
    featureRegistry: [...input.featureRegistry].sort((left, right) =>
      left.featureKey.localeCompare(right.featureKey)),
    hypotheses: [...input.hypotheses]
      .map((hypothesis) => ({
        ...hypothesis,
        mechanicsAxes: [...hypothesis.mechanicsAxes].sort(),
        requiredFeatureKeys: [...hypothesis.requiredFeatureKeys].sort(),
        optionalFeatureKeys: [...hypothesis.optionalFeatureKeys].sort(),
        counterEvidenceKeys: [...hypothesis.counterEvidenceKeys].sort(),
        unavailableReasonCodes: [...hypothesis.unavailableReasonCodes].sort(),
      }))
      .sort((left, right) =>
        `${left.family}:${left.direction}`.localeCompare(
          `${right.family}:${right.direction}`,
        )),
  };
  const contentHash = stableContentHash(canonicalInput);
  return deepFreezeArtifact(M2PrecursorAtlasSchema.parse({
    ...canonicalInput,
    atlasId: `precursor-atlas:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}

type FamilyHypothesisConfig = Readonly<{
  mechanicsAxes: readonly (typeof M1_MARKET_MECHANICS_AXES)[number][];
  long: readonly M2PrecursorFeatureKey[];
  short: readonly M2PrecursorFeatureKey[];
  unknown: readonly M2PrecursorFeatureKey[];
  optional: readonly M2PrecursorFeatureKey[];
  counter: readonly M2PrecursorFeatureKey[];
  evidenceMode:
    | "FORWARD_ONLY_REQUIRED"
    | "HISTORICAL_ALLOWED_ONLY_WITH_POINT_IN_TIME_EVIDENCE";
}>;

const FAMILY_HYPOTHESIS_CONFIG: Readonly<
  Record<(typeof M2_PRECURSOR_FAMILIES)[number], FamilyHypothesisConfig>
> = Object.freeze({
  COMPRESSION_ENERGY: {
    mechanicsAxes: ["PRICE_STRUCTURE", "LIQUIDITY_RESPONSE"],
    long: ["VOLATILITY_COMPRESSION", "STRUCTURE_ACCEPTANCE", "NEAR_BOOK_DEPTH_CHANGE"],
    short: ["VOLATILITY_COMPRESSION", "LIQUIDITY_VACUUM_RISK", "STRUCTURE_ACCEPTANCE"],
    unknown: ["VOLATILITY_COMPRESSION", "CROSS_VENUE_AGREEMENT"],
    optional: ["OPEN_INTEREST_CHANGE"],
    counter: ["SPOOF_RISK"],
    evidenceMode: "HISTORICAL_ALLOWED_ONLY_WITH_POINT_IN_TIME_EVIDENCE",
  },
  QUIET_ACCUMULATION_DISTRIBUTION: {
    mechanicsAxes: ["PRICE_STRUCTURE", "PARTICIPATION_LEVERAGE", "LIQUIDITY_RESPONSE"],
    long: ["BUY_ABSORPTION_STRENGTH", "RELATIVE_STRENGTH_BTC_ETH", "AGGRESSIVE_FLOW_IMBALANCE"],
    short: ["SELL_ABSORPTION_STRENGTH", "NEAR_BOOK_DEPTH_CHANGE", "AGGRESSIVE_FLOW_IMBALANCE"],
    unknown: ["BUY_ABSORPTION_STRENGTH", "SELL_ABSORPTION_STRENGTH"],
    optional: ["OPEN_INTEREST_CHANGE"],
    counter: ["SPOOF_RISK"],
    evidenceMode: "FORWARD_ONLY_REQUIRED",
  },
  FLOW_PRICE_DIVERGENCE_ABSORPTION: {
    mechanicsAxes: ["PARTICIPATION_LEVERAGE", "LIQUIDITY_RESPONSE"],
    long: ["BUY_ABSORPTION_STRENGTH", "PRICE_RESPONSE_EFFICIENCY", "AGGRESSIVE_FLOW_IMBALANCE"],
    short: ["SELL_ABSORPTION_STRENGTH", "AGGRESSIVE_FLOW_IMBALANCE", "NEAR_BOOK_DEPTH_CHANGE"],
    unknown: ["PRICE_RESPONSE_EFFICIENCY", "CROSS_VENUE_AGREEMENT"],
    optional: ["LIQUIDATION_IMBALANCE"],
    counter: ["SPOOF_RISK"],
    evidenceMode: "FORWARD_ONLY_REQUIRED",
  },
  POSITION_BUILD_UNWIND: {
    mechanicsAxes: ["PRICE_STRUCTURE", "PARTICIPATION_LEVERAGE"],
    long: ["OPEN_INTEREST_CHANGE", "FUNDING_BASIS_STATE", "STRUCTURE_ACCEPTANCE"],
    short: ["OPEN_INTEREST_CHANGE", "LIQUIDATION_IMBALANCE", "VOLATILITY_COMPRESSION"],
    unknown: ["OPEN_INTEREST_CHANGE", "FUNDING_BASIS_STATE"],
    optional: ["AGGRESSIVE_FLOW_IMBALANCE"],
    counter: ["LIQUIDITY_VACUUM_RISK"],
    evidenceMode: "HISTORICAL_ALLOWED_ONLY_WITH_POINT_IN_TIME_EVIDENCE",
  },
  LIQUIDITY_SHIFT: {
    mechanicsAxes: ["PRICE_STRUCTURE", "LIQUIDITY_RESPONSE"],
    long: ["WALL_REFILL_RATIO", "EXECUTED_WALL_RATIO", "WALL_MIGRATION_BPS"],
    short: ["WALL_CANCEL_VELOCITY", "LIQUIDITY_VACUUM_RISK", "NEAR_BOOK_DEPTH_CHANGE"],
    unknown: ["WALL_PERSISTENCE", "SPOOF_RISK"],
    optional: ["CROSS_VENUE_AGREEMENT"],
    counter: ["PRICE_RESPONSE_EFFICIENCY"],
    evidenceMode: "FORWARD_ONLY_REQUIRED",
  },
  RELATIVE_SECTOR_PROPAGATION: {
    mechanicsAxes: ["PRICE_STRUCTURE", "PARTICIPATION_LEVERAGE"],
    long: ["SECTOR_LEAD_LAG", "RELATIVE_STRENGTH_BTC_ETH", "STRUCTURE_ACCEPTANCE"],
    short: ["SECTOR_LEAD_LAG", "RELATIVE_STRENGTH_BTC_ETH", "LIQUIDITY_VACUUM_RISK"],
    unknown: ["SECTOR_LEAD_LAG", "CROSS_VENUE_AGREEMENT"],
    optional: ["AGGRESSIVE_FLOW_IMBALANCE"],
    counter: ["VOLATILITY_COMPRESSION"],
    evidenceMode: "HISTORICAL_ALLOWED_ONLY_WITH_POINT_IN_TIME_EVIDENCE",
  },
  FAILED_AUCTION_TRAP: {
    mechanicsAxes: ["PRICE_STRUCTURE", "LIQUIDITY_RESPONSE"],
    long: ["FAILED_AUCTION_RECLAIM", "BUY_ABSORPTION_STRENGTH", "EXECUTED_WALL_RATIO"],
    short: ["FAILED_AUCTION_RECLAIM", "SELL_ABSORPTION_STRENGTH", "WALL_CANCEL_VELOCITY"],
    unknown: ["FAILED_AUCTION_RECLAIM", "SPOOF_RISK"],
    optional: ["LIQUIDATION_IMBALANCE"],
    counter: ["LIQUIDITY_VACUUM_RISK"],
    evidenceMode: "FORWARD_ONLY_REQUIRED",
  },
  EVENT_LISTING_TRANSITION: {
    mechanicsAxes: ["PRICE_STRUCTURE", "PARTICIPATION_LEVERAGE", "LIQUIDITY_RESPONSE"],
    long: ["LISTING_EVENT_STATE", "STRUCTURE_ACCEPTANCE", "CROSS_VENUE_AGREEMENT"],
    short: ["LISTING_EVENT_STATE", "LIQUIDITY_VACUUM_RISK", "WALL_CANCEL_VELOCITY"],
    unknown: ["LISTING_EVENT_STATE", "VOLATILITY_COMPRESSION"],
    optional: ["FUNDING_BASIS_STATE"],
    counter: ["SPOOF_RISK"],
    evidenceMode: "FORWARD_ONLY_REQUIRED",
  },
});

export function buildDefaultM2PrecursorAtlas(
  frozenAt: string,
  atlasVersion = "m2-precursor-atlas.research.v1",
): M2PrecursorAtlas {
  const hypotheses = M2_PRECURSOR_FAMILIES.flatMap((family) => {
    const config = FAMILY_HYPOTHESIS_CONFIG[family];
    return M2_PRECURSOR_DIRECTIONS.map((direction) => ({
      hypothesisId: `precursor:${family}:${direction}`,
      family,
      direction,
      mechanicsAxes: [...config.mechanicsAxes],
      requiredFeatureKeys: [...config[
        direction === "LONG"
          ? "long"
          : direction === "SHORT"
            ? "short"
            : "unknown"
      ]],
      optionalFeatureKeys: [...config.optional],
      counterEvidenceKeys: [...config.counter],
      unavailableReasonCodes: [
        "point_in_time_feature_missing",
        "matched_control_missing",
      ],
      thresholdLearningScope: "TRAIN_ONLY_UNFITTED" as const,
      evidenceMode: config.evidenceMode,
      lifecycle: "DRAFT_UNCALIBRATED" as const,
      probabilityOutputAllowed: false as const,
      candidateEmissionAllowed: false as const,
      automaticPromotionAllowed: false as const,
    }));
  });
  return buildM2PrecursorAtlas({
    schemaVersion: M2_PRECURSOR_ATLAS_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    atlasVersion,
    frozenAt,
    featureRegistry: M2_PRECURSOR_FEATURE_REGISTRY.map((entry) => ({
      ...entry,
    })),
    hypotheses,
    outcomeClasses: [
      "UP_EXPANSION",
      "DOWN_EXPANSION",
      "NO_EXPANSION",
    ],
    matchedControlRequired: true,
    untouchedHoldoutRequired: true,
    featureAblationRequired: true,
    futureLeakAllowed: false,
    directionMayBeSignFlip: false,
    totalScoreAuthorityAllowed: false,
    candidateEmissionAllowed: false,
    signalGradeAllowed: false,
    readyAuthorityAllowed: false,
    authority: M2_PRECURSOR_RESEARCH_AUTHORITY,
  });
}

const SectorMembershipSchema = z.strictObject({
  canonicalInstrumentId: NonEmptyStringSchema,
  sectorId: NonEmptyStringSchema.nullable(),
  role: z.enum(["LEADER", "PEER", "LAGGARD", "UNKNOWN"]),
  observedAt: IsoDateTimeSchema,
  sourceEvidenceIds: UniqueStringsSchema.min(1),
  reasonCodes: ReasonCodesSchema,
}).superRefine((membership, context) => {
  if (
    (membership.sectorId === null || membership.role === "UNKNOWN") &&
    membership.reasonCodes.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "unknown sector membership requires explicit reasons",
      path: ["reasonCodes"],
    });
  }
});

const SectorRelationshipSchema = z.strictObject({
  leaderInstrumentId: NonEmptyStringSchema,
  followerInstrumentId: NonEmptyStringSchema,
  direction: z.enum(["UP_PROPAGATION", "DOWN_PROPAGATION", "UNKNOWN"]),
  leadLagMs: NonNegativeIntegerSchema.nullable(),
  stability: RatioSchema.nullable(),
  sampleSize: NonNegativeIntegerSchema,
  sourceEvidenceIds: UniqueStringsSchema.min(1),
  status: z.enum(["RESEARCH_ONLY", "UNAVAILABLE"]),
  reasonCodes: ReasonCodesSchema,
}).superRefine((relationship, context) => {
  if (relationship.leaderInstrumentId === relationship.followerInstrumentId) {
    context.addIssue({
      code: "custom",
      message: "sector lead-lag relationships require distinct instruments",
      path: ["followerInstrumentId"],
    });
  }
  if (
    relationship.status === "RESEARCH_ONLY" &&
    (
      relationship.direction === "UNKNOWN" ||
      relationship.leadLagMs === null ||
      relationship.stability === null ||
      relationship.sampleSize === 0
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "research relationships require observed direction, lag and sample",
      path: ["status"],
    });
  }
});

const sectorSnapshotCoreShape = {
  schemaVersion: z.literal(M2_SECTOR_SNAPSHOT_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  taxonomySource: NonEmptyStringSchema,
  taxonomyVersion: NonEmptyStringSchema,
  knowledgeTime: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  generatedAt: IsoDateTimeSchema,
  btcBetaAdjustmentVersion: NonEmptyStringSchema,
  ethBetaAdjustmentVersion: NonEmptyStringSchema,
  memberships: z.array(SectorMembershipSchema).min(1),
  relationships: z.array(SectorRelationshipSchema),
  futureMembershipAllowed: z.literal(false),
  hindsightLeaderRelabelingAllowed: z.literal(false),
  candidateEmissionAllowed: z.literal(false),
  authority: z.literal(M2_PRECURSOR_RESEARCH_AUTHORITY),
} as const;

type SectorCore = z.infer<z.ZodObject<typeof sectorSnapshotCoreShape>>;

function validateSectorSnapshot(
  snapshot: SectorCore,
  context: z.RefinementCtx,
): void {
  if (
    Date.parse(snapshot.sourceCutoff) > Date.parse(snapshot.knowledgeTime) ||
    Date.parse(snapshot.knowledgeTime) > Date.parse(snapshot.generatedAt)
  ) {
    context.addIssue({
      code: "custom",
      message: "sector snapshot point-in-time lineage is not monotonic",
      path: ["knowledgeTime"],
    });
  }
  const instrumentIds = snapshot.memberships.map(
    (membership) => membership.canonicalInstrumentId,
  );
  if (new Set(instrumentIds).size !== instrumentIds.length) {
    context.addIssue({
      code: "custom",
      message: "sector membership must contain one row per instrument",
      path: ["memberships"],
    });
  }
  for (const [index, membership] of snapshot.memberships.entries()) {
    if (Date.parse(membership.observedAt) > Date.parse(snapshot.knowledgeTime)) {
      context.addIssue({
        code: "custom",
        message: "sector membership cannot be observed after knowledge time",
        path: ["memberships", index, "observedAt"],
      });
    }
  }
  const known = new Set(instrumentIds);
  for (const [index, relationship] of snapshot.relationships.entries()) {
    if (
      !known.has(relationship.leaderInstrumentId) ||
      !known.has(relationship.followerInstrumentId)
    ) {
      context.addIssue({
        code: "custom",
        message: "sector relationships must reference point-in-time membership",
        path: ["relationships", index],
      });
    }
  }
}

export const M2SectorSnapshotInputSchema = z
  .strictObject(sectorSnapshotCoreShape)
  .superRefine(validateSectorSnapshot);

export const M2SectorSnapshotSchema = z.strictObject({
  ...sectorSnapshotCoreShape,
  snapshotId: NonEmptyStringSchema,
  contentHash: DigestSchema,
}).superRefine((snapshot, context) => {
  validateSectorSnapshot(snapshot, context);
  const content = omitArtifactFields(snapshot, [
    "snapshotId",
    "contentHash",
  ]);
  const expectedHash = stableContentHash(content);
  if (snapshot.contentHash !== expectedHash) {
    context.addIssue({
      code: "custom",
      message: "sector snapshot content hash mismatch",
      path: ["contentHash"],
    });
  }
  if (
    snapshot.snapshotId !== `sector-snapshot:${expectedHash.slice(7, 31)}`
  ) {
    context.addIssue({
      code: "custom",
      message: "sector snapshot id mismatch",
      path: ["snapshotId"],
    });
  }
});

export type M2SectorSnapshotInput = z.infer<
  typeof M2SectorSnapshotInputSchema
>;
export type M2SectorSnapshot = z.infer<typeof M2SectorSnapshotSchema>;

export function buildM2SectorSnapshot(
  rawInput: M2SectorSnapshotInput,
): M2SectorSnapshot {
  const input = M2SectorSnapshotInputSchema.parse(rawInput);
  const canonicalInput = {
    ...input,
    memberships: [...input.memberships]
      .map((membership) => ({
        ...membership,
        sourceEvidenceIds: [...membership.sourceEvidenceIds].sort(),
        reasonCodes: [...membership.reasonCodes].sort(),
      }))
      .sort((left, right) =>
        left.canonicalInstrumentId.localeCompare(right.canonicalInstrumentId)),
    relationships: [...input.relationships]
      .map((relationship) => ({
        ...relationship,
        sourceEvidenceIds: [...relationship.sourceEvidenceIds].sort(),
        reasonCodes: [...relationship.reasonCodes].sort(),
      }))
      .sort((left, right) =>
        `${left.leaderInstrumentId}:${left.followerInstrumentId}`.localeCompare(
          `${right.leaderInstrumentId}:${right.followerInstrumentId}`,
        )),
  };
  const contentHash = stableContentHash(canonicalInput);
  return deepFreezeArtifact(M2SectorSnapshotSchema.parse({
    ...canonicalInput,
    snapshotId: `sector-snapshot:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}

const SegmentEvidenceSchema = z.strictObject({
  family: FamilySchema,
  direction: DirectionalSchema,
  venue: VenueSchema,
  regime: z.enum(["TREND", "RANGE", "TRANSITION", "STRESS"]),
  liquiditySegment: z.enum(["DEEP", "NORMAL", "THIN", "NEW_LISTING"]),
  lifecycleState: EligibleLifecycleSchema,
  trialRegistrationId: NonEmptyStringSchema,
  cohortId: NonEmptyStringSchema,
  upExpansionCount: NonNegativeIntegerSchema,
  downExpansionCount: NonNegativeIntegerSchema,
  noExpansionCount: NonNegativeIntegerSchema,
  matchedControlCount: NonNegativeIntegerSchema,
  sourceEvidenceIds: UniqueStringsSchema,
  qualityStatus: z.enum(["PASS", "BLOCKED", "UNAVAILABLE"]),
  reasonCodes: ReasonCodesSchema,
});

const AblationEvidenceSchema = z.strictObject({
  group: z.enum(M2_PRECURSOR_ABLATION_GROUPS),
  status: z.enum(["PASS", "FAIL", "NOT_RUN"]),
  trialRegistrationId: NonEmptyStringSchema,
  evidenceIds: UniqueStringsSchema,
  incrementalValueObserved: z.boolean().nullable(),
  reasonCodes: ReasonCodesSchema,
}).superRefine((ablation, context) => {
  if (
    ablation.status === "PASS" &&
    (
      ablation.evidenceIds.length === 0 ||
      ablation.incrementalValueObserved === null
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "passing ablation evidence requires immutable results",
      path: ["evidenceIds"],
    });
  }
});

export const M2PrecursorResearchEvidenceSchema = z.strictObject({
  schemaVersion: z.literal(M2_PRECURSOR_RESEARCH_EVIDENCE_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  atlasContentHash: DigestSchema,
  evaluatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  evidenceMode: z.enum(["HISTORICAL_POINT_IN_TIME", "FORWARD_ONLY"]),
  historicalL2Availability: z.enum(["COMPLETE", "PARTIAL", "UNAVAILABLE"]),
  segmentEvidence: z.array(SegmentEvidenceSchema),
  ablations: z.array(AblationEvidenceSchema),
  holdout: z.strictObject({
    holdoutId: NonEmptyStringSchema,
    manifestDigest: DigestSchema,
    status: z.enum(["SEALED_UNTOUCHED", "OPENED", "MISSING"]),
    sealedAt: IsoDateTimeSchema.nullable(),
    openedAt: IsoDateTimeSchema.nullable(),
    accessCount: NonNegativeIntegerSchema,
  }),
  forwardShadow: z.strictObject({
    status: z.enum(["PASS", "FAIL", "NOT_RUN"]),
    evidenceIds: UniqueStringsSchema,
    frozenDurationSeconds: NonNegativeIntegerSchema,
    observedSegmentCount: NonNegativeIntegerSchema,
  }),
  metricPlanFrozen: z.literal(true),
  futureLeakCount: NonNegativeIntegerSchema,
  rightsAndEntitlementStatus: z.enum(["PASS", "BLOCKED", "UNAVAILABLE"]),
  independentAuditStatus: z.enum(["PASS", "FAIL", "NOT_RUN"]),
  probabilityOutputAllowed: z.literal(false),
  candidateEmissionAllowed: z.literal(false),
  authority: z.literal(M2_PRECURSOR_RESEARCH_AUTHORITY),
}).superRefine((evidence, context) => {
  if (Date.parse(evidence.sourceCutoff) > Date.parse(evidence.evaluatedAt)) {
    context.addIssue({
      code: "custom",
      message: "research evidence cannot precede its source cutoff",
      path: ["evaluatedAt"],
    });
  }
  if (
    evidence.evidenceMode === "HISTORICAL_POINT_IN_TIME" &&
    evidence.historicalL2Availability !== "COMPLETE"
  ) {
    context.addIssue({
      code: "custom",
      message: "historical mode requires complete point-in-time L2 evidence",
      path: ["historicalL2Availability"],
    });
  }
  if (
    evidence.evidenceMode === "FORWARD_ONLY" &&
    evidence.forwardShadow.status === "NOT_RUN"
  ) {
    context.addIssue({
      code: "custom",
      message: "forward-only research requires real forward Shadow evidence",
      path: ["forwardShadow"],
    });
  }
  if (
    evidence.holdout.status === "SEALED_UNTOUCHED" &&
    (
      evidence.holdout.sealedAt === null ||
      evidence.holdout.openedAt !== null ||
      evidence.holdout.accessCount !== 0
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "untouched holdout seal and access history disagree",
      path: ["holdout"],
    });
  }
});

export type M2PrecursorResearchEvidence = z.infer<
  typeof M2PrecursorResearchEvidenceSchema
>;

export const M2PrecursorResearchReadinessSchema = z.strictObject({
  schemaVersion: z.literal(M2_PRECURSOR_RESEARCH_RESULT_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema.nullable(),
  status: z.enum([
    "READY_FOR_REPLAY_VALIDATION_NO_EMISSION",
    "BLOCKED_RESEARCH_EVIDENCE",
  ]),
  familyDirectionCoverage: NonNegativeIntegerSchema,
  venueCoverage: NonNegativeIntegerSchema,
  regimeCoverage: NonNegativeIntegerSchema,
  liquiditySegmentCoverage: NonNegativeIntegerSchema,
  blockers: ReasonCodesSchema,
  authority: z.literal(M2_PRECURSOR_RESEARCH_AUTHORITY),
  candidateEmissionAllowed: z.literal(false),
  signalGradeAllowed: z.literal(false),
  readyAuthorityAllowed: z.literal(false),
  resultHash: DigestSchema,
});

export type M2PrecursorResearchReadiness = z.infer<
  typeof M2PrecursorResearchReadinessSchema
>;

export function assessM2PrecursorResearchReadiness(input: {
  atlas: M2PrecursorAtlas;
  evidence: unknown;
}): M2PrecursorResearchReadiness {
  const atlas = M2PrecursorAtlasSchema.parse(input.atlas);
  const parsed = M2PrecursorResearchEvidenceSchema.safeParse(input.evidence);
  const blockers = new Set<string>();
  if (!parsed.success) {
    blockers.add("precursor_research_evidence_schema_rejected");
  }
  const evidence = parsed.success ? parsed.data : null;
  if (
    evidence !== null &&
    evidence.atlasContentHash !== atlas.contentHash
  ) {
    blockers.add("precursor_atlas_evidence_identity_mismatch");
  }
  const passingSegments = evidence?.segmentEvidence.filter((segment) =>
    segment.qualityStatus === "PASS" &&
    segment.upExpansionCount > 0 &&
    segment.downExpansionCount > 0 &&
    segment.noExpansionCount > 0 &&
    segment.matchedControlCount > 0 &&
    segment.sourceEvidenceIds.length > 0
  ) ?? [];
  const familyDirections = new Set(passingSegments.map((segment) =>
    `${segment.family}:${segment.direction}`));
  const requiredFamilyDirections = M2_PRECURSOR_FAMILIES.flatMap((family) =>
    ["LONG", "SHORT"].map((direction) => `${family}:${direction}`));
  if (
    requiredFamilyDirections.some((key) => !familyDirections.has(key))
  ) {
    blockers.add("precursor_family_direction_denominator_incomplete");
  }
  const venues = new Set(passingSegments.map((segment) => segment.venue));
  if (M1_VENUE_SOURCE_IDS.some((venue) => !venues.has(venue))) {
    blockers.add("precursor_four_venue_denominator_incomplete");
  }
  const regimes = new Set(passingSegments.map((segment) => segment.regime));
  if (regimes.size < 3) {
    blockers.add("precursor_regime_coverage_below_three");
  }
  const liquiditySegments = new Set(
    passingSegments.map((segment) => segment.liquiditySegment),
  );
  if (liquiditySegments.size < 3) {
    blockers.add("precursor_liquidity_segment_coverage_below_three");
  }
  for (const familyDirection of requiredFamilyDirections) {
    const [family, direction] = familyDirection.split(":");
    const strata = passingSegments.filter((segment) =>
      segment.family === family && segment.direction === direction);
    const stratumVenues = new Set(strata.map((segment) => segment.venue));
    const stratumRegimes = new Set(strata.map((segment) => segment.regime));
    const stratumLiquidity = new Set(
      strata.map((segment) => segment.liquiditySegment),
    );
    if (
      M1_VENUE_SOURCE_IDS.some((venue) => !stratumVenues.has(venue))
    ) {
      blockers.add(
        `precursor_family_direction_venue_strata_incomplete:${familyDirection}`,
      );
    }
    if (stratumRegimes.size < 3) {
      blockers.add(
        `precursor_family_direction_regime_strata_incomplete:${familyDirection}`,
      );
    }
    if (stratumLiquidity.size < 3) {
      blockers.add(
        `precursor_family_direction_liquidity_strata_incomplete:${familyDirection}`,
      );
    }
    if (
      family === "EVENT_LISTING_TRANSITION" &&
      !strata.some((segment) => segment.lifecycleState === "TRADING_WARMUP")
    ) {
      blockers.add(
        `precursor_listing_warmup_strata_missing:${familyDirection}`,
      );
    }
  }
  const ablations = new Map(
    evidence?.ablations.map((ablation) => [ablation.group, ablation]) ?? [],
  );
  if (
    M2_PRECURSOR_ABLATION_GROUPS.some((group) =>
      ablations.get(group)?.status !== "PASS")
  ) {
    blockers.add("precursor_feature_ablation_incomplete");
  }
  if (
    evidence?.holdout.status !== "SEALED_UNTOUCHED"
  ) {
    blockers.add("precursor_untouched_holdout_not_sealed");
  }
  if (
    evidence?.evidenceMode === "FORWARD_ONLY" &&
    evidence.forwardShadow.status !== "PASS"
  ) {
    blockers.add("precursor_forward_shadow_not_passed");
  }
  if ((evidence?.futureLeakCount ?? 1) !== 0) {
    blockers.add("precursor_future_leak_detected_or_unknown");
  }
  if (evidence?.rightsAndEntitlementStatus !== "PASS") {
    blockers.add("precursor_source_rights_not_passed");
  }
  if (evidence?.independentAuditStatus !== "PASS") {
    blockers.add("precursor_independent_audit_not_passed");
  }
  const body = {
    schemaVersion: M2_PRECURSOR_RESEARCH_RESULT_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: evidence?.releaseId ?? null,
    status: blockers.size === 0
      ? "READY_FOR_REPLAY_VALIDATION_NO_EMISSION" as const
      : "BLOCKED_RESEARCH_EVIDENCE" as const,
    familyDirectionCoverage: familyDirections.size,
    venueCoverage: venues.size,
    regimeCoverage: regimes.size,
    liquiditySegmentCoverage: liquiditySegments.size,
    blockers: [...blockers].sort(),
    authority: M2_PRECURSOR_RESEARCH_AUTHORITY,
    candidateEmissionAllowed: false,
    signalGradeAllowed: false,
    readyAuthorityAllowed: false,
  };
  return deepFreezeArtifact(M2PrecursorResearchReadinessSchema.parse({
    ...body,
    resultHash: stableContentHash(body),
  }));
}

export const M2_PRECURSOR_METRIC_CONTRACT = Object.freeze({
  metrics: [
    "recall",
    "precision",
    "lead_time",
    "late_rate",
    "noise_rate",
    "false_positive_rate",
    "missed_mover_rate",
    "alert_burden",
    "execution_capacity",
    "data_cost",
  ],
  probabilityOutputAllowedBeforeCalibration: false,
  signalGradeAllowedBeforeCalibration: false,
  candidateEmissionAllowed: false,
  automaticRulePromotionAllowed: false,
  authority: M2_PRECURSOR_RESEARCH_AUTHORITY,
} as const);
