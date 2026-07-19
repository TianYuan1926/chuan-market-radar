import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

import { evaluateCycleObservation } from
  "../candidate-cycle-continuation/observation-runner.mjs";
import {
  CAPTURE_SPEC_SCHEMA,
  captureCandidateLineageEvidence,
  PACKAGE_ID,
} from "./production-runner.mjs";
import {
  collectCandidateLineageDatabaseSnapshot,
  collectCandidateLineageDatabaseSnapshotWithEvidence,
  sha256,
} from "./runner.mjs";

const { Client } = pg;
const databaseUrl = process.env.WP_G0_2_LINEAGE_DATABASE_URL?.trim();
assert.ok(databaseUrl, "lineage rehearsal database URL is required");

const releases = [
  "candidate-shadow-lineage-pg-cycle-1",
  "candidate-shadow-lineage-pg-cycle-2",
  "candidate-shadow-lineage-pg-cycle-3",
  "candidate-shadow-lineage-pg-cycle-4",
  "candidate-shadow-lineage-pg-cycle-5",
  "candidate-shadow-lineage-pg-cycle-6",
  "candidate-shadow-lineage-pg-cycle-7",
];
const unifiedExpected = {
  authorityEpoch: 1,
  commit: "b".repeat(40),
  migrationId: "candidate-episode-v1-cycle-7",
  releaseId: releases[6],
};

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

function unifiedSample(index) {
  const completedWrites = 5_010 + Math.floor(index * (10_020 - 5_010) / 288);
  const sampledAt = new Date(Date.parse("2026-07-18T00:00:00.000Z") + index * 300_000);
  const databaseSnapshot = (value) => ({
    sampledAt: value.toISOString(),
    migrationId: unifiedExpected.migrationId,
    releaseId: unifiedExpected.releaseId,
    phase: "shadow_capture",
    epoch: unifiedExpected.authorityEpoch,
    deadlineAt: "2026-07-21T00:00:00.000Z",
    completedWrites,
    unresolvedOutbox: 0,
    activeCycles: 1,
    database: { lockWaiters: 0, longTransactions: 0 },
  });
  return {
    schemaVersion: "candidate-validation-cycle-observation-sample.v3",
    sampledAt: sampledAt.toISOString(),
    commit: unifiedExpected.commit,
    migrationId: unifiedExpected.migrationId,
    releaseId: unifiedExpected.releaseId,
    phase: "shadow_capture",
    epoch: unifiedExpected.authorityEpoch,
    deadlineAt: "2026-07-21T00:00:00.000Z",
    completedWrites,
    unresolvedOutbox: 0,
    activeCycles: 1,
    health: {
      ok: true,
      level: "ready",
      scanFreshness: "fresh",
      database: "ready",
      redis: "healthy",
      candidateWorker: "healthy",
      workersHealthy: true,
    },
    candidate: {
      ok: true,
      mode: "active",
      runtime: {
        enabled: true,
        blockers: [],
        authorityEpoch: unifiedExpected.authorityEpoch,
        expectedReleaseId: unifiedExpected.releaseId,
      },
      monitor: {
        status: "ready",
        phase: "shadow_capture",
        migrationId: unifiedExpected.migrationId,
        authorityEpoch: unifiedExpected.authorityEpoch,
        blockers: [],
        warnings: [],
        metrics: {
          outboxPendingTotal: 0,
          outboxClaimedTotal: 0,
          outboxRetryWaitTotal: 0,
          outboxQuarantinedTotal: 0,
          unresolvedQuarantineTotal: 0,
          unresolvedTotal: 0,
          oldestPendingAgeSeconds: null,
          outboxCompletedTotal: completedWrites,
        },
      },
    },
    database: { lockWaiters: 0, longTransactions: 0 },
    databaseWindow: {
      before: databaseSnapshot(new Date(sampledAt.getTime() - 1_000)),
      after: databaseSnapshot(sampledAt),
    },
  };
}

async function writeUnifiedEvidence(root) {
  const samples = Array.from({ length: 289 }, (_, index) => unifiedSample(index));
  const final = evaluateCycleObservation(samples, unifiedExpected);
  const closeout = {
    schemaVersion: "candidate-cycle-observation-closeout.v1",
    outcome: "PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE",
    closedAt: "2026-07-16T00:01:00.000Z",
    secretsPrinted: false,
  };
  const paths = {
    final: join(root, "cycle-observation-final.json"),
    samples: join(root, "cycle-observation-samples.jsonl"),
    closeout: join(root, "cycle-observation-closeout.json"),
  };
  const bytes = {
    final: Buffer.from(`${JSON.stringify(final)}\n`),
    samples: Buffer.from(`${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`),
    closeout: Buffer.from(`${JSON.stringify(closeout)}\n`),
  };
  for (const key of Object.keys(paths)) {
    await writeFile(paths[key], bytes[key], { mode: 0o600 });
  }
  return {
    authorityEpoch: unifiedExpected.authorityEpoch,
    closeoutPath: paths.closeout,
    closeoutSha256: sha256(bytes.closeout),
    commit: unifiedExpected.commit,
    finalPath: paths.final,
    finalSha256: sha256(bytes.final),
    migrationId: unifiedExpected.migrationId,
    releaseId: unifiedExpected.releaseId,
    samplesPath: paths.samples,
    samplesSha256: sha256(bytes.samples),
  };
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  const starts = [
    new Date("2026-07-03T00:00:00.000Z"),
    new Date("2026-07-06T00:00:00.000Z"),
    new Date("2026-07-09T00:00:00.000Z"),
    new Date("2026-07-12T00:00:00.000Z"),
    new Date("2026-07-15T00:00:00.000Z"),
    new Date("2026-07-18T00:00:00.000Z"),
    new Date("2026-07-21T00:00:00.000Z"),
  ];
  const deadlines = starts.map((startedAt) => new Date(startedAt.getTime() + 72 * 60 * 60_000));
  await client.query(`INSERT INTO candidate_authority.candidate_migration_control (
    migration_id, phase, epoch, started_at, deadline_at, write_frozen,
    approved_release_id, approval_digest, updated_at
  ) VALUES ('candidate-episode-v1','legacy',2,$1,$2,true,$3,$4,$2),
    ('candidate-episode-v1-cycle-2','legacy',2,$5,$6,true,$7,$8,$6),
    ('candidate-episode-v1-cycle-3','legacy',2,$9,$10,true,$11,$12,$10),
    ('candidate-episode-v1-cycle-4','legacy',2,$13,$14,true,$15,$16,$14),
    ('candidate-episode-v1-cycle-5','legacy',2,$17,$18,true,$19,$20,$18),
    ('candidate-episode-v1-cycle-6','legacy',2,$21,$22,true,$23,$24,$22),
    ('candidate-episode-v1-cycle-7','shadow_capture',1,$25,$26,false,$27,$28,$25)`, [
    starts[0].toISOString(), deadlines[0].toISOString(), releases[0],
    `sha256:${"b".repeat(64)}`,
    starts[1].toISOString(), deadlines[1].toISOString(), releases[1],
    `sha256:${"c".repeat(64)}`,
    starts[2].toISOString(), deadlines[2].toISOString(), releases[2],
    `sha256:${"d".repeat(64)}`,
    starts[3].toISOString(), deadlines[3].toISOString(), releases[3],
    `sha256:${"e".repeat(64)}`,
    starts[4].toISOString(), deadlines[4].toISOString(), releases[4],
    `sha256:${"f".repeat(64)}`,
    starts[5].toISOString(), deadlines[5].toISOString(), releases[5],
    `sha256:${"1".repeat(64)}`,
    starts[6].toISOString(), deadlines[6].toISOString(), releases[6],
    `sha256:${"2".repeat(64)}`,
  ]);

  const total = 10_020;
  const batchSize = 250;
  for (let offset = 0; offset < total; offset += batchSize) {
    const batch = Array.from({ length: Math.min(batchSize, total - offset) }, (_, inner) => {
      const index = offset + inner + 1;
      if (index <= 1_670) return source(index, releases[0], starts[0]);
      if (index <= 3_340) return source(index, releases[2], starts[2]);
      if (index <= 5_010) return source(index, releases[4], starts[4]);
      return source(index, releases[6], starts[6]);
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
      `sha256:${"e".repeat(64)}`,
    ]),
    (error) => error?.code === "25006",
  );
  await client.query("ROLLBACK");

  const capturedSnapshot = await collectCandidateLineageDatabaseSnapshotWithEvidence(client);
  const snapshot = capturedSnapshot.snapshot;
  assert.deepEqual(capturedSnapshot.databaseIdentity, {
    currentRole: "candidate_audit_role",
    transactionIsolation: "repeatable read",
    transactionReadOnly: true,
  });
  assert.equal(snapshot.controls.length, 7);
  assert.deepEqual(snapshot.releaseCompletedWrites, [
    { completedWrites: 1_670, releaseId: releases[0] },
    { completedWrites: 0, releaseId: releases[1] },
    { completedWrites: 1_670, releaseId: releases[2] },
    { completedWrites: 0, releaseId: releases[3] },
    { completedWrites: 1_670, releaseId: releases[4] },
    { completedWrites: 0, releaseId: releases[5] },
    { completedWrites: 5_010, releaseId: releases[6] },
  ]);
  assert.equal(snapshot.statusCounts.completed, total);
  assert.equal(snapshot.statusCounts.unresolvedTotal, 0);
  assert.equal(snapshot.statusCounts.outsideLineage, 0);

  const evidenceRoot = await mkdtemp(join(tmpdir(), "lineage-production-pg16-"));
  let captured;
  try {
    captured = await captureCandidateLineageEvidence(client, {
      schemaVersion: CAPTURE_SPEC_SCHEMA,
      packageId: PACKAGE_ID,
      productionMutationAllowed: false,
      outputSchemaVersion: "candidate-multi-cycle-lineage-evidence.v3",
      unified: await writeUnifiedEvidence(evidenceRoot),
    });
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
  assert.equal(captured.lineage.status,
    "PASS_CURRENT_CYCLE_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH");
  assert.equal(captured.lineage.completedWrites, 10_020);
  assert.equal(captured.lineage.sourceReleaseWindows.length, 7);
  assert.equal(captured.lineage.validationCycle, 7);
  assert.equal(captured.databaseIdentity.currentRole, "candidate_audit_role");
  assert.equal(Object.values(captured.sourceEvidenceSha256).flatMap(Object.values).length, 3);

  const outside = source(total + 1, "candidate-shadow-lineage-unapproved", starts[6]);
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
  await client.query(
    "DELETE FROM candidate_authority.candidate_episode_ingest_outbox WHERE outbox_id=$1",
    [outside.outbox_id],
  );

  process.stdout.write(`${JSON.stringify({
    status: "pass",
    postgresMajor: 16,
    controls: snapshot.controls.length,
    completedWrites: snapshot.statusCounts.completed,
    releaseCounts: snapshot.releaseCompletedWrites.map((item) => item.completedWrites),
    transactionReadOnlyEnforced: true,
    auditRoleEnforced: true,
    outsideLineageRejected: true,
    productionCaptureRunnerExercised: true,
    lineageStatus: captured.lineage.status,
    productionConnected: false,
  })}\n`);
} finally {
  await client.end();
}
