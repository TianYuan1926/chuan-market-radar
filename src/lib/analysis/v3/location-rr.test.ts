import assert from "node:assert/strict";
import test from "node:test";
import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import type {
  KeyLevel,
} from "./types";
import {
  evaluateV3LocationRiskReward,
} from "./location-rr";
import {
  buildStrategyV3TrendContext,
} from "./trend-context";
import type {
  MarketSignal,
} from "../types";

function level(overrides: Partial<KeyLevel>): KeyLevel {
  return {
    id: "TESTUSDT-4h-range",
    symbol: "TESTUSDT",
    timeframe: "4h",
    type: "RANGE_LOW",
    zoneLow: 98,
    zoneHigh: 99,
    midPrice: 98.5,
    direction: "SUPPORT",
    keyScore: 80,
    reactionScore: 0,
    confluenceScore: 70,
    status: "POTENTIAL",
    reasons: ["test structure level"],
    confirmationRules: ["test confirmation"],
    invalidationRule: "test invalidation",
    ...overrides,
  };
}

function candle(index: number, close: number): Candle {
  const openTime = new Date(Date.UTC(2026, 5, 17, 8, index)).toISOString();

  return {
    openTime,
    closeTime: new Date(Date.parse(openTime) + 59_000).toISOString(),
    open: close - 0.2,
    high: close + 0.6,
    low: close - 0.6,
    close,
    volume: 100 + index,
  };
}

function signal(overrides: Partial<MarketSignal> = {}): MarketSignal {
  return {
    id: "coinglass-BINANCE-TESTUSDT",
    symbol: "TESTUSDT",
    exchange: "BINANCE",
    direction: "long",
    state: "waiting_confirmation",
    timeframe: "15m",
    regime: "mixed",
    confidence: 70,
    risk: "medium",
    updatedAt: "2026-06-17T08:00:00.000Z",
    summary: "测试信号",
    evidence: [],
    strategy: {
      bias: "long",
      entry: "等待确认",
      invalidation: "跌回结构支撑",
      targets: ["前高"],
      riskReward: 3,
      positionHint: "轻仓观察",
      status: "waiting",
    },
    ...overrides,
  };
}

const trendCandles = [98, 99, 100, 101, 100.4, 102.2, 101.6, 103.8]
  .map((close, index) => candle(index, close));

test("evaluateV3LocationRiskReward blocks long setups when the nearest resistance leaves reward risk below three", () => {
  const result = evaluateV3LocationRiskReward({
    currentPrice: 100,
    direction: "long",
    keyLevels: [
      level({ direction: "SUPPORT", zoneLow: 96, zoneHigh: 98, midPrice: 97, type: "RANGE_LOW" }),
      level({ direction: "RESISTANCE", zoneLow: 105, zoneHigh: 107, midPrice: 106, type: "RANGE_HIGH" }),
    ],
  });

  assert.equal(result.isTradeEligible, false);
  assert.equal(result.rewardRisk, 1.25);
  assert.equal(result.structuralStop, 96);
  assert.equal(result.nearestTarget, 105);
  assert.ok(result.riskFlags.includes("reward_risk_below_minimum"));
  assert.equal(result.waitEntryPrice, 98.25);
  assert.equal(result.waitEntryReason, "wait_for_minimum_rr");
  assert.equal(result.waitEntryRewardRisk, 3);
  assert.equal(result.waitEntryStopDistancePercent, 2.29);
  assert.match(result.summary, /3:1|盈亏比/);
  assert.match(result.summary, /等待 98\.25/);
});

test("evaluateV3LocationRiskReward accepts long setups with a nearby structural stop and distant target", () => {
  const result = evaluateV3LocationRiskReward({
    currentPrice: 100,
    direction: "long",
    keyLevels: [
      level({ direction: "SUPPORT", zoneLow: 98, zoneHigh: 99, midPrice: 98.5, type: "RANGE_LOW" }),
      level({ direction: "RESISTANCE", zoneLow: 110, zoneHigh: 112, midPrice: 111, type: "RANGE_HIGH" }),
    ],
  });

  assert.equal(result.isTradeEligible, true);
  assert.equal(result.rewardRisk, 5);
  assert.equal(result.positionQuality, "GOOD_LOCATION");
  assert.deepEqual(result.riskFlags, []);
});

test("evaluateV3LocationRiskReward uses the first traceable target that satisfies 3R instead of killing a setup at the nearest minor resistance", () => {
  const result = evaluateV3LocationRiskReward({
    currentPrice: 100,
    direction: "long",
    keyLevels: [
      level({ direction: "SUPPORT", id: "support", zoneLow: 98, zoneHigh: 99, midPrice: 98.5, type: "RANGE_LOW" }),
      level({ direction: "RESISTANCE", id: "minor-resistance", zoneLow: 103, zoneHigh: 104, midPrice: 103.5, type: "SWING_HIGH" }),
      level({ direction: "RESISTANCE", id: "major-resistance", zoneLow: 108, zoneHigh: 110, midPrice: 109, type: "RANGE_HIGH" }),
    ],
  });

  assert.equal(result.isTradeEligible, true);
  assert.equal(result.nearestTarget, 108);
  assert.equal(result.rewardRisk, 4);
  assert.equal(result.targetLevelId, "major-resistance");
  assert.deepEqual(result.riskFlags, []);
});

test("evaluateV3LocationRiskReward blocks shorts when nearby support destroys downside reward", () => {
  const result = evaluateV3LocationRiskReward({
    currentPrice: 100,
    direction: "short",
    keyLevels: [
      level({ direction: "RESISTANCE", zoneLow: 103, zoneHigh: 104, midPrice: 103.5, type: "RANGE_HIGH" }),
      level({ direction: "SUPPORT", zoneLow: 96, zoneHigh: 98, midPrice: 97, type: "RANGE_LOW" }),
    ],
  });

  assert.equal(result.isTradeEligible, false);
  assert.equal(result.rewardRisk, 0.5);
  assert.equal(result.waitEntryPrice, 102.5);
  assert.equal(result.waitEntryReason, "wait_for_minimum_rr");
  assert.equal(result.waitEntryRewardRisk, 3);
  assert.equal(result.waitEntryStopDistancePercent, 1.46);
  assert.ok(result.riskFlags.includes("reward_risk_below_minimum"));
  assert.match(result.summary, /等待 102\.5/);
});

test("evaluateV3LocationRiskReward proposes a closer long entry when stop distance is too wide but RR is still valid", () => {
  const result = evaluateV3LocationRiskReward({
    currentPrice: 107.2,
    direction: "long",
    keyLevels: [
      level({ direction: "SUPPORT", zoneLow: 100, zoneHigh: 102, midPrice: 101, type: "RANGE_LOW" }),
      level({ direction: "RESISTANCE", zoneLow: 130, zoneHigh: 132, midPrice: 131, type: "RANGE_HIGH" }),
    ],
  });

  assert.equal(result.isTradeEligible, false);
  assert.equal(result.rewardRisk, 3.17);
  assert.equal(result.waitEntryPrice, 106.38);
  assert.equal(result.waitEntryReason, "wait_for_closer_structural_stop");
  assert.equal(result.waitEntryRewardRisk, 3.7);
  assert.equal(result.waitEntryStopDistancePercent, 6);
  assert.ok(result.riskFlags.includes("stop_distance_too_wide"));
  assert.ok(result.riskFlags.includes("chase_risk"));
  assert.match(result.summary, /等待 106\.38/);
});

test("evaluateV3LocationRiskReward uses deeper support for shorts when the nearest support is only TP1 noise", () => {
  const result = evaluateV3LocationRiskReward({
    currentPrice: 100,
    direction: "short",
    keyLevels: [
      level({ direction: "RESISTANCE", id: "resistance", zoneLow: 101, zoneHigh: 102, midPrice: 101.5, type: "RANGE_HIGH" }),
      level({ direction: "SUPPORT", id: "minor-support", zoneLow: 96, zoneHigh: 98, midPrice: 97, type: "SWING_LOW" }),
      level({ direction: "SUPPORT", id: "major-support", zoneLow: 91, zoneHigh: 93, midPrice: 92, type: "RANGE_LOW" }),
    ],
  });

  assert.equal(result.isTradeEligible, true);
  assert.equal(result.nearestTarget, 93);
  assert.equal(result.rewardRisk, 3.5);
  assert.equal(result.targetLevelId, "major-support");
  assert.deepEqual(result.riskFlags, []);
});

test("buildStrategyV3TrendContext folds location reward risk into the readonly risk gate", () => {
  const context = buildStrategyV3TrendContext({
    candlesByTimeframe: {
      "15m": trendCandles,
      "1h": trendCandles,
    },
    currentPrice: 100,
    keyLevels: [
      level({ direction: "SUPPORT", zoneLow: 96, zoneHigh: 98, midPrice: 97, type: "RANGE_LOW" }),
      level({ direction: "RESISTANCE", zoneLow: 105, zoneHigh: 107, midPrice: 106, type: "RANGE_HIGH" }),
    ],
    signal: signal({ direction: "long" }),
    sourceTimeframes: ["15m", "1h"],
    symbol: "TESTUSDT",
  });

  assert.ok(context.locationRiskReward);
  assert.equal(context.locationRiskReward.isTradeEligible, false);
  assert.equal(context.riskGate.allowed, false);
  assert.ok(context.riskGate.blockedBy.includes("reward_risk_below_minimum"));
  assert.match(context.noParticipationReasons.join(" / "), /盈亏比/);
});

test("buildStrategyV3TrendContext treats range-idle structure as soft wait when RR and hard gates are clean", () => {
  const rangeCandles = [100, 100.8, 99.6, 100.5, 99.8, 100.7, 100.1, 100.4]
    .map((close, index) => ({
      ...candle(index, close),
      high: close + 0.12,
      low: close - 0.38,
      open: close - 0.16,
    }));
  const context = buildStrategyV3TrendContext({
    candlesByTimeframe: {
      "15m": rangeCandles,
      "1h": rangeCandles,
    },
    currentPrice: 100,
    keyLevels: [
      level({ direction: "SUPPORT", id: "support", zoneLow: 98, zoneHigh: 99, midPrice: 98.5, type: "RANGE_LOW" }),
      level({ direction: "RESISTANCE", id: "target", zoneLow: 110, zoneHigh: 112, midPrice: 111, type: "RANGE_HIGH" }),
    ],
    signal: signal({ direction: "long" }),
    sourceTimeframes: ["15m", "1h"],
    symbol: "TESTUSDT",
  });

  assert.equal(context.locationRiskReward?.isTradeEligible, true);
  assert.ok(context.state === "RANGE_IDLE" || context.state === "RANGE_COMPRESSION");
  assert.ok(context.noParticipationReasons.some((reason) =>
    reason.includes("结构优势不足") || reason.includes("区间压缩")
  ));
  assert.equal(context.riskGate.allowed, true);
  assert.equal(context.riskGate.blockedBy.some((reason) => reason.includes("结构优势不足")), false);
});
