import assert from "node:assert/strict";
import test from "node:test";
import {
  CONSTITUTIONAL_INVARIANTS,
  OPPORTUNITY_DIRECTIONS_BY_FAMILY,
  OPPORTUNITY_FAMILIES,
  OPPORTUNITY_PATTERNS,
  OPPORTUNITY_PATTERNS_BY_FAMILY,
  PRODUCT_CONSTITUTION,
  TARGET_VENUES,
} from "./product-constitution";
import {
  ACTION_STATES,
  CANDIDATE_PRIORITIES,
  EVIDENCE_GRADES,
  SETUP_GRADES,
  STATE_DIMENSIONS,
  USER_FITS,
} from "./states";
import { UNCERTAINTY_DIMENSIONS } from "./uncertainty";

test("freezes the exact market scope and opportunity families", () => {
  assert.deepEqual(TARGET_VENUES, [
    "BINANCE_FUTURES",
    "OKX_SWAP",
    "BYBIT_LINEAR_PERPETUAL",
  ]);
  assert.equal(OPPORTUNITY_FAMILIES.length, 6);
  assert.equal(PRODUCT_CONSTITUTION.schemaVersion, "market-radar-v2-domain.v2");
  assert.equal(PRODUCT_CONSTITUTION.opportunityFamilies[0], "PRE_MOVE");
  assert.equal(new Set(OPPORTUNITY_PATTERNS).size, OPPORTUNITY_PATTERNS.length);
  assert.deepEqual(OPPORTUNITY_PATTERNS_BY_FAMILY.REVERSAL_RANGE, [
    "KEY_LEVEL_REVERSAL",
    "RANGE_EDGE",
  ]);
  assert.deepEqual(OPPORTUNITY_PATTERNS_BY_FAMILY.RELATIVE_STRENGTH, [
    "RELATIVE_STRENGTH",
    "RELATIVE_WEAKNESS",
  ]);
  assert.deepEqual(OPPORTUNITY_PATTERNS_BY_FAMILY.DERIVATIVES_FLOW, [
    "PRICE_OI_DIVERGENCE",
    "CROWDING_RELEASE",
    "FUNDING_BASIS_DISLOCATION",
  ]);
  assert.deepEqual(OPPORTUNITY_DIRECTIONS_BY_FAMILY.PRE_MOVE, [
    "LONG",
    "SHORT",
    "UNKNOWN",
  ]);
  assert.deepEqual(OPPORTUNITY_DIRECTIONS_BY_FAMILY.BREAKOUT_RETEST, [
    "LONG",
    "SHORT",
  ]);
});

test("keeps the five state dimensions independent", () => {
  assert.deepEqual(STATE_DIMENSIONS, {
    actionState: ACTION_STATES,
    candidatePriority: CANDIDATE_PRIORITIES,
    evidenceGrade: EVIDENCE_GRADES,
    setupGrade: SETUP_GRADES,
    userFit: USER_FITS,
  });
  assert.equal(new Set(Object.values(STATE_DIMENSIONS).flat()).size, 21);
});

test("freezes four uncertainty dimensions and permanent safety rules", () => {
  assert.deepEqual(UNCERTAINTY_DIMENSIONS, [
    "data",
    "model",
    "market",
    "execution",
  ]);
  assert.equal(CONSTITUTIONAL_INVARIANTS.automaticTradingAllowed, false);
  assert.equal(CONSTITUTIONAL_INVARIANTS.frontendMayCreateTradingFacts, false);
  assert.equal(CONSTITUTIONAL_INVARIANTS.futureOutcomeMayAffectOriginalDecision, false);
  assert.equal(CONSTITUTIONAL_INVARIANTS.minimumStructuralRewardRisk, 3);
});
