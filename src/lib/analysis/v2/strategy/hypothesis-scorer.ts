import type {
  EvidenceItem,
} from "../evidence/evidence-types";

export type HypothesisScore = {
  bullish: number;
  bearish: number;
  risk: number;
  neutral: number;
};

function contribution(item: EvidenceItem) {
  return item.strength * (item.confidence / 100);
}

export function scoreHypotheses(evidence: EvidenceItem[]): HypothesisScore {
  return evidence.reduce<HypothesisScore>((score, item) => {
    if (item.direction === "BULLISH") {
      score.bullish += contribution(item);
    } else if (item.direction === "BEARISH") {
      score.bearish += contribution(item);
    } else if (item.direction === "RISK" || item.direction === "CONFLICT") {
      score.risk += contribution(item);
    } else {
      score.neutral += contribution(item);
    }

    return score;
  }, {
    bullish: 0,
    bearish: 0,
    risk: 0,
    neutral: 0,
  });
}
