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
  minStopDistancePercent?: number;
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

function rewardRiskAtEntry({
  direction,
  entry,
  structuralStop,
  target,
}: {
  direction: V3LocationDirection;
  entry: number;
  structuralStop: number;
  target: number;
}) {
  const stopDistance = direction === "long"
    ? entry - structuralStop
    : direction === "short"
      ? structuralStop - entry
      : 0;
  const targetDistance = direction === "long"
    ? target - entry
    : direction === "short"
      ? entry - target
      : 0;

  return stopDistance > 0 && targetDistance > 0
    ? round(targetDistance / stopDistance)
    : null;
}

function stopDistancePercentAtEntry({
  direction,
  entry,
  structuralStop,
}: {
  direction: V3LocationDirection;
  entry: number;
  structuralStop: number;
}) {
  const distance = direction === "long"
    ? entry - structuralStop
    : direction === "short"
      ? structuralStop - entry
      : 0;

  return percent(Math.max(0, distance), entry);
}

function waitEntryForMinimumQuality({
  currentPrice,
  direction,
  maxStopDistancePercent,
  minRewardRisk,
  nearestTarget,
  rewardRisk,
  stopDistancePercent,
  structuralStop,
}: {
  currentPrice: number;
  direction: V3LocationDirection;
  maxStopDistancePercent: number;
  minRewardRisk: number;
  nearestTarget: number | null;
  rewardRisk: number | null;
  stopDistancePercent: number;
  structuralStop: number | null;
}) {
  if (
    direction === "neutral" ||
    structuralStop === null ||
    nearestTarget === null ||
    !Number.isFinite(structuralStop) ||
    !Number.isFinite(nearestTarget)
  ) {
    return {
      waitEntryPrice: null,
      waitEntryReason: null,
      waitEntryRewardRisk: null,
      waitEntryStopDistancePercent: null,
    };
  }

  const needsBetterRewardRisk = rewardRisk === null || rewardRisk < minRewardRisk;
  const needsCloserStop = stopDistancePercent > maxStopDistancePercent;

  if (!needsBetterRewardRisk && !needsCloserStop) {
    return {
      waitEntryPrice: null,
      waitEntryReason: null,
      waitEntryRewardRisk: null,
      waitEntryStopDistancePercent: null,
    };
  }

  const maxStopDistanceRatio = Math.max(0.001, maxStopDistancePercent / 100);
  const rrBoundary = direction === "long"
    ? (nearestTarget + minRewardRisk * structuralStop) / (minRewardRisk + 1)
    : (minRewardRisk * structuralStop + nearestTarget) / (minRewardRisk + 1);
  const stopDistanceBoundary = direction === "long"
    ? structuralStop / (1 - maxStopDistanceRatio)
    : structuralStop / (1 + maxStopDistanceRatio);
  const rawEntry = direction === "long"
    ? Math.min(
      currentPrice,
      needsBetterRewardRisk ? rrBoundary : currentPrice,
      needsCloserStop ? stopDistanceBoundary : currentPrice,
    )
    : Math.max(
      currentPrice,
      needsBetterRewardRisk ? rrBoundary : currentPrice,
      needsCloserStop ? stopDistanceBoundary : currentPrice,
    );
  const validEntry = direction === "long"
    ? rawEntry > structuralStop && rawEntry < nearestTarget && rawEntry < currentPrice
    : rawEntry < structuralStop && rawEntry > nearestTarget && rawEntry > currentPrice;

  if (!validEntry) {
    return {
      waitEntryPrice: null,
      waitEntryReason: null,
      waitEntryRewardRisk: null,
      waitEntryStopDistancePercent: null,
    };
  }

  const waitEntryRewardRisk = rewardRiskAtEntry({
    direction,
    entry: rawEntry,
    structuralStop,
    target: nearestTarget,
  });
  const waitEntryStopDistancePercent = stopDistancePercentAtEntry({
    direction,
    entry: rawEntry,
    structuralStop,
  });

  return {
    waitEntryPrice: roundPrice(rawEntry),
    waitEntryReason: needsBetterRewardRisk && needsCloserStop
      ? "wait_for_rr_and_stop_distance"
      : needsBetterRewardRisk
        ? "wait_for_minimum_rr"
        : "wait_for_closer_structural_stop",
    waitEntryRewardRisk,
    waitEntryStopDistancePercent,
  };
}

function firstTradableTarget({
  currentPrice,
  direction,
  maxStopDistancePercent,
  minRewardRisk,
  stopDistance,
  targets,
}: {
  currentPrice: number;
  direction: V3LocationDirection;
  maxStopDistancePercent: number;
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

  const traceableTarget = candidates.find((item) => item.rewardRisk >= minRewardRisk)?.target;

  if (traceableTarget) {
    return traceableTarget;
  }

  return dynamicExtensionTarget({
    currentPrice,
    direction,
    maxStopDistancePercent,
    minRewardRisk,
    nearestNaturalTarget: candidates[0]?.target ?? null,
    stopDistance,
  }) ?? candidates[0]?.target ?? null;
}

function isMajorBlockingLevel(level: KeyLevel | null) {
  if (!level) {
    return false;
  }

  return level.keyScore >= 80 && (
    level.type === "RANGE_HIGH" ||
    level.type === "RANGE_LOW" ||
    level.type === "ROLE_FLIP"
  );
}

function dynamicExtensionTarget({
  currentPrice,
  direction,
  maxStopDistancePercent,
  minRewardRisk,
  nearestNaturalTarget,
  stopDistance,
}: {
  currentPrice: number;
  direction: V3LocationDirection;
  maxStopDistancePercent: number;
  minRewardRisk: number;
  nearestNaturalTarget: KeyLevel | null;
  stopDistance: number;
}) {
  if (direction === "neutral" || currentPrice <= 0 || stopDistance <= 0) {
    return null;
  }

  if (percent(stopDistance, currentPrice) > maxStopDistancePercent * 1.25) {
    return null;
  }

  if (isMajorBlockingLevel(nearestNaturalTarget)) {
    return null;
  }

  const projectedPrice = direction === "long"
    ? currentPrice + stopDistance * (minRewardRisk + 0.1)
    : currentPrice - stopDistance * (minRewardRisk + 0.1);

  if (projectedPrice <= 0) {
    return null;
  }

  const zonePad = Math.max(projectedPrice * 0.0015, stopDistance * 0.04);
  const zoneLow = direction === "long"
    ? projectedPrice
    : Math.max(0, projectedPrice - zonePad);
  const zoneHigh = direction === "long"
    ? projectedPrice + zonePad
    : projectedPrice;

  return {
    confirmationRules: [
      "必须先突破/跌破前方近端小级别结构，不能在阻力/支撑前追单。",
      "动态扩展目标只用于结构盈亏比评估，不能替代真实突破确认。",
    ],
    confluenceScore: nearestNaturalTarget ? Math.min(55, nearestNaturalTarget.confluenceScore) : 45,
    direction: direction === "long" ? "RESISTANCE" : "SUPPORT",
    id: `dynamic_${direction}_extension_${minRewardRisk}r`,
    invalidationRule: direction === "long"
      ? "重新跌回近端结构下方或放量上攻失败，动态扩展目标失效。"
      : "重新站回近端结构上方或放量下破失败，动态扩展目标失效。",
    keyScore: nearestNaturalTarget ? Math.min(68, nearestNaturalTarget.keyScore) : 58,
    midPrice: roundPrice((zoneLow + zoneHigh) / 2),
    reactionScore: 0,
    reasons: [
      "自然目标不足以满足最低 3:1，按结构止损距离推导动态扩展目标。",
      "该目标只证明空间可能，不单独构成交易计划。",
    ],
    status: "POTENTIAL",
    symbol: nearestNaturalTarget?.symbol ?? "UNKNOWN",
    timeframe: nearestNaturalTarget?.timeframe ?? "1h",
    type: "DYNAMIC_LEVEL",
    zoneHigh: roundPrice(zoneHigh),
    zoneLow: roundPrice(zoneLow),
  } satisfies KeyLevel;
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

  if (flags.includes("stop_distance_too_tight")) {
    return "WATCH_LOCATION";
  }

  if (flags.includes("chase_risk") || flags.includes("stop_distance_too_wide")) {
    return "CHASE_RISK";
  }

  return "GOOD_LOCATION";
}

function summaryFor(result: Omit<StrategyV3LocationRiskReward, "summary">) {
  if (result.direction === "neutral") {
    return "v3 位置/结构盈亏比：方向中性，不建立多空盈亏比模型。";
  }

  if (result.structuralStop === null) {
    return "v3 位置/结构盈亏比：缺少结构止损位，只能观察，不能输出交易计划。";
  }

  if (result.nearestTarget === null) {
    return "v3 位置/结构盈亏比：缺少可追溯的前方结构目标，只能观察，不能输出交易计划。";
  }

  if (result.rewardRisk === null) {
    return "v3 位置/结构盈亏比：结构止损或目标距离无效，只能观察。";
  }

  if (result.riskFlags.includes("stop_distance_too_tight")) {
    return "v3 位置/结构盈亏比：结构止损距离过近，容易被正常噪音扫损；只允许继续观察或等待更清晰结构。";
  }

  if (result.rewardRisk < result.minRewardRisk) {
    return result.waitEntryPrice !== null && result.waitEntryPrice !== undefined
      ? `v3 位置/结构盈亏比：当前位置盈亏比 ${result.rewardRisk}:1 低于 ${result.minRewardRisk}:1；只允许等待 ${result.waitEntryPrice} 附近，预计结构盈亏比 ${result.waitEntryRewardRisk}:1 后再复核。`
      : `v3 位置/结构盈亏比：当前盈亏比 ${result.rewardRisk}:1 低于 ${result.minRewardRisk}:1，Risk Gate 阻断。`;
  }

  if (result.riskFlags.includes("chase_risk")) {
    return result.waitEntryPrice !== null && result.waitEntryPrice !== undefined
      ? `v3 位置/结构盈亏比：盈亏比 ${result.rewardRisk}:1 合格，但离结构止损较远；等待 ${result.waitEntryPrice} 附近把止损距离压到 ${result.waitEntryStopDistancePercent}% 后再复核。`
      : `v3 位置/结构盈亏比：盈亏比 ${result.rewardRisk}:1 合格，但离结构止损较远，等待更好回踩/反抽。`;
  }

  if (result.targetLevelId?.startsWith("dynamic_")) {
    return `v3 位置/结构盈亏比：近端小级别目标不足，按结构止损距离推导动态扩展目标，空间支持 ${result.rewardRisk}:1；该目标只能作为空间评估，仍需突破/回踩确认。`;
  }

  return `v3 位置/结构盈亏比：结构止损清楚，前方结构目标支持 ${result.rewardRisk}:1，位置质量合格。`;
}

export function evaluateV3LocationRiskReward({
  currentPrice,
  direction,
  keyLevels,
  maxStopDistancePercent = 6,
  minStopDistancePercent = 0.35,
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
      maxStopDistancePercent,
      stopDistance,
      targets: resistances,
    })
    : direction === "short"
      ? firstTradableTarget({
        currentPrice,
        direction,
        minRewardRisk,
        maxStopDistancePercent,
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

  if (direction !== "neutral" && stopDistance > 0 && stopDistancePercent < minStopDistancePercent) {
    riskFlags.push("stop_distance_too_tight");
  }

  if (rewardRisk !== null && rewardRisk < minRewardRisk) {
    riskFlags.push("reward_risk_below_minimum");
  }

  if (stopDistancePercent > maxStopDistancePercent) {
    riskFlags.push("stop_distance_too_wide");
    riskFlags.push("chase_risk");
  }
  const waitEntry = waitEntryForMinimumQuality({
    currentPrice,
    direction,
    maxStopDistancePercent,
    minRewardRisk,
    nearestTarget,
    rewardRisk,
    stopDistancePercent,
    structuralStop,
  });

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
    ...waitEntry,
  };

  return {
    ...baseResult,
    isTradeEligible: baseResult.riskFlags.length === 0,
    positionQuality: positionQuality(baseResult.riskFlags),
    summary: summaryFor(baseResult),
  };
}
