import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";
import {
  M1ListingLifecycleLedgerSchema,
} from "../multi-asset-universe/listing-lifecycle-contract";
import type {
  M1SourceCapabilityRegistry,
} from "../source-capability/source-capability-contract";
import {
  M1MultiAssetShadowUpstreamBindingSchema,
  type M1MultiAssetShadowUpstreamBinding,
} from "../shadow/m1-multi-asset-shadow-contract";
import type {
  M1MultiAssetShadowEvidenceStoreAudit,
} from "../shadow/m1-multi-asset-shadow-evidence-verifier";
import {
  deepFreezeArtifact,
  omitArtifactFields,
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M2ListingVenueEventResearchBundleSchema,
} from "./m2-listing-venue-event-research";
import {
  M2ListingVenueEventEvidenceJoinSchema,
  M2ListingWatchRefreshEvidenceSchema,
  buildM2ListingVenueEventEvidenceJoin,
  type M2ListingVenueEventEvidenceJoinResult,
} from "./m2-listing-venue-event-evidence-join";

export const M2_LISTING_VENUE_EVENT_RUNTIME_EVIDENCE_VERSION =
  "v2-m2-listing-venue-event-runtime-evidence.v1" as const;
export const M2_LISTING_VENUE_EVENT_RUNTIME_EVIDENCE_AUTHORITY =
  "READ_ONLY_RUNTIME_EVIDENCE_ONLY_NO_CANDIDATE_DIRECTION_PROBABILITY_SIGNAL_GRADE_STRATEGY_READY_OR_PRODUCTION_AUTHORITY" as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
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
        message: "runtime evidence reason codes must be unique and ordered",
      });
    }
  },
);

export const M2ListingVenueEventRuntimeSourceAuditSchema = z.strictObject({
  m15cStoreVerificationId: NonEmptyStringSchema,
  m15cStoreVerificationHash: DigestSchema,
  m15cEvidenceId: NonEmptyStringSchema,
  m15cEvidenceHash: DigestSchema,
  workerRunId: NonEmptyStringSchema,
  currentCycleIndex: z.literal(31),
  previousCycleIndex: z.literal(30),
  sourceListingRefreshBatchHash: DigestSchema,
  catalogCaptureBindingId: NonEmptyStringSchema,
  catalogCaptureBindingHash: DigestSchema,
  currentIdentitySnapshotId: NonEmptyStringSchema,
  currentIdentitySnapshotHash: DigestSchema,
  previousIdentitySnapshotId: NonEmptyStringSchema.nullable(),
  previousIdentitySnapshotHash: DigestSchema.nullable(),
}).superRefine((audit, context) => {
  if (
    (audit.previousIdentitySnapshotId === null) !==
      (audit.previousIdentitySnapshotHash === null)
  ) {
    context.addIssue({
      code: "custom",
      message: "previous runtime identity reference is partial",
    });
  }
});

export type M2ListingVenueEventRuntimeSourceAudit = Readonly<
  z.infer<typeof M2ListingVenueEventRuntimeSourceAuditSchema>
>;

const RuntimeEvidenceCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_LISTING_VENUE_EVENT_RUNTIME_EVIDENCE_VERSION),
  releaseId: ReleaseIdSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  upstreamBindingId: NonEmptyStringSchema,
  upstreamBindingHash: DigestSchema,
  sourceAudit: M2ListingVenueEventRuntimeSourceAuditSchema,
  listingRefreshEvidenceId: NonEmptyStringSchema,
  listingRefreshEvidenceHash: DigestSchema,
  lifecycleLedgerId: NonEmptyStringSchema,
  lifecycleLedgerHash: DigestSchema,
  researchBundleId: NonEmptyStringSchema,
  researchBundleHash: DigestSchema,
  evidenceJoinId: NonEmptyStringSchema,
  evidenceJoinHash: DigestSchema,
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
  authority: z.literal(M2_LISTING_VENUE_EVENT_RUNTIME_EVIDENCE_AUTHORITY),
  reasonCodes: CanonicalReasonCodesSchema,
  candidateEmissionAllowed: z.literal(false),
  directionAuthorityAllowed: z.literal(false),
  probabilityAuthorityAllowed: z.literal(false),
  signalGradeAllowed: z.literal(false),
  strategyAuthorityAllowed: z.literal(false),
  readyAuthorityAllowed: z.literal(false),
  productionRuntimeAllowed: z.literal(false),
  productionChanged: z.literal(false),
});

export const M2ListingVenueEventRuntimeEvidenceSchema =
  RuntimeEvidenceCoreSchema.extend({
    runtimeEvidenceId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((evidence, context) => {
    if (Date.parse(evidence.sourceCutoff) > Date.parse(evidence.generatedAt)) {
      context.addIssue({
        code: "custom",
        message: "runtime evidence chronology is invalid",
        path: ["sourceCutoff"],
      });
    }
    const expectedHash = stableContentHash(
      RuntimeEvidenceCoreSchema.parse(
        omitArtifactFields(evidence, ["runtimeEvidenceId", "contentHash"]),
      ),
    );
    if (
      evidence.contentHash !== expectedHash ||
      evidence.runtimeEvidenceId !==
        `listing-event-runtime-evidence:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "runtime evidence identity mismatch",
        path: ["contentHash"],
      });
    }
  });

export type M2ListingVenueEventRuntimeEvidence = Readonly<
  z.infer<typeof M2ListingVenueEventRuntimeEvidenceSchema>
>;

function buildCore(input: {
  sourceAudit: M2ListingVenueEventRuntimeSourceAudit;
  result: M2ListingVenueEventEvidenceJoinResult;
}) {
  const sourceAudit = M2ListingVenueEventRuntimeSourceAuditSchema.parse(
    input.sourceAudit,
  );
  const refresh = M2ListingWatchRefreshEvidenceSchema.parse(
    input.result.refreshEvidence,
  );
  const ledger = M1ListingLifecycleLedgerSchema.parse(
    input.result.lifecycleLedger,
  );
  const research = M2ListingVenueEventResearchBundleSchema.parse(
    input.result.researchBundle,
  );
  const join = M2ListingVenueEventEvidenceJoinSchema.parse(
    input.result.evidenceJoin,
  );
  if (
    refresh.releaseId !== join.releaseId ||
    refresh.upstreamBindingId !== join.upstreamBindingId ||
    refresh.upstreamBindingHash !== join.upstreamBindingHash ||
    ledger.releaseId !== join.releaseId ||
    research.releaseId !== join.releaseId ||
    join.listingRefreshEvidenceId !== refresh.refreshEvidenceId ||
    join.listingRefreshEvidenceHash !== refresh.contentHash ||
    join.lifecycleLedgerId !== ledger.ledgerId ||
    join.lifecycleLedgerHash !== ledger.contentHash ||
    join.researchBundleId !== research.bundleId ||
    join.researchBundleHash !== research.contentHash ||
    sourceAudit.sourceListingRefreshBatchHash !==
      refresh.sourceRefreshBatchHash ||
    sourceAudit.catalogCaptureBindingId !== join.catalogCaptureBindingId ||
    sourceAudit.catalogCaptureBindingHash !==
      join.catalogCaptureBindingHash ||
    sourceAudit.currentIdentitySnapshotId !==
      join.currentIdentitySnapshotId ||
    sourceAudit.currentIdentitySnapshotHash !==
      join.currentIdentitySnapshotHash ||
    sourceAudit.previousIdentitySnapshotId !==
      join.previousIdentitySnapshotId ||
    sourceAudit.previousIdentitySnapshotHash !==
      join.previousIdentitySnapshotHash
  ) {
    throw new Error("listing runtime evidence artifacts do not reconcile");
  }
  return RuntimeEvidenceCoreSchema.parse({
    schemaVersion: M2_LISTING_VENUE_EVENT_RUNTIME_EVIDENCE_VERSION,
    releaseId: join.releaseId,
    generatedAt: join.generatedAt,
    sourceCutoff: join.sourceCutoff,
    upstreamBindingId: join.upstreamBindingId,
    upstreamBindingHash: join.upstreamBindingHash,
    sourceAudit,
    listingRefreshEvidenceId: refresh.refreshEvidenceId,
    listingRefreshEvidenceHash: refresh.contentHash,
    lifecycleLedgerId: ledger.ledgerId,
    lifecycleLedgerHash: ledger.contentHash,
    researchBundleId: research.bundleId,
    researchBundleHash: research.contentHash,
    evidenceJoinId: join.evidenceJoinId,
    evidenceJoinHash: join.contentHash,
    evidenceClass: join.evidenceClass,
    networkEnvironment: join.networkEnvironment,
    status: join.status,
    authority: M2_LISTING_VENUE_EVENT_RUNTIME_EVIDENCE_AUTHORITY,
    reasonCodes: join.reasonCodes,
    candidateEmissionAllowed: false,
    directionAuthorityAllowed: false,
    probabilityAuthorityAllowed: false,
    signalGradeAllowed: false,
    strategyAuthorityAllowed: false,
    readyAuthorityAllowed: false,
    productionRuntimeAllowed: false,
    productionChanged: false,
  });
}

export function buildM2ListingVenueEventRuntimeEvidence(input: {
  sourceAudit: M2ListingVenueEventRuntimeSourceAudit;
  result: M2ListingVenueEventEvidenceJoinResult;
}): M2ListingVenueEventRuntimeEvidence {
  const core = buildCore(input);
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M2ListingVenueEventRuntimeEvidenceSchema.parse({
    ...core,
    runtimeEvidenceId:
      `listing-event-runtime-evidence:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}

export function verifyM2ListingVenueEventRuntimeEvidenceSet(input: {
  sourceAudit: M2ListingVenueEventRuntimeSourceAudit;
  result: M2ListingVenueEventEvidenceJoinResult;
  runtimeEvidence: unknown;
}): M2ListingVenueEventRuntimeEvidence {
  const persisted = M2ListingVenueEventRuntimeEvidenceSchema.parse(
    input.runtimeEvidence,
  );
  const rebuilt = buildM2ListingVenueEventRuntimeEvidence({
    sourceAudit: input.sourceAudit,
    result: input.result,
  });
  if (persisted.contentHash !== rebuilt.contentHash) {
    throw new Error("listing runtime evidence does not rebuild from artifacts");
  }
  return deepFreezeArtifact(persisted);
}

export function buildM2ListingVenueEventRuntimeEvidenceFromM15cAudit(input: {
  upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  registry: M1SourceCapabilityRegistry;
  audit: M1MultiAssetShadowEvidenceStoreAudit;
  generatedAt: string;
}): Readonly<{
  sourceAudit: M2ListingVenueEventRuntimeSourceAudit;
  result: M2ListingVenueEventEvidenceJoinResult;
  runtimeEvidence: M2ListingVenueEventRuntimeEvidence;
}> {
  const upstream = M1MultiAssetShadowUpstreamBindingSchema.parse(
    input.upstreamBinding,
  );
  if (
    input.audit.catalogCaptureBindings.length !== 31 ||
    input.audit.identitySnapshots.length !== 31 ||
    input.audit.listingWatchRefreshBatches.length !== 31
  ) {
    throw new Error("M1.5C audit does not contain the exact 31-cycle source set");
  }
  const catalog = input.audit.catalogCaptureBindings[30]!;
  const currentIdentity = input.audit.identitySnapshots[30]!;
  const previousIdentity = input.audit.identitySnapshots[29]!;
  const listingRefreshBatch = input.audit.listingWatchRefreshBatches[30]!;
  const sourceListingRefreshBatchHash = stableContentHash(
    listingRefreshBatch,
  );
  if (
    sourceListingRefreshBatchHash !==
      input.audit.verification.lastListingWatchRefreshBatchHash ||
    input.audit.verification.releaseId !== upstream.releaseId ||
    input.audit.verification.upstreamBindingId !==
      upstream.upstreamBindingId ||
    input.audit.verification.upstreamBindingHash !== upstream.contentHash
  ) {
    throw new Error("M1.5C audit identity does not bind the final source cycle");
  }
  const result = buildM2ListingVenueEventEvidenceJoin({
    upstreamBinding: upstream,
    registry: input.registry,
    catalogCaptureBinding: catalog,
    currentIdentity,
    previousIdentity,
    listingRefreshBatch,
    generatedAt: input.generatedAt,
  });
  const sourceAudit = M2ListingVenueEventRuntimeSourceAuditSchema.parse({
    m15cStoreVerificationId: input.audit.verification.verificationId,
    m15cStoreVerificationHash: input.audit.verification.contentHash,
    m15cEvidenceId: input.audit.evidence.evidenceId,
    m15cEvidenceHash: input.audit.evidence.contentHash,
    workerRunId: input.audit.evidence.workerRunId,
    currentCycleIndex: 31,
    previousCycleIndex: 30,
    sourceListingRefreshBatchHash,
    catalogCaptureBindingId: catalog.captureBindingId,
    catalogCaptureBindingHash: catalog.contentHash,
    currentIdentitySnapshotId: currentIdentity.snapshotId,
    currentIdentitySnapshotHash: currentIdentity.contentHash,
    previousIdentitySnapshotId: previousIdentity.snapshotId,
    previousIdentitySnapshotHash: previousIdentity.contentHash,
  });
  const runtimeEvidence = buildM2ListingVenueEventRuntimeEvidence({
    sourceAudit,
    result,
  });
  return deepFreezeArtifact({ sourceAudit, result, runtimeEvidence });
}
