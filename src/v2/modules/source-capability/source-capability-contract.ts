import { z } from "zod";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";

export const M1_SOURCE_CAPABILITY_REGISTRY_VERSION =
  "v2-m1-source-capability-registry.v1" as const;
export const M1_SOURCE_CAPABILITY_ASSESSMENT_VERSION =
  "v2-m1-source-capability-assessment.v1" as const;
export const M1_SCOPE_EPOCH = "SCOPE_EPOCH_V2_MULTI_ASSET_4V" as const;

export const M1_SOURCE_IDS = [
  "BINANCE_FUTURES",
  "OKX_SWAP",
  "BYBIT_DERIVATIVES",
  "BITGET_FUTURES",
  "COINGLASS_V4",
] as const;

export const M1_VENUE_SOURCE_IDS = [
  "BINANCE_FUTURES",
  "OKX_SWAP",
  "BYBIT_DERIVATIVES",
  "BITGET_FUTURES",
] as const;

export const M1_CAPABILITY_IDS = [
  "SERVER_TIME",
  "DERIVATIVE_INSTRUMENT_CATALOG",
  "SPOT_INSTRUMENT_CATALOG",
  "LISTING_ANNOUNCEMENT",
  "INSTRUMENT_STATUS_STREAM",
  "TICKER",
  "MARK_PRICE",
  "INDEX_PRICE",
  "TRADE_KLINE",
  "MARK_PRICE_KLINE",
  "INDEX_PRICE_KLINE",
  "PUBLIC_TRADE",
  "ORDER_BOOK_SNAPSHOT",
  "ORDER_BOOK_DELTA",
  "OPEN_INTEREST_CURRENT",
  "OPEN_INTEREST_HISTORY",
  "FUNDING_CURRENT",
  "FUNDING_HISTORY",
  "LIQUIDATION_EVENT",
  "LONG_SHORT_RATIO",
  "TAKER_FLOW",
  "PRICE_LIMIT_RISK_RULE",
  "INSTRUMENT_FEE_SCHEDULE",
  "HISTORICAL_BULK_ARCHIVE",
  "EQUITY_SESSION_REFERENCE",
  "EQUITY_CORPORATE_ACTION",
  "FX_REFERENCE",
  "OPTIONS_MARKET_CONTEXT",
  "ETF_FLOW_CONTEXT",
  "EXCHANGE_BALANCE_CONTEXT",
  "SENTIMENT_INDEX_CONTEXT",
  "TOKEN_UNLOCK_EVENT",
  "MARKET_NEWS_EVENT",
] as const;

export const M1_ASSET_DOMAINS = [
  "CRYPTO_LINEAR_PERPETUAL",
  "EQUITY_SINGLE_NAME_PERPETUAL",
  "EQUITY_INDEX_ETF_PERPETUAL",
  "EQUITY_CFD",
  "OTHER_RWA_DERIVATIVE",
  "ASSET_LISTING_WATCH",
  "CROSS_MARKET_CONTEXT",
] as const;

export const M1_COLLECTION_TIERS = [
  "T0_CATALOG_EVENT",
  "T1_WIDE_MARKET",
  "T2_CANDIDATE_BURST",
  "T3_DEEP_VALIDATION",
] as const;

export const M1_FAILURE_SEMANTICS = [
  "AUTH_FAILURE_UNAVAILABLE",
  "EMPTY_RESPONSE_OBSERVED_EMPTY",
  "ENTITLEMENT_FAILURE_UNAVAILABLE",
  "HTTP_NON_2XX_UNAVAILABLE",
  "PAGINATION_INCOMPLETE_UNAVAILABLE",
  "RATE_LIMIT_BACKOFF_NO_STALE_PROMOTION",
  "SCHEMA_DRIFT_UNAVAILABLE",
  "SEQUENCE_GAP_RECONCILE_OR_UNAVAILABLE",
  "SOURCE_CLOCK_UNKNOWN_UNAVAILABLE",
  "TRANSPORT_FAILURE_UNAVAILABLE",
] as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const HttpsUrlSchema = z.string().url().superRefine((value, context) => {
  if (new URL(value).protocol !== "https:") {
    context.addIssue({
      code: "custom",
      message: "source capability evidence must use HTTPS",
    });
  }
});

const UniqueReasonCodesSchema = ReasonCodesSchema.superRefine(
  (values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "reason codes must be unique",
      });
    }
  },
);

const EvidenceReferenceSchema = z.strictObject({
  evidenceId: NonEmptyStringSchema,
  sourceId: z.enum(M1_SOURCE_IDS),
  evidenceType: z.enum([
    "OFFICIAL_API_DOCUMENTATION",
    "OFFICIAL_PRODUCT_DOCUMENTATION",
    "OFFICIAL_PLAN_DOCUMENTATION",
    "OFFICIAL_TERMS",
    "TECHNICAL_PROBE",
  ]),
  url: HttpsUrlSchema,
  reviewedAt: IsoDateTimeSchema,
  captureStatus: z.enum([
    "REFERENCE_ONLY_UNHASHED",
    "HASHED_CONTENT_CAPTURED",
  ]),
  contentDigest: DigestSchema.nullable(),
  supportsCapabilityIds: z.array(z.enum(M1_CAPABILITY_IDS)).min(1),
}).superRefine((evidence, context) => {
  if (
    (evidence.captureStatus === "HASHED_CONTENT_CAPTURED") !==
      (evidence.contentDigest !== null)
  ) {
    context.addIssue({
      code: "custom",
      message: "evidence capture status and digest disagree",
      path: ["contentDigest"],
    });
  }
  if (
    new Set(evidence.supportsCapabilityIds).size !==
      evidence.supportsCapabilityIds.length
  ) {
    context.addIssue({
      code: "custom",
      message: "evidence capability ids must be unique",
      path: ["supportsCapabilityIds"],
    });
  }
});

const SourceProfileSchema = z.strictObject({
  sourceId: z.enum(M1_SOURCE_IDS),
  sourceClass: z.enum(["VENUE", "AGGREGATOR"]),
  role: z.enum([
    "PRIMARY_POINT_IN_TIME_FACT_SOURCE",
    "CANDIDATE_CONFIRMATION_AND_CONTEXT_SOURCE",
  ]),
  accountPlan: z.enum([
    "PUBLIC_NO_ACCOUNT",
    "HOBBYIST_USER_CONFIRMED",
  ]),
  credentialClass: z.enum([
    "PUBLIC_NO_CREDENTIAL",
    "READ_ONLY_API_KEY",
  ]),
  rightsStatus: z.enum([
    "OFFICIAL_TERMS_REVIEW_REQUIRED",
    "PERSONAL_USE_PLAN_TERMS_REVIEW_REQUIRED",
  ]),
  jurisdictionStatus: z.literal("RUNTIME_AVAILABILITY_UNVERIFIED"),
  implementationBoundary: z.enum([
    "SCOPE_V1_PARTIAL_ONLY",
    "NOT_IMPLEMENTED_SCOPE_V2",
  ]),
  officialEvidenceIds: z.array(NonEmptyStringSchema).min(1),
  failureSemantics: z.array(z.enum(M1_FAILURE_SEMANTICS)).min(1),
  secretMaterialPresent: z.literal(false),
}).superRefine((source, context) => {
  if (new Set(source.officialEvidenceIds).size !== source.officialEvidenceIds.length) {
    context.addIssue({
      code: "custom",
      message: "source evidence ids must be unique",
      path: ["officialEvidenceIds"],
    });
  }
  if (new Set(source.failureSemantics).size !== source.failureSemantics.length) {
    context.addIssue({
      code: "custom",
      message: "source failure semantics must be unique",
      path: ["failureSemantics"],
    });
  }
  const isCoinGlass = source.sourceId === "COINGLASS_V4";
  if (
    isCoinGlass !==
      (source.sourceClass === "AGGREGATOR" &&
        source.role === "CANDIDATE_CONFIRMATION_AND_CONTEXT_SOURCE" &&
        source.accountPlan === "HOBBYIST_USER_CONFIRMED" &&
        source.credentialClass === "READ_ONLY_API_KEY")
  ) {
    context.addIssue({
      code: "custom",
      message: "CoinGlass and venue source profile boundaries disagree",
    });
  }
  if (
    !isCoinGlass &&
    (
      source.sourceClass !== "VENUE" ||
      source.role !== "PRIMARY_POINT_IN_TIME_FACT_SOURCE" ||
      source.accountPlan !== "PUBLIC_NO_ACCOUNT" ||
      source.credentialClass !== "PUBLIC_NO_CREDENTIAL"
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "venue source profile must remain public and primary",
    });
  }
});

const CapabilityDefinitionSchema = z.strictObject({
  capabilityId: z.enum(M1_CAPABILITY_IDS),
  label: NonEmptyStringSchema,
  factSemantics: NonEmptyStringSchema,
  targetTiers: z.array(z.enum(M1_COLLECTION_TIERS)).min(1),
  defaultAssetDomains: z.array(z.enum(M1_ASSET_DOMAINS)).min(1),
  persistenceClass: z.enum([
    "EVENT_LEDGER",
    "POINT_IN_TIME_FACT",
    "BOUNDED_BURST_FACT",
    "REFERENCE_SNAPSHOT",
    "RESEARCH_ARCHIVE",
  ]),
  valueClass: z.enum([
    "CORE_REQUIRED",
    "HIGH_VALUE",
    "CONDITIONAL_CONTEXT",
  ]),
  privateTradingOrAccountData: z.literal(false),
}).superRefine((capability, context) => {
  for (const [field, values] of [
    ["targetTiers", capability.targetTiers],
    ["defaultAssetDomains", capability.defaultAssetDomains],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: `capability ${field} must be unique`,
        path: [field],
      });
    }
  }
});

const RateLimitSchema = z.strictObject({
  status: z.enum(["DOCUMENTED", "UNVERIFIED", "NOT_APPLICABLE"]),
  rule: NonEmptyStringSchema.nullable(),
  evidenceId: NonEmptyStringSchema.nullable(),
}).superRefine((rateLimit, context) => {
  const documented = rateLimit.status === "DOCUMENTED";
  if (
    documented !==
      (rateLimit.rule !== null && rateLimit.evidenceId !== null)
  ) {
    context.addIssue({
      code: "custom",
      message: "documented rate limit requires a rule and evidence",
    });
  }
  if (
    rateLimit.status === "NOT_APPLICABLE" &&
    (rateLimit.rule !== null || rateLimit.evidenceId !== null)
  ) {
    context.addIssue({
      code: "custom",
      message: "not-applicable rate limit cannot carry details",
    });
  }
});

const CapabilityRowSchema = z.strictObject({
  sourceId: z.enum(M1_SOURCE_IDS),
  capabilityId: z.enum(M1_CAPABILITY_IDS),
  assetDomains: z.array(z.enum(M1_ASSET_DOMAINS)).min(1),
  endpoint: NonEmptyStringSchema.nullable(),
  channel: NonEmptyStringSchema.nullable(),
  sourceSemantics: NonEmptyStringSchema,
  authClass: z.enum([
    "PUBLIC_NO_CREDENTIAL",
    "READ_ONLY_API_KEY",
    "NOT_APPLICABLE",
  ]),
  documentationStatus: z.enum([
    "OFFICIAL_DOCUMENTED",
    "OFFICIAL_DOCUMENTED_PLAN_GATED",
    "NO_OFFICIAL_CAPABILITY_FOUND",
    "NOT_APPLICABLE",
  ]),
  entitlementStatus: z.enum([
    "PUBLIC_NO_KEY",
    "HOBBYIST_CONFIRMED",
    "HOBBYIST_UNAVAILABLE",
    "PLAN_ENTITLEMENT_UNVERIFIED",
    "NOT_APPLICABLE",
  ]),
  rateLimit: RateLimitSchema,
  pagination: z.strictObject({
    mode: z.enum([
      "NONE",
      "CURSOR",
      "PAGE_NUMBER",
      "TIME_WINDOW",
      "LIMIT_ONLY",
      "UNVERIFIED",
      "NOT_APPLICABLE",
    ]),
    rule: NonEmptyStringSchema.nullable(),
  }),
  historyHorizon: NonEmptyStringSchema,
  pushCadence: NonEmptyStringSchema,
  pointInTimeSuitability: z.enum([
    "SUITABLE",
    "CONDITIONAL",
    "UNSUITABLE",
    "UNVERIFIED",
  ]),
  replaySuitability: z.enum([
    "SUITABLE",
    "CONDITIONAL",
    "UNSUITABLE",
    "UNVERIFIED",
  ]),
  rightsStatus: z.enum([
    "OFFICIAL_TERMS_REVIEW_REQUIRED",
    "PERSONAL_USE_PLAN_TERMS_REVIEW_REQUIRED",
    "NOT_APPLICABLE",
  ]),
  implementationStatus: z.enum([
    "IMPLEMENTED_SCOPE_V1_ONLY",
    "NOT_IMPLEMENTED_SCOPE_V2",
    "NOT_APPLICABLE",
  ]),
  implementationEvidence: z.array(NonEmptyStringSchema),
  runtimeProbeStatus: z.enum([
    "PASS_SCOPE_V1_ONLY",
    "NOT_RUN_SCOPE_V2",
    "NOT_APPLICABLE",
  ]),
  runtimeEvidenceIds: z.array(NonEmptyStringSchema),
  disposition: z.enum([
    "ADOPTED_AS_FACT",
    "DERIVED_WITH_LINEAGE",
    "OBSERVED_UNSUPPORTED",
    "REJECTED_REDUNDANT",
    "REJECTED_UNLICENSED",
    "REJECTED_LOW_VALUE_HIGH_COST",
    "UNAVAILABLE",
  ]),
  costAndStorageClass: z.enum([
    "LOW_METADATA",
    "LOW_CURRENT_SNAPSHOT",
    "MEDIUM_TIMESERIES",
    "HIGH_EVENT_STREAM",
    "EXTERNAL_QUOTA_BOUND",
    "NONE",
  ]),
  fallbackPolicy: z.literal("NO_SYNTHETIC_OR_STALE_FALLBACK"),
  evidenceIds: z.array(NonEmptyStringSchema),
  failureSemantics: z.array(z.enum(M1_FAILURE_SEMANTICS)).min(1),
  reasonCodes: UniqueReasonCodesSchema,
}).superRefine((row, context) => {
  for (const [field, values] of [
    ["assetDomains", row.assetDomains],
    ["implementationEvidence", row.implementationEvidence],
    ["runtimeEvidenceIds", row.runtimeEvidenceIds],
    ["evidenceIds", row.evidenceIds],
    ["failureSemantics", row.failureSemantics],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: `capability row ${field} must be unique`,
        path: [field],
      });
    }
  }
  if (
    row.documentationStatus.startsWith("OFFICIAL_DOCUMENTED") &&
    row.evidenceIds.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "documented capabilities require official evidence",
      path: ["evidenceIds"],
    });
  }
  if (
    row.documentationStatus === "NOT_APPLICABLE" &&
    (
      row.endpoint !== null ||
      row.channel !== null ||
      row.entitlementStatus !== "NOT_APPLICABLE" ||
      row.disposition !== "UNAVAILABLE"
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "not-applicable capabilities must fail closed",
    });
  }
  if (
    row.documentationStatus === "NO_OFFICIAL_CAPABILITY_FOUND" &&
    (row.endpoint !== null || row.channel !== null)
  ) {
    context.addIssue({
      code: "custom",
      message: "undocumented capabilities cannot claim an endpoint or channel",
    });
  }
  if (
    ["UNAVAILABLE", "OBSERVED_UNSUPPORTED", "REJECTED_UNLICENSED"].includes(
      row.disposition,
    ) &&
    row.reasonCodes.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "non-adopted capability rows require reason codes",
      path: ["reasonCodes"],
    });
  }
  if (
    row.implementationStatus === "IMPLEMENTED_SCOPE_V1_ONLY" &&
    row.implementationEvidence.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "implemented scope-v1 rows require source references",
      path: ["implementationEvidence"],
    });
  }
  if (
    row.implementationStatus !== "IMPLEMENTED_SCOPE_V1_ONLY" &&
    row.implementationEvidence.length > 0
  ) {
    context.addIssue({
      code: "custom",
      message: "unimplemented rows cannot claim implementation evidence",
      path: ["implementationEvidence"],
    });
  }
  if (
    row.runtimeProbeStatus === "PASS_SCOPE_V1_ONLY" &&
    (
      row.implementationStatus !== "IMPLEMENTED_SCOPE_V1_ONLY" ||
      row.runtimeEvidenceIds.length === 0
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "scope-v1 runtime pass requires implementation and evidence",
      path: ["runtimeProbeStatus"],
    });
  }
  if (
    row.runtimeProbeStatus !== "PASS_SCOPE_V1_ONLY" &&
    row.runtimeEvidenceIds.length > 0
  ) {
    context.addIssue({
      code: "custom",
      message: "unrun capability cannot carry runtime evidence",
      path: ["runtimeEvidenceIds"],
    });
  }
  if (
    row.entitlementStatus === "HOBBYIST_UNAVAILABLE" &&
    row.disposition !== "REJECTED_UNLICENSED"
  ) {
    context.addIssue({
      code: "custom",
      message: "Hobbyist-unavailable capability must be rejected as unlicensed",
      path: ["disposition"],
    });
  }
});

const RegistryCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_SOURCE_CAPABILITY_REGISTRY_VERSION),
  registryId: NonEmptyStringSchema,
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  reviewedAt: IsoDateTimeSchema,
  evidence: z.array(EvidenceReferenceSchema).min(1),
  sources: z.array(SourceProfileSchema).length(M1_SOURCE_IDS.length),
  capabilities: z.array(CapabilityDefinitionSchema).length(
    M1_CAPABILITY_IDS.length,
  ),
  rows: z.array(CapabilityRowSchema).length(
    M1_SOURCE_IDS.length * M1_CAPABILITY_IDS.length,
  ),
  venueDenominator: z.literal(M1_VENUE_SOURCE_IDS.length),
  sourceDenominator: z.literal(M1_SOURCE_IDS.length),
  capabilityDenominator: z.literal(M1_CAPABILITY_IDS.length),
  runtimeNetworkRequestsPerformed: z.literal(false),
  productionChanged: z.literal(false),
  secretMaterialPresent: z.literal(false),
  authorityBoundary: z.literal(
    "GOVERNANCE_REGISTRY_ONLY_NO_FACT_CANDIDATE_STRATEGY_OR_READY_AUTHORITY",
  ),
});

export const M1SourceCapabilityRegistrySchema = RegistryCoreSchema.extend({
  registryDigest: DigestSchema,
});

export const M1SourceCapabilityAssessmentSchema = z.strictObject({
  schemaVersion: z.literal(M1_SOURCE_CAPABILITY_ASSESSMENT_VERSION),
  registryId: NonEmptyStringSchema,
  registryDigest: DigestSchema,
  status: z.enum(["PASS", "FAIL"]),
  expectedRowCount: NonNegativeIntegerSchema,
  observedRowCount: NonNegativeIntegerSchema,
  documentedRowCount: NonNegativeIntegerSchema,
  unavailableRowCount: NonNegativeIntegerSchema,
  scopeV1RuntimePassRowCount: NonNegativeIntegerSchema,
  scopeV2RuntimePassRowCount: z.literal(0),
  violations: z.array(NonEmptyStringSchema),
  completionBoundary: z.literal(
    "CONTRACT_COMPLETE_OFFICIAL_DOCS_REVIEWED_ADAPTERS_AND_LIVE_PROBES_UNPROVEN",
  ),
});

export type M1SourceId = (typeof M1_SOURCE_IDS)[number];
export type M1VenueSourceId = (typeof M1_VENUE_SOURCE_IDS)[number];
export type M1CapabilityId = (typeof M1_CAPABILITY_IDS)[number];
export type M1AssetDomain = (typeof M1_ASSET_DOMAINS)[number];
export type M1FailureSemantic = (typeof M1_FAILURE_SEMANTICS)[number];
export type M1CapabilityDefinition = z.infer<
  typeof CapabilityDefinitionSchema
>;
export type M1SourceProfile = z.infer<typeof SourceProfileSchema>;
export type M1EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;
export type M1CapabilityRow = z.infer<typeof CapabilityRowSchema>;
export type M1SourceCapabilityRegistry = z.infer<
  typeof M1SourceCapabilityRegistrySchema
>;
export type M1SourceCapabilityAssessment = z.infer<
  typeof M1SourceCapabilityAssessmentSchema
>;

type RegistryCore = z.input<typeof RegistryCoreSchema>;

function sortedUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length &&
    values.every((value, index) =>
      index === 0 || values[index - 1]!.localeCompare(value) < 0
    );
}

function exactSet(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return actual.length === expected.length &&
    expected.every((value) => actual.includes(value));
}

function collectRegistryViolations(
  registry: M1SourceCapabilityRegistry,
): string[] {
  const violations: string[] = [];
  const evidenceById = new Map(
    registry.evidence.map((evidence) => [evidence.evidenceId, evidence]),
  );

  if (!exactSet(registry.sources.map((source) => source.sourceId), M1_SOURCE_IDS)) {
    violations.push("source_denominator_not_exact");
  }
  if (
    !exactSet(
      registry.capabilities.map((capability) => capability.capabilityId),
      M1_CAPABILITY_IDS,
    )
  ) {
    violations.push("capability_denominator_not_exact");
  }

  const rowKeys = registry.rows.map(
    (row) => `${row.sourceId}:${row.capabilityId}`,
  );
  if (new Set(rowKeys).size !== rowKeys.length) {
    violations.push("duplicate_source_capability_pair");
  }
  for (const sourceId of M1_SOURCE_IDS) {
    for (const capabilityId of M1_CAPABILITY_IDS) {
      if (!rowKeys.includes(`${sourceId}:${capabilityId}`)) {
        violations.push(`missing_pair:${sourceId}:${capabilityId}`);
      }
    }
  }

  if (
    !sortedUnique(registry.sources.map((source) => source.sourceId)) ||
    !sortedUnique(
      registry.capabilities.map((capability) => capability.capabilityId),
    ) ||
    !sortedUnique(rowKeys)
  ) {
    violations.push("registry_arrays_not_canonically_sorted");
  }

  for (const source of registry.sources) {
    for (const evidenceId of source.officialEvidenceIds) {
      const evidence = evidenceById.get(evidenceId);
      if (!evidence || evidence.sourceId !== source.sourceId) {
        violations.push(`invalid_source_evidence:${source.sourceId}:${evidenceId}`);
      }
    }
  }

  for (const row of registry.rows) {
    for (const evidenceId of row.evidenceIds) {
      const evidence = evidenceById.get(evidenceId);
      if (
        !evidence ||
        evidence.sourceId !== row.sourceId ||
        !evidence.supportsCapabilityIds.includes(row.capabilityId)
      ) {
        violations.push(
          `invalid_row_evidence:${row.sourceId}:${row.capabilityId}:${evidenceId}`,
        );
      }
    }
    if (row.rateLimit.evidenceId !== null) {
      const evidence = evidenceById.get(row.rateLimit.evidenceId);
      if (
        !evidence ||
        evidence.sourceId !== row.sourceId ||
        !evidence.supportsCapabilityIds.includes(row.capabilityId)
      ) {
        violations.push(
          `invalid_rate_limit_evidence:${row.sourceId}:${row.capabilityId}`,
        );
      }
    }
    if (
      row.sourceId !== "COINGLASS_V4" &&
      !["PUBLIC_NO_KEY", "NOT_APPLICABLE"].includes(row.entitlementStatus)
    ) {
      violations.push(
        `venue_entitlement_not_public:${row.sourceId}:${row.capabilityId}`,
      );
    }
    if (
      row.sourceId === "COINGLASS_V4" &&
      row.entitlementStatus === "PUBLIC_NO_KEY"
    ) {
      violations.push(`coinglass_capability_claimed_public:${row.capabilityId}`);
    }
  }

  const serialized = JSON.stringify(registry);
  if (
    /(?:api[-_ ]?key|secret|token)["']?\s*[:=]\s*["'][A-Za-z0-9+/=_-]{12,}/iu
      .test(serialized)
  ) {
    violations.push("possible_secret_material_embedded");
  }

  const digestCore = {
    schemaVersion: registry.schemaVersion,
    registryId: registry.registryId,
    scopeEpoch: registry.scopeEpoch,
    reviewedAt: registry.reviewedAt,
    evidence: registry.evidence,
    sources: registry.sources,
    capabilities: registry.capabilities,
    rows: registry.rows,
    venueDenominator: registry.venueDenominator,
    sourceDenominator: registry.sourceDenominator,
    capabilityDenominator: registry.capabilityDenominator,
    runtimeNetworkRequestsPerformed: registry.runtimeNetworkRequestsPerformed,
    productionChanged: registry.productionChanged,
    secretMaterialPresent: registry.secretMaterialPresent,
    authorityBoundary: registry.authorityBoundary,
  };
  if (stableContentHash(digestCore) !== registry.registryDigest) {
    violations.push("registry_digest_mismatch");
  }

  return [...new Set(violations)].sort();
}

export function buildM1SourceCapabilityRegistry(
  input: RegistryCore,
): M1SourceCapabilityRegistry {
  const parsed = RegistryCoreSchema.parse({
    ...input,
    evidence: [...input.evidence].sort((left, right) =>
      left.evidenceId.localeCompare(right.evidenceId)
    ),
    sources: [...input.sources].sort((left, right) =>
      left.sourceId.localeCompare(right.sourceId)
    ),
    capabilities: [...input.capabilities].sort((left, right) =>
      left.capabilityId.localeCompare(right.capabilityId)
    ),
    rows: [...input.rows].sort((left, right) =>
      `${left.sourceId}:${left.capabilityId}`.localeCompare(
        `${right.sourceId}:${right.capabilityId}`,
      )
    ),
  });
  const registry = M1SourceCapabilityRegistrySchema.parse({
    ...parsed,
    registryDigest: stableContentHash(parsed),
  });
  const violations = collectRegistryViolations(registry);
  if (violations.length > 0) {
    throw new Error(`invalid source capability registry: ${violations.join(",")}`);
  }
  return deepFreezeArtifact(registry);
}

export function assessM1SourceCapabilityRegistry(
  input: unknown,
): M1SourceCapabilityAssessment {
  const parsed = M1SourceCapabilityRegistrySchema.safeParse(input);
  if (!parsed.success) {
    return deepFreezeArtifact(M1SourceCapabilityAssessmentSchema.parse({
      schemaVersion: M1_SOURCE_CAPABILITY_ASSESSMENT_VERSION,
      registryId: "invalid-registry",
      registryDigest: stableContentHash(input),
      status: "FAIL",
      expectedRowCount: M1_SOURCE_IDS.length * M1_CAPABILITY_IDS.length,
      observedRowCount: 0,
      documentedRowCount: 0,
      unavailableRowCount: 0,
      scopeV1RuntimePassRowCount: 0,
      scopeV2RuntimePassRowCount: 0,
      violations: ["schema_validation_failed"],
      completionBoundary:
        "CONTRACT_COMPLETE_OFFICIAL_DOCS_REVIEWED_ADAPTERS_AND_LIVE_PROBES_UNPROVEN",
    }));
  }

  const violations = collectRegistryViolations(parsed.data);
  return deepFreezeArtifact(M1SourceCapabilityAssessmentSchema.parse({
    schemaVersion: M1_SOURCE_CAPABILITY_ASSESSMENT_VERSION,
    registryId: parsed.data.registryId,
    registryDigest: parsed.data.registryDigest,
    status: violations.length === 0 ? "PASS" : "FAIL",
    expectedRowCount: M1_SOURCE_IDS.length * M1_CAPABILITY_IDS.length,
    observedRowCount: parsed.data.rows.length,
    documentedRowCount: parsed.data.rows.filter((row) =>
      row.documentationStatus.startsWith("OFFICIAL_DOCUMENTED")
    ).length,
    unavailableRowCount: parsed.data.rows.filter((row) =>
      row.disposition === "UNAVAILABLE" ||
      row.disposition === "REJECTED_UNLICENSED"
    ).length,
    scopeV1RuntimePassRowCount: parsed.data.rows.filter((row) =>
      row.runtimeProbeStatus === "PASS_SCOPE_V1_ONLY"
    ).length,
    scopeV2RuntimePassRowCount: 0,
    violations,
    completionBoundary:
      "CONTRACT_COMPLETE_OFFICIAL_DOCS_REVIEWED_ADAPTERS_AND_LIVE_PROBES_UNPROVEN",
  }));
}
