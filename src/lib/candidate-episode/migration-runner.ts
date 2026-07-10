import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  PostgresTransactionConnection,
  PostgresTransactionPool,
} from "./transaction-adapter";

export type CandidateMigration = {
  checksum: string;
  sql: string;
  version: string;
};

export type CandidateMigrationLedgerRow = {
  checksum: string;
  status: "applied" | "failed";
  version: string;
};

export type CandidateMigrationErrorReason =
  | "checksum_mismatch"
  | "duplicate_version"
  | "invalid_filename"
  | "previous_failure";

export class CandidateMigrationError extends Error {
  constructor(
    readonly reason: CandidateMigrationErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "CandidateMigrationError";
  }
}

const ledgerBootstrapSql = `CREATE SCHEMA IF NOT EXISTS candidate_authority;
CREATE TABLE IF NOT EXISTS candidate_authority.schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL UNIQUE,
  from_schema_fingerprint text NOT NULL,
  to_schema_fingerprint text NOT NULL,
  release_id text NOT NULL,
  approval_ref text NOT NULL,
  applied_at timestamptz NOT NULL,
  applied_by_role text NOT NULL,
  duration_ms bigint NOT NULL CHECK (duration_ms >= 0),
  status text NOT NULL CHECK (status IN ('applied','failed'))
);`;

const catalogFingerprintSql = `/* candidate_catalog_fingerprint_v1 */
SELECT COALESCE(
  jsonb_agg(
    jsonb_build_object(
      'schema', table_schema,
      'table', table_name,
      'ordinal', ordinal_position,
      'column', column_name,
      'type', data_type,
      'nullable', is_nullable,
      'default', column_default
    ) ORDER BY table_schema, table_name, ordinal_position
  ),
  '[]'::jsonb
) AS catalog
FROM information_schema.columns
WHERE table_schema = 'candidate_authority'`;

function checksum(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function fingerprint(catalog: unknown) {
  return createHash("sha256").update(JSON.stringify(catalog ?? [])).digest("hex");
}

async function configureMigrationTransaction(client: PostgresTransactionConnection) {
  await client.query("SELECT set_config('lock_timeout', $1, true)", ["2s"]);
  await client.query("SELECT set_config('statement_timeout', $1, true)", ["30s"]);
  await client.query("SELECT set_config('idle_in_transaction_session_timeout', $1, true)", ["30s"]);
}

async function readFingerprint(client: PostgresTransactionConnection) {
  const result = await client.query<{ catalog: unknown }>(catalogFingerprintSql);
  return fingerprint(result.rows[0]?.catalog);
}

async function readAppliedRole(client: PostgresTransactionConnection) {
  const result = await client.query<{ applied_by_role: string }>(
    "SELECT current_user AS applied_by_role",
  );
  return result.rows[0]?.applied_by_role ?? "unknown_rehearsal_role";
}

async function writeLedger(
  client: PostgresTransactionConnection,
  values: {
    approvalRef: string;
    appliedByRole: string;
    checksum: string;
    durationMs: number;
    fromFingerprint: string;
    releaseId: string;
    status: "applied" | "failed";
    toFingerprint: string;
    version: string;
  },
) {
  await client.query(
    `INSERT INTO candidate_authority.schema_migrations (
      version, checksum, from_schema_fingerprint, to_schema_fingerprint,
      release_id, approval_ref, applied_at, applied_by_role, duration_ms, status
    ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8, $9)`,
    [
      values.version,
      values.checksum,
      values.fromFingerprint,
      values.toFingerprint,
      values.releaseId,
      values.approvalRef,
      values.appliedByRole,
      values.durationMs,
      values.status,
    ],
  );
}

async function recordFailedMigration(
  client: PostgresTransactionConnection,
  migration: CandidateMigration,
  metadata: { approvalRef: string; releaseId: string },
  startedAt: number,
) {
  try {
    await client.query("BEGIN");
    await configureMigrationTransaction(client);
    const currentFingerprint = await readFingerprint(client);
    const appliedByRole = await readAppliedRole(client);
    await writeLedger(client, {
      ...metadata,
      appliedByRole,
      checksum: migration.checksum,
      durationMs: Math.max(0, Date.now() - startedAt),
      fromFingerprint: currentFingerprint,
      status: "failed",
      toFingerprint: currentFingerprint,
      version: migration.version,
    });
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
  }
}

export async function loadCandidateMigrationFiles(
  directory: string,
): Promise<CandidateMigration[]> {
  const filenames = (await readdir(directory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  const versions = new Set<string>();
  const migrations: CandidateMigration[] = [];

  for (const filename of filenames) {
    const match = /^(\d{3}_[a-z0-9_]+)\.sql$/.exec(filename);

    if (!match) {
      throw new CandidateMigrationError("invalid_filename", `Invalid migration filename: ${filename}`);
    }

    const version = match[1];

    if (versions.has(version)) {
      throw new CandidateMigrationError("duplicate_version", `Duplicate migration version: ${version}`);
    }

    versions.add(version);
    const sql = await readFile(join(directory, filename), "utf8");
    migrations.push({ checksum: checksum(sql), sql, version });
  }

  return migrations;
}

export async function runCandidateMigrations({
  approvalRef,
  designDigest,
  migrations,
  pool,
  releaseId,
}: {
  approvalRef: string;
  designDigest: string;
  migrations: CandidateMigration[];
  pool: PostgresTransactionPool;
  releaseId: string;
}) {
  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];
  let releaseError: Error | undefined;

  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [
      `wp-g0.2-candidate-migrations:${designDigest}`,
    ]);
    await client.query("BEGIN");
    await configureMigrationTransaction(client);
    await client.query(ledgerBootstrapSql);
    await client.query("COMMIT");

    for (const migration of migrations) {
      const existing = await client.query<CandidateMigrationLedgerRow>(
        `SELECT version, checksum, status
         FROM candidate_authority.schema_migrations
         WHERE version = $1`,
        [migration.version],
      );
      const row = existing.rows[0];

      if (row) {
        if (row.checksum !== migration.checksum) {
          throw new CandidateMigrationError(
            "checksum_mismatch",
            `Migration checksum mismatch: ${migration.version}`,
          );
        }
        if (row.status !== "applied") {
          throw new CandidateMigrationError(
            "previous_failure",
            `Migration version is poisoned by a previous failure: ${migration.version}`,
          );
        }
        skipped.push(migration.version);
        continue;
      }

      const startedAt = Date.now();
      let fromFingerprint = "";

      try {
        await client.query("BEGIN");
        await configureMigrationTransaction(client);
        fromFingerprint = await readFingerprint(client);
        await client.query(migration.sql);
        const toFingerprint = await readFingerprint(client);
        const appliedByRole = await readAppliedRole(client);
        await writeLedger(client, {
          approvalRef,
          appliedByRole,
          checksum: migration.checksum,
          durationMs: Math.max(0, Date.now() - startedAt),
          fromFingerprint,
          releaseId,
          status: "applied",
          toFingerprint,
          version: migration.version,
        });
        await client.query("COMMIT");
        applied.push(migration.version);
      } catch (error) {
        await client.query("ROLLBACK").catch((rollbackError: unknown) => {
          releaseError = rollbackError instanceof Error ? rollbackError : new Error("rollback failed");
        });
        await client.query("RESET ROLE").catch(() => undefined);
        await recordFailedMigration(client, migration, { approvalRef, releaseId }, startedAt);
        throw error;
      }
    }

    return { applied, skipped };
  } finally {
    await client.query("RESET ROLE").catch(() => undefined);
    await client
      .query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [
        `wp-g0.2-candidate-migrations:${designDigest}`,
      ])
      .catch((error: unknown) => {
        releaseError = error instanceof Error ? error : new Error("migration unlock failed");
      });
    client.release(releaseError);
  }
}
