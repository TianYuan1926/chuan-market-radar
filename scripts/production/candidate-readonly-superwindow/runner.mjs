#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PACKAGE_ID = "WP-G0.2-CURRENT-CYCLE-READ-ONLY-VERIFICATION-SUPERWINDOW";
export const CONTRACT_SCHEMA = "wp-g0.2-current-cycle-read-only-verification-superwindow.v2";
export const REQUEST_SCHEMA = "wp-g0.2-current-cycle-read-only-verification-superwindow-request.v2";
export const SUMMARY_SCHEMA = "wp-g0.2-current-cycle-read-only-verification-superwindow-evidence.v2";
export const SUMMARY_PASS = "PASS_CURRENT_CYCLE_READ_ONLY_VERIFICATION_SUPERWINDOW";
export const OBSERVATION_PASS = "PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE";
export const LINEAGE_PASS = "PASS_CURRENT_CYCLE_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH";
export const RECONCILIATION_PASS =
  "PASS_CURRENT_CYCLE_UNIFIED_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL";
export const CODE_PRESENCE_PASS = "PASS_PRODUCTION_SHADOW_VERIFY_CODE_PRESENCE_VERIFIED";
export const SEQUENCE = Object.freeze([
  "shadow_verify_code_presence",
  "current_cycle_lineage",
  "current_cycle_reconciliation",
]);
export const PRODUCTION_ROOT = "/home/ubuntu/apps/chuan-market-radar";
export const TRUST_ROOT = "/home/ubuntu/.local/state/market-radar-autonomy";
export const POSTGRES_ADMIN_ENV =
  "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env";
export const PRODUCTION_COMMIT = "47741f3222247562843932b01607a1ec3abb534e";
export const PRODUCTION_TREE = "bff1d1b3f27a0608004c379189bd1adc038477ec";
export const PRODUCTION_MIGRATION = "candidate-episode-v1-cycle-7";
export const PRODUCTION_RELEASE = "candidate-shadow-cycle-7-47741f3";
export const BUILD_RECORD_PATH =
  "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-cycle-continuation-47741f322224-1959d0a2/target-images-redacted.json";
export const GRANT_ID = "MR-G0-G8-USER-STANDING-GRANT-20260714-034826";

const HASH = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const IMAGE = /^sha256:[0-9a-f]{64}$/u;
const CONTAINER = /^[0-9a-f]{12,64}$/u;
const STAGING =
  /^\/home\/ubuntu\/\.cache\/market-radar-ops\/wp-g0-2-current-cycle-read-only-superwindow-[a-z0-9][a-z0-9._-]{7,80}$/u;
const EVIDENCE =
  /^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/wp-g0-2-current-cycle-read-only-superwindow-[a-z0-9][a-z0-9._-]{7,100}$/u;
const UNIT = /^market-radar-current-cycle-readonly-superwindow-[a-z0-9][a-z0-9-]{7,48}$/u;
const OBSERVATION_DIRECTORY =
  /^\/home\/ubuntu\/\.cache\/market-radar-ops\/cycle-continuation-ops\/wp-g0-2-cycle-continuation-[a-z0-9][a-z0-9._-]{7,100}\/observation$/u;

const RUNTIME_KEYS = Object.freeze([
  "buildRecordPath", "buildRecordSha256", "buildRecordWebImageId", "captureSpecification",
  "composeSha256", "currentWebContainerId", "currentWebImageId", "healthLevel",
  "postgresAdminEnvPath", "productionCommit", "productionEnvSha256", "productionTree",
  "scanFreshness",
]);
const REQUEST_KEYS = Object.freeze([
  "approvalExpiresAt", "approvalIssuedAt", "approvedPacketCommit", "approvedPacketTree",
  "approvedRunnerArtifactSha256", "authorization", "autonomyTrustRoot", "childPackets",
  "evidenceDirectory", "executeReadOnlySuperwindow", "operator", "packageId",
  "productionMutationAllowed", "productionRoot", "runnerUnitName", "runtime", "sequence",
  "services", "sessionIndependentExecutionRequired", "stagingDirectory",
  "temporaryArtifactCleanupRequired", "transportBundleSha256", "transportMethod",
]);
const AUTHORIZATION_KEYS = Object.freeze([
  "actionClass", "approvedBy", "expiresAt", "grantId", "issuedAt", "maxExecutions",
  "mode", "nonce", "packageId", "riskTier", "scope", "schemaVersion",
  "strictSequentialFailClosed",
]);
const CHILD_KEYS = Object.freeze(["archivePath", "packageId", "sha256"]);
const CHILD_NAMES = Object.freeze([
  "codePresence",
  "lineage",
  "reconciliation",
]);

export class ReadOnlySuperwindowError extends Error {}

function ensure(condition, reason) {
  if (!condition) throw new ReadOnlySuperwindowError(reason);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function timestamp(value, reason) {
  const parsed = Date.parse(value);
  ensure(Number.isFinite(parsed), reason);
  return parsed;
}

function validateObservationGroup(group, productionCommit) {
  const keys = [
    "authorityEpoch", "closeoutPath", "closeoutSha256", "commit", "finalPath",
    "finalSha256", "migrationId", "releaseId", "samplesPath", "samplesSha256",
  ];
  ensure(exactKeys(group, keys), "capture_group_keys_mismatch");
  const directory = dirname(group.finalPath ?? "");
  ensure(OBSERVATION_DIRECTORY.test(directory)
      && group.samplesPath === `${directory}/cycle-observation-samples.jsonl`
      && group.closeoutPath === `${directory}/cycle-observation-closeout.json`
      && basename(group.finalPath) === "cycle-observation-final.json",
  "capture_group_paths_invalid");
  ensure(COMMIT.test(group.commit ?? "") && group.commit === productionCommit,
    "capture_group_commit_invalid");
  ensure(Number.isSafeInteger(group.authorityEpoch) && group.authorityEpoch >= 1
      && group.authorityEpoch % 2 === 1,
  "capture_group_epoch_invalid");
  ensure(group.migrationId === PRODUCTION_MIGRATION
      && group.releaseId === PRODUCTION_RELEASE,
  "capture_group_release_invalid");
  for (const key of ["closeoutSha256", "finalSha256", "samplesSha256"]) {
    ensure(HASH.test(group[key] ?? ""), `capture_group_${key}_invalid`);
  }
  return group;
}

export function validateCaptureSpecification(specification, productionCommit) {
  ensure(exactKeys(specification, [
    "outputSchemaVersion", "packageId", "productionMutationAllowed", "schemaVersion", "unified",
  ]), "capture_specification_keys_mismatch");
  ensure(specification.schemaVersion === "candidate-lineage-capture-specification.v3"
      && specification.packageId
        === "WP-G0.2-CURRENT-CYCLE-UNIFIED-LINEAGE-CAPTURE-PRODUCTION-PACKET"
      && specification.outputSchemaVersion === "candidate-multi-cycle-lineage-evidence.v3"
      && specification.productionMutationAllowed === false,
  "capture_specification_identity_invalid");
  validateObservationGroup(specification.unified, productionCommit);
  return specification;
}

export function validateRuntime(runtime) {
  ensure(exactKeys(runtime, RUNTIME_KEYS), "runtime_keys_mismatch");
  ensure(runtime.productionCommit === PRODUCTION_COMMIT
      && runtime.productionTree === PRODUCTION_TREE,
    "runtime_git_identity_invalid");
  ensure(IMAGE.test(runtime.currentWebImageId ?? "")
      && runtime.currentWebImageId === runtime.buildRecordWebImageId
      && CONTAINER.test(runtime.currentWebContainerId ?? ""),
  "runtime_web_identity_invalid");
  ensure(runtime.buildRecordPath === BUILD_RECORD_PATH
      && runtime.postgresAdminEnvPath === POSTGRES_ADMIN_ENV,
  "runtime_stable_path_invalid");
  for (const key of ["buildRecordSha256", "composeSha256", "productionEnvSha256"]) {
    ensure(HASH.test(runtime[key] ?? ""), `runtime_${key}_invalid`);
  }
  ensure(runtime.healthLevel === "ready" && runtime.scanFreshness === "fresh",
    "runtime_health_not_ready_fresh");
  validateCaptureSpecification(runtime.captureSpecification, runtime.productionCommit);
  return runtime;
}

async function privateRegularFile(path, reason, maximumBytes = 64 * 1024 * 1024) {
  const metadata = await lstat(path);
  ensure(metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1
      && (metadata.mode & 0o077) === 0
      && metadata.size > 0 && metadata.size <= maximumBytes,
  reason);
  return metadata;
}

export async function verifyRuntimeEvidence(runtime) {
  validateRuntime(runtime);
  const group = runtime.captureSpecification.unified;
  for (const [path, expected, reason, maximum] of [
    [group.finalPath, group.finalSha256, "observation_final_invalid", 2 * 1024 * 1024],
    [group.samplesPath, group.samplesSha256, "observation_samples_invalid", 64 * 1024 * 1024],
    [group.closeoutPath, group.closeoutSha256, "observation_closeout_invalid", 512 * 1024],
    [runtime.buildRecordPath, runtime.buildRecordSha256, "build_record_invalid", 512 * 1024],
  ]) {
    await privateRegularFile(path, reason, maximum);
    ensure(sha256(await readFile(path)) === expected, `${reason}_checksum_mismatch`);
  }
  const final = JSON.parse(await readFile(group.finalPath, "utf8"));
  validateObservationFinal(final, runtime);
  const closeout = JSON.parse(await readFile(group.closeoutPath, "utf8"));
  ensure(closeout.schemaVersion === "candidate-cycle-observation-closeout.v1"
      && closeout.outcome === OBSERVATION_PASS && closeout.secretsPrinted === false,
  "observation_closeout_invalid");
  const buildRecord = JSON.parse(await readFile(runtime.buildRecordPath, "utf8"));
  ensure(buildRecord.schemaVersion === "candidate-cycle-target-images.v1"
      && buildRecord.webImageId === runtime.currentWebImageId
      && buildRecord.secretsPrinted === false,
  "build_record_identity_invalid");
  return { final, closeout, buildRecord };
}

export function validateObservationFinal(final, runtime) {
  validateRuntime(runtime);
  const group = runtime.captureSpecification.unified;
  ensure(final.schemaVersion === "candidate-validation-cycle-observation.v2"
      && final.status === OBSERVATION_PASS
      && final.commit === runtime.productionCommit
      && final.migrationId === group.migrationId
      && final.releaseId === group.releaseId
      && final.authorityEpoch === group.authorityEpoch,
  "observation_final_identity_invalid");
  ensure(final.completedWrites >= 10_000 && final.samples >= 289
      && final.activationSamples >= 289 && final.elapsedSeconds >= 86_400
      && final.activationCoverageSeconds >= 86_400
      && final.minimumComparedWrites === 10_000
      && final.minimumActivationSamples === 289 && final.minimumActivationHours === 24
      && final.completionAdvances >= 2 && final.unresolvedOutbox === 0
      && final.accumulationReady === true && final.freshActivationReady === true
      && final.thresholdsChanged === false
      && final.productionReconciliationExecuted === false
      && final.shadowVerifyStarted === false && final.canonicalAuthorityChanged === false
      && final.g0Completed === false,
  "observation_final_quality_gate_failed");
  return final;
}

function validateChildPackets(childPackets, manifestChildren) {
  ensure(exactKeys(childPackets, CHILD_NAMES) && exactKeys(manifestChildren, CHILD_NAMES),
    "child_packet_names_invalid");
  for (const name of CHILD_NAMES) {
    const child = childPackets[name];
    const expected = manifestChildren[name];
    ensure(exactKeys(child, CHILD_KEYS)
        && child.packageId === expected.packageId
        && child.archivePath === expected.archivePath
        && child.sha256 === expected.sha256
        && HASH.test(child.sha256 ?? "")
        && /^packets\/[a-z0-9][a-z0-9-]{7,80}\.tar\.gz$/u.test(child.archivePath ?? ""),
    `child_packet_binding_invalid:${name}`);
  }
  return childPackets;
}

export function createExecutionRequest({
  bundleSha256,
  manifest,
  runtime,
  stagingDirectory,
  now = new Date(),
  nonce = randomUUID(),
}) {
  validateRuntime(runtime);
  ensure(HASH.test(bundleSha256 ?? "") && STAGING.test(stagingDirectory ?? ""),
    "request_creation_input_invalid");
  const issuedAt = new Date(now);
  ensure(Number.isFinite(issuedAt.getTime()), "request_time_invalid");
  const expiresAt = new Date(issuedAt.getTime() + 89 * 60_000);
  const suffix = `${manifest.sourceCommit.slice(0, 12)}-${nonce.replaceAll("-", "").slice(0, 8)}`;
  return {
    packageId: PACKAGE_ID,
    executeReadOnlySuperwindow: true,
    productionMutationAllowed: false,
    services: [],
    sequence: [...SEQUENCE],
    sessionIndependentExecutionRequired: true,
    temporaryArtifactCleanupRequired: true,
    transportMethod: "approved_orcaterm_bundle_upload",
    transportBundleSha256: bundleSha256,
    approvedPacketCommit: manifest.sourceCommit,
    approvedPacketTree: manifest.sourceTree,
    approvedRunnerArtifactSha256: manifest.runnerArtifactSha256,
    productionRoot: PRODUCTION_ROOT,
    stagingDirectory,
    evidenceDirectory:
      `/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-current-cycle-read-only-superwindow-${suffix}`,
    runnerUnitName:
      `market-radar-current-cycle-readonly-superwindow-${manifest.sourceCommit.slice(0, 7)}-${nonce.replaceAll("-", "").slice(0, 8)}`,
    autonomyTrustRoot: TRUST_ROOT,
    childPackets: structuredClone(manifest.children),
    runtime,
    approvalIssuedAt: issuedAt.toISOString(),
    approvalExpiresAt: expiresAt.toISOString(),
    operator: "codex-primary",
    authorization: {
      schemaVersion: "wp-g0.2-current-cycle-read-only-superwindow-authorization.v2",
      mode: "g0_g8_standing_user_grant",
      approvedBy: "user_standing_grant",
      grantId: GRANT_ID,
      nonce,
      packageId: PACKAGE_ID,
      scope: PACKAGE_ID,
      actionClass: "read_only_production_preflight",
      riskTier: "R0_READ_ONLY",
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      maxExecutions: 1,
      strictSequentialFailClosed: true,
    },
  };
}

export async function validateExecutionRequest(request, manifest, bundleSha256, {
  now = new Date(), verifyEvidence = true,
} = {}) {
  ensure(exactKeys(request, REQUEST_KEYS), "request_keys_mismatch");
  ensure(request.packageId === PACKAGE_ID && request.executeReadOnlySuperwindow === true
      && request.productionMutationAllowed === false && Array.isArray(request.services)
      && request.services.length === 0 && JSON.stringify(request.sequence) === JSON.stringify(SEQUENCE),
  "request_identity_invalid");
  ensure(request.sessionIndependentExecutionRequired === true
      && request.temporaryArtifactCleanupRequired === true
      && request.transportMethod === "approved_orcaterm_bundle_upload"
      && request.productionRoot === PRODUCTION_ROOT && request.autonomyTrustRoot === TRUST_ROOT,
  "request_execution_boundary_invalid");
  ensure(HASH.test(bundleSha256 ?? "") && request.transportBundleSha256 === bundleSha256,
    "request_bundle_binding_invalid");
  ensure(request.approvedPacketCommit === manifest.sourceCommit
      && request.approvedPacketTree === manifest.sourceTree
      && request.approvedRunnerArtifactSha256 === manifest.runnerArtifactSha256,
  "request_packet_binding_invalid");
  ensure(STAGING.test(request.stagingDirectory ?? "")
      && EVIDENCE.test(request.evidenceDirectory ?? "")
      && UNIT.test(request.runnerUnitName ?? "") && request.operator === "codex-primary",
  "request_path_or_operator_invalid");
  validateChildPackets(request.childPackets, manifest.children);
  validateRuntime(request.runtime);
  ensure(exactKeys(request.authorization, AUTHORIZATION_KEYS)
      && request.authorization.schemaVersion
        === "wp-g0.2-current-cycle-read-only-superwindow-authorization.v2"
      && request.authorization.mode === "g0_g8_standing_user_grant"
      && request.authorization.approvedBy === "user_standing_grant"
      && request.authorization.grantId === GRANT_ID
      && request.authorization.packageId === PACKAGE_ID
      && request.authorization.scope === PACKAGE_ID
      && request.authorization.actionClass === "read_only_production_preflight"
      && request.authorization.riskTier === "R0_READ_ONLY"
      && request.authorization.maxExecutions === 1
      && request.authorization.strictSequentialFailClosed === true,
  "request_authorization_invalid");
  const issuedAt = timestamp(request.approvalIssuedAt, "request_issued_at_invalid");
  const expiresAt = timestamp(request.approvalExpiresAt, "request_expires_at_invalid");
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  ensure(request.authorization.issuedAt === request.approvalIssuedAt
      && request.authorization.expiresAt === request.approvalExpiresAt
      && expiresAt - issuedAt === 89 * 60_000 && nowMs >= issuedAt && nowMs < expiresAt,
  "request_window_invalid");
  if (verifyEvidence) await verifyRuntimeEvidence(request.runtime);
  return request;
}

async function readBoundAuditFile(evidenceRoot, file, expectedSha256, label) {
  ensure(typeof evidenceRoot === "string" && evidenceRoot.length > 0,
    "summary_evidence_root_required");
  ensure(/^[a-z0-9][a-z0-9-]{7,80}\.(?:json|jsonl)$/u.test(file ?? ""),
    `summary_${label}_file_invalid`);
  const path = resolve(evidenceRoot, file);
  ensure(dirname(path) === resolve(evidenceRoot), `summary_${label}_path_escape`);
  await privateRegularFile(path, `summary_${label}_not_private_regular`, 4 * 1024 * 1024);
  const bytes = await readFile(path);
  ensure(sha256(bytes) === expectedSha256, `summary_${label}_checksum_mismatch`);
  return bytes;
}

function validateChildAuthorization(request, item, summary) {
  const authorization = item.step === "shadow_verify_code_presence"
    ? request.authorization
    : request.autonomyAuthorization;
  ensure(authorization?.schemaVersion === item.authorizationSchemaVersion
      && authorization.mode === item.authorizationMode
      && authorization.grantId === item.authorizationGrantId
      && authorization.approvalId === item.authorizationApprovalId
      && authorization.packageId === item.packageId
      && authorization.scope === item.packageId
      && authorization.actionClass === "read_only_production_preflight"
      && authorization.riskTier === "R0_READ_ONLY"
      && authorization.maxExecutions === 1,
  `summary_child_authorization_invalid:${item.step}`);
  ensure(request.transportBundleSha256 === item.transportBundleSha256,
    `summary_child_transport_binding_invalid:${item.step}`);
  if (item.step === "shadow_verify_code_presence") {
    ensure(request.productionCommit === PRODUCTION_COMMIT
        && request.productionTree === PRODUCTION_TREE
        && request.currentWebImageId === summary.productionWebImageId
        && request.buildRecordPath === BUILD_RECORD_PATH,
    "summary_code_presence_request_identity_invalid");
  } else if (item.step === "current_cycle_lineage") {
    const unified = request.captureSpecification?.unified;
    ensure(request.approvedProductionCommit === PRODUCTION_COMMIT
        && request.webImageId === summary.productionWebImageId
        && unified?.commit === PRODUCTION_COMMIT
        && unified.migrationId === PRODUCTION_MIGRATION
        && unified.releaseId === PRODUCTION_RELEASE,
    "summary_lineage_request_identity_invalid");
  } else {
    const current = request.sourceReleaseWindows?.at(-1);
    ensure(request.approvedProductionCommit === PRODUCTION_COMMIT
        && request.webImageId === summary.productionWebImageId
        && request.sourceReleaseWindows?.length === 7
        && current?.migrationId === PRODUCTION_MIGRATION
        && current.releaseId === PRODUCTION_RELEASE,
    "summary_reconciliation_request_identity_invalid");
  }
  return authorization;
}

function validateChildEvidence(evidence, item, summary, lineageSha256) {
  ensure(evidence.status === item.status,
    `summary_child_evidence_identity_invalid:${item.step}`);
  if (item.step === "shadow_verify_code_presence") {
    ensure(evidence.schemaVersion === "candidate-shadow-verify-code-presence-evidence.v1"
        && evidence.packageId === item.packageId
        && evidence.productionCommit === PRODUCTION_COMMIT
        && evidence.productionTree === PRODUCTION_TREE
        && evidence.targetCommit === PRODUCTION_COMMIT
        && evidence.targetWebImageId === summary.productionWebImageId
        && evidence.runningWebMatchesBuildRecord === true
        && evidence.servicesMutated?.length === 0,
    "summary_code_presence_evidence_invalid");
  } else if (item.step === "current_cycle_lineage") {
    ensure(evidence.schemaVersion === "candidate-multi-cycle-lineage-evidence.v3"
        && evidence.currentMigrationId === PRODUCTION_MIGRATION
        && evidence.currentReleaseId === PRODUCTION_RELEASE
        && evidence.sourceReleaseCount === 7 && evidence.validationCycle === 7
        && evidence.sourceReleaseWindows?.length === 7
        && evidence.completedWrites >= 10_000 && evidence.unresolvedOutbox === 0
        && evidence.g0Completed === false,
    "summary_lineage_evidence_invalid");
  } else {
    ensure(evidence.schemaVersion === "candidate-multi-cycle-reconciliation-evidence.v3"
        && evidence.verificationMigrationId === PRODUCTION_MIGRATION
        && evidence.sourceReleaseCount === 7 && evidence.comparedWrites >= 10_000
        && evidence.comparisonDifferences === 0 && evidence.g0Completed === false
        && evidence.productionRankingInputsUsed === false
        && evidence.futureOutcomeInputsUsed === false,
    "summary_reconciliation_evidence_invalid");
    ensure(item.lineageEvidenceSha256 === lineageSha256,
      "summary_reconciliation_lineage_binding_invalid");
  }
}

async function validateLeaseEvidence(evidenceRoot, item, authorization) {
  if (!item.leaseRequired) {
    ensure(item.leaseExecutionFile === null && item.leaseExecutionSha256 === null
        && item.leaseEventsFile === null && item.leaseEventsSha256 === null,
    `summary_unexpected_child_lease:${item.step}`);
    return;
  }
  const [executionBytes, eventsBytes] = await Promise.all([
    readBoundAuditFile(evidenceRoot, item.leaseExecutionFile,
      item.leaseExecutionSha256, `${item.step}_lease_execution`),
    readBoundAuditFile(evidenceRoot, item.leaseEventsFile,
      item.leaseEventsSha256, `${item.step}_lease_events`),
  ]);
  const execution = JSON.parse(executionBytes);
  ensure(execution.schemaVersion === "market-radar-production-lease-execution.v1"
      && execution.grantId === authorization.grantId
      && execution.approvalId === authorization.approvalId
      && execution.packageId === item.packageId
      && execution.status === "released" && execution.outcome === "PASS",
  `summary_child_lease_execution_invalid:${item.step}`);
  const events = eventsBytes.toString("utf8").trim().split("\n").map(JSON.parse);
  ensure(events.length >= 4 && events.some((event) => event.status === "consumed")
      && events.at(-1)?.status === "released" && events.at(-1)?.outcome === "PASS"
      && events.every((event) => event.leaseId === execution.leaseId),
  `summary_child_lease_events_invalid:${item.step}`);
}

export async function validateFinalSummary(summary, evidenceRoot) {
  const keys = [
    "buildRecordSha256", "canonicalAuthorityChanged", "childEvidence", "completedAt",
    "composeMutation", "databaseMutation", "environmentMutation", "featureFlagMutation",
    "g0Completed", "gitMutation", "manifestMutation", "migrationId", "migrationMutation",
    "packageId", "packetCommit", "packetTree", "phaseTransition", "productionCommit",
    "productionMutationAllowed", "productionTree", "productionWebImageId", "redisMutation",
    "releaseId", "schemaVersion", "sequence", "servicesMutated", "startedAt", "status",
    "transportBundleSha256", "workerMutation",
  ];
  ensure(exactKeys(summary, keys), "summary_keys_mismatch");
  ensure(summary.schemaVersion === SUMMARY_SCHEMA && summary.status === SUMMARY_PASS
      && summary.packageId === PACKAGE_ID && summary.productionMutationAllowed === false
      && JSON.stringify(summary.sequence) === JSON.stringify(SEQUENCE)
      && Array.isArray(summary.servicesMutated) && summary.servicesMutated.length === 0
      && summary.productionCommit === PRODUCTION_COMMIT && summary.productionTree === PRODUCTION_TREE
      && summary.migrationId === PRODUCTION_MIGRATION && summary.releaseId === PRODUCTION_RELEASE
      && IMAGE.test(summary.productionWebImageId ?? "")
      && COMMIT.test(summary.packetCommit ?? "") && COMMIT.test(summary.packetTree ?? "")
      && HASH.test(summary.buildRecordSha256 ?? "")
      && HASH.test(summary.transportBundleSha256 ?? ""),
  "summary_identity_invalid");
  for (const key of [
    "canonicalAuthorityChanged", "composeMutation", "databaseMutation", "environmentMutation",
    "featureFlagMutation", "g0Completed", "gitMutation", "manifestMutation",
    "migrationMutation", "phaseTransition", "redisMutation", "workerMutation",
  ]) ensure(summary[key] === false, `summary_mutation_boundary_failed:${key}`);
  const expected = [
    ["shadow_verify_code_presence", CODE_PRESENCE_PASS,
      "WP-G0.2-SHADOW-VERIFY-PRODUCTION-CODE-PRESENCE-IDENTITY-REMEDIATION"],
    ["current_cycle_lineage", LINEAGE_PASS,
      "WP-G0.2-CURRENT-CYCLE-UNIFIED-LINEAGE-CAPTURE-PRODUCTION-PACKET"],
    ["current_cycle_reconciliation", RECONCILIATION_PASS,
      "WP-G0.2-CURRENT-CYCLE-UNIFIED-RECONCILIATION-PRODUCTION-PACKET"],
  ];
  ensure(Array.isArray(summary.childEvidence) && summary.childEvidence.length === expected.length,
    "summary_child_evidence_count_invalid");
  let lineageSha256 = null;
  const approvalIds = new Set();
  for (const [index, [step, status, packageId]] of expected.entries()) {
    const item = summary.childEvidence[index];
    ensure(exactKeys(item, [
      "authorizationApprovalId", "authorizationGrantId", "authorizationMode",
      "authorizationSchemaVersion", "evidenceFile", "evidenceSha256", "leaseEventsFile",
      "leaseEventsSha256", "leaseExecutionFile", "leaseExecutionSha256", "leaseRequired",
      "lineageEvidenceSha256", "manifestFile", "manifestSha256", "packageId", "requestFile",
      "requestSha256", "sourceEvidencePath", "status", "step", "transportBundleSha256",
    ]) && item.step === step && item.status === status && item.packageId === packageId
        && HASH.test(item.manifestSha256 ?? "") && HASH.test(item.requestSha256 ?? "")
        && HASH.test(item.evidenceSha256 ?? "") && HASH.test(item.transportBundleSha256 ?? "")
        && /^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/wp-g0-2-[a-z0-9][a-z0-9._/-]{7,180}\.json$/u
          .test(item.sourceEvidencePath ?? ""),
    `summary_child_evidence_invalid:${step}`);
    const [manifestBytes, requestBytes, evidenceBytes] = await Promise.all([
      readBoundAuditFile(evidenceRoot, item.manifestFile, item.manifestSha256, `${step}_manifest`),
      readBoundAuditFile(evidenceRoot, item.requestFile, item.requestSha256, `${step}_request`),
      readBoundAuditFile(evidenceRoot, item.evidenceFile, item.evidenceSha256, `${step}_evidence`),
    ]);
    const manifest = JSON.parse(manifestBytes);
    const request = JSON.parse(requestBytes);
    const evidence = JSON.parse(evidenceBytes);
    const schemas = [
      "wp-g0.2-shadow-verify-code-presence-transport.v2",
      "wp-g0.2-lineage-capture-transport.v2",
      "wp-g0.2-current-cycle-reconciliation-transport.v3",
    ];
    ensure(manifest.schemaVersion === schemas[index] && manifest.packageId === packageId
        && manifest.sourceCommit === summary.packetCommit && manifest.sourceTree === summary.packetTree,
    `summary_child_manifest_invalid:${step}`);
    const authorization = validateChildAuthorization(request, item, summary);
    approvalIds.add(authorization.approvalId);
    validateChildEvidence(evidence, item, summary, lineageSha256);
    if (step === "current_cycle_lineage") lineageSha256 = item.evidenceSha256;
    if (step === "current_cycle_reconciliation") {
      ensure(request.lineageEvidenceSha256 === lineageSha256,
        "summary_reconciliation_request_lineage_hash_invalid");
    }
    await validateLeaseEvidence(evidenceRoot, item, authorization);
  }
  ensure(approvalIds.size === expected.length, "summary_child_authorizations_not_independent");
  ensure(timestamp(summary.completedAt, "summary_completed_at_invalid")
      >= timestamp(summary.startedAt, "summary_started_at_invalid"),
  "summary_time_order_invalid");
  return summary;
}

async function main() {
  const [command, file] = process.argv.slice(2);
  ensure(command === "validate-summary" && file, "usage: runner.mjs validate-summary FILE");
  const summaryPath = resolve(file);
  await validateFinalSummary(JSON.parse(await readFile(summaryPath, "utf8")), dirname(summaryPath));
  process.stdout.write(`${JSON.stringify({ status: SUMMARY_PASS })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
