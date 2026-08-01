import type { OpportunityFamily } from "./product-constitution";
import type { ActionState } from "./states";

export const STRATEGY_ARCHETYPE_LABEL_SCHEMA_VERSION =
  "strategy-archetype-label.v1" as const;
export const STRATEGY_ARCHETYPE_TAXONOMY_VERSION =
  "strategy-archetype-taxonomy.v1" as const;
export const STRATEGY_CONTEXT_TAGS_SCHEMA_VERSION =
  "strategy-context-tags.v1" as const;
export const STRATEGY_CONTEXT_TAXONOMY_VERSION =
  "strategy-context-taxonomy.v1" as const;
export const STRATEGY_STATE_LABEL_SCHEMA_VERSION =
  "strategy-state-label.v1" as const;
export const M3_STRATEGY_TEST_SCOPE_EPOCH =
  "M3_TEST_ONLY_UNBOUND_SCOPE_EPOCH" as const;

export const STRATEGY_ARCHETYPE_IDS = [
  "BREAKOUT_RETEST_LONG",
  "BREAKDOWN_RETEST_SHORT",
  "SUPPORT_BOUNCE_LONG",
  "RESISTANCE_REJECTION_SHORT",
  "TREND_PULLBACK_CONTINUATION_LONG",
  "TREND_RALLY_CONTINUATION_SHORT",
  "FAILED_BREAKDOWN_REVERSAL_LONG",
  "FAILED_BREAKOUT_REVERSAL_SHORT",
  "RANGE_LOW_REVERSAL_LONG",
  "RANGE_HIGH_REVERSAL_SHORT",
  "COMPRESSION_EXPANSION_LONG",
  "COMPRESSION_EXPANSION_SHORT",
  "LIQUIDITY_SWEEP_RECLAIM_LONG",
  "LIQUIDITY_SWEEP_REJECT_SHORT",
] as const;

export type StrategyArchetypeId = (typeof STRATEGY_ARCHETYPE_IDS)[number];

export const STRATEGY_STRUCTURE_INTERACTIONS = [
  "ROLE_FLIP_RETEST",
  "SUPPORT_REACTION",
  "RESISTANCE_REJECTION",
  "TREND_PULLBACK_HOLD",
  "TREND_RALLY_REJECTION",
  "FAILED_BREAKDOWN_RECLAIM",
  "FAILED_BREAKOUT_REJECTION",
  "RANGE_LOW_REACTION",
  "RANGE_HIGH_REACTION",
  "COMPRESSION_BOUNDARY_EXPANSION",
  "LIQUIDITY_SWEEP_RECLAIM",
  "LIQUIDITY_SWEEP_REJECTION",
] as const;

export type StrategyStructureInteraction =
  (typeof STRATEGY_STRUCTURE_INTERACTIONS)[number];

export const STRATEGY_TRIGGER_PATTERNS = [
  "RETEST_CONFIRMATION",
  "BOUNCE_CONFIRMATION",
  "REJECTION_CONFIRMATION",
  "CONTINUATION_RESUMPTION",
  "FAILED_BREAK_REVERSAL",
  "RANGE_REVERSAL_CONFIRMATION",
  "EXPANSION_CONFIRMATION",
  "SWEEP_RECLAIM_CONFIRMATION",
  "SWEEP_REJECTION_CONFIRMATION",
] as const;

export type StrategyTriggerPattern =
  (typeof STRATEGY_TRIGGER_PATTERNS)[number];

export type StrategyArchetypeDefinition = Readonly<{
  direction: "LONG" | "SHORT";
  structureInteraction: StrategyStructureInteraction;
  triggerPattern: StrategyTriggerPattern;
  localizationKey: string;
}>;

export const STRATEGY_ARCHETYPE_DEFINITIONS = Object.freeze({
  BREAKOUT_RETEST_LONG: {
    direction: "LONG",
    structureInteraction: "ROLE_FLIP_RETEST",
    triggerPattern: "RETEST_CONFIRMATION",
    localizationKey: "strategy.archetype.breakout_retest_long",
  },
  BREAKDOWN_RETEST_SHORT: {
    direction: "SHORT",
    structureInteraction: "ROLE_FLIP_RETEST",
    triggerPattern: "RETEST_CONFIRMATION",
    localizationKey: "strategy.archetype.breakdown_retest_short",
  },
  SUPPORT_BOUNCE_LONG: {
    direction: "LONG",
    structureInteraction: "SUPPORT_REACTION",
    triggerPattern: "BOUNCE_CONFIRMATION",
    localizationKey: "strategy.archetype.support_bounce_long",
  },
  RESISTANCE_REJECTION_SHORT: {
    direction: "SHORT",
    structureInteraction: "RESISTANCE_REJECTION",
    triggerPattern: "REJECTION_CONFIRMATION",
    localizationKey: "strategy.archetype.resistance_rejection_short",
  },
  TREND_PULLBACK_CONTINUATION_LONG: {
    direction: "LONG",
    structureInteraction: "TREND_PULLBACK_HOLD",
    triggerPattern: "CONTINUATION_RESUMPTION",
    localizationKey: "strategy.archetype.trend_pullback_continuation_long",
  },
  TREND_RALLY_CONTINUATION_SHORT: {
    direction: "SHORT",
    structureInteraction: "TREND_RALLY_REJECTION",
    triggerPattern: "CONTINUATION_RESUMPTION",
    localizationKey: "strategy.archetype.trend_rally_continuation_short",
  },
  FAILED_BREAKDOWN_REVERSAL_LONG: {
    direction: "LONG",
    structureInteraction: "FAILED_BREAKDOWN_RECLAIM",
    triggerPattern: "FAILED_BREAK_REVERSAL",
    localizationKey: "strategy.archetype.failed_breakdown_reversal_long",
  },
  FAILED_BREAKOUT_REVERSAL_SHORT: {
    direction: "SHORT",
    structureInteraction: "FAILED_BREAKOUT_REJECTION",
    triggerPattern: "FAILED_BREAK_REVERSAL",
    localizationKey: "strategy.archetype.failed_breakout_reversal_short",
  },
  RANGE_LOW_REVERSAL_LONG: {
    direction: "LONG",
    structureInteraction: "RANGE_LOW_REACTION",
    triggerPattern: "RANGE_REVERSAL_CONFIRMATION",
    localizationKey: "strategy.archetype.range_low_reversal_long",
  },
  RANGE_HIGH_REVERSAL_SHORT: {
    direction: "SHORT",
    structureInteraction: "RANGE_HIGH_REACTION",
    triggerPattern: "RANGE_REVERSAL_CONFIRMATION",
    localizationKey: "strategy.archetype.range_high_reversal_short",
  },
  COMPRESSION_EXPANSION_LONG: {
    direction: "LONG",
    structureInteraction: "COMPRESSION_BOUNDARY_EXPANSION",
    triggerPattern: "EXPANSION_CONFIRMATION",
    localizationKey: "strategy.archetype.compression_expansion_long",
  },
  COMPRESSION_EXPANSION_SHORT: {
    direction: "SHORT",
    structureInteraction: "COMPRESSION_BOUNDARY_EXPANSION",
    triggerPattern: "EXPANSION_CONFIRMATION",
    localizationKey: "strategy.archetype.compression_expansion_short",
  },
  LIQUIDITY_SWEEP_RECLAIM_LONG: {
    direction: "LONG",
    structureInteraction: "LIQUIDITY_SWEEP_RECLAIM",
    triggerPattern: "SWEEP_RECLAIM_CONFIRMATION",
    localizationKey: "strategy.archetype.liquidity_sweep_reclaim_long",
  },
  LIQUIDITY_SWEEP_REJECT_SHORT: {
    direction: "SHORT",
    structureInteraction: "LIQUIDITY_SWEEP_REJECTION",
    triggerPattern: "SWEEP_REJECTION_CONFIRMATION",
    localizationKey: "strategy.archetype.liquidity_sweep_reject_short",
  },
} as const satisfies Record<StrategyArchetypeId, StrategyArchetypeDefinition>);

export const STRATEGY_ARCHETYPE_REASON_CODES = [
  "archetype_breakout_role_flip_retest",
  "archetype_compression_expansion",
  "archetype_derivatives_flow_with_local_structure",
  "archetype_failed_break_reversal",
  "archetype_liquidity_sweep_reversal",
  "archetype_range_edge_reversal",
  "archetype_relative_edge_with_local_structure",
  "archetype_trend_structural_resumption",
] as const;

export type StrategyArchetypeReasonCode =
  (typeof STRATEGY_ARCHETYPE_REASON_CODES)[number];

export const STRATEGY_CONTEXT_REGIMES = [
  "TREND",
  "RANGE",
  "TRANSITION",
  "STRESS",
  "UNKNOWN",
] as const;
export const STRATEGY_CONTEXT_LIQUIDITY_BUCKETS = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "UNBOUND_TEST_ONLY",
] as const;
export const STRATEGY_CONTEXT_VENUES = [
  "BINANCE_FUTURES",
  "OKX_SWAP",
  "BYBIT_LINEAR_PERPETUAL",
  "BITGET_USDT_PERPETUAL",
] as const;
export const STRATEGY_CONTEXT_ASSET_DOMAINS = [
  "CRYPTO_LINEAR_PERPETUAL",
  "EQUITY_SINGLE_NAME_PERPETUAL",
  "EQUITY_INDEX_ETF_PERPETUAL",
  "UNBOUND_TEST_ONLY",
] as const;
export const STRATEGY_CONTEXT_LISTING_LIFECYCLES = [
  "WARM_UP",
  "ESTABLISHED",
  "UNBOUND_TEST_ONLY",
] as const;
export const STRATEGY_CONTEXT_TIMEFRAME_ALIGNMENTS = [
  "SINGLE_TIMEFRAME_REFERENCED",
  "MULTI_TIMEFRAME_UNASSESSED",
  "MULTI_TIMEFRAME_ALIGNED",
  "MULTI_TIMEFRAME_CONFLICT",
] as const;
export const STRATEGY_CONTEXT_VOLATILITY_STATES = [
  "COMPRESSED",
  "NORMAL",
  "EXPANDING",
  "STRESS",
  "UNKNOWN",
] as const;
export const STRATEGY_CONTEXT_MARKET_STAGES = [
  "EARLY",
  "EARLY_UNCONFIRMED",
  "RETEST",
  "BREAKOUT",
  "RETEST_PENDING",
  "RESUMPTION",
  "PULLBACK_OR_COMPRESSION",
  "EARLY_REVERSAL",
  "CONFIRMATION_PENDING",
  "PERSISTING",
  "EMERGING",
  "EARLY_DIVERGENCE",
  "REPRICING",
  "DISLOCATION",
  "EXTENDED",
  "INVALIDATED",
  "LATE_OR_CONSUMED",
  "LATE_OR_CROWDED",
  "POST_EVENT",
  "UNRESOLVED",
  "UNKNOWN",
] as const;
export const STRATEGY_CONTEXT_EVIDENCE_DRIVERS = [
  "STRUCTURE",
  "PRE_MOVE",
  "BREAKOUT",
  "TREND",
  "REVERSAL",
  "BENCHMARK_RELATIVE",
  "DERIVATIVES",
] as const;
export const STRATEGY_CONTEXT_COUNTER_EVIDENCE_FLAGS = [
  "COUNTER_EVIDENCE_PRESENT",
  "LATE_RISK_NOT_LOW",
  "FAKEOUT_RISK_NOT_LOW",
  "NOISE_RISK_NOT_LOW",
] as const;
export const STRATEGY_CONTEXT_EXECUTION_CONSTRAINTS = [
  "TEST_ONLY_UNCALIBRATED",
  "BUFFER_POLICY_UNCALIBRATED",
  "COST_ASSUMPTIONS_UNCALIBRATED",
  "QUALIFICATION_CALIBRATION_ABSTAINED",
  "EVIDENCE_GRADE_C_OBSERVE_ONLY",
  "SETUP_GRADE_MARGINAL_OBSERVE_ONLY",
  "STRUCTURAL_RR_BELOW_MINIMUM",
  "ESTIMATED_NET_RR_BELOW_MINIMUM",
] as const;
export const STRATEGY_CONTEXT_UNBOUND_DIMENSIONS = [
  "VENUE_SET",
  "ASSET_DOMAIN",
  "LISTING_LIFECYCLE",
  "LIQUIDITY_BUCKET",
] as const;

export type StrategyArchetypeLabel = Readonly<{
  schemaVersion: typeof STRATEGY_ARCHETYPE_LABEL_SCHEMA_VERSION;
  id: StrategyArchetypeId;
  taxonomyVersion: typeof STRATEGY_ARCHETYPE_TAXONOMY_VERSION;
  opportunityFamily: OpportunityFamily;
  direction: "LONG" | "SHORT";
  structureInteraction: StrategyStructureInteraction;
  triggerPattern: StrategyTriggerPattern;
  reasonCodes: readonly StrategyArchetypeReasonCode[];
  analysisSnapshotId: string;
  signalQualificationId: string;
  evidencePackageId: string;
  structuralLevelIds: readonly string[];
  policyVersion: string;
  generatorVersion: string;
  releaseIdentity: string;
  scopeEpoch: string;
  generatedAt: string;
  contentHash: string;
}>;

export type StrategyContextTags = Readonly<{
  schemaVersion: typeof STRATEGY_CONTEXT_TAGS_SCHEMA_VERSION;
  taxonomyVersion: typeof STRATEGY_CONTEXT_TAXONOMY_VERSION;
  scopeEpoch: string;
  regime: (typeof STRATEGY_CONTEXT_REGIMES)[number];
  liquidityBucket: (typeof STRATEGY_CONTEXT_LIQUIDITY_BUCKETS)[number];
  venueSet: readonly (typeof STRATEGY_CONTEXT_VENUES)[number][];
  assetDomain: (typeof STRATEGY_CONTEXT_ASSET_DOMAINS)[number];
  listingLifecycle: (typeof STRATEGY_CONTEXT_LISTING_LIFECYCLES)[number];
  timeframeAlignment: (typeof STRATEGY_CONTEXT_TIMEFRAME_ALIGNMENTS)[number];
  volatilityState: (typeof STRATEGY_CONTEXT_VOLATILITY_STATES)[number];
  marketContext: (typeof STRATEGY_CONTEXT_MARKET_STAGES)[number];
  evidenceDrivers: readonly (typeof STRATEGY_CONTEXT_EVIDENCE_DRIVERS)[number][];
  counterEvidenceFlags: readonly (typeof STRATEGY_CONTEXT_COUNTER_EVIDENCE_FLAGS)[number][];
  executionConstraints: readonly (typeof STRATEGY_CONTEXT_EXECUTION_CONSTRAINTS)[number][];
  unboundDimensions: readonly (typeof STRATEGY_CONTEXT_UNBOUND_DIMENSIONS)[number][];
  contentHash: string;
}>;

export const STRATEGY_STATE_LOCALIZATION_KEYS = Object.freeze({
  OBSERVE: "strategy.state.observe",
  WAIT: "strategy.state.wait",
  BLOCKED: "strategy.state.blocked",
  TRADE_PLAN_READY: "strategy.state.trade_plan_ready",
} as const satisfies Record<ActionState, string>);

export type StrategyStateLabel = Readonly<{
  schemaVersion: typeof STRATEGY_STATE_LABEL_SCHEMA_VERSION;
  actionState: ActionState;
  localizationKey: (typeof STRATEGY_STATE_LOCALIZATION_KEYS)[ActionState];
}>;
