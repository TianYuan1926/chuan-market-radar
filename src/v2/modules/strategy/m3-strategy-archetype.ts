import type {
  AnalysisSnapshot,
  Direction,
  OpportunityThesis,
  SignalQualification,
  StructuralLevel,
} from "../../domain/contracts";
import {
  M3_STRATEGY_TEST_SCOPE_EPOCH,
  STRATEGY_ARCHETYPE_DEFINITIONS,
  STRATEGY_ARCHETYPE_LABEL_SCHEMA_VERSION,
  STRATEGY_ARCHETYPE_TAXONOMY_VERSION,
  STRATEGY_CONTEXT_MARKET_STAGES,
  STRATEGY_CONTEXT_TAGS_SCHEMA_VERSION,
  STRATEGY_CONTEXT_TAXONOMY_VERSION,
  type StrategyArchetypeId,
  type StrategyArchetypeLabel,
  type StrategyArchetypeReasonCode,
  type StrategyContextTags,
} from "../../domain/strategy-archetype";
import {
  StrategyArchetypeLabelSchema,
  StrategyContextTagsSchema,
  strategyArchetypeContentHash,
  strategyContextTagsContentHash,
} from "../../runtime-schema/strategy-archetype-schemas";
import { deepFreezeArtifact } from "../universe/stable-artifact";

export const M3_STRATEGY_ARCHETYPE_GENERATOR_VERSION =
  "m3-strategy-archetype-generator.v1-test-only" as const;

type ArchetypeClassification = Readonly<{
  id: StrategyArchetypeId;
  reasonCode: StrategyArchetypeReasonCode;
}>;

export type M3StrategyArchetypeBuildInput = Readonly<{
  thesis: OpportunityThesis;
  analysis: AnalysisSnapshot;
  qualification: SignalQualification;
  direction: Direction;
  entryAnchor: StructuralLevel;
  releaseId: string;
  generatedAt: string;
  policyVersion: string;
  blockers: readonly string[];
}>;

export type M3StrategyArchetypeBuildResult = Readonly<{
  strategyArchetype: StrategyArchetypeLabel | null;
  strategyContextTags: StrategyContextTags | null;
  reasonCodes: readonly string[];
}>;

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function localStructureArchetype(
  direction: Direction,
  entryAnchor: StructuralLevel,
): StrategyArchetypeId | null {
  if (direction === "LONG" && entryAnchor.kind === "SUPPORT") {
    return "SUPPORT_BOUNCE_LONG";
  }
  if (direction === "SHORT" && entryAnchor.kind === "RESISTANCE") {
    return "RESISTANCE_REJECTION_SHORT";
  }
  if (entryAnchor.kind === "RANGE_EDGE") {
    return direction === "LONG"
      ? "RANGE_LOW_REVERSAL_LONG"
      : "RANGE_HIGH_REVERSAL_SHORT";
  }
  return null;
}

function classify(
  input: M3StrategyArchetypeBuildInput,
): ArchetypeClassification | null {
  const { thesis, analysis, direction, entryAnchor } = input;
  const patterns = new Set(thesis.opportunityPatterns);

  if (
    analysis.opportunityFamily === "PRE_MOVE" &&
    patterns.has("PRE_MOVE_COMPRESSION") &&
    analysis.structureState === "COMPRESSION_WITH_DIRECTIONAL_PRESSURE"
  ) {
    return {
      id: direction === "LONG"
        ? "COMPRESSION_EXPANSION_LONG"
        : "COMPRESSION_EXPANSION_SHORT",
      reasonCode: "archetype_compression_expansion",
    };
  }

  if (
    analysis.opportunityFamily === "BREAKOUT_RETEST" &&
    patterns.has("ROLE_FLIP_RETEST") &&
    analysis.structureState === "ROLE_FLIP_RETEST_HOLD"
  ) {
    return {
      id: direction === "LONG"
        ? "BREAKOUT_RETEST_LONG"
        : "BREAKDOWN_RETEST_SHORT",
      reasonCode: "archetype_breakout_role_flip_retest",
    };
  }

  if (
    analysis.opportunityFamily === "TREND_CONTINUATION" &&
    patterns.has("STRUCTURAL_PULLBACK_RESUMPTION") &&
    analysis.structureState === "STRUCTURAL_PULLBACK_HOLD"
  ) {
    return {
      id: direction === "LONG"
        ? "TREND_PULLBACK_CONTINUATION_LONG"
        : "TREND_RALLY_CONTINUATION_SHORT",
      reasonCode: "archetype_trend_structural_resumption",
    };
  }

  if (
    analysis.opportunityFamily === "REVERSAL_RANGE" &&
    patterns.has("KEY_LEVEL_REVERSAL") &&
    analysis.structureState === "LIQUIDITY_SWEEP_RECLAIM_OR_REJECTION"
  ) {
    return {
      id: direction === "LONG"
        ? "LIQUIDITY_SWEEP_RECLAIM_LONG"
        : "LIQUIDITY_SWEEP_REJECT_SHORT",
      reasonCode: "archetype_liquidity_sweep_reversal",
    };
  }

  if (
    analysis.opportunityFamily === "REVERSAL_RANGE" &&
    patterns.has("RANGE_EDGE") &&
    analysis.structureState === "RANGE_EDGE_REACTION" &&
    entryAnchor.kind === "RANGE_EDGE"
  ) {
    return {
      id: direction === "LONG"
        ? "RANGE_LOW_REVERSAL_LONG"
        : "RANGE_HIGH_REVERSAL_SHORT",
      reasonCode: "archetype_range_edge_reversal",
    };
  }

  if (
    analysis.opportunityFamily === "RELATIVE_STRENGTH" &&
    analysis.structureState === "BENCHMARK_ADJUSTED_DIVERGENCE" &&
    (
      (direction === "LONG" && patterns.has("RELATIVE_STRENGTH")) ||
      (direction === "SHORT" && patterns.has("RELATIVE_WEAKNESS"))
    )
  ) {
    const id = localStructureArchetype(direction, entryAnchor);
    return id === null
      ? null
      : {
        id,
        reasonCode: "archetype_relative_edge_with_local_structure",
      };
  }

  if (
    analysis.opportunityFamily === "DERIVATIVES_FLOW" &&
    [
      "PRICE_POSITIONING_DIVERGENCE",
      "CROWDING_RELEASE",
      "FUNDING_BASIS_DISLOCATION",
    ].includes(analysis.structureState)
  ) {
    const id = localStructureArchetype(direction, entryAnchor);
    return id === null
      ? null
      : {
        id,
        reasonCode: "archetype_derivatives_flow_with_local_structure",
      };
  }

  return null;
}

function contextEvidenceDrivers(
  family: AnalysisSnapshot["opportunityFamily"],
): StrategyContextTags["evidenceDrivers"] {
  const drivers = {
    PRE_MOVE: ["PRE_MOVE", "STRUCTURE"],
    BREAKOUT_RETEST: ["BREAKOUT", "STRUCTURE"],
    TREND_CONTINUATION: ["STRUCTURE", "TREND"],
    REVERSAL_RANGE: ["REVERSAL", "STRUCTURE"],
    RELATIVE_STRENGTH: ["BENCHMARK_RELATIVE", "STRUCTURE"],
    DERIVATIVES_FLOW: ["DERIVATIVES", "STRUCTURE"],
  } as const satisfies Record<
    AnalysisSnapshot["opportunityFamily"],
    StrategyContextTags["evidenceDrivers"]
  >;
  return uniqueSorted(drivers[family]);
}

function contextExecutionConstraints(
  blockers: readonly string[],
): StrategyContextTags["executionConstraints"] {
  const mapping = {
    strategy_authority_test_only_uncalibrated: "TEST_ONLY_UNCALIBRATED",
    strategy_buffer_policy_uncalibrated: "BUFFER_POLICY_UNCALIBRATED",
    strategy_cost_assumptions_uncalibrated: "COST_ASSUMPTIONS_UNCALIBRATED",
    signal_qualification_calibration_abstained:
      "QUALIFICATION_CALIBRATION_ABSTAINED",
    evidence_grade_c_observe_only: "EVIDENCE_GRADE_C_OBSERVE_ONLY",
    setup_grade_marginal_observe_only:
      "SETUP_GRADE_MARGINAL_OBSERVE_ONLY",
    structural_rr_below_minimum: "STRUCTURAL_RR_BELOW_MINIMUM",
    estimated_net_rr_below_minimum: "ESTIMATED_NET_RR_BELOW_MINIMUM",
  } as const;
  return uniqueSorted(
    blockers.flatMap((blocker) => blocker in mapping
      ? [mapping[blocker as keyof typeof mapping]]
      : []),
  );
}

function buildContextTags(
  input: M3StrategyArchetypeBuildInput,
): StrategyContextTags {
  const marketContext = STRATEGY_CONTEXT_MARKET_STAGES.includes(
      input.analysis.marketStage as (typeof STRATEGY_CONTEXT_MARKET_STAGES)[number],
    )
    ? input.analysis.marketStage as (typeof STRATEGY_CONTEXT_MARKET_STAGES)[number]
    : "UNKNOWN";
  const counterEvidenceFlags = uniqueSorted([
    ...(input.analysis.counterEvidence.length > 0
      ? ["COUNTER_EVIDENCE_PRESENT" as const]
      : []),
    ...(input.analysis.lateRisk === "LOW"
      ? []
      : ["LATE_RISK_NOT_LOW" as const]),
    ...(input.analysis.fakeoutRisk === "LOW"
      ? []
      : ["FAKEOUT_RISK_NOT_LOW" as const]),
    ...(input.analysis.noiseRisk === "LOW"
      ? []
      : ["NOISE_RISK_NOT_LOW" as const]),
  ]);
  const timeframeCount = new Set(
    input.analysis.structuralLevels.map((level) => level.timeframe),
  ).size;
  const content: Omit<StrategyContextTags, "contentHash"> = {
    schemaVersion: STRATEGY_CONTEXT_TAGS_SCHEMA_VERSION,
    taxonomyVersion: STRATEGY_CONTEXT_TAXONOMY_VERSION,
    scopeEpoch: M3_STRATEGY_TEST_SCOPE_EPOCH,
    regime: input.qualification.setupCalibration.segment.regime,
    liquidityBucket: "UNBOUND_TEST_ONLY",
    venueSet: [],
    assetDomain: "UNBOUND_TEST_ONLY",
    listingLifecycle: "UNBOUND_TEST_ONLY",
    timeframeAlignment: timeframeCount <= 1
      ? "SINGLE_TIMEFRAME_REFERENCED"
      : "MULTI_TIMEFRAME_UNASSESSED",
    volatilityState:
      input.analysis.structureState === "COMPRESSION_WITH_DIRECTIONAL_PRESSURE"
        ? "COMPRESSED"
        : "UNKNOWN",
    marketContext,
    evidenceDrivers: contextEvidenceDrivers(input.analysis.opportunityFamily),
    counterEvidenceFlags,
    executionConstraints: contextExecutionConstraints(input.blockers),
    unboundDimensions: [
      "ASSET_DOMAIN",
      "LIQUIDITY_BUCKET",
      "LISTING_LIFECYCLE",
      "VENUE_SET",
    ],
  };
  return deepFreezeArtifact(StrategyContextTagsSchema.parse({
    ...content,
    contentHash: strategyContextTagsContentHash(content),
  }));
}

export function buildM3StrategyArchetype(
  input: M3StrategyArchetypeBuildInput,
): M3StrategyArchetypeBuildResult {
  const classification = classify(input);
  if (classification === null) {
    return deepFreezeArtifact({
      strategyArchetype: null,
      strategyContextTags: null,
      reasonCodes: ["strategy_archetype_not_provable_from_current_lineage"],
    });
  }
  const definition = STRATEGY_ARCHETYPE_DEFINITIONS[classification.id];
  const content: Omit<StrategyArchetypeLabel, "contentHash"> = {
    schemaVersion: STRATEGY_ARCHETYPE_LABEL_SCHEMA_VERSION,
    id: classification.id,
    taxonomyVersion: STRATEGY_ARCHETYPE_TAXONOMY_VERSION,
    opportunityFamily: input.analysis.opportunityFamily,
    direction: input.direction,
    structureInteraction: definition.structureInteraction,
    triggerPattern: definition.triggerPattern,
    reasonCodes: [classification.reasonCode],
    analysisSnapshotId: input.analysis.analysisId,
    signalQualificationId: input.qualification.qualificationId,
    evidencePackageId: input.analysis.evidencePackageId,
    structuralLevelIds: [input.entryAnchor.levelId],
    policyVersion: input.policyVersion,
    generatorVersion: M3_STRATEGY_ARCHETYPE_GENERATOR_VERSION,
    releaseIdentity: input.releaseId,
    scopeEpoch: M3_STRATEGY_TEST_SCOPE_EPOCH,
    generatedAt: input.generatedAt,
  };
  const strategyArchetype = deepFreezeArtifact(
    StrategyArchetypeLabelSchema.parse({
      ...content,
      contentHash: strategyArchetypeContentHash(content),
    }),
  );
  return deepFreezeArtifact({
    strategyArchetype,
    strategyContextTags: buildContextTags(input),
    reasonCodes: [],
  });
}
