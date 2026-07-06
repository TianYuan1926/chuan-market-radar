export type ResearchSignalMaturity =
  | "LIGHT_SCAN_MARK"
  | "DEEP_SCAN_CANDIDATE"
  | "EVIDENCE_SIGNAL"
  | "REVIEW_ONLY"
  | "TRADE_PLAN_READY"
  | "BLOCKED"
  | "INVALIDATED"
  | "COOLDOWN";

export type ResearchOnlyLifecycleStage =
  | ResearchSignalMaturity
  | "WAIT"
  | "OBSERVE"
  | "BLOCKED";

export type ResearchOnlyLifecycleRecord = {
  id: string;
  symbol: string;
  stage: ResearchOnlyLifecycleStage;
  observedAt: string;
  source: "current_signal" | "journal_shadow" | "frontend_review_contract";
  allowedUse: "research_only";
  canAutoExecute: false;
  canAutoAdjustWeights: false;
  canMutateLiveRanking: false;
  metrics: {
    mfePercent: number | null;
    maePercent: number | null;
    invalidated: boolean | null;
    missedOpportunity: boolean | null;
    falsePositive: boolean | null;
  };
  guardrail: string;
};

export const REVIEW_RESEARCH_ONLY_GUARD = {
  allowedUse: "research_only",
  canAutoExecute: false,
  canAutoAdjustWeights: false,
  canMutateLiveRanking: false,
  guardrail: "lifecycle/outcome 只能用于复盘研究和改进建议，不能污染 production ranking。",
} as const;

export function assertResearchOnlyBoundary(
  record: Pick<
    ResearchOnlyLifecycleRecord,
    "allowedUse" | "canAutoExecute" | "canAutoAdjustWeights" | "canMutateLiveRanking"
  >,
): void {
  if (record.allowedUse !== "research_only") {
    throw new Error("review_boundary_violation:allowed_use");
  }
  if (record.canAutoExecute !== false) {
    throw new Error("review_boundary_violation:auto_execute");
  }
  if (record.canAutoAdjustWeights !== false) {
    throw new Error("review_boundary_violation:auto_adjust_weights");
  }
  if (record.canMutateLiveRanking !== false) {
    throw new Error("review_boundary_violation:mutate_live_ranking");
  }
}

export function createResearchOnlyLifecycleRecord({
  id,
  symbol,
  stage,
  observedAt,
  source,
  metrics,
}: {
  id: string;
  symbol: string;
  stage: ResearchOnlyLifecycleStage;
  observedAt: string;
  source: ResearchOnlyLifecycleRecord["source"];
  metrics?: Partial<ResearchOnlyLifecycleRecord["metrics"]>;
}): ResearchOnlyLifecycleRecord {
  const record: ResearchOnlyLifecycleRecord = {
    id,
    symbol,
    stage,
    observedAt,
    source,
    allowedUse: REVIEW_RESEARCH_ONLY_GUARD.allowedUse,
    canAutoExecute: REVIEW_RESEARCH_ONLY_GUARD.canAutoExecute,
    canAutoAdjustWeights: REVIEW_RESEARCH_ONLY_GUARD.canAutoAdjustWeights,
    canMutateLiveRanking: REVIEW_RESEARCH_ONLY_GUARD.canMutateLiveRanking,
    metrics: {
      mfePercent: metrics?.mfePercent ?? null,
      maePercent: metrics?.maePercent ?? null,
      invalidated: metrics?.invalidated ?? null,
      missedOpportunity: metrics?.missedOpportunity ?? null,
      falsePositive: metrics?.falsePositive ?? null,
    },
    guardrail: REVIEW_RESEARCH_ONLY_GUARD.guardrail,
  };

  assertResearchOnlyBoundary(record);
  return record;
}
