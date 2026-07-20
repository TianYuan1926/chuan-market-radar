import { deepFreezeArtifact, stableContentHash } from "../../universe/stable-artifact";
import type { M1SqlPool } from "../store/contracts";
import { M1PostgresArtifactStore } from "../store/postgres-artifact-store";
import { M1_STORE_POSTGRES_SCHEMA } from "../store/postgres-schema";
import {
  CollectorCheckpointError,
  type M1CollectorCheckpoint,
  restoreCollectorDurableState,
  validateM1CollectorCheckpoint,
} from "./checkpoint-contract";
import type {
  CollectorDurableState,
  CollectorRuntimeConfig,
} from "./contracts";

type CheckpointLedgerRow = Record<string, unknown> & {
  authority_mode: string;
  automatic_trading_allowed: boolean;
  checkpoint_digest: string;
  checkpoint_id: string;
  cycle_id: string;
  fact_quality_snapshot_id: string;
  generated_at: string | Date;
  idempotency_key: string;
  last_catalog_at: string | Date | null;
  next_cycle_ordinal: string | number;
  next_reconciliation_at: string | Date | null;
  payload: unknown;
  persisted_at: string | Date;
  release_id: string;
  retain_until: string | Date;
  runtime_config_digest: string;
  runtime_state: string;
  schema_version: string;
  sequence_digest: string;
  source_cutoff: string | Date;
  universe_snapshot_id: string;
  writer_identity: string;
};

export type M1StoredCollectorCheckpoint = Readonly<{
  checkpoint: M1CollectorCheckpoint;
  idempotencyKey: string;
  persistedAt: string;
  writerIdentity: string;
}>;

export type M1RestoredCollectorCheckpoint = Readonly<{
  durableState: CollectorDurableState;
  stored: M1StoredCollectorCheckpoint;
}>;

export type CollectorCheckpointRepository = Readonly<{
  appendCheckpoint(checkpoint: M1CollectorCheckpoint): Promise<Readonly<{
    status: "INSERTED" | "IDEMPOTENT_REPLAY";
    stored: M1StoredCollectorCheckpoint;
  }>>;
  loadLatest(
    runtimeConfig: CollectorRuntimeConfig,
  ): Promise<M1RestoredCollectorCheckpoint | null>;
}>;

function iso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new CollectorCheckpointError(
      "CHECKPOINT_DATABASE_OPERATION_FAILED",
      "checkpoint ledger returned an invalid timestamp",
    );
  }
  return date.toISOString();
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new CollectorCheckpointError(
      "CHECKPOINT_REJECTED",
      "checkpoint ledger returned invalid JSON",
    );
  }
}

function sameTime(left: string, right: string | Date): boolean {
  return Date.parse(left) === Date.parse(iso(right));
}

function sameNullableTime(
  left: string | null,
  right: string | Date | null,
): boolean {
  return left === null && right === null ||
    left !== null && right !== null && sameTime(left, right);
}

function asStoredCheckpoint(row: CheckpointLedgerRow): M1StoredCollectorCheckpoint {
  const checkpoint = validateM1CollectorCheckpoint(jsonValue(row.payload));
  const ordinal = Number(row.next_cycle_ordinal);
  if (
    row.checkpoint_id !== checkpoint.checkpointId ||
    row.checkpoint_digest !== checkpoint.checkpointDigest ||
    row.schema_version !== checkpoint.schemaVersion ||
    row.release_id !== checkpoint.releaseId ||
    row.runtime_config_digest !== checkpoint.runtimeConfigDigest ||
    row.cycle_id !== checkpoint.cycleId ||
    !Number.isSafeInteger(ordinal) ||
    ordinal !== checkpoint.nextCycleOrdinal ||
    row.runtime_state !== checkpoint.runtimeState ||
    row.universe_snapshot_id !== checkpoint.universeSnapshotId ||
    row.fact_quality_snapshot_id !== checkpoint.factQualitySnapshotId ||
    !sameTime(checkpoint.sourceCutoff, row.source_cutoff) ||
    !sameTime(checkpoint.generatedAt, row.generated_at) ||
    !sameNullableTime(checkpoint.lastCatalogAt, row.last_catalog_at) ||
    !sameNullableTime(
      checkpoint.nextReconciliationAt,
      row.next_reconciliation_at,
    ) ||
    row.sequence_digest !== checkpoint.sequenceDigest ||
    row.authority_mode !== checkpoint.authorityMode ||
    row.automatic_trading_allowed !== checkpoint.automaticTradingAllowed ||
    !sameTime(checkpoint.retainUntil, row.retain_until)
  ) {
    throw new CollectorCheckpointError(
      "CHECKPOINT_REFERENCE_MISMATCH",
      "checkpoint ledger columns do not match canonical payload",
    );
  }
  return deepFreezeArtifact({
    checkpoint,
    idempotencyKey: row.idempotency_key,
    persistedAt: iso(row.persisted_at),
    writerIdentity: row.writer_identity,
  });
}

function assertPool(pool: M1SqlPool, label: string): void {
  if (
    pool === null ||
    typeof pool !== "object" ||
    typeof pool.query !== "function" ||
    typeof pool.connect !== "function"
  ) {
    throw new CollectorCheckpointError(
      "CHECKPOINT_DATABASE_OPERATION_FAILED",
      `${label} requires an explicit PostgreSQL pool`,
    );
  }
}

export class M1PostgresCollectorCheckpointStore
implements CollectorCheckpointRepository {
  readonly #artifactReader: M1PostgresArtifactStore;
  readonly #readerPool: M1SqlPool;
  readonly #writerPool: M1SqlPool;

  constructor(input: {
    readerPool: M1SqlPool;
    writerPool: M1SqlPool;
  }) {
    assertPool(input.readerPool, "collector checkpoint reader");
    assertPool(input.writerPool, "collector checkpoint writer");
    this.#readerPool = input.readerPool;
    this.#writerPool = input.writerPool;
    this.#artifactReader = new M1PostgresArtifactStore(input.readerPool);
  }

  async appendCheckpoint(checkpointInput: M1CollectorCheckpoint): Promise<Readonly<{
    status: "INSERTED" | "IDEMPOTENT_REPLAY";
    stored: M1StoredCollectorCheckpoint;
  }>> {
    const checkpoint = validateM1CollectorCheckpoint(checkpointInput);
    const idempotencyKey =
      `m1-collector-checkpoint:v1:${checkpoint.checkpointId}`;
    try {
      const inserted = await this.#writerPool.query<CheckpointLedgerRow>(`
        INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger (
          checkpoint_id, idempotency_key, schema_version, release_id,
          runtime_config_digest, cycle_id, next_cycle_ordinal, runtime_state,
          universe_artifact_name, universe_snapshot_id,
          fact_quality_artifact_name, fact_quality_snapshot_id,
          source_cutoff, generated_at, last_catalog_at, next_reconciliation_at,
          sequence_digest, checkpoint_digest, authority_mode,
          automatic_trading_allowed, retain_until, payload
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7::bigint, $8,
          'EligibleInstrumentSnapshot', $9,
          'FactQualitySnapshot', $10,
          $11::timestamptz, $12::timestamptz, $13::timestamptz,
          $14::timestamptz, $15, $16, $17, $18, $19::timestamptz, $20::jsonb
        )
        ON CONFLICT DO NOTHING
        RETURNING *
      `, [
        checkpoint.checkpointId,
        idempotencyKey,
        checkpoint.schemaVersion,
        checkpoint.releaseId,
        checkpoint.runtimeConfigDigest,
        checkpoint.cycleId,
        checkpoint.nextCycleOrdinal,
        checkpoint.runtimeState,
        checkpoint.universeSnapshotId,
        checkpoint.factQualitySnapshotId,
        checkpoint.sourceCutoff,
        checkpoint.generatedAt,
        checkpoint.lastCatalogAt,
        checkpoint.nextReconciliationAt,
        checkpoint.sequenceDigest,
        checkpoint.checkpointDigest,
        checkpoint.authorityMode,
        checkpoint.automaticTradingAllowed,
        checkpoint.retainUntil,
        JSON.stringify(checkpoint),
      ]);
      if (inserted.rows[0] !== undefined) {
        return deepFreezeArtifact({
          status: "INSERTED" as const,
          stored: asStoredCheckpoint(inserted.rows[0]),
        });
      }

      const existing = await this.#writerPool.query<CheckpointLedgerRow>(`
        SELECT *
        FROM ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger
        WHERE idempotency_key = $1
      `, [idempotencyKey]);
      if (existing.rows[0] === undefined) {
        throw new CollectorCheckpointError(
          "CHECKPOINT_DATABASE_OPERATION_FAILED",
          "checkpoint insert failed without an observable conflict row",
        );
      }
      const stored = asStoredCheckpoint(existing.rows[0]);
      if (
        stored.checkpoint.checkpointDigest !== checkpoint.checkpointDigest ||
        stored.checkpoint.retainUntil !== checkpoint.retainUntil
      ) {
        throw new CollectorCheckpointError(
          "CHECKPOINT_REJECTED",
          "checkpoint idempotency key belongs to different immutable content",
        );
      }
      return deepFreezeArtifact({
        status: "IDEMPOTENT_REPLAY" as const,
        stored,
      });
    } catch (error) {
      if (error instanceof CollectorCheckpointError) {
        throw error;
      }
      throw new CollectorCheckpointError(
        "CHECKPOINT_DATABASE_OPERATION_FAILED",
        "PostgreSQL rejected the collector checkpoint append",
      );
    }
  }

  async loadLatest(
    runtimeConfig: CollectorRuntimeConfig,
  ): Promise<M1RestoredCollectorCheckpoint | null> {
    try {
      const result = await this.#readerPool.query<CheckpointLedgerRow>(`
        SELECT *
        FROM ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger
        WHERE release_id = $1
        ORDER BY next_cycle_ordinal DESC
        LIMIT 1
      `, [runtimeConfig.releaseId]);
      if (result.rows[0] === undefined) {
        return null;
      }
      const stored = asStoredCheckpoint(result.rows[0]);
      if (
        stored.checkpoint.runtimeConfigDigest !== stableContentHash(runtimeConfig)
      ) {
        throw new CollectorCheckpointError(
          "CHECKPOINT_CONFIGURATION_MISMATCH",
          "latest release checkpoint uses a different runtime configuration",
        );
      }
      const [universe, factQuality] = await Promise.all([
        this.#artifactReader.readArtifact(
          "EligibleInstrumentSnapshot",
          stored.checkpoint.universeSnapshotId,
        ),
        this.#artifactReader.readArtifact(
          "FactQualitySnapshot",
          stored.checkpoint.factQualitySnapshotId,
        ),
      ]);
      return deepFreezeArtifact({
        durableState: restoreCollectorDurableState({
          checkpoint: stored.checkpoint,
          factQuality: factQuality.payload,
          runtimeConfig,
          universe: universe.payload,
        }),
        stored,
      });
    } catch (error) {
      if (error instanceof CollectorCheckpointError) {
        throw error;
      }
      throw new CollectorCheckpointError(
        "CHECKPOINT_DATABASE_OPERATION_FAILED",
        "PostgreSQL failed to restore the collector checkpoint",
      );
    }
  }
}
