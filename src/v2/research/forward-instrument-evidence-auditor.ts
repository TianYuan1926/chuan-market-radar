import { lstat, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type {
  ForwardInstrumentProviderId,
} from "../modules/universe/adapters/forward-catalog-capture-adapter";
import {
  M2ForwardInstrumentBatchSchema,
  M2ForwardInstrumentSnapshotSchema,
  type M2ForwardInstrumentSnapshot,
} from "./forward-instrument-capture";
import {
  M2ForwardInstrumentCaptureJournalEntrySchema,
  type M2ForwardInstrumentCaptureJournalEntry,
} from "./forward-instrument-capture-runner";
import {
  M2ForwardInstrumentContinuitySchema,
  type M2ForwardInstrumentContinuity,
} from "./forward-instrument-continuity";
import {
  replayLatestM2ForwardInstrumentDomains,
  type M2ForwardInstrumentDomainReplay,
} from "./forward-instrument-domain-replay";
import {
  createM2ForwardInstrumentEvidenceStore,
  type M2ForwardInstrumentArtifactReference,
  type M2ForwardInstrumentEvidenceStore,
} from "./forward-instrument-evidence-store";
import {
  M2ForwardInstrumentReleaseIdSchema,
} from "./forward-instrument-provenance";

export const M2_FORWARD_INSTRUMENT_EVIDENCE_AUDIT_VERSION =
  "v2-m2-forward-instrument-evidence-audit.v1" as const;

type BatchStatus = M2ForwardInstrumentCaptureJournalEntry["batchStatus"];

export type M2ForwardInstrumentEvidenceAudit = Readonly<{
  schemaVersion: typeof M2_FORWARD_INSTRUMENT_EVIDENCE_AUDIT_VERSION;
  status: "PASS_FORWARD_EVIDENCE_INTEGRITY_AUDIT";
  evidenceReleaseId: string;
  verifierReleaseId: string;
  sameReleaseVerifier: boolean;
  captureConfigDigest: string;
  journalEntryCount: number;
  journalHeadDigest: string;
  batchStatusCounts: Readonly<Record<BatchStatus, number>>;
  artifactReferenceCount: number;
  uniqueArtifactObjectCount: number;
  rawReferenceCount: number;
  uniqueRawObjectCount: number;
  retainedFileCount: number;
  exactFileSetVerified: true;
  allReferencedObjectsVerified: true;
  latestDomainReplay: M2ForwardInstrumentDomainReplay | null;
  latestProviderContinuity: readonly Readonly<{
    providerId: ForwardInstrumentProviderId;
    venue: string;
    accountingCount: number;
    observedSnapshotCount: number;
    completeSnapshotCount: number;
    gapCount: number;
    activeCoverageGapCount: number;
    preCaptureIncompleteSnapshotCount: number;
    observationSpanMs: number | null;
    continuityStatus: "FORWARD_ONLY_READY" | "RESEARCH_ONLY";
    blockerReasonCodes: readonly string[];
  }>[];
  operationalForwardOnlyReady: boolean;
  authorityMode: "NO_AUTHORITY_RESEARCH_CAPTURE";
  captureDirection: "FORWARD_ONLY_FROM_MEASURED_CAPTURE_START";
  historicalBackfillAllowed: false;
  historicalSourceGateResolved: false;
  bulkHistoricalAcquisitionAllowed: false;
  candidateEmissionAllowed: false;
}>;

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function pathIsWithin(parent: string, candidate: string): boolean {
  const relativePath = relative(resolve(parent), resolve(candidate));
  return relativePath === "" || (
    !relativePath.startsWith("..") && !isAbsolute(relativePath)
  );
}

function referenceMatches(
  reference: M2ForwardInstrumentArtifactReference,
  kind: M2ForwardInstrumentArtifactReference["artifactKind"],
  digest: string,
  releaseId: string,
  captureConfigDigest: string,
): boolean {
  return reference.artifactKind === kind &&
    reference.artifactDigest === digest &&
    reference.releaseId === releaseId &&
    reference.captureConfigDigest === captureConfigDigest;
}

function snapshotMatchesBatchSummary(
  snapshot: M2ForwardInstrumentSnapshot,
  summary: Readonly<{
    releaseId: string;
    captureConfigDigest: string;
    providerId: string;
    venue: string;
    snapshotId: string;
    snapshotDigest: string;
    captureStatus: string;
    evidenceStartedAt: string | null;
    generatedAt: string;
    accountingCount: number;
    unresolvedIdentityCount: number;
  }>,
): boolean {
  return summary.releaseId === snapshot.releaseId &&
    summary.captureConfigDigest === snapshot.captureConfigDigest &&
    summary.providerId === snapshot.providerId &&
    summary.venue === snapshot.venue &&
    summary.snapshotId === snapshot.snapshotId &&
    summary.snapshotDigest === snapshot.snapshotDigest &&
    summary.captureStatus === snapshot.captureStatus &&
    summary.evidenceStartedAt === snapshot.evidenceStartedAt &&
    summary.generatedAt === snapshot.generatedAt &&
    summary.accountingCount === snapshot.accounting.length &&
    summary.unresolvedIdentityCount === snapshot.accounting.filter(
      (record) => record.identityEvidenceClass === "UNRESOLVED",
    ).length;
}

async function readBoundArtifact<T>(input: Readonly<{
  store: M2ForwardInstrumentEvidenceStore;
  reference: M2ForwardInstrumentArtifactReference;
  kind: M2ForwardInstrumentArtifactReference["artifactKind"];
  digest: string;
  releaseId: string;
  captureConfigDigest: string;
  parse: (value: unknown) => T;
}>): Promise<T> {
  ensure(
    referenceMatches(
      input.reference,
      input.kind,
      input.digest,
      input.releaseId,
      input.captureConfigDigest,
    ),
    "forward evidence artifact reference binding is invalid",
  );
  return input.parse(await input.store.readArtifact(input.reference));
}

async function exactRetainedFileSet(input: Readonly<{
  root: string;
  expectedFiles: ReadonlySet<string>;
}>): Promise<ReadonlySet<string>> {
  const root = await realpath(input.root);
  const expectedDirectories = new Set([
    "",
    "artifacts",
    "artifacts/sha256",
    "journal",
    "raw",
    "raw/sha256",
  ]);
  const actualDirectories = new Set<string>();
  const actualFiles = new Set<string>();

  const walk = async (directory: string): Promise<void> => {
    const facts = await lstat(directory);
    ensure(
      facts.isDirectory() &&
        !facts.isSymbolicLink() &&
        (facts.mode & 0o077) === 0,
      "forward evidence directory identity or mode is unsafe",
    );
    const actual = await realpath(directory);
    ensure(
      pathIsWithin(root, actual),
      "forward evidence directory escaped its root during audit",
    );
    actualDirectories.add(relative(root, directory));
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const itemFacts = await lstat(path);
      ensure(
        !itemFacts.isSymbolicLink(),
        "forward evidence audit rejects symbolic links",
      );
      if (itemFacts.isDirectory()) {
        await walk(path);
        continue;
      }
      ensure(
        itemFacts.isFile() && (itemFacts.mode & 0o077) === 0,
        "forward evidence file identity or mode is unsafe",
      );
      actualFiles.add(relative(root, path));
    }
  };

  await walk(root);
  ensure(
    JSON.stringify([...actualDirectories].sort()) ===
      JSON.stringify([...expectedDirectories].sort()),
    "forward evidence store contains an unexpected directory",
  );
  ensure(
    JSON.stringify([...actualFiles].sort()) ===
      JSON.stringify([...input.expectedFiles].sort()),
    "forward evidence store contains an unreferenced or missing file",
  );
  return actualFiles;
}

function observationSpanMs(
  continuity: M2ForwardInstrumentContinuity,
): number | null {
  if (
    continuity.firstCompleteSnapshotAt === null ||
    continuity.lastCompleteSnapshotAt === null
  ) {
    return null;
  }
  return Date.parse(continuity.lastCompleteSnapshotAt) -
    Date.parse(continuity.firstCompleteSnapshotAt);
}

export async function auditM2ForwardInstrumentEvidence(input: Readonly<{
  evidenceRoot: string;
  expectedEvidenceReleaseId: string;
  repositoryRoot: string;
  verifierReleaseId: string;
}>): Promise<M2ForwardInstrumentEvidenceAudit> {
  const expectedEvidenceReleaseId = M2ForwardInstrumentReleaseIdSchema.parse(
    input.expectedEvidenceReleaseId,
  );
  const verifierReleaseId = M2ForwardInstrumentReleaseIdSchema.parse(
    input.verifierReleaseId,
  );
  const store = await createM2ForwardInstrumentEvidenceStore({
    mode: "READ_ONLY_EXISTING",
    repositoryRoot: input.repositoryRoot,
    root: input.evidenceRoot,
  });
  const journalEntries = (await store.readJournalRecords()).map((entry) =>
    M2ForwardInstrumentCaptureJournalEntrySchema.parse(entry));
  ensure(
    journalEntries.length > 0,
    "forward evidence audit requires at least one journal entry",
  );

  const firstEntry = journalEntries[0]!;
  ensure(
    firstEntry.releaseId === expectedEvidenceReleaseId,
    "forward evidence release does not match the expected release",
  );
  const captureConfigDigest = firstEntry.captureConfigDigest;
  const expectedFiles = new Set<string>([
    "journal/forward-instrument-captures.v2.jsonl",
  ]);
  const artifactObjects = new Set<string>();
  const rawObjects = new Set<string>();
  const previousContinuities = new Map<
    ForwardInstrumentProviderId,
    M2ForwardInstrumentContinuity
  >();
  let previousEntryDigest: string | null = null;
  let artifactReferenceCount = 0;
  let rawReferenceCount = 0;
  const batchStatusCounts: Record<BatchStatus, number> = {
    COMPLETE: 0,
    PARTIAL: 0,
    FAILED: 0,
  };
  let latestSnapshots = new Map<
    ForwardInstrumentProviderId,
    M2ForwardInstrumentSnapshot
  >();
  let latestContinuities = new Map<
    ForwardInstrumentProviderId,
    M2ForwardInstrumentContinuity
  >();

  for (const [index, entry] of journalEntries.entries()) {
    ensure(
      entry.entrySequence === index &&
        entry.previousEntryDigest === previousEntryDigest &&
        entry.releaseId === expectedEvidenceReleaseId &&
        entry.captureConfigDigest === captureConfigDigest,
      "forward evidence journal sequence, release, or config is invalid",
    );
    previousEntryDigest = entry.journalEntryDigest;
    batchStatusCounts[entry.batchStatus] += 1;

    artifactReferenceCount += 1;
    artifactObjects.add(entry.batchArtifact.storageKey);
    expectedFiles.add(entry.batchArtifact.storageKey);
    const batch = await readBoundArtifact({
      store,
      reference: entry.batchArtifact,
      kind: "BATCH",
      digest: entry.batchArtifact.artifactDigest,
      releaseId: expectedEvidenceReleaseId,
      captureConfigDigest,
      parse: (value) => M2ForwardInstrumentBatchSchema.parse(value),
    });
    ensure(
      batch.batchDigest === entry.batchArtifact.artifactDigest &&
        batch.batchStatus === entry.batchStatus &&
        batch.generatedAt === entry.batchGeneratedAt,
      "forward evidence batch does not match its journal entry",
    );

    const snapshots = new Map<
      ForwardInstrumentProviderId,
      M2ForwardInstrumentSnapshot
    >();
    for (const binding of entry.snapshotArtifacts) {
      artifactReferenceCount += 1;
      artifactObjects.add(binding.artifact.storageKey);
      expectedFiles.add(binding.artifact.storageKey);
      const snapshot = await readBoundArtifact({
        store,
        reference: binding.artifact,
        kind: "SNAPSHOT",
        digest: binding.artifact.artifactDigest,
        releaseId: expectedEvidenceReleaseId,
        captureConfigDigest,
        parse: (value) => M2ForwardInstrumentSnapshotSchema.parse(value),
      });
      ensure(
        snapshot.snapshotDigest === binding.artifact.artifactDigest &&
          snapshot.providerId === binding.providerId &&
          snapshot.venue === binding.venue &&
          snapshot.captureStatus === binding.captureStatus &&
          snapshot.generatedAt === binding.generatedAt,
        "forward evidence snapshot does not match its journal binding",
      );
      snapshots.set(snapshot.providerId, snapshot);
      for (const rawEvidence of snapshot.rawEvidence) {
        rawReferenceCount += 1;
        rawObjects.add(rawEvidence.storageKey);
        expectedFiles.add(rawEvidence.storageKey);
        await store.verifyRaw(rawEvidence);
      }
    }
    ensure(
      snapshots.size === 3 &&
        batch.snapshots.length === 3 &&
        batch.snapshots.every((summary) => {
          const snapshot = snapshots.get(summary.providerId);
          return snapshot !== undefined &&
            snapshotMatchesBatchSummary(snapshot, summary);
        }),
      "forward evidence batch snapshot bindings are incomplete",
    );

    const continuities = new Map<
      ForwardInstrumentProviderId,
      M2ForwardInstrumentContinuity
    >();
    for (const binding of entry.continuityArtifacts) {
      artifactReferenceCount += 1;
      artifactObjects.add(binding.artifact.storageKey);
      expectedFiles.add(binding.artifact.storageKey);
      const continuity = await readBoundArtifact({
        store,
        reference: binding.artifact,
        kind: "CONTINUITY",
        digest: binding.artifact.artifactDigest,
        releaseId: expectedEvidenceReleaseId,
        captureConfigDigest,
        parse: (value) => M2ForwardInstrumentContinuitySchema.parse(value),
      });
      const snapshot = snapshots.get(continuity.providerId);
      const previous = previousContinuities.get(continuity.providerId);
      ensure(
        snapshot !== undefined &&
          continuity.continuityDigest === binding.artifact.artifactDigest &&
          continuity.providerId === binding.providerId &&
          continuity.venue === binding.venue &&
          continuity.continuityStatus === binding.continuityStatus &&
          continuity.generatedAt === binding.generatedAt &&
          continuity.previousContinuityDigest ===
            (previous?.continuityDigest ?? null) &&
          continuity.observedSnapshotCount ===
            (previous?.observedSnapshotCount ?? 0) + 1 &&
          continuity.lastSnapshotId === snapshot.snapshotId &&
          continuity.segmentSnapshots.length === 1 &&
          continuity.segmentSnapshots[0]?.snapshotDigest ===
            snapshot.snapshotDigest,
        "forward evidence continuity chain or snapshot binding is invalid",
      );
      continuities.set(continuity.providerId, continuity);
    }
    ensure(
      continuities.size === 3,
      "forward evidence continuity bindings are incomplete",
    );
    previousContinuities.clear();
    for (const [providerId, continuity] of continuities) {
      previousContinuities.set(providerId, continuity);
    }
    latestSnapshots = snapshots;
    latestContinuities = continuities;
  }

  const actualFiles = await exactRetainedFileSet({
    root: store.root,
    expectedFiles,
  });
  const latestSnapshotValues = [...latestSnapshots.values()];
  const latestDomainReplay = latestSnapshotValues.length === 3 &&
      latestSnapshotValues.every((snapshot) =>
        snapshot.captureStatus === "COMPLETE"
      )
    ? await replayLatestM2ForwardInstrumentDomains({
      snapshots: latestSnapshotValues,
      store,
    })
    : null;
  const latestProviderContinuity = [...latestContinuities]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([providerId, continuity]) => {
      const snapshot = latestSnapshots.get(providerId);
      ensure(
        snapshot !== undefined,
        "latest forward continuity is missing its snapshot",
      );
      return Object.freeze({
        providerId,
        venue: continuity.venue,
        accountingCount: snapshot.accounting.length,
        observedSnapshotCount: continuity.observedSnapshotCount,
        completeSnapshotCount: continuity.completeSnapshotCount,
        gapCount: continuity.gapCount,
        activeCoverageGapCount: continuity.activeCoverageGapCount,
        preCaptureIncompleteSnapshotCount:
          continuity.preCaptureIncompleteSnapshotCount,
        observationSpanMs: observationSpanMs(continuity),
        continuityStatus: continuity.continuityStatus,
        blockerReasonCodes: Object.freeze([...continuity.blockerReasonCodes]),
      });
    });
  const operationalForwardOnlyReady =
    journalEntries.at(-1)?.batchStatus === "COMPLETE" &&
    latestProviderContinuity.length === 3 &&
    latestProviderContinuity.every((provider) =>
      provider.continuityStatus === "FORWARD_ONLY_READY" &&
      provider.completeSnapshotCount >= 2 &&
      provider.gapCount === 0 &&
      provider.activeCoverageGapCount === 0 &&
      provider.preCaptureIncompleteSnapshotCount === 0 &&
      provider.blockerReasonCodes.length === 0
    );

  return Object.freeze({
    schemaVersion: M2_FORWARD_INSTRUMENT_EVIDENCE_AUDIT_VERSION,
    status: "PASS_FORWARD_EVIDENCE_INTEGRITY_AUDIT",
    evidenceReleaseId: expectedEvidenceReleaseId,
    verifierReleaseId,
    sameReleaseVerifier: expectedEvidenceReleaseId === verifierReleaseId,
    captureConfigDigest,
    journalEntryCount: journalEntries.length,
    journalHeadDigest: previousEntryDigest!,
    batchStatusCounts: Object.freeze({ ...batchStatusCounts }),
    artifactReferenceCount,
    uniqueArtifactObjectCount: artifactObjects.size,
    rawReferenceCount,
    uniqueRawObjectCount: rawObjects.size,
    retainedFileCount: actualFiles.size,
    exactFileSetVerified: true,
    allReferencedObjectsVerified: true,
    latestDomainReplay,
    latestProviderContinuity: Object.freeze(latestProviderContinuity),
    operationalForwardOnlyReady,
    authorityMode: "NO_AUTHORITY_RESEARCH_CAPTURE",
    captureDirection: "FORWARD_ONLY_FROM_MEASURED_CAPTURE_START",
    historicalBackfillAllowed: false,
    historicalSourceGateResolved: false,
    bulkHistoricalAcquisitionAllowed: false,
    candidateEmissionAllowed: false,
  });
}
