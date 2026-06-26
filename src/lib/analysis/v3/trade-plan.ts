import type {
  MarketSignal,
} from "../types";
import type {
  StrategyV3TradePlan,
  StrategyV3TrendContext,
  V3LocationDirection,
  V3TradePlanStatus,
} from "./types";

export type BuildV3TradePlanInput = {
  currentPrice: number;
  signal: MarketSignal;
  trendContext: StrategyV3TrendContext;
};

function priceLabel(value: number | null) {
  if (value === null) {
    return "待确认";
  }

  return value >= 100 ? value.toFixed(2) : value.toFixed(6);
}

function directionLabel(direction: V3LocationDirection) {
  if (direction === "long") {
    return "多头";
  }

  if (direction === "short") {
    return "空头";
  }

  return "中性";
}

function waitStatus(direction: V3LocationDirection): V3TradePlanStatus {
  return direction === "short" ? "WAIT_RETEST" : "WAIT_PULLBACK";
}

const minimumPlanRewardRisk = 3;
const maximumPlanStopDistancePercent = 6;

function planQualityFlags({
  currentPrice,
  direction,
  trendContext,
}: {
  currentPrice: number;
  direction: V3LocationDirection;
  trendContext: StrategyV3TrendContext;
}) {
  const location = trendContext.locationRiskReward;

  if (!location || direction === "neutral") {
    return [];
  }

  const flags: string[] = [];
  const minRewardRisk = Math.max(minimumPlanRewardRisk, location.minRewardRisk);
  const structuralStop = location.structuralStop;
  const target = location.nearestTarget;

  if (structuralStop === null || !Number.isFinite(structuralStop)) {
    flags.push("no_structural_stop");
  } else if (direction === "long" && structuralStop >= currentPrice) {
    flags.push("invalid_structural_stop");
  } else if (direction === "short" && structuralStop <= currentPrice) {
    flags.push("invalid_structural_stop");
  }

  if (target === null || !Number.isFinite(target)) {
    flags.push("no_nearest_target");
  } else if (direction === "long" && target <= currentPrice) {
    flags.push("invalid_nearest_target");
  } else if (direction === "short" && target >= currentPrice) {
    flags.push("invalid_nearest_target");
  }

  if (
    location.rewardRisk === null ||
    !Number.isFinite(location.rewardRisk) ||
    location.rewardRisk < minRewardRisk
  ) {
    flags.push("reward_risk_below_minimum");
  }

  if (
    !Number.isFinite(location.stopDistancePercent) ||
    location.stopDistancePercent <= 0 ||
    location.stopDistancePercent > maximumPlanStopDistancePercent
  ) {
    flags.push("stop_distance_too_wide");
  }

  return [...new Set(flags)];
}

function basePlan({
  blockedBy,
  currentPrice,
  direction,
  isPlanEligible,
  status,
  summary,
  trendContext,
}: {
  blockedBy: string[];
  currentPrice: number;
  direction: V3LocationDirection;
  isPlanEligible: boolean;
  status: V3TradePlanStatus;
  summary: string;
  trendContext: StrategyV3TrendContext;
}): StrategyV3TradePlan {
  const location = trendContext.locationRiskReward;
  const structuralStop = location?.structuralStop ?? null;
  const target = location?.nearestTarget ?? null;
  const directionText = directionLabel(direction);
  const entryContext = direction === "long"
    ? "等待支撑回踩承接仍有效后人工确认"
    : direction === "short"
      ? "等待压力反抽承压仍有效后人工确认"
      : "等待方向明确";

  return {
    allowedUse: "research_only",
    blockedBy: [...new Set(blockedBy)],
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    confirmationChecklist: [
      "Risk Gate 已通过或阻断原因已明确",
      "位置/RR 不低于 3:1",
      "回踩/反抽质量已确认",
      "趋势完整度保持健康",
    ],
    direction,
    entryZone: `${directionText}计划草案：${priceLabel(currentPrice)} 附近，${entryContext}。`,
    hasAutoExecution: false,
    invalidation: `结构失效：${priceLabel(structuralStop)} 被有效跌破/收复后计划作废。`,
    isPlanEligible,
    manualReviewRequired: true,
    positionSizing: isPlanEligible ? "只允许小仓试错，禁止追单；仓位需按结构止损距离反推。" : "未满足门控，不给仓位建议。",
    rewardRisk: location?.rewardRisk ?? null,
    status,
    structuralStop,
    summary,
    takeProfitPlan: target === null
      ? "目标位待确认，不能制定分批止盈。"
      : `第一目标 ${priceLabel(target)}；到达前不得移动失效条件，触达后只做分批管理。`,
    targets: target === null ? [] : [target],
  };
}

function missingContextPlan(input: BuildV3TradePlanInput, missing: string[]) {
  return basePlan({
    blockedBy: missing,
    currentPrice: input.currentPrice,
    direction: input.signal.direction,
    isPlanEligible: false,
    status: "BLOCKED",
    summary: `v3 计划草案：缺少 ${missing.join(" / ")}，不能生成结构化计划。`,
    trendContext: input.trendContext,
  });
}

export function buildV3TradePlan(input: BuildV3TradePlanInput): StrategyV3TradePlan {
  const direction = input.signal.direction;
  const missing = [
    input.trendContext.locationRiskReward ? null : "location_rr",
    input.trendContext.reactionQuality ? null : "reaction_quality",
    input.trendContext.trendIntegrity ? null : "trend_integrity",
  ].filter((item): item is string => Boolean(item));

  if (missing.length > 0) {
    return missingContextPlan(input, missing);
  }

  const location = input.trendContext.locationRiskReward;
  const reaction = input.trendContext.reactionQuality;
  const integrity = input.trendContext.trendIntegrity;

  if (!location || !reaction || !integrity) {
    return missingContextPlan(input, missing);
  }

  if (direction === "neutral") {
    return basePlan({
      blockedBy: ["neutral_direction"],
      currentPrice: input.currentPrice,
      direction,
      isPlanEligible: false,
      status: "WATCH_ONLY",
      summary: "v3 计划草案：方向中性，只观察，不生成多空计划。",
      trendContext: input.trendContext,
    });
  }

  if (integrity.status === "EXHAUSTION_RISK") {
    return basePlan({
      blockedBy: integrity.riskFlags,
      currentPrice: input.currentPrice,
      direction,
      isPlanEligible: false,
      status: "WATCH_ONLY",
      summary: "v3 计划草案：趋势衰竭风险只降低追单质量，不反向生成对手方向执行信号。",
      trendContext: input.trendContext,
    });
  }

  if (integrity.status === "DAMAGED_TREND") {
    return basePlan({
      blockedBy: integrity.riskFlags,
      currentPrice: input.currentPrice,
      direction,
      isPlanEligible: false,
      status: "BLOCKED",
      summary: "v3 计划草案：趋势完整度已破坏，计划阻断。",
      trendContext: input.trendContext,
    });
  }

  const planQualityBlockedBy = planQualityFlags({
    currentPrice: input.currentPrice,
    direction,
    trendContext: input.trendContext,
  });

  if (!location.isTradeEligible || !input.trendContext.riskGate.allowed || planQualityBlockedBy.length > 0) {
    return basePlan({
      blockedBy: [
        ...location.riskFlags,
        ...input.trendContext.riskGate.blockedBy,
        ...planQualityBlockedBy,
      ],
      currentPrice: input.currentPrice,
      direction,
      isPlanEligible: false,
      status: "BLOCKED",
      summary: "v3 计划草案：位置/RR 或 Risk Gate 未通过，不能生成可执行草案。",
      trendContext: input.trendContext,
    });
  }

  if (reaction.status !== "CONFIRMED") {
    return basePlan({
      blockedBy: reaction.riskFlags.length > 0 ? reaction.riskFlags : ["reaction_not_confirmed"],
      currentPrice: input.currentPrice,
      direction,
      isPlanEligible: false,
      status: waitStatus(direction),
      summary: direction === "long"
        ? "v3 计划草案：等待回踩承接确认，暂不生成多头执行草案。"
        : "v3 计划草案：等待反抽承压确认，暂不生成空头执行草案。",
      trendContext: input.trendContext,
    });
  }

  if (integrity.status !== "HEALTHY_TREND") {
    return basePlan({
      blockedBy: integrity.riskFlags.length > 0 ? integrity.riskFlags : ["trend_integrity_not_healthy"],
      currentPrice: input.currentPrice,
      direction,
      isPlanEligible: false,
      status: "WATCH_ONLY",
      summary: "v3 计划草案：趋势完整度未达到健康状态，只观察。",
      trendContext: input.trendContext,
    });
  }

  return basePlan({
    blockedBy: [],
    currentPrice: input.currentPrice,
    direction,
    isPlanEligible: true,
    status: direction === "short" ? "READY_SHORT" : "READY_LONG",
    summary: `v3 只读${directionLabel(direction)}计划草案：结构、位置/RR、回踩/反抽、趋势完整度和 Risk Gate 均通过；仍需人工确认，不自动下单。`,
    trendContext: input.trendContext,
  });
}
