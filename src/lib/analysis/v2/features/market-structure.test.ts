import assert from "node:assert/strict";
import test from "node:test";

import type { Candle } from "../../../market/ohlcv/types";
import {
  analyzeMarketStructure,
  detectSwingPoints,
} from "./market-structure";
import {
  detectKeyLevels,
} from "./level-detector";

function candle(index: number, overrides: Partial<Candle> = {}): Candle {
  const base = 100 + index * 0.1;

  return {
    openTime: `2026-06-17T00:${String(index).padStart(2, "0")}:00.000Z`,
    open: base,
    high: base + 1,
    low: base - 1,
    close: base + 0.2,
    volume: 1_000,
    closeTime: `2026-06-17T00:${String(index).padStart(2, "0")}:59.999Z`,
    ...overrides,
  };
}

test("detectSwingPoints identifies local highs and lows as structure facts", () => {
  const swings = detectSwingPoints([
    candle(0, { high: 101, low: 99 }),
    candle(1, { high: 105, low: 100 }),
    candle(2, { high: 102, low: 96 }),
    candle(3, { high: 104, low: 101 }),
  ]);

  assert.deepEqual(swings.highs.map((point) => point.index), [1]);
  assert.deepEqual(swings.lows.map((point) => point.index), [2]);
});

test("market structure keeps compression inside range as neutral facts, not a long signal", () => {
  const candles = [
    candle(0, { high: 110, low: 90, close: 100 }),
    candle(1, { high: 108, low: 92, close: 101 }),
    candle(2, { high: 107, low: 93, close: 100.5 }),
    candle(3, { high: 106, low: 94, close: 101.5 }),
    candle(4, { high: 105, low: 95, close: 102 }),
  ];

  const structure = analyzeMarketStructure({
    symbol: "ENAUSDT",
    timeframe: "1h",
    candles,
    lookback: 4,
  });

  assert.equal(structure.state, "RANGE");
  assert.equal(structure.direction, "NEUTRAL");
  assert.equal(structure.hasTradeSignal, false);
  assert.equal(structure.range?.high, 110);
  assert.equal(structure.range?.low, 90);
});

test("market structure marks a breakout that closes back inside the range as invalidated", () => {
  const candles = [
    candle(0, { high: 110, low: 90, close: 100 }),
    candle(1, { high: 109, low: 92, close: 101 }),
    candle(2, { high: 108, low: 94, close: 102 }),
    candle(3, { high: 114, low: 103, close: 112 }),
    candle(4, { high: 111, low: 98, close: 104 }),
  ];

  const structure = analyzeMarketStructure({
    symbol: "ENAUSDT",
    timeframe: "1h",
    candles,
    lookback: 3,
  });

  assert.equal(structure.state, "INVALIDATED_BREAKOUT");
  assert.equal(structure.direction, "RISK");
  assert.equal(structure.hasTradeSignal, false);
  assert.match(structure.facts.join(" "), /fell back inside/i);
});

test("level detector exposes range high low and invalidation anchors without a trade decision", () => {
  const levels = detectKeyLevels({
    candles: [
      candle(0, { high: 110, low: 90, close: 100 }),
      candle(1, { high: 109, low: 92, close: 101 }),
      candle(2, { high: 108, low: 94, close: 102 }),
      candle(3, { high: 114, low: 103, close: 112 }),
    ],
    lookback: 3,
  });

  assert.deepEqual(levels, {
    rangeHigh: 110,
    rangeLow: 90,
    previousHigh: 108,
    previousLow: 94,
    breakoutLevel: 110,
    breakdownLevel: 90,
    bullishInvalidationLevel: 90,
    bearishInvalidationLevel: 110,
  });
});
