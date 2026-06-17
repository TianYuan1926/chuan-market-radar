import type {
  StrategyDecision,
} from "./market-state-machine";

export type EntryPlan = {
  mode: "none" | "conditional";
  waitFor: string;
  trigger: string | null;
  invalidation: string | null;
};

export function buildEntryPlan(decision: StrategyDecision): EntryPlan {
  if (decision === "BREAKOUT_CONFIRM_LONG") {
    return {
      mode: "conditional",
      waitFor: "confirmed breakout with clean pullback risk",
      trigger: "breakout close holds and pullback does not lose the structure level",
      invalidation: "close back inside the prior range or lose the retest low",
    };
  }

  if (decision === "PREPARE_LONG" || decision === "WAIT_BREAKOUT" || decision === "WAIT_PULLBACK") {
    return {
      mode: "conditional",
      waitFor: "breakout or pullback confirmation",
      trigger: null,
      invalidation: "range low or high-timeframe pressure invalidates the setup",
    };
  }

  return {
    mode: "none",
    waitFor: "no entry until gates are clean",
    trigger: null,
    invalidation: null,
  };
}
