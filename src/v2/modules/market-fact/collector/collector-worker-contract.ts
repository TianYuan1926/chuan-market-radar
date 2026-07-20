import { z } from "zod";
import { DATA_QUALITY_STATES } from "../../../domain/states";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
} from "../../../runtime-schema/primitives";
import { deepFreezeArtifact } from "../../universe/stable-artifact";
import { CollectorCycleTelemetrySchema } from "./collector-telemetry-schema";

export const M1_COLLECTOR_WORKER_SCHEMA_VERSION =
  "v2-m1-collector-worker-cycle.v1" as const;

const Sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

const CheckpointStatusSchema = z.enum([
  "INSERTED",
  "IDEMPOTENT_REPLAY",
  "FAILED",
  "NOT_ATTEMPTED",
]);

const M1CollectorWorkerCycleBaseSchema = z.strictObject({
  authorityMode: z.literal("NO_AUTHORITY"),
  automaticTradingAllowed: z.literal(false),
  checkpoint: z.strictObject({
    checkpointId: NonEmptyStringSchema.nullable(),
    failureReason: NonEmptyStringSchema.nullable(),
    persistedAt: IsoDateTimeSchema.nullable(),
    status: CheckpointStatusSchema,
  }),
  completedAt: IsoDateTimeSchema,
  cycleIndex: z.number().int().positive(),
  dataQuality: z.enum(DATA_QUALITY_STATES),
  missedScheduleStarts: z.number().int().nonnegative(),
  operationalReadiness: z.enum(["READY", "NOT_READY"]),
  releaseId: NonEmptyStringSchema,
  resources: z.strictObject({
    heapUsedBytes: z.number().int().nonnegative(),
    rssBytes: z.number().int().nonnegative(),
  }),
  runtime: CollectorCycleTelemetrySchema,
  runtimeConfigDigest: Sha256Schema,
  scheduleLagMs: z.number().int().nonnegative(),
  scheduledAt: IsoDateTimeSchema,
  schemaVersion: z.literal(M1_COLLECTOR_WORKER_SCHEMA_VERSION),
  startedAt: IsoDateTimeSchema,
  workerRunId: NonEmptyStringSchema,
});

export type M1CollectorWorkerCycle = z.infer<
  typeof M1CollectorWorkerCycleBaseSchema
>;

export const M1CollectorWorkerCycleSchema =
  M1CollectorWorkerCycleBaseSchema.superRefine((cycle, context) => {
    const scheduledMs = Date.parse(cycle.scheduledAt);
    const startedMs = Date.parse(cycle.startedAt);
    const completedMs = Date.parse(cycle.completedAt);
    if (
      scheduledMs > startedMs ||
      startedMs > completedMs ||
      startedMs - scheduledMs !== cycle.scheduleLagMs ||
      startedMs > Date.parse(cycle.runtime.startedAt) ||
      Date.parse(cycle.runtime.startedAt) > completedMs ||
      completedMs < Date.parse(cycle.runtime.completedAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "worker schedule timestamps and lag are inconsistent",
        path: ["scheduleLagMs"],
      });
    }
    const checkpointPersisted =
      cycle.checkpoint.status === "INSERTED" ||
      cycle.checkpoint.status === "IDEMPOTENT_REPLAY";
    if (
      checkpointPersisted !==
        (cycle.checkpoint.persistedAt !== null &&
          cycle.checkpoint.checkpointId !== null) ||
      (checkpointPersisted && cycle.checkpoint.failureReason !== null) ||
      (cycle.checkpoint.status === "FAILED" &&
        cycle.checkpoint.failureReason === null) ||
      (cycle.checkpoint.status === "NOT_ATTEMPTED" &&
        cycle.checkpoint.persistedAt !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "worker checkpoint status is internally inconsistent",
        path: ["checkpoint"],
      });
    }
    const mayBeReady =
      cycle.runtime.state === "READY" &&
      cycle.runtime.persistence !== "FAILED" &&
      checkpointPersisted &&
      cycle.dataQuality === "FRESH";
    if ((cycle.operationalReadiness === "READY") !== mayBeReady) {
      context.addIssue({
        code: "custom",
        message: "worker readiness cannot exceed runtime, data or checkpoint truth",
        path: ["operationalReadiness"],
      });
    }
    if (cycle.releaseId !== cycle.runtime.releaseId) {
      context.addIssue({
        code: "custom",
        message: "worker and runtime release identities differ",
        path: ["releaseId"],
      });
    }
  });

export type CollectorWorkerStopReason =
  | "ARTIFACT_PERSISTENCE_FAILED"
  | "CHECKPOINT_PERSISTENCE_FAILED"
  | "MAX_CYCLES_REACHED"
  | "RUNTIME_ERROR"
  | "STOP_REQUESTED";

export type M1CollectorWorkerRunReport = Readonly<{
  authorityMode: "NO_AUTHORITY";
  automaticTradingAllowed: false;
  completedAt: string;
  cycles: readonly M1CollectorWorkerCycle[];
  exitCode: 0 | 1;
  releaseId: string;
  restore: Readonly<{
    checkpointId: string | null;
    status: "COLD_START" | "RESTORED";
  }>;
  startedAt: string;
  startupReadiness: "NOT_READY";
  status: "COMPLETED" | "FAILED" | "STOPPED";
  stopReason: CollectorWorkerStopReason;
  workerRunId: string;
}>;

export function parseM1CollectorWorkerCycle(
  input: unknown,
): M1CollectorWorkerCycle {
  const parsed = M1CollectorWorkerCycleSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("collector worker cycle telemetry failed strict validation");
  }
  return deepFreezeArtifact(parsed.data);
}
