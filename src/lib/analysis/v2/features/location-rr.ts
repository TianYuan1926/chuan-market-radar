export type LocationDirection = "long" | "short";

export type LocationRiskFlag =
  | "higher_timeframe_resistance_nearby"
  | "higher_timeframe_support_nearby"
  | "reward_risk_below_minimum"
  | "invalid_risk_model";

export type LocationRiskRewardInput = {
  direction: LocationDirection;
  entry: number;
  stop: number;
  targets: number[];
  minRewardRisk?: number;
  higherTimeframeResistance?: number;
  higherTimeframeSupport?: number;
};

export type LocationRiskRewardFacts = {
  direction: LocationDirection;
  entry: number;
  stop: number;
  nearestTarget: number | null;
  nearestBarrier: number | null;
  stopDistance: number;
  targetDistance: number;
  rewardRisk: number | null;
  isTradeEligible: boolean;
  hasTradeSignal: false;
  riskFlags: LocationRiskFlag[];
};

function roundRewardRisk(value: number) {
  return Math.round(value * 100) / 100;
}

function positiveDistance(direction: LocationDirection, from: number, to: number) {
  return direction === "long" ? to - from : from - to;
}

function nearestDirectionalLevel(direction: LocationDirection, entry: number, levels: number[]) {
  const validLevels = levels.filter((level) => positiveDistance(direction, entry, level) > 0);

  if (validLevels.length === 0) {
    return null;
  }

  return direction === "long" ? Math.min(...validLevels) : Math.max(...validLevels);
}

export function evaluateLocationRiskReward({
  direction,
  entry,
  higherTimeframeResistance,
  higherTimeframeSupport,
  minRewardRisk = 3,
  stop,
  targets,
}: LocationRiskRewardInput): LocationRiskRewardFacts {
  const riskFlags: LocationRiskFlag[] = [];
  const stopDistance = positiveDistance(direction, stop, entry);
  const nearestTarget = nearestDirectionalLevel(direction, entry, targets);
  const barrier =
    direction === "long"
      ? higherTimeframeResistance ?? null
      : higherTimeframeSupport ?? null;
  const nearestBarrier =
    barrier !== null && positiveDistance(direction, entry, barrier) > 0 ? barrier : null;
  const effectiveTarget = nearestDirectionalLevel(
    direction,
    entry,
    [nearestTarget, nearestBarrier].filter((level): level is number => level !== null),
  );
  const targetDistance = effectiveTarget === null ? 0 : positiveDistance(direction, entry, effectiveTarget);

  if (nearestBarrier !== null && nearestTarget !== null && targetDistance < positiveDistance(direction, entry, nearestTarget)) {
    riskFlags.push(direction === "long" ? "higher_timeframe_resistance_nearby" : "higher_timeframe_support_nearby");
  }

  if (stopDistance <= 0 || targetDistance <= 0) {
    riskFlags.push("invalid_risk_model");

    return {
      direction,
      entry,
      stop,
      nearestTarget,
      nearestBarrier,
      stopDistance,
      targetDistance,
      rewardRisk: null,
      isTradeEligible: false,
      hasTradeSignal: false,
      riskFlags,
    };
  }

  const rewardRisk = roundRewardRisk(targetDistance / stopDistance);

  if (rewardRisk < minRewardRisk) {
    riskFlags.push("reward_risk_below_minimum");
  }

  return {
    direction,
    entry,
    stop,
    nearestTarget,
    nearestBarrier,
    stopDistance,
    targetDistance,
    rewardRisk,
    isTradeEligible: riskFlags.length === 0,
    hasTradeSignal: false,
    riskFlags,
  };
}
