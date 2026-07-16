import assert from "node:assert/strict";
import test from "node:test";

import {
  loadActivationRunnerContract,
  validateActivationRunnerPreparation,
} from "./candidate-activation-runner.mjs";

test("activation production release is fail-closed until an exact external request", async () => {
  const result = await validateActivationRunnerPreparation();
  assert.equal(result.status, "PASS_LOCAL_ACTIVATION_PRODUCTION_RELEASE");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.currentCodeActivationAllowed, true);
  assert.equal(result.runnerArtifactFiles, 5);
  assert.equal(result.activationReleaseArtifactFiles, 19);
  assert.deepEqual(result.violations, []);
});

test("production contract keeps quality, observation and rollback boundaries locked", async () => {
  const contract = await loadActivationRunnerContract();
  assert.equal(contract.productionAuthorization, false);
  assert.equal(contract.productionExecuted, false);
  assert.equal(contract.observation.minimumCleanWindowHours, 24);
  assert.equal(contract.observation.minimumSamples, 289);
  assert.equal(contract.observation.minimumComparedWritesForNextGate, 10000);
  assert.equal(contract.mutationAllowlist.canonicalWriteEnabled, false);
  assert.equal(contract.mutationAllowlist.automaticPhaseAdvance, false);
  assert.equal(contract.rollback.automaticRollbackRequired, true);
  assert.equal(contract.rollback.deleteCandidateEvidenceAllowed, false);
  assert.ok(contract.forbidden.includes("scan_ranking_change"));
  assert.ok(contract.forbidden.includes("formal_backtest"));
});
