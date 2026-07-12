import assert from "node:assert/strict";
import test from "node:test";
import { loadRunnerContract, validateRuntimeIdentityRunner } from "./runtime-identity-runner.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("current repository passes runner preparation without production authority", async () => {
  const result = await validateRuntimeIdentityRunner();
  assert.equal(result.status, "PASS_LOCAL_RUNTIME_IDENTITY_RUNNER_PREPARATION");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.artifactFiles, 8);
  assert.deepEqual(result.violations, []);
});

test("validator rejects scope expansion and premature production claims", async () => {
  const contract = clone(await loadRunnerContract());
  contract.productionExecuted = true;
  contract.mutationAllowlist.servicesRecreated.push("postgres");
  const result = await validateRuntimeIdentityRunner(contract);
  assert.equal(result.status, "FAIL");
  assert.equal(result.violations.includes("production_state_claim"), true);
  assert.equal(result.violations.includes("mutation_allowlist"), true);
});

test("validator rejects activation or a weakened rollback prerequisite", async () => {
  const contract = clone(await loadRunnerContract());
  contract.dormantBoundary.codeActivationAllowed = true;
  contract.rollback.existingRuntimeLoginsMustBeAbsentAtPreflight = false;
  const result = await validateRuntimeIdentityRunner(contract);
  assert.equal(result.status, "FAIL");
  assert.equal(result.violations.includes("dormant_boundary"), true);
  assert.equal(result.violations.includes("rollback_precondition"), true);
});
