export const PACKAGE_ID = "WP-G0.2-VALIDATION-CYCLE-CONTINUATION";
export const CYCLE_DURATION_HOURS = 72;
const CYCLE_PATTERN = /^candidate-episode-v1(?:-cycle-([1-9][0-9]{0,5}))?$/;

export class CandidateCycleContinuationError extends Error {
  constructor(reason) {
    super(`candidate validation cycle continuation rejected: ${reason}`);
    this.name = "CandidateCycleContinuationError";
    this.reason = reason;
  }
}

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
  return {
    approvalDigest: input.approvalDigest,
    currentMigrationId: current.migrationId,
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
      WHERE source_type='legacy_scan_candidate' AND status='completed') AS completed,
    (SELECT count(*)::bigint FROM candidate_authority.candidate_episode_ingest_outbox outbox
      WHERE outbox.source_type='legacy_scan_candidate'
        AND outbox.status <> 'completed'
        AND NOT EXISTS (
          SELECT 1 FROM candidate_authority.candidate_outbox_quarantine_resolutions resolution
          WHERE resolution.scope=outbox.scope
            AND resolution.quarantined_outbox_id=outbox.outbox_id
        )) AS unresolved`);
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
  ensure(current.phase === "shadow_capture" && current.writeFrozen === false,
    "current_cycle_not_active_shadow_capture");
  ensure(current.approvedReleaseId === input.currentReleaseId, "current_release_mismatch");
  ensure(!controls.some((control) => control.migrationId === input.nextMigrationId),
    "next_cycle_already_exists");
  ensure(controls.filter((control) => control.phase !== "legacy").length === 1,
    "active_cycle_count_invalid");
  ensure(controls.filter((control) => control.phase === "legacy")
    .every((control) => control.writeFrozen === true), "retired_cycle_not_frozen");
  ensure(Math.max(...identities.map((identity) => identity.cycleNumber))
    === parseCandidateValidationCycleId(input.currentMigrationId).cycleNumber,
  "current_cycle_not_latest");
  ensure(data.unresolved === 0, "unresolved_outbox_blocks_cycle_continuation");
  return current;
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
    const current = validatePreflight(controls, data, input);
    await client.query("COMMIT");
    return {
      schemaVersion: "candidate-validation-cycle-continuation-preflight.v1",
      status: "PASS_CYCLE_CONTINUATION_PREFLIGHT",
      currentCycle: current,
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
    const current = validatePreflight(beforeControls, beforeData, input);

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
      deadlineReset: false,
      thresholdChanged: false,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
