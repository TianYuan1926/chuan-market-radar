import assert from "node:assert/strict";
import test from "node:test";
import {
  loadActivationRunnerContract,
  validateActivationRunnerPreparation,
} from "./candidate-activation-runner.mjs";

test("current source passes current runner preparation but remains production blocked", async () => {
  const result = await validateActivationRunnerPreparation();
  assert.equal(result.status, "PASS_LOCAL_ACTIVATION_OBSERVATION_RUNNER_PREPARATION");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.currentCodeActivationAllowed, false);
  assert.equal(result.runnerArtifactFiles, 4);
  assert.equal(result.activationReleaseArtifactFiles, 16);
  assert.deepEqual(result.violations, []);
});

test("governance rejects threshold reduction, scope expansion and false production claims", async () => {
  const contract = await loadActivationRunnerContract();
  const cases = [
    { ...contract, productionAuthorization: true },
    { ...contract, observation: { ...contract.observation, minimumCleanWindowHours: 23 } },
    { ...contract, observation: { ...contract.observation, minimumComparedWritesForNextGate: 9999 } },
    { ...contract, mutationAllowlist: { ...contract.mutationAllowlist, canonicalWriteEnabled: true } },
    { ...contract, rollback: { ...contract.rollback, deleteCandidateEvidenceAllowed: true } },
    { ...contract, execution: { ...contract.execution, observationRunner: "nohup" } },
    { ...contract, execution: { ...contract.execution, externalLeaseRequired: false } },
    { ...contract, nextProductionPackage: "WP-G0.2-SHADOW-CAPTURE-ACTIVATE-AND-OBSERVE" },
  ];
  for (const candidate of cases) {
    const result = await validateActivationRunnerPreparation(candidate);
    assert.equal(result.status, "FAIL");
    assert.ok(result.violations.length > 0);
  }
});
