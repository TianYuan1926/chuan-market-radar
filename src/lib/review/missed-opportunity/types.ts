export type MissedReason =
  | "scan_not_covered"
  | "light_scan_not_triggered"
  | "deep_scan_pending_too_long"
  | "analysis_missed_structure"
  | "strategy_blocked_too_strict"
  | "data_source_missing"
  | "market_regime_filtered"
  | "frontend_not_highlighted"
  | "insufficient_data";

export type MissedOpportunityChainStage =
  | "scan"
  | "light_scan"
  | "deep_scan"
  | "analysis"
  | "strategy"
  | "data_source"
  | "market_regime"
  | "frontend"
  | "unknown";

export type ResearchOnlyBoundary = {
  allowedUse: "research_only";
  canAutoExecute: false;
  canAutoAdjustWeights: false;
  canMutateLiveRanking: false;
  canMutateProductionRanking: false;
};

export type MissedOpportunityCheckpoint = {
  scanCovered?: boolean;
  lightScanTriggered?: boolean;
  deepScanPendingMinutes?: number | null;
  analysisHadPriorStructure?: boolean;
  strategyBlockedByRules?: boolean;
  dataSourceAvailable?: boolean;
  marketRegimeAllowed?: boolean;
  frontendHighlighted?: boolean;
  sufficientData?: boolean;
};

export type BuildMissedOpportunityReviewInput = {
  id: string;
  symbol: string;
  observedAt: string;
  opportunityObservedAt: string;
  opportunityMovePercent?: number | null;
  checkpoint: MissedOpportunityCheckpoint;
  evidenceIds?: string[];
  notes?: string[];
};

export type MissedOpportunityReview = ResearchOnlyBoundary & {
  id: string;
  type: "missed_opportunity_review";
  symbol: string;
  observedAt: string;
  opportunityObservedAt: string;
  missedReason: MissedReason;
  chainStage: MissedOpportunityChainStage;
  opportunityMovePercent: number | null;
  evidenceIds: string[];
  notes: string[];
  detail: string;
  prohibitedUse: readonly [
    "production_ranking",
    "live_scan_priority",
    "strategy_gate_relaxation",
    "auto_weight_adjustment",
    "auto_trade",
  ];
};
