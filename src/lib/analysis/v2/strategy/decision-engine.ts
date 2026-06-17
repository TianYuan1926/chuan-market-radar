import type {
  EvidenceItem,
} from "../evidence/evidence-types";
import {
  detectEvidenceConflict,
} from "./conflict-detector";
import {
  buildEntryPlan,
  type EntryPlan,
} from "./entry-plan";
import {
  buildExitPlan,
  type ExitPlan,
} from "./exit-plan";
import {
  checkInvalidation,
} from "./invalidation-rules";
import {
  classifyMarketStage,
  type MarketStage,
  type StrategyDecision,
  type StrategyScores,
} from "./market-state-machine";
import {
  evaluateRiskGate,
  type RiskGateResult,
} from "./risk-gate";

export type StrategyDecisionInput = {
  evidence: EvidenceItem[];
  scores: StrategyScores;
  rewardRisk?: number;
  structureInvalidated?: boolean;
  staleData?: boolean;
  hasHighTimeframeConflict?: boolean;
  ignoredExternalInputs?: string[];
};

export type StrategyEngineResult = {
  stage: MarketStage;
  decision: StrategyDecision;
  riskGate: RiskGateResult;
  entryPlan: EntryPlan;
  exitPlan: ExitPlan;
  supportEvidenceIds: string[];
  counterEvidenceIds: string[];
  ignoredExternalInputs: number;
};

function supportEvidenceIds(evidence: EvidenceItem[]) {
  return evidence.filter((item) => item.direction === "BULLISH" || item.direction === "NEUTRAL").map((item) => item.id);
}

function counterEvidenceIds(evidence: EvidenceItem[]) {
  return evidence.filter((item) => item.direction === "RISK" || item.direction === "CONFLICT" || item.direction === "BEARISH").map((item) => item.id);
}

function decisionForStage({
  riskGate,
  scores,
  stage,
}: {
  riskGate: RiskGateResult;
  scores: StrategyScores;
  stage: MarketStage;
}): StrategyDecision {
  if (stage === "INVALIDATED") {
    return "INVALIDATED";
  }

  if (stage === "CONFLICT") {
    return "CONFLICT";
  }

  if (stage === "IDLE") {
    return "WATCH_ONLY";
  }

  if (stage === "EXHAUSTION_RISK") {
    return scores.energyDecay >= 70 && !riskGate.blockedBy.includes("reward_risk_below_minimum")
      ? "TAKE_PROFIT_MANAGE"
      : "AVOID_CHASE";
  }

  if (riskGate.blockedBy.includes("reward_risk_below_minimum")) {
    return "NO_SETUP";
  }

  if (stage === "TREND_ACCELERATION") {
    return "TREND_HOLD";
  }

  if (stage === "BREAKOUT_CONFIRM") {
    return riskGate.allowed ? "BREAKOUT_CONFIRM_LONG" : "WAIT_PULLBACK";
  }

  if (stage === "PRE_BREAKOUT") {
    return "WAIT_BREAKOUT";
  }

  if (stage === "ACCUMULATION") {
    return "PREPARE_LONG";
  }

  if (stage === "COMPRESSION") {
    return scores.preMove >= 60 ? "WAIT_BREAKOUT" : "WATCH_ONLY";
  }

  return "WATCH_ONLY";
}

export function decideStrategy(input: StrategyDecisionInput): StrategyEngineResult {
  const invalidation = checkInvalidation(input.evidence, input.structureInvalidated);
  const conflict = detectEvidenceConflict({
    evidence: input.evidence,
    hasHighTimeframeConflict: input.hasHighTimeframeConflict,
  });
  const riskGate = evaluateRiskGate({
    rewardRisk: input.rewardRisk,
    riskScore: input.scores.risk,
    structureInvalidated: invalidation.invalidated,
    hasHighTimeframeConflict: conflict.hasConflict,
    staleData: input.staleData,
  });
  const stage = classifyMarketStage({
    evidence: input.evidence,
    scores: input.scores,
    riskGate,
    hasConflict: conflict.hasConflict,
    invalidated: invalidation.invalidated,
    staleData: input.staleData,
  });
  const decision = decisionForStage({
    riskGate,
    scores: input.scores,
    stage,
  });

  return {
    stage,
    decision,
    riskGate,
    entryPlan: buildEntryPlan(decision),
    exitPlan: buildExitPlan(decision),
    supportEvidenceIds: supportEvidenceIds(input.evidence),
    counterEvidenceIds: [...new Set([...counterEvidenceIds(input.evidence), ...conflict.conflictEvidenceIds])],
    ignoredExternalInputs: input.ignoredExternalInputs?.length ?? 0,
  };
}
