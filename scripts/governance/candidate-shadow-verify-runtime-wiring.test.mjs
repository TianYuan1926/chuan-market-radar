import assert from "node:assert/strict";
import test from "node:test";
import {
  loadShadowVerifyRuntimeWiringContract,
  validateShadowVerifyRuntimeWiring,
} from "./candidate-shadow-verify-runtime-wiring.mjs";

test("current runtime wiring remains local and fail closed", async () => {
  const result = await validateShadowVerifyRuntimeWiring();
  assert.equal(result.status, "PASS_LOCAL_SHADOW_VERIFY_RUNTIME_WIRING");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.codeCanonicalReadAllowed, false);
  assert.deepEqual(result.violations, []);
});

test("authorization, request authority, stale fallback, or production claims fail", async () => {
  for (const mutate of [
    (contract) => { contract.productionExecuted = true; },
    (contract) => { contract.runtimeBoundary.codeCanonicalReadAllowed = true; },
    (contract) => { contract.runtimeBoundary.staleFallbackAllowed = true; },
    (contract) => { contract.runtimeBoundary.databaseStatementTimeoutMs = 30_000; },
    (contract) => { contract.endpointBoundary.requestControlsPhase = true; },
    (contract) => { contract.deploymentBoundary.apiDeployed = true; },
  ]) {
    const contract = structuredClone(await loadShadowVerifyRuntimeWiringContract());
    mutate(contract);
    assert.equal((await validateShadowVerifyRuntimeWiring(contract)).status, "FAIL");
  }
});
