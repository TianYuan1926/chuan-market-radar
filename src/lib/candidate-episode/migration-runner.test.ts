import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CandidateMigrationError,
  loadCandidateMigrationFiles,
  runCandidateMigrations,
  type CandidateMigrationLedgerRow,
} from "./migration-runner";
import type {
  PostgresTransactionConnection,
  PostgresTransactionPool,
} from "./transaction-adapter";

type QueryCall = { params: unknown[]; sql: string };

function migrationPool({
  failSql,
  initialLedger = [],
}: {
  failSql?: string;
  initialLedger?: CandidateMigrationLedgerRow[];
} = {}) {
  const calls: QueryCall[] = [];
  const ledger = new Map(initialLedger.map((row) => [row.version, row]));
  const releases: unknown[] = [];
  const client: PostgresTransactionConnection = {
    async query<T = unknown>(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });

      if (sql === failSql) {
        throw new Error("synthetic migration failure");
      }

      if (sql.includes("FROM candidate_authority.schema_migrations") && sql.includes("WHERE version")) {
        const row = ledger.get(String(params[0]));
        return { rows: (row ? [row] : []) as T[] };
      }

      if (sql.startsWith("INSERT INTO candidate_authority.schema_migrations")) {
        ledger.set(String(params[0]), {
          checksum: String(params[1]),
          status: String(params[8]) as "applied" | "failed",
          version: String(params[0]),
        });
      }

      if (sql.includes("current_user AS applied_by_role")) {
        return { rows: [{ applied_by_role: "candidate_migration_role" }] as T[] };
      }

      if (sql.includes("candidate_catalog_fingerprint_v1")) {
        return { rows: [{ catalog: [] }] as T[] };
      }

      return { rows: [] as T[] };
    },
    release(error?: Error | boolean) {
      releases.push(error);
    },
  };
  const pool: PostgresTransactionPool = {
    async connect() {
      return client;
    },
  };

  return { calls, ledger, pool, releases };
}

test("migration files load in version order with byte-stable checksums", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wp-g0-2-migration-files-"));

  try {
    await writeFile(join(directory, "002_second.sql"), "SELECT 2;\n");
    await writeFile(join(directory, "001_first.sql"), "SELECT 1;\n");
    const migrations = await loadCandidateMigrationFiles(directory);

    assert.deepEqual(migrations.map((migration) => migration.version), ["001_first", "002_second"]);
    assert.match(migrations[0].checksum, /^[a-f0-9]{64}$/);
    assert.equal(migrations[0].sql, "SELECT 1;\n");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("runner executes each SQL file whole and records an applied ledger row", async () => {
  const sql = "CREATE FUNCTION synthetic() RETURNS void AS $$ BEGIN PERFORM 1; PERFORM 2; END $$ LANGUAGE plpgsql;";
  const harness = migrationPool();

  const result = await runCandidateMigrations({
    approvalRef: "approval-contract-sha",
    designDigest: "design-digest",
    migrations: [{ checksum: "a".repeat(64), sql, version: "001_synthetic" }],
    pool: harness.pool,
    releaseId: "release-id",
  });

  assert.deepEqual(result, {
    applied: ["001_synthetic"],
    skipped: [],
  });
  assert.equal(harness.calls.filter((call) => call.sql === sql).length, 1);
  assert.equal(harness.ledger.get("001_synthetic")?.status, "applied");
  assert.deepEqual(harness.releases, [undefined]);
});

test("runner treats an applied matching checksum as a no-op", async () => {
  const checksum = "b".repeat(64);
  const harness = migrationPool({
    initialLedger: [{ checksum, status: "applied", version: "001_synthetic" }],
  });

  const result = await runCandidateMigrations({
    approvalRef: "approval-contract-sha",
    designDigest: "design-digest",
    migrations: [{ checksum, sql: "SELECT should_not_run", version: "001_synthetic" }],
    pool: harness.pool,
    releaseId: "release-id",
  });

  assert.deepEqual(result, { applied: [], skipped: ["001_synthetic"] });
  assert.equal(harness.calls.some((call) => call.sql === "SELECT should_not_run"), false);
});

test("runner rejects checksum drift before executing migration SQL", async () => {
  const harness = migrationPool({
    initialLedger: [{ checksum: "c".repeat(64), status: "applied", version: "001_synthetic" }],
  });

  await assert.rejects(
    runCandidateMigrations({
      approvalRef: "approval-contract-sha",
      designDigest: "design-digest",
      migrations: [{ checksum: "d".repeat(64), sql: "SELECT should_not_run", version: "001_synthetic" }],
      pool: harness.pool,
      releaseId: "release-id",
    }),
    (error: unknown) => error instanceof CandidateMigrationError && error.reason === "checksum_mismatch",
  );
  assert.equal(harness.calls.some((call) => call.sql === "SELECT should_not_run"), false);
});

test("runner rolls back failed DDL and poisons that version as failed", async () => {
  const sql = "SELECT synthetic_failure";
  const harness = migrationPool({ failSql: sql });

  await assert.rejects(
    runCandidateMigrations({
      approvalRef: "approval-contract-sha",
      designDigest: "design-digest",
      migrations: [{ checksum: "e".repeat(64), sql, version: "001_synthetic" }],
      pool: harness.pool,
      releaseId: "release-id",
    }),
    /synthetic migration failure/,
  );

  assert.ok(harness.calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(harness.ledger.get("001_synthetic")?.status, "failed");
});

test("runner resets session role before releasing the migration connection", async () => {
  const harness = migrationPool();

  await runCandidateMigrations({
    approvalRef: "approval-v1",
    designDigest: "design-v1",
    migrations: [{
      checksum: "f".repeat(64),
      sql: "SELECT 1",
      version: "001_candidate_episode_authority",
    }],
    pool: harness.pool,
    releaseId: "release-v1",
  });

  const resetIndex = harness.calls.findIndex((call) => call.sql === "RESET ROLE");
  const unlockIndex = harness.calls.findIndex((call) => call.sql.includes("pg_advisory_unlock"));
  assert.ok(resetIndex >= 0);
  assert.ok(unlockIndex > resetIndex);
  assert.equal(harness.releases.length, 1);
});
