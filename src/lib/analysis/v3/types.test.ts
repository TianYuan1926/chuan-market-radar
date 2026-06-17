import assert from "node:assert/strict";
import test from "node:test";
import type {
  ForwardLevel,
  KeyLevel,
  TrendRadarReview,
  TrendScores,
} from "./types";

test("v3 key level schema uses zones and status instead of single-point levels", () => {
  const level: KeyLevel = {
    id: "BTCUSDT-4h-range-high",
    symbol: "BTCUSDT",
    timeframe: "4h",
    type: "RANGE_HIGH",
    zoneLow: 81800,
    zoneHigh: 83200,
    midPrice: 82500,
    direction: "RESISTANCE",
    keyScore: 84,
    reactionScore: 0,
    confluenceScore: 70,
    status: "POTENTIAL",
    reasons: ["4H range high"],
    confirmationRules: ["4H close above zoneHigh and retest holds"],
    invalidationRule: "4H close back below zoneLow after breakout",
  };

  assert.equal(level.zoneLow < level.zoneHigh, true);
  assert.equal(level.midPrice, 82500);
  assert.equal(level.status, "POTENTIAL");
});

test("v3 forward level schema can represent prebuilt support and resistance maps", () => {
  const forwardLevel: ForwardLevel = {
    id: "BTCUSDT-4h-support-s1",
    symbol: "BTCUSDT",
    side: "SUPPORT",
    role: "CURRENT_DEFENSE",
    zoneLow: 59000,
    zoneHigh: 59800,
    timeframeWeight: 0.75,
    keyScore: 82,
    status: "AHEAD",
    reasons: ["4H swing low", "range low reaction"],
    confirmationRules: ["15m reclaim zoneHigh", "1h higher low"],
    invalidationRules: ["1h close below zoneLow"],
    sourceLevelIds: ["level-1"],
  };

  assert.equal(forwardLevel.side, "SUPPORT");
  assert.equal(forwardLevel.role, "CURRENT_DEFENSE");
  assert.equal(forwardLevel.status, "AHEAD");
});

test("v3 scores support both long and short trend-switch paths", () => {
  const scores: TrendScores = {
    longPreTrendScore: 78,
    shortPreTrendScore: 22,
    longTrendEnergyScore: 64,
    shortTrendEnergyScore: 18,
    riskScore: 28,
    trendHoldScore: 41,
    exhaustionScore: 16,
  };

  assert.equal(scores.longPreTrendScore > scores.shortPreTrendScore, true);
});

test("v3 review samples stay readonly until manual calibration", () => {
  const review: TrendRadarReview = {
    id: "review-BTCUSDT-forward-map",
    type: "forward_map_review",
    symbol: "BTCUSDT",
    sourceId: "map-1",
    verdict: "reaction_confirmed",
    detail: "Price reached S1 and reclaimed the zone high.",
    observedAt: "2026-06-17T08:00:00.000Z",
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    evidenceIds: ["support-s1"],
  };

  assert.equal(review.allowedUse, "research_only");
  assert.equal(review.canAutoAdjustWeights, false);
});
