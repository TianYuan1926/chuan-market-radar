import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(
  ROOT,
  "docs/governance/wp-g0-2-shadow-verify-reconciliation-preparation.v1.json",
);

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

export async function loadCandidateReconciliationContract() {
  return JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
}

export async function validateCandidateReconciliationPreparation(contract) {
  contract ??= await loadCandidateReconciliationContract();
  const violations = [];
  const runnerArtifact = await artifact(contract.runnerArtifact?.files ?? []);
  const runner = await readFile(
    resolve(ROOT, "scripts/production/candidate-reconciliation/runner.mjs"),
    "utf8",
  );
  if (contract.schemaVersion !== "wp-g0.2-shadow-verify-reconciliation-preparation.v1") violations.push("schema_version");
  if (contract.productionAuthorization !== false || contract.productionExecuted !== false) violations.push("production_state_claim");
  if (runnerArtifact.fileCount !== 1 || runnerArtifact.fileCount !== contract.runnerArtifact?.fileCount
      || runnerArtifact.sha256 !== contract.runnerArtifact?.sha256) violations.push("runner_artifact");
  if (contract.prerequisites?.minimumCleanWindowHours !== 24
      || contract.prerequisites?.minimumObservationSamples !== 289
      || contract.prerequisites?.authorityEpoch !== 1
      || contract.prerequisites?.newExactApprovalRequired !== true
      || contract.prerequisites?.approvalWindowMaximumMinutes !== 90) violations.push("prerequisite_thresholds");
  if (contract.comparison?.minimumComparedWrites !== 10000
      || contract.comparison?.comparisonDifferencesMaximum !== 0
      || contract.comparison?.duplicateMappingsMaximum !== 0
      || contract.comparison?.pendingMaximum !== 0
      || contract.comparison?.claimedMaximum !== 0
      || contract.comparison?.retryWaitMaximum !== 0
      || contract.comparison?.unresolvedQuarantineMaximum !== 0
      || contract.comparison?.unresolvedTotalMaximum !== 0
      || contract.comparison?.resolvedQuarantineCountsAsComparedWrite !== false
      || contract.comparison?.fullProjectionCommandHashRequired !== true) violations.push("comparison_thresholds");
  if (contract.databaseBoundary?.transactionIsolation !== "repeatable_read"
      || contract.databaseBoundary?.transactionReadOnly !== true
      || contract.databaseBoundary?.productionDmlAllowed !== false
      || contract.databaseBoundary?.schemaDdlAllowed !== false
      || contract.databaseBoundary?.migrationAllowed !== false
      || contract.databaseBoundary?.phaseTransitionAllowed !== false) violations.push("database_boundary");
  for (const [key, value] of Object.entries(contract.inputBoundary ?? {})) {
    if (value !== false) violations.push(`input_boundary:${key}`);
  }
  if (contract.resultBoundary?.automaticPhaseAdvance !== false
      || contract.resultBoundary?.shadowVerifyTransitionExecuted !== false
      || contract.resultBoundary?.canonicalReadEnabled !== false
      || contract.resultBoundary?.canonicalWriteEnabled !== false
      || contract.resultBoundary?.reviewReadEnabled !== false) violations.push("result_boundary");
  for (const token of [
    "MINIMUM_COMPARED_WRITES = 10_000",
    "MINIMUM_CLEAN_WINDOW_HOURS = 24",
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    "transaction_read_only",
    "projection_command_hash_mismatch",
    "futureOutcomeInputsUsed: false",
    "productionRankingInputsUsed: false",
    "automaticPhaseAdvance: false",
    "phaseTransitionExecuted: false",
  ]) if (!runner.includes(token)) violations.push(`runner_guard_missing:${token}`);
  if (/transition_migration_control_v1|start_shadow_capture_v3|UPDATE\s+candidate_authority|INSERT\s+INTO\s+candidate_authority|DELETE\s+FROM\s+candidate_authority/i.test(runner)) {
    violations.push("mutation_statement_present");
  }
  for (const forbidden of [
    "production_mutation", "schema_migration", "automatic_phase_advance",
    "canonical_cutover", "production_ranking_change", "future_outcome_input", "formal_backtest",
  ]) if (!contract.forbidden?.includes(forbidden)) violations.push(`forbidden_missing:${forbidden}`);
  if (contract.nextProductionPackage !== "WP-G0.2-SHADOW-CAPTURE-DORMANT-RUNTIME-DEPLOY") {
    violations.push("production_sequence");
  }
  return {
    status: violations.length === 0 ? "PASS_LOCAL_RECONCILIATION_RUNNER_PREPARATION" : "FAIL",
    productionDecision: contract.currentProductionDecision,
    productionMutationAllowed: false,
    automaticPhaseAdvance: false,
    minimumComparedWrites: contract.comparison?.minimumComparedWrites,
    runnerArtifactSha256: runnerArtifact.sha256,
    violations,
  };
}

async function main() {
  const result = await validateCandidateReconciliationPreparation();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.status.startsWith("PASS_")) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
