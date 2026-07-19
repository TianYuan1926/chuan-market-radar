import type { AuthorityOutputName } from "../domain/module-registry";

export type RuntimeObjectAuthorityOutputName = Exclude<
  AuthorityOutputName,
  "UserFit"
>;

export const RUNTIME_OBJECT_SCHEMA_VERSIONS = Object.freeze({
  EligibleInstrumentSnapshot: "eligible-instrument-snapshot.v1",
  PointInTimeMarketFact: "point-in-time-market-fact.v1",
  FactQualitySnapshot: "fact-quality-snapshot.v1",
  FeatureSetSnapshot: "feature-set-snapshot.v2",
  FeatureQualitySnapshot: "feature-quality-snapshot.v2",
  MarketContextSnapshot: "market-context-snapshot.v2",
  DiscoveryCandidate: "discovery-candidate.v1",
  CandidateEpisode: "candidate-episode.v1",
  OpportunityThesis: "opportunity-thesis.v1",
  EvidencePackage: "evidence-package.v1",
  AnalysisSnapshot: "analysis-snapshot.v1",
  SignalQualification: "signal-qualification.v1",
  StrategyDraft: "strategy-draft.v1",
  ExecutionFeasibilitySnapshot: "execution-feasibility-snapshot.v1",
  StrategyDecision: "strategy-decision.v1",
  PersonalRiskView: "personal-risk-view.v1",
  PortfolioRiskView: "portfolio-risk-view.v1",
  DecisionSnapshot: "decision-snapshot.v1",
  AlertEvent: "alert-event.v1",
  DeliveryReceipt: "delivery-receipt.v1",
  OutcomeRecord: "outcome-record.v1",
  MissedOpportunityRecord: "missed-opportunity-record.v1",
  EvaluationDatasetSnapshot: "evaluation-dataset-snapshot.v1",
  ResearchProposal: "research-proposal.v1",
  ExperimentRecord: "experiment-record.v1",
  PromotionDecisionRecord: "promotion-decision-record.v1",
  RuntimeTruthSnapshot: "runtime-truth.v1",
  ReleaseRecord: "release-record.v1",
  DriftStatusSnapshot: "drift-status-snapshot.v1",
} as const satisfies Record<
  RuntimeObjectAuthorityOutputName,
  `${string}.v${number}`
>);
