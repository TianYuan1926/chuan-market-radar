import {
  constants,
  type BigIntStats,
} from "node:fs";
import {
  lstat,
  open,
  readdir,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  M1ListingWatchEvidenceBindingSchema,
  M1MultiAssetBaseFactSnapshotSchema,
  buildM1BaseFactShadowAccounting,
} from "../market-fact/multi-asset-base-fact-contract";
import {
  M1MultiAssetCatalogCaptureBindingSchema,
  M1MultiAssetIdentitySnapshotSchema,
  type M1MultiAssetCatalogCaptureBinding,
  type M1MultiAssetIdentitySnapshot,
} from "../multi-asset-universe/multi-asset-identity-contract";
import {
  M1ListingWatchRefreshBatchSchema,
  type M1ListingWatchRefreshBatch,
} from "../multi-asset-universe/m1-listing-watch-live-runtime";
import {
  M1ListingHistoryCheckpointSchema,
  type M1ListingHistoryCheckpoint,
} from "../multi-asset-universe/listing-history-runtime";
import {
  deepFreezeArtifact,
  omitArtifactFields,
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M1_MULTI_ASSET_SHADOW_PROFILE,
  M1MultiAssetShadowCycleSchema,
  M1MultiAssetShadowEvidenceSchema,
  M1MultiAssetShadowUpstreamBindingSchema,
  buildM1MultiAssetShadowEvidence,
  type M1MultiAssetShadowCycle,
  type M1MultiAssetShadowEvidence,
  type M1MultiAssetShadowUpstreamBinding,
} from "./m1-multi-asset-shadow-contract";
import {
  M1MultiAssetShadowCheckpointReceiptSchema,
  M1MultiAssetShadowPersistenceReceiptSchema,
} from "./m1-multi-asset-shadow-runtime";
import {
  parseM1ShadowLosslessJsonFrame,
} from "./m1-shadow-lossless-json";

export const M1_MULTI_ASSET_SHADOW_STORE_VERIFICATION_VERSION =
  "v2-m1-multi-asset-shadow-store-verification.v2" as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const EXPECTED_CYCLE_FILES = [
  "base-fact-snapshot.json",
  "catalog-capture-binding.json",
  "checkpoint-receipt.json",
  "cycle.json",
  "identity-snapshot.json",
  "listing-watch-binding-bitget.json",
  "listing-watch-binding-bybit.json",
  "listing-watch-refresh-batch.json",
  "persistence-receipt.json",
] as const;
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_RECEIPT_BYTES = 1024 * 1024;
const MAX_CYCLE_BYTES = 4 * 1024 * 1024;
const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

type FileFingerprint = Readonly<{
  target: string;
  device: bigint;
  inode: bigint;
  mode: bigint;
  size: bigint;
  modifiedAtNs: bigint;
  changedAtNs: bigint;
}>;

type ParsedFile<T> = Readonly<{
  value: T;
  bytes: number;
  fingerprint: FileFingerprint;
}>;

function bigintFingerprint(
  target: string,
  stats: BigIntStats,
): FileFingerprint {
  return {
    target,
    device: stats.dev,
    inode: stats.ino,
    mode: stats.mode,
    size: stats.size,
    modifiedAtNs: stats.mtimeNs,
    changedAtNs: stats.ctimeNs,
  };
}

function sameFingerprint(
  left: FileFingerprint,
  right: FileFingerprint,
): boolean {
  return (
    left.target === right.target &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.modifiedAtNs === right.modifiedAtNs &&
    left.changedAtNs === right.changedAtNs
  );
}

function exactNames(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  if (
    sortedActual.length !== sortedExpected.length ||
    sortedActual.some((value, index) => value !== sortedExpected[index])
  ) {
    throw new Error(
      `${label} entries disagree: ${JSON.stringify(sortedActual)}`,
    );
  }
}

async function readRegularJson<T>(
  target: string,
  maxBytes: number,
  schema: z.ZodType<T>,
  fingerprints: FileFingerprint[],
): Promise<ParsedFile<T>> {
  const handle = await open(
    target,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.size <= BigInt(0) ||
      before.size > BigInt(maxBytes) ||
      (before.mode & BigInt(0o077)) !== BigInt(0)
    ) {
      throw new Error(
        `shadow evidence file type, size or permissions invalid: ${target}`,
      );
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const beforeFingerprint = bigintFingerprint(target, before);
    const afterFingerprint = bigintFingerprint(target, after);
    if (
      bytes.byteLength !== Number(before.size) ||
      !sameFingerprint(beforeFingerprint, afterFingerprint)
    ) {
      throw new Error(
        `shadow evidence file changed during read: ${target}`,
      );
    }
    const value = schema.parse(
      parseM1ShadowLosslessJsonFrame(bytes.toString("utf8")),
    );
    fingerprints.push(afterFingerprint);
    return {
      value,
      bytes: bytes.byteLength,
      fingerprint: afterFingerprint,
    };
  } finally {
    await handle.close();
  }
}

async function assertDirectory(
  directory: string,
): Promise<FileFingerprint> {
  const stats = await lstat(directory, { bigint: true });
  if (
    !stats.isDirectory() ||
    (stats.mode & BigInt(0o077)) !== BigInt(0) ||
    await realpath(directory) !== directory
  ) {
    throw new Error(
      `shadow evidence directory type, permissions or identity invalid: ${directory}`,
    );
  }
  return bigintFingerprint(directory, stats);
}

async function assertFingerprintsUnchanged(
  fingerprints: readonly FileFingerprint[],
): Promise<void> {
  for (const expected of fingerprints) {
    const actual = bigintFingerprint(
      expected.target,
      await lstat(expected.target, { bigint: true }),
    );
    if (!sameFingerprint(actual, expected)) {
      throw new Error(
        `shadow evidence identity changed during verification: ${expected.target}`,
      );
    }
  }
}

function assertEqualHash(
  left: unknown,
  right: unknown,
  label: string,
): void {
  if (stableContentHash(left) !== stableContentHash(right)) {
    throw new Error(`${label} does not reconcile`);
  }
}

const VerificationCoreSchema = z.strictObject({
  schemaVersion: z.literal(
    M1_MULTI_ASSET_SHADOW_STORE_VERIFICATION_VERSION,
  ),
  releaseId: ReleaseIdSchema,
  verifiedAt: z.string().datetime({ offset: true }),
  upstreamBindingId: z.string().min(1),
  upstreamBindingHash: DigestSchema,
  workerRunId: z.string().min(1),
  evidenceId: z.string().min(1),
  evidenceHash: DigestSchema,
  evidenceStatus: z.enum([
    "PASS_FOUR_VENUE_MULTI_ASSET_SHADOW_NO_AUTHORITY",
    "BLOCKED_EQUITY_TRADABLE_FACT_NO_FALSE_PASS",
    "BLOCKED_SCOPE_OR_SLO_NO_STALE_PROMOTION",
    "TEST_ONLY_NOT_LIVE_EVIDENCE",
  ]),
  cycleCount: z.literal(31),
  verifiedFileCount: z.literal(280),
  verifiedBytes: z.number().int().positive(),
  firstPersistenceReceiptHash: DigestSchema,
  lastPersistenceReceiptHash: DigestSchema,
  firstCheckpointReceiptHash: DigestSchema,
  lastCheckpointReceiptHash: DigestSchema,
  firstListingWatchRefreshBatchHash: DigestSchema,
  lastListingWatchRefreshBatchHash: DigestSchema,
  componentAcceptanceGate: z.enum(["PASS", "BLOCKED"]),
  verificationStatus: z.literal(
    "PASS_EVIDENCE_INTEGRITY_NO_AUTHORITY",
  ),
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  authorityGranted: z.literal(false),
  automaticTradingAllowed: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1MultiAssetShadowStoreVerificationSchema =
  VerificationCoreSchema.extend({
    verificationId: z.string().min(1),
    contentHash: DigestSchema,
  }).superRefine((verification, context) => {
    const core = VerificationCoreSchema.parse(
      omitArtifactFields(verification, ["verificationId", "contentHash"]),
    );
    const expectedHash = stableContentHash(core);
    if (
      verification.contentHash !== expectedHash ||
      verification.verificationId !==
        `m1-5c-store-verification:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "M1.5C store verification identity mismatch",
        path: ["contentHash"],
      });
    }
    const expectedGate = verification.evidenceStatus ===
        "PASS_FOUR_VENUE_MULTI_ASSET_SHADOW_NO_AUTHORITY"
      ? "PASS"
      : "BLOCKED";
    if (verification.componentAcceptanceGate !== expectedGate) {
      context.addIssue({
        code: "custom",
        message: "M1.5C verification cannot overstate component acceptance",
        path: ["componentAcceptanceGate"],
      });
    }
  });

export type M1MultiAssetShadowStoreVerification = z.infer<
  typeof M1MultiAssetShadowStoreVerificationSchema
>;

export type M1MultiAssetShadowEvidenceStoreAudit = Readonly<{
  verification: M1MultiAssetShadowStoreVerification;
  evidence: M1MultiAssetShadowEvidence;
  cycles: readonly M1MultiAssetShadowCycle[];
  catalogCaptureBindings: readonly M1MultiAssetCatalogCaptureBinding[];
  identitySnapshots: readonly M1MultiAssetIdentitySnapshot[];
  listingWatchRefreshBatches: readonly M1ListingWatchRefreshBatch[];
  canonicalEvidenceRoot: string;
  authorityGranted: false;
  productionChanged: false;
  secretMaterialPresent: false;
}>;

export async function verifyM1MultiAssetShadowEvidenceStore(input: {
  evidenceRoot: string;
  upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  expectedWorkerRunId: string;
  initialListingCheckpoints: readonly M1ListingHistoryCheckpoint[];
  verifiedAt: string;
}): Promise<M1MultiAssetShadowEvidenceStoreAudit> {
  if (
    !path.isAbsolute(input.evidenceRoot) ||
    path.normalize(input.evidenceRoot) !== input.evidenceRoot
  ) {
    throw new Error("M1.5C verification root must be absolute and normalized");
  }
  const canonicalRoot = await realpath(input.evidenceRoot);
  if (canonicalRoot !== input.evidenceRoot) {
    throw new Error("M1.5C verification root must already be canonical");
  }
  const upstream = M1MultiAssetShadowUpstreamBindingSchema.parse(
    input.upstreamBinding,
  );
  const verifiedAt = new Date(input.verifiedAt);
  if (
    input.expectedWorkerRunId.trim().length === 0 ||
    !Number.isFinite(verifiedAt.getTime()) ||
    verifiedAt.toISOString() !== input.verifiedAt
  ) {
    throw new Error("M1.5C verification identity or timestamp is invalid");
  }

  const fingerprints: FileFingerprint[] = [];
  const expectedListingCheckpoints = new Map(
    input.initialListingCheckpoints
      .map((checkpoint) => M1ListingHistoryCheckpointSchema.parse(checkpoint))
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
      .map((checkpoint) => [checkpoint.sourceId, checkpoint] as const),
  );
  if (
    expectedListingCheckpoints.size !== 2 ||
    !expectedListingCheckpoints.has("BITGET_FUTURES") ||
    !expectedListingCheckpoints.has("BYBIT_DERIVATIVES") ||
    [...expectedListingCheckpoints.values()].some(
      (checkpoint) => checkpoint.releaseId !== upstream.releaseId,
    )
  ) {
    throw new Error(
      "M1.5C verifier requires exact initial listing checkpoints",
    );
  }
  fingerprints.push(await assertDirectory(canonicalRoot));
  const cycleDirectoryNames = Array.from(
    { length: M1_MULTI_ASSET_SHADOW_PROFILE.cycleCount },
    (_, index) => `cycle-${String(index + 1).padStart(2, "0")}`,
  );
  exactNames(
    await readdir(canonicalRoot),
    [...cycleDirectoryNames, "evidence.json"],
    "M1.5C evidence root",
  );

  const cycles: M1MultiAssetShadowCycle[] = [];
  const catalogCaptureBindings: M1MultiAssetCatalogCaptureBinding[] = [];
  const identitySnapshots: M1MultiAssetIdentitySnapshot[] = [];
  const listingWatchRefreshBatches: M1ListingWatchRefreshBatch[] = [];
  const listingWatchRefreshBatchHashes: string[] = [];
  const persistenceHashes: string[] = [];
  const checkpointHashes: string[] = [];
  let verifiedBytes = 0;

  for (let index = 0; index < cycleDirectoryNames.length; index += 1) {
    const cycleIndex = index + 1;
    const directory = path.join(canonicalRoot, cycleDirectoryNames[index]!);
    fingerprints.push(await assertDirectory(directory));
    exactNames(
      await readdir(directory),
      EXPECTED_CYCLE_FILES,
      `M1.5C cycle ${cycleIndex}`,
    );

    const catalogFile = await readRegularJson(
      path.join(directory, "catalog-capture-binding.json"),
      MAX_ARTIFACT_BYTES,
      M1MultiAssetCatalogCaptureBindingSchema,
      fingerprints,
    );
    const identityFile = await readRegularJson(
      path.join(directory, "identity-snapshot.json"),
      MAX_ARTIFACT_BYTES,
      M1MultiAssetIdentitySnapshotSchema,
      fingerprints,
    );
    const factsFile = await readRegularJson(
      path.join(directory, "base-fact-snapshot.json"),
      MAX_ARTIFACT_BYTES,
      M1MultiAssetBaseFactSnapshotSchema,
      fingerprints,
    );
    const bitgetListingFile = await readRegularJson(
      path.join(directory, "listing-watch-binding-bitget.json"),
      MAX_RECEIPT_BYTES,
      M1ListingWatchEvidenceBindingSchema,
      fingerprints,
    );
    const bybitListingFile = await readRegularJson(
      path.join(directory, "listing-watch-binding-bybit.json"),
      MAX_RECEIPT_BYTES,
      M1ListingWatchEvidenceBindingSchema,
      fingerprints,
    );
    const listingRefreshFile = await readRegularJson(
      path.join(directory, "listing-watch-refresh-batch.json"),
      MAX_ARTIFACT_BYTES,
      M1ListingWatchRefreshBatchSchema,
      fingerprints,
    );
    const persistenceFile = await readRegularJson(
      path.join(directory, "persistence-receipt.json"),
      MAX_RECEIPT_BYTES,
      M1MultiAssetShadowPersistenceReceiptSchema,
      fingerprints,
    );
    const checkpointFile = await readRegularJson(
      path.join(directory, "checkpoint-receipt.json"),
      MAX_RECEIPT_BYTES,
      M1MultiAssetShadowCheckpointReceiptSchema,
      fingerprints,
    );
    const cycleFile = await readRegularJson(
      path.join(directory, "cycle.json"),
      MAX_CYCLE_BYTES,
      M1MultiAssetShadowCycleSchema,
      fingerprints,
    );
    verifiedBytes +=
      catalogFile.bytes +
      identityFile.bytes +
      factsFile.bytes +
      bitgetListingFile.bytes +
      bybitListingFile.bytes +
      listingRefreshFile.bytes +
      persistenceFile.bytes +
      checkpointFile.bytes +
      cycleFile.bytes;

    const catalog = catalogFile.value;
    const identity = identityFile.value;
    const facts = factsFile.value;
    const persistence = persistenceFile.value;
    const checkpoint = checkpointFile.value;
    const cycle = cycleFile.value;
    const listingBindings = [
      bitgetListingFile.value,
      bybitListingFile.value,
    ];
    const listingWatchRefreshBatch = listingRefreshFile.value;
    for (const result of listingWatchRefreshBatch.results) {
      const expectedPrior = expectedListingCheckpoints.get(result.sourceId);
      if (
        expectedPrior === undefined ||
        result.priorCheckpointId !== expectedPrior.checkpointId ||
        result.priorCheckpointHash !== expectedPrior.contentHash ||
        result.checkpoint === null
      ) {
        throw new Error(
          `M1.5C cycle ${cycleIndex} listing checkpoint continuity drifted`,
        );
      }
      expectedListingCheckpoints.set(result.sourceId, result.checkpoint);
    }
    const listingBindingIds = listingBindings
      .map((binding) => binding.bindingId)
      .sort();
    const listingBindingHashes = listingBindings
      .map((binding) => binding.contentHash)
      .sort();
    const expectedPreviousPersistence =
      index === 0 ? null : persistenceHashes[index - 1]!;
    const expectedPreviousCheckpoint =
      index === 0 ? null : checkpointHashes[index - 1]!;

    if (
      catalog.releaseId !== upstream.releaseId ||
      catalog.upstreamBindingId !== upstream.upstreamBindingId ||
      catalog.upstreamBindingHash !== upstream.contentHash ||
      catalog.evidenceClass !== upstream.evidenceClass ||
      catalog.networkEnvironment !== upstream.networkEnvironment ||
      identity.releaseId !== upstream.releaseId ||
      identity.upstreamBindingId !== upstream.upstreamBindingId ||
      identity.upstreamBindingHash !== upstream.contentHash ||
      identity.catalogCaptureBindingId !== catalog.captureBindingId ||
      identity.catalogCaptureBindingHash !== catalog.contentHash ||
      facts.releaseId !== upstream.releaseId ||
      facts.upstreamBindingId !== upstream.upstreamBindingId ||
      facts.upstreamBindingHash !== upstream.contentHash ||
      facts.catalogCaptureBindingId !== catalog.captureBindingId ||
      facts.catalogCaptureBindingHash !== catalog.contentHash ||
      facts.identitySnapshotId !== identity.snapshotId ||
      facts.identitySnapshotHash !== identity.contentHash
    ) {
      throw new Error(
        `M1.5C cycle ${cycleIndex} source, catalog, identity or Fact binding drifted`,
      );
    }
    if (
      listingBindings[0]!.sourceId !== "BITGET_FUTURES" ||
      listingBindings[1]!.sourceId !== "BYBIT_DERIVATIVES" ||
      listingBindings.some(
        (binding) =>
          binding.releaseId !== upstream.releaseId ||
          binding.upstreamBindingId !== upstream.upstreamBindingId ||
          binding.upstreamBindingHash !== upstream.contentHash ||
          binding.evidenceClass !== upstream.evidenceClass ||
          binding.networkEnvironment !== upstream.networkEnvironment,
      ) ||
      stableContentHash(listingBindingIds) !==
        stableContentHash(facts.listingCheckpointBindingIds) ||
      stableContentHash(listingBindingHashes) !==
        stableContentHash(facts.listingCheckpointBindingHashes) ||
      stableContentHash(listingWatchRefreshBatch.bindings) !==
        stableContentHash(listingBindings) ||
      !listingWatchRefreshBatch.allCommitted ||
      listingWatchRefreshBatch.results.some(
        (result) =>
          result.pages.some(
            (page) => page.releaseId !== upstream.releaseId,
          ) ||
          result.checkpoint?.releaseId !== upstream.releaseId ||
          result.binding?.upstreamBindingId !== upstream.upstreamBindingId ||
          result.binding?.upstreamBindingHash !== upstream.contentHash,
      )
    ) {
      throw new Error(
        `M1.5C cycle ${cycleIndex} listing checkpoint bindings drifted`,
      );
    }
    if (
      identity.observedCount !== catalog.observedCount ||
      identity.exactIdentityCount !== catalog.exactIdentityCount ||
      identity.partialIdentityCount !== catalog.partialIdentityCount ||
      identity.unresolvedIdentityCount !== catalog.unresolvedIdentityCount
    ) {
      throw new Error(
        `M1.5C cycle ${cycleIndex} catalog and identity denominators disagree`,
      );
    }
    if (
      persistence.releaseId !== upstream.releaseId ||
      persistence.workerRunId !== input.expectedWorkerRunId ||
      persistence.cycleIndex !== cycleIndex ||
      persistence.previousReceiptHash !== expectedPreviousPersistence ||
      persistence.catalogCaptureBindingId !== catalog.captureBindingId ||
      persistence.catalogCaptureBindingHash !== catalog.contentHash ||
      persistence.identitySnapshotId !== identity.snapshotId ||
      persistence.identitySnapshotHash !== identity.contentHash ||
      persistence.baseFactSnapshotId !== facts.snapshotId ||
      persistence.baseFactSnapshotHash !== facts.contentHash ||
      stableContentHash(persistence.listingWatchBindingIds) !==
        stableContentHash(listingBindingIds) ||
      stableContentHash(persistence.listingWatchBindingHashes) !==
        stableContentHash(listingBindingHashes) ||
      persistence.listingWatchRefreshBatchHash !==
        stableContentHash(listingWatchRefreshBatch) ||
      persistence.persistedBytes !==
        catalogFile.bytes +
          identityFile.bytes +
          factsFile.bytes +
          bitgetListingFile.bytes +
          bybitListingFile.bytes +
          listingRefreshFile.bytes
    ) {
      throw new Error(
        `M1.5C cycle ${cycleIndex} persistence receipt does not bind disk bytes`,
      );
    }
    if (
      checkpoint.releaseId !== upstream.releaseId ||
      checkpoint.workerRunId !== input.expectedWorkerRunId ||
      checkpoint.cycleIndex !== cycleIndex ||
      checkpoint.previousCheckpointHash !== expectedPreviousCheckpoint ||
      checkpoint.persistenceReceiptId !== persistence.receiptId ||
      checkpoint.persistenceReceiptHash !== persistence.contentHash ||
      checkpoint.baseFactSnapshotId !== facts.snapshotId ||
      checkpoint.baseFactSnapshotHash !== facts.contentHash
    ) {
      throw new Error(
        `M1.5C cycle ${cycleIndex} checkpoint receipt chain drifted`,
      );
    }
    if (
      cycle.releaseId !== upstream.releaseId ||
      cycle.upstreamBindingId !== upstream.upstreamBindingId ||
      cycle.upstreamBindingHash !== upstream.contentHash ||
      cycle.workerRunId !== input.expectedWorkerRunId ||
      cycle.cycleIndex !== cycleIndex ||
      cycle.catalogCaptureBindingId !== catalog.captureBindingId ||
      cycle.catalogCaptureBindingHash !== catalog.contentHash ||
      cycle.identitySnapshotId !== identity.snapshotId ||
      cycle.identitySnapshotHash !== identity.contentHash ||
      cycle.baseFactSnapshotId !== facts.snapshotId ||
      cycle.baseFactSnapshotHash !== facts.contentHash ||
      cycle.persistenceReceiptId !== persistence.receiptId ||
      cycle.persistenceReceiptHash !== persistence.contentHash ||
      cycle.checkpointReceiptId !== checkpoint.checkpointId ||
      cycle.checkpointReceiptHash !== checkpoint.contentHash ||
      cycle.sourceCutoff !== facts.sourceCutoff ||
      Date.parse(persistence.persistedAt) > Date.parse(checkpoint.committedAt) ||
      Date.parse(checkpoint.committedAt) > Date.parse(cycle.completedAt)
    ) {
      throw new Error(
        `M1.5C cycle ${cycleIndex} evidence identities or chronology drifted`,
      );
    }
    const accounting = buildM1BaseFactShadowAccounting(facts);
    assertEqualHash(cycle.venues, accounting.venues, "Venue accounting");
    assertEqualHash(
      cycle.assetDomains,
      accounting.assetDomains,
      "asset-domain accounting",
    );
    assertEqualHash(
      cycle.lifecycleStates,
      accounting.lifecycleStates,
      "lifecycle accounting",
    );
    assertEqualHash(
      cycle.listingCheckpoint,
      accounting.listingCheckpoint,
      "listing checkpoint accounting",
    );

    cycles.push(cycle);
    catalogCaptureBindings.push(catalog);
    identitySnapshots.push(identity);
    listingWatchRefreshBatches.push(listingWatchRefreshBatch);
    listingWatchRefreshBatchHashes.push(
      stableContentHash(listingWatchRefreshBatch),
    );
    persistenceHashes.push(persistence.contentHash);
    checkpointHashes.push(checkpoint.contentHash);
  }

  const evidenceFile = await readRegularJson(
    path.join(canonicalRoot, "evidence.json"),
    MAX_EVIDENCE_BYTES,
    M1MultiAssetShadowEvidenceSchema,
    fingerprints,
  );
  verifiedBytes += evidenceFile.bytes;
  const evidence = evidenceFile.value;
  const rebuiltEvidence = buildM1MultiAssetShadowEvidence({
    upstreamBinding: upstream,
    cycles,
    evaluatedAt: evidence.evaluatedAt,
  });
  if (
    evidence.releaseId !== upstream.releaseId ||
    evidence.workerRunId !== input.expectedWorkerRunId ||
    evidence.upstreamBindingId !== upstream.upstreamBindingId ||
    evidence.upstreamBindingHash !== upstream.contentHash ||
    evidence.contentHash !== rebuiltEvidence.contentHash ||
    evidence.evidenceId !== rebuiltEvidence.evidenceId
  ) {
    throw new Error("M1.5C final evidence does not rebuild from disk cycles");
  }
  assertEqualHash(evidence, rebuiltEvidence, "final M1.5C evidence");

  exactNames(
    await readdir(canonicalRoot),
    [...cycleDirectoryNames, "evidence.json"],
    "M1.5C evidence root after verification",
  );
  for (const directoryName of cycleDirectoryNames) {
    exactNames(
      await readdir(path.join(canonicalRoot, directoryName)),
      EXPECTED_CYCLE_FILES,
      `M1.5C ${directoryName} after verification`,
    );
  }
  await assertFingerprintsUnchanged(fingerprints);

  const core = VerificationCoreSchema.parse({
    schemaVersion: M1_MULTI_ASSET_SHADOW_STORE_VERIFICATION_VERSION,
    releaseId: upstream.releaseId,
    verifiedAt: input.verifiedAt,
    upstreamBindingId: upstream.upstreamBindingId,
    upstreamBindingHash: upstream.contentHash,
    workerRunId: input.expectedWorkerRunId,
    evidenceId: evidence.evidenceId,
    evidenceHash: evidence.contentHash,
    evidenceStatus: evidence.status,
    cycleCount: 31,
    verifiedFileCount: 280,
    verifiedBytes,
    firstPersistenceReceiptHash: persistenceHashes[0],
    lastPersistenceReceiptHash: persistenceHashes.at(-1),
    firstCheckpointReceiptHash: checkpointHashes[0],
    lastCheckpointReceiptHash: checkpointHashes.at(-1),
    firstListingWatchRefreshBatchHash:
      listingWatchRefreshBatchHashes[0],
    lastListingWatchRefreshBatchHash:
      listingWatchRefreshBatchHashes.at(-1),
    componentAcceptanceGate:
      evidence.status ===
          "PASS_FOUR_VENUE_MULTI_ASSET_SHADOW_NO_AUTHORITY"
        ? "PASS"
        : "BLOCKED",
    verificationStatus: "PASS_EVIDENCE_INTEGRITY_NO_AUTHORITY",
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
    automaticTradingAllowed: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  const verification = deepFreezeArtifact(
    M1MultiAssetShadowStoreVerificationSchema.parse({
      ...core,
      verificationId:
        `m1-5c-store-verification:${contentHash.slice(7, 31)}`,
      contentHash,
    }),
  );
  return deepFreezeArtifact({
    verification,
    evidence,
    cycles,
    catalogCaptureBindings,
    identitySnapshots,
    listingWatchRefreshBatches,
    canonicalEvidenceRoot: canonicalRoot,
    authorityGranted: false,
    productionChanged: false,
    secretMaterialPresent: false,
  });
}
