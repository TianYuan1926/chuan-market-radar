import type {
  EvidenceItem,
  EvidenceTimeframe,
} from "../evidence/evidence-types";

export type IndicatorInterpretationInput = {
  symbol: string;
  timeframe: EvidenceTimeframe;
  createdAt: string;
  rsi?: number;
  macdCross?: "bullish" | "bearish";
  macdHistogram?: number;
  bollingerWidthPercentile?: number;
  structureState?: string;
};

export type IgnoredIndicatorSignal = {
  indicator: string;
  reason: string;
};

export type IndicatorInterpretation = {
  evidence: EvidenceItem[];
  ignoredSignals: IgnoredIndicatorSignal[];
};

function evidenceId(input: IndicatorInterpretationInput, label: string) {
  return `indicator:${input.symbol}:${input.timeframe}:${label}`;
}

function indicatorEvidence(
  input: IndicatorInterpretationInput,
  item: Pick<EvidenceItem, "family" | "label" | "direction" | "strength" | "confidence" | "weightHint" | "fact" | "reasoning">,
): EvidenceItem {
  return {
    id: evidenceId(input, item.label),
    symbol: input.symbol,
    timeframe: input.timeframe,
    family: item.family,
    source: "indicator_interpreter",
    label: item.label,
    direction: item.direction,
    strength: item.strength,
    confidence: item.confidence,
    weightHint: item.weightHint,
    dataFreshness: "fresh",
    fact: item.fact,
    reasoning: item.reasoning,
    createdAt: input.createdAt,
  };
}

export function interpretIndicatorSnapshot(input: IndicatorInterpretationInput): IndicatorInterpretation {
  const evidence: EvidenceItem[] = [];
  const ignoredSignals: IgnoredIndicatorSignal[] = [];

  if (input.rsi !== undefined && input.rsi >= 70) {
    evidence.push(indicatorEvidence(input, {
      family: "TECHNICAL_INDICATOR",
      label: "rsi_overbought_context",
      direction: input.structureState === "UPTREND" ? "RISK" : "NEUTRAL",
      strength: Math.min(100, input.rsi),
      confidence: 76,
      weightHint: 0.06,
      fact: `RSI is ${input.rsi}, which is in the overbought zone.`,
      reasoning: "RSI overbought is not a short signal; it only adds chase or exhaustion context.",
    }));
    ignoredSignals.push({
      indicator: "RSI",
      reason: "RSI overbought cannot directly produce a short signal.",
    });
  }

  if (input.macdCross) {
    evidence.push(indicatorEvidence(input, {
      family: "TECHNICAL_INDICATOR",
      label: `macd_${input.macdCross}_cross_context`,
      direction: "NEUTRAL",
      strength: input.macdHistogram === undefined ? 50 : Math.min(80, Math.abs(input.macdHistogram) * 100),
      confidence: 72,
      weightHint: 0.05,
      fact: `MACD has a ${input.macdCross} cross${input.macdHistogram === undefined ? "" : ` with histogram ${input.macdHistogram}`}.`,
      reasoning: "MACD cross requires structure confirmation before it can support a directional hypothesis.",
    }));
    ignoredSignals.push({
      indicator: "MACD",
      reason: "MACD cross cannot directly produce a buy or sell signal.",
    });
  }

  if (input.bollingerWidthPercentile !== undefined && input.bollingerWidthPercentile <= 15) {
    evidence.push(indicatorEvidence(input, {
      family: "VOLUME_VOLATILITY",
      label: "bollinger_squeeze",
      direction: "NEUTRAL",
      strength: Math.max(55, 100 - input.bollingerWidthPercentile),
      confidence: 78,
      weightHint: 0.08,
      fact: `Bollinger width percentile is ${input.bollingerWidthPercentile}, showing a volatility squeeze.`,
      reasoning: "A Bollinger squeeze marks compression, not direction.",
    }));
  }

  return {
    evidence,
    ignoredSignals,
  };
}
