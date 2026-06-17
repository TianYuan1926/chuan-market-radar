import type {
  MarketSignal,
  Timeframe,
} from "../types";
import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import type {
  KeyLevel,
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

function stateAndDecision(scores: TrendScores, timeframes: TrendTimeframeContext[], conflicts: string[]): {
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

function noParticipationReasons(state: TrendState, scores: TrendScores, conflicts: string[]) {
  const reasons = conflicts.map((conflict) => `周期冲突：${conflict}`);

  if (scores.riskScore >= 70) {
    reasons.push(`风险分过高：RiskScore ${scores.riskScore}`);
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
  const stateDecision = stateAndDecision(scores, timeframes, conflicts);
  const noParticipation = noParticipationReasons(stateDecision.state, scores, conflicts);

  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    conflicts,
    decision: stateDecision.decision,
    guardrail: "v3 趋势上下文只解释多周期结构，不改变 live ranking，不自动生成交易结论。",
    nextStep: stateDecision.nextStep,
    noParticipationReasons: noParticipation,
    riskGate: {
      allowed: noParticipation.length === 0,
      blockedBy: noParticipation.map((reason) => reason.split("：")[0] ?? reason),
      mode: "readonly_v3_risk_gate",
    },
    scores,
    state: stateDecision.state,
    summary: `${input.symbol} 多周期结构：${timeframes.map((item) => `${item.timeframe}:${item.structure}`).join(" / ")}。`,
    timeframes,
  };
}
