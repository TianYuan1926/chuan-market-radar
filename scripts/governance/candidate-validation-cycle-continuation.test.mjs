import assert from "node:assert/strict";
import test from "node:test";
import {
  loadCandidateValidationCycleContinuationContract,
  validateCandidateValidationCycleContinuation,
} from "./candidate-validation-cycle-continuation.mjs";

test("current continuation preserves every threshold and production remains blocked", async () => {
  const contract = await loadCandidateValidationCycleContinuationContract();
  assert.equal(contract.problemProof.currentProductionCycle, "candidate-episode-v1-cycle-5");
  assert.equal(contract.problemProof.currentProductionAuthorityEpoch, 2);
  assert.equal(contract.continuationBoundary.nextIdentityExample,
    "candidate-episode-v1-cycle-6");
  assert.equal(contract.problemProof.priorActivationSamplesObserved, 57);
  assert.equal(contract.continuationBoundary.databaseSnapshotMaximumBracketSeconds, 60);
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
    (contract) => {
      contract.continuationBoundary.oldestUnresolvedAgeExclusiveMaximumSeconds = 600;
    },
    (contract) => { contract.continuationBoundary.agingSampleAccepted = true; },
    (contract) => { contract.continuationBoundary.healthRecheckMaximumSeconds = 600; },
    (contract) => { contract.continuationBoundary.candidateWriteDuringHealthRecheck = true; },
    (contract) => { contract.continuationBoundary.databaseSnapshotBracketRequired = false; },
    (contract) => {
      contract.continuationBoundary.databaseSnapshotMaximumBracketSeconds = 600;
    },
    (contract) => {
      contract.continuationBoundary.monitorCompletedWithinDatabaseBracketInclusive = false;
    },
  ]) {
    const contract = structuredClone(await loadCandidateValidationCycleContinuationContract());
    mutate(contract);
    assert.equal((await validateCandidateValidationCycleContinuation(contract)).status, "FAIL");
  }
});
