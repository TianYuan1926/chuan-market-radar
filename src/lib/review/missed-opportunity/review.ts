import type {
  BuildMissedOpportunityReviewInput,
  MissedOpportunityChainStage,
  MissedOpportunityReview,
  MissedReason,
  ResearchOnlyBoundary,
} from "./types";

export const MISSED_OPPORTUNITY_RESEARCH_BOUNDARY: ResearchOnlyBoundary = {
  allowedUse: "research_only",
  canAutoExecute: false,
  canAutoAdjustWeights: false,
  canMutateLiveRanking: false,
  canMutateProductionRanking: false,
};

export const MISSED_REASONS: readonly MissedReason[] = [
  "scan_not_covered",
  "light_scan_not_triggered",
  "deep_scan_pending_too_long",
  "analysis_missed_structure",
  "strategy_blocked_too_strict",
  "data_source_missing",
  "market_regime_filtered",
  "frontend_not_highlighted",
  "insufficient_data",
] as const;

const reasonStage: Record<MissedReason, MissedOpportunityChainStage> = {
  scan_not_covered: "scan",
  light_scan_not_triggered: "light_scan",
  deep_scan_pending_too_long: "deep_scan",
  analysis_missed_structure: "analysis",
  strategy_blocked_too_strict: "strategy",
  data_source_missing: "data_source",
  market_regime_filtered: "market_regime",
  frontend_not_highlighted: "frontend",
  insufficient_data: "unknown",
};

const reasonDetail: Record<MissedReason, string> = {
  scan_not_covered: "全市场扫描覆盖没有包含该标的，错失归因只能用于补覆盖率审计。",
  light_scan_not_triggered: "标的已在覆盖池内，但轻扫没有触发候选标记，需要复查轻扫触发条件。",
  deep_scan_pending_too_long: "轻扫后进入深扫等待过久，机会窗口可能在验证完成前已经过去；该结论只用于复盘排队延迟。",
  analysis_missed_structure: "事前已有结构线索，但结构分析没有识别为可继续观察的机会。",
  strategy_blocked_too_strict: "结构进入策略层后被规则阻断，本记录只能提示人工复核门禁质量，不能自动放宽风控。",
  data_source_missing: "关键数据源缺失或不可用，不能把缺数据解释为市场没有机会。",
  market_regime_filtered: "市场环境过滤器拦截了标的，需要复查过滤器是否过度压制山寨机会。",
  frontend_not_highlighted: "后端已有观察线索，但前端没有突出展示；仅作为展示链路反查，不让前端补写策略。",
  insufficient_data: "样本不足以判断漏判原因，只能保留为研究样本。",
};

export function assertMissedOpportunityResearchOnly(
  record: Pick<
    MissedOpportunityReview,
    | "allowedUse"
    | "canAutoExecute"
    | "canAutoAdjustWeights"
    | "canMutateLiveRanking"
    | "canMutateProductionRanking"
  >,
): void {
  if (record.allowedUse !== "research_only") {
    throw new Error("missed_opportunity_boundary_violation:allowed_use");
  }
  if (record.canAutoExecute !== false) {
    throw new Error("missed_opportunity_boundary_violation:auto_execute");
  }
  if (record.canAutoAdjustWeights !== false) {
    throw new Error("missed_opportunity_boundary_violation:auto_adjust_weights");
  }
  if (record.canMutateLiveRanking !== false) {
    throw new Error("missed_opportunity_boundary_violation:live_ranking");
  }
  if (record.canMutateProductionRanking !== false) {
    throw new Error("missed_opportunity_boundary_violation:production_ranking");
  }
}

export function classifyMissedReason(
  checkpoint: BuildMissedOpportunityReviewInput["checkpoint"],
): MissedReason {
  if (checkpoint.sufficientData === false) {
    return "insufficient_data";
  }
  if (checkpoint.dataSourceAvailable === false) {
    return "data_source_missing";
  }
  if (checkpoint.scanCovered === false) {
    return "scan_not_covered";
  }
  if (checkpoint.lightScanTriggered === false) {
    return "light_scan_not_triggered";
  }
  if ((checkpoint.deepScanPendingMinutes ?? 0) >= 30) {
    return "deep_scan_pending_too_long";
  }
  if (checkpoint.marketRegimeAllowed === false) {
    return "market_regime_filtered";
  }
  if (checkpoint.analysisHadPriorStructure === false) {
    return "analysis_missed_structure";
  }
  if (checkpoint.strategyBlockedByRules === true) {
    return "strategy_blocked_too_strict";
  }
  if (checkpoint.frontendHighlighted === false) {
    return "frontend_not_highlighted";
  }

  return "insufficient_data";
}

export function buildMissedOpportunityReview(
  input: BuildMissedOpportunityReviewInput,
): MissedOpportunityReview {
  const missedReason = classifyMissedReason(input.checkpoint);
  const review: MissedOpportunityReview = {
    ...MISSED_OPPORTUNITY_RESEARCH_BOUNDARY,
    id: input.id,
    type: "missed_opportunity_review",
    symbol: input.symbol.toUpperCase(),
    observedAt: input.observedAt,
    opportunityObservedAt: input.opportunityObservedAt,
    missedReason,
    chainStage: reasonStage[missedReason],
    opportunityMovePercent: input.opportunityMovePercent ?? null,
    evidenceIds: input.evidenceIds ?? [],
    notes: input.notes ?? [],
    detail: reasonDetail[missedReason],
    prohibitedUse: [
      "production_ranking",
      "live_scan_priority",
      "strategy_gate_relaxation",
      "auto_weight_adjustment",
      "auto_trade",
    ],
  };

  assertMissedOpportunityResearchOnly(review);
  return review;
}
