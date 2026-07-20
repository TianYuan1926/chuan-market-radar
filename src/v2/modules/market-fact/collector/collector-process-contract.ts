import { z } from "zod";
import { NonEmptyStringSchema } from "../../../runtime-schema/primitives";
import { deepFreezeArtifact } from "../../universe/stable-artifact";
import type { M1CollectorWorkerRunReport } from "./collector-worker-contract";

export const M1_COLLECTOR_PROCESS_CONTRACT_VERSION =
  "v2-m1-collector-process.v1" as const;

export const M1CollectorProcessSummarySchema = z.strictObject({
  authorityMode: z.literal("NO_AUTHORITY"),
  automaticTradingAllowed: z.literal(false),
  contractVersion: z.literal(M1_COLLECTOR_PROCESS_CONTRACT_VERSION),
  cycleCount: z.number().int().positive(),
  exitCode: z.literal(0),
  releaseId: NonEmptyStringSchema,
  restore: z.strictObject({
    checkpointId: NonEmptyStringSchema.nullable(),
    status: z.enum(["COLD_START", "RESTORED"]),
  }),
  runProfile: z.enum(["EARLY_30_MINUTES", "SUSTAINED_24_HOURS"]),
  status: z.literal("COMPLETED"),
  stopReason: z.literal("MAX_CYCLES_REACHED"),
}).superRefine((summary, context) => {
  const expectedCycles = summary.runProfile === "EARLY_30_MINUTES"
    ? 31
    : 1_441;
  if (summary.cycleCount !== expectedCycles) {
    context.addIssue({
      code: "custom",
      message: "collector process cycle count does not match its run profile",
      path: ["cycleCount"],
    });
  }
  if (
    (summary.restore.status === "COLD_START") !==
      (summary.restore.checkpointId === null)
  ) {
    context.addIssue({
      code: "custom",
      message: "collector process restore status is internally inconsistent",
      path: ["restore"],
    });
  }
});

export type M1CollectorProcessSummary = z.infer<
  typeof M1CollectorProcessSummarySchema
>;

export function buildM1CollectorProcessSummary(input: {
  report: M1CollectorWorkerRunReport;
  runProfile: M1CollectorProcessSummary["runProfile"];
}): M1CollectorProcessSummary {
  return deepFreezeArtifact(M1CollectorProcessSummarySchema.parse({
    authorityMode: input.report.authorityMode,
    automaticTradingAllowed: input.report.automaticTradingAllowed,
    contractVersion: M1_COLLECTOR_PROCESS_CONTRACT_VERSION,
    cycleCount: input.report.cycles.length,
    exitCode: input.report.exitCode,
    releaseId: input.report.releaseId,
    restore: input.report.restore,
    runProfile: input.runProfile,
    status: input.report.status,
    stopReason: input.report.stopReason,
  }));
}

export function parseM1CollectorProcessSummary(
  input: unknown,
): M1CollectorProcessSummary {
  const parsed = M1CollectorProcessSummarySchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("collector process summary failed strict validation");
  }
  return deepFreezeArtifact(parsed.data);
}
