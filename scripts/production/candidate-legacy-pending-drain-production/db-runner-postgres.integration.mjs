import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import pg from "pg";

import { openDrainEpoch, rollbackDrainEpoch } from "../candidate-legacy-pending-drain/runner.mjs";

const connectionString = process.env.WP_G0_2_LEGACY_PENDING_DRAIN_PRODUCTION_REHEARSAL_DATABASE_URL;
const integrationTest = connectionString ? test : test.skip;
const migrationId = "candidate-episode-v1-cycle-6";
const releaseId = "candidate-shadow-drain-production-rehearsal";
const digest = `sha256:${"a".repeat(64)}`;

integrationTest("PostgreSQL 16 fail path refreezes with pending data preserved", async () => {
  const pool = new pg.Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("SELECT * FROM candidate_authority.start_shadow_capture_v3($1,$2,$3)", [
      migrationId, releaseId, `sha256:${"b".repeat(64)}`,
    ]);
    await client.query(`INSERT INTO candidate_authority.candidate_episode_ingest_outbox (
      outbox_id, scope, source_type, source_id, source_version, payload_version,
      payload, payload_hash, idempotency_key, status
    ) VALUES ($1,'production_radar','legacy_scan_candidate','rollback-source','v1',
      'shadow-candidate-observation.v1','{}'::jsonb,$2,'rollback-pending','pending')`, [
      randomUUID(), `sha256:${"c".repeat(64)}`,
    ]);
    await client.query(`SELECT * FROM candidate_authority.transition_migration_control_v1(
      $1,1,'legacy',true,$2,$3,clock_timestamp())`, [migrationId, releaseId, digest]);

    const opened = await openDrainEpoch(client, {
      approvalDigest: digest, expectedEpoch: 2, migrationId, releaseId,
    });
    assert.equal(opened.epoch, 3);
    const frozen = await rollbackDrainEpoch(client, {
      approvalDigest: digest, expectedEpoch: 3, migrationId, releaseId,
    });
    assert.equal(frozen.epoch, 4);
    assert.equal(frozen.phase, "legacy");
    assert.equal(frozen.write_frozen, true);

    const result = await client.query(`SELECT
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox) AS total,
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox
        WHERE status='pending') AS pending,
      phase, epoch::int, write_frozen
      FROM candidate_authority.candidate_migration_control WHERE migration_id=$1`, [migrationId]);
    assert.deepEqual(result.rows[0], {
      epoch: 4, pending: 1, phase: "legacy", total: 1, write_frozen: true,
    });
  } finally {
    client.release();
    await pool.end();
  }
});
