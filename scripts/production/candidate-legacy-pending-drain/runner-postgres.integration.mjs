import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

import { closeDrainEpoch, openDrainEpoch } from "./runner.mjs";

const connectionString = process.env.WP_G0_2_LEGACY_PENDING_DRAIN_REHEARSAL_DATABASE_URL;
const integrationTest = connectionString ? test : test.skip;
const migrationId = "candidate-episode-v1-cycle-6";
const releaseId = "candidate-shadow-drain-rehearsal";
const digest = `sha256:${"a".repeat(64)}`;

integrationTest("PostgreSQL 16 drains only existing pending rows and refreezes the same control", async () => {
  const { Pool } = pg;
  const pool = new Pool({ connectionString, max: 2 });
  const client = await pool.connect();
  try {
    const started = await client.query(`SELECT started_at, deadline_at
      FROM candidate_authority.start_shadow_capture_v3($1,$2,$3)`, [
      migrationId, releaseId, `sha256:${"b".repeat(64)}`,
    ]);
    const startedAt = new Date(started.rows[0].started_at).toISOString();
    const deadlineAt = new Date(started.rows[0].deadline_at).toISOString();
    await client.query(`SELECT * FROM candidate_authority.transition_migration_control_v1(
      $1,1,'legacy',true,$2,$3,clock_timestamp()
    )`, [migrationId, releaseId, digest]);
    await client.query(`SELECT * FROM candidate_authority.transition_migration_control_v1(
      $1,2,'shadow_capture',false,$2,$3,clock_timestamp()
    )`, [migrationId, releaseId, digest]);

    const openEvent = async (index) => {
      await client.query(`SELECT * FROM candidate_authority.open_or_refresh_episode_v1(
        'production_radar',$1,$2,$3,'{"fixture":true}'::jsonb,
        clock_timestamp() - interval '1 minute',clock_timestamp() - interval '1 minute',1,
        $4,ARRAY['pending_drain_rehearsal'],'P2','light_candidate','unknown',
        clock_timestamp() + interval '1 hour',$5,$6,'pending-drain-rehearsal',$7,$8
      )`, [
        randomUUID(), randomUUID(), `SYNTHETIC:DRAIN-${index}-USDT:PERPETUAL`,
        `price-fact-${index}`, releaseId, `scan-cycle-${index}`,
        `event-idempotency-${index}`, `sha256:${String(index + 7).repeat(64)}`.slice(0, 71),
      ]);
    };
    const hashes = [];
    for (let index = 0; index < 6; index += 1) {
      const hash = `sha256:${String(index + 1).repeat(64)}`.slice(0, 71);
      hashes.push(hash);
      await client.query(`INSERT INTO candidate_authority.candidate_episode_ingest_outbox (
        outbox_id, scope, source_type, source_id, source_version, payload_version,
        payload, payload_hash, idempotency_key, status, completed_at
      ) VALUES ($1,'production_radar','legacy_scan_candidate',$2,$3,
        'shadow-candidate-observation.v1','{}'::jsonb,$4,$5,$6,
        CASE WHEN $6 = 'completed' THEN clock_timestamp() ELSE NULL END)`, [
        randomUUID(),
        `source-${index}`,
        `version-${index}`,
        hash,
        `drain-rehearsal-${index}`,
        index < 2 ? "completed" : "pending",
      ]);
      if (index < 2) await openEvent(index);
    }
    await client.query(`SELECT * FROM candidate_authority.transition_migration_control_v1(
      $1,3,'legacy',true,$2,$3,clock_timestamp()
    )`, [migrationId, releaseId, digest]);

    const before = await client.query(`SELECT phase, epoch::int, write_frozen,
      started_at, deadline_at, approved_release_id,
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox) AS total,
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox
        WHERE status='pending') AS pending,
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox
        WHERE status='completed') AS completed,
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox
        WHERE source_type='candidate_episode_event' AND status='pending') AS event_pending,
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_events) AS events
      FROM candidate_authority.candidate_migration_control WHERE migration_id=$1`, [migrationId]);
    assert.equal(before.rows[0].phase, "legacy");
    assert.equal(before.rows[0].epoch, 4);
    assert.equal(before.rows[0].write_frozen, true);
    assert.equal(before.rows[0].pending, 6);
    assert.equal(before.rows[0].completed, 2);
    assert.equal(before.rows[0].event_pending, 2);
    assert.equal(before.rows[0].events, 2);
    assert.equal(before.rows[0].total, 8);

    await assert.rejects(
      closeDrainEpoch(client, {
        approvalDigest: digest,
        expectedEpoch: 5,
        migrationId,
        releaseId,
      }),
      /input_expected_epoch_invalid|drain_not_fully_completed/u,
    );

    const opened = await openDrainEpoch(client, {
      approvalDigest: digest,
      expectedEpoch: 4,
      migrationId,
      releaseId,
    });
    assert.equal(opened.phase, "shadow_capture");
    assert.equal(opened.epoch, 5);
    assert.equal(new Date(opened.started_at).toISOString(), startedAt);
    assert.equal(new Date(opened.deadline_at).toISOString(), deadlineAt);

    const claimed = await client.query(`SELECT *
      FROM candidate_authority.claim_shadow_candidate_outbox_v2(
        'production_radar','candidate-drain-rehearsal',clock_timestamp(),60,100,$1,5
      )`, [migrationId]);
    assert.equal(claimed.rows.length, 4);
    for (const [index, row] of claimed.rows.entries()) {
      await openEvent(index + 2);
      await client.query(`SELECT * FROM candidate_authority.complete_outbox_v1(
        'production_radar',$1,'candidate-drain-rehearsal',$2,clock_timestamp(),$3,$4,5
      )`, [row.outbox_id, row.fencing_token, row.payload_hash, migrationId]);
    }

    const closed = await closeDrainEpoch(client, {
      approvalDigest: digest,
      expectedEpoch: 5,
      migrationId,
      releaseId,
    });
    assert.equal(closed.phase, "legacy");
    assert.equal(closed.epoch, 6);
    assert.equal(closed.write_frozen, true);
    assert.equal(new Date(closed.started_at).toISOString(), startedAt);
    assert.equal(new Date(closed.deadline_at).toISOString(), deadlineAt);

    const after = await client.query(`SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status='completed')::int AS completed,
      count(*) FILTER (WHERE status<>'completed')::int AS unresolved,
      count(*) FILTER (WHERE idempotency_key LIKE 'drain-rehearsal-%')::int AS original_rows,
      count(*) FILTER (WHERE source_type='legacy_scan_candidate' AND status='pending')::int
        AS legacy_pending,
      count(*) FILTER (WHERE source_type='candidate_episode_event' AND status='pending')::int
        AS event_pending,
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_events) AS events
      FROM candidate_authority.candidate_episode_ingest_outbox`);
    assert.deepEqual(after.rows[0], {
      completed: 6,
      event_pending: 6,
      events: 6,
      legacy_pending: 0,
      original_rows: 6,
      total: 12,
      unresolved: 6,
    });

    await assert.rejects(
      client.query(`SELECT * FROM candidate_authority.claim_shadow_candidate_outbox_v2(
        'production_radar','stale-drain',clock_timestamp(),60,100,$1,5
      )`, [migrationId]),
      (error) => error?.code === "40001",
    );
  } finally {
    client.release();
    await pool.end();
  }
});
