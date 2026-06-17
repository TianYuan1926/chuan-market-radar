import type {
  MarketSignal,
  Timeframe,
} from "../types";
import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import {
  buildMarketReadingContext,
} from "./market-reading-engine";
import {
  evaluateV3LocationRiskReward,
} from "./location-rr";
import {
  evaluateV3ReactionQuality,
} from "./reaction-quality";
import type {
  KeyLevel,
  MarketReadingContext,
  StrategyV3LocationRiskReward,
  StrategyV3ReactionQuality,
  StrategyV3TrendContext,
  TrendDecision,
  TrendScores,
  TrendState,
  TrendTimeframe,
  TrendTimeframeContext,
  TrendTimeframeStructure,
} from "./types";

type SupportedTrendTimeframe = Extract<TrendTimeframe, Timeframe>;

export type BuildStrategyV3TrendContextInput = {
  candlesByTimeframe: Partial<Record<Timeframe, Candle[]>>;
  currentPrice: number;
  keyLevels: KeyLevel[];
  signal: MarketSignal;
  sourceTimeframes: SupportedTrendTimeframe[];
  symbol: string;
};

const timeframeWeights: Record<SupportedTrendTimeframe, number> = {
  "5m": 0.8,
  "15m": 1,
  "1h": 1.15,
  "4h": 1.35,
  "1d": 1.5,
  "1w": 1.7,
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

function timeframeContext(timeframe: SupportedTrendTimeframe, candles: Candle[]): TrendTimeframeContext | null {
  if (candles.length < 3) {
    return null;
  }

  const first = candles[0]?.close;
  const latest = candles.at(-1)?.close;

  if (!first || !latest || first <= 0 || latest <= 0) {
    return null;
  }

  const highest = Math.max(...candles.map((candle) => candle.high));
  const lowest = Math.min(...candles.map((candle) => candle.low));
  const changePercent = ((latest - first) / first) * 100;
  const rangePercent = ((highest - lowest) / latest) * 100;
  const compressionScore = clamp(78 - rangePercent * 5 + (Math.abs(changePercent) <= 3 ? 18 : 0));
  const directionalScore = clamp(Math.abs(changePercent) * 2.4 + (Math.abs(changePercent) >= 6 ? 24 : 0));
  let structure: TrendTimeframeStructure = "RANGE";

  if (changePercent >= 6) {
    structure = "UPTREND";
  } else if (changePercent <= -6) {
    structure = "DOWNTREND";
  } else if (compressionScore >= 58) {
    structure = "COMPRESSING";
  }

  return {
    changePercent: roundPercent(changePercent),
    close: latest,
    compressionScore,
    directionalScore,
    rangePercent: roundPercent(rangePercent),
    structure,
    timeframe,
  };
}

function weightedAverage(values: Array<{ score: number; timeframe: SupportedTrendTimeframe }>) {
  const totalWeight = values.reduce((sum, item) => sum + timeframeWeights[item.timeframe], 0);

  if (totalWeight <= 0) {
    return 0;
  }

  const total = values.reduce((sum, item) => sum + item.score * timeframeWeights[item.timeframe], 0);

  return clamp(total / totalWeight);
}

function hasDirection(context: TrendTimeframeContext, direction: "long" | "short") {
  return direction === "long"
    ? context.structure === "UPTREND"
    : context.structure === "DOWNTREND";
}

function structureConflict(timeframes: TrendTimeframeContext[]) {
  const lowTimeframe = timeframes.find((item) => ["5m", "15m", "1h"].includes(item.timeframe));
  const highTimeframe = [...timeframes].reverse().find((item) => ["4h", "1d", "1w"].includes(item.timeframe));

  if (!lowTimeframe || !highTimeframe) {
    return null;
  }

  if (lowTimeframe.structure === "UPTREND" && highTimeframe.structure === "DOWNTREND") {
    return `${lowTimeframe.timeframe} 上行但 ${highTimeframe.timeframe} 下行，低周期不能推翻高周期。`;
  }

  if (lowTimeframe.structure === "DOWNTREND" && highTimeframe.structure === "UPTREND") {
    return `${lowTimeframe.timeframe} 下行但 ${highTimeframe.timeframe} 上行，低周期不能推翻高周期。`;
  }

  return null;
}

function nearbyLevelRisk(input: BuildStrategyV3TrendContextInput) {
  const nearestResistance = input.keyLevels
    .filter((level) => level.direction === "RESISTANCE" || level.direction === "BOTH")
    .map((level) => Math.abs(level.midPrice - input.currentPrice) / input.currentPrice)
    .sort((left, right) => left - right)[0];

  return typeof nearestResistance === "number" && nearestResistance <= 0.025 ? 18 : 0;
}

function scoresFor(input: BuildStrategyV3TrendContextInput, timeframes: TrendTimeframeContext[]): TrendScores {
  const longPreTrendScore = weightedAverage(timeframes.map((context) => ({
    score: hasDirection(context, "long") ? context.directionalScore : context.structure === "COMPRESSING" ? context.compressionScore * 0.45 : 10,
    timeframe: context.timeframe as SupportedTrendTimeframe,
  })));
  const shortPreTrendScore = weightedAverage(timeframes.map((context) => ({
    score: hasDirection(context, "short") ? context.directionalScore : context.structure === "COMPRESSING" ? context.compressionScore * 0.45 : 10,
    timeframe: context.timeframe as SupportedTrendTimeframe,
  })));
  const longAligned = timeframes.filter((context) => hasDirection(context, "long")).length;
  const shortAligned = timeframes.filter((context) => hasDirection(context, "short")).length;
  const averageRange = timeframes.reduce((sum, context) => sum + context.rangePercent, 0) / Math.max(1, timeframes.length);
  const signalRisk = input.signal.risk === "blocked" || input.signal.risk === "high" ? 28 : input.signal.risk === "medium" ? 14 : 6;
  const riskScore = clamp(signalRisk + nearbyLevelRisk(input) + (averageRange >= 24 ? 10 : 0));
  const trendHoldScore = clamp(Math.max(longAligned, shortAligned) * 26 + (timeframes.length >= 3 ? 12 : 0));
  const exhaustionScore = clamp(riskScore + Math.max(longPreTrendScore, shortPreTrendScore) * 0.22 - trendHoldScore * 0.16);

  return {
    exhaustionScore,
    longPreTrendScore,
    longTrendEnergyScore: clamp(longPreTrendScore - riskScore * 0.28 + longAligned * 8),
    riskScore,
    shortPreTrendScore,
    shortTrendEnergyScore: clamp(shortPreTrendScore - riskScore * 0.28 + shortAligned * 8),
    trendHoldScore,
  };
}

function hasMarketReadingEvent(marketReadings: MarketReadingContext[], eventTypes: string[]) {
  return marketReadings.some((reading) =>
    reading.events.some((event) => eventTypes.includes(event.type))
  );
}

function hasRangeFakeBreakout(marketReadings: MarketReadingContext[]) {
  return marketReadings.some((reading) =>
    reading.structure !== "UP_SEQUENCE"
    && reading.events.some((event) => event.type === "FAKE_BREAKOUT")
  );
}

function hasRangeFakeBreakdown(marketReadings: MarketReadingContext[]) {
  return marketReadings.some((reading) =>
    reading.structure !== "DOWN_SEQUENCE"
    && reading.events.some((event) => event.type === "FAKE_BREAKDOWN")
  );
}

function stateAndDecision(
  scores: TrendScores,
  timeframes: TrendTimeframeContext[],
  conflicts: string[],
  marketReadings: MarketReadingContext[],
): {
  decision: TrendDecision;
  nextStep: string;
  state: TrendState;
} {
  if (conflicts.length > 0) {
    return {
      decision: "CONFLICT_WAIT",
      nextStep: "等待高低周期重新一致后再复核关键位，当前只保留观察。",
      state: "CONFLICT",
    };
  }

  if (hasRangeFakeBreakout(marketReadings)) {
    return {
      decision: "AVOID_CHASE_LONG",
      nextStep: "上影线假突破风险已经出现，不追高，等待重新站回前高或回踩承接后再复核。",
      state: "LONG_EXHAUSTION",
    };
  }

  if (hasRangeFakeBreakdown(marketReadings)) {
    return {
      decision: "AVOID_CHASE_SHORT",
      nextStep: "下影线假跌破风险已经出现，不追空，等待重新跌回前低或反抽承压后再复核。",
      state: "SHORT_EXHAUSTION",
    };
  }

  if (hasMarketReadingEvent(marketReadings, ["BOS_UP", "CHOCH_UP"])) {
    return {
      decision: "WAIT_LONG_PULLBACK",
      nextStep: "盘面已读取到向上结构突破，但仍等待回踩承接、量能质量和 Risk Gate 复核。",
      state: "LONG_BREAKOUT",
    };
  }

  if (hasMarketReadingEvent(marketReadings, ["BOS_DOWN", "CHOCH_DOWN"])) {
    return {
      decision: "WAIT_SHORT_RETEST",
      nextStep: "盘面已读取到向下结构跌破，但仍等待反抽承压、量能质量和 Risk Gate 复核。",
      state: "SHORT_BREAKDOWN",
    };
  }

  const compressionCount = timeframes.filter((context) => context.structure === "COMPRESSING").length;

  if (compressionCount >= Math.ceil(timeframes.length * 0.6)) {
    return {
      decision: "WATCH_ONLY",
      nextStep: "压缩只说明波动收敛，等待方向突破和量能确认。",
      state: "RANGE_COMPRESSION",
    };
  }

  if (scores.longPreTrendScore >= 58 && scores.longPreTrendScore > scores.shortPreTrendScore + 12) {
    return {
      decision: "WAIT_LONG_BREAKOUT",
      nextStep: "多头预趋势占优，但仍要等待突破确认、回踩承接和 Risk Gate。",
      state: "PRE_TREND_LONG",
    };
  }

  if (scores.shortPreTrendScore >= 58 && scores.shortPreTrendScore > scores.longPreTrendScore + 12) {
    return {
      decision: "WAIT_SHORT_BREAKDOWN",
      nextStep: "空头预趋势占优，但仍要等待跌破确认、反抽承压和 Risk Gate。",
      state: "PRE_TREND_SHORT",
    };
  }

  return {
    decision: "WATCH_ONLY",
    nextStep: "结构优势不足，继续观察区间边界和量能变化。",
    state: "RANGE_IDLE",
  };
}

function marketReadingsFor(input: BuildStrategyV3TrendContextInput, timeframes: TrendTimeframeContext[]): MarketReadingContext[] {
  return timeframes.map((context) =>
    buildMarketReadingContext({
      candles: input.candlesByTimeframe[context.timeframe as SupportedTrendTimeframe] ?? [],
      symbol: input.symbol,
      timeframe: context.timeframe,
    })
  );
}

function reactionCandlesFor(input: BuildStrategyV3TrendContextInput) {
  const signalTimeframe = input.sourceTimeframes.find((timeframe) => timeframe === input.signal.timeframe);
  const fallbackTimeframe = input.sourceTimeframes.find((timeframe) => (input.candlesByTimeframe[timeframe]?.length ?? 0) > 0);
  const timeframe = signalTimeframe ?? fallbackTimeframe;

  return timeframe ? input.candlesByTimeframe[timeframe] ?? [] : [];
}

function noParticipationReasons(
  state: TrendState,
  scores: TrendScores,
  conflicts: string[],
  marketReadings: MarketReadingContext[],
  locationRiskReward?: StrategyV3LocationRiskReward,
  reactionQuality?: StrategyV3ReactionQuality,
) {
  const reasons = conflicts.map((conflict) => `周期冲突：${conflict}`);

  if (hasRangeFakeBreakout(marketReadings)) {
    reasons.push("假突破风险：上影线刺破前高后收回区间内，禁止追高。");
  }

  if (hasRangeFakeBreakdown(marketReadings)) {
    reasons.push("假跌破风险：下影线刺破前低后收回区间内，禁止追空。");
  }

  if (scores.riskScore >= 70) {
    reasons.push(`风险分过高：RiskScore ${scores.riskScore}`);
  }

  if (locationRiskReward) {
    if (locationRiskReward.riskFlags.includes("neutral_direction")) {
      reasons.push("位置/RR：方向中性，不建立多空交易计划。");
    }

    if (locationRiskReward.riskFlags.includes("no_structural_stop")) {
      reasons.push("位置/RR：缺少结构止损位。");
    }

    if (locationRiskReward.riskFlags.includes("no_nearest_target")) {
      reasons.push("位置/RR：缺少前方目标位。");
    }

    if (locationRiskReward.riskFlags.includes("reward_risk_below_minimum")) {
      reasons.push(`位置/RR：当前盈亏比 ${locationRiskReward.rewardRisk ?? "无效"}:1 低于 ${locationRiskReward.minRewardRisk}:1。`);
    }

    if (locationRiskReward.riskFlags.includes("stop_distance_too_wide")) {
      reasons.push(`位置/RR：结构止损距离 ${locationRiskReward.stopDistancePercent}% 过远，追入风险偏高。`);
    }

    if (locationRiskReward.riskFlags.includes("chase_risk")) {
      reasons.push("位置/RR：当前位置偏追，等待回踩或反抽到更优区域。");
    }
  }

  if (reactionQuality?.riskFlags.includes("support_lost")) {
    reasons.push("回踩质量：结构支撑失守，承接失败，等待重新站回支撑区。");
  }

  if (reactionQuality?.riskFlags.includes("resistance_reclaimed")) {
    reasons.push("反抽质量：结构压力被收复，承压失败，等待重新跌回压力区。");
  }

  if (state === "RANGE_COMPRESSION") {
    reasons.push("区间压缩尚未给出方向，等待突破和量能确认。");
  }

  if (state === "RANGE_IDLE") {
    reasons.push("结构优势不足，继续观察区间边界和量能变化。");
  }

  if (state === "INVALIDATED") {
    reasons.push("结构已经失效，等待重新构建。");
  }

  return reasons;
}

export function buildStrategyV3TrendContext(input: BuildStrategyV3TrendContextInput): StrategyV3TrendContext {
  const timeframes = input.sourceTimeframes
    .map((timeframe) => timeframeContext(timeframe, input.candlesByTimeframe[timeframe] ?? []))
    .filter((context): context is TrendTimeframeContext => Boolean(context));
  const conflicts = [structureConflict(timeframes)].filter((item): item is string => Boolean(item));
  const scores = scoresFor(input, timeframes);
  const marketReadings = marketReadingsFor(input, timeframes);
  const stateDecision = stateAndDecision(scores, timeframes, conflicts, marketReadings);
  const locationRiskReward = evaluateV3LocationRiskReward({
    currentPrice: input.currentPrice,
    direction: input.signal.direction,
    keyLevels: input.keyLevels,
  });
  const reactionQuality = evaluateV3ReactionQuality({
    candles: reactionCandlesFor(input),
    currentPrice: input.currentPrice,
    direction: input.signal.direction,
    keyLevels: input.keyLevels,
  });
  const noParticipation = noParticipationReasons(
    stateDecision.state,
    scores,
    conflicts,
    marketReadings,
    locationRiskReward,
    reactionQuality,
  );
  const hardReactionFlags = reactionQuality.riskFlags.filter((flag) =>
    flag === "support_lost" || flag === "resistance_reclaimed"
  );
  const blockedBy = [
    ...locationRiskReward.riskFlags,
    ...hardReactionFlags,
    ...noParticipation.map((reason) => reason.split("：")[0] ?? reason),
  ];

  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    conflicts,
    decision: stateDecision.decision,
    guardrail: "v3 趋势上下文只解释多周期结构，不改变 live ranking，不自动生成交易结论。",
    locationRiskReward,
    marketReadings,
    nextStep: stateDecision.nextStep,
    noParticipationReasons: noParticipation,
    reactionQuality,
    riskGate: {
      allowed: noParticipation.length === 0,
      blockedBy: [...new Set(blockedBy)],
      mode: "readonly_v3_risk_gate",
    },
    scores,
    state: stateDecision.state,
    summary: `${input.symbol} 多周期结构：${timeframes.map((item) => `${item.timeframe}:${item.structure}`).join(" / ")}。`,
    timeframes,
  };
}
