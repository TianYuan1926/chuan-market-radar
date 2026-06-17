import type {
  EvidenceItem,
  EvidenceTimeframe,
} from "../evidence/evidence-types";
import type {
  DataIssue,
  DerivativeInterpretation,
} from "./oi-interpreter";

export type TakerFlowInterpretationInput = {
  symbol: string;
  timeframe: EvidenceTimeframe;
  createdAt: string;
  hasRealCvd: boolean;
  takerBuySellRatio?: number;
  cvdChangePct?: number;
};

function takerFlowEvidence(input: TakerFlowInterpretationInput, item: Pick<EvidenceItem, "label" | "direction" | "strength" | "confidence" | "weightHint" | "dataFreshness" | "fact" | "reasoning">): EvidenceItem {
  return {
    id: `derivatives:${input.symbol}:${input.timeframe}:${item.label}`,
    symbol: input.symbol,
    timeframe: input.timeframe,
    family: "DERIVATIVES",
    source: "taker_flow_interpreter",
    label: item.label,
    direction: item.direction,
    strength: item.strength,
    confidence: item.confidence,
    weightHint: item.weightHint,
    dataFreshness: item.dataFreshness,
    fact: item.fact,
    reasoning: item.reasoning,
    createdAt: input.createdAt,
  };
}

export function interpretTakerFlow(input: TakerFlowInterpretationInput): DerivativeInterpretation {
  if (!input.hasRealCvd) {
    const dataIssues: DataIssue[] = [{
      field: "cvd",
      severity: "info",
      message: "Real CVD is unavailable; taker flow can only be treated as a proxy.",
    }];

    return {
      evidence: [takerFlowEvidence(input, {
        label: "taker_flow_proxy_boundary",
        direction: "NEUTRAL",
        strength: input.takerBuySellRatio === undefined ? 35 : Math.min(65, input.takerBuySellRatio * 40),
        confidence: 52,
        weightHint: 0.04,
        dataFreshness: "partial",
        fact: input.takerBuySellRatio === undefined
          ? "Taker flow is unavailable and cannot confirm CVD."
          : `Taker buy/sell ratio ${input.takerBuySellRatio} is proxy-only flow input.`,
        reasoning: "Without exchange-grade CVD, flow data must remain a proxy boundary and cannot create direction by itself.",
      })],
      dataIssues,
    };
  }

  const cvdPositive = (input.cvdChangePct ?? 0) > 0;

  return {
    evidence: [takerFlowEvidence(input, {
      label: "cvd_flow_context",
      direction: cvdPositive ? "NEUTRAL" : "RISK",
      strength: input.cvdChangePct === undefined ? 45 : Math.min(80, Math.abs(input.cvdChangePct) * 4),
      confidence: 72,
      weightHint: 0.08,
      dataFreshness: "fresh",
      fact: input.cvdChangePct === undefined ? "CVD source is present but change is unavailable." : `CVD changed by ${input.cvdChangePct}%.`,
      reasoning: "CVD can support flow quality only when structure and price action agree.",
    })],
    dataIssues: [],
  };
}
