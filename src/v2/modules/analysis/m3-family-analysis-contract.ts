import { z } from "zod";
import type {
  AnalysisSnapshot,
  DirectionHypothesis,
  EvidencePackage,
  StructuralLevel,
} from "../../domain/contracts";
import {
  OPPORTUNITY_PATTERNS_BY_FAMILY,
  type OpportunityFamily,
  type OpportunityPattern,
} from "../../domain/product-constitution";
import type { UncertaintyStatus, UncertaintyVector } from "../../domain/uncertainty";
import {
  AnalysisSnapshotSchema,
  EvidencePackageSchema,
  OpportunityThesisSchema,
  StructuralLevelSchema,
} from "../../runtime-schema/decision-schemas";
import { MarketContextSnapshotSchema } from "../../runtime-schema/foundation-schemas";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
} from "../../runtime-schema/primitives";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "../../runtime-schema/schema-versions";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "../universe/stable-artifact";
import {
  M3_FAMILY_ANALYSIS_HARD_INVALIDATION_CODES,
  M3_FAMILY_ANALYSIS_OBSERVATION_CODES,
  M3_FAMILY_ANALYSIS_OBSERVATION_DEFINITIONS,
  M3_FAMILY_ANALYSIS_POLICY_VERSION,
  m3FamilyAnalyzerVersion,
  requiredM3FamilyAnalysisCategories,
  resolveM3FamilyAnalysis,
  type M3FamilyAnalysisCategory,
  type M3FamilyAnalysisObservationCode,
} from "./m3-family-analysis-policy";

export {
  M3_FAMILY_ANALYSIS_CATEGORIES,
  M3_FAMILY_ANALYSIS_OBSERVATION_CODES,
  M3_FAMILY_ANALYSIS_OBSERVATION_DEFINITIONS,
  M3_FAMILY_ANALYSIS_POLICY_VERSION,
  type M3FamilyAnalysisObservationCode,
} from "./m3-family-analysis-policy";

export const M3_FAMILY_ANALYSIS_INPUT_VERSION =
  "m3-family-analysis-input.v1" as const;
export const M3_FAMILY_ANALYSIS_RESULT_VERSION =
  "m3-family-analysis-result.v1" as const;
export const M3_FAMILY_ANALYSIS_MODE =
  "TEST_ONLY_UNCALIBRATED_NO_STRATEGY_AUTHORITY" as const;

const M3FamilyAnalysisObservationSchema = z.strictObject({
  observationId: NonEmptyStringSchema,
  evidenceId: NonEmptyStringSchema,
  observationCode: z.enum(M3_FAMILY_ANALYSIS_OBSERVATION_CODES),
  observedAt: IsoDateTimeSchema,
});

export const M3FamilyAnalysisInputSchema = z.strictObject({
  schemaVersion: z.literal(M3_FAMILY_ANALYSIS_INPUT_VERSION),
  executionMode: z.literal(M3_FAMILY_ANALYSIS_MODE),
  policyVersion: z.literal(M3_FAMILY_ANALYSIS_POLICY_VERSION),
  releaseId: NonEmptyStringSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  thesis: OpportunityThesisSchema,
  evidence: EvidencePackageSchema,
  marketContext: MarketContextSnapshotSchema,
  observations: z.array(M3FamilyAnalysisObservationSchema).min(1),
  structuralLevels: z.array(StructuralLevelSchema),
});

export type M3FamilyAnalysisInput = z.infer<typeof M3FamilyAnalysisInputSchema>;

export type M3FamilyAnalysisIssue = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type M3FamilyAnalysisResult = Readonly<{
  schemaVersion: typeof M3_FAMILY_ANALYSIS_RESULT_VERSION;
  status: "ANALYZED_UNCALIBRATED" | "BLOCKED";
  authority: "TEST_ONLY_NO_STRATEGY_AUTHORITY";
  analysis: AnalysisSnapshot | null;
  reasonCodes: readonly string[];
  issues: readonly M3FamilyAnalysisIssue[];
  resultHash: string;
}>;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function issue(
  issues: M3FamilyAnalysisIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function usableEvidenceItem(item: EvidencePackage["items"][number]): boolean {
  return item.stance !== "MISSING" && item.quality.status === "FRESH";
}

function validateIntegrity(input: M3FamilyAnalysisInput): M3FamilyAnalysisIssue[] {
  const issues: M3FamilyAnalysisIssue[] = [];
  const { thesis, evidence, marketContext } = input;
  for (const [path, artifact] of [
    ["thesis", thesis],
    ["evidence", evidence],
    ["marketContext", marketContext],
  ] as const) {
    if (artifact.releaseId !== input.releaseId) {
      issue(issues, "cross_release_analysis_input", `${path}.releaseId`,
        "family analysis cannot compose artifacts from another release");
    }
    if (
      Date.parse(artifact.sourceCutoff) > Date.parse(input.sourceCutoff) ||
      Date.parse(artifact.generatedAt) > Date.parse(input.generatedAt)
    ) {
      issue(issues, "analysis_input_not_available_at_cutoff", path,
        "family analysis cannot read an artifact from the future");
    }
  }
  if (Date.parse(input.sourceCutoff) > Date.parse(input.generatedAt)) {
    issue(issues, "analysis_generated_before_cutoff", "generatedAt",
      "family analysis cannot be generated before its source cutoff");
  }
  if (
    evidence.episodeId !== thesis.episodeId ||
    evidence.thesisId !== thesis.thesisId
  ) {
    issue(issues, "analysis_thesis_evidence_identity_mismatch", "evidence",
      "evidence package must belong to the supplied thesis and episode");
  }
  if (Date.parse(evidence.sourceCutoff) < Date.parse(thesis.sourceCutoff)) {
    issue(issues, "evidence_predates_thesis", "evidence.sourceCutoff",
      "evidence package cannot predate the thesis it validates");
  }

  const observationIds = input.observations.map((item) => item.observationId);
  if (new Set(observationIds).size !== observationIds.length) {
    issue(issues, "duplicate_analysis_observation_id", "observations",
      "analysis observation ids must be unique");
  }
  const observationEvidenceIds = input.observations.map((item) => item.evidenceId);
  if (new Set(observationEvidenceIds).size !== observationEvidenceIds.length) {
    issue(issues, "duplicate_evidence_interpretation", "observations",
      "each evidence item must be interpreted exactly once");
  }
  const evidenceById = new Map(evidence.items.map((item) => [item.evidenceId, item]));
  if (
    stableContentHash([...observationEvidenceIds].sort()) !==
      stableContentHash([...evidenceById.keys()].sort())
  ) {
    issue(issues, "evidence_interpretation_coverage_mismatch", "observations",
      "analysis must interpret every evidence item and no undeclared item");
  }
  for (const [index, observation] of input.observations.entries()) {
    const item = evidenceById.get(observation.evidenceId);
    if (item === undefined) {
      continue;
    }
    const definition =
      M3_FAMILY_ANALYSIS_OBSERVATION_DEFINITIONS[observation.observationCode];
    if (!definition.families.includes(thesis.opportunityFamily)) {
      issue(issues, "observation_code_family_mismatch",
        `observations.${index}.observationCode`,
        "observation code does not belong to the thesis opportunity family");
    }
    if (item.category !== definition.category) {
      issue(issues, "observation_category_mismatch", `observations.${index}`,
        "observation code category must match its evidence item category");
    }
    if (item.stance !== definition.stance) {
      issue(issues, "observation_stance_mismatch", `observations.${index}`,
        "observation code stance must match its evidence item stance");
    }
    const expectedReasonCode =
      `m3_observation:${observation.observationCode.toLowerCase()}`;
    if (!item.reasonCodes.includes(expectedReasonCode)) {
      issue(issues, "observation_not_bound_to_evidence_reason",
        `observations.${index}.observationCode`,
        "family analysis cannot relabel an evidence item with a different observation code");
    }
    if (Date.parse(observation.observedAt) !== Date.parse(item.observedAt)) {
      issue(issues, "observation_time_mismatch", `observations.${index}.observedAt`,
        "analysis observation time must equal its evidence item time");
    }
    if (Date.parse(observation.observedAt) > Date.parse(input.sourceCutoff)) {
      issue(issues, "analysis_observation_from_future",
        `observations.${index}.observedAt`,
        "analysis observation cannot exceed the analysis cutoff");
    }
  }

  const factQuality = new Map<string, boolean>();
  for (const item of evidence.items) {
    for (const factId of item.factIds) {
      factQuality.set(factId, (factQuality.get(factId) ?? false) || usableEvidenceItem(item));
    }
  }
  const levelIds = input.structuralLevels.map((level) => level.levelId);
  if (new Set(levelIds).size !== levelIds.length) {
    issue(issues, "duplicate_structural_level_id", "structuralLevels",
      "structural level ids must be unique");
  }
  for (const [index, level] of input.structuralLevels.entries()) {
    for (const factId of level.sourceFactIds) {
      if (!factQuality.has(factId)) {
        issue(issues, "structural_level_fact_not_in_evidence",
          `structuralLevels.${index}.sourceFactIds`,
          "every structural level fact must be declared by the evidence package");
      } else if (!factQuality.get(factId)) {
        issue(issues, "structural_level_fact_not_fresh",
          `structuralLevels.${index}.sourceFactIds`,
          "a structural level cannot rely only on missing or non-fresh evidence");
      }
    }
  }
  if (
    input.structuralLevels.length > 0 &&
    input.structuralLevels.every((level) => level.kind === "FIB_ZONE")
  ) {
    issue(issues, "fib_only_structure_forbidden", "structuralLevels",
      "a Fibonacci zone cannot be the sole structural basis for analysis");
  }
  return issues;
}

function codes(input: M3FamilyAnalysisInput): Set<M3FamilyAnalysisObservationCode> {
  return new Set(input.observations.map((item) => item.observationCode));
}

function missingRequiredCategories(input: M3FamilyAnalysisInput): M3FamilyAnalysisCategory[] {
  const usableCategories = new Set(input.evidence.items
    .filter(usableEvidenceItem)
    .map((item) => item.category));
  return requiredM3FamilyAnalysisCategories(input.thesis).filter((category) =>
    !usableCategories.has(category)
  );
}

function directionBias(
  input: M3FamilyAnalysisInput,
  found: Set<M3FamilyAnalysisObservationCode>,
  missing: readonly M3FamilyAnalysisCategory[],
): DirectionHypothesis {
  if (
    input.evidence.quality.status !== "FRESH" ||
    input.evidence.completenessRatio < 1 ||
    missing.length > 0 ||
    [...found].some((code) => M3_FAMILY_ANALYSIS_HARD_INVALIDATION_CODES.has(code))
  ) {
    return "UNKNOWN";
  }
  const evidenceById = new Map(input.evidence.items.map((item) => [item.evidenceId, item]));
  const directions = new Set(input.observations.flatMap((observation) => {
    const item = evidenceById.get(observation.evidenceId);
    const definition = M3_FAMILY_ANALYSIS_OBSERVATION_DEFINITIONS[observation.observationCode];
    return item !== undefined && usableEvidenceItem(item) &&
      (definition.direction === "LONG" || definition.direction === "SHORT")
      ? [definition.direction]
      : [];
  }));
  if (directions.size !== 1) {
    return "UNKNOWN";
  }
  const direction = [...directions][0]!;
  if (
    (input.thesis.directionHypothesis === "LONG" ||
      input.thesis.directionHypothesis === "SHORT") &&
    input.thesis.directionHypothesis !== direction
  ) {
    return "UNKNOWN";
  }
  return direction;
}

function locationQuality(
  found: Set<M3FamilyAnalysisObservationCode>,
  structuralLevels: readonly StructuralLevel[],
): AnalysisSnapshot["locationQuality"] {
  if (found.has("LOCATION_EXTENDED_OR_CHASE") || found.has("BREAKOUT_SPACE_CONSTRAINED")) {
    return "POOR";
  }
  if (structuralLevels.length === 0) {
    return "UNKNOWN";
  }
  if (found.has("LOCATION_STRUCTURAL_GOOD")) {
    return "GOOD";
  }
  if (found.has("LOCATION_STRUCTURAL_ACCEPTABLE")) {
    return "ACCEPTABLE";
  }
  return "UNKNOWN";
}

function risk(
  found: Set<M3FamilyAnalysisObservationCode>,
  highCodes: readonly M3FamilyAnalysisObservationCode[],
  mediumCodes: readonly M3FamilyAnalysisObservationCode[],
  lowCodes: readonly M3FamilyAnalysisObservationCode[],
): "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" {
  if (highCodes.some((code) => found.has(code))) {
    return "HIGH";
  }
  if (mediumCodes.some((code) => found.has(code))) {
    return "MEDIUM";
  }
  return lowCodes.some((code) => found.has(code)) ? "LOW" : "UNKNOWN";
}

function maxUncertainty(
  left: UncertaintyStatus,
  right: UncertaintyStatus,
): UncertaintyStatus {
  const order: readonly UncertaintyStatus[] = ["LOW", "MEDIUM", "HIGH", "UNKNOWN"];
  return order[Math.max(order.indexOf(left), order.indexOf(right))]!;
}

function buildUncertainty(
  input: M3FamilyAnalysisInput,
  missing: readonly M3FamilyAnalysisCategory[],
): UncertaintyVector {
  const allEvidenceFresh = input.evidence.quality.status === "FRESH" &&
    input.evidence.items.every((item) => item.quality.status === "FRESH");
  const dataStatus: UncertaintyStatus = !allEvidenceFresh ||
    input.evidence.completenessRatio < 1 || missing.length > 0
    ? "UNKNOWN"
    : "MEDIUM";
  const marketStatus = input.marketContext.quality.status === "FRESH"
    ? maxUncertainty(input.marketContext.uncertainty.market.status,
      input.marketContext.confidence === "UNKNOWN" ? "UNKNOWN" : "MEDIUM")
    : "UNKNOWN";
  return {
    data: {
      dimension: "data",
      status: dataStatus,
      reasonCodes: uniqueSorted([
        ...(allEvidenceFresh ? [] : ["analysis_evidence_not_fully_fresh"]),
        ...(input.evidence.completenessRatio < 1
          ? ["analysis_evidence_package_incomplete"]
          : []),
        ...missing.map((category) =>
          `required_analysis_category_missing:${category.toLowerCase()}`),
        ...(dataStatus === "MEDIUM"
          ? ["evidence_lineage_complete_but_analysis_not_empirically_calibrated"]
          : []),
      ]),
      sampleSize: allEvidenceFresh ? input.evidence.items.length : null,
      calibrationVersion: null,
      lastValidatedAt: null,
    },
    model: {
      dimension: "model",
      status: "HIGH",
      reasonCodes: ["m3_family_analysis_policy_uncalibrated_test_only"],
      sampleSize: null,
      calibrationVersion: null,
      lastValidatedAt: null,
    },
    market: {
      dimension: "market",
      status: marketStatus,
      reasonCodes: uniqueSorted([
        ...input.marketContext.uncertainty.market.reasonCodes,
        ...(input.marketContext.quality.status === "FRESH"
          ? []
          : ["market_context_not_fresh"]),
        ...(input.marketContext.confidence === "UNKNOWN"
          ? ["market_context_confidence_unknown"]
          : []),
      ]),
      sampleSize: input.marketContext.uncertainty.market.sampleSize,
      calibrationVersion: input.marketContext.uncertainty.market.calibrationVersion,
      lastValidatedAt: input.marketContext.uncertainty.market.lastValidatedAt,
    },
    execution: {
      dimension: "execution",
      status: "UNKNOWN",
      reasonCodes: ["family_analysis_does_not_evaluate_execution"],
      sampleSize: null,
      calibrationVersion: null,
      lastValidatedAt: null,
    },
  };
}

function analysisReasons(
  input: M3FamilyAnalysisInput,
  missing: readonly M3FamilyAnalysisCategory[],
): Pick<AnalysisSnapshot, "supportingReasons" | "counterEvidence"> {
  const evidenceById = new Map(input.evidence.items.map((item) => [item.evidenceId, item]));
  const supporting: string[] = [];
  const counter: string[] = [];
  for (const observation of input.observations) {
    const item = evidenceById.get(observation.evidenceId);
    if (item === undefined) {
      continue;
    }
    const reasons = [
      `observation:${observation.observationCode.toLowerCase()}`,
      ...item.reasonCodes,
      ...(item.quality.status === "FRESH"
        ? []
        : [`evidence_quality:${item.quality.status.toLowerCase()}`]),
    ];
    if (item.stance === "SUPPORTING" && item.quality.status === "FRESH") {
      supporting.push(...reasons);
    } else {
      counter.push(...reasons);
    }
  }
  counter.push(...missing.map((category) =>
    `required_analysis_category_missing:${category.toLowerCase()}`));
  return {
    supportingReasons: uniqueSorted(supporting),
    counterEvidence: uniqueSorted(counter),
  };
}

function buildAnalysis(input: M3FamilyAnalysisInput): AnalysisSnapshot {
  const found = codes(input);
  const missing = missingRequiredCategories(input);
  const resolution = resolveM3FamilyAnalysis(input.thesis.opportunityFamily, found);
  const reasons = analysisReasons(input, missing);
  const direction = directionBias(input, found, missing);
  if (
    direction === "UNKNOWN" &&
    (input.thesis.directionHypothesis === "LONG" ||
      input.thesis.directionHypothesis === "SHORT")
  ) {
    reasons.counterEvidence = uniqueSorted([
      ...reasons.counterEvidence,
      "family_analysis_direction_not_confirmed",
    ]);
  }
  const sortedLevels = [...input.structuralLevels].sort((left, right) =>
    left.levelId.localeCompare(right.levelId));
  const content = {
    releaseId: input.releaseId,
    sourceCutoff: input.sourceCutoff,
    episodeId: input.thesis.episodeId,
    thesisId: input.thesis.thesisId,
    evidencePackageId: input.evidence.evidencePackageId,
    evidenceItemIds: input.evidence.items.map((item) => item.evidenceId).sort(),
    marketContextSnapshotId: input.marketContext.snapshotId,
    analyzerVersion: m3FamilyAnalyzerVersion(input.thesis.opportunityFamily),
    analysisAuthority: "TEST_ONLY_UNCALIBRATED" as const,
    opportunityFamily: input.thesis.opportunityFamily,
    directionBias: direction,
    structureState: resolution.structureState,
    marketStage: resolution.marketStage,
    locationQuality: locationQuality(found, sortedLevels),
    structuralLevels: sortedLevels,
    supportingReasons: reasons.supportingReasons,
    counterEvidence: reasons.counterEvidence,
    lateRisk: risk(found,
      ["PRE_MOVE_MOVE_CONSUMED", "TREND_EXTENSION_CONSUMED", "LOCATION_EXTENDED_OR_CHASE"],
      ["DERIVATIVES_POSITIONING_OVERHEATED"],
      ["TIMING_EARLY_OR_NOT_CONSUMED"]),
    fakeoutRisk: risk(found,
      ["BREAKOUT_RETURNED_INSIDE", "REVERSAL_SWEEP_NOT_RECLAIMED", "RELATIVE_NOT_PERSISTENT"],
      ["CROSS_VENUE_CONFLICT"],
      ["CROSS_VENUE_CONFIRMED"]),
    noiseRisk: risk(found,
      ["PRE_MOVE_THIN_SINGLE_VENUE", "DERIVATIVES_POST_LIQUIDATION_NOISE", "NOISE_ELEVATED"],
      ["RELATIVE_LOW_TURNOVER_DISTORTION", "RELATIVE_BENCHMARK_SHOCK"],
      ["CROSS_VENUE_CONFIRMED"]),
    uncertainty: buildUncertainty(input, missing),
  };
  const digest = stableSha256(content);
  return deepFreezeArtifact(AnalysisSnapshotSchema.parse({
    schemaVersion: RUNTIME_OBJECT_SCHEMA_VERSIONS.AnalysisSnapshot,
    producerModule: "family_analysis",
    generatedAt: input.generatedAt,
    contentHash: stableContentHash(content),
    analysisId: `analysis:${digest.slice(0, 24)}`,
    ...content,
  }));
}

function blockedResult(
  issues: readonly M3FamilyAnalysisIssue[],
): M3FamilyAnalysisResult {
  const sortedIssues = [...issues].sort((left, right) =>
    `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`));
  const body = {
    schemaVersion: M3_FAMILY_ANALYSIS_RESULT_VERSION,
    status: "BLOCKED" as const,
    authority: "TEST_ONLY_NO_STRATEGY_AUTHORITY" as const,
    analysis: null,
    reasonCodes: uniqueSorted(sortedIssues.map((item) => item.code)),
    issues: sortedIssues,
  };
  return deepFreezeArtifact({ ...body, resultHash: stableContentHash(body) });
}

export function analyzeM3FamilyEvidence(input: unknown): M3FamilyAnalysisResult {
  const parsed = M3FamilyAnalysisInputSchema.safeParse(input);
  if (!parsed.success) {
    return blockedResult(parsed.error.issues.map((schemaIssue) => ({
      code: "family_analysis_input_schema_rejected",
      path: schemaIssue.path.length === 0 ? "$" : schemaIssue.path.join("."),
      message: schemaIssue.message,
    })));
  }
  const integrityIssues = validateIntegrity(parsed.data);
  if (integrityIssues.length > 0) {
    return blockedResult(integrityIssues);
  }
  const analysis = buildAnalysis(parsed.data);
  const body = {
    schemaVersion: M3_FAMILY_ANALYSIS_RESULT_VERSION,
    status: "ANALYZED_UNCALIBRATED" as const,
    authority: "TEST_ONLY_NO_STRATEGY_AUTHORITY" as const,
    analysis,
    reasonCodes: [
      "family_analysis_generated_from_complete_evidence_lineage",
      "m3_family_analysis_policy_uncalibrated_test_only",
    ],
    issues: [] as readonly M3FamilyAnalysisIssue[],
  };
  return deepFreezeArtifact({ ...body, resultHash: stableContentHash(body) });
}

export function supportedM3FamilyAnalysisPatterns(
  family: OpportunityFamily,
): readonly OpportunityPattern[] {
  return OPPORTUNITY_PATTERNS_BY_FAMILY[family];
}
