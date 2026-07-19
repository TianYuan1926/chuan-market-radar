#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmod, cp, lstat, mkdir, mkdtemp, readFile, rm, utimes, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { REQUIRED_PACKAGE_APPROVAL_FIELDS } from "../../governance/autonomy-policy.mjs";
import { validateCycleContinuationInput } from "./runner.mjs";

const execFileAsync = promisify(execFile);
export const PACKAGE_ID = "WP-G0.2-VALIDATION-CYCLE-CONTINUATION-PRODUCTION";
export const CONTRACT_PATH =
  "docs/governance/wp-g0-2-validation-cycle-continuation-production-packet.v5.json";
const POLICY_PATH = "scripts/governance/autonomy-policy.mjs";
const TRUST_ROOT = "/home/ubuntu/.local/state/market-radar-autonomy";
const PRODUCTION_ROOT = "/home/ubuntu/apps/chuan-market-radar";
const POSTGRES_ADMIN_ENV =
  "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env";
const GRANT_ID = "MR-G0-G8-USER-STANDING-GRANT-20260714-034826";
const AUTHORIZATION_SCHEMA = "market-radar-package-authorization.v1";
const SOURCE_DATE_EPOCH = 946_684_800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1_000);

export const TRANSPORT_FILES = Object.freeze([
  CONTRACT_PATH,
  POLICY_PATH,
  "scripts/governance/autonomy-production-lease-cli.mjs",
  "scripts/governance/autonomy-production-lease.mjs",
  "scripts/production/candidate-cycle-continuation/bundle.mjs",
  "scripts/production/candidate-cycle-continuation/observation-runner.mjs",
  "scripts/production/candidate-cycle-continuation/observation-runner.sh",
  "scripts/production/candidate-cycle-continuation/production-entrypoint.sh",
  "scripts/production/candidate-cycle-continuation/production-runner.sh",
  "scripts/production/candidate-cycle-continuation/runner.mjs",
]);

const REQUEST_KEYS = Object.freeze([
  "approvalDigest", "approvalExpiresAt", "approvalIssuedAt", "approvalRef",
  "approvedPacketCommit", "approvedPacketTree", "autonomyAuthorization",
  "autonomyTrustRoot", "baseEnvSha256", "composeSha256", "currentMigrationId",
  "currentAuthorityEpoch", "currentPhase", "currentProductionCommit", "currentReleaseId",
  "currentWebImageId", "currentWorkerState", "evidenceDirectory", "executeCycleContinuation",
  "identityOverridePath", "identityOverrideSha256", "identityWrapperPath",
  "identityWrapperSha256", "nextMigrationId", "nextReleaseId", "observerUnitName",
  "operator", "opsRoot", "packageId", "postgresAdminEnvPath", "productionEnvSha256",
  "preflightEvidencePath", "preflightSha256", "productionMutation", "productionRoot",
  "rollbackWebImageRef",
  "runnerUnitName", "secureRoot", "services", "sessionIndependentExecutionRequired",
  "stagingDirectory", "targetCommit", "targetTree", "temporaryArtifactCleanupRequired",
  "transportBundleSha256", "transportMethod",
]);
const RUNTIME_KEYS = Object.freeze([
  "baseEnvSha256", "composeSha256", "currentAuthorityEpoch", "currentPhase",
  "currentMigrationId", "currentProductionCommit", "currentReleaseId", "currentWebImageId",
  "currentWorkerState", "identityOverridePath", "identityOverrideSha256",
  "identityWrapperPath", "identityWrapperSha256", "nextMigrationId", "nextReleaseId",
  "preflightEvidencePath", "preflightSha256", "productionEnvSha256", "rollbackWebImageRef",
]);
const MANIFEST_KEYS = Object.freeze([
  "approvalEligible", "archiveFormat", "containsSecrets", "contractSha256", "fileSha256",
  "files", "gateEvidenceSha256", "packageId", "policySha256", "reproducibleArchive",
  "runnerArtifactSha256", "schemaVersion", "services", "sessionIndependentExecutionRequired",
  "sourceCommit", "sourceDateEpoch", "sourceDiffSha256", "sourceParentCommit",
  "sourcePathSetSha256", "sourceTree", "transportArtifactSha256", "transportBundleSha256",
]);

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function cycleContinuationBindingHashes(runtime, contract) {
  return {
    imageOrMigrationSha256: sha256(canonicalJson({
      currentAuthorityEpoch: runtime.currentAuthorityEpoch,
      currentMigrationId: runtime.currentMigrationId,
      currentPhase: runtime.currentPhase,
      currentReleaseId: runtime.currentReleaseId,
      currentWebImageId: runtime.currentWebImageId,
      currentWorkerState: runtime.currentWorkerState,
      nextMigrationId: runtime.nextMigrationId,
      nextReleaseId: runtime.nextReleaseId,
    })),
    environmentFingerprintSha256: sha256(canonicalJson({
      baseEnvSha256: runtime.baseEnvSha256,
      composeSha256: runtime.composeSha256,
      identityOverrideSha256: runtime.identityOverrideSha256,
      identityWrapperSha256: runtime.identityWrapperSha256,
      productionEnvSha256: runtime.productionEnvSha256,
    })),
    productionIdentitySha256: sha256(canonicalJson({
      currentAuthorityEpoch: runtime.currentAuthorityEpoch,
      currentMigrationId: runtime.currentMigrationId,
      currentPhase: runtime.currentPhase,
      currentProductionCommit: runtime.currentProductionCommit,
      currentReleaseId: runtime.currentReleaseId,
      currentWebImageId: runtime.currentWebImageId,
      currentWorkerState: runtime.currentWorkerState,
    })),
    observationContractSha256: sha256(canonicalJson(contract.observation)),
  };
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
  return { checksums, fileCount: Object.keys(checksums).length, sha256: sha256(JSON.stringify(checksums)) };
}

export async function validateProductionPacketContract(root = process.cwd()) {
  const bytes = await readFile(resolve(root, CONTRACT_PATH));
  const contract = JSON.parse(bytes);
  const runnerArtifact = await artifact(root, contract.runnerArtifact?.files ?? []);
  const violations = [];
  if (contract.schemaVersion !== "wp-g0.2-validation-cycle-continuation-production-packet.v5"
      || contract.packageId !== PACKAGE_ID) violations.push("contract_identity");
  if (contract.productionAuthorization !== false || contract.productionExecuted !== false
      || contract.priorActivationFinalPass !== false) violations.push("production_truth");
  if (contract.actionClass !== "feature_phase_activation"
      || contract.riskTier !== "R2_AUTHORITY_TRANSITION") violations.push("risk_boundary");
  if (contract.productionRoot !== PRODUCTION_ROOT
      || contract.postgresAdminEnvPath !== POSTGRES_ADMIN_ENV) violations.push("runtime_identity");
  if (contract.standingGrant?.grantId !== GRANT_ID
      || contract.standingGrant?.revocationEpoch !== 2
      || contract.standingGrant?.maximumExecutions !== 1
      || contract.standingGrant?.maximumApprovalWindowMinutes !== 90
      || contract.standingGrant?.externalLeaseRequired !== true) violations.push("standing_grant");
  if (runnerArtifact.fileCount !== contract.runnerArtifact?.fileCount
      || runnerArtifact.sha256 !== contract.runnerArtifact?.sha256) violations.push("runner_artifact");
  if (contract.prerequisites?.priorActivationOutcome
        !== "ROLLBACK_TO_LEGACY_AUTHORITY_OBSERVATION_UNRESOLVED_OUTBOX"
      || contract.prerequisites?.priorActivationSamplesObserved !== 42
      || contract.prerequisites?.priorActivationAcceptedSamples !== 41
      || contract.prerequisites?.priorActivationRejectedSample !== 42
      || contract.prerequisites?.priorActivationCompletedWrites !== 5_218
      || contract.prerequisites?.priorActivationLastAcceptedCompletedWrites !== 5_218
      || contract.prerequisites?.priorActivationFailure
        !== "observation_unresolved_outbox_transient_between_samples"
      || contract.prerequisites?.priorActivationLastSampleHealth
        !== "ready_fresh_critical_subsystems_healthy"
      || contract.prerequisites?.priorActivationSamplesReusable !== false
      || contract.prerequisites?.currentProductionCommit
        !== "cec0b6572bb09ae91ff9e013f8bb160f73c045e2"
      || contract.prerequisites?.currentProductionTree
        !== "eb217a7fbaad5b464279a08d4441a8249fc266e3"
      || contract.prerequisites?.currentProductionWebImageMustBeDynamicallyBound !== true
      || contract.prerequisites?.freshActivationRequired !== true
      || contract.prerequisites?.currentProductionSourcePhase !== "legacy"
      || contract.prerequisites?.currentProductionWriteFrozen !== true
      || contract.prerequisites?.currentProductionAuthorityEpoch !== 4
      || contract.prerequisites?.currentProductionMigrationId
        !== "candidate-episode-v1-cycle-6"
      || contract.prerequisites?.currentProductionReleaseId
        !== "candidate-shadow-cycle-6-72ee2893"
      || contract.prerequisites?.nextProductionMigrationId
        !== "candidate-episode-v1-cycle-7"
      || contract.prerequisites?.activeCyclesExact !== 0
      || contract.prerequisites?.candidateWorkerBaseline !== "absent"
      || contract.prerequisites?.candidateEpisodesMinimum !== 600
      || contract.prerequisites?.candidateEpisodesMaximum !== 648
      || contract.prerequisites?.candidateEventsExact !== 5_266
      || contract.prerequisites?.candidateCheckpointsExact !== 0
      || contract.prerequisites?.candidateOutcomesExact !== 0
      || contract.prerequisites?.candidateOutboxExact !== 10_532
      || contract.prerequisites?.legacySourceCompletedExact !== 5_266
      || contract.prerequisites?.legacySourceUnresolvedMaximum !== 0
      || contract.prerequisites?.candidateEventPendingExact !== 5_266
      || contract.prerequisites?.candidateEventNonPendingExact !== 0
      || contract.prerequisites?.candidateEventOrphansExact !== 0
      || contract.prerequisites?.candidateEventContractMismatchesExact !== 0) {
    violations.push("prerequisites");
  }
  if (contract.execution?.runner !== "transient_systemd_unit"
      || contract.execution?.sessionIndependent !== true
      || contract.execution?.runtimeMaxSeconds !== 5_400
      || JSON.stringify(contract.execution?.services) !== JSON.stringify(["web", "candidate-shadow-worker"])) {
    violations.push("execution_boundary");
  }
  if (contract.databaseBoundary?.isolation !== "serializable"
      || contract.databaseBoundary?.controlTableLock !== "share_row_exclusive"
      || contract.databaseBoundary?.migrationAllowed !== false
      || contract.databaseBoundary?.candidateBusinessDataMutationAllowed !== false
      || contract.databaseBoundary?.oldDeadlineMutationAllowed !== false
      || contract.databaseBoundary?.maximumActiveCycles !== 1
      || JSON.stringify(contract.databaseBoundary?.continuationCoreSourcePhases)
        !== JSON.stringify(["shadow_capture", "legacy"])
      || contract.databaseBoundary?.productionPacketSourcePhase !== "legacy"
      || contract.databaseBoundary?.legacySourceUnresolvedMaximum !== 0
      || contract.databaseBoundary?.candidateEventLanePreserved !== true) {
    violations.push("database_boundary");
  }
  if (contract.rollback?.reactivateOldCycle !== false
      || contract.rollback?.freezeNewCycle !== true
      || contract.rollback?.disableCandidateFlags !== true
      || contract.rollback?.restoreGit !== true
      || contract.rollback?.restoreWebImage !== true
      || contract.rollback?.restoreWorkerBaselineAbsent !== true
      || contract.rollback?.legacyAuthorityRetained !== true) violations.push("rollback_boundary");
  if (JSON.stringify(contract.cleanup?.preObservationFailureRemoves)
        !== JSON.stringify(["staging", "secure", "ops", "rollback_image_ref", "unused_target_images"])
      || JSON.stringify(contract.cleanup?.observationRollbackRemoves)
        !== JSON.stringify(["staging", "secure", "ops", "rollback_image_ref", "unused_target_images"])
      || JSON.stringify(contract.cleanup?.observationPassRemoves)
        !== JSON.stringify(["staging", "secure", "ops"])
      || JSON.stringify(contract.cleanup?.retainedAlways) !== JSON.stringify(["redacted_evidence"])
      || contract.cleanup?.retainLiveTargetImagesOnPass !== true
      || contract.cleanup?.retainRollbackWebImageOnPass !== true
      || contract.cleanup?.targetImageDeletionRequiresNoContainers !== true
      || contract.cleanup?.pathDeletionRequiresExactRequestBinding !== true) {
    violations.push("cleanup_boundary");
  }
  if (contract.observation?.minimumComparedWrites !== 10_000
      || contract.observation?.minimumStabilitySeconds !== 1_800
      || contract.observation?.minimumSamples !== 7
      || contract.observation?.minimumActivationSamples !== 289
      || contract.observation?.minimumActivationHours !== 24
      || contract.observation?.maximumSampleGapSeconds !== 600
      || contract.observation?.automaticReconciliation !== false
      || contract.observation?.automaticCanonicalCutover !== false
      || contract.observation?.healthFreshnessBoundary?.agingSampleAccepted !== false
      || contract.observation?.healthFreshnessBoundary?.retryOnlyState !== "degraded_aging"
      || contract.observation?.healthFreshnessBoundary?.maximumRecheckSeconds !== 180
      || contract.observation?.healthFreshnessBoundary?.recheckIntervalSeconds !== 15
      || contract.observation?.healthFreshnessBoundary?.criticalHealthMustRemainHealthy !== true
      || contract.observation?.healthFreshnessBoundary?.candidateWriteDuringRecheck !== false
      || contract.observation?.healthFreshnessBoundary?.recheckAttemptCountsAsSample !== false
      || contract.observation?.healthFreshnessBoundary?.exhaustionRequiresRollback !== true
      || contract.observation?.databaseSnapshotCoherence?.sampleSchemaVersion
        !== "candidate-validation-cycle-observation-sample.v3"
      || contract.observation?.databaseSnapshotCoherence?.maximumBracketSeconds !== 60
      || JSON.stringify(contract.observation?.databaseSnapshotCoherence?.captureOrder)
        !== JSON.stringify([
          "strict_fresh_health", "database_before", "candidate_monitor", "database_after",
          "isolated_validation",
        ])
      || contract.observation?.databaseSnapshotCoherence?.beforeAndAfterIdentityExact !== true
      || contract.observation?.databaseSnapshotCoherence?.beforeAndAfterEpochExact !== true
      || contract.observation?.databaseSnapshotCoherence?.beforeAndAfterDeadlineExact !== true
      || contract.observation?.databaseSnapshotCoherence?.completedWritesMonotonic !== true
      || contract.observation?.databaseSnapshotCoherence
        ?.monitorCompletedWithinBracketInclusive !== true
      || contract.observation?.databaseSnapshotCoherence?.topLevelDatabaseTruth !== "after"
      || contract.observation?.databaseSnapshotCoherence
        ?.legacyUnbracketedSamplesAccepted !== false
      || contract.observation?.databaseSnapshotCoherence
        ?.productionFailureReplay?.databaseBeforeCompleted !== 4_556
      || contract.observation?.databaseSnapshotCoherence
        ?.productionFailureReplay?.monitorCompleted !== 4_578
      || contract.observation?.databaseSnapshotCoherence
        ?.productionFailureReplay?.databaseAfterCompleted !== 4_602
      || contract.observation?.databaseSnapshotCoherence?.productionFailureReplay?.claimed !== 24
      || contract.observation?.databaseSnapshotCoherence?.productionFailureReplay?.unresolved !== 24
      || contract.observation?.databaseSnapshotCoherence
        ?.productionFailureReplay?.oldestAgeSeconds !== 22.116749
      || contract.observation?.databaseSnapshotCoherence?.productionFailureReplay?.accepted !== true
      || contract.observation?.transientClaimBoundary?.pendingAndClaimedMayBeNonzero !== true
      || contract.observation?.transientClaimBoundary?.unresolvedArithmeticExact !== true
      || contract.observation?.transientClaimBoundary?.retryWaitMaximum !== 0
      || contract.observation?.transientClaimBoundary?.unresolvedQuarantineMaximum !== 0
      || contract.observation?.transientClaimBoundary?.quarantineMaximum !== 0
      || contract.observation?.transientClaimBoundary?.monitorWarningsMaximum !== 0
      || contract.observation?.transientClaimBoundary?.monitorBlockersMaximum !== 0
      || contract.observation?.transientClaimBoundary
        ?.oldestUnresolvedAgeExclusiveMaximumSeconds !== 300
      || contract.observation?.transientClaimBoundary?.productionRaceReplay?.claimed !== 38
      || contract.observation?.transientClaimBoundary?.productionRaceReplay?.unresolved !== 38
      || contract.observation?.transientClaimBoundary?.productionRaceReplay?.oldestAgeSeconds
        !== 29.526496
      || contract.observation?.transientClaimBoundary?.productionRaceReplay?.accepted !== true
      || contract.observation?.transientOutboxRecheckBoundary?.retryOnlyReason
        !== "observation_unresolved_outbox"
      || contract.observation?.transientOutboxRecheckBoundary?.recheckIntervalSeconds !== 5
      || contract.observation?.transientOutboxRecheckBoundary?.maximumRecheckSeconds !== 45
      || contract.observation?.transientOutboxRecheckBoundary
        ?.maximumDatabaseBracketSeconds !== 60
      || contract.observation?.transientOutboxRecheckBoundary?.nonTransientFailureRetried !== false
      || contract.observation?.transientOutboxRecheckBoundary?.exhaustionRequiresRollback !== true
      || contract.observation?.transientOutboxRecheckBoundary?.failedCycleSamplesReusable !== false) {
    violations.push("observation_boundary");
  }
  for (const forbidden of [
    "threshold_lowering", "observation_shortening", "failed_sample_reuse", "old_deadline_reset", "migration",
    "redis_mutation", "scanner_worker_mutation", "other_service_mutation", "canonical_cutover",
    "production_ranking_change", "future_outcome_input", "formal_backtest",
  ]) if (!contract.forbidden?.includes(forbidden)) violations.push(`forbidden_missing:${forbidden}`);
  return {
    status: violations.length === 0
      ? "PASS_LOCAL_CYCLE_CONTINUATION_PRODUCTION_PACKET"
      : "FAIL",
    productionMutationAllowed: false,
    productionExecuted: false,
    contractSha256: sha256(bytes),
    runnerArtifactSha256: runnerArtifact.sha256,
    violations,
  };
}

export async function verifyDynamicPreflight(request, suppliedContract = null) {
  const contract = suppliedContract ?? JSON.parse(await readFile(resolve(process.cwd(), CONTRACT_PATH)));
  const bytes = await readFile(request.preflightEvidencePath);
  ensure(sha256(bytes) === request.preflightSha256, "preflight_checksum_mismatch");
  const preflight = JSON.parse(bytes);
  ensure(exactKeys(preflight, [
    "activeCycles", "baseEnvSha256", "candidateCheckpoints", "candidateDeadlineAt",
    "candidateEventContractMismatches", "candidateEventNonPending", "candidateEventOrphans",
    "candidateEventPending", "candidateEvents", "candidateEpisodes", "candidateOutbox",
    "candidateOutcomes", "candidatePhase", "candidateWriteFrozen", "composeSha256",
    "currentAuthorityEpoch", "currentMigrationId", "currentReleaseId",
    "currentWebImageId", "currentWorkerState", "database", "detachedHead", "healthLevel",
    "identityOverrideSha256", "identityWrapperSha256", "observedAt", "productionEnvSha256",
    "legacySourceCompleted", "legacySourceUnresolved", "otherSourceUnresolved",
    "productionMutation", "productionRoot", "redis", "scanFreshness", "schemaVersion",
    "secretsPrinted", "status", "worktreeClean",
  ]), "preflight_shape_invalid");
  ensure(preflight.schemaVersion === "candidate-cycle-continuation-production-preflight.v1"
      && preflight.status === "PASS_READ_ONLY_PREFLIGHT"
      && preflight.productionMutation === false && preflight.secretsPrinted === false,
  "preflight_truth_invalid");
  for (const key of [
    "productionRoot", "currentWebImageId", "currentWorkerState", "baseEnvSha256",
    "productionEnvSha256", "composeSha256", "identityWrapperSha256", "identityOverrideSha256",
    "currentMigrationId", "currentAuthorityEpoch", "currentReleaseId",
  ]) ensure(preflight[key] === request[key], `preflight_binding_mismatch:${key}`);
  ensure(preflight.worktreeClean === true && preflight.detachedHead === request.currentProductionCommit,
    "preflight_git_invalid");
  ensure(preflight.healthLevel === "ready" && preflight.scanFreshness === "fresh"
      && preflight.database === "ready" && preflight.redis === "healthy",
  "preflight_health_invalid");
  ensure(preflight.candidatePhase === request.currentPhase
      && preflight.candidatePhase === "legacy" && preflight.candidateWriteFrozen === true
      && preflight.activeCycles === 0, "preflight_candidate_control_invalid");
  ensure(preflight.currentWorkerState === "absent",
    "preflight_candidate_worker_not_absent");
  const prerequisites = contract.prerequisites ?? {};
  ensure(preflight.candidateEpisodes >= prerequisites.candidateEpisodesMinimum
      && preflight.candidateEpisodes <= prerequisites.candidateEpisodesMaximum
      && preflight.candidateEvents === prerequisites.candidateEventsExact
      && preflight.candidateCheckpoints === prerequisites.candidateCheckpointsExact
      && preflight.candidateOutcomes === prerequisites.candidateOutcomesExact
      && preflight.candidateOutbox === prerequisites.candidateOutboxExact
      && preflight.legacySourceCompleted === prerequisites.legacySourceCompletedExact,
  "preflight_candidate_counts_invalid");
  ensure(preflight.legacySourceUnresolved <= prerequisites.legacySourceUnresolvedMaximum,
    "preflight_legacy_source_unresolved");
  ensure(preflight.candidateEventPending === prerequisites.candidateEventPendingExact
      && preflight.candidateEventNonPending === prerequisites.candidateEventNonPendingExact
      && preflight.otherSourceUnresolved === 0,
  "preflight_candidate_event_lane_invalid");
  ensure(preflight.candidateEventOrphans === prerequisites.candidateEventOrphansExact
      && preflight.candidateEventContractMismatches
        === prerequisites.candidateEventContractMismatchesExact,
  "preflight_candidate_event_integrity_invalid");
  const observedAt = parseTimestamp(preflight.observedAt, "preflight_observed_at_invalid");
  const issuedAt = parseTimestamp(request.approvalIssuedAt, "request_issued_at_invalid");
  ensure(observedAt <= issuedAt && issuedAt - observedAt <= 15 * 60_000,
    "preflight_not_fresh_for_approval");
  parseTimestamp(preflight.candidateDeadlineAt, "preflight_deadline_invalid");
  return preflight;
}

function validateAuthorization(authorization, request, manifest, contract) {
  ensure(authorization && typeof authorization === "object" && !Array.isArray(authorization),
    "authorization_missing");
  ensure(authorization.schemaVersion === AUTHORIZATION_SCHEMA,
    "authorization_schema_invalid");
  for (const key of REQUIRED_PACKAGE_APPROVAL_FIELDS) {
    ensure(authorization[key] !== undefined && authorization[key] !== null
      && authorization[key] !== "", `authorization_required_field_missing:${key}`);
  }
  for (const key of [
    "diffSha256", "pathSetSha256", "contractSha256", "runnerSha256", "artifactSha256",
    "imageOrMigrationSha256", "composeSha256", "environmentFingerprintSha256",
    "productionIdentitySha256", "gateEvidenceSha256", "preflightSha256",
    "backupRestoreEvidenceSha256", "observationContractSha256", "policySha256",
  ]) assertHash(authorization[key], `authorization_hash_invalid:${key}`);
  const bindings = cycleContinuationBindingHashes(request, contract);
  ensure(authorization.mode === "g0_g8_standing_user_grant"
      && authorization.approvedBy === "user_standing_grant"
      && authorization.grantId === GRANT_ID && authorization.revocationEpoch === 2
      && authorization.packageId === PACKAGE_ID && authorization.gate === "G0"
      && authorization.scope === PACKAGE_ID
      && authorization.actionClass === "feature_phase_activation"
      && authorization.riskTier === "R2_AUTHORITY_TRANSITION"
      && authorization.builderAgentId === "codex-primary"
      && authorization.targetCommit === request.targetCommit
      && authorization.targetTree === request.targetTree
      && authorization.baseCommit === request.currentProductionCommit
      && authorization.contractSha256 === manifest.contractSha256
      && authorization.artifactSha256 === manifest.transportArtifactSha256
      && authorization.runnerSha256 === contract.runnerArtifact.sha256
      && authorization.imageOrMigrationSha256 === bindings.imageOrMigrationSha256
      && authorization.composeSha256 === request.composeSha256
      && authorization.environmentFingerprintSha256 === bindings.environmentFingerprintSha256
      && authorization.productionIdentitySha256 === bindings.productionIdentitySha256
      && authorization.observationContractSha256 === bindings.observationContractSha256
      && authorization.preflightSha256 === request.preflightSha256
      && authorization.rollbackTarget === request.currentProductionCommit
      && authorization.maxExecutions === 1
      && authorization.issuedAt === request.approvalIssuedAt
      && authorization.expiresAt === request.approvalExpiresAt
      && authorization.productionLeaseId === undefined
      && authorization.fencingToken === undefined,
  "authorization_binding_invalid");
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
  for (const [key, value] of Object.entries(assertions)) {
    ensure(authorization.packageAssertions[key] === value,
      `authorization_assertion_failed:${key}`);
  }
}

export async function validateProductionExecutionRequest(
  request,
  manifest,
  contract,
  bundleSha256,
  { now = new Date(), verifyEvidence = true } = {},
) {
  ensure(exactKeys(request, REQUEST_KEYS), "request_keys_mismatch");
  ensure(request.packageId === PACKAGE_ID && request.executeCycleContinuation === true
      && request.productionMutation === true, "request_identity_invalid");
  ensure(JSON.stringify(request.services) === JSON.stringify(["web", "candidate-shadow-worker"]),
    "request_services_invalid");
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
      && request.targetCommit === manifest.sourceCommit
      && request.targetTree === manifest.sourceTree,
  "request_packet_binding_mismatch");
  for (const key of [
    "approvedPacketCommit", "approvedPacketTree", "currentProductionCommit", "targetCommit",
    "targetTree",
  ]) {
    assertHash(request[key], `request_${key}_invalid`, 40);
  }
  for (const key of [
    "baseEnvSha256", "composeSha256", "identityOverrideSha256", "identityWrapperSha256",
    "productionEnvSha256",
  ]) assertHash(request[key], `request_${key}_invalid`);
  for (const key of ["currentWebImageId"]) {
    assertHash(request[key]?.replace(/^sha256:/u, ""), `request_${key}_invalid`);
  }
  validateCycleContinuationInput(request);
  ensure(request.currentPhase === "legacy", "request_source_phase_not_retired_legacy");
  ensure(request.currentWorkerState === "absent", "request_current_worker_not_absent");
  ensure(request.currentAuthorityEpoch
      === contract.prerequisites.currentProductionAuthorityEpoch,
  "request_current_authority_epoch_invalid");
  ensure(request.currentMigrationId
      === contract.prerequisites.currentProductionMigrationId,
  "request_current_migration_id_invalid");
  ensure(request.currentReleaseId
      === contract.prerequisites.currentProductionReleaseId,
  "request_current_release_id_invalid");
  ensure(request.currentProductionCommit
      === contract.prerequisites.currentProductionCommit,
  "request_current_production_commit_invalid");
  ensure(contract.prerequisites.currentProductionWebImageMustBeDynamicallyBound === true,
    "request_current_web_image_contract_invalid");
  ensure(request.nextMigrationId === contract.prerequisites.nextProductionMigrationId,
    "request_next_migration_id_invalid");
  ensure(/^sha256:[0-9a-f]{64}$/u.test(request.approvalDigest), "request_approval_digest_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/wp-g0-2-cycle-continuation-preflight-[a-z0-9][a-z0-9._-]{7,100}\/preflight\.json$/u.test(request.preflightEvidencePath),
    "preflight_evidence_path_invalid");
  assertHash(request.preflightSha256, "request_preflight_hash_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/wp-g0-2-cycle-continuation-[a-z0-9][a-z0-9._-]{7,100}$/u.test(request.stagingDirectory),
    "request_staging_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/cycle-continuation-ops\/wp-g0-2-cycle-continuation-[a-z0-9][a-z0-9._-]{7,100}$/u.test(request.opsRoot),
    "request_ops_invalid");
  ensure(/^\/home\/ubuntu\/\.local\/state\/market-radar-cycle-continuation\/[a-z0-9][a-z0-9._-]{7,100}$/u.test(request.secureRoot),
    "request_secure_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/wp-g0-2-cycle-continuation-[a-z0-9][a-z0-9._-]{7,100}$/u.test(request.evidenceDirectory),
    "request_evidence_invalid");
  ensure(/^market-radar-cycle-continuation-[a-z0-9][a-z0-9-]{7,48}$/u.test(request.runnerUnitName)
      && /^market-radar-cycle-observer-[a-z0-9][a-z0-9-]{7,48}$/u.test(request.observerUnitName),
  "request_unit_invalid");
  ensure(request.rollbackWebImageRef.startsWith("market-radar-rollback/wp-g0-2-cycle-continuation:web-"),
  "request_rollback_ref_invalid");
  ensure(request.identityWrapperPath.startsWith("/var/lib/market-radar-ops/")
      && request.identityOverridePath.startsWith("/var/lib/market-radar-ops/"),
  "request_identity_path_invalid");
  const issuedAt = parseTimestamp(request.approvalIssuedAt, "request_issued_at_invalid");
  const expiresAt = parseTimestamp(request.approvalExpiresAt, "request_expires_at_invalid");
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  ensure(expiresAt > issuedAt && expiresAt - issuedAt <= 90 * 60_000,
    "request_approval_window_invalid");
  ensure(nowMs >= issuedAt && nowMs < expiresAt, "request_approval_not_current");
  ensure(typeof request.operator === "string" && request.operator.length >= 2
      && /^[A-Za-z0-9._:/-]{8,128}$/u.test(request.approvalRef),
  "request_operator_invalid");
  validateAuthorization(request.autonomyAuthorization, request, manifest, contract);
  ensure(request.approvalDigest === `sha256:${sha256(canonicalJson(request.autonomyAuthorization))}`,
    "request_approval_digest_binding_mismatch");
  if (verifyEvidence) {
    await verifyDynamicPreflight(request, contract);
  }
  return request;
}

export function createProductionExecutionRequest({
  manifest, contract, bundleSha256, runtime, authorization, now = new Date(), nonce = randomUUID(),
}) {
  ensure(exactKeys(runtime, RUNTIME_KEYS), "runtime_keys_mismatch");
  const issuedAt = new Date(now);
  const expiresAt = new Date(issuedAt.getTime() + 89 * 60_000);
  const suffix = `${manifest.sourceCommit.slice(0, 12)}-${nonce.replaceAll("-", "").slice(0, 8)}`;
  const request = {
    packageId: PACKAGE_ID,
    executeCycleContinuation: true,
    productionMutation: true,
    services: ["web", "candidate-shadow-worker"],
    sessionIndependentExecutionRequired: true,
    temporaryArtifactCleanupRequired: true,
    transportMethod: "approved_orcaterm_bundle_upload",
    transportBundleSha256: bundleSha256,
    approvedPacketCommit: manifest.sourceCommit,
    approvedPacketTree: manifest.sourceTree,
    targetCommit: manifest.sourceCommit,
    targetTree: manifest.sourceTree,
    currentProductionCommit: runtime.currentProductionCommit,
    productionRoot: PRODUCTION_ROOT,
    stagingDirectory: `/home/ubuntu/.cache/market-radar-ops/wp-g0-2-cycle-continuation-${suffix}`,
    opsRoot: `/home/ubuntu/.cache/market-radar-ops/cycle-continuation-ops/wp-g0-2-cycle-continuation-${suffix}`,
    secureRoot: `/home/ubuntu/.local/state/market-radar-cycle-continuation/${suffix}`,
    evidenceDirectory: `/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-cycle-continuation-${suffix}`,
    runnerUnitName: `market-radar-cycle-continuation-${manifest.sourceCommit.slice(0, 7)}-${nonce.replaceAll("-", "").slice(0, 8)}`,
    observerUnitName: `market-radar-cycle-observer-${manifest.sourceCommit.slice(0, 7)}-${nonce.replaceAll("-", "").slice(0, 8)}`,
    autonomyTrustRoot: TRUST_ROOT,
    postgresAdminEnvPath: POSTGRES_ADMIN_ENV,
    operator: "codex-primary",
    approvalRef: `MR-G0-CYCLE/${manifest.sourceCommit.slice(0, 12)}/${nonce.slice(0, 8)}`,
    approvalIssuedAt: issuedAt.toISOString(),
    approvalExpiresAt: expiresAt.toISOString(),
    autonomyAuthorization: authorization,
    ...runtime,
    approvalDigest: `sha256:${sha256(canonicalJson(authorization))}`,
  };
  validateAuthorization(request.autonomyAuthorization, request, manifest, contract);
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

export async function verifyStagedTransport(root, manifest) {
  ensure(exactKeys(manifest, MANIFEST_KEYS), "transport_manifest_keys_mismatch");
  ensure(manifest.schemaVersion === "wp-g0.2-validation-cycle-continuation-transport.v2"
      && manifest.packageId === PACKAGE_ID && manifest.approvalEligible === true,
  "transport_manifest_identity_invalid");
  ensure(manifest.containsSecrets === false && manifest.reproducibleArchive === true
      && manifest.sessionIndependentExecutionRequired === true
      && JSON.stringify(manifest.services) === JSON.stringify(["web", "candidate-shadow-worker"])
      && JSON.stringify(manifest.files) === JSON.stringify(TRANSPORT_FILES),
  "transport_manifest_boundary_invalid");
  for (const key of ["sourceCommit", "sourceTree", "sourceParentCommit"]) {
    assertHash(manifest[key], `transport_${key}_invalid`, 40);
  }
  for (const key of [
    "sourceDiffSha256", "sourcePathSetSha256", "gateEvidenceSha256", "policySha256",
    "contractSha256", "runnerArtifactSha256", "transportArtifactSha256",
  ]) assertHash(manifest[key], `transport_${key}_invalid`);
  const transport = await artifact(root, TRANSPORT_FILES);
  ensure(transport.sha256 === manifest.transportArtifactSha256, "transport_artifact_mismatch");
  for (const file of TRANSPORT_FILES) {
    ensure(transport.checksums[file] === manifest.fileSha256?.[file], `transport_file_mismatch:${file}`);
  }
  const contract = await validateProductionPacketContract(root);
  ensure(contract.status === "PASS_LOCAL_CYCLE_CONTINUATION_PRODUCTION_PACKET"
      && contract.contractSha256 === manifest.contractSha256
      && contract.runnerArtifactSha256 === manifest.runnerArtifactSha256,
  "transport_contract_mismatch");
  return contract;
}

async function currentSourceIdentity(root) {
  const git = async (args) => (await execFileAsync("git", ["-C", root, ...args])).stdout.trim();
  const sourceCommit = await git(["rev-parse", "HEAD"]);
  const sourceTree = await git(["rev-parse", "HEAD^{tree}"]);
  const parents = (await git(["rev-list", "--parents", "-n", "1", "HEAD"])).split(" ").slice(1);
  ensure(parents.length === 1, "source_parent_count_invalid");
  const diff = `${await git(["diff-tree", "--no-commit-id", "--name-status", "-r", "HEAD"])}\n`;
  const paths = `${(await git(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]))
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
  ensure(contract.status === "PASS_LOCAL_CYCLE_CONTINUATION_PRODUCTION_PACKET",
    "contract_not_pass");
  if (approvalEligible) ensure(sourceIdentity?.sourceCommit, "source_identity_missing");
  const temporaryRoot = await mkdtemp(join(tmpdir(), "candidate-cycle-continuation-bundle-"));
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
      schemaVersion: "wp-g0.2-validation-cycle-continuation-transport.v2",
      packageId: PACKAGE_ID,
      sourceCommit: sourceIdentity?.sourceCommit ?? null,
      sourceTree: sourceIdentity?.sourceTree ?? null,
      sourceParentCommit: sourceIdentity?.sourceParentCommit ?? null,
      sourceDiffSha256: sourceIdentity?.sourceDiffSha256 ?? null,
      sourcePathSetSha256: sourceIdentity?.sourcePathSetSha256 ?? null,
      gateEvidenceSha256: sourceIdentity?.gateEvidenceSha256 ?? null,
      policySha256: sourceIdentity?.policySha256 ?? null,
      approvalEligible,
      contractSha256: contract.contractSha256,
      runnerArtifactSha256: contract.runnerArtifactSha256,
      transportArtifactSha256: transport.sha256,
      transportBundleSha256: "bound_after_archive_creation",
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
    await mkdir(dirname(resolve(output)), { recursive: true });
    await writeFile(resolve(output), bytes, { mode: 0o600 });
    return {
      status: approvalEligible
        ? "PASS_FINAL_CYCLE_CONTINUATION_TRANSPORT_BUNDLE"
        : "PASS_LOCAL_CYCLE_CONTINUATION_TRANSPORT_TEMPLATE",
      output: resolve(output),
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
    ensure(rest[index]?.startsWith("--") && rest[index + 1] !== undefined, "argument_invalid");
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
    const manifest = JSON.parse(await readFile(resolve(options.manifest), "utf8"));
    const request = JSON.parse(await readFile(resolve(options.request), "utf8"));
    const contract = JSON.parse(await readFile(resolve(root, CONTRACT_PATH), "utf8"));
    await verifyStagedTransport(root, manifest);
    await validateProductionExecutionRequest(
      request, manifest, contract, options["bundle-sha256"],
    );
    process.stdout.write('{"status":"pass","requestValid":true,"freshActivationRequired":true,"secretsPrinted":false}\n');
    return;
  }
  if (command === "prepare-admin-url") {
    process.stdout.write(`${JSON.stringify(await prepareAdminUrl(await standardInput(), options.output))}\n`);
    return;
  }
  if (command === "request") {
    const [manifest, runtime, authorization, contract] = await Promise.all([
      readFile(resolve(options.manifest), "utf8").then(JSON.parse),
      readFile(resolve(options.runtime), "utf8").then(JSON.parse),
      readFile(resolve(options.authorization), "utf8").then(JSON.parse),
      readFile(resolve(root, CONTRACT_PATH), "utf8").then(JSON.parse),
    ]);
    await verifyStagedTransport(root, manifest);
    const request = createProductionExecutionRequest({
      manifest,
      contract,
      bundleSha256: options["bundle-sha256"],
      runtime,
      authorization,
      now: new Date(authorization.issuedAt),
      nonce: authorization.nonce,
    });
    await validateProductionExecutionRequest(
      request, manifest, contract, options["bundle-sha256"],
      { now: new Date(authorization.issuedAt), verifyEvidence: options["skip-evidence"] !== "true" },
    );
    await writeFile(resolve(options.output), `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write('{"status":"pass","requestGenerated":true,"secretsPrinted":false}\n');
    return;
  }
  const clean = (await execFileAsync("git", ["-C", root, "status", "--porcelain"])).stdout.trim() === "";
  const sourceIdentity = clean ? await currentSourceIdentity(root) : null;
  const output = options.output ?? join(root,
    "reports/wp-g0-2-validation-cycle-continuation-production-packet",
    `candidate-cycle-continuation-${sourceIdentity?.sourceCommit.slice(0, 12) ?? "precommit-template"}.tar.gz`);
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
