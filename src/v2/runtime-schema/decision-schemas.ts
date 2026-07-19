import { z } from "zod";
import type {
  AnalysisSnapshot,
  CalibrationReference,
  CandidateEpisode,
  DecisionSnapshot,
  DiscoveryCandidate,
  EvidenceItem,
  EvidencePackage,
  ExecutableTradePlan,
  ExecutionFeasibilitySnapshot,
  FeasibilityCheck,
  NonReadyStrategyDecision,
  OpportunityThesis,
  PersonalRiskView,
  PortfolioRiskView,
  PriceZone,
  ReadyStrategyDecision,
  SignalQualification,
  StrategyDecision,
  StrategyDraft,
  StructuralLevel,
  TargetLevel,
} from "../domain/contracts";
import { CONSTITUTIONAL_INVARIANTS, OPPORTUNITY_FAMILIES } from "../domain/product-constitution";
import {
  ACTION_STATES,
  CANDIDATE_LIFECYCLE_STATES,
  CANDIDATE_PRIORITIES,
  DETECTOR_LIFECYCLE_STATES,
  EVIDENCE_GRADES,
  SETUP_GRADES,
  USER_FITS,
  type UserFit,
} from "../domain/states";
import {
  compareNonNegativeDecimalStrings,
  FiniteNumberSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeDecimalStringSchema,
  NonNegativeFiniteSchema,
  NonNegativeIntegerSchema,
  PositiveDecimalStringSchema,
  QualityAssessmentSchema,
  RatioSchema,
  ReasonCodesSchema,
  UncertaintyVectorSchema,
  traceEnvelopeShape,
} from "./primitives";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "./schema-versions";

const DirectionSchema = z.enum(["LONG", "SHORT"]);
const DirectionHypothesisSchema = z.enum([
  "LONG",
  "SHORT",
  "NEUTRAL",
  "UNKNOWN",
]);

export const UserFitSchema = z.enum(USER_FITS) satisfies z.ZodType<UserFit>;

export const DiscoveryCandidateSchema = z.strictObject({
  ...traceEnvelopeShape(
    "multi_opportunity_detection",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.DiscoveryCandidate,
  ),
  candidateId: NonEmptyStringSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  opportunityFamily: z.enum(OPPORTUNITY_FAMILIES),
  directionHypothesis: DirectionHypothesisSchema,
  detectorId: NonEmptyStringSchema,
  detectorVersion: NonEmptyStringSchema,
  detectorLifecycle: z.enum(DETECTOR_LIFECYCLE_STATES),
  firstDetectedAt: IsoDateTimeSchema,
  observedPrice: PositiveDecimalStringSchema,
  featureSetSnapshotId: NonEmptyStringSchema,
  marketContextSnapshotId: NonEmptyStringSchema,
  reasonCodes: ReasonCodesSchema.min(1),
  counterHints: ReasonCodesSchema,
  priority: z.enum(CANDIDATE_PRIORITIES),
}) satisfies z.ZodType<DiscoveryCandidate>;

export const OpportunityThesisSchema = z.strictObject({
  ...traceEnvelopeShape(
    "candidate_lifecycle_opportunity_thesis",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.OpportunityThesis,
  ),
  thesisId: NonEmptyStringSchema,
  episodeId: NonEmptyStringSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  opportunityFamily: z.enum(OPPORTUNITY_FAMILIES),
  directionHypothesis: DirectionHypothesisSchema,
  detectorCandidateIds: z.array(NonEmptyStringSchema).min(1),
  firstDetectedAt: IsoDateTimeSchema,
  supportingReasons: ReasonCodesSchema,
  conflictingReasons: ReasonCodesSchema,
  knownUnknowns: ReasonCodesSchema,
  uncertainty: UncertaintyVectorSchema,
}) satisfies z.ZodType<OpportunityThesis>;

export const CandidateEpisodeSchema = z.strictObject({
  ...traceEnvelopeShape(
    "candidate_lifecycle_opportunity_thesis",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.CandidateEpisode,
  ),
  episodeId: NonEmptyStringSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  opportunityFamily: z.enum(OPPORTUNITY_FAMILIES),
  directionHypothesis: DirectionHypothesisSchema,
  episodeWindowVersion: NonEmptyStringSchema,
  lifecycle: z.enum(CANDIDATE_LIFECYCLE_STATES),
  priority: z.enum(CANDIDATE_PRIORITIES),
  thesisId: NonEmptyStringSchema,
  firstSeenAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  rowVersion: z.number().int().positive(),
  idempotencyKey: NonEmptyStringSchema,
}).superRefine((episode, context) => {
  if (Date.parse(episode.firstSeenAt) > Date.parse(episode.lastSeenAt)) {
    context.addIssue({
      code: "custom",
      message: "firstSeenAt cannot exceed lastSeenAt",
      path: ["firstSeenAt"],
    });
  }
  if (Date.parse(episode.lastSeenAt) > Date.parse(episode.expiresAt)) {
    context.addIssue({
      code: "custom",
      message: "lastSeenAt cannot exceed expiresAt",
      path: ["expiresAt"],
    });
  }
}) satisfies z.ZodType<CandidateEpisode>;

export const EvidenceItemSchema = z.strictObject({
  evidenceId: NonEmptyStringSchema,
  category: NonEmptyStringSchema,
  stance: z.enum(["SUPPORTING", "CONTRADICTING", "MISSING"]),
  factIds: z.array(NonEmptyStringSchema),
  featureIds: z.array(NonEmptyStringSchema),
  observedAt: IsoDateTimeSchema,
  quality: QualityAssessmentSchema,
  reasonCodes: ReasonCodesSchema,
}).superRefine((item, context) => {
  if (
    item.factIds.length === 0 &&
    item.featureIds.length === 0 &&
    item.stance !== "MISSING"
  ) {
    context.addIssue({
      code: "custom",
      message: "non-missing evidence requires fact or feature lineage",
      path: ["factIds"],
    });
  }
}) satisfies z.ZodType<EvidenceItem>;

export const EvidencePackageSchema = z.strictObject({
  ...traceEnvelopeShape(
    "deep_validation",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.EvidencePackage,
  ),
  evidencePackageId: NonEmptyStringSchema,
  episodeId: NonEmptyStringSchema,
  thesisId: NonEmptyStringSchema,
  tier: z.enum(["A", "B", "C"]),
  items: z.array(EvidenceItemSchema),
  completenessRatio: RatioSchema,
  uncertainty: UncertaintyVectorSchema,
  quality: QualityAssessmentSchema,
}) satisfies z.ZodType<EvidencePackage>;

export const StructuralLevelSchema = z.strictObject({
  levelId: NonEmptyStringSchema,
  kind: z.enum([
    "SUPPORT",
    "RESISTANCE",
    "RANGE_EDGE",
    "LIQUIDITY",
    "FIB_ZONE",
  ]),
  price: PositiveDecimalStringSchema,
  timeframe: NonEmptyStringSchema,
  sourceFactIds: z.array(NonEmptyStringSchema).min(1),
  reasonCodes: ReasonCodesSchema.min(1),
}) satisfies z.ZodType<StructuralLevel>;

export const AnalysisSnapshotSchema = z.strictObject({
  ...traceEnvelopeShape(
    "family_analysis",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.AnalysisSnapshot,
  ),
  analysisId: NonEmptyStringSchema,
  episodeId: NonEmptyStringSchema,
  thesisId: NonEmptyStringSchema,
  evidencePackageId: NonEmptyStringSchema,
  analyzerVersion: NonEmptyStringSchema,
  opportunityFamily: z.enum(OPPORTUNITY_FAMILIES),
  directionBias: DirectionHypothesisSchema,
  structureState: NonEmptyStringSchema,
  marketStage: NonEmptyStringSchema,
  locationQuality: z.enum(["GOOD", "ACCEPTABLE", "POOR", "UNKNOWN"]),
  structuralLevels: z.array(StructuralLevelSchema),
  supportingReasons: ReasonCodesSchema,
  counterEvidence: ReasonCodesSchema,
  lateRisk: z.enum(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]),
  fakeoutRisk: z.enum(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]),
  noiseRisk: z.enum(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]),
  uncertainty: UncertaintyVectorSchema,
}) satisfies z.ZodType<AnalysisSnapshot>;

export const CalibrationReferenceSchema = z.strictObject({
  calibrationVersion: NonEmptyStringSchema,
  sampleSize: NonNegativeIntegerSchema,
  confidenceInterval: z
    .tuple([FiniteNumberSchema, FiniteNumberSchema])
    .refine(([lower, upper]) => lower <= upper, "interval must be ordered")
    .nullable(),
  abstainReasonCodes: ReasonCodesSchema,
}) satisfies z.ZodType<CalibrationReference>;

export const SignalQualificationSchema = z.strictObject({
  ...traceEnvelopeShape(
    "signal_qualification",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.SignalQualification,
  ),
  qualificationId: NonEmptyStringSchema,
  episodeId: NonEmptyStringSchema,
  evidencePackageId: NonEmptyStringSchema,
  analysisId: NonEmptyStringSchema,
  evidenceGrade: z.enum(EVIDENCE_GRADES),
  setupGrade: z.enum(SETUP_GRADES),
  evidenceCalibration: CalibrationReferenceSchema,
  setupCalibration: CalibrationReferenceSchema,
  reasonCodes: ReasonCodesSchema,
}) satisfies z.ZodType<SignalQualification>;

export const PriceZoneSchema = z.strictObject({
  lower: PositiveDecimalStringSchema,
  upper: PositiveDecimalStringSchema,
  sourceLevelIds: z.array(NonEmptyStringSchema).min(1),
}).refine(
  (zone) => compareNonNegativeDecimalStrings(zone.lower, zone.upper) <= 0,
  "entry-zone lower bound cannot exceed upper bound",
) satisfies z.ZodType<PriceZone>;

export const TargetLevelSchema = z.strictObject({
  targetId: NonEmptyStringSchema,
  price: PositiveDecimalStringSchema,
  allocationPercent: FiniteNumberSchema.gt(0).max(100),
  source: z.enum([
    "PRIOR_EXTREME",
    "STRUCTURE_BOUNDARY",
    "VOLUME_AREA",
    "LIQUIDITY_AREA",
    "VALIDATED_EXTENSION",
  ]),
  sourceLevelIds: z.array(NonEmptyStringSchema).min(1),
}) satisfies z.ZodType<TargetLevel>;

function addPlanGeometryIssues(
  plan: {
    direction: "LONG" | "SHORT";
    plannedEntryZone: PriceZone;
    structuralStop: string;
    targets: readonly TargetLevel[];
  },
  context: z.core.$RefinementCtx,
) {
  const lower = plan.plannedEntryZone.lower;
  const upper = plan.plannedEntryZone.upper;
  const stop = plan.structuralStop;

  if (
    plan.direction === "LONG" &&
    compareNonNegativeDecimalStrings(stop, lower) >= 0
  ) {
    context.addIssue({
      code: "custom",
      message: "a LONG structural stop must be below the entry zone",
      path: ["structuralStop"],
    });
  }
  if (
    plan.direction === "SHORT" &&
    compareNonNegativeDecimalStrings(stop, upper) <= 0
  ) {
    context.addIssue({
      code: "custom",
      message: "a SHORT structural stop must be above the entry zone",
      path: ["structuralStop"],
    });
  }
  if (
    plan.targets.some((target) =>
      plan.direction === "LONG"
        ? compareNonNegativeDecimalStrings(target.price, upper) <= 0
        : compareNonNegativeDecimalStrings(target.price, lower) >= 0,
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "every target must be on the rewarding side of the entry zone",
      path: ["targets"],
    });
  }
}

function validateTargetAllocation(
  targets: readonly TargetLevel[],
  context: z.core.$RefinementCtx,
) {
  const allocation = targets.reduce(
    (sum, target) => sum + target.allocationPercent,
    0,
  );
  if (Math.abs(allocation - 100) > 0.0001) {
    context.addIssue({
      code: "custom",
      message: "target allocations must total 100 percent",
      path: ["targets"],
    });
  }
}

export const StrategyDraftSchema = z.strictObject({
  ...traceEnvelopeShape(
    "strategy_construction",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.StrategyDraft,
  ),
  draftId: NonEmptyStringSchema,
  episodeId: NonEmptyStringSchema,
  analysisId: NonEmptyStringSchema,
  qualificationId: NonEmptyStringSchema,
  templateVersion: NonEmptyStringSchema,
  direction: DirectionSchema,
  whyNow: ReasonCodesSchema,
  whyNotNow: ReasonCodesSchema,
  entryTrigger: NonEmptyStringSchema,
  plannedEntryZone: PriceZoneSchema,
  structuralInvalidation: NonEmptyStringSchema,
  structuralStop: PositiveDecimalStringSchema,
  structuralStopSourceLevelIds: z.array(NonEmptyStringSchema).min(1),
  targets: z.array(TargetLevelSchema),
  grossRewardRisk: NonNegativeFiniteSchema,
  estimatedNetRewardRisk: NonNegativeFiniteSchema,
  feeAssumptionBps: NonNegativeFiniteSchema,
  slippageAssumptionBps: NonNegativeFiniteSchema,
  fundingAssumptionBps: FiniteNumberSchema,
  confirmationWindow: NonEmptyStringSchema,
  expiresAt: IsoDateTimeSchema,
  noChaseCondition: NonEmptyStringSchema,
  counterEvidence: ReasonCodesSchema,
  blockers: ReasonCodesSchema,
}).superRefine((draft, context) => {
  addPlanGeometryIssues(draft, context);
  if (draft.targets.length > 0) {
    validateTargetAllocation(draft.targets, context);
  }
}) satisfies z.ZodType<StrategyDraft>;

export const FeasibilityCheckSchema = z.strictObject({
  checkId: NonEmptyStringSchema,
  status: z.enum(["PASS", "FAIL", "UNAVAILABLE"]),
  observedValue: z
    .union([NonEmptyStringSchema, FiniteNumberSchema])
    .nullable(),
  thresholdVersion: NonEmptyStringSchema,
  reasonCodes: ReasonCodesSchema,
}) satisfies z.ZodType<FeasibilityCheck>;

export const ExecutionFeasibilitySnapshotSchema = z.strictObject({
  ...traceEnvelopeShape(
    "execution_feasibility_final_decision",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.ExecutionFeasibilitySnapshot,
  ),
  feasibilityId: NonEmptyStringSchema,
  draftId: NonEmptyStringSchema,
  status: z.enum(["PASS", "FAIL", "UNAVAILABLE"]),
  checks: z.array(FeasibilityCheckSchema).min(1),
  estimatedNetRewardRisk: NonNegativeFiniteSchema.nullable(),
  maximumExecutableNotional: NonNegativeDecimalStringSchema.nullable(),
  quality: QualityAssessmentSchema,
  uncertainty: UncertaintyVectorSchema,
}).superRefine((snapshot, context) => {
  if (
    snapshot.status === "PASS" &&
    snapshot.checks.some((check) => check.status !== "PASS")
  ) {
    context.addIssue({
      code: "custom",
      message: "PASS feasibility requires every check to pass",
      path: ["checks"],
    });
  }
  if (
    snapshot.status === "PASS" &&
    snapshot.estimatedNetRewardRisk === null
  ) {
    context.addIssue({
      code: "custom",
      message: "PASS feasibility requires estimated net reward-risk",
      path: ["estimatedNetRewardRisk"],
    });
  }
}) satisfies z.ZodType<ExecutionFeasibilitySnapshot>;

export const ExecutableTradePlanSchema = z.strictObject({
  planId: NonEmptyStringSchema,
  direction: DirectionSchema,
  entryTrigger: NonEmptyStringSchema,
  plannedEntryZone: PriceZoneSchema,
  structuralInvalidation: NonEmptyStringSchema,
  structuralStop: PositiveDecimalStringSchema,
  targets: z.array(TargetLevelSchema).min(1),
  structuralRewardRisk: FiniteNumberSchema.min(
    CONSTITUTIONAL_INVARIANTS.minimumStructuralRewardRisk,
  ),
  estimatedNetRewardRisk: FiniteNumberSchema.min(
    CONSTITUTIONAL_INVARIANTS.minimumNetRewardRisk,
  ),
  expiresAt: IsoDateTimeSchema,
  noChaseCondition: NonEmptyStringSchema,
}).superRefine((plan, context) => {
  addPlanGeometryIssues(plan, context);
  validateTargetAllocation(plan.targets, context);
}) satisfies z.ZodType<ExecutableTradePlan>;

const StrategyDecisionBaseShape = {
  ...traceEnvelopeShape(
    "execution_feasibility_final_decision",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.StrategyDecision,
  ),
  decisionId: NonEmptyStringSchema,
  episodeId: NonEmptyStringSchema,
  draftId: NonEmptyStringSchema,
  feasibilityId: NonEmptyStringSchema,
  reasonCodes: ReasonCodesSchema,
  decidedAt: IsoDateTimeSchema,
} as const;

export const ReadyStrategyDecisionSchema = z.strictObject({
  ...StrategyDecisionBaseShape,
  actionState: z.literal("TRADE_PLAN_READY"),
  executablePlan: ExecutableTradePlanSchema,
}) satisfies z.ZodType<ReadyStrategyDecision>;

export const NonReadyStrategyDecisionSchema = z.strictObject({
  ...StrategyDecisionBaseShape,
  actionState: z.enum(["OBSERVE", "WAIT", "BLOCKED"]),
  executablePlan: z.null(),
}) satisfies z.ZodType<NonReadyStrategyDecision>;

export const StrategyDecisionSchema = z
  .discriminatedUnion("actionState", [
    ReadyStrategyDecisionSchema,
    NonReadyStrategyDecisionSchema,
  ])
  .superRefine((decision, context) => {
    if (Date.parse(decision.sourceCutoff) > Date.parse(decision.decidedAt)) {
      context.addIssue({
        code: "custom",
        message: "a decision cannot precede its source cutoff",
        path: ["decidedAt"],
      });
    }
    if (
      decision.actionState === "TRADE_PLAN_READY" &&
      Date.parse(decision.executablePlan.expiresAt) <=
        Date.parse(decision.decidedAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "a ready plan must expire after the decision time",
        path: ["executablePlan", "expiresAt"],
      });
    }
  }) satisfies z.ZodType<StrategyDecision>;

export const PersonalRiskViewSchema = z.strictObject({
  ...traceEnvelopeShape(
    "personal_risk_lens",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.PersonalRiskView,
  ),
  riskViewId: NonEmptyStringSchema,
  decisionId: NonEmptyStringSchema,
  userFit: UserFitSchema,
  maximumPositionNotional: NonNegativeDecimalStringSchema.nullable(),
  maximumLoss: NonNegativeDecimalStringSchema.nullable(),
  requiredMargin: NonNegativeDecimalStringSchema.nullable(),
  liquidationDistancePercent: NonNegativeFiniteSchema.nullable(),
  estimatedFees: NonNegativeDecimalStringSchema.nullable(),
  blockerReasonCodes: ReasonCodesSchema,
}) satisfies z.ZodType<PersonalRiskView>;

export const PortfolioRiskViewSchema = z.strictObject({
  ...traceEnvelopeShape(
    "portfolio_risk",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.PortfolioRiskView,
  ),
  portfolioRiskViewId: NonEmptyStringSchema,
  decisionId: NonEmptyStringSchema,
  userFit: UserFitSchema,
  aggregateStopLoss: NonNegativeDecimalStringSchema.nullable(),
  aggregateMargin: NonNegativeDecimalStringSchema.nullable(),
  btcEthBeta: FiniteNumberSchema.nullable(),
  clusterConcentration: RatioSchema.nullable(),
  correlatedLoss: NonNegativeDecimalStringSchema.nullable(),
  venueConcentration: RatioSchema.nullable(),
  blockerReasonCodes: ReasonCodesSchema,
  quality: QualityAssessmentSchema,
}) satisfies z.ZodType<PortfolioRiskView>;

export const DecisionSnapshotSchema = z.strictObject({
  ...traceEnvelopeShape(
    "decision_read_model",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.DecisionSnapshot,
  ),
  snapshotId: NonEmptyStringSchema,
  episodeId: NonEmptyStringSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  opportunityFamily: z.enum(OPPORTUNITY_FAMILIES),
  thesisId: NonEmptyStringSchema,
  candidatePriority: z.enum(CANDIDATE_PRIORITIES),
  evidenceGrade: z.enum(EVIDENCE_GRADES),
  setupGrade: z.enum(SETUP_GRADES),
  actionState: z.enum(ACTION_STATES),
  userFit: UserFitSchema,
  evidencePackageId: NonEmptyStringSchema,
  analysisId: NonEmptyStringSchema,
  qualificationId: NonEmptyStringSchema,
  decision: StrategyDecisionSchema,
  personalRiskViewId: NonEmptyStringSchema.nullable(),
  portfolioRiskViewId: NonEmptyStringSchema.nullable(),
  factVersion: NonEmptyStringSchema,
  featureVersion: NonEmptyStringSchema,
  ruleVersions: z.record(NonEmptyStringSchema, NonEmptyStringSchema),
  uncertainty: UncertaintyVectorSchema,
  freshness: QualityAssessmentSchema,
  unavailableReasonCodes: ReasonCodesSchema,
  supersedesSnapshotId: NonEmptyStringSchema.nullable(),
}).superRefine((snapshot, context) => {
  if (snapshot.actionState !== snapshot.decision.actionState) {
    context.addIssue({
      code: "custom",
      message: "read-model actionState must match the authoritative decision",
      path: ["actionState"],
    });
  }
  if (
    snapshot.actionState === "TRADE_PLAN_READY" &&
    snapshot.freshness.status !== "FRESH"
  ) {
    context.addIssue({
      code: "custom",
      message: "a non-fresh snapshot cannot expose TRADE_PLAN_READY",
      path: ["freshness", "status"],
    });
  }
}) satisfies z.ZodType<DecisionSnapshot>;
