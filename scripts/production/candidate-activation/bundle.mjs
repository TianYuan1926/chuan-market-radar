#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod, cp, lstat, mkdir, mkdtemp, readFile, rm, utimes, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { inspectArtifact, validateApprovalRequest } from "./runner.mjs";

const execFileAsync = promisify(execFile);
export const PACKAGE_ID = "WP-G0.2-SHADOW-CAPTURE-ACTIVATE-AND-OBSERVE";
export const CONTRACT_PATH = "docs/governance/wp-g0-2-candidate-activation-production-execution.v1.json";
const TRUST_ROOT = "/home/ubuntu/.local/state/market-radar-autonomy";
const GRANT_ID = "MR-G0-G8-USER-STANDING-GRANT-20260714-034826";
const SOURCE_DATE_EPOCH = 946_684_800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);

export const TRANSPORT_FILES = Object.freeze([
  CONTRACT_PATH,
  "deploy/workers/protected-api-worker.mjs",
  "docker-compose.yml",
  "migrations/candidate-episode/009_candidate_shadow_capture_safety.sql",
  "scripts/governance/autonomy-policy.mjs",
  "scripts/governance/autonomy-production-lease-cli.mjs",
  "scripts/governance/autonomy-production-lease.mjs",
  "scripts/production/candidate-activation/bundle.mjs",
  "scripts/production/candidate-activation/observation-runner.sh",
  "scripts/production/candidate-activation/production-entrypoint.sh",
  "scripts/production/candidate-activation/production-runner.sh",
  "scripts/production/candidate-activation/runner.mjs",
  "scripts/verify/production-check.sh",
  "src/app/api/admin/candidate-shadow/run/route.ts",
  "src/lib/candidate-episode/app-shadow-capture-composition.ts",
  "src/lib/candidate-episode/candidate-runtime-database.ts",
  "src/lib/candidate-episode/feature-flags.ts",
  "src/lib/candidate-episode/shadow-capture-admin.ts",
  "src/lib/candidate-episode/shadow-capture-composition.ts",
  "src/lib/candidate-episode/transaction-adapter.ts",
  "src/lib/market/radar-snapshot.ts",
  "src/lib/runtime/worker-heartbeat.ts",
]);

const AUTHORIZATION_KEYS = Object.freeze([
  "actionClass", "approvalId", "approvedBy", "artifactSha256", "backupRestoreEvidenceSha256",
  "baseCommit", "builderAgentId", "composeSha256", "contractSha256", "diffSha256", "expiresAt",
  "gate", "gateEvidenceSha256", "grantId", "imageOrMigrationSha256", "issuedAt", "maxExecutions",
  "mode", "nonce", "observationContractSha256", "packageAssertions", "packageId", "pathSetSha256",
  "policySha256", "preflightSha256", "productionIdentitySha256", "revocationEpoch", "riskTier",
  "rollbackTarget", "runnerSha256", "schemaVersion", "scope", "targetCommit", "targetTree",
  "environmentFingerprintSha256",
]);

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function assertHash(value, reason, length = 64) {
  ensure(new RegExp(`^[0-9a-f]{${length}}$`).test(value ?? ""), reason);
}

async function artifact(root, files) {
  return inspectArtifact(root, files);
}

export async function validateProductionExecutionContract(root = process.cwd()) {
  const contractBytes = await readFile(resolve(root, CONTRACT_PATH));
  const contract = JSON.parse(contractBytes);
  const violations = [];
  const [runnerArtifact, activationArtifact, flags, migration] = await Promise.all([
    artifact(root, contract.runnerArtifact?.files ?? []),
    artifact(root, contract.activationReleaseArtifact?.files ?? []),
    readFile(resolve(root, "src/lib/candidate-episode/feature-flags.ts"), "utf8"),
    readFile(resolve(root, "migrations/candidate-episode/009_candidate_shadow_capture_safety.sql")),
  ]);
  if (contract.schemaVersion !== "wp-g0.2-candidate-activation-production-execution.v1") violations.push("schema_version");
  if (contract.packageId !== PACKAGE_ID) violations.push("package_id");
  if (contract.productionAuthorization !== false || contract.productionExecuted !== false) violations.push("production_truth_claim");
  if (contract.predecessorPackage !== "WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION") violations.push("predecessor_package");
  if (contract.productionRoot !== "/home/ubuntu/apps/chuan-market-radar") violations.push("production_root");
  if (contract.standingGrant?.grantId !== GRANT_ID || contract.standingGrant?.revocationEpoch !== 2
      || contract.standingGrant?.maximumExecutions !== 1
      || contract.standingGrant?.maximumApprovalWindowMinutes !== 90) violations.push("standing_grant_boundary");
  if (contract.currentSource?.codeActivationAllowed !== true
      || contract.currentSource?.candidateRuntimeDefault !== "disabled"
      || contract.currentSource?.productionFeatureFlagsEnabledBeforeExecution !== 0
      || contract.currentSource?.productionMutationAllowedByRepositoryAlone !== false
      || !/CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED = true as const/.test(flags)
      || /CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED = false as const/.test(flags)) violations.push("activation_release_lock");
  if (runnerArtifact.sha256 !== contract.runnerArtifact?.sha256 || runnerArtifact.fileCount !== 5) violations.push("runner_artifact");
  if (activationArtifact.sha256 !== contract.activationReleaseArtifact?.sha256
      || activationArtifact.fileCount !== 16) violations.push("activation_artifact");
  if (sha256(migration) !== contract.schemaBoundary?.migration009Sha256
      || contract.schemaBoundary?.candidateLedgerRequired !== 9
      || contract.schemaBoundary?.migrationExecutionAllowed !== false
      || contract.schemaBoundary?.schemaDdlAllowed !== false
      || contract.schemaBoundary?.businessDmlAllowed !== false) violations.push("schema_boundary");
  if (JSON.stringify(contract.mutationAllowlist?.services) !== '["web","candidate-shadow-worker"]'
      || contract.mutationAllowlist?.composeProfile !== "candidate-shadow-runtime"
      || contract.mutationAllowlist?.environmentKeysChanged !== 7
      || contract.mutationAllowlist?.candidateDatabaseUrlsChanged !== 0
      || contract.mutationAllowlist?.candidateDatabaseRolesChanged !== 0
      || contract.mutationAllowlist?.controlLifecycleStarts !== 1
      || contract.mutationAllowlist?.shadowWriteEnabled !== true
      || contract.mutationAllowlist?.canonicalWriteEnabled !== false
      || contract.mutationAllowlist?.dualReadEnabled !== false
      || contract.mutationAllowlist?.canonicalReadEnabled !== false
      || contract.mutationAllowlist?.reviewReadEnabled !== false
      || contract.mutationAllowlist?.automaticPhaseAdvance !== false) violations.push("mutation_boundary");
  if (contract.execution?.activationRunner !== "transient_systemd_unit"
      || contract.execution?.observationRunner !== "transient_systemd_unit"
      || contract.execution?.restart !== "no"
      || contract.execution?.activationRuntimeMaxSeconds !== 5400
      || contract.execution?.observationRuntimeMaxSeconds !== 90000
      || contract.execution?.sessionIndependent !== true
      || contract.execution?.transport !== "reproducible_redacted_orcaterm_bundle"
      || contract.execution?.hostNodeRequired !== false) violations.push("execution_boundary");
  if (contract.observation?.minimumCleanWindowHours !== 24
      || contract.observation?.sampleIntervalSeconds !== 300
      || contract.observation?.maximumSampleGapSeconds !== 600
      || contract.observation?.minimumSamples !== 289
      || contract.observation?.minimumComparedWritesForThisPackage !== null
      || contract.observation?.minimumComparedWritesForNextGate !== 10000
      || contract.observation?.finalSuccessLabel !== "PASS_ACTIVATE_AND_OBSERVE") violations.push("observation_boundary");
  if (contract.rollback?.automaticRollbackRequired !== true
      || contract.rollback?.approvalExpiryMayBlockSafetyRollback !== false
      || contract.rollback?.transitionControlToLegacyRequired !== true
      || contract.rollback?.writeFrozenAfterRollback !== true
      || contract.rollback?.deleteCandidateEvidenceAllowed !== false
      || contract.rollback?.dropSchemaAllowed !== false
      || contract.rollback?.retainWebImageBeforeMutation !== true
      || contract.rollback?.retentionRepository !== "market-radar-rollback/wp-g0-2-candidate-activation"
      || contract.rollback?.cleanupRequiresSeparateApproval !== true) violations.push("rollback_boundary");
  for (const item of [
    "credential_transport", "approval_replay", "foreground_fallback", "schema_migration",
    "business_table_dml", "canonical_write", "automatic_phase_advance", "scan_ranking_change",
    "analysis_change", "strategy_change", "frontend_change", "formal_backtest",
  ]) if (!contract.forbidden?.includes(item)) violations.push(`forbidden_missing:${item}`);
  return {
    status: violations.length === 0 ? "PASS_LOCAL_ACTIVATION_PRODUCTION_RELEASE" : "FAIL",
    productionMutationAllowed: false,
    runnerArtifactSha256: runnerArtifact.sha256,
    activationArtifactSha256: activationArtifact.sha256,
    contractSha256: sha256(contractBytes),
    violations,
  };
}

async function transportArtifact(root) {
  const checksums = {};
  for (const file of [...TRANSPORT_FILES].sort()) checksums[file] = sha256(await readFile(resolve(root, file)));
  return { checksums, sha256: sha256(JSON.stringify(checksums)) };
}

export async function verifyStagedTransport(root, manifest) {
  const expectedKeys = [
    "activationArtifactSha256", "approvalEligible", "archiveFormat", "bundleMarker", "containsSecrets",
    "contractSha256", "fileSha256", "files", "gateEvidenceSha256", "packageId", "policySha256",
    "reproducibleArchive", "runnerArtifactSha256", "schemaVersion", "services", "sessionIndependentExecutionRequired",
    "sourceCommit", "sourceDateEpoch", "sourceDiffSha256", "sourceParentCommit", "sourcePathSetSha256",
    "sourceTree", "transportArtifactSha256", "transportBundleSha256", "transportMethod",
  ];
  ensure(exactKeys(manifest, expectedKeys), "transport_manifest_keys_mismatch");
  ensure(manifest.schemaVersion === "wp-g0.2-candidate-activation-transport.v1", "transport_manifest_schema_invalid");
  ensure(manifest.packageId === PACKAGE_ID && manifest.approvalEligible === true, "transport_manifest_not_approval_eligible");
  ensure(manifest.containsSecrets === false && manifest.reproducibleArchive === true
    && manifest.archiveFormat === "ustar+gzip-n" && manifest.bundleMarker === ".transport-bundle.sha256",
  "transport_manifest_security_boundary_invalid");
  ensure(manifest.transportMethod === "approved_orcaterm_bundle_upload"
    && manifest.transportBundleSha256 === "bound_after_archive_creation", "transport_manifest_method_invalid");
  ensure(manifest.sessionIndependentExecutionRequired === true
    && JSON.stringify(manifest.services) === '["web","candidate-shadow-worker"]', "transport_manifest_scope_invalid");
  ensure(JSON.stringify(manifest.files) === JSON.stringify(TRANSPORT_FILES), "transport_manifest_files_invalid");
  ensure(exactKeys(manifest.fileSha256, TRANSPORT_FILES), "transport_manifest_checksum_set_invalid");
  for (const key of ["sourceCommit", "sourceTree", "sourceParentCommit"]) assertHash(manifest[key], `transport_${key}_invalid`, 40);
  for (const key of [
    "sourceDiffSha256", "sourcePathSetSha256", "gateEvidenceSha256", "policySha256", "contractSha256",
    "runnerArtifactSha256", "activationArtifactSha256", "transportArtifactSha256",
  ]) assertHash(manifest[key], `transport_${key}_invalid`);
  const checksums = {};
  for (const file of TRANSPORT_FILES) {
    const path = resolve(root, file);
    const facts = await lstat(path);
    ensure(facts.isFile() && !facts.isSymbolicLink(), `transport_file_not_regular:${file}`);
    checksums[file] = sha256(await readFile(path));
    ensure(checksums[file] === manifest.fileSha256[file], `transport_file_checksum_mismatch:${file}`);
  }
  ensure(sha256(JSON.stringify(Object.fromEntries(Object.entries(checksums).sort())))
    === manifest.transportArtifactSha256, "transport_artifact_checksum_mismatch");
  const contractBytes = await readFile(resolve(root, CONTRACT_PATH));
  const contract = JSON.parse(contractBytes);
  ensure(sha256(contractBytes) === manifest.contractSha256, "transport_contract_checksum_mismatch");
  const runnerArtifact = await artifact(root, contract.runnerArtifact.files);
  const activationArtifact = await artifact(root, contract.activationReleaseArtifact.files);
  ensure(runnerArtifact.sha256 === manifest.runnerArtifactSha256, "transport_runner_artifact_mismatch");
  ensure(activationArtifact.sha256 === manifest.activationArtifactSha256, "transport_activation_artifact_mismatch");
  return { contract, fileCount: TRANSPORT_FILES.length };
}

function validateAuthorization(authorization, request, manifest, contract) {
  ensure(exactKeys(authorization, AUTHORIZATION_KEYS), "activation_authorization_keys_mismatch");
  ensure(authorization.schemaVersion === "market-radar-package-authorization.v1"
    && authorization.mode === "g0_g8_standing_user_grant"
    && authorization.approvedBy === "user_standing_grant"
    && authorization.grantId === GRANT_ID
    && authorization.gate === "G0"
    && authorization.packageId === PACKAGE_ID
    && authorization.scope === PACKAGE_ID
    && authorization.actionClass === "candidate_shadow_activation"
    && authorization.riskTier === "R2_REVERSIBLE_RUNTIME_AND_CONTROL"
    && authorization.builderAgentId === "codex-primary"
    && authorization.revocationEpoch === 2
    && authorization.maxExecutions === 1, "activation_authorization_identity_invalid");
  ensure(authorization.issuedAt === request.approvalIssuedAt
    && authorization.expiresAt === request.approvalExpiresAt, "activation_authorization_time_binding_invalid");
  const bindings = {
    artifactSha256: manifest.activationArtifactSha256,
    baseCommit: manifest.sourceParentCommit,
    contractSha256: manifest.contractSha256,
    diffSha256: manifest.sourceDiffSha256,
    gateEvidenceSha256: manifest.gateEvidenceSha256,
    pathSetSha256: manifest.sourcePathSetSha256,
    policySha256: manifest.policySha256,
    runnerSha256: manifest.runnerArtifactSha256,
    targetCommit: manifest.sourceCommit,
    targetTree: manifest.sourceTree,
  };
  for (const [key, expected] of Object.entries(bindings)) {
    ensure(authorization[key] === expected, `activation_authorization_${key}_binding_mismatch`);
  }
  ensure(authorization.imageOrMigrationSha256 === sha256(`${request.webImageId}\n`), "activation_authorization_image_binding_mismatch");
  ensure(authorization.composeSha256 === request.composeSha256, "activation_authorization_compose_binding_mismatch");
  ensure(authorization.environmentFingerprintSha256
    === sha256(`${request.baseEnvSha256}\n${request.productionEnvSha256}\n`), "activation_authorization_environment_binding_mismatch");
  ensure(authorization.productionIdentitySha256
    === sha256(`${request.identityWrapperSha256}\n${request.identityOverrideSha256}\n${request.postgresAdminEnvPath}\n`),
  "activation_authorization_production_identity_binding_mismatch");
  ensure(authorization.preflightSha256 === sha256(canonicalJson({
    dormantEvidenceSha256: request.dormantEvidenceSha256,
    rollbackCommit: request.rollbackCommit,
    runtimeIdentityEvidenceSha256: request.runtimeIdentityEvidenceSha256,
    stagingDirectory: request.stagingDirectory,
    transportBundleSha256: request.transportBundleSha256,
  })), "activation_authorization_preflight_binding_mismatch");
  ensure(authorization.backupRestoreEvidenceSha256 === sha256(canonicalJson({
    automaticControlRollbackAllowed: request.automaticControlRollbackAllowed,
    automaticEnvironmentRollbackAllowed: request.automaticEnvironmentRollbackAllowed,
    automaticServiceRollbackAllowed: request.automaticServiceRollbackAllowed,
    rollbackWebImageRef: request.rollbackWebImageRef,
  })), "activation_authorization_rollback_binding_mismatch");
  ensure(authorization.rollbackTarget === `${request.rollbackCommit}:web:${request.rollbackWebImageRef}`,
    "activation_authorization_rollback_target_mismatch");
  ensure(authorization.observationContractSha256 === sha256(canonicalJson(contract.observation)),
    "activation_authorization_observation_binding_mismatch");
  const assertions = {
    dynamicPreflightCurrent: true,
    knownP0Open: false,
    pollutionCleanupManifestExact: true,
    productionWipAvailable: true,
    qualityThresholdChanged: false,
    requiredGatesPassed: true,
    rollbackVerified: true,
    scopeMatchesBlueprint: true,
    secretsPresentInEvidence: false,
  };
  ensure(exactKeys(authorization.packageAssertions, Object.keys(assertions)), "activation_authorization_assertions_invalid");
  for (const [key, expected] of Object.entries(assertions)) {
    ensure(authorization.packageAssertions[key] === expected, `activation_authorization_assertion_failed:${key}`);
  }
}

export function validateProductionExecutionRequest(request, manifest, contract, bundleSha256, options = {}) {
  validateApprovalRequest(request, contract, options);
  assertHash(bundleSha256, "activation_bundle_hash_invalid");
  ensure(request.transportBundleSha256 === bundleSha256, "activation_bundle_binding_mismatch");
  ensure(request.approvedCommit === manifest.sourceCommit, "activation_commit_binding_mismatch");
  ensure(request.approvedActivationArtifactSha256 === manifest.activationArtifactSha256,
    "activation_release_artifact_binding_mismatch");
  ensure(request.approvedRunnerArtifactSha256 === manifest.runnerArtifactSha256,
    "activation_runner_artifact_binding_mismatch");
  ensure(request.runnerContractSha256 === manifest.contractSha256, "activation_contract_binding_mismatch");
  ensure(request.productionRoot === "/home/ubuntu/apps/chuan-market-radar", "activation_production_root_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/wp-g0-2-candidate-activation-[a-z0-9][a-z0-9._-]{7,80}$/.test(request.stagingDirectory),
    "activation_staging_path_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/wp-g0-2-candidate-activation-[a-z0-9][a-z0-9._-]{7,80}$/.test(request.evidenceDirectory),
    "activation_evidence_path_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/candidate-activation-ops\/wp-g0-2-candidate-activation-[a-z0-9][a-z0-9._-]{7,80}$/.test(request.opsRoot),
    "activation_ops_path_invalid");
  ensure(/^\/home\/ubuntu\/\.local\/state\/market-radar-candidate-activation\/[a-z0-9][a-z0-9._-]{7,80}$/.test(request.secureRoot),
    "activation_secure_path_invalid");
  ensure(request.postgresAdminEnvPath
    === "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env",
  "activation_postgres_admin_env_path_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/.+\/summary\.json$/.test(request.dormantEvidencePath),
    "activation_dormant_evidence_path_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/.+\/runtime-identity-result\.json$/.test(request.runtimeIdentityEvidencePath),
    "activation_runtime_identity_evidence_path_invalid");
  assertHash(request.dormantEvidenceSha256, "activation_dormant_evidence_hash_invalid");
  assertHash(request.runtimeIdentityEvidenceSha256, "activation_runtime_identity_evidence_hash_invalid");
  validateAuthorization(request.autonomyAuthorization, request, manifest, contract);
  const digest = sha256(canonicalJson({
    approvedActivationArtifactSha256: request.approvedActivationArtifactSha256,
    approvedCommit: request.approvedCommit,
    autonomyAuthorization: request.autonomyAuthorization,
    runnerContractSha256: request.runnerContractSha256,
    transportBundleSha256: request.transportBundleSha256,
  }));
  ensure(request.approvalDigest === `sha256:${digest}`, "activation_approval_digest_binding_mismatch");
  return request;
}

export function createProductionExecutionRequest({ manifest, contract, bundleSha256, runtime, now = new Date() }) {
  const issuedAt = new Date(now);
  const expiresAt = new Date(issuedAt.getTime() + 89 * 60_000);
  const suffix = `${manifest.sourceCommit.slice(0, 7)}-${sha256(`${bundleSha256}\n`).slice(0, 8)}`;
  const request = {
    approvalDigest: "sha256:pending",
    approvalExpiresAt: expiresAt.toISOString(),
    approvalIssuedAt: issuedAt.toISOString(),
    approvalRef: `${GRANT_ID}/${suffix}`,
    approvedActivationArtifactSha256: manifest.activationArtifactSha256,
    approvedCommit: manifest.sourceCommit,
    approvedRunnerArtifactSha256: manifest.runnerArtifactSha256,
    autonomyAuthorization: null,
    autonomyTrustRoot: TRUST_ROOT,
    automaticControlRollbackAllowed: true,
    automaticEnvironmentRollbackAllowed: true,
    automaticServiceRollbackAllowed: true,
    baseEnvSha256: runtime.baseEnvSha256,
    businessDmlAllowed: false,
    candidateDatabaseUrlMutationAllowed: false,
    candidateFeatureFlagEnablementAllowed: true,
    candidateWorkerStartAllowed: true,
    canonicalReadAllowed: false,
    canonicalWriteAllowed: false,
    codeActivationAllowed: true,
    composeProfile: "candidate-shadow-runtime",
    composeSha256: runtime.composeSha256,
    controlLifecycleStartAllowed: true,
    dormantDeployStatus: runtime.dormantDeployStatus,
    dormantEvidencePath: runtime.dormantEvidencePath,
    dormantEvidenceSha256: runtime.dormantEvidenceSha256,
    dualReadAllowed: false,
    evidenceDirectory: `/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-candidate-activation-${suffix}`,
    environmentMutationAllowed: true,
    execute: true,
    identityOverrideSha256: runtime.identityOverrideSha256,
    identityOverridePath: runtime.identityOverridePath,
    identityWrapperSha256: runtime.identityWrapperSha256,
    identityWrapperPath: runtime.identityWrapperPath,
    migrationAllowed: false,
    migrationId: "candidate-episode-v1",
    minimumObservationHours: 24,
    observationIntervalSeconds: 300,
    operator: "codex-primary",
    observerUnitName: `market-radar-candidate-observer-${suffix}`,
    opsRoot: `/home/ubuntu/.cache/market-radar-ops/candidate-activation-ops/wp-g0-2-candidate-activation-${suffix}`,
    packageId: PACKAGE_ID,
    postgresAdminEnvPath: runtime.postgresAdminEnvPath,
    productionEnvSha256: runtime.productionEnvSha256,
    productionRoot: "/home/ubuntu/apps/chuan-market-radar",
    productionRankingMutationAllowed: false,
    releaseId: `candidate-shadow-${manifest.sourceCommit.slice(0, 12)}`,
    reviewReadAllowed: false,
    rollbackCommit: runtime.rollbackCommit,
    rollbackWebImageRef: `market-radar-rollback/wp-g0-2-candidate-activation:web-${runtime.webImageId.slice(7, 23)}`,
    runnerUnitName: `market-radar-candidate-activation-${suffix}`,
    runtimeIdentityEvidencePath: runtime.runtimeIdentityEvidencePath,
    runtimeIdentityEvidenceSha256: runtime.runtimeIdentityEvidenceSha256,
    runtimeIdentityStatus: runtime.runtimeIdentityStatus,
    runnerContractSha256: manifest.contractSha256,
    schemaDdlAllowed: false,
    secureRoot: `/home/ubuntu/.local/state/market-radar-candidate-activation/${suffix}`,
    services: ["web", "candidate-shadow-worker"],
    sessionIndependentExecutionRequired: true,
    shadowWriteAllowed: true,
    stagingDirectory: `/home/ubuntu/.cache/market-radar-ops/wp-g0-2-candidate-activation-${suffix}`,
    temporaryArtifactCleanupRequired: true,
    transportBundleSha256: bundleSha256,
    webImageId: runtime.webImageId,
    workerExpectedAllowed: true,
  };
  const authorization = {
    schemaVersion: "market-radar-package-authorization.v1",
    mode: "g0_g8_standing_user_grant",
    approvedBy: "user_standing_grant",
    grantId: GRANT_ID,
    approvalId: `candidate-activation-${suffix}`,
    nonce: sha256(`${manifest.sourceCommit}\n${bundleSha256}\n${issuedAt.toISOString()}\n`).slice(0, 32),
    gate: "G0",
    packageId: PACKAGE_ID,
    scope: PACKAGE_ID,
    actionClass: "candidate_shadow_activation",
    riskTier: "R2_REVERSIBLE_RUNTIME_AND_CONTROL",
    builderAgentId: "codex-primary",
    baseCommit: manifest.sourceParentCommit,
    targetCommit: manifest.sourceCommit,
    targetTree: manifest.sourceTree,
    diffSha256: manifest.sourceDiffSha256,
    pathSetSha256: manifest.sourcePathSetSha256,
    contractSha256: manifest.contractSha256,
    runnerSha256: manifest.runnerArtifactSha256,
    artifactSha256: manifest.activationArtifactSha256,
    imageOrMigrationSha256: sha256(`${request.webImageId}\n`),
    composeSha256: request.composeSha256,
    environmentFingerprintSha256: sha256(`${request.baseEnvSha256}\n${request.productionEnvSha256}\n`),
    productionIdentitySha256: sha256(`${request.identityWrapperSha256}\n${request.identityOverrideSha256}\n${request.postgresAdminEnvPath}\n`),
    gateEvidenceSha256: manifest.gateEvidenceSha256,
    preflightSha256: sha256(canonicalJson({
      dormantEvidenceSha256: request.dormantEvidenceSha256,
      rollbackCommit: request.rollbackCommit,
      runtimeIdentityEvidenceSha256: request.runtimeIdentityEvidenceSha256,
      stagingDirectory: request.stagingDirectory,
      transportBundleSha256: request.transportBundleSha256,
    })),
    backupRestoreEvidenceSha256: sha256(canonicalJson({
      automaticControlRollbackAllowed: true,
      automaticEnvironmentRollbackAllowed: true,
      automaticServiceRollbackAllowed: true,
      rollbackWebImageRef: request.rollbackWebImageRef,
    })),
    rollbackTarget: `${request.rollbackCommit}:web:${request.rollbackWebImageRef}`,
    observationContractSha256: sha256(canonicalJson(contract.observation)),
    policySha256: manifest.policySha256,
    revocationEpoch: 2,
    issuedAt: request.approvalIssuedAt,
    expiresAt: request.approvalExpiresAt,
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
    },
  };
  request.autonomyAuthorization = authorization;
  request.approvalDigest = `sha256:${sha256(canonicalJson({
    approvedActivationArtifactSha256: request.approvedActivationArtifactSha256,
    approvedCommit: request.approvedCommit,
    autonomyAuthorization: authorization,
    runnerContractSha256: request.runnerContractSha256,
    transportBundleSha256: request.transportBundleSha256,
  }))}`;
  return request;
}

export async function prepareAdminUrl(input, output) {
  const fields = Buffer.from(input).toString("utf8").split("\0");
  ensure(fields.length === 3, "activation_admin_input_fields_invalid");
  const [environment, containerUser, databaseName] = fields;
  const values = new Map();
  for (const line of environment.split(/\r?\n/)) {
    if (!line) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    ensure(match && !values.has(match[1]), "activation_admin_environment_invalid");
    values.set(match[1], match[2]);
  }
  ensure(JSON.stringify([...values.keys()].sort()) === JSON.stringify(["POSTGRES_PASSWORD", "POSTGRES_USER"]),
    "activation_admin_environment_keys_invalid");
  ensure(values.get("POSTGRES_USER") === containerUser, "activation_admin_user_mismatch");
  ensure(/^[a-z][a-z0-9_]{2,62}$/.test(databaseName), "activation_database_name_invalid");
  const url = new URL("postgresql://placeholder@postgres:5432/placeholder");
  url.username = values.get("POSTGRES_USER");
  url.password = values.get("POSTGRES_PASSWORD");
  url.pathname = `/${databaseName}`;
  await writeFile(resolve(output), `${url.toString()}\n`, { flag: "wx", mode: 0o600 });
  return { status: "pass", secretsPrinted: false };
}

async function currentSourceIdentity(root) {
  const git = async (args) => (await execFileAsync("git", ["-C", root, ...args])).stdout.trimEnd();
  const sourceCommit = await git(["rev-parse", "HEAD"]);
  const sourceTree = await git(["rev-parse", "HEAD^{tree}"]);
  const parents = (await git(["rev-list", "--parents", "-n", "1", "HEAD"])).split(" ").slice(1);
  ensure(parents.length === 1, "activation_source_parent_count_invalid");
  const diff = `${await git(["diff-tree", "--no-commit-id", "--name-status", "-r", "HEAD"])}\n`;
  const paths = `${(await git(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]))
    .split("\n").filter(Boolean).sort().join("\n")}\n`;
  const pointer = JSON.parse(await readFile(resolve(root, ".autonomy/latest-gate-result.json"), "utf8"));
  const gateBytes = await readFile(resolve(root, pointer.resultPath));
  ensure(sha256(gateBytes) === pointer.resultSha256, "activation_gate_pointer_hash_invalid");
  const gate = JSON.parse(gateBytes);
  ensure(gate.status === "pass" && gate.gitHead === sourceCommit && gate.gitTree === sourceTree,
    "activation_gate_source_identity_invalid");
  return {
    sourceCommit,
    sourceTree,
    sourceParentCommit: parents[0],
    sourceDiffSha256: sha256(diff),
    sourcePathSetSha256: sha256(paths),
    gateEvidenceSha256: pointer.resultSha256,
    policySha256: sha256(await readFile(resolve(root, "scripts/governance/autonomy-policy.mjs"))),
  };
}

export async function buildTransportBundle({ root = process.cwd(), output, sourceIdentity = null, approvalEligible = true }) {
  const contractResult = await validateProductionExecutionContract(root);
  ensure(contractResult.status === "PASS_LOCAL_ACTIVATION_PRODUCTION_RELEASE", "activation_contract_not_pass");
  if (approvalEligible) ensure(sourceIdentity?.sourceCommit, "activation_source_identity_missing");
  const temporaryRoot = await mkdtemp(join(tmpdir(), "candidate-activation-bundle-"));
  const payloadRoot = join(temporaryRoot, "payload");
  try {
    for (const file of TRANSPORT_FILES) {
      const target = join(payloadRoot, file);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await cp(resolve(root, file), target);
      await chmod(target, file.endsWith(".sh") ? 0o700 : 0o600);
      await utimes(target, FIXED_TIME, FIXED_TIME);
    }
    const transport = await transportArtifact(root);
    const manifest = {
      schemaVersion: "wp-g0.2-candidate-activation-transport.v1",
      packageId: PACKAGE_ID,
      sourceCommit: sourceIdentity?.sourceCommit ?? null,
      sourceTree: sourceIdentity?.sourceTree ?? null,
      sourceParentCommit: sourceIdentity?.sourceParentCommit ?? null,
      sourceDiffSha256: sourceIdentity?.sourceDiffSha256 ?? null,
      sourcePathSetSha256: sourceIdentity?.sourcePathSetSha256 ?? null,
      gateEvidenceSha256: sourceIdentity?.gateEvidenceSha256 ?? null,
      policySha256: sourceIdentity?.policySha256 ?? null,
      approvalEligible,
      contractSha256: contractResult.contractSha256,
      runnerArtifactSha256: contractResult.runnerArtifactSha256,
      activationArtifactSha256: contractResult.activationArtifactSha256,
      transportArtifactSha256: transport.sha256,
      transportMethod: "approved_orcaterm_bundle_upload",
      transportBundleSha256: "bound_after_archive_creation",
      bundleMarker: ".transport-bundle.sha256",
      reproducibleArchive: true,
      archiveFormat: "ustar+gzip-n",
      sourceDateEpoch: SOURCE_DATE_EPOCH,
      containsSecrets: false,
      sessionIndependentExecutionRequired: true,
      services: ["web", "candidate-shadow-worker"],
      files: TRANSPORT_FILES,
      fileSha256: transport.checksums,
    };
    const manifestPath = join(payloadRoot, "transport-manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    await utimes(manifestPath, FIXED_TIME, FIXED_TIME);
    const outputPath = resolve(output);
    await mkdir(dirname(outputPath), { recursive: true });
    const tarPath = join(temporaryRoot, "payload.tar");
    await execFileAsync("tar", [
      "-cf", tarPath, "--format=ustar", "--uid=0", "--gid=0", "--numeric-owner",
      "-C", payloadRoot, ...[...TRANSPORT_FILES, "transport-manifest.json"].sort(),
    ], { env: { ...process.env, COPYFILE_DISABLE: "1", LC_ALL: "C" } });
    const { stdout: bytes } = await execFileAsync("gzip", ["-n", "-9", "-c", tarPath], {
      encoding: null,
      maxBuffer: 8 * 1024 * 1024,
    });
    ensure(Buffer.isBuffer(bytes), "activation_bundle_not_binary");
    await writeFile(outputPath, bytes, { mode: 0o600 });
    return {
      status: approvalEligible ? "PASS_FINAL_ACTIVATION_TRANSPORT_BUNDLE" : "PASS_LOCAL_ACTIVATION_TRANSPORT_TEMPLATE",
      output: outputPath,
      sha256: sha256(bytes),
      sizeBytes: bytes.length,
      manifest,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const [command = "bundle", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    ensure(rest[index]?.startsWith("--") && rest[index + 1], "activation_argument_invalid");
    options[rest[index].slice(2)] = rest[index + 1];
  }
  return { command, options };
}

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());
  if (command === "validate") {
    const result = await validateProductionExecutionContract(root);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== "PASS_LOCAL_ACTIVATION_PRODUCTION_RELEASE") process.exitCode = 2;
    return;
  }
  if (command === "validate-request") {
    const manifest = JSON.parse(await readFile(resolve(options.manifest), "utf8"));
    const request = JSON.parse(await readFile(resolve(options.request), "utf8"));
    const { contract } = await verifyStagedTransport(root, manifest);
    validateProductionExecutionRequest(request, manifest, contract, options["bundle-sha256"]);
    process.stdout.write('{"status":"pass","requestValid":true,"secretsPrinted":false}\n');
    return;
  }
  if (command === "prepare-admin-url") {
    process.stdout.write(`${JSON.stringify(await prepareAdminUrl(await readStandardInput(), options.output))}\n`);
    return;
  }
  if (command === "request") {
    const manifest = JSON.parse(await readFile(resolve(options.manifest), "utf8"));
    const contract = JSON.parse(await readFile(resolve(root, CONTRACT_PATH), "utf8"));
    const runtime = JSON.parse(await readFile(resolve(options.runtime), "utf8"));
    const request = createProductionExecutionRequest({
      manifest, contract, bundleSha256: options["bundle-sha256"], runtime,
    });
    validateProductionExecutionRequest(request, manifest, contract, options["bundle-sha256"]);
    await writeFile(resolve(options.output), `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write('{"status":"pass","requestGenerated":true,"secretsPrinted":false}\n');
    return;
  }
  const clean = (await execFileAsync("git", ["-C", root, "status", "--porcelain"])).stdout.trim() === "";
  const sourceIdentity = clean ? await currentSourceIdentity(root) : null;
  const output = options.output ?? join(root, "reports/wp-g0-2-candidate-activation-production-release",
    `candidate-activation-${sourceIdentity?.sourceCommit.slice(0, 12) ?? "precommit-template"}.tar.gz`);
  process.stdout.write(`${JSON.stringify(await buildTransportBundle({
    root, output, sourceIdentity, approvalEligible: clean,
  }), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "fail", reason: error?.reason ?? error?.message ?? "unexpected_error" })}\n`);
    process.exitCode = 1;
  });
}
