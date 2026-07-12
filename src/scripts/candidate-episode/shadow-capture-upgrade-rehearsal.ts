import assert from "node:assert/strict";
import { join } from "node:path";
import { Pool } from "pg";
import { assertRehearsalDatabaseTarget } from "../../lib/candidate-episode/database-safety";
import {
  loadCandidateMigrationFiles,
  runCandidateMigrations,
} from "../../lib/candidate-episode/migration-runner";
import { buildPersistenceSchemaSql } from "../../lib/persistence/persistence-contract";

const approvalRef = "WP-G0.2-SHADOW-CAPTURE-PRODUCTION-READINESS-AND-APPROVAL-PACKET";
const designDigest = "wp-g0.2-shadow-capture-upgrade-rehearsal.v2";
const releaseId = "wp-g0.2-shadow-capture-readiness.v1";

async function main() {
  const target = assertRehearsalDatabaseTarget({
    environment: "rehearsal",
    env: process.env,
  });
  const pool = new Pool({
    connectionString: process.env.WP_G0_2_REHEARSAL_DATABASE_URL,
    max: 2,
  });

  try {
    await pool.query(buildPersistenceSchemaSql());
    await pool.query(
      `INSERT INTO journal_events (
         id, scope, symbol, result, created_at, payload
       ) VALUES (
         'shadow-upgrade-sentinel', 'synthetic_rehearsal', 'SYNTHUSDT',
         'synthetic_only', CURRENT_TIMESTAMP,
         '{"fixture":true,"production":false}'::jsonb
       )`,
    );
    const before = await pool.query<{ hash: string }>(`
      SELECT md5(string_agg(id || ':' || payload::text, '|' ORDER BY id)) AS hash
      FROM journal_events WHERE scope = 'synthetic_rehearsal'
    `);
    const migrations = await loadCandidateMigrationFiles(
      join(process.cwd(), "migrations", "candidate-episode"),
    );
    assert.equal(migrations.length, 9);

    const baseline = await runCandidateMigrations({
      approvalRef,
      designDigest,
      migrations: migrations.slice(0, 8),
      pool,
      releaseId,
    });
    assert.equal(baseline.applied.length, 8);

    const upgrade = await runCandidateMigrations({
      approvalRef,
      designDigest,
      migrations,
      pool,
      releaseId,
    });
    assert.deepEqual(upgrade.applied, ["009_candidate_shadow_capture_safety"]);
    assert.equal(upgrade.skipped.length, 8);

    const repeat = await runCandidateMigrations({
      approvalRef,
      designDigest,
      migrations,
      pool,
      releaseId,
    });
    assert.equal(repeat.applied.length, 0);
    assert.equal(repeat.skipped.length, 9);

    const after = await pool.query<{ hash: string }>(`
      SELECT md5(string_agg(id || ':' || payload::text, '|' ORDER BY id)) AS hash
      FROM journal_events WHERE scope = 'synthetic_rehearsal'
    `);
    const verification = await pool.query<{
      columns: string;
      functions: string;
      migrations: string;
      quarantine_columns: string;
    }>(`
      SELECT
        (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'candidate_authority') AS columns,
        (SELECT count(*)::text FROM pg_proc procedure
         JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
         WHERE namespace.nspname = 'candidate_authority') AS functions,
        (SELECT count(*)::text FROM candidate_authority.schema_migrations
         WHERE status = 'applied') AS migrations,
        (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'candidate_authority'
           AND table_name = 'candidate_episode_ingest_outbox'
           AND column_name IN ('max_attempts','error_class','error_message_redacted','quarantined_at'))
          AS quarantine_columns
    `);
    assert.equal(before.rows[0]?.hash, after.rows[0]?.hash);
    assert.equal(verification.rows[0]?.columns, "166");
    assert.equal(verification.rows[0]?.functions, "26");
    assert.equal(verification.rows[0]?.migrations, "9");
    assert.equal(verification.rows[0]?.quarantine_columns, "4");

    process.stdout.write(`${JSON.stringify({
      status: "pass",
      target,
      baselineApplied: baseline.applied.length,
      upgradeApplied: upgrade.applied,
      repeatSkipped: repeat.skipped.length,
      legacySentinelHashPreserved: before.rows[0]?.hash === after.rows[0]?.hash,
      verification: verification.rows[0],
      productionConnected: false,
    })}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const failure = error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: "UnknownError", message: "unknown shadow upgrade rehearsal failure" };
  process.stderr.write(`${JSON.stringify({ status: "fail", failure })}\n`);
  process.exitCode = 24;
});
