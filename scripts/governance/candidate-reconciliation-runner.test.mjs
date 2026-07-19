import assert from "node:assert/strict";
import test from "node:test";
import {
  loadCandidateReconciliationContract,
  validateCandidateReconciliationPreparation,
} from "./candidate-reconciliation-runner.mjs";

test("current-cycle reconciliation contract is locked and production remains prohibited", async () => {
  const result = await validateCandidateReconciliationPreparation();
  assert.equal(result.status,
    "PASS_CURRENT_CYCLE_UNIFIED_RECONCILIATION_REFRESH_LOCAL_PREPARATION");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.automaticPhaseAdvance, false);
  assert.equal(result.shadowVerifyTransitionExecuted, false);
  assert.equal(result.g0Completed, false);
  assert.equal(result.minimumComparedWrites, 10_000);
  assert.equal(result.releaseWindowsRequired, 6);
  assert.deepEqual(result.violations, []);
});

test("threshold reductions and phase advance claims fail governance validation", async () => {
  const contract = await loadCandidateReconciliationContract();
  const reduced = structuredClone(contract);
  reduced.comparison.minimumComparedWrites = 9_999;
  assert.ok((await validateCandidateReconciliationPreparation(reduced)).violations.includes("comparison_thresholds"));
  const advanced = structuredClone(contract);
  advanced.resultBoundary.automaticPhaseAdvance = true;
  assert.ok((await validateCandidateReconciliationPreparation(advanced)).violations.includes("result_boundary"));
});

test("future outcome and ranking inputs cannot be promoted into the contract", async () => {
  const contract = await loadCandidateReconciliationContract();
  const outcome = structuredClone(contract);
  outcome.inputBoundary.futureOutcomeAllowed = true;
  assert.ok((await validateCandidateReconciliationPreparation(outcome)).violations.includes("input_boundary:futureOutcomeAllowed"));
  const ranking = structuredClone(contract);
  ranking.inputBoundary.productionRankingInputAllowed = true;
  assert.ok((await validateCandidateReconciliationPreparation(ranking)).violations.includes("input_boundary:productionRankingInputAllowed"));
});

test("database boundary cannot drop the least-privilege audit role", async () => {
  const contract = await loadCandidateReconciliationContract();
  const elevated = structuredClone(contract);
  elevated.databaseBoundary.forcedLocalRole = "postgres";
  assert.ok((await validateCandidateReconciliationPreparation(elevated)).violations.includes("database_boundary"));
});

test("legacy Lineage, historical Activation files and incomplete windows remain forbidden", async () => {
  const contract = await loadCandidateReconciliationContract();
  const lineageV1 = structuredClone(contract);
  lineageV1.lineageBoundary.schemaVersion = "candidate-multi-cycle-lineage-evidence.v1";
  assert.ok((await validateCandidateReconciliationPreparation(lineageV1)).violations.includes(
    "lineage_boundary"));
  const activation = structuredClone(contract);
  activation.lineageBoundary.historicalActivationFilesAllowed = true;
  assert.ok((await validateCandidateReconciliationPreparation(activation)).violations.includes(
    "lineage_boundary"));
  const twoWindows = structuredClone(contract);
  twoWindows.lineageBoundary.sourceReleaseWindowsExact = 2;
  assert.ok((await validateCandidateReconciliationPreparation(twoWindows)).violations.includes(
    "lineage_boundary"));
});

test("local rehearsal truth is pinned to PG16 and six-window writes", async () => {
  const contract = await loadCandidateReconciliationContract();
  const relabeled = structuredClone(contract);
  relabeled.localRehearsal.releaseCounts = [5_000, 0, 5_000, 0, 0, 20];
  assert.ok((await validateCandidateReconciliationPreparation(relabeled)).violations.includes(
    "local_rehearsal"));
  const productionConnected = structuredClone(contract);
  productionConnected.localRehearsal.productionConnected = true;
  assert.ok((await validateCandidateReconciliationPreparation(productionConnected)).violations.includes(
    "local_rehearsal"));
});

test("Cycle-5 v3 dependencies cannot be relabeled as Cycle-6 current evidence", async () => {
  const contract = await loadCandidateReconciliationContract();
  assert.equal(contract.lineageBoundary.migrationId, "candidate-episode-v1-cycle-6");
  assert.equal(contract.lineageBoundary.sourceReleaseWindowsExact, 6);
  assert.equal(contract.lineageBoundary.cycle5V3AcceptedAsCycle6PassEvidence, false);

  const stale = structuredClone(contract);
  stale.lineageBoundary.migrationId = "candidate-episode-v1-cycle-5";
  stale.lineageBoundary.sourceReleaseWindowsExact = 5;
  stale.databaseBoundary.controlLineageExactCount = 5;
  const result = await validateCandidateReconciliationPreparation(stale);
  assert.ok(result.violations.includes("lineage_boundary"));
  assert.ok(result.violations.includes("database_boundary"));
});
