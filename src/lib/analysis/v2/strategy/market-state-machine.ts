import type {
  EvidenceItem,
} from "../evidence/evidence-types";
import type {
  RiskGateResult,
} from "./risk-gate";

export type MarketStage =
  | "IDLE"
  | "COMPRESSION"
  | "ACCUMULATION"
  | "PRE_BREAKOUT"
  | "BREAKOUT_CONFIRM"
  | "TREND_ACCELERATION"
  | "EXHAUSTION_RISK"
  | "INVALIDATED"
  | "CONFLICT";

export type StrategyDecision =
  | "NO_SETUP"
  | "WATCH_ONLY"
  | "PREPARE_LONG"
  | "WAIT_BREAKOUT"
  | "WAIT_PULLBACK"
  | "BREAKOUT_CONFIRM_LONG"
  | "AVOID_CHASE"
  | "TREND_HOLD"
  | "TAKE_PROFIT_MANAGE"
  | "EXIT_RISK"
  | "CONFLICT"
  | "INVALIDATED";

export type StrategyScores = {
  preMove: number;
  energy: number;
  risk: number;
  trendHold: number;
  energyDecay: number;
};

export type MarketStateInput = {
  evidence: EvidenceItem[];
  scores: StrategyScores;
  riskGate: RiskGateResult;
  hasConflict?: boolean;
  invalidated?: boolean;
  staleData?: boolean;
};

function hasLabel(evidence: EvidenceItem[], pattern: RegExp) {
  return evidence.some((item) => pattern.test(item.label));
}

export function classifyMarketStage({
  evidence,
  hasConflict = false,
  invalidated = false,
  riskGate,
  scores,
  staleData = false,
}: MarketStateInput): MarketStage {
  if (invalidated || riskGate.blockedBy.includes("structure_invalidated")) {
    return "INVALIDATED";
  }

  if (staleData || riskGate.blockedBy.includes("stale_data")) {
    return "IDLE";
  }

  if (hasConflict || riskGate.blockedBy.includes("high_weight_conflict")) {
    return "CONFLICT";
  }

  if (scores.energyDecay >= 55 || scores.risk >= 65 || hasLabel(evidence, /oi_spike_price_stall|funding_crowding|exhaustion|stall/i)) {
    return "EXHAUSTION_RISK";
  }

  if (scores.trendHold >= 65) {
    return "TREND_ACCELERATION";
  }

  if (scores.energy >= 65 && hasLabel(evidence, /breakout_close|breakout/i)) {
    return "BREAKOUT_CONFIRM";
  }

  if (scores.preMove >= 60 || hasLabel(evidence, /pre_breakout|range_edge/i)) {
    return "PRE_BREAKOUT";
  }

  if (hasLabel(evidence, /accumulation|higher_lows|relative_strength/i)) {
    return "ACCUMULATION";
  }

  if (hasLabel(evidence, /compression|squeeze|range_inside/i)) {
    return "COMPRESSION";
  }

  return "IDLE";
}
