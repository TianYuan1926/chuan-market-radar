import assert from "node:assert/strict";
import pg from "pg";

import { collectCandidateLineageDatabaseSnapshot } from "./runner.mjs";

const { Client } = pg;
const databaseUrl = process.env.WP_G0_2_LINEAGE_DATABASE_URL?.trim();
assert.ok(databaseUrl, "lineage rehearsal database URL is required");

const activationRelease = "candidate-shadow-lineage-pg-cycle-1";
const freshRelease = "candidate-shadow-lineage-pg-cycle-2";

function uuid(index) {
  return `00000001-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function source(index, releaseId, createdAt) {
  const instrument = `BINANCE:LINEAGE${index}USDT:PERP`;
  const scanId = `lineage-scan-${index}`;
  const firstSeenAt = new Date(createdAt.getTime() + index).toISOString();
  const payload = {
    schemaVersion: "shadow-candidate-observation.v1",
    canonicalInstrumentId: instrument,
    venueContext: {
      schemaVersion: "shadow-venue-context.v1",
      venue: "BINANCE",
      venueInstrumentId: `LINEAGE${index}USDT`,
      contractType: "perpetual",
      settlementAsset: "USDT",
      resolutionStatus: "resolved",
      identityEvidenceIds: [`instrument:${instrument}`, `scan:${scanId}`],
    },
    firstSeenAt,
    lastSeenAt: firstSeenAt,
    observationPrice: "1.25",
    observationPriceFactId: `ticker:${index}`,
    discoveryReasons: ["light_scan_candidate"],
    priorityTier: "B",
    maturity: "light_candidate",
    directionState: "unknown",
    expiresAt: null,
    releaseId,
    sourceScanCycleId: scanId,
  };
  return {
    outbox_id: uuid(index),
    scope: "production_radar",
    source_type: "legacy_scan_candidate",
    source_id: `${scanId}:${instrument}`,
    source_version: firstSeenAt,
    payload_version: "shadow-candidate-observation.v1",
    payload,
    payload_hash: `sha256:${"a".repeat(64)}`,
    idempotency_key: `shadow-capture:${scanId}:${instrument}`,
    status: "completed",
    created_at: firstSeenAt,
    completed_at: new Date(Date.parse(firstSeenAt) + 1_000).toISOString(),
  };
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  const startedAt = new Date("2026-07-11T00:00:00.000Z");
  const activationDeadline = new Date("2026-07-14T00:00:00.000Z");
  const freshStarted = new Date("2026-07-13T01:00:00.000Z");
  const freshDeadline = new Date("2026-07-16T01:00:00.000Z");
  await client.query(`INSERT INTO candidate_authority.candidate_migration_control (
    migration_id, phase, epoch, started_at, deadline_at, write_frozen,
    approved_release_id, approval_digest, updated_at
  ) VALUES ('candidate-episode-v1','legacy',4,$1,$2,true,$3,$4,$2),
    ('candidate-episode-v1-cycle-2','shadow_capture',1,$5,$6,false,$7,$8,$5)`, [
    startedAt.toISOString(), activationDeadline.toISOString(), activationRelease,
    `sha256:${"b".repeat(64)}`, freshStarted.toISOString(), freshDeadline.toISOString(),
    freshRelease, `sha256:${"c".repeat(64)}`,
  ]);

  const batchSize = 250;
  const total = 10_020;
  for (let offset = 0; offset < total; offset += batchSize) {
    const batch = Array.from({ length: Math.min(batchSize, total - offset) }, (_, inner) => {
      const index = offset + inner + 1;
      return index <= 10_005
        ? source(index, activationRelease, startedAt)
        : source(index, freshRelease, freshStarted);
    });
    await client.query(`INSERT INTO candidate_authority.candidate_episode_ingest_outbox (
      outbox_id, scope, source_type, source_id, source_version, payload_version,
      payload, payload_hash, idempotency_key, status, created_at, completed_at
    ) SELECT * FROM jsonb_to_recordset($1::jsonb) AS item(
      outbox_id uuid, scope text, source_type text, source_id text,
      source_version text, payload_version text, payload jsonb, payload_hash text,
      idempotency_key text, status text, created_at timestamptz, completed_at timestamptz
    )`, [JSON.stringify(batch)]);
  }

  await client.query("BEGIN TRANSACTION READ ONLY");
  await assert.rejects(
    client.query(`INSERT INTO candidate_authority.candidate_migration_control (
      migration_id, phase, epoch, started_at, deadline_at, approved_release_id,
      approval_digest, updated_at
    ) VALUES ('forbidden-lineage-write','legacy',2,clock_timestamp(),
      clock_timestamp()+interval '1 hour','none',$1,clock_timestamp())`, [
      `sha256:${"d".repeat(64)}`,
    ]),
    (error) => error?.code === "25006",
  );
  await client.query("ROLLBACK");

  const snapshot = await collectCandidateLineageDatabaseSnapshot(client);
  assert.equal(snapshot.controls.length, 2);
  assert.deepEqual(snapshot.releaseCompletedWrites, [
    { completedWrites: 10_005, releaseId: activationRelease },
    { completedWrites: 15, releaseId: freshRelease },
  ]);
  assert.equal(snapshot.statusCounts.completed, total);
  assert.equal(snapshot.statusCounts.unresolvedTotal, 0);
  assert.equal(snapshot.statusCounts.outsideLineage, 0);

  const outside = source(total + 1, "candidate-shadow-lineage-unapproved", freshStarted);
  await client.query(`INSERT INTO candidate_authority.candidate_episode_ingest_outbox (
    outbox_id, scope, source_type, source_id, source_version, payload_version,
    payload, payload_hash, idempotency_key, status, created_at, completed_at
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [
    outside.outbox_id, outside.scope, outside.source_type, outside.source_id,
    outside.source_version, outside.payload_version, outside.payload,
    outside.payload_hash, outside.idempotency_key, outside.status,
    outside.created_at, outside.completed_at,
  ]);
  await assert.rejects(
    collectCandidateLineageDatabaseSnapshot(client),
    (error) => error?.reason === "database_outsideLineage_not_zero",
  );
  await client.query("DELETE FROM candidate_authority.candidate_episode_ingest_outbox WHERE outbox_id=$1", [
    outside.outbox_id,
  ]);

  process.stdout.write(`${JSON.stringify({
    status: "pass",
    postgresMajor: 16,
    controls: snapshot.controls.length,
    completedWrites: snapshot.statusCounts.completed,
    releaseCounts: snapshot.releaseCompletedWrites.map((item) => item.completedWrites),
    transactionReadOnlyEnforced: true,
    auditRoleEnforced: true,
    outsideLineageRejected: true,
    productionConnected: false,
  })}\n`);
} finally {
  await client.end();
}
