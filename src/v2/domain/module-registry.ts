export const MODULE_IDS = [
  "universe_registry",
  "market_fact_quality",
  "point_in_time_feature_engine",
  "market_context",
  "multi_opportunity_detection",
  "candidate_lifecycle_opportunity_thesis",
  "deep_validation",
  "family_analysis",
  "signal_qualification",
  "strategy_construction",
  "execution_feasibility_final_decision",
  "personal_risk_lens",
  "portfolio_risk",
  "decision_read_model",
  "alert_delivery",
  "outcome_evaluation",
  "research_governance",
  "runtime_security_release_control",
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export type ModuleDefinition = {
  id: ModuleId;
  order: number;
  pipelineOrder: number | null;
  authorityOutputs: readonly string[];
  readsFrom: readonly ModuleId[];
  prohibited: readonly string[];
};

export const MODULE_REGISTRY = [
  {
    id: "universe_registry",
    order: 1,
    pipelineOrder: 1,
    authorityOutputs: ["EligibleInstrumentSnapshot"],
    readsFrom: [],
    prohibited: ["silent_identity_merge", "unaccounted_instrument_drop", "trade_plan"],
  },
  {
    id: "market_fact_quality",
    order: 2,
    pipelineOrder: 2,
    authorityOutputs: ["PointInTimeMarketFact", "FactQualitySnapshot"],
    readsFrom: ["universe_registry"],
    prohibited: ["fake_zero", "stale_as_live", "caller_direct_provider_access"],
  },
  {
    id: "point_in_time_feature_engine",
    order: 3,
    pipelineOrder: 3,
    authorityOutputs: ["FeatureSetSnapshot", "FeatureQualitySnapshot"],
    readsFrom: ["universe_registry", "market_fact_quality"],
    prohibited: ["future_window_completion", "unversioned_formula", "stale_carry_forward"],
  },
  {
    id: "market_context",
    order: 4,
    pipelineOrder: 4,
    authorityOutputs: ["MarketContextSnapshot"],
    readsFrom: ["universe_registry", "point_in_time_feature_engine"],
    prohibited: ["single_instrument_direction", "stale_regime_as_current", "trade_plan"],
  },
  {
    id: "multi_opportunity_detection",
    order: 5,
    pipelineOrder: 5,
    authorityOutputs: ["DiscoveryCandidate"],
    readsFrom: ["universe_registry", "point_in_time_feature_engine", "market_context"],
    prohibited: ["outcome_input", "evidence_grade", "setup_grade", "trade_plan"],
  },
  {
    id: "candidate_lifecycle_opportunity_thesis",
    order: 6,
    pipelineOrder: 6,
    authorityOutputs: ["CandidateEpisode", "OpportunityThesis"],
    readsFrom: ["multi_opportunity_detection"],
    prohibited: ["candidate_as_signal", "thesis_as_direction_truth", "memory_authority_fallback"],
  },
  {
    id: "deep_validation",
    order: 7,
    pipelineOrder: 7,
    authorityOutputs: ["EvidencePackage"],
    readsFrom: [
      "candidate_lifecycle_opportunity_thesis",
      "market_fact_quality",
      "point_in_time_feature_engine",
      "market_context",
    ],
    prohibited: ["direction_decision", "grade_generation", "trade_plan"],
  },
  {
    id: "family_analysis",
    order: 8,
    pipelineOrder: 8,
    authorityOutputs: ["AnalysisSnapshot"],
    readsFrom: ["candidate_lifecycle_opportunity_thesis", "deep_validation", "market_context"],
    prohibited: ["entry", "stop", "target", "position_size"],
  },
  {
    id: "signal_qualification",
    order: 9,
    pipelineOrder: 9,
    authorityOutputs: ["SignalQualification"],
    readsFrom: ["deep_validation", "family_analysis", "market_context"],
    prohibited: ["priority_inheritance", "single_total_score", "automatic_ready"],
  },
  {
    id: "strategy_construction",
    order: 10,
    pipelineOrder: 10,
    authorityOutputs: ["StrategyDraft"],
    readsFrom: ["family_analysis", "signal_qualification"],
    prohibited: ["ready_state", "scan_ranking_mutation", "rr_gate_relaxation"],
  },
  {
    id: "execution_feasibility_final_decision",
    order: 11,
    pipelineOrder: 11,
    authorityOutputs: ["ExecutionFeasibilitySnapshot", "StrategyDecision"],
    readsFrom: [
      "strategy_construction",
      "market_fact_quality",
      "market_context",
      "runtime_security_release_control",
    ],
    prohibited: ["stale_execution_fact", "placeholder_price", "automatic_order_execution"],
  },
  {
    id: "personal_risk_lens",
    order: 12,
    pipelineOrder: 12,
    authorityOutputs: ["PersonalRiskView"],
    readsFrom: ["execution_feasibility_final_decision"],
    prohibited: ["action_state_upgrade", "exchange_account_write", "signal_quality_mutation"],
  },
  {
    id: "portfolio_risk",
    order: 13,
    pipelineOrder: 13,
    authorityOutputs: ["PortfolioRiskView", "UserFit"],
    readsFrom: [
      "execution_feasibility_final_decision",
      "personal_risk_lens",
      "point_in_time_feature_engine",
      "market_context",
    ],
    prohibited: ["action_state_upgrade", "unknown_correlation_as_diversified"],
  },
  {
    id: "decision_read_model",
    order: 14,
    pipelineOrder: 14,
    authorityOutputs: ["DecisionSnapshot"],
    readsFrom: [
      "candidate_lifecycle_opportunity_thesis",
      "deep_validation",
      "family_analysis",
      "signal_qualification",
      "execution_feasibility_final_decision",
      "personal_risk_lens",
      "portfolio_risk",
      "runtime_security_release_control",
    ],
    prohibited: ["provider_call", "decision_recalculation", "normal_empty_on_database_failure"],
  },
  {
    id: "alert_delivery",
    order: 15,
    pipelineOrder: 15,
    authorityOutputs: ["AlertEvent", "DeliveryReceipt"],
    readsFrom: ["decision_read_model"],
    prohibited: ["stale_ready_alert", "duplicate_ready_alert", "state_invention"],
  },
  {
    id: "outcome_evaluation",
    order: 16,
    pipelineOrder: 16,
    authorityOutputs: ["OutcomeRecord", "MissedOpportunityRecord", "EvaluationDatasetSnapshot"],
    readsFrom: ["decision_read_model", "market_fact_quality"],
    prohibited: ["original_decision_mutation", "production_score_write", "rule_promotion"],
  },
  {
    id: "research_governance",
    order: 17,
    pipelineOrder: 17,
    authorityOutputs: ["ResearchProposal", "ExperimentRecord", "PromotionDecisionRecord"],
    readsFrom: ["outcome_evaluation"],
    prohibited: ["self_approval", "automatic_promotion", "historical_decision_rewrite"],
  },
  {
    id: "runtime_security_release_control",
    order: 18,
    pipelineOrder: null,
    authorityOutputs: ["RuntimeTruthSnapshot", "ReleaseRecord", "DriftStatusSnapshot"],
    readsFrom: [],
    prohibited: ["http_200_as_business_ready", "shared_superuser", "unbound_release_identity"],
  },
] as const satisfies readonly ModuleDefinition[];

export function moduleDefinition(id: ModuleId): ModuleDefinition {
  const definition = MODULE_REGISTRY.find((module) => module.id === id);

  if (!definition) {
    throw new Error(`Unknown V2 module: ${id}`);
  }

  return definition;
}
