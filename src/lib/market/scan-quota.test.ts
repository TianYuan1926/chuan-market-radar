import assert from "node:assert/strict";
import test from "node:test";

import { buildScanQuotaPlan } from "./scan-quota";

test("buildScanQuotaPlan caps batch size to fit the daily CoinGlass request budget", () => {
  const plan = buildScanQuotaPlan({
    cadenceMinutes: 15,
    coinGlassDailyRequestBudget: 300,
    minimumRequestsPerScan: 3,
    publicDiscoveryRequestsPerScan: 3,
    requestedBatchSize: 12,
  });

  assert.equal(plan.effectiveBatchSize, 3);
  assert.equal(plan.maxCoinGlassRequestsPerScan, 3);
  assert.equal(plan.coinGlassRequestsPerScan, 3);
  assert.equal(plan.coinGlassRequestsPerDayEstimate, 288);
  assert.equal(plan.coinGlassRemainingDailyRequestEstimate, 12);
  assert.equal(plan.publicDiscoveryRequestsPerDayEstimate, 288);
  assert.equal(plan.coinGlassBudgetUsagePercent, 96);
  assert.equal(plan.status, "near_budget");
  assert.equal(plan.wasCapped, true);
});

test("buildScanQuotaPlan preserves minimum anchor scanning even when the budget is too low", () => {
  const plan = buildScanQuotaPlan({
    cadenceMinutes: 15,
    coinGlassDailyRequestBudget: 200,
    minimumRequestsPerScan: 3,
    publicDiscoveryRequestsPerScan: 3,
    requestedBatchSize: 6,
  });

  assert.equal(plan.effectiveBatchSize, 3);
  assert.equal(plan.coinGlassRequestsPerDayEstimate, 288);
  assert.equal(plan.coinGlassRemainingDailyRequestEstimate, 0);
  assert.equal(plan.coinGlassBudgetUsagePercent, 144);
  assert.equal(plan.status, "over_budget");
  assert.equal(plan.wasCapped, true);
});

test("buildScanQuotaPlan leaves batch size unchanged when the budget allows it", () => {
  const plan = buildScanQuotaPlan({
    cadenceMinutes: 30,
    coinGlassDailyRequestBudget: 600,
    minimumRequestsPerScan: 3,
    publicDiscoveryRequestsPerScan: 3,
    requestedBatchSize: 8,
  });

  assert.equal(plan.effectiveBatchSize, 8);
  assert.equal(plan.maxCoinGlassRequestsPerScan, 12);
  assert.equal(plan.coinGlassRequestsPerDayEstimate, 384);
  assert.equal(plan.coinGlassRemainingDailyRequestEstimate, 216);
  assert.equal(plan.coinGlassBudgetUsagePercent, 64);
  assert.equal(plan.status, "within_budget");
  assert.equal(plan.wasCapped, false);
});

test("buildScanQuotaPlan leaves remaining budget unknown when no CoinGlass budget is configured", () => {
  const plan = buildScanQuotaPlan({
    cadenceMinutes: 15,
    requestedBatchSize: 5,
  });

  assert.equal(plan.coinGlassDailyRequestBudget, null);
  assert.equal(plan.coinGlassRemainingDailyRequestEstimate, null);
  assert.equal(plan.status, "unbudgeted");
});
