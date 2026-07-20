import { z } from "zod";
import type { InstrumentAccountingStatus } from "../domain/contracts";
import type { ForwardInstrumentProviderId } from "../modules/universe/adapters/forward-catalog-capture-adapter";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../modules/universe/stable-artifact";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  ReasonCodesSchema,
} from "../runtime-schema/primitives";
import {
  M2ForwardInstrumentSnapshotSchema,
  type ForwardIdentityEvidenceClass,
  type M2ForwardInstrumentSnapshot,
} from "./forward-instrument-capture";
import {
  M2_FORWARD_INSTRUMENT_CONTINUITY_VERSION,
  M2_FORWARD_INSTRUMENT_DEFAULT_CADENCE_POLICY,
  M2ForwardInstrumentProvenanceSchema,
  type M2ForwardInstrumentProvenance,
} from "./forward-instrument-provenance";

export {
  M2_FORWARD_INSTRUMENT_CONTINUITY_VERSION,
  M2_FORWARD_INSTRUMENT_DEFAULT_CADENCE_POLICY,
} from "./forward-instrument-provenance";

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ForwardInstrumentProviderIdSchema = z.enum([
  "BINANCE_USDS_FUTURES",
  "OKX_SWAP",
  "BYBIT_LINEAR_PERPETUAL",
]);
const TargetVenueSchema = z.enum([
  "BINANCE_FUTURES",
  "OKX_SWAP",
  "BYBIT_LINEAR_PERPETUAL",
]);

export const M2ForwardInstrumentCadencePolicySchema = z.strictObject({
  expectedCadenceMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  maximumGapMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  completeMissesToConfirm: z.number().int().min(2).max(100),
  minimumConfirmationElapsedMs: z.number().int().positive()
    .max(Number.MAX_SAFE_INTEGER),
}).superRefine((policy, context) => {
  if (policy.maximumGapMs < policy.expectedCadenceMs) {
    context.addIssue({
      code: "custom",
      message: "maximum continuity gap cannot be shorter than expected cadence",
      path: ["maximumGapMs"],
    });
  }
  if (
    policy.minimumConfirmationElapsedMs <
      policy.expectedCadenceMs * policy.completeMissesToConfirm
  ) {
    context.addIssue({
      code: "custom",
      message: "presence-loss confirmation requires enough elapsed cadence time",
      path: ["minimumConfirmationElapsedMs"],
    });
  }
});

type CadencePolicy = z.infer<typeof M2ForwardInstrumentCadencePolicySchema>;

const LedgerSnapshotReferenceSchema = z.strictObject({
  ...M2ForwardInstrumentProvenanceSchema.shape,
  providerId: ForwardInstrumentProviderIdSchema,
  venue: TargetVenueSchema,
  snapshotId: NonEmptyStringSchema,
  snapshotDigest: DigestSchema,
  sourceCutoff: IsoDateTimeSchema,
  captureStatus: z.enum(["COMPLETE", "PARTIAL", "FAILED"]),
  accountingCount: NonNegativeIntegerSchema,
  rawEvidenceCount: NonNegativeIntegerSchema,
});

const ContinuityGapSchema = z.strictObject({
  gapId: NonEmptyStringSchema,
  gapKind: z.enum([
    "CADENCE_GAP",
    "PARTIAL_SNAPSHOT",
    "FAILED_SNAPSHOT",
  ]),
  observedAt: IsoDateTimeSchema,
  elapsedMs: NonNegativeIntegerSchema.nullable(),
  snapshotId: NonEmptyStringSchema,
  reasonCodes: ReasonCodesSchema,
});

const IdentityEpochSchema = z.strictObject({
  identityEpochId: NonEmptyStringSchema,
  epochNumber: z.number().int().positive(),
  identityFingerprint: DigestSchema,
  identityEvidenceClass: z.enum([
    "CANONICAL_TARGET",
    "PROVIDER_NATIVE_OUT_OF_SCOPE",
  ]),
  firstObservedAt: IsoDateTimeSchema,
  lastObservedAt: IsoDateTimeSchema,
  firstSnapshotId: NonEmptyStringSchema,
  lastSnapshotId: NonEmptyStringSchema,
  epochStatus: z.enum([
    "ACTIVE",
    "MISSING_UNCONFIRMED",
    "MISSING_CONFIRMED",
    "CONFLICTED",
  ]),
});

const InstrumentContinuityRecordSchema = z.strictObject({
  providerRecordKey: NonEmptyStringSchema,
  venueInstrumentId: NonEmptyStringSchema.nullable(),
  currentIdentityFingerprint: DigestSchema.nullable(),
  currentIdentityEvidenceClass: z.enum([
    "CANONICAL_TARGET",
    "PROVIDER_NATIVE_OUT_OF_SCOPE",
    "UNRESOLVED",
  ]),
  observedIdentityFingerprints: z.array(DigestSchema),
  currentState: z.enum([
    "PRESENT",
    "MISSING_UNCONFIRMED",
    "MISSING_CONFIRMED",
    "IDENTITY_CONFLICT",
    "IDENTITY_EVIDENCE_GAP",
    "UNRESOLVED_IDENTITY",
  ]),
  currentProviderStatus: z.enum([
    "OBSERVED",
    "ACCEPTED",
    "ELIGIBLE",
    "SUSPENDED",
    "DELISTING",
    "UNRESOLVED",
    "UNAVAILABLE",
    "UNSUPPORTED",
  ]).nullable(),
  firstObservedAt: IsoDateTimeSchema,
  lastObservedAt: IsoDateTimeSchema,
  lastCompleteSnapshotAt: IsoDateTimeSchema,
  missingSince: IsoDateTimeSchema.nullable(),
  consecutiveCompleteMisses: NonNegativeIntegerSchema,
  presenceEpoch: z.number().int().positive(),
  identityEpochs: z.array(IdentityEpochSchema),
  delistingInferredFromAbsence: z.literal(false),
}).superRefine((record, context) => {
  if (
    Date.parse(record.firstObservedAt) > Date.parse(record.lastObservedAt) ||
    Date.parse(record.lastObservedAt) > Date.parse(record.lastCompleteSnapshotAt)
  ) {
    context.addIssue({
      code: "custom",
      message: "instrument continuity chronology is invalid",
      path: ["lastObservedAt"],
    });
  }
  if (
    record.currentState === "PRESENT" &&
    (record.consecutiveCompleteMisses !== 0 || record.missingSince !== null)
  ) {
    context.addIssue({
      code: "custom",
      message: "present instrument cannot retain missing evidence",
      path: ["currentState"],
    });
  }
  if (
    ["MISSING_UNCONFIRMED", "MISSING_CONFIRMED"].includes(record.currentState) &&
    (record.consecutiveCompleteMisses === 0 || record.missingSince === null)
  ) {
    context.addIssue({
      code: "custom",
      message: "missing instrument requires measured complete misses",
      path: ["consecutiveCompleteMisses"],
    });
  }
  if (
    record.currentState === "UNRESOLVED_IDENTITY" &&
    (
      record.currentIdentityFingerprint !== null ||
      record.currentIdentityEvidenceClass !== "UNRESOLVED" ||
      record.identityEpochs.length !== 0
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "unresolved identity cannot claim an identity epoch",
      path: ["identityEpochs"],
    });
  }
  if (
    record.currentState === "IDENTITY_EVIDENCE_GAP" &&
    (
      record.currentIdentityFingerprint === null ||
      record.currentIdentityEvidenceClass === "UNRESOLVED" ||
      record.identityEpochs.length === 0
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "identity evidence gap must retain the last verified epoch",
      path: ["identityEpochs"],
    });
  }
  if (
    record.currentState === "IDENTITY_CONFLICT" &&
    (
      record.observedIdentityFingerprints.length < 2 ||
      record.identityEpochs.length < 2 ||
      record.identityEpochs.some((epoch) => epoch.epochStatus !== "CONFLICTED")
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "identity conflict requires at least two conflicted epochs",
      path: ["identityEpochs"],
    });
  }
  const fingerprints = [...new Set(record.observedIdentityFingerprints)].sort();
  if (
    (record.currentIdentityFingerprint === null) !==
      (record.currentIdentityEvidenceClass === "UNRESOLVED")
  ) {
    context.addIssue({
      code: "custom",
      message: "identity evidence class and fingerprint disagree",
      path: ["currentIdentityEvidenceClass"],
    });
  }
  if (JSON.stringify(record.observedIdentityFingerprints) !== JSON.stringify(fingerprints)) {
    context.addIssue({
      code: "custom",
      message: "observed identity fingerprints must be unique and sorted",
      path: ["observedIdentityFingerprints"],
    });
  }
});

const ContinuityCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_FORWARD_INSTRUMENT_CONTINUITY_VERSION),
  ...M2ForwardInstrumentProvenanceSchema.shape,
  providerId: ForwardInstrumentProviderIdSchema,
  venue: TargetVenueSchema,
  authorityMode: z.literal("NO_AUTHORITY_RESEARCH_CAPTURE"),
  captureDirection: z.literal("FORWARD_ONLY_FROM_MEASURED_CAPTURE_START"),
  historicalBackfillAllowed: z.literal(false),
  historicalSourceGateResolved: z.literal(false),
  candidateEmissionAllowed: z.literal(false),
  generatedAt: IsoDateTimeSchema,
  previousContinuityDigest: DigestSchema.nullable(),
  captureStartedAt: IsoDateTimeSchema.nullable(),
  firstCompleteSnapshotAt: IsoDateTimeSchema.nullable(),
  lastCompleteSnapshotAt: IsoDateTimeSchema.nullable(),
  lastSnapshotId: NonEmptyStringSchema,
  lastSnapshotAt: IsoDateTimeSchema,
  cadencePolicy: M2ForwardInstrumentCadencePolicySchema,
  segmentSnapshots: z.array(LedgerSnapshotReferenceSchema).min(1),
  segmentGaps: z.array(ContinuityGapSchema),
  instruments: z.array(InstrumentContinuityRecordSchema),
  observedSnapshotCount: z.number().int().positive(),
  completeSnapshotCount: NonNegativeIntegerSchema,
  gapCount: NonNegativeIntegerSchema,
  activeCoverageGapCount: NonNegativeIntegerSchema,
  preCaptureIncompleteSnapshotCount: NonNegativeIntegerSchema,
  continuityStatus: z.enum(["FORWARD_ONLY_READY", "RESEARCH_ONLY"]),
  blockerReasonCodes: ReasonCodesSchema,
  declaredLimitations: ReasonCodesSchema,
});

type ContinuityCore = z.infer<typeof ContinuityCoreSchema>;

const CONTINUITY_LIMITATIONS = Object.freeze([
  "capture_has_no_validity_before_capture_started_at",
  "forward_continuity_does_not_resolve_historical_source_gate",
  "missing_confirmed_means_catalog_presence_loss_not_provider_delisting",
] as const);

function deriveContinuityAssessment(core: ContinuityCore): Readonly<{
  blockerReasonCodes: string[];
  continuityStatus: "FORWARD_ONLY_READY" | "RESEARCH_ONLY";
}> {
  const blockers = new Set<string>();
  if (core.completeSnapshotCount < 2) {
    blockers.add("forward_continuity_requires_two_complete_snapshots");
  }
  if (
    core.firstCompleteSnapshotAt === null ||
    core.lastCompleteSnapshotAt === null ||
    Date.parse(core.lastCompleteSnapshotAt) -
        Date.parse(core.firstCompleteSnapshotAt) <
      core.cadencePolicy.expectedCadenceMs
  ) {
    blockers.add("forward_continuity_observation_span_too_short");
  }
  if (core.activeCoverageGapCount > 0) {
    blockers.add("forward_continuity_contains_observation_gaps");
  }
  if (core.instruments.some((record) =>
    record.currentState === "UNRESOLVED_IDENTITY" ||
    record.currentState === "IDENTITY_EVIDENCE_GAP")) {
    blockers.add("forward_continuity_contains_unresolved_identity");
  }
  if (core.instruments.some((record) =>
    record.currentState === "IDENTITY_CONFLICT")) {
    blockers.add("forward_continuity_contains_identity_conflict");
  }
  if (core.captureStartedAt === null) {
    blockers.add("forward_continuity_capture_start_unmeasured");
  }
  const blockerReasonCodes = [...blockers].sort();
  return Object.freeze({
    blockerReasonCodes,
    continuityStatus: blockerReasonCodes.length === 0
      ? "FORWARD_ONLY_READY"
      : "RESEARCH_ONLY",
  });
}

export const M2ForwardInstrumentContinuitySchema =
  ContinuityCoreSchema.extend({
    continuityId: NonEmptyStringSchema,
    continuityDigest: DigestSchema,
  }).superRefine((continuity, context) => {
    const snapshotTimes = continuity.segmentSnapshots.map((snapshot) =>
      Date.parse(snapshot.sourceCutoff));
    if (snapshotTimes.some((time, index) =>
      index > 0 && time <= snapshotTimes[index - 1]!)) {
      context.addIssue({
        code: "custom",
        message: "continuity snapshots must be strictly chronological",
        path: ["segmentSnapshots"],
      });
    }
    if (continuity.segmentSnapshots.some((snapshot) =>
      snapshot.providerId !== continuity.providerId ||
      snapshot.venue !== continuity.venue ||
      snapshot.releaseId !== continuity.releaseId ||
      snapshot.captureConfigDigest !== continuity.captureConfigDigest)) {
      context.addIssue({
        code: "custom",
        message: "continuity segment cannot combine providers or venues",
        path: ["segmentSnapshots"],
      });
    }
    const segmentCompleteSnapshots = continuity.segmentSnapshots.filter(
      (snapshot) => snapshot.captureStatus === "COMPLETE",
    );
    let firstSegmentActiveGapCount = 0;
    let firstSegmentPreCaptureIncompleteCount = 0;
    let firstSegmentCoverageEstablished = false;
    for (const snapshot of continuity.segmentSnapshots) {
      const snapshotGapCount = continuity.segmentGaps.filter(
        (gap) => gap.snapshotId === snapshot.snapshotId,
      ).length;
      if (firstSegmentCoverageEstablished) {
        firstSegmentActiveGapCount += snapshotGapCount;
      }
      if (snapshot.captureStatus === "COMPLETE") {
        firstSegmentCoverageEstablished = true;
      } else if (!firstSegmentCoverageEstablished) {
        firstSegmentPreCaptureIncompleteCount += 1;
      }
    }
    if (
      continuity.observedSnapshotCount < continuity.segmentSnapshots.length ||
      continuity.completeSnapshotCount < segmentCompleteSnapshots.length ||
      continuity.gapCount < continuity.segmentGaps.length ||
      continuity.activeCoverageGapCount > continuity.gapCount ||
      continuity.preCaptureIncompleteSnapshotCount >
        continuity.observedSnapshotCount ||
      continuity.lastSnapshotId !== continuity.segmentSnapshots.at(-1)?.snapshotId ||
      continuity.lastSnapshotAt !==
        continuity.segmentSnapshots.at(-1)?.sourceCutoff
    ) {
      context.addIssue({
        code: "custom",
        message: "continuity chain accounting is inconsistent",
        path: ["completeSnapshotCount"],
      });
    }
    if (
      (continuity.completeSnapshotCount === 0) !==
        (continuity.firstCompleteSnapshotAt === null) ||
      (continuity.completeSnapshotCount === 0) !==
        (continuity.lastCompleteSnapshotAt === null) ||
      (segmentCompleteSnapshots.length > 0 &&
        continuity.lastCompleteSnapshotAt !==
          segmentCompleteSnapshots.at(-1)?.sourceCutoff) ||
      (continuity.previousContinuityDigest !== null &&
        continuity.observedSnapshotCount <= continuity.segmentSnapshots.length)
    ) {
      context.addIssue({
        code: "custom",
        message: "continuity cumulative observation bounds are inconsistent",
        path: ["lastCompleteSnapshotAt"],
      });
    }
    if (
      Date.parse(continuity.lastSnapshotAt) > Date.parse(continuity.generatedAt) ||
      (continuity.captureStartedAt !== null &&
        Date.parse(continuity.captureStartedAt) >
          Date.parse(continuity.lastSnapshotAt)) ||
      JSON.stringify(continuity.declaredLimitations) !==
        JSON.stringify(CONTINUITY_LIMITATIONS)
    ) {
      context.addIssue({
        code: "custom",
        message: "continuity chronology or limitations are inconsistent",
        path: ["generatedAt"],
      });
    }
    if (
      continuity.previousContinuityDigest === null &&
      (
        continuity.observedSnapshotCount !== continuity.segmentSnapshots.length ||
        continuity.completeSnapshotCount !== segmentCompleteSnapshots.length ||
        continuity.gapCount !== continuity.segmentGaps.length ||
        continuity.activeCoverageGapCount !== firstSegmentActiveGapCount ||
        continuity.preCaptureIncompleteSnapshotCount !==
          firstSegmentPreCaptureIncompleteCount ||
        continuity.firstCompleteSnapshotAt !==
          (segmentCompleteSnapshots[0]?.sourceCutoff ?? null) ||
        continuity.lastCompleteSnapshotAt !==
          (segmentCompleteSnapshots.at(-1)?.sourceCutoff ?? null)
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "first continuity checkpoint cannot claim prior observations",
        path: ["previousContinuityDigest"],
      });
    }
    for (const record of continuity.instruments) {
      if (
        record.currentState === "MISSING_CONFIRMED" &&
        (
          record.consecutiveCompleteMisses <
            continuity.cadencePolicy.completeMissesToConfirm ||
          Date.parse(record.lastCompleteSnapshotAt) -
              Date.parse(record.lastObservedAt) <
            continuity.cadencePolicy.minimumConfirmationElapsedMs
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "confirmed presence loss does not meet the frozen policy",
          path: ["instruments"],
        });
      }
    }
    const assessment = deriveContinuityAssessment(continuity);
    if (
      continuity.continuityStatus !== assessment.continuityStatus ||
      JSON.stringify(continuity.blockerReasonCodes) !==
        JSON.stringify(assessment.blockerReasonCodes)
    ) {
      context.addIssue({
        code: "custom",
        message: "continuity readiness does not match measured evidence",
        path: ["continuityStatus"],
      });
    }
    const { continuityId, continuityDigest, ...core } = continuity;
    if (continuityDigest !== stableContentHash(core)) {
      context.addIssue({
        code: "custom",
        message: "forward continuity digest mismatch",
        path: ["continuityDigest"],
      });
    }
    if (
      continuityId !==
        `forward-instrument-continuity:${continuityDigest.slice("sha256:".length)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "forward continuity identity mismatch",
        path: ["continuityId"],
      });
    }
  });

export type M2ForwardInstrumentContinuity = z.infer<
  typeof M2ForwardInstrumentContinuitySchema
>;

type MutableEpoch = z.infer<typeof IdentityEpochSchema>;
type MutableRecord = z.infer<typeof InstrumentContinuityRecordSchema>;

function identityEpoch(input: Readonly<{
  epochNumber: number;
  fingerprint: string;
  identityEvidenceClass: Exclude<
    ForwardIdentityEvidenceClass,
    "UNRESOLVED"
  >;
  providerRecordKey: string;
  snapshotId: string;
  sourceCutoff: string;
}>): MutableEpoch {
  return {
    identityEpochId: `forward-identity-epoch:${stableContentHash({
      epochNumber: input.epochNumber,
      fingerprint: input.fingerprint,
      providerRecordKey: input.providerRecordKey,
      firstObservedAt: input.sourceCutoff,
    }).slice("sha256:".length)}`,
    epochNumber: input.epochNumber,
    identityFingerprint: input.fingerprint,
    identityEvidenceClass: input.identityEvidenceClass,
    firstObservedAt: input.sourceCutoff,
    lastObservedAt: input.sourceCutoff,
    firstSnapshotId: input.snapshotId,
    lastSnapshotId: input.snapshotId,
    epochStatus: "ACTIVE",
  };
}

function markEpochsConflicted(record: MutableRecord): void {
  record.identityEpochs = record.identityEpochs.map((epoch) => ({
    ...epoch,
    epochStatus: "CONFLICTED",
  }));
}

function observeResolvedRecord(input: Readonly<{
  fingerprint: string;
  identityEvidenceClass: Exclude<
    ForwardIdentityEvidenceClass,
    "UNRESOLVED"
  >;
  providerRecordKey: string;
  providerStatus: InstrumentAccountingStatus;
  snapshotId: string;
  sourceCutoff: string;
  venueInstrumentId: string;
}>, existing: MutableRecord | undefined): MutableRecord {
  if (existing === undefined) {
    return {
      providerRecordKey: input.providerRecordKey,
      venueInstrumentId: input.venueInstrumentId,
      currentIdentityFingerprint: input.fingerprint,
      currentIdentityEvidenceClass: input.identityEvidenceClass,
      observedIdentityFingerprints: [input.fingerprint],
      currentState: "PRESENT",
      currentProviderStatus: input.providerStatus,
      firstObservedAt: input.sourceCutoff,
      lastObservedAt: input.sourceCutoff,
      lastCompleteSnapshotAt: input.sourceCutoff,
      missingSince: null,
      consecutiveCompleteMisses: 0,
      presenceEpoch: 1,
      identityEpochs: [identityEpoch({
        epochNumber: 1,
        fingerprint: input.fingerprint,
        identityEvidenceClass: input.identityEvidenceClass,
        providerRecordKey: input.providerRecordKey,
        snapshotId: input.snapshotId,
        sourceCutoff: input.sourceCutoff,
      })],
      delistingInferredFromAbsence: false,
    };
  }

  existing.lastCompleteSnapshotAt = input.sourceCutoff;
  existing.currentProviderStatus = input.providerStatus;
  const fingerprints = new Set(existing.observedIdentityFingerprints);
  fingerprints.add(input.fingerprint);
  existing.observedIdentityFingerprints = [...fingerprints].sort();
  if (
    existing.currentState === "IDENTITY_CONFLICT" ||
    existing.currentIdentityFingerprint !== input.fingerprint
  ) {
    if (!existing.identityEpochs.some((epoch) =>
      epoch.identityFingerprint === input.fingerprint)) {
      existing.identityEpochs.push(identityEpoch({
        epochNumber: existing.identityEpochs.length + 1,
        fingerprint: input.fingerprint,
        identityEvidenceClass: input.identityEvidenceClass,
        providerRecordKey: input.providerRecordKey,
        snapshotId: input.snapshotId,
        sourceCutoff: input.sourceCutoff,
      }));
    }
    markEpochsConflicted(existing);
    existing.currentIdentityFingerprint = input.fingerprint;
    existing.currentIdentityEvidenceClass = input.identityEvidenceClass;
    existing.currentState = "IDENTITY_CONFLICT";
    existing.lastObservedAt = input.sourceCutoff;
    existing.missingSince = null;
    existing.consecutiveCompleteMisses = 0;
    return existing;
  }

  if (existing.currentState === "MISSING_CONFIRMED") {
    existing.presenceEpoch += 1;
    existing.identityEpochs.push(identityEpoch({
      epochNumber: existing.identityEpochs.length + 1,
      fingerprint: input.fingerprint,
      identityEvidenceClass: input.identityEvidenceClass,
      providerRecordKey: input.providerRecordKey,
      snapshotId: input.snapshotId,
      sourceCutoff: input.sourceCutoff,
    }));
  } else {
    const epoch = existing.identityEpochs.at(-1);
    if (epoch !== undefined) {
      epoch.lastObservedAt = input.sourceCutoff;
      epoch.lastSnapshotId = input.snapshotId;
      epoch.epochStatus = "ACTIVE";
    }
  }
  existing.currentState = "PRESENT";
  existing.currentIdentityEvidenceClass = input.identityEvidenceClass;
  existing.lastObservedAt = input.sourceCutoff;
  existing.missingSince = null;
  existing.consecutiveCompleteMisses = 0;
  return existing;
}

function observeUnresolvedRecord(input: Readonly<{
  providerRecordKey: string;
  providerStatus: InstrumentAccountingStatus;
  sourceCutoff: string;
  venueInstrumentId: string | null;
}>, existing: MutableRecord | undefined): MutableRecord {
  if (existing === undefined) {
    return {
      providerRecordKey: input.providerRecordKey,
      venueInstrumentId: input.venueInstrumentId,
      currentIdentityFingerprint: null,
      currentIdentityEvidenceClass: "UNRESOLVED",
      observedIdentityFingerprints: [],
      currentState: "UNRESOLVED_IDENTITY",
      currentProviderStatus: input.providerStatus,
      firstObservedAt: input.sourceCutoff,
      lastObservedAt: input.sourceCutoff,
      lastCompleteSnapshotAt: input.sourceCutoff,
      missingSince: null,
      consecutiveCompleteMisses: 0,
      presenceEpoch: 1,
      identityEpochs: [],
      delistingInferredFromAbsence: false,
    };
  }
  existing.lastObservedAt = input.sourceCutoff;
  existing.lastCompleteSnapshotAt = input.sourceCutoff;
  existing.currentProviderStatus = input.providerStatus;
  if (
    existing.currentState !== "IDENTITY_CONFLICT" &&
    existing.currentIdentityFingerprint !== null
  ) {
    existing.currentState = "IDENTITY_EVIDENCE_GAP";
  }
  existing.missingSince = null;
  existing.consecutiveCompleteMisses = 0;
  return existing;
}

function markMissing(
  record: MutableRecord,
  sourceCutoff: string,
  policy: CadencePolicy,
): void {
  record.lastCompleteSnapshotAt = sourceCutoff;
  if (
    record.currentState === "IDENTITY_CONFLICT" ||
    record.currentState === "IDENTITY_EVIDENCE_GAP" ||
    record.currentState === "UNRESOLVED_IDENTITY"
  ) {
    return;
  }
  record.consecutiveCompleteMisses += 1;
  record.missingSince ??= sourceCutoff;
  const confirmed =
    record.consecutiveCompleteMisses >= policy.completeMissesToConfirm &&
    Date.parse(sourceCutoff) - Date.parse(record.lastObservedAt) >=
      policy.minimumConfirmationElapsedMs;
  record.currentState = confirmed
    ? "MISSING_CONFIRMED"
    : "MISSING_UNCONFIRMED";
  const epoch = record.identityEpochs.at(-1);
  if (epoch !== undefined) {
    epoch.epochStatus = record.currentState;
  }
}

export function buildM2ForwardInstrumentContinuity(input: Readonly<{
  generatedAt: string;
  policy?: CadencePolicy;
  previous?: M2ForwardInstrumentContinuity;
  provenance: M2ForwardInstrumentProvenance;
  snapshots: readonly M2ForwardInstrumentSnapshot[];
}>): M2ForwardInstrumentContinuity {
  if (input.snapshots.length === 0) {
    throw new Error("forward continuity requires at least one snapshot");
  }
  const policy = M2ForwardInstrumentCadencePolicySchema.parse(
    input.policy ?? M2_FORWARD_INSTRUMENT_DEFAULT_CADENCE_POLICY,
  );
  const provenance = M2ForwardInstrumentProvenanceSchema.parse(input.provenance);
  const previousContinuity = input.previous === undefined
    ? null
    : M2ForwardInstrumentContinuitySchema.parse(input.previous);
  if (
    previousContinuity !== null &&
    (
      JSON.stringify(previousContinuity.cadencePolicy) !== JSON.stringify(policy) ||
      previousContinuity.releaseId !== provenance.releaseId ||
      previousContinuity.captureConfigDigest !== provenance.captureConfigDigest
    )
  ) {
    throw new Error("forward continuity release or policy cannot change inside a chain");
  }
  const snapshots = input.snapshots
    .map((snapshot) => M2ForwardInstrumentSnapshotSchema.parse(snapshot))
    .sort((left, right) =>
      Date.parse(left.sourceCutoff) - Date.parse(right.sourceCutoff));
  const providerId = previousContinuity?.providerId ?? snapshots[0]!.providerId;
  const venue = previousContinuity?.venue ?? snapshots[0]!.venue;
  if (snapshots.some((snapshot) =>
    snapshot.providerId !== providerId ||
    snapshot.venue !== venue ||
    snapshot.releaseId !== provenance.releaseId ||
    snapshot.captureConfigDigest !== provenance.captureConfigDigest)) {
    throw new Error("forward continuity cannot combine providers or venues");
  }
  const snapshotDigests = snapshots.map((snapshot) => snapshot.snapshotDigest);
  if (new Set(snapshotDigests).size !== snapshotDigests.length) {
    throw new Error("forward continuity cannot contain duplicate snapshots");
  }
  const snapshotTimes = snapshots.map((snapshot) => Date.parse(snapshot.sourceCutoff));
  if (snapshotTimes.some((time, index) =>
    index > 0 && time <= snapshotTimes[index - 1]!)) {
    throw new Error("forward continuity snapshots must have unique increasing cutoffs");
  }
  if (
    previousContinuity !== null &&
    (
      snapshotTimes[0]! <= Date.parse(previousContinuity.lastSnapshotAt) ||
      Date.parse(input.generatedAt) <= Date.parse(previousContinuity.generatedAt)
    )
  ) {
    throw new Error("forward continuity checkpoint must advance time");
  }

  const gaps: z.infer<typeof ContinuityGapSchema>[] = [];
  const records = new Map<string, MutableRecord>(
    (previousContinuity?.instruments ?? []).map((record) => [
      record.providerRecordKey,
      InstrumentContinuityRecordSchema.parse(record),
    ]),
  );
  let previousSnapshotCutoff = previousContinuity?.lastSnapshotAt ?? null;
  let activeCoverageEstablished =
    (previousContinuity?.captureStartedAt ?? null) !== null;
  let activeCoverageGapDelta = 0;
  let preCaptureIncompleteDelta = 0;
  for (const snapshot of snapshots) {
    if (previousSnapshotCutoff !== null) {
      const elapsedMs = Date.parse(snapshot.sourceCutoff) -
        Date.parse(previousSnapshotCutoff);
      if (elapsedMs > policy.maximumGapMs) {
        gaps.push({
          gapId: `forward-continuity-gap:${stableContentHash({
            gapKind: "CADENCE_GAP",
            snapshotId: snapshot.snapshotId,
            elapsedMs,
          }).slice("sha256:".length)}`,
          gapKind: "CADENCE_GAP",
          observedAt: snapshot.sourceCutoff,
          elapsedMs,
          snapshotId: snapshot.snapshotId,
          reasonCodes: ["snapshot_arrived_after_maximum_cadence_gap"],
        });
        if (activeCoverageEstablished) {
          activeCoverageGapDelta += 1;
        }
      }
    }
    previousSnapshotCutoff = snapshot.sourceCutoff;
    if (snapshot.captureStatus !== "COMPLETE") {
      const gapKind = snapshot.captureStatus === "PARTIAL"
        ? "PARTIAL_SNAPSHOT" as const
        : "FAILED_SNAPSHOT" as const;
      gaps.push({
        gapId: `forward-continuity-gap:${stableContentHash({
          gapKind,
          snapshotId: snapshot.snapshotId,
        }).slice("sha256:".length)}`,
        gapKind,
        observedAt: snapshot.sourceCutoff,
        elapsedMs: null,
        snapshotId: snapshot.snapshotId,
        reasonCodes: [...snapshot.blockerReasonCodes],
      });
      if (activeCoverageEstablished) {
        activeCoverageGapDelta += 1;
      } else {
        preCaptureIncompleteDelta += 1;
      }
      continue;
    }

    activeCoverageEstablished = true;

    const presentKeys = new Set<string>();
    for (const item of snapshot.accounting) {
      presentKeys.add(item.providerRecordKey);
      const existing = records.get(item.providerRecordKey);
      const record = item.identityFingerprint === null ||
          item.identityEvidenceClass === "UNRESOLVED" ||
          item.accounting.venueInstrumentId === null
        ? observeUnresolvedRecord({
          providerRecordKey: item.providerRecordKey,
          providerStatus: item.accounting.status,
          sourceCutoff: snapshot.sourceCutoff,
          venueInstrumentId: item.accounting.venueInstrumentId,
        }, existing)
        : observeResolvedRecord({
          fingerprint: item.identityFingerprint,
          identityEvidenceClass: item.identityEvidenceClass,
          providerRecordKey: item.providerRecordKey,
          providerStatus: item.accounting.status,
          snapshotId: snapshot.snapshotId,
          sourceCutoff: snapshot.sourceCutoff,
          venueInstrumentId: item.accounting.venueInstrumentId,
        }, existing);
      records.set(item.providerRecordKey, record);
    }
    for (const [key, record] of records) {
      if (!presentKeys.has(key)) {
        markMissing(record, snapshot.sourceCutoff, policy);
      }
    }
  }

  const snapshotReferences = snapshots.map((snapshot) =>
    LedgerSnapshotReferenceSchema.parse({
      ...provenance,
      providerId: snapshot.providerId,
      venue: snapshot.venue,
      snapshotId: snapshot.snapshotId,
      snapshotDigest: snapshot.snapshotDigest,
      sourceCutoff: snapshot.sourceCutoff,
      captureStatus: snapshot.captureStatus,
      accountingCount: snapshot.accounting.length,
      rawEvidenceCount: snapshot.rawEvidence.length,
    }));
  const completeSnapshots = snapshots.filter(
    (snapshot) => snapshot.captureStatus === "COMPLETE",
  );
  const evidenceStarts = completeSnapshots
    .map((snapshot) => snapshot.evidenceStartedAt)
    .filter((value): value is string => value !== null)
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  const instruments = [...records.values()]
    .map((record) => InstrumentContinuityRecordSchema.parse(record))
    .sort((left, right) =>
      left.providerRecordKey.localeCompare(right.providerRecordKey));
  const draft = {
    schemaVersion: M2_FORWARD_INSTRUMENT_CONTINUITY_VERSION,
    ...provenance,
    providerId: providerId as ForwardInstrumentProviderId,
    venue,
    authorityMode: "NO_AUTHORITY_RESEARCH_CAPTURE" as const,
    captureDirection: "FORWARD_ONLY_FROM_MEASURED_CAPTURE_START" as const,
    historicalBackfillAllowed: false as const,
    historicalSourceGateResolved: false as const,
    candidateEmissionAllowed: false as const,
    generatedAt: input.generatedAt,
    previousContinuityDigest: previousContinuity?.continuityDigest ?? null,
    captureStartedAt:
      previousContinuity?.captureStartedAt ?? evidenceStarts[0] ?? null,
    firstCompleteSnapshotAt:
      previousContinuity?.firstCompleteSnapshotAt ??
      completeSnapshots[0]?.sourceCutoff ?? null,
    lastCompleteSnapshotAt:
      completeSnapshots.at(-1)?.sourceCutoff ??
      previousContinuity?.lastCompleteSnapshotAt ?? null,
    lastSnapshotId: snapshots.at(-1)!.snapshotId,
    lastSnapshotAt: snapshots.at(-1)!.sourceCutoff,
    cadencePolicy: policy,
    segmentSnapshots: snapshotReferences,
    segmentGaps: gaps.sort((left, right) =>
      Date.parse(left.observedAt) - Date.parse(right.observedAt) ||
      left.gapId.localeCompare(right.gapId)),
    instruments,
    observedSnapshotCount:
      (previousContinuity?.observedSnapshotCount ?? 0) + snapshots.length,
    completeSnapshotCount:
      (previousContinuity?.completeSnapshotCount ?? 0) + completeSnapshots.length,
    gapCount: (previousContinuity?.gapCount ?? 0) + gaps.length,
    activeCoverageGapCount:
      (previousContinuity?.activeCoverageGapCount ?? 0) +
      activeCoverageGapDelta,
    preCaptureIncompleteSnapshotCount:
      (previousContinuity?.preCaptureIncompleteSnapshotCount ?? 0) +
      preCaptureIncompleteDelta,
    continuityStatus: "RESEARCH_ONLY" as const,
    blockerReasonCodes: [] as string[],
    declaredLimitations: [...CONTINUITY_LIMITATIONS],
  };
  const assessment = deriveContinuityAssessment(
    ContinuityCoreSchema.parse(draft),
  );
  const core = ContinuityCoreSchema.parse({ ...draft, ...assessment });
  const continuityDigest = stableContentHash(core);
  return deepFreezeArtifact(M2ForwardInstrumentContinuitySchema.parse({
    ...core,
    continuityId:
      `forward-instrument-continuity:${continuityDigest.slice("sha256:".length)}`,
    continuityDigest,
  }));
}
