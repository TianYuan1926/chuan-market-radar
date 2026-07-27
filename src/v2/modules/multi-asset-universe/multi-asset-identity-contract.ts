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
  "v2-m1-multi-asset-identity.v2" as const;
export const M1_MULTI_ASSET_IDENTITY_SNAPSHOT_VERSION =
  "v2-m1-multi-asset-identity-snapshot.v3" as const;
export const M1_MULTI_ASSET_CATALOG_VENUE_CAPTURE_VERSION =
  "v2-m1-multi-asset-catalog-venue-capture.v1" as const;
export const M1_MULTI_ASSET_CATALOG_CAPTURE_BINDING_VERSION =
  "v2-m1-multi-asset-catalog-capture-binding.v1" as const;

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
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const ProviderTransportSymbolSchema = z.string().regex(
  /^[A-Z0-9][A-Z0-9._-]{1,80}$/u,
);
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
  providerTransportSymbol: ProviderTransportSymbolSchema.nullable(),
  providerReferenceInstrumentId: ProviderTransportSymbolSchema.nullable(),
  providerInstrumentFamily: ProviderTransportSymbolSchema.nullable(),
  providerRoutingAuthority: z.enum([
    "VENUE_INSTRUMENT_ID_EXACT",
    "PROVIDER_CATALOG_EXPLICIT",
    "PROVIDER_CATALOG_INCOMPLETE",
  ]),
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
  const okxRoutingComplete =
    observation.providerTransportSymbol !== null &&
    observation.providerReferenceInstrumentId !== null &&
    observation.providerInstrumentFamily !== null;
  if (
    (
      observation.providerTransportSymbol !== null &&
      observation.providerTransportSymbol !== observation.venueInstrumentId
    ) ||
    (
      observation.sourceId === "OKX_SWAP" &&
      (
        observation.providerRoutingAuthority !==
          (okxRoutingComplete
            ? "PROVIDER_CATALOG_EXPLICIT"
            : "PROVIDER_CATALOG_INCOMPLETE")
      )
    ) ||
    (
      observation.sourceId !== "OKX_SWAP" &&
      (
        observation.providerReferenceInstrumentId !== null ||
        observation.providerInstrumentFamily !== null ||
        observation.providerRoutingAuthority !== (
          observation.providerTransportSymbol === null
            ? "PROVIDER_CATALOG_INCOMPLETE"
            : "VENUE_INSTRUMENT_ID_EXACT"
        )
      )
    )
  ) {
    context.addIssue({
      code: "custom",
      message:
        "provider routing metadata must remain explicit and Venue-consistent",
      path: ["providerRoutingAuthority"],
    });
  }
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

export const M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE =
  deepFreezeArtifact({
    schemaVersion: "v2-m1-multi-asset-catalog-capture-profile.v2",
    sources: {
      BINANCE_FUTURES: {
        profileId: "m1-catalog:binance-futures:exchange-info",
        initialRequestUrlHash:
          "sha256:af0f4714e563a417dac518e6e53cafb236af94d34a7f29070c9d1c1688423385",
        maxPages: 1,
        timeoutMs: 8_000,
        maxResponseBytes: 8 * 1024 * 1024,
      },
      OKX_SWAP: {
        profileId: "m1-catalog:okx-swap:public-instruments",
        initialRequestUrlHash:
          "sha256:a31096435760575a06afa17896cb7c08bb24fd0a485377acb846cafe74c04c88",
        maxPages: 1,
        timeoutMs: 8_000,
        maxResponseBytes: 8 * 1024 * 1024,
      },
      BYBIT_DERIVATIVES: {
        profileId: "m1-catalog:bybit-derivatives:linear-instruments",
        initialRequestUrlHash:
          "sha256:069e9f6298fc62517de5977faa8049d0230679941ac4af15060b86fe859dd190",
        maxPages: 32,
        timeoutMs: 8_000,
        maxResponseBytes: 8 * 1024 * 1024,
      },
      BITGET_FUTURES: {
        profileId: "m1-catalog:bitget-futures:usdt-contracts",
        initialRequestUrlHash:
          "sha256:86d233481e54a4324a7e27a2e87053048c1b5d8f4acde398fc10edaa6475e83b",
        maxPages: 1,
        timeoutMs: 8_000,
        maxResponseBytes: 8 * 1024 * 1024,
      },
    },
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
  } as const);

export const M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE_DIGEST =
  stableContentHash(M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE);

const CatalogRequestSuccessSchema = z.strictObject({
  outcome: z.literal("SUCCESS"),
  pageIndex: z.number().int().positive().max(32),
  requestUrlHash: DigestSchema,
  receivedAt: IsoDateTimeSchema,
  httpStatus: z.number().int().min(200).max(299),
  responseBytes: NonNegativeIntegerSchema,
  responseHash: DigestSchema,
  recordCount: NonNegativeIntegerSchema,
  nextPageAvailable: z.boolean(),
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
});

const CatalogRequestFailureSchema = z.strictObject({
  outcome: z.literal("FAILED"),
  pageIndex: z.number().int().positive().max(32),
  requestUrlHash: DigestSchema,
  receivedAt: IsoDateTimeSchema,
  httpStatus: z.number().int().min(100).max(599).nullable(),
  providerFailureKind: z.enum([
    "RATE_LIMITED",
    "AUTH_ERROR",
    "TRANSPORT_ERROR",
    "INVALID",
    "UNAVAILABLE",
  ]),
  reasonCode: NonEmptyStringSchema,
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
});

export const M1MultiAssetCatalogRequestOutcomeSchema =
  z.discriminatedUnion("outcome", [
    CatalogRequestSuccessSchema,
    CatalogRequestFailureSchema,
  ]);

export type M1MultiAssetCatalogRequestOutcome = z.infer<
  typeof M1MultiAssetCatalogRequestOutcomeSchema
>;

const CanonicalReasonCodesSchema = ReasonCodesSchema.superRefine(
  (values, context) => {
    if (
      new Set(values).size !== values.length ||
      values.some(
        (value, index) =>
          index > 0 && values[index - 1]!.localeCompare(value) >= 0,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "reason codes must be unique and canonically ordered",
      });
    }
  },
);

const CatalogVenueCaptureCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_MULTI_ASSET_CATALOG_VENUE_CAPTURE_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  registryDigest: DigestSchema,
  upstreamBindingId: NonEmptyStringSchema,
  upstreamBindingHash: DigestSchema,
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  networkEnvironment: z.enum([
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  sourceId: VenueSchema,
  profileId: NonEmptyStringSchema,
  profileDigest: DigestSchema,
  latestReceivedAt: IsoDateTimeSchema,
  requestAttemptCount: NonNegativeIntegerSchema,
  successfulResponseCount: NonNegativeIntegerSchema,
  responseBytes: NonNegativeIntegerSchema,
  rawRecordCount: NonNegativeIntegerSchema,
  observationCount: NonNegativeIntegerSchema,
  exactIdentityCount: NonNegativeIntegerSchema,
  partialIdentityCount: NonNegativeIntegerSchema,
  unresolvedIdentityCount: NonNegativeIntegerSchema,
  observationSetHash: DigestSchema,
  normalizationStatus: z.enum(["PASS", "PARTIAL", "FAIL"]),
  captureStatus: z.enum(["COMPLETE", "FAILED"]),
  requestOutcomes: z.array(M1MultiAssetCatalogRequestOutcomeSchema)
    .min(1)
    .max(32),
  reasonCodes: CanonicalReasonCodesSchema,
  authorityBoundary: z.literal(
    "CATALOG_CAPTURE_AND_NORMALIZATION_ONLY_NO_ELIGIBLE_FACT_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY",
  ),
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1MultiAssetCatalogVenueCaptureSchema =
  CatalogVenueCaptureCoreSchema.extend({
    captureId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((capture, context) => {
    const profile =
      M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE.sources[capture.sourceId];
    if (
      capture.profileId !== profile.profileId ||
      capture.profileDigest !==
        M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE_DIGEST
    ) {
      context.addIssue({
        code: "custom",
        message: "catalog capture profile identity drifted",
        path: ["profileId"],
      });
    }
    if (
      (capture.evidenceClass === "LIVE_READ_ONLY" &&
        capture.networkEnvironment !== "TENCENT_ISOLATED_READ_ONLY") ||
      (capture.evidenceClass === "TEST_ONLY" &&
        capture.networkEnvironment !== "TEST_HARNESS")
    ) {
      context.addIssue({
        code: "custom",
        message: "catalog capture evidence class and environment disagree",
        path: ["networkEnvironment"],
      });
    }
    if (
      capture.requestOutcomes.some(
        (outcome, index) => outcome.pageIndex !== index + 1,
      ) ||
      capture.requestOutcomes.length > profile.maxPages ||
      capture.requestOutcomes[0]?.requestUrlHash !==
        profile.initialRequestUrlHash
    ) {
      context.addIssue({
        code: "custom",
        message:
          "catalog request pages must remain source-bound, contiguous and bounded",
        path: ["requestOutcomes"],
      });
    }
    const successes = capture.requestOutcomes.filter(
      (outcome) => outcome.outcome === "SUCCESS",
    );
    const expectedComplete =
      successes.length === capture.requestOutcomes.length &&
      successes.at(-1)?.nextPageAvailable === false &&
      capture.normalizationStatus !== "FAIL" &&
      capture.rawRecordCount > 0 &&
      capture.observationCount === capture.rawRecordCount;
    if (
      capture.requestAttemptCount !== capture.requestOutcomes.length ||
      capture.successfulResponseCount !== successes.length ||
      capture.responseBytes !== successes.reduce(
        (total, outcome) => total + outcome.responseBytes,
        0,
      ) ||
      capture.rawRecordCount !== successes.reduce(
        (total, outcome) => total + outcome.recordCount,
        0,
      ) ||
      capture.observationCount !==
        capture.exactIdentityCount +
          capture.partialIdentityCount +
          capture.unresolvedIdentityCount ||
      capture.captureStatus !== (expectedComplete ? "COMPLETE" : "FAILED")
    ) {
      context.addIssue({
        code: "custom",
        message: "catalog capture request or identity accounting disagrees",
      });
    }
    if (
      Date.parse(capture.latestReceivedAt) !== Math.max(
        ...capture.requestOutcomes.map(
          (outcome) => Date.parse(outcome.receivedAt),
        ),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "catalog latest receipt does not match request outcomes",
        path: ["latestReceivedAt"],
      });
    }
    if (capture.captureStatus === "FAILED" && capture.reasonCodes.length === 0) {
      context.addIssue({
        code: "custom",
        message: "failed catalog capture requires an explicit reason",
        path: ["reasonCodes"],
      });
    }
    const expectedHash = stableContentHash(catalogVenueCaptureCore(capture));
    if (
      capture.contentHash !== expectedHash ||
      capture.captureId !==
        `multi-asset-catalog:${capture.sourceId}:${
          expectedHash.slice(7, 31)
        }`
    ) {
      context.addIssue({
        code: "custom",
        message: "catalog capture identity or content hash mismatch",
        path: ["contentHash"],
      });
    }
  });

export type M1MultiAssetCatalogVenueCapture = z.infer<
  typeof M1MultiAssetCatalogVenueCaptureSchema
>;

function catalogVenueCaptureCore(
  value: z.input<typeof CatalogVenueCaptureCoreSchema> & {
    readonly captureId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof CatalogVenueCaptureCoreSchema> {
  return CatalogVenueCaptureCoreSchema.parse({
    schemaVersion: value.schemaVersion,
    scopeEpoch: value.scopeEpoch,
    releaseId: value.releaseId,
    registryDigest: value.registryDigest,
    upstreamBindingId: value.upstreamBindingId,
    upstreamBindingHash: value.upstreamBindingHash,
    evidenceClass: value.evidenceClass,
    networkEnvironment: value.networkEnvironment,
    sourceId: value.sourceId,
    profileId: value.profileId,
    profileDigest: value.profileDigest,
    latestReceivedAt: value.latestReceivedAt,
    requestAttemptCount: value.requestAttemptCount,
    successfulResponseCount: value.successfulResponseCount,
    responseBytes: value.responseBytes,
    rawRecordCount: value.rawRecordCount,
    observationCount: value.observationCount,
    exactIdentityCount: value.exactIdentityCount,
    partialIdentityCount: value.partialIdentityCount,
    unresolvedIdentityCount: value.unresolvedIdentityCount,
    observationSetHash: value.observationSetHash,
    normalizationStatus: value.normalizationStatus,
    captureStatus: value.captureStatus,
    requestOutcomes: value.requestOutcomes,
    reasonCodes: value.reasonCodes,
    authorityBoundary: value.authorityBoundary,
    rawBodyRetained: value.rawBodyRetained,
    secretMaterialPresent: value.secretMaterialPresent,
    productionChanged: value.productionChanged,
  });
}

function canonicalObservationSet(
  observations: readonly M1MultiAssetInstrumentObservation[],
): readonly M1MultiAssetInstrumentObservation[] {
  return [...observations].sort(
    (left, right) =>
      left.sourceId.localeCompare(right.sourceId) ||
      left.venueInstrumentId.localeCompare(right.venueInstrumentId) ||
      left.listingEpoch.localeCompare(right.listingEpoch),
  );
}

export function buildM1MultiAssetCatalogVenueCapture(input: {
  releaseId: string;
  registryDigest: string;
  upstreamBindingId: string;
  upstreamBindingHash: string;
  evidenceClass: "LIVE_READ_ONLY" | "TEST_ONLY";
  networkEnvironment: "TENCENT_ISOLATED_READ_ONLY" | "TEST_HARNESS";
  sourceId: (typeof M1_VENUE_SOURCE_IDS)[number];
  requestOutcomes: readonly M1MultiAssetCatalogRequestOutcome[];
  rawRecordCount: number;
  observations: readonly M1MultiAssetInstrumentObservation[];
  normalizationStatus: "PASS" | "PARTIAL" | "FAIL";
  reasonCodes?: readonly string[];
}): M1MultiAssetCatalogVenueCapture {
  const profile =
    M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE.sources[input.sourceId];
  const outcomes = input.requestOutcomes.map((outcome) =>
    M1MultiAssetCatalogRequestOutcomeSchema.parse(outcome)
  );
  const observations = canonicalObservationSet(
    input.observations.map((observation) =>
      M1MultiAssetInstrumentObservationSchema.parse(observation)
    ),
  );
  if (
    observations.some(
      (observation) => observation.sourceId !== input.sourceId,
    )
  ) {
    throw new Error("catalog capture observations must belong to one Venue");
  }
  const successes = outcomes.filter(
    (outcome) => outcome.outcome === "SUCCESS",
  );
  const complete =
    successes.length === outcomes.length &&
    successes.at(-1)?.nextPageAvailable === false &&
    input.normalizationStatus !== "FAIL" &&
    input.rawRecordCount > 0 &&
    observations.length === input.rawRecordCount;
  const reasons = [...new Set([
    ...(input.reasonCodes ?? []),
    ...outcomes.flatMap((outcome) =>
      outcome.outcome === "FAILED" ? [outcome.reasonCode] : []
    ),
    ...(complete ? [] : ["catalog_capture_incomplete"]),
  ])].sort();
  const core = catalogVenueCaptureCore({
    schemaVersion: M1_MULTI_ASSET_CATALOG_VENUE_CAPTURE_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: input.releaseId,
    registryDigest: input.registryDigest,
    upstreamBindingId: input.upstreamBindingId,
    upstreamBindingHash: input.upstreamBindingHash,
    evidenceClass: input.evidenceClass,
    networkEnvironment: input.networkEnvironment,
    sourceId: input.sourceId,
    profileId: profile.profileId,
    profileDigest: M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE_DIGEST,
    latestReceivedAt: new Date(
      Math.max(...outcomes.map((outcome) => Date.parse(outcome.receivedAt))),
    ).toISOString(),
    requestAttemptCount: outcomes.length,
    successfulResponseCount: successes.length,
    responseBytes: successes.reduce(
      (total, outcome) => total + outcome.responseBytes,
      0,
    ),
    rawRecordCount: input.rawRecordCount,
    observationCount: observations.length,
    exactIdentityCount: observations.filter(
      (observation) => observation.identityStatus === "EXACT",
    ).length,
    partialIdentityCount: observations.filter(
      (observation) => observation.identityStatus === "PARTIAL",
    ).length,
    unresolvedIdentityCount: observations.filter(
      (observation) => observation.identityStatus === "UNRESOLVED",
    ).length,
    observationSetHash: stableContentHash(observations),
    normalizationStatus: input.normalizationStatus,
    captureStatus: complete ? "COMPLETE" : "FAILED",
    requestOutcomes: outcomes,
    reasonCodes: reasons,
    authorityBoundary:
      "CATALOG_CAPTURE_AND_NORMALIZATION_ONLY_NO_ELIGIBLE_FACT_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY",
    rawBodyRetained: false,
    secretMaterialPresent: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1MultiAssetCatalogVenueCaptureSchema.parse({
    ...core,
    captureId:
      `multi-asset-catalog:${input.sourceId}:${
        contentHash.slice(7, 31)
      }`,
    contentHash,
  }));
}

const CatalogCaptureBindingCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_MULTI_ASSET_CATALOG_CAPTURE_BINDING_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  registryDigest: DigestSchema,
  upstreamBindingId: NonEmptyStringSchema,
  upstreamBindingHash: DigestSchema,
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  networkEnvironment: z.enum([
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  profileDigest: DigestSchema,
  venueDenominator: z.tuple([
    z.literal("BINANCE_FUTURES"),
    z.literal("OKX_SWAP"),
    z.literal("BYBIT_DERIVATIVES"),
    z.literal("BITGET_FUTURES"),
  ]),
  venueCaptures: z.array(M1MultiAssetCatalogVenueCaptureSchema).length(4),
  observedCount: NonNegativeIntegerSchema,
  exactIdentityCount: NonNegativeIntegerSchema,
  partialIdentityCount: NonNegativeIntegerSchema,
  unresolvedIdentityCount: NonNegativeIntegerSchema,
  status: z.enum([
    "PASS_FULL_SCOPE_CATALOG_CAPTURE_NO_AUTHORITY",
    "BLOCKED_INCOMPLETE_CATALOG_CAPTURE",
    "TEST_ONLY_NO_LIVE_CATALOG_EVIDENCE",
  ]),
  reasonCodes: CanonicalReasonCodesSchema,
  authorityBoundary: z.literal(
    "CATALOG_EVIDENCE_BINDING_ONLY_NO_ELIGIBLE_FACT_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY",
  ),
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1MultiAssetCatalogCaptureBindingSchema =
  CatalogCaptureBindingCoreSchema.extend({
    captureBindingId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((binding, context) => {
    if (
      binding.venueCaptures.some(
        (capture, index) =>
          capture.sourceId !== M1_VENUE_SOURCE_IDS[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "catalog captures must remain complete and ordered",
        path: ["venueCaptures"],
      });
    }
    const allComplete = binding.venueCaptures.every(
      (capture) => capture.captureStatus === "COMPLETE",
    );
    const expectedStatus = binding.evidenceClass === "TEST_ONLY"
      ? "TEST_ONLY_NO_LIVE_CATALOG_EVIDENCE"
      : allComplete
        ? "PASS_FULL_SCOPE_CATALOG_CAPTURE_NO_AUTHORITY"
        : "BLOCKED_INCOMPLETE_CATALOG_CAPTURE";
    if (
      binding.status !== expectedStatus ||
      binding.profileDigest !==
        M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE_DIGEST ||
      binding.venueCaptures.some(
        (capture) =>
          capture.releaseId !== binding.releaseId ||
          capture.registryDigest !== binding.registryDigest ||
          capture.upstreamBindingId !== binding.upstreamBindingId ||
          capture.upstreamBindingHash !== binding.upstreamBindingHash ||
          capture.evidenceClass !== binding.evidenceClass ||
          capture.networkEnvironment !== binding.networkEnvironment,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "catalog capture binding identity or status disagrees",
      });
    }
    const sums = (field: "observationCount" | "exactIdentityCount" |
      "partialIdentityCount" | "unresolvedIdentityCount") =>
      binding.venueCaptures.reduce(
        (total, capture) => total + capture[field],
        0,
      );
    if (
      binding.observedCount !== sums("observationCount") ||
      binding.exactIdentityCount !== sums("exactIdentityCount") ||
      binding.partialIdentityCount !== sums("partialIdentityCount") ||
      binding.unresolvedIdentityCount !== sums("unresolvedIdentityCount") ||
      binding.observedCount !==
        binding.exactIdentityCount +
          binding.partialIdentityCount +
          binding.unresolvedIdentityCount ||
      Date.parse(binding.sourceCutoff) !== Math.max(
        ...binding.venueCaptures.map(
          (capture) => Date.parse(capture.latestReceivedAt),
        ),
      ) ||
      Date.parse(binding.generatedAt) < Date.parse(binding.sourceCutoff)
    ) {
      context.addIssue({
        code: "custom",
        message: "catalog binding denominator or chronology disagrees",
      });
    }
    const expectedHash = stableContentHash(catalogCaptureBindingCore(binding));
    if (
      binding.contentHash !== expectedHash ||
      binding.captureBindingId !==
        `multi-asset-catalog-binding:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "catalog binding identity or content hash mismatch",
        path: ["contentHash"],
      });
    }
  });

export type M1MultiAssetCatalogCaptureBinding = z.infer<
  typeof M1MultiAssetCatalogCaptureBindingSchema
>;

function catalogCaptureBindingCore(
  value: z.input<typeof CatalogCaptureBindingCoreSchema> & {
    readonly captureBindingId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof CatalogCaptureBindingCoreSchema> {
  return CatalogCaptureBindingCoreSchema.parse({
    schemaVersion: value.schemaVersion,
    scopeEpoch: value.scopeEpoch,
    releaseId: value.releaseId,
    generatedAt: value.generatedAt,
    sourceCutoff: value.sourceCutoff,
    registryDigest: value.registryDigest,
    upstreamBindingId: value.upstreamBindingId,
    upstreamBindingHash: value.upstreamBindingHash,
    evidenceClass: value.evidenceClass,
    networkEnvironment: value.networkEnvironment,
    profileDigest: value.profileDigest,
    venueDenominator: value.venueDenominator,
    venueCaptures: value.venueCaptures,
    observedCount: value.observedCount,
    exactIdentityCount: value.exactIdentityCount,
    partialIdentityCount: value.partialIdentityCount,
    unresolvedIdentityCount: value.unresolvedIdentityCount,
    status: value.status,
    reasonCodes: value.reasonCodes,
    authorityBoundary: value.authorityBoundary,
    rawBodyRetained: value.rawBodyRetained,
    secretMaterialPresent: value.secretMaterialPresent,
    productionChanged: value.productionChanged,
  });
}

export function buildM1MultiAssetCatalogCaptureBinding(input: {
  releaseId: string;
  generatedAt: string;
  registryDigest: string;
  upstreamBindingId: string;
  upstreamBindingHash: string;
  evidenceClass: "LIVE_READ_ONLY" | "TEST_ONLY";
  networkEnvironment: "TENCENT_ISOLATED_READ_ONLY" | "TEST_HARNESS";
  venueCaptures: readonly M1MultiAssetCatalogVenueCapture[];
}): M1MultiAssetCatalogCaptureBinding {
  const byVenue = new Map(
    input.venueCaptures.map((capture) => [
      capture.sourceId,
      M1MultiAssetCatalogVenueCaptureSchema.parse(capture),
    ]),
  );
  if (
    byVenue.size !== M1_VENUE_SOURCE_IDS.length ||
    M1_VENUE_SOURCE_IDS.some((sourceId) => !byVenue.has(sourceId))
  ) {
    throw new Error("catalog capture binding requires every Venue exactly once");
  }
  const captures = M1_VENUE_SOURCE_IDS.map(
    (sourceId) => byVenue.get(sourceId)!,
  );
  const sourceCutoff = new Date(Math.max(
    ...captures.map((capture) => Date.parse(capture.latestReceivedAt)),
  )).toISOString();
  const allComplete = captures.every(
    (capture) => capture.captureStatus === "COMPLETE",
  );
  const status = input.evidenceClass === "TEST_ONLY"
    ? "TEST_ONLY_NO_LIVE_CATALOG_EVIDENCE" as const
    : allComplete
      ? "PASS_FULL_SCOPE_CATALOG_CAPTURE_NO_AUTHORITY" as const
      : "BLOCKED_INCOMPLETE_CATALOG_CAPTURE" as const;
  const reasons = [...new Set([
    ...captures.flatMap((capture) => capture.reasonCodes),
    ...(allComplete ? [] : ["one_or_more_catalog_captures_incomplete"]),
    ...(input.evidenceClass === "TEST_ONLY"
      ? ["test_only_not_live_catalog_evidence"]
      : []),
  ])].sort();
  const core = catalogCaptureBindingCore({
    schemaVersion: M1_MULTI_ASSET_CATALOG_CAPTURE_BINDING_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: input.releaseId,
    generatedAt: input.generatedAt,
    sourceCutoff,
    registryDigest: input.registryDigest,
    upstreamBindingId: input.upstreamBindingId,
    upstreamBindingHash: input.upstreamBindingHash,
    evidenceClass: input.evidenceClass,
    networkEnvironment: input.networkEnvironment,
    profileDigest: M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE_DIGEST,
    venueDenominator: [...M1_VENUE_SOURCE_IDS],
    venueCaptures: captures,
    observedCount: captures.reduce(
      (total, capture) => total + capture.observationCount,
      0,
    ),
    exactIdentityCount: captures.reduce(
      (total, capture) => total + capture.exactIdentityCount,
      0,
    ),
    partialIdentityCount: captures.reduce(
      (total, capture) => total + capture.partialIdentityCount,
      0,
    ),
    unresolvedIdentityCount: captures.reduce(
      (total, capture) => total + capture.unresolvedIdentityCount,
      0,
    ),
    status,
    reasonCodes: reasons,
    authorityBoundary:
      "CATALOG_EVIDENCE_BINDING_ONLY_NO_ELIGIBLE_FACT_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY",
    rawBodyRetained: false,
    secretMaterialPresent: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1MultiAssetCatalogCaptureBindingSchema.parse({
    ...core,
    captureBindingId:
      `multi-asset-catalog-binding:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}

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
  releaseId: ReleaseIdSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  registryDigest: DigestSchema,
  upstreamBindingId: NonEmptyStringSchema,
  upstreamBindingHash: DigestSchema,
  catalogCaptureBindingId: NonEmptyStringSchema,
  catalogCaptureBindingHash: DigestSchema,
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  networkEnvironment: z.enum([
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  snapshotId: NonEmptyStringSchema,
  contentHash: DigestSchema,
  venueDenominator: z.literal(4),
  observedCount: NonNegativeIntegerSchema,
  exactIdentityCount: NonNegativeIntegerSchema,
  partialIdentityCount: NonNegativeIntegerSchema,
  unresolvedIdentityCount: NonNegativeIntegerSchema,
  countsByVenue: CountByVenueSchema,
  countsByAssetDomain: CountByAssetDomainSchema,
  observations: z.array(M1MultiAssetInstrumentObservationSchema),
  status: z.enum([
    "PASS_FULL_SCOPE_IDENTITY_NO_AUTHORITY",
    "BLOCKED_INCOMPLETE_CATALOG_IDENTITY",
    "TEST_ONLY_NO_LIVE_IDENTITY_EVIDENCE",
  ]),
  authorityBoundary: z.literal(
    "IDENTITY_AND_LISTING_GOVERNANCE_ONLY_NO_ELIGIBLE_FACT_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY",
  ),
  productionChanged: z.literal(false),
}).superRefine((snapshot, context) => {
  if (
    (snapshot.evidenceClass === "LIVE_READ_ONLY" &&
      snapshot.networkEnvironment !== "TENCENT_ISOLATED_READ_ONLY") ||
    (snapshot.evidenceClass === "TEST_ONLY" &&
      snapshot.networkEnvironment !== "TEST_HARNESS") ||
    (snapshot.evidenceClass === "TEST_ONLY" &&
      snapshot.status !== "TEST_ONLY_NO_LIVE_IDENTITY_EVIDENCE") ||
    (snapshot.evidenceClass === "LIVE_READ_ONLY" &&
      snapshot.status === "TEST_ONLY_NO_LIVE_IDENTITY_EVIDENCE")
  ) {
    context.addIssue({
      code: "custom",
      message: "identity evidence class, environment or status disagree",
      path: ["evidenceClass"],
    });
  }
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
  const partial = snapshot.observations.filter(
    (observation) => observation.identityStatus === "PARTIAL",
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
  if (snapshot.partialIdentityCount !== partial) {
    context.addIssue({
      code: "custom",
      message: "partialIdentityCount does not match observations",
      path: ["partialIdentityCount"],
    });
  }
  if (
    snapshot.observedCount !==
      snapshot.exactIdentityCount +
        snapshot.partialIdentityCount +
        snapshot.unresolvedIdentityCount
  ) {
    context.addIssue({
      code: "custom",
      message: "identity status counts must reconcile to observedCount",
      path: ["observedCount"],
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
    upstreamBindingId: snapshot.upstreamBindingId,
    upstreamBindingHash: snapshot.upstreamBindingHash,
    catalogCaptureBindingId: snapshot.catalogCaptureBindingId,
    catalogCaptureBindingHash: snapshot.catalogCaptureBindingHash,
    evidenceClass: snapshot.evidenceClass,
    networkEnvironment: snapshot.networkEnvironment,
    venueDenominator: snapshot.venueDenominator,
    observedCount: snapshot.observedCount,
    exactIdentityCount: snapshot.exactIdentityCount,
    partialIdentityCount: snapshot.partialIdentityCount,
    unresolvedIdentityCount: snapshot.unresolvedIdentityCount,
    countsByVenue: snapshot.countsByVenue,
    countsByAssetDomain: snapshot.countsByAssetDomain,
    observations: snapshot.observations,
    status: snapshot.status,
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
    | "providerTransportSymbol"
    | "providerReferenceInstrumentId"
    | "providerInstrumentFamily"
    | "providerRoutingAuthority"
    | "runtimeEligibility"
    | "candidateEmissionAllowed"
    | "strategyAuthority"
  > & Partial<
    Pick<
      M1MultiAssetInstrumentObservation,
      | "providerTransportSymbol"
      | "providerReferenceInstrumentId"
      | "providerInstrumentFamily"
      | "providerRoutingAuthority"
    >
  >,
): M1MultiAssetInstrumentObservation {
  const providerTransportSymbol =
    input.providerTransportSymbol === undefined
      ? input.venueInstrumentId
      : input.providerTransportSymbol;
  const providerReferenceInstrumentId =
    input.providerReferenceInstrumentId ?? null;
  const providerInstrumentFamily = input.providerInstrumentFamily ?? null;
  const providerRoutingAuthority = input.providerRoutingAuthority ??
    (
      input.sourceId === "OKX_SWAP"
        ? providerTransportSymbol !== null &&
            providerReferenceInstrumentId !== null &&
            providerInstrumentFamily !== null
          ? "PROVIDER_CATALOG_EXPLICIT"
          : "PROVIDER_CATALOG_INCOMPLETE"
        : providerTransportSymbol === null
          ? "PROVIDER_CATALOG_INCOMPLETE"
          : "VENUE_INSTRUMENT_ID_EXACT"
    );
  return deepFreezeArtifact(
    M1MultiAssetInstrumentObservationSchema.parse({
      ...input,
      schemaVersion: M1_MULTI_ASSET_IDENTITY_VERSION,
      scopeEpoch: M1_SCOPE_EPOCH,
      providerTransportSymbol,
      providerReferenceInstrumentId,
      providerInstrumentFamily,
      providerRoutingAuthority,
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
  catalogCaptureBinding: M1MultiAssetCatalogCaptureBinding;
  observations: readonly M1MultiAssetInstrumentObservation[];
  previous?: M1MultiAssetIdentitySnapshot | null;
}): M1MultiAssetIdentitySnapshot {
  const captureBinding = M1MultiAssetCatalogCaptureBindingSchema.parse(
    input.catalogCaptureBinding,
  );
  if (
    input.releaseId !== captureBinding.releaseId ||
    input.registryDigest !== captureBinding.registryDigest ||
    input.sourceCutoff !== captureBinding.sourceCutoff ||
    Date.parse(input.generatedAt) < Date.parse(captureBinding.generatedAt)
  ) {
    throw new Error(
      "identity snapshot must bind the exact catalog capture release and cutoff",
    );
  }
  for (const sourceId of M1_VENUE_SOURCE_IDS) {
    const capture = captureBinding.venueCaptures.find(
      (candidate) => candidate.sourceId === sourceId,
    )!;
    const sourceObservations = canonicalObservationSet(
      input.observations.filter(
        (observation) => observation.sourceId === sourceId,
      ),
    );
    if (
      capture.observationCount !== sourceObservations.length ||
      capture.observationSetHash !== stableContentHash(sourceObservations)
    ) {
      throw new Error(
        `identity observations do not match catalog capture for ${sourceId}`,
      );
    }
  }
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
    upstreamBindingId: captureBinding.upstreamBindingId,
    upstreamBindingHash: captureBinding.upstreamBindingHash,
    catalogCaptureBindingId: captureBinding.captureBindingId,
    catalogCaptureBindingHash: captureBinding.contentHash,
    evidenceClass: captureBinding.evidenceClass,
    networkEnvironment: captureBinding.networkEnvironment,
    venueDenominator: 4 as const,
    observedCount: observations.length,
    exactIdentityCount: observations.filter(
      (observation) => observation.identityStatus === "EXACT",
    ).length,
    partialIdentityCount: observations.filter(
      (observation) => observation.identityStatus === "PARTIAL",
    ).length,
    unresolvedIdentityCount: observations.filter(
      (observation) => observation.identityStatus === "UNRESOLVED",
    ).length,
    countsByVenue,
    countsByAssetDomain,
    observations,
    status: captureBinding.evidenceClass === "TEST_ONLY"
      ? "TEST_ONLY_NO_LIVE_IDENTITY_EVIDENCE" as const
      : captureBinding.status ===
          "PASS_FULL_SCOPE_CATALOG_CAPTURE_NO_AUTHORITY"
        ? "PASS_FULL_SCOPE_IDENTITY_NO_AUTHORITY" as const
        : "BLOCKED_INCOMPLETE_CATALOG_IDENTITY" as const,
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
