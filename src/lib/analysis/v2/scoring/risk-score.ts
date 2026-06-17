import type {
  EvidenceItem,
} from "../evidence/evidence-types";

export type ScoreResult = {
  score: number;
  driverIds: string[];
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function averageStrength(items: EvidenceItem[]) {
  if (items.length === 0) {
    return 0;
  }

  return items.reduce((total, item) => total + item.strength * (item.confidence / 100), 0) / items.length;
}

export function calculateRiskScore(evidence: EvidenceItem[]): ScoreResult {
  const drivers = evidence.filter((item) => item.direction === "RISK" || /risk|stall|crowding|fakeout/i.test(item.label));
  const derivativesRiskCount = drivers.filter((item) => item.family === "DERIVATIVES").length;
  const structureRiskCount = drivers.filter((item) => item.family === "PRICE_STRUCTURE" || item.family === "LOCATION_RR").length;
  const concentrationBonus = derivativesRiskCount >= 2 && structureRiskCount >= 1 ? 14 : 0;

  return {
    score: clampScore(averageStrength(drivers) + concentrationBonus),
    driverIds: drivers.map((item) => item.id),
  };
}
