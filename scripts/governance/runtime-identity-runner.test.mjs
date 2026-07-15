import assert from "node:assert/strict";
import test from "node:test";
import { loadRunnerContract, validateRuntimeIdentityRunner } from "./runtime-identity-runner.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("current repository passes runner preparation without production authority", async () => {
  const result = await validateRuntimeIdentityRunner();
  assert.equal(result.status, "PASS_LOCAL_RUNTIME_IDENTITY_CURRENT_RELEASE_PREFLIGHT");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.artifactFiles, 8);
  assert.equal(result.productionTarget, "cec0b6572bb09ae91ff9e013f8bb160f73c045e2");
  assert.equal(result.repositoryState, "clean_detached");
  assert.deepEqual(result.violations, []);
});

test("production runner never requires or checks out GitHub main", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(
    new URL("../production/candidate-runtime-identity/production-runner.sh", import.meta.url),
    "utf8",
  ));
  assert.match(source, /production_branch_not_detached/);
  assert.doesNotMatch(source, /production_branch_not_main|branch --show-current\)" == "main"/);
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

test("validator rejects weakened stale-evidence renewal observation", async () => {
  const contract = clone(await loadRunnerContract());
  contract.dormantEvidence.freshnessRenewal.observationDurationSeconds = 60;
  contract.dormantEvidence.freshnessRenewal.readOnly = false;
  const result = await validateRuntimeIdentityRunner(contract);
  assert.equal(result.status, "FAIL");
  assert.equal(result.violations.includes("dormant_evidence_boundary"), true);
});

test("validator rejects main-branch production assumptions and stale Dormant status", async () => {
  const contract = clone(await loadRunnerContract());
  contract.productionTarget.repositoryState = "main";
  contract.dormantEvidence.finalStatus = "PASS_DORMANT_RUNTIME_DEPLOY";
  const result = await validateRuntimeIdentityRunner(contract);
  assert.equal(result.status, "FAIL");
  assert.equal(result.violations.includes("production_target"), true);
  assert.equal(result.violations.includes("dormant_prerequisite"), true);
});
