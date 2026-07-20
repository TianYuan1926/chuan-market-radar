import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../modules/universe/stable-artifact";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  ReasonCodesSchema,
} from "../runtime-schema/primitives";
import {
  M2HistoricalSourceAssessmentSchema,
  M2HistoricalSourceQualificationSchema,
  type M2HistoricalSourceAssessment,
  type M2HistoricalSourceQualification,
} from "./historical-source-qualification";

export const M2_HISTORICAL_ACQUISITION_PLAN_VERSION =
  "v2-m2-historical-acquisition-plan.v1" as const;
export const M2_HISTORICAL_ACQUISITION_PREFLIGHT_VERSION =
  "v2-m2-historical-acquisition-preflight.v1" as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const SafeByteCountSchema = z.number().int().nonnegative().max(
  Number.MAX_SAFE_INTEGER,
);
const YearMonthSchema = z.string().regex(/^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/u);
const ProviderSymbolSchema = z.string().regex(/^[A-Z0-9_]{2,40}$/u);

const ArchiveObjectSchema = z.strictObject({
  objectId: NonEmptyStringSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  providerSymbol: ProviderSymbolSchema,
  datasetKind: z.enum([
    "KLINE_1M",
    "AGG_TRADES",
    "BOOK_TICKER",
    "L2_BOOK_DEPTH",
    "FUNDING_RATE",
    "INSTRUMENT_HISTORY",
  ]),
  period: YearMonthSchema,
  dataUrl: z.string().url(),
  checksumUrl: z.string().url(),
  expectedFileName: NonEmptyStringSchema,
  expectedSha256: DigestSchema.nullable(),
  measuredCompressedBytes: SafeByteCountSchema.nullable(),
  measurementObservedAt: IsoDateTimeSchema.nullable(),
}).superRefine((object, context) => {
  const dataUrl = new URL(object.dataUrl);
  const checksumUrl = new URL(object.checksumUrl);
  for (const [field, url] of [
    ["dataUrl", dataUrl],
    ["checksumUrl", checksumUrl],
  ] as const) {
    if (
      url.protocol !== "https:" || url.username !== "" ||
      url.password !== "" || url.port !== "" || url.search !== "" ||
      url.hash !== ""
    ) {
      context.addIssue({
        code: "custom",
        message: "archive object URLs must be plain credential-free HTTPS URLs",
        path: [field],
      });
    }
  }
  if (!dataUrl.pathname.endsWith(`/${object.expectedFileName}`)) {
    context.addIssue({
      code: "custom",
      message: "archive data URL and expected filename disagree",
      path: ["dataUrl"],
    });
  }
  if (checksumUrl.href !== `${dataUrl.href}.CHECKSUM`) {
    context.addIssue({
      code: "custom",
      message: "archive checksum URL must be the exact object checksum sidecar",
      path: ["checksumUrl"],
    });
  }
  const measurementComplete =
    object.expectedSha256 !== null &&
    object.measuredCompressedBytes !== null &&
    object.measuredCompressedBytes > 0 &&
    object.measurementObservedAt !== null;
  const measurementEmpty =
    object.expectedSha256 === null &&
    object.measuredCompressedBytes === null &&
    object.measurementObservedAt === null;
  if (!measurementComplete && !measurementEmpty) {
    context.addIssue({
      code: "custom",
      message: "archive object measurement must be wholly complete or wholly absent",
      path: ["expectedSha256"],
    });
  }
});

const AcquisitionBudgetSchema = z.strictObject({
  objectCountMaximum: z.number().int().positive(),
  compressedBytesMaximum: SafeByteCountSchema,
  extractedBytesMaximum: SafeByteCountSchema,
  temporaryBytesMaximum: SafeByteCountSchema,
  minimumFreeBytesAfterCompletion: SafeByteCountSchema,
  requiredFreeBytes: SafeByteCountSchema,
}).superRefine((budget, context) => {
  const expected = budget.compressedBytesMaximum +
    budget.extractedBytesMaximum +
    budget.temporaryBytesMaximum +
    budget.minimumFreeBytesAfterCompletion;
  if (
    !Number.isSafeInteger(expected) || budget.requiredFreeBytes !== expected
  ) {
    context.addIssue({
      code: "custom",
      message: "required free bytes must equal all bounded acquisition costs",
      path: ["requiredFreeBytes"],
    });
  }
});

const AcquisitionPlanCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_HISTORICAL_ACQUISITION_PLAN_VERSION),
  planName: NonEmptyStringSchema,
  generatedAt: IsoDateTimeSchema,
  sourceQualificationId: NonEmptyStringSchema,
  sourceQualificationDigest: DigestSchema,
  sourceAssessmentDigest: DigestSchema,
  mode: z.enum(["TECHNICAL_PILOT_ONLY", "BULK_ACQUISITION"]),
  providerId: NonEmptyStringSchema,
  archiveHostAllowlist: z.array(NonEmptyStringSchema).min(1),
  coverage: z.strictObject({
    startedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema,
  }),
  selectedDetectorIds: z.array(NonEmptyStringSchema).min(1),
  objects: z.array(ArchiveObjectSchema).min(1),
  budget: AcquisitionBudgetSchema,
  rawDataGitPolicy: z.literal("RAW_BYTES_OUTSIDE_WORKTREE_ONLY"),
  postVerificationDisposition: z.enum([
    "DELETE_RAW_AFTER_TECHNICAL_VERIFICATION",
    "RETAIN_APPROVED_RESEARCH_ARCHIVE",
  ]),
  redirectPolicy: z.literal("REJECT_REDIRECT_OUTSIDE_ALLOWLIST"),
  resumePolicy: z.literal("ATOMIC_PARTIAL_WITH_RANGE_VALIDATION"),
  checksumPolicy: z.literal("VERIFY_PROVIDER_SHA256_BEFORE_PROMOTION"),
});

export const M2HistoricalAcquisitionPlanSchema =
  AcquisitionPlanCoreSchema.extend({
    objectPlanDigest: DigestSchema,
    planDigest: DigestSchema,
    planId: NonEmptyStringSchema,
  }).superRefine((plan, context) => {
    if (
      plan.mode === "TECHNICAL_PILOT_ONLY" &&
      plan.postVerificationDisposition !==
        "DELETE_RAW_AFTER_TECHNICAL_VERIFICATION"
    ) {
      context.addIssue({
        code: "custom",
        message: "technical pilot raw bytes must be deleted after verification",
        path: ["postVerificationDisposition"],
      });
    }
    if (
      plan.mode === "BULK_ACQUISITION" &&
      plan.postVerificationDisposition !== "RETAIN_APPROVED_RESEARCH_ARCHIVE"
    ) {
      context.addIssue({
        code: "custom",
        message: "bulk acquisition requires an approved retention disposition",
        path: ["postVerificationDisposition"],
      });
    }
    if (Date.parse(plan.coverage.startedAt) >= Date.parse(plan.coverage.endedAt)) {
      context.addIssue({
        code: "custom",
        message: "historical acquisition coverage must have positive duration",
        path: ["coverage", "endedAt"],
      });
    }
    for (const [field, values] of [
      ["archiveHostAllowlist", plan.archiveHostAllowlist],
      ["selectedDetectorIds", plan.selectedDetectorIds],
      ["objects", plan.objects.map((object) => object.objectId)],
      ["dataUrl", plan.objects.map((object) => object.dataUrl)],
    ] as const) {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: "custom",
          message: `acquisition plan ${field} must be unique`,
          path: [field === "dataUrl" ? "objects" : field],
        });
      }
    }
    for (const host of plan.archiveHostAllowlist) {
      if (
        host.includes(":") || host.includes("/") || host.trim() !== host ||
        host !== host.toLowerCase()
      ) {
        context.addIssue({
          code: "custom",
          message: "plan allowlist entries must be lowercase hostnames",
          path: ["archiveHostAllowlist"],
        });
      }
    }
    if (plan.objects.length > plan.budget.objectCountMaximum) {
      context.addIssue({
        code: "custom",
        message: "acquisition object count exceeds its frozen budget",
        path: ["objects"],
      });
    }
    const allowedHosts = new Set(plan.archiveHostAllowlist);
    for (const [index, object] of plan.objects.entries()) {
      if (
        !allowedHosts.has(new URL(object.dataUrl).hostname) ||
        !allowedHosts.has(new URL(object.checksumUrl).hostname)
      ) {
        context.addIssue({
          code: "custom",
          message: "archive object host is outside the frozen allowlist",
          path: ["objects", index, "dataUrl"],
        });
      }
    }
    const expectedObjectPlanDigest = stableContentHash({
      objects: plan.objects,
    });
    if (plan.objectPlanDigest !== expectedObjectPlanDigest) {
      context.addIssue({
        code: "custom",
        message: "acquisition object plan digest mismatch",
        path: ["objectPlanDigest"],
      });
    }
    const { planDigest, planId, ...core } = plan;
    const expectedPlanDigest = stableContentHash(core);
    if (planDigest !== expectedPlanDigest) {
      context.addIssue({
        code: "custom",
        message: "acquisition plan digest mismatch",
        path: ["planDigest"],
      });
    }
    if (
      planId !==
        `historical-acquisition-plan:${expectedPlanDigest.slice("sha256:".length)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "acquisition plan identity mismatch",
        path: ["planId"],
      });
    }
  });

export type M2HistoricalAcquisitionPlan = z.infer<
  typeof M2HistoricalAcquisitionPlanSchema
>;

export function buildM2HistoricalAcquisitionPlan(
  rawCore: z.input<typeof AcquisitionPlanCoreSchema>,
): M2HistoricalAcquisitionPlan {
  const core = AcquisitionPlanCoreSchema.parse(rawCore);
  const objectPlanDigest = stableContentHash({ objects: core.objects });
  const planCore = { ...core, objectPlanDigest };
  const planDigest = stableContentHash(planCore);
  return deepFreezeArtifact(M2HistoricalAcquisitionPlanSchema.parse({
    ...planCore,
    planDigest,
    planId: `historical-acquisition-plan:${planDigest.slice("sha256:".length)}`,
  }));
}

const AcquisitionPreflightCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_HISTORICAL_ACQUISITION_PREFLIGHT_VERSION),
  planId: NonEmptyStringSchema,
  planDigest: DigestSchema,
  sourceAssessmentDigest: DigestSchema,
  evaluatedAt: IsoDateTimeSchema,
  decision: z.enum(["ALLOW", "BLOCK"]),
  outputRoot: NonEmptyStringSchema,
  worktreeRoot: NonEmptyStringSchema,
  availableBytes: SafeByteCountSchema,
  requiredFreeBytes: SafeByteCountSchema,
  projectedFreeBytesAfterCompletion: SafeByteCountSchema.nullable(),
  reasonCodes: ReasonCodesSchema,
});

export const M2HistoricalAcquisitionPreflightSchema =
  AcquisitionPreflightCoreSchema.extend({
    preflightDigest: DigestSchema,
  }).superRefine((preflight, context) => {
    if (
      preflight.decision === "ALLOW" && preflight.reasonCodes.length > 0
    ) {
      context.addIssue({
        code: "custom",
        message: "allowed acquisition preflight cannot retain blockers",
        path: ["decision"],
      });
    }
    if (
      preflight.decision === "BLOCK" && preflight.reasonCodes.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "blocked acquisition preflight requires reason codes",
        path: ["reasonCodes"],
      });
    }
    const { preflightDigest, ...core } = preflight;
    if (preflightDigest !== stableContentHash(core)) {
      context.addIssue({
        code: "custom",
        message: "acquisition preflight digest mismatch",
        path: ["preflightDigest"],
      });
    }
  });

export type M2HistoricalAcquisitionPreflight = z.infer<
  typeof M2HistoricalAcquisitionPreflightSchema
>;

function pathIsWithin(parent: string, candidate: string): boolean {
  const relativePath = relative(resolve(parent), resolve(candidate));
  return relativePath === "" || (
    !relativePath.startsWith("..") && !isAbsolute(relativePath)
  );
}

export function evaluateM2HistoricalAcquisitionPreflight(input: Readonly<{
  plan: M2HistoricalAcquisitionPlan;
  qualification: M2HistoricalSourceQualification;
  assessment: M2HistoricalSourceAssessment;
  evaluatedAt: string;
  outputRoot: string;
  worktreeRoot: string;
  availableBytes: number;
}>): M2HistoricalAcquisitionPreflight {
  const plan = M2HistoricalAcquisitionPlanSchema.parse(input.plan);
  const qualification = M2HistoricalSourceQualificationSchema.parse(
    input.qualification,
  );
  const assessment = M2HistoricalSourceAssessmentSchema.parse(
    input.assessment,
  );
  const reasons = new Set<string>();
  if (Date.parse(plan.generatedAt) < Date.parse(qualification.qualifiedAt)) {
    reasons.add("acquisition_plan_predates_source_qualification");
  }
  if (Date.parse(input.evaluatedAt) < Date.parse(plan.generatedAt)) {
    reasons.add("acquisition_preflight_predates_frozen_plan");
  }
  if (
    plan.sourceQualificationId !== qualification.qualificationId ||
    plan.sourceQualificationDigest !== qualification.qualificationDigest
  ) {
    reasons.add("plan_source_qualification_identity_mismatch");
  }
  if (
    plan.sourceAssessmentDigest !== assessment.assessmentDigest ||
    assessment.qualificationDigest !== qualification.qualificationDigest
  ) {
    reasons.add("plan_source_assessment_identity_mismatch");
  }
  const allowedHosts = new Set(qualification.technical.archiveHostAllowlist);
  if (plan.archiveHostAllowlist.some((host) => !allowedHosts.has(host))) {
    reasons.add("plan_archive_host_outside_source_allowlist");
  }
  const eligibleDetectors = new Set(assessment.eligibleDetectorIds);
  if (plan.selectedDetectorIds.some((id) => !eligibleDetectors.has(id))) {
    reasons.add("plan_selects_source_unsupported_detector");
  }
  if (pathIsWithin(input.worktreeRoot, input.outputRoot)) {
    reasons.add("raw_output_root_inside_git_worktree");
  }
  if (!isAbsolute(input.outputRoot) || !isAbsolute(input.worktreeRoot)) {
    reasons.add("acquisition_paths_must_be_absolute");
  }
  const measuredObjects = plan.objects.filter((object) =>
    object.expectedSha256 !== null &&
    object.measuredCompressedBytes !== null &&
    object.measurementObservedAt !== null);
  if (measuredObjects.length !== plan.objects.length) {
    reasons.add("archive_object_checksum_or_size_measurement_incomplete");
  }
  const measuredBytes = measuredObjects.reduce(
    (total, object) => total + (object.measuredCompressedBytes ?? 0),
    0,
  );
  if (!Number.isSafeInteger(measuredBytes)) {
    reasons.add("archive_object_byte_sum_exceeds_safe_integer");
  }
  if (measuredBytes > plan.budget.compressedBytesMaximum) {
    reasons.add("measured_compressed_bytes_exceed_budget");
  }
  if (input.availableBytes < plan.budget.requiredFreeBytes) {
    reasons.add("insufficient_free_disk_for_bounded_acquisition");
  }
  if (
    plan.mode === "BULK_ACQUISITION" && !assessment.bulkAcquisitionAllowed
  ) {
    reasons.add("source_not_approved_for_bulk_acquisition");
  }
  if (
    plan.mode === "TECHNICAL_PILOT_ONLY" && !assessment.metadataProbeAllowed
  ) {
    reasons.add("source_not_approved_for_technical_probe");
  }
  if (plan.mode === "TECHNICAL_PILOT_ONLY" && plan.objects.length !== 1) {
    reasons.add("technical_pilot_must_be_exactly_one_object");
  }
  const reasonCodes = [...reasons].sort();
  const projectedFreeBytesAfterCompletion =
    input.availableBytes >= plan.budget.requiredFreeBytes
      ? input.availableBytes -
        (plan.budget.compressedBytesMaximum +
          plan.budget.extractedBytesMaximum +
          plan.budget.temporaryBytesMaximum)
      : null;
  const core = AcquisitionPreflightCoreSchema.parse({
    schemaVersion: M2_HISTORICAL_ACQUISITION_PREFLIGHT_VERSION,
    planId: plan.planId,
    planDigest: plan.planDigest,
    sourceAssessmentDigest: assessment.assessmentDigest,
    evaluatedAt: IsoDateTimeSchema.parse(input.evaluatedAt),
    decision: reasonCodes.length === 0 ? "ALLOW" : "BLOCK",
    outputRoot: resolve(input.outputRoot),
    worktreeRoot: resolve(input.worktreeRoot),
    availableBytes: SafeByteCountSchema.parse(input.availableBytes),
    requiredFreeBytes: plan.budget.requiredFreeBytes,
    projectedFreeBytesAfterCompletion,
    reasonCodes,
  });
  return deepFreezeArtifact(M2HistoricalAcquisitionPreflightSchema.parse({
    ...core,
    preflightDigest: stableContentHash(core),
  }));
}
