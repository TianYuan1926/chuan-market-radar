import assert from "node:assert/strict";
import test from "node:test";
import { buildPersonalPositionLens } from "./personal-position-lens";

test("buildPersonalPositionLens converts BTC/ETH fixed leverage without changing structural RR", () => {
  const lens = buildPersonalPositionLens({
    entryPrice: 100,
    side: "long",
    stopPrice: 99,
    symbol: "BTCUSDT",
    targetPrice: 103,
  });

  assert.equal(lens.status, "ready");
  assert.equal(lens.leverage, 150);
  assert.equal(lens.leverageSource, "btc_eth_fixed");
  assert.equal(lens.marginFractionPercent, 0.3);
  assert.equal(lens.notionalPerEquity, 45);
  assert.equal(lens.structuralRewardRisk, 3);
  assert.equal(lens.stopLossPctOfEquity, 0.45);
  assert.equal(lens.targetProfitPctOfEquity, 1.35);
  assert.equal(lens.stopLossRoe, 150);
  assert.equal(lens.targetRoe, 450);
});

test("buildPersonalPositionLens refuses to fabricate unknown altcoin max leverage", () => {
  const lens = buildPersonalPositionLens({
    entryPrice: 8,
    side: "long",
    stopPrice: 7.8,
    symbol: "TIAUSDT",
    targetPrice: 8.6,
  });

  assert.equal(lens.status, "waiting_leverage");
  assert.equal(lens.leverage, null);
  assert.equal(lens.leverageSource, "unknown");
  assert.equal(lens.notionalPerEquity, null);
  assert.match(lens.summary, /不臆造/);
});

test("buildPersonalPositionLens uses known exchange max leverage for altcoins", () => {
  const lens = buildPersonalPositionLens({
    entryPrice: 8,
    profile: {
      altcoinLeverage: 50,
      btcEthLeverage: 150,
      marginFraction: 0.003,
    },
    side: "long",
    stopPrice: 7.8,
    symbol: "TIAUSDT",
    targetPrice: 8.6,
  });

  assert.equal(lens.status, "ready");
  assert.equal(lens.leverage, 50);
  assert.equal(lens.leverageSource, "exchange_max");
  assert.equal(lens.notionalPerEquity, 15);
  assert.equal(lens.structuralRewardRisk, 3);
  assert.equal(lens.stopLossPctOfEquity, 0.375);
  assert.equal(lens.targetProfitPctOfEquity, 1.125);
});
