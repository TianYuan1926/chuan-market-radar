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

export const M2_HISTORICAL_RIGHTS_REVIEW_VERSION =
  "v2-m2-historical-rights-review.v1" as const;
export const M2_HISTORICAL_RIGHTS_ASSESSMENT_VERSION =
  "v2-m2-historical-rights-assessment.v1" as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const HttpsUrlSchema = z.string().url().superRefine((value, context) => {
  if (new URL(value).protocol !== "https:") {
    context.addIssue({
      code: "custom",
      message: "rights evidence must use HTTPS",
    });
  }
});

export const M2HistoricalRightsEvidenceSchema = z.strictObject({
  evidenceId: NonEmptyStringSchema,
  evidenceType: z.enum([
    "OFFICIAL_LICENSE",
    "OFFICIAL_TERMS",
    "OFFICIAL_DATA_AGREEMENT",
  ]),
  sourceOperator: NonEmptyStringSchema,
  url: HttpsUrlSchema,
  capturedAt: IsoDateTimeSchema,
  termsEffectiveAt: IsoDateTimeSchema.nullable(),
  contentDigest: DigestSchema.nullable(),
  contentBytes: z.number().int().positive().nullable(),
  captureStatus: z.enum([
    "HASHED_CONTENT_CAPTURED",
    "REFERENCE_ONLY_UNHASHED",
  ]),
  retentionClass: z.enum([
    "EXTERNAL_CONTENT_ADDRESSED_EVIDENCE_STORE",
    "REFERENCE_ONLY",
  ]),
  appliesToDataClasses: z.array(z.enum([
    "HISTORICAL_MARKET_DATA",
    "CURRENT_MARKET_DATA",
    "INSTRUMENT_REFERENCE_DATA",
  ])).min(1),
}).superRefine((evidence, context) => {
  if (
    (evidence.captureStatus === "HASHED_CONTENT_CAPTURED") !==
      (evidence.contentDigest !== null &&
        evidence.contentBytes !== null &&
        evidence.retentionClass ===
          "EXTERNAL_CONTENT_ADDRESSED_EVIDENCE_STORE")
  ) {
    context.addIssue({
      code: "custom",
      message: "rights evidence capture status and digest disagree",
      path: ["contentDigest"],
    });
  }
  if (
    evidence.captureStatus === "REFERENCE_ONLY_UNHASHED" &&
    (evidence.contentBytes !== null ||
      evidence.retentionClass !== "REFERENCE_ONLY")
  ) {
    context.addIssue({
      code: "custom",
      message: "unhashed rights reference cannot claim retained content",
      path: ["retentionClass"],
    });
  }
  if (
    new Set(evidence.appliesToDataClasses).size !==
      evidence.appliesToDataClasses.length
  ) {
    context.addIssue({
      code: "custom",
      message: "rights evidence data classes must be unique",
      path: ["appliesToDataClasses"],
    });
  }
});

const ReviewCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_HISTORICAL_RIGHTS_REVIEW_VERSION),
  sourceRegistryId: NonEmptyStringSchema,
  sourceOperator: NonEmptyStringSchema,
  intendedUse: z.literal("PRIVATE_NON_COMMERCIAL_MARKET_RESEARCH"),
  deploymentAudience: z.literal("SINGLE_ACCOUNT_OWNER_PRIVATE_ACCESS"),
  decision: z.enum(["APPROVED", "REJECTED", "PENDING_HUMAN_REVIEW"]),
  decisionOrigin: z.enum([
    "EXTERNAL_HUMAN_REVIEW_RECORD",
    "PENDING_HUMAN_REVIEW",
  ]),
  evidenceEnvironment: z.enum([
    "EXTERNAL_REVIEW_EVIDENCE",
    "SYNTHETIC_CONTRACT_FIXTURE",
  ]),
  retentionRight: z.enum(["GRANTED", "DENIED", "UNKNOWN"]),
  replayRight: z.enum(["GRANTED", "DENIED", "UNKNOWN"]),
  redistributionRight: z.enum([
    "NOT_REQUIRED_PRIVATE_RESEARCH",
    "GRANTED",
    "DENIED",
    "UNKNOWN",
  ]),
  reviewerType: z.enum([
    "ACCOUNT_OWNER",
    "QUALIFIED_LEGAL_COUNSEL",
    "UNASSIGNED",
  ]),
  reviewerIdentity: NonEmptyStringSchema.nullable(),
  reviewedAt: IsoDateTimeSchema.nullable(),
  reviewValidUntil: IsoDateTimeSchema.nullable(),
  jurisdictionScope: NonEmptyStringSchema.nullable(),
  accountScope: NonEmptyStringSchema.nullable(),
  reviewerAttestationDigest: DigestSchema.nullable(),
  evidence: z.array(M2HistoricalRightsEvidenceSchema).min(1),
  rawTermsStoredInRepository: z.literal(false),
  rawMarketDataRedistributionAllowed: z.literal(false),
  revocationDisposition: z.literal(
    "DELETE_RETAINED_RAW_DATA_AND_REVOKE_DERIVED_ACCESS",
  ),
  limitations: ReasonCodesSchema,
}).superRefine((review, context) => {
  const evidenceIds = review.evidence.map((item) => item.evidenceId);
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    context.addIssue({
      code: "custom",
      message: "rights evidence ids must be unique",
      path: ["evidence"],
    });
  }
  if (new Set(review.limitations).size !== review.limitations.length) {
    context.addIssue({
      code: "custom",
      message: "rights review limitations must be unique",
      path: ["limitations"],
    });
  }
  if (review.evidence.some(
    (item) => item.sourceOperator !== review.sourceOperator,
  )) {
    context.addIssue({
      code: "custom",
      message: "rights evidence must bind the exact reviewed source operator",
      path: ["evidence"],
    });
  }

  const completed = review.decision !== "PENDING_HUMAN_REVIEW";
  if (completed) {
    if (
      review.decisionOrigin !== "EXTERNAL_HUMAN_REVIEW_RECORD" ||
      review.evidenceEnvironment !== "EXTERNAL_REVIEW_EVIDENCE" ||
      review.reviewerType === "UNASSIGNED" ||
      review.reviewerIdentity === null ||
      review.reviewedAt === null ||
      review.jurisdictionScope === null ||
      review.accountScope === null ||
      review.reviewerAttestationDigest === null
    ) {
      context.addIssue({
        code: "custom",
        message: "completed source rights require external human evidence",
        path: ["decision"],
      });
    }
    if (review.evidence.some(
      (item) => item.captureStatus !== "HASHED_CONTENT_CAPTURED",
    )) {
      context.addIssue({
        code: "custom",
        message: "completed source rights require hashed official evidence",
        path: ["evidence"],
      });
    }
  }

  if (review.decision === "APPROVED") {
    if (
      review.retentionRight !== "GRANTED" ||
      review.replayRight !== "GRANTED" ||
      review.reviewValidUntil === null
    ) {
      context.addIssue({
        code: "custom",
        message: "approved source rights require grants and bounded validity",
        path: ["decision"],
      });
    }
    const approvedDataClasses = new Set(
      review.evidence.flatMap((item) => item.appliesToDataClasses),
    );
    if (
      !approvedDataClasses.has("HISTORICAL_MARKET_DATA") ||
      !approvedDataClasses.has("INSTRUMENT_REFERENCE_DATA")
    ) {
      context.addIssue({
        code: "custom",
        message: "approved source rights require historical market and instrument reference scope",
        path: ["evidence"],
      });
    }
  }

  if (review.decision === "PENDING_HUMAN_REVIEW") {
    if (
      review.decisionOrigin !== "PENDING_HUMAN_REVIEW" ||
      review.retentionRight !== "UNKNOWN" ||
      review.replayRight !== "UNKNOWN" ||
      review.reviewerType !== "UNASSIGNED" ||
      review.reviewerIdentity !== null ||
      review.reviewedAt !== null ||
      review.reviewValidUntil !== null ||
      review.jurisdictionScope !== null ||
      review.accountScope !== null ||
      review.reviewerAttestationDigest !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "pending source rights cannot imply a completed review",
        path: ["decision"],
      });
    }
  }

  if (
    review.decision === "REJECTED" &&
    review.retentionRight !== "DENIED" &&
    review.replayRight !== "DENIED"
  ) {
    context.addIssue({
      code: "custom",
      message: "rejected source rights must identify a denied required right",
      path: ["decision"],
    });
  }

  if (review.reviewedAt !== null) {
    const reviewedAt = Date.parse(review.reviewedAt);
    for (const [index, evidence] of review.evidence.entries()) {
      if (Date.parse(evidence.capturedAt) > reviewedAt) {
        context.addIssue({
          code: "custom",
          message: "a rights review cannot cite evidence captured later",
          path: ["evidence", index, "capturedAt"],
        });
      }
      if (
        evidence.termsEffectiveAt !== null &&
        Date.parse(evidence.termsEffectiveAt) > reviewedAt
      ) {
        context.addIssue({
          code: "custom",
          message: "a rights review cannot rely on future-effective terms",
          path: ["evidence", index, "termsEffectiveAt"],
        });
      }
    }
    if (review.reviewValidUntil !== null) {
      const validUntil = Date.parse(review.reviewValidUntil);
      const maximumValidityMs = 366 * 24 * 60 * 60 * 1_000;
      if (
        validUntil <= reviewedAt ||
        validUntil - reviewedAt > maximumValidityMs
      ) {
        context.addIssue({
          code: "custom",
          message: "source rights review validity must be positive and at most 366 days",
          path: ["reviewValidUntil"],
        });
      }
    }
  }
});

export const M2HistoricalRightsReviewArtifactSchema =
  ReviewCoreSchema.extend({
    reviewArtifactId: NonEmptyStringSchema,
    reviewDigest: DigestSchema,
  }).superRefine((review, context) => {
    const { reviewArtifactId, reviewDigest, ...core } = review;
    const expectedDigest = stableContentHash(core);
    if (reviewDigest !== expectedDigest) {
      context.addIssue({
        code: "custom",
        message: "rights review digest mismatch",
        path: ["reviewDigest"],
      });
    }
    if (
      reviewArtifactId !==
        `historical-rights-review:${expectedDigest.slice("sha256:".length)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "rights review identity mismatch",
        path: ["reviewArtifactId"],
      });
    }
  });

export type M2HistoricalRightsReviewArtifact = z.infer<
  typeof M2HistoricalRightsReviewArtifactSchema
>;

export function buildM2HistoricalRightsReviewArtifact(
  rawCore: z.input<typeof ReviewCoreSchema>,
): M2HistoricalRightsReviewArtifact {
  const core = ReviewCoreSchema.parse(rawCore);
  const reviewDigest = stableContentHash(core);
  return deepFreezeArtifact(M2HistoricalRightsReviewArtifactSchema.parse({
    ...core,
    reviewArtifactId:
      `historical-rights-review:${reviewDigest.slice("sha256:".length)}`,
    reviewDigest,
  }));
}

const RightsAssessmentCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_HISTORICAL_RIGHTS_ASSESSMENT_VERSION),
  reviewArtifactId: NonEmptyStringSchema,
  reviewDigest: DigestSchema,
  evaluatedAt: IsoDateTimeSchema,
  status: z.enum(["READY", "BLOCKED", "REJECTED"]),
  bulkRetentionAllowed: z.boolean(),
  replayAllowed: z.boolean(),
  blockerReasonCodes: ReasonCodesSchema,
});

export const M2HistoricalRightsAssessmentSchema =
  RightsAssessmentCoreSchema.extend({
    assessmentDigest: DigestSchema,
  }).superRefine((assessment, context) => {
    if (
      assessment.status === "READY" &&
      (!assessment.bulkRetentionAllowed ||
        !assessment.replayAllowed ||
        assessment.blockerReasonCodes.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "ready rights assessment cannot retain blockers",
        path: ["status"],
      });
    }
    if (
      assessment.status !== "READY" &&
      (assessment.bulkRetentionAllowed || assessment.replayAllowed)
    ) {
      context.addIssue({
        code: "custom",
        message: "non-ready rights assessment cannot grant retention or replay",
        path: ["status"],
      });
    }
    const { assessmentDigest, ...core } = assessment;
    if (assessmentDigest !== stableContentHash(core)) {
      context.addIssue({
        code: "custom",
        message: "rights assessment digest mismatch",
        path: ["assessmentDigest"],
      });
    }
  });

export type M2HistoricalRightsAssessment = z.infer<
  typeof M2HistoricalRightsAssessmentSchema
>;

export function assessM2HistoricalRightsReview(
  rawReview: M2HistoricalRightsReviewArtifact,
  evaluatedAt: string,
): M2HistoricalRightsAssessment {
  const review = M2HistoricalRightsReviewArtifactSchema.parse(rawReview);
  const evaluationTime = IsoDateTimeSchema.parse(evaluatedAt);
  const blockers = new Set<string>();

  if (Date.parse(evaluationTime) < Date.parse(
    review.evidence.reduce(
      (latest, item) => Date.parse(item.capturedAt) > Date.parse(latest)
        ? item.capturedAt
        : latest,
      review.evidence[0]!.capturedAt,
    ),
  )) {
    blockers.add("rights_assessment_predates_evidence_capture");
  }
  if (review.decision === "PENDING_HUMAN_REVIEW") {
    blockers.add("source_rights_human_review_pending");
  }
  if (review.decision === "REJECTED") {
    blockers.add("source_rights_rejected");
  }
  if (review.retentionRight !== "GRANTED") {
    blockers.add("source_retention_right_not_granted");
  }
  if (review.replayRight !== "GRANTED") {
    blockers.add("source_replay_right_not_granted");
  }
  if (
    review.evidenceEnvironment !== "EXTERNAL_REVIEW_EVIDENCE" ||
    review.decisionOrigin !== "EXTERNAL_HUMAN_REVIEW_RECORD"
  ) {
    blockers.add("external_human_rights_evidence_missing");
  }
  if (review.evidence.some(
    (item) => item.captureStatus !== "HASHED_CONTENT_CAPTURED",
  )) {
    blockers.add("source_rights_evidence_not_immutably_captured");
  }
  if (
    review.decision === "APPROVED" &&
    (review.reviewValidUntil === null ||
      Date.parse(evaluationTime) > Date.parse(review.reviewValidUntil))
  ) {
    blockers.add("source_rights_review_expired_or_unbounded");
  }

  const blockerReasonCodes = [...blockers].sort();
  const ready = blockerReasonCodes.length === 0;
  const core = RightsAssessmentCoreSchema.parse({
    schemaVersion: M2_HISTORICAL_RIGHTS_ASSESSMENT_VERSION,
    reviewArtifactId: review.reviewArtifactId,
    reviewDigest: review.reviewDigest,
    evaluatedAt: evaluationTime,
    status: review.decision === "REJECTED"
      ? "REJECTED"
      : ready
        ? "READY"
        : "BLOCKED",
    bulkRetentionAllowed: ready,
    replayAllowed: ready,
    blockerReasonCodes,
  });
  return deepFreezeArtifact(M2HistoricalRightsAssessmentSchema.parse({
    ...core,
    assessmentDigest: stableContentHash(core),
  }));
}
