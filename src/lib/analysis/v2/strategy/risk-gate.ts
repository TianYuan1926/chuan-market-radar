export type RiskGateBlocker =
  | "reward_risk_below_minimum"
  | "risk_score_high"
  | "structure_invalidated"
  | "high_weight_conflict"
  | "stale_data";

export type RiskGateInput = {
  rewardRisk?: number;
  riskScore: number;
  structureInvalidated?: boolean;
  hasHighTimeframeConflict?: boolean;
  staleData?: boolean;
};

export type RiskGateResult = {
  allowed: boolean;
  blockedBy: RiskGateBlocker[];
};

export function evaluateRiskGate({
  hasHighTimeframeConflict = false,
  rewardRisk,
  riskScore,
  staleData = false,
  structureInvalidated = false,
}: RiskGateInput): RiskGateResult {
  const blockedBy: RiskGateBlocker[] = [];

  if (rewardRisk !== undefined && rewardRisk < 3) {
    blockedBy.push("reward_risk_below_minimum");
  }

  if (riskScore >= 70) {
    blockedBy.push("risk_score_high");
  }

  if (structureInvalidated) {
    blockedBy.push("structure_invalidated");
  }

  if (hasHighTimeframeConflict) {
    blockedBy.push("high_weight_conflict");
  }

  if (staleData) {
    blockedBy.push("stale_data");
  }

  return {
    allowed: blockedBy.length === 0,
    blockedBy,
  };
}
