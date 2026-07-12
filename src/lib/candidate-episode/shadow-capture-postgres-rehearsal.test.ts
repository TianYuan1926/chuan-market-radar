import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { buildPersistenceSchemaSql } from "../persistence/persistence-contract";
import { CandidateEpisodeService } from "./candidate-episode-service";
import { CandidateOutboxService } from "./outbox-service";
import { CandidateQuarantineResolutionService } from "./quarantine-resolution-service";
import { CandidateShadowCaptureConsumer } from "./shadow-capture-consumer";
import {
  CandidateShadowCaptureSourceWriter,
  hashShadowCandidatePayload,
  type PersistScanArchiveWithCandidateOutboxCommand,
  type ShadowCandidateObservationV1,
} from "./shadow-capture-source";
import { createPostgresTransactionAdapter } from "./transaction-adapter";

const rehearsalUrl = process.env.WP_G0_2_SHADOW_REHEARSAL_DATABASE_URL;
const integrationTest = rehearsalUrl ? test : test.skip;

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function dbCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : null;
}

async function rejectsCode(work: () => Promise<unknown>, code: string) {
  await assert.rejects(work, (error) => dbCode(error) === code);
}

function candidate(scanId: string, instrument: string, now: number): ShadowCandidateObservationV1 {
  return {
    schemaVersion: "shadow-candidate-observation.v1",
    canonicalInstrumentId: instrument,
    venueContext: {
      schemaVersion: "shadow-venue-context.v1",
      venue: "BINANCE",
      venueInstrumentId: instrument,
      contractType: "perpetual",
      settlementAsset: "USDT",
      resolutionStatus: "resolved",
      identityEvidenceIds: [`synthetic-identity:${instrument}`],
    },
    firstSeenAt: new Date(now - 60_000).toISOString(),
    lastSeenAt: new Date(now).toISOString(),
    observationPrice: "100",
    observationPriceFactId: `synthetic-fact:${scanId}:${instrument}`,
    discoveryReasons: ["synthetic_shadow_rehearsal"],
    priorityTier: "A",
    maturity: "deep_candidate",
    directionState: "unknown",
    expiresAt: new Date(now + 24 * 60 * 60_000).toISOString(),
    releaseId: "shadow-capture-rehearsal-v1",
    sourceScanCycleId: scanId,
  };
}

function sourceCommand(
  scanId: string,
  instrument: string,
  now: number,
): PersistScanArchiveWithCandidateOutboxCommand {
  const generatedAt = new Date(now).toISOString();
  return {
    legacyScope: "shadow_capture_rehearsal",
    candidateScope: "production_radar",
    migrationId: "candidate-episode-v1",
    authorityEpoch: 2,
    summary: {
      id: scanId,
      source: "coinglass",
      status: "ready",
      generatedAt,
      scannedCount: 24,
      anomalyCount: 1,
      candidateCount: 1,
      topSymbols: [instrument],
      notes: ["synthetic_rehearsal_only"],
    },
    replayFrame: {
      id: scanId,
      source: "coinglass",
      status: "ready",
      generatedAt,
      nextScanAt: new Date(now + 5 * 60_000).toISOString(),
      cadenceMinutes: 5,
      scannedCount: 24,
      anomalyCount: 1,
      candidateCount: 1,
      signals: [],
    },
    candidates: [candidate(scanId, instrument, now)],
  };
}

integrationTest("isolated PostgreSQL 16 proves shadow capture atomicity and failure boundaries", async () => {
  assert.match(rehearsalUrl!, /127\.0\.0\.1/);
  assert.match(rehearsalUrl!, /wp_g0_2_rehearsal_shadow_capture/);
  const pool = new Pool({ connectionString: rehearsalUrl, max: 12 });
  const transactions = createPostgresTransactionAdapter(pool);
  const outbox = new CandidateOutboxService(transactions);
  const resolutions = new CandidateQuarantineResolutionService(transactions);
  const episodes = new CandidateEpisodeService(transactions);
  const now = Date.now();
  const fixedOutboxId = "018f47d6-2c40-7e30-8a20-000000000001";
  const writer = new CandidateShadowCaptureSourceWriter(transactions, {
    generateId: () => fixedOutboxId,
  });

  try {
    await pool.query(buildPersistenceSchemaSql());
    await pool.query(
      `INSERT INTO candidate_authority.candidate_migration_control (
         migration_id, phase, epoch, started_at, deadline_at, write_frozen,
         approved_release_id, approval_digest, updated_at
       ) VALUES ($1, 'shadow_capture', 2, $2, $3, false, $4, $5, $2)`,
      [
        "candidate-episode-v1",
        new Date(now - 60_000).toISOString(),
        new Date(now + 72 * 60 * 60_000 - 60_000).toISOString(),
        "shadow-capture-rehearsal-v1",
        sha256("synthetic-approval"),
      ],
    );
    const lifecycle = await pool.query<{
      epoch: string;
      phase: string;
      duration_seconds: string;
    }>(`
      SELECT epoch::text, phase,
        extract(epoch FROM deadline_at - started_at)::bigint::text AS duration_seconds
      FROM candidate_authority.start_shadow_capture_v3($1,$2,$3)
    `, [
      "candidate-episode-start-function-v1",
      "shadow-capture-rehearsal-v1",
      sha256("start-function-approval"),
    ]);
    assert.deepEqual(lifecycle.rows[0], {
      epoch: "1",
      phase: "shadow_capture",
      duration_seconds: "259200",
    });
    await rejectsCode(
      () => pool.query(
        "SELECT * FROM candidate_authority.start_shadow_capture_v3($1,$2,$3)",
        [
          "candidate-episode-start-function-v1",
          "shadow-capture-rehearsal-v1",
          sha256("start-function-approval"),
        ],
      ),
      "55000",
    );

    const first = sourceCommand(
      "shadow-scan-atomic-1",
      "SYNTHETIC:BTCUSDT:PERPETUAL",
      now,
    );
    const persisted = await writer.persist(first);
    const repeated = await writer.persist(first);
    assert.equal(persisted.sourceInserted, true);
    assert.equal(repeated.sourceInserted, false);
    assert.equal(repeated.outbox[0]?.outboxId, fixedOutboxId);
    const exactCounts = await pool.query<{ archives: string; outbox: string }>(`
      SELECT
        (SELECT count(*)::text FROM scan_archives
         WHERE scope = 'shadow_capture_rehearsal' AND id = 'shadow-scan-atomic-1') AS archives,
        (SELECT count(*)::text FROM candidate_authority.candidate_episode_ingest_outbox
         WHERE scope = 'production_radar' AND source_type = 'legacy_scan_candidate'
           AND source_id = 'shadow-scan-atomic-1:SYNTHETIC:BTCUSDT:PERPETUAL') AS outbox
    `);
    assert.deepEqual(exactCounts.rows[0], { archives: "1", outbox: "1" });

    await assert.rejects(
      () => writer.persist({
        ...first,
        summary: { ...first.summary, notes: ["conflicting_archive_content"] },
      }),
      /scan_archive_idempotency_content_conflict/,
    );
    const conflictPayload = {
      ...first.candidates[0]!,
      discoveryReasons: ["conflicting_payload"],
    };
    await rejectsCode(
      () => pool.query(
        `SELECT * FROM candidate_authority.enqueue_shadow_candidate_outbox_v2(
          $1,$2,$3,$4,$5,$6,$7,$8,$9
        )`,
        [
          "production_radar",
          "018f47d6-2c40-7e30-8a20-000000000099",
          "shadow-scan-atomic-1:SYNTHETIC:BTCUSDT:PERPETUAL",
          first.summary.generatedAt,
          conflictPayload,
          hashShadowCandidatePayload(conflictPayload),
          "shadow-capture:shadow-scan-atomic-1:SYNTHETIC:BTCUSDT:PERPETUAL",
          "candidate-episode-v1",
          2,
        ],
      ),
      "23505",
    );

    const collision = sourceCommand(
      "shadow-scan-rollback-1",
      "SYNTHETIC:ETHUSDT:PERPETUAL",
      now + 1_000,
    );
    await rejectsCode(() => writer.persist(collision), "23505");
    const rollbackProof = await pool.query<{ archives: string; outbox: string }>(`
      SELECT
        (SELECT count(*)::text FROM scan_archives
         WHERE scope = 'shadow_capture_rehearsal' AND id = 'shadow-scan-rollback-1') AS archives,
        (SELECT count(*)::text FROM candidate_authority.candidate_episode_ingest_outbox
         WHERE source_id LIKE 'shadow-scan-rollback-1:%') AS outbox
    `);
    assert.deepEqual(rollbackProof.rows[0], { archives: "0", outbox: "0" });

    const consumer = new CandidateShadowCaptureConsumer({ outbox, episodes });
    const consumed = await consumer.runBatch({
      scope: "production_radar",
      runtimeId: "shadow-rehearsal-consumer",
      now: new Date(now + 2_000).toISOString(),
      limit: 100,
      migrationId: "candidate-episode-v1",
      authorityEpoch: 2,
    });
    assert.equal(consumed.completed, 1);
    const projectionProof = await pool.query<{
      episodes: string;
      source_completed: string;
      candidate_events_pending: string;
    }>(`
      SELECT
        (SELECT count(*)::text FROM candidate_authority.candidate_episodes
         WHERE canonical_instrument_id = 'SYNTHETIC:BTCUSDT:PERPETUAL') AS episodes,
        (SELECT count(*)::text FROM candidate_authority.candidate_episode_ingest_outbox
         WHERE source_type = 'legacy_scan_candidate' AND status = 'completed') AS source_completed,
        (SELECT count(*)::text FROM candidate_authority.candidate_episode_ingest_outbox
         WHERE source_type = 'candidate_episode_event' AND status = 'pending') AS candidate_events_pending
    `);
    assert.deepEqual(projectionProof.rows[0], {
      episodes: "1",
      source_completed: "1",
      candidate_events_pending: "1",
    });
    const sourceOnlyClaim = await outbox.claimShadowCandidates({
      scope: "production_radar",
      runtimeId: "shadow-rehearsal-filter-proof",
      now: new Date(now + 3_000).toISOString(),
      limit: 100,
      migrationId: "candidate-episode-v1",
      authorityEpoch: 2,
    });
    assert.equal(sourceOnlyClaim.length, 0);

    const retryWriter = new CandidateShadowCaptureSourceWriter(transactions, {
      generateId: () => "018f47d6-2c40-7e30-8a20-000000000002",
    });
    await retryWriter.persist(sourceCommand(
      "shadow-scan-retry-1",
      "SYNTHETIC:SOLUSDT:PERPETUAL",
      now + 4_000,
    ));
    let retryClock = now + 5_000;
    let retryClaim = (await outbox.claimShadowCandidates({
      scope: "production_radar",
      runtimeId: "shadow-rehearsal-retry",
      now: new Date(retryClock).toISOString(),
      limit: 1,
      migrationId: "candidate-episode-v1",
      authorityEpoch: 2,
    }))[0]!;
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      assert.equal(retryClaim.attemptCount, attempt);
      const decision = await outbox.retryOrQuarantine(retryClaim, {
        now: new Date(retryClock + 1_000).toISOString(),
        nextAttemptAt: new Date(retryClock + 61_000).toISOString(),
        errorClass: "synthetic_transient_failure",
        errorMessageRedacted: "synthetic transient rehearsal failure",
      });
      if (attempt === 8) {
        assert.equal(decision.status, "quarantined");
        break;
      }
      assert.equal(decision.status, "retry_wait");
      retryClock += 62_000;
      retryClaim = (await outbox.claimShadowCandidates({
        scope: "production_radar",
        runtimeId: "shadow-rehearsal-retry",
        now: new Date(retryClock).toISOString(),
        limit: 1,
        migrationId: "candidate-episode-v1",
        authorityEpoch: 2,
      }))[0]!;
    }
    const quarantineProof = await pool.query<{
      attempt_count: number;
      immutable: boolean;
      status: string;
    }>(`
      SELECT attempt_count, status, quarantined_at IS NOT NULL AS immutable
      FROM candidate_authority.candidate_episode_ingest_outbox
      WHERE outbox_id = '018f47d6-2c40-7e30-8a20-000000000002'
    `);
    assert.deepEqual(quarantineProof.rows[0], {
      attempt_count: 8,
      status: "quarantined",
      immutable: true,
    });
    await rejectsCode(
      () => pool.query(
        `UPDATE candidate_authority.candidate_episode_ingest_outbox
         SET error_class = 'changed_after_terminal'
         WHERE outbox_id = '018f47d6-2c40-7e30-8a20-000000000002'`,
      ),
      "55000",
    );
    await rejectsCode(
      () => pool.query(
        `SELECT * FROM candidate_authority.transition_migration_control_v1(
          $1,2,'shadow_verify',false,$2,$3,clock_timestamp()
        )`,
        [
          "candidate-episode-v1",
          "shadow-capture-rehearsal-v1",
          sha256("phase-advance-before-resolution"),
        ],
      ),
      "55000",
    );
    const excluded = await resolutions.resolve({
      scope: "production_radar",
      resolutionId: "018f47d6-2c40-7e30-8a20-000000000020",
      quarantinedOutboxId: "018f47d6-2c40-7e30-8a20-000000000002",
      action: "exclude_invalid_source",
      reasonCode: "synthetic_exhaustion_reviewed",
      approvalRef: "WP-G0.2/REHEARSAL-Q-001",
      approvalDigest: sha256("quarantine-exclusion-approval"),
      migrationId: "candidate-episode-v1",
      authorityEpoch: 2,
    });
    assert.equal(excluded.replacementOutboxId, null);
    const repeatedExclusion = await resolutions.resolve({
      scope: "production_radar",
      resolutionId: "018f47d6-2c40-7e30-8a20-000000000020",
      quarantinedOutboxId: "018f47d6-2c40-7e30-8a20-000000000002",
      action: "exclude_invalid_source",
      reasonCode: "synthetic_exhaustion_reviewed",
      approvalRef: "WP-G0.2/REHEARSAL-Q-001",
      approvalDigest: sha256("quarantine-exclusion-approval"),
      migrationId: "candidate-episode-v1",
      authorityEpoch: 2,
    });
    assert.equal(repeatedExclusion.resolutionId, excluded.resolutionId);
    await rejectsCode(
      () => pool.query(
        `UPDATE candidate_authority.candidate_outbox_quarantine_resolutions
         SET reason_code = 'changed_after_decision'
         WHERE resolution_id = $1`,
        [excluded.resolutionId],
      ),
      "55000",
    );
    await rejectsCode(
      () => pool.query(
        `SELECT * FROM candidate_authority.resolve_shadow_outbox_quarantine_v3(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
        )`,
        [
          "production_radar",
          "018f47d6-2c40-7e30-8a20-000000000021",
          "018f47d6-2c40-7e30-8a20-000000000002",
          "exclude_invalid_source",
          "conflicting_decision",
          "WP-G0.2/REHEARSAL-Q-002",
          sha256("conflicting-approval"),
          null,
          null,
          null,
          "candidate-episode-v1",
          2,
        ],
      ),
      "23505",
    );
    const leaseWriter = new CandidateShadowCaptureSourceWriter(transactions, {
      generateId: () => "018f47d6-2c40-7e30-8a20-000000000003",
    });
    await leaseWriter.persist(sourceCommand(
      "shadow-scan-lease-1",
      "SYNTHETIC:XRPUSDT:PERPETUAL",
      now + 21 * 60_000,
    ));
    const firstLease = (await outbox.claimShadowCandidates({
      scope: "production_radar",
      runtimeId: "shadow-lease-a",
      now: new Date(now + 21 * 60_000 + 1_000).toISOString(),
      limit: 1,
      migrationId: "candidate-episode-v1",
      authorityEpoch: 2,
    }))[0]!;
    const takeoverLease = (await outbox.claimShadowCandidates({
      scope: "production_radar",
      runtimeId: "shadow-lease-b",
      now: new Date(now + 21 * 60_000 + 302_000).toISOString(),
      limit: 1,
      migrationId: "candidate-episode-v1",
      authorityEpoch: 2,
    }))[0]!;
    assert.ok(takeoverLease.fencingToken > firstLease.fencingToken);
    await rejectsCode(
      () => outbox.complete(firstLease, {
        now: new Date(now + 21 * 60_000 + 303_000).toISOString(),
      }),
      "40001",
    );
    await outbox.quarantine(takeoverLease, {
      now: new Date(now + 21 * 60_000 + 303_000).toISOString(),
      errorClass: "synthetic_cleanup",
      errorMessageRedacted: "synthetic rehearsal cleanup",
    });
    const replacementPayload = candidate(
      "shadow-scan-lease-1",
      "SYNTHETIC:XRPUSDT:PERPETUAL",
      now,
    );
    const replayed = await resolutions.resolve({
      scope: "production_radar",
      resolutionId: "018f47d6-2c40-7e30-8a20-000000000030",
      quarantinedOutboxId: "018f47d6-2c40-7e30-8a20-000000000003",
      action: "replay_after_approved_fix",
      reasonCode: "synthetic_worker_fix_approved",
      approvalRef: "WP-G0.2/REHEARSAL-Q-003",
      approvalDigest: sha256("quarantine-replay-approval"),
      replacementPayload,
      replacementOutboxId: "018f47d6-2c40-7e30-8a20-000000000031",
      migrationId: "candidate-episode-v1",
      authorityEpoch: 2,
    });
    assert.equal(
      replayed.replacementOutboxId,
      "018f47d6-2c40-7e30-8a20-000000000031",
    );
    const replayBeforeClaim = await pool.query<{
      status: string;
      attempt_count: number;
      source_type: string;
    }>(`
      SELECT status, attempt_count, source_type
      FROM candidate_authority.candidate_episode_ingest_outbox
      WHERE outbox_id = '018f47d6-2c40-7e30-8a20-000000000031'
    `);
    assert.deepEqual(replayBeforeClaim.rows[0], {
      status: "pending",
      attempt_count: 0,
      source_type: "legacy_scan_candidate",
    });
    await rejectsCode(
      () => pool.query(
        `SELECT * FROM candidate_authority.transition_migration_control_v1(
          $1,2,'shadow_verify',false,$2,$3,clock_timestamp()
        )`,
        [
          "candidate-episode-v1",
          "shadow-capture-rehearsal-v1",
          sha256("phase-advance-before-replay-complete"),
        ],
      ),
      "55000",
    );
    await episodes.openOrRefreshEpisode({
      scope: "production_radar",
      canonicalInstrumentId: replacementPayload.canonicalInstrumentId,
      venueContext: replacementPayload.venueContext,
      firstSeenAt: replacementPayload.firstSeenAt,
      lastSeenAt: replacementPayload.lastSeenAt,
      observationPrice: replacementPayload.observationPrice,
      observationPriceFactId: replacementPayload.observationPriceFactId,
      discoveryReasons: [...replacementPayload.discoveryReasons],
      priorityTier: replacementPayload.priorityTier,
      maturity: replacementPayload.maturity,
      directionState: replacementPayload.directionState,
      expiresAt: replacementPayload.expiresAt,
      releaseId: replacementPayload.releaseId,
      sourceScanCycleId: replacementPayload.sourceScanCycleId,
      runtimeId: "shadow-rehearsal-replay",
      idempotencyKey: "shadow-projection:018f47d6-2c40-7e30-8a20-000000000031",
    });
    const replayConsumed = await consumer.runBatch({
      scope: "production_radar",
      runtimeId: "shadow-rehearsal-replay",
      now: new Date(now + 21 * 60_000 + 304_000).toISOString(),
      limit: 10,
      migrationId: "candidate-episode-v1",
      authorityEpoch: 2,
    });
    assert.equal(replayConsumed.completed, 1, JSON.stringify(replayConsumed));
    const advanced = await pool.query<{ epoch: string; phase: string }>(`
      SELECT epoch::text, phase
      FROM candidate_authority.transition_migration_control_v1(
        $1,2,'shadow_verify',false,$2,$3,clock_timestamp()
      )
    `, [
      "candidate-episode-v1",
      "shadow-capture-rehearsal-v1",
      sha256("phase-advance-after-resolution"),
    ]);
    assert.deepEqual(advanced.rows[0], { epoch: "3", phase: "shadow_verify" });

    const raceControlId = "candidate-episode-race-v1";
    await pool.query(
      `INSERT INTO candidate_authority.candidate_migration_control (
         migration_id, phase, epoch, started_at, deadline_at, write_frozen,
         approved_release_id, approval_digest, updated_at
       ) VALUES ($1,'shadow_capture',2,$2,$3,false,$4,$5,$2)`,
      [
        raceControlId,
        new Date(now).toISOString(),
        new Date(now + 60 * 60_000).toISOString(),
        "shadow-capture-rehearsal-v1",
        sha256("race-control"),
      ],
    );
    const locker = await pool.connect();
    const transitioner = await pool.connect();
    try {
      await locker.query("BEGIN");
      await locker.query(
        "SELECT candidate_authority.assert_outbox_authority_epoch_v1($1,$2)",
        [raceControlId, 2],
      );
      let transitionSettled = false;
      const transition = transitioner.query(
        `SELECT epoch::text FROM candidate_authority.transition_migration_control_v1(
          $1,2,'legacy',false,$2,$3,$4
        )`,
        [
          raceControlId,
          "shadow-capture-rehearsal-v1",
          sha256("race-transition"),
          new Date(now + 1_000).toISOString(),
        ],
      ).then((result) => {
        transitionSettled = true;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(transitionSettled, false, "phase transition must wait for active epoch reader");
      await locker.query("COMMIT");
      const transitioned = await transition;
      assert.equal(transitioned.rows[0]?.epoch, "3");
    } finally {
      await locker.query("ROLLBACK").catch(() => undefined);
      locker.release();
      transitioner.release();
    }

    const expiredControlId = "candidate-episode-expired-v1";
    await pool.query(
      `INSERT INTO candidate_authority.candidate_migration_control (
         migration_id, phase, epoch, started_at, deadline_at, write_frozen,
         approved_release_id, approval_digest, updated_at
       ) VALUES ($1,'shadow_capture',2,$2,$3,false,$4,$5,$2)`,
      [
        expiredControlId,
        new Date(now - 120_000).toISOString(),
        new Date(now - 60_000).toISOString(),
        "shadow-capture-rehearsal-v1",
        sha256("expired-control"),
      ],
    );
    await rejectsCode(
      () => pool.query(
        "SELECT candidate_authority.assert_outbox_authority_epoch_v1($1,$2)",
        [expiredControlId, 2],
      ),
      "40001",
    );
  } finally {
    await pool.end();
  }
});
