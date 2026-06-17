import type {
  EvidenceItem,
  EvidenceTimeframe,
} from "../evidence/evidence-types";
import type {
  DataIssue,
  DerivativeInterpretation,
} from "./oi-interpreter";

export type FundingInterpretationInput = {
  symbol: string;
  timeframe: EvidenceTimeframe;
  createdAt: string;
  fundingRatePct?: number;
};

function fundingEvidence(input: FundingInterpretationInput, item: Pick<EvidenceItem, "label" | "direction" | "strength" | "confidence" | "weightHint" | "fact" | "reasoning">): EvidenceItem {
  return {
    id: `derivatives:${input.symbol}:${input.timeframe}:${item.label}`,
    symbol: input.symbol,
    timeframe: input.timeframe,
    family: "DERIVATIVES",
    source: "funding_interpreter",
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

export function interpretFunding(input: FundingInterpretationInput): DerivativeInterpretation {
  if (input.fundingRatePct === undefined) {
    const dataIssues: DataIssue[] = [{
      field: "fundingRatePct",
      severity: "warning",
      message: "Funding rate is missing; crowding risk cannot be checked.",
    }];

    return { evidence: [], dataIssues };
  }

  const highFunding = input.fundingRatePct >= 0.08;

  return {
    evidence: [fundingEvidence(input, {
      label: highFunding ? "funding_crowding_risk" : "funding_neutral_context",
      direction: highFunding ? "RISK" : "NEUTRAL",
      strength: highFunding ? Math.min(95, input.fundingRatePct * 700) : 45,
      confidence: 78,
      weightHint: highFunding ? 0.14 : 0.06,
      fact: `Funding rate is ${input.fundingRatePct}%.`,
      reasoning: highFunding
        ? "High funding is crowding risk, not strength."
        : "Neutral funding is healthier context but not a directional signal.",
    })],
    dataIssues: [],
  };
}
