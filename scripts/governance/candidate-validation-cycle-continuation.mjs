import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(ROOT,
  "docs/governance/wp-g0-2-validation-cycle-continuation-local-superpackage.v4.json");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function artifact(files) {
  const checksums = {};
  for (const file of [...files].sort()) {
    checksums[file] = sha256(await readFile(resolve(ROOT, file)));
  }
  return {
    fileCount: Object.keys(checksums).length,
    sha256: sha256(JSON.stringify(checksums)),
  };
}

export async function loadCandidateValidationCycleContinuationContract() {
  return JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
}

export async function validateCandidateValidationCycleContinuation(contract) {
  contract ??= await loadCandidateValidationCycleContinuationContract();
  const violations = [];
  const implementation = await artifact(contract.implementationArtifact?.files ?? []);
  const [identity, composition, runtime, trusted, runner, compose] = await Promise.all([
    readFile(resolve(ROOT, "src/lib/candidate-episode/candidate-validation-cycle.ts"), "utf8"),
    readFile(resolve(ROOT, "src/lib/candidate-episode/shadow-capture-composition.ts"), "utf8"),
    readFile(resolve(ROOT, "src/lib/candidate-episode/shadow-capture-runtime.ts"), "utf8"),
    readFile(resolve(ROOT, "src/lib/candidate-episode/canonical-read-trusted-context.ts"), "utf8"),
    readFile(resolve(ROOT, "scripts/production/candidate-cycle-continuation/runner.mjs"), "utf8"),
    readFile(resolve(ROOT, "docker-compose.yml"), "utf8"),
  ]);

  if (contract.schemaVersion !== "wp-g0.2-validation-cycle-continuation-local-superpackage.v4"
      || contract.packageId !== "WP-G0.2-VALIDATION-CYCLE-CONTINUATION-LOCAL-SUPERPACKAGE") {
    violations.push("contract_identity");
  }
  if (contract.productionAuthorization !== false
      || contract.productionConnected !== false
      || contract.productionExecuted !== false) violations.push("production_truth");
  const problem = contract.problemProof ?? {};
  if (problem.singleCycleMaximumHours !== 72
      || problem.deadlineResetAllowed !== false
      || problem.minimumComparedWrites !== 10_000
      || problem.activationObservationMinimumHours !== 24
      || problem.dualReadObservationMinimumHours !== 24
      || problem.canonicalCompatObservationMinimumHours !== 24
      || problem.readObservationWindowsSeparate !== true
      || problem.currentProductionPhase !== "legacy"
      || problem.currentProductionWriteFrozen !== true
      || problem.currentProductionCycle !== "candidate-episode-v1-cycle-5"
      || problem.currentProductionAuthorityEpoch !== 2
      || problem.currentProductionActiveCycles !== 0
      || problem.currentProductionCandidateWorker !== "absent"
      || problem.candidateEpisodes !== 596
      || problem.candidateEvents !== 4_602
      || problem.candidateOutbox !== 9_204
      || problem.legacySourceCompleted !== 4_602
      || problem.legacySourceUnresolved !== 0
      || problem.candidateEventPending !== 4_602
      || problem.candidateEventNonPending !== 0
      || problem.candidateEventOrphans !== 0
      || problem.candidateEventContractMismatches !== 0
      || problem.priorActivationOutcome
        !== "ROLLBACK_PASS_SAMPLE_MONITOR_COMPLETED_MISMATCH"
      || problem.priorActivationSamplesObserved !== 57
      || problem.priorActivationAcceptedSamples !== 56
      || problem.priorActivationRejectedSample !== 57
      || problem.priorActivationCompletedWrites !== 4_602
      || problem.priorActivationLastAcceptedCompletedWrites !== 4_556
      || problem.priorActivationFailure
        !== "sample_monitor_completed_mismatch_due_to_sequential_snapshot_race"
      || problem.priorActivationLastSampleCriticalSubsystemsHealthy !== true
      || problem.priorActivationSamplesReusable !== false
      || problem.priorActivationCoverageLessThan24Hours !== true
      || problem.freshActivationMustBeCollectedInNextAdjacentCycle !== true
      || problem.currentSingleCycleCanProveAllExitGates !== false) {
    violations.push("problem_proof");
  }
  const boundary = contract.continuationBoundary ?? {};
  for (const [key, expected] of Object.entries({
    cycleNumbersStrictlyAdjacent: true,
    oldCycleTransitionsToLegacy: true,
    oldCycleWriteFrozen: true,
    oldStartedAtImmutable: true,
    oldDeadlineImmutable: true,
    newCycleMaximumHours: 72,
    singleActiveCycleRequired: true,
    legacySourceUnresolvedMaximum: 0,
    candidateEventLanePreserved: true,
    candidateBusinessDataPreserved: true,
    sameSerializableTransactionRequired: true,
    tableLockRequired: true,
    failureRollsBackEntireContinuation: true,
    legacyRemainsAuthoritative: true,
    retiredLatestCycleCanStartAdjacent: true,
    retiredCycleNeverReactivated: true,
    missingDisabledEnvironmentBindsToCurrentFrozenCycle: true,
    thresholdChanged: false,
    observationWindowShortened: false,
    transientPendingAndClaimedAllowedBelowWarningAge: true,
    transientUnresolvedArithmeticExact: true,
    oldestUnresolvedAgeExclusiveMaximumSeconds: 300,
    retryWaitMaximum: 0,
    unresolvedQuarantineMaximum: 0,
    agingSampleAccepted: false,
    boundedHealthFreshnessRecheck: true,
    healthRecheckMaximumSeconds: 180,
    healthRecheckIntervalSeconds: 15,
    criticalHealthMustRemainHealthy: true,
    candidateWriteDuringHealthRecheck: false,
    recheckAttemptCountsAsObservationSample: false,
    observationSampleSchema: "candidate-validation-cycle-observation-sample.v3",
    databaseSnapshotBracketRequired: true,
    databaseSnapshotMaximumBracketSeconds: 60,
    monitorCompletedWithinDatabaseBracketInclusive: true,
    legacyUnbracketedSamplesAccepted: false,
  })) if (boundary[key] !== expected) violations.push(`continuation_boundary:${key}`);
  if (JSON.stringify(boundary.databaseSnapshotOrder) !== JSON.stringify([
    "strict_fresh_health", "database_before", "candidate_monitor", "database_after",
    "isolated_validation",
  ])) violations.push("continuation_boundary:databaseSnapshotOrder");
  if (implementation.fileCount !== 22
      || implementation.fileCount !== contract.implementationArtifact?.fileCount
      || implementation.sha256 !== contract.implementationArtifact?.sha256) {
    violations.push("implementation_artifact");
  }

  for (const token of [
    "CANDIDATE_RUNTIME_MIGRATION_ID", "CANDIDATE_MIGRATION_FAMILY}-cycle-${cycleNumber}",
    "configured === undefined", "candidate_validation_cycle_id_invalid",
  ]) if (!identity.includes(token)) violations.push(`identity_guard_missing:${token}`);
  for (const token of [
    "resolveCandidateValidationCycleId(this.env)", "migrationId: runtime.migrationId",
  ]) if (!composition.includes(token)) violations.push(`composition_guard_missing:${token}`);
  for (const token of ["shadow_capture", "shadow_verify", "canonical_compat"]) {
    if (!runtime.includes(token)) violations.push(`runtime_phase_missing:${token}`);
  }
  for (const token of [
    "resolveCandidateValidationCycleId(env)", "parseCandidateValidationCycleId(value.migrationId)",
  ]) if (!trusted.includes(token)) violations.push(`trusted_guard_missing:${token}`);
  for (const token of [
    "BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ WRITE",
    "LOCK TABLE candidate_authority.candidate_migration_control IN SHARE ROW EXCLUSIVE MODE",
    "unresolved_outbox_blocks_cycle_continuation", "retired_cycle_deadline_mutated",
    "candidate_data_changed_during_cycle_continuation", "thresholdChanged: false",
    "start_adjacent_from_retired", "current_cycle_not_retired_legacy",
    "source_type='legacy_scan_candidate'", "source_type='candidate_episode_event'",
    'applicationRoot = "/app"', 'requireCandidate("pg")',
  ]) if (!runner.includes(token)) violations.push(`runner_guard_missing:${token}`);
  if (!compose.includes("CANDIDATE_RUNTIME_MIGRATION_ID: ${CANDIDATE_RUNTIME_MIGRATION_ID:-candidate-episode-v1}")) {
    violations.push("compose_cycle_identity_missing");
  }
  for (const forbidden of [
    "deadline_reset", "deadline_extension", "minimum_compared_writes_reduction",
    "observation_window_shortening", "candidate_business_data_delete",
    "candidate_history_delete", "parallel_active_cycle", "unresolved_outbox_continuation",
    "public_request_cycle_control", "migration_execute", "production_connection",
    "production_deployment", "redis_change", "scan_change", "analysis_change",
    "strategy_change", "rr_change", "trade_plan_change",
    "future_outcome_production_input", "formal_backtest",
  ]) if (!contract.forbidden?.includes(forbidden)) violations.push(`forbidden_missing:${forbidden}`);

  return {
    status: violations.length === 0
      ? "PASS_LOCAL_VALIDATION_CYCLE_CONTINUATION"
      : "FAIL",
    productionMutationAllowed: false,
    oldDeadlineResetAllowed: false,
    minimumComparedWrites: 10_000,
    observationHoursPerWindow: 24,
    implementationArtifactSha256: implementation.sha256,
    violations,
  };
}

async function main() {
  const result = await validateCandidateValidationCycleContinuation();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.status.startsWith("PASS_")) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
