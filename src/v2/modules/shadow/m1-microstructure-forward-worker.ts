import {
  constants,
} from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  realpath,
  statfs,
  unlink,
} from "node:fs/promises";
import {
  availableParallelism,
} from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
} from "../../runtime-schema/primitives";
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
  M1ExpandedShadowLiveTransport,
  type M1ShadowConnectionCycleEvidence,
  type M1ShadowRestSnapshotCapture,
  type M1ShadowTransportFailure,
  type M1ShadowTransportFrame,
} from "./m1-expanded-shadow-live-transport";
import {
  M1ExpandedShadowCaptureRuntime,
  type M1ShadowRuntimeResourceSample,
} from "./m1-expanded-shadow-runtime";
import {
  M1ShadowStoreAuditReceiptSchema,
  M1PostgresShadowObservationStore,
  type M1ShadowObservationStore,
  type M1ShadowStoreAuditReceipt,
} from "./m1-expanded-shadow-store";
import {
  M1_MICROSTRUCTURE_FORWARD_PROFILE,
  M1MicrostructureForwardCycleSchema,
  M1MicrostructureForwardEvidenceSchema,
  M1MicrostructureForwardSelectionPlanSchema,
  buildM1MicrostructureForwardEvidence,
  type M1MicrostructureForwardCycle,
  type M1MicrostructureForwardEvidence,
  type M1MicrostructureForwardHostRecovery,
  type M1MicrostructureForwardSelectionPlan,
} from "./m1-microstructure-forward-shadow-contract";
import {
  M1MultiAssetShadowEvidenceSchema,
  M1MultiAssetShadowUpstreamBindingSchema,
  type M1MultiAssetShadowEvidence,
  type M1MultiAssetShadowUpstreamBinding,
} from "./m1-multi-asset-shadow-contract";

export const M1_MICROSTRUCTURE_FORWARD_WORKER_MANIFEST_VERSION =
  "v2-m1-microstructure-forward-worker-manifest.v1" as const;
export const M1_MICROSTRUCTURE_FORWARD_CAPTURE_VERIFICATION_VERSION =
  "v2-m1-microstructure-forward-capture-verification.v1" as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const WorkerRunIdSchema = z.string().regex(
  /^[a-z0-9][a-z0-9._:-]{7,160}$/u,
);

const WorkerManifestCoreSchema = z.strictObject({
  schemaVersion: z.literal(
    M1_MICROSTRUCTURE_FORWARD_WORKER_MANIFEST_VERSION,
  ),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  generatedAt: IsoDateTimeSchema,
  upstreamBindingId: NonEmptyStringSchema,
  upstreamBindingHash: DigestSchema,
  multiAssetShadowEvidenceId: NonEmptyStringSchema,
  multiAssetShadowEvidenceHash: DigestSchema,
  selectionPlanId: NonEmptyStringSchema,
  selectionPlanHash: DigestSchema,
  providerPlanId: NonEmptyStringSchema,
  providerPlanHash: DigestSchema,
  workerRunId: WorkerRunIdSchema,
  runtimeConfigDigest: DigestSchema,
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  networkEnvironment: z.enum([
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  cycleCount: z.literal(31),
  cadenceMs: z.literal(60_000),
  captureDurationMs: z.number().int().min(1).max(25_000),
  observationStore: z.enum([
    "ISOLATED_POSTGRESQL_16",
    "TEST_ONLY_INJECTED_STORE",
  ]),
  transportMode: z.enum([
    "NATIVE_FOUR_VENUE_PUBLIC_ONLY",
    "TEST_ONLY_INJECTED_TRANSPORT",
  ]),
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  automaticTradingAllowed: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1MicrostructureForwardWorkerManifestSchema =
  WorkerManifestCoreSchema.extend({
    manifestId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((manifest, context) => {
    const core = WorkerManifestCoreSchema.parse(
      omitArtifactFields(manifest, ["manifestId", "contentHash"]),
    );
    const expectedHash = stableContentHash(core);
    if (
      manifest.contentHash !== expectedHash ||
      manifest.manifestId !==
        `m1-micro-forward-worker:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "M1.5D Worker manifest identity mismatch",
        path: ["contentHash"],
      });
    }
  });

export type M1MicrostructureForwardWorkerManifest = z.infer<
  typeof M1MicrostructureForwardWorkerManifestSchema
>;

const CaptureVerificationCoreSchema = z.strictObject({
  schemaVersion: z.literal(
    M1_MICROSTRUCTURE_FORWARD_CAPTURE_VERIFICATION_VERSION,
  ),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  verifiedAt: IsoDateTimeSchema,
  workerRunId: WorkerRunIdSchema,
  workerManifestId: NonEmptyStringSchema,
  workerManifestHash: DigestSchema,
  storeAuditId: NonEmptyStringSchema,
  storeAuditHash: DigestSchema,
  independentStoreAuditId: NonEmptyStringSchema,
  independentStoreAuditHash: DigestSchema,
  observationContentChainHash: DigestSchema,
  cycleContentChainHash: DigestSchema,
  cycleCount: z.literal(31),
  verifiedFileCount: z.literal(37),
  databaseRowCount: NonNegativeIntegerSchema,
  persistedRecordCount: NonNegativeIntegerSchema,
  compressedPayloadBytes: NonNegativeIntegerSchema,
  status: z.literal(
    "PASS_CAPTURE_AND_DATABASE_INTEGRITY_NO_AUTHORITY",
  ),
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  automaticTradingAllowed: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1MicrostructureForwardCaptureVerificationSchema =
  CaptureVerificationCoreSchema.extend({
    verificationId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((verification, context) => {
    const core = CaptureVerificationCoreSchema.parse(
      omitArtifactFields(verification, ["verificationId", "contentHash"]),
    );
    const expectedHash = stableContentHash(core);
    if (
      verification.contentHash !== expectedHash ||
      verification.verificationId !==
        `m1-micro-forward-capture-verification:${
          expectedHash.slice(7, 31)
        }`
    ) {
      context.addIssue({
        code: "custom",
        message: "M1.5D capture verification identity mismatch",
        path: ["contentHash"],
      });
    }
    if (
      verification.databaseRowCount !==
        verification.persistedRecordCount
    ) {
      context.addIssue({
        code: "custom",
        message: "M1.5D database and cycle persistence denominators disagree",
        path: ["databaseRowCount"],
      });
    }
  });

export type M1MicrostructureForwardCaptureVerification = z.infer<
  typeof M1MicrostructureForwardCaptureVerificationSchema
>;

export function buildM1MicrostructureForwardCaptureVerification(
  input: z.input<typeof CaptureVerificationCoreSchema>,
): M1MicrostructureForwardCaptureVerification {
  const core = CaptureVerificationCoreSchema.parse(input);
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(
    M1MicrostructureForwardCaptureVerificationSchema.parse({
      ...core,
      verificationId:
        `m1-micro-forward-capture-verification:${
          contentHash.slice(7, 31)
        }`,
      contentHash,
    }),
  );
}

export type M1MicrostructureForwardTransport = {
  start(): Promise<void>;
  stop(): Promise<void>;
  setCaptureWindow(input: {
    readonly startsAt: string;
    readonly endsAt: string;
  }): void;
  clearCaptureWindow(): void;
  drainFrames(cutoffAt: string): readonly M1ShadowTransportFrame[];
  consumeTransportFailures(): readonly M1ShadowTransportFailure[];
  consumeConnectionCycleEvidence(
    evaluatedAt: string,
  ): readonly M1ShadowConnectionCycleEvidence[];
  captureRestSnapshots(): Promise<readonly M1ShadowRestSnapshotCapture[]>;
};

export type M1MicrostructureForwardResourceImplementation = (input: {
  readonly cycleIndex: number;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly evidenceRoot: string;
}) => Promise<M1ShadowRuntimeResourceSample>;

export type M1MicrostructureForwardCaptureResult = Readonly<{
  manifest: M1MicrostructureForwardWorkerManifest;
  upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  multiAssetShadowEvidence: M1MultiAssetShadowEvidence;
  selectionPlan: M1MicrostructureForwardSelectionPlan;
  providerPlan: M1ExpandedShadowProviderPlan;
  cycles: readonly M1MicrostructureForwardCycle[];
  storeAudit: M1ShadowStoreAuditReceipt;
  canonicalEvidenceRoot: string;
  authorityGranted: false;
  productionChanged: false;
  secretMaterialPresent: false;
}>;

export type M1MicrostructureForwardWorkerResult = Readonly<{
  capture: M1MicrostructureForwardCaptureResult;
  captureVerification: M1MicrostructureForwardCaptureVerification;
  evidence: M1MicrostructureForwardEvidence;
  canonicalEvidenceRoot: string;
  authorityGranted: false;
  productionChanged: false;
  secretMaterialPresent: false;
}>;

function workerManifestCore(
  input: Omit<
    z.input<typeof WorkerManifestCoreSchema>,
    "schemaVersion" | "scopeEpoch"
  >,
): z.infer<typeof WorkerManifestCoreSchema> {
  return WorkerManifestCoreSchema.parse({
    ...input,
    schemaVersion: M1_MICROSTRUCTURE_FORWARD_WORKER_MANIFEST_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
  });
}

function buildWorkerManifest(
  input: Omit<
    z.input<typeof WorkerManifestCoreSchema>,
    "schemaVersion" | "scopeEpoch"
  >,
): M1MicrostructureForwardWorkerManifest {
  const core = workerManifestCore(input);
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(
    M1MicrostructureForwardWorkerManifestSchema.parse({
      ...core,
      manifestId: `m1-micro-forward-worker:${contentHash.slice(7, 31)}`,
      contentHash,
    }),
  );
}

function sleepFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeIso(date: Date, reason: string): string {
  if (!Number.isFinite(date.getTime())) throw new Error(reason);
  return date.toISOString();
}

function safeNonNegativeInteger(value: number, reason: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(reason);
  return value;
}

function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
}

async function diskFreeBytes(target: string): Promise<number> {
  const stats = await statfs(target);
  const value = Number(stats.bavail) * Number(stats.bsize);
  return safeNonNegativeInteger(value, "M1.5D disk free bytes are invalid");
}

type NativeResourceMonitor = {
  readonly diskFreeBytesBefore: number;
  readonly cpuPercentSamples: number[];
  readonly rssSamples: number[];
  previousCpuUsage: NodeJS.CpuUsage;
  previousSampleAtMs: number;
};

async function startNativeResourceMonitor(
  evidenceRoot: string,
): Promise<NativeResourceMonitor> {
  return {
    diskFreeBytesBefore: await diskFreeBytes(evidenceRoot),
    cpuPercentSamples: [],
    rssSamples: [process.memoryUsage().rss],
    previousCpuUsage: process.cpuUsage(),
    previousSampleAtMs: Date.now(),
  };
}

function sampleNativeResources(monitor: NativeResourceMonitor): void {
  const sampledAtMs = Date.now();
  const elapsedMs = Math.max(1, sampledAtMs - monitor.previousSampleAtMs);
  const delta = process.cpuUsage(monitor.previousCpuUsage);
  const processorCount = Math.max(1, availableParallelism());
  const percent = Math.min(
    100,
    ((delta.user + delta.system) / 1_000) /
      elapsedMs /
      processorCount *
      100,
  );
  monitor.cpuPercentSamples.push(percent);
  monitor.rssSamples.push(process.memoryUsage().rss);
  monitor.previousCpuUsage = process.cpuUsage();
  monitor.previousSampleAtMs = sampledAtMs;
}

async function finishNativeResourceMonitor(
  monitor: NativeResourceMonitor,
  evidenceRoot: string,
): Promise<M1ShadowRuntimeResourceSample> {
  sampleNativeResources(monitor);
  return {
    redisReadBytes: 0,
    redisWriteBytes: 0,
    redisPeakUsedBytes: 0,
    redisConfiguredMaxBytes: 0,
    cosObjectCount: 0,
    cosWriteBytes: 0,
    cpuP95Percent: percentile95(monitor.cpuPercentSamples),
    rssBytes: Math.max(...monitor.rssSamples),
    diskFreeBytesBefore: monitor.diskFreeBytesBefore,
    diskFreeBytesAfter: await diskFreeBytes(evidenceRoot),
  };
}

async function waitWithNativeResourceSampling(input: {
  readonly durationMs: number;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly monitor: NativeResourceMonitor;
}): Promise<void> {
  let remaining = input.durationMs;
  while (remaining > 0) {
    const slice = Math.min(1_000, remaining);
    await input.sleep(slice);
    sampleNativeResources(input.monitor);
    remaining -= slice;
  }
}

async function canonicalExclusiveRoot(
  target: string,
): Promise<string> {
  if (!path.isAbsolute(target) || path.normalize(target) !== target) {
    throw new Error("M1.5D evidence root must be absolute and normalized");
  }
  const parent = await realpath(path.dirname(target));
  const canonical = path.join(parent, path.basename(target));
  if (canonical !== target) {
    throw new Error("M1.5D evidence root parent identity drifted");
  }
  await mkdir(canonical, { mode: 0o700 });
  const stats = await lstat(canonical);
  if (!stats.isDirectory() || (stats.mode & 0o077) !== 0) {
    throw new Error("M1.5D evidence root permissions are invalid");
  }
  return canonical;
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
}

export async function writeM1MicrostructureArtifactExclusive(
  target: string,
  value: unknown,
): Promise<void> {
  const directory = path.dirname(target);
  const canonicalDirectory = await realpath(directory);
  if (canonicalDirectory !== directory) {
    throw new Error("M1.5D artifact directory identity drifted");
  }
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.${process.pid}.${stableContentHash({
      target,
      at: process.hrtime.bigint().toString(),
    }).slice(7, 23)}.tmp`,
  );
  const handle = await open(
    temporary,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(jsonBytes(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, target);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function persistCapturePreamble(input: {
  readonly root: string;
  readonly manifest: M1MicrostructureForwardWorkerManifest;
  readonly upstream: M1MultiAssetShadowUpstreamBinding;
  readonly multiAsset: M1MultiAssetShadowEvidence;
  readonly selection: M1MicrostructureForwardSelectionPlan;
  readonly provider: M1ExpandedShadowProviderPlan;
}): Promise<void> {
  await writeM1MicrostructureArtifactExclusive(
    path.join(input.root, "worker-manifest.json"),
    input.manifest,
  );
  await writeM1MicrostructureArtifactExclusive(
    path.join(input.root, "upstream-binding.json"),
    input.upstream,
  );
  await writeM1MicrostructureArtifactExclusive(
    path.join(input.root, "multi-asset-evidence.json"),
    input.multiAsset,
  );
  await writeM1MicrostructureArtifactExclusive(
    path.join(input.root, "selection-plan.json"),
    input.selection,
  );
  await writeM1MicrostructureArtifactExclusive(
    path.join(input.root, "provider-plan.json"),
    input.provider,
  );
}

function assertExactBindings(input: {
  readonly upstream: M1MultiAssetShadowUpstreamBinding;
  readonly multiAsset: M1MultiAssetShadowEvidence;
  readonly selection: M1MicrostructureForwardSelectionPlan;
  readonly provider: M1ExpandedShadowProviderPlan;
}): void {
  if (
    input.multiAsset.releaseId !== input.upstream.releaseId ||
    input.selection.releaseId !== input.upstream.releaseId ||
    input.provider.releaseId !== input.upstream.releaseId ||
    input.multiAsset.upstreamBindingId !== input.upstream.upstreamBindingId ||
    input.selection.upstreamBindingId !== input.upstream.upstreamBindingId ||
    input.multiAsset.upstreamBindingHash !== input.upstream.contentHash ||
    input.selection.upstreamBindingHash !== input.upstream.contentHash
  ) {
    throw new Error("M1.5D exact upstream or release identity drifted");
  }
  if (
    input.multiAsset.evidenceClass !== input.upstream.evidenceClass ||
    input.multiAsset.networkEnvironment !==
      input.upstream.networkEnvironment
  ) {
    throw new Error("M1.5D evidence class or network identity drifted");
  }
}

async function applyConnectionEvidence(
  runtime: M1ExpandedShadowCaptureRuntime,
  evidence: readonly M1ShadowConnectionCycleEvidence[],
): Promise<void> {
  for (const connection of evidence) {
    if (connection.attemptObserved) {
      runtime.markConnectionAttempt({
        role: connection.role,
        heartbeatObserved: connection.heartbeatObserved,
        networkEgressBytes: connection.networkEgressBytes,
      });
    } else {
      runtime.recordConnectionFailure({
        role: connection.role,
        reasonCode: "websocket_connection_attempt_unobserved",
      });
    }
    if (!connection.heartbeatObserved) {
      runtime.recordConnectionFailure({
        role: connection.role,
        reasonCode: "websocket_heartbeat_unobserved",
      });
    }
    for (const reasonCode of connection.reasonCodes) {
      runtime.recordConnectionFailure({
        role: connection.role,
        reasonCode,
      });
    }
  }
}

async function applyRestCaptures(
  runtime: M1ExpandedShadowCaptureRuntime,
  captures: readonly M1ShadowRestSnapshotCapture[],
): Promise<void> {
  for (const capture of captures) {
    runtime.markRestSnapshotAttempt({
      requestId: capture.requestId,
      responseObserved: capture.responseObserved,
      networkEgressBytes: capture.networkEgressBytes,
      failureReasonCode: capture.failureReasonCode ?? undefined,
    });
    if (capture.frame !== null) {
      await runtime.ingestProviderMessage(capture.frame);
    }
  }
}

async function applyTransportFrames(
  runtime: M1ExpandedShadowCaptureRuntime,
  frames: readonly M1ShadowTransportFrame[],
): Promise<void> {
  for (const frame of frames) {
    await runtime.ingestProviderMessage(frame);
  }
}

function applyTransportFailures(
  runtime: M1ExpandedShadowCaptureRuntime,
  failures: readonly M1ShadowTransportFailure[],
): void {
  for (const failure of failures) {
    runtime.recordTransportFailure(failure);
  }
}

export async function captureM1MicrostructureForwardWorker(input: {
  readonly upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  readonly multiAssetShadowEvidence: M1MultiAssetShadowEvidence;
  readonly selectionPlan: M1MicrostructureForwardSelectionPlan;
  readonly providerPlan: M1ExpandedShadowProviderPlan;
  readonly evidenceRoot: string;
  readonly workerRunId: string;
  readonly observationStore: M1ShadowObservationStore;
  readonly transportImplementation?: M1MicrostructureForwardTransport;
  readonly now?: () => Date;
  readonly sleepImplementation?: (milliseconds: number) => Promise<void>;
  readonly resourceImplementation?: M1MicrostructureForwardResourceImplementation;
  readonly captureDurationMs?: number;
}): Promise<M1MicrostructureForwardCaptureResult> {
  const upstream = M1MultiAssetShadowUpstreamBindingSchema.parse(
    input.upstreamBinding,
  );
  const multiAsset = M1MultiAssetShadowEvidenceSchema.parse(
    input.multiAssetShadowEvidence,
  );
  const selection = M1MicrostructureForwardSelectionPlanSchema.parse(
    input.selectionPlan,
  );
  const provider = M1ExpandedShadowProviderPlanSchema.parse(
    input.providerPlan,
  );
  const workerRunId = WorkerRunIdSchema.parse(input.workerRunId);
  assertExactBindings({ upstream, multiAsset, selection, provider });

  const injected =
    input.transportImplementation !== undefined ||
    input.now !== undefined ||
    input.sleepImplementation !== undefined ||
    input.resourceImplementation !== undefined ||
    input.captureDurationMs !== undefined ||
    !(input.observationStore instanceof M1PostgresShadowObservationStore);
  if (injected && upstream.evidenceClass !== "TEST_ONLY") {
    throw new Error(
      "M1.5D injected runtime, clock, resource or store must remain TEST_ONLY",
    );
  }
  if (
    upstream.evidenceClass === "LIVE_READ_ONLY" &&
    (
      upstream.networkEnvironment !== "TENCENT_ISOLATED_READ_ONLY" ||
      !(input.observationStore instanceof M1PostgresShadowObservationStore)
    )
  ) {
    throw new Error(
      "M1.5D LIVE capture requires isolated PostgreSQL and Tencent identity",
    );
  }

  const captureDurationMs = input.captureDurationMs ?? 20_000;
  if (
    !Number.isSafeInteger(captureDurationMs) ||
    captureDurationMs < 1 ||
    captureDurationMs > 25_000
  ) {
    throw new Error("M1.5D capture duration is outside the frozen SLO");
  }
  const now = input.now ?? (() => new Date());
  const sleep = input.sleepImplementation ?? sleepFor;
  const generatedAt = safeIso(now(), "M1.5D Worker clock is invalid");
  const scheduleStartsAtMs = Date.parse(selection.windowStartsAt);
  if (
    Date.parse(generatedAt) - scheduleStartsAtMs >
      M1_MICROSTRUCTURE_FORWARD_PROFILE.maxScheduleLagMs
  ) {
    throw new Error(
      "M1.5D frozen forward window is already outside the schedule SLO",
    );
  }
  const runtimeConfigDigest = stableContentHash({
    profile: M1_MICROSTRUCTURE_FORWARD_PROFILE,
    releaseId: upstream.releaseId,
    upstreamBindingId: upstream.upstreamBindingId,
    multiAssetShadowEvidenceHash: multiAsset.contentHash,
    selectionPlanHash: selection.contentHash,
    providerPlanHash: provider.contentHash,
    captureDurationMs,
    resourceSampling:
      input.resourceImplementation === undefined
        ? "NATIVE_PROCESS_AND_FILESYSTEM"
        : "TEST_ONLY_INJECTED",
  });
  const manifest = buildWorkerManifest({
    releaseId: upstream.releaseId,
    generatedAt,
    upstreamBindingId: upstream.upstreamBindingId,
    upstreamBindingHash: upstream.contentHash,
    multiAssetShadowEvidenceId: multiAsset.evidenceId,
    multiAssetShadowEvidenceHash: multiAsset.contentHash,
    selectionPlanId: selection.planId,
    selectionPlanHash: selection.contentHash,
    providerPlanId: provider.planId,
    providerPlanHash: provider.contentHash,
    workerRunId,
    runtimeConfigDigest,
    evidenceClass: upstream.evidenceClass,
    networkEnvironment: upstream.networkEnvironment,
    cycleCount: 31,
    cadenceMs: 60_000,
    captureDurationMs,
    observationStore:
      input.observationStore instanceof M1PostgresShadowObservationStore
        ? "ISOLATED_POSTGRESQL_16"
        : "TEST_ONLY_INJECTED_STORE",
    transportMode: input.transportImplementation === undefined
      ? "NATIVE_FOUR_VENUE_PUBLIC_ONLY"
      : "TEST_ONLY_INJECTED_TRANSPORT",
    rawBodyRetained: false,
    secretMaterialPresent: false,
    factAuthorityGranted: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    automaticTradingAllowed: false,
    productionChanged: false,
  });
  const root = await canonicalExclusiveRoot(input.evidenceRoot);
  await persistCapturePreamble({
    root,
    manifest,
    upstream,
    multiAsset,
    selection,
    provider,
  });

  const transport = input.transportImplementation ??
    new M1ExpandedShadowLiveTransport(provider);
  const runtime = new M1ExpandedShadowCaptureRuntime({
    providerPlan: provider,
    selectionPlan: selection,
    runtimeConfigDigest,
    workerRunId,
    store: input.observationStore,
  });
  await runtime.initialize();
  const cycles: M1MicrostructureForwardCycle[] = [];
  await transport.start();
  try {
    for (
      let cycleIndex = 1;
      cycleIndex <= M1_MICROSTRUCTURE_FORWARD_PROFILE.cycleCount;
      cycleIndex += 1
    ) {
      const scheduledAtMs = scheduleStartsAtMs +
        (cycleIndex - 1) * M1_MICROSTRUCTURE_FORWARD_PROFILE.cadenceMs;
      const beforeWaitMs = now().getTime();
      if (beforeWaitMs < scheduledAtMs) {
        await sleep(scheduledAtMs - beforeWaitMs);
      }
      const startedAt = now();
      const startedAtIso = safeIso(
        startedAt,
        "M1.5D cycle start clock is invalid",
      );
      const scheduleLagMs = Math.max(
        0,
        startedAt.getTime() - scheduledAtMs,
      );
      runtime.beginCycle({
        cycleIndex,
        scheduledAt: new Date(scheduledAtMs).toISOString(),
        startedAt: startedAtIso,
        missedScheduleStarts:
          scheduleLagMs >
              M1_MICROSTRUCTURE_FORWARD_PROFILE.maxScheduleLagMs
            ? 1
            : 0,
      });
      const captureEndsAt = new Date(
        startedAt.getTime() + captureDurationMs,
      ).toISOString();
      transport.setCaptureWindow({
        startsAt: startedAtIso,
        endsAt: captureEndsAt,
      });
      const nativeMonitor = input.resourceImplementation === undefined
        ? await startNativeResourceMonitor(root)
        : null;
      const restPromise = transport.captureRestSnapshots();
      if (nativeMonitor === null) {
        await sleep(captureDurationMs);
      } else {
        await waitWithNativeResourceSampling({
          durationMs: captureDurationMs,
          sleep,
          monitor: nativeMonitor,
        });
      }
      const cutoffAt = now().toISOString();
      const restCaptures = await restPromise;
      const connectionEvidence =
        transport.consumeConnectionCycleEvidence(cutoffAt);
      const failures = transport.consumeTransportFailures();
      const websocketFrames = transport.drainFrames(cutoffAt);
      await applyConnectionEvidence(runtime, connectionEvidence);
      await applyRestCaptures(runtime, restCaptures);
      await applyTransportFrames(runtime, websocketFrames);
      applyTransportFailures(runtime, failures);
      transport.clearCaptureWindow();
      const completedAt = safeIso(
        now(),
        "M1.5D cycle completion clock is invalid",
      );
      const resources = input.resourceImplementation === undefined
        ? await finishNativeResourceMonitor(nativeMonitor!, root)
        : await input.resourceImplementation({
          cycleIndex,
          startedAt: startedAtIso,
          completedAt,
          evidenceRoot: root,
        });
      const cycle = runtime.finalizeCycle({
        completedAt,
        resources,
      });
      const cycleDirectory = path.join(
        root,
        `cycle-${String(cycleIndex).padStart(2, "0")}`,
      );
      await mkdir(cycleDirectory, { mode: 0o700 });
      await writeM1MicrostructureArtifactExclusive(
        path.join(cycleDirectory, "cycle.json"),
        cycle,
      );
      cycles.push(cycle);
    }
  } finally {
    await transport.stop();
  }
  const auditedAt = safeIso(now(), "M1.5D store audit clock is invalid");
  const storeAudit = await input.observationStore.auditRun(
    workerRunId,
    auditedAt,
  );
  const persistedRecordCount = cycles.reduce(
    (total, cycle) => total + cycle.persistedRecordCount,
    0,
  );
  if (storeAudit.rowCount !== persistedRecordCount) {
    throw new Error(
      "M1.5D database audit and cycle persistence denominator disagree",
    );
  }
  await writeM1MicrostructureArtifactExclusive(
    path.join(root, "store-audit.json"),
    storeAudit,
  );
  return deepFreezeArtifact({
    manifest,
    upstreamBinding: upstream,
    multiAssetShadowEvidence: multiAsset,
    selectionPlan: selection,
    providerPlan: provider,
    cycles,
    storeAudit,
    canonicalEvidenceRoot: root,
    authorityGranted: false,
    productionChanged: false,
    secretMaterialPresent: false,
  });
}

export async function finalizeM1MicrostructureForwardWorker(input: {
  readonly capture: M1MicrostructureForwardCaptureResult;
  readonly captureVerification: M1MicrostructureForwardCaptureVerification;
  readonly evaluatedAt: string;
  readonly hostRecovery: M1MicrostructureForwardHostRecovery;
}): Promise<M1MicrostructureForwardWorkerResult> {
  const manifest = M1MicrostructureForwardWorkerManifestSchema.parse(
    input.capture.manifest,
  );
  const verification =
    M1MicrostructureForwardCaptureVerificationSchema.parse(
      input.captureVerification,
    );
  const storeAudit = M1ShadowStoreAuditReceiptSchema.parse(
    input.capture.storeAudit,
  );
  const cycles = input.capture.cycles.map((cycle) =>
    M1MicrostructureForwardCycleSchema.parse(cycle)
  );
  if (
    verification.releaseId !== manifest.releaseId ||
    verification.workerRunId !== manifest.workerRunId ||
    verification.workerManifestId !== manifest.manifestId ||
    verification.workerManifestHash !== manifest.contentHash ||
    verification.storeAuditId !== storeAudit.receiptId ||
    verification.storeAuditHash !== storeAudit.contentHash ||
    verification.cycleContentChainHash !==
      stableContentHash(
        cycles.map((cycle) => ({
          cycleId: cycle.cycleId,
          contentHash: cycle.contentHash,
        })),
      )
  ) {
    throw new Error(
      "M1.5D finalization requires exact independent capture verification",
    );
  }
  const root = await realpath(input.capture.canonicalEvidenceRoot);
  if (root !== input.capture.canonicalEvidenceRoot) {
    throw new Error("M1.5D finalization root identity drifted");
  }
  await writeM1MicrostructureArtifactExclusive(
    path.join(root, "capture-verification.json"),
    verification,
  );
  const evidence = buildM1MicrostructureForwardEvidence({
    upstreamBinding: input.capture.upstreamBinding,
    multiAssetShadowEvidence: input.capture.multiAssetShadowEvidence,
    plan: input.capture.selectionPlan,
    cycles,
    evaluatedAt: input.evaluatedAt,
    hostRecovery: input.hostRecovery,
  });
  await writeM1MicrostructureArtifactExclusive(
    path.join(root, "evidence.json"),
    M1MicrostructureForwardEvidenceSchema.parse(evidence),
  );
  return deepFreezeArtifact({
    capture: input.capture,
    captureVerification: verification,
    evidence,
    canonicalEvidenceRoot: root,
    authorityGranted: false,
    productionChanged: false,
    secretMaterialPresent: false,
  });
}
