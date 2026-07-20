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
import {
  CONSTITUTIONAL_INVARIANTS,
  isOpportunityPatternForFamily,
  OPPORTUNITY_DIRECTIONS_BY_FAMILY,
  OPPORTUNITY_FAMILIES,
  OPPORTUNITY_PATTERNS,
} from "../domain/product-constitution";
import {
  ACTION_STATES,
  canDetectorEmit,
  CANDIDATE_LIFECYCLE_STATES,
  CANDIDATE_PRIORITIES,
  DETECTOR_EMISSION_SCOPES,
  DETECTOR_LIFECYCLE_STATES,
  EVIDENCE_GRADES,
  SETUP_GRADES,
  USER_FITS,
  isCandidateLifecycleTransitionAllowed,
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
const CandidateDirectionHypothesisSchema = DirectionHypothesisSchema.refine(
  (direction) => direction !== "NEUTRAL",
  "a discovery hypothesis must be directional or explicitly UNKNOWN",
);
const OpportunityPatternSchema = z.enum(OPPORTUNITY_PATTERNS);

const CandidateInputLineageSchema = z.strictObject({
  universeSnapshotId: NonEmptyStringSchema,
  universeSourceCutoff: IsoDateTimeSchema,
  universeAvailableAt: IsoDateTimeSchema,
  featureSetSnapshotId: NonEmptyStringSchema,
  featureQualitySnapshotId: NonEmptyStringSchema,
  featureSourceCutoff: IsoDateTimeSchema,
  featureAvailableAt: IsoDateTimeSchema,
  featureQualitySourceCutoff: IsoDateTimeSchema,
  featureQualityAvailableAt: IsoDateTimeSchema,
  marketContextSnapshotId: NonEmptyStringSchema,
  contextSourceCutoff: IsoDateTimeSchema,
  contextAvailableAt: IsoDateTimeSchema,
  observedPriceSourceCutoff: IsoDateTimeSchema,
  observedPriceAvailableAt: IsoDateTimeSchema,
  knowledgeCutoff: IsoDateTimeSchema,
  featureIds: z.array(NonEmptyStringSchema).min(1),
});

const CandidatePriorityBasisSchema = z.strictObject({
  policyVersion: NonEmptyStringSchema,
  urgency: z.enum(["IMMEDIATE", "SOON", "NORMAL", "LOW", "UNKNOWN"]),
  potentialValue: z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]),
  expiryRisk: z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]),
  resourceCost: z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]),
  reasonCodes: ReasonCodesSchema.min(1),
});

const DetectorCandidateSourceSchema = z.strictObject({
  candidateId: NonEmptyStringSchema,
  detectorId: NonEmptyStringSchema,
  detectorVersion: NonEmptyStringSchema,
  detectorLifecycle: z.enum(DETECTOR_LIFECYCLE_STATES),
  emissionScope: z.enum(DETECTOR_EMISSION_SCOPES),
  opportunityPattern: OpportunityPatternSchema,
  firstDetectedAt: IsoDateTimeSchema,
  candidateSourceCutoff: IsoDateTimeSchema,
});

export const UserFitSchema = z.enum(USER_FITS) satisfies z.ZodType<UserFit>;

export const DiscoveryCandidateSchema = z.strictObject({
  ...traceEnvelopeShape(
    "multi_opportunity_detection",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.DiscoveryCandidate,
  ),
  candidateId: NonEmptyStringSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  underlyingGroupId: NonEmptyStringSchema,
  opportunityFamily: z.enum(OPPORTUNITY_FAMILIES),
  opportunityPattern: OpportunityPatternSchema,
  directionHypothesis: CandidateDirectionHypothesisSchema,
  detectorId: NonEmptyStringSchema,
  detectorVersion: NonEmptyStringSchema,
  detectorLifecycle: z.enum(DETECTOR_LIFECYCLE_STATES),
  emissionScope: z.enum(DETECTOR_EMISSION_SCOPES),
  firstDetectedAt: IsoDateTimeSchema,
  observedPrice: PositiveDecimalStringSchema,
  observedPriceFactId: NonEmptyStringSchema,
  expiresAt: IsoDateTimeSchema,
  inputLineage: CandidateInputLineageSchema,
  inputQuality: QualityAssessmentSchema,
  reasonCodes: ReasonCodesSchema.min(1),
  counterHints: ReasonCodesSchema,
  priority: z.enum(CANDIDATE_PRIORITIES),
  priorityBasis: CandidatePriorityBasisSchema,
}).superRefine((candidate, context) => {
  if (!isOpportunityPatternForFamily(
    candidate.opportunityFamily,
    candidate.opportunityPattern,
  )) {
    context.addIssue({
      code: "custom",
      message: "opportunity pattern does not belong to its family",
      path: ["opportunityPattern"],
    });
  }
  if (!(OPPORTUNITY_DIRECTIONS_BY_FAMILY[candidate.opportunityFamily] as
    readonly string[]).includes(candidate.directionHypothesis)) {
    context.addIssue({
      code: "custom",
      message: "direction hypothesis is not allowed by the opportunity family",
      path: ["directionHypothesis"],
    });
  }
  if (!canDetectorEmit(candidate.detectorLifecycle, candidate.emissionScope)) {
    context.addIssue({
      code: "custom",
      message: "detector lifecycle cannot emit in the declared scope",
      path: ["emissionScope"],
    });
  }
  if (!(["FRESH", "PARTIAL"] as const).includes(
    candidate.inputQuality.status as "FRESH" | "PARTIAL",
  )) {
    context.addIssue({
      code: "custom",
      message: "candidate input quality must be FRESH or explicitly PARTIAL",
      path: ["inputQuality", "status"],
    });
  }
  const sourceCutoff = Date.parse(candidate.sourceCutoff);
  const knowledgeCutoff = Date.parse(candidate.inputLineage.knowledgeCutoff);
  for (const [sourceField, availableField, cutoff, availableAt] of [
    [
      "universeSourceCutoff",
      "universeAvailableAt",
      candidate.inputLineage.universeSourceCutoff,
      candidate.inputLineage.universeAvailableAt,
    ],
    [
      "featureSourceCutoff",
      "featureAvailableAt",
      candidate.inputLineage.featureSourceCutoff,
      candidate.inputLineage.featureAvailableAt,
    ],
    [
      "contextSourceCutoff",
      "contextAvailableAt",
      candidate.inputLineage.contextSourceCutoff,
      candidate.inputLineage.contextAvailableAt,
    ],
    [
      "featureQualitySourceCutoff",
      "featureQualityAvailableAt",
      candidate.inputLineage.featureQualitySourceCutoff,
      candidate.inputLineage.featureQualityAvailableAt,
    ],
    [
      "observedPriceSourceCutoff",
      "observedPriceAvailableAt",
      candidate.inputLineage.observedPriceSourceCutoff,
      candidate.inputLineage.observedPriceAvailableAt,
    ],
  ] as const) {
    if (Date.parse(cutoff) > sourceCutoff) {
      context.addIssue({
        code: "custom",
        message: "detector input cannot be later than the candidate cutoff",
        path: ["inputLineage", sourceField],
      });
    }
    if (
      Date.parse(cutoff) > Date.parse(availableAt) ||
      Date.parse(availableAt) > knowledgeCutoff
    ) {
      context.addIssue({
        code: "custom",
        message: "detector knowledge availability is not point-in-time valid",
        path: ["inputLineage", availableField],
      });
    }
  }
  const firstDetectedAt = Date.parse(candidate.firstDetectedAt);
  if (sourceCutoff > knowledgeCutoff || knowledgeCutoff > firstDetectedAt) {
    context.addIssue({
      code: "custom",
      message: "candidate cannot precede its event or knowledge cutoff",
      path: ["inputLineage", "knowledgeCutoff"],
    });
  }
  if (firstDetectedAt > Date.parse(candidate.generatedAt)) {
    context.addIssue({
      code: "custom",
      message: "candidate detection cannot be later than generation",
      path: ["generatedAt"],
    });
  }
  if (firstDetectedAt >= Date.parse(candidate.expiresAt)) {
    context.addIssue({
      code: "custom",
      message: "candidate expiry must be later than first detection",
      path: ["expiresAt"],
    });
  }
  if (Date.parse(candidate.generatedAt) >= Date.parse(candidate.expiresAt)) {
    context.addIssue({
      code: "custom",
      message: "candidate cannot be generated after its opportunity expired",
      path: ["expiresAt"],
    });
  }
  if (new Set(candidate.inputLineage.featureIds).size !==
    candidate.inputLineage.featureIds.length) {
    context.addIssue({
      code: "custom",
      message: "detector feature lineage must be unique",
      path: ["inputLineage", "featureIds"],
    });
  }
  const discoveryReasons = new Set(candidate.reasonCodes);
  const counterHints = new Set(candidate.counterHints);
  if (
    discoveryReasons.size !== candidate.reasonCodes.length ||
    counterHints.size !== candidate.counterHints.length ||
    [...discoveryReasons].some((reason) => counterHints.has(reason))
  ) {
    context.addIssue({
      code: "custom",
      message: "candidate discovery and counter reasons must be unique and disjoint",
      path: ["reasonCodes"],
    });
  }
  if (new Set(candidate.priorityBasis.reasonCodes).size !==
    candidate.priorityBasis.reasonCodes.length) {
    context.addIssue({
      code: "custom",
      message: "candidate priority reasons must be unique",
      path: ["priorityBasis", "reasonCodes"],
    });
  }
}) satisfies z.ZodType<DiscoveryCandidate>;

export const OpportunityThesisSchema = z.strictObject({
  ...traceEnvelopeShape(
    "candidate_lifecycle_opportunity_thesis",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.OpportunityThesis,
  ),
  thesisId: NonEmptyStringSchema,
  episodeId: NonEmptyStringSchema,
  thesisVersion: z.number().int().positive(),
  thesisAuthority: z.literal("VALIDATION_HYPOTHESIS_ONLY"),
  canonicalInstrumentId: NonEmptyStringSchema,
  underlyingGroupId: NonEmptyStringSchema,
  opportunityFamily: z.enum(OPPORTUNITY_FAMILIES),
  opportunityPatterns: z.array(OpportunityPatternSchema).min(1),
  directionHypothesis: CandidateDirectionHypothesisSchema,
  detectorSources: z.array(DetectorCandidateSourceSchema).min(1),
  firstDetectedAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  supportingReasons: ReasonCodesSchema.min(1),
  conflictingReasons: ReasonCodesSchema,
  knownUnknowns: ReasonCodesSchema,
  uncertainty: UncertaintyVectorSchema,
}).superRefine((thesis, context) => {
  const uniquePatterns = new Set(thesis.opportunityPatterns);
  if (uniquePatterns.size !== thesis.opportunityPatterns.length) {
    context.addIssue({
      code: "custom",
      message: "thesis opportunity patterns must be unique",
      path: ["opportunityPatterns"],
    });
  }
  for (const [index, pattern] of thesis.opportunityPatterns.entries()) {
    if (!isOpportunityPatternForFamily(thesis.opportunityFamily, pattern)) {
      context.addIssue({
        code: "custom",
        message: "thesis pattern does not belong to its family",
        path: ["opportunityPatterns", index],
      });
    }
  }
  if (!(OPPORTUNITY_DIRECTIONS_BY_FAMILY[thesis.opportunityFamily] as
    readonly string[]).includes(thesis.directionHypothesis)) {
    context.addIssue({
      code: "custom",
      message: "thesis direction is not allowed by the opportunity family",
      path: ["directionHypothesis"],
    });
  }
  const candidateIds = thesis.detectorSources.map((source) => source.candidateId);
  if (new Set(candidateIds).size !== candidateIds.length) {
    context.addIssue({
      code: "custom",
      message: "thesis detector candidate sources must be unique",
      path: ["detectorSources"],
    });
  }
  const detectorSourceKeys = thesis.detectorSources.map((source) =>
    `${source.detectorId}:${source.detectorVersion}:${source.opportunityPattern}`
  );
  if (new Set(detectorSourceKeys).size !== detectorSourceKeys.length) {
    context.addIssue({
      code: "custom",
      message: "thesis cannot overweight repeated detector sources",
      path: ["detectorSources"],
    });
  }
  const sourcePatterns = new Set(thesis.detectorSources.map(
    (source) => source.opportunityPattern,
  ));
  if (
    sourcePatterns.size !== uniquePatterns.size ||
    [...sourcePatterns].some((pattern) => !uniquePatterns.has(pattern))
  ) {
    context.addIssue({
      code: "custom",
      message: "thesis patterns must exactly match detector sources",
      path: ["opportunityPatterns"],
    });
  }
  const firstDetectedAt = Math.min(
    ...thesis.detectorSources.map((source) => Date.parse(source.firstDetectedAt)),
  );
  if (Date.parse(thesis.firstDetectedAt) !== firstDetectedAt) {
    context.addIssue({
      code: "custom",
      message: "thesis first detection must equal its earliest candidate source",
      path: ["firstDetectedAt"],
    });
  }
  for (const [index, source] of thesis.detectorSources.entries()) {
    if (!uniquePatterns.has(source.opportunityPattern)) {
      context.addIssue({
        code: "custom",
        message: "detector source pattern must be retained by the thesis",
        path: ["detectorSources", index, "opportunityPattern"],
      });
    }
    if (!canDetectorEmit(source.detectorLifecycle, source.emissionScope)) {
      context.addIssue({
        code: "custom",
        message: "thesis cannot cite a detector outside its emission authority",
        path: ["detectorSources", index, "emissionScope"],
      });
    }
    if (Date.parse(source.candidateSourceCutoff) > Date.parse(source.firstDetectedAt)) {
      context.addIssue({
        code: "custom",
        message: "detector source cannot be detected before its source cutoff",
        path: ["detectorSources", index, "firstDetectedAt"],
      });
    }
    if (Date.parse(source.candidateSourceCutoff) > Date.parse(thesis.sourceCutoff)) {
      context.addIssue({
        code: "custom",
        message: "candidate source cutoff cannot exceed thesis cutoff",
        path: ["detectorSources", index, "candidateSourceCutoff"],
      });
    }
    if (Date.parse(source.firstDetectedAt) > Date.parse(thesis.updatedAt)) {
      context.addIssue({
        code: "custom",
        message: "thesis cannot include a candidate detected after its update",
        path: ["detectorSources", index, "firstDetectedAt"],
      });
    }
  }
  if (
    Date.parse(thesis.firstDetectedAt) > Date.parse(thesis.updatedAt) ||
    Date.parse(thesis.sourceCutoff) > Date.parse(thesis.updatedAt) ||
    Date.parse(thesis.updatedAt) > Date.parse(thesis.generatedAt)
  ) {
    context.addIssue({
      code: "custom",
      message: "thesis timestamps must be monotonic",
      path: ["updatedAt"],
    });
  }
  const supportReasons = new Set(thesis.supportingReasons);
  const conflictReasons = new Set(thesis.conflictingReasons);
  const unknownReasons = new Set(thesis.knownUnknowns);
  if (
    supportReasons.size !== thesis.supportingReasons.length ||
    conflictReasons.size !== thesis.conflictingReasons.length ||
    unknownReasons.size !== thesis.knownUnknowns.length ||
    [...supportReasons].some((reason) =>
      conflictReasons.has(reason) || unknownReasons.has(reason)
    ) ||
    [...conflictReasons].some((reason) => unknownReasons.has(reason))
  ) {
    context.addIssue({
      code: "custom",
      message: "thesis reason classes must be unique and non-overlapping",
      path: ["supportingReasons"],
    });
  }
}) satisfies z.ZodType<OpportunityThesis>;

export const CandidateEpisodeSchema = z.strictObject({
  ...traceEnvelopeShape(
    "candidate_lifecycle_opportunity_thesis",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.CandidateEpisode,
  ),
  episodeId: NonEmptyStringSchema,
  episodeKey: NonEmptyStringSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  underlyingGroupId: NonEmptyStringSchema,
  opportunityFamily: z.enum(OPPORTUNITY_FAMILIES),
  opportunityPatterns: z.array(OpportunityPatternSchema).min(1),
  directionHypothesis: CandidateDirectionHypothesisSchema,
  episodeWindow: z.strictObject({
    policyVersion: NonEmptyStringSchema,
    windowStart: IsoDateTimeSchema,
    windowEnd: IsoDateTimeSchema,
  }),
  lifecycle: z.enum(CANDIDATE_LIFECYCLE_STATES),
  previousLifecycle: z.enum(CANDIDATE_LIFECYCLE_STATES).nullable(),
  transitionKind: z.enum([
    "CREATED",
    "STATE_TRANSITION",
    "CANDIDATE_MERGE",
    "PRIORITY_CHANGE",
  ]),
  priority: z.enum(CANDIDATE_PRIORITIES),
  priorityPolicyVersion: NonEmptyStringSchema,
  thesisId: NonEmptyStringSchema,
  candidateIds: z.array(NonEmptyStringSchema).min(1),
  firstSeenAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  transitionedAt: IsoDateTimeSchema,
  transitionReasonCodes: ReasonCodesSchema.min(1),
  rowVersion: z.number().int().positive(),
  idempotencyKey: NonEmptyStringSchema,
  outboxEventId: NonEmptyStringSchema,
}).superRefine((episode, context) => {
  const patterns = new Set(episode.opportunityPatterns);
  if (patterns.size !== episode.opportunityPatterns.length) {
    context.addIssue({
      code: "custom",
      message: "episode opportunity patterns must be unique",
      path: ["opportunityPatterns"],
    });
  }
  for (const [index, pattern] of episode.opportunityPatterns.entries()) {
    if (!isOpportunityPatternForFamily(episode.opportunityFamily, pattern)) {
      context.addIssue({
        code: "custom",
        message: "episode pattern does not belong to its family",
        path: ["opportunityPatterns", index],
      });
    }
  }
  if (!(OPPORTUNITY_DIRECTIONS_BY_FAMILY[episode.opportunityFamily] as
    readonly string[]).includes(episode.directionHypothesis)) {
    context.addIssue({
      code: "custom",
      message: "episode direction is not allowed by the opportunity family",
      path: ["directionHypothesis"],
    });
  }
  if (new Set(episode.candidateIds).size !== episode.candidateIds.length) {
    context.addIssue({
      code: "custom",
      message: "episode candidate ids must be unique",
      path: ["candidateIds"],
    });
  }
  const windowStart = Date.parse(episode.episodeWindow.windowStart);
  const windowEnd = Date.parse(episode.episodeWindow.windowEnd);
  if (windowStart >= windowEnd) {
    context.addIssue({
      code: "custom",
      message: "episode window must have positive duration",
      path: ["episodeWindow", "windowEnd"],
    });
  }
  if (Date.parse(episode.expiresAt) !== windowEnd) {
    context.addIssue({
      code: "custom",
      message: "episode expiry must equal the frozen window end",
      path: ["expiresAt"],
    });
  }
  if (Date.parse(episode.firstSeenAt) > Date.parse(episode.lastSeenAt)) {
    context.addIssue({
      code: "custom",
      message: "firstSeenAt cannot exceed lastSeenAt",
      path: ["firstSeenAt"],
    });
  }
  if (Date.parse(episode.lastSeenAt) >= Date.parse(episode.expiresAt)) {
    context.addIssue({
      code: "custom",
      message: "lastSeenAt must be earlier than expiresAt",
      path: ["expiresAt"],
    });
  }
  if (Date.parse(episode.firstSeenAt) < windowStart) {
    context.addIssue({
      code: "custom",
      message: "episode first sighting cannot precede its frozen window",
      path: ["firstSeenAt"],
    });
  }
  const transitionedAt = Date.parse(episode.transitionedAt);
  if (
    Date.parse(episode.lastSeenAt) > transitionedAt ||
    transitionedAt > Date.parse(episode.generatedAt) ||
    Date.parse(episode.sourceCutoff) > transitionedAt
  ) {
    context.addIssue({
      code: "custom",
      message: "episode transition timestamps must be point-in-time monotonic",
      path: ["transitionedAt"],
    });
  }
  if (episode.lifecycle === "EXPIRED") {
    if (transitionedAt < windowEnd) {
      context.addIssue({
        code: "custom",
        message: "EXPIRED cannot occur before the frozen window ends",
        path: ["transitionedAt"],
      });
    }
  } else if (transitionedAt >= windowEnd) {
    context.addIssue({
      code: "custom",
      message: "non-expiry transitions cannot occur after episode expiry",
      path: ["transitionedAt"],
    });
  }
  if (new Set(episode.transitionReasonCodes).size !==
    episode.transitionReasonCodes.length) {
    context.addIssue({
      code: "custom",
      message: "episode transition reasons must be unique",
      path: ["transitionReasonCodes"],
    });
  }
  const activeLifecycle = ![
    "PROMOTED",
    "REJECTED",
    "EXPIRED",
    "DATA_UNAVAILABLE",
  ].includes(episode.lifecycle);
  if (episode.transitionKind === "CREATED") {
    if (
      episode.rowVersion !== 1 ||
      episode.previousLifecycle !== null ||
      episode.lifecycle !== "DISCOVERED"
    ) {
      context.addIssue({
        code: "custom",
        message: "CREATED must be row version one in DISCOVERED",
        path: ["transitionKind"],
      });
    }
  } else {
    if (episode.rowVersion < 2 || episode.previousLifecycle === null) {
      context.addIssue({
        code: "custom",
        message: "episode revisions require a previous lifecycle and row version",
        path: ["rowVersion"],
      });
    } else if (episode.transitionKind === "STATE_TRANSITION") {
      if (!isCandidateLifecycleTransitionAllowed(
        episode.previousLifecycle,
        episode.lifecycle,
      )) {
        context.addIssue({
          code: "custom",
          message: "candidate lifecycle transition is forbidden",
          path: ["lifecycle"],
        });
      }
    } else if (
      episode.previousLifecycle !== episode.lifecycle ||
      !activeLifecycle
    ) {
      context.addIssue({
        code: "custom",
        message: "merge and priority revisions require the same active lifecycle",
        path: ["transitionKind"],
      });
    }
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
