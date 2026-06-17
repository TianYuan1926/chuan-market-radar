import assert from "node:assert/strict";
import test from "node:test";
import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import {
  buildMarketReadingContext,
} from "./market-reading-engine";

function candle(index: number, open: number, high: number, low: number, close: number, volume = 100): Candle {
  const openTime = new Date(Date.UTC(2026, 5, 17, 8, index)).toISOString();

  return {
    openTime,
    closeTime: new Date(Date.parse(openTime) + 59_000).toISOString(),
    open,
    high,
    low,
    close,
    volume,
  };
}

test("buildMarketReadingContext extracts HH HL and bullish BOS as readonly facts", () => {
  const reading = buildMarketReadingContext({
    candles: [
      candle(0, 9.2, 10.5, 8.9, 9.4),
      candle(1, 9.4, 11.0, 9.2, 10.8),
      candle(2, 10.8, 10.5, 9.0, 9.6),
      candle(3, 9.6, 12.2, 9.8, 11.8),
      candle(4, 11.8, 11.6, 9.6, 10.4),
      candle(5, 10.4, 12.8, 10.2, 12.6, 180),
    ],
    symbol: "ENAUSDT",
    timeframe: "15m",
  });

  assert.equal(reading.allowedUse, "research_only");
  assert.equal(reading.canMutateLiveRanking, false);
  assert.equal(reading.structure, "UP_SEQUENCE");
  assert.equal(reading.range.high, 12.2);
  assert.equal(reading.range.low, 8.9);
  assert.deepEqual(
    reading.events.map((event) => event.type),
    ["HH", "HL", "BOS_UP"],
  );
  assert.match(reading.summary, /HH\/HL/);
});

test("buildMarketReadingContext marks upper-wick fake breakout without issuing a direction", () => {
  const reading = buildMarketReadingContext({
    candles: [
      candle(0, 10.0, 11.0, 9.8, 10.5),
      candle(1, 10.5, 12.0, 10.0, 11.8),
      candle(2, 11.8, 11.5, 10.2, 10.8),
      candle(3, 10.8, 11.7, 10.4, 11.2),
      candle(4, 11.2, 13.0, 10.9, 11.4, 230),
    ],
    symbol: "SUIUSDT",
    timeframe: "1h",
  });

  assert.equal(reading.allowedUse, "research_only");
  assert.equal(reading.structure, "RANGE_SEQUENCE");
  assert.equal(reading.events.some((event) => event.type === "FAKE_BREAKOUT"), true);
  assert.match(reading.summary, /假突破风险/);
  assert.equal(reading.canAutoAdjustWeights, false);
});
