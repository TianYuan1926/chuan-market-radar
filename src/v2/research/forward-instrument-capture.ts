import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  CapturedCatalogPage,
  ForwardCatalogCaptureAttempt,
  ForwardInstrumentProviderId,
} from "../modules/universe/adapters/forward-catalog-capture-adapter";
import {
  forwardProviderOwnsRequest,
} from "../modules/universe/adapters/forward-catalog-capture-adapter";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../modules/universe/stable-artifact";
import { InstrumentAccountingRecordSchema } from "../runtime-schema/foundation-schemas";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  ReasonCodesSchema,
} from "../runtime-schema/primitives";

export const M2_FORWARD_INSTRUMENT_RAW_EVIDENCE_VERSION =
  "v2-m2-forward-instrument-raw-evidence.v1" as const;
export const M2_FORWARD_INSTRUMENT_SNAPSHOT_VERSION =
  "v2-m2-forward-instrument-snapshot.v1" as const;
export const M2_FORWARD_INSTRUMENT_BATCH_VERSION =
  "v2-m2-forward-instrument-batch.v1" as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const MAX_FORWARD_RAW_BYTES = 10 * 1024 * 1024;
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
const HttpsUrlSchema = z.string().url().superRefine((value, context) => {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    context.addIssue({
      code: "custom",
      message: "forward capture evidence requires credential-free HTTPS",
    });
  }
});

const PROVIDER_VENUE = Object.freeze({
  BINANCE_USDS_FUTURES: "BINANCE_FUTURES",
  OKX_SWAP: "OKX_SWAP",
  BYBIT_LINEAR_PERPETUAL: "BYBIT_LINEAR_PERPETUAL",
} as const satisfies Record<ForwardInstrumentProviderId, string>);

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function forwardProviderVenueMatches(
  providerId: ForwardInstrumentProviderId,
  venue: string,
) {
  return PROVIDER_VENUE[providerId] === venue;
}

const ForwardRawEvidenceCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_FORWARD_INSTRUMENT_RAW_EVIDENCE_VERSION),
  providerId: ForwardInstrumentProviderIdSchema,
  requestId: DigestSchema,
  requestSequence: NonNegativeIntegerSchema,
  requestUrl: HttpsUrlSchema,
  receivedAt: IsoDateTimeSchema,
  status: z.number().int().min(200).max(299),
  contentDigest: DigestSchema,
  contentBytes: z.number().int().positive().max(MAX_FORWARD_RAW_BYTES),
  storageKey: z.string().regex(/^raw\/sha256\/[0-9a-f]{64}\.json$/u),
  retentionClass: z.literal("EXTERNAL_CONTENT_ADDRESSED_EVIDENCE_STORE"),
  authorityMode: z.literal("NO_AUTHORITY_RESEARCH_CAPTURE"),
});

export const M2ForwardInstrumentRawEvidenceSchema =
  ForwardRawEvidenceCoreSchema.extend({
    evidenceId: NonEmptyStringSchema,
    evidenceDigest: DigestSchema,
  }).superRefine((evidence, context) => {
    const { evidenceId, evidenceDigest, ...core } = evidence;
    if (evidenceDigest !== stableContentHash(core)) {
      context.addIssue({
        code: "custom",
        message: "forward raw evidence digest mismatch",
        path: ["evidenceDigest"],
      });
    }
    const hex = evidence.contentDigest.slice("sha256:".length);
    if (
      evidence.storageKey !== `raw/sha256/${hex}.json` ||
      evidenceId !== `forward-instrument-raw:${hex}`
    ) {
      context.addIssue({
        code: "custom",
        message: "forward raw evidence content address mismatch",
        path: ["storageKey"],
      });
    }
    if (
      evidence.requestId !== stableContentHash({
        providerId: evidence.providerId,
        requestSequence: evidence.requestSequence,
        requestUrl: evidence.requestUrl,
      }) ||
      !forwardProviderOwnsRequest(evidence.providerId, evidence.requestUrl)
    ) {
      context.addIssue({
        code: "custom",
        message: "forward raw evidence request binding mismatch",
        path: ["requestId"],
      });
    }
  });

export type M2ForwardInstrumentRawEvidence = z.infer<
  typeof M2ForwardInstrumentRawEvidenceSchema
>;

export function buildM2ForwardInstrumentRawEvidence(
  page: CapturedCatalogPage,
): M2ForwardInstrumentRawEvidence {
  const measuredDigest = `sha256:${createHash("sha256")
    .update(page.rawBody)
    .digest("hex")}`;
  if (
    page.rawBody.byteLength !== page.bodyBytes ||
    measuredDigest !== page.bodyDigest
  ) {
    throw new Error("captured catalog page bytes do not match transport evidence");
  }
  const contentHex = measuredDigest.slice("sha256:".length);
  const core = ForwardRawEvidenceCoreSchema.parse({
    schemaVersion: M2_FORWARD_INSTRUMENT_RAW_EVIDENCE_VERSION,
    providerId: page.providerId,
    requestId: page.requestId,
    requestSequence: page.requestSequence,
    requestUrl: page.requestUrl,
    receivedAt: page.receivedAt,
    status: page.status,
    contentDigest: measuredDigest,
    contentBytes: page.bodyBytes,
    storageKey: `raw/sha256/${contentHex}.json`,
    retentionClass: "EXTERNAL_CONTENT_ADDRESSED_EVIDENCE_STORE",
    authorityMode: "NO_AUTHORITY_RESEARCH_CAPTURE",
  });
  return deepFreezeArtifact(M2ForwardInstrumentRawEvidenceSchema.parse({
    ...core,
    evidenceId: `forward-instrument-raw:${contentHex}`,
    evidenceDigest: stableContentHash(core),
  }));
}

export function forwardProviderRecordKey(input: Readonly<{
  observationId: string;
  providerId: ForwardInstrumentProviderId;
  venueInstrumentId: string | null;
}>): string {
  return input.venueInstrumentId === null
    ? `${input.providerId}:UNRESOLVED:${input.observationId}`
    : `${input.providerId}:${input.venueInstrumentId}`;
}

export function forwardIdentityFingerprint(input: Readonly<{
  baseAsset: string | null;
  canonicalInstrumentId: string | null;
  contractSize: string | null;
  contractType: string | null;
  quoteAsset: string | null;
  settlementAsset: string | null;
  underlyingGroupId: string | null;
  venue: string;
  venueInstrumentId: string | null;
}>): string | null {
  if (
    input.baseAsset === null ||
    input.canonicalInstrumentId === null ||
    input.contractSize === null ||
    input.contractType === null ||
    input.quoteAsset === null ||
    input.settlementAsset === null ||
    input.underlyingGroupId === null ||
    input.venueInstrumentId === null
  ) {
    return null;
  }
  return stableContentHash({
    baseAsset: input.baseAsset,
    canonicalInstrumentId: input.canonicalInstrumentId,
    contractSize: input.contractSize,
    contractType: input.contractType,
    quoteAsset: input.quoteAsset,
    settlementAsset: input.settlementAsset,
    underlyingGroupId: input.underlyingGroupId,
    venue: input.venue,
    venueInstrumentId: input.venueInstrumentId,
  });
}

export const M2ForwardInstrumentSnapshotRecordSchema = z.strictObject({
  providerId: ForwardInstrumentProviderIdSchema,
  providerRecordKey: NonEmptyStringSchema,
  identityFingerprint: DigestSchema.nullable(),
  accounting: InstrumentAccountingRecordSchema,
}).superRefine((record, context) => {
  const expectedKey = forwardProviderRecordKey({
    observationId: record.accounting.observationId,
    providerId: record.providerId,
    venueInstrumentId: record.accounting.venueInstrumentId,
  });
  if (record.providerRecordKey !== expectedKey) {
    context.addIssue({
      code: "custom",
      message: "forward provider record key mismatch",
      path: ["providerRecordKey"],
    });
  }
  const expectedFingerprint = forwardIdentityFingerprint(record.accounting);
  if (record.identityFingerprint !== expectedFingerprint) {
    context.addIssue({
      code: "custom",
      message: "forward identity fingerprint mismatch",
      path: ["identityFingerprint"],
    });
  }
});

const SnapshotDenominatorSchema = z.strictObject({
  state: z.enum(["COMPLETE", "PARTIAL", "UNAVAILABLE"]),
  providerRowCount: NonNegativeIntegerSchema,
  normalizedRowCount: NonNegativeIntegerSchema,
  sourceRecordIdCount: NonNegativeIntegerSchema,
  uniqueObservationIdCount: NonNegativeIntegerSchema,
  allProviderRowsAccounted: z.boolean(),
});

const ForwardSnapshotCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_FORWARD_INSTRUMENT_SNAPSHOT_VERSION),
  providerId: ForwardInstrumentProviderIdSchema,
  venue: TargetVenueSchema,
  authorityMode: z.literal("NO_AUTHORITY_RESEARCH_CAPTURE"),
  captureDirection: z.literal("FORWARD_ONLY_FROM_MEASURED_CAPTURE_START"),
  historicalBackfillAllowed: z.literal(false),
  candidateEmissionAllowed: z.literal(false),
  attemptStartedAt: IsoDateTimeSchema,
  attemptCompletedAt: IsoDateTimeSchema,
  evidenceStartedAt: IsoDateTimeSchema.nullable(),
  sourceCutoff: IsoDateTimeSchema,
  generatedAt: IsoDateTimeSchema,
  catalogOk: z.boolean(),
  catalogFailureReasonCode: NonEmptyStringSchema.nullable(),
  catalogPageCount: NonNegativeIntegerSchema,
  requestCount: NonNegativeIntegerSchema,
  requestFailureReasonCodes: ReasonCodesSchema,
  sourceRecordIds: z.array(NonEmptyStringSchema),
  rawEvidence: z.array(M2ForwardInstrumentRawEvidenceSchema),
  accounting: z.array(M2ForwardInstrumentSnapshotRecordSchema),
  denominator: SnapshotDenominatorSchema,
  captureStatus: z.enum(["COMPLETE", "PARTIAL", "FAILED"]),
  blockerReasonCodes: ReasonCodesSchema,
  declaredLimitations: ReasonCodesSchema,
});

type SnapshotAssessmentInput = z.infer<typeof ForwardSnapshotCoreSchema>;

function deriveSnapshotAssessment(snapshot: SnapshotAssessmentInput): Readonly<{
  blockerReasonCodes: string[];
  captureStatus: "COMPLETE" | "PARTIAL" | "FAILED";
}> {
  const blockers = new Set<string>();
  if (!snapshot.catalogOk) {
    blockers.add(snapshot.catalogFailureReasonCode ?? "catalog_capture_failed");
  }
  if (snapshot.requestCount === 0) {
    blockers.add("catalog_request_not_attempted");
  }
  if (snapshot.rawEvidence.length === 0) {
    blockers.add("catalog_raw_evidence_missing");
  }
  if (
    snapshot.rawEvidence.length !== snapshot.catalogPageCount ||
    snapshot.rawEvidence.length !== snapshot.requestCount ||
    snapshot.rawEvidence.some((item, index) => item.requestSequence !== index)
  ) {
    blockers.add("catalog_raw_page_evidence_incomplete");
  }
  if (snapshot.requestFailureReasonCodes.length > 0) {
    blockers.add("catalog_request_failure_observed");
  }
  if (!snapshot.denominator.allProviderRowsAccounted) {
    blockers.add("catalog_accounting_denominator_incomplete");
  }
  const providerKeys = snapshot.accounting.map((record) => record.providerRecordKey);
  if (new Set(providerKeys).size !== providerKeys.length) {
    blockers.add("catalog_provider_record_key_duplicate");
  }
  const complete = snapshot.catalogOk && blockers.size === 0;
  return Object.freeze({
    blockerReasonCodes: [...blockers].sort(),
    captureStatus: complete
      ? "COMPLETE"
      : snapshot.rawEvidence.length > 0 || snapshot.accounting.length > 0
        ? "PARTIAL"
        : "FAILED",
  });
}

function derivedSnapshotLimitations(
  accounting: readonly z.infer<typeof M2ForwardInstrumentSnapshotRecordSchema>[],
): string[] {
  return uniqueSorted([
    "capture_has_no_validity_before_evidence_started_at",
    "current_snapshot_does_not_prove_provider_onboard_time",
    "current_snapshot_does_not_prove_provider_delist_time",
    "disappearance_does_not_prove_delisting",
    ...(accounting.some((record) => record.identityFingerprint === null)
      ? ["unresolved_identity_rows_retained_in_denominator"]
      : []),
  ]);
}

export const M2ForwardInstrumentSnapshotSchema =
  ForwardSnapshotCoreSchema.extend({
    snapshotId: NonEmptyStringSchema,
    snapshotDigest: DigestSchema,
  }).superRefine((snapshot, context) => {
    if (!forwardProviderVenueMatches(snapshot.providerId, snapshot.venue)) {
      context.addIssue({
        code: "custom",
        message: "forward provider and venue do not match",
        path: ["venue"],
      });
    }
    const startedAt = Date.parse(snapshot.attemptStartedAt);
    const completedAt = Date.parse(snapshot.attemptCompletedAt);
    if (
      startedAt > completedAt ||
      completedAt > Date.parse(snapshot.generatedAt) ||
      Date.parse(snapshot.sourceCutoff) > Date.parse(snapshot.generatedAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "forward snapshot chronology is invalid",
        path: ["generatedAt"],
      });
    }
    if (
      snapshot.evidenceStartedAt !== null &&
      (
        Date.parse(snapshot.evidenceStartedAt) < startedAt ||
        Date.parse(snapshot.evidenceStartedAt) > completedAt
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "forward evidence start is outside the measured attempt",
        path: ["evidenceStartedAt"],
      });
    }
    const recordIds = snapshot.accounting.map(
      (record) => record.accounting.observationId,
    );
    const sourceRecordIds = snapshot.sourceRecordIds;
    const sourceRecordIdSet = new Set(sourceRecordIds);
    const expectedDenominator = {
      state: snapshot.catalogOk ? "COMPLETE" : recordIds.length > 0
        ? "PARTIAL"
        : "UNAVAILABLE",
      providerRowCount: recordIds.length,
      normalizedRowCount: snapshot.accounting.length,
      sourceRecordIdCount: sourceRecordIds.length,
      uniqueObservationIdCount: new Set(recordIds).size,
      allProviderRowsAccounted:
        snapshot.catalogOk &&
        sourceRecordIds.length === recordIds.length &&
        sourceRecordIdSet.size === sourceRecordIds.length &&
        new Set(recordIds).size === recordIds.length &&
        recordIds.every((id) => sourceRecordIdSet.has(id)),
    };
    if (JSON.stringify(snapshot.denominator) !== JSON.stringify(expectedDenominator)) {
      context.addIssue({
        code: "custom",
        message: "forward snapshot denominator is not derived from all rows",
        path: ["denominator"],
      });
    }
    const assessment = deriveSnapshotAssessment(snapshot);
    if (
      snapshot.captureStatus !== assessment.captureStatus ||
      !sameStrings(snapshot.blockerReasonCodes, assessment.blockerReasonCodes)
    ) {
      context.addIssue({
        code: "custom",
        message: "forward snapshot assessment does not match evidence",
        path: ["captureStatus"],
      });
    }
    const rawRequestIds = snapshot.rawEvidence.map((item) => item.requestId);
    const rawRequestSequences = snapshot.rawEvidence.map(
      (item) => item.requestSequence,
    );
    const evidenceStartedAt = snapshot.rawEvidence.length === 0
      ? null
      : snapshot.rawEvidence
        .map((item) => item.receivedAt)
        .sort((left, right) => Date.parse(left) - Date.parse(right))[0]!;
    const latestRawReceivedAt = snapshot.rawEvidence.length === 0
      ? null
      : snapshot.rawEvidence
        .map((item) => item.receivedAt)
        .sort((left, right) => Date.parse(left) - Date.parse(right))
        .at(-1)!;
    if (
      snapshot.accounting.some((record) =>
        record.providerId !== snapshot.providerId ||
        record.accounting.venue !== snapshot.venue) ||
      snapshot.rawEvidence.some((item) => item.providerId !== snapshot.providerId) ||
      new Set(rawRequestIds).size !== rawRequestIds.length ||
      new Set(rawRequestSequences).size !== rawRequestSequences.length ||
      snapshot.evidenceStartedAt !== evidenceStartedAt
    ) {
      context.addIssue({
        code: "custom",
        message: "forward snapshot evidence is not bound to one provider attempt",
        path: ["rawEvidence"],
      });
    }
    if (snapshot.catalogOk && latestRawReceivedAt !== snapshot.sourceCutoff) {
      context.addIssue({
        code: "custom",
        message: "complete catalog cutoff must equal its final raw page",
        path: ["sourceCutoff"],
      });
    }
    if (
      snapshot.rawEvidence.some((item) =>
        Date.parse(item.receivedAt) < startedAt ||
        Date.parse(item.receivedAt) > completedAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "forward raw page falls outside its measured attempt",
        path: ["rawEvidence"],
      });
    }
    if (
      snapshot.catalogOk !== (snapshot.catalogFailureReasonCode === null) ||
      !sameStrings(snapshot.sourceRecordIds, uniqueSorted(snapshot.sourceRecordIds)) ||
      !sameStrings(
        snapshot.declaredLimitations,
        derivedSnapshotLimitations(snapshot.accounting),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "forward snapshot source truth or limitations are inconsistent",
        path: ["catalogOk"],
      });
    }
    if (
      !sameStrings(
        snapshot.requestFailureReasonCodes,
        uniqueSorted(snapshot.requestFailureReasonCodes),
      ) ||
      !sameStrings(
        snapshot.declaredLimitations,
        uniqueSorted(snapshot.declaredLimitations),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "forward snapshot reason codes must be unique and sorted",
        path: ["declaredLimitations"],
      });
    }
    const { snapshotId, snapshotDigest, ...core } = snapshot;
    if (snapshotDigest !== stableContentHash(core)) {
      context.addIssue({
        code: "custom",
        message: "forward snapshot digest mismatch",
        path: ["snapshotDigest"],
      });
    }
    if (
      snapshotId !==
        `forward-instrument-snapshot:${snapshotDigest.slice("sha256:".length)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "forward snapshot identity mismatch",
        path: ["snapshotId"],
      });
    }
  });

export type M2ForwardInstrumentSnapshot = z.infer<
  typeof M2ForwardInstrumentSnapshotSchema
>;

export function buildM2ForwardInstrumentSnapshot(input: Readonly<{
  attempt: ForwardCatalogCaptureAttempt;
  generatedAt: string;
  rawEvidence: readonly M2ForwardInstrumentRawEvidence[];
}>): M2ForwardInstrumentSnapshot {
  const accounting = input.attempt.catalog.accounting.map((rawRecord) => {
    const record = InstrumentAccountingRecordSchema.parse(rawRecord);
    return M2ForwardInstrumentSnapshotRecordSchema.parse({
      providerId: input.attempt.providerId,
      providerRecordKey: forwardProviderRecordKey({
        observationId: record.observationId,
        providerId: input.attempt.providerId,
        venueInstrumentId: record.venueInstrumentId,
      }),
      identityFingerprint: forwardIdentityFingerprint(record),
      accounting: record,
    });
  }).sort((left, right) =>
    left.providerRecordKey.localeCompare(right.providerRecordKey) ||
    left.accounting.observationId.localeCompare(right.accounting.observationId));
  const observationIds = accounting.map((record) => record.accounting.observationId);
  const sourceRecordIds = [...input.attempt.catalog.sourceRecordIds].sort();
  const sourceIdSet = new Set(sourceRecordIds);
  const allProviderRowsAccounted =
    input.attempt.catalog.ok &&
    sourceRecordIds.length === observationIds.length &&
    sourceIdSet.size === sourceRecordIds.length &&
    observationIds.every((id) => sourceIdSet.has(id));
  const rawEvidence = [...input.rawEvidence]
    .map((evidence) => M2ForwardInstrumentRawEvidenceSchema.parse(evidence))
    .sort((left, right) => left.requestSequence - right.requestSequence);
  if (rawEvidence.some((evidence) =>
    evidence.providerId !== input.attempt.providerId)) {
    throw new Error("raw evidence provider does not match catalog attempt");
  }
  const requestFailureReasonCodes = uniqueSorted(
    input.attempt.requestFailures.map((failure) => failure.reasonCode),
  );
  const denominator = SnapshotDenominatorSchema.parse({
    state: input.attempt.catalog.ok
      ? "COMPLETE"
      : accounting.length > 0 ? "PARTIAL" : "UNAVAILABLE",
    providerRowCount: observationIds.length,
    normalizedRowCount: accounting.length,
    sourceRecordIdCount: sourceRecordIds.length,
    uniqueObservationIdCount: new Set(observationIds).size,
    allProviderRowsAccounted,
  });
  const evidenceStartedAt = rawEvidence.length === 0
    ? null
    : rawEvidence
      .map((evidence) => evidence.receivedAt)
      .sort((left, right) => Date.parse(left) - Date.parse(right))[0]!;
  const draft = {
    schemaVersion: M2_FORWARD_INSTRUMENT_SNAPSHOT_VERSION,
    providerId: input.attempt.providerId,
    venue: input.attempt.venue,
    authorityMode: "NO_AUTHORITY_RESEARCH_CAPTURE" as const,
    captureDirection: "FORWARD_ONLY_FROM_MEASURED_CAPTURE_START" as const,
    historicalBackfillAllowed: false as const,
    candidateEmissionAllowed: false as const,
    attemptStartedAt: input.attempt.startedAt,
    attemptCompletedAt: input.attempt.completedAt,
    evidenceStartedAt,
    sourceCutoff: input.attempt.catalog.receivedAt,
    generatedAt: input.generatedAt,
    catalogOk: input.attempt.catalog.ok,
    catalogFailureReasonCode: input.attempt.catalog.ok
      ? null
      : input.attempt.catalog.failure.reasonCode,
    catalogPageCount: input.attempt.catalog.pageCount,
    requestCount: input.attempt.requestCount,
    requestFailureReasonCodes,
    sourceRecordIds,
    rawEvidence,
    accounting,
    denominator,
    captureStatus: "FAILED" as const,
    blockerReasonCodes: [] as string[],
    declaredLimitations: derivedSnapshotLimitations(accounting),
  };
  const assessment = deriveSnapshotAssessment(
    ForwardSnapshotCoreSchema.parse(draft),
  );
  const core = ForwardSnapshotCoreSchema.parse({
    ...draft,
    ...assessment,
  });
  const snapshotDigest = stableContentHash(core);
  return deepFreezeArtifact(M2ForwardInstrumentSnapshotSchema.parse({
    ...core,
    snapshotId:
      `forward-instrument-snapshot:${snapshotDigest.slice("sha256:".length)}`,
    snapshotDigest,
  }));
}

const BatchSnapshotReferenceSchema = z.strictObject({
  providerId: ForwardInstrumentProviderIdSchema,
  venue: TargetVenueSchema,
  snapshotId: NonEmptyStringSchema,
  snapshotDigest: DigestSchema,
  captureStatus: z.enum(["COMPLETE", "PARTIAL", "FAILED"]),
  evidenceStartedAt: IsoDateTimeSchema.nullable(),
  generatedAt: IsoDateTimeSchema,
  accountingCount: NonNegativeIntegerSchema,
  unresolvedIdentityCount: NonNegativeIntegerSchema,
});

const ForwardBatchCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_FORWARD_INSTRUMENT_BATCH_VERSION),
  authorityMode: z.literal("NO_AUTHORITY_RESEARCH_CAPTURE"),
  captureDirection: z.literal("FORWARD_ONLY_FROM_MEASURED_CAPTURE_START"),
  historicalBackfillAllowed: z.literal(false),
  historicalSourceGateResolved: z.literal(false),
  bulkHistoricalAcquisitionAllowed: z.literal(false),
  candidateEmissionAllowed: z.literal(false),
  generatedAt: IsoDateTimeSchema,
  evidenceStartedAt: IsoDateTimeSchema.nullable(),
  snapshots: z.array(BatchSnapshotReferenceSchema).length(3),
  batchStatus: z.enum(["COMPLETE", "PARTIAL", "FAILED"]),
  blockerReasonCodes: ReasonCodesSchema,
});

function deriveBatchAssessment(
  snapshots: readonly z.infer<typeof BatchSnapshotReferenceSchema>[],
): Readonly<{
  batchStatus: "COMPLETE" | "PARTIAL" | "FAILED";
  blockerReasonCodes: string[];
}> {
  const blockers = new Set<string>();
  const providerIds = new Set(snapshots.map((snapshot) => snapshot.providerId));
  for (const providerId of ForwardInstrumentProviderIdSchema.options) {
    if (!providerIds.has(providerId)) {
      blockers.add(`forward_snapshot_missing_${providerId.toLowerCase()}`);
    }
  }
  for (const snapshot of snapshots) {
    if (snapshot.captureStatus !== "COMPLETE") {
      blockers.add(
        `forward_snapshot_${snapshot.providerId.toLowerCase()}_${snapshot.captureStatus.toLowerCase()}`,
      );
    }
  }
  const complete = blockers.size === 0 && snapshots.length === 3;
  return Object.freeze({
    batchStatus: complete
      ? "COMPLETE"
      : snapshots.some((snapshot) => snapshot.captureStatus !== "FAILED")
        ? "PARTIAL"
        : "FAILED",
    blockerReasonCodes: [...blockers].sort(),
  });
}

export const M2ForwardInstrumentBatchSchema = ForwardBatchCoreSchema.extend({
  batchId: NonEmptyStringSchema,
  batchDigest: DigestSchema,
}).superRefine((batch, context) => {
  const providers = batch.snapshots.map((snapshot) => snapshot.providerId);
  const venues = batch.snapshots.map((snapshot) => snapshot.venue);
  if (
    new Set(providers).size !== providers.length ||
    new Set(venues).size !== venues.length ||
    batch.snapshots.some((snapshot) =>
      !forwardProviderVenueMatches(snapshot.providerId, snapshot.venue))
  ) {
    context.addIssue({
      code: "custom",
      message: "forward batch must contain each provider and venue exactly once",
      path: ["snapshots"],
    });
  }
  const assessment = deriveBatchAssessment(batch.snapshots);
  if (
    batch.batchStatus !== assessment.batchStatus ||
    !sameStrings(batch.blockerReasonCodes, assessment.blockerReasonCodes)
  ) {
    context.addIssue({
      code: "custom",
      message: "forward batch assessment does not match its snapshots",
      path: ["batchStatus"],
    });
  }
  const sortedProviders = [...providers].sort();
  const evidenceStarts = batch.snapshots
    .map((snapshot) => snapshot.evidenceStartedAt)
    .filter((value): value is string => value !== null)
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  if (
    !sameStrings(providers, sortedProviders) ||
    batch.evidenceStartedAt !== (evidenceStarts[0] ?? null) ||
    batch.snapshots.some((snapshot) =>
      Date.parse(snapshot.generatedAt) > Date.parse(batch.generatedAt))
  ) {
    context.addIssue({
      code: "custom",
      message: "forward batch chronology or canonical order is invalid",
      path: ["snapshots"],
    });
  }
  const { batchId, batchDigest, ...core } = batch;
  if (batchDigest !== stableContentHash(core)) {
    context.addIssue({
      code: "custom",
      message: "forward batch digest mismatch",
      path: ["batchDigest"],
    });
  }
  if (
    batchId !== `forward-instrument-batch:${batchDigest.slice("sha256:".length)}`
  ) {
    context.addIssue({
      code: "custom",
      message: "forward batch identity mismatch",
      path: ["batchId"],
    });
  }
});

export type M2ForwardInstrumentBatch = z.infer<
  typeof M2ForwardInstrumentBatchSchema
>;

export function buildM2ForwardInstrumentBatch(input: Readonly<{
  generatedAt: string;
  snapshots: readonly M2ForwardInstrumentSnapshot[];
}>): M2ForwardInstrumentBatch {
  const snapshots = input.snapshots.map((rawSnapshot) => {
    const snapshot = M2ForwardInstrumentSnapshotSchema.parse(rawSnapshot);
    return BatchSnapshotReferenceSchema.parse({
      providerId: snapshot.providerId,
      venue: snapshot.venue,
      snapshotId: snapshot.snapshotId,
      snapshotDigest: snapshot.snapshotDigest,
      captureStatus: snapshot.captureStatus,
      evidenceStartedAt: snapshot.evidenceStartedAt,
      generatedAt: snapshot.generatedAt,
      accountingCount: snapshot.accounting.length,
      unresolvedIdentityCount: snapshot.accounting.filter(
        (record) => record.identityFingerprint === null,
      ).length,
    });
  }).sort((left, right) => left.providerId.localeCompare(right.providerId));
  const evidenceStarts = input.snapshots
    .map((snapshot) => snapshot.evidenceStartedAt)
    .filter((value): value is string => value !== null)
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  const assessment = deriveBatchAssessment(snapshots);
  const core = ForwardBatchCoreSchema.parse({
    schemaVersion: M2_FORWARD_INSTRUMENT_BATCH_VERSION,
    authorityMode: "NO_AUTHORITY_RESEARCH_CAPTURE",
    captureDirection: "FORWARD_ONLY_FROM_MEASURED_CAPTURE_START",
    historicalBackfillAllowed: false,
    historicalSourceGateResolved: false,
    bulkHistoricalAcquisitionAllowed: false,
    candidateEmissionAllowed: false,
    generatedAt: input.generatedAt,
    evidenceStartedAt: evidenceStarts[0] ?? null,
    snapshots,
    ...assessment,
  });
  const batchDigest = stableContentHash(core);
  return deepFreezeArtifact(M2ForwardInstrumentBatchSchema.parse({
    ...core,
    batchId: `forward-instrument-batch:${batchDigest.slice("sha256:".length)}`,
    batchDigest,
  }));
}
