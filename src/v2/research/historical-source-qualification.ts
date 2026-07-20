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
import {
  M2HistoricalInstrumentCoverageArtifactSchema,
} from "./historical-instrument-identity";
import {
  M2HistoricalRightsReviewArtifactSchema,
  assessM2HistoricalRightsReview,
} from "./historical-rights-review";

export const M2_HISTORICAL_SOURCE_QUALIFICATION_VERSION =
  "v2-m2-historical-source-qualification.v2" as const;
export const M2_HISTORICAL_SOURCE_ASSESSMENT_VERSION =
  "v2-m2-historical-source-assessment.v2" as const;

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
  rightsReview: M2HistoricalRightsReviewArtifactSchema,
  technical: TechnicalQualificationSchema,
  instrumentHistory: M2HistoricalInstrumentCoverageArtifactSchema,
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
      qualification.rightsReview.sourceRegistryId !==
        qualification.sourceRegistryId
    ) {
      context.addIssue({
        code: "custom",
        message: "rights review source binding mismatch",
        path: ["rightsReview", "sourceRegistryId"],
      });
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
      Date.parse(qualification.instrumentHistory.generatedAt) >
        Date.parse(qualification.qualifiedAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "instrument history coverage cannot postdate qualification",
        path: ["instrumentHistory", "generatedAt"],
      });
    }
    if (
      qualification.instrumentHistory.sourceProviderId !==
        qualification.providerId
    ) {
      context.addIssue({
        code: "custom",
        message: "instrument history provider binding mismatch",
        path: ["instrumentHistory", "sourceProviderId"],
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
    if (
      assessment.assessmentStatus !== "READY" &&
      (assessment.bulkAcquisitionAllowed || assessment.cohortFreezeAllowed)
    ) {
      context.addIssue({
        code: "custom",
        message: "non-ready source assessment cannot grant bulk or cohort authority",
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
  const rightsAssessment = assessM2HistoricalRightsReview(
    rights,
    qualification.qualifiedAt,
  );
  for (const blocker of rightsAssessment.blockerReasonCodes) {
    blockers.add(blocker);
  }
  const evidenceById = new Map(
    qualification.evidence.map((item) => [item.evidenceId, item]),
  );
  if (qualification.technical.probeStatus !== "PASS") {
    blockers.add("source_technical_probe_not_passed");
  }
  if (qualification.technical.probeEvidenceIds.some((id) => {
    const evidence = evidenceById.get(id);
    return evidence?.evidenceType !== "TECHNICAL_PROBE" ||
      evidence.captureStatus !== "HASHED_CONTENT_CAPTURED";
  })) {
    blockers.add("source_technical_probe_evidence_not_immutably_captured");
  }
  const history = qualification.instrumentHistory;
  if (!history.readyForCohortFreeze || history.coverageStatus !== "READY") {
    blockers.add("point_in_time_instrument_history_missing");
  }
  for (const blocker of history.blockerReasonCodes) {
    blockers.add(blocker);
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
  const instrumentHistoryReady =
    history.coverageStatus === "READY" && history.readyForCohortFreeze;
  const sourceGatesReady = blockers.size === 0;
  const bulkAcquisitionAllowed =
    rightsAssessment.status === "READY" &&
    rightsAssessment.bulkRetentionAllowed &&
    rightsAssessment.replayAllowed &&
    instrumentHistoryReady &&
    sourceGatesReady;
  const cohortFreezeAllowed = bulkAcquisitionAllowed;
  const blockerReasonCodes = [...blockers].sort();
  const core = SourceAssessmentCoreSchema.parse({
    schemaVersion: M2_HISTORICAL_SOURCE_ASSESSMENT_VERSION,
    qualificationId: qualification.qualificationId,
    qualificationDigest: qualification.qualificationDigest,
    assessmentStatus: rightsAssessment.status === "REJECTED"
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
