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

import {
  LINEAGE_PASS,
  LINEAGE_SCHEMA,
  validateCandidateLineageEvidence,
} from "../candidate-lineage/runner.mjs";
import {
  PACKAGE_ID,
  RECONCILIATION_PASS,
  RECONCILIATION_SCHEMA,
  validateApprovalRequest as validateReconciliationApproval,
  validateLineageRequestBinding,
} from "./runner.mjs";

export { PACKAGE_ID };

const execFileAsync = promisify(execFile);
export const EXECUTION_CONTRACT_PATH =
  "docs/governance/wp-g0-2-current-cycle-unified-reconciliation-production-packet.v3.json";
export const PREPARATION_CONTRACT_PATH =
  "docs/governance/wp-g0-2-current-cycle-unified-reconciliation-refresh-local-superpackage.v3.json";
const POLICY_PATH = "scripts/governance/autonomy-policy.mjs";
const TRUST_ROOT = "/home/ubuntu/.local/state/market-radar-autonomy";
const PRODUCTION_ROOT = "/home/ubuntu/apps/chuan-market-radar";
const POSTGRES_ADMIN_ENV =
  "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env";
const GRANT_ID = "MR-G0-G8-USER-STANDING-GRANT-20260714-034826";
const SOURCE_DATE_EPOCH = 946_684_800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);

export const TRANSPORT_FILES = Object.freeze([
  EXECUTION_CONTRACT_PATH,
  PREPARATION_CONTRACT_PATH,
  POLICY_PATH,
  "scripts/governance/autonomy-production-lease-cli.mjs",
  "scripts/governance/autonomy-production-lease.mjs",
  "scripts/production/candidate-cycle-continuation/observation-runner.mjs",
  "scripts/production/candidate-lineage/runner.mjs",
  "scripts/production/candidate-reconciliation/bundle.mjs",
  "scripts/production/candidate-reconciliation/production-entrypoint.sh",
  "scripts/production/candidate-reconciliation/production-runner.sh",
  "scripts/production/candidate-reconciliation/runner.mjs",
]);

const AUTHORIZATION_KEYS = Object.freeze([
  "actionClass", "approvalId", "approvedBy", "artifactSha256",
  "backupRestoreEvidenceSha256", "baseCommit", "builderAgentId", "composeSha256",
  "contractSha256", "diffSha256", "environmentFingerprintSha256", "expiresAt", "gate",
  "gateEvidenceSha256", "grantId", "imageOrMigrationSha256", "issuedAt", "maxExecutions",
  "mode", "nonce", "observationContractSha256", "packageAssertions", "packageId",
  "pathSetSha256", "policySha256", "preflightSha256", "productionIdentitySha256",
  "revocationEpoch", "riskTier", "rollbackTarget", "runnerSha256", "schemaVersion",
  "scope", "targetCommit", "targetTree",
]);

const REQUEST_KEYS = Object.freeze([
  "approvalExpiresAt", "approvalIssuedAt", "approvalRef", "approvedPacketCommit",
  "approvedPacketTree", "approvedProductionCommit", "approvedRunnerArtifactSha256",
  "autonomyAuthorization", "autonomyTrustRoot", "authorityEpoch", "composeSha256",
  "evidenceDirectory", "executeReadOnlyComparison", "lineageEvidencePath",
  "lineageEvidenceSha256", "lineageSchemaVersion", "lineageStatus", "operator", "opsRoot",
  "packageId", "postgresAdminEnvPath", "productionEnvSha256", "productionRoot",
  "reconciliationApproval", "releaseId", "runnerUnitName", "secureRoot", "services",
  "sessionIndependentExecutionRequired", "sourceReleaseWindows", "stagingDirectory",
  "temporaryArtifactCleanupRequired", "transportBundleSha256", "transportMethod", "webImageId",
]);

const RUNTIME_KEYS = Object.freeze([
  "approvedProductionCommit", "authorityEpoch", "composeSha256", "lineageEvidencePath",
  "lineageEvidenceSha256", "postgresAdminEnvPath", "productionEnvSha256", "releaseId",
  "sourceReleaseWindows", "webImageId",
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
    return `{${Object.keys(value).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function assertHash(value, reason, length = 64) {
  ensure(new RegExp(`^[0-9a-f]{${length}}$`, "u").test(value ?? ""), reason);
}

function parseTimestamp(value, reason) {
  const parsed = Date.parse(value);
  ensure(Number.isFinite(parsed), reason);
  return parsed;
}

function parseCycleNumber(value, reason) {
  const match = /^candidate-episode-v1(?:-cycle-([1-9][0-9]{0,5}))?$/u.exec(value ?? "");
  ensure(match, reason);
  const cycle = match[1] ? Number(match[1]) : 1;
  ensure(cycle !== 1 || value === "candidate-episode-v1", reason);
  return cycle;
}

async function artifact(root, files) {
  ensure(Array.isArray(files) && files.length > 0 && new Set(files).size === files.length,
    "artifact_files_invalid");
  const checksums = {};
  for (const file of [...files].sort()) {
    ensure(typeof file === "string" && !file.startsWith("/") && !file.includes(".."),
      "artifact_path_invalid");
    const metadata = await lstat(resolve(root, file));
    ensure(metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1,
      `artifact_not_regular:${file}`);
    ensure(metadata.size > 0 && metadata.size <= 2 * 1024 * 1024,
      `artifact_size_invalid:${file}`);
    checksums[file] = sha256(await readFile(resolve(root, file)));
  }
  return {
    checksums,
    fileCount: Object.keys(checksums).length,
    sha256: sha256(JSON.stringify(checksums)),
  };
}

function validateLineageContract(contract, violations) {
  const boundary = contract.prerequisites;
  if (boundary?.lineageSchemaVersion !== LINEAGE_SCHEMA
      || boundary?.lineageStatus !== LINEAGE_PASS
      || boundary?.migrationId !== "candidate-episode-v1-cycle-5"
      || boundary?.sourceReleaseWindowsExact !== 5
      || boundary?.sourceReleaseWindowsDerivedFromMigrationId !== true
      || boundary?.minimumActivationSamples !== 289
      || boundary?.minimumActivationHours !== 24
      || boundary?.maximumSampleGapSeconds !== 600
      || boundary?.minimumComparedWrites !== 10_000
      || boundary?.minimumCompletionAdvances !== 2
      || boundary?.unresolvedMaximum !== 0
      || boundary?.lineageFileHashRequired !== true
      || boundary?.lineageSemanticProvenanceHashesRequired !== 3
      || boundary?.completeDatabaseControlLineageRequired !== true
      || boundary?.newExactRequestRequired !== true
      || boundary?.historicalActivationEvidenceAllowed !== false) violations.push("lineage_prerequisites");
}

export async function validateProductionExecutionContract(root = process.cwd()) {
  const [executionBytes, preparationBytes] = await Promise.all([
    readFile(resolve(root, EXECUTION_CONTRACT_PATH)),
    readFile(resolve(root, PREPARATION_CONTRACT_PATH)),
  ]);
  const execution = JSON.parse(executionBytes);
  const preparation = JSON.parse(preparationBytes);
  const runnerArtifact = await artifact(root, execution.runnerArtifact?.files ?? []);
  const violations = [];
  if (execution.schemaVersion
      !== "wp-g0.2-current-cycle-unified-reconciliation-production-packet.v3"
      || execution.packageId !== PACKAGE_ID
      || execution.productionAuthorization !== false
      || execution.productionExecuted !== false) violations.push("production_truth");
  if (execution.actionClass !== "read_only_production_preflight"
      || execution.riskTier !== "R0_READ_ONLY"
      || execution.productionRoot !== PRODUCTION_ROOT) violations.push("risk_boundary");
  if (execution.standingGrant?.grantId !== GRANT_ID
      || execution.standingGrant?.revocationEpoch !== 2
      || execution.standingGrant?.maximumExecutions !== 1
      || execution.standingGrant?.maximumApprovalWindowMinutes !== 90
      || execution.standingGrant?.externalLeaseRequired !== true) violations.push("standing_grant");
  if (runnerArtifact.fileCount !== 9
      || runnerArtifact.fileCount !== execution.runnerArtifact?.fileCount
      || runnerArtifact.sha256 !== execution.runnerArtifact?.sha256) violations.push("runner_artifact");
  validateLineageContract(execution, violations);
  if (execution.execution?.runner !== "transient_systemd_unit"
      || execution.execution?.restart !== "no"
      || execution.execution?.runtimeMaxSeconds !== 3600
      || execution.execution?.sessionIndependent !== true
      || execution.execution?.hostNodeRequired !== false
      || execution.execution?.candidateWorkerRequired !== "running_healthy"
      || execution.execution?.runtimeHealthRequired !== "ready_fresh"
      || execution.execution?.containerNodeFallback?.enabled !== true
      || execution.execution?.containerNodeFallback?.image !== "approved_current_web_image"
      || execution.execution?.containerNodeFallback?.network !== "production_compose_network"
      || execution.execution?.containerNodeFallback?.rootFilesystem !== "read_only"
      || execution.execution?.containerNodeFallback?.capabilities !== "drop_all"
      || execution.execution?.containerNodeFallback?.noNewPrivileges !== true) {
    violations.push("execution_boundary");
  }
  if (execution.databaseBoundary?.transactionIsolation !== "repeatable_read"
      || execution.databaseBoundary?.transactionReadOnly !== true
      || execution.databaseBoundary?.forcedLocalRole !== "candidate_audit_role"
      || execution.databaseBoundary?.controlLineageExactCount !== 5
      || execution.databaseBoundary?.controlLineageCountDerivedFromMigrationId !== true
      || execution.databaseBoundary?.minimumComparedWrites !== 10_000
      || execution.databaseBoundary?.maximumDifferences !== 0
      || execution.databaseBoundary?.maximumUnresolvedItems !== 0
      || execution.databaseBoundary?.maximumOutsideLineageItems !== 0
      || execution.databaseBoundary?.controlLineageExactMatchRequired !== true
      || execution.databaseBoundary?.ddlAllowed !== false
      || execution.databaseBoundary?.dmlAllowed !== false
      || execution.databaseBoundary?.migrationAllowed !== false
      || execution.databaseBoundary?.phaseTransitionAllowed !== false) violations.push("database_boundary");
  for (const [key, value] of Object.entries(execution.runtimeMutationBoundary ?? {})) {
    if (value !== (key === "evidenceAndLeaseFilesOnly")) {
      violations.push(`runtime_mutation_boundary:${key}`);
    }
  }
  if (execution.resultBoundary?.schemaVersion !== RECONCILIATION_SCHEMA
      || execution.resultBoundary?.passStatus !== RECONCILIATION_PASS
      || execution.resultBoundary?.automaticPhaseAdvance !== false
      || execution.resultBoundary?.shadowVerifyTransitionExecuted !== false
      || execution.resultBoundary?.canonicalReadEnabled !== false
      || execution.resultBoundary?.canonicalWriteEnabled !== false
      || execution.resultBoundary?.reviewReadEnabled !== false
      || execution.resultBoundary?.g0Completed !== false) violations.push("result_boundary");
  if (execution.transport?.method !== "reproducible_redacted_orcaterm_bundle"
      || execution.transport?.containsSecrets !== false
      || execution.transport?.temporaryArtifactCleanupRequired !== true
      || execution.transport?.lineageEvidencePreserved !== true
      || execution.transport?.lineageProvenanceHashesRequired !== 3
      || execution.transport?.outputEvidencePreserved !== true) violations.push("transport_boundary");
  if (preparation.schemaVersion
        !== "wp-g0.2-current-cycle-unified-reconciliation-refresh-local-superpackage.v3"
      || preparation.packageId
        !== "WP-G0.2-CURRENT-CYCLE-UNIFIED-RECONCILIATION-REFRESH-LOCAL-SUPERPACKAGE"
      || preparation.productionAuthorization !== false
      || preparation.productionExecuted !== false
      || preparation.runnerArtifact?.sha256 === undefined
      || preparation.lineageBoundary?.schemaVersion !== LINEAGE_SCHEMA
      || preparation.lineageBoundary?.sourceReleaseWindowsExact !== 5
      || preparation.lineageBoundary?.sourceReleaseWindowsDerivedFromMigrationId !== true
      || preparation.databaseBoundary?.forcedLocalRole !== "candidate_audit_role"
      || preparation.comparison?.minimumComparedWrites !== 10_000
      || preparation.comparison?.outsideLineageMaximum !== 0
      || preparation.comparison?.controlLineageExactMatchRequired !== true) {
    violations.push("preparation_contract");
  }
  for (const forbidden of [
    "historical_activation_evidence_input", "lineage_v1_input", "lineage_relabeling",
    "source_sync", "git_checkout", "image_build", "service_recreate", "database_write",
    "schema_migration", "phase_transition", "redis_write", "worker_change",
    "environment_change", "canonical_cutover", "production_ranking_change",
    "future_outcome_input", "formal_backtest",
  ]) if (!execution.forbidden?.includes(forbidden)) violations.push(`forbidden_missing:${forbidden}`);
  return {
    status: violations.length === 0
      ? "PASS_CURRENT_CYCLE_UNIFIED_RECONCILIATION_PRODUCTION_PACKET_LOCAL"
      : "FAIL",
    productionMutationAllowed: false,
    executionContractSha256: sha256(executionBytes),
    preparationContractSha256: sha256(preparationBytes),
    preparationRunnerArtifactSha256: preparation.runnerArtifact?.sha256,
    runnerArtifactSha256: runnerArtifact.sha256,
    violations,
  };
}

function assertLineagePath(path) {
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/wp-g0-2-[a-z0-9][a-z0-9._-]{7,120}\/lineage-final\.json$/u
    .test(path ?? ""), "lineage_evidence_path_invalid");
}

async function assertPrivateFile(path, label, maximumBytes) {
  const [metadata, linkMetadata] = await Promise.all([stat(path), lstat(path)]);
  ensure(metadata.isFile() && linkMetadata.isFile() && !linkMetadata.isSymbolicLink(),
    `${label}_not_regular_file`);
  ensure(metadata.nlink === 1, `${label}_hard_link_forbidden`);
  ensure((metadata.mode & 0o077) === 0, `${label}_permissions_too_open`);
  ensure(metadata.size > 0 && metadata.size <= maximumBytes, `${label}_size_invalid`);
}

export function validateMultiCycleLineageEvidence(lineage, request) {
  validateCandidateLineageEvidence(lineage);
  ensure(lineage.schemaVersion === request.lineageSchemaVersion,
    "lineage_schema_request_mismatch");
  ensure(lineage.status === request.lineageStatus, "lineage_status_request_mismatch");
  ensure(canonicalJson(lineage.sourceReleaseWindows) === canonicalJson(request.sourceReleaseWindows),
    "lineage_release_windows_mismatch");
  const current = request.sourceReleaseWindows.at(-1);
  ensure(lineage.currentMigrationId === current.migrationId
      && lineage.currentReleaseId === request.releaseId
      && lineage.currentAuthorityEpoch === request.authorityEpoch
      && lineage.currentCycleStartedAt === current.startedAt,
  "lineage_current_cycle_mismatch");
  return lineage;
}

export async function verifyMultiCycleLineageEvidence(request) {
  assertLineagePath(request.lineageEvidencePath);
  await assertPrivateFile(request.lineageEvidencePath, "lineage_evidence", 512 * 1024);
  const bytes = await readFile(request.lineageEvidencePath);
  ensure(sha256(bytes) === request.lineageEvidenceSha256, "lineage_evidence_hash_mismatch");
  return validateMultiCycleLineageEvidence(JSON.parse(bytes), request);
}

function validateAuthorization(authorization, request, manifest, execution) {
  ensure(exactKeys(authorization, AUTHORIZATION_KEYS), "authorization_keys_mismatch");
  ensure(authorization.schemaVersion === "market-radar-package-authorization.v1"
      && authorization.mode === "g0_g8_standing_user_grant"
      && authorization.approvedBy === "user_standing_grant"
      && authorization.grantId === GRANT_ID
      && authorization.gate === "G0"
      && authorization.packageId === PACKAGE_ID
      && authorization.scope === PACKAGE_ID
      && authorization.actionClass === "read_only_production_preflight"
      && authorization.riskTier === "R0_READ_ONLY"
      && authorization.builderAgentId === "codex-primary"
      && authorization.revocationEpoch === 2
      && authorization.maxExecutions === 1, "authorization_identity_invalid");
  ensure(authorization.issuedAt === request.approvalIssuedAt
      && authorization.expiresAt === request.approvalExpiresAt, "authorization_time_binding_invalid");
  const bindings = {
    artifactSha256: execution.runnerArtifact.sha256,
    baseCommit: manifest.sourceParentCommit,
    contractSha256: manifest.executionContractSha256,
    diffSha256: manifest.sourceDiffSha256,
    gateEvidenceSha256: manifest.gateEvidenceSha256,
    pathSetSha256: manifest.sourcePathSetSha256,
    policySha256: manifest.policySha256,
    runnerSha256: manifest.runnerArtifactSha256,
    targetCommit: manifest.sourceCommit,
    targetTree: manifest.sourceTree,
  };
  for (const [key, expected] of Object.entries(bindings)) {
    ensure(authorization[key] === expected, `authorization_${key}_binding_mismatch`);
  }
  ensure(authorization.imageOrMigrationSha256 === sha256(canonicalJson({
    lineageEvidenceSha256: request.lineageEvidenceSha256,
    mode: "read-only-current-cycle-reconciliation",
    sourceReleaseWindows: request.sourceReleaseWindows,
  })), "authorization_read_only_binding_mismatch");
  ensure(authorization.composeSha256 === request.composeSha256,
    "authorization_compose_binding_mismatch");
  ensure(authorization.environmentFingerprintSha256 === sha256(`${request.productionEnvSha256}\n`),
    "authorization_environment_binding_mismatch");
  ensure(authorization.productionIdentitySha256 === sha256(`${request.postgresAdminEnvPath}\n`),
    "authorization_identity_source_binding_mismatch");
  ensure(authorization.preflightSha256 === sha256(canonicalJson({
    approvedProductionCommit: request.approvedProductionCommit,
    authorityEpoch: request.authorityEpoch,
    lineageEvidenceSha256: request.lineageEvidenceSha256,
    lineageSchemaVersion: request.lineageSchemaVersion,
    lineageStatus: request.lineageStatus,
    releaseId: request.releaseId,
    sourceReleaseWindows: request.sourceReleaseWindows,
  })), "authorization_preflight_binding_mismatch");
  ensure(authorization.backupRestoreEvidenceSha256
      === sha256("not_applicable_read_only_no_mutation\n"), "authorization_recovery_binding_mismatch");
  ensure(authorization.rollbackTarget === "none:read-only:no-production-mutation",
    "authorization_rollback_boundary_invalid");
  ensure(authorization.observationContractSha256 === sha256(canonicalJson(execution.prerequisites)),
    "authorization_observation_binding_mismatch");
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
  ensure(exactKeys(authorization.packageAssertions, Object.keys(assertions)),
    "authorization_assertion_keys_invalid");
  for (const [key, expected] of Object.entries(assertions)) {
    ensure(authorization.packageAssertions[key] === expected,
      `authorization_assertion_failed:${key}`);
  }
}

export async function verifyStagedTransport(root, manifest) {
  const expectedKeys = [
    "approvalEligible", "archiveFormat", "bundleMarker", "containsSecrets",
    "executionContractSha256", "fileSha256", "files", "gateEvidenceSha256", "packageId",
    "policySha256", "preparationContractSha256", "preparationRunnerArtifactSha256",
    "reproducibleArchive", "runnerArtifactSha256", "schemaVersion", "services",
    "sessionIndependentExecutionRequired", "sourceCommit", "sourceDateEpoch", "sourceDiffSha256",
    "sourceParentCommit", "sourcePathSetSha256", "sourceTree", "transportArtifactSha256",
    "transportBundleSha256", "transportMethod",
  ];
  ensure(exactKeys(manifest, expectedKeys), "transport_manifest_keys_mismatch");
  ensure(manifest.schemaVersion === "wp-g0.2-current-cycle-reconciliation-transport.v3"
      && manifest.packageId === PACKAGE_ID && manifest.approvalEligible === true,
  "transport_manifest_identity_invalid");
  ensure(manifest.containsSecrets === false && manifest.reproducibleArchive === true
      && manifest.archiveFormat === "ustar+gzip-n" && manifest.bundleMarker === ".transport-bundle.sha256"
      && manifest.transportBundleSha256 === "bound_after_archive_creation"
      && manifest.transportMethod === "approved_orcaterm_bundle_upload"
      && manifest.sessionIndependentExecutionRequired === true
      && Array.isArray(manifest.services) && manifest.services.length === 0,
  "transport_manifest_boundary_invalid");
  ensure(JSON.stringify(manifest.files) === JSON.stringify(TRANSPORT_FILES),
    "transport_manifest_files_invalid");
  ensure(exactKeys(manifest.fileSha256, TRANSPORT_FILES), "transport_manifest_checksums_invalid");
  for (const key of ["sourceCommit", "sourceTree", "sourceParentCommit"]) {
    assertHash(manifest[key], `transport_${key}_invalid`, 40);
  }
  for (const key of [
    "sourceDiffSha256", "sourcePathSetSha256", "gateEvidenceSha256", "policySha256",
    "executionContractSha256", "preparationContractSha256", "preparationRunnerArtifactSha256",
    "runnerArtifactSha256", "transportArtifactSha256",
  ]) assertHash(manifest[key], `transport_${key}_invalid`);
  const transport = await artifact(root, TRANSPORT_FILES);
  ensure(transport.sha256 === manifest.transportArtifactSha256, "transport_artifact_mismatch");
  for (const file of TRANSPORT_FILES) {
    ensure(transport.checksums[file] === manifest.fileSha256[file],
      `transport_file_mismatch:${file}`);
  }
  const contract = await validateProductionExecutionContract(root);
  ensure(contract.status === "PASS_CURRENT_CYCLE_UNIFIED_RECONCILIATION_PRODUCTION_PACKET_LOCAL",
    "transport_contract_not_pass");
  ensure(contract.executionContractSha256 === manifest.executionContractSha256
      && contract.preparationContractSha256 === manifest.preparationContractSha256
      && contract.preparationRunnerArtifactSha256 === manifest.preparationRunnerArtifactSha256
      && contract.runnerArtifactSha256 === manifest.runnerArtifactSha256,
  "transport_contract_binding_mismatch");
  return contract;
}

export async function validateProductionExecutionRequest(
  request,
  manifest,
  preparation,
  execution,
  bundleSha256,
  { now = new Date(), verifyEvidence = true } = {},
) {
  ensure(exactKeys(request, REQUEST_KEYS), "request_keys_mismatch");
  ensure(request.packageId === PACKAGE_ID && request.executeReadOnlyComparison === true,
    "request_identity_invalid");
  ensure(Array.isArray(request.services) && request.services.length === 0,
    "request_service_mutation_not_empty");
  ensure(request.sessionIndependentExecutionRequired === true
      && request.temporaryArtifactCleanupRequired === true
      && request.transportMethod === "approved_orcaterm_bundle_upload"
      && request.autonomyTrustRoot === TRUST_ROOT
      && request.productionRoot === PRODUCTION_ROOT
      && request.postgresAdminEnvPath === POSTGRES_ADMIN_ENV,
  "request_execution_boundary_invalid");
  assertHash(bundleSha256, "request_bundle_hash_invalid");
  ensure(request.transportBundleSha256 === bundleSha256, "request_bundle_binding_mismatch");
  ensure(request.approvedPacketCommit === manifest.sourceCommit
      && request.approvedPacketTree === manifest.sourceTree
      && request.approvedRunnerArtifactSha256 === manifest.runnerArtifactSha256,
  "request_packet_binding_mismatch");
  assertHash(request.approvedProductionCommit, "request_production_commit_invalid", 40);
  assertHash(request.webImageId?.replace(/^sha256:/u, ""), "request_web_image_invalid");
  for (const key of ["composeSha256", "lineageEvidenceSha256", "productionEnvSha256"]) {
    assertHash(request[key], `request_${key}_invalid`);
  }
  ensure(request.lineageSchemaVersion === LINEAGE_SCHEMA, "request_lineage_schema_invalid");
  ensure(request.lineageStatus === LINEAGE_PASS, "request_lineage_status_invalid");
  ensure(Number.isSafeInteger(request.authorityEpoch) && request.authorityEpoch >= 1
      && request.authorityEpoch % 2 === 1, "request_authority_epoch_invalid");
  ensure(/^candidate-shadow-[a-z0-9][a-z0-9._-]{7,100}$/u.test(request.releaseId ?? ""),
    "request_release_invalid");
  assertLineagePath(request.lineageEvidencePath);
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/wp-g0-2-current-cycle-reconciliation-[a-z0-9][a-z0-9._-]{7,80}$/u
    .test(request.stagingDirectory ?? ""), "request_staging_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/reconciliation-ops\/wp-g0-2-current-cycle-reconciliation-[a-z0-9][a-z0-9._-]{7,80}$/u
    .test(request.opsRoot ?? ""), "request_ops_invalid");
  ensure(/^\/home\/ubuntu\/\.local\/state\/market-radar-reconciliation\/[a-z0-9][a-z0-9._-]{7,80}$/u
    .test(request.secureRoot ?? ""), "request_secure_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/wp-g0-2-current-cycle-reconciliation-[a-z0-9][a-z0-9._-]{7,80}$/u
    .test(request.evidenceDirectory ?? ""), "request_evidence_invalid");
  ensure(/^market-radar-current-cycle-reconciliation-[a-z0-9][a-z0-9-]{7,48}$/u
    .test(request.runnerUnitName ?? ""), "request_unit_invalid");
  ensure(typeof request.operator === "string" && request.operator.length >= 2
      && /^[A-Za-z0-9._:/-]{8,128}$/u.test(request.approvalRef ?? ""),
  "request_operator_or_ref_invalid");
  const issuedAt = parseTimestamp(request.approvalIssuedAt, "request_issued_at_invalid");
  const expiresAt = parseTimestamp(request.approvalExpiresAt, "request_expires_at_invalid");
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  ensure(expiresAt > issuedAt && expiresAt - issuedAt <= 90 * 60_000,
    "request_approval_window_invalid");
  ensure(nowMs >= issuedAt && nowMs < expiresAt, "request_approval_not_current");
  validateAuthorization(request.autonomyAuthorization, request, manifest, execution);
  ensure(request.reconciliationApproval.lineageEvidenceSha256
      === `sha256:${request.lineageEvidenceSha256}`
      && request.reconciliationApproval.lineageSchemaVersion === request.lineageSchemaVersion
      && request.reconciliationApproval.lineageStatus === request.lineageStatus
      && request.reconciliationApproval.approvedCommit === request.approvedProductionCommit
      && request.reconciliationApproval.authorityEpoch === request.authorityEpoch
      && request.reconciliationApproval.releaseId === request.releaseId
      && canonicalJson(request.reconciliationApproval.sourceReleaseWindows)
        === canonicalJson(request.sourceReleaseWindows)
      && request.reconciliationApproval.approvedRunnerArtifactSha256
        === preparation.runnerArtifact.sha256,
  "request_inner_reconciliation_binding_mismatch");
  validateReconciliationApproval(request.reconciliationApproval, preparation, { now });
  if (verifyEvidence) {
    const lineage = await verifyMultiCycleLineageEvidence(request);
    validateLineageRequestBinding(lineage, request.reconciliationApproval);
  }
  return request;
}

function validateSourceReleaseWindows(windows, runtime) {
  ensure(Array.isArray(windows) && windows.length >= 2,
    "runtime_source_release_windows_invalid");
  for (const [index, window] of windows.entries()) {
    ensure(exactKeys(window, [
      "controlEpoch", "deadlineAt", "migrationId", "phase", "releaseId", "startedAt",
      "writeFrozen",
    ]), `runtime_release_window_shape_invalid:${index}`);
    const expectedMigration = index === 0
      ? "candidate-episode-v1"
      : `candidate-episode-v1-cycle-${index + 1}`;
    ensure(window.migrationId === expectedMigration,
      `runtime_release_window_migration_invalid:${index}`);
    ensure(parseTimestamp(window.deadlineAt, `runtime_release_window_deadline_invalid:${index}`)
        - parseTimestamp(window.startedAt, `runtime_release_window_start_invalid:${index}`)
        === 72 * 60 * 60_000, `runtime_release_window_duration_invalid:${index}`);
    const current = index === windows.length - 1;
    ensure(current
      ? window.phase === "shadow_capture" && window.writeFrozen === false
        && window.controlEpoch % 2 === 1
      : window.phase === "legacy" && window.writeFrozen === true
        && window.controlEpoch >= 2 && window.controlEpoch % 2 === 0,
    `runtime_release_window_state_invalid:${index}`);
  }
  const current = windows.at(-1);
  ensure(parseCycleNumber(current.migrationId, "runtime_current_cycle_invalid") === windows.length,
    "runtime_release_window_count_cycle_mismatch");
  ensure(current.releaseId === runtime.releaseId
      && current.controlEpoch === runtime.authorityEpoch,
  "runtime_current_release_window_mismatch");
  return windows;
}

function validateRuntime(runtime) {
  ensure(exactKeys(runtime, RUNTIME_KEYS), "runtime_keys_mismatch");
  assertHash(runtime.approvedProductionCommit, "runtime_production_commit_invalid", 40);
  assertHash(runtime.webImageId?.replace(/^sha256:/u, ""), "runtime_web_image_invalid");
  for (const key of ["composeSha256", "lineageEvidenceSha256", "productionEnvSha256"]) {
    assertHash(runtime[key], `runtime_${key}_invalid`);
  }
  ensure(runtime.postgresAdminEnvPath === POSTGRES_ADMIN_ENV, "runtime_postgres_admin_env_invalid");
  ensure(Number.isSafeInteger(runtime.authorityEpoch) && runtime.authorityEpoch >= 1
      && runtime.authorityEpoch % 2 === 1, "runtime_epoch_invalid");
  ensure(/^candidate-shadow-[a-z0-9][a-z0-9._-]{7,100}$/u.test(runtime.releaseId ?? ""),
    "runtime_release_invalid");
  assertLineagePath(runtime.lineageEvidencePath);
  validateSourceReleaseWindows(runtime.sourceReleaseWindows, runtime);
  return runtime;
}

export function createProductionExecutionRequest({
  manifest,
  execution,
  preparation,
  bundleSha256,
  runtime,
  now = new Date(),
  approvalId = `MR-G0-RECON-${randomUUID()}`,
  nonce = randomUUID(),
}) {
  validateRuntime(runtime);
  const issuedAt = new Date(now);
  const expiresAt = new Date(issuedAt.getTime() + 89 * 60_000);
  const suffix = `${manifest.sourceCommit.slice(0, 12)}-${nonce.replaceAll("-", "").slice(0, 8)}`;
  const approvalRef = `MR-G0-RECON/${manifest.sourceCommit.slice(0, 12)}/${nonce.slice(0, 8)}`;
  const request = {
    packageId: PACKAGE_ID,
    executeReadOnlyComparison: true,
    services: [],
    sessionIndependentExecutionRequired: true,
    temporaryArtifactCleanupRequired: true,
    transportMethod: "approved_orcaterm_bundle_upload",
    transportBundleSha256: bundleSha256,
    approvedPacketCommit: manifest.sourceCommit,
    approvedPacketTree: manifest.sourceTree,
    approvedRunnerArtifactSha256: execution.runnerArtifact.sha256,
    approvedProductionCommit: runtime.approvedProductionCommit,
    productionRoot: PRODUCTION_ROOT,
    stagingDirectory: `/home/ubuntu/.cache/market-radar-ops/wp-g0-2-current-cycle-reconciliation-${suffix}`,
    opsRoot: `/home/ubuntu/.cache/market-radar-ops/reconciliation-ops/wp-g0-2-current-cycle-reconciliation-${suffix}`,
    secureRoot: `/home/ubuntu/.local/state/market-radar-reconciliation/${suffix}`,
    evidenceDirectory: `/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-current-cycle-reconciliation-${suffix}`,
    runnerUnitName: `market-radar-current-cycle-reconciliation-${manifest.sourceCommit.slice(0, 7)}-${nonce.replaceAll("-", "").slice(0, 8)}`,
    autonomyTrustRoot: TRUST_ROOT,
    postgresAdminEnvPath: runtime.postgresAdminEnvPath,
    lineageEvidencePath: runtime.lineageEvidencePath,
    lineageEvidenceSha256: runtime.lineageEvidenceSha256,
    lineageSchemaVersion: LINEAGE_SCHEMA,
    lineageStatus: LINEAGE_PASS,
    authorityEpoch: runtime.authorityEpoch,
    releaseId: runtime.releaseId,
    webImageId: runtime.webImageId,
    composeSha256: runtime.composeSha256,
    productionEnvSha256: runtime.productionEnvSha256,
    sourceReleaseWindows: runtime.sourceReleaseWindows,
    approvalIssuedAt: issuedAt.toISOString(),
    approvalExpiresAt: expiresAt.toISOString(),
    approvalRef,
    operator: "codex-primary",
    reconciliationApproval: {
      approvalExpiresAt: expiresAt.toISOString(),
      approvalIssuedAt: issuedAt.toISOString(),
      approvalRef,
      approvedCommit: runtime.approvedProductionCommit,
      approvedRunnerArtifactSha256: preparation.runnerArtifact.sha256,
      authorityEpoch: runtime.authorityEpoch,
      automaticPhaseAdvanceAllowed: false,
      businessDmlAllowed: false,
      canonicalReadAllowed: false,
      canonicalWriteAllowed: false,
      executeReadOnlyComparison: true,
      lineageEvidenceSha256: `sha256:${runtime.lineageEvidenceSha256}`,
      lineageSchemaVersion: LINEAGE_SCHEMA,
      lineageStatus: LINEAGE_PASS,
      migrationAllowed: false,
      migrationId: runtime.sourceReleaseWindows.at(-1).migrationId,
      minimumComparedWrites: 10_000,
      operator: "codex-primary",
      packageId: PACKAGE_ID,
      productionRankingMutationAllowed: false,
      releaseId: runtime.releaseId,
      reviewReadAllowed: false,
      schemaDdlAllowed: false,
      shadowVerifyTransitionAllowed: false,
      sourceReleaseWindows: runtime.sourceReleaseWindows,
    },
    autonomyAuthorization: null,
  };
  request.autonomyAuthorization = {
    schemaVersion: "market-radar-package-authorization.v1",
    mode: "g0_g8_standing_user_grant",
    approvedBy: "user_standing_grant",
    grantId: GRANT_ID,
    approvalId,
    nonce,
    gate: "G0",
    packageId: PACKAGE_ID,
    scope: PACKAGE_ID,
    actionClass: "read_only_production_preflight",
    riskTier: "R0_READ_ONLY",
    builderAgentId: "codex-primary",
    baseCommit: manifest.sourceParentCommit,
    targetCommit: manifest.sourceCommit,
    targetTree: manifest.sourceTree,
    diffSha256: manifest.sourceDiffSha256,
    pathSetSha256: manifest.sourcePathSetSha256,
    contractSha256: manifest.executionContractSha256,
    runnerSha256: manifest.runnerArtifactSha256,
    artifactSha256: execution.runnerArtifact.sha256,
    imageOrMigrationSha256: sha256(canonicalJson({
      lineageEvidenceSha256: runtime.lineageEvidenceSha256,
      mode: "read-only-current-cycle-reconciliation",
      sourceReleaseWindows: runtime.sourceReleaseWindows,
    })),
    composeSha256: runtime.composeSha256,
    environmentFingerprintSha256: sha256(`${runtime.productionEnvSha256}\n`),
    productionIdentitySha256: sha256(`${runtime.postgresAdminEnvPath}\n`),
    gateEvidenceSha256: manifest.gateEvidenceSha256,
    preflightSha256: sha256(canonicalJson({
      approvedProductionCommit: runtime.approvedProductionCommit,
      authorityEpoch: runtime.authorityEpoch,
      lineageEvidenceSha256: runtime.lineageEvidenceSha256,
      lineageSchemaVersion: LINEAGE_SCHEMA,
      lineageStatus: LINEAGE_PASS,
      releaseId: runtime.releaseId,
      sourceReleaseWindows: runtime.sourceReleaseWindows,
    })),
    backupRestoreEvidenceSha256: sha256("not_applicable_read_only_no_mutation\n"),
    rollbackTarget: "none:read-only:no-production-mutation",
    observationContractSha256: sha256(canonicalJson(execution.prerequisites)),
    policySha256: manifest.policySha256,
    revocationEpoch: 2,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    maxExecutions: 1,
    packageAssertions: {
      dynamicPreflightCurrent: true,
      knownP0Open: false,
      pollutionCleanupManifestExact: true,
      productionWipAvailable: true,
      qualityThresholdChanged: false,
      requiredGatesPassed: true,
      rollbackVerified: true,
      scopeMatchesBlueprint: true,
      secretsPresentInEvidence: false,
    },
  };
  return request;
}

export async function prepareAdminUrl(input, output) {
  const fields = Buffer.from(input).toString("utf8").split("\0");
  ensure(fields.length === 3, "admin_input_fields_invalid");
  const [environment, containerUser, databaseName] = fields;
  const values = new Map();
  for (const line of environment.split(/\r?\n/u)) {
    if (!line) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u);
    ensure(match && !values.has(match[1]), "admin_environment_invalid");
    values.set(match[1], match[2]);
  }
  ensure(JSON.stringify([...values.keys()].sort())
      === JSON.stringify(["POSTGRES_PASSWORD", "POSTGRES_USER"]),
  "admin_environment_keys_invalid");
  ensure(values.get("POSTGRES_USER") === containerUser, "admin_user_mismatch");
  ensure(/^[a-z][a-z0-9_]{2,62}$/u.test(databaseName), "database_name_invalid");
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
  const parents = (await git(["rev-list", "--parents", "-n", "1", "HEAD"]))
    .split(" ").slice(1);
  ensure(parents.length === 1, "source_parent_count_invalid");
  const diff = `${await git(["diff-tree", "--no-commit-id", "--name-status", "-r", "HEAD"])}\n`;
  const paths = `${(await git(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]))
    .split("\n").filter(Boolean).sort().join("\n")}\n`;
  const pointer = JSON.parse(await readFile(resolve(root, ".autonomy/latest-gate-result.json"), "utf8"));
  const gateBytes = await readFile(resolve(root, pointer.resultPath));
  ensure(sha256(gateBytes) === pointer.resultSha256, "gate_pointer_hash_invalid");
  const gate = JSON.parse(gateBytes);
  ensure(gate.status === "pass" && gate.gitHead === sourceCommit && gate.gitTree === sourceTree,
    "gate_source_identity_invalid");
  return {
    sourceCommit,
    sourceTree,
    sourceParentCommit: parents[0],
    sourceDiffSha256: sha256(diff),
    sourcePathSetSha256: sha256(paths),
    gateEvidenceSha256: pointer.resultSha256,
    policySha256: sha256(await readFile(resolve(root, POLICY_PATH))),
  };
}

export async function buildTransportBundle({
  root = process.cwd(), output, sourceIdentity = null, approvalEligible = true,
}) {
  const contract = await validateProductionExecutionContract(root);
  ensure(contract.status === "PASS_CURRENT_CYCLE_UNIFIED_RECONCILIATION_PRODUCTION_PACKET_LOCAL",
    "contract_not_pass");
  if (approvalEligible) ensure(sourceIdentity?.sourceCommit, "source_identity_missing");
  const temporaryRoot = await mkdtemp(join(tmpdir(), "candidate-current-cycle-reconciliation-bundle-"));
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
      schemaVersion: "wp-g0.2-current-cycle-reconciliation-transport.v3",
      packageId: PACKAGE_ID,
      sourceCommit: sourceIdentity?.sourceCommit ?? null,
      sourceTree: sourceIdentity?.sourceTree ?? null,
      sourceParentCommit: sourceIdentity?.sourceParentCommit ?? null,
      sourceDiffSha256: sourceIdentity?.sourceDiffSha256 ?? null,
      sourcePathSetSha256: sourceIdentity?.sourcePathSetSha256 ?? null,
      gateEvidenceSha256: sourceIdentity?.gateEvidenceSha256 ?? null,
      policySha256: sourceIdentity?.policySha256 ?? null,
      approvalEligible,
      executionContractSha256: contract.executionContractSha256,
      preparationContractSha256: contract.preparationContractSha256,
      preparationRunnerArtifactSha256: contract.preparationRunnerArtifactSha256,
      runnerArtifactSha256: contract.runnerArtifactSha256,
      transportArtifactSha256: transport.sha256,
      transportMethod: "approved_orcaterm_bundle_upload",
      transportBundleSha256: "bound_after_archive_creation",
      bundleMarker: ".transport-bundle.sha256",
      reproducibleArchive: true,
      archiveFormat: "ustar+gzip-n",
      sourceDateEpoch: SOURCE_DATE_EPOCH,
      containsSecrets: false,
      sessionIndependentExecutionRequired: true,
      services: [],
      files: TRANSPORT_FILES,
      fileSha256: transport.checksums,
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
      maxBuffer: 8 * 1024 * 1024,
    });
    ensure(Buffer.isBuffer(bytes), "bundle_not_binary");
    const outputPath = resolve(output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes, { mode: 0o600 });
    return {
      status: approvalEligible
        ? "PASS_FINAL_CURRENT_CYCLE_RECONCILIATION_TRANSPORT_BUNDLE"
        : "PASS_LOCAL_CURRENT_CYCLE_RECONCILIATION_TRANSPORT_TEMPLATE",
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
    ensure(rest[index]?.startsWith("--") && rest[index + 1], "argument_invalid");
    options[rest[index].slice(2)] = rest[index + 1];
  }
  return { command, options };
}

async function standardInput() {
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
    if (!result.status.startsWith("PASS_")) process.exitCode = 2;
    return;
  }
  if (command === "validate-request") {
    const manifest = JSON.parse(await readFile(resolve(options.manifest), "utf8"));
    const request = JSON.parse(await readFile(resolve(options.request), "utf8"));
    await verifyStagedTransport(root, manifest);
    const [preparation, execution] = await Promise.all([
      readFile(resolve(root, PREPARATION_CONTRACT_PATH), "utf8").then(JSON.parse),
      readFile(resolve(root, EXECUTION_CONTRACT_PATH), "utf8").then(JSON.parse),
    ]);
    await validateProductionExecutionRequest(
      request, manifest, preparation, execution, options["bundle-sha256"],
    );
    process.stdout.write('{"status":"pass","requestValid":true,"lineageEvidenceValidated":true,"secretsPrinted":false}\n');
    return;
  }
  if (command === "prepare-admin-url") {
    process.stdout.write(`${JSON.stringify(await prepareAdminUrl(await standardInput(), options.output))}\n`);
    return;
  }
  if (command === "request") {
    const [manifest, runtime, preparation, execution] = await Promise.all([
      readFile(resolve(options.manifest), "utf8").then(JSON.parse),
      readFile(resolve(options.runtime), "utf8").then(JSON.parse),
      readFile(resolve(root, PREPARATION_CONTRACT_PATH), "utf8").then(JSON.parse),
      readFile(resolve(root, EXECUTION_CONTRACT_PATH), "utf8").then(JSON.parse),
    ]);
    const request = createProductionExecutionRequest({
      manifest, execution, preparation, bundleSha256: options["bundle-sha256"], runtime,
    });
    await validateProductionExecutionRequest(
      request, manifest, preparation, execution, options["bundle-sha256"],
      { verifyEvidence: options["skip-evidence"] !== "true" },
    );
    await writeFile(resolve(options.output), `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write('{"status":"pass","requestGenerated":true,"secretsPrinted":false}\n');
    return;
  }
  const clean = (await execFileAsync("git", ["-C", root, "status", "--porcelain"]))
    .stdout.trim() === "";
  const sourceIdentity = clean ? await currentSourceIdentity(root) : null;
  const output = options.output ?? join(root,
    "reports/wp-g0-2-current-cycle-unified-reconciliation-production-packet",
    `candidate-current-cycle-reconciliation-${sourceIdentity?.sourceCommit.slice(0, 12) ?? "precommit-template"}.tar.gz`);
  process.stdout.write(`${JSON.stringify(await buildTransportBundle({
    root, output, sourceIdentity, approvalEligible: clean,
  }), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "fail", reason: error?.message ?? "unexpected_error" })}\n`);
    process.exitCode = 1;
  });
}
