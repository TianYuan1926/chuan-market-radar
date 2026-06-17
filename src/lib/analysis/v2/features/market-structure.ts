import type { Timeframe } from "../../types";
import type { Candle } from "../../../market/ohlcv/types";
import {
  detectKeyLevels,
} from "./level-detector";

export type SwingPoint = {
  index: number;
  time: string;
  price: number;
};

export type SwingPoints = {
  highs: SwingPoint[];
  lows: SwingPoint[];
};

export type MarketStructureState =
  | "INSUFFICIENT_DATA"
  | "RANGE"
  | "UPTREND"
  | "DOWNTREND"
  | "BULLISH_BREAKOUT"
  | "BEARISH_BREAKDOWN"
  | "INVALIDATED_BREAKOUT";

export type MarketStructureDirection = "BULLISH" | "BEARISH" | "NEUTRAL" | "RISK";

export type MarketStructureFacts = {
  symbol: string;
  timeframe: Timeframe;
  state: MarketStructureState;
  direction: MarketStructureDirection;
  hasTradeSignal: false;
  range?: {
    high: number;
    low: number;
  };
  currentClose?: number;
  swingPoints: SwingPoints;
  facts: string[];
};

export type AnalyzeMarketStructureInput = {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  lookback?: number;
};

function point(index: number, candle: Candle, price: number): SwingPoint {
  return {
    index,
    time: candle.closeTime,
    price,
  };
}

export function detectSwingPoints(candles: Candle[], radius = 1): SwingPoints {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];

  for (let index = radius; index < candles.length - radius; index += 1) {
    const current = candles[index];
    const left = candles.slice(index - radius, index);
    const right = candles.slice(index + 1, index + radius + 1);
    const neighbors = [...left, ...right];

    if (neighbors.every((candle) => current.high > candle.high)) {
      highs.push(point(index, current, current.high));
    }

    if (neighbors.every((candle) => current.low < candle.low)) {
      lows.push(point(index, current, current.low));
    }
  }

  return { highs, lows };
}

function rangeFrom(candles: Candle[]) {
  if (candles.length === 0) {
    return null;
  }

  return {
    high: Math.max(...candles.map((candle) => candle.high)),
    low: Math.min(...candles.map((candle) => candle.low)),
  };
}

function preBreakoutRange(candles: Candle[], lookback: number) {
  if (candles.length < 3) {
    return null;
  }

  const end = candles.length - 2;
  const start = Math.max(0, end - lookback);

  return rangeFrom(candles.slice(start, end));
}

export function analyzeMarketStructure({
  symbol,
  timeframe,
  candles,
  lookback = 20,
}: AnalyzeMarketStructureInput): MarketStructureFacts {
  const swingPoints = detectSwingPoints(candles);
  const latest = candles.at(-1);

  if (!latest || candles.length < 3) {
    return {
      symbol,
      timeframe,
      state: "INSUFFICIENT_DATA",
      direction: "NEUTRAL",
      hasTradeSignal: false,
      swingPoints,
      facts: ["Not enough candles to extract market structure."],
    };
  }

  const breakoutBaseRange = preBreakoutRange(candles, lookback);
  const breakoutCandle = candles.at(-2);

  if (
    breakoutBaseRange &&
    breakoutCandle &&
    breakoutCandle.close > breakoutBaseRange.high &&
    latest.close < breakoutBaseRange.high &&
    latest.close > breakoutBaseRange.low
  ) {
    return {
      symbol,
      timeframe,
      state: "INVALIDATED_BREAKOUT",
      direction: "RISK",
      hasTradeSignal: false,
      range: breakoutBaseRange,
      currentClose: latest.close,
      swingPoints,
      facts: [
        `Prior candle closed above ${breakoutBaseRange.high}, but latest close ${latest.close} fell back inside the range.`,
      ],
    };
  }

  const levels = detectKeyLevels({ candles, lookback });
  const range =
    levels.rangeHigh === null || levels.rangeLow === null
      ? undefined
      : { high: levels.rangeHigh, low: levels.rangeLow };

  if (!range) {
    return {
      symbol,
      timeframe,
      state: "INSUFFICIENT_DATA",
      direction: "NEUTRAL",
      hasTradeSignal: false,
      currentClose: latest.close,
      swingPoints,
      facts: ["Range levels are unavailable."],
    };
  }

  if (latest.close > range.high) {
    return {
      symbol,
      timeframe,
      state: "BULLISH_BREAKOUT",
      direction: "BULLISH",
      hasTradeSignal: false,
      range,
      currentClose: latest.close,
      swingPoints,
      facts: [`Latest close ${latest.close} is above range high ${range.high}.`],
    };
  }

  if (latest.close < range.low) {
    return {
      symbol,
      timeframe,
      state: "BEARISH_BREAKDOWN",
      direction: "BEARISH",
      hasTradeSignal: false,
      range,
      currentClose: latest.close,
      swingPoints,
      facts: [`Latest close ${latest.close} is below range low ${range.low}.`],
    };
  }

  return {
    symbol,
    timeframe,
    state: "RANGE",
    direction: "NEUTRAL",
    hasTradeSignal: false,
    range,
    currentClose: latest.close,
    swingPoints,
    facts: [`Latest close ${latest.close} remains inside ${range.low}-${range.high}.`],
  };
}
