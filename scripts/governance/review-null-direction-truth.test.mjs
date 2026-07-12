import assert from "node:assert/strict";
import test from "node:test";
import {
  loadReviewNullDirectionTruthContract,
  validateReviewNullDirectionTruth,
} from "./review-null-direction-truth.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("review truth contract preserves unknown and null without production authority", async () => {
  const result = await validateReviewNullDirectionTruth();
  assert.equal(result.status, "PASS_LOCAL_REVIEW_NULL_DIRECTION_TRUTH");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.scanModified, false);
  assert.equal(result.strategyModified, false);
  assert.deepEqual(result.violations, []);
});

test("default long and zero-metric claims fail governance", async () => {
  const contract = clone(await loadReviewNullDirectionTruthContract());
  contract.truthBoundary.unknownDirectionCanDefaultLong = true;
  contract.truthBoundary.missingMfeMaeRemainNull = false;
  contract.truthBoundary.emptyMetricAverageIsNull = false;
  const result = await validateReviewNullDirectionTruth(contract);
  assert.equal(result.status, "FAIL");
  assert.ok(result.violations.includes("truth_false:unknownDirectionCanDefaultLong"));
  assert.ok(result.violations.includes("truth_true:missingMfeMaeRemainNull"));
  assert.ok(result.violations.includes("truth_true:emptyMetricAverageIsNull"));
});

test("timeout inference and incomplete-live claims fail governance", async () => {
  const contract = clone(await loadReviewNullDirectionTruthContract());
  contract.truthBoundary.onlyExpiredCanRenderTimedOut = false;
  contract.truthBoundary.pendingAndUnknownOutcomesSeparated = false;
  contract.truthBoundary.incompleteLifecycleResourceIsPartial = false;
  const result = await validateReviewNullDirectionTruth(contract);
  assert.equal(result.status, "FAIL");
  assert.ok(result.violations.includes("truth_true:onlyExpiredCanRenderTimedOut"));
  assert.ok(result.violations.includes("truth_true:pendingAndUnknownOutcomesSeparated"));
  assert.ok(result.violations.includes("truth_true:incompleteLifecycleResourceIsPartial"));
});

test("production, strategy and database scope expansion fail governance", async () => {
  const contract = clone(await loadReviewNullDirectionTruthContract());
  contract.productionAuthorization = true;
  contract.scopeBoundary.strategyModified = true;
  contract.scopeBoundary.databaseModified = true;
  contract.scopeBoundary.productionConnected = true;
  const result = await validateReviewNullDirectionTruth(contract);
  assert.equal(result.status, "FAIL");
  assert.ok(result.violations.includes("production_state_claim"));
  assert.ok(result.violations.includes("scope_false:strategyModified"));
  assert.ok(result.violations.includes("scope_false:databaseModified"));
  assert.ok(result.violations.includes("scope_false:productionConnected"));
});
