import { rename, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PACKAGE_ID = "WP-G0.2-VALIDATION-CYCLE-CONTINUATION";
export const CYCLE_DURATION_HOURS = 72;
const CYCLE_PATTERN = /^candidate-episode-v1(?:-cycle-([1-9][0-9]{0,5}))?$/;
const CANDIDATE_ENVIRONMENT = Object.freeze({
  CANDIDATE_EPISODE_CANONICAL_WRITE: "false",
  CANDIDATE_EPISODE_SHADOW_WRITE: "true",
  CANDIDATE_EPISODE_DUAL_READ: "false",
  CANDIDATE_EPISODE_CANONICAL_READ: "false",
  CANDIDATE_EPISODE_REVIEW_READ: "false",
  CANDIDATE_SHADOW_WORKER_EXPECTED: "true",
});
const DISABLED_CANDIDATE_ENVIRONMENT = Object.freeze({
  CANDIDATE_EPISODE_CANONICAL_WRITE: "false",
  CANDIDATE_EPISODE_SHADOW_WRITE: "false",
  CANDIDATE_EPISODE_DUAL_READ: "false",
  CANDIDATE_EPISODE_CANONICAL_READ: "false",
  CANDIDATE_EPISODE_REVIEW_READ: "false",
  CANDIDATE_SHADOW_WORKER_EXPECTED: "false",
});

export class CandidateCycleContinuationError extends Error {
  constructor(reason) {
    super(`candidate validation cycle continuation rejected: ${reason}`);
    this.name = "CandidateCycleContinuationError";
    this.reason = reason;
  }
}

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
  throw new CandidateCycleContinuationError("approved_pg_runtime_unavailable");
}

const pg = loadPgRuntime();

function ensure(condition, reason) {
  if (!condition) throw new CandidateCycleContinuationError(reason);
}

function safeCount(value, reason) {
  const parsed = Number(value);
  ensure(Number.isSafeInteger(parsed) && parsed >= 0, reason);
  return parsed;
}

function iso(value, reason) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  ensure(Number.isFinite(parsed), reason);
  return new Date(parsed).toISOString();
}

function parseCandidateValidationCycleId(value) {
  ensure(typeof value === "string", "cycle_id_invalid");
  const match = CYCLE_PATTERN.exec(value.trim());
  ensure(match, "cycle_id_invalid");
  const cycleNumber = match[1] ? Number(match[1]) : 1;
  ensure(Number.isSafeInteger(cycleNumber) && cycleNumber >= 1, "cycle_number_invalid");
  ensure(cycleNumber !== 1 || value.trim() === "candidate-episode-v1",
    "cycle_one_alias_forbidden");
  return { cycleNumber, migrationId: value.trim() };
}

function environmentEntries(source) {
  ensure(typeof source === "string" && source.length > 0, "environment_invalid");
  const entries = new Map();
  for (const line of source.split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u);
    if (!match) continue;
    ensure(!entries.has(match[1]), `environment_key_duplicate:${match[1]}`);
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    entries.set(match[1], value);
  }
  return entries;
}

function renderEnvironment(source, replacements) {
  const seen = new Set();
  const lines = source.split(/\r?\n/u).map((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/u);
    if (!match || !(match[1] in replacements)) return line;
    ensure(!seen.has(match[1]), `environment_key_duplicate:${match[1]}`);
    seen.add(match[1]);
    return `${match[1]}=${JSON.stringify(replacements[match[1]])}`;
  });
  for (const [key, value] of Object.entries(replacements)) {
    if (!seen.has(key)) lines.push(`${key}=${JSON.stringify(value)}`);
  }
  return `${lines.join("\n").replace(/\n+$/u, "")}\n`;
}

export function renderCycleContinuationEnvironment(source, rawInput) {
  const input = validateCycleContinuationInput(rawInput);
  const entries = environmentEntries(source);
  const expectedEnvironment = input.currentPhase === "shadow_capture"
    ? CANDIDATE_ENVIRONMENT
    : DISABLED_CANDIDATE_ENVIRONMENT;
  for (const [key, value] of Object.entries(expectedEnvironment)) {
    const sourceValue = entries.has(key)
      ? entries.get(key)
      : input.currentPhase === "legacy" ? DISABLED_CANDIDATE_ENVIRONMENT[key] : undefined;
    ensure(sourceValue?.toLowerCase() === value,
      `candidate_environment_source_mismatch:${key}`);
  }
  const sourceMigrationId = entries.has("CANDIDATE_RUNTIME_MIGRATION_ID")
    ? entries.get("CANDIDATE_RUNTIME_MIGRATION_ID")
    : input.currentPhase === "legacy" ? "candidate-episode-v1" : undefined;
  const sourceReleaseId = entries.has("CANDIDATE_RUNTIME_RELEASE_ID")
    ? entries.get("CANDIDATE_RUNTIME_RELEASE_ID")
    : input.currentPhase === "legacy" ? "disabled" : undefined;
  ensure(sourceMigrationId === input.currentMigrationId,
    "current_environment_cycle_mismatch");
  ensure(sourceReleaseId === (input.currentPhase === "shadow_capture"
    ? input.currentReleaseId
    : "disabled"),
    "current_environment_release_mismatch");
  return renderEnvironment(source, {
    ...CANDIDATE_ENVIRONMENT,
    CANDIDATE_RUNTIME_MIGRATION_ID: input.nextMigrationId,
    CANDIDATE_RUNTIME_RELEASE_ID: input.nextReleaseId,
  });
}

export function renderDisabledCandidateEnvironment(source, migrationId) {
  const parsed = parseCandidateValidationCycleId(migrationId);
  environmentEntries(source);
  return renderEnvironment(source, {
    ...DISABLED_CANDIDATE_ENVIRONMENT,
    CANDIDATE_RUNTIME_MIGRATION_ID: parsed.migrationId,
    CANDIDATE_RUNTIME_RELEASE_ID: "disabled",
  });
}

function nextCandidateValidationCycleId(value) {
  const current = parseCandidateValidationCycleId(value);
  const next = current.cycleNumber + 1;
  ensure(next <= 999_999, "cycle_number_invalid");
  return `candidate-episode-v1-cycle-${next}`;
}

export function validateCycleContinuationInput(input) {
  ensure(input && typeof input === "object" && !Array.isArray(input), "input_invalid");
  const current = parseCandidateValidationCycleId(input.currentMigrationId);
  const next = parseCandidateValidationCycleId(input.nextMigrationId);
  ensure(next.migrationId === nextCandidateValidationCycleId(current.migrationId),
    "next_cycle_not_adjacent");
  ensure(/^candidate-shadow-[a-z0-9][a-z0-9._-]{7,100}$/.test(input.currentReleaseId ?? ""),
    "current_release_invalid");
  ensure(/^candidate-shadow-[a-z0-9][a-z0-9._-]{7,100}$/.test(input.nextReleaseId ?? ""),
    "next_release_invalid");
  ensure(/^sha256:[0-9a-f]{64}$/.test(input.approvalDigest ?? ""),
    "approval_digest_invalid");
  ensure(input.currentPhase === "shadow_capture" || input.currentPhase === "legacy",
    "current_phase_invalid");
  ensure(Number.isSafeInteger(input.currentAuthorityEpoch) && input.currentAuthorityEpoch >= 1,
    "current_authority_epoch_invalid");
  ensure(input.currentPhase === "shadow_capture"
      ? input.currentAuthorityEpoch % 2 === 1
      : input.currentAuthorityEpoch >= 2 && input.currentAuthorityEpoch % 2 === 0,
  "current_phase_epoch_mismatch");
  return {
    approvalDigest: input.approvalDigest,
    currentAuthorityEpoch: input.currentAuthorityEpoch,
    currentMigrationId: current.migrationId,
    currentPhase: input.currentPhase,
    currentReleaseId: input.currentReleaseId,
    nextMigrationId: next.migrationId,
    nextReleaseId: input.nextReleaseId,
  };
}

async function dataSnapshot(client) {
  const result = await client.query(`SELECT
    (SELECT count(*)::bigint FROM candidate_authority.candidate_episodes) AS episodes,
    (SELECT count(*)::bigint FROM candidate_authority.candidate_episode_events) AS events,
    (SELECT count(*)::bigint FROM candidate_authority.candidate_episode_checkpoints) AS checkpoints,
    (SELECT count(*)::bigint FROM candidate_authority.candidate_episode_outcomes) AS outcomes,
    (SELECT count(*)::bigint FROM candidate_authority.candidate_episode_ingest_outbox) AS outbox,
    (SELECT count(*)::bigint FROM candidate_authority.candidate_outbox_quarantine_resolutions) AS resolutions,
    (SELECT count(*)::bigint FROM candidate_authority.candidate_episode_ingest_outbox
      WHERE source_type='legacy_scan_candidate' AND status='completed') AS "legacyCompleted",
    (SELECT count(*)::bigint FROM candidate_authority.candidate_episode_ingest_outbox
      WHERE source_type='legacy_scan_candidate' AND status='pending') AS "legacyPending",
    (SELECT count(*)::bigint FROM candidate_authority.candidate_episode_ingest_outbox
      WHERE source_type='legacy_scan_candidate' AND status='claimed') AS "legacyClaimed",
    (SELECT count(*)::bigint FROM candidate_authority.candidate_episode_ingest_outbox
      WHERE source_type='legacy_scan_candidate' AND status='retry_wait') AS "legacyRetryWait",
    (SELECT count(*)::bigint FROM candidate_authority.candidate_episode_ingest_outbox
      WHERE source_type='legacy_scan_candidate' AND status='quarantined') AS "legacyQuarantined",
    (SELECT count(*)::bigint FROM candidate_authority.candidate_episode_ingest_outbox outbox
      WHERE outbox.source_type='legacy_scan_candidate'
        AND outbox.status <> 'completed'
        AND NOT EXISTS (
          SELECT 1 FROM candidate_authority.candidate_outbox_quarantine_resolutions resolution
          WHERE resolution.scope=outbox.scope
            AND resolution.quarantined_outbox_id=outbox.outbox_id
        )) AS "legacyUnresolved",
    (SELECT count(*)::bigint FROM candidate_authority.candidate_episode_ingest_outbox
      WHERE source_type='candidate_episode_event' AND status='pending') AS "candidateEventPending",
    (SELECT count(*)::bigint FROM candidate_authority.candidate_episode_ingest_outbox
      WHERE source_type='candidate_episode_event' AND status<>'pending') AS "candidateEventNonPending",
    (SELECT count(*)::bigint FROM candidate_authority.candidate_episode_ingest_outbox outbox
      WHERE outbox.source_type='candidate_episode_event'
        AND NOT EXISTS (
          SELECT 1 FROM candidate_authority.candidate_episode_events event
          WHERE event.scope=outbox.scope AND event.event_id=outbox.outbox_id
        )) AS "candidateEventOrphans",
    (SELECT count(*)::bigint FROM candidate_authority.candidate_episode_ingest_outbox outbox
      JOIN candidate_authority.candidate_episode_events event
        ON event.scope=outbox.scope AND event.event_id=outbox.outbox_id
      WHERE outbox.source_type='candidate_episode_event'
        AND (outbox.source_id IS DISTINCT FROM event.event_id::text
          OR outbox.source_version IS DISTINCT FROM event.stream_version::text
          OR outbox.payload_version IS DISTINCT FROM event.payload_version
          OR outbox.payload_hash IS DISTINCT FROM event.command_hash
          OR outbox.idempotency_key IS DISTINCT FROM event.idempotency_key
          OR outbox.payload->>'episodeId' IS DISTINCT FROM event.episode_id::text
          OR outbox.payload->>'eventType' IS DISTINCT FROM event.event_type))
      AS "candidateEventContractMismatches",
    (SELECT count(*)::bigint FROM candidate_authority.candidate_episode_ingest_outbox
      WHERE source_type NOT IN ('legacy_scan_candidate','candidate_episode_event')
        AND status<>'completed') AS "otherSourceUnresolved"`);
  const row = result.rows[0];
  ensure(row, "data_snapshot_missing");
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    safeCount(value, `data_count_invalid:${key}`),
  ]));
}

async function controlSnapshot(client) {
  const result = await client.query(`SELECT migration_id, phase, epoch::bigint,
    started_at, deadline_at, write_frozen, approved_release_id, approval_digest,
    updated_at, clock_timestamp() AS database_now
    FROM candidate_authority.candidate_migration_control
    ORDER BY started_at, migration_id`);
  return result.rows.map((row) => ({
    approvalDigest: row.approval_digest,
    approvedReleaseId: row.approved_release_id,
    databaseNow: iso(row.database_now, "control_database_now_invalid"),
    deadlineAt: iso(row.deadline_at, "control_deadline_invalid"),
    epoch: safeCount(row.epoch, "control_epoch_invalid"),
    migrationId: row.migration_id,
    phase: row.phase,
    startedAt: iso(row.started_at, "control_started_at_invalid"),
    updatedAt: iso(row.updated_at, "control_updated_at_invalid"),
    writeFrozen: row.write_frozen,
  }));
}

function validatePreflight(controls, data, input) {
  const identities = controls.map((control) => parseCandidateValidationCycleId(control.migrationId));
  const current = controls.find((control) => control.migrationId === input.currentMigrationId);
  ensure(current, "current_cycle_missing");
  const continuingActiveCycle = input.currentPhase === "shadow_capture";
  ensure(continuingActiveCycle
    ? current.phase === "shadow_capture" && current.writeFrozen === false
    : current.phase === "legacy" && current.writeFrozen === true,
  continuingActiveCycle
    ? "current_cycle_not_active_shadow_capture"
    : "current_cycle_not_retired_legacy");
  ensure(current.approvedReleaseId === input.currentReleaseId, "current_release_mismatch");
  ensure(current.epoch === input.currentAuthorityEpoch, "current_authority_epoch_mismatch");
  ensure(!controls.some((control) => control.migrationId === input.nextMigrationId),
    "next_cycle_already_exists");
  ensure(controls.filter((control) => control.phase !== "legacy").length
      === (continuingActiveCycle ? 1 : 0),
    "active_cycle_count_invalid");
  ensure(controls.filter((control) => control.phase === "legacy")
    .every((control) => control.writeFrozen === true), "retired_cycle_not_frozen");
  ensure(Math.max(...identities.map((identity) => identity.cycleNumber))
    === parseCandidateValidationCycleId(input.currentMigrationId).cycleNumber,
  "current_cycle_not_latest");
  ensure(data.legacyUnresolved === 0, "unresolved_outbox_blocks_cycle_continuation");
  ensure(data.legacyPending === 0 && data.legacyClaimed === 0
      && data.legacyRetryWait === 0 && data.legacyQuarantined === 0,
  "legacy_source_lane_not_clean");
  ensure(data.otherSourceUnresolved === 0, "other_source_lane_unresolved");
  ensure(data.resolutions === 0, "quarantine_resolution_present");
  ensure(data.candidateEventOrphans === 0 && data.candidateEventContractMismatches === 0,
    "candidate_event_lane_integrity_invalid");
  return {
    current,
    continuationMode: continuingActiveCycle
      ? "retire_active_then_start_adjacent"
      : "start_adjacent_from_retired",
  };
}

export async function preflightCandidateValidationCycleContinuation(client, rawInput) {
  const input = validateCycleContinuationInput(rawInput);
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY");
  try {
    await client.query("SET LOCAL ROLE candidate_migration_role");
    const [controls, data] = await Promise.all([
      controlSnapshot(client),
      dataSnapshot(client),
    ]);
    const { current, continuationMode } = validatePreflight(controls, data, input);
    await client.query("COMMIT");
    return {
      schemaVersion: "candidate-validation-cycle-continuation-preflight.v1",
      status: "PASS_CYCLE_CONTINUATION_PREFLIGHT",
      currentCycle: current,
      continuationMode,
      data,
      nextMigrationId: input.nextMigrationId,
      productionMutation: false,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function continueCandidateValidationCycle(client, rawInput) {
  const input = validateCycleContinuationInput(rawInput);
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ WRITE");
  try {
    await client.query("SET LOCAL ROLE candidate_migration_role");
    await client.query(
      "LOCK TABLE candidate_authority.candidate_migration_control IN SHARE ROW EXCLUSIVE MODE",
    );
    const beforeControls = await controlSnapshot(client);
    const beforeData = await dataSnapshot(client);
    const { current, continuationMode } = validatePreflight(beforeControls, beforeData, input);

    if (continuationMode === "retire_active_then_start_adjacent") {
      const retiredResult = await client.query(`SELECT migration_id, phase, epoch::bigint,
        started_at, deadline_at, write_frozen, approved_release_id, approval_digest,
        updated_at, clock_timestamp() AS database_now
        FROM candidate_authority.transition_migration_control_v1(
          $1,$2,'legacy',true,$3,$4,clock_timestamp()
        )`, [
        input.currentMigrationId,
        current.epoch,
        input.currentReleaseId,
        input.approvalDigest,
      ]);
      ensure(retiredResult.rows[0]?.phase === "legacy"
        && retiredResult.rows[0]?.write_frozen === true, "current_cycle_retirement_failed");
    }

    const startedResult = await client.query(`SELECT migration_id, phase, epoch::bigint,
      started_at, deadline_at, write_frozen, approved_release_id, approval_digest,
      updated_at, clock_timestamp() AS database_now
      FROM candidate_authority.start_shadow_capture_v3($1,$2,$3)`, [
      input.nextMigrationId,
      input.nextReleaseId,
      input.approvalDigest,
    ]);
    const started = startedResult.rows[0];
    ensure(started?.migration_id === input.nextMigrationId
      && started.phase === "shadow_capture"
      && Number(started.epoch) === 1
      && started.write_frozen === false
      && started.approved_release_id === input.nextReleaseId,
    "next_cycle_start_failed");

    const afterControls = await controlSnapshot(client);
    const afterData = await dataSnapshot(client);
    const retired = afterControls.find((control) => control.migrationId === input.currentMigrationId);
    const next = afterControls.find((control) => control.migrationId === input.nextMigrationId);
    ensure(retired?.phase === "legacy" && retired.writeFrozen === true,
      "retired_cycle_not_legacy_frozen");
    ensure(retired.startedAt === current.startedAt && retired.deadlineAt === current.deadlineAt,
      "retired_cycle_deadline_mutated");
    ensure(next?.phase === "shadow_capture" && next.writeFrozen === false,
      "next_cycle_not_active");
    ensure(Date.parse(next.deadlineAt) - Date.parse(next.startedAt)
      === CYCLE_DURATION_HOURS * 60 * 60_000, "next_cycle_duration_invalid");
    ensure(afterControls.filter((control) => control.phase !== "legacy").length === 1,
      "post_continuation_active_cycle_count_invalid");
    ensure(JSON.stringify(afterData) === JSON.stringify(beforeData),
      "candidate_data_changed_during_cycle_continuation");
    await client.query("COMMIT");
    return {
      schemaVersion: "candidate-validation-cycle-continuation-result.v1",
      status: "PASS_VALIDATION_CYCLE_CONTINUATION",
      previousCycle: retired,
      activeCycle: next,
      preservedData: afterData,
      continuationMode,
      deadlineReset: false,
      thresholdChanged: false,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function rollbackCandidateValidationCycle(client, rawInput) {
  const input = validateCycleContinuationInput(rawInput);
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ WRITE");
  try {
    await client.query("SET LOCAL ROLE candidate_migration_role");
    await client.query(
      "LOCK TABLE candidate_authority.candidate_migration_control IN SHARE ROW EXCLUSIVE MODE",
    );
    const beforeData = await dataSnapshot(client);
    const beforeControls = await controlSnapshot(client);
    const next = beforeControls.find((control) => control.migrationId === input.nextMigrationId);
    ensure(next, "rollback_cycle_missing");
    ensure(next.approvedReleaseId === input.nextReleaseId, "rollback_release_mismatch");
    if (next.phase !== "legacy" || next.writeFrozen !== true) {
      ensure(next.phase === "shadow_capture" && next.writeFrozen === false,
        "rollback_cycle_not_active_shadow_capture");
      await client.query(`SELECT migration_id FROM
        candidate_authority.transition_migration_control_v1(
          $1,$2,'legacy',true,$3,$4,clock_timestamp()
        )`, [
        input.nextMigrationId,
        next.epoch,
        input.nextReleaseId,
        input.approvalDigest,
      ]);
    }
    const afterControls = await controlSnapshot(client);
    const afterData = await dataSnapshot(client);
    const retired = afterControls.find((control) => control.migrationId === input.nextMigrationId);
    ensure(retired?.phase === "legacy" && retired.writeFrozen === true,
      "rollback_cycle_not_legacy_frozen");
    ensure(retired.startedAt === next.startedAt && retired.deadlineAt === next.deadlineAt,
      "rollback_cycle_deadline_mutated");
    ensure(afterControls.every((control) => control.phase === "legacy" && control.writeFrozen === true),
      "rollback_active_cycle_remains");
    ensure(JSON.stringify(afterData) === JSON.stringify(beforeData),
      "candidate_data_changed_during_cycle_rollback");
    await client.query("COMMIT");
    return {
      schemaVersion: "candidate-validation-cycle-continuation-rollback.v1",
      status: "PASS_VALIDATION_CYCLE_FROZEN_LEGACY_AUTHORITY",
      frozenCycle: retired,
      preservedData: afterData,
      candidateRuntimeAllowed: false,
      legacyAuthorityRetained: true,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function readCandidateValidationCycleObservation(client, rawInput) {
  const input = validateCycleContinuationInput(rawInput);
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const safetyResult = await client.query(`
      SELECT
        (SELECT count(*)::int FROM pg_locks WHERE NOT granted) AS "lockWaiters",
        (SELECT count(*)::int FROM pg_stat_activity
          WHERE pid <> pg_backend_pid() AND xact_start IS NOT NULL
            AND clock_timestamp() - xact_start > interval '5 minutes') AS "longTransactions"`);
    const safety = safetyResult.rows[0];
    ensure(safety, "observation_database_safety_missing");
    await client.query("SET LOCAL ROLE candidate_audit_role");
    const controls = await controlSnapshot(client);
    const data = await dataSnapshot(client);
    const active = controls.filter((control) => control.phase !== "legacy");
    const current = active[0];
    ensure(active.length === 1, "observation_active_cycle_count_invalid");
    ensure(current.migrationId === input.nextMigrationId, "observation_cycle_mismatch");
    ensure(current.approvedReleaseId === input.nextReleaseId, "observation_release_mismatch");
    ensure(current.phase === "shadow_capture" && current.writeFrozen === false,
      "observation_cycle_not_active");
    ensure(data.legacyUnresolved === 0, "observation_unresolved_outbox");
    ensure(data.legacyClaimed === 0 && data.legacyRetryWait === 0
        && data.legacyQuarantined === 0 && data.otherSourceUnresolved === 0,
    "observation_source_lane_not_clean");
    ensure(data.candidateEventOrphans === 0 && data.candidateEventContractMismatches === 0,
      "observation_candidate_event_integrity_invalid");
    await client.query("COMMIT");
    return {
      schemaVersion: "candidate-validation-cycle-database-snapshot.v1",
      sampledAt: current.databaseNow,
      migrationId: current.migrationId,
      releaseId: current.approvedReleaseId,
      phase: current.phase,
      epoch: current.epoch,
      deadlineAt: current.deadlineAt,
      completedWrites: data.legacyCompleted,
      unresolvedOutbox: data.legacyUnresolved,
      activeCycles: active.length,
      database: {
        lockWaiters: safeCount(safety.lockWaiters, "observation_lock_waiters_invalid"),
        longTransactions: safeCount(
          safety.longTransactions,
          "observation_long_transactions_invalid",
        ),
      },
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    ensure(rest[index]?.startsWith("--") && rest[index + 1] !== undefined,
      "cli_arguments_invalid");
    options[rest[index].slice(2)] = rest[index + 1];
  }
  return { command, options };
}

async function readSecureJson(path, reason) {
  const metadata = await import("node:fs/promises").then(({ lstat }) => lstat(resolve(path)));
  ensure(metadata.isFile() && !metadata.isSymbolicLink() && (metadata.mode & 0o077) === 0,
    `${reason}_file_invalid`);
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function writeAtomic(path, contents) {
  const target = resolve(path);
  const temporary = resolve(dirname(target), `.${target.split("/").at(-1)}.${process.pid}.tmp`);
  await writeFile(temporary, contents, { mode: 0o600 });
  await rename(temporary, target);
}

async function withClient(urlFile, work) {
  const metadata = await import("node:fs/promises").then(({ lstat }) => lstat(resolve(urlFile)));
  ensure(metadata.isFile() && !metadata.isSymbolicLink() && (metadata.mode & 0o077) === 0,
    "database_url_file_invalid");
  const connectionString = (await readFile(resolve(urlFile), "utf8")).trim();
  ensure(connectionString.startsWith("postgresql://") && !connectionString.includes("\n"),
    "database_url_invalid");
  const client = new pg.Client({
    application_name: "market-radar-candidate-cycle-continuation",
    connectionString,
  });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  const input = await readSecureJson(options.request, "request");
  if (command === "render-env") {
    const source = await readFile(resolve(options.source), "utf8");
    await writeAtomic(options.output, renderCycleContinuationEnvironment(source, input));
    process.stdout.write('{"status":"pass","changedKeys":2,"secretsPrinted":false}\n');
    return;
  }
  if (command === "render-disabled-env") {
    const source = await readFile(resolve(options.source), "utf8");
    await writeAtomic(options.output, renderDisabledCandidateEnvironment(source, input.nextMigrationId));
    process.stdout.write('{"status":"pass","candidateRuntimeAllowed":false,"secretsPrinted":false}\n');
    return;
  }
  const result = await withClient(options["admin-url-file"], (client) => {
    if (command === "control-preflight") {
      return preflightCandidateValidationCycleContinuation(client, input);
    }
    if (command === "control-continue") return continueCandidateValidationCycle(client, input);
    if (command === "control-rollback") return rollbackCandidateValidationCycle(client, input);
    if (command === "observation-snapshot") {
      return readCandidateValidationCycleObservation(client, input);
    }
    throw new CandidateCycleContinuationError("cli_command_invalid");
  });
  process.stdout.write(`${JSON.stringify({ ...result, secretsPrinted: false })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      status: "fail",
      reason: error?.reason ?? error?.message ?? "unexpected_error",
    })}\n`);
    process.exitCode = 1;
  });
}
