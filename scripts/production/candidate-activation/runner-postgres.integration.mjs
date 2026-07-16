import assert from "node:assert/strict";
import pg from "pg";
import {
  preflightControl,
  readDatabaseObservation,
  rollbackControl,
  startControl,
} from "./runner.mjs";

const { Client } = pg;
const adminUrl = process.env.WP_G0_2_ACTIVATION_ADMIN_DATABASE_URL?.trim();
const runnerUrl = process.env.WP_G0_2_ACTIVATION_RUNNER_DATABASE_URL?.trim();
assert.ok(adminUrl && runnerUrl, "activation rehearsal database URLs are required");

const request = {
  approvalDigest: `sha256:${"d".repeat(64)}`,
  migrationId: "candidate-episode-v1",
  minimumObservationHours: 24,
  observationIntervalSeconds: 300,
  releaseId: "candidate-shadow-rehearsal-release",
};
const admin = new Client({ connectionString: adminUrl });
const runner = new Client({ connectionString: runnerUrl });

await admin.connect();
try {
  await admin.query(`CREATE ROLE market_radar_candidate_activation_runner LOGIN
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
  await admin.query("GRANT candidate_migration_role TO market_radar_candidate_activation_runner");
  await runner.connect();
  try {
    await assert.rejects(
      runner.query("UPDATE candidate_authority.candidate_migration_control SET write_frozen=true"),
      (error) => error?.code === "42501",
    );
    const preflight = await preflightControl(runner, request);
    assert.equal(preflight.candidateLedger, 9);
    assert.equal(preflight.candidateControlRows, 0);
    assert.equal(preflight.controlStartMode, "fresh");

    const started = await startControl(runner, request);
    assert.equal(started.phase, "shadow_capture");
    assert.equal(started.authorityEpoch, 1);
    assert.equal(started.controlStartMode, "fresh");
    assert.equal(started.writeFrozen, false);
    assert.equal(Date.parse(started.deadlineAt) - Date.parse(started.startedAt), 72 * 60 * 60_000);

    const observation = await readDatabaseObservation(admin, request);
    assert.equal(observation.phase, "shadow_capture");
    assert.equal(observation.authorityEpoch, 1);
    assert.equal(observation.identityErrors, 0);
    assert.equal(observation.lockWaiters, 0);
    assert.equal(observation.longTransactions, 0);

    const rolledBack = await rollbackControl(runner, request);
    assert.deepEqual(rolledBack, {
      alreadyRolledBack: false,
      authorityEpoch: 2,
      phase: "legacy",
      writeFrozen: true,
    });
    const rearmPreflight = await preflightControl(runner, {
      ...request,
      approvalDigest: `sha256:${"e".repeat(64)}`,
      releaseId: "candidate-shadow-rehearsal-rearm",
    });
    assert.equal(rearmPreflight.candidateControlRows, 1);
    assert.equal(rearmPreflight.controlStartMode, "legacy_rearm");
    assert.equal(rearmPreflight.currentAuthorityEpoch, 2);

    const rearmRequest = {
      ...request,
      approvalDigest: `sha256:${"e".repeat(64)}`,
      releaseId: "candidate-shadow-rehearsal-rearm",
    };
    const restarted = await startControl(runner, rearmRequest);
    assert.equal(restarted.phase, "shadow_capture");
    assert.equal(restarted.authorityEpoch, 3);
    assert.equal(restarted.controlStartMode, "legacy_rearm");

    const resumedObservation = await readDatabaseObservation(admin, rearmRequest);
    assert.equal(resumedObservation.authorityEpoch, 3);
    const rearmRollback = await rollbackControl(runner, rearmRequest);
    assert.deepEqual(rearmRollback, {
      alreadyRolledBack: false,
      authorityEpoch: 4,
      phase: "legacy",
      writeFrozen: true,
    });

    const final = await admin.query(`SELECT phase, epoch::int, write_frozen,
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_events) AS events,
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox) AS outbox
      FROM candidate_authority.candidate_migration_control WHERE migration_id=$1`, [request.migrationId]);
    assert.deepEqual(final.rows[0], {
      epoch: 4,
      events: 0,
      outbox: 0,
      phase: "legacy",
      write_frozen: true,
    });
  } finally {
    await runner.end();
  }
} finally {
  await admin.query("DROP ROLE IF EXISTS market_radar_candidate_activation_runner");
  await admin.end();
}

process.stdout.write('{"status":"pass","postgresMajor":16,"controlStarted":2,"controlRolledBack":2,"finalPhase":"legacy","finalEpoch":4,"writeFrozen":true,"productionConnected":false}\n');
