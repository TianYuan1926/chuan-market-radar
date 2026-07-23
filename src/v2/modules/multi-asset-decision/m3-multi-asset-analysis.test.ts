import assert from "node:assert/strict";
import test from "node:test";
import {
  M3_MULTI_ASSET_DECISION_AUTHORITY,
  M3_MULTI_ASSET_PATTERNS_BY_FAMILY,
  M3MultiAssetScopeBindingSchema,
  isM3MultiAssetFamilyAllowedForLane,
  isM3MultiAssetOpportunityPatternForFamily,
} from "./m3-multi-asset-decision-contract";
import { analyzeM3MultiAssetOpportunity } from "./m3-multi-asset-analysis";
import {
  M3_MULTI_ASSET_LANE_FIXTURES,
  buildM3MultiAssetAnalysisFixture,
} from "./testing/m3-multi-asset-fixtures";

test("all four decision lanes form isolated research-only analyses", () => {
  for (const config of M3_MULTI_ASSET_LANE_FIXTURES) {
    const fixture = buildM3MultiAssetAnalysisFixture(config);
    assert.equal(fixture.result.status, "ANALYZED_RESEARCH_ONLY");
    assert.deepEqual(fixture.analysis.blockers, []);
    assert.equal(fixture.analysis.binding.decisionLane, config.decisionLane);
    assert.equal(fixture.analysis.binding.venue, config.venue);
    assert.equal(fixture.analysis.binding.assetDomain, config.assetDomain);
    assert.equal(
      fixture.analysis.binding.lifecycleState,
      config.lifecycleState,
    );
    assert.equal(fixture.analysis.directionBias, config.direction);
    assert.equal(fixture.analysis.authority, M3_MULTI_ASSET_DECISION_AUTHORITY);
    assert.equal(fixture.analysis.promotionEligible, false);
    assert.equal(fixture.analysis.signalLevel, null);
    assert.equal(fixture.analysis.strategyAuthority, false);
    assert.equal(fixture.analysis.readyAuthority, false);
  }
});

test("lane contracts reject excluded domains and lifecycle states", () => {
  const base = buildM3MultiAssetAnalysisFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[0],
  );
  for (const [assetDomain, lifecycleState] of [
    ["EQUITY_CFD", "ESTABLISHED"],
    ["OTHER_RWA_DERIVATIVE", "ESTABLISHED"],
    ["ASSET_LISTING_WATCH", "ANNOUNCED_WAITING_CATALOG"],
    ["CROSS_MARKET_CONTEXT", "ESTABLISHED"],
    ["CRYPTO_LINEAR_PERPETUAL", "PRE_LAUNCH_OR_PREOPEN"],
    ["CRYPTO_LINEAR_PERPETUAL", "MAINTENANCE"],
    ["CRYPTO_LINEAR_PERPETUAL", "SUSPENDED"],
    ["CRYPTO_LINEAR_PERPETUAL", "DELISTING"],
  ] as const) {
    const parsed = M3MultiAssetScopeBindingSchema.safeParse({
      ...base.binding,
      assetDomain,
      lifecycleState,
    });
    assert.equal(parsed.success, false, `${assetDomain}:${lifecycleState}`);
  }
});

test("new opportunity families and patterns are lane sealed", () => {
  assert.deepEqual(
    M3_MULTI_ASSET_PATTERNS_BY_FAMILY.LISTING_AND_VENUE_EVENT,
    [
      "LISTING_ANNOUNCEMENT",
      "ASSET_OR_SPOT_LISTING_WITHOUT_CONTRACT",
      "PRE_LAUNCH_TRANSITION",
      "TRADING_WARMUP",
      "VENUE_RULE_CHANGE",
      "DELISTING_OR_SUSPENSION",
      "TRADING_RESUMPTION",
    ],
  );
  assert.deepEqual(
    M3_MULTI_ASSET_PATTERNS_BY_FAMILY.EQUITY_EVENT_AND_BASIS,
    [
      "EARNINGS_OR_CORPORATE_ACTION",
      "TRADITIONAL_SESSION_TRANSITION",
      "OFF_HOURS_BASIS_DISLOCATION",
      "REFERENCE_PRICE_DIVERGENCE",
      "EQUITY_LIQUIDITY_SHIFT",
    ],
  );
  assert.equal(
    isM3MultiAssetFamilyAllowedForLane(
      "CRYPTO_LISTING_WARMUP",
      "LISTING_AND_VENUE_EVENT",
    ),
    true,
  );
  assert.equal(
    isM3MultiAssetFamilyAllowedForLane(
      "FOUR_VENUE_ESTABLISHED_CRYPTO",
      "LISTING_AND_VENUE_EVENT",
    ),
    false,
  );
  assert.equal(
    isM3MultiAssetFamilyAllowedForLane(
      "SINGLE_NAME_EQUITY_ESTABLISHED",
      "EQUITY_EVENT_AND_BASIS",
    ),
    true,
  );
  assert.equal(
    isM3MultiAssetOpportunityPatternForFamily(
      "LISTING_AND_VENUE_EVENT",
      "TRADING_WARMUP",
    ),
    true,
  );
  assert.equal(
    isM3MultiAssetOpportunityPatternForFamily(
      "EQUITY_EVENT_AND_BASIS",
      "TRADING_WARMUP",
    ),
    false,
  );
});

test("evidence cannot be borrowed across venues", () => {
  const fixture = buildM3MultiAssetAnalysisFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[0],
  );
  const input = {
    ...fixture.input,
    observations: fixture.input.observations.map((observation, index) =>
      index === 0
        ? {
          ...observation,
          evidence: {
            ...observation.evidence,
            venue: "OKX_SWAP" as const,
          },
        }
        : observation
    ),
  };
  const result = analyzeM3MultiAssetOpportunity(input);
  assert.equal(result.status, "ABSTAINED_RESEARCH_ONLY");
  assert.ok(result.issues.some((issue) =>
    issue.code === "multi_asset_evidence_binding_mismatch"
  ));
  assert.ok(result.reasonCodes.includes(
    "multi_asset_analysis_integrity_failed",
  ));
});

test("non-directional prerequisites cannot vote LONG or SHORT", () => {
  const fixture = buildM3MultiAssetAnalysisFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[2],
  );
  const input = {
    ...fixture.input,
    observations: fixture.input.observations.map((observation) =>
      observation.category === "IDENTITY"
        ? { ...observation, direction: "LONG" as const }
        : observation
    ),
  };
  const result = analyzeM3MultiAssetOpportunity(input);
  assert.equal(result.status, "BLOCKED_INVALID_INPUT");
  assert.equal(result.analysis, null);
});

test("future evidence is retained as an explicit integrity abstention", () => {
  const fixture = buildM3MultiAssetAnalysisFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[1],
  );
  const input = {
    ...fixture.input,
    observations: fixture.input.observations.map((observation, index) =>
      index === 0
        ? {
          ...observation,
          evidence: {
            ...observation.evidence,
            sourceCutoff: "2026-07-01T00:00:30.000Z",
            availableAt: "2026-07-01T00:00:35.000Z",
          },
        }
        : observation
    ),
  };
  const result = analyzeM3MultiAssetOpportunity(input);
  assert.equal(result.status, "ABSTAINED_RESEARCH_ONLY");
  assert.ok(result.issues.some((issue) =>
    issue.code === "multi_asset_evidence_not_available_at_cutoff"
  ));
});

test("equity session, corporate action, FX and basis gaps each abstain", () => {
  const fixture = buildM3MultiAssetAnalysisFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[2],
  );
  for (const category of [
    "TRADITIONAL_MARKET_SESSION",
    "CORPORATE_ACTION",
    "FX_REFERENCE",
    "CLOSED_SESSION_BASIS",
  ] as const) {
    const result = analyzeM3MultiAssetOpportunity({
      ...fixture.input,
      observations: fixture.input.observations.filter(
        (observation) => observation.category !== category,
      ),
    });
    assert.equal(result.status, "ABSTAINED_RESEARCH_ONLY");
    assert.ok(result.reasonCodes.includes(
      `missing_domain_analysis_category:${category.toLowerCase()}`,
    ));
  }
});

test("a hard prerequisite contradiction cannot be hidden by support", () => {
  const fixture = buildM3MultiAssetAnalysisFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[2],
  );
  const identity = fixture.input.observations.find((observation) =>
    observation.category === "IDENTITY"
  );
  assert.ok(identity);
  const input = {
    ...fixture.input,
    observations: [
      ...fixture.input.observations,
      {
        ...identity,
        observationId: `${identity.observationId}:counter`,
        stance: "CONTRADICTING" as const,
        evidence: {
          ...identity.evidence,
          evidenceId: `${identity.evidence.evidenceId}:counter`,
          digest:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        reasonCodes: ["fixture_identity_counterevidence"],
      },
    ],
  };
  const result = analyzeM3MultiAssetOpportunity(input);
  assert.equal(result.status, "ABSTAINED_RESEARCH_ONLY");
  assert.ok(result.reasonCodes.includes(
    "contradicting_domain_prerequisite:identity",
  ));
});

test("structural levels cannot cite irrelevant prerequisite evidence", () => {
  const fixture = buildM3MultiAssetAnalysisFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[0],
  );
  const identityEvidence = fixture.input.observations.find((observation) =>
    observation.category === "IDENTITY"
  )?.evidence.evidenceId;
  assert.ok(identityEvidence);
  const input = {
    ...fixture.input,
    structuralLevels: fixture.input.structuralLevels.map((level, index) =>
      index === 0
        ? { ...level, evidenceIds: [identityEvidence] }
        : level
    ),
  };
  const result = analyzeM3MultiAssetOpportunity(input);
  assert.equal(result.status, "ABSTAINED_RESEARCH_ONLY");
  assert.ok(result.issues.some((issue) =>
    issue.code === "structural_level_evidence_invalid"
  ));
});

test("family-pattern mismatch fails closed without producing authority", () => {
  const fixture = buildM3MultiAssetAnalysisFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[0],
  );
  const input = {
    ...fixture.input,
    opportunity: {
      ...fixture.input.opportunity,
      opportunityPatterns: ["ROLE_FLIP_RETEST" as const],
    },
  };
  const result = analyzeM3MultiAssetOpportunity(input);
  assert.equal(result.status, "ABSTAINED_RESEARCH_ONLY");
  assert.ok(result.issues.some((issue) =>
    issue.code === "opportunity_pattern_family_mismatch"
  ));
  assert.equal(result.analysis?.strategyAuthority, false);
});
