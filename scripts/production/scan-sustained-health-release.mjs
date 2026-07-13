#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

export const PACKAGE_ID = "WP-G0.2-SCAN-SUSTAINED-HEALTH-PRODUCTION-RELEASE";
export const CONTRACT_PATH = "docs/governance/wp-g0-2-scan-sustained-health-production-release.v1.json";
export const BASELINE_COMMIT = "0599f802f261fe8e3c1982a07106f362bd62ac13";
export const TARGET_COMMIT = "70722ea71b33268b688be5d42af9908d40f49859";
export const TARGET_REMOTE_BRANCH = "codex/wp-g0-2-scanner-sustained-health-release";
export const RELEASE_DIFF_SHA256 = "80bab7d7e3cdd5a9811dc0815c5df10205bce54e3f87c14d1791c94bcd3f6f58";
export const IDENTITY_OVERRIDE_SHA256 = "1b7f8ba4c623a0025ff35ddc203c6b769d1b262a1545a16892816cdbc478bacf";
export const COMPOSE_WRAPPER_SHA256 = "fb473dc3bf0a2968be8ad385efac3273f4057530df17cee73f2003d3a369f1f3";
export const PRODUCTION_COMPOSE_SHA256 = "2749a24dfd2f574ac0ffe64a8e2c9f8afb411dc7d11279f75cfcc9fb0d743a4e";
export const STAGING_DIRECTORY_PATTERN = /^\/home\/ubuntu\/\.cache\/market-radar-ops\/wp-g0-2-scan-sustained-health-release-[a-z0-9][a-z0-9._-]{7,80}$/;
export const EVIDENCE_DIRECTORY_PATTERN = /^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/wp-g0-2-scan-sustained-health-[a-z0-9][a-z0-9._-]{7,80}$/;

export const RELEASE_DIFF_LINES = [
  "M\tdeploy/workers/protected-api-worker.mjs",
  "A\tdeploy/workers/protected-api-worker.test.mjs",
  "A\tdeploy/workers/worker-schedule.mjs",
  "A\tdeploy/workers/worker-schedule.test.mjs",
  "M\tsrc/app/api/scan/route.ts",
  "M\tsrc/lib/api/system-health.test.ts",
  "M\tsrc/lib/api/system-health.ts",
  "M\tsrc/lib/market/radar-snapshot.test.ts",
  "M\tsrc/lib/market/radar-snapshot.ts",
  "A\tsrc/lib/market/scan-action-contract.test.ts",
  "A\tsrc/lib/market/scan-action-contract.ts",
  "M\tsrc/lib/market/scan-coordinator.test.ts",
  "M\tsrc/lib/market/scan-coordinator.ts",
  "M\tsrc/lib/market/scan-runtime.test.ts",
  "M\tsrc/lib/market/scan-runtime.ts",
  "M\tsrc/lib/market/types.ts",
];

export class ScanSustainedHealthReleasePolicyError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "ScanSustainedHealthReleasePolicyError";
    this.reason = reason;
  }
}

function ensure(condition, reason) {
  if (!condition) throw new ScanSustainedHealthReleasePolicyError(reason);
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseTimestamp(value, reason) {
  const timestamp = Date.parse(value);
  ensure(Number.isFinite(timestamp), reason);
  return timestamp;
}

export function validateContract(contract) {
  ensure(contract?.schemaVersion === "wp-g0.2-scan-sustained-health-production-release.v1", "schema_version_mismatch");
  ensure(contract.packageId === PACKAGE_ID, "package_id_mismatch");
  ensure(contract.status === "local_preparation_awaiting_exact_production_approval", "contract_status_not_locked");
  ensure(contract.productionAuthorization === false, "production_authorization_must_be_false");
  ensure(contract.productionExecuted === false, "production_executed_must_be_false");
  ensure(contract.release?.baselineCommit === BASELINE_COMMIT, "baseline_commit_not_locked");
  ensure(contract.release?.targetCommit === TARGET_COMMIT, "target_commit_not_locked");
  ensure(contract.release?.targetRemoteBranch === TARGET_REMOTE_BRANCH, "target_remote_branch_not_locked");
  ensure(contract.release?.releaseDiffSha256 === RELEASE_DIFF_SHA256, "release_diff_checksum_not_locked");
  ensure(JSON.stringify(contract.release?.releaseDiffLines) === JSON.stringify(RELEASE_DIFF_LINES), "release_diff_lines_mismatch");
  ensure(contract.release?.singleParentRequired === true, "single_parent_required");
  ensure(contract.release?.detachedHeadAfterSuccess === true, "detached_head_required");
  ensure(JSON.stringify(contract.scope?.services) === JSON.stringify(["web", "scanner-worker"]), "service_allowlist_mismatch");
  ensure(contract.scope?.identityOverrideSha256 === IDENTITY_OVERRIDE_SHA256, "identity_override_checksum_not_locked");
  ensure(contract.scope?.composeWrapperSha256 === COMPOSE_WRAPPER_SHA256, "compose_wrapper_checksum_not_locked");
  ensure(contract.scope?.productionComposeSha256 === PRODUCTION_COMPOSE_SHA256, "production_compose_checksum_not_locked");
  ensure(contract.scope?.sourceFetchAllowed === true, "exact_source_fetch_required");
  ensure(contract.scope?.buildAllowed === true, "target_build_required");
  ensure(contract.scope?.productionRepositoryMutationAllowed === true, "exact_repository_transition_required");
  ensure(contract.scope?.databaseMutationAllowed === false, "database_mutation_must_be_false");
  ensure(contract.scope?.redisMutationAllowed === false, "redis_mutation_must_be_false");
  ensure(contract.scope?.otherServiceRestartAllowed === false, "other_service_restart_must_be_false");
  ensure(contract.scope?.environmentMutationAllowed === false, "environment_mutation_must_be_false");
  ensure(contract.scope?.featureFlagMutationAllowed === false, "feature_flag_mutation_must_be_false");
  ensure(contract.scope?.migrationAllowed === false, "migration_must_be_false");
  ensure(contract.scope?.candidateRuntimeMutationAllowed === false, "candidate_runtime_mutation_must_be_false");
  ensure(contract.scope?.temporaryArtifactCleanupRequired === true, "temporary_artifact_cleanup_required");
  ensure(contract.scope?.maximumApprovalWindowMinutes === 90, "approval_window_not_locked");
  ensure(contract.observation?.minimumDurationSeconds === 1_800, "observation_duration_not_locked");
  ensure(contract.observation?.cadenceSeconds === 900, "cadence_not_locked");
  ensure(contract.observation?.requiredCompletionAdvances === 2, "completion_advance_count_not_locked");
  ensure(contract.observation?.freshnessRequiredThroughout === true, "continuous_freshness_required");
  ensure(contract.observation?.scannerHeartbeatRequired === true, "scanner_heartbeat_required");
  ensure(contract.observation?.finalReadyHealthRequired === true, "final_ready_health_required");
  ensure(contract.rollback?.automaticRollbackRequired === true, "automatic_rollback_required");
  ensure(contract.rollback?.restoreBothTargetImages === true, "two_image_rollback_required");
  ensure(contract.rollback?.restoreBaselineMain === true, "baseline_main_rollback_required");
  ensure(contract.transport?.reproducibleArchiveRequired === true, "reproducible_archive_required");
  ensure(contract.transport?.archiveFormat === "ustar+gzip-n", "transport_archive_format_not_locked");
  ensure(contract.transport?.sourceDateEpoch === 946684800, "transport_source_date_epoch_not_locked");
  ensure(/^[0-9a-f]{64}$/.test(contract.artifact?.sha256 ?? ""), "artifact_checksum_not_locked");
  ensure(JSON.stringify(contract.artifact?.files) === JSON.stringify([
    "scripts/production/scan-sustained-health-release-entrypoint.sh",
    "scripts/production/scan-sustained-health-release.mjs",
    "scripts/production/scan-sustained-health-release.sh",
  ]), "artifact_files_mismatch");
  ensure(exactKeys(contract.artifact?.fileSha256, contract.artifact.files), "artifact_file_checksums_mismatch");
  ensure(Object.values(contract.artifact.fileSha256).every((value) => /^[0-9a-f]{64}$/.test(value)), "artifact_file_checksum_invalid");
  return contract;
}

export function validateApprovalRequest(request, contract, { now = new Date() } = {}) {
  const expectedKeys = [
    "approvalExpiresAt", "approvalIssuedAt", "approvalRef", "automaticRollbackAllowed",
    "baseEnvSha256", "baselineCommit", "buildAllowed", "candidateRuntimeMutationAllowed",
    "composeSha256", "composeWrapperSha256", "contractSha256", "databaseMutationAllowed",
    "detachedHeadAfterSuccess", "environmentMutationAllowed", "evidenceDirectory", "execute",
    "featureFlagMutationAllowed", "identityOverrideSha256", "migrationAllowed", "operator",
    "otherServiceRestartAllowed", "packageId", "productionEnvSha256", "productionRepositoryMutationAllowed",
    "redisMutationAllowed", "releaseArtifactSha256", "releaseDiffSha256", "requiredCompletionAdvances",
    "runnerSourceCommit", "scannerWorkerImageId", "services", "sourceFetchAllowed", "stagingDirectory",
    "targetCommit", "targetRemoteBranch", "temporaryArtifactCleanupRequired", "transportBundleSha256",
    "transportMethod", "webImageId", "observationDurationSeconds", "cadenceSeconds",
  ];
  ensure(exactKeys(request, expectedKeys), "request_keys_mismatch");
  ensure(request.packageId === PACKAGE_ID, "request_package_mismatch");
  ensure(request.baselineCommit === contract.release.baselineCommit, "request_baseline_commit_mismatch");
  ensure(request.targetCommit === contract.release.targetCommit, "request_target_commit_mismatch");
  ensure(request.targetRemoteBranch === contract.release.targetRemoteBranch, "request_target_remote_branch_mismatch");
  ensure(request.releaseDiffSha256 === contract.release.releaseDiffSha256, "request_release_diff_checksum_mismatch");
  ensure(JSON.stringify(request.services) === JSON.stringify(contract.scope.services), "request_service_allowlist_mismatch");
  ensure(request.identityOverrideSha256 === contract.scope.identityOverrideSha256, "request_identity_override_checksum_mismatch");
  ensure(request.composeWrapperSha256 === contract.scope.composeWrapperSha256, "request_wrapper_checksum_mismatch");
  ensure(request.composeSha256 === contract.scope.productionComposeSha256, "request_compose_checksum_mismatch");
  ensure(request.releaseArtifactSha256 === contract.artifact.sha256, "request_release_artifact_checksum_mismatch");
  ensure(request.observationDurationSeconds === contract.observation.minimumDurationSeconds, "request_observation_duration_mismatch");
  ensure(request.cadenceSeconds === contract.observation.cadenceSeconds, "request_cadence_mismatch");
  ensure(request.requiredCompletionAdvances === contract.observation.requiredCompletionAdvances, "request_completion_advance_count_mismatch");
  ensure(/^[0-9a-f]{64}$/.test(request.contractSha256 ?? ""), "request_contract_checksum_invalid");
  ensure(/^[0-9a-f]{64}$/.test(request.transportBundleSha256 ?? ""), "request_transport_bundle_checksum_invalid");
  ensure(/^[0-9a-f]{40}$/.test(request.runnerSourceCommit ?? ""), "request_runner_source_commit_invalid");
  ensure(/^sha256:[0-9a-f]{64}$/.test(request.webImageId ?? ""), "request_web_image_id_invalid");
  ensure(/^sha256:[0-9a-f]{64}$/.test(request.scannerWorkerImageId ?? ""), "request_scanner_worker_image_id_invalid");
  ensure(/^[0-9a-f]{64}$/.test(request.baseEnvSha256 ?? ""), "request_base_env_checksum_invalid");
  ensure(/^[0-9a-f]{64}$/.test(request.productionEnvSha256 ?? ""), "request_production_env_checksum_invalid");
  ensure(STAGING_DIRECTORY_PATTERN.test(request.stagingDirectory ?? ""), "request_staging_directory_invalid");
  ensure(EVIDENCE_DIRECTORY_PATTERN.test(request.evidenceDirectory ?? ""), "request_evidence_directory_invalid");
  ensure(request.transportMethod === "approved_orcaterm_bundle_upload", "request_transport_method_invalid");
  ensure(request.execute === true, "execute_must_be_true");
  ensure(request.automaticRollbackAllowed === true, "automatic_rollback_not_allowed");
  ensure(request.sourceFetchAllowed === true, "source_fetch_not_allowed");
  ensure(request.buildAllowed === true, "build_not_allowed");
  ensure(request.productionRepositoryMutationAllowed === true, "repository_transition_not_allowed");
  ensure(request.detachedHeadAfterSuccess === true, "detached_head_not_required");
  ensure(request.temporaryArtifactCleanupRequired === true, "temporary_artifact_cleanup_not_required");
  for (const key of [
    "candidateRuntimeMutationAllowed", "databaseMutationAllowed", "environmentMutationAllowed",
    "featureFlagMutationAllowed", "migrationAllowed", "otherServiceRestartAllowed", "redisMutationAllowed",
  ]) ensure(request[key] === false, `${key}_must_be_false`);
  ensure(typeof request.approvalRef === "string" && request.approvalRef.trim().length >= 8, "approval_ref_invalid");
  ensure(typeof request.operator === "string" && request.operator.trim().length >= 2, "operator_invalid");
  const issuedAt = parseTimestamp(request.approvalIssuedAt, "approval_issued_at_invalid");
  const expiresAt = parseTimestamp(request.approvalExpiresAt, "approval_expires_at_invalid");
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  ensure(expiresAt > issuedAt && expiresAt - issuedAt <= 90 * 60 * 1000, "approval_window_too_long");
  ensure(nowMs >= issuedAt && nowMs <= expiresAt, "approval_window_not_active");
  return request;
}

export async function inspectArtifact(root, contract) {
  const checksums = {};
  for (const file of contract.artifact.files) {
    checksums[file] = sha256(await readFile(resolve(root, file)));
    ensure(checksums[file] === contract.artifact.fileSha256[file], `artifact_file_checksum_mismatch:${file}`);
  }
  const checksum = sha256(JSON.stringify(checksums));
  ensure(checksum === contract.artifact.sha256, "artifact_checksum_mismatch");
  return { checksum, fileCount: contract.artifact.files.length };
}

export async function inspectRelease(root, contract) {
  const runGit = async (args) => (await execFileAsync("git", ["-C", root, ...args])).stdout.trimEnd();
  const objectType = await runGit(["cat-file", "-t", contract.release.targetCommit]);
  ensure(objectType === "commit", "target_commit_unavailable");
  const parentLine = await runGit(["rev-list", "--parents", "-n", "1", contract.release.targetCommit]);
  ensure(parentLine === `${contract.release.targetCommit} ${contract.release.baselineCommit}`, "target_parent_mismatch");
  const diffOutput = `${await runGit(["diff-tree", "--no-commit-id", "--name-status", "-r", contract.release.targetCommit])}\n`;
  ensure(diffOutput === `${contract.release.releaseDiffLines.join("\n")}\n`, "release_diff_lines_runtime_mismatch");
  ensure(sha256(diffOutput) === contract.release.releaseDiffSha256, "release_diff_checksum_runtime_mismatch");
  return {
    baselineCommit: contract.release.baselineCommit,
    changedFileCount: contract.release.releaseDiffLines.length,
    releaseDiffSha256: sha256(diffOutput),
    targetCommit: contract.release.targetCommit,
  };
}

export async function inspectRunner(root) {
  const source = await readFile(resolve(root, "scripts/production/scan-sustained-health-release.sh"), "utf8");
  const entrypoint = await readFile(resolve(root, "scripts/production/scan-sustained-health-release-entrypoint.sh"), "utf8");
  const forbiddenServiceMutationLines = source.split("\n").filter((line) => (
    /\b(?:up|restart|start)\b/.test(line)
    && /\b(?:postgres|redis|caddy|websocket-light-worker|coinglass-worker|signal-worker|shadow-runner|dynamic-scan-scheduler|macro-worker|candidate-shadow-worker)\b/.test(line)
    && /(?:IDENTITY_COMPOSE|DOCKER|docker\s+compose)/.test(line)
  ));
  const facts = {
    exactRemoteFetch: /TARGET_REMOTE_BRANCH/.test(source) && /refs\/remotes\/origin/.test(source),
    exactParentAndDiffChecked: /RELEASE_DIFF_SHA256/.test(source) && /rev-list --parents/.test(source),
    twoServiceBuild: /build web scanner-worker/.test(source),
    twoServiceRecreate: /force-recreate web/.test(source) && /force-recreate scanner-worker/.test(source),
    twoImageRollback: /PREVIOUS_WEB_IMAGE_ID/.test(source) && /PREVIOUS_SCANNER_IMAGE_ID/.test(source),
    nonTargetContainersCompared: /NON_TARGET_CONTAINERS_BEFORE/.test(source) && /NON_TARGET_CONTAINERS_AFTER/.test(source),
    detachedTargetRequired: /checkout --detach/.test(source),
    baselineMainRollback: /checkout main/.test(source) && /BASELINE_COMMIT/.test(source),
    identityFingerprintChecked: /verify_service_identity/.test(source),
    persistenceReadOnlyProbe: /select 1/.test(source),
    twoCadenceObservation: /OBSERVATION_DURATION_SECONDS/.test(source) && /REQUIRED_COMPLETION_ADVANCES/.test(source),
    continuousFreshnessChecked: /scan\.freshness == "fresh"/.test(source),
    scannerHeartbeatChecked: /scanner-worker/.test(source) && /runtimeProbes/.test(source),
    automaticRollbackTrap: /trap rollback_on_failure EXIT/.test(source),
    forbiddenServicesAbsent: forbiddenServiceMutationLines.length === 0,
    noMigration: !/(migration:runner|candidate:migrate|persistence\/migrate)/.test(source),
    noEnvWrite: !/(?:sed\s+-i|tee\s+[^|]|cat\s+>)[^\n]*(?:\.env|ENV_FILE)/.test(source),
    stagingBoundaryChecked: /APPROVED_STAGING_DIRECTORY/.test(entrypoint) && /STAGING_BASENAME_PREFIX/.test(entrypoint),
    stagingCleanupTrap: /trap cleanup_staging EXIT/.test(entrypoint)
      && /trap 'exit 130' INT/.test(entrypoint)
      && /trap 'exit 143' TERM/.test(entrypoint),
  };
  const violations = Object.entries(facts).filter(([, value]) => value !== true).map(([key]) => `runner_guard_missing:${key}`);
  ensure(violations.length === 0, violations.join(","));
  return facts;
}

export async function loadContract(root = process.cwd()) {
  return validateContract(JSON.parse(await readFile(resolve(root, CONTRACT_PATH), "utf8")));
}

export async function validateLocalPreparation(root = process.cwd()) {
  const contract = await loadContract(root);
  const [artifact, release, runner] = await Promise.all([
    inspectArtifact(root, contract),
    inspectRelease(root, contract),
    inspectRunner(root),
  ]);
  return {
    status: "PASS_LOCAL_SCAN_SUSTAINED_HEALTH_RELEASE_PREPARATION",
    productionDecision: "BLOCKED_AWAITING_EXACT_PRODUCTION_APPROVAL",
    productionMutationAllowed: false,
    artifact,
    release,
    runner,
  };
}

export async function validateStagedArtifact(root = process.cwd()) {
  const contract = await loadContract(root);
  const [artifact, runner] = await Promise.all([
    inspectArtifact(root, contract),
    inspectRunner(root),
  ]);
  return {
    status: "PASS_STAGED_SCAN_SUSTAINED_HEALTH_RELEASE_ARTIFACT",
    artifact,
    runner,
  };
}

function parseArgs(argv) {
  const [command = "validate", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    ensure(key?.startsWith("--"), "argument_invalid");
    const value = rest[index + 1];
    ensure(value && !value.startsWith("--"), `argument_value_missing:${key}`);
    options[key.slice(2)] = value;
    index += 1;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());
  let result;
  if (command === "validate") {
    result = await validateLocalPreparation(root);
  } else if (command === "staged") {
    result = await validateStagedArtifact(root);
  } else if (command === "request") {
    const contract = options["contract-base64"]
      ? validateContract(JSON.parse(Buffer.from(options["contract-base64"], "base64").toString("utf8")))
      : await loadContract(root);
    const request = options["request-base64"]
      ? JSON.parse(Buffer.from(options["request-base64"], "base64").toString("utf8"))
      : JSON.parse(await readFile(resolve(options.request ?? ""), "utf8"));
    result = {
      ok: true,
      request: validateApprovalRequest(request, contract, options.now ? { now: new Date(options.now) } : {}),
    };
  } else {
    throw new ScanSustainedHealthReleasePolicyError("command_invalid");
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href || process.env.SCAN_SUSTAINED_HEALTH_RELEASE_STDIN === "true") {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, reason: error?.reason ?? error?.message ?? "unexpected_error" })}\n`);
    process.exitCode = 1;
  });
}
