import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";

import { REQUIRED_PACKAGE_APPROVAL_FIELDS } from "../../governance/autonomy-policy.mjs";

export const PACKAGE_ID =
  "WP-G0.2-CYCLE-5-TO-SHADOW-VERIFY-AUTOMATIC-HANDOFF-SUPERWINDOW";
export const PIPELINE_PASS = "PASS_SHADOW_VERIFY_HANDOFF_OBSERVER_ACTIVE";
export const REQUEST_PASS = "PASS_SHADOW_VERIFY_HANDOFF_EXECUTION_REQUEST";
export const REQUIRED_PRODUCTION_COMMIT = "94b6d415573f5d8b2d0190c809a4b8e128a25aa8";
export const PRODUCTION_ROOT = "/home/ubuntu/apps/chuan-market-radar";
export const TRUST_ROOT = "/home/ubuntu/.local/state/market-radar-autonomy";
export const POSTGRES_ADMIN_ENV =
  "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env";

const HASH = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const IMAGE = /^sha256:[0-9a-f]{64}$/u;
const CONTAINER = /^[0-9a-f]{12,64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const EVIDENCE = /^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/[a-z0-9][a-z0-9._/-]{7,240}\.json$/u;
const STAGING = /^\/home\/ubuntu\/\.cache\/market-radar-ops\/wp-g0-2-shadow-verify-handoff-[0-9a-f]{12}-[0-9a-f]{8}$/u;
const SEQUENCE = Object.freeze(["cycle5_readonly_superwindow", "shadow_verify_phase"]);
const CHILD_KEYS = Object.freeze(["readOnlySuperwindow", "shadowVerifyPhase"]);
const CHILD_PACKAGES = Object.freeze({
  readOnlySuperwindow: "WP-G0.2-CYCLE-5-READ-ONLY-VERIFICATION-SUPERWINDOW",
  shadowVerifyPhase: "WP-G0.2-SHADOW-VERIFY-PHASE-TRANSITION-AND-DUAL-READ-OBSERVATION",
});
const CHILD_ARCHIVES = Object.freeze({
  readOnlySuperwindow: "packets/cycle5-readonly-superwindow.tar.gz",
  shadowVerifyPhase: "packets/shadow-verify-phase.tar.gz",
});
const RUNTIME_KEYS = Object.freeze([
  "buildRecordPath", "buildRecordSha256", "buildRecordWebImageId", "captureSpecification",
  "composeSha256", "currentWebContainerId", "currentWebImageId", "cycle5Final", "healthLevel",
  "phase", "postgresAdminEnvPath", "productionCommit", "productionEnvSha256", "productionTree",
  "scanFreshness",
]);
const PHASE_RUNTIME_KEYS = Object.freeze([
  "baseEnvPath", "baseEnvSha256", "candidateWorkerContainerId", "candidateWorkerImageId",
  "identityOverridePath", "identityOverrideSha256", "identityWrapperPath",
  "identityWrapperSha256", "productionEnvPath", "targetProductionEnvSha256",
]);

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function validIso(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validateChildPackets(children, manifestChildren) {
  ensure(exactKeys(children, CHILD_KEYS) && exactKeys(manifestChildren, CHILD_KEYS),
    "child_packet_names_invalid");
  for (const key of CHILD_KEYS) {
    const child = children[key];
    const expected = manifestChildren[key];
    ensure(exactKeys(child, ["archivePath", "packageId", "sha256"])
        && child.packageId === CHILD_PACKAGES[key]
        && child.archivePath === CHILD_ARCHIVES[key]
        && child.sha256 === expected.sha256
        && child.packageId === expected.packageId
        && child.archivePath === expected.archivePath
        && HASH.test(child.sha256 ?? ""),
    `child_packet_binding_invalid:${key}`);
  }
  return children;
}

export function validateCycle5Final(final) {
  ensure(final?.schemaVersion === "candidate-validation-cycle-observation.v2"
      && final.status === "PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE"
      && final.commit === REQUIRED_PRODUCTION_COMMIT
      && final.migrationId === "candidate-episode-v1-cycle-5"
      && /^candidate-shadow-cycle-5-[a-z0-9][a-z0-9._-]{7,80}$/u.test(final.releaseId ?? "")
      && Number.isSafeInteger(final.authorityEpoch) && final.authorityEpoch >= 1
      && final.authorityEpoch % 2 === 1
      && final.samples >= 289 && final.activationSamples >= 289
      && final.elapsedSeconds >= 86400 && final.activationCoverageSeconds >= 86400
      && final.completedWrites >= 10000 && final.completionAdvances >= 2
      && final.accumulationReady === true && final.freshActivationReady === true
      && final.unresolvedOutbox === 0 && final.thresholdsChanged === false
      && final.productionReconciliationExecuted === false
      && final.shadowVerifyStarted === false
      && final.canonicalAuthorityChanged === false && final.g0Completed === false,
  "cycle5_final_not_pass");
  return final;
}

function validateCapture(runtime, final) {
  const capture = runtime.captureSpecification;
  const unified = capture?.unified;
  ensure(capture?.schemaVersion === "candidate-lineage-capture-specification.v3"
      && capture.packageId
        === "WP-G0.2-CURRENT-CYCLE-UNIFIED-LINEAGE-CAPTURE-PRODUCTION-PACKET"
      && capture.productionMutationAllowed === false
      && capture.outputSchemaVersion === "candidate-multi-cycle-lineage-evidence.v3"
      && unified?.authorityEpoch === final.authorityEpoch
      && unified.commit === final.commit
      && unified.migrationId === final.migrationId
      && unified.releaseId === final.releaseId,
  "capture_specification_invalid");
  for (const [pathKey, shaKey, suffix] of [
    ["finalPath", "finalSha256", "/cycle-observation-final.json"],
    ["samplesPath", "samplesSha256", "/cycle-observation-samples.jsonl"],
    ["closeoutPath", "closeoutSha256", "/cycle-observation-closeout.json"],
  ]) {
    ensure(typeof unified[pathKey] === "string"
        && unified[pathKey].startsWith("/home/ubuntu/.cache/market-radar-ops/cycle-continuation-ops/")
        && unified[pathKey].endsWith(suffix) && HASH.test(unified[shaKey] ?? ""),
    `capture_${pathKey}_invalid`);
  }
  const directories = [unified.finalPath, unified.samplesPath, unified.closeoutPath]
    .map((value) => value.slice(0, value.lastIndexOf("/")));
  ensure(new Set(directories).size === 1, "capture_paths_not_colocated");
  return capture;
}

function validateRuntime(runtime) {
  ensure(exactKeys(runtime, RUNTIME_KEYS), "runtime_keys_invalid");
  const final = validateCycle5Final(runtime?.cycle5Final);
  ensure(runtime.productionCommit === final.commit
      && runtime.productionCommit === REQUIRED_PRODUCTION_COMMIT
      && COMMIT.test(runtime.productionTree ?? "")
      && CONTAINER.test(runtime.currentWebContainerId ?? "")
      && IMAGE.test(runtime.currentWebImageId ?? "")
      && runtime.buildRecordWebImageId === runtime.currentWebImageId
      && EVIDENCE.test(runtime.buildRecordPath ?? "")
      && HASH.test(runtime.buildRecordSha256 ?? "")
      && HASH.test(runtime.composeSha256 ?? "")
      && HASH.test(runtime.productionEnvSha256 ?? "")
      && runtime.postgresAdminEnvPath === POSTGRES_ADMIN_ENV
      && runtime.healthLevel === "ready" && runtime.scanFreshness === "fresh",
  "runtime_identity_invalid");
  validateCapture(runtime, final);
  const phase = runtime.phase;
  ensure(exactKeys(phase, PHASE_RUNTIME_KEYS)
      && CONTAINER.test(phase?.candidateWorkerContainerId ?? "")
      && IMAGE.test(phase?.candidateWorkerImageId ?? "")
      && phase.baseEnvPath === `${PRODUCTION_ROOT}/.env`
      && HASH.test(phase.baseEnvSha256 ?? "")
      && phase.productionEnvPath === `${PRODUCTION_ROOT}/.env.production`
      && HASH.test(phase.targetProductionEnvSha256 ?? "")
      && phase.targetProductionEnvSha256 !== runtime.productionEnvSha256
      && phase.identityWrapperPath === "/usr/local/sbin/market-radar-compose"
      && HASH.test(phase.identityWrapperSha256 ?? "")
      && phase.identityOverridePath === "/etc/market-radar/compose-identity.env"
      && HASH.test(phase.identityOverrideSha256 ?? ""),
  "phase_runtime_identity_invalid");
  return runtime;
}

function buildAuthorization(request, manifest, issuedAt, expiresAt, nonce) {
  const observation = {
    sequence: SEQUENCE,
    cycle5Samples: 289,
    cycle5Hours: 24,
    cycle5CompletedWrites: 10000,
    shadowVerifySamples: 289,
    shadowVerifyHours: 24,
    sampleIntervalSeconds: 300,
    maximumSampleGapSeconds: 600,
    allPagesRequired: true,
    legacyResponseAuthority: true,
  };
  return {
    schemaVersion: "market-radar-package-authorization.v1",
    mode: "g0_g8_standing_user_grant",
    approvedBy: "user_standing_grant",
    grantId: "MR-G0-G8-USER-STANDING-GRANT-20260714-034826",
    approvalId: `MR-G0-SHADOW-VERIFY-HANDOFF-${manifest.sourceCommit.slice(0, 12)}-${nonce}`,
    nonce,
    gate: "G0",
    packageId: PACKAGE_ID,
    scope: PACKAGE_ID,
    actionClass: "shadow_verify_activation",
    riskTier: "R2_AUTHORITY_TRANSITION",
    builderAgentId: "codex-primary",
    baseCommit: request.runtime.productionCommit,
    targetCommit: request.runtime.productionCommit,
    targetTree: request.runtime.productionTree,
    diffSha256: sha256(""),
    pathSetSha256: sha256(""),
    contractSha256: manifest.contractSha256,
    runnerSha256: manifest.runnerArtifactSha256,
    artifactSha256: manifest.transportArtifactSha256,
    imageOrMigrationSha256: sha256(canonicalJson({
      children: request.childPackets,
      migrationId: request.runtime.cycle5Final.migrationId,
      sequence: SEQUENCE,
    })),
    composeSha256: request.runtime.composeSha256,
    environmentFingerprintSha256: sha256(canonicalJson({
      baseEnvSha256: request.runtime.phase.baseEnvSha256,
      productionEnvSha256: request.runtime.productionEnvSha256,
      targetProductionEnvSha256: request.runtime.phase.targetProductionEnvSha256,
      identityWrapperSha256: request.runtime.phase.identityWrapperSha256,
      identityOverrideSha256: request.runtime.phase.identityOverrideSha256,
    })),
    productionIdentitySha256: sha256(canonicalJson({
      productionCommit: request.runtime.productionCommit,
      productionTree: request.runtime.productionTree,
      webContainerId: request.runtime.currentWebContainerId,
      webImageId: request.runtime.currentWebImageId,
      candidateWorkerContainerId: request.runtime.phase.candidateWorkerContainerId,
      candidateWorkerImageId: request.runtime.phase.candidateWorkerImageId,
    })),
    gateEvidenceSha256: sha256(canonicalJson({
      cycle5FinalSha256: request.runtime.captureSpecification.unified.finalSha256,
      cycle5SamplesSha256: request.runtime.captureSpecification.unified.samplesSha256,
      cycle5CloseoutSha256: request.runtime.captureSpecification.unified.closeoutSha256,
      children: request.childPackets,
    })),
    preflightSha256: sha256(canonicalJson({
      productionCommit: request.runtime.productionCommit,
      productionTree: request.runtime.productionTree,
      webImageId: request.runtime.currentWebImageId,
      composeSha256: request.runtime.composeSha256,
      productionEnvSha256: request.runtime.productionEnvSha256,
      cycle5Status: request.runtime.cycle5Final.status,
    })),
    backupRestoreEvidenceSha256: sha256(canonicalJson({
      currentWebImageId: request.runtime.currentWebImageId,
      productionEnvSha256: request.runtime.productionEnvSha256,
      targetProductionEnvSha256: request.runtime.phase.targetProductionEnvSha256,
      rollbackTarget: "legacy_frozen",
    })),
    rollbackTarget: `${request.runtime.productionCommit}:legacy_frozen`,
    observationContractSha256: sha256(canonicalJson(observation)),
    policySha256: manifest.policySha256,
    revocationEpoch: 2,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    maxExecutions: 1,
    packageAssertions: {
      automaticRollback: true,
      childAuthorizationsIndependent: true,
      phaseRequestAfterReadOnlyPassOnly: true,
      productionWipExact: 1,
      qualityThresholdChanged: false,
      secretsPresentInEvidence: false,
      serviceAllowlist: ["web"],
    },
  };
}

export function createExecutionRequest({
  bundleSha256,
  manifest,
  nonce = randomUUID(),
  now = new Date(),
  runtime,
  stagingDirectory,
}) {
  ensure(HASH.test(bundleSha256 ?? "") && UUID.test(nonce), "request_identity_invalid");
  ensure(manifest?.schemaVersion
      === "wp-g0.2-cycle-5-to-shadow-verify-handoff-transport.v1"
      && manifest.packageId === PACKAGE_ID && manifest.approvalEligible === true
      && COMMIT.test(manifest.sourceCommit ?? "") && COMMIT.test(manifest.sourceTree ?? "")
      && HASH.test(manifest.contractSha256 ?? "")
      && HASH.test(manifest.runnerArtifactSha256 ?? "")
      && HASH.test(manifest.transportArtifactSha256 ?? "")
      && HASH.test(manifest.policySha256 ?? ""),
  "transport_manifest_identity_invalid");
  validateRuntime(runtime);
  const issuedAt = new Date(now);
  const expiresAt = new Date(issuedAt.getTime() + 89 * 60_000);
  const suffix = `${manifest.sourceCommit.slice(0, 12)}-${nonce.replaceAll("-", "").slice(0, 8)}`;
  const expectedStaging = `/home/ubuntu/.cache/market-radar-ops/wp-g0-2-shadow-verify-handoff-${suffix}`;
  ensure((stagingDirectory ?? expectedStaging) === expectedStaging, "staging_identity_invalid");
  const request = {
    packageId: PACKAGE_ID,
    executePipeline: true,
    operator: "codex-primary",
    productionRoot: PRODUCTION_ROOT,
    autonomyTrustRoot: TRUST_ROOT,
    stagingDirectory: expectedStaging,
    evidenceDirectory:
      `/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-shadow-verify-handoff-${suffix}`,
    runnerUnitName:
      `market-radar-shadow-verify-handoff-${manifest.sourceCommit.slice(0, 7)}-${nonce.replaceAll("-", "").slice(0, 8)}`,
    sequence: [...SEQUENCE],
    services: ["web"],
    productionMutationAllowed: true,
    childPackets: structuredClone(manifest.children),
    runtime: structuredClone(runtime),
    transportBundleSha256: bundleSha256,
    approvedContractSha256: manifest.contractSha256,
    approvedRunnerArtifactSha256: manifest.runnerArtifactSha256,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  request.authorization = buildAuthorization(request, manifest, issuedAt, expiresAt, nonce);
  return request;
}

function validateAuthorization(authorization, request, manifest) {
  for (const key of REQUIRED_PACKAGE_APPROVAL_FIELDS) {
    ensure(authorization?.[key] !== undefined && authorization[key] !== null
      && authorization[key] !== "", `authorization_required_field_missing:${key}`);
  }
  const expected = buildAuthorization(
    request,
    manifest,
    new Date(request.issuedAt),
    new Date(request.expiresAt),
    authorization.nonce,
  );
  ensure(canonicalJson(authorization) === canonicalJson(expected), "authorization_binding_invalid");
  return authorization;
}

async function verifyEvidenceFile(path, expectedSha256, suffix, maximumBytes) {
  ensure(typeof path === "string" && path.endsWith(suffix), "evidence_path_invalid");
  const metadata = await lstat(path);
  ensure(metadata.isFile() && !metadata.isSymbolicLink()
      && metadata.size > 0 && metadata.size <= maximumBytes && (metadata.mode & 0o077) === 0,
  "evidence_file_invalid");
  const bytes = await readFile(path);
  ensure(sha256(bytes) === expectedSha256, "evidence_checksum_mismatch");
  return JSON.parse(bytes);
}

export async function validateExecutionRequest(
  request,
  manifest,
  bundleSha256,
  { now = new Date(), verifyEvidence = true } = {},
) {
  ensure(request?.packageId === PACKAGE_ID && request.executePipeline === true
      && request.operator === "codex-primary" && request.productionRoot === PRODUCTION_ROOT
      && request.autonomyTrustRoot === TRUST_ROOT && STAGING.test(request.stagingDirectory ?? "")
      && request.evidenceDirectory
        === request.stagingDirectory.replace("/wp-g0-2-shadow-verify-handoff-",
          "/evidence/wp-g0-2-shadow-verify-handoff-")
      && /^market-radar-shadow-verify-handoff-[0-9a-f]{7}-[0-9a-f]{8}$/u
        .test(request.runnerUnitName ?? "")
      && JSON.stringify(request.sequence) === JSON.stringify(SEQUENCE)
      && JSON.stringify(request.services) === '["web"]'
      && request.productionMutationAllowed === true
      && request.transportBundleSha256 === bundleSha256
      && request.approvedContractSha256 === manifest.contractSha256
      && request.approvedRunnerArtifactSha256 === manifest.runnerArtifactSha256,
  "request_boundary_invalid");
  validateRuntime(request.runtime);
  validateChildPackets(request.childPackets, manifest.children);
  ensure(validIso(request.issuedAt) && validIso(request.expiresAt)
      && Date.parse(request.expiresAt) - Date.parse(request.issuedAt) === 89 * 60_000
      && Date.parse(request.issuedAt) <= new Date(now).getTime()
      && new Date(now).getTime() < Date.parse(request.expiresAt),
  "request_time_window_invalid");
  validateAuthorization(request.authorization, request, manifest);
  if (verifyEvidence) {
    const unified = request.runtime.captureSpecification.unified;
    const final = await verifyEvidenceFile(
      unified.finalPath, unified.finalSha256, "/cycle-observation-final.json", 2 * 1024 * 1024,
    );
    validateCycle5Final(final);
    ensure(canonicalJson(final) === canonicalJson(request.runtime.cycle5Final),
      "cycle5_final_runtime_mismatch");
    await verifyEvidenceFile(
      unified.closeoutPath,
      unified.closeoutSha256,
      "/cycle-observation-closeout.json",
      1024 * 1024,
    );
    await verifyEvidenceFile(
      unified.samplesPath,
      unified.samplesSha256,
      "/cycle-observation-samples.jsonl",
      16 * 1024 * 1024,
    );
  }
  return { status: REQUEST_PASS, productionExecuted: false, secretsPrinted: false };
}

export function validateReadOnlySummary(summary, productionCommit = REQUIRED_PRODUCTION_COMMIT) {
  ensure(summary?.schemaVersion
      === "wp-g0.2-cycle-5-read-only-verification-superwindow-evidence.v1"
      && summary.status === "PASS_CYCLE_5_READ_ONLY_VERIFICATION_SUPERWINDOW"
      && summary.packageId === "WP-G0.2-CYCLE-5-READ-ONLY-VERIFICATION-SUPERWINDOW"
      && summary.productionCommit === productionCommit
      && summary.productionMutationAllowed === false
      && Array.isArray(summary.servicesMutated) && summary.servicesMutated.length === 0
      && summary.databaseMutation === false && summary.environmentMutation === false
      && summary.phaseTransition === false
      && summary.canonicalAuthorityChanged === false && summary.g0Completed === false,
  "readonly_summary_boundary_invalid");
  const expected = [
    ["shadow_verify_code_presence", "PASS_PRODUCTION_SHADOW_VERIFY_CODE_PRESENCE_VERIFIED"],
    ["current_cycle_lineage", "PASS_CURRENT_CYCLE_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH"],
    ["current_cycle_reconciliation",
      "PASS_CURRENT_CYCLE_UNIFIED_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL"],
  ];
  ensure(Array.isArray(summary.childEvidence) && summary.childEvidence.length === expected.length,
    "readonly_summary_child_count_invalid");
  for (let index = 0; index < expected.length; index += 1) {
    const [step, status] = expected[index];
    const item = summary.childEvidence[index];
    ensure(item?.step === step && item.status === status && EVIDENCE.test(item.path ?? "")
        && HASH.test(item.sha256 ?? ""),
    `readonly_summary_child_invalid:${step}`);
  }
  return summary;
}

export function buildPhaseRuntimeFromReadOnlySummary({ runtime, summary }) {
  validateRuntime(runtime);
  const validated = validateReadOnlySummary(summary, runtime.productionCommit);
  const [codeRelease, lineage, reconciliation] = validated.childEvidence;
  return {
    productionCommit: runtime.productionCommit,
    productionTree: runtime.productionTree,
    productionCommitTree: runtime.productionTree,
    currentWebImageId: runtime.currentWebImageId,
    candidateWorkerContainerId: runtime.phase.candidateWorkerContainerId,
    candidateWorkerImageId: runtime.phase.candidateWorkerImageId,
    migrationId: runtime.cycle5Final.migrationId,
    releaseId: runtime.cycle5Final.releaseId,
    currentAuthorityEpoch: runtime.cycle5Final.authorityEpoch,
    baseEnvPath: runtime.phase.baseEnvPath,
    baseEnvSha256: runtime.phase.baseEnvSha256,
    productionEnvPath: runtime.phase.productionEnvPath,
    productionEnvSha256: runtime.productionEnvSha256,
    targetProductionEnvSha256: runtime.phase.targetProductionEnvSha256,
    composeSha256: runtime.composeSha256,
    identityWrapperPath: runtime.phase.identityWrapperPath,
    identityWrapperSha256: runtime.phase.identityWrapperSha256,
    identityOverridePath: runtime.phase.identityOverridePath,
    identityOverrideSha256: runtime.phase.identityOverrideSha256,
    lineageEvidencePath: lineage.path,
    lineageEvidenceSha256: lineage.sha256,
    reconciliationEvidencePath: reconciliation.path,
    reconciliationEvidenceSha256: reconciliation.sha256,
    codeReleaseEvidencePath: codeRelease.path,
    codeReleaseEvidenceSha256: codeRelease.sha256,
  };
}

export function validatePipelineFinal(value) {
  ensure(value?.schemaVersion === "wp-g0.2-cycle-5-to-shadow-verify-handoff-evidence.v1"
      && value.status === PIPELINE_PASS && value.packageId === PACKAGE_ID
      && JSON.stringify(value.sequence) === JSON.stringify(SEQUENCE)
      && value.readOnlyStatus === "PASS_CYCLE_5_READ_ONLY_VERIFICATION_SUPERWINDOW"
      && value.phaseImmediateStatus === "PASS_IMMEDIATE_SHADOW_VERIFY_OBSERVATION_ACTIVE"
      && value.observerActive === true && value.dualReadObservationCompleted === false
      && value.canonicalCompatStarted === false && value.canonicalCutoverExecuted === false
      && value.g0Completed === false && JSON.stringify(value.servicesMutated) === '["web"]'
      && value.databasePhaseTransition === "shadow_capture_to_shadow_verify"
      && value.secretsPrinted === false,
  "pipeline_final_boundary_invalid");
  return value;
}
