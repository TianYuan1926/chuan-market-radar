import type { DailyMoverSnapshot } from "./daily-movers";
import type { OhlcvInterval } from "./ohlcv/types";

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

export type DailyMoverKlineBacktestPlanOptions = {
  candidates: DailyMoverKlineBacktestCandidateSource[];
  snapshots: DailyMoverSnapshot[];
  candleLimitPerInterval?: number;
  dailyRequestBudget?: number;
  intervals?: OhlcvInterval[];
  maxSymbolsPerRun?: number;
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
