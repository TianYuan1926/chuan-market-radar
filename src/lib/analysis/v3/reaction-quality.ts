import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import type {
  KeyLevel,
  StrategyV3ReactionQuality,
  V3LocationDirection,
  V3ReactionRiskFlag,
  V3ReactionStatus,
} from "./types";

export type EvaluateV3ReactionQualityInput = {
  candles: Candle[];
  currentPrice: number;
  direction: V3LocationDirection;
  keyLevels: KeyLevel[];
};

function recentCandles(candles: Candle[]) {
  return candles.slice(-4);
}

function supports(currentPrice: number, levels: KeyLevel[]) {
  return levels
    .filter((level) =>
      level.direction === "SUPPORT" || level.direction === "BOTH"
    )
    .sort((left, right) =>
      distanceToZone(currentPrice, left) - distanceToZone(currentPrice, right) || right.keyScore - left.keyScore
    );
}

function resistances(currentPrice: number, levels: KeyLevel[]) {
  return levels
    .filter((level) =>
      level.direction === "RESISTANCE" || level.direction === "BOTH"
    )
    .sort((left, right) =>
      distanceToZone(currentPrice, left) - distanceToZone(currentPrice, right) || right.keyScore - left.keyScore
    );
}

function distanceToZone(currentPrice: number, level: KeyLevel) {
  if (currentPrice >= level.zoneLow && currentPrice <= level.zoneHigh) {
    return 0;
  }

  return Math.min(Math.abs(currentPrice - level.zoneLow), Math.abs(currentPrice - level.zoneHigh));
}

function touchedSupport(candles: Candle[], level: KeyLevel) {
  return candles.some((candle) => candle.low <= level.zoneHigh && candle.high >= level.zoneLow);
}

function touchedResistance(candles: Candle[], level: KeyLevel) {
  return candles.some((candle) => candle.high >= level.zoneLow && candle.low <= level.zoneHigh);
}

function result({
  direction,
  evidence,
  qualityScore,
  riskFlags = [],
  status,
  summary,
  touchedLevelId,
}: {
  direction: V3LocationDirection;
  evidence: string[];
  qualityScore: number;
  riskFlags?: V3ReactionRiskFlag[];
  status: V3ReactionStatus;
  summary: string;
  touchedLevelId: string | null;
}): StrategyV3ReactionQuality {
  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    direction,
    evidence,
    hasTradeSignal: false,
    qualityScore,
    riskFlags,
    status,
    summary,
    touchedLevelId,
  };
}

function evaluateLong(candles: Candle[], currentPrice: number, keyLevels: KeyLevel[]) {
  const level = supports(currentPrice, keyLevels)[0] ?? null;

  if (!level) {
    return result({
      direction: "long",
      evidence: ["未找到当前价下方或附近的结构支撑。"],
      qualityScore: 0,
      riskFlags: ["no_relevant_level"],
      status: "NO_REACTION",
      summary: "v3 回踩质量：缺少可验证支撑，不能判断承接。",
      touchedLevelId: null,
    });
  }

  const latest = candles.at(-1);
  const recent = recentCandles(candles);
  const touched = touchedSupport(recent, level);

  if (!latest || !touched) {
    return result({
      direction: "long",
      evidence: [`${level.id} 尚未被最近 K 线回踩。`],
      qualityScore: 18,
      riskFlags: ["no_recent_touch"],
      status: "TOO_FAR_FROM_LEVEL",
      summary: "v3 回踩质量：价格还没回到结构支撑附近，继续等待。",
      touchedLevelId: level.id,
    });
  }

  if (latest.close < level.zoneLow) {
    return result({
      direction: "long",
      evidence: [`最新收盘 ${latest.close} 跌破支撑区下沿 ${level.zoneLow}。`],
      qualityScore: 0,
      riskFlags: ["support_lost"],
      status: "FAILED",
      summary: "v3 回踩质量：支撑失守，承接失败。",
      touchedLevelId: level.id,
    });
  }

  if (latest.close > level.zoneHigh && latest.close >= latest.open) {
    return result({
      direction: "long",
      evidence: [`回踩触及 ${level.id} 后重新收回支撑区上沿。`],
      qualityScore: 76,
      status: "CONFIRMED",
      summary: "v3 回踩质量：支撑触达后收回，承接确认进入只读观察。",
      touchedLevelId: level.id,
    });
  }

  return result({
    direction: "long",
    evidence: [`价格触及 ${level.id}，但尚未重新站稳支撑区上沿。`],
    qualityScore: 46,
    status: "REACTION_STARTED",
    summary: "v3 回踩质量：支撑有反应，但还未确认承接。",
    touchedLevelId: level.id,
  });
}

function evaluateShort(candles: Candle[], currentPrice: number, keyLevels: KeyLevel[]) {
  const level = resistances(currentPrice, keyLevels)[0] ?? null;

  if (!level) {
    return result({
      direction: "short",
      evidence: ["未找到当前价上方或附近的结构压力。"],
      qualityScore: 0,
      riskFlags: ["no_relevant_level"],
      status: "NO_REACTION",
      summary: "v3 反抽质量：缺少可验证压力，不能判断承压。",
      touchedLevelId: null,
    });
  }

  const latest = candles.at(-1);
  const recent = recentCandles(candles);
  const touched = touchedResistance(recent, level);

  if (!latest || !touched) {
    return result({
      direction: "short",
      evidence: [`${level.id} 尚未被最近 K 线反抽触达。`],
      qualityScore: 18,
      riskFlags: ["no_recent_touch"],
      status: "TOO_FAR_FROM_LEVEL",
      summary: "v3 反抽质量：价格还没回到结构压力附近，继续等待。",
      touchedLevelId: level.id,
    });
  }

  if (latest.close > level.zoneHigh) {
    return result({
      direction: "short",
      evidence: [`最新收盘 ${latest.close} 重新站上压力区上沿 ${level.zoneHigh}。`],
      qualityScore: 0,
      riskFlags: ["resistance_reclaimed"],
      status: "FAILED",
      summary: "v3 反抽质量：压力被重新收复，承压失败。",
      touchedLevelId: level.id,
    });
  }

  if (latest.close < level.zoneLow && latest.close <= latest.open) {
    return result({
      direction: "short",
      evidence: [`反抽触及 ${level.id} 后重新跌回压力区下沿。`],
      qualityScore: 76,
      status: "CONFIRMED",
      summary: "v3 反抽质量：压力触达后回落，承压确认进入只读观察。",
      touchedLevelId: level.id,
    });
  }

  return result({
    direction: "short",
    evidence: [`价格触及 ${level.id}，但尚未重新跌回压力区下沿。`],
    qualityScore: 46,
    status: "REACTION_STARTED",
    summary: "v3 反抽质量：压力有反应，但还未确认承压。",
    touchedLevelId: level.id,
  });
}

export function evaluateV3ReactionQuality({
  candles,
  currentPrice,
  direction,
  keyLevels,
}: EvaluateV3ReactionQualityInput): StrategyV3ReactionQuality {
  if (direction === "long") {
    return evaluateLong(candles, currentPrice, keyLevels);
  }

  if (direction === "short") {
    return evaluateShort(candles, currentPrice, keyLevels);
  }

  return result({
    direction,
    evidence: ["方向中性，不评估回踩或反抽质量。"],
    qualityScore: 0,
    status: "NO_REACTION",
    summary: "v3 反应质量：方向中性，等待多空结构明确。",
    touchedLevelId: null,
  });
}
