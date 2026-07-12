import assert from "node:assert/strict";
import test from "node:test";
import {
  loadRuntimeIdentityContract,
  validateRuntimeIdentityPreparation,
} from "./runtime-identity-permission.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("current repository passes local runtime identity preparation without production authority", async () => {
  const result = await validateRuntimeIdentityPreparation();
  assert.equal(result.status, "PASS_LOCAL_RUNTIME_IDENTITY_PREPARATION");
  assert.equal(result.productionMutationAllowed, false);
  assert.deepEqual(result.violations, []);
});

test("validator rejects inherited or multi-role runtime logins", async () => {
  const contract = clone(await loadRuntimeIdentityContract());
  contract.identityTopology.source.loginInherit = true;
  contract.identityTopology.consumer.membershipCount = 2;
  const result = await validateRuntimeIdentityPreparation(contract);
  assert.equal(result.status, "FAIL");
  assert.equal(result.violations.includes("identity_topology:source"), true);
  assert.equal(result.violations.includes("identity_topology:consumer"), true);
});

test("validator rejects production state claims or weakened deny boundaries", async () => {
  const contract = clone(await loadRuntimeIdentityContract());
  contract.productionIdentityProvisioned = true;
  contract.runtimeAccess.monitorWrite = true;
  const result = await validateRuntimeIdentityPreparation(contract);
  assert.equal(result.status, "FAIL");
  assert.equal(result.violations.includes("production_state_claim"), true);
  assert.equal(result.violations.includes("runtime_deny_boundary"), true);
});
