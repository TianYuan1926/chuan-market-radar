import assert from "node:assert/strict";
import test from "node:test";
import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import type {
  KeyLevel,
  MarketReadingContext,
  MarketReadingEventType,
  TrendTimeframeContext,
} from "./types";
import {
  evaluateV3TrendIntegrity,
} from "./trend-integrity";
import {
  buildStrategyV3TrendContext,
} from "./trend-context";
import type {
  MarketSignal,
} from "../types";

function candle(index: number, input: Partial<Candle> & Pick<Candle, "close" | "high" | "low" | "open">): Candle {
  const openTime = new Date(Date.UTC(2026, 5, 17, 9, index)).toISOString();

  return {
    openTime,
    closeTime: new Date(Date.parse(openTime) + 59_000).toISOString(),
    volume: 100 + index * 20,
    ...input,
  };
}

function reading(structure: MarketReadingContext["structure"], eventTypes: MarketReadingEventType[]): MarketReadingContext {
  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    events: eventTypes.map((type, index) => ({
      candleIndex: index + 1,
      detail: `test ${type}`,
      occurredAt: new Date(Date.UTC(2026, 5, 17, 9, index)).toISOString(),
      price: 100 + index,
      type,
    })),
    latestClose: 108,
    range: {
      high: 110,
      low: 96,
      widthPercent: 12.96,
    },
    structure,
    summary: "test reading",
    swingHighCount: 3,
    swingLowCount: 3,
    symbol: "TESTUSDT",
    timeframe: "15m",
  };
}

function timeframe(structure: TrendTimeframeContext["structure"]): TrendTimeframeContext {
  return {
    changePercent: structure === "DOWNTREND" ? -8 : structure === "UPTREND" ? 8 : 0.8,
    close: 108,
    compressionScore: structure === "COMPRESSING" ? 76 : 30,
    directionalScore: structure === "RANGE" ? 28 : 72,
    rangePercent: 14,
    structure,
    timeframe: "15m",
  };
}

function level(overrides: Partial<KeyLevel>): KeyLevel {
  return {
    id: "TESTUSDT-15m-support",
    symbol: "TESTUSDT",
    timeframe: "15m",
    type: "RANGE_LOW",
    zoneLow: 98,
    zoneHigh: 100,
    midPrice: 99,
    direction: "SUPPORT",
    keyScore: 82,
    reactionScore: 0,
    confluenceScore: 70,
    status: "POTENTIAL",
    reasons: ["test key level"],
    confirmationRules: ["test confirmation"],
    invalidationRule: "test invalidation",
    ...overrides,
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
    confidence: 72,
    risk: "medium",
    updatedAt: "2026-06-17T09:00:00.000Z",
    summary: "测试信号",
    evidence: [],
    strategy: {
      bias: "long",
      entry: "等待确认",
      invalidation: "结构失效",
      targets: ["前方压力"],
      riskReward: 3,
      positionHint: "观察",
      status: "waiting",
    },
    ...overrides,
  };
}

const healthyLongCandles: Candle[] = [
  candle(0, { open: 100, high: 102, low: 98.8, close: 101.5 }),
  candle(1, { open: 101.5, high: 104, low: 100.8, close: 103.2 }),
  candle(2, { open: 103.2, high: 105.4, low: 102.4, close: 104.8 }),
  candle(3, { open: 104.8, high: 108, low: 104, close: 107.2 }),
];

test("evaluateV3TrendIntegrity marks HH/HL alignment as a healthy readonly long trend", () => {
  const result = evaluateV3TrendIntegrity({
    candles: healthyLongCandles,
    direction: "long",
    marketReadings: [reading("UP_SEQUENCE", ["HH", "HL", "BOS_UP"])],
    timeframes: [timeframe("UPTREND")],
  });

  assert.equal(result.status, "HEALTHY_TREND");
  assert.equal(result.hasTradeSignal, false);
  assert.equal(result.allowedUse, "research_only");
  assert.equal(result.integrityScore >= 70, true);
  assert.match(result.summary, /HH\/HL|趋势完整/);
});

test("evaluateV3TrendIntegrity marks a long trend as damaged when structure breaks down", () => {
  const result = evaluateV3TrendIntegrity({
    candles: healthyLongCandles,
    direction: "long",
    marketReadings: [reading("DOWN_SEQUENCE", ["LL", "CHOCH_DOWN"])],
    timeframes: [timeframe("DOWNTREND")],
  });

  assert.equal(result.status, "DAMAGED_TREND");
  assert.equal(result.integrityScore, 0);
  assert.ok(result.riskFlags.includes("bull_structure_broken"));
});

test("evaluateV3TrendIntegrity does not kill a long setup because of stale lower-timeframe LL when higher context recovered", () => {
  const result = evaluateV3TrendIntegrity({
    candles: healthyLongCandles,
    direction: "long",
    marketReadings: [
      reading("DOWN_SEQUENCE", ["LL"]),
      reading("UP_SEQUENCE", ["HH", "HL", "BOS_UP"]),
    ],
    timeframes: [timeframe("UPTREND"), timeframe("RANGE")],
  });

  assert.notEqual(result.status, "DAMAGED_TREND");
  assert.equal(result.riskFlags.includes("bull_structure_broken"), false);
  assert.ok(result.integrityScore > 0);
});

test("evaluateV3TrendIntegrity marks long structure repair pending instead of hard kill when repair evidence exists", () => {
  const result = evaluateV3TrendIntegrity({
    candles: healthyLongCandles,
    direction: "long",
    marketReadings: [
      reading("DOWN_SEQUENCE", ["LL", "CHOCH_DOWN"]),
      reading("UP_SEQUENCE", ["HH", "HL"]),
    ],
    timeframes: [timeframe("DOWNTREND"), timeframe("COMPRESSING")],
  });

  assert.equal(result.status, "STRUCTURE_REPAIR_PENDING");
  assert.equal(result.riskFlags.includes("bull_structure_broken"), false);
  assert.ok(result.riskFlags.includes("structure_repair_pending"));
  assert.match(result.summary, /修复等待/);
});

test("evaluateV3TrendIntegrity does not kill a short setup because of stale lower-timeframe HH when higher context rolled over", () => {
  const result = evaluateV3TrendIntegrity({
    candles: [
      candle(0, { open: 108, high: 109, low: 106, close: 107 }),
      candle(1, { open: 107, high: 108, low: 103, close: 104 }),
      candle(2, { open: 104, high: 105, low: 101, close: 102 }),
      candle(3, { open: 102, high: 103, low: 98, close: 99 }),
    ],
    direction: "short",
    marketReadings: [
      reading("UP_SEQUENCE", ["HH"]),
      reading("DOWN_SEQUENCE", ["LH", "LL", "BOS_DOWN"]),
    ],
    timeframes: [timeframe("DOWNTREND"), timeframe("RANGE")],
  });

  assert.notEqual(result.status, "DAMAGED_TREND");
  assert.equal(result.riskFlags.includes("bear_structure_broken"), false);
  assert.ok(result.integrityScore > 0);
});

test("evaluateV3TrendIntegrity marks short structure repair pending instead of hard kill when repair evidence exists", () => {
  const result = evaluateV3TrendIntegrity({
    candles: [
      candle(0, { open: 108, high: 109, low: 106, close: 107 }),
      candle(1, { open: 107, high: 108, low: 103, close: 104 }),
      candle(2, { open: 104, high: 105, low: 101, close: 102 }),
      candle(3, { open: 102, high: 103, low: 98, close: 99 }),
    ],
    direction: "short",
    marketReadings: [
      reading("UP_SEQUENCE", ["HH", "CHOCH_UP"]),
      reading("DOWN_SEQUENCE", ["LH", "LL"]),
    ],
    timeframes: [timeframe("UPTREND"), timeframe("COMPRESSING")],
  });

  assert.equal(result.status, "STRUCTURE_REPAIR_PENDING");
  assert.equal(result.riskFlags.includes("bear_structure_broken"), false);
  assert.ok(result.riskFlags.includes("structure_repair_pending"));
  assert.match(result.summary, /修复等待/);
});

test("evaluateV3TrendIntegrity treats fake breakout as exhaustion risk, not as a short signal", () => {
  const result = evaluateV3TrendIntegrity({
    candles: healthyLongCandles,
    direction: "long",
    marketReadings: [reading("UP_SEQUENCE", ["HH", "HL", "FAKE_BREAKOUT"])],
    timeframes: [timeframe("UPTREND")],
  });

  assert.equal(result.status, "EXHAUSTION_RISK");
  assert.equal(result.hasTradeSignal, false);
  assert.ok(result.riskFlags.includes("upper_wick_exhaustion"));
});

test("buildStrategyV3TrendContext exposes readonly trend integrity without changing live ranking", () => {
  const context = buildStrategyV3TrendContext({
    candlesByTimeframe: {
      "15m": healthyLongCandles,
      "1h": healthyLongCandles,
    },
    currentPrice: 107.2,
    keyLevels: [
      level({ direction: "SUPPORT", zoneLow: 98, zoneHigh: 100 }),
      level({ direction: "RESISTANCE", zoneLow: 126, zoneHigh: 130, midPrice: 128, type: "RANGE_HIGH" }),
    ],
    signal: signal({ direction: "long" }),
    sourceTimeframes: ["15m", "1h"],
    symbol: "TESTUSDT",
  });

  assert.ok(context.trendIntegrity);
  assert.equal(context.trendIntegrity.hasTradeSignal, false);
  assert.equal(context.trendIntegrity.canMutateLiveRanking, false);
  assert.equal(context.trendIntegrity.allowedUse, "research_only");
});
