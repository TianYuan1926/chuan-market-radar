import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(
  ROOT,
  "docs/governance/wp-g0-2-cycle-3-unified-reconciliation-refresh-local-superpackage.v2.json",
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
  if (contract.schemaVersion !== "wp-g0.2-cycle-3-unified-reconciliation-refresh-local-superpackage.v2"
      || contract.packageId !== "WP-G0.2-CYCLE-3-UNIFIED-RECONCILIATION-REFRESH-LOCAL-SUPERPACKAGE") {
    violations.push("contract_identity");
  }
  if (contract.productionAuthorization !== false || contract.productionExecuted !== false) violations.push("production_state_claim");
  if (runnerArtifact.fileCount !== 1 || runnerArtifact.fileCount !== contract.runnerArtifact?.fileCount
      || runnerArtifact.sha256 !== contract.runnerArtifact?.sha256) violations.push("runner_artifact");
  if (contract.lineageBoundary?.schemaVersion !== "candidate-multi-cycle-lineage-evidence.v2"
      || contract.lineageBoundary?.status !== "PASS_CYCLE3_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH"
      || contract.lineageBoundary?.migrationId !== "candidate-episode-v1-cycle-3"
      || contract.lineageBoundary?.sourceReleaseWindowsExact !== 3
      || contract.lineageBoundary?.minimumActivationSamples !== 289
      || contract.lineageBoundary?.minimumActivationHours !== 24
      || contract.lineageBoundary?.maximumSampleGapSeconds !== 600
      || contract.lineageBoundary?.minimumCompletedWrites !== 10000
      || contract.lineageBoundary?.minimumCompletionAdvances !== 2
      || contract.lineageBoundary?.unresolvedMaximum !== 0
      || contract.lineageBoundary?.privateRegularSingleLinkFileRequired !== true
      || contract.lineageBoundary?.fileSha256BindingRequired !== true
      || contract.lineageBoundary?.semanticProvenanceHashesRequired !== 3
      || contract.lineageBoundary?.historicalActivationFilesAllowed !== false
      || contract.lineageBoundary?.lineageV1Allowed !== false) violations.push("lineage_boundary");
  if (contract.comparison?.minimumComparedWrites !== 10000
      || contract.comparison?.comparisonDifferencesMaximum !== 0
      || contract.comparison?.duplicateMappingsMaximum !== 0
      || contract.comparison?.pendingMaximum !== 0
      || contract.comparison?.claimedMaximum !== 0
      || contract.comparison?.retryWaitMaximum !== 0
      || contract.comparison?.unresolvedQuarantineMaximum !== 0
      || contract.comparison?.unresolvedTotalMaximum !== 0
      || contract.comparison?.outsideLineageMaximum !== 0
      || contract.comparison?.resolvedQuarantineCountsAsComparedWrite !== false
      || contract.comparison?.eachRowReleaseWindowBound !== true
      || contract.comparison?.completeLineageRequired !== true
      || contract.comparison?.controlLineageExactMatchRequired !== true
      || contract.comparison?.fullProjectionCommandHashRequired !== true) violations.push("comparison_thresholds");
  if (contract.databaseBoundary?.transactionIsolation !== "repeatable_read"
      || contract.databaseBoundary?.transactionReadOnly !== true
      || contract.databaseBoundary?.forcedLocalRole !== "candidate_audit_role"
      || contract.databaseBoundary?.controlLineageExactCount !== 3
      || contract.databaseBoundary?.historicalControls !== "legacy_frozen_even_epoch"
      || contract.databaseBoundary?.currentControl !== "cycle3_single_shadow_capture_active_odd_epoch"
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
      || contract.resultBoundary?.reviewReadEnabled !== false
      || contract.resultBoundary?.g0Completed !== false
      || contract.resultBoundary?.schemaVersion !== "candidate-cycle3-reconciliation-evidence.v2"
      || contract.resultBoundary?.passStatus !== "PASS_CYCLE3_UNIFIED_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL") {
    violations.push("result_boundary");
  }
  if (contract.localRehearsal?.postgresMajor !== 16
      || contract.localRehearsal?.minimumComparedWritesExercised !== 10020
      || contract.localRehearsal?.releaseWindowsExercised !== 3
      || JSON.stringify(contract.localRehearsal?.releaseCounts) !== "[2957,0,7063]"
      || contract.localRehearsal?.transactionReadOnlyRejectionRequired !== true
      || contract.localRehearsal?.phaseMustRemain !== "shadow_capture"
      || contract.localRehearsal?.productionConnected !== false) violations.push("local_rehearsal");
  for (const token of [
    "MINIMUM_COMPARED_WRITES = 10_000",
    "candidate-cycle3-reconciliation-evidence.v2",
    "PASS_CYCLE3_UNIFIED_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL",
    "validateCandidateLineageEvidence",
    "CANDIDATE_RECONCILIATION_LINEAGE_EVIDENCE_FILE",
    "lineage_evidence_checksum_mismatch",
    "lineage_request_windows_mismatch",
    "requiredValidationCycles: 3",
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    "SET LOCAL ROLE candidate_audit_role",
    "transaction_read_only",
    "projection_command_hash_mismatch",
    "futureOutcomeInputsUsed: false",
    "productionRankingInputsUsed: false",
    "automaticPhaseAdvance: false",
    "phaseTransitionExecuted: false",
    "shadowVerifyTransitionExecuted: false",
    "g0Completed: false",
    "authority_epoch_not_active_odd",
    "source_release_window_not_adjacent",
    "source_release_not_in_lineage",
    "source_release_outside_lineage_present",
    "database_control_lineage_count_mismatch",
    "sourceReleaseWindows",
  ]) if (!runner.includes(token)) violations.push(`runner_guard_missing:${token}`);
  for (const forbiddenToken of [
    "PASS_ACTIVATE_AND_OBSERVE",
    "candidate-multi-cycle-lineage-evidence.v1",
    "CANDIDATE_ACTIVATION_EVIDENCE_FILE",
    "activationEvidenceSha256",
    "minimumCleanWindowHours",
  ]) if (runner.includes(forbiddenToken)) violations.push(`obsolete_runner_token:${forbiddenToken}`);
  if (/request\.migrationId\s*[!=]==?\s*MIGRATION_FAMILY/u.test(runner)) {
    violations.push("hardcoded_single_cycle_migration_guard_present");
  }
  if (/transition_migration_control_v1|start_shadow_capture_v3|UPDATE\s+candidate_authority|INSERT\s+INTO\s+candidate_authority|DELETE\s+FROM\s+candidate_authority/i.test(runner)) {
    violations.push("mutation_statement_present");
  }
  for (const forbidden of [
    "production_connection_in_local_preparation", "historical_activation_evidence_input",
    "lineage_v1_input", "lineage_relabeling", "production_mutation", "schema_migration",
    "automatic_phase_advance", "canonical_cutover", "review_cutover",
    "production_ranking_change", "future_outcome_input", "formal_backtest",
  ]) if (!contract.forbidden?.includes(forbidden)) violations.push(`forbidden_missing:${forbidden}`);
  if (contract.nextProductionPackage !== "WP-G0.2-CYCLE-3-UNIFIED-RECONCILIATION-PRODUCTION-PACKET") {
    violations.push("production_sequence");
  }
  return {
    status: violations.length === 0
      ? "PASS_CYCLE3_UNIFIED_RECONCILIATION_REFRESH_LOCAL_PREPARATION"
      : "FAIL",
    nextProductionPackage: contract.nextProductionPackage,
    productionMutationAllowed: false,
    automaticPhaseAdvance: false,
    shadowVerifyTransitionExecuted: false,
    g0Completed: false,
    minimumComparedWrites: contract.comparison?.minimumComparedWrites,
    releaseWindowsRequired: contract.lineageBoundary?.sourceReleaseWindowsExact,
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
