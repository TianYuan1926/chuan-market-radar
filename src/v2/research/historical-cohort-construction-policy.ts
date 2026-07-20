import { z } from "zod";
import {
  M2_DRAFT_REPLAY_RULE_SET_DIGEST,
} from "../modules/detection/draft-replay-contract";
import {
  M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST,
  M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_VERSION,
} from "../modules/detection/draft-diagnostic-ranking";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../modules/universe/stable-artifact";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
} from "../runtime-schema/primitives";
import {
  EXPANSION_EVENT_LABEL_VERSION,
  EXPANSION_HORIZONS,
  EXPANSION_THRESHOLD_DEFINITIONS,
} from "./event-label-contract";

export const M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY_VERSION =
  "v2-m2-historical-cohort-construction-policy.v1" as const;
export const M2_HISTORICAL_EVENT_THRESHOLD_REGISTRY_VERSION =
  "v2-m2-historical-event-threshold-registry.v1" as const;
export const M2_HISTORICAL_TRIAL_REGISTRY_VERSION =
  "v2-m2-historical-trial-registry.v1" as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const DirectionSchema = z.enum(["LONG", "SHORT"]);
const HorizonSchema = z.enum(EXPANSION_HORIZONS);

function withDigest<T extends Readonly<Record<string, unknown>>>(value: T) {
  return deepFreezeArtifact({
    ...value,
    policyDigest: stableContentHash(value),
  });
}

export const M2_HISTORICAL_EVENT_THRESHOLD_FIT_POLICY = withDigest({
  policyId: "v2-m2-train-only-expansion-threshold-fit.v1",
  labelVersion: EXPANSION_EVENT_LABEL_VERSION,
  fitSplit: "TRAIN_ONLY",
  estimator: "NEAREST_RANK_QUANTILE",
  quantile: 0.99,
  dimensions: ["HORIZON", "DIRECTION"],
  minimumSamplesPerDimension: 1_000,
  effectiveThreshold: "MAX_ABSOLUTE_FLOOR_AND_TRAIN_QUANTILE",
  baselinePrice: "FULLY_CLOSED_1M_CLOSE_AT_EVALUATION_CUTOFF",
  longExcursion: "MAX_FUTURE_HIGH_PERCENT_FROM_BASELINE",
  shortExcursion: "MAX_FUTURE_DOWNSIDE_PERCENT_FROM_BASELINE",
  validationReadAllowed: false,
  holdoutReadAllowed: false,
  futureValuesAllowedOnlyInsideEvaluationLabelBuilder: true,
  overlapPolicy: "EARLIEST_NON_OVERLAPPING_EVENT_PER_SYMBOL_DIRECTION_HORIZON",
  overlapCooldownSeconds: 86_400,
} as const);

export const M2_HISTORICAL_MATCHING_POLICY = withDigest({
  policyId: "v2-m2-matched-non-event-nearest-time.v1",
  controlsPerEvent: 1,
  selectionPopulation: "SAME_SPLIT_CONFIRMED_NON_EVENT_WINDOWS",
  preCutoffMatchingDimensions: [
    "HORIZON",
    "DIRECTION",
    "MARKET_REGIME",
    "LIQUIDITY_BUCKET",
    "UTC_HOUR_BUCKET",
  ],
  distanceOrder: [
    "EXACT_STRATUM",
    "MINIMUM_ABSOLUTE_TIME_DISTANCE",
    "STABLE_HASH_TIE_BREAK",
  ],
  futureLabelUse: "NON_EVENT_CONFIRMATION_ONLY_NOT_MATCHING_COVARIATE",
  controlReuseAllowed: false,
  eventWindowOverlapAllowed: false,
  minimumNoExpansionHorizonSeconds: 86_400,
} as const);

export const M2_HISTORICAL_BACKGROUND_POLICY = withDigest({
  policyId: "v2-m2-complete-candidate-universe-background.v1",
  population: "EVERY_ELIGIBLE_INSTRUMENT_AT_EVERY_FIXED_CADENCE_WINDOW",
  cadenceSeconds: 300,
  outcomeBasedSubsamplingAllowed: false,
  caseControlSampleMayRepresentCandidatePrecision: false,
  eventAndMatchedControlWindowsRemainInBusinessDenominators: true,
  unavailableWindowsRemainInDenominator: true,
  sourceEligibilityMustBePointInTime: true,
} as const);

export const M2_HISTORICAL_KNOWLEDGE_TIME_POLICY = withDigest({
  policyId: "v2-m2-point-in-time-knowledge-clock.v1",
  allowedModes: [
    "OBSERVED_RECEIVED_AT",
    "MODELED_CONSERVATIVE_AVAILABILITY",
  ],
  observedModeRequirement:
    "IMMUTABLE_SOURCE_RECEIVED_AT_FOR_EVERY_REPLAY_INPUT",
  modeledModeDisclosure: "MODELED_NOT_OBSERVED",
  modeledAvailabilityRule:
    "SOURCE_EVENT_CLOSE_PLUS_FROZEN_NON_NEGATIVE_LATENCY",
  modeledLatencyFitUsesOutcome: false,
  modeledLatencyScaleFrozenBeforeValidation: true,
  eventTimeMayNotSubstituteForKnowledgeTime: true,
  futureReadAllowed: false,
} as const);

export const M2_HISTORICAL_REGIME_ASSIGNMENT_POLICY = withDigest({
  policyId: "v2-m2-pre-cutoff-market-regime-assignment.v1",
  assignmentCutoff: "REPLAY_STEP_EVENT_CUTOFF",
  allowedLookback: "TRAILING_DATA_ENDING_AT_CUTOFF_ONLY",
  primaryLookbackSeconds: 86_400,
  secondaryLookbackSeconds: 604_800,
  futureReadAllowed: false,
  unknownOnInsufficientData: true,
} as const);

export const M2_HISTORICAL_LIQUIDITY_ASSIGNMENT_POLICY = withDigest({
  policyId: "v2-m2-pre-cutoff-liquidity-bucket-assignment.v1",
  assignmentCutoff: "REPLAY_STEP_EVENT_CUTOFF",
  allowedLookback: "TRAILING_DATA_ENDING_AT_CUTOFF_ONLY",
  lookbackSeconds: 86_400,
  dimensions: ["QUOTE_VOLUME", "TRADE_COUNT", "SPREAD_WHEN_AVAILABLE"],
  thresholdsFitSplit: "TRAIN_ONLY",
  futureReadAllowed: false,
  unknownOnInsufficientData: true,
} as const);

export const M2_HISTORICAL_SPLIT_POLICY = withDigest({
  policyId: "v2-m2-purged-time-symbol-regime-holdout.v1",
  strategy: "PURGED_TIME_SYMBOL_REGIME_HOLDOUT",
  minimumPurgeSeconds: 86_400,
  minimumEmbargoSeconds: 86_400,
  holdoutDimensions: ["TIME", "SYMBOL", "REGIME"],
  holdoutUnderlyingGroupIsolation: "GROUP_DISJOINT",
  splitAssignmentUsesOutcome: false,
  splitAssignmentFrozenBeforeThresholdFit: true,
} as const);

function trial(
  trialId: string,
  role: "BASELINE" | "SENSITIVITY",
  parameterSet: Readonly<Record<string, unknown>>,
) {
  return deepFreezeArtifact({
    trialId,
    role,
    parameterSet,
    parameterSetDigest: stableContentHash(parameterSet),
  });
}

const M2_HISTORICAL_TRIALS = deepFreezeArtifact([
  trial("m2-baseline-draft-rules-v2", "BASELINE", {
    detectorRuleSetDigest: M2_DRAFT_REPLAY_RULE_SET_DIGEST,
    detectorThresholdScale: 1,
    rankingPolicyDigest: M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST,
    modeledKnowledgeLatencyScale: 1,
  }),
  trial("m2-sensitivity-detector-thresholds-tighten-10pct", "SENSITIVITY", {
    detectorRuleSetDigest: M2_DRAFT_REPLAY_RULE_SET_DIGEST,
    detectorThresholdTransformation: "TIGHTEN_MATCH_MARGIN_10_PERCENT",
    rankingPolicyDigest: M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST,
  }),
  trial("m2-sensitivity-detector-thresholds-loosen-10pct", "SENSITIVITY", {
    detectorRuleSetDigest: M2_DRAFT_REPLAY_RULE_SET_DIGEST,
    detectorThresholdTransformation: "LOOSEN_MATCH_MARGIN_10_PERCENT",
    rankingPolicyDigest: M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST,
  }),
  trial("m2-sensitivity-modeled-knowledge-latency-3x", "SENSITIVITY", {
    detectorRuleSetDigest: M2_DRAFT_REPLAY_RULE_SET_DIGEST,
    modeledKnowledgeLatencyScale: 3,
    rankingPolicyDigest: M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST,
  }),
  trial("m2-sensitivity-consensus-bonus-zero", "SENSITIVITY", {
    detectorRuleSetDigest: M2_DRAFT_REPLAY_RULE_SET_DIGEST,
    consensusBonusPerAdditionalDetector: 0,
    rankingPolicyDigest: M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST,
  }),
] as const);

const TrialSchema = z.strictObject({
  trialId: NonEmptyStringSchema,
  role: z.enum(["BASELINE", "SENSITIVITY"]),
  parameterSet: z.record(z.string(), z.unknown()),
  parameterSetDigest: DigestSchema,
}).superRefine((registeredTrial, context) => {
  if (
    registeredTrial.parameterSetDigest !==
      stableContentHash(registeredTrial.parameterSet)
  ) {
    context.addIssue({
      code: "custom",
      message: "trial parameter set digest mismatch",
      path: ["parameterSetDigest"],
    });
  }
});

const TrialRegistryCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_HISTORICAL_TRIAL_REGISTRY_VERSION),
  registryId: NonEmptyStringSchema,
  registeredAt: IsoDateTimeSchema,
  trials: z.array(TrialSchema).min(2),
});

export const M2HistoricalTrialRegistrySchema = TrialRegistryCoreSchema.extend({
  registryDigest: DigestSchema,
}).superRefine((registry, context) => {
  const trialIds = registry.trials.map((registeredTrial) =>
    registeredTrial.trialId);
  if (new Set(trialIds).size !== trialIds.length) {
    context.addIssue({
      code: "custom",
      message: "trial registry identities must be unique",
      path: ["trials"],
    });
  }
  if (registry.trials.filter((registeredTrial) =>
    registeredTrial.role === "BASELINE").length !== 1) {
    context.addIssue({
      code: "custom",
      message: "trial registry requires exactly one baseline",
      path: ["trials"],
    });
  }
  const { registryDigest, ...core } = registry;
  if (registryDigest !== stableContentHash(core)) {
    context.addIssue({
      code: "custom",
      message: "trial registry digest mismatch",
      path: ["registryDigest"],
    });
  }
});

const trialRegistryCore = TrialRegistryCoreSchema.parse({
  schemaVersion: M2_HISTORICAL_TRIAL_REGISTRY_VERSION,
  registryId: "v2-m2-historical-pre-registered-trials.v1",
  registeredAt: "2026-07-20T09:00:00.000Z",
  trials: M2_HISTORICAL_TRIALS,
});

export const M2_HISTORICAL_TRIAL_REGISTRY = deepFreezeArtifact(
  M2HistoricalTrialRegistrySchema.parse({
    ...trialRegistryCore,
    registryDigest: stableContentHash(trialRegistryCore),
  }),
);

export const M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY = deepFreezeArtifact({
  schemaVersion: M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY_VERSION,
  authority: "PRE_REGISTERED_RESEARCH_CONSTRUCTION_ONLY",
  eventLabelVersion: EXPANSION_EVENT_LABEL_VERSION,
  eventThresholdFitPolicyId: M2_HISTORICAL_EVENT_THRESHOLD_FIT_POLICY.policyId,
  eventThresholdFitPolicyDigest:
    M2_HISTORICAL_EVENT_THRESHOLD_FIT_POLICY.policyDigest,
  matchingPolicyId: M2_HISTORICAL_MATCHING_POLICY.policyId,
  matchingPolicyDigest: M2_HISTORICAL_MATCHING_POLICY.policyDigest,
  backgroundPolicyId: M2_HISTORICAL_BACKGROUND_POLICY.policyId,
  backgroundPolicyDigest: M2_HISTORICAL_BACKGROUND_POLICY.policyDigest,
  knowledgeTimePolicyId: M2_HISTORICAL_KNOWLEDGE_TIME_POLICY.policyId,
  knowledgeTimePolicyDigest:
    M2_HISTORICAL_KNOWLEDGE_TIME_POLICY.policyDigest,
  regimeAssignmentPolicyId: M2_HISTORICAL_REGIME_ASSIGNMENT_POLICY.policyId,
  regimeAssignmentPolicyDigest:
    M2_HISTORICAL_REGIME_ASSIGNMENT_POLICY.policyDigest,
  liquidityAssignmentPolicyId:
    M2_HISTORICAL_LIQUIDITY_ASSIGNMENT_POLICY.policyId,
  liquidityAssignmentPolicyDigest:
    M2_HISTORICAL_LIQUIDITY_ASSIGNMENT_POLICY.policyDigest,
  splitPolicyId: M2_HISTORICAL_SPLIT_POLICY.policyId,
  splitPolicyDigest: M2_HISTORICAL_SPLIT_POLICY.policyDigest,
  rankingPolicyVersion: M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_VERSION,
  rankingPolicyDigest: M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST,
  trialRegistryId: M2_HISTORICAL_TRIAL_REGISTRY.registryId,
  trialRegistryDigest: M2_HISTORICAL_TRIAL_REGISTRY.registryDigest,
  candidateEmissionAllowed: false,
  lifecycleMutationAllowed: false,
  holdoutReadAllowedDuringConstruction: false,
} as const);

export const M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY_DIGEST =
  stableContentHash(M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY);

const ThresholdEntrySchema = z.strictObject({
  thresholdEntryId: NonEmptyStringSchema,
  horizon: HorizonSchema,
  direction: DirectionSchema,
  sampleCount: z.number().int().positive(),
  absoluteFloorPercent: z.number().finite().positive(),
  trainingQuantilePercent: z.number().finite().nonnegative(),
  effectiveThresholdPercent: z.number().finite().positive(),
  trainingSourceDigest: DigestSchema,
});

const ThresholdRegistryCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_HISTORICAL_EVENT_THRESHOLD_REGISTRY_VERSION),
  registryName: NonEmptyStringSchema,
  frozenAt: IsoDateTimeSchema,
  fitPolicyId: z.literal(M2_HISTORICAL_EVENT_THRESHOLD_FIT_POLICY.policyId),
  fitPolicyDigest: z.literal(
    M2_HISTORICAL_EVENT_THRESHOLD_FIT_POLICY.policyDigest,
  ),
  fitSplit: z.literal("TRAIN"),
  validationReadCount: z.literal(0),
  holdoutReadCount: z.literal(0),
  entries: z.array(ThresholdEntrySchema).length(6),
});

export const M2HistoricalEventThresholdRegistrySchema =
  ThresholdRegistryCoreSchema.extend({
    registryDigest: DigestSchema,
    registryId: NonEmptyStringSchema,
  }).superRefine((registry, context) => {
    const dimensions = registry.entries.map((entry) =>
      `${entry.horizon}:${entry.direction}`);
    const requiredDimensions = EXPANSION_HORIZONS.flatMap((horizon) =>
      (["LONG", "SHORT"] as const).map((direction) =>
        `${horizon}:${direction}`));
    if (
      new Set(dimensions).size !== dimensions.length ||
      requiredDimensions.some((dimension) => !dimensions.includes(dimension))
    ) {
      context.addIssue({
        code: "custom",
        message: "threshold registry must cover every horizon and direction once",
        path: ["entries"],
      });
    }
    for (const [index, entry] of registry.entries.entries()) {
      if (
        entry.sampleCount <
          M2_HISTORICAL_EVENT_THRESHOLD_FIT_POLICY.minimumSamplesPerDimension
      ) {
        context.addIssue({
          code: "custom",
          message: "threshold entry has insufficient training samples",
          path: ["entries", index, "sampleCount"],
        });
      }
      if (
        Math.abs(entry.effectiveThresholdPercent - Math.max(
          entry.absoluteFloorPercent,
          entry.trainingQuantilePercent,
        )) > 1e-12
      ) {
        context.addIssue({
          code: "custom",
          message: "effective event threshold is inconsistent",
          path: ["entries", index, "effectiveThresholdPercent"],
        });
      }
    }
    const { registryDigest, registryId, ...core } = registry;
    const expectedDigest = stableContentHash(core);
    if (registryDigest !== expectedDigest) {
      context.addIssue({
        code: "custom",
        message: "threshold registry digest mismatch",
        path: ["registryDigest"],
      });
    }
    if (
      registryId !==
        `historical-event-thresholds:${expectedDigest.slice("sha256:".length)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "threshold registry identity mismatch",
        path: ["registryId"],
      });
    }
  });

export type M2HistoricalEventThresholdRegistry = z.infer<
  typeof M2HistoricalEventThresholdRegistrySchema
>;

export type M2TrainingExcursionDistribution = Readonly<{
  split: "TRAIN";
  horizon: (typeof EXPANSION_HORIZONS)[number];
  direction: "LONG" | "SHORT";
  excursionPercents: readonly number[];
  sourceDigest: string;
}>;

function nearestRankQuantile(
  values: readonly number[],
  quantile: number,
): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
  return sorted[index]!;
}

export function buildM2HistoricalEventThresholdRegistry(input: Readonly<{
  registryName: string;
  frozenAt: string;
  distributions: readonly M2TrainingExcursionDistribution[];
}>): M2HistoricalEventThresholdRegistry {
  const distributions = input.distributions.map((distribution) => {
    if (distribution.split !== "TRAIN") {
      throw new Error("event thresholds may be fit only from TRAIN");
    }
    if (!/^sha256:[0-9a-f]{64}$/u.test(distribution.sourceDigest)) {
      throw new Error("event threshold training source digest is invalid");
    }
    if (
      distribution.excursionPercents.length <
        M2_HISTORICAL_EVENT_THRESHOLD_FIT_POLICY.minimumSamplesPerDimension ||
      distribution.excursionPercents.some((value) =>
        !Number.isFinite(value) || value < 0)
    ) {
      throw new Error("event threshold training distribution is insufficient");
    }
    return distribution;
  });
  const dimensions = distributions.map((distribution) =>
    `${distribution.horizon}:${distribution.direction}`);
  if (new Set(dimensions).size !== distributions.length) {
    throw new Error("event threshold training dimensions are duplicated");
  }
  const entries = distributions.map((distribution) => {
    const definition = EXPANSION_THRESHOLD_DEFINITIONS.find(
      (candidate) => candidate.horizon === distribution.horizon,
    );
    if (definition === undefined) {
      throw new Error("event threshold horizon is unknown");
    }
    const trainingQuantilePercent = nearestRankQuantile(
      distribution.excursionPercents,
      M2_HISTORICAL_EVENT_THRESHOLD_FIT_POLICY.quantile,
    );
    return {
      thresholdEntryId:
        `threshold:${distribution.horizon}:${distribution.direction}`,
      horizon: distribution.horizon,
      direction: distribution.direction,
      sampleCount: distribution.excursionPercents.length,
      absoluteFloorPercent: definition.absoluteFloorPercent,
      trainingQuantilePercent,
      effectiveThresholdPercent: Math.max(
        definition.absoluteFloorPercent,
        trainingQuantilePercent,
      ),
      trainingSourceDigest: distribution.sourceDigest,
    };
  }).sort((left, right) =>
    `${left.horizon}:${left.direction}`.localeCompare(
      `${right.horizon}:${right.direction}`,
    ));
  const core = ThresholdRegistryCoreSchema.parse({
    schemaVersion: M2_HISTORICAL_EVENT_THRESHOLD_REGISTRY_VERSION,
    registryName: input.registryName,
    frozenAt: input.frozenAt,
    fitPolicyId: M2_HISTORICAL_EVENT_THRESHOLD_FIT_POLICY.policyId,
    fitPolicyDigest: M2_HISTORICAL_EVENT_THRESHOLD_FIT_POLICY.policyDigest,
    fitSplit: "TRAIN",
    validationReadCount: 0,
    holdoutReadCount: 0,
    entries,
  });
  const registryDigest = stableContentHash(core);
  return deepFreezeArtifact(M2HistoricalEventThresholdRegistrySchema.parse({
    ...core,
    registryDigest,
    registryId:
      `historical-event-thresholds:${registryDigest.slice("sha256:".length)}`,
  }));
}
