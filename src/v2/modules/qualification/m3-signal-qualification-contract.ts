import { z } from "zod";
import type {
  CalibrationReference,
  EvidencePackage,
  EvidenceQualificationAssessment,
  QualificationDimensionStatus,
  SetupQualificationAssessment,
  SignalQualification,
} from "../../domain/contracts";
import type { EvidenceGrade, SetupGrade } from "../../domain/states";
import {
  AnalysisSnapshotSchema,
  EvidencePackageSchema,
  OpportunityThesisSchema,
  SignalQualificationSchema,
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
  M3_EVIDENCE_GRADE_TEST_POLICY,
  M3_SIGNAL_QUALIFICATION_POLICY_VERSION,
  m3PremiumStructureState,
  m3RegimeFitStatus,
  m3StructureQualificationStatus,
} from "./m3-signal-qualification-policy";

export {
  M3_EVIDENCE_GRADE_TEST_POLICY,
  M3_SIGNAL_QUALIFICATION_POLICY_VERSION,
} from "./m3-signal-qualification-policy";

export const M3_SIGNAL_QUALIFICATION_INPUT_VERSION =
  "m3-signal-qualification-input.v1" as const;
export const M3_SIGNAL_QUALIFICATION_RESULT_VERSION =
  "m3-signal-qualification-result.v1" as const;
export const M3_SIGNAL_QUALIFICATION_MODE =
  "TEST_ONLY_UNCALIBRATED_NO_DECISION_AUTHORITY" as const;

export const M3SignalQualificationInputSchema = z.strictObject({
  schemaVersion: z.literal(M3_SIGNAL_QUALIFICATION_INPUT_VERSION),
  executionMode: z.literal(M3_SIGNAL_QUALIFICATION_MODE),
  policyVersion: z.literal(M3_SIGNAL_QUALIFICATION_POLICY_VERSION),
  releaseId: NonEmptyStringSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  thesis: OpportunityThesisSchema,
  evidence: EvidencePackageSchema,
  analysis: AnalysisSnapshotSchema,
  marketContext: MarketContextSnapshotSchema,
});

export type M3SignalQualificationInput = z.infer<
  typeof M3SignalQualificationInputSchema
>;

export type M3SignalQualificationIssue = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type M3SignalQualificationResult = Readonly<{
  schemaVersion: typeof M3_SIGNAL_QUALIFICATION_RESULT_VERSION;
  status:
    | "CLASSIFIED_UNCALIBRATED"
    | "ABSTAINED_UNCALIBRATED"
    | "BLOCKED";
  authority: "TEST_ONLY_NO_DECISION_AUTHORITY";
  qualification: SignalQualification | null;
  reasonCodes: readonly string[];
  issues: readonly M3SignalQualificationIssue[];
  resultHash: string;
}>;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function issue(
  issues: M3SignalQualificationIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function validateIntegrity(
  input: M3SignalQualificationInput,
): M3SignalQualificationIssue[] {
  const issues: M3SignalQualificationIssue[] = [];
  if (Date.parse(input.sourceCutoff) > Date.parse(input.generatedAt)) {
    issue(
      issues,
      "qualification_generated_before_cutoff",
      "generatedAt",
      "qualification cannot be generated before its source cutoff",
    );
  }
  for (const [path, artifact] of [
    ["thesis", input.thesis],
    ["evidence", input.evidence],
    ["analysis", input.analysis],
    ["marketContext", input.marketContext],
  ] as const) {
    if (artifact.releaseId !== input.releaseId) {
      issue(
        issues,
        "cross_release_qualification_input",
        `${path}.releaseId`,
        "qualification cannot compose artifacts from another release",
      );
    }
    if (
      Date.parse(artifact.sourceCutoff) > Date.parse(input.sourceCutoff) ||
      Date.parse(artifact.generatedAt) > Date.parse(input.generatedAt)
    ) {
      issue(
        issues,
        "qualification_input_not_available_at_cutoff",
        path,
        "qualification cannot read an artifact from the future",
      );
    }
  }
  if (
    input.evidence.episodeId !== input.thesis.episodeId ||
    input.analysis.episodeId !== input.thesis.episodeId ||
    input.evidence.thesisId !== input.thesis.thesisId ||
    input.analysis.thesisId !== input.thesis.thesisId
  ) {
    issue(
      issues,
      "qualification_episode_or_thesis_identity_mismatch",
      "evidence",
      "thesis, evidence and analysis must share one episode and thesis",
    );
  }
  if (input.analysis.evidencePackageId !== input.evidence.evidencePackageId) {
    issue(
      issues,
      "qualification_evidence_analysis_identity_mismatch",
      "analysis.evidencePackageId",
      "analysis must consume the supplied evidence package",
    );
  }
  if (
    input.analysis.marketContextSnapshotId !== input.marketContext.snapshotId
  ) {
    issue(
      issues,
      "qualification_market_context_identity_mismatch",
      "analysis.marketContextSnapshotId",
      "analysis and qualification must read the same market context snapshot",
    );
  }
  if (input.analysis.opportunityFamily !== input.thesis.opportunityFamily) {
    issue(
      issues,
      "qualification_opportunity_family_mismatch",
      "analysis.opportunityFamily",
      "analysis and thesis must keep the same opportunity family",
    );
  }
  const expectedEvidenceIds = input.evidence.items
    .map((item) => item.evidenceId)
    .sort();
  if (
    stableContentHash([...input.analysis.evidenceItemIds].sort()) !==
      stableContentHash(expectedEvidenceIds)
  ) {
    issue(
      issues,
      "qualification_analysis_evidence_coverage_mismatch",
      "analysis.evidenceItemIds",
      "qualification requires analysis to account for every evidence item",
    );
  }
  return issues;
}

function statusForUncertainty(
  status: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN",
): QualificationDimensionStatus {
  if (status === "LOW") return "PASS";
  if (status === "MEDIUM") return "DEGRADED";
  if (status === "HIGH") return "FAIL";
  return "UNKNOWN";
}

function buildEvidenceAssessment(
  evidence: EvidencePackage,
): EvidenceQualificationAssessment {
  const required = evidence.items.filter(
    (item) => item.criticality === "REQUIRED",
  );
  const observedRequired = required.filter(
    (item) => item.stance !== "MISSING",
  );
  const freshItems = evidence.items.filter(
    (item) => item.stance !== "MISSING" && item.quality.status === "FRESH",
  );
  const freshRequired = required.filter(
    (item) => item.stance !== "MISSING" && item.quality.status === "FRESH",
  );
  const independentGroups = new Set(
    freshItems.flatMap((item) => item.independenceGroupIds),
  );
  const completenessStatus: QualificationDimensionStatus =
    observedRequired.length === required.length ? "PASS" : "FAIL";
  const freshnessStatus: QualificationDimensionStatus =
    freshRequired.length !== required.length
      ? "FAIL"
      : freshItems.length === evidence.items.length
        ? "PASS"
        : "DEGRADED";
  const independenceStatus: QualificationDimensionStatus =
    independentGroups.size >=
        M3_EVIDENCE_GRADE_TEST_POLICY.A.minimumIndependentGroups
      ? "PASS"
      : independentGroups.size >=
          M3_EVIDENCE_GRADE_TEST_POLICY.C.minimumIndependentGroups
        ? "DEGRADED"
        : "FAIL";
  const dataQualityStatus: QualificationDimensionStatus =
    evidence.quality.status === "FRESH"
      ? "PASS"
      : evidence.quality.status === "PARTIAL"
        ? "DEGRADED"
        : "FAIL";
  const uncertaintyStatus = statusForUncertainty(
    evidence.uncertainty.data.status,
  );
  const reasonCodes = uniqueSorted([
    `evidence_required_items:${observedRequired.length}/${required.length}`,
    `evidence_fresh_items:${freshItems.length}/${evidence.items.length}`,
    `evidence_independent_groups:${independentGroups.size}`,
    `evidence_package_quality:${evidence.quality.status.toLowerCase()}`,
    `evidence_data_uncertainty:${evidence.uncertainty.data.status.toLowerCase()}`,
    ...(completenessStatus === "PASS"
      ? ["required_evidence_complete"]
      : ["required_evidence_incomplete"]),
    ...(freshnessStatus === "FAIL"
      ? ["required_evidence_not_fresh"]
      : []),
  ]);
  return {
    completenessStatus,
    independenceStatus,
    freshnessStatus,
    dataQualityStatus,
    lineageStatus: "PASS",
    uncertaintyStatus,
    requiredItemCount: required.length,
    observedRequiredItemCount: observedRequired.length,
    freshItemCount: freshItems.length,
    totalItemCount: evidence.items.length,
    independentGroupCount: independentGroups.size,
    reasonCodes,
  };
}

function deriveEvidenceGrade(
  assessment: EvidenceQualificationAssessment,
): EvidenceGrade {
  if (
    assessment.completenessStatus !== "PASS" ||
    assessment.freshnessStatus === "FAIL" ||
    assessment.dataQualityStatus === "FAIL" ||
    assessment.dataQualityStatus === "UNKNOWN" ||
    assessment.lineageStatus !== "PASS" ||
    assessment.uncertaintyStatus === "FAIL" ||
    assessment.uncertaintyStatus === "UNKNOWN" ||
    assessment.independentGroupCount <
      M3_EVIDENCE_GRADE_TEST_POLICY.C.minimumIndependentGroups
  ) {
    return "INSUFFICIENT";
  }
  if (
    assessment.independentGroupCount >=
      M3_EVIDENCE_GRADE_TEST_POLICY.A.minimumIndependentGroups &&
    assessment.freshItemCount >= 3 &&
    assessment.freshnessStatus === "PASS" &&
    assessment.dataQualityStatus === "PASS" &&
    assessment.uncertaintyStatus === "PASS"
  ) {
    return "A";
  }
  if (
    assessment.independentGroupCount >=
      M3_EVIDENCE_GRADE_TEST_POLICY.B.minimumIndependentGroups &&
    assessment.freshItemCount >= 2
  ) {
    return "B";
  }
  return "C";
}

function riskStatus(
  risk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN",
): QualificationDimensionStatus {
  if (risk === "LOW") return "PASS";
  if (risk === "MEDIUM") return "DEGRADED";
  if (risk === "HIGH") return "FAIL";
  return "UNKNOWN";
}

function buildSetupAssessment(
  input: M3SignalQualificationInput,
): SetupQualificationAssessment {
  const { analysis, marketContext } = input;
  const directionStatus: QualificationDimensionStatus =
    analysis.directionBias === "LONG" || analysis.directionBias === "SHORT"
      ? "PASS"
      : "UNKNOWN";
  const structureStatus = m3StructureQualificationStatus(analysis);
  const locationStatus: QualificationDimensionStatus =
    analysis.locationQuality === "GOOD"
      ? "PASS"
      : analysis.locationQuality === "ACCEPTABLE"
        ? "DEGRADED"
        : analysis.locationQuality === "POOR"
          ? "FAIL"
          : "UNKNOWN";
  const spaceStatus: QualificationDimensionStatus =
    analysis.spaceQuality === "GOOD"
      ? "PASS"
      : analysis.spaceQuality === "ACCEPTABLE"
        ? "DEGRADED"
        : analysis.spaceQuality === "CONSTRAINED"
          ? "FAIL"
          : "UNKNOWN";
  const timingStatus = riskStatus(analysis.lateRisk);
  const fakeoutStatus = riskStatus(analysis.fakeoutRisk);
  const noiseStatus = riskStatus(analysis.noiseRisk);
  const regimeFitStatus = m3RegimeFitStatus(
    analysis.opportunityFamily,
    marketContext,
  );
  const marketUncertainty = [
    analysis.uncertainty.market.status,
    marketContext.uncertainty.market.status,
  ];
  const uncertaintyStatus: QualificationDimensionStatus =
    marketUncertainty.includes("UNKNOWN")
      ? "UNKNOWN"
      : marketUncertainty.includes("HIGH")
        ? "FAIL"
        : marketUncertainty.includes("MEDIUM")
          ? "DEGRADED"
          : "PASS";
  return {
    directionStatus,
    structureStatus,
    locationStatus,
    spaceStatus,
    timingStatus,
    fakeoutStatus,
    noiseStatus,
    regimeFitStatus,
    uncertaintyStatus,
    reasonCodes: uniqueSorted([
      `setup_structure:${analysis.structureState.toLowerCase()}`,
      `setup_stage:${analysis.marketStage.toLowerCase()}`,
      `setup_location:${analysis.locationQuality.toLowerCase()}`,
      `setup_space:${analysis.spaceQuality.toLowerCase()}`,
      `setup_late_risk:${analysis.lateRisk.toLowerCase()}`,
      `setup_fakeout_risk:${analysis.fakeoutRisk.toLowerCase()}`,
      `setup_noise_risk:${analysis.noiseRisk.toLowerCase()}`,
      `setup_regime:${marketContext.regime.toLowerCase()}`,
      `setup_regime_fit:${regimeFitStatus.toLowerCase()}`,
    ]),
  };
}

function deriveSetupGrade(
  input: M3SignalQualificationInput,
  assessment: SetupQualificationAssessment,
): SetupGrade {
  if (
    assessment.structureStatus === "FAIL" ||
    assessment.spaceStatus === "FAIL"
  ) {
    return "INVALID";
  }
  if (
    assessment.directionStatus === "UNKNOWN" ||
    assessment.structureStatus === "UNKNOWN" ||
    assessment.locationStatus === "UNKNOWN" ||
    assessment.spaceStatus === "UNKNOWN" ||
    assessment.timingStatus === "UNKNOWN" ||
    assessment.fakeoutStatus === "UNKNOWN" ||
    assessment.noiseStatus === "UNKNOWN" ||
    assessment.regimeFitStatus === "UNKNOWN" ||
    assessment.uncertaintyStatus === "UNKNOWN"
  ) {
    return "UNKNOWN";
  }
  const qualityStatuses = [
    assessment.locationStatus,
    assessment.spaceStatus,
    assessment.timingStatus,
    assessment.fakeoutStatus,
    assessment.noiseStatus,
    assessment.regimeFitStatus,
    assessment.uncertaintyStatus,
  ];
  if (
    m3PremiumStructureState(input.analysis) &&
    assessment.structureStatus === "PASS" &&
    qualityStatuses.every((status) => status === "PASS")
  ) {
    return "PREMIUM";
  }
  if (qualityStatuses.every((status) => status !== "FAIL")) {
    return "QUALIFIED";
  }
  return "MARGINAL";
}

function uncalibratedReference(
  kind: "evidence" | "setup",
  input: M3SignalQualificationInput,
): CalibrationReference {
  return {
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
      opportunityFamily: input.analysis.opportunityFamily,
      direction: input.analysis.directionBias,
      regime: input.marketContext.regime,
    },
    evaluatedAt: null,
    abstainReasonCodes: [
      `${kind}_grade_real_cohort_calibration_absent`,
      "test_only_policy_has_no_probability_authority",
    ],
  };
}

function buildQualification(
  input: M3SignalQualificationInput,
): SignalQualification {
  const evidenceAssessment = buildEvidenceAssessment(input.evidence);
  const setupAssessment = buildSetupAssessment(input);
  const evidenceGrade = deriveEvidenceGrade(evidenceAssessment);
  const setupGrade = deriveSetupGrade(input, setupAssessment);
  const evidenceCalibration = uncalibratedReference("evidence", input);
  const setupCalibration = uncalibratedReference("setup", input);
  const content = {
    releaseId: input.releaseId,
    sourceCutoff: input.sourceCutoff,
    episodeId: input.thesis.episodeId,
    thesisId: input.thesis.thesisId,
    evidencePackageId: input.evidence.evidencePackageId,
    analysisId: input.analysis.analysisId,
    marketContextSnapshotId: input.marketContext.snapshotId,
    opportunityFamily: input.analysis.opportunityFamily,
    direction: input.analysis.directionBias,
    qualificationPolicyVersion: M3_SIGNAL_QUALIFICATION_POLICY_VERSION,
    qualificationAuthority: "TEST_ONLY_UNCALIBRATED" as const,
    evidenceGrade,
    setupGrade,
    evidenceAssessment,
    setupAssessment,
    evidenceCalibration,
    setupCalibration,
    reasonCodes: uniqueSorted([
      `evidence_grade:${evidenceGrade.toLowerCase()}`,
      `setup_grade:${setupGrade.toLowerCase()}`,
      "evidence_and_setup_assessed_independently",
      "qualification_uncalibrated_test_only",
      ...(evidenceGrade === "INSUFFICIENT"
        ? ["qualification_abstains_on_evidence"]
        : []),
      ...(setupGrade === "UNKNOWN" || setupGrade === "INVALID"
        ? ["qualification_abstains_on_setup"]
        : []),
    ]),
  };
  const digest = stableSha256(content);
  return deepFreezeArtifact(SignalQualificationSchema.parse({
    schemaVersion: RUNTIME_OBJECT_SCHEMA_VERSIONS.SignalQualification,
    producerModule: "signal_qualification",
    generatedAt: input.generatedAt,
    contentHash: stableContentHash(content),
    qualificationId: `qualification:${digest.slice(0, 24)}`,
    ...content,
  }));
}

function blockedResult(
  issues: readonly M3SignalQualificationIssue[],
): M3SignalQualificationResult {
  const sortedIssues = [...issues].sort((left, right) =>
    `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`));
  const body = {
    schemaVersion: M3_SIGNAL_QUALIFICATION_RESULT_VERSION,
    status: "BLOCKED" as const,
    authority: "TEST_ONLY_NO_DECISION_AUTHORITY" as const,
    qualification: null,
    reasonCodes: uniqueSorted(sortedIssues.map((item) => item.code)),
    issues: sortedIssues,
  };
  return deepFreezeArtifact({ ...body, resultHash: stableContentHash(body) });
}

export function qualifyM3Signal(
  input: unknown,
): M3SignalQualificationResult {
  const parsed = M3SignalQualificationInputSchema.safeParse(input);
  if (!parsed.success) {
    return blockedResult(parsed.error.issues.map((schemaIssue) => ({
      code: "signal_qualification_input_schema_rejected",
      path: schemaIssue.path.length === 0 ? "$" : schemaIssue.path.join("."),
      message: schemaIssue.message,
    })));
  }
  const integrityIssues = validateIntegrity(parsed.data);
  if (integrityIssues.length > 0) {
    return blockedResult(integrityIssues);
  }
  const qualification = buildQualification(parsed.data);
  const abstained =
    qualification.evidenceGrade === "INSUFFICIENT" ||
    qualification.setupGrade === "UNKNOWN" ||
    qualification.setupGrade === "INVALID";
  const body = {
    schemaVersion: M3_SIGNAL_QUALIFICATION_RESULT_VERSION,
    status: abstained
      ? "ABSTAINED_UNCALIBRATED" as const
      : "CLASSIFIED_UNCALIBRATED" as const,
    authority: "TEST_ONLY_NO_DECISION_AUTHORITY" as const,
    qualification,
    reasonCodes: qualification.reasonCodes,
    issues: [] as readonly M3SignalQualificationIssue[],
  };
  return deepFreezeArtifact({ ...body, resultHash: stableContentHash(body) });
}
