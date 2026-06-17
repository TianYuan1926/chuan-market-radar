import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import type {
  MarketReadingContext,
  MarketReadingEvent,
  MarketReadingEventType,
  MarketReadingStructure,
  TrendTimeframe,
} from "./types";

export type BuildMarketReadingContextInput = {
  candles: Candle[];
  symbol: string;
  timeframe: TrendTimeframe;
};

type SwingPoint = {
  candle: Candle;
  index: number;
  kind: "HIGH" | "LOW";
  price: number;
};

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}

function emptyReading(input: BuildMarketReadingContextInput): MarketReadingContext {
  const latest = input.candles.at(-1);
  const latestClose = latest?.close ?? 0;

  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    events: [],
    latestClose,
    range: {
      high: latestClose,
      low: latestClose,
      widthPercent: 0,
    },
    structure: "INSUFFICIENT_STRUCTURE",
    summary: `${input.symbol} ${input.timeframe} K 线不足，暂不读取结构。`,
    swingHighCount: 0,
    swingLowCount: 0,
    symbol: input.symbol,
    timeframe: input.timeframe,
  };
}

function priorRange(candles: Candle[]) {
  const prior = candles.slice(0, -1);
  const source = prior.length > 0 ? prior : candles;
  const high = Math.max(...source.map((candle) => candle.high));
  const low = Math.min(...source.map((candle) => candle.low));
  const latestClose = candles.at(-1)?.close ?? high;
  const widthPercent = latestClose > 0 ? ((high - low) / latestClose) * 100 : 0;

  return {
    high: round(high),
    low: round(low),
    widthPercent: round(widthPercent),
  };
}

function detectSwings(candles: Candle[]) {
  const swings: SwingPoint[] = [];

  for (let index = 1; index < candles.length - 1; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];
    const next = candles[index + 1];

    if (!previous || !current || !next) {
      continue;
    }

    if (current.high > previous.high && current.high >= next.high) {
      swings.push({
        candle: current,
        index,
        kind: "HIGH",
        price: current.high,
      });
    }

    if (current.low < previous.low && current.low <= next.low) {
      swings.push({
        candle: current,
        index,
        kind: "LOW",
        price: current.low,
      });
    }
  }

  return swings;
}

function structuralEvents(swings: SwingPoint[]): MarketReadingEvent[] {
  const highs = swings.filter((swing) => swing.kind === "HIGH");
  const lows = swings.filter((swing) => swing.kind === "LOW");
  const events: MarketReadingEvent[] = [];
  const previousHigh = highs.at(-2);
  const latestHigh = highs.at(-1);
  const previousLow = lows.at(-2);
  const latestLow = lows.at(-1);

  if (previousHigh && latestHigh) {
    const type: MarketReadingEventType = latestHigh.price > previousHigh.price ? "HH" : "LH";

    events.push({
      candleIndex: latestHigh.index,
      detail: type === "HH" ? "最近 swing high 高于前高。" : "最近 swing high 低于前高。",
      occurredAt: latestHigh.candle.closeTime,
      price: round(latestHigh.price),
      type,
    });
  }

  if (previousLow && latestLow) {
    const type: MarketReadingEventType = latestLow.price > previousLow.price ? "HL" : "LL";

    events.push({
      candleIndex: latestLow.index,
      detail: type === "HL" ? "最近 swing low 高于前低。" : "最近 swing low 低于前低。",
      occurredAt: latestLow.candle.closeTime,
      price: round(latestLow.price),
      type,
    });
  }

  return events.sort((left, right) => left.candleIndex - right.candleIndex);
}

function sequenceStructure(events: MarketReadingEvent[]): MarketReadingStructure {
  const types = new Set(events.map((event) => event.type));

  if (types.has("HH") && types.has("HL")) {
    return "UP_SEQUENCE";
  }

  if (types.has("LH") && types.has("LL")) {
    return "DOWN_SEQUENCE";
  }

  return "RANGE_SEQUENCE";
}

function wickRatio(candle: Candle, side: "lower" | "upper") {
  const range = candle.high - candle.low;

  if (range <= 0) {
    return 0;
  }

  const bodyTop = Math.max(candle.open, candle.close);
  const bodyBottom = Math.min(candle.open, candle.close);

  return side === "upper"
    ? (candle.high - bodyTop) / range
    : (bodyBottom - candle.low) / range;
}

function breakoutEvents(candles: Candle[], range: MarketReadingContext["range"], structure: MarketReadingStructure) {
  const latest = candles.at(-1);

  if (!latest) {
    return [];
  }

  const events: MarketReadingEvent[] = [];

  if (latest.close > range.high) {
    events.push({
      candleIndex: candles.length - 1,
      detail: "最新收盘站上前高区间。",
      occurredAt: latest.closeTime,
      price: round(latest.close),
      type: structure === "DOWN_SEQUENCE" ? "CHOCH_UP" : "BOS_UP",
    });
  } else if (latest.high > range.high && latest.close <= range.high && wickRatio(latest, "upper") >= 0.45) {
    events.push({
      candleIndex: candles.length - 1,
      detail: "上影线刺破前高但收回区间内。",
      occurredAt: latest.closeTime,
      price: round(latest.high),
      type: "FAKE_BREAKOUT",
    });
  }

  if (latest.close < range.low) {
    events.push({
      candleIndex: candles.length - 1,
      detail: "最新收盘跌破前低区间。",
      occurredAt: latest.closeTime,
      price: round(latest.close),
      type: structure === "UP_SEQUENCE" ? "CHOCH_DOWN" : "BOS_DOWN",
    });
  } else if (latest.low < range.low && latest.close >= range.low && wickRatio(latest, "lower") >= 0.45) {
    events.push({
      candleIndex: candles.length - 1,
      detail: "下影线刺破前低但收回区间内。",
      occurredAt: latest.closeTime,
      price: round(latest.low),
      type: "FAKE_BREAKDOWN",
    });
  }

  return events;
}

function summaryFor(input: BuildMarketReadingContextInput, structure: MarketReadingStructure, events: MarketReadingEvent[]) {
  const types = new Set(events.map((event) => event.type));

  if (types.has("FAKE_BREAKOUT")) {
    return `${input.symbol} ${input.timeframe} 盘面结构：上影线刺破区间高点后收回，标记假突破风险。`;
  }

  if (types.has("FAKE_BREAKDOWN")) {
    return `${input.symbol} ${input.timeframe} 盘面结构：下影线刺破区间低点后收回，标记假跌破风险。`;
  }

  if (types.has("BOS_UP") || types.has("CHOCH_UP")) {
    return `${input.symbol} ${input.timeframe} 盘面结构：HH/HL 后收盘突破前高，记录多头结构事实。`;
  }

  if (types.has("BOS_DOWN") || types.has("CHOCH_DOWN")) {
    return `${input.symbol} ${input.timeframe} 盘面结构：LH/LL 后收盘跌破前低，记录空头结构事实。`;
  }

  if (structure === "UP_SEQUENCE") {
    return `${input.symbol} ${input.timeframe} 盘面结构：HH/HL 序列保持，但尚未读取到新突破。`;
  }

  if (structure === "DOWN_SEQUENCE") {
    return `${input.symbol} ${input.timeframe} 盘面结构：LH/LL 序列保持，但尚未读取到新跌破。`;
  }

  return `${input.symbol} ${input.timeframe} 盘面结构：区间序列，等待前高前低被有效突破。`;
}

export function buildMarketReadingContext(input: BuildMarketReadingContextInput): MarketReadingContext {
  if (input.candles.length < 4) {
    return emptyReading(input);
  }

  const swings = detectSwings(input.candles);
  const range = priorRange(input.candles);
  const sequenceEvents = structuralEvents(swings);
  const structure = sequenceStructure(sequenceEvents);
  const events = [
    ...sequenceEvents,
    ...breakoutEvents(input.candles, range, structure),
  ].sort((left, right) => left.candleIndex - right.candleIndex || left.type.localeCompare(right.type));
  const latestClose = input.candles.at(-1)?.close ?? 0;

  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    events,
    latestClose,
    range,
    structure,
    summary: summaryFor(input, structure, events),
    swingHighCount: swings.filter((swing) => swing.kind === "HIGH").length,
    swingLowCount: swings.filter((swing) => swing.kind === "LOW").length,
    symbol: input.symbol,
    timeframe: input.timeframe,
  };
}
