import assert from "node:assert/strict";
import test from "node:test";
import type {
  KeyLevel,
} from "./types";
import {
  buildForwardLevelMap,
} from "./forward-level-map";

function level(overrides: Partial<KeyLevel>): KeyLevel {
  const midPrice = overrides.midPrice ?? 100;

  return {
    id: overrides.id ?? `level-${midPrice}`,
    symbol: overrides.symbol ?? "TESTUSDT",
    timeframe: overrides.timeframe ?? "4h",
    type: overrides.type ?? (overrides.direction === "RESISTANCE" ? "SWING_HIGH" : "SWING_LOW"),
    zoneLow: overrides.zoneLow ?? midPrice - 1,
    zoneHigh: overrides.zoneHigh ?? midPrice + 1,
    midPrice,
    direction: overrides.direction ?? "SUPPORT",
    keyScore: overrides.keyScore ?? 70,
    reactionScore: overrides.reactionScore ?? 0,
    confluenceScore: overrides.confluenceScore ?? 50,
    status: overrides.status ?? "POTENTIAL",
    reasons: overrides.reasons ?? ["test level"],
    confirmationRules: overrides.confirmationRules ?? ["confirm with close acceptance"],
    invalidationRule: overrides.invalidationRule ?? "invalidated by close through zone",
  };
}

const levels: KeyLevel[] = [
  level({ id: "s1", direction: "SUPPORT", midPrice: 95, zoneLow: 94, zoneHigh: 96, keyScore: 82 }),
  level({ id: "s2", direction: "SUPPORT", midPrice: 88, zoneLow: 87, zoneHigh: 89, keyScore: 74 }),
  level({ id: "s3", direction: "SUPPORT", midPrice: 80, zoneLow: 79, zoneHigh: 81, keyScore: 68 }),
  level({ id: "r1", direction: "RESISTANCE", midPrice: 108, zoneLow: 107, zoneHigh: 109, keyScore: 84 }),
  level({ id: "r2", direction: "RESISTANCE", midPrice: 116, zoneLow: 115, zoneHigh: 117, keyScore: 76 }),
  level({ id: "r3", direction: "RESISTANCE", midPrice: 125, zoneLow: 124, zoneHigh: 126, keyScore: 70 }),
];

test("buildForwardLevelMap creates support and resistance ladders around current price", () => {
  const map = buildForwardLevelMap({
    currentPrice: 100,
    levels,
    symbol: "TESTUSDT",
  });

  assert.deepEqual(
    map.filter((item) => item.side === "SUPPORT").slice(0, 3).map((item) => item.sourceLevelIds[0]),
    ["s1", "s2", "s3"],
  );
  assert.deepEqual(
    map.filter((item) => item.side === "RESISTANCE").slice(0, 3).map((item) => item.sourceLevelIds[0]),
    ["r1", "r2", "r3"],
  );
});

test("buildForwardLevelMap includes invalidation and trend change roles", () => {
  const map = buildForwardLevelMap({
    currentPrice: 100,
    levels,
    symbol: "TESTUSDT",
  });

  assert.ok(map.some((item) => item.role === "INVALIDATION_LEVEL"));
  assert.ok(map.some((item) => item.role === "TREND_CHANGE_LEVEL"));
});

test("buildForwardLevelMap keeps levels ahead before future candles are reviewed", () => {
  const map = buildForwardLevelMap({
    currentPrice: 100,
    levels,
    symbol: "TESTUSDT",
  });

  assert.ok(map.every((item) => item.status === "AHEAD"));
});
