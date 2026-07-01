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
const breakoutCandles = [
  { close: 9.4, high: 10.5, low: 8.9, open: 9.2 },
  { close: 10.8, high: 11, low: 9.2, open: 9.4 },
  { close: 9.6, high: 10.5, low: 9, open: 10.8 },
  { close: 11.8, high: 12.2, low: 9.8, open: 9.6 },
  { close: 10.4, high: 11.6, low: 9.6, open: 11.8 },
  { close: 12.6, high: 12.8, low: 10.2, open: 10.4 },
].map((item, index) => ({
  ...candle(index, item.close),
  ...item,
}));
const fakeBreakoutCandles = [
  { close: 10.5, high: 11, low: 9.8, open: 10 },
  { close: 11.8, high: 12, low: 10, open: 10.5 },
  { close: 10.8, high: 11.5, low: 10.2, open: 11.8 },
  { close: 11.2, high: 11.7, low: 10.4, open: 10.8 },
  { close: 11.4, high: 13, low: 10.9, open: 11.2 },
].map((item, index) => ({
  ...candle(index, item.close),
  ...item,
}));

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
  assert.equal(dossier.trendContext.riskGate.allowed, false);
  assert.ok(dossier.trendContext.locationRiskReward);
  assert.equal(dossier.trendContext.locationRiskReward.isTradeEligible, false);
  assert.ok(dossier.trendContext.riskGate.blockedBy.includes("reward_risk_below_minimum"));
  assert.match(dossier.trendContext.noParticipationReasons.join(" / "), /盈亏比|追入/);
  assert.equal(dossier.trendContext.scores.longPreTrendScore > dossier.trendContext.scores.shortPreTrendScore, true);
  assert.deepEqual(
    dossier.trendContext.timeframes.map((item) => item.timeframe),
    ["15m", "1h", "4h"],
  );
  assert.deepEqual(
    dossier.trendContext.marketReadings?.map((item) => item.timeframe),
    ["15m", "1h", "4h"],
  );
  assert.equal(dossier.trendContext.marketReadings?.some((item) =>
    item.events.some((event) => event.type === "HH" || event.type === "BOS_UP")
  ), true);
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
  assert.equal(dossier.trendContext.riskGate.allowed, false);
  assert.equal(dossier.trendContext.conflicts.length > 0, true);
  assert.match(dossier.trendContext.noParticipationReasons.join(" / "), /周期冲突/);
  assert.match(dossier.trendContext.nextStep, /等待/);
});

test("buildSignalTrendRadarV3Dossier promotes market-reading BOS into readonly long breakout state", () => {
  const dossier = buildSignalTrendRadarV3Dossier({
    candlesByTimeframe: {
      "15m": breakoutCandles,
      "1h": breakoutCandles,
    },
    currentPrice: 12.6,
    signal: signal(),
  });

  assert.ok(dossier);
  assert.ok(dossier.trendContext);
  assert.equal(dossier.trendContext.state, "LONG_BREAKOUT");
  assert.equal(dossier.trendContext.decision, "WAIT_LONG_PULLBACK");
  assert.equal(dossier.trendContext.marketReadings?.some((reading) =>
    reading.events.some((event) => event.type === "BOS_UP")
  ), true);
  assert.equal(dossier.keyLevels.some((level) =>
    level.type === "ROLE_FLIP" &&
    level.direction === "SUPPORT" &&
    level.zoneHigh < 12.6
  ), true);
  assert.match(dossier.trendContext.nextStep, /回踩|承接/);
});

test("buildSignalTrendRadarV3Dossier blocks upper-wick fake breakout as readonly avoid-chase state", () => {
  const dossier = buildSignalTrendRadarV3Dossier({
    candlesByTimeframe: {
      "15m": fakeBreakoutCandles,
      "1h": fakeBreakoutCandles,
    },
    currentPrice: 11.4,
    signal: signal(),
  });

  assert.ok(dossier);
  assert.ok(dossier.trendContext);
  assert.equal(dossier.trendContext.state, "LONG_EXHAUSTION");
  assert.equal(dossier.trendContext.decision, "AVOID_CHASE_LONG");
  assert.equal(dossier.trendContext.riskGate.allowed, false);
  assert.match(dossier.trendContext.noParticipationReasons.join(" / "), /假突破|追高/);
});
