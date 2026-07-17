#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmod, cp, lstat, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const PACKAGE_ID =
  "WP-G0.2-SHADOW-VERIFY-CODE-AUTHORIZATION-PRODUCTION-RELEASE";
export const CONTRACT_PATH =
  "docs/governance/wp-g0-2-shadow-verify-code-authorization-production-release.v1.json";
export const BASELINE_COMMIT = "54837d03d0fb91b33cf9919bd25ab7aaad60dd7e";
export const TARGET_COMMIT = "eb48827b8b403452328b65dc4b415c3fc0ecf765";
export const TARGET_TREE = "a02f989b1be653d4524d1b6dd73995dabeb73f3d";
export const TARGET_BRANCH = "codex/wp-g0-2-shadow-verify-web-release";
export const RELEASE_DIFF_SHA256 =
  "85ca52281f50a41f86bf27be90d9beabe19e32c37421b9ab19a0057fb2b19113";
export const RELEASE_PATH_SET_SHA256 =
  "1184a4dff040f0aa918f4e5f77095721d8221eefdbc92930c05e53fcb62442e5";
export const TRUST_ROOT = "/home/ubuntu/.local/state/market-radar-autonomy";
export const PRODUCTION_ROOT = "/home/ubuntu/apps/chuan-market-radar";
export const ROLLBACK_REPOSITORY =
  "market-radar-rollback/wp-g0-2-shadow-verify-code";
export const SOURCE_DATE_EPOCH = 946_684_800;

const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);
const HASH = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const MIGRATION = /^candidate-episode-v1(?:-cycle-([1-9][0-9]{0,5}))?$/u;
const RELEASE = /^candidate-shadow-[a-z0-9][a-z0-9._-]{7,100}$/u;
const STAGING =
  /^\/home\/ubuntu\/\.cache\/market-radar-ops\/wp-g0-2-shadow-verify-release-[a-z0-9][a-z0-9._-]{7,80}$/u;
const EVIDENCE =
  /^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/wp-g0-2-shadow-verify-release-[a-z0-9][a-z0-9._-]{7,80}$/u;
const UNIT = /^market-radar-shadow-verify-release-[a-z0-9][a-z0-9-]{7,48}$/u;

export const RELEASE_DIFF_LINES = Object.freeze([
  "M\tsrc/lib/candidate-episode/canonical-read-model.test.ts",
  "M\tsrc/lib/candidate-episode/canonical-read-model.ts",
  "M\tsrc/lib/candidate-episode/canonical-read-route-adapter.test.ts",
]);

export const TRANSPORT_FILES = Object.freeze([
  CONTRACT_PATH,
  "scripts/governance/autonomy-policy.mjs",
  "scripts/governance/autonomy-production-lease-cli.mjs",
  "scripts/governance/autonomy-production-lease.mjs",
  "scripts/production/candidate-shadow-verify-release/bundle.mjs",
  "scripts/production/candidate-shadow-verify-release/production-entrypoint.sh",
  "scripts/production/candidate-shadow-verify-release/production-runner.sh",
]);

const AUTHORIZATION_KEYS = Object.freeze([
  "actionClass", "approvalId", "approvedBy", "artifactSha256",
  "backupRestoreEvidenceSha256", "baseCommit", "builderAgentId", "composeSha256",
  "contractSha256", "diffSha256", "environmentFingerprintSha256", "expiresAt",
  "gate", "gateEvidenceSha256", "grantId", "imageOrMigrationSha256", "issuedAt",
  "maxExecutions", "mode", "nonce", "observationContractSha256",
  "packageAssertions", "packageId", "pathSetSha256", "policySha256",
  "preflightSha256", "productionIdentitySha256", "revocationEpoch", "riskTier",
  "rollbackTarget", "runnerSha256", "schemaVersion", "scope", "targetCommit",
  "targetTree",
]);

const REQUEST_KEYS = Object.freeze([
  "approvalExpiresAt", "approvalIssuedAt", "approvalRef", "autonomyAuthorization",
  "autonomyTrustRoot", "baseEnvPath", "baseEnvSha256", "candidateAuthorityEpoch",
  "candidateMigrationId", "candidateReleaseId", "candidateWorkerContainerId",
  "candidateWorkerImageId", "composeSha256", "contractSha256", "currentWebImageId",
  "evidenceDirectory", "identityOverridePath", "identityOverrideSha256",
  "identityWrapperPath", "identityWrapperSha256", "lineageEvidencePath",
  "lineageEvidenceSha256", "operator", "packageId", "productionEnvPath",
  "productionEnvSha256", "productionRoot", "reconciliationEvidencePath",
  "reconciliationEvidenceSha256", "releaseBaselineCommit", "releaseDiffSha256",
  "releasePathSetSha256", "releaseTargetBranch", "releaseTargetCommit",
  "releaseTargetTree", "rollbackWebImageRef", "runnerArtifactSha256",
  "runnerSourceCommit", "runnerSourceDiffSha256", "runnerSourceParentCommit",
  "runnerSourcePathSetSha256", "runnerSourceTree", "runnerUnitName", "services",
  "sessionIndependentExecutionRequired", "stagingDirectory",
  "temporaryArtifactCleanupRequired", "transportBundleSha256", "transportMethod",
]);

const RUNTIME_KEYS = Object.freeze([
  "baseEnvPath", "baseEnvSha256", "candidateAuthorityEpoch", "candidateMigrationId",
  "candidateReleaseId", "candidateWorkerContainerId", "candidateWorkerImageId",
  "composeSha256", "currentWebImageId", "identityOverridePath",
  "identityOverrideSha256", "identityWrapperPath", "identityWrapperSha256",
  "lineageEvidencePath", "lineageEvidenceSha256", "productionEnvPath",
  "productionEnvSha256", "reconciliationEvidencePath", "reconciliationEvidenceSha256",
]);

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function timestamp(value, reason) {
  const parsed = Date.parse(value);
  ensure(Number.isFinite(parsed), reason);
  return parsed;
}

function cycle(value) {
  const match = MIGRATION.exec(value ?? "");
  ensure(match, "migration_id_invalid");
  const number = match[1] ? Number(match[1]) : 1;
  ensure(number !== 1 || value === "candidate-episode-v1", "cycle_one_alias_forbidden");
  return number;
}

async function git(root, args) {
  return (await execFileAsync("git", args, {
    cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  })).stdout.trimEnd();
}

async function artifact(root, files) {
  ensure(Array.isArray(files) && files.length > 0 && new Set(files).size === files.length,
    "artifact_files_invalid");
  const fileSha256 = {};
  for (const file of [...files].sort()) {
    ensure(typeof file === "string" && !file.startsWith("/") && !file.includes(".."),
      "artifact_path_invalid");
    const metadata = await lstat(resolve(root, file));
    ensure(metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1,
      `artifact_not_regular:${file}`);
    ensure(metadata.size > 0 && metadata.size <= 2 * 1024 * 1024,
      `artifact_size_invalid:${file}`);
    fileSha256[file] = sha256(await readFile(resolve(root, file)));
  }
  return {
    fileCount: Object.keys(fileSha256).length,
    fileSha256,
    sha256: sha256(JSON.stringify(fileSha256)),
  };
}

export function validateContract(contract) {
  ensure(contract?.schemaVersion
    === "wp-g0.2-shadow-verify-code-authorization-production-release.v1",
  "contract_schema_invalid");
  ensure(contract.packageId === PACKAGE_ID && contract.gate === "G0"
      && contract.actionClass === "reversible_service_release"
      && contract.riskTier === "R1_REVERSIBLE_RUNTIME", "contract_identity_invalid");
  ensure(contract.status
      === "local_preparation_pass_production_blocked_by_lineage_and_reconciliation",
  "contract_status_invalid");
  ensure(contract.productionAuthorization === false && contract.productionExecuted === false,
    "contract_production_truth_invalid");
  const release = contract.releaseBoundary ?? {};
  ensure(release.baselineCommit === BASELINE_COMMIT && release.targetCommit === TARGET_COMMIT
      && release.targetTree === TARGET_TREE && release.targetRemoteBranch === TARGET_BRANCH
      && release.releaseDiffFileCount === 3
      && release.releaseDiffSha256 === RELEASE_DIFF_SHA256
      && release.releasePathSetSha256 === RELEASE_PATH_SET_SHA256
      && JSON.stringify(release.releaseDiffLines) === JSON.stringify(RELEASE_DIFF_LINES)
      && release.cleanDetachedBaselineRequired === true
      && release.cleanDetachedTargetRequired === true
      && release.targetMustBeSingleParentOfBaseline === true
      && release.releaseTargetRefreshOnBaselineDrift === true, "release_boundary_invalid");
  const prerequisites = contract.prerequisites ?? {};
  ensure(prerequisites.lineageStatus
      === "PASS_FRESH_VERIFICATION_CYCLE_READY_FOR_RECONCILIATION"
      && prerequisites.reconciliationStatus
      === "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL"
      && prerequisites.minimumComparedWrites === 10_000
      && prerequisites.comparisonDifferences === 0
      && prerequisites.duplicateOutboxMappings === 0
      && prerequisites.duplicateEventMappings === 0
      && prerequisites.unresolvedOutbox === 0
      && prerequisites.currentPhase === "shadow_capture"
      && prerequisites.currentWriteFrozen === false
      && prerequisites.candidateWorker === "running_healthy_identity_unchanged"
      && prerequisites.productionHealth === "ready_fresh"
      && prerequisites.evidenceMustBePrivateRegularFiles === true
      && prerequisites.evidenceContentHashesRequired === true
      && prerequisites.newExactRequestRequired === true, "prerequisites_invalid");
  const execution = contract.execution ?? {};
  ensure(execution.productionRoot === PRODUCTION_ROOT
      && JSON.stringify(execution.serviceAllowlist) === '["web"]'
      && execution.buildCommand === "docker compose build web"
      && execution.recreateCommand
      === "docker compose up -d --no-deps --no-build --force-recreate web"
      && execution.runner === "transient_systemd_unit" && execution.restart === "no"
      && execution.runtimeMaxSeconds === 5_400 && execution.sessionIndependent === true
      && execution.maximumApprovalWindowMinutes === 90
      && execution.observationSeconds === 1_800
      && execution.observationPollSeconds === 30
      && execution.minimumObservationSamples === 61 && execution.webOnly === true,
  "execution_boundary_invalid");
  for (const key of [
    "candidateWorkerMutationAllowed", "scannerWorkerMutationAllowed",
    "otherServiceMutationAllowed", "databaseMutationAllowed", "redisMutationAllowed",
    "environmentMutationAllowed", "composeMutationAllowed", "phaseTransitionAllowed",
    "manifestMutationAllowed", "migrationAllowed", "featureFlagMutationAllowed",
  ]) ensure(execution[key] === false, `execution_mutation_allowed:${key}`);
  const rollback = contract.rollback ?? {};
  ensure(rollback.automaticRollbackRequired === true
      && rollback.restoreBaselineGitTarget === true && rollback.restoreWebImage === true
      && rollback.retainImageBeforeMutation === true
      && rollback.verifyRetentionBeforeMutation === true
      && rollback.retainAfterSuccess === true
      && rollback.cleanupRequiresSeparatePackage === true
      && rollback.retentionRepository === ROLLBACK_REPOSITORY, "rollback_boundary_invalid");
  const autonomy = contract.autonomy ?? {};
  ensure(autonomy.grantId === "MR-G0-G8-USER-STANDING-GRANT-20260714-034826"
      && autonomy.revocationEpoch === 2 && autonomy.builderAgentId === "codex-primary"
      && autonomy.trustRoot === TRUST_ROOT
      && autonomy.externalProductionLeaseRequired === true
      && autonomy.singleUseApprovalRequired === true
      && autonomy.fencingTokenRequired === true
      && autonomy.leaseCheckBeforeEveryMutation === true
      && autonomy.automaticRollbackAllowed === true, "autonomy_boundary_invalid");
  ensure(contract.runnerArtifact?.fileCount === 3
      && contract.runnerArtifact?.files?.length === 3
      && HASH.test(contract.runnerArtifact?.sha256 ?? ""), "runner_artifact_contract_invalid");
  for (const item of [
    "database_ddl_or_dml", "redis_mutation", "environment_mutation", "compose_mutation",
    "candidate_worker_mutation", "scanner_worker_mutation", "other_service_mutation",
    "phase_transition", "read_authority_manifest_write", "migration",
    "feature_flag_change", "canonical_cutover", "production_ranking_change",
    "future_outcome_input", "rr_threshold_change", "formal_backtest",
  ]) ensure(contract.forbidden?.includes(item), `forbidden_boundary_missing:${item}`);
  return contract;
}

export async function validateLocalPreparation(root = process.cwd()) {
  const contract = validateContract(JSON.parse(await readFile(resolve(root, CONTRACT_PATH))));
  const runnerArtifact = await artifact(root, contract.runnerArtifact.files);
  ensure(runnerArtifact.sha256 === contract.runnerArtifact.sha256,
    "runner_artifact_checksum_mismatch");
  const [targetType, targetTree, parents, diff] = await Promise.all([
    git(root, ["cat-file", "-t", TARGET_COMMIT]),
    git(root, ["rev-parse", `${TARGET_COMMIT}^{tree}`]),
    git(root, ["rev-list", "--parents", "-n", "1", TARGET_COMMIT]),
    git(root, ["diff-tree", "--no-commit-id", "--name-status", "-r", TARGET_COMMIT]),
  ]);
  ensure(targetType === "commit" && targetTree === TARGET_TREE
      && parents === `${TARGET_COMMIT} ${BASELINE_COMMIT}`, "release_target_identity_invalid");
  const lines = diff.split(/\r?\n/u).filter(Boolean);
  ensure(JSON.stringify(lines) === JSON.stringify(RELEASE_DIFF_LINES)
      && sha256(`${lines.join("\n")}\n`) === RELEASE_DIFF_SHA256,
  "release_diff_identity_invalid");
  const pathSet = `${lines.map((line) => line.split("\t")[1]).sort().join("\n")}\n`;
  ensure(sha256(pathSet) === RELEASE_PATH_SET_SHA256, "release_path_set_invalid");
  return {
    status: "PASS_LOCAL_SHADOW_VERIFY_CODE_RELEASE_PREPARATION",
    packageId: PACKAGE_ID,
    runnerArtifact,
    release: { baselineCommit: BASELINE_COMMIT, targetCommit: TARGET_COMMIT, targetTree },
    productionExecuted: false,
  };
}

function validateLineage(lineage) {
  ensure(lineage?.schemaVersion === "candidate-multi-cycle-lineage-evidence.v1"
      && lineage.status === "PASS_FRESH_VERIFICATION_CYCLE_READY_FOR_RECONCILIATION",
  "lineage_status_invalid");
  ensure(Number.isSafeInteger(lineage.completedWrites) && lineage.completedWrites >= 10_000
      && lineage.unresolvedOutbox === 0 && lineage.thresholdsChanged === false
      && lineage.productionReconciliationExecuted === false
      && lineage.shadowVerifyStarted === false
      && lineage.canonicalAuthorityChanged === false && lineage.g0Completed === false,
  "lineage_truth_invalid");
  ensure(Array.isArray(lineage.sourceReleaseWindows)
      && lineage.sourceReleaseWindows.length >= 2, "lineage_windows_invalid");
  const releases = new Set();
  for (const [index, window] of lineage.sourceReleaseWindows.entries()) {
    ensure(cycle(window.migrationId) === index + 1 && RELEASE.test(window.releaseId ?? "")
        && !releases.has(window.releaseId)
        && Number.isSafeInteger(window.authorityEpoch) && window.authorityEpoch >= 1
        && window.authorityEpoch % 2 === 1
        && timestamp(window.deadlineAt, "lineage_deadline_invalid")
        - timestamp(window.startedAt, "lineage_start_invalid") === 72 * 60 * 60_000,
    `lineage_window_invalid:${index}`);
    releases.add(window.releaseId);
  }
  const current = lineage.sourceReleaseWindows.at(-1);
  ensure(lineage.currentMigrationId === current.migrationId
      && lineage.currentReleaseId === current.releaseId
      && lineage.currentAuthorityEpoch === current.authorityEpoch
      && lineage.freshCycleStartedAt === current.startedAt, "lineage_current_identity_invalid");
  return lineage;
}

function validateReconciliation(reconciliation, lineage) {
  ensure(reconciliation?.schemaVersion === "candidate-shadow-reconciliation-evidence.v1"
      && reconciliation.status
      === "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL",
  "reconciliation_status_invalid");
  ensure(reconciliation.automaticPhaseAdvance === false
      && reconciliation.phaseTransitionExecuted === false
      && reconciliation.productionRankingInputsUsed === false
      && reconciliation.futureOutcomeInputsUsed === false
      && reconciliation.databaseIdentity?.currentRole === "candidate_audit_role"
      && reconciliation.databaseIdentity?.transactionReadOnly === true
      && reconciliation.comparedWrites >= 10_000
      && reconciliation.comparisonDifferences === 0
      && reconciliation.duplicateOutboxMappings === 0
      && reconciliation.duplicateEventMappings === 0
      && reconciliation.sourceReleaseCount === lineage.sourceReleaseWindows.length
      && reconciliation.verificationMigrationId === lineage.currentMigrationId
      && /^sha256:[0-9a-f]{64}$/u.test(reconciliation.evidenceHash ?? "")
      && Array.isArray(reconciliation.violations) && reconciliation.violations.length === 0
      && Array.isArray(reconciliation.differenceSample)
      && reconciliation.differenceSample.length === 0, "reconciliation_truth_invalid");
  return reconciliation;
}

async function privateEvidence(path, expectedSha256, kind, evidenceRoot) {
  ensure(typeof path === "string" && path.startsWith(`${evidenceRoot}/`),
    `${kind}_path_invalid`);
  ensure(HASH.test(expectedSha256 ?? ""), `${kind}_hash_invalid`);
  const [metadata, linkMetadata, bytes] = await Promise.all([
    stat(path), lstat(path), readFile(path),
  ]);
  ensure(metadata.isFile() && linkMetadata.isFile() && !linkMetadata.isSymbolicLink()
      && metadata.nlink === 1 && (metadata.mode & 0o077) === 0
      && metadata.size > 0 && metadata.size <= 64 * 1024 * 1024,
  `${kind}_file_boundary_invalid`);
  ensure(sha256(bytes) === expectedSha256, `${kind}_content_hash_mismatch`);
  return JSON.parse(bytes);
}

function validateAuthorization(authorization, request, manifest) {
  ensure(exactKeys(authorization, AUTHORIZATION_KEYS), "authorization_shape_invalid");
  ensure(authorization.schemaVersion === "market-radar-package-authorization.v1"
      && authorization.mode === "g0_g8_standing_user_grant"
      && authorization.approvedBy === "user_standing_grant"
      && authorization.grantId === "MR-G0-G8-USER-STANDING-GRANT-20260714-034826"
      && authorization.packageId === PACKAGE_ID && authorization.scope === PACKAGE_ID
      && authorization.gate === "G0" && authorization.actionClass === "reversible_service_release"
      && authorization.riskTier === "R1_REVERSIBLE_RUNTIME"
      && authorization.builderAgentId === "codex-primary"
      && authorization.baseCommit === BASELINE_COMMIT
      && authorization.targetCommit === TARGET_COMMIT && authorization.targetTree === TARGET_TREE
      && authorization.diffSha256 === RELEASE_DIFF_SHA256
      && authorization.pathSetSha256 === RELEASE_PATH_SET_SHA256
      && authorization.contractSha256 === request.contractSha256
      && authorization.runnerSha256 === request.runnerArtifactSha256
      && authorization.artifactSha256 === manifest.transportArtifactSha256
      && authorization.composeSha256 === request.composeSha256
      && authorization.revocationEpoch === 2 && authorization.maxExecutions === 1
      && authorization.rollbackTarget === `${BASELINE_COMMIT}:web`
      && authorization.policySha256 === manifest.policySha256
      && authorization.issuedAt === request.approvalIssuedAt
      && authorization.expiresAt === request.approvalExpiresAt
      && authorization.imageOrMigrationSha256 === sha256(`${TARGET_COMMIT}\n`)
      && authorization.environmentFingerprintSha256
      === sha256(`${request.baseEnvSha256}\n${request.productionEnvSha256}\n`)
      && authorization.productionIdentitySha256
      === sha256(`${request.identityOverrideSha256}\n${request.identityWrapperSha256}\n`)
      && authorization.gateEvidenceSha256
      === sha256(`${request.lineageEvidenceSha256}\n${request.reconciliationEvidenceSha256}\n`)
      && authorization.backupRestoreEvidenceSha256
      === sha256(`${request.currentWebImageId}\n${request.rollbackWebImageRef}\n${BASELINE_COMMIT}\n`)
      && authorization.observationContractSha256 === sha256(canonicalJson({
        durationSeconds: 1_800,
        pollSeconds: 30,
        minimumSamples: 61,
        continuousReadyFresh: true,
        endpointFailClosed503: true,
        candidateWorkerIdentityUnchanged: true,
      })),
  "authorization_binding_invalid");
  const preflight = {
    baseEnvSha256: request.baseEnvSha256,
    candidateAuthorityEpoch: request.candidateAuthorityEpoch,
    candidateMigrationId: request.candidateMigrationId,
    candidateReleaseId: request.candidateReleaseId,
    candidateWorkerContainerId: request.candidateWorkerContainerId,
    candidateWorkerImageId: request.candidateWorkerImageId,
    composeSha256: request.composeSha256,
    currentWebImageId: request.currentWebImageId,
    identityOverrideSha256: request.identityOverrideSha256,
    identityWrapperSha256: request.identityWrapperSha256,
    lineageEvidenceSha256: request.lineageEvidenceSha256,
    productionEnvSha256: request.productionEnvSha256,
    reconciliationEvidenceSha256: request.reconciliationEvidenceSha256,
  };
  ensure(authorization.preflightSha256 === sha256(canonicalJson(preflight)),
    "authorization_preflight_binding_invalid");
  ensure(exactKeys(authorization.packageAssertions, [
    "automaticRollback", "databaseMutation", "dynamicPreflightCurrent", "knownP0Open",
    "phaseTransition", "pollutionCleanupManifestExact", "productionWipAvailable",
    "qualityThresholdChanged", "requiredGatesPassed", "scopeMatchesBlueprint",
    "secretsPresentInEvidence", "webOnly", "workerMutation",
  ]) && authorization.packageAssertions.webOnly === true
      && authorization.packageAssertions.automaticRollback === true
      && authorization.packageAssertions.databaseMutation === false
      && authorization.packageAssertions.workerMutation === false
      && authorization.packageAssertions.phaseTransition === false
      && authorization.packageAssertions.dynamicPreflightCurrent === true
      && authorization.packageAssertions.knownP0Open === false
      && authorization.packageAssertions.pollutionCleanupManifestExact === true
      && authorization.packageAssertions.productionWipAvailable === true
      && authorization.packageAssertions.qualityThresholdChanged === false
      && authorization.packageAssertions.requiredGatesPassed === true
      && authorization.packageAssertions.scopeMatchesBlueprint === true
      && authorization.packageAssertions.secretsPresentInEvidence === false,
  "authorization_assertions_invalid");
  for (const key of ["approvalId", "nonce"]) {
    ensure(typeof authorization[key] === "string" && authorization[key].length >= 8,
      `authorization_field_invalid:${key}`);
  }
  for (const key of [
    "imageOrMigrationSha256", "environmentFingerprintSha256",
    "productionIdentitySha256", "gateEvidenceSha256", "preflightSha256",
    "backupRestoreEvidenceSha256", "observationContractSha256", "policySha256",
  ]) ensure(HASH.test(authorization[key] ?? ""),
    `authorization_field_invalid:${key}`);
}

export async function verifyStagedTransport(root, manifest) {
  const expectedKeys = [
    "archiveFormat", "containsSecrets", "contractSha256", "externalBundleSha256",
    "fileSha256", "files", "packageId", "policySha256", "releaseBaselineCommit",
    "releaseDiffSha256", "releasePathSetSha256", "releaseTargetCommit",
    "releaseTargetTree", "reproducibleArchive", "runnerArtifactSha256", "schemaVersion",
    "services", "sessionIndependentExecutionRequired", "sourceCommit", "sourceDateEpoch",
    "sourceDiffSha256", "sourceParentCommit", "sourcePathSetSha256", "sourceTree",
    "temporaryArtifactCleanupRequired", "transportArtifactSha256",
  ];
  ensure(exactKeys(manifest, expectedKeys), "transport_manifest_shape_invalid");
  ensure(manifest.schemaVersion === "wp-g0.2-shadow-verify-code-release-transport.v1"
      && manifest.packageId === PACKAGE_ID
      && manifest.releaseBaselineCommit === BASELINE_COMMIT
      && manifest.releaseTargetCommit === TARGET_COMMIT
      && manifest.releaseTargetTree === TARGET_TREE
      && manifest.releaseDiffSha256 === RELEASE_DIFF_SHA256
      && manifest.releasePathSetSha256 === RELEASE_PATH_SET_SHA256
      && manifest.externalBundleSha256 === "bound_after_archive_creation"
      && manifest.sourceDateEpoch === SOURCE_DATE_EPOCH
      && manifest.archiveFormat === "ustar+gzip-n"
      && manifest.reproducibleArchive === true && manifest.containsSecrets === false
      && JSON.stringify(manifest.services) === '["web"]'
      && manifest.sessionIndependentExecutionRequired === true
      && manifest.temporaryArtifactCleanupRequired === true
      && JSON.stringify(manifest.files) === JSON.stringify([...TRANSPORT_FILES].sort()),
  "transport_manifest_boundary_invalid");
  for (const key of ["sourceCommit", "sourceTree", "sourceParentCommit"]) {
    ensure(COMMIT.test(manifest[key] ?? ""), `transport_commit_invalid:${key}`);
  }
  for (const key of [
    "sourceDiffSha256", "sourcePathSetSha256", "contractSha256",
    "runnerArtifactSha256", "transportArtifactSha256", "policySha256",
  ]) ensure(HASH.test(manifest[key] ?? ""), `transport_hash_invalid:${key}`);
  const transport = await artifact(root, TRANSPORT_FILES);
  ensure(transport.sha256 === manifest.transportArtifactSha256,
    "transport_artifact_checksum_mismatch");
  for (const file of TRANSPORT_FILES) {
    ensure(transport.fileSha256[file] === manifest.fileSha256?.[file],
      `transport_file_checksum_mismatch:${file}`);
  }
  ensure(manifest.contractSha256 === sha256(await readFile(resolve(root, CONTRACT_PATH)))
      && manifest.policySha256
      === transport.fileSha256["scripts/governance/autonomy-policy.mjs"],
  "transport_contract_or_policy_mismatch");
  const contract = validateContract(JSON.parse(await readFile(resolve(root, CONTRACT_PATH))));
  const runnerArtifact = await artifact(root, contract.runnerArtifact.files);
  ensure(runnerArtifact.sha256 === contract.runnerArtifact.sha256
      && runnerArtifact.sha256 === manifest.runnerArtifactSha256,
  "transport_runner_artifact_mismatch");
  return { contract, transport };
}

export async function validateApprovalRequest({
  manifest,
  request,
  now = new Date(),
  evidenceRoot = "/home/ubuntu/.cache/market-radar-ops/evidence",
}) {
  ensure(exactKeys(request, REQUEST_KEYS), "request_shape_invalid");
  ensure(request.packageId === PACKAGE_ID && request.productionRoot === PRODUCTION_ROOT
      && request.releaseBaselineCommit === BASELINE_COMMIT
      && request.releaseTargetCommit === TARGET_COMMIT
      && request.releaseTargetTree === TARGET_TREE
      && request.releaseTargetBranch === TARGET_BRANCH
      && request.releaseDiffSha256 === RELEASE_DIFF_SHA256
      && request.releasePathSetSha256 === RELEASE_PATH_SET_SHA256,
  "request_release_binding_invalid");
  ensure(COMMIT.test(request.runnerSourceParentCommit ?? "")
      && COMMIT.test(request.runnerSourceCommit ?? "")
      && COMMIT.test(request.runnerSourceTree ?? "")
      && HASH.test(request.runnerSourceDiffSha256 ?? "")
      && HASH.test(request.runnerSourcePathSetSha256 ?? ""), "request_source_identity_invalid");
  ensure(request.runnerSourceCommit === manifest.sourceCommit
      && request.runnerSourceTree === manifest.sourceTree
      && request.runnerSourceParentCommit === manifest.sourceParentCommit
      && request.runnerSourceDiffSha256 === manifest.sourceDiffSha256
      && request.runnerSourcePathSetSha256 === manifest.sourcePathSetSha256,
  "request_transport_source_mismatch");
  ensure(request.runnerArtifactSha256 === manifest.runnerArtifactSha256
      && request.contractSha256 === manifest.contractSha256
      && manifest.externalBundleSha256 === "bound_after_archive_creation"
      && HASH.test(request.transportBundleSha256 ?? "")
      && request.transportMethod === "approved_orcaterm_bundle_upload",
  "request_transport_binding_invalid");
  ensure(STAGING.test(request.stagingDirectory ?? "")
      && EVIDENCE.test(request.evidenceDirectory ?? "")
      && UNIT.test(request.runnerUnitName ?? "")
      && request.sessionIndependentExecutionRequired === true
      && request.temporaryArtifactCleanupRequired === true
      && JSON.stringify(request.services) === '["web"]', "request_execution_boundary_invalid");
  ensure(request.baseEnvPath === `${PRODUCTION_ROOT}/.env`
      && request.productionEnvPath === `${PRODUCTION_ROOT}/.env.production`
      && request.identityOverridePath.startsWith("/var/lib/market-radar-ops/identity/")
      && request.identityWrapperPath.startsWith("/var/lib/market-radar-ops/identity/"),
  "request_identity_path_invalid");
  for (const key of [
    "baseEnvSha256", "productionEnvSha256", "identityOverrideSha256",
    "identityWrapperSha256", "composeSha256", "currentWebImageId",
    "candidateWorkerImageId", "lineageEvidenceSha256", "reconciliationEvidenceSha256",
    "rollbackWebImageRef",
  ]) ensure(typeof request[key] === "string" && request[key].length >= 16,
    `request_runtime_identity_invalid:${key}`);
  ensure(/^sha256:[0-9a-f]{64}$/u.test(request.currentWebImageId)
      && /^sha256:[0-9a-f]{64}$/u.test(request.candidateWorkerImageId)
      && /^market-radar-rollback\/wp-g0-2-shadow-verify-code:web-[0-9a-f]{16}$/u
        .test(request.rollbackWebImageRef), "request_image_identity_invalid");
  ensure(/^[a-f0-9]{12,64}$/u.test(request.candidateWorkerContainerId ?? "")
      && RELEASE.test(request.candidateReleaseId ?? "")
      && cycle(request.candidateMigrationId) >= 1
      && Number.isSafeInteger(request.candidateAuthorityEpoch)
      && request.candidateAuthorityEpoch >= 1 && request.candidateAuthorityEpoch % 2 === 1,
  "request_candidate_identity_invalid");
  const issuedAt = timestamp(request.approvalIssuedAt, "request_issued_at_invalid");
  const expiresAt = timestamp(request.approvalExpiresAt, "request_expires_at_invalid");
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  ensure(expiresAt > issuedAt && expiresAt - issuedAt <= 90 * 60_000
      && nowMs >= issuedAt && nowMs < expiresAt, "request_approval_window_invalid");
  ensure(typeof request.operator === "string" && request.operator.length >= 2
      && /^[A-Za-z0-9._:/-]{8,160}$/u.test(request.approvalRef ?? ""),
  "request_operator_invalid");
  validateAuthorization(request.autonomyAuthorization, request, manifest);
  const [lineage, reconciliation] = await Promise.all([
    privateEvidence(request.lineageEvidencePath, request.lineageEvidenceSha256,
      "lineage", evidenceRoot),
    privateEvidence(request.reconciliationEvidencePath,
      request.reconciliationEvidenceSha256, "reconciliation", evidenceRoot),
  ]);
  validateLineage(lineage);
  validateReconciliation(reconciliation, lineage);
  ensure(request.candidateMigrationId === lineage.currentMigrationId
      && request.candidateReleaseId === lineage.currentReleaseId
      && request.candidateAuthorityEpoch === lineage.currentAuthorityEpoch,
  "request_candidate_lineage_mismatch");
  return { status: "PASS_SHADOW_VERIFY_CODE_RELEASE_REQUEST", lineage, reconciliation };
}

export async function currentSourceIdentity(root) {
  const [sourceCommit, sourceTree, sourceParentCommit, diff, pathSet, status] = await Promise.all([
    git(root, ["rev-parse", "HEAD"]),
    git(root, ["rev-parse", "HEAD^{tree}"]),
    git(root, ["rev-parse", "HEAD^"]),
    git(root, ["diff-tree", "--no-commit-id", "--name-status", "-r", "HEAD"]),
    git(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]),
    git(root, ["status", "--porcelain"]),
  ]);
  ensure(status === "", "source_worktree_dirty");
  return {
    sourceCommit, sourceTree, sourceParentCommit,
    sourceDiffSha256: sha256(`${diff}\n`),
    sourcePathSetSha256: sha256(`${pathSet.split(/\r?\n/u).filter(Boolean).sort().join("\n")}\n`),
  };
}

export function createProductionExecutionRequest({
  manifest, bundleSha256, runtime, now = new Date(), nonce = randomUUID(),
}) {
  ensure(exactKeys(runtime, RUNTIME_KEYS), "runtime_preflight_shape_invalid");
  ensure(HASH.test(bundleSha256 ?? ""), "transport_bundle_hash_invalid");
  const issuedAt = new Date(now);
  ensure(Number.isFinite(issuedAt.getTime()), "request_now_invalid");
  const expiresAt = new Date(issuedAt.getTime() + 89 * 60_000);
  const suffix = `${manifest.sourceCommit.slice(0, 12)}-${nonce.replaceAll("-", "").slice(0, 8)}`;
  const request = {
    packageId: PACKAGE_ID,
    productionRoot: PRODUCTION_ROOT,
    releaseBaselineCommit: BASELINE_COMMIT,
    releaseTargetCommit: TARGET_COMMIT,
    releaseTargetTree: TARGET_TREE,
    releaseTargetBranch: TARGET_BRANCH,
    releaseDiffSha256: RELEASE_DIFF_SHA256,
    releasePathSetSha256: RELEASE_PATH_SET_SHA256,
    runnerSourceCommit: manifest.sourceCommit,
    runnerSourceTree: manifest.sourceTree,
    runnerSourceParentCommit: manifest.sourceParentCommit,
    runnerSourceDiffSha256: manifest.sourceDiffSha256,
    runnerSourcePathSetSha256: manifest.sourcePathSetSha256,
    runnerArtifactSha256: manifest.runnerArtifactSha256,
    contractSha256: manifest.contractSha256,
    transportMethod: "approved_orcaterm_bundle_upload",
    transportBundleSha256: bundleSha256,
    stagingDirectory:
      `/home/ubuntu/.cache/market-radar-ops/wp-g0-2-shadow-verify-release-${suffix}`,
    evidenceDirectory:
      `/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-shadow-verify-release-${suffix}`,
    runnerUnitName:
      `market-radar-shadow-verify-release-${manifest.sourceCommit.slice(0, 7)}-${nonce.replaceAll("-", "").slice(0, 8)}`,
    autonomyTrustRoot: TRUST_ROOT,
    services: ["web"],
    sessionIndependentExecutionRequired: true,
    temporaryArtifactCleanupRequired: true,
    rollbackWebImageRef: rollbackImageRef(runtime.currentWebImageId),
    operator: "codex-primary",
    approvalRef: `MR-G0-SHADOW-VERIFY-WEB/${manifest.sourceCommit.slice(0, 12)}/${nonce.slice(0, 8)}`,
    approvalIssuedAt: issuedAt.toISOString(),
    approvalExpiresAt: expiresAt.toISOString(),
    autonomyAuthorization: null,
    ...runtime,
  };
  const preflight = {
    baseEnvSha256: runtime.baseEnvSha256,
    candidateAuthorityEpoch: runtime.candidateAuthorityEpoch,
    candidateMigrationId: runtime.candidateMigrationId,
    candidateReleaseId: runtime.candidateReleaseId,
    candidateWorkerContainerId: runtime.candidateWorkerContainerId,
    candidateWorkerImageId: runtime.candidateWorkerImageId,
    composeSha256: runtime.composeSha256,
    currentWebImageId: runtime.currentWebImageId,
    identityOverrideSha256: runtime.identityOverrideSha256,
    identityWrapperSha256: runtime.identityWrapperSha256,
    lineageEvidenceSha256: runtime.lineageEvidenceSha256,
    productionEnvSha256: runtime.productionEnvSha256,
    reconciliationEvidenceSha256: runtime.reconciliationEvidenceSha256,
  };
  request.autonomyAuthorization = {
    schemaVersion: "market-radar-package-authorization.v1",
    mode: "g0_g8_standing_user_grant",
    approvedBy: "user_standing_grant",
    grantId: "MR-G0-G8-USER-STANDING-GRANT-20260714-034826",
    approvalId: `MR-G0-SHADOW-VERIFY-WEB-${manifest.sourceCommit.slice(0, 12)}-${nonce}`,
    nonce,
    gate: "G0",
    packageId: PACKAGE_ID,
    scope: PACKAGE_ID,
    actionClass: "reversible_service_release",
    riskTier: "R1_REVERSIBLE_RUNTIME",
    builderAgentId: "codex-primary",
    baseCommit: BASELINE_COMMIT,
    targetCommit: TARGET_COMMIT,
    targetTree: TARGET_TREE,
    diffSha256: RELEASE_DIFF_SHA256,
    pathSetSha256: RELEASE_PATH_SET_SHA256,
    contractSha256: manifest.contractSha256,
    runnerSha256: manifest.runnerArtifactSha256,
    artifactSha256: manifest.transportArtifactSha256,
    imageOrMigrationSha256: sha256(`${TARGET_COMMIT}\n`),
    composeSha256: runtime.composeSha256,
    environmentFingerprintSha256:
      sha256(`${runtime.baseEnvSha256}\n${runtime.productionEnvSha256}\n`),
    productionIdentitySha256:
      sha256(`${runtime.identityOverrideSha256}\n${runtime.identityWrapperSha256}\n`),
    gateEvidenceSha256:
      sha256(`${runtime.lineageEvidenceSha256}\n${runtime.reconciliationEvidenceSha256}\n`),
    preflightSha256: sha256(canonicalJson(preflight)),
    backupRestoreEvidenceSha256:
      sha256(`${runtime.currentWebImageId}\n${request.rollbackWebImageRef}\n${BASELINE_COMMIT}\n`),
    rollbackTarget: `${BASELINE_COMMIT}:web`,
    observationContractSha256: sha256(canonicalJson({
      durationSeconds: 1_800,
      pollSeconds: 30,
      minimumSamples: 61,
      continuousReadyFresh: true,
      endpointFailClosed503: true,
      candidateWorkerIdentityUnchanged: true,
    })),
    policySha256: manifest.policySha256,
    revocationEpoch: 2,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    maxExecutions: 1,
    packageAssertions: {
      automaticRollback: true,
      databaseMutation: false,
      dynamicPreflightCurrent: true,
      knownP0Open: false,
      phaseTransition: false,
      pollutionCleanupManifestExact: true,
      productionWipAvailable: true,
      qualityThresholdChanged: false,
      requiredGatesPassed: true,
      scopeMatchesBlueprint: true,
      secretsPresentInEvidence: false,
      webOnly: true,
      workerMutation: false,
    },
  };
  return request;
}

export async function buildTransportBundle({
  root = process.cwd(), output, sourceIdentity, externalBundleSha256 = "bound_after_archive_creation",
} = {}) {
  const local = await validateLocalPreparation(root);
  const identity = sourceIdentity ?? await currentSourceIdentity(root);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "candidate-shadow-verify-release-"));
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
      schemaVersion: "wp-g0.2-shadow-verify-code-release-transport.v1",
      packageId: PACKAGE_ID,
      sourceCommit: identity.sourceCommit,
      sourceTree: identity.sourceTree,
      sourceParentCommit: identity.sourceParentCommit,
      sourceDiffSha256: identity.sourceDiffSha256,
      sourcePathSetSha256: identity.sourcePathSetSha256,
      releaseBaselineCommit: BASELINE_COMMIT,
      releaseTargetCommit: TARGET_COMMIT,
      releaseTargetTree: TARGET_TREE,
      releaseDiffSha256: RELEASE_DIFF_SHA256,
      releasePathSetSha256: RELEASE_PATH_SET_SHA256,
      contractSha256: sha256(await readFile(resolve(root, CONTRACT_PATH))),
      runnerArtifactSha256: local.runnerArtifact.sha256,
      transportArtifactSha256: transport.sha256,
      policySha256: transport.fileSha256["scripts/governance/autonomy-policy.mjs"],
      fileSha256: transport.fileSha256,
      files: [...TRANSPORT_FILES].sort(),
      externalBundleSha256,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
      archiveFormat: "ustar+gzip-n",
      reproducibleArchive: true,
      containsSecrets: false,
      services: ["web"],
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
      encoding: null, maxBuffer: 16 * 1024 * 1024,
    });
    ensure(Buffer.isBuffer(bytes), "transport_bundle_not_binary");
    const outputPath = resolve(output ?? join(root, "reports/wp-g0-2-shadow-verify-code-release",
      `shadow-verify-code-release-${identity.sourceCommit.slice(0, 12)}.tar.gz`));
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes, { mode: 0o600 });
    return {
      status: "PASS_SHADOW_VERIFY_CODE_RELEASE_TRANSPORT",
      output: outputPath,
      sha256: sha256(bytes),
      size: bytes.length,
      manifest,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export function rollbackImageRef(imageId) {
  const digest = /^sha256:([0-9a-f]{64})$/u.exec(imageId ?? "")?.[1];
  ensure(digest, "rollback_image_input_invalid");
  return `${ROLLBACK_REPOSITORY}:web-${digest.slice(0, 16)}`;
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
  if (command === "validate-request") {
    const manifestRoot = dirname(resolve(options.manifest));
    const [manifest, request] = await Promise.all([
      readFile(resolve(options.manifest), "utf8").then(JSON.parse),
      readFile(resolve(options.request), "utf8").then(JSON.parse),
    ]);
    await verifyStagedTransport(manifestRoot, manifest);
    process.stdout.write(`${JSON.stringify(await validateApprovalRequest({ manifest, request }), null, 2)}\n`);
    return;
  }
  if (command === "prepare-request") {
    const [manifest, runtime] = await Promise.all([
      readFile(resolve(options.manifest), "utf8").then(JSON.parse),
      readFile(resolve(options.runtime), "utf8").then(JSON.parse),
    ]);
    const request = createProductionExecutionRequest({
      manifest,
      bundleSha256: options["bundle-sha256"],
      runtime,
      now: options.now ? new Date(options.now) : new Date(),
      nonce: options.nonce ?? randomUUID(),
    });
    await writeFile(resolve(options.output), `${JSON.stringify(request, null, 2)}\n`, {
      flag: "wx", mode: 0o600,
    });
    process.stdout.write(`${JSON.stringify({
      status: "PASS_SHADOW_VERIFY_CODE_RELEASE_REQUEST_PREPARED",
      output: resolve(options.output),
      requestSha256: sha256(`${JSON.stringify(request, null, 2)}\n`),
    }, null, 2)}\n`);
    return;
  }
  if (command === "describe") {
    process.stdout.write(`${JSON.stringify({
      packageId: PACKAGE_ID,
      releaseBaselineCommit: BASELINE_COMMIT,
      releaseTargetCommit: TARGET_COMMIT,
      releaseTargetTree: TARGET_TREE,
      productionExecuted: false,
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
