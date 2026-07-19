#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CONTRACT_PATH = "docs/governance/wp-g0-2-legacy-pending-drain-remediation-local-superpackage.v2.json";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function runnerArtifactSha256(root, files) {
  const lines = [];
  for (const path of [...files].sort()) {
    lines.push(`${path}\t${sha256(await readFile(resolve(root, path)))}`);
  }
  return sha256(`${lines.join("\n")}\n`);
}

export async function validateLegacyPendingDrainContract(root) {
  const contract = JSON.parse(await readFile(resolve(root, CONTRACT_PATH), "utf8"));
  const violations = [];
  const require = (condition, reason) => {
    if (!condition) violations.push(reason);
  };

  require(contract.schemaVersion
    === "wp-g0.2-legacy-pending-drain-remediation-local-superpackage.v2", "schema_version");
  require(contract.packageId
    === "WP-G0.2-LEGACY-PENDING-DRAIN-REMEDIATION-LOCAL-SUPERPACKAGE", "package_id");
  require(contract.gate === "G0" && contract.actionClass === "feature_phase_activation",
    "gate_action_class");
  require(contract.productionAuthorization === false && contract.productionConnected === false
    && contract.productionExecuted === false, "production_boundary");
  require(contract.formalBacktestAllowed === false, "formal_backtest_boundary");

  const live = contract.liveReadOnlyFact ?? {};
  require(live.migrationCount === 10 && live.migrationId === "candidate-episode-v1-cycle-6"
    && live.releaseId === "candidate-shadow-cycle-6-72ee2893",
    "live_migration_truth");
  require(live.phase === "legacy" && live.epoch === 2 && live.writeFrozen === true,
    "live_control_truth");
  require(live.candidateWorkerAbsent === true, "live_worker_truth");
  require(live.episodes === 600 && live.events === 5_218 && live.outbox === 10_484
    && live.completed === 5_218 && live.pending === 5_266,
    "live_outbox_truth");
  require(live.claimed === 0 && live.retryWait === 0 && live.quarantined === 0
    && live.resolutions === 0 && live.unresolved === 5_266, "live_unresolved_truth");
  require(live.legacyCompleted === 5_218 && live.legacyPending === 48
    && live.legacyUnresolved === 48 && live.candidateEventPending === 5_218
    && live.candidateEventNonPending === 0 && live.candidateEventUnresolved === 5_218
    && live.candidateEventOrphans === 0 && live.candidateEventContractMismatches === 0
    && live.otherUnresolved === 0, "live_source_lane_truth");
  require(live.secretPrinted === false && live.productionMutation === false,
    "live_readonly_truth");

  const entry = contract.entryBoundary ?? {};
  require(entry.controlRowsExact === 1,
    "entry_schema_boundary");
  require(entry.sourcePhase === "legacy" && entry.sourceWriteFrozen === true
    && entry.sourceEpochExact === 2 && entry.drainEpochExact === 3
    && entry.finalEpochExact === 4 && entry.sameMigrationAndReleaseRequired === true,
  "entry_control_boundary");
  require(entry.deadlineResetAllowed === false
    && entry.minimumDeadlineRemainingSeconds >= 1800, "entry_deadline_boundary");
  require(entry.legacyPendingExact === 48 && entry.candidateEventPendingExact === 5_218
    && entry.candidateEventNonPendingExact === 0 && entry.candidateEventOrphansExact === 0
    && entry.candidateEventContractMismatchesExact === 0
    && entry.claimedExact === 0 && entry.retryWaitExact === 0
    && entry.quarantinedExact === 0 && entry.resolutionsExact === 0,
  "entry_pending_only_boundary");

  const source = contract.sourceWriteFence ?? {};
  require(source.scannerMustBePausedBeforeDrainEpoch === true
    && source.scanLockMustBeUnheld === true, "source_fence_precondition");
  require(source.webSourceCallsAllowed === false && source.candidateSourceWriterAllowed === false
    && source.legacyRowsAddedAllowed === false
    && source.candidateEventMirrorGrowthMustEqualDrainedLegacy === true
    && source.outboxGrowthMustEqualDrainedLegacy === true, "source_fence_boundary");

  const drain = contract.drainLifecycle ?? {};
  require(drain.openTransition === "legacy_epoch_2_to_shadow_capture_epoch_3"
    && drain.closeTransition === "shadow_capture_epoch_3_to_legacy_frozen_epoch_4",
  "drain_transition_boundary");
  require(drain.migrationIdChanged === false && drain.releaseIdChanged === false
    && drain.candidateConsumerOnly === true && drain.candidateSourceWriterAllowed === false,
  "drain_identity_boundary");
  require(drain.quarantineAllowed === false && drain.resolutionAllowed === false
    && drain.retryWaitAtExitAllowed === false && drain.claimedAtExitAllowed === false,
  "drain_failure_boundary");

  const data = contract.dataBoundary ?? {};
  require(data.candidateBusinessDataDeleteAllowed === false && data.outboxDeleteAllowed === false
    && data.outboxSourceIdentityMutationAllowed === false
    && data.outboxPayloadMutationAllowed === false
    && data.existingCompletedMutationAllowed === false, "data_immutability_boundary");
  require(data.legacyPendingToCompletedAllowed === true
    && data.eventsIncreaseMustEqualDrainedLegacy === true
    && data.candidateEventPendingIncreaseMustEqualDrainedLegacy === true
    && data.outboxIncreaseMustEqualDrainedLegacy === true
    && data.episodesMayOnlyIncreaseWithinDrainedLegacy === true, "data_projection_boundary");
  require(data.checkpointCountMustRemain === true && data.outcomeCountMustRemain === true
    && data.controlStartedAtMustRemain === true
    && data.controlDeadlineAtMustRemain === true, "data_preservation_boundary");

  const rollback = contract.rollbackBoundary ?? {};
  require(rollback.automaticRollbackRequired === true && rollback.targetPhase === "legacy"
    && rollback.targetWriteFrozen === true && rollback.candidateWorkerAbsent === true
    && rollback.candidateFlagsDisabled === true && rollback.scannerRestored === true,
  "rollback_target_boundary");
  require(rollback.candidateDataPreserved === true && rollback.quarantineIsNotSuccess === true
    && rollback.partialDrainIsNotSuccess === true, "rollback_truth_boundary");

  const exit = contract.exitBoundary ?? {};
  require(exit.legacyDrainedExact === 48 && exit.legacyCompletedExact === 5_266
    && exit.legacyPendingExact === 0 && exit.legacyUnresolvedExact === 0
    && exit.candidateEventPendingExact === 5_266 && exit.candidateEventNonPendingExact === 0
    && exit.candidateEventOrphansExact === 0 && exit.candidateEventContractMismatchesExact === 0
    && exit.outboxExact === 10_532 && exit.globalCompletedExact === 5_266
    && exit.globalPendingExact === 5_266 && exit.globalUnresolvedExact === 5_266
    && exit.claimedExact === 0 && exit.retryWaitExact === 0 && exit.quarantinedExact === 0
    && exit.resolutionsExact === 0, "exit_data_boundary");
  require(exit.finalPhase === "legacy" && exit.finalWriteFrozen === true
    && exit.finalEpochExact === 4 && exit.candidateWorkerAbsent === true,
  "exit_control_boundary");
  require(exit.scannerHealthyRequired === true && exit.scanFreshRequired === true
    && exit.postgresReadyRequired === true && exit.redisHealthyRequired === true
    && exit.nonTargetContainersUnchanged === true && exit.nextCycleAutoAuthorized === false,
  "exit_infrastructure_boundary");

  const artifact = contract.runnerArtifact ?? {};
  require(Array.isArray(artifact.files) && artifact.files.length === artifact.fileCount,
    "runner_artifact_files");
  if (Array.isArray(artifact.files) && artifact.files.length > 0) {
    const actual = await runnerArtifactSha256(root, artifact.files);
    require(artifact.sha256 === actual, "runner_artifact_checksum");
  }

  const truth = contract.truthBoundary ?? {};
  require(truth.localPassIsProductionPass === false && truth.drainPassIsCycleContinuationPass === false
    && truth.drainPassIsLineagePass === false && truth.drainPassIsCanonicalCutover === false
    && truth.g0Complete === false, "truth_boundary");
  require(truth.currentProductionRequiresLegacyDrain === true
    && truth.candidateEventPendingMeansCorruption === false
    && truth.cycle6FailureRelabeledPass === false && truth.cycle6SamplesReusable === false,
  "source_lane_supersession_truth");
  require(truth.systemStatus === "R1 / 可运行但不完整 / 不能支撑实战",
    "system_truth_boundary");

  return {
    status: violations.length === 0 ? "pass" : "fail",
    violations,
    packageId: contract.packageId,
    productionConnected: false,
    productionExecuted: false,
    g0Completed: false,
  };
}

async function main() {
  const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const result = await validateLegacyPendingDrainContract(root);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "pass") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
