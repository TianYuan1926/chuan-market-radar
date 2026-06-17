import assert from "node:assert/strict";
import test from "node:test";
import type {
  MarketSignal,
} from "../types";
import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import {
  buildSignalTrendRadarV3Dossier,
} from "./current-signal-dossier";

function candle(index: number, close: number): Candle {
  const openTime = new Date(Date.UTC(2026, 5, 17, 8, index)).toISOString();

  return {
    openTime,
    closeTime: new Date(Date.parse(openTime) + 59_000).toISOString(),
    open: close - 0.4,
    high: close + (index % 3 === 0 ? 1.8 : 0.8),
    low: close - (index % 4 === 0 ? 1.6 : 0.7),
    close,
    volume: 100 + index * 10,
  };
}

function signal(overrides: Partial<MarketSignal> = {}): MarketSignal {
  return {
    id: "coinglass-BINANCE-ENAUSDT",
    symbol: "ENAUSDT",
    exchange: "BINANCE",
    direction: "long",
    state: "waiting_confirmation",
    timeframe: "15m",
    regime: "mixed",
    confidence: 74,
    risk: "medium",
    updatedAt: "2026-06-17T08:00:00.000Z",
    summary: "测试信号",
    evidence: [],
    strategy: {
      bias: "long",
      entry: "等待确认",
      invalidation: "跌回区间中部",
      targets: ["前高"],
      riskReward: 3.2,
      positionHint: "轻仓观察",
      status: "waiting",
    },
    ...overrides,
  };
}

const trendCandles = [10, 10.5, 11, 10.8, 10.2, 11.3, 12.1, 11.5, 10.7, 12.4, 13.1, 12.6, 11.8, 13.4]
  .map((close, index) => candle(index, close));
const downTrendCandles = [14, 13.7, 13.2, 13.5, 13.1, 12.7, 12.1, 12.4, 11.8, 11.2, 11.4, 10.8, 10.4, 10.1]
  .map((close, index) => candle(index, close));

test("buildSignalTrendRadarV3Dossier builds readonly key levels and forward map from existing OHLCV candles", () => {
  const dossier = buildSignalTrendRadarV3Dossier({
    candlesByTimeframe: {
      "1m": trendCandles,
      "15m": trendCandles,
      "30m": trendCandles,
      "1h": trendCandles.map((item) => ({ ...item, close: item.close + 0.5, high: item.high + 0.5, low: item.low + 0.5 })),
      "4h": trendCandles.map((item) => ({ ...item, close: item.close + 1, high: item.high + 1, low: item.low + 1 })),
    },
    currentPrice: 12.7,
    signal: signal(),
  });

  assert.ok(dossier);
  assert.equal(dossier.allowedUse, "research_only");
  assert.equal(dossier.canAutoAdjustWeights, false);
  assert.equal(dossier.canMutateLiveRanking, false);
  assert.equal(dossier.symbol, "ENAUSDT");
  assert.equal(dossier.currentPrice, 12.7);
  assert.deepEqual(dossier.sourceTimeframes, ["15m", "1h", "4h"]);
  assert.ok(dossier.keyLevels.length > 0);
  assert.ok(dossier.forwardLevels.length > 0);
  assert.ok(dossier.forwardLevels.some((level) => level.role === "INVALIDATION_LEVEL"));
  assert.ok(dossier.forwardLevels.some((level) => level.role === "TREND_CHANGE_LEVEL"));
  assert.ok(dossier.trendContext);
  assert.equal(dossier.trendContext.allowedUse, "research_only");
  assert.equal(dossier.trendContext.canAutoAdjustWeights, false);
  assert.equal(dossier.trendContext.canMutateLiveRanking, false);
  assert.equal(dossier.trendContext.state, "PRE_TREND_LONG");
  assert.equal(dossier.trendContext.decision, "WAIT_LONG_BREAKOUT");
  assert.equal(dossier.trendContext.scores.longPreTrendScore > dossier.trendContext.scores.shortPreTrendScore, true);
  assert.deepEqual(
    dossier.trendContext.timeframes.map((item) => item.timeframe),
    ["15m", "1h", "4h"],
  );
  assert.match(dossier.trendContext.summary, /多周期结构/);
});

test("buildSignalTrendRadarV3Dossier returns null when no usable trend timeframe candles exist", () => {
  const dossier = buildSignalTrendRadarV3Dossier({
    candlesByTimeframe: {
      "1m": trendCandles,
      "30m": trendCandles,
    },
    signal: signal(),
  });

  assert.equal(dossier, null);
});

test("buildSignalTrendRadarV3Dossier marks high and low timeframe structure conflict as readonly wait", () => {
  const dossier = buildSignalTrendRadarV3Dossier({
    candlesByTimeframe: {
      "15m": trendCandles,
      "4h": downTrendCandles,
    },
    currentPrice: 12.7,
    signal: signal(),
  });

  assert.ok(dossier);
  assert.ok(dossier.trendContext);
  assert.equal(dossier.trendContext.state, "CONFLICT");
  assert.equal(dossier.trendContext.decision, "CONFLICT_WAIT");
  assert.equal(dossier.trendContext.conflicts.length > 0, true);
  assert.match(dossier.trendContext.nextStep, /等待/);
});
