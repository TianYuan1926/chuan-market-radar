import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "../universe/stable-artifact";
import {
  M3_MULTI_ASSET_DECISION_AUTHORITY,
  M3_MULTI_ASSET_REGIMES,
  M3MultiAssetDigestSchema,
  M3MultiAssetOpportunitySchema,
  M3MultiAssetScopeBindingSchema,
  M3MultiAssetSegmentBindingSchema,
  sameM3MultiAssetSegment,
  segmentBindingFromScope,
  uniqueSorted,
} from "./m3-multi-asset-decision-contract";
import {
  M3MultiAssetAnalysisSnapshotSchema,
  verifyM3MultiAssetAnalysisHash,
} from "./m3-multi-asset-analysis";

export const M3_MULTI_ASSET_QUALIFICATION_INPUT_VERSION =
  "m3-multi-asset-qualification-input.v2" as const;
export const M3_MULTI_ASSET_QUALIFICATION_VERSION =
  "m3-multi-asset-qualification.v2" as const;
export const M3_MULTI_ASSET_QUALIFICATION_RESULT_VERSION =
  "m3-multi-asset-qualification-result.v2" as const;
export const M3_MULTI_ASSET_QUALIFICATION_POLICY_VERSION =
  "m3-multi-asset-independent-evidence-setup-policy.v2-research-only" as const;
export const M3_MULTI_ASSET_CALIBRATION_REFERENCE_VERSION =
  "m3-multi-asset-calibration-reference.v2" as const;

export const M3_MULTI_ASSET_CALIBRATION_MINIMUM_SAMPLE_SIZE = 60 as const;
export const M3_MULTI_ASSET_CALIBRATION_MINIMUM_REGIMES = 3 as const;
export const M3_MULTI_ASSET_CALIBRATION_DIMENSIONS = [
  "EVIDENCE",
  "SETUP",
] as const;

const CalibratedDirectionSchema = z.enum(["LONG", "SHORT"]);
const CalibratedRegimeSchema = z.enum([
  "TREND",
  "RANGE",
  "TRANSITION",
  "STRESS",
]);

const M3MultiAssetCalibrationBodySchema = z.strictObject({
  schemaVersion: z.literal(M3_MULTI_ASSET_CALIBRATION_REFERENCE_VERSION),
  status: z.enum(["CALIBRATED", "INSUFFICIENT", "UNAVAILABLE"]),
  dimension: z.enum(M3_MULTI_ASSET_CALIBRATION_DIMENSIONS),
  segment: M3MultiAssetSegmentBindingSchema,
  opportunityFamily: M3MultiAssetOpportunitySchema.shape.opportunityFamily,
  direction: CalibratedDirectionSchema,
  regime: z.enum(M3_MULTI_ASSET_REGIMES),
  calibrationVersion: NonEmptyStringSchema.nullable(),
  cohortId: NonEmptyStringSchema.nullable(),
  untouchedHoldoutId: NonEmptyStringSchema.nullable(),
  cohortDigest: M3MultiAssetDigestSchema.nullable(),
  untouchedHoldoutDigest: M3MultiAssetDigestSchema.nullable(),
  thresholdSetDigest: M3MultiAssetDigestSchema.nullable(),
  metricDefinitionDigest: M3MultiAssetDigestSchema.nullable(),
  sampleSize: NonNegativeIntegerSchema,
  coveredRegimes: z.array(CalibratedRegimeSchema),
  untouchedHoldout: z.boolean(),
  holdoutAccessCount: NonNegativeIntegerSchema,
  thresholdsFrozenBeforeHoldout: z.boolean(),
  futureLeakageDetected: z.boolean(),
  evidenceIds: z.array(NonEmptyStringSchema),
  sourceCutoff: IsoDateTimeSchema.nullable(),
  evaluatedAt: IsoDateTimeSchema.nullable(),
  reasonCodes: ReasonCodesSchema,
}).superRefine((calibration, context) => {
  for (const [path, values] of [
    ["coveredRegimes", calibration.coveredRegimes],
    ["evidenceIds", calibration.evidenceIds],
    ["reasonCodes", calibration.reasonCodes],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: `${path} must be unique`,
        path: [path],
      });
    }
  }

  const calibrated = calibration.status === "CALIBRATED";
  const immutableFields = [
    calibration.calibrationVersion,
    calibration.cohortId,
    calibration.untouchedHoldoutId,
    calibration.cohortDigest,
    calibration.untouchedHoldoutDigest,
    calibration.thresholdSetDigest,
    calibration.metricDefinitionDigest,
    calibration.sourceCutoff,
    calibration.evaluatedAt,
  ];

  if (calibrated) {
    if (immutableFields.some((value) => value === null)) {
      context.addIssue({
        code: "custom",
        message:
          "calibrated dimension requires immutable cohort, holdout, threshold and metric identity",
      });
    }
    if (
      calibration.sourceCutoff !== null &&
      calibration.evaluatedAt !== null &&
      Date.parse(calibration.sourceCutoff) > Date.parse(calibration.evaluatedAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "calibration cannot be evaluated before its source cutoff",
        path: ["evaluatedAt"],
      });
    }
    if (
      calibration.sampleSize < M3_MULTI_ASSET_CALIBRATION_MINIMUM_SAMPLE_SIZE
    ) {
      context.addIssue({
        code: "custom",
        message: "calibrated dimension is below the minimum sample size",
        path: ["sampleSize"],
      });
    }
    if (
      calibration.coveredRegimes.length <
        M3_MULTI_ASSET_CALIBRATION_MINIMUM_REGIMES ||
      calibration.regime === "UNKNOWN" ||
      !calibration.coveredRegimes.includes(calibration.regime)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "calibration requires broad regime coverage including the active regime",
        path: ["coveredRegimes"],
      });
    }
    if (
      !calibration.untouchedHoldout ||
      calibration.holdoutAccessCount !== 1 ||
      !calibration.thresholdsFrozenBeforeHoldout ||
      calibration.futureLeakageDetected ||
      calibration.evidenceIds.length < 2
    ) {
      context.addIssue({
        code: "custom",
        message: "calibrated dimension failed holdout or leakage controls",
      });
    }
    return;
  }

  if (
    immutableFields.some((value) => value !== null) ||
    calibration.sampleSize !== 0 ||
    calibration.coveredRegimes.length !== 0 ||
    calibration.untouchedHoldout ||
    calibration.holdoutAccessCount !== 0 ||
    calibration.thresholdsFrozenBeforeHoldout ||
    calibration.evidenceIds.length !== 0
  ) {
    context.addIssue({
      code: "custom",
      message: "uncalibrated dimension cannot carry calibration claims",
    });
  }
  if (calibration.reasonCodes.length === 0) {
    context.addIssue({
      code: "custom",
      message: "uncalibrated dimension must explain why it is unavailable",
      path: ["reasonCodes"],
    });
  }
});

export const M3MultiAssetCalibrationReferenceSchema =
  M3MultiAssetCalibrationBodySchema.extend({
    calibrationHash: M3MultiAssetDigestSchema,
  });

export type M3MultiAssetCalibrationReference = z.infer<
  typeof M3MultiAssetCalibrationReferenceSchema
>;

export function sealM3MultiAssetCalibrationReference(
  body: z.input<typeof M3MultiAssetCalibrationBodySchema>,
): M3MultiAssetCalibrationReference {
  const parsed = M3MultiAssetCalibrationBodySchema.parse(body);
  return deepFreezeArtifact({
    ...parsed,
    calibrationHash: stableContentHash(parsed),
  });
}

export function verifyM3MultiAssetCalibrationHash(
  calibration: M3MultiAssetCalibrationReference,
): boolean {
  const parsed = M3MultiAssetCalibrationReferenceSchema.safeParse(calibration);
  if (!parsed.success) return false;
  const { calibrationHash, ...body } = parsed.data;
  return stableContentHash(body) === calibrationHash;
}

export const M3MultiAssetQualificationInputSchema = z.strictObject({
  schemaVersion: z.literal(M3_MULTI_ASSET_QUALIFICATION_INPUT_VERSION),
  policyVersion: z.literal(M3_MULTI_ASSET_QUALIFICATION_POLICY_VERSION),
  authority: z.literal(M3_MULTI_ASSET_DECISION_AUTHORITY),
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  analysis: M3MultiAssetAnalysisSnapshotSchema,
  evidenceCalibration: M3MultiAssetCalibrationReferenceSchema,
  setupCalibration: M3MultiAssetCalibrationReferenceSchema,
});

const CalibrationDispositionSchema = z.enum([
  "CALIBRATED",
  "INSUFFICIENT",
  "UNAVAILABLE",
  "MISMATCH",
]);

const M3MultiAssetQualificationBodySchema = z.strictObject({
  schemaVersion: z.literal(M3_MULTI_ASSET_QUALIFICATION_VERSION),
  authority: z.literal(M3_MULTI_ASSET_DECISION_AUTHORITY),
  policyVersion: z.literal(M3_MULTI_ASSET_QUALIFICATION_POLICY_VERSION),
  qualificationId: NonEmptyStringSchema,
  binding: M3MultiAssetScopeBindingSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  analysisId: NonEmptyStringSchema,
  analysisHash: M3MultiAssetDigestSchema,
  opportunity: M3MultiAssetOpportunitySchema,
  regime: z.enum(M3_MULTI_ASSET_REGIMES),
  direction: z.enum(["LONG", "SHORT", "UNKNOWN"]),
  evidenceCalibrationHash: M3MultiAssetDigestSchema,
  setupCalibrationHash: M3MultiAssetDigestSchema,
  evidenceCalibrationVersion: NonEmptyStringSchema.nullable(),
  setupCalibrationVersion: NonEmptyStringSchema.nullable(),
  evidenceCohortId: NonEmptyStringSchema.nullable(),
  setupCohortId: NonEmptyStringSchema.nullable(),
  evidenceUntouchedHoldoutId: NonEmptyStringSchema.nullable(),
  setupUntouchedHoldoutId: NonEmptyStringSchema.nullable(),
  evidenceDisposition: z.enum(["QUALIFIED", "INSUFFICIENT"]),
  setupDisposition: z.enum(["QUALIFIED", "ABSTAINED"]),
  evidenceCalibrationDisposition: CalibrationDispositionSchema,
  setupCalibrationDisposition: CalibrationDispositionSchema,
  evidenceBlockers: z.array(NonEmptyStringSchema),
  setupBlockers: z.array(NonEmptyStringSchema),
  integrityBlockers: z.array(NonEmptyStringSchema),
  blockers: z.array(NonEmptyStringSchema),
  evidenceGrade: z.null(),
  setupGrade: z.null(),
  estimatedProbability: z.null(),
  confidenceInterval: z.null(),
  promotionEligible: z.literal(false),
  strategyAuthority: z.literal(false),
  readyAuthority: z.literal(false),
}).superRefine((qualification, context) => {
  for (const [path, values] of [
    ["evidenceBlockers", qualification.evidenceBlockers],
    ["setupBlockers", qualification.setupBlockers],
    ["integrityBlockers", qualification.integrityBlockers],
    ["blockers", qualification.blockers],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: `${path} must be unique`,
        path: [path],
      });
    }
  }
  const expectedBlockers = uniqueSorted([
    ...qualification.evidenceBlockers,
    ...qualification.setupBlockers,
    ...qualification.integrityBlockers,
  ]);
  if (
    expectedBlockers.length !== qualification.blockers.length ||
    expectedBlockers.some(
      (value, index) => value !== qualification.blockers[index],
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "qualification blockers must be the exact normalized union",
      path: ["blockers"],
    });
  }
  if (
    (qualification.evidenceBlockers.length === 0) !==
      (qualification.evidenceDisposition === "QUALIFIED") ||
    (qualification.setupBlockers.length === 0) !==
      (qualification.setupDisposition === "QUALIFIED")
  ) {
    context.addIssue({
      code: "custom",
      message: "independent dispositions must match their blocker dimensions",
    });
  }
});

export const M3MultiAssetQualificationSchema =
  M3MultiAssetQualificationBodySchema.extend({
    qualificationHash: M3MultiAssetDigestSchema,
  });

export type M3MultiAssetQualification = z.infer<
  typeof M3MultiAssetQualificationSchema
>;

export type M3MultiAssetQualificationIssue = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type M3MultiAssetQualificationResult = Readonly<{
  schemaVersion: typeof M3_MULTI_ASSET_QUALIFICATION_RESULT_VERSION;
  status:
    | "QUALIFIED_RESEARCH_ONLY"
    | "ABSTAINED_RESEARCH_ONLY"
    | "BLOCKED_INVALID_INPUT";
  authority: typeof M3_MULTI_ASSET_DECISION_AUTHORITY;
  qualification: M3MultiAssetQualification | null;
  reasonCodes: readonly string[];
  issues: readonly M3MultiAssetQualificationIssue[];
  resultHash: string;
}>;

function result(
  body: Omit<M3MultiAssetQualificationResult, "resultHash">,
): M3MultiAssetQualificationResult {
  return deepFreezeArtifact({
    ...body,
    resultHash: stableContentHash(body),
  });
}

function invalidInputResult(
  issues: readonly M3MultiAssetQualificationIssue[],
): M3MultiAssetQualificationResult {
  const normalized = [...issues].sort((left, right) =>
    `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`)
  );
  return result({
    schemaVersion: M3_MULTI_ASSET_QUALIFICATION_RESULT_VERSION,
    status: "BLOCKED_INVALID_INPUT",
    authority: M3_MULTI_ASSET_DECISION_AUTHORITY,
    qualification: null,
    reasonCodes: ["m3_multi_asset_qualification_input_schema_rejected"],
    issues: normalized,
  });
}

function qualification(
  body: z.infer<typeof M3MultiAssetQualificationBodySchema>,
): M3MultiAssetQualification {
  return deepFreezeArtifact({
    ...body,
    qualificationHash: stableContentHash(body),
  });
}

function qualificationId(input: Readonly<{
  analysisHash: string;
  evidenceCalibrationHash: string;
  setupCalibrationHash: string;
  sourceCutoff: string;
}>): string {
  return `m3-multi-asset-qualification:${stableSha256({
    ...input,
    policyVersion: M3_MULTI_ASSET_QUALIFICATION_POLICY_VERSION,
  }).slice(0, 24)}`;
}

export function verifyM3MultiAssetQualificationHash(
  value: M3MultiAssetQualification,
): boolean {
  const parsed = M3MultiAssetQualificationSchema.safeParse(value);
  if (!parsed.success) return false;
  const { qualificationHash, ...body } = parsed.data;
  return stableContentHash(body) === qualificationHash &&
    body.qualificationId === qualificationId({
      analysisHash: body.analysisHash,
      evidenceCalibrationHash: body.evidenceCalibrationHash,
      setupCalibrationHash: body.setupCalibrationHash,
      sourceCutoff: body.sourceCutoff,
    });
}

function calibrationSegmentMatches(
  calibration: M3MultiAssetCalibrationReference,
  analysis: z.infer<typeof M3MultiAssetAnalysisSnapshotSchema>,
): boolean {
  return sameM3MultiAssetSegment(
    calibration.segment,
    segmentBindingFromScope(analysis.binding),
  ) &&
    calibration.opportunityFamily ===
      analysis.opportunity.opportunityFamily &&
    calibration.direction === analysis.directionBias &&
    calibration.regime === analysis.regime;
}

function calibrationDisposition(
  calibration: M3MultiAssetCalibrationReference,
  matches: boolean,
): z.infer<typeof CalibrationDispositionSchema> {
  return matches ? calibration.status : "MISMATCH";
}

export function qualifyM3MultiAssetAnalysis(
  input: unknown,
): M3MultiAssetQualificationResult {
  const parsed = M3MultiAssetQualificationInputSchema.safeParse(input);
  if (!parsed.success) {
    return invalidInputResult(parsed.error.issues.map((schemaIssue) => ({
      code: "m3_multi_asset_qualification_input_schema_rejected",
      path: schemaIssue.path.length === 0
        ? "$"
        : schemaIssue.path.join("."),
      message: schemaIssue.message,
    })));
  }

  const value = parsed.data;
  const { analysis, evidenceCalibration, setupCalibration } = value;
  const evidenceBlockers = [...analysis.evidenceBlockers];
  const setupBlockers = [...analysis.setupBlockers];
  const integrityBlockers = [...analysis.integrityBlockers];
  const issues: M3MultiAssetQualificationIssue[] = [];

  if (!verifyM3MultiAssetAnalysisHash(analysis)) {
    issues.push({
      code: "multi_asset_analysis_hash_mismatch",
      path: "analysis.analysisHash",
      message: "qualification requires the exact immutable analysis artifact",
    });
  }
  for (const [path, expectedDimension, calibration] of [
    ["evidenceCalibration", "EVIDENCE", evidenceCalibration],
    ["setupCalibration", "SETUP", setupCalibration],
  ] as const) {
    if (!verifyM3MultiAssetCalibrationHash(calibration)) {
      issues.push({
        code: "multi_asset_calibration_hash_mismatch",
        path: `${path}.calibrationHash`,
        message: "qualification requires exact immutable calibration artifacts",
      });
    }
    if (calibration.dimension !== expectedDimension) {
      issues.push({
        code: "multi_asset_calibration_dimension_mismatch",
        path: `${path}.dimension`,
        message: "evidence and setup calibrations cannot substitute each other",
      });
    }
    if (
      calibration.sourceCutoff !== null &&
      calibration.evaluatedAt !== null &&
      (
        Date.parse(calibration.sourceCutoff) > Date.parse(value.sourceCutoff) ||
        Date.parse(calibration.evaluatedAt) > Date.parse(value.generatedAt)
      )
    ) {
      issues.push({
        code: "qualification_consumes_future_calibration",
        path,
        message: "qualification cannot consume a future calibration artifact",
      });
    }
  }
  if (Date.parse(value.sourceCutoff) > Date.parse(value.generatedAt)) {
    issues.push({
      code: "qualification_generated_before_cutoff",
      path: "generatedAt",
      message: "qualification cannot be generated before its source cutoff",
    });
  }
  if (
    Date.parse(analysis.sourceCutoff) > Date.parse(value.sourceCutoff) ||
    Date.parse(analysis.generatedAt) > Date.parse(value.generatedAt)
  ) {
    issues.push({
      code: "qualification_consumes_future_analysis",
      path: "analysis",
      message: "qualification cannot consume a future analysis",
    });
  }

  const evidenceMatches = calibrationSegmentMatches(
    evidenceCalibration,
    analysis,
  );
  const setupMatches = calibrationSegmentMatches(setupCalibration, analysis);
  if (!evidenceMatches) {
    evidenceBlockers.push("evidence_calibration_segment_mismatch");
  }
  if (!setupMatches) {
    setupBlockers.push("setup_calibration_segment_mismatch");
  }
  if (analysis.directionBias !== "LONG" &&
    analysis.directionBias !== "SHORT") {
    setupBlockers.push("analysis_direction_not_qualified");
  }
  if (evidenceCalibration.status !== "CALIBRATED") {
    evidenceBlockers.push(
      `evidence_calibration_${evidenceCalibration.status.toLowerCase()}`,
    );
  }
  if (setupCalibration.status !== "CALIBRATED") {
    setupBlockers.push(
      `setup_calibration_${setupCalibration.status.toLowerCase()}`,
    );
  }
  if (issues.length > 0) {
    integrityBlockers.push("multi_asset_qualification_integrity_failed");
  }

  const normalizedEvidenceBlockers = uniqueSorted(evidenceBlockers);
  const normalizedSetupBlockers = uniqueSorted(setupBlockers);
  const normalizedIntegrityBlockers = uniqueSorted(integrityBlockers);
  if (normalizedIntegrityBlockers.length > 0) {
    normalizedEvidenceBlockers.push(
      "qualification_integrity_blocks_evidence",
    );
    normalizedSetupBlockers.push("qualification_integrity_blocks_setup");
  }
  const finalEvidenceBlockers = uniqueSorted(normalizedEvidenceBlockers);
  const finalSetupBlockers = uniqueSorted(normalizedSetupBlockers);
  const normalizedBlockers = uniqueSorted([
    ...finalEvidenceBlockers,
    ...finalSetupBlockers,
    ...normalizedIntegrityBlockers,
  ]);
  const evidenceQualified = finalEvidenceBlockers.length === 0;
  const setupQualified = finalSetupBlockers.length === 0;
  const qualified = evidenceQualified && setupQualified;

  const artifact = qualification({
    schemaVersion: M3_MULTI_ASSET_QUALIFICATION_VERSION,
    authority: M3_MULTI_ASSET_DECISION_AUTHORITY,
    policyVersion: M3_MULTI_ASSET_QUALIFICATION_POLICY_VERSION,
    qualificationId: qualificationId({
      analysisHash: analysis.analysisHash,
      evidenceCalibrationHash: evidenceCalibration.calibrationHash,
      setupCalibrationHash: setupCalibration.calibrationHash,
      sourceCutoff: value.sourceCutoff,
    }),
    binding: analysis.binding,
    generatedAt: value.generatedAt,
    sourceCutoff: value.sourceCutoff,
    analysisId: analysis.analysisId,
    analysisHash: analysis.analysisHash,
    opportunity: analysis.opportunity,
    regime: analysis.regime,
    direction: analysis.directionBias === "LONG" ||
        analysis.directionBias === "SHORT"
      ? analysis.directionBias
      : "UNKNOWN",
    evidenceCalibrationHash: evidenceCalibration.calibrationHash,
    setupCalibrationHash: setupCalibration.calibrationHash,
    evidenceCalibrationVersion: evidenceCalibration.calibrationVersion,
    setupCalibrationVersion: setupCalibration.calibrationVersion,
    evidenceCohortId: evidenceCalibration.cohortId,
    setupCohortId: setupCalibration.cohortId,
    evidenceUntouchedHoldoutId: evidenceCalibration.untouchedHoldoutId,
    setupUntouchedHoldoutId: setupCalibration.untouchedHoldoutId,
    evidenceDisposition: evidenceQualified ? "QUALIFIED" : "INSUFFICIENT",
    setupDisposition: setupQualified ? "QUALIFIED" : "ABSTAINED",
    evidenceCalibrationDisposition: calibrationDisposition(
      evidenceCalibration,
      evidenceMatches,
    ),
    setupCalibrationDisposition: calibrationDisposition(
      setupCalibration,
      setupMatches,
    ),
    evidenceBlockers: finalEvidenceBlockers,
    setupBlockers: finalSetupBlockers,
    integrityBlockers: normalizedIntegrityBlockers,
    blockers: normalizedBlockers,
    evidenceGrade: null,
    setupGrade: null,
    estimatedProbability: null,
    confidenceInterval: null,
    promotionEligible: false,
    strategyAuthority: false,
    readyAuthority: false,
  });

  return result({
    schemaVersion: M3_MULTI_ASSET_QUALIFICATION_RESULT_VERSION,
    status: qualified
      ? "QUALIFIED_RESEARCH_ONLY"
      : "ABSTAINED_RESEARCH_ONLY",
    authority: M3_MULTI_ASSET_DECISION_AUTHORITY,
    qualification: artifact,
    reasonCodes: qualified
      ? ["multi_asset_independent_qualification_research_only_complete"]
      : normalizedBlockers,
    issues: [...issues].sort((left, right) =>
      `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`)
    ),
  });
}
