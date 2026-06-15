import assert from "node:assert/strict";
import test from "node:test";

import type { Candle, OhlcvProvider } from "./ohlcv/types";
import { buildDailyMoverKlineBacktestPlan } from "./daily-mover-kline-backtest";
import { runDailyMoverKlineCacheFill } from "./daily-mover-kline-cache-fill";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";

function candle(index: number): Candle {
  const openTime = new Date(Date.UTC(2026, 5, 15, 0, index * 15, 0)).toISOString();
  const closeTime = new Date(Date.UTC(2026, 5, 15, 0, index * 15 + 14, 59)).toISOString();

  return {
    close: 10 + index + 0.4,
    closeTime,
    high: 10 + index + 0.6,
    low: 10 + index - 0.2,
    open: 10 + index,
    openTime,
    volume: 100000 + (index * 1000),
  };
}

function provider(): OhlcvProvider & { requests: Array<{ interval: string; limit?: number; symbol: string }> } {
  const requests: Array<{ interval: string; limit?: number; symbol: string }> = [];

  return {
    id: "test-public-ohlcv",
    label: "Test Public OHLCV",
    requests,
    async fetchCandles(request) {
      requests.push({
        interval: request.interval,
        limit: request.limit,
        symbol: request.symbol,
      });

      return {
        candles: [candle(0), candle(1)],
        interval: request.interval,
        ok: true,
        source: "test-public-ohlcv",
        symbol: request.symbol,
      };
    },
  };
}

test("runDailyMoverKlineCacheFill stores public OHLCV candles from the planning boundary without automatic weights", async () => {
  const repository = createMemoryPersistenceRepository();
  const ohlcvProvider = provider();
  const plan = buildDailyMoverKlineBacktestPlan({
    candidates: [
      {
        label: "成交量/OI 权重复核",
        readiness: "ready",
        sampleCount: 3,
        symbols: ["ENAUSDT", "SUIUSDT"],
        tag: "review_volume_oi_weight",
      },
    ],
    dailyRequestBudget: 4,
    intervals: ["15m", "1h"],
    maxSymbolsPerRun: 2,
    snapshots: [],
  });

  const result = await runDailyMoverKlineCacheFill({
    now: "2026-06-15T01:00:00.000Z",
    ohlcvProvider,
    plan,
    repository,
  });
  const entries = await repository.listOhlcvCandleCaches();

  assert.equal(result.mode, "cache_fill_mvp");
  assert.equal(result.allowedUse, "research_only");
  assert.equal(result.canAutoAdjustWeights, false);
  assert.equal(result.requestBudget, 4);
  assert.equal(result.attemptedRequests, 4);
  assert.equal(result.storedCaches, 4);
  assert.equal(result.skippedExistingCaches, 0);
  assert.equal(result.failedRequests, 0);
  assert.equal(ohlcvProvider.requests.length, 4);
  assert.deepEqual(ohlcvProvider.requests[0], {
    interval: "15m",
    limit: 96,
    symbol: "ENAUSDT",
  });
  assert.equal(entries.length, 4);
  assert.equal(entries[0]?.allowedUse, "research_only");
  assert.equal(entries[0]?.canAutoAdjustWeights, false);
});

test("runDailyMoverKlineCacheFill skips existing caches and preserves the request budget", async () => {
  const repository = createMemoryPersistenceRepository();
  await repository.upsertOhlcvCandleCache({
    allowedUse: "research_only",
    cacheKey: "ENAUSDT:15m",
    canAutoAdjustWeights: false,
    candles: [candle(0)],
    fetchedAt: "2026-06-15T00:45:00.000Z",
    interval: "15m",
    source: "test-public-ohlcv",
    symbol: "ENAUSDT",
  });
  const ohlcvProvider = provider();
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

  const result = await runDailyMoverKlineCacheFill({
    now: "2026-06-15T01:00:00.000Z",
    ohlcvProvider,
    plan,
    repository,
  });

  assert.equal(result.attemptedRequests, 1);
  assert.equal(result.storedCaches, 1);
  assert.equal(result.skippedExistingCaches, 1);
  assert.equal(ohlcvProvider.requests.length, 1);
  assert.deepEqual(ohlcvProvider.requests[0], {
    interval: "1h",
    limit: 96,
    symbol: "ENAUSDT",
  });
});
