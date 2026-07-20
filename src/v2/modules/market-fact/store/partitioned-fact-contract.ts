import { z } from "zod";
import { IsoDateTimeSchema, NonEmptyStringSchema } from "../../../runtime-schema/primitives";
import { deepFreezeArtifact } from "../../universe/stable-artifact";

export const M1_PARTITIONED_FACT_SCHEMA_VERSION =
  "v2-m1-partitioned-fact-store.v1" as const;
export const M1_FACT_PARTITION_POLICY_VERSION =
  "v2-m1-fact-daily-partition.v1" as const;
export const M1_FACT_RETENTION_IDENTITY =
  "market_radar_v2_m1_retention" as const;

const Sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const PartitionNameSchema = z.string().regex(
  /^point_in_time_market_fact_ledger_p[0-9]{8}$/u,
);

export const M1FactPartitionInventoryRowSchema = z.strictObject({
  partitionName: PartitionNameSchema,
  lowerBound: IsoDateTimeSchema,
  upperBound: IsoDateTimeSchema,
  totalBytes: z.number().int().nonnegative(),
  estimatedRows: z.number().int().nonnegative(),
  createdAt: IsoDateTimeSchema,
  releaseId: NonEmptyStringSchema,
});

export type M1FactPartitionInventoryRow = z.infer<
  typeof M1FactPartitionInventoryRowSchema
>;

export const M1FactStorageCapacityPolicySchema = z.strictObject({
  maxPartitionBytes: z.number().int().positive(),
  maxTotalBytes: z.number().int().positive(),
  requiredCoverageStart: IsoDateTimeSchema,
  requiredCoverageEnd: IsoDateTimeSchema,
});

export type M1FactStorageCapacityPolicy = z.infer<
  typeof M1FactStorageCapacityPolicySchema
>;

export type M1FactStorageCapacityReport = Readonly<{
  schemaVersion: "v2-m1-fact-storage-capacity-report.v1";
  status: "PASS" | "BLOCKED" | "INSUFFICIENT_EVIDENCE";
  partitionCount: number;
  estimatedRows: number;
  totalBytes: number;
  maxObservedPartitionBytes: number;
  coverageStart: string | null;
  coverageEnd: string | null;
  reasonCodes: readonly string[];
}>;

export const M1FactBackupEvidenceSchema = z.strictObject({
  evidenceId: NonEmptyStringSchema,
  releaseId: NonEmptyStringSchema,
  backupCreatedAt: IsoDateTimeSchema,
  restoreVerifiedAt: IsoDateTimeSchema,
  coveredThrough: IsoDateTimeSchema,
  artifactCount: z.number().int().nonnegative(),
  sourceDigest: Sha256Schema,
  targetIdentity: NonEmptyStringSchema,
  auditorIdentity: NonEmptyStringSchema,
});

export type M1FactBackupEvidence = z.infer<
  typeof M1FactBackupEvidenceSchema
>;

export const M1FactRetentionRunSchema = z.strictObject({
  runId: NonEmptyStringSchema,
  releaseId: NonEmptyStringSchema,
  cutoffDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  backupEvidenceId: NonEmptyStringSchema,
  completedAt: IsoDateTimeSchema,
  droppedPartitionCount: z.number().int().nonnegative(),
  droppedFactCount: z.number().int().nonnegative(),
  droppedTotalBytes: z.number().int().nonnegative(),
  retentionIdentity: z.literal(M1_FACT_RETENTION_IDENTITY),
  sessionIdentity: NonEmptyStringSchema,
});

export type M1FactRetentionRun = z.infer<typeof M1FactRetentionRunSchema>;

function canonicalInventory(
  rows: readonly M1FactPartitionInventoryRow[],
): readonly M1FactPartitionInventoryRow[] {
  const parsed = z.array(M1FactPartitionInventoryRowSchema).parse(rows)
    .sort((left, right) => left.lowerBound.localeCompare(right.lowerBound));
  return parsed;
}

export function evaluateM1FactStorageCapacity(input: {
  partitions: readonly M1FactPartitionInventoryRow[];
  policy: M1FactStorageCapacityPolicy;
}): M1FactStorageCapacityReport {
  const policy = M1FactStorageCapacityPolicySchema.parse(input.policy);
  const partitions = canonicalInventory(input.partitions);
  if (partitions.length === 0) {
    return deepFreezeArtifact({
      schemaVersion: "v2-m1-fact-storage-capacity-report.v1",
      status: "INSUFFICIENT_EVIDENCE",
      partitionCount: 0,
      estimatedRows: 0,
      totalBytes: 0,
      maxObservedPartitionBytes: 0,
      coverageStart: null,
      coverageEnd: null,
      reasonCodes: ["market_fact_partition_inventory_empty"],
    });
  }

  const reasonCodes = new Set<string>();
  const names = new Set<string>();
  for (const [index, partition] of partitions.entries()) {
    if (names.has(partition.partitionName)) {
      reasonCodes.add("market_fact_partition_name_duplicate");
    }
    names.add(partition.partitionName);
    if (Date.parse(partition.lowerBound) >= Date.parse(partition.upperBound)) {
      reasonCodes.add("market_fact_partition_bounds_invalid");
    }
    if (
      index > 0 &&
      partitions[index - 1]!.upperBound !== partition.lowerBound
    ) {
      reasonCodes.add("market_fact_partition_coverage_not_contiguous");
    }
    if (partition.totalBytes > policy.maxPartitionBytes) {
      reasonCodes.add("market_fact_partition_capacity_watermark_exceeded");
    }
  }

  const totalBytes = partitions.reduce(
    (total, partition) => total + partition.totalBytes,
    0,
  );
  const estimatedRows = partitions.reduce(
    (total, partition) => total + partition.estimatedRows,
    0,
  );
  const coverageStart = partitions[0]!.lowerBound;
  const coverageEnd = partitions.at(-1)!.upperBound;
  if (
    Date.parse(coverageStart) > Date.parse(policy.requiredCoverageStart) ||
    Date.parse(coverageEnd) < Date.parse(policy.requiredCoverageEnd)
  ) {
    reasonCodes.add("market_fact_required_partition_window_missing");
  }
  if (totalBytes > policy.maxTotalBytes) {
    reasonCodes.add("market_fact_total_capacity_watermark_exceeded");
  }

  return deepFreezeArtifact({
    schemaVersion: "v2-m1-fact-storage-capacity-report.v1",
    status: reasonCodes.size === 0 ? "PASS" : "BLOCKED",
    partitionCount: partitions.length,
    estimatedRows,
    totalBytes,
    maxObservedPartitionBytes: Math.max(
      ...partitions.map((partition) => partition.totalBytes),
    ),
    coverageStart,
    coverageEnd,
    reasonCodes: [...reasonCodes].sort(),
  });
}
