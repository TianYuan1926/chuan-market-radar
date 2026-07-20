import { z } from "zod";
import {
  isOpportunityPatternForFamily,
  OPPORTUNITY_DIRECTIONS_BY_FAMILY,
  OPPORTUNITY_PATTERNS,
  type OpportunityFamily,
  type OpportunityPattern,
} from "../../domain/product-constitution";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  QualityAssessmentSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M2DraftDiagnosticStrengthSchema,
} from "./draft-diagnostic-strength-contract";
import { M2DetectorReadInputSchema } from "./discovery-contract";

export const M2_DRAFT_REPLAY_INPUT_VERSION =
  "v2-m2-draft-replay-input.v1" as const;
export const M2_DRAFT_REPLAY_EVALUATION_VERSION =
  "v2-m2-draft-replay-evaluation.v2" as const;
export const M2_DRAFT_REPLAY_RULE_SET_VERSION =
  "v2-m2-draft-replay-rules.v2" as const;

export const M2_DRAFT_DETECTORS = Object.freeze({
  PRE_MOVE_COMPRESSION: {
    detectorId: "v2.pre-move.compression",
    detectorVersion: "draft-replay.v2",
    opportunityFamily: "PRE_MOVE",
    opportunityPattern: "PRE_MOVE_COMPRESSION",
  },
  PRE_MOVE_FLOW_DIVERGENCE: {
    detectorId: "v2.pre-move.flow-divergence",
    detectorVersion: "draft-replay.v2",
    opportunityFamily: "PRE_MOVE",
    opportunityPattern: "PRE_MOVE_FLOW_DIVERGENCE",
  },
  PRE_MOVE_LIQUIDITY_SHIFT: {
    detectorId: "v2.pre-move.liquidity-shift",
    detectorVersion: "draft-replay.v2",
    opportunityFamily: "PRE_MOVE",
    opportunityPattern: "PRE_MOVE_LIQUIDITY_SHIFT",
  },
  BREAKOUT_EDGE: {
    detectorId: "v2.breakout-retest.breakout-edge",
    detectorVersion: "draft-replay.v2",
    opportunityFamily: "BREAKOUT_RETEST",
    opportunityPattern: "BREAKOUT_EDGE",
  },
  ROLE_FLIP_RETEST: {
    detectorId: "v2.breakout-retest.role-flip-retest",
    detectorVersion: "draft-replay.v2",
    opportunityFamily: "BREAKOUT_RETEST",
    opportunityPattern: "ROLE_FLIP_RETEST",
  },
} as const satisfies Record<string, Readonly<{
  detectorId: string;
  detectorVersion: string;
  opportunityFamily: "PRE_MOVE" | "BREAKOUT_RETEST";
  opportunityPattern: OpportunityPattern;
}>>);

export type M2DraftDetectorDefinition =
  (typeof M2_DRAFT_DETECTORS)[keyof typeof M2_DRAFT_DETECTORS];

export const M2_DRAFT_REPLAY_RULE_SET = deepFreezeArtifact({
  schemaVersion: M2_DRAFT_REPLAY_RULE_SET_VERSION,
  authority: "UNCALIBRATED_DRAFT_THRESHOLDS",
  candidateEmissionAllowed: false,
  runtimeReadAllowed: false,
  preMove: {
    lateMoveConsumedRatioMinimum: 0.4,
    noiseVolumeSpikeMultipleMinimum: 4,
    noiseQuotedDepthUsdtMaximum: 2_000,
    noiseVenueConfirmationCountMaximum: 1,
    compressionPercentileMaximum: 0.1,
    longBuyAccelerationMinimum: 1.5,
    shortSellAccelerationMinimum: 1.45,
    earlyMoveConsumedRatioMaximum: 0.2,
    directionalFlowRatioMinimum: 0.62,
    flatPriceResponseAbsoluteMaximum: 0.005,
    spreadContractionRatioMaximum: 0.5,
    depthExpansionRatioMinimum: 1.5,
    directionalBalanceLongMinimum: 0.58,
    directionalBalanceShortMaximum: 0.42,
  },
  breakoutRetest: {
    breakoutParticipationMultipleMinimum: 1.5,
    breakdownParticipationMultipleMinimum: 1.4,
    edgeDistanceBpsMaximum: 40,
    retestRejectionStrengthMinimum: 0.65,
    retestParticipationMultipleMinimum: 1.3,
    lateMoveConsumedRatioMinimum: 0.5,
  },
} as const);

export const M2_DRAFT_REPLAY_RULE_SET_DIGEST = stableContentHash(
  M2_DRAFT_REPLAY_RULE_SET,
);

const ObservationValueSchema = z.union([
  z.string().max(129),
  z.number().finite(),
  z.boolean(),
]).nullable();

export const M2DraftReplayObservationSchema = z.strictObject({
  observationId: NonEmptyStringSchema,
  featureId: NonEmptyStringSchema,
  semanticKey: NonEmptyStringSchema,
  value: ObservationValueSchema,
  unit: NonEmptyStringSchema,
  observedAt: IsoDateTimeSchema,
  quality: QualityAssessmentSchema,
});

export const M2DraftReplayKernelInputSchema = z.strictObject({
  schemaVersion: z.literal(M2_DRAFT_REPLAY_INPUT_VERSION),
  executionMode: z.literal("REPLAY_ONLY_NO_AUTHORITY"),
  detectorInput: M2DetectorReadInputSchema,
  observations: z.array(M2DraftReplayObservationSchema).min(1),
}).superRefine((input, context) => {
  const observationIds = input.observations.map((item) => item.observationId);
  const featureIds = input.observations.map((item) => item.featureId);
  const semanticKeys = input.observations.map((item) => item.semanticKey);
  for (const [field, values] of [
    ["observationId", observationIds],
    ["featureId", featureIds],
    ["semanticKey", semanticKeys],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: `draft replay ${field} values must be unique`,
        path: ["observations"],
      });
    }
  }
  const declaredFeatures = new Set(input.detectorInput.featureSet.featureIds);
  for (const [index, observation] of input.observations.entries()) {
    if (!declaredFeatures.has(observation.featureId)) {
      context.addIssue({
        code: "custom",
        message: "draft replay observation is absent from FeatureSet lineage",
        path: ["observations", index, "featureId"],
      });
    }
    if (Date.parse(observation.observedAt) >
      Date.parse(input.detectorInput.eventCutoff)) {
      context.addIssue({
        code: "custom",
        message: "draft replay observation exceeds the event cutoff",
        path: ["observations", index, "observedAt"],
      });
    }
    const usableQuality = ["FRESH", "PARTIAL"].includes(
      observation.quality.status,
    );
    if ((observation.value === null) === usableQuality) {
      context.addIssue({
        code: "custom",
        message: "draft replay observation value and quality disagree",
        path: ["observations", index, "value"],
      });
    }
  }
});

export type M2DraftReplayKernelInput = z.infer<
  typeof M2DraftReplayKernelInputSchema
>;

export function buildM2DraftReplayInputDigest(
  rawInput: M2DraftReplayKernelInput,
): string {
  const input = M2DraftReplayKernelInputSchema.parse(rawInput);
  return stableContentHash({
    detectorInput: input.detectorInput,
    observations: [...input.observations].sort((left, right) =>
      left.semanticKey.localeCompare(right.semanticKey)),
    schemaVersion: input.schemaVersion,
  });
}

const DraftHypothesisSchema = z.strictObject({
  opportunityPattern: z.enum(OPPORTUNITY_PATTERNS),
  directionHypothesis: z.enum(["LONG", "SHORT", "UNKNOWN"]),
});

export const M2DraftReplayEvaluationSchema = z.strictObject({
  schemaVersion: z.literal(M2_DRAFT_REPLAY_EVALUATION_VERSION),
  evaluationAuthority: z.literal("DRAFT_REPLAY_DIAGNOSTIC_ONLY"),
  detectorId: NonEmptyStringSchema,
  detectorVersion: NonEmptyStringSchema,
  detectorLifecycle: z.literal("DRAFT"),
  candidateEmissionAllowed: z.literal(false),
  opportunityFamily: z.enum(["PRE_MOVE", "BREAKOUT_RETEST"]),
  evaluationStatus: z.enum([
    "MATCHED_DRAFT_HYPOTHESIS",
    "NO_MATCH",
    "DATA_UNAVAILABLE",
  ]),
  hypothesis: DraftHypothesisSchema.nullable(),
  eventCutoff: IsoDateTimeSchema,
  knowledgeCutoff: IsoDateTimeSchema,
  ruleSetVersion: z.literal(M2_DRAFT_REPLAY_RULE_SET_VERSION),
  ruleSetDigest: z.literal(M2_DRAFT_REPLAY_RULE_SET_DIGEST),
  inputDigest: NonEmptyStringSchema,
  evaluationDigest: NonEmptyStringSchema,
  evaluationId: NonEmptyStringSchema,
  usedObservationIds: z.array(NonEmptyStringSchema),
  missingSemanticKeys: z.array(NonEmptyStringSchema),
  reasonCodes: ReasonCodesSchema.min(1),
  counterHints: ReasonCodesSchema,
  diagnosticStrength: M2DraftDiagnosticStrengthSchema,
}).superRefine((evaluation, context) => {
  const matched = evaluation.evaluationStatus === "MATCHED_DRAFT_HYPOTHESIS";
  if (matched !== (evaluation.hypothesis !== null)) {
    context.addIssue({
      code: "custom",
      message: "only a matched draft evaluation may carry a hypothesis",
      path: ["hypothesis"],
    });
  }
  if (evaluation.hypothesis !== null) {
    if (!isOpportunityPatternForFamily(
      evaluation.opportunityFamily,
      evaluation.hypothesis.opportunityPattern,
    )) {
      context.addIssue({
        code: "custom",
        message: "draft hypothesis pattern does not belong to its family",
        path: ["hypothesis", "opportunityPattern"],
      });
    }
    if (!(OPPORTUNITY_DIRECTIONS_BY_FAMILY[evaluation.opportunityFamily] as
      readonly string[]).includes(evaluation.hypothesis.directionHypothesis)) {
      context.addIssue({
        code: "custom",
        message: "draft hypothesis direction is forbidden for its family",
        path: ["hypothesis", "directionHypothesis"],
      });
    }
  }
  const registeredDetector = Object.values(M2_DRAFT_DETECTORS).find(
    (detector) =>
      detector.detectorId === evaluation.detectorId &&
      detector.detectorVersion === evaluation.detectorVersion,
  );
  if (registeredDetector === undefined) {
    context.addIssue({
      code: "custom",
      message: "draft evaluation detector identity is not registered",
      path: ["detectorId"],
    });
  } else if (
    registeredDetector.opportunityFamily !== evaluation.opportunityFamily ||
    (evaluation.hypothesis !== null &&
      registeredDetector.opportunityPattern !==
        evaluation.hypothesis.opportunityPattern)
  ) {
    context.addIssue({
      code: "custom",
      message: "draft evaluation detector identity and hypothesis disagree",
      path: ["detectorId"],
    });
  }
  if (
    evaluation.evaluationStatus === "DATA_UNAVAILABLE" &&
    evaluation.missingSemanticKeys.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "unavailable draft evaluation requires missing semantic keys",
      path: ["missingSemanticKeys"],
    });
  }
  const rankable = evaluation.diagnosticStrength.status === "RANKABLE_MATCH";
  if (matched !== rankable) {
    context.addIssue({
      code: "custom",
      message: "only a matched draft evaluation may carry rankable strength",
      path: ["diagnosticStrength", "status"],
    });
  }
  if (evaluation.diagnosticStrength.status === "NOT_RANKABLE") {
    const expectedExclusion = evaluation.evaluationStatus === "DATA_UNAVAILABLE"
      ? "DATA_UNAVAILABLE"
      : evaluation.reasonCodes.some((reason) => reason.endsWith("_veto"))
        ? "VETOED"
        : "NO_MATCH";
    if (evaluation.diagnosticStrength.exclusionReason !== expectedExclusion) {
      context.addIssue({
        code: "custom",
        message: "diagnostic exclusion reason disagrees with evaluation status",
        path: ["diagnosticStrength", "exclusionReason"],
      });
    }
  } else {
    const usedObservationIds = new Set(evaluation.usedObservationIds);
    if (evaluation.diagnosticStrength.components.some(
      (component) => !usedObservationIds.has(component.observationId),
    )) {
      context.addIssue({
        code: "custom",
        message: "diagnostic strength may use only declared evaluation observations",
        path: ["diagnosticStrength", "components"],
      });
    }
    const expectedDirectionMultiplier =
      evaluation.hypothesis?.directionHypothesis === "UNKNOWN" ? 0.75 : 1;
    if (
      evaluation.diagnosticStrength.directionMultiplier !==
        expectedDirectionMultiplier
    ) {
      context.addIssue({
        code: "custom",
        message: "diagnostic direction multiplier disagrees with hypothesis",
        path: ["diagnosticStrength", "directionMultiplier"],
      });
    }
  }
  for (const [field, values] of [
    ["usedObservationIds", evaluation.usedObservationIds],
    ["missingSemanticKeys", evaluation.missingSemanticKeys],
    ["reasonCodes", evaluation.reasonCodes],
    ["counterHints", evaluation.counterHints],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: `draft evaluation ${field} values must be unique`,
        path: [field],
      });
    }
  }
  const reasons = new Set(evaluation.reasonCodes);
  if (evaluation.counterHints.some((reason) => reasons.has(reason))) {
    context.addIssue({
      code: "custom",
      message: "draft reasons and counter hints must be disjoint",
      path: ["counterHints"],
    });
  }
  if (Date.parse(evaluation.eventCutoff) >
    Date.parse(evaluation.knowledgeCutoff)) {
    context.addIssue({
      code: "custom",
      message: "draft evaluation cutoffs are inverted",
      path: ["eventCutoff"],
    });
  }
  const { evaluationDigest, evaluationId } = evaluation;
  const content: Record<string, unknown> = { ...evaluation };
  delete content.schemaVersion;
  delete content.evaluationDigest;
  delete content.evaluationId;
  const expectedDigest = stableContentHash(content);
  if (evaluationDigest !== expectedDigest) {
    context.addIssue({
      code: "custom",
      message: "draft evaluation content digest mismatch",
      path: ["evaluationDigest"],
    });
  }
  if (
    evaluationId !==
      `draft-replay-evaluation:${expectedDigest.slice("sha256:".length)}`
  ) {
    context.addIssue({
      code: "custom",
      message: "draft evaluation identity does not match its content",
      path: ["evaluationId"],
    });
  }
});

export type M2DraftReplayEvaluation = z.infer<
  typeof M2DraftReplayEvaluationSchema
>;

export function isM2DraftDetectorForFamily(
  detector: M2DraftDetectorDefinition,
  family: OpportunityFamily,
): boolean {
  return detector.opportunityFamily === family;
}
