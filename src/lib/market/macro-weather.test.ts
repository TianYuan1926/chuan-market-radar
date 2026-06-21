import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal } from "../analysis/types";
import type { DerivativeSnapshot, MarketTicker } from "./types";
import { buildMacroWeather } from "./macro-weather";

const UPDATED_AT = "2026-06-17T08:00:00.000Z";

function ticker(symbol: string, changePercent24h: number): MarketTicker {
  return {
    changePercent24h,
    exchange: "BINANCE",
    high24h: 1,
    low24h: 1,
    price: 1,
    symbol,
    updatedAt: UPDATED_AT,
    volume24hUsd: 100_000_000,
  };
}

function derivative(
  symbol: string,
  overrides: Partial<DerivativeSnapshot> = {},
): DerivativeSnapshot {
  return {
    exchange: "BINANCE",
    fundingRate: 0.0001,
    fundingRateZScore: 0.2,
    liquidationUsd24h: 2_000_000,
    openInterestChangePercent: 2,
    openInterestUsd: 1_000_000_000,
    source: "coinglass",
    symbol,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function signal(symbol: string, changeHint: "up" | "down" | "flat" = "up"): MarketSignal {
  return {
    confidence: 70,
    direction: changeHint === "down" ? "short" : "long",
    evidence: [],
    exchange: "BINANCE",
    id: `${symbol}-15m`,
    regime: changeHint === "down" ? "risk_off" : "risk_on",
    risk: "medium",
    state: "waiting_confirmation",
    strategy: {
      bias: changeHint === "down" ? "short" : "long",
      entry: "等待确认",
      invalidation: "结构失效",
      positionHint: "轻仓观察",
      riskReward: 2,
      status: "waiting",
      targets: ["第一目标"],
    },
    summary: changeHint === "flat" ? "横盘观察" : "山寨异动",
    symbol,
    timeframe: "15m",
    updatedAt: UPDATED_AT,
  };
}

test("buildMacroWeather marks healthy BTC ETH advance as tailwind without mutating weights", () => {
  const report = buildMacroWeather({
    derivatives: [
      derivative("BTCUSDT", { fundingRateZScore: 0.3, openInterestChangePercent: 3 }),
      derivative("ETHUSDT", { fundingRateZScore: 0.1, openInterestChangePercent: 2 }),
    ],
    metadataStatus: "ready",
    signals: [
      signal("ENAUSDT", "up"),
      signal("SUIUSDT", "up"),
      signal("TIAUSDT", "down"),
    ],
    tickers: [
      ticker("BTCUSDT", 1.8),
      ticker("ETHUSDT", 1.5),
      ticker("ENAUSDT", 4.2),
      ticker("SUIUSDT", 2.1),
      ticker("TIAUSDT", -1.4),
    ],
  });

  assert.equal(report.primaryRegime, "tailwind");
  assert.equal(report.requestPolicy, "no_extra_requests");
  assert.equal(report.canMutateWeights, false);
  assert.equal(report.guidance.altcoinBias, "supportive");
  assert.ok((report.metrics.altcoinAdvanceDecline.breadthPercent ?? 0) > 0);
  assert.match(report.summary, /山寨/);
});

test("buildMacroWeather flags leverage crowded before treating a rally as clean tailwind", () => {
  const report = buildMacroWeather({
    derivatives: [
      derivative("BTCUSDT", { fundingRateZScore: 2.2, openInterestChangePercent: 13 }),
      derivative("ETHUSDT", { fundingRateZScore: 1.9, openInterestChangePercent: 11 }),
    ],
    metadataStatus: "ready",
    signals: [signal("ENAUSDT", "up")],
    tickers: [
      ticker("BTCUSDT", 2),
      ticker("ETHUSDT", 1.6),
      ticker("ENAUSDT", 6),
    ],
  });

  assert.equal(report.primaryRegime, "leverage_crowded");
  assert.equal(report.guidance.altcoinBias, "caution");
  assert.match(report.guidance.riskHint, /追/);
  assert.ok(report.evidence.some((item: { label: string }) => item.label.includes("资金")));
  assert.ok(report.evidence.some((item: { label: string }) => item.label.includes("OI")));
});

test("buildMacroWeather flags deleveraging when anchors fall with OI contraction or liquidations", () => {
  const report = buildMacroWeather({
    derivatives: [
      derivative("BTCUSDT", { liquidationUsd24h: 32_000_000, openInterestChangePercent: -7 }),
      derivative("ETHUSDT", { liquidationUsd24h: 11_000_000, openInterestChangePercent: -5 }),
    ],
    metadataStatus: "ready",
    signals: [signal("TIAUSDT", "down")],
    tickers: [
      ticker("BTCUSDT", -2),
      ticker("ETHUSDT", -1.8),
      ticker("TIAUSDT", -5),
    ],
  });

  assert.equal(report.primaryRegime, "deleveraging");
  assert.equal(report.guidance.altcoinBias, "defensive");
  assert.match(report.guidance.shortWeightHint, /反抽|确认/);
  assert.ok(report.metrics.liquidationUsd24h > 20_000_000);
});

test("buildMacroWeather adds BTC dominance and TOTAL2 TOTAL3 as altcoin macro anchors", () => {
  const report = buildMacroWeather({
    altcoinMacro: {
      btcDominance7dAveragePercent: 55,
      btcDominance30dAveragePercent: 56,
      btcDominancePercent: 54,
      ethDominancePercent: 16,
      source: "coingecko_global",
      total2ChangePercent24h: 2.4,
      total3ChangePercent24h: 3.1,
      totalMarketCapUsd: 2_000_000_000_000,
      updatedAt: UPDATED_AT,
    },
    derivatives: [
      derivative("BTCUSDT", { fundingRateZScore: 0.2, openInterestChangePercent: 2 }),
      derivative("ETHUSDT", { fundingRateZScore: 0.1, openInterestChangePercent: 2 }),
    ],
    metadataStatus: "ready",
    signals: [signal("ENAUSDT", "up")],
    tickers: [
      ticker("BTCUSDT", 0.4),
      ticker("ETHUSDT", 0.3),
      ticker("ENAUSDT", 3),
    ],
  });

  assert.equal(report.metrics.altcoinMacro?.btcDominanceTrend, "falling");
  assert.equal(report.metrics.altcoinMacro?.total2MarketCapUsd, 920_000_000_000);
  assert.equal(report.metrics.altcoinMacro?.total3MarketCapUsd, 600_000_000_000);
  assert.equal(report.metrics.altcoinMacro?.tone, "good");
  assert.ok(report.evidence.some((item) => item.label === "BTC.D"));
  assert.ok(report.evidence.some((item) => item.label === "TOTAL2/TOTAL3"));
  assert.match(report.summary, /BTC\.D/);
  assert.match(report.guidance.riskHint, /3:1/);
});

test("buildMacroWeather treats rising BTC dominance as an altcoin headwind without lowering RR rules", () => {
  const report = buildMacroWeather({
    altcoinMacro: {
      btcDominance7dAveragePercent: 55,
      btcDominance30dAveragePercent: 54,
      btcDominancePercent: 57,
      ethDominancePercent: 15,
      source: "coingecko_global",
      total2ChangePercent24h: -0.6,
      total3ChangePercent24h: -1.4,
      totalMarketCapUsd: 2_000_000_000_000,
      updatedAt: UPDATED_AT,
    },
    derivatives: [
      derivative("BTCUSDT", { fundingRateZScore: 0.1, openInterestChangePercent: 1 }),
      derivative("ETHUSDT", { fundingRateZScore: 0.1, openInterestChangePercent: 1 }),
    ],
    metadataStatus: "ready",
    signals: [signal("ENAUSDT", "up")],
    tickers: [
      ticker("BTCUSDT", 0.4),
      ticker("ETHUSDT", 0.2),
      ticker("ENAUSDT", 2),
    ],
  });

  assert.equal(report.primaryRegime, "headwind");
  assert.equal(report.metrics.altcoinMacro?.btcDominanceTrend, "rising");
  assert.equal(report.metrics.altcoinMacro?.tone, "bad");
  assert.match(report.guidance.longWeightHint, /BTC\.D/);
  assert.match(report.guidance.riskHint, /3:1/);
});

test("buildMacroWeather returns unknown when anchors are missing or scan is stale", () => {
  const report = buildMacroWeather({
    derivatives: [],
    metadataStatus: "stale",
    signals: [signal("ENAUSDT", "up")],
    tickers: [ticker("ENAUSDT", 3)],
  });

  assert.equal(report.primaryRegime, "unknown");
  assert.equal(report.guidance.altcoinBias, "wait");
  assert.match(report.summary, /等待/);
  assert.equal(report.anchors.length, 2);
});
