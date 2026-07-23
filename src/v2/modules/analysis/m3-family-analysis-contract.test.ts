import assert from "node:assert/strict";
import test from "node:test";
import type {
  DirectionHypothesis,
  QualityAssessment,
} from "../../domain/contracts";
import type {
  OpportunityFamily,
  OpportunityPattern,
} from "../../domain/product-constitution";
import {
  analyzeM3FamilyEvidence,
  M3FamilyAnalysisInputSchema,
  M3_FAMILY_ANALYSIS_INPUT_VERSION,
  M3_FAMILY_ANALYSIS_MODE,
  M3_FAMILY_ANALYSIS_OBSERVATION_DEFINITIONS,
  M3_FAMILY_ANALYSIS_POLICY_VERSION,
  type M3FamilyAnalysisInput,
  type M3FamilyAnalysisObservationCode,
} from "./m3-family-analysis-contract";

const RELEASE = "release-m3-family-analysis";
const CUTOFF = "2026-01-15T00:00:10.000Z";
const DETECTED = "2026-01-15T00:00:11.000Z";
const THESIS_AT = "2026-01-15T00:00:12.000Z";
const CONTEXT_AT = "2026-01-15T00:00:13.000Z";
const EVIDENCE_AT = "2026-01-15T00:00:14.000Z";
const ANALYSIS_AT = "2026-01-15T00:00:20.000Z";

const fresh = {
  status: "FRESH",
  ageMs: 0,
  reasonCodes: [],
} as const satisfies QualityAssessment;

const uncertainty = {
  data: {
    dimension: "data",
    status: "LOW",
    reasonCodes: [],
    sampleSize: 100,
    calibrationVersion: "fixture-calibration.v1",
    lastValidatedAt: CUTOFF,
  },
  model: {
    dimension: "model",
    status: "LOW",
    reasonCodes: [],
    sampleSize: 100,
    calibrationVersion: "fixture-calibration.v1",
    lastValidatedAt: CUTOFF,
  },
  market: {
    dimension: "market",
    status: "MEDIUM",
    reasonCodes: ["fixture_market_uncertainty"],
    sampleSize: 100,
    calibrationVersion: "fixture-calibration.v1",
    lastValidatedAt: CUTOFF,
  },
  execution: {
    dimension: "execution",
    status: "UNKNOWN",
    reasonCodes: ["execution_not_evaluated"],
    sampleSize: null,
    calibrationVersion: null,
    lastValidatedAt: null,
  },
} as const;

type FamilyCase = Readonly<{
  family: OpportunityFamily;
  pattern: OpportunityPattern;
  direction: DirectionHypothesis;
  codes: readonly M3FamilyAnalysisObservationCode[];
  expectedStructure: string;
}>;

const FAMILY_CASES = [
  {
    family: "PRE_MOVE",
    pattern: "PRE_MOVE_COMPRESSION",
    direction: "LONG",
    codes: [
      "PRE_MOVE_COMPRESSION_PRESENT",
      "PRE_MOVE_FLOW_LEADS_LONG",
      "TIMING_EARLY_OR_NOT_CONSUMED",
      "LOCATION_STRUCTURAL_GOOD",
      "SPACE_STRUCTURAL_GOOD",
      "CROSS_VENUE_CONFIRMED",
    ],
    expectedStructure: "COMPRESSION_WITH_DIRECTIONAL_PRESSURE",
  },
  {
    family: "BREAKOUT_RETEST",
    pattern: "ROLE_FLIP_RETEST",
    direction: "LONG",
    codes: [
      "BREAKOUT_ROLE_FLIP_LONG",
      "BREAKOUT_PARTICIPATION_CONFIRMED",
      "LOCATION_STRUCTURAL_GOOD",
      "SPACE_STRUCTURAL_GOOD",
      "CROSS_VENUE_CONFIRMED",
    ],
    expectedStructure: "ROLE_FLIP_RETEST_HOLD",
  },
  {
    family: "TREND_CONTINUATION",
    pattern: "STRUCTURAL_PULLBACK_RESUMPTION",
    direction: "LONG",
    codes: [
      "TREND_UP_STRUCTURE_INTACT",
      "TREND_PULLBACK_LONG_HOLDS",
      "TREND_MOMENTUM_RESUMES",
      "TIMING_EARLY_OR_NOT_CONSUMED",
      "LOCATION_STRUCTURAL_GOOD",
      "SPACE_STRUCTURAL_GOOD",
      "CROSS_VENUE_CONFIRMED",
    ],
    expectedStructure: "STRUCTURAL_PULLBACK_HOLD",
  },
  {
    family: "REVERSAL_RANGE",
    pattern: "KEY_LEVEL_REVERSAL",
    direction: "LONG",
    codes: [
      "REVERSAL_SUPPORT_SWEEP_RECLAIMED",
      "REVERSAL_RANGE_LOW_REACTION",
      "PARTICIPATION_CONFIRMED",
      "LOCATION_STRUCTURAL_GOOD",
      "SPACE_STRUCTURAL_GOOD",
      "CROSS_VENUE_CONFIRMED",
    ],
    expectedStructure: "LIQUIDITY_SWEEP_RECLAIM_OR_REJECTION",
  },
  {
    family: "RELATIVE_STRENGTH",
    pattern: "RELATIVE_STRENGTH",
    direction: "LONG",
    codes: [
      "RELATIVE_BENCHMARK_STRENGTH",
      "RELATIVE_PEER_PERSISTENCE",
      "PARTICIPATION_CONFIRMED",
      "LOCATION_STRUCTURAL_GOOD",
      "SPACE_STRUCTURAL_GOOD",
      "CROSS_VENUE_CONFIRMED",
    ],
    expectedStructure: "BENCHMARK_ADJUSTED_DIVERGENCE",
  },
  {
    family: "DERIVATIVES_FLOW",
    pattern: "PRICE_OI_DIVERGENCE",
    direction: "LONG",
    codes: [
      "DERIVATIVES_BULLISH_PRICE_OI_DIVERGENCE",
      "STRUCTURE_CONTEXT_CONFIRMED",
      "TIMING_EARLY_OR_NOT_CONSUMED",
      "LOCATION_STRUCTURAL_GOOD",
      "SPACE_STRUCTURAL_GOOD",
      "CROSS_VENUE_CONFIRMED",
    ],
    expectedStructure: "PRICE_POSITIONING_DIVERGENCE",
  },
] as const satisfies readonly FamilyCase[];

const SHORT_FAMILY_CASES = [
  {
    ...FAMILY_CASES[0],
    direction: "SHORT",
    codes: [
      "PRE_MOVE_COMPRESSION_PRESENT",
      "PRE_MOVE_FLOW_LEADS_SHORT",
      "TIMING_EARLY_OR_NOT_CONSUMED",
      "LOCATION_STRUCTURAL_GOOD",
      "SPACE_STRUCTURAL_GOOD",
    ],
  },
  {
    ...FAMILY_CASES[1],
    direction: "SHORT",
    codes: [
      "BREAKOUT_ROLE_FLIP_SHORT",
      "BREAKOUT_PARTICIPATION_CONFIRMED",
      "LOCATION_STRUCTURAL_GOOD",
      "SPACE_STRUCTURAL_GOOD",
    ],
  },
  {
    ...FAMILY_CASES[2],
    direction: "SHORT",
    codes: [
      "TREND_DOWN_STRUCTURE_INTACT",
      "TREND_PULLBACK_SHORT_HOLDS",
      "TREND_MOMENTUM_RESUMES",
      "LOCATION_STRUCTURAL_GOOD",
      "SPACE_STRUCTURAL_GOOD",
    ],
  },
  {
    ...FAMILY_CASES[3],
    direction: "SHORT",
    codes: [
      "REVERSAL_RESISTANCE_SWEEP_REJECTED",
      "REVERSAL_RANGE_HIGH_REACTION",
      "PARTICIPATION_CONFIRMED",
      "LOCATION_STRUCTURAL_GOOD",
      "SPACE_STRUCTURAL_GOOD",
    ],
  },
  {
    ...FAMILY_CASES[4],
    direction: "SHORT",
    pattern: "RELATIVE_WEAKNESS",
    codes: [
      "RELATIVE_BENCHMARK_WEAKNESS",
      "RELATIVE_PEER_PERSISTENCE",
      "PARTICIPATION_CONFIRMED",
      "LOCATION_STRUCTURAL_GOOD",
      "SPACE_STRUCTURAL_GOOD",
    ],
  },
  {
    ...FAMILY_CASES[5],
    direction: "SHORT",
    codes: [
      "DERIVATIVES_BEARISH_PRICE_OI_DIVERGENCE",
      "STRUCTURE_CONTEXT_CONFIRMED",
      "TIMING_EARLY_OR_NOT_CONSUMED",
      "LOCATION_STRUCTURAL_GOOD",
      "SPACE_STRUCTURAL_GOOD",
    ],
  },
] as const satisfies readonly FamilyCase[];

function fixture(familyCase: FamilyCase): M3FamilyAnalysisInput {
  const slug = familyCase.family.toLowerCase();
  const episodeId = `episode:${slug}`;
  const thesisId = `thesis:${slug}`;
  const evidencePackageId = `evidence-package:${slug}`;
  const evidenceItems = familyCase.codes.map((code, index) => {
    const definition = M3_FAMILY_ANALYSIS_OBSERVATION_DEFINITIONS[code];
    return {
      evidenceId: `evidence:${slug}:${index + 1}`,
      category: definition.category,
      stance: definition.stance,
      criticality: "REQUIRED" as const,
      factIds: definition.stance === "MISSING" ? [] : [`fact:${slug}:${index + 1}`],
      featureIds: [],
      independenceGroupIds: definition.stance === "MISSING"
        ? []
        : [`source-group:${slug}:${index + 1}`],
      observedAt: CUTOFF,
      quality: definition.stance === "MISSING"
        ? {
          status: "UNAVAILABLE" as const,
          ageMs: null,
          reasonCodes: ["fixture_required_evidence_missing"],
        }
        : fresh,
      reasonCodes: [`m3_observation:${code.toLowerCase()}`],
    };
  });
  const firstFreshFact = evidenceItems.flatMap((item) => item.factIds)[0];
  if (firstFreshFact === undefined) {
    throw new Error("fixture requires one fresh fact");
  }
  return M3FamilyAnalysisInputSchema.parse({
    schemaVersion: M3_FAMILY_ANALYSIS_INPUT_VERSION,
    executionMode: M3_FAMILY_ANALYSIS_MODE,
    policyVersion: M3_FAMILY_ANALYSIS_POLICY_VERSION,
    releaseId: RELEASE,
    generatedAt: ANALYSIS_AT,
    sourceCutoff: CUTOFF,
    thesis: {
      schemaVersion: "opportunity-thesis.v2",
      releaseId: RELEASE,
      producerModule: "candidate_lifecycle_opportunity_thesis",
      generatedAt: THESIS_AT,
      sourceCutoff: CUTOFF,
      contentHash: `sha256:thesis-${slug}`,
      thesisId,
      episodeId,
      thesisVersion: 1,
      thesisAuthority: "VALIDATION_HYPOTHESIS_ONLY",
      canonicalInstrumentId: `BINANCE_FUTURES:${slug.toUpperCase()}USDT:LINEAR_PERPETUAL:USDT`,
      underlyingGroupId: `${slug.toUpperCase()}:USDT_LINEAR_PERPETUAL`,
      opportunityFamily: familyCase.family,
      opportunityPatterns: [familyCase.pattern],
      directionHypothesis: familyCase.direction,
      detectorSources: [{
        candidateId: `candidate:${slug}`,
        detectorId: `detector:${slug}`,
        detectorVersion: `detector:${slug}.v1`,
        detectorLifecycle: "REPLAY_VALIDATED",
        emissionScope: "REPLAY",
        opportunityPattern: familyCase.pattern,
        firstDetectedAt: DETECTED,
        candidateSourceCutoff: CUTOFF,
      }],
      firstDetectedAt: DETECTED,
      updatedAt: THESIS_AT,
      supportingReasons: [`fixture_${slug}_thesis`],
      conflictingReasons: [],
      knownUnknowns: [],
      uncertainty,
    },
    evidence: {
      schemaVersion: "evidence-package.v2",
      releaseId: RELEASE,
      producerModule: "deep_validation",
      generatedAt: EVIDENCE_AT,
      sourceCutoff: CUTOFF,
      contentHash: `sha256:evidence-${slug}`,
      evidencePackageId,
      episodeId,
      thesisId,
      items: evidenceItems,
      completenessRatio: evidenceItems.filter((item) => item.stance !== "MISSING").length /
        evidenceItems.length,
      uncertainty,
      quality: evidenceItems.some((item) => item.stance === "MISSING")
        ? {
          status: "PARTIAL",
          ageMs: 0,
          reasonCodes: ["fixture_required_evidence_missing"],
        }
        : fresh,
    },
    marketContext: {
      schemaVersion: "market-context-snapshot.v2",
      releaseId: RELEASE,
      producerModule: "market_context",
      generatedAt: CONTEXT_AT,
      sourceCutoff: CUTOFF,
      contentHash: `sha256:context-${slug}`,
      snapshotId: `market-context:${slug}`,
      universeSnapshotId: "universe:fixture",
      featureSetSnapshotId: "feature-set:fixture",
      featureQualitySnapshotId: "feature-quality:fixture",
      contextRuleVersion: "fixture-context.v1",
      regime: "TRANSITION",
      volatility: "NORMAL",
      breadth: 0.5,
      correlation: 0.4,
      liquidity: "HEALTHY",
      confidence: "MEDIUM",
      quality: fresh,
      uncertainty,
    },
    observations: familyCase.codes.map((code, index) => ({
      observationId: `analysis-observation:${slug}:${index + 1}`,
      evidenceId: evidenceItems[index]!.evidenceId,
      observationCode: code,
      observedAt: CUTOFF,
    })),
    structuralLevels: [{
      levelId: `level:${slug}:primary`,
      kind: "SUPPORT",
      price: "100",
      timeframe: "1h",
      sourceFactIds: [firstFreshFact],
      reasonCodes: ["fixture_point_in_time_structure"],
    }],
  });
}

test("builds six distinct family analyses without strategy authority", () => {
  for (const familyCase of FAMILY_CASES) {
    const result = analyzeM3FamilyEvidence(fixture(familyCase));
    assert.equal(result.status, "ANALYZED_UNCALIBRATED");
    assert.equal(result.authority, "TEST_ONLY_NO_STRATEGY_AUTHORITY");
    assert.notEqual(result.analysis, null);
    assert.equal(result.analysis?.opportunityFamily, familyCase.family);
    assert.equal(result.analysis?.directionBias, familyCase.direction);
    assert.equal(result.analysis?.structureState, familyCase.expectedStructure);
    assert.equal(result.analysis?.analysisAuthority, "TEST_ONLY_UNCALIBRATED");
    assert.equal(result.analysis?.spaceQuality, "GOOD");
    assert.equal(result.analysis?.schemaVersion, "analysis-snapshot.v3");
  }
});

test("resolves six short families from independent short evidence", () => {
  for (const familyCase of SHORT_FAMILY_CASES) {
    const result = analyzeM3FamilyEvidence(fixture(familyCase));
    assert.equal(result.status, "ANALYZED_UNCALIBRATED");
    assert.equal(result.analysis?.directionBias, "SHORT");
    assert.equal(result.analysis?.structureState, familyCase.expectedStructure);
  }
});

test("gives all six families an explicit invalidation or unavailable path", () => {
  const counterCases = [
    {
      ...FAMILY_CASES[0],
      codes: [
        "PRE_MOVE_MOVE_CONSUMED",
        "PRE_MOVE_FLOW_LEADS_LONG",
        "PRE_MOVE_COMPRESSION_PRESENT",
      ],
      expectedStructure: "EARLY_STRUCTURE_INVALIDATED",
    },
    {
      ...FAMILY_CASES[1],
      codes: [
        "BREAKOUT_RETURNED_INSIDE",
        "BREAKOUT_PARTICIPATION_CONFIRMED",
        "LOCATION_STRUCTURAL_GOOD",
      ],
      expectedStructure: "BREAKOUT_FAILED_RETURNED_INSIDE",
    },
    {
      ...FAMILY_CASES[2],
      codes: [
        "TREND_STRUCTURE_DAMAGED",
        "TREND_MOMENTUM_RESUMES",
        "TIMING_EARLY_OR_NOT_CONSUMED",
      ],
      expectedStructure: "TREND_STRUCTURE_DAMAGED",
    },
    {
      ...FAMILY_CASES[3],
      codes: [
        "REVERSAL_SWEEP_NOT_RECLAIMED",
        "PARTICIPATION_CONFIRMED",
        "LOCATION_STRUCTURAL_GOOD",
      ],
      expectedStructure: "REVERSAL_HYPOTHESIS_INVALIDATED",
    },
    {
      ...FAMILY_CASES[4],
      codes: [
        "RELATIVE_NOT_PERSISTENT",
        "RELATIVE_BENCHMARK_STRENGTH",
        "PARTICIPATION_CONFIRMED",
      ],
      expectedStructure: "RELATIVE_EDGE_DECAYED",
    },
    {
      ...FAMILY_CASES[5],
      codes: [
        "DERIVATIVES_CAPABILITY_MISSING",
        "STRUCTURE_CONTEXT_CONFIRMED",
        "TIMING_EARLY_OR_NOT_CONSUMED",
      ],
      expectedStructure: "DERIVATIVES_EVIDENCE_UNAVAILABLE",
    },
  ] as const satisfies readonly FamilyCase[];
  for (const familyCase of counterCases) {
    const result = analyzeM3FamilyEvidence(fixture(familyCase));
    assert.equal(result.status, "ANALYZED_UNCALIBRATED");
    assert.equal(result.analysis?.directionBias, "UNKNOWN");
    assert.equal(result.analysis?.structureState, familyCase.expectedStructure);
  }
});

test("accounts for every evidence item exactly once", () => {
  const input = fixture(FAMILY_CASES[1]);
  const result = analyzeM3FamilyEvidence(input);
  assert.deepEqual(
    result.analysis?.evidenceItemIds,
    input.evidence.items.map((item) => item.evidenceId).sort(),
  );
  assert.equal(result.analysis?.marketContextSnapshotId, input.marketContext.snapshotId);
});

test("keeps missing required participation uncertain instead of inventing support", () => {
  const input = fixture({
    ...FAMILY_CASES[1],
    codes: ["BREAKOUT_ROLE_FLIP_LONG", "LOCATION_STRUCTURAL_GOOD"],
  });
  const result = analyzeM3FamilyEvidence(input);
  assert.equal(result.status, "ANALYZED_UNCALIBRATED");
  assert.equal(result.analysis?.directionBias, "UNKNOWN");
  assert.equal(result.analysis?.uncertainty.data.status, "UNKNOWN");
  assert.ok(result.analysis?.counterEvidence.includes(
    "required_analysis_category_missing:participation"));
});

test("does not let stale evidence retain a directional conclusion", () => {
  const input = structuredClone(fixture(FAMILY_CASES[0]));
  input.evidence.quality = {
    status: "STALE",
    ageMs: 60_000,
    reasonCodes: ["fixture_evidence_stale"],
  };
  const result = analyzeM3FamilyEvidence(input);
  assert.equal(result.status, "ANALYZED_UNCALIBRATED");
  assert.equal(result.analysis?.directionBias, "UNKNOWN");
  assert.equal(result.analysis?.uncertainty.data.status, "UNKNOWN");
});

test("marks a returned-inside breakout as invalidated and high fakeout risk", () => {
  const input = fixture({
    ...FAMILY_CASES[1],
    codes: [
      "BREAKOUT_RETURNED_INSIDE",
      "BREAKOUT_PARTICIPATION_CONFIRMED",
      "LOCATION_STRUCTURAL_GOOD",
    ],
  });
  const result = analyzeM3FamilyEvidence(input);
  assert.equal(result.analysis?.structureState, "BREAKOUT_FAILED_RETURNED_INSIDE");
  assert.equal(result.analysis?.marketStage, "INVALIDATED");
  assert.equal(result.analysis?.directionBias, "UNKNOWN");
  assert.equal(result.analysis?.fakeoutRisk, "HIGH");
});

test("keeps conflicting long and short evidence direction unresolved", () => {
  const input = fixture({
    ...FAMILY_CASES[1],
    codes: [
      "BREAKOUT_ROLE_FLIP_LONG",
      "BREAKOUT_ROLE_FLIP_SHORT",
      "BREAKOUT_PARTICIPATION_CONFIRMED",
      "LOCATION_STRUCTURAL_GOOD",
    ],
  });
  const result = analyzeM3FamilyEvidence(input);
  assert.equal(result.status, "ANALYZED_UNCALIBRATED");
  assert.equal(result.analysis?.directionBias, "UNKNOWN");
  assert.ok(result.analysis?.counterEvidence.includes(
    "family_analysis_direction_not_confirmed"));
});

test("blocks cross-release composition", () => {
  const input = structuredClone(fixture(FAMILY_CASES[1]));
  input.evidence.releaseId = "another-release";
  const result = analyzeM3FamilyEvidence(input);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.analysis, null);
  assert.ok(result.reasonCodes.includes("cross_release_analysis_input"));
});

test("blocks evidence lineage that belongs to another thesis", () => {
  const input = structuredClone(fixture(FAMILY_CASES[1]));
  input.evidence.thesisId = "another-thesis";
  const result = analyzeM3FamilyEvidence(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("analysis_thesis_evidence_identity_mismatch"));
});

test("blocks an omitted evidence interpretation", () => {
  const input = structuredClone(fixture(FAMILY_CASES[1]));
  input.observations.pop();
  const result = analyzeM3FamilyEvidence(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("evidence_interpretation_coverage_mismatch"));
});

test("blocks observation codes borrowed from another opportunity family", () => {
  const input = structuredClone(fixture(FAMILY_CASES[1]));
  input.observations[0]!.observationCode = "PRE_MOVE_COMPRESSION_PRESENT";
  input.evidence.items[0]!.category = "STRUCTURE";
  input.evidence.items[0]!.stance = "SUPPORTING";
  const result = analyzeM3FamilyEvidence(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("observation_code_family_mismatch"));
});

test("blocks stance laundering between evidence and analysis", () => {
  const input = structuredClone(fixture(FAMILY_CASES[1]));
  input.evidence.items[0]!.stance = "CONTRADICTING";
  const result = analyzeM3FamilyEvidence(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("observation_stance_mismatch"));
});

test("blocks same-category evidence relabeling", () => {
  const input = structuredClone(fixture(FAMILY_CASES[1]));
  input.observations[0]!.observationCode = "BREAKOUT_BOUNDARY_LONG";
  const result = analyzeM3FamilyEvidence(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes(
    "observation_not_bound_to_evidence_reason"));
});

test("blocks observations that arrive after the analysis cutoff", () => {
  const input = structuredClone(fixture(FAMILY_CASES[1]));
  input.observations[0]!.observedAt = "2026-01-15T00:00:30.000Z";
  input.evidence.items[0]!.observedAt = "2026-01-15T00:00:30.000Z";
  const result = analyzeM3FamilyEvidence(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("analysis_observation_from_future"));
});

test("blocks structural levels without evidence fact provenance", () => {
  const input = structuredClone(fixture(FAMILY_CASES[1]));
  input.structuralLevels[0]!.sourceFactIds = ["fact:not-in-evidence"];
  const result = analyzeM3FamilyEvidence(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("structural_level_fact_not_in_evidence"));
});

test("blocks Fibonacci-only structure", () => {
  const input = structuredClone(fixture(FAMILY_CASES[1]));
  input.structuralLevels[0]!.kind = "FIB_ZONE";
  const result = analyzeM3FamilyEvidence(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("fib_only_structure_forbidden"));
});

test("keeps stale market context explicit without rewriting structure direction", () => {
  const input = structuredClone(fixture(FAMILY_CASES[2]));
  input.marketContext.quality = {
    status: "STALE",
    ageMs: 60_000,
    reasonCodes: ["fixture_context_stale"],
  };
  const result = analyzeM3FamilyEvidence(input);
  assert.equal(result.status, "ANALYZED_UNCALIBRATED");
  assert.equal(result.analysis?.directionBias, "LONG");
  assert.equal(result.analysis?.uncertainty.market.status, "UNKNOWN");
  assert.ok(result.analysis?.uncertainty.market.reasonCodes.includes(
    "market_context_not_fresh"));
});

test("strictly rejects future outcome and trading-plan fields", () => {
  for (const polluted of [
    { ...fixture(FAMILY_CASES[1]), futureOutcome: { mfe: 9 } },
    { ...fixture(FAMILY_CASES[1]), entry: "100", stop: "99", target: "110" },
  ]) {
    const result = analyzeM3FamilyEvidence(polluted);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.analysis, null);
    assert.ok(result.reasonCodes.includes("family_analysis_input_schema_rejected"));
  }
});

test("analysis output cannot expose grades, plans or risk sizing", () => {
  const result = analyzeM3FamilyEvidence(fixture(FAMILY_CASES[1]));
  assert.notEqual(result.analysis, null);
  const analysis = result.analysis as unknown as Record<string, unknown>;
  for (const forbidden of [
    "candidatePriority",
    "evidenceGrade",
    "setupGrade",
    "entry",
    "stop",
    "target",
    "rewardRisk",
    "leverage",
    "positionSize",
    "actionState",
  ]) {
    assert.equal(forbidden in analysis, false, forbidden);
  }
});

test("result and analysis are deterministic and deeply frozen", () => {
  const input = fixture(FAMILY_CASES[1]);
  const first = analyzeM3FamilyEvidence(input);
  const second = analyzeM3FamilyEvidence({
    ...input,
    observations: [...input.observations].reverse(),
  });
  assert.equal(first.resultHash, second.resultHash);
  assert.equal(first.analysis?.contentHash, second.analysis?.contentHash);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.analysis), true);
  assert.equal(Object.isFrozen(first.analysis?.structuralLevels), true);
});
