import assert from "node:assert/strict";
import test from "node:test";

import {
  loadCandidateLineageCaptureContract,
  validateCandidateLineageCapture,
} from "./candidate-lineage-capture.mjs";

test("fresh-cycle lineage capture contract locks raw evidence, 10000, and read-only boundaries", async () => {
  const result = await validateCandidateLineageCapture();
  assert.equal(result.status, "PASS_LOCAL_FRESH_CYCLE_LINEAGE_CAPTURE");
  assert.equal(result.productionMutationAllowed, false);
  assert.deepEqual(result.violations, []);
});

test("threshold, chronology, and future-stage claims cannot be relaxed", async () => {
  const contract = await loadCandidateLineageCaptureContract();
  const weakened = structuredClone(contract);
  weakened.accumulationBoundary.minimumCompletedWrites = 9_999;
  weakened.freshCycleBoundary.mustStartAfterAccumulationPassSample = false;
  weakened.outputBoundary.productionReconciliationExecuted = true;
  const result = await validateCandidateLineageCapture(weakened);
  assert.equal(result.status, "FAIL");
  assert.ok(result.violations.includes("accumulation_boundary"));
  assert.ok(result.violations.includes("fresh_cycle_boundary"));
  assert.ok(result.violations.includes("output_boundary"));
});
