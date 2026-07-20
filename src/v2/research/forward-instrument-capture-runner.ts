import { z } from "zod";
import {
  captureThreeVenueForwardCatalogs,
  type ForwardInstrumentProviderId,
} from "../modules/universe/adapters/forward-catalog-capture-adapter";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../modules/universe/stable-artifact";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
} from "../runtime-schema/primitives";
import {
  buildM2ForwardInstrumentBatch,
  buildM2ForwardInstrumentRawEvidence,
  buildM2ForwardInstrumentSnapshot,
  forwardProviderVenueMatches,
  M2ForwardInstrumentBatchSchema,
  type M2ForwardInstrumentBatch,
  type M2ForwardInstrumentSnapshot,
} from "./forward-instrument-capture";
import {
  buildM2ForwardInstrumentContinuity,
  M2ForwardInstrumentContinuitySchema,
  type M2ForwardInstrumentContinuity,
} from "./forward-instrument-continuity";
import {
  createM2ForwardInstrumentEvidenceStore,
  M2ForwardInstrumentArtifactReferenceSchema,
  type M2ForwardInstrumentArtifactReference,
} from "./forward-instrument-evidence-store";

export const M2_FORWARD_INSTRUMENT_CAPTURE_JOURNAL_VERSION =
  "v2-m2-forward-instrument-capture-journal.v1" as const;

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

const SnapshotArtifactBindingSchema = z.strictObject({
  providerId: ForwardInstrumentProviderIdSchema,
  venue: TargetVenueSchema,
  captureStatus: z.enum(["COMPLETE", "PARTIAL", "FAILED"]),
  generatedAt: IsoDateTimeSchema,
  artifact: M2ForwardInstrumentArtifactReferenceSchema,
});

const ContinuityArtifactBindingSchema = z.strictObject({
  providerId: ForwardInstrumentProviderIdSchema,
  venue: TargetVenueSchema,
  continuityStatus: z.enum(["FORWARD_ONLY_READY", "RESEARCH_ONLY"]),
  generatedAt: IsoDateTimeSchema,
  artifact: M2ForwardInstrumentArtifactReferenceSchema,
});

const CaptureJournalCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_FORWARD_INSTRUMENT_CAPTURE_JOURNAL_VERSION),
  entrySequence: NonNegativeIntegerSchema,
  previousEntryDigest: DigestSchema.nullable(),
  recordedAt: IsoDateTimeSchema,
  authorityMode: z.literal("NO_AUTHORITY_RESEARCH_CAPTURE"),
  captureDirection: z.literal("FORWARD_ONLY_FROM_MEASURED_CAPTURE_START"),
  historicalBackfillAllowed: z.literal(false),
  historicalSourceGateResolved: z.literal(false),
  bulkHistoricalAcquisitionAllowed: z.literal(false),
  candidateEmissionAllowed: z.literal(false),
  batchStatus: z.enum(["COMPLETE", "PARTIAL", "FAILED"]),
  batchGeneratedAt: IsoDateTimeSchema,
  batchArtifact: M2ForwardInstrumentArtifactReferenceSchema,
  snapshotArtifacts: z.array(SnapshotArtifactBindingSchema).length(3),
  continuityArtifacts: z.array(ContinuityArtifactBindingSchema).length(3),
});

function providerBindingsAreCanonical(
  bindings: readonly Readonly<{
    providerId: ForwardInstrumentProviderId;
    venue: string;
  }>[],
): boolean {
  const providers = bindings.map((binding) => binding.providerId);
  const venues = bindings.map((binding) => binding.venue);
  return new Set(providers).size === 3 &&
    new Set(venues).size === 3 &&
    JSON.stringify(providers) === JSON.stringify([...providers].sort()) &&
    bindings.every((binding) =>
      forwardProviderVenueMatches(binding.providerId, binding.venue));
}

export const M2ForwardInstrumentCaptureJournalEntrySchema =
  CaptureJournalCoreSchema.extend({
    journalEntryId: NonEmptyStringSchema,
    journalEntryDigest: DigestSchema,
  }).superRefine((entry, context) => {
    if (
      (entry.entrySequence === 0) !== (entry.previousEntryDigest === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "forward journal sequence and previous digest disagree",
        path: ["previousEntryDigest"],
      });
    }
    if (
      Date.parse(entry.batchGeneratedAt) > Date.parse(entry.recordedAt) ||
      entry.snapshotArtifacts.some((binding) =>
        Date.parse(binding.generatedAt) > Date.parse(entry.recordedAt)) ||
      entry.continuityArtifacts.some((binding) =>
        Date.parse(binding.generatedAt) > Date.parse(entry.recordedAt))
    ) {
      context.addIssue({
        code: "custom",
        message: "forward journal cannot predate its retained artifacts",
        path: ["recordedAt"],
      });
    }
    if (
      entry.batchArtifact.artifactKind !== "BATCH" ||
      entry.snapshotArtifacts.some((binding) =>
        binding.artifact.artifactKind !== "SNAPSHOT") ||
      entry.continuityArtifacts.some((binding) =>
        binding.artifact.artifactKind !== "CONTINUITY") ||
      !providerBindingsAreCanonical(entry.snapshotArtifacts) ||
      !providerBindingsAreCanonical(entry.continuityArtifacts)
    ) {
      context.addIssue({
        code: "custom",
        message: "forward journal artifact bindings are invalid",
        path: ["snapshotArtifacts"],
      });
    }
    const snapshotDigests = entry.snapshotArtifacts.map(
      (binding) => binding.artifact.artifactDigest,
    );
    const continuityDigests = entry.continuityArtifacts.map(
      (binding) => binding.artifact.artifactDigest,
    );
    const expectedBatchStatus = entry.snapshotArtifacts.every(
      (binding) => binding.captureStatus === "COMPLETE",
    )
      ? "COMPLETE"
      : entry.snapshotArtifacts.every(
        (binding) => binding.captureStatus === "FAILED",
      ) ? "FAILED" : "PARTIAL";
    if (
      new Set(snapshotDigests).size !== snapshotDigests.length ||
      new Set(continuityDigests).size !== continuityDigests.length ||
      entry.batchStatus !== expectedBatchStatus
    ) {
      context.addIssue({
        code: "custom",
        message: "forward journal artifact accounting is inconsistent",
        path: ["batchStatus"],
      });
    }
    const { journalEntryId, journalEntryDigest, ...core } = entry;
    if (journalEntryDigest !== stableContentHash(core)) {
      context.addIssue({
        code: "custom",
        message: "forward journal entry digest mismatch",
        path: ["journalEntryDigest"],
      });
    }
    if (
      journalEntryId !==
        `forward-instrument-journal:${journalEntryDigest.slice("sha256:".length)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "forward journal entry identity mismatch",
        path: ["journalEntryId"],
      });
    }
  });

export type M2ForwardInstrumentCaptureJournalEntry = z.infer<
  typeof M2ForwardInstrumentCaptureJournalEntrySchema
>;

export type M2ForwardInstrumentCaptureRunResult = Readonly<{
  batch: M2ForwardInstrumentBatch;
  batchArtifact: M2ForwardInstrumentArtifactReference;
  continuities: readonly M2ForwardInstrumentContinuity[];
  continuityArtifacts: readonly M2ForwardInstrumentArtifactReference[];
  evidenceRoot: string;
  journalEntry: M2ForwardInstrumentCaptureJournalEntry;
  snapshots: readonly M2ForwardInstrumentSnapshot[];
  snapshotArtifacts: readonly M2ForwardInstrumentArtifactReference[];
}>;

function buildJournalEntry(input: Readonly<{
  batch: M2ForwardInstrumentBatch;
  batchArtifact: M2ForwardInstrumentArtifactReference;
  continuities: readonly M2ForwardInstrumentContinuity[];
  continuityArtifacts: readonly M2ForwardInstrumentArtifactReference[];
  entrySequence: number;
  previousEntryDigest: string | null;
  recordedAt: string;
  snapshots: readonly M2ForwardInstrumentSnapshot[];
  snapshotArtifacts: readonly M2ForwardInstrumentArtifactReference[];
}>): M2ForwardInstrumentCaptureJournalEntry {
  if (
    input.snapshots.length !== input.snapshotArtifacts.length ||
    input.continuities.length !== input.continuityArtifacts.length
  ) {
    throw new Error("forward journal artifact binding count mismatch");
  }
  const snapshotArtifacts = input.snapshots.map((snapshot, index) => ({
    providerId: snapshot.providerId,
    venue: snapshot.venue,
    captureStatus: snapshot.captureStatus,
    generatedAt: snapshot.generatedAt,
    artifact: input.snapshotArtifacts[index],
  })).sort((left, right) => left.providerId.localeCompare(right.providerId));
  const continuityArtifacts = input.continuities.map((continuity, index) => ({
    providerId: continuity.providerId,
    venue: continuity.venue,
    continuityStatus: continuity.continuityStatus,
    generatedAt: continuity.generatedAt,
    artifact: input.continuityArtifacts[index],
  })).sort((left, right) => left.providerId.localeCompare(right.providerId));
  const core = CaptureJournalCoreSchema.parse({
    schemaVersion: M2_FORWARD_INSTRUMENT_CAPTURE_JOURNAL_VERSION,
    entrySequence: input.entrySequence,
    previousEntryDigest: input.previousEntryDigest,
    recordedAt: input.recordedAt,
    authorityMode: "NO_AUTHORITY_RESEARCH_CAPTURE",
    captureDirection: "FORWARD_ONLY_FROM_MEASURED_CAPTURE_START",
    historicalBackfillAllowed: false,
    historicalSourceGateResolved: false,
    bulkHistoricalAcquisitionAllowed: false,
    candidateEmissionAllowed: false,
    batchStatus: input.batch.batchStatus,
    batchGeneratedAt: input.batch.generatedAt,
    batchArtifact: input.batchArtifact,
    snapshotArtifacts,
    continuityArtifacts,
  });
  const journalEntryDigest = stableContentHash(core);
  return deepFreezeArtifact(
    M2ForwardInstrumentCaptureJournalEntrySchema.parse({
      ...core,
      journalEntryId:
        `forward-instrument-journal:${journalEntryDigest.slice("sha256:".length)}`,
      journalEntryDigest,
    }),
  );
}

function assertArtifactBinding(input: Readonly<{
  actualDigest: string;
  expectedDigest: string;
  expectedKind: M2ForwardInstrumentArtifactReference["artifactKind"];
  reference: M2ForwardInstrumentArtifactReference;
}>): void {
  if (
    input.reference.artifactKind !== input.expectedKind ||
    input.reference.artifactDigest !== input.expectedDigest ||
    input.actualDigest !== input.expectedDigest
  ) {
    throw new Error("forward journal artifact binding failed verification");
  }
}

export async function runM2ForwardInstrumentCapture(input: Readonly<{
  evidenceRoot: string;
  fetchImplementation?: typeof fetch;
  now?: () => Date;
  repositoryRoot: string;
}>): Promise<M2ForwardInstrumentCaptureRunResult> {
  const now = input.now ?? (() => new Date());
  const store = await createM2ForwardInstrumentEvidenceStore({
    repositoryRoot: input.repositoryRoot,
    root: input.evidenceRoot,
  });
  const rawPreviousEntry = await store.readLastJournalRecord();
  const previousEntry = rawPreviousEntry === null
    ? null
    : M2ForwardInstrumentCaptureJournalEntrySchema.parse(rawPreviousEntry);
  const previousContinuities = new Map<
    ForwardInstrumentProviderId,
    M2ForwardInstrumentContinuity
  >();
  if (previousEntry !== null) {
    const priorBatch = M2ForwardInstrumentBatchSchema.parse(
      await store.readArtifact(previousEntry.batchArtifact),
    );
    assertArtifactBinding({
      actualDigest: priorBatch.batchDigest,
      expectedDigest: previousEntry.batchArtifact.artifactDigest,
      expectedKind: "BATCH",
      reference: previousEntry.batchArtifact,
    });
    for (const binding of previousEntry.continuityArtifacts) {
      const continuity = M2ForwardInstrumentContinuitySchema.parse(
        await store.readArtifact(binding.artifact),
      );
      assertArtifactBinding({
        actualDigest: continuity.continuityDigest,
        expectedDigest: binding.artifact.artifactDigest,
        expectedKind: "CONTINUITY",
        reference: binding.artifact,
      });
      if (
        continuity.providerId !== binding.providerId ||
        continuity.venue !== binding.venue ||
        continuity.continuityStatus !== binding.continuityStatus
      ) {
        throw new Error("previous continuity binding does not match its journal");
      }
      previousContinuities.set(binding.providerId, continuity);
    }
  }

  const attempts = await captureThreeVenueForwardCatalogs({
    fetchImplementation: input.fetchImplementation,
    now,
  });
  const snapshots: M2ForwardInstrumentSnapshot[] = [];
  const snapshotArtifacts: M2ForwardInstrumentArtifactReference[] = [];
  for (const attempt of attempts) {
    const rawEvidence = attempt.pages.map(buildM2ForwardInstrumentRawEvidence);
    for (const [index, evidence] of rawEvidence.entries()) {
      await store.putRaw(evidence, attempt.pages[index]!.rawBody);
      await store.verifyRaw(evidence);
    }
    const snapshot = buildM2ForwardInstrumentSnapshot({
      attempt,
      generatedAt: now().toISOString(),
      rawEvidence,
    });
    const reference = await store.putArtifact({
      artifact: snapshot,
      artifactDigest: snapshot.snapshotDigest,
      artifactKind: "SNAPSHOT",
    });
    snapshots.push(snapshot);
    snapshotArtifacts.push(reference);
  }

  const batch = buildM2ForwardInstrumentBatch({
    generatedAt: now().toISOString(),
    snapshots,
  });
  const batchArtifact = await store.putArtifact({
    artifact: batch,
    artifactDigest: batch.batchDigest,
    artifactKind: "BATCH",
  });
  const continuities: M2ForwardInstrumentContinuity[] = [];
  const continuityArtifacts: M2ForwardInstrumentArtifactReference[] = [];
  for (const snapshot of snapshots) {
    const continuity = buildM2ForwardInstrumentContinuity({
      generatedAt: now().toISOString(),
      previous: previousContinuities.get(snapshot.providerId),
      snapshots: [snapshot],
    });
    const reference = await store.putArtifact({
      artifact: continuity,
      artifactDigest: continuity.continuityDigest,
      artifactKind: "CONTINUITY",
    });
    continuities.push(continuity);
    continuityArtifacts.push(reference);
  }

  const journalEntry = buildJournalEntry({
    batch,
    batchArtifact,
    continuities,
    continuityArtifacts,
    entrySequence: previousEntry === null ? 0 : previousEntry.entrySequence + 1,
    previousEntryDigest: previousEntry?.journalEntryDigest ?? null,
    recordedAt: now().toISOString(),
    snapshots,
    snapshotArtifacts,
  });
  await store.appendJournalRecord(
    journalEntry,
    previousEntry?.journalEntryDigest ?? null,
  );
  return Object.freeze({
    batch,
    batchArtifact,
    continuities: Object.freeze(continuities),
    continuityArtifacts: Object.freeze(continuityArtifacts),
    evidenceRoot: store.root,
    journalEntry,
    snapshots: Object.freeze(snapshots),
    snapshotArtifacts: Object.freeze(snapshotArtifacts),
  });
}
