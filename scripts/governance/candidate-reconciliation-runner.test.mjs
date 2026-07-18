import assert from "node:assert/strict";
import test from "node:test";
import {
  loadCandidateReconciliationContract,
  validateCandidateReconciliationPreparation,
} from "./candidate-reconciliation-runner.mjs";

test("Cycle-3 unified reconciliation contract is locked and production remains prohibited", async () => {
  const result = await validateCandidateReconciliationPreparation();
  assert.equal(result.status, "PASS_CYCLE3_UNIFIED_RECONCILIATION_REFRESH_LOCAL_PREPARATION");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.automaticPhaseAdvance, false);
  assert.equal(result.shadowVerifyTransitionExecuted, false);
  assert.equal(result.g0Completed, false);
  assert.equal(result.minimumComparedWrites, 10_000);
  assert.equal(result.releaseWindowsRequired, 3);
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

test("Lineage v1, historical Activation files and two-window models remain forbidden", async () => {
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

test("local rehearsal truth is pinned to PG16 and 2957/0/7063 writes", async () => {
  const contract = await loadCandidateReconciliationContract();
  const relabeled = structuredClone(contract);
  relabeled.localRehearsal.releaseCounts = [5_000, 0, 5_000];
  assert.ok((await validateCandidateReconciliationPreparation(relabeled)).violations.includes(
    "local_rehearsal"));
  const productionConnected = structuredClone(contract);
  productionConnected.localRehearsal.productionConnected = true;
  assert.ok((await validateCandidateReconciliationPreparation(productionConnected)).violations.includes(
    "local_rehearsal"));
});
