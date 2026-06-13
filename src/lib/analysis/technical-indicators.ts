import type { Candle } from "../market/ohlcv/types";
import type { EvidencePoint, Timeframe } from "./types";

export type NullableNumberSeries = Array<number | null>;

export type BollingerPoint = {
  middle: number;
  upper: number;
  lower: number;
  width: number;
};

export type SwingPoint = {
  index: number;
  price: number;
};

export type SwingPoints = {
  highs: SwingPoint[];
  lows: SwingPoint[];
};

export type CandlesByTimeframe = Partial<Record<Timeframe, Candle[]>>;

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
  const swings = swingPoints(candles, 1);
  const evidence: EvidencePoint[] = [];

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

  evidence.push({
    label: "Swing 结构点",
    value: `${timeframe} 已识别 ${swings.highs.length} 个局部高点、${swings.lows.length} 个局部低点；结构点用于确认触发和失效。`,
    layer: "indicators",
    polarity: swings.highs.length || swings.lows.length ? "supportive" : "neutral",
  });

  return evidence;
}
