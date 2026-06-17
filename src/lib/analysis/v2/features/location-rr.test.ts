import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateLocationRiskReward,
} from "./location-rr";

test("location rr blocks otherwise bullish structure when reward risk is below three to one", () => {
  const facts = evaluateLocationRiskReward({
    direction: "long",
    entry: 100,
    stop: 96,
    targets: [108],
    minRewardRisk: 3,
  });

  assert.equal(facts.rewardRisk, 2);
  assert.equal(facts.isTradeEligible, false);
  assert.deepEqual(facts.riskFlags, ["reward_risk_below_minimum"]);
  assert.equal(facts.hasTradeSignal, false);
});

test("location rr marks low timeframe long near higher timeframe resistance as location risk", () => {
  const facts = evaluateLocationRiskReward({
    direction: "long",
    entry: 99.8,
    stop: 96,
    targets: [112],
    higherTimeframeResistance: 100.5,
    minRewardRisk: 3,
  });

  assert.equal(facts.nearestBarrier, 100.5);
  assert.equal(facts.isTradeEligible, false);
  assert.deepEqual(facts.riskFlags, ["higher_timeframe_resistance_nearby", "reward_risk_below_minimum"]);
  assert.equal(facts.hasTradeSignal, false);
});

test("location rr accepts a clean long only as eligibility facts, not a strategy decision", () => {
  const facts = evaluateLocationRiskReward({
    direction: "long",
    entry: 100,
    stop: 96,
    targets: [116],
    minRewardRisk: 3,
  });

  assert.equal(facts.rewardRisk, 4);
  assert.equal(facts.isTradeEligible, true);
  assert.deepEqual(facts.riskFlags, []);
  assert.equal(facts.hasTradeSignal, false);
});
