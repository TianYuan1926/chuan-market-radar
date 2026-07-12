import assert from "node:assert/strict";
import test from "node:test";
import {
  loadCandidateReconciliationContract,
  validateCandidateReconciliationPreparation,
} from "./candidate-reconciliation-runner.mjs";

test("current reconciliation runner contract is locked and production remains prohibited", async () => {
  const result = await validateCandidateReconciliationPreparation();
  assert.equal(result.status, "PASS_LOCAL_RECONCILIATION_RUNNER_PREPARATION");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.automaticPhaseAdvance, false);
  assert.equal(result.minimumComparedWrites, 10_000);
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
