#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmod, cp, lstat, mkdir, mkdtemp, readFile, rm, utimes, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  loadLineageCaptureInputs,
  PACKAGE_ID,
  validateCaptureSpecification,
} from "./production-runner.mjs";

const execFileAsync = promisify(execFile);
export const EXECUTION_CONTRACT_PATH =
  "docs/governance/wp-g0-2-current-cycle-unified-lineage-capture-production-packet.v3.json";
export const LOCAL_CONTRACT_PATH =
  "docs/governance/wp-g0-2-current-cycle-unified-lineage-refresh-local-superpackage.v3.json";
const POLICY_PATH = "scripts/governance/autonomy-policy.mjs";
const TRUST_ROOT = "/home/ubuntu/.local/state/market-radar-autonomy";
const PRODUCTION_ROOT = "/home/ubuntu/apps/chuan-market-radar";
const POSTGRES_ADMIN_ENV =
  "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env";
const GRANT_ID = "MR-G0-G8-USER-STANDING-GRANT-20260714-034826";
const SOURCE_DATE_EPOCH = 946_684_800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);

const EXECUTION_RUNNER_FILES = Object.freeze([
  POLICY_PATH,
  "scripts/governance/autonomy-production-lease-cli.mjs",
  "scripts/governance/autonomy-production-lease.mjs",
  "scripts/production/candidate-cycle-continuation/observation-runner.mjs",
  "scripts/production/candidate-lineage/bundle.mjs",
  "scripts/production/candidate-lineage/production-entrypoint.sh",
  "scripts/production/candidate-lineage/production-runner.mjs",
  "scripts/production/candidate-lineage/production-runner.sh",
  "scripts/production/candidate-lineage/runner.mjs",
]);
export const TRANSPORT_FILES = Object.freeze([
  EXECUTION_CONTRACT_PATH,
  LOCAL_CONTRACT_PATH,
  ...EXECUTION_RUNNER_FILES,
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
  "autonomyAuthorization", "autonomyTrustRoot", "captureSpecification", "composeSha256",
  "evidenceDirectory", "executeReadOnlyLineageCapture", "operator", "opsRoot", "packageId",
  "postgresAdminEnvPath", "productionEnvSha256", "productionRoot", "runnerUnitName",
  "secureRoot", "services", "sessionIndependentExecutionRequired", "stagingDirectory",
  "temporaryArtifactCleanupRequired", "transportBundleSha256", "transportMethod", "webImageId",
]);

const RUNTIME_KEYS = Object.freeze([
  "approvedProductionCommit", "captureSpecification", "composeSha256",
  "postgresAdminEnvPath", "productionEnvSha256", "webImageId",
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

export async function validateProductionPacketContract(root = process.cwd()) {
  const [executionBytes, localBytes] = await Promise.all([
    readFile(resolve(root, EXECUTION_CONTRACT_PATH)),
    readFile(resolve(root, LOCAL_CONTRACT_PATH)),
  ]);
  const execution = JSON.parse(executionBytes);
  const local = JSON.parse(localBytes);
  const runnerArtifact = await artifact(root, execution.runnerArtifact?.files ?? []);
  const violations = [];
  if (execution.schemaVersion
      !== "wp-g0.2-current-cycle-unified-lineage-capture-production-packet.v3"
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
  if (JSON.stringify(execution.runnerArtifact?.files) !== JSON.stringify(EXECUTION_RUNNER_FILES)) {
    violations.push("runner_artifact_file_set");
  }
  if (runnerArtifact.fileCount !== EXECUTION_RUNNER_FILES.length
      || runnerArtifact.fileCount !== execution.runnerArtifact?.fileCount
      || runnerArtifact.sha256 !== execution.runnerArtifact?.sha256) violations.push("runner_artifact");
  if (local.schemaVersion
      !== "wp-g0.2-current-cycle-unified-lineage-refresh-local-superpackage.v3"
      || local.packageId
        !== "WP-G0.2-CURRENT-CYCLE-UNIFIED-LINEAGE-REFRESH-LOCAL-SUPERPACKAGE"
      || local.outputBoundary?.rawEvidenceHashesRequired !== 3
      || local.databaseBoundary?.forcedLocalRole !== "candidate_audit_role") {
    violations.push("local_contract_dependency");
  }
  if (execution.prerequisites?.unifiedStatus
      !== "PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE"
      || execution.prerequisites?.minimumActivationSamples !== 289
      || execution.prerequisites?.minimumActivationHours !== 24
      || execution.prerequisites?.minimumCompletedWrites !== 10_000
      || execution.prerequisites?.minimumSamples !== 7
      || execution.prerequisites?.minimumStabilitySeconds !== 1_800
      || execution.prerequisites?.minimumCompletionAdvances !== 2
      || execution.prerequisites?.maximumSampleGapSeconds !== 600
      || execution.prerequisites?.migrationId !== "candidate-episode-v1-cycle-5"
      || execution.prerequisites?.controlLineageExactCount !== 5
      || execution.prerequisites?.controlLineageCountDerivedFromMigrationId !== true
      || execution.prerequisites?.allFinalEvidenceRecomputedFromRawSamples !== true
      || execution.prerequisites?.completeDatabaseControlLineageRequired !== true
      || execution.prerequisites?.newExactRequestRequired !== true) violations.push("prerequisites");
  if (execution.execution?.runner !== "transient_systemd_unit"
      || execution.execution?.restart !== "no"
      || execution.execution?.runtimeMaxSeconds !== 3_600
      || execution.execution?.sessionIndependent !== true
      || execution.execution?.candidateWorkerRequired !== "running_healthy"
      || execution.execution?.runtimeHealthRequired !== "ready_fresh"
      || execution.execution?.approvedCurrentWebImageUsedAsRuntime !== true
      || execution.execution?.containerRootFilesystem !== "read_only"
      || execution.execution?.containerCapabilities !== "drop_all"
      || execution.execution?.containerNoNewPrivileges !== true) violations.push("execution_boundary");
  if (execution.databaseBoundary?.transactionIsolation !== "repeatable_read"
      || execution.databaseBoundary?.transactionReadOnly !== true
      || execution.databaseBoundary?.forcedLocalRole !== "candidate_audit_role"
      || execution.databaseBoundary?.minimumCompletedWrites !== 10_000
      || execution.databaseBoundary?.outsideLineageMaximum !== 0
      || execution.databaseBoundary?.unresolvedMaximum !== 0
      || execution.databaseBoundary?.ddlAllowed !== false
      || execution.databaseBoundary?.dmlAllowed !== false
      || execution.databaseBoundary?.migrationAllowed !== false
      || execution.databaseBoundary?.phaseTransitionAllowed !== false) violations.push("database_boundary");
  for (const [key, value] of Object.entries(execution.runtimeMutationBoundary ?? {})) {
    if (value !== (key === "evidenceAndLeaseFilesOnly")) {
      violations.push(`runtime_mutation_boundary:${key}`);
    }
  }
  if (execution.outputBoundary?.passStatus
      !== "PASS_CURRENT_CYCLE_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH"
      || execution.outputBoundary?.lineageSchemaVersion
        !== "candidate-multi-cycle-lineage-evidence.v3"
      || execution.outputBoundary?.semanticProvenanceHashesRequired !== 3
      || execution.outputBoundary?.rawSourceFileHashesRequired !== 3
      || execution.outputBoundary?.databaseIdentityEvidenceRequired !== true
      || execution.outputBoundary?.productionReconciliationExecuted !== false
      || execution.outputBoundary?.shadowVerifyStarted !== false
      || execution.outputBoundary?.canonicalAuthorityChanged !== false
      || execution.outputBoundary?.g0Completed !== false
      || execution.outputBoundary?.automaticNextStage !== false) violations.push("output_boundary");
  if (execution.transport?.containsSecrets !== false
      || execution.transport?.reproducibleArchive !== true
      || execution.transport?.temporaryArtifactCleanupRequired !== true
      || execution.transport?.sourceEvidencePreserved !== true
      || execution.transport?.outputEvidencePreserved !== true) violations.push("transport_boundary");
  for (const forbidden of [
    "observation_window_shortening", "sample_fabrication", "source_sync", "git_checkout",
    "service_recreate", "database_write", "schema_migration", "phase_transition",
    "lineage_relabeling", "automatic_reconciliation", "automatic_shadow_verify",
    "canonical_cutover", "production_ranking_change", "future_outcome_input", "formal_backtest",
  ]) if (!execution.forbidden?.includes(forbidden)) violations.push(`forbidden_missing:${forbidden}`);
  return {
    status: violations.length === 0 ? "PASS_LOCAL_LINEAGE_PRODUCTION_PACKET" : "FAIL",
    productionMutationAllowed: false,
    executionContractSha256: sha256(executionBytes),
    localContractSha256: sha256(localBytes),
    runnerArtifactSha256: runnerArtifact.sha256,
    violations,
  };
}

function evidenceDirectory(path, pattern, reason) {
  const directory = dirname(path ?? "");
  ensure(pattern.test(directory), reason);
  return directory;
}

function validateEvidencePaths(specification) {
  const cyclePattern =
    /^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/wp-g0-2-cycle-continuation-[a-z0-9][a-z0-9._-]{7,100}$/u;
  const unifiedDirectory = evidenceDirectory(
    specification.unified.finalPath, cyclePattern, "unified_evidence_directory_invalid",
  );
  const group = specification.unified;
  ensure(basename(group.finalPath) === "cycle-observation-final.json"
      && basename(group.samplesPath) === "cycle-observation-samples.jsonl"
      && basename(group.closeoutPath) === "cycle-observation-closeout.json"
      && dirname(group.finalPath) === dirname(group.samplesPath)
      && dirname(group.finalPath) === dirname(group.closeoutPath),
  "unified_evidence_paths_invalid");
  return { unifiedDirectory };
}

export async function verifyCaptureEvidence(specification) {
  validateCaptureSpecification(specification);
  validateEvidencePaths(specification);
  return loadLineageCaptureInputs(specification);
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
      && authorization.expiresAt === request.approvalExpiresAt,
  "authorization_time_binding_invalid");
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
  ensure(authorization.imageOrMigrationSha256 === sha256(canonicalJson(request.captureSpecification)),
    "authorization_capture_binding_mismatch");
  ensure(authorization.composeSha256 === request.composeSha256,
    "authorization_compose_binding_mismatch");
  ensure(authorization.environmentFingerprintSha256 === sha256(`${request.productionEnvSha256}\n`),
    "authorization_environment_binding_mismatch");
  ensure(authorization.productionIdentitySha256 === sha256(`${request.postgresAdminEnvPath}\n`),
    "authorization_identity_source_binding_mismatch");
  ensure(authorization.preflightSha256 === sha256(canonicalJson({
    approvedProductionCommit: request.approvedProductionCommit,
    captureSpecification: request.captureSpecification,
    composeSha256: request.composeSha256,
    productionEnvSha256: request.productionEnvSha256,
    webImageId: request.webImageId,
  })), "authorization_preflight_binding_mismatch");
  ensure(authorization.backupRestoreEvidenceSha256
      === sha256("not_applicable_read_only_no_mutation\n"),
  "authorization_recovery_binding_mismatch");
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
    ensure(authorization.packageAssertions[key] === expected, `authorization_assertion_failed:${key}`);
  }
}

export async function verifyStagedTransport(root, manifest) {
  const expectedKeys = [
    "approvalEligible", "archiveFormat", "bundleMarker", "containsSecrets",
    "executionContractSha256", "fileSha256", "files", "gateEvidenceSha256",
    "localContractSha256", "packageId", "policySha256", "reproducibleArchive",
    "runnerArtifactSha256", "schemaVersion", "services", "sessionIndependentExecutionRequired",
    "sourceCommit", "sourceDateEpoch", "sourceDiffSha256", "sourceParentCommit",
    "sourcePathSetSha256", "sourceTree", "transportArtifactSha256", "transportBundleSha256",
    "transportMethod",
  ];
  ensure(exactKeys(manifest, expectedKeys), "transport_manifest_keys_mismatch");
  ensure(manifest.schemaVersion === "wp-g0.2-lineage-capture-transport.v2"
      && manifest.packageId === PACKAGE_ID && manifest.approvalEligible === true,
  "transport_manifest_identity_invalid");
  ensure(manifest.containsSecrets === false && manifest.reproducibleArchive === true
      && manifest.archiveFormat === "ustar+gzip-n"
      && manifest.bundleMarker === ".transport-bundle.sha256"
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
    "executionContractSha256", "localContractSha256", "runnerArtifactSha256",
    "transportArtifactSha256",
  ]) assertHash(manifest[key], `transport_${key}_invalid`);
  const transport = await artifact(root, TRANSPORT_FILES);
  ensure(transport.sha256 === manifest.transportArtifactSha256, "transport_artifact_mismatch");
  for (const file of TRANSPORT_FILES) {
    ensure(transport.checksums[file] === manifest.fileSha256[file], `transport_file_mismatch:${file}`);
  }
  const contract = await validateProductionPacketContract(root);
  ensure(contract.status === "PASS_LOCAL_LINEAGE_PRODUCTION_PACKET", "transport_contract_not_pass");
  ensure(contract.executionContractSha256 === manifest.executionContractSha256
      && contract.localContractSha256 === manifest.localContractSha256
      && contract.runnerArtifactSha256 === manifest.runnerArtifactSha256,
  "transport_contract_binding_mismatch");
  return contract;
}

export async function validateProductionExecutionRequest(
  request,
  manifest,
  execution,
  bundleSha256,
  { now = new Date(), verifyEvidence = true } = {},
) {
  ensure(exactKeys(request, REQUEST_KEYS), "request_keys_mismatch");
  ensure(request.packageId === PACKAGE_ID && request.executeReadOnlyLineageCapture === true,
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
  for (const key of ["composeSha256", "productionEnvSha256"]) {
    assertHash(request[key], `request_${key}_invalid`);
  }
  validateCaptureSpecification(request.captureSpecification);
  validateEvidencePaths(request.captureSpecification);
  ensure(request.captureSpecification.unified.commit === request.approvedProductionCommit,
    "request_unified_commit_not_current_production");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/wp-g0-2-lineage-capture-[a-z0-9][a-z0-9._-]{7,80}$/u
    .test(request.stagingDirectory ?? ""), "request_staging_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/lineage-capture-ops\/wp-g0-2-lineage-capture-[a-z0-9][a-z0-9._-]{7,80}$/u
    .test(request.opsRoot ?? ""), "request_ops_invalid");
  ensure(/^\/home\/ubuntu\/\.local\/state\/market-radar-lineage-capture\/[a-z0-9][a-z0-9._-]{7,80}$/u
    .test(request.secureRoot ?? ""), "request_secure_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/wp-g0-2-candidate-lineage-[a-z0-9][a-z0-9._-]{7,100}$/u
    .test(request.evidenceDirectory ?? ""), "request_evidence_invalid");
  ensure(/^market-radar-lineage-capture-[a-z0-9][a-z0-9-]{7,48}$/u
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
  if (verifyEvidence) await verifyCaptureEvidence(request.captureSpecification);
  return request;
}

function validateRuntime(runtime) {
  ensure(exactKeys(runtime, RUNTIME_KEYS), "runtime_keys_mismatch");
  assertHash(runtime.approvedProductionCommit, "runtime_production_commit_invalid", 40);
  assertHash(runtime.webImageId?.replace(/^sha256:/u, ""), "runtime_web_image_invalid");
  assertHash(runtime.composeSha256, "runtime_compose_hash_invalid");
  assertHash(runtime.productionEnvSha256, "runtime_environment_hash_invalid");
  ensure(runtime.postgresAdminEnvPath === POSTGRES_ADMIN_ENV, "runtime_postgres_admin_env_invalid");
  validateCaptureSpecification(runtime.captureSpecification);
  validateEvidencePaths(runtime.captureSpecification);
  ensure(runtime.captureSpecification.unified.commit === runtime.approvedProductionCommit,
    "runtime_unified_commit_not_current_production");
  return runtime;
}

export function createProductionExecutionRequest({
  manifest,
  execution,
  bundleSha256,
  runtime,
  now = new Date(),
  approvalId = `MR-G0-LINEAGE-${randomUUID()}`,
  nonce = randomUUID(),
}) {
  validateRuntime(runtime);
  const issuedAt = new Date(now);
  const expiresAt = new Date(issuedAt.getTime() + 89 * 60_000);
  const suffix = `${manifest.sourceCommit.slice(0, 12)}-${nonce.replaceAll("-", "").slice(0, 8)}`;
  const request = {
    packageId: PACKAGE_ID,
    executeReadOnlyLineageCapture: true,
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
    stagingDirectory: `/home/ubuntu/.cache/market-radar-ops/wp-g0-2-lineage-capture-${suffix}`,
    opsRoot: `/home/ubuntu/.cache/market-radar-ops/lineage-capture-ops/wp-g0-2-lineage-capture-${suffix}`,
    secureRoot: `/home/ubuntu/.local/state/market-radar-lineage-capture/${suffix}`,
    evidenceDirectory: `/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-candidate-lineage-${suffix}`,
    runnerUnitName: `market-radar-lineage-capture-${manifest.sourceCommit.slice(0, 7)}-${nonce.replaceAll("-", "").slice(0, 8)}`,
    autonomyTrustRoot: TRUST_ROOT,
    postgresAdminEnvPath: runtime.postgresAdminEnvPath,
    webImageId: runtime.webImageId,
    composeSha256: runtime.composeSha256,
    productionEnvSha256: runtime.productionEnvSha256,
    captureSpecification: runtime.captureSpecification,
    approvalIssuedAt: issuedAt.toISOString(),
    approvalExpiresAt: expiresAt.toISOString(),
    approvalRef: `MR-G0-LINEAGE/${manifest.sourceCommit.slice(0, 12)}/${nonce.slice(0, 8)}`,
    operator: "codex-primary",
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
    imageOrMigrationSha256: sha256(canonicalJson(runtime.captureSpecification)),
    composeSha256: runtime.composeSha256,
    environmentFingerprintSha256: sha256(`${runtime.productionEnvSha256}\n`),
    productionIdentitySha256: sha256(`${runtime.postgresAdminEnvPath}\n`),
    gateEvidenceSha256: manifest.gateEvidenceSha256,
    preflightSha256: sha256(canonicalJson({
      approvedProductionCommit: runtime.approvedProductionCommit,
      captureSpecification: runtime.captureSpecification,
      composeSha256: runtime.composeSha256,
      productionEnvSha256: runtime.productionEnvSha256,
      webImageId: runtime.webImageId,
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
  const contract = await validateProductionPacketContract(root);
  ensure(contract.status === "PASS_LOCAL_LINEAGE_PRODUCTION_PACKET", "contract_not_pass");
  if (approvalEligible) ensure(sourceIdentity?.sourceCommit, "source_identity_missing");
  const temporaryRoot = await mkdtemp(join(tmpdir(), "candidate-lineage-bundle-"));
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
      schemaVersion: "wp-g0.2-lineage-capture-transport.v2",
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
      localContractSha256: contract.localContractSha256,
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
        ? "PASS_FINAL_LINEAGE_CAPTURE_TRANSPORT_BUNDLE"
        : "PASS_LOCAL_LINEAGE_CAPTURE_TRANSPORT_TEMPLATE",
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
    const result = await validateProductionPacketContract(root);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.status.startsWith("PASS_")) process.exitCode = 2;
    return;
  }
  if (command === "validate-request") {
    const [manifest, request, execution] = await Promise.all([
      readFile(resolve(options.manifest), "utf8").then(JSON.parse),
      readFile(resolve(options.request), "utf8").then(JSON.parse),
      readFile(resolve(root, EXECUTION_CONTRACT_PATH), "utf8").then(JSON.parse),
    ]);
    await verifyStagedTransport(root, manifest);
    await validateProductionExecutionRequest(
      request, manifest, execution, options["bundle-sha256"],
    );
    process.stdout.write("{\"status\":\"pass\",\"requestValid\":true,\"sourceEvidenceRecomputed\":true,\"secretsPrinted\":false}\n");
    return;
  }
  if (command === "prepare-admin-url") {
    process.stdout.write(`${JSON.stringify(await prepareAdminUrl(await standardInput(), options.output))}\n`);
    return;
  }
  if (command === "request") {
    const [manifest, runtime, execution] = await Promise.all([
      readFile(resolve(options.manifest), "utf8").then(JSON.parse),
      readFile(resolve(options.runtime), "utf8").then(JSON.parse),
      readFile(resolve(root, EXECUTION_CONTRACT_PATH), "utf8").then(JSON.parse),
    ]);
    const request = createProductionExecutionRequest({
      manifest, execution, bundleSha256: options["bundle-sha256"], runtime,
    });
    await validateProductionExecutionRequest(
      request, manifest, execution, options["bundle-sha256"],
      { verifyEvidence: options["skip-evidence"] !== "true" },
    );
    await writeFile(resolve(options.output), `${JSON.stringify(request, null, 2)}\n`, {
      mode: 0o600,
    });
    process.stdout.write("{\"status\":\"pass\",\"requestGenerated\":true,\"secretsPrinted\":false}\n");
    return;
  }
  const clean = (await execFileAsync("git", ["-C", root, "status", "--porcelain"]))
    .stdout.trim() === "";
  const sourceIdentity = clean ? await currentSourceIdentity(root) : null;
  const output = options.output ?? join(root,
    "reports/wp-g0-2-current-cycle-unified-lineage-capture-production-packet",
    `candidate-lineage-capture-${sourceIdentity?.sourceCommit.slice(0, 12) ?? "precommit-template"}.tar.gz`);
  process.stdout.write(`${JSON.stringify(await buildTransportBundle({
    root, output, sourceIdentity, approvalEligible: clean,
  }), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      status: "fail", reason: error?.message ?? "unexpected_error", secretsPrinted: false,
    })}\n`);
    process.exitCode = 1;
  });
}
