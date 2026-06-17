import type {
  EvidenceItem,
  EvidenceTimeframe,
} from "../evidence/evidence-types";
import type {
  DerivativeInterpretation,
} from "./oi-interpreter";

export type LongShortInterpretationInput = {
  symbol: string;
  timeframe: EvidenceTimeframe;
  createdAt: string;
  longShortRatio?: number;
};

export function interpretLongShortRatio(input: LongShortInterpretationInput): DerivativeInterpretation {
  if (input.longShortRatio === undefined) {
    return {
      evidence: [],
      dataIssues: [{
        field: "longShortRatio",
        severity: "info",
        message: "Long/short ratio is unavailable.",
      }],
    };
  }

  const extreme = input.longShortRatio >= 2.5 || input.longShortRatio <= 0.4;
  const evidence: EvidenceItem = {
    id: `derivatives:${input.symbol}:${input.timeframe}:long_short_ratio_context`,
    symbol: input.symbol,
    timeframe: input.timeframe,
    family: "DERIVATIVES",
    source: "long_short_interpreter",
    label: "long_short_ratio_context",
    direction: extreme ? "RISK" : "NEUTRAL",
    strength: extreme ? 72 : 42,
    confidence: 70,
    weightHint: extreme ? 0.1 : 0.04,
    dataFreshness: "fresh",
    fact: `Long/short ratio is ${input.longShortRatio}.`,
    reasoning: extreme
      ? "Extreme long/short ratio is crowding evidence only."
      : "Normal long/short ratio is background context only.",
    createdAt: input.createdAt,
  };

  return {
    evidence: [evidence],
    dataIssues: [],
  };
}
