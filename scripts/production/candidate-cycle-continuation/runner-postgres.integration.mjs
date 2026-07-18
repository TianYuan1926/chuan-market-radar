import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import {
  continueCandidateValidationCycle,
  preflightCandidateValidationCycleContinuation,
  readCandidateValidationCycleObservation,
  rollbackCandidateValidationCycle,
} from "./runner.mjs";

const connectionString = process.env.WP_G0_2_CYCLE_CONTINUATION_REHEARSAL_DATABASE_URL;
const integrationTest = connectionString ? test : test.skip;

const input = {
  currentAuthorityEpoch: 1,
  currentMigrationId: "candidate-episode-v1",
  currentPhase: "shadow_capture",
  nextMigrationId: "candidate-episode-v1-cycle-2",
  currentReleaseId: "candidate-shadow-cycle-current",
  nextReleaseId: "candidate-shadow-cycle-next",
  approvalDigest: `sha256:${"a".repeat(64)}`,
};

integrationTest("PostgreSQL 16 atomically continues an immutable 72h validation cycle", async () => {
  const { Pool } = pg;
  const pool = new Pool({ connectionString, max: 2 });
  const client = await pool.connect();
  const outboxId = randomUUID();
  const episodeId = randomUUID();
  const eventId = randomUUID();
  try {
    const started = await client.query(`SELECT started_at, deadline_at
      FROM candidate_authority.start_shadow_capture_v3($1,$2,$3)`, [
      input.currentMigrationId,
      input.currentReleaseId,
      `sha256:${"b".repeat(64)}`,
    ]);
    const oldStartedAt = new Date(started.rows[0].started_at).toISOString();
    const oldDeadlineAt = new Date(started.rows[0].deadline_at).toISOString();
    await client.query(`INSERT INTO candidate_authority.candidate_episode_ingest_outbox (
      outbox_id, scope, source_type, source_id, source_version, payload_version,
      payload, payload_hash, idempotency_key, status, completed_at
    ) VALUES (
      $1,'production_radar','legacy_scan_candidate','scan-cycle-1','v1',
      'shadow-candidate-observation.v1','{}'::jsonb,$2,'cycle-preserved-outbox',
      'completed',clock_timestamp()
    )`, [outboxId, `sha256:${"c".repeat(64)}`]);
    await client.query(`SELECT * FROM candidate_authority.open_or_refresh_episode_v1(
      'production_radar',$1,$2,'SYNTHETIC:CYCLE-PRESERVE-USDT:PERPETUAL','{"fixture":true}'::jsonb,
      clock_timestamp() - interval '1 minute',clock_timestamp() - interval '1 minute',1,
      'synthetic-cycle-preserve-price',ARRAY['cycle_preserve_fixture'],'P2','light_candidate',
      'unknown',clock_timestamp() + interval '1 hour',$3,'synthetic-cycle-preserve',
      'cycle-preserve-runtime','cycle-preserve-event',$4
    )`, [episodeId, eventId, input.currentReleaseId, `sha256:${"d".repeat(64)}`]);

    const preflight = await preflightCandidateValidationCycleContinuation(client, input);
    assert.equal(preflight.status, "PASS_CYCLE_CONTINUATION_PREFLIGHT");
    assert.equal(preflight.productionMutation, false);
    assert.equal(preflight.data.legacyCompleted, 1);
    assert.equal(preflight.data.legacyUnresolved, 0);
    assert.equal(preflight.data.candidateEventPending, 1);
    assert.equal(preflight.data.candidateEventOrphans, 0);
    assert.equal(preflight.data.candidateEventContractMismatches, 0);
    assert.equal(preflight.data.outbox, 2);

    const result = await continueCandidateValidationCycle(client, input);
    assert.equal(result.status, "PASS_VALIDATION_CYCLE_CONTINUATION");
    assert.equal(result.deadlineReset, false);
    assert.equal(result.thresholdChanged, false);
    assert.equal(result.previousCycle?.phase, "legacy");
    assert.equal(result.previousCycle?.writeFrozen, true);
    assert.equal(result.previousCycle?.startedAt, oldStartedAt);
    assert.equal(result.previousCycle?.deadlineAt, oldDeadlineAt);
    assert.equal(result.activeCycle?.migrationId, input.nextMigrationId);
    assert.equal(result.activeCycle?.phase, "shadow_capture");
    assert.equal(result.preservedData.legacyCompleted, 1);

    const observation = await readCandidateValidationCycleObservation(client, input);
    assert.equal(observation.schemaVersion, "candidate-validation-cycle-database-snapshot.v1");
    assert.equal(observation.migrationId, input.nextMigrationId);
    assert.equal(observation.releaseId, input.nextReleaseId);
    assert.equal(observation.completedWrites, 1);
    assert.equal(observation.unresolvedOutbox, 0);
    assert.equal(observation.activeCycles, 1);
    assert.deepEqual(observation.database, { lockWaiters: 0, longTransactions: 0 });

    const proof = await client.query(`SELECT
      count(*) FILTER (WHERE phase <> 'legacy')::int AS active,
      count(*) FILTER (WHERE phase = 'legacy' AND write_frozen)::int AS retired,
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox) AS outbox,
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox
        WHERE outbox_id=$1 AND status='completed') AS preserved,
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox
        WHERE outbox_id=$2 AND source_type='candidate_episode_event' AND status='pending')
        AS event_pending
      FROM candidate_authority.candidate_migration_control`, [outboxId, eventId]);
    assert.deepEqual(proof.rows[0], {
      active: 1, event_pending: 1, retired: 1, outbox: 2, preserved: 1,
    });

    await assert.rejects(
      client.query(`UPDATE candidate_authority.candidate_migration_control
        SET deadline_at=deadline_at + interval '1 minute', epoch=epoch+1,
          updated_at=clock_timestamp()
        WHERE migration_id=$1`, [input.currentMigrationId]),
      (error) => error?.code === "55000",
    );

    const rollback = await rollbackCandidateValidationCycle(client, input);
    assert.equal(rollback.status, "PASS_VALIDATION_CYCLE_FROZEN_LEGACY_AUTHORITY");
    assert.equal(rollback.candidateRuntimeAllowed, false);
    assert.equal(rollback.legacyAuthorityRetained, true);
    assert.equal(rollback.preservedData.legacyCompleted, 1);
    const rollbackProof = await client.query(`SELECT
      count(*) FILTER (WHERE phase <> 'legacy')::int AS active,
      count(*) FILTER (WHERE phase = 'legacy' AND write_frozen)::int AS retired
      FROM candidate_authority.candidate_migration_control`);
    assert.deepEqual(rollbackProof.rows[0], { active: 0, retired: 2 });

    const retryInput = {
      ...input,
      currentAuthorityEpoch: rollback.frozenCycle.epoch,
      currentMigrationId: input.nextMigrationId,
      currentPhase: "legacy",
      currentReleaseId: input.nextReleaseId,
      nextMigrationId: "candidate-episode-v1-cycle-3",
      nextReleaseId: "candidate-shadow-cycle-third",
    };
    const retryPreflight = await preflightCandidateValidationCycleContinuation(client, retryInput);
    assert.equal(retryPreflight.continuationMode, "start_adjacent_from_retired");
    const retried = await continueCandidateValidationCycle(client, retryInput);
    assert.equal(retried.continuationMode, "start_adjacent_from_retired");
    assert.equal(retried.previousCycle?.migrationId, input.nextMigrationId);
    assert.equal(retried.previousCycle?.phase, "legacy");
    assert.equal(retried.activeCycle?.migrationId, retryInput.nextMigrationId);
    assert.equal(retried.activeCycle?.phase, "shadow_capture");
    assert.equal(retried.preservedData.legacyCompleted, 1);
    const retryProof = await client.query(`SELECT
      count(*) FILTER (WHERE phase <> 'legacy')::int AS active,
      count(*) FILTER (WHERE phase = 'legacy' AND write_frozen)::int AS retired
      FROM candidate_authority.candidate_migration_control`);
    assert.deepEqual(retryProof.rows[0], { active: 1, retired: 2 });

    const cycleThreeRollback = await rollbackCandidateValidationCycle(client, retryInput);
    assert.equal(cycleThreeRollback.frozenCycle.migrationId, "candidate-episode-v1-cycle-3");
    assert.equal(cycleThreeRollback.frozenCycle.phase, "legacy");
    const cycleFourInput = {
      ...retryInput,
      currentAuthorityEpoch: cycleThreeRollback.frozenCycle.epoch,
      currentMigrationId: retryInput.nextMigrationId,
      currentPhase: "legacy",
      currentReleaseId: retryInput.nextReleaseId,
      nextMigrationId: "candidate-episode-v1-cycle-4",
      nextReleaseId: "candidate-shadow-cycle-fourth",
    };
    const cycleFourPreflight = await preflightCandidateValidationCycleContinuation(
      client,
      cycleFourInput,
    );
    assert.equal(cycleFourPreflight.continuationMode, "start_adjacent_from_retired");
    const cycleFour = await continueCandidateValidationCycle(client, cycleFourInput);
    assert.equal(cycleFour.activeCycle?.migrationId, "candidate-episode-v1-cycle-4");
    assert.equal(cycleFour.previousCycle?.migrationId, "candidate-episode-v1-cycle-3");
    assert.equal(cycleFour.preservedData.legacyCompleted, 1);
    const cycleFourProof = await client.query(`SELECT
      count(*) FILTER (WHERE phase <> 'legacy')::int AS active,
      count(*) FILTER (WHERE phase = 'legacy' AND write_frozen)::int AS retired
      FROM candidate_authority.candidate_migration_control`);
    assert.deepEqual(cycleFourProof.rows[0], { active: 1, retired: 3 });

    const cycleFourRollback = await rollbackCandidateValidationCycle(client, cycleFourInput);
    assert.equal(cycleFourRollback.frozenCycle.migrationId, "candidate-episode-v1-cycle-4");
    assert.equal(cycleFourRollback.frozenCycle.phase, "legacy");
    const cycleFiveInput = {
      ...cycleFourInput,
      currentAuthorityEpoch: cycleFourRollback.frozenCycle.epoch,
      currentMigrationId: cycleFourInput.nextMigrationId,
      currentPhase: "legacy",
      currentReleaseId: cycleFourInput.nextReleaseId,
      nextMigrationId: "candidate-episode-v1-cycle-5",
      nextReleaseId: "candidate-shadow-cycle-fifth",
    };
    const cycleFivePreflight = await preflightCandidateValidationCycleContinuation(
      client,
      cycleFiveInput,
    );
    assert.equal(cycleFivePreflight.continuationMode, "start_adjacent_from_retired");
    const cycleFive = await continueCandidateValidationCycle(client, cycleFiveInput);
    assert.equal(cycleFive.activeCycle?.migrationId, "candidate-episode-v1-cycle-5");
    assert.equal(cycleFive.previousCycle?.migrationId, "candidate-episode-v1-cycle-4");
    assert.equal(cycleFive.preservedData.legacyCompleted, 1);
    const cycleFiveProof = await client.query(`SELECT
      count(*) FILTER (WHERE phase <> 'legacy')::int AS active,
      count(*) FILTER (WHERE phase = 'legacy' AND write_frozen)::int AS retired
      FROM candidate_authority.candidate_migration_control`);
    assert.deepEqual(cycleFiveProof.rows[0], { active: 1, retired: 4 });
  } finally {
    client.release();
    await pool.end();
  }
});
