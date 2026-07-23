import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";
import {
  M1_ASSET_DOMAINS,
  M1_CAPABILITY_IDS,
  M1_COLLECTION_TIERS,
  M1_SCOPE_EPOCH,
  M1_SOURCE_IDS,
  M1_VENUE_SOURCE_IDS,
  type M1AssetDomain,
  type M1CapabilityId,
  type M1SourceId,
} from "../source-capability/source-capability-contract";
import {
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
} from "../source-capability/adapters/four-venue-capability-registry";
import {
  M1_LISTING_LIFECYCLE_STATES,
} from "../multi-asset-universe/multi-asset-identity-contract";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";

export const M1_ADAPTIVE_COLLECTOR_GRANT_VERSION =
  "v2-m1-adaptive-collector-capability-grant.v1" as const;
export const M1_ADAPTIVE_COLLECTOR_PLAN_VERSION =
  "v2-m1-adaptive-collector-contract-plan.v1" as const;
export const M1_ADAPTIVE_COLLECTOR_POLICY_VERSION =
  "v2-m1-adaptive-collector-policy.v1" as const;

export const M1_COLLECTOR_EVIDENCE_CLASSES = [
  "LIVE_READ_ONLY",
  "TEST_ONLY",
] as const;

export const M1_COLLECTOR_RIGHTS_STATUSES = [
  "PUBLIC_PERSONAL_ANALYTICS_ALLOWED",
  "HOBBYIST_PERSONAL_ANALYTICS_ALLOWED",
  "PENDING_REVIEW",
  "RESTRICTED",
  "UNAVAILABLE",
] as const;

export const M1_COLLECTOR_INTENT_DISPOSITIONS = [
  "READY_FOR_RUNTIME_ADAPTER",
  "TEST_ONLY_NO_RUNTIME",
  "CAPABILITY_NOT_LIVE",
  "CAPABILITY_FAILED",
  "CAPABILITY_GRANT_CONFLICT",
  "CAPABILITY_EXPIRED",
  "RIGHTS_BLOCKED",
  "ENTITLEMENT_BLOCKED",
  "JURISDICTION_BLOCKED",
  "REGISTRY_DISPOSITION_BLOCKED",
  "SUBJECT_NOT_ELIGIBLE",
  "LIFECYCLE_BLOCKED",
  "IDENTITY_UNRESOLVED",
  "EQUITY_REFERENCE_BLOCKED",
  "CONTROL_MISSING",
  "CONTROL_NOT_READY",
  "QUOTA_UNVERIFIED",
  "RATE_LIMITED",
  "AUTH_ERROR",
  "SOURCE_UNAVAILABLE",
  "QUOTA_EXHAUSTED",
  "NOT_DUE",
  "CHECKPOINT_INFLIGHT",
  "BACKOFF_DEFERRED",
  "RETRY_CIRCUIT_OPEN",
  "BACKPRESSURE_DEFERRED",
] as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const UniqueNonEmptyStringsSchema = z.array(NonEmptyStringSchema)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "values must be unique",
      });
    }
  });
const AssetDomainsSchema = z.array(z.enum(M1_ASSET_DOMAINS)).min(1)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "asset domains must be unique",
      });
    }
  });

const CapabilityGrantCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_ADAPTIVE_COLLECTOR_GRANT_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  sourceId: z.enum(M1_SOURCE_IDS),
  capabilityId: z.enum(M1_CAPABILITY_IDS),
  assetDomains: AssetDomainsSchema,
  evidenceClass: z.enum(M1_COLLECTOR_EVIDENCE_CLASSES),
  networkEnvironment: z.enum([
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  conformanceStatus: z.enum(["PASS", "FAIL", "NOT_RUN"]),
  rightsStatus: z.enum(M1_COLLECTOR_RIGHTS_STATUSES),
  rightsReviewerClass: z.enum([
    "HUMAN_EXTERNAL_REVIEW",
    "NOT_REVIEWED",
  ]),
  rightsReviewedAt: IsoDateTimeSchema.nullable(),
  rightsExpiresAt: IsoDateTimeSchema.nullable(),
  rightsEvidenceHash: DigestSchema.nullable(),
  entitlementStatus: z.enum([
    "PUBLIC_NO_KEY",
    "HOBBYIST_CONFIRMED",
    "HOBBYIST_UNAVAILABLE",
    "UNVERIFIED",
  ]),
  jurisdictionAvailability: z.enum([
    "AVAILABLE",
    "RESTRICTED",
    "UNAVAILABLE",
    "UNVERIFIED",
  ]),
  observedAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  evidenceIds: UniqueNonEmptyStringsSchema,
  conformanceArtifactHash: DigestSchema,
  adapterVersion: NonEmptyStringSchema,
  noSyntheticOrStaleFallback: z.literal(true),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
});

export const M1CollectorCapabilityGrantSchema =
  CapabilityGrantCoreSchema.extend({
    grantId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((grant, context) => {
    if (Date.parse(grant.observedAt) >= Date.parse(grant.expiresAt)) {
      context.addIssue({
        code: "custom",
        message: "capability grant expiry must be after observation",
        path: ["expiresAt"],
      });
    }
    if (
      grant.evidenceClass === "LIVE_READ_ONLY" &&
      grant.networkEnvironment !== "TENCENT_ISOLATED_READ_ONLY"
    ) {
      context.addIssue({
        code: "custom",
        message: "live grants require Tencent isolated read-only evidence",
        path: ["networkEnvironment"],
      });
    }
    if (
      grant.evidenceClass === "TEST_ONLY" &&
      grant.networkEnvironment !== "TEST_HARNESS"
    ) {
      context.addIssue({
        code: "custom",
        message: "test-only grants require the test harness environment",
        path: ["networkEnvironment"],
      });
    }
    if (
      grant.evidenceClass === "LIVE_READ_ONLY" &&
      grant.conformanceStatus === "PASS" &&
      grant.evidenceIds.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "passing live grants require runtime evidence ids",
        path: ["evidenceIds"],
      });
    }
    const isCoinGlass = grant.sourceId === "COINGLASS_V4";
    if (
      isCoinGlass &&
      !["HOBBYIST_CONFIRMED", "HOBBYIST_UNAVAILABLE", "UNVERIFIED"]
        .includes(grant.entitlementStatus)
    ) {
      context.addIssue({
        code: "custom",
        message: "CoinGlass cannot use a public-no-key entitlement",
        path: ["entitlementStatus"],
      });
    }
    if (!isCoinGlass && grant.entitlementStatus !== "PUBLIC_NO_KEY") {
      context.addIssue({
        code: "custom",
        message: "venue grants must remain public-no-key",
        path: ["entitlementStatus"],
      });
    }
    if (
      grant.rightsStatus === "HOBBYIST_PERSONAL_ANALYTICS_ALLOWED" &&
      !isCoinGlass
    ) {
      context.addIssue({
        code: "custom",
        message: "Hobbyist rights apply only to CoinGlass",
        path: ["rightsStatus"],
      });
    }
    if (
      grant.rightsStatus === "PUBLIC_PERSONAL_ANALYTICS_ALLOWED" &&
      isCoinGlass
    ) {
      context.addIssue({
        code: "custom",
        message: "CoinGlass rights cannot be represented as public",
        path: ["rightsStatus"],
      });
    }
    const rightsAllowed = [
      "PUBLIC_PERSONAL_ANALYTICS_ALLOWED",
      "HOBBYIST_PERSONAL_ANALYTICS_ALLOWED",
    ].includes(grant.rightsStatus);
    const completeRightsEvidence =
      grant.rightsReviewerClass === "HUMAN_EXTERNAL_REVIEW" &&
      grant.rightsReviewedAt !== null &&
      grant.rightsExpiresAt !== null &&
      grant.rightsEvidenceHash !== null;
    if (rightsAllowed && !completeRightsEvidence) {
      context.addIssue({
        code: "custom",
        message: "allowed rights require current external human review evidence",
        path: ["rightsReviewerClass"],
      });
    }
    if (
      grant.rightsReviewerClass === "NOT_REVIEWED" &&
      (
        grant.rightsReviewedAt !== null ||
        grant.rightsExpiresAt !== null ||
        grant.rightsEvidenceHash !== null
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "unreviewed rights cannot carry review evidence",
        path: ["rightsReviewedAt"],
      });
    }
    if (
      completeRightsEvidence &&
      (
        Date.parse(grant.rightsReviewedAt!) > Date.parse(grant.observedAt) ||
        Date.parse(grant.rightsReviewedAt!) >=
          Date.parse(grant.rightsExpiresAt!) ||
        Date.parse(grant.expiresAt) > Date.parse(grant.rightsExpiresAt!)
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "capability grant cannot predate or outlive its rights review",
        path: ["rightsExpiresAt"],
      });
    }
    const registryRow =
      M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.rows.find((row) =>
        row.sourceId === grant.sourceId &&
        row.capabilityId === grant.capabilityId
      );
    if (
      registryRow === undefined ||
      grant.assetDomains.some((assetDomain) =>
        !registryRow.assetDomains.includes(assetDomain)
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "capability grant exceeds the registered source domain",
        path: ["assetDomains"],
      });
    }
    if (
      grant.evidenceClass === "LIVE_READ_ONLY" &&
      grant.conformanceStatus === "PASS" &&
      (
        registryRow === undefined ||
        !["ADOPTED_AS_FACT", "DERIVED_WITH_LINEAGE"].includes(
          registryRow.disposition,
        )
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "live grant cannot promote a blocked registry disposition",
        path: ["conformanceStatus"],
      });
    }
    const core = capabilityGrantCore(grant);
    const expectedHash = stableContentHash(core);
    if (grant.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "capability grant content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      grant.grantId !==
        `collector-grant:${grant.sourceId}:${grant.capabilityId}:` +
          expectedHash.slice(7, 23)
    ) {
      context.addIssue({
        code: "custom",
        message: "capability grant id mismatch",
        path: ["grantId"],
      });
    }
  });

export type M1CollectorCapabilityGrant = z.infer<
  typeof M1CollectorCapabilityGrantSchema
>;

function capabilityGrantCore(
  grant: z.input<typeof CapabilityGrantCoreSchema> & {
    readonly grantId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof CapabilityGrantCoreSchema> {
  return CapabilityGrantCoreSchema.parse({
    schemaVersion: grant.schemaVersion,
    scopeEpoch: grant.scopeEpoch,
    releaseId: grant.releaseId,
    sourceId: grant.sourceId,
    capabilityId: grant.capabilityId,
    assetDomains: [...grant.assetDomains].sort(),
    evidenceClass: grant.evidenceClass,
    networkEnvironment: grant.networkEnvironment,
    conformanceStatus: grant.conformanceStatus,
    rightsStatus: grant.rightsStatus,
    rightsReviewerClass: grant.rightsReviewerClass,
    rightsReviewedAt: grant.rightsReviewedAt,
    rightsExpiresAt: grant.rightsExpiresAt,
    rightsEvidenceHash: grant.rightsEvidenceHash,
    entitlementStatus: grant.entitlementStatus,
    jurisdictionAvailability: grant.jurisdictionAvailability,
    observedAt: grant.observedAt,
    expiresAt: grant.expiresAt,
    evidenceIds: [...grant.evidenceIds].sort(),
    conformanceArtifactHash: grant.conformanceArtifactHash,
    adapterVersion: grant.adapterVersion,
    noSyntheticOrStaleFallback: grant.noSyntheticOrStaleFallback,
    factAuthorityGranted: grant.factAuthorityGranted,
    candidateAuthorityGranted: grant.candidateAuthorityGranted,
    strategyAuthorityGranted: grant.strategyAuthorityGranted,
  });
}

export function buildM1CollectorCapabilityGrant(
  input: Omit<
    z.input<typeof CapabilityGrantCoreSchema>,
    | "schemaVersion"
    | "scopeEpoch"
    | "noSyntheticOrStaleFallback"
    | "factAuthorityGranted"
    | "candidateAuthorityGranted"
    | "strategyAuthorityGranted"
  >,
): M1CollectorCapabilityGrant {
  const core = capabilityGrantCore({
    ...input,
    schemaVersion: M1_ADAPTIVE_COLLECTOR_GRANT_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    noSyntheticOrStaleFallback: true,
    factAuthorityGranted: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1CollectorCapabilityGrantSchema.parse({
    ...core,
    grantId: `collector-grant:${core.sourceId}:${core.capabilityId}:` +
      contentHash.slice(7, 23),
    contentHash,
  }));
}

export const M1CollectorSubjectSchema = z.strictObject({
  subjectId: NonEmptyStringSchema,
  sourceId: z.enum(M1_VENUE_SOURCE_IDS),
  assetDomain: z.enum(M1_ASSET_DOMAINS),
  coverageClass: z.enum([
    "SUPPORTED_DERIVATIVE",
    "ASSET_LISTING_WATCH",
  ]),
  canonicalInstrumentId: NonEmptyStringSchema.nullable(),
  venueInstrumentId: NonEmptyStringSchema,
  listingEpoch: NonEmptyStringSchema,
  identityEpoch: NonEmptyStringSchema,
  identityStatus: z.enum(["EXACT", "PARTIAL", "UNRESOLVED"]),
  lifecycleState: z.enum(M1_LISTING_LIFECYCLE_STATES),
  eligibilityStatus: z.enum([
    "ELIGIBLE",
    "INELIGIBLE",
    "NOT_EVALUATED",
    "UNRESOLVED",
  ]),
  candidatePriority: z.enum(["NONE", "P0", "P1", "P2"]),
  candidateEpisodeId: NonEmptyStringSchema.nullable(),
  matchedControlForEpisodeId: NonEmptyStringSchema.nullable(),
  deepValidationEpisodeId: NonEmptyStringSchema.nullable(),
  observedAt: IsoDateTimeSchema,
  reasonCodes: ReasonCodesSchema,
}).superRefine((subject, context) => {
  const isWatch = subject.coverageClass === "ASSET_LISTING_WATCH";
  if (
    isWatch &&
    (
      subject.assetDomain !== "ASSET_LISTING_WATCH" ||
      subject.canonicalInstrumentId !== null ||
      subject.eligibilityStatus === "ELIGIBLE" ||
      subject.candidatePriority !== "NONE" ||
      subject.candidateEpisodeId !== null ||
      subject.matchedControlForEpisodeId !== null ||
      subject.deepValidationEpisodeId !== null
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "listing-watch subjects cannot masquerade as derivative candidates",
      path: ["coverageClass"],
    });
  }
  if (
    !isWatch &&
    (
      subject.assetDomain === "ASSET_LISTING_WATCH" ||
      subject.assetDomain === "CROSS_MARKET_CONTEXT"
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "derivative subjects require a derivative asset domain",
      path: ["assetDomain"],
    });
  }
  if (
    subject.identityStatus === "EXACT" &&
    subject.canonicalInstrumentId === null
  ) {
    context.addIssue({
      code: "custom",
      message: "exact identity requires a canonical instrument id",
      path: ["canonicalInstrumentId"],
    });
  }
  if (
    subject.identityStatus !== "EXACT" &&
    subject.canonicalInstrumentId !== null
  ) {
    context.addIssue({
      code: "custom",
      message: "non-exact identity cannot claim a canonical instrument id",
      path: ["canonicalInstrumentId"],
    });
  }
  const isCandidate = ["P0", "P1"].includes(subject.candidatePriority);
  if (isCandidate !== (subject.candidateEpisodeId !== null)) {
    context.addIssue({
      code: "custom",
      message: "P0/P1 candidate priority and episode id must agree",
      path: ["candidateEpisodeId"],
    });
  }
  if (
    subject.candidatePriority !== "NONE" &&
    subject.matchedControlForEpisodeId !== null
  ) {
    context.addIssue({
      code: "custom",
      message: "candidate subjects cannot also be matched controls",
      path: ["matchedControlForEpisodeId"],
    });
  }
  if (
    subject.matchedControlForEpisodeId !== null &&
    (
      subject.candidatePriority !== "NONE" ||
      subject.candidateEpisodeId !== null ||
      subject.deepValidationEpisodeId !== null
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "matched controls cannot carry candidate or deep episodes",
      path: ["matchedControlForEpisodeId"],
    });
  }
  if (
    subject.deepValidationEpisodeId !== null &&
    !isCandidate
  ) {
    context.addIssue({
      code: "custom",
      message: "deep validation requires a P0/P1 candidate episode",
      path: ["deepValidationEpisodeId"],
    });
  }
});

export type M1CollectorSubject = z.infer<typeof M1CollectorSubjectSchema>;

export const M1CollectorQuotaStateSchema = z.strictObject({
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  sourceId: z.enum(M1_SOURCE_IDS),
  capabilityId: z.enum(M1_CAPABILITY_IDS),
  evidenceClass: z.enum(M1_COLLECTOR_EVIDENCE_CLASSES),
  networkEnvironment: z.enum([
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  status: z.enum([
    "READY",
    "RATE_LIMITED",
    "AUTH_ERROR",
    "SOURCE_UNAVAILABLE",
  ]),
  windowStartedAt: IsoDateTimeSchema,
  windowEndsAt: IsoDateTimeSchema,
  requestLimit: z.number().int().positive().max(1_000_000),
  requestsUsed: NonNegativeIntegerSchema,
  requestsReserved: NonNegativeIntegerSchema,
  observedAt: IsoDateTimeSchema,
  retryAfter: IsoDateTimeSchema.nullable(),
  evidenceIds: UniqueNonEmptyStringsSchema.min(1),
}).superRefine((quota, context) => {
  if (
    quota.evidenceClass === "LIVE_READ_ONLY" &&
    quota.networkEnvironment !== "TENCENT_ISOLATED_READ_ONLY"
  ) {
    context.addIssue({
      code: "custom",
      message: "live quota state requires Tencent isolated read-only evidence",
      path: ["networkEnvironment"],
    });
  }
  if (
    quota.evidenceClass === "TEST_ONLY" &&
    quota.networkEnvironment !== "TEST_HARNESS"
  ) {
    context.addIssue({
      code: "custom",
      message: "test quota state requires the test harness environment",
      path: ["networkEnvironment"],
    });
  }
  if (Date.parse(quota.windowStartedAt) >= Date.parse(quota.windowEndsAt)) {
    context.addIssue({
      code: "custom",
      message: "quota window end must be after start",
      path: ["windowEndsAt"],
    });
  }
  if (
    Date.parse(quota.observedAt) < Date.parse(quota.windowStartedAt) ||
    Date.parse(quota.observedAt) >= Date.parse(quota.windowEndsAt)
  ) {
    context.addIssue({
      code: "custom",
      message: "quota observation must belong to its active window",
      path: ["observedAt"],
    });
  }
  if (quota.requestsUsed + quota.requestsReserved > quota.requestLimit) {
    context.addIssue({
      code: "custom",
      message: "quota usage cannot exceed the documented request limit",
      path: ["requestsUsed"],
    });
  }
  if (
    quota.status === "RATE_LIMITED" &&
    quota.retryAfter === null
  ) {
    context.addIssue({
      code: "custom",
      message: "rate-limited quota requires retryAfter",
      path: ["retryAfter"],
    });
  }
  if (
    quota.retryAfter !== null &&
    Date.parse(quota.retryAfter) <= Date.parse(quota.observedAt)
  ) {
    context.addIssue({
      code: "custom",
      message: "quota retryAfter must be later than observation",
      path: ["retryAfter"],
    });
  }
  if (
    quota.status !== "RATE_LIMITED" &&
    quota.retryAfter !== null
  ) {
    context.addIssue({
      code: "custom",
      message: "only rate-limited quota may carry retryAfter",
      path: ["retryAfter"],
    });
  }
});

export type M1CollectorQuotaState = z.infer<
  typeof M1CollectorQuotaStateSchema
>;

export const M1CollectorCheckpointSchema = z.strictObject({
  intentKey: NonEmptyStringSchema,
  lastCompletedAt: IsoDateTimeSchema.nullable(),
  lastAttemptAt: IsoDateTimeSchema.nullable(),
  consecutiveFailures: NonNegativeIntegerSchema,
  inFlightLeaseUntil: IsoDateTimeSchema.nullable(),
  lastFailureClass: z.enum([
    "NONE",
    "RATE_LIMITED",
    "AUTH_ERROR",
    "SCHEMA_DRIFT",
    "TRANSPORT",
    "SOURCE_UNAVAILABLE",
  ]),
}).superRefine((checkpoint, context) => {
  if (
    checkpoint.consecutiveFailures === 0 &&
    checkpoint.lastFailureClass !== "NONE"
  ) {
    context.addIssue({
      code: "custom",
      message: "zero failures require NONE failure class",
      path: ["lastFailureClass"],
    });
  }
  if (
    checkpoint.consecutiveFailures > 0 &&
    (
      checkpoint.lastFailureClass === "NONE" ||
      checkpoint.lastAttemptAt === null
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "failed checkpoints require an attempt and failure class",
      path: ["consecutiveFailures"],
    });
  }
  if (
    checkpoint.inFlightLeaseUntil !== null &&
    checkpoint.lastAttemptAt === null
  ) {
    context.addIssue({
      code: "custom",
      message: "an in-flight lease requires a recorded attempt",
      path: ["inFlightLeaseUntil"],
    });
  }
  if (
    checkpoint.lastCompletedAt !== null &&
    checkpoint.lastAttemptAt !== null &&
    Date.parse(checkpoint.lastCompletedAt) <
      Date.parse(checkpoint.lastAttemptAt)
  ) {
    context.addIssue({
      code: "custom",
      message: "completion cannot precede the recorded attempt",
      path: ["lastCompletedAt"],
    });
  }
});

export type M1CollectorCheckpoint = z.infer<
  typeof M1CollectorCheckpointSchema
>;

const CadencesSchema = z.strictObject({
  T0_CATALOG_EVENT: z.number().int().min(60_000).max(86_400_000),
  T1_WIDE_MARKET: z.number().int().min(1_000).max(3_600_000),
  T2_CANDIDATE_BURST: z.number().int().min(250).max(300_000),
  T3_DEEP_VALIDATION: z.number().int().min(1_000).max(3_600_000),
});

export const M1AdaptiveCollectorPolicySchema = z.strictObject({
  policyVersion: z.literal(M1_ADAPTIVE_COLLECTOR_POLICY_VERSION),
  maxIntentRows: z.number().int().positive().max(200_000),
  maxReadyIntents: z.number().int().positive().max(20_000),
  baselineReservedSlots: NonNegativeIntegerSchema,
  maxReadyIntentsPerSource: z.number().int().positive().max(10_000),
  maxBurstIntentsPerSubject: z.number().int().positive().max(1_000),
  maxConsecutiveFailures: z.number().int().positive().max(100),
  baseRetryBackoffMs: z.number().int().min(1_000).max(3_600_000),
  maxRetryBackoffMs: z.number().int().min(1_000).max(86_400_000),
  cadencesMs: CadencesSchema,
  fairnessCursorSource: z.enum(M1_SOURCE_IDS),
  fullT0T1AccountingRequired: z.literal(true),
  t2MatchedControlRequired: z.literal(true),
  dropDeferredIntentsAllowed: z.literal(false),
  unboundedRetentionAllowed: z.literal(false),
  automaticFactAuthorityAllowed: z.literal(false),
  automaticCandidateAuthorityAllowed: z.literal(false),
  automaticStrategyAuthorityAllowed: z.literal(false),
}).superRefine((policy, context) => {
  if (policy.baselineReservedSlots > policy.maxReadyIntents) {
    context.addIssue({
      code: "custom",
      message: "baseline reserve cannot exceed total ready capacity",
      path: ["baselineReservedSlots"],
    });
  }
  if (policy.maxReadyIntentsPerSource > policy.maxReadyIntents) {
    context.addIssue({
      code: "custom",
      message: "per-source capacity cannot exceed total ready capacity",
      path: ["maxReadyIntentsPerSource"],
    });
  }
  if (policy.baseRetryBackoffMs > policy.maxRetryBackoffMs) {
    context.addIssue({
      code: "custom",
      message: "base retry backoff cannot exceed maximum",
      path: ["baseRetryBackoffMs"],
    });
  }
});

export type M1AdaptiveCollectorPolicy = z.infer<
  typeof M1AdaptiveCollectorPolicySchema
>;

const PlanInputSchema = z.strictObject({
  releaseId: ReleaseIdSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  registryDigest: DigestSchema,
  identitySnapshotHash: DigestSchema,
  subjects: z.array(M1CollectorSubjectSchema).max(10_000),
  capabilityGrants: z.array(M1CollectorCapabilityGrantSchema).max(1_000),
  quotaStates: z.array(M1CollectorQuotaStateSchema).max(1_000),
  checkpoints: z.array(M1CollectorCheckpointSchema).max(200_000),
  policy: M1AdaptiveCollectorPolicySchema,
});

export type M1AdaptiveCollectorPlanInput = z.input<typeof PlanInputSchema>;

const TierCountsSchema = z.strictObject({
  T0_CATALOG_EVENT: NonNegativeIntegerSchema,
  T1_WIDE_MARKET: NonNegativeIntegerSchema,
  T2_CANDIDATE_BURST: NonNegativeIntegerSchema,
  T3_DEEP_VALIDATION: NonNegativeIntegerSchema,
});

const SourceCountsSchema = z.strictObject({
  BINANCE_FUTURES: NonNegativeIntegerSchema,
  OKX_SWAP: NonNegativeIntegerSchema,
  BYBIT_DERIVATIVES: NonNegativeIntegerSchema,
  BITGET_FUTURES: NonNegativeIntegerSchema,
  COINGLASS_V4: NonNegativeIntegerSchema,
});

const DispositionCountsSchema = z.strictObject(
  Object.fromEntries(
    M1_COLLECTOR_INTENT_DISPOSITIONS.map((disposition) => [
      disposition,
      NonNegativeIntegerSchema,
    ]),
  ) as Record<
    (typeof M1_COLLECTOR_INTENT_DISPOSITIONS)[number],
    typeof NonNegativeIntegerSchema
  >,
);

export const M1AdaptiveCollectorIntentSchema = z.strictObject({
  intentKey: NonEmptyStringSchema,
  subjectId: NonEmptyStringSchema,
  subjectSourceId: z.enum(M1_VENUE_SOURCE_IDS),
  collectionSourceId: z.enum(M1_SOURCE_IDS),
  assetDomain: z.enum(M1_ASSET_DOMAINS),
  tier: z.enum(M1_COLLECTION_TIERS),
  capabilityId: z.enum(M1_CAPABILITY_IDS),
  candidateEpisodeId: NonEmptyStringSchema.nullable(),
  matchedControlForEpisodeId: NonEmptyStringSchema.nullable(),
  deepValidationEpisodeId: NonEmptyStringSchema.nullable(),
  disposition: z.enum(M1_COLLECTOR_INTENT_DISPOSITIONS),
  reasonCodes: ReasonCodesSchema,
  grantId: NonEmptyStringSchema.nullable(),
  quotaWindowEndsAt: IsoDateTimeSchema.nullable(),
  plannedRequestTokens: z.union([z.literal(0), z.literal(1)]),
  runtimeExecutionAllowed: z.literal(false),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
});

export type M1AdaptiveCollectorIntent = z.infer<
  typeof M1AdaptiveCollectorIntentSchema
>;

const AdaptiveCollectorPlanCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_ADAPTIVE_COLLECTOR_PLAN_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  registryDigest: DigestSchema,
  identitySnapshotHash: DigestSchema,
  subjectInputHash: DigestSchema,
  capabilityGrantSetHash: DigestSchema,
  quotaStateSetHash: DigestSchema,
  checkpointSetHash: DigestSchema,
  policyHash: DigestSchema,
  capabilityEvidenceClass: z.enum([
    "NO_GRANTS",
    "TEST_ONLY_OR_MIXED",
    "LIVE_READ_ONLY_ONLY",
  ]),
  subjectCount: NonNegativeIntegerSchema,
  subjectDenominatorsByTier: TierCountsSchema,
  intentCount: NonNegativeIntegerSchema,
  readyForRuntimeAdapterCount: NonNegativeIntegerSchema,
  countsByTier: TierCountsSchema,
  countsBySource: SourceCountsSchema,
  countsByDisposition: DispositionCountsSchema,
  plannedRequestTokensBySource: SourceCountsSchema,
  intents: z.array(M1AdaptiveCollectorIntentSchema).max(200_000),
  schedulerAuthority: z.literal(
    "CONTRACT_ONLY_NO_RUNTIME_EXECUTION_AUTHORITY",
  ),
  runtimeExecutionAllowed: z.literal(false),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1AdaptiveCollectorPlanSchema =
  AdaptiveCollectorPlanCoreSchema.extend({
    planId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((plan, context) => {
    if (Date.parse(plan.sourceCutoff) > Date.parse(plan.generatedAt)) {
      context.addIssue({
        code: "custom",
        message: "source cutoff cannot be later than plan generation",
        path: ["sourceCutoff"],
      });
    }
    if (plan.intentCount !== plan.intents.length) {
      context.addIssue({
        code: "custom",
        message: "intent count must equal intent rows",
        path: ["intentCount"],
      });
    }
    const keys = plan.intents.map((intent) => intent.intentKey);
    if (
      new Set(keys).size !== keys.length ||
      keys.some((key, index) =>
        index > 0 && keys[index - 1]!.localeCompare(key) >= 0
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "collector intents must have unique canonical ordering",
        path: ["intents"],
      });
    }
    const expectedReady = plan.intents.filter(
      (intent) => intent.disposition === "READY_FOR_RUNTIME_ADAPTER",
    ).length;
    if (plan.readyForRuntimeAdapterCount !== expectedReady) {
      context.addIssue({
        code: "custom",
        message: "ready adapter count does not match intents",
        path: ["readyForRuntimeAdapterCount"],
      });
    }
    const expectedTierCounts = emptyTierCounts();
    const expectedSourceCounts = emptySourceCounts();
    const expectedDispositionCounts = emptyDispositionCounts();
    const expectedTokens = emptySourceCounts();
    for (const intent of plan.intents) {
      expectedTierCounts[intent.tier] += 1;
      expectedSourceCounts[intent.collectionSourceId] += 1;
      expectedDispositionCounts[intent.disposition] += 1;
      expectedTokens[intent.collectionSourceId] +=
        intent.plannedRequestTokens;
    }
    for (const [path, actual, expected] of [
      ["countsByTier", plan.countsByTier, expectedTierCounts],
      ["countsBySource", plan.countsBySource, expectedSourceCounts],
      ["countsByDisposition", plan.countsByDisposition, expectedDispositionCounts],
      ["plannedRequestTokensBySource", plan.plannedRequestTokensBySource, expectedTokens],
    ] as const) {
      if (stableContentHash(actual) !== stableContentHash(expected)) {
        context.addIssue({
          code: "custom",
          message: `${path} does not match intents`,
          path: [path],
        });
      }
    }
    const core = adaptiveCollectorPlanCore(plan);
    const expectedHash = stableContentHash(core);
    if (plan.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "adaptive collector plan content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      plan.planId !== `adaptive-collector:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "adaptive collector plan id mismatch",
        path: ["planId"],
      });
    }
  });

export type M1AdaptiveCollectorPlan = z.infer<
  typeof M1AdaptiveCollectorPlanSchema
>;

type MutableIntent = Omit<M1AdaptiveCollectorIntent, "disposition"> & {
  disposition: (typeof M1_COLLECTOR_INTENT_DISPOSITIONS)[number];
};

type Tier = (typeof M1_COLLECTION_TIERS)[number];
type Disposition = (typeof M1_COLLECTOR_INTENT_DISPOSITIONS)[number];

function emptyTierCounts(): Record<Tier, number> {
  return {
    T0_CATALOG_EVENT: 0,
    T1_WIDE_MARKET: 0,
    T2_CANDIDATE_BURST: 0,
    T3_DEEP_VALIDATION: 0,
  };
}

function emptySourceCounts(): Record<M1SourceId, number> {
  return {
    BINANCE_FUTURES: 0,
    OKX_SWAP: 0,
    BYBIT_DERIVATIVES: 0,
    BITGET_FUTURES: 0,
    COINGLASS_V4: 0,
  };
}

function emptyDispositionCounts(): Record<Disposition, number> {
  return Object.fromEntries(
    M1_COLLECTOR_INTENT_DISPOSITIONS.map((value) => [value, 0]),
  ) as Record<Disposition, number>;
}

function adaptiveCollectorPlanCore(
  plan: z.input<typeof AdaptiveCollectorPlanCoreSchema> & {
    readonly planId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof AdaptiveCollectorPlanCoreSchema> {
  return AdaptiveCollectorPlanCoreSchema.parse({
    schemaVersion: plan.schemaVersion,
    scopeEpoch: plan.scopeEpoch,
    releaseId: plan.releaseId,
    generatedAt: plan.generatedAt,
    sourceCutoff: plan.sourceCutoff,
    registryDigest: plan.registryDigest,
    identitySnapshotHash: plan.identitySnapshotHash,
    subjectInputHash: plan.subjectInputHash,
    capabilityGrantSetHash: plan.capabilityGrantSetHash,
    quotaStateSetHash: plan.quotaStateSetHash,
    checkpointSetHash: plan.checkpointSetHash,
    policyHash: plan.policyHash,
    capabilityEvidenceClass: plan.capabilityEvidenceClass,
    subjectCount: plan.subjectCount,
    subjectDenominatorsByTier: plan.subjectDenominatorsByTier,
    intentCount: plan.intentCount,
    readyForRuntimeAdapterCount: plan.readyForRuntimeAdapterCount,
    countsByTier: plan.countsByTier,
    countsBySource: plan.countsBySource,
    countsByDisposition: plan.countsByDisposition,
    plannedRequestTokensBySource: plan.plannedRequestTokensBySource,
    intents: plan.intents,
    schedulerAuthority: plan.schedulerAuthority,
    runtimeExecutionAllowed: plan.runtimeExecutionAllowed,
    factAuthorityGranted: plan.factAuthorityGranted,
    candidateAuthorityGranted: plan.candidateAuthorityGranted,
    strategyAuthorityGranted: plan.strategyAuthorityGranted,
    readyAuthorityGranted: plan.readyAuthorityGranted,
    productionChanged: plan.productionChanged,
  });
}

function isEquityDomain(assetDomain: M1AssetDomain): boolean {
  return [
    "EQUITY_SINGLE_NAME_PERPETUAL",
    "EQUITY_INDEX_ETF_PERPETUAL",
    "EQUITY_CFD",
  ].includes(assetDomain);
}

function subjectTierEligible(
  subject: M1CollectorSubject,
  tier: Tier,
  subjects: readonly M1CollectorSubject[],
): boolean {
  if (tier === "T0_CATALOG_EVENT") {
    return true;
  }
  if (
    subject.coverageClass !== "SUPPORTED_DERIVATIVE" ||
    subject.identityStatus !== "EXACT" ||
    subject.eligibilityStatus !== "ELIGIBLE" ||
    !["TRADING_WARMUP", "ESTABLISHED"].includes(subject.lifecycleState)
  ) {
    return false;
  }
  if (tier === "T1_WIDE_MARKET") {
    return true;
  }
  if (subject.lifecycleState !== "ESTABLISHED") {
    return false;
  }
  if (tier === "T2_CANDIDATE_BURST") {
    return (
      ["P0", "P1"].includes(subject.candidatePriority) ||
      subject.matchedControlForEpisodeId !== null
    );
  }
  if (subject.deepValidationEpisodeId !== null) {
    return true;
  }
  return (
    subject.matchedControlForEpisodeId !== null &&
    subjects.some((candidate) =>
      candidate.candidateEpisodeId === subject.matchedControlForEpisodeId &&
      candidate.deepValidationEpisodeId !== null
    )
  );
}

function subjectTierDenominators(
  subjects: readonly M1CollectorSubject[],
): Record<Tier, number> {
  const counts = emptyTierCounts();
  for (const subject of subjects) {
    for (const tier of M1_COLLECTION_TIERS) {
      if (subjectTierEligible(subject, tier, subjects)) {
        counts[tier] += 1;
      }
    }
  }
  return counts;
}

function intentKey(input: {
  subjectId: string;
  sourceId: M1SourceId;
  tier: Tier;
  capabilityId: M1CapabilityId;
}): string {
  return [
    input.tier,
    input.sourceId,
    input.capabilityId,
    input.subjectId,
  ].join(":");
}

function liveGrantDisposition(
  grant: M1CollectorCapabilityGrant,
  generatedAt: string,
): { disposition: Disposition; reasonCodes: string[] } {
  if (grant.evidenceClass !== "LIVE_READ_ONLY") {
    return {
      disposition: "TEST_ONLY_NO_RUNTIME",
      reasonCodes: ["test_only_capability_cannot_enter_runtime"],
    };
  }
  if (grant.conformanceStatus === "FAIL") {
    return {
      disposition: "CAPABILITY_FAILED",
      reasonCodes: ["live_source_conformance_failed"],
    };
  }
  if (grant.conformanceStatus !== "PASS") {
    return {
      disposition: "CAPABILITY_NOT_LIVE",
      reasonCodes: ["live_source_conformance_not_run"],
    };
  }
  if (Date.parse(grant.expiresAt) <= Date.parse(generatedAt)) {
    return {
      disposition: "CAPABILITY_EXPIRED",
      reasonCodes: ["live_capability_evidence_expired"],
    };
  }
  const rightsAllowed = grant.sourceId === "COINGLASS_V4"
    ? grant.rightsStatus === "HOBBYIST_PERSONAL_ANALYTICS_ALLOWED"
    : grant.rightsStatus === "PUBLIC_PERSONAL_ANALYTICS_ALLOWED";
  if (!rightsAllowed) {
    return {
      disposition: "RIGHTS_BLOCKED",
      reasonCodes: [`rights_${grant.rightsStatus.toLowerCase()}`],
    };
  }
  const entitlementAllowed = grant.sourceId === "COINGLASS_V4"
    ? grant.entitlementStatus === "HOBBYIST_CONFIRMED"
    : grant.entitlementStatus === "PUBLIC_NO_KEY";
  if (!entitlementAllowed) {
    return {
      disposition: "ENTITLEMENT_BLOCKED",
      reasonCodes: [`entitlement_${grant.entitlementStatus.toLowerCase()}`],
    };
  }
  if (grant.jurisdictionAvailability !== "AVAILABLE") {
    return {
      disposition: "JURISDICTION_BLOCKED",
      reasonCodes: [
        `jurisdiction_${grant.jurisdictionAvailability.toLowerCase()}`,
      ],
    };
  }
  return {
    disposition: "READY_FOR_RUNTIME_ADAPTER",
    reasonCodes: [],
  };
}

function retryBackoffMs(
  checkpoint: M1CollectorCheckpoint,
  policy: M1AdaptiveCollectorPolicy,
): number {
  if (checkpoint.consecutiveFailures === 0) {
    return 0;
  }
  const exponent = Math.min(checkpoint.consecutiveFailures - 1, 20);
  return Math.min(
    policy.maxRetryBackoffMs,
    policy.baseRetryBackoffMs * 2 ** exponent,
  );
}

function checkpointDisposition(
  checkpoint: M1CollectorCheckpoint | undefined,
  tier: Tier,
  generatedAt: string,
  policy: M1AdaptiveCollectorPolicy,
): { disposition: Disposition; reasonCodes: string[] } | null {
  if (checkpoint === undefined) {
    return null;
  }
  const now = Date.parse(generatedAt);
  if (
    checkpoint.inFlightLeaseUntil !== null &&
    Date.parse(checkpoint.inFlightLeaseUntil) > now
  ) {
    return {
      disposition: "CHECKPOINT_INFLIGHT",
      reasonCodes: ["existing_intent_lease_is_active"],
    };
  }
  if (checkpoint.consecutiveFailures >= policy.maxConsecutiveFailures) {
    return {
      disposition: "RETRY_CIRCUIT_OPEN",
      reasonCodes: ["consecutive_failure_limit_reached"],
    };
  }
  if (
    checkpoint.consecutiveFailures > 0 &&
    checkpoint.lastAttemptAt !== null &&
    Date.parse(checkpoint.lastAttemptAt) +
        retryBackoffMs(checkpoint, policy) > now
  ) {
    return {
      disposition: "BACKOFF_DEFERRED",
      reasonCodes: ["retry_backoff_not_elapsed"],
    };
  }
  if (
    checkpoint.lastCompletedAt !== null &&
    Date.parse(checkpoint.lastCompletedAt) + policy.cadencesMs[tier] > now
  ) {
    return {
      disposition: "NOT_DUE",
      reasonCodes: ["collection_cadence_not_due"],
    };
  }
  return null;
}

function quotaDisposition(
  quota: M1CollectorQuotaState | undefined,
  generatedAt: string,
): { disposition: Disposition; reasonCodes: string[] } | null {
  if (quota === undefined) {
    return {
      disposition: "QUOTA_UNVERIFIED",
      reasonCodes: ["source_capability_quota_state_missing"],
    };
  }
  if (quota.evidenceClass !== "LIVE_READ_ONLY") {
    return {
      disposition: "QUOTA_UNVERIFIED",
      reasonCodes: ["test_only_quota_cannot_enter_runtime_planning"],
    };
  }
  const now = Date.parse(generatedAt);
  if (
    Date.parse(quota.windowStartedAt) > now ||
    Date.parse(quota.windowEndsAt) <= now
  ) {
    return {
      disposition: "QUOTA_UNVERIFIED",
      reasonCodes: ["source_capability_quota_window_not_current"],
    };
  }
  if (quota.status === "RATE_LIMITED") {
    return {
      disposition: "RATE_LIMITED",
      reasonCodes: ["provider_rate_limited_no_stale_fallback"],
    };
  }
  if (quota.status === "AUTH_ERROR") {
    return {
      disposition: "AUTH_ERROR",
      reasonCodes: ["provider_authentication_failed"],
    };
  }
  if (quota.status === "SOURCE_UNAVAILABLE") {
    return {
      disposition: "SOURCE_UNAVAILABLE",
      reasonCodes: ["provider_source_unavailable"],
    };
  }
  if (quota.requestsUsed + quota.requestsReserved >= quota.requestLimit) {
    return {
      disposition: "QUOTA_EXHAUSTED",
      reasonCodes: ["documented_request_budget_exhausted"],
    };
  }
  return null;
}

function registryDisposition(
  sourceId: M1SourceId,
  capabilityId: M1CapabilityId,
): { disposition: Disposition; reasonCodes: string[] } | null {
  const row = M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.rows.find(
    (candidate) =>
      candidate.sourceId === sourceId &&
      candidate.capabilityId === capabilityId,
  );
  if (
    row === undefined ||
    !["ADOPTED_AS_FACT", "DERIVED_WITH_LINEAGE"].includes(row.disposition)
  ) {
    return {
      disposition: "REGISTRY_DISPOSITION_BLOCKED",
      reasonCodes: [
        row === undefined
          ? "source_capability_registry_row_missing"
          : `registry_disposition_${row.disposition.toLowerCase()}`,
      ],
    };
  }
  return null;
}

function subjectBlock(
  subject: M1CollectorSubject,
  tier: Tier,
): { disposition: Disposition; reasonCodes: string[] } | null {
  if (tier === "T0_CATALOG_EVENT") {
    return null;
  }
  if (subject.identityStatus !== "EXACT") {
    return {
      disposition: "IDENTITY_UNRESOLVED",
      reasonCodes: ["exact_identity_required_for_market_collection"],
    };
  }
  if (
    subject.eligibilityStatus !== "ELIGIBLE" ||
    subject.coverageClass !== "SUPPORTED_DERIVATIVE"
  ) {
    return {
      disposition: "SUBJECT_NOT_ELIGIBLE",
      reasonCodes: ["eligible_derivative_required_for_t1_t3"],
    };
  }
  if (!["TRADING_WARMUP", "ESTABLISHED"].includes(subject.lifecycleState)) {
    return {
      disposition: "LIFECYCLE_BLOCKED",
      reasonCodes: [`lifecycle_${subject.lifecycleState.toLowerCase()}`],
    };
  }
  if (
    ["T2_CANDIDATE_BURST", "T3_DEEP_VALIDATION"].includes(tier) &&
    subject.lifecycleState !== "ESTABLISHED"
  ) {
    return {
      disposition: "LIFECYCLE_BLOCKED",
      reasonCodes: ["warmup_assets_cannot_enter_burst_or_deep_collection"],
    };
  }
  return null;
}

function applicableRegistryRows(
  subject: M1CollectorSubject,
  tier: Tier,
) {
  return M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.rows.filter((row) => {
    const capability = M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.capabilities
      .find((candidate) => candidate.capabilityId === row.capabilityId);
    if (capability === undefined || !capability.targetTiers.includes(tier)) {
      return false;
    }
    const sourceMatches =
      row.sourceId === subject.sourceId ||
      (tier === "T3_DEEP_VALIDATION" && row.sourceId === "COINGLASS_V4");
    if (!sourceMatches) {
      return false;
    }
    return (
      row.assetDomains.includes(subject.assetDomain) ||
      (
        tier === "T3_DEEP_VALIDATION" &&
        row.assetDomains.includes("CROSS_MARKET_CONTEXT")
      )
    );
  });
}

function evidenceClass(
  grants: readonly M1CollectorCapabilityGrant[],
): "NO_GRANTS" | "TEST_ONLY_OR_MIXED" | "LIVE_READ_ONLY_ONLY" {
  if (grants.length === 0) {
    return "NO_GRANTS";
  }
  return grants.every((grant) => grant.evidenceClass === "LIVE_READ_ONLY")
    ? "LIVE_READ_ONLY_ONLY"
    : "TEST_ONLY_OR_MIXED";
}

function sourceOrder(
  cursor: M1SourceId,
): readonly M1SourceId[] {
  const cursorIndex = M1_SOURCE_IDS.indexOf(cursor);
  return [
    ...M1_SOURCE_IDS.slice(cursorIndex),
    ...M1_SOURCE_IDS.slice(0, cursorIndex),
  ];
}

function readyOrdering(left: MutableIntent, right: MutableIntent): number {
  const tierPriority: Record<Tier, number> = {
    T0_CATALOG_EVENT: 0,
    T1_WIDE_MARKET: 1,
    T2_CANDIDATE_BURST: 2,
    T3_DEEP_VALIDATION: 3,
  };
  const rolePriority = (intent: MutableIntent): number =>
    intent.matchedControlForEpisodeId !== null
      ? 0
      : intent.candidateEpisodeId !== null
        ? 1
        : 2;
  return (
    tierPriority[left.tier] - tierPriority[right.tier] ||
    rolePriority(left) - rolePriority(right) ||
    left.intentKey.localeCompare(right.intentKey)
  );
}

function allocateReadyCapacity(
  intents: MutableIntent[],
  policy: M1AdaptiveCollectorPolicy,
  quotasByKey: ReadonlyMap<string, M1CollectorQuotaState>,
): void {
  const ready = intents.filter(
    (intent) => intent.disposition === "READY_FOR_RUNTIME_ADAPTER",
  );
  const baseline = ready
    .filter((intent) =>
      intent.tier === "T0_CATALOG_EVENT" ||
      intent.tier === "T1_WIDE_MARKET"
    )
    .sort(readyOrdering);
  const burst = ready
    .filter((intent) =>
      intent.tier === "T2_CANDIDATE_BURST" ||
      intent.tier === "T3_DEEP_VALIDATION"
    )
    .sort(readyOrdering);
  const selected = new Set<string>();
  const perSource = emptySourceCounts();
  const perSubjectBurst = new Map<string, number>();
  const order = sourceOrder(policy.fairnessCursorSource);
  const remainingByQuotaKey = new Map<string, number>();
  for (const [key, quota] of quotasByKey) {
    remainingByQuotaKey.set(
      key,
      quota.requestLimit - quota.requestsUsed - quota.requestsReserved,
    );
  }

  const selectPhase = (
    candidates: readonly MutableIntent[],
    maxAdditional: number,
  ): void => {
    const pools = new Map<M1SourceId, MutableIntent[]>();
    for (const sourceId of M1_SOURCE_IDS) {
      pools.set(sourceId, []);
    }
    for (const intent of candidates) {
      if (!selected.has(intent.intentKey)) {
        pools.get(intent.collectionSourceId)!.push(intent);
      }
    }
    let added = 0;
    let progressed = true;
    while (
      selected.size < policy.maxReadyIntents &&
      added < maxAdditional &&
      progressed
    ) {
      progressed = false;
      for (const sourceId of order) {
        if (
          selected.size >= policy.maxReadyIntents ||
          added >= maxAdditional ||
          perSource[sourceId] >= policy.maxReadyIntentsPerSource
        ) {
          continue;
        }
        const pool = pools.get(sourceId)!;
        while (pool.length > 0) {
          const candidate = pool.shift()!;
          const burstIntent = [
            "T2_CANDIDATE_BURST",
            "T3_DEEP_VALIDATION",
          ].includes(candidate.tier);
          const currentBurst = perSubjectBurst.get(candidate.subjectId) ?? 0;
          if (
            burstIntent &&
            currentBurst >= policy.maxBurstIntentsPerSubject
          ) {
            candidate.disposition = "BACKPRESSURE_DEFERRED";
            candidate.reasonCodes = ["per_subject_burst_limit_reached"];
            candidate.plannedRequestTokens = 0;
            continue;
          }
          const quotaKey =
            `${candidate.collectionSourceId}:${candidate.capabilityId}`;
          const remaining = remainingByQuotaKey.get(quotaKey) ?? 0;
          if (remaining <= 0) {
            candidate.disposition = "QUOTA_EXHAUSTED";
            candidate.reasonCodes = [
              "bounded_plan_would_exceed_request_budget",
            ];
            candidate.plannedRequestTokens = 0;
            continue;
          }
          selected.add(candidate.intentKey);
          perSource[sourceId] += 1;
          remainingByQuotaKey.set(quotaKey, remaining - 1);
          if (burstIntent) {
            perSubjectBurst.set(candidate.subjectId, currentBurst + 1);
          }
          added += 1;
          progressed = true;
          break;
        }
      }
    }
  };

  const baselineReserve = Math.min(
    baseline.length,
    policy.baselineReservedSlots,
    policy.maxReadyIntents,
  );
  selectPhase(baseline, baselineReserve);
  selectPhase(burst, policy.maxReadyIntents - selected.size);
  selectPhase(baseline, policy.maxReadyIntents - selected.size);

  for (const intent of ready) {
    if (
      !selected.has(intent.intentKey) &&
      intent.disposition === "READY_FOR_RUNTIME_ADAPTER"
    ) {
      intent.disposition = "BACKPRESSURE_DEFERRED";
      intent.reasonCodes = ["bounded_ready_capacity_exhausted"];
      intent.plannedRequestTokens = 0;
    }
  }
}

function enforceControlReadiness(
  intents: MutableIntent[],
  subjects: readonly M1CollectorSubject[],
): void {
  const controlEpisodes = new Set<string>();
  for (const subject of subjects) {
    if (subject.matchedControlForEpisodeId !== null) {
      controlEpisodes.add(subject.matchedControlForEpisodeId);
    }
  }
  const readyControlCapabilities = new Set(
    intents
      .filter((intent) =>
        intent.matchedControlForEpisodeId !== null &&
        intent.disposition === "READY_FOR_RUNTIME_ADAPTER"
      )
      .map((intent) => [
        intent.matchedControlForEpisodeId,
        intent.tier,
        intent.capabilityId,
      ].join(":")),
  );
  for (const intent of intents) {
    const episodeId = intent.candidateEpisodeId;
    if (
      episodeId === null ||
      !["T2_CANDIDATE_BURST", "T3_DEEP_VALIDATION"].includes(intent.tier)
    ) {
      continue;
    }
    if (!controlEpisodes.has(episodeId)) {
      intent.disposition = "CONTROL_MISSING";
      intent.reasonCodes = ["candidate_episode_has_no_matched_control"];
      intent.plannedRequestTokens = 0;
      continue;
    }
    if (intent.disposition !== "READY_FOR_RUNTIME_ADAPTER") {
      continue;
    }
    const controlKey = [
      episodeId,
      intent.tier,
      intent.capabilityId,
    ].join(":");
    if (!readyControlCapabilities.has(controlKey)) {
      intent.disposition = "CONTROL_NOT_READY";
      intent.reasonCodes = ["matched_control_capability_not_ready"];
      intent.plannedRequestTokens = 0;
    }
  }
}

function hasLiveEquityPrerequisites(
  subject: M1CollectorSubject,
  grants: readonly M1CollectorCapabilityGrant[],
  generatedAt: string,
): boolean {
  if (!isEquityDomain(subject.assetDomain)) {
    return true;
  }
  return [
    "EQUITY_SESSION_REFERENCE",
    "EQUITY_CORPORATE_ACTION",
  ].every((capabilityId) =>
    grants.some((grant) =>
      grant.sourceId === subject.sourceId &&
      grant.capabilityId === capabilityId &&
      grant.assetDomains.includes(subject.assetDomain) &&
      liveGrantDisposition(grant, generatedAt).disposition ===
        "READY_FOR_RUNTIME_ADAPTER"
    )
  );
}

function buildIntent(
  subject: M1CollectorSubject,
  tier: Tier,
  sourceId: M1SourceId,
  capabilityId: M1CapabilityId,
  input: z.infer<typeof PlanInputSchema>,
  grantsByKey: ReadonlyMap<string, readonly M1CollectorCapabilityGrant[]>,
  quotasByKey: ReadonlyMap<string, M1CollectorQuotaState>,
  checkpointsByKey: ReadonlyMap<string, M1CollectorCheckpoint>,
): MutableIntent {
  const key = intentKey({
    subjectId: subject.subjectId,
    sourceId,
    tier,
    capabilityId,
  });
  const base: MutableIntent = {
    intentKey: key,
    subjectId: subject.subjectId,
    subjectSourceId: subject.sourceId,
    collectionSourceId: sourceId,
    assetDomain: subject.assetDomain,
    tier,
    capabilityId,
    candidateEpisodeId: subject.candidateEpisodeId,
    matchedControlForEpisodeId: subject.matchedControlForEpisodeId,
    deepValidationEpisodeId: subject.deepValidationEpisodeId,
    disposition: "CAPABILITY_NOT_LIVE",
    reasonCodes: [],
    grantId: null,
    quotaWindowEndsAt: null,
    plannedRequestTokens: 0,
    runtimeExecutionAllowed: false,
    factAuthorityGranted: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
  };

  const subjectBlocked = subjectBlock(subject, tier);
  if (subjectBlocked !== null) {
    return { ...base, ...subjectBlocked };
  }
  const registryBlocked = registryDisposition(sourceId, capabilityId);
  if (registryBlocked !== null) {
    return { ...base, ...registryBlocked };
  }
  if (
    tier !== "T0_CATALOG_EVENT" &&
    !hasLiveEquityPrerequisites(
      subject,
      input.capabilityGrants,
      input.generatedAt,
    )
  ) {
    return {
      ...base,
      disposition: "EQUITY_REFERENCE_BLOCKED",
      reasonCodes: [
        "equity_session_and_corporate_action_capabilities_required",
      ],
    };
  }
  const grants = grantsByKey.get(`${sourceId}:${capabilityId}`) ?? [];
  const applicableGrants = grants.filter((grant) =>
    grant.assetDomains.includes(subject.assetDomain) ||
    (
      tier === "T3_DEEP_VALIDATION" &&
      grant.assetDomains.includes("CROSS_MARKET_CONTEXT")
    )
  );
  if (applicableGrants.length === 0) {
    return {
      ...base,
      disposition: "CAPABILITY_NOT_LIVE",
      reasonCodes: ["no_capability_grant_for_subject_domain"],
    };
  }
  if (applicableGrants.length > 1) {
    return {
      ...base,
      disposition: "CAPABILITY_GRANT_CONFLICT",
      reasonCodes: ["multiple_capability_grants_for_subject_domain"],
    };
  }
  const grant = applicableGrants[0]!;
  const grantDisposition = liveGrantDisposition(grant, input.generatedAt);
  if (grantDisposition.disposition !== "READY_FOR_RUNTIME_ADAPTER") {
    return {
      ...base,
      ...grantDisposition,
      grantId: grant.grantId,
    };
  }
  const quota = quotasByKey.get(`${sourceId}:${capabilityId}`);
  const quotaBlocked = quotaDisposition(quota, input.generatedAt);
  if (quotaBlocked !== null) {
    return {
      ...base,
      ...quotaBlocked,
      grantId: grant.grantId,
      quotaWindowEndsAt: quota?.windowEndsAt ?? null,
    };
  }
  const checkpointBlocked = checkpointDisposition(
    checkpointsByKey.get(key),
    tier,
    input.generatedAt,
    input.policy,
  );
  if (checkpointBlocked !== null) {
    return {
      ...base,
      ...checkpointBlocked,
      grantId: grant.grantId,
      quotaWindowEndsAt: quota!.windowEndsAt,
    };
  }
  return {
    ...base,
    disposition: "READY_FOR_RUNTIME_ADAPTER",
    reasonCodes: [],
    grantId: grant.grantId,
    quotaWindowEndsAt: quota!.windowEndsAt,
    plannedRequestTokens: 1,
  };
}

export function buildM1AdaptiveCollectorPlan(
  rawInput: M1AdaptiveCollectorPlanInput,
): M1AdaptiveCollectorPlan {
  const input = PlanInputSchema.parse(rawInput);
  if (input.registryDigest !==
    M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest) {
    throw new Error("adaptive collector registry digest mismatch");
  }
  if (Date.parse(input.sourceCutoff) > Date.parse(input.generatedAt)) {
    throw new Error("adaptive collector source cutoff is in the future");
  }
  const subjectIds = input.subjects.map((subject) => subject.subjectId);
  if (new Set(subjectIds).size !== subjectIds.length) {
    throw new Error("adaptive collector subjects must be unique");
  }
  const venueInstrumentKeys = input.subjects.map((subject) =>
    `${subject.sourceId}:${subject.venueInstrumentId}`
  );
  if (new Set(venueInstrumentKeys).size !== venueInstrumentKeys.length) {
    throw new Error(
      "adaptive collector venue instrument subjects must be unique",
    );
  }
  const canonicalIds = input.subjects
    .map((subject) => subject.canonicalInstrumentId)
    .filter((value): value is string => value !== null);
  if (new Set(canonicalIds).size !== canonicalIds.length) {
    throw new Error(
      "adaptive collector canonical instrument subjects must be unique",
    );
  }
  const candidateEpisodeIds = input.subjects
    .map((subject) => subject.candidateEpisodeId)
    .filter((value): value is string => value !== null);
  if (new Set(candidateEpisodeIds).size !== candidateEpisodeIds.length) {
    throw new Error("adaptive collector candidate episodes must be unique");
  }
  const deepEpisodeIds = input.subjects
    .map((subject) => subject.deepValidationEpisodeId)
    .filter((value): value is string => value !== null);
  if (new Set(deepEpisodeIds).size !== deepEpisodeIds.length) {
    throw new Error(
      "adaptive collector deep-validation episodes must be unique",
    );
  }
  const candidatesByEpisode = new Map(
    input.subjects
      .filter((candidate) => candidate.candidateEpisodeId !== null)
      .map((candidate) => [candidate.candidateEpisodeId!, candidate]),
  );
  for (const control of input.subjects.filter(
    (candidate) => candidate.matchedControlForEpisodeId !== null,
  )) {
    const candidate = candidatesByEpisode.get(
      control.matchedControlForEpisodeId!,
    );
    if (candidate === undefined) {
      throw new Error(
        "adaptive collector matched control has no candidate episode",
      );
    }
    if (candidate.assetDomain !== control.assetDomain) {
      throw new Error(
        "adaptive collector matched control asset domain mismatch",
      );
    }
  }
  for (const subject of input.subjects) {
    const participatesInCandidateEvaluation =
      subject.candidateEpisodeId !== null ||
      subject.matchedControlForEpisodeId !== null ||
      subject.deepValidationEpisodeId !== null;
    if (
      participatesInCandidateEvaluation &&
      (
        subject.coverageClass !== "SUPPORTED_DERIVATIVE" ||
        subject.identityStatus !== "EXACT" ||
        subject.eligibilityStatus !== "ELIGIBLE" ||
        subject.lifecycleState !== "ESTABLISHED"
      )
    ) {
      throw new Error(
        "adaptive collector candidate and control subjects require an " +
          "exact eligible established derivative identity",
      );
    }
  }
  if (
    input.subjects.some((subject) =>
      Date.parse(subject.observedAt) > Date.parse(input.sourceCutoff)
    )
  ) {
    throw new Error("adaptive collector subject knowledge exceeds source cutoff");
  }
  if (
    input.capabilityGrants.some((grant) =>
      grant.releaseId !== input.releaseId ||
      Date.parse(grant.observedAt) > Date.parse(input.sourceCutoff)
    )
  ) {
    throw new Error("adaptive collector capability grant lineage mismatch");
  }

  const grantsByKey = new Map<string, M1CollectorCapabilityGrant[]>();
  for (const grant of input.capabilityGrants) {
    const key = `${grant.sourceId}:${grant.capabilityId}`;
    const existing = grantsByKey.get(key) ?? [];
    existing.push(grant);
    grantsByKey.set(key, existing);
  }
  const quotasByKey = new Map<string, M1CollectorQuotaState>();
  for (const quota of input.quotaStates) {
    const key = `${quota.sourceId}:${quota.capabilityId}`;
    if (quotasByKey.has(key)) {
      throw new Error(`duplicate adaptive collector quota state: ${key}`);
    }
    if (
      quota.releaseId !== input.releaseId ||
      Date.parse(quota.observedAt) > Date.parse(input.sourceCutoff) ||
      Date.parse(quota.windowStartedAt) > Date.parse(input.generatedAt)
    ) {
      throw new Error("adaptive collector quota lineage exceeds cutoff");
    }
    quotasByKey.set(key, quota);
  }
  const checkpointsByKey = new Map<string, M1CollectorCheckpoint>();
  for (const checkpoint of input.checkpoints) {
    if (checkpointsByKey.has(checkpoint.intentKey)) {
      throw new Error(
        `duplicate adaptive collector checkpoint: ${checkpoint.intentKey}`,
      );
    }
    if (
      (
        checkpoint.lastCompletedAt !== null &&
        Date.parse(checkpoint.lastCompletedAt) >
          Date.parse(input.generatedAt)
      ) ||
      (
        checkpoint.lastAttemptAt !== null &&
        Date.parse(checkpoint.lastAttemptAt) >
          Date.parse(input.generatedAt)
      )
    ) {
      throw new Error("adaptive collector checkpoint contains future history");
    }
    checkpointsByKey.set(checkpoint.intentKey, checkpoint);
  }

  const intents: MutableIntent[] = [];
  for (const subject of [...input.subjects].sort((left, right) =>
    left.subjectId.localeCompare(right.subjectId)
  )) {
    for (const tier of M1_COLLECTION_TIERS) {
      if (!subjectTierEligible(subject, tier, input.subjects)) {
        continue;
      }
      const rows = applicableRegistryRows(subject, tier);
      if (rows.length === 0) {
        throw new Error(
          `adaptive collector has no registry accounting rows for ` +
            `${subject.subjectId}:${tier}`,
        );
      }
      for (const row of rows) {
        intents.push(buildIntent(
          subject,
          tier,
          row.sourceId,
          row.capabilityId,
          input,
          grantsByKey,
          quotasByKey,
          checkpointsByKey,
        ));
      }
    }
  }
  if (intents.length > input.policy.maxIntentRows) {
    throw new Error(
      `adaptive collector intent denominator ${intents.length} exceeds ` +
        `the bounded plan limit ${input.policy.maxIntentRows}`,
    );
  }

  allocateReadyCapacity(intents, input.policy, quotasByKey);
  enforceControlReadiness(intents, input.subjects);
  const parsedIntents = intents
    .sort((left, right) => left.intentKey.localeCompare(right.intentKey))
    .map((intent) => M1AdaptiveCollectorIntentSchema.parse(intent));
  const countsByTier = emptyTierCounts();
  const countsBySource = emptySourceCounts();
  const countsByDisposition = emptyDispositionCounts();
  const plannedRequestTokensBySource = emptySourceCounts();
  for (const intent of parsedIntents) {
    countsByTier[intent.tier] += 1;
    countsBySource[intent.collectionSourceId] += 1;
    countsByDisposition[intent.disposition] += 1;
    plannedRequestTokensBySource[intent.collectionSourceId] +=
      intent.plannedRequestTokens;
  }
  const core = adaptiveCollectorPlanCore({
    schemaVersion: M1_ADAPTIVE_COLLECTOR_PLAN_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: input.releaseId,
    generatedAt: input.generatedAt,
    sourceCutoff: input.sourceCutoff,
    registryDigest: input.registryDigest,
    identitySnapshotHash: input.identitySnapshotHash,
    subjectInputHash: stableContentHash(
      [...input.subjects].sort((left, right) =>
        left.subjectId.localeCompare(right.subjectId)
      ),
    ),
    capabilityGrantSetHash: stableContentHash(
      [...input.capabilityGrants].sort((left, right) =>
        left.grantId.localeCompare(right.grantId)
      ),
    ),
    quotaStateSetHash: stableContentHash(
      [...input.quotaStates].sort((left, right) =>
        `${left.sourceId}:${left.capabilityId}`.localeCompare(
          `${right.sourceId}:${right.capabilityId}`,
        )
      ),
    ),
    checkpointSetHash: stableContentHash(
      [...input.checkpoints].sort((left, right) =>
        left.intentKey.localeCompare(right.intentKey)
      ),
    ),
    policyHash: stableContentHash(input.policy),
    capabilityEvidenceClass: evidenceClass(input.capabilityGrants),
    subjectCount: input.subjects.length,
    subjectDenominatorsByTier: subjectTierDenominators(input.subjects),
    intentCount: parsedIntents.length,
    readyForRuntimeAdapterCount:
      countsByDisposition.READY_FOR_RUNTIME_ADAPTER,
    countsByTier,
    countsBySource,
    countsByDisposition,
    plannedRequestTokensBySource,
    intents: parsedIntents,
    schedulerAuthority: "CONTRACT_ONLY_NO_RUNTIME_EXECUTION_AUTHORITY",
    runtimeExecutionAllowed: false,
    factAuthorityGranted: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1AdaptiveCollectorPlanSchema.parse({
    ...core,
    planId: `adaptive-collector:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}
