import type { MarketSignal } from "../types";

export type StrategyV3ReadinessBucket =
  | "conflict_wait"
  | "invalidated"
  | "level_quality_blocked"
  | "manual_review_ready"
  | "missing_v3"
  | "risk_gate_blocked"
  | "rr_blocked"
  | "wait_reaction";

export type StrategyV3ReadinessReport = {
  allowedUse: "research_only";
  blockers: string[];
  bucket: StrategyV3ReadinessBucket;
  canAutoAdjustWeights: false;
  canEnterManualReview: boolean;
  canMutateLiveRanking: false;
  label: string;
  nextStep: string;
  score: number;
  summary: string;
};

const bucketLabels: Record<StrategyV3ReadinessBucket, string> = {
  conflict_wait: "周期冲突等待",
  invalidated: "结构失效",
  level_quality_blocked: "关键位质量阻断",
  manual_review_ready: "可人工复核",
  missing_v3: "缺 v3 地图",
  risk_gate_blocked: "风控阻断",
  rr_blocked: "赔率不足",
  wait_reaction: "等待回踩/反抽",
};

const levelQualityBlockers = new Set([
  "invalid_nearest_target",
  "invalid_structural_stop",
  "no_nearest_target",
  "no_structural_stop",
  "stop_distance_too_wide",
]);

function hasLevelQualityBlocker(blockers: string[]) {
  return blockers.some((blocker) => levelQualityBlockers.has(blocker));
}

function baseReport({
  blockers,
  bucket,
  nextStep,
  score,
  summary,
}: {
  blockers: string[];
  bucket: StrategyV3ReadinessBucket;
  nextStep: string;
  score: number;
  summary: string;
}): StrategyV3ReadinessReport {
  return {
    allowedUse: "research_only",
    blockers: [...new Set(blockers)].filter(Boolean),
    bucket,
    canAutoAdjustWeights: false,
    canEnterManualReview: bucket === "manual_review_ready",
    canMutateLiveRanking: false,
    label: bucketLabels[bucket],
    nextStep,
    score,
    summary,
  };
}

export function evaluateStrategyV3Readiness(signal: MarketSignal): StrategyV3ReadinessReport {
  const strategyV3 = signal.strategyV3;
  const trendContext = strategyV3?.trendContext;
  const tradePlan = strategyV3?.tradePlan;

  if (!strategyV3 || !trendContext) {
    return baseReport({
      blockers: ["missing_strategy_v3_context"],
      bucket: "missing_v3",
      nextStep: "等待 OHLCV、关键位和 Forward Map 补齐后再复核。",
      score: 0,
      summary: "当前观察没有完整 v3 上下文，只能按现有规则观察。",
    });
  }

  if (trendContext.state === "INVALIDATED" || trendContext.decision === "INVALIDATED") {
    return baseReport({
      blockers: trendContext.noParticipationReasons.length > 0
        ? trendContext.noParticipationReasons
        : ["structure_invalidated"],
      bucket: "invalidated",
      nextStep: "结构已失效，等待下一次完整扫描重新建图。",
      score: 5,
      summary: "v3 结构已经失效，不允许进入人工执行复核。",
    });
  }

  if (trendContext.state === "CONFLICT" || trendContext.conflicts.length > 0) {
    return baseReport({
      blockers: trendContext.conflicts.length > 0 ? trendContext.conflicts : ["timeframe_conflict"],
      bucket: "conflict_wait",
      nextStep: trendContext.nextStep,
      score: 25,
      summary: "高低周期或结构证据冲突，先等一致性恢复。",
    });
  }

  const blockedBy = [
    ...trendContext.riskGate.blockedBy,
    ...(tradePlan?.blockedBy ?? []),
    ...trendContext.noParticipationReasons,
  ];
  const rewardRisk = tradePlan?.rewardRisk ?? trendContext.locationRiskReward?.rewardRisk ?? null;
  const rrBlocked = rewardRisk !== null && rewardRisk < 3;

  if (rrBlocked || blockedBy.some((reason) => /reward[_ -]?risk|rr|赔率/i.test(reason))) {
    return baseReport({
      blockers: rewardRisk === null
        ? [...blockedBy, "reward_risk_unknown"]
        : [...blockedBy, `reward_risk_${rewardRisk.toFixed(2)}R_below_3R`],
      bucket: "rr_blocked",
      nextStep: "等待更靠近结构止损的位置，或者放弃该位置。",
      score: 35,
      summary: "v3 赔率不足 3:1，不能进入实战复核。",
    });
  }

  if (hasLevelQualityBlocker(blockedBy)) {
    return baseReport({
      blockers: blockedBy,
      bucket: "level_quality_blocked",
      nextStep: "先修结构止损、目标位和关键位投射质量；不能把缺目标、缺止损或止损过宽的计划推进到人工复核。",
      score: 32,
      summary: "v3 关键位质量不足，结构止损或目标位还不能支撑实战复核。",
    });
  }

  if (!trendContext.riskGate.allowed) {
    return baseReport({
      blockers: blockedBy.length > 0 ? blockedBy : ["risk_gate_blocked"],
      bucket: "risk_gate_blocked",
      nextStep: trendContext.nextStep,
      score: 30,
      summary: "v3 Risk Gate 未通过，只能观察或等待阻断项解除。",
    });
  }

  if (!tradePlan || tradePlan.status === "WAIT_PULLBACK" || tradePlan.status === "WAIT_RETEST") {
    return baseReport({
      blockers: tradePlan?.blockedBy.length ? tradePlan.blockedBy : ["reaction_not_confirmed"],
      bucket: "wait_reaction",
      nextStep: tradePlan?.summary ?? trendContext.nextStep,
      score: 62,
      summary: "v3 结构和风控可继续跟踪，但还缺回踩/反抽确认。",
    });
  }

  if (tradePlan.status === "BLOCKED" || tradePlan.status === "WATCH_ONLY" || !tradePlan.isPlanEligible) {
    return baseReport({
      blockers: blockedBy.length > 0 ? blockedBy : ["trade_plan_not_eligible"],
      bucket: "risk_gate_blocked",
      nextStep: tradePlan.summary,
      score: 45,
      summary: "v3 计划草案尚未满足人工复核条件。",
    });
  }

  return baseReport({
    blockers: [],
    bucket: "manual_review_ready",
    nextStep: "进入人工复核：再次检查触发、失效、仓位和反证，不自动下单。",
    score: 88,
    summary: "v3 结构、位置/结构盈亏比、回踩/反抽、趋势完整度和 Risk Gate 已形成可人工复核状态。",
  });
}
