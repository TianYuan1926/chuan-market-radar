import {
  open,
  lstat,
  link,
  mkdir,
  realpath,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
} from "../../runtime-schema/primitives";
import {
  M1_MULTI_ASSET_SHADOW_PROFILE,
  M1MultiAssetShadowCycleSchema,
  M1MultiAssetShadowEvidenceSchema,
  M1MultiAssetShadowUpstreamBindingSchema,
  buildM1MultiAssetShadowCycle,
  buildM1MultiAssetShadowEvidence,
  type M1MultiAssetShadowCycle,
  type M1MultiAssetShadowEvidence,
  type M1MultiAssetShadowUpstreamBinding,
} from "./m1-multi-asset-shadow-contract";
import {
  M1ListingWatchEvidenceBindingSchema,
  M1MultiAssetBaseFactSnapshotSchema,
  buildM1BaseFactShadowAccounting,
  type M1ListingWatchEvidenceBinding,
} from "../market-fact/multi-asset-base-fact-contract";
import {
  runM1ScopeV2BaseMarketCaptureRuntime,
  type M1ScopeV2ProviderTransport,
  type M1ScopeV2BaseMarketCaptureResult,
} from "../market-fact/multi-asset-base-fact-runtime";
import type {
  M1OfficialUnderlyingMapping,
} from "../multi-asset-universe/multi-asset-identity-contract";
import {
  M1MultiAssetCatalogCaptureBindingSchema,
  M1MultiAssetIdentitySnapshotSchema,
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
  stableContentHash,
} from "../universe/stable-artifact";

export const M1_MULTI_ASSET_SHADOW_PERSISTENCE_RECEIPT_VERSION =
  "v2-m1-multi-asset-shadow-persistence-receipt.v3" as const;
export const M1_MULTI_ASSET_SHADOW_CHECKPOINT_RECEIPT_VERSION =
  "v2-m1-multi-asset-shadow-checkpoint-receipt.v1" as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);

const PersistenceReceiptCoreSchema = z.strictObject({
  schemaVersion: z.literal(
    M1_MULTI_ASSET_SHADOW_PERSISTENCE_RECEIPT_VERSION,
  ),
  releaseId: ReleaseIdSchema,
  workerRunId: NonEmptyStringSchema,
  cycleIndex: z.number().int().min(1).max(31),
  persistedAt: IsoDateTimeSchema,
  previousReceiptHash: DigestSchema.nullable(),
  catalogCaptureBindingId: NonEmptyStringSchema,
  catalogCaptureBindingHash: DigestSchema,
  identitySnapshotId: NonEmptyStringSchema,
  identitySnapshotHash: DigestSchema,
  baseFactSnapshotId: NonEmptyStringSchema,
  baseFactSnapshotHash: DigestSchema,
  listingWatchBindingIds: z.array(NonEmptyStringSchema).length(2),
  listingWatchBindingHashes: z.array(DigestSchema).length(2),
  listingWatchRefreshBatchHash: DigestSchema,
  persistedArtifactCount: z.literal(6),
  persistedBytes: NonNegativeIntegerSchema,
  status: z.literal("COMMITTED"),
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1MultiAssetShadowPersistenceReceiptSchema =
  PersistenceReceiptCoreSchema.extend({
    receiptId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((receipt, context) => {
    const expectedHash = stableContentHash(
      persistenceReceiptCore(receipt),
    );
    if (
      receipt.contentHash !== expectedHash ||
      receipt.receiptId !==
        `m1-5c-persistence:${receipt.workerRunId}:${receipt.cycleIndex}:${
          expectedHash.slice(7, 23)
        }`
    ) {
      context.addIssue({
        code: "custom",
        message: "M1.5C persistence receipt identity mismatch",
        path: ["contentHash"],
      });
    }
  });

export type M1MultiAssetShadowPersistenceReceipt = z.infer<
  typeof M1MultiAssetShadowPersistenceReceiptSchema
>;

function persistenceReceiptCore(
  value: z.input<typeof PersistenceReceiptCoreSchema> & {
    readonly receiptId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof PersistenceReceiptCoreSchema> {
  return PersistenceReceiptCoreSchema.parse({
    schemaVersion: value.schemaVersion,
    releaseId: value.releaseId,
    workerRunId: value.workerRunId,
    cycleIndex: value.cycleIndex,
    persistedAt: value.persistedAt,
    previousReceiptHash: value.previousReceiptHash,
    catalogCaptureBindingId: value.catalogCaptureBindingId,
    catalogCaptureBindingHash: value.catalogCaptureBindingHash,
    identitySnapshotId: value.identitySnapshotId,
    identitySnapshotHash: value.identitySnapshotHash,
    baseFactSnapshotId: value.baseFactSnapshotId,
    baseFactSnapshotHash: value.baseFactSnapshotHash,
    listingWatchBindingIds: value.listingWatchBindingIds,
    listingWatchBindingHashes: value.listingWatchBindingHashes,
    listingWatchRefreshBatchHash: value.listingWatchRefreshBatchHash,
    persistedArtifactCount: value.persistedArtifactCount,
    persistedBytes: value.persistedBytes,
    status: value.status,
    rawBodyRetained: value.rawBodyRetained,
    secretMaterialPresent: value.secretMaterialPresent,
    productionChanged: value.productionChanged,
  });
}

function buildPersistenceReceipt(input: {
  releaseId: string;
  workerRunId: string;
  cycleIndex: number;
  persistedAt: string;
  previousReceiptHash: string | null;
  capture: M1ScopeV2BaseMarketCaptureResult;
  listingWatchRefreshBatch: M1ListingWatchRefreshBatch;
  persistedBytes: number;
}): M1MultiAssetShadowPersistenceReceipt {
  const catalog = M1MultiAssetCatalogCaptureBindingSchema.parse(
    input.capture.identityCapture.captureBinding,
  );
  const identity = M1MultiAssetIdentitySnapshotSchema.parse(
    input.capture.identityCapture.identitySnapshot,
  );
  const facts = M1MultiAssetBaseFactSnapshotSchema.parse(
    input.capture.baseFactSnapshot,
  );
  const listingWatchRefreshBatch = M1ListingWatchRefreshBatchSchema.parse(
    input.listingWatchRefreshBatch,
  );
  const listingWatchBindings = listingWatchRefreshBatch.bindings
    .map((binding) => M1ListingWatchEvidenceBindingSchema.parse(binding))
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  if (
    listingWatchBindings.length !== 2 ||
    listingWatchBindings[0]!.sourceId !== "BITGET_FUTURES" ||
    listingWatchBindings[1]!.sourceId !== "BYBIT_DERIVATIVES"
  ) {
    throw new Error(
      "M1.5C persistence requires exact Bitget and Bybit listing bindings",
    );
  }
  const listingWatchBindingIds = listingWatchBindings
    .map((binding) => binding.bindingId)
    .sort();
  const listingWatchBindingHashes = listingWatchBindings
    .map((binding) => binding.contentHash)
    .sort();
  if (
    stableContentHash(listingWatchBindingIds) !==
      stableContentHash(facts.listingCheckpointBindingIds) ||
    stableContentHash(listingWatchBindingHashes) !==
      stableContentHash(facts.listingCheckpointBindingHashes)
  ) {
    throw new Error(
      "M1.5C listing binding artifacts and base Fact snapshot disagree",
    );
  }
  const core = persistenceReceiptCore({
    schemaVersion: M1_MULTI_ASSET_SHADOW_PERSISTENCE_RECEIPT_VERSION,
    releaseId: input.releaseId,
    workerRunId: input.workerRunId,
    cycleIndex: input.cycleIndex,
    persistedAt: input.persistedAt,
    previousReceiptHash: input.previousReceiptHash,
    catalogCaptureBindingId: catalog.captureBindingId,
    catalogCaptureBindingHash: catalog.contentHash,
    identitySnapshotId: identity.snapshotId,
    identitySnapshotHash: identity.contentHash,
    baseFactSnapshotId: facts.snapshotId,
    baseFactSnapshotHash: facts.contentHash,
    listingWatchBindingIds,
    listingWatchBindingHashes,
    listingWatchRefreshBatchHash: stableContentHash(
      listingWatchRefreshBatch,
    ),
    persistedArtifactCount: 6,
    persistedBytes: input.persistedBytes,
    status: "COMMITTED",
    rawBodyRetained: false,
    secretMaterialPresent: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(
    M1MultiAssetShadowPersistenceReceiptSchema.parse({
      ...core,
      receiptId:
        `m1-5c-persistence:${input.workerRunId}:${input.cycleIndex}:${
          contentHash.slice(7, 23)
        }`,
      contentHash,
    }),
  );
}

const CheckpointReceiptCoreSchema = z.strictObject({
  schemaVersion: z.literal(
    M1_MULTI_ASSET_SHADOW_CHECKPOINT_RECEIPT_VERSION,
  ),
  releaseId: ReleaseIdSchema,
  workerRunId: NonEmptyStringSchema,
  cycleIndex: z.number().int().min(1).max(31),
  committedAt: IsoDateTimeSchema,
  previousCheckpointHash: DigestSchema.nullable(),
  persistenceReceiptId: NonEmptyStringSchema,
  persistenceReceiptHash: DigestSchema,
  baseFactSnapshotId: NonEmptyStringSchema,
  baseFactSnapshotHash: DigestSchema,
  status: z.literal("COMMITTED"),
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1MultiAssetShadowCheckpointReceiptSchema =
  CheckpointReceiptCoreSchema.extend({
    checkpointId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((receipt, context) => {
    const expectedHash = stableContentHash(checkpointReceiptCore(receipt));
    if (
      receipt.contentHash !== expectedHash ||
      receipt.checkpointId !==
        `m1-5c-checkpoint:${receipt.workerRunId}:${receipt.cycleIndex}:${
          expectedHash.slice(7, 23)
        }`
    ) {
      context.addIssue({
        code: "custom",
        message: "M1.5C checkpoint receipt identity mismatch",
        path: ["contentHash"],
      });
    }
  });

export type M1MultiAssetShadowCheckpointReceipt = z.infer<
  typeof M1MultiAssetShadowCheckpointReceiptSchema
>;

function checkpointReceiptCore(
  value: z.input<typeof CheckpointReceiptCoreSchema> & {
    readonly checkpointId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof CheckpointReceiptCoreSchema> {
  return CheckpointReceiptCoreSchema.parse({
    schemaVersion: value.schemaVersion,
    releaseId: value.releaseId,
    workerRunId: value.workerRunId,
    cycleIndex: value.cycleIndex,
    committedAt: value.committedAt,
    previousCheckpointHash: value.previousCheckpointHash,
    persistenceReceiptId: value.persistenceReceiptId,
    persistenceReceiptHash: value.persistenceReceiptHash,
    baseFactSnapshotId: value.baseFactSnapshotId,
    baseFactSnapshotHash: value.baseFactSnapshotHash,
    status: value.status,
    rawBodyRetained: value.rawBodyRetained,
    secretMaterialPresent: value.secretMaterialPresent,
    productionChanged: value.productionChanged,
  });
}

function buildCheckpointReceipt(input: {
  releaseId: string;
  workerRunId: string;
  cycleIndex: number;
  committedAt: string;
  previousCheckpointHash: string | null;
  persistenceReceipt: M1MultiAssetShadowPersistenceReceipt;
}): M1MultiAssetShadowCheckpointReceipt {
  const persistence = M1MultiAssetShadowPersistenceReceiptSchema.parse(
    input.persistenceReceipt,
  );
  const core = checkpointReceiptCore({
    schemaVersion: M1_MULTI_ASSET_SHADOW_CHECKPOINT_RECEIPT_VERSION,
    releaseId: input.releaseId,
    workerRunId: input.workerRunId,
    cycleIndex: input.cycleIndex,
    committedAt: input.committedAt,
    previousCheckpointHash: input.previousCheckpointHash,
    persistenceReceiptId: persistence.receiptId,
    persistenceReceiptHash: persistence.contentHash,
    baseFactSnapshotId: persistence.baseFactSnapshotId,
    baseFactSnapshotHash: persistence.baseFactSnapshotHash,
    status: "COMMITTED",
    rawBodyRetained: false,
    secretMaterialPresent: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(
    M1MultiAssetShadowCheckpointReceiptSchema.parse({
      ...core,
      checkpointId:
        `m1-5c-checkpoint:${input.workerRunId}:${input.cycleIndex}:${
          contentHash.slice(7, 23)
        }`,
      contentHash,
    }),
  );
}

type M1MultiAssetShadowFileStore = Readonly<{
  canonicalRoot: string;
  persistArtifacts(input: {
    workerRunId: string;
    cycleIndex: number;
    persistedAt: string;
    previousReceiptHash: string | null;
    capture: M1ScopeV2BaseMarketCaptureResult;
    listingWatchRefreshBatch: M1ListingWatchRefreshBatch;
  }): Promise<M1MultiAssetShadowPersistenceReceipt>;
  commitCheckpoint(input: {
    workerRunId: string;
    cycleIndex: number;
    committedAt: string;
    previousCheckpointHash: string | null;
    persistenceReceipt: M1MultiAssetShadowPersistenceReceipt;
  }): Promise<M1MultiAssetShadowCheckpointReceipt>;
  persistCycle(cycle: M1MultiAssetShadowCycle): Promise<void>;
  persistEvidence(evidence: M1MultiAssetShadowEvidence): Promise<void>;
}>;

function jsonBytes(value: unknown): Uint8Array {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function atomicWriteExclusive(
  target: string,
  bytes: Uint8Array,
): Promise<void> {
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx", 0o600);
  let temporaryExists = true;
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, target);
    await unlink(temporary);
    temporaryExists = false;
    await syncDirectory(path.dirname(target));
  } catch (error) {
    if (temporaryExists) {
      await unlink(temporary).catch(() => undefined);
    }
    const code = error instanceof Error && "code" in error
      ? (error as NodeJS.ErrnoException).code
      : undefined;
    if (code === "EEXIST") {
      throw new Error(`M1.5C evidence target already exists: ${target}`, {
        cause: error,
      });
    }
    throw error;
  }
}

async function createM1MultiAssetShadowFileStore(
  evidenceRoot: string,
  releaseId: string,
): Promise<M1MultiAssetShadowFileStore> {
  if (!path.isAbsolute(evidenceRoot) || path.normalize(evidenceRoot) !== evidenceRoot) {
    throw new Error("M1.5C evidence root must be absolute and normalized");
  }
  const parent = await realpath(path.dirname(evidenceRoot));
  const canonicalRoot = path.join(parent, path.basename(evidenceRoot));
  try {
    await lstat(canonicalRoot);
    throw new Error("M1.5C evidence root must not already exist");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      (error as NodeJS.ErrnoException).code !== "ENOENT"
    ) {
      throw error;
    }
  }
  await mkdir(canonicalRoot, { mode: 0o700 });
  await syncDirectory(parent);

  const cycleDirectory = async (cycleIndex: number): Promise<string> => {
    const directory = path.join(
      canonicalRoot,
      `cycle-${String(cycleIndex).padStart(2, "0")}`,
    );
    await mkdir(directory, { mode: 0o700 });
    await syncDirectory(canonicalRoot);
    return directory;
  };

  return {
    canonicalRoot,
    async persistArtifacts(input) {
      const directory = await cycleDirectory(input.cycleIndex);
      const listingWatchRefreshBatch = M1ListingWatchRefreshBatchSchema.parse(
        input.listingWatchRefreshBatch,
      );
      const artifacts = [
        [
          "catalog-capture-binding.json",
          input.capture.identityCapture.captureBinding,
        ],
        [
          "identity-snapshot.json",
          input.capture.identityCapture.identitySnapshot,
        ],
        ["base-fact-snapshot.json", input.capture.baseFactSnapshot],
        ["listing-watch-refresh-batch.json", listingWatchRefreshBatch],
        [
          "listing-watch-binding-bitget.json",
          listingWatchRefreshBatch.bindings.find(
            (binding) => binding.sourceId === "BITGET_FUTURES",
          ),
        ],
        [
          "listing-watch-binding-bybit.json",
          listingWatchRefreshBatch.bindings.find(
            (binding) => binding.sourceId === "BYBIT_DERIVATIVES",
          ),
        ],
      ] as const;
      let persistedBytes = 0;
      for (const [name, artifact] of artifacts) {
        const bytes = jsonBytes(artifact);
        persistedBytes += bytes.byteLength;
        await atomicWriteExclusive(path.join(directory, name), bytes);
      }
      const receipt = buildPersistenceReceipt({
        releaseId,
        workerRunId: input.workerRunId,
        cycleIndex: input.cycleIndex,
        persistedAt: input.persistedAt,
        previousReceiptHash: input.previousReceiptHash,
        capture: input.capture,
        listingWatchRefreshBatch,
        persistedBytes,
      });
      await atomicWriteExclusive(
        path.join(directory, "persistence-receipt.json"),
        jsonBytes(receipt),
      );
      return receipt;
    },
    async commitCheckpoint(input) {
      const directory = path.join(
        canonicalRoot,
        `cycle-${String(input.cycleIndex).padStart(2, "0")}`,
      );
      const receipt = buildCheckpointReceipt({
        releaseId,
        workerRunId: input.workerRunId,
        cycleIndex: input.cycleIndex,
        committedAt: input.committedAt,
        previousCheckpointHash: input.previousCheckpointHash,
        persistenceReceipt: input.persistenceReceipt,
      });
      await atomicWriteExclusive(
        path.join(directory, "checkpoint-receipt.json"),
        jsonBytes(receipt),
      );
      return receipt;
    },
    async persistCycle(cycleInput) {
      const cycle = M1MultiAssetShadowCycleSchema.parse(cycleInput);
      const directory = path.join(
        canonicalRoot,
        `cycle-${String(cycle.cycleIndex).padStart(2, "0")}`,
      );
      await atomicWriteExclusive(
        path.join(directory, "cycle.json"),
        jsonBytes(cycle),
      );
    },
    async persistEvidence(evidenceInput) {
      const evidence = M1MultiAssetShadowEvidenceSchema.parse(evidenceInput);
      await atomicWriteExclusive(
        path.join(canonicalRoot, "evidence.json"),
        jsonBytes(evidence),
      );
    },
  };
}

export type M1MultiAssetShadowWorkerResult = Readonly<{
  evidence: M1MultiAssetShadowEvidence;
  cycles: readonly M1MultiAssetShadowCycle[];
  listingWatchRefreshBatchHashes: readonly string[];
  persistenceReceiptHashes: readonly string[];
  checkpointReceiptHashes: readonly string[];
  canonicalEvidenceRoot: string;
  authorityGranted: false;
  productionChanged: false;
  secretMaterialPresent: false;
}>;

type CycleCaptureImplementation = (input: {
  cycleIndex: number;
  previousIdentitySnapshot:
    M1ScopeV2BaseMarketCaptureResult["identityCapture"]["identitySnapshot"]
      | null;
  listingWatchBindings: readonly M1ListingWatchEvidenceBinding[];
}) => Promise<M1ScopeV2BaseMarketCaptureResult>;

function sleepFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runM1MultiAssetShadowWorker(input: {
  upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  networkEnvironment:
    M1MultiAssetShadowUpstreamBinding["networkEnvironment"];
  evidenceRoot: string;
  workerRunId: string;
  mappings?: readonly M1OfficialUnderlyingMapping[];
  initialListingCheckpoints: readonly M1ListingHistoryCheckpoint[];
  listingWatchRefreshBatch:
    | M1ListingWatchRefreshBatch
    | ((cycleIndex: number) => Promise<M1ListingWatchRefreshBatch>);
  transportImplementation?: M1ScopeV2ProviderTransport;
  captureImplementation?: CycleCaptureImplementation;
  now?: () => Date;
  sleepImplementation?: (milliseconds: number) => Promise<void>;
  rssImplementation?: () => number;
  maxAgeMs?: number;
  maxListingCheckpointAgeMs?: number;
}): Promise<M1MultiAssetShadowWorkerResult> {
  const upstream = M1MultiAssetShadowUpstreamBindingSchema.parse(
    input.upstreamBinding,
  );
  const hasRuntimeOverride =
    input.transportImplementation !== undefined ||
    input.captureImplementation !== undefined ||
    input.now !== undefined ||
    input.sleepImplementation !== undefined ||
    input.rssImplementation !== undefined;
  if (hasRuntimeOverride && upstream.evidenceClass !== "TEST_ONLY") {
    throw new Error(
      "M1.5C injected runtime implementations must remain TEST_ONLY",
    );
  }
  if (input.networkEnvironment !== upstream.networkEnvironment) {
    throw new Error("M1.5C runtime environment and upstream disagree");
  }
  const now = input.now ?? (() => new Date());
  const sleep = input.sleepImplementation ?? sleepFor;
  const rss = input.rssImplementation ?? (() => process.memoryUsage().rss);
  const runtimeConfigDigest = stableContentHash({
    profile: M1_MULTI_ASSET_SHADOW_PROFILE,
    releaseId: upstream.releaseId,
    upstreamBindingId: upstream.upstreamBindingId,
    maxAgeMs: input.maxAgeMs ?? 15_000,
    maxListingCheckpointAgeMs:
      input.maxListingCheckpointAgeMs ?? 15 * 60_000,
  });
  const startedAt = now();
  if (!Number.isFinite(startedAt.getTime())) {
    throw new Error("M1.5C worker start clock is invalid");
  }
  const store = await createM1MultiAssetShadowFileStore(
    input.evidenceRoot,
    upstream.releaseId,
  );
  const cycles: M1MultiAssetShadowCycle[] = [];
  const listingWatchRefreshBatchHashes: string[] = [];
  const persistenceReceiptHashes: string[] = [];
  const checkpointReceiptHashes: string[] = [];
  let previousPersistenceHash: string | null = null;
  let previousCheckpointHash: string | null = null;
  let previousIdentitySnapshot:
    M1ScopeV2BaseMarketCaptureResult["identityCapture"]["identitySnapshot"]
      | null = null;
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
      "M1.5C requires exact initial listing checkpoints for both sources",
    );
  }

  for (
    let cycleIndex = 1;
    cycleIndex <= M1_MULTI_ASSET_SHADOW_PROFILE.cycleCount;
    cycleIndex += 1
  ) {
    const scheduledMs = startedAt.getTime() +
      (cycleIndex - 1) * M1_MULTI_ASSET_SHADOW_PROFILE.cadenceMs;
    const beforeWait = now().getTime();
    if (beforeWait < scheduledMs) {
      await sleep(scheduledMs - beforeWait);
    }
    const cycleStartedAt = now();
    const scheduleLagMs = Math.max(
      0,
      cycleStartedAt.getTime() - scheduledMs,
    );
    const listingWatchRefreshBatch = M1ListingWatchRefreshBatchSchema.parse(
      typeof input.listingWatchRefreshBatch === "function"
        ? await input.listingWatchRefreshBatch(cycleIndex)
        : input.listingWatchRefreshBatch,
    );
    if (!listingWatchRefreshBatch.allCommitted) {
      throw new Error(
        "M1.5C cycle requires complete listing refresh evidence",
      );
    }
    for (const result of listingWatchRefreshBatch.results) {
      const expectedPrior = expectedListingCheckpoints.get(result.sourceId);
      if (
        expectedPrior === undefined ||
        result.priorCheckpointId !== expectedPrior.checkpointId ||
        result.priorCheckpointHash !== expectedPrior.contentHash ||
        result.checkpoint === null
      ) {
        throw new Error(
          "M1.5C listing refresh checkpoint continuity drifted",
        );
      }
      expectedListingCheckpoints.set(result.sourceId, result.checkpoint);
    }
    const exactListingWatchBindings = listingWatchRefreshBatch.bindings
      .map((binding) => M1ListingWatchEvidenceBindingSchema.parse(binding))
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
    if (
      exactListingWatchBindings.length !== 2 ||
      exactListingWatchBindings[0]!.sourceId !== "BITGET_FUTURES" ||
      exactListingWatchBindings[1]!.sourceId !== "BYBIT_DERIVATIVES"
    ) {
      throw new Error(
        "M1.5C cycle requires exact Bitget and Bybit listing bindings",
      );
    }
    const capture: M1ScopeV2BaseMarketCaptureResult =
      input.captureImplementation === undefined
      ? await runM1ScopeV2BaseMarketCaptureRuntime({
        upstreamBinding: upstream,
        networkEnvironment: input.networkEnvironment,
        mappings: input.mappings,
        previousIdentitySnapshot,
        listingWatchBindings: exactListingWatchBindings,
        transportImplementation: input.transportImplementation,
        now,
        maxAgeMs: input.maxAgeMs,
        maxListingCheckpointAgeMs: input.maxListingCheckpointAgeMs,
      })
      : await input.captureImplementation({
        cycleIndex,
        previousIdentitySnapshot,
        listingWatchBindings: exactListingWatchBindings,
      });
    const baseFacts = M1MultiAssetBaseFactSnapshotSchema.parse(
      capture.baseFactSnapshot,
    );
    if (
      baseFacts.releaseId !== upstream.releaseId ||
      baseFacts.upstreamBindingId !== upstream.upstreamBindingId ||
      baseFacts.upstreamBindingHash !== upstream.contentHash
    ) {
      throw new Error("M1.5C cycle capture exact upstream identity drifted");
    }
    const persistence = await store.persistArtifacts({
      workerRunId: input.workerRunId,
      cycleIndex,
      persistedAt: now().toISOString(),
      previousReceiptHash: previousPersistenceHash,
      capture,
      listingWatchRefreshBatch,
    });
    const checkpoint = await store.commitCheckpoint({
      workerRunId: input.workerRunId,
      cycleIndex,
      committedAt: now().toISOString(),
      previousCheckpointHash,
      persistenceReceipt: persistence,
    });
    const completedAt = now();
    const accounting = buildM1BaseFactShadowAccounting(baseFacts);
    const cycle = buildM1MultiAssetShadowCycle({
      releaseId: upstream.releaseId,
      upstreamBindingId: upstream.upstreamBindingId,
      upstreamBindingHash: upstream.contentHash,
      catalogCaptureBindingId: baseFacts.catalogCaptureBindingId,
      catalogCaptureBindingHash: baseFacts.catalogCaptureBindingHash,
      identitySnapshotId: baseFacts.identitySnapshotId,
      identitySnapshotHash: baseFacts.identitySnapshotHash,
      baseFactSnapshotId: baseFacts.snapshotId,
      baseFactSnapshotHash: baseFacts.contentHash,
      workerRunId: input.workerRunId,
      runtimeConfigDigest,
      cycleIndex,
      scheduledAt: new Date(scheduledMs).toISOString(),
      startedAt: cycleStartedAt.toISOString(),
      sourceCutoff: baseFacts.sourceCutoff,
      completedAt: completedAt.toISOString(),
      scheduleLagMs,
      durationMs: completedAt.getTime() - cycleStartedAt.getTime(),
      missedScheduleStarts:
        scheduleLagMs > M1_MULTI_ASSET_SHADOW_PROFILE.maxScheduleLagMs
          ? 1
          : 0,
      rssBytes: rss(),
      checkpointStatus: "COMMITTED",
      checkpointReceiptId: checkpoint.checkpointId,
      checkpointReceiptHash: checkpoint.contentHash,
      persistenceStatus: "COMMITTED",
      persistenceReceiptId: persistence.receiptId,
      persistenceReceiptHash: persistence.contentHash,
      venues: accounting.venues.map((row) => ({
        ...row,
        reasonCodes: [...row.reasonCodes],
      })),
      assetDomains: accounting.assetDomains.map((row) => ({
        ...row,
        reasonCodes: [...row.reasonCodes],
      })),
      lifecycleStates: accounting.lifecycleStates.map((row) => ({
        ...row,
        reasonCodes: [...row.reasonCodes],
      })),
      listingCheckpoint: {
        ...accounting.listingCheckpoint,
        reasonCodes: [...accounting.listingCheckpoint.reasonCodes],
      },
      rawBodyRetained: false,
      secretMaterialPresent: false,
      runtimeAuthorityGranted: false,
      factAuthorityGranted: false,
      candidateAuthorityGranted: false,
      strategyAuthorityGranted: false,
      readyAuthorityGranted: false,
      productionChanged: false,
    });
    await store.persistCycle(cycle);
    cycles.push(cycle);
    listingWatchRefreshBatchHashes.push(
      stableContentHash(listingWatchRefreshBatch),
    );
    persistenceReceiptHashes.push(persistence.contentHash);
    checkpointReceiptHashes.push(checkpoint.contentHash);
    previousPersistenceHash = persistence.contentHash;
    previousCheckpointHash = checkpoint.contentHash;
    previousIdentitySnapshot = capture.identityCapture.identitySnapshot;
  }

  const evaluatedAt = now().toISOString();
  const evidence = buildM1MultiAssetShadowEvidence({
    upstreamBinding: upstream,
    cycles,
    evaluatedAt,
  });
  await store.persistEvidence(evidence);
  return deepFreezeArtifact({
    evidence,
    cycles,
    listingWatchRefreshBatchHashes,
    persistenceReceiptHashes,
    checkpointReceiptHashes,
    canonicalEvidenceRoot: store.canonicalRoot,
    authorityGranted: false,
    productionChanged: false,
    secretMaterialPresent: false,
  });
}
