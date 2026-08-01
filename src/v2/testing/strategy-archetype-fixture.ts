import {
  M3_STRATEGY_TEST_SCOPE_EPOCH,
  STRATEGY_ARCHETYPE_DEFINITIONS,
  STRATEGY_ARCHETYPE_LABEL_SCHEMA_VERSION,
  STRATEGY_ARCHETYPE_TAXONOMY_VERSION,
  STRATEGY_CONTEXT_TAGS_SCHEMA_VERSION,
  STRATEGY_CONTEXT_TAXONOMY_VERSION,
  type StrategyArchetypeId,
  type StrategyArchetypeLabel,
  type StrategyArchetypeReasonCode,
  type StrategyContextTags,
} from "../domain/strategy-archetype";
import type { OpportunityFamily } from "../domain/product-constitution";
import {
  StrategyArchetypeLabelSchema,
  StrategyContextTagsSchema,
  strategyArchetypeContentHash,
  strategyContextTagsContentHash,
} from "../runtime-schema/strategy-archetype-schemas";

const REASON_BY_ID = Object.freeze({
  BREAKOUT_RETEST_LONG: "archetype_breakout_role_flip_retest",
  BREAKDOWN_RETEST_SHORT: "archetype_breakout_role_flip_retest",
  SUPPORT_BOUNCE_LONG: "archetype_relative_edge_with_local_structure",
  RESISTANCE_REJECTION_SHORT:
    "archetype_relative_edge_with_local_structure",
  TREND_PULLBACK_CONTINUATION_LONG:
    "archetype_trend_structural_resumption",
  TREND_RALLY_CONTINUATION_SHORT:
    "archetype_trend_structural_resumption",
  FAILED_BREAKDOWN_REVERSAL_LONG: "archetype_failed_break_reversal",
  FAILED_BREAKOUT_REVERSAL_SHORT: "archetype_failed_break_reversal",
  RANGE_LOW_REVERSAL_LONG: "archetype_range_edge_reversal",
  RANGE_HIGH_REVERSAL_SHORT: "archetype_range_edge_reversal",
  COMPRESSION_EXPANSION_LONG: "archetype_compression_expansion",
  COMPRESSION_EXPANSION_SHORT: "archetype_compression_expansion",
  LIQUIDITY_SWEEP_RECLAIM_LONG: "archetype_liquidity_sweep_reversal",
  LIQUIDITY_SWEEP_REJECT_SHORT: "archetype_liquidity_sweep_reversal",
} as const satisfies Record<StrategyArchetypeId, StrategyArchetypeReasonCode>);

export function strategyArchetypeFixture(options: Readonly<{
  id?: StrategyArchetypeId;
  opportunityFamily?: OpportunityFamily;
  analysisSnapshotId?: string;
  signalQualificationId?: string;
  evidencePackageId?: string;
  structuralLevelIds?: readonly string[];
  releaseIdentity?: string;
  generatedAt?: string;
  scopeEpoch?: string;
}> = {}): StrategyArchetypeLabel {
  const id = options.id ?? "COMPRESSION_EXPANSION_LONG";
  const definition = STRATEGY_ARCHETYPE_DEFINITIONS[id];
  const content: Omit<StrategyArchetypeLabel, "contentHash"> = {
    schemaVersion: STRATEGY_ARCHETYPE_LABEL_SCHEMA_VERSION,
    id,
    taxonomyVersion: STRATEGY_ARCHETYPE_TAXONOMY_VERSION,
    opportunityFamily: options.opportunityFamily ?? "PRE_MOVE",
    direction: definition.direction,
    structureInteraction: definition.structureInteraction,
    triggerPattern: definition.triggerPattern,
    reasonCodes: [REASON_BY_ID[id]],
    analysisSnapshotId: options.analysisSnapshotId ?? "analysis-fixture-1",
    signalQualificationId:
      options.signalQualificationId ?? "qualification-fixture-1",
    evidencePackageId:
      options.evidencePackageId ?? "evidence-package-fixture-1",
    structuralLevelIds: [...(
      options.structuralLevelIds ?? ["support-fixture-1"]
    )].sort(),
    policyVersion: "fixture-strategy-archetype-policy.v1",
    generatorVersion: "fixture-strategy-archetype-generator.v1",
    releaseIdentity: options.releaseIdentity ?? "release-fixture-1",
    scopeEpoch: options.scopeEpoch ?? M3_STRATEGY_TEST_SCOPE_EPOCH,
    generatedAt:
      options.generatedAt ?? "2026-01-15T00:01:00.000Z",
  };
  return StrategyArchetypeLabelSchema.parse({
    ...content,
    contentHash: strategyArchetypeContentHash(content),
  });
}

export function strategyContextTagsFixture(options: Readonly<{
  scopeEpoch?: string;
  regime?: StrategyContextTags["regime"];
  evidenceDrivers?: StrategyContextTags["evidenceDrivers"];
}> = {}): StrategyContextTags {
  const content: Omit<StrategyContextTags, "contentHash"> = {
    schemaVersion: STRATEGY_CONTEXT_TAGS_SCHEMA_VERSION,
    taxonomyVersion: STRATEGY_CONTEXT_TAXONOMY_VERSION,
    scopeEpoch: options.scopeEpoch ?? M3_STRATEGY_TEST_SCOPE_EPOCH,
    regime: options.regime ?? "TRANSITION",
    liquidityBucket: "UNBOUND_TEST_ONLY",
    venueSet: [],
    assetDomain: "UNBOUND_TEST_ONLY",
    listingLifecycle: "UNBOUND_TEST_ONLY",
    timeframeAlignment: "MULTI_TIMEFRAME_UNASSESSED",
    volatilityState: "UNKNOWN",
    marketContext: "EARLY",
    evidenceDrivers: [...(
      options.evidenceDrivers ?? ["PRE_MOVE", "STRUCTURE"]
    )].sort(),
    counterEvidenceFlags: [],
    executionConstraints: [
      "BUFFER_POLICY_UNCALIBRATED",
      "COST_ASSUMPTIONS_UNCALIBRATED",
      "TEST_ONLY_UNCALIBRATED",
    ],
    unboundDimensions: [
      "ASSET_DOMAIN",
      "LIQUIDITY_BUCKET",
      "LISTING_LIFECYCLE",
      "VENUE_SET",
    ],
  };
  return StrategyContextTagsSchema.parse({
    ...content,
    contentHash: strategyContextTagsContentHash(content),
  });
}
