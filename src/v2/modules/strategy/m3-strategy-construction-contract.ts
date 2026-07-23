import { z } from "zod";
import type {
  AnalysisSnapshot,
  Direction,
  SignalQualification,
  StrategyDraft,
  StructuralLevel,
  TargetLevel,
} from "../../domain/contracts";
import {
  AnalysisSnapshotSchema,
  SignalQualificationSchema,
  StrategyDraftSchema,
} from "../../runtime-schema/decision-schemas";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  PositiveDecimalStringSchema,
  QualityAssessmentSchema,
  compareNonNegativeDecimalStrings,
} from "../../runtime-schema/primitives";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "../../runtime-schema/schema-versions";
import { m3FamilyAnalyzerVersion } from "../analysis/m3-family-analysis-policy";
import { M3_SIGNAL_QUALIFICATION_POLICY_VERSION } from "../qualification/m3-signal-qualification-policy";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "../universe/stable-artifact";
import {
  M3_CONSERVATIVE_REWARD_RISK_CALCULATION_VERSION,
  calculateConservativeRewardRisk,
  isWithinDistanceBps,
  shiftPriceByBps,
} from "./m3-exact-price-math";
import {
  M3_STRATEGY_BUFFER_POLICY_VERSION,
  M3_STRATEGY_CONSTRUCTION_POLICY_VERSION,
  M3_STRATEGY_COST_ASSUMPTION_SCHEMA_VERSION,
  M3_STRATEGY_COST_ASSUMPTION_SET_ID,
  M3_STRATEGY_COST_ASSUMPTION_VERSION,
  M3_STRATEGY_TEST_COST_ASSUMPTIONS,
  m3EntryKinds,
  m3StrategyTemplate,
  m3StrategyTemplateVersion,
  m3TargetKinds,
} from "./m3-strategy-construction-policy";

export {
  M3_STRATEGY_BUFFER_POLICY_VERSION,
  M3_STRATEGY_CONSTRUCTION_POLICY_VERSION,
  M3_STRATEGY_COST_ASSUMPTION_VERSION,
  M3_STRATEGY_TEST_COST_ASSUMPTIONS,
} from "./m3-strategy-construction-policy";

export const M3_STRATEGY_CONSTRUCTION_INPUT_VERSION =
  "m3-strategy-construction-input.v1" as const;
export const M3_STRATEGY_CONSTRUCTION_RESULT_VERSION =
  "m3-strategy-construction-result.v1" as const;
export const M3_STRATEGY_CONSTRUCTION_MODE =
  "TEST_ONLY_UNCALIBRATED_NO_READY_AUTHORITY" as const;

export const M3StrategyPriceReferenceSchema = z.strictObject({
  price: PositiveDecimalStringSchema,
  observedAt: IsoDateTimeSchema,
  sourceFactIds: z.array(NonEmptyStringSchema).min(1),
  quality: QualityAssessmentSchema,
}).superRefine((reference, context) => {
  if (new Set(reference.sourceFactIds).size !== reference.sourceFactIds.length) {
    context.addIssue({
      code: "custom",
      message: "reference price fact ids must be unique",
      path: ["sourceFactIds"],
    });
  }
});

export const M3StrategyCostAssumptionsSchema = z.strictObject({
  schemaVersion: z.literal(M3_STRATEGY_COST_ASSUMPTION_SCHEMA_VERSION),
  assumptionSetId: z.literal(M3_STRATEGY_COST_ASSUMPTION_SET_ID),
  assumptionVersion: z.literal(M3_STRATEGY_COST_ASSUMPTION_VERSION),
  authority: z.literal("TEST_ONLY_UNCALIBRATED"),
  feePerSideBps: z.literal(M3_STRATEGY_TEST_COST_ASSUMPTIONS.feePerSideBps),
  slippagePerSideBps: z.literal(
    M3_STRATEGY_TEST_COST_ASSUMPTIONS.slippagePerSideBps,
  ),
  fundingBps: z.literal(M3_STRATEGY_TEST_COST_ASSUMPTIONS.fundingBps),
  rewardRiskPrecision: z.literal(
    M3_STRATEGY_TEST_COST_ASSUMPTIONS.rewardRiskPrecision,
  ),
  pricePrecision: z.literal(
    M3_STRATEGY_TEST_COST_ASSUMPTIONS.pricePrecision,
  ),
  minimumGrossRewardRisk: z.literal(
    M3_STRATEGY_TEST_COST_ASSUMPTIONS.minimumGrossRewardRisk,
  ),
  minimumEstimatedNetRewardRisk: z.literal(
    M3_STRATEGY_TEST_COST_ASSUMPTIONS.minimumEstimatedNetRewardRisk,
  ),
});

export const M3StrategyConstructionInputSchema = z.strictObject({
  schemaVersion: z.literal(M3_STRATEGY_CONSTRUCTION_INPUT_VERSION),
  executionMode: z.literal(M3_STRATEGY_CONSTRUCTION_MODE),
  policyVersion: z.literal(M3_STRATEGY_CONSTRUCTION_POLICY_VERSION),
  releaseId: NonEmptyStringSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  analysis: AnalysisSnapshotSchema,
  qualification: SignalQualificationSchema,
  referencePrice: M3StrategyPriceReferenceSchema,
  costAssumptions: M3StrategyCostAssumptionsSchema,
});

export type M3StrategyConstructionInput = z.infer<
  typeof M3StrategyConstructionInputSchema
>;

export type M3StrategyConstructionIssue = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type M3StrategyConstructionResult = Readonly<{
  schemaVersion: typeof M3_STRATEGY_CONSTRUCTION_RESULT_VERSION;
  status: "CONSTRUCTED_TEST_ONLY" | "ABSTAINED_NO_DRAFT" | "BLOCKED";
  authority: "TEST_ONLY_NO_READY_AUTHORITY";
  draft: StrategyDraft | null;
  reasonCodes: readonly string[];
  issues: readonly M3StrategyConstructionIssue[];
  resultHash: string;
}>;

type ConstructionGeometry = Readonly<{
  entryAnchor: StructuralLevel;
  plannedEntryZone: StrategyDraft["plannedEntryZone"];
  structuralStop: string;
  targets: readonly TargetLevel[];
}>;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function issue(
  issues: M3StrategyConstructionIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function validateIntegrity(
  input: M3StrategyConstructionInput,
): M3StrategyConstructionIssue[] {
  const issues: M3StrategyConstructionIssue[] = [];
  const { analysis, qualification, referencePrice } = input;
  if (Date.parse(input.sourceCutoff) > Date.parse(input.generatedAt)) {
    issue(
      issues,
      "strategy_generated_before_source_cutoff",
      "generatedAt",
      "strategy construction cannot precede its source cutoff",
    );
  }
  for (const [path, artifact] of [
    ["analysis", analysis],
    ["qualification", qualification],
  ] as const) {
    if (artifact.releaseId !== input.releaseId) {
      issue(
        issues,
        "cross_release_strategy_input",
        `${path}.releaseId`,
        "strategy construction cannot compose another release",
      );
    }
    if (
      Date.parse(artifact.sourceCutoff) > Date.parse(input.sourceCutoff) ||
      Date.parse(artifact.generatedAt) > Date.parse(input.generatedAt)
    ) {
      issue(
        issues,
        "strategy_input_not_available_at_cutoff",
        path,
        "strategy construction cannot consume a future artifact",
      );
    }
  }
  if (
    Date.parse(referencePrice.observedAt) > Date.parse(input.sourceCutoff)
  ) {
    issue(
      issues,
      "reference_price_from_future",
      "referencePrice.observedAt",
      "reference price must be observed at or before the construction cutoff",
    );
  }
  if (
    qualification.episodeId !== analysis.episodeId ||
    qualification.analysisId !== analysis.analysisId ||
    qualification.evidencePackageId !== analysis.evidencePackageId ||
    qualification.marketContextSnapshotId !== analysis.marketContextSnapshotId
  ) {
    issue(
      issues,
      "strategy_analysis_qualification_identity_mismatch",
      "qualification",
      "strategy inputs must belong to one analysis and Candidate Episode lineage",
    );
  }
  if (
    qualification.opportunityFamily !== analysis.opportunityFamily ||
    qualification.direction !== analysis.directionBias
  ) {
    issue(
      issues,
      "strategy_family_or_direction_lineage_mismatch",
      "qualification",
      "qualification family and direction must match family analysis",
    );
  }
  if (
    analysis.analyzerVersion !==
      m3FamilyAnalyzerVersion(analysis.opportunityFamily)
  ) {
    issue(
      issues,
      "strategy_analysis_policy_version_not_current",
      "analysis.analyzerVersion",
      "strategy construction requires the current family analyzer version",
    );
  }
  if (
    qualification.qualificationPolicyVersion !==
      M3_SIGNAL_QUALIFICATION_POLICY_VERSION
  ) {
    issue(
      issues,
      "strategy_qualification_policy_version_not_current",
      "qualification.qualificationPolicyVersion",
      "strategy construction requires the current qualification policy",
    );
  }
  if (
    analysis.analysisAuthority !== "TEST_ONLY_UNCALIBRATED" ||
    qualification.qualificationAuthority !== "TEST_ONLY_UNCALIBRATED"
  ) {
    issue(
      issues,
      "strategy_input_authority_exceeds_current_mode",
      "executionMode",
      "the current M3.3 builder accepts only test-only uncalibrated artifacts",
    );
  }
  const levelIds = analysis.structuralLevels.map((level) => level.levelId);
  if (new Set(levelIds).size !== levelIds.length) {
    issue(
      issues,
      "duplicate_strategy_structural_level_id",
      "analysis.structuralLevels",
      "strategy construction requires unique structural level ids",
    );
  }
  const structuralFactIds = new Set(
    analysis.structuralLevels.flatMap((level) => level.sourceFactIds),
  );
  if (
    !referencePrice.sourceFactIds.some((factId) =>
      structuralFactIds.has(factId)
    )
  ) {
    issue(
      issues,
      "reference_price_not_bound_to_analysis_facts",
      "referencePrice.sourceFactIds",
      "reference price must share point-in-time fact lineage with the analysis",
    );
  }
  return issues;
}

function prerequisiteReasons(
  analysis: AnalysisSnapshot,
  qualification: SignalQualification,
  input: M3StrategyConstructionInput,
): string[] {
  const reasons: string[] = [];
  if (
    analysis.directionBias !== "LONG" &&
    analysis.directionBias !== "SHORT"
  ) {
    reasons.push("strategy_direction_unresolved");
  }
  if (qualification.evidenceGrade === "INSUFFICIENT") {
    reasons.push("strategy_evidence_insufficient");
  }
  if (qualification.setupGrade === "INVALID") {
    reasons.push("strategy_setup_invalid");
  }
  if (qualification.setupGrade === "UNKNOWN") {
    reasons.push("strategy_setup_unknown");
  }
  if (analysis.structuralLevels.length === 0) {
    reasons.push("strategy_structural_levels_missing");
  }
  if (input.referencePrice.quality.status !== "FRESH") {
    reasons.push("strategy_reference_price_not_fresh");
  }
  return uniqueSorted(reasons);
}

function isEntrySide(
  levelPrice: string,
  referencePrice: string,
  direction: Direction,
): boolean {
  const comparison = compareNonNegativeDecimalStrings(
    levelPrice,
    referencePrice,
  );
  return direction === "LONG" ? comparison <= 0 : comparison >= 0;
}

function closestEntryAnchor(
  levels: readonly StructuralLevel[],
  referencePrice: string,
  direction: Direction,
  allowedKinds: readonly StructuralLevel["kind"][],
): StructuralLevel | null {
  const eligible = levels
    .filter(
      (level) =>
        allowedKinds.includes(level.kind) &&
        level.kind !== "FIB_ZONE" &&
        isEntrySide(level.price, referencePrice, direction),
    )
    .sort((left, right) => {
      const comparison = compareNonNegativeDecimalStrings(
        left.price,
        right.price,
      );
      if (comparison === 0) {
        return left.levelId.localeCompare(right.levelId);
      }
      return direction === "LONG" ? -comparison : comparison;
    });
  return eligible[0] ?? null;
}

function targetSource(level: StructuralLevel): TargetLevel["source"] | null {
  if (level.reasonCodes.includes("prior_extreme")) {
    return "PRIOR_EXTREME";
  }
  if (level.reasonCodes.includes("volume_area")) {
    return "VOLUME_AREA";
  }
  if (
    level.kind === "FIB_ZONE" &&
    level.reasonCodes.includes("validated_extension")
  ) {
    return "VALIDATED_EXTENSION";
  }
  if (level.kind === "FIB_ZONE") {
    return null;
  }
  if (level.kind === "LIQUIDITY") {
    return "LIQUIDITY_AREA";
  }
  return "STRUCTURE_BOUNDARY";
}

function targetAllocations(count: number): readonly number[] {
  if (count === 1) return [100];
  if (count === 2) return [60, 40];
  return [50, 30, 20];
}

function buildTargets(
  levels: readonly StructuralLevel[],
  entryAnchorId: string,
  entryZone: StrategyDraft["plannedEntryZone"],
  direction: Direction,
  allowedKinds: readonly StructuralLevel["kind"][],
): TargetLevel[] {
  const eligible = levels
    .filter((level) => {
      if (level.levelId === entryAnchorId || !allowedKinds.includes(level.kind)) {
        return false;
      }
      if (targetSource(level) === null) {
        return false;
      }
      return direction === "LONG"
        ? compareNonNegativeDecimalStrings(level.price, entryZone.upper) > 0
        : compareNonNegativeDecimalStrings(level.price, entryZone.lower) < 0;
    })
    .sort((left, right) => {
      const comparison = compareNonNegativeDecimalStrings(
        left.price,
        right.price,
      );
      if (comparison === 0) {
        return left.levelId.localeCompare(right.levelId);
      }
      return direction === "LONG" ? comparison : -comparison;
    })
    .slice(0, 3);
  const allocations = targetAllocations(eligible.length);
  return eligible.map((level, index) => ({
    targetId: `target:${index + 1}:${level.levelId}`,
    price: level.price,
    allocationPercent: allocations[index]!,
    source: targetSource(level)!,
    sourceLevelIds: [level.levelId],
  }));
}

function constructGeometry(
  input: M3StrategyConstructionInput,
  direction: Direction,
): Readonly<{
  geometry: ConstructionGeometry | null;
  reasonCodes: readonly string[];
}> {
  const template = m3StrategyTemplate(input.analysis.opportunityFamily);
  const entryAnchor = closestEntryAnchor(
    input.analysis.structuralLevels,
    input.referencePrice.price,
    direction,
    m3EntryKinds(template, direction),
  );
  if (entryAnchor === null) {
    return { geometry: null, reasonCodes: ["strategy_entry_anchor_missing"] };
  }
  if (
    !isWithinDistanceBps(
      input.referencePrice.price,
      entryAnchor.price,
      template.maximumAnchorDistanceBps,
    )
  ) {
    return {
      geometry: null,
      reasonCodes: ["strategy_reference_price_outside_no_chase_distance"],
    };
  }

  const plannedEntryZone = {
    lower: shiftPriceByBps(
      entryAnchor.price,
      template.entryZoneBufferBps,
      "SUBTRACT",
      "FLOOR",
      input.costAssumptions.pricePrecision,
    ),
    upper: shiftPriceByBps(
      entryAnchor.price,
      template.entryZoneBufferBps,
      "ADD",
      "CEIL",
      input.costAssumptions.pricePrecision,
    ),
    sourceLevelIds: [entryAnchor.levelId],
  };
  const structuralStop = shiftPriceByBps(
    entryAnchor.price,
    template.structuralStopBufferBps,
    direction === "LONG" ? "SUBTRACT" : "ADD",
    direction === "LONG" ? "FLOOR" : "CEIL",
    input.costAssumptions.pricePrecision,
  );
  const targets = buildTargets(
    input.analysis.structuralLevels,
    entryAnchor.levelId,
    plannedEntryZone,
    direction,
    m3TargetKinds(template, direction),
  );
  if (targets.length === 0) {
    return { geometry: null, reasonCodes: ["strategy_target_structure_missing"] };
  }
  return {
    geometry: {
      entryAnchor,
      plannedEntryZone,
      structuralStop,
      targets,
    },
    reasonCodes: [],
  };
}

function draftBlockers(
  qualification: SignalQualification,
  grossRewardRisk: number,
  estimatedNetRewardRisk: number,
  input: M3StrategyConstructionInput,
): string[] {
  return uniqueSorted([
    "strategy_authority_test_only_uncalibrated",
    "strategy_buffer_policy_uncalibrated",
    "strategy_cost_assumptions_uncalibrated",
    ...(qualification.evidenceCalibration.abstainReasonCodes.length > 0 ||
      qualification.setupCalibration.abstainReasonCodes.length > 0
      ? ["signal_qualification_calibration_abstained"]
      : []),
    ...(qualification.evidenceGrade === "C"
      ? ["evidence_grade_c_observe_only"]
      : []),
    ...(qualification.setupGrade === "MARGINAL"
      ? ["setup_grade_marginal_observe_only"]
      : []),
    ...(grossRewardRisk < input.costAssumptions.minimumGrossRewardRisk
      ? ["structural_rr_below_minimum"]
      : []),
    ...(estimatedNetRewardRisk <
      input.costAssumptions.minimumEstimatedNetRewardRisk
      ? ["estimated_net_rr_below_minimum"]
      : []),
  ]);
}

function buildDraft(
  input: M3StrategyConstructionInput,
  direction: Direction,
  geometry: ConstructionGeometry,
): StrategyDraft {
  const template = m3StrategyTemplate(input.analysis.opportunityFamily);
  const conservativeEntryPrice = direction === "LONG"
    ? geometry.plannedEntryZone.upper
    : geometry.plannedEntryZone.lower;
  const rewardRisk = calculateConservativeRewardRisk({
    direction,
    conservativeEntryPrice,
    structuralStop: geometry.structuralStop,
    targets: geometry.targets,
    feePerSideBps: input.costAssumptions.feePerSideBps,
    slippagePerSideBps: input.costAssumptions.slippagePerSideBps,
    fundingBps: input.costAssumptions.fundingBps,
    precision: input.costAssumptions.rewardRiskPrecision,
  });
  const blockers = draftBlockers(
    input.qualification,
    rewardRisk.grossRewardRisk,
    rewardRisk.estimatedNetRewardRisk,
    input,
  );
  const content = {
    releaseId: input.releaseId,
    sourceCutoff: input.sourceCutoff,
    episodeId: input.analysis.episodeId,
    analysisId: input.analysis.analysisId,
    qualificationId: input.qualification.qualificationId,
    opportunityFamily: input.analysis.opportunityFamily,
    strategyAuthority: "TEST_ONLY_UNCALIBRATED" as const,
    analyzerVersion: input.analysis.analyzerVersion,
    qualificationPolicyVersion:
      input.qualification.qualificationPolicyVersion,
    templateVersion: m3StrategyTemplateVersion(
      input.analysis.opportunityFamily,
      direction,
    ),
    bufferPolicyVersion: M3_STRATEGY_BUFFER_POLICY_VERSION,
    costAssumptionSetId: input.costAssumptions.assumptionSetId,
    costAssumptionVersion: input.costAssumptions.assumptionVersion,
    direction,
    referencePrice: input.referencePrice.price,
    referencePriceFactIds: [...input.referencePrice.sourceFactIds].sort(),
    whyNow: uniqueSorted([
      ...input.analysis.supportingReasons,
      `entry_anchor:${geometry.entryAnchor.levelId}`,
      `evidence_grade:${input.qualification.evidenceGrade.toLowerCase()}`,
      `setup_grade:${input.qualification.setupGrade.toLowerCase()}`,
    ]),
    whyNotNow: uniqueSorted([
      ...input.analysis.counterEvidence,
      ...blockers,
    ]),
    entryTrigger: template.entryTrigger,
    plannedEntryZone: geometry.plannedEntryZone,
    entryZoneBufferBps: template.entryZoneBufferBps,
    structuralInvalidation:
      `${template.structuralInvalidation}; structuralLevel=${geometry.entryAnchor.levelId}`,
    structuralStopBase: geometry.entryAnchor.price,
    structuralStop: geometry.structuralStop,
    structuralStopBufferBps: template.structuralStopBufferBps,
    structuralStopSourceLevelIds: [geometry.entryAnchor.levelId],
    targets: geometry.targets,
    rewardRiskCalculationVersion:
      M3_CONSERVATIVE_REWARD_RISK_CALCULATION_VERSION,
    rewardRiskPrecision: input.costAssumptions.rewardRiskPrecision,
    grossRewardRisk: rewardRisk.grossRewardRisk,
    estimatedNetRewardRisk: rewardRisk.estimatedNetRewardRisk,
    feePerSideAssumptionBps: input.costAssumptions.feePerSideBps,
    slippagePerSideAssumptionBps:
      input.costAssumptions.slippagePerSideBps,
    fundingAssumptionBps: input.costAssumptions.fundingBps,
    totalConservativeCostBps: rewardRisk.totalConservativeCostBps,
    confirmationWindow: template.confirmationWindow,
    expiresAt: new Date(
      Date.parse(input.generatedAt) + template.expiresAfterMinutes * 60_000,
    ).toISOString(),
    noChaseCondition:
      `${template.noChaseCondition}; maximumAnchorDistanceBps=${template.maximumAnchorDistanceBps}`,
    partialTakeProfitPolicy: template.partialTakeProfitPolicy,
    counterEvidence: uniqueSorted(input.analysis.counterEvidence),
    blockers,
  };
  const digest = stableSha256(content);
  return deepFreezeArtifact(StrategyDraftSchema.parse({
    schemaVersion: RUNTIME_OBJECT_SCHEMA_VERSIONS.StrategyDraft,
    producerModule: "strategy_construction",
    generatedAt: input.generatedAt,
    contentHash: stableContentHash(content),
    draftId: `strategy-draft:${digest.slice(0, 24)}`,
    ...content,
  }));
}

function blockedResult(
  issues: readonly M3StrategyConstructionIssue[],
): M3StrategyConstructionResult {
  const sortedIssues = [...issues].sort((left, right) =>
    `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`));
  const body = {
    schemaVersion: M3_STRATEGY_CONSTRUCTION_RESULT_VERSION,
    status: "BLOCKED" as const,
    authority: "TEST_ONLY_NO_READY_AUTHORITY" as const,
    draft: null,
    reasonCodes: uniqueSorted(sortedIssues.map((item) => item.code)),
    issues: sortedIssues,
  };
  return deepFreezeArtifact({ ...body, resultHash: stableContentHash(body) });
}

function abstainedResult(
  reasonCodes: readonly string[],
): M3StrategyConstructionResult {
  const body = {
    schemaVersion: M3_STRATEGY_CONSTRUCTION_RESULT_VERSION,
    status: "ABSTAINED_NO_DRAFT" as const,
    authority: "TEST_ONLY_NO_READY_AUTHORITY" as const,
    draft: null,
    reasonCodes: uniqueSorted(reasonCodes),
    issues: [] as readonly M3StrategyConstructionIssue[],
  };
  return deepFreezeArtifact({ ...body, resultHash: stableContentHash(body) });
}

export function constructM3Strategy(
  input: unknown,
): M3StrategyConstructionResult {
  const parsed = M3StrategyConstructionInputSchema.safeParse(input);
  if (!parsed.success) {
    return blockedResult(parsed.error.issues.map((schemaIssue) => ({
      code: "strategy_construction_input_schema_rejected",
      path: schemaIssue.path.length === 0 ? "$" : schemaIssue.path.join("."),
      message: schemaIssue.message,
    })));
  }
  const integrityIssues = validateIntegrity(parsed.data);
  if (integrityIssues.length > 0) {
    return blockedResult(integrityIssues);
  }
  const prerequisites = prerequisiteReasons(
    parsed.data.analysis,
    parsed.data.qualification,
    parsed.data,
  );
  if (prerequisites.length > 0) {
    return abstainedResult(prerequisites);
  }

  const direction = parsed.data.analysis.directionBias as Direction;
  const construction = constructGeometry(parsed.data, direction);
  if (construction.geometry === null) {
    return abstainedResult(construction.reasonCodes);
  }
  const draft = buildDraft(parsed.data, direction, construction.geometry);
  const body = {
    schemaVersion: M3_STRATEGY_CONSTRUCTION_RESULT_VERSION,
    status: "CONSTRUCTED_TEST_ONLY" as const,
    authority: "TEST_ONLY_NO_READY_AUTHORITY" as const,
    draft,
    reasonCodes: draft.blockers,
    issues: [] as readonly M3StrategyConstructionIssue[],
  };
  return deepFreezeArtifact({ ...body, resultHash: stableContentHash(body) });
}
