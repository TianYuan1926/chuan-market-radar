import type {
  ForwardLevel,
  ForwardLevelRole,
  KeyLevel,
} from "./types";

export type BuildForwardLevelMapInput = {
  currentPrice: number;
  levels: KeyLevel[];
  symbol: string;
};

function timeframeWeight(level: KeyLevel) {
  const weights: Record<KeyLevel["timeframe"], number> = {
    "5m": 0.25,
    "15m": 0.35,
    "1h": 0.55,
    "4h": 0.75,
    "1d": 0.9,
    "1w": 1,
    "1M": 1,
  };

  return weights[level.timeframe] ?? 0.5;
}

function toForwardLevel(level: KeyLevel, role: ForwardLevelRole): ForwardLevel {
  return {
    id: `${level.symbol}-${role.toLowerCase()}-${level.id}`,
    symbol: level.symbol,
    side: level.direction === "RESISTANCE" ? "RESISTANCE" : "SUPPORT",
    role,
    zoneLow: level.zoneLow,
    zoneHigh: level.zoneHigh,
    timeframeWeight: timeframeWeight(level),
    keyScore: level.keyScore,
    status: "AHEAD",
    reasons: [...level.reasons],
    confirmationRules: [...level.confirmationRules],
    invalidationRules: [level.invalidationRule],
    sourceLevelIds: [level.id],
  };
}

export function buildForwardLevelMap({
  currentPrice,
  levels,
  symbol,
}: BuildForwardLevelMapInput): ForwardLevel[] {
  const supports = levels
    .filter((level) => level.symbol === symbol && level.direction === "SUPPORT" && level.zoneHigh < currentPrice)
    .sort((first, second) => second.zoneHigh - first.zoneHigh || second.keyScore - first.keyScore)
    .slice(0, 3);
  const resistances = levels
    .filter((level) => level.symbol === symbol && level.direction === "RESISTANCE" && level.zoneLow > currentPrice)
    .sort((first, second) => first.zoneLow - second.zoneLow || second.keyScore - first.keyScore)
    .slice(0, 3);
  const map: ForwardLevel[] = [];

  supports.forEach((level, index) => {
    const role: ForwardLevelRole = index === 0
      ? "CURRENT_DEFENSE"
      : "NEXT_REACTION_ZONE";

    map.push(toForwardLevel(level, role));
  });

  resistances.forEach((level, index) => {
    const role: ForwardLevelRole = index === 0
      ? "FIRST_REBOUND_RESISTANCE"
      : index === 1
        ? "SECOND_REBOUND_RESISTANCE"
        : "TREND_CHANGE_LEVEL";

    map.push(toForwardLevel(level, role));
  });

  if (supports[0]) {
    map.push(toForwardLevel(supports[0], "INVALIDATION_LEVEL"));
  }

  if (resistances[0] && !map.some((item) => item.role === "TREND_CHANGE_LEVEL")) {
    map.push(toForwardLevel(resistances[0], "TREND_CHANGE_LEVEL"));
  }

  return map;
}
