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

type RecentCandle = Candle & {
  index: number;
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

function recentCandles(candles: Candle[], maxLength = 10): RecentCandle[] {
  const start = Math.max(0, candles.length - maxLength);

  return candles.slice(start).map((candle, offset) => ({
    ...candle,
    index: start + offset,
  }));
}

function isSeparated(points: IndexedPoint[]) {
  const [left, right] = points;

  return Boolean(left && right && Math.abs(right.index - left.index) >= 2);
}

function splitHalves(candles: RecentCandle[]) {
  const midpoint = Math.max(1, Math.floor(candles.length / 2));

  return {
    firstHalf: candles.slice(0, midpoint),
    secondHalf: candles.slice(midpoint),
  };
}

function minLow(candles: RecentCandle[]) {
  return Math.min(...candles.map((candle) => candle.low));
}

function maxHigh(candles: RecentCandle[]) {
  return Math.max(...candles.map((candle) => candle.high));
}

function highTouches(candles: RecentCandle[], level: number, tolerancePercent = 1.8) {
  return candles.filter((candle) => percentDiff(candle.high, level) <= tolerancePercent).length;
}

function lowTouches(candles: RecentCandle[], level: number, tolerancePercent = 1.8) {
  return candles.filter((candle) => percentDiff(candle.low, level) <= tolerancePercent).length;
}

function localHighs(candles: Candle[]): IndexedPoint[] {
  return candles
    .map((candle, index) => ({
      index,
      price: candle.high,
    }))
    .filter((point, index, points) => {
      const previous = points[index - 1];
      const next = points[index + 1];

      return previous && next && point.price > previous.price && point.price > next.price;
    });
}

function localLows(candles: Candle[]): IndexedPoint[] {
  return candles
    .map((candle, index) => ({
      index,
      price: candle.low,
    }))
    .filter((point, index, points) => {
      const previous = points[index - 1];
      const next = points[index + 1];

      return previous && next && point.price < previous.price && point.price < next.price;
    });
}

function latestCloseWithin(latestClose: number, low: number, high: number) {
  return latestClose >= low && latestClose <= high;
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

function detectAscendingTriangle(symbol: string, timeframe: TrendTimeframe, candles: Candle[]) {
  const recent = recentCandles(candles, 8);
  const latest = recent.at(-1);

  if (recent.length < 6 || !latest) {
    return null;
  }

  const { firstHalf, secondHalf } = splitHalves(recent);
  const resistance = maxHigh(recent);
  const firstLow = minLow(firstHalf);
  const secondLow = minLow(secondHalf);

  if (highTouches(recent, resistance) < 3 || secondLow <= firstLow * 1.04) {
    return null;
  }

  if (latest.close < resistance * 0.94 || latest.close > resistance * 1.02) {
    return null;
  }

  return makePattern({
    bias: "BULLISH_CONTEXT",
    confidence: 86,
    evidence: [
      `${symbol} ${timeframe} 多次触碰接近压力 ${round(resistance)}，同时低点抬高。`,
      "上升三角只说明压缩和潜在突破前夜，必须等待收盘突破、回踩和量能确认。",
    ],
    invalidationHint: `跌破最近上升低点 ${round(secondLow)} 后，上升三角上下文失效。`,
    timeframe,
    type: "ASCENDING_TRIANGLE",
  });
}

function detectDescendingTriangle(symbol: string, timeframe: TrendTimeframe, candles: Candle[]) {
  const recent = recentCandles(candles, 8);
  const latest = recent.at(-1);

  if (recent.length < 6 || !latest) {
    return null;
  }

  const { firstHalf, secondHalf } = splitHalves(recent);
  const support = minLow(recent);
  const firstHigh = maxHigh(firstHalf);
  const secondHigh = maxHigh(secondHalf);

  if (lowTouches(recent, support) < 3 || secondHigh >= firstHigh * 0.96) {
    return null;
  }

  if (latest.close > support * 1.06 || latest.close < support * 0.98) {
    return null;
  }

  return makePattern({
    bias: "BEARISH_CONTEXT",
    confidence: 86,
    evidence: [
      `${symbol} ${timeframe} 多次触碰接近支撑 ${round(support)}，同时高点降低。`,
      "下降三角只说明压缩和潜在跌破前夜，必须等待收盘跌破、反抽和量能确认。",
    ],
    invalidationHint: `重新站上最近下降高点 ${round(secondHigh)} 后，下降三角上下文失效。`,
    timeframe,
    type: "DESCENDING_TRIANGLE",
  });
}

function detectFibonacciPullback(symbol: string, timeframe: TrendTimeframe, candles: Candle[]) {
  const recent = recentCandles(candles, 12);
  const latest = recent.at(-1);

  if (recent.length < 6 || !latest) {
    return null;
  }

  const lowPoint = recent.reduce<IndexedPoint>((lowest, candle) =>
    candle.low < lowest.price ? { index: candle.index, price: candle.low } : lowest
  , { index: recent[0]?.index ?? 0, price: recent[0]?.low ?? 0 });
  const highPoint = recent.reduce<IndexedPoint>((highest, candle) =>
    candle.high > highest.price ? { index: candle.index, price: candle.high } : highest
  , { index: recent[0]?.index ?? 0, price: recent[0]?.high ?? 0 });
  const range = highPoint.price - lowPoint.price;
  const movePercent = lowPoint.price > 0 ? (range / lowPoint.price) * 100 : 0;

  if (range <= 0 || movePercent < 8) {
    return null;
  }

  if (lowPoint.index < highPoint.index && latest.index > highPoint.index) {
    const zoneLow = highPoint.price - range * 0.618;
    const zoneHigh = highPoint.price - range * 0.382;

    if (!latestCloseWithin(latest.close, zoneLow, zoneHigh)) {
      return null;
    }

    return makePattern({
      bias: "BULLISH_CONTEXT",
      confidence: 72,
      evidence: [
        `${symbol} ${timeframe} 从 ${round(lowPoint.price)} 上冲至 ${round(highPoint.price)} 后回撤到 0.382-0.618 区。`,
        "Fibonacci 只用于位置/RR 参考，不能单独确认做多。",
      ],
      invalidationHint: `跌破 0.618 回撤附近 ${round(zoneLow)} 后，Fibonacci 承接上下文失效。`,
      timeframe,
      type: "FIBONACCI_PULLBACK",
    });
  }

  if (highPoint.index < lowPoint.index && latest.index > lowPoint.index) {
    const zoneLow = lowPoint.price + range * 0.382;
    const zoneHigh = lowPoint.price + range * 0.618;

    if (!latestCloseWithin(latest.close, zoneLow, zoneHigh)) {
      return null;
    }

    return makePattern({
      bias: "BEARISH_CONTEXT",
      confidence: 72,
      evidence: [
        `${symbol} ${timeframe} 从 ${round(highPoint.price)} 下跌至 ${round(lowPoint.price)} 后反抽到 0.382-0.618 区。`,
        "Fibonacci 只用于位置/RR 参考，不能单独确认做空。",
      ],
      invalidationHint: `站上 0.618 反抽附近 ${round(zoneHigh)} 后，Fibonacci 承压上下文失效。`,
      timeframe,
      type: "FIBONACCI_PULLBACK",
    });
  }

  return null;
}

function detectHeadAndShoulders(symbol: string, timeframe: TrendTimeframe, candles: Candle[]) {
  if (candles.length < 7) {
    return null;
  }

  const peaks = localHighs(candles).slice(-3);
  const [leftShoulder, head, rightShoulder] = peaks;
  const latest = candles.at(-1);

  if (!leftShoulder || !head || !rightShoulder || !latest) {
    return null;
  }

  const shouldersClose = percentDiff(leftShoulder.price, rightShoulder.price) <= 7;
  const headAboveShoulders = head.price >= Math.max(leftShoulder.price, rightShoulder.price) * 1.05;
  const necklineCandles = candles.slice(leftShoulder.index + 1, rightShoulder.index);
  const neckline = necklineCandles.length > 0 ? Math.min(...necklineCandles.map((candle) => candle.low)) : null;

  if (!shouldersClose || !headAboveShoulders || neckline === null || latest.close >= neckline * 1.02) {
    return null;
  }

  return makePattern({
    bias: "RISK_CONTEXT",
    confidence: 84,
    evidence: [
      `${symbol} ${timeframe} 出现左肩/头部/右肩高点结构，头部高于两肩。`,
      `最新收盘跌到颈线 ${round(neckline)} 下方，标记衰竭风险，不等于直接做空。`,
    ],
    invalidationHint: `重新站上右肩高点 ${round(rightShoulder.price)} 后，头肩风险上下文失效。`,
    timeframe,
    type: "HEAD_AND_SHOULDERS",
  });
}

function detectInverseHeadAndShoulders(symbol: string, timeframe: TrendTimeframe, candles: Candle[]) {
  if (candles.length < 7) {
    return null;
  }

  const troughs = localLows(candles).slice(-3);
  const [leftShoulder, head, rightShoulder] = troughs;
  const latest = candles.at(-1);

  if (!leftShoulder || !head || !rightShoulder || !latest) {
    return null;
  }

  const shouldersClose = percentDiff(leftShoulder.price, rightShoulder.price) <= 7;
  const headBelowShoulders = head.price <= Math.min(leftShoulder.price, rightShoulder.price) * 0.95;
  const necklineCandles = candles.slice(leftShoulder.index + 1, rightShoulder.index);
  const neckline = necklineCandles.length > 0 ? Math.max(...necklineCandles.map((candle) => candle.high)) : null;

  if (!shouldersClose || !headBelowShoulders || neckline === null || latest.close <= neckline * 0.98) {
    return null;
  }

  return makePattern({
    bias: "BULLISH_CONTEXT",
    confidence: 82,
    evidence: [
      `${symbol} ${timeframe} 出现左肩/头部/右肩低点结构，头部低于两肩。`,
      `最新收盘站到颈线 ${round(neckline)} 上方，标记潜在反转上下文，仍需回踩确认。`,
    ],
    invalidationHint: `再次跌破右肩低点 ${round(rightShoulder.price)} 后，反头肩上下文失效。`,
    timeframe,
    type: "INVERSE_HEAD_AND_SHOULDERS",
  });
}

function detectBullFlag(symbol: string, timeframe: TrendTimeframe, candles: Candle[]) {
  const recent = recentCandles(candles, 9);
  const latest = recent.at(-1);

  if (recent.length < 7 || !latest) {
    return null;
  }

  const impulse = recent.slice(0, 4);
  const flag = recent.slice(4);
  const impulseLow = minLow(impulse);
  const impulseHigh = maxHigh(impulse);
  const impulsePercent = impulseLow > 0 ? ((impulseHigh - impulseLow) / impulseLow) * 100 : 0;
  const flagHighDriftsLower = maxHigh(flag.slice(-2)) <= maxHigh(flag) * 1.01;
  const flagLowAboveMidpoint = minLow(flag) >= impulseLow + (impulseHigh - impulseLow) * 0.45;

  if (impulsePercent < 8 || !flagHighDriftsLower || !flagLowAboveMidpoint || latest.close < minLow(flag) * 1.02) {
    return null;
  }

  return makePattern({
    bias: "BULLISH_CONTEXT",
    confidence: 68,
    evidence: [
      `${symbol} ${timeframe} 前段快速上冲后进入浅回撤整理，符合牛旗辅助上下文。`,
      "旗形必须等待整理上沿突破与回踩确认，不能单独追高。",
    ],
    invalidationHint: `跌回旗形整理低点 ${round(minLow(flag))} 下方后，牛旗上下文失效。`,
    timeframe,
    type: "BULL_FLAG",
  });
}

function detectBearFlag(symbol: string, timeframe: TrendTimeframe, candles: Candle[]) {
  const recent = recentCandles(candles, 9);
  const latest = recent.at(-1);

  if (recent.length < 7 || !latest) {
    return null;
  }

  const impulse = recent.slice(0, 4);
  const flag = recent.slice(4);
  const impulseHigh = maxHigh(impulse);
  const impulseLow = minLow(impulse);
  const impulsePercent = impulseHigh > 0 ? ((impulseHigh - impulseLow) / impulseHigh) * 100 : 0;
  const flagLowDriftsHigher = minLow(flag.slice(-2)) >= minLow(flag) * 0.99;
  const flagHighBelowMidpoint = maxHigh(flag) <= impulseLow + (impulseHigh - impulseLow) * 0.55;

  if (impulsePercent < 8 || !flagLowDriftsHigher || !flagHighBelowMidpoint || latest.close > maxHigh(flag) * 0.98) {
    return null;
  }

  return makePattern({
    bias: "BEARISH_CONTEXT",
    confidence: 68,
    evidence: [
      `${symbol} ${timeframe} 前段快速下跌后进入弱反抽整理，符合熊旗辅助上下文。`,
      "旗形必须等待整理下沿跌破与反抽确认，不能单独追空。",
    ],
    invalidationHint: `站回旗形整理高点 ${round(maxHigh(flag))} 上方后，熊旗上下文失效。`,
    timeframe,
    type: "BEAR_FLAG",
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
      detectHeadAndShoulders(symbol, timeframe, candles),
      detectInverseHeadAndShoulders(symbol, timeframe, candles),
      detectAscendingTriangle(symbol, timeframe, candles),
      detectDescendingTriangle(symbol, timeframe, candles),
      detectDoubleBottom(symbol, timeframe, candles),
      detectDoubleTop(symbol, timeframe, candles),
      detectBullFlag(symbol, timeframe, candles),
      detectBearFlag(symbol, timeframe, candles),
      detectFibonacciPullback(symbol, timeframe, candles),
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
      ? `v3 形态辅助：${dominantPattern.type} 被识别为 ${dominantPattern.bias}，只作为低权重上下文，不能覆盖结构、位置/RR 和 Risk Gate。`
      : "v3 形态辅助：未识别到足够清晰的常用形态，等待更多盘面结构。",
  };
}
