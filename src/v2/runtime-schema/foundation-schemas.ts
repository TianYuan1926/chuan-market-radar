import { z } from "zod";
import type {
  EligibleInstrumentSnapshot,
  FactQualitySnapshot,
  FeatureQualitySnapshot,
  FeatureSetSnapshot,
  InstrumentAccountingRecord,
  MarketContextSnapshot,
  PointInTimeFeature,
  PointInTimeMarketFact,
} from "../domain/contracts";
import { TARGET_VENUES } from "../domain/product-constitution";
import {
  FiniteNumberSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  PositiveDecimalStringSchema,
  QualityAssessmentSchema,
  RatioSchema,
  ReasonCodesSchema,
  SourceLineageSchema,
  UncertaintyVectorSchema,
  traceEnvelopeShape,
} from "./primitives";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "./schema-versions";

const InstrumentAccountingStatusSchema = z.enum([
  "OBSERVED",
  "ACCEPTED",
  "ELIGIBLE",
  "SUSPENDED",
  "DELISTING",
  "UNRESOLVED",
  "UNAVAILABLE",
  "UNSUPPORTED",
]);

export const InstrumentAccountingRecordSchema = z.strictObject({
  observationId: NonEmptyStringSchema,
  canonicalInstrumentId: NonEmptyStringSchema.nullable(),
  underlyingGroupId: NonEmptyStringSchema.nullable(),
  venue: z.enum(TARGET_VENUES),
  venueInstrumentId: NonEmptyStringSchema.nullable(),
  baseAsset: NonEmptyStringSchema.nullable(),
  quoteAsset: NonEmptyStringSchema.nullable(),
  settlementAsset: NonEmptyStringSchema.nullable(),
  contractType: z.literal("LINEAR_PERPETUAL").nullable(),
  contractSize: PositiveDecimalStringSchema.nullable(),
  status: InstrumentAccountingStatusSchema,
  statusReasons: ReasonCodesSchema,
  observedAt: IsoDateTimeSchema,
  eligible: z.boolean(),
}).superRefine((record, context) => {
  if (record.eligible !== (record.status === "ELIGIBLE")) {
    context.addIssue({
      code: "custom",
      message: "eligible must exactly match ELIGIBLE accounting status",
      path: ["eligible"],
    });
  }
  if (record.status !== "ELIGIBLE" && record.statusReasons.length === 0) {
    context.addIssue({
      code: "custom",
      message: "non-eligible instruments require an accounting reason",
      path: ["statusReasons"],
    });
  }
  if (
    record.status === "ELIGIBLE" &&
    (
      record.canonicalInstrumentId === null ||
      record.underlyingGroupId === null ||
      record.venueInstrumentId === null ||
      record.baseAsset === null ||
      record.quoteAsset === null ||
      record.settlementAsset === null ||
      record.contractType === null ||
      record.contractSize === null
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "ELIGIBLE instruments require a complete canonical identity",
      path: ["status"],
    });
  }
}) satisfies z.ZodType<InstrumentAccountingRecord>;

export const EligibleInstrumentSnapshotSchema = z.strictObject({
  ...traceEnvelopeShape(
    "universe_registry",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.EligibleInstrumentSnapshot,
  ),
  snapshotId: NonEmptyStringSchema,
  policyVersion: NonEmptyStringSchema,
  observedCount: NonNegativeIntegerSchema,
  eligibleCount: NonNegativeIntegerSchema,
  accounting: z.array(InstrumentAccountingRecordSchema),
  quality: QualityAssessmentSchema,
}).superRefine((snapshot, context) => {
  if (snapshot.observedCount !== snapshot.accounting.length) {
    context.addIssue({
      code: "custom",
      message: "observedCount must equal the accounting denominator",
      path: ["observedCount"],
    });
  }

  const eligibleCount = snapshot.accounting.filter(
    (record) => record.eligible,
  ).length;
  if (snapshot.eligibleCount !== eligibleCount) {
    context.addIssue({
      code: "custom",
      message: "eligibleCount must equal eligible accounting rows",
      path: ["eligibleCount"],
    });
  }

  for (const [index, record] of snapshot.accounting.entries()) {
    if (Date.parse(record.observedAt) > Date.parse(snapshot.sourceCutoff)) {
      context.addIssue({
        code: "custom",
        message: "accounting observation cannot exceed the snapshot cutoff",
        path: ["accounting", index, "observedAt"],
      });
    }
  }

  const observationIds = snapshot.accounting.map(
    (record) => record.observationId,
  );
  if (new Set(observationIds).size !== observationIds.length) {
    context.addIssue({
      code: "custom",
      message: "observationId must be unique within a snapshot",
      path: ["accounting"],
    });
  }

  const ids = snapshot.accounting
    .map((record) => record.canonicalInstrumentId)
    .filter((id): id is string => id !== null);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      message: "canonicalInstrumentId must be unique within a snapshot",
      path: ["accounting"],
    });
  }
}) satisfies z.ZodType<EligibleInstrumentSnapshot>;

export const PointInTimeMarketFactSchema = z.strictObject({
  ...traceEnvelopeShape(
    "market_fact_quality",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.PointInTimeMarketFact,
  ),
  factId: NonEmptyStringSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  venueInstrumentId: NonEmptyStringSchema,
  factType: NonEmptyStringSchema,
  value: z.union([NonEmptyStringSchema, FiniteNumberSchema]).nullable(),
  unit: NonEmptyStringSchema,
  sequence: NonEmptyStringSchema.nullable(),
  lineage: SourceLineageSchema,
  quality: QualityAssessmentSchema,
}).superRefine((fact, context) => {
  if (fact.value === null && fact.quality.status === "FRESH") {
    context.addIssue({
      code: "custom",
      message: "a null fact cannot claim FRESH quality",
      path: ["quality", "status"],
    });
  }
  if (fact.value !== null && fact.lineage.eventTime === null) {
    context.addIssue({
      code: "custom",
      message: "a valued market fact requires an exchange event time",
      path: ["lineage", "eventTime"],
    });
  }
  if (
    fact.lineage.eventTime !== null &&
    Date.parse(fact.lineage.eventTime) > Date.parse(fact.sourceCutoff)
  ) {
    context.addIssue({
      code: "custom",
      message: "eventTime cannot exceed the point-in-time source cutoff",
      path: ["lineage", "eventTime"],
    });
  }
  if (Date.parse(fact.sourceCutoff) > Date.parse(fact.generatedAt)) {
    context.addIssue({
      code: "custom",
      message: "sourceCutoff cannot exceed generatedAt",
      path: ["sourceCutoff"],
    });
  }
}) satisfies z.ZodType<PointInTimeMarketFact>;

export const FactQualitySnapshotSchema = z.strictObject({
  ...traceEnvelopeShape(
    "market_fact_quality",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.FactQualitySnapshot,
  ),
  snapshotId: NonEmptyStringSchema,
  universeSnapshotId: NonEmptyStringSchema,
  completenessRatio: RatioSchema,
  gapRate: RatioSchema,
  duplicateRate: RatioSchema,
  lateEventRate: RatioSchema,
  quality: QualityAssessmentSchema,
}) satisfies z.ZodType<FactQualitySnapshot>;

export const PointInTimeFeatureSchema = z.strictObject({
  featureId: NonEmptyStringSchema,
  featureDefinitionVersion: NonEmptyStringSchema,
  featureSetVersion: NonEmptyStringSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  timeframe: NonEmptyStringSchema,
  window: NonEmptyStringSchema,
  value: z.union([NonEmptyStringSchema, FiniteNumberSchema]).nullable(),
  unit: NonEmptyStringSchema,
  sourceFactIds: z.array(NonEmptyStringSchema).min(1),
  sourceCutoff: IsoDateTimeSchema,
  computedAt: IsoDateTimeSchema,
  quality: QualityAssessmentSchema,
}).superRefine((feature, context) => {
  if (feature.value === null && feature.quality.status === "FRESH") {
    context.addIssue({
      code: "custom",
      message: "a null feature cannot claim FRESH quality",
      path: ["quality", "status"],
    });
  }
  if (Date.parse(feature.sourceCutoff) > Date.parse(feature.computedAt)) {
    context.addIssue({
      code: "custom",
      message: "feature sourceCutoff cannot exceed computedAt",
      path: ["sourceCutoff"],
    });
  }
}) satisfies z.ZodType<PointInTimeFeature>;

export const FeatureSetSnapshotSchema = z.strictObject({
  ...traceEnvelopeShape(
    "point_in_time_feature_engine",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.FeatureSetSnapshot,
  ),
  snapshotId: NonEmptyStringSchema,
  universeSnapshotId: NonEmptyStringSchema,
  featureSetVersion: NonEmptyStringSchema,
  features: z.array(PointInTimeFeatureSchema),
}).superRefine((snapshot, context) => {
  const ids = snapshot.features.map((feature) => feature.featureId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      message: "featureId must be unique within a feature set",
      path: ["features"],
    });
  }
  for (const [index, feature] of snapshot.features.entries()) {
    if (feature.featureSetVersion !== snapshot.featureSetVersion) {
      context.addIssue({
        code: "custom",
        message: "feature version must match the enclosing feature set",
        path: ["features", index, "featureSetVersion"],
      });
    }
    if (Date.parse(feature.sourceCutoff) > Date.parse(snapshot.sourceCutoff)) {
      context.addIssue({
        code: "custom",
        message: "feature cannot read beyond the snapshot cutoff",
        path: ["features", index, "sourceCutoff"],
      });
    }
  }
}) satisfies z.ZodType<FeatureSetSnapshot>;

export const FeatureQualitySnapshotSchema = z.strictObject({
  ...traceEnvelopeShape(
    "point_in_time_feature_engine",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.FeatureQualitySnapshot,
  ),
  snapshotId: NonEmptyStringSchema,
  featureSetSnapshotId: NonEmptyStringSchema,
  onlineOfflineParity: z.enum(["PASS", "FAIL", "NOT_EVALUATED"]),
  replayDeterministic: z.boolean(),
  nullRate: RatioSchema,
  quality: QualityAssessmentSchema,
}) satisfies z.ZodType<FeatureQualitySnapshot>;

export const MarketContextSnapshotSchema = z.strictObject({
  ...traceEnvelopeShape(
    "market_context",
    RUNTIME_OBJECT_SCHEMA_VERSIONS.MarketContextSnapshot,
  ),
  snapshotId: NonEmptyStringSchema,
  universeSnapshotId: NonEmptyStringSchema,
  featureSetSnapshotId: NonEmptyStringSchema,
  contextRuleVersion: NonEmptyStringSchema,
  regime: z.enum(["TREND", "RANGE", "TRANSITION", "STRESS", "UNKNOWN"]),
  volatility: z.enum(["LOW", "NORMAL", "HIGH", "EXTREME", "UNKNOWN"]),
  breadth: FiniteNumberSchema.nullable(),
  correlation: FiniteNumberSchema.min(-1).max(1).nullable(),
  liquidity: z.enum(["HEALTHY", "THIN", "FRAGMENTED", "UNKNOWN"]),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]),
  quality: QualityAssessmentSchema,
  uncertainty: UncertaintyVectorSchema,
}).superRefine((snapshot, context) => {
  if (
    snapshot.quality.status !== "FRESH" &&
    snapshot.confidence === "HIGH"
  ) {
    context.addIssue({
      code: "custom",
      message: "non-fresh context cannot claim HIGH confidence",
      path: ["confidence"],
    });
  }
}) satisfies z.ZodType<MarketContextSnapshot>;
