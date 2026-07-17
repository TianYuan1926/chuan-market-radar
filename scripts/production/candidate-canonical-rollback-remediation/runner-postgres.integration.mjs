import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

const connectionString = process.env.WP_G0_2_CANONICAL_ROLLBACK_REHEARSAL_DATABASE_URL;
const expectedDatabase = "wp_g0_2_rehearsal_canonical_rollback";

function requireRehearsalTarget() {
  assert.equal(process.env.APP_ENV, "rehearsal");
  assert.equal(process.env.WP_G0_2_REHEARSAL, "true");
  assert.ok(connectionString);
  const parsed = new URL(connectionString);
  assert.equal(parsed.pathname, `/${expectedDatabase}`);
  assert.ok(["localhost", "127.0.0.1"].includes(parsed.hostname));
}

async function expectSqlState(client, sql, params, code, proof) {
  await assert.rejects(
    client.query(sql, params),
    (error) => error?.code === code && Boolean(proof),
  );
}

test("PostgreSQL 16 provides a least-privilege canonical rollback that preserves data", async () => {
  requireRehearsalTarget();
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const version = await client.query("SHOW server_version_num");
    assert.equal(Math.floor(Number(version.rows[0].server_version_num) / 10000), 16);
    const migrationCount = await client.query(
      "SELECT count(*)::int AS count FROM candidate_authority.schema_migrations WHERE status = 'applied'",
    );
    assert.equal(migrationCount.rows[0].count, 10);

    const migrationId = "candidate-episode-v1";
    const outboxId = randomUUID();
    const sourceId = randomUUID();
    const payloadHash = `sha256:${"b".repeat(64)}`;
    await client.query(
      `INSERT INTO candidate_authority.candidate_migration_control (
        migration_id, phase, epoch, started_at, deadline_at, write_frozen,
        approved_release_id, approval_digest, updated_at
      ) VALUES ($1, 'canonical', 9, clock_timestamp() - interval '1 hour',
        clock_timestamp() + interval '1 hour', false, 'canonical-release', $2, clock_timestamp())`,
      [migrationId, `sha256:${"a".repeat(64)}`],
    );
    await client.query(
      `INSERT INTO candidate_authority.candidate_episode_ingest_outbox (
        outbox_id, scope, source_type, source_id, source_version, payload_version,
        payload, payload_hash, idempotency_key, status, attempt_count,
        fencing_token, created_at, completed_at
      ) VALUES ($1, 'production_radar', 'legacy_scan_candidate', $2, 'v1',
        'candidate-shadow-outbox.v1', '{}'::jsonb, $3, $4, 'completed', 1, 1,
        clock_timestamp(), clock_timestamp())`,
      [outboxId, sourceId, payloadHash, `rollback-preservation:${outboxId}`],
    );

    await client.query("SET ROLE candidate_application_writer_role");
    await expectSqlState(
      client,
      "SELECT * FROM candidate_authority.rollback_canonical_migration_control_v1($1,9,$2,$3)",
      [migrationId, "rollback-release", `sha256:${"c".repeat(64)}`],
      "42501",
      "application_writer_execute_denied",
    );
    await expectSqlState(
      client,
      "UPDATE candidate_authority.candidate_migration_control SET write_frozen=true WHERE migration_id=$1",
      [migrationId],
      "42501",
      "application_writer_direct_update_denied",
    );
    await client.query("RESET ROLE");

    await client.query("SET ROLE candidate_migration_role");
    const rolledBack = await client.query(
      `SELECT phase, epoch::text, write_frozen, approved_release_id, approval_digest
       FROM candidate_authority.rollback_canonical_migration_control_v1($1,9,$2,$3)`,
      [migrationId, "rollback-release", `sha256:${"c".repeat(64)}`],
    );
    assert.deepEqual(rolledBack.rows[0], {
      phase: "legacy",
      epoch: "10",
      write_frozen: true,
      approved_release_id: "rollback-release",
      approval_digest: `sha256:${"c".repeat(64)}`,
    });
    await expectSqlState(
      client,
      "SELECT * FROM candidate_authority.rollback_canonical_migration_control_v1($1,10,$2,$3)",
      [migrationId, "repeat-release", `sha256:${"d".repeat(64)}`],
      "23514",
      "repeat_rollback_denied",
    );
    await client.query("RESET ROLE");

    const preserved = await client.query(
      `SELECT count(*)::int AS count, min(payload_hash) AS payload_hash
       FROM candidate_authority.candidate_episode_ingest_outbox WHERE outbox_id=$1`,
      [outboxId],
    );
    assert.deepEqual(preserved.rows[0], { count: 1, payload_hash: payloadHash });

    await client.query(
      `INSERT INTO candidate_authority.candidate_migration_control (
        migration_id, phase, epoch, started_at, deadline_at, write_frozen,
        approved_release_id, approval_digest, updated_at
      ) VALUES ('noncanonical-cycle', 'canonical_compat', 5,
        clock_timestamp() - interval '1 hour', clock_timestamp() + interval '1 hour',
        false, 'compat-release', $1, clock_timestamp())`,
      [`sha256:${"e".repeat(64)}`],
    );
    await client.query(
      `INSERT INTO candidate_authority.candidate_migration_control (
        migration_id, phase, epoch, started_at, deadline_at, write_frozen,
        approved_release_id, approval_digest, updated_at
      ) VALUES ('stale-cycle', 'canonical', 7,
        clock_timestamp() - interval '1 hour', clock_timestamp() + interval '1 hour',
        false, 'canonical-release', $1, clock_timestamp())`,
      [`sha256:${"f".repeat(64)}`],
    );
    await client.query("SET ROLE candidate_migration_role");
    await expectSqlState(
      client,
      "SELECT * FROM candidate_authority.rollback_canonical_migration_control_v1('noncanonical-cycle',5,$1,$2)",
      ["rollback-release", `sha256:${"1".repeat(64)}`],
      "23514",
      "noncanonical_phase_denied",
    );
    await expectSqlState(
      client,
      "SELECT * FROM candidate_authority.rollback_canonical_migration_control_v1('stale-cycle',6,$1,$2)",
      ["rollback-release", `sha256:${"2".repeat(64)}`],
      "40001",
      "stale_epoch_denied",
    );
    await expectSqlState(
      client,
      "SELECT * FROM candidate_authority.rollback_canonical_migration_control_v1('stale-cycle',7,$1,'invalid')",
      ["rollback-release"],
      "22023",
      "invalid_approval_digest_denied",
    );
    await client.query("RESET ROLE");

    const ownership = await client.query(
      `SELECT pg_get_userbyid(p.proowner) AS owner,
        has_function_privilege('candidate_migration_role', p.oid, 'EXECUTE') AS migration_execute,
        has_function_privilege('candidate_application_writer_role', p.oid, 'EXECUTE') AS writer_execute,
        EXISTS (
          SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
          WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
        ) AS public_execute
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='candidate_authority'
         AND p.proname='rollback_canonical_migration_control_v1'`,
    );
    assert.deepEqual(ownership.rows[0], {
      owner: "candidate_migration_role",
      migration_execute: true,
      writer_execute: false,
      public_execute: false,
    });
    process.stdout.write(`${JSON.stringify({
      status: "pass",
      postgresMajor: 16,
      migrationCount: 10,
      canonicalRollback: "canonical_to_legacy_frozen",
      epoch: "9_to_10",
      candidateDataPreserved: true,
      leastPrivilege: true,
      productionConnected: false,
    })}\n`);
  } finally {
    await client.end();
  }
});
