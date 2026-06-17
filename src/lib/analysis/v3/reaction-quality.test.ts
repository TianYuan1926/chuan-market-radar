import assert from "node:assert/strict";
import test from "node:test";
import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import type {
  KeyLevel,
} from "./types";
import {
  evaluateV3ReactionQuality,
} from "./reaction-quality";
import {
  buildStrategyV3TrendContext,
} from "./trend-context";
import type {
  MarketSignal,
} from "../types";

function candle(index: number, input: Partial<Candle> & Pick<Candle, "close" | "high" | "low" | "open">): Candle {
  const openTime = new Date(Date.UTC(2026, 5, 17, 8, index)).toISOString();

  return {
    openTime,
    closeTime: new Date(Date.parse(openTime) + 59_000).toISOString(),
    volume: 100 + index * 12,
    ...input,
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
    updatedAt: "2026-06-17T08:00:00.000Z",
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

const longPullbackCandles: Candle[] = [
  candle(0, { open: 101, high: 103, low: 100.4, close: 102 }),
  candle(1, { open: 102, high: 102.4, low: 98.6, close: 99.4 }),
  candle(2, { open: 99.4, high: 101.8, low: 98.8, close: 101.3 }),
];

const shortRetestCandles: Candle[] = [
  candle(0, { open: 99, high: 99.4, low: 96.2, close: 97 }),
  candle(1, { open: 97, high: 101.4, low: 96.6, close: 100.4 }),
  candle(2, { open: 100.4, high: 101.2, low: 97.2, close: 97.8 }),
];

test("evaluateV3ReactionQuality confirms a long pullback when support is touched and reclaimed", () => {
  const result = evaluateV3ReactionQuality({
    candles: longPullbackCandles,
    currentPrice: 101.3,
    direction: "long",
    keyLevels: [
      level({ direction: "SUPPORT", zoneLow: 98, zoneHigh: 100 }),
    ],
  });

  assert.equal(result.status, "CONFIRMED");
  assert.equal(result.qualityScore >= 70, true);
  assert.equal(result.touchedLevelId, "TESTUSDT-15m-support");
  assert.match(result.summary, /回踩|承接/);
});

test("evaluateV3ReactionQuality confirms a short retest when resistance is touched and rejected", () => {
  const result = evaluateV3ReactionQuality({
    candles: shortRetestCandles,
    currentPrice: 97.8,
    direction: "short",
    keyLevels: [
      level({
        id: "TESTUSDT-15m-resistance",
        direction: "RESISTANCE",
        type: "RANGE_HIGH",
        zoneLow: 100,
        zoneHigh: 102,
        midPrice: 101,
      }),
    ],
  });

  assert.equal(result.status, "CONFIRMED");
  assert.equal(result.qualityScore >= 70, true);
  assert.equal(result.touchedLevelId, "TESTUSDT-15m-resistance");
  assert.match(result.summary, /反抽|承压/);
});

test("evaluateV3ReactionQuality marks a failed support reaction when price closes below the zone", () => {
  const result = evaluateV3ReactionQuality({
    candles: [
      candle(0, { open: 101, high: 102, low: 99, close: 100.5 }),
      candle(1, { open: 100.5, high: 101, low: 97, close: 97.4 }),
    ],
    currentPrice: 97.4,
    direction: "long",
    keyLevels: [
      level({ direction: "SUPPORT", zoneLow: 98, zoneHigh: 100 }),
    ],
  });

  assert.equal(result.status, "FAILED");
  assert.equal(result.qualityScore, 0);
  assert.ok(result.riskFlags.includes("support_lost"));
});

test("buildStrategyV3TrendContext exposes readonly reaction quality without creating a trade signal", () => {
  const context = buildStrategyV3TrendContext({
    candlesByTimeframe: {
      "15m": longPullbackCandles,
      "1h": longPullbackCandles,
    },
    currentPrice: 101.3,
    keyLevels: [
      level({ direction: "SUPPORT", zoneLow: 98, zoneHigh: 100 }),
      level({ direction: "RESISTANCE", zoneLow: 108, zoneHigh: 110, midPrice: 109, type: "RANGE_HIGH" }),
    ],
    signal: signal({ direction: "long" }),
    sourceTimeframes: ["15m", "1h"],
    symbol: "TESTUSDT",
  });

  assert.ok(context.reactionQuality);
  assert.equal(context.reactionQuality.status, "CONFIRMED");
  assert.equal(context.reactionQuality.hasTradeSignal, false);
  assert.equal(context.reactionQuality.allowedUse, "research_only");
});
