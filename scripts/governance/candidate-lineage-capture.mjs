#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(ROOT,
  "docs/governance/wp-g0-2-cycle-3-unified-lineage-refresh-local-superpackage.v2.json");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function artifact(files) {
  const checksums = {};
  for (const file of [...files].sort()) {
    checksums[file] = sha256(await readFile(resolve(ROOT, file)));
  }
  return { fileCount: Object.keys(checksums).length, sha256: sha256(JSON.stringify(checksums)) };
}

export async function loadCandidateLineageCaptureContract() {
  return JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
}

export async function validateCandidateLineageCapture(contract) {
  contract ??= await loadCandidateLineageCaptureContract();
  const violations = [];
  const runnerArtifact = await artifact(contract.runnerArtifact?.files ?? []);
  const runner = await readFile(resolve(ROOT,
    "scripts/production/candidate-lineage/runner.mjs"), "utf8");
  if (contract.schemaVersion
      !== "wp-g0.2-cycle-3-unified-lineage-refresh-local-superpackage.v2") {
    violations.push("schema_version");
  }
  if (contract.packageId
      !== "WP-G0.2-CYCLE-3-UNIFIED-LINEAGE-REFRESH-LOCAL-SUPERPACKAGE"
      || contract.productionAuthorization !== false || contract.productionExecuted !== false) {
    violations.push("production_truth");
  }
  if (runnerArtifact.fileCount !== 1
      || runnerArtifact.fileCount !== contract.runnerArtifact?.fileCount
      || runnerArtifact.sha256 !== contract.runnerArtifact?.sha256) {
    violations.push("runner_artifact");
  }
  if (contract.unifiedObservationBoundary?.migrationId !== "candidate-episode-v1-cycle-3"
      || contract.unifiedObservationBoundary?.status
        !== "PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE"
      || contract.unifiedObservationBoundary?.minimumActivationSamples !== 289
      || contract.unifiedObservationBoundary?.minimumActivationHours !== 24
      || contract.unifiedObservationBoundary?.minimumCompletedWrites !== 10_000
      || contract.unifiedObservationBoundary?.minimumSamples !== 7
      || contract.unifiedObservationBoundary?.minimumStabilitySeconds !== 1_800
      || contract.unifiedObservationBoundary?.minimumCompletionAdvances !== 2
      || contract.unifiedObservationBoundary?.maximumSampleGapSeconds !== 600
      || contract.unifiedObservationBoundary?.unresolvedMaximum !== 0
      || contract.unifiedObservationBoundary?.recomputeFromRawSamples !== true
      || contract.unifiedObservationBoundary?.singleEvidenceDirectory !== true) {
    violations.push("unified_observation_boundary");
  }
  if (contract.historicalTruthBoundary?.historicalActivation197SamplesIsPass !== false
      || contract.historicalTruthBoundary?.cycle2ZeroSampleAttemptIsPass !== false
      || contract.historicalTruthBoundary?.historicalControlsUsedAsPassEvidence !== false
      || contract.historicalTruthBoundary?.historicalControlsPreservedInDatabaseLineage !== true) {
    violations.push("historical_truth_boundary");
  }
  if (contract.databaseBoundary?.transactionIsolation !== "repeatable_read"
      || contract.databaseBoundary?.transactionReadOnly !== true
      || contract.databaseBoundary?.forcedLocalRole !== "candidate_audit_role"
      || contract.databaseBoundary?.controlLineageStartsAtCycleOne !== true
      || contract.databaseBoundary?.controlLineageEndsAtCycleThree !== true
      || contract.databaseBoundary?.controlLineageExactCount !== 3
      || contract.databaseBoundary?.controlLineageStrictlyAdjacent !== true
      || contract.databaseBoundary?.historicalControls !== "legacy_frozen_even_epoch"
      || contract.databaseBoundary?.currentControl
        !== "cycle3_single_shadow_capture_active_odd_epoch"
      || contract.databaseBoundary?.releaseCompletedSumEqualsGlobalCompleted !== true
      || contract.databaseBoundary?.outsideLineageMaximum !== 0
      || contract.databaseBoundary?.pendingMaximum !== 0
      || contract.databaseBoundary?.claimedMaximum !== 0
      || contract.databaseBoundary?.retryWaitMaximum !== 0
      || contract.databaseBoundary?.unresolvedMaximum !== 0
      || contract.databaseBoundary?.productionDmlAllowed !== false
      || contract.databaseBoundary?.schemaDdlAllowed !== false
      || contract.databaseBoundary?.migrationAllowed !== false
      || contract.databaseBoundary?.phaseTransitionAllowed !== false) {
    violations.push("database_boundary");
  }
  if (contract.outputBoundary?.schemaVersion !== "candidate-multi-cycle-lineage-evidence.v2"
      || contract.outputBoundary?.passStatus
        !== "PASS_CYCLE3_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH"
      || contract.outputBoundary?.rawEvidenceHashesRequired !== 3
      || contract.outputBoundary?.semanticEvidenceHashesRequired !== 3
      || contract.outputBoundary?.sourceReleaseWindowsRequired !== true
      || contract.outputBoundary?.thresholdsChanged !== false
      || contract.outputBoundary?.productionReconciliationExecuted !== false
      || contract.outputBoundary?.shadowVerifyStarted !== false
      || contract.outputBoundary?.canonicalAuthorityChanged !== false
      || contract.outputBoundary?.g0Completed !== false) {
    violations.push("output_boundary");
  }
  for (const token of [
    "evaluateCycleObservation", "MINIMUM_ACTIVATION_HOURS", "MINIMUM_ACTIVATION_SAMPLES",
    "MINIMUM_COMPARED_WRITES", "MINIMUM_STABILITY_SECONDS", "unified_cycle_not_cycle3",
    "unified_final_recompute_mismatch", "database_controls_invalid",
    "database_retired_control_not_frozen", "database_current_control_not_active",
    "database_completed_aggregate_mismatch", "outsideLineage", "database_${key}_not_zero",
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    "SET LOCAL ROLE candidate_audit_role", "lineage_future_stage_claim_invalid",
  ]) if (!runner.includes(token)) violations.push(`runner_guard_missing:${token}`);
  if (/\b(?:UPDATE\s+[a-z"]|DELETE\s+FROM|INSERT\s+INTO|ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE|TRUNCATE\s+TABLE)\b/iu
    .test(runner)) {
    violations.push("mutation_statement_present");
  }
  for (const forbidden of [
    "production_connection", "production_mutation", "schema_migration", "phase_transition",
    "sample_fabrication", "threshold_lowering", "window_shortening", "cycle_omission",
    "historical_pass_relabeling", "lineage_relabeling", "automatic_reconciliation",
    "automatic_shadow_verify",
    "canonical_cutover", "production_ranking_change", "future_outcome_input", "formal_backtest",
  ]) if (!contract.forbidden?.includes(forbidden)) violations.push(`forbidden_missing:${forbidden}`);
  return {
    status: violations.length === 0 ? "PASS_LOCAL_CYCLE3_UNIFIED_LINEAGE_REFRESH" : "FAIL",
    productionMutationAllowed: false,
    runnerArtifactSha256: runnerArtifact.sha256,
    violations,
  };
}

async function main() {
  const result = await validateCandidateLineageCapture();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.status.startsWith("PASS_")) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
