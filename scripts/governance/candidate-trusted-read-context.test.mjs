import assert from "node:assert/strict";
import test from "node:test";
import {
  loadCandidateTrustedReadContextContract,
  validateCandidateTrustedReadContextPreparation,
} from "./candidate-trusted-read-context.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("trusted context keeps runtime authority closed after code authorization", async () => {
  const result = await validateCandidateTrustedReadContextPreparation();
  assert.equal(result.status, "PASS_LOCAL_TRUSTED_READ_CONTEXT_PREPARATION");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.existingApiRouteModified, false);
  assert.equal(result.currentCodeCanonicalReadAllowed, true);
  assert.deepEqual(result.violations, []);
});

test("separate providers and authority drift acceptance fail governance", async () => {
  const contract = clone(await loadCandidateTrustedReadContextContract());
  contract.authorityBoundary.singleTrustedContextProvider = false;
  contract.authorityBoundary.separatePolicyAndControlProvidersAllowed = true;
  contract.authorityBoundary.authorityFingerprintRecheckedAfterDataRead = false;
  const result = await validateCandidateTrustedReadContextPreparation(contract);
  assert.equal(result.status, "FAIL");
  assert.ok(result.violations.includes("authority_boundary"));
});

test("phase-derived evidence and weak manifest binding fail governance", async () => {
  const contract = clone(await loadCandidateTrustedReadContextContract());
  contract.manifestBoundary.phaseCanInferEvidencePass = true;
  contract.manifestBoundary.exactRawBytesSha256MatchesDatabaseApprovalDigest = false;
  contract.manifestBoundary.unknownFieldsRejected = false;
  const result = await validateCandidateTrustedReadContextPreparation(contract);
  assert.equal(result.status, "FAIL");
  assert.ok(result.violations.includes("manifest_boundary"));
});

test("false production claims and runtime release drift fail governance", async () => {
  const contract = clone(await loadCandidateTrustedReadContextContract());
  contract.productionAuthorization = true;
  contract.runtimeBoundary.runtimeReleaseMatchesApprovedRelease = false;
  contract.runtimeBoundary.existingApiRouteModified = true;
  const result = await validateCandidateTrustedReadContextPreparation(contract);
  assert.equal(result.status, "FAIL");
  assert.ok(result.violations.includes("production_state_claim"));
  assert.ok(result.violations.includes("runtime_boundary"));
  assert.ok(result.violations.includes("runtime_false:existingApiRouteModified"));
});

test("canonical compat freeze and immutable deadline exceptions cannot be weakened", async () => {
  const contract = clone(await loadCandidateTrustedReadContextContract());
  contract.runtimeBoundary.canonicalCompatWriteFrozenRequired = false;
  contract.runtimeBoundary.nonCanonicalDeadlineExpiryRejected = false;
  contract.runtimeBoundary.deadlineExtensionAllowed = true;
  const result = await validateCandidateTrustedReadContextPreparation(contract);
  assert.equal(result.status, "FAIL");
  assert.ok(result.violations.includes("runtime_boundary"));
});
