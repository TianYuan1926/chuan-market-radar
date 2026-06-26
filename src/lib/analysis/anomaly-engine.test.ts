import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeMarketAnomalies,
  analyzeMarketAnomaly,
  type MarketAnomalyInput,
} from "./anomaly-engine";
import { buildTimeframeProfile } from "./timeframe-profile";
import type { EvidencePoint, MarketSignal } from "./types";

const baseInput: MarketAnomalyInput = {
  id: "ena-sample",
  symbol: "ENAUSDT",
  exchange: "BINANCE",
  timeframe: "15m",
  regime: "mixed",
  directionBias: "long",
  dataQualityScore: 0.94,
  priceChangePercent: 2.4,
  volumeRatio: 1.92,
  openInterestChangePercent: 6.8,
  fundingRateZScore: 0.35,
  volatilityCompressionPercentile: 18,
  liquidationUsd24h: 7_200_000,
  structureLocation: "breakout_edge",
  distanceToInvalidationPercent: 1.2,
  projectedMovePercent: 4.8,
  triggerHint: "15m 放量突破后回踩不破",
  invalidationHint: "跌回箱体并收在突破位下方",
  targetHints: ["前高流动性区", "4H 供给下沿"],
  updatedAt: "2026-06-12T10:20:00+08:00",
};

test("analyzeMarketAnomaly promotes compressed edge setups without requiring trend as a hard gate", () => {
  const signal = analyzeMarketAnomaly({
    ...baseInput,
    regime: "risk_off",
  });

  assert.equal(signal.state, "near_trigger");
  assert.equal(signal.direction, "long");
  assert.ok(signal.confidence >= 74);
  assert.ok(signal.strategy.riskReward >= 3);
  assert.ok(signal.evidence.some((item: EvidencePoint) => item.layer === "structure_location"));
  assert.ok(signal.evidence.some((item: EvidencePoint) => item.layer === "price_volume"));
  assert.ok(signal.evidence.some((item: EvidencePoint) => item.layer === "derivatives"));
});

test("analyzeMarketAnomaly downgrades late extended moves even when direction is correct", () => {
  const signal = analyzeMarketAnomaly({
    ...baseInput,
    id: "late-extension",
    symbol: "LATEUSDT",
    priceChangePercent: 12.4,
    volumeRatio: 2.4,
    volatilityCompressionPercentile: 82,
    projectedMovePercent: 14,
    distanceToInvalidationPercent: 2,
    structureLocation: "breakout_edge",
  });

  assert.notEqual(signal.state, "near_trigger");
  assert.equal(signal.risk, "high");
  assert.ok(signal.confidence < 74);
  assert.match(signal.summary, /不追|复盘/);
  assert.ok(
    signal.evidence.some(
      (item: EvidencePoint) =>
        item.label === "晚到风险" &&
        item.layer === "risk_reward" &&
        item.polarity === "blocking",
    ),
  );
});

test("analyzeMarketAnomaly keeps middle-location anomalies as observation instead of trade signals", () => {
  const signal = analyzeMarketAnomaly({
    ...baseInput,
    id: "tia-middle",
    symbol: "TIAUSDT",
    directionBias: "neutral",
    volumeRatio: 1.76,
    openInterestChangePercent: 8.6,
    volatilityCompressionPercentile: 12,
    structureLocation: "middle",
    distanceToInvalidationPercent: 3.4,
    projectedMovePercent: 3.8,
  });

  assert.equal(signal.state, "abnormal_watch");
  assert.equal(signal.direction, "neutral");
  assert.equal(signal.risk, "high");
  assert.match(signal.strategy.positionHint, /不参与|只观察/);
  assert.ok(
    signal.evidence.some(
      (item: EvidencePoint) => item.layer === "risk_reward" && item.polarity === "blocking",
    ),
  );
});

test("analyzeMarketAnomaly downgrades long setups when BTC and ETH anchors are risk-off", () => {
  const signal = analyzeMarketAnomaly({
    ...baseInput,
    marketContext: {
      anchor: "btc_eth",
      btcChangePercent: -3.4,
      ethChangePercent: -2.6,
      note: "BTC and ETH are both risk-off",
      regime: "risk_off",
    },
  });

  assert.equal(signal.state, "waiting_confirmation");
  assert.equal(signal.direction, "long");
  assert.equal(signal.risk, "medium");
  assert.ok(signal.confidence < 74);
  assert.ok(
    signal.evidence.some(
      (item: EvidencePoint) =>
        item.layer === "market_regime" &&
        item.polarity === "conflicting" &&
        item.label === "BTC/ETH 环境逆风",
    ),
  );
});

test("analyzeMarketAnomaly blocks low-quality data before scoring", () => {
  const signal = analyzeMarketAnomaly({
    ...baseInput,
    id: "bad-data",
    symbol: "BADUSDT",
    dataQualityScore: 0.42,
  });

  assert.equal(signal.state, "insufficient_data");
  assert.equal(signal.risk, "blocked");
  assert.equal(signal.direction, "neutral");
  assert.ok(signal.evidence.some((item: EvidencePoint) => item.layer === "data_quality"));
});

test("analyzeMarketAnomalies sorts actionable candidates before weak observations", () => {
  const signals = analyzeMarketAnomalies([
    {
      ...baseInput,
      id: "middle",
      symbol: "MIDUSDT",
      structureLocation: "middle",
      projectedMovePercent: 2.8,
      distanceToInvalidationPercent: 3.1,
    },
    baseInput,
  ]);

  assert.deepEqual(
    signals.map((signal: MarketSignal) => signal.symbol),
    ["ENAUSDT", "MIDUSDT"],
  );
});

test("analyzeMarketAnomaly applies extra downgrade when indicator matrix conflicts with structure profile", () => {
  const signal = analyzeMarketAnomaly({
    ...baseInput,
    indicatorEvidence: [
      {
        label: "多周期指标矩阵",
        value:
          "15m EMA bearish/MACD bearish/RSI neutral；1h EMA bearish/MACD bearish/RSI neutral；4h EMA bearish/MACD bearish/RSI neutral。矩阵只描述指标一致性，不直接触发交易。",
        layer: "indicators",
        polarity: "conflicting",
      },
    ],
    timeframeProfile: buildTimeframeProfile([
      {
        timeframe: "15m",
        alignment: "support",
        weight: 70,
        note: "15m anomaly still active",
      },
      {
        timeframe: "1h",
        alignment: "conflict",
        weight: 28,
        note: "1h structure rejects the long setup",
      },
      {
        timeframe: "4h",
        alignment: "neutral",
        weight: 35,
        note: "4h still unconfirmed",
      },
      {
        timeframe: "1d",
        alignment: "neutral",
        weight: 20,
        note: "daily boundary neutral",
      },
    ]),
  });

  assert.equal(signal.state, "waiting_confirmation");
  assert.ok(signal.confidence <= 66);
  assert.ok(
    signal.evidence.some(
      (item) =>
        item.label === "指标/周期反证" &&
        item.layer === "indicators" &&
        item.polarity === "conflicting",
    ),
  );
});

test("analyzeMarketAnomaly keeps supportive indicators as evidence instead of a standalone trigger", () => {
  const signal = analyzeMarketAnomaly({
    ...baseInput,
    id: "weak-indicator-support",
    dataQualityScore: 0.9,
    volumeRatio: 1.18,
    openInterestChangePercent: 1.4,
    volatilityCompressionPercentile: 42,
    indicatorEvidence: [
      {
        label: "多周期指标矩阵",
        value:
          "15m EMA bullish/MACD bullish/RSI neutral；1h EMA bullish/MACD bullish/RSI neutral；4h EMA bullish/MACD neutral/RSI neutral。矩阵只描述指标一致性，不直接触发交易。",
        layer: "indicators",
        polarity: "supportive",
      },
    ],
    timeframeProfile: buildTimeframeProfile([
      {
        timeframe: "15m",
        alignment: "support",
        weight: 55,
        note: "15m anomaly supports the setup",
      },
      {
        timeframe: "1h",
        alignment: "support",
        weight: 45,
        note: "1h structure supports but is not enough alone",
      },
      {
        timeframe: "4h",
        alignment: "neutral",
        weight: 30,
        note: "4h neutral",
      },
      {
        timeframe: "1d",
        alignment: "neutral",
        weight: 20,
        note: "daily neutral",
      },
    ]),
  });

  assert.notEqual(signal.state, "near_trigger");
  assert.ok(signal.confidence < 74);
  assert.ok(
    signal.evidence.some(
      (item) =>
        item.label === "指标/周期同向校验" &&
        item.layer === "indicators" &&
        item.polarity === "supportive",
    ),
  );
});
