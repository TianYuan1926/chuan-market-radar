import type { Candle } from "../market/ohlcv/types";
import type { EvidencePoint, Timeframe } from "./types";

export type NullableNumberSeries = Array<number | null>;

export type BollingerPoint = {
  middle: number;
  upper: number;
  lower: number;
  width: number;
};

export type MacdPoint = {
  macd: number;
  signal: number;
  histogram: number;
};

export type SwingPoint = {
  index: number;
  price: number;
};

export type SwingPoints = {
  highs: SwingPoint[];
  lows: SwingPoint[];
};

export type VolumeProfileBucket = {
  priceLow: number;
  priceHigh: number;
  midpoint: number;
  volume: number;
};

export type VolumeProfile = {
  buckets: VolumeProfileBucket[];
  pointOfControl: number;
  valueAreaLow: number;
  valueAreaHigh: number;
  totalVolume: number;
};

export type IndicatorFrameSummary = {
  timeframe: Timeframe;
  sampleSize: number;
  emaBias: "bullish" | "bearish" | "neutral";
  rsiState: "overheated" | "oversold" | "neutral" | "unavailable";
  macdBias: "bullish" | "bearish" | "neutral";
  volumeProfile: VolumeProfile | null;
};

export type CandlesByTimeframe = Partial<Record<Timeframe, Candle[]>>;

const indicatorMatrixOrder: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];

function rounded(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function validPeriod(period: number) {
  return Number.isInteger(period) && period > 0;
}

function closeValues(candles: Candle[]) {
  return candles.map((candle) => candle.close);
}

export function ema(values: number[], period: number) {
  if (!values.length || !validPeriod(period)) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const result = [rounded(values[0])];

  for (let index = 1; index < values.length; index += 1) {
    const previous = result[index - 1] ?? values[index - 1];
    result.push(rounded(values[index] * multiplier + previous * (1 - multiplier)));
  }

  return result;
}

export function rsi(values: number[], period: number): NullableNumberSeries {
  const result: NullableNumberSeries = Array(values.length).fill(null);

  if (!validPeriod(period) || values.length <= period) {
    return result;
  }

  for (let index = period; index < values.length; index += 1) {
    let gains = 0;
    let losses = 0;

    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      const delta = values[cursor] - values[cursor - 1];

      if (delta >= 0) {
        gains += delta;
      } else {
        losses += Math.abs(delta);
      }
    }

    const averageGain = gains / period;
    const averageLoss = losses / period;

    if (averageLoss === 0) {
      result[index] = averageGain === 0 ? 50 : 100;
    } else {
      const relativeStrength = averageGain / averageLoss;
      result[index] = rounded(100 - 100 / (1 + relativeStrength), 2);
    }
  }

  return result;
}

function trueRange(candle: Candle, previous?: Candle) {
  if (!previous) {
    return candle.high - candle.low;
  }

  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - previous.close),
    Math.abs(candle.low - previous.close),
  );
}

export function atr(candles: Candle[], period: number): NullableNumberSeries {
  const result: NullableNumberSeries = Array(candles.length).fill(null);

  if (!validPeriod(period) || candles.length < period) {
    return result;
  }

  const ranges = candles.map((candle, index) => trueRange(candle, candles[index - 1]));

  for (let index = period - 1; index < candles.length; index += 1) {
    const window = ranges.slice(index - period + 1, index + 1);
    const average = window.reduce((total, value) => total + value, 0) / period;
    result[index] = rounded(average);
  }

  return result;
}

export function bollinger(values: number[], period: number, multiplier: number): Array<BollingerPoint | null> {
  const result: Array<BollingerPoint | null> = Array(values.length).fill(null);

  if (!validPeriod(period) || values.length < period) {
    return result;
  }

  for (let index = period - 1; index < values.length; index += 1) {
    const window = values.slice(index - period + 1, index + 1);
    const middle = window.reduce((total, value) => total + value, 0) / period;
    const variance = window.reduce((total, value) => total + (value - middle) ** 2, 0) / period;
    const deviation = Math.sqrt(variance);
    const upper = middle + deviation * multiplier;
    const lower = middle - deviation * multiplier;

    result[index] = {
      middle: rounded(middle),
      upper: rounded(upper),
      lower: rounded(lower),
      width: rounded(upper - lower),
    };
  }

  return result;
}

export function macd(values: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): MacdPoint[] {
  if (!values.length || !validPeriod(fastPeriod) || !validPeriod(slowPeriod) || !validPeriod(signalPeriod)) {
    return [];
  }

  if (fastPeriod >= slowPeriod) {
    return [];
  }

  const fast = ema(values, fastPeriod);
  const slow = ema(values, slowPeriod);
  const line = values.map((_, index) => rounded((fast[index] ?? 0) - (slow[index] ?? 0)));
  const signal = ema(line, signalPeriod);

  return line.map((value, index) => ({
    macd: value,
    signal: signal[index] ?? 0,
    histogram: rounded(value - (signal[index] ?? 0)),
  }));
}

export function vwap(candles: Candle[]) {
  const totalVolume = candles.reduce((total, candle) => total + candle.volume, 0);

  if (totalVolume <= 0) {
    return null;
  }

  const weightedPrice = candles.reduce((total, candle) => {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;

    return total + typicalPrice * candle.volume;
  }, 0);

  return rounded(weightedPrice / totalVolume);
}

export function volumeProfile(candles: Candle[], bucketCount = 8): VolumeProfile | null {
  if (!candles.length || !validPeriod(bucketCount)) {
    return null;
  }

  const closes = closeValues(candles);
  const minClose = Math.min(...closes);
  const maxClose = Math.max(...closes);
  const totalVolume = candles.reduce((total, candle) => total + candle.volume, 0);

  if (totalVolume <= 0) {
    return null;
  }

  if (minClose === maxClose) {
    const price = rounded(minClose, 2);

    return {
      buckets: [{
        priceLow: price,
        priceHigh: price,
        midpoint: price,
        volume: rounded(totalVolume, 2),
      }],
      pointOfControl: price,
      valueAreaLow: price,
      valueAreaHigh: price,
      totalVolume: rounded(totalVolume, 2),
    };
  }

  const width = (maxClose - minClose) / bucketCount;
  const buckets: VolumeProfileBucket[] = Array.from({ length: bucketCount }, (_, index) => {
    const priceLow = minClose + width * index;
    const priceHigh = index === bucketCount - 1 ? maxClose : priceLow + width;

    return {
      priceLow: rounded(priceLow, 2),
      priceHigh: rounded(priceHigh, 2),
      midpoint: rounded((priceLow + priceHigh) / 2, 2),
      volume: 0,
    };
  });

  for (const candle of candles) {
    const rawIndex = Math.floor((candle.close - minClose) / width);
    const index = Math.min(bucketCount - 1, Math.max(0, rawIndex));
    const bucket = buckets[index];

    if (bucket) {
      bucket.volume = rounded(bucket.volume + candle.volume, 2);
    }
  }

  const pointBucket = buckets.reduce((strongest, bucket) =>
    bucket.volume > strongest.volume ? bucket : strongest
  );
  const selectedBuckets: VolumeProfileBucket[] = [];
  let selectedVolume = 0;

  for (const bucket of [...buckets].sort((left, right) => right.volume - left.volume)) {
    selectedBuckets.push(bucket);
    selectedVolume += bucket.volume;

    if (selectedVolume >= totalVolume * 0.7) {
      break;
    }
  }

  return {
    buckets,
    pointOfControl: pointBucket.midpoint,
    valueAreaLow: Math.min(...selectedBuckets.map((bucket) => bucket.priceLow)),
    valueAreaHigh: Math.max(...selectedBuckets.map((bucket) => bucket.priceHigh)),
    totalVolume: rounded(totalVolume, 2),
  };
}

export function swingPoints(candles: Candle[], lookback: number): SwingPoints {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];

  if (!validPeriod(lookback) || candles.length < lookback * 2 + 1) {
    return { highs, lows };
  }

  for (let index = lookback; index < candles.length - lookback; index += 1) {
    const left = candles.slice(index - lookback, index);
    const right = candles.slice(index + 1, index + lookback + 1);
    const neighbors = [...left, ...right];
    const candle = candles[index];

    if (neighbors.every((neighbor) => candle.high > neighbor.high)) {
      highs.push({ index, price: candle.high });
    }

    if (neighbors.every((neighbor) => candle.low < neighbor.low)) {
      lows.push({ index, price: candle.low });
    }
  }

  return { highs, lows };
}

function selectedTimeframe(candlesByTimeframe: CandlesByTimeframe): Timeframe | null {
  const priority: Timeframe[] = ["15m", "30m", "1h", "4h", "5m", "1m", "1d", "1w"];

  return priority.find((timeframe) => (candlesByTimeframe[timeframe]?.length ?? 0) >= 5) ?? null;
}

function latestValue<T>(values: Array<T | null>) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== null) {
      return values[index] as T;
    }
  }

  return null;
}

function latestMacd(candles: Candle[]) {
  const closes = closeValues(candles);
  const fastPeriod = Math.min(3, closes.length);
  const slowPeriod = Math.min(5, closes.length);
  const signalPeriod = Math.min(3, closes.length);

  if (fastPeriod >= slowPeriod) {
    return null;
  }

  return macd(closes, fastPeriod, slowPeriod, signalPeriod).at(-1) ?? null;
}

function emaBias(latestFastEma: number | null, latestSlowEma: number | null): IndicatorFrameSummary["emaBias"] {
  if (latestFastEma === null || latestSlowEma === null) {
    return "neutral";
  }

  if (latestFastEma > latestSlowEma) {
    return "bullish";
  }

  if (latestFastEma < latestSlowEma) {
    return "bearish";
  }

  return "neutral";
}

function rsiState(value: number | null): IndicatorFrameSummary["rsiState"] {
  if (value === null) {
    return "unavailable";
  }

  if (value >= 70) {
    return "overheated";
  }

  if (value <= 30) {
    return "oversold";
  }

  return "neutral";
}

function macdBias(point: MacdPoint | null): IndicatorFrameSummary["macdBias"] {
  if (!point) {
    return "neutral";
  }

  if (point.macd > 0 && point.histogram > 0) {
    return "bullish";
  }

  if (point.macd < 0 && point.histogram < 0) {
    return "bearish";
  }

  return "neutral";
}

export function buildIndicatorMatrix(candlesByTimeframe: CandlesByTimeframe): IndicatorFrameSummary[] {
  return indicatorMatrixOrder.flatMap((timeframe) => {
    const candles = candlesByTimeframe[timeframe] ?? [];

    if (candles.length < 5) {
      return [];
    }

    const closes = closeValues(candles);
    const fastEma = ema(closes, Math.min(3, closes.length));
    const slowEma = ema(closes, Math.min(5, closes.length));
    const latestFastEma = fastEma.at(-1) ?? null;
    const latestSlowEma = slowEma.at(-1) ?? null;
    const latestRsi = latestValue(rsi(closes, Math.min(4, closes.length - 1)));
    const macdPoint = latestMacd(candles);

    return [{
      timeframe,
      sampleSize: candles.length,
      emaBias: emaBias(latestFastEma, latestSlowEma),
      rsiState: rsiState(latestRsi),
      macdBias: macdBias(macdPoint),
      volumeProfile: volumeProfile(candles, Math.min(8, candles.length)),
    }];
  });
}

function indicatorMatrixEvidence(matrix: IndicatorFrameSummary[]): EvidencePoint | null {
  if (matrix.length < 2) {
    return null;
  }

  const bullish = matrix.filter((frame) => frame.emaBias === "bullish" && frame.macdBias === "bullish").length;
  const bearish = matrix.filter((frame) => frame.emaBias === "bearish" && frame.macdBias === "bearish").length;
  const summary = matrix
    .map((frame) => `${frame.timeframe} EMA ${frame.emaBias}/MACD ${frame.macdBias}/RSI ${frame.rsiState}`)
    .join("；");

  return {
    label: "多周期指标矩阵",
    value: `${summary}。矩阵只描述指标一致性，不直接触发交易。`,
    layer: "indicators",
    polarity: bullish > bearish ? "supportive" : bearish > bullish ? "conflicting" : "neutral",
  };
}

export function buildTechnicalEvidence(candlesByTimeframe: CandlesByTimeframe): EvidencePoint[] {
  const timeframe = selectedTimeframe(candlesByTimeframe);

  if (!timeframe) {
    return [{
      label: "技术指标数据不足",
      value: "OHLCV 样本不足，指标层只记录缺口，不参与方向判断。",
      layer: "indicators",
      polarity: "neutral",
    }];
  }

  const candles = candlesByTimeframe[timeframe] ?? [];
  const closes = closeValues(candles);
  const fastEma = ema(closes, Math.min(3, closes.length));
  const slowEma = ema(closes, Math.min(5, closes.length));
  const latestFastEma = fastEma.at(-1) ?? null;
  const latestSlowEma = slowEma.at(-1) ?? null;
  const latestRsi = latestValue(rsi(closes, Math.min(4, closes.length - 1)));
  const latestAtr = latestValue(atr(candles, Math.min(3, candles.length)));
  const latestBand = latestValue(bollinger(closes, Math.min(5, closes.length), 2));
  const latestVwap = vwap(candles);
  const macdPoint = latestMacd(candles);
  const profile = volumeProfile(candles, Math.min(8, candles.length));
  const swings = swingPoints(candles, 1);
  const matrix = buildIndicatorMatrix(candlesByTimeframe);
  const evidence: EvidencePoint[] = [];
  const matrixEvidence = indicatorMatrixEvidence(matrix);

  if (matrixEvidence) {
    evidence.push(matrixEvidence);
  }

  if (latestFastEma !== null && latestSlowEma !== null) {
    const supportive = latestFastEma >= latestSlowEma;

    evidence.push({
      label: "EMA 结构",
      value: `${timeframe} EMA 快线 ${latestFastEma.toFixed(2)}，慢线 ${latestSlowEma.toFixed(2)}；${supportive ? "趋势结构偏顺" : "短线结构仍偏弱"}。`,
      layer: "indicators",
      polarity: supportive ? "supportive" : "conflicting",
    });
  }

  if (latestRsi !== null) {
    evidence.push({
      label: "RSI 动能",
      value: `${timeframe} RSI ${latestRsi.toFixed(1)}；${latestRsi >= 70 ? "短线偏热，禁止追高。" : latestRsi <= 30 ? "动能偏弱，等待修复。" : "动能未进入极端区。"}`,
      layer: "indicators",
      polarity: latestRsi >= 70 ? "conflicting" : "neutral",
    });
  }

  if (macdPoint !== null) {
    evidence.push({
      label: "MACD 动能",
      value: `${timeframe} MACD ${macdPoint.macd.toFixed(2)}，signal ${macdPoint.signal.toFixed(2)}，histogram ${macdPoint.histogram.toFixed(2)}；只判断动能切换，不单独追单。`,
      layer: "indicators",
      polarity: macdPoint.histogram > 0 ? "supportive" : macdPoint.histogram < 0 ? "conflicting" : "neutral",
    });
  }

  if (latestAtr !== null) {
    evidence.push({
      label: "ATR 波动",
      value: `${timeframe} ATR ${latestAtr.toFixed(2)}；用于估算失效距离，不能单独作为方向信号。`,
      layer: "indicators",
      polarity: "neutral",
    });
  }

  if (latestBand !== null) {
    evidence.push({
      label: "Bollinger 宽度",
      value: `${timeframe} 布林宽度 ${latestBand.width.toFixed(2)}；宽度越低越接近压缩，突破仍需量价确认。`,
      layer: "indicators",
      polarity: latestBand.width <= latestBand.middle * 0.06 ? "supportive" : "neutral",
    });
  }

  if (latestVwap !== null) {
    evidence.push({
      label: "VWAP 资金均价",
      value: `${timeframe} VWAP ${latestVwap.toFixed(2)}；当前价格相对均价只作为资金位置参考。`,
      layer: "indicators",
      polarity: "neutral",
    });
  }

  if (profile !== null) {
    evidence.push({
      label: "成交量分布",
      value: `${timeframe} POC ${profile.pointOfControl.toFixed(2)}，价值区 ${profile.valueAreaLow.toFixed(2)}-${profile.valueAreaHigh.toFixed(2)}；用于观察支撑阻力，不直接当作买卖点。`,
      layer: "indicators",
      polarity: "neutral",
    });
  }

  evidence.push({
    label: "Swing 结构点",
    value: `${timeframe} 已识别 ${swings.highs.length} 个局部高点、${swings.lows.length} 个局部低点；结构点用于确认触发和失效。`,
    layer: "indicators",
    polarity: swings.highs.length || swings.lows.length ? "supportive" : "neutral",
  });

  return evidence;
}
