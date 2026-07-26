import { z } from "zod";
import {
  FiniteNumberSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeDecimalStringSchema,
  NonNegativeIntegerSchema,
  PositiveDecimalStringSchema,
  QualityAssessmentSchema,
  ReasonCodesSchema,
  compareNonNegativeDecimalStrings,
} from "../../runtime-schema/primitives";
import {
  M1_ASSET_DOMAINS,
  M1_COLLECTION_TIERS,
  M1_SCOPE_EPOCH,
  M1_SOURCE_IDS,
  M1_VENUE_SOURCE_IDS,
} from "../source-capability/source-capability-contract";
import {
  M1_LISTING_LIFECYCLE_STATES,
} from "../multi-asset-universe/multi-asset-identity-contract";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";

export const M1_MICROSTRUCTURE_FACT_VERSION =
  "v2-m1-microstructure-fact.v1" as const;
export const M1_LIQUIDITY_WALL_EPISODE_VERSION =
  "v2-m1-liquidity-wall-episode.v1" as const;
export const M1_MARKET_MECHANICS_FEATURE_SET_VERSION =
  "v2-m1-market-mechanics-feature-set.v1" as const;
export const M1_MARKET_MECHANICS_PARITY_VERSION =
  "v2-m1-market-mechanics-parity.v1" as const;
export const M1_MICROSTRUCTURE_AUTHORITY =
  "LOCAL_CONTRACT_ONLY_NO_RUNTIME_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY" as const;

export const M1_MICROSTRUCTURE_FACT_TYPES = [
  "PUBLIC_TRADE",
  "TOP_OF_BOOK",
  "ORDER_BOOK_SNAPSHOT",
  "ORDER_BOOK_DELTA",
  "LIQUIDATION_EVENT",
  "MARK_INDEX_REFERENCE",
] as const;

export const M1_MARKET_MECHANICS_AXES = [
  "PRICE_STRUCTURE",
  "PARTICIPATION_LEVERAGE",
  "LIQUIDITY_RESPONSE",
] as const;

export const M1_MARKET_MECHANICS_FEATURE_DEFINITIONS = Object.freeze([
  {
    featureId: "AGGRESSIVE_FLOW_IMBALANCE",
    axis: "PARTICIPATION_LEVERAGE",
    unit: "ratio",
  },
  {
    featureId: "PRICE_RESPONSE_EFFICIENCY",
    axis: "LIQUIDITY_RESPONSE",
    unit: "ratio",
  },
  {
    featureId: "BUY_ABSORPTION_STRENGTH",
    axis: "LIQUIDITY_RESPONSE",
    unit: "normalized_strength",
  },
  {
    featureId: "SELL_ABSORPTION_STRENGTH",
    axis: "LIQUIDITY_RESPONSE",
    unit: "normalized_strength",
  },
  {
    featureId: "WALL_PERSISTENCE",
    axis: "LIQUIDITY_RESPONSE",
    unit: "milliseconds",
  },
  {
    featureId: "WALL_CANCEL_VELOCITY",
    axis: "LIQUIDITY_RESPONSE",
    unit: "ratio_per_second",
  },
  {
    featureId: "WALL_REFILL_RATIO",
    axis: "LIQUIDITY_RESPONSE",
    unit: "ratio",
  },
  {
    featureId: "WALL_MIGRATION_BPS",
    axis: "LIQUIDITY_RESPONSE",
    unit: "bps",
  },
  {
    featureId: "EXECUTED_WALL_RATIO",
    axis: "LIQUIDITY_RESPONSE",
    unit: "ratio",
  },
  {
    featureId: "NEAR_BOOK_DEPTH_CHANGE",
    axis: "LIQUIDITY_RESPONSE",
    unit: "ratio",
  },
  {
    featureId: "LIQUIDITY_VACUUM_RISK",
    axis: "LIQUIDITY_RESPONSE",
    unit: "normalized_risk",
  },
  {
    featureId: "CROSS_VENUE_AGREEMENT",
    axis: "PARTICIPATION_LEVERAGE",
    unit: "ratio",
  },
  {
    featureId: "SPOOF_RISK",
    axis: "LIQUIDITY_RESPONSE",
    unit: "normalized_risk",
  },
] as const);

export type M1MarketMechanicsFeatureId =
  (typeof M1_MARKET_MECHANICS_FEATURE_DEFINITIONS)[number]["featureId"];

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const VenueSchema = z.enum(M1_VENUE_SOURCE_IDS);
const SourceSchema = z.enum(M1_SOURCE_IDS);
const EligibleAssetDomainSchema = z.enum([
  "CRYPTO_LINEAR_PERPETUAL",
  "EQUITY_SINGLE_NAME_PERPETUAL",
  "EQUITY_INDEX_ETF_PERPETUAL",
] as const satisfies readonly (typeof M1_ASSET_DOMAINS)[number][]);
const EligibleLifecycleSchema = z.enum([
  "TRADING_WARMUP",
  "ESTABLISHED",
] as const satisfies readonly (typeof M1_LISTING_LIFECYCLE_STATES)[number][]);
const UniqueStringsSchema = z.array(NonEmptyStringSchema).superRefine(
  (values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "lineage identifiers must be unique",
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

const BookLevelSchema = z.strictObject({
  side: z.enum(["BID", "ASK"]),
  price: PositiveDecimalStringSchema,
  quantity: PositiveDecimalStringSchema,
  quoteNotional: PositiveDecimalStringSchema,
});

const BookDeltaLevelSchema = z.strictObject({
  side: z.enum(["BID", "ASK"]),
  price: PositiveDecimalStringSchema,
  quantity: NonNegativeDecimalStringSchema,
  action: z.enum(["UPSERT", "DELETE"]),
}).superRefine((level, context) => {
  const deleted = level.action === "DELETE";
  const zeroQuantity = compareNonNegativeDecimalStrings(
    level.quantity,
    "0",
  ) === 0;
  if (deleted !== zeroQuantity) {
    context.addIssue({
      code: "custom",
      message: "DELETE requires zero quantity and UPSERT requires positive quantity",
      path: ["quantity"],
    });
  }
});

const PublicTradePayloadSchema = z.strictObject({
  kind: z.literal("PUBLIC_TRADE"),
  tradeId: NonEmptyStringSchema,
  aggressorSide: z.enum(["BUY", "SELL", "UNKNOWN"]),
  price: PositiveDecimalStringSchema,
  quantity: PositiveDecimalStringSchema,
  quoteNotional: PositiveDecimalStringSchema,
});

const TopOfBookPayloadSchema = z.strictObject({
  kind: z.literal("TOP_OF_BOOK"),
  bestBidPrice: PositiveDecimalStringSchema,
  bestBidQuantity: PositiveDecimalStringSchema,
  bestAskPrice: PositiveDecimalStringSchema,
  bestAskQuantity: PositiveDecimalStringSchema,
}).superRefine((payload, context) => {
  if (
    compareNonNegativeDecimalStrings(
      payload.bestBidPrice,
      payload.bestAskPrice,
    ) >= 0
  ) {
    context.addIssue({
      code: "custom",
      message: "top of book must not be crossed or locked",
      path: ["bestAskPrice"],
    });
  }
});

const OrderBookSnapshotPayloadSchema = z.strictObject({
  kind: z.literal("ORDER_BOOK_SNAPSHOT"),
  snapshotSequence: NonEmptyStringSchema,
  depthBps: NonNegativeIntegerSchema,
  levels: z.array(BookLevelSchema).min(2).max(2_000),
}).superRefine((payload, context) => {
  const keys = payload.levels.map((level) => `${level.side}:${level.price}`);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({
      code: "custom",
      message: "order book levels must be unique by side and price",
      path: ["levels"],
    });
  }
  const bids = payload.levels.filter((level) => level.side === "BID");
  const asks = payload.levels.filter((level) => level.side === "ASK");
  if (bids.length === 0 || asks.length === 0) {
    context.addIssue({
      code: "custom",
      message: "order book snapshot requires both bid and ask levels",
      path: ["levels"],
    });
    return;
  }
  for (let index = 1; index < bids.length; index += 1) {
    if (
      compareNonNegativeDecimalStrings(
        bids[index - 1]!.price,
        bids[index]!.price,
      ) <= 0
    ) {
      context.addIssue({
        code: "custom",
        message: "bid levels must be strictly descending",
        path: ["levels"],
      });
      break;
    }
  }
  for (let index = 1; index < asks.length; index += 1) {
    if (
      compareNonNegativeDecimalStrings(
        asks[index - 1]!.price,
        asks[index]!.price,
      ) >= 0
    ) {
      context.addIssue({
        code: "custom",
        message: "ask levels must be strictly ascending",
        path: ["levels"],
      });
      break;
    }
  }
  if (
    compareNonNegativeDecimalStrings(
      bids[0]!.price,
      asks[0]!.price,
    ) >= 0
  ) {
    context.addIssue({
      code: "custom",
      message: "order book snapshot must not be crossed or locked",
      path: ["levels"],
    });
  }
});

const OrderBookDeltaPayloadSchema = z.strictObject({
  kind: z.literal("ORDER_BOOK_DELTA"),
  fromSequence: NonEmptyStringSchema,
  toSequence: NonEmptyStringSchema,
  changes: z.array(BookDeltaLevelSchema).min(1).max(2_000),
}).superRefine((payload, context) => {
  const keys = payload.changes.map((level) => `${level.side}:${level.price}`);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({
      code: "custom",
      message: "one delta cannot mutate the same price level twice",
      path: ["changes"],
    });
  }
});

const LiquidationPayloadSchema = z.strictObject({
  kind: z.literal("LIQUIDATION_EVENT"),
  liquidationId: NonEmptyStringSchema,
  liquidatedSide: z.enum(["LONG", "SHORT", "UNKNOWN"]),
  price: PositiveDecimalStringSchema,
  quantity: PositiveDecimalStringSchema,
  quoteNotional: PositiveDecimalStringSchema,
});

const MarkIndexReferencePayloadSchema = z.strictObject({
  kind: z.literal("MARK_INDEX_REFERENCE"),
  markPrice: PositiveDecimalStringSchema.nullable(),
  indexPrice: PositiveDecimalStringSchema.nullable(),
}).superRefine((payload, context) => {
  if (payload.markPrice === null && payload.indexPrice === null) {
    context.addIssue({
      code: "custom",
      message: "mark/index reference requires at least one observed price",
    });
  }
});

const MicrostructurePayloadSchema = z.discriminatedUnion("kind", [
  PublicTradePayloadSchema,
  TopOfBookPayloadSchema,
  OrderBookSnapshotPayloadSchema,
  OrderBookDeltaPayloadSchema,
  LiquidationPayloadSchema,
  MarkIndexReferencePayloadSchema,
]);

const microstructureFactCoreShape = {
  schemaVersion: z.literal(M1_MICROSTRUCTURE_FACT_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  sourceId: SourceSchema,
  venue: VenueSchema,
  sourceCapability: z.enum([
    "PUBLIC_TRADE",
    "ORDER_BOOK_SNAPSHOT",
    "ORDER_BOOK_DELTA",
    "LIQUIDATION_EVENT",
    "MARK_PRICE",
    "INDEX_PRICE",
  ]),
  collectionTier: z.enum(M1_COLLECTION_TIERS),
  capabilityGrantId: NonEmptyStringSchema,
  capabilityGrantContentHash: DigestSchema,
  collectionIntentId: NonEmptyStringSchema,
  collectionIntentContentHash: DigestSchema,
  sourceCapabilityRegistryContentHash: DigestSchema,
  identityObservationContentHash: DigestSchema,
  assetDomain: EligibleAssetDomainSchema,
  lifecycleState: EligibleLifecycleSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  venueInstrumentId: NonEmptyStringSchema,
  listingEpoch: NonEmptyStringSchema,
  identityEpoch: NonEmptyStringSchema,
  factType: z.enum(M1_MICROSTRUCTURE_FACT_TYPES),
  payload: MicrostructurePayloadSchema,
  sourceRecordIds: UniqueStringsSchema.min(1),
  eventTime: IsoDateTimeSchema,
  receivedAt: IsoDateTimeSchema,
  normalizedAt: IsoDateTimeSchema,
  persistedAt: IsoDateTimeSchema.nullable(),
  sourceCutoff: IsoDateTimeSchema,
  generatedAt: IsoDateTimeSchema,
  exchangeSequence: NonEmptyStringSchema.nullable(),
  sequenceStatus: z.enum(["CONTIGUOUS", "GAP", "NOT_APPLICABLE"]),
  sourceClockStatus: z.enum(["SYNCHRONIZED", "DRIFTED", "UNKNOWN"]),
  quality: QualityAssessmentSchema,
  thresholdPolicy: z.literal(
    "ADAPTIVE_BY_INSTRUMENT_VENUE_REGIME_LIQUIDITY_SEGMENT",
  ),
  fixedNotionalDetectorThresholdAllowed: z.literal(false),
  authority: z.literal(M1_MICROSTRUCTURE_AUTHORITY),
  candidateEmissionAllowed: z.literal(false),
  signalGradeAllowed: z.literal(false),
  readyAuthorityAllowed: z.literal(false),
} as const;

type FactCore = z.infer<z.ZodObject<typeof microstructureFactCoreShape>>;

function validateMicrostructureFact(
  fact: FactCore,
  context: z.RefinementCtx,
): void {
  const expectedCapabilities: Record<
    (typeof M1_MICROSTRUCTURE_FACT_TYPES)[number],
    readonly FactCore["sourceCapability"][]
  > = {
    PUBLIC_TRADE: ["PUBLIC_TRADE"],
    TOP_OF_BOOK: ["ORDER_BOOK_SNAPSHOT"],
    ORDER_BOOK_SNAPSHOT: ["ORDER_BOOK_SNAPSHOT"],
    ORDER_BOOK_DELTA: ["ORDER_BOOK_DELTA"],
    LIQUIDATION_EVENT: ["LIQUIDATION_EVENT"],
    MARK_INDEX_REFERENCE: ["MARK_PRICE", "INDEX_PRICE"],
  };
  if (fact.factType !== fact.payload.kind) {
    context.addIssue({
      code: "custom",
      message: "fact type and payload kind must match",
      path: ["payload", "kind"],
    });
  }
  if (!expectedCapabilities[fact.factType].includes(fact.sourceCapability)) {
    context.addIssue({
      code: "custom",
      message: "fact type and registered source capability must match",
      path: ["sourceCapability"],
    });
  }
  const venueSource = M1_VENUE_SOURCE_IDS.includes(
    fact.sourceId as (typeof M1_VENUE_SOURCE_IDS)[number],
  );
  if (venueSource && fact.sourceId !== fact.venue) {
    context.addIssue({
      code: "custom",
      message: "first-party microstructure facts must preserve their Venue",
      path: ["venue"],
    });
  }
  if (
    fact.sourceId === "COINGLASS_V4" &&
    fact.factType !== "LIQUIDATION_EVENT"
  ) {
    context.addIssue({
      code: "custom",
      message: "CoinGlass cannot replace first-party trade or order-book facts",
      path: ["sourceId"],
    });
  }
  const baselineAllowed = ["TOP_OF_BOOK", "MARK_INDEX_REFERENCE"].includes(
    fact.factType,
  );
  if (
    fact.collectionTier === "T1_WIDE_MARKET" &&
    !baselineAllowed
  ) {
    context.addIssue({
      code: "custom",
      message: "raw trades, depth deltas and liquidations require bounded burst tiers",
      path: ["collectionTier"],
    });
  }
  if (fact.collectionTier === "T0_CATALOG_EVENT") {
    context.addIssue({
      code: "custom",
      message: "catalog tier cannot carry microstructure market facts",
      path: ["collectionTier"],
    });
  }

  const eventTime = Date.parse(fact.eventTime);
  const receivedAt = Date.parse(fact.receivedAt);
  const normalizedAt = Date.parse(fact.normalizedAt);
  const sourceCutoff = Date.parse(fact.sourceCutoff);
  const generatedAt = Date.parse(fact.generatedAt);
  const persistedAt = fact.persistedAt === null
    ? null
    : Date.parse(fact.persistedAt);
  if (
    eventTime > receivedAt ||
    receivedAt > normalizedAt ||
    normalizedAt > generatedAt ||
    eventTime > sourceCutoff ||
    sourceCutoff > generatedAt ||
    (persistedAt !== null &&
      (normalizedAt > persistedAt || persistedAt > generatedAt))
  ) {
    context.addIssue({
      code: "custom",
      message: "microstructure point-in-time lineage is not monotonic",
      path: ["eventTime"],
    });
  }
  if (
    fact.sequenceStatus === "CONTIGUOUS" &&
    fact.exchangeSequence === null
  ) {
    context.addIssue({
      code: "custom",
      message: "contiguous sequence status requires an exchange sequence",
      path: ["exchangeSequence"],
    });
  }
  if (
    fact.quality.status === "FRESH" &&
    (
      fact.quality.ageMs === null ||
      fact.sequenceStatus === "GAP" ||
      fact.sourceClockStatus !== "SYNCHRONIZED"
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "fresh microstructure facts require age, clock sync and no sequence gap",
      path: ["quality"],
    });
  }
  if (
    (fact.sequenceStatus === "GAP" ||
      fact.sourceClockStatus !== "SYNCHRONIZED") &&
    fact.quality.reasonCodes.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "gap or clock degradation requires explicit quality reasons",
      path: ["quality", "reasonCodes"],
    });
  }
}

export const M1MicrostructureFactInputSchema = z
  .strictObject(microstructureFactCoreShape)
  .superRefine(validateMicrostructureFact);

export const M1MicrostructureFactSchema = z.strictObject({
  ...microstructureFactCoreShape,
  factId: NonEmptyStringSchema,
  contentHash: DigestSchema,
}).superRefine((fact, context) => {
  validateMicrostructureFact(fact, context);
  const content = omitArtifactFields(fact, ["factId", "contentHash"]);
  const expectedHash = stableContentHash(content);
  if (fact.contentHash !== expectedHash) {
    context.addIssue({
      code: "custom",
      message: "microstructure fact content hash mismatch",
      path: ["contentHash"],
    });
  }
  const expectedId =
    `micro-fact:${fact.sourceId}:${fact.factType}:` +
    expectedHash.slice(7, 31);
  if (fact.factId !== expectedId) {
    context.addIssue({
      code: "custom",
      message: "microstructure fact id mismatch",
      path: ["factId"],
    });
  }
});

export type M1MicrostructureFactInput = z.infer<
  typeof M1MicrostructureFactInputSchema
>;
export type M1MicrostructureFact = z.infer<
  typeof M1MicrostructureFactSchema
>;

export function buildM1MicrostructureFact(
  rawInput: M1MicrostructureFactInput,
): M1MicrostructureFact {
  const input = M1MicrostructureFactInputSchema.parse(rawInput);
  const canonicalInput = {
    ...input,
    sourceRecordIds: [...input.sourceRecordIds].sort(),
    quality: {
      ...input.quality,
      reasonCodes: [...input.quality.reasonCodes].sort(),
    },
  };
  const contentHash = stableContentHash(canonicalInput);
  return deepFreezeArtifact(M1MicrostructureFactSchema.parse({
    ...canonicalInput,
    factId:
      `micro-fact:${canonicalInput.sourceId}:${canonicalInput.factType}:` +
      contentHash.slice(7, 31),
    contentHash,
  }));
}

function decimalSum(left: string, right: string): string {
  const [leftInteger, leftFraction = ""] = left.split(".");
  const [rightInteger, rightFraction = ""] = right.split(".");
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const leftValue = BigInt(leftInteger + leftFraction.padEnd(scale, "0"));
  const rightValue = BigInt(rightInteger + rightFraction.padEnd(scale, "0"));
  const sum = (leftValue + rightValue).toString().padStart(scale + 1, "0");
  if (scale === 0) return sum;
  const integer = sum.slice(0, -scale);
  const fraction = sum.slice(-scale).replace(/0+$/u, "");
  return fraction === "" ? integer : `${integer}.${fraction}`;
}

const liquidityWallCoreShape = {
  schemaVersion: z.literal(M1_LIQUIDITY_WALL_EPISODE_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  venue: VenueSchema,
  assetDomain: EligibleAssetDomainSchema,
  lifecycleState: EligibleLifecycleSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  venueInstrumentId: NonEmptyStringSchema,
  listingEpoch: NonEmptyStringSchema,
  identityEpoch: NonEmptyStringSchema,
  side: z.enum(["BID", "ASK"]),
  priceBandLower: PositiveDecimalStringSchema,
  priceBandUpper: PositiveDecimalStringSchema,
  normalizedNotional: PositiveDecimalStringSchema,
  distanceBps: NonNegativeIntegerSchema,
  firstSeenAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema,
  persistenceMs: NonNegativeIntegerSchema,
  executedNotional: NonNegativeDecimalStringSchema,
  cancelledNotional: NonNegativeDecimalStringSchema,
  refillCount: NonNegativeIntegerSchema,
  migrationBps: NonNegativeIntegerSchema,
  state: z.enum([
    "ACTIVE",
    "EXECUTED",
    "CANCELLED",
    "MIGRATED",
    "EXPIRED",
    "UNAVAILABLE",
  ]),
  sourceFactIds: UniqueStringsSchema.min(2),
  sourceCutoff: IsoDateTimeSchema,
  generatedAt: IsoDateTimeSchema,
  quality: QualityAssessmentSchema,
  featureVersion: NonEmptyStringSchema,
  thresholdPolicy: z.literal(
    "ADAPTIVE_BY_INSTRUMENT_VENUE_REGIME_LIQUIDITY_SEGMENT",
  ),
  fixedNotionalDetectorThresholdAllowed: z.literal(false),
  authority: z.literal(M1_MICROSTRUCTURE_AUTHORITY),
  candidateEmissionAllowed: z.literal(false),
} as const;

type WallCore = z.infer<z.ZodObject<typeof liquidityWallCoreShape>>;

function validateLiquidityWall(
  wall: WallCore,
  context: z.RefinementCtx,
): void {
  if (
    compareNonNegativeDecimalStrings(
      wall.priceBandLower,
      wall.priceBandUpper,
    ) > 0
  ) {
    context.addIssue({
      code: "custom",
      message: "wall price-band lower bound cannot exceed its upper bound",
      path: ["priceBandLower"],
    });
  }
  const firstSeenAt = Date.parse(wall.firstSeenAt);
  const lastSeenAt = Date.parse(wall.lastSeenAt);
  const sourceCutoff = Date.parse(wall.sourceCutoff);
  const generatedAt = Date.parse(wall.generatedAt);
  if (
    firstSeenAt > lastSeenAt ||
    lastSeenAt > sourceCutoff ||
    sourceCutoff > generatedAt ||
    lastSeenAt - firstSeenAt !== wall.persistenceMs
  ) {
    context.addIssue({
      code: "custom",
      message: "wall lifecycle times and persistence must agree",
      path: ["persistenceMs"],
    });
  }
  if (
    compareNonNegativeDecimalStrings(
      decimalSum(wall.executedNotional, wall.cancelledNotional),
      wall.normalizedNotional,
    ) > 0
  ) {
    context.addIssue({
      code: "custom",
      message: "executed plus cancelled wall notional cannot exceed observed notional",
      path: ["executedNotional"],
    });
  }
  if (
    wall.state === "EXECUTED" &&
    compareNonNegativeDecimalStrings(wall.executedNotional, "0") === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "executed wall state requires executed notional",
      path: ["executedNotional"],
    });
  }
  if (
    wall.state === "CANCELLED" &&
    compareNonNegativeDecimalStrings(wall.cancelledNotional, "0") === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "cancelled wall state requires cancelled notional",
      path: ["cancelledNotional"],
    });
  }
  if (wall.state === "MIGRATED" && wall.migrationBps === 0) {
    context.addIssue({
      code: "custom",
      message: "migrated wall state requires a non-zero migration distance",
      path: ["migrationBps"],
    });
  }
  if (wall.quality.status === "FRESH" && wall.quality.ageMs === null) {
    context.addIssue({
      code: "custom",
      message: "fresh wall episodes require measured age",
      path: ["quality", "ageMs"],
    });
  }
}

export const M1LiquidityWallEpisodeInputSchema = z
  .strictObject(liquidityWallCoreShape)
  .superRefine(validateLiquidityWall);

export const M1LiquidityWallEpisodeSchema = z.strictObject({
  ...liquidityWallCoreShape,
  wallEpisodeId: NonEmptyStringSchema,
  contentHash: DigestSchema,
}).superRefine((wall, context) => {
  validateLiquidityWall(wall, context);
  const content = omitArtifactFields(wall, [
    "wallEpisodeId",
    "contentHash",
  ]);
  const expectedHash = stableContentHash(content);
  if (wall.contentHash !== expectedHash) {
    context.addIssue({
      code: "custom",
      message: "liquidity-wall content hash mismatch",
      path: ["contentHash"],
    });
  }
  const expectedId =
    `wall-episode:${wall.venue}:${wall.side}:` +
    expectedHash.slice(7, 31);
  if (wall.wallEpisodeId !== expectedId) {
    context.addIssue({
      code: "custom",
      message: "liquidity-wall episode id mismatch",
      path: ["wallEpisodeId"],
    });
  }
});

export type M1LiquidityWallEpisodeInput = z.infer<
  typeof M1LiquidityWallEpisodeInputSchema
>;
export type M1LiquidityWallEpisode = z.infer<
  typeof M1LiquidityWallEpisodeSchema
>;

export function buildM1LiquidityWallEpisode(
  rawInput: M1LiquidityWallEpisodeInput,
): M1LiquidityWallEpisode {
  const input = M1LiquidityWallEpisodeInputSchema.parse(rawInput);
  const canonicalInput = {
    ...input,
    sourceFactIds: [...input.sourceFactIds].sort(),
    quality: {
      ...input.quality,
      reasonCodes: [...input.quality.reasonCodes].sort(),
    },
  };
  const contentHash = stableContentHash(canonicalInput);
  return deepFreezeArtifact(M1LiquidityWallEpisodeSchema.parse({
    ...canonicalInput,
    wallEpisodeId:
      `wall-episode:${canonicalInput.venue}:${canonicalInput.side}:` +
      contentHash.slice(7, 31),
    contentHash,
  }));
}

const FeatureObservationSchema = z.strictObject({
  featureId: z.enum(
    M1_MARKET_MECHANICS_FEATURE_DEFINITIONS.map(
      (definition) => definition.featureId,
    ) as [
      M1MarketMechanicsFeatureId,
      ...M1MarketMechanicsFeatureId[],
    ],
  ),
  axis: z.enum(M1_MARKET_MECHANICS_AXES),
  value: FiniteNumberSchema.nullable(),
  unit: NonEmptyStringSchema,
  sourceFactIds: UniqueStringsSchema,
  sourceWallEpisodeIds: UniqueStringsSchema,
  quality: QualityAssessmentSchema,
  reasonCodes: ReasonCodesSchema,
});

const marketMechanicsFeatureSetCoreShape = {
  schemaVersion: z.literal(M1_MARKET_MECHANICS_FEATURE_SET_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  venue: VenueSchema,
  assetDomain: EligibleAssetDomainSchema,
  lifecycleState: EligibleLifecycleSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  venueInstrumentId: NonEmptyStringSchema,
  listingEpoch: NonEmptyStringSchema,
  identityEpoch: NonEmptyStringSchema,
  timeframe: NonEmptyStringSchema,
  regime: z.enum([
    "TREND",
    "RANGE",
    "TRANSITION",
    "STRESS",
    "UNKNOWN",
  ]),
  liquiditySegment: z.enum([
    "DEEP",
    "NORMAL",
    "THIN",
    "NEW_LISTING",
    "UNKNOWN",
  ]),
  sectorSnapshotId: NonEmptyStringSchema.nullable(),
  computationMode: z.enum(["ONLINE", "REPLAY"]),
  computationRunId: NonEmptyStringSchema,
  featureDefinitionVersion: NonEmptyStringSchema,
  inputFactIds: UniqueStringsSchema.min(1),
  inputWallEpisodeIds: UniqueStringsSchema,
  features: z.array(FeatureObservationSchema).length(
    M1_MARKET_MECHANICS_FEATURE_DEFINITIONS.length,
  ),
  sourceCutoff: IsoDateTimeSchema,
  computedAt: IsoDateTimeSchema,
  generatedAt: IsoDateTimeSchema,
  authority: z.literal(M1_MICROSTRUCTURE_AUTHORITY),
  candidateEmissionAllowed: z.literal(false),
  signalGradeAllowed: z.literal(false),
  readyAuthorityAllowed: z.literal(false),
} as const;

type FeatureSetCore = z.infer<
  z.ZodObject<typeof marketMechanicsFeatureSetCoreShape>
>;

function validateFeatureSet(
  featureSet: FeatureSetCore,
  context: z.RefinementCtx,
): void {
  const expectedIds = M1_MARKET_MECHANICS_FEATURE_DEFINITIONS.map(
    (definition) => definition.featureId,
  );
  const observedIds = featureSet.features.map((feature) => feature.featureId);
  if (
    new Set(observedIds).size !== expectedIds.length ||
    expectedIds.some((featureId) => !observedIds.includes(featureId))
  ) {
    context.addIssue({
      code: "custom",
      message: "market-mechanics feature denominator must be complete and unique",
      path: ["features"],
    });
  }
  const definitionById = new Map(
    M1_MARKET_MECHANICS_FEATURE_DEFINITIONS.map((definition) => [
      definition.featureId,
      definition,
    ]),
  );
  const factIds = new Set(featureSet.inputFactIds);
  const wallIds = new Set(featureSet.inputWallEpisodeIds);
  for (const [index, feature] of featureSet.features.entries()) {
    const definition = definitionById.get(feature.featureId);
    if (
      definition === undefined ||
      definition.axis !== feature.axis ||
      definition.unit !== feature.unit
    ) {
      context.addIssue({
        code: "custom",
        message: "market-mechanics feature axis and unit must match its registry",
        path: ["features", index],
      });
    }
    if (
      feature.sourceFactIds.some((factId) => !factIds.has(factId)) ||
      feature.sourceWallEpisodeIds.some((wallId) => !wallIds.has(wallId))
    ) {
      context.addIssue({
        code: "custom",
        message: "feature lineage must be contained in the feature-set inputs",
        path: ["features", index],
      });
    }
    if (
      feature.value !== null &&
      feature.sourceFactIds.length === 0 &&
      feature.sourceWallEpisodeIds.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "valued market-mechanics features require source lineage",
        path: ["features", index],
      });
    }
    if (
      (feature.value === null) === (feature.quality.status === "FRESH")
    ) {
      context.addIssue({
        code: "custom",
        message: "feature value and freshness state disagree",
        path: ["features", index, "value"],
      });
    }
    if (
      feature.value === null &&
      feature.reasonCodes.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "null features require an explicit unavailable reason",
        path: ["features", index, "reasonCodes"],
      });
    }
  }
  if (
    Date.parse(featureSet.sourceCutoff) >
      Date.parse(featureSet.computedAt) ||
    Date.parse(featureSet.computedAt) >
      Date.parse(featureSet.generatedAt)
  ) {
    context.addIssue({
      code: "custom",
      message: "feature computation cannot precede its point-in-time cutoff",
      path: ["computedAt"],
    });
  }
}

export const M1MarketMechanicsFeatureSetInputSchema = z
  .strictObject(marketMechanicsFeatureSetCoreShape)
  .superRefine(validateFeatureSet);

export const M1MarketMechanicsFeatureSetSchema = z.strictObject({
  ...marketMechanicsFeatureSetCoreShape,
  featureSetId: NonEmptyStringSchema,
  contentHash: DigestSchema,
}).superRefine((featureSet, context) => {
  validateFeatureSet(featureSet, context);
  const content = omitArtifactFields(featureSet, [
    "featureSetId",
    "contentHash",
  ]);
  const expectedHash = stableContentHash(content);
  if (featureSet.contentHash !== expectedHash) {
    context.addIssue({
      code: "custom",
      message: "market-mechanics feature-set content hash mismatch",
      path: ["contentHash"],
    });
  }
  const expectedId =
    `market-mechanics:${featureSet.venue}:` +
    expectedHash.slice(7, 31);
  if (featureSet.featureSetId !== expectedId) {
    context.addIssue({
      code: "custom",
      message: "market-mechanics feature-set id mismatch",
      path: ["featureSetId"],
    });
  }
});

export type M1MarketMechanicsFeatureSetInput = z.infer<
  typeof M1MarketMechanicsFeatureSetInputSchema
>;
export type M1MarketMechanicsFeatureSet = z.infer<
  typeof M1MarketMechanicsFeatureSetSchema
>;

export function buildM1MarketMechanicsFeatureSet(
  rawInput: M1MarketMechanicsFeatureSetInput,
): M1MarketMechanicsFeatureSet {
  const input = M1MarketMechanicsFeatureSetInputSchema.parse(rawInput);
  const canonicalInput = {
    ...input,
    inputFactIds: [...input.inputFactIds].sort(),
    inputWallEpisodeIds: [...input.inputWallEpisodeIds].sort(),
    features: [...input.features]
      .map((feature) => ({
        ...feature,
        sourceFactIds: [...feature.sourceFactIds].sort(),
        sourceWallEpisodeIds: [...feature.sourceWallEpisodeIds].sort(),
        reasonCodes: [...feature.reasonCodes].sort(),
      }))
      .sort((left, right) => left.featureId.localeCompare(right.featureId)),
  };
  const contentHash = stableContentHash(canonicalInput);
  return deepFreezeArtifact(M1MarketMechanicsFeatureSetSchema.parse({
    ...canonicalInput,
    featureSetId:
      `market-mechanics:${canonicalInput.venue}:` +
      contentHash.slice(7, 31),
    contentHash,
  }));
}

function paritySemanticContent(
  featureSet: M1MarketMechanicsFeatureSet,
): unknown {
  return {
    scopeEpoch: featureSet.scopeEpoch,
    releaseId: featureSet.releaseId,
    venue: featureSet.venue,
    assetDomain: featureSet.assetDomain,
    lifecycleState: featureSet.lifecycleState,
    canonicalInstrumentId: featureSet.canonicalInstrumentId,
    venueInstrumentId: featureSet.venueInstrumentId,
    listingEpoch: featureSet.listingEpoch,
    identityEpoch: featureSet.identityEpoch,
    timeframe: featureSet.timeframe,
    regime: featureSet.regime,
    liquiditySegment: featureSet.liquiditySegment,
    sectorSnapshotId: featureSet.sectorSnapshotId,
    featureDefinitionVersion: featureSet.featureDefinitionVersion,
    inputFactIds: featureSet.inputFactIds,
    inputWallEpisodeIds: featureSet.inputWallEpisodeIds,
    features: featureSet.features,
    sourceCutoff: featureSet.sourceCutoff,
  };
}

export const M1MarketMechanicsParitySchema = z.strictObject({
  schemaVersion: z.literal(M1_MARKET_MECHANICS_PARITY_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  status: z.enum(["PASS", "FAIL"]),
  onlineSemanticHash: DigestSchema,
  replaySemanticHash: DigestSchema,
  replayRepeatSemanticHash: DigestSchema,
  reasonCodes: ReasonCodesSchema,
  authority: z.literal(M1_MICROSTRUCTURE_AUTHORITY),
  candidateEmissionAllowed: z.literal(false),
  parityId: NonEmptyStringSchema,
  contentHash: DigestSchema,
});

export type M1MarketMechanicsParity = z.infer<
  typeof M1MarketMechanicsParitySchema
>;

export function assessM1MarketMechanicsParity(input: {
  online: M1MarketMechanicsFeatureSet;
  replay: M1MarketMechanicsFeatureSet;
  replayRepeat: M1MarketMechanicsFeatureSet;
}): M1MarketMechanicsParity {
  const online = M1MarketMechanicsFeatureSetSchema.parse(input.online);
  const replay = M1MarketMechanicsFeatureSetSchema.parse(input.replay);
  const replayRepeat = M1MarketMechanicsFeatureSetSchema.parse(
    input.replayRepeat,
  );
  const onlineSemanticHash = stableContentHash(paritySemanticContent(online));
  const replaySemanticHash = stableContentHash(paritySemanticContent(replay));
  const replayRepeatSemanticHash = stableContentHash(
    paritySemanticContent(replayRepeat),
  );
  const modeCorrect =
    online.computationMode === "ONLINE" &&
    replay.computationMode === "REPLAY" &&
    replayRepeat.computationMode === "REPLAY" &&
    replay.computationRunId !== replayRepeat.computationRunId;
  const status =
    modeCorrect &&
      onlineSemanticHash === replaySemanticHash &&
      replaySemanticHash === replayRepeatSemanticHash
      ? "PASS"
      : "FAIL";
  const body = {
    schemaVersion: M1_MARKET_MECHANICS_PARITY_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: online.releaseId,
    canonicalInstrumentId: online.canonicalInstrumentId,
    status,
    onlineSemanticHash,
    replaySemanticHash,
    replayRepeatSemanticHash,
    reasonCodes: status === "PASS"
      ? ["online_replay_semantics_identical"]
      : [
        ...(modeCorrect ? [] : ["online_replay_mode_or_run_identity_invalid"]),
        ...(onlineSemanticHash === replaySemanticHash
          ? []
          : ["online_replay_semantic_mismatch"]),
        ...(replaySemanticHash === replayRepeatSemanticHash
          ? []
          : ["replay_not_deterministic"]),
      ],
    authority: M1_MICROSTRUCTURE_AUTHORITY,
    candidateEmissionAllowed: false,
  } as const;
  const contentHash = stableContentHash(body);
  return deepFreezeArtifact(M1MarketMechanicsParitySchema.parse({
    ...body,
    parityId: `market-mechanics-parity:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}
