#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PACKAGE_ID =
  "WP-G0.2-SHADOW-VERIFY-PHASE-TRANSITION-AND-DUAL-READ-OBSERVATION";
export const MANIFEST_SCHEMA = "candidate-read-authority-manifest.v1";
export const SAMPLE_SCHEMA = "candidate-shadow-verify-observation-sample.v1";
export const EVIDENCE_SCHEMA = "candidate-shadow-verify-observation-evidence.v1";
export const MINIMUM_OBSERVATION_SAMPLES = 289;
export const MINIMUM_OBSERVATION_HOURS = 24;
export const MAXIMUM_SAMPLE_GAP_SECONDS = 600;
export const OBSERVATION_INTERVAL_SECONDS = 300;

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const MIGRATION = /^candidate-episode-v1(?:-cycle-([1-9][0-9]{0,5}))?$/u;
const RELEASE = /^candidate-shadow-[a-z0-9][a-z0-9._-]{7,100}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const IMAGE = /^sha256:[0-9a-f]{64}$/u;

const SHADOW_VERIFY_FLAGS = Object.freeze({
  CANDIDATE_EPISODE_DUAL_READ: "true",
  CANDIDATE_EPISODE_CANONICAL_READ: "false",
  CANDIDATE_EPISODE_REVIEW_READ: "false",
});

const LEGACY_FLAGS = Object.freeze({
  CANDIDATE_EPISODE_CANONICAL_WRITE: "false",
  CANDIDATE_EPISODE_SHADOW_WRITE: "false",
  CANDIDATE_EPISODE_DUAL_READ: "false",
  CANDIDATE_EPISODE_CANONICAL_READ: "false",
  CANDIDATE_EPISODE_REVIEW_READ: "false",
  CANDIDATE_SHADOW_WORKER_EXPECTED: "false",
  CANDIDATE_RUNTIME_RELEASE_ID: "disabled",
});

export class ShadowVerifyPhaseError extends Error {}

function ensure(condition, reason) {
  if (!condition) throw new ShadowVerifyPhaseError(reason);
}

export function canonicalJson(value) {
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

function timestamp(value, reason) {
  const parsed = Date.parse(value);
  ensure(Number.isFinite(parsed), reason);
  return parsed;
}

function positiveInteger(value, reason) {
  ensure(Number.isSafeInteger(value) && value > 0, reason);
  return value;
}

function assertMigration(value) {
  const match = MIGRATION.exec(value ?? "");
  ensure(match, "candidate_migration_id_invalid");
  ensure(!match[1] || Number(match[1]) > 1, "candidate_cycle_one_alias_invalid");
  return value;
}

function assertRelease(value) {
  ensure(RELEASE.test(value ?? ""), "candidate_release_id_invalid");
  return value;
}

function parseEnvironment(source) {
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

export function validateShadowCaptureEnvironment(source, releaseId) {
  const entries = parseEnvironment(source);
  for (const key of [
    "CANDIDATE_SOURCE_DATABASE_URL",
    "CANDIDATE_CONSUMER_DATABASE_URL",
    "CANDIDATE_MONITOR_DATABASE_URL",
  ]) ensure(entries.get(key)?.trim(), `candidate_database_url_missing:${key}`);
  ensure(entries.get("CANDIDATE_RUNTIME_RELEASE_ID") === releaseId,
    "candidate_runtime_release_mismatch");
  ensure(entries.get("CANDIDATE_EPISODE_SHADOW_WRITE") === "true",
    "candidate_shadow_write_not_enabled");
  ensure(entries.get("CANDIDATE_EPISODE_CANONICAL_WRITE") === "false",
    "candidate_canonical_write_not_false");
  ensure(entries.get("CANDIDATE_SHADOW_WORKER_EXPECTED") === "true",
    "candidate_worker_not_expected");
  for (const [key, value] of Object.entries(SHADOW_VERIFY_FLAGS)) {
    const expected = key === "CANDIDATE_EPISODE_DUAL_READ" ? "false" : value;
    ensure(entries.get(key) === expected, `candidate_pretransition_flag_invalid:${key}`);
  }
  return { releaseId, candidateUrlsConfigured: 3, phaseFlags: "shadow_capture" };
}

export function renderShadowVerifyEnvironment(source, releaseId) {
  validateShadowCaptureEnvironment(source, releaseId);
  return renderEnvironment(source, SHADOW_VERIFY_FLAGS);
}

export function renderLegacyEnvironment(source) {
  const entries = parseEnvironment(source);
  for (const key of [
    "CANDIDATE_SOURCE_DATABASE_URL",
    "CANDIDATE_CONSUMER_DATABASE_URL",
    "CANDIDATE_MONITOR_DATABASE_URL",
  ]) ensure(entries.get(key)?.trim(), `candidate_database_url_missing:${key}`);
  return renderEnvironment(source, LEGACY_FLAGS);
}

export function validateReconciliationEvidence(evidence) {
  ensure(evidence?.schemaVersion === "candidate-shadow-reconciliation-evidence.v1"
      && evidence.status
        === "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL",
  "reconciliation_status_invalid");
  ensure(evidence.automaticPhaseAdvance === false
      && evidence.phaseTransitionExecuted === false
      && evidence.productionRankingInputsUsed === false
      && evidence.futureOutcomeInputsUsed === false,
  "reconciliation_truth_boundary_invalid");
  ensure(Number.isSafeInteger(evidence.comparedWrites) && evidence.comparedWrites >= 10_000
      && evidence.comparisonDifferences === 0
      && evidence.duplicateOutboxMappings === 0
      && evidence.duplicateEventMappings === 0
      && evidence.violations?.length === 0
      && SHA256.test(evidence.evidenceHash ?? ""),
  "reconciliation_result_invalid");
  assertMigration(evidence.verificationMigrationId);
  return evidence;
}

export function validateCodeReleaseEvidence(evidence) {
  ensure(evidence?.status
      === "PASS_PRODUCTION_SHADOW_VERIFY_CODE_AUTHORIZATION_WEB_ONLY",
  "shadow_verify_code_release_not_pass");
  ensure(COMMIT.test(evidence.targetCommit ?? "") && IMAGE.test(evidence.targetWebImageId ?? ""),
    "shadow_verify_code_release_identity_invalid");
  ensure(evidence.servicesMutated?.length === 1 && evidence.servicesMutated[0] === "web"
      && evidence.databaseMutation === false && evidence.redisMutation === false
      && evidence.workerMutation === false && evidence.phaseTransition === false
      && evidence.manifestMutation === false && evidence.legacyResponseAuthority === true,
  "shadow_verify_code_release_boundary_invalid");
  return evidence;
}

export function buildShadowVerifyManifest({
  currentAuthorityEpoch,
  generatedAt,
  migrationId,
  reconciliationEvidenceHash,
  releaseId,
}) {
  positiveInteger(currentAuthorityEpoch, "current_authority_epoch_invalid");
  assertMigration(migrationId);
  assertRelease(releaseId);
  ensure(SHA256.test(reconciliationEvidenceHash ?? ""),
    "reconciliation_evidence_hash_invalid");
  const generatedMs = timestamp(generatedAt, "manifest_generated_at_invalid");
  ensure(generatedMs <= Date.now() + 60_000, "manifest_generated_at_future");
  return {
    schemaVersion: MANIFEST_SCHEMA,
    migrationId,
    scope: "production_radar",
    releaseId,
    authorityEpoch: currentAuthorityEpoch + 1,
    phase: "shadow_verify",
    generatedAt: new Date(generatedMs).toISOString(),
    flags: { dualRead: true, canonicalRead: false, reviewRead: false },
    evidence: {
      reconciliation: {
        status: "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL",
        evidenceHash: reconciliationEvidenceHash,
      },
      dualRead: { status: "missing", evidenceHash: null },
      canonicalCompat: { status: "missing", evidenceHash: null },
    },
  };
}

export function serializeManifest(manifest) {
  ensure(manifest?.schemaVersion === MANIFEST_SCHEMA && manifest.phase === "shadow_verify",
    "manifest_identity_invalid");
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function manifestApprovalDigest(rawManifest) {
  ensure(typeof rawManifest === "string" && rawManifest.endsWith("\n"),
    "manifest_bytes_invalid");
  return `sha256:${sha256(rawManifest)}`;
}

export function validateFullSnapshotEvidence(snapshot, expected) {
  ensure(snapshot?.schemaVersion === "candidate-full-snapshot-parity.v1"
      && snapshot.status === "pass" && snapshot.sameDatabaseSnapshot === true
      && snapshot.transactionIsolation === "serializable_read_only_deferrable",
  "full_snapshot_status_invalid");
  ensure(snapshot.phase === "shadow_verify"
      && snapshot.migrationId === expected.migrationId
      && snapshot.releaseId === expected.releaseId
      && snapshot.authorityEpoch === expected.authorityEpoch,
  "full_snapshot_authority_mismatch");
  timestamp(snapshot.databaseNow, "full_snapshot_database_time_invalid");
  ensure(Number.isSafeInteger(snapshot.pageCount) && snapshot.pageCount >= 1
      && Number.isSafeInteger(snapshot.totalEpisodes) && snapshot.totalEpisodes >= 0
      && snapshot.returnedEpisodes === snapshot.totalEpisodes
      && snapshot.duplicateEpisodeIds === 0
      && snapshot.differenceCount === 0
      && snapshot.allPagesVisited === true
      && snapshot.referenceStatus === "ready"
      && snapshot.candidateStatus === "ready"
      && snapshot.databaseRole === "candidate_audit_role"
      && snapshot.transactionReadOnly === true
      && snapshot.canAuthorizeCutover === false
      && snapshot.automaticPhaseAdvance === false
      && SHA256.test(snapshot.authorityFingerprint ?? "")
      && SHA256.test(snapshot.comparisonHash ?? ""),
  "full_snapshot_contract_invalid");
  return snapshot;
}

export function validateObservationSample(sample, expected) {
  ensure(sample?.schemaVersion === SAMPLE_SCHEMA, "observation_sample_schema_invalid");
  timestamp(sample.sampledAt, "observation_sample_time_invalid");
  ensure(sample.packageId === PACKAGE_ID
      && sample.productionCommit === expected.productionCommit
      && sample.webContainerId === expected.webContainerId
      && sample.webImageId === expected.webImageId
      && sample.candidateWorkerContainerId === expected.candidateWorkerContainerId
      && sample.candidateWorkerImageId === expected.candidateWorkerImageId,
  "observation_runtime_identity_mismatch");
  ensure(sample.migrationId === expected.migrationId
      && sample.releaseId === expected.releaseId
      && sample.authorityEpoch === expected.authorityEpoch
      && sample.phase === "shadow_verify"
      && sample.approvalDigest === expected.approvalDigest
      && sample.manifestSha256 === expected.manifestSha256
      && sample.productionEnvSha256 === expected.productionEnvSha256,
  "observation_authority_identity_mismatch");
  ensure(sample.healthLevel === "ready" && sample.scanFreshness === "fresh"
      && sample.databaseStatus === "ready" && sample.redisStatus === "healthy"
      && sample.candidateWorkerStatus === "healthy" && sample.scannerWorkerStatus === "healthy",
  "observation_health_invalid");
  const api = sample.api;
  ensure(api?.httpStatus === 200 && api.ok === true
      && api.mode === "dual_read_legacy_authority"
      && api.readSource === "legacy"
      && api.authority === "legacy_projection_non_authoritative"
      && api.candidateCanonicalReviewUsable === false
      && api.canAuthorizeCutover === false
      && api.canCreateTradePlan === false
      && api.canMutateLiveRanking === false
      && api.automaticPhaseAdvance === false
      && api.parityStatus === "pass" && api.differenceCount === 0
      && api.differences === 0 && SHA256.test(api.comparisonHash ?? ""),
  "observation_api_boundary_invalid");
  validateFullSnapshotEvidence(sample.fullSnapshot, expected);
  ensure(sample.sampledAt === sample.fullSnapshot.databaseNow,
    "observation_sample_database_time_mismatch");
  return sample;
}

export function evaluateShadowVerifyObservation(samples, expected) {
  const violations = [];
  const ordered = [...samples].sort((left, right) =>
    String(left.sampledAt).localeCompare(String(right.sampledAt)));
  if (ordered.length !== MINIMUM_OBSERVATION_SAMPLES) {
    violations.push("observation_sample_count_not_exact");
  }
  let previous = null;
  let maximumGapSeconds = 0;
  const comparisonHashes = [];
  for (const [index, sample] of ordered.entries()) {
    try {
      validateObservationSample(sample, expected);
      comparisonHashes.push(sample.fullSnapshot.comparisonHash);
    } catch (error) {
      violations.push(`sample_${index + 1}:${error.message}`);
    }
    const current = Date.parse(sample.sampledAt);
    if (!Number.isFinite(current)) continue;
    if (previous !== null) {
      const gap = (current - previous) / 1_000;
      if (gap <= 0) violations.push("observation_sample_order_invalid");
      maximumGapSeconds = Math.max(maximumGapSeconds, gap);
    }
    previous = current;
  }
  const first = Date.parse(ordered[0]?.sampledAt ?? "");
  const last = Date.parse(ordered.at(-1)?.sampledAt ?? "");
  const coverageHours = Number.isFinite(first) && Number.isFinite(last)
    ? (last - first) / 3_600_000
    : 0;
  if (coverageHours < MINIMUM_OBSERVATION_HOURS) {
    violations.push("observation_window_too_short");
  }
  if (maximumGapSeconds > MAXIMUM_SAMPLE_GAP_SECONDS) {
    violations.push("observation_sample_gap_exceeded");
  }
  const unique = [...new Set(violations)];
  const evidenceBody = {
    schemaVersion: EVIDENCE_SCHEMA,
    status: unique.length === 0
      ? "PASS_DUAL_READ_OBSERVATION"
      : "FAIL_SHADOW_VERIFY_OBSERVATION",
    packageId: PACKAGE_ID,
    migrationId: expected.migrationId,
    releaseId: expected.releaseId,
    authorityEpoch: expected.authorityEpoch,
    sampleCount: ordered.length,
    coverageHours,
    maximumGapSeconds,
    allPagesComparedEverySample: unique.length === 0,
    differenceCount: unique.length === 0 ? 0 : null,
    legacyResponseAuthority: true,
    candidateCanonicalReviewUsable: false,
    canAuthorizeCutover: false,
    canCreateTradePlan: false,
    canMutateLiveRanking: false,
    automaticPhaseAdvance: false,
    canonicalCompatStarted: false,
    canonicalCutoverExecuted: false,
    g0Completed: false,
    violations: unique,
  };
  return {
    ...evidenceBody,
    evidenceHash: unique.length === 0
      ? `sha256:${sha256(canonicalJson({
        ...evidenceBody,
        comparisonHashes,
        sampleHashes: ordered.map((sample) => `sha256:${sha256(canonicalJson(sample))}`),
      }))}`
      : null,
  };
}

async function secureText(path, label) {
  const metadata = await stat(path);
  ensure(metadata.isFile() && !metadata.isSymbolicLink(), `${label}_not_regular_file`);
  ensure((metadata.mode & 0o077) === 0, `${label}_permissions_too_open`);
  ensure(metadata.size > 0 && metadata.size <= 64 * 1024, `${label}_size_invalid`);
  const value = (await readFile(path, "utf8")).trim();
  ensure(value, `${label}_empty`);
  return value;
}

function loadPg() {
  const require = createRequire(import.meta.url);
  for (const candidate of [
    () => require("pg"),
    () => createRequire("/app/package.json")("pg"),
  ]) {
    try {
      return candidate();
    } catch (error) {
      if (error?.code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  throw new ShadowVerifyPhaseError("approved_pg_runtime_unavailable");
}

async function withMigrationClient(urlFile, work) {
  const { Client } = loadPg();
  const client = new Client({
    application_name: "market-radar-shadow-verify-phase",
    connectionString: await secureText(urlFile, "migration_admin_url"),
  });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function withMigrationRole(client, work) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE candidate_migration_role");
    const result = await work();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

const CONTROL_QUERY = `SELECT control.migration_id, control.phase, control.epoch::int,
  control.started_at, control.deadline_at, control.write_frozen,
  control.approved_release_id, control.approval_digest, control.updated_at,
  clock_timestamp() AS database_now,
  (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox
    WHERE scope='production_radar' AND status<>'completed'
      AND NOT EXISTS (
        SELECT 1 FROM candidate_authority.candidate_outbox_quarantine_resolutions resolution
        WHERE resolution.scope=candidate_episode_ingest_outbox.scope
          AND resolution.quarantined_outbox_id=candidate_episode_ingest_outbox.outbox_id
      )) AS unresolved_outbox,
  (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox
    WHERE scope='production_radar' AND status='completed') AS completed_writes
  FROM candidate_authority.candidate_migration_control control
  WHERE control.migration_id=$1`;

function assertPretransitionControl(row, request) {
  ensure(row && row.migration_id === request.migrationId
      && row.phase === "shadow_capture" && row.write_frozen === false
      && row.approved_release_id === request.releaseId,
  "candidate_control_pretransition_invalid");
  positiveInteger(row.epoch, "candidate_control_epoch_invalid");
  ensure(row.epoch === request.currentAuthorityEpoch, "candidate_control_epoch_mismatch");
  ensure(row.unresolved_outbox === 0, "candidate_unresolved_outbox_present");
  ensure(row.completed_writes >= 10_000, "candidate_completed_writes_below_10000");
  const remaining = new Date(row.deadline_at).getTime() - new Date(row.database_now).getTime();
  ensure(remaining >= (MINIMUM_OBSERVATION_HOURS * 3_600 + MAXIMUM_SAMPLE_GAP_SECONDS) * 1_000,
    "candidate_deadline_insufficient_for_observation");
}

export async function preflightControl(client, request) {
  return withMigrationRole(client, async () => {
    const result = await client.query(CONTROL_QUERY, [request.migrationId]);
    const row = result.rows[0];
    assertPretransitionControl(row, request);
    return {
      status: "PASS_SHADOW_VERIFY_CONTROL_PREFLIGHT",
      migrationId: row.migration_id,
      releaseId: row.approved_release_id,
      currentAuthorityEpoch: row.epoch,
      targetAuthorityEpoch: row.epoch + 1,
      completedWrites: row.completed_writes,
      unresolvedOutbox: row.unresolved_outbox,
      deadlineAt: new Date(row.deadline_at).toISOString(),
      databaseNow: new Date(row.database_now).toISOString(),
      secretsPrinted: false,
    };
  });
}

export async function transitionControl(client, request, rawManifest) {
  const manifest = JSON.parse(rawManifest);
  ensure(manifestApprovalDigest(rawManifest) === request.manifestApprovalDigest,
    "manifest_approval_digest_mismatch");
  ensure(manifest.migrationId === request.migrationId
      && manifest.releaseId === request.releaseId
      && manifest.authorityEpoch === request.targetAuthorityEpoch
      && manifest.authorityEpoch === request.currentAuthorityEpoch + 1
      && manifest.phase === "shadow_verify",
  "manifest_transition_identity_mismatch");
  return withMigrationRole(client, async () => {
    const before = (await client.query(`${CONTROL_QUERY} FOR UPDATE`, [request.migrationId])).rows[0];
    assertPretransitionControl(before, request);
    const result = await client.query(`SELECT migration_id, phase, epoch::int,
      write_frozen, approved_release_id, approval_digest, updated_at
      FROM candidate_authority.transition_migration_control_v1(
        $1,$2,'shadow_verify',false,$3,$4,clock_timestamp())`, [
      request.migrationId,
      request.currentAuthorityEpoch,
      request.releaseId,
      request.manifestApprovalDigest,
    ]);
    const row = result.rows[0];
    ensure(row?.migration_id === request.migrationId && row.phase === "shadow_verify"
        && row.epoch === request.targetAuthorityEpoch && row.write_frozen === false
        && row.approved_release_id === request.releaseId
        && row.approval_digest === request.manifestApprovalDigest,
    "shadow_verify_transition_result_invalid");
    ensure(Date.parse(manifest.generatedAt) <= new Date(row.updated_at).getTime(),
      "manifest_generated_after_control_update");
    return {
      status: "PASS_SHADOW_VERIFY_CONTROL_TRANSITION",
      migrationId: row.migration_id,
      releaseId: row.approved_release_id,
      authorityEpoch: row.epoch,
      phase: row.phase,
      writeFrozen: row.write_frozen,
      approvalDigest: row.approval_digest,
      updatedAt: new Date(row.updated_at).toISOString(),
      secretsPrinted: false,
    };
  });
}

export async function rollbackControl(client, request) {
  ensure(SHA256.test(request.rollbackApprovalDigest ?? ""),
    "rollback_approval_digest_invalid");
  return withMigrationRole(client, async () => {
    const current = (await client.query(`${CONTROL_QUERY} FOR UPDATE`, [request.migrationId])).rows[0];
    ensure(current && current.approved_release_id === request.releaseId,
      "rollback_control_release_mismatch");
    if (current.phase === "shadow_capture") {
      ensure(current.write_frozen === false
          && current.epoch === request.currentAuthorityEpoch,
      "rollback_shadow_capture_identity_invalid");
      return {
        status: "PASS_SHADOW_VERIFY_CONTROL_ROLLBACK_NOT_REQUIRED",
        migrationId: current.migration_id,
        authorityEpoch: current.epoch,
        phase: "shadow_capture",
        writeFrozen: false,
        alreadyRolledBack: false,
        transitionNotStarted: true,
        secretsPrinted: false,
      };
    }
    if (current.phase === "legacy") {
      ensure(current.write_frozen === true, "rollback_legacy_not_frozen");
      return {
        status: "PASS_SHADOW_VERIFY_CONTROL_ROLLBACK",
        migrationId: current.migration_id,
        authorityEpoch: current.epoch,
        phase: "legacy",
        writeFrozen: true,
        alreadyRolledBack: true,
        secretsPrinted: false,
      };
    }
    ensure(current.phase === "shadow_verify" && current.write_frozen === false
        && current.epoch === request.targetAuthorityEpoch,
    "rollback_control_phase_invalid");
    const result = await client.query(`SELECT migration_id, phase, epoch::int,
      write_frozen, approved_release_id, approval_digest
      FROM candidate_authority.transition_migration_control_v1(
        $1,$2,'legacy',true,$3,$4,clock_timestamp())`, [
      request.migrationId,
      request.targetAuthorityEpoch,
      request.releaseId,
      request.rollbackApprovalDigest,
    ]);
    const row = result.rows[0];
    ensure(row?.phase === "legacy" && row.write_frozen === true
        && row.epoch === request.targetAuthorityEpoch + 1,
    "rollback_control_result_invalid");
    return {
      status: "PASS_SHADOW_VERIFY_CONTROL_ROLLBACK",
      migrationId: row.migration_id,
      authorityEpoch: row.epoch,
      phase: row.phase,
      writeFrozen: row.write_frozen,
      alreadyRolledBack: false,
      secretsPrinted: false,
    };
  });
}

async function writeAtomic(path, value) {
  const target = resolve(path);
  const temporary = resolve(dirname(target), `.${target.split("/").at(-1)}.${process.pid}.tmp`);
  await writeFile(temporary, value, { mode: 0o600 });
  await rename(temporary, target);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    ensure(rest[index]?.startsWith("--") && rest[index + 1] !== undefined,
      "argument_invalid");
    options[rest[index].slice(2)] = rest[index + 1];
  }
  return { command, options };
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "render-env") {
    const request = await readJson(options.request);
    const source = await readFile(resolve(options.source), "utf8");
    await writeAtomic(options.output, renderShadowVerifyEnvironment(source, request.releaseId));
    return;
  }
  if (command === "render-legacy-env") {
    const source = await readFile(resolve(options.source), "utf8");
    await writeAtomic(options.output, renderLegacyEnvironment(source));
    return;
  }
  if (command === "build-manifest") {
    const request = await readJson(options.request);
    const reconciliation = validateReconciliationEvidence(
      await readJson(request.reconciliationEvidencePath),
    );
    const manifest = buildShadowVerifyManifest({
      currentAuthorityEpoch: request.currentAuthorityEpoch,
      generatedAt: options.now ?? new Date().toISOString(),
      migrationId: request.migrationId,
      reconciliationEvidenceHash: reconciliation.evidenceHash,
      releaseId: request.releaseId,
    });
    const raw = serializeManifest(manifest);
    ensure(manifestApprovalDigest(raw) === request.manifestApprovalDigest,
      "request_manifest_digest_not_current");
    await writeAtomic(options.output, raw);
    return;
  }
  if (command === "sample") {
    const request = await readJson(options.request);
    const sample = await readJson(options.input);
    process.stdout.write(`${JSON.stringify(validateObservationSample(sample, request), null, 2)}\n`);
    return;
  }
  if (command === "observe") {
    const request = await readJson(options.request);
    const samples = (await readFile(resolve(options.input), "utf8"))
      .trim().split("\n").filter(Boolean).map(JSON.parse);
    const result = evaluateShadowVerifyObservation(samples, request);
    ensure(result.status === "PASS_DUAL_READ_OBSERVATION", result.violations.join(","));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (["control-preflight", "control-transition", "control-rollback"].includes(command)) {
    const request = await readJson(options.request);
    const result = await withMigrationClient(options["admin-url-file"], async (client) => {
      if (command === "control-preflight") return preflightControl(client, request);
      if (command === "control-transition") {
        return transitionControl(client, request, await readFile(resolve(options.manifest), "utf8"));
      }
      return rollbackControl(client, request);
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  throw new ShadowVerifyPhaseError("command_invalid");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", reason: error.message })}\n`);
    process.exitCode = 1;
  });
}
