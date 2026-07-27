import { z } from "zod";
import {
  DATA_QUALITY_STATES,
  type DataQualityState,
} from "../../domain/states";
import {
  DecimalStringSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";
import {
  M1_ASSET_DOMAINS,
  M1_CAPABILITY_IDS,
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
} from "../source-capability/source-capability-contract";
import {
  M1_LISTING_LIFECYCLE_STATES,
  M1MultiAssetIdentitySnapshotSchema,
  type M1MultiAssetIdentitySnapshot,
  type M1MultiAssetInstrumentObservation,
} from "../multi-asset-universe/multi-asset-identity-contract";
import {
  M1_MULTI_ASSET_SHADOW_ASSET_DOMAIN_BUCKETS,
} from "../shadow/m1-multi-asset-shadow-contract";
import {
  M1_WIDE_MARKET_FIELD_IDS,
  M1_WIDE_MARKET_SOURCE_PROFILE_DIGEST,
  M1WideMarketVenueBatchSchema,
  m1WideMarketProfileFor,
  type M1WideMarketComponentObservation,
  type M1WideMarketFieldId,
  type M1WideMarketVenueBatch,
  type M1WideMarketVenueSourceId,
} from "./adapters/four-venue-wide-market-fact";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
} from "../source-capability/adapters/four-venue-capability-registry";
import {
  M1MultiAssetShadowUpstreamBindingSchema,
  type M1MultiAssetShadowUpstreamBinding,
} from "../shadow/m1-multi-asset-shadow-contract";

export const M1_MULTI_ASSET_BASE_FACT_VERSION =
  "v2-m1-multi-asset-base-fact.v3" as const;
export const M1_MULTI_ASSET_BASE_FACT_SNAPSHOT_VERSION =
  "v2-m1-multi-asset-base-fact-snapshot.v5" as const;
export const M1_LISTING_WATCH_BINDING_VERSION =
  "v2-m1-listing-watch-evidence-binding.v3" as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const VenueSchema = z.enum(M1_VENUE_SOURCE_IDS);
const QualitySchema = z.enum(DATA_QUALITY_STATES);
const UniqueStringsSchema = z.array(NonEmptyStringSchema)
  .superRefine((values, context) => {
    if (
      new Set(values).size !== values.length ||
      values.some((value, index) =>
        index > 0 && values[index - 1]!.localeCompare(value) >= 0
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "values must be unique and canonically ordered",
      });
    }
  });
const UniqueReasonCodesSchema = ReasonCodesSchema.superRefine(
  (values, context) => {
    if (
      new Set(values).size !== values.length ||
      values.some((value, index) =>
        index > 0 && values[index - 1]!.localeCompare(value) >= 0
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "reason codes must be unique and canonically ordered",
      });
    }
  },
);

const ListingWatchEvidenceBindingCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_LISTING_WATCH_BINDING_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  upstreamBindingId: NonEmptyStringSchema,
  upstreamBindingHash: DigestSchema,
  sourceId: z.enum(["BYBIT_DERIVATIVES", "BITGET_FUTURES"]),
  evidenceId: NonEmptyStringSchema,
  evidenceHash: DigestSchema,
  sourceCutoff: IsoDateTimeSchema,
  status: z.literal("COMMITTED_NO_GAP"),
  checkpointGapCount: z.literal(0),
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  networkEnvironment: z.enum([
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  authorityGranted: z.literal(false),
});

export const M1ListingWatchEvidenceBindingSchema =
  ListingWatchEvidenceBindingCoreSchema.extend({
    bindingId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((binding, context) => {
  if (
    (binding.evidenceClass === "LIVE_READ_ONLY" &&
      binding.networkEnvironment !== "TENCENT_ISOLATED_READ_ONLY") ||
    (binding.evidenceClass === "TEST_ONLY" &&
      binding.networkEnvironment !== "TEST_HARNESS")
  ) {
    context.addIssue({
      code: "custom",
      message: "listing checkpoint evidence class and environment disagree",
      path: ["networkEnvironment"],
    });
  }
  const core = listingWatchEvidenceBindingCore(binding);
  const expectedHash = stableContentHash(core);
  if (
    binding.contentHash !== expectedHash ||
    binding.bindingId !==
      `m1-listing-watch-binding:${binding.sourceId}:${
        expectedHash.slice(7, 23)
      }`
  ) {
    context.addIssue({
      code: "custom",
      message: "listing checkpoint binding identity mismatch",
      path: ["contentHash"],
    });
  }
});

export type M1ListingWatchEvidenceBinding = z.infer<
  typeof M1ListingWatchEvidenceBindingSchema
>;

function listingWatchEvidenceBindingCore(
  value: z.input<typeof ListingWatchEvidenceBindingCoreSchema> & {
    readonly bindingId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof ListingWatchEvidenceBindingCoreSchema> {
  return ListingWatchEvidenceBindingCoreSchema.parse({
    schemaVersion: value.schemaVersion,
    scopeEpoch: value.scopeEpoch,
    releaseId: value.releaseId,
    upstreamBindingId: value.upstreamBindingId,
    upstreamBindingHash: value.upstreamBindingHash,
    sourceId: value.sourceId,
    evidenceId: value.evidenceId,
    evidenceHash: value.evidenceHash,
    sourceCutoff: value.sourceCutoff,
    status: value.status,
    checkpointGapCount: value.checkpointGapCount,
    evidenceClass: value.evidenceClass,
    networkEnvironment: value.networkEnvironment,
    rawBodyRetained: value.rawBodyRetained,
    secretMaterialPresent: value.secretMaterialPresent,
    authorityGranted: value.authorityGranted,
  });
}

export function buildM1ListingWatchEvidenceBinding(
  input: z.input<typeof ListingWatchEvidenceBindingCoreSchema>,
): M1ListingWatchEvidenceBinding {
  const core = listingWatchEvidenceBindingCore(input);
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1ListingWatchEvidenceBindingSchema.parse({
    ...core,
    bindingId:
      `m1-listing-watch-binding:${core.sourceId}:${
        contentHash.slice(7, 23)
      }`,
    contentHash,
  }));
}

const FieldFactSchema = z.strictObject({
  value: DecimalStringSchema.nullable(),
  eventTime: IsoDateTimeSchema.nullable(),
  receivedAt: IsoDateTimeSchema.nullable(),
  ageMs: NonNegativeIntegerSchema.nullable(),
  sourceRecordId: NonEmptyStringSchema.nullable(),
  qualityStatus: QualitySchema,
  reasonCodes: UniqueReasonCodesSchema,
}).superRefine((field, context) => {
  const hasValue = field.value !== null;
  if (
    hasValue !== (field.eventTime !== null) ||
    hasValue !== (field.receivedAt !== null) ||
    hasValue !== (field.ageMs !== null) ||
    hasValue !== (field.sourceRecordId !== null)
  ) {
    context.addIssue({
      code: "custom",
      message: "field value and point-in-time lineage must be present together",
    });
  }
  if (
    hasValue &&
    !["FRESH", "PARTIAL", "STALE"].includes(field.qualityStatus)
  ) {
    context.addIssue({
      code: "custom",
      message: "invalid or unavailable fields cannot retain a value",
      path: ["qualityStatus"],
    });
  }
  if (
    !hasValue &&
    ["FRESH", "STALE"].includes(field.qualityStatus)
  ) {
    context.addIssue({
      code: "custom",
      message: "fresh or stale fields require an observed value",
      path: ["qualityStatus"],
    });
  }
  if (
    field.qualityStatus === "FRESH" &&
    field.reasonCodes.length > 0
  ) {
    context.addIssue({
      code: "custom",
      message: "fresh fields cannot carry degradation reasons",
      path: ["reasonCodes"],
    });
  }
  if (
    field.qualityStatus !== "FRESH" &&
    field.reasonCodes.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "non-fresh fields require reasons",
      path: ["reasonCodes"],
    });
  }
});

const FactFieldsSchema = z.strictObject({
  lastPrice: FieldFactSchema,
  markPrice: FieldFactSchema,
  indexPrice: FieldFactSchema,
  bestBidPrice: FieldFactSchema,
  bestAskPrice: FieldFactSchema,
  fundingRate: FieldFactSchema,
  openInterest: FieldFactSchema,
  baseVolume24h: FieldFactSchema,
  quoteVolume24h: FieldFactSchema,
});

const BaseFactCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_MULTI_ASSET_BASE_FACT_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  normalizedAt: IsoDateTimeSchema,
  upstreamBindingId: NonEmptyStringSchema,
  upstreamBindingHash: DigestSchema,
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  networkEnvironment: z.enum([
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  identitySnapshotId: NonEmptyStringSchema,
  identitySnapshotHash: DigestSchema,
  catalogCaptureBindingId: NonEmptyStringSchema,
  catalogCaptureBindingHash: DigestSchema,
  identityEvidenceStatus: z.enum([
    "PASS_FULL_SCOPE_IDENTITY_NO_AUTHORITY",
    "BLOCKED_INCOMPLETE_CATALOG_IDENTITY",
    "TEST_ONLY_NO_LIVE_IDENTITY_EVIDENCE",
  ]),
  registryDigest: DigestSchema,
  sourceProfileDigest: DigestSchema,
  factClass: z.enum([
    "T1_WIDE_MARKET_SNAPSHOT",
    "T0_LISTING_LIFECYCLE_SNAPSHOT",
    "EXPLICIT_BLOCKED_IDENTITY_ACCOUNTING",
  ]),
  sourceId: VenueSchema,
  venueInstrumentId: NonEmptyStringSchema,
  canonicalInstrumentId: NonEmptyStringSchema.nullable(),
  assetDomain: z.enum(M1_ASSET_DOMAINS).nullable(),
  coverageClass: z.enum([
    "SUPPORTED_DERIVATIVE",
    "ASSET_LISTING_WATCH",
  ]),
  listingEpoch: NonEmptyStringSchema,
  identityEpoch: NonEmptyStringSchema,
  identityStatus: z.enum(["EXACT", "PARTIAL", "UNRESOLVED"]),
  lifecycleState: z.enum(M1_LISTING_LIFECYCLE_STATES),
  routeDisposition: z.enum([
    "ELIGIBLE_T1_WIDE_MARKET",
    "ELIGIBLE_T0_LISTING_WATCH",
    "BLOCKED_IDENTITY_OR_LIFECYCLE",
  ]),
  scheduled: z.boolean(),
  attempted: z.boolean(),
  sourceBatchId: NonEmptyStringSchema,
  sourceBatchHash: DigestSchema,
  sourceComponentResultIds: UniqueStringsSchema,
  sourceComponentResultHashes: UniqueStringsSchema,
  listingEvidenceId: NonEmptyStringSchema.nullable(),
  listingEvidenceHash: DigestSchema.nullable(),
  sourceCapabilityIds: z.array(z.enum(M1_CAPABILITY_IDS)),
  sourceRecordIds: UniqueStringsSchema,
  fields: FactFieldsSchema,
  observedFieldCount: NonNegativeIntegerSchema,
  freshFieldCount: NonNegativeIntegerSchema,
  qualityStatus: QualitySchema,
  providerFailureKinds: z.array(z.enum([
    "RATE_LIMITED",
    "AUTH_ERROR",
    "TRANSPORT_ERROR",
    "INVALID",
    "UNAVAILABLE",
  ])),
  reasonCodes: UniqueReasonCodesSchema,
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  automaticTradingAllowed: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1MultiAssetBaseFactSchema = BaseFactCoreSchema.extend({
  factId: NonEmptyStringSchema,
  contentHash: DigestSchema,
}).superRefine((fact, context) => {
  if (
    (fact.evidenceClass === "LIVE_READ_ONLY" &&
      fact.networkEnvironment !== "TENCENT_ISOLATED_READ_ONLY") ||
    (fact.evidenceClass === "TEST_ONLY" &&
      fact.networkEnvironment !== "TEST_HARNESS") ||
    (fact.evidenceClass === "TEST_ONLY" &&
      fact.identityEvidenceStatus !==
        "TEST_ONLY_NO_LIVE_IDENTITY_EVIDENCE") ||
    (fact.evidenceClass === "LIVE_READ_ONLY" &&
      fact.identityEvidenceStatus ===
        "TEST_ONLY_NO_LIVE_IDENTITY_EVIDENCE")
  ) {
    context.addIssue({
      code: "custom",
      message: "base fact evidence class and network environment disagree",
      path: ["networkEnvironment"],
    });
  }
  const fieldRows = M1_WIDE_MARKET_FIELD_IDS.map(
    (field) => fact.fields[field],
  );
  if (
    fact.observedFieldCount !==
      fieldRows.filter((field) => field.value !== null).length ||
    fact.freshFieldCount !==
      fieldRows.filter((field) => field.qualityStatus === "FRESH").length
  ) {
    context.addIssue({
      code: "custom",
      message: "field coverage counts do not match field facts",
      path: ["observedFieldCount"],
    });
  }
  if (fact.attempted && !fact.scheduled) {
    context.addIssue({
      code: "custom",
      message: "an unscheduled fact cannot claim an attempt",
      path: ["attempted"],
    });
  }
  const listing = fact.factClass === "T0_LISTING_LIFECYCLE_SNAPSHOT";
  const hasListingEvidence =
    fact.listingEvidenceId !== null && fact.listingEvidenceHash !== null;
  if (
    (fact.listingEvidenceId === null) !==
      (fact.listingEvidenceHash === null) ||
    listing !== (fact.coverageClass === "ASSET_LISTING_WATCH") ||
    (!listing && hasListingEvidence) ||
    (listing && fact.attempted !== hasListingEvidence)
  ) {
    context.addIssue({
      code: "custom",
      message: "listing fact evidence and coverage class disagree",
      path: ["factClass"],
    });
  }
  if (
    fact.routeDisposition === "BLOCKED_IDENTITY_OR_LIFECYCLE" &&
    (fact.scheduled || fact.attempted)
  ) {
    context.addIssue({
      code: "custom",
      message: "blocked identity facts cannot be scheduled or attempted",
      path: ["routeDisposition"],
    });
  }
  if (
    fact.qualityStatus === "FRESH" &&
    fact.reasonCodes.length > 0
  ) {
    context.addIssue({
      code: "custom",
      message: "fresh facts cannot carry degradation reasons",
      path: ["reasonCodes"],
    });
  }
  if (
    fact.qualityStatus !== "FRESH" &&
    fact.reasonCodes.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "non-fresh facts require reasons",
      path: ["reasonCodes"],
    });
  }
  const expectedHash = stableContentHash(baseFactCore(fact));
  if (fact.contentHash !== expectedHash) {
    context.addIssue({
      code: "custom",
      message: "base fact content hash mismatch",
      path: ["contentHash"],
    });
  }
  if (
    fact.factId !==
      `multi-asset-base-fact:${fact.sourceId}:${
        expectedHash.slice(7, 31)
      }`
  ) {
    context.addIssue({
      code: "custom",
      message: "base fact id mismatch",
      path: ["factId"],
    });
  }
});

export type M1MultiAssetBaseFact = z.infer<
  typeof M1MultiAssetBaseFactSchema
>;

function baseFactCore(
  value: z.input<typeof BaseFactCoreSchema> & {
    readonly factId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof BaseFactCoreSchema> {
  return BaseFactCoreSchema.parse({
    schemaVersion: value.schemaVersion,
    scopeEpoch: value.scopeEpoch,
    releaseId: value.releaseId,
    generatedAt: value.generatedAt,
    sourceCutoff: value.sourceCutoff,
    normalizedAt: value.normalizedAt,
    upstreamBindingId: value.upstreamBindingId,
    upstreamBindingHash: value.upstreamBindingHash,
    evidenceClass: value.evidenceClass,
    networkEnvironment: value.networkEnvironment,
    identitySnapshotId: value.identitySnapshotId,
    identitySnapshotHash: value.identitySnapshotHash,
    catalogCaptureBindingId: value.catalogCaptureBindingId,
    catalogCaptureBindingHash: value.catalogCaptureBindingHash,
    identityEvidenceStatus: value.identityEvidenceStatus,
    registryDigest: value.registryDigest,
    sourceProfileDigest: value.sourceProfileDigest,
    factClass: value.factClass,
    sourceId: value.sourceId,
    venueInstrumentId: value.venueInstrumentId,
    canonicalInstrumentId: value.canonicalInstrumentId,
    assetDomain: value.assetDomain,
    coverageClass: value.coverageClass,
    listingEpoch: value.listingEpoch,
    identityEpoch: value.identityEpoch,
    identityStatus: value.identityStatus,
    lifecycleState: value.lifecycleState,
    routeDisposition: value.routeDisposition,
    scheduled: value.scheduled,
    attempted: value.attempted,
    sourceBatchId: value.sourceBatchId,
    sourceBatchHash: value.sourceBatchHash,
    sourceComponentResultIds: value.sourceComponentResultIds,
    sourceComponentResultHashes: value.sourceComponentResultHashes,
    listingEvidenceId: value.listingEvidenceId,
    listingEvidenceHash: value.listingEvidenceHash,
    sourceCapabilityIds: value.sourceCapabilityIds,
    sourceRecordIds: value.sourceRecordIds,
    fields: value.fields,
    observedFieldCount: value.observedFieldCount,
    freshFieldCount: value.freshFieldCount,
    qualityStatus: value.qualityStatus,
    providerFailureKinds: value.providerFailureKinds,
    reasonCodes: value.reasonCodes,
    rawBodyRetained: value.rawBodyRetained,
    secretMaterialPresent: value.secretMaterialPresent,
    factAuthorityGranted: value.factAuthorityGranted,
    candidateAuthorityGranted: value.candidateAuthorityGranted,
    strategyAuthorityGranted: value.strategyAuthorityGranted,
    readyAuthorityGranted: value.readyAuthorityGranted,
    automaticTradingAllowed: value.automaticTradingAllowed,
    productionChanged: value.productionChanged,
  });
}

const QualityCountsSchema = z.strictObject({
  FRESH: NonNegativeIntegerSchema,
  PARTIAL: NonNegativeIntegerSchema,
  STALE: NonNegativeIntegerSchema,
  UNAVAILABLE: NonNegativeIntegerSchema,
  RATE_LIMITED: NonNegativeIntegerSchema,
  AUTH_ERROR: NonNegativeIntegerSchema,
  TRANSPORT_ERROR: NonNegativeIntegerSchema,
  INVALID: NonNegativeIntegerSchema,
});

const SnapshotCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_MULTI_ASSET_BASE_FACT_SNAPSHOT_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  normalizedAt: IsoDateTimeSchema,
  upstreamBindingId: NonEmptyStringSchema,
  upstreamBindingHash: DigestSchema,
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  networkEnvironment: z.enum([
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  identitySnapshotId: NonEmptyStringSchema,
  identitySnapshotHash: DigestSchema,
  catalogCaptureBindingId: NonEmptyStringSchema,
  catalogCaptureBindingHash: DigestSchema,
  identityEvidenceStatus: z.enum([
    "PASS_FULL_SCOPE_IDENTITY_NO_AUTHORITY",
    "BLOCKED_INCOMPLETE_CATALOG_IDENTITY",
    "TEST_ONLY_NO_LIVE_IDENTITY_EVIDENCE",
  ]),
  registryDigest: DigestSchema,
  sourceProfileDigest: DigestSchema,
  venueBatchIds: z.array(NonEmptyStringSchema).length(4),
  venueBatchHashes: z.array(DigestSchema).length(4),
  observedSubjectCount: NonNegativeIntegerSchema,
  exactIdentityCount: NonNegativeIntegerSchema,
  partialIdentityCount: NonNegativeIntegerSchema,
  unresolvedIdentityCount: NonNegativeIntegerSchema,
  routeEligibleCount: NonNegativeIntegerSchema,
  routeBlockedCount: NonNegativeIntegerSchema,
  scheduledCount: NonNegativeIntegerSchema,
  attemptedCount: NonNegativeIntegerSchema,
  collectedCount: NonNegativeIntegerSchema,
  freshCount: NonNegativeIntegerSchema,
  qualityCounts: QualityCountsSchema,
  providerFailureSubjectCount: NonNegativeIntegerSchema,
  componentFailureCount: NonNegativeIntegerSchema,
  listingWatchBindingCount: NonNegativeIntegerSchema,
  listingCheckpointRequiredCount: z.literal(2),
  listingCheckpointHealthyCount: NonNegativeIntegerSchema,
  listingCheckpointBindingIds: z.array(NonEmptyStringSchema).max(2),
  listingCheckpointBindingHashes: z.array(DigestSchema).max(2),
  listingCheckpointGate: z.enum(["PASS", "BLOCKED"]),
  facts: z.array(M1MultiAssetBaseFactSchema),
  status: z.enum([
    "PASS_ALL_ROUTE_ELIGIBLE_FACTS_FRESH_NO_AUTHORITY",
    "PARTIAL_OR_BLOCKED_NO_STALE_PROMOTION",
    "BLOCKED_NO_ROUTE_ELIGIBLE_SUBJECTS",
    "TEST_ONLY_NO_LIVE_FACT_EVIDENCE",
  ]),
  authorityBoundary: z.literal(
    "POINT_IN_TIME_FACT_ACCOUNTING_ONLY_NO_CANDIDATE_SIGNAL_STRATEGY_READY_OR_TRADING_AUTHORITY",
  ),
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1MultiAssetBaseFactSnapshotSchema =
  SnapshotCoreSchema.extend({
    snapshotId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((snapshot, context) => {
    if (
      (snapshot.evidenceClass === "LIVE_READ_ONLY" &&
        snapshot.networkEnvironment !== "TENCENT_ISOLATED_READ_ONLY") ||
      (snapshot.evidenceClass === "TEST_ONLY" &&
        snapshot.networkEnvironment !== "TEST_HARNESS") ||
      (snapshot.evidenceClass === "TEST_ONLY" &&
        snapshot.status !== "TEST_ONLY_NO_LIVE_FACT_EVIDENCE") ||
      (snapshot.evidenceClass === "LIVE_READ_ONLY" &&
        snapshot.status === "TEST_ONLY_NO_LIVE_FACT_EVIDENCE")
      ||
      (snapshot.evidenceClass === "TEST_ONLY" &&
        snapshot.identityEvidenceStatus !==
          "TEST_ONLY_NO_LIVE_IDENTITY_EVIDENCE")
      ||
      (snapshot.evidenceClass === "LIVE_READ_ONLY" &&
        snapshot.identityEvidenceStatus ===
          "TEST_ONLY_NO_LIVE_IDENTITY_EVIDENCE")
    ) {
      context.addIssue({
        code: "custom",
        message: "snapshot evidence class, environment or status disagree",
        path: ["evidenceClass"],
      });
    }
    if (
      snapshot.observedSubjectCount !== snapshot.facts.length ||
      snapshot.observedSubjectCount !==
        snapshot.exactIdentityCount +
          snapshot.partialIdentityCount +
          snapshot.unresolvedIdentityCount ||
      snapshot.observedSubjectCount !==
        snapshot.routeEligibleCount + snapshot.routeBlockedCount ||
      snapshot.attemptedCount > snapshot.scheduledCount ||
      snapshot.scheduledCount > snapshot.routeEligibleCount
    ) {
      context.addIssue({
        code: "custom",
        message: "base fact snapshot denominator does not reconcile",
        path: ["observedSubjectCount"],
      });
    }
    const qualityTotal = DATA_QUALITY_STATES.reduce(
      (total, status) => total + snapshot.qualityCounts[status],
      0,
    );
    const expectedListingGate =
      snapshot.listingCheckpointHealthyCount ===
        snapshot.listingCheckpointRequiredCount &&
      snapshot.listingWatchBindingCount ===
        snapshot.listingCheckpointRequiredCount;
    if (
      snapshot.listingCheckpointHealthyCount >
        snapshot.listingWatchBindingCount ||
      snapshot.listingCheckpointBindingIds.length !==
        snapshot.listingWatchBindingCount ||
      snapshot.listingCheckpointBindingHashes.length !==
        snapshot.listingWatchBindingCount ||
      snapshot.listingCheckpointGate !==
        (expectedListingGate ? "PASS" : "BLOCKED")
    ) {
      context.addIssue({
        code: "custom",
        message: "listing checkpoint accounting or Gate disagrees",
        path: ["listingCheckpointGate"],
      });
    }
    if (
      qualityTotal !== snapshot.observedSubjectCount ||
      snapshot.freshCount !== snapshot.qualityCounts.FRESH ||
      snapshot.collectedCount !==
        snapshot.qualityCounts.FRESH +
          snapshot.qualityCounts.PARTIAL +
          snapshot.qualityCounts.STALE
    ) {
      context.addIssue({
        code: "custom",
        message: "snapshot quality accounting does not reconcile",
        path: ["qualityCounts"],
      });
    }
    const factKeys = snapshot.facts.map((fact) =>
      `${fact.sourceId}:${fact.venueInstrumentId}:${fact.listingEpoch}`
    );
    if (new Set(factKeys).size !== factKeys.length) {
      context.addIssue({
        code: "custom",
        message: "base fact snapshot cannot duplicate an identity subject",
        path: ["facts"],
      });
    }
    const sorted = [...snapshot.facts].sort(compareFacts);
    if (
      snapshot.facts.some(
        (fact, index) => fact.contentHash !== sorted[index]!.contentHash,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "base facts must use canonical identity ordering",
        path: ["facts"],
      });
    }
    const expectedHash = stableContentHash(snapshotCore(snapshot));
    if (snapshot.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "base fact snapshot content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      snapshot.snapshotId !==
        `multi-asset-base-fact-snapshot:${snapshot.contentHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "base fact snapshot id mismatch",
        path: ["snapshotId"],
      });
    }
  });

export type M1MultiAssetBaseFactSnapshot = z.infer<
  typeof M1MultiAssetBaseFactSnapshotSchema
>;

function snapshotCore(
  value: z.input<typeof SnapshotCoreSchema> & {
    readonly snapshotId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof SnapshotCoreSchema> {
  return SnapshotCoreSchema.parse({
    schemaVersion: value.schemaVersion,
    scopeEpoch: value.scopeEpoch,
    releaseId: value.releaseId,
    generatedAt: value.generatedAt,
    sourceCutoff: value.sourceCutoff,
    normalizedAt: value.normalizedAt,
    upstreamBindingId: value.upstreamBindingId,
    upstreamBindingHash: value.upstreamBindingHash,
    evidenceClass: value.evidenceClass,
    networkEnvironment: value.networkEnvironment,
    identitySnapshotId: value.identitySnapshotId,
    identitySnapshotHash: value.identitySnapshotHash,
    catalogCaptureBindingId: value.catalogCaptureBindingId,
    catalogCaptureBindingHash: value.catalogCaptureBindingHash,
    identityEvidenceStatus: value.identityEvidenceStatus,
    registryDigest: value.registryDigest,
    sourceProfileDigest: value.sourceProfileDigest,
    venueBatchIds: value.venueBatchIds,
    venueBatchHashes: value.venueBatchHashes,
    observedSubjectCount: value.observedSubjectCount,
    exactIdentityCount: value.exactIdentityCount,
    partialIdentityCount: value.partialIdentityCount,
    unresolvedIdentityCount: value.unresolvedIdentityCount,
    routeEligibleCount: value.routeEligibleCount,
    routeBlockedCount: value.routeBlockedCount,
    scheduledCount: value.scheduledCount,
    attemptedCount: value.attemptedCount,
    collectedCount: value.collectedCount,
    freshCount: value.freshCount,
    qualityCounts: value.qualityCounts,
    providerFailureSubjectCount: value.providerFailureSubjectCount,
    componentFailureCount: value.componentFailureCount,
    listingWatchBindingCount: value.listingWatchBindingCount,
    listingCheckpointRequiredCount:
      value.listingCheckpointRequiredCount,
    listingCheckpointHealthyCount:
      value.listingCheckpointHealthyCount,
    listingCheckpointBindingIds: value.listingCheckpointBindingIds,
    listingCheckpointBindingHashes:
      value.listingCheckpointBindingHashes,
    listingCheckpointGate: value.listingCheckpointGate,
    facts: value.facts,
    status: value.status,
    authorityBoundary: value.authorityBoundary,
    rawBodyRetained: value.rawBodyRetained,
    secretMaterialPresent: value.secretMaterialPresent,
    productionChanged: value.productionChanged,
  });
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

const MARKET_CAPABILITIES_BY_SOURCE = deepFreezeArtifact({
  BINANCE_FUTURES: [
    "TICKER",
    "MARK_PRICE",
    "INDEX_PRICE",
    "FUNDING_CURRENT",
  ],
  OKX_SWAP: [
    "TICKER",
    "MARK_PRICE",
  ],
  BYBIT_DERIVATIVES: [
    "TICKER",
    "MARK_PRICE",
    "INDEX_PRICE",
    "FUNDING_CURRENT",
    "OPEN_INTEREST_CURRENT",
  ],
  BITGET_FUTURES: [
    "TICKER",
    "MARK_PRICE",
    "INDEX_PRICE",
    "FUNDING_CURRENT",
    "OPEN_INTEREST_CURRENT",
  ],
} as const satisfies Record<
  M1WideMarketVenueSourceId,
  readonly (typeof M1_CAPABILITY_IDS)[number][]
>);

function compareFacts(
  left: M1MultiAssetBaseFact,
  right: M1MultiAssetBaseFact,
): number {
  return left.sourceId.localeCompare(right.sourceId) ||
    left.venueInstrumentId.localeCompare(right.venueInstrumentId) ||
    left.listingEpoch.localeCompare(right.listingEpoch);
}

function unavailableField(reasonCode: string): z.infer<typeof FieldFactSchema> {
  return {
    value: null,
    eventTime: null,
    receivedAt: null,
    ageMs: null,
    sourceRecordId: null,
    qualityStatus: "UNAVAILABLE",
    reasonCodes: [reasonCode],
  };
}

function unavailableFields(
  reasonCode: string,
): z.infer<typeof FactFieldsSchema> {
  return Object.fromEntries(
    M1_WIDE_MARKET_FIELD_IDS.map((field) => [
      field,
      unavailableField(`${reasonCode}_${field}`),
    ]),
  ) as z.infer<typeof FactFieldsSchema>;
}

function routeFor(
  identity: M1MultiAssetInstrumentObservation,
): Readonly<{
  factClass: z.infer<typeof BaseFactCoreSchema>["factClass"];
  routeDisposition: z.infer<typeof BaseFactCoreSchema>["routeDisposition"];
  reasonCodes: readonly string[];
}> {
  if (identity.coverageClass === "ASSET_LISTING_WATCH") {
    return {
      factClass: "T0_LISTING_LIFECYCLE_SNAPSHOT",
      routeDisposition: "ELIGIBLE_T0_LISTING_WATCH",
      reasonCodes: [],
    };
  }
  if (identity.identityStatus !== "EXACT") {
    return {
      factClass: "EXPLICIT_BLOCKED_IDENTITY_ACCOUNTING",
      routeDisposition: "BLOCKED_IDENTITY_OR_LIFECYCLE",
      reasonCodes: [
        `identity_status_${identity.identityStatus.toLowerCase()}_blocked`,
      ],
    };
  }
  if (
    identity.assetDomain === null ||
    identity.canonicalInstrumentId === null
  ) {
    return {
      factClass: "EXPLICIT_BLOCKED_IDENTITY_ACCOUNTING",
      routeDisposition: "BLOCKED_IDENTITY_OR_LIFECYCLE",
      reasonCodes: ["canonical_identity_or_asset_domain_missing"],
    };
  }
  if (!["TRADING_WARMUP", "ESTABLISHED"].includes(identity.lifecycleState)) {
    return {
      factClass: "EXPLICIT_BLOCKED_IDENTITY_ACCOUNTING",
      routeDisposition: "BLOCKED_IDENTITY_OR_LIFECYCLE",
      reasonCodes: [
        `lifecycle_${identity.lifecycleState.toLowerCase()}_not_t1_eligible`,
      ],
    };
  }
  return {
    factClass: "T1_WIDE_MARKET_SNAPSHOT",
    routeDisposition: "ELIGIBLE_T1_WIDE_MARKET",
    reasonCodes: [],
  };
}

function fieldCandidate(
  field: M1WideMarketFieldId,
  observations: readonly M1WideMarketComponentObservation[],
  receivedAtByComponent: ReadonlyMap<string, string>,
  sourceCutoffMs: number,
  maxAgeMs: number,
): z.infer<typeof FieldFactSchema> {
  const candidates = observations.filter(
    (observation) => observation.values[field] !== null,
  );
  if (candidates.length === 0) {
    return unavailableField(`wide_market_${field}_not_observed`);
  }
  if (candidates.length > 1) {
    return {
      ...unavailableField(`wide_market_${field}_multiple_sources_conflict`),
      qualityStatus: "INVALID",
    };
  }
  const candidate = candidates[0]!;
  const eventTime = candidate.fieldEventTimes[field]!;
  const sourceRecordId = candidate.fieldSourceRecordIds[field]!;
  const receivedAt = receivedAtByComponent.get(candidate.componentId);
  const eventMs = Date.parse(eventTime);
  const receivedMs = receivedAt === undefined
    ? Number.NaN
    : Date.parse(receivedAt);
  if (
    !Number.isFinite(eventMs) ||
    !Number.isFinite(receivedMs) ||
    eventMs > receivedMs ||
    eventMs > sourceCutoffMs
  ) {
    return {
      ...unavailableField(`wide_market_${field}_chronology_invalid`),
      qualityStatus: "INVALID",
    };
  }
  const ageMs = sourceCutoffMs - eventMs;
  if (ageMs > maxAgeMs) {
    return {
      value: candidate.values[field],
      eventTime,
      receivedAt: receivedAt!,
      ageMs,
      sourceRecordId,
      qualityStatus: "STALE",
      reasonCodes: [`wide_market_${field}_stale_at_cutoff`],
    };
  }
  return {
    value: candidate.values[field],
    eventTime,
    receivedAt: receivedAt!,
    ageMs,
    sourceRecordId,
    qualityStatus: "FRESH",
    reasonCodes: [],
  };
}

function marketFact(input: {
  identity: M1MultiAssetInstrumentObservation;
  identitySnapshot: M1MultiAssetIdentitySnapshot;
  upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  venueBatch: M1WideMarketVenueBatch;
  releaseId: string;
  generatedAt: string;
  sourceCutoff: string;
  normalizedAt: string;
  maxAgeMs: number;
}): M1MultiAssetBaseFact {
  const matching = input.venueBatch.components.flatMap((component) =>
    component.observations.filter(
      (observation) =>
        observation.venueInstrumentId === input.identity.venueInstrumentId,
    )
  );
  const duplicateComponent = new Set(
    matching.map((observation) => observation.componentId),
  ).size !== matching.length;
  const receivedAtByComponent = new Map(
    input.venueBatch.components.map((component) => [
      component.componentId,
      component.receivedAt,
    ]),
  );
  const sourceCutoffMs = Date.parse(input.sourceCutoff);
  const fields = Object.fromEntries(
    M1_WIDE_MARKET_FIELD_IDS.map((field) => [
      field,
      fieldCandidate(
        field,
        matching,
        receivedAtByComponent,
        sourceCutoffMs,
        input.maxAgeMs,
      ),
    ]),
  ) as z.infer<typeof FactFieldsSchema>;
  const profile = m1WideMarketProfileFor(input.identity.sourceId);
  const requiredStatuses = profile.requiredFreshFields.map(
    (field) => fields[field].qualityStatus,
  );
  const missingRequiredGroup = profile.requiredAnyFreshFieldGroups.some(
    (group) => !group.some((field) => fields[field].qualityStatus === "FRESH"),
  );
  const componentFailures = input.venueBatch.components.filter(
    (component) => component.status === "FAILED",
  );
  const providerFailureKinds = uniqueSorted(
    componentFailures.flatMap((component) =>
      component.providerFailureKind === null
        ? []
        : [component.providerFailureKind]
    ),
  ) as M1MultiAssetBaseFact["providerFailureKinds"];
  const requiredUnavailable = requiredStatuses.some((status) =>
    ["UNAVAILABLE", "RATE_LIMITED", "AUTH_ERROR", "TRANSPORT_ERROR"].includes(
      status,
    )
  ) || missingRequiredGroup;
  let qualityStatus: DataQualityState = "FRESH";
  if (duplicateComponent) {
    qualityStatus = "INVALID";
  } else if (componentFailures.length > 0) {
    qualityStatus = providerFailureKinds[0] ?? "UNAVAILABLE";
  } else if (requiredStatuses.includes("INVALID")) {
    qualityStatus = "INVALID";
  } else if (requiredStatuses.includes("STALE")) {
    qualityStatus = "STALE";
  } else if (
    requiredUnavailable ||
    input.venueBatch.status !== "COMPLETE" ||
    requiredStatuses.includes("PARTIAL")
  ) {
    qualityStatus = matching.length === 0 ? "UNAVAILABLE" : "PARTIAL";
  }
  const reasonCodes = qualityStatus === "FRESH"
    ? []
    : uniqueSorted([
      ...input.venueBatch.reasonCodes,
      ...(duplicateComponent
        ? ["duplicate_component_instrument_observation"]
        : []),
      ...(matching.length === 0
        ? ["venue_instrument_missing_from_wide_market_snapshot"]
        : []),
      ...(missingRequiredGroup
        ? ["required_volume_field_group_not_fresh"]
        : []),
      ...profile.requiredFreshFields.flatMap((field) =>
        fields[field].qualityStatus === "FRESH"
          ? []
          : fields[field].reasonCodes
      ),
      ...componentFailures.flatMap((component) => component.reasonCodes),
      ...(qualityStatus === "PARTIAL" &&
          input.venueBatch.status === "PARTIAL"
        ? ["Venue_batch_partial_no_false_fresh"]
        : []),
    ].map((reason) => reason.toLowerCase()));
  const sourceComponentResultIds = uniqueSorted(
    matching.map((observation) => {
      const component = input.venueBatch.components.find(
        (item) => item.componentId === observation.componentId,
      )!;
      return component.componentResultId;
    }),
  );
  const sourceComponentResultHashes = uniqueSorted(
    matching.map((observation) => {
      const component = input.venueBatch.components.find(
        (item) => item.componentId === observation.componentId,
      )!;
      return component.contentHash;
    }),
  );
  const sourceRecordIds = uniqueSorted(
    M1_WIDE_MARKET_FIELD_IDS.flatMap((field) =>
      fields[field].sourceRecordId === null
        ? []
        : [fields[field].sourceRecordId!]
    ),
  );
  return signFact({
    identity: input.identity,
    identitySnapshot: input.identitySnapshot,
    upstreamBinding: input.upstreamBinding,
    venueBatch: input.venueBatch,
    releaseId: input.releaseId,
    generatedAt: input.generatedAt,
    sourceCutoff: input.sourceCutoff,
    normalizedAt: input.normalizedAt,
    factClass: "T1_WIDE_MARKET_SNAPSHOT",
    routeDisposition: "ELIGIBLE_T1_WIDE_MARKET",
    scheduled: true,
    attempted: true,
    sourceComponentResultIds,
    sourceComponentResultHashes,
    listingEvidenceId: null,
    listingEvidenceHash: null,
    sourceCapabilityIds:
      MARKET_CAPABILITIES_BY_SOURCE[input.identity.sourceId],
    sourceRecordIds,
    fields,
    qualityStatus,
    providerFailureKinds,
    reasonCodes,
  });
}

function listingFact(input: {
  identity: M1MultiAssetInstrumentObservation;
  identitySnapshot: M1MultiAssetIdentitySnapshot;
  upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  venueBatch: M1WideMarketVenueBatch;
  binding: M1ListingWatchEvidenceBinding | null;
  releaseId: string;
  generatedAt: string;
  sourceCutoff: string;
  normalizedAt: string;
  maxListingCheckpointAgeMs: number;
}): M1MultiAssetBaseFact {
  const binding = input.binding;
  const cutoffMs = Date.parse(input.sourceCutoff);
  const evidenceAgeMs = binding === null
    ? null
    : cutoffMs - Date.parse(binding.sourceCutoff);
  const chronologyInvalid =
    evidenceAgeMs !== null && evidenceAgeMs < 0;
  const stale =
    evidenceAgeMs !== null &&
    evidenceAgeMs > input.maxListingCheckpointAgeMs;
  const qualityStatus: DataQualityState = binding === null
    ? "UNAVAILABLE"
    : chronologyInvalid
      ? "INVALID"
      : stale
        ? "STALE"
        : "FRESH";
  const reasonCodes = qualityStatus === "FRESH"
    ? []
    : [
      binding === null
        ? "listing_watch_checkpoint_binding_missing"
        : chronologyInvalid
          ? "listing_watch_checkpoint_after_source_cutoff"
          : "listing_watch_checkpoint_stale",
    ];
  return signFact({
    identity: input.identity,
    identitySnapshot: input.identitySnapshot,
    upstreamBinding: input.upstreamBinding,
    venueBatch: input.venueBatch,
    releaseId: input.releaseId,
    generatedAt: input.generatedAt,
    sourceCutoff: input.sourceCutoff,
    normalizedAt: input.normalizedAt,
    factClass: "T0_LISTING_LIFECYCLE_SNAPSHOT",
    routeDisposition: "ELIGIBLE_T0_LISTING_WATCH",
    scheduled: true,
    attempted: binding !== null,
    sourceComponentResultIds: [],
    sourceComponentResultHashes: [],
    listingEvidenceId: binding?.evidenceId ?? null,
    listingEvidenceHash: binding?.evidenceHash ?? null,
    sourceCapabilityIds: [
      "DERIVATIVE_INSTRUMENT_CATALOG",
      "LISTING_ANNOUNCEMENT",
    ],
    sourceRecordIds: uniqueSorted([
      input.identity.sourceRecordDigest,
      ...(binding === null ? [] : [binding.evidenceId]),
    ]),
    fields: unavailableFields("listing_lifecycle_fact_has_no_market_value"),
    qualityStatus,
    providerFailureKinds: [],
    reasonCodes,
  });
}

function blockedFact(input: {
  identity: M1MultiAssetInstrumentObservation;
  identitySnapshot: M1MultiAssetIdentitySnapshot;
  upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  venueBatch: M1WideMarketVenueBatch;
  releaseId: string;
  generatedAt: string;
  sourceCutoff: string;
  normalizedAt: string;
  reasonCodes: readonly string[];
}): M1MultiAssetBaseFact {
  return signFact({
    identity: input.identity,
    identitySnapshot: input.identitySnapshot,
    upstreamBinding: input.upstreamBinding,
    venueBatch: input.venueBatch,
    releaseId: input.releaseId,
    generatedAt: input.generatedAt,
    sourceCutoff: input.sourceCutoff,
    normalizedAt: input.normalizedAt,
    factClass: "EXPLICIT_BLOCKED_IDENTITY_ACCOUNTING",
    routeDisposition: "BLOCKED_IDENTITY_OR_LIFECYCLE",
    scheduled: false,
    attempted: false,
    sourceComponentResultIds: [],
    sourceComponentResultHashes: [],
    listingEvidenceId: null,
    listingEvidenceHash: null,
    sourceCapabilityIds: ["DERIVATIVE_INSTRUMENT_CATALOG"],
    sourceRecordIds: [input.identity.sourceRecordDigest],
    fields: unavailableFields("identity_or_lifecycle_route_blocked"),
    qualityStatus: "UNAVAILABLE",
    providerFailureKinds: [],
    reasonCodes: input.reasonCodes,
  });
}

function signFact(input: {
  identity: M1MultiAssetInstrumentObservation;
  identitySnapshot: M1MultiAssetIdentitySnapshot;
  upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  venueBatch: M1WideMarketVenueBatch;
  releaseId: string;
  generatedAt: string;
  sourceCutoff: string;
  normalizedAt: string;
  factClass: M1MultiAssetBaseFact["factClass"];
  routeDisposition: M1MultiAssetBaseFact["routeDisposition"];
  scheduled: boolean;
  attempted: boolean;
  sourceComponentResultIds: readonly string[];
  sourceComponentResultHashes: readonly string[];
  listingEvidenceId: string | null;
  listingEvidenceHash: string | null;
  sourceCapabilityIds: readonly (
    (typeof M1_CAPABILITY_IDS)[number]
  )[];
  sourceRecordIds: readonly string[];
  fields: z.infer<typeof FactFieldsSchema>;
  qualityStatus: DataQualityState;
  providerFailureKinds: readonly (
    M1MultiAssetBaseFact["providerFailureKinds"][number]
  )[];
  reasonCodes: readonly string[];
}): M1MultiAssetBaseFact {
  const fieldRows = M1_WIDE_MARKET_FIELD_IDS.map(
    (field) => input.fields[field],
  );
  const core = baseFactCore({
    schemaVersion: M1_MULTI_ASSET_BASE_FACT_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: input.releaseId,
    generatedAt: input.generatedAt,
    sourceCutoff: input.sourceCutoff,
    normalizedAt: input.normalizedAt,
    upstreamBindingId: input.upstreamBinding.upstreamBindingId,
    upstreamBindingHash: input.upstreamBinding.contentHash,
    evidenceClass: input.upstreamBinding.evidenceClass,
    networkEnvironment: input.upstreamBinding.networkEnvironment,
    identitySnapshotId: input.identitySnapshot.snapshotId,
    identitySnapshotHash: input.identitySnapshot.contentHash,
    catalogCaptureBindingId:
      input.identitySnapshot.catalogCaptureBindingId,
    catalogCaptureBindingHash:
      input.identitySnapshot.catalogCaptureBindingHash,
    identityEvidenceStatus: input.identitySnapshot.status,
    registryDigest: input.identitySnapshot.registryDigest,
    sourceProfileDigest: M1_WIDE_MARKET_SOURCE_PROFILE_DIGEST,
    factClass: input.factClass,
    sourceId: input.identity.sourceId,
    venueInstrumentId: input.identity.venueInstrumentId,
    canonicalInstrumentId: input.identity.canonicalInstrumentId,
    assetDomain: input.identity.assetDomain,
    coverageClass: input.identity.coverageClass,
    listingEpoch: input.identity.listingEpoch,
    identityEpoch: input.identity.identityEpoch,
    identityStatus: input.identity.identityStatus,
    lifecycleState: input.identity.lifecycleState,
    routeDisposition: input.routeDisposition,
    scheduled: input.scheduled,
    attempted: input.attempted,
    sourceBatchId: input.venueBatch.batchId,
    sourceBatchHash: input.venueBatch.contentHash,
    sourceComponentResultIds: uniqueSorted(
      input.sourceComponentResultIds,
    ),
    sourceComponentResultHashes: uniqueSorted(
      input.sourceComponentResultHashes,
    ),
    listingEvidenceId: input.listingEvidenceId,
    listingEvidenceHash: input.listingEvidenceHash,
    sourceCapabilityIds: uniqueSorted(input.sourceCapabilityIds) as (
      (typeof M1_CAPABILITY_IDS)[number]
    )[],
    sourceRecordIds: uniqueSorted(input.sourceRecordIds),
    fields: input.fields,
    observedFieldCount: fieldRows.filter((field) => field.value !== null)
      .length,
    freshFieldCount: fieldRows.filter(
      (field) => field.qualityStatus === "FRESH",
    ).length,
    qualityStatus: input.qualityStatus,
    providerFailureKinds: uniqueSorted(
      input.providerFailureKinds,
    ) as M1MultiAssetBaseFact["providerFailureKinds"],
    reasonCodes: uniqueSorted(input.reasonCodes),
    rawBodyRetained: false,
    secretMaterialPresent: false,
    factAuthorityGranted: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    automaticTradingAllowed: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1MultiAssetBaseFactSchema.parse({
    ...core,
    factId:
      `multi-asset-base-fact:${input.identity.sourceId}:${
        contentHash.slice(7, 31)
      }`,
    contentHash,
  }));
}

function exactVenueBatches(
  batches: readonly M1WideMarketVenueBatch[],
): readonly M1WideMarketVenueBatch[] {
  const byVenue = new Map(
    batches.map((batch) => [
      batch.sourceId,
      M1WideMarketVenueBatchSchema.parse(batch),
    ]),
  );
  if (
    byVenue.size !== M1_VENUE_SOURCE_IDS.length ||
    M1_VENUE_SOURCE_IDS.some((sourceId) => !byVenue.has(sourceId))
  ) {
    throw new Error(
      "one and only one wide-market batch is required per frozen Venue",
    );
  }
  return M1_VENUE_SOURCE_IDS.map((sourceId) => byVenue.get(sourceId)!);
}

function qualityCounts(
  facts: readonly M1MultiAssetBaseFact[],
): Record<DataQualityState, number> {
  const counts = Object.fromEntries(
    DATA_QUALITY_STATES.map((status) => [status, 0]),
  ) as Record<DataQualityState, number>;
  for (const fact of facts) {
    counts[fact.qualityStatus] += 1;
  }
  return counts;
}

export function buildM1MultiAssetBaseFactSnapshot(input: {
  releaseId: string;
  generatedAt: string;
  sourceCutoff: string;
  normalizedAt: string;
  upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  identitySnapshot: M1MultiAssetIdentitySnapshot;
  venueBatches: readonly M1WideMarketVenueBatch[];
  listingWatchBindings?: readonly M1ListingWatchEvidenceBinding[];
  maxAgeMs?: number;
  maxListingCheckpointAgeMs?: number;
}): M1MultiAssetBaseFactSnapshot {
  ReleaseIdSchema.parse(input.releaseId);
  const upstreamBinding = M1MultiAssetShadowUpstreamBindingSchema.parse(
    input.upstreamBinding,
  );
  const identitySnapshot = M1MultiAssetIdentitySnapshotSchema.parse(
    input.identitySnapshot,
  );
  const venueBatches = exactVenueBatches(input.venueBatches);
  const maxAgeMs = input.maxAgeMs ?? 15_000;
  const maxListingCheckpointAgeMs =
    input.maxListingCheckpointAgeMs ?? 15 * 60_000;
  if (
    !Number.isSafeInteger(maxAgeMs) ||
    maxAgeMs <= 0 ||
    !Number.isSafeInteger(maxListingCheckpointAgeMs) ||
    maxListingCheckpointAgeMs <= 0
  ) {
    throw new RangeError("base fact freshness limits must be positive integers");
  }
  const generatedMs = Date.parse(input.generatedAt);
  const cutoffMs = Date.parse(input.sourceCutoff);
  const normalizedMs = Date.parse(input.normalizedAt);
  if (
    !Number.isFinite(generatedMs) ||
    !Number.isFinite(cutoffMs) ||
    !Number.isFinite(normalizedMs) ||
    Date.parse(identitySnapshot.sourceCutoff) > cutoffMs ||
    cutoffMs > normalizedMs ||
    normalizedMs > generatedMs ||
    venueBatches.some(
      (batch) => Date.parse(batch.latestReceivedAt) > normalizedMs,
    ) ||
    input.releaseId !== identitySnapshot.releaseId ||
    input.releaseId !== upstreamBinding.releaseId ||
    identitySnapshot.registryDigest !== upstreamBinding.registryDigest ||
    identitySnapshot.upstreamBindingId !==
      upstreamBinding.upstreamBindingId ||
    identitySnapshot.upstreamBindingHash !== upstreamBinding.contentHash ||
    identitySnapshot.evidenceClass !== upstreamBinding.evidenceClass ||
    identitySnapshot.networkEnvironment !==
      upstreamBinding.networkEnvironment ||
    identitySnapshot.registryDigest !==
      M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest ||
    Date.parse(upstreamBinding.sourceCutoff) > cutoffMs ||
    Date.parse(upstreamBinding.generatedAt) > generatedMs
  ) {
    throw new Error(
      "base fact release binding or point-in-time chronology is invalid",
    );
  }
  const listingBindings = (input.listingWatchBindings ?? []).map((binding) =>
    M1ListingWatchEvidenceBindingSchema.parse(binding)
  );
  const listingBySource = new Map<
    M1WideMarketVenueSourceId,
    M1ListingWatchEvidenceBinding
  >(
    listingBindings.map((binding) => [binding.sourceId, binding]),
  );
  if (
    listingBySource.size !== listingBindings.length ||
    listingBindings.some(
      (binding) => binding.releaseId !== input.releaseId,
    ) ||
    listingBindings.some(
      (binding) => binding.evidenceClass !== upstreamBinding.evidenceClass,
    ) ||
    listingBindings.some(
      (binding) =>
        binding.networkEnvironment !==
          upstreamBinding.networkEnvironment ||
        binding.upstreamBindingId !==
          upstreamBinding.upstreamBindingId ||
        binding.upstreamBindingHash !== upstreamBinding.contentHash,
    )
  ) {
    throw new Error(
      "listing watch bindings must be unique and release-exact",
    );
  }
  const batchByVenue = new Map(
    venueBatches.map((batch) => [batch.sourceId, batch]),
  );
  const facts = identitySnapshot.observations.map((identity) => {
    const venueBatch = batchByVenue.get(identity.sourceId)!;
    const route = routeFor(identity);
    if (route.routeDisposition === "ELIGIBLE_T1_WIDE_MARKET") {
      return marketFact({
        identity,
        identitySnapshot,
        upstreamBinding,
        venueBatch,
        releaseId: input.releaseId,
        generatedAt: input.generatedAt,
        sourceCutoff: input.sourceCutoff,
        normalizedAt: input.normalizedAt,
        maxAgeMs,
      });
    }
    if (route.routeDisposition === "ELIGIBLE_T0_LISTING_WATCH") {
      return listingFact({
        identity,
        identitySnapshot,
        upstreamBinding,
        venueBatch,
        binding: listingBySource.get(identity.sourceId) ?? null,
        releaseId: input.releaseId,
        generatedAt: input.generatedAt,
        sourceCutoff: input.sourceCutoff,
        normalizedAt: input.normalizedAt,
        maxListingCheckpointAgeMs,
      });
    }
    return blockedFact({
      identity,
      identitySnapshot,
      upstreamBinding,
      venueBatch,
      releaseId: input.releaseId,
      generatedAt: input.generatedAt,
      sourceCutoff: input.sourceCutoff,
      normalizedAt: input.normalizedAt,
      reasonCodes: route.reasonCodes,
    });
  }).sort(compareFacts);
  const counts = qualityCounts(facts);
  const routeEligibleCount = facts.filter(
    (fact) =>
      fact.routeDisposition !== "BLOCKED_IDENTITY_OR_LIFECYCLE",
  ).length;
  const routeBlockedCount = facts.length - routeEligibleCount;
  const scheduledCount = facts.filter((fact) => fact.scheduled).length;
  const attemptedCount = facts.filter((fact) => fact.attempted).length;
  const collectedCount =
    counts.FRESH + counts.PARTIAL + counts.STALE;
  const freshCount = counts.FRESH;
  const healthyListingBindings = listingBindings.filter((binding) => {
    const ageMs = cutoffMs - Date.parse(binding.sourceCutoff);
    return ageMs >= 0 && ageMs <= maxListingCheckpointAgeMs;
  });
  const listingCheckpointGate =
    listingBindings.length === 2 &&
      healthyListingBindings.length === 2
      ? "PASS" as const
      : "BLOCKED" as const;
  const allEligibleFresh =
    routeEligibleCount > 0 &&
    identitySnapshot.status ===
      "PASS_FULL_SCOPE_IDENTITY_NO_AUTHORITY" &&
    listingCheckpointGate === "PASS" &&
    facts.every(
      (fact) =>
        fact.routeDisposition === "BLOCKED_IDENTITY_OR_LIFECYCLE" ||
        fact.qualityStatus === "FRESH",
    );
  const status = upstreamBinding.evidenceClass === "TEST_ONLY"
    ? "TEST_ONLY_NO_LIVE_FACT_EVIDENCE" as const
    : routeEligibleCount === 0
      ? "BLOCKED_NO_ROUTE_ELIGIBLE_SUBJECTS" as const
      : allEligibleFresh
        ? "PASS_ALL_ROUTE_ELIGIBLE_FACTS_FRESH_NO_AUTHORITY" as const
        : "PARTIAL_OR_BLOCKED_NO_STALE_PROMOTION" as const;
  const core = snapshotCore({
    schemaVersion: M1_MULTI_ASSET_BASE_FACT_SNAPSHOT_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: input.releaseId,
    generatedAt: input.generatedAt,
    sourceCutoff: input.sourceCutoff,
    normalizedAt: input.normalizedAt,
    upstreamBindingId: upstreamBinding.upstreamBindingId,
    upstreamBindingHash: upstreamBinding.contentHash,
    evidenceClass: upstreamBinding.evidenceClass,
    networkEnvironment: upstreamBinding.networkEnvironment,
    identitySnapshotId: identitySnapshot.snapshotId,
    identitySnapshotHash: identitySnapshot.contentHash,
    catalogCaptureBindingId: identitySnapshot.catalogCaptureBindingId,
    catalogCaptureBindingHash: identitySnapshot.catalogCaptureBindingHash,
    identityEvidenceStatus: identitySnapshot.status,
    registryDigest: identitySnapshot.registryDigest,
    sourceProfileDigest: M1_WIDE_MARKET_SOURCE_PROFILE_DIGEST,
    venueBatchIds: venueBatches.map((batch) => batch.batchId),
    venueBatchHashes: venueBatches.map((batch) => batch.contentHash),
    observedSubjectCount: facts.length,
    exactIdentityCount: identitySnapshot.exactIdentityCount,
    partialIdentityCount: identitySnapshot.partialIdentityCount,
    unresolvedIdentityCount: identitySnapshot.unresolvedIdentityCount,
    routeEligibleCount,
    routeBlockedCount,
    scheduledCount,
    attemptedCount,
    collectedCount,
    freshCount,
    qualityCounts: counts,
    providerFailureSubjectCount: facts.filter(
      (fact) => fact.providerFailureKinds.length > 0,
    ).length,
    componentFailureCount: venueBatches.reduce(
      (total, batch) => total + batch.failedComponentCount,
      0,
    ),
    listingWatchBindingCount: listingBindings.length,
    listingCheckpointRequiredCount: 2,
    listingCheckpointHealthyCount: healthyListingBindings.length,
    listingCheckpointBindingIds: uniqueSorted(
      listingBindings.map((binding) => binding.bindingId),
    ),
    listingCheckpointBindingHashes: uniqueSorted(
      listingBindings.map((binding) => binding.contentHash),
    ),
    listingCheckpointGate,
    facts,
    status,
    authorityBoundary:
      "POINT_IN_TIME_FACT_ACCOUNTING_ONLY_NO_CANDIDATE_SIGNAL_STRATEGY_READY_OR_TRADING_AUTHORITY",
    rawBodyRetained: false,
    secretMaterialPresent: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1MultiAssetBaseFactSnapshotSchema.parse({
    ...core,
    snapshotId:
      `multi-asset-base-fact-snapshot:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}

type ShadowDimensionStatus =
  | "FRESH"
  | "PARTIAL"
  | "BLOCKED"
  | "OBSERVED_ZERO";

export type M1BaseFactShadowAccounting = Readonly<{
  venues: readonly Readonly<{
    venue: M1WideMarketVenueSourceId;
    observedSubjectCount: number;
    exactIdentityCount: number;
    partialIdentityCount: number;
    unresolvedIdentityCount: number;
    routeEligibleCount: number;
    routeBlockedCount: number;
    scheduledCount: number;
    notScheduledCount: number;
    attemptedCount: number;
    notAttemptedCount: number;
    collectedCount: number;
    freshCount: number;
    partialCount: number;
    staleCount: number;
    unavailableCount: number;
    providerFailureCount: number;
    reasonCodes: readonly string[];
  }>[];
  assetDomains: readonly Readonly<{
    assetDomain:
      (typeof M1_MULTI_ASSET_SHADOW_ASSET_DOMAIN_BUCKETS)[number];
    observedSubjectCount: number;
    routeEligibleCount: number;
    collectedFactCount: number;
    freshFactCount: number;
    status: ShadowDimensionStatus;
    reasonCodes: readonly string[];
  }>[];
  lifecycleStates: readonly Readonly<{
    lifecycleState: (typeof M1_LISTING_LIFECYCLE_STATES)[number];
    observedSubjectCount: number;
    routeEligibleCount: number;
    collectedFactCount: number;
    freshFactCount: number;
    status: ShadowDimensionStatus;
    reasonCodes: readonly string[];
  }>[];
  listingCheckpoint: Readonly<{
    requiredCount: 2;
    bindingCount: number;
    healthyCount: number;
    unhealthyOrMissingCount: number;
    status: "PASS" | "BLOCKED";
    reasonCodes: readonly string[];
  }>;
}>;

function isCollected(fact: M1MultiAssetBaseFact): boolean {
  return ["FRESH", "PARTIAL", "STALE"].includes(fact.qualityStatus);
}

function dimensionStatus(input: {
  observed: number;
  eligible: number;
  collected: number;
  fresh: number;
}): ShadowDimensionStatus {
  return input.observed === 0
    ? "OBSERVED_ZERO"
    : input.eligible === 0
      ? "BLOCKED"
      : input.collected < input.eligible || input.fresh < input.collected
        ? "PARTIAL"
        : "FRESH";
}

function dimensionReasons(
  status: ShadowDimensionStatus,
  facts: readonly M1MultiAssetBaseFact[],
): readonly string[] {
  return status === "FRESH"
    ? []
    : uniqueSorted([
      `dimension_${status.toLowerCase()}`,
      ...facts.flatMap((fact) => fact.reasonCodes),
    ]);
}

export function buildM1BaseFactShadowAccounting(
  snapshotInput: M1MultiAssetBaseFactSnapshot,
): M1BaseFactShadowAccounting {
  const snapshot = M1MultiAssetBaseFactSnapshotSchema.parse(snapshotInput);
  const venues = M1_VENUE_SOURCE_IDS.map((venue) => {
    const facts = snapshot.facts.filter((fact) => fact.sourceId === venue);
    const eligible = facts.filter(
      (fact) =>
        fact.routeDisposition !== "BLOCKED_IDENTITY_OR_LIFECYCLE",
    );
    const scheduled = eligible.filter((fact) => fact.scheduled);
    const attempted = scheduled.filter((fact) => fact.attempted);
    const collected = attempted.filter(isCollected);
    const fresh = collected.filter(
      (fact) => fact.qualityStatus === "FRESH",
    );
    const partial = collected.filter(
      (fact) => fact.qualityStatus === "PARTIAL",
    );
    const stale = collected.filter(
      (fact) => fact.qualityStatus === "STALE",
    );
    const reasonCodes = uniqueSorted(
      facts.flatMap((fact) => fact.reasonCodes),
    );
    return {
      venue,
      observedSubjectCount: facts.length,
      exactIdentityCount: facts.filter(
        (fact) => fact.identityStatus === "EXACT",
      ).length,
      partialIdentityCount: facts.filter(
        (fact) => fact.identityStatus === "PARTIAL",
      ).length,
      unresolvedIdentityCount: facts.filter(
        (fact) => fact.identityStatus === "UNRESOLVED",
      ).length,
      routeEligibleCount: eligible.length,
      routeBlockedCount: facts.length - eligible.length,
      scheduledCount: scheduled.length,
      notScheduledCount: eligible.length - scheduled.length,
      attemptedCount: attempted.length,
      notAttemptedCount: scheduled.length - attempted.length,
      collectedCount: collected.length,
      freshCount: fresh.length,
      partialCount: partial.length,
      staleCount: stale.length,
      unavailableCount: attempted.length - collected.length,
      providerFailureCount: attempted.filter(
        (fact) => fact.providerFailureKinds.length > 0,
      ).length,
      reasonCodes:
        reasonCodes.length === 0 &&
          (
            facts.length !== fresh.length ||
            eligible.length !== facts.length
          )
          ? ["Venue_accounting_not_perfect".toLowerCase()]
          : reasonCodes,
    };
  });
  const dimensionCounts = (
    facts: readonly M1MultiAssetBaseFact[],
  ) => {
    const eligible = facts.filter(
      (fact) =>
        fact.routeDisposition !== "BLOCKED_IDENTITY_OR_LIFECYCLE",
    );
    const collected = eligible.filter(
      (fact) => fact.attempted && isCollected(fact),
    );
    const fresh = collected.filter(
      (fact) => fact.qualityStatus === "FRESH",
    );
    const status = dimensionStatus({
      observed: facts.length,
      eligible: eligible.length,
      collected: collected.length,
      fresh: fresh.length,
    });
    return {
      observedSubjectCount: facts.length,
      routeEligibleCount: eligible.length,
      collectedFactCount: collected.length,
      freshFactCount: fresh.length,
      status,
      reasonCodes: dimensionReasons(status, facts),
    };
  };
  const assetDomains = M1_MULTI_ASSET_SHADOW_ASSET_DOMAIN_BUCKETS.map(
    (assetDomain) => ({
      assetDomain,
      ...dimensionCounts(
        snapshot.facts.filter(
          (fact) => (fact.assetDomain ?? "UNRESOLVED") === assetDomain,
        ),
      ),
    }),
  );
  const lifecycleStates = M1_LISTING_LIFECYCLE_STATES.map(
    (lifecycleState) => ({
      lifecycleState,
      ...dimensionCounts(
        snapshot.facts.filter(
          (fact) => fact.lifecycleState === lifecycleState,
        ),
      ),
    }),
  );
  return deepFreezeArtifact({
    venues,
    assetDomains,
    lifecycleStates,
    listingCheckpoint: {
      requiredCount: 2,
      bindingCount: snapshot.listingWatchBindingCount,
      healthyCount: snapshot.listingCheckpointHealthyCount,
      unhealthyOrMissingCount:
        snapshot.listingCheckpointRequiredCount -
        snapshot.listingCheckpointHealthyCount,
      status: snapshot.listingCheckpointGate,
      reasonCodes: snapshot.listingCheckpointGate === "PASS"
        ? []
        : ["listing_checkpoint_missing_stale_or_gapped"],
    },
  });
}
