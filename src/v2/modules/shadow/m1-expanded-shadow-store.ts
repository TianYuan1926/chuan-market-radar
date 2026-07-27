import { gzipSync } from "node:zlib";
import { z } from "zod";
import {
  type M1SqlPool,
} from "../market-fact/store/contracts";
import {
  M1ShadowProviderObservationSchema,
  type M1ShadowProviderObservation,
} from "./adapters/m1-expanded-shadow-provider-adapters";
import {
  deepFreezeArtifact,
  omitArtifactFields,
  stableContentHash,
} from "../universe/stable-artifact";

export const M1_EXPANDED_SHADOW_DATABASE_NAME =
  "market_radar_m1_expanded_shadow" as const;
export const M1_EXPANDED_SHADOW_DATABASE_SCHEMA =
  "market_radar_m1_expanded_shadow" as const;
export const M1_EXPANDED_SHADOW_OBSERVATION_TABLE =
  "provider_observation" as const;
export const M1_EXPANDED_SHADOW_STORE_AUDIT_VERSION =
  "v2-m1-expanded-shadow-store-audit.v1" as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

const StoreAuditCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_EXPANDED_SHADOW_STORE_AUDIT_VERSION),
  databaseName: z.literal(M1_EXPANDED_SHADOW_DATABASE_NAME),
  workerRunId: z.string().regex(/^[a-z0-9][a-z0-9._:-]{7,160}$/u),
  auditedAt: z.string().datetime({ offset: true }),
  rowCount: z.number().int().nonnegative(),
  observedCycleCount: z.number().int().min(0).max(31),
  firstCycleIndex: z.number().int().min(1).max(31).nullable(),
  lastCycleIndex: z.number().int().min(1).max(31).nullable(),
  compressedPayloadBytes: z.number().int().nonnegative(),
  observationContentChainHash: DigestSchema,
  status: z.literal("PASS_EXACT_ORDERED_DATABASE_AUDIT_NO_AUTHORITY"),
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  automaticTradingAllowed: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1ShadowStoreAuditReceiptSchema =
  StoreAuditCoreSchema.extend({
    receiptId: z.string().min(1),
    contentHash: DigestSchema,
  }).superRefine((receipt, context) => {
    const core = StoreAuditCoreSchema.parse(
      omitArtifactFields(receipt, ["receiptId", "contentHash"]),
    );
    const expectedHash = stableContentHash(core);
    if (
      receipt.contentHash !== expectedHash ||
      receipt.receiptId !==
        `m1-shadow-store-audit:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "shadow store audit receipt identity mismatch",
        path: ["contentHash"],
      });
    }
    const empty = receipt.rowCount === 0;
    if (
      empty !== (receipt.observedCycleCount === 0) ||
      empty !== (receipt.firstCycleIndex === null) ||
      empty !== (receipt.lastCycleIndex === null) ||
      (
        !empty &&
        (
          receipt.firstCycleIndex! > receipt.lastCycleIndex! ||
          receipt.observedCycleCount >
            receipt.lastCycleIndex! - receipt.firstCycleIndex! + 1
        )
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "shadow store audit row and cycle denominators disagree",
      });
    }
  });

export type M1ShadowStoreAuditReceipt = z.infer<
  typeof M1ShadowStoreAuditReceiptSchema
>;

export type M1ShadowStoreAuditRecord = Readonly<{
  cycleIndex: number;
  observationId: string;
  contentHash: string;
  compressedBytes: number;
}>;

export function buildM1ShadowStoreAuditReceipt(input: {
  workerRunId: string;
  auditedAt: string;
  records: readonly M1ShadowStoreAuditRecord[];
}): M1ShadowStoreAuditReceipt {
  const records = input.records.map((record) => ({
    cycleIndex: z.number().int().min(1).max(31).parse(record.cycleIndex),
    observationId: z.string().min(1).parse(record.observationId),
    contentHash: DigestSchema.parse(record.contentHash),
    compressedBytes: z.number().int().nonnegative().parse(
      record.compressedBytes,
    ),
  })).sort(
    (left, right) =>
      left.cycleIndex - right.cycleIndex ||
      left.observationId.localeCompare(right.observationId),
  );
  if (
    new Set(
      records.map((record) =>
        `${record.cycleIndex}|${record.observationId}`
      ),
    ).size !== records.length
  ) {
    throw new Error("shadow store audit contains duplicate observations");
  }
  const cycleIndexes = [...new Set(
    records.map((record) => record.cycleIndex),
  )];
  const core = StoreAuditCoreSchema.parse({
    schemaVersion: M1_EXPANDED_SHADOW_STORE_AUDIT_VERSION,
    databaseName: M1_EXPANDED_SHADOW_DATABASE_NAME,
    workerRunId: input.workerRunId,
    auditedAt: input.auditedAt,
    rowCount: records.length,
    observedCycleCount: cycleIndexes.length,
    firstCycleIndex: cycleIndexes[0] ?? null,
    lastCycleIndex: cycleIndexes.at(-1) ?? null,
    compressedPayloadBytes: records.reduce(
      (total, record) => total + record.compressedBytes,
      0,
    ),
    observationContentChainHash: stableContentHash(records),
    status: "PASS_EXACT_ORDERED_DATABASE_AUDIT_NO_AUTHORITY",
    rawBodyRetained: false,
    secretMaterialPresent: false,
    factAuthorityGranted: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    automaticTradingAllowed: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1ShadowStoreAuditReceiptSchema.parse({
    ...core,
    receiptId: `m1-shadow-store-audit:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}

export const M1_EXPANDED_SHADOW_POSTGRES_SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS ${M1_EXPANDED_SHADOW_DATABASE_SCHEMA};

CREATE TABLE IF NOT EXISTS ${M1_EXPANDED_SHADOW_DATABASE_SCHEMA}.${M1_EXPANDED_SHADOW_OBSERVATION_TABLE} (
  worker_run_id text NOT NULL,
  cycle_index integer NOT NULL CHECK (cycle_index BETWEEN 1 AND 31),
  observation_id text NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  venue text NOT NULL,
  subject_id text NOT NULL,
  fact_type text NOT NULL,
  source_event_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  payload_gzip bytea NOT NULL,
  payload_gzip_bytes bigint NOT NULL CHECK (payload_gzip_bytes >= 0),
  persisted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  fact_authority_granted boolean NOT NULL CHECK (fact_authority_granted = false),
  candidate_authority_granted boolean NOT NULL CHECK (candidate_authority_granted = false),
  strategy_authority_granted boolean NOT NULL CHECK (strategy_authority_granted = false),
  ready_authority_granted boolean NOT NULL CHECK (ready_authority_granted = false),
  automatic_trading_allowed boolean NOT NULL CHECK (automatic_trading_allowed = false),
  PRIMARY KEY (worker_run_id, cycle_index, observation_id)
);

CREATE INDEX IF NOT EXISTS provider_observation_subject_time_idx
  ON ${M1_EXPANDED_SHADOW_DATABASE_SCHEMA}.${M1_EXPANDED_SHADOW_OBSERVATION_TABLE}
  (worker_run_id, subject_id, received_at);
`.trim();

export type M1ShadowPersistedObservation = Readonly<{
  observationId: string;
  compressedBytes: number;
  persistedBytes: number;
}>;

export type M1ShadowPersistenceReceipt = Readonly<{
  records: readonly M1ShadowPersistedObservation[];
  insertedRows: number;
  postgresWriteBytes: number;
  postgresWalBytes: number;
}>;

export type M1ShadowObservationStore = {
  initialize(): Promise<void>;
  persistBatch(input: {
    readonly workerRunId: string;
    readonly cycleIndex: number;
    readonly observations: readonly M1ShadowProviderObservation[];
  }): Promise<M1ShadowPersistenceReceipt>;
  countRunRows(workerRunId: string): Promise<number>;
  auditRun(
    workerRunId: string,
    auditedAt: string,
  ): Promise<M1ShadowStoreAuditReceipt>;
};

type DatabaseIdentityRow = Record<string, unknown> & {
  database_name: string;
  server_version_num: string;
  in_recovery: boolean;
};

type WalPositionRow = Record<string, unknown> & {
  wal_lsn: string;
};

type WalBytesRow = Record<string, unknown> & {
  wal_bytes: string;
};

type CountRow = Record<string, unknown> & {
  row_count: string;
};

type AuditRow = Record<string, unknown> & {
  cycle_index: string;
  observation_id: string;
  content_hash: string;
  payload_gzip_bytes: string;
};

function canonicalObservationBytes(
  observation: M1ShadowProviderObservation,
): Buffer {
  return Buffer.from(JSON.stringify(observation), "utf8");
}

function requiredSingleRow<Row extends Record<string, unknown>>(
  rows: readonly Row[],
  reason: string,
): Row {
  if (rows.length !== 1) throw new Error(reason);
  return rows[0]!;
}

export class M1PostgresShadowObservationStore
implements M1ShadowObservationStore {
  readonly #pool: M1SqlPool;
  #initialized = false;

  constructor(pool: M1SqlPool) {
    this.#pool = pool;
  }

  async #assertIsolatedDatabase(): Promise<void> {
    const result = await this.#pool.query<DatabaseIdentityRow>(`
      SELECT
        current_database() AS database_name,
        current_setting('server_version_num') AS server_version_num,
        pg_is_in_recovery() AS in_recovery
    `);
    const identity = requiredSingleRow(
      result.rows,
      "shadow_database_identity_unavailable",
    );
    if (
      identity.database_name !== M1_EXPANDED_SHADOW_DATABASE_NAME ||
      !/^(?:1[6-9]|[2-9]\d)\d{4}$/u.test(identity.server_version_num) ||
      identity.in_recovery
    ) {
      throw new Error("shadow_database_isolation_identity_rejected");
    }
  }

  async initialize(): Promise<void> {
    await this.#assertIsolatedDatabase();
    await this.#pool.query(M1_EXPANDED_SHADOW_POSTGRES_SCHEMA_SQL);
    this.#initialized = true;
  }

  async persistBatch(input: {
    readonly workerRunId: string;
    readonly cycleIndex: number;
    readonly observations: readonly M1ShadowProviderObservation[];
  }): Promise<M1ShadowPersistenceReceipt> {
    if (!this.#initialized) {
      throw new Error("shadow_store_not_initialized");
    }
    if (
      !/^[a-z0-9][a-z0-9._:-]{7,160}$/u.test(input.workerRunId) ||
      !Number.isInteger(input.cycleIndex) ||
      input.cycleIndex < 1 ||
      input.cycleIndex > 31
    ) {
      throw new Error("shadow_store_run_or_cycle_identity_invalid");
    }
    const observations = input.observations.map((observation) =>
      M1ShadowProviderObservationSchema.parse(observation)
    );
    if (
      new Set(observations.map((observation) => observation.observationId))
        .size !== observations.length
    ) {
      throw new Error("shadow_store_duplicate_batch_observation");
    }
    if (observations.length === 0) {
      return {
        records: [],
        insertedRows: 0,
        postgresWriteBytes: 0,
        postgresWalBytes: 0,
      };
    }
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const before = requiredSingleRow(
        (
          await client.query<WalPositionRow>(
            "SELECT pg_current_wal_insert_lsn()::text AS wal_lsn",
          )
        ).rows,
        "shadow_wal_before_unavailable",
      );
      const records: M1ShadowPersistedObservation[] = [];
      for (const observation of observations) {
        const compressed = gzipSync(canonicalObservationBytes(observation), {
          level: 9,
        });
        const inserted = await client.query<Record<string, unknown>>(`
          INSERT INTO ${M1_EXPANDED_SHADOW_DATABASE_SCHEMA}.${M1_EXPANDED_SHADOW_OBSERVATION_TABLE} (
            worker_run_id,
            cycle_index,
            observation_id,
            content_hash,
            venue,
            subject_id,
            fact_type,
            source_event_at,
            received_at,
            payload_gzip,
            payload_gzip_bytes,
            fact_authority_granted,
            candidate_authority_granted,
            strategy_authority_granted,
            ready_authority_granted,
            automatic_trading_allowed
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz,
            $10::bytea, $11, false, false, false, false, false
          )
          ON CONFLICT (worker_run_id, cycle_index, observation_id) DO NOTHING
          RETURNING observation_id
        `, [
          input.workerRunId,
          input.cycleIndex,
          observation.observationId,
          observation.contentHash,
          observation.venue,
          observation.subjectId,
          observation.factType,
          observation.sourceEventAt,
          observation.receivedAt,
          compressed,
          compressed.byteLength,
        ]);
        if (inserted.rowCount !== 1) {
          throw new Error("shadow_store_replayed_observation_rejected");
        }
        records.push({
          observationId: observation.observationId,
          compressedBytes: compressed.byteLength,
          persistedBytes: compressed.byteLength,
        });
      }
      const after = requiredSingleRow(
        (
          await client.query<WalPositionRow>(
            "SELECT pg_current_wal_insert_lsn()::text AS wal_lsn",
          )
        ).rows,
        "shadow_wal_after_unavailable",
      );
      const wal = requiredSingleRow(
        (
          await client.query<WalBytesRow>(
            "SELECT pg_wal_lsn_diff($1::pg_lsn, $2::pg_lsn)::bigint::text AS wal_bytes",
            [after.wal_lsn, before.wal_lsn],
          )
        ).rows,
        "shadow_wal_diff_unavailable",
      );
      const postgresWalBytes = Number(wal.wal_bytes);
      if (
        !Number.isSafeInteger(postgresWalBytes) ||
        postgresWalBytes < 0
      ) {
        throw new Error("shadow_wal_diff_invalid");
      }
      await client.query("COMMIT");
      const postgresWriteBytes = records.reduce(
        (total, record) => total + record.persistedBytes,
        0,
      );
      return {
        records,
        insertedRows: records.length,
        postgresWriteBytes,
        postgresWalBytes,
      };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // The original persistence error remains authoritative.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async countRunRows(workerRunId: string): Promise<number> {
    if (!this.#initialized) {
      throw new Error("shadow_store_not_initialized");
    }
    const row = requiredSingleRow(
      (
        await this.#pool.query<CountRow>(`
          SELECT count(*)::bigint::text AS row_count
          FROM ${M1_EXPANDED_SHADOW_DATABASE_SCHEMA}.${M1_EXPANDED_SHADOW_OBSERVATION_TABLE}
          WHERE worker_run_id = $1
        `, [workerRunId])
      ).rows,
      "shadow_store_count_unavailable",
    );
    const count = Number(row.row_count);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error("shadow_store_count_invalid");
    }
    return count;
  }

  async auditRun(
    workerRunId: string,
    auditedAt: string,
  ): Promise<M1ShadowStoreAuditReceipt> {
    if (!this.#initialized) {
      throw new Error("shadow_store_not_initialized");
    }
    const result = await this.#pool.query<AuditRow>(`
      SELECT
        cycle_index::text,
        observation_id,
        content_hash,
        payload_gzip_bytes::text
      FROM ${M1_EXPANDED_SHADOW_DATABASE_SCHEMA}.${M1_EXPANDED_SHADOW_OBSERVATION_TABLE}
      WHERE worker_run_id = $1
      ORDER BY cycle_index, observation_id
    `, [workerRunId]);
    const records = result.rows.map((row) => {
      const cycleIndex = Number(row.cycle_index);
      const compressedBytes = Number(row.payload_gzip_bytes);
      if (
        !Number.isSafeInteger(cycleIndex) ||
        !Number.isSafeInteger(compressedBytes)
      ) {
        throw new Error("shadow_store_audit_numeric_identity_invalid");
      }
      return {
        cycleIndex,
        observationId: row.observation_id,
        contentHash: row.content_hash,
        compressedBytes,
      };
    });
    return buildM1ShadowStoreAuditReceipt({
      workerRunId,
      auditedAt,
      records,
    });
  }
}
