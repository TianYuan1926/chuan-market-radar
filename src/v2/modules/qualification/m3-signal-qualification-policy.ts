import type {
  AnalysisSnapshot,
  MarketContextSnapshot,
  QualificationDimensionStatus,
} from "../../domain/contracts";
import type { OpportunityFamily } from "../../domain/product-constitution";

export const M3_SIGNAL_QUALIFICATION_POLICY_VERSION =
  "m3-signal-qualification-policy.v1-test-only-uncalibrated" as const;

export const M3_EVIDENCE_GRADE_TEST_POLICY = Object.freeze({
  A: {
    minimumIndependentGroups: 3,
    requiredCompletenessRatio: 1,
    requiredFreshRatio: 1,
  },
  B: {
    minimumIndependentGroups: 2,
    requiredCompletenessRatio: 1,
    requiredFreshRatio: 1,
  },
  C: {
    minimumIndependentGroups: 1,
    requiredCompletenessRatio: 1,
    requiredFreshRatio: 1,
  },
} as const);

const PREMIUM_STRUCTURE_STATES = Object.freeze({
  PRE_MOVE: ["COMPRESSION_WITH_DIRECTIONAL_PRESSURE"],
  BREAKOUT_RETEST: ["ROLE_FLIP_RETEST_HOLD"],
  TREND_CONTINUATION: ["STRUCTURAL_PULLBACK_HOLD"],
  REVERSAL_RANGE: ["LIQUIDITY_SWEEP_RECLAIM_OR_REJECTION"],
  RELATIVE_STRENGTH: ["BENCHMARK_ADJUSTED_DIVERGENCE"],
  DERIVATIVES_FLOW: [
    "PRICE_POSITIONING_DIVERGENCE",
    "FUNDING_BASIS_DISLOCATION",
  ],
} as const satisfies Record<OpportunityFamily, readonly string[]>);

const QUALIFIED_STRUCTURE_STATES = Object.freeze({
  PRE_MOVE: ["LIQUIDITY_STATE_TRANSITION"],
  BREAKOUT_RETEST: ["BOUNDARY_BREAK_ACCEPTANCE"],
  TREND_CONTINUATION: ["TREND_STRUCTURE_INTACT"],
  REVERSAL_RANGE: ["RANGE_EDGE_REACTION"],
  RELATIVE_STRENGTH: ["BENCHMARK_ADJUSTED_DIVERGENCE"],
  DERIVATIVES_FLOW: ["CROWDING_RELEASE"],
} as const satisfies Record<OpportunityFamily, readonly string[]>);

const INVALID_STRUCTURE_STATES = Object.freeze(new Set([
  "EARLY_STRUCTURE_INVALIDATED",
  "BREAKOUT_FAILED_RETURNED_INSIDE",
  "TREND_STRUCTURE_DAMAGED",
  "REVERSAL_HYPOTHESIS_INVALIDATED",
  "RELATIVE_EDGE_DECAYED",
  "DERIVATIVES_EVIDENCE_UNAVAILABLE",
]));

const ALLOWED_REGIMES = Object.freeze({
  PRE_MOVE: ["TREND", "RANGE", "TRANSITION"],
  BREAKOUT_RETEST: ["TREND", "TRANSITION"],
  TREND_CONTINUATION: ["TREND"],
  REVERSAL_RANGE: ["RANGE", "TRANSITION"],
  RELATIVE_STRENGTH: ["TREND", "RANGE", "TRANSITION"],
  DERIVATIVES_FLOW: ["TREND", "RANGE", "TRANSITION", "STRESS"],
} as const satisfies Record<
  OpportunityFamily,
  readonly Exclude<MarketContextSnapshot["regime"], "UNKNOWN">[]
>);

export function m3StructureQualificationStatus(
  analysis: AnalysisSnapshot,
): QualificationDimensionStatus {
  if (INVALID_STRUCTURE_STATES.has(analysis.structureState)) {
    return "FAIL";
  }
  if (
    (PREMIUM_STRUCTURE_STATES[analysis.opportunityFamily] as readonly string[]).includes(
      analysis.structureState,
    )
  ) {
    return "PASS";
  }
  if (
    (QUALIFIED_STRUCTURE_STATES[analysis.opportunityFamily] as readonly string[]).includes(
      analysis.structureState,
    )
  ) {
    return "DEGRADED";
  }
  return analysis.structureState === "UNRESOLVED" ? "UNKNOWN" : "DEGRADED";
}

export function m3RegimeFitStatus(
  family: OpportunityFamily,
  context: MarketContextSnapshot,
): QualificationDimensionStatus {
  if (
    context.quality.status !== "FRESH" ||
    context.regime === "UNKNOWN" ||
    context.confidence === "UNKNOWN"
  ) {
    return "UNKNOWN";
  }
  if (
    !(ALLOWED_REGIMES[family] as readonly MarketContextSnapshot["regime"][])
      .includes(context.regime)
  ) {
    return "FAIL";
  }
  if (
    context.confidence === "LOW" ||
    (context.regime === "STRESS" && family === "DERIVATIVES_FLOW")
  ) {
    return "DEGRADED";
  }
  return "PASS";
}

export function m3PremiumStructureState(
  analysis: AnalysisSnapshot,
): boolean {
  return (
    PREMIUM_STRUCTURE_STATES[analysis.opportunityFamily] as readonly string[]
  ).includes(
    analysis.structureState,
  );
}
