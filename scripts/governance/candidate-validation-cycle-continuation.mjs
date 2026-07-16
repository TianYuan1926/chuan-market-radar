import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(ROOT,
  "docs/governance/wp-g0-2-validation-cycle-continuation-local-superpackage.v1.json");

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

  if (contract.schemaVersion !== "wp-g0.2-validation-cycle-continuation-local-superpackage.v1"
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
    unresolvedOutboxMaximum: 0,
    candidateBusinessDataPreserved: true,
    sameSerializableTransactionRequired: true,
    tableLockRequired: true,
    failureRollsBackEntireContinuation: true,
    legacyRemainsAuthoritative: true,
    retiredLatestCycleCanStartAdjacent: true,
    retiredCycleNeverReactivated: true,
    thresholdChanged: false,
    observationWindowShortened: false,
  })) if (boundary[key] !== expected) violations.push(`continuation_boundary:${key}`);
  if (implementation.fileCount !== 12
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
