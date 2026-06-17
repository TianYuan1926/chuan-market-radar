import assert from "node:assert/strict";
import test from "node:test";
import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import {
  buildV3PatternLibrary,
} from "./pattern-library";

function candle(index: number, input: Pick<Candle, "close" | "high" | "low" | "open">): Candle {
  const openTime = new Date(Date.UTC(2026, 5, 17, 11, index)).toISOString();

  return {
    openTime,
    closeTime: new Date(Date.parse(openTime) + 59_000).toISOString(),
    volume: 100 + index * 18,
    ...input,
  };
}

test("buildV3PatternLibrary detects a double bottom only as low-weight bullish context", () => {
  const library = buildV3PatternLibrary({
    candlesByTimeframe: {
      "15m": [
        candle(0, { open: 101, high: 102, low: 99, close: 100 }),
        candle(1, { open: 100, high: 101, low: 95, close: 97 }),
        candle(2, { open: 97, high: 101, low: 96.5, close: 100.5 }),
        candle(3, { open: 100.5, high: 102, low: 95.4, close: 98 }),
        candle(4, { open: 98, high: 104, low: 97.8, close: 103.2 }),
      ],
    },
    sourceTimeframes: ["15m"],
    symbol: "TESTUSDT",
  });

  assert.equal(library.allowedUse, "research_only");
  assert.equal(library.canMutateLiveRanking, false);
  assert.equal(library.hasTradeSignal, false);
  assert.equal(library.maxWeightPercent <= 10, true);
  assert.equal(library.dominantPattern?.type, "DOUBLE_BOTTOM");
  assert.equal(library.dominantPattern?.bias, "BULLISH_CONTEXT");
});

test("buildV3PatternLibrary detects a double top only as risk or bearish context", () => {
  const library = buildV3PatternLibrary({
    candlesByTimeframe: {
      "15m": [
        candle(0, { open: 99, high: 101, low: 98, close: 100 }),
        candle(1, { open: 100, high: 108, low: 99, close: 106 }),
        candle(2, { open: 106, high: 107, low: 101, close: 102 }),
        candle(3, { open: 102, high: 108.4, low: 101, close: 107.2 }),
        candle(4, { open: 107.2, high: 107.5, low: 100, close: 101.2 }),
      ],
    },
    sourceTimeframes: ["15m"],
    symbol: "TESTUSDT",
  });

  assert.equal(library.dominantPattern?.type, "DOUBLE_TOP");
  assert.equal(library.dominantPattern?.bias, "BEARISH_CONTEXT");
  assert.equal(library.hasTradeSignal, false);
});

test("buildV3PatternLibrary stays neutral when the pattern is too weak", () => {
  const library = buildV3PatternLibrary({
    candlesByTimeframe: {
      "15m": [
        candle(0, { open: 100, high: 101, low: 99, close: 100.5 }),
        candle(1, { open: 100.5, high: 102, low: 100, close: 101.4 }),
        candle(2, { open: 101.4, high: 103, low: 101, close: 102.3 }),
      ],
    },
    sourceTimeframes: ["15m"],
    symbol: "TESTUSDT",
  });

  assert.equal(library.dominantPattern, null);
  assert.match(library.summary, /未识别|等待/);
});
