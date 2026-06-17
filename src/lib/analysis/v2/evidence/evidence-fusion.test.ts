import assert from "node:assert/strict";
import test from "node:test";

import type {
  EvidenceItem,
} from "./evidence-types";
import {
  fuseEvidence,
} from "./evidence-fusion";

function evidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: overrides.id ?? "ev-base",
    symbol: overrides.symbol ?? "ENAUSDT",
    timeframe: overrides.timeframe ?? "1h",
    family: overrides.family ?? "PRICE_STRUCTURE",
    source: overrides.source ?? "market_structure",
    label: overrides.label ?? "range_reclaim",
    direction: overrides.direction ?? "BULLISH",
    strength: overrides.strength ?? 80,
    confidence: overrides.confidence ?? 80,
    weightHint: overrides.weightHint ?? 0.25,
    dataFreshness: overrides.dataFreshness ?? "fresh",
    fact: overrides.fact ?? "Structure reclaimed the range high.",
    reasoning: overrides.reasoning ?? "Structure evidence is primary.",
    createdAt: overrides.createdAt ?? "2026-06-17T00:00:00.000Z",
  };
}

test("evidence fusion caps technical indicators at fifteen percent", () => {
  const fused = fuseEvidence([
    evidence({ id: "rsi", family: "TECHNICAL_INDICATOR", source: "indicator_interpreter", label: "rsi_overbought", weightHint: 0.5 }),
    evidence({ id: "macd", family: "TECHNICAL_INDICATOR", source: "indicator_interpreter", label: "macd_cross", weightHint: 0.5 }),
    evidence({ id: "structure", family: "PRICE_STRUCTURE", weightHint: 0.35 }),
  ]);

  assert.equal(fused.familyWeights.TECHNICAL_INDICATOR, 0.15);
  assert.equal(fused.cappedFamilies.includes("TECHNICAL_INDICATOR"), true);
});

test("evidence fusion dedupes same source timeframe and label before weighting", () => {
  const fused = fuseEvidence([
    evidence({ id: "old-rsi", family: "TECHNICAL_INDICATOR", source: "indicator_interpreter", label: "rsi_context", strength: 45 }),
    evidence({ id: "new-rsi", family: "TECHNICAL_INDICATOR", source: "indicator_interpreter", label: "rsi_context", strength: 75 }),
  ]);

  assert.deepEqual(fused.weightedEvidence.map((item) => item.id), ["new-rsi"]);
});

test("evidence fusion keeps price structure above technical indicator influence", () => {
  const fused = fuseEvidence([
    evidence({ id: "structure", family: "PRICE_STRUCTURE", weightHint: 0.35, strength: 70 }),
    evidence({ id: "rsi", family: "TECHNICAL_INDICATOR", source: "indicator_interpreter", label: "rsi_context", weightHint: 0.6, strength: 95 }),
  ]);

  assert.equal(fused.dominantFamily, "PRICE_STRUCTURE");
  assert.ok(fused.familyWeights.PRICE_STRUCTURE > fused.familyWeights.TECHNICAL_INDICATOR);
});
