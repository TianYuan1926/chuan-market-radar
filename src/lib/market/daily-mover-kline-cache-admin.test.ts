import assert from "node:assert/strict";
import test from "node:test";

import { buildDailyMoverKlineBacktestPlan } from "./daily-mover-kline-backtest";
import {
  runAdminDailyMoverKlineCacheFill,
  type AdminDailyMoverKlineCacheFillResponse,
} from "./daily-mover-kline-cache-admin";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";

function assertError(
  response: AdminDailyMoverKlineCacheFillResponse,
  expected: {
    error: string;
    status: number;
  },
) {
  assert.equal(response.status, expected.status);
  assert.equal(response.body.ok, false);

  if (!response.body.ok) {
    assert.equal(response.body.error, expected.error);
  }
}

test("runAdminDailyMoverKlineCacheFill refuses to run when CRON_SECRET is missing", async () => {
  let called = false;
  const response = await runAdminDailyMoverKlineCacheFill({
    authorization: "Bearer anything",
    buildPlan: async () => {
      called = true;
      throw new Error("should not build plan");
    },
    env: {},
    fill: async () => {
      called = true;
      throw new Error("should not fill");
    },
    repository: createMemoryPersistenceRepository(),
  });

  assertError(response, {
    error: "kline_cache_secret_missing",
    status: 503,
  });
  assert.equal(called, false);
});

test("runAdminDailyMoverKlineCacheFill rejects requests with the wrong bearer token", async () => {
  let called = false;
  const response = await runAdminDailyMoverKlineCacheFill({
    authorization: "Bearer wrong",
    buildPlan: async () => {
      called = true;
      throw new Error("should not build plan");
    },
    env: {
      CRON_SECRET: "correct-secret",
    },
    fill: async () => {
      called = true;
      throw new Error("should not fill");
    },
    repository: createMemoryPersistenceRepository(),
  });

  assertError(response, {
    error: "unauthorized",
    status: 401,
  });
  assert.equal(called, false);
});

test("runAdminDailyMoverKlineCacheFill runs the cache fill after authorization", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "chuan-public" });
  const plan = buildDailyMoverKlineBacktestPlan({
    candidates: [
      {
        label: "成交量/OI 权重复核",
        readiness: "ready",
        sampleCount: 3,
        symbols: ["ENAUSDT"],
        tag: "review_volume_oi_weight",
      },
    ],
    dailyRequestBudget: 2,
    intervals: ["15m", "1h"],
    snapshots: [],
  });
  const response = await runAdminDailyMoverKlineCacheFill({
    authorization: "Bearer correct-secret",
    buildPlan: async () => plan,
    env: {
      CRON_SECRET: "correct-secret",
    },
    fill: async (options) => ({
      allowedUse: "research_only",
      attemptedRequests: options.plan.estimatedRequestCount,
      canAutoAdjustWeights: false,
      failedRequests: 0,
      failures: [],
      mode: "cache_fill_mvp",
      requestBudget: options.plan.estimatedRequestCount,
      skippedExistingCaches: 0,
      storedCaches: 2,
    }),
    repository,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);

  if (response.body.ok) {
    assert.equal(response.body.storage, "memory");
    assert.equal(response.body.scope, "chuan-public");
    assert.equal(response.body.plan.status, "cache_plan_ready");
    assert.equal(response.body.fill.storedCaches, 2);
    assert.equal(response.body.fill.canAutoAdjustWeights, false);
  }
});
