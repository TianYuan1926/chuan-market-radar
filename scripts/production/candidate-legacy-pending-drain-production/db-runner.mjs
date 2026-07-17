#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateDrainCompletion,
  evaluateDrainPreflight,
  openDrainEpoch,
  closeDrainEpoch,
  rollbackDrainEpoch,
} from "../candidate-legacy-pending-drain/runner.mjs";

export const PACKAGE_ID = "WP-G0.2-LEGACY-PENDING-DRAIN-PRODUCTION";

export function loadPgRuntime({
  applicationRoot = "/app",
  moduleUrl = import.meta.url,
  requireFactory = createRequire,
} = {}) {
  const candidates = [
    requireFactory(resolve(applicationRoot, "package.json")),
    requireFactory(moduleUrl),
  ];
  for (const requireCandidate of candidates) {
    try {
      return requireCandidate("pg");
    } catch (error) {
      if (error?.code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  throw new Error("candidate pending drain production rejected: approved_pg_runtime_unavailable");
}

const pg = loadPgRuntime();

function ensure(condition, reason) {
  if (!condition) throw new Error(`candidate pending drain production rejected: ${reason}`);
}

function boolean(value, reason) {
  ensure(value === "true" || value === "false", reason);
  return value === "true";
}

function integer(value, reason) {
  const parsed = Number(value);
  ensure(Number.isSafeInteger(parsed) && parsed >= 0, reason);
  return parsed;
}

function iso(value, reason) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  ensure(Number.isFinite(parsed), reason);
  return new Date(parsed).toISOString();
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    ensure(key?.startsWith("--") && value !== undefined, "arguments_invalid");
    args[key.slice(2)] = value;
  }
  ensure(["close", "open", "preflight", "rollback", "snapshot", "verify"].includes(command),
    "command_invalid");
  return { args, command };
}

export async function readProductionRequest(path) {
  const request = JSON.parse(await readFile(path, "utf8"));
  ensure(request.schemaVersion === "candidate-legacy-pending-drain-production-request.v1",
    "request_schema_invalid");
  ensure(request.packageId === PACKAGE_ID, "request_package_invalid");
  ensure(request.migrationId === "candidate-episode-v1", "request_migration_invalid");
  ensure(request.currentPhase === "legacy" && request.currentWriteFrozen === true,
    "request_control_invalid");
  ensure(Number.isSafeInteger(request.sourceEpoch) && request.sourceEpoch >= 4
      && request.sourceEpoch % 2 === 0, "request_source_epoch_invalid");
  ensure(request.drainEpoch === request.sourceEpoch + 1
      && request.finalEpoch === request.sourceEpoch + 2, "request_epoch_sequence_invalid");
  ensure(/^candidate-shadow-[a-z0-9][a-z0-9._-]{7,100}$/u.test(request.releaseId ?? ""),
    "request_release_invalid");
  ensure(/^sha256:[0-9a-f]{64}$/u.test(request.controlApprovalDigest ?? ""),
    "request_approval_digest_invalid");
  ensure(request.expectedCounts?.outbox === 5_914
      && request.expectedCounts?.completed === 2_957
      && request.expectedCounts?.pending === 2_957
      && request.expectedCounts?.unresolved === 2_957, "request_counts_invalid");
  return request;
}

export async function readDatabaseUrl(path) {
  const value = (await readFile(path, "utf8")).trim();
  ensure(/^postgres(?:ql)?:\/\//u.test(value), "database_url_invalid");
  return value;
}

export async function readDrainDatabaseSnapshot(client, runtime) {
  const result = await client.query(`SELECT
    clock_timestamp() AS database_now,
    (SELECT count(*)::int FROM candidate_authority.schema_migrations) AS migration_count,
    control.migration_id, control.phase, control.epoch::int, control.started_at,
    control.deadline_at, control.write_frozen, control.approved_release_id,
    control.approval_digest,
    (SELECT count(*)::int FROM candidate_authority.candidate_episodes) AS episodes,
    (SELECT count(*)::int FROM candidate_authority.candidate_episode_events) AS events,
    (SELECT count(*)::int FROM candidate_authority.candidate_episode_checkpoints) AS checkpoints,
    (SELECT count(*)::int FROM candidate_authority.candidate_episode_outcomes) AS outcomes,
    (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox) AS outbox,
    (SELECT count(*) FILTER (WHERE status='completed')::int
      FROM candidate_authority.candidate_episode_ingest_outbox) AS completed,
    (SELECT count(*) FILTER (WHERE status='pending')::int
      FROM candidate_authority.candidate_episode_ingest_outbox) AS pending,
    (SELECT count(*) FILTER (WHERE status='claimed')::int
      FROM candidate_authority.candidate_episode_ingest_outbox) AS claimed,
    (SELECT count(*) FILTER (WHERE status='retry_wait')::int
      FROM candidate_authority.candidate_episode_ingest_outbox) AS retry_wait,
    (SELECT count(*) FILTER (WHERE status='quarantined')::int
      FROM candidate_authority.candidate_episode_ingest_outbox) AS quarantined,
    (SELECT count(*) FILTER (WHERE status<>'completed')::int
      FROM candidate_authority.candidate_episode_ingest_outbox) AS unresolved,
    (SELECT count(*)::int FROM candidate_authority.candidate_outbox_quarantine_resolutions)
      AS resolutions
    FROM candidate_authority.candidate_migration_control control
    WHERE control.migration_id='candidate-episode-v1'`);
  ensure(result.rows.length === 1, "control_row_count_invalid");
  const row = result.rows[0];
  return {
    candidateWorkerAbsent: runtime.candidateWorkerAbsent,
    control: {
      approvalDigest: row.approval_digest,
      deadlineAt: iso(row.deadline_at, "deadline_invalid"),
      epoch: integer(row.epoch, "epoch_invalid"),
      migrationId: row.migration_id,
      phase: row.phase,
      releaseId: row.approved_release_id,
      startedAt: iso(row.started_at, "started_at_invalid"),
      writeFrozen: row.write_frozen,
    },
    counts: {
      checkpoints: integer(row.checkpoints, "checkpoints_invalid"),
      claimed: integer(row.claimed, "claimed_invalid"),
      completed: integer(row.completed, "completed_invalid"),
      episodes: integer(row.episodes, "episodes_invalid"),
      events: integer(row.events, "events_invalid"),
      outbox: integer(row.outbox, "outbox_invalid"),
      outcomes: integer(row.outcomes, "outcomes_invalid"),
      pending: integer(row.pending, "pending_invalid"),
      quarantined: integer(row.quarantined, "quarantined_invalid"),
      resolutions: integer(row.resolutions, "resolutions_invalid"),
      retryWait: integer(row.retry_wait, "retry_wait_invalid"),
      unresolved: integer(row.unresolved, "unresolved_invalid"),
    },
    databaseNow: iso(row.database_now, "database_now_invalid"),
    migrationCount: integer(row.migration_count, "migration_count_invalid"),
    scannerPaused: runtime.scannerPaused,
    sourceWriteReachable: runtime.sourceWriteReachable,
  };
}

function assertRequestSnapshot(request, snapshot) {
  ensure(snapshot.control.epoch === request.sourceEpoch, "snapshot_epoch_mismatch");
  ensure(snapshot.control.releaseId === request.releaseId, "snapshot_release_mismatch");
  ensure(snapshot.control.approvalDigest === request.controlApprovalDigest,
    "snapshot_approval_digest_mismatch");
  for (const key of ["outbox", "completed", "pending", "unresolved"]) {
    ensure(snapshot.counts[key] === request.expectedCounts[key], `snapshot_count_mismatch:${key}`);
  }
}

export async function executeDatabaseCommand({ client, command, request, runtime, beforeSnapshot }) {
  if (command === "snapshot") return readDrainDatabaseSnapshot(client, runtime);
  if (command === "preflight") {
    const snapshot = await readDrainDatabaseSnapshot(client, runtime);
    assertRequestSnapshot(request, snapshot);
    return { ...evaluateDrainPreflight(snapshot), snapshot };
  }
  const input = {
    approvalDigest: request.controlApprovalDigest,
    migrationId: request.migrationId,
    releaseId: request.releaseId,
  };
  if (command === "open") {
    const control = await openDrainEpoch(client, { ...input, expectedEpoch: request.sourceEpoch });
    return { status: "PASS_DRAIN_EPOCH_OPEN", control, secretsPrinted: false };
  }
  if (command === "close") {
    const control = await closeDrainEpoch(client, { ...input, expectedEpoch: request.drainEpoch });
    return { status: "PASS_DRAIN_EPOCH_CLOSED", control, secretsPrinted: false };
  }
  if (command === "rollback") {
    const current = await readDrainDatabaseSnapshot(client, {
      candidateWorkerAbsent: true, scannerPaused: true, sourceWriteReachable: false,
    });
    if (current.control.phase === "legacy" && current.control.writeFrozen === true) {
      return { status: "PASS_DRAIN_ALREADY_FROZEN", control: current.control, secretsPrinted: false };
    }
    ensure(current.control.phase === "shadow_capture"
        && current.control.epoch === request.drainEpoch, "rollback_control_invalid");
    const control = await rollbackDrainEpoch(client, { ...input, expectedEpoch: request.drainEpoch });
    return { status: "PASS_DRAIN_ROLLBACK_FROZEN", control, secretsPrinted: false };
  }
  ensure(command === "verify", "command_invalid");
  ensure(beforeSnapshot, "before_snapshot_missing");
  const after = await readDrainDatabaseSnapshot(client, runtime);
  const result = evaluateDrainCompletion(beforeSnapshot, after);
  return { ...result, after };
}

async function main() {
  const { args, command } = parseArgs(process.argv.slice(2));
  const request = await readProductionRequest(resolve(args.request));
  const databaseUrl = await readDatabaseUrl(resolve(args["database-url-file"]));
  const runtime = {
    candidateWorkerAbsent: boolean(args["candidate-worker-absent"], "worker_flag_invalid"),
    scannerPaused: boolean(args["scanner-paused"], "scanner_flag_invalid"),
    sourceWriteReachable: boolean(args["source-write-reachable"], "source_flag_invalid"),
  };
  const beforeSnapshot = args["before-snapshot"]
    ? JSON.parse(await readFile(resolve(args["before-snapshot"]), "utf8"))
    : null;
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await executeDatabaseCommand({
      beforeSnapshot, client: pool, command, request, runtime,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
