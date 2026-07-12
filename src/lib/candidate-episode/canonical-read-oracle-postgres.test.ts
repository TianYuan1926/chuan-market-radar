import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { CandidateCanonicalReadOracleCoordinator } from "./canonical-read-oracle";
import { assertRehearsalDatabaseTarget } from "./database-safety";
import { createPostgresTransactionAdapter } from "./transaction-adapter";

const rehearsalUrl = process.env.WP_G0_2_CANONICAL_ORACLE_REHEARSAL_DATABASE_URL;
const integrationTest = rehearsalUrl ? test : test.skip;

function iso(value: number) {
  return new Date(value).toISOString();
}

function connectionForLogin(connectionString: string, login: string) {
  const url = new URL(connectionString);
  url.username = login;
  url.password = "";
  return url.toString();
}

integrationTest("PostgreSQL 16 compares aggregate read and raw oracle in one reader snapshot", async () => {
  const target = assertRehearsalDatabaseTarget({ environment: "rehearsal", env: {
    ...process.env,
    WP_G0_2_REHEARSAL_DATABASE_URL: rehearsalUrl,
  } });
  assert.match(target.databaseName, /^wp_g0_2_rehearsal_/);
  assert.equal(target.hostClass, "local");

  const admin = new Pool({ connectionString: rehearsalUrl, max: 3 });
  const suffix = `${process.pid}_${Date.now()}`;
  const readerLogin = `market_radar_candidate_oracle_${suffix}`.slice(0, 62);
  const episodeId = randomUUID();
  const eventId = randomUUID();
  const checkpointId = randomUUID();
  const outcomeId = randomUUID();
  const now = Date.now();
  const observedAt = now - 2 * 60 * 60_000;
  const dueAt = observedAt + 60 * 60_000;
  const releaseId = "candidate-shadow-oracle-rehearsal";

  await admin.query(`CREATE ROLE ${readerLogin} LOGIN
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
  await admin.query(`GRANT candidate_application_reader_role TO ${readerLogin}`);
  try {
    await admin.query(`INSERT INTO candidate_authority.candidate_episodes (
      schema_version, scope, episode_id, canonical_instrument_id, venue_context,
      first_seen_at, last_seen_at, observation_price, observation_price_fact_id,
      discovery_reasons, priority_tier, lifecycle, maturity, direction_state,
      expires_at, release_id, source_scan_cycle_id, created_by_runtime_id,
      idempotency_key, row_version
    ) VALUES (
      'candidate-episode.v1','production_radar',$1,'BINANCE:ORACLEUSDT:PERP',
      '{"venue":"BINANCE","contractType":"perpetual"}'::jsonb,$2,$3,NULL,NULL,
      ARRAY['light_scan_candidate'],'A','discovered','light_candidate','unknown',
      NULL,$4,'scan-oracle-1','candidate-shadow:oracle-rehearsal','oracle-episode',1
    )`, [episodeId, iso(observedAt), iso(observedAt + 5 * 60_000), releaseId]);
    await admin.query(`INSERT INTO candidate_authority.candidate_episode_events (
      event_id, scope, episode_id, stream_version, event_type, event_time,
      source_fact_ids, source_scan_cycle_id, release_id, runtime_id,
      idempotency_key, command_hash, payload_version, payload
    ) VALUES (
      $1,'production_radar',$2,1,'DISCOVERED',$3,'{}','scan-oracle-1',$4,
      'canonical-oracle-rehearsal','oracle-event','sha256:' || repeat('a',64),
      'candidate-event.v1','{"eventType":"DISCOVERED","canonicalInstrumentId":"BINANCE:ORACLEUSDT:PERP"}'::jsonb
    )`, [eventId, episodeId, iso(observedAt), releaseId]);
    await admin.query(`INSERT INTO candidate_authority.candidate_episode_checkpoints (
      schema_version, checkpoint_id, scope, episode_id, source_event_id,
      checkpoint_kind, due_at, window_start, window_end, finalize_by,
      retry_policy_version, status, release_id
    ) VALUES (
      'candidate-checkpoint.v1',$1,'production_radar',$2,$3,'1h',$4,$5,$4,$6,
      'checkpoint-retry.v1','completed',$7
    )`, [
      checkpointId,
      episodeId,
      eventId,
      iso(dueAt),
      iso(observedAt),
      iso(dueAt + 60 * 60_000),
      releaseId,
    ]);
    await admin.query(`INSERT INTO candidate_authority.candidate_episode_outcomes (
      schema_version, outcome_id, scope, checkpoint_id, episode_id, source_event_id,
      checkpoint_kind, status, content_hash, observation_price, observation_price_fact_id,
      window_start, window_end, historical_source, historical_instrument_id,
      candle_interval, expected_candles, actual_candles, missing_candles,
      duplicate_candles, coverage_ratio, candle_set_hash, mfe, mae, return_at_close,
      evidence_grade, evidence_grade_version, evidence_grade_reasons,
      validated_at, release_id, runner_version, recorded_at
    ) VALUES (
      'candidate-outcome.v1',$1,'production_radar',$2,$3,$4,'1h','recorded',
      'sha256:' || repeat('b',64),100,'fact:oracle',$5,$6,'rehearsal-candles',
      'BINANCE:ORACLEUSDT:PERP','1m',60,60,0,0,1,
      'sha256:' || repeat('c',64),0.12,-0.03,0.08,true,'eg.v1','{}',$7,$8,
      'canonical-oracle-rehearsal.v1',$7
    )`, [
      outcomeId,
      checkpointId,
      episodeId,
      eventId,
      iso(observedAt),
      iso(dueAt),
      iso(dueAt + 10 * 60_000),
      releaseId,
    ]);

    const reader = new Pool({
      connectionString: connectionForLogin(rehearsalUrl as string, readerLogin),
      max: 2,
    });
    try {
      const transactions = createPostgresTransactionAdapter(reader, {
        role: "candidate_application_reader_role",
      });
      const result = await new CandidateCanonicalReadOracleCoordinator(transactions).compare({
        policy: {
          scope: "production_radar",
          asOf: iso(now),
          releaseId,
          checkpointKind: "1h",
          evidenceGradeVersion: "eg.v1",
          observationCohort: {
            from: iso(observedAt - 60_000),
            toExclusive: iso(observedAt + 10 * 60_000),
          },
          dueCohort: {
            from: iso(observedAt),
            toExclusive: iso(now),
          },
        },
      });
      assert.equal(result.status, "pass");
      assert.equal(result.sameDatabaseSnapshot, true);
      assert.equal(result.transactionIsolation, "serializable_read_only_deferrable");
      assert.equal(result.parity?.differenceCount, 0);
      assert.equal(result.reference?.status, "ready");
      assert.equal(result.candidate?.status, "ready");
      if (result.reference?.status !== "ready") return;
      assert.equal(result.reference.episodes[0]?.directionState, "unknown");
      assert.equal(result.reference.episodes[0]?.observationPrice, null);
      assert.equal(result.reference.review.counts.terminalOutcomes, 1);
      assert.equal(result.reference.review.counts.metricSampleCount, 1);
      assert.equal(result.canAuthorizeCutover, false);

      const permissionClient = await reader.connect();
      try {
        await permissionClient.query("SET ROLE candidate_application_reader_role");
        await assert.rejects(
          permissionClient.query("SELECT 1 FROM candidate_authority.candidate_episode_ingest_outbox LIMIT 1"),
          (error) => typeof error === "object" && error !== null && "code" in error
            && error.code === "42501",
        );
        await permissionClient.query("RESET ROLE");
      } finally {
        permissionClient.release();
      }
    } finally {
      await reader.end();
    }
  } finally {
    await admin.query(`REVOKE candidate_application_reader_role FROM ${readerLogin}`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${readerLogin}`).catch(() => undefined);
    await admin.end();
  }
});
