import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import {
  CandidateEpisodeService,
  type OpenOrRefreshEpisodeCommand,
} from "./candidate-episode-service";
import {
  CandidateCheckpointExecutor,
  CandidateCheckpointScheduler,
  type CandidateCheckpointClaim,
  type PrevalidatedEvidenceGradeV1Outcome,
} from "./checkpoint-outcome-service";
import { assertRehearsalDatabaseTarget } from "./database-safety";
import { CandidateOutboxService } from "./outbox-service";
import { createPostgresTransactionAdapter } from "./transaction-adapter";

const rehearsalUrl = process.env.WP_G0_2_REHEARSAL_DATABASE_URL;
const integrationTest = rehearsalUrl ? test : test.skip;

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function iso(time: number) {
  return new Date(time).toISOString();
}

function databaseCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

async function expectDatabaseRejection(work: () => Promise<unknown>, codes?: string[]) {
  await assert.rejects(work, (error) => {
    const code = databaseCode(error);
    return codes ? Boolean(code && codes.includes(code)) : Boolean(code);
  });
}

function recordedOutcome(
  claim: CandidateCheckpointClaim,
  recordedAt: string,
  contentSeed: string,
  observationPrice = 100,
): PrevalidatedEvidenceGradeV1Outcome {
  return {
    evidenceGradeVersion: "eg.v1",
    status: "recorded",
    contentHash: sha256(contentSeed),
    observationPrice,
    observationPriceFactId: "synthetic:observation:1",
    windowStart: claim.windowStart,
    windowEnd: claim.windowEnd,
    historicalSource: "synthetic-rehearsal-candles",
    historicalInstrumentId: "synthetic:instrument:1",
    candleInterval: "1m",
    expectedCandles: 60,
    actualCandles: 60,
    missingCandles: 0,
    duplicateCandles: 0,
    coverageRatio: 1,
    candleSetHash: sha256(`${contentSeed}:candles`),
    mfe: 0.12,
    mae: -0.03,
    returnAtClose: 0.08,
    evidenceGrade: true,
    evidenceGradeReasons: [],
    validatedAt: recordedAt,
    releaseId: "wp-g0.2-rehearsal",
    runnerVersion: "candidate-outcome-runner.v1",
    recordedAt,
  };
}

function unavailableOutcome(
  claim: CandidateCheckpointClaim,
  recordedAt: string,
  contentSeed: string,
): PrevalidatedEvidenceGradeV1Outcome {
  return {
    evidenceGradeVersion: "eg.v1",
    status: "data_unavailable",
    contentHash: sha256(contentSeed),
    observationPrice: null,
    observationPriceFactId: null,
    windowStart: claim.windowStart,
    windowEnd: claim.windowEnd,
    historicalSource: null,
    historicalInstrumentId: null,
    candleInterval: null,
    expectedCandles: null,
    actualCandles: null,
    missingCandles: null,
    duplicateCandles: null,
    coverageRatio: null,
    candleSetHash: null,
    mfe: null,
    mae: null,
    returnAtClose: null,
    evidenceGrade: false,
    evidenceGradeReasons: ["historical_source_unavailable"],
    validatedAt: recordedAt,
    releaseId: "wp-g0.2-rehearsal",
    runnerVersion: "candidate-outcome-runner.v1",
    recordedAt,
  };
}

integrationTest("isolated PostgreSQL enforces the authoritative Candidate lifecycle", async () => {
  const target = assertRehearsalDatabaseTarget({ environment: "rehearsal", env: process.env });
  assert.match(target.databaseName, /^wp_g0_2_rehearsal_/);
  assert.equal(target.hostClass, "local");

  const pool = new Pool({ connectionString: rehearsalUrl, max: 12 });
  const transactions = createPostgresTransactionAdapter(pool);
  const episodes = new CandidateEpisodeService(transactions);
  const scheduler = new CandidateCheckpointScheduler(transactions);
  const executor = new CandidateCheckpointExecutor(transactions);
  const outbox = new CandidateOutboxService(transactions);
  const wallClock = Date.now();
  const observationTime = wallClock - 2 * 60 * 60 * 1_000;
  const claimClock = wallClock - 5 * 60 * 1_000;
  const suffix = `${process.pid}-${wallClock}`;
  const instrument = `synthetic:BTC-USDT:${suffix}`;
  const baseCommand: OpenOrRefreshEpisodeCommand = {
    scope: "production_radar",
    canonicalInstrumentId: instrument,
    venueContext: { fixture: true, venue: "synthetic" },
    firstSeenAt: iso(observationTime),
    lastSeenAt: iso(observationTime + 1_000),
    observationPrice: "100",
    observationPriceFactId: `synthetic:fact:${suffix}`,
    discoveryReasons: ["synthetic_rehearsal"],
    priorityTier: "P2",
    maturity: "light_candidate",
    directionState: "long",
    expiresAt: iso(wallClock + 24 * 60 * 60 * 1_000),
    releaseId: "wp-g0.2-rehearsal",
    sourceScanCycleId: `synthetic-cycle:${suffix}`,
    runtimeId: "rehearsal-writer-a",
    idempotencyKey: `episode:open:${suffix}`,
  };

  try {
    const opened = await episodes.openOrRefreshEpisode(baseCommand);
    assert.equal(opened.created, true);

    const retried = await episodes.openOrRefreshEpisode(baseCommand);
    assert.equal(retried.episodeId, opened.episodeId);
    assert.equal(retried.created, false);

    await expectDatabaseRejection(
      () => episodes.openOrRefreshEpisode({ ...baseCommand, priorityTier: "P1" }),
      ["23505"],
    );

    const concurrentInstrument = `${instrument}:concurrent`;
    const concurrentBase = {
      ...baseCommand,
      canonicalInstrumentId: concurrentInstrument,
      observationPriceFactId: `synthetic:fact:${suffix}:concurrent`,
    };
    const concurrent = await Promise.all([
      episodes.openOrRefreshEpisode({
        ...concurrentBase,
        idempotencyKey: `episode:concurrent:a:${suffix}`,
        runtimeId: "rehearsal-writer-a",
      }),
      episodes.openOrRefreshEpisode({
        ...concurrentBase,
        idempotencyKey: `episode:concurrent:b:${suffix}`,
        runtimeId: "rehearsal-writer-b",
      }),
    ]);
    assert.equal(concurrent.filter((result) => result.created).length, 1);
    const activeCount = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM candidate_authority.candidate_episodes
       WHERE scope = 'production_radar' AND canonical_instrument_id = $1 AND closed_at IS NULL`,
      [concurrentInstrument],
    );
    assert.equal(activeCount.rows[0]?.count, "1");

    const selfCycleId = randomUUID();
    await expectDatabaseRejection(
      () => pool.query(
        `INSERT INTO candidate_authority.candidate_episodes (
           schema_version, scope, episode_id, canonical_instrument_id, venue_context,
           first_seen_at, last_seen_at, discovery_reasons, priority_tier, lifecycle,
           maturity, direction_state, parent_episode_id, release_id, source_scan_cycle_id,
           created_by_runtime_id, idempotency_key, row_version
         ) VALUES (
           'candidate-episode.v1', 'production_radar', $1, $2, '{}'::jsonb,
           $3, $3, '{}', 'P3', 'discovered', 'light_candidate', 'unknown',
           $1, 'wp-g0.2-rehearsal', $4, 'rehearsal-writer-a', $5, 1
         )`,
        [
          selfCycleId,
          `${instrument}:self-cycle`,
          iso(wallClock - 60 * 60 * 1_000),
          `synthetic-cycle:${suffix}:self-cycle`,
          `episode:self-cycle:${suffix}`,
        ],
      ),
      ["23503", "23514"],
    );

    await expectDatabaseRejection(
      () => pool.query(
        `UPDATE candidate_authority.candidate_episodes
         SET first_seen_at = first_seen_at - interval '1 minute', row_version = row_version + 1
         WHERE scope = 'production_radar' AND episode_id = $1`,
        [opened.episodeId],
      ),
      ["55000"],
    );
    await expectDatabaseRejection(
      () => pool.query(
        `UPDATE candidate_authority.candidate_episodes
         SET observation_price_fact_id = 'synthetic:mutated', row_version = row_version + 1
         WHERE scope = 'production_radar' AND episode_id = $1`,
        [opened.episodeId],
      ),
      ["55000"],
    );
    await expectDatabaseRejection(
      () => pool.query(
        `INSERT INTO candidate_authority.candidate_episodes (
           schema_version, scope, episode_id, canonical_instrument_id, venue_context,
           first_seen_at, last_seen_at, observation_price, observation_price_fact_id,
           discovery_reasons, priority_tier, lifecycle, maturity, direction_state,
           expires_at, release_id, source_scan_cycle_id, created_by_runtime_id,
           idempotency_key, row_version
         )
         SELECT schema_version, scope, $2, canonical_instrument_id, venue_context,
           first_seen_at, last_seen_at, observation_price, observation_price_fact_id,
           discovery_reasons, priority_tier, lifecycle, maturity, direction_state,
           expires_at, release_id, source_scan_cycle_id, created_by_runtime_id,
           $3, 1
         FROM candidate_authority.candidate_episodes
         WHERE scope = 'production_radar' AND episode_id = $1`,
        [opened.episodeId, randomUUID(), `episode:direct-duplicate:${suffix}`],
      ),
      ["23505"],
    );

    const closeTime = iso(wallClock - 90 * 60 * 1_000);
    const closed = await episodes.closeEpisode({
      scope: "production_radar",
      episodeId: opened.episodeId,
      canonicalInstrumentId: instrument,
      closedAt: closeTime,
      closedReason: "direction_reversed",
      releaseId: "wp-g0.2-rehearsal",
      runtimeId: "rehearsal-writer-a",
      idempotencyKey: `episode:close:${suffix}`,
    });
    const closedRetry = await episodes.closeEpisode({
      scope: "production_radar",
      episodeId: opened.episodeId,
      canonicalInstrumentId: instrument,
      closedAt: closeTime,
      closedReason: "direction_reversed",
      releaseId: "wp-g0.2-rehearsal",
      runtimeId: "rehearsal-writer-a",
      idempotencyKey: `episode:close:${suffix}`,
    });
    assert.deepEqual(closedRetry, closed);

    const replacementCommand: OpenOrRefreshEpisodeCommand = {
      ...baseCommand,
      firstSeenAt: iso(wallClock - 80 * 60 * 1_000),
      lastSeenAt: iso(wallClock - 79 * 60 * 1_000),
      observationPrice: "101",
      observationPriceFactId: `synthetic:fact:${suffix}:retrigger`,
      sourceScanCycleId: `synthetic-cycle:${suffix}:retrigger`,
      idempotencyKey: `episode:retrigger:${suffix}`,
    };
    const replacement = await episodes.openOrRefreshEpisode(replacementCommand);
    assert.equal(replacement.created, true);
    assert.notEqual(replacement.episodeId, opened.episodeId);
    const replacementRow = await pool.query<{ parent_episode_id: string }>(
      `SELECT parent_episode_id FROM candidate_authority.candidate_episodes
       WHERE scope = 'production_radar' AND episode_id = $1`,
      [replacement.episodeId],
    );
    assert.equal(replacementRow.rows[0]?.parent_episode_id, opened.episodeId);

    const reversalCloseTime = iso(wallClock - 75 * 60 * 1_000);
    const reversal = await episodes.reverseDirectionEpisode({
      scope: "production_radar",
      episodeId: replacement.episodeId,
      canonicalInstrumentId: instrument,
      previousDirectionState: "long",
      closedAt: reversalCloseTime,
      closeIdempotencyKey: `episode:reverse-close:${suffix}`,
      replacement: {
        ...replacementCommand,
        firstSeenAt: iso(wallClock - 70 * 60 * 1_000),
        lastSeenAt: iso(wallClock - 69 * 60 * 1_000),
        observationPrice: "99",
        observationPriceFactId: `synthetic:fact:${suffix}:short`,
        directionState: "short",
        sourceScanCycleId: `synthetic-cycle:${suffix}:short`,
        idempotencyKey: `episode:reverse-open:${suffix}`,
      },
    });
    assert.notEqual(reversal.opened.episodeId, replacement.episodeId);
    const lineage = await pool.query<{ parent_episode_id: string; closed_reason: string | null }>(
      `SELECT child.parent_episode_id, parent.closed_reason
       FROM candidate_authority.candidate_episodes child
       JOIN candidate_authority.candidate_episodes parent
         ON parent.scope = child.scope AND parent.episode_id = child.parent_episode_id
       WHERE child.scope = 'production_radar' AND child.episode_id = $1`,
      [reversal.opened.episodeId],
    );
    assert.deepEqual(lineage.rows[0], {
      parent_episode_id: replacement.episodeId,
      closed_reason: "direction_reversed",
    });

    await expectDatabaseRejection(
      () => pool.query(
        `INSERT INTO candidate_authority.candidate_episodes (
           schema_version, scope, episode_id, canonical_instrument_id, venue_context,
           first_seen_at, last_seen_at, discovery_reasons, priority_tier, lifecycle,
           maturity, direction_state, parent_episode_id, release_id, source_scan_cycle_id,
           created_by_runtime_id, idempotency_key, row_version
         ) VALUES (
           'candidate-episode.v1', 'production_radar', $1, $2, '{}'::jsonb,
           $3, $3, '{}', 'P3', 'discovered', 'light_candidate', 'unknown',
           $4, 'wp-g0.2-rehearsal', $5, 'rehearsal-writer-a', $6, 1
         )`,
        [
          randomUUID(),
          `${instrument}:cross-parent`,
          iso(wallClock - 60 * 60 * 1_000),
          opened.episodeId,
          `synthetic-cycle:${suffix}:cross-parent`,
          `episode:cross-parent:${suffix}`,
        ],
      ),
      ["23514"],
    );

    const sourceEvent = await pool.query<{ event_id: string }>(
      `SELECT event_id FROM candidate_authority.candidate_episode_events
       WHERE scope = 'production_radar' AND episode_id = $1
       ORDER BY stream_version DESC LIMIT 1`,
      [reversal.opened.episodeId],
    );
    const active = await episodes.getActiveEpisode({
      scope: "production_radar",
      canonicalInstrumentId: instrument,
    });
    assert.equal(active?.episodeId, reversal.opened.episodeId);
    const scheduled = await scheduler.scheduleForObservation({
      scope: "production_radar",
      episodeId: reversal.opened.episodeId,
      sourceEventId: sourceEvent.rows[0]!.event_id,
      observedAt: active!.firstSeenAt,
      releaseId: "wp-g0.2-rehearsal",
      runtimeId: "rehearsal-scheduler",
    });
    assert.deepEqual(scheduled.map((item) => item.checkpointKind), ["1h", "4h", "24h"]);
    assert.equal(scheduled.every((item) => item.created), true);
    const scheduledRetry = await scheduler.scheduleForObservation({
      scope: "production_radar",
      episodeId: reversal.opened.episodeId,
      sourceEventId: sourceEvent.rows[0]!.event_id,
      observedAt: active!.firstSeenAt,
      releaseId: "wp-g0.2-rehearsal",
      runtimeId: "rehearsal-scheduler",
    });
    assert.equal(scheduledRetry.every((item) => !item.created), true);

    const targetCheckpointId = scheduled.find(
      (item) => item.checkpointKind === "1h",
    )!.checkpointId;
    const [claimsA, claimsB] = await Promise.all([
      executor.claimDue({
        scope: "production_radar",
        runtimeId: "rehearsal-executor-a",
        now: iso(claimClock),
        limit: 100,
      }),
      executor.claimDue({
        scope: "production_radar",
        runtimeId: "rehearsal-executor-b",
        now: iso(claimClock),
        limit: 100,
      }),
    ]);
    const firstClaims = [...claimsA, ...claimsB].filter(
      (claim) => claim.checkpointId === targetCheckpointId,
    );
    assert.equal(firstClaims.length, 1);
    const firstClaim = firstClaims[0]!;

    await executor.retry(firstClaim, {
      now: iso(claimClock + 60_000),
      errorClass: "synthetic_transient_source",
      errorMessageRedacted: "synthetic rehearsal retry",
    });
    const afterRetry = await pool.query<{ outcomes: string; status: string }>(
      `SELECT checkpoint.status,
              (SELECT count(*)::text FROM candidate_authority.candidate_episode_outcomes outcome
               WHERE outcome.scope = checkpoint.scope AND outcome.checkpoint_id = checkpoint.checkpoint_id) AS outcomes
       FROM candidate_authority.candidate_episode_checkpoints checkpoint
       WHERE checkpoint.scope = 'production_radar' AND checkpoint.checkpoint_id = $1`,
      [firstClaim.checkpointId],
    );
    assert.deepEqual(afterRetry.rows[0], { status: "retry_wait", outcomes: "0" });

    const secondClaim = (await executor.claimDue({
      scope: "production_radar",
      runtimeId: "rehearsal-executor-c",
      now: iso(claimClock + 3 * 60_000),
      limit: 100,
    })).find((claim) => claim.checkpointId === targetCheckpointId)!;
    assert.ok(secondClaim.fencingToken > firstClaim.fencingToken);
    const takeoverClaim = (await executor.claimDue({
      scope: "production_radar",
      runtimeId: "rehearsal-executor-d",
      now: iso(claimClock + 9 * 60_000),
      limit: 100,
    })).find((claim) => claim.checkpointId === targetCheckpointId)!;
    assert.equal(takeoverClaim.checkpointId, secondClaim.checkpointId);
    assert.ok(takeoverClaim.fencingToken > secondClaim.fencingToken);

    const staleOutcomeTime = iso(claimClock + 7 * 60_000);
    const outcomeTime = iso(claimClock + 9 * 60_000);
    await expectDatabaseRejection(
      () => executor.recordOutcome(
        secondClaim,
        recordedOutcome(secondClaim, staleOutcomeTime, `${suffix}:stale`),
      ),
      ["40001"],
    );
    const outcome = await executor.recordOutcome(
      takeoverClaim,
      recordedOutcome(takeoverClaim, outcomeTime, `${suffix}:recorded`),
    );
    const duplicateOutcome = await executor.recordOutcome(
      takeoverClaim,
      recordedOutcome(takeoverClaim, outcomeTime, `${suffix}:recorded`),
    );
    assert.equal(duplicateOutcome.outcomeId, outcome.outcomeId);
    await expectDatabaseRejection(
      () => executor.recordOutcome(
        takeoverClaim,
        recordedOutcome(takeoverClaim, outcomeTime, `${suffix}:conflict`),
      ),
      ["23505"],
    );
    await expectDatabaseRejection(
      () => pool.query(
        `UPDATE candidate_authority.candidate_episode_outcomes
         SET mfe = 0 WHERE scope = 'production_radar' AND outcome_id = $1`,
        [outcome.outcomeId],
      ),
      ["55000"],
    );

    const unavailableInstrument = `${instrument}:unavailable`;
    const unavailableEpisode = await episodes.openOrRefreshEpisode({
      ...baseCommand,
      canonicalInstrumentId: unavailableInstrument,
      observationPriceFactId: `synthetic:fact:${suffix}:unavailable`,
      idempotencyKey: `episode:unavailable:${suffix}`,
      sourceScanCycleId: `synthetic-cycle:${suffix}:unavailable`,
    });
    const unavailableEvent = await pool.query<{ event_id: string }>(
      `SELECT event_id FROM candidate_authority.candidate_episode_events
       WHERE scope = 'production_radar' AND episode_id = $1 ORDER BY stream_version DESC LIMIT 1`,
      [unavailableEpisode.episodeId],
    );
    const unavailableScheduled = await scheduler.scheduleForObservation({
      scope: "production_radar",
      episodeId: unavailableEpisode.episodeId,
      sourceEventId: unavailableEvent.rows[0]!.event_id,
      observedAt: baseCommand.firstSeenAt,
      releaseId: "wp-g0.2-rehearsal",
      runtimeId: "rehearsal-scheduler",
    });
    const unavailableTargetId = unavailableScheduled.find(
      (item) => item.checkpointKind === "1h",
    )!.checkpointId;
    const unavailableClaim = (await executor.claimDue({
      scope: "production_radar",
      runtimeId: "rehearsal-executor-unavailable",
      now: iso(claimClock),
      limit: 100,
    })).find((claim) => claim.checkpointId === unavailableTargetId)!;
    await expectDatabaseRejection(
      () => executor.recordOutcome(
        unavailableClaim,
        recordedOutcome(unavailableClaim, iso(claimClock), `${suffix}:zero-price`, 0),
      ),
      ["23514"],
    );
    const unavailable = await executor.recordOutcome(
      unavailableClaim,
      unavailableOutcome(unavailableClaim, iso(claimClock), `${suffix}:unavailable`),
    );
    const unavailableRow = await pool.query<{ mae: string | null; mfe: string | null; status: string }>(
      `SELECT status, mfe, mae FROM candidate_authority.candidate_episode_outcomes
       WHERE scope = 'production_radar' AND outcome_id = $1`,
      [unavailable.outcomeId],
    );
    assert.deepEqual(unavailableRow.rows[0], {
      status: "data_unavailable",
      mfe: null,
      mae: null,
    });

    const eventsAndOutbox = await pool.query<{ events: string; outbox: string }>(
      `SELECT
         (SELECT count(*)::text FROM candidate_authority.candidate_episode_events
          WHERE scope = 'production_radar' AND episode_id = $1) AS events,
         (SELECT count(*)::text FROM candidate_authority.candidate_episode_ingest_outbox outbox
          JOIN candidate_authority.candidate_episode_events event
            ON event.scope = outbox.scope AND event.event_id = outbox.outbox_id
          WHERE event.scope = 'production_radar' AND event.episode_id = $1) AS outbox`,
      [opened.episodeId],
    );
    assert.equal(eventsAndOutbox.rows[0]?.events, eventsAndOutbox.rows[0]?.outbox);

    const rollbackId = `synthetic-rollback-${suffix}`;
    await assert.rejects(
      transactions.withTransaction({ isolation: "serializable" }, async (tx) => {
        await tx.query(
          `INSERT INTO candidate_authority.candidate_migration_control (
             migration_id, phase, epoch, started_at, deadline_at, write_frozen,
             approved_release_id, approval_digest, updated_at
           ) VALUES ($1, 'legacy', 1, $2, $3, false, 'wp-g0.2-rehearsal', $4, $2)`,
          [rollbackId, iso(wallClock), iso(wallClock + 60 * 60 * 1_000), sha256(rollbackId)],
        );
        throw new Error("synthetic transaction crash");
      }),
      /synthetic transaction crash/,
    );
    const rollbackCount = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM candidate_authority.candidate_migration_control
       WHERE migration_id = $1`,
      [rollbackId],
    );
    assert.equal(rollbackCount.rows[0]?.count, "0");

    const controlId = `synthetic-authority-${suffix}`;
    const controlStartedAt = wallClock;
    const controlDeadlineAt = wallClock + 72 * 60 * 60 * 1_000;
    await pool.query(
      `INSERT INTO candidate_authority.candidate_migration_control (
         migration_id, phase, epoch, started_at, deadline_at, write_frozen,
         approved_release_id, approval_digest, updated_at
       ) VALUES ($1, 'legacy', 1, $2, $3, false, 'wp-g0.2-rehearsal', $4, $2)`,
      [controlId, iso(controlStartedAt), iso(controlDeadlineAt), sha256(controlId)],
    );
    const transitioned = await pool.query<{ epoch: string; phase: string }>(
      `SELECT epoch::text, phase
       FROM candidate_authority.transition_migration_control_v1(
         $1, 1, 'shadow_capture', false, 'wp-g0.2-rehearsal', $2, $3
       )`,
      [controlId, sha256(`${controlId}:transition`), iso(controlStartedAt + 60_000)],
    );
    assert.deepEqual(transitioned.rows[0], { epoch: "2", phase: "shadow_capture" });
    await expectDatabaseRejection(
      () => pool.query(
        `SELECT * FROM candidate_authority.transition_migration_control_v1(
           $1, 1, 'shadow_verify', false, 'wp-g0.2-rehearsal', $2, $3
         )`,
        [controlId, sha256(`${controlId}:stale`), iso(controlStartedAt + 120_000)],
      ),
      ["40001"],
    );
    await expectDatabaseRejection(
      () => pool.query(
        `UPDATE candidate_authority.candidate_migration_control
         SET deadline_at = deadline_at + interval '1 hour', epoch = epoch + 1,
             updated_at = updated_at + interval '1 minute'
         WHERE migration_id = $1`,
        [controlId],
      ),
      ["55000"],
    );
    await expectDatabaseRejection(
      () => pool.query(
        `SELECT * FROM candidate_authority.transition_migration_control_v1(
           $1, 2, 'shadow_verify', false, 'wp-g0.2-rehearsal', $2, $3
         )`,
        [controlId, sha256(`${controlId}:expired`), iso(controlDeadlineAt + 1)],
      ),
      ["55000"],
    );

    await expectDatabaseRejection(
      () => scheduler.scheduleForObservation({
        scope: "production_radar",
        episodeId: reversal.opened.episodeId,
        sourceEventId: sourceEvent.rows[0]!.event_id,
        observedAt: iso(wallClock + 10 * 60 * 1_000),
        releaseId: "wp-g0.2-rehearsal",
        runtimeId: "rehearsal-scheduler-future",
      }),
      ["23505"],
    );

    const futureEpisode = await episodes.openOrRefreshEpisode({
      ...baseCommand,
      canonicalInstrumentId: `${instrument}:future-window`,
      observationPriceFactId: `synthetic:fact:${suffix}:future-window`,
      idempotencyKey: `episode:future-window:${suffix}`,
      sourceScanCycleId: `synthetic-cycle:${suffix}:future-window`,
    });
    const futureEvent = await pool.query<{ event_id: string }>(
      `SELECT event_id FROM candidate_authority.candidate_episode_events
       WHERE scope = 'production_radar' AND episode_id = $1 ORDER BY stream_version DESC LIMIT 1`,
      [futureEpisode.episodeId],
    );
    await expectDatabaseRejection(
      () => scheduler.scheduleForObservation({
        scope: "production_radar",
        episodeId: futureEpisode.episodeId,
        sourceEventId: futureEvent.rows[0]!.event_id,
        observedAt: iso(wallClock + 10 * 60 * 1_000),
        releaseId: "wp-g0.2-rehearsal",
        runtimeId: "rehearsal-scheduler-future",
      }),
      ["22007"],
    );

    const outboxClaims = await outbox.claimDue({
      scope: "production_radar",
      runtimeId: "rehearsal-outbox-a",
      now: iso(wallClock),
      limit: 100,
      migrationId: controlId,
      authorityEpoch: 2,
    });
    const targetOutboxClaim = outboxClaims.find(
      (claim) => claim.outboxId === futureEvent.rows[0]!.event_id,
    );
    const retryOutboxClaim = outboxClaims.find(
      (claim) => claim.outboxId !== futureEvent.rows[0]!.event_id,
    );
    assert.ok(targetOutboxClaim);
    assert.ok(retryOutboxClaim);
    const retryResult = await outbox.retry(retryOutboxClaim, {
      now: iso(wallClock + 60_000),
      nextAttemptAt: iso(wallClock + 120_000),
    });
    assert.equal(retryResult.status, "retry_wait");

    const nextEpoch = await pool.query<{ epoch: string; phase: string }>(
      `SELECT epoch::text, phase
       FROM candidate_authority.transition_migration_control_v1(
         $1, 2, 'shadow_verify', false, 'wp-g0.2-rehearsal', $2, $3
       )`,
      [controlId, sha256(`${controlId}:shadow-verify`), iso(controlStartedAt + 180_000)],
    );
    assert.deepEqual(nextEpoch.rows[0], { epoch: "3", phase: "shadow_verify" });
    await expectDatabaseRejection(
      () => outbox.complete(targetOutboxClaim, { now: iso(wallClock + 240_000) }),
      ["40001"],
    );
    const takeoverOutboxClaim = (await outbox.claimDue({
      scope: "production_radar",
      runtimeId: "rehearsal-outbox-b",
      now: iso(wallClock + 6 * 60_000),
      limit: 100,
      migrationId: controlId,
      authorityEpoch: 3,
    })).find((claim) => claim.outboxId === targetOutboxClaim.outboxId);
    assert.ok(takeoverOutboxClaim);
    assert.ok(takeoverOutboxClaim.fencingToken > targetOutboxClaim.fencingToken);
    const completedOutbox = await outbox.complete(takeoverOutboxClaim, {
      now: iso(wallClock + 6 * 60_000),
    });
    assert.equal(completedOutbox.status, "completed");
    const duplicateCompletion = await outbox.complete(takeoverOutboxClaim, {
      now: iso(wallClock + 6 * 60_000),
    });
    assert.deepEqual(duplicateCompletion, completedOutbox);
    await expectDatabaseRejection(
      () => outbox.complete({
        ...takeoverOutboxClaim,
        payloadHash: sha256(`${suffix}:wrong-outbox-payload`),
      }, { now: iso(wallClock + 6 * 60_000) }),
      ["23505"],
    );
    await expectDatabaseRejection(
      () => pool.query(
        `UPDATE candidate_authority.candidate_episode_ingest_outbox
         SET payload = '{"mutated":true}'::jsonb
         WHERE scope = 'production_radar' AND outbox_id = $1`,
        [targetOutboxClaim.outboxId],
      ),
      ["55000"],
    );
  } finally {
    await pool.end();
  }
});
