#!/usr/bin/env node

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmod, cp, lstat, mkdir, mkdtemp, readFile, rm, utimes, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { REQUIRED_PACKAGE_APPROVAL_FIELDS } from "../../governance/autonomy-policy.mjs";
import { validateCandidateLineageEvidence } from "../candidate-lineage/runner.mjs";
import {
  MAXIMUM_SAMPLE_GAP_SECONDS,
  MINIMUM_OBSERVATION_HOURS,
  MINIMUM_OBSERVATION_SAMPLES,
  OBSERVATION_INTERVAL_SECONDS,
  PACKAGE_ID,
  buildCanonicalCompatManifest,
  canonicalJson,
  manifestApprovalDigest,
  serializeManifest,
  sha256,
  validateCodeReleaseEvidence,
  validateDualReadEvidence,
  validateReconciliationEvidence,
} from "./runner.mjs";

const execFileAsync = promisify(execFile);

export const CONTRACT_PATH =
  "docs/governance/wp-g0-2-canonical-compat-phase-transition-and-observation.v1.json";
export const REQUIRED_PRODUCTION_COMMIT = "eb48827b8b403452328b65dc4b415c3fc0ecf765";
export const PRODUCTION_ROOT = "/home/ubuntu/apps/chuan-market-radar";
export const TRUST_ROOT = "/home/ubuntu/.local/state/market-radar-autonomy";
export const POSTGRES_ADMIN_ENV =
  "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env";
export const SOURCE_DATE_EPOCH = 946684800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);
const HASH = /^[0-9a-f]{64}$/u;
const HASH_PREFIXED = /^sha256:[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const IMAGE = /^sha256:[0-9a-f]{64}$/u;
const CONTAINER = /^[0-9a-f]{12,64}$/u;
const MIGRATION = /^candidate-episode-v1(?:-cycle-([1-9][0-9]{0,5}))?$/u;
const RELEASE = /^candidate-shadow-[a-z0-9][a-z0-9._-]{7,100}$/u;

export const RUNNER_FILES = Object.freeze([
  "scripts/production/candidate-canonical-compat-phase/full-snapshot-observer.cjs",
  "scripts/production/candidate-canonical-compat-phase/observation-runner.sh",
  "scripts/production/candidate-canonical-compat-phase/production-entrypoint.sh",
  "scripts/production/candidate-canonical-compat-phase/production-runner.sh",
  "scripts/production/candidate-canonical-compat-phase/runner.mjs",
]);

export const TRANSPORT_FILES = Object.freeze([
  CONTRACT_PATH,
  "scripts/governance/autonomy-policy.mjs",
  "scripts/governance/autonomy-production-lease-cli.mjs",
  "scripts/governance/autonomy-production-lease.mjs",
  "scripts/production/candidate-lineage/runner.mjs",
  "scripts/production/candidate-canonical-compat-phase/bundle.mjs",
  ...RUNNER_FILES,
]);

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function parseTime(value, reason) {
  const parsed = Date.parse(value);
  ensure(Number.isFinite(parsed), reason);
  return parsed;
}

function assertHash(value, reason, length = 64) {
  ensure(new RegExp(`^[0-9a-f]{${length}}$`, "u").test(value ?? ""), reason);
}

function assertMigration(value) {
  const match = MIGRATION.exec(value ?? "");
  ensure(match && (!match[1] || Number(match[1]) > 1), "migration_id_invalid");
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
    === "wp-g0.2-canonical-compat-phase-transition-and-observation.v1"
    && contract.packageId === PACKAGE_ID && contract.gate === "G0"
    && contract.actionClass === "canonical_compat_activation"
    && contract.riskTier === "R2_AUTHORITY_TRANSITION",
  "contract_identity_invalid");
  ensure(contract.status
      === "local_implementation_and_rehearsal_production_blocked_by_prerequisites"
      && contract.productionAuthorization === false && contract.productionExecuted === false,
  "contract_production_truth_invalid");
  ensure(contract.releaseBoundary?.requiredProductionCommit === REQUIRED_PRODUCTION_COMMIT
      && contract.releaseBoundary?.requiredCodeReleaseStatus
        === "PASS_PRODUCTION_SHADOW_VERIFY_CODE_AUTHORIZATION_WEB_ONLY"
      && contract.releaseBoundary?.productionWorktreeCleanDetachedRequired === true
      && contract.releaseBoundary?.sourceSyncAllowed === false
      && contract.releaseBoundary?.gitCheckoutAllowed === false
      && contract.releaseBoundary?.imageBuildAllowed === false,
  "contract_release_boundary_invalid");
  const prerequisites = contract.prerequisites ?? {};
  ensure(prerequisites.lineageStatus
      === "PASS_FRESH_VERIFICATION_CYCLE_READY_FOR_RECONCILIATION"
      && prerequisites.reconciliationStatus
        === "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL"
      && prerequisites.dualReadObservationStatus === "PASS_DUAL_READ_OBSERVATION"
      && prerequisites.dualReadExactSamples === MINIMUM_OBSERVATION_SAMPLES
      && prerequisites.dualReadMinimumHours === MINIMUM_OBSERVATION_HOURS
      && prerequisites.dualReadMaximumGapSeconds === MAXIMUM_SAMPLE_GAP_SECONDS
      && prerequisites.dualReadMaximumDifferences === 0
      && prerequisites.minimumComparedWrites === 10000
      && prerequisites.maximumComparisonDifferences === 0
      && prerequisites.maximumDuplicateOutboxMappings === 0
      && prerequisites.maximumDuplicateEventMappings === 0
      && prerequisites.maximumUnresolvedOutbox === 0
      && prerequisites.minimumReleaseWindows === 2
      && prerequisites.currentPhase === "shadow_verify"
      && prerequisites.currentWriteFrozen === false
      && prerequisites.minimumDeadlineRemainingSeconds === 87000
      && prerequisites.manifestBeforeTransition === "present_exact_shadow_verify_identity"
      && JSON.stringify(prerequisites.readFlagsBeforeTransition)
        === '{"dualRead":true,"canonicalRead":false,"reviewRead":false}',
  "contract_prerequisites_invalid");
  const manifestBoundary = contract.manifest ?? {};
  ensure(manifestBoundary.schemaVersion === "candidate-read-authority-manifest.v1"
      && manifestBoundary.phase === "canonical_compat"
      && manifestBoundary.targetEpochIncrement === 1
      && manifestBoundary.maximumApprovalAgeMinutes === 90
      && JSON.stringify(manifestBoundary.flags)
        === '{"dualRead":true,"canonicalRead":true,"reviewRead":true}',
  "contract_manifest_boundary_invalid");
  const database = contract.databaseBoundary ?? {};
  ensure(database.allowedProcedure === "candidate_authority.transition_migration_control_v1"
      && database.sourcePhase === "shadow_verify" && database.targetPhase === "canonical_compat"
      && database.targetWriteFrozen === false && database.targetEpochIncrement === 1
      && database.migrationRole === "candidate_migration_role"
      && database.ddlAllowed === false && database.migrationAllowed === false
      && database.candidateBusinessDataMutationAllowed === false
      && database.redisMutationAllowed === false,
  "contract_database_boundary_invalid");
  const execution = contract.execution ?? {};
  ensure(execution.productionRoot === PRODUCTION_ROOT
      && execution.runner === "transient_systemd_unit" && execution.restart === "no"
      && execution.mutationRuntimeMaxSeconds === 5400
      && execution.observationRuntimeMaxSeconds === 90000
      && execution.sessionIndependent === true
      && execution.maximumApprovalWindowMinutes === 90
      && JSON.stringify(execution.serviceAllowlist) === '["web"]'
      && execution.webRecreateCommand
        === "docker compose up -d --no-deps --no-build --force-recreate web"
      && execution.candidateWorkerMutationOnSuccess === false
      && execution.otherServiceMutationAllowed === false
      && execution.externalProductionLeaseRequired === true
      && execution.fencingTokenRequired === true
      && execution.leaseCheckBeforeEveryMutation === true
      && execution.singleUseApprovalRequired === true,
  "contract_execution_boundary_invalid");
  const full = contract.fullSnapshot ?? {};
  ensure(full.transactionIsolation === "serializable_read_only_deferrable"
      && full.forcedRole === "candidate_audit_role" && full.pageLimit === 1000
      && full.allPagesRequired === true && full.rawOracleIndependent === true
      && full.sameDatabaseSnapshot === true && full.maximumDifferences === 0
      && full.maximumDuplicateEpisodeIds === 0
      && full.returnedMustEqualReviewTotal === true
      && full.rawRowsMayLeaveContainer === false,
  "contract_full_snapshot_invalid");
  const observation = contract.observation ?? {};
  ensure(observation.sampleIntervalSeconds === OBSERVATION_INTERVAL_SECONDS
      && observation.minimumSamples === MINIMUM_OBSERVATION_SAMPLES
      && observation.exactSamples === MINIMUM_OBSERVATION_SAMPLES
      && observation.minimumHours === MINIMUM_OBSERVATION_HOURS
      && observation.maximumSampleGapSeconds === MAXIMUM_SAMPLE_GAP_SECONDS
      && observation.publicApiRouteEverySample === true
      && observation.publicApiPageLimit === 1000
      && observation.fullDatabasePaginationEverySample === true
      && observation.candidateResponseAuthorityConditionalOnParity === true
      && observation.legacyFallbackObserved === false
      && observation.maximumLegacyFallbacks === 0
      && observation.maximumPartialResponses === 0
      && observation.maximumUnavailableResponses === 0
      && observation.candidateCanonicalReviewUsable === true
      && observation.canAuthorizeCutover === false
      && observation.canCreateTradePlan === false
      && observation.canMutateLiveRanking === false
      && observation.automaticPhaseAdvance === false
      && observation.canonicalCompatStarted === true
      && observation.canonicalCutoverExecuted === false,
  "contract_observation_invalid");
  const rollback = contract.rollback ?? {};
  ensure(rollback.automaticRollbackRequired === true
      && rollback.beforeOrAfterTransitionTargetPhase === "legacy"
      && rollback.afterTransitionTargetPhase === "legacy"
      && rollback.afterTransitionWriteFrozen === true
      && rollback.disableAllCandidateFlags === true
      && rollback.stopCandidateWorker === true
      && rollback.preserveCandidateData === true
      && rollback.preserveCurrentGitCommit === true
      && rollback.preserveCurrentWebCodeImage === true
      && rollback.removeManifestByWebRecreate === true
      && rollback.rollbackDoesNotClaimCycleRestartEligibility === true,
  "contract_rollback_invalid");
  ensure(contract.runnerArtifact?.fileCount === RUNNER_FILES.length
      && JSON.stringify(contract.runnerArtifact?.files) === JSON.stringify(RUNNER_FILES)
      && HASH.test(contract.runnerArtifact?.sha256 ?? ""),
  "contract_runner_artifact_invalid");
  for (const forbidden of [
    "observation_window_shortening", "single_page_only_parity",
    "candidate_business_data_mutation", "schema_migration", "redis_mutation",
    "unguarded_candidate_response_authority", "legacy_fallback_accepted_as_pass",
    "automatic_canonical_cutover",
    "production_ranking_change", "future_outcome_input", "formal_backtest",
  ]) ensure(contract.forbidden?.includes(forbidden), `contract_forbidden_missing:${forbidden}`);
  return contract;
}

export async function validateLocalPreparation(root = process.cwd()) {
  const contractBytes = await readFile(resolve(root, CONTRACT_PATH));
  const contract = validateContract(JSON.parse(contractBytes));
  const runner = await artifact(root, RUNNER_FILES);
  ensure(runner.sha256 === contract.runnerArtifact.sha256,
    "runner_artifact_checksum_mismatch");
  return {
    status: "PASS_LOCAL_CANONICAL_COMPAT_PHASE_TRANSITION_AND_OBSERVATION",
    packageId: PACKAGE_ID,
    contractSha256: sha256(contractBytes),
    runnerArtifactSha256: runner.sha256,
    productionAuthorization: false,
    productionExecuted: false,
    phaseTransitionExecuted: false,
    observationExecuted: false,
  };
}

function validateLineage(lineage, request) {
  const validated = validateCandidateLineageEvidence(lineage);
  ensure(validated.status === "PASS_FRESH_VERIFICATION_CYCLE_READY_FOR_RECONCILIATION"
      && validated.completedWrites >= 10000 && validated.unresolvedOutbox === 0
      && validated.sourceReleaseWindows.length >= 2,
  "lineage_result_invalid");
  const current = validated.sourceReleaseWindows.at(-1);
  ensure(current.migrationId === request.migrationId
      && current.releaseId === request.releaseId
      && current.authorityEpoch === request.currentAuthorityEpoch - 1,
  "lineage_current_identity_mismatch");
  return validated;
}

async function privateEvidence(path, expectedSha256, label, productionPaths) {
  const metadata = await lstat(path);
  ensure(metadata.isFile() && !metadata.isSymbolicLink()
      && metadata.size > 0 && metadata.size <= 8 * 1024 * 1024,
  `${label}_file_invalid`);
  if (productionPaths) {
    ensure(path.startsWith("/home/ubuntu/.cache/market-radar-ops/evidence/")
        && (metadata.mode & 0o077) === 0,
    `${label}_production_path_invalid`);
  }
  const bytes = await readFile(path);
  ensure(sha256(bytes) === expectedSha256, `${label}_checksum_mismatch`);
  return JSON.parse(bytes);
}

export function validateAuthorization(authorization, request, manifest) {
  for (const key of REQUIRED_PACKAGE_APPROVAL_FIELDS) {
    ensure(authorization?.[key] !== undefined && authorization[key] !== null
      && authorization[key] !== "", `authorization_required_field_missing:${key}`);
  }
  ensure(authorization.schemaVersion === "market-radar-package-authorization.v1"
      && authorization.mode === "g0_g8_standing_user_grant"
      && authorization.approvedBy === "user_standing_grant"
      && authorization.grantId === "MR-G0-G8-USER-STANDING-GRANT-20260714-034826"
      && authorization.packageId === PACKAGE_ID && authorization.scope === PACKAGE_ID
      && authorization.gate === "G0" && authorization.actionClass === "canonical_compat_activation"
      && authorization.riskTier === "R2_AUTHORITY_TRANSITION"
      && authorization.builderAgentId === "codex-primary"
      && authorization.baseCommit === request.productionCommit
      && authorization.targetCommit === request.productionCommit
      && authorization.targetTree === request.productionTree
      && authorization.contractSha256 === request.contractSha256
      && authorization.runnerSha256 === request.runnerArtifactSha256
      && authorization.artifactSha256 === manifest.transportArtifactSha256
      && authorization.composeSha256 === request.composeSha256
      && authorization.revocationEpoch === 2 && authorization.maxExecutions === 1
      && authorization.rollbackTarget === `${request.productionCommit}:legacy_frozen`
      && authorization.policySha256 === manifest.policySha256
      && authorization.issuedAt === request.approvalIssuedAt
      && authorization.expiresAt === request.approvalExpiresAt,
  "authorization_binding_invalid");
  const preflight = {
    productionCommit: request.productionCommit,
    productionTree: request.productionTree,
    currentWebImageId: request.currentWebImageId,
    candidateWorkerContainerId: request.candidateWorkerContainerId,
    candidateWorkerImageId: request.candidateWorkerImageId,
    migrationId: request.migrationId,
    releaseId: request.releaseId,
    currentAuthorityEpoch: request.currentAuthorityEpoch,
    currentApprovalDigest: request.currentApprovalDigest,
    currentManifestSha256: request.currentManifestSha256,
    baseEnvSha256: request.baseEnvSha256,
    preTransitionProductionEnvSha256: request.preTransitionProductionEnvSha256,
    targetProductionEnvSha256: request.productionEnvSha256,
    composeSha256: request.composeSha256,
  };
  ensure(authorization.diffSha256 === sha256("")
      && authorization.pathSetSha256 === sha256("")
      && authorization.imageOrMigrationSha256 === sha256(canonicalJson({
        migrationId: request.migrationId,
        currentAuthorityEpoch: request.currentAuthorityEpoch,
        targetAuthorityEpoch: request.targetAuthorityEpoch,
        currentApprovalDigest: request.currentApprovalDigest,
        manifestApprovalDigest: request.manifestApprovalDigest,
      }))
      && authorization.environmentFingerprintSha256 === sha256(canonicalJson({
        baseEnvSha256: request.baseEnvSha256,
        preTransitionProductionEnvSha256: request.preTransitionProductionEnvSha256,
        targetProductionEnvSha256: request.productionEnvSha256,
        composeSha256: request.composeSha256,
      }))
      && authorization.productionIdentitySha256 === sha256(canonicalJson({
        productionCommit: request.productionCommit,
        productionTree: request.productionTree,
        currentWebImageId: request.currentWebImageId,
        candidateWorkerContainerId: request.candidateWorkerContainerId,
        candidateWorkerImageId: request.candidateWorkerImageId,
      }))
      && authorization.gateEvidenceSha256 === sha256(canonicalJson({
        lineageEvidenceSha256: request.lineageEvidenceSha256,
        reconciliationEvidenceSha256: request.reconciliationEvidenceSha256,
        dualReadEvidenceSha256: request.dualReadEvidenceSha256,
        codeReleaseEvidenceSha256: request.codeReleaseEvidenceSha256,
      }))
      && authorization.preflightSha256 === sha256(canonicalJson(preflight))
      && authorization.backupRestoreEvidenceSha256 === sha256(canonicalJson({
        currentWebImageId: request.currentWebImageId,
        productionEnvSha256: request.preTransitionProductionEnvSha256,
        targetProductionEnvSha256: request.productionEnvSha256,
        rollbackTarget: "legacy_frozen",
      }))
      && authorization.observationContractSha256 === sha256(canonicalJson({
        sampleIntervalSeconds: OBSERVATION_INTERVAL_SECONDS,
        exactSamples: MINIMUM_OBSERVATION_SAMPLES,
        minimumHours: MINIMUM_OBSERVATION_HOURS,
        maximumSampleGapSeconds: MAXIMUM_SAMPLE_GAP_SECONDS,
        allPagesRequired: true,
        candidateResponseAuthorityConditionalOnParity: true,
        legacyFallbackAccepted: false,
      })),
  "authorization_derived_binding_invalid");
  for (const key of [
    "diffSha256", "pathSetSha256", "contractSha256", "runnerSha256",
    "artifactSha256", "imageOrMigrationSha256", "composeSha256",
    "environmentFingerprintSha256", "productionIdentitySha256",
    "gateEvidenceSha256", "preflightSha256", "backupRestoreEvidenceSha256",
    "observationContractSha256", "policySha256",
  ]) assertHash(authorization[key], `authorization_hash_invalid:${key}`);
  ensure(authorization.packageAssertions?.phaseTransition === true
      && authorization.packageAssertions?.environmentMutation === true
      && authorization.packageAssertions?.manifestMutation === true
      && authorization.packageAssertions?.webOnlyServiceMutation === true
      && authorization.packageAssertions?.candidateWorkerMutationOnSuccess === false
      && authorization.packageAssertions?.automaticRollback === true
      && authorization.packageAssertions?.allPagesCompared === true
      && authorization.packageAssertions?.qualityThresholdChanged === false
      && authorization.packageAssertions?.secretsPresentInEvidence === false,
  "authorization_assertions_invalid");
}

export async function validateApprovalRequest({ manifest, request, productionPaths = true }) {
  ensure(request?.packageId === PACKAGE_ID && request.productionRoot === PRODUCTION_ROOT
      && request.productionCommit === REQUIRED_PRODUCTION_COMMIT
      && COMMIT.test(request.productionTree ?? "") && IMAGE.test(request.currentWebImageId ?? "")
      && CONTAINER.test(request.candidateWorkerContainerId ?? "")
      && IMAGE.test(request.candidateWorkerImageId ?? "")
      && request.webImageId === request.currentWebImageId
      && request.services?.length === 1 && request.services[0] === "web"
      && request.sessionIndependentExecutionRequired === true
      && request.temporaryArtifactCleanupRequired === true
      && /^market-radar-canonical-compat-phase-[a-z0-9][a-z0-9-]{7,48}$/u
        .test(request.runnerUnitName ?? "")
      && /^market-radar-canonical-compat-observer-[a-z0-9][a-z0-9-]{7,48}$/u
        .test(request.observerUnitName ?? ""),
  "request_identity_invalid");
  assertMigration(request.migrationId);
  ensure(RELEASE.test(request.releaseId ?? "")
      && Number.isSafeInteger(request.currentAuthorityEpoch)
      && request.currentAuthorityEpoch >= 1
      && request.targetAuthorityEpoch === request.currentAuthorityEpoch + 1,
  "request_candidate_identity_invalid");
  ensure(HASH_PREFIXED.test(request.manifestApprovalDigest ?? "")
      && HASH_PREFIXED.test(request.currentApprovalDigest ?? "")
      && HASH.test(request.currentManifestSha256 ?? "")
      && HASH_PREFIXED.test(request.rollbackApprovalDigest ?? "")
      && HASH.test(request.baseEnvSha256 ?? "")
      && HASH.test(request.preTransitionProductionEnvSha256 ?? "")
      && HASH.test(request.productionEnvSha256 ?? "")
      && request.preTransitionProductionEnvSha256 !== request.productionEnvSha256
      && request.manifestGeneratedAt === request.approvalIssuedAt,
  "request_manifest_identity_invalid");
  const issued = parseTime(request.approvalIssuedAt, "request_issued_at_invalid");
  const expires = parseTime(request.approvalExpiresAt, "request_expires_at_invalid");
  ensure(expires - issued === 90 * 60_000, "request_approval_window_invalid");
  if (productionPaths) {
    const now = Date.now();
    ensure(issued <= now + 60_000 && now <= expires, "request_approval_not_current");
  }
  const nonce = request.autonomyAuthorization?.nonce;
  ensure(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    .test(nonce ?? ""), "request_nonce_invalid");
  const suffix = `${manifest.sourceCommit.slice(0, 12)}-${nonce.replaceAll("-", "").slice(0, 8)}`;
  ensure(request.stagingDirectory
      === `/home/ubuntu/.cache/market-radar-ops/wp-g0-2-canonical-compat-phase-${suffix}`
      && request.opsRoot
        === `/home/ubuntu/.cache/market-radar-ops/canonical-compat-phase-ops/${suffix}`
      && request.secureRoot
        === `/home/ubuntu/.local/state/market-radar-canonical-compat-phase/${suffix}`
      && request.evidenceDirectory
        === `/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-canonical-compat-phase-${suffix}`
      && request.runnerUnitName
        === `market-radar-canonical-compat-phase-${manifest.sourceCommit.slice(0, 7)}-${nonce.replaceAll("-", "").slice(0, 8)}`
      && request.observerUnitName
        === `market-radar-canonical-compat-observer-${manifest.sourceCommit.slice(0, 7)}-${nonce.replaceAll("-", "").slice(0, 8)}`
      && request.approvalRef
        === `MR-G0-CANONICAL-COMPAT-PHASE/${manifest.sourceCommit.slice(0, 12)}/${nonce.slice(0, 8)}`
      && request.autonomyAuthorization.approvalId
        === `MR-G0-CANONICAL-COMPAT-PHASE-${manifest.sourceCommit.slice(0, 12)}-${nonce}`,
  "request_nonce_path_binding_invalid");
  const [lineage, reconciliation, dualRead, codeRelease] = await Promise.all([
    privateEvidence(request.lineageEvidencePath, request.lineageEvidenceSha256,
      "lineage", productionPaths),
    privateEvidence(request.reconciliationEvidencePath, request.reconciliationEvidenceSha256,
      "reconciliation", productionPaths),
    privateEvidence(request.dualReadEvidencePath, request.dualReadEvidenceSha256,
      "dual_read", productionPaths),
    privateEvidence(request.codeReleaseEvidencePath, request.codeReleaseEvidenceSha256,
      "code_release", productionPaths),
  ]);
  validateLineage(lineage, request);
  const validatedReconciliation = validateReconciliationEvidence(reconciliation);
  ensure(validatedReconciliation.verificationMigrationId === request.migrationId,
    "reconciliation_migration_mismatch");
  const validatedDualRead = validateDualReadEvidence(dualRead, {
    migrationId: request.migrationId,
    releaseId: request.releaseId,
    authorityEpoch: request.currentAuthorityEpoch,
  });
  const validatedRelease = validateCodeReleaseEvidence(codeRelease);
  ensure(validatedRelease.targetCommit === request.productionCommit
      && validatedRelease.targetWebImageId === request.currentWebImageId,
  "code_release_current_identity_mismatch");
  const rawManifest = serializeManifest(buildCanonicalCompatManifest({
    currentAuthorityEpoch: request.currentAuthorityEpoch,
    currentApprovalDigest: request.currentApprovalDigest,
    currentManifestSha256: request.currentManifestSha256,
    dualReadEvidenceHash: validatedDualRead.evidenceHash,
    generatedAt: request.manifestGeneratedAt,
    migrationId: request.migrationId,
    reconciliationEvidenceHash: validatedReconciliation.evidenceHash,
    releaseId: request.releaseId,
  }));
  ensure(manifestApprovalDigest(rawManifest) === request.manifestApprovalDigest,
    "request_manifest_digest_mismatch");
  validateAuthorization(request.autonomyAuthorization, request, manifest);
  return {
    status: "PASS_CANONICAL_COMPAT_PHASE_EXECUTION_REQUEST",
    manifestApprovalDigest: request.manifestApprovalDigest,
    targetAuthorityEpoch: request.targetAuthorityEpoch,
    comparedWrites: validatedReconciliation.comparedWrites,
    productionExecuted: false,
    secretsPrinted: false,
  };
}

export function createProductionExecutionRequest({
  bundleSha256,
  manifest,
  nonce = randomUUID(),
  now = new Date(),
  runtime,
}) {
  ensure(HASH.test(bundleSha256 ?? ""), "bundle_sha256_invalid");
  ensure(COMMIT.test(manifest.sourceCommit ?? "") && COMMIT.test(manifest.sourceTree ?? ""),
    "transport_source_identity_invalid");
  ensure(runtime.productionCommit === REQUIRED_PRODUCTION_COMMIT
      && runtime.productionTree === runtime.productionCommitTree
      && IMAGE.test(runtime.currentWebImageId ?? "")
      && CONTAINER.test(runtime.candidateWorkerContainerId ?? "")
      && IMAGE.test(runtime.candidateWorkerImageId ?? "")
      && HASH.test(runtime.productionEnvSha256 ?? "")
      && HASH.test(runtime.targetProductionEnvSha256 ?? "")
      && runtime.productionEnvSha256 !== runtime.targetProductionEnvSha256
      && HASH_PREFIXED.test(runtime.currentApprovalDigest ?? "")
      && HASH.test(runtime.currentManifestSha256 ?? ""),
  "runtime_identity_invalid");
  assertMigration(runtime.migrationId);
  ensure(RELEASE.test(runtime.releaseId ?? "")
      && Number.isSafeInteger(runtime.currentAuthorityEpoch)
      && runtime.currentAuthorityEpoch >= 1,
  "runtime_candidate_identity_invalid");
  const issuedAt = new Date(now);
  const expiresAt = new Date(issuedAt.getTime() + 90 * 60_000);
  const suffix = `${manifest.sourceCommit.slice(0, 12)}-${nonce.replaceAll("-", "").slice(0, 8)}`;
  const targetAuthorityEpoch = runtime.currentAuthorityEpoch + 1;
  const reconciliation = runtime.reconciliationEvidence;
  validateReconciliationEvidence(reconciliation);
  const dualRead = validateDualReadEvidence(runtime.dualReadEvidence, {
    migrationId: runtime.migrationId,
    releaseId: runtime.releaseId,
    authorityEpoch: runtime.currentAuthorityEpoch,
  });
  const manifestRaw = serializeManifest(buildCanonicalCompatManifest({
    currentAuthorityEpoch: runtime.currentAuthorityEpoch,
    dualReadEvidenceHash: dualRead.evidenceHash,
    generatedAt: issuedAt.toISOString(),
    migrationId: runtime.migrationId,
    reconciliationEvidenceHash: reconciliation.evidenceHash,
    releaseId: runtime.releaseId,
  }));
  const request = {
    packageId: PACKAGE_ID,
    productionRoot: PRODUCTION_ROOT,
    productionCommit: runtime.productionCommit,
    productionTree: runtime.productionTree,
    productionCommitTree: runtime.productionCommitTree,
    webImageId: runtime.currentWebImageId,
    currentWebImageId: runtime.currentWebImageId,
    candidateWorkerContainerId: runtime.candidateWorkerContainerId,
    candidateWorkerImageId: runtime.candidateWorkerImageId,
    migrationId: runtime.migrationId,
    releaseId: runtime.releaseId,
    currentAuthorityEpoch: runtime.currentAuthorityEpoch,
    targetAuthorityEpoch,
    currentApprovalDigest: runtime.currentApprovalDigest,
    currentManifestSha256: runtime.currentManifestSha256,
    manifestGeneratedAt: issuedAt.toISOString(),
    manifestApprovalDigest: manifestApprovalDigest(manifestRaw),
    rollbackApprovalDigest: `sha256:${sha256(canonicalJson({
      action: "rollback_canonical_compat_to_legacy_frozen",
      migrationId: runtime.migrationId,
      releaseId: runtime.releaseId,
      targetAuthorityEpoch,
    }))}`,
    baseEnvPath: runtime.baseEnvPath,
    baseEnvSha256: runtime.baseEnvSha256,
    productionEnvPath: runtime.productionEnvPath,
    preTransitionProductionEnvSha256: runtime.productionEnvSha256,
    productionEnvSha256: runtime.targetProductionEnvSha256,
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
    codeReleaseEvidencePath: runtime.codeReleaseEvidencePath,
    codeReleaseEvidenceSha256: runtime.codeReleaseEvidenceSha256,
    postgresAdminEnvPath: POSTGRES_ADMIN_ENV,
    transportBundleSha256: bundleSha256,
    contractSha256: manifest.contractSha256,
    runnerArtifactSha256: manifest.runnerArtifactSha256,
    stagingDirectory: `/home/ubuntu/.cache/market-radar-ops/wp-g0-2-canonical-compat-phase-${suffix}`,
    opsRoot: `/home/ubuntu/.cache/market-radar-ops/canonical-compat-phase-ops/${suffix}`,
    secureRoot: `/home/ubuntu/.local/state/market-radar-canonical-compat-phase/${suffix}`,
    evidenceDirectory: `/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-canonical-compat-phase-${suffix}`,
    runnerUnitName: `market-radar-canonical-compat-phase-${manifest.sourceCommit.slice(0, 7)}-${nonce.replaceAll("-", "").slice(0, 8)}`,
    observerUnitName: `market-radar-canonical-compat-observer-${manifest.sourceCommit.slice(0, 7)}-${nonce.replaceAll("-", "").slice(0, 8)}`,
    autonomyTrustRoot: TRUST_ROOT,
    services: ["web"],
    sessionIndependentExecutionRequired: true,
    temporaryArtifactCleanupRequired: true,
    operator: "codex-primary",
    approvalRef: `MR-G0-CANONICAL-COMPAT-PHASE/${manifest.sourceCommit.slice(0, 12)}/${nonce.slice(0, 8)}`,
    approvalIssuedAt: issuedAt.toISOString(),
    approvalExpiresAt: expiresAt.toISOString(),
    autonomyAuthorization: null,
  };
  const emptyDiff = sha256("");
  const preflight = {
    productionCommit: request.productionCommit,
    productionTree: request.productionTree,
    currentWebImageId: request.currentWebImageId,
    candidateWorkerContainerId: request.candidateWorkerContainerId,
    candidateWorkerImageId: request.candidateWorkerImageId,
    migrationId: request.migrationId,
    releaseId: request.releaseId,
    currentAuthorityEpoch: request.currentAuthorityEpoch,
    currentApprovalDigest: request.currentApprovalDigest,
    currentManifestSha256: request.currentManifestSha256,
    baseEnvSha256: request.baseEnvSha256,
    preTransitionProductionEnvSha256: request.preTransitionProductionEnvSha256,
    targetProductionEnvSha256: request.productionEnvSha256,
    composeSha256: request.composeSha256,
  };
  request.autonomyAuthorization = {
    schemaVersion: "market-radar-package-authorization.v1",
    mode: "g0_g8_standing_user_grant",
    approvedBy: "user_standing_grant",
    grantId: "MR-G0-G8-USER-STANDING-GRANT-20260714-034826",
    approvalId: `MR-G0-CANONICAL-COMPAT-PHASE-${manifest.sourceCommit.slice(0, 12)}-${nonce}`,
    nonce,
    gate: "G0",
    packageId: PACKAGE_ID,
    scope: PACKAGE_ID,
    actionClass: "canonical_compat_activation",
    riskTier: "R2_AUTHORITY_TRANSITION",
    builderAgentId: "codex-primary",
    baseCommit: request.productionCommit,
    targetCommit: request.productionCommit,
    targetTree: request.productionTree,
    diffSha256: emptyDiff,
    pathSetSha256: emptyDiff,
    contractSha256: request.contractSha256,
    runnerSha256: request.runnerArtifactSha256,
    artifactSha256: manifest.transportArtifactSha256,
    imageOrMigrationSha256: sha256(canonicalJson({
      migrationId: request.migrationId,
      currentAuthorityEpoch: request.currentAuthorityEpoch,
      targetAuthorityEpoch: request.targetAuthorityEpoch,
      currentApprovalDigest: request.currentApprovalDigest,
      manifestApprovalDigest: request.manifestApprovalDigest,
    })),
    composeSha256: request.composeSha256,
    environmentFingerprintSha256: sha256(canonicalJson({
      baseEnvSha256: request.baseEnvSha256,
      preTransitionProductionEnvSha256: request.preTransitionProductionEnvSha256,
      targetProductionEnvSha256: request.productionEnvSha256,
      composeSha256: request.composeSha256,
    })),
    productionIdentitySha256: sha256(canonicalJson({
      productionCommit: request.productionCommit,
      productionTree: request.productionTree,
      currentWebImageId: request.currentWebImageId,
      candidateWorkerContainerId: request.candidateWorkerContainerId,
      candidateWorkerImageId: request.candidateWorkerImageId,
    })),
    gateEvidenceSha256: sha256(canonicalJson({
      lineageEvidenceSha256: request.lineageEvidenceSha256,
      reconciliationEvidenceSha256: request.reconciliationEvidenceSha256,
      dualReadEvidenceSha256: request.dualReadEvidenceSha256,
      codeReleaseEvidenceSha256: request.codeReleaseEvidenceSha256,
    })),
    preflightSha256: sha256(canonicalJson(preflight)),
    backupRestoreEvidenceSha256: sha256(canonicalJson({
      currentWebImageId: request.currentWebImageId,
      productionEnvSha256: request.preTransitionProductionEnvSha256,
      targetProductionEnvSha256: request.productionEnvSha256,
      rollbackTarget: "legacy_frozen",
    })),
    rollbackTarget: `${request.productionCommit}:legacy_frozen`,
    observationContractSha256: sha256(canonicalJson({
      sampleIntervalSeconds: OBSERVATION_INTERVAL_SECONDS,
      exactSamples: MINIMUM_OBSERVATION_SAMPLES,
      minimumHours: MINIMUM_OBSERVATION_HOURS,
      maximumSampleGapSeconds: MAXIMUM_SAMPLE_GAP_SECONDS,
      allPagesRequired: true,
      candidateResponseAuthorityConditionalOnParity: true,
      legacyFallbackAccepted: false,
    })),
    policySha256: manifest.policySha256,
    revocationEpoch: 2,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    maxExecutions: 1,
    packageAssertions: {
      allPagesCompared: true,
      automaticRollback: true,
      candidateWorkerMutationOnSuccess: false,
      environmentMutation: true,
      manifestMutation: true,
      phaseTransition: true,
      qualityThresholdChanged: false,
      secretsPresentInEvidence: false,
      webOnlyServiceMutation: true,
    },
  };
  return request;
}

export async function prepareAdminUrl(input, output) {
  const [envBytes, containerUserBytes, databaseBytes, extra] = input.toString("utf8").split("\0");
  ensure(extra === undefined && envBytes && containerUserBytes && databaseBytes,
    "admin_input_frame_invalid");
  const entries = Object.fromEntries(envBytes.trim().split("\n").map((line) => {
    const index = line.indexOf("=");
    ensure(index > 0, "admin_env_invalid");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
  ensure(exactKeys(entries, ["POSTGRES_USER", "POSTGRES_PASSWORD"]), "admin_env_keys_invalid");
  ensure(entries.POSTGRES_USER === containerUserBytes, "admin_user_mismatch");
  const url = new URL("postgresql://postgres:password@postgres/database");
  url.username = entries.POSTGRES_USER;
  url.password = entries.POSTGRES_PASSWORD;
  url.pathname = `/${databaseBytes}`;
  await writeFile(resolve(output), `${url.toString()}\n`, { mode: 0o600 });
  return { status: "pass", secretsPrinted: false };
}

async function standardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function git(root, args) {
  return (await execFileAsync("git", ["-C", root, ...args], {
    encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  })).stdout.trimEnd();
}

async function currentSourceIdentity(root) {
  const sourceCommit = await git(root, ["rev-parse", "HEAD"]);
  const sourceTree = await git(root, ["rev-parse", "HEAD^{tree}"]);
  const parent = (await git(root, ["rev-list", "--parents", "-n", "1", "HEAD"]))
    .split(" ").slice(1);
  ensure(parent.length === 1, "source_parent_count_invalid");
  const diff = `${await git(root, ["diff-tree", "--no-commit-id", "--name-status", "-r", "HEAD"])}\n`;
  const paths = `${(await git(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]))
    .split("\n").filter(Boolean).sort().join("\n")}\n`;
  const pointer = JSON.parse(await readFile(resolve(root, ".autonomy/latest-gate-result.json"), "utf8"));
  const gateBytes = await readFile(resolve(root, pointer.resultPath));
  const gate = JSON.parse(gateBytes);
  ensure(sha256(gateBytes) === pointer.resultSha256 && gate.status === "pass"
      && gate.gitHead === sourceCommit && gate.gitTree === sourceTree,
  "gate_source_identity_invalid");
  return {
    sourceCommit,
    sourceTree,
    sourceParentCommit: parent[0],
    sourceDiffSha256: sha256(diff),
    sourcePathSetSha256: sha256(paths),
    gateEvidenceSha256: pointer.resultSha256,
  };
}

export async function buildTransportBundle({
  root = process.cwd(), output, sourceIdentity,
} = {}) {
  const local = await validateLocalPreparation(root);
  const identity = sourceIdentity ?? await currentSourceIdentity(root);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "candidate-canonical-compat-phase-"));
  const payloadRoot = join(temporaryRoot, "payload");
  try {
    for (const file of TRANSPORT_FILES) {
      const target = join(payloadRoot, file);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await cp(resolve(root, file), target);
      await chmod(target, file.endsWith(".sh") || file.endsWith(".mjs") || file.endsWith(".cjs")
        ? 0o700 : 0o600);
      await utimes(target, FIXED_TIME, FIXED_TIME);
    }
    const transport = await artifact(root, TRANSPORT_FILES);
    const manifest = {
      schemaVersion: "wp-g0.2-canonical-compat-phase-transport.v1",
      packageId: PACKAGE_ID,
      sourceCommit: identity.sourceCommit,
      sourceTree: identity.sourceTree,
      sourceParentCommit: identity.sourceParentCommit,
      sourceDiffSha256: identity.sourceDiffSha256,
      sourcePathSetSha256: identity.sourcePathSetSha256,
      gateEvidenceSha256: identity.gateEvidenceSha256,
      contractSha256: local.contractSha256,
      runnerArtifactSha256: local.runnerArtifactSha256,
      transportArtifactSha256: transport.sha256,
      policySha256: transport.fileSha256["scripts/governance/autonomy-policy.mjs"],
      fileSha256: transport.fileSha256,
      files: [...TRANSPORT_FILES].sort(),
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
    const outputPath = resolve(output ?? join(root,
      "reports/wp-g0-2-canonical-compat-phase-transition-and-observation",
      `canonical-compat-phase-${identity.sourceCommit.slice(0, 12)}.tar.gz`));
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes, { mode: 0o600 });
    return {
      status: "PASS_CANONICAL_COMPAT_PHASE_TRANSPORT",
      output: outputPath,
      sha256: sha256(bytes),
      size: bytes.length,
      manifest,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function verifyStagedTransport(root, manifest) {
  ensure(manifest?.schemaVersion === "wp-g0.2-canonical-compat-phase-transport.v1"
      && manifest.packageId === PACKAGE_ID && manifest.containsSecrets === false
      && manifest.reproducibleArchive === true
      && JSON.stringify(manifest.services) === '["web"]'
      && JSON.stringify(manifest.files) === JSON.stringify([...TRANSPORT_FILES].sort()),
  "transport_manifest_invalid");
  for (const key of ["sourceCommit", "sourceTree", "sourceParentCommit"]) {
    assertHash(manifest[key], `transport_${key}_invalid`, 40);
  }
  for (const key of [
    "sourceDiffSha256", "sourcePathSetSha256", "gateEvidenceSha256",
    "contractSha256", "runnerArtifactSha256", "transportArtifactSha256", "policySha256",
  ]) assertHash(manifest[key], `transport_${key}_invalid`);
  const transport = await artifact(root, TRANSPORT_FILES);
  ensure(transport.sha256 === manifest.transportArtifactSha256,
    "transport_artifact_checksum_mismatch");
  for (const file of TRANSPORT_FILES) {
    ensure(transport.fileSha256[file] === manifest.fileSha256[file],
      `transport_file_checksum_mismatch:${file}`);
  }
  return manifest;
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
  if (command === "prepare-admin-url") {
    process.stdout.write(`${JSON.stringify(await prepareAdminUrl(
      await standardInput(), options.output,
    ))}\n`);
    return;
  }
  if (command === "prepare-request") {
    const [manifest, runtime] = await Promise.all([
      readFile(resolve(options.manifest), "utf8").then(JSON.parse),
      readFile(resolve(options.runtime), "utf8").then(JSON.parse),
    ]);
    const request = createProductionExecutionRequest({
      bundleSha256: options["bundle-sha256"],
      manifest,
      nonce: options.nonce ?? randomUUID(),
      now: options.now ? new Date(options.now) : new Date(),
      runtime,
    });
    await writeFile(resolve(options.output), `${JSON.stringify(request, null, 2)}\n`, {
      flag: "wx", mode: 0o600,
    });
    process.stdout.write(`${JSON.stringify({
      status: "PASS_CANONICAL_COMPAT_PHASE_REQUEST_PREPARED",
      output: resolve(options.output),
      requestSha256: sha256(`${JSON.stringify(request, null, 2)}\n`),
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
    process.stdout.write(`${JSON.stringify(await validateApprovalRequest({
      manifest, request, productionPaths: options.rehearsal !== "true",
    }), null, 2)}\n`);
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
