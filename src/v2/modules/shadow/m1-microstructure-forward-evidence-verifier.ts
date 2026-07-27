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
  M1_SCOPE_EPOCH,
} from "../source-capability/source-capability-contract";
import {
  deepFreezeArtifact,
  omitArtifactFields,
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M1ExpandedShadowProviderPlanSchema,
  type M1ExpandedShadowProviderPlan,
} from "./adapters/m1-expanded-shadow-provider-adapters";
import {
  M1ShadowStoreAuditReceiptSchema,
  type M1ShadowObservationStore,
  type M1ShadowStoreAuditReceipt,
} from "./m1-expanded-shadow-store";
import {
  M1_MICROSTRUCTURE_FORWARD_CAPTURE_VERIFICATION_VERSION,
  M1MicrostructureForwardCaptureVerificationSchema,
  M1MicrostructureForwardWorkerManifestSchema,
  buildM1MicrostructureForwardCaptureVerification,
  type M1MicrostructureForwardCaptureResult,
  type M1MicrostructureForwardCaptureVerification,
  type M1MicrostructureForwardWorkerManifest,
} from "./m1-microstructure-forward-worker";
import {
  M1_MICROSTRUCTURE_FORWARD_PROFILE,
  M1MicrostructureForwardCycleSchema,
  M1MicrostructureForwardEvidenceSchema,
  M1MicrostructureForwardSelectionPlanSchema,
  buildM1MicrostructureForwardEvidence,
  type M1MicrostructureForwardCycle,
  type M1MicrostructureForwardEvidence,
  type M1MicrostructureForwardSelectionPlan,
} from "./m1-microstructure-forward-shadow-contract";
import {
  M1MultiAssetShadowEvidenceSchema,
  M1MultiAssetShadowUpstreamBindingSchema,
  type M1MultiAssetShadowEvidence,
  type M1MultiAssetShadowUpstreamBinding,
} from "./m1-multi-asset-shadow-contract";
import {
  parseM1ShadowLosslessJsonFrame,
} from "./m1-shadow-lossless-json";

export const M1_MICROSTRUCTURE_FORWARD_STORE_VERIFICATION_VERSION =
  "v2-m1-microstructure-forward-store-verification.v1" as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const WorkerRunIdSchema = z.string().regex(
  /^[a-z0-9][a-z0-9._:-]{7,160}$/u,
);
const MAX_SOURCE_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_CYCLE_BYTES = 16 * 1024 * 1024;
const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
const MAX_EVIDENCE_BYTES = 16 * 1024 * 1024;

const StoreVerificationCoreSchema = z.strictObject({
  schemaVersion: z.literal(
    M1_MICROSTRUCTURE_FORWARD_STORE_VERIFICATION_VERSION,
  ),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  verifiedAt: z.string().datetime({ offset: true }),
  workerRunId: WorkerRunIdSchema,
  workerManifestId: z.string().min(1),
  workerManifestHash: DigestSchema,
  captureVerificationId: z.string().min(1),
  captureVerificationHash: DigestSchema,
  evidenceId: z.string().min(1),
  evidenceHash: DigestSchema,
  evidenceStatus: z.enum([
    "PASS_FORWARD_MICROSTRUCTURE_SHADOW_NO_AUTHORITY",
    "BLOCKED_UPSTREAM_MULTI_ASSET_GATE",
    "BLOCKED_FORWARD_COVERAGE_OR_QUALITY",
    "BLOCKED_HOST_RECOVERY",
    "TEST_ONLY_NOT_FORWARD_LIVE_EVIDENCE",
  ]),
  cycleCount: z.literal(31),
  verifiedFileCount: z.literal(39),
  verifiedBytes: z.number().int().positive(),
  databaseRowCount: z.number().int().nonnegative(),
  observationContentChainHash: DigestSchema,
  cycleContentChainHash: DigestSchema,
  componentAcceptanceGate: z.enum(["PASS", "BLOCKED"]),
  verificationStatus: z.literal(
    "PASS_FINAL_EVIDENCE_INTEGRITY_NO_AUTHORITY",
  ),
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  authorityGranted: z.literal(false),
  automaticTradingAllowed: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1MicrostructureForwardStoreVerificationSchema =
  StoreVerificationCoreSchema.extend({
    verificationId: z.string().min(1),
    contentHash: DigestSchema,
  }).superRefine((verification, context) => {
    const core = StoreVerificationCoreSchema.parse(
      omitArtifactFields(verification, ["verificationId", "contentHash"]),
    );
    const expectedHash = stableContentHash(core);
    if (
      verification.contentHash !== expectedHash ||
      verification.verificationId !==
        `m1-micro-forward-store-verification:${
          expectedHash.slice(7, 31)
        }`
    ) {
      context.addIssue({
        code: "custom",
        message: "M1.5D final store verification identity mismatch",
        path: ["contentHash"],
      });
    }
    const expectedGate =
      verification.evidenceStatus ===
          "PASS_FORWARD_MICROSTRUCTURE_SHADOW_NO_AUTHORITY"
        ? "PASS"
        : "BLOCKED";
    if (verification.componentAcceptanceGate !== expectedGate) {
      context.addIssue({
        code: "custom",
        message: "M1.5D verification cannot overstate component acceptance",
        path: ["componentAcceptanceGate"],
      });
    }
  });

export type M1MicrostructureForwardStoreVerification = z.infer<
  typeof M1MicrostructureForwardStoreVerificationSchema
>;

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

type VerifiedCaptureFiles = Readonly<{
  root: string;
  manifest: M1MicrostructureForwardWorkerManifest;
  upstream: M1MultiAssetShadowUpstreamBinding;
  multiAsset: M1MultiAssetShadowEvidence;
  selection: M1MicrostructureForwardSelectionPlan;
  provider: M1ExpandedShadowProviderPlan;
  storeAudit: M1ShadowStoreAuditReceipt;
  cycles: readonly M1MicrostructureForwardCycle[];
  fingerprints: readonly FileFingerprint[];
  verifiedBytes: number;
}>;

function fingerprint(
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
  return left.target === right.target &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.modifiedAtNs === right.modifiedAtNs &&
    left.changedAtNs === right.changedAtNs;
}

function exactNames(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (
    left.length !== right.length ||
    left.some((value, index) => value !== right[index])
  ) {
    throw new Error(`${label} entries disagree: ${JSON.stringify(left)}`);
  }
}

async function assertDirectory(directory: string): Promise<FileFingerprint> {
  const stats = await lstat(directory, { bigint: true });
  if (
    !stats.isDirectory() ||
    (stats.mode & BigInt(0o077)) !== BigInt(0) ||
    await realpath(directory) !== directory
  ) {
    throw new Error(
      `M1.5D evidence directory identity or permissions invalid: ${directory}`,
    );
  }
  return fingerprint(directory, stats);
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
        `M1.5D evidence file identity, size or permissions invalid: ${target}`,
      );
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const beforeFingerprint = fingerprint(target, before);
    const afterFingerprint = fingerprint(target, after);
    if (
      bytes.byteLength !== Number(before.size) ||
      !sameFingerprint(beforeFingerprint, afterFingerprint)
    ) {
      throw new Error(`M1.5D evidence file changed during read: ${target}`);
    }
    const value = schema.parse(
      parseM1ShadowLosslessJsonFrame(bytes.toString("utf8")),
    );
    const canonicalBytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
    if (!bytes.equals(canonicalBytes)) {
      throw new Error(
        `M1.5D evidence file is not canonical JSON: ${target}`,
      );
    }
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

async function assertFingerprintsUnchanged(
  fingerprints: readonly FileFingerprint[],
): Promise<void> {
  for (const expected of fingerprints) {
    const current = fingerprint(
      expected.target,
      await lstat(expected.target, { bigint: true }),
    );
    if (!sameFingerprint(current, expected)) {
      throw new Error(
        `M1.5D evidence identity changed during verification: ${
          expected.target
        }`,
      );
    }
  }
}

function cycleDirectoryNames(): string[] {
  return Array.from(
    { length: M1_MICROSTRUCTURE_FORWARD_PROFILE.cycleCount },
    (_, index) => `cycle-${String(index + 1).padStart(2, "0")}`,
  );
}

function captureRootEntries(): string[] {
  return [
    ...cycleDirectoryNames(),
    "multi-asset-evidence.json",
    "provider-plan.json",
    "selection-plan.json",
    "store-audit.json",
    "upstream-binding.json",
    "worker-manifest.json",
  ];
}

function finalRootEntries(): string[] {
  return [
    ...captureRootEntries(),
    "capture-verification.json",
    "evidence.json",
  ];
}

function assertCaptureIdentity(input: {
  readonly manifest: M1MicrostructureForwardWorkerManifest;
  readonly upstream: M1MultiAssetShadowUpstreamBinding;
  readonly multiAsset: M1MultiAssetShadowEvidence;
  readonly selection: M1MicrostructureForwardSelectionPlan;
  readonly provider: M1ExpandedShadowProviderPlan;
  readonly storeAudit: M1ShadowStoreAuditReceipt;
  readonly cycles: readonly M1MicrostructureForwardCycle[];
}): void {
  const {
    manifest,
    upstream,
    multiAsset,
    selection,
    provider,
    storeAudit,
    cycles,
  } = input;
  if (
    manifest.releaseId !== upstream.releaseId ||
    manifest.upstreamBindingId !== upstream.upstreamBindingId ||
    manifest.upstreamBindingHash !== upstream.contentHash ||
    manifest.multiAssetShadowEvidenceId !== multiAsset.evidenceId ||
    manifest.multiAssetShadowEvidenceHash !== multiAsset.contentHash ||
    manifest.selectionPlanId !== selection.planId ||
    manifest.selectionPlanHash !== selection.contentHash ||
    manifest.providerPlanId !== provider.planId ||
    manifest.providerPlanHash !== provider.contentHash ||
    manifest.workerRunId !== storeAudit.workerRunId ||
    manifest.evidenceClass !== upstream.evidenceClass ||
    manifest.networkEnvironment !== upstream.networkEnvironment
  ) {
    throw new Error("M1.5D capture source or manifest identity drifted");
  }
  if (
    multiAsset.releaseId !== upstream.releaseId ||
    selection.releaseId !== upstream.releaseId ||
    provider.releaseId !== upstream.releaseId ||
    multiAsset.upstreamBindingId !== upstream.upstreamBindingId ||
    selection.upstreamBindingId !== upstream.upstreamBindingId ||
    multiAsset.upstreamBindingHash !== upstream.contentHash ||
    selection.upstreamBindingHash !== upstream.contentHash
  ) {
    throw new Error("M1.5D capture exact upstream binding drifted");
  }
  if (cycles.length !== 31) {
    throw new Error("M1.5D capture cycle denominator drifted");
  }
  for (const [index, cycle] of cycles.entries()) {
    if (
      cycle.cycleIndex !== index + 1 ||
      cycle.releaseId !== manifest.releaseId ||
      cycle.upstreamBindingId !== manifest.upstreamBindingId ||
      cycle.upstreamBindingHash !== manifest.upstreamBindingHash ||
      cycle.planId !== manifest.selectionPlanId ||
      cycle.planHash !== manifest.selectionPlanHash ||
      cycle.workerRunId !== manifest.workerRunId ||
      cycle.runtimeConfigDigest !== manifest.runtimeConfigDigest
    ) {
      throw new Error(
        `M1.5D cycle ${index + 1} source identity drifted`,
      );
    }
    if (index === 0) continue;
    const previous = cycles[index - 1]!;
    if (
      Date.parse(cycle.scheduledAt) - Date.parse(previous.scheduledAt) !==
        M1_MICROSTRUCTURE_FORWARD_PROFILE.cadenceMs ||
      Date.parse(cycle.startedAt) < Date.parse(previous.completedAt) ||
      Date.parse(cycle.sourceCutoff) <= Date.parse(previous.sourceCutoff)
    ) {
      throw new Error(
        `M1.5D cycle ${index + 1} is stitched, overlapping or non-monotonic`,
      );
    }
  }
  const persistedRecordCount = cycles.reduce(
    (total, cycle) => total + cycle.persistedRecordCount,
    0,
  );
  const compressedPayloadBytes = cycles.reduce(
    (total, cycle) =>
      total + cycle.resources.compressedPayloadBytes,
    0,
  );
  if (
    storeAudit.rowCount !== persistedRecordCount ||
    storeAudit.compressedPayloadBytes !== compressedPayloadBytes
  ) {
    throw new Error(
      "M1.5D database audit and cycle byte or row denominators disagree",
    );
  }
}

async function readCaptureFiles(input: {
  readonly evidenceRoot: string;
  readonly final: boolean;
}): Promise<VerifiedCaptureFiles> {
  if (
    !path.isAbsolute(input.evidenceRoot) ||
    path.normalize(input.evidenceRoot) !== input.evidenceRoot
  ) {
    throw new Error("M1.5D verification root must be absolute and normalized");
  }
  const root = await realpath(input.evidenceRoot);
  if (root !== input.evidenceRoot) {
    throw new Error("M1.5D verification root must already be canonical");
  }
  await assertDirectory(root);
  exactNames(
    await readdir(root),
    input.final ? finalRootEntries() : captureRootEntries(),
    "M1.5D evidence root",
  );
  const fingerprints: FileFingerprint[] = [];
  const manifestFile = await readRegularJson(
    path.join(root, "worker-manifest.json"),
    MAX_RECEIPT_BYTES,
    M1MicrostructureForwardWorkerManifestSchema,
    fingerprints,
  );
  const upstreamFile = await readRegularJson(
    path.join(root, "upstream-binding.json"),
    MAX_SOURCE_ARTIFACT_BYTES,
    M1MultiAssetShadowUpstreamBindingSchema,
    fingerprints,
  );
  const multiAssetFile = await readRegularJson(
    path.join(root, "multi-asset-evidence.json"),
    MAX_SOURCE_ARTIFACT_BYTES,
    M1MultiAssetShadowEvidenceSchema,
    fingerprints,
  );
  const selectionFile = await readRegularJson(
    path.join(root, "selection-plan.json"),
    MAX_SOURCE_ARTIFACT_BYTES,
    M1MicrostructureForwardSelectionPlanSchema,
    fingerprints,
  );
  const providerFile = await readRegularJson(
    path.join(root, "provider-plan.json"),
    MAX_SOURCE_ARTIFACT_BYTES,
    M1ExpandedShadowProviderPlanSchema,
    fingerprints,
  );
  const storeAuditFile = await readRegularJson(
    path.join(root, "store-audit.json"),
    MAX_RECEIPT_BYTES,
    M1ShadowStoreAuditReceiptSchema,
    fingerprints,
  );
  let verifiedBytes =
    manifestFile.bytes +
    upstreamFile.bytes +
    multiAssetFile.bytes +
    selectionFile.bytes +
    providerFile.bytes +
    storeAuditFile.bytes;
  const cycles: M1MicrostructureForwardCycle[] = [];
  for (const [index, directoryName] of cycleDirectoryNames().entries()) {
    const directory = path.join(root, directoryName);
    fingerprints.push(await assertDirectory(directory));
    exactNames(
      await readdir(directory),
      ["cycle.json"],
      `M1.5D cycle ${index + 1}`,
    );
    const cycleFile = await readRegularJson(
      path.join(directory, "cycle.json"),
      MAX_CYCLE_BYTES,
      M1MicrostructureForwardCycleSchema,
      fingerprints,
    );
    verifiedBytes += cycleFile.bytes;
    cycles.push(cycleFile.value);
  }
  assertCaptureIdentity({
    manifest: manifestFile.value,
    upstream: upstreamFile.value,
    multiAsset: multiAssetFile.value,
    selection: selectionFile.value,
    provider: providerFile.value,
    storeAudit: storeAuditFile.value,
    cycles,
  });
  return {
    root,
    manifest: manifestFile.value,
    upstream: upstreamFile.value,
    multiAsset: multiAssetFile.value,
    selection: selectionFile.value,
    provider: providerFile.value,
    storeAudit: storeAuditFile.value,
    cycles,
    fingerprints,
    verifiedBytes,
  };
}

function sameStoreAuditContent(
  left: M1ShadowStoreAuditReceipt,
  right: M1ShadowStoreAuditReceipt,
): boolean {
  return left.databaseName === right.databaseName &&
    left.workerRunId === right.workerRunId &&
    left.rowCount === right.rowCount &&
    left.observedCycleCount === right.observedCycleCount &&
    left.firstCycleIndex === right.firstCycleIndex &&
    left.lastCycleIndex === right.lastCycleIndex &&
    left.compressedPayloadBytes === right.compressedPayloadBytes &&
    left.observationContentChainHash ===
      right.observationContentChainHash;
}

export async function verifyM1MicrostructureForwardCaptureStore(input: {
  readonly evidenceRoot: string;
  readonly observationStore: M1ShadowObservationStore;
  readonly expectedReleaseId: string;
  readonly expectedWorkerRunId: string;
  readonly verifiedAt: string;
}): Promise<{
  readonly capture: M1MicrostructureForwardCaptureResult;
  readonly verification: M1MicrostructureForwardCaptureVerification;
}> {
  const files = await readCaptureFiles({
    evidenceRoot: input.evidenceRoot,
    final: false,
  });
  if (
    files.manifest.releaseId !== ReleaseIdSchema.parse(input.expectedReleaseId) ||
    files.manifest.workerRunId !==
      WorkerRunIdSchema.parse(input.expectedWorkerRunId)
  ) {
    throw new Error("M1.5D expected release or Worker identity drifted");
  }
  const independentAudit = await input.observationStore.auditRun(
    files.manifest.workerRunId,
    input.verifiedAt,
  );
  if (!sameStoreAuditContent(files.storeAudit, independentAudit)) {
    throw new Error(
      "M1.5D independently queried database audit does not reconcile",
    );
  }
  const persistedRecordCount = files.cycles.reduce(
    (total, cycle) => total + cycle.persistedRecordCount,
    0,
  );
  const verification =
    buildM1MicrostructureForwardCaptureVerification({
      schemaVersion:
        M1_MICROSTRUCTURE_FORWARD_CAPTURE_VERIFICATION_VERSION,
      scopeEpoch: M1_SCOPE_EPOCH,
      releaseId: files.manifest.releaseId,
      verifiedAt: input.verifiedAt,
      workerRunId: files.manifest.workerRunId,
      workerManifestId: files.manifest.manifestId,
      workerManifestHash: files.manifest.contentHash,
      storeAuditId: files.storeAudit.receiptId,
      storeAuditHash: files.storeAudit.contentHash,
      independentStoreAuditId: independentAudit.receiptId,
      independentStoreAuditHash: independentAudit.contentHash,
      observationContentChainHash:
        independentAudit.observationContentChainHash,
      cycleContentChainHash: stableContentHash(
        files.cycles.map((cycle) => ({
          cycleId: cycle.cycleId,
          contentHash: cycle.contentHash,
        })),
      ),
      cycleCount: 31,
      verifiedFileCount: 37,
      databaseRowCount: independentAudit.rowCount,
      persistedRecordCount,
      compressedPayloadBytes:
        independentAudit.compressedPayloadBytes,
      status: "PASS_CAPTURE_AND_DATABASE_INTEGRITY_NO_AUTHORITY",
      rawBodyRetained: false,
      secretMaterialPresent: false,
      factAuthorityGranted: false,
      candidateAuthorityGranted: false,
      strategyAuthorityGranted: false,
      readyAuthorityGranted: false,
      automaticTradingAllowed: false,
      productionChanged: false,
    });
  exactNames(
    await readdir(files.root),
    captureRootEntries(),
    "M1.5D capture root after database verification",
  );
  await assertFingerprintsUnchanged(files.fingerprints);
  const capture: M1MicrostructureForwardCaptureResult =
    deepFreezeArtifact({
      manifest: files.manifest,
      upstreamBinding: files.upstream,
      multiAssetShadowEvidence: files.multiAsset,
      selectionPlan: files.selection,
      providerPlan: files.provider,
      cycles: files.cycles,
      storeAudit: files.storeAudit,
      canonicalEvidenceRoot: files.root,
      authorityGranted: false,
      productionChanged: false,
      secretMaterialPresent: false,
    });
  return deepFreezeArtifact({ capture, verification });
}

export async function verifyM1MicrostructureForwardEvidenceStore(input: {
  readonly evidenceRoot: string;
  readonly expectedReleaseId: string;
  readonly expectedWorkerRunId: string;
  readonly verifiedAt: string;
}): Promise<{
  readonly verification: M1MicrostructureForwardStoreVerification;
  readonly evidence: M1MicrostructureForwardEvidence;
  readonly cycles: readonly M1MicrostructureForwardCycle[];
  readonly canonicalEvidenceRoot: string;
  readonly authorityGranted: false;
  readonly productionChanged: false;
  readonly secretMaterialPresent: false;
}> {
  const files = await readCaptureFiles({
    evidenceRoot: input.evidenceRoot,
    final: true,
  });
  if (
    files.manifest.releaseId !== ReleaseIdSchema.parse(input.expectedReleaseId) ||
    files.manifest.workerRunId !==
      WorkerRunIdSchema.parse(input.expectedWorkerRunId)
  ) {
    throw new Error("M1.5D final expected release or Worker identity drifted");
  }
  const mutableFingerprints = [...files.fingerprints];
  const captureVerificationFile = await readRegularJson(
    path.join(files.root, "capture-verification.json"),
    MAX_RECEIPT_BYTES,
    M1MicrostructureForwardCaptureVerificationSchema,
    mutableFingerprints,
  );
  const evidenceFile = await readRegularJson(
    path.join(files.root, "evidence.json"),
    MAX_EVIDENCE_BYTES,
    M1MicrostructureForwardEvidenceSchema,
    mutableFingerprints,
  );
  const captureVerification = captureVerificationFile.value;
  const evidence = evidenceFile.value;
  const cycleContentChainHash = stableContentHash(
    files.cycles.map((cycle) => ({
      cycleId: cycle.cycleId,
      contentHash: cycle.contentHash,
    })),
  );
  if (
    captureVerification.releaseId !== files.manifest.releaseId ||
    captureVerification.workerRunId !== files.manifest.workerRunId ||
    captureVerification.workerManifestId !== files.manifest.manifestId ||
    captureVerification.workerManifestHash !== files.manifest.contentHash ||
    captureVerification.storeAuditId !== files.storeAudit.receiptId ||
    captureVerification.storeAuditHash !== files.storeAudit.contentHash ||
    captureVerification.observationContentChainHash !==
      files.storeAudit.observationContentChainHash ||
    captureVerification.cycleContentChainHash !== cycleContentChainHash
  ) {
    throw new Error("M1.5D capture verification binding drifted");
  }
  const rebuiltEvidence = buildM1MicrostructureForwardEvidence({
    upstreamBinding: files.upstream,
    multiAssetShadowEvidence: files.multiAsset,
    plan: files.selection,
    cycles: files.cycles,
    evaluatedAt: evidence.evaluatedAt,
    hostRecovery: evidence.hostRecovery,
  });
  if (
    stableContentHash(evidence) !== stableContentHash(rebuiltEvidence) ||
    evidence.contentHash !== rebuiltEvidence.contentHash ||
    evidence.evidenceId !== rebuiltEvidence.evidenceId
  ) {
    throw new Error("M1.5D final evidence does not rebuild from disk cycles");
  }
  exactNames(
    await readdir(files.root),
    finalRootEntries(),
    "M1.5D final evidence root after verification",
  );
  for (const directoryName of cycleDirectoryNames()) {
    exactNames(
      await readdir(path.join(files.root, directoryName)),
      ["cycle.json"],
      `M1.5D ${directoryName} after verification`,
    );
  }
  await assertFingerprintsUnchanged(mutableFingerprints);
  const core = StoreVerificationCoreSchema.parse({
    schemaVersion: M1_MICROSTRUCTURE_FORWARD_STORE_VERIFICATION_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: files.manifest.releaseId,
    verifiedAt: input.verifiedAt,
    workerRunId: files.manifest.workerRunId,
    workerManifestId: files.manifest.manifestId,
    workerManifestHash: files.manifest.contentHash,
    captureVerificationId: captureVerification.verificationId,
    captureVerificationHash: captureVerification.contentHash,
    evidenceId: evidence.evidenceId,
    evidenceHash: evidence.contentHash,
    evidenceStatus: evidence.status,
    cycleCount: 31,
    verifiedFileCount: 39,
    verifiedBytes:
      files.verifiedBytes +
      captureVerificationFile.bytes +
      evidenceFile.bytes,
    databaseRowCount: captureVerification.databaseRowCount,
    observationContentChainHash:
      captureVerification.observationContentChainHash,
    cycleContentChainHash,
    componentAcceptanceGate:
      evidence.status ===
          "PASS_FORWARD_MICROSTRUCTURE_SHADOW_NO_AUTHORITY"
        ? "PASS"
        : "BLOCKED",
    verificationStatus: "PASS_FINAL_EVIDENCE_INTEGRITY_NO_AUTHORITY",
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
    automaticTradingAllowed: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  const verification = deepFreezeArtifact(
    M1MicrostructureForwardStoreVerificationSchema.parse({
      ...core,
      verificationId:
        `m1-micro-forward-store-verification:${
          contentHash.slice(7, 31)
        }`,
      contentHash,
    }),
  );
  return deepFreezeArtifact({
    verification,
    evidence,
    cycles: files.cycles,
    canonicalEvidenceRoot: files.root,
    authorityGranted: false,
    productionChanged: false,
    secretMaterialPresent: false,
  });
}
