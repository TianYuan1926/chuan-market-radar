import assert from "node:assert/strict";
import test from "node:test";
import {
  loadCandidateCanonicalApiRouteAdapterContract,
  validateCandidateCanonicalApiRouteAdapterPreparation,
} from "./candidate-canonical-api-route-adapter.mjs";

test("current route adapter keeps request authority closed after code authorization", async () => {
  const result = await validateCandidateCanonicalApiRouteAdapterPreparation();
  assert.equal(result.status, "PASS_LOCAL_CANONICAL_API_ROUTE_ADAPTER_PREPARATION");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.currentCodeCanonicalReadAllowed, true);
  assert.equal(result.existingApiRouteModified, false);
  assert.equal(result.frontendModified, false);
  assert.equal(result.canAutoDeploy, false);
  assert.deepEqual(result.violations, []);
});

test("request-controlled authority and stale fallback fail governance", async () => {
  const contract = await loadCandidateCanonicalApiRouteAdapterContract();
  const request = structuredClone(contract);
  request.requestBoundary.phaseRequestControlled = true;
  assert.ok((await validateCandidateCanonicalApiRouteAdapterPreparation(request)).violations.includes(
    "request_control:phaseRequestControlled",
  ));

  const stale = structuredClone(contract);
  stale.trustedBoundary.staleControlFallbackAllowed = true;
  assert.ok((await validateCandidateCanonicalApiRouteAdapterPreparation(stale)).violations.includes(
    "trusted_boundary",
  ));
});

test("HTTP 200 unavailable and false production claims fail governance", async () => {
  const contract = await loadCandidateCanonicalApiRouteAdapterContract();
  const http = structuredClone(contract);
  http.httpBoundary.unavailableStatusCode = 200;
  assert.ok((await validateCandidateCanonicalApiRouteAdapterPreparation(http)).violations.includes(
    "http_boundary",
  ));

  const production = structuredClone(contract);
  production.runtimeBoundary.existingApiRouteModified = true;
  assert.ok((await validateCandidateCanonicalApiRouteAdapterPreparation(production)).violations.includes(
    "runtime_boundary:existingApiRouteModified",
  ));
});
