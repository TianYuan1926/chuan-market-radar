import type { DailyMoverSnapshot } from "./daily-movers";
import type { OhlcvCandleCacheEntry, OhlcvInterval } from "./ohlcv/types";

export type DailyMoverKlineBacktestCandidateSource = {
  tag: string;
  label: string;
  readiness: "blocked" | "collecting" | "ready";
  sampleCount: number;
  symbols: string[];
};

export type DailyMoverKlineBacktestPlanStatus =
  | "budget_limited"
  | "cache_plan_ready"
  | "needs_more_samples";

export type DailyMoverKlineBacktestCandidatePlanStatus =
  | "blocked"
  | "budget_limited"
  | "cache_plan_ready"
  | "needs_more_samples";

export type DailyMoverKlineBacktestCandidatePlan = {
  tag: string;
  label: string;
  sourceReadiness: DailyMoverKlineBacktestCandidateSource["readiness"];
  sampleCount: number;
  status: DailyMoverKlineBacktestCandidatePlanStatus;
  plannedSymbols: string[];
  deferredSymbols: string[];
  intervals: OhlcvInterval[];
  candleLimitPerInterval: number;
  plannedRequestCount: number;
  cacheKeys: string[];
  validationWindows: ReadonlyArray<"post_move_24h" | "pre_move_24h">;
  nextStep: string;
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
};

export type DailyMoverKlineBacktestPlan = {
  mode: "planning_only";
  status: DailyMoverKlineBacktestPlanStatus;
  intervals: OhlcvInterval[];
  candleLimitPerInterval: number;
  maxSymbolsPerRun: number;
  dailyRequestBudget: number;
  estimatedRequestCount: number;
  dataSourcePolicy: "public_ohlcv_cache_only_no_coinglass";
  canFetchExternalCandles: false;
  requiresCacheBeforeExecution: true;
  guardrail: string;
  candidatePlans: DailyMoverKlineBacktestCandidatePlan[];
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
};

export type DailyMoverKlineBacktestResultStatus =
  | "not_planned"
  | "partial_cache"
  | "ready"
  | "waiting_for_cache";

export type DailyMoverKlineBacktestCandidateResultStatus =
  | "blocked"
  | "not_planned"
  | "partial_cache"
  | "ready"
  | "waiting_for_cache";

export type DailyMoverKlineBacktestIntervalVerdict =
  | "directional_expansion"
  | "flat"
  | "insufficient_candles";

export type DailyMoverKlineBacktestSymbolVerdict =
  | "insufficient_cache"
  | "neutral"
  | "supports_review";

export type DailyMoverKlineBacktestIntervalResult = {
  cacheKey: string;
  candleCount: number;
  fetchedAt: string;
  firstOpenTime: string;
  interval: OhlcvInterval;
  lastCloseTime: string;
  maxDrawdownPercent: number;
  maxRunupPercent: number;
  returnPercent: number;
  source: string;
  symbol: string;
  verdict: DailyMoverKlineBacktestIntervalVerdict;
  volumeChangePercent: number;
};

export type DailyMoverKlineBacktestSymbolResult = {
  averageReturnPercent: number;
  availableIntervals: OhlcvInterval[];
  canAutoAdjustWeights: false;
  deepestDrawdownPercent: number;
  evidenceSummary: string;
  intervalResults: DailyMoverKlineBacktestIntervalResult[];
  missingIntervals: OhlcvInterval[];
  strongestRunupPercent: number;
  symbol: string;
  verdict: DailyMoverKlineBacktestSymbolVerdict;
  allowedUse: "research_only";
};

export type DailyMoverKlineBacktestCandidateResult = {
  availableCacheKeys: string[];
  cacheCoveragePercent: number;
  canAutoAdjustWeights: false;
  evidenceSummary: string;
  label: string;
  limitation: string;
  missingCacheKeys: string[];
  nextStep: string;
  plannedCacheKeys: string[];
  status: DailyMoverKlineBacktestCandidateResultStatus;
  symbolResults: DailyMoverKlineBacktestSymbolResult[];
  tag: string;
  allowedUse: "research_only";
};

export type DailyMoverKlineBacktestResults = {
  availableCacheKeys: number;
  cacheCoveragePercent: number;
  canAutoAdjustWeights: false;
  candidateResults: DailyMoverKlineBacktestCandidateResult[];
  guardrail: string;
  missingCacheKeys: number;
  mode: "cached_kline_validation";
  status: DailyMoverKlineBacktestResultStatus;
  totalPlannedCacheKeys: number;
  allowedUse: "research_only";
};

export type DailyMoverKlineBacktestPlanOptions = {
  candidates: DailyMoverKlineBacktestCandidateSource[];
  snapshots: DailyMoverSnapshot[];
  candleLimitPerInterval?: number;
  dailyRequestBudget?: number;
  intervals?: OhlcvInterval[];
  maxSymbolsPerRun?: number;
};

export type DailyMoverKlineBacktestResultsOptions = {
  caches: OhlcvCandleCacheEntry[];
  plan: DailyMoverKlineBacktestPlan;
};

const defaultIntervals: OhlcvInterval[] = ["15m", "1h", "4h"];
const defaultCandleLimitPerInterval = 96;
const defaultDailyRequestBudget = 24;
const defaultMaxSymbolsPerRun = 3;

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function snapshotSymbolsForTag(snapshots: DailyMoverSnapshot[], tag: string) {
  return unique(snapshots.flatMap((snapshot) => (
    snapshot.reviews
      .filter((review) => review.radarReview.improvementTags.includes(tag))
      .map((review) => review.symbol)
  )));
}

function buildCacheKeys(symbols: string[], intervals: OhlcvInterval[]) {
  return symbols.flatMap((symbol) => intervals.map((interval) => `${symbol}:${interval}`));
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

function percent(numerator: number, denominator: number) {
  if (denominator === 0) {
    return 0;
  }

  return roundPercent((numerator / denominator) * 100);
}

function cacheMap(caches: OhlcvCandleCacheEntry[]) {
  return new Map(caches.map((cache) => [cache.cacheKey, cache]));
}

function resultStatus({
  availableCacheKeys,
  totalPlannedCacheKeys,
}: {
  availableCacheKeys: number;
  totalPlannedCacheKeys: number;
}): DailyMoverKlineBacktestResultStatus {
  if (totalPlannedCacheKeys === 0) {
    return "not_planned";
  }

  if (availableCacheKeys === 0) {
    return "waiting_for_cache";
  }

  if (availableCacheKeys === totalPlannedCacheKeys) {
    return "ready";
  }

  return "partial_cache";
}

function candidateResultStatus({
  availableCacheKeys,
  plan,
}: {
  availableCacheKeys: number;
  plan: DailyMoverKlineBacktestCandidatePlan;
}): DailyMoverKlineBacktestCandidateResultStatus {
  if (plan.status === "blocked") {
    return "blocked";
  }

  if (plan.cacheKeys.length === 0 || plan.status === "needs_more_samples") {
    return "not_planned";
  }

  if (availableCacheKeys === 0) {
    return "waiting_for_cache";
  }

  if (availableCacheKeys === plan.cacheKeys.length) {
    return "ready";
  }

  return "partial_cache";
}

function candidateResultNextStep(status: DailyMoverKlineBacktestCandidateResultStatus) {
  if (status === "ready") {
    return "可进入只读 K 线级人工验证；仍不能自动改权重。";
  }

  if (status === "partial_cache") {
    return "补齐缓存后再做人工验证，当前只展示已缓存样本。";
  }

  if (status === "waiting_for_cache") {
    return "先运行受保护缓存填充入口，缓存到位后再验证。";
  }

  if (status === "blocked") {
    return "反证或限制条件占优，暂不做 K 线回测。";
  }

  return "等待候选进入缓存计划后再验证。";
}

function intervalResult(cache: OhlcvCandleCacheEntry): DailyMoverKlineBacktestIntervalResult {
  const first = cache.candles[0];
  const last = cache.candles.at(-1);

  if (!first || !last || cache.candles.length < 2) {
    return {
      cacheKey: cache.cacheKey,
      candleCount: cache.candles.length,
      fetchedAt: cache.fetchedAt,
      firstOpenTime: first?.openTime ?? cache.fetchedAt,
      interval: cache.interval,
      lastCloseTime: last?.closeTime ?? cache.fetchedAt,
      maxDrawdownPercent: 0,
      maxRunupPercent: 0,
      returnPercent: 0,
      source: cache.source,
      symbol: cache.symbol,
      verdict: "insufficient_candles",
      volumeChangePercent: 0,
    };
  }

  const highestHigh = Math.max(...cache.candles.map((candle) => candle.high));
  const lowestLow = Math.min(...cache.candles.map((candle) => candle.low));
  const returnPercent = percent(last.close - first.open, first.open);
  const volumeChangePercent = percent(last.volume - first.volume, first.volume);
  const maxRunupPercent = percent(highestHigh - first.open, first.open);
  const maxDrawdownPercent = percent(lowestLow - first.open, first.open);
  const verdict: DailyMoverKlineBacktestIntervalVerdict = Math.abs(returnPercent) >= 5 || Math.abs(volumeChangePercent) >= 50
    ? "directional_expansion"
    : "flat";

  return {
    cacheKey: cache.cacheKey,
    candleCount: cache.candles.length,
    fetchedAt: cache.fetchedAt,
    firstOpenTime: first.openTime,
    interval: cache.interval,
    lastCloseTime: last.closeTime,
    maxDrawdownPercent,
    maxRunupPercent,
    returnPercent,
    source: cache.source,
    symbol: cache.symbol,
    verdict,
    volumeChangePercent,
  };
}

function symbolVerdict(results: DailyMoverKlineBacktestIntervalResult[]): DailyMoverKlineBacktestSymbolVerdict {
  if (results.length === 0) {
    return "insufficient_cache";
  }

  if (results.some((result) => result.verdict === "directional_expansion")) {
    return "supports_review";
  }

  return "neutral";
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return roundPercent(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function buildSymbolResult({
  cacheByKey,
  intervals,
  symbol,
}: {
  cacheByKey: Map<string, OhlcvCandleCacheEntry>;
  intervals: OhlcvInterval[];
  symbol: string;
}): DailyMoverKlineBacktestSymbolResult {
  const intervalResults = intervals
    .map((interval) => cacheByKey.get(`${symbol}:${interval}`))
    .filter((cache): cache is OhlcvCandleCacheEntry => Boolean(cache))
    .map(intervalResult);
  const availableIntervals = intervalResults.map((result) => result.interval);
  const missingIntervals = intervals.filter((interval) => !availableIntervals.includes(interval));
  const strongestRunupPercent = intervalResults.length > 0
    ? Math.max(...intervalResults.map((result) => result.maxRunupPercent))
    : 0;
  const deepestDrawdownPercent = intervalResults.length > 0
    ? Math.min(...intervalResults.map((result) => result.maxDrawdownPercent))
    : 0;
  const verdict = symbolVerdict(intervalResults);

  return {
    averageReturnPercent: average(intervalResults.map((result) => result.returnPercent)),
    availableIntervals,
    canAutoAdjustWeights: false,
    deepestDrawdownPercent,
    evidenceSummary: `${symbol} 已缓存 ${availableIntervals.length}/${intervals.length} 周期，平均涨跌 ${average(intervalResults.map((result) => result.returnPercent))}%`,
    intervalResults,
    missingIntervals,
    strongestRunupPercent,
    symbol,
    verdict,
    allowedUse: "research_only",
  };
}

function candidateNextStep(status: DailyMoverKlineBacktestCandidatePlanStatus) {
  if (status === "cache_plan_ready") {
    return "先建立 K 线缓存窗口，再执行离线验证；本计划不触发外部 K 线请求。";
  }

  if (status === "budget_limited") {
    return "请求预算不足，只规划最小样本缓存，其余样本延后轮转。";
  }

  if (status === "blocked") {
    return "反证或限制条件占优，暂不进入 K 线回测执行。";
  }

  return "样本仍不足，继续积累校准日记和历史异动快照。";
}

function planStatus(candidatePlans: DailyMoverKlineBacktestCandidatePlan[]): DailyMoverKlineBacktestPlanStatus {
  if (candidatePlans.some((plan) => plan.status === "budget_limited")) {
    return "budget_limited";
  }

  if (candidatePlans.some((plan) => plan.status === "cache_plan_ready")) {
    return "cache_plan_ready";
  }

  return "needs_more_samples";
}

export function buildDailyMoverKlineBacktestPlan({
  candidates,
  candleLimitPerInterval = defaultCandleLimitPerInterval,
  dailyRequestBudget = defaultDailyRequestBudget,
  intervals = defaultIntervals,
  maxSymbolsPerRun = defaultMaxSymbolsPerRun,
  snapshots,
}: DailyMoverKlineBacktestPlanOptions): DailyMoverKlineBacktestPlan {
  const intervalCount = Math.max(1, intervals.length);
  let remainingRequestBudget = Math.max(0, dailyRequestBudget);

  const candidatePlans = candidates.map((candidate) => {
    const sourceSymbols = unique([
      ...snapshotSymbolsForTag(snapshots, candidate.tag),
      ...candidate.symbols,
    ]);

    if (candidate.readiness === "blocked") {
      return {
        tag: candidate.tag,
        label: candidate.label,
        sourceReadiness: candidate.readiness,
        sampleCount: candidate.sampleCount,
        status: "blocked" as const,
        plannedSymbols: [],
        deferredSymbols: sourceSymbols,
        intervals,
        candleLimitPerInterval,
        plannedRequestCount: 0,
        cacheKeys: [],
        validationWindows: ["pre_move_24h", "post_move_24h"] as const,
        nextStep: candidateNextStep("blocked"),
        allowedUse: "research_only" as const,
        canAutoAdjustWeights: false as const,
      };
    }

    if (candidate.readiness !== "ready") {
      return {
        tag: candidate.tag,
        label: candidate.label,
        sourceReadiness: candidate.readiness,
        sampleCount: candidate.sampleCount,
        status: "needs_more_samples" as const,
        plannedSymbols: [],
        deferredSymbols: sourceSymbols,
        intervals,
        candleLimitPerInterval,
        plannedRequestCount: 0,
        cacheKeys: [],
        validationWindows: ["pre_move_24h", "post_move_24h"] as const,
        nextStep: candidateNextStep("needs_more_samples"),
        allowedUse: "research_only" as const,
        canAutoAdjustWeights: false as const,
      };
    }

    const budgetLimitedMaxSymbols = Math.floor(remainingRequestBudget / intervalCount);
    const symbolLimit = Math.max(0, Math.min(maxSymbolsPerRun, budgetLimitedMaxSymbols));
    const plannedSymbols = sourceSymbols.slice(0, symbolLimit);
    const deferredSymbols = sourceSymbols.slice(symbolLimit);
    const plannedRequestCount = plannedSymbols.length * intervalCount;
    const status: DailyMoverKlineBacktestCandidatePlanStatus = deferredSymbols.length > 0
      ? "budget_limited"
      : "cache_plan_ready";

    remainingRequestBudget = Math.max(0, remainingRequestBudget - plannedRequestCount);

    return {
      tag: candidate.tag,
      label: candidate.label,
      sourceReadiness: candidate.readiness,
      sampleCount: candidate.sampleCount,
      status,
      plannedSymbols,
      deferredSymbols,
      intervals,
      candleLimitPerInterval,
      plannedRequestCount,
      cacheKeys: buildCacheKeys(plannedSymbols, intervals),
      validationWindows: ["pre_move_24h", "post_move_24h"] as const,
      nextStep: candidateNextStep(status),
      allowedUse: "research_only" as const,
      canAutoAdjustWeights: false as const,
    };
  });

  return {
    mode: "planning_only",
    status: planStatus(candidatePlans),
    intervals,
    candleLimitPerInterval,
    maxSymbolsPerRun,
    dailyRequestBudget,
    estimatedRequestCount: candidatePlans.reduce((total, plan) => total + plan.plannedRequestCount, 0),
    dataSourcePolicy: "public_ohlcv_cache_only_no_coinglass",
    canFetchExternalCandles: false,
    requiresCacheBeforeExecution: true,
    guardrail: "K 线回测阶段先生成缓存计划，不触发外部 K 线请求、不占用 CoinGlass 请求、不自动改权重。",
    candidatePlans,
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
  };
}

export function buildDailyMoverKlineBacktestResults({
  caches,
  plan,
}: DailyMoverKlineBacktestResultsOptions): DailyMoverKlineBacktestResults {
  const cacheByKey = cacheMap(caches);
  const candidateResults = plan.candidatePlans.map((candidatePlan) => {
    const availableCacheKeys = candidatePlan.cacheKeys.filter((key) => cacheByKey.has(key));
    const missingCacheKeys = candidatePlan.cacheKeys.filter((key) => !cacheByKey.has(key));
    const status = candidateResultStatus({
      availableCacheKeys: availableCacheKeys.length,
      plan: candidatePlan,
    });
    const symbolResults = candidatePlan.plannedSymbols.map((symbol) => buildSymbolResult({
      cacheByKey,
      intervals: candidatePlan.intervals,
      symbol,
    }));

    return {
      availableCacheKeys,
      cacheCoveragePercent: percent(availableCacheKeys.length, candidatePlan.cacheKeys.length),
      canAutoAdjustWeights: false as const,
      evidenceSummary: `${candidatePlan.label} 已缓存 ${availableCacheKeys.length}/${candidatePlan.cacheKeys.length} 个 K 线窗口`,
      label: candidatePlan.label,
      limitation: "只基于已缓存公开 K 线窗口，不代表完整历史回测，也不能自动调整权重。",
      missingCacheKeys,
      nextStep: candidateResultNextStep(status),
      plannedCacheKeys: candidatePlan.cacheKeys,
      status,
      symbolResults,
      tag: candidatePlan.tag,
      allowedUse: "research_only" as const,
    };
  });
  const plannedKeys = candidateResults.flatMap((result) => result.plannedCacheKeys);
  const availableCacheKeys = plannedKeys.filter((key) => cacheByKey.has(key)).length;
  const totalPlannedCacheKeys = plannedKeys.length;

  return {
    availableCacheKeys,
    cacheCoveragePercent: percent(availableCacheKeys, totalPlannedCacheKeys),
    canAutoAdjustWeights: false,
    candidateResults,
    guardrail: "K 线结果只读取已缓存公开行情，用于人工复盘和规则验证，不触发外部请求，不自动改权重。",
    missingCacheKeys: totalPlannedCacheKeys - availableCacheKeys,
    mode: "cached_kline_validation",
    status: resultStatus({
      availableCacheKeys,
      totalPlannedCacheKeys,
    }),
    totalPlannedCacheKeys,
    allowedUse: "research_only",
  };
}
