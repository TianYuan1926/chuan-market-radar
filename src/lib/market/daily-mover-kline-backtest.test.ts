import assert from "node:assert/strict";
import test from "node:test";

import type { DailyMoverSnapshot } from "./daily-movers";
import {
  buildDailyMoverKlineBacktestResults,
  buildDailyMoverKlineBacktestPlan,
  type DailyMoverKlineBacktestCandidateSource,
} from "./daily-mover-kline-backtest";
import type { OhlcvCandleCacheEntry, OhlcvInterval } from "./ohlcv/types";

function candidate(overrides: Partial<DailyMoverKlineBacktestCandidateSource> = {}): DailyMoverKlineBacktestCandidateSource {
  return {
    tag: "review_volume_oi_weight",
    label: "成交量/OI 权重复核",
    readiness: "ready",
    sampleCount: 4,
    symbols: ["SUIUSDT", "TIAUSDT", "ENAUSDT", "ONDOUSDT"],
    ...overrides,
  };
}

function snapshot(symbols: string[]): DailyMoverSnapshot {
  return {
    id: "daily-movers-kline-plan-1",
    observedAt: "2026-06-15T00:17:00.000Z",
    source: "coinglass",
    gainers: [],
    losers: [],
    reviews: symbols.map((symbol, index) => ({
      id: `review-${symbol.toLowerCase()}`,
      symbol,
      direction: index % 2 === 0 ? "gainer" : "loser",
      observedAt: `2026-06-${15 + index}T00:17:00.000Z`,
      allowedUse: "research_only",
      guardrail: "每日涨跌幅榜只用于归因复盘、样本库和规则校准，不用于追涨杀跌。",
      attribution: {
        evidenceStrength: "strong",
        learnability: "learnable",
        primaryDrivers: ["volume_expansion", "open_interest_expansion"],
      },
      radarReview: {
        improvementTags: ["review_volume_oi_weight"],
        matchedSignalIds: [],
        status: "missed",
      },
    })),
  };
}

function cacheEntry({
  closes = [100, 105, 110],
  interval,
  symbol,
  volumes = [1000, 1400, 2200],
}: {
  closes?: number[];
  interval: OhlcvInterval;
  symbol: string;
  volumes?: number[];
}): OhlcvCandleCacheEntry {
  return {
    allowedUse: "research_only",
    cacheKey: `${symbol}:${interval}`,
    canAutoAdjustWeights: false,
    candles: closes.map((close, index) => {
      const open = index === 0 ? close : closes[index - 1] ?? close;

      return {
        close,
        closeTime: new Date(Date.UTC(2026, 5, 15, index, 59, 0)).toISOString(),
        high: Math.max(open, close) + 2,
        low: Math.min(open, close) - 2,
        open,
        openTime: new Date(Date.UTC(2026, 5, 15, index, 0, 0)).toISOString(),
        volume: volumes[index] ?? volumes.at(-1) ?? 0,
      };
    }),
    fetchedAt: "2026-06-15T04:00:00.000Z",
    interval,
    source: "test-public-ohlcv",
    symbol,
  };
}

test("buildDailyMoverKlineBacktestPlan creates a cache-first planning boundary without external candle requests", () => {
  const plan = buildDailyMoverKlineBacktestPlan({
    candidates: [candidate({
      symbols: ["SUIUSDT", "TIAUSDT", "ENAUSDT"],
    })],
    dailyRequestBudget: 12,
    intervals: ["15m", "1h", "4h"],
    maxSymbolsPerRun: 3,
    snapshots: [snapshot(["SUIUSDT", "TIAUSDT", "ENAUSDT"])],
  });

  assert.equal(plan.mode, "planning_only");
  assert.equal(plan.status, "cache_plan_ready");
  assert.equal(plan.allowedUse, "research_only");
  assert.equal(plan.canAutoAdjustWeights, false);
  assert.equal(plan.canFetchExternalCandles, false);
  assert.equal(plan.requiresCacheBeforeExecution, true);
  assert.equal(plan.dataSourcePolicy, "public_ohlcv_cache_only_no_coinglass");
  assert.equal(plan.estimatedRequestCount, 9);
  assert.deepEqual(plan.intervals, ["15m", "1h", "4h"]);
  assert.match(plan.guardrail, /不触发外部 K 线请求/);

  assert.equal(plan.candidatePlans.length, 1);
  assert.equal(plan.candidatePlans[0]?.status, "cache_plan_ready");
  assert.deepEqual(plan.candidatePlans[0]?.plannedSymbols, ["SUIUSDT", "TIAUSDT", "ENAUSDT"]);
  assert.equal(plan.candidatePlans[0]?.plannedRequestCount, 9);
  assert.equal(plan.candidatePlans[0]?.cacheKeys.length, 9);
  assert.ok(plan.candidatePlans[0]?.cacheKeys.includes("SUIUSDT:15m"));
  assert.match(plan.candidatePlans[0]?.nextStep ?? "", /缓存/);
});

test("buildDailyMoverKlineBacktestPlan caps planned symbols by daily request budget", () => {
  const plan = buildDailyMoverKlineBacktestPlan({
    candidates: [candidate()],
    dailyRequestBudget: 5,
    intervals: ["15m", "1h", "4h"],
    maxSymbolsPerRun: 3,
    snapshots: [snapshot(["SUIUSDT", "TIAUSDT", "ENAUSDT"])],
  });

  assert.equal(plan.status, "budget_limited");
  assert.equal(plan.estimatedRequestCount, 3);
  assert.deepEqual(plan.candidatePlans[0]?.plannedSymbols, ["SUIUSDT"]);
  assert.deepEqual(plan.candidatePlans[0]?.deferredSymbols, ["TIAUSDT", "ENAUSDT", "ONDOUSDT"]);
  assert.match(plan.candidatePlans[0]?.nextStep ?? "", /预算/);
  assert.equal(plan.canFetchExternalCandles, false);
  assert.equal(plan.canAutoAdjustWeights, false);
});

test("buildDailyMoverKlineBacktestPlan blocks execution when candidates are not ready", () => {
  const plan = buildDailyMoverKlineBacktestPlan({
    candidates: [
      candidate({
        readiness: "collecting",
        sampleCount: 2,
      }),
      candidate({
        readiness: "blocked",
        tag: "review_short_side_detection",
        label: "下跌侧识别复核",
        symbols: ["TIAUSDT"],
      }),
    ],
    snapshots: [snapshot(["SUIUSDT", "TIAUSDT"])],
  });

  assert.equal(plan.status, "needs_more_samples");
  assert.equal(plan.estimatedRequestCount, 0);
  assert.equal(plan.candidatePlans[0]?.status, "needs_more_samples");
  assert.equal(plan.candidatePlans[1]?.status, "blocked");
  assert.equal(plan.requiresCacheBeforeExecution, true);
  assert.equal(plan.canFetchExternalCandles, false);
});

test("buildDailyMoverKlineBacktestResults computes readonly metrics from cached candles", () => {
  const plan = buildDailyMoverKlineBacktestPlan({
    candidates: [candidate({ symbols: ["SUIUSDT"] })],
    dailyRequestBudget: 2,
    intervals: ["15m", "1h"],
    maxSymbolsPerRun: 1,
    snapshots: [snapshot(["SUIUSDT"])],
  });

  const result = buildDailyMoverKlineBacktestResults({
    caches: [
      cacheEntry({ interval: "15m", symbol: "SUIUSDT" }),
      cacheEntry({ closes: [100, 98, 104], interval: "1h", symbol: "SUIUSDT", volumes: [1200, 1100, 1800] }),
    ],
    plan,
  });

  assert.equal(result.mode, "cached_kline_validation");
  assert.equal(result.status, "ready");
  assert.equal(result.allowedUse, "research_only");
  assert.equal(result.canAutoAdjustWeights, false);
  assert.equal(result.totalPlannedCacheKeys, 2);
  assert.equal(result.availableCacheKeys, 2);
  assert.equal(result.missingCacheKeys, 0);
  assert.equal(result.cacheCoveragePercent, 100);
  assert.match(result.guardrail, /不自动改权重/);

  assert.equal(result.candidateResults.length, 1);
  assert.equal(result.candidateResults[0]?.status, "ready");
  assert.equal(result.candidateResults[0]?.symbolResults[0]?.symbol, "SUIUSDT");
  assert.equal(result.candidateResults[0]?.symbolResults[0]?.intervalResults[0]?.returnPercent, 10);
  assert.equal(result.candidateResults[0]?.symbolResults[0]?.intervalResults[0]?.volumeChangePercent, 120);
  assert.equal(result.candidateResults[0]?.symbolResults[0]?.intervalResults[0]?.maxRunupPercent, 12);
  assert.equal(result.candidateResults[0]?.symbolResults[0]?.intervalResults[0]?.maxDrawdownPercent, -2);
  assert.equal(result.candidateResults[0]?.symbolResults[0]?.verdict, "supports_review");
});

test("buildDailyMoverKlineBacktestResults marks missing caches without triggering execution", () => {
  const plan = buildDailyMoverKlineBacktestPlan({
    candidates: [candidate({ symbols: ["SUIUSDT"] })],
    dailyRequestBudget: 2,
    intervals: ["15m", "1h"],
    maxSymbolsPerRun: 1,
    snapshots: [snapshot(["SUIUSDT"])],
  });

  const result = buildDailyMoverKlineBacktestResults({
    caches: [
      cacheEntry({ interval: "15m", symbol: "SUIUSDT" }),
    ],
    plan,
  });

  assert.equal(result.status, "partial_cache");
  assert.equal(result.totalPlannedCacheKeys, 2);
  assert.equal(result.availableCacheKeys, 1);
  assert.equal(result.missingCacheKeys, 1);
  assert.deepEqual(result.candidateResults[0]?.missingCacheKeys, ["SUIUSDT:1h"]);
  assert.match(result.candidateResults[0]?.nextStep ?? "", /补齐缓存/);
  assert.equal(result.canAutoAdjustWeights, false);
});
