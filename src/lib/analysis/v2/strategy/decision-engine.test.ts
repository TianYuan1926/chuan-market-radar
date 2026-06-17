import assert from "node:assert/strict";
import test from "node:test";

import type {
  EvidenceItem,
} from "../evidence/evidence-types";
import {
  decideStrategy,
} from "./decision-engine";

function evidence(overrides: Partial<EvidenceItem>): EvidenceItem {
  return {
    id: overrides.id ?? "ev",
    symbol: "ENAUSDT",
    timeframe: overrides.timeframe ?? "1h",
    family: overrides.family ?? "PRICE_STRUCTURE",
    source: overrides.source ?? "market_structure",
    label: overrides.label ?? "default",
    direction: overrides.direction ?? "NEUTRAL",
    strength: overrides.strength ?? 70,
    confidence: overrides.confidence ?? 80,
    weightHint: overrides.weightHint ?? 0.1,
    dataFreshness: overrides.dataFreshness ?? "fresh",
    fact: overrides.fact ?? "fact",
    reasoning: overrides.reasoning ?? "reason",
    createdAt: "2026-06-17T00:00:00.000Z",
  };
}

test("golden case 1: compression inside range waits without direction", () => {
  const result = decideStrategy({
    evidence: [
      evidence({ id: "range", label: "range_inside", family: "PRICE_STRUCTURE", direction: "NEUTRAL" }),
      evidence({ id: "compression", label: "range_compression", family: "VOLUME_VOLATILITY", direction: "NEUTRAL" }),
    ],
    scores: { preMove: 52, energy: 20, risk: 25, trendHold: 0, energyDecay: 0 },
  });

  assert.equal(result.stage, "COMPRESSION");
  assert.equal(result.decision, "WATCH_ONLY");
});

test("golden case 2: accumulation prepares only after confirmation requirements remain", () => {
  const result = decideStrategy({
    evidence: [
      evidence({ id: "stable", label: "accumulation_higher_lows", direction: "NEUTRAL" }),
      evidence({ id: "funding", label: "funding_neutral_context", family: "DERIVATIVES", source: "funding_interpreter", direction: "NEUTRAL" }),
      evidence({ id: "rs", label: "relative_strength_altcoin", family: "RELATIVE_STRENGTH", source: "market_context", direction: "BULLISH" }),
    ],
    scores: { preMove: 58, energy: 35, risk: 30, trendHold: 0, energyDecay: 0 },
  });

  assert.equal(result.stage, "ACCUMULATION");
  assert.equal(result.decision, "PREPARE_LONG");
  assert.match(result.entryPlan.waitFor, /breakout|pullback/i);
});

test("golden case 3: pre breakout waits for actual breakout", () => {
  const result = decideStrategy({
    evidence: [
      evidence({ id: "edge", label: "pre_breakout_range_edge", direction: "NEUTRAL" }),
      evidence({ id: "compression", label: "range_compression", family: "VOLUME_VOLATILITY", direction: "NEUTRAL" }),
    ],
    scores: { preMove: 66, energy: 48, risk: 40, trendHold: 0, energyDecay: 0 },
  });

  assert.equal(result.stage, "PRE_BREAKOUT");
  assert.equal(result.decision, "WAIT_BREAKOUT");
});

test("golden case 4: quality breakout can confirm long with rr and risk gates clean", () => {
  const result = decideStrategy({
    evidence: [
      evidence({ id: "breakout", label: "breakout_close_above_range", direction: "BULLISH" }),
      evidence({ id: "volume", label: "volume_expansion_close_strong", family: "VOLUME_VOLATILITY", direction: "BULLISH" }),
      evidence({ id: "rr", label: "location_rr_clean", family: "LOCATION_RR", source: "location_rr", direction: "BULLISH" }),
    ],
    rewardRisk: 3.4,
    scores: { preMove: 72, energy: 72, risk: 45, trendHold: 0, energyDecay: 0 },
  });

  assert.equal(result.stage, "BREAKOUT_CONFIRM");
  assert.equal(result.decision, "BREAKOUT_CONFIRM_LONG");
  assert.equal(result.riskGate.allowed, true);
});

test("golden case 5: high risk breakout avoids chase", () => {
  const result = decideStrategy({
    evidence: [
      evidence({ id: "breakout", label: "breakout_extended", direction: "BULLISH" }),
      evidence({ id: "oi", label: "oi_spike_price_stall", family: "DERIVATIVES", source: "oi_interpreter", direction: "RISK" }),
      evidence({ id: "funding", label: "funding_crowding_risk", family: "DERIVATIVES", source: "funding_interpreter", direction: "RISK" }),
    ],
    rewardRisk: 1.8,
    scores: { preMove: 70, energy: 68, risk: 76, trendHold: 0, energyDecay: 60 },
  });

  assert.equal(result.stage, "EXHAUSTION_RISK");
  assert.equal(result.decision, "AVOID_CHASE");
  assert.deepEqual(result.riskGate.blockedBy, ["reward_risk_below_minimum", "risk_score_high"]);
});

test("golden case 6: RSI overbought with healthy trend manages trend, not short", () => {
  const result = decideStrategy({
    evidence: [
      evidence({ id: "trend", label: "trend_hh_hl_intact", direction: "BULLISH" }),
      evidence({ id: "rsi", label: "rsi_overbought_context", family: "TECHNICAL_INDICATOR", source: "indicator_interpreter", direction: "RISK" }),
    ],
    scores: { preMove: 30, energy: 60, risk: 45, trendHold: 70, energyDecay: 30 },
  });

  assert.equal(result.decision, "TREND_HOLD");
  assert.notEqual(result.decision, "EXIT_RISK");
});

test("golden case 7: OI spike with price stall becomes exhaustion risk", () => {
  const result = decideStrategy({
    evidence: [
      evidence({ id: "oi", label: "oi_spike_price_stall", family: "DERIVATIVES", source: "oi_interpreter", direction: "RISK" }),
      evidence({ id: "wick", label: "price_stall_under_resistance", source: "fakeout_risk", direction: "RISK" }),
    ],
    scores: { preMove: 40, energy: 30, risk: 68, trendHold: 0, energyDecay: 62 },
  });

  assert.equal(result.stage, "EXHAUSTION_RISK");
  assert.equal(result.decision, "AVOID_CHASE");
});

test("golden case 8: reward risk below three blocks trade signal", () => {
  const result = decideStrategy({
    evidence: [evidence({ id: "rr", label: "reward_risk_below_minimum", family: "LOCATION_RR", source: "location_rr", direction: "RISK" })],
    rewardRisk: 2.2,
    scores: { preMove: 70, energy: 70, risk: 50, trendHold: 0, energyDecay: 0 },
  });

  assert.equal(result.decision, "NO_SETUP");
  assert.deepEqual(result.riskGate.blockedBy, ["reward_risk_below_minimum"]);
});

test("golden case 9: failed breakout is invalidated", () => {
  const result = decideStrategy({
    evidence: [evidence({ id: "failed", label: "invalidated_breakout_fell_back_inside_range", source: "fakeout_risk", direction: "RISK" })],
    structureInvalidated: true,
    scores: { preMove: 0, energy: 0, risk: 80, trendHold: 0, energyDecay: 0 },
  });

  assert.equal(result.stage, "INVALIDATED");
  assert.equal(result.decision, "INVALIDATED");
});

test("golden case 10: high level exhaustion triggers take profit management", () => {
  const result = decideStrategy({
    evidence: [
      evidence({ id: "decay", label: "energy_decay_divergence", family: "VOLUME_VOLATILITY", direction: "RISK" }),
      evidence({ id: "funding", label: "funding_crowding_risk", family: "DERIVATIVES", source: "funding_interpreter", direction: "RISK" }),
    ],
    scores: { preMove: 20, energy: 55, risk: 65, trendHold: 55, energyDecay: 76 },
  });

  assert.equal(result.stage, "EXHAUSTION_RISK");
  assert.equal(result.decision, "TAKE_PROFIT_MANAGE");
  assert.ok(result.exitPlan.actions.includes("take_profit_manage"));
});

test("golden case 11: low timeframe bullish under high timeframe resistance is conflict", () => {
  const result = decideStrategy({
    evidence: [
      evidence({ id: "lt", timeframe: "15m", label: "small_timeframe_breakout", direction: "BULLISH" }),
      evidence({ id: "htf", timeframe: "4h", label: "higher_timeframe_resistance_nearby", family: "LOCATION_RR", source: "location_rr", direction: "RISK" }),
    ],
    hasHighTimeframeConflict: true,
    rewardRisk: 2.4,
    scores: { preMove: 65, energy: 60, risk: 58, trendHold: 0, energyDecay: 0 },
  });

  assert.equal(result.stage, "CONFLICT");
  assert.equal(result.decision, "CONFLICT");
});

test("golden case 12: BTC risk off does not one-cut an independently strong altcoin", () => {
  const result = decideStrategy({
    evidence: [
      evidence({ id: "macro", label: "btc_eth_risk_off", family: "MARKET_REGIME", source: "market_context", direction: "RISK" }),
      evidence({ id: "rs", label: "relative_strength_altcoin", family: "RELATIVE_STRENGTH", source: "market_context", direction: "BULLISH" }),
      evidence({ id: "range", label: "range_holds", direction: "NEUTRAL" }),
    ],
    scores: { preMove: 62, energy: 45, risk: 52, trendHold: 0, energyDecay: 0 },
  });

  assert.equal(result.stage, "PRE_BREAKOUT");
  assert.equal(result.decision, "WAIT_BREAKOUT");
});

test("golden case 13: stale data idles the system", () => {
  const result = decideStrategy({
    evidence: [evidence({ id: "stale", label: "stale_ohlcv", dataFreshness: "stale", direction: "NEUTRAL" })],
    staleData: true,
    scores: { preMove: 0, energy: 0, risk: 0, trendHold: 0, energyDecay: 0 },
  });

  assert.equal(result.stage, "IDLE");
  assert.equal(result.decision, "WATCH_ONLY");
});

test("golden case 14: liquidation heatmap concepts are not accepted as decision inputs", () => {
  const result = decideStrategy({
    evidence: [evidence({ id: "normal", label: "range_compression", family: "VOLUME_VOLATILITY", direction: "NEUTRAL" })],
    ignoredExternalInputs: ["Liquidation Heatmap"],
    scores: { preMove: 50, energy: 0, risk: 20, trendHold: 0, energyDecay: 0 },
  });

  assert.equal(result.stage, "COMPRESSION");
  assert.equal(result.ignoredExternalInputs, 1);
  assert.equal(result.decision, "WATCH_ONLY");
});
