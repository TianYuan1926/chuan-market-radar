import assert from "node:assert/strict";
import test from "node:test";
import type {
  DirectionHypothesis,
  OpportunityThesis,
  QualityAssessment,
  SignalQualification,
} from "../../domain/contracts";
import type {
  OpportunityFamily,
  OpportunityPattern,
} from "../../domain/product-constitution";
import { SignalQualificationSchema } from "../../runtime-schema/decision-schemas";
import {
  M3SignalQualificationInputSchema,
  M3_SIGNAL_QUALIFICATION_INPUT_VERSION,
  M3_SIGNAL_QUALIFICATION_MODE,
  M3_SIGNAL_QUALIFICATION_POLICY_VERSION,
  qualifyM3Signal,
  type M3SignalQualificationInput,
} from "./m3-signal-qualification-contract";

const RELEASE = "release-m3-signal-qualification";
const CUTOFF = "2026-01-15T00:00:10.000Z";
const GENERATED_AT = "2026-01-15T00:00:30.000Z";

const fresh = {
  status: "FRESH",
  ageMs: 0,
  reasonCodes: [],
} as const satisfies QualityAssessment;

function uncertainty(
  data: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" = "LOW",
  market: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" = "LOW",
) {
  return {
    data: {
      dimension: "data",
      status: data,
      reasonCodes: [],
      sampleSize: data === "UNKNOWN" ? null : 100,
      calibrationVersion: data === "UNKNOWN" ? null : "fixture.v1",
      lastValidatedAt: data === "UNKNOWN" ? null : CUTOFF,
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
      status: market,
      reasonCodes: [],
      sampleSize: market === "UNKNOWN" ? null : 100,
      calibrationVersion: market === "UNKNOWN" ? null : "fixture.v1",
      lastValidatedAt: market === "UNKNOWN" ? null : CUTOFF,
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

type FamilyFixture = Readonly<{
  family: OpportunityFamily;
  pattern: OpportunityPattern;
  direction: DirectionHypothesis;
  structureState: string;
  marketStage: string;
  regime: "TREND" | "RANGE" | "TRANSITION" | "STRESS";
}>;

const FAMILY_FIXTURES = [
  {
    family: "PRE_MOVE",
    pattern: "PRE_MOVE_COMPRESSION",
    direction: "LONG",
    structureState: "COMPRESSION_WITH_DIRECTIONAL_PRESSURE",
    marketStage: "EARLY",
    regime: "TRANSITION",
  },
  {
    family: "BREAKOUT_RETEST",
    pattern: "ROLE_FLIP_RETEST",
    direction: "LONG",
    structureState: "ROLE_FLIP_RETEST_HOLD",
    marketStage: "RETEST",
    regime: "TREND",
  },
  {
    family: "TREND_CONTINUATION",
    pattern: "STRUCTURAL_PULLBACK_RESUMPTION",
    direction: "LONG",
    structureState: "STRUCTURAL_PULLBACK_HOLD",
    marketStage: "RESUMPTION",
    regime: "TREND",
  },
  {
    family: "REVERSAL_RANGE",
    pattern: "KEY_LEVEL_REVERSAL",
    direction: "LONG",
    structureState: "LIQUIDITY_SWEEP_RECLAIM_OR_REJECTION",
    marketStage: "EARLY_REVERSAL",
    regime: "RANGE",
  },
  {
    family: "RELATIVE_STRENGTH",
    pattern: "RELATIVE_STRENGTH",
    direction: "LONG",
    structureState: "BENCHMARK_ADJUSTED_DIVERGENCE",
    marketStage: "PERSISTING",
    regime: "TREND",
  },
  {
    family: "DERIVATIVES_FLOW",
    pattern: "PRICE_OI_DIVERGENCE",
    direction: "LONG",
    structureState: "PRICE_POSITIONING_DIVERGENCE",
    marketStage: "EARLY_DIVERGENCE",
    regime: "TRANSITION",
  },
] as const satisfies readonly FamilyFixture[];

function rawFixture(
  familyFixture: FamilyFixture = FAMILY_FIXTURES[0],
): Record<string, unknown> {
  const slug = familyFixture.family.toLowerCase();
  const episodeId = `episode:${slug}`;
  const thesisId = `thesis:${slug}`;
  const evidencePackageId = `evidence-package:${slug}`;
  const analysisId = `analysis:${slug}`;
  const evidenceIds = [1, 2, 3, 4].map(
    (index) => `evidence:${slug}:${index}`,
  );
  const thesis: OpportunityThesis = {
    schemaVersion: "opportunity-thesis.v2",
    releaseId: RELEASE,
    producerModule: "candidate_lifecycle_opportunity_thesis",
    generatedAt: "2026-01-15T00:00:12.000Z",
    sourceCutoff: CUTOFF,
    contentHash: `sha256:thesis-${slug}`,
    thesisId,
    episodeId,
    thesisVersion: 1,
    thesisAuthority: "VALIDATION_HYPOTHESIS_ONLY",
    canonicalInstrumentId: `BINANCE_FUTURES:${slug.toUpperCase()}USDT:LINEAR_PERPETUAL:USDT`,
    underlyingGroupId: `${slug.toUpperCase()}:USDT_LINEAR_PERPETUAL`,
    opportunityFamily: familyFixture.family,
    opportunityPatterns: [familyFixture.pattern],
    directionHypothesis: familyFixture.direction,
    detectorSources: [{
      candidateId: `candidate:${slug}`,
      detectorId: `detector:${slug}`,
      detectorVersion: `detector:${slug}.v1`,
      detectorLifecycle: "REPLAY_VALIDATED",
      emissionScope: "REPLAY",
      opportunityPattern: familyFixture.pattern,
      firstDetectedAt: CUTOFF,
      candidateSourceCutoff: CUTOFF,
    }],
    firstDetectedAt: CUTOFF,
    updatedAt: "2026-01-15T00:00:12.000Z",
    supportingReasons: ["fixture_thesis"],
    conflictingReasons: [],
    knownUnknowns: [],
    uncertainty: uncertainty(),
  };
  return {
    schemaVersion: M3_SIGNAL_QUALIFICATION_INPUT_VERSION,
    executionMode: M3_SIGNAL_QUALIFICATION_MODE,
    policyVersion: M3_SIGNAL_QUALIFICATION_POLICY_VERSION,
    releaseId: RELEASE,
    generatedAt: GENERATED_AT,
    sourceCutoff: CUTOFF,
    thesis,
    evidence: {
      schemaVersion: "evidence-package.v2",
      releaseId: RELEASE,
      producerModule: "deep_validation",
      generatedAt: "2026-01-15T00:00:14.000Z",
      sourceCutoff: CUTOFF,
      contentHash: `sha256:evidence-${slug}`,
      evidencePackageId,
      episodeId,
      thesisId,
      items: evidenceIds.map((evidenceId, index) => ({
        evidenceId,
        category: ["STRUCTURE", "LOCATION", "SPACE", "TIMING"][index],
        stance: "SUPPORTING",
        criticality: "REQUIRED",
        factIds: [`fact:${slug}:${index + 1}`],
        featureIds: [],
        independenceGroupIds: [`source-group:${slug}:${index + 1}`],
        observedAt: CUTOFF,
        quality: fresh,
        reasonCodes: [`fixture_evidence_${index + 1}`],
      })),
      completenessRatio: 1,
      uncertainty: uncertainty(),
      quality: fresh,
    },
    analysis: {
      schemaVersion: "analysis-snapshot.v3",
      releaseId: RELEASE,
      producerModule: "family_analysis",
      generatedAt: "2026-01-15T00:00:20.000Z",
      sourceCutoff: CUTOFF,
      contentHash: `sha256:analysis-${slug}`,
      analysisId,
      episodeId,
      thesisId,
      evidencePackageId,
      evidenceItemIds: evidenceIds,
      marketContextSnapshotId: `market-context:${slug}`,
      analyzerVersion: `analyzer:${slug}.v1`,
      analysisAuthority: "TEST_ONLY_UNCALIBRATED",
      opportunityFamily: familyFixture.family,
      directionBias: familyFixture.direction,
      structureState: familyFixture.structureState,
      marketStage: familyFixture.marketStage,
      locationQuality: "GOOD",
      spaceQuality: "GOOD",
      structuralLevels: [{
        levelId: `level:${slug}:support`,
        kind: "SUPPORT",
        price: "100",
        timeframe: "1h",
        sourceFactIds: [`fact:${slug}:1`],
        reasonCodes: ["fixture_support"],
      }],
      supportingReasons: ["fixture_analysis_support"],
      counterEvidence: [],
      lateRisk: "LOW",
      fakeoutRisk: "LOW",
      noiseRisk: "LOW",
      uncertainty: uncertainty(),
    },
    marketContext: {
      schemaVersion: "market-context-snapshot.v2",
      releaseId: RELEASE,
      producerModule: "market_context",
      generatedAt: "2026-01-15T00:00:13.000Z",
      sourceCutoff: CUTOFF,
      contentHash: `sha256:context-${slug}`,
      snapshotId: `market-context:${slug}`,
      universeSnapshotId: "universe:fixture",
      featureSetSnapshotId: "feature-set:fixture",
      featureQualitySnapshotId: "feature-quality:fixture",
      contextRuleVersion: "fixture-context.v1",
      regime: familyFixture.regime,
      volatility: "NORMAL",
      breadth: 0.5,
      correlation: 0.3,
      liquidity: "HEALTHY",
      confidence: "HIGH",
      quality: fresh,
      uncertainty: uncertainty(),
    },
  };
}

function fixture(
  familyFixture: FamilyFixture = FAMILY_FIXTURES[0],
): M3SignalQualificationInput {
  return M3SignalQualificationInputSchema.parse(rawFixture(familyFixture));
}

type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
  ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
  : T;

function mutableClone<T>(value: T): DeepMutable<T> {
  return structuredClone(value) as DeepMutable<T>;
}

function mutableFixture(
  familyFixture: FamilyFixture = FAMILY_FIXTURES[0],
): DeepMutable<M3SignalQualificationInput> {
  return mutableClone(fixture(familyFixture));
}

function calibratedQualification(): DeepMutable<SignalQualification> {
  const qualification = mutableClone(qualifyM3Signal(fixture()).qualification!);
  qualification.qualificationAuthority = "REPLAY_CALIBRATED";
  for (const [kind, calibration] of [
    ["evidence", qualification.evidenceCalibration],
    ["setup", qualification.setupCalibration],
  ] as const) {
    calibration.status = "CALIBRATED";
    calibration.calibrationVersion = `${kind}-calibration.v1`;
    calibration.targetDefinitionVersion = `${kind}-target.v1`;
    calibration.calibrationCohortId = `${kind}-cohort-2026q1`;
    calibration.untouchedHoldoutId = `${kind}-holdout-2026q1`;
    calibration.coveredRegimes = ["TREND", "RANGE", "TRANSITION"];
    calibration.sampleSize = 100;
    calibration.estimatedProbability = 0.8;
    calibration.confidenceInterval = [0.7, 0.9];
    calibration.reliabilityError = 0.05;
    calibration.evaluatedAt = GENERATED_AT;
    calibration.abstainReasonCodes = [];
  }
  return qualification;
}

test("classifies all six family-specific premium shapes without decision authority", () => {
  for (const familyFixture of FAMILY_FIXTURES) {
    const result = qualifyM3Signal(fixture(familyFixture));
    assert.equal(result.status, "CLASSIFIED_UNCALIBRATED");
    assert.equal(result.authority, "TEST_ONLY_NO_DECISION_AUTHORITY");
    assert.equal(result.qualification?.evidenceGrade, "A");
    assert.equal(result.qualification?.setupGrade, "PREMIUM");
    assert.equal(
      result.qualification?.qualificationAuthority,
      "TEST_ONLY_UNCALIBRATED",
    );
  }
});

test("keeps A evidence and a marginal setup as independent legal dimensions", () => {
  const input = mutableFixture();
  input.analysis.lateRisk = "HIGH";
  const result = qualifyM3Signal(input);
  assert.equal(result.qualification?.evidenceGrade, "A");
  assert.equal(result.qualification?.setupGrade, "MARGINAL");
});

test("keeps a premium shape while evidence abstains", () => {
  const input = mutableFixture();
  input.evidence.uncertainty = mutableClone(uncertainty("UNKNOWN"));
  const result = qualifyM3Signal(input);
  assert.equal(result.status, "ABSTAINED_UNCALIBRATED");
  assert.equal(result.qualification?.evidenceGrade, "INSUFFICIENT");
  assert.equal(result.qualification?.setupGrade, "PREMIUM");
});

test("evidence independence changes only Evidence Grade", () => {
  const input = mutableFixture();
  for (const item of input.evidence.items) {
    item.independenceGroupIds = ["one-shared-source"];
  }
  const result = qualifyM3Signal(input);
  assert.equal(result.qualification?.evidenceGrade, "C");
  assert.equal(result.qualification?.setupGrade, "PREMIUM");
});

test("setup deterioration does not rewrite Evidence Grade", () => {
  const input = mutableFixture();
  input.analysis.locationQuality = "POOR";
  input.analysis.fakeoutRisk = "HIGH";
  const result = qualifyM3Signal(input);
  assert.equal(result.qualification?.evidenceGrade, "A");
  assert.equal(result.qualification?.setupGrade, "MARGINAL");
});

test("missing required evidence abstains and cannot claim fresh package quality", () => {
  const invalid = mutableFixture();
  invalid.evidence.items[0].stance = "MISSING";
  invalid.evidence.items[0].factIds = [];
  invalid.evidence.items[0].independenceGroupIds = [];
  invalid.evidence.items[0].quality = {
    status: "UNAVAILABLE",
    ageMs: null,
    reasonCodes: ["required_item_missing"],
  };
  invalid.evidence.completenessRatio = 0.75;
  const blocked = qualifyM3Signal(invalid);
  assert.equal(blocked.status, "BLOCKED");
  assert(blocked.reasonCodes.includes("signal_qualification_input_schema_rejected"));

  invalid.evidence.quality = {
    status: "PARTIAL",
    ageMs: 0,
    reasonCodes: ["required_item_missing"],
  };
  const abstained = qualifyM3Signal(invalid);
  assert.equal(abstained.qualification?.evidenceGrade, "INSUFFICIENT");
});

test("unknown market context makes Setup Grade unknown instead of guessing", () => {
  const input = mutableFixture();
  input.marketContext.regime = "UNKNOWN";
  input.marketContext.confidence = "UNKNOWN";
  input.marketContext.quality = {
    status: "PARTIAL",
    ageMs: 0,
    reasonCodes: ["regime_not_evaluated"],
  };
  input.marketContext.uncertainty = mutableClone(uncertainty("LOW", "UNKNOWN"));
  const result = qualifyM3Signal(input);
  assert.equal(result.qualification?.setupGrade, "UNKNOWN");
  assert.equal(result.status, "ABSTAINED_UNCALIBRATED");
});

test("invalid structure and constrained space cannot be upgraded by other strengths", () => {
  const structureInput = mutableFixture(FAMILY_FIXTURES[1]);
  structureInput.analysis.structureState = "BREAKOUT_FAILED_RETURNED_INSIDE";
  assert.equal(
    qualifyM3Signal(structureInput).qualification?.setupGrade,
    "INVALID",
  );

  const spaceInput = mutableFixture();
  spaceInput.analysis.spaceQuality = "CONSTRAINED";
  assert.equal(
    qualifyM3Signal(spaceInput).qualification?.setupGrade,
    "INVALID",
  );
});

test("rejects Candidate Priority, total score and decision fields at the qualification boundary", () => {
  for (const pollution of [
    { candidatePriority: "P0" },
    { totalScore: 99 },
    { actionState: "TRADE_PLAN_READY" },
    { entry: "100", stop: "98", target: "110" },
  ]) {
    const input = { ...rawFixture(), ...pollution };
    const result = qualifyM3Signal(input);
    assert.equal(result.status, "BLOCKED");
    assert(result.reasonCodes.includes("signal_qualification_input_schema_rejected"));
  }
});

test("rejects cross-release, identity, context and evidence-coverage splicing", () => {
  const mutations: Array<(input: DeepMutable<M3SignalQualificationInput>) => void> = [
    (input) => {
      input.analysis.releaseId = "other-release";
    },
    (input) => {
      input.analysis.evidencePackageId = "other-package";
    },
    (input) => {
      input.analysis.marketContextSnapshotId = "other-context";
    },
    (input) => {
      input.analysis.evidenceItemIds.pop();
    },
  ];
  for (const mutate of mutations) {
    const input = mutableFixture();
    mutate(input);
    assert.equal(qualifyM3Signal(input).status, "BLOCKED");
  }
});

test("uncalibrated output exposes no invented probability, interval or sample", () => {
  const qualification = qualifyM3Signal(fixture()).qualification;
  assert.notEqual(qualification, null);
  for (const calibration of [
    qualification!.evidenceCalibration,
    qualification!.setupCalibration,
  ]) {
    assert.equal(calibration.status, "UNCALIBRATED");
    assert.equal(calibration.sampleSize, 0);
    assert.equal(calibration.estimatedProbability, null);
    assert.equal(calibration.confidenceInterval, null);
    assert.equal(calibration.reliabilityError, null);
    assert(calibration.abstainReasonCodes.length > 0);
  }
});

test("runtime schema rejects fabricated calibration metrics and authority", () => {
  const qualification = qualifyM3Signal(fixture()).qualification!;
  const fakeProbability = mutableClone(qualification);
  fakeProbability.evidenceCalibration.estimatedProbability = 0.8;
  assert.equal(SignalQualificationSchema.safeParse(fakeProbability).success, false);

  const fakeAuthority = mutableClone(qualification);
  fakeAuthority.qualificationAuthority = "REPLAY_CALIBRATED";
  assert.equal(SignalQualificationSchema.safeParse(fakeAuthority).success, false);

  const inflatedEvidence = mutableClone(qualification);
  inflatedEvidence.evidenceAssessment.independenceStatus = "FAIL";
  inflatedEvidence.evidenceAssessment.independentGroupCount = 0;
  assert.equal(
    SignalQualificationSchema.safeParse(inflatedEvidence).success,
    false,
  );

  const inflatedSetup = mutableClone(qualification);
  inflatedSetup.setupAssessment.locationStatus = "FAIL";
  assert.equal(SignalQualificationSchema.safeParse(inflatedSetup).success, false);
});

test("runtime schema requires a real calibrated cohort and untouched holdout", () => {
  assert.equal(
    SignalQualificationSchema.safeParse(calibratedQualification()).success,
    true,
  );
  for (const field of ["calibrationCohortId", "untouchedHoldoutId"] as const) {
    const invalid = calibratedQualification();
    invalid.evidenceCalibration[field] = null;
    assert.equal(SignalQualificationSchema.safeParse(invalid).success, false);
  }

  const futureCalibration = calibratedQualification();
  futureCalibration.setupCalibration.evaluatedAt =
    "2026-01-15T00:00:31.000Z";
  assert.equal(
    SignalQualificationSchema.safeParse(futureCalibration).success,
    false,
  );
});

test("runtime schema rejects undersized or abstaining calibrated samples", () => {
  const undersized = calibratedQualification();
  undersized.setupCalibration.sampleSize = 59;
  assert.equal(SignalQualificationSchema.safeParse(undersized).success, false);

  const abstaining = calibratedQualification();
  abstaining.evidenceCalibration.abstainReasonCodes = ["coverage_not_reliable"];
  assert.equal(SignalQualificationSchema.safeParse(abstaining).success, false);
});

test("runtime schema requires broad regime coverage including the active segment", () => {
  const narrow = calibratedQualification();
  narrow.evidenceCalibration.coveredRegimes = ["TREND", "TRANSITION"];
  assert.equal(SignalQualificationSchema.safeParse(narrow).success, false);

  const wrongSegment = calibratedQualification();
  wrongSegment.evidenceCalibration.coveredRegimes = [
    "TREND",
    "RANGE",
    "STRESS",
  ];
  assert.equal(SignalQualificationSchema.safeParse(wrongSegment).success, false);
});

test("rejects outcome and future labels before they can affect qualification", () => {
  const valid = mutableFixture();
  const input = {
    ...valid,
    evidence: {
      ...valid.evidence,
      items: [
        {
          ...valid.evidence.items[0]!,
          outcome: "WIN",
          mfe: 12,
        },
        ...valid.evidence.items.slice(1),
      ],
    },
  };
  const result = qualifyM3Signal(input);
  assert.equal(result.status, "BLOCKED");
  assert(result.reasonCodes.includes("signal_qualification_input_schema_rejected"));
});

test("qualification output contains no strategy, risk or READY payload", () => {
  const qualification = qualifyM3Signal(fixture()).qualification as unknown as
    Record<string, unknown>;
  for (const forbidden of [
    "entry",
    "stop",
    "target",
    "rewardRisk",
    "positionSize",
    "leverage",
    "actionState",
    "userFit",
    "executablePlan",
  ]) {
    assert.equal(forbidden in qualification, false);
  }
});

test("is deterministic and deeply freezes the qualification artifact", () => {
  const first = qualifyM3Signal(fixture());
  const second = qualifyM3Signal(fixture());
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.qualification), true);
  assert.equal(Object.isFrozen(first.qualification?.evidenceAssessment), true);
  assert.equal(Object.isFrozen(first.qualification?.setupCalibration), true);
});
