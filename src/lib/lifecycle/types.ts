export type OpportunityLifecycleStatus =
  | "DISCOVERED"
  | "CANDIDATE_OBSERVE"
  | "DEEP_SCAN_PENDING"
  | "EVIDENCE_OBSERVE"
  | "WAIT_CONDITION"
  | "BLOCKED"
  | "TRADE_PLAN_READY"
  | "INVALIDATED"
  | "EXPIRED"
  | "OUTCOME_REVIEWED";

export type OpportunityLifecycleLayer =
  | "scan"
  | "analysis"
  | "strategy"
  | "review";

export type OpportunityLifecycleEvent = {
  status: OpportunityLifecycleStatus;
  observedAt: string;
  sourceLayer: OpportunityLifecycleLayer;
  reason: string;
  evidenceIds?: string[];
};

export type OpportunityLifecycle = {
  id: string;
  symbol: string;
  allowedUse: "research_only";
  canAutoExecute: false;
  canAutoAdjustWeights: false;
  canMutateLiveRanking: false;
  canMutateProductionRanking: false;
  currentStatus: OpportunityLifecycleStatus;
  isTerminal: boolean;
  timeline: Array<OpportunityLifecycleEvent & { sequence: number }>;
  guardrail: string;
};
