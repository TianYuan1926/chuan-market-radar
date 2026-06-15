import type { PersistenceRepository } from "../persistence/persistence-store";
import type { DailyMoverKlineBacktestPlan } from "./daily-mover-kline-backtest";
import type { OhlcvProvider, OhlcvProviderFailure } from "./ohlcv/types";

export type DailyMoverKlineCacheFillFailure = {
  cacheKey: string;
  error: string;
  interval: string;
  reason: OhlcvProviderFailure["reason"];
  symbol: string;
};

export type DailyMoverKlineCacheFillResult = {
  allowedUse: "research_only";
  attemptedRequests: number;
  canAutoAdjustWeights: false;
  failedRequests: number;
  failures: DailyMoverKlineCacheFillFailure[];
  mode: "cache_fill_mvp";
  requestBudget: number;
  skippedExistingCaches: number;
  storedCaches: number;
};

export type RunDailyMoverKlineCacheFillOptions = {
  now?: string;
  ohlcvProvider: OhlcvProvider;
  plan: DailyMoverKlineBacktestPlan;
  repository: PersistenceRepository;
};

export async function runDailyMoverKlineCacheFill({
  now = new Date().toISOString(),
  ohlcvProvider,
  plan,
  repository,
}: RunDailyMoverKlineCacheFillOptions): Promise<DailyMoverKlineCacheFillResult> {
  const result: DailyMoverKlineCacheFillResult = {
    allowedUse: "research_only",
    attemptedRequests: 0,
    canAutoAdjustWeights: false,
    failedRequests: 0,
    failures: [],
    mode: "cache_fill_mvp",
    requestBudget: plan.estimatedRequestCount,
    skippedExistingCaches: 0,
    storedCaches: 0,
  };

  for (const candidatePlan of plan.candidatePlans) {
    if (candidatePlan.status !== "cache_plan_ready" && candidatePlan.status !== "budget_limited") {
      continue;
    }

    for (const symbol of candidatePlan.plannedSymbols) {
      for (const interval of candidatePlan.intervals) {
        const existing = await repository.getOhlcvCandleCache(symbol, interval);

        if (existing) {
          result.skippedExistingCaches += 1;
          continue;
        }

        if (result.attemptedRequests >= result.requestBudget) {
          continue;
        }

        result.attemptedRequests += 1;

        const response = await ohlcvProvider.fetchCandles({
          interval,
          limit: candidatePlan.candleLimitPerInterval,
          symbol,
        });
        const cacheKey = `${symbol}:${interval}`;

        if (!response.ok) {
          result.failedRequests += 1;
          result.failures.push({
            cacheKey,
            error: response.error,
            interval,
            reason: response.reason,
            symbol,
          });
          continue;
        }

        await repository.upsertOhlcvCandleCache({
          allowedUse: "research_only",
          cacheKey,
          canAutoAdjustWeights: false,
          candles: response.candles,
          fetchedAt: now,
          interval,
          source: response.source,
          symbol: response.symbol,
        });
        result.storedCaches += 1;
      }
    }
  }

  return result;
}
