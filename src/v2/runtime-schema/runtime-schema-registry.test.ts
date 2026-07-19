import assert from "node:assert/strict";
import test from "node:test";
import { MODULE_REGISTRY, type ModuleId } from "../domain/module-registry";
import type { UncertaintyVector } from "../domain/uncertainty";
import {
  RUNTIME_SCHEMA_NAMES,
  RUNTIME_SCHEMA_REGISTRY,
  type RuntimeArtifactByName,
} from "./registry";
import {
  RUNTIME_OBJECT_SCHEMA_VERSIONS,
  type RuntimeObjectAuthorityOutputName,
} from "./schema-versions";

const SOURCE_CUTOFF = "2026-01-15T00:00:00.000Z";
const GENERATED_AT = "2026-01-15T00:01:00.000Z";
const EXPIRES_AT = "2026-01-15T00:16:00.000Z";

function trace<
  const ArtifactName extends RuntimeObjectAuthorityOutputName,
  const Producer extends ModuleId,
>(artifactName: ArtifactName, producerModule: Producer) {
  return {
    schemaVersion: RUNTIME_OBJECT_SCHEMA_VERSIONS[artifactName],
    releaseId: "release-fixture-1",
    producerModule,
    generatedAt: GENERATED_AT,
    sourceCutoff: SOURCE_CUTOFF,
    contentHash: `sha256:${producerModule}`,
  } as const;
}

const freshQuality = {
  status: "FRESH",
  ageMs: 0,
  reasonCodes: [],
} as const;

const partialQuality = {
  status: "PARTIAL",
  ageMs: 0,
  reasonCodes: ["fixture_context_scope_partial"],
} as const;

function uncertainty(): UncertaintyVector {
  return {
    data: {
      dimension: "data",
      status: "LOW",
      reasonCodes: [],
      sampleSize: 100,
      calibrationVersion: "calibration-fixture.v1",
      lastValidatedAt: GENERATED_AT,
    },
    model: {
      dimension: "model",
      status: "LOW",
      reasonCodes: [],
      sampleSize: 100,
      calibrationVersion: "calibration-fixture.v1",
      lastValidatedAt: GENERATED_AT,
    },
    market: {
      dimension: "market",
      status: "LOW",
      reasonCodes: [],
      sampleSize: 100,
      calibrationVersion: "calibration-fixture.v1",
      lastValidatedAt: GENERATED_AT,
    },
    execution: {
      dimension: "execution",
      status: "LOW",
      reasonCodes: [],
      sampleSize: 100,
      calibrationVersion: "calibration-fixture.v1",
      lastValidatedAt: GENERATED_AT,
    },
  };
}

const entryZone = {
  lower: "100",
  upper: "101",
  sourceLevelIds: ["support-fixture-1"],
} as const;

const target = {
  targetId: "target-fixture-1",
  price: "110",
  allocationPercent: 100,
  source: "PRIOR_EXTREME",
  sourceLevelIds: ["resistance-fixture-1"],
} as const;

const executablePlan = {
  planId: "plan-fixture-1",
  direction: "LONG",
  entryTrigger: "Close and retest above the structural level",
  plannedEntryZone: entryZone,
  structuralInvalidation: "Close below reclaimed support",
  structuralStop: "98",
  targets: [target],
  structuralRewardRisk: 3.5,
  estimatedNetRewardRisk: 3.2,
  expiresAt: EXPIRES_AT,
  noChaseCondition: "Do not enter above the planned zone",
} as const;

const decision = {
  ...trace("StrategyDecision", "execution_feasibility_final_decision"),
  decisionId: "decision-fixture-1",
  episodeId: "episode-fixture-1",
  draftId: "draft-fixture-1",
  feasibilityId: "feasibility-fixture-1",
  reasonCodes: ["all_hard_gates_passed"],
  decidedAt: GENERATED_AT,
  actionState: "TRADE_PLAN_READY",
  executablePlan,
} as const;

const fixtures: RuntimeArtifactByName = {
  EligibleInstrumentSnapshot: {
    ...trace("EligibleInstrumentSnapshot", "universe_registry"),
    snapshotId: "universe-fixture-1",
    policyVersion: "target-venue-policy.v1",
    observedCount: 1,
    eligibleCount: 1,
    accounting: [
      {
        observationId: "observation-fixture-1",
        canonicalInstrumentId: "BINANCE_FUTURES:BTCUSDT:LINEAR_PERPETUAL:USDT",
        underlyingGroupId: "BTC:USDT_LINEAR_PERPETUAL",
        venue: "BINANCE_FUTURES",
        venueInstrumentId: "BTCUSDT",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        settlementAsset: "USDT",
        contractType: "LINEAR_PERPETUAL",
        contractSize: "1",
        status: "ELIGIBLE",
        statusReasons: [],
        observedAt: SOURCE_CUTOFF,
        eligible: true,
      },
    ],
    quality: freshQuality,
  },
  PointInTimeMarketFact: {
    ...trace("PointInTimeMarketFact", "market_fact_quality"),
    factId: "fact-fixture-1",
    canonicalInstrumentId: "BINANCE_FUTURES:BTCUSDT:LINEAR_PERPETUAL:USDT",
    venueInstrumentId: "BTCUSDT",
    factType: "LAST_PRICE",
    value: "100",
    unit: "USDT",
    sequence: "1",
    lineage: {
      sourceId: "binance-public",
      sourceCapability: "ticker",
      sourceRecordIds: ["record-fixture-1"],
      eventTime: SOURCE_CUTOFF,
      receivedAt: "2026-01-15T00:00:00.100Z",
      normalizedAt: "2026-01-15T00:00:00.150Z",
      persistedAt: "2026-01-15T00:00:00.200Z",
    },
    quality: freshQuality,
  },
  FactQualitySnapshot: {
    ...trace("FactQualitySnapshot", "market_fact_quality"),
    snapshotId: "fact-quality-fixture-1",
    universeSnapshotId: "universe-fixture-1",
    completenessRatio: 1,
    gapRate: 0,
    duplicateRate: 0,
    lateEventRate: 0,
    quality: freshQuality,
  },
  FeatureSetSnapshot: {
    ...trace("FeatureSetSnapshot", "point_in_time_feature_engine"),
    snapshotId: "feature-set-fixture-1",
    universeSnapshotId: "universe-fixture-1",
    featureSetVersion: "feature-set.v1",
    computation: {
      engineVersion: "feature-engine-fixture.v1",
      mode: "ONLINE",
      runId: "online-run-fixture-1",
    },
    features: [
      {
        featureId: "feature-fixture-1",
        featureDefinitionVersion: "dispersion.v1",
        featureSetVersion: "feature-set.v1",
        subjectType: "UNDERLYING_GROUP",
        subjectId: "BTC:USDT_LINEAR_PERPETUAL",
        timeframe: "1m",
        window: "3-venue-snapshot",
        value: 0.001,
        unit: "ratio",
        sourceFactIds: ["fact-fixture-1"],
        sourceCutoff: SOURCE_CUTOFF,
        computedAt: GENERATED_AT,
        quality: freshQuality,
      },
    ],
  },
  FeatureQualitySnapshot: {
    ...trace("FeatureQualitySnapshot", "point_in_time_feature_engine"),
    snapshotId: "feature-quality-fixture-1",
    featureSetSnapshotId: "feature-set-fixture-1",
    featureCount: 1,
    nullCount: 0,
    onlineOfflineParity: "PASS",
    replayDeterministic: true,
    nullRate: 0,
    parityEvidence: {
      independentlyBuilt: true,
      onlineFeatureSetSnapshotId: "feature-set-fixture-1",
      replayFeatureSetSnapshotId: "feature-set-fixture-1",
      replayRepeatFeatureSetSnapshotId: "feature-set-fixture-1",
      onlineSemanticHash: "sha256:equal",
      replaySemanticHash: "sha256:equal",
      replayRepeatSemanticHash: "sha256:equal",
      featureEngineVersion: "feature-engine-fixture.v1",
      onlineComputationRunId: "online-run-fixture-1",
      replayComputationRunId: "replay-run-fixture-1",
      replayRepeatComputationRunId: "replay-run-fixture-2",
    },
    quality: freshQuality,
  },
  MarketContextSnapshot: {
    ...trace("MarketContextSnapshot", "market_context"),
    snapshotId: "context-fixture-1",
    universeSnapshotId: "universe-fixture-1",
    featureSetSnapshotId: "feature-set-fixture-1",
    featureQualitySnapshotId: "feature-quality-fixture-1",
    contextRuleVersion: "context.v1",
    regime: "UNKNOWN",
    volatility: "UNKNOWN",
    breadth: null,
    correlation: null,
    liquidity: "UNKNOWN",
    confidence: "LOW",
    quality: partialQuality,
    uncertainty: uncertainty(),
  },
  DiscoveryCandidate: {
    ...trace("DiscoveryCandidate", "multi_opportunity_detection"),
    candidateId: "candidate-fixture-1",
    canonicalInstrumentId: "BINANCE_FUTURES:BTCUSDT:LINEAR_PERPETUAL:USDT",
    opportunityFamily: "PRE_MOVE",
    directionHypothesis: "LONG",
    detectorId: "detector-fixture-1",
    detectorVersion: "detector.v1",
    detectorLifecycle: "SHADOW",
    firstDetectedAt: SOURCE_CUTOFF,
    observedPrice: "100",
    featureSetSnapshotId: "feature-set-fixture-1",
    marketContextSnapshotId: "context-fixture-1",
    reasonCodes: ["compression_detected"],
    counterHints: [],
    priority: "P1",
  },
  CandidateEpisode: {
    ...trace(
      "CandidateEpisode",
      "candidate_lifecycle_opportunity_thesis",
    ),
    episodeId: "episode-fixture-1",
    canonicalInstrumentId: "BINANCE_FUTURES:BTCUSDT:LINEAR_PERPETUAL:USDT",
    opportunityFamily: "PRE_MOVE",
    directionHypothesis: "LONG",
    episodeWindowVersion: "episode-window.v1",
    lifecycle: "EVIDENCE_READY",
    priority: "P1",
    thesisId: "thesis-fixture-1",
    firstSeenAt: SOURCE_CUTOFF,
    lastSeenAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
    rowVersion: 1,
    idempotencyKey: "episode-idempotency-fixture-1",
  },
  OpportunityThesis: {
    ...trace(
      "OpportunityThesis",
      "candidate_lifecycle_opportunity_thesis",
    ),
    thesisId: "thesis-fixture-1",
    episodeId: "episode-fixture-1",
    canonicalInstrumentId: "BINANCE_FUTURES:BTCUSDT:LINEAR_PERPETUAL:USDT",
    opportunityFamily: "PRE_MOVE",
    directionHypothesis: "LONG",
    detectorCandidateIds: ["candidate-fixture-1"],
    firstDetectedAt: SOURCE_CUTOFF,
    supportingReasons: ["compression_detected"],
    conflictingReasons: [],
    knownUnknowns: [],
    uncertainty: uncertainty(),
  },
  EvidencePackage: {
    ...trace("EvidencePackage", "deep_validation"),
    evidencePackageId: "evidence-package-fixture-1",
    episodeId: "episode-fixture-1",
    thesisId: "thesis-fixture-1",
    tier: "A",
    items: [
      {
        evidenceId: "evidence-fixture-1",
        category: "price_structure",
        stance: "SUPPORTING",
        factIds: ["fact-fixture-1"],
        featureIds: ["feature-fixture-1"],
        observedAt: SOURCE_CUTOFF,
        quality: freshQuality,
        reasonCodes: ["support_reclaimed"],
      },
    ],
    completenessRatio: 1,
    uncertainty: uncertainty(),
    quality: freshQuality,
  },
  AnalysisSnapshot: {
    ...trace("AnalysisSnapshot", "family_analysis"),
    analysisId: "analysis-fixture-1",
    episodeId: "episode-fixture-1",
    thesisId: "thesis-fixture-1",
    evidencePackageId: "evidence-package-fixture-1",
    analyzerVersion: "pre-move-analysis.v1",
    opportunityFamily: "PRE_MOVE",
    directionBias: "LONG",
    structureState: "RECLAIMED_SUPPORT",
    marketStage: "PRE_EXPANSION",
    locationQuality: "GOOD",
    structuralLevels: [
      {
        levelId: "support-fixture-1",
        kind: "SUPPORT",
        price: "99",
        timeframe: "15m",
        sourceFactIds: ["fact-fixture-1"],
        reasonCodes: ["validated_reaction"],
      },
    ],
    supportingReasons: ["support_reclaimed"],
    counterEvidence: [],
    lateRisk: "LOW",
    fakeoutRisk: "LOW",
    noiseRisk: "LOW",
    uncertainty: uncertainty(),
  },
  SignalQualification: {
    ...trace("SignalQualification", "signal_qualification"),
    qualificationId: "qualification-fixture-1",
    episodeId: "episode-fixture-1",
    evidencePackageId: "evidence-package-fixture-1",
    analysisId: "analysis-fixture-1",
    evidenceGrade: "A",
    setupGrade: "QUALIFIED",
    evidenceCalibration: {
      calibrationVersion: "evidence-calibration.v1",
      sampleSize: 100,
      confidenceInterval: [0.7, 0.9],
      abstainReasonCodes: [],
    },
    setupCalibration: {
      calibrationVersion: "setup-calibration.v1",
      sampleSize: 100,
      confidenceInterval: [0.6, 0.8],
      abstainReasonCodes: [],
    },
    reasonCodes: ["evidence_and_setup_qualified"],
  },
  StrategyDraft: {
    ...trace("StrategyDraft", "strategy_construction"),
    draftId: "draft-fixture-1",
    episodeId: "episode-fixture-1",
    analysisId: "analysis-fixture-1",
    qualificationId: "qualification-fixture-1",
    templateVersion: "pre-move-long.v1",
    direction: "LONG",
    whyNow: ["trigger_near"],
    whyNotNow: [],
    entryTrigger: "Close and retest above the structural level",
    plannedEntryZone: entryZone,
    structuralInvalidation: "Close below reclaimed support",
    structuralStop: "98",
    structuralStopSourceLevelIds: ["support-fixture-1"],
    targets: [target],
    grossRewardRisk: 3.5,
    estimatedNetRewardRisk: 3.2,
    feeAssumptionBps: 10,
    slippageAssumptionBps: 5,
    fundingAssumptionBps: 1,
    confirmationWindow: "5m",
    expiresAt: EXPIRES_AT,
    noChaseCondition: "Do not enter above the planned zone",
    counterEvidence: [],
    blockers: [],
  },
  ExecutionFeasibilitySnapshot: {
    ...trace(
      "ExecutionFeasibilitySnapshot",
      "execution_feasibility_final_decision",
    ),
    feasibilityId: "feasibility-fixture-1",
    draftId: "draft-fixture-1",
    status: "PASS",
    checks: [
      {
        checkId: "liquidity-fixture-1",
        status: "PASS",
        observedValue: "healthy",
        thresholdVersion: "liquidity-threshold.v1",
        reasonCodes: [],
      },
    ],
    estimatedNetRewardRisk: 3.2,
    maximumExecutableNotional: "1000",
    quality: freshQuality,
    uncertainty: uncertainty(),
  },
  StrategyDecision: decision,
  PersonalRiskView: {
    ...trace("PersonalRiskView", "personal_risk_lens"),
    riskViewId: "personal-risk-fixture-1",
    decisionId: "decision-fixture-1",
    userFit: "SUITABLE",
    maximumPositionNotional: "500",
    maximumLoss: "15",
    requiredMargin: "50",
    liquidationDistancePercent: 10,
    estimatedFees: "1",
    blockerReasonCodes: [],
  },
  PortfolioRiskView: {
    ...trace("PortfolioRiskView", "portfolio_risk"),
    portfolioRiskViewId: "portfolio-risk-fixture-1",
    decisionId: "decision-fixture-1",
    userFit: "SUITABLE",
    aggregateStopLoss: "30",
    aggregateMargin: "100",
    btcEthBeta: 0.8,
    clusterConcentration: 0.2,
    correlatedLoss: "20",
    venueConcentration: 0.4,
    blockerReasonCodes: [],
    quality: freshQuality,
  },
  UserFit: "SUITABLE",
  DecisionSnapshot: {
    ...trace("DecisionSnapshot", "decision_read_model"),
    snapshotId: "decision-snapshot-fixture-1",
    episodeId: "episode-fixture-1",
    canonicalInstrumentId: "BINANCE_FUTURES:BTCUSDT:LINEAR_PERPETUAL:USDT",
    opportunityFamily: "PRE_MOVE",
    thesisId: "thesis-fixture-1",
    candidatePriority: "P1",
    evidenceGrade: "A",
    setupGrade: "QUALIFIED",
    actionState: "TRADE_PLAN_READY",
    userFit: "SUITABLE",
    evidencePackageId: "evidence-package-fixture-1",
    analysisId: "analysis-fixture-1",
    qualificationId: "qualification-fixture-1",
    decision,
    personalRiskViewId: "personal-risk-fixture-1",
    portfolioRiskViewId: "portfolio-risk-fixture-1",
    factVersion: "fact.v1",
    featureVersion: "feature.v1",
    ruleVersions: { decision: "decision.v1" },
    uncertainty: uncertainty(),
    freshness: freshQuality,
    unavailableReasonCodes: [],
    supersedesSnapshotId: null,
  },
  AlertEvent: {
    ...trace("AlertEvent", "alert_delivery"),
    alertId: "alert-fixture-1",
    episodeId: "episode-fixture-1",
    decisionSnapshotId: "decision-snapshot-fixture-1",
    alertType: "READY",
    dedupeKey: "ready:episode-fixture-1",
    expiresAt: EXPIRES_AT,
  },
  DeliveryReceipt: {
    ...trace("DeliveryReceipt", "alert_delivery"),
    receiptId: "receipt-fixture-1",
    alertId: "alert-fixture-1",
    channel: "IN_APP",
    status: "ACKNOWLEDGED",
    deliveredAt: GENERATED_AT,
    acknowledgedAt: "2026-01-15T00:02:00.000Z",
    attemptCount: 1,
  },
  OutcomeRecord: {
    ...trace("OutcomeRecord", "outcome_evaluation"),
    outcomeId: "outcome-fixture-1",
    episodeId: "episode-fixture-1",
    decisionSnapshotId: "decision-snapshot-fixture-1",
    checkpoint: "4H",
    status: "TP_FIRST",
    maximumFavorableExcursion: 5,
    maximumAdverseExcursion: 1,
    netR: 3.2,
    leadTimeSeconds: 1800,
    factCutoff: EXPIRES_AT,
  },
  MissedOpportunityRecord: {
    ...trace("MissedOpportunityRecord", "outcome_evaluation"),
    missedOpportunityId: "missed-fixture-1",
    canonicalInstrumentId: "BINANCE_FUTURES:ETHUSDT:LINEAR_PERPETUAL:USDT",
    eventLabelVersion: "significant-expansion-event.v1",
    eventStartAt: SOURCE_CUTOFF,
    publicBreakoutAt: GENERATED_AT,
    direction: "LONG",
    matchingCandidateIds: [],
    missReasonCode: "NO_CANDIDATE",
  },
  EvaluationDatasetSnapshot: {
    ...trace("EvaluationDatasetSnapshot", "outcome_evaluation"),
    datasetSnapshotId: "dataset-fixture-1",
    eventLabelVersion: "significant-expansion-event.v1",
    candidateDenominatorCount: 100,
    eventDenominatorCount: 20,
    matchedNonEventDenominatorCount: 80,
    unavailableCount: 0,
    recordIds: ["outcome-fixture-1"],
  },
  ResearchProposal: {
    ...trace("ResearchProposal", "research_governance"),
    proposalId: "proposal-fixture-1",
    hypothesis: "Compression quality improves pre-move precision",
    datasetSnapshotIds: ["dataset-fixture-1"],
    primaryMetric: "event_precision",
    nonInferiorityMetrics: ["event_recall"],
    expectedRisks: ["attention_cost"],
    status: "REGISTERED",
  },
  ExperimentRecord: {
    ...trace("ExperimentRecord", "research_governance"),
    experimentId: "experiment-fixture-1",
    proposalId: "proposal-fixture-1",
    codeVersion: "experiment-code.v1",
    datasetSnapshotIds: ["dataset-fixture-1"],
    parameterSet: { compressionWindow: 20 },
    resultStatus: "PASS",
    resultArtifactDigest: "sha256:experiment-fixture",
  },
  PromotionDecisionRecord: {
    ...trace("PromotionDecisionRecord", "research_governance"),
    promotionDecisionId: "promotion-fixture-1",
    proposalId: "proposal-fixture-1",
    experimentIds: ["experiment-fixture-1"],
    decision: "PROMOTE_TO_SHADOW",
    humanApproverId: "reviewer-fixture-1",
    decidedAt: GENERATED_AT,
    reasonCodes: ["holdout_passed"],
  },
  RuntimeTruthSnapshot: {
    ...trace("RuntimeTruthSnapshot", "runtime_security_release_control"),
    runtimeTruthId: "runtime-truth-fixture-1",
    liveness: "READY",
    dependencyReadiness: "READY",
    businessReadiness: "READY",
    dataFreshness: "FRESH",
    releaseValidity: "VALID",
    reasonCodes: [],
  },
  ReleaseRecord: {
    ...trace("ReleaseRecord", "runtime_security_release_control"),
    releaseRecordId: "release-record-fixture-1",
    commit: "0123456789abcdef",
    tree: "abcdef0123456789",
    artifactDigest: "sha256:artifact-fixture",
    imageDigests: { web: "sha256:image-fixture" },
    databaseSchemaVersion: "schema.v1",
    featureVersions: ["feature.v1"],
    ruleVersions: ["rule.v1"],
    rollbackReleaseId: "release-fixture-0",
    evidenceDigest: "sha256:evidence-fixture",
  },
  DriftStatusSnapshot: {
    ...trace("DriftStatusSnapshot", "runtime_security_release_control"),
    driftSnapshotId: "drift-fixture-1",
    dimension: "feature_distribution",
    status: "NORMAL",
    baselineVersion: "baseline.v1",
    observedValue: 0.01,
    reasonCodes: [],
  },
};

test("registers exactly one strict runtime schema for every authority output", () => {
  const authorityOutputs = MODULE_REGISTRY.flatMap(
    (definition) => definition.authorityOutputs,
  ).sort();

  assert.deepEqual(RUNTIME_SCHEMA_NAMES, authorityOutputs);
  assert.equal(new Set(RUNTIME_SCHEMA_NAMES).size, RUNTIME_SCHEMA_NAMES.length);
});

test("accepts one type-checked canonical fixture for every authority schema", () => {
  for (const artifactName of RUNTIME_SCHEMA_NAMES) {
    const result = RUNTIME_SCHEMA_REGISTRY[artifactName].safeParse(
      fixtures[artifactName],
    );
    assert.equal(
      result.success,
      true,
      `${artifactName}: ${result.success ? "" : result.error.message}`,
    );
  }
});

test("allows unavailable facts without fabricated event or persistence time", () => {
  const unavailable = {
    ...fixtures.PointInTimeMarketFact,
    value: null,
    sequence: null,
    lineage: {
      ...fixtures.PointInTimeMarketFact.lineage,
      eventTime: null,
      persistedAt: null,
    },
    quality: {
      status: "TRANSPORT_ERROR",
      ageMs: null,
      reasonCodes: ["provider_request_failed"],
    },
  };
  assert.equal(
    RUNTIME_SCHEMA_REGISTRY.PointInTimeMarketFact.safeParse(unavailable).success,
    true,
  );
  assert.equal(
    RUNTIME_SCHEMA_REGISTRY.PointInTimeMarketFact.safeParse({
      ...unavailable,
      value: "100",
    }).success,
    false,
  );
});

test("keeps schemas strict instead of silently stripping unknown fields", () => {
  for (const artifactName of RUNTIME_SCHEMA_NAMES) {
    const fixture = fixtures[artifactName];
    if (typeof fixture !== "object" || fixture === null) {
      continue;
    }
    const result = RUNTIME_SCHEMA_REGISTRY[artifactName].safeParse({
      ...fixture,
      undeclaredRuntimeField: true,
    });
    assert.equal(result.success, false, artifactName);
  }
});

test("rejects schema-version drift for every envelope authority", () => {
  for (const artifactName of RUNTIME_SCHEMA_NAMES) {
    const fixture = fixtures[artifactName];
    if (
      artifactName === "UserFit" ||
      typeof fixture !== "object" ||
      fixture === null
    ) {
      continue;
    }
    const result = RUNTIME_SCHEMA_REGISTRY[artifactName].safeParse({
      ...fixture,
      schemaVersion: "unreviewed-schema.v999",
    });
    assert.equal(result.success, false, artifactName);
  }
});

export const runtimeSchemaFixturesForTest = fixtures;
