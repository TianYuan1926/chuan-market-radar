import assert from "node:assert/strict";
import test from "node:test";
import { simulateAccountRisk } from "./account-risk-simulator";

test("simulateAccountRisk uses 1500 USDT, 3% margin and BTC 150x as read-only account lens", () => {
  const result = simulateAccountRisk({
    entryPrice: 100,
    side: "long",
    stopHasStructuralMeaning: true,
    stopPrice: 99.5,
    symbol: "BTCUSDT",
    targetPrice: 101.5,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.rules.accountEquityUsdt, 1500);
  assert.equal(result.position.positionMarginPctOfEquity, 3);
  assert.equal(result.position.estimatedInitialMarginUsdt, 45);
  assert.equal(result.leverage.leverage, 150);
  assert.equal(result.leverage.source, "btc_eth_fixed");
  assert.equal(result.position.estimatedNotionalUsdt, 6750);
  assert.equal(result.loss.stopLossUsdt, 33.75);
  assert.equal(result.loss.stopLossPctOfEquity, 2.25);
  assert.equal(result.loss.stopLossExceedsUserRule, false);
  assert.equal(result.distance.structuralRewardRisk, 3);
  assert.equal(result.checks.rrPass, true);
  assert.equal(result.checks.stopStructurePass, true);
  assert.equal(result.checks.leverageRiskLevel, "critical");
  assert.equal(result.liquidation.mode, "cross_margin_estimate_only");
});

test("simulateAccountRisk refuses to fabricate altcoin max leverage when it is unknown", () => {
  const result = simulateAccountRisk({
    entryPrice: 8,
    side: "long",
    stopHasStructuralMeaning: true,
    stopPrice: 7.8,
    symbol: "TIAUSDT",
    targetPrice: 8.6,
  });

  assert.equal(result.status, "waiting_leverage");
  assert.equal(result.leverage.leverage, null);
  assert.equal(result.leverage.status, "unknown");
  assert.equal(result.leverage.source, "not_available");
  assert.equal(result.distance.structuralRewardRisk, 3);
  assert.equal(result.position.estimatedNotionalUsdt, null);
  assert.equal(result.loss.stopLossUsdt, null);
  assert.match(result.summary, /拒绝伪造/);
});

test("simulateAccountRisk uses supplied exchange max leverage for altcoins and flags oversized stop loss", () => {
  const result = simulateAccountRisk({
    entryPrice: 8,
    exchangeMaxLeverage: 75,
    side: "long",
    stopHasStructuralMeaning: true,
    stopPrice: 7.6,
    symbol: "TIAUSDT",
    targetPrice: 9.2,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.leverage.leverage, 75);
  assert.equal(result.leverage.source, "exchange_max");
  assert.equal(result.position.estimatedInitialMarginUsdt, 45);
  assert.equal(result.position.estimatedNotionalUsdt, 3375);
  assert.equal(result.distance.riskDistancePct, 5);
  assert.equal(result.distance.rewardDistancePct, 15);
  assert.equal(result.distance.structuralRewardRisk, 3);
  assert.equal(result.loss.stopLossUsdt, 168.75);
  assert.equal(result.loss.stopLossPctOfEquity, 11.25);
  assert.equal(result.loss.stopLossExceedsUserRule, true);
  assert.equal(result.checks.maxLossRulePass, false);
  assert.match(result.summary, /止损亏损超过用户规则/);
});

test("simulateAccountRisk keeps structural RR and stop structure checks separate from leverage math", () => {
  const result = simulateAccountRisk({
    entryPrice: 100,
    side: "short",
    stopHasStructuralMeaning: false,
    stopPrice: 101,
    symbol: "ETHUSDT",
    targetPrice: 98,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.distance.structuralRewardRisk, 2);
  assert.equal(result.checks.rrPass, false);
  assert.equal(result.checks.stopStructurePass, false);
  assert.equal(result.loss.stopLossExceedsUserRule, true);
  assert.match(result.summary, /结构盈亏比低于 3:1/);
  assert.match(result.summary, /止损缺少结构意义/);
});

test("simulateAccountRisk rejects inverted stop or target directions as invalid plan", () => {
  const result = simulateAccountRisk({
    entryPrice: 100,
    side: "long",
    stopHasStructuralMeaning: true,
    stopPrice: 101,
    symbol: "BTCUSDT",
    targetPrice: 103,
  });

  assert.equal(result.status, "invalid_plan");
  assert.equal(result.distance.structuralRewardRisk, null);
  assert.equal(result.checks.rrPass, null);
  assert.match(result.summary, /方向不匹配/);
});
