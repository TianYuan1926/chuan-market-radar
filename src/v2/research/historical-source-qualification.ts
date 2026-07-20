import { z } from "zod";
import {
  M2_DRAFT_DETECTORS,
} from "../modules/detection/draft-replay-contract";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../modules/universe/stable-artifact";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  ReasonCodesSchema,
} from "../runtime-schema/primitives";

export const M2_HISTORICAL_SOURCE_QUALIFICATION_VERSION =
  "v2-m2-historical-source-qualification.v1" as const;
export const M2_HISTORICAL_SOURCE_ASSESSMENT_VERSION =
  "v2-m2-historical-source-assessment.v1" as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const HttpsUrlSchema = z.string().url().superRefine((value, context) => {
  if (new URL(value).protocol !== "https:") {
    context.addIssue({
      code: "custom",
      message: "historical source evidence must use HTTPS",
    });
  }
});

const EvidenceReferenceSchema = z.strictObject({
  evidenceId: NonEmptyStringSchema,
  evidenceType: z.enum([
    "OFFICIAL_LICENSE",
    "OFFICIAL_TERMS",
    "OFFICIAL_DOCUMENTATION",
    "TECHNICAL_PROBE",
  ]),
  url: HttpsUrlSchema,
  capturedAt: IsoDateTimeSchema,
  contentDigest: DigestSchema.nullable(),
  captureStatus: z.enum([
    "HASHED_CONTENT_CAPTURED",
    "REFERENCE_ONLY_UNHASHED",
  ]),
}).superRefine((evidence, context) => {
  if (
    (evidence.captureStatus === "HASHED_CONTENT_CAPTURED") !==
      (evidence.contentDigest !== null)
  ) {
    context.addIssue({
      code: "custom",
      message: "evidence capture status and content digest disagree",
      path: ["contentDigest"],
    });
  }
});

const RightsReviewSchema = z.strictObject({
  intendedUse: z.literal("PRIVATE_NON_COMMERCIAL_MARKET_RESEARCH"),
  decision: z.enum(["APPROVED", "REJECTED", "PENDING_HUMAN_REVIEW"]),
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
  evidenceIds: z.array(NonEmptyStringSchema).min(1),
  limitations: ReasonCodesSchema,
}).superRefine((review, context) => {
  const approved = review.decision === "APPROVED";
  if (approved && (
    review.retentionRight !== "GRANTED" ||
    review.replayRight !== "GRANTED" ||
    review.reviewerType === "UNASSIGNED" ||
    review.reviewerIdentity === null ||
    review.reviewedAt === null
  )) {
    context.addIssue({
      code: "custom",
      message: "approved source rights require granted rights and a human review",
      path: ["decision"],
    });
  }
  if (
    review.decision === "PENDING_HUMAN_REVIEW" &&
    (review.retentionRight !== "UNKNOWN" ||
      review.replayRight !== "UNKNOWN" ||
      review.reviewerType !== "UNASSIGNED" ||
      review.reviewerIdentity !== null ||
      review.reviewedAt !== null)
  ) {
    context.addIssue({
      code: "custom",
      message: "pending source rights cannot imply a completed review",
      path: ["decision"],
    });
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
  if (new Set(review.evidenceIds).size !== review.evidenceIds.length) {
    context.addIssue({
      code: "custom",
      message: "source rights evidence references must be unique",
      path: ["evidenceIds"],
    });
  }
});

const TechnicalQualificationSchema = z.strictObject({
  archiveHostAllowlist: z.array(NonEmptyStringSchema).min(1),
  authClass: z.literal("PUBLIC_NO_CREDENTIAL"),
  transport: z.literal("HTTPS_GET_HEAD_ONLY"),
  objectAddressing: z.literal("EXACT_IMMUTABLE_OBJECT_MANIFEST"),
  checksumAlgorithm: z.literal("SHA256"),
  providerChecksumRequired: z.literal(true),
  probeStatus: z.enum(["PASS", "FAIL", "NOT_RUN"]),
  lastProbeAt: IsoDateTimeSchema.nullable(),
  probeEvidenceIds: z.array(NonEmptyStringSchema),
  knownObjectCount: NonNegativeIntegerSchema,
  knownObjectBytes: NonNegativeIntegerSchema,
  reasonCodes: ReasonCodesSchema,
}).superRefine((technical, context) => {
  if (
    technical.probeStatus === "PASS" &&
    (technical.lastProbeAt === null ||
      technical.probeEvidenceIds.length === 0 ||
      technical.knownObjectCount === 0 ||
      technical.knownObjectBytes === 0)
  ) {
    context.addIssue({
      code: "custom",
      message: "passing technical qualification requires measured evidence",
      path: ["probeStatus"],
    });
  }
  if (
    technical.probeStatus === "NOT_RUN" &&
    (technical.lastProbeAt !== null || technical.probeEvidenceIds.length > 0)
  ) {
    context.addIssue({
      code: "custom",
      message: "an unrun technical probe cannot carry probe evidence",
      path: ["probeStatus"],
    });
  }
  for (const host of technical.archiveHostAllowlist) {
    if (
      host.includes(":") || host.includes("/") || host.trim() !== host ||
      host !== host.toLowerCase()
    ) {
      context.addIssue({
        code: "custom",
        message: "archive allowlist entries must be lowercase hostnames",
        path: ["archiveHostAllowlist"],
      });
    }
  }
  for (const [field, values] of [
    ["archiveHostAllowlist", technical.archiveHostAllowlist],
    ["probeEvidenceIds", technical.probeEvidenceIds],
    ["reasonCodes", technical.reasonCodes],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: `technical source ${field} must be unique`,
        path: [field],
      });
    }
  }
});

const InstrumentHistorySchema = z.strictObject({
  evidenceMode: z.enum([
    "POINT_IN_TIME_INSTRUMENT_SNAPSHOTS",
    "CURRENT_SNAPSHOT_ONLY",
    "ARCHIVE_PRESENCE_ONLY",
    "UNAVAILABLE",
  ]),
  onboardAtComplete: z.boolean(),
  delistAtComplete: z.boolean(),
  contractTypeComplete: z.boolean(),
  settlementAssetComplete: z.boolean(),
  underlyingClassComplete: z.boolean(),
  tradingStatusComplete: z.boolean(),
  evidenceDigest: DigestSchema.nullable(),
  reasonCodes: ReasonCodesSchema,
});

const SourceClockSchema = z.strictObject({
  eventTimeBasis: z.literal("CLOSED_CANDLE_CLOSE_TIME"),
  availabilityTimeMode: z.enum([
    "OBSERVED_PROVIDER_PUBLISH_TIME",
    "MODELED_CONSERVATIVE_LATENCY",
    "UNKNOWN",
  ]),
  conservativeLatencySeconds: NonNegativeIntegerSchema.nullable(),
  policyId: NonEmptyStringSchema,
  policyDigest: DigestSchema,
  archiveRetrievalTimeUsedAsMarketKnowledgeTime: z.literal(false),
  reasonCodes: ReasonCodesSchema,
}).superRefine((clock, context) => {
  if (
    clock.availabilityTimeMode === "MODELED_CONSERVATIVE_LATENCY" &&
    (clock.conservativeLatencySeconds === null ||
      clock.conservativeLatencySeconds === 0)
  ) {
    context.addIssue({
      code: "custom",
      message: "modeled source availability requires positive latency",
      path: ["conservativeLatencySeconds"],
    });
  }
  if (
    clock.availabilityTimeMode !== "MODELED_CONSERVATIVE_LATENCY" &&
    clock.conservativeLatencySeconds !== null
  ) {
    context.addIssue({
      code: "custom",
      message: "only modeled availability may carry conservative latency",
      path: ["conservativeLatencySeconds"],
    });
  }
  const policyContent = {
    policyId: clock.policyId,
    eventTimeBasis: clock.eventTimeBasis,
    availabilityTimeMode: clock.availabilityTimeMode,
    conservativeLatencySeconds: clock.conservativeLatencySeconds,
    archiveRetrievalTimeUsedAsMarketKnowledgeTime:
      clock.archiveRetrievalTimeUsedAsMarketKnowledgeTime,
  };
  if (clock.policyDigest !== stableContentHash(policyContent)) {
    context.addIssue({
      code: "custom",
      message: "source clock policy digest mismatch",
      path: ["policyDigest"],
    });
  }
});

const DetectorCoverageSchema = z.strictObject({
  detectorId: z.enum([
    M2_DRAFT_DETECTORS.PRE_MOVE_COMPRESSION.detectorId,
    M2_DRAFT_DETECTORS.PRE_MOVE_FLOW_DIVERGENCE.detectorId,
    M2_DRAFT_DETECTORS.PRE_MOVE_LIQUIDITY_SHIFT.detectorId,
    M2_DRAFT_DETECTORS.BREAKOUT_EDGE.detectorId,
    M2_DRAFT_DETECTORS.ROLE_FLIP_RETEST.detectorId,
  ]),
  coverageStatus: z.enum(["SUPPORTED", "PARTIAL", "UNSUPPORTED"]),
  requiredDatasetKinds: z.array(z.enum([
    "KLINE_1M",
    "AGG_TRADES",
    "BOOK_TICKER",
    "L2_BOOK_DEPTH",
    "FUNDING_RATE",
    "INSTRUMENT_HISTORY",
  ])).min(1),
  unavailableDatasetKinds: z.array(z.enum([
    "KLINE_1M",
    "AGG_TRADES",
    "BOOK_TICKER",
    "L2_BOOK_DEPTH",
    "FUNDING_RATE",
    "INSTRUMENT_HISTORY",
  ])),
  reasonCodes: ReasonCodesSchema,
}).superRefine((coverage, context) => {
  const unavailable = new Set(coverage.unavailableDatasetKinds);
  if (coverage.unavailableDatasetKinds.some(
    (kind) => !coverage.requiredDatasetKinds.includes(kind),
  )) {
    context.addIssue({
      code: "custom",
      message: "unavailable detector inputs must belong to required inputs",
      path: ["unavailableDatasetKinds"],
    });
  }
  const expectedStatus = unavailable.size === 0
    ? "SUPPORTED"
    : unavailable.size === coverage.requiredDatasetKinds.length
      ? "UNSUPPORTED"
      : "PARTIAL";
  if (coverage.coverageStatus !== expectedStatus) {
    context.addIssue({
      code: "custom",
      message: "detector coverage status does not match unavailable inputs",
      path: ["coverageStatus"],
    });
  }
  for (const [field, values] of [
    ["requiredDatasetKinds", coverage.requiredDatasetKinds],
    ["unavailableDatasetKinds", coverage.unavailableDatasetKinds],
    ["reasonCodes", coverage.reasonCodes],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: `detector coverage ${field} must be unique`,
        path: [field],
      });
    }
  }
});

const SourceQualificationCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_HISTORICAL_SOURCE_QUALIFICATION_VERSION),
  sourceRegistryId: NonEmptyStringSchema,
  providerId: NonEmptyStringSchema,
  capabilityId: NonEmptyStringSchema,
  sourceType: z.literal("VENUE_PUBLIC_ARCHIVE"),
  qualifiedAt: IsoDateTimeSchema,
  evidence: z.array(EvidenceReferenceSchema).min(1),
  rightsReview: RightsReviewSchema,
  technical: TechnicalQualificationSchema,
  instrumentHistory: InstrumentHistorySchema,
  sourceClock: SourceClockSchema,
  detectorCoverage: z.array(DetectorCoverageSchema).min(1),
});

export const M2HistoricalSourceQualificationSchema =
  SourceQualificationCoreSchema.extend({
    qualificationDigest: DigestSchema,
    qualificationId: NonEmptyStringSchema,
  }).superRefine((qualification, context) => {
    const evidenceIds = qualification.evidence.map((item) => item.evidenceId);
    if (new Set(evidenceIds).size !== evidenceIds.length) {
      context.addIssue({
        code: "custom",
        message: "source qualification evidence ids must be unique",
        path: ["evidence"],
      });
    }
    const evidenceIdSet = new Set(evidenceIds);
    for (const [index, evidence] of qualification.evidence.entries()) {
      if (Date.parse(evidence.capturedAt) > Date.parse(qualification.qualifiedAt)) {
        context.addIssue({
          code: "custom",
          message: "source evidence cannot be captured after qualification freeze",
          path: ["evidence", index, "capturedAt"],
        });
      }
    }
    if (
      qualification.rightsReview.reviewedAt !== null &&
      Date.parse(qualification.rightsReview.reviewedAt) >
        Date.parse(qualification.qualifiedAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "source rights review cannot occur after qualification freeze",
        path: ["rightsReview", "reviewedAt"],
      });
    }
    if (
      qualification.technical.lastProbeAt !== null &&
      Date.parse(qualification.technical.lastProbeAt) >
        Date.parse(qualification.qualifiedAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "source technical probe cannot occur after qualification freeze",
        path: ["technical", "lastProbeAt"],
      });
    }
    for (const evidenceId of qualification.rightsReview.evidenceIds) {
      if (!evidenceIdSet.has(evidenceId)) {
        context.addIssue({
          code: "custom",
          message: "rights review references unknown evidence",
          path: ["rightsReview", "evidenceIds"],
        });
      }
    }
    for (const evidenceId of qualification.technical.probeEvidenceIds) {
      if (!evidenceIdSet.has(evidenceId)) {
        context.addIssue({
          code: "custom",
          message: "technical qualification references unknown evidence",
          path: ["technical", "probeEvidenceIds"],
        });
      }
    }
    const detectorIds = qualification.detectorCoverage.map(
      (coverage) => coverage.detectorId,
    );
    if (new Set(detectorIds).size !== detectorIds.length) {
      context.addIssue({
        code: "custom",
        message: "detector coverage identities must be unique",
        path: ["detectorCoverage"],
      });
    }
    const {
      qualificationDigest,
      qualificationId,
      ...core
    } = qualification;
    const expectedDigest = stableContentHash(core);
    if (qualificationDigest !== expectedDigest) {
      context.addIssue({
        code: "custom",
        message: "source qualification digest mismatch",
        path: ["qualificationDigest"],
      });
    }
    if (
      qualificationId !==
        `historical-source-qualification:${expectedDigest.slice("sha256:".length)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "source qualification identity mismatch",
        path: ["qualificationId"],
      });
    }
  });

export type M2HistoricalSourceQualification = z.infer<
  typeof M2HistoricalSourceQualificationSchema
>;

export function buildM2HistoricalSourceQualification(
  rawCore: z.input<typeof SourceQualificationCoreSchema>,
): M2HistoricalSourceQualification {
  const core = SourceQualificationCoreSchema.parse(rawCore);
  const qualificationDigest = stableContentHash(core);
  return deepFreezeArtifact(M2HistoricalSourceQualificationSchema.parse({
    ...core,
    qualificationDigest,
    qualificationId:
      `historical-source-qualification:${qualificationDigest.slice("sha256:".length)}`,
  }));
}

const SourceAssessmentCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_HISTORICAL_SOURCE_ASSESSMENT_VERSION),
  qualificationId: NonEmptyStringSchema,
  qualificationDigest: DigestSchema,
  assessmentStatus: z.enum(["READY", "BLOCKED", "REJECTED"]),
  metadataProbeAllowed: z.boolean(),
  bulkAcquisitionAllowed: z.boolean(),
  cohortFreezeAllowed: z.boolean(),
  eligibleDetectorIds: z.array(NonEmptyStringSchema),
  blockedDetectorIds: z.array(NonEmptyStringSchema),
  blockerReasonCodes: ReasonCodesSchema,
  warningReasonCodes: ReasonCodesSchema,
});

export const M2HistoricalSourceAssessmentSchema =
  SourceAssessmentCoreSchema.extend({
    assessmentDigest: DigestSchema,
  }).superRefine((assessment, context) => {
    if (
      assessment.cohortFreezeAllowed && !assessment.bulkAcquisitionAllowed
    ) {
      context.addIssue({
        code: "custom",
        message: "cohort freeze cannot bypass bulk acquisition approval",
        path: ["cohortFreezeAllowed"],
      });
    }
    if (
      assessment.assessmentStatus === "READY" &&
      (!assessment.bulkAcquisitionAllowed ||
        !assessment.cohortFreezeAllowed ||
        assessment.blockerReasonCodes.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "ready source assessment cannot retain blockers",
        path: ["assessmentStatus"],
      });
    }
    const { assessmentDigest, ...core } = assessment;
    if (assessmentDigest !== stableContentHash(core)) {
      context.addIssue({
        code: "custom",
        message: "source assessment digest mismatch",
        path: ["assessmentDigest"],
      });
    }
  });

export type M2HistoricalSourceAssessment = z.infer<
  typeof M2HistoricalSourceAssessmentSchema
>;

export function assessM2HistoricalSource(
  rawQualification: M2HistoricalSourceQualification,
): M2HistoricalSourceAssessment {
  const qualification = M2HistoricalSourceQualificationSchema.parse(
    rawQualification,
  );
  const blockers = new Set<string>();
  const warnings = new Set<string>();
  const rights = qualification.rightsReview;
  if (rights.decision === "REJECTED") {
    blockers.add("source_rights_rejected");
  } else if (rights.decision !== "APPROVED") {
    blockers.add("source_rights_human_review_pending");
  }
  if (rights.retentionRight !== "GRANTED") {
    blockers.add("source_retention_right_not_granted");
  }
  if (rights.replayRight !== "GRANTED") {
    blockers.add("source_replay_right_not_granted");
  }
  const rightsEvidence = new Map(
    qualification.evidence.map((item) => [item.evidenceId, item]),
  );
  if (rights.evidenceIds.some((id) => {
    const evidenceType = rightsEvidence.get(id)?.evidenceType;
    return evidenceType !== "OFFICIAL_LICENSE" &&
      evidenceType !== "OFFICIAL_TERMS";
  })) {
    blockers.add("source_rights_evidence_is_not_official_terms_or_license");
  }
  if (rights.evidenceIds.some((id) =>
    rightsEvidence.get(id)?.captureStatus !== "HASHED_CONTENT_CAPTURED")) {
    blockers.add("source_rights_evidence_not_immutably_captured");
  }
  if (qualification.technical.probeStatus !== "PASS") {
    blockers.add("source_technical_probe_not_passed");
  }
  if (qualification.technical.probeEvidenceIds.some((id) => {
    const evidence = rightsEvidence.get(id);
    return evidence?.evidenceType !== "TECHNICAL_PROBE" ||
      evidence.captureStatus !== "HASHED_CONTENT_CAPTURED";
  })) {
    blockers.add("source_technical_probe_evidence_not_immutably_captured");
  }
  const history = qualification.instrumentHistory;
  if (history.evidenceMode !== "POINT_IN_TIME_INSTRUMENT_SNAPSHOTS") {
    blockers.add("point_in_time_instrument_history_missing");
  }
  for (const [field, complete] of [
    ["onboard_at", history.onboardAtComplete],
    ["delist_at", history.delistAtComplete],
    ["contract_type", history.contractTypeComplete],
    ["settlement_asset", history.settlementAssetComplete],
    ["underlying_class", history.underlyingClassComplete],
    ["trading_status", history.tradingStatusComplete],
  ] as const) {
    if (!complete) {
      blockers.add(`instrument_history_${field}_incomplete`);
    }
  }
  if (history.evidenceDigest === null) {
    blockers.add("instrument_history_evidence_digest_missing");
  }
  if (qualification.sourceClock.availabilityTimeMode === "UNKNOWN") {
    blockers.add("source_knowledge_time_policy_unknown");
  } else if (
    qualification.sourceClock.availabilityTimeMode ===
      "MODELED_CONSERVATIVE_LATENCY"
  ) {
    warnings.add("knowledge_time_is_modeled_not_observed");
  }
  const eligibleDetectorIds = qualification.detectorCoverage
    .filter((coverage) => coverage.coverageStatus === "SUPPORTED")
    .map((coverage) => coverage.detectorId)
    .sort();
  const blockedDetectorIds = qualification.detectorCoverage
    .filter((coverage) => coverage.coverageStatus !== "SUPPORTED")
    .map((coverage) => coverage.detectorId)
    .sort();
  if (eligibleDetectorIds.length === 0) {
    blockers.add("no_detector_has_complete_source_coverage");
  }
  if (blockedDetectorIds.length > 0) {
    warnings.add("some_detectors_lack_complete_source_coverage");
  }
  const metadataProbeAllowed =
    qualification.technical.authClass === "PUBLIC_NO_CREDENTIAL" &&
    qualification.technical.transport === "HTTPS_GET_HEAD_ONLY";
  const bulkAcquisitionAllowed =
    rights.decision === "APPROVED" &&
    rights.retentionRight === "GRANTED" &&
    rights.replayRight === "GRANTED" &&
    ![...blockers].some((reason) =>
      reason.startsWith("source_rights_") ||
      reason === "source_retention_right_not_granted" ||
      reason === "source_replay_right_not_granted" ||
      reason.startsWith("source_technical_"));
  const cohortFreezeAllowed = bulkAcquisitionAllowed &&
    [...blockers].length === 0;
  const blockerReasonCodes = [...blockers].sort();
  const core = SourceAssessmentCoreSchema.parse({
    schemaVersion: M2_HISTORICAL_SOURCE_ASSESSMENT_VERSION,
    qualificationId: qualification.qualificationId,
    qualificationDigest: qualification.qualificationDigest,
    assessmentStatus: rights.decision === "REJECTED"
      ? "REJECTED"
      : cohortFreezeAllowed
        ? "READY"
        : "BLOCKED",
    metadataProbeAllowed,
    bulkAcquisitionAllowed,
    cohortFreezeAllowed,
    eligibleDetectorIds,
    blockedDetectorIds,
    blockerReasonCodes,
    warningReasonCodes: [...warnings].sort(),
  });
  return deepFreezeArtifact(M2HistoricalSourceAssessmentSchema.parse({
    ...core,
    assessmentDigest: stableContentHash(core),
  }));
}
