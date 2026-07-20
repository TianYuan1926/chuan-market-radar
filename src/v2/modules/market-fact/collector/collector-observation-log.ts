import { z } from "zod";
import { deepFreezeArtifact } from "../../universe/stable-artifact";
import {
  type M1CollectorWorkerCycle,
  M1CollectorWorkerCycleSchema,
} from "./collector-worker-contract";

export const M1_COLLECTOR_OBSERVATION_LOG_SCHEMA_VERSION =
  "v2-m1-collector-observation-log.v1" as const;

export const M1CollectorObservationLogSchema = z.strictObject({
  cycle: M1CollectorWorkerCycleSchema,
  event: z.literal("M1_COLLECTOR_CYCLE"),
  schemaVersion: z.literal(M1_COLLECTOR_OBSERVATION_LOG_SCHEMA_VERSION),
});

export type M1CollectorObservationLog = z.infer<
  typeof M1CollectorObservationLogSchema
>;

export function buildM1CollectorObservationLog(
  cycle: M1CollectorWorkerCycle,
): M1CollectorObservationLog {
  return deepFreezeArtifact(M1CollectorObservationLogSchema.parse({
    cycle,
    event: "M1_COLLECTOR_CYCLE",
    schemaVersion: M1_COLLECTOR_OBSERVATION_LOG_SCHEMA_VERSION,
  }));
}

export function parseM1CollectorObservationLog(
  input: unknown,
): M1CollectorObservationLog {
  const parsed = M1CollectorObservationLogSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("collector observation log failed strict validation");
  }
  return deepFreezeArtifact(parsed.data);
}

export function serializeM1CollectorObservationLog(
  cycle: M1CollectorWorkerCycle,
): string {
  return JSON.stringify(buildM1CollectorObservationLog(cycle));
}
