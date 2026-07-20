import { z } from "zod";
import {
  M2_DRAFT_DETECTORS,
  M2_DRAFT_REPLAY_RULE_SET_DIGEST,
  M2_DRAFT_REPLAY_RULE_SET_VERSION,
  M2DraftReplayKernelInputSchema,
} from "../modules/detection/draft-replay-contract";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../modules/universe/stable-artifact";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  RatioSchema,
  ReasonCodesSchema,
} from "../runtime-schema/primitives";
import {
  EXPANSION_EVENT_LABEL_VERSION,
  EXPANSION_HORIZONS,
} from "./event-label-contract";

export const M2_HISTORICAL_REPLAY_DATASET_VERSION =
  "v2-m2-historical-replay-dataset.v1" as const;
export const M2_HISTORICAL_REPLAY_EXPERIMENT_VERSION =
  "v2-m2-historical-replay-experiment.v1" as const;
export const M2_HISTORICAL_REPLAY_HOLDOUT_ARTIFACT_VERSION =
  "v2-m2-historical-replay-holdout-artifact.v1" as const;
export const M2_HISTORICAL_REPLAY_GATE_VERSION =
  "v2-m2-historical-replay-gate.v1" as const;
export const M2_HISTORICAL_REPLAY_GATE_POLICY_VERSION =
  "v2-m2-historical-replay-gate-policy.v1" as const;

export const M2_HISTORICAL_REPLAY_DETECTOR_IDS = Object.freeze([
  M2_DRAFT_DETECTORS.PRE_MOVE_COMPRESSION.detectorId,
  M2_DRAFT_DETECTORS.PRE_MOVE_FLOW_DIVERGENCE.detectorId,
  M2_DRAFT_DETECTORS.PRE_MOVE_LIQUIDITY_SHIFT.detectorId,
  M2_DRAFT_DETECTORS.BREAKOUT_EDGE.detectorId,
  M2_DRAFT_DETECTORS.ROLE_FLIP_RETEST.detectorId,
] as const);

export type M2HistoricalReplayDetectorId =
  (typeof M2_HISTORICAL_REPLAY_DETECTOR_IDS)[number];

const M2_HISTORICAL_REPLAY_PRE_MOVE_DETECTOR_IDS = new Set<string>([
  M2_DRAFT_DETECTORS.PRE_MOVE_COMPRESSION.detectorId,
  M2_DRAFT_DETECTORS.PRE_MOVE_FLOW_DIVERGENCE.detectorId,
  M2_DRAFT_DETECTORS.PRE_MOVE_LIQUIDITY_SHIFT.detectorId,
]);

export const M2_HISTORICAL_REPLAY_GATE_POLICY = deepFreezeArtifact({
  schemaVersion: M2_HISTORICAL_REPLAY_GATE_POLICY_VERSION,
  authority: "INITIAL_BLUEPRINT_GATE_POLICY",
  confidenceLevel: 0.95,
  sampleMinimums: {
    candidateCount: 100,
    eventCount: 200,
    matchedNonEventCount: 200,
    eventCountPerRequiredStratum: 30,
    matchedNonEventCountPerRequiredStratum: 30,
  },
  dataQuality: {
    unavailableEventFractionMaximum: 0.05,
  },
  familyPolicies: {
    PRE_MOVE: {
      promotionThresholdsFrozen: true,
      eventRecallMinimum: 0.4,
      candidatePrecisionMinimum: 0.2,
      auditedBaselineRecall: 0.2353,
      requireRecallLowerBoundAboveBaseline: true,
      requireEventControlSeparation: true,
      lateNoiseRateMaximum: 0.3,
      requirePositiveMedianLeadTime: true,
    },
    BREAKOUT_RETEST: {
      promotionThresholdsFrozen: false,
      reasonCode: "breakout_retest_promotion_thresholds_not_frozen",
    },
  },
  topK: {
    k: 20,
    lateNoiseRateMaximum: 0.3,
    rankingEvidenceRequired: true,
  },
  thresholdSensitivityEvidenceRequired: true,
  untouchedHoldoutRequired: true,
  independentAuditRequiredForLifecycleMutation: true,
  lifecycleMutationAllowedByThisGate: false,
  candidateEmissionAllowedByThisGate: false,
} as const);

export const M2_HISTORICAL_REPLAY_GATE_POLICY_DIGEST = stableContentHash(
  M2_HISTORICAL_REPLAY_GATE_POLICY,
);

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const PositiveIntegerSchema = z.number().int().positive();
const DetectorIdSchema = z.enum(M2_HISTORICAL_REPLAY_DETECTOR_IDS);
const DatasetSplitSchema = z.enum(["TRAIN", "VALIDATION", "HOLDOUT"]);
const DirectionSchema = z.enum(["LONG", "SHORT"]);
const MarketRegimeSchema = z.enum([
  "TREND_UP",
  "TREND_DOWN",
  "RANGE",
  "HIGH_VOLATILITY",
  "MARKET_STRESS",
  "UNKNOWN",
]);
const LiquidityBucketSchema = z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]);

const SourceRightsSchema = z.strictObject({
  sourceRegistryId: NonEmptyStringSchema,
  providerId: NonEmptyStringSchema,
  capabilityId: NonEmptyStringSchema,
  sourceType: z.enum([
    "LICENSED_PROVIDER_ARCHIVE",
    "VENUE_PUBLIC_ARCHIVE",
    "FIRST_PARTY_CAPTURE",
    "SYNTHETIC_TEST_FIXTURE",
  ]),
  licenseReviewStatus: z.enum(["APPROVED", "REJECTED", "NOT_REVIEWED"]),
  retentionRight: z.enum(["GRANTED", "DENIED", "UNKNOWN"]),
  replayRight: z.enum(["GRANTED", "DENIED", "UNKNOWN"]),
  redistributionRight: z.enum([
    "GRANTED",
    "NOT_REQUIRED_PRIVATE_RESEARCH",
    "DENIED",
    "UNKNOWN",
  ]),
  reviewedAt: IsoDateTimeSchema.nullable(),
  evidenceDigest: DigestSchema.nullable(),
});

const RequiredStratumSchema = z.strictObject({
  opportunityFamily: z.enum(["PRE_MOVE", "BREAKOUT_RETEST"]),
  direction: DirectionSchema,
  marketRegime: MarketRegimeSchema,
  liquidityBucket: LiquidityBucketSchema,
});

export const M2HistoricalReplayCohortSummarySchema = z.strictObject({
  recordCount: PositiveIntegerSchema,
  eventCount: NonNegativeIntegerSchema,
  matchedNonEventCount: NonNegativeIntegerSchema,
  backgroundNonEventCount: NonNegativeIntegerSchema,
  instrumentCount: PositiveIntegerSchema,
  instrumentDayCount: PositiveIntegerSchema,
  evaluationWindowCount: PositiveIntegerSchema,
  underlyingGroupIdsDigest: DigestSchema,
}).superRefine((summary, context) => {
  if (
    summary.eventCount + summary.matchedNonEventCount +
      summary.backgroundNonEventCount !== summary.recordCount
  ) {
    context.addIssue({
      code: "custom",
      message: "cohort target counts must sum to its record count",
      path: ["recordCount"],
    });
  }
});

export type M2HistoricalReplayCohortSummary = z.infer<
  typeof M2HistoricalReplayCohortSummarySchema
>;

const HoldoutCustodySchema = z.discriminatedUnion("custodyMode", [
  z.strictObject({
    custodyMode: z.literal("INLINE_TEST_ONLY"),
    reasonCodes: ReasonCodesSchema.min(1),
  }),
  z.strictObject({
    custodyMode: z.literal("SEPARATE_IMMUTABLE_ARTIFACT"),
    artifactId: NonEmptyStringSchema,
    artifactDigest: DigestSchema,
    committedSummary: M2HistoricalReplayCohortSummarySchema,
    custodyPolicyId: NonEmptyStringSchema,
    custodyPolicyDigest: DigestSchema,
    custodianIdentity: NonEmptyStringSchema,
    readGrantPolicy: z.literal("SINGLE_USE_GATE_ONLY"),
  }),
]);

export const M2HistoricalReplayDatasetManifestSchema = z.strictObject({
  datasetKind: z.enum([
    "REAL_POINT_IN_TIME_HISTORICAL",
    "SYNTHETIC_CONTRACT_ONLY",
  ]),
  datasetName: NonEmptyStringSchema,
  frozenAt: IsoDateTimeSchema,
  eventLabelVersion: z.literal(EXPANSION_EVENT_LABEL_VERSION),
  detectorRuleSetVersion: z.literal(M2_DRAFT_REPLAY_RULE_SET_VERSION),
  detectorRuleSetDigest: z.literal(M2_DRAFT_REPLAY_RULE_SET_DIGEST),
  evaluatedDetectorIds: z.array(DetectorIdSchema).min(1),
  sourceRights: z.array(SourceRightsSchema).min(1),
  pointInTimeProof: z.strictObject({
    eventTimeComplete: z.boolean(),
    receivedAtComplete: z.boolean(),
    knowledgeCutoffComplete: z.boolean(),
    lineageComplete: z.boolean(),
    candidateUniverseCoverageComplete: z.boolean(),
    immutableSourcePayloadDigest: DigestSchema,
    sourceClockPolicyId: NonEmptyStringSchema,
  }),
  splitPolicy: z.strictObject({
    strategy: z.literal("PURGED_TIME_SYMBOL_REGIME_HOLDOUT"),
    purgeSeconds: PositiveIntegerSchema,
    embargoSeconds: PositiveIntegerSchema,
    assignmentFrozenAt: IsoDateTimeSchema,
    windows: z.tuple([
      z.strictObject({
        split: z.literal("TRAIN"),
        startedAt: IsoDateTimeSchema,
        endedAt: IsoDateTimeSchema,
      }),
      z.strictObject({
        split: z.literal("VALIDATION"),
        startedAt: IsoDateTimeSchema,
        endedAt: IsoDateTimeSchema,
      }),
      z.strictObject({
        split: z.literal("HOLDOUT"),
        startedAt: IsoDateTimeSchema,
        endedAt: IsoDateTimeSchema,
      }),
    ]),
    holdoutUnderlyingGroupIsolation: z.literal("GROUP_DISJOINT"),
    symbolAssignmentEvidenceDigest: DigestSchema,
    regimeAssignmentEvidenceDigest: DigestSchema,
    holdoutDimensions: z.array(z.enum(["TIME", "SYMBOL", "REGIME"]))
      .length(3),
  }),
  coverage: z.strictObject({
    startedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema,
    instrumentCount: PositiveIntegerSchema,
    instrumentDayCount: PositiveIntegerSchema,
    evaluationWindowCount: PositiveIntegerSchema,
  }),
  recordCounts: z.strictObject({
    train: NonNegativeIntegerSchema,
    validation: NonNegativeIntegerSchema,
    holdout: NonNegativeIntegerSchema,
    event: NonNegativeIntegerSchema,
    matchedNonEvent: NonNegativeIntegerSchema,
    backgroundNonEvent: NonNegativeIntegerSchema,
  }),
  requiredStrata: z.array(RequiredStratumSchema).min(1),
  registeredTrialIds: z.array(NonEmptyStringSchema).min(1),
  holdoutCustody: HoldoutCustodySchema,
}).superRefine((manifest, context) => {
  if (Date.parse(manifest.coverage.startedAt) >=
    Date.parse(manifest.coverage.endedAt)) {
    context.addIssue({
      code: "custom",
      message: "historical replay coverage must have positive duration",
      path: ["coverage", "endedAt"],
    });
  }
  if (Date.parse(manifest.frozenAt) < Date.parse(manifest.coverage.endedAt)) {
    context.addIssue({
      code: "custom",
      message: "dataset cannot freeze before its coverage closes",
      path: ["frozenAt"],
    });
  }
  if (Date.parse(manifest.splitPolicy.assignmentFrozenAt) >
    Date.parse(manifest.frozenAt)) {
    context.addIssue({
      code: "custom",
      message: "split assignment must be frozen before the dataset",
      path: ["splitPolicy", "assignmentFrozenAt"],
    });
  }
  const [train, validation, holdout] = manifest.splitPolicy.windows;
  for (const [index, window] of manifest.splitPolicy.windows.entries()) {
    if (Date.parse(window.startedAt) >= Date.parse(window.endedAt)) {
      context.addIssue({
        code: "custom",
        message: "historical replay split window must have positive duration",
        path: ["splitPolicy", "windows", index, "endedAt"],
      });
    }
  }
  const requiredGapMs = (
    manifest.splitPolicy.purgeSeconds + manifest.splitPolicy.embargoSeconds
  ) * 1_000;
  if (
    Date.parse(validation.startedAt) - Date.parse(train.endedAt) <
      requiredGapMs ||
    Date.parse(holdout.startedAt) - Date.parse(validation.endedAt) <
      requiredGapMs
  ) {
    context.addIssue({
      code: "custom",
      message: "split windows violate the frozen purge and embargo gap",
      path: ["splitPolicy", "windows"],
    });
  }
  if (
    Date.parse(train.startedAt) < Date.parse(manifest.coverage.startedAt) ||
    Date.parse(holdout.endedAt) > Date.parse(manifest.coverage.endedAt)
  ) {
    context.addIssue({
      code: "custom",
      message: "split windows must remain inside dataset coverage",
      path: ["splitPolicy", "windows"],
    });
  }
  if (
    new Set(manifest.splitPolicy.holdoutDimensions).size !== 3 ||
    !["TIME", "SYMBOL", "REGIME"].every((dimension) =>
      manifest.splitPolicy.holdoutDimensions.includes(
        dimension as "TIME" | "SYMBOL" | "REGIME",
      ))
  ) {
    context.addIssue({
      code: "custom",
      message: "holdout must preserve time, symbol and regime dimensions",
      path: ["splitPolicy", "holdoutDimensions"],
    });
  }
  for (const [field, values] of [
    ["registeredTrialIds", manifest.registeredTrialIds],
    ["evaluatedDetectorIds", manifest.evaluatedDetectorIds],
    [
      "requiredStrata",
      manifest.requiredStrata.map((stratum) =>
        `${stratum.opportunityFamily}:${stratum.direction}:${stratum.marketRegime}:${stratum.liquidityBucket}`),
    ],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: `historical replay ${field} must be unique`,
        path: [field],
      });
    }
  }
});

export type M2HistoricalReplayDatasetManifest = z.infer<
  typeof M2HistoricalReplayDatasetManifestSchema
>;

export const M2HistoricalReplayStepSchema = z.strictObject({
  stepId: NonEmptyStringSchema,
  eventCutoff: IsoDateTimeSchema,
  knowledgeCutoff: IsoDateTimeSchema,
  detectorInput: M2DraftReplayKernelInputSchema.nullable(),
  unavailableReasonCodes: ReasonCodesSchema,
}).superRefine((step, context) => {
  if (Date.parse(step.eventCutoff) > Date.parse(step.knowledgeCutoff)) {
    context.addIssue({
      code: "custom",
      message: "replay step event cutoff cannot exceed knowledge cutoff",
      path: ["eventCutoff"],
    });
  }
  if ((step.detectorInput === null) !==
    (step.unavailableReasonCodes.length > 0)) {
    context.addIssue({
      code: "custom",
      message: "replay step availability and reason codes disagree",
      path: ["unavailableReasonCodes"],
    });
  }
  if (step.detectorInput !== null) {
    if (
      Date.parse(step.detectorInput.detectorInput.eventCutoff) !==
        Date.parse(step.eventCutoff) ||
      Date.parse(step.detectorInput.detectorInput.knowledgeCutoff) !==
        Date.parse(step.knowledgeCutoff)
    ) {
      context.addIssue({
        code: "custom",
        message: "replay step and detector input cutoffs disagree",
        path: ["detectorInput", "detectorInput", "eventCutoff"],
      });
    }
  }
  if (new Set(step.unavailableReasonCodes).size !==
    step.unavailableReasonCodes.length) {
    context.addIssue({
      code: "custom",
      message: "replay step unavailable reasons must be unique",
      path: ["unavailableReasonCodes"],
    });
  }
});

const ExpansionEventTargetSchema = z.strictObject({
  targetKind: z.literal("EVENT"),
  eventId: NonEmptyStringSchema,
  horizon: z.enum(EXPANSION_HORIZONS),
  direction: DirectionSchema,
  eventStartAt: IsoDateTimeSchema,
  publicBreakoutAt: IsoDateTimeSchema,
  thresholdPercent: z.number().finite().positive(),
  stepOutcomeLabels: z.array(z.strictObject({
    stepId: NonEmptyStringSchema,
    moveConsumedFractionAtCutoff: RatioSchema,
  })).min(1),
  sourceFactIds: z.array(NonEmptyStringSchema).min(1),
}).superRefine((target, context) => {
  if (Date.parse(target.eventStartAt) > Date.parse(target.publicBreakoutAt)) {
    context.addIssue({
      code: "custom",
      message: "event start cannot exceed public breakout time",
      path: ["eventStartAt"],
    });
  }
  for (const [field, values] of [
    ["stepOutcomeLabels", target.stepOutcomeLabels.map((label) => label.stepId)],
    ["sourceFactIds", target.sourceFactIds],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: `event target ${field} must be unique`,
        path: [field],
      });
    }
  }
});

const MatchedNonEventTargetSchema = z.strictObject({
  targetKind: z.literal("MATCHED_NON_EVENT"),
  controlId: NonEmptyStringSchema,
  matchedEventId: NonEmptyStringSchema,
  matchedDirection: DirectionSchema,
  noExpansionConfirmedThrough: IsoDateTimeSchema,
  matchingPolicyId: NonEmptyStringSchema,
  sourceFactIds: z.array(NonEmptyStringSchema).min(1),
}).superRefine((target, context) => {
  if (new Set(target.sourceFactIds).size !== target.sourceFactIds.length) {
    context.addIssue({
      code: "custom",
      message: "matched non-event source facts must be unique",
      path: ["sourceFactIds"],
    });
  }
});

const BackgroundNonEventTargetSchema = z.strictObject({
  targetKind: z.literal("BACKGROUND_NON_EVENT"),
  backgroundWindowId: NonEmptyStringSchema,
  noExpansionConfirmedThrough: IsoDateTimeSchema,
  samplingPolicyId: NonEmptyStringSchema,
  sourceFactIds: z.array(NonEmptyStringSchema).min(1),
}).superRefine((target, context) => {
  if (new Set(target.sourceFactIds).size !== target.sourceFactIds.length) {
    context.addIssue({
      code: "custom",
      message: "background non-event source facts must be unique",
      path: ["sourceFactIds"],
    });
  }
});

export const M2HistoricalReplayRecordSchema = z.strictObject({
  recordId: NonEmptyStringSchema,
  split: DatasetSplitSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  underlyingGroupId: NonEmptyStringSchema,
  marketRegime: MarketRegimeSchema,
  liquidityBucket: LiquidityBucketSchema,
  detectorIds: z.array(DetectorIdSchema).min(1),
  replaySteps: z.array(M2HistoricalReplayStepSchema).min(1),
  target: z.discriminatedUnion("targetKind", [
    ExpansionEventTargetSchema,
    MatchedNonEventTargetSchema,
    BackgroundNonEventTargetSchema,
  ]),
  sourceRecordIds: z.array(NonEmptyStringSchema).min(1),
}).superRefine((record, context) => {
  for (const [field, values] of [
    ["detectorIds", record.detectorIds],
    ["replaySteps", record.replaySteps.map((step) => step.stepId)],
    ["sourceRecordIds", record.sourceRecordIds],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: `historical replay record ${field} must be unique`,
        path: [field],
      });
    }
  }
  for (let index = 1; index < record.replaySteps.length; index += 1) {
    if (
      Date.parse(record.replaySteps[index - 1]!.eventCutoff) >=
      Date.parse(record.replaySteps[index]!.eventCutoff)
    ) {
      context.addIssue({
        code: "custom",
        message: "replay steps must be strictly chronological",
        path: ["replaySteps", index, "eventCutoff"],
      });
    }
    if (
      Date.parse(record.replaySteps[index - 1]!.knowledgeCutoff) >=
      Date.parse(record.replaySteps[index]!.knowledgeCutoff)
    ) {
      context.addIssue({
        code: "custom",
        message: "replay knowledge cutoffs must be strictly chronological",
        path: ["replaySteps", index, "knowledgeCutoff"],
      });
    }
  }
  for (const [index, step] of record.replaySteps.entries()) {
    const input = step.detectorInput?.detectorInput;
    if (
      input !== undefined &&
      (input.canonicalInstrumentId !== record.canonicalInstrumentId ||
        input.underlyingGroupId !== record.underlyingGroupId)
    ) {
      context.addIssue({
        code: "custom",
        message: "replay record and detector input identity disagree",
        path: ["replaySteps", index, "detectorInput", "detectorInput"],
      });
    }
  }
  if (record.target.targetKind === "EVENT") {
    const stepIds = new Set(record.replaySteps.map((step) => step.stepId));
    const labelIds = new Set(record.target.stepOutcomeLabels.map(
      (label) => label.stepId,
    ));
    if (
      stepIds.size !== labelIds.size ||
      [...stepIds].some((stepId) => !labelIds.has(stepId))
    ) {
      context.addIssue({
        code: "custom",
        message: "event outcome labels must cover every replay step exactly once",
        path: ["target", "stepOutcomeLabels"],
      });
    }
  } else {
    const lastCutoff = Date.parse(
      record.replaySteps[record.replaySteps.length - 1]!.eventCutoff,
    );
    const confirmedThrough = Date.parse(
      record.target.noExpansionConfirmedThrough,
    );
    if (confirmedThrough - lastCutoff < 24 * 60 * 60 * 1_000) {
      context.addIssue({
        code: "custom",
        message: "non-event labels require a complete 24-hour future horizon",
        path: ["target", "noExpansionConfirmedThrough"],
      });
    }
  }
});

export type M2HistoricalReplayRecord = z.infer<
  typeof M2HistoricalReplayRecordSchema
>;

export function summarizeM2HistoricalReplayRecords(
  records: readonly M2HistoricalReplayRecord[],
): M2HistoricalReplayCohortSummary {
  const instrumentDays = new Set<string>();
  for (const record of records) {
    for (const step of record.replaySteps) {
      instrumentDays.add(
        `${record.canonicalInstrumentId}:${step.eventCutoff.slice(0, 10)}`,
      );
    }
  }
  const underlyingGroupIds = [...new Set(records.map(
    (record) => record.underlyingGroupId,
  ))].sort();
  return deepFreezeArtifact(M2HistoricalReplayCohortSummarySchema.parse({
    recordCount: records.length,
    eventCount: records.filter(
      (record) => record.target.targetKind === "EVENT",
    ).length,
    matchedNonEventCount: records.filter(
      (record) => record.target.targetKind === "MATCHED_NON_EVENT",
    ).length,
    backgroundNonEventCount: records.filter(
      (record) => record.target.targetKind === "BACKGROUND_NON_EVENT",
    ).length,
    instrumentCount: new Set(records.map(
      (record) => record.canonicalInstrumentId,
    )).size,
    instrumentDayCount: instrumentDays.size,
    evaluationWindowCount: records.reduce(
      (total, record) => total + record.replaySteps.length,
      0,
    ),
    underlyingGroupIdsDigest: stableContentHash({ underlyingGroupIds }),
  }));
}

const DatasetBundleCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_HISTORICAL_REPLAY_DATASET_VERSION),
  manifest: M2HistoricalReplayDatasetManifestSchema,
  records: z.array(M2HistoricalReplayRecordSchema).min(1),
});

function canonicalRecords(
  records: readonly M2HistoricalReplayRecord[],
): M2HistoricalReplayRecord[] {
  return [...records]
    .map((record) => ({
      ...record,
      detectorIds: [...record.detectorIds].sort(),
      replaySteps: [...record.replaySteps].sort((left, right) =>
        Date.parse(left.eventCutoff) - Date.parse(right.eventCutoff)),
    }))
    .sort((left, right) => left.recordId.localeCompare(right.recordId));
}

const HoldoutArtifactCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_HISTORICAL_REPLAY_HOLDOUT_ARTIFACT_VERSION),
  datasetName: NonEmptyStringSchema,
  frozenAt: IsoDateTimeSchema,
  eventLabelVersion: z.literal(EXPANSION_EVENT_LABEL_VERSION),
  detectorRuleSetVersion: z.literal(M2_DRAFT_REPLAY_RULE_SET_VERSION),
  detectorRuleSetDigest: z.literal(M2_DRAFT_REPLAY_RULE_SET_DIGEST),
  evaluatedDetectorIds: z.array(DetectorIdSchema).min(1),
  splitWindow: z.strictObject({
    startedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema,
  }),
  records: z.array(M2HistoricalReplayRecordSchema).min(1),
}).superRefine((artifact, context) => {
  if (Date.parse(artifact.splitWindow.startedAt) >=
    Date.parse(artifact.splitWindow.endedAt)) {
    context.addIssue({
      code: "custom",
      message: "holdout artifact window must have positive duration",
      path: ["splitWindow", "endedAt"],
    });
  }
  if (Date.parse(artifact.frozenAt) < Date.parse(artifact.splitWindow.endedAt)) {
    context.addIssue({
      code: "custom",
      message: "sealed holdout cannot freeze before its window closes",
      path: ["frozenAt"],
    });
  }
  const recordIds = new Set<string>();
  const eventIds = new Set<string>();
  const controlIds = new Set<string>();
  const eventIdsBySplit = new Set<string>();
  if (
    new Set(artifact.evaluatedDetectorIds).size !==
      artifact.evaluatedDetectorIds.length
  ) {
    context.addIssue({
      code: "custom",
      message: "sealed holdout Detector set must be unique",
      path: ["evaluatedDetectorIds"],
    });
  }
  const evaluatedDetectorIds = [...artifact.evaluatedDetectorIds].sort();
  for (const [recordIndex, record] of artifact.records.entries()) {
    if (record.split !== "HOLDOUT") {
      context.addIssue({
        code: "custom",
        message: "sealed holdout artifact may contain only HOLDOUT records",
        path: ["records", recordIndex, "split"],
      });
    }
    if (recordIds.has(record.recordId)) {
      context.addIssue({
        code: "custom",
        message: "sealed holdout record identities must be unique",
        path: ["records", recordIndex, "recordId"],
      });
    }
    recordIds.add(record.recordId);
    if (
      JSON.stringify([...record.detectorIds].sort()) !==
        JSON.stringify(evaluatedDetectorIds)
    ) {
      context.addIssue({
        code: "custom",
        message: "every sealed replay record must run the frozen Detector set",
        path: ["records", recordIndex, "detectorIds"],
      });
    }
    if (record.target.targetKind === "EVENT") {
      if (eventIds.has(record.target.eventId)) {
        context.addIssue({
          code: "custom",
          message: "sealed holdout event identities must be unique",
          path: ["records", recordIndex, "target", "eventId"],
        });
      }
      eventIds.add(record.target.eventId);
      eventIdsBySplit.add(record.target.eventId);
    }
    if (record.target.targetKind === "MATCHED_NON_EVENT") {
      if (controlIds.has(record.target.controlId)) {
        context.addIssue({
          code: "custom",
          message: "sealed holdout control identities must be unique",
          path: ["records", recordIndex, "target", "controlId"],
        });
      }
      controlIds.add(record.target.controlId);
    }
    for (const [stepIndex, step] of record.replaySteps.entries()) {
      const cutoff = Date.parse(step.eventCutoff);
      const knowledgeCutoff = Date.parse(step.knowledgeCutoff);
      if (
        cutoff < Date.parse(artifact.splitWindow.startedAt) ||
        cutoff > Date.parse(artifact.splitWindow.endedAt)
      ) {
        context.addIssue({
          code: "custom",
          message: "sealed holdout replay step is outside its frozen window",
          path: ["records", recordIndex, "replaySteps", stepIndex, "eventCutoff"],
        });
      }
      if (
        knowledgeCutoff < Date.parse(artifact.splitWindow.startedAt) ||
        knowledgeCutoff > Date.parse(artifact.splitWindow.endedAt) ||
        knowledgeCutoff > Date.parse(artifact.frozenAt)
      ) {
        context.addIssue({
          code: "custom",
          message: "sealed holdout knowledge cutoff is outside its frozen window",
          path: ["records", recordIndex, "replaySteps", stepIndex, "knowledgeCutoff"],
        });
      }
    }
    const targetCompleteAt = record.target.targetKind === "EVENT"
      ? Date.parse(record.target.publicBreakoutAt)
      : Date.parse(record.target.noExpansionConfirmedThrough);
    if (targetCompleteAt > Date.parse(artifact.frozenAt)) {
      context.addIssue({
        code: "custom",
        message: "sealed holdout target was incomplete when the artifact froze",
        path: ["records", recordIndex, "target"],
      });
    }
  }
  for (const [recordIndex, record] of artifact.records.entries()) {
    if (
      record.target.targetKind === "MATCHED_NON_EVENT" &&
      !eventIdsBySplit.has(record.target.matchedEventId)
    ) {
      context.addIssue({
        code: "custom",
        message: "sealed matched non-event must reference a sealed holdout event",
        path: ["records", recordIndex, "target", "matchedEventId"],
      });
    }
  }
});

function holdoutArtifactContent(
  input: z.infer<typeof HoldoutArtifactCoreSchema>,
) {
  return {
    schemaVersion: input.schemaVersion,
    datasetName: input.datasetName,
    frozenAt: input.frozenAt,
    eventLabelVersion: input.eventLabelVersion,
    detectorRuleSetVersion: input.detectorRuleSetVersion,
    detectorRuleSetDigest: input.detectorRuleSetDigest,
    evaluatedDetectorIds: [...input.evaluatedDetectorIds].sort(),
    splitWindow: input.splitWindow,
    records: canonicalRecords(input.records),
  };
}

export const M2HistoricalReplayHoldoutArtifactSchema =
  HoldoutArtifactCoreSchema.extend({
    summary: M2HistoricalReplayCohortSummarySchema,
    artifactDigest: DigestSchema,
    artifactId: NonEmptyStringSchema,
  }).superRefine((artifact, context) => {
    const content = holdoutArtifactContent(artifact);
    const expectedDigest = stableContentHash(content);
    if (artifact.artifactDigest !== expectedDigest) {
      context.addIssue({
        code: "custom",
        message: "sealed holdout artifact content digest mismatch",
        path: ["artifactDigest"],
      });
    }
    if (
      artifact.artifactId !==
        `historical-replay-holdout:${expectedDigest.slice("sha256:".length)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "sealed holdout artifact identity mismatch",
        path: ["artifactId"],
      });
    }
    const expectedSummary = summarizeM2HistoricalReplayRecords(
      artifact.records,
    );
    if (stableContentHash(artifact.summary) !== stableContentHash(expectedSummary)) {
      context.addIssue({
        code: "custom",
        message: "sealed holdout artifact summary mismatch",
        path: ["summary"],
      });
    }
    if (
      artifact.summary.eventCount === 0 ||
      artifact.summary.matchedNonEventCount === 0 ||
      artifact.summary.backgroundNonEventCount === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "sealed holdout requires event, matched-control and background records",
        path: ["summary"],
      });
    }
  });

export type M2HistoricalReplayHoldoutArtifact = z.infer<
  typeof M2HistoricalReplayHoldoutArtifactSchema
>;

export function buildM2HistoricalReplayHoldoutArtifact(
  rawCore: z.input<typeof HoldoutArtifactCoreSchema>,
): M2HistoricalReplayHoldoutArtifact {
  const core = HoldoutArtifactCoreSchema.parse(rawCore);
  const canonicalCore = holdoutArtifactContent(core);
  const artifactDigest = stableContentHash(canonicalCore);
  return deepFreezeArtifact(M2HistoricalReplayHoldoutArtifactSchema.parse({
    ...canonicalCore,
    summary: summarizeM2HistoricalReplayRecords(canonicalCore.records),
    artifactDigest,
    artifactId:
      `historical-replay-holdout:${artifactDigest.slice("sha256:".length)}`,
  }));
}

function datasetContent(input: z.infer<typeof DatasetBundleCoreSchema>) {
  return {
    schemaVersion: input.schemaVersion,
    manifest: input.manifest,
    records: canonicalRecords(input.records),
  };
}

export const M2HistoricalReplayDatasetBundleSchema = DatasetBundleCoreSchema
  .extend({
    datasetSnapshotId: NonEmptyStringSchema,
    datasetContentDigest: DigestSchema,
  })
  .superRefine((dataset, context) => {
    const expectedDigest = stableContentHash(datasetContent(dataset));
    if (dataset.datasetContentDigest !== expectedDigest) {
      context.addIssue({
        code: "custom",
        message: "historical replay dataset content digest mismatch",
        path: ["datasetContentDigest"],
      });
    }
    const expectedId =
      `historical-replay-dataset:${expectedDigest.slice("sha256:".length)}`;
    if (dataset.datasetSnapshotId !== expectedId) {
      context.addIssue({
        code: "custom",
        message: "historical replay dataset identity mismatch",
        path: ["datasetSnapshotId"],
      });
    }
    const recordIds = dataset.records.map((record) => record.recordId);
    if (new Set(recordIds).size !== recordIds.length) {
      context.addIssue({
        code: "custom",
        message: "historical replay record identities must be unique",
        path: ["records"],
      });
    }
    const eventRecords = dataset.records.filter(
      (record) => record.target.targetKind === "EVENT",
    );
    const eventIds = eventRecords.map((record) =>
      record.target.targetKind === "EVENT" ? record.target.eventId : "");
    if (new Set(eventIds).size !== eventIds.length) {
      context.addIssue({
        code: "custom",
        message: "historical replay event identities must be unique",
        path: ["records"],
      });
    }
    const controls = dataset.records.filter(
      (record) => record.target.targetKind === "MATCHED_NON_EVENT",
    );
    const backgroundNonEvents = dataset.records.filter(
      (record) => record.target.targetKind === "BACKGROUND_NON_EVENT",
    );
    const controlIds = controls.map((record) =>
      record.target.targetKind === "MATCHED_NON_EVENT"
        ? record.target.controlId
        : "");
    if (new Set(controlIds).size !== controlIds.length) {
      context.addIssue({
        code: "custom",
        message: "historical replay control identities must be unique",
        path: ["records"],
      });
    }
    const eventSplitById = new Map(eventRecords.map((record) => [
      record.target.targetKind === "EVENT" ? record.target.eventId : "",
      record.split,
    ]));
    for (const [index, control] of controls.entries()) {
      if (
        control.target.targetKind === "MATCHED_NON_EVENT" &&
        eventSplitById.get(control.target.matchedEventId) !== control.split
      ) {
        context.addIssue({
          code: "custom",
          message: "matched non-event must reference an event in the same split",
          path: ["records", index, "target", "matchedEventId"],
        });
      }
    }
    const actualCounts = {
      train: dataset.records.filter((record) => record.split === "TRAIN").length,
      validation: dataset.records.filter(
        (record) => record.split === "VALIDATION",
      ).length,
      holdout: dataset.records.filter((record) => record.split === "HOLDOUT").length,
      event: eventRecords.length,
      matchedNonEvent: controls.length,
      backgroundNonEvent: backgroundNonEvents.length,
    };
    const custody = dataset.manifest.holdoutCustody;
    const sealedSummary = custody.custodyMode ===
      "SEPARATE_IMMUTABLE_ARTIFACT"
      ? custody.committedSummary
      : null;
    if (sealedSummary !== null && actualCounts.holdout !== 0) {
      context.addIssue({
        code: "custom",
        message: "separately custodied holdout records cannot be inline",
        path: ["records"],
      });
    }
    const expectedCounts = {
      train: actualCounts.train,
      validation: actualCounts.validation,
      holdout: sealedSummary?.recordCount ?? actualCounts.holdout,
      event: actualCounts.event + (sealedSummary?.eventCount ?? 0),
      matchedNonEvent: actualCounts.matchedNonEvent +
        (sealedSummary?.matchedNonEventCount ?? 0),
      backgroundNonEvent: actualCounts.backgroundNonEvent +
        (sealedSummary?.backgroundNonEventCount ?? 0),
    };
    for (const field of Object.keys(expectedCounts) as
      (keyof typeof expectedCounts)[]) {
      if (dataset.manifest.recordCounts[field] !== expectedCounts[field]) {
        context.addIssue({
          code: "custom",
          message: `historical replay ${field} record count mismatch`,
          path: ["manifest", "recordCounts", field],
        });
      }
    }
    const evaluationWindowCount = dataset.records.reduce(
      (total, record) => total + record.replaySteps.length,
      0,
    ) + (sealedSummary?.evaluationWindowCount ?? 0);
    if (dataset.manifest.coverage.evaluationWindowCount !==
      evaluationWindowCount) {
      context.addIssue({
        code: "custom",
        message: "historical replay evaluation-window count mismatch",
        path: ["manifest", "coverage", "evaluationWindowCount"],
      });
    }
    const coverageStart = Date.parse(dataset.manifest.coverage.startedAt);
    const coverageEnd = Date.parse(dataset.manifest.coverage.endedAt);
    const frozenAt = Date.parse(dataset.manifest.frozenAt);
    const splitWindows = new Map(dataset.manifest.splitPolicy.windows.map(
      (window) => [window.split, window],
    ));
    for (const [recordIndex, record] of dataset.records.entries()) {
      const splitWindow = splitWindows.get(record.split)!;
      for (const [stepIndex, step] of record.replaySteps.entries()) {
        const cutoff = Date.parse(step.eventCutoff);
        const knowledgeCutoff = Date.parse(step.knowledgeCutoff);
        if (cutoff < coverageStart || cutoff > coverageEnd) {
          context.addIssue({
            code: "custom",
            message: "replay step is outside frozen dataset coverage",
            path: ["records", recordIndex, "replaySteps", stepIndex, "eventCutoff"],
          });
        }
        if (
          cutoff < Date.parse(splitWindow.startedAt) ||
          cutoff > Date.parse(splitWindow.endedAt)
        ) {
          context.addIssue({
            code: "custom",
            message: "replay step is outside its frozen split window",
            path: ["records", recordIndex, "replaySteps", stepIndex, "eventCutoff"],
          });
        }
        if (
          knowledgeCutoff < Date.parse(splitWindow.startedAt) ||
          knowledgeCutoff > Date.parse(splitWindow.endedAt) ||
          knowledgeCutoff > frozenAt
        ) {
          context.addIssue({
            code: "custom",
            message: "replay knowledge cutoff is outside its frozen split window",
            path: ["records", recordIndex, "replaySteps", stepIndex, "knowledgeCutoff"],
          });
        }
      }
      const targetCompleteAt = record.target.targetKind === "EVENT"
        ? Date.parse(record.target.publicBreakoutAt)
        : Date.parse(record.target.noExpansionConfirmedThrough);
      if (targetCompleteAt > frozenAt) {
        context.addIssue({
          code: "custom",
          message: "historical target was not complete when the dataset froze",
          path: ["records", recordIndex, "target"],
        });
      }
    }
    const holdoutGroups = new Set(dataset.records
      .filter((record) => record.split === "HOLDOUT")
      .map((record) => record.underlyingGroupId));
    const preHoldoutGroups = new Set(dataset.records
      .filter((record) => record.split !== "HOLDOUT")
      .map((record) => record.underlyingGroupId));
    if ([...holdoutGroups].some((groupId) => preHoldoutGroups.has(groupId))) {
      context.addIssue({
        code: "custom",
        message: "holdout underlying groups must be disjoint from earlier splits",
        path: ["records"],
      });
    }
    const uniqueInstrumentCount = new Set(dataset.records.map(
      (record) => record.canonicalInstrumentId,
    )).size + (sealedSummary?.instrumentCount ?? 0);
    if (dataset.manifest.coverage.instrumentCount !== uniqueInstrumentCount) {
      context.addIssue({
        code: "custom",
        message: "historical replay instrument count mismatch",
        path: ["manifest", "coverage", "instrumentCount"],
      });
    }
    const visibleInstrumentDays = new Set(dataset.records.flatMap((record) =>
      record.replaySteps.map((step) =>
        `${record.canonicalInstrumentId}:${step.eventCutoff.slice(0, 10)}`),
    )).size;
    if (
      dataset.manifest.coverage.instrumentDayCount !==
        visibleInstrumentDays + (sealedSummary?.instrumentDayCount ?? 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "historical replay instrument-day count mismatch",
        path: ["manifest", "coverage", "instrumentDayCount"],
      });
    }
    const requiredStrata = new Set(dataset.manifest.requiredStrata.map(
      (stratum) =>
        `${stratum.opportunityFamily}:${stratum.direction}:${stratum.marketRegime}:${stratum.liquidityBucket}`,
    ));
    const evaluatedDetectorIds = [...dataset.manifest.evaluatedDetectorIds]
      .sort();
    for (const [recordIndex, record] of dataset.records.entries()) {
      if (
        JSON.stringify([...record.detectorIds].sort()) !==
          JSON.stringify(evaluatedDetectorIds)
      ) {
        context.addIssue({
          code: "custom",
          message: "every replay record must run the frozen Detector set",
          path: ["records", recordIndex, "detectorIds"],
        });
      }
      const direction = record.target.targetKind === "EVENT"
        ? record.target.direction
        : record.target.targetKind === "MATCHED_NON_EVENT"
          ? record.target.matchedDirection
          : null;
      if (direction === null) {
        continue;
      }
      const families = new Set(record.detectorIds.map((detectorId) =>
        M2_HISTORICAL_REPLAY_PRE_MOVE_DETECTOR_IDS.has(detectorId)
          ? "PRE_MOVE"
          : "BREAKOUT_RETEST"));
      for (const family of families) {
        const key =
          `${family}:${direction}:${record.marketRegime}:${record.liquidityBucket}`;
        if (!requiredStrata.has(key)) {
          context.addIssue({
            code: "custom",
            message: "event and matched-control strata cannot be omitted",
            path: ["records", recordIndex],
          });
        }
      }
    }
  });

export type M2HistoricalReplayDatasetBundle = z.infer<
  typeof M2HistoricalReplayDatasetBundleSchema
>;

export function buildM2HistoricalReplayDataset(
  rawCore: z.input<typeof DatasetBundleCoreSchema>,
): M2HistoricalReplayDatasetBundle {
  const core = DatasetBundleCoreSchema.parse(rawCore);
  const canonicalCore = datasetContent(core);
  const datasetContentDigest = stableContentHash(canonicalCore);
  return deepFreezeArtifact(M2HistoricalReplayDatasetBundleSchema.parse({
    ...canonicalCore,
    datasetSnapshotId:
      `historical-replay-dataset:${datasetContentDigest.slice("sha256:".length)}`,
    datasetContentDigest,
  }));
}

const TrialSchema = z.strictObject({
  trialId: NonEmptyStringSchema,
  role: z.enum(["BASELINE", "SENSITIVITY"]),
  registeredAt: IsoDateTimeSchema,
  parameterSetDigest: DigestSchema,
});

const TopKReplayEvidenceSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("UNAVAILABLE"),
    reasonCodes: ReasonCodesSchema.min(1),
  }),
  z.strictObject({
    status: z.literal("VERIFIED"),
    k: z.literal(20),
    candidateCount: NonNegativeIntegerSchema,
    lateNoiseCount: NonNegativeIntegerSchema,
    lateNoiseRate: RatioSchema.nullable(),
    rankingPolicyDigest: DigestSchema,
    evidenceDigest: DigestSchema,
  }).superRefine((evidence, context) => {
    if (evidence.candidateCount > evidence.k) {
      context.addIssue({
        code: "custom",
        message: "Top-K evidence cannot contain more than K candidates",
        path: ["candidateCount"],
      });
    }
    if (evidence.lateNoiseCount > evidence.candidateCount) {
      context.addIssue({
        code: "custom",
        message: "Top-K late/noise count cannot exceed candidates",
        path: ["lateNoiseCount"],
      });
    }
    const expectedRate = evidence.candidateCount === 0
      ? null
      : evidence.lateNoiseCount / evidence.candidateCount;
    if (
      expectedRate === null
        ? evidence.lateNoiseRate !== null
        : evidence.lateNoiseRate === null ||
          Math.abs(evidence.lateNoiseRate - expectedRate) > 1e-12
    ) {
      context.addIssue({
        code: "custom",
        message: "Top-K late/noise rate does not match its denominator",
        path: ["lateNoiseRate"],
      });
    }
  }),
]);

const SensitivityEvidenceSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("NOT_RUN"),
    reasonCodes: ReasonCodesSchema.min(1),
  }),
  z.strictObject({
    status: z.enum(["PASS", "FAIL"]),
    registeredTrialIds: z.array(NonEmptyStringSchema).min(1),
    reportedTrialIds: z.array(NonEmptyStringSchema).min(1),
    failedTrialIds: z.array(NonEmptyStringSchema),
    evidenceDigest: DigestSchema,
    reasonCodes: ReasonCodesSchema,
  }),
]);

export const M2HistoricalReplayExperimentSchema = z.strictObject({
  schemaVersion: z.literal(M2_HISTORICAL_REPLAY_EXPERIMENT_VERSION),
  experimentId: NonEmptyStringSchema,
  codeVersion: NonEmptyStringSchema,
  datasetSnapshotId: NonEmptyStringSchema,
  gatePolicyVersion: z.literal(M2_HISTORICAL_REPLAY_GATE_POLICY_VERSION),
  gatePolicyDigest: z.literal(M2_HISTORICAL_REPLAY_GATE_POLICY_DIGEST),
  detectorRuleSetDigest: z.literal(M2_DRAFT_REPLAY_RULE_SET_DIGEST),
  evaluationMode: z.enum([
    "CONTRACT_TEST_ONLY",
    "VALIDATION_REPLAY",
    "UNTOUCHED_HOLDOUT_GATE",
  ]),
  registeredAt: IsoDateTimeSchema,
  thresholdFrozenAt: IsoDateTimeSchema,
  holdoutOpenedAt: IsoDateTimeSchema.nullable(),
  holdoutAccessCount: NonNegativeIntegerSchema,
  holdoutAccessEvidence: z.strictObject({
    accessId: NonEmptyStringSchema,
    artifactId: NonEmptyStringSchema,
    artifactDigest: DigestSchema,
    custodianIdentity: NonEmptyStringSchema,
    openedAt: IsoDateTimeSchema,
    resultSealedAt: IsoDateTimeSchema,
    accessLedgerDigest: DigestSchema,
  }).nullable(),
  trials: z.array(TrialSchema).min(1),
  selectedBaselineTrialId: NonEmptyStringSchema,
  allTrialsReported: z.boolean(),
  sensitivityEvidence: SensitivityEvidenceSchema,
  topKReplayEvidence: TopKReplayEvidenceSchema,
}).superRefine((experiment, context) => {
  if (Date.parse(experiment.registeredAt) >
    Date.parse(experiment.thresholdFrozenAt)) {
    context.addIssue({
      code: "custom",
      message: "experiment must be registered before threshold freeze",
      path: ["registeredAt"],
    });
  }
  const trialIds = experiment.trials.map((trial) => trial.trialId);
  if (new Set(trialIds).size !== trialIds.length) {
    context.addIssue({
      code: "custom",
      message: "experiment trial identities must be unique",
      path: ["trials"],
    });
  }
  for (const [index, trial] of experiment.trials.entries()) {
    if (
      Date.parse(trial.registeredAt) < Date.parse(experiment.registeredAt) ||
      Date.parse(trial.registeredAt) > Date.parse(experiment.thresholdFrozenAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "every trial must be registered before threshold freeze",
        path: ["trials", index, "registeredAt"],
      });
    }
  }
  const baseline = experiment.trials.find(
    (trial) => trial.trialId === experiment.selectedBaselineTrialId,
  );
  if (
    baseline?.role !== "BASELINE" ||
    baseline.parameterSetDigest !== M2_DRAFT_REPLAY_RULE_SET_DIGEST
  ) {
    context.addIssue({
      code: "custom",
      message: "selected baseline must bind the frozen M2.1 rule set",
      path: ["selectedBaselineTrialId"],
    });
  }
  if (experiment.evaluationMode === "UNTOUCHED_HOLDOUT_GATE") {
    if (
      experiment.holdoutOpenedAt === null ||
      experiment.holdoutAccessCount !== 1 ||
      experiment.holdoutAccessEvidence === null ||
      Date.parse(experiment.thresholdFrozenAt) >
        Date.parse(experiment.holdoutOpenedAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "holdout Gate requires one post-freeze holdout access",
        path: ["holdoutOpenedAt"],
      });
    }
    if (
      experiment.holdoutAccessEvidence !== null &&
      (
        Date.parse(experiment.holdoutAccessEvidence.openedAt) !==
          Date.parse(experiment.holdoutOpenedAt!) ||
        Date.parse(experiment.holdoutAccessEvidence.openedAt) >
          Date.parse(experiment.holdoutAccessEvidence.resultSealedAt)
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "holdout access evidence has invalid times",
        path: ["holdoutAccessEvidence"],
      });
    }
  } else if (
    experiment.holdoutOpenedAt !== null ||
    experiment.holdoutAccessCount !== 0 ||
    experiment.holdoutAccessEvidence !== null
  ) {
    context.addIssue({
      code: "custom",
      message: "non-holdout replay cannot claim holdout access",
      path: ["holdoutAccessCount"],
    });
  }
  if (experiment.sensitivityEvidence.status !== "NOT_RUN") {
    for (const [field, values] of [
      [
        "registeredTrialIds",
        experiment.sensitivityEvidence.registeredTrialIds,
      ],
      ["reportedTrialIds", experiment.sensitivityEvidence.reportedTrialIds],
      ["failedTrialIds", experiment.sensitivityEvidence.failedTrialIds],
    ] as const) {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: "custom",
          message: `sensitivity ${field} must be unique`,
          path: ["sensitivityEvidence", field],
        });
      }
    }
    const reported = new Set(experiment.sensitivityEvidence.reportedTrialIds);
    if (experiment.sensitivityEvidence.failedTrialIds.some(
      (trialId) => !reported.has(trialId),
    )) {
      context.addIssue({
        code: "custom",
        message: "failed sensitivity trials must also be reported",
        path: ["sensitivityEvidence", "failedTrialIds"],
      });
    }
    if (
      experiment.sensitivityEvidence.status === "PASS" &&
      experiment.sensitivityEvidence.failedTrialIds.length > 0
    ) {
      context.addIssue({
        code: "custom",
        message: "passing sensitivity evidence cannot contain failed trials",
        path: ["sensitivityEvidence", "failedTrialIds"],
      });
    }
  }
});

export type M2HistoricalReplayExperiment = z.infer<
  typeof M2HistoricalReplayExperimentSchema
>;

export type M2HistoricalReplayDatasetAcceptance = Readonly<{
  status: "ACCEPTED" | "INELIGIBLE";
  lifecycleDecisionEligible: boolean;
  reasonCodes: readonly string[];
}>;

export function assessM2HistoricalReplayDataset(
  rawDataset: M2HistoricalReplayDatasetBundle,
): M2HistoricalReplayDatasetAcceptance {
  const dataset = M2HistoricalReplayDatasetBundleSchema.parse(rawDataset);
  const reasons = new Set<string>();
  if (dataset.manifest.datasetKind !== "REAL_POINT_IN_TIME_HISTORICAL") {
    reasons.add("synthetic_dataset_cannot_support_lifecycle_decision");
  }
  if (
    dataset.manifest.holdoutCustody.custodyMode !==
      "SEPARATE_IMMUTABLE_ARTIFACT"
  ) {
    reasons.add("holdout_not_in_separate_immutable_custody");
  }
  for (const source of dataset.manifest.sourceRights) {
    if (source.sourceType === "SYNTHETIC_TEST_FIXTURE") {
      reasons.add("synthetic_source_cannot_support_lifecycle_decision");
    }
    if (source.licenseReviewStatus !== "APPROVED") {
      reasons.add("source_license_not_approved");
    }
    if (source.retentionRight !== "GRANTED") {
      reasons.add("source_retention_right_not_granted");
    }
    if (source.replayRight !== "GRANTED") {
      reasons.add("source_replay_right_not_granted");
    }
    if (source.reviewedAt === null || source.evidenceDigest === null) {
      reasons.add("source_rights_evidence_incomplete");
    } else if (Date.parse(source.reviewedAt) >
      Date.parse(dataset.manifest.frozenAt)) {
      reasons.add("source_rights_reviewed_after_dataset_freeze");
    }
  }
  for (const [field, complete] of Object.entries(
    dataset.manifest.pointInTimeProof,
  )) {
    if (typeof complete === "boolean" && !complete) {
      reasons.add(`point_in_time_${field}_incomplete`);
    }
  }
  if (
    dataset.manifest.recordCounts.train === 0 ||
    dataset.manifest.recordCounts.validation === 0 ||
    dataset.manifest.recordCounts.holdout === 0
  ) {
    reasons.add("train_validation_holdout_partition_incomplete");
  }
  if (
    dataset.manifest.recordCounts.event === 0 ||
    dataset.manifest.recordCounts.matchedNonEvent === 0 ||
    dataset.manifest.recordCounts.backgroundNonEvent === 0
  ) {
    reasons.add("candidate_event_or_matched_non_event_denominator_missing");
  }
  const reasonCodes = [...reasons].sort();
  return deepFreezeArtifact({
    status: reasonCodes.length === 0 ? "ACCEPTED" : "INELIGIBLE",
    lifecycleDecisionEligible: reasonCodes.length === 0,
    reasonCodes,
  });
}
