import type {
  EvidenceItem,
  EvidenceTimeframe,
} from "../evidence/evidence-types";

export type DataIssue = {
  field: string;
  severity: "info" | "warning" | "blocking";
  message: string;
};

export type OpenInterestInterpretationInput = {
  symbol: string;
  timeframe: EvidenceTimeframe;
  createdAt: string;
  oiChangePct?: number;
  priceChangePct?: number;
  fundingRatePct?: number;
};

export type DerivativeInterpretation = {
  evidence: EvidenceItem[];
  dataIssues: DataIssue[];
};

function oiEvidence(input: OpenInterestInterpretationInput, item: Pick<EvidenceItem, "label" | "direction" | "strength" | "confidence" | "weightHint" | "fact" | "reasoning">): EvidenceItem {
  return {
    id: `derivatives:${input.symbol}:${input.timeframe}:${item.label}`,
    symbol: input.symbol,
    timeframe: input.timeframe,
    family: "DERIVATIVES",
    source: "oi_interpreter",
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

export function interpretOpenInterest(input: OpenInterestInterpretationInput): DerivativeInterpretation {
  if (input.oiChangePct === undefined) {
    return {
      evidence: [],
      dataIssues: [{
        field: "oiChangePct",
        severity: "warning",
        message: "OI change is missing; derivatives quality cannot be scored.",
      }],
    };
  }

  if (input.priceChangePct === undefined) {
    return {
      evidence: [oiEvidence(input, {
        label: "oi_rising_without_price_context",
        direction: "NEUTRAL",
        strength: Math.min(80, Math.abs(input.oiChangePct) * 4),
        confidence: 68,
        weightHint: 0.08,
        fact: `Open interest changed by ${input.oiChangePct}%.`,
        reasoning: "OI rising cannot be bullish alone without price, funding, and location context.",
      })],
      dataIssues: [],
    };
  }

  const crowded = input.oiChangePct >= 20 && input.priceChangePct <= 1;

  return {
    evidence: [oiEvidence(input, {
      label: crowded ? "oi_spike_price_stall" : "oi_context",
      direction: crowded ? "RISK" : "NEUTRAL",
      strength: crowded ? 82 : Math.min(70, Math.abs(input.oiChangePct) * 3),
      confidence: 74,
      weightHint: crowded ? 0.16 : 0.08,
      fact: `Open interest changed by ${input.oiChangePct}% while price changed by ${input.priceChangePct}%.`,
      reasoning: crowded
        ? "OI spike while price stalls is leverage crowding risk."
        : "OI context needs price, funding, and structure before directional use.",
    })],
    dataIssues: [],
  };
}
