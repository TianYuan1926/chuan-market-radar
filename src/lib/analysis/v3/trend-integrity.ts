import type {
  Candle,
} from "@/lib/market/ohlcv/types";
import type {
  MarketReadingContext,
  MarketReadingEventType,
  StrategyV3TrendIntegrity,
  TrendTimeframeContext,
  V3LocationDirection,
  V3TrendIntegrityRiskFlag,
  V3TrendIntegrityStatus,
} from "./types";

export type EvaluateV3TrendIntegrityInput = {
  candles: Candle[];
  direction: V3LocationDirection;
  marketReadings: MarketReadingContext[];
  timeframes: TrendTimeframeContext[];
};

function eventSet(marketReadings: MarketReadingContext[]) {
  return new Set(marketReadings.flatMap((reading) => reading.events.map((event) => event.type)));
}

function hasEvent(events: Set<MarketReadingEventType>, candidates: MarketReadingEventType[]) {
  return candidates.some((candidate) => events.has(candidate));
}

function countAlignedTimeframes(timeframes: TrendTimeframeContext[], direction: V3LocationDirection) {
  return timeframes.filter((timeframe) =>
    direction === "long"
      ? timeframe.structure === "UPTREND"
      : direction === "short"
        ? timeframe.structure === "DOWNTREND"
        : false
  ).length;
}

function result({
  direction,
  evidence,
  integrityScore,
  riskFlags = [],
  status,
  summary,
}: {
  direction: V3LocationDirection;
  evidence: string[];
  integrityScore: number;
  riskFlags?: V3TrendIntegrityRiskFlag[];
  status: V3TrendIntegrityStatus;
  summary: string;
}): StrategyV3TrendIntegrity {
  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    direction,
    evidence,
    hasTradeSignal: false,
    integrityScore,
    riskFlags,
    status,
    summary,
  };
}

function neutralResult(direction: V3LocationDirection, marketReadings: MarketReadingContext[]) {
  if (marketReadings.length === 0) {
    return result({
      direction,
      evidence: ["缺少 Market Reading 上下文，暂不判断趋势完整度。"],
      integrityScore: 0,
      riskFlags: ["insufficient_market_reading"],
      status: "INSUFFICIENT_DATA",
      summary: "v3 趋势完整度：盘面结构样本不足，只保留观察。",
    });
  }

  return result({
    direction,
    evidence: ["方向中性或盘面仍处于区间序列。"],
    integrityScore: 32,
    riskFlags: ["low_alignment"],
    status: "RANGE_BOUND",
    summary: "v3 趋势完整度：趋势序列未形成，等待 HH/HL 或 LH/LL 进一步明确。",
  });
}

function latestWickRisk(candles: Candle[], side: "lower" | "upper") {
  const latest = candles.at(-1);

  if (!latest) {
    return false;
  }

  const range = latest.high - latest.low;

  if (range <= 0) {
    return false;
  }

  const bodyTop = Math.max(latest.open, latest.close);
  const bodyBottom = Math.min(latest.open, latest.close);
  const wickRatio = side === "upper"
    ? (latest.high - bodyTop) / range
    : (bodyBottom - latest.low) / range;

  return wickRatio >= 0.45;
}

function evaluateLong(input: EvaluateV3TrendIntegrityInput, events: Set<MarketReadingEventType>) {
  if (hasEvent(events, ["LL", "BOS_DOWN", "CHOCH_DOWN"])) {
    return result({
      direction: "long",
      evidence: ["多头方向下出现 LL/BOS_DOWN/CHOCH_DOWN，HH/HL 序列被破坏。"],
      integrityScore: 0,
      riskFlags: ["bull_structure_broken"],
      status: "DAMAGED_TREND",
      summary: "v3 趋势完整度：多头结构受损，不能把回调当作健康承接。",
    });
  }

  if (hasEvent(events, ["FAKE_BREAKOUT"]) || latestWickRisk(input.candles, "upper")) {
    return result({
      direction: "long",
      evidence: ["出现假突破或明显上影线，趋势加速质量下降。"],
      integrityScore: 38,
      riskFlags: ["upper_wick_exhaustion"],
      status: "EXHAUSTION_RISK",
      summary: "v3 趋势完整度：上攻后出现衰竭风险，不把它解释成新的做空信号，只降低追高质量。",
    });
  }

  const aligned = countAlignedTimeframes(input.timeframes, "long");

  if (hasEvent(events, ["HH", "HL"]) && aligned > 0) {
    return result({
      direction: "long",
      evidence: [`读取到 HH/HL 且 ${aligned} 个周期保持上行结构。`],
      integrityScore: Math.min(92, 70 + aligned * 8),
      status: "HEALTHY_TREND",
      summary: "v3 趋势完整度：HH/HL 序列与周期方向匹配，趋势结构保持健康。",
    });
  }

  return neutralResult("long", input.marketReadings);
}

function evaluateShort(input: EvaluateV3TrendIntegrityInput, events: Set<MarketReadingEventType>) {
  if (hasEvent(events, ["HH", "BOS_UP", "CHOCH_UP"])) {
    return result({
      direction: "short",
      evidence: ["空头方向下出现 HH/BOS_UP/CHOCH_UP，LH/LL 序列被破坏。"],
      integrityScore: 0,
      riskFlags: ["bear_structure_broken"],
      status: "DAMAGED_TREND",
      summary: "v3 趋势完整度：空头结构受损，不能把反弹当作健康承压。",
    });
  }

  if (hasEvent(events, ["FAKE_BREAKDOWN"]) || latestWickRisk(input.candles, "lower")) {
    return result({
      direction: "short",
      evidence: ["出现假跌破或明显下影线，趋势加速质量下降。"],
      integrityScore: 38,
      riskFlags: ["lower_wick_exhaustion"],
      status: "EXHAUSTION_RISK",
      summary: "v3 趋势完整度：下破后出现衰竭风险，不把它解释成新的做多信号，只降低追空质量。",
    });
  }

  const aligned = countAlignedTimeframes(input.timeframes, "short");

  if (hasEvent(events, ["LH", "LL"]) && aligned > 0) {
    return result({
      direction: "short",
      evidence: [`读取到 LH/LL 且 ${aligned} 个周期保持下行结构。`],
      integrityScore: Math.min(92, 70 + aligned * 8),
      status: "HEALTHY_TREND",
      summary: "v3 趋势完整度：LH/LL 序列与周期方向匹配，趋势结构保持健康。",
    });
  }

  return neutralResult("short", input.marketReadings);
}

export function evaluateV3TrendIntegrity(input: EvaluateV3TrendIntegrityInput): StrategyV3TrendIntegrity {
  const events = eventSet(input.marketReadings);

  if (input.direction === "long") {
    return evaluateLong(input, events);
  }

  if (input.direction === "short") {
    return evaluateShort(input, events);
  }

  return neutralResult(input.direction, input.marketReadings);
}
