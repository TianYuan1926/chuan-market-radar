import { createHash } from "node:crypto";
import { stat, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const PACKAGE_ID = "WP-G0.2-SHADOW-VERIFY-RECONCILIATION";
export const MIGRATION_ID = "candidate-episode-v1";
export const MINIMUM_COMPARED_WRITES = 10_000;
export const MINIMUM_CLEAN_WINDOW_HOURS = 24;
export const PAGE_SIZE = 500;

const SOURCE_TYPE = "legacy_scan_candidate";
const PAYLOAD_VERSION = "shadow-candidate-observation.v1";
const EVENT_PAYLOAD_VERSION = "candidate-event.v1";
const EVENT_TYPES = new Set(["DISCOVERED", "REFRESHED", "RETRIGGERED"]);
const REQUEST_KEYS = Object.freeze([
  "activationEvidenceSha256",
  "activationObservationStatus",
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
  "migrationAllowed",
  "migrationId",
  "minimumCleanWindowHours",
  "minimumComparedWrites",
  "operator",
  "packageId",
  "productionRankingMutationAllowed",
  "releaseId",
  "reviewReadAllowed",
  "schemaDdlAllowed",
  "shadowVerifyTransitionAllowed",
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

export function validateApprovalRequest(request, contract, { now = new Date() } = {}) {
  ensure(exactKeys(request, REQUEST_KEYS), "request_keys_mismatch");
  ensure(request.packageId === PACKAGE_ID, "request_package_mismatch");
  ensure(request.migrationId === MIGRATION_ID, "migration_id_mismatch");
  ensure(request.activationObservationStatus === "PASS_ACTIVATE_AND_OBSERVE", "activation_observation_not_pass");
  ensure(/^[0-9a-f]{40}$/.test(request.approvedCommit ?? ""), "approved_commit_invalid");
  ensure(/^candidate-shadow-[a-z0-9][a-z0-9._-]{7,80}$/.test(request.releaseId ?? ""), "release_id_invalid");
  ensure(/^sha256:[0-9a-f]{64}$/.test(request.activationEvidenceSha256 ?? ""), "activation_evidence_hash_invalid");
  ensure(request.approvedRunnerArtifactSha256 === contract.runnerArtifact.sha256, "runner_artifact_mismatch");
  ensure(request.authorityEpoch === 1, "authority_epoch_must_be_one");
  ensure(request.minimumComparedWrites === MINIMUM_COMPARED_WRITES, "compared_writes_threshold_changed");
  ensure(request.minimumCleanWindowHours === MINIMUM_CLEAN_WINDOW_HOURS, "clean_window_threshold_changed");
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
  check(payload.releaseId === context.releaseId, "source_release_mismatch");
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
  check(row.event_runtime_id?.startsWith(`candidate-shadow:${context.releaseId}:`) === true, "projection_runtime_release_mismatch");
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
      check(createdAt >= context.controlStartedAt && createdAt <= context.controlDeadlineAt, "source_created_outside_control_window");
      check(completedAt >= createdAt && completedAt <= context.controlDeadlineAt, "source_completed_outside_control_window");
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

export function evaluateReconciliationEvidence({ context, control, observation, rows, statusCounts }) {
  const violations = [];
  const add = (condition, code) => {
    if (!condition) violations.push(code);
  };
  add(control.phase === "shadow_capture", "control_phase_not_shadow_capture");
  add(Number(control.authorityEpoch) === context.authorityEpoch, "control_epoch_mismatch");
  add(control.writeFrozen === false, "control_write_frozen");
  add(control.releaseId === context.releaseId, "control_release_mismatch");
  add(observation.status === "PASS_ACTIVATE_AND_OBSERVE", "observation_not_pass");
  add(observation.releaseId === context.releaseId, "observation_release_mismatch");
  add(Number(observation.authorityEpoch) === context.authorityEpoch, "observation_epoch_mismatch");
  add(Number(observation.coverageHours) >= MINIMUM_CLEAN_WINDOW_HOURS, "observation_window_too_short");
  add(Number(observation.sampleCount) >= 289, "observation_samples_insufficient");
  add(statusCounts.pending === 0, "pending_outbox_present");
  add(statusCounts.claimed === 0, "claimed_outbox_present");
  add(statusCounts.retryWait === 0, "retry_wait_outbox_present");
  add(statusCounts.unresolvedQuarantine === 0, "unresolved_quarantine_present");
  add(statusCounts.unresolvedTotal === 0, "unresolved_outbox_present");

  const rowResults = rows.map((row) => compareProjectionRow(row, context));
  const duplicateOutbox = rowResults.length - new Set(rowResults.map((item) => item.outboxId)).size;
  const duplicateEvents = rowResults.length - new Set(rowResults.map((item) => item.eventId)).size;
  const differences = rowResults.flatMap((item) => item.differences.map((code) => ({ outboxId: item.outboxId, code })));
  add(rows.length >= MINIMUM_COMPARED_WRITES, "compared_writes_below_10000");
  add(duplicateOutbox === 0, "duplicate_source_write_mapping");
  add(duplicateEvents === 0, "duplicate_projection_event_mapping");
  add(differences.length === 0, "comparison_differences_present");
  const evidenceHash = sha256(canonicalJson({
    authorityEpoch: context.authorityEpoch,
    comparedWriteDigests: rowResults.map((item) => item.digest).sort(),
    control,
    observationEvidenceSha256: context.observationEvidenceSha256,
    releaseId: context.releaseId,
    statusCounts,
  }));
  return {
    schemaVersion: "candidate-shadow-reconciliation-evidence.v1",
    status: violations.length === 0 ? "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL" : "FAIL_RECONCILIATION",
    automaticPhaseAdvance: false,
    phaseTransitionExecuted: false,
    productionRankingInputsUsed: false,
    futureOutcomeInputsUsed: false,
    comparedWrites: rows.length,
    comparisonDifferences: differences.length,
    duplicateOutboxMappings: duplicateOutbox,
    duplicateEventMappings: duplicateEvents,
    resolvedQuarantineExclusions: statusCounts.resolvedQuarantine,
    evidenceHash: `sha256:${evidenceHash}`,
    violations,
    differenceSample: differences.slice(0, 25),
  };
}

async function secureText(path, label) {
  const metadata = await stat(path);
  ensure(metadata.isFile(), `${label}_not_file`);
  ensure((metadata.mode & 0o077) === 0, `${label}_permissions_too_open`);
  ensure(metadata.size > 0 && metadata.size <= 64 * 1024, `${label}_size_invalid`);
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

export async function collectReadOnlyEvidence(client, request, observation) {
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout = '5min'");
    await client.query("SET LOCAL lock_timeout = '2s'");
    const boundary = await client.query(`SELECT current_setting('transaction_read_only') AS read_only,
      control.phase, control.epoch::int AS authority_epoch, control.started_at,
      control.deadline_at, control.write_frozen, control.approved_release_id,
      clock_timestamp() AS database_now
      FROM candidate_authority.candidate_migration_control control
      WHERE control.migration_id=$1`, [request.migrationId]);
    const controlRow = boundary.rows[0];
    ensure(controlRow?.read_only === "on", "database_transaction_not_read_only");
    ensure(controlRow.phase === "shadow_capture", "database_phase_not_shadow_capture");
    ensure(controlRow.authority_epoch === request.authorityEpoch, "database_epoch_mismatch");
    ensure(controlRow.write_frozen === false, "database_write_frozen");
    ensure(controlRow.approved_release_id === request.releaseId, "database_release_mismatch");
    ensure(new Date(controlRow.database_now).getTime() <= new Date(controlRow.deadline_at).getTime(), "database_control_deadline_expired");

    const countsResult = await client.query(`WITH source_items AS (
      SELECT outbox.*,
        EXISTS (SELECT 1 FROM candidate_authority.candidate_outbox_quarantine_resolutions resolution
          WHERE resolution.scope=outbox.scope AND resolution.quarantined_outbox_id=outbox.outbox_id) AS resolved
      FROM candidate_authority.candidate_episode_ingest_outbox outbox
      WHERE outbox.scope='production_radar' AND outbox.source_type=$1
        AND outbox.payload->>'releaseId'=$2
    ) SELECT
      count(*) FILTER (WHERE status='pending')::int AS pending,
      count(*) FILTER (WHERE status='claimed')::int AS claimed,
      count(*) FILTER (WHERE status='retry_wait')::int AS retry_wait,
      count(*) FILTER (WHERE status='completed')::int AS completed,
      count(*) FILTER (WHERE status='quarantined' AND resolved)::int AS resolved_quarantine,
      count(*) FILTER (WHERE status='quarantined' AND NOT resolved)::int AS unresolved_quarantine,
      count(*) FILTER (WHERE status <> 'completed' AND NOT resolved)::int AS unresolved_total
      FROM source_items`, [SOURCE_TYPE, request.releaseId]);
    const counts = countsResult.rows[0];
    const statusCounts = {
      pending: nonNegativeInteger(counts.pending, "pending_count_invalid"),
      claimed: nonNegativeInteger(counts.claimed, "claimed_count_invalid"),
      retryWait: nonNegativeInteger(counts.retry_wait, "retry_wait_count_invalid"),
      completed: nonNegativeInteger(counts.completed, "completed_count_invalid"),
      resolvedQuarantine: nonNegativeInteger(counts.resolved_quarantine, "resolved_quarantine_count_invalid"),
      unresolvedQuarantine: nonNegativeInteger(counts.unresolved_quarantine, "unresolved_quarantine_count_invalid"),
      unresolvedTotal: nonNegativeInteger(counts.unresolved_total, "unresolved_count_invalid"),
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
        AND source.payload->>'releaseId'=$2 AND source.status='completed'
        AND ($3::uuid IS NULL OR source.outbox_id > $3::uuid)
      ORDER BY source.outbox_id LIMIT $4`, [SOURCE_TYPE, request.releaseId, cursor, PAGE_SIZE]);
      if (page.rows.length === 0) break;
      rows.push(...page.rows.map(mapRow));
      cursor = page.rows.at(-1).outbox_id;
    }
    ensure(rows.length === statusCounts.completed, "completed_count_page_mismatch");
    const context = {
      authorityEpoch: request.authorityEpoch,
      controlStartedAt: new Date(controlRow.started_at).getTime(),
      controlDeadlineAt: new Date(controlRow.deadline_at).getTime(),
      observationEvidenceSha256: request.activationEvidenceSha256,
      releaseId: request.releaseId,
    };
    const result = evaluateReconciliationEvidence({
      context,
      control: {
        phase: controlRow.phase,
        authorityEpoch: controlRow.authority_epoch,
        writeFrozen: controlRow.write_frozen,
        releaseId: controlRow.approved_release_id,
      },
      observation,
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
      minimumCleanWindowHours: MINIMUM_CLEAN_WINDOW_HOURS,
      productionMutationAllowed: false,
      automaticPhaseAdvance: false,
      status: "READY_FOR_LOCAL_REHEARSAL_ONLY",
    }, null, 2)}\n`);
    return;
  }
  ensure(mode === "collect", "mode_not_supported");
  const requestPath = process.env.CANDIDATE_RECONCILIATION_REQUEST_FILE;
  const contractPath = process.env.CANDIDATE_RECONCILIATION_CONTRACT_FILE;
  const observationPath = process.env.CANDIDATE_ACTIVATION_EVIDENCE_FILE;
  const urlPath = process.env.CANDIDATE_RECONCILIATION_DATABASE_URL_FILE;
  const outputPath = process.env.CANDIDATE_RECONCILIATION_OUTPUT_FILE;
  for (const [value, reason] of [
    [requestPath, "request_file_required"], [contractPath, "contract_file_required"],
    [observationPath, "observation_file_required"], [urlPath, "database_url_file_required"],
    [outputPath, "output_file_required"],
  ]) ensure(value, reason);
  const request = JSON.parse(await secureText(requestPath, "request_file"));
  const contract = JSON.parse(await readFile(contractPath, "utf8"));
  const observationBytes = await readFile(observationPath);
  ensure(`sha256:${sha256(observationBytes)}` === request.activationEvidenceSha256, "activation_evidence_checksum_mismatch");
  const observation = JSON.parse(observationBytes);
  validateApprovalRequest(request, contract);
  const { Client } = await import("pg").then((module) => module.default ?? module);
  const client = new Client({
    application_name: "market-radar-candidate-reconciliation-read-only",
    connectionString: await secureText(urlPath, "database_url_file"),
  });
  await client.connect();
  try {
    const result = await collectReadOnlyEvidence(client, request, observation);
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
