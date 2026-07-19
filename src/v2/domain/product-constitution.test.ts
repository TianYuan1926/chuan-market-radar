import assert from "node:assert/strict";
import test from "node:test";
import {
  CONSTITUTIONAL_INVARIANTS,
  OPPORTUNITY_FAMILIES,
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
  assert.equal(PRODUCT_CONSTITUTION.opportunityFamilies[0], "PRE_MOVE");
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
