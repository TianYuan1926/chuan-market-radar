import assert from "node:assert/strict";
import test from "node:test";
import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import type {
  ForwardLevel,
} from "./types";
import {
  buildForwardMapReview,
} from "./forward-map-review";

function forwardLevel(overrides: Partial<ForwardLevel> = {}): ForwardLevel {
  return {
    id: "TESTUSDT-current-defense-s1",
    symbol: "TESTUSDT",
    side: "SUPPORT",
    role: "CURRENT_DEFENSE",
    zoneLow: 94,
    zoneHigh: 96,
    timeframeWeight: 0.75,
    keyScore: 82,
    status: "AHEAD",
    reasons: ["4H swing low"],
    confirmationRules: ["15m reclaim zoneHigh"],
    invalidationRules: ["1h close below zoneLow"],
    sourceLevelIds: ["s1"],
    ...overrides,
  };
}

function candle(index: number, high: number, low: number, close: number): Candle {
  const minute = String(index).padStart(2, "0");

  return {
    openTime: `2026-06-17T09:${minute}:00.000Z`,
    closeTime: `2026-06-17T09:${minute}:59.999Z`,
    open: close,
    high,
    low,
    close,
    volume: 100,
  };
}

test("buildForwardMapReview marks a support hit and reclaim as reaction confirmed", () => {
  const review = buildForwardMapReview({
    futureCandles: [
      candle(0, 100, 97, 98),
      candle(1, 98, 94.5, 95),
      candle(2, 101, 95.5, 99),
    ],
    levels: [forwardLevel()],
    observedAt: "2026-06-17T10:00:00.000Z",
    sourceId: "map-1",
    symbol: "TESTUSDT",
  });

  assert.equal(review.verdict, "reaction_confirmed");
  assert.equal(review.type, "forward_map_review");
  assert.equal(review.allowedUse, "research_only");
  assert.equal(review.canAutoAdjustWeights, false);
  assert.deepEqual(review.evidenceIds, ["TESTUSDT-current-defense-s1"]);
});

test("buildForwardMapReview marks a sliced-through support as invalidated", () => {
  const review = buildForwardMapReview({
    futureCandles: [
      candle(0, 98, 94.5, 95),
      candle(1, 96, 90, 91),
      candle(2, 93, 88, 89),
    ],
    levels: [forwardLevel()],
    observedAt: "2026-06-17T10:00:00.000Z",
    sourceId: "map-1",
    symbol: "TESTUSDT",
  });

  assert.equal(review.verdict, "invalidated");
});

test("buildForwardMapReview stays pending when no prebuilt level is reached", () => {
  const review = buildForwardMapReview({
    futureCandles: [
      candle(0, 110, 103, 105),
      candle(1, 112, 104, 108),
    ],
    levels: [forwardLevel()],
    observedAt: "2026-06-17T10:00:00.000Z",
    sourceId: "map-1",
    symbol: "TESTUSDT",
  });

  assert.equal(review.verdict, "pending");
});
