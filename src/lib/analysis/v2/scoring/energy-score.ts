import type {
  EvidenceItem,
} from "../evidence/evidence-types";
import type {
  ScoreResult,
} from "./risk-score";

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function calculateEnergyScore(evidence: EvidenceItem[]): ScoreResult {
  const drivers = evidence.filter((item) => item.direction === "BULLISH" && item.family !== "TECHNICAL_INDICATOR");
  const score = drivers.reduce((total, item) => total + item.strength * (item.confidence / 100), 0);

  return {
    score: clampScore(drivers.length === 0 ? 0 : score / drivers.length),
    driverIds: drivers.map((item) => item.id),
  };
}
