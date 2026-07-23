import type { ModuleId } from "./module-registry";
import type {
  OpportunityFamily,
  OpportunityPattern,
  TargetVenue,
} from "./product-constitution";
import type {
  ActionState,
  CandidateLifecycleState,
  CandidatePriority,
  DataQualityState,
  DetectorEmissionScope,
  DetectorLifecycleState,
  EvidenceGrade,
  SetupGrade,
  UserFit,
} from "./states";
import type { UncertaintyVector } from "./uncertainty";

export type Direction = "LONG" | "SHORT";
export type DirectionHypothesis = Direction | "NEUTRAL" | "UNKNOWN";
export type InstrumentAccountingStatus =
  | "OBSERVED"
  | "ACCEPTED"
  | "ELIGIBLE"
  | "SUSPENDED"
  | "DELISTING"
  | "UNRESOLVED"
  | "UNAVAILABLE"
  | "UNSUPPORTED";

export type TraceEnvelope = {
  schemaVersion: string;
  releaseId: string;
  producerModule: ModuleId;
  generatedAt: string;
  sourceCutoff: string;
  contentHash: string;
};

export type SourceLineage = {
  sourceId: string;
  sourceCapability: string;
  sourceRecordIds: readonly string[];
  eventTime: string | null;
  receivedAt: string;
  normalizedAt: string;
  persistedAt: string | null;
};

export type QualityAssessment = {
  status: DataQualityState;
  ageMs: number | null;
  reasonCodes: readonly string[];
};

export type InstrumentIdentity = {
  canonicalInstrumentId: string;
  underlyingGroupId: string;
  venue: TargetVenue;
  venueInstrumentId: string;
  baseAsset: string;
  quoteAsset: string;
  settlementAsset: string;
  contractType: "LINEAR_PERPETUAL";
  contractSize: string;
};

export type InstrumentAccountingRecord = {
  observationId: string;
  canonicalInstrumentId: string | null;
  underlyingGroupId: string | null;
  venue: TargetVenue;
  venueInstrumentId: string | null;
  baseAsset: string | null;
  quoteAsset: string | null;
  settlementAsset: string | null;
  contractType: "LINEAR_PERPETUAL" | null;
  contractSize: string | null;
  status: InstrumentAccountingStatus;
  statusReasons: readonly string[];
  observedAt: string;
  eligible: boolean;
};

export type EligibleInstrumentSnapshot = TraceEnvelope & {
  producerModule: "universe_registry";
  snapshotId: string;
  policyVersion: string;
  observedCount: number;
  eligibleCount: number;
  accounting: readonly InstrumentAccountingRecord[];
  quality: QualityAssessment;
};

export type PointInTimeMarketFact = TraceEnvelope & {
  producerModule: "market_fact_quality";
  factId: string;
  canonicalInstrumentId: string;
  venueInstrumentId: string;
  factType: string;
  value: string | number | null;
  unit: string;
  sequence: string | null;
  lineage: SourceLineage;
  quality: QualityAssessment;
};

export type FactQualitySnapshot = TraceEnvelope & {
  producerModule: "market_fact_quality";
  snapshotId: string;
  universeSnapshotId: string;
  completenessRatio: number;
  gapRate: number;
  duplicateRate: number;
  lateEventRate: number;
  quality: QualityAssessment;
};

export type PointInTimeFeature = {
  featureId: string;
  featureDefinitionVersion: string;
  featureSetVersion: string;
  subjectType: "CANONICAL_INSTRUMENT" | "UNDERLYING_GROUP" | "MARKET";
  subjectId: string;
  timeframe: string;
  window: string;
  value: string | number | null;
  unit: string;
  sourceFactIds: readonly string[];
  sourceCutoff: string;
  computedAt: string;
  quality: QualityAssessment;
};

export type FeatureSetSnapshot = TraceEnvelope & {
  producerModule: "point_in_time_feature_engine";
  snapshotId: string;
  universeSnapshotId: string;
  featureSetVersion: string;
  computation: {
    engineVersion: string;
    mode: "ONLINE" | "REPLAY";
    runId: string;
  };
  features: readonly PointInTimeFeature[];
};

export type FeatureQualitySnapshot = TraceEnvelope & {
  producerModule: "point_in_time_feature_engine";
  snapshotId: string;
  featureSetSnapshotId: string;
  featureCount: number;
  nullCount: number;
  onlineOfflineParity: "PASS" | "FAIL" | "NOT_EVALUATED";
  replayDeterministic: boolean;
  nullRate: number;
  parityEvidence: {
    independentlyBuilt: boolean;
    onlineFeatureSetSnapshotId: string;
    replayFeatureSetSnapshotId: string;
    replayRepeatFeatureSetSnapshotId: string;
    onlineSemanticHash: string;
    replaySemanticHash: string;
    replayRepeatSemanticHash: string;
    featureEngineVersion: string;
    onlineComputationRunId: string;
    replayComputationRunId: string;
    replayRepeatComputationRunId: string;
  };
  quality: QualityAssessment;
};

export type MarketContextSnapshot = TraceEnvelope & {
  producerModule: "market_context";
  snapshotId: string;
  universeSnapshotId: string;
  featureSetSnapshotId: string;
  featureQualitySnapshotId: string;
  contextRuleVersion: string;
  regime: "TREND" | "RANGE" | "TRANSITION" | "STRESS" | "UNKNOWN";
  volatility: "LOW" | "NORMAL" | "HIGH" | "EXTREME" | "UNKNOWN";
  breadth: number | null;
  correlation: number | null;
  liquidity: "HEALTHY" | "THIN" | "FRAGMENTED" | "UNKNOWN";
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  quality: QualityAssessment;
  uncertainty: UncertaintyVector;
};

export type DiscoveryCandidate = TraceEnvelope & {
  producerModule: "multi_opportunity_detection";
  candidateId: string;
  canonicalInstrumentId: string;
  underlyingGroupId: string;
  opportunityFamily: OpportunityFamily;
  opportunityPattern: OpportunityPattern;
  directionHypothesis: DirectionHypothesis;
  detectorId: string;
  detectorVersion: string;
  detectorLifecycle: DetectorLifecycleState;
  emissionScope: DetectorEmissionScope;
  firstDetectedAt: string;
  observedPrice: string;
  observedPriceFactId: string;
  expiresAt: string;
  inputLineage: {
    universeSnapshotId: string;
    universeSourceCutoff: string;
    universeAvailableAt: string;
    featureSetSnapshotId: string;
    featureQualitySnapshotId: string;
    featureSourceCutoff: string;
    featureAvailableAt: string;
    featureQualitySourceCutoff: string;
    featureQualityAvailableAt: string;
    marketContextSnapshotId: string;
    contextSourceCutoff: string;
    contextAvailableAt: string;
    observedPriceSourceCutoff: string;
    observedPriceAvailableAt: string;
    knowledgeCutoff: string;
    featureIds: readonly string[];
  };
  inputQuality: QualityAssessment;
  reasonCodes: readonly string[];
  counterHints: readonly string[];
  priority: CandidatePriority;
  priorityBasis: {
    policyVersion: string;
    urgency: "IMMEDIATE" | "SOON" | "NORMAL" | "LOW" | "UNKNOWN";
    potentialValue: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    expiryRisk: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    resourceCost: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    reasonCodes: readonly string[];
  };
};

export type DetectorCandidateSource = {
  candidateId: string;
  detectorId: string;
  detectorVersion: string;
  detectorLifecycle: DetectorLifecycleState;
  emissionScope: DetectorEmissionScope;
  opportunityPattern: OpportunityPattern;
  firstDetectedAt: string;
  candidateSourceCutoff: string;
};

export type OpportunityThesis = TraceEnvelope & {
  producerModule: "candidate_lifecycle_opportunity_thesis";
  thesisId: string;
  episodeId: string;
  thesisVersion: number;
  thesisAuthority: "VALIDATION_HYPOTHESIS_ONLY";
  canonicalInstrumentId: string;
  underlyingGroupId: string;
  opportunityFamily: OpportunityFamily;
  opportunityPatterns: readonly OpportunityPattern[];
  directionHypothesis: DirectionHypothesis;
  detectorSources: readonly DetectorCandidateSource[];
  firstDetectedAt: string;
  updatedAt: string;
  supportingReasons: readonly string[];
  conflictingReasons: readonly string[];
  knownUnknowns: readonly string[];
  uncertainty: UncertaintyVector;
};

export type CandidateEpisode = TraceEnvelope & {
  producerModule: "candidate_lifecycle_opportunity_thesis";
  episodeId: string;
  episodeKey: string;
  canonicalInstrumentId: string;
  underlyingGroupId: string;
  opportunityFamily: OpportunityFamily;
  opportunityPatterns: readonly OpportunityPattern[];
  directionHypothesis: DirectionHypothesis;
  episodeWindow: {
    policyVersion: string;
    windowStart: string;
    windowEnd: string;
  };
  lifecycle: CandidateLifecycleState;
  previousLifecycle: CandidateLifecycleState | null;
  transitionKind:
    | "CREATED"
    | "STATE_TRANSITION"
    | "CANDIDATE_MERGE"
    | "PRIORITY_CHANGE";
  priority: CandidatePriority;
  priorityPolicyVersion: string;
  thesisId: string;
  candidateIds: readonly string[];
  firstSeenAt: string;
  lastSeenAt: string;
  expiresAt: string;
  transitionedAt: string;
  transitionReasonCodes: readonly string[];
  rowVersion: number;
  idempotencyKey: string;
  outboxEventId: string;
};

export type EvidenceItem = {
  evidenceId: string;
  category: string;
  stance: "SUPPORTING" | "CONTRADICTING" | "MISSING";
  criticality: "REQUIRED" | "SUPPLEMENTAL";
  factIds: readonly string[];
  featureIds: readonly string[];
  independenceGroupIds: readonly string[];
  observedAt: string;
  quality: QualityAssessment;
  reasonCodes: readonly string[];
};

export type EvidencePackage = TraceEnvelope & {
  producerModule: "deep_validation";
  evidencePackageId: string;
  episodeId: string;
  thesisId: string;
  items: readonly EvidenceItem[];
  completenessRatio: number;
  uncertainty: UncertaintyVector;
  quality: QualityAssessment;
};

export type StructuralLevel = {
  levelId: string;
  kind: "SUPPORT" | "RESISTANCE" | "RANGE_EDGE" | "LIQUIDITY" | "FIB_ZONE";
  price: string;
  timeframe: string;
  sourceFactIds: readonly string[];
  reasonCodes: readonly string[];
};

export type AnalysisSnapshot = TraceEnvelope & {
  producerModule: "family_analysis";
  analysisId: string;
  episodeId: string;
  thesisId: string;
  evidencePackageId: string;
  evidenceItemIds: readonly string[];
  marketContextSnapshotId: string;
  analyzerVersion: string;
  analysisAuthority:
    | "TEST_ONLY_UNCALIBRATED"
    | "REPLAY_CALIBRATED"
    | "SHADOW_CALIBRATED"
    | "LIMITED_CALIBRATED"
    | "PRODUCTION_CALIBRATED";
  opportunityFamily: OpportunityFamily;
  directionBias: DirectionHypothesis;
  structureState: string;
  marketStage: string;
  locationQuality: "GOOD" | "ACCEPTABLE" | "POOR" | "UNKNOWN";
  spaceQuality: "GOOD" | "ACCEPTABLE" | "CONSTRAINED" | "UNKNOWN";
  structuralLevels: readonly StructuralLevel[];
  supportingReasons: readonly string[];
  counterEvidence: readonly string[];
  lateRisk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  fakeoutRisk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  noiseRisk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  uncertainty: UncertaintyVector;
};

export type CalibrationReference = {
  status: "UNCALIBRATED" | "CALIBRATED";
  calibrationVersion: string | null;
  targetDefinitionVersion: string | null;
  calibrationCohortId: string | null;
  untouchedHoldoutId: string | null;
  coveredRegimes: readonly Exclude<MarketContextSnapshot["regime"], "UNKNOWN">[];
  sampleSize: number;
  estimatedProbability: number | null;
  confidenceInterval: readonly [number, number] | null;
  reliabilityError: number | null;
  segment: {
    opportunityFamily: OpportunityFamily;
    direction: DirectionHypothesis;
    regime: MarketContextSnapshot["regime"];
  };
  evaluatedAt: string | null;
  abstainReasonCodes: readonly string[];
};

export type QualificationDimensionStatus =
  | "PASS"
  | "DEGRADED"
  | "FAIL"
  | "UNKNOWN";

export type EvidenceQualificationAssessment = {
  completenessStatus: QualificationDimensionStatus;
  independenceStatus: QualificationDimensionStatus;
  freshnessStatus: QualificationDimensionStatus;
  dataQualityStatus: QualificationDimensionStatus;
  lineageStatus: QualificationDimensionStatus;
  uncertaintyStatus: QualificationDimensionStatus;
  requiredItemCount: number;
  observedRequiredItemCount: number;
  freshItemCount: number;
  totalItemCount: number;
  independentGroupCount: number;
  reasonCodes: readonly string[];
};

export type SetupQualificationAssessment = {
  directionStatus: QualificationDimensionStatus;
  structureStatus: QualificationDimensionStatus;
  locationStatus: QualificationDimensionStatus;
  spaceStatus: QualificationDimensionStatus;
  timingStatus: QualificationDimensionStatus;
  fakeoutStatus: QualificationDimensionStatus;
  noiseStatus: QualificationDimensionStatus;
  regimeFitStatus: QualificationDimensionStatus;
  uncertaintyStatus: QualificationDimensionStatus;
  reasonCodes: readonly string[];
};

export type SignalQualification = TraceEnvelope & {
  producerModule: "signal_qualification";
  qualificationId: string;
  episodeId: string;
  thesisId: string;
  evidencePackageId: string;
  analysisId: string;
  marketContextSnapshotId: string;
  opportunityFamily: OpportunityFamily;
  direction: DirectionHypothesis;
  qualificationPolicyVersion: string;
  qualificationAuthority:
    | "TEST_ONLY_UNCALIBRATED"
    | "REPLAY_CALIBRATED"
    | "SHADOW_CALIBRATED"
    | "LIMITED_CALIBRATED"
    | "PRODUCTION_CALIBRATED";
  evidenceGrade: EvidenceGrade;
  setupGrade: SetupGrade;
  evidenceAssessment: EvidenceQualificationAssessment;
  setupAssessment: SetupQualificationAssessment;
  evidenceCalibration: CalibrationReference;
  setupCalibration: CalibrationReference;
  reasonCodes: readonly string[];
};

export type PriceZone = {
  lower: string;
  upper: string;
  sourceLevelIds: readonly string[];
};

export type TargetLevel = {
  targetId: string;
  price: string;
  allocationPercent: number;
  source: "PRIOR_EXTREME" | "STRUCTURE_BOUNDARY" | "VOLUME_AREA" | "LIQUIDITY_AREA" | "VALIDATED_EXTENSION";
  sourceLevelIds: readonly string[];
};

export type StrategyDraft = TraceEnvelope & {
  producerModule: "strategy_construction";
  draftId: string;
  episodeId: string;
  analysisId: string;
  qualificationId: string;
  opportunityFamily: OpportunityFamily;
  strategyAuthority:
    | "TEST_ONLY_UNCALIBRATED"
    | "REPLAY_CALIBRATED"
    | "SHADOW_CALIBRATED"
    | "LIMITED_CALIBRATED"
    | "PRODUCTION_CALIBRATED";
  analyzerVersion: string;
  qualificationPolicyVersion: string;
  templateVersion: string;
  bufferPolicyVersion: string;
  costAssumptionSetId: string;
  costAssumptionVersion: string;
  direction: Direction;
  referencePrice: string;
  referencePriceFactIds: readonly string[];
  whyNow: readonly string[];
  whyNotNow: readonly string[];
  entryTrigger: string;
  plannedEntryZone: PriceZone;
  entryZoneBufferBps: number;
  structuralInvalidation: string;
  structuralStopBase: string;
  structuralStop: string;
  structuralStopBufferBps: number;
  structuralStopSourceLevelIds: readonly string[];
  targets: readonly TargetLevel[];
  rewardRiskCalculationVersion: string;
  rewardRiskPrecision: number;
  grossRewardRisk: number;
  estimatedNetRewardRisk: number;
  feePerSideAssumptionBps: number;
  slippagePerSideAssumptionBps: number;
  fundingAssumptionBps: number;
  totalConservativeCostBps: number;
  confirmationWindow: string;
  expiresAt: string;
  noChaseCondition: string;
  partialTakeProfitPolicy: string;
  counterEvidence: readonly string[];
  blockers: readonly string[];
};

export type FeasibilityCheck = {
  checkId: string;
  status: "PASS" | "FAIL" | "UNAVAILABLE";
  observedValue: string | number | null;
  thresholdVersion: string;
  reasonCodes: readonly string[];
};

export type ExecutionFeasibilitySnapshot = TraceEnvelope & {
  producerModule: "execution_feasibility_final_decision";
  feasibilityId: string;
  draftId: string;
  status: "PASS" | "FAIL" | "UNAVAILABLE";
  checks: readonly FeasibilityCheck[];
  estimatedNetRewardRisk: number | null;
  maximumExecutableNotional: string | null;
  quality: QualityAssessment;
  uncertainty: UncertaintyVector;
};

export type ExecutableTradePlan = {
  planId: string;
  direction: Direction;
  entryTrigger: string;
  plannedEntryZone: PriceZone;
  structuralInvalidation: string;
  structuralStop: string;
  targets: readonly TargetLevel[];
  structuralRewardRisk: number;
  estimatedNetRewardRisk: number;
  expiresAt: string;
  noChaseCondition: string;
};

type StrategyDecisionBase = TraceEnvelope & {
  producerModule: "execution_feasibility_final_decision";
  decisionId: string;
  episodeId: string;
  draftId: string;
  feasibilityId: string;
  reasonCodes: readonly string[];
  decidedAt: string;
};

export type ReadyStrategyDecision = StrategyDecisionBase & {
  actionState: "TRADE_PLAN_READY";
  executablePlan: ExecutableTradePlan;
};

export type NonReadyStrategyDecision = StrategyDecisionBase & {
  actionState: Exclude<ActionState, "TRADE_PLAN_READY">;
  executablePlan: null;
};

export type StrategyDecision = ReadyStrategyDecision | NonReadyStrategyDecision;

export type PersonalRiskView = TraceEnvelope & {
  producerModule: "personal_risk_lens";
  riskViewId: string;
  decisionId: string;
  userFit: UserFit;
  maximumPositionNotional: string | null;
  maximumLoss: string | null;
  requiredMargin: string | null;
  liquidationDistancePercent: number | null;
  estimatedFees: string | null;
  blockerReasonCodes: readonly string[];
};

export type PortfolioRiskView = TraceEnvelope & {
  producerModule: "portfolio_risk";
  portfolioRiskViewId: string;
  decisionId: string;
  userFit: UserFit;
  aggregateStopLoss: string | null;
  aggregateMargin: string | null;
  btcEthBeta: number | null;
  clusterConcentration: number | null;
  correlatedLoss: string | null;
  venueConcentration: number | null;
  blockerReasonCodes: readonly string[];
  quality: QualityAssessment;
};

export type DecisionSnapshot = TraceEnvelope & {
  producerModule: "decision_read_model";
  snapshotId: string;
  episodeId: string;
  canonicalInstrumentId: string;
  opportunityFamily: OpportunityFamily;
  thesisId: string;
  candidatePriority: CandidatePriority;
  evidenceGrade: EvidenceGrade;
  setupGrade: SetupGrade;
  actionState: ActionState;
  userFit: UserFit;
  evidencePackageId: string;
  analysisId: string;
  qualificationId: string;
  decision: StrategyDecision;
  personalRiskViewId: string | null;
  portfolioRiskViewId: string | null;
  factVersion: string;
  featureVersion: string;
  ruleVersions: Readonly<Record<string, string>>;
  uncertainty: UncertaintyVector;
  freshness: QualityAssessment;
  unavailableReasonCodes: readonly string[];
  supersedesSnapshotId: string | null;
};

export type AlertEvent = TraceEnvelope & {
  producerModule: "alert_delivery";
  alertId: string;
  episodeId: string;
  decisionSnapshotId: string;
  alertType: "EARLY_CANDIDATE" | "EVIDENCE_READY" | "WAIT_NEAR_TRIGGER" | "READY" | "INVALIDATED" | "EXPIRED" | "DEGRADED";
  dedupeKey: string;
  expiresAt: string;
};

export type DeliveryReceipt = TraceEnvelope & {
  producerModule: "alert_delivery";
  receiptId: string;
  alertId: string;
  channel: "IN_APP";
  status: "DELIVERED" | "ACKNOWLEDGED" | "EXPIRED" | "FAILED";
  deliveredAt: string | null;
  acknowledgedAt: string | null;
  attemptCount: number;
};

export type OutcomeRecord = TraceEnvelope & {
  producerModule: "outcome_evaluation";
  outcomeId: string;
  episodeId: string;
  decisionSnapshotId: string;
  checkpoint: "1H" | "4H" | "24H";
  status: "TP_FIRST" | "SL_FIRST" | "PARTIAL" | "EXPIRED" | "NOT_TRIGGERED" | "DATA_UNAVAILABLE";
  maximumFavorableExcursion: number | null;
  maximumAdverseExcursion: number | null;
  netR: number | null;
  leadTimeSeconds: number | null;
  factCutoff: string;
};

export type MissedOpportunityRecord = TraceEnvelope & {
  producerModule: "outcome_evaluation";
  missedOpportunityId: string;
  canonicalInstrumentId: string;
  eventLabelVersion: string;
  eventStartAt: string;
  publicBreakoutAt: string;
  direction: Direction;
  matchingCandidateIds: readonly string[];
  missReasonCode: string;
};

export type EvaluationDatasetSnapshot = TraceEnvelope & {
  producerModule: "outcome_evaluation";
  datasetSnapshotId: string;
  eventLabelVersion: string;
  candidateDenominatorCount: number;
  eventDenominatorCount: number;
  matchedNonEventDenominatorCount: number;
  unavailableCount: number;
  recordIds: readonly string[];
};

export type ResearchProposal = TraceEnvelope & {
  producerModule: "research_governance";
  proposalId: string;
  hypothesis: string;
  datasetSnapshotIds: readonly string[];
  primaryMetric: string;
  nonInferiorityMetrics: readonly string[];
  expectedRisks: readonly string[];
  status: "DRAFT" | "REGISTERED" | "REJECTED" | "TESTING" | "AWAITING_REVIEW" | "CLOSED";
};

export type ExperimentRecord = TraceEnvelope & {
  producerModule: "research_governance";
  experimentId: string;
  proposalId: string;
  codeVersion: string;
  datasetSnapshotIds: readonly string[];
  parameterSet: Readonly<Record<string, string | number | boolean>>;
  resultStatus: "PASS" | "FAIL" | "INVALID" | "INCONCLUSIVE";
  resultArtifactDigest: string;
};

export type PromotionDecisionRecord = TraceEnvelope & {
  producerModule: "research_governance";
  promotionDecisionId: string;
  proposalId: string;
  experimentIds: readonly string[];
  decision: "PROMOTE_TO_SHADOW" | "PROMOTE_TO_LIMITED" | "PROMOTE_TO_ACTIVE" | "REJECT" | "SUSPEND";
  humanApproverId: string;
  decidedAt: string;
  reasonCodes: readonly string[];
};

export type RuntimeTruthSnapshot = TraceEnvelope & {
  producerModule: "runtime_security_release_control";
  runtimeTruthId: string;
  runtimeMode: "REHEARSAL" | "PRODUCTION";
  runtimeProfileVersion: string;
  liveness: "READY" | "FAILED" | "UNKNOWN";
  dependencyReadiness: "READY" | "PARTIAL" | "FAILED" | "UNKNOWN";
  businessReadiness: "READY" | "PARTIAL" | "FAILED" | "UNKNOWN";
  dataFreshness: "FRESH" | "PARTIAL" | "STALE" | "UNKNOWN";
  releaseValidity: "VALID" | "INVALID" | "UNKNOWN";
  checks: {
    liveness: RuntimeTruthCheckEvidence;
    dependencyReadiness: RuntimeTruthCheckEvidence;
    businessReadiness: RuntimeTruthCheckEvidence;
    dataFreshness: RuntimeTruthCheckEvidence;
    releaseValidity: RuntimeTruthCheckEvidence;
  };
  reasonCodes: readonly string[];
};

export type RuntimeTruthCheckEvidence = {
  checkedAt: string;
  checkIds: readonly string[];
  evidenceIds: readonly string[];
  reasonCodes: readonly string[];
};

export type ReleaseRecord = TraceEnvelope & {
  producerModule: "runtime_security_release_control";
  releaseRecordId: string;
  commit: string;
  tree: string;
  artifactDigest: string;
  imageDigests: Readonly<Record<string, string>>;
  databaseSchemaVersion: string;
  featureVersions: readonly string[];
  ruleVersions: readonly string[];
  rollbackReleaseId: string;
  evidenceDigest: string;
};

export type DriftStatusSnapshot = TraceEnvelope & {
  producerModule: "runtime_security_release_control";
  driftSnapshotId: string;
  dimension: string;
  status: "NORMAL" | "WARN" | "DEGRADE" | "SUSPEND" | "RESEARCH";
  baselineVersion: string;
  observedValue: number | null;
  reasonCodes: readonly string[];
};
