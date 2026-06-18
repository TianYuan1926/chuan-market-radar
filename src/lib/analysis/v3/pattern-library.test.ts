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

test("buildV3PatternLibrary detects ascending triangle compression as low-weight context", () => {
  const library = buildV3PatternLibrary({
    candlesByTimeframe: {
      "1h": [
        candle(0, { open: 9.8, high: 12.0, low: 9.0, close: 11.1 }),
        candle(1, { open: 11.1, high: 11.8, low: 9.4, close: 10.6 }),
        candle(2, { open: 10.6, high: 12.2, low: 9.8, close: 11.5 }),
        candle(3, { open: 11.5, high: 11.9, low: 10.2, close: 10.9 }),
        candle(4, { open: 10.9, high: 12.1, low: 10.7, close: 11.8 }),
        candle(5, { open: 11.8, high: 12.0, low: 11.0, close: 11.7 }),
      ],
    },
    sourceTimeframes: ["1h"],
    symbol: "TESTUSDT",
  });

  assert.equal(library.dominantPattern?.type, "ASCENDING_TRIANGLE");
  assert.equal(library.dominantPattern?.bias, "BULLISH_CONTEXT");
  assert.equal(library.hasTradeSignal, false);
  assert.equal(library.maxWeightPercent <= 10, true);
  assert.match(library.dominantPattern?.invalidationHint ?? "", /上升低点|低点/);
});

test("buildV3PatternLibrary detects fibonacci pullback only as location context", () => {
  const library = buildV3PatternLibrary({
    candlesByTimeframe: {
      "4h": [
        candle(0, { open: 10.0, high: 10.3, low: 9.8, close: 10.1 }),
        candle(1, { open: 10.1, high: 11.5, low: 10.0, close: 11.2 }),
        candle(2, { open: 11.2, high: 13.4, low: 11.0, close: 13.0 }),
        candle(3, { open: 13.0, high: 15.2, low: 12.8, close: 14.8 }),
        candle(4, { open: 14.8, high: 16.2, low: 14.4, close: 15.7 }),
        candle(5, { open: 15.7, high: 15.9, low: 13.0, close: 13.6 }),
      ],
    },
    sourceTimeframes: ["4h"],
    symbol: "TESTUSDT",
  });

  assert.equal(library.patterns.some((pattern) => pattern.type === "FIBONACCI_PULLBACK"), true);
  assert.equal(library.patterns.find((pattern) => pattern.type === "FIBONACCI_PULLBACK")?.hasTradeSignal, false);
  assert.match(
    library.patterns.find((pattern) => pattern.type === "FIBONACCI_PULLBACK")?.evidence.join(" / ") ?? "",
    /0\.382|0\.5|0\.618/,
  );
});

test("buildV3PatternLibrary detects head and shoulders as risk context only", () => {
  const library = buildV3PatternLibrary({
    candlesByTimeframe: {
      "1h": [
        candle(0, { open: 9.4, high: 10.0, low: 9.0, close: 9.8 }),
        candle(1, { open: 9.8, high: 12.0, low: 9.6, close: 11.2 }),
        candle(2, { open: 11.2, high: 10.8, low: 9.4, close: 9.8 }),
        candle(3, { open: 9.8, high: 14.2, low: 9.7, close: 13.2 }),
        candle(4, { open: 13.2, high: 11.2, low: 9.5, close: 10.1 }),
        candle(5, { open: 10.1, high: 12.2, low: 9.8, close: 11.1 }),
        candle(6, { open: 11.1, high: 10.9, low: 8.8, close: 9.0 }),
      ],
    },
    sourceTimeframes: ["1h"],
    symbol: "TESTUSDT",
  });

  assert.equal(library.dominantPattern?.type, "HEAD_AND_SHOULDERS");
  assert.equal(library.dominantPattern?.bias, "RISK_CONTEXT");
  assert.equal(library.dominantPattern?.hasTradeSignal, false);
  assert.match(library.summary, /低权重/);
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
