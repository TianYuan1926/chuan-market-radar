import assert from "node:assert/strict";
import test from "node:test";

import {
  loadCandidateLineageCaptureContract,
  validateCandidateLineageCapture,
} from "./candidate-lineage-capture.mjs";

test("current-cycle lineage locks 24h, 10000 writes, and read-only boundaries", async () => {
  const result = await validateCandidateLineageCapture();
  assert.equal(result.status, "PASS_LOCAL_CURRENT_CYCLE_UNIFIED_LINEAGE_REFRESH");
  assert.equal(result.productionMutationAllowed, false);
  assert.deepEqual(result.violations, []);
});

test("Cycle-6 requires six windows and rejects Cycle-5 v3 as current evidence", async () => {
  const contract = await loadCandidateLineageCaptureContract();
  assert.equal(contract.unifiedObservationBoundary.migrationId, "candidate-episode-v1-cycle-6");
  assert.equal(contract.databaseBoundary.controlLineageExactCount, 6);
  assert.equal(contract.historicalTruthBoundary.cycle5V3ContractsPreserved, true);
  assert.equal(contract.historicalTruthBoundary.cycle5V3AcceptedAsCycle6PassEvidence, false);

  const stale = structuredClone(contract);
  stale.unifiedObservationBoundary.migrationId = "candidate-episode-v1-cycle-5";
  stale.databaseBoundary.controlLineageExactCount = 5;
  const result = await validateCandidateLineageCapture(stale);
  assert.equal(result.status, "FAIL");
  assert.ok(result.violations.includes("unified_observation_boundary"));
  assert.ok(result.violations.includes("database_boundary"));
});

test("threshold, historical truth, and future-stage claims cannot be relaxed", async () => {
  const contract = await loadCandidateLineageCaptureContract();
  const weakened = structuredClone(contract);
  weakened.unifiedObservationBoundary.minimumCompletedWrites = 9_999;
  weakened.historicalTruthBoundary.historicalObservationCanBeRelabeled = true;
  weakened.outputBoundary.productionReconciliationExecuted = true;
  const result = await validateCandidateLineageCapture(weakened);
  assert.equal(result.status, "FAIL");
  assert.ok(result.violations.includes("unified_observation_boundary"));
  assert.ok(result.violations.includes("historical_truth_boundary"));
  assert.ok(result.violations.includes("output_boundary"));
});
