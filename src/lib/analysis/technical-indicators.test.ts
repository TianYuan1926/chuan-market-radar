import assert from "node:assert/strict";
import test from "node:test";
import { analyzeMarketAnomaly, type MarketAnomalyInput } from "./anomaly-engine";
import {
  atr,
  bollinger,
  buildIndicatorMatrix,
  buildTechnicalEvidence,
  ema,
  macd,
  rsi,
  swingPoints,
  volumeProfile,
  vwap,
} from "./technical-indicators";
import type { Candle } from "../market/ohlcv/types";

function candle(
  index: number,
  { close, high, low, open = close, volume = 100 }: {
    close: number;
    high: number;
    low: number;
    open?: number;
    volume?: number;
  },
): Candle {
  const openDate = new Date(Date.UTC(2026, 0, 1, 0, index));
  const closeDate = new Date(openDate.getTime() + 59_000);

  return {
    openTime: openDate.toISOString(),
    open,
    high,
    low,
    close,
    volume,
    closeTime: closeDate.toISOString(),
  };
}

const baseInput: MarketAnomalyInput = {
  id: "indicator-proof",
  symbol: "ENAUSDT",
  exchange: "BINANCE",
  timeframe: "15m",
  regime: "mixed",
  directionBias: "long",
  dataQualityScore: 0.9,
  priceChangePercent: 0.8,
  volumeRatio: 1.1,
  openInterestChangePercent: 1.2,
  fundingRateZScore: 0.2,
  volatilityCompressionPercentile: 45,
  liquidationUsd24h: 500_000,
  structureLocation: "middle",
  distanceToInvalidationPercent: 3.4,
  projectedMovePercent: 3.8,
  updatedAt: "2026-06-14T11:00:00.000+08:00",
};

test("ema returns deterministic smoothed values for a fixed close series", () => {
  assert.deepEqual(ema([10, 12, 14, 16], 3), [10, 11, 12.5, 14.25]);
});

test("rsi returns neutral near 50 for alternating gains and losses", () => {
  const values = rsi([10, 11, 10, 11, 10], 4);

  assert.equal(values.at(-1), 50);
});

test("atr increases when candle ranges expand", () => {
  const values = atr([
    candle(0, { high: 11, low: 10, close: 10.5 }),
    candle(1, { high: 11, low: 10, close: 10.5 }),
    candle(2, { high: 11, low: 10, close: 10.5 }),
    candle(3, { high: 14, low: 9, close: 12 }),
  ], 3);

  assert.equal(values[2], 1);
  assert.ok((values.at(-1) ?? 0) > 2);
});

test("bollinger width contracts on flat ranges and expands with dispersion", () => {
  const flat = bollinger([10, 10, 10, 10, 10], 5, 2).at(-1);
  const wide = bollinger([8, 9, 10, 11, 12], 5, 2).at(-1);

  assert.equal(flat?.width, 0);
  assert.ok((wide?.width ?? 0) > 0);
});

test("vwap weights typical price by volume", () => {
  const value = vwap([
    candle(0, { high: 11, low: 9, close: 10, volume: 100 }),
    candle(1, { high: 22, low: 18, close: 20, volume: 300 }),
  ]);

  assert.equal(value, 17.5);
});

test("macd identifies positive momentum on an accelerating close series", () => {
  const values = macd([10, 10.2, 10.5, 11, 11.7, 12.1], 3, 5, 3);
  const latest = values.at(-1);

  assert.ok(latest);
  assert.ok(latest.macd > 0);
  assert.ok(latest.signal > 0);
  assert.ok(latest.histogram > 0);
});

test("volumeProfile finds the high-volume price node without creating a trade signal", () => {
  const profile = volumeProfile([
    candle(0, { high: 10.2, low: 9.8, close: 10, volume: 50 }),
    candle(1, { high: 10.4, low: 10, close: 10.2, volume: 50 }),
    candle(2, { high: 12.2, low: 11.8, close: 12, volume: 300 }),
    candle(3, { high: 12.4, low: 11.9, close: 12, volume: 400 }),
    candle(4, { high: 12.5, low: 12, close: 12.2, volume: 200 }),
    candle(5, { high: 14.2, low: 13.8, close: 14, volume: 20 }),
  ], 4);

  assert.ok(profile);
  assert.equal(profile.pointOfControl, 12.5);
  assert.equal(profile.valueAreaLow, 12);
  assert.equal(profile.valueAreaHigh, 13);
  assert.equal(profile.totalVolume, 1020);
});

test("swingPoints identifies local highs and lows", () => {
  const points = swingPoints([
    candle(0, { high: 10, low: 9, close: 9.5 }),
    candle(1, { high: 13, low: 10, close: 12 }),
    candle(2, { high: 11, low: 8, close: 9 }),
    candle(3, { high: 14, low: 11, close: 13 }),
    candle(4, { high: 12, low: 7, close: 8 }),
  ], 1);

  assert.deepEqual(points.highs.map((point) => point.index), [1, 3]);
  assert.deepEqual(points.lows.map((point) => point.index), [2]);
});

test("buildIndicatorMatrix summarizes each available timeframe with momentum and volume nodes", () => {
  const candles = [
    candle(0, { high: 10.5, low: 9.5, close: 10, volume: 100 }),
    candle(1, { high: 10.7, low: 9.8, close: 10.4, volume: 120 }),
    candle(2, { high: 11.2, low: 10.2, close: 10.9, volume: 130 }),
    candle(3, { high: 11.8, low: 10.6, close: 11.4, volume: 160 }),
    candle(4, { high: 12.4, low: 11.1, close: 12, volume: 220 }),
    candle(5, { high: 12.7, low: 11.8, close: 12.2, volume: 260 }),
  ];
  const matrix = buildIndicatorMatrix({
    "15m": candles,
    "1h": candles.map((item, index) => candle(index, {
      high: item.high + 1,
      low: item.low + 1,
      close: item.close + 1,
      volume: item.volume + 50,
    })),
  });

  assert.deepEqual(matrix.map((frame) => frame.timeframe), ["15m", "1h"]);
  assert.ok(matrix.every((frame) => frame.macdBias === "bullish"));
  assert.ok(matrix.every((frame) => frame.volumeProfile));
});

test("buildTechnicalEvidence turns candles into indicator evidence without issuing a trade signal", () => {
  const candles = [
    candle(0, { high: 10.5, low: 9.5, close: 10, volume: 100 }),
    candle(1, { high: 10.7, low: 9.8, close: 10.4, volume: 120 }),
    candle(2, { high: 11.2, low: 10.2, close: 10.9, volume: 130 }),
    candle(3, { high: 11.8, low: 10.6, close: 11.4, volume: 160 }),
    candle(4, { high: 12.4, low: 11.1, close: 12, volume: 220 }),
    candle(5, { high: 12.7, low: 11.8, close: 12.2, volume: 260 }),
  ];
  const indicatorEvidence = buildTechnicalEvidence({ "15m": candles });
  const signal = analyzeMarketAnomaly({
    ...baseInput,
    indicatorEvidence,
  });

  assert.ok(indicatorEvidence.some((item) => item.label === "EMA 结构"));
  assert.ok(indicatorEvidence.some((item) => item.label === "RSI 动能"));
  assert.ok(indicatorEvidence.some((item) => item.label === "MACD 动能"));
  assert.ok(indicatorEvidence.some((item) => item.label === "成交量分布"));
  assert.ok(indicatorEvidence.every((item) => item.layer === "indicators"));
  assert.ok(signal.evidence.some((item) => item.label === "EMA 结构"));
  assert.equal(signal.state, "abnormal_watch");
});

test("buildTechnicalEvidence adds a compact multi-timeframe indicator matrix", () => {
  const candles = [
    candle(0, { high: 10.5, low: 9.5, close: 10, volume: 100 }),
    candle(1, { high: 10.7, low: 9.8, close: 10.4, volume: 120 }),
    candle(2, { high: 11.2, low: 10.2, close: 10.9, volume: 130 }),
    candle(3, { high: 11.8, low: 10.6, close: 11.4, volume: 160 }),
    candle(4, { high: 12.4, low: 11.1, close: 12, volume: 220 }),
    candle(5, { high: 12.7, low: 11.8, close: 12.2, volume: 260 }),
  ];
  const indicatorEvidence = buildTechnicalEvidence({
    "15m": candles,
    "1h": candles.map((item, index) => candle(index, {
      high: item.high + 1,
      low: item.low + 1,
      close: item.close + 1,
      volume: item.volume + 50,
    })),
  });
  const matrixEvidence = indicatorEvidence.find((item) => item.label === "多周期指标矩阵");

  assert.ok(matrixEvidence);
  assert.match(matrixEvidence.value, /15m/);
  assert.match(matrixEvidence.value, /1h/);
  assert.equal(matrixEvidence.polarity, "supportive");
});
