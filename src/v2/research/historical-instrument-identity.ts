import { z } from "zod";
import { TARGET_VENUES } from "../domain/product-constitution";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../modules/universe/stable-artifact";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  PositiveDecimalStringSchema,
  ReasonCodesSchema,
} from "../runtime-schema/primitives";

export const M2_HISTORICAL_INSTRUMENT_CAPABILITY_VERSION =
  "v2-m2-historical-instrument-capability.v1" as const;
export const M2_HISTORICAL_INSTRUMENT_RECORD_VERSION =
  "v2-m2-historical-instrument-record.v1" as const;
export const M2_HISTORICAL_INSTRUMENT_COVERAGE_VERSION =
  "v2-m2-historical-instrument-coverage.v1" as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const AssetCodeSchema = z.string().regex(/^[A-Z0-9]{1,32}$/u);
const HttpsUrlSchema = z.string().url().superRefine((value, context) => {
  if (new URL(value).protocol !== "https:") {
    context.addIssue({
      code: "custom",
      message: "instrument evidence must use HTTPS",
    });
  }
});

const CapabilityDocumentationSchema = z.strictObject({
  evidenceId: NonEmptyStringSchema,
  evidenceType: z.enum([
    "OFFICIAL_DOCUMENTATION",
    "VENDOR_DOCUMENTATION",
    "CONTRACTUAL_CAPABILITY_SLA",
    "TECHNICAL_PROBE",
  ]),
  url: HttpsUrlSchema,
  capturedAt: IsoDateTimeSchema,
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
  claimScope: z.enum([
    "CURRENT_INSTRUMENT_FIELDS",
    "LISTING_AND_DELISTING_FIELDS",
    "HISTORICAL_INSTRUMENT_COVERAGE",
    "STATUS_TRANSITION_HISTORY",
    "SYMBOL_REUSE_BEHAVIOR",
  ]),
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
      message: "instrument documentation status and digest disagree",
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
      message: "unhashed instrument reference cannot claim retained content",
      path: ["retentionClass"],
    });
  }
});

const CapabilityCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_HISTORICAL_INSTRUMENT_CAPABILITY_VERSION),
  capabilityRegistryId: NonEmptyStringSchema,
  providerId: NonEmptyStringSchema,
  sourceOperator: NonEmptyStringSchema,
  sourceClass: z.enum(["VENUE_OFFICIAL", "LICENSED_VENDOR"]),
  evidenceMode: z.enum([
    "OFFICIAL_POINT_IN_TIME_SNAPSHOT_ARCHIVE",
    "OFFICIAL_POINT_IN_TIME_EVENT_LEDGER",
    "LICENSED_POINT_IN_TIME_REFERENCE",
    "FIRST_PARTY_CONTINUOUS_CAPTURE",
    "CURRENT_SNAPSHOT_ONLY",
    "ARCHIVE_OBJECT_PRESENCE_ONLY",
    "UNAVAILABLE",
  ]),
  assessedAt: IsoDateTimeSchema,
  captureStartedAt: IsoDateTimeSchema.nullable(),
  coverage: z.strictObject({
    startedAt: IsoDateTimeSchema.nullable(),
    endedAt: IsoDateTimeSchema.nullable(),
  }),
  documentation: z.array(CapabilityDocumentationSchema).min(1),
  guarantees: z.strictObject({
    fullUniverseDenominator: z.boolean(),
    includesDelistedInstruments: z.boolean(),
    onboardAt: z.boolean(),
    delistAt: z.boolean(),
    contractType: z.boolean(),
    settlementAsset: z.boolean(),
    underlyingClass: z.boolean(),
    tradingStatusIntervals: z.boolean(),
    symbolReuseDisambiguation: z.boolean(),
  }),
  declaredLimitations: ReasonCodesSchema,
}).superRefine((capability, context) => {
  const evidenceIds = capability.documentation.map((item) => item.evidenceId);
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    context.addIssue({
      code: "custom",
      message: "instrument capability evidence ids must be unique",
      path: ["documentation"],
    });
  }
  if (
    new Set(capability.declaredLimitations).size !==
      capability.declaredLimitations.length
  ) {
    context.addIssue({
      code: "custom",
      message: "instrument capability limitations must be unique",
      path: ["declaredLimitations"],
    });
  }
  const assessedAt = Date.parse(capability.assessedAt);
  for (const [index, evidence] of capability.documentation.entries()) {
    if (Date.parse(evidence.capturedAt) > assessedAt) {
      context.addIssue({
        code: "custom",
        message: "instrument capability evidence cannot postdate assessment",
        path: ["documentation", index, "capturedAt"],
      });
    }
  }
  const { startedAt, endedAt } = capability.coverage;
  if ((startedAt === null) !== (endedAt === null)) {
    context.addIssue({
      code: "custom",
      message: "instrument capability coverage bounds must be paired",
      path: ["coverage"],
    });
  }
  if (
    startedAt !== null && endedAt !== null &&
    (Date.parse(startedAt) >= Date.parse(endedAt) ||
      Date.parse(endedAt) > assessedAt)
  ) {
    context.addIssue({
      code: "custom",
      message: "instrument capability coverage must end after start and by assessment",
      path: ["coverage"],
    });
  }
  if (
    capability.captureStartedAt !== null &&
    Date.parse(capability.captureStartedAt) > assessedAt
  ) {
    context.addIssue({
      code: "custom",
      message: "instrument capture cannot start after capability assessment",
      path: ["captureStartedAt"],
    });
  }
  if (
    capability.evidenceMode === "FIRST_PARTY_CONTINUOUS_CAPTURE" &&
    capability.captureStartedAt === null
  ) {
    context.addIssue({
      code: "custom",
      message: "first-party instrument capture requires a measured start",
      path: ["captureStartedAt"],
    });
  }
  if (
    capability.evidenceMode !== "FIRST_PARTY_CONTINUOUS_CAPTURE" &&
    capability.captureStartedAt !== null
  ) {
    context.addIssue({
      code: "custom",
      message: "only first-party continuous capture may carry captureStartedAt",
      path: ["captureStartedAt"],
    });
  }
});

function deriveCapabilityAssessment(
  capability: z.infer<typeof CapabilityCoreSchema>,
): {
  assessmentStatus:
    | "HISTORICAL_READY"
    | "FORWARD_ONLY_READY"
    | "RESEARCH_ONLY";
  blockerReasonCodes: string[];
} {
  const blockers = new Set<string>();
  const historicalModes = new Set([
    "OFFICIAL_POINT_IN_TIME_SNAPSHOT_ARCHIVE",
    "OFFICIAL_POINT_IN_TIME_EVENT_LEDGER",
    "LICENSED_POINT_IN_TIME_REFERENCE",
  ]);
  const allGuarantees = Object.values(capability.guarantees).every(Boolean);

  if (!historicalModes.has(capability.evidenceMode) &&
    capability.evidenceMode !== "FIRST_PARTY_CONTINUOUS_CAPTURE") {
    blockers.add("source_does_not_provide_point_in_time_instrument_history");
  }
  if (!allGuarantees) {
    for (const [field, guaranteed] of Object.entries(capability.guarantees)) {
      if (!guaranteed) {
        const reasonField = field.replace(
          /[A-Z]/gu,
          (character) => `_${character.toLowerCase()}`,
        );
        blockers.add(`instrument_capability_${reasonField}_not_guaranteed`);
      }
    }
  }
  if (
    capability.coverage.startedAt === null ||
    capability.coverage.endedAt === null
  ) {
    blockers.add("instrument_capability_coverage_window_unproven");
  }
  if (capability.documentation.some(
    (item) => item.captureStatus !== "HASHED_CONTENT_CAPTURED",
  )) {
    blockers.add("instrument_capability_evidence_not_immutably_captured");
  }
  if (
    capability.sourceClass === "LICENSED_VENDOR" &&
    !capability.documentation.some(
      (item) => item.evidenceType === "CONTRACTUAL_CAPABILITY_SLA",
    )
  ) {
    blockers.add("licensed_instrument_source_capability_sla_missing");
  }
  if (
    capability.evidenceMode === "FIRST_PARTY_CONTINUOUS_CAPTURE" &&
    capability.captureStartedAt !== null &&
    capability.coverage.startedAt !== null &&
    Date.parse(capability.coverage.startedAt) <
      Date.parse(capability.captureStartedAt)
  ) {
    blockers.add("first_party_capture_claims_pre_capture_history");
  }

  const blockerReasonCodes = [...blockers].sort();
  return {
    assessmentStatus: blockerReasonCodes.length > 0
      ? "RESEARCH_ONLY"
      : capability.evidenceMode === "FIRST_PARTY_CONTINUOUS_CAPTURE"
        ? "FORWARD_ONLY_READY"
        : "HISTORICAL_READY",
    blockerReasonCodes,
  };
}

const HistoricalInstrumentCapabilityArtifactCoreSchema =
  CapabilityCoreSchema.extend({
    assessmentStatus: z.enum([
      "HISTORICAL_READY",
      "FORWARD_ONLY_READY",
      "RESEARCH_ONLY",
    ]),
    blockerReasonCodes: ReasonCodesSchema,
  });

export const M2HistoricalInstrumentCapabilityArtifactSchema =
  HistoricalInstrumentCapabilityArtifactCoreSchema.extend({
    capabilityArtifactId: NonEmptyStringSchema,
    capabilityDigest: DigestSchema,
  }).superRefine((capability, context) => {
    const {
      capabilityArtifactId,
      capabilityDigest,
      assessmentStatus,
      blockerReasonCodes,
      ...capabilityCore
    } = capability;
    const derived = deriveCapabilityAssessment(capabilityCore);
    if (
      assessmentStatus !== derived.assessmentStatus ||
      JSON.stringify(blockerReasonCodes) !==
        JSON.stringify(derived.blockerReasonCodes)
    ) {
      context.addIssue({
        code: "custom",
        message: "instrument capability assessment does not match evidence",
        path: ["assessmentStatus"],
      });
    }
    if (
      capability.assessmentStatus !== "RESEARCH_ONLY" &&
      capability.blockerReasonCodes.length > 0
    ) {
      context.addIssue({
        code: "custom",
        message: "ready instrument capability cannot retain blockers",
        path: ["assessmentStatus"],
      });
    }
    const core = {
      ...capabilityCore,
      assessmentStatus,
      blockerReasonCodes,
    };
    const expectedDigest = stableContentHash(core);
    if (capabilityDigest !== expectedDigest) {
      context.addIssue({
        code: "custom",
        message: "instrument capability digest mismatch",
        path: ["capabilityDigest"],
      });
    }
    if (
      capabilityArtifactId !==
        `historical-instrument-capability:${expectedDigest.slice("sha256:".length)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "instrument capability identity mismatch",
        path: ["capabilityArtifactId"],
      });
    }
  });

export type M2HistoricalInstrumentCapabilityArtifact = z.infer<
  typeof M2HistoricalInstrumentCapabilityArtifactSchema
>;

export function buildM2HistoricalInstrumentCapabilityArtifact(
  rawCore: z.input<typeof CapabilityCoreSchema>,
): M2HistoricalInstrumentCapabilityArtifact {
  const capability = CapabilityCoreSchema.parse(rawCore);
  const { assessmentStatus, blockerReasonCodes } =
    deriveCapabilityAssessment(capability);
  const core = HistoricalInstrumentCapabilityArtifactCoreSchema.parse({
    ...capability,
    assessmentStatus,
    blockerReasonCodes,
  });
  const capabilityDigest = stableContentHash(core);
  return deepFreezeArtifact(
    M2HistoricalInstrumentCapabilityArtifactSchema.parse({
      ...core,
      capabilityArtifactId:
        `historical-instrument-capability:${capabilityDigest.slice("sha256:".length)}`,
      capabilityDigest,
    }),
  );
}

const StatusIntervalSchema = z.strictObject({
  status: z.enum([
    "PREOPEN",
    "TRADING",
    "SUSPENDED",
    "DELISTING",
    "DELISTED",
    "SETTLED",
    "UNKNOWN",
  ]),
  effectiveFrom: IsoDateTimeSchema,
  effectiveTo: IsoDateTimeSchema.nullable(),
  knowledgeAt: IsoDateTimeSchema,
  sourceRecordId: NonEmptyStringSchema,
  evidenceDigest: DigestSchema,
}).superRefine((interval, context) => {
  if (
    interval.effectiveTo !== null &&
    Date.parse(interval.effectiveTo) <= Date.parse(interval.effectiveFrom)
  ) {
    context.addIssue({
      code: "custom",
      message: "instrument status interval must have positive duration",
      path: ["effectiveTo"],
    });
  }
});

const InstrumentRecordCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_HISTORICAL_INSTRUMENT_RECORD_VERSION),
  sourceCapabilityId: NonEmptyStringSchema,
  sourceCapabilityDigest: DigestSchema,
  providerId: NonEmptyStringSchema,
  venue: z.enum(TARGET_VENUES),
  providerInstrumentKey: NonEmptyStringSchema,
  providerSymbol: NonEmptyStringSchema,
  historicalInstrumentId: NonEmptyStringSchema,
  runtimeCanonicalInstrumentId: NonEmptyStringSchema.nullable(),
  identityEpoch: NonEmptyStringSchema,
  baseAsset: AssetCodeSchema.nullable(),
  quoteAsset: AssetCodeSchema.nullable(),
  settlementAsset: AssetCodeSchema.nullable(),
  settlementClass: z.enum(["STABLECOIN", "NON_STABLECOIN", "UNKNOWN"]),
  contractClass: z.enum([
    "LINEAR_STABLECOIN_SETTLED_PERPETUAL",
    "OTHER",
    "UNKNOWN",
  ]),
  contractSize: PositiveDecimalStringSchema.nullable(),
  underlyingClass: z.enum([
    "CRYPTO_ASSET",
    "TOKENIZED_NON_CRYPTO",
    "UNKNOWN",
  ]),
  onboardAt: IsoDateTimeSchema.nullable(),
  delistState: z.enum([
    "NOT_DELISTED_AS_OF_COVERAGE_END",
    "DELISTED_AT",
    "UNKNOWN",
  ]),
  delistAt: IsoDateTimeSchema.nullable(),
  identityKnownAt: IsoDateTimeSchema.nullable(),
  recordCoverageEndAt: IsoDateTimeSchema,
  sourceRecordIds: z.array(NonEmptyStringSchema).min(1),
  identityEvidenceDigests: z.array(DigestSchema).min(1),
  statusIntervals: z.array(StatusIntervalSchema).min(1),
  reasonCodes: ReasonCodesSchema,
}).superRefine((record, context) => {
  for (const [field, values] of [
    ["sourceRecordIds", record.sourceRecordIds],
    ["identityEvidenceDigests", record.identityEvidenceDigests],
    ["reasonCodes", record.reasonCodes],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: `historical instrument ${field} must be unique`,
        path: [field],
      });
    }
  }
  if (
    (record.delistState === "DELISTED_AT") !== (record.delistAt !== null)
  ) {
    context.addIssue({
      code: "custom",
      message: "historical instrument delist state and timestamp disagree",
      path: ["delistAt"],
    });
  }
  if (
    record.onboardAt !== null && record.delistAt !== null &&
    Date.parse(record.delistAt) <= Date.parse(record.onboardAt)
  ) {
    context.addIssue({
      code: "custom",
      message: "historical instrument delist must follow onboard time",
      path: ["delistAt"],
    });
  }
  if (
    record.identityKnownAt !== null &&
    Date.parse(record.identityKnownAt) > Date.parse(record.recordCoverageEndAt)
  ) {
    context.addIssue({
      code: "custom",
      message: "instrument identity cannot be learned after record coverage",
      path: ["identityKnownAt"],
    });
  }
  const intervals = record.statusIntervals;
  for (let index = 1; index < intervals.length; index += 1) {
    const previous = intervals[index - 1]!;
    const current = intervals[index]!;
    if (Date.parse(current.effectiveFrom) < Date.parse(previous.effectiveFrom)) {
      context.addIssue({
        code: "custom",
        message: "instrument status intervals must be ordered",
        path: ["statusIntervals", index, "effectiveFrom"],
      });
    }
    if (
      previous.effectiveTo === null ||
      Date.parse(current.effectiveFrom) < Date.parse(previous.effectiveTo)
    ) {
      context.addIssue({
        code: "custom",
        message: "instrument status intervals cannot overlap",
        path: ["statusIntervals", index, "effectiveFrom"],
      });
    }
  }
});

export const M2HistoricalInstrumentRecordSchema =
  InstrumentRecordCoreSchema.extend({
    recordArtifactId: NonEmptyStringSchema,
    recordDigest: DigestSchema,
  }).superRefine((record, context) => {
    const { recordArtifactId, recordDigest, ...core } = record;
    const expectedDigest = stableContentHash(core);
    if (recordDigest !== expectedDigest) {
      context.addIssue({
        code: "custom",
        message: "historical instrument record digest mismatch",
        path: ["recordDigest"],
      });
    }
    if (
      recordArtifactId !==
        `historical-instrument-record:${expectedDigest.slice("sha256:".length)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "historical instrument record identity mismatch",
        path: ["recordArtifactId"],
      });
    }
  });

export type M2HistoricalInstrumentRecord = z.infer<
  typeof M2HistoricalInstrumentRecordSchema
>;

export function buildM2HistoricalInstrumentRecord(
  rawCore: z.input<typeof InstrumentRecordCoreSchema>,
): M2HistoricalInstrumentRecord {
  const core = InstrumentRecordCoreSchema.parse(rawCore);
  const recordDigest = stableContentHash(core);
  return deepFreezeArtifact(M2HistoricalInstrumentRecordSchema.parse({
    ...core,
    recordArtifactId:
      `historical-instrument-record:${recordDigest.slice("sha256:".length)}`,
    recordDigest,
  }));
}

export type M2HistoricalEligibilityResolution = Readonly<{
  status: "ELIGIBLE" | "INELIGIBLE" | "UNRESOLVED";
  reasonCodes: readonly string[];
}>;

export function resolveM2HistoricalInstrumentEligibility(input: {
  capability: M2HistoricalInstrumentCapabilityArtifact;
  cutoffAt: string;
  record: M2HistoricalInstrumentRecord;
}): M2HistoricalEligibilityResolution {
  const capability = M2HistoricalInstrumentCapabilityArtifactSchema.parse(
    input.capability,
  );
  const record = M2HistoricalInstrumentRecordSchema.parse(input.record);
  const cutoffAt = IsoDateTimeSchema.parse(input.cutoffAt);
  const cutoffMs = Date.parse(cutoffAt);
  const reasons = new Set<string>();
  let isBeforeOnboardAt = false;

  if (
    record.sourceCapabilityId !== capability.capabilityArtifactId ||
    record.sourceCapabilityDigest !== capability.capabilityDigest ||
    record.providerId !== capability.providerId
  ) {
    reasons.add("instrument_record_capability_binding_mismatch");
  }
  if (capability.assessmentStatus === "RESEARCH_ONLY") {
    reasons.add("instrument_source_not_point_in_time_qualified");
  }
  if (
    capability.coverage.startedAt === null ||
    capability.coverage.endedAt === null ||
    cutoffMs < Date.parse(capability.coverage.startedAt) ||
    cutoffMs > Date.parse(capability.coverage.endedAt)
  ) {
    reasons.add("instrument_cutoff_outside_source_coverage");
  }
  if (cutoffMs > Date.parse(record.recordCoverageEndAt)) {
    reasons.add("instrument_cutoff_outside_record_coverage");
  }
  if (record.onboardAt === null) {
    reasons.add("instrument_onboard_at_unknown");
  } else if (cutoffMs < Date.parse(record.onboardAt)) {
    isBeforeOnboardAt = true;
  }
  if (
    record.identityKnownAt === null ||
    cutoffMs < Date.parse(record.identityKnownAt)
  ) {
    reasons.add("instrument_identity_not_known_by_cutoff");
  }
  if (
    record.baseAsset === null ||
    record.quoteAsset === null ||
    record.settlementAsset === null ||
    record.contractClass === "UNKNOWN" ||
    record.contractSize === null ||
    record.underlyingClass === "UNKNOWN" ||
    record.settlementClass === "UNKNOWN" ||
    record.delistState === "UNKNOWN"
  ) {
    reasons.add("instrument_identity_fields_incomplete");
  }
  if (reasons.size > 0) {
    return deepFreezeArtifact({
      status: "UNRESOLVED",
      reasonCodes: [...reasons].sort(),
    });
  }
  if (isBeforeOnboardAt) {
    return deepFreezeArtifact({
      status: "INELIGIBLE",
      reasonCodes: ["instrument_not_yet_onboarded"],
    });
  }

  if (
    record.contractClass !== "LINEAR_STABLECOIN_SETTLED_PERPETUAL" ||
    record.settlementClass !== "STABLECOIN" ||
    record.underlyingClass !== "CRYPTO_ASSET"
  ) {
    return deepFreezeArtifact({
      status: "INELIGIBLE",
      reasonCodes: ["instrument_outside_target_contract_scope"],
    });
  }

  const interval = record.statusIntervals.find((candidate) =>
    Date.parse(candidate.effectiveFrom) <= cutoffMs &&
    (candidate.effectiveTo === null ||
      cutoffMs < Date.parse(candidate.effectiveTo))
  );
  if (interval === undefined) {
    return deepFreezeArtifact({
      status: "UNRESOLVED",
      reasonCodes: ["instrument_status_interval_missing_at_cutoff"],
    });
  }
  if (Date.parse(interval.knowledgeAt) > cutoffMs) {
    return deepFreezeArtifact({
      status: "UNRESOLVED",
      reasonCodes: ["instrument_status_not_known_by_cutoff"],
    });
  }
  if (interval.status === "UNKNOWN") {
    return deepFreezeArtifact({
      status: "UNRESOLVED",
      reasonCodes: ["instrument_status_unknown_at_cutoff"],
    });
  }
  return deepFreezeArtifact(interval.status === "TRADING"
    ? { status: "ELIGIBLE", reasonCodes: [] }
    : {
        status: "INELIGIBLE",
        reasonCodes: [`instrument_status_${interval.status.toLowerCase()}`],
      });
}

const DenominatorSchema = z.strictObject({
  mode: z.enum([
    "FULL_POINT_IN_TIME_INSTRUMENT_MANIFEST",
    "FULL_ARCHIVE_OBJECT_MANIFEST",
    "TECHNICAL_PILOT_ONLY",
  ]),
  manifestDigest: DigestSchema.nullable(),
  expectedInstruments: z.array(z.strictObject({
    providerInstrumentKey: NonEmptyStringSchema,
    providerSymbol: NonEmptyStringSchema,
  })),
}).superRefine((denominator, context) => {
  const keys = denominator.expectedInstruments.map(
    (item) => item.providerInstrumentKey,
  );
  if (new Set(keys).size !== keys.length) {
    context.addIssue({
      code: "custom",
      message: "historical instrument denominator keys must be unique",
      path: ["expectedInstruments"],
    });
  }
  if (
    denominator.mode === "FULL_POINT_IN_TIME_INSTRUMENT_MANIFEST" &&
    denominator.manifestDigest === null
  ) {
    context.addIssue({
      code: "custom",
      message: "full point-in-time denominator requires immutable evidence",
      path: ["manifestDigest"],
    });
  }
});

const CoverageRequestSchema = z.strictObject({
  schemaVersion: z.literal(M2_HISTORICAL_INSTRUMENT_COVERAGE_VERSION),
  generatedAt: IsoDateTimeSchema,
  requestedWindow: z.strictObject({
    startedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema,
  }),
  denominator: DenominatorSchema,
  capability: M2HistoricalInstrumentCapabilityArtifactSchema,
  records: z.array(M2HistoricalInstrumentRecordSchema),
}).superRefine((request, context) => {
  if (
    Date.parse(request.requestedWindow.startedAt) >=
      Date.parse(request.requestedWindow.endedAt)
  ) {
    context.addIssue({
      code: "custom",
      message: "historical instrument coverage window must be positive",
      path: ["requestedWindow"],
    });
  }
  if (
    Date.parse(request.generatedAt) < Date.parse(request.requestedWindow.endedAt)
  ) {
    context.addIssue({
      code: "custom",
      message: "historical instrument coverage cannot be generated before its window ends",
      path: ["generatedAt"],
    });
  }
});

const UnresolvedInstrumentSchema = z.strictObject({
  providerInstrumentKey: NonEmptyStringSchema,
  providerSymbol: NonEmptyStringSchema,
  reasonCodes: ReasonCodesSchema,
});

const CoverageArtifactCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_HISTORICAL_INSTRUMENT_COVERAGE_VERSION),
  generatedAt: IsoDateTimeSchema,
  requestedWindow: z.strictObject({
    startedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema,
  }),
  sourceCapabilityId: NonEmptyStringSchema,
  sourceCapabilityDigest: DigestSchema,
  sourceProviderId: NonEmptyStringSchema,
  denominatorMode: z.enum([
    "FULL_POINT_IN_TIME_INSTRUMENT_MANIFEST",
    "FULL_ARCHIVE_OBJECT_MANIFEST",
    "TECHNICAL_PILOT_ONLY",
  ]),
  denominatorManifestDigest: DigestSchema.nullable(),
  coverageStatus: z.enum(["READY", "BLOCKED"]),
  readyForCohortFreeze: z.boolean(),
  expectedInstrumentCount: z.number().int().nonnegative(),
  resolvedInstrumentCount: z.number().int().nonnegative(),
  unresolvedInstrumentCount: z.number().int().nonnegative(),
  resolvedInstrumentKeys: z.array(NonEmptyStringSchema),
  unresolvedInstruments: z.array(UnresolvedInstrumentSchema),
  recordDigests: z.array(DigestSchema),
  blockerReasonCodes: ReasonCodesSchema,
});

export const M2HistoricalInstrumentCoverageArtifactSchema =
  CoverageArtifactCoreSchema.extend({
    coverageArtifactId: NonEmptyStringSchema,
    coverageDigest: DigestSchema,
  }).superRefine((coverage, context) => {
    if (
      coverage.expectedInstrumentCount !==
        coverage.resolvedInstrumentCount + coverage.unresolvedInstrumentCount ||
      coverage.resolvedInstrumentCount !== coverage.resolvedInstrumentKeys.length ||
      coverage.unresolvedInstrumentCount !== coverage.unresolvedInstruments.length
    ) {
      context.addIssue({
        code: "custom",
        message: "historical instrument coverage accounting does not balance",
        path: ["expectedInstrumentCount"],
      });
    }
    if (
      coverage.coverageStatus === "READY" &&
      (!coverage.readyForCohortFreeze ||
        coverage.unresolvedInstrumentCount !== 0 ||
        coverage.blockerReasonCodes.length > 0 ||
        coverage.denominatorMode !==
          "FULL_POINT_IN_TIME_INSTRUMENT_MANIFEST")
    ) {
      context.addIssue({
        code: "custom",
        message: "ready historical coverage cannot retain gaps or a weak denominator",
        path: ["coverageStatus"],
      });
    }
    const { coverageArtifactId, coverageDigest, ...core } = coverage;
    const expectedDigest = stableContentHash(core);
    if (coverageDigest !== expectedDigest) {
      context.addIssue({
        code: "custom",
        message: "historical instrument coverage digest mismatch",
        path: ["coverageDigest"],
      });
    }
    if (
      coverageArtifactId !==
        `historical-instrument-coverage:${expectedDigest.slice("sha256:".length)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "historical instrument coverage identity mismatch",
        path: ["coverageArtifactId"],
      });
    }
  });

export type M2HistoricalInstrumentCoverageArtifact = z.infer<
  typeof M2HistoricalInstrumentCoverageArtifactSchema
>;

function instrumentRecordCoverageReasons(
  record: M2HistoricalInstrumentRecord,
  request: z.infer<typeof CoverageRequestSchema>,
): string[] {
  const reasons = new Set<string>();
  const capability = request.capability;
  const windowStart = Date.parse(request.requestedWindow.startedAt);
  const windowEnd = Date.parse(request.requestedWindow.endedAt);

  if (
    record.sourceCapabilityId !== capability.capabilityArtifactId ||
    record.sourceCapabilityDigest !== capability.capabilityDigest ||
    record.providerId !== capability.providerId
  ) {
    reasons.add("instrument_record_capability_binding_mismatch");
  }
  if (
    record.onboardAt === null ||
    record.identityKnownAt === null ||
    record.baseAsset === null ||
    record.quoteAsset === null ||
    record.settlementAsset === null ||
    record.contractClass === "UNKNOWN" ||
    record.contractSize === null ||
    record.underlyingClass === "UNKNOWN" ||
    record.settlementClass === "UNKNOWN" ||
    record.delistState === "UNKNOWN"
  ) {
    reasons.add("instrument_identity_fields_incomplete");
    return [...reasons].sort();
  }
  const onboardAt = Date.parse(record.onboardAt);
  if (onboardAt >= windowEnd ||
    (record.delistAt !== null && Date.parse(record.delistAt) <= windowStart)) {
    reasons.add("instrument_denominator_entry_outside_requested_window");
    return [...reasons].sort();
  }
  const requiredStart = Math.max(onboardAt, windowStart);
  if (Date.parse(record.identityKnownAt) > requiredStart) {
    reasons.add("instrument_identity_knowledge_gap");
  }
  if (Date.parse(record.recordCoverageEndAt) < windowEnd) {
    reasons.add("instrument_record_ends_before_requested_window");
  }

  let cursor = requiredStart;
  for (const interval of record.statusIntervals) {
    const from = Date.parse(interval.effectiveFrom);
    const to = interval.effectiveTo === null
      ? Number.POSITIVE_INFINITY
      : Date.parse(interval.effectiveTo);
    if (to <= requiredStart || from >= windowEnd) {
      continue;
    }
    const clippedFrom = Math.max(from, requiredStart);
    if (clippedFrom > cursor) {
      reasons.add("instrument_status_interval_gap");
    }
    const knowledgeDeadline = Math.max(from, windowStart);
    if (Date.parse(interval.knowledgeAt) > knowledgeDeadline) {
      reasons.add("instrument_status_knowledge_time_leakage");
    }
    if (interval.status === "UNKNOWN") {
      reasons.add("instrument_status_interval_unknown");
    }
    cursor = Math.max(cursor, Math.min(to, windowEnd));
  }
  if (cursor < windowEnd) {
    reasons.add("instrument_status_interval_gap");
  }

  if (record.delistState === "DELISTED_AT" && record.delistAt !== null) {
    const delistAt = Date.parse(record.delistAt);
    if (delistAt < windowEnd) {
      const postDelistTrading = record.statusIntervals.some((interval) =>
        interval.status === "TRADING" &&
        (interval.effectiveTo === null ||
          Date.parse(interval.effectiveTo) > delistAt)
      );
      const terminalStatus = record.statusIntervals.some((interval) =>
        ["DELISTED", "SETTLED"].includes(interval.status) &&
        Date.parse(interval.effectiveFrom) <= delistAt &&
        (interval.effectiveTo === null ||
          Date.parse(interval.effectiveTo) >= windowEnd)
      );
      if (postDelistTrading || !terminalStatus) {
        reasons.add("instrument_delist_status_inconsistent");
      }
    }
  } else if (
    record.delistState === "NOT_DELISTED_AS_OF_COVERAGE_END" &&
    record.statusIntervals.some((interval) =>
      ["DELISTED", "SETTLED"].includes(interval.status) &&
      Date.parse(interval.effectiveFrom) < windowEnd
    )
  ) {
    reasons.add("instrument_delist_status_inconsistent");
  }
  return [...reasons].sort();
}

export function buildM2HistoricalInstrumentCoverageArtifact(
  rawRequest: z.input<typeof CoverageRequestSchema>,
): M2HistoricalInstrumentCoverageArtifact {
  const request = CoverageRequestSchema.parse(rawRequest);
  const blockers = new Set<string>();
  const unresolvedInstruments: z.infer<typeof UnresolvedInstrumentSchema>[] = [];
  const resolvedInstrumentKeys: string[] = [];
  const expectedKeys = new Set(request.denominator.expectedInstruments.map(
    (item) => item.providerInstrumentKey,
  ));
  const recordsByKey = new Map<string, M2HistoricalInstrumentRecord>();

  if (
    request.denominator.mode !== "FULL_POINT_IN_TIME_INSTRUMENT_MANIFEST"
  ) {
    blockers.add("point_in_time_instrument_denominator_missing");
  }
  if (request.denominator.expectedInstruments.length === 0) {
    blockers.add("historical_instrument_denominator_empty");
  }
  if (request.capability.assessmentStatus === "RESEARCH_ONLY") {
    blockers.add("historical_instrument_source_not_qualified");
  }
  if (
    request.capability.coverage.startedAt === null ||
    request.capability.coverage.endedAt === null ||
    Date.parse(request.capability.coverage.startedAt) >
      Date.parse(request.requestedWindow.startedAt) ||
    Date.parse(request.capability.coverage.endedAt) <
      Date.parse(request.requestedWindow.endedAt)
  ) {
    blockers.add("historical_instrument_source_window_incomplete");
  }
  if (
    request.capability.assessmentStatus === "FORWARD_ONLY_READY" &&
    (request.capability.captureStartedAt === null ||
      Date.parse(request.requestedWindow.startedAt) <
        Date.parse(request.capability.captureStartedAt))
  ) {
    blockers.add("first_party_capture_cannot_backfill_requested_window");
  }

  for (const record of request.records) {
    if (recordsByKey.has(record.providerInstrumentKey)) {
      blockers.add("duplicate_historical_instrument_record_key");
    } else {
      recordsByKey.set(record.providerInstrumentKey, record);
    }
    if (!expectedKeys.has(record.providerInstrumentKey)) {
      blockers.add("historical_instrument_record_outside_denominator");
    }
  }

  const bySymbol = new Map<string, M2HistoricalInstrumentRecord[]>();
  for (const record of request.records) {
    const entries = bySymbol.get(record.providerSymbol) ?? [];
    entries.push(record);
    bySymbol.set(record.providerSymbol, entries);
  }
  for (const entries of bySymbol.values()) {
    const sorted = [...entries].sort((left, right) =>
      Date.parse(left.onboardAt ?? left.recordCoverageEndAt) -
      Date.parse(right.onboardAt ?? right.recordCoverageEndAt)
    );
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]!;
      const current = sorted[index]!;
      const previousEnd = previous.delistAt === null
        ? Number.POSITIVE_INFINITY
        : Date.parse(previous.delistAt);
      const currentStart = current.onboardAt === null
        ? Number.NEGATIVE_INFINITY
        : Date.parse(current.onboardAt);
      if (currentStart < previousEnd) {
        blockers.add("provider_symbol_identity_epochs_overlap");
      }
      if (
        previous.historicalInstrumentId === current.historicalInstrumentId ||
        previous.identityEpoch === current.identityEpoch
      ) {
        blockers.add("provider_symbol_reuse_not_epoch_disambiguated");
      }
    }
  }

  for (const expected of request.denominator.expectedInstruments) {
    const record = recordsByKey.get(expected.providerInstrumentKey);
    if (record === undefined) {
      unresolvedInstruments.push({
        providerInstrumentKey: expected.providerInstrumentKey,
        providerSymbol: expected.providerSymbol,
        reasonCodes: ["historical_instrument_record_missing"],
      });
      continue;
    }
    const reasons = instrumentRecordCoverageReasons(record, request);
    if (record.providerSymbol !== expected.providerSymbol) {
      reasons.push("historical_instrument_symbol_binding_mismatch");
    }
    const uniqueReasons = [...new Set(reasons)].sort();
    if (uniqueReasons.length > 0) {
      unresolvedInstruments.push({
        providerInstrumentKey: expected.providerInstrumentKey,
        providerSymbol: expected.providerSymbol,
        reasonCodes: uniqueReasons,
      });
    } else {
      resolvedInstrumentKeys.push(expected.providerInstrumentKey);
    }
  }

  if (unresolvedInstruments.length > 0) {
    blockers.add("historical_instrument_coverage_has_unresolved_entries");
  }
  const blockerReasonCodes = [...blockers].sort();
  const readyForCohortFreeze = blockerReasonCodes.length === 0;
  const core = CoverageArtifactCoreSchema.parse({
    schemaVersion: M2_HISTORICAL_INSTRUMENT_COVERAGE_VERSION,
    generatedAt: request.generatedAt,
    requestedWindow: request.requestedWindow,
    sourceCapabilityId: request.capability.capabilityArtifactId,
    sourceCapabilityDigest: request.capability.capabilityDigest,
    sourceProviderId: request.capability.providerId,
    denominatorMode: request.denominator.mode,
    denominatorManifestDigest: request.denominator.manifestDigest,
    coverageStatus: readyForCohortFreeze ? "READY" : "BLOCKED",
    readyForCohortFreeze,
    expectedInstrumentCount: request.denominator.expectedInstruments.length,
    resolvedInstrumentCount: resolvedInstrumentKeys.length,
    unresolvedInstrumentCount: unresolvedInstruments.length,
    resolvedInstrumentKeys: resolvedInstrumentKeys.sort(),
    unresolvedInstruments: unresolvedInstruments.sort((left, right) =>
      left.providerInstrumentKey.localeCompare(right.providerInstrumentKey)
    ),
    recordDigests: request.records.map((record) => record.recordDigest).sort(),
    blockerReasonCodes,
  });
  const coverageDigest = stableContentHash(core);
  return deepFreezeArtifact(M2HistoricalInstrumentCoverageArtifactSchema.parse({
    ...core,
    coverageArtifactId:
      `historical-instrument-coverage:${coverageDigest.slice("sha256:".length)}`,
    coverageDigest,
  }));
}
