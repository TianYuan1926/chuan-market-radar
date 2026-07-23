import assert from "node:assert/strict";
import test from "node:test";
import type { M3FinalDecisionBundle } from "./m3-final-decision-contract";
import {
  assessM3FinalDecisionBundle,
  M3FinalDecisionBundleSchema,
  M3_FINAL_DECISION_CONTRACT_VERSION,
} from "./m3-final-decision-contract";

const RELEASE = "release-m3-contract";
const BASE = "2026-01-15T00:00:00.000Z";
const CUTOFF = "2026-01-15T00:00:10.000Z";
const DECIDED = "2026-01-15T00:00:30.000Z";

type BundleOptions = {
  authorized?: boolean;
  triggerStatus?: "NOT_EVALUATED" | "PENDING" | "CONFIRMED" | "INVALIDATED" | "EXPIRED";
  actionState?: "OBSERVE" | "WAIT" | "BLOCKED" | "TRADE_PLAN_READY";
  evidenceGrade?: "A" | "B" | "C" | "INSUFFICIENT";
  setupGrade?: "PREMIUM" | "QUALIFIED" | "MARGINAL" | "INVALID" | "UNKNOWN";
};

const fresh = { status: "FRESH", ageMs: 0, reasonCodes: [] } as const;
const uncertainty = {
  data: {
    dimension: "data",
    status: "LOW",
    reasonCodes: [],
    sampleSize: 100,
    calibrationVersion: "calibration-m3.v1",
    lastValidatedAt: BASE,
  },
  model: {
    dimension: "model",
    status: "LOW",
    reasonCodes: [],
    sampleSize: 100,
    calibrationVersion: "calibration-m3.v1",
    lastValidatedAt: BASE,
  },
  market: {
    dimension: "market",
    status: "LOW",
    reasonCodes: [],
    sampleSize: 100,
    calibrationVersion: "calibration-m3.v1",
    lastValidatedAt: BASE,
  },
  execution: {
    dimension: "execution",
    status: "LOW",
    reasonCodes: [],
    sampleSize: 100,
    calibrationVersion: "calibration-m3.v1",
    lastValidatedAt: BASE,
  },
} as const;

function trace(
  producerModule: string,
  schemaVersion: string,
  generatedAt = "2026-01-15T00:00:20.000Z",
) {
  return {
    schemaVersion,
    releaseId: RELEASE,
    producerModule,
    generatedAt,
    sourceCutoff: CUTOFF,
    contentHash: `sha256:${producerModule}-${schemaVersion}`,
  };
}

function readyPlan() {
  return {
    planId: "plan-m3-one",
    direction: "LONG",
    entryTrigger: "retest holds after a close above resistance",
    plannedEntryZone: {
      lower: "100",
      upper: "101",
      sourceLevelIds: ["level-resistance"],
    },
    structuralInvalidation: "retest closes below reclaimed resistance",
    structuralStop: "98",
    targets: [
      {
        targetId: "target-prior-high",
        price: "111",
        allocationPercent: 100,
        source: "PRIOR_EXTREME",
        sourceLevelIds: ["level-prior-high"],
      },
    ],
    structuralRewardRisk: 3.333333,
    estimatedNetRewardRisk: 3.072809,
    expiresAt: "2026-01-15T00:15:00.000Z",
    noChaseCondition: "do not enter above 101",
  } as const;
}

function fixtureDecisionReasonCodes(
  authorized: boolean,
  triggerStatus: NonNullable<BundleOptions["triggerStatus"]>,
  evidenceGrade: NonNullable<BundleOptions["evidenceGrade"]>,
  setupGrade: NonNullable<BundleOptions["setupGrade"]>,
): string[] {
  if (!authorized) {
    return [
      "candidate_emission_not_authorized",
      "candidate_episode_not_promoted",
      "final_decision_authority_not_enabled",
      "m1_engineering_exit_not_passed",
      "m2_lifecycle_gate_not_passed",
      "signal_qualification_calibration_abstained",
      "strategy_draft_has_blockers",
      "test_only_scope_has_no_decision_authority",
    ];
  }
  if (evidenceGrade === "INSUFFICIENT") {
    return ["evidence_grade_insufficient"];
  }
  if (setupGrade === "INVALID") {
    return ["setup_grade_invalid"];
  }
  if (setupGrade === "UNKNOWN") {
    return ["setup_grade_unknown"];
  }
  if (evidenceGrade === "C" || setupGrade === "MARGINAL") {
    return [
      ...(evidenceGrade === "C" ? ["evidence_grade_c_observe"] : []),
      ...(setupGrade === "MARGINAL" ? ["setup_grade_marginal_observe"] : []),
    ];
  }
  if (triggerStatus === "NOT_EVALUATED") {
    return ["entry_trigger_not_evaluated"];
  }
  if (triggerStatus === "INVALIDATED") {
    return ["entry_trigger_invalidated"];
  }
  if (triggerStatus === "EXPIRED") {
    return ["entry_trigger_expired"];
  }
  if (triggerStatus === "PENDING") {
    return ["entry_trigger_pending"];
  }
  return ["all_final_decision_gates_passed"];
}

function bundle(
  options: BundleOptions = {},
): M3FinalDecisionBundle {
  const authorized = options.authorized ?? true;
  const triggerStatus = options.triggerStatus ?? "CONFIRMED";
  const actionState = options.actionState ?? (authorized ? "TRADE_PLAN_READY" : "BLOCKED");
  const evidenceGrade = options.evidenceGrade ?? "A";
  const setupGrade = options.setupGrade ?? "PREMIUM";
  const plan = readyPlan();
  return M3FinalDecisionBundleSchema.parse({
    schemaVersion: M3_FINAL_DECISION_CONTRACT_VERSION,
    authorization: {
      schemaVersion: "m3-decision-authorization.v1",
      releaseId: RELEASE,
      decisionScope: authorized ? "REPLAY" : "TEST_ONLY",
      m1EngineeringExitStatus: authorized ? "PASS" : "BLOCKED",
      m2LifecycleGateStatus: authorized ? "PASS" : "INSUFFICIENT",
      candidateEmissionAllowed: authorized,
      finalDecisionAuthorityEnabled: authorized,
      productionWriteAuthorityEnabled: false,
      authorizedAt: authorized ? "2026-01-15T00:00:05.000Z" : null,
      evidenceIds: authorized ? ["m1-exit", "m2-audit"] : [],
    },
    episode: {
      ...trace("candidate_lifecycle_opportunity_thesis", "candidate-episode.v2"),
      episodeId: "episode-m3-one",
      episodeKey: "episode-key-m3-one",
      canonicalInstrumentId: "BINANCE_FUTURES:TESTUSDT:LINEAR_PERPETUAL:USDT",
      underlyingGroupId: "TEST:USDT_LINEAR_PERPETUAL",
      opportunityFamily: "BREAKOUT_RETEST",
      opportunityPatterns: ["ROLE_FLIP_RETEST"],
      directionHypothesis: "LONG",
      episodeWindow: {
        policyVersion: "episode-window.v1",
        windowStart: BASE,
        windowEnd: "2026-01-15T00:20:00.000Z",
      },
      lifecycle: authorized ? "PROMOTED" : "DISCOVERED",
      previousLifecycle: authorized ? "EVIDENCE_READY" : null,
      transitionKind: authorized ? "STATE_TRANSITION" : "CREATED",
      priority: "P1",
      priorityPolicyVersion: "priority.v1",
      thesisId: "thesis-m3-one",
      candidateIds: ["candidate-m3-one"],
      firstSeenAt: "2026-01-15T00:00:11.000Z",
      lastSeenAt: "2026-01-15T00:00:12.000Z",
      expiresAt: "2026-01-15T00:20:00.000Z",
      transitionedAt: "2026-01-15T00:00:20.000Z",
      transitionReasonCodes: [authorized ? "evidence_promoted" : "candidate_created"],
      rowVersion: authorized ? 2 : 1,
      idempotencyKey: "episode-m3-one:2",
      outboxEventId: "outbox-m3-one:2",
    },
    thesis: {
      ...trace("candidate_lifecycle_opportunity_thesis", "opportunity-thesis.v2"),
      thesisId: "thesis-m3-one",
      episodeId: "episode-m3-one",
      thesisVersion: 1,
      thesisAuthority: "VALIDATION_HYPOTHESIS_ONLY",
      canonicalInstrumentId: "BINANCE_FUTURES:TESTUSDT:LINEAR_PERPETUAL:USDT",
      underlyingGroupId: "TEST:USDT_LINEAR_PERPETUAL",
      opportunityFamily: "BREAKOUT_RETEST",
      opportunityPatterns: ["ROLE_FLIP_RETEST"],
      directionHypothesis: "LONG",
      detectorSources: [
        {
          candidateId: "candidate-m3-one",
          detectorId: "role-flip-retest-long",
          detectorVersion: "role-flip-retest-long.v1",
          detectorLifecycle: "REPLAY_VALIDATED",
          emissionScope: "REPLAY",
          opportunityPattern: "ROLE_FLIP_RETEST",
          firstDetectedAt: "2026-01-15T00:00:11.000Z",
          candidateSourceCutoff: CUTOFF,
        },
      ],
      firstDetectedAt: "2026-01-15T00:00:11.000Z",
      updatedAt: "2026-01-15T00:00:20.000Z",
      supportingReasons: ["retest_hypothesis"],
      conflictingReasons: [],
      knownUnknowns: [],
      uncertainty,
    },
    evidence: {
      ...trace("deep_validation", "evidence-package.v2"),
      evidencePackageId: "evidence-m3-one",
      episodeId: "episode-m3-one",
      thesisId: "thesis-m3-one",
      items: [
        {
          evidenceId: "evidence-item-m3-one",
          category: "structure",
          stance: "SUPPORTING",
          criticality: "REQUIRED",
          factIds: ["fact-m3-one"],
          featureIds: ["feature-m3-one"],
          independenceGroupIds: ["source-group-m3-one"],
          observedAt: "2026-01-15T00:00:10.000Z",
          quality: fresh,
          reasonCodes: ["role_flip_retest_confirmed"],
        },
        {
          evidenceId: "evidence-item-m3-two",
          category: "location",
          stance: "SUPPORTING",
          criticality: "REQUIRED",
          factIds: ["fact-m3-two"],
          featureIds: [],
          independenceGroupIds: ["source-group-m3-two"],
          observedAt: "2026-01-15T00:00:10.000Z",
          quality: fresh,
          reasonCodes: ["structural_location_confirmed"],
        },
        {
          evidenceId: "evidence-item-m3-three",
          category: "space",
          stance: "SUPPORTING",
          criticality: "REQUIRED",
          factIds: ["fact-m3-three"],
          featureIds: [],
          independenceGroupIds: ["source-group-m3-three"],
          observedAt: "2026-01-15T00:00:10.000Z",
          quality: fresh,
          reasonCodes: ["structural_space_confirmed"],
        },
      ],
      completenessRatio: 1,
      uncertainty,
      quality: fresh,
    },
    analysis: {
      ...trace("family_analysis", "analysis-snapshot.v3"),
      analysisId: "analysis-m3-one",
      episodeId: "episode-m3-one",
      thesisId: "thesis-m3-one",
      evidencePackageId: "evidence-m3-one",
      evidenceItemIds: [
        "evidence-item-m3-one",
        "evidence-item-m3-two",
        "evidence-item-m3-three",
      ],
      marketContextSnapshotId: "market-context-m3-one",
      analyzerVersion: "breakout-retest-analyzer.v1",
      analysisAuthority: authorized
        ? "REPLAY_CALIBRATED"
        : "TEST_ONLY_UNCALIBRATED",
      opportunityFamily: "BREAKOUT_RETEST",
      directionBias: "LONG",
      structureState: "ROLE_FLIP_RETEST",
      marketStage: "EARLY_RETEST",
      locationQuality: "GOOD",
      spaceQuality: "GOOD",
      structuralLevels: [
        {
          levelId: "level-resistance",
          kind: "RESISTANCE",
          price: "100",
          timeframe: "15m",
          sourceFactIds: ["fact-m3-one"],
          reasonCodes: ["prior_resistance"],
        },
        {
          levelId: "level-prior-high",
          kind: "RESISTANCE",
          price: "111",
          timeframe: "1h",
          sourceFactIds: ["fact-m3-two"],
          reasonCodes: ["prior_extreme"],
        },
      ],
      supportingReasons: ["retest_acceptance"],
      counterEvidence: [],
      lateRisk: "LOW",
      fakeoutRisk: "LOW",
      noiseRisk: "LOW",
      uncertainty,
    },
    qualification: {
      ...trace("signal_qualification", "signal-qualification.v2"),
      qualificationId: "qualification-m3-one",
      episodeId: "episode-m3-one",
      thesisId: "thesis-m3-one",
      evidencePackageId: "evidence-m3-one",
      analysisId: "analysis-m3-one",
      marketContextSnapshotId: "market-context-m3-one",
      opportunityFamily: "BREAKOUT_RETEST",
      direction: "LONG",
      qualificationPolicyVersion: "m3-signal-qualification-policy.v1",
      qualificationAuthority: authorized
        ? "REPLAY_CALIBRATED"
        : "TEST_ONLY_UNCALIBRATED",
      evidenceGrade,
      setupGrade,
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
        status: authorized ? "CALIBRATED" : "UNCALIBRATED",
        calibrationVersion: authorized ? "evidence-calibration.v1" : null,
        targetDefinitionVersion: authorized
          ? "evidence-reliability-target.v1"
          : null,
        calibrationCohortId: authorized ? "cohort-evidence-m3-one" : null,
        untouchedHoldoutId: authorized ? "holdout-evidence-m3-one" : null,
        coveredRegimes: authorized
          ? ["TREND", "RANGE", "TRANSITION"]
          : [],
        sampleSize: authorized ? 100 : 0,
        estimatedProbability: authorized ? 0.8 : null,
        confidenceInterval: authorized ? [0.7, 0.9] : null,
        reliabilityError: authorized ? 0.05 : null,
        segment: {
          opportunityFamily: "BREAKOUT_RETEST",
          direction: "LONG",
          regime: "TREND",
        },
        evaluatedAt: authorized ? BASE : null,
        abstainReasonCodes: authorized
          ? []
          : ["fixture_evidence_calibration_absent"],
      },
      setupCalibration: {
        status: authorized ? "CALIBRATED" : "UNCALIBRATED",
        calibrationVersion: authorized ? "setup-calibration.v1" : null,
        targetDefinitionVersion: authorized
          ? "setup-follow-through-target.v1"
          : null,
        calibrationCohortId: authorized ? "cohort-setup-m3-one" : null,
        untouchedHoldoutId: authorized ? "holdout-setup-m3-one" : null,
        coveredRegimes: authorized
          ? ["TREND", "RANGE", "TRANSITION"]
          : [],
        sampleSize: authorized ? 100 : 0,
        estimatedProbability: authorized ? 0.75 : null,
        confidenceInterval: authorized ? [0.65, 0.85] : null,
        reliabilityError: authorized ? 0.06 : null,
        segment: {
          opportunityFamily: "BREAKOUT_RETEST",
          direction: "LONG",
          regime: "TREND",
        },
        evaluatedAt: authorized ? BASE : null,
        abstainReasonCodes: authorized
          ? []
          : ["fixture_setup_calibration_absent"],
      },
      reasonCodes: ["evidence_and_setup_independently_qualified"],
    },
    draft: {
      ...trace("strategy_construction", "strategy-draft.v2"),
      draftId: "draft-m3-one",
      episodeId: "episode-m3-one",
      analysisId: "analysis-m3-one",
      qualificationId: "qualification-m3-one",
      opportunityFamily: "BREAKOUT_RETEST",
      strategyAuthority: authorized
        ? "REPLAY_CALIBRATED"
        : "TEST_ONLY_UNCALIBRATED",
      analyzerVersion: "breakout-retest-analyzer.v1",
      qualificationPolicyVersion: "m3-signal-qualification-policy.v1",
      templateVersion: "breakout-retest-long.v1",
      bufferPolicyVersion: "structural-buffer.v1",
      costAssumptionSetId: "conservative-costs",
      costAssumptionVersion: "conservative-costs.v1",
      direction: plan.direction,
      referencePrice: "100.5",
      referencePriceFactIds: ["fact-m3-one"],
      whyNow: ["retest_acceptance"],
      whyNotNow: authorized
        ? []
        : [
          "strategy_authority_test_only_uncalibrated",
          "strategy_buffer_policy_uncalibrated",
          "strategy_cost_assumptions_uncalibrated",
        ],
      entryTrigger: plan.entryTrigger,
      plannedEntryZone: plan.plannedEntryZone,
      entryZoneBufferBps: 10,
      structuralInvalidation: plan.structuralInvalidation,
      structuralStopBase: "100",
      structuralStop: plan.structuralStop,
      structuralStopBufferBps: 20,
      structuralStopSourceLevelIds: ["level-resistance"],
      targets: plan.targets,
      rewardRiskCalculationVersion: "m3-conservative-reward-risk.v1",
      rewardRiskPrecision: 6,
      grossRewardRisk: plan.structuralRewardRisk,
      estimatedNetRewardRisk: plan.estimatedNetRewardRisk,
      feePerSideAssumptionBps: 4,
      slippagePerSideAssumptionBps: 5,
      fundingAssumptionBps: 1,
      totalConservativeCostBps: 19,
      confirmationWindow: "15m",
      expiresAt: plan.expiresAt,
      noChaseCondition: plan.noChaseCondition,
      partialTakeProfitPolicy: "Reduce at the first structural objective",
      counterEvidence: [],
      blockers: authorized
        ? []
        : [
          "strategy_authority_test_only_uncalibrated",
          "strategy_buffer_policy_uncalibrated",
          "strategy_cost_assumptions_uncalibrated",
        ],
    },
    feasibility: {
      ...trace("execution_feasibility_final_decision", "execution-feasibility-snapshot.v1", "2026-01-15T00:00:25.000Z"),
      feasibilityId: "feasibility-m3-one",
      draftId: "draft-m3-one",
      status: "PASS",
      checks: [
        {
          checkId: "spread-check",
          status: "PASS",
          observedValue: 3,
          thresholdVersion: "execution-threshold.v1",
          reasonCodes: ["spread_within_limit"],
        },
      ],
      estimatedNetRewardRisk: plan.estimatedNetRewardRisk,
      maximumExecutableNotional: "1000",
      quality: fresh,
      uncertainty,
    },
    trigger: {
      schemaVersion: "m3-entry-trigger-observation.v1",
      status: triggerStatus,
      observedAt: "2026-01-15T00:00:26.000Z",
      sourceCutoff: "2026-01-15T00:00:24.000Z",
      factIds: triggerStatus === "CONFIRMED" ? ["trigger-fact-m3-one"] : [],
      quality: fresh,
      reasonCodes: [triggerStatus.toLowerCase()],
    },
    runtime: {
      schemaVersion: "m3-runtime-decision-gate.v1",
      releaseId: RELEASE,
      status: "READY",
      checkedAt: "2026-01-15T00:00:27.000Z",
      sourceCutoff: "2026-01-15T00:00:24.000Z",
      reasonCodes: ["runtime_ready"],
    },
    decision: {
      ...trace("execution_feasibility_final_decision", "strategy-decision.v1", DECIDED),
      sourceCutoff: "2026-01-15T00:00:24.000Z",
      decisionId: "decision-m3-one",
      episodeId: "episode-m3-one",
      draftId: "draft-m3-one",
      feasibilityId: "feasibility-m3-one",
      reasonCodes: fixtureDecisionReasonCodes(
        authorized,
        triggerStatus,
        evidenceGrade,
        setupGrade,
      ),
      decidedAt: DECIDED,
      actionState,
      executablePlan: actionState === "TRADE_PLAN_READY" ? plan : null,
    },
  });
}

test("accepts an authorized replay READY only when every hard gate passes", () => {
  const assessment = assessM3FinalDecisionBundle(bundle());
  assert.equal(assessment.validationStatus, "PASS");
  assert.equal(assessment.authorityStatus, "AUTHORIZED");
  assert.equal(assessment.expectedActionState, "TRADE_PLAN_READY");
  assert.equal(assessment.executablePlanExposureAllowed, true);
  assert.deepEqual(assessment.issues, []);
});

test("keeps the current draft lifecycle test-only and planless", () => {
  const assessment = assessM3FinalDecisionBundle(bundle({ authorized: false }));
  assert.equal(assessment.validationStatus, "PASS");
  assert.equal(assessment.authorityStatus, "NOT_AUTHORIZED");
  assert.equal(assessment.expectedActionState, "BLOCKED");
  assert.equal(assessment.executablePlanExposureAllowed, false);
  assert.ok(assessment.reasonCodes.includes("m2_lifecycle_gate_not_passed"));
  assert.ok(assessment.reasonCodes.includes("test_only_scope_has_no_decision_authority"));
});

test("rejects a forged READY while M1 and M2 authority remain closed", () => {
  const forged = bundle({ authorized: false, actionState: "TRADE_PLAN_READY" });
  const assessment = assessM3FinalDecisionBundle(forged);
  assert.equal(assessment.validationStatus, "BLOCKED");
  assert.equal(assessment.executablePlanExposureAllowed, false);
  assert.ok(assessment.issues.some((item) => item.code === "decision_state_mismatch"));
});

test("rejects a DRAFT detector before it can enter the M3 contract", () => {
  const invalid = structuredClone(bundle({ authorized: false }));
  invalid.thesis.detectorSources[0]!.detectorLifecycle = "DRAFT";
  const assessment = assessM3FinalDecisionBundle(invalid);
  assert.equal(assessment.validationStatus, "BLOCKED");
  assert.equal(assessment.expectedActionState, null);
  assert.ok(assessment.reasonCodes.includes("bundle_schema_rejected"));
});

test("maps a pending trigger to WAIT without exposing a plan", () => {
  const assessment = assessM3FinalDecisionBundle(bundle({
    triggerStatus: "PENDING",
    actionState: "WAIT",
  }));
  assert.equal(assessment.validationStatus, "PASS");
  assert.equal(assessment.expectedActionState, "WAIT");
  assert.equal(assessment.executablePlanExposureAllowed, false);
});

test("keeps C evidence or a marginal setup at OBSERVE", () => {
  for (const input of [
    bundle({ evidenceGrade: "C", actionState: "OBSERVE" }),
    bundle({ setupGrade: "MARGINAL", actionState: "OBSERVE" }),
  ]) {
    const assessment = assessM3FinalDecisionBundle(input);
    assert.equal(assessment.validationStatus, "PASS");
    assert.equal(assessment.expectedActionState, "OBSERVE");
    assert.equal(assessment.executablePlanExposureAllowed, false);
  }
});

test("blocks invalid, unknown or insufficient qualification", () => {
  for (const input of [
    bundle({ evidenceGrade: "INSUFFICIENT", actionState: "BLOCKED" }),
    bundle({ setupGrade: "INVALID", actionState: "BLOCKED" }),
    bundle({ setupGrade: "UNKNOWN", actionState: "BLOCKED" }),
  ]) {
    const assessment = assessM3FinalDecisionBundle(input);
    assert.equal(assessment.validationStatus, "PASS");
    assert.equal(assessment.expectedActionState, "BLOCKED");
  }
});

test("rejects a READY plan whose prices are altered after strategy construction", () => {
  const valid = bundle();
  const tampered = structuredClone(valid);
  if (tampered.decision.executablePlan === null) {
    throw new Error("fixture must be ready");
  }
  tampered.decision.executablePlan.targets[0]!.price = "120";
  const assessment = assessM3FinalDecisionBundle(tampered);
  assert.equal(assessment.validationStatus, "BLOCKED");
  assert.ok(
    assessment.issues.some((item) =>
      item.code === "ready_plan_upstream_parity_mismatch"
    ),
  );
});

test("rejects release and artifact lineage splicing", () => {
  const valid = bundle();
  const spliced = structuredClone(valid);
  spliced.evidence.releaseId = "another-release";
  spliced.qualification.analysisId = "another-analysis";
  const assessment = assessM3FinalDecisionBundle(spliced);
  assert.equal(assessment.validationStatus, "BLOCKED");
  assert.ok(
    assessment.issues.some((item) => item.code === "cross_release_composition_forbidden"),
  );
  assert.ok(
    assessment.issues.some((item) => item.code === "artifact_identity_lineage_mismatch"),
  );
});

test("rejects decisions that predate their trigger or runtime gate", () => {
  const valid = bundle();
  const futureGate = structuredClone(valid);
  futureGate.trigger.observedAt = "2026-01-15T00:01:00.000Z";
  futureGate.runtime.checkedAt = "2026-01-15T00:01:00.000Z";
  const assessment = assessM3FinalDecisionBundle(futureGate);
  assert.equal(assessment.validationStatus, "BLOCKED");
  assert.ok(
    assessment.issues.some((item) => item.code === "decision_precedes_trigger_observation"),
  );
  assert.ok(
    assessment.issues.some((item) => item.code === "decision_precedes_runtime_gate"),
  );
});

test("rejects trigger and runtime gates that predate their upstream artifacts", () => {
  const staleGates = structuredClone(bundle());
  staleGates.trigger.observedAt = "2026-01-15T00:00:19.000Z";
  staleGates.trigger.sourceCutoff = "2026-01-15T00:00:18.000Z";
  staleGates.runtime.checkedAt = "2026-01-15T00:00:24.000Z";
  staleGates.runtime.sourceCutoff = "2026-01-15T00:00:09.000Z";
  const assessment = assessM3FinalDecisionBundle(staleGates);
  assert.equal(assessment.validationStatus, "BLOCKED");
  assert.ok(
    assessment.issues.some((item) => item.code === "trigger_precedes_strategy_draft"),
  );
  assert.ok(
    assessment.issues.some((item) => item.code === "runtime_gate_precedes_feasibility"),
  );
});

test("rejects a decision that hides its derived gate reasons", () => {
  const hiddenReasons = structuredClone(bundle({ triggerStatus: "PENDING", actionState: "WAIT" }));
  hiddenReasons.decision.reasonCodes = ["generic_wait"];
  const assessment = assessM3FinalDecisionBundle(hiddenReasons);
  assert.equal(assessment.validationStatus, "BLOCKED");
  assert.ok(
    assessment.issues.some((item) => item.code === "decision_reason_codes_incomplete"),
  );
});

test("rejects production write authority without final-decision authority", () => {
  const contradictory = structuredClone(bundle({ authorized: false }));
  contradictory.authorization.decisionScope = "PRODUCTION";
  contradictory.authorization.productionWriteAuthorityEnabled = true;
  const assessment = assessM3FinalDecisionBundle(contradictory);
  assert.equal(assessment.validationStatus, "BLOCKED");
  assert.equal(assessment.expectedActionState, null);
  assert.ok(assessment.reasonCodes.includes("bundle_schema_rejected"));
});

test("rejects family analysis that silently drops counter evidence", () => {
  const hiddenCounter = structuredClone(bundle());
  hiddenCounter.evidence.items.push({
    evidenceId: "evidence-item-hidden-counter",
    category: "counter_structure",
    stance: "CONTRADICTING",
    criticality: "SUPPLEMENTAL",
    factIds: ["fact-hidden-counter"],
    featureIds: [],
    independenceGroupIds: ["source-group-hidden-counter"],
    observedAt: CUTOFF,
    quality: { status: "FRESH", ageMs: 0, reasonCodes: [] },
    reasonCodes: ["price_returned_inside_structure"],
  });
  const assessment = assessM3FinalDecisionBundle(hiddenCounter);
  assert.equal(assessment.validationStatus, "BLOCKED");
  assert.ok(
    assessment.issues.some((item) =>
      item.code === "analysis_evidence_item_lineage_incomplete"
    ),
  );
});

test("rejects uncalibrated family analysis in an authorized replay decision", () => {
  const uncalibrated = structuredClone(bundle());
  uncalibrated.analysis.analysisAuthority = "TEST_ONLY_UNCALIBRATED";
  uncalibrated.decision.reasonCodes = [
    "family_analysis_authority_not_calibrated_for_scope",
  ];
  uncalibrated.decision.actionState = "BLOCKED";
  uncalibrated.decision.executablePlan = null;
  const assessment = assessM3FinalDecisionBundle(uncalibrated);
  assert.equal(assessment.validationStatus, "PASS");
  assert.equal(assessment.authorityStatus, "NOT_AUTHORIZED");
  assert.equal(assessment.expectedActionState, "BLOCKED");
  assert.ok(
    assessment.reasonCodes.includes(
      "family_analysis_authority_not_calibrated_for_scope",
    ),
  );
});

test("rejects uncalibrated signal qualification in an authorized replay decision", () => {
  const uncalibrated = structuredClone(bundle());
  uncalibrated.qualification.qualificationAuthority =
    "TEST_ONLY_UNCALIBRATED";
  for (const calibration of [
    uncalibrated.qualification.evidenceCalibration,
    uncalibrated.qualification.setupCalibration,
  ]) {
    calibration.status = "UNCALIBRATED";
    calibration.calibrationVersion = null;
    calibration.targetDefinitionVersion = null;
    calibration.calibrationCohortId = null;
    calibration.untouchedHoldoutId = null;
    calibration.coveredRegimes = [];
    calibration.sampleSize = 0;
    calibration.estimatedProbability = null;
    calibration.confidenceInterval = null;
    calibration.reliabilityError = null;
    calibration.evaluatedAt = null;
    calibration.abstainReasonCodes = ["real_calibration_absent"];
  }
  uncalibrated.decision.reasonCodes = [
    "signal_qualification_calibration_abstained",
    "signal_qualification_authority_not_calibrated_for_scope",
  ];
  uncalibrated.decision.actionState = "BLOCKED";
  uncalibrated.decision.executablePlan = null;
  const assessment = assessM3FinalDecisionBundle(uncalibrated);
  assert.equal(assessment.validationStatus, "PASS");
  assert.equal(assessment.authorityStatus, "NOT_AUTHORIZED");
  assert.equal(assessment.expectedActionState, "BLOCKED");
  assert.ok(
    assessment.reasonCodes.includes(
      "signal_qualification_authority_not_calibrated_for_scope",
    ),
  );
});

test("rejects a strategy authority calibrated for the wrong decision scope", () => {
  const wrongScope = structuredClone(bundle());
  wrongScope.draft.strategyAuthority = "SHADOW_CALIBRATED";
  wrongScope.decision.reasonCodes = [
    "strategy_authority_not_calibrated_for_scope",
  ];
  wrongScope.decision.actionState = "BLOCKED";
  wrongScope.decision.executablePlan = null;
  const assessment = assessM3FinalDecisionBundle(wrongScope);
  assert.equal(assessment.validationStatus, "PASS");
  assert.equal(assessment.authorityStatus, "NOT_AUTHORIZED");
  assert.equal(assessment.expectedActionState, "BLOCKED");
  assert.ok(assessment.reasonCodes.includes(
    "strategy_authority_not_calibrated_for_scope",
  ));
});

test("rejects strategy family and policy lineage splicing", () => {
  const spliced = structuredClone(bundle());
  spliced.draft.opportunityFamily = "PRE_MOVE";
  spliced.draft.analyzerVersion = "another-analyzer.v1";
  spliced.draft.qualificationPolicyVersion = "another-qualification-policy.v1";
  const assessment = assessM3FinalDecisionBundle(spliced);
  assert.equal(assessment.validationStatus, "BLOCKED");
  assert.ok(assessment.issues.some(
    (item) => item.code === "opportunity_family_lineage_mismatch",
  ));
  assert.ok(assessment.issues.filter(
    (item) => item.code === "artifact_identity_lineage_mismatch",
  ).length >= 2);
});

test("recalculates strategy RR and rejects hand-edited performance claims", () => {
  const inflated = structuredClone(bundle());
  inflated.draft.grossRewardRisk += 1;
  inflated.draft.estimatedNetRewardRisk += 1;
  const assessment = assessM3FinalDecisionBundle(inflated);
  assert.equal(assessment.validationStatus, "BLOCKED");
  assert.ok(assessment.issues.some(
    (item) => item.code === "strategy_reward_risk_calculation_mismatch",
  ));
});

test("rejects strategy levels that are not present at the analyzed prices", () => {
  const invented = structuredClone(bundle());
  invented.draft.targets[0]!.sourceLevelIds = ["invented-target-level"];
  invented.draft.structuralStopBase = "99";
  const assessment = assessM3FinalDecisionBundle(invented);
  assert.equal(assessment.validationStatus, "BLOCKED");
  assert.ok(assessment.issues.some(
    (item) => item.code === "strategy_level_lineage_missing",
  ));
  assert.ok(assessment.issues.some(
    (item) => item.code === "strategy_stop_base_level_price_mismatch",
  ));
});

test("strictly rejects unknown fields instead of silently accepting future material", () => {
  const unknownField = {
    ...bundle(),
    futureOutcome: { mfe: 99 },
  };
  const assessment = assessM3FinalDecisionBundle(unknownField);
  assert.equal(assessment.validationStatus, "BLOCKED");
  assert.equal(assessment.expectedActionState, null);
  assert.equal(assessment.reasonCodes[0], "bundle_schema_rejected");
});

test("assessment output is deterministic and deeply frozen", () => {
  const first = assessM3FinalDecisionBundle(bundle());
  const second = assessM3FinalDecisionBundle(bundle());
  assert.equal(first.assessmentHash, second.assessmentHash);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.issues), true);
});
