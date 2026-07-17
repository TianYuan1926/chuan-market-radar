export const PACKAGE_ID = "WP-G0.2-LEGACY-PENDING-DRAIN-REMEDIATION-LOCAL-SUPERPACKAGE";
export const MIGRATION_ID = "candidate-episode-v1";
export const REQUIRED_MIGRATION_COUNT = 10;
export const MINIMUM_DEADLINE_REMAINING_SECONDS = 1_800;

export class CandidateLegacyPendingDrainError extends Error {
  constructor(reason) {
    super(`candidate legacy pending drain rejected: ${reason}`);
    this.name = "CandidateLegacyPendingDrainError";
    this.reason = reason;
  }
}

function ensure(condition, reason) {
  if (!condition) throw new CandidateLegacyPendingDrainError(reason);
}

function integer(value, reason, minimum = 0) {
  ensure(Number.isSafeInteger(value) && value >= minimum, reason);
  return value;
}

function instant(value, reason) {
  const parsed = Date.parse(value);
  ensure(Number.isFinite(parsed), reason);
  return parsed;
}

function exactKeys(value, expected, reason) {
  ensure(value && typeof value === "object" && !Array.isArray(value), reason);
  ensure(Object.keys(value).sort().join("\n") === [...expected].sort().join("\n"), reason);
}

const COUNT_KEYS = [
  "candidateEventPending",
  "candidateEventUnresolved",
  "checkpoints",
  "claimed",
  "completed",
  "episodes",
  "events",
  "legacyCompleted",
  "legacyPending",
  "legacyUnresolved",
  "otherUnresolved",
  "outbox",
  "outcomes",
  "pending",
  "quarantined",
  "resolutions",
  "retryWait",
  "unresolved",
];

export function validateDrainSnapshot(snapshot, options = {}) {
  exactKeys(snapshot, [
    "candidateWorkerAbsent",
    "control",
    "counts",
    "databaseNow",
    "migrationCount",
    "scannerPaused",
    "sourceWriteReachable",
  ], "snapshot_shape_invalid");
  exactKeys(snapshot.control, [
    "approvalDigest",
    "deadlineAt",
    "epoch",
    "migrationId",
    "phase",
    "releaseId",
    "startedAt",
    "writeFrozen",
  ], "control_shape_invalid");
  exactKeys(snapshot.counts, COUNT_KEYS, "counts_shape_invalid");

  ensure(integer(snapshot.migrationCount, "migration_count_invalid") === REQUIRED_MIGRATION_COUNT,
    "migration_count_not_10");
  for (const key of COUNT_KEYS) integer(snapshot.counts[key], `count_invalid:${key}`);
  ensure(snapshot.control.migrationId === MIGRATION_ID, "control_migration_id_invalid");
  ensure(snapshot.control.phase === (options.phase ?? "legacy"), "control_phase_invalid");
  ensure(snapshot.control.writeFrozen === (options.writeFrozen ?? true), "control_write_frozen_invalid");
  ensure(Number.isSafeInteger(snapshot.control.epoch) && snapshot.control.epoch >= 4,
    "control_epoch_invalid");
  ensure(snapshot.control.epoch % 2 === (options.epochParity ?? 0), "control_epoch_parity_invalid");
  ensure(/^candidate-shadow-[a-z0-9][a-z0-9._-]{7,100}$/.test(snapshot.control.releaseId ?? ""),
    "control_release_invalid");
  ensure(/^sha256:[0-9a-f]{64}$/.test(snapshot.control.approvalDigest ?? ""),
    "control_approval_digest_invalid");
  const databaseNow = instant(snapshot.databaseNow, "database_now_invalid");
  const startedAt = instant(snapshot.control.startedAt, "control_started_at_invalid");
  const deadlineAt = instant(snapshot.control.deadlineAt, "control_deadline_invalid");
  ensure(deadlineAt > startedAt, "control_window_invalid");
  ensure((deadlineAt - databaseNow) / 1_000 >= MINIMUM_DEADLINE_REMAINING_SECONDS,
    "control_deadline_remaining_insufficient");
  ensure(snapshot.scannerPaused === true, "scanner_not_paused");
  ensure(snapshot.sourceWriteReachable === false, "candidate_source_write_reachable");
  ensure(snapshot.candidateWorkerAbsent === (options.candidateWorkerAbsent ?? true),
    "candidate_worker_state_invalid");

  const counts = snapshot.counts;
  ensure(counts.outbox > 0, "outbox_empty");
  ensure(counts.outbox === counts.completed + counts.pending + counts.claimed
      + counts.retryWait + counts.quarantined,
  "outbox_status_sum_mismatch");
  ensure(counts.resolutions === 0, "quarantine_resolution_present");
  ensure(counts.unresolved === counts.pending + counts.claimed + counts.retryWait + counts.quarantined,
    "unresolved_count_mismatch");
  ensure(counts.completed >= counts.legacyCompleted, "legacy_completed_exceeds_global");
  ensure(counts.pending >= counts.legacyPending + counts.candidateEventPending,
    "source_lane_pending_exceeds_global");
  ensure(counts.legacyUnresolved >= counts.legacyPending,
    "legacy_unresolved_below_pending");
  ensure(counts.candidateEventUnresolved >= counts.candidateEventPending,
    "candidate_event_unresolved_below_pending");
  ensure(counts.unresolved === counts.legacyUnresolved
      + counts.candidateEventUnresolved + counts.otherUnresolved,
  "source_lane_unresolved_sum_mismatch");
  return {
    ...snapshot,
    databaseNowMs: databaseNow,
    deadlineAtMs: deadlineAt,
    startedAtMs: startedAt,
  };
}

export function evaluateDrainPreflight(snapshot) {
  const current = validateDrainSnapshot(snapshot);
  ensure(current.counts.legacyPending > 0, "legacy_pending_work_missing");
  ensure(current.counts.claimed === 0, "claimed_work_present");
  ensure(current.counts.retryWait === 0, "retry_wait_present");
  ensure(current.counts.quarantined === 0, "quarantined_work_present");
  ensure(current.counts.legacyUnresolved === current.counts.legacyPending,
    "legacy_unresolved_not_pending_only");
  ensure(current.counts.candidateEventUnresolved === 0,
    "candidate_event_lane_present_in_legacy_only_packet");
  ensure(current.counts.otherUnresolved === 0,
    "other_source_lane_present_in_legacy_only_packet");
  ensure(current.counts.pending === current.counts.legacyPending
      && current.counts.unresolved === current.counts.legacyPending,
  "global_state_not_legacy_pending_only");
  return {
    schemaVersion: "candidate-legacy-pending-drain-preflight.v1",
    status: "PASS_LEGACY_PENDING_ONLY_DRAIN_PREFLIGHT",
    migrationCount: current.migrationCount,
    migrationId: current.control.migrationId,
    sourceEpoch: current.control.epoch,
    drainEpoch: current.control.epoch + 1,
    finalFrozenEpoch: current.control.epoch + 2,
    releaseId: current.control.releaseId,
    pending: current.counts.legacyPending,
    completedBefore: current.counts.completed,
    outboxTotal: current.counts.outbox,
    sourceWriteReachable: false,
    scannerPaused: true,
    candidateBusinessDataDeleteAllowed: false,
    productionMutation: false,
  };
}

export function evaluateDrainCompletion(beforeSnapshot, afterSnapshot) {
  const before = validateDrainSnapshot(beforeSnapshot);
  const after = validateDrainSnapshot(afterSnapshot);
  ensure(after.control.phase === "legacy" && after.control.writeFrozen === true,
    "final_control_not_frozen_legacy");
  ensure(after.control.epoch === before.control.epoch + 2, "final_control_epoch_invalid");
  ensure(after.control.releaseId === before.control.releaseId, "control_release_changed");
  ensure(after.control.startedAt === before.control.startedAt, "control_started_at_changed");
  ensure(after.control.deadlineAt === before.control.deadlineAt, "control_deadline_changed");
  ensure(after.counts.outbox === before.counts.outbox, "outbox_total_changed");
  ensure(after.counts.completed === before.counts.outbox, "outbox_not_fully_completed");
  ensure(after.counts.pending === 0 && after.counts.claimed === 0
      && after.counts.retryWait === 0 && after.counts.quarantined === 0,
  "terminal_outbox_state_invalid");
  ensure(after.counts.unresolved === 0, "unresolved_not_zero");
  ensure(after.counts.resolutions === before.counts.resolutions, "resolution_count_changed");
  ensure(after.counts.events === before.counts.events + before.counts.pending,
    "event_projection_count_mismatch");
  ensure(after.counts.episodes >= before.counts.episodes, "episode_count_regressed");
  ensure(after.counts.episodes <= before.counts.episodes + before.counts.pending,
    "episode_count_growth_invalid");
  ensure(after.counts.checkpoints === before.counts.checkpoints, "checkpoint_count_changed");
  ensure(after.counts.outcomes === before.counts.outcomes, "outcome_count_changed");
  ensure(after.candidateWorkerAbsent === true, "candidate_worker_not_stopped");
  return {
    schemaVersion: "candidate-legacy-pending-drain-result.v1",
    status: "PASS_LEGACY_PENDING_DRAINED_AND_REFROZEN",
    drained: before.counts.pending,
    completed: after.counts.completed,
    finalEpoch: after.control.epoch,
    unresolved: 0,
    scannerRestorationRequired: true,
    sourceWritesObserved: false,
    candidateBusinessRowsDeleted: false,
    nextCycleAuthorized: false,
    g0Completed: false,
  };
}

async function inMigrationTransaction(client, work) {
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ WRITE");
  try {
    await client.query("SET LOCAL ROLE candidate_migration_role");
    const value = await work();
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function openDrainEpoch(client, input) {
  ensure(input.migrationId === MIGRATION_ID, "input_migration_id_invalid");
  ensure(Number.isSafeInteger(input.expectedEpoch) && input.expectedEpoch >= 4
      && input.expectedEpoch % 2 === 0, "input_expected_epoch_invalid");
  ensure(/^candidate-shadow-[a-z0-9][a-z0-9._-]{7,100}$/.test(input.releaseId ?? ""),
    "input_release_invalid");
  ensure(/^sha256:[0-9a-f]{64}$/.test(input.approvalDigest ?? ""),
    "input_approval_digest_invalid");
  return inMigrationTransaction(client, async () => {
    const result = await client.query(`SELECT migration_id, phase, epoch::int,
      started_at, deadline_at, write_frozen, approved_release_id, approval_digest
      FROM candidate_authority.transition_migration_control_v1(
        $1,$2,'shadow_capture',false,$3,$4,clock_timestamp()
      )`, [input.migrationId, input.expectedEpoch, input.releaseId, input.approvalDigest]);
    const row = result.rows[0];
    ensure(row?.migration_id === input.migrationId && row.phase === "shadow_capture",
      "drain_epoch_transition_failed");
    ensure(row.epoch === input.expectedEpoch + 1 && row.write_frozen === false,
      "drain_epoch_boundary_invalid");
    ensure(row.approved_release_id === input.releaseId, "drain_release_changed");
    return row;
  });
}

export async function closeDrainEpoch(client, input) {
  ensure(input.migrationId === MIGRATION_ID, "input_migration_id_invalid");
  ensure(Number.isSafeInteger(input.expectedEpoch) && input.expectedEpoch >= 5
      && input.expectedEpoch % 2 === 1, "input_expected_epoch_invalid");
  return inMigrationTransaction(client, async () => {
    const counts = await client.query(`SELECT
      count(*) FILTER (WHERE status='completed')::int AS completed,
      count(*) FILTER (WHERE status<>'completed')::int AS unresolved,
      count(*)::int AS total
      FROM candidate_authority.candidate_episode_ingest_outbox
      WHERE scope='production_radar' AND source_type='legacy_scan_candidate'`);
    const summary = counts.rows[0];
    ensure(summary?.total > 0 && summary.completed === summary.total,
      "drain_not_fully_completed");
    ensure(summary.unresolved === 0, "drain_unresolved_present");
    const result = await client.query(`SELECT migration_id, phase, epoch::int,
      started_at, deadline_at, write_frozen, approved_release_id, approval_digest
      FROM candidate_authority.transition_migration_control_v1(
        $1,$2,'legacy',true,$3,$4,clock_timestamp()
      )`, [input.migrationId, input.expectedEpoch, input.releaseId, input.approvalDigest]);
    const row = result.rows[0];
    ensure(row?.phase === "legacy" && row.write_frozen === true,
      "final_freeze_transition_failed");
    ensure(row.epoch === input.expectedEpoch + 1, "final_freeze_epoch_invalid");
    return row;
  });
}

export async function rollbackDrainEpoch(client, input) {
  ensure(input.migrationId === MIGRATION_ID, "input_migration_id_invalid");
  ensure(Number.isSafeInteger(input.expectedEpoch) && input.expectedEpoch >= 5
      && input.expectedEpoch % 2 === 1, "input_expected_epoch_invalid");
  ensure(/^candidate-shadow-[a-z0-9][a-z0-9._-]{7,100}$/.test(input.releaseId ?? ""),
    "input_release_invalid");
  ensure(/^sha256:[0-9a-f]{64}$/.test(input.approvalDigest ?? ""),
    "input_approval_digest_invalid");
  return inMigrationTransaction(client, async () => {
    const result = await client.query(`SELECT migration_id, phase, epoch::int,
      started_at, deadline_at, write_frozen, approved_release_id, approval_digest
      FROM candidate_authority.transition_migration_control_v1(
        $1,$2,'legacy',true,$3,$4,clock_timestamp()
      )`, [input.migrationId, input.expectedEpoch, input.releaseId, input.approvalDigest]);
    const row = result.rows[0];
    ensure(row?.phase === "legacy" && row.write_frozen === true,
      "rollback_freeze_transition_failed");
    ensure(row.epoch === input.expectedEpoch + 1, "rollback_freeze_epoch_invalid");
    ensure(row.approved_release_id === input.releaseId, "rollback_release_changed");
    return row;
  });
}
