import { z } from "zod";
import type {
  EligibleInstrumentSnapshot,
  FactQualitySnapshot,
} from "../../../domain/contracts";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
} from "../../../runtime-schema/primitives";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "../../universe/stable-artifact";
import { CollectorCycleTelemetrySchema } from "./collector-telemetry-schema";
import type {
  CollectorCycleResult,
  CollectorDurableState,
  CollectorRuntimeConfig,
} from "./contracts";

export const M1_COLLECTOR_CHECKPOINT_SCHEMA_VERSION =
  "v2-m1-collector-checkpoint.v1" as const;

const Sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const SequenceSchema = z.string().regex(/^\d+$/u);

export const CollectorRuntimeConfigSchema = z.strictObject({
  maxFactAgeMs: z.number().int().nonnegative(),
  maxSequenceGapMs: z.number().int().positive(),
  policyVersion: NonEmptyStringSchema,
  reconciliationIntervalMs: z.number().int().positive(),
  releaseId: NonEmptyStringSchema,
  retentionMs: z.number().int().positive(),
});

const M1CollectorCheckpointBaseSchema = z.strictObject({
  authorityMode: z.literal("NO_AUTHORITY"),
  automaticTradingAllowed: z.literal(false),
  checkpointDigest: Sha256Schema,
  checkpointId: NonEmptyStringSchema,
  cycleId: NonEmptyStringSchema,
  cycleTelemetry: CollectorCycleTelemetrySchema,
  factQualitySnapshotId: NonEmptyStringSchema,
  generatedAt: IsoDateTimeSchema,
  lastCatalogAt: IsoDateTimeSchema.nullable(),
  lastFailureReasons: z.array(NonEmptyStringSchema),
  nextCycleOrdinal: z.number().int().positive(),
  nextReconciliationAt: IsoDateTimeSchema.nullable(),
  releaseId: NonEmptyStringSchema,
  retainUntil: IsoDateTimeSchema,
  runtimeConfig: CollectorRuntimeConfigSchema,
  runtimeConfigDigest: Sha256Schema,
  runtimeState: z.enum(["READY", "DEGRADED", "BACKPRESSURED"]),
  schemaVersion: z.literal(M1_COLLECTOR_CHECKPOINT_SCHEMA_VERSION),
  sequenceDigest: Sha256Schema,
  sequenceState: z.record(NonEmptyStringSchema, SequenceSchema),
  sourceCutoff: IsoDateTimeSchema,
  universeSnapshotId: NonEmptyStringSchema,
});

export type M1CollectorCheckpoint = z.infer<
  typeof M1CollectorCheckpointBaseSchema
>;

export class CollectorCheckpointError extends Error {
  readonly code:
    | "CHECKPOINT_CONFIGURATION_MISMATCH"
    | "CHECKPOINT_DATABASE_OPERATION_FAILED"
    | "CHECKPOINT_REFERENCE_MISMATCH"
    | "CHECKPOINT_REJECTED";

  constructor(code: CollectorCheckpointError["code"], message: string) {
    super(message);
    this.name = "CollectorCheckpointError";
    this.code = code;
  }
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function canonicalSequenceState(
  sequences: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(sequences).sort(([left], [right]) =>
      left.localeCompare(right)),
  ));
}

function checkpointContent(checkpoint: M1CollectorCheckpoint) {
  return Object.fromEntries(Object.entries(checkpoint).filter(
    ([key]) => key !== "checkpointDigest" && key !== "checkpointId",
  ));
}

export const M1CollectorCheckpointSchema =
  M1CollectorCheckpointBaseSchema.superRefine((checkpoint, context) => {
    const configDigest = stableContentHash(checkpoint.runtimeConfig);
    const sequenceDigest = stableContentHash(
      canonicalSequenceState(checkpoint.sequenceState),
    );
    const content = checkpointContent(checkpoint);
    const checkpointDigest = stableContentHash(content);
    const checkpointId =
      `collector-checkpoint:${stableSha256(content).slice(0, 24)}`;
    const sortedReasons = sortedUnique(checkpoint.lastFailureReasons);

    if (checkpoint.runtimeConfigDigest !== configDigest) {
      context.addIssue({
        code: "custom",
        message: "runtime config digest does not match checkpoint config",
        path: ["runtimeConfigDigest"],
      });
    }
    if (checkpoint.sequenceDigest !== sequenceDigest) {
      context.addIssue({
        code: "custom",
        message: "sequence digest does not match checkpoint state",
        path: ["sequenceDigest"],
      });
    }
    if (checkpoint.checkpointDigest !== checkpointDigest) {
      context.addIssue({
        code: "custom",
        message: "checkpoint digest does not match canonical content",
        path: ["checkpointDigest"],
      });
    }
    if (checkpoint.checkpointId !== checkpointId) {
      context.addIssue({
        code: "custom",
        message: "checkpoint id does not match canonical content",
        path: ["checkpointId"],
      });
    }
    if (
      JSON.stringify(sortedReasons) !==
        JSON.stringify(checkpoint.lastFailureReasons)
    ) {
      context.addIssue({
        code: "custom",
        message: "checkpoint failure reasons must be unique and sorted",
        path: ["lastFailureReasons"],
      });
    }
    if (
      checkpoint.releaseId !== checkpoint.runtimeConfig.releaseId ||
      checkpoint.releaseId !== checkpoint.cycleTelemetry.releaseId
    ) {
      context.addIssue({
        code: "custom",
        message: "checkpoint release identity is inconsistent",
        path: ["releaseId"],
      });
    }
    if (
      checkpoint.cycleId !== checkpoint.cycleTelemetry.cycleId ||
      checkpoint.runtimeState !== checkpoint.cycleTelemetry.state ||
      checkpoint.universeSnapshotId !==
        checkpoint.cycleTelemetry.universeSnapshotId ||
      checkpoint.factQualitySnapshotId !==
        checkpoint.cycleTelemetry.factQualitySnapshotId
    ) {
      context.addIssue({
        code: "custom",
        message: "checkpoint runtime references do not match cycle telemetry",
        path: ["cycleTelemetry"],
      });
    }
    if (
      JSON.stringify(checkpoint.lastFailureReasons) !==
        JSON.stringify(checkpoint.cycleTelemetry.reasons) ||
      (checkpoint.runtimeState === "READY" &&
        checkpoint.lastFailureReasons.length !== 0) ||
      (checkpoint.runtimeState !== "READY" &&
        checkpoint.lastFailureReasons.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "checkpoint state and failure reasons are inconsistent",
        path: ["lastFailureReasons"],
      });
    }
    if (
      Date.parse(checkpoint.cycleTelemetry.completedAt) !==
        Date.parse(checkpoint.generatedAt) ||
      Date.parse(checkpoint.generatedAt) >= Date.parse(checkpoint.retainUntil)
    ) {
      context.addIssue({
        code: "custom",
        message: "checkpoint generation or retention boundary is invalid",
        path: ["generatedAt"],
      });
    }
    if (
      (checkpoint.lastCatalogAt === null) !==
        (checkpoint.nextReconciliationAt === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "catalog and reconciliation times must both be null or present",
        path: ["nextReconciliationAt"],
      });
    } else if (
      checkpoint.lastCatalogAt !== null &&
      checkpoint.nextReconciliationAt !== null &&
      Date.parse(checkpoint.nextReconciliationAt) !==
        Date.parse(checkpoint.lastCatalogAt) +
          checkpoint.runtimeConfig.reconciliationIntervalMs
    ) {
      context.addIssue({
        code: "custom",
        message: "next reconciliation does not match the fixed interval",
        path: ["nextReconciliationAt"],
      });
    }
  });

export function buildM1CollectorCheckpoint(input: {
  result: CollectorCycleResult;
  runtimeConfig: CollectorRuntimeConfig;
}): M1CollectorCheckpoint {
  if (
    input.result.artifacts === null ||
    input.result.durableState === null ||
    input.result.telemetry.persistence === "FAILED" ||
    input.result.telemetry.universeSnapshotId === null ||
    input.result.telemetry.factQualitySnapshotId === null
  ) {
    throw new CollectorCheckpointError(
      "CHECKPOINT_REJECTED",
      "a checkpoint requires one completely persisted collector cycle",
    );
  }
  const { artifacts, durableState, telemetry } = input.result;
  if (
    artifacts.universe.snapshotId !== telemetry.universeSnapshotId ||
    durableState.universe.snapshotId !== artifacts.universe.snapshotId ||
    artifacts.factQuality.snapshotId !== telemetry.factQualitySnapshotId ||
    Date.parse(artifacts.factQuality.sourceCutoff) >
      Date.parse(telemetry.completedAt)
  ) {
    throw new CollectorCheckpointError(
      "CHECKPOINT_REFERENCE_MISMATCH",
      "collector result artifacts do not match their cycle telemetry",
    );
  }
  const sequenceState = canonicalSequenceState(durableState.previousSequences);
  const runtimeConfig = deepFreezeArtifact({ ...input.runtimeConfig });
  const base = {
    authorityMode: "NO_AUTHORITY" as const,
    automaticTradingAllowed: false as const,
    cycleId: telemetry.cycleId,
    cycleTelemetry: telemetry,
    factQualitySnapshotId: artifacts.factQuality.snapshotId,
    generatedAt: telemetry.completedAt,
    lastCatalogAt: durableState.lastCatalogAt,
    lastFailureReasons: sortedUnique(durableState.lastFailureReasons),
    nextCycleOrdinal: durableState.nextCycleOrdinal,
    nextReconciliationAt: telemetry.nextReconciliationAt,
    releaseId: input.runtimeConfig.releaseId,
    retainUntil: new Date(
      Date.parse(telemetry.completedAt) + input.runtimeConfig.retentionMs,
    ).toISOString(),
    runtimeConfig,
    runtimeConfigDigest: stableContentHash(runtimeConfig),
    runtimeState: durableState.state,
    schemaVersion: M1_COLLECTOR_CHECKPOINT_SCHEMA_VERSION,
    sequenceDigest: stableContentHash(sequenceState),
    sequenceState,
    sourceCutoff: artifacts.factQuality.sourceCutoff,
    universeSnapshotId: artifacts.universe.snapshotId,
  };
  const digest = stableSha256(base);
  return validateM1CollectorCheckpoint({
    ...base,
    checkpointDigest: `sha256:${digest}`,
    checkpointId: `collector-checkpoint:${digest.slice(0, 24)}`,
  });
}

export function validateM1CollectorCheckpoint(
  input: unknown,
): M1CollectorCheckpoint {
  const parsed = M1CollectorCheckpointSchema.safeParse(input);
  if (!parsed.success) {
    throw new CollectorCheckpointError(
      "CHECKPOINT_REJECTED",
      "collector checkpoint failed canonical validation",
    );
  }
  return deepFreezeArtifact(parsed.data);
}

export function restoreCollectorDurableState(input: {
  checkpoint: M1CollectorCheckpoint;
  factQuality: FactQualitySnapshot;
  runtimeConfig: CollectorRuntimeConfig;
  universe: EligibleInstrumentSnapshot;
}): CollectorDurableState {
  const checkpoint = validateM1CollectorCheckpoint(input.checkpoint);
  if (
    checkpoint.runtimeConfigDigest !== stableContentHash(input.runtimeConfig) ||
    checkpoint.releaseId !== input.runtimeConfig.releaseId
  ) {
    throw new CollectorCheckpointError(
      "CHECKPOINT_CONFIGURATION_MISMATCH",
      "checkpoint belongs to a different runtime configuration",
    );
  }
  const eligibleIds = new Set(input.universe.accounting
    .filter((record) => record.eligible)
    .map((record) => record.canonicalInstrumentId)
    .filter((value): value is string => value !== null));
  if (
    input.universe.snapshotId !== checkpoint.universeSnapshotId ||
    input.factQuality.snapshotId !== checkpoint.factQualitySnapshotId ||
    input.universe.releaseId !== checkpoint.releaseId ||
    input.factQuality.releaseId !== checkpoint.releaseId ||
    input.universe.policyVersion !== checkpoint.runtimeConfig.policyVersion ||
    input.factQuality.universeSnapshotId !== input.universe.snapshotId ||
    input.factQuality.sourceCutoff !== checkpoint.sourceCutoff ||
    (checkpoint.lastCatalogAt !== null &&
      Date.parse(checkpoint.lastCatalogAt) !==
        Date.parse(input.universe.sourceCutoff)) ||
    Object.keys(checkpoint.sequenceState).some((id) => !eligibleIds.has(id))
  ) {
    throw new CollectorCheckpointError(
      "CHECKPOINT_REFERENCE_MISMATCH",
      "checkpoint does not reference one exact durable collector slice",
    );
  }
  return deepFreezeArtifact({
    lastCatalogAt: checkpoint.lastCatalogAt,
    lastFailureReasons: checkpoint.lastFailureReasons,
    nextCycleOrdinal: checkpoint.nextCycleOrdinal,
    previousSequences: checkpoint.sequenceState,
    state: checkpoint.runtimeState,
    universe: input.universe,
  });
}
