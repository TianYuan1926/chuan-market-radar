import assert from "node:assert/strict";
import test from "node:test";
import type {
  Direction,
  QualityAssessment,
} from "../../domain/contracts";
import type { OpportunityFamily } from "../../domain/product-constitution";
import { StrategyDraftSchema } from "../../runtime-schema/decision-schemas";
import { m3FamilyAnalyzerVersion } from "../analysis/m3-family-analysis-policy";
import { M3_SIGNAL_QUALIFICATION_POLICY_VERSION } from "../qualification/m3-signal-qualification-policy";
import {
  calculateConservativeRewardRisk,
  shiftPriceByBps,
} from "./m3-exact-price-math";
import {
  M3StrategyConstructionInputSchema,
  M3_STRATEGY_CONSTRUCTION_INPUT_VERSION,
  M3_STRATEGY_CONSTRUCTION_MODE,
  M3_STRATEGY_CONSTRUCTION_POLICY_VERSION,
  M3_STRATEGY_TEST_COST_ASSUMPTIONS,
  constructM3Strategy,
  type M3StrategyConstructionInput,
} from "./m3-strategy-construction-contract";

const RELEASE = "release-m3-strategy-construction";
const CUTOFF = "2026-01-15T00:00:10.000Z";
const GENERATED_AT = "2026-01-15T00:00:40.000Z";

const fresh = {
  status: "FRESH",
  ageMs: 0,
  reasonCodes: [],
} as const satisfies QualityAssessment;

const FAMILIES = [
  "PRE_MOVE",
  "BREAKOUT_RETEST",
  "TREND_CONTINUATION",
  "REVERSAL_RANGE",
  "RELATIVE_STRENGTH",
  "DERIVATIVES_FLOW",
] as const satisfies readonly OpportunityFamily[];

type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
  ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
  : T;

function mutable<T>(value: T): DeepMutable<T> {
  return structuredClone(value) as DeepMutable<T>;
}

function uncertainty() {
  return {
    data: {
      dimension: "data",
      status: "LOW",
      reasonCodes: [],
      sampleSize: 100,
      calibrationVersion: "fixture-data.v1",
      lastValidatedAt: CUTOFF,
    },
    model: {
      dimension: "model",
      status: "HIGH",
      reasonCodes: ["test_only_policy_uncalibrated"],
      sampleSize: null,
      calibrationVersion: null,
      lastValidatedAt: null,
    },
    market: {
      dimension: "market",
      status: "LOW",
      reasonCodes: [],
      sampleSize: 100,
      calibrationVersion: "fixture-market.v1",
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
}

function entryKind(
  family: OpportunityFamily,
  direction: Direction,
): "SUPPORT" | "RESISTANCE" | "LIQUIDITY" {
  if (family === "BREAKOUT_RETEST") {
    return direction === "LONG" ? "RESISTANCE" : "SUPPORT";
  }
  if (family === "REVERSAL_RANGE" || family === "DERIVATIVES_FLOW") {
    return "LIQUIDITY";
  }
  return direction === "LONG" ? "SUPPORT" : "RESISTANCE";
}

function fixture(
  family: OpportunityFamily = "PRE_MOVE",
  direction: Direction = "LONG",
): M3StrategyConstructionInput {
  const slug = family.toLowerCase();
  const episodeId = `episode:${slug}:${direction.toLowerCase()}`;
  const analysisId = `analysis:${slug}:${direction.toLowerCase()}`;
  const qualificationId = `qualification:${slug}:${direction.toLowerCase()}`;
  const entryFactId = `fact:${slug}:entry`;
  const targetFactId = `fact:${slug}:target`;
  const regime = family === "REVERSAL_RANGE" ? "RANGE" : "TRANSITION";
  return M3StrategyConstructionInputSchema.parse({
    schemaVersion: M3_STRATEGY_CONSTRUCTION_INPUT_VERSION,
    executionMode: M3_STRATEGY_CONSTRUCTION_MODE,
    policyVersion: M3_STRATEGY_CONSTRUCTION_POLICY_VERSION,
    releaseId: RELEASE,
    generatedAt: GENERATED_AT,
    sourceCutoff: CUTOFF,
    analysis: {
      schemaVersion: "analysis-snapshot.v3",
      releaseId: RELEASE,
      producerModule: "family_analysis",
      generatedAt: "2026-01-15T00:00:20.000Z",
      sourceCutoff: CUTOFF,
      contentHash: `sha256:analysis-${slug}-${direction}`,
      analysisId,
      episodeId,
      thesisId: `thesis:${slug}:${direction.toLowerCase()}`,
      evidencePackageId: `evidence:${slug}:${direction.toLowerCase()}`,
      evidenceItemIds: [`evidence-item:${slug}`],
      marketContextSnapshotId: `context:${slug}`,
      analyzerVersion: m3FamilyAnalyzerVersion(family),
      analysisAuthority: "TEST_ONLY_UNCALIBRATED",
      opportunityFamily: family,
      directionBias: direction,
      structureState: "FIXTURE_VALID_STRUCTURE",
      marketStage: "EARLY",
      locationQuality: "GOOD",
      spaceQuality: "GOOD",
      structuralLevels: [
        {
          levelId: `level:${slug}:entry`,
          kind: entryKind(family, direction),
          price: "100",
          timeframe: "15m",
          sourceFactIds: [entryFactId],
          reasonCodes: ["structural_entry_anchor"],
        },
        {
          levelId: `level:${slug}:target`,
          kind: direction === "LONG" ? "RESISTANCE" : "SUPPORT",
          price: direction === "LONG" ? "110" : "90",
          timeframe: "1h",
          sourceFactIds: [targetFactId],
          reasonCodes: ["prior_extreme"],
        },
      ],
      supportingReasons: ["fixture_structure_confirmed"],
      counterEvidence: [],
      lateRisk: "LOW",
      fakeoutRisk: "LOW",
      noiseRisk: "LOW",
      uncertainty: uncertainty(),
    },
    qualification: {
      schemaVersion: "signal-qualification.v2",
      releaseId: RELEASE,
      producerModule: "signal_qualification",
      generatedAt: "2026-01-15T00:00:30.000Z",
      sourceCutoff: CUTOFF,
      contentHash: `sha256:qualification-${slug}-${direction}`,
      qualificationId,
      episodeId,
      thesisId: `thesis:${slug}:${direction.toLowerCase()}`,
      evidencePackageId: `evidence:${slug}:${direction.toLowerCase()}`,
      analysisId,
      marketContextSnapshotId: `context:${slug}`,
      opportunityFamily: family,
      direction,
      qualificationPolicyVersion: M3_SIGNAL_QUALIFICATION_POLICY_VERSION,
      qualificationAuthority: "TEST_ONLY_UNCALIBRATED",
      evidenceGrade: "A",
      setupGrade: "PREMIUM",
      evidenceAssessment: {
        completenessStatus: "PASS",
        independenceStatus: "PASS",
        freshnessStatus: "PASS",
        dataQualityStatus: "PASS",
        lineageStatus: "PASS",
        uncertaintyStatus: "PASS",
        requiredItemCount: 3,
        observedRequiredItemCount: 3,
        freshItemCount: 3,
        totalItemCount: 3,
        independentGroupCount: 3,
        reasonCodes: ["fixture_evidence_assessment"],
      },
      setupAssessment: {
        directionStatus: "PASS",
        structureStatus: "PASS",
        locationStatus: "PASS",
        spaceStatus: "PASS",
        timingStatus: "PASS",
        fakeoutStatus: "PASS",
        noiseStatus: "PASS",
        regimeFitStatus: "PASS",
        uncertaintyStatus: "PASS",
        reasonCodes: ["fixture_setup_assessment"],
      },
      evidenceCalibration: {
        status: "UNCALIBRATED",
        calibrationVersion: null,
        targetDefinitionVersion: null,
        calibrationCohortId: null,
        untouchedHoldoutId: null,
        coveredRegimes: [],
        sampleSize: 0,
        estimatedProbability: null,
        confidenceInterval: null,
        reliabilityError: null,
        segment: {
          opportunityFamily: family,
          direction,
          regime,
        },
        evaluatedAt: null,
        abstainReasonCodes: ["evidence_calibration_absent"],
      },
      setupCalibration: {
        status: "UNCALIBRATED",
        calibrationVersion: null,
        targetDefinitionVersion: null,
        calibrationCohortId: null,
        untouchedHoldoutId: null,
        coveredRegimes: [],
        sampleSize: 0,
        estimatedProbability: null,
        confidenceInterval: null,
        reliabilityError: null,
        segment: {
          opportunityFamily: family,
          direction,
          regime,
        },
        evaluatedAt: null,
        abstainReasonCodes: ["setup_calibration_absent"],
      },
      reasonCodes: ["fixture_qualification"],
    },
    referencePrice: {
      price: direction === "LONG" ? "100.05" : "99.95",
      observedAt: CUTOFF,
      sourceFactIds: [entryFactId],
      quality: fresh,
    },
    costAssumptions: M3_STRATEGY_TEST_COST_ASSUMPTIONS,
  });
}

function mutableFixture(
  family: OpportunityFamily = "PRE_MOVE",
  direction: Direction = "LONG",
): DeepMutable<M3StrategyConstructionInput> {
  return mutable(fixture(family, direction));
}

test("constructs six distinct LONG family templates without READY authority", () => {
  const templateVersions = new Set<string>();
  for (const family of FAMILIES) {
    const result = constructM3Strategy(fixture(family, "LONG"));
    assert.equal(result.status, "CONSTRUCTED_TEST_ONLY");
    assert.equal(result.authority, "TEST_ONLY_NO_READY_AUTHORITY");
    assert.equal(result.draft?.schemaVersion, "strategy-draft.v2");
    assert.equal(result.draft?.opportunityFamily, family);
    assert.equal(result.draft?.direction, "LONG");
    assert.equal(result.draft?.strategyAuthority, "TEST_ONLY_UNCALIBRATED");
    assert.ok(result.draft?.blockers.includes(
      "strategy_authority_test_only_uncalibrated",
    ));
    templateVersions.add(result.draft!.templateVersion);
  }
  assert.equal(templateVersions.size, FAMILIES.length);
});

test("constructs six distinct SHORT family templates with adverse-side stops", () => {
  for (const family of FAMILIES) {
    const result = constructM3Strategy(fixture(family, "SHORT"));
    assert.equal(result.status, "CONSTRUCTED_TEST_ONLY");
    assert.equal(result.draft?.direction, "SHORT");
    assert.ok(Number(result.draft!.structuralStop) >
      Number(result.draft!.structuralStopBase));
    assert.ok(result.draft!.targets.every(
      (target) => Number(target.price) < Number(result.draft!.plannedEntryZone.lower),
    ));
  }
});

test("uses exact decimal shifts and conservative RR without binary price drift", () => {
  assert.equal(
    shiftPriceByBps("0.00000123", 25, "SUBTRACT", "FLOOR", 12),
    "0.000001226925",
  );
  assert.equal(
    shiftPriceByBps("0.00000123", 25, "ADD", "CEIL", 12),
    "0.000001233075",
  );
  const draft = constructM3Strategy(fixture()).draft!;
  assert.equal(draft.plannedEntryZone.lower, "99.92");
  assert.equal(draft.plannedEntryZone.upper, "100.08");
  assert.equal(draft.structuralStop, "99.75");
  assert.ok(draft.estimatedNetRewardRisk < draft.grossRewardRisk);
});

test("calculates weighted gross and net RR from exact decimal geometry", () => {
  const result = calculateConservativeRewardRisk({
    direction: "LONG",
    conservativeEntryPrice: "100.08",
    structuralStop: "99.75",
    targets: [
      { price: "103", allocationPercent: 60 },
      { price: "106", allocationPercent: 40 },
    ],
    feePerSideBps: 6,
    slippagePerSideBps: 8,
    fundingBps: -5,
    precision: 6,
  });
  assert.ok(result.grossRewardRisk > 10);
  assert.ok(result.estimatedNetRewardRisk > 0);
  assert.ok(result.estimatedNetRewardRisk < result.grossRewardRisk);
  assert.equal(result.totalConservativeCostBps, 28);
});

test("builds a deterministic three-target ladder totaling 100 percent", () => {
  const input = mutableFixture();
  input.analysis.structuralLevels.push(
    {
      levelId: "level:pre_move:target-two",
      kind: "LIQUIDITY",
      price: "120",
      timeframe: "4h",
      sourceFactIds: ["fact:pre_move:target-two"],
      reasonCodes: ["liquidity_objective"],
    },
    {
      levelId: "level:pre_move:target-three",
      kind: "FIB_ZONE",
      price: "130",
      timeframe: "4h",
      sourceFactIds: ["fact:pre_move:target-three"],
      reasonCodes: ["validated_extension"],
    },
  );
  const draft = constructM3Strategy(input).draft!;
  assert.deepEqual(
    draft.targets.map((target) => target.allocationPercent),
    [50, 30, 20],
  );
  assert.equal(
    draft.targets.reduce((sum, target) => sum + target.allocationPercent, 0),
    100,
  );
  assert.deepEqual(
    draft.targets.map((target) => target.source),
    ["PRIOR_EXTREME", "LIQUIDITY_AREA", "VALIDATED_EXTENSION"],
  );
});

test("abstains without a draft when evidence is insufficient", () => {
  const input = mutableFixture();
  input.qualification.evidenceGrade = "INSUFFICIENT";
  const result = constructM3Strategy(input);
  assert.equal(result.status, "ABSTAINED_NO_DRAFT");
  assert.equal(result.draft, null);
  assert.ok(result.reasonCodes.includes("strategy_evidence_insufficient"));
});

test("abstains on invalid, unknown or unresolved setup truth", () => {
  for (const grade of ["INVALID", "UNKNOWN"] as const) {
    const input = mutableFixture();
    input.qualification.setupGrade = grade;
    const result = constructM3Strategy(input);
    assert.equal(result.status, "ABSTAINED_NO_DRAFT");
    assert.equal(result.draft, null);
  }
  const unresolved = mutableFixture();
  unresolved.analysis.directionBias = "UNKNOWN";
  unresolved.qualification.direction = "UNKNOWN";
  unresolved.qualification.evidenceCalibration.segment.direction = "UNKNOWN";
  unresolved.qualification.setupCalibration.segment.direction = "UNKNOWN";
  const result = constructM3Strategy(unresolved);
  assert.equal(result.status, "ABSTAINED_NO_DRAFT");
  assert.ok(result.reasonCodes.includes("strategy_direction_unresolved"));
});

test("keeps C evidence and MARGINAL setup explicit as observe-only blockers", () => {
  const input = mutableFixture();
  input.qualification.evidenceGrade = "C";
  input.qualification.setupGrade = "MARGINAL";
  const result = constructM3Strategy(input);
  assert.equal(result.status, "CONSTRUCTED_TEST_ONLY");
  assert.ok(result.draft?.blockers.includes("evidence_grade_c_observe_only"));
  assert.ok(result.draft?.blockers.includes("setup_grade_marginal_observe_only"));
});

test("does not invent a draft when an entry anchor is absent", () => {
  const input = mutableFixture();
  input.analysis.structuralLevels.shift();
  input.referencePrice.sourceFactIds = ["fact:pre_move:target"];
  const result = constructM3Strategy(input);
  assert.equal(result.status, "ABSTAINED_NO_DRAFT");
  assert.equal(result.draft, null);
  assert.ok(result.reasonCodes.includes("strategy_entry_anchor_missing"));
});

test("does not invent placeholder targets when target structure is absent", () => {
  const input = mutableFixture();
  input.analysis.structuralLevels.pop();
  const result = constructM3Strategy(input);
  assert.equal(result.status, "ABSTAINED_NO_DRAFT");
  assert.equal(result.draft, null);
  assert.ok(result.reasonCodes.includes("strategy_target_structure_missing"));
  assert.equal(JSON.stringify(result).includes('"price":"0"'), false);
});

test("abstains rather than chasing a reference price far from structure", () => {
  const input = mutableFixture();
  input.referencePrice.price = "101";
  const result = constructM3Strategy(input);
  assert.equal(result.status, "ABSTAINED_NO_DRAFT");
  assert.ok(result.reasonCodes.includes(
    "strategy_reference_price_outside_no_chase_distance",
  ));
});

test("abstains when the point-in-time reference price is not fresh", () => {
  const input = mutableFixture();
  input.referencePrice.quality = {
    status: "STALE",
    ageMs: 60_000,
    reasonCodes: ["reference_price_stale"],
  };
  const result = constructM3Strategy(input);
  assert.equal(result.status, "ABSTAINED_NO_DRAFT");
  assert.ok(result.reasonCodes.includes("strategy_reference_price_not_fresh"));
});

test("blocks cross-release, identity and future-data composition", () => {
  const crossRelease = mutableFixture();
  crossRelease.qualification.releaseId = "another-release";
  assert.ok(constructM3Strategy(crossRelease).reasonCodes.includes(
    "cross_release_strategy_input",
  ));

  const wrongIdentity = mutableFixture();
  wrongIdentity.qualification.analysisId = "another-analysis";
  assert.ok(constructM3Strategy(wrongIdentity).reasonCodes.includes(
    "strategy_analysis_qualification_identity_mismatch",
  ));

  const futureReference = mutableFixture();
  futureReference.referencePrice.observedAt = "2026-01-15T00:01:00.000Z";
  assert.ok(constructM3Strategy(futureReference).reasonCodes.includes(
    "reference_price_from_future",
  ));
});

test("blocks reference prices without analysis fact lineage", () => {
  const input = mutableFixture();
  input.referencePrice.sourceFactIds = ["fact:not-in-analysis"];
  const result = constructM3Strategy(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes(
    "reference_price_not_bound_to_analysis_facts",
  ));
});

test("rejects caller-tuned cost assumptions instead of improving RR", () => {
  const input = mutableFixture();
  (input.costAssumptions as { feePerSideBps: number }).feePerSideBps = 0;
  const result = constructM3Strategy(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes(
    "strategy_construction_input_schema_rejected",
  ));
});

test("requires Fibonacci targets to carry validated-extension provenance", () => {
  const invalid = mutableFixture();
  invalid.analysis.structuralLevels[1] = {
    levelId: "level:pre_move:fib-target",
    kind: "FIB_ZONE",
    price: "110",
    timeframe: "4h",
    sourceFactIds: ["fact:pre_move:fib"],
    reasonCodes: ["fib_ratio_0_618"],
  };
  const abstained = constructM3Strategy(invalid);
  assert.equal(abstained.status, "ABSTAINED_NO_DRAFT");
  assert.equal(abstained.draft, null);

  invalid.analysis.structuralLevels[1]!.reasonCodes.push("validated_extension");
  const constructed = constructM3Strategy(invalid);
  assert.equal(constructed.status, "CONSTRUCTED_TEST_ONLY");
  assert.equal(constructed.draft?.targets[0]?.source, "VALIDATED_EXTENSION");
});

test("retains the structural stop and blocks low RR instead of shrinking risk", () => {
  const input = mutableFixture();
  input.analysis.structuralLevels[1]!.price = "100.2";
  const result = constructM3Strategy(input);
  assert.equal(result.status, "CONSTRUCTED_TEST_ONLY");
  assert.equal(result.draft?.structuralStopBase, "100");
  assert.equal(result.draft?.structuralStop, "99.75");
  assert.ok(result.draft?.blockers.includes("structural_rr_below_minimum"));
  assert.ok(result.draft?.blockers.includes("estimated_net_rr_below_minimum"));
});

test("StrategyDraft v2 rejects authority laundering and invalid RR claims", () => {
  const draft = mutable(constructM3Strategy(fixture()).draft!);
  draft.blockers = [];
  assert.equal(StrategyDraftSchema.safeParse(draft).success, false);

  const inflatedNet = mutable(constructM3Strategy(fixture()).draft!);
  inflatedNet.estimatedNetRewardRisk = inflatedNet.grossRewardRisk + 1;
  assert.equal(StrategyDraftSchema.safeParse(inflatedNet).success, false);

  const forgedReady = {
    ...constructM3Strategy(fixture()).draft!,
    actionState: "TRADE_PLAN_READY",
  };
  assert.equal(StrategyDraftSchema.safeParse(forgedReady).success, false);

  const fractionalAllocation = mutable(constructM3Strategy(fixture()).draft!);
  fractionalAllocation.targets[0]!.allocationPercent = 99.5;
  assert.equal(
    StrategyDraftSchema.safeParse(fractionalAllocation).success,
    false,
  );

  const unboundedCost = mutable(constructM3Strategy(fixture()).draft!);
  unboundedCost.feePerSideAssumptionBps = 10_001;
  assert.equal(StrategyDraftSchema.safeParse(unboundedCost).success, false);
});

test("is deterministic and never changes the input artifact", () => {
  const input = fixture();
  const before = structuredClone(input);
  const first = constructM3Strategy(input);
  const second = constructM3Strategy(input);
  assert.equal(first.resultHash, second.resultHash);
  assert.equal(first.draft?.contentHash, second.draft?.contentHash);
  assert.deepEqual(input, before);
});

test("strictly rejects future outcome, execution and plan override fields", () => {
  const polluted: Record<string, unknown>[] = [
    { ...fixture(), futureOutcome: { mfe: 9 } },
    { ...fixture(), actionState: "TRADE_PLAN_READY" },
    { ...fixture(), overrideStop: "99.9" },
  ];
  for (const input of polluted) {
    const result = constructM3Strategy(input);
    assert.equal(result.status, "BLOCKED");
    assert.ok(result.reasonCodes.includes(
      "strategy_construction_input_schema_rejected",
    ));
  }
});
