import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
export const PACKAGE_ID = "WP-G0.2-SHADOW-CAPTURE-ACTIVATE-AND-OBSERVE";
export const MIGRATION_ID = "candidate-episode-v1";
export const OBSERVATION_INTERVAL_SECONDS = 300;
export const MAXIMUM_SAMPLE_GAP_SECONDS = 600;
export const MINIMUM_OBSERVATION_HOURS = 24;
export const MINIMUM_OBSERVATION_SAMPLES = 289;
const DORMANT_FINAL_STATUS = "PASS_PRODUCTION_DORMANT_RUNTIME_WEB_ONLY_1800_SECOND_OBSERVATION";
const RUNTIME_IDENTITY_FINAL_STATUS = "PASS_RUNTIME_IDENTITY_AND_PERMISSION";

const ACTIVATION_ENVIRONMENT = Object.freeze({
  CANDIDATE_EPISODE_CANONICAL_READ: "false",
  CANDIDATE_EPISODE_CANONICAL_WRITE: "false",
  CANDIDATE_EPISODE_DUAL_READ: "false",
  CANDIDATE_EPISODE_REVIEW_READ: "false",
  CANDIDATE_EPISODE_SHADOW_WRITE: "true",
  CANDIDATE_SHADOW_WORKER_EXPECTED: "true",
});
const CANDIDATE_URL_KEYS = Object.freeze([
  "CANDIDATE_SOURCE_DATABASE_URL",
  "CANDIDATE_CONSUMER_DATABASE_URL",
  "CANDIDATE_MONITOR_DATABASE_URL",
]);
const REQUEST_KEYS = Object.freeze([
  "approvalDigest",
  "approvalExpiresAt",
  "approvalIssuedAt",
  "approvalRef",
  "approvedActivationArtifactSha256",
  "approvedCommit",
  "approvedRunnerArtifactSha256",
  "autonomyAuthorization",
  "autonomyTrustRoot",
  "automaticControlRollbackAllowed",
  "automaticEnvironmentRollbackAllowed",
  "automaticServiceRollbackAllowed",
  "baseEnvSha256",
  "businessDmlAllowed",
  "candidateDatabaseUrlMutationAllowed",
  "candidateFeatureFlagEnablementAllowed",
  "candidateWorkerStartAllowed",
  "canonicalReadAllowed",
  "canonicalWriteAllowed",
  "codeActivationAllowed",
  "composeProfile",
  "composeSha256",
  "controlLifecycleStartAllowed",
  "dormantDeployStatus",
  "dormantEvidencePath",
  "dormantEvidenceSha256",
  "dualReadAllowed",
  "evidenceDirectory",
  "environmentMutationAllowed",
  "execute",
  "identityOverrideSha256",
  "identityOverridePath",
  "identityWrapperSha256",
  "identityWrapperPath",
  "migrationAllowed",
  "migrationId",
  "minimumObservationHours",
  "observationIntervalSeconds",
  "operator",
  "observerUnitName",
  "opsRoot",
  "packageId",
  "postgresAdminEnvPath",
  "productionEnvSha256",
  "productionRoot",
  "productionRankingMutationAllowed",
  "releaseId",
  "reviewReadAllowed",
  "rollbackCommit",
  "rollbackWebImageRef",
  "runnerUnitName",
  "runtimeIdentityEvidencePath",
  "runtimeIdentityEvidenceSha256",
  "runtimeIdentityStatus",
  "runnerContractSha256",
  "schemaDdlAllowed",
  "secureRoot",
  "services",
  "sessionIndependentExecutionRequired",
  "shadowWriteAllowed",
  "stagingDirectory",
  "temporaryArtifactCleanupRequired",
  "transportBundleSha256",
  "webImageId",
  "workerExpectedAllowed",
]);

export class ActivationPolicyError extends Error {
  constructor(reason) {
    super(`candidate activation policy rejected: ${reason}`);
    this.name = "ActivationPolicyError";
    this.reason = reason;
  }
}

function ensure(condition, reason) {
  if (!condition) throw new ActivationPolicyError(reason);
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function timestamp(value, reason) {
  const parsed = Date.parse(value);
  ensure(Number.isFinite(parsed), reason);
  return parsed;
}

export function validateApprovalRequest(
  request,
  contract,
  { allowExpiredForRollback = false, now = new Date() } = {},
) {
  ensure(exactKeys(request, REQUEST_KEYS), "request_keys_mismatch");
  ensure(request.packageId === PACKAGE_ID, "request_package_mismatch");
  ensure(request.dormantDeployStatus === DORMANT_FINAL_STATUS, "dormant_deploy_not_pass");
  ensure(request.runtimeIdentityStatus === RUNTIME_IDENTITY_FINAL_STATUS, "runtime_identity_not_pass");
  ensure(/^[0-9a-f]{40}$/.test(request.approvedCommit ?? ""), "approved_commit_invalid");
  ensure(/^[0-9a-f]{40}$/.test(request.rollbackCommit ?? ""), "rollback_commit_invalid");
  ensure(request.approvedCommit !== request.rollbackCommit, "rollback_commit_matches_approved_commit");
  ensure(/^[0-9a-f]{64}$/.test(request.approvedActivationArtifactSha256 ?? ""), "activation_artifact_invalid");
  ensure(request.approvedRunnerArtifactSha256 === contract.runnerArtifact.sha256, "runner_artifact_mismatch");
  ensure(/^[0-9a-f]{64}$/.test(request.runnerContractSha256 ?? ""), "runner_contract_checksum_invalid");
  ensure(/^candidate-shadow-[a-z0-9][a-z0-9._-]{7,80}$/.test(request.releaseId ?? ""), "release_id_invalid");
  ensure(request.migrationId === MIGRATION_ID, "migration_id_mismatch");
  ensure(/^sha256:[0-9a-f]{64}$/.test(request.approvalDigest ?? ""), "approval_digest_invalid");
  for (const key of [
    "baseEnvSha256", "composeSha256", "identityOverrideSha256", "identityWrapperSha256",
    "productionEnvSha256", "transportBundleSha256",
  ]) ensure(/^[0-9a-f]{64}$/.test(request[key] ?? ""), `${key}_invalid`);
  ensure(/^sha256:[0-9a-f]{64}$/.test(request.webImageId ?? ""), "web_image_invalid");
  ensure(/^market-radar-rollback\/wp-g0-2-candidate-activation:web-[0-9a-f]{16}$/.test(
    request.rollbackWebImageRef ?? "",
  ), "rollback_web_image_ref_invalid");
  ensure(request.rollbackWebImageRef.endsWith(request.webImageId.slice(7, 23)),
    "rollback_web_image_binding_mismatch");
  ensure(typeof request.approvalRef === "string" && /^[A-Za-z0-9._:/-]{8,128}$/.test(request.approvalRef), "approval_ref_invalid");
  ensure(typeof request.operator === "string" && request.operator.trim().length >= 2, "operator_invalid");
  ensure(request.autonomyTrustRoot === "/home/ubuntu/.local/state/market-radar-autonomy",
    "autonomy_trust_root_invalid");
  ensure(request.sessionIndependentExecutionRequired === true, "session_independent_execution_required");
  ensure(request.temporaryArtifactCleanupRequired === true, "temporary_artifact_cleanup_required");
  ensure(
    /^\/home\/ubuntu\/\.cache\/market-radar-ops\/wp-g0-2-candidate-activation-[a-z0-9][a-z0-9._-]{7,80}$/.test(request.stagingDirectory ?? "")
      || /^\/tmp\/wp_g0_2_rehearsal_candidate_activation_[A-Za-z0-9_./-]+$/.test(request.stagingDirectory ?? ""),
    "staging_directory_invalid",
  );
  ensure(
    /^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/wp-g0-2-candidate-activation-[a-z0-9][a-z0-9._-]{7,80}$/.test(request.evidenceDirectory ?? "")
      || /^\/tmp\/wp_g0_2_rehearsal_candidate_activation_[A-Za-z0-9_./-]+$/.test(request.evidenceDirectory ?? ""),
    "evidence_directory_invalid",
  );
  ensure(
    /^\/home\/ubuntu\/\.cache\/market-radar-ops\/candidate-activation-ops\/wp-g0-2-candidate-activation-[a-z0-9][a-z0-9._-]{7,80}$/.test(request.opsRoot ?? "")
      || /^\/tmp\/wp_g0_2_rehearsal_candidate_activation_[A-Za-z0-9_./-]+$/.test(request.opsRoot ?? ""),
    "ops_root_invalid",
  );
  ensure(
    /^\/home\/ubuntu\/\.local\/state\/market-radar-candidate-activation\/[a-z0-9][a-z0-9._-]{7,80}$/.test(request.secureRoot ?? "")
      || /^\/tmp\/wp_g0_2_rehearsal_candidate_activation_[A-Za-z0-9_./-]+$/.test(request.secureRoot ?? ""),
    "secure_root_invalid",
  );
  ensure(request.productionRoot === "/home/ubuntu/apps/chuan-market-radar"
    || /^\/tmp\/wp_g0_2_rehearsal_candidate_activation_[A-Za-z0-9_./-]+\/production$/.test(
      request.productionRoot ?? "",
    ), "production_root_invalid");
  ensure(request.postgresAdminEnvPath
    === "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env",
  "postgres_admin_env_path_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/.+\/summary\.json$/.test(request.dormantEvidencePath ?? "")
    || /^\/tmp\/wp_g0_2_rehearsal_candidate_activation_[A-Za-z0-9_/.-]+$/.test(request.dormantEvidencePath ?? ""),
  "dormant_evidence_path_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/.+\/runtime-identity-result\.json$/.test(request.runtimeIdentityEvidencePath ?? "")
    || /^\/tmp\/wp_g0_2_rehearsal_candidate_activation_[A-Za-z0-9_/.-]+$/.test(request.runtimeIdentityEvidencePath ?? ""),
  "runtime_identity_evidence_path_invalid");
  for (const key of ["dormantEvidenceSha256", "runtimeIdentityEvidenceSha256"]) {
    ensure(/^[0-9a-f]{64}$/.test(request[key] ?? ""), `${key}_invalid`);
  }
  ensure(typeof request.identityWrapperPath === "string" && request.identityWrapperPath.startsWith("/"),
    "identity_wrapper_path_invalid");
  ensure(typeof request.identityOverridePath === "string" && request.identityOverridePath.startsWith("/"),
    "identity_override_path_invalid");
  ensure(/^market-radar-candidate-activation-[a-z0-9][a-z0-9-]{7,48}$/.test(request.runnerUnitName ?? ""),
    "runner_unit_invalid");
  ensure(/^market-radar-candidate-observer-[a-z0-9][a-z0-9-]{7,48}$/.test(request.observerUnitName ?? ""),
    "observer_unit_invalid");
  const authorization = request.autonomyAuthorization;
  ensure(authorization?.schemaVersion === "market-radar-package-authorization.v1",
    "autonomy_authorization_schema_invalid");
  ensure(authorization.packageId === request.packageId, "autonomy_authorization_package_mismatch");
  ensure(authorization.actionClass === "candidate_shadow_activation", "autonomy_action_class_invalid");
  ensure(authorization.riskTier === "R2_REVERSIBLE_RUNTIME_AND_CONTROL",
    "autonomy_risk_tier_invalid");
  ensure(authorization.maxExecutions === 1, "autonomy_execution_count_invalid");
  ensure(Number.isSafeInteger(authorization.revocationEpoch) && authorization.revocationEpoch >= 0,
    "autonomy_revocation_epoch_invalid");
  ensure(authorization.issuedAt === request.approvalIssuedAt
    && authorization.expiresAt === request.approvalExpiresAt, "autonomy_time_binding_invalid");
  ensure(JSON.stringify(request.services) === '["web","candidate-shadow-worker"]', "service_allowlist_mismatch");
  ensure(request.composeProfile === "candidate-shadow-runtime", "compose_profile_mismatch");
  for (const key of [
    "automaticControlRollbackAllowed",
    "automaticEnvironmentRollbackAllowed",
    "automaticServiceRollbackAllowed",
    "candidateFeatureFlagEnablementAllowed",
    "candidateWorkerStartAllowed",
    "codeActivationAllowed",
    "controlLifecycleStartAllowed",
    "environmentMutationAllowed",
    "execute",
    "shadowWriteAllowed",
    "workerExpectedAllowed",
  ]) ensure(request[key] === true, `${key}_must_be_true`);
  for (const key of [
    "businessDmlAllowed",
    "candidateDatabaseUrlMutationAllowed",
    "canonicalReadAllowed",
    "canonicalWriteAllowed",
    "dualReadAllowed",
    "migrationAllowed",
    "productionRankingMutationAllowed",
    "reviewReadAllowed",
    "schemaDdlAllowed",
  ]) ensure(request[key] === false, `${key}_must_be_false`);
  ensure(request.minimumObservationHours === MINIMUM_OBSERVATION_HOURS, "observation_window_mismatch");
  ensure(request.observationIntervalSeconds === OBSERVATION_INTERVAL_SECONDS, "observation_interval_mismatch");
  const issuedAt = timestamp(request.approvalIssuedAt, "approval_issued_at_invalid");
  const expiresAt = timestamp(request.approvalExpiresAt, "approval_expires_at_invalid");
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  ensure(expiresAt > issuedAt && expiresAt - issuedAt <= 90 * 60_000, "approval_window_too_long");
  ensure(nowMs >= issuedAt, "approval_window_not_started");
  if (!allowExpiredForRollback) ensure(nowMs <= expiresAt, "approval_window_expired");
  return request;
}

async function assertSecureFile(path, label) {
  const file = await stat(path);
  ensure(file.isFile(), `${label}_not_file`);
  ensure((file.mode & 0o077) === 0, `${label}_permissions_too_open`);
  ensure(file.size > 0 && file.size <= 1024 * 1024, `${label}_size_invalid`);
}

export async function readSecureText(path, label) {
  await assertSecureFile(path, label);
  const value = (await readFile(path, "utf8")).trim();
  ensure(value.length > 0, `${label}_empty`);
  return value;
}

export async function readSecureJson(path, label) {
  const value = JSON.parse(await readSecureText(path, label));
  ensure(value && typeof value === "object" && !Array.isArray(value), `${label}_invalid`);
  return value;
}

export async function inspectArtifact(root, files) {
  ensure(Array.isArray(files) && files.length > 0 && new Set(files).size === files.length, "artifact_files_invalid");
  const checksums = {};
  for (const file of [...files].sort()) {
    ensure(typeof file === "string" && !file.startsWith("/") && !file.includes(".."), "artifact_path_invalid");
    checksums[file] = sha256(await readFile(resolve(root, file)));
  }
  return { checksums, fileCount: Object.keys(checksums).length, sha256: sha256(JSON.stringify(checksums)) };
}

export async function validateActivationRelease(root, request, contract) {
  const artifact = await inspectArtifact(root, contract.activationReleaseArtifact.files);
  ensure(artifact.sha256 === request.approvedActivationArtifactSha256, "activation_artifact_checksum_mismatch");
  const flags = await readFile(resolve(root, "src/lib/candidate-episode/feature-flags.ts"), "utf8");
  ensure(/CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED = true as const/.test(flags), "release_not_activation_authorized");
  ensure(!/CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED = false as const/.test(flags), "conflicting_code_activation_lock");
  return artifact;
}

function parseEnvValue(raw) {
  const value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function environmentEntries(source) {
  const entries = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    ensure(!entries.has(match[1]), `environment_key_duplicate:${match[1]}`);
    entries.set(match[1], parseEnvValue(match[2]));
  }
  return entries;
}

function exactFalse(value) {
  return String(value ?? "false").trim().toLowerCase() === "false";
}

export function loadPgRuntime({
  applicationRoot = process.env.MARKET_RADAR_APPLICATION_ROOT,
  moduleUrl = import.meta.url,
} = {}) {
  const requireCandidates = [createRequire(moduleUrl)];
  if (applicationRoot) {
    requireCandidates.push(createRequire(resolve(applicationRoot, "package.json")));
  }
  for (const requireCandidate of requireCandidates) {
    try {
      return requireCandidate("pg");
    } catch (error) {
      if (error?.code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  throw new ActivationPolicyError("approved_pg_runtime_unavailable");
}

export function validatePreActivationEnvironment(source) {
  const entries = environmentEntries(source);
  for (const key of CANDIDATE_URL_KEYS) ensure(entries.get(key)?.trim(), `candidate_url_missing:${key}`);
  ensure(new Set(CANDIDATE_URL_KEYS.map((key) => entries.get(key))).size === 3, "candidate_urls_not_unique");
  for (const key of Object.keys(ACTIVATION_ENVIRONMENT)) ensure(exactFalse(entries.get(key)), `candidate_flag_not_false:${key}`);
  ensure((entries.get("CANDIDATE_RUNTIME_RELEASE_ID") ?? "disabled").trim() === "disabled", "candidate_release_not_disabled");
  return { candidateDatabaseUrlsConfigured: 3, candidateFeatureFlagsEnabled: 0, candidateWorkerExpected: false };
}

export function renderActivationEnvironment(source, releaseId) {
  validatePreActivationEnvironment(source);
  ensure(/^candidate-shadow-[a-z0-9][a-z0-9._-]{7,80}$/.test(releaseId), "release_id_invalid");
  const replacements = { ...ACTIVATION_ENVIRONMENT, CANDIDATE_RUNTIME_RELEASE_ID: releaseId };
  const seen = new Set();
  const lines = source.split(/\r?\n/).map((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match || !(match[1] in replacements)) return line;
    ensure(!seen.has(match[1]), `environment_key_duplicate:${match[1]}`);
    seen.add(match[1]);
    return `${match[1]}=${JSON.stringify(replacements[match[1]])}`;
  });
  for (const [key, value] of Object.entries(replacements)) {
    if (!seen.has(key)) lines.push(`${key}=${JSON.stringify(value)}`);
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

async function writeAtomic(path, value) {
  const target = resolve(path);
  const temporary = resolve(dirname(target), `.${target.split("/").at(-1)}.${process.pid}.tmp`);
  await writeFile(temporary, value, { mode: 0o600 });
  await rename(temporary, target);
}

async function withMigrationClient(urlFile, work) {
  const pg = loadPgRuntime();
  const { Client } = pg;
  const connectionString = await readSecureText(urlFile, "migration_admin_url");
  const client = new Client({ application_name: "market-radar-candidate-activation", connectionString });
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

export async function preflightControl(client, request) {
  return withMigrationRole(client, async () => {
    const result = await client.query(`SELECT
      (SELECT count(*)::int FROM candidate_authority.schema_migrations WHERE status='applied') AS ledger,
      (SELECT count(*)::int FROM candidate_authority.candidate_migration_control) AS controls,
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_events) AS events,
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox) AS outbox,
      (SELECT count(*)::int FROM candidate_authority.candidate_outbox_quarantine_resolutions) AS resolutions,
      clock_timestamp() AS database_now`);
    const row = result.rows[0];
    ensure(row?.ledger === 9, "candidate_ledger_not_9");
    ensure(row.events === 0 && row.outbox === 0 && row.resolutions === 0, "candidate_control_data_not_empty");
    if (row.controls === 0) {
      return {
        candidateLedger: row.ledger,
        candidateControlRows: 0,
        controlStartMode: "fresh",
        databaseNow: new Date(row.database_now).toISOString(),
        migrationId: request.migrationId,
      };
    }
    ensure(row.controls === 1, "candidate_control_count_invalid");
    const controlResult = await client.query(`SELECT phase, epoch::int, write_frozen,
      approved_release_id, deadline_at
      FROM candidate_authority.candidate_migration_control
      WHERE migration_id=$1`, [request.migrationId]);
    const control = controlResult.rows[0];
    ensure(control, "candidate_rearm_control_mismatch");
    ensure(control.phase === "legacy" && control.write_frozen === true, "candidate_rearm_control_not_frozen_legacy");
    ensure(Number.isSafeInteger(control.epoch) && control.epoch >= 2 && control.epoch % 2 === 0, "candidate_rearm_epoch_invalid");
    const minimumRemainingMs = request.minimumObservationHours * 60 * 60_000
      + request.observationIntervalSeconds * 1_000;
    ensure(Number.isSafeInteger(minimumRemainingMs) && minimumRemainingMs > 0, "candidate_rearm_window_invalid");
    ensure(new Date(control.deadline_at).getTime() - new Date(row.database_now).getTime() >= minimumRemainingMs,
      "candidate_rearm_deadline_insufficient");
    return {
      candidateLedger: row.ledger,
      candidateControlRows: 1,
      controlStartMode: "legacy_rearm",
      currentAuthorityEpoch: control.epoch,
      databaseNow: new Date(row.database_now).toISOString(),
      migrationId: request.migrationId,
      previousReleaseId: control.approved_release_id,
    };
  });
}

export async function startControl(client, request) {
  return withMigrationRole(client, async () => {
    const currentResult = await client.query(`SELECT phase, epoch::int, started_at, deadline_at,
      write_frozen, approved_release_id, clock_timestamp() AS database_now,
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_events) AS events,
      (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox) AS outbox,
      (SELECT count(*)::int FROM candidate_authority.candidate_outbox_quarantine_resolutions) AS resolutions
      FROM candidate_authority.candidate_migration_control
      WHERE migration_id=$1 FOR UPDATE`, [request.migrationId]);
    const current = currentResult.rows[0];
    let result;
    let controlStartMode;
    if (!current) {
      const emptyState = await client.query(`SELECT
        (SELECT count(*)::int FROM candidate_authority.candidate_migration_control) AS controls,
        (SELECT count(*)::int FROM candidate_authority.candidate_episode_events) AS events,
        (SELECT count(*)::int FROM candidate_authority.candidate_episode_ingest_outbox) AS outbox,
        (SELECT count(*)::int FROM candidate_authority.candidate_outbox_quarantine_resolutions) AS resolutions`);
      const state = emptyState.rows[0];
      ensure(state.controls === 0 && state.events === 0 && state.outbox === 0 && state.resolutions === 0,
        "candidate_control_data_not_empty");
      controlStartMode = "fresh";
      result = await client.query(`SELECT phase, epoch::int, started_at, deadline_at,
        write_frozen, approved_release_id
        FROM candidate_authority.start_shadow_capture_v3($1,$2,$3)`, [
        request.migrationId,
        request.releaseId,
        request.approvalDigest,
      ]);
    } else {
      controlStartMode = "legacy_rearm";
      ensure(current.phase === "legacy" && current.write_frozen === true, "candidate_rearm_control_not_frozen_legacy");
      ensure(Number.isSafeInteger(current.epoch) && current.epoch >= 2 && current.epoch % 2 === 0, "candidate_rearm_epoch_invalid");
      ensure(current.events === 0 && current.outbox === 0 && current.resolutions === 0, "candidate_rearm_data_not_empty");
      const minimumRemainingMs = request.minimumObservationHours * 60 * 60_000
        + request.observationIntervalSeconds * 1_000;
      ensure(new Date(current.deadline_at).getTime() - new Date(current.database_now).getTime() >= minimumRemainingMs,
        "candidate_rearm_deadline_insufficient");
      result = await client.query(`SELECT phase, epoch::int, started_at, deadline_at,
        write_frozen, approved_release_id
        FROM candidate_authority.transition_migration_control_v1($1,$2,'shadow_capture',false,$3,$4,clock_timestamp())`, [
        request.migrationId,
        current.epoch,
        request.releaseId,
        request.approvalDigest,
      ]);
    }
    const row = result.rows[0];
    ensure(row?.phase === "shadow_capture"
      && Number.isSafeInteger(row.epoch) && row.epoch >= 1 && row.epoch % 2 === 1, "control_start_result_invalid");
    ensure(row.write_frozen === false && row.approved_release_id === request.releaseId, "control_start_boundary_invalid");
    const startedAt = new Date(row.started_at).getTime();
    const deadlineAt = new Date(row.deadline_at).getTime();
    ensure(deadlineAt - startedAt === 72 * 60 * 60_000, "control_deadline_mismatch");
    return { phase: row.phase, authorityEpoch: row.epoch, controlStartMode, startedAt: new Date(startedAt).toISOString(), deadlineAt: new Date(deadlineAt).toISOString(), writeFrozen: row.write_frozen, releaseId: row.approved_release_id };
  });
}

export async function rollbackControl(client, request) {
  return withMigrationRole(client, async () => {
    const current = await client.query(`SELECT phase, epoch::int, approved_release_id
      FROM candidate_authority.candidate_migration_control WHERE migration_id=$1 FOR UPDATE`, [request.migrationId]);
    const row = current.rows[0];
    ensure(row, "control_missing_for_rollback");
    ensure(row.approved_release_id === request.releaseId, "control_release_mismatch_for_rollback");
    if (row.phase === "legacy") return { phase: "legacy", authorityEpoch: row.epoch, writeFrozen: true, alreadyRolledBack: true };
    ensure(row.phase === "shadow_capture", "control_phase_not_rollback_safe");
    const result = await client.query(`SELECT phase, epoch::int, write_frozen
      FROM candidate_authority.transition_migration_control_v1($1,$2,'legacy',true,$3,$4,clock_timestamp())`, [
      request.migrationId,
      row.epoch,
      request.releaseId,
      request.approvalDigest,
    ]);
    ensure(result.rows[0]?.phase === "legacy" && result.rows[0]?.write_frozen === true, "control_rollback_result_invalid");
    return { phase: "legacy", authorityEpoch: result.rows[0].epoch, writeFrozen: true, alreadyRolledBack: false };
  });
}

export async function readDatabaseObservation(client, request) {
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const result = await client.query(`SELECT
      (SELECT count(*)::int FROM pg_locks WHERE NOT granted) AS lock_waiters,
      (SELECT count(*)::int FROM pg_stat_activity
        WHERE pid <> pg_backend_pid() AND xact_start IS NOT NULL
          AND clock_timestamp() - xact_start > interval '5 minutes') AS long_transactions,
      control.phase, control.epoch::int, control.write_frozen,
      control.approved_release_id, control.deadline_at,
      clock_timestamp() AS database_now
      FROM candidate_authority.candidate_migration_control control
      WHERE control.migration_id=$1`, [request.migrationId]);
    const row = result.rows[0];
    ensure(row, "observation_control_missing");
    ensure(row.phase === "shadow_capture" && Number.isSafeInteger(row.epoch)
      && row.epoch >= 1 && row.epoch % 2 === 1 && row.write_frozen === false, "observation_control_invalid");
    ensure(row.approved_release_id === request.releaseId, "observation_control_release_mismatch");
    ensure(new Date(row.deadline_at).getTime() >= new Date(row.database_now).getTime(), "observation_control_deadline_expired");
    await client.query("COMMIT");
    return {
      authorityEpoch: row.epoch,
      databaseNow: new Date(row.database_now).toISOString(),
      identityErrors: 0,
      lockWaiters: row.lock_waiters,
      longTransactions: row.long_transactions,
      phase: row.phase,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export function validateObservationSample(sample, request) {
  ensure(sample?.schemaVersion === "candidate-shadow-observation-sample.v1", "sample_schema_invalid");
  timestamp(sample.sampledAt, "sample_time_invalid");
  ensure(sample.commit === request.approvedCommit, "sample_commit_mismatch");
  ensure(sample.releaseId === request.releaseId, "sample_release_mismatch");
  ensure(sample.health?.ok === true && sample.health?.level === "ready", "sample_health_not_ready");
  ensure(sample.health.scanFreshness === "fresh", "sample_scan_not_fresh");
  ensure(sample.health.databaseStatus === "ready", "sample_database_not_ready");
  ensure(sample.health.redisStatus === "healthy", "sample_redis_not_healthy");
  ensure(Array.isArray(sample.health.workers) && sample.health.workers.length >= 7, "sample_workers_missing");
  for (const worker of sample.health.workers) ensure(worker.status === "healthy", `sample_worker_not_healthy:${worker.key}`);
  ensure(sample.health.workers.some((worker) => worker.key === "candidate-shadow-worker"), "sample_candidate_worker_missing");
  ensure(sample.candidate?.ok === true && sample.candidate.mode === "active", "sample_candidate_not_active");
  ensure(sample.candidate.runtime?.enabled === true, "sample_runtime_not_enabled");
  ensure(Array.isArray(sample.candidate.runtime?.blockers) && sample.candidate.runtime.blockers.length === 0, "sample_runtime_blocked");
  const authorityEpoch = sample.candidate.runtime.authorityEpoch;
  ensure(Number.isSafeInteger(authorityEpoch) && authorityEpoch >= 1 && authorityEpoch % 2 === 1, "sample_epoch_invalid");
  ensure(sample.candidate.runtime.expectedReleaseId === request.releaseId, "sample_runtime_release_mismatch");
  const monitor = sample.candidate.monitor;
  ensure(monitor?.status === "ready" && monitor.phase === "shadow_capture", "sample_monitor_not_ready");
  ensure(monitor.authorityEpoch === authorityEpoch, "sample_monitor_epoch_mismatch");
  ensure(Array.isArray(monitor.blockers) && monitor.blockers.length === 0, "sample_monitor_blocked");
  ensure(Array.isArray(monitor.warnings) && monitor.warnings.length === 0, "sample_monitor_warning");
  ensure(monitor.metrics?.outboxRetryWaitTotal === 0, "sample_retry_wait_present");
  ensure(monitor.metrics?.unresolvedQuarantineTotal === 0, "sample_unresolved_quarantine");
  ensure(monitor.metrics?.outboxQuarantinedTotal === 0, "sample_quarantine_present");
  ensure(monitor.metrics?.oldestPendingAgeSeconds === null || monitor.metrics.oldestPendingAgeSeconds < 300, "sample_oldest_pending_too_old");
  ensure(Number.isSafeInteger(monitor.metrics?.outboxCompletedTotal) && monitor.metrics.outboxCompletedTotal >= 0, "sample_completed_invalid");
  ensure(sample.database?.lockWaiters === 0, "sample_database_lock_waiters");
  ensure(sample.database?.longTransactions === 0, "sample_database_long_transaction");
  ensure(sample.database?.identityErrors === 0, "sample_database_identity_error");
  return sample;
}

export function evaluateObservationEvidence(samples, request) {
  ensure(Array.isArray(samples), "observation_samples_invalid");
  ensure(samples.length >= MINIMUM_OBSERVATION_SAMPLES, "observation_samples_insufficient");
  const ordered = [...samples].sort((left, right) => timestamp(left.sampledAt, "sample_time_invalid") - timestamp(right.sampledAt, "sample_time_invalid"));
  let previousTime = null;
  let previousCompleted = null;
  let maximumGapSeconds = 0;
  for (const sample of ordered) {
    validateObservationSample(sample, request);
    const currentTime = timestamp(sample.sampledAt, "sample_time_invalid");
    if (previousTime !== null) {
      const gap = (currentTime - previousTime) / 1_000;
      ensure(gap > 0, "observation_sample_time_duplicate");
      maximumGapSeconds = Math.max(maximumGapSeconds, gap);
      ensure(gap <= MAXIMUM_SAMPLE_GAP_SECONDS, "observation_sample_gap_exceeded");
    }
    const completed = sample.candidate.monitor.metrics.outboxCompletedTotal;
    if (previousCompleted !== null) ensure(completed >= previousCompleted, "observation_completed_regressed");
    previousCompleted = completed;
    previousTime = currentTime;
  }
  const firstAt = timestamp(ordered[0].sampledAt, "sample_time_invalid");
  const lastAt = timestamp(ordered.at(-1).sampledAt, "sample_time_invalid");
  const coverageMs = lastAt - firstAt;
  ensure(coverageMs >= MINIMUM_OBSERVATION_HOURS * 60 * 60_000, "observation_window_insufficient");
  ensure(previousCompleted > 0, "observation_no_completed_writes");
  return {
    status: "PASS_ACTIVATE_AND_OBSERVE",
    automaticPhaseAdvance: false,
    comparedWritesGateEvaluated: false,
    completedWrites: previousCompleted,
    coverageHours: coverageMs / 3_600_000,
    maximumGapSeconds,
    sampleCount: ordered.length,
  };
}

function parseArgs(argv) {
  const [command = "validate", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    ensure(rest[index]?.startsWith("--") && rest[index + 1], "argument_invalid");
    options[rest[index].slice(2)] = rest[index + 1];
  }
  return { command, options };
}

async function requestAndContract(options, allowExpiredForRollback = false) {
  const contractSource = await readFile(resolve(options.contract), "utf8");
  const contract = JSON.parse(contractSource);
  const request = await readSecureJson(resolve(options.request), "request");
  ensure(sha256(contractSource) === request.runnerContractSha256, "runner_contract_checksum_mismatch");
  validateApprovalRequest(request, contract, {
    allowExpiredForRollback,
    ...(options.now ? { now: new Date(options.now) } : {}),
  });
  return { contract, request };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "request" || command === "rollback-request") {
    await requestAndContract(options, command === "rollback-request");
    process.stdout.write('{"status":"pass","requestValid":true,"containsSecret":false}\n');
    return;
  }
  if (command === "release") {
    const { contract, request } = await requestAndContract(options);
    const artifact = await validateActivationRelease(resolve(options.root), request, contract);
    process.stdout.write(`${JSON.stringify({ status: "pass", artifactSha256: artifact.sha256, artifactFiles: artifact.fileCount, codeActivationAllowed: true })}\n`);
    return;
  }
  if (command === "render-env") {
    const { request } = await requestAndContract(options);
    const rendered = renderActivationEnvironment(await readFile(resolve(options.source), "utf8"), request.releaseId);
    await writeAtomic(options.output, rendered);
    process.stdout.write('{"status":"pass","changedKeys":7,"candidateUrlsChanged":0,"secretsPrinted":false}\n');
    return;
  }
  if (["control-preflight", "control-start", "control-rollback", "database-snapshot"].includes(command)) {
    const { request } = await requestAndContract(options, ["control-rollback", "database-snapshot"].includes(command));
    const result = await withMigrationClient(resolve(options["admin-url-file"]), (client) => {
      if (command === "control-preflight") return preflightControl(client, request);
      if (command === "control-start") return startControl(client, request);
      if (command === "database-snapshot") return readDatabaseObservation(client, request);
      return rollbackControl(client, request);
    });
    process.stdout.write(`${JSON.stringify({ status: "pass", ...result, secretsPrinted: false })}\n`);
    return;
  }
  const { request } = await requestAndContract(options, ["sample", "observe"].includes(command));
  if (command === "sample") {
    const sample = JSON.parse(await readFile(resolve(options.input), "utf8"));
    validateObservationSample(sample, request);
    process.stdout.write('{"status":"pass","sampleValid":true}\n');
    return;
  }
  if (command === "observe") {
    const samples = (await readFile(resolve(options.input), "utf8")).split(/\r?\n/)
      .filter(Boolean).map((line) => JSON.parse(line));
    process.stdout.write(`${JSON.stringify(evaluateObservationEvidence(samples, request))}\n`);
    return;
  }
  throw new ActivationPolicyError("command_invalid");
}

const invokedModuleUrl = process.argv[1]
  ? pathToFileURL(realpathSync(process.argv[1])).href
  : "";

if (import.meta.url === invokedModuleUrl) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "fail", reason: error.reason ?? "unexpected_error" })}\n`);
    process.exitCode = 1;
  });
}
