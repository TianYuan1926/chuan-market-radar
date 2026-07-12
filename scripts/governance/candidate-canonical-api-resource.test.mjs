import assert from "node:assert/strict";
import test from "node:test";
import {
  loadCandidateCanonicalApiResourceContract,
  validateCandidateCanonicalApiResourcePreparation,
} from "./candidate-canonical-api-resource.mjs";

test("current API resource contract keeps production and cutover disabled", async () => {
  const result = await validateCandidateCanonicalApiResourcePreparation();
  assert.equal(result.status, "PASS_LOCAL_CANONICAL_API_RESOURCE_CONTRACT_PREPARATION");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.existingApiRouteModified, false);
  assert.equal(result.frontendModified, false);
  assert.equal(result.canonicalReadAuthorized, false);
  assert.equal(result.canAuthorizeCutover, false);
  assert.deepEqual(result.violations, []);
});

test("Legacy authority inflation and silent canonical fallback fail governance", async () => {
  const contract = await loadCandidateCanonicalApiResourceContract();
  const legacy = structuredClone(contract);
  legacy.truthBoundary.legacyCanPopulateCandidateCanonical = true;
  assert.ok((await validateCandidateCanonicalApiResourcePreparation(legacy)).violations.includes(
    "truth_false:legacyCanPopulateCandidateCanonical",
  ));

  const fallback = structuredClone(contract);
  fallback.truthBoundary.canonicalFailureFallbackAllowed = true;
  assert.ok((await validateCandidateCanonicalApiResourcePreparation(fallback)).violations.includes(
    "truth_false:canonicalFailureFallbackAllowed",
  ));
});

test("weakened parity and false runtime claims fail governance", async () => {
  const contract = await loadCandidateCanonicalApiResourceContract();
  const parity = structuredClone(contract);
  parity.truthBoundary.canonicalCompatCandidateRequiresParityPass = false;
  assert.ok((await validateCandidateCanonicalApiResourcePreparation(parity)).violations.includes(
    "truth_true:canonicalCompatCandidateRequiresParityPass",
  ));

  const runtime = structuredClone(contract);
  runtime.runtimeBoundary.existingApiRouteModified = true;
  assert.ok((await validateCandidateCanonicalApiResourcePreparation(runtime)).violations.includes(
    "runtime_boundary:existingApiRouteModified",
  ));
});
