import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import pg from "pg";

import {
  EXPECTED_MIGRATIONS,
  MIGRATION_CHECKSUM,
  MIGRATION_FILE,
  MIGRATION_VERSION,
  PACKAGE_ID,
  executeDatabase,
  preflightDatabase,
  readLockedMigration,
  verifyDatabase,
} from "./runner.mjs";

const adminUrl = process.env.WP_G0_2_CANONICAL_ROLLBACK_ADD_SCHEMA_ADMIN_URL;
const migrationUrl = process.env.WP_G0_2_CANONICAL_ROLLBACK_ADD_SCHEMA_MIGRATION_URL;
const expectedDatabase = "wp_g0_2_rehearsal_canonical_rollback_add_schema";
const root = resolve(import.meta.dirname, "../../..");

function requireRehearsalTarget() {
  assert.equal(process.env.APP_ENV, "rehearsal");
  assert.equal(process.env.WP_G0_2_REHEARSAL, "true");
  for (const value of [adminUrl, migrationUrl]) {
    assert.ok(value);
    const parsed = new URL(value);
    assert.equal(parsed.pathname, `/${expectedDatabase}`);
    assert.ok(["localhost", "127.0.0.1"].includes(parsed.hostname));
  }
}

async function initializeBaseline(admin) {
  const migrations = Object.entries(EXPECTED_MIGRATIONS).slice(0, 9);
  for (let index = 0; index < migrations.length; index += 1) {
    const [version, checksum] = migrations[index];
    const filename = `${version}.sql`;
    const sql = await readFile(resolve(root, "migrations/candidate-episode", filename), "utf8");
    await admin.query("BEGIN");
    try {
      await admin.query(sql);
      await admin.query(`INSERT INTO candidate_authority.schema_migrations (
        version, checksum, from_schema_fingerprint, to_schema_fingerprint,
        release_id, approval_ref, applied_at, applied_by_role, duration_ms, status
      ) VALUES ($1,$2,$3,$4,'rehearsal-baseline','rehearsal-baseline',
        clock_timestamp(),current_user,0,'applied')`, [
        version, checksum, `sha256:${String(index).padStart(64, "0")}`,
        `sha256:${String(index + 1).padStart(64, "0")}`,
      ]);
      await admin.query("COMMIT");
    } catch (error) {
      await admin.query("ROLLBACK");
      throw error;
    }
  }
  await admin.query(`CREATE ROLE market_radar_migration_login
    LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
  await admin.query("GRANT candidate_migration_role TO market_radar_migration_login");
}

function request() {
  const now = new Date();
  return {
    schemaVersion: "candidate-canonical-rollback-add-schema-request.v1",
    packageId: PACKAGE_ID, actionClass: "additive_schema_migration",
    riskTier: "R2_DATABASE_SCHEMA", sourceCommit: "a".repeat(40),
    sourceTree: "b".repeat(40), contractSha256: "c".repeat(64),
    runnerArtifactSha256: "d".repeat(64), transportArtifactSha256: "e".repeat(64),
    bundleSha256: "f".repeat(64), migrationFile: MIGRATION_FILE,
    migrationVersion: MIGRATION_VERSION, migrationChecksum: MIGRATION_CHECKSUM,
    onlyPendingMigration: MIGRATION_VERSION, expectedAppliedBaselineCount: 9,
    expectedAppliedCompletionCount: 10,
    migrationReleaseId: "wp-g0-2-canonical-rollback-safety-pg16-0001",
    approvalRef: "MR-G0-CANONICAL-ROLLBACK-SAFETY-PG16-00000001",
    approvalIssuedAt: new Date(now.getTime() - 60_000).toISOString(),
    approvalExpiresAt: new Date(now.getTime() + 60 * 60_000).toISOString(),
    lockTimeout: "5s", statementTimeout: "30s", idleTransactionTimeout: "60s",
    roleBootstrapAllowed: false, destructiveSqlAllowed: false,
    businessDataMutationAllowed: false, featureFlagMutationAllowed: false,
    serviceMutationAllowed: false, sourceSyncAllowed: false,
  };
}

test("PostgreSQL 16 executes only migration 010 and preserves the exact 1-9 baseline", async () => {
  requireRehearsalTarget();
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const version = await admin.query("SHOW server_version_num");
    assert.equal(Math.floor(Number(version.rows[0].server_version_num) / 10000), 16);
    await initializeBaseline(admin);
  } finally {
    await admin.end();
  }

  const client = new pg.Client({ connectionString: migrationUrl });
  await client.connect();
  try {
    const migration = await readLockedMigration(root);
    const preflight = await preflightDatabase(client);
    assert.deepEqual({ status: preflight.status, migrationRows: preflight.migrationRows }, {
      status: "PASS_CANONICAL_ROLLBACK_ADD_SCHEMA_PREFLIGHT", migrationRows: 9,
    });

    await assert.rejects(() => executeDatabase(client, request(),
      `${migration.sql}\nSELECT 1 / 0;`), /division by zero/u);
    const afterRollback = await preflightDatabase(client);
    assert.equal(afterRollback.migrationRows, 9);

    const executed = await executeDatabase(client, request(), migration.sql);
    assert.deepEqual(executed.applied, [MIGRATION_VERSION]);
    assert.equal(executed.businessDataChanged, false);
    assert.notEqual(executed.fromSchemaFingerprint, executed.toSchemaFingerprint);

    const verified = await verifyDatabase(client);
    assert.deepEqual({
      status: verified.status,
      migrationRows: verified.migrationRows,
      functionOwner: verified.functionOwner,
      leastPrivilege: verified.leastPrivilege,
    }, {
      status: "PASS_CANONICAL_ROLLBACK_ADD_SCHEMA_VERIFY",
      migrationRows: 10,
      functionOwner: "candidate_migration_role",
      leastPrivilege: true,
    });
    await assert.rejects(() => executeDatabase(client, request(), migration.sql),
      /migration_ledger_count_invalid/u);
    process.stdout.write(`${JSON.stringify({
      status: "pass", postgresMajor: 16, baselineMigrations: 9,
      appliedMigration: MIGRATION_VERSION, completionMigrations: 10,
      transactionRollbackProven: true, candidateBusinessDataChanged: false,
      leastPrivilege: true, productionConnected: false,
    })}\n`);
  } finally {
    await client.end();
  }
});
