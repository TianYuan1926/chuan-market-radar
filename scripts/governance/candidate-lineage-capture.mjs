#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(ROOT,
  "docs/governance/wp-g0-2-fresh-verification-cycle-lineage-capture-local-superpackage.v1.json");

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
      !== "wp-g0.2-fresh-verification-cycle-lineage-capture-local-superpackage.v1") {
    violations.push("schema_version");
  }
  if (contract.packageId
      !== "WP-G0.2-FRESH-VERIFICATION-CYCLE-LINEAGE-CAPTURE-LOCAL-SUPERPACKAGE"
      || contract.productionAuthorization !== false || contract.productionExecuted !== false) {
    violations.push("production_truth");
  }
  if (runnerArtifact.fileCount !== 1
      || runnerArtifact.fileCount !== contract.runnerArtifact?.fileCount
      || runnerArtifact.sha256 !== contract.runnerArtifact?.sha256) {
    violations.push("runner_artifact");
  }
  if (contract.activationBoundary?.samplesExact !== 289
      || contract.activationBoundary?.minimumCoverageHours !== 24
      || contract.activationBoundary?.maximumSampleGapSeconds !== 600
      || contract.activationBoundary?.recomputeFromRawSamples !== true
      || contract.activationBoundary?.bindsFirstReleaseWindowOnly !== true) {
    violations.push("activation_boundary");
  }
  if (contract.accumulationBoundary?.minimumCompletedWrites !== 10_000
      || contract.accumulationBoundary?.minimumSamples !== 7
      || contract.accumulationBoundary?.minimumStabilitySeconds !== 1_800
      || contract.accumulationBoundary?.minimumCompletionAdvances !== 2
      || contract.accumulationBoundary?.maximumSampleGapSeconds !== 600
      || contract.accumulationBoundary?.unresolvedMaximum !== 0
      || contract.accumulationBoundary?.recomputeFromRawSamples !== true) {
    violations.push("accumulation_boundary");
  }
  if (contract.freshCycleBoundary?.strictlyAdjacentToAccumulationCycle !== true
      || contract.freshCycleBoundary?.mustStartAfterAccumulationPassSample !== true
      || contract.freshCycleBoundary?.minimumSamples !== 7
      || contract.freshCycleBoundary?.minimumStabilitySeconds !== 1_800
      || contract.freshCycleBoundary?.minimumCompletionAdvances !== 2
      || contract.freshCycleBoundary?.completedWritesMustNotRegress !== true
      || contract.freshCycleBoundary?.unresolvedMaximum !== 0
      || contract.freshCycleBoundary?.recomputeFromRawSamples !== true) {
    violations.push("fresh_cycle_boundary");
  }
  if (contract.databaseBoundary?.transactionIsolation !== "repeatable_read"
      || contract.databaseBoundary?.transactionReadOnly !== true
      || contract.databaseBoundary?.forcedLocalRole !== "candidate_audit_role"
      || contract.databaseBoundary?.controlLineageStartsAtCycleOne !== true
      || contract.databaseBoundary?.controlLineageStrictlyAdjacent !== true
      || contract.databaseBoundary?.outsideLineageMaximum !== 0
      || contract.databaseBoundary?.unresolvedMaximum !== 0
      || contract.databaseBoundary?.productionDmlAllowed !== false
      || contract.databaseBoundary?.schemaDdlAllowed !== false
      || contract.databaseBoundary?.migrationAllowed !== false
      || contract.databaseBoundary?.phaseTransitionAllowed !== false) {
    violations.push("database_boundary");
  }
  if (contract.outputBoundary?.rawEvidenceHashesRequired !== 7
      || contract.outputBoundary?.sourceReleaseWindowsRequired !== true
      || contract.outputBoundary?.thresholdsChanged !== false
      || contract.outputBoundary?.productionReconciliationExecuted !== false
      || contract.outputBoundary?.shadowVerifyStarted !== false
      || contract.outputBoundary?.canonicalAuthorityChanged !== false
      || contract.outputBoundary?.g0Completed !== false) {
    violations.push("output_boundary");
  }
  for (const token of [
    "evaluateObservationEvidence", "evaluateCycleObservation",
    "MINIMUM_COMPARED_WRITES", "MINIMUM_STABILITY_SECONDS",
    "fresh_cycle_started_before_accumulation_pass", "fresh_cycle_not_adjacent_to_accumulation",
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
    "lineage_relabeling", "automatic_reconciliation", "automatic_shadow_verify",
    "canonical_cutover", "production_ranking_change", "future_outcome_input", "formal_backtest",
  ]) if (!contract.forbidden?.includes(forbidden)) violations.push(`forbidden_missing:${forbidden}`);
  return {
    status: violations.length === 0 ? "PASS_LOCAL_FRESH_CYCLE_LINEAGE_CAPTURE" : "FAIL",
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
