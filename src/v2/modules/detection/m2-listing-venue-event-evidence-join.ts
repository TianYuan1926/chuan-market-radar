import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";
import {
  M1ListingWatchEvidenceBindingSchema,
  type M1ListingWatchEvidenceBinding,
} from "../market-fact/multi-asset-base-fact-contract";
import {
  M1ListingHistoryAdvanceResultSchema,
  M1ListingHistoryCheckpointSchema,
  M1ListingHistoryPageSchema,
  type M1ListingHistoryAdvanceResult,
  type M1ListingHistoryCheckpoint,
  type M1ListingHistoryPage,
} from "../multi-asset-universe/listing-history-runtime";
import type {
  M1ListingWatchRefreshBatch,
  M1ListingWatchRefreshResult,
} from "../multi-asset-universe/m1-listing-watch-live-runtime";
import {
  M1MultiAssetCatalogCaptureBindingSchema,
  M1MultiAssetIdentitySnapshotSchema,
  type M1MultiAssetCatalogCaptureBinding,
  type M1MultiAssetIdentitySnapshot,
} from "../multi-asset-universe/multi-asset-identity-contract";
import {
  buildM1ListingLifecycleLedger,
  type M1ListingLifecycleLedger,
} from "../multi-asset-universe/listing-lifecycle-contract";
import {
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
  M1SourceCapabilityRegistrySchema,
  assessM1SourceCapabilityRegistry,
  type M1SourceCapabilityRegistry,
} from "../source-capability/source-capability-contract";
import {
  M1MultiAssetShadowUpstreamBindingSchema,
  type M1MultiAssetShadowUpstreamBinding,
} from "../shadow/m1-multi-asset-shadow-contract";
import {
  deepFreezeArtifact,
  omitArtifactFields,
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M2ListingVenueEventResearchBundleSchema,
  M2ListingVenueSourceCoverageSchema,
  buildM2ListingVenueEventResearchBundle,
  type M2ListingVenueEventResearchBundle,
  type M2ListingVenueSourceCoverage,
} from "./m2-listing-venue-event-research";

export const M2_LISTING_WATCH_REFRESH_EVIDENCE_VERSION =
  "v2-m2-listing-watch-refresh-evidence.v1" as const;
export const M2_LISTING_VENUE_EVENT_EVIDENCE_JOIN_VERSION =
  "v2-m2-listing-venue-event-evidence-join.v1" as const;
export const M2_LISTING_VENUE_EVENT_EVIDENCE_JOIN_AUTHORITY =
  "UPSTREAM_EVIDENCE_JOIN_ONLY_NO_CANDIDATE_DIRECTION_PROBABILITY_SIGNAL_GRADE_STRATEGY_READY_OR_PRODUCTION_AUTHORITY" as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const ListingSourceSchema = z.enum([
  "BYBIT_DERIVATIVES",
  "BITGET_FUTURES",
]);

const CanonicalReasonsSchema = ReasonCodesSchema.superRefine(
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

const ListingPageReferenceSchema = z.strictObject({
  pageId: NonEmptyStringSchema,
  contentHash: DigestSchema,
  receivedAt: IsoDateTimeSchema,
});

const ListingRefreshSourceEvidenceCoreSchema = z.strictObject({
  sourceId: ListingSourceSchema,
  status: z.enum(["COMMITTED", "BLOCKED"]),
  requestCount: NonNegativeIntegerSchema,
  responseBytes: NonNegativeIntegerSchema,
  pages: z.array(ListingPageReferenceSchema),
  advanceArtifactId: NonEmptyStringSchema.nullable(),
  advanceArtifactHash: DigestSchema.nullable(),
  checkpointId: NonEmptyStringSchema.nullable(),
  checkpointHash: DigestSchema.nullable(),
  bindingId: NonEmptyStringSchema.nullable(),
  bindingHash: DigestSchema.nullable(),
  reasonCodes: CanonicalReasonsSchema,
});

export const M2ListingRefreshSourceEvidenceSchema =
  ListingRefreshSourceEvidenceCoreSchema.extend({
    sourceEvidenceId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((evidence, context) => {
    const committed = evidence.status === "COMMITTED";
    if (
      committed !== (evidence.checkpointId !== null) ||
      committed !== (evidence.checkpointHash !== null) ||
      committed !== (evidence.bindingId !== null) ||
      committed !== (evidence.bindingHash !== null) ||
      (committed && evidence.reasonCodes.length > 0) ||
      (!committed && evidence.reasonCodes.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "listing refresh source status and evidence disagree",
      });
    }
    if (
      (evidence.advanceArtifactId === null) !==
        (evidence.advanceArtifactHash === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "advance artifact id and hash must appear together",
        path: ["advanceArtifactId"],
      });
    }
    const expectedHash = stableContentHash(
      ListingRefreshSourceEvidenceCoreSchema.parse(
        omitArtifactFields(evidence, ["sourceEvidenceId", "contentHash"]),
      ),
    );
    if (
      evidence.contentHash !== expectedHash ||
      evidence.sourceEvidenceId !==
        `listing-refresh-source:${evidence.sourceId}:${
          expectedHash.slice(7, 31)
        }`
    ) {
      context.addIssue({
        code: "custom",
        message: "listing refresh source evidence identity mismatch",
        path: ["contentHash"],
      });
    }
  });

export type M2ListingRefreshSourceEvidence = z.infer<
  typeof M2ListingRefreshSourceEvidenceSchema
>;

const ListingWatchRefreshEvidenceCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_LISTING_WATCH_REFRESH_EVIDENCE_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  upstreamBindingId: NonEmptyStringSchema,
  upstreamBindingHash: DigestSchema,
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  networkEnvironment: z.enum([
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  sourceDenominator: z.tuple([
    z.literal("BITGET_FUTURES"),
    z.literal("BYBIT_DERIVATIVES"),
  ]),
  results: z.array(M2ListingRefreshSourceEvidenceSchema).length(2),
  allCommitted: z.boolean(),
  committedSourceCount: NonNegativeIntegerSchema,
  blockedSourceCount: NonNegativeIntegerSchema,
  requestCount: NonNegativeIntegerSchema,
  responseBytes: NonNegativeIntegerSchema,
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  authorityGranted: z.literal(false),
  productionChanged: z.literal(false),
});

export const M2ListingWatchRefreshEvidenceSchema =
  ListingWatchRefreshEvidenceCoreSchema.extend({
    refreshEvidenceId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((evidence, context) => {
    if (
      evidence.results[0]?.sourceId !== "BITGET_FUTURES" ||
      evidence.results[1]?.sourceId !== "BYBIT_DERIVATIVES"
    ) {
      context.addIssue({
        code: "custom",
        message: "listing refresh evidence requires the exact source order",
        path: ["results"],
      });
    }
    const committed = evidence.results.filter(
      (result) => result.status === "COMMITTED",
    ).length;
    if (
      evidence.committedSourceCount !== committed ||
      evidence.blockedSourceCount !== evidence.results.length - committed ||
      evidence.allCommitted !== (committed === evidence.results.length) ||
      evidence.requestCount !== evidence.results.reduce(
        (total, result) => total + result.requestCount,
        0,
      ) ||
      evidence.responseBytes !== evidence.results.reduce(
        (total, result) => total + result.responseBytes,
        0,
      ) ||
      Date.parse(evidence.sourceCutoff) > Date.parse(evidence.generatedAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "listing refresh evidence accounting or chronology disagrees",
      });
    }
    const expectedHash = stableContentHash(
      ListingWatchRefreshEvidenceCoreSchema.parse(
        omitArtifactFields(evidence, ["refreshEvidenceId", "contentHash"]),
      ),
    );
    if (
      evidence.contentHash !== expectedHash ||
      evidence.refreshEvidenceId !==
        `listing-refresh-evidence:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "listing refresh evidence identity mismatch",
        path: ["contentHash"],
      });
    }
  });

export type M2ListingWatchRefreshEvidence = z.infer<
  typeof M2ListingWatchRefreshEvidenceSchema
>;

const CapabilityEvidenceReferenceSchema = z.strictObject({
  sourceId: z.enum(["BINANCE_FUTURES", "OKX_SWAP"]),
  capabilityId: z.literal("LISTING_ANNOUNCEMENT"),
  registryId: NonEmptyStringSchema,
  registryDigest: DigestSchema,
  reviewedAt: IsoDateTimeSchema,
  capabilityRowHash: DigestSchema,
  documentationStatus: z.literal("NO_OFFICIAL_CAPABILITY_FOUND"),
  disposition: z.literal("UNAVAILABLE"),
  reasonCodes: CanonicalReasonsSchema.min(1),
});

const EvidenceJoinCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_LISTING_VENUE_EVENT_EVIDENCE_JOIN_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  upstreamBindingId: NonEmptyStringSchema,
  upstreamBindingHash: DigestSchema,
  registryId: NonEmptyStringSchema,
  registryDigest: DigestSchema,
  registryReviewedAt: IsoDateTimeSchema,
  catalogCaptureBindingId: NonEmptyStringSchema,
  catalogCaptureBindingHash: DigestSchema,
  currentIdentitySnapshotId: NonEmptyStringSchema,
  currentIdentitySnapshotHash: DigestSchema,
  previousIdentitySnapshotId: NonEmptyStringSchema.nullable(),
  previousIdentitySnapshotHash: DigestSchema.nullable(),
  listingRefreshEvidenceId: NonEmptyStringSchema,
  listingRefreshEvidenceHash: DigestSchema,
  capabilityAbsenceEvidence: z.array(CapabilityEvidenceReferenceSchema)
    .length(2),
  sourceCoverage: z.array(M2ListingVenueSourceCoverageSchema).length(4),
  sourceCoverageHash: DigestSchema,
  completeCatalogSourceCount: NonNegativeIntegerSchema,
  completeOrQualifiedAnnouncementSourceCount: NonNegativeIntegerSchema,
  lifecycleLedgerId: NonEmptyStringSchema,
  lifecycleLedgerHash: DigestSchema,
  lifecycleEventCount: NonNegativeIntegerSchema,
  researchBundleId: NonEmptyStringSchema,
  researchBundleHash: DigestSchema,
  researchEventCount: NonNegativeIntegerSchema,
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  networkEnvironment: z.enum([
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  status: z.enum([
    "TEST_ONLY_UPSTREAM_EVIDENCE_JOIN_NO_RUNTIME_AUTHORITY",
    "LIVE_READ_ONLY_SOURCE_EVIDENCE_COMPLETE_NO_CANDIDATE_AUTHORITY",
    "BLOCKED_INCOMPLETE_UPSTREAM_SOURCE_EVIDENCE",
  ]),
  candidateEmissionAllowed: z.literal(false),
  directionAuthorityAllowed: z.literal(false),
  probabilityAuthorityAllowed: z.literal(false),
  signalGradeAllowed: z.literal(false),
  strategyAuthorityAllowed: z.literal(false),
  readyAuthorityAllowed: z.literal(false),
  productionRuntimeAllowed: z.literal(false),
  authority: z.literal(M2_LISTING_VENUE_EVENT_EVIDENCE_JOIN_AUTHORITY),
  reasonCodes: CanonicalReasonsSchema,
  productionChanged: z.literal(false),
});

export const M2ListingVenueEventEvidenceJoinSchema =
  EvidenceJoinCoreSchema.extend({
    evidenceJoinId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((join, context) => {
    if (
      join.capabilityAbsenceEvidence[0]?.sourceId !== "BINANCE_FUTURES" ||
      join.capabilityAbsenceEvidence[1]?.sourceId !== "OKX_SWAP" ||
      M1_VENUE_SOURCE_IDS.some(
        (sourceId, index) => join.sourceCoverage[index]?.sourceId !== sourceId,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "evidence join denominators must remain exact and ordered",
      });
    }
    const completeCatalog = join.sourceCoverage.filter(
      (coverage) => coverage.catalogCoverage === "COMPLETE",
    ).length;
    const completeAnnouncements = join.sourceCoverage.filter(
      (coverage) =>
        coverage.announcementCoverage === "COMPLETE_PROVIDER_SCOPE" ||
        coverage.announcementCoverage ===
          "NOT_SUPPORTED_BY_QUALIFIED_CAPABILITY",
    ).length;
    const complete = completeCatalog === M1_VENUE_SOURCE_IDS.length &&
      completeAnnouncements === M1_VENUE_SOURCE_IDS.length;
    const expectedStatus = join.evidenceClass === "TEST_ONLY"
      ? "TEST_ONLY_UPSTREAM_EVIDENCE_JOIN_NO_RUNTIME_AUTHORITY"
      : complete
        ? "LIVE_READ_ONLY_SOURCE_EVIDENCE_COMPLETE_NO_CANDIDATE_AUTHORITY"
        : "BLOCKED_INCOMPLETE_UPSTREAM_SOURCE_EVIDENCE";
    if (
      join.completeCatalogSourceCount !== completeCatalog ||
      join.completeOrQualifiedAnnouncementSourceCount !==
        completeAnnouncements ||
      join.status !== expectedStatus ||
      join.sourceCoverageHash !== stableContentHash(join.sourceCoverage) ||
      Date.parse(join.sourceCutoff) > Date.parse(join.generatedAt) ||
      (join.previousIdentitySnapshotId === null) !==
        (join.previousIdentitySnapshotHash === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "evidence join status, count, hash or chronology disagrees",
      });
    }
    const expectedHash = stableContentHash(
      EvidenceJoinCoreSchema.parse(
        omitArtifactFields(join, ["evidenceJoinId", "contentHash"]),
      ),
    );
    if (
      join.contentHash !== expectedHash ||
      join.evidenceJoinId !==
        `listing-event-evidence-join:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "evidence join identity mismatch",
        path: ["contentHash"],
      });
    }
  });

export type M2ListingVenueEventEvidenceJoin = z.infer<
  typeof M2ListingVenueEventEvidenceJoinSchema
>;

export type M2ListingVenueEventEvidenceJoinResult = Readonly<{
  refreshEvidence: M2ListingWatchRefreshEvidence;
  lifecycleLedger: M1ListingLifecycleLedger;
  researchBundle: M2ListingVenueEventResearchBundle;
  evidenceJoin: M2ListingVenueEventEvidenceJoin;
}>;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function maximumTime(values: readonly string[]): string {
  const value = Math.max(...values.map((item) => Date.parse(item)));
  if (!Number.isFinite(value)) {
    throw new Error("evidence join received an invalid time");
  }
  return new Date(value).toISOString();
}

function advanceReference(
  advance: M1ListingHistoryAdvanceResult | null,
): Readonly<{ id: string | null; hash: string | null }> {
  if (advance === null) {
    return { id: null, hash: null };
  }
  return advance.status === "COMMITTED"
    ? {
      id: advance.checkpoint.checkpointId,
      hash: stableContentHash(advance),
    }
    : {
      id: advance.gap.gapId,
      hash: stableContentHash(advance),
    };
}

function parseRefreshResult(input: {
  result: M1ListingWatchRefreshResult;
  upstream: M1MultiAssetShadowUpstreamBinding;
}): Readonly<{
  sourceEvidence: M2ListingRefreshSourceEvidence;
  pages: readonly M1ListingHistoryPage[];
  advance: M1ListingHistoryAdvanceResult | null;
  checkpoint: M1ListingHistoryCheckpoint | null;
  binding: M1ListingWatchEvidenceBinding | null;
}> {
  const result = input.result;
  if (
    !ListingSourceSchema.safeParse(result.sourceId).success ||
    !Number.isSafeInteger(result.requestCount) ||
    result.requestCount < 0 ||
    !Number.isSafeInteger(result.responseBytes) ||
    result.responseBytes < 0 ||
    result.rawBodyRetained !== false ||
    result.secretMaterialPresent !== false ||
    result.authorityGranted !== false ||
    result.productionChanged !== false
  ) {
    throw new Error("listing refresh result boundary is invalid");
  }
  const pages = result.pages.map((page) => M1ListingHistoryPageSchema.parse(page));
  const advance = result.advance === null
    ? null
    : M1ListingHistoryAdvanceResultSchema.parse(result.advance);
  const checkpoint = result.checkpoint === null
    ? null
    : M1ListingHistoryCheckpointSchema.parse(result.checkpoint);
  const binding = result.binding === null
    ? null
    : M1ListingWatchEvidenceBindingSchema.parse(result.binding);
  const reasonCodes = uniqueSorted(result.reasonCodes);
  if (
    pages.some(
      (page, index) =>
        page.sourceId !== result.sourceId ||
        page.releaseId !== input.upstream.releaseId ||
        page.pageOrdinal !== index + 1,
    ) ||
    result.requestCount < pages.length
  ) {
    throw new Error("listing refresh pages drifted from source or release");
  }
  const committed = result.status === "COMMITTED";
  if (
    committed !== (advance?.status === "COMMITTED") ||
    committed !== (checkpoint !== null) ||
    committed !== (binding !== null) ||
    (committed && reasonCodes.length > 0) ||
    (!committed && reasonCodes.length === 0) ||
    (!committed && advance !== null && advance.status !== "BLOCKED_GAP")
  ) {
    throw new Error("listing refresh status and nested artifacts disagree");
  }
  if (advance !== null && advance.status === "BLOCKED_GAP") {
    if (
      advance.gap.sourceId !== result.sourceId ||
      advance.gap.releaseId !== input.upstream.releaseId
    ) {
      throw new Error("listing refresh gap drifted from source or release");
    }
  }
  if (checkpoint !== null && binding !== null) {
    if (
      checkpoint.sourceId !== result.sourceId ||
      checkpoint.releaseId !== input.upstream.releaseId ||
      binding.sourceId !== result.sourceId ||
      binding.releaseId !== input.upstream.releaseId ||
      binding.upstreamBindingId !== input.upstream.upstreamBindingId ||
      binding.upstreamBindingHash !== input.upstream.contentHash ||
      binding.evidenceId !== checkpoint.checkpointId ||
      binding.evidenceHash !== checkpoint.contentHash ||
      binding.sourceCutoff !== checkpoint.sourceCutoff ||
      binding.evidenceClass !== input.upstream.evidenceClass ||
      binding.networkEnvironment !== input.upstream.networkEnvironment ||
      advance?.status !== "COMMITTED" ||
      advance.checkpoint.checkpointId !== checkpoint.checkpointId ||
      advance.checkpoint.contentHash !== checkpoint.contentHash
    ) {
      throw new Error("listing checkpoint binding is not exact for upstream");
    }
  }
  const advanceRef = advanceReference(advance);
  const core = ListingRefreshSourceEvidenceCoreSchema.parse({
    sourceId: result.sourceId,
    status: result.status,
    requestCount: result.requestCount,
    responseBytes: result.responseBytes,
    pages: pages.map((page) => ({
      pageId: page.pageId,
      contentHash: page.contentHash,
      receivedAt: page.receivedAt,
    })),
    advanceArtifactId: advanceRef.id,
    advanceArtifactHash: advanceRef.hash,
    checkpointId: checkpoint?.checkpointId ?? null,
    checkpointHash: checkpoint?.contentHash ?? null,
    bindingId: binding?.bindingId ?? null,
    bindingHash: binding?.contentHash ?? null,
    reasonCodes,
  });
  const contentHash = stableContentHash(core);
  return {
    sourceEvidence: deepFreezeArtifact(
      M2ListingRefreshSourceEvidenceSchema.parse({
        ...core,
        sourceEvidenceId:
          `listing-refresh-source:${core.sourceId}:${
            contentHash.slice(7, 31)
          }`,
        contentHash,
      }),
    ),
    pages,
    advance,
    checkpoint,
    binding,
  };
}

export function buildM2ListingWatchRefreshEvidence(input: {
  upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  refreshBatch: M1ListingWatchRefreshBatch;
  generatedAt: string;
}): M2ListingWatchRefreshEvidence {
  const upstream = M1MultiAssetShadowUpstreamBindingSchema.parse(
    input.upstreamBinding,
  );
  const results = input.refreshBatch.results
    .map((result) => parseRefreshResult({ result, upstream }))
    .sort((left, right) =>
      left.sourceEvidence.sourceId.localeCompare(
        right.sourceEvidence.sourceId,
      )
    );
  if (
    results.length !== 2 ||
    results[0]?.sourceEvidence.sourceId !== "BITGET_FUTURES" ||
    results[1]?.sourceEvidence.sourceId !== "BYBIT_DERIVATIVES"
  ) {
    throw new Error("listing refresh batch must preserve both source results");
  }
  const bindings = results.flatMap((result) =>
    result.binding === null ? [] : [result.binding]
  );
  const checkpoints = results.flatMap((result) =>
    result.checkpoint === null ? [] : [result.checkpoint]
  );
  const batchBindingHashes = input.refreshBatch.bindings
    .map((binding) => M1ListingWatchEvidenceBindingSchema.parse(binding))
    .map((binding) => binding.contentHash)
    .sort();
  const exactBindingHashes = bindings.map((binding) => binding.contentHash)
    .sort();
  const batchCheckpointHashes = input.refreshBatch.checkpoints
    .map((checkpoint) => M1ListingHistoryCheckpointSchema.parse(checkpoint))
    .map((checkpoint) => checkpoint.contentHash)
    .sort();
  const exactCheckpointHashes = checkpoints
    .map((checkpoint) => checkpoint.contentHash)
    .sort();
  const requestCount = results.reduce(
    (total, result) => total + result.sourceEvidence.requestCount,
    0,
  );
  const responseBytes = results.reduce(
    (total, result) => total + result.sourceEvidence.responseBytes,
    0,
  );
  const allCommitted = results.every(
    (result) => result.sourceEvidence.status === "COMMITTED",
  );
  if (
    stableContentHash(batchBindingHashes) !==
      stableContentHash(exactBindingHashes) ||
    stableContentHash(batchCheckpointHashes) !==
      stableContentHash(exactCheckpointHashes) ||
    input.refreshBatch.allCommitted !== allCommitted ||
    input.refreshBatch.requestCount !== requestCount ||
    input.refreshBatch.responseBytes !== responseBytes ||
    input.refreshBatch.rawBodyRetained !== false ||
    input.refreshBatch.secretMaterialPresent !== false ||
    input.refreshBatch.authorityGranted !== false ||
    input.refreshBatch.productionChanged !== false
  ) {
    throw new Error("listing refresh batch denominator or boundary drifted");
  }
  const sourceTimes = [
    upstream.sourceCutoff,
    ...results.flatMap((result) => [
      ...result.pages.map((page) => page.receivedAt),
      ...(result.checkpoint === null
        ? []
        : [result.checkpoint.sourceCutoff]),
    ]),
  ];
  const sourceCutoff = maximumTime(sourceTimes);
  if (Date.parse(input.generatedAt) < Date.parse(sourceCutoff)) {
    throw new Error("listing refresh evidence generated before source cutoff");
  }
  const committedSourceCount = results.filter(
    (result) => result.sourceEvidence.status === "COMMITTED",
  ).length;
  const core = ListingWatchRefreshEvidenceCoreSchema.parse({
    schemaVersion: M2_LISTING_WATCH_REFRESH_EVIDENCE_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: upstream.releaseId,
    generatedAt: input.generatedAt,
    sourceCutoff,
    upstreamBindingId: upstream.upstreamBindingId,
    upstreamBindingHash: upstream.contentHash,
    evidenceClass: upstream.evidenceClass,
    networkEnvironment: upstream.networkEnvironment,
    sourceDenominator: ["BITGET_FUTURES", "BYBIT_DERIVATIVES"],
    results: results.map((result) => result.sourceEvidence),
    allCommitted,
    committedSourceCount,
    blockedSourceCount: results.length - committedSourceCount,
    requestCount,
    responseBytes,
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M2ListingWatchRefreshEvidenceSchema.parse({
    ...core,
    refreshEvidenceId:
      `listing-refresh-evidence:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}

function exactCapabilityAbsence(input: {
  registry: M1SourceCapabilityRegistry;
  sourceId: "BINANCE_FUTURES" | "OKX_SWAP";
}): z.infer<typeof CapabilityEvidenceReferenceSchema> {
  const rows = input.registry.rows.filter(
    (row) =>
      row.sourceId === input.sourceId &&
      row.capabilityId === "LISTING_ANNOUNCEMENT",
  );
  if (rows.length !== 1) {
    throw new Error("listing announcement capability denominator drifted");
  }
  const row = rows[0]!;
  if (
    row.documentationStatus !== "NO_OFFICIAL_CAPABILITY_FOUND" ||
    row.disposition !== "UNAVAILABLE" ||
    row.endpoint !== null ||
    row.channel !== null ||
    row.pointInTimeSuitability !== "UNSUITABLE" ||
    row.reasonCodes.length === 0
  ) {
    throw new Error(
      `listing announcement absence is not qualified for ${input.sourceId}`,
    );
  }
  return CapabilityEvidenceReferenceSchema.parse({
    sourceId: input.sourceId,
    capabilityId: "LISTING_ANNOUNCEMENT",
    registryId: input.registry.registryId,
    registryDigest: input.registry.registryDigest,
    reviewedAt: input.registry.reviewedAt,
    capabilityRowHash: stableContentHash(row),
    documentationStatus: row.documentationStatus,
    disposition: row.disposition,
    reasonCodes: uniqueSorted(row.reasonCodes),
  });
}

function sourceCoverage(input: {
  catalog: M1MultiAssetCatalogCaptureBinding;
  refreshEvidence: M2ListingWatchRefreshEvidence;
  capabilityAbsence: readonly z.infer<
    typeof CapabilityEvidenceReferenceSchema
  >[];
}): M2ListingVenueSourceCoverage[] {
  return M1_VENUE_SOURCE_IDS.map((sourceId) => {
    const capture = input.catalog.venueCaptures.find(
      (candidate) => candidate.sourceId === sourceId,
    )!;
    const catalogCoverage = capture.captureStatus === "COMPLETE"
      ? "COMPLETE" as const
      : capture.successfulResponseCount > 0 || capture.observationCount > 0
        ? "PARTIAL" as const
        : "UNAVAILABLE" as const;
    const absence = input.capabilityAbsence.find(
      (candidate) => candidate.sourceId === sourceId,
    );
    const refresh = input.refreshEvidence.results.find(
      (candidate) => candidate.sourceId === sourceId,
    );
    if (absence === undefined && refresh === undefined) {
      throw new Error(`listing source evidence missing for ${sourceId}`);
    }
    const announcementCoverage = absence !== undefined
      ? "NOT_SUPPORTED_BY_QUALIFIED_CAPABILITY" as const
      : refresh!.status === "COMMITTED"
        ? "COMPLETE_PROVIDER_SCOPE" as const
        : refresh!.pages.length > 0 || refresh!.advanceArtifactId !== null
          ? "PARTIAL" as const
          : "UNAVAILABLE" as const;
    const knowledgeTime = absence?.reviewedAt ??
      input.refreshEvidence.generatedAt;
    const evidenceIds = uniqueSorted([
      capture.captureId,
      ...(absence === undefined
        ? [
          input.refreshEvidence.refreshEvidenceId,
          refresh!.sourceEvidenceId,
          ...(refresh!.bindingId === null ? [] : [refresh!.bindingId]),
          ...(refresh!.checkpointId === null ? [] : [refresh!.checkpointId]),
        ]
        : [
          absence.registryId,
          `capability-row:${sourceId}:LISTING_ANNOUNCEMENT:${
            absence.capabilityRowHash.slice(7, 31)
          }`,
        ]),
    ]);
    const reasonCodes = uniqueSorted([
      ...(catalogCoverage === "COMPLETE"
        ? []
        : ["catalog_capture_not_complete", ...capture.reasonCodes]),
      ...(absence?.reasonCodes ?? []),
      ...(refresh !== undefined && refresh.status === "BLOCKED"
        ? ["listing_watch_refresh_blocked", ...refresh.reasonCodes]
        : []),
    ]);
    return M2ListingVenueSourceCoverageSchema.parse({
      sourceId,
      catalogCoverage,
      announcementCoverage,
      knowledgeTime,
      evidenceIds,
      reasonCodes,
    });
  });
}

export function buildM2ListingVenueEventEvidenceJoin(input: {
  upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  registry: M1SourceCapabilityRegistry;
  catalogCaptureBinding: M1MultiAssetCatalogCaptureBinding;
  currentIdentity: M1MultiAssetIdentitySnapshot;
  previousIdentity: M1MultiAssetIdentitySnapshot | null;
  listingRefreshBatch: M1ListingWatchRefreshBatch;
  generatedAt: string;
}): M2ListingVenueEventEvidenceJoinResult {
  const upstream = M1MultiAssetShadowUpstreamBindingSchema.parse(
    input.upstreamBinding,
  );
  const registry = M1SourceCapabilityRegistrySchema.parse(input.registry);
  const registryAssessment = assessM1SourceCapabilityRegistry(registry);
  if (registryAssessment.status !== "PASS") {
    throw new Error(
      `listing evidence join rejected capability registry: ${
        registryAssessment.violations.join(",")
      }`,
    );
  }
  const catalog = M1MultiAssetCatalogCaptureBindingSchema.parse(
    input.catalogCaptureBinding,
  );
  const current = M1MultiAssetIdentitySnapshotSchema.parse(
    input.currentIdentity,
  );
  const previous = input.previousIdentity === null
    ? null
    : M1MultiAssetIdentitySnapshotSchema.parse(input.previousIdentity);
  if (
    registry.registryDigest !== upstream.registryDigest ||
    catalog.registryDigest !== registry.registryDigest ||
    catalog.releaseId !== upstream.releaseId ||
    catalog.upstreamBindingId !== upstream.upstreamBindingId ||
    catalog.upstreamBindingHash !== upstream.contentHash ||
    catalog.evidenceClass !== upstream.evidenceClass ||
    catalog.networkEnvironment !== upstream.networkEnvironment ||
    current.releaseId !== upstream.releaseId ||
    current.registryDigest !== registry.registryDigest ||
    current.upstreamBindingId !== upstream.upstreamBindingId ||
    current.upstreamBindingHash !== upstream.contentHash ||
    current.catalogCaptureBindingId !== catalog.captureBindingId ||
    current.catalogCaptureBindingHash !== catalog.contentHash ||
    current.evidenceClass !== upstream.evidenceClass ||
    current.networkEnvironment !== upstream.networkEnvironment
  ) {
    throw new Error("listing evidence join upstream identity drifted");
  }
  if (
    previous !== null &&
    (
      previous.releaseId !== upstream.releaseId ||
      previous.registryDigest !== registry.registryDigest ||
      previous.evidenceClass !== upstream.evidenceClass ||
      previous.networkEnvironment !== upstream.networkEnvironment ||
      Date.parse(previous.sourceCutoff) >= Date.parse(current.sourceCutoff)
    )
  ) {
    throw new Error("listing evidence join previous identity drifted");
  }
  const refreshEvidence = buildM2ListingWatchRefreshEvidence({
    upstreamBinding: upstream,
    refreshBatch: input.listingRefreshBatch,
    generatedAt: input.generatedAt,
  });
  const capabilityAbsence = [
    exactCapabilityAbsence({ registry, sourceId: "BINANCE_FUTURES" }),
    exactCapabilityAbsence({ registry, sourceId: "OKX_SWAP" }),
  ] as const;
  const coverage = sourceCoverage({
    catalog,
    refreshEvidence,
    capabilityAbsence,
  });
  const sourceCutoff = maximumTime([
    registry.reviewedAt,
    catalog.generatedAt,
    current.sourceCutoff,
    refreshEvidence.generatedAt,
    ...coverage.map((item) => item.knowledgeTime),
  ]);
  if (Date.parse(input.generatedAt) < Date.parse(sourceCutoff)) {
    throw new Error("listing evidence join generated before evidence cutoff");
  }
  const committedCheckpoints = input.listingRefreshBatch.results
    .flatMap((result) =>
      result.status === "COMMITTED" && result.checkpoint !== null
        ? [M1ListingHistoryCheckpointSchema.parse(result.checkpoint)]
        : []
    );
  const announcements = committedCheckpoints.flatMap(
    (checkpoint) => checkpoint.observations,
  );
  const completeCatalogSources = catalog.venueCaptures
    .filter((capture) => capture.captureStatus === "COMPLETE")
    .map((capture) => capture.sourceId);
  const lifecycleLedger = buildM1ListingLifecycleLedger({
    releaseId: upstream.releaseId,
    generatedAt: input.generatedAt,
    sourceCutoff,
    current,
    previous,
    completeCatalogSources,
    announcements,
  });
  const researchBundle = M2ListingVenueEventResearchBundleSchema.parse(
    buildM2ListingVenueEventResearchBundle({
      releaseId: upstream.releaseId,
      generatedAt: input.generatedAt,
      ledger: lifecycleLedger,
      currentIdentity: current,
      previousIdentity: previous,
      sourceCoverage: coverage,
    }),
  );
  const completeCatalogSourceCount = coverage.filter(
    (item) => item.catalogCoverage === "COMPLETE",
  ).length;
  const completeOrQualifiedAnnouncementSourceCount = coverage.filter(
    (item) =>
      item.announcementCoverage === "COMPLETE_PROVIDER_SCOPE" ||
      item.announcementCoverage ===
        "NOT_SUPPORTED_BY_QUALIFIED_CAPABILITY",
  ).length;
  const sourceEvidenceComplete =
    completeCatalogSourceCount === M1_VENUE_SOURCE_IDS.length &&
    completeOrQualifiedAnnouncementSourceCount ===
      M1_VENUE_SOURCE_IDS.length;
  const status = upstream.evidenceClass === "TEST_ONLY"
    ? "TEST_ONLY_UPSTREAM_EVIDENCE_JOIN_NO_RUNTIME_AUTHORITY" as const
    : sourceEvidenceComplete
      ? "LIVE_READ_ONLY_SOURCE_EVIDENCE_COMPLETE_NO_CANDIDATE_AUTHORITY" as const
      : "BLOCKED_INCOMPLETE_UPSTREAM_SOURCE_EVIDENCE" as const;
  const reasonCodes = uniqueSorted([
    ...coverage.flatMap((item) => item.reasonCodes),
    ...(sourceEvidenceComplete
      ? []
      : ["upstream_listing_source_evidence_incomplete"]),
    ...(upstream.evidenceClass === "TEST_ONLY"
      ? ["test_only_evidence_join_cannot_establish_runtime_readiness"]
      : []),
    "m2_4a_real_cohort_holdout_calibration_and_shadow_required",
  ]);
  const core = EvidenceJoinCoreSchema.parse({
    schemaVersion: M2_LISTING_VENUE_EVENT_EVIDENCE_JOIN_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: upstream.releaseId,
    generatedAt: input.generatedAt,
    sourceCutoff,
    upstreamBindingId: upstream.upstreamBindingId,
    upstreamBindingHash: upstream.contentHash,
    registryId: registry.registryId,
    registryDigest: registry.registryDigest,
    registryReviewedAt: registry.reviewedAt,
    catalogCaptureBindingId: catalog.captureBindingId,
    catalogCaptureBindingHash: catalog.contentHash,
    currentIdentitySnapshotId: current.snapshotId,
    currentIdentitySnapshotHash: current.contentHash,
    previousIdentitySnapshotId: previous?.snapshotId ?? null,
    previousIdentitySnapshotHash: previous?.contentHash ?? null,
    listingRefreshEvidenceId: refreshEvidence.refreshEvidenceId,
    listingRefreshEvidenceHash: refreshEvidence.contentHash,
    capabilityAbsenceEvidence: capabilityAbsence,
    sourceCoverage: coverage,
    sourceCoverageHash: stableContentHash(coverage),
    completeCatalogSourceCount,
    completeOrQualifiedAnnouncementSourceCount,
    lifecycleLedgerId: lifecycleLedger.ledgerId,
    lifecycleLedgerHash: lifecycleLedger.contentHash,
    lifecycleEventCount: lifecycleLedger.eventCount,
    researchBundleId: researchBundle.bundleId,
    researchBundleHash: researchBundle.contentHash,
    researchEventCount: researchBundle.researchEventCount,
    evidenceClass: upstream.evidenceClass,
    networkEnvironment: upstream.networkEnvironment,
    status,
    candidateEmissionAllowed: false,
    directionAuthorityAllowed: false,
    probabilityAuthorityAllowed: false,
    signalGradeAllowed: false,
    strategyAuthorityAllowed: false,
    readyAuthorityAllowed: false,
    productionRuntimeAllowed: false,
    authority: M2_LISTING_VENUE_EVENT_EVIDENCE_JOIN_AUTHORITY,
    reasonCodes,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  const evidenceJoin = deepFreezeArtifact(
    M2ListingVenueEventEvidenceJoinSchema.parse({
      ...core,
      evidenceJoinId:
        `listing-event-evidence-join:${contentHash.slice(7, 31)}`,
      contentHash,
    }),
  );
  return deepFreezeArtifact({
    refreshEvidence,
    lifecycleLedger,
    researchBundle,
    evidenceJoin,
  });
}

export function verifyM2ListingVenueEventEvidenceJoin(
  value: unknown,
): M2ListingVenueEventEvidenceJoin {
  return deepFreezeArtifact(M2ListingVenueEventEvidenceJoinSchema.parse(value));
}
