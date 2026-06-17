import type {
  StrategyDecision,
} from "./market-state-machine";

export type ExitPlan = {
  actions: string[];
};

export function buildExitPlan(decision: StrategyDecision): ExitPlan {
  if (decision === "TAKE_PROFIT_MANAGE") {
    return {
      actions: ["take_profit_manage", "protect_remaining_trend_position"],
    };
  }

  if (decision === "EXIT_RISK" || decision === "INVALIDATED") {
    return {
      actions: ["exit_risk_review", "remove_from_actionable_candidates"],
    };
  }

  if (decision === "TREND_HOLD") {
    return {
      actions: ["hold_existing_trend_only", "do_not_open_new_chase_entry"],
    };
  }

  return {
    actions: [],
  };
}
