import { z } from "zod";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";
import {
  NonEmptyStringSchema,
  RatioSchema,
} from "../../runtime-schema/primitives";

export const M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY_VERSION =
  "v2-m2-draft-diagnostic-strength-policy.v1" as const;

export const M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS = Object.freeze({
  VOLATILITY_COMPRESSION: "volatility_compression",
  BUY_VOLUME_ACCELERATION: "buy_volume_acceleration",
  SELL_VOLUME_ACCELERATION: "sell_volume_acceleration",
  MOVE_CONSUMED: "move_consumed",
  AGGRESSIVE_BUY_FLOW: "aggressive_buy_flow",
  AGGRESSIVE_SELL_FLOW: "aggressive_sell_flow",
  PRICE_RESPONSE_ABSOLUTE: "price_response_absolute",
  SPREAD_CONTRACTION: "spread_contraction",
  DEPTH_EXPANSION: "depth_expansion",
  DIRECTIONAL_BALANCE_LONG: "directional_balance_long",
  DIRECTIONAL_BALANCE_SHORT: "directional_balance_short",
  DIRECTIONAL_BALANCE_CONTEXT: "directional_balance_context",
  CLOSE_ABOVE_RESISTANCE: "close_above_resistance",
  CLOSE_BELOW_SUPPORT: "close_below_support",
  BREAKOUT_PARTICIPATION: "breakout_participation",
  BREAKDOWN_PARTICIPATION: "breakdown_participation",
  DISTANCE_ABOVE_LEVEL: "distance_above_level",
  DISTANCE_BELOW_LEVEL: "distance_below_level",
  RETEST_REJECTION: "retest_rejection",
  BUY_PARTICIPATION: "buy_participation",
  SELL_PARTICIPATION: "sell_participation",
} as const);

type NormalizationId =
  (typeof M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS)[keyof typeof M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS];

type NormalizationDefinition = Readonly<{
  semanticKey: string;
  condition:
    | "HIGHER_IS_STRONGER"
    | "LOWER_IS_STRONGER"
    | "ABSOLUTE_LOWER_IS_STRONGER"
    | "BOOLEAN_TRUE"
    | "CONTEXT_ONLY";
  boundary: number;
  anchor: number;
}>;

export const M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY = deepFreezeArtifact({
  schemaVersion: M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY_VERSION,
  authority: "UNCALIBRATED_DRAFT_RELATIVE_RULE_MARGIN",
  scoreMeaning: "RELATIVE_RULE_MARGIN_NOT_PROBABILITY_OR_TRADE_GRADE",
  candidateEmissionAllowed: false,
  runtimeReadAllowed: false,
  futureOutcomeReadAllowed: false,
  componentBoundaryScore: 0.5,
  aggregation: "ARITHMETIC_MEAN_THEN_QUALITY_AND_DIRECTION_MULTIPLIERS",
  qualityMultipliers: {
    FRESH: 1,
    PARTIAL: 0.85,
  },
  directionMultipliers: {
    RESOLVED: 1,
    UNKNOWN: 0.75,
  },
  normalizations: {
    volatility_compression: {
      semanticKey: "volatility_compression_percentile",
      condition: "LOWER_IS_STRONGER",
      boundary: 0.1,
      anchor: 0,
    },
    buy_volume_acceleration: {
      semanticKey: "buy_volume_acceleration",
      condition: "HIGHER_IS_STRONGER",
      boundary: 1.5,
      anchor: 3,
    },
    sell_volume_acceleration: {
      semanticKey: "sell_volume_acceleration",
      condition: "HIGHER_IS_STRONGER",
      boundary: 1.45,
      anchor: 2.9,
    },
    move_consumed: {
      semanticKey: "move_consumed_ratio",
      condition: "LOWER_IS_STRONGER",
      boundary: 0.2,
      anchor: 0,
    },
    aggressive_buy_flow: {
      semanticKey: "aggressive_buy_flow_ratio",
      condition: "HIGHER_IS_STRONGER",
      boundary: 0.62,
      anchor: 1,
    },
    aggressive_sell_flow: {
      semanticKey: "aggressive_sell_flow_ratio",
      condition: "HIGHER_IS_STRONGER",
      boundary: 0.62,
      anchor: 1,
    },
    price_response_absolute: {
      semanticKey: "price_response_ratio",
      condition: "ABSOLUTE_LOWER_IS_STRONGER",
      boundary: 0.005,
      anchor: 0,
    },
    spread_contraction: {
      semanticKey: "spread_contraction_ratio",
      condition: "LOWER_IS_STRONGER",
      boundary: 0.5,
      anchor: 0,
    },
    depth_expansion: {
      semanticKey: "depth_expansion_ratio",
      condition: "HIGHER_IS_STRONGER",
      boundary: 1.5,
      anchor: 3,
    },
    directional_balance_long: {
      semanticKey: "directional_flow_balance",
      condition: "HIGHER_IS_STRONGER",
      boundary: 0.58,
      anchor: 1,
    },
    directional_balance_short: {
      semanticKey: "directional_flow_balance",
      condition: "LOWER_IS_STRONGER",
      boundary: 0.42,
      anchor: 0,
    },
    directional_balance_context: {
      semanticKey: "directional_flow_balance",
      condition: "CONTEXT_ONLY",
      boundary: 0.5,
      anchor: 0.5,
    },
    close_above_resistance: {
      semanticKey: "close_above_resistance",
      condition: "BOOLEAN_TRUE",
      boundary: 1,
      anchor: 1,
    },
    close_below_support: {
      semanticKey: "close_below_support",
      condition: "BOOLEAN_TRUE",
      boundary: 1,
      anchor: 1,
    },
    breakout_participation: {
      semanticKey: "breakout_volume_multiple",
      condition: "HIGHER_IS_STRONGER",
      boundary: 1.5,
      anchor: 3,
    },
    breakdown_participation: {
      semanticKey: "breakdown_volume_multiple",
      condition: "HIGHER_IS_STRONGER",
      boundary: 1.4,
      anchor: 2.8,
    },
    distance_above_level: {
      semanticKey: "distance_above_level_bps",
      condition: "LOWER_IS_STRONGER",
      boundary: 40,
      anchor: 0,
    },
    distance_below_level: {
      semanticKey: "distance_below_level_bps",
      condition: "LOWER_IS_STRONGER",
      boundary: 40,
      anchor: 0,
    },
    retest_rejection: {
      semanticKey: "retest_rejection_strength",
      condition: "HIGHER_IS_STRONGER",
      boundary: 0.65,
      anchor: 1,
    },
    buy_participation: {
      semanticKey: "buy_participation_multiple",
      condition: "HIGHER_IS_STRONGER",
      boundary: 1.3,
      anchor: 2.6,
    },
    sell_participation: {
      semanticKey: "sell_participation_multiple",
      condition: "HIGHER_IS_STRONGER",
      boundary: 1.3,
      anchor: 2.6,
    },
  } satisfies Record<NormalizationId, NormalizationDefinition>,
} as const);

export const M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY_DIGEST = stableContentHash(
  M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY,
);

const NormalizationIdSchema = z.enum(
  Object.values(M2_DRAFT_DIAGNOSTIC_STRENGTH_NORMALIZATIONS) as [
    NormalizationId,
    ...NormalizationId[],
  ],
);

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Number(clampRatio(value).toFixed(6));
}

export function diagnosticComponentScore(
  normalizationId: NormalizationId,
  observedValue: number,
): number {
  if (!Number.isFinite(observedValue)) {
    throw new TypeError("diagnostic strength values must be finite");
  }
  const definition = M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY.normalizations[
    normalizationId
  ];
  switch (definition.condition) {
    case "HIGHER_IS_STRONGER":
      return roundScore(
        0.5 + 0.5 *
          ((observedValue - definition.boundary) /
            (definition.anchor - definition.boundary)),
      );
    case "LOWER_IS_STRONGER":
      return roundScore(
        0.5 + 0.5 *
          ((definition.boundary - observedValue) /
            (definition.boundary - definition.anchor)),
      );
    case "ABSOLUTE_LOWER_IS_STRONGER":
      return roundScore(
        0.5 + 0.5 *
          ((definition.boundary - Math.abs(observedValue)) /
            (definition.boundary - definition.anchor)),
      );
    case "BOOLEAN_TRUE":
      return observedValue === 1 ? 1 : 0;
    case "CONTEXT_ONLY":
      return 1;
  }
}

export const M2DraftDiagnosticStrengthComponentSchema = z.strictObject({
  normalizationId: NormalizationIdSchema,
  semanticKey: NonEmptyStringSchema,
  observationId: NonEmptyStringSchema,
  directionRole: z.enum(["LONG", "SHORT", "SHARED"]),
  condition: z.enum([
    "HIGHER_IS_STRONGER",
    "LOWER_IS_STRONGER",
    "ABSOLUTE_LOWER_IS_STRONGER",
    "BOOLEAN_TRUE",
    "CONTEXT_ONLY",
  ]),
  observedValue: z.number().finite(),
  normalizedScore: RatioSchema,
}).superRefine((component, context) => {
  const definition = M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY.normalizations[
    component.normalizationId
  ];
  if (
    component.semanticKey !== definition.semanticKey ||
    component.condition !== definition.condition
  ) {
    context.addIssue({
      code: "custom",
      message: "diagnostic component identity disagrees with its frozen policy",
      path: ["normalizationId"],
    });
  }
  if (
    Math.abs(component.normalizedScore - diagnosticComponentScore(
      component.normalizationId,
      component.observedValue,
    )) > 1e-12
  ) {
    context.addIssue({
      code: "custom",
      message: "diagnostic component score disagrees with its frozen policy",
      path: ["normalizedScore"],
    });
  }
});

export type M2DraftDiagnosticStrengthComponent = z.infer<
  typeof M2DraftDiagnosticStrengthComponentSchema
>;

const StrengthPolicyIdentityShape = {
  policyVersion: z.literal(M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY_VERSION),
  policyDigest: z.literal(M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY_DIGEST),
  scoreMeaning: z.literal(
    M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY.scoreMeaning,
  ),
} as const;

export const M2DraftDiagnosticStrengthSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("NOT_RANKABLE"),
    ...StrengthPolicyIdentityShape,
    score: z.null(),
    exclusionReason: z.enum([
      "NO_MATCH",
      "VETOED",
      "DATA_UNAVAILABLE",
    ]),
    components: z.tuple([]),
  }),
  z.strictObject({
    status: z.literal("RANKABLE_MATCH"),
    ...StrengthPolicyIdentityShape,
    score: RatioSchema,
    rawComponentMean: RatioSchema,
    minimumComponentScore: RatioSchema,
    qualityMultiplier: z.union([z.literal(1), z.literal(0.85)]),
    directionMultiplier: z.union([z.literal(1), z.literal(0.75)]),
    components: z.array(M2DraftDiagnosticStrengthComponentSchema).min(1),
  }).superRefine((strength, context) => {
    const componentIds = strength.components.map((component) =>
      `${component.normalizationId}:${component.observationId}:${component.directionRole}`);
    if (new Set(componentIds).size !== componentIds.length) {
      context.addIssue({
        code: "custom",
        message: "diagnostic strength components must be unique",
        path: ["components"],
      });
    }
    const mean = roundScore(strength.components.reduce(
      (total, component) => total + component.normalizedScore,
      0,
    ) / strength.components.length);
    const minimum = Math.min(...strength.components.map(
      (component) => component.normalizedScore,
    ));
    const expectedScore = roundScore(
      mean * strength.qualityMultiplier * strength.directionMultiplier,
    );
    if (Math.abs(strength.rawComponentMean - mean) > 1e-12) {
      context.addIssue({
        code: "custom",
        message: "diagnostic raw component mean is inconsistent",
        path: ["rawComponentMean"],
      });
    }
    if (Math.abs(strength.minimumComponentScore - minimum) > 1e-12) {
      context.addIssue({
        code: "custom",
        message: "diagnostic minimum component score is inconsistent",
        path: ["minimumComponentScore"],
      });
    }
    if (Math.abs(strength.score - expectedScore) > 1e-12) {
      context.addIssue({
        code: "custom",
        message: "diagnostic aggregate score is inconsistent",
        path: ["score"],
      });
    }
  }),
]);

export type M2DraftDiagnosticStrength = z.infer<
  typeof M2DraftDiagnosticStrengthSchema
>;

export function buildM2DiagnosticStrengthComponent(input: Readonly<{
  normalizationId: NormalizationId;
  observationId: string;
  directionRole: "LONG" | "SHORT" | "SHARED";
  observedValue: number;
}>): M2DraftDiagnosticStrengthComponent {
  const definition = M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY.normalizations[
    input.normalizationId
  ];
  return deepFreezeArtifact(M2DraftDiagnosticStrengthComponentSchema.parse({
    normalizationId: input.normalizationId,
    semanticKey: definition.semanticKey,
    observationId: input.observationId,
    directionRole: input.directionRole,
    condition: definition.condition,
    observedValue: input.observedValue,
    normalizedScore: diagnosticComponentScore(
      input.normalizationId,
      input.observedValue,
    ),
  }));
}

export function buildM2RankableDiagnosticStrength(input: Readonly<{
  components: readonly M2DraftDiagnosticStrengthComponent[];
  inputQualityStatus: "FRESH" | "PARTIAL";
  direction: "LONG" | "SHORT" | "UNKNOWN";
}>): M2DraftDiagnosticStrength {
  const components = [...input.components].sort((left, right) =>
    `${left.normalizationId}:${left.observationId}:${left.directionRole}`
      .localeCompare(
        `${right.normalizationId}:${right.observationId}:${right.directionRole}`,
      ));
  const rawComponentMean = roundScore(components.reduce(
    (total, component) => total + component.normalizedScore,
    0,
  ) / components.length);
  const qualityMultiplier =
    M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY.qualityMultipliers[
      input.inputQualityStatus
    ];
  const directionMultiplier = input.direction === "UNKNOWN"
    ? M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY.directionMultipliers.UNKNOWN
    : M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY.directionMultipliers.RESOLVED;
  return deepFreezeArtifact(M2DraftDiagnosticStrengthSchema.parse({
    status: "RANKABLE_MATCH",
    policyVersion: M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY_VERSION,
    policyDigest: M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY_DIGEST,
    scoreMeaning: M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY.scoreMeaning,
    score: roundScore(
      rawComponentMean * qualityMultiplier * directionMultiplier,
    ),
    rawComponentMean,
    minimumComponentScore: Math.min(...components.map(
      (component) => component.normalizedScore,
    )),
    qualityMultiplier,
    directionMultiplier,
    components,
  }));
}

export function buildM2NotRankableDiagnosticStrength(
  exclusionReason: "NO_MATCH" | "VETOED" | "DATA_UNAVAILABLE",
): M2DraftDiagnosticStrength {
  return deepFreezeArtifact(M2DraftDiagnosticStrengthSchema.parse({
    status: "NOT_RANKABLE",
    policyVersion: M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY_VERSION,
    policyDigest: M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY_DIGEST,
    scoreMeaning: M2_DRAFT_DIAGNOSTIC_STRENGTH_POLICY.scoreMeaning,
    score: null,
    exclusionReason,
    components: [],
  }));
}
