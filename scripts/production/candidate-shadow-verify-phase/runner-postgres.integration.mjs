import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { test } from "node:test";

import pg from "pg";

import {
  buildShadowVerifyManifest,
  manifestApprovalDigest,
  preflightControl,
  rollbackControl,
  serializeManifest,
  transitionControl,
} from "./runner.mjs";

const databaseUrl = process.env.WP_G0_2_SHADOW_VERIFY_PHASE_REHEARSAL_DATABASE_URL;
const adminUrlFile = process.env.WP_G0_2_SHADOW_VERIFY_PHASE_ADMIN_URL_FILE;
const migrationId = "candidate-episode-v1-cycle-2";
const releaseId = "candidate-shadow-pg16-phase-0001";
const reconciliationHash = `sha256:${"a".repeat(64)}`;
const rollbackApprovalDigest = `sha256:${"b".repeat(64)}`;

test("PostgreSQL 16 transitions only after 10,000 completed writes and preserves data on rollback", {
  skip: !databaseUrl || !adminUrlFile,
}, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await writeFile(adminUrlFile, `${databaseUrl}\n`, { mode: 0o600 });
    await client.query(`INSERT INTO candidate_authority.candidate_migration_control (
      migration_id, phase, epoch, started_at, deadline_at, write_frozen,
      approved_release_id, approval_digest, updated_at
    ) VALUES ($1,'shadow_capture',3,clock_timestamp()-interval '1 hour',
      clock_timestamp()+interval '47 hours',false,$2,$3,clock_timestamp()-interval '1 hour')`, [
      migrationId,
      releaseId,
      `sha256:${"c".repeat(64)}`,
    ]);
    await client.query(`INSERT INTO candidate_authority.candidate_episode_ingest_outbox (
      outbox_id, scope, source_type, source_id, source_version, payload_version,
      payload, payload_hash, idempotency_key, status, completed_at
    ) SELECT md5('phase-' || value::text)::uuid, 'production_radar',
      'legacy_scan_candidate', 'source-' || value::text, 'v1', 'candidate-source.v1',
      '{}'::jsonb, $1, 'phase-' || value::text, 'completed', clock_timestamp()
    FROM generate_series(1,9999) value`, [`sha256:${"d".repeat(64)}`]);

    const manifest = buildShadowVerifyManifest({
      currentAuthorityEpoch: 3,
      generatedAt: new Date().toISOString(),
      migrationId,
      reconciliationEvidenceHash: reconciliationHash,
      releaseId,
    });
    const rawManifest = serializeManifest(manifest);
    const request = {
      migrationId,
      releaseId,
      currentAuthorityEpoch: 3,
      targetAuthorityEpoch: 4,
      manifestApprovalDigest: manifestApprovalDigest(rawManifest),
      rollbackApprovalDigest,
    };

    await assert.rejects(() => preflightControl(client, request),
      /candidate_completed_writes_below_10000/u);
    await client.query(`INSERT INTO candidate_authority.candidate_episode_ingest_outbox (
      outbox_id, scope, source_type, source_id, source_version, payload_version,
      payload, payload_hash, idempotency_key, status, completed_at
    ) VALUES (md5('phase-10000')::uuid, 'production_radar',
      'legacy_scan_candidate', 'source-10000', 'v1', 'candidate-source.v1',
      '{}'::jsonb, $1, 'phase-10000', 'completed', clock_timestamp())`, [
      `sha256:${"d".repeat(64)}`,
    ]);

    const preflight = await preflightControl(client, request);
    assert.equal(preflight.status, "PASS_SHADOW_VERIFY_CONTROL_PREFLIGHT");
    assert.equal(preflight.completedWrites, 10000);
    assert.equal(preflight.targetAuthorityEpoch, 4);

    const transitioned = await transitionControl(client, request, rawManifest);
    assert.deepEqual({
      status: transitioned.status,
      phase: transitioned.phase,
      authorityEpoch: transitioned.authorityEpoch,
      writeFrozen: transitioned.writeFrozen,
      approvalDigest: transitioned.approvalDigest,
    }, {
      status: "PASS_SHADOW_VERIFY_CONTROL_TRANSITION",
      phase: "shadow_verify",
      authorityEpoch: 4,
      writeFrozen: false,
      approvalDigest: request.manifestApprovalDigest,
    });

    await assert.rejects(() => transitionControl(client, request, rawManifest),
      /candidate_control_pretransition_invalid/u);

    const rolledBack = await rollbackControl(client, request);
    assert.equal(rolledBack.status, "PASS_SHADOW_VERIFY_CONTROL_ROLLBACK");
    assert.equal(rolledBack.phase, "legacy");
    assert.equal(rolledBack.authorityEpoch, 5);
    assert.equal(rolledBack.writeFrozen, true);

    const final = await client.query(`SELECT phase, epoch::int, write_frozen,
      approval_digest,
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox) AS outbox
      FROM candidate_authority.candidate_migration_control WHERE migration_id=$1`, [migrationId]);
    assert.deepEqual(final.rows[0], {
      phase: "legacy",
      epoch: 5,
      write_frozen: true,
      approval_digest: rollbackApprovalDigest,
      outbox: 10000,
    });
  } finally {
    await client.end();
  }
});
