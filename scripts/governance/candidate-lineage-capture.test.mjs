import assert from "node:assert/strict";
import test from "node:test";

import {
  loadCandidateLineageCaptureContract,
  validateCandidateLineageCapture,
} from "./candidate-lineage-capture.mjs";

test("Cycle-3 unified lineage contract locks 24h, 10000 writes, and read-only boundaries", async () => {
  const result = await validateCandidateLineageCapture();
  assert.equal(result.status, "PASS_LOCAL_CYCLE3_UNIFIED_LINEAGE_REFRESH");
  assert.equal(result.productionMutationAllowed, false);
  assert.deepEqual(result.violations, []);
});

test("threshold, historical truth, and future-stage claims cannot be relaxed", async () => {
  const contract = await loadCandidateLineageCaptureContract();
  const weakened = structuredClone(contract);
  weakened.unifiedObservationBoundary.minimumCompletedWrites = 9_999;
  weakened.historicalTruthBoundary.historicalActivation197SamplesIsPass = true;
  weakened.outputBoundary.productionReconciliationExecuted = true;
  const result = await validateCandidateLineageCapture(weakened);
  assert.equal(result.status, "FAIL");
  assert.ok(result.violations.includes("unified_observation_boundary"));
  assert.ok(result.violations.includes("historical_truth_boundary"));
  assert.ok(result.violations.includes("output_boundary"));
});
