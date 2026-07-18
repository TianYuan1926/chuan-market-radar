import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, stat, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  LINEAGE_PASS,
  LINEAGE_SCHEMA,
  validateCandidateLineageEvidence,
} from "../candidate-lineage/runner.mjs";

export const PACKAGE_ID =
  "WP-G0.2-CURRENT-CYCLE-UNIFIED-RECONCILIATION-PRODUCTION-PACKET";
export const RECONCILIATION_SCHEMA = "candidate-multi-cycle-reconciliation-evidence.v3";
export const RECONCILIATION_PASS =
  "PASS_CURRENT_CYCLE_UNIFIED_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL";
export const MIGRATION_FAMILY = "candidate-episode-v1";
export const MINIMUM_COMPARED_WRITES = 10_000;
export const PAGE_SIZE = 500;
const CYCLE_PATTERN = /^candidate-episode-v1(?:-cycle-([1-9][0-9]{0,5}))?$/u;

const SOURCE_TYPE = "legacy_scan_candidate";
const PAYLOAD_VERSION = "shadow-candidate-observation.v1";
const EVENT_PAYLOAD_VERSION = "candidate-event.v1";
const EVENT_TYPES = new Set(["DISCOVERED", "REFRESHED", "RETRIGGERED"]);
const REQUEST_KEYS = Object.freeze([
  "approvalExpiresAt",
  "approvalIssuedAt",
  "approvalRef",
  "approvedCommit",
  "approvedRunnerArtifactSha256",
  "authorityEpoch",
  "automaticPhaseAdvanceAllowed",
  "businessDmlAllowed",
  "canonicalReadAllowed",
  "canonicalWriteAllowed",
  "executeReadOnlyComparison",
  "lineageEvidenceSha256",
  "lineageSchemaVersion",
  "lineageStatus",
  "migrationAllowed",
  "migrationId",
  "minimumComparedWrites",
  "operator",
  "packageId",
  "productionRankingMutationAllowed",
  "releaseId",
  "reviewReadAllowed",
  "schemaDdlAllowed",
  "shadowVerifyTransitionAllowed",
  "sourceReleaseWindows",
]);

export class ReconciliationPolicyError extends Error {
  constructor(reason) {
    super(`candidate reconciliation policy rejected: ${reason}`);
    this.name = "ReconciliationPolicyError";
    this.reason = reason;
  }
}

function ensure(condition, reason) {
  if (!condition) throw new ReconciliationPolicyError(reason);
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    ensure(Number.isFinite(value), "canonical_json_non_finite_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  ensure(typeof value === "object", "canonical_json_unsupported_value");
  return `{${Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashPayload(payload) {
  return `sha256:${sha256(canonicalJson(payload))}`;
}

export function hashProjectionCommand(command) {
  return `sha256:${sha256(canonicalJson({ operation: "open_or_refresh_episode_v1", payload: command }))}`;
}

export function loadPgRuntime({
  applicationRoot = process.env.MARKET_RADAR_APPLICATION_ROOT,
  moduleUrl = import.meta.url,
  requireFactory = createRequire,
} = {}) {
  const candidates = [requireFactory(moduleUrl)];
  if (applicationRoot) candidates.push(requireFactory(resolve(applicationRoot, "package.json")));
  for (const requireCandidate of candidates) {
    try {
      return requireCandidate("pg");
    } catch (error) {
      if (error?.code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  throw new ReconciliationPolicyError("approved_pg_runtime_unavailable");
}

function parseTimestamp(value, reason) {
  const parsed = Date.parse(value);
  ensure(Number.isFinite(parsed), reason);
  return parsed;
}

function nonNegativeInteger(value, reason) {
  const parsed = Number(value);
  ensure(Number.isSafeInteger(parsed) && parsed >= 0, reason);
  return parsed;
}

function parseValidationCycleId(value) {
  ensure(typeof value === "string", "migration_id_invalid");
  const match = CYCLE_PATTERN.exec(value);
  ensure(match, "migration_id_invalid");
  const cycleNumber = match[1] ? Number(match[1]) : 1;
  ensure(cycleNumber !== 1 || value === MIGRATION_FAMILY, "cycle_one_alias_forbidden");
  return { cycleNumber, migrationId: value };
}

function validateSourceReleaseWindows(windows, request) {
  ensure(Array.isArray(windows) && windows.length >= 2,
    "source_release_windows_invalid");
  const releases = new Set();
  const validated = windows.map((window, index) => {
    ensure(exactKeys(window, [
      "controlEpoch", "deadlineAt", "migrationId", "phase", "releaseId", "startedAt",
      "writeFrozen",
    ]), `source_release_window_shape_invalid:${index}`);
    const cycle = parseValidationCycleId(window.migrationId);
    ensure(cycle.cycleNumber === index + 1, `source_release_window_not_adjacent:${index}`);
    ensure(/^candidate-shadow-[a-z0-9][a-z0-9._-]{7,100}$/u.test(window.releaseId ?? ""),
      `source_release_window_release_invalid:${index}`);
    ensure(!releases.has(window.releaseId), `source_release_window_release_duplicate:${index}`);
    releases.add(window.releaseId);
    ensure(Number.isSafeInteger(window.controlEpoch) && window.controlEpoch >= 1,
    `source_release_window_epoch_invalid:${index}`);
    const current = index === windows.length - 1;
    ensure(current
      ? window.phase === "shadow_capture" && window.writeFrozen === false
        && window.controlEpoch % 2 === 1
      : window.phase === "legacy" && window.writeFrozen === true
        && window.controlEpoch >= 2 && window.controlEpoch % 2 === 0,
    `source_release_window_state_invalid:${index}`);
    const startedAt = parseTimestamp(window.startedAt, `source_release_window_start_invalid:${index}`);
    const deadlineAt = parseTimestamp(window.deadlineAt, `source_release_window_deadline_invalid:${index}`);
    ensure(deadlineAt - startedAt === 72 * 60 * 60_000,
      `source_release_window_duration_invalid:${index}`);
    return { ...window, startedAtMs: startedAt, deadlineAtMs: deadlineAt };
  });
  const current = validated.at(-1);
  ensure(parseValidationCycleId(current.migrationId).cycleNumber === validated.length,
    "source_release_window_count_cycle_mismatch");
  ensure(current.migrationId === request.migrationId, "current_migration_lineage_mismatch");
  ensure(current.releaseId === request.releaseId, "current_release_lineage_mismatch");
  ensure(current.controlEpoch === request.authorityEpoch, "current_epoch_lineage_mismatch");
  return validated;
}

export function validateApprovalRequest(request, contract, { now = new Date() } = {}) {
  ensure(exactKeys(request, REQUEST_KEYS), "request_keys_mismatch");
  ensure(request.packageId === PACKAGE_ID, "request_package_mismatch");
  ensure(parseValidationCycleId(request.migrationId).cycleNumber >= 2,
    "request_migration_not_multi_cycle");
  ensure(request.lineageSchemaVersion === LINEAGE_SCHEMA, "lineage_schema_not_v3");
  ensure(request.lineageStatus === LINEAGE_PASS, "lineage_status_not_pass");
  ensure(/^[0-9a-f]{40}$/.test(request.approvedCommit ?? ""), "approved_commit_invalid");
  ensure(/^candidate-shadow-[a-z0-9][a-z0-9._-]{7,80}$/.test(request.releaseId ?? ""), "release_id_invalid");
  ensure(/^sha256:[0-9a-f]{64}$/.test(request.lineageEvidenceSha256 ?? ""),
    "lineage_evidence_hash_invalid");
  ensure(request.approvedRunnerArtifactSha256 === contract.runnerArtifact.sha256, "runner_artifact_mismatch");
  ensure(
    Number.isSafeInteger(request.authorityEpoch)
      && request.authorityEpoch >= 1
      && request.authorityEpoch % 2 === 1,
    "authority_epoch_not_active_odd",
  );
  validateSourceReleaseWindows(request.sourceReleaseWindows, request);
  ensure(request.minimumComparedWrites === MINIMUM_COMPARED_WRITES, "compared_writes_threshold_changed");
  ensure(request.executeReadOnlyComparison === true, "read_only_comparison_not_approved");
  for (const key of [
    "automaticPhaseAdvanceAllowed",
    "businessDmlAllowed",
    "canonicalReadAllowed",
    "canonicalWriteAllowed",
    "migrationAllowed",
    "productionRankingMutationAllowed",
    "reviewReadAllowed",
    "schemaDdlAllowed",
    "shadowVerifyTransitionAllowed",
  ]) ensure(request[key] === false, `${key}_must_be_false`);
  ensure(typeof request.operator === "string" && request.operator.trim().length >= 2, "operator_invalid");
  ensure(/^[A-Za-z0-9._:/-]{8,128}$/.test(request.approvalRef ?? ""), "approval_ref_invalid");
  const issuedAt = parseTimestamp(request.approvalIssuedAt, "approval_issued_at_invalid");
  const expiresAt = parseTimestamp(request.approvalExpiresAt, "approval_expires_at_invalid");
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  ensure(expiresAt > issuedAt && expiresAt - issuedAt <= 90 * 60_000, "approval_window_too_long");
  ensure(nowMs >= issuedAt && nowMs < expiresAt, "approval_window_not_active");
  return request;
}

export function validateLineageRequestBinding(lineage, request) {
  validateCandidateLineageEvidence(lineage);
  ensure(lineage.schemaVersion === request.lineageSchemaVersion,
    "lineage_request_schema_mismatch");
  ensure(lineage.status === request.lineageStatus, "lineage_request_status_mismatch");
  ensure(canonicalJson(lineage.sourceReleaseWindows) === canonicalJson(request.sourceReleaseWindows),
    "lineage_request_windows_mismatch");
  ensure(lineage.currentMigrationId === request.migrationId,
    "lineage_request_migration_mismatch");
  ensure(lineage.currentReleaseId === request.releaseId,
    "lineage_request_release_mismatch");
  ensure(lineage.currentAuthorityEpoch === request.authorityEpoch,
    "lineage_request_epoch_mismatch");
  return lineage;
}

function validatePayload(payload) {
  const keys = [
    "canonicalInstrumentId", "directionState", "discoveryReasons", "expiresAt",
    "firstSeenAt", "lastSeenAt", "maturity", "observationPrice",
    "observationPriceFactId", "priorityTier", "releaseId", "schemaVersion",
    "sourceScanCycleId", "venueContext",
  ];
  ensure(exactKeys(payload, keys), "source_payload_keys_mismatch");
  ensure(payload.schemaVersion === PAYLOAD_VERSION, "source_payload_version_mismatch");
  ensure(typeof payload.canonicalInstrumentId === "string" && payload.canonicalInstrumentId.length > 0, "canonical_instrument_missing");
  ensure(typeof payload.sourceScanCycleId === "string" && payload.sourceScanCycleId.length > 0, "source_scan_cycle_missing");
  ensure(["light_candidate", "deep_candidate"].includes(payload.maturity), "source_maturity_invalid");
  ensure(["unknown", "neutral"].includes(payload.directionState), "source_direction_invalid");
  ensure(exactKeys(payload.venueContext, [
    "contractType", "identityEvidenceIds", "resolutionStatus", "schemaVersion",
    "settlementAsset", "venue", "venueInstrumentId",
  ]), "venue_context_keys_mismatch");
  const firstSeen = parseTimestamp(payload.firstSeenAt, "first_seen_invalid");
  const lastSeen = parseTimestamp(payload.lastSeenAt, "last_seen_invalid");
  ensure(lastSeen >= firstSeen, "last_seen_before_first_seen");
  ensure((payload.observationPrice === null) === (payload.observationPriceFactId === null), "observation_price_fact_pair_invalid");
  return { firstSeen, lastSeen };
}

function projectionCommand(row, payload) {
  return {
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
    runtimeId: row.event_runtime_id,
    idempotencyKey: `shadow-projection:${row.outbox_id}`,
  };
}

export function compareProjectionRow(row, context) {
  const differences = [];
  const check = (condition, code) => {
    if (!condition) differences.push(code);
  };
  let payloadTimes = null;
  try {
    payloadTimes = validatePayload(row.source_payload);
  } catch (error) {
    differences.push(error.reason ?? "source_payload_invalid");
  }
  const payload = row.source_payload ?? {};
  const expectedSourceId = `${payload.sourceScanCycleId}:${payload.canonicalInstrumentId}`;
  const expectedOutboxIdempotency = `shadow-capture:${payload.sourceScanCycleId}:${payload.canonicalInstrumentId}`;
  const expectedEventIdempotency = `shadow-projection:${row.outbox_id}`;
  check(row.source_type === SOURCE_TYPE, "source_type_mismatch");
  check(row.source_payload_version === PAYLOAD_VERSION, "source_payload_version_mismatch");
  check(row.source_status === "completed", "source_not_completed");
  check(row.source_id === expectedSourceId, "source_id_mismatch");
  check(row.source_version === payload.firstSeenAt, "source_version_mismatch");
  check(row.source_idempotency_key === expectedOutboxIdempotency, "source_idempotency_mismatch");
  if (row.source_payload) check(row.source_payload_hash === hashPayload(row.source_payload), "source_payload_hash_mismatch");
  const sourceWindow = context.sourceReleaseWindows.find(
    (window) => window.releaseId === payload.releaseId,
  );
  check(sourceWindow !== undefined, "source_release_not_in_lineage");
  check(row.event_id !== null && row.event_id !== undefined, "projection_event_missing");
  check(row.event_idempotency_key === expectedEventIdempotency, "projection_event_idempotency_mismatch");
  check(EVENT_TYPES.has(row.event_type), "projection_event_type_invalid");
  check(row.event_payload_version === EVENT_PAYLOAD_VERSION, "projection_event_payload_version_mismatch");
  check(row.event_release_id === payload.releaseId, "projection_event_release_mismatch");
  check(row.event_source_scan_cycle_id === payload.sourceScanCycleId, "projection_event_scan_cycle_mismatch");
  check(row.event_time === payload.lastSeenAt, "projection_event_time_mismatch");
  check(row.event_payload?.canonicalInstrumentId === payload.canonicalInstrumentId, "projection_event_instrument_mismatch");
  check(row.event_payload?.eventType === row.event_type, "projection_event_kind_mismatch");
  check(exactKeys(row.event_payload, ["canonicalInstrumentId", "eventType"]), "projection_event_payload_keys_mismatch");
  check(row.event_runtime_id?.startsWith(`candidate-shadow:${payload.releaseId}:`) === true,
    "projection_runtime_release_mismatch");
  if (row.event_runtime_id) {
    check(row.event_command_hash === hashProjectionCommand(projectionCommand(row, payload)), "projection_command_hash_mismatch");
  }
  check(row.episode_id === row.event_episode_id, "projection_episode_link_mismatch");
  check(row.episode_canonical_instrument_id === payload.canonicalInstrumentId, "projection_episode_instrument_mismatch");
  const streamVersion = Number(row.event_stream_version);
  check(Number.isSafeInteger(streamVersion) && streamVersion > 0, "event_stream_version_invalid");
  if (payloadTimes) {
    try {
      const createdAt = parseTimestamp(row.source_created_at, "source_created_at_invalid");
      const completedAt = parseTimestamp(row.source_completed_at, "source_completed_at_invalid");
      const episodeFirstSeen = parseTimestamp(row.episode_first_seen_at, "episode_first_seen_invalid");
      const episodeLastSeen = parseTimestamp(row.episode_last_seen_at, "episode_last_seen_invalid");
      check(sourceWindow !== undefined
          && createdAt >= sourceWindow.startedAtMs && createdAt <= sourceWindow.deadlineAtMs,
      "source_created_outside_release_window");
      check(sourceWindow !== undefined
          && completedAt >= createdAt && completedAt <= sourceWindow.deadlineAtMs,
      "source_completed_outside_release_window");
      check(episodeFirstSeen <= payloadTimes.firstSeen, "episode_first_seen_after_source");
      check(episodeLastSeen >= payloadTimes.lastSeen, "episode_last_seen_before_source");
    } catch (error) {
      differences.push(error.reason ?? "projection_timestamp_invalid");
    }
  }
  const digest = sha256(canonicalJson({
    eventCommandHash: row.event_command_hash,
    eventId: row.event_id,
    eventStreamVersion: Number.isFinite(streamVersion) ? streamVersion : null,
    episodeId: row.episode_id,
    outboxId: row.outbox_id,
    sourceId: row.source_id,
    sourcePayloadHash: row.source_payload_hash,
  }));
  return { differences, digest, outboxId: row.outbox_id, eventId: row.event_id };
}

export function evaluateReconciliationEvidence({ context, control, lineage, rows, statusCounts }) {
  validateCandidateLineageEvidence(lineage);
  const violations = [];
  const add = (condition, code) => {
    if (!condition) violations.push(code);
  };
  add(control.phase === "shadow_capture", "control_phase_not_shadow_capture");
  add(Number(control.authorityEpoch) === context.authorityEpoch, "control_epoch_mismatch");
  add(control.writeFrozen === false, "control_write_frozen");
  add(control.releaseId === context.releaseId, "control_release_mismatch");
  add(control.migrationId === context.migrationId, "control_migration_mismatch");
  add(control.currentRole === "candidate_audit_role", "database_audit_role_not_active");
  add(control.transactionReadOnly === true, "database_transaction_not_read_only");
  add(control.transactionIsolation === "repeatable read",
    "database_transaction_isolation_invalid");
  add(lineage.schemaVersion === LINEAGE_SCHEMA && lineage.status === LINEAGE_PASS,
    "lineage_not_pass");
  add(canonicalJson(lineage.sourceReleaseWindows) === canonicalJson(
    context.sourceReleaseWindows.map((window) => ({
      controlEpoch: window.controlEpoch,
      deadlineAt: window.deadlineAt,
      migrationId: window.migrationId,
      phase: window.phase,
      releaseId: window.releaseId,
      startedAt: window.startedAt,
      writeFrozen: window.writeFrozen,
    }))), "lineage_release_windows_mismatch");
  add(lineage.currentMigrationId === context.migrationId
      && lineage.currentReleaseId === context.releaseId
      && lineage.currentAuthorityEpoch === context.authorityEpoch,
  "lineage_current_identity_mismatch");
  add(lineage.completedWrites === statusCounts.completed,
    "lineage_completed_count_mismatch");
  add(lineage.unresolvedOutbox === 0, "lineage_unresolved_present");
  add(statusCounts.pending === 0, "pending_outbox_present");
  add(statusCounts.claimed === 0, "claimed_outbox_present");
  add(statusCounts.retryWait === 0, "retry_wait_outbox_present");
  add(statusCounts.unresolvedQuarantine === 0, "unresolved_quarantine_present");
  add(statusCounts.unresolvedTotal === 0, "unresolved_outbox_present");
  add(statusCounts.outsideLineage === 0, "source_release_outside_lineage_present");

  const rowResults = rows.map((row) => compareProjectionRow(row, context));
  const duplicateOutbox = rowResults.length - new Set(rowResults.map((item) => item.outboxId)).size;
  const duplicateEvents = rowResults.length - new Set(rowResults.map((item) => item.eventId)).size;
  const differences = rowResults.flatMap((item) => item.differences.map((code) => ({ outboxId: item.outboxId, code })));
  add(rows.length >= MINIMUM_COMPARED_WRITES, "compared_writes_below_10000");
  add(statusCounts.completed === rows.length, "completed_count_evidence_mismatch");
  add(duplicateOutbox === 0, "duplicate_source_write_mapping");
  add(duplicateEvents === 0, "duplicate_projection_event_mapping");
  add(differences.length === 0, "comparison_differences_present");
  const evidenceHash = sha256(canonicalJson({
    authorityEpoch: context.authorityEpoch,
    comparedWriteDigests: rowResults.map((item) => item.digest).sort(),
    control,
    lineageEvidenceSha256: context.lineageEvidenceSha256,
    lineageSemanticEvidenceSha256: {
      controlSnapshot: lineage.controlSnapshotSha256,
      unifiedFinal: lineage.unifiedEvidenceSha256,
      unifiedSamples: lineage.unifiedSamplesSha256,
    },
    migrationId: context.migrationId,
    releaseId: context.releaseId,
    sourceReleaseWindows: context.sourceReleaseWindows.map((window) => ({
      controlEpoch: window.controlEpoch,
      deadlineAt: window.deadlineAt,
      migrationId: window.migrationId,
      phase: window.phase,
      releaseId: window.releaseId,
      startedAt: window.startedAt,
      writeFrozen: window.writeFrozen,
    })),
    statusCounts,
  }));
  return {
    schemaVersion: RECONCILIATION_SCHEMA,
    status: violations.length === 0 ? RECONCILIATION_PASS : "FAIL_RECONCILIATION",
    automaticPhaseAdvance: false,
    phaseTransitionExecuted: false,
    shadowVerifyTransitionExecuted: false,
    canonicalReadEnabled: false,
    canonicalWriteEnabled: false,
    reviewReadEnabled: false,
    g0Completed: false,
    productionRankingInputsUsed: false,
    futureOutcomeInputsUsed: false,
    databaseIdentity: {
      currentRole: control.currentRole,
      transactionReadOnly: control.transactionReadOnly,
      transactionIsolation: control.transactionIsolation,
    },
    lineageIdentityBinding: "file_hash_request_database_exact_match",
    lineageEvidenceSha256: context.lineageEvidenceSha256,
    lineageSemanticEvidenceSha256: {
      controlSnapshot: lineage.controlSnapshotSha256,
      unifiedFinal: lineage.unifiedEvidenceSha256,
      unifiedSamples: lineage.unifiedSamplesSha256,
    },
    comparedWrites: rows.length,
    comparisonDifferences: differences.length,
    duplicateOutboxMappings: duplicateOutbox,
    duplicateEventMappings: duplicateEvents,
    resolvedQuarantineExclusions: statusCounts.resolvedQuarantine,
    sourceReleaseCount: context.sourceReleaseWindows.length,
    verificationMigrationId: context.sourceReleaseWindows.at(-1).migrationId,
    evidenceHash: `sha256:${evidenceHash}`,
    violations,
    differenceSample: differences.slice(0, 25),
  };
}

async function assertPrivateRegularFile(path, label, maximumSize = 64 * 1024) {
  const [metadata, linkMetadata] = await Promise.all([stat(path), lstat(path)]);
  ensure(metadata.isFile() && linkMetadata.isFile() && !linkMetadata.isSymbolicLink(),
    `${label}_not_regular_file`);
  ensure(metadata.nlink === 1, `${label}_hard_link_forbidden`);
  ensure((metadata.mode & 0o077) === 0, `${label}_permissions_too_open`);
  ensure(metadata.size > 0 && metadata.size <= maximumSize, `${label}_size_invalid`);
  return metadata;
}

async function secureText(path, label) {
  await assertPrivateRegularFile(path, label);
  const value = (await readFile(path, "utf8")).trim();
  ensure(value.length > 0, `${label}_empty`);
  return value;
}

function mapRow(row) {
  const timestamp = (value) => value instanceof Date ? value.toISOString() : value;
  return {
    ...row,
    source_created_at: timestamp(row.source_created_at),
    source_completed_at: timestamp(row.source_completed_at),
    event_time: timestamp(row.event_time),
    episode_first_seen_at: timestamp(row.episode_first_seen_at),
    episode_last_seen_at: timestamp(row.episode_last_seen_at),
  };
}

export async function collectReadOnlyEvidence(client, request, lineage) {
  const sourceReleaseWindows = validateSourceReleaseWindows(request.sourceReleaseWindows, request);
  const sourceReleaseIds = sourceReleaseWindows.map((window) => window.releaseId);
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SET LOCAL ROLE candidate_audit_role");
    await client.query("SET LOCAL statement_timeout = '5min'");
    await client.query("SET LOCAL lock_timeout = '2s'");
    const boundary = await client.query(`SELECT current_setting('transaction_read_only') AS read_only,
      current_setting('transaction_isolation') AS isolation_level,
      current_user AS current_role,
      control.phase, control.epoch::int AS authority_epoch, control.started_at,
      control.deadline_at, control.write_frozen, control.approved_release_id,
      control.migration_id, clock_timestamp() AS database_now
      FROM candidate_authority.candidate_migration_control control
      WHERE control.migration_id='candidate-episode-v1'
        OR control.migration_id ~ '^candidate-episode-v1-cycle-([2-9]|[1-9][0-9]+)$'
      ORDER BY control.started_at, control.migration_id`);
    ensure(boundary.rows.length === sourceReleaseWindows.length,
      "database_control_lineage_count_mismatch");
    for (const [index, window] of sourceReleaseWindows.entries()) {
      const row = boundary.rows[index];
      ensure(row?.migration_id === window.migrationId,
        `database_control_lineage_migration_mismatch:${index}`);
      ensure(row.approved_release_id === window.releaseId,
        `database_control_lineage_release_mismatch:${index}`);
      ensure(new Date(row.started_at).toISOString() === window.startedAt,
        `database_control_lineage_start_mismatch:${index}`);
      ensure(new Date(row.deadline_at).toISOString() === window.deadlineAt,
        `database_control_lineage_deadline_mismatch:${index}`);
      ensure(row.phase === window.phase && row.write_frozen === window.writeFrozen,
        `database_control_lineage_state_mismatch:${index}`);
      ensure(row.authority_epoch === window.controlEpoch,
        `database_control_lineage_epoch_mismatch:${index}`);
    }
    const controlRow = boundary.rows.at(-1);
    ensure(controlRow?.read_only === "on", "database_transaction_not_read_only");
    ensure(controlRow.isolation_level === "repeatable read",
      "database_transaction_isolation_invalid");
    ensure(controlRow.current_role === "candidate_audit_role", "database_audit_role_not_active");
    ensure(controlRow.phase === "shadow_capture", "database_phase_not_shadow_capture");
    ensure(controlRow.authority_epoch === request.authorityEpoch, "database_epoch_mismatch");
    ensure(controlRow.write_frozen === false, "database_write_frozen");
    ensure(controlRow.approved_release_id === request.releaseId, "database_release_mismatch");
    ensure(new Date(controlRow.database_now).getTime() <= new Date(controlRow.deadline_at).getTime(), "database_control_deadline_expired");

    const countsResult = await client.query(`WITH source_items AS (
      SELECT outbox.*,
        COALESCE(outbox.payload->>'releaseId'=ANY($2::text[]), false) AS in_lineage,
        EXISTS (SELECT 1 FROM candidate_authority.candidate_outbox_quarantine_resolutions resolution
          WHERE resolution.scope=outbox.scope AND resolution.quarantined_outbox_id=outbox.outbox_id) AS resolved
      FROM candidate_authority.candidate_episode_ingest_outbox outbox
      WHERE outbox.scope='production_radar' AND outbox.source_type=$1
    ) SELECT
      count(*) FILTER (WHERE status='pending')::int AS pending,
      count(*) FILTER (WHERE status='claimed')::int AS claimed,
      count(*) FILTER (WHERE status='retry_wait')::int AS retry_wait,
      count(*) FILTER (WHERE status='completed' AND in_lineage)::int AS completed,
      count(*) FILTER (WHERE status='quarantined' AND resolved)::int AS resolved_quarantine,
      count(*) FILTER (WHERE status='quarantined' AND NOT resolved)::int AS unresolved_quarantine,
      count(*) FILTER (WHERE status <> 'completed' AND NOT resolved)::int AS unresolved_total,
      count(*) FILTER (WHERE NOT in_lineage)::int AS outside_lineage
      FROM source_items`, [SOURCE_TYPE, sourceReleaseIds]);
    const counts = countsResult.rows[0];
    const statusCounts = {
      pending: nonNegativeInteger(counts.pending, "pending_count_invalid"),
      claimed: nonNegativeInteger(counts.claimed, "claimed_count_invalid"),
      retryWait: nonNegativeInteger(counts.retry_wait, "retry_wait_count_invalid"),
      completed: nonNegativeInteger(counts.completed, "completed_count_invalid"),
      resolvedQuarantine: nonNegativeInteger(counts.resolved_quarantine, "resolved_quarantine_count_invalid"),
      unresolvedQuarantine: nonNegativeInteger(counts.unresolved_quarantine, "unresolved_quarantine_count_invalid"),
      unresolvedTotal: nonNegativeInteger(counts.unresolved_total, "unresolved_count_invalid"),
      outsideLineage: nonNegativeInteger(counts.outside_lineage, "outside_lineage_count_invalid"),
    };

    const rows = [];
    let cursor = null;
    while (true) {
      const page = await client.query(`SELECT
        source.outbox_id::text, source.source_type, source.source_id,
        source.source_version, source.payload_version AS source_payload_version,
        source.payload AS source_payload, source.payload_hash AS source_payload_hash,
        source.idempotency_key AS source_idempotency_key, source.status AS source_status,
        source.created_at AS source_created_at, source.completed_at AS source_completed_at,
        event.event_id::text, event.episode_id::text AS event_episode_id,
        event.stream_version::int AS event_stream_version, event.event_type,
        event.event_time, event.source_scan_cycle_id AS event_source_scan_cycle_id,
        event.release_id AS event_release_id, event.runtime_id AS event_runtime_id,
        event.idempotency_key AS event_idempotency_key, event.command_hash AS event_command_hash,
        event.payload_version AS event_payload_version, event.payload AS event_payload,
        episode.episode_id::text, episode.canonical_instrument_id AS episode_canonical_instrument_id,
        episode.first_seen_at AS episode_first_seen_at, episode.last_seen_at AS episode_last_seen_at
      FROM candidate_authority.candidate_episode_ingest_outbox source
      LEFT JOIN candidate_authority.candidate_episode_events event
        ON event.scope=source.scope AND event.idempotency_key='shadow-projection:' || source.outbox_id::text
      LEFT JOIN candidate_authority.candidate_episodes episode
        ON episode.scope=event.scope AND episode.episode_id=event.episode_id
      WHERE source.scope='production_radar' AND source.source_type=$1
        AND source.payload->>'releaseId'=ANY($2::text[]) AND source.status='completed'
        AND ($3::uuid IS NULL OR source.outbox_id > $3::uuid)
      ORDER BY source.outbox_id LIMIT $4`, [SOURCE_TYPE, sourceReleaseIds, cursor, PAGE_SIZE]);
      if (page.rows.length === 0) break;
      rows.push(...page.rows.map(mapRow));
      cursor = page.rows.at(-1).outbox_id;
    }
    ensure(rows.length === statusCounts.completed, "completed_count_page_mismatch");
    const context = {
      authorityEpoch: request.authorityEpoch,
      controlStartedAt: new Date(controlRow.started_at).getTime(),
      controlDeadlineAt: new Date(controlRow.deadline_at).getTime(),
      lineageEvidenceSha256: request.lineageEvidenceSha256,
      migrationId: request.migrationId,
      releaseId: request.releaseId,
      sourceReleaseWindows,
    };
    const result = evaluateReconciliationEvidence({
      context,
      control: {
        phase: controlRow.phase,
        authorityEpoch: controlRow.authority_epoch,
        writeFrozen: controlRow.write_frozen,
        releaseId: controlRow.approved_release_id,
        migrationId: controlRow.migration_id,
        currentRole: controlRow.current_role,
        transactionReadOnly: controlRow.read_only === "on",
        transactionIsolation: controlRow.isolation_level,
      },
      lineage,
      rows,
      statusCounts,
    });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function main() {
  const mode = process.argv[2] ?? "dry-run";
  if (mode === "dry-run") {
    process.stdout.write(`${JSON.stringify({
      packageId: PACKAGE_ID,
      mode,
      minimumComparedWrites: MINIMUM_COMPARED_WRITES,
      minimumValidationCycles: 2,
      exactControlCountDerivedFromMigrationId: true,
      requiredLineageSchema: LINEAGE_SCHEMA,
      productionMutationAllowed: false,
      automaticPhaseAdvance: false,
      status: "READY_FOR_LOCAL_REHEARSAL_ONLY",
    }, null, 2)}\n`);
    return;
  }
  ensure(mode === "collect", "mode_not_supported");
  const requestPath = process.env.CANDIDATE_RECONCILIATION_REQUEST_FILE;
  const contractPath = process.env.CANDIDATE_RECONCILIATION_CONTRACT_FILE;
  const lineagePath = process.env.CANDIDATE_RECONCILIATION_LINEAGE_EVIDENCE_FILE;
  const urlPath = process.env.CANDIDATE_RECONCILIATION_DATABASE_URL_FILE;
  const outputPath = process.env.CANDIDATE_RECONCILIATION_OUTPUT_FILE;
  for (const [value, reason] of [
    [requestPath, "request_file_required"], [contractPath, "contract_file_required"],
    [lineagePath, "lineage_file_required"], [urlPath, "database_url_file_required"],
    [outputPath, "output_file_required"],
  ]) ensure(value, reason);
  const request = JSON.parse(await secureText(requestPath, "request_file"));
  const contract = JSON.parse(await readFile(contractPath, "utf8"));
  await assertPrivateRegularFile(lineagePath, "lineage_file", 512 * 1024);
  const lineageBytes = await readFile(lineagePath);
  ensure(`sha256:${sha256(lineageBytes)}` === request.lineageEvidenceSha256,
    "lineage_evidence_checksum_mismatch");
  const lineage = JSON.parse(lineageBytes);
  validateApprovalRequest(request, contract);
  validateLineageRequestBinding(lineage, request);
  const pg = loadPgRuntime();
  const { Client } = pg.default ?? pg;
  const client = new Client({
    application_name: "market-radar-candidate-reconciliation-read-only",
    connectionString: await secureText(urlPath, "database_url_file"),
  });
  await client.connect();
  try {
    const result = await collectReadOnlyEvidence(client, request, lineage);
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.status.startsWith("PASS_")) process.exitCode = 2;
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
