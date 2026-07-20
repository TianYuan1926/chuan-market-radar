import type {
  OpportunityFamily,
  OpportunityPattern,
} from "../domain/product-constitution";
import type { QualityAssessment } from "../domain/contracts";
import {
  M2_DISCOVERY_GOLDEN_FIXTURE_VERSION,
  M2_POINT_IN_TIME_FLAGS,
  type M2DiscoveryGoldenFixture,
  parseM2DiscoveryGoldenFixture,
} from "../modules/detection/golden-fixture-contract";
import { M2_DETECTOR_INPUT_VERSION } from "../modules/detection/discovery-contract";

const RELEASE_ID = "m2-golden-contract-release";
const CUTOFF = "2026-01-15T00:01:00.000Z";
const OBSERVED_AT = "2026-01-15T00:00:50.000Z";

const freshQuality = {
  status: "FRESH",
  ageMs: 10_000,
  reasonCodes: [],
} as const satisfies QualityAssessment;

const unavailableQuality = {
  status: "UNAVAILABLE",
  ageMs: null,
  reasonCodes: ["required_capability_unavailable_at_cutoff"],
} as const satisfies QualityAssessment;

type PointInTimeFlag = (typeof M2_POINT_IN_TIME_FLAGS)[number];
type SeedObservation = Readonly<{
  semanticKey: string;
  value: string | number | boolean | null;
  unit: string;
  quality?: QualityAssessment;
}>;
type GoldenSeed = Readonly<{
  caseId: string;
  opportunityFamily: OpportunityFamily;
  opportunityPattern: OpportunityPattern;
  directionHypothesis: "LONG" | "SHORT" | "UNKNOWN";
  expectedDisposition: "DISCOVER" | "NO_CANDIDATE" | "DATA_UNAVAILABLE";
  pointInTimeFlags: readonly PointInTimeFlag[];
  reasonCodes: readonly string[];
  observations: readonly SeedObservation[];
}>;

const seeds = [
  {
    caseId: "pre-move-long-compression",
    opportunityFamily: "PRE_MOVE",
    opportunityPattern: "PRE_MOVE_COMPRESSION",
    directionHypothesis: "LONG",
    expectedDisposition: "DISCOVER",
    pointInTimeFlags: [
      "DISCOVERY_ELIGIBLE_AT_CUTOFF",
      "EARLY_SETUP_AT_CUTOFF",
    ],
    reasonCodes: ["compression_with_early_buy_participation"],
    observations: [
      { semanticKey: "volatility_compression_percentile", value: 0.06, unit: "ratio" },
      { semanticKey: "buy_volume_acceleration", value: 1.8, unit: "multiple" },
      { semanticKey: "move_consumed_ratio", value: 0.08, unit: "ratio" },
    ],
  },
  {
    caseId: "pre-move-short-flow-divergence",
    opportunityFamily: "PRE_MOVE",
    opportunityPattern: "PRE_MOVE_FLOW_DIVERGENCE",
    directionHypothesis: "SHORT",
    expectedDisposition: "DISCOVER",
    pointInTimeFlags: [
      "DISCOVERY_ELIGIBLE_AT_CUTOFF",
      "EARLY_SETUP_AT_CUTOFF",
    ],
    reasonCodes: ["sell_flow_leads_flat_price"],
    observations: [
      { semanticKey: "aggressive_sell_flow_ratio", value: 0.67, unit: "ratio" },
      { semanticKey: "price_response_ratio", value: -0.002, unit: "ratio" },
      { semanticKey: "move_consumed_ratio", value: 0.1, unit: "ratio" },
    ],
  },
  {
    caseId: "pre-move-direction-unresolved-liquidity-shift",
    opportunityFamily: "PRE_MOVE",
    opportunityPattern: "PRE_MOVE_LIQUIDITY_SHIFT",
    directionHypothesis: "UNKNOWN",
    expectedDisposition: "DISCOVER",
    pointInTimeFlags: [
      "DISCOVERY_ELIGIBLE_AT_CUTOFF",
      "EARLY_SETUP_AT_CUTOFF",
      "DIRECTION_UNRESOLVED_AT_CUTOFF",
    ],
    reasonCodes: ["liquidity_state_changed_before_direction_confirmation"],
    observations: [
      { semanticKey: "spread_contraction_ratio", value: 0.42, unit: "ratio" },
      { semanticKey: "depth_expansion_ratio", value: 1.6, unit: "multiple" },
      { semanticKey: "directional_flow_balance", value: 0.5, unit: "ratio" },
    ],
  },
  {
    caseId: "pre-move-thin-liquidity-counterexample",
    opportunityFamily: "PRE_MOVE",
    opportunityPattern: "PRE_MOVE_LIQUIDITY_SHIFT",
    directionHypothesis: "LONG",
    expectedDisposition: "NO_CANDIDATE",
    pointInTimeFlags: ["NOISE_RISK_AT_CUTOFF", "COUNTEREXAMPLE_AT_CUTOFF"],
    reasonCodes: ["single_source_spike_in_thin_liquidity"],
    observations: [
      { semanticKey: "volume_spike_multiple", value: 5.2, unit: "multiple" },
      { semanticKey: "quoted_depth_usdt", value: "800", unit: "USDT" },
      { semanticKey: "venue_confirmation_count", value: 1, unit: "count" },
    ],
  },
  {
    caseId: "breakout-retest-long-edge",
    opportunityFamily: "BREAKOUT_RETEST",
    opportunityPattern: "BREAKOUT_EDGE",
    directionHypothesis: "LONG",
    expectedDisposition: "DISCOVER",
    pointInTimeFlags: ["DISCOVERY_ELIGIBLE_AT_CUTOFF"],
    reasonCodes: ["resistance_break_with_participation"],
    observations: [
      { semanticKey: "close_above_resistance", value: true, unit: "boolean" },
      { semanticKey: "breakout_volume_multiple", value: 1.7, unit: "multiple" },
      { semanticKey: "distance_above_level_bps", value: 18, unit: "bps" },
    ],
  },
  {
    caseId: "breakout-retest-short-role-flip",
    opportunityFamily: "BREAKOUT_RETEST",
    opportunityPattern: "ROLE_FLIP_RETEST",
    directionHypothesis: "SHORT",
    expectedDisposition: "DISCOVER",
    pointInTimeFlags: ["DISCOVERY_ELIGIBLE_AT_CUTOFF"],
    reasonCodes: ["lost_support_rejected_as_resistance"],
    observations: [
      { semanticKey: "close_below_support", value: true, unit: "boolean" },
      { semanticKey: "retest_rejection_strength", value: 0.74, unit: "ratio" },
      { semanticKey: "sell_participation_multiple", value: 1.5, unit: "multiple" },
    ],
  },
  {
    caseId: "breakout-returned-inside-counterexample",
    opportunityFamily: "BREAKOUT_RETEST",
    opportunityPattern: "BREAKOUT_EDGE",
    directionHypothesis: "LONG",
    expectedDisposition: "NO_CANDIDATE",
    pointInTimeFlags: ["FAKEOUT_RISK_AT_CUTOFF", "COUNTEREXAMPLE_AT_CUTOFF"],
    reasonCodes: ["closed_back_inside_structure_at_cutoff"],
    observations: [
      { semanticKey: "intrabar_breakout_seen", value: true, unit: "boolean" },
      { semanticKey: "closed_back_inside_range", value: true, unit: "boolean" },
      { semanticKey: "breakout_volume_multiple", value: 0.7, unit: "multiple" },
    ],
  },
  {
    caseId: "trend-continuation-long-pullback",
    opportunityFamily: "TREND_CONTINUATION",
    opportunityPattern: "STRUCTURAL_PULLBACK_RESUMPTION",
    directionHypothesis: "LONG",
    expectedDisposition: "DISCOVER",
    pointInTimeFlags: ["DISCOVERY_ELIGIBLE_AT_CUTOFF"],
    reasonCodes: ["higher_low_holds_and_momentum_recovers"],
    observations: [
      { semanticKey: "higher_timeframe_structure", value: "HH_HL", unit: "state" },
      { semanticKey: "pullback_support_hold", value: true, unit: "boolean" },
      { semanticKey: "momentum_recovery_ratio", value: 1.3, unit: "multiple" },
    ],
  },
  {
    caseId: "trend-continuation-short-compression",
    opportunityFamily: "TREND_CONTINUATION",
    opportunityPattern: "TREND_COMPRESSION",
    directionHypothesis: "SHORT",
    expectedDisposition: "DISCOVER",
    pointInTimeFlags: ["DISCOVERY_ELIGIBLE_AT_CUTOFF"],
    reasonCodes: ["lower_high_compression_in_downtrend"],
    observations: [
      { semanticKey: "higher_timeframe_structure", value: "LL_LH", unit: "state" },
      { semanticKey: "compression_below_resistance", value: true, unit: "boolean" },
      { semanticKey: "sell_momentum_recovery_ratio", value: 1.25, unit: "multiple" },
    ],
  },
  {
    caseId: "trend-continuation-late-counterexample",
    opportunityFamily: "TREND_CONTINUATION",
    opportunityPattern: "TREND_COMPRESSION",
    directionHypothesis: "LONG",
    expectedDisposition: "NO_CANDIDATE",
    pointInTimeFlags: ["LATE_AT_CUTOFF", "COUNTEREXAMPLE_AT_CUTOFF"],
    reasonCodes: ["continuation_move_already_consumed"],
    observations: [
      { semanticKey: "trend_extension_atr", value: 4.8, unit: "ATR" },
      { semanticKey: "move_consumed_ratio", value: 0.72, unit: "ratio" },
      { semanticKey: "momentum_slope", value: -0.4, unit: "normalized" },
    ],
  },
  {
    caseId: "reversal-range-long-key-level",
    opportunityFamily: "REVERSAL_RANGE",
    opportunityPattern: "KEY_LEVEL_REVERSAL",
    directionHypothesis: "LONG",
    expectedDisposition: "DISCOVER",
    pointInTimeFlags: ["DISCOVERY_ELIGIBLE_AT_CUTOFF"],
    reasonCodes: ["support_sweep_reclaimed_at_cutoff"],
    observations: [
      { semanticKey: "support_liquidity_sweep", value: true, unit: "boolean" },
      { semanticKey: "close_reclaimed_support", value: true, unit: "boolean" },
      { semanticKey: "buy_absorption_ratio", value: 0.71, unit: "ratio" },
    ],
  },
  {
    caseId: "reversal-range-short-range-edge",
    opportunityFamily: "REVERSAL_RANGE",
    opportunityPattern: "RANGE_EDGE",
    directionHypothesis: "SHORT",
    expectedDisposition: "DISCOVER",
    pointInTimeFlags: ["DISCOVERY_ELIGIBLE_AT_CUTOFF"],
    reasonCodes: ["range_high_rejection_with_absorption"],
    observations: [
      { semanticKey: "distance_to_range_high_bps", value: 9, unit: "bps" },
      { semanticKey: "range_high_rejection", value: true, unit: "boolean" },
      { semanticKey: "sell_absorption_ratio", value: 0.68, unit: "ratio" },
    ],
  },
  {
    caseId: "reversal-without-confirmation-counterexample",
    opportunityFamily: "REVERSAL_RANGE",
    opportunityPattern: "KEY_LEVEL_REVERSAL",
    directionHypothesis: "LONG",
    expectedDisposition: "NO_CANDIDATE",
    pointInTimeFlags: ["NOISE_RISK_AT_CUTOFF", "COUNTEREXAMPLE_AT_CUTOFF"],
    reasonCodes: ["countertrend_touch_without_reclaim"],
    observations: [
      { semanticKey: "support_touch", value: true, unit: "boolean" },
      { semanticKey: "support_reclaim", value: false, unit: "boolean" },
      { semanticKey: "trend_alignment", value: "STRONG_DOWN", unit: "state" },
    ],
  },
  {
    caseId: "relative-strength-long-persistent",
    opportunityFamily: "RELATIVE_STRENGTH",
    opportunityPattern: "RELATIVE_STRENGTH",
    directionHypothesis: "LONG",
    expectedDisposition: "DISCOVER",
    pointInTimeFlags: ["DISCOVERY_ELIGIBLE_AT_CUTOFF"],
    reasonCodes: ["benchmark_adjusted_strength_persists"],
    observations: [
      { semanticKey: "btc_adjusted_return_4h", value: 0.045, unit: "ratio" },
      { semanticKey: "peer_percentile_4h", value: 0.94, unit: "ratio" },
      { semanticKey: "relative_strength_persistence", value: 4, unit: "windows" },
    ],
  },
  {
    caseId: "relative-strength-short-persistent-weakness",
    opportunityFamily: "RELATIVE_STRENGTH",
    opportunityPattern: "RELATIVE_WEAKNESS",
    directionHypothesis: "SHORT",
    expectedDisposition: "DISCOVER",
    pointInTimeFlags: ["DISCOVERY_ELIGIBLE_AT_CUTOFF"],
    reasonCodes: ["benchmark_adjusted_weakness_persists"],
    observations: [
      { semanticKey: "eth_adjusted_return_4h", value: -0.052, unit: "ratio" },
      { semanticKey: "peer_percentile_4h", value: 0.04, unit: "ratio" },
      { semanticKey: "relative_weakness_persistence", value: 5, unit: "windows" },
    ],
  },
  {
    caseId: "relative-strength-low-turnover-counterexample",
    opportunityFamily: "RELATIVE_STRENGTH",
    opportunityPattern: "RELATIVE_STRENGTH",
    directionHypothesis: "LONG",
    expectedDisposition: "NO_CANDIDATE",
    pointInTimeFlags: ["NOISE_RISK_AT_CUTOFF", "COUNTEREXAMPLE_AT_CUTOFF"],
    reasonCodes: ["relative_outperformance_is_low_turnover_distortion"],
    observations: [
      { semanticKey: "btc_adjusted_return_4h", value: 0.08, unit: "ratio" },
      { semanticKey: "turnover_percentile", value: 0.01, unit: "ratio" },
      { semanticKey: "venue_confirmation_count", value: 1, unit: "count" },
    ],
  },
  {
    caseId: "derivatives-flow-long-price-oi-divergence",
    opportunityFamily: "DERIVATIVES_FLOW",
    opportunityPattern: "PRICE_OI_DIVERGENCE",
    directionHypothesis: "LONG",
    expectedDisposition: "DISCOVER",
    pointInTimeFlags: ["DISCOVERY_ELIGIBLE_AT_CUTOFF"],
    reasonCodes: ["positioning_builds_with_positive_spot_flow"],
    observations: [
      { semanticKey: "open_interest_change_15m", value: 0.09, unit: "ratio" },
      { semanticKey: "price_change_15m", value: 0.004, unit: "ratio" },
      { semanticKey: "spot_taker_buy_ratio", value: 0.64, unit: "ratio" },
    ],
  },
  {
    caseId: "derivatives-flow-short-crowding-release",
    opportunityFamily: "DERIVATIVES_FLOW",
    opportunityPattern: "CROWDING_RELEASE",
    directionHypothesis: "SHORT",
    expectedDisposition: "DISCOVER",
    pointInTimeFlags: ["DISCOVERY_ELIGIBLE_AT_CUTOFF"],
    reasonCodes: ["crowded_longs_unwind_with_sell_flow"],
    observations: [
      { semanticKey: "funding_percentile", value: 0.97, unit: "ratio" },
      { semanticKey: "open_interest_change_5m", value: -0.08, unit: "ratio" },
      { semanticKey: "aggressive_sell_ratio", value: 0.69, unit: "ratio" },
    ],
  },
  {
    caseId: "derivatives-flow-capability-unavailable",
    opportunityFamily: "DERIVATIVES_FLOW",
    opportunityPattern: "FUNDING_BASIS_DISLOCATION",
    directionHypothesis: "LONG",
    expectedDisposition: "DATA_UNAVAILABLE",
    pointInTimeFlags: ["DATA_UNAVAILABLE_AT_CUTOFF", "COUNTEREXAMPLE_AT_CUTOFF"],
    reasonCodes: ["required_derivatives_capability_unavailable"],
    observations: [
      {
        semanticKey: "funding_rate",
        value: null,
        unit: "ratio",
        quality: unavailableQuality,
      },
      {
        semanticKey: "basis_rate",
        value: null,
        unit: "ratio",
        quality: unavailableQuality,
      },
    ],
  },
] as const satisfies readonly GoldenSeed[];

function buildFixtureCase(seed: GoldenSeed) {
  const featureIds = seed.observations.map(
    (observation) => `feature:${seed.caseId}:${observation.semanticKey}`,
  );
  const instrumentId = `fixture:${seed.caseId}:USDT_PERPETUAL`;
  const groupId = `fixture-group:${seed.caseId}`;
  const partial = seed.expectedDisposition === "DATA_UNAVAILABLE";
  return {
    caseId: seed.caseId,
    opportunityFamily: seed.opportunityFamily,
    opportunityPattern: seed.opportunityPattern,
    directionHypothesis: seed.directionHypothesis,
    sourceCutoff: CUTOFF,
    detectorInput: {
      schemaVersion: M2_DETECTOR_INPUT_VERSION,
      readAuthority: "POINT_IN_TIME_REFERENCES_ONLY",
      releaseId: RELEASE_ID,
      canonicalInstrumentId: instrumentId,
      underlyingGroupId: groupId,
      eventCutoff: CUTOFF,
      knowledgeCutoff: CUTOFF,
      universe: {
        artifactId: `universe:${seed.caseId}`,
        releaseId: RELEASE_ID,
        sourceCutoff: CUTOFF,
        availableAt: CUTOFF,
        eligible: true,
      },
      featureSet: {
        artifactId: `feature-set:${seed.caseId}`,
        releaseId: RELEASE_ID,
        sourceCutoff: CUTOFF,
        availableAt: CUTOFF,
        featureIds,
      },
      featureQuality: {
        artifactId: `feature-quality:${seed.caseId}`,
        releaseId: RELEASE_ID,
        sourceCutoff: CUTOFF,
        availableAt: CUTOFF,
      },
      marketContext: {
        artifactId: `market-context:${seed.caseId}`,
        releaseId: RELEASE_ID,
        sourceCutoff: CUTOFF,
        availableAt: CUTOFF,
      },
      observedPrice: {
        artifactId: `price-fact:${seed.caseId}`,
        releaseId: RELEASE_ID,
        sourceCutoff: CUTOFF,
        availableAt: CUTOFF,
        value: "100",
      },
      inputQuality: partial
        ? {
          status: "PARTIAL",
          ageMs: 0,
          reasonCodes: ["family_required_capability_unavailable"],
        }
        : freshQuality,
    },
    observations: seed.observations.map((observation, index) => ({
      observationId: `observation:${seed.caseId}:${index + 1}`,
      semanticKey: observation.semanticKey,
      value: observation.value,
      unit: observation.unit,
      observedAt: OBSERVED_AT,
      sourceReferenceId: featureIds[index]!,
      quality: observation.quality ?? freshQuality,
    })),
    expectedDisposition: seed.expectedDisposition,
    pointInTimeFlags: seed.pointInTimeFlags,
    reasonCodes: seed.reasonCodes,
  };
}

export const M2_DISCOVERY_GOLDEN_FIXTURES: M2DiscoveryGoldenFixture =
  parseM2DiscoveryGoldenFixture({
    schemaVersion: M2_DISCOVERY_GOLDEN_FIXTURE_VERSION,
    fixtureScope: "TEST_ONLY_POINT_IN_TIME",
    runtimeImportAllowed: false,
    cases: seeds.map(buildFixtureCase),
  });
