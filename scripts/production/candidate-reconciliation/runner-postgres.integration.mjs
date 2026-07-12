import assert from "node:assert/strict";
import pg from "pg";
import {
  MINIMUM_COMPARED_WRITES,
  collectReadOnlyEvidence,
  hashPayload,
  hashProjectionCommand,
} from "./runner.mjs";

const { Client } = pg;
const databaseUrl = process.env.WP_G0_2_RECONCILIATION_DATABASE_URL?.trim();
assert.ok(databaseUrl, "reconciliation rehearsal database URL is required");

const releaseId = "candidate-shadow-reconciliation-rehearsal";
const migrationId = "candidate-episode-v1";

function uuid(index, family) {
  return `${family.toString(16).padStart(8, "0")}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function record(index) {
  const outboxId = uuid(index, 1);
  const episodeId = uuid(index, 2);
  const eventId = uuid(index, 3);
  const instant = new Date(Date.parse("2026-07-12T01:00:00.000Z") + index).toISOString();
  const instrument = `BINANCE:RECON${index}USDT:PERP`;
  const scanId = `reconciliation-scan-${index}`;
  const runtimeId = `candidate-shadow:${releaseId}:pg16-worker`;
  const payload = {
    schemaVersion: "shadow-candidate-observation.v1",
    canonicalInstrumentId: instrument,
    venueContext: {
      schemaVersion: "shadow-venue-context.v1",
      venue: "BINANCE",
      venueInstrumentId: `RECON${index}USDT`,
      contractType: "perpetual",
      settlementAsset: "USDT",
      resolutionStatus: "resolved",
      identityEvidenceIds: [`instrument:${instrument}`, `scan:${scanId}`],
    },
    firstSeenAt: instant,
    lastSeenAt: instant,
    observationPrice: "1.25",
    observationPriceFactId: `ticker:BINANCE:RECON${index}USDT:${instant}`,
    discoveryReasons: ["light_scan_candidate"],
    priorityTier: "B",
    maturity: "light_candidate",
    directionState: "unknown",
    expiresAt: null,
    releaseId,
    sourceScanCycleId: scanId,
  };
  const eventIdempotency = `shadow-projection:${outboxId}`;
  const commandHash = hashProjectionCommand({
    scope: "production_radar",
    canonicalInstrumentId: payload.canonicalInstrumentId,
    venueContext: payload.venueContext,
    firstSeenAt: payload.firstSeenAt,
    lastSeenAt: payload.lastSeenAt,
    observationPrice: payload.observationPrice,
    observationPriceFactId: payload.observationPriceFactId,
    discoveryReasons: payload.discoveryReasons,
    priorityTier: payload.priorityTier,
    maturity: payload.maturity,
    directionState: payload.directionState,
    expiresAt: payload.expiresAt,
    releaseId: payload.releaseId,
    sourceScanCycleId: payload.sourceScanCycleId,
    runtimeId,
    idempotencyKey: eventIdempotency,
  });
  return {
    episode: {
      schema_version: "candidate-episode.v1",
      scope: "production_radar",
      episode_id: episodeId,
      canonical_instrument_id: instrument,
      venue_context: payload.venueContext,
      first_seen_at: instant,
      last_seen_at: instant,
      observation_price: payload.observationPrice,
      observation_price_fact_id: payload.observationPriceFactId,
      discovery_reasons: payload.discoveryReasons,
      priority_tier: payload.priorityTier,
      lifecycle: "discovered",
      maturity: payload.maturity,
      direction_state: payload.directionState,
      expires_at: null,
      release_id: releaseId,
      source_scan_cycle_id: scanId,
      created_by_runtime_id: runtimeId,
      idempotency_key: eventIdempotency,
      row_version: 1,
    },
    event: {
      event_id: eventId,
      scope: "production_radar",
      episode_id: episodeId,
      stream_version: 1,
      event_type: "DISCOVERED",
      event_time: instant,
      source_fact_ids: [payload.observationPriceFactId],
      source_scan_cycle_id: scanId,
      release_id: releaseId,
      runtime_id: runtimeId,
      idempotency_key: eventIdempotency,
      command_hash: commandHash,
      payload_version: "candidate-event.v1",
      payload: { canonicalInstrumentId: instrument, eventType: "DISCOVERED" },
    },
    source: {
      outbox_id: outboxId,
      scope: "production_radar",
      source_type: "legacy_scan_candidate",
      source_id: `${scanId}:${instrument}`,
      source_version: instant,
      payload_version: "shadow-candidate-observation.v1",
      payload,
      payload_hash: hashPayload(payload),
      idempotency_key: `shadow-capture:${scanId}:${instrument}`,
      status: "completed",
      completed_at: new Date(Date.parse(instant) + 1_000).toISOString(),
      created_at: instant,
    },
  };
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  const now = await client.query("SELECT clock_timestamp() AS now");
  const startedAt = new Date(new Date(now.rows[0].now).getTime() - 25 * 60 * 60_000);
  const deadlineAt = new Date(startedAt.getTime() + 72 * 60 * 60_000);
  await client.query(`INSERT INTO candidate_authority.candidate_migration_control (
    migration_id, phase, epoch, started_at, deadline_at, write_frozen,
    approved_release_id, approval_digest, updated_at
  ) VALUES ($1,'shadow_capture',1,$2,$3,false,$4,$5,$2)`, [
    migrationId,
    startedAt.toISOString(),
    deadlineAt.toISOString(),
    releaseId,
    `sha256:${"d".repeat(64)}`,
  ]);

  const batchSize = 250;
  for (let offset = 0; offset < MINIMUM_COMPARED_WRITES; offset += batchSize) {
    const batch = Array.from(
      { length: Math.min(batchSize, MINIMUM_COMPARED_WRITES - offset) },
      (_, index) => record(offset + index + 1),
    );
    await client.query(`INSERT INTO candidate_authority.candidate_episodes (
      schema_version, scope, episode_id, canonical_instrument_id, venue_context,
      first_seen_at, last_seen_at, observation_price, observation_price_fact_id,
      discovery_reasons, priority_tier, lifecycle, maturity, direction_state,
      expires_at, release_id, source_scan_cycle_id, created_by_runtime_id,
      idempotency_key, row_version
    ) SELECT * FROM jsonb_to_recordset($1::jsonb) AS item(
      schema_version text, scope text, episode_id uuid, canonical_instrument_id text,
      venue_context jsonb, first_seen_at timestamptz, last_seen_at timestamptz,
      observation_price numeric, observation_price_fact_id text, discovery_reasons text[],
      priority_tier text, lifecycle text, maturity text, direction_state text,
      expires_at timestamptz, release_id text, source_scan_cycle_id text,
      created_by_runtime_id text, idempotency_key text, row_version bigint
    )`, [JSON.stringify(batch.map((item) => item.episode))]);
    await client.query(`INSERT INTO candidate_authority.candidate_episode_events (
      event_id, scope, episode_id, stream_version, event_type, event_time,
      source_fact_ids, source_scan_cycle_id, release_id, runtime_id,
      idempotency_key, command_hash, payload_version, payload
    ) SELECT * FROM jsonb_to_recordset($1::jsonb) AS item(
      event_id uuid, scope text, episode_id uuid, stream_version bigint,
      event_type text, event_time timestamptz, source_fact_ids text[],
      source_scan_cycle_id text, release_id text, runtime_id text,
      idempotency_key text, command_hash text, payload_version text, payload jsonb
    )`, [JSON.stringify(batch.map((item) => item.event))]);
    await client.query(`INSERT INTO candidate_authority.candidate_episode_ingest_outbox (
      outbox_id, scope, source_type, source_id, source_version, payload_version,
      payload, payload_hash, idempotency_key, status, created_at, completed_at
    ) SELECT * FROM jsonb_to_recordset($1::jsonb) AS item(
      outbox_id uuid, scope text, source_type text, source_id text,
      source_version text, payload_version text, payload jsonb, payload_hash text,
      idempotency_key text, status text, created_at timestamptz, completed_at timestamptz
    )`, [JSON.stringify(batch.map((item) => item.source))]);
  }

  await client.query("BEGIN TRANSACTION READ ONLY");
  await assert.rejects(
    client.query("INSERT INTO candidate_authority.candidate_migration_control (migration_id,phase,epoch,started_at,deadline_at,approved_release_id,approval_digest,updated_at) VALUES ('forbidden-write','legacy',1,clock_timestamp(),clock_timestamp()+interval '1 hour','none','sha256:" + "0".repeat(64) + "',clock_timestamp())"),
    (error) => error?.code === "25006",
  );
  await client.query("ROLLBACK");

  const evidence = await collectReadOnlyEvidence(client, {
    authorityEpoch: 1,
    migrationId,
    releaseId,
    activationEvidenceSha256: `sha256:${"a".repeat(64)}`,
  }, {
    status: "PASS_ACTIVATE_AND_OBSERVE",
    releaseId,
    authorityEpoch: 1,
    coverageHours: 24,
    sampleCount: 289,
  });
  assert.equal(evidence.status, "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL");
  assert.equal(evidence.comparedWrites, MINIMUM_COMPARED_WRITES);
  assert.equal(evidence.comparisonDifferences, 0);
  assert.equal(evidence.automaticPhaseAdvance, false);
  assert.equal(evidence.phaseTransitionExecuted, false);
  const boundary = await client.query(`SELECT phase, epoch::int, write_frozen,
    (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox
      WHERE source_type='legacy_scan_candidate') AS source_writes,
    (SELECT count(*)::int FROM candidate_authority.candidate_episode_events) AS projection_events
    FROM candidate_authority.candidate_migration_control WHERE migration_id=$1`, [migrationId]);
  assert.deepEqual(boundary.rows[0], {
    phase: "shadow_capture",
    epoch: 1,
    write_frozen: false,
    source_writes: MINIMUM_COMPARED_WRITES,
    projection_events: MINIMUM_COMPARED_WRITES,
  });
  process.stdout.write(`${JSON.stringify({
    status: "pass",
    postgresMajor: 16,
    comparedWrites: evidence.comparedWrites,
    comparisonDifferences: evidence.comparisonDifferences,
    transactionReadOnlyEnforced: true,
    phaseUnchanged: "shadow_capture",
    productionConnected: false,
  })}\n`);
} finally {
  await client.end();
}
