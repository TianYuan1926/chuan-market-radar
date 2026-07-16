#!/usr/bin/env node

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { evaluateObservationEvidence } from "../candidate-activation/runner.mjs";
import {
  evaluateCycleObservation,
  MINIMUM_COMPARED_WRITES,
  MINIMUM_SAMPLES,
  MINIMUM_STABILITY_SECONDS,
} from "../candidate-cycle-continuation/observation-runner.mjs";

export const PACKAGE_ID =
  "WP-G0.2-FRESH-VERIFICATION-CYCLE-LINEAGE-CAPTURE-LOCAL-SUPERPACKAGE";
export const LINEAGE_SCHEMA = "candidate-multi-cycle-lineage-evidence.v1";
export const LINEAGE_PASS =
  "PASS_FRESH_VERIFICATION_CYCLE_READY_FOR_RECONCILIATION";
const MIGRATION_FAMILY = "candidate-episode-v1";
const CYCLE_PATTERN = /^candidate-episode-v1(?:-cycle-([1-9][0-9]{0,5}))?$/u;
const RELEASE_PATTERN = /^candidate-shadow-[a-z0-9][a-z0-9._-]{7,100}$/u;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;

const EXPECTED_KEYS = Object.freeze([
  "authorityEpoch", "commit", "migrationId", "releaseId",
]);
const CONTROL_KEYS = Object.freeze([
  "authorityEpoch", "deadlineAt", "migrationId", "phase", "releaseId",
  "startedAt", "writeFrozen",
]);
const STATUS_COUNT_KEYS = Object.freeze([
  "claimed", "completed", "outsideLineage", "pending", "resolvedQuarantine",
  "retryWait", "unresolvedQuarantine", "unresolvedTotal",
]);
const LINEAGE_KEYS = Object.freeze([
  "activationEvidenceSha256", "activationSamplesSha256",
  "accumulationEvidenceSha256", "accumulationSamplesSha256",
  "canonicalAuthorityChanged", "completedWrites", "controlSnapshotSha256",
  "currentAuthorityEpoch", "currentMigrationId", "currentReleaseId",
  "freshCycleStartedAt", "freshEvidenceSha256", "freshSamplesSha256",
  "g0Completed", "productionReconciliationExecuted", "schemaVersion",
  "shadowVerifyStarted", "sourceReleaseWindows", "status", "thresholdsChanged",
  "unresolvedOutbox",
]);

export class CandidateLineageError extends Error {
  constructor(reason) {
    super(`candidate lineage rejected: ${reason}`);
    this.name = "CandidateLineageError";
    this.reason = reason;
  }
}

function ensure(condition, reason) {
  if (!condition) throw new CandidateLineageError(reason);
}

function exactKeys(value, expected, reason) {
  ensure(value && typeof value === "object" && !Array.isArray(value), reason);
  ensure(Object.keys(value).sort().join("\n") === [...expected].sort().join("\n"), reason);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function evidenceHash(value) {
  return sha256(canonicalJson(value));
}

function sampleSetHash(samples) {
  return sha256(`${samples.map((sample) => canonicalJson(sample)).join("\n")}\n`);
}

function timestamp(value, reason) {
  const parsed = Date.parse(value);
  ensure(Number.isFinite(parsed), reason);
  return parsed;
}

function integer(value, reason) {
  ensure(Number.isSafeInteger(value) && value >= 0, reason);
  return value;
}

function parseCycle(value) {
  const match = CYCLE_PATTERN.exec(value ?? "");
  ensure(match, "migration_id_invalid");
  const number = match[1] ? Number(match[1]) : 1;
  ensure(number !== 1 || value === MIGRATION_FAMILY, "cycle_one_alias_forbidden");
  return number;
}

function validateExpected(expected, label) {
  exactKeys(expected, EXPECTED_KEYS, `${label}_expected_shape_invalid`);
  ensure(/^[0-9a-f]{40}$/u.test(expected.commit ?? ""), `${label}_commit_invalid`);
  parseCycle(expected.migrationId);
  ensure(RELEASE_PATTERN.test(expected.releaseId ?? ""), `${label}_release_invalid`);
  ensure(Number.isSafeInteger(expected.authorityEpoch) && expected.authorityEpoch >= 1
      && expected.authorityEpoch % 2 === 1, `${label}_epoch_invalid`);
  return expected;
}

function evaluateActivation(activation) {
  exactKeys(activation, ["expected", "final", "samples"], "activation_input_shape_invalid");
  const expected = validateExpected(activation.expected, "activation");
  const recomputed = evaluateObservationEvidence(activation.samples, {
    approvedCommit: expected.commit,
    authorityEpoch: expected.authorityEpoch,
    migrationId: expected.migrationId,
    releaseId: expected.releaseId,
  });
  ensure(canonicalJson(recomputed) === canonicalJson(activation.final),
    "activation_final_recompute_mismatch");
  ensure(recomputed.status === "PASS_ACTIVATE_AND_OBSERVE"
      && recomputed.sampleCount === 289 && recomputed.coverageHours >= 24
      && recomputed.maximumGapSeconds <= 600 && recomputed.completedWrites > 0,
  "activation_thresholds_invalid");
  return { expected, final: recomputed, samples: activation.samples };
}

function evaluateCycle(input, label) {
  exactKeys(input, ["expected", "final", "samples"], `${label}_input_shape_invalid`);
  const expected = validateExpected(input.expected, label);
  const recomputed = evaluateCycleObservation(input.samples, {
    commit: expected.commit,
    migrationId: expected.migrationId,
    releaseId: expected.releaseId,
  });
  ensure(canonicalJson(recomputed) === canonicalJson(input.final),
    `${label}_final_recompute_mismatch`);
  ensure(recomputed.status === "PASS_ACCUMULATION_READY_FOR_FRESH_VERIFICATION_CYCLE",
    `${label}_status_not_pass`);
  ensure(recomputed.samples >= MINIMUM_SAMPLES
      && recomputed.elapsedSeconds >= MINIMUM_STABILITY_SECONDS
      && recomputed.completionAdvances >= 2
      && recomputed.completedWrites >= MINIMUM_COMPARED_WRITES
      && recomputed.unresolvedOutbox === 0
      && recomputed.thresholdsChanged === false,
  `${label}_thresholds_invalid`);
  ensure(recomputed.authorityEpoch === expected.authorityEpoch, `${label}_epoch_mismatch`);
  return { expected, final: recomputed, samples: input.samples };
}

function validateDatabase(database) {
  exactKeys(database, ["controls", "releaseCompletedWrites", "statusCounts"],
    "database_input_shape_invalid");
  ensure(Array.isArray(database.controls) && database.controls.length >= 2
      && database.controls.length <= 64, "database_controls_invalid");
  ensure(Array.isArray(database.releaseCompletedWrites)
      && database.releaseCompletedWrites.length === database.controls.length,
  "database_release_counts_invalid");
  exactKeys(database.statusCounts, STATUS_COUNT_KEYS, "database_status_counts_shape_invalid");
  for (const key of STATUS_COUNT_KEYS) integer(database.statusCounts[key], `database_status_count_invalid:${key}`);

  const releases = new Set();
  const controls = database.controls.map((control, index) => {
    exactKeys(control, CONTROL_KEYS, `database_control_shape_invalid:${index}`);
    ensure(parseCycle(control.migrationId) === index + 1,
      `database_control_not_adjacent:${index}`);
    ensure(RELEASE_PATTERN.test(control.releaseId ?? ""),
      `database_control_release_invalid:${index}`);
    ensure(!releases.has(control.releaseId), `database_control_release_duplicate:${index}`);
    releases.add(control.releaseId);
    const startedAtMs = timestamp(control.startedAt, `database_control_start_invalid:${index}`);
    const deadlineAtMs = timestamp(control.deadlineAt, `database_control_deadline_invalid:${index}`);
    ensure(deadlineAtMs - startedAtMs === 72 * 60 * 60_000,
      `database_control_duration_invalid:${index}`);
    ensure(Number.isSafeInteger(control.authorityEpoch) && control.authorityEpoch >= 1,
      `database_control_epoch_invalid:${index}`);
    const current = index === database.controls.length - 1;
    if (current) {
      ensure(control.phase === "shadow_capture" && control.writeFrozen === false
          && control.authorityEpoch % 2 === 1, "database_current_control_not_active");
    } else {
      ensure(control.phase === "legacy" && control.writeFrozen === true
          && control.authorityEpoch >= 2 && control.authorityEpoch % 2 === 0,
      `database_retired_control_not_frozen:${index}`);
    }
    return { ...control, startedAtMs, deadlineAtMs };
  });

  let releaseCompletedTotal = 0;
  for (const [index, item] of database.releaseCompletedWrites.entries()) {
    exactKeys(item, ["completedWrites", "releaseId"],
      `database_release_count_shape_invalid:${index}`);
    ensure(item.releaseId === controls[index].releaseId,
      `database_release_count_identity_mismatch:${index}`);
    releaseCompletedTotal += integer(item.completedWrites,
      `database_release_completed_invalid:${index}`);
  }
  ensure(releaseCompletedTotal === database.statusCounts.completed,
    "database_completed_aggregate_mismatch");
  for (const key of [
    "pending", "claimed", "retryWait", "unresolvedQuarantine", "unresolvedTotal",
    "outsideLineage",
  ]) ensure(database.statusCounts[key] === 0, `database_${key}_not_zero`);
  return { controls, releaseCompletedTotal, statusCounts: database.statusCounts };
}

function sourceReleaseWindows(controls) {
  return controls.map((control, index) => ({
    authorityEpoch: index === controls.length - 1
      ? control.authorityEpoch
      : control.authorityEpoch - 1,
    deadlineAt: control.deadlineAt,
    migrationId: control.migrationId,
    releaseId: control.releaseId,
    startedAt: control.startedAt,
  }));
}

export function validateCandidateLineageEvidence(lineage) {
  exactKeys(lineage, LINEAGE_KEYS, "lineage_evidence_shape_invalid");
  ensure(lineage.schemaVersion === LINEAGE_SCHEMA && lineage.status === LINEAGE_PASS,
    "lineage_evidence_status_invalid");
  for (const key of [
    "activationEvidenceSha256", "activationSamplesSha256",
    "accumulationEvidenceSha256", "accumulationSamplesSha256",
    "freshEvidenceSha256", "freshSamplesSha256", "controlSnapshotSha256",
  ]) ensure(HASH_PATTERN.test(lineage[key] ?? ""), `lineage_hash_invalid:${key}`);
  ensure(Array.isArray(lineage.sourceReleaseWindows)
      && lineage.sourceReleaseWindows.length >= 2, "lineage_windows_invalid");
  const seen = new Set();
  for (const [index, window] of lineage.sourceReleaseWindows.entries()) {
    exactKeys(window, ["authorityEpoch", "deadlineAt", "migrationId", "releaseId", "startedAt"],
      `lineage_window_shape_invalid:${index}`);
    ensure(parseCycle(window.migrationId) === index + 1, `lineage_window_not_adjacent:${index}`);
    ensure(RELEASE_PATTERN.test(window.releaseId ?? "") && !seen.has(window.releaseId),
      `lineage_window_release_invalid:${index}`);
    seen.add(window.releaseId);
    ensure(Number.isSafeInteger(window.authorityEpoch) && window.authorityEpoch >= 1
        && window.authorityEpoch % 2 === 1, `lineage_window_epoch_invalid:${index}`);
    ensure(timestamp(window.deadlineAt, `lineage_window_deadline_invalid:${index}`)
        - timestamp(window.startedAt, `lineage_window_start_invalid:${index}`)
        === 72 * 60 * 60_000, `lineage_window_duration_invalid:${index}`);
  }
  const current = lineage.sourceReleaseWindows.at(-1);
  ensure(lineage.currentMigrationId === current.migrationId
      && lineage.currentReleaseId === current.releaseId
      && lineage.currentAuthorityEpoch === current.authorityEpoch
      && lineage.freshCycleStartedAt === current.startedAt,
  "lineage_current_identity_mismatch");
  ensure(Number.isSafeInteger(lineage.completedWrites)
      && lineage.completedWrites >= MINIMUM_COMPARED_WRITES
      && lineage.unresolvedOutbox === 0 && lineage.thresholdsChanged === false,
  "lineage_threshold_or_unresolved_invalid");
  ensure(lineage.productionReconciliationExecuted === false
      && lineage.shadowVerifyStarted === false
      && lineage.canonicalAuthorityChanged === false
      && lineage.g0Completed === false, "lineage_future_stage_claim_invalid");
  return lineage;
}

export function buildCandidateLineageEvidence(input) {
  exactKeys(input, ["activation", "accumulation", "database", "fresh"],
    "lineage_input_shape_invalid");
  const activation = evaluateActivation(input.activation);
  const accumulation = evaluateCycle(input.accumulation, "accumulation");
  const fresh = evaluateCycle(input.fresh, "fresh");
  const database = validateDatabase(input.database);
  const controls = database.controls;
  const windows = sourceReleaseWindows(controls);
  const first = controls[0];
  const accumulationControl = controls.at(-2);
  const current = controls.at(-1);
  ensure(first.migrationId === activation.expected.migrationId
      && first.releaseId === activation.expected.releaseId
      && first.authorityEpoch - 1 === activation.expected.authorityEpoch,
  "activation_database_identity_mismatch");
  ensure(accumulationControl.migrationId === accumulation.expected.migrationId
      && accumulationControl.releaseId === accumulation.expected.releaseId
      && accumulationControl.authorityEpoch - 1 === accumulation.expected.authorityEpoch,
  "accumulation_database_identity_mismatch");
  ensure(current.migrationId === fresh.expected.migrationId
      && current.releaseId === fresh.expected.releaseId
      && current.authorityEpoch === fresh.expected.authorityEpoch,
  "fresh_database_identity_mismatch");
  ensure(parseCycle(fresh.expected.migrationId)
      === parseCycle(accumulation.expected.migrationId) + 1,
  "fresh_cycle_not_adjacent_to_accumulation");
  const accumulationLastSampleAt = timestamp(input.accumulation.samples.at(-1)?.sampledAt,
    "accumulation_last_sample_time_invalid");
  const freshFirstSampleAt = timestamp(input.fresh.samples[0]?.sampledAt,
    "fresh_first_sample_time_invalid");
  const freshLastSampleAt = timestamp(input.fresh.samples.at(-1)?.sampledAt,
    "fresh_last_sample_time_invalid");
  ensure(current.startedAtMs > accumulationLastSampleAt,
    "fresh_cycle_started_before_accumulation_pass");
  ensure(freshFirstSampleAt >= current.startedAtMs && freshLastSampleAt <= current.deadlineAtMs,
    "fresh_samples_outside_current_window");
  ensure(accumulation.final.completedWrites <= fresh.final.completedWrites,
    "fresh_completed_writes_regressed");
  ensure(database.releaseCompletedTotal === fresh.final.completedWrites,
    "fresh_completed_writes_database_mismatch");
  ensure(database.statusCounts.unresolvedTotal === fresh.final.unresolvedOutbox,
    "fresh_unresolved_database_mismatch");

  const lineage = {
    schemaVersion: LINEAGE_SCHEMA,
    status: LINEAGE_PASS,
    activationEvidenceSha256: evidenceHash(activation.final),
    activationSamplesSha256: sampleSetHash(activation.samples),
    accumulationEvidenceSha256: evidenceHash(accumulation.final),
    accumulationSamplesSha256: sampleSetHash(accumulation.samples),
    freshEvidenceSha256: evidenceHash(fresh.final),
    freshSamplesSha256: sampleSetHash(fresh.samples),
    controlSnapshotSha256: evidenceHash(input.database),
    sourceReleaseWindows: windows,
    completedWrites: fresh.final.completedWrites,
    unresolvedOutbox: database.statusCounts.unresolvedTotal,
    freshCycleStartedAt: current.startedAt,
    currentMigrationId: current.migrationId,
    currentReleaseId: current.releaseId,
    currentAuthorityEpoch: current.authorityEpoch,
    thresholdsChanged: false,
    productionReconciliationExecuted: false,
    shadowVerifyStarted: false,
    canonicalAuthorityChanged: false,
    g0Completed: false,
  };
  return validateCandidateLineageEvidence(lineage);
}

export async function collectCandidateLineageDatabaseSnapshotWithEvidence(client) {
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SET LOCAL ROLE candidate_audit_role");
    const boundary = await client.query(`SELECT current_user AS current_role,
      current_setting('transaction_read_only') AS read_only,
      current_setting('transaction_isolation') AS isolation_level`);
    ensure(boundary.rows[0]?.current_role === "candidate_audit_role",
      "database_audit_role_not_active");
    ensure(boundary.rows[0]?.read_only === "on", "database_transaction_not_read_only");
    ensure(boundary.rows[0]?.isolation_level === "repeatable read",
      "database_transaction_isolation_invalid");
    const controlsResult = await client.query(`SELECT migration_id, phase, epoch::int,
      started_at, deadline_at, write_frozen, approved_release_id
      FROM candidate_authority.candidate_migration_control
      WHERE migration_id='candidate-episode-v1'
        OR migration_id ~ '^candidate-episode-v1-cycle-([2-9]|[1-9][0-9]+)$'
      ORDER BY started_at, migration_id`);
    const controls = controlsResult.rows.map((row) => ({
      authorityEpoch: row.epoch,
      deadlineAt: new Date(row.deadline_at).toISOString(),
      migrationId: row.migration_id,
      phase: row.phase,
      releaseId: row.approved_release_id,
      startedAt: new Date(row.started_at).toISOString(),
      writeFrozen: row.write_frozen,
    }));
    const releaseIds = controls.map((control) => control.releaseId);
    const countsResult = await client.query(`WITH source_items AS (
      SELECT outbox.*,
        COALESCE(outbox.payload->>'releaseId'=ANY($1::text[]), false) AS in_lineage,
        EXISTS (SELECT 1 FROM candidate_authority.candidate_outbox_quarantine_resolutions resolution
          WHERE resolution.scope=outbox.scope
            AND resolution.quarantined_outbox_id=outbox.outbox_id) AS resolved
      FROM candidate_authority.candidate_episode_ingest_outbox outbox
      WHERE outbox.scope='production_radar' AND outbox.source_type='legacy_scan_candidate'
    ) SELECT
      count(*) FILTER (WHERE status='pending')::int AS pending,
      count(*) FILTER (WHERE status='claimed')::int AS claimed,
      count(*) FILTER (WHERE status='retry_wait')::int AS retry_wait,
      count(*) FILTER (WHERE status='completed' AND in_lineage)::int AS completed,
      count(*) FILTER (WHERE status='quarantined' AND resolved)::int AS resolved_quarantine,
      count(*) FILTER (WHERE status='quarantined' AND NOT resolved)::int AS unresolved_quarantine,
      count(*) FILTER (WHERE status <> 'completed' AND NOT resolved)::int AS unresolved_total,
      count(*) FILTER (WHERE NOT in_lineage)::int AS outside_lineage
      FROM source_items`, [releaseIds]);
    const releaseCountsResult = await client.query(`SELECT payload->>'releaseId' AS release_id,
      count(*)::int AS completed
      FROM candidate_authority.candidate_episode_ingest_outbox
      WHERE scope='production_radar' AND source_type='legacy_scan_candidate'
        AND status='completed' AND payload->>'releaseId'=ANY($1::text[])
      GROUP BY payload->>'releaseId'`, [releaseIds]);
    const releaseCounts = new Map(releaseCountsResult.rows.map((row) => [
      row.release_id, Number(row.completed),
    ]));
    const counts = countsResult.rows[0] ?? {};
    const result = {
      controls,
      releaseCompletedWrites: releaseIds.map((releaseId) => ({
        completedWrites: releaseCounts.get(releaseId) ?? 0,
        releaseId,
      })),
      statusCounts: {
        claimed: Number(counts.claimed ?? 0),
        completed: Number(counts.completed ?? 0),
        outsideLineage: Number(counts.outside_lineage ?? 0),
        pending: Number(counts.pending ?? 0),
        resolvedQuarantine: Number(counts.resolved_quarantine ?? 0),
        retryWait: Number(counts.retry_wait ?? 0),
        unresolvedQuarantine: Number(counts.unresolved_quarantine ?? 0),
        unresolvedTotal: Number(counts.unresolved_total ?? 0),
      },
    };
    validateDatabase(result);
    await client.query("COMMIT");
    return {
      databaseIdentity: {
        currentRole: boundary.rows[0].current_role,
        transactionIsolation: boundary.rows[0].isolation_level,
        transactionReadOnly: boundary.rows[0].read_only === "on",
      },
      snapshot: result,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function collectCandidateLineageDatabaseSnapshot(client) {
  return (await collectCandidateLineageDatabaseSnapshotWithEvidence(client)).snapshot;
}

async function main() {
  const command = process.argv[2] ?? "describe";
  ensure(command === "describe", "command_not_supported");
  process.stdout.write(`${JSON.stringify({
    packageId: PACKAGE_ID,
    mode: "local_preparation_only",
    minimumComparedWrites: MINIMUM_COMPARED_WRITES,
    minimumFreshSamples: MINIMUM_SAMPLES,
    minimumFreshStabilitySeconds: MINIMUM_STABILITY_SECONDS,
    productionConnected: false,
    productionMutationAllowed: false,
  }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "fail", reason: error?.reason ?? error?.message })}\n`);
    process.exitCode = 1;
  });
}
