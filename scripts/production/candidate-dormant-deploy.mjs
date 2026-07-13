#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const CONTRACT_PATH = "docs/governance/wp-g0-2-shadow-capture-dormant-runtime-deploy.v1.json";
export const PACKAGE_ID = "WP-G0.2-DORMANT-RUNTIME-DEPLOY-STANDING-AUTHORITY-AND-RUNNER-REFRESH";
export const BASELINE_COMMIT = "70722ea71b33268b688be5d42af9908d40f49859";
export const TARGET_COMMIT = "cec0b6572bb09ae91ff9e013f8bb160f73c045e2";
export const TARGET_TREE = "eb217a7fbaad5b464279a08d4441a8249fc266e3";
export const TARGET_REMOTE_BRANCH = "codex/wp-g0-2-dormant-runtime-release-v2";
export const RELEASE_DIFF_SHA256 = "ee814eb07b7b4fa6c4f36f92293d9ec9fbf2269fbb0e348d0705799637e4f4fa";
export const RELEASE_PATH_SET_SHA256 = "595fe25980a91548c7a88a7301f141c24ea29e1ea61c1960284a59c950aef19a";
export const TARGET_COMPOSE_SHA256 = "9e22cf32574e19e8526cf42795726627bff9b90cd990db69b5639d20e9ff0820";
export const AUTONOMY_GRANT_ID = "MR-G0-G8-USER-STANDING-GRANT-20260714-034826";
export const AUTONOMY_TRUST_ROOT = "/home/ubuntu/.local/state/market-radar-autonomy";
export const AUTONOMY_REVOCATION_EPOCH = 2;
export const AUTONOMY_ACTION_CLASS = "dormant_runtime_deploy";
export const AUTONOMY_RISK_TIER = "R1_REVERSIBLE_RUNTIME";
export const AUTONOMY_BUILDER_AGENT_ID = "codex-primary";
export const ROLLBACK_IMAGE_REPOSITORY = "market-radar-rollback/wp-g0-2-dormant";
export const STAGING_DIRECTORY_PATTERN = /^\/home\/ubuntu\/\.cache\/market-radar-ops\/wp-g0-2-dormant-runtime-deploy-[a-z0-9][a-z0-9._-]{7,80}$/;
export const EVIDENCE_DIRECTORY_PATTERN = /^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/wp-g0-2-dormant-runtime-deploy-[a-z0-9][a-z0-9._-]{7,80}$/;
export const RUNNER_UNIT_NAME_PATTERN = /^market-radar-dormant-[a-z0-9][a-z0-9-]{7,56}$/;

const FEATURE_FLAGS = [
  "CANDIDATE_EPISODE_CANONICAL_WRITE",
  "CANDIDATE_EPISODE_SHADOW_WRITE",
  "CANDIDATE_EPISODE_DUAL_READ",
  "CANDIDATE_EPISODE_CANONICAL_READ",
  "CANDIDATE_EPISODE_REVIEW_READ",
];
const DATABASE_URLS = [
  "CANDIDATE_SOURCE_DATABASE_URL",
  "CANDIDATE_CONSUMER_DATABASE_URL",
  "CANDIDATE_MONITOR_DATABASE_URL",
];

export class DormantDeployPolicyError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "DormantDeployPolicyError";
    this.reason = reason;
  }
}

function ensure(condition, reason) {
  if (!condition) throw new DormantDeployPolicyError(reason);
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

export function rollbackImageRef(imageId) {
  const digest = /^sha256:([0-9a-f]{64})$/.exec(imageId ?? "")?.[1];
  ensure(digest, "rollback_image_ref_input_invalid");
  return `${ROLLBACK_IMAGE_REPOSITORY}:web-${digest.slice(0, 16)}`;
}

export function productionPreflightSha256(request) {
  return sha256(JSON.stringify({
    baselineCommit: request.baselineCommit,
    targetCommit: request.targetCommit,
    releaseDiffSha256: request.releaseDiffSha256,
    releasePathSetSha256: request.releasePathSetSha256,
    webImageId: request.webImageId,
    baselineComposeSha256: request.baselineComposeSha256,
    targetComposeSha256: request.targetComposeSha256,
    baseEnvSha256: request.baseEnvSha256,
    productionEnvSha256: request.productionEnvSha256,
    identityOverrideSha256: request.identityOverrideSha256,
    composeWrapperSha256: request.composeWrapperSha256,
    candidateRuntimeMutationAllowed: request.candidateRuntimeMutationAllowed,
    databaseMutationAllowed: request.databaseMutationAllowed,
    redisMutationAllowed: request.redisMutationAllowed,
    environmentMutationAllowed: request.environmentMutationAllowed,
  }));
}

export function rollbackEvidenceSha256(request) {
  return sha256(JSON.stringify({
    baselineCommit: request.baselineCommit,
    webImageId: request.webImageId,
    rollbackWebImageRef: request.rollbackWebImageRef,
    rollbackImageRetentionRequired: request.rollbackImageRetentionRequired,
    automaticRollbackAllowed: request.automaticRollbackAllowed,
  }));
}

export function validateContract(contract) {
  ensure(contract?.schemaVersion === "wp-g0.2-shadow-capture-dormant-runtime-deploy.v1", "schema_version_mismatch");
  ensure(contract.packageId === PACKAGE_ID, "package_id_mismatch");
  ensure(contract.status === "local_preparation_verified_awaiting_bound_production_execution", "contract_status_not_locked");
  ensure(contract.productionAuthorization === false, "production_authorization_must_be_false");
  ensure(contract.productionDeployed === false, "production_deployed_must_be_false");
  ensure(contract.productionActivated === false, "production_activated_must_be_false");
  const deployment = contract.deployment ?? {};
  ensure(deployment.mode === "dormant_runtime_web_only", "deployment_mode_mismatch");
  ensure(JSON.stringify(deployment.serviceAllowlist) === '["web"]', "service_allowlist_mismatch");
  ensure(deployment.buildCommand === "docker compose build web", "build_command_mismatch");
  ensure(deployment.recreateCommand === "docker compose up -d --no-deps --force-recreate web", "recreate_command_mismatch");
  ensure(deployment.removeOrphansAllowed === false, "remove_orphans_must_be_false");
  ensure(deployment.composeProfileAllowed === false, "compose_profile_must_be_false");
  ensure(deployment.candidateWorkerStartAllowed === false, "candidate_worker_start_must_be_false");
  ensure(deployment.environmentMutationAllowed === false, "environment_mutation_must_be_false");
  ensure(deployment.maximumApprovalWindowMinutes === 90, "approval_window_mismatch");
  ensure(deployment.sessionIndependentExecutionRequired === true, "session_independent_execution_required");
  ensure(deployment.runner === "transient_systemd_unit", "transient_runner_required");
  ensure(deployment.runnerMaximumSeconds === 5_400, "runner_maximum_not_locked");
  ensure(deployment.logs === "journald", "runner_logs_not_locked");
  ensure(deployment.hostNodeRequired === false, "host_node_must_not_be_required");
  ensure(deployment.containerValidatorFallbackRequired === true,
    "container_validator_fallback_required");
  ensure(deployment.containerLeaseCliFallbackRequired === true,
    "container_lease_fallback_required");
  ensure(deployment.containerFallbackNetworkAllowed === false,
    "container_fallback_network_must_be_disabled");
  ensure(deployment.containerFallbackReadOnlyRoot === true,
    "container_fallback_read_only_root_required");
  ensure(deployment.containerFallbackCapabilities === "none",
    "container_fallback_capabilities_must_be_none");
  ensure(deployment.identityOverrideRequired === true, "identity_override_required");
  ensure(deployment.identityOverrideChecksumBound === true, "identity_override_checksum_binding_required");
  ensure(deployment.observationDurationSeconds === 1_800, "observation_duration_not_locked");
  ensure(deployment.observationPollSeconds === 30, "observation_poll_not_locked");
  const dormant = contract.dormantBoundary ?? {};
  ensure(dormant.codeActivationAllowed === false, "code_activation_must_be_false");
  ensure(dormant.candidateFeatureFlagsEnabled === 0, "feature_flags_must_be_zero");
  ensure(dormant.candidateDatabaseUrlsConfigured === 0, "candidate_database_urls_must_be_zero");
  ensure(dormant.candidateRuntimeReleaseId === "disabled", "candidate_release_must_be_disabled");
  ensure(dormant.candidateWorkerExpected === false, "candidate_worker_expected_must_be_false");
  ensure(dormant.candidateControlRows === 0, "candidate_control_rows_must_be_zero");
  ensure(dormant.migrationAllowed === false, "migration_must_be_false");
  ensure(dormant.databaseMutationAllowed === false, "database_mutation_must_be_false");
  ensure(dormant.redisMutationAllowed === false, "redis_mutation_must_be_false");
  const release = contract.releaseBoundary ?? {};
  ensure(release.baselineCommit === BASELINE_COMMIT, "baseline_commit_not_locked");
  ensure(release.targetCommit === TARGET_COMMIT, "target_commit_not_locked");
  ensure(release.targetTree === TARGET_TREE, "target_tree_not_locked");
  ensure(release.targetRemoteBranch === TARGET_REMOTE_BRANCH, "target_remote_branch_not_locked");
  ensure(release.singleParentRequired === true, "single_parent_required");
  ensure(release.detachedHeadAfterSuccess === true, "detached_head_required");
  ensure(release.releaseDiffFileCount === 18, "release_diff_file_count_not_locked");
  ensure(release.releaseDiffSha256 === RELEASE_DIFF_SHA256, "release_diff_checksum_not_locked");
  ensure(release.releasePathSetSha256 === RELEASE_PATH_SET_SHA256, "release_path_set_checksum_not_locked");
  ensure(Array.isArray(release.releaseDiffLines) && release.releaseDiffLines.length === 18,
    "release_diff_lines_mismatch");
  ensure(sha256(`${release.releaseDiffLines.join("\n")}\n`) === RELEASE_DIFF_SHA256,
    "release_diff_lines_checksum_mismatch");
  ensure(Array.isArray(contract.artifact?.files) && contract.artifact.files.length === 18,
    "artifact_files_missing");
  ensure(/^[0-9a-f]{64}$/.test(contract.artifact?.sha256 ?? ""), "artifact_checksum_not_locked");
  const autonomy = contract.autonomy ?? {};
  ensure(autonomy.grantId === AUTONOMY_GRANT_ID, "autonomy_grant_not_locked");
  ensure(autonomy.revocationEpoch === AUTONOMY_REVOCATION_EPOCH, "autonomy_revocation_epoch_not_locked");
  ensure(autonomy.gate === "G0", "autonomy_gate_not_locked");
  ensure(autonomy.actionClass === AUTONOMY_ACTION_CLASS, "autonomy_action_class_not_locked");
  ensure(autonomy.riskTier === AUTONOMY_RISK_TIER, "autonomy_risk_tier_not_locked");
  ensure(autonomy.builderAgentId === AUTONOMY_BUILDER_AGENT_ID, "autonomy_builder_not_locked");
  ensure(autonomy.trustRoot === AUTONOMY_TRUST_ROOT, "autonomy_trust_root_not_locked");
  ensure(autonomy.externalProductionLeaseRequired === true, "autonomy_external_lease_required");
  ensure(autonomy.singleUseApprovalRequired === true, "autonomy_single_use_required");
  ensure(autonomy.fencingTokenRequired === true, "autonomy_fencing_required");
  ensure(autonomy.leaseCheckBeforeEveryMutation === true, "autonomy_checkpoint_revalidation_required");
  ensure(autonomy.rollbackAllowedAfterLeaseExpiry === true, "autonomy_safety_closeout_required");
  const rollback = contract.rollback ?? {};
  ensure(rollback.automaticRollbackRequired === true, "automatic_rollback_required");
  ensure(rollback.restoreBaselineGitTarget === true, "baseline_git_rollback_required");
  ensure(rollback.restoreWebImage === true, "web_image_rollback_required");
  ensure(rollback.retainImageBeforeMutation === true, "rollback_image_retention_required");
  ensure(rollback.verifyRetentionBeforeMutation === true, "rollback_image_retention_verification_required");
  ensure(rollback.retainAfterSuccess === true, "rollback_image_success_retention_required");
  ensure(rollback.cleanupRequiresSeparateApproval === true, "rollback_cleanup_requires_approval");
  ensure(rollback.retentionRepository === ROLLBACK_IMAGE_REPOSITORY, "rollback_repository_mismatch");
  for (const item of [
    "candidate_worker_start", "candidate_database_url_configuration", "candidate_feature_flag_enablement",
    "code_activation_enablement", "migration_execute", "database_ddl_or_dml", "redis_mutation",
    "environment_mutation", "formal_backtest",
  ]) ensure(contract.forbiddenInThisPackage?.includes(item), `forbidden_boundary_missing:${item}`);
  return contract;
}

export async function loadContract(root = process.cwd()) {
  return validateContract(JSON.parse(await readFile(resolve(root, CONTRACT_PATH), "utf8")));
}

export async function inspectArtifact(root, contract) {
  const checksums = {};
  for (const file of [...contract.artifact.files].sort()) {
    checksums[file] = sha256(await readFile(resolve(root, file)));
  }
  const checksum = sha256(JSON.stringify(checksums));
  ensure(checksum === contract.artifact.sha256, "artifact_checksum_mismatch");
  return { checksum, fileCount: Object.keys(checksums).length, fileSha256: checksums };
}

async function runGit(root, args, reason) {
  try {
    return (await execFileAsync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
    })).stdout.trimEnd();
  } catch {
    throw new DormantDeployPolicyError(reason);
  }
}

export function evaluateReleaseDiff(lines, contract) {
  ensure(Array.isArray(lines) && lines.length > 0, "release_diff_empty");
  const normalized = [...lines];
  ensure(new Set(normalized).size === normalized.length, "release_diff_duplicate_path");
  ensure(normalized.every((line) => /^[AM]\t[^\t]+$/.test(line)), "release_diff_status_forbidden");
  ensure(JSON.stringify(normalized) === JSON.stringify(contract.releaseBoundary.releaseDiffLines),
    "release_diff_lines_runtime_mismatch");
  const checksum = sha256(`${normalized.join("\n")}\n`);
  ensure(checksum === contract.releaseBoundary.releaseDiffSha256, "release_diff_checksum_mismatch");
  return { checksum, fileCount: normalized.length };
}

export async function inspectRelease(root, contract) {
  ensure(await runGit(root, ["cat-file", "-t", contract.releaseBoundary.targetCommit],
    "release_target_unavailable") === "commit", "release_target_not_commit");
  const parentLine = await runGit(root, ["rev-list", "--parents", "-n", "1",
    contract.releaseBoundary.targetCommit], "release_parent_unavailable");
  ensure(parentLine === `${contract.releaseBoundary.targetCommit} ${contract.releaseBoundary.baselineCommit}`,
    "release_target_parent_mismatch");
  ensure(await runGit(root, ["rev-parse", `${contract.releaseBoundary.targetCommit}^{tree}`],
    "release_tree_unavailable") === contract.releaseBoundary.targetTree, "release_target_tree_mismatch");
  const diffOutput = `${await runGit(root, ["diff-tree", "--no-commit-id", "--name-status", "-r",
    contract.releaseBoundary.targetCommit], "release_diff_unavailable")}\n`;
  const lines = diffOutput.trim().split(/\r?\n/).filter(Boolean);
  const result = evaluateReleaseDiff(lines, contract);
  const pathSet = `${lines.map((line) => line.split("\t")[1]).sort().join("\n")}\n`;
  ensure(sha256(pathSet) === contract.releaseBoundary.releasePathSetSha256,
    "release_path_set_checksum_mismatch");
  return {
    ...result,
    baselineCommit: contract.releaseBoundary.baselineCommit,
    targetCommit: contract.releaseBoundary.targetCommit,
    targetTree: contract.releaseBoundary.targetTree,
    pathSetSha256: sha256(pathSet),
  };
}

function validateAutonomyAuthorization(authorization, request, contract) {
  const expectedKeys = [
    "schemaVersion", "mode", "approvedBy", "grantId", "approvalId", "nonce", "gate",
    "packageId", "scope", "actionClass", "riskTier", "builderAgentId", "baseCommit",
    "targetCommit", "targetTree", "diffSha256", "pathSetSha256", "contractSha256",
    "runnerSha256", "artifactSha256", "imageOrMigrationSha256", "composeSha256",
    "environmentFingerprintSha256", "productionIdentitySha256", "gateEvidenceSha256",
    "preflightSha256", "backupRestoreEvidenceSha256", "rollbackTarget",
    "observationContractSha256", "policySha256", "revocationEpoch", "issuedAt",
    "expiresAt", "maxExecutions", "packageAssertions",
  ];
  ensure(exactKeys(authorization, expectedKeys), "autonomy_authorization_keys_mismatch");
  ensure(authorization.schemaVersion === "market-radar-package-authorization.v1", "autonomy_authorization_schema_mismatch");
  ensure(authorization.mode === "g0_g8_standing_user_grant", "autonomy_authorization_mode_mismatch");
  ensure(authorization.approvedBy === "user_standing_grant", "autonomy_authorization_issuer_mismatch");
  ensure(authorization.grantId === AUTONOMY_GRANT_ID, "autonomy_grant_mismatch");
  ensure(authorization.gate === "G0", "autonomy_gate_mismatch");
  ensure(authorization.packageId === PACKAGE_ID && authorization.scope === PACKAGE_ID,
    "autonomy_package_mismatch");
  ensure(authorization.actionClass === AUTONOMY_ACTION_CLASS, "autonomy_action_class_mismatch");
  ensure(authorization.riskTier === AUTONOMY_RISK_TIER, "autonomy_risk_tier_mismatch");
  ensure(authorization.builderAgentId === AUTONOMY_BUILDER_AGENT_ID, "autonomy_builder_mismatch");
  ensure(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,180}$/.test(authorization.approvalId ?? ""),
    "autonomy_approval_id_invalid");
  ensure(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,180}$/.test(authorization.nonce ?? ""),
    "autonomy_nonce_invalid");
  for (const key of ["baseCommit", "targetCommit", "targetTree"]) {
    ensure(/^[0-9a-f]{40}$/.test(authorization[key] ?? ""), `autonomy_git_binding_invalid:${key}`);
  }
  for (const key of [
    "diffSha256", "pathSetSha256", "contractSha256", "runnerSha256", "artifactSha256",
    "imageOrMigrationSha256", "composeSha256", "environmentFingerprintSha256",
    "productionIdentitySha256", "gateEvidenceSha256", "preflightSha256",
    "backupRestoreEvidenceSha256", "observationContractSha256", "policySha256",
  ]) ensure(/^[0-9a-f]{64}$/.test(authorization[key] ?? ""), `autonomy_hash_binding_invalid:${key}`);
  ensure(authorization.baseCommit === request.runnerSourceParentCommit, "autonomy_runner_parent_mismatch");
  ensure(authorization.targetCommit === request.runnerSourceCommit, "autonomy_runner_commit_mismatch");
  ensure(authorization.targetTree === request.runnerSourceTree, "autonomy_runner_tree_mismatch");
  ensure(authorization.diffSha256 === request.runnerSourceDiffSha256, "autonomy_runner_diff_mismatch");
  ensure(authorization.pathSetSha256 === request.runnerSourcePathSetSha256,
    "autonomy_runner_path_set_mismatch");
  ensure(authorization.contractSha256 === request.contractSha256, "autonomy_contract_checksum_mismatch");
  ensure(authorization.runnerSha256 === request.runnerSha256, "autonomy_runner_checksum_mismatch");
  ensure(authorization.artifactSha256 === contract.artifact.sha256, "autonomy_artifact_checksum_mismatch");
  ensure(authorization.imageOrMigrationSha256 === sha256(`${request.webImageId}\n`),
    "autonomy_image_binding_mismatch");
  ensure(authorization.composeSha256 === request.targetComposeSha256, "autonomy_compose_binding_mismatch");
  ensure(authorization.environmentFingerprintSha256
    === sha256(`${request.baseEnvSha256}\n${request.productionEnvSha256}\n`),
  "autonomy_environment_binding_mismatch");
  ensure(authorization.productionIdentitySha256
    === sha256(`${request.identityOverrideSha256}\n${request.composeWrapperSha256}\n`),
  "autonomy_production_identity_binding_mismatch");
  ensure(authorization.gateEvidenceSha256 === request.gateEvidenceSha256,
    "autonomy_gate_evidence_mismatch");
  ensure(authorization.preflightSha256 === productionPreflightSha256(request),
    "autonomy_preflight_binding_mismatch");
  ensure(authorization.backupRestoreEvidenceSha256 === rollbackEvidenceSha256(request),
    "autonomy_rollback_evidence_binding_mismatch");
  ensure(authorization.rollbackTarget === `${BASELINE_COMMIT}:web`, "autonomy_rollback_target_mismatch");
  ensure(authorization.observationContractSha256
    === sha256(JSON.stringify({
      durationSeconds: contract.deployment.observationDurationSeconds,
      pollSeconds: contract.deployment.observationPollSeconds,
      continuousReadyFresh: true,
      candidateDormant: true,
    })), "autonomy_observation_contract_mismatch");
  ensure(authorization.policySha256 === request.policySha256, "autonomy_policy_checksum_mismatch");
  ensure(authorization.revocationEpoch === AUTONOMY_REVOCATION_EPOCH,
    "autonomy_revocation_epoch_mismatch");
  ensure(authorization.issuedAt === request.approvalIssuedAt, "autonomy_issued_at_mismatch");
  ensure(authorization.expiresAt === request.approvalExpiresAt, "autonomy_expires_at_mismatch");
  ensure(authorization.maxExecutions === 1, "autonomy_max_executions_mismatch");
  ensure(authorization.productionLeaseId === undefined && authorization.fencingToken === undefined,
    "autonomy_embeds_runtime_lease_identity");
  const assertions = {
    qualityThresholdChanged: false,
    scopeMatchesBlueprint: true,
    dynamicPreflightCurrent: true,
    requiredGatesPassed: true,
    rollbackVerified: true,
    productionWipAvailable: true,
    secretsPresentInEvidence: false,
    knownP0Open: false,
    pollutionCleanupManifestExact: true,
  };
  ensure(exactKeys(authorization.packageAssertions, Object.keys(assertions)),
    "autonomy_assertion_keys_mismatch");
  for (const [key, expected] of Object.entries(assertions)) {
    ensure(authorization.packageAssertions[key] === expected, `autonomy_assertion_failed:${key}`);
  }
}

export function validateApprovalRequest(request, contract, { now = new Date() } = {}) {
  const expectedKeys = [
    "approvalExpiresAt", "approvalIssuedAt", "approvalRef", "automaticRollbackAllowed",
    "autonomyAuthorization", "autonomyTrustRoot", "baseEnvSha256", "baselineCommit",
    "baselineComposeSha256",
    "buildAllowed", "candidateControlLifecycleStartAllowed", "candidateDatabaseUrlConfigurationAllowed",
    "candidateFeatureFlagEnablementAllowed", "candidateRuntimeMutationAllowed", "candidateWorkerStartAllowed",
    "codeActivationAllowed", "composeWrapperSha256", "contractSha256",
    "databaseMutationAllowed", "detachedHeadAfterSuccess", "environmentMutationAllowed",
    "evidenceDirectory", "execute", "gateEvidenceSha256", "identityOverrideSha256",
    "migrationAllowed", "observationDurationSeconds", "observationPollSeconds", "operator",
    "otherServiceRestartAllowed", "packageId", "policySha256", "productionEnvSha256",
    "productionRepositoryMutationAllowed", "redisMutationAllowed", "releaseArtifactSha256",
    "releaseDiffSha256", "releasePathSetSha256", "rollbackImageRetentionRequired",
    "rollbackWebImageRef", "runnerSha256", "runnerSourceCommit", "runnerSourceDiffSha256",
    "runnerSourceParentCommit", "runnerSourcePathSetSha256", "runnerSourceTree", "runnerUnitName",
    "services", "sessionIndependentExecutionRequired", "sourceFetchAllowed", "stagingDirectory",
    "targetCommit", "targetComposeSha256", "targetRemoteBranch", "targetTree", "temporaryArtifactCleanupRequired",
    "transportBundleSha256", "transportMethod", "webImageId",
  ];
  ensure(exactKeys(request, expectedKeys), "request_keys_mismatch");
  ensure(request.packageId === PACKAGE_ID, "request_package_mismatch");
  ensure(request.baselineCommit === contract.releaseBoundary.baselineCommit,
    "request_baseline_commit_mismatch");
  ensure(request.targetCommit === contract.releaseBoundary.targetCommit, "request_target_commit_mismatch");
  ensure(request.targetTree === contract.releaseBoundary.targetTree, "request_target_tree_mismatch");
  ensure(request.targetRemoteBranch === contract.releaseBoundary.targetRemoteBranch,
    "request_target_remote_branch_mismatch");
  ensure(request.releaseDiffSha256 === contract.releaseBoundary.releaseDiffSha256,
    "request_release_diff_checksum_mismatch");
  ensure(request.releasePathSetSha256 === contract.releaseBoundary.releasePathSetSha256,
    "request_release_path_set_checksum_mismatch");
  ensure(request.releaseArtifactSha256 === contract.artifact.sha256,
    "request_release_artifact_checksum_mismatch");
  ensure(request.targetComposeSha256 === TARGET_COMPOSE_SHA256,
    "request_target_compose_checksum_mismatch");
  ensure(JSON.stringify(request.services) === '["web"]', "request_services_mismatch");
  for (const key of [
    "contractSha256", "transportBundleSha256", "gateEvidenceSha256", "policySha256",
    "runnerSha256", "runnerSourceDiffSha256", "runnerSourcePathSetSha256", "baselineComposeSha256",
    "targetComposeSha256",
    "composeWrapperSha256", "baseEnvSha256", "productionEnvSha256", "identityOverrideSha256",
  ]) ensure(/^[0-9a-f]{64}$/.test(request[key] ?? ""), `request_checksum_invalid:${key}`);
  for (const key of ["runnerSourceCommit", "runnerSourceParentCommit", "runnerSourceTree"]) {
    ensure(/^[0-9a-f]{40}$/.test(request[key] ?? ""), `request_git_identity_invalid:${key}`);
  }
  ensure(/^sha256:[0-9a-f]{64}$/.test(request.webImageId ?? ""), "request_web_image_id_invalid");
  ensure(request.rollbackWebImageRef === rollbackImageRef(request.webImageId),
    "request_rollback_web_image_ref_mismatch");
  ensure(RUNNER_UNIT_NAME_PATTERN.test(request.runnerUnitName ?? ""), "request_runner_unit_name_invalid");
  ensure(STAGING_DIRECTORY_PATTERN.test(request.stagingDirectory ?? ""),
    "request_staging_directory_invalid");
  ensure(EVIDENCE_DIRECTORY_PATTERN.test(request.evidenceDirectory ?? ""),
    "request_evidence_directory_invalid");
  ensure(request.autonomyTrustRoot === AUTONOMY_TRUST_ROOT, "request_autonomy_trust_root_mismatch");
  ensure(request.transportMethod === "approved_orcaterm_bundle_upload", "request_transport_method_invalid");
  ensure(request.execute === true, "execute_must_be_true");
  ensure(request.automaticRollbackAllowed === true, "automatic_rollback_not_allowed");
  ensure(request.sourceFetchAllowed === true, "source_fetch_not_allowed");
  ensure(request.buildAllowed === true, "build_not_allowed");
  ensure(request.productionRepositoryMutationAllowed === true, "repository_transition_not_allowed");
  ensure(request.detachedHeadAfterSuccess === true, "detached_head_not_required");
  ensure(request.sessionIndependentExecutionRequired === true, "session_independent_execution_not_required");
  ensure(request.rollbackImageRetentionRequired === true, "rollback_image_retention_not_required");
  ensure(request.temporaryArtifactCleanupRequired === true, "temporary_artifact_cleanup_not_required");
  ensure(request.observationDurationSeconds === contract.deployment.observationDurationSeconds,
    "request_observation_duration_mismatch");
  ensure(request.observationPollSeconds === contract.deployment.observationPollSeconds,
    "request_observation_poll_mismatch");
  for (const key of [
    "candidateControlLifecycleStartAllowed", "candidateDatabaseUrlConfigurationAllowed",
    "candidateFeatureFlagEnablementAllowed", "candidateRuntimeMutationAllowed", "candidateWorkerStartAllowed",
    "codeActivationAllowed", "databaseMutationAllowed", "environmentMutationAllowed", "migrationAllowed",
    "otherServiceRestartAllowed", "redisMutationAllowed",
  ]) ensure(request[key] === false, `${key}_must_be_false`);
  ensure(typeof request.approvalRef === "string" && request.approvalRef.trim().length >= 8,
    "approval_ref_invalid");
  ensure(typeof request.operator === "string" && request.operator.trim().length >= 2,
    "operator_invalid");
  const issuedAt = parseTimestamp(request.approvalIssuedAt, "approval_issued_at_invalid");
  const expiresAt = parseTimestamp(request.approvalExpiresAt, "approval_expires_at_invalid");
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  ensure(expiresAt > issuedAt && expiresAt - issuedAt <= 90 * 60 * 1000,
    "approval_window_too_long");
  ensure(nowMs >= issuedAt && nowMs <= expiresAt, "approval_window_not_active");
  validateAutonomyAuthorization(request.autonomyAuthorization, request, contract);
  return request;
}

export async function validateIdentityOverrideFile(filePath, expectedSha256) {
  ensure(typeof filePath === "string" && isAbsolute(filePath), "identity_override_path_not_absolute");
  ensure(/^[0-9a-f]{64}$/.test(expectedSha256 ?? ""), "identity_override_checksum_invalid");
  let metadata;
  let source;
  try {
    metadata = await lstat(filePath);
    source = await readFile(filePath);
  } catch {
    throw new DormantDeployPolicyError("identity_override_unavailable");
  }
  ensure(metadata.isFile(), "identity_override_not_regular_file");
  ensure((metadata.mode & 0o777) === 0o600, "identity_override_permissions_not_0600");
  const actualSha256 = sha256(source);
  ensure(actualSha256 === expectedSha256, "identity_override_checksum_mismatch");
  return { path: filePath, sha256: actualSha256, permissions: "0600" };
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2
    && ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function parseDormantEnvironment(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) values[match[1]] = unquote(match[2]);
  }
  const invalidFlags = FEATURE_FLAGS.filter((key) => key in values && values[key].toLowerCase() !== "false");
  const configuredUrls = DATABASE_URLS.filter((key) => (values[key] ?? "").trim().length > 0);
  const release = (values.CANDIDATE_RUNTIME_RELEASE_ID ?? "disabled").toLowerCase();
  const workerExpected = (values.CANDIDATE_SHADOW_WORKER_EXPECTED ?? "false").toLowerCase();
  ensure(invalidFlags.length === 0, `candidate_feature_flag_not_false:${invalidFlags.join(",")}`);
  ensure(configuredUrls.length === 0, `candidate_database_url_configured:${configuredUrls.join(",")}`);
  ensure(release === "disabled", "candidate_runtime_release_not_disabled");
  ensure(workerExpected === "false", "candidate_shadow_worker_expected_not_false");
  return {
    candidateDatabaseUrlsConfigured: 0,
    candidateFeatureFlagsEnabled: 0,
    candidateRuntimeReleaseDisabled: true,
    candidateWorkerExpected: false,
  };
}

export async function inspectRunner(root = process.cwd()) {
  const [source, entrypoint, bundle] = await Promise.all([
    readFile(resolve(root, "scripts/production/candidate-dormant-deploy.sh"), "utf8"),
    readFile(resolve(root, "scripts/production/candidate-dormant-deploy-entrypoint.sh"), "utf8"),
    readFile(resolve(root, "scripts/production/candidate-dormant-deploy-bundle.mjs"), "utf8"),
  ]);
  const facts = {
    webOnlyBuild: /\$\{IDENTITY_COMPOSE\[@\]\} build web/.test(source),
    webOnlyForceRecreate: /\$\{IDENTITY_COMPOSE\[@\]\} up -d --no-deps --force-recreate web/.test(source),
    noMainMerge: !/git merge --ff-only/.test(source),
    detachedTarget: /checkout --detach/.test(source),
    leaseFenced: ["lease_acquire", "lease_consume", "lease_checkpoint", "lease_release"]
      .every((name) => source.includes(name)),
    containerNodeFallback: /CANDIDATE_DORMANT_DEPLOY_STDIN/.test(source)
      && /container_node/.test(source)
      && /--network none --read-only --cap-drop ALL/.test(source),
    rollbackSafetyLease: /lease_safety_checkpoint rollback/.test(source),
    rollbackRetention: /rollback-image-retention/.test(source)
      && /verify_rollback_image_retention/.test(source),
    transientSystemdUnit: /systemd-run/.test(entrypoint)
      && /Restart=no/.test(entrypoint)
      && /RuntimeMaxSec=5400/.test(entrypoint),
    noForegroundFallback: !/nohup/.test(entrypoint)
      && /unsupported dormant deploy entrypoint mode/.test(entrypoint),
    reproducibleBundle: /ustar\+gzip-n/.test(bundle)
      && /sourceCommit/.test(bundle)
      && /sourceTree/.test(bundle),
  };
  const violations = Object.entries(facts).filter(([, value]) => value !== true)
    .map(([key]) => `runner_guard_missing:${key}`);
  ensure(violations.length === 0, violations.join(","));
  return facts;
}

export async function validateLocalPreparation(root = process.cwd()) {
  const contract = await loadContract(root);
  const [artifact, release, runner] = await Promise.all([
    inspectArtifact(root, contract),
    inspectRelease(root, contract),
    inspectRunner(root),
  ]);
  return {
    schemaVersion: "wp-g0.2-shadow-capture-dormant-runtime-deploy-result.v2",
    status: "PASS_LOCAL_DORMANT_DEPLOY_STANDING_AUTHORITY_RUNNER_REFRESH",
    productionDecision: "BLOCKED_UNTIL_CURRENT_DYNAMIC_PREFLIGHT_AND_EXTERNAL_SINGLE_USE_APPROVAL",
    productionMutationAllowed: false,
    artifact,
    release,
    runner,
    nextRequiredAction: "commit_runner_run_full_gates_build_bound_bundle_and_dynamic_production_preflight",
  };
}

function parseArgs(argv) {
  const [command = "validate", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    ensure(key.startsWith("--"), "argument_invalid");
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
  } else if (command === "request") {
    const contract = options["contract-base64"]
      ? validateContract(JSON.parse(Buffer.from(options["contract-base64"], "base64").toString("utf8")))
      : await loadContract(root);
    const request = options["request-base64"]
      ? JSON.parse(Buffer.from(options["request-base64"], "base64").toString("utf8"))
      : JSON.parse(await readFile(resolve(options.request ?? ""), "utf8"));
    result = {
      ok: true,
      request: validateApprovalRequest(request, contract,
        options.now ? { now: new Date(options.now) } : {}),
    };
  } else if (command === "env") {
    const source = options["env-base64"]
      ? Buffer.from(options["env-base64"], "base64").toString("utf8")
      : await readFile(resolve(options["env-file"] ?? ""), "utf8");
    result = { ok: true, environment: parseDormantEnvironment(source) };
  } else if (command === "identity-override") {
    result = { ok: true, identityOverride: await validateIdentityOverrideFile(
      options.file ?? "", options.sha256 ?? "") };
  } else {
    throw new DormantDeployPolicyError("command_invalid");
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href
  || process.env.CANDIDATE_DORMANT_DEPLOY_STDIN === "true") {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, reason: error?.reason ?? "unexpected_error" })}\n`);
    process.exitCode = 1;
  });
}
