import { IsoDateTimeSchema } from "../../../runtime-schema/primitives";
import { deepFreezeArtifact } from "../../universe/stable-artifact";
import type { M1SqlPool } from "./contracts";
import {
  evaluateM1FactStorageCapacity,
  type M1FactBackupEvidence,
  M1FactBackupEvidenceSchema,
  type M1FactPartitionInventoryRow,
  M1FactPartitionInventoryRowSchema,
  type M1FactRetentionRun,
  M1FactRetentionRunSchema,
  type M1FactStorageCapacityPolicy,
  type M1FactStorageCapacityReport,
} from "./partitioned-fact-contract";
import {
  M1_FACT_BACKUP_EVIDENCE_TABLE,
} from "./partitioned-fact-postgres-schema";
import { M1_STORE_POSTGRES_SCHEMA } from "./postgres-schema";

type PartitionRow = Record<string, unknown> & {
  partition_name: string;
  lower_bound: string | Date;
  upper_bound: string | Date;
  total_bytes: string | number;
  estimated_rows: string | number;
  created_at: string | Date;
  release_id: string;
};

type BackupRow = Record<string, unknown> & {
  evidence_id: string;
  release_id: string;
  backup_created_at: string | Date;
  restore_verified_at: string | Date;
  covered_through: string | Date;
  artifact_count: string | number;
  source_digest: string;
  target_identity: string;
  auditor_identity: string;
};

type RetentionRow = Record<string, unknown> & {
  run_id: string;
  release_id: string;
  cutoff_at: string | Date;
  backup_evidence_id: string;
  completed_at: string | Date;
  dropped_partition_count: string | number;
  dropped_fact_count: string | number;
  dropped_total_bytes: string | number;
  retention_identity: string;
  session_identity: string;
};

const BackupInputSchema = M1FactBackupEvidenceSchema.omit({
  auditorIdentity: true,
});

function iso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("partition governance returned an invalid timestamp");
  }
  return date.toISOString();
}

function integer(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("partition governance returned an invalid integer");
  }
  return parsed;
}

function backupRecord(row: BackupRow): M1FactBackupEvidence {
  return deepFreezeArtifact(M1FactBackupEvidenceSchema.parse({
    evidenceId: row.evidence_id,
    releaseId: row.release_id,
    backupCreatedAt: iso(row.backup_created_at),
    restoreVerifiedAt: iso(row.restore_verified_at),
    coveredThrough: iso(row.covered_through),
    artifactCount: integer(row.artifact_count),
    sourceDigest: row.source_digest,
    targetIdentity: row.target_identity,
    auditorIdentity: row.auditor_identity,
  }));
}

function retentionRecord(row: RetentionRow): M1FactRetentionRun {
  return deepFreezeArtifact(M1FactRetentionRunSchema.parse({
    runId: row.run_id,
    releaseId: row.release_id,
    cutoffAt: iso(row.cutoff_at),
    backupEvidenceId: row.backup_evidence_id,
    completedAt: iso(row.completed_at),
    droppedPartitionCount: integer(row.dropped_partition_count),
    droppedFactCount: integer(row.dropped_fact_count),
    droppedTotalBytes: integer(row.dropped_total_bytes),
    retentionIdentity: row.retention_identity,
    sessionIdentity: row.session_identity,
  }));
}

export class M1PostgresFactPartitionReader {
  readonly #pool: M1SqlPool;

  constructor(pool: M1SqlPool) {
    this.#pool = pool;
  }

  async inspectCapacity(
    policy: M1FactStorageCapacityPolicy,
  ): Promise<M1FactStorageCapacityReport> {
    const result = await this.#pool.query<PartitionRow>(`
      SELECT *
      FROM ${M1_STORE_POSTGRES_SCHEMA}.inspect_market_fact_partitions()
    `);
    const partitions: M1FactPartitionInventoryRow[] = result.rows.map((row) =>
      M1FactPartitionInventoryRowSchema.parse({
        partitionName: row.partition_name,
        lowerBound: iso(row.lower_bound),
        upperBound: iso(row.upper_bound),
        totalBytes: integer(row.total_bytes),
        estimatedRows: integer(row.estimated_rows),
        createdAt: iso(row.created_at),
        releaseId: row.release_id,
      })
    );
    return evaluateM1FactStorageCapacity({ partitions, policy });
  }
}

export class M1PostgresFactPartitionAudit {
  readonly #pool: M1SqlPool;

  constructor(pool: M1SqlPool) {
    this.#pool = pool;
  }

  async recordBackupEvidence(
    input: Omit<M1FactBackupEvidence, "auditorIdentity">,
  ): Promise<Readonly<{
    status: "INSERTED" | "IDEMPOTENT_REPLAY";
    record: M1FactBackupEvidence;
  }>> {
    const evidence = BackupInputSchema.parse(input);
    const inserted = await this.#pool.query<BackupRow>(`
      INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_BACKUP_EVIDENCE_TABLE} (
        evidence_id,
        release_id,
        backup_created_at,
        restore_verified_at,
        covered_through,
        artifact_count,
        source_digest,
        target_identity
      ) VALUES (
        $1,
        $2,
        $3::timestamptz,
        $4::timestamptz,
        $5::timestamptz,
        $6,
        $7,
        $8
      )
      ON CONFLICT DO NOTHING
      RETURNING *
    `, [
      evidence.evidenceId,
      evidence.releaseId,
      evidence.backupCreatedAt,
      evidence.restoreVerifiedAt,
      evidence.coveredThrough,
      evidence.artifactCount,
      evidence.sourceDigest,
      evidence.targetIdentity,
    ]);
    if (inserted.rows[0] !== undefined) {
      return deepFreezeArtifact({
        status: "INSERTED",
        record: backupRecord(inserted.rows[0]),
      });
    }
    const existing = await this.#pool.query<BackupRow>(`
      SELECT *
      FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_FACT_BACKUP_EVIDENCE_TABLE}
      WHERE evidence_id = $1
    `, [evidence.evidenceId]);
    if (existing.rows[0] === undefined) {
      throw new Error("backup evidence insert failed without an observable row");
    }
    const record = backupRecord(existing.rows[0]);
    const expected = { ...evidence, auditorIdentity: record.auditorIdentity };
    if (JSON.stringify(record) !== JSON.stringify(expected)) {
      throw new Error("backup evidence id belongs to different immutable proof");
    }
    return deepFreezeArtifact({ status: "IDEMPOTENT_REPLAY", record });
  }
}

export class M1PostgresFactPartitionRetention {
  readonly #pool: M1SqlPool;

  constructor(pool: M1SqlPool) {
    this.#pool = pool;
  }

  async ensurePartitions(input: {
    startAt: string;
    endAt: string;
    releaseId: string;
  }): Promise<readonly Readonly<{
    partitionName: string;
    lowerBound: string;
    upperBound: string;
    created: boolean;
  }>[]> {
    const startAt = IsoDateTimeSchema.parse(input.startAt);
    const endAt = IsoDateTimeSchema.parse(input.endAt);
    if (input.releaseId.trim() === "") {
      throw new Error("partition release id is required");
    }
    const result = await this.#pool.query<Record<string, unknown> & {
      partition_name: string;
      lower_bound: string | Date;
      upper_bound: string | Date;
      created: boolean;
    }>(`
      SELECT *
      FROM ${M1_STORE_POSTGRES_SCHEMA}.ensure_market_fact_partitions(
        $1::timestamptz,
        $2::timestamptz,
        $3
      )
    `, [startAt, endAt, input.releaseId]);
    return deepFreezeArtifact(result.rows.map((row) => ({
      partitionName: row.partition_name,
      lowerBound: iso(row.lower_bound),
      upperBound: iso(row.upper_bound),
      created: row.created,
    })));
  }

  async dropExpired(input: {
    runId: string;
    cutoffAt: string;
    releaseId: string;
    backupEvidenceId: string;
  }): Promise<M1FactRetentionRun> {
    const cutoffAt = IsoDateTimeSchema.parse(input.cutoffAt);
    for (const value of [
      input.runId,
      input.releaseId,
      input.backupEvidenceId,
    ]) {
      if (value.trim() === "") {
        throw new Error("retention identifiers are required");
      }
    }
    const result = await this.#pool.query<RetentionRow>(`
      SELECT *
      FROM ${M1_STORE_POSTGRES_SCHEMA}.drop_expired_market_fact_partitions(
        $1,
        $2::timestamptz,
        $3,
        $4
      )
    `, [
      input.runId,
      cutoffAt,
      input.releaseId,
      input.backupEvidenceId,
    ]);
    if (result.rows.length !== 1) {
      throw new Error("retention function did not return one immutable run");
    }
    return retentionRecord(result.rows[0]!);
  }
}
