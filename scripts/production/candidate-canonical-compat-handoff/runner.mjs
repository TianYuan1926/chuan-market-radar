import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";

import { REQUIRED_PACKAGE_APPROVAL_FIELDS } from "../../governance/autonomy-policy.mjs";
import {
  LINEAGE_PASS,
  LINEAGE_SCHEMA,
  validateCandidateLineageEvidence,
} from "../candidate-lineage/runner.mjs";
import {
  validateDualReadEvidence,
  validateReconciliationEvidence,
} from "../candidate-canonical-compat-phase/runner.mjs";
import {
  EVIDENCE_PASS as CODE_PRESENCE_PASS,
  validateCodePresenceEvidence,
} from "../candidate-canonical-compat-code-presence/runner.mjs";

export const PACKAGE_ID =
  "WP-G0.2-CURRENT-CYCLE-CANONICAL-COMPAT-DEPENDENCY-REFRESH-AND-AUTOMATIC-HANDOFF";
export const PIPELINE_PASS = "PASS_CANONICAL_COMPAT_HANDOFF_OBSERVER_ACTIVE";
export const REQUEST_PASS = "PASS_CANONICAL_COMPAT_HANDOFF_EXECUTION_REQUEST";
export const REQUIRED_PRODUCTION_COMMIT = "47741f3222247562843932b01607a1ec3abb534e";
export const PRODUCTION_ROOT = "/home/ubuntu/apps/chuan-market-radar";
export const TRUST_ROOT = "/home/ubuntu/.local/state/market-radar-autonomy";
export const POSTGRES_ADMIN_ENV =
  "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env";
export const SEQUENCE = Object.freeze(["canonical_code_presence", "canonical_compat_phase"]);
export const CHILD_KEYS = Object.freeze(["codePresence", "canonicalCompatPhase"]);
export const CHILD_PACKAGES = Object.freeze({
  codePresence: "WP-G0.2-CANONICAL-COMPAT-PRODUCTION-CODE-PRESENCE-CURRENT-CYCLE",
  canonicalCompatPhase: "WP-G0.2-CANONICAL-COMPAT-PHASE-TRANSITION-AND-OBSERVATION",
});
export const CHILD_ARCHIVES = Object.freeze({
  codePresence: "packets/canonical-compat-code-presence.tar.gz",
  canonicalCompatPhase: "packets/canonical-compat-phase.tar.gz",
});

const HASH = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const IMAGE = /^sha256:[0-9a-f]{64}$/u;
const CONTAINER = /^[0-9a-f]{12,64}$/u;
const MIGRATION = /^candidate-episode-v1-cycle-[1-9][0-9]{0,5}$/u;
const RELEASE = /^candidate-shadow-[a-z0-9][a-z0-9._-]{7,100}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const EVIDENCE = /^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/[a-z0-9][a-z0-9._/-]{7,240}\.json$/u;
const STAGING = /^\/home\/ubuntu\/\.cache\/market-radar-ops\/wp-g0-2-canonical-compat-handoff-[0-9a-f]{12}-[0-9a-f]{8}$/u;
const PHASE_STAGING = /^\/home\/ubuntu\/\.cache\/market-radar-ops\/wp-g0-2-canonical-compat-phase-[0-9a-f]{12}-[0-9a-f]{8}$/u;
const PHASE_OBSERVER = /^market-radar-canonical-compat-observer-[0-9a-f]{7}-[0-9a-f]{8}\.service$/u;
const RUNTIME_KEYS = Object.freeze([
  "baseEnvPath", "baseEnvSha256", "buildRecordPath", "buildRecordSha256",
  "buildRecordWebImageId", "candidateWorkerContainerId", "candidateWorkerImageId",
  "composeSha256", "currentApprovalDigest", "currentAuthorityEpoch",
  "currentManifestSha256", "currentWebContainerId", "currentWebImageId",
  "dualReadEvidencePath", "dualReadEvidenceSha256", "healthLevel",
  "identityOverridePath", "identityOverrideSha256", "identityWrapperPath",
  "identityWrapperSha256", "lineageEvidencePath", "lineageEvidenceSha256",
  "migrationId", "postgresAdminEnvPath", "productionCommit", "productionEnvPath",
  "productionEnvSha256", "productionTree", "reconciliationEvidencePath",
  "reconciliationEvidenceSha256", "releaseId", "scanFreshness",
  "targetProductionEnvSha256",
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

export function validateRuntime(runtime) {
  ensure(exactKeys(runtime, RUNTIME_KEYS), "runtime_keys_invalid");
  ensure(runtime.productionCommit === REQUIRED_PRODUCTION_COMMIT
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
  "runtime_production_identity_invalid");
  ensure(runtime.migrationId === "candidate-episode-v1-cycle-7"
      && MIGRATION.test(runtime.migrationId)
      && RELEASE.test(runtime.releaseId ?? "")
      && Number.isSafeInteger(runtime.currentAuthorityEpoch)
      && runtime.currentAuthorityEpoch >= 2 && runtime.currentAuthorityEpoch % 2 === 0
      && HASH.test(runtime.currentManifestSha256 ?? "")
      && /^sha256:[0-9a-f]{64}$/u.test(runtime.currentApprovalDigest ?? ""),
  "runtime_shadow_verify_identity_invalid");
  for (const [pathKey, shaKey] of [
    ["lineageEvidencePath", "lineageEvidenceSha256"],
    ["reconciliationEvidencePath", "reconciliationEvidenceSha256"],
    ["dualReadEvidencePath", "dualReadEvidenceSha256"],
  ]) ensure(EVIDENCE.test(runtime[pathKey] ?? "") && HASH.test(runtime[shaKey] ?? ""),
    `runtime_evidence_identity_invalid:${pathKey}`);
  ensure(runtime.baseEnvPath === `${PRODUCTION_ROOT}/.env`
      && HASH.test(runtime.baseEnvSha256 ?? "")
      && runtime.productionEnvPath === `${PRODUCTION_ROOT}/.env.production`
      && HASH.test(runtime.targetProductionEnvSha256 ?? "")
      && runtime.targetProductionEnvSha256 !== runtime.productionEnvSha256
      && CONTAINER.test(runtime.candidateWorkerContainerId ?? "")
      && IMAGE.test(runtime.candidateWorkerImageId ?? "")
      && runtime.identityWrapperPath === "/usr/local/sbin/market-radar-compose"
      && HASH.test(runtime.identityWrapperSha256 ?? "")
      && runtime.identityOverridePath === "/etc/market-radar/compose-identity.env"
      && HASH.test(runtime.identityOverrideSha256 ?? ""),
  "runtime_phase_identity_invalid");
  return runtime;
}

function buildAuthorization(request, manifest, issuedAt, expiresAt, nonce) {
  const observation = {
    sequence: SEQUENCE,
    shadowVerifySamples: 289,
    shadowVerifyHours: 24,
    canonicalCompatSamples: 289,
    canonicalCompatHours: 24,
    sampleIntervalSeconds: 300,
    maximumSampleGapSeconds: 600,
    allPagesRequired: true,
    maximumDifferences: 0,
  };
  return {
    schemaVersion: "market-radar-package-authorization.v1",
    mode: "g0_g8_standing_user_grant",
    approvedBy: "user_standing_grant",
    grantId: "MR-G0-G8-USER-STANDING-GRANT-20260714-034826",
    approvalId: `MR-G0-CANONICAL-COMPAT-HANDOFF-${manifest.sourceCommit.slice(0, 12)}-${nonce}`,
    nonce,
    gate: "G0",
    packageId: PACKAGE_ID,
    scope: PACKAGE_ID,
    actionClass: "canonical_compat_activation",
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
      migrationId: request.runtime.migrationId,
      sequence: SEQUENCE,
    })),
    composeSha256: request.runtime.composeSha256,
    environmentFingerprintSha256: sha256(canonicalJson({
      baseEnvSha256: request.runtime.baseEnvSha256,
      productionEnvSha256: request.runtime.productionEnvSha256,
      targetProductionEnvSha256: request.runtime.targetProductionEnvSha256,
      identityWrapperSha256: request.runtime.identityWrapperSha256,
      identityOverrideSha256: request.runtime.identityOverrideSha256,
    })),
    productionIdentitySha256: sha256(canonicalJson({
      productionCommit: request.runtime.productionCommit,
      productionTree: request.runtime.productionTree,
      webContainerId: request.runtime.currentWebContainerId,
      webImageId: request.runtime.currentWebImageId,
      candidateWorkerContainerId: request.runtime.candidateWorkerContainerId,
      candidateWorkerImageId: request.runtime.candidateWorkerImageId,
      manifestSha256: request.runtime.currentManifestSha256,
    })),
    gateEvidenceSha256: sha256(canonicalJson({
      lineageEvidenceSha256: request.runtime.lineageEvidenceSha256,
      reconciliationEvidenceSha256: request.runtime.reconciliationEvidenceSha256,
      dualReadEvidenceSha256: request.runtime.dualReadEvidenceSha256,
      children: request.childPackets,
    })),
    preflightSha256: sha256(canonicalJson({
      productionCommit: request.runtime.productionCommit,
      productionTree: request.runtime.productionTree,
      webImageId: request.runtime.currentWebImageId,
      composeSha256: request.runtime.composeSha256,
      productionEnvSha256: request.runtime.productionEnvSha256,
      migrationId: request.runtime.migrationId,
      authorityEpoch: request.runtime.currentAuthorityEpoch,
    })),
    backupRestoreEvidenceSha256: sha256(canonicalJson({
      currentWebImageId: request.runtime.currentWebImageId,
      productionEnvSha256: request.runtime.productionEnvSha256,
      targetProductionEnvSha256: request.runtime.targetProductionEnvSha256,
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
      phaseRequestAfterCodePresencePassOnly: true,
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
  ensure(manifest?.schemaVersion === "wp-g0.2-current-cycle-canonical-compat-handoff-transport.v1"
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
  const expectedStaging = `/home/ubuntu/.cache/market-radar-ops/wp-g0-2-canonical-compat-handoff-${suffix}`;
  ensure((stagingDirectory ?? expectedStaging) === expectedStaging, "staging_identity_invalid");
  const request = {
    packageId: PACKAGE_ID,
    executePipeline: true,
    operator: "codex-primary",
    productionRoot: PRODUCTION_ROOT,
    autonomyTrustRoot: TRUST_ROOT,
    stagingDirectory: expectedStaging,
    evidenceDirectory:
      `/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-canonical-compat-handoff-${suffix}`,
    runnerUnitName:
      `market-radar-canonical-compat-handoff-${manifest.sourceCommit.slice(0, 7)}-${nonce.replaceAll("-", "").slice(0, 8)}`,
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

async function verifyEvidenceFile(path, expectedSha256, maximumBytes) {
  ensure(EVIDENCE.test(path ?? ""), "evidence_path_invalid");
  const metadata = await lstat(path);
  ensure(metadata.isFile() && !metadata.isSymbolicLink()
      && metadata.size > 0 && metadata.size <= maximumBytes && (metadata.mode & 0o077) === 0,
  "evidence_file_invalid");
  const bytes = await readFile(path);
  ensure(sha256(bytes) === expectedSha256, "evidence_checksum_mismatch");
  return JSON.parse(bytes);
}

function validateEvidenceIdentity(runtime, lineage, reconciliation, dualRead) {
  const validatedLineage = validateCandidateLineageEvidence(lineage);
  ensure(validatedLineage.schemaVersion === LINEAGE_SCHEMA
      && validatedLineage.status === LINEAGE_PASS
      && validatedLineage.currentMigrationId === runtime.migrationId
      && validatedLineage.sourceReleaseCount === 7
      && validatedLineage.completedWrites >= 10_000
      && validatedLineage.unresolvedOutbox === 0,
  "lineage_evidence_invalid");
  const current = validatedLineage.sourceReleaseWindows.at(-1);
  ensure(current?.migrationId === runtime.migrationId
      && current.releaseId === runtime.releaseId
      && current.authorityEpoch === runtime.currentAuthorityEpoch - 1,
  "lineage_runtime_identity_mismatch");
  const validatedReconciliation = validateReconciliationEvidence(reconciliation);
  ensure(validatedReconciliation.verificationMigrationId === runtime.migrationId
      && validatedReconciliation.sourceReleaseCount === 7
      && validatedReconciliation.lineageEvidenceSha256
        === `sha256:${runtime.lineageEvidenceSha256}`,
  "reconciliation_runtime_identity_mismatch");
  validateDualReadEvidence(dualRead, {
    migrationId: runtime.migrationId,
    releaseId: runtime.releaseId,
    authorityEpoch: runtime.currentAuthorityEpoch,
  });
  return { lineage: validatedLineage, reconciliation: validatedReconciliation, dualRead };
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
        === request.stagingDirectory.replace("/wp-g0-2-canonical-compat-handoff-",
          "/evidence/wp-g0-2-canonical-compat-handoff-")
      && /^market-radar-canonical-compat-handoff-[0-9a-f]{7}-[0-9a-f]{8}$/u
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
    const [lineage, reconciliation, dualRead] = await Promise.all([
      verifyEvidenceFile(request.runtime.lineageEvidencePath,
        request.runtime.lineageEvidenceSha256, 8 * 1024 * 1024),
      verifyEvidenceFile(request.runtime.reconciliationEvidencePath,
        request.runtime.reconciliationEvidenceSha256, 8 * 1024 * 1024),
      verifyEvidenceFile(request.runtime.dualReadEvidencePath,
        request.runtime.dualReadEvidenceSha256, 2 * 1024 * 1024),
    ]);
    validateEvidenceIdentity(request.runtime, lineage, reconciliation, dualRead);
  }
  return { status: REQUEST_PASS, productionExecuted: false, secretsPrinted: false };
}

export function validateCodePresenceSummary(summary, runtime) {
  const validated = validateCodePresenceEvidence(summary);
  ensure(validated.status === CODE_PRESENCE_PASS
      && validated.productionCommit === runtime.productionCommit
      && validated.productionTree === runtime.productionTree
      && validated.runningWebContainerId === runtime.currentWebContainerId
      && validated.targetWebImageId === runtime.currentWebImageId
      && validated.buildRecordSha256 === runtime.buildRecordSha256
      && validated.manifestSha256 === runtime.currentManifestSha256,
  "code_presence_runtime_identity_mismatch");
  return validated;
}

export function buildPhaseRuntimeFromCodePresence({
  runtime,
  codePresence,
  codePresenceEvidencePath,
  codePresenceEvidenceSha256,
}) {
  validateRuntime(runtime);
  validateCodePresenceSummary(codePresence, runtime);
  ensure(EVIDENCE.test(codePresenceEvidencePath ?? "")
      && HASH.test(codePresenceEvidenceSha256 ?? ""),
  "code_presence_evidence_identity_invalid");
  return {
    productionCommit: runtime.productionCommit,
    productionTree: runtime.productionTree,
    productionCommitTree: runtime.productionTree,
    currentWebImageId: runtime.currentWebImageId,
    candidateWorkerContainerId: runtime.candidateWorkerContainerId,
    candidateWorkerImageId: runtime.candidateWorkerImageId,
    migrationId: runtime.migrationId,
    releaseId: runtime.releaseId,
    currentAuthorityEpoch: runtime.currentAuthorityEpoch,
    currentApprovalDigest: runtime.currentApprovalDigest,
    currentManifestSha256: runtime.currentManifestSha256,
    baseEnvPath: runtime.baseEnvPath,
    baseEnvSha256: runtime.baseEnvSha256,
    productionEnvPath: runtime.productionEnvPath,
    productionEnvSha256: runtime.productionEnvSha256,
    targetProductionEnvSha256: runtime.targetProductionEnvSha256,
    composeSha256: runtime.composeSha256,
    identityWrapperPath: runtime.identityWrapperPath,
    identityWrapperSha256: runtime.identityWrapperSha256,
    identityOverridePath: runtime.identityOverridePath,
    identityOverrideSha256: runtime.identityOverrideSha256,
    lineageEvidencePath: runtime.lineageEvidencePath,
    lineageEvidenceSha256: runtime.lineageEvidenceSha256,
    reconciliationEvidencePath: runtime.reconciliationEvidencePath,
    reconciliationEvidenceSha256: runtime.reconciliationEvidenceSha256,
    dualReadEvidencePath: runtime.dualReadEvidencePath,
    dualReadEvidenceSha256: runtime.dualReadEvidenceSha256,
    codeReleaseEvidencePath: codePresenceEvidencePath,
    codeReleaseEvidenceSha256: codePresenceEvidenceSha256,
  };
}

export function validatePipelineFinal(value) {
  ensure(exactKeys(value, [
    "canonicalCompatObservationCompleted", "canonicalCutoverExecuted",
    "codePresenceEvidence", "codePresenceStatus", "databasePhaseTransition", "g0Completed",
    "observerActive", "packageId", "phaseEvidence", "phaseImmediateStatus",
    "phaseObserverUnit", "phaseStagingDirectory", "schemaVersion", "secretsPrinted",
    "sequence", "servicesMutated", "status", "wpG02Completed",
  ]) && value.schemaVersion === "wp-g0.2-current-cycle-canonical-compat-handoff-evidence.v1"
      && value.status === PIPELINE_PASS && value.packageId === PACKAGE_ID
      && JSON.stringify(value.sequence) === JSON.stringify(SEQUENCE)
      && value.codePresenceStatus === CODE_PRESENCE_PASS
      && value.phaseImmediateStatus === "PASS_IMMEDIATE_CANONICAL_COMPAT_OBSERVATION_ACTIVE"
      && value.observerActive === true && value.canonicalCompatObservationCompleted === false
      && value.canonicalCutoverExecuted === false && value.wpG02Completed === false
      && value.g0Completed === false && JSON.stringify(value.servicesMutated) === '["web"]'
      && value.databasePhaseTransition === "shadow_verify_to_canonical_compat"
      && value.secretsPrinted === false
      && exactKeys(value.codePresenceEvidence, ["path", "sha256"])
      && EVIDENCE.test(value.codePresenceEvidence.path ?? "")
      && HASH.test(value.codePresenceEvidence.sha256 ?? "")
      && exactKeys(value.phaseEvidence, ["path", "sha256"])
      && EVIDENCE.test(value.phaseEvidence.path ?? "")
      && HASH.test(value.phaseEvidence.sha256 ?? "")
      && PHASE_OBSERVER.test(value.phaseObserverUnit ?? "")
      && PHASE_STAGING.test(value.phaseStagingDirectory ?? ""),
  "pipeline_final_boundary_invalid");
  return value;
}
