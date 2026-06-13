import assert from "node:assert/strict";
import test from "node:test";
import { analyzeMarketAnomaly, type MarketAnomalyInput } from "./anomaly-engine";
import {
  buildTimeframeProfile,
  summarizeTimeframeAgreement,
  timeframeRoleMap,
  type TimeframeProfileFrame,
} from "./timeframe-profile";

const baseInput: MarketAnomalyInput = {
  id: "ena-mtf",
  symbol: "ENAUSDT",
  exchange: "BINANCE",
  timeframe: "15m",
  regime: "mixed",
  directionBias: "long",
  dataQualityScore: 0.94,
  priceChangePercent: 3.2,
  volumeRatio: 2.1,
  openInterestChangePercent: 8.4,
  fundingRateZScore: 0.2,
  volatilityCompressionPercentile: 16,
  liquidationUsd24h: 8_200_000,
  structureLocation: "breakout_edge",
  distanceToInvalidationPercent: 1.2,
  projectedMovePercent: 4.8,
  triggerHint: "15m 放量突破后回踩不破",
  invalidationHint: "跌回突破结构内部",
  targetHints: ["前高流动性区", "4H 供给下沿"],
  updatedAt: "2026-06-14T10:00:00.000+08:00",
};

function frame(
  timeframe: TimeframeProfileFrame["timeframe"],
  alignment: TimeframeProfileFrame["alignment"],
  weight = 60,
): TimeframeProfileFrame {
  return {
    timeframe,
    alignment,
    weight,
    note: `${timeframe} ${alignment}`,
  };
}

test("timeframeRoleMap keeps execution, anomaly, structure, and regime roles explicit", () => {
  assert.equal(timeframeRoleMap["1m"], "execution");
  assert.equal(timeframeRoleMap["5m"], "execution");
  assert.equal(timeframeRoleMap["15m"], "anomaly");
  assert.equal(timeframeRoleMap["30m"], "anomaly");
  assert.equal(timeframeRoleMap["1h"], "structure");
  assert.equal(timeframeRoleMap["4h"], "structure");
  assert.equal(timeframeRoleMap["1d"], "regime");
  assert.equal(timeframeRoleMap["1w"], "regime");
});

test("buildTimeframeProfile summarizes support, conflict, missing roles, and dominant role", () => {
  const profile = buildTimeframeProfile([
    frame("1m", "support", 45),
    frame("5m", "support", 50),
    frame("15m", "support", 80),
    frame("30m", "neutral", 20),
    frame("1h", "conflict", 70),
  ]);
  const summary = summarizeTimeframeAgreement(profile);

  assert.deepEqual(profile.supportTimeframes, ["1m", "5m", "15m"]);
  assert.deepEqual(profile.conflictTimeframes, ["1h"]);
  assert.deepEqual(profile.missingRoles, ["regime"]);
  assert.equal(profile.dominantRole, "anomaly");
  assert.equal(summary, "多周期支持 3 个，冲突 1 个，缺失 regime；主导证据来自 anomaly。");
});

test("analyzeMarketAnomaly downgrades low-timeframe triggers that lack structure support", () => {
  const profile = buildTimeframeProfile([
    frame("1m", "support", 80),
    frame("5m", "support", 76),
    frame("15m", "support", 70),
    frame("30m", "neutral", 20),
    frame("1h", "conflict", 72),
    frame("4h", "neutral", 20),
  ]);

  const signal = analyzeMarketAnomaly({
    ...baseInput,
    timeframeProfile: profile,
  });

  assert.equal(signal.state, "waiting_confirmation");
  assert.notEqual(signal.state, "no_trade");
  assert.ok(signal.confidence < 74);
  assert.ok(signal.timeframeProfile);
  assert.equal(signal.timeframeAgreement, "多周期支持 3 个，冲突 1 个，缺失 regime；主导证据来自 execution。");
  assert.deepEqual(signal.timeframeConflicts, ["1h"]);
  assert.ok(signal.evidence.some((item) => item.label === "多周期结构冲突"));
});

test("analyzeMarketAnomaly combines BTC and ETH conflict with timeframe profile without hard rejection", () => {
  const profile = buildTimeframeProfile([
    frame("15m", "support", 72),
    frame("30m", "support", 68),
    frame("1h", "support", 74),
    frame("4h", "support", 70),
    frame("1d", "conflict", 55),
  ]);

  const signal = analyzeMarketAnomaly({
    ...baseInput,
    timeframeProfile: profile,
    marketContext: {
      anchor: "btc_eth",
      btcChangePercent: -3.2,
      ethChangePercent: -2.4,
      note: "anchors risk-off",
      regime: "risk_off",
    },
  });

  assert.equal(signal.state, "waiting_confirmation");
  assert.equal(signal.direction, "long");
  assert.notEqual(signal.state, "no_trade");
  assert.ok(signal.confidence < 74);
  assert.ok(signal.evidence.some((item) => item.label === "BTC/ETH 环境逆风"));
  assert.ok(signal.evidence.some((item) => item.label === "多周期结构校验"));
});
