import type {
  EvidenceItem,
} from "../evidence/evidence-types";

export type ConflictDetectionInput = {
  evidence: EvidenceItem[];
  hasHighTimeframeConflict?: boolean;
};

export type ConflictDetectionResult = {
  hasConflict: boolean;
  conflictEvidenceIds: string[];
};

export function detectEvidenceConflict({
  evidence,
  hasHighTimeframeConflict = false,
}: ConflictDetectionInput): ConflictDetectionResult {
  const explicitConflicts = evidence.filter((item) => item.direction === "CONFLICT");
  const lowTimeframeBullish = evidence.some((item) => ["1m", "5m", "15m"].includes(item.timeframe) && item.direction === "BULLISH");
  const highTimeframePressure = evidence.filter((item) => (
    ["1h", "4h", "1d", "1w"].includes(item.timeframe) &&
    item.direction === "RISK" &&
    /resistance|pressure|high_timeframe/i.test(item.label)
  ));

  return {
    hasConflict: hasHighTimeframeConflict || explicitConflicts.length > 0 || (lowTimeframeBullish && highTimeframePressure.length > 0),
    conflictEvidenceIds: [
      ...explicitConflicts.map((item) => item.id),
      ...highTimeframePressure.map((item) => item.id),
    ],
  };
}
