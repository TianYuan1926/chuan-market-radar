import assert from "node:assert/strict";
import test from "node:test";
import {
  loadCandidateCanonicalReadContract,
  validateCandidateCanonicalReadPreparation,
} from "./candidate-canonical-read-model.mjs";

test("current canonical read preparation is locked and production remains prohibited", async () => {
  const result = await validateCandidateCanonicalReadPreparation();
  assert.equal(result.status, "PASS_LOCAL_CANONICAL_READ_MODEL_PREPARATION");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.canonicalReadAuthorized, false);
  assert.equal(result.automaticPhaseAdvance, false);
  assert.deepEqual(result.violations, []);
});

test("weakened cohort, parity and production boundaries fail validation", async () => {
  const contract = await loadCandidateCanonicalReadContract();
  const cohort = structuredClone(contract);
  cohort.readPolicy.releaseIdRequired = false;
  assert.ok((await validateCandidateCanonicalReadPreparation(cohort)).violations.includes("read_policy"));

  const parity = structuredClone(contract);
  parity.parityEvidence.minimumSamplesPerWindow = 288;
  assert.ok((await validateCandidateCanonicalReadPreparation(parity)).violations.includes("parity_evidence"));

  const production = structuredClone(contract);
  production.productionAuthorization = true;
  assert.ok((await validateCandidateCanonicalReadPreparation(production)).violations.includes("production_state_claim"));
});

test("future outcomes, ranking mutation and silent fallback cannot be authorized", async () => {
  const contract = await loadCandidateCanonicalReadContract();
  const future = structuredClone(contract);
  future.truthBoundary.futureOutcomeAsRankingInputAllowed = true;
  assert.ok((await validateCandidateCanonicalReadPreparation(future)).violations.includes(
    "truth_boundary:futureOutcomeAsRankingInputAllowed",
  ));

  const ranking = structuredClone(contract);
  ranking.truthBoundary.liveRankingMutationAllowed = true;
  assert.ok((await validateCandidateCanonicalReadPreparation(ranking)).violations.includes(
    "truth_boundary:liveRankingMutationAllowed",
  ));

  const fallback = structuredClone(contract);
  fallback.readRoute.canonicalFailureFallback = "legacy";
  assert.ok((await validateCandidateCanonicalReadPreparation(fallback)).violations.includes("read_route"));
});
