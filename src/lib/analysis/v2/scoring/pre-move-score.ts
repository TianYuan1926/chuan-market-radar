import type {
  EvidenceItem,
} from "../evidence/evidence-types";
import type {
  ScoreResult,
} from "./risk-score";

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function calculatePreMoveScore(evidence: EvidenceItem[]): ScoreResult {
  const drivers = evidence.filter((item) => {
    const label = item.label.toLowerCase();

    return (
      label.includes("compression") ||
      label.includes("squeeze") ||
      label.includes("funding_neutral") ||
      label.includes("relative") ||
      item.family === "RELATIVE_STRENGTH"
    );
  });
  const scoreBase = drivers.reduce((total, item) => total + item.strength * (item.confidence / 100), 0);
  const familyCoverage = new Set(drivers.map((item) => item.family)).size;
  const coverageBonus = familyCoverage >= 3 ? 8 : familyCoverage >= 2 ? 4 : 0;

  return {
    score: clampScore(drivers.length === 0 ? 0 : scoreBase / drivers.length + coverageBonus),
    driverIds: drivers.map((item) => item.id),
  };
}
