import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  RatioSchema,
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
import {
  M1RuntimeAdapterLiveArtifactSchema,
  type M1RuntimeAdapterLiveArtifact,
} from "../collector/runtime-adapter-live";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";

export const M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION =
  "v2-m1-multi-asset-shadow-upstream.v1" as const;
export const M1_MULTI_ASSET_SHADOW_CYCLE_VERSION =
  "v2-m1-multi-asset-shadow-cycle.v3" as const;
export const M1_MULTI_ASSET_SHADOW_EVIDENCE_VERSION =
  "v2-m1-multi-asset-shadow-evidence.v1" as const;

export const M1_MULTI_ASSET_SHADOW_PROFILE = deepFreezeArtifact({
  cycleCount: 31,
  cadenceMs: 60_000,
  maxCycleDurationMs: 30_000,
  maxScheduleLagMs: 5_000,
  maxRssBytes: 512 * 1024 * 1024,
  minObservationMs: 30 * 60_000,
  minCollectionCoverageRatio: 1,
  minFreshCoverageRatio: 1,
  maxProviderFailureCount: 0,
  maxMissedStartCount: 0,
  checkpointRequired: true,
  persistenceRequired: true,
  fullVenueAccountingRequired: true,
  fullAssetDomainAccountingRequired: true,
  fullLifecycleAccountingRequired: true,
  equityTradableFactRequiredForFullPass: true,
  noScopeShrinkAllowed: true,
  noStalePromotionAllowed: true,
  noAuthority: true,
} as const);

export const M1_MULTI_ASSET_SHADOW_AXIS_IDS = [
  "BITGET_VENUE",
  "LISTING_LIFECYCLE",
  "EQUITY_ASSET_DOMAIN",
  "DATA_MAXIMIZATION",
] as const;

export const M1_MULTI_ASSET_SHADOW_ASSET_DOMAIN_BUCKETS = [
  ...M1_ASSET_DOMAINS,
  "UNRESOLVED",
] as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const UniqueReasonsSchema = ReasonCodesSchema.superRefine(
  (reasons, context) => {
    if (new Set(reasons).size !== reasons.length) {
      context.addIssue({
        code: "custom",
        message: "reason codes must be unique",
      });
    }
  },
);

const UpstreamAxisSchema = z.strictObject({
  axisId: z.enum(M1_MULTI_ASSET_SHADOW_AXIS_IDS),
  routeGateStatus: z.enum(["PASS", "BLOCKED"]),
  axisEvidenceId: NonEmptyStringSchema,
  contentHash: DigestSchema,
});

const UpstreamCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  runtimeAdapterArtifactId: NonEmptyStringSchema,
  runtimeAdapterArtifactHash: DigestSchema,
  conformanceArtifactId: NonEmptyStringSchema,
  conformanceArtifactHash: DigestSchema,
  registryDigest: DigestSchema,
  profileSetHash: DigestSchema,
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  networkEnvironment: z.enum([
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  runtimeAdapterStatus: z.enum([
    "PASS_BOUNDED_ROUTE_SEGMENT_NO_AUTHORITY",
    "BLOCKED_ROUTE_SEGMENT_NO_STALE_PROMOTION",
    "TEST_ONLY_NOT_LIVE_EVIDENCE",
  ]),
  liveConformantProfileCount: z.literal(15),
  routeEligibleProfileCount: z.literal(14),
  registryBlockedProfileCount: z.literal(1),
  listingCheckpointCommittedCount: z.literal(2),
  listingGapCount: z.literal(0),
  acceptanceAxes: z.array(UpstreamAxisSchema).length(4),
  authorityGranted: z.literal(false),
  productionChanged: z.literal(false),
  secretMaterialPresent: z.literal(false),
});

export const M1MultiAssetShadowUpstreamBindingSchema =
  UpstreamCoreSchema.extend({
    upstreamBindingId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((binding, context) => {
    if (
      binding.acceptanceAxes.some(
        (axis, index) =>
          axis.axisId !== M1_MULTI_ASSET_SHADOW_AXIS_IDS[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "upstream acceptance axes must remain complete and ordered",
        path: ["acceptanceAxes"],
      });
    }
    const livePass =
      binding.evidenceClass === "LIVE_READ_ONLY" &&
      binding.networkEnvironment === "TENCENT_ISOLATED_READ_ONLY" &&
      binding.runtimeAdapterStatus ===
        "PASS_BOUNDED_ROUTE_SEGMENT_NO_AUTHORITY" &&
      binding.acceptanceAxes.every((axis) => axis.routeGateStatus === "PASS");
    const testOnly =
      binding.evidenceClass === "TEST_ONLY" &&
      binding.networkEnvironment === "TEST_HARNESS" &&
      binding.runtimeAdapterStatus === "TEST_ONLY_NOT_LIVE_EVIDENCE";
    if (!livePass && !testOnly) {
      context.addIssue({
        code: "custom",
        message: "upstream binding cannot promote blocked or mixed evidence",
        path: ["runtimeAdapterStatus"],
      });
    }
    const expectedHash = stableContentHash(upstreamCore(binding));
    if (binding.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "upstream binding content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      binding.upstreamBindingId !==
        `m1-shadow-upstream:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "upstream binding id mismatch",
        path: ["upstreamBindingId"],
      });
    }
  });

export type M1MultiAssetShadowUpstreamBinding = z.infer<
  typeof M1MultiAssetShadowUpstreamBindingSchema
>;

function upstreamCore(
  value: z.input<typeof UpstreamCoreSchema> & {
    readonly upstreamBindingId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof UpstreamCoreSchema> {
  return UpstreamCoreSchema.parse({
    schemaVersion: value.schemaVersion,
    scopeEpoch: value.scopeEpoch,
    releaseId: value.releaseId,
    generatedAt: value.generatedAt,
    sourceCutoff: value.sourceCutoff,
    runtimeAdapterArtifactId: value.runtimeAdapterArtifactId,
    runtimeAdapterArtifactHash: value.runtimeAdapterArtifactHash,
    conformanceArtifactId: value.conformanceArtifactId,
    conformanceArtifactHash: value.conformanceArtifactHash,
    registryDigest: value.registryDigest,
    profileSetHash: value.profileSetHash,
    evidenceClass: value.evidenceClass,
    networkEnvironment: value.networkEnvironment,
    runtimeAdapterStatus: value.runtimeAdapterStatus,
    liveConformantProfileCount: value.liveConformantProfileCount,
    routeEligibleProfileCount: value.routeEligibleProfileCount,
    registryBlockedProfileCount: value.registryBlockedProfileCount,
    listingCheckpointCommittedCount:
      value.listingCheckpointCommittedCount,
    listingGapCount: value.listingGapCount,
    acceptanceAxes: value.acceptanceAxes,
    authorityGranted: value.authorityGranted,
    productionChanged: value.productionChanged,
    secretMaterialPresent: value.secretMaterialPresent,
  });
}

export function buildM1MultiAssetShadowUpstreamBinding(
  artifactInput: M1RuntimeAdapterLiveArtifact,
): M1MultiAssetShadowUpstreamBinding {
  const artifact = M1RuntimeAdapterLiveArtifactSchema.parse(artifactInput);
  const core = upstreamCore({
    schemaVersion: M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: artifact.runtimeReleaseId,
    generatedAt: artifact.generatedAt,
    sourceCutoff: artifact.sourceCutoff,
    runtimeAdapterArtifactId: artifact.artifactId,
    runtimeAdapterArtifactHash: artifact.contentHash,
    conformanceArtifactId: artifact.conformanceArtifactId,
    conformanceArtifactHash: artifact.conformanceArtifactHash,
    registryDigest: artifact.registryDigest,
    profileSetHash: artifact.profileSetHash,
    evidenceClass: artifact.evidenceClass,
    networkEnvironment: artifact.networkEnvironment,
    runtimeAdapterStatus: artifact.status,
    liveConformantProfileCount: artifact.liveConformantProfileCount,
    routeEligibleProfileCount: artifact.routeEligibleProfileCount,
    registryBlockedProfileCount: artifact.registryBlockedProfileCount,
    listingCheckpointCommittedCount: 2,
    listingGapCount: 0,
    acceptanceAxes: artifact.acceptanceAxes.map((axis) => ({
      axisId: axis.axisId,
      routeGateStatus: axis.routeGateStatus,
      axisEvidenceId: axis.axisEvidenceId,
      contentHash: axis.contentHash,
    })),
    authorityGranted: false,
    productionChanged: artifact.productionChanged,
    secretMaterialPresent: artifact.secretMaterialPresent,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1MultiAssetShadowUpstreamBindingSchema.parse({
    ...core,
    upstreamBindingId: `m1-shadow-upstream:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}

const VenueAccountingSchema = z.strictObject({
  venue: z.enum(M1_VENUE_SOURCE_IDS),
  observedSubjectCount: NonNegativeIntegerSchema,
  exactIdentityCount: NonNegativeIntegerSchema,
  partialIdentityCount: NonNegativeIntegerSchema,
  unresolvedIdentityCount: NonNegativeIntegerSchema,
  routeEligibleCount: NonNegativeIntegerSchema,
  routeBlockedCount: NonNegativeIntegerSchema,
  scheduledCount: NonNegativeIntegerSchema,
  notScheduledCount: NonNegativeIntegerSchema,
  attemptedCount: NonNegativeIntegerSchema,
  notAttemptedCount: NonNegativeIntegerSchema,
  collectedCount: NonNegativeIntegerSchema,
  freshCount: NonNegativeIntegerSchema,
  partialCount: NonNegativeIntegerSchema,
  staleCount: NonNegativeIntegerSchema,
  unavailableCount: NonNegativeIntegerSchema,
  providerFailureCount: NonNegativeIntegerSchema,
  reasonCodes: UniqueReasonsSchema,
}).superRefine((row, context) => {
  const inconsistent =
    row.observedSubjectCount !==
      row.routeEligibleCount + row.routeBlockedCount ||
    row.observedSubjectCount !==
      row.exactIdentityCount +
        row.partialIdentityCount +
        row.unresolvedIdentityCount ||
    row.routeBlockedCount < row.unresolvedIdentityCount ||
    row.scheduledCount + row.notScheduledCount !== row.routeEligibleCount ||
    row.attemptedCount + row.notAttemptedCount !== row.scheduledCount ||
    row.collectedCount + row.unavailableCount !== row.attemptedCount ||
    row.freshCount + row.partialCount + row.staleCount !== row.collectedCount ||
    row.providerFailureCount > row.unavailableCount;
  if (inconsistent) {
    context.addIssue({
      code: "custom",
      message: "venue accounting denominator does not reconcile",
    });
  }
  const hasNonFreshOrBlocked =
    row.routeBlockedCount > 0 ||
    row.notScheduledCount > 0 ||
    row.notAttemptedCount > 0 ||
    row.partialCount > 0 ||
    row.staleCount > 0 ||
    row.unavailableCount > 0 ||
    row.providerFailureCount > 0;
  if (hasNonFreshOrBlocked && row.reasonCodes.length === 0) {
    context.addIssue({
      code: "custom",
      message: "non-perfect venue accounting requires reason codes",
      path: ["reasonCodes"],
    });
  }
});

export type M1MultiAssetShadowVenueAccounting = z.infer<
  typeof VenueAccountingSchema
>;

const DimensionCountsSchema = z.strictObject({
  observedSubjectCount: NonNegativeIntegerSchema,
  routeEligibleCount: NonNegativeIntegerSchema,
  collectedFactCount: NonNegativeIntegerSchema,
  freshFactCount: NonNegativeIntegerSchema,
  status: z.enum(["FRESH", "PARTIAL", "BLOCKED", "OBSERVED_ZERO"]),
  reasonCodes: UniqueReasonsSchema,
}).superRefine((row, context) => {
  if (
    row.routeEligibleCount > row.observedSubjectCount ||
    row.collectedFactCount > row.routeEligibleCount ||
    row.freshFactCount > row.collectedFactCount
  ) {
    context.addIssue({
      code: "custom",
      message: "dimension accounting denominator does not reconcile",
    });
  }
  const expectedStatus = row.observedSubjectCount === 0
    ? "OBSERVED_ZERO"
    : row.routeEligibleCount === 0
      ? "BLOCKED"
      : (
          row.collectedFactCount < row.routeEligibleCount ||
          row.freshFactCount < row.collectedFactCount
        )
        ? "PARTIAL"
        : "FRESH";
  if (row.status !== expectedStatus) {
    context.addIssue({
      code: "custom",
      message: "dimension status overstates observed accounting",
      path: ["status"],
    });
  }
  if (row.status !== "FRESH" && row.reasonCodes.length === 0) {
    context.addIssue({
      code: "custom",
      message: "non-fresh dimension accounting requires reason codes",
      path: ["reasonCodes"],
    });
  }
});

const AssetDomainAccountingSchema = DimensionCountsSchema.and(
  z.strictObject({
    assetDomain: z.enum(M1_MULTI_ASSET_SHADOW_ASSET_DOMAIN_BUCKETS),
  }),
);

const LifecycleAccountingSchema = DimensionCountsSchema.and(
  z.strictObject({
    lifecycleState: z.enum(M1_LISTING_LIFECYCLE_STATES),
  }),
);

const AggregateAccountingSchema = z.strictObject({
  observedSubjectCount: NonNegativeIntegerSchema,
  exactIdentityCount: NonNegativeIntegerSchema,
  partialIdentityCount: NonNegativeIntegerSchema,
  unresolvedIdentityCount: NonNegativeIntegerSchema,
  routeEligibleCount: NonNegativeIntegerSchema,
  routeBlockedCount: NonNegativeIntegerSchema,
  scheduledCount: NonNegativeIntegerSchema,
  notScheduledCount: NonNegativeIntegerSchema,
  attemptedCount: NonNegativeIntegerSchema,
  notAttemptedCount: NonNegativeIntegerSchema,
  collectedCount: NonNegativeIntegerSchema,
  freshCount: NonNegativeIntegerSchema,
  partialCount: NonNegativeIntegerSchema,
  staleCount: NonNegativeIntegerSchema,
  unavailableCount: NonNegativeIntegerSchema,
  providerFailureCount: NonNegativeIntegerSchema,
  collectionCoverageRatio: RatioSchema.nullable(),
  freshCoverageRatio: RatioSchema.nullable(),
});

const AxisAssessmentSchema = z.strictObject({
  axisId: z.enum(M1_MULTI_ASSET_SHADOW_AXIS_IDS),
  status: z.enum(["PASS", "BLOCKED"]),
  reasonCodes: UniqueReasonsSchema,
}).superRefine((axis, context) => {
  if (axis.status === "BLOCKED" && axis.reasonCodes.length === 0) {
    context.addIssue({
      code: "custom",
      message: "blocked axes require reason codes",
      path: ["reasonCodes"],
    });
  }
});

const ListingCheckpointAccountingSchema = z.strictObject({
  requiredCount: z.literal(2),
  bindingCount: NonNegativeIntegerSchema,
  healthyCount: NonNegativeIntegerSchema,
  unhealthyOrMissingCount: NonNegativeIntegerSchema,
  status: z.enum(["PASS", "BLOCKED"]),
  reasonCodes: UniqueReasonsSchema,
}).superRefine((listing, context) => {
  const pass =
    listing.bindingCount === listing.requiredCount &&
    listing.healthyCount === listing.requiredCount &&
    listing.unhealthyOrMissingCount === 0;
  if (
    listing.healthyCount > listing.bindingCount ||
    listing.unhealthyOrMissingCount !==
      listing.requiredCount - listing.healthyCount ||
    listing.status !== (pass ? "PASS" : "BLOCKED") ||
    (!pass && listing.reasonCodes.length === 0)
  ) {
    context.addIssue({
      code: "custom",
      message: "listing checkpoint accounting or Gate disagrees",
    });
  }
});

const CycleInputSchema = z.strictObject({
  releaseId: ReleaseIdSchema,
  upstreamBindingId: NonEmptyStringSchema,
  upstreamBindingHash: DigestSchema,
  catalogCaptureBindingId: NonEmptyStringSchema,
  catalogCaptureBindingHash: DigestSchema,
  identitySnapshotId: NonEmptyStringSchema,
  identitySnapshotHash: DigestSchema,
  baseFactSnapshotId: NonEmptyStringSchema,
  baseFactSnapshotHash: DigestSchema,
  workerRunId: NonEmptyStringSchema,
  runtimeConfigDigest: DigestSchema,
  cycleIndex: z.number().int().min(1).max(31),
  scheduledAt: IsoDateTimeSchema,
  startedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema,
  scheduleLagMs: NonNegativeIntegerSchema,
  durationMs: NonNegativeIntegerSchema,
  missedScheduleStarts: NonNegativeIntegerSchema,
  rssBytes: NonNegativeIntegerSchema,
  checkpointStatus: z.enum(["COMMITTED", "BLOCKED", "FAILED"]),
  checkpointReceiptId: NonEmptyStringSchema.nullable(),
  checkpointReceiptHash: DigestSchema.nullable(),
  persistenceStatus: z.enum(["COMMITTED", "PARTIAL", "FAILED"]),
  persistenceReceiptId: NonEmptyStringSchema.nullable(),
  persistenceReceiptHash: DigestSchema.nullable(),
  venues: z.array(VenueAccountingSchema).length(4),
  assetDomains: z.array(AssetDomainAccountingSchema).length(
    M1_MULTI_ASSET_SHADOW_ASSET_DOMAIN_BUCKETS.length,
  ),
  lifecycleStates: z.array(LifecycleAccountingSchema).length(
    M1_LISTING_LIFECYCLE_STATES.length,
  ),
  listingCheckpoint: ListingCheckpointAccountingSchema,
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  runtimeAuthorityGranted: z.literal(false),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  productionChanged: z.literal(false),
});

const CycleCoreSchema = CycleInputSchema.extend({
  schemaVersion: z.literal(M1_MULTI_ASSET_SHADOW_CYCLE_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  aggregate: AggregateAccountingSchema,
  axisAssessments: z.array(AxisAssessmentSchema).length(4),
  status: z.enum([
    "PASS_ALL_REQUIRED_AXES_NO_AUTHORITY",
    "PARTIAL_EQUITY_TRADABLE_FACT_BLOCKED",
    "BLOCKED_COLLECTION_OR_SCOPE",
  ]),
});

export const M1MultiAssetShadowCycleSchema = CycleCoreSchema.extend({
  cycleId: NonEmptyStringSchema,
  contentHash: DigestSchema,
}).superRefine((cycle, context) => {
  const hasCheckpointReceipt =
    cycle.checkpointReceiptId !== null &&
    cycle.checkpointReceiptHash !== null;
  const hasPersistenceReceipt =
    cycle.persistenceReceiptId !== null &&
    cycle.persistenceReceiptHash !== null;
  if (
    (cycle.checkpointReceiptId === null) !==
      (cycle.checkpointReceiptHash === null) ||
    (cycle.persistenceReceiptId === null) !==
      (cycle.persistenceReceiptHash === null) ||
    (cycle.checkpointStatus === "COMMITTED") !== hasCheckpointReceipt ||
    (cycle.persistenceStatus === "COMMITTED") !== hasPersistenceReceipt
  ) {
    context.addIssue({
      code: "custom",
      message: "shadow cycle storage status requires exact receipt identity",
      path: ["persistenceStatus"],
    });
  }
  const expectedHash = stableContentHash(cycleCore(cycle));
  if (cycle.contentHash !== expectedHash) {
    context.addIssue({
      code: "custom",
      message: "shadow cycle content hash mismatch",
      path: ["contentHash"],
    });
  }
  if (
    cycle.cycleId !==
      `m1-multi-asset-shadow:${cycle.workerRunId}:${cycle.cycleIndex}:${expectedHash.slice(7, 23)}`
  ) {
    context.addIssue({
      code: "custom",
      message: "shadow cycle id mismatch",
      path: ["cycleId"],
    });
  }
});

export type M1MultiAssetShadowCycleInput = z.input<
  typeof CycleInputSchema
>;
export type M1MultiAssetShadowCycle = z.infer<
  typeof M1MultiAssetShadowCycleSchema
>;

function sum(
  rows: readonly M1MultiAssetShadowVenueAccounting[],
  field: Exclude<
    keyof M1MultiAssetShadowVenueAccounting,
    "venue" | "reasonCodes"
  >,
): number {
  return rows.reduce((total, row) => total + row[field], 0);
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function cycleCore(
  cycle: z.input<typeof CycleCoreSchema> & {
    readonly cycleId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof CycleCoreSchema> {
  return CycleCoreSchema.parse({
    schemaVersion: cycle.schemaVersion,
    scopeEpoch: cycle.scopeEpoch,
    releaseId: cycle.releaseId,
    upstreamBindingId: cycle.upstreamBindingId,
    upstreamBindingHash: cycle.upstreamBindingHash,
    catalogCaptureBindingId: cycle.catalogCaptureBindingId,
    catalogCaptureBindingHash: cycle.catalogCaptureBindingHash,
    identitySnapshotId: cycle.identitySnapshotId,
    identitySnapshotHash: cycle.identitySnapshotHash,
    baseFactSnapshotId: cycle.baseFactSnapshotId,
    baseFactSnapshotHash: cycle.baseFactSnapshotHash,
    workerRunId: cycle.workerRunId,
    runtimeConfigDigest: cycle.runtimeConfigDigest,
    cycleIndex: cycle.cycleIndex,
    scheduledAt: cycle.scheduledAt,
    startedAt: cycle.startedAt,
    sourceCutoff: cycle.sourceCutoff,
    completedAt: cycle.completedAt,
    scheduleLagMs: cycle.scheduleLagMs,
    durationMs: cycle.durationMs,
    missedScheduleStarts: cycle.missedScheduleStarts,
    rssBytes: cycle.rssBytes,
    checkpointStatus: cycle.checkpointStatus,
    checkpointReceiptId: cycle.checkpointReceiptId,
    checkpointReceiptHash: cycle.checkpointReceiptHash,
    persistenceStatus: cycle.persistenceStatus,
    persistenceReceiptId: cycle.persistenceReceiptId,
    persistenceReceiptHash: cycle.persistenceReceiptHash,
    venues: cycle.venues,
    assetDomains: cycle.assetDomains,
    lifecycleStates: cycle.lifecycleStates,
    listingCheckpoint: cycle.listingCheckpoint,
    aggregate: cycle.aggregate,
    axisAssessments: cycle.axisAssessments,
    status: cycle.status,
    rawBodyRetained: cycle.rawBodyRetained,
    secretMaterialPresent: cycle.secretMaterialPresent,
    runtimeAuthorityGranted: cycle.runtimeAuthorityGranted,
    factAuthorityGranted: cycle.factAuthorityGranted,
    candidateAuthorityGranted: cycle.candidateAuthorityGranted,
    strategyAuthorityGranted: cycle.strategyAuthorityGranted,
    readyAuthorityGranted: cycle.readyAuthorityGranted,
    productionChanged: cycle.productionChanged,
  });
}

function orderedExactRows<T extends string, Row>(
  rows: readonly Row[],
  expected: readonly T[],
  identity: (row: Row) => T,
  label: string,
): readonly Row[] {
  const byIdentity = new Map<T, Row>();
  for (const row of rows) {
    const key = identity(row);
    if (byIdentity.has(key)) {
      throw new Error(`${label} contains duplicate ${key}`);
    }
    byIdentity.set(key, row);
  }
  if (
    byIdentity.size !== expected.length ||
    expected.some((key) => !byIdentity.has(key))
  ) {
    throw new Error(`${label} must account for the exact frozen denominator`);
  }
  return expected.map((key) => byIdentity.get(key)!);
}

function assessAxis(input: {
  assetDomains: readonly z.infer<typeof AssetDomainAccountingSchema>[];
  lifecycleStates: readonly z.infer<typeof LifecycleAccountingSchema>[];
  venues: readonly M1MultiAssetShadowVenueAccounting[];
  listingCheckpoint: z.infer<typeof ListingCheckpointAccountingSchema>;
}): readonly z.infer<typeof AxisAssessmentSchema>[] {
  const bitget = input.venues.find((row) => row.venue === "BITGET_FUTURES")!;
  const bitgetPass =
    bitget.routeEligibleCount > 0 &&
    bitget.attemptedCount === bitget.scheduledCount &&
    bitget.collectedCount === bitget.attemptedCount &&
    bitget.freshCount === bitget.collectedCount &&
    bitget.providerFailureCount === 0;
  const listingPass =
    input.listingCheckpoint.status === "PASS";
  const equityRows = input.assetDomains.filter((row) =>
    row.assetDomain === "EQUITY_SINGLE_NAME_PERPETUAL" ||
    row.assetDomain === "EQUITY_INDEX_ETF_PERPETUAL"
  );
  const equityPass =
    equityRows.length === 2 &&
    equityRows.every(
      (row) =>
        row.routeEligibleCount > 0 &&
        row.collectedFactCount > 0 &&
        row.freshFactCount === row.collectedFactCount &&
        row.status === "FRESH",
    );
  const dataMaxPass = input.venues.every(
    (row) =>
      row.observedSubjectCount > 0 &&
      row.attemptedCount === row.scheduledCount &&
      row.collectedCount === row.attemptedCount &&
      row.freshCount === row.collectedCount &&
      row.partialCount === 0 &&
      row.staleCount === 0 &&
      row.unavailableCount === 0 &&
      row.providerFailureCount === 0,
  );
  return deepFreezeArtifact([
    {
      axisId: "BITGET_VENUE" as const,
      status: bitgetPass ? "PASS" as const : "BLOCKED" as const,
      reasonCodes: bitgetPass ? [] : ["bitget_fresh_collection_incomplete"],
    },
    {
      axisId: "LISTING_LIFECYCLE" as const,
      status: listingPass ? "PASS" as const : "BLOCKED" as const,
      reasonCodes: listingPass
        ? []
        : input.listingCheckpoint.reasonCodes,
    },
    {
      axisId: "EQUITY_ASSET_DOMAIN" as const,
      status: equityPass ? "PASS" as const : "BLOCKED" as const,
      reasonCodes: equityPass ? [] : ["equity_tradable_fact_missing"],
    },
    {
      axisId: "DATA_MAXIMIZATION" as const,
      status: dataMaxPass ? "PASS" as const : "BLOCKED" as const,
      reasonCodes: dataMaxPass ? [] : ["route_eligible_collection_incomplete"],
    },
  ]);
}

export function buildM1MultiAssetShadowCycle(
  inputValue: M1MultiAssetShadowCycleInput,
): M1MultiAssetShadowCycle {
  const input = CycleInputSchema.parse(inputValue);
  const venues = orderedExactRows(
    input.venues,
    M1_VENUE_SOURCE_IDS,
    (row) => row.venue,
    "venue accounting",
  );
  const assetDomains = orderedExactRows(
    input.assetDomains,
    M1_MULTI_ASSET_SHADOW_ASSET_DOMAIN_BUCKETS,
    (row) => row.assetDomain,
    "asset-domain accounting",
  );
  const lifecycleStates = orderedExactRows(
    input.lifecycleStates,
    M1_LISTING_LIFECYCLE_STATES,
    (row) => row.lifecycleState,
    "lifecycle accounting",
  );
  const aggregate = AggregateAccountingSchema.parse({
    observedSubjectCount: sum(venues, "observedSubjectCount"),
    exactIdentityCount: sum(venues, "exactIdentityCount"),
    partialIdentityCount: sum(venues, "partialIdentityCount"),
    unresolvedIdentityCount: sum(venues, "unresolvedIdentityCount"),
    routeEligibleCount: sum(venues, "routeEligibleCount"),
    routeBlockedCount: sum(venues, "routeBlockedCount"),
    scheduledCount: sum(venues, "scheduledCount"),
    notScheduledCount: sum(venues, "notScheduledCount"),
    attemptedCount: sum(venues, "attemptedCount"),
    notAttemptedCount: sum(venues, "notAttemptedCount"),
    collectedCount: sum(venues, "collectedCount"),
    freshCount: sum(venues, "freshCount"),
    partialCount: sum(venues, "partialCount"),
    staleCount: sum(venues, "staleCount"),
    unavailableCount: sum(venues, "unavailableCount"),
    providerFailureCount: sum(venues, "providerFailureCount"),
    collectionCoverageRatio: ratio(
      sum(venues, "collectedCount"),
      sum(venues, "attemptedCount"),
    ),
    freshCoverageRatio: ratio(
      sum(venues, "freshCount"),
      sum(venues, "collectedCount"),
    ),
  });
  const dimensionSums = (
    rows: readonly z.infer<typeof DimensionCountsSchema>[],
  ) => ({
    observedSubjectCount: rows.reduce(
      (total, row) => total + row.observedSubjectCount,
      0,
    ),
    routeEligibleCount: rows.reduce(
      (total, row) => total + row.routeEligibleCount,
      0,
    ),
    collectedFactCount: rows.reduce(
      (total, row) => total + row.collectedFactCount,
      0,
    ),
    freshFactCount: rows.reduce(
      (total, row) => total + row.freshFactCount,
      0,
    ),
  });
  const assetSums = dimensionSums(assetDomains);
  const lifecycleSums = dimensionSums(lifecycleStates);
  if (
    assetSums.observedSubjectCount !== aggregate.observedSubjectCount ||
    assetSums.routeEligibleCount !== aggregate.routeEligibleCount ||
    assetSums.collectedFactCount !== aggregate.collectedCount ||
    assetSums.freshFactCount !== aggregate.freshCount ||
    lifecycleSums.observedSubjectCount !== aggregate.observedSubjectCount ||
    lifecycleSums.routeEligibleCount !== aggregate.routeEligibleCount ||
    lifecycleSums.collectedFactCount !== aggregate.collectedCount ||
    lifecycleSums.freshFactCount !== aggregate.freshCount
  ) {
    throw new Error(
      "asset-domain and lifecycle denominators must fully reconcile to Venue accounting",
    );
  }
  const times = [
    Date.parse(input.scheduledAt),
    Date.parse(input.startedAt),
    Date.parse(input.sourceCutoff),
    Date.parse(input.completedAt),
  ];
  if (
    times[0]! > times[1]! ||
    times[1]! > times[2]! ||
    times[2]! > times[3]! ||
    input.scheduleLagMs !== times[1]! - times[0]! ||
    input.durationMs !== times[3]! - times[1]!
  ) {
    throw new Error("shadow cycle timestamps or measured durations disagree");
  }
  const axisAssessments = assessAxis({
    assetDomains,
    lifecycleStates,
    venues,
    listingCheckpoint: input.listingCheckpoint,
  });
  const equityBlocked = axisAssessments.find(
    (axis) => axis.axisId === "EQUITY_ASSET_DOMAIN",
  )!.status === "BLOCKED";
  const nonEquityBlocked = axisAssessments.some(
    (axis) =>
      axis.axisId !== "EQUITY_ASSET_DOMAIN" && axis.status === "BLOCKED",
  );
  const runtimeBlocked =
    input.scheduleLagMs > M1_MULTI_ASSET_SHADOW_PROFILE.maxScheduleLagMs ||
    input.durationMs > M1_MULTI_ASSET_SHADOW_PROFILE.maxCycleDurationMs ||
    input.missedScheduleStarts >
      M1_MULTI_ASSET_SHADOW_PROFILE.maxMissedStartCount ||
    input.rssBytes > M1_MULTI_ASSET_SHADOW_PROFILE.maxRssBytes ||
    input.checkpointStatus !== "COMMITTED" ||
    input.persistenceStatus !== "COMMITTED";
  const status = nonEquityBlocked || runtimeBlocked
    ? "BLOCKED_COLLECTION_OR_SCOPE" as const
    : equityBlocked
      ? "PARTIAL_EQUITY_TRADABLE_FACT_BLOCKED" as const
      : "PASS_ALL_REQUIRED_AXES_NO_AUTHORITY" as const;
  const core = cycleCore({
    ...input,
    schemaVersion: M1_MULTI_ASSET_SHADOW_CYCLE_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    venues: [...venues],
    assetDomains: [...assetDomains],
    lifecycleStates: [...lifecycleStates],
    aggregate,
    axisAssessments: [...axisAssessments],
    status,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1MultiAssetShadowCycleSchema.parse({
    ...core,
    cycleId:
      `m1-multi-asset-shadow:${core.workerRunId}:${core.cycleIndex}:${contentHash.slice(7, 23)}`,
    contentHash,
  }));
}

const EvidenceCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_MULTI_ASSET_SHADOW_EVIDENCE_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  evaluatedAt: IsoDateTimeSchema,
  upstreamBindingId: NonEmptyStringSchema,
  upstreamBindingHash: DigestSchema,
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  networkEnvironment: z.enum([
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  workerRunId: NonEmptyStringSchema,
  runtimeConfigDigest: DigestSchema,
  cycleCount: z.literal(31),
  observationMs: NonNegativeIntegerSchema,
  cycleIds: z.array(NonEmptyStringSchema).length(31),
  cycleContentHashes: z.array(DigestSchema).length(31),
  minimumCollectionCoverageRatio: RatioSchema,
  minimumFreshCoverageRatio: RatioSchema,
  maximumCycleDurationMs: NonNegativeIntegerSchema,
  maximumScheduleLagMs: NonNegativeIntegerSchema,
  maximumRssBytes: NonNegativeIntegerSchema,
  providerFailureCount: NonNegativeIntegerSchema,
  missedScheduleStartCount: NonNegativeIntegerSchema,
  committedCheckpointCycleCount: NonNegativeIntegerSchema,
  committedPersistenceCycleCount: NonNegativeIntegerSchema,
  axisPassCycleCounts: z.strictObject({
    BITGET_VENUE: NonNegativeIntegerSchema,
    LISTING_LIFECYCLE: NonNegativeIntegerSchema,
    EQUITY_ASSET_DOMAIN: NonNegativeIntegerSchema,
    DATA_MAXIMIZATION: NonNegativeIntegerSchema,
  }),
  baseCollectionGate: z.enum(["PASS", "BLOCKED"]),
  equityTradableFactGate: z.enum(["PASS", "BLOCKED"]),
  fullMultiAssetGate: z.enum(["PASS", "BLOCKED"]),
  status: z.enum([
    "PASS_FOUR_VENUE_MULTI_ASSET_SHADOW_NO_AUTHORITY",
    "BLOCKED_EQUITY_TRADABLE_FACT_NO_FALSE_PASS",
    "BLOCKED_SCOPE_OR_SLO_NO_STALE_PROMOTION",
    "TEST_ONLY_NOT_LIVE_EVIDENCE",
  ]),
  reasonCodes: UniqueReasonsSchema,
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  runtimeAuthorityGranted: z.literal(false),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  automaticTradingAllowed: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1MultiAssetShadowEvidenceSchema =
  EvidenceCoreSchema.extend({
    evidenceId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((evidence, context) => {
    const basePass =
      evidence.observationMs >=
        M1_MULTI_ASSET_SHADOW_PROFILE.minObservationMs &&
      evidence.minimumCollectionCoverageRatio >=
        M1_MULTI_ASSET_SHADOW_PROFILE.minCollectionCoverageRatio &&
      evidence.minimumFreshCoverageRatio >=
        M1_MULTI_ASSET_SHADOW_PROFILE.minFreshCoverageRatio &&
      evidence.maximumCycleDurationMs <=
        M1_MULTI_ASSET_SHADOW_PROFILE.maxCycleDurationMs &&
      evidence.maximumScheduleLagMs <=
        M1_MULTI_ASSET_SHADOW_PROFILE.maxScheduleLagMs &&
      evidence.maximumRssBytes <=
        M1_MULTI_ASSET_SHADOW_PROFILE.maxRssBytes &&
      evidence.providerFailureCount === 0 &&
      evidence.missedScheduleStartCount === 0 &&
      evidence.committedCheckpointCycleCount === evidence.cycleCount &&
      evidence.committedPersistenceCycleCount === evidence.cycleCount &&
      evidence.axisPassCycleCounts.BITGET_VENUE === evidence.cycleCount &&
      evidence.axisPassCycleCounts.LISTING_LIFECYCLE ===
        evidence.cycleCount &&
      evidence.axisPassCycleCounts.DATA_MAXIMIZATION === evidence.cycleCount;
    const equityPass =
      evidence.axisPassCycleCounts.EQUITY_ASSET_DOMAIN === evidence.cycleCount;
    const live =
      evidence.evidenceClass === "LIVE_READ_ONLY" &&
      evidence.networkEnvironment === "TENCENT_ISOLATED_READ_ONLY";
    const testOnly =
      evidence.evidenceClass === "TEST_ONLY" &&
      evidence.networkEnvironment === "TEST_HARNESS";
    const expectedStatus = testOnly
      ? "TEST_ONLY_NOT_LIVE_EVIDENCE"
      : !basePass
        ? "BLOCKED_SCOPE_OR_SLO_NO_STALE_PROMOTION"
        : !equityPass
          ? "BLOCKED_EQUITY_TRADABLE_FACT_NO_FALSE_PASS"
          : live
            ? "PASS_FOUR_VENUE_MULTI_ASSET_SHADOW_NO_AUTHORITY"
            : "BLOCKED_SCOPE_OR_SLO_NO_STALE_PROMOTION";
    if (
      (!live && !testOnly) ||
      evidence.baseCollectionGate !== (basePass ? "PASS" : "BLOCKED") ||
      evidence.equityTradableFactGate !==
        (equityPass ? "PASS" : "BLOCKED") ||
      evidence.fullMultiAssetGate !==
        (basePass && equityPass && live ? "PASS" : "BLOCKED") ||
      evidence.status !== expectedStatus
    ) {
      context.addIssue({
        code: "custom",
        message: "shadow evidence Gate or status overstates observed metrics",
        path: ["status"],
      });
    }
    const expectedHash = stableContentHash(evidenceCore(evidence));
    if (evidence.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "shadow evidence content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      evidence.evidenceId !==
        `m1-multi-asset-shadow-evidence:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "shadow evidence id mismatch",
        path: ["evidenceId"],
      });
    }
  });

export type M1MultiAssetShadowEvidence = z.infer<
  typeof M1MultiAssetShadowEvidenceSchema
>;

function evidenceCore(
  evidence: z.input<typeof EvidenceCoreSchema> & {
    readonly evidenceId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof EvidenceCoreSchema> {
  return EvidenceCoreSchema.parse({
    schemaVersion: evidence.schemaVersion,
    scopeEpoch: evidence.scopeEpoch,
    releaseId: evidence.releaseId,
    evaluatedAt: evidence.evaluatedAt,
    upstreamBindingId: evidence.upstreamBindingId,
    upstreamBindingHash: evidence.upstreamBindingHash,
    evidenceClass: evidence.evidenceClass,
    networkEnvironment: evidence.networkEnvironment,
    workerRunId: evidence.workerRunId,
    runtimeConfigDigest: evidence.runtimeConfigDigest,
    cycleCount: evidence.cycleCount,
    observationMs: evidence.observationMs,
    cycleIds: evidence.cycleIds,
    cycleContentHashes: evidence.cycleContentHashes,
    minimumCollectionCoverageRatio:
      evidence.minimumCollectionCoverageRatio,
    minimumFreshCoverageRatio: evidence.minimumFreshCoverageRatio,
    maximumCycleDurationMs: evidence.maximumCycleDurationMs,
    maximumScheduleLagMs: evidence.maximumScheduleLagMs,
    maximumRssBytes: evidence.maximumRssBytes,
    providerFailureCount: evidence.providerFailureCount,
    missedScheduleStartCount: evidence.missedScheduleStartCount,
    committedCheckpointCycleCount:
      evidence.committedCheckpointCycleCount,
    committedPersistenceCycleCount:
      evidence.committedPersistenceCycleCount,
    axisPassCycleCounts: evidence.axisPassCycleCounts,
    baseCollectionGate: evidence.baseCollectionGate,
    equityTradableFactGate: evidence.equityTradableFactGate,
    fullMultiAssetGate: evidence.fullMultiAssetGate,
    status: evidence.status,
    reasonCodes: evidence.reasonCodes,
    rawBodyRetained: evidence.rawBodyRetained,
    secretMaterialPresent: evidence.secretMaterialPresent,
    runtimeAuthorityGranted: evidence.runtimeAuthorityGranted,
    factAuthorityGranted: evidence.factAuthorityGranted,
    candidateAuthorityGranted: evidence.candidateAuthorityGranted,
    strategyAuthorityGranted: evidence.strategyAuthorityGranted,
    readyAuthorityGranted: evidence.readyAuthorityGranted,
    automaticTradingAllowed: evidence.automaticTradingAllowed,
    productionChanged: evidence.productionChanged,
  });
}

function minimum(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("shadow evidence metric denominator is empty");
  }
  return Math.min(...values);
}

function maximum(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("shadow evidence metric denominator is empty");
  }
  return Math.max(...values);
}

export function buildM1MultiAssetShadowEvidence(input: {
  readonly upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  readonly cycles: readonly M1MultiAssetShadowCycle[];
  readonly evaluatedAt: string;
}): M1MultiAssetShadowEvidence {
  const upstream = M1MultiAssetShadowUpstreamBindingSchema.parse(
    input.upstreamBinding,
  );
  const cycles = input.cycles.map((cycle) =>
    M1MultiAssetShadowCycleSchema.parse(cycle)
  );
  if (cycles.length !== M1_MULTI_ASSET_SHADOW_PROFILE.cycleCount) {
    throw new Error("shadow evidence requires exactly thirty-one cycles");
  }
  for (const [index, cycle] of cycles.entries()) {
    if (
      cycle.cycleIndex !== index + 1 ||
      cycle.releaseId !== upstream.releaseId ||
      cycle.upstreamBindingId !== upstream.upstreamBindingId ||
      cycle.upstreamBindingHash !== upstream.contentHash
    ) {
      throw new Error(
        "shadow evidence cycle order or exact upstream identity drifted",
      );
    }
    if (index === 0) {
      continue;
    }
    const previous = cycles[index - 1]!;
    if (
      cycle.workerRunId !== previous.workerRunId ||
      cycle.runtimeConfigDigest !== previous.runtimeConfigDigest ||
      Date.parse(cycle.scheduledAt) - Date.parse(previous.scheduledAt) !==
        M1_MULTI_ASSET_SHADOW_PROFILE.cadenceMs ||
      Date.parse(cycle.startedAt) < Date.parse(previous.completedAt) ||
      Date.parse(cycle.sourceCutoff) <= Date.parse(previous.sourceCutoff)
    ) {
      throw new Error(
        "stitched, overlapping, non-contiguous or non-monotonic cycles are forbidden",
      );
    }
  }
  const observationMs =
    Date.parse(cycles.at(-1)!.scheduledAt) -
    Date.parse(cycles[0]!.scheduledAt);
  const minimumCollectionCoverageRatio = minimum(
    cycles.map((cycle) => cycle.aggregate.collectionCoverageRatio ?? 0),
  );
  const minimumFreshCoverageRatio = minimum(
    cycles.map((cycle) => cycle.aggregate.freshCoverageRatio ?? 0),
  );
  const maximumCycleDurationMs = maximum(
    cycles.map((cycle) => cycle.durationMs),
  );
  const maximumScheduleLagMs = maximum(
    cycles.map((cycle) => cycle.scheduleLagMs),
  );
  const maximumRssBytes = maximum(cycles.map((cycle) => cycle.rssBytes));
  const providerFailureCount = cycles.reduce(
    (total, cycle) => total + cycle.aggregate.providerFailureCount,
    0,
  );
  const missedScheduleStartCount = cycles.reduce(
    (total, cycle) => total + cycle.missedScheduleStarts,
    0,
  );
  const committedCheckpointCycleCount = cycles.filter(
    (cycle) => cycle.checkpointStatus === "COMMITTED",
  ).length;
  const committedPersistenceCycleCount = cycles.filter(
    (cycle) => cycle.persistenceStatus === "COMMITTED",
  ).length;
  const axisPassCycleCounts = {
    BITGET_VENUE: cycles.filter((cycle) =>
      cycle.axisAssessments.find((axis) => axis.axisId === "BITGET_VENUE")
        ?.status === "PASS"
    ).length,
    LISTING_LIFECYCLE: cycles.filter((cycle) =>
      cycle.axisAssessments.find(
        (axis) => axis.axisId === "LISTING_LIFECYCLE",
      )?.status === "PASS"
    ).length,
    EQUITY_ASSET_DOMAIN: cycles.filter((cycle) =>
      cycle.axisAssessments.find(
        (axis) => axis.axisId === "EQUITY_ASSET_DOMAIN",
      )?.status === "PASS"
    ).length,
    DATA_MAXIMIZATION: cycles.filter((cycle) =>
      cycle.axisAssessments.find(
        (axis) => axis.axisId === "DATA_MAXIMIZATION",
      )?.status === "PASS"
    ).length,
  };
  const baseCollectionPass =
    observationMs >= M1_MULTI_ASSET_SHADOW_PROFILE.minObservationMs &&
    minimumCollectionCoverageRatio >=
      M1_MULTI_ASSET_SHADOW_PROFILE.minCollectionCoverageRatio &&
    minimumFreshCoverageRatio >=
      M1_MULTI_ASSET_SHADOW_PROFILE.minFreshCoverageRatio &&
    maximumCycleDurationMs <=
      M1_MULTI_ASSET_SHADOW_PROFILE.maxCycleDurationMs &&
    maximumScheduleLagMs <= M1_MULTI_ASSET_SHADOW_PROFILE.maxScheduleLagMs &&
    maximumRssBytes <= M1_MULTI_ASSET_SHADOW_PROFILE.maxRssBytes &&
    providerFailureCount ===
      M1_MULTI_ASSET_SHADOW_PROFILE.maxProviderFailureCount &&
    missedScheduleStartCount ===
      M1_MULTI_ASSET_SHADOW_PROFILE.maxMissedStartCount &&
    committedCheckpointCycleCount === cycles.length &&
    committedPersistenceCycleCount === cycles.length &&
    axisPassCycleCounts.BITGET_VENUE === cycles.length &&
    axisPassCycleCounts.LISTING_LIFECYCLE === cycles.length &&
    axisPassCycleCounts.DATA_MAXIMIZATION === cycles.length;
  const equityPass =
    axisPassCycleCounts.EQUITY_ASSET_DOMAIN === cycles.length;
  const liveUpstream =
    upstream.evidenceClass === "LIVE_READ_ONLY" &&
    upstream.networkEnvironment === "TENCENT_ISOLATED_READ_ONLY";
  const status = upstream.evidenceClass === "TEST_ONLY"
    ? "TEST_ONLY_NOT_LIVE_EVIDENCE" as const
    : !baseCollectionPass
      ? "BLOCKED_SCOPE_OR_SLO_NO_STALE_PROMOTION" as const
      : !equityPass
        ? "BLOCKED_EQUITY_TRADABLE_FACT_NO_FALSE_PASS" as const
        : liveUpstream
          ? "PASS_FOUR_VENUE_MULTI_ASSET_SHADOW_NO_AUTHORITY" as const
          : "BLOCKED_SCOPE_OR_SLO_NO_STALE_PROMOTION" as const;
  const reasons = [
    ...(!baseCollectionPass ? ["base_collection_or_slo_blocked"] : []),
    ...(!equityPass ? ["equity_tradable_fact_missing"] : []),
    ...(!liveUpstream ? ["live_upstream_evidence_missing"] : []),
  ].filter((reason, index, values) => values.indexOf(reason) === index);
  const core = evidenceCore({
    schemaVersion: M1_MULTI_ASSET_SHADOW_EVIDENCE_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: upstream.releaseId,
    evaluatedAt: input.evaluatedAt,
    upstreamBindingId: upstream.upstreamBindingId,
    upstreamBindingHash: upstream.contentHash,
    evidenceClass: upstream.evidenceClass,
    networkEnvironment: upstream.networkEnvironment,
    workerRunId: cycles[0]!.workerRunId,
    runtimeConfigDigest: cycles[0]!.runtimeConfigDigest,
    cycleCount: 31,
    observationMs,
    cycleIds: cycles.map((cycle) => cycle.cycleId),
    cycleContentHashes: cycles.map((cycle) => cycle.contentHash),
    minimumCollectionCoverageRatio,
    minimumFreshCoverageRatio,
    maximumCycleDurationMs,
    maximumScheduleLagMs,
    maximumRssBytes,
    providerFailureCount,
    missedScheduleStartCount,
    committedCheckpointCycleCount,
    committedPersistenceCycleCount,
    axisPassCycleCounts,
    baseCollectionGate: baseCollectionPass ? "PASS" : "BLOCKED",
    equityTradableFactGate: equityPass ? "PASS" : "BLOCKED",
    fullMultiAssetGate:
      baseCollectionPass && equityPass && liveUpstream ? "PASS" : "BLOCKED",
    status,
    reasonCodes: reasons,
    rawBodyRetained: false,
    secretMaterialPresent: false,
    runtimeAuthorityGranted: false,
    factAuthorityGranted: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    automaticTradingAllowed: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1MultiAssetShadowEvidenceSchema.parse({
    ...core,
    evidenceId:
      `m1-multi-asset-shadow-evidence:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}
