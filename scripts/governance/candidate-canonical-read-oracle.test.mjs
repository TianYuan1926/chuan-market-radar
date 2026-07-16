import assert from "node:assert/strict";
import test from "node:test";
import {
  loadCandidateCanonicalOracleContract,
  validateCandidateCanonicalOraclePreparation,
} from "./candidate-canonical-read-oracle.mjs";

test("current Oracle preparation locks Legacy non-authority and production prohibition", async () => {
  const result = await validateCandidateCanonicalOraclePreparation();
  assert.equal(result.status, "PASS_LOCAL_CANONICAL_READ_ORACLE_PREPARATION");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.legacyCanProveCanonicalParity, false);
  assert.equal(result.sameDatabaseSnapshotRequired, true);
  assert.equal(result.canonicalReadAuthorized, false);
  assert.equal(result.automaticPhaseAdvance, false);
  assert.deepEqual(result.violations, []);
});

test("Legacy authority inflation and aggregate reuse fail governance", async () => {
  const contract = await loadCandidateCanonicalOracleContract();
  const legacy = structuredClone(contract);
  legacy.legacyBoundary.canProveCanonicalParity = true;
  assert.ok((await validateCandidateCanonicalOraclePreparation(legacy)).violations.includes(
    "legacy_boundary:canProveCanonicalParity",
  ));

  const oracle = structuredClone(contract);
  oracle.oracleBoundary.reusesMainAggregateResult = true;
  assert.ok((await validateCandidateCanonicalOraclePreparation(oracle)).violations.includes(
    "oracle_boundary",
  ));
});

test("weakened parity and false production claims fail governance", async () => {
  const contract = await loadCandidateCanonicalOracleContract();
  const parity = structuredClone(contract);
  parity.parityBoundary.maximumDifferences = 1;
  assert.ok((await validateCandidateCanonicalOraclePreparation(parity)).violations.includes(
    "parity_boundary",
  ));

  const production = structuredClone(contract);
  production.productionAuthorization = true;
  assert.ok((await validateCandidateCanonicalOraclePreparation(production)).violations.includes(
    "production_state_claim",
  ));
});
