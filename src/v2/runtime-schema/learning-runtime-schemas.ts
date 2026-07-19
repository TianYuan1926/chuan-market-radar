import { z } from "zod";
import type {
  AlertEvent,
  DeliveryReceipt,
  DriftStatusSnapshot,
  EvaluationDatasetSnapshot,
  ExperimentRecord,
  MissedOpportunityRecord,
  OutcomeRecord,
  PromotionDecisionRecord,
  ReleaseRecord,
  ResearchProposal,
  RuntimeTruthSnapshot,
} from "../domain/contracts";
import {
  FiniteNumberSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeFiniteSchema,
  NonNegativeIntegerSchema,
  ReasonCodesSchema,
  traceEnvelopeShape,
} from "./primitives";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "./schema-versions";

export const AlertEventSchema = z.strictObject({
  ...traceEnvelopeShape(
    "alert_delivery",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.AlertEvent,
  ),
  alertId: NonEmptyStringSchema,
  episodeId: NonEmptyStringSchema,
  decisionSnapshotId: NonEmptyStringSchema,
  alertType: z.enum([
    "EARLY_CANDIDATE",
    "EVIDENCE_READY",
    "WAIT_NEAR_TRIGGER",
    "READY",
    "INVALIDATED",
    "EXPIRED",
    "DEGRADED",
  ]),
  dedupeKey: NonEmptyStringSchema,
  expiresAt: IsoDateTimeSchema,
}).superRefine((event, context) => {
  if (Date.parse(event.expiresAt) <= Date.parse(event.generatedAt)) {
    context.addIssue({
      code: "custom",
      message: "an alert must expire after it is generated",
      path: ["expiresAt"],
    });
  }
}) satisfies z.ZodType<AlertEvent>;

export const DeliveryReceiptSchema = z.strictObject({
  ...traceEnvelopeShape(
    "alert_delivery",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.DeliveryReceipt,
  ),
  receiptId: NonEmptyStringSchema,
  alertId: NonEmptyStringSchema,
  channel: z.literal("IN_APP"),
  status: z.enum(["DELIVERED", "ACKNOWLEDGED", "EXPIRED", "FAILED"]),
  deliveredAt: IsoDateTimeSchema.nullable(),
  acknowledgedAt: IsoDateTimeSchema.nullable(),
  attemptCount: NonNegativeIntegerSchema,
}).superRefine((receipt, context) => {
  if (
    receipt.status === "ACKNOWLEDGED" &&
    (receipt.deliveredAt === null || receipt.acknowledgedAt === null)
  ) {
    context.addIssue({
      code: "custom",
      message: "acknowledged delivery requires deliveredAt and acknowledgedAt",
      path: ["acknowledgedAt"],
    });
  }
}) satisfies z.ZodType<DeliveryReceipt>;

export const OutcomeRecordSchema = z.strictObject({
  ...traceEnvelopeShape(
    "outcome_evaluation",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.OutcomeRecord,
  ),
  outcomeId: NonEmptyStringSchema,
  episodeId: NonEmptyStringSchema,
  decisionSnapshotId: NonEmptyStringSchema,
  checkpoint: z.enum(["1H", "4H", "24H"]),
  status: z.enum([
    "TP_FIRST",
    "SL_FIRST",
    "PARTIAL",
    "EXPIRED",
    "NOT_TRIGGERED",
    "DATA_UNAVAILABLE",
  ]),
  maximumFavorableExcursion: NonNegativeFiniteSchema.nullable(),
  maximumAdverseExcursion: NonNegativeFiniteSchema.nullable(),
  netR: FiniteNumberSchema.nullable(),
  leadTimeSeconds: FiniteNumberSchema.nullable(),
  factCutoff: IsoDateTimeSchema,
}).superRefine((outcome, context) => {
  if (
    outcome.status === "DATA_UNAVAILABLE" &&
    [
      outcome.maximumFavorableExcursion,
      outcome.maximumAdverseExcursion,
      outcome.netR,
      outcome.leadTimeSeconds,
    ].some((value) => value !== null)
  ) {
    context.addIssue({
      code: "custom",
      message: "unavailable outcomes cannot contain fabricated measurements",
      path: ["status"],
    });
  }
}) satisfies z.ZodType<OutcomeRecord>;

export const MissedOpportunityRecordSchema = z.strictObject({
  ...traceEnvelopeShape(
    "outcome_evaluation",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.MissedOpportunityRecord,
  ),
  missedOpportunityId: NonEmptyStringSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  eventLabelVersion: NonEmptyStringSchema,
  eventStartAt: IsoDateTimeSchema,
  publicBreakoutAt: IsoDateTimeSchema,
  direction: z.enum(["LONG", "SHORT"]),
  matchingCandidateIds: z.array(NonEmptyStringSchema),
  missReasonCode: NonEmptyStringSchema,
}).refine(
  (record) => Date.parse(record.eventStartAt) <= Date.parse(record.publicBreakoutAt),
  {
    message: "eventStartAt cannot exceed publicBreakoutAt",
    path: ["eventStartAt"],
  },
) satisfies z.ZodType<MissedOpportunityRecord>;

export const EvaluationDatasetSnapshotSchema = z.strictObject({
  ...traceEnvelopeShape(
    "outcome_evaluation",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.EvaluationDatasetSnapshot,
  ),
  datasetSnapshotId: NonEmptyStringSchema,
  eventLabelVersion: NonEmptyStringSchema,
  candidateDenominatorCount: NonNegativeIntegerSchema,
  eventDenominatorCount: NonNegativeIntegerSchema,
  matchedNonEventDenominatorCount: NonNegativeIntegerSchema,
  unavailableCount: NonNegativeIntegerSchema,
  recordIds: z.array(NonEmptyStringSchema),
}) satisfies z.ZodType<EvaluationDatasetSnapshot>;

export const ResearchProposalSchema = z.strictObject({
  ...traceEnvelopeShape(
    "research_governance",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.ResearchProposal,
  ),
  proposalId: NonEmptyStringSchema,
  hypothesis: NonEmptyStringSchema,
  datasetSnapshotIds: z.array(NonEmptyStringSchema).min(1),
  primaryMetric: NonEmptyStringSchema,
  nonInferiorityMetrics: z.array(NonEmptyStringSchema).min(1),
  expectedRisks: ReasonCodesSchema.min(1),
  status: z.enum([
    "DRAFT",
    "REGISTERED",
    "REJECTED",
    "TESTING",
    "AWAITING_REVIEW",
    "CLOSED",
  ]),
}) satisfies z.ZodType<ResearchProposal>;

const ExperimentParameterSchema = z.union([
  NonEmptyStringSchema,
  FiniteNumberSchema,
  z.boolean(),
]);

export const ExperimentRecordSchema = z.strictObject({
  ...traceEnvelopeShape(
    "research_governance",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.ExperimentRecord,
  ),
  experimentId: NonEmptyStringSchema,
  proposalId: NonEmptyStringSchema,
  codeVersion: NonEmptyStringSchema,
  datasetSnapshotIds: z.array(NonEmptyStringSchema).min(1),
  parameterSet: z.record(NonEmptyStringSchema, ExperimentParameterSchema),
  resultStatus: z.enum(["PASS", "FAIL", "INVALID", "INCONCLUSIVE"]),
  resultArtifactDigest: NonEmptyStringSchema,
}) satisfies z.ZodType<ExperimentRecord>;

export const PromotionDecisionRecordSchema = z.strictObject({
  ...traceEnvelopeShape(
    "research_governance",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.PromotionDecisionRecord,
  ),
  promotionDecisionId: NonEmptyStringSchema,
  proposalId: NonEmptyStringSchema,
  experimentIds: z.array(NonEmptyStringSchema).min(1),
  decision: z.enum([
    "PROMOTE_TO_SHADOW",
    "PROMOTE_TO_LIMITED",
    "PROMOTE_TO_ACTIVE",
    "REJECT",
    "SUSPEND",
  ]),
  humanApproverId: NonEmptyStringSchema,
  decidedAt: IsoDateTimeSchema,
  reasonCodes: ReasonCodesSchema.min(1),
}) satisfies z.ZodType<PromotionDecisionRecord>;

const RuntimeTruthCheckEvidenceSchema = z.strictObject({
  checkedAt: IsoDateTimeSchema,
  checkIds: z.array(NonEmptyStringSchema).min(1),
  evidenceIds: z.array(NonEmptyStringSchema).min(1),
  reasonCodes: ReasonCodesSchema,
}).superRefine((evidence, context) => {
  if (new Set(evidence.checkIds).size !== evidence.checkIds.length) {
    context.addIssue({
      code: "custom",
      message: "runtime check ids must be unique within a dimension",
      path: ["checkIds"],
    });
  }
  if (new Set(evidence.evidenceIds).size !== evidence.evidenceIds.length) {
    context.addIssue({
      code: "custom",
      message: "runtime evidence ids must be unique within a dimension",
      path: ["evidenceIds"],
    });
  }
});

export const RuntimeTruthSnapshotSchema = z.strictObject({
  ...traceEnvelopeShape(
    "runtime_security_release_control",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.RuntimeTruthSnapshot,
  ),
  runtimeTruthId: NonEmptyStringSchema,
  runtimeMode: z.enum(["REHEARSAL", "PRODUCTION"]),
  runtimeProfileVersion: NonEmptyStringSchema,
  liveness: z.enum(["READY", "FAILED", "UNKNOWN"]),
  dependencyReadiness: z.enum(["READY", "PARTIAL", "FAILED", "UNKNOWN"]),
  businessReadiness: z.enum(["READY", "PARTIAL", "FAILED", "UNKNOWN"]),
  dataFreshness: z.enum(["FRESH", "PARTIAL", "STALE", "UNKNOWN"]),
  releaseValidity: z.enum(["VALID", "INVALID", "UNKNOWN"]),
  checks: z.strictObject({
    liveness: RuntimeTruthCheckEvidenceSchema,
    dependencyReadiness: RuntimeTruthCheckEvidenceSchema,
    businessReadiness: RuntimeTruthCheckEvidenceSchema,
    dataFreshness: RuntimeTruthCheckEvidenceSchema,
    releaseValidity: RuntimeTruthCheckEvidenceSchema,
  }),
  reasonCodes: ReasonCodesSchema,
}).superRefine((snapshot, context) => {
  const dimensions = [
    ["liveness", snapshot.liveness, snapshot.checks.liveness],
    ["dependencyReadiness", snapshot.dependencyReadiness, snapshot.checks.dependencyReadiness],
    ["businessReadiness", snapshot.businessReadiness, snapshot.checks.businessReadiness],
    ["dataFreshness", snapshot.dataFreshness, snapshot.checks.dataFreshness],
    ["releaseValidity", snapshot.releaseValidity, snapshot.checks.releaseValidity],
  ] as const;
  for (const [name, status, evidence] of dimensions) {
    if (Date.parse(evidence.checkedAt) > Date.parse(snapshot.generatedAt)) {
      context.addIssue({
        code: "custom",
        message: "runtime evidence cannot be observed after snapshot generation",
        path: ["checks", name, "checkedAt"],
      });
    }
    const ready = status === "READY" || status === "FRESH" || status === "VALID";
    if (!ready && evidence.reasonCodes.length === 0) {
      context.addIssue({
        code: "custom",
        message: "non-ready runtime dimensions require evidence reason codes",
        path: ["checks", name, "reasonCodes"],
      });
    }
  }
  if (
    snapshot.businessReadiness === "READY" &&
    (snapshot.liveness !== "READY" ||
      snapshot.dependencyReadiness !== "READY" ||
      snapshot.dataFreshness !== "FRESH" ||
      snapshot.releaseValidity !== "VALID")
  ) {
    context.addIssue({
      code: "custom",
      message: "business READY requires live, ready, fresh and valid runtime truth",
      path: ["businessReadiness"],
    });
  }
  if (
    snapshot.businessReadiness === "READY" &&
    snapshot.runtimeMode !== "PRODUCTION"
  ) {
    context.addIssue({
      code: "custom",
      message: "a rehearsal runtime can never claim business READY",
      path: ["runtimeMode"],
    });
  }
  const expectedReasons = [...new Set(dimensions.flatMap(
    ([, , evidence]) => evidence.reasonCodes,
  ))].sort();
  if (
    snapshot.reasonCodes.length !== expectedReasons.length ||
    snapshot.reasonCodes.some((reason, index) => reason !== expectedReasons[index])
  ) {
    context.addIssue({
      code: "custom",
      message: "runtime truth reasons must exactly equal its dimension evidence",
      path: ["reasonCodes"],
    });
  }
  if (
    (snapshot.businessReadiness !== "READY" ||
      snapshot.dependencyReadiness !== "READY" ||
      snapshot.dataFreshness !== "FRESH" ||
      snapshot.releaseValidity !== "VALID") &&
    snapshot.reasonCodes.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "degraded or unknown runtime truth requires reason codes",
      path: ["reasonCodes"],
    });
  }
}) satisfies z.ZodType<RuntimeTruthSnapshot>;

export const ReleaseRecordSchema = z.strictObject({
  ...traceEnvelopeShape(
    "runtime_security_release_control",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.ReleaseRecord,
  ),
  releaseRecordId: NonEmptyStringSchema,
  commit: NonEmptyStringSchema,
  tree: NonEmptyStringSchema,
  artifactDigest: NonEmptyStringSchema,
  imageDigests: z.record(NonEmptyStringSchema, NonEmptyStringSchema),
  databaseSchemaVersion: NonEmptyStringSchema,
  featureVersions: z.array(NonEmptyStringSchema),
  ruleVersions: z.array(NonEmptyStringSchema),
  rollbackReleaseId: NonEmptyStringSchema,
  evidenceDigest: NonEmptyStringSchema,
}) satisfies z.ZodType<ReleaseRecord>;

export const DriftStatusSnapshotSchema = z.strictObject({
  ...traceEnvelopeShape(
    "runtime_security_release_control",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.DriftStatusSnapshot,
  ),
  driftSnapshotId: NonEmptyStringSchema,
  dimension: NonEmptyStringSchema,
  status: z.enum(["NORMAL", "WARN", "DEGRADE", "SUSPEND", "RESEARCH"]),
  baselineVersion: NonEmptyStringSchema,
  observedValue: FiniteNumberSchema.nullable(),
  reasonCodes: ReasonCodesSchema,
}) satisfies z.ZodType<DriftStatusSnapshot>;
