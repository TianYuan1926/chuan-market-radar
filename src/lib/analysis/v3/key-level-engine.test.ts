import assert from "node:assert/strict";
import test from "node:test";
import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import {
  buildKeyLevels,
} from "./key-level-engine";

function candle(index: number, high: number, low: number, close = (high + low) / 2): Candle {
  const minute = String(index).padStart(2, "0");

  return {
    openTime: `2026-06-17T08:${minute}:00.000Z`,
    closeTime: `2026-06-17T08:${minute}:59.999Z`,
    open: close,
    high,
    low,
    close,
    volume: 100 + index,
  };
}

const candles: Candle[] = [
  candle(0, 101, 96, 98),
  candle(1, 106, 97, 103),
  candle(2, 111, 99, 108),
  candle(3, 108, 95, 98),
  candle(4, 103, 90, 92),
  candle(5, 109, 94, 106),
  candle(6, 116, 101, 113),
  candle(7, 110, 96, 99),
  candle(8, 104, 88, 90),
  candle(9, 112, 92, 109),
  candle(10, 121, 103, 118),
  candle(11, 115, 98, 101),
  candle(12, 107, 87, 89),
  candle(13, 113, 93, 109),
  candle(14, 124, 105, 120),
  candle(15, 118, 100, 102),
];

test("buildKeyLevels creates price zones instead of single point levels", () => {
  const levels = buildKeyLevels({
    candles,
    currentPrice: 104,
    symbol: "TESTUSDT",
    timeframe: "4h",
  });

  assert.ok(levels.length > 0);
  assert.ok(levels.every((level) => level.zoneLow < level.zoneHigh));
  assert.ok(levels.every((level) => level.reasons.length > 0));
  assert.ok(levels.every((level) => level.confirmationRules.length > 0));
  assert.ok(levels.every((level) => level.invalidationRule.length > 0));
});

test("buildKeyLevels limits visible support and resistance zones", () => {
  const levels = buildKeyLevels({
    candles,
    currentPrice: 104,
    symbol: "TESTUSDT",
    timeframe: "4h",
  });
  const supports = levels.filter((level) => level.direction === "SUPPORT");
  const resistances = levels.filter((level) => level.direction === "RESISTANCE");

  assert.equal(supports.length <= 3, true);
  assert.equal(resistances.length <= 3, true);
});

test("buildKeyLevels marks a nearby zone as arrived", () => {
  const levels = buildKeyLevels({
    candles,
    currentPrice: 90,
    symbol: "TESTUSDT",
    timeframe: "4h",
  });

  assert.ok(levels.some((level) => level.direction === "SUPPORT" && level.status === "ARRIVED"));
});

test("buildKeyLevels marks a broken resistance after price closes above the zone", () => {
  const levels = buildKeyLevels({
    candles,
    currentPrice: 130,
    symbol: "TESTUSDT",
    timeframe: "4h",
  });

  assert.ok(levels.some((level) => level.direction === "RESISTANCE" && level.status === "BROKEN"));
});
