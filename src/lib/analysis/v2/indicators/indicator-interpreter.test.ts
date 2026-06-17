import assert from "node:assert/strict";
import test from "node:test";

import {
  interpretIndicatorSnapshot,
} from "./indicator-interpreter";

test("indicator interpreter treats RSI overbought as risk or momentum context, not a short signal", () => {
  const result = interpretIndicatorSnapshot({
    symbol: "ENAUSDT",
    timeframe: "1h",
    createdAt: "2026-06-17T00:00:00.000Z",
    rsi: 78,
    structureState: "UPTREND",
  });

  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].family, "TECHNICAL_INDICATOR");
  assert.equal(result.evidence[0].direction, "RISK");
  assert.match(result.evidence[0].reasoning, /not a short/i);
  assert.deepEqual(result.ignoredSignals, [{
    indicator: "RSI",
    reason: "RSI overbought cannot directly produce a short signal.",
  }]);
});

test("indicator interpreter records MACD crosses as context, not direct buy or sell signals", () => {
  const result = interpretIndicatorSnapshot({
    symbol: "ENAUSDT",
    timeframe: "1h",
    createdAt: "2026-06-17T00:00:00.000Z",
    macdCross: "bullish",
    macdHistogram: 0.42,
  });

  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].direction, "NEUTRAL");
  assert.match(result.evidence[0].reasoning, /requires structure/i);
  assert.deepEqual(result.ignoredSignals, [{
    indicator: "MACD",
    reason: "MACD cross cannot directly produce a buy or sell signal.",
  }]);
});

test("indicator interpreter turns Bollinger squeeze into neutral compression evidence", () => {
  const result = interpretIndicatorSnapshot({
    symbol: "ENAUSDT",
    timeframe: "1h",
    createdAt: "2026-06-17T00:00:00.000Z",
    bollingerWidthPercentile: 8,
  });

  assert.deepEqual(result.ignoredSignals, []);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].family, "VOLUME_VOLATILITY");
  assert.equal(result.evidence[0].direction, "NEUTRAL");
  assert.match(result.evidence[0].fact, /squeeze/i);
});
