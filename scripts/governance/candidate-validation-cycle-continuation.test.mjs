import assert from "node:assert/strict";
import test from "node:test";
import {
  loadCandidateValidationCycleContinuationContract,
  validateCandidateValidationCycleContinuation,
} from "./candidate-validation-cycle-continuation.mjs";

test("current continuation preserves every threshold and production remains blocked", async () => {
  const result = await validateCandidateValidationCycleContinuation();
  assert.equal(result.status, "PASS_LOCAL_VALIDATION_CYCLE_CONTINUATION");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.oldDeadlineResetAllowed, false);
  assert.equal(result.minimumComparedWrites, 10_000);
  assert.equal(result.observationHoursPerWindow, 24);
  assert.deepEqual(result.violations, []);
});

test("deadline reset threshold reduction and production claims fail governance", async () => {
  for (const mutate of [
    (contract) => { contract.productionExecuted = true; },
    (contract) => { contract.problemProof.minimumComparedWrites = 9_999; },
    (contract) => { contract.continuationBoundary.oldDeadlineImmutable = false; },
    (contract) => { contract.continuationBoundary.newCycleMaximumHours = 96; },
    (contract) => { contract.continuationBoundary.observationWindowShortened = true; },
    (contract) => { contract.problemProof.legacySourceUnresolved = 1; },
    (contract) => { contract.problemProof.candidateEventOrphans = 1; },
    (contract) => { contract.continuationBoundary.candidateEventLanePreserved = false; },
  ]) {
    const contract = structuredClone(await loadCandidateValidationCycleContinuationContract());
    mutate(contract);
    assert.equal((await validateCandidateValidationCycleContinuation(contract)).status, "FAIL");
  }
});
