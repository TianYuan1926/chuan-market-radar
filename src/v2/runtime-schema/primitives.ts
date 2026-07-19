import { z } from "zod";
import type {
  InstrumentIdentity,
  QualityAssessment,
  SourceLineage,
  TraceEnvelope,
} from "../domain/contracts";
import { MODULE_IDS, type ModuleId } from "../domain/module-registry";
import { TARGET_VENUES } from "../domain/product-constitution";
import { DATA_QUALITY_STATES } from "../domain/states";
import type {
  UncertaintyAssessment,
  UncertaintyVector,
} from "../domain/uncertainty";
import { UNCERTAINTY_DIMENSIONS } from "../domain/uncertainty";

export const NonEmptyStringSchema = z.string().trim().min(1);
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const FiniteNumberSchema = z.number().finite();
export const NonNegativeFiniteSchema = FiniteNumberSchema.min(0);
export const RatioSchema = FiniteNumberSchema.min(0).max(1);
export const NonNegativeIntegerSchema = z.number().int().nonnegative();
export const PositiveDecimalStringSchema = z
  .string()
  .max(128)
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/u)
  .refine((value) => /[1-9]/u.test(value), "must be greater than zero");
export const NonNegativeDecimalStringSchema = z
  .string()
  .max(128)
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/u);
export const DecimalStringSchema = z
  .string()
  .max(129)
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u);
export const ReasonCodesSchema = z.array(NonEmptyStringSchema);

export function compareNonNegativeDecimalStrings(
  left: string,
  right: string,
): -1 | 0 | 1 {
  const [leftInteger, leftFraction = ""] = left.split(".");
  const [rightInteger, rightFraction = ""] = right.split(".");
  if (leftInteger.length !== rightInteger.length) {
    return leftInteger.length < rightInteger.length ? -1 : 1;
  }
  if (leftInteger !== rightInteger) {
    return leftInteger < rightInteger ? -1 : 1;
  }

  const fractionLength = Math.max(leftFraction.length, rightFraction.length);
  const normalizedLeft = leftFraction.padEnd(fractionLength, "0");
  const normalizedRight = rightFraction.padEnd(fractionLength, "0");
  if (normalizedLeft === normalizedRight) {
    return 0;
  }
  return normalizedLeft < normalizedRight ? -1 : 1;
}

export function traceEnvelopeShape<
  const Producer extends ModuleId,
  const SchemaVersion extends string,
>(
  producerModule: Producer,
  schemaVersion: SchemaVersion,
) {
  return {
    schemaVersion: z.literal(schemaVersion),
    releaseId: NonEmptyStringSchema,
    producerModule: z.literal(producerModule),
    generatedAt: IsoDateTimeSchema,
    sourceCutoff: IsoDateTimeSchema,
    contentHash: NonEmptyStringSchema,
  } as const;
}

export const TraceEnvelopeSchema = z.strictObject({
  schemaVersion: NonEmptyStringSchema,
  releaseId: NonEmptyStringSchema,
  producerModule: z.enum(MODULE_IDS),
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  contentHash: NonEmptyStringSchema,
}) satisfies z.ZodType<TraceEnvelope>;

export const SourceLineageSchema = z.strictObject({
  sourceId: NonEmptyStringSchema,
  sourceCapability: NonEmptyStringSchema,
  sourceRecordIds: z.array(NonEmptyStringSchema),
  eventTime: IsoDateTimeSchema,
  receivedAt: IsoDateTimeSchema,
  persistedAt: IsoDateTimeSchema,
}).superRefine((lineage, context) => {
  const eventTime = Date.parse(lineage.eventTime);
  const receivedAt = Date.parse(lineage.receivedAt);
  const persistedAt = Date.parse(lineage.persistedAt);

  if (eventTime > receivedAt) {
    context.addIssue({
      code: "custom",
      message: "eventTime cannot be later than receivedAt",
      path: ["eventTime"],
    });
  }
  if (receivedAt > persistedAt) {
    context.addIssue({
      code: "custom",
      message: "receivedAt cannot be later than persistedAt",
      path: ["receivedAt"],
    });
  }
}) satisfies z.ZodType<SourceLineage>;

export const QualityAssessmentSchema = z.strictObject({
  status: z.enum(DATA_QUALITY_STATES),
  ageMs: NonNegativeFiniteSchema.nullable(),
  reasonCodes: ReasonCodesSchema,
}).superRefine((quality, context) => {
  if (quality.status !== "FRESH" && quality.reasonCodes.length === 0) {
    context.addIssue({
      code: "custom",
      message: "non-fresh quality requires at least one reason code",
      path: ["reasonCodes"],
    });
  }
  if (quality.status === "UNAVAILABLE" && quality.ageMs !== null) {
    context.addIssue({
      code: "custom",
      message: "unavailable quality cannot claim a measured age",
      path: ["ageMs"],
    });
  }
}) satisfies z.ZodType<QualityAssessment>;

export const InstrumentIdentitySchema = z.strictObject({
  canonicalInstrumentId: NonEmptyStringSchema,
  underlyingGroupId: NonEmptyStringSchema,
  venue: z.enum(TARGET_VENUES),
  venueInstrumentId: NonEmptyStringSchema,
  baseAsset: NonEmptyStringSchema,
  quoteAsset: NonEmptyStringSchema,
  settlementAsset: NonEmptyStringSchema,
  contractType: z.literal("LINEAR_PERPETUAL"),
  contractSize: PositiveDecimalStringSchema,
}) satisfies z.ZodType<InstrumentIdentity>;

export const UncertaintyAssessmentSchema = z.strictObject({
  dimension: z.enum(UNCERTAINTY_DIMENSIONS),
  status: z.enum(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]),
  reasonCodes: ReasonCodesSchema,
  sampleSize: NonNegativeIntegerSchema.nullable(),
  calibrationVersion: NonEmptyStringSchema.nullable(),
  lastValidatedAt: IsoDateTimeSchema.nullable(),
}) satisfies z.ZodType<UncertaintyAssessment>;

function uncertaintyFor(dimension: (typeof UNCERTAINTY_DIMENSIONS)[number]) {
  return UncertaintyAssessmentSchema.refine(
    (assessment) => assessment.dimension === dimension,
    `${dimension} uncertainty must identify its own dimension`,
  );
}

export const UncertaintyVectorSchema = z.strictObject({
  data: uncertaintyFor("data"),
  model: uncertaintyFor("model"),
  market: uncertaintyFor("market"),
  execution: uncertaintyFor("execution"),
}) satisfies z.ZodType<UncertaintyVector>;
