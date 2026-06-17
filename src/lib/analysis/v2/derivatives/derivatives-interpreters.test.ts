import assert from "node:assert/strict";
import test from "node:test";

import {
  interpretFunding,
} from "./funding-interpreter";
import {
  interpretOpenInterest,
} from "./oi-interpreter";
import {
  interpretTakerFlow,
} from "./taker-flow-interpreter";

test("oi interpreter does not treat OI rising alone as bullish", () => {
  const result = interpretOpenInterest({
    symbol: "ENAUSDT",
    timeframe: "1h",
    createdAt: "2026-06-17T00:00:00.000Z",
    oiChangePct: 12,
  });

  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].family, "DERIVATIVES");
  assert.equal(result.evidence[0].direction, "NEUTRAL");
  assert.match(result.evidence[0].reasoning, /cannot be bullish alone/i);
  assert.deepEqual(result.dataIssues, []);
});

test("funding interpreter treats high funding as crowding risk, not strength", () => {
  const result = interpretFunding({
    symbol: "ENAUSDT",
    timeframe: "1h",
    createdAt: "2026-06-17T00:00:00.000Z",
    fundingRatePct: 0.12,
  });

  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].family, "DERIVATIVES");
  assert.equal(result.evidence[0].direction, "RISK");
  assert.match(result.evidence[0].reasoning, /crowding risk/i);
});

test("taker flow interpreter reports CVD boundary when real CVD is unavailable", () => {
  const result = interpretTakerFlow({
    symbol: "ENAUSDT",
    timeframe: "1h",
    createdAt: "2026-06-17T00:00:00.000Z",
    hasRealCvd: false,
    takerBuySellRatio: 1.18,
  });

  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].direction, "NEUTRAL");
  assert.equal(result.evidence[0].dataFreshness, "partial");
  assert.doesNotMatch(result.evidence[0].fact, /real CVD/i);
  assert.deepEqual(result.dataIssues, [{
    field: "cvd",
    severity: "info",
    message: "Real CVD is unavailable; taker flow can only be treated as a proxy.",
  }]);
});
