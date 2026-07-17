#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CONTRACT_PATH = "docs/governance/wp-g0-2-legacy-pending-drain-remediation-local-superpackage.v1.json";

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
    === "wp-g0.2-legacy-pending-drain-remediation-local-superpackage.v1", "schema_version");
  require(contract.packageId
    === "WP-G0.2-LEGACY-PENDING-DRAIN-REMEDIATION-LOCAL-SUPERPACKAGE", "package_id");
  require(contract.gate === "G0" && contract.actionClass === "feature_phase_activation",
    "gate_action_class");
  require(contract.productionAuthorization === false && contract.productionConnected === false
    && contract.productionExecuted === false, "production_boundary");
  require(contract.formalBacktestAllowed === false, "formal_backtest_boundary");

  const live = contract.liveReadOnlyFact ?? {};
  require(live.migrationCount === 10 && live.migrationId === "candidate-episode-v1",
    "live_migration_truth");
  require(live.phase === "legacy" && live.epoch === 4 && live.writeFrozen === true,
    "live_control_truth");
  require(live.candidateWorkerAbsent === true, "live_worker_truth");
  require(live.outbox === 5914 && live.completed === 2957 && live.pending === 2957,
    "live_outbox_truth");
  require(live.claimed === 0 && live.retryWait === 0 && live.quarantined === 0
    && live.resolutions === 0 && live.unresolved === 2957, "live_unresolved_truth");
  require(live.legacyCompleted === 2957 && live.legacyPending === 0
    && live.legacyUnresolved === 0 && live.candidateEventPending === 2957
    && live.candidateEventUnresolved === 2957, "live_source_lane_truth");
  require(live.secretPrinted === false && live.productionMutation === false,
    "live_readonly_truth");

  const entry = contract.entryBoundary ?? {};
  require(entry.migrationCountExact === 10 && entry.controlRowsExact === 1,
    "entry_schema_boundary");
  require(entry.sourcePhase === "legacy" && entry.sourceWriteFrozen === true
    && entry.sourceEpochParity === "positive_even", "entry_control_boundary");
  require(entry.deadlineResetAllowed === false
    && entry.minimumDeadlineRemainingSeconds >= 1800, "entry_deadline_boundary");
  require(entry.pendingMinimum === 1 && entry.claimedExact === 0 && entry.retryWaitExact === 0
    && entry.quarantinedExact === 0 && entry.resolutionsExact === 0
    && entry.unresolvedMustEqualPending === true, "entry_pending_only_boundary");
  require(entry.legacyPendingMinimum === 1 && entry.candidateEventUnresolvedExact === 0
    && entry.currentProductionMatchesEntry === false, "entry_source_lane_boundary");

  const source = contract.sourceWriteFence ?? {};
  require(source.scannerMustBePausedBeforeDrainEpoch === true
    && source.publicAndReadRoutesNoRefreshRequired === true
    && source.scanLockMustBeUnheld === true, "source_fence_precondition");
  require(source.webSourceCallsAllowed === false && source.newOutboxRowsAllowed === false
    && source.outboxTotalMustRemainExact === true, "source_fence_boundary");

  const drain = contract.drainLifecycle ?? {};
  require(drain.openTransition === "legacy_epoch_even_to_shadow_capture_epoch_plus_1"
    && drain.closeTransition === "shadow_capture_epoch_odd_to_legacy_frozen_epoch_plus_1",
  "drain_transition_boundary");
  require(drain.migrationIdChanged === false && drain.releaseIdChanged === false
    && drain.candidateConsumerOnly === true && drain.candidateSourceWriterAllowed === false,
  "drain_identity_boundary");
  require(drain.quarantineAllowed === false && drain.resolutionAllowed === false
    && drain.retryWaitAtExitAllowed === false && drain.claimedAtExitAllowed === false,
  "drain_failure_boundary");

  const data = contract.dataBoundary ?? {};
  require(data.candidateBusinessDataDeleteAllowed === false
    && data.outboxSourceIdentityMutationAllowed === false
    && data.outboxPayloadMutationAllowed === false
    && data.existingCompletedMutationAllowed === false, "data_immutability_boundary");
  require(data.pendingToCompletedAllowed === true
    && data.eventsIncreaseMustEqualDrainedPending === true
    && data.episodesMayOnlyIncreaseWithinDrainedPending === true, "data_projection_boundary");
  require(data.checkpointCountMustRemain === true && data.outcomeCountMustRemain === true
    && data.outboxTotalMustRemain === true && data.controlStartedAtMustRemain === true
    && data.controlDeadlineAtMustRemain === true, "data_preservation_boundary");

  const rollback = contract.rollbackBoundary ?? {};
  require(rollback.automaticRollbackRequired === true && rollback.targetPhase === "legacy"
    && rollback.targetWriteFrozen === true && rollback.candidateWorkerAbsent === true
    && rollback.candidateFlagsDisabled === true && rollback.scannerRestored === true,
  "rollback_target_boundary");
  require(rollback.candidateDataPreserved === true && rollback.quarantineIsNotSuccess === true
    && rollback.partialDrainIsNotSuccess === true, "rollback_truth_boundary");

  const exit = contract.exitBoundary ?? {};
  require(exit.completedMustEqualOutboxTotal === true && exit.pendingExact === 0
    && exit.claimedExact === 0 && exit.retryWaitExact === 0 && exit.quarantinedExact === 0
    && exit.resolutionsExact === 0 && exit.unresolvedExact === 0, "exit_data_boundary");
  require(exit.finalPhase === "legacy" && exit.finalWriteFrozen === true
    && exit.finalEpochIncrement === 2 && exit.candidateWorkerAbsent === true,
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
  require(truth.currentProductionRequiresLegacyDrain === false
    && truth.packetSupersededBySourceLaneClassification === true,
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
