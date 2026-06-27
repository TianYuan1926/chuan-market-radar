import type {
  KeyLevel,
  StrategyV3LocationRiskReward,
  V3LocationDirection,
  V3LocationRiskFlag,
  V3PositionQuality,
} from "./types";

export type EvaluateV3LocationRiskRewardInput = {
  currentPrice: number;
  direction: V3LocationDirection;
  keyLevels: KeyLevel[];
  maxStopDistancePercent?: number;
  minRewardRisk?: number;
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPrice(value: number) {
  return Number(value.toFixed(value >= 100 ? 2 : 6));
}

function percent(distance: number, price: number) {
  return price > 0 ? round(distance / price * 100) : 0;
}

function supportsBelow(currentPrice: number, levels: KeyLevel[]) {
  return levels
    .filter((level) =>
      (level.direction === "SUPPORT" || level.direction === "BOTH") &&
      level.zoneHigh < currentPrice
    )
    .sort((left, right) => right.zoneHigh - left.zoneHigh || right.keyScore - left.keyScore);
}

function resistancesAbove(currentPrice: number, levels: KeyLevel[]) {
  return levels
    .filter((level) =>
      (level.direction === "RESISTANCE" || level.direction === "BOTH") &&
      level.zoneLow > currentPrice
    )
    .sort((left, right) => left.zoneLow - right.zoneLow || right.keyScore - left.keyScore);
}

function targetRewardRisk({
  currentPrice,
  direction,
  stopDistance,
  target,
}: {
  currentPrice: number;
  direction: V3LocationDirection;
  stopDistance: number;
  target: KeyLevel;
}) {
  if (stopDistance <= 0) {
    return null;
  }

  const targetDistance = direction === "long"
    ? target.zoneLow - currentPrice
    : direction === "short"
      ? currentPrice - target.zoneHigh
      : 0;

  return targetDistance > 0 ? round(targetDistance / stopDistance) : null;
}

function firstTradableTarget({
  currentPrice,
  direction,
  minRewardRisk,
  stopDistance,
  targets,
}: {
  currentPrice: number;
  direction: V3LocationDirection;
  minRewardRisk: number;
  stopDistance: number;
  targets: KeyLevel[];
}) {
  const candidates = targets
    .map((target) => ({
      rewardRisk: targetRewardRisk({
        currentPrice,
        direction,
        stopDistance,
        target,
      }),
      target,
    }))
    .filter((item): item is { rewardRisk: number; target: KeyLevel } => item.rewardRisk !== null);

  return candidates.find((item) => item.rewardRisk >= minRewardRisk)?.target
    ?? candidates[0]?.target
    ?? null;
}

function positionQuality(flags: V3LocationRiskFlag[]): V3PositionQuality {
  if (flags.includes("neutral_direction")) {
    return "NEUTRAL_DIRECTION";
  }

  if (flags.includes("no_structural_stop")) {
    return "NO_STRUCTURAL_STOP";
  }

  if (flags.includes("no_nearest_target")) {
    return "NO_TARGET";
  }

  if (flags.includes("reward_risk_below_minimum")) {
    return "POOR_RR";
  }

  if (flags.includes("chase_risk") || flags.includes("stop_distance_too_wide")) {
    return "CHASE_RISK";
  }

  return "GOOD_LOCATION";
}

function summaryFor(result: Omit<StrategyV3LocationRiskReward, "summary">) {
  if (result.direction === "neutral") {
    return "v3 位置/RR：方向中性，不建立多空盈亏比模型。";
  }

  if (result.structuralStop === null) {
    return "v3 位置/RR：缺少结构止损位，只能观察，不能输出交易计划。";
  }

  if (result.nearestTarget === null) {
    return "v3 位置/RR：缺少可追溯的前方结构目标，只能观察，不能输出交易计划。";
  }

  if (result.rewardRisk === null) {
    return "v3 位置/RR：结构止损或目标距离无效，只能观察。";
  }

  if (result.rewardRisk < result.minRewardRisk) {
    return `v3 位置/RR：当前盈亏比 ${result.rewardRisk}:1 低于 ${result.minRewardRisk}:1，Risk Gate 阻断。`;
  }

  if (result.riskFlags.includes("chase_risk")) {
    return `v3 位置/RR：盈亏比 ${result.rewardRisk}:1 合格，但离结构止损较远，等待更好回踩/反抽。`;
  }

  return `v3 位置/RR：结构止损清楚，前方结构目标支持 ${result.rewardRisk}:1，位置质量合格。`;
}

export function evaluateV3LocationRiskReward({
  currentPrice,
  direction,
  keyLevels,
  maxStopDistancePercent = 6,
  minRewardRisk = 3,
}: EvaluateV3LocationRiskRewardInput): StrategyV3LocationRiskReward {
  const riskFlags: V3LocationRiskFlag[] = [];

  if (direction === "neutral") {
    riskFlags.push("neutral_direction");
  }

  const supports = supportsBelow(currentPrice, keyLevels);
  const resistances = resistancesAbove(currentPrice, keyLevels);
  const support = supports[0] ?? null;
  const resistance = resistances[0] ?? null;
  const structuralStop = direction === "long"
    ? support?.zoneLow ?? null
    : direction === "short"
      ? resistance?.zoneHigh ?? null
      : null;
  const stopDistance = structuralStop === null
    ? 0
    : direction === "long"
      ? currentPrice - structuralStop
      : direction === "short"
        ? structuralStop - currentPrice
        : 0;
  const target = direction === "long"
    ? firstTradableTarget({
      currentPrice,
      direction,
      minRewardRisk,
      stopDistance,
      targets: resistances,
    })
    : direction === "short"
      ? firstTradableTarget({
        currentPrice,
        direction,
        minRewardRisk,
        stopDistance,
        targets: supports,
      })
      : null;
  const nearestTarget = direction === "long"
    ? target?.zoneLow ?? null
    : direction === "short"
      ? target?.zoneHigh ?? null
      : null;
  const targetDistance = nearestTarget === null
    ? 0
    : direction === "long"
      ? nearestTarget - currentPrice
      : direction === "short"
        ? currentPrice - nearestTarget
        : 0;

  if (direction !== "neutral" && structuralStop === null) {
    riskFlags.push("no_structural_stop");
  }

  if (direction !== "neutral" && nearestTarget === null) {
    riskFlags.push("no_nearest_target");
  }

  const rewardRisk = stopDistance > 0 && targetDistance > 0
    ? round(targetDistance / stopDistance)
    : null;
  const stopDistancePercent = percent(stopDistance, currentPrice);
  const targetDistancePercent = percent(targetDistance, currentPrice);

  if (rewardRisk !== null && rewardRisk < minRewardRisk) {
    riskFlags.push("reward_risk_below_minimum");
  }

  if (stopDistancePercent > maxStopDistancePercent) {
    riskFlags.push("stop_distance_too_wide");
    riskFlags.push("chase_risk");
  }

  const baseResult = {
    allowedUse: "research_only" as const,
    canAutoAdjustWeights: false as const,
    canMutateLiveRanking: false as const,
    currentPrice: roundPrice(currentPrice),
    direction,
    hasTradeSignal: false as const,
    isTradeEligible: riskFlags.length === 0,
    minRewardRisk,
    nearestTarget: nearestTarget === null ? null : roundPrice(nearestTarget),
    positionQuality: positionQuality(riskFlags),
    rewardRisk,
    riskFlags: [...new Set(riskFlags)],
    stopDistance: roundPrice(Math.max(0, stopDistance)),
    stopDistancePercent,
    structuralStop: structuralStop === null ? null : roundPrice(structuralStop),
    targetDistance: roundPrice(Math.max(0, targetDistance)),
    targetDistancePercent,
    targetLevelId: target?.id ?? null,
    stopLevelId: direction === "long" ? support?.id ?? null : resistance?.id ?? null,
  };

  return {
    ...baseResult,
    isTradeEligible: baseResult.riskFlags.length === 0,
    positionQuality: positionQuality(baseResult.riskFlags),
    summary: summaryFor(baseResult),
  };
}
