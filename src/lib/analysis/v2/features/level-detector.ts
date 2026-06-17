import type { Candle } from "../../../market/ohlcv/types";

export type KeyLevels = {
  rangeHigh: number | null;
  rangeLow: number | null;
  previousHigh: number | null;
  previousLow: number | null;
  breakoutLevel: number | null;
  breakdownLevel: number | null;
  bullishInvalidationLevel: number | null;
  bearishInvalidationLevel: number | null;
};

export type DetectKeyLevelsInput = {
  candles: Candle[];
  lookback?: number;
};

function finiteMax(values: number[]): number | null {
  return values.length > 0 ? Math.max(...values) : null;
}

function finiteMin(values: number[]): number | null {
  return values.length > 0 ? Math.min(...values) : null;
}

export function referenceCandles(candles: Candle[], lookback = 20): Candle[] {
  if (candles.length <= 1) {
    return [];
  }

  const end = candles.length - 1;
  const start = Math.max(0, end - lookback);

  return candles.slice(start, end);
}

export function detectKeyLevels({
  candles,
  lookback = 20,
}: DetectKeyLevelsInput): KeyLevels {
  const rangeCandles = referenceCandles(candles, lookback);
  const previousCandle = rangeCandles.at(-1);
  const rangeHigh = finiteMax(rangeCandles.map((candle) => candle.high));
  const rangeLow = finiteMin(rangeCandles.map((candle) => candle.low));

  return {
    rangeHigh,
    rangeLow,
    previousHigh: previousCandle?.high ?? null,
    previousLow: previousCandle?.low ?? null,
    breakoutLevel: rangeHigh,
    breakdownLevel: rangeLow,
    bullishInvalidationLevel: rangeLow,
    bearishInvalidationLevel: rangeHigh,
  };
}
