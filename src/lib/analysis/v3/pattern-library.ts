import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import type {
  StrategyV3Pattern,
  StrategyV3PatternLibrary,
  TrendTimeframe,
} from "./types";

export type BuildV3PatternLibraryInput = {
  candlesByTimeframe: Partial<Record<TrendTimeframe, Candle[]>>;
  sourceTimeframes: TrendTimeframe[];
  symbol: string;
};

type IndexedPoint = {
  index: number;
  price: number;
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function percentDiff(left: number, right: number) {
  const base = Math.max(0.000001, Math.min(Math.abs(left), Math.abs(right)));

  return Math.abs(left - right) / base * 100;
}

function twoLowest(candles: Candle[]): IndexedPoint[] {
  return candles
    .map((candle, index) => ({
      index,
      price: candle.low,
    }))
    .sort((left, right) => left.price - right.price)
    .slice(0, 2)
    .sort((left, right) => left.index - right.index);
}

function twoHighest(candles: Candle[]): IndexedPoint[] {
  return candles
    .map((candle, index) => ({
      index,
      price: candle.high,
    }))
    .sort((left, right) => right.price - left.price)
    .slice(0, 2)
    .sort((left, right) => left.index - right.index);
}

function isSeparated(points: IndexedPoint[]) {
  const [left, right] = points;

  return Boolean(left && right && Math.abs(right.index - left.index) >= 2);
}

function makePattern(input: {
  bias: StrategyV3Pattern["bias"];
  confidence: number;
  evidence: string[];
  invalidationHint: string;
  timeframe: TrendTimeframe;
  type: StrategyV3Pattern["type"];
}): StrategyV3Pattern {
  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    hasTradeSignal: false,
    ...input,
  };
}

function detectDoubleBottom(symbol: string, timeframe: TrendTimeframe, candles: Candle[]) {
  if (candles.length < 5) {
    return null;
  }

  const lows = twoLowest(candles);
  const [first, second] = lows;
  const latest = candles.at(-1);

  if (!first || !second || !latest || !isSeparated(lows)) {
    return null;
  }

  const diff = percentDiff(first.price, second.price);

  if (diff > 1.5 || latest.close <= Math.max(first.price, second.price) * 1.04) {
    return null;
  }

  return makePattern({
    bias: "BULLISH_CONTEXT",
    confidence: Math.min(84, 68 + Math.round((1.5 - diff) * 8)),
    evidence: [
      `${symbol} ${timeframe} 两次低点接近，价差 ${round(diff)}%。`,
      "最新收盘远离双底低点，但该形态只能作为低权重上下文。",
    ],
    invalidationHint: `再次跌破双底低点 ${round(Math.min(first.price, second.price))} 后，双底上下文失效。`,
    timeframe,
    type: "DOUBLE_BOTTOM",
  });
}

function detectDoubleTop(symbol: string, timeframe: TrendTimeframe, candles: Candle[]) {
  if (candles.length < 5) {
    return null;
  }

  const highs = twoHighest(candles);
  const [first, second] = highs;
  const latest = candles.at(-1);

  if (!first || !second || !latest || !isSeparated(highs)) {
    return null;
  }

  const diff = percentDiff(first.price, second.price);

  if (diff > 1.5 || latest.close >= Math.min(first.price, second.price) * 0.98) {
    return null;
  }

  return makePattern({
    bias: "BEARISH_CONTEXT",
    confidence: Math.min(84, 68 + Math.round((1.5 - diff) * 8)),
    evidence: [
      `${symbol} ${timeframe} 两次高点接近，价差 ${round(diff)}%。`,
      "最新收盘从双顶附近回落，但该形态只能作为低权重风险上下文。",
    ],
    invalidationHint: `重新站上双顶高点 ${round(Math.max(first.price, second.price))} 后，双顶上下文失效。`,
    timeframe,
    type: "DOUBLE_TOP",
  });
}

export function buildV3PatternLibrary({
  candlesByTimeframe,
  sourceTimeframes,
  symbol,
}: BuildV3PatternLibraryInput): StrategyV3PatternLibrary {
  const patterns = sourceTimeframes.flatMap((timeframe) => {
    const candles = candlesByTimeframe[timeframe] ?? [];
    const detected = [
      detectDoubleBottom(symbol, timeframe, candles),
      detectDoubleTop(symbol, timeframe, candles),
    ];

    return detected.filter((pattern): pattern is StrategyV3Pattern => Boolean(pattern));
  })
    .sort((left, right) => right.confidence - left.confidence);
  const dominantPattern = patterns[0] ?? null;

  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    dominantPattern,
    hasTradeSignal: false,
    maxWeightPercent: 10,
    patterns: patterns.slice(0, 4),
    summary: dominantPattern
      ? `v3 形态辅助：${dominantPattern.type} 被识别为 ${dominantPattern.bias}，只作为低权重上下文。`
      : "v3 形态辅助：未识别到足够清晰的常用形态，等待更多盘面结构。",
  };
}
