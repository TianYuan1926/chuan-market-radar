import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

import { evaluateObservationEvidence } from "../candidate-activation/runner.mjs";
import { evaluateCycleObservation } from "../candidate-cycle-continuation/observation-runner.mjs";
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

const activationExpected = {
  authorityEpoch: 3,
  commit: "a".repeat(40),
  migrationId: "candidate-episode-v1",
  releaseId: activationRelease,
};
const freshExpected = {
  authorityEpoch: 1,
  commit: "b".repeat(40),
  migrationId: "candidate-episode-v1-cycle-2",
  releaseId: freshRelease,
};

function activationSample(index) {
  return {
    schemaVersion: "candidate-shadow-observation-sample.v1",
    sampledAt: new Date(Date.parse("2026-07-11T00:00:00.000Z") + index * 300_000).toISOString(),
    commit: activationExpected.commit,
    releaseId: activationExpected.releaseId,
    health: {
      ok: true,
      level: "ready",
      scanFreshness: "fresh",
      databaseStatus: "ready",
      redisStatus: "healthy",
      workers: [
        "scanner-worker", "websocket-light-worker", "coinglass-worker", "signal-worker",
        "dynamic-scan-scheduler", "macro-worker", "candidate-shadow-worker",
      ].map((key) => ({ ageSec: 5, key, status: "healthy" })),
    },
    candidate: {
      ok: true,
      mode: "active",
      runtime: {
        enabled: true,
        blockers: [],
        authorityEpoch: activationExpected.authorityEpoch,
        expectedReleaseId: activationExpected.releaseId,
      },
      monitor: {
        status: "ready",
        phase: "shadow_capture",
        authorityEpoch: activationExpected.authorityEpoch,
        blockers: [],
        warnings: [],
        metrics: {
          outboxRetryWaitTotal: 0,
          unresolvedQuarantineTotal: 0,
          outboxQuarantinedTotal: 0,
          oldestPendingAgeSeconds: null,
          outboxCompletedTotal: index + 1,
        },
      },
    },
    database: { identityErrors: 0, lockWaiters: 0, longTransactions: 0 },
  };
}

function cycleSamples(expected, start, values, deadlineAt) {
  return values.map((completedWrites, index) => ({
    schemaVersion: "candidate-validation-cycle-observation-sample.v1",
    sampledAt: new Date(Date.parse(start) + index * 300_000).toISOString(),
    commit: expected.commit,
    migrationId: expected.migrationId,
    releaseId: expected.releaseId,
    phase: "shadow_capture",
    epoch: expected.authorityEpoch,
    deadlineAt,
    completedWrites,
    unresolvedOutbox: 0,
    activeCycles: 1,
    health: {
      level: "ready",
      scanFreshness: "fresh",
      database: "ready",
      redis: "healthy",
      candidateWorker: "healthy",
      workersHealthy: true,
    },
  }));
}

async function writeEvidence(root, label, expected, samples, activation = false) {
  const final = activation
    ? evaluateObservationEvidence(samples, {
      approvedCommit: expected.commit,
      authorityEpoch: expected.authorityEpoch,
      migrationId: expected.migrationId,
      releaseId: expected.releaseId,
    })
    : evaluateCycleObservation(samples, expected);
  const closeout = {
    schemaVersion: activation
      ? "candidate-observation-closeout.v1"
      : "candidate-cycle-observation-closeout.v1",
    outcome: activation
      ? "PASS_ACTIVATE_AND_OBSERVE"
      : "PASS_ACCUMULATION_READY_FOR_FRESH_VERIFICATION_CYCLE",
    closedAt: "2026-07-14T02:00:00.000Z",
    secretsPrinted: false,
  };
  const paths = {
    final: join(root, `${label}-final.json`),
    samples: join(root, `${label}-samples.jsonl`),
    closeout: join(root, `${label}-closeout.json`),
  };
  const bytes = {
    final: Buffer.from(`${JSON.stringify(final)}\n`),
    samples: Buffer.from(`${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`),
    closeout: Buffer.from(`${JSON.stringify(closeout)}\n`),
  };
  for (const key of Object.keys(paths)) await writeFile(paths[key], bytes[key], { mode: 0o600 });
  return {
    authorityEpoch: expected.authorityEpoch,
    closeoutPath: paths.closeout,
    closeoutSha256: sha256(bytes.closeout),
    commit: expected.commit,
    finalPath: paths.final,
    finalSha256: sha256(bytes.final),
    migrationId: expected.migrationId,
    releaseId: expected.releaseId,
    samplesPath: paths.samples,
    samplesSha256: sha256(bytes.samples),
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

  const capturedSnapshot = await collectCandidateLineageDatabaseSnapshotWithEvidence(client);
  const snapshot = capturedSnapshot.snapshot;
  assert.deepEqual(capturedSnapshot.databaseIdentity, {
    currentRole: "candidate_audit_role",
    transactionIsolation: "repeatable read",
    transactionReadOnly: true,
  });
  assert.equal(snapshot.controls.length, 2);
  assert.deepEqual(snapshot.releaseCompletedWrites, [
    { completedWrites: 10_005, releaseId: activationRelease },
    { completedWrites: 15, releaseId: freshRelease },
  ]);
  assert.equal(snapshot.statusCounts.completed, total);
  assert.equal(snapshot.statusCounts.unresolvedTotal, 0);
  assert.equal(snapshot.statusCounts.outsideLineage, 0);

  const evidenceRoot = await mkdtemp(join(tmpdir(), "lineage-production-pg16-"));
  let captured;
  try {
    const activationSamples = Array.from({ length: 289 }, (_, index) => activationSample(index));
    const accumulationSamples = cycleSamples(
      activationExpected,
      "2026-07-13T00:00:00.000Z",
      [9_990, 9_990, 9_995, 9_995, 10_005, 10_005, 10_005],
      "2026-07-14T00:00:00.000Z",
    );
    const freshSamples = cycleSamples(
      freshExpected,
      "2026-07-13T01:05:00.000Z",
      [10_005, 10_005, 10_010, 10_010, 10_020, 10_020, 10_020],
      "2026-07-16T01:00:00.000Z",
    );
    captured = await captureCandidateLineageEvidence(client, {
      schemaVersion: CAPTURE_SPEC_SCHEMA,
      packageId: PACKAGE_ID,
      productionMutationAllowed: false,
      outputSchemaVersion: "candidate-multi-cycle-lineage-evidence.v1",
      activation: await writeEvidence(
        evidenceRoot, "activation", activationExpected, activationSamples, true,
      ),
      accumulation: await writeEvidence(
        evidenceRoot, "accumulation", activationExpected, accumulationSamples,
      ),
      fresh: await writeEvidence(evidenceRoot, "fresh", freshExpected, freshSamples),
    });
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
  assert.equal(captured.lineage.status,
    "PASS_FRESH_VERIFICATION_CYCLE_READY_FOR_RECONCILIATION");
  assert.equal(captured.lineage.completedWrites, 10_020);
  assert.equal(captured.databaseIdentity.currentRole, "candidate_audit_role");
  assert.equal(Object.values(captured.sourceEvidenceSha256).flatMap(Object.values).length, 9);

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
    productionCaptureRunnerExercised: true,
    lineageStatus: captured.lineage.status,
    productionConnected: false,
  })}\n`);
} finally {
  await client.end();
}
