import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { CandidateCanonicalReadModel } from "./canonical-read-model";
import { assertRehearsalDatabaseTarget } from "./database-safety";
import { createPostgresTransactionAdapter } from "./transaction-adapter";

const rehearsalUrl = process.env.WP_G0_2_CANONICAL_READ_REHEARSAL_DATABASE_URL;
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

integrationTest("isolated PostgreSQL 16 proves canonical read truth and least privilege", async () => {
  const target = assertRehearsalDatabaseTarget({ environment: "rehearsal", env: {
    ...process.env,
    WP_G0_2_REHEARSAL_DATABASE_URL: rehearsalUrl,
  } });
  assert.match(target.databaseName, /^wp_g0_2_rehearsal_/);
  assert.equal(target.hostClass, "local");

  const admin = new Pool({ connectionString: rehearsalUrl, max: 4 });
  const suffix = `${process.pid}_${Date.now()}`;
  const readerLogin = `market_radar_candidate_reader_${suffix}`.slice(0, 62);
  const episodeId = randomUUID();
  const eventId = randomUUID();
  const checkpointRecorded = randomUUID();
  const checkpointUnavailable = randomUUID();
  const checkpointPending = randomUUID();
  const now = Date.now();
  const observedAt = now - 6 * 60 * 60 * 1_000;
  const policyFor = (checkpointKind: "1h" | "4h") => ({
    scope: "production_radar" as const,
    asOf: iso(now),
    releaseId: "candidate-shadow-canonical-read-rehearsal",
    checkpointKind,
    evidenceGradeVersion: "eg.v1" as const,
    observationCohort: {
      from: iso(observedAt - 60_000),
      toExclusive: iso(observedAt + 10 * 60_000),
    },
    dueCohort: {
      from: iso(observedAt),
      toExclusive: iso(now),
    },
  });

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
      'candidate-episode.v1','production_radar',$1,'BINANCE:NULLUSDT:PERP',
      '{"venue":"BINANCE","contractType":"perpetual"}'::jsonb,$2,$3,NULL,NULL,
      ARRAY['light_scan_candidate'],'A','discovered','light_candidate','unknown',
      NULL,'candidate-shadow-canonical-read-rehearsal','scan-null-1',
      'candidate-shadow:canonical-read-rehearsal','canonical-read-episode',1
    )`, [episodeId, iso(observedAt), iso(observedAt + 5 * 60_000)]);
    await admin.query(`INSERT INTO candidate_authority.candidate_episode_events (
      event_id, scope, episode_id, stream_version, event_type, event_time,
      source_fact_ids, source_scan_cycle_id, release_id, runtime_id,
      idempotency_key, command_hash, payload_version, payload
    ) VALUES (
      $1,'production_radar',$2,1,'DISCOVERED',$3,'{}','scan-null-1',
      'candidate-shadow-canonical-read-rehearsal','canonical-read-rehearsal',
      'canonical-read-event','sha256:' || repeat('a',64),'candidate-event.v1',
      '{"eventType":"DISCOVERED","canonicalInstrumentId":"BINANCE:NULLUSDT:PERP"}'::jsonb
    )`, [eventId, episodeId, iso(observedAt)]);
    await admin.query(`INSERT INTO candidate_authority.candidate_episode_checkpoints (
      schema_version, checkpoint_id, scope, episode_id, source_event_id,
      checkpoint_kind, due_at, window_start, window_end, finalize_by,
      retry_policy_version, status, release_id
    ) VALUES
      ('candidate-checkpoint.v1',$1,'production_radar',$4,$5,'1h',$6,$7,$6,$8,
       'checkpoint-retry.v1','completed','candidate-shadow-canonical-read-rehearsal'),
      ('candidate-checkpoint.v1',$2,'production_radar',$4,$5,'4h',$9,$7,$9,$10,
       'checkpoint-retry.v1','completed','candidate-shadow-canonical-read-rehearsal'),
      ('candidate-checkpoint.v1',$3,'production_radar',$4,$5,'24h',$11,$7,$11,$12,
       'checkpoint-retry.v1','pending','candidate-shadow-canonical-read-rehearsal')`, [
      checkpointRecorded,
      checkpointUnavailable,
      checkpointPending,
      episodeId,
      eventId,
      iso(observedAt + 60 * 60_000),
      iso(observedAt),
      iso(observedAt + 2 * 60 * 60_000),
      iso(observedAt + 4 * 60 * 60_000),
      iso(observedAt + 5 * 60 * 60_000),
      iso(observedAt + 24 * 60 * 60_000),
      iso(observedAt + 25 * 60 * 60_000),
    ]);
    await admin.query(`INSERT INTO candidate_authority.candidate_episode_outcomes (
      schema_version, outcome_id, scope, checkpoint_id, episode_id, source_event_id,
      checkpoint_kind, status, content_hash, observation_price, observation_price_fact_id,
      window_start, window_end, historical_source, historical_instrument_id,
      candle_interval, expected_candles, actual_candles, missing_candles,
      duplicate_candles, coverage_ratio, candle_set_hash, mfe, mae, return_at_close,
      evidence_grade, evidence_grade_version, evidence_grade_reasons,
      validated_at, release_id, runner_version, recorded_at
    ) VALUES
      ('candidate-outcome.v1',$1,'production_radar',$3,$5,$6,'1h','recorded',
       'sha256:' || repeat('b',64),100,'fact:recorded',$7,$8,'rehearsal-candles',
       'BINANCE:NULLUSDT:PERP','1m',60,60,0,0,1,
       'sha256:' || repeat('c',64),0.12,-0.03,0.08,true,'eg.v1','{}',$9,
       'candidate-shadow-canonical-read-rehearsal','candidate-read-rehearsal.v1',$9),
      ('candidate-outcome.v1',$2,'production_radar',$4,$5,$6,'4h','data_unavailable',
       'sha256:' || repeat('d',64),NULL,NULL,$7,$10,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
       NULL,NULL,NULL,NULL,false,'eg.v1',ARRAY['historical_source_unavailable'],$11,
       'candidate-shadow-canonical-read-rehearsal','candidate-read-rehearsal.v1',$11)`, [
      randomUUID(),
      randomUUID(),
      checkpointRecorded,
      checkpointUnavailable,
      episodeId,
      eventId,
      iso(observedAt),
      iso(observedAt + 60 * 60_000),
      iso(observedAt + 2 * 60 * 60_000),
      iso(observedAt + 4 * 60 * 60_000),
      iso(observedAt + 5 * 60 * 60_000),
    ]);

    const reader = new Pool({
      connectionString: connectionForLogin(rehearsalUrl as string, readerLogin),
      max: 2,
    });
    try {
      const transactions = createPostgresTransactionAdapter(reader, {
        role: "candidate_application_reader_role",
      });
      const result = await new CandidateCanonicalReadModel(transactions).read({
        policy: policyFor("1h"),
        limit: 10,
      });
      assert.equal(result.status, "ready");
      if (result.status !== "ready") return;
      assert.equal(result.episodes.length, 1);
      assert.equal(result.episodes[0]?.directionState, "unknown");
      assert.equal(result.episodes[0]?.observationPrice, null);
      assert.equal(result.review.counts.totalEpisodes, 1);
      assert.equal(result.review.counts.scheduledCheckpoints, 1);
      assert.equal(result.review.counts.completedCheckpoints, 1);
      assert.equal(result.review.counts.terminalOutcomes, 1);
      assert.equal(result.review.counts.evidenceGradeOutcomes, 1);
      assert.equal(result.review.counts.dataUnavailableOutcomes, 0);
      assert.equal(result.review.metricAverages.mfe, 0.12);
      assert.equal(result.review.metricAverages.mae, -0.03);
      assert.deepEqual(result.review.metricAdmission.excludedReasons, {});
      assert.equal(result.review.rates.outcomeCompletion.percentage, 100);

      const unavailableResult = await new CandidateCanonicalReadModel(transactions).read({
        policy: policyFor("4h"),
        limit: 10,
      });
      assert.equal(unavailableResult.status, "ready");
      if (unavailableResult.status !== "ready") return;
      assert.equal(unavailableResult.review.counts.terminalOutcomes, 1);
      assert.equal(unavailableResult.review.counts.evidenceGradeOutcomes, 0);
      assert.equal(unavailableResult.review.counts.dataUnavailableOutcomes, 1);
      assert.equal(unavailableResult.review.metricAverages.mfe, null);
      assert.equal(unavailableResult.review.metricAverages.mae, null);
      assert.deepEqual(unavailableResult.review.metricAdmission.excludedReasons, {
        data_unavailable: 1,
      });

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
