import type { z } from "zod";
import type {
  AlertEvent,
  AnalysisSnapshot,
  CandidateEpisode,
  DecisionSnapshot,
  DeliveryReceipt,
  DiscoveryCandidate,
  DriftStatusSnapshot,
  EligibleInstrumentSnapshot,
  EvaluationDatasetSnapshot,
  EvidencePackage,
  ExecutionFeasibilitySnapshot,
  ExperimentRecord,
  FactQualitySnapshot,
  FeatureQualitySnapshot,
  FeatureSetSnapshot,
  MarketContextSnapshot,
  MissedOpportunityRecord,
  OpportunityThesis,
  OutcomeRecord,
  PersonalRiskView,
  PointInTimeMarketFact,
  PortfolioRiskView,
  PromotionDecisionRecord,
  ReleaseRecord,
  ResearchProposal,
  RuntimeTruthSnapshot,
  SignalQualification,
  StrategyDecision,
  StrategyDraft,
} from "../domain/contracts";
import type { AuthorityOutputName } from "../domain/module-registry";
import type { UserFit } from "../domain/states";
import {
  AnalysisSnapshotSchema,
  CandidateEpisodeSchema,
  DecisionSnapshotSchema,
  DiscoveryCandidateSchema,
  EvidencePackageSchema,
  ExecutionFeasibilitySnapshotSchema,
  OpportunityThesisSchema,
  PersonalRiskViewSchema,
  PortfolioRiskViewSchema,
  SignalQualificationSchema,
  StrategyDecisionSchema,
  StrategyDraftSchema,
  UserFitSchema,
} from "./decision-schemas";
import {
  EligibleInstrumentSnapshotSchema,
  FactQualitySnapshotSchema,
  FeatureQualitySnapshotSchema,
  FeatureSetSnapshotSchema,
  MarketContextSnapshotSchema,
  PointInTimeMarketFactSchema,
} from "./foundation-schemas";
import {
  AlertEventSchema,
  DeliveryReceiptSchema,
  DriftStatusSnapshotSchema,
  EvaluationDatasetSnapshotSchema,
  ExperimentRecordSchema,
  MissedOpportunityRecordSchema,
  OutcomeRecordSchema,
  PromotionDecisionRecordSchema,
  ReleaseRecordSchema,
  ResearchProposalSchema,
  RuntimeTruthSnapshotSchema,
} from "./learning-runtime-schemas";

export type RuntimeArtifactByName = {
  EligibleInstrumentSnapshot: EligibleInstrumentSnapshot;
  PointInTimeMarketFact: PointInTimeMarketFact;
  FactQualitySnapshot: FactQualitySnapshot;
  FeatureSetSnapshot: FeatureSetSnapshot;
  FeatureQualitySnapshot: FeatureQualitySnapshot;
  MarketContextSnapshot: MarketContextSnapshot;
  DiscoveryCandidate: DiscoveryCandidate;
  CandidateEpisode: CandidateEpisode;
  OpportunityThesis: OpportunityThesis;
  EvidencePackage: EvidencePackage;
  AnalysisSnapshot: AnalysisSnapshot;
  SignalQualification: SignalQualification;
  StrategyDraft: StrategyDraft;
  ExecutionFeasibilitySnapshot: ExecutionFeasibilitySnapshot;
  StrategyDecision: StrategyDecision;
  PersonalRiskView: PersonalRiskView;
  PortfolioRiskView: PortfolioRiskView;
  UserFit: UserFit;
  DecisionSnapshot: DecisionSnapshot;
  AlertEvent: AlertEvent;
  DeliveryReceipt: DeliveryReceipt;
  OutcomeRecord: OutcomeRecord;
  MissedOpportunityRecord: MissedOpportunityRecord;
  EvaluationDatasetSnapshot: EvaluationDatasetSnapshot;
  ResearchProposal: ResearchProposal;
  ExperimentRecord: ExperimentRecord;
  PromotionDecisionRecord: PromotionDecisionRecord;
  RuntimeTruthSnapshot: RuntimeTruthSnapshot;
  ReleaseRecord: ReleaseRecord;
  DriftStatusSnapshot: DriftStatusSnapshot;
};

type RuntimeSchemaRegistry = {
  [Name in AuthorityOutputName]: z.ZodType<RuntimeArtifactByName[Name]>;
};

export const RUNTIME_SCHEMA_REGISTRY = Object.freeze({
  EligibleInstrumentSnapshot: EligibleInstrumentSnapshotSchema,
  PointInTimeMarketFact: PointInTimeMarketFactSchema,
  FactQualitySnapshot: FactQualitySnapshotSchema,
  FeatureSetSnapshot: FeatureSetSnapshotSchema,
  FeatureQualitySnapshot: FeatureQualitySnapshotSchema,
  MarketContextSnapshot: MarketContextSnapshotSchema,
  DiscoveryCandidate: DiscoveryCandidateSchema,
  CandidateEpisode: CandidateEpisodeSchema,
  OpportunityThesis: OpportunityThesisSchema,
  EvidencePackage: EvidencePackageSchema,
  AnalysisSnapshot: AnalysisSnapshotSchema,
  SignalQualification: SignalQualificationSchema,
  StrategyDraft: StrategyDraftSchema,
  ExecutionFeasibilitySnapshot: ExecutionFeasibilitySnapshotSchema,
  StrategyDecision: StrategyDecisionSchema,
  PersonalRiskView: PersonalRiskViewSchema,
  PortfolioRiskView: PortfolioRiskViewSchema,
  UserFit: UserFitSchema,
  DecisionSnapshot: DecisionSnapshotSchema,
  AlertEvent: AlertEventSchema,
  DeliveryReceipt: DeliveryReceiptSchema,
  OutcomeRecord: OutcomeRecordSchema,
  MissedOpportunityRecord: MissedOpportunityRecordSchema,
  EvaluationDatasetSnapshot: EvaluationDatasetSnapshotSchema,
  ResearchProposal: ResearchProposalSchema,
  ExperimentRecord: ExperimentRecordSchema,
  PromotionDecisionRecord: PromotionDecisionRecordSchema,
  RuntimeTruthSnapshot: RuntimeTruthSnapshotSchema,
  ReleaseRecord: ReleaseRecordSchema,
  DriftStatusSnapshot: DriftStatusSnapshotSchema,
} satisfies RuntimeSchemaRegistry);

export const RUNTIME_SCHEMA_NAMES = Object.freeze(
  Object.keys(RUNTIME_SCHEMA_REGISTRY).sort() as AuthorityOutputName[],
);
