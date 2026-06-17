import assert from "node:assert/strict";
import test from "node:test";

import type {
  EvidenceItem,
} from "../evidence/evidence-types";
import {
  calculatePreMoveScore,
} from "./pre-move-score";
import {
  calculateRiskScore,
} from "./risk-score";

function evidence(overrides: Partial<EvidenceItem>): EvidenceItem {
  return {
    id: overrides.id ?? "ev",
    symbol: overrides.symbol ?? "ENAUSDT",
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
    createdAt: overrides.createdAt ?? "2026-06-17T00:00:00.000Z",
  };
}

test("risk score rises when OI spikes funding is high and price stalls", () => {
  const score = calculateRiskScore([
    evidence({ id: "oi", family: "DERIVATIVES", source: "oi_interpreter", label: "oi_spike_price_stall", direction: "RISK", strength: 84 }),
    evidence({ id: "funding", family: "DERIVATIVES", source: "funding_interpreter", label: "funding_crowding_risk", direction: "RISK", strength: 82 }),
    evidence({ id: "wick", family: "PRICE_STRUCTURE", source: "fakeout_risk", label: "price_stall_under_resistance", direction: "RISK", strength: 74 }),
  ]);

  assert.ok(score.score >= 70);
  assert.deepEqual(score.driverIds, ["oi", "funding", "wick"]);
});

test("pre move score rises for compression neutral funding and relative strength", () => {
  const score = calculatePreMoveScore([
    evidence({ id: "compression", family: "VOLUME_VOLATILITY", source: "range_compression", label: "bollinger_squeeze", direction: "NEUTRAL", strength: 82 }),
    evidence({ id: "funding", family: "DERIVATIVES", source: "funding_interpreter", label: "funding_neutral_context", direction: "NEUTRAL", strength: 55 }),
    evidence({ id: "rs", family: "RELATIVE_STRENGTH", source: "market_context", label: "btc_flat_altcoin_strong", direction: "BULLISH", strength: 78 }),
  ]);

  assert.ok(score.score >= 60);
  assert.deepEqual(score.driverIds, ["compression", "funding", "rs"]);
});
