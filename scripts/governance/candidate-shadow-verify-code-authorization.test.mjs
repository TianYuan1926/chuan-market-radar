import assert from "node:assert/strict";
import test from "node:test";
import {
  loadShadowVerifyCodeAuthorizationContract,
  validateShadowVerifyCodeAuthorization,
} from "./candidate-shadow-verify-code-authorization.mjs";

test("shadow verify code authorization is production-blocked and fail-closed", async () => {
  const result = await validateShadowVerifyCodeAuthorization();
  assert.equal(result.status, "PASS_LOCAL_SHADOW_VERIFY_CODE_AUTHORIZATION");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.codeStateMachineAuthorized, true);
  assert.equal(result.shadowVerifyResponseAuthority, "legacy");
  assert.deepEqual(result.violations, []);
});

test("authorization contract cannot relax phase evidence or response authority", async () => {
  const contract = await loadShadowVerifyCodeAuthorizationContract();
  const cases = [
    ["production", { ...contract, productionDeployed: true }],
    ["request", {
      ...contract,
      publicEndpointBoundary: { ...contract.publicEndpointBoundary, requestControlsPhase: true },
    }],
    ["evidence", {
      ...contract,
      shadowVerifyBoundary: { ...contract.shadowVerifyBoundary, reconciliationEvidenceRequired: "missing" },
    }],
    ["lineage-v1", {
      ...contract,
      shadowVerifyBoundary: {
        ...contract.shadowVerifyBoundary,
        lineageSchemaRequired: "candidate-multi-cycle-lineage-evidence.v1",
      },
    }],
    ["two-windows", {
      ...contract,
      shadowVerifyBoundary: { ...contract.shadowVerifyBoundary, sourceReleaseWindowsExact: 2 },
    }],
    ["authority", {
      ...contract,
      shadowVerifyBoundary: { ...contract.shadowVerifyBoundary, legacyResponseAuthorityRequired: false },
    }],
    ["phase", { ...contract, phaseMatrix: { ...contract.phaseMatrix, shadow_verify: "canonical" } }],
    ["forbidden", {
      ...contract,
      forbidden: contract.forbidden.filter((item) => item !== "formal_backtest"),
    }],
  ];
  for (const [name, candidate] of cases) {
    const result = await validateShadowVerifyCodeAuthorization(candidate);
    assert.equal(result.status, "FAIL", name);
    assert.ok(result.violations.length > 0, name);
  }
});
