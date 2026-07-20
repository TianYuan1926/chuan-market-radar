import { z } from "zod";
import {
  M2_DRAFT_DETECTORS,
  type M2DraftReplayEvaluation,
  type M2DraftReplayKernelInput,
} from "../modules/detection/draft-replay-contract";
import {
  runBreakoutEdgeDraftReplay,
  runPreMoveCompressionDraftReplay,
  runPreMoveFlowDivergenceDraftReplay,
  runPreMoveLiquidityShiftDraftReplay,
  runRoleFlipRetestDraftReplay,
} from "../modules/detection/draft-replay-kernels";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../modules/universe/stable-artifact";
import {
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  RatioSchema,
  ReasonCodesSchema,
} from "../runtime-schema/primitives";
import { classifyCapture, type EarlyCaptureClass } from "./event-label-contract";
import {
  M2_HISTORICAL_REPLAY_GATE_POLICY,
  M2_HISTORICAL_REPLAY_GATE_POLICY_DIGEST,
  M2_HISTORICAL_REPLAY_GATE_POLICY_VERSION,
  M2_HISTORICAL_REPLAY_GATE_VERSION,
  M2_HISTORICAL_REPLAY_DETECTOR_IDS,
  M2HistoricalReplayDatasetBundleSchema,
  M2HistoricalReplayExperimentSchema,
  M2HistoricalReplayHoldoutArtifactSchema,
  assessM2HistoricalReplayDataset,
  type M2HistoricalReplayDatasetAcceptance,
  type M2HistoricalReplayDatasetBundle,
  type M2HistoricalReplayDetectorId,
  type M2HistoricalReplayExperiment,
  type M2HistoricalReplayHoldoutArtifact,
  type M2HistoricalReplayRecord,
} from "./historical-replay-contract";

type OpportunityFamily = "PRE_MOVE" | "BREAKOUT_RETEST";
type ReplayDirection = "LONG" | "SHORT" | "UNKNOWN";

const DETECTOR_DEFINITIONS = new Map<M2HistoricalReplayDetectorId, Readonly<{
  family: OpportunityFamily;
}>>([
  [M2_DRAFT_DETECTORS.PRE_MOVE_COMPRESSION.detectorId, { family: "PRE_MOVE" }],
  [M2_DRAFT_DETECTORS.PRE_MOVE_FLOW_DIVERGENCE.detectorId,
    { family: "PRE_MOVE" }],
  [M2_DRAFT_DETECTORS.PRE_MOVE_LIQUIDITY_SHIFT.detectorId,
    { family: "PRE_MOVE" }],
  [M2_DRAFT_DETECTORS.BREAKOUT_EDGE.detectorId,
    { family: "BREAKOUT_RETEST" }],
  [M2_DRAFT_DETECTORS.ROLE_FLIP_RETEST.detectorId,
    { family: "BREAKOUT_RETEST" }],
]);

const DETECTOR_KERNELS: Readonly<Record<
  M2HistoricalReplayDetectorId,
  (input: M2DraftReplayKernelInput) => M2DraftReplayEvaluation
>> = Object.freeze({
  [M2_DRAFT_DETECTORS.PRE_MOVE_COMPRESSION.detectorId]:
    runPreMoveCompressionDraftReplay,
  [M2_DRAFT_DETECTORS.PRE_MOVE_FLOW_DIVERGENCE.detectorId]:
    runPreMoveFlowDivergenceDraftReplay,
  [M2_DRAFT_DETECTORS.PRE_MOVE_LIQUIDITY_SHIFT.detectorId]:
    runPreMoveLiquidityShiftDraftReplay,
  [M2_DRAFT_DETECTORS.BREAKOUT_EDGE.detectorId]:
    runBreakoutEdgeDraftReplay,
  [M2_DRAFT_DETECTORS.ROLE_FLIP_RETEST.detectorId]:
    runRoleFlipRetestDraftReplay,
});

type FirstDetection = Readonly<{
  detectorId: M2HistoricalReplayDetectorId;
  opportunityFamily: OpportunityFamily;
  stepId: string;
  detectedAt: string;
  direction: ReplayDirection;
  evaluationDigest: string;
}>;

type TargetBlindExecution = Readonly<{
  recordId: string;
  firstDetections: readonly FirstDetection[];
  unavailableDetectorIds: readonly M2HistoricalReplayDetectorId[];
}>;

type EvaluatedCandidate = FirstDetection & Readonly<{
  targetKind: M2HistoricalReplayRecord["target"]["targetKind"];
  targetDirection: "LONG" | "SHORT" | null;
  directionCompatible: boolean;
  captureClass: EarlyCaptureClass | null;
  leadTimeSeconds: number | null;
}>;

type EvaluatedRecord = Readonly<{
  record: M2HistoricalReplayRecord;
  execution: TargetBlindExecution;
  candidates: readonly EvaluatedCandidate[];
}>;

type MetricScope = Readonly<{
  scopeId: string;
  opportunityFamily: OpportunityFamily | null;
  detectorId: M2HistoricalReplayDetectorId | null;
  direction: "LONG" | "SHORT" | null;
  marketRegime: M2HistoricalReplayRecord["marketRegime"] | null;
  liquidityBucket: M2HistoricalReplayRecord["liquidityBucket"] | null;
}>;

export type M2ProportionMetric = Readonly<{
  numerator: number;
  denominator: number;
  value: number | null;
  confidenceLevel: 0.95;
  lowerBound: number | null;
  upperBound: number | null;
}>;

export type M2LeadTimeDistribution = Readonly<{
  sampleSize: number;
  p25Seconds: number | null;
  medianSeconds: number | null;
  p75Seconds: number | null;
  medianConfidenceLowerSeconds: number | null;
  medianConfidenceUpperSeconds: number | null;
}>;

export type M2ReplayMetricRow = Readonly<{
  scope: MetricScope;
  candidateDenominatorCount: number;
  earlyTruePositiveCandidateCount: number;
  candidatePrecision: M2ProportionMetric;
  eventDenominatorCount: number;
  earlyCapturedEventCount: number;
  eventRecall: M2ProportionMetric;
  matchedNonEventDenominatorCount: number;
  activatedMatchedNonEventCount: number;
  matchedNonEventActivationRate: M2ProportionMetric;
  unavailableEventCount: number;
  unavailableEventRate: M2ProportionMetric;
  lateCandidateCount: number;
  noiseCandidateCount: number;
  wrongDirectionCandidateCount: number;
  lateNoiseRate: M2ProportionMetric;
  candidatesPerInstrumentDay: number | null;
  leadTime: M2LeadTimeDistribution;
}>;

const NullableRatioSchema = RatioSchema.nullable();
const NullableFiniteSchema = z.number().finite().nullable();
const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

const ProportionMetricSchema = z.strictObject({
  numerator: NonNegativeIntegerSchema,
  denominator: NonNegativeIntegerSchema,
  value: NullableRatioSchema,
  confidenceLevel: z.literal(0.95),
  lowerBound: NullableRatioSchema,
  upperBound: NullableRatioSchema,
}).superRefine((metric, context) => {
  if (metric.numerator > metric.denominator) {
    context.addIssue({
      code: "custom",
      message: "metric numerator cannot exceed denominator",
      path: ["numerator"],
    });
  }
  const absent = metric.denominator === 0;
  if (
    absent !== (
      metric.value === null &&
      metric.lowerBound === null &&
      metric.upperBound === null
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "zero-denominator metrics must remain explicitly unavailable",
      path: ["denominator"],
    });
  }
  if (!absent && metric.value !== metric.numerator / metric.denominator) {
    context.addIssue({
      code: "custom",
      message: "metric value does not match numerator and denominator",
      path: ["value"],
    });
  }
});

const ScopeSchema = z.strictObject({
  scopeId: NonEmptyStringSchema,
  opportunityFamily: z.enum(["PRE_MOVE", "BREAKOUT_RETEST"]).nullable(),
  detectorId: z.enum(M2_HISTORICAL_REPLAY_DETECTOR_IDS).nullable(),
  direction: z.enum(["LONG", "SHORT"]).nullable(),
  marketRegime: z.enum([
    "TREND_UP",
    "TREND_DOWN",
    "RANGE",
    "HIGH_VOLATILITY",
    "MARKET_STRESS",
    "UNKNOWN",
  ]).nullable(),
  liquidityBucket: z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]).nullable(),
});

const LeadTimeDistributionSchema = z.strictObject({
  sampleSize: NonNegativeIntegerSchema,
  p25Seconds: NullableFiniteSchema,
  medianSeconds: NullableFiniteSchema,
  p75Seconds: NullableFiniteSchema,
  medianConfidenceLowerSeconds: NullableFiniteSchema,
  medianConfidenceUpperSeconds: NullableFiniteSchema,
}).superRefine((distribution, context) => {
  const values = [
    distribution.p25Seconds,
    distribution.medianSeconds,
    distribution.p75Seconds,
    distribution.medianConfidenceLowerSeconds,
    distribution.medianConfidenceUpperSeconds,
  ];
  if (distribution.sampleSize === 0 && values.some((value) => value !== null)) {
    context.addIssue({
      code: "custom",
      message: "empty lead-time distribution cannot claim quantiles",
      path: ["sampleSize"],
    });
  }
  if (distribution.sampleSize > 0 && values.some((value) => value === null)) {
    context.addIssue({
      code: "custom",
      message: "non-empty lead-time distribution requires quantiles and CI",
      path: ["sampleSize"],
    });
  }
});

const ReplayMetricRowSchema = z.strictObject({
  scope: ScopeSchema,
  candidateDenominatorCount: NonNegativeIntegerSchema,
  earlyTruePositiveCandidateCount: NonNegativeIntegerSchema,
  candidatePrecision: ProportionMetricSchema,
  eventDenominatorCount: NonNegativeIntegerSchema,
  earlyCapturedEventCount: NonNegativeIntegerSchema,
  eventRecall: ProportionMetricSchema,
  matchedNonEventDenominatorCount: NonNegativeIntegerSchema,
  activatedMatchedNonEventCount: NonNegativeIntegerSchema,
  matchedNonEventActivationRate: ProportionMetricSchema,
  unavailableEventCount: NonNegativeIntegerSchema,
  unavailableEventRate: ProportionMetricSchema,
  lateCandidateCount: NonNegativeIntegerSchema,
  noiseCandidateCount: NonNegativeIntegerSchema,
  wrongDirectionCandidateCount: NonNegativeIntegerSchema,
  lateNoiseRate: ProportionMetricSchema,
  candidatesPerInstrumentDay: z.number().finite().nonnegative().nullable(),
  leadTime: LeadTimeDistributionSchema,
}).superRefine((row, context) => {
  for (const [field, actual, expected] of [
    [
      "candidatePrecision",
      row.candidatePrecision,
      [row.earlyTruePositiveCandidateCount, row.candidateDenominatorCount],
    ],
    [
      "eventRecall",
      row.eventRecall,
      [row.earlyCapturedEventCount, row.eventDenominatorCount],
    ],
    [
      "matchedNonEventActivationRate",
      row.matchedNonEventActivationRate,
      [
        row.activatedMatchedNonEventCount,
        row.matchedNonEventDenominatorCount,
      ],
    ],
    [
      "unavailableEventRate",
      row.unavailableEventRate,
      [row.unavailableEventCount, row.eventDenominatorCount],
    ],
    [
      "lateNoiseRate",
      row.lateNoiseRate,
      [
        row.lateCandidateCount + row.noiseCandidateCount,
        row.candidateDenominatorCount,
      ],
    ],
  ] as const) {
    if (actual.numerator !== expected[0] || actual.denominator !== expected[1]) {
      context.addIssue({
        code: "custom",
        message: `${field} does not match its named counts`,
        path: [field],
      });
    }
  }
  if (row.leadTime.sampleSize > row.eventDenominatorCount) {
    context.addIssue({
      code: "custom",
      message: "lead-time sample cannot exceed the event denominator",
      path: ["leadTime", "sampleSize"],
    });
  }
});

const DatasetAcceptanceSchema = z.strictObject({
  status: z.enum(["ACCEPTED", "INELIGIBLE"]),
  lifecycleDecisionEligible: z.boolean(),
  reasonCodes: ReasonCodesSchema,
});

export const M2HistoricalReplayGateReportSchema = z.strictObject({
  schemaVersion: z.literal(M2_HISTORICAL_REPLAY_GATE_VERSION),
  gateAuthority: z.literal("RESEARCH_EVALUATION_ONLY"),
  datasetSnapshotId: NonEmptyStringSchema,
  datasetContentDigest: DigestSchema,
  evaluatedHoldoutArtifactDigest: DigestSchema.nullable(),
  experimentId: NonEmptyStringSchema,
  evaluationMode: z.enum([
    "CONTRACT_TEST_ONLY",
    "VALIDATION_REPLAY",
    "UNTOUCHED_HOLDOUT_GATE",
  ]),
  evaluatedSplits: z.array(z.enum(["TRAIN", "VALIDATION", "HOLDOUT"])).min(1),
  gatePolicyVersion: z.literal(M2_HISTORICAL_REPLAY_GATE_POLICY_VERSION),
  gatePolicyDigest: z.literal(M2_HISTORICAL_REPLAY_GATE_POLICY_DIGEST),
  datasetAcceptance: DatasetAcceptanceSchema,
  overallMetrics: ReplayMetricRowSchema,
  familyMetrics: z.array(ReplayMetricRowSchema),
  detectorMetrics: z.array(ReplayMetricRowSchema),
  requiredStratumMetrics: z.array(ReplayMetricRowSchema),
  gateStatus: z.enum(["PASS", "FAIL", "INSUFFICIENT", "INVALID"]),
  detectorLifecycleBefore: z.literal("DRAFT"),
  proposedLifecycle: z.enum(["DRAFT", "REPLAY_VALIDATED"]),
  lifecycleMutationAllowed: z.literal(false),
  candidateEmissionAllowed: z.literal(false),
  independentAuditRequired: z.literal(true),
  proposalEligible: z.boolean(),
  reasonCodes: ReasonCodesSchema,
  reportDigest: DigestSchema,
  reportId: NonEmptyStringSchema,
}).superRefine((report, context) => {
  if (
    (report.gateStatus === "PASS") !==
      (report.proposedLifecycle === "REPLAY_VALIDATED" &&
        report.proposalEligible)
  ) {
    context.addIssue({
      code: "custom",
      message: "only a passing Gate may propose REPLAY_VALIDATED",
      path: ["proposedLifecycle"],
    });
  }
  if (
    report.evaluationMode === "UNTOUCHED_HOLDOUT_GATE" &&
    report.gateStatus === "PASS" &&
    report.evaluatedHoldoutArtifactDigest === null
  ) {
    context.addIssue({
      code: "custom",
      message: "passing holdout Gate must bind the evaluated sealed artifact",
      path: ["evaluatedHoldoutArtifactDigest"],
    });
  }
  if (
    report.evaluationMode !== "UNTOUCHED_HOLDOUT_GATE" &&
    report.evaluatedHoldoutArtifactDigest !== null
  ) {
    context.addIssue({
      code: "custom",
      message: "non-holdout reports cannot bind a sealed holdout artifact",
      path: ["evaluatedHoldoutArtifactDigest"],
    });
  }
  const content: Record<string, unknown> = { ...report };
  delete content.schemaVersion;
  delete content.reportDigest;
  delete content.reportId;
  const expectedDigest = stableContentHash(content);
  if (report.reportDigest !== expectedDigest) {
    context.addIssue({
      code: "custom",
      message: "historical replay Gate report digest mismatch",
      path: ["reportDigest"],
    });
  }
  if (
    report.reportId !==
      `historical-replay-gate:${expectedDigest.slice("sha256:".length)}`
  ) {
    context.addIssue({
      code: "custom",
      message: "historical replay Gate report identity mismatch",
      path: ["reportId"],
    });
  }
});

export type M2HistoricalReplayGateReport = z.infer<
  typeof M2HistoricalReplayGateReportSchema
>;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function executeTargetBlindReplay(input: Readonly<{
  recordId: string;
  detectorIds: readonly M2HistoricalReplayDetectorId[];
  replaySteps: M2HistoricalReplayRecord["replaySteps"];
}>): TargetBlindExecution {
  const firstDetections: FirstDetection[] = [];
  const unavailableDetectorIds: M2HistoricalReplayDetectorId[] = [];
  for (const detectorId of [...input.detectorIds].sort()) {
    let sawAvailableEvaluation = false;
    for (const step of input.replaySteps) {
      if (step.detectorInput === null) {
        continue;
      }
      const evaluation = DETECTOR_KERNELS[detectorId](step.detectorInput);
      if (evaluation.evaluationStatus !== "DATA_UNAVAILABLE") {
        sawAvailableEvaluation = true;
      }
      if (
        evaluation.evaluationStatus === "MATCHED_DRAFT_HYPOTHESIS" &&
        evaluation.hypothesis !== null
      ) {
        firstDetections.push({
          detectorId,
          opportunityFamily: DETECTOR_DEFINITIONS.get(detectorId)!.family,
          stepId: step.stepId,
          detectedAt: step.knowledgeCutoff,
          direction: evaluation.hypothesis.directionHypothesis,
          evaluationDigest: evaluation.evaluationDigest,
        });
        break;
      }
    }
    if (
      !sawAvailableEvaluation &&
      !firstDetections.some((candidate) => candidate.detectorId === detectorId)
    ) {
      unavailableDetectorIds.push(detectorId);
    }
  }
  return deepFreezeArtifact({
    recordId: input.recordId,
    firstDetections: [...firstDetections].sort((left, right) =>
      left.detectorId.localeCompare(right.detectorId)),
    unavailableDetectorIds: [...unavailableDetectorIds].sort(),
  });
}

function evaluateRecord(
  record: M2HistoricalReplayRecord,
  execution: TargetBlindExecution,
): EvaluatedRecord {
  const eventLabels = record.target.targetKind === "EVENT"
    ? new Map(record.target.stepOutcomeLabels.map((label) => [
      label.stepId,
      label.moveConsumedFractionAtCutoff,
    ]))
    : null;
  const targetDirection = record.target.targetKind === "EVENT"
    ? record.target.direction
    : record.target.targetKind === "MATCHED_NON_EVENT"
      ? record.target.matchedDirection
      : null;
  const candidates = execution.firstDetections.map((detection) => {
    if (record.target.targetKind !== "EVENT") {
      return {
        ...detection,
        targetKind: record.target.targetKind,
        targetDirection,
        directionCompatible: targetDirection === null ||
          detection.direction === targetDirection ||
          detection.direction === "UNKNOWN",
        captureClass: null,
        leadTimeSeconds: null,
      } as const;
    }
    const leadTimeSeconds = (
      Date.parse(record.target.publicBreakoutAt) -
      Date.parse(detection.detectedAt)
    ) / 1_000;
    return {
      ...detection,
      targetKind: record.target.targetKind,
      targetDirection,
      directionCompatible: detection.direction === targetDirection ||
        detection.direction === "UNKNOWN",
      captureClass: classifyCapture({
        dataAvailable: true,
        horizon: record.target.horizon,
        leadTimeSeconds,
        moveConsumedFraction: eventLabels!.get(detection.stepId)!,
      }),
      leadTimeSeconds,
    } as const;
  });
  return deepFreezeArtifact({ record, execution, candidates });
}

function wilsonMetric(numerator: number, denominator: number): M2ProportionMetric {
  if (denominator === 0) {
    return {
      numerator,
      denominator,
      value: null,
      confidenceLevel: 0.95,
      lowerBound: null,
      upperBound: null,
    };
  }
  const value = numerator / denominator;
  const zScore = 1.959963984540054;
  const zSquared = zScore * zScore;
  const denominatorAdjustment = 1 + zSquared / denominator;
  const center = (value + zSquared / (2 * denominator)) /
    denominatorAdjustment;
  const margin = zScore * Math.sqrt(
    value * (1 - value) / denominator +
      zSquared / (4 * denominator * denominator),
  ) / denominatorAdjustment;
  return {
    numerator,
    denominator,
    value,
    confidenceLevel: 0.95,
    lowerBound: Math.max(0, center - margin),
    upperBound: Math.min(1, center + margin),
  };
}

function quantile(sorted: readonly number[], probability: number): number {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sorted[lower]!;
  }
  const weight = position - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function medianRankInterval(sampleSize: number): readonly [number, number] {
  if (sampleSize > 1_000) {
    const halfWidth = 0.98 * Math.sqrt(sampleSize);
    return [
      Math.max(0, Math.floor(sampleSize / 2 - halfWidth)),
      Math.min(sampleSize - 1, Math.ceil(sampleSize / 2 + halfWidth)),
    ];
  }
  let probability = 0.5 ** sampleSize;
  let cumulative = probability;
  let lowerRankOneBased = 1;
  for (let successes = 1; successes < Math.floor(sampleSize / 2); successes += 1) {
    probability *= (sampleSize - successes + 1) / successes;
    cumulative += probability;
    if (cumulative <= 0.025) {
      lowerRankOneBased = successes + 1;
    } else {
      break;
    }
  }
  return [
    lowerRankOneBased - 1,
    sampleSize - lowerRankOneBased,
  ];
}

function leadTimeDistribution(values: readonly number[]): M2LeadTimeDistribution {
  if (values.length === 0) {
    return {
      sampleSize: 0,
      p25Seconds: null,
      medianSeconds: null,
      p75Seconds: null,
      medianConfidenceLowerSeconds: null,
      medianConfidenceUpperSeconds: null,
    };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const [lowerIndex, upperIndex] = medianRankInterval(sorted.length);
  return {
    sampleSize: sorted.length,
    p25Seconds: quantile(sorted, 0.25),
    medianSeconds: quantile(sorted, 0.5),
    p75Seconds: quantile(sorted, 0.75),
    medianConfidenceLowerSeconds: sorted[lowerIndex]!,
    medianConfidenceUpperSeconds: sorted[upperIndex]!,
  };
}

function detectorMatchesScope(
  detectorId: M2HistoricalReplayDetectorId,
  scope: MetricScope,
): boolean {
  if (scope.detectorId !== null && detectorId !== scope.detectorId) {
    return false;
  }
  return scope.opportunityFamily === null ||
    DETECTOR_DEFINITIONS.get(detectorId)!.family === scope.opportunityFamily;
}

function recordDirection(
  record: M2HistoricalReplayRecord,
): "LONG" | "SHORT" | null {
  return record.target.targetKind === "EVENT"
    ? record.target.direction
    : record.target.targetKind === "MATCHED_NON_EVENT"
      ? record.target.matchedDirection
      : null;
}

function recordHasRelevantDetector(
  record: M2HistoricalReplayRecord,
  scope: MetricScope,
): boolean {
  return record.detectorIds.some((detectorId) =>
    detectorMatchesScope(detectorId, scope));
}

function recordMatchesScope(
  record: M2HistoricalReplayRecord,
  scope: MetricScope,
): boolean {
  if (
    scope.marketRegime !== null && record.marketRegime !== scope.marketRegime
  ) {
    return false;
  }
  if (
    scope.liquidityBucket !== null &&
    record.liquidityBucket !== scope.liquidityBucket
  ) {
    return false;
  }
  if (!recordHasRelevantDetector(record, scope)) {
    return false;
  }
  const targetDirection = recordDirection(record);
  return scope.direction === null || targetDirection === null ||
    targetDirection === scope.direction;
}

function candidateMatchesScope(
  candidate: EvaluatedCandidate,
  scope: MetricScope,
): boolean {
  if (!detectorMatchesScope(candidate.detectorId, scope)) {
    return false;
  }
  return scope.direction === null || candidate.direction === scope.direction;
}

function isCompatibleCandidateForMetric(
  candidate: EvaluatedCandidate,
  scope: MetricScope,
): boolean {
  if (!candidate.directionCompatible) {
    return false;
  }
  if (scope.direction !== null) {
    return candidate.direction === scope.direction;
  }
  return true;
}

function computeMetricRow(
  evaluatedRecords: readonly EvaluatedRecord[],
  scope: MetricScope,
): M2ReplayMetricRow {
  const records = evaluatedRecords.filter(({ record }) =>
    recordMatchesScope(record, scope));
  const instrumentDayCount = new Set(records.flatMap(({ record }) =>
    record.replaySteps.map((step) =>
      `${record.canonicalInstrumentId}:${step.eventCutoff.slice(0, 10)}`),
  )).size;
  const eventRecords = records.filter(({ record }) =>
    record.target.targetKind === "EVENT");
  const controlRecords = records.filter(({ record }) =>
    record.target.targetKind === "MATCHED_NON_EVENT");
  const candidates = records.flatMap(({ candidates: recordCandidates }) =>
    recordCandidates.filter((candidate) =>
      candidateMatchesScope(candidate, scope)));
  const earlyTruePositiveCandidates = candidates.filter((candidate) =>
    candidate.targetKind === "EVENT" &&
    isCompatibleCandidateForMetric(candidate, scope) &&
    candidate.captureClass === "EARLY_CAPTURE");
  const earlyCapturedEventCount = eventRecords.filter(({ candidates }) =>
    candidates.some((candidate) =>
      candidateMatchesScope(candidate, scope) &&
      isCompatibleCandidateForMetric(candidate, scope) &&
      candidate.captureClass === "EARLY_CAPTURE"))
    .length;
  const activatedMatchedNonEventCount = controlRecords.filter(({ candidates }) =>
    candidates.some((candidate) => candidateMatchesScope(candidate, scope)))
    .length;
  const unavailableEventCount = eventRecords.filter(({ record, execution }) => {
    const relevantDetectors = record.detectorIds.filter((detectorId) =>
      detectorMatchesScope(detectorId, scope));
    return relevantDetectors.length > 0 && relevantDetectors.every((detectorId) =>
      execution.unavailableDetectorIds.includes(detectorId));
  }).length;
  const lateCandidateCount = candidates.filter((candidate) =>
    candidate.targetKind === "EVENT" &&
    isCompatibleCandidateForMetric(candidate, scope) &&
    candidate.captureClass === "LATE").length;
  const noiseCandidateCount = candidates.filter((candidate) =>
    candidate.targetKind !== "EVENT").length;
  const wrongDirectionCandidateCount = candidates.filter((candidate) =>
    candidate.targetKind === "EVENT" &&
    !isCompatibleCandidateForMetric(candidate, scope)).length;
  const eventLeadTimes = eventRecords.flatMap(({ candidates }) => {
    const compatibleLeadTimes = candidates
      .filter((candidate) =>
        candidateMatchesScope(candidate, scope) &&
        isCompatibleCandidateForMetric(candidate, scope) &&
        candidate.leadTimeSeconds !== null)
      .map((candidate) => candidate.leadTimeSeconds!);
    return compatibleLeadTimes.length === 0
      ? []
      : [Math.max(...compatibleLeadTimes)];
  });
  return deepFreezeArtifact(ReplayMetricRowSchema.parse({
    scope,
    candidateDenominatorCount: candidates.length,
    earlyTruePositiveCandidateCount: earlyTruePositiveCandidates.length,
    candidatePrecision: wilsonMetric(
      earlyTruePositiveCandidates.length,
      candidates.length,
    ),
    eventDenominatorCount: eventRecords.length,
    earlyCapturedEventCount,
    eventRecall: wilsonMetric(earlyCapturedEventCount, eventRecords.length),
    matchedNonEventDenominatorCount: controlRecords.length,
    activatedMatchedNonEventCount,
    matchedNonEventActivationRate: wilsonMetric(
      activatedMatchedNonEventCount,
      controlRecords.length,
    ),
    unavailableEventCount,
    unavailableEventRate: wilsonMetric(
      unavailableEventCount,
      eventRecords.length,
    ),
    lateCandidateCount,
    noiseCandidateCount,
    wrongDirectionCandidateCount,
    lateNoiseRate: wilsonMetric(
      lateCandidateCount + noiseCandidateCount,
      candidates.length,
    ),
    candidatesPerInstrumentDay: instrumentDayCount === 0
      ? null
      : candidates.length / instrumentDayCount,
    leadTime: leadTimeDistribution(eventLeadTimes),
  }));
}

type GateIssue = Readonly<{
  kind: "INVALID" | "INSUFFICIENT" | "FAIL";
  reasonCode: string;
}>;

function appendMetricPerformanceIssues(
  issues: GateIssue[],
  metrics: M2ReplayMetricRow,
  family: OpportunityFamily,
  reasonScope: string,
): void {
  const policy = M2_HISTORICAL_REPLAY_GATE_POLICY.familyPolicies[family];
  if (!policy.promotionThresholdsFrozen) {
    return;
  }
  if (
    metrics.eventRecall.value !== null &&
    metrics.eventRecall.value < policy.eventRecallMinimum
  ) {
    issues.push({
      kind: "FAIL",
      reasonCode: `event_recall_failed:${reasonScope}`,
    });
  }
  if (
    metrics.candidatePrecision.value !== null &&
    metrics.candidatePrecision.value < policy.candidatePrecisionMinimum
  ) {
    issues.push({
      kind: "FAIL",
      reasonCode: `candidate_precision_failed:${reasonScope}`,
    });
  }
  if (
    policy.requireRecallLowerBoundAboveBaseline &&
    metrics.eventRecall.lowerBound !== null &&
    metrics.eventRecall.lowerBound <= policy.auditedBaselineRecall
  ) {
    issues.push({
      kind: "FAIL",
      reasonCode: `recall_not_significantly_above_baseline:${reasonScope}`,
    });
  }
  if (
    policy.requireEventControlSeparation &&
    metrics.eventRecall.lowerBound !== null &&
    metrics.matchedNonEventActivationRate.upperBound !== null &&
    metrics.eventRecall.lowerBound <=
      metrics.matchedNonEventActivationRate.upperBound
  ) {
    issues.push({
      kind: "FAIL",
      reasonCode: `event_control_separation_failed:${reasonScope}`,
    });
  }
  if (
    metrics.lateNoiseRate.value !== null &&
    metrics.lateNoiseRate.value > policy.lateNoiseRateMaximum
  ) {
    issues.push({
      kind: "FAIL",
      reasonCode: `late_noise_rate_failed:${reasonScope}`,
    });
  }
  if (
    metrics.unavailableEventRate.value !== null &&
    metrics.unavailableEventRate.value >
      M2_HISTORICAL_REPLAY_GATE_POLICY.dataQuality
        .unavailableEventFractionMaximum
  ) {
    issues.push({
      kind: "FAIL",
      reasonCode: `event_unavailable_rate_failed:${reasonScope}`,
    });
  }
  if (
    policy.requirePositiveMedianLeadTime &&
    metrics.leadTime.medianSeconds !== null &&
    metrics.leadTime.medianSeconds <= 0
  ) {
    issues.push({
      kind: "FAIL",
      reasonCode: `median_lead_time_not_positive:${reasonScope}`,
    });
  }
}

export type M2ReplayThresholdEvaluationInput = Readonly<{
  datasetAcceptance: M2HistoricalReplayDatasetAcceptance;
  experiment: M2HistoricalReplayExperiment;
  selectedFamilies: readonly OpportunityFamily[];
  overallMetrics: M2ReplayMetricRow;
  familyMetrics: readonly M2ReplayMetricRow[];
  requiredStratumMetrics: readonly M2ReplayMetricRow[];
  experimentConsistencyReasonCodes: readonly string[];
}>;

export function evaluateM2ReplayThresholds(
  input: M2ReplayThresholdEvaluationInput,
): Readonly<{
  status: "PASS" | "FAIL" | "INSUFFICIENT" | "INVALID";
  reasonCodes: readonly string[];
}> {
  const issues: GateIssue[] = input.experimentConsistencyReasonCodes.map(
    (reasonCode) => ({ kind: "INVALID", reasonCode }),
  );
  if (!input.datasetAcceptance.lifecycleDecisionEligible) {
    for (const reasonCode of input.datasetAcceptance.reasonCodes) {
      issues.push({ kind: "INSUFFICIENT", reasonCode });
    }
  }
  if (input.experiment.evaluationMode !== "UNTOUCHED_HOLDOUT_GATE") {
    issues.push({
      kind: "INSUFFICIENT",
      reasonCode: "untouched_holdout_gate_not_executed",
    });
  }
  if (!input.experiment.allTrialsReported) {
    issues.push({
      kind: "INSUFFICIENT",
      reasonCode: "all_registered_trials_not_reported",
    });
  }
  if (input.experiment.sensitivityEvidence.status === "NOT_RUN") {
    issues.push({
      kind: "INSUFFICIENT",
      reasonCode: "threshold_sensitivity_not_run",
    });
  } else if (input.experiment.sensitivityEvidence.status === "FAIL") {
    issues.push({ kind: "FAIL", reasonCode: "threshold_sensitivity_failed" });
  }
  if (input.experiment.topKReplayEvidence.status === "UNAVAILABLE") {
    issues.push({
      kind: "INSUFFICIENT",
      reasonCode: "top20_ranking_evidence_unavailable",
    });
  } else if (
    input.experiment.topKReplayEvidence.lateNoiseRate === null ||
    input.experiment.topKReplayEvidence.lateNoiseRate >
      M2_HISTORICAL_REPLAY_GATE_POLICY.topK.lateNoiseRateMaximum
  ) {
    issues.push({ kind: "FAIL", reasonCode: "top20_late_noise_gate_failed" });
  }
  for (const family of input.selectedFamilies) {
    const metrics = input.familyMetrics.find(
      (row) => row.scope.opportunityFamily === family,
    );
    if (metrics === undefined) {
      issues.push({
        kind: "INVALID",
        reasonCode: `family_metrics_missing:${family}`,
      });
      continue;
    }
    const policy = M2_HISTORICAL_REPLAY_GATE_POLICY.familyPolicies[family];
    if (!policy.promotionThresholdsFrozen) {
      issues.push({ kind: "INSUFFICIENT", reasonCode: policy.reasonCode });
      continue;
    }
    if (
      metrics.candidateDenominatorCount <
        M2_HISTORICAL_REPLAY_GATE_POLICY.sampleMinimums.candidateCount ||
      metrics.eventDenominatorCount <
        M2_HISTORICAL_REPLAY_GATE_POLICY.sampleMinimums.eventCount ||
      metrics.matchedNonEventDenominatorCount <
        M2_HISTORICAL_REPLAY_GATE_POLICY.sampleMinimums.matchedNonEventCount
    ) {
      issues.push({
        kind: "INSUFFICIENT",
        reasonCode: `family_sample_minimum_not_met:${family}`,
      });
    }
    appendMetricPerformanceIssues(issues, metrics, family, family);
  }
  for (const metrics of input.requiredStratumMetrics) {
    if (
      metrics.eventDenominatorCount <
        M2_HISTORICAL_REPLAY_GATE_POLICY.sampleMinimums
          .eventCountPerRequiredStratum ||
      metrics.matchedNonEventDenominatorCount <
        M2_HISTORICAL_REPLAY_GATE_POLICY.sampleMinimums
          .matchedNonEventCountPerRequiredStratum
    ) {
      issues.push({
        kind: "INSUFFICIENT",
        reasonCode: `required_stratum_sample_minimum_not_met:${metrics.scope.scopeId}`,
      });
    }
    if (metrics.scope.opportunityFamily !== null) {
      appendMetricPerformanceIssues(
        issues,
        metrics,
        metrics.scope.opportunityFamily,
        metrics.scope.scopeId,
      );
    }
  }
  const kinds = new Set(issues.map((issue) => issue.kind));
  const status = kinds.has("INVALID")
    ? "INVALID"
    : kinds.has("INSUFFICIENT")
      ? "INSUFFICIENT"
      : kinds.has("FAIL")
        ? "FAIL"
        : "PASS";
  return deepFreezeArtifact({
    status,
    reasonCodes: uniqueSorted(issues.map((issue) => issue.reasonCode)),
  });
}

function experimentConsistencyReasons(
  dataset: M2HistoricalReplayDatasetBundle,
  experiment: M2HistoricalReplayExperiment,
  holdoutArtifact: M2HistoricalReplayHoldoutArtifact | null,
): string[] {
  const reasons = new Set<string>();
  if (experiment.datasetSnapshotId !== dataset.datasetSnapshotId) {
    reasons.add("experiment_dataset_identity_mismatch");
  }
  if (
    experiment.constructionPolicyDigest !==
      dataset.manifest.constructionPolicyDigest ||
    experiment.rankingPolicyDigest !==
      dataset.manifest.diagnosticRankingPolicyDigest
  ) {
    reasons.add("experiment_construction_policy_mismatch");
  }
  if (
    experiment.eventThresholdRegistryId !==
      dataset.manifest.eventThresholdRegistry.registryId ||
    experiment.eventThresholdRegistryDigest !==
      dataset.manifest.eventThresholdRegistry.registryDigest
  ) {
    reasons.add("experiment_event_threshold_registry_mismatch");
  }
  const manifestTrials = [...dataset.manifest.registeredTrialIds].sort();
  const experimentTrials = experiment.trials.map((trial) => trial.trialId).sort();
  if (JSON.stringify(manifestTrials) !== JSON.stringify(experimentTrials)) {
    reasons.add("manifest_experiment_trial_registry_mismatch");
  }
  if (experiment.sensitivityEvidence.status !== "NOT_RUN") {
    const registered = [...experiment.sensitivityEvidence.registeredTrialIds]
      .sort();
    const reported = [...experiment.sensitivityEvidence.reportedTrialIds].sort();
    if (JSON.stringify(registered) !== JSON.stringify(experimentTrials)) {
      reasons.add("sensitivity_registered_trials_incomplete");
    }
    if (JSON.stringify(reported) !== JSON.stringify(experimentTrials)) {
      reasons.add("sensitivity_reported_trials_incomplete");
    }
  }
  if (experiment.evaluationMode === "UNTOUCHED_HOLDOUT_GATE") {
    const custody = dataset.manifest.holdoutCustody;
    const access = experiment.holdoutAccessEvidence;
    if (
      custody.custodyMode !== "SEPARATE_IMMUTABLE_ARTIFACT" ||
      access === null
    ) {
      reasons.add("separate_holdout_custody_evidence_missing");
    } else if (
      access.artifactId !== custody.artifactId ||
      access.artifactDigest !== custody.artifactDigest ||
      access.custodianIdentity !== custody.custodianIdentity
    ) {
      reasons.add("holdout_custody_access_identity_mismatch");
    }
    if (holdoutArtifact === null) {
      reasons.add("sealed_holdout_artifact_not_supplied_to_gate");
    } else if (custody.custodyMode === "SEPARATE_IMMUTABLE_ARTIFACT") {
      if (
        holdoutArtifact.artifactId !== custody.artifactId ||
        holdoutArtifact.artifactDigest !== custody.artifactDigest ||
        stableContentHash(holdoutArtifact.summary) !==
          stableContentHash(custody.committedSummary)
      ) {
        reasons.add("sealed_holdout_artifact_commitment_mismatch");
      }
      if (
        holdoutArtifact.datasetName !== dataset.manifest.datasetName ||
        Date.parse(holdoutArtifact.frozenAt) >
          Date.parse(dataset.manifest.frozenAt) ||
        holdoutArtifact.eventLabelVersion !==
          dataset.manifest.eventLabelVersion ||
        holdoutArtifact.detectorRuleSetVersion !==
          dataset.manifest.detectorRuleSetVersion ||
        holdoutArtifact.detectorRuleSetDigest !==
          dataset.manifest.detectorRuleSetDigest ||
        holdoutArtifact.constructionPolicyDigest !==
          dataset.manifest.constructionPolicyDigest ||
        holdoutArtifact.diagnosticRankingPolicyDigest !==
          dataset.manifest.diagnosticRankingPolicyDigest ||
        holdoutArtifact.eventThresholdRegistry.registryId !==
          dataset.manifest.eventThresholdRegistry.registryId ||
        holdoutArtifact.eventThresholdRegistry.registryDigest !==
          dataset.manifest.eventThresholdRegistry.registryDigest ||
        JSON.stringify([...holdoutArtifact.evaluatedDetectorIds].sort()) !==
          JSON.stringify([...dataset.manifest.evaluatedDetectorIds].sort())
      ) {
        reasons.add("sealed_holdout_artifact_dataset_binding_mismatch");
      }
      const holdoutWindow = dataset.manifest.splitPolicy.windows[2];
      if (
        Date.parse(holdoutArtifact.splitWindow.startedAt) !==
          Date.parse(holdoutWindow.startedAt) ||
        Date.parse(holdoutArtifact.splitWindow.endedAt) !==
          Date.parse(holdoutWindow.endedAt)
      ) {
        reasons.add("sealed_holdout_artifact_window_mismatch");
      }
      const visibleGroups = new Set(dataset.records.map(
        (record) => record.underlyingGroupId,
      ));
      if (holdoutArtifact.records.some((record) =>
        visibleGroups.has(record.underlyingGroupId))) {
        reasons.add("sealed_holdout_underlying_group_leakage");
      }
      const visibleRecordIds = new Set(dataset.records.map(
        (record) => record.recordId,
      ));
      if (holdoutArtifact.records.some((record) =>
        visibleRecordIds.has(record.recordId))) {
        reasons.add("sealed_holdout_record_identity_collision");
      }
      const visibleTargetIds = new Set(dataset.records.flatMap((record) =>
        record.target.targetKind === "EVENT"
          ? [`EVENT:${record.target.eventId}`]
          : record.target.targetKind === "MATCHED_NON_EVENT"
            ? [`CONTROL:${record.target.controlId}`]
            : [`BACKGROUND:${record.target.backgroundWindowId}`]),
      );
      if (holdoutArtifact.records.some((record) => {
        const targetId = record.target.targetKind === "EVENT"
          ? `EVENT:${record.target.eventId}`
          : record.target.targetKind === "MATCHED_NON_EVENT"
            ? `CONTROL:${record.target.controlId}`
            : `BACKGROUND:${record.target.backgroundWindowId}`;
        return visibleTargetIds.has(targetId);
      })) {
        reasons.add("sealed_holdout_target_identity_collision");
      }
      const requiredStrata = new Set(dataset.manifest.requiredStrata.map(
        (stratum) =>
          `${stratum.opportunityFamily}:${stratum.direction}:${stratum.marketRegime}:${stratum.liquidityBucket}`,
      ));
      for (const record of holdoutArtifact.records) {
        const direction = recordDirection(record);
        if (direction === null) {
          continue;
        }
        const families = new Set(record.detectorIds.map((detectorId) =>
          DETECTOR_DEFINITIONS.get(detectorId)!.family));
        for (const family of families) {
          const stratum =
            `${family}:${direction}:${record.marketRegime}:${record.liquidityBucket}`;
          if (!requiredStrata.has(stratum)) {
            reasons.add(`sealed_holdout_required_stratum_omitted:${stratum}`);
          }
        }
      }
    }
  } else if (holdoutArtifact !== null) {
    reasons.add("sealed_holdout_opened_outside_single_use_gate");
  }
  return [...reasons].sort();
}

function holdoutArtifactMatchesCommitment(
  dataset: M2HistoricalReplayDatasetBundle,
  artifact: M2HistoricalReplayHoldoutArtifact | null,
): artifact is M2HistoricalReplayHoldoutArtifact {
  const custody = dataset.manifest.holdoutCustody;
  if (
    artifact === null ||
    custody.custodyMode !== "SEPARATE_IMMUTABLE_ARTIFACT"
  ) {
    return false;
  }
  return artifact.artifactId === custody.artifactId &&
    artifact.artifactDigest === custody.artifactDigest &&
    stableContentHash(artifact.summary) ===
      stableContentHash(custody.committedSummary);
}

function selectedSplits(
  mode: M2HistoricalReplayExperiment["evaluationMode"],
): readonly ("TRAIN" | "VALIDATION" | "HOLDOUT")[] {
  return mode === "CONTRACT_TEST_ONLY"
    ? ["TRAIN", "VALIDATION", "HOLDOUT"]
    : mode === "VALIDATION_REPLAY"
      ? ["VALIDATION"]
      : ["HOLDOUT"];
}

export function runM2HistoricalReplayGate(input: Readonly<{
  dataset: M2HistoricalReplayDatasetBundle;
  experiment: M2HistoricalReplayExperiment;
  holdoutArtifact?: M2HistoricalReplayHoldoutArtifact;
}>): M2HistoricalReplayGateReport {
  const dataset = M2HistoricalReplayDatasetBundleSchema.parse(input.dataset);
  const experiment = M2HistoricalReplayExperimentSchema.parse(input.experiment);
  const holdoutArtifact = input.holdoutArtifact === undefined
    ? null
    : M2HistoricalReplayHoldoutArtifactSchema.parse(input.holdoutArtifact);
  const splits = selectedSplits(experiment.evaluationMode);
  const useSealedHoldout = experiment.evaluationMode ===
      "UNTOUCHED_HOLDOUT_GATE" &&
    holdoutArtifactMatchesCommitment(dataset, holdoutArtifact);
  const selectedRecords = experiment.evaluationMode ===
    "UNTOUCHED_HOLDOUT_GATE"
    ? useSealedHoldout
      ? holdoutArtifact.records
      : []
    : dataset.records.filter((record) => splits.includes(record.split));
  const evaluatedRecords = selectedRecords.map((record) => {
    const execution = executeTargetBlindReplay({
      recordId: record.recordId,
      detectorIds: record.detectorIds,
      replaySteps: record.replaySteps,
    });
    return evaluateRecord(record, execution);
  });
  const overallScope: MetricScope = {
    scopeId: "ALL",
    opportunityFamily: null,
    detectorId: null,
    direction: null,
    marketRegime: null,
    liquidityBucket: null,
  };
  const overallMetrics = computeMetricRow(
    evaluatedRecords,
    overallScope,
  );
  const selectedFamilies = uniqueSorted(selectedRecords.flatMap((record) =>
    record.detectorIds.map((detectorId) =>
      DETECTOR_DEFINITIONS.get(detectorId)!.family))) as OpportunityFamily[];
  const familyMetrics = selectedFamilies.map((opportunityFamily) =>
    computeMetricRow(evaluatedRecords, {
      scopeId: `FAMILY:${opportunityFamily}`,
      opportunityFamily,
      detectorId: null,
      direction: null,
      marketRegime: null,
      liquidityBucket: null,
    }));
  const selectedDetectorIds = uniqueSorted(selectedRecords.flatMap(
    (record) => record.detectorIds,
  )) as M2HistoricalReplayDetectorId[];
  const detectorMetrics = selectedDetectorIds.map((detectorId) =>
    computeMetricRow(evaluatedRecords, {
      scopeId: `DETECTOR:${detectorId}`,
      opportunityFamily: DETECTOR_DEFINITIONS.get(detectorId)!.family,
      detectorId,
      direction: null,
      marketRegime: null,
      liquidityBucket: null,
    }));
  const requiredStratumMetrics = dataset.manifest.requiredStrata.map(
    (stratum) => computeMetricRow(evaluatedRecords, {
      scopeId:
        `STRATUM:${stratum.opportunityFamily}:${stratum.direction}:${stratum.marketRegime}:${stratum.liquidityBucket}`,
      opportunityFamily: stratum.opportunityFamily,
      detectorId: null,
      direction: stratum.direction,
      marketRegime: stratum.marketRegime,
      liquidityBucket: stratum.liquidityBucket,
    }),
  );
  const datasetAcceptance = assessM2HistoricalReplayDataset(dataset);
  const thresholdEvaluation = evaluateM2ReplayThresholds({
    datasetAcceptance,
    experiment,
    selectedFamilies,
    overallMetrics,
    familyMetrics,
    requiredStratumMetrics,
    experimentConsistencyReasonCodes: experimentConsistencyReasons(
      dataset,
      experiment,
      holdoutArtifact,
    ),
  });
  const content = {
    gateAuthority: "RESEARCH_EVALUATION_ONLY",
    datasetSnapshotId: dataset.datasetSnapshotId,
    datasetContentDigest: dataset.datasetContentDigest,
    evaluatedHoldoutArtifactDigest: useSealedHoldout
      ? holdoutArtifact.artifactDigest
      : null,
    experimentId: experiment.experimentId,
    evaluationMode: experiment.evaluationMode,
    evaluatedSplits: splits,
    gatePolicyVersion: M2_HISTORICAL_REPLAY_GATE_POLICY_VERSION,
    gatePolicyDigest: M2_HISTORICAL_REPLAY_GATE_POLICY_DIGEST,
    datasetAcceptance,
    overallMetrics,
    familyMetrics,
    detectorMetrics,
    requiredStratumMetrics,
    gateStatus: thresholdEvaluation.status,
    detectorLifecycleBefore: "DRAFT",
    proposedLifecycle: thresholdEvaluation.status === "PASS"
      ? "REPLAY_VALIDATED"
      : "DRAFT",
    lifecycleMutationAllowed: false,
    candidateEmissionAllowed: false,
    independentAuditRequired: true,
    proposalEligible: thresholdEvaluation.status === "PASS",
    reasonCodes: thresholdEvaluation.reasonCodes,
  } as const;
  const reportDigest = stableContentHash(content);
  return deepFreezeArtifact(M2HistoricalReplayGateReportSchema.parse({
    schemaVersion: M2_HISTORICAL_REPLAY_GATE_VERSION,
    ...content,
    reportDigest,
    reportId: `historical-replay-gate:${reportDigest.slice("sha256:".length)}`,
  }));
}
