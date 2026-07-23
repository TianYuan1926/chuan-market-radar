import {
  M3_MULTI_ASSET_DECISION_AUTHORITY,
  M3_MULTI_ASSET_NON_DIRECTIONAL_CATEGORIES,
  M3MultiAssetScopeBindingSchema,
  requiredM3MultiAssetAnalysisCategories,
  segmentBindingFromScope,
  type M3MultiAssetAnalysisCategory,
  type M3MultiAssetScopeBinding,
} from "../m3-multi-asset-decision-contract";
import {
  M3_MULTI_ASSET_ANALYSIS_INPUT_VERSION,
  M3_MULTI_ASSET_ANALYSIS_POLICY_VERSION,
  analyzeM3MultiAssetOpportunity,
} from "../m3-multi-asset-analysis";
import {
  M3_MULTI_ASSET_CALIBRATION_REFERENCE_VERSION,
  M3_MULTI_ASSET_QUALIFICATION_INPUT_VERSION,
  M3_MULTI_ASSET_QUALIFICATION_POLICY_VERSION,
  qualifyM3MultiAssetAnalysis,
  sealM3MultiAssetCalibrationReference,
  type M3MultiAssetCalibrationReference,
} from "../m3-multi-asset-qualification";
import {
  M3_MULTI_ASSET_COST_COMPONENTS,
  M3_MULTI_ASSET_COST_SNAPSHOT_VERSION,
  M3_MULTI_ASSET_REFERENCE_PRICE_VERSION,
  M3_MULTI_ASSET_STRATEGY_CONSTRUCTION_VERSION,
  M3_MULTI_ASSET_STRATEGY_INPUT_VERSION,
  M3_MULTI_ASSET_STRATEGY_POLICY_SCHEMA_VERSION,
  constructM3MultiAssetStrategy,
  m3MultiAssetEvidenceSetDigest,
  sealM3MultiAssetCostSnapshot,
  sealM3MultiAssetReferencePrice,
  sealM3MultiAssetStrategyPolicy,
} from "../m3-multi-asset-strategy";
import { stableContentHash } from "../../universe/stable-artifact";

export const M3_MULTI_ASSET_FIXTURE_TIMES = Object.freeze({
  evidenceCutoff: "2026-07-01T00:00:10.000Z",
  evidenceAvailableAt: "2026-07-01T00:00:12.000Z",
  analysisGeneratedAt: "2026-07-01T00:00:20.000Z",
  calibrationCutoff: "2026-07-01T00:00:25.000Z",
  calibrationEvaluatedAt: "2026-07-01T00:00:30.000Z",
  qualificationCutoff: "2026-07-01T00:00:30.000Z",
  qualificationGeneratedAt: "2026-07-01T00:00:40.000Z",
  policyCutoff: "2026-07-01T00:00:35.000Z",
  policyEvaluatedAt: "2026-07-01T00:00:45.000Z",
  costEvidenceCutoff: "2026-07-01T00:00:45.000Z",
  costEvidenceAvailableAt: "2026-07-01T00:00:50.000Z",
  strategySourceCutoff: "2026-07-01T00:00:55.000Z",
  strategyGeneratedAt: "2026-07-01T00:01:00.000Z",
});

export const M3_MULTI_ASSET_LANE_FIXTURES = [
  {
    id: "established-bitget-crypto",
    decisionLane: "FOUR_VENUE_ESTABLISHED_CRYPTO",
    venue: "BITGET_FUTURES",
    assetDomain: "CRYPTO_LINEAR_PERPETUAL",
    lifecycleState: "ESTABLISHED",
    opportunityFamily: "PRE_MOVE",
    opportunityPattern: "PRE_MOVE_COMPRESSION",
    direction: "LONG",
  },
  {
    id: "binance-listing-warmup",
    decisionLane: "CRYPTO_LISTING_WARMUP",
    venue: "BINANCE_FUTURES",
    assetDomain: "CRYPTO_LINEAR_PERPETUAL",
    lifecycleState: "TRADING_WARMUP",
    opportunityFamily: "LISTING_AND_VENUE_EVENT",
    opportunityPattern: "TRADING_WARMUP",
    direction: "LONG",
  },
  {
    id: "bybit-single-name-equity",
    decisionLane: "SINGLE_NAME_EQUITY_ESTABLISHED",
    venue: "BYBIT_DERIVATIVES",
    assetDomain: "EQUITY_SINGLE_NAME_PERPETUAL",
    lifecycleState: "ESTABLISHED",
    opportunityFamily: "EQUITY_EVENT_AND_BASIS",
    opportunityPattern: "TRADITIONAL_SESSION_TRANSITION",
    direction: "LONG",
  },
  {
    id: "okx-index-etf-equity",
    decisionLane: "EQUITY_INDEX_ETF_ESTABLISHED",
    venue: "OKX_SWAP",
    assetDomain: "EQUITY_INDEX_ETF_PERPETUAL",
    lifecycleState: "ESTABLISHED",
    opportunityFamily: "RELATIVE_STRENGTH",
    opportunityPattern: "RELATIVE_STRENGTH",
    direction: "SHORT",
  },
] as const;

export type M3MultiAssetLaneFixtureConfig =
  (typeof M3_MULTI_ASSET_LANE_FIXTURES)[number];

export type M3MultiAssetFixtureOptions = Readonly<{
  instrumentSuffix?: string;
  targetKind?:
    | "SUPPORT"
    | "RESISTANCE"
    | "RANGE_EDGE"
    | "LIQUIDITY"
    | "FIB_ZONE";
  validatedFibPolicy?: boolean;
}>;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-");
}

function digest(value: unknown): string {
  return stableContentHash(value);
}

function bindingFor(
  config: M3MultiAssetLaneFixtureConfig,
  instrumentSuffix = "primary",
): M3MultiAssetScopeBinding {
  return M3MultiAssetScopeBindingSchema.parse({
    scopeEpoch: "SCOPE_EPOCH_V2_MULTI_ASSET_4V",
    releaseId: "release-m3-multi-asset-fixture",
    decisionLane: config.decisionLane,
    venue: config.venue,
    assetDomain: config.assetDomain,
    lifecycleState: config.lifecycleState,
    canonicalInstrumentId:
      `instrument:${config.id}:${instrumentSuffix}`,
    underlyingGroupId: `underlying:${config.id}:${instrumentSuffix}`,
    identityEpoch: `identity:${config.id}:${instrumentSuffix}:v1`,
    listingEpoch: `listing:${config.id}:${instrumentSuffix}:v1`,
  });
}

function evidenceFor(
  binding: M3MultiAssetScopeBinding,
  category: M3MultiAssetAnalysisCategory,
  sourceCutoff: string = M3_MULTI_ASSET_FIXTURE_TIMES.evidenceCutoff,
  availableAt: string = M3_MULTI_ASSET_FIXTURE_TIMES.evidenceAvailableAt,
) {
  const categorySlug = slug(category);
  const evidenceId =
    `evidence:${binding.canonicalInstrumentId}:${categorySlug}`;
  const factId = `fact:${binding.canonicalInstrumentId}:${categorySlug}`;
  return {
    evidenceId,
    scopeEpoch: binding.scopeEpoch,
    releaseId: binding.releaseId,
    venue: binding.venue,
    assetDomain: binding.assetDomain,
    lifecycleState: binding.lifecycleState,
    canonicalInstrumentId: binding.canonicalInstrumentId,
    underlyingGroupId: binding.underlyingGroupId,
    identityEpoch: binding.identityEpoch,
    listingEpoch: binding.listingEpoch,
    status: "PASS" as const,
    sourceCutoff,
    availableAt,
    factIds: [factId],
    digest: digest({
      evidenceId,
      binding,
      sourceCutoff,
      availableAt,
      factId,
    }),
    reasonCodes: [`fixture_${categorySlug}_pass`],
  };
}

function observationDirection(
  category: M3MultiAssetAnalysisCategory,
  direction: "LONG" | "SHORT",
): "LONG" | "SHORT" | "NEUTRAL" {
  if (
    (
      M3_MULTI_ASSET_NON_DIRECTIONAL_CATEGORIES as readonly string[]
    ).includes(category)
  ) {
    return "NEUTRAL";
  }
  return category === "STRUCTURE" ? direction : "NEUTRAL";
}

export function buildM3MultiAssetAnalysisFixture(
  config: M3MultiAssetLaneFixtureConfig,
  options: M3MultiAssetFixtureOptions = {},
) {
  const binding = bindingFor(config, options.instrumentSuffix);
  const requiredCategories = requiredM3MultiAssetAnalysisCategories(
    binding.assetDomain,
    binding.lifecycleState,
  );
  const observations = requiredCategories.map((category) => {
    const evidence = evidenceFor(binding, category);
    return {
      observationId:
        `observation:${binding.canonicalInstrumentId}:${slug(category)}`,
      category,
      stance: "SUPPORTING" as const,
      direction: observationDirection(category, config.direction),
      evidence,
      reasonCodes: [`fixture_${slug(category)}_supporting`],
    };
  });
  const evidenceId = (category: M3MultiAssetAnalysisCategory) => {
    const observation = observations.find((item) => item.category === category);
    if (observation === undefined) {
      throw new Error(`fixture category not found: ${category}`);
    }
    return observation.evidence.evidenceId;
  };
  const long = config.direction === "LONG";
  const targetKind = options.targetKind ??
    (long ? "RESISTANCE" : "SUPPORT");
  const structuralLevels = [
    {
      levelId: `level:${binding.canonicalInstrumentId}:entry`,
      kind: long ? "SUPPORT" as const : "RESISTANCE" as const,
      price: "100",
      timeframe: "15m",
      evidenceIds: [evidenceId("STRUCTURE")],
      reasonCodes: ["fixture_entry_structure"],
    },
    {
      levelId: `level:${binding.canonicalInstrumentId}:stop`,
      kind: "LIQUIDITY" as const,
      price: long ? "95" : "105",
      timeframe: "15m",
      evidenceIds: [evidenceId("LOCATION")],
      reasonCodes: ["fixture_structural_invalidation"],
    },
    {
      levelId: `level:${binding.canonicalInstrumentId}:target`,
      kind: targetKind,
      price: long ? "120" : "80",
      timeframe: "1h",
      evidenceIds: [evidenceId("LIQUIDITY")],
      reasonCodes: [
        targetKind === "FIB_ZONE"
          ? "fixture_validated_fib_extension"
          : "fixture_prior_structural_target",
      ],
    },
  ];
  const input = {
    schemaVersion: M3_MULTI_ASSET_ANALYSIS_INPUT_VERSION,
    policyVersion: M3_MULTI_ASSET_ANALYSIS_POLICY_VERSION,
    authority: M3_MULTI_ASSET_DECISION_AUTHORITY,
    binding,
    generatedAt: M3_MULTI_ASSET_FIXTURE_TIMES.analysisGeneratedAt,
    sourceCutoff: M3_MULTI_ASSET_FIXTURE_TIMES.evidenceCutoff,
    opportunity: {
      episodeId: `episode:${config.id}:${options.instrumentSuffix ?? "primary"}`,
      thesisId: `thesis:${config.id}:${options.instrumentSuffix ?? "primary"}`,
      opportunityFamily: config.opportunityFamily,
      opportunityPatterns: [config.opportunityPattern],
    },
    regime: "TRANSITION" as const,
    observations,
    structuralLevels,
  };
  const result = analyzeM3MultiAssetOpportunity(input);
  if (result.analysis === null) {
    throw new Error(`analysis fixture failed: ${result.reasonCodes.join(",")}`);
  }
  return {
    config,
    binding,
    input,
    result,
    analysis: result.analysis,
    observations,
    structuralLevels,
  };
}

export function calibratedM3MultiAssetReference(
  analysis: ReturnType<
    typeof buildM3MultiAssetAnalysisFixture
  >["analysis"],
  dimension: "EVIDENCE" | "SETUP",
): M3MultiAssetCalibrationReference {
  const laneSlug = slug(analysis.binding.decisionLane);
  const dimensionSlug = dimension.toLowerCase();
  return sealM3MultiAssetCalibrationReference({
    schemaVersion: M3_MULTI_ASSET_CALIBRATION_REFERENCE_VERSION,
    status: "CALIBRATED",
    dimension,
    segment: segmentBindingFromScope(analysis.binding),
    opportunityFamily: analysis.opportunity.opportunityFamily,
    direction: analysis.directionBias === "SHORT" ? "SHORT" : "LONG",
    regime: "TRANSITION",
    calibrationVersion: `fixture-${laneSlug}-${dimensionSlug}.v1`,
    cohortId: `cohort:${laneSlug}:${dimensionSlug}`,
    untouchedHoldoutId: `holdout:${laneSlug}:${dimensionSlug}`,
    cohortDigest: digest(["cohort", laneSlug, dimension]),
    untouchedHoldoutDigest: digest(["holdout", laneSlug, dimension]),
    thresholdSetDigest: digest(["thresholds", laneSlug, dimension]),
    metricDefinitionDigest: digest(["metrics", laneSlug, dimension]),
    sampleSize: 60,
    coveredRegimes: ["TREND", "RANGE", "TRANSITION"],
    untouchedHoldout: true,
    holdoutAccessCount: 1,
    thresholdsFrozenBeforeHoldout: true,
    futureLeakageDetected: false,
    evidenceIds: [
      `calibration-evidence:${laneSlug}:${dimensionSlug}:1`,
      `calibration-evidence:${laneSlug}:${dimensionSlug}:2`,
    ],
    sourceCutoff: M3_MULTI_ASSET_FIXTURE_TIMES.calibrationCutoff,
    evaluatedAt: M3_MULTI_ASSET_FIXTURE_TIMES.calibrationEvaluatedAt,
    reasonCodes: ["fixture_calibration_contract_only"],
  });
}

function costComponentsFor(binding: M3MultiAssetScopeBinding) {
  const componentIds = isEquityBinding(binding)
    ? M3_MULTI_ASSET_COST_COMPONENTS
    : ["FEE", "SLIPPAGE", "FUNDING"] as const;
  const bps = {
    FEE: 5,
    SLIPPAGE: 5,
    FUNDING: 2,
    CLOSED_SESSION_BASIS: 5,
    FX: 3,
  } as const;
  return componentIds.map((component) => {
    const evidence = evidenceFor(
      binding,
      component === "FX" ? "FX_REFERENCE" : "POINT_IN_TIME_MARKET",
      M3_MULTI_ASSET_FIXTURE_TIMES.costEvidenceCutoff,
      M3_MULTI_ASSET_FIXTURE_TIMES.costEvidenceAvailableAt,
    );
    const evidenceReference = {
      ...evidence,
      evidenceId:
        `${evidence.evidenceId}:cost:${component.toLowerCase()}`,
      digest: digest([evidence.digest, component]),
      reasonCodes: [`fixture_${component.toLowerCase()}_cost_evidence`],
    };
    return {
      component,
      status: "PASS" as const,
      conservativeBps: bps[component],
      evidenceReferences: [evidenceReference],
      reasonCodes: [`fixture_${component.toLowerCase()}_cost_pass`],
    };
  });
}

function isEquityBinding(binding: M3MultiAssetScopeBinding): boolean {
  return binding.assetDomain === "EQUITY_SINGLE_NAME_PERPETUAL" ||
    binding.assetDomain === "EQUITY_INDEX_ETF_PERPETUAL";
}

export function buildM3MultiAssetFullLaneFixture(
  config: M3MultiAssetLaneFixtureConfig,
  options: M3MultiAssetFixtureOptions = {},
) {
  const analysisFixture = buildM3MultiAssetAnalysisFixture(config, options);
  const { analysis, binding } = analysisFixture;
  const evidenceCalibration = calibratedM3MultiAssetReference(
    analysis,
    "EVIDENCE",
  );
  const setupCalibration = calibratedM3MultiAssetReference(analysis, "SETUP");
  const qualificationInput = {
    schemaVersion: M3_MULTI_ASSET_QUALIFICATION_INPUT_VERSION,
    policyVersion: M3_MULTI_ASSET_QUALIFICATION_POLICY_VERSION,
    authority: M3_MULTI_ASSET_DECISION_AUTHORITY,
    generatedAt: M3_MULTI_ASSET_FIXTURE_TIMES.qualificationGeneratedAt,
    sourceCutoff: M3_MULTI_ASSET_FIXTURE_TIMES.qualificationCutoff,
    analysis,
    evidenceCalibration,
    setupCalibration,
  };
  const qualificationResult = qualifyM3MultiAssetAnalysis(qualificationInput);
  if (qualificationResult.qualification === null) {
    throw new Error(
      `qualification fixture failed: ${qualificationResult.reasonCodes.join(",")}`,
    );
  }
  const qualification = qualificationResult.qualification;
  const policyEvidenceIds = [
    `policy-evidence:${config.id}:1`,
    `policy-evidence:${config.id}:2`,
  ];
  const targetLevel = analysis.structuralLevels.find((level) =>
    level.levelId.endsWith(":target")
  );
  if (targetLevel === undefined) {
    throw new Error("target fixture level not found");
  }
  const validatedFibEvidenceIds = options.validatedFibPolicy
    ? [...targetLevel.evidenceIds]
    : [];
  const policy = sealM3MultiAssetStrategyPolicy({
    schemaVersion: M3_MULTI_ASSET_STRATEGY_POLICY_SCHEMA_VERSION,
    status: "CALIBRATED_RESEARCH_ONLY",
    segment: segmentBindingFromScope(binding),
    opportunityFamily: analysis.opportunity.opportunityFamily,
    direction: config.direction,
    regime: "TRANSITION",
    sourceCutoff: M3_MULTI_ASSET_FIXTURE_TIMES.policyCutoff,
    evaluatedAt: M3_MULTI_ASSET_FIXTURE_TIMES.policyEvaluatedAt,
    policyVersion: `fixture-policy:${config.id}:v1`,
    templateVersion: `fixture-template:${config.opportunityFamily}:v1`,
    evidenceCalibrationHash: qualification.evidenceCalibrationHash,
    setupCalibrationHash: qualification.setupCalibrationHash,
    policyEvidenceIds,
    policyEvidenceDigest: m3MultiAssetEvidenceSetDigest(policyEvidenceIds),
    allowedEntryKinds: [
      "SUPPORT",
      "RESISTANCE",
      "RANGE_EDGE",
      "LIQUIDITY",
    ],
    allowedStopKinds: [
      "SUPPORT",
      "RESISTANCE",
      "RANGE_EDGE",
      "LIQUIDITY",
    ],
    allowedTargetKinds: options.validatedFibPolicy
      ? [
        "SUPPORT",
        "RESISTANCE",
        "RANGE_EDGE",
        "LIQUIDITY",
        "FIB_ZONE",
      ]
      : ["SUPPORT", "RESISTANCE", "RANGE_EDGE", "LIQUIDITY"],
    fibTargetPolicy: options.validatedFibPolicy
      ? "VALIDATED_EXTENSION_ONLY"
      : "PROHIBITED",
    validatedFibExtensionEvidenceIds: validatedFibEvidenceIds,
    validatedFibExtensionDigest: options.validatedFibPolicy
      ? m3MultiAssetEvidenceSetDigest(validatedFibEvidenceIds)
      : null,
    entryTrigger: `fixture_confirmed_reaction:${config.id}`,
    structuralInvalidation: `fixture_structure_invalidated:${config.id}`,
    noChaseCondition: `fixture_no_chase_outside_zone:${config.id}`,
    partialTakeProfitPolicy: "fixture_60_40_or_single_target",
    confirmationWindowSeconds: 300,
    entryZoneBufferBps: 10,
    structuralStopBufferBps: 10,
    maximumEntryDistanceBps: 100,
    minimumGrossRewardRisk: 3,
    minimumEstimatedNetRewardRisk: 3,
    rewardRiskPrecision: 6,
    draftLifetimeSeconds: 900,
  });
  const costSnapshot = sealM3MultiAssetCostSnapshot({
    schemaVersion: M3_MULTI_ASSET_COST_SNAPSHOT_VERSION,
    binding,
    sourceCutoff:
      M3_MULTI_ASSET_FIXTURE_TIMES.costEvidenceAvailableAt,
    availableAt: M3_MULTI_ASSET_FIXTURE_TIMES.strategySourceCutoff,
    components: costComponentsFor(binding),
    reasonCodes: ["fixture_domain_cost_snapshot"],
  });
  const structureObservation = analysisFixture.observations.find(
    (observation) => observation.category === "STRUCTURE",
  );
  if (structureObservation === undefined) {
    throw new Error("structure fixture observation not found");
  }
  const referencePrice = sealM3MultiAssetReferencePrice({
    schemaVersion: M3_MULTI_ASSET_REFERENCE_PRICE_VERSION,
    binding,
    price: "100",
    status: "FRESH",
    sourceCutoff:
      M3_MULTI_ASSET_FIXTURE_TIMES.costEvidenceAvailableAt,
    availableAt: M3_MULTI_ASSET_FIXTURE_TIMES.strategySourceCutoff,
    factIds: [...structureObservation.evidence.factIds],
    evidenceReferences: [structureObservation.evidence],
    reasonCodes: [],
  });
  const selection = {
    entryLevelId: analysis.structuralLevels.find((level) =>
      level.levelId.endsWith(":entry")
    )!.levelId,
    stopBaseLevelId: analysis.structuralLevels.find((level) =>
      level.levelId.endsWith(":stop")
    )!.levelId,
    targetLevelIds: [targetLevel.levelId],
  };
  const strategyInput = {
    schemaVersion: M3_MULTI_ASSET_STRATEGY_INPUT_VERSION,
    constructionVersion: M3_MULTI_ASSET_STRATEGY_CONSTRUCTION_VERSION,
    authority: M3_MULTI_ASSET_DECISION_AUTHORITY,
    generatedAt: M3_MULTI_ASSET_FIXTURE_TIMES.strategyGeneratedAt,
    sourceCutoff: M3_MULTI_ASSET_FIXTURE_TIMES.strategySourceCutoff,
    analysis,
    qualification,
    policy,
    costSnapshot,
    referencePrice,
    selection,
  };
  const strategyResult = constructM3MultiAssetStrategy(strategyInput);
  return {
    ...analysisFixture,
    evidenceCalibration,
    setupCalibration,
    qualificationInput,
    qualificationResult,
    qualification,
    policy,
    costSnapshot,
    referencePrice,
    selection,
    strategyInput,
    strategyResult,
  };
}
