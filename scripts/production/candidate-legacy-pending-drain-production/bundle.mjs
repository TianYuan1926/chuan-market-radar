#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  chmod, cp, lstat, mkdir, mkdtemp, readFile, rm, utimes, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { REQUIRED_PACKAGE_APPROVAL_FIELDS } from "../../governance/autonomy-policy.mjs";

const execFileAsync = promisify(execFile);
export const PACKAGE_ID = "WP-G0.2-CYCLE-6-LEGACY-PENDING-DRAIN-PRODUCTION";
export const CONTRACT_PATH =
  "docs/governance/wp-g0-2-cycle-6-legacy-pending-drain-production-packet.v2.json";
export const PRODUCTION_ROOT = "/home/ubuntu/apps/chuan-market-radar";
export const BASELINE_COMMIT = "cec0b6572bb09ae91ff9e013f8bb160f73c045e2";
export const BASELINE_TREE = "eb217a7fbaad5b464279a08d4441a8249fc266e3";
export const MIGRATION_ID = "candidate-episode-v1-cycle-6";
export const RELEASE_ID = "candidate-shadow-cycle-6-72ee2893";
export const EXPECTED_COUNTS = Object.freeze({
  candidateEventContractMismatches: 0,
  candidateEventNonPending: 0,
  candidateEventOrphans: 0,
  candidateEventPending: 5_218,
  candidateEventUnresolved: 5_218,
  checkpoints: 0,
  claimed: 0,
  completed: 5_218,
  episodes: 600,
  events: 5_218,
  legacyCompleted: 5_218,
  legacyPending: 48,
  legacyUnresolved: 48,
  otherUnresolved: 0,
  outbox: 10_484,
  outcomes: 0,
  pending: 5_266,
  quarantined: 0,
  resolutions: 0,
  retryWait: 0,
  unresolved: 5_266,
});
const TRUST_ROOT = "/home/ubuntu/.local/state/market-radar-autonomy";
const GRANT_ID = "MR-G0-G8-USER-STANDING-GRANT-20260714-034826";
const SOURCE_DATE_EPOCH = 946_684_800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1_000);
const HASH = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const IMAGE = /^sha256:[0-9a-f]{64}$/u;

export const TRANSPORT_FILES = Object.freeze([
  CONTRACT_PATH,
  "scripts/governance/autonomy-policy.mjs",
  "scripts/governance/autonomy-production-lease-cli.mjs",
  "scripts/governance/autonomy-production-lease.mjs",
  "scripts/production/candidate-legacy-pending-drain/runner.mjs",
  "scripts/production/candidate-legacy-pending-drain-production/bundle.mjs",
  "scripts/production/candidate-legacy-pending-drain-production/db-runner.mjs",
  "scripts/production/candidate-legacy-pending-drain-production/production-entrypoint.sh",
  "scripts/production/candidate-legacy-pending-drain-production/production-runner.sh",
]);

const REQUEST_KEYS = Object.freeze([
  "approvalExpiresAt", "approvalIssuedAt", "approvalRef", "autonomyAuthorization",
  "autonomyTrustRoot", "baseEnvSha256", "baselineCommit", "baselineComposeSha256",
  "baselineScannerContainerId", "baselineScannerImageId", "baselineTree",
  "baselineWebContainerId", "baselineWebImageId", "controlApprovalDigest", "currentPhase",
  "currentWriteFrozen", "drainEpoch", "evidenceDirectory", "expectedCounts", "finalEpoch",
  "identityOverridePath", "identityOverrideSha256", "identityWrapperPath",
  "identityWrapperSha256", "migrationId", "operator", "opsRoot", "packageId",
  "postgresAdminEnvPath", "postgresAdminEnvSha256", "productionEnvSha256",
  "productionMutation", "productionRoot", "releaseId", "rollbackScannerImageRef",
  "rollbackWebImageRef", "runnerArtifactSha256", "runnerUnitName", "schemaVersion",
  "secureRoot", "services", "sessionIndependentExecutionRequired", "sourceEpoch",
  "stagingDirectory", "startedAt", "deadlineAt", "targetCommit", "targetComposeSha256",
  "targetTree", "temporaryArtifactCleanupRequired", "transportArtifactSha256",
  "transportBundleSha256", "transportMethod",
]);

const RUNTIME_KEYS = Object.freeze([
  "baseEnvSha256", "baselineComposeSha256", "baselineScannerContainerId",
  "baselineScannerImageId", "baselineWebContainerId", "baselineWebImageId",
  "controlApprovalDigest", "deadlineAt", "identityOverridePath", "identityOverrideSha256",
  "identityWrapperPath", "identityWrapperSha256", "postgresAdminEnvPath",
  "postgresAdminEnvSha256", "productionEnvSha256", "startedAt",
]);

function ensure(condition, reason) {
  if (!condition) throw new Error(`candidate pending drain packet rejected: ${reason}`);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function git(root, args) {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], { encoding: "utf8" });
  return stdout.trim();
}

export async function artifact(root, files) {
  ensure(Array.isArray(files) && files.length > 0 && new Set(files).size === files.length,
    "artifact_files_invalid");
  const fileSha256 = {};
  for (const file of [...files].sort()) {
    ensure(typeof file === "string" && !file.startsWith("/") && !file.includes(".."),
      "artifact_path_invalid");
    const path = resolve(root, file);
    const metadata = await lstat(path);
    ensure(metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1,
      `artifact_file_invalid:${file}`);
    ensure(metadata.size > 0 && metadata.size <= 2 * 1024 * 1024,
      `artifact_size_invalid:${file}`);
    fileSha256[file] = sha256(await readFile(path));
  }
  return {
    fileCount: Object.keys(fileSha256).length,
    fileSha256,
    sha256: sha256(JSON.stringify(fileSha256)),
  };
}

export async function validateProductionPacketContract(root = process.cwd()) {
  const bytes = await readFile(resolve(root, CONTRACT_PATH));
  const contract = JSON.parse(bytes);
  const violations = [];
  if (contract.schemaVersion !== "wp-g0.2-cycle-6-legacy-pending-drain-production-packet.v2"
      || contract.packageId !== PACKAGE_ID) violations.push("contract_identity");
  if (contract.productionAuthorization !== false || contract.productionExecuted !== false
      || contract.productionPass !== false) violations.push("production_truth_overclaimed");
  if (contract.actionClass !== "feature_phase_activation"
      || contract.riskTier !== "R2_AUTHORITY_TRANSITION") violations.push("risk_boundary");
  if (contract.productionRoot !== PRODUCTION_ROOT
      || contract.productionBaseline?.commit !== BASELINE_COMMIT
      || contract.productionBaseline?.tree !== BASELINE_TREE
      || contract.productionBaseline?.webImageMustBeDynamicallyBound !== true
      || contract.productionBaseline?.scannerWorkerImageMustBeDynamicallyBound !== true) {
    violations.push("production_baseline");
  }
  const before = contract.databasePrecondition ?? {};
  if (before.migrationCount !== 10 || before.migrationId !== MIGRATION_ID
      || before.releaseId !== RELEASE_ID
      || before.phase !== "legacy" || before.writeFrozen !== true
      || before.sourceEpoch !== 2 || before.drainEpoch !== 3 || before.finalEpoch !== 4) {
    violations.push("database_precondition");
  }
  for (const [key, value] of Object.entries(EXPECTED_COUNTS)) {
    if (before[key] !== value) violations.push(`database_count_precondition:${key}`);
  }
  const sourceLane = contract.sourceLaneBoundary ?? {};
  if (sourceLane.currentProductionExecutable !== true
      || sourceLane.legacySourceLaneMustDrain !== true
      || sourceLane.candidateEventLaneMustRemainPending !== true
      || sourceLane.candidateEventLaneMustRemainUnconsumedByShadowConsumer !== true
      || sourceLane.candidateEventMirrorIntegrityRequired !== true) {
    violations.push("source_lane_boundary");
  }
  const execution = contract.execution ?? {};
  if (execution.runner !== "transient_systemd_unit" || execution.sessionIndependent !== true
      || execution.runtimeMaxSeconds !== 5_400
      || execution.targetImageBuiltBeforeScannerPause !== true
      || execution.databaseRunnerImage !== "target_web_image_with_pg"
      || execution.databaseRunnerModuleRoot !== "/app/package.json"
      || execution.environmentRendererSourceMount !== "exact_file_read_only"
      || execution.environmentRendererSourcePath !== "/runtime/env.production"
      || execution.environmentRendererOutputRoot !== "temporary_ops_only"
      || execution.environmentRendererLeaseIsolation !== true
      || JSON.stringify(execution.services)
        !== JSON.stringify(["web", "scanner-worker", "candidate-shadow-worker"])
      || execution.scannerPausedBeforeDatabaseMutation !== true
      || execution.scannerLockMustBeAbsent !== true
      || execution.scannerLockWaitSeconds !== 660
      || execution.baselineHealthWaitSeconds !== 1_200
      || execution.candidateSourceWriteReachable !== false
      || execution.candidateDrainOnly !== true || execution.candidateBatchLimit !== 100
      || execution.candidateIntervalSeconds !== 1) violations.push("execution_boundary");
  const success = contract.successBoundary ?? {};
  if (success.legacyDrainedExact !== 48 || success.legacyCompletedFinal !== 5_266
      || success.legacyPendingFinal !== 0 || success.legacyUnresolvedFinal !== 0
      || success.eventsFinal !== 5_266 || success.candidateEventPendingFinal !== 5_266
      || success.candidateEventNonPendingFinal !== 0
      || success.candidateEventOrphansFinal !== 0
      || success.candidateEventContractMismatchesFinal !== 0
      || success.outboxFinal !== 10_532 || success.globalCompletedFinal !== 5_266
      || success.globalPendingFinal !== 5_266 || success.globalUnresolvedFinal !== 5_266
      || success.claimedFinal !== 0 || success.retryWaitFinal !== 0
      || success.quarantinedFinal !== 0 || success.resolutionsFinal !== 0
      || success.controlFinalPhase !== "legacy" || success.controlFinalWriteFrozen !== true
      || success.controlFinalEpoch !== 4 || success.candidateWorkerAbsent !== true
      || success.productionBaselineRestored !== true || success.scannerReadyFresh !== true
      || success.nextCycleStarted !== false) violations.push("success_boundary");
  const rollback = contract.rollback ?? {};
  if (rollback.automatic !== true || rollback.stopCandidateWorkerFirst !== true
      || rollback.refreezeCurrentControl !== true || rollback.preservePendingRows !== true
      || rollback.deleteOutboxAllowed !== false || rollback.restoreEnvironment !== true
      || rollback.restoreGit !== true || rollback.restoreWebImage !== true
      || rollback.restoreScannerImage !== true || rollback.restoreScannerService !== true
      || rollback.incompleteLeaseRetained !== true
      || rollback.incompleteLabel !== "ROLLBACK_INCOMPLETE_LEASE_RETAINED"
      || rollback.invalidReleaseOutcomeAllowed !== false
      || rollback.resultStatusSingleValued !== true
      || rollback.productionPassAfterRollback !== false) violations.push("rollback_boundary");
  for (const forbidden of [
    "migration", "database_delete", "redis_mutation", "new_candidate_source_write",
    "cycle_7_start", "canonical_cutover", "scan_ranking_change", "analysis_change",
    "strategy_change", "rr_or_risk_gate_change", "frontend_change", "future_outcome_input",
    "formal_backtest", "github_main_deploy", "non_target_service_mutation",
  ]) if (!contract.forbidden?.includes(forbidden)) violations.push(`forbidden_missing:${forbidden}`);
  let runnerArtifact = null;
  try {
    runnerArtifact = await artifact(root, contract.runnerArtifact?.files ?? []);
    if (runnerArtifact.fileCount !== contract.runnerArtifact?.fileCount
        || runnerArtifact.sha256 !== contract.runnerArtifact?.sha256) {
      violations.push("runner_artifact_checksum");
    }
  } catch (error) {
    violations.push(`runner_artifact_invalid:${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    status: violations.length === 0 ? "PASS_LOCAL_PENDING_DRAIN_PRODUCTION_CONTRACT" : "FAIL",
    contractSha256: sha256(bytes),
    runnerArtifactSha256: runnerArtifact?.sha256 ?? null,
    productionExecuted: false,
    productionPass: false,
    violations,
  };
}

export async function currentSourceIdentity(root) {
  const [sourceCommit, sourceTree, sourceParentCommit, diff, paths, status] = await Promise.all([
    git(root, ["rev-parse", "HEAD"]),
    git(root, ["rev-parse", "HEAD^{tree}"]),
    git(root, ["rev-parse", "HEAD^"]),
    git(root, ["diff-tree", "--no-commit-id", "--name-status", "-r", "HEAD"]),
    git(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]),
    git(root, ["status", "--porcelain"]),
  ]);
  ensure(status === "", "source_worktree_dirty");
  return {
    sourceCommit,
    sourceTree,
    sourceParentCommit,
    sourceDiffSha256: sha256(`${diff}\n`),
    sourcePathSetSha256: sha256(`${paths.split(/\r?\n/u).filter(Boolean).sort().join("\n")}\n`),
  };
}

export async function validateLocalPreparation(root = process.cwd()) {
  const contract = await validateProductionPacketContract(root);
  const violations = [...contract.violations];
  const [runner, entrypoint, composition, targetComposeSha256] = await Promise.all([
    readFile(resolve(root,
      "scripts/production/candidate-legacy-pending-drain-production/production-runner.sh"), "utf8"),
    readFile(resolve(root,
      "scripts/production/candidate-legacy-pending-drain-production/production-entrypoint.sh"), "utf8")
      .catch(() => ""),
    readFile(resolve(root, "src/lib/candidate-episode/shadow-capture-composition.ts"), "utf8"),
    readFile(resolve(root, "docker-compose.yml")).then(sha256),
  ]);
  for (const token of [
    "service_allowlist=web,scanner-worker,candidate-shadow-worker", "scanner_lock_still_present",
    "CANDIDATE_EPISODE_DRAIN_ONLY=true", "database_runner rollback", "ROLLBACK_PASS",
    "wait_for_scan_lock_absent", "ROLLBACK_INCOMPLETE_LEASE_RETAINED", "leaseRetained",
    "PASS_LEGACY_PENDING_DRAINED_AND_REFROZEN", "nextCycleStarted:false",
    "render_drain_environment", "dst=/runtime/env.production,readonly",
    "--source /runtime/env.production", "dst=${OPS_ROOT}",
  ]) if (!runner.includes(token)) violations.push(`runner_guard_missing:${token}`);
  for (const token of ["systemd-run", "RuntimeMaxSec=5400", "validate-request",
    "prepare-admin-url", "temporaryArtifactCleanupRequired"]) {
    if (!entrypoint.includes(token)) violations.push(`entrypoint_guard_missing:${token}`);
  }
  if (!composition.includes("drain_only_source_disabled")
      || !composition.includes("CANDIDATE_EPISODE_DRAIN_ONLY")) {
    violations.push("source_enqueue_hard_block_missing");
  }
  for (const forbidden of ["git reset --hard", "docker volume rm", "DROP TABLE", "TRUNCATE",
    "backtest:formal", "release --outcome ROLLBACK_FAIL"]) {
    if (`${runner}\n${entrypoint}`.includes(forbidden)) violations.push(`forbidden_runtime_token:${forbidden}`);
  }
  return {
    status: violations.length === 0 ? "PASS_LOCAL_PENDING_DRAIN_PRODUCTION_PACKET" : "FAIL",
    contractSha256: contract.contractSha256,
    runnerArtifactSha256: contract.runnerArtifactSha256,
    targetComposeSha256,
    productionExecuted: false,
    productionPass: false,
    violations: [...new Set(violations)],
  };
}

export function renderDrainOnlyEnvironment(source, {
  migrationId = MIGRATION_ID,
  releaseId = RELEASE_ID,
} = {}) {
  ensure(typeof source === "string" && source.length > 0, "environment_source_invalid");
  ensure(migrationId === MIGRATION_ID && releaseId === RELEASE_ID,
    "environment_cycle_identity_invalid");
  const overrides = new Map(Object.entries({
    CANDIDATE_EPISODE_CANONICAL_READ: "false",
    CANDIDATE_EPISODE_DRAIN_ONLY: "true",
    CANDIDATE_EPISODE_SHADOW_WRITE: "true",
    CANDIDATE_RUNTIME_MIGRATION_ID: migrationId,
    CANDIDATE_RUNTIME_RELEASE_ID: releaseId,
    CANDIDATE_SHADOW_BATCH_LIMIT: "100",
    CANDIDATE_SHADOW_INTERVAL_SECONDS: "1",
    CANDIDATE_SHADOW_WORKER_EXPECTED: "true",
  }));
  const seen = new Set();
  const lines = source.replace(/\r\n/gu, "\n").split("\n").map((line) => {
    const match = /^([A-Z][A-Z0-9_]*)=/u.exec(line);
    if (!match || !overrides.has(match[1])) return line;
    ensure(!seen.has(match[1]), `environment_duplicate_key:${match[1]}`);
    seen.add(match[1]);
    return `${match[1]}=${overrides.get(match[1])}`;
  });
  for (const [key, value] of overrides) {
    if (!seen.has(key)) lines.push(`${key}=${value}`);
  }
  return `${lines.filter((line, index) => line !== "" || index < lines.length - 1).join("\n")}\n`;
}

function parseAdminInput(bytes) {
  const parts = bytes.toString("utf8").split("\0");
  ensure(parts.length === 3, "admin_input_shape_invalid");
  const values = {};
  for (const line of parts[0].trim().split(/\r?\n/u)) {
    const match = /^(POSTGRES_USER|POSTGRES_PASSWORD)=(.*)$/u.exec(line);
    ensure(match && values[match[1]] === undefined, "admin_env_invalid");
    values[match[1]] = match[2];
  }
  ensure(Object.keys(values).sort().join("\n") === "POSTGRES_PASSWORD\nPOSTGRES_USER",
    "admin_env_keys_invalid");
  ensure(values.POSTGRES_USER === parts[1] && /^[a-z_][a-z0-9_]{0,62}$/u.test(parts[1]),
    "admin_user_mismatch");
  ensure(/^[a-z_][a-z0-9_]{0,62}$/u.test(parts[2]), "database_name_invalid");
  ensure(values.POSTGRES_PASSWORD.length >= 16 && !/[\r\n\0]/u.test(values.POSTGRES_PASSWORD),
    "admin_password_invalid");
  return `postgresql://${encodeURIComponent(values.POSTGRES_USER)}:${encodeURIComponent(values.POSTGRES_PASSWORD)}@postgres:5432/${encodeURIComponent(parts[2])}`;
}

export function prepareAdminUrl(bytes) {
  return parseAdminInput(bytes);
}

export async function buildTransportBundle({
  root = process.cwd(), output, sourceIdentity, externalBundleSha256 = "bound_after_archive_creation",
} = {}) {
  const local = await validateLocalPreparation(root);
  ensure(local.status.startsWith("PASS_"), `local_preparation_failed:${local.violations.join(",")}`);
  const identity = sourceIdentity ?? await currentSourceIdentity(root);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "candidate-pending-drain-production-"));
  const payloadRoot = join(temporaryRoot, "payload");
  try {
    for (const file of TRANSPORT_FILES) {
      const target = join(payloadRoot, file);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await cp(resolve(root, file), target);
      await chmod(target, file.endsWith(".sh") ? 0o700 : 0o600);
      await utimes(target, FIXED_TIME, FIXED_TIME);
    }
    const transport = await artifact(root, TRANSPORT_FILES);
    const manifest = {
      schemaVersion: "wp-g0.2-cycle-6-legacy-pending-drain-production-transport.v2",
      packageId: PACKAGE_ID,
      sourceCommit: identity.sourceCommit,
      sourceTree: identity.sourceTree,
      sourceParentCommit: identity.sourceParentCommit,
      sourceDiffSha256: identity.sourceDiffSha256,
      sourcePathSetSha256: identity.sourcePathSetSha256,
      targetComposeSha256: local.targetComposeSha256,
      baselineCommit: BASELINE_COMMIT,
      baselineTree: BASELINE_TREE,
      contractSha256: local.contractSha256,
      runnerArtifactSha256: local.runnerArtifactSha256,
      transportArtifactSha256: transport.sha256,
      policySha256: transport.fileSha256["scripts/governance/autonomy-policy.mjs"],
      fileSha256: transport.fileSha256,
      files: [...TRANSPORT_FILES].sort(),
      externalBundleSha256,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
      archiveFormat: "ustar+gzip-n",
      reproducibleArchive: true,
      containsSecrets: false,
      services: ["web", "scanner-worker", "candidate-shadow-worker"],
      sessionIndependentExecutionRequired: true,
      temporaryArtifactCleanupRequired: true,
    };
    const manifestPath = join(payloadRoot, "transport-manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    await utimes(manifestPath, FIXED_TIME, FIXED_TIME);
    const tarPath = join(temporaryRoot, "payload.tar");
    await execFileAsync("tar", [
      "-cf", tarPath, "--format=ustar", "--uid=0", "--gid=0", "--numeric-owner",
      "-C", payloadRoot, ...[...TRANSPORT_FILES, "transport-manifest.json"].sort(),
    ], { env: { ...process.env, COPYFILE_DISABLE: "1", LC_ALL: "C" } });
    const { stdout: bytes } = await execFileAsync("gzip", ["-n", "-9", "-c", tarPath], {
      encoding: null,
      maxBuffer: 16 * 1024 * 1024,
    });
    ensure(Buffer.isBuffer(bytes), "transport_bundle_not_binary");
    const outputPath = resolve(output ?? join(root,
      "reports/wp-g0-2-legacy-pending-drain-production",
      `candidate-pending-drain-${identity.sourceCommit.slice(0, 12)}.tar.gz`));
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes, { mode: 0o600 });
    return {
      status: "PASS_PENDING_DRAIN_PRODUCTION_TRANSPORT",
      output: outputPath,
      sha256: sha256(bytes),
      size: bytes.length,
      manifest,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function validateRuntime(runtime) {
  ensure(exactKeys(runtime, RUNTIME_KEYS), "runtime_shape_invalid");
  for (const key of [
    "baseEnvSha256", "baselineComposeSha256", "identityOverrideSha256",
    "identityWrapperSha256", "postgresAdminEnvSha256", "productionEnvSha256",
  ]) ensure(HASH.test(runtime[key] ?? ""), `runtime_hash_invalid:${key}`);
  ensure(IMAGE.test(runtime.baselineWebImageId ?? "")
      && IMAGE.test(runtime.baselineScannerImageId ?? ""), "runtime_image_invalid");
  for (const key of ["baselineScannerContainerId", "baselineWebContainerId"]) {
    ensure(/^[0-9a-f]{12,64}$/u.test(runtime[key] ?? ""), `runtime_container_invalid:${key}`);
  }
  ensure(/^sha256:[0-9a-f]{64}$/u.test(runtime.controlApprovalDigest ?? ""),
    "runtime_control_digest_invalid");
  ensure(Date.parse(runtime.startedAt) < Date.parse(runtime.deadlineAt)
      && Date.parse(runtime.deadlineAt) - Date.now() >= 30 * 60_000,
  "runtime_control_window_invalid");
  const identityRootMatch = /^\/var\/lib\/market-radar-ops\/(wp-g0-2-identity-runner-[0-9]{8}T[0-9]{6}Z)\/runtime\/runtime-identity\.override\.yml$/u
    .exec(runtime.identityOverridePath ?? "");
  const identityRoot = identityRootMatch
    ? `/var/lib/market-radar-ops/${identityRootMatch[1]}`
    : null;
  ensure(identityRoot !== null
      && runtime.identityWrapperPath === `${identityRoot}/runtime/compose-identity-safe`
      && runtime.postgresAdminEnvPath === `${identityRoot}/secrets/postgres-admin.env`,
  "runtime_secure_path_invalid");
}

export function createProductionExecutionRequest({
  manifest, bundleSha256, runtime, gateEvidenceSha256, now = new Date(), nonce = randomUUID(),
}) {
  validateRuntime(runtime);
  ensure(HASH.test(bundleSha256 ?? "") && HASH.test(gateEvidenceSha256 ?? ""),
    "request_external_hash_invalid");
  ensure(COMMIT.test(manifest.sourceCommit ?? "") && COMMIT.test(manifest.sourceTree ?? "")
      && manifest.baselineCommit === BASELINE_COMMIT && manifest.baselineTree === BASELINE_TREE,
  "manifest_git_identity_invalid");
  const issuedAt = new Date(now);
  ensure(Number.isFinite(issuedAt.getTime()), "request_now_invalid");
  const expiresAt = new Date(issuedAt.getTime() + 89 * 60_000);
  const nonceCompact = nonce.replaceAll("-", "").slice(0, 8);
  const suffix = `${manifest.sourceCommit.slice(0, 12)}-${nonceCompact}`;
  const rollbackWebImageRef =
    `market-radar-rollback/wp-g0-2-pending-drain:web-${runtime.baselineWebImageId.slice(7, 23)}`;
  const rollbackScannerImageRef =
    `market-radar-rollback/wp-g0-2-pending-drain:scanner-${runtime.baselineScannerImageId.slice(7, 23)}`;
  const request = {
    schemaVersion: "candidate-legacy-pending-drain-production-request.v2",
    packageId: PACKAGE_ID,
    productionRoot: PRODUCTION_ROOT,
    baselineCommit: BASELINE_COMMIT,
    baselineTree: BASELINE_TREE,
    targetCommit: manifest.sourceCommit,
    targetTree: manifest.sourceTree,
    targetComposeSha256: manifest.targetComposeSha256,
    runnerArtifactSha256: manifest.runnerArtifactSha256,
    transportArtifactSha256: manifest.transportArtifactSha256,
    transportBundleSha256: bundleSha256,
    transportMethod: "approved_orcaterm_bundle_upload",
    stagingDirectory: `/home/ubuntu/.cache/market-radar-ops/wp-g0-2-pending-drain-${suffix}`,
    secureRoot: `/home/ubuntu/.local/state/market-radar-pending-drain/${suffix}`,
    opsRoot: `/home/ubuntu/.cache/market-radar-ops/pending-drain-ops/${suffix}`,
    evidenceDirectory:
      `/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-pending-drain-${suffix}`,
    runnerUnitName: `market-radar-pending-drain-${manifest.sourceCommit.slice(0, 7)}-${nonceCompact}`,
    autonomyTrustRoot: TRUST_ROOT,
    services: ["web", "scanner-worker", "candidate-shadow-worker"],
    sessionIndependentExecutionRequired: true,
    temporaryArtifactCleanupRequired: true,
    operator: "codex-primary",
    approvalRef: `MR-G0-PENDING-DRAIN/${manifest.sourceCommit.slice(0, 12)}/${nonce.slice(0, 8)}`,
    approvalIssuedAt: issuedAt.toISOString(),
    approvalExpiresAt: expiresAt.toISOString(),
    productionMutation: true,
    migrationId: MIGRATION_ID,
    releaseId: RELEASE_ID,
    currentPhase: "legacy",
    currentWriteFrozen: true,
    sourceEpoch: 2,
    drainEpoch: 3,
    finalEpoch: 4,
    expectedCounts: { ...EXPECTED_COUNTS },
    rollbackWebImageRef,
    rollbackScannerImageRef,
    ...runtime,
    autonomyAuthorization: null,
  };
  const preflight = {
    baselineCommit: request.baselineCommit,
    baselineTree: request.baselineTree,
    baselineComposeSha256: request.baselineComposeSha256,
    baselineWebImageId: request.baselineWebImageId,
    baselineScannerImageId: request.baselineScannerImageId,
    controlApprovalDigest: request.controlApprovalDigest,
    expectedCounts: request.expectedCounts,
    finalEpoch: request.finalEpoch,
    releaseId: request.releaseId,
    sourceEpoch: request.sourceEpoch,
  };
  request.autonomyAuthorization = {
    schemaVersion: "market-radar-package-authorization.v1",
    mode: "g0_g8_standing_user_grant",
    approvedBy: "user_standing_grant",
    grantId: GRANT_ID,
    approvalId: `MR-G0-PENDING-DRAIN-${manifest.sourceCommit.slice(0, 12)}-${nonce}`,
    nonce,
    gate: "G0",
    packageId: PACKAGE_ID,
    scope: PACKAGE_ID,
    actionClass: "feature_phase_activation",
    riskTier: "R2_AUTHORITY_TRANSITION",
    builderAgentId: "codex-primary",
    baseCommit: BASELINE_COMMIT,
    targetCommit: manifest.sourceCommit,
    targetTree: manifest.sourceTree,
    diffSha256: manifest.sourceDiffSha256,
    pathSetSha256: manifest.sourcePathSetSha256,
    contractSha256: manifest.contractSha256,
    runnerSha256: manifest.runnerArtifactSha256,
    artifactSha256: manifest.transportArtifactSha256,
    imageOrMigrationSha256: sha256(canonicalJson({
      migrationId: request.migrationId,
      releaseId: request.releaseId,
      sourceEpoch: request.sourceEpoch,
      drainEpoch: request.drainEpoch,
      finalEpoch: request.finalEpoch,
      controlApprovalDigest: request.controlApprovalDigest,
    })),
    composeSha256: manifest.targetComposeSha256,
    environmentFingerprintSha256:
      sha256(`${request.baseEnvSha256}\n${request.productionEnvSha256}\n`),
    productionIdentitySha256: sha256(canonicalJson({
      baselineCommit: request.baselineCommit,
      baselineTree: request.baselineTree,
      baselineWebImageId: request.baselineWebImageId,
      baselineScannerImageId: request.baselineScannerImageId,
      identityOverrideSha256: request.identityOverrideSha256,
      identityWrapperSha256: request.identityWrapperSha256,
    })),
    gateEvidenceSha256,
    preflightSha256: sha256(canonicalJson(preflight)),
    backupRestoreEvidenceSha256: sha256(canonicalJson({
      rollbackWebImageRef,
      rollbackScannerImageRef,
      baselineCommit: request.baselineCommit,
      productionEnvSha256: request.productionEnvSha256,
    })),
    rollbackTarget: `${BASELINE_COMMIT}:web+scanner+env+git`,
    observationContractSha256: sha256(canonicalJson({
      drainTimeoutSeconds: 3_600,
      outboxBefore: 10_484,
      outboxFinal: 10_532,
      legacyPendingBefore: 48,
      legacyUnresolvedFinal: 0,
      candidateEventPendingFinal: 5_266,
      scannerReadyFreshAfterRestore: true,
    })),
    policySha256: manifest.policySha256,
    revocationEpoch: 2,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    maxExecutions: 1,
    packageAssertions: {
      qualityThresholdChanged: false,
      scopeMatchesBlueprint: true,
      dynamicPreflightCurrent: true,
      requiredGatesPassed: true,
      rollbackVerified: true,
      productionWipAvailable: true,
      secretsPresentInEvidence: false,
      knownP0Open: false,
      pollutionCleanupManifestExact: true,
      automaticRollback: true,
      databaseMutation: true,
      phaseTransition: true,
      webOnly: false,
      workerMutation: true,
    },
  };
  return request;
}

function validateAuthorization(authorization, request, manifest) {
  const expectedPreflight = {
    baselineCommit: request.baselineCommit,
    baselineTree: request.baselineTree,
    baselineComposeSha256: request.baselineComposeSha256,
    baselineWebImageId: request.baselineWebImageId,
    baselineScannerImageId: request.baselineScannerImageId,
    controlApprovalDigest: request.controlApprovalDigest,
    expectedCounts: request.expectedCounts,
    finalEpoch: request.finalEpoch,
    releaseId: request.releaseId,
    sourceEpoch: request.sourceEpoch,
  };
  const expected = {
    imageOrMigrationSha256: sha256(canonicalJson({
      migrationId: request.migrationId,
      releaseId: request.releaseId,
      sourceEpoch: request.sourceEpoch,
      drainEpoch: request.drainEpoch,
      finalEpoch: request.finalEpoch,
      controlApprovalDigest: request.controlApprovalDigest,
    })),
    environmentFingerprintSha256:
      sha256(`${request.baseEnvSha256}\n${request.productionEnvSha256}\n`),
    productionIdentitySha256: sha256(canonicalJson({
      baselineCommit: request.baselineCommit,
      baselineTree: request.baselineTree,
      baselineWebImageId: request.baselineWebImageId,
      baselineScannerImageId: request.baselineScannerImageId,
      identityOverrideSha256: request.identityOverrideSha256,
      identityWrapperSha256: request.identityWrapperSha256,
    })),
    preflightSha256: sha256(canonicalJson(expectedPreflight)),
    backupRestoreEvidenceSha256: sha256(canonicalJson({
      rollbackWebImageRef: request.rollbackWebImageRef,
      rollbackScannerImageRef: request.rollbackScannerImageRef,
      baselineCommit: request.baselineCommit,
      productionEnvSha256: request.productionEnvSha256,
    })),
    observationContractSha256: sha256(canonicalJson({
      drainTimeoutSeconds: 3_600,
      outboxBefore: 10_484,
      outboxFinal: 10_532,
      legacyPendingBefore: 48,
      legacyUnresolvedFinal: 0,
      candidateEventPendingFinal: 5_266,
      scannerReadyFreshAfterRestore: true,
    })),
  };
  ensure(authorization?.schemaVersion === "market-radar-package-authorization.v1"
      && authorization.mode === "g0_g8_standing_user_grant"
      && authorization.approvedBy === "user_standing_grant"
      && authorization.grantId === GRANT_ID && authorization.revocationEpoch === 2
      && authorization.gate === "G0" && authorization.packageId === PACKAGE_ID
      && authorization.scope === PACKAGE_ID
      && authorization.actionClass === "feature_phase_activation"
      && authorization.riskTier === "R2_AUTHORITY_TRANSITION"
      && authorization.builderAgentId === "codex-primary"
      && authorization.baseCommit === BASELINE_COMMIT
      && authorization.targetCommit === request.targetCommit
      && authorization.targetTree === request.targetTree
      && authorization.diffSha256 === manifest.sourceDiffSha256
      && authorization.pathSetSha256 === manifest.sourcePathSetSha256
      && authorization.contractSha256 === manifest.contractSha256
      && authorization.runnerSha256 === manifest.runnerArtifactSha256
      && authorization.artifactSha256 === manifest.transportArtifactSha256
      && authorization.composeSha256 === manifest.targetComposeSha256
      && authorization.policySha256 === manifest.policySha256
      && authorization.imageOrMigrationSha256 === expected.imageOrMigrationSha256
      && authorization.environmentFingerprintSha256 === expected.environmentFingerprintSha256
      && authorization.productionIdentitySha256 === expected.productionIdentitySha256
      && authorization.preflightSha256 === expected.preflightSha256
      && authorization.backupRestoreEvidenceSha256 === expected.backupRestoreEvidenceSha256
      && authorization.observationContractSha256 === expected.observationContractSha256
      && authorization.rollbackTarget === `${BASELINE_COMMIT}:web+scanner+env+git`
      && authorization.issuedAt === request.approvalIssuedAt
      && authorization.expiresAt === request.approvalExpiresAt
      && authorization.maxExecutions === 1, "authorization_binding_invalid");
  for (const key of REQUIRED_PACKAGE_APPROVAL_FIELDS) {
    ensure(authorization[key] !== undefined && authorization[key] !== null && authorization[key] !== "",
      `authorization_required_field_missing:${key}`);
  }
  for (const key of [
    "diffSha256", "pathSetSha256", "contractSha256", "runnerSha256", "artifactSha256",
    "imageOrMigrationSha256", "composeSha256", "environmentFingerprintSha256",
    "productionIdentitySha256", "gateEvidenceSha256", "preflightSha256",
    "backupRestoreEvidenceSha256", "observationContractSha256", "policySha256",
  ]) ensure(HASH.test(authorization[key] ?? ""), `authorization_hash_invalid:${key}`);
  for (const [key, value] of Object.entries({
    dynamicPreflightCurrent: true,
    knownP0Open: false,
    pollutionCleanupManifestExact: true,
    productionWipAvailable: true,
    qualityThresholdChanged: false,
    requiredGatesPassed: true,
    rollbackVerified: true,
    scopeMatchesBlueprint: true,
    secretsPresentInEvidence: false,
  })) ensure(authorization.packageAssertions?.[key] === value,
    `authorization_assertion_invalid:${key}`);
}

export async function verifyStagedTransport(root, manifest) {
  ensure(manifest.schemaVersion === "wp-g0.2-cycle-6-legacy-pending-drain-production-transport.v2"
      && manifest.packageId === PACKAGE_ID && manifest.baselineCommit === BASELINE_COMMIT
      && manifest.baselineTree === BASELINE_TREE
      && manifest.externalBundleSha256 === "bound_after_archive_creation"
      && manifest.sourceDateEpoch === SOURCE_DATE_EPOCH
      && manifest.archiveFormat === "ustar+gzip-n" && manifest.reproducibleArchive === true
      && manifest.containsSecrets === false
      && JSON.stringify(manifest.services)
        === JSON.stringify(["web", "scanner-worker", "candidate-shadow-worker"])
      && manifest.sessionIndependentExecutionRequired === true
      && manifest.temporaryArtifactCleanupRequired === true
      && JSON.stringify(manifest.files) === JSON.stringify([...TRANSPORT_FILES].sort()),
  "transport_manifest_boundary_invalid");
  const transport = await artifact(root, TRANSPORT_FILES);
  ensure(transport.sha256 === manifest.transportArtifactSha256,
    "transport_artifact_checksum_mismatch");
  for (const file of TRANSPORT_FILES) {
    ensure(transport.fileSha256[file] === manifest.fileSha256?.[file],
      `transport_file_checksum_mismatch:${file}`);
  }
  const contract = await validateProductionPacketContract(root);
  ensure(contract.status.startsWith("PASS_")
      && contract.contractSha256 === manifest.contractSha256
      && contract.runnerArtifactSha256 === manifest.runnerArtifactSha256,
  "transport_contract_invalid");
  return { contract, transport };
}

export function validateApprovalRequest({ manifest, request, now = new Date() }) {
  ensure(exactKeys(request, REQUEST_KEYS), "request_shape_invalid");
  ensure(request.schemaVersion === "candidate-legacy-pending-drain-production-request.v2"
      && request.packageId === PACKAGE_ID && request.productionRoot === PRODUCTION_ROOT
      && request.baselineCommit === BASELINE_COMMIT && request.baselineTree === BASELINE_TREE
      && IMAGE.test(request.baselineWebImageId ?? "")
      && request.targetCommit === manifest.sourceCommit && request.targetTree === manifest.sourceTree
      && request.targetComposeSha256 === manifest.targetComposeSha256,
  "request_git_or_image_binding_invalid");
  ensure(request.runnerArtifactSha256 === manifest.runnerArtifactSha256
      && request.transportArtifactSha256 === manifest.transportArtifactSha256
      && HASH.test(request.transportBundleSha256 ?? "")
      && request.transportMethod === "approved_orcaterm_bundle_upload",
  "request_transport_binding_invalid");
  ensure(request.rollbackWebImageRef
      === `market-radar-rollback/wp-g0-2-pending-drain:web-${request.baselineWebImageId.slice(7, 23)}`
      && request.rollbackScannerImageRef
        === `market-radar-rollback/wp-g0-2-pending-drain:scanner-${request.baselineScannerImageId.slice(7, 23)}`,
  "request_rollback_image_binding_invalid");
  ensure(request.migrationId === MIGRATION_ID
      && request.releaseId === RELEASE_ID
      && request.currentPhase === "legacy" && request.currentWriteFrozen === true
      && request.sourceEpoch === 2 && request.drainEpoch === 3 && request.finalEpoch === 4
      && canonicalJson(request.expectedCounts) === canonicalJson(EXPECTED_COUNTS),
  "request_database_boundary_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/wp-g0-2-pending-drain-[a-f0-9]{12}-[a-f0-9]{8}$/u
    .test(request.stagingDirectory ?? "")
      && /^\/home\/ubuntu\/\.local\/state\/market-radar-pending-drain\/[a-f0-9]{12}-[a-f0-9]{8}$/u
        .test(request.secureRoot ?? "")
      && /^\/home\/ubuntu\/\.cache\/market-radar-ops\/pending-drain-ops\/[a-f0-9]{12}-[a-f0-9]{8}$/u
        .test(request.opsRoot ?? "")
      && /^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/wp-g0-2-pending-drain-[a-f0-9]{12}-[a-f0-9]{8}$/u
        .test(request.evidenceDirectory ?? "")
      && /^market-radar-pending-drain-[a-f0-9]{7}-[a-f0-9]{8}$/u.test(request.runnerUnitName ?? ""),
  "request_path_boundary_invalid");
  ensure(request.autonomyTrustRoot === TRUST_ROOT
      && JSON.stringify(request.services)
        === JSON.stringify(["web", "scanner-worker", "candidate-shadow-worker"])
      && request.sessionIndependentExecutionRequired === true
      && request.temporaryArtifactCleanupRequired === true && request.productionMutation === true,
  "request_execution_boundary_invalid");
  validateRuntime(Object.fromEntries(RUNTIME_KEYS.map((key) => [key, request[key]])));
  const issuedAt = Date.parse(request.approvalIssuedAt);
  const expiresAt = Date.parse(request.approvalExpiresAt);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  ensure(Number.isFinite(issuedAt) && Number.isFinite(expiresAt)
      && expiresAt > issuedAt && expiresAt - issuedAt <= 90 * 60_000
      && nowMs >= issuedAt && nowMs < expiresAt, "request_approval_window_invalid");
  ensure(typeof request.operator === "string" && request.operator.length >= 2
      && /^[A-Za-z0-9._:/-]{8,160}$/u.test(request.approvalRef ?? ""),
  "request_operator_invalid");
  validateAuthorization(request.autonomyAuthorization, request, manifest);
  return { status: "PASS_PENDING_DRAIN_PRODUCTION_REQUEST", productionExecuted: false };
}

function parseArgs(argv) {
  const [command = "validate", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    ensure(rest[index]?.startsWith("--") && rest[index + 1] !== undefined,
      "argument_invalid");
    options[rest[index].slice(2)] = rest[index + 1];
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());
  if (command === "validate") {
    process.stdout.write(`${JSON.stringify(await validateLocalPreparation(root), null, 2)}\n`);
    return;
  }
  if (command === "bundle") {
    process.stdout.write(`${JSON.stringify(await buildTransportBundle({
      root, output: options.output,
    }), null, 2)}\n`);
    return;
  }
  if (command === "render-env") {
    const output = resolve(options.output);
    const request = JSON.parse(await readFile(resolve(options.request), "utf8"));
    await writeFile(output, renderDrainOnlyEnvironment(
      await readFile(resolve(options.source), "utf8"),
      { migrationId: request.migrationId, releaseId: request.releaseId },
    ),
      { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ status: "PASS_DRAIN_ONLY_ENV_RENDERED" })}\n`);
    return;
  }
  if (command === "prepare-admin-url") {
    await writeFile(resolve(options.output), `${prepareAdminUrl(readFileSync(0))}\n`,
      { flag: "wx", mode: 0o600 });
    return;
  }
  if (command === "prepare-request") {
    const [manifest, runtime] = await Promise.all([
      readFile(resolve(options.manifest), "utf8").then(JSON.parse),
      readFile(resolve(options.runtime), "utf8").then(JSON.parse),
    ]);
    const request = createProductionExecutionRequest({
      manifest,
      runtime,
      bundleSha256: options["bundle-sha256"],
      gateEvidenceSha256: options["gate-evidence-sha256"],
      now: options.now ? new Date(options.now) : new Date(),
      nonce: options.nonce ?? randomUUID(),
    });
    const bytes = `${JSON.stringify(request, null, 2)}\n`;
    await writeFile(resolve(options.output), bytes, { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({
      status: "PASS_PENDING_DRAIN_PRODUCTION_REQUEST_PREPARED",
      output: resolve(options.output),
      requestSha256: sha256(bytes),
    }, null, 2)}\n`);
    return;
  }
  if (command === "validate-request") {
    const manifestRoot = dirname(resolve(options.manifest));
    const [manifest, request] = await Promise.all([
      readFile(resolve(options.manifest), "utf8").then(JSON.parse),
      readFile(resolve(options.request), "utf8").then(JSON.parse),
    ]);
    await verifyStagedTransport(manifestRoot, manifest);
    process.stdout.write(`${JSON.stringify(validateApprovalRequest({ manifest, request }), null, 2)}\n`);
    return;
  }
  if (command === "describe") {
    process.stdout.write(`${JSON.stringify({
      packageId: PACKAGE_ID,
      baselineCommit: BASELINE_COMMIT,
      productionExecuted: false,
      productionPass: false,
    }, null, 2)}\n`);
    return;
  }
  throw new Error("command_invalid");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", reason: error.message })}\n`);
    process.exitCode = 1;
  });
}
