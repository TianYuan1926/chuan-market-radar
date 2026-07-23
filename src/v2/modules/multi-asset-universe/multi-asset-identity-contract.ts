import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  PositiveDecimalStringSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";
import {
  M1_ASSET_DOMAINS,
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
  type M1AssetDomain,
  type M1SourceId,
} from "../source-capability/source-capability-contract";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "../universe/stable-artifact";

export const M1_MULTI_ASSET_IDENTITY_VERSION =
  "v2-m1-multi-asset-identity.v1" as const;
export const M1_MULTI_ASSET_IDENTITY_SNAPSHOT_VERSION =
  "v2-m1-multi-asset-identity-snapshot.v1" as const;

export const M1_DERIVATIVE_ASSET_DOMAINS = [
  "CRYPTO_LINEAR_PERPETUAL",
  "EQUITY_SINGLE_NAME_PERPETUAL",
  "EQUITY_INDEX_ETF_PERPETUAL",
  "EQUITY_CFD",
  "OTHER_RWA_DERIVATIVE",
] as const satisfies readonly M1AssetDomain[];

export const M1_COVERAGE_CLASSES = [
  "SUPPORTED_DERIVATIVE",
  "ASSET_LISTING_WATCH",
] as const;

export const M1_CONTRACT_MECHANISMS = [
  "LINEAR_PERPETUAL",
  "EQUITY_CFD",
  "UNKNOWN_DERIVATIVE",
  "NONE_ASSET_WATCH",
] as const;

export const M1_LISTING_LIFECYCLE_STATES = [
  "ANNOUNCED_WAITING_CATALOG",
  "OBSERVED_UNCONFIRMED",
  "PRE_LAUNCH_OR_PREOPEN",
  "TRADING_WARMUP",
  "ESTABLISHED",
  "MAINTENANCE",
  "RESTRICTED",
  "SUSPENDED",
  "DELISTING",
  "OFFLINE",
  "UNRESOLVED",
] as const;

export const M1_CLASSIFICATION_AUTHORITIES = [
  "PROVIDER_EXPLICIT_CATEGORY",
  "PROVIDER_NEGATIVE_RWA_FLAG",
  "OFFICIAL_PRODUCT_MAPPING",
  "UNRESOLVED",
] as const;

export const M1_IDENTITY_STATUSES = [
  "EXACT",
  "PARTIAL",
  "UNRESOLVED",
] as const;

export const M1_JURISDICTION_AVAILABILITY_STATES = [
  "UNVERIFIED",
  "AVAILABLE",
  "RESTRICTED",
  "UNAVAILABLE",
] as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const VenueSchema = z.enum(M1_VENUE_SOURCE_IDS);
const DerivativeAssetDomainSchema = z.enum(M1_DERIVATIVE_ASSET_DOMAINS);
const AssetDomainSchema = z.enum(M1_ASSET_DOMAINS);

const UniqueNonEmptyStringsSchema = z.array(NonEmptyStringSchema)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "values must be unique",
      });
    }
  });

export const M1OfficialUnderlyingMappingSchema = z.strictObject({
  sourceId: VenueSchema,
  venueInstrumentId: NonEmptyStringSchema,
  assetDomain: DerivativeAssetDomainSchema,
  underlyingReferenceId: NonEmptyStringSchema,
  evidenceIds: UniqueNonEmptyStringsSchema.min(1),
  reviewedAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
}).superRefine((mapping, context) => {
  if (Date.parse(mapping.reviewedAt) >= Date.parse(mapping.expiresAt)) {
    context.addIssue({
      code: "custom",
      message: "official mapping expiry must be later than review time",
      path: ["expiresAt"],
    });
  }
  if (
    ![
      "EQUITY_SINGLE_NAME_PERPETUAL",
      "EQUITY_INDEX_ETF_PERPETUAL",
      "OTHER_RWA_DERIVATIVE",
    ].includes(mapping.assetDomain)
  ) {
    context.addIssue({
      code: "custom",
      message: "official mapping is reserved for exact RWA classification",
      path: ["assetDomain"],
    });
  }
});

export type M1OfficialUnderlyingMapping = z.infer<
  typeof M1OfficialUnderlyingMappingSchema
>;

export const M1MultiAssetInstrumentObservationSchema = z.strictObject({
  schemaVersion: z.literal(M1_MULTI_ASSET_IDENTITY_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  coverageClass: z.enum(M1_COVERAGE_CLASSES),
  assetDomain: AssetDomainSchema.nullable(),
  sourceId: VenueSchema,
  venueInstrumentId: NonEmptyStringSchema,
  canonicalInstrumentId: NonEmptyStringSchema.nullable(),
  underlyingGroupId: NonEmptyStringSchema.nullable(),
  underlyingReferenceId: NonEmptyStringSchema.nullable(),
  baseAsset: NonEmptyStringSchema.nullable(),
  quoteAsset: NonEmptyStringSchema.nullable(),
  settlementAsset: NonEmptyStringSchema.nullable(),
  contractMechanism: z.enum(M1_CONTRACT_MECHANISMS),
  contractMultiplier: PositiveDecimalStringSchema.nullable(),
  priceTick: PositiveDecimalStringSchema.nullable(),
  quantityStep: PositiveDecimalStringSchema.nullable(),
  listingEpoch: NonEmptyStringSchema,
  identityEpoch: NonEmptyStringSchema,
  identityStatus: z.enum(M1_IDENTITY_STATUSES),
  classificationAuthority: z.enum(M1_CLASSIFICATION_AUTHORITIES),
  classificationEvidenceIds: UniqueNonEmptyStringsSchema,
  providerStatus: NonEmptyStringSchema,
  lifecycleState: z.enum(M1_LISTING_LIFECYCLE_STATES),
  providerListTime: IsoDateTimeSchema.nullable(),
  providerDelistTime: IsoDateTimeSchema.nullable(),
  firstObservedAt: IsoDateTimeSchema,
  statusEffectiveAt: IsoDateTimeSchema.nullable(),
  knowledgeTime: IsoDateTimeSchema,
  jurisdictionAvailability: z.enum(
    M1_JURISDICTION_AVAILABILITY_STATES,
  ),
  sourceCapability: z.literal("DERIVATIVE_INSTRUMENT_CATALOG"),
  sourceRecordDigest: DigestSchema,
  runtimeEligibility: z.literal("NOT_EVALUATED_NO_AUTHORITY"),
  candidateEmissionAllowed: z.literal(false),
  strategyAuthority: z.literal(false),
  reasonCodes: ReasonCodesSchema,
}).superRefine((observation, context) => {
  const firstObservedAt = Date.parse(observation.firstObservedAt);
  const knowledgeTime = Date.parse(observation.knowledgeTime);
  if (firstObservedAt > knowledgeTime) {
    context.addIssue({
      code: "custom",
      message: "firstObservedAt cannot be later than knowledgeTime",
      path: ["firstObservedAt"],
    });
  }

  const isWatch = observation.coverageClass === "ASSET_LISTING_WATCH";
  if (
    isWatch &&
    (
      observation.assetDomain !== "ASSET_LISTING_WATCH" ||
      observation.contractMechanism !== "NONE_ASSET_WATCH" ||
      observation.canonicalInstrumentId !== null
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "listing watch rows cannot masquerade as derivative identities",
      path: ["coverageClass"],
    });
  }
  if (
    !isWatch &&
    observation.assetDomain !== null &&
    !M1_DERIVATIVE_ASSET_DOMAINS.includes(
      observation.assetDomain as (typeof M1_DERIVATIVE_ASSET_DOMAINS)[number],
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "derivative coverage requires a derivative asset domain",
      path: ["assetDomain"],
    });
  }

  const completeIdentity = [
    observation.assetDomain,
    observation.canonicalInstrumentId,
    observation.baseAsset,
    observation.quoteAsset,
    observation.settlementAsset,
    observation.contractMultiplier,
    observation.priceTick,
    observation.quantityStep,
  ].every((value) => value !== null);
  if (observation.identityStatus === "EXACT" && !completeIdentity) {
    context.addIssue({
      code: "custom",
      message: "exact identity requires every material identity field",
      path: ["identityStatus"],
    });
  }
  if (
    observation.identityStatus === "UNRESOLVED" &&
    (
      observation.canonicalInstrumentId !== null ||
      observation.reasonCodes.length === 0
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "unresolved identity requires null canonical id and reasons",
      path: ["identityStatus"],
    });
  }
  if (
    observation.classificationAuthority === "OFFICIAL_PRODUCT_MAPPING" &&
    observation.classificationEvidenceIds.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "official product mapping requires evidence ids",
      path: ["classificationEvidenceIds"],
    });
  }
  if (
    observation.classificationAuthority === "UNRESOLVED" &&
    observation.assetDomain !== null
  ) {
    context.addIssue({
      code: "custom",
      message: "unresolved classification cannot claim an asset domain",
      path: ["assetDomain"],
    });
  }
});

export type M1MultiAssetInstrumentObservation = z.infer<
  typeof M1MultiAssetInstrumentObservationSchema
>;

const CountByVenueSchema = z.strictObject({
  BINANCE_FUTURES: NonNegativeIntegerSchema,
  OKX_SWAP: NonNegativeIntegerSchema,
  BYBIT_DERIVATIVES: NonNegativeIntegerSchema,
  BITGET_FUTURES: NonNegativeIntegerSchema,
});

const CountByAssetDomainSchema = z.strictObject({
  CRYPTO_LINEAR_PERPETUAL: NonNegativeIntegerSchema,
  EQUITY_SINGLE_NAME_PERPETUAL: NonNegativeIntegerSchema,
  EQUITY_INDEX_ETF_PERPETUAL: NonNegativeIntegerSchema,
  EQUITY_CFD: NonNegativeIntegerSchema,
  OTHER_RWA_DERIVATIVE: NonNegativeIntegerSchema,
  ASSET_LISTING_WATCH: NonNegativeIntegerSchema,
  CROSS_MARKET_CONTEXT: z.literal(0),
  UNRESOLVED: NonNegativeIntegerSchema,
});

export const M1MultiAssetIdentitySnapshotSchema = z.strictObject({
  schemaVersion: z.literal(M1_MULTI_ASSET_IDENTITY_SNAPSHOT_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: NonEmptyStringSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  registryDigest: DigestSchema,
  snapshotId: NonEmptyStringSchema,
  contentHash: DigestSchema,
  venueDenominator: z.literal(4),
  observedCount: NonNegativeIntegerSchema,
  exactIdentityCount: NonNegativeIntegerSchema,
  unresolvedIdentityCount: NonNegativeIntegerSchema,
  countsByVenue: CountByVenueSchema,
  countsByAssetDomain: CountByAssetDomainSchema,
  observations: z.array(M1MultiAssetInstrumentObservationSchema),
  authorityBoundary: z.literal(
    "IDENTITY_AND_LISTING_GOVERNANCE_ONLY_NO_ELIGIBLE_FACT_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY",
  ),
  productionChanged: z.literal(false),
}).superRefine((snapshot, context) => {
  if (Date.parse(snapshot.sourceCutoff) > Date.parse(snapshot.generatedAt)) {
    context.addIssue({
      code: "custom",
      message: "sourceCutoff cannot be later than generatedAt",
      path: ["sourceCutoff"],
    });
  }
  if (snapshot.observedCount !== snapshot.observations.length) {
    context.addIssue({
      code: "custom",
      message: "observedCount must equal observations length",
      path: ["observedCount"],
    });
  }
  const exact = snapshot.observations.filter(
    (observation) => observation.identityStatus === "EXACT",
  ).length;
  const unresolved = snapshot.observations.filter(
    (observation) => observation.identityStatus === "UNRESOLVED",
  ).length;
  if (snapshot.exactIdentityCount !== exact) {
    context.addIssue({
      code: "custom",
      message: "exactIdentityCount does not match observations",
      path: ["exactIdentityCount"],
    });
  }
  if (snapshot.unresolvedIdentityCount !== unresolved) {
    context.addIssue({
      code: "custom",
      message: "unresolvedIdentityCount does not match observations",
      path: ["unresolvedIdentityCount"],
    });
  }
  const rowKeys = snapshot.observations.map((observation) =>
    `${observation.sourceId}:${observation.venueInstrumentId}:${observation.listingEpoch}`
  );
  if (new Set(rowKeys).size !== rowKeys.length) {
    context.addIssue({
      code: "custom",
      message: "source instrument listing epoch rows must be unique",
      path: ["observations"],
    });
  }
  const currentInstrumentKeys = snapshot.observations.map((observation) =>
    `${observation.sourceId}:${observation.venueInstrumentId}`
  );
  if (new Set(currentInstrumentKeys).size !== currentInstrumentKeys.length) {
    context.addIssue({
      code: "custom",
      message: "a point-in-time snapshot cannot duplicate a venue instrument",
      path: ["observations"],
    });
  }
  const canonicalIds = snapshot.observations
    .map((observation) => observation.canonicalInstrumentId)
    .filter((value): value is string => value !== null);
  if (new Set(canonicalIds).size !== canonicalIds.length) {
    context.addIssue({
      code: "custom",
      message: "canonical instrument ids must be unique",
      path: ["observations"],
    });
  }
  if (
    snapshot.observations.some((observation) =>
      Date.parse(observation.knowledgeTime) > Date.parse(snapshot.sourceCutoff)
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "observations cannot be known after sourceCutoff",
      path: ["observations"],
    });
  }
  const expectedVenueCounts = emptyVenueCounts();
  const expectedDomainCounts = emptyDomainCounts();
  for (const observation of snapshot.observations) {
    expectedVenueCounts[observation.sourceId] += 1;
    expectedDomainCounts[observation.assetDomain ?? "UNRESOLVED"] += 1;
  }
  if (
    stableContentHash(snapshot.countsByVenue) !==
      stableContentHash(expectedVenueCounts)
  ) {
    context.addIssue({
      code: "custom",
      message: "venue counts do not match observations",
      path: ["countsByVenue"],
    });
  }
  if (
    stableContentHash(snapshot.countsByAssetDomain) !==
      stableContentHash(expectedDomainCounts)
  ) {
    context.addIssue({
      code: "custom",
      message: "asset-domain counts do not match observations",
      path: ["countsByAssetDomain"],
    });
  }
  const sorted = [...snapshot.observations].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId) ||
    left.venueInstrumentId.localeCompare(right.venueInstrumentId) ||
    left.listingEpoch.localeCompare(right.listingEpoch)
  );
  if (
    snapshot.observations.some((observation, index) =>
      observation !== sorted[index] &&
      stableContentHash(observation) !== stableContentHash(sorted[index])
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "identity observations must use canonical ordering",
      path: ["observations"],
    });
  }
  const expectedContentHash = stableContentHash({
    scopeEpoch: snapshot.scopeEpoch,
    releaseId: snapshot.releaseId,
    generatedAt: snapshot.generatedAt,
    sourceCutoff: snapshot.sourceCutoff,
    registryDigest: snapshot.registryDigest,
    venueDenominator: snapshot.venueDenominator,
    observedCount: snapshot.observedCount,
    exactIdentityCount: snapshot.exactIdentityCount,
    unresolvedIdentityCount: snapshot.unresolvedIdentityCount,
    countsByVenue: snapshot.countsByVenue,
    countsByAssetDomain: snapshot.countsByAssetDomain,
    observations: snapshot.observations,
    authorityBoundary: snapshot.authorityBoundary,
    productionChanged: snapshot.productionChanged,
  });
  if (snapshot.contentHash !== expectedContentHash) {
    context.addIssue({
      code: "custom",
      message: "identity snapshot content hash mismatch",
      path: ["contentHash"],
    });
  }
  if (
    snapshot.snapshotId !==
      `multi-asset-identity:${snapshot.contentHash.slice(7, 31)}`
  ) {
    context.addIssue({
      code: "custom",
      message: "identity snapshot id mismatch",
      path: ["snapshotId"],
    });
  }
});

export type M1MultiAssetIdentitySnapshot = z.infer<
  typeof M1MultiAssetIdentitySnapshotSchema
>;

function normalizeIdentityToken(value: string): string {
  return value.trim().normalize("NFC").toUpperCase();
}

export function deriveM1ListingEpoch(input: {
  sourceId: M1SourceId;
  venueInstrumentId: string;
  providerListTime: string | null;
  firstObservedAt: string;
}): string {
  const identityTime = input.providerListTime ?? input.firstObservedAt;
  const digest = stableSha256({
    scopeEpoch: M1_SCOPE_EPOCH,
    sourceId: input.sourceId,
    venueInstrumentId: normalizeIdentityToken(input.venueInstrumentId),
    identityTime,
  });
  return `listing:${digest.slice(0, 24)}`;
}

export function deriveM1IdentityEpoch(input: {
  sourceId: M1SourceId;
  venueInstrumentId: string;
  listingEpoch: string;
  assetDomain: M1AssetDomain | null;
  underlyingReferenceId: string | null;
}): string {
  const digest = stableSha256({
    scopeEpoch: M1_SCOPE_EPOCH,
    sourceId: input.sourceId,
    venueInstrumentId: normalizeIdentityToken(input.venueInstrumentId),
    listingEpoch: input.listingEpoch,
    assetDomain: input.assetDomain,
    underlyingReferenceId: input.underlyingReferenceId,
  });
  return `identity:${digest.slice(0, 24)}`;
}

export function deriveM1CanonicalInstrumentId(input: {
  sourceId: M1SourceId;
  venueInstrumentId: string;
  identityEpoch: string;
}): string {
  return [
    M1_SCOPE_EPOCH,
    input.sourceId,
    normalizeIdentityToken(input.venueInstrumentId),
    input.identityEpoch,
  ].join(":");
}

export function deriveM1UnderlyingGroupId(input: {
  assetDomain: M1AssetDomain;
  underlyingReferenceId: string | null;
  settlementAsset: string | null;
}): string | null {
  if (input.underlyingReferenceId === null || input.settlementAsset === null) {
    return null;
  }
  return [
    M1_SCOPE_EPOCH,
    input.assetDomain,
    normalizeIdentityToken(input.underlyingReferenceId),
    normalizeIdentityToken(input.settlementAsset),
  ].join(":");
}

export function createM1MultiAssetObservation(
  input: Omit<
    M1MultiAssetInstrumentObservation,
    | "schemaVersion"
    | "scopeEpoch"
    | "runtimeEligibility"
    | "candidateEmissionAllowed"
    | "strategyAuthority"
  >,
): M1MultiAssetInstrumentObservation {
  return deepFreezeArtifact(
    M1MultiAssetInstrumentObservationSchema.parse({
      ...input,
      schemaVersion: M1_MULTI_ASSET_IDENTITY_VERSION,
      scopeEpoch: M1_SCOPE_EPOCH,
      runtimeEligibility: "NOT_EVALUATED_NO_AUTHORITY",
      candidateEmissionAllowed: false,
      strategyAuthority: false,
    }),
  );
}

function emptyVenueCounts(): Record<
  (typeof M1_VENUE_SOURCE_IDS)[number],
  number
> {
  return {
    BINANCE_FUTURES: 0,
    OKX_SWAP: 0,
    BYBIT_DERIVATIVES: 0,
    BITGET_FUTURES: 0,
  };
}

function emptyDomainCounts(): Record<
  M1AssetDomain | "UNRESOLVED",
  number
> {
  return {
    CRYPTO_LINEAR_PERPETUAL: 0,
    EQUITY_SINGLE_NAME_PERPETUAL: 0,
    EQUITY_INDEX_ETF_PERPETUAL: 0,
    EQUITY_CFD: 0,
    OTHER_RWA_DERIVATIVE: 0,
    ASSET_LISTING_WATCH: 0,
    CROSS_MARKET_CONTEXT: 0,
    UNRESOLVED: 0,
  };
}

function stabilizeObservationAgainstPrevious(
  current: M1MultiAssetInstrumentObservation,
  previous: M1MultiAssetInstrumentObservation | null,
): M1MultiAssetInstrumentObservation {
  if (
    previous === null ||
    previous.sourceId !== current.sourceId ||
    previous.venueInstrumentId !== current.venueInstrumentId
  ) {
    return current;
  }
  const currentListTime = current.providerListTime === null
    ? null
    : Date.parse(current.providerListTime);
  const preservePriorListingEpoch =
    currentListTime === null ||
    currentListTime <= Date.parse(previous.firstObservedAt);
  if (!preservePriorListingEpoch) {
    return current;
  }
  const identityEpoch = deriveM1IdentityEpoch({
    sourceId: current.sourceId,
    venueInstrumentId: current.venueInstrumentId,
    listingEpoch: previous.listingEpoch,
    assetDomain: current.assetDomain,
    underlyingReferenceId: current.underlyingReferenceId,
  });
  const canonicalInstrumentId = current.identityStatus === "EXACT"
    ? deriveM1CanonicalInstrumentId({
      sourceId: current.sourceId,
      venueInstrumentId: current.venueInstrumentId,
      identityEpoch,
    })
    : null;
  return deepFreezeArtifact(
    M1MultiAssetInstrumentObservationSchema.parse({
      ...current,
      listingEpoch: previous.listingEpoch,
      identityEpoch,
      canonicalInstrumentId,
      firstObservedAt: previous.firstObservedAt,
      reasonCodes: [...new Set([
        ...current.reasonCodes,
        "listing_epoch_preserved_from_prior_observation",
      ])].sort(),
    }),
  );
}

export function buildM1MultiAssetIdentitySnapshot(input: {
  releaseId: string;
  generatedAt: string;
  sourceCutoff: string;
  registryDigest: string;
  observations: readonly M1MultiAssetInstrumentObservation[];
  previous?: M1MultiAssetIdentitySnapshot | null;
}): M1MultiAssetIdentitySnapshot {
  const previous = input.previous === undefined || input.previous === null
    ? null
    : M1MultiAssetIdentitySnapshotSchema.parse(input.previous);
  if (
    previous !== null &&
    (
      previous.registryDigest !== input.registryDigest ||
      Date.parse(previous.sourceCutoff) >= Date.parse(input.sourceCutoff)
    )
  ) {
    throw new Error(
      "previous identity snapshot must use the same registry and an earlier cutoff",
    );
  }
  const previousByInstrument = new Map(
    (previous?.observations ?? []).map((observation) => [
      `${observation.sourceId}:${observation.venueInstrumentId}`,
      observation,
    ]),
  );
  const observations = input.observations.map((observation) =>
    stabilizeObservationAgainstPrevious(
      observation,
      previousByInstrument.get(
        `${observation.sourceId}:${observation.venueInstrumentId}`,
      ) ?? null,
    )
  ).sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId) ||
    left.venueInstrumentId.localeCompare(right.venueInstrumentId) ||
    left.listingEpoch.localeCompare(right.listingEpoch)
  );
  const countsByVenue = emptyVenueCounts();
  const countsByAssetDomain = emptyDomainCounts();
  for (const observation of observations) {
    countsByVenue[observation.sourceId] += 1;
    countsByAssetDomain[observation.assetDomain ?? "UNRESOLVED"] += 1;
  }

  const core = {
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: input.releaseId,
    generatedAt: input.generatedAt,
    sourceCutoff: input.sourceCutoff,
    registryDigest: input.registryDigest,
    venueDenominator: 4 as const,
    observedCount: observations.length,
    exactIdentityCount: observations.filter(
      (observation) => observation.identityStatus === "EXACT",
    ).length,
    unresolvedIdentityCount: observations.filter(
      (observation) => observation.identityStatus === "UNRESOLVED",
    ).length,
    countsByVenue,
    countsByAssetDomain,
    observations,
    authorityBoundary:
      "IDENTITY_AND_LISTING_GOVERNANCE_ONLY_NO_ELIGIBLE_FACT_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY" as const,
    productionChanged: false as const,
  };
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1MultiAssetIdentitySnapshotSchema.parse({
    ...core,
    schemaVersion: M1_MULTI_ASSET_IDENTITY_SNAPSHOT_VERSION,
    snapshotId: `multi-asset-identity:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}
