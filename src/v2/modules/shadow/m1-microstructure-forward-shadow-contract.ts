import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  RatioSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";
import {
  M1_LISTING_LIFECYCLE_STATES,
} from "../multi-asset-universe/multi-asset-identity-contract";
import {
  M1_MICROSTRUCTURE_FACT_TYPES,
} from "../microstructure/m1-microstructure-contract";
import {
  M1_ASSET_DOMAINS,
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
} from "../source-capability/source-capability-contract";
import {
  M2_PRECURSOR_DIRECTIONS,
  M2_PRECURSOR_FAMILIES,
} from "../../research/m2-precursor-atlas-contract";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M1MultiAssetShadowEvidenceSchema,
  M1MultiAssetShadowUpstreamBindingSchema,
  type M1MultiAssetShadowEvidence,
  type M1MultiAssetShadowUpstreamBinding,
} from "./m1-multi-asset-shadow-contract";

export const M1_MICROSTRUCTURE_FORWARD_PLAN_VERSION =
  "v2-m1-microstructure-forward-selection-plan.v1" as const;
export const M1_MICROSTRUCTURE_FORWARD_CYCLE_VERSION =
  "v2-m1-microstructure-forward-cycle.v1" as const;
export const M1_MICROSTRUCTURE_FORWARD_EVIDENCE_VERSION =
  "v2-m1-microstructure-forward-evidence.v1" as const;

export const M1_MICROSTRUCTURE_FORWARD_PROFILE = deepFreezeArtifact({
  cycleCount: 31,
  cadenceMs: 60_000,
  minObservationMs: 30 * 60_000,
  maxEventLatencyP95Ms: 5_000,
  maxScheduleLagMs: 5_000,
  maxCycleDurationMs: 30_000,
  maxRssBytes: 512 * 1024 * 1024,
  requiredVenueCount: 4,
  requiredFactFamilyCount: M1_MICROSTRUCTURE_FACT_TYPES.length,
  minimumPairsPerVenue: 1,
  matchedControlRatio: 1,
  zeroSequenceGapsRequired: true,
  zeroOutOfOrderRequired: true,
  zeroDroppedEventsRequired: true,
  fullPersistenceRequired: true,
  deterministicPreWindowSelectionRequired: true,
  noCandidateAuthority: true,
  noCapacityAuthority: true,
  requiredNonemptyFactTypes: [
    "PUBLIC_TRADE",
    "TOP_OF_BOOK",
    "ORDER_BOOK_SNAPSHOT",
    "ORDER_BOOK_DELTA",
    "MARK_INDEX_REFERENCE",
  ],
} as const);

export const M1_MICROSTRUCTURE_FORWARD_COLLECTION_TIER = Object.freeze({
  PUBLIC_TRADE: "T2_RESEARCH_BURST",
  TOP_OF_BOOK: "T1_WIDE_MARKET",
  ORDER_BOOK_SNAPSHOT: "T2_RESEARCH_BURST",
  ORDER_BOOK_DELTA: "T2_RESEARCH_BURST",
  LIQUIDATION_EVENT: "T2_RESEARCH_BURST",
  MARK_INDEX_REFERENCE: "T1_WIDE_MARKET",
} as const satisfies Record<
  (typeof M1_MICROSTRUCTURE_FACT_TYPES)[number],
  "T1_WIDE_MARKET" | "T2_RESEARCH_BURST"
>);

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const EligibleAssetDomainSchema = z.enum([
  "CRYPTO_LINEAR_PERPETUAL",
  "EQUITY_SINGLE_NAME_PERPETUAL",
  "EQUITY_INDEX_ETF_PERPETUAL",
] as const satisfies readonly (typeof M1_ASSET_DOMAINS)[number][]);
const EligibleLifecycleSchema = z.enum([
  "TRADING_WARMUP",
  "ESTABLISHED",
] as const satisfies readonly (typeof M1_LISTING_LIFECYCLE_STATES)[number][]);
const UniqueReasonsSchema = ReasonCodesSchema.superRefine(
  (reasons, context) => {
    if (new Set(reasons).size !== reasons.length) {
      context.addIssue({
        code: "custom",
        message: "reason codes must be unique",
      });
    }
  },
);

const SelectionSubjectSchema = z.strictObject({
  subjectId: NonEmptyStringSchema,
  venue: z.enum(M1_VENUE_SOURCE_IDS),
  assetDomain: EligibleAssetDomainSchema,
  lifecycleState: EligibleLifecycleSchema,
  canonicalInstrumentId: NonEmptyStringSchema,
  venueInstrumentId: NonEmptyStringSchema,
  listingEpoch: NonEmptyStringSchema,
  identityEpoch: NonEmptyStringSchema,
  regime: z.enum([
    "TREND",
    "RANGE",
    "TRANSITION",
    "EVENT",
    "UNKNOWN",
  ]),
  liquiditySegment: z.enum(["DEEP", "MEDIUM", "THIN", "UNKNOWN"]),
  featureSnapshotId: NonEmptyStringSchema,
  featureSnapshotHash: DigestSchema,
  selectedAt: IsoDateTimeSchema,
});

const SelectionPairSchema = z.strictObject({
  pairId: NonEmptyStringSchema,
  hypothesisFamily: z.enum(M2_PRECURSOR_FAMILIES),
  hypothesisDirection: z.enum(M2_PRECURSOR_DIRECTIONS),
  trigger: SelectionSubjectSchema,
  matchedControl: SelectionSubjectSchema,
  matchingPolicy: z.literal(
    "SAME_VENUE_DOMAIN_LIFECYCLE_REGIME_LIQUIDITY_POINT_IN_TIME",
  ),
  outcomeKnownAtSelection: z.literal(false),
  candidateEpisodeUsedForSelection: z.literal(false),
}).superRefine((pair, context) => {
  if (pair.trigger.subjectId === pair.matchedControl.subjectId) {
    context.addIssue({
      code: "custom",
      message: "trigger and matched control must be distinct subjects",
      path: ["matchedControl", "subjectId"],
    });
  }
  for (const field of [
    "venue",
    "assetDomain",
    "lifecycleState",
    "regime",
    "liquiditySegment",
    "selectedAt",
  ] as const) {
    if (pair.trigger[field] !== pair.matchedControl[field]) {
      context.addIssue({
        code: "custom",
        message: `matched-control ${field} must equal trigger ${field}`,
        path: ["matchedControl", field],
      });
    }
  }
});

const SelectionPlanInputSchema = z.strictObject({
  releaseId: ReleaseIdSchema,
  upstreamBindingId: NonEmptyStringSchema,
  upstreamBindingHash: DigestSchema,
  generatedAt: IsoDateTimeSchema,
  selectionCutoff: IsoDateTimeSchema,
  windowStartsAt: IsoDateTimeSchema,
  windowEndsAt: IsoDateTimeSchema,
  universeSnapshotId: NonEmptyStringSchema,
  universeSnapshotHash: DigestSchema,
  rotationOrdinal: NonNegativeIntegerSchema,
  deterministicSeedHash: DigestSchema,
  selectionAlgorithm: z.literal(
    "POINT_IN_TIME_DETERMINISTIC_HASH_ROTATION_WITH_MATCHED_CONTROL",
  ),
  pairs: z.array(SelectionPairSchema).min(4).max(1_000),
  outcomeFieldsRead: z.literal(false),
  futureDataRead: z.literal(false),
  candidateStoreRead: z.literal(false),
  automaticSelectionWeightMutationAllowed: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
});

const SelectionPlanCoreSchema = SelectionPlanInputSchema.extend({
  schemaVersion: z.literal(M1_MICROSTRUCTURE_FORWARD_PLAN_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  pairCount: NonNegativeIntegerSchema,
  triggerSubjectCount: NonNegativeIntegerSchema,
  matchedControlSubjectCount: NonNegativeIntegerSchema,
  venuePairCounts: z.strictObject({
    BINANCE_FUTURES: NonNegativeIntegerSchema,
    OKX_SWAP: NonNegativeIntegerSchema,
    BYBIT_DERIVATIVES: NonNegativeIntegerSchema,
    BITGET_FUTURES: NonNegativeIntegerSchema,
  }),
});

export const M1MicrostructureForwardSelectionPlanSchema =
  SelectionPlanCoreSchema.extend({
    planId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((plan, context) => {
    const expectedHash = stableContentHash(selectionPlanCore(plan));
    if (plan.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "selection plan content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      plan.planId !==
        `m1-micro-forward-plan:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "selection plan id mismatch",
        path: ["planId"],
      });
    }
  });

export type M1MicrostructureForwardSelectionPlanInput = z.input<
  typeof SelectionPlanInputSchema
>;
export type M1MicrostructureForwardSelectionPlan = z.infer<
  typeof M1MicrostructureForwardSelectionPlanSchema
>;

function selectionPlanCore(
  plan: z.input<typeof SelectionPlanCoreSchema> & {
    readonly planId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof SelectionPlanCoreSchema> {
  return SelectionPlanCoreSchema.parse({
    schemaVersion: plan.schemaVersion,
    scopeEpoch: plan.scopeEpoch,
    releaseId: plan.releaseId,
    upstreamBindingId: plan.upstreamBindingId,
    upstreamBindingHash: plan.upstreamBindingHash,
    generatedAt: plan.generatedAt,
    selectionCutoff: plan.selectionCutoff,
    windowStartsAt: plan.windowStartsAt,
    windowEndsAt: plan.windowEndsAt,
    universeSnapshotId: plan.universeSnapshotId,
    universeSnapshotHash: plan.universeSnapshotHash,
    rotationOrdinal: plan.rotationOrdinal,
    deterministicSeedHash: plan.deterministicSeedHash,
    selectionAlgorithm: plan.selectionAlgorithm,
    pairs: plan.pairs,
    pairCount: plan.pairCount,
    triggerSubjectCount: plan.triggerSubjectCount,
    matchedControlSubjectCount: plan.matchedControlSubjectCount,
    venuePairCounts: plan.venuePairCounts,
    outcomeFieldsRead: plan.outcomeFieldsRead,
    futureDataRead: plan.futureDataRead,
    candidateStoreRead: plan.candidateStoreRead,
    automaticSelectionWeightMutationAllowed:
      plan.automaticSelectionWeightMutationAllowed,
    candidateAuthorityGranted: plan.candidateAuthorityGranted,
    strategyAuthorityGranted: plan.strategyAuthorityGranted,
    readyAuthorityGranted: plan.readyAuthorityGranted,
  });
}

const venueOrder = new Map(
  M1_VENUE_SOURCE_IDS.map((venue, index) => [venue, index]),
);

export function buildM1MicrostructureForwardSelectionPlan(inputValue: {
  readonly upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  readonly plan: M1MicrostructureForwardSelectionPlanInput;
}): M1MicrostructureForwardSelectionPlan {
  const upstream = M1MultiAssetShadowUpstreamBindingSchema.parse(
    inputValue.upstreamBinding,
  );
  const input = SelectionPlanInputSchema.parse(inputValue.plan);
  if (
    input.releaseId !== upstream.releaseId ||
    input.upstreamBindingId !== upstream.upstreamBindingId ||
    input.upstreamBindingHash !== upstream.contentHash
  ) {
    throw new Error("selection plan exact upstream identity drifted");
  }
  const generatedAt = Date.parse(input.generatedAt);
  const selectionCutoff = Date.parse(input.selectionCutoff);
  const windowStartsAt = Date.parse(input.windowStartsAt);
  const windowEndsAt = Date.parse(input.windowEndsAt);
  if (
    generatedAt > selectionCutoff ||
    selectionCutoff > windowStartsAt ||
    windowEndsAt - windowStartsAt <
      M1_MICROSTRUCTURE_FORWARD_PROFILE.minObservationMs
  ) {
    throw new Error(
      "selection must be frozen before a sufficiently long forward window",
    );
  }
  const pairs = [...input.pairs].sort((left, right) => {
    const venueDelta =
      venueOrder.get(left.trigger.venue)! -
      venueOrder.get(right.trigger.venue)!;
    return venueDelta === 0
      ? left.pairId.localeCompare(right.pairId)
      : venueDelta;
  });
  if (new Set(pairs.map((pair) => pair.pairId)).size !== pairs.length) {
    throw new Error("selection pair ids must be unique");
  }
  const subjectIds = pairs.flatMap((pair) => [
    pair.trigger.subjectId,
    pair.matchedControl.subjectId,
  ]);
  if (new Set(subjectIds).size !== subjectIds.length) {
    throw new Error("selection subjects cannot be reused across pairs");
  }
  if (
    pairs.some((pair) =>
      Date.parse(pair.trigger.selectedAt) > selectionCutoff ||
      Date.parse(pair.matchedControl.selectedAt) > selectionCutoff
    )
  ) {
    throw new Error("selection subjects contain post-cutoff knowledge");
  }
  const venuePairCounts = {
    BINANCE_FUTURES: pairs.filter(
      (pair) => pair.trigger.venue === "BINANCE_FUTURES",
    ).length,
    OKX_SWAP: pairs.filter((pair) => pair.trigger.venue === "OKX_SWAP").length,
    BYBIT_DERIVATIVES: pairs.filter(
      (pair) => pair.trigger.venue === "BYBIT_DERIVATIVES",
    ).length,
    BITGET_FUTURES: pairs.filter(
      (pair) => pair.trigger.venue === "BITGET_FUTURES",
    ).length,
  };
  if (
    Object.values(venuePairCounts).some(
      (count) =>
        count < M1_MICROSTRUCTURE_FORWARD_PROFILE.minimumPairsPerVenue,
    )
  ) {
    throw new Error("every frozen Venue requires at least one matched pair");
  }
  const core = selectionPlanCore({
    ...input,
    schemaVersion: M1_MICROSTRUCTURE_FORWARD_PLAN_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    pairs,
    pairCount: pairs.length,
    triggerSubjectCount: pairs.length,
    matchedControlSubjectCount: pairs.length,
    venuePairCounts,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1MicrostructureForwardSelectionPlanSchema.parse({
    ...core,
    planId: `m1-micro-forward-plan:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}

const CoverageCellSchema = z.strictObject({
  pairId: NonEmptyStringSchema,
  selectionRole: z.enum(["RESEARCH_TRIGGER", "MATCHED_CONTROL"]),
  subjectId: NonEmptyStringSchema,
  venue: z.enum(M1_VENUE_SOURCE_IDS),
  factType: z.enum(M1_MICROSTRUCTURE_FACT_TYPES),
  collectionTier: z.enum(["T1_WIDE_MARKET", "T2_RESEARCH_BURST"]),
  disposition: z.enum([
    "OBSERVED_NONEMPTY",
    "OBSERVED_EMPTY",
    "PARTIAL",
    "STALE",
    "UNAVAILABLE",
  ]),
  attemptCount: NonNegativeIntegerSchema,
  heartbeatObserved: z.boolean(),
  recordCount: NonNegativeIntegerSchema,
  freshRecordCount: NonNegativeIntegerSchema,
  partialRecordCount: NonNegativeIntegerSchema,
  staleRecordCount: NonNegativeIntegerSchema,
  persistedRecordCount: NonNegativeIntegerSchema,
  sequenceGapCount: NonNegativeIntegerSchema,
  resyncCount: NonNegativeIntegerSchema,
  outOfOrderCount: NonNegativeIntegerSchema,
  droppedEventCount: NonNegativeIntegerSchema,
  lateEventCount: NonNegativeIntegerSchema,
  eventLatencyP95Ms: NonNegativeIntegerSchema.nullable(),
  bytesReceived: NonNegativeIntegerSchema,
  compressedBytes: NonNegativeIntegerSchema,
  reasonCodes: UniqueReasonsSchema,
}).superRefine((cell, context) => {
  if (
    cell.collectionTier !==
      M1_MICROSTRUCTURE_FORWARD_COLLECTION_TIER[cell.factType]
  ) {
    context.addIssue({
      code: "custom",
      message: "fact family collection tier drifted",
      path: ["collectionTier"],
    });
  }
  if (
    cell.freshRecordCount +
        cell.partialRecordCount +
        cell.staleRecordCount !==
      cell.recordCount ||
    cell.persistedRecordCount > cell.recordCount ||
    cell.compressedBytes > cell.bytesReceived
  ) {
    context.addIssue({
      code: "custom",
      message: "coverage cell record or byte denominator does not reconcile",
    });
  }
  const nonempty = cell.disposition === "OBSERVED_NONEMPTY";
  const empty = cell.disposition === "OBSERVED_EMPTY";
  const unavailable = cell.disposition === "UNAVAILABLE";
  if (
    nonempty !== (cell.recordCount > 0 && cell.freshRecordCount === cell.recordCount)
  ) {
    context.addIssue({
      code: "custom",
      message: "nonempty disposition must contain only fresh records",
      path: ["disposition"],
    });
  }
  if (
    empty &&
    (
      cell.recordCount !== 0 ||
      !cell.heartbeatObserved ||
      cell.attemptCount === 0 ||
      cell.eventLatencyP95Ms !== null
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "observed-empty requires a healthy attempted stream and zero records",
      path: ["disposition"],
    });
  }
  if (
    unavailable &&
    (
      cell.recordCount !== 0 ||
      cell.heartbeatObserved ||
      cell.reasonCodes.length === 0
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "unavailable cannot masquerade as observed empty",
      path: ["disposition"],
    });
  }
  if (
    cell.recordCount > 0 &&
    (
      cell.attemptCount === 0 ||
      !cell.heartbeatObserved ||
      cell.eventLatencyP95Ms === null
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "observed records require attempt, heartbeat and measured latency",
    });
  }
  if (
    ["PARTIAL", "STALE", "UNAVAILABLE"].includes(cell.disposition) &&
    cell.reasonCodes.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "degraded coverage requires reason codes",
      path: ["reasonCodes"],
    });
  }
  if (
    (cell.sequenceGapCount > 0 ||
      cell.outOfOrderCount > 0 ||
      cell.droppedEventCount > 0 ||
      cell.lateEventCount > 0) &&
    cell.reasonCodes.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "quality violations require reason codes",
      path: ["reasonCodes"],
    });
  }
});

export type M1MicrostructureForwardCoverageCell = z.infer<
  typeof CoverageCellSchema
>;

const ResourceSampleSchema = z.strictObject({
  redisReadBytes: NonNegativeIntegerSchema,
  redisWriteBytes: NonNegativeIntegerSchema,
  redisPeakUsedBytes: NonNegativeIntegerSchema,
  redisConfiguredMaxBytes: NonNegativeIntegerSchema,
  postgresInsertedRows: NonNegativeIntegerSchema,
  postgresWriteBytes: NonNegativeIntegerSchema,
  postgresWalBytes: NonNegativeIntegerSchema,
  cosObjectCount: NonNegativeIntegerSchema,
  cosWriteBytes: NonNegativeIntegerSchema,
  networkIngressBytes: NonNegativeIntegerSchema,
  networkEgressBytes: NonNegativeIntegerSchema,
  rawPayloadBytes: NonNegativeIntegerSchema,
  compressedPayloadBytes: NonNegativeIntegerSchema,
  persistedPayloadBytes: NonNegativeIntegerSchema,
  cpuP95Percent: z.number().finite().min(0).max(100),
  rssBytes: NonNegativeIntegerSchema,
  diskFreeBytesBefore: NonNegativeIntegerSchema,
  diskFreeBytesAfter: NonNegativeIntegerSchema,
}).superRefine((resource, context) => {
  if (
    resource.compressedPayloadBytes > resource.rawPayloadBytes ||
    resource.persistedPayloadBytes > resource.compressedPayloadBytes ||
    resource.redisPeakUsedBytes > resource.redisConfiguredMaxBytes
  ) {
    context.addIssue({
      code: "custom",
      message: "resource byte or memory denominator does not reconcile",
    });
  }
});

const ForwardCycleInputSchema = z.strictObject({
  releaseId: ReleaseIdSchema,
  upstreamBindingId: NonEmptyStringSchema,
  upstreamBindingHash: DigestSchema,
  planId: NonEmptyStringSchema,
  planHash: DigestSchema,
  workerRunId: NonEmptyStringSchema,
  runtimeConfigDigest: DigestSchema,
  cycleIndex: z.number().int().min(1).max(31),
  scheduledAt: IsoDateTimeSchema,
  startedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema,
  scheduleLagMs: NonNegativeIntegerSchema,
  durationMs: NonNegativeIntegerSchema,
  missedScheduleStarts: NonNegativeIntegerSchema,
  coverageCells: z.array(CoverageCellSchema).min(1).max(20_000),
  resources: ResourceSampleSchema,
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  runtimeAuthorityGranted: z.literal(false),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  capacityAuthorityGranted: z.literal(false),
  productionChanged: z.literal(false),
});

const ForwardCycleCoreSchema = ForwardCycleInputSchema.extend({
  schemaVersion: z.literal(M1_MICROSTRUCTURE_FORWARD_CYCLE_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  expectedCoverageCellCount: NonNegativeIntegerSchema,
  observedNonemptyCellCount: NonNegativeIntegerSchema,
  observedEmptyCellCount: NonNegativeIntegerSchema,
  degradedCellCount: NonNegativeIntegerSchema,
  unavailableCellCount: NonNegativeIntegerSchema,
  totalRecordCount: NonNegativeIntegerSchema,
  persistedRecordCount: NonNegativeIntegerSchema,
  sequenceGapCount: NonNegativeIntegerSchema,
  outOfOrderCount: NonNegativeIntegerSchema,
  droppedEventCount: NonNegativeIntegerSchema,
  lateEventCount: NonNegativeIntegerSchema,
  maximumEventLatencyP95Ms: NonNegativeIntegerSchema,
  captureQualityGate: z.enum(["PASS", "BLOCKED"]),
  status: z.enum([
    "PASS_COMPLETE_FORWARD_CAPTURE_NO_AUTHORITY",
    "BLOCKED_COVERAGE_OR_QUALITY_NO_STALE_PROMOTION",
  ]),
  reasonCodes: UniqueReasonsSchema,
});

export const M1MicrostructureForwardCycleSchema =
  ForwardCycleCoreSchema.extend({
    cycleId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((cycle, context) => {
    const expectedHash = stableContentHash(forwardCycleCore(cycle));
    if (cycle.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "forward cycle content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      cycle.cycleId !==
        `m1-micro-forward-cycle:${cycle.workerRunId}:${cycle.cycleIndex}:${expectedHash.slice(7, 23)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "forward cycle id mismatch",
        path: ["cycleId"],
      });
    }
  });

export type M1MicrostructureForwardCycleInput = z.input<
  typeof ForwardCycleInputSchema
>;
export type M1MicrostructureForwardCycle = z.infer<
  typeof M1MicrostructureForwardCycleSchema
>;

function forwardCycleCore(
  cycle: z.input<typeof ForwardCycleCoreSchema> & {
    readonly cycleId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof ForwardCycleCoreSchema> {
  return ForwardCycleCoreSchema.parse({
    schemaVersion: cycle.schemaVersion,
    scopeEpoch: cycle.scopeEpoch,
    releaseId: cycle.releaseId,
    upstreamBindingId: cycle.upstreamBindingId,
    upstreamBindingHash: cycle.upstreamBindingHash,
    planId: cycle.planId,
    planHash: cycle.planHash,
    workerRunId: cycle.workerRunId,
    runtimeConfigDigest: cycle.runtimeConfigDigest,
    cycleIndex: cycle.cycleIndex,
    scheduledAt: cycle.scheduledAt,
    startedAt: cycle.startedAt,
    sourceCutoff: cycle.sourceCutoff,
    completedAt: cycle.completedAt,
    scheduleLagMs: cycle.scheduleLagMs,
    durationMs: cycle.durationMs,
    missedScheduleStarts: cycle.missedScheduleStarts,
    coverageCells: cycle.coverageCells,
    resources: cycle.resources,
    expectedCoverageCellCount: cycle.expectedCoverageCellCount,
    observedNonemptyCellCount: cycle.observedNonemptyCellCount,
    observedEmptyCellCount: cycle.observedEmptyCellCount,
    degradedCellCount: cycle.degradedCellCount,
    unavailableCellCount: cycle.unavailableCellCount,
    totalRecordCount: cycle.totalRecordCount,
    persistedRecordCount: cycle.persistedRecordCount,
    sequenceGapCount: cycle.sequenceGapCount,
    outOfOrderCount: cycle.outOfOrderCount,
    droppedEventCount: cycle.droppedEventCount,
    lateEventCount: cycle.lateEventCount,
    maximumEventLatencyP95Ms: cycle.maximumEventLatencyP95Ms,
    captureQualityGate: cycle.captureQualityGate,
    status: cycle.status,
    reasonCodes: cycle.reasonCodes,
    rawBodyRetained: cycle.rawBodyRetained,
    secretMaterialPresent: cycle.secretMaterialPresent,
    runtimeAuthorityGranted: cycle.runtimeAuthorityGranted,
    factAuthorityGranted: cycle.factAuthorityGranted,
    candidateAuthorityGranted: cycle.candidateAuthorityGranted,
    strategyAuthorityGranted: cycle.strategyAuthorityGranted,
    readyAuthorityGranted: cycle.readyAuthorityGranted,
    capacityAuthorityGranted: cycle.capacityAuthorityGranted,
    productionChanged: cycle.productionChanged,
  });
}

function coverageKey(input: {
  readonly pairId: string;
  readonly selectionRole: "RESEARCH_TRIGGER" | "MATCHED_CONTROL";
  readonly subjectId: string;
  readonly factType: (typeof M1_MICROSTRUCTURE_FACT_TYPES)[number];
}): string {
  return [
    input.pairId,
    input.selectionRole,
    input.subjectId,
    input.factType,
  ].join("|");
}

function expectedCoverage(
  plan: M1MicrostructureForwardSelectionPlan,
): readonly Readonly<{
  pairId: string;
  selectionRole: "RESEARCH_TRIGGER" | "MATCHED_CONTROL";
  subjectId: string;
  venue: (typeof M1_VENUE_SOURCE_IDS)[number];
  factType: (typeof M1_MICROSTRUCTURE_FACT_TYPES)[number];
}>[] {
  return plan.pairs.flatMap((pair) =>
    ([
      ["RESEARCH_TRIGGER", pair.trigger] as const,
      ["MATCHED_CONTROL", pair.matchedControl] as const,
    ]).flatMap(([selectionRole, subject]) =>
      M1_MICROSTRUCTURE_FACT_TYPES.map((factType) => ({
        pairId: pair.pairId,
        selectionRole,
        subjectId: subject.subjectId,
        venue: subject.venue,
        factType,
      }))
    )
  );
}

export function buildM1MicrostructureForwardCycle(inputValue: {
  readonly plan: M1MicrostructureForwardSelectionPlan;
  readonly cycle: M1MicrostructureForwardCycleInput;
}): M1MicrostructureForwardCycle {
  const plan = M1MicrostructureForwardSelectionPlanSchema.parse(
    inputValue.plan,
  );
  const input = ForwardCycleInputSchema.parse(inputValue.cycle);
  if (
    input.releaseId !== plan.releaseId ||
    input.upstreamBindingId !== plan.upstreamBindingId ||
    input.upstreamBindingHash !== plan.upstreamBindingHash ||
    input.planId !== plan.planId ||
    input.planHash !== plan.contentHash
  ) {
    throw new Error("forward cycle exact release, upstream or plan identity drifted");
  }
  const times = [
    Date.parse(input.scheduledAt),
    Date.parse(input.startedAt),
    Date.parse(input.sourceCutoff),
    Date.parse(input.completedAt),
  ];
  if (
    times[0]! > times[1]! ||
    times[1]! > times[2]! ||
    times[2]! > times[3]! ||
    input.scheduleLagMs !== times[1]! - times[0]! ||
    input.durationMs !== times[3]! - times[1]!
  ) {
    throw new Error("forward cycle timestamps or measured durations disagree");
  }
  const expected = expectedCoverage(plan);
  const expectedByKey = new Map(
    expected.map((cell) => [coverageKey(cell), cell]),
  );
  const cells = [...input.coverageCells].sort((left, right) =>
    coverageKey(left).localeCompare(coverageKey(right))
  );
  if (
    cells.length !== expected.length ||
    new Set(cells.map(coverageKey)).size !== cells.length ||
    cells.some((cell) => {
      const expectedCell = expectedByKey.get(coverageKey(cell));
      return expectedCell === undefined || expectedCell.venue !== cell.venue;
    })
  ) {
    throw new Error(
      "coverage cells must equal the exact pair-role-subject-fact denominator",
    );
  }
  const totalRecordCount = cells.reduce(
    (total, cell) => total + cell.recordCount,
    0,
  );
  const persistedRecordCount = cells.reduce(
    (total, cell) => total + cell.persistedRecordCount,
    0,
  );
  const sequenceGapCount = cells.reduce(
    (total, cell) => total + cell.sequenceGapCount,
    0,
  );
  const outOfOrderCount = cells.reduce(
    (total, cell) => total + cell.outOfOrderCount,
    0,
  );
  const droppedEventCount = cells.reduce(
    (total, cell) => total + cell.droppedEventCount,
    0,
  );
  const lateEventCount = cells.reduce(
    (total, cell) => total + cell.lateEventCount,
    0,
  );
  const latencies = cells.flatMap((cell) =>
    cell.eventLatencyP95Ms === null ? [] : [cell.eventLatencyP95Ms]
  );
  const maximumEventLatencyP95Ms =
    latencies.length === 0 ? 0 : Math.max(...latencies);
  const observedNonemptyCellCount = cells.filter(
    (cell) => cell.disposition === "OBSERVED_NONEMPTY",
  ).length;
  const observedEmptyCellCount = cells.filter(
    (cell) => cell.disposition === "OBSERVED_EMPTY",
  ).length;
  const degradedCellCount = cells.filter((cell) =>
    ["PARTIAL", "STALE"].includes(cell.disposition)
  ).length;
  const unavailableCellCount = cells.filter(
    (cell) => cell.disposition === "UNAVAILABLE",
  ).length;
  const bytesReceived = cells.reduce(
    (total, cell) => total + cell.bytesReceived,
    0,
  );
  const compressedBytes = cells.reduce(
    (total, cell) => total + cell.compressedBytes,
    0,
  );
  if (
    input.resources.rawPayloadBytes !== bytesReceived ||
    input.resources.compressedPayloadBytes !== compressedBytes ||
    input.resources.postgresInsertedRows !== persistedRecordCount
  ) {
    throw new Error(
      "cycle resource evidence must reconcile to captured and persisted facts",
    );
  }
  const pass =
    input.scheduleLagMs <=
      M1_MICROSTRUCTURE_FORWARD_PROFILE.maxScheduleLagMs &&
    input.durationMs <=
      M1_MICROSTRUCTURE_FORWARD_PROFILE.maxCycleDurationMs &&
    input.missedScheduleStarts === 0 &&
    input.resources.rssBytes <=
      M1_MICROSTRUCTURE_FORWARD_PROFILE.maxRssBytes &&
    degradedCellCount === 0 &&
    unavailableCellCount === 0 &&
    sequenceGapCount === 0 &&
    outOfOrderCount === 0 &&
    droppedEventCount === 0 &&
    lateEventCount === 0 &&
    maximumEventLatencyP95Ms <=
      M1_MICROSTRUCTURE_FORWARD_PROFILE.maxEventLatencyP95Ms &&
    persistedRecordCount === totalRecordCount;
  const reasons = [
    ...(degradedCellCount > 0 ? ["degraded_fact_family_coverage"] : []),
    ...(unavailableCellCount > 0 ? ["unavailable_fact_family_coverage"] : []),
    ...(sequenceGapCount > 0 ? ["sequence_gap_observed"] : []),
    ...(outOfOrderCount > 0 ? ["out_of_order_event_observed"] : []),
    ...(droppedEventCount > 0 ? ["dropped_event_observed"] : []),
    ...(lateEventCount > 0 ? ["late_event_observed"] : []),
    ...(
      maximumEventLatencyP95Ms >
        M1_MICROSTRUCTURE_FORWARD_PROFILE.maxEventLatencyP95Ms
        ? ["event_latency_slo_exceeded"]
        : []
    ),
    ...(
      persistedRecordCount !== totalRecordCount
        ? ["fact_persistence_incomplete"]
        : []
    ),
    ...(
      input.scheduleLagMs >
          M1_MICROSTRUCTURE_FORWARD_PROFILE.maxScheduleLagMs ||
        input.durationMs >
          M1_MICROSTRUCTURE_FORWARD_PROFILE.maxCycleDurationMs ||
        input.missedScheduleStarts > 0
        ? ["cycle_runtime_slo_exceeded"]
        : []
    ),
    ...(
      input.resources.rssBytes >
        M1_MICROSTRUCTURE_FORWARD_PROFILE.maxRssBytes
        ? ["rss_slo_exceeded"]
        : []
    ),
  ];
  const core = forwardCycleCore({
    ...input,
    schemaVersion: M1_MICROSTRUCTURE_FORWARD_CYCLE_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    coverageCells: cells,
    expectedCoverageCellCount: expected.length,
    observedNonemptyCellCount,
    observedEmptyCellCount,
    degradedCellCount,
    unavailableCellCount,
    totalRecordCount,
    persistedRecordCount,
    sequenceGapCount,
    outOfOrderCount,
    droppedEventCount,
    lateEventCount,
    maximumEventLatencyP95Ms,
    captureQualityGate: pass ? "PASS" : "BLOCKED",
    status: pass
      ? "PASS_COMPLETE_FORWARD_CAPTURE_NO_AUTHORITY"
      : "BLOCKED_COVERAGE_OR_QUALITY_NO_STALE_PROMOTION",
    reasonCodes: [...new Set(reasons)],
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1MicrostructureForwardCycleSchema.parse({
    ...core,
    cycleId:
      `m1-micro-forward-cycle:${core.workerRunId}:${core.cycleIndex}:${contentHash.slice(7, 23)}`,
    contentHash,
  }));
}

const HostRecoverySchema = z.strictObject({
  status: z.enum(["RESTORED_EXACT", "NOT_EXECUTED_TEST_ONLY", "FAILED"]),
  topologyBeforeHash: DigestSchema,
  topologyAfterHash: DigestSchema,
  nonTargetServiceCountBefore: NonNegativeIntegerSchema,
  nonTargetServiceCountAfter: NonNegativeIntegerSchema,
  temporaryContainerCountAfter: NonNegativeIntegerSchema,
  temporaryNetworkCountAfter: NonNegativeIntegerSchema,
  temporaryVolumeCountAfter: NonNegativeIntegerSchema,
  stagingPathCountAfter: NonNegativeIntegerSchema,
  productionChanged: z.literal(false),
  reasonCodes: UniqueReasonsSchema,
}).superRefine((recovery, context) => {
  const exact =
    recovery.topologyBeforeHash === recovery.topologyAfterHash &&
    recovery.nonTargetServiceCountBefore ===
      recovery.nonTargetServiceCountAfter &&
    recovery.temporaryContainerCountAfter === 0 &&
    recovery.temporaryNetworkCountAfter === 0 &&
    recovery.temporaryVolumeCountAfter === 0 &&
    recovery.stagingPathCountAfter === 0;
  if ((recovery.status === "RESTORED_EXACT") !== exact) {
    context.addIssue({
      code: "custom",
      message: "host recovery status overstates restored topology",
      path: ["status"],
    });
  }
  if (recovery.status !== "RESTORED_EXACT" && recovery.reasonCodes.length === 0) {
    context.addIssue({
      code: "custom",
      message: "non-exact host recovery requires reason codes",
      path: ["reasonCodes"],
    });
  }
});

const ForwardEvidenceCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_MICROSTRUCTURE_FORWARD_EVIDENCE_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  evaluatedAt: IsoDateTimeSchema,
  upstreamBindingId: NonEmptyStringSchema,
  upstreamBindingHash: DigestSchema,
  multiAssetShadowEvidenceId: NonEmptyStringSchema,
  multiAssetShadowEvidenceHash: DigestSchema,
  planId: NonEmptyStringSchema,
  planHash: DigestSchema,
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  networkEnvironment: z.enum([
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  workerRunId: NonEmptyStringSchema,
  runtimeConfigDigest: DigestSchema,
  cycleCount: z.literal(31),
  observationMs: NonNegativeIntegerSchema,
  cycleIds: z.array(NonEmptyStringSchema).length(31),
  cycleContentHashes: z.array(DigestSchema).length(31),
  expectedCoverageCellCount: NonNegativeIntegerSchema,
  observedNonemptyCellCount: NonNegativeIntegerSchema,
  observedEmptyCellCount: NonNegativeIntegerSchema,
  degradedCellCount: NonNegativeIntegerSchema,
  unavailableCellCount: NonNegativeIntegerSchema,
  totalRecordCount: NonNegativeIntegerSchema,
  persistedRecordCount: NonNegativeIntegerSchema,
  sequenceGapCount: NonNegativeIntegerSchema,
  outOfOrderCount: NonNegativeIntegerSchema,
  droppedEventCount: NonNegativeIntegerSchema,
  lateEventCount: NonNegativeIntegerSchema,
  maximumEventLatencyP95Ms: NonNegativeIntegerSchema,
  captureQualityPassCycleCount: NonNegativeIntegerSchema,
  matchedControlCoverageRatio: RatioSchema,
  expectedRequiredNonemptySubjectFactCount: NonNegativeIntegerSchema,
  observedRequiredNonemptySubjectFactCount: NonNegativeIntegerSchema,
  venueFactFamilyPass: z.strictObject({
    BINANCE_FUTURES: z.boolean(),
    OKX_SWAP: z.boolean(),
    BYBIT_DERIVATIVES: z.boolean(),
    BITGET_FUTURES: z.boolean(),
  }),
  resourceTotals: z.strictObject({
    redisReadBytes: NonNegativeIntegerSchema,
    redisWriteBytes: NonNegativeIntegerSchema,
    postgresInsertedRows: NonNegativeIntegerSchema,
    postgresWriteBytes: NonNegativeIntegerSchema,
    postgresWalBytes: NonNegativeIntegerSchema,
    cosObjectCount: NonNegativeIntegerSchema,
    cosWriteBytes: NonNegativeIntegerSchema,
    networkIngressBytes: NonNegativeIntegerSchema,
    networkEgressBytes: NonNegativeIntegerSchema,
    rawPayloadBytes: NonNegativeIntegerSchema,
    compressedPayloadBytes: NonNegativeIntegerSchema,
    persistedPayloadBytes: NonNegativeIntegerSchema,
    maximumRssBytes: NonNegativeIntegerSchema,
    maximumCpuP95Percent: z.number().finite().min(0).max(100),
  }),
  hostRecovery: HostRecoverySchema,
  captureQualityGate: z.enum(["PASS", "BLOCKED"]),
  upstreamMultiAssetGate: z.enum(["PASS", "BLOCKED"]),
  resourceEvidenceGate: z.enum(["PASS", "BLOCKED"]),
  releaseAdmissionGate: z.enum(["PASS", "BLOCKED"]),
  status: z.enum([
    "PASS_FORWARD_MICROSTRUCTURE_SHADOW_NO_AUTHORITY",
    "BLOCKED_UPSTREAM_MULTI_ASSET_GATE",
    "BLOCKED_FORWARD_COVERAGE_OR_QUALITY",
    "BLOCKED_HOST_RECOVERY",
    "TEST_ONLY_NOT_FORWARD_LIVE_EVIDENCE",
  ]),
  reasonCodes: UniqueReasonsSchema,
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  capacityAuthorityGranted: z.literal(false),
  automaticTradingAllowed: z.literal(false),
  productionChanged: z.literal(false),
  secretMaterialPresent: z.literal(false),
});

export const M1MicrostructureForwardEvidenceSchema =
  ForwardEvidenceCoreSchema.extend({
    evidenceId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((evidence, context) => {
    const live =
      evidence.evidenceClass === "LIVE_READ_ONLY" &&
      evidence.networkEnvironment === "TENCENT_ISOLATED_READ_ONLY";
    const testOnly =
      evidence.evidenceClass === "TEST_ONLY" &&
      evidence.networkEnvironment === "TEST_HARNESS";
    const capturePass =
      evidence.observationMs >=
        M1_MICROSTRUCTURE_FORWARD_PROFILE.minObservationMs &&
      evidence.captureQualityPassCycleCount === evidence.cycleCount &&
      evidence.expectedCoverageCellCount ===
        evidence.observedNonemptyCellCount +
          evidence.observedEmptyCellCount +
          evidence.degradedCellCount +
          evidence.unavailableCellCount &&
      evidence.degradedCellCount === 0 &&
      evidence.unavailableCellCount === 0 &&
      evidence.sequenceGapCount === 0 &&
      evidence.outOfOrderCount === 0 &&
      evidence.droppedEventCount === 0 &&
      evidence.lateEventCount === 0 &&
      evidence.persistedRecordCount === evidence.totalRecordCount &&
      evidence.maximumEventLatencyP95Ms <=
        M1_MICROSTRUCTURE_FORWARD_PROFILE.maxEventLatencyP95Ms &&
      evidence.matchedControlCoverageRatio === 1 &&
      evidence.expectedRequiredNonemptySubjectFactCount > 0 &&
      evidence.observedRequiredNonemptySubjectFactCount ===
        evidence.expectedRequiredNonemptySubjectFactCount &&
      Object.values(evidence.venueFactFamilyPass).every(Boolean);
    const recoveryPass = testOnly
      ? evidence.hostRecovery.status === "NOT_EXECUTED_TEST_ONLY"
      : evidence.hostRecovery.status === "RESTORED_EXACT";
    const resourcePass =
      evidence.resourceTotals.rawPayloadBytes >=
        evidence.resourceTotals.compressedPayloadBytes &&
      evidence.resourceTotals.compressedPayloadBytes >=
        evidence.resourceTotals.persistedPayloadBytes &&
      evidence.resourceTotals.maximumRssBytes <=
        M1_MICROSTRUCTURE_FORWARD_PROFILE.maxRssBytes &&
      recoveryPass;
    const upstreamPass = evidence.upstreamMultiAssetGate === "PASS";
    const expectedStatus = testOnly
      ? "TEST_ONLY_NOT_FORWARD_LIVE_EVIDENCE"
      : !capturePass
        ? "BLOCKED_FORWARD_COVERAGE_OR_QUALITY"
        : !recoveryPass
          ? "BLOCKED_HOST_RECOVERY"
          : !upstreamPass
            ? "BLOCKED_UPSTREAM_MULTI_ASSET_GATE"
            : live
              ? "PASS_FORWARD_MICROSTRUCTURE_SHADOW_NO_AUTHORITY"
              : "BLOCKED_FORWARD_COVERAGE_OR_QUALITY";
    if (
      (!live && !testOnly) ||
      evidence.captureQualityGate !== (capturePass ? "PASS" : "BLOCKED") ||
      evidence.resourceEvidenceGate !==
        (resourcePass ? "PASS" : "BLOCKED") ||
      evidence.releaseAdmissionGate !==
        (
          live && capturePass && upstreamPass && resourcePass
            ? "PASS"
            : "BLOCKED"
        ) ||
      evidence.status !== expectedStatus
    ) {
      context.addIssue({
        code: "custom",
        message: "forward evidence Gate or status overstates observed metrics",
        path: ["status"],
      });
    }
    const expectedHash = stableContentHash(forwardEvidenceCore(evidence));
    if (evidence.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "forward evidence content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      evidence.evidenceId !==
        `m1-micro-forward-evidence:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "forward evidence id mismatch",
        path: ["evidenceId"],
      });
    }
  });

export type M1MicrostructureForwardEvidence = z.infer<
  typeof M1MicrostructureForwardEvidenceSchema
>;
export type M1MicrostructureForwardHostRecovery = z.input<
  typeof HostRecoverySchema
>;

function forwardEvidenceCore(
  evidence: z.input<typeof ForwardEvidenceCoreSchema> & {
    readonly evidenceId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof ForwardEvidenceCoreSchema> {
  return ForwardEvidenceCoreSchema.parse({
    schemaVersion: evidence.schemaVersion,
    scopeEpoch: evidence.scopeEpoch,
    releaseId: evidence.releaseId,
    evaluatedAt: evidence.evaluatedAt,
    upstreamBindingId: evidence.upstreamBindingId,
    upstreamBindingHash: evidence.upstreamBindingHash,
    multiAssetShadowEvidenceId: evidence.multiAssetShadowEvidenceId,
    multiAssetShadowEvidenceHash: evidence.multiAssetShadowEvidenceHash,
    planId: evidence.planId,
    planHash: evidence.planHash,
    evidenceClass: evidence.evidenceClass,
    networkEnvironment: evidence.networkEnvironment,
    workerRunId: evidence.workerRunId,
    runtimeConfigDigest: evidence.runtimeConfigDigest,
    cycleCount: evidence.cycleCount,
    observationMs: evidence.observationMs,
    cycleIds: evidence.cycleIds,
    cycleContentHashes: evidence.cycleContentHashes,
    expectedCoverageCellCount: evidence.expectedCoverageCellCount,
    observedNonemptyCellCount: evidence.observedNonemptyCellCount,
    observedEmptyCellCount: evidence.observedEmptyCellCount,
    degradedCellCount: evidence.degradedCellCount,
    unavailableCellCount: evidence.unavailableCellCount,
    totalRecordCount: evidence.totalRecordCount,
    persistedRecordCount: evidence.persistedRecordCount,
    sequenceGapCount: evidence.sequenceGapCount,
    outOfOrderCount: evidence.outOfOrderCount,
    droppedEventCount: evidence.droppedEventCount,
    lateEventCount: evidence.lateEventCount,
    maximumEventLatencyP95Ms: evidence.maximumEventLatencyP95Ms,
    captureQualityPassCycleCount: evidence.captureQualityPassCycleCount,
    matchedControlCoverageRatio: evidence.matchedControlCoverageRatio,
    expectedRequiredNonemptySubjectFactCount:
      evidence.expectedRequiredNonemptySubjectFactCount,
    observedRequiredNonemptySubjectFactCount:
      evidence.observedRequiredNonemptySubjectFactCount,
    venueFactFamilyPass: evidence.venueFactFamilyPass,
    resourceTotals: evidence.resourceTotals,
    hostRecovery: evidence.hostRecovery,
    captureQualityGate: evidence.captureQualityGate,
    upstreamMultiAssetGate: evidence.upstreamMultiAssetGate,
    resourceEvidenceGate: evidence.resourceEvidenceGate,
    releaseAdmissionGate: evidence.releaseAdmissionGate,
    status: evidence.status,
    reasonCodes: evidence.reasonCodes,
    candidateAuthorityGranted: evidence.candidateAuthorityGranted,
    strategyAuthorityGranted: evidence.strategyAuthorityGranted,
    readyAuthorityGranted: evidence.readyAuthorityGranted,
    capacityAuthorityGranted: evidence.capacityAuthorityGranted,
    automaticTradingAllowed: evidence.automaticTradingAllowed,
    productionChanged: evidence.productionChanged,
    secretMaterialPresent: evidence.secretMaterialPresent,
  });
}

function sumCycleField(
  cycles: readonly M1MicrostructureForwardCycle[],
  field: keyof Pick<
    M1MicrostructureForwardCycle,
    | "expectedCoverageCellCount"
    | "observedNonemptyCellCount"
    | "observedEmptyCellCount"
    | "degradedCellCount"
    | "unavailableCellCount"
    | "totalRecordCount"
    | "persistedRecordCount"
    | "sequenceGapCount"
    | "outOfOrderCount"
    | "droppedEventCount"
    | "lateEventCount"
  >,
): number {
  return cycles.reduce((total, cycle) => total + cycle[field], 0);
}

function sumResourceField(
  cycles: readonly M1MicrostructureForwardCycle[],
  field: keyof Pick<
    z.infer<typeof ResourceSampleSchema>,
    | "redisReadBytes"
    | "redisWriteBytes"
    | "postgresInsertedRows"
    | "postgresWriteBytes"
    | "postgresWalBytes"
    | "cosObjectCount"
    | "cosWriteBytes"
    | "networkIngressBytes"
    | "networkEgressBytes"
    | "rawPayloadBytes"
    | "compressedPayloadBytes"
    | "persistedPayloadBytes"
  >,
): number {
  return cycles.reduce((total, cycle) => total + cycle.resources[field], 0);
}

export function buildM1MicrostructureForwardEvidence(input: {
  readonly upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  readonly multiAssetShadowEvidence: M1MultiAssetShadowEvidence;
  readonly plan: M1MicrostructureForwardSelectionPlan;
  readonly cycles: readonly M1MicrostructureForwardCycle[];
  readonly evaluatedAt: string;
  readonly hostRecovery: M1MicrostructureForwardHostRecovery;
}): M1MicrostructureForwardEvidence {
  const upstream = M1MultiAssetShadowUpstreamBindingSchema.parse(
    input.upstreamBinding,
  );
  const multiAsset = M1MultiAssetShadowEvidenceSchema.parse(
    input.multiAssetShadowEvidence,
  );
  const plan = M1MicrostructureForwardSelectionPlanSchema.parse(input.plan);
  const cycles = input.cycles.map((cycle) =>
    M1MicrostructureForwardCycleSchema.parse(cycle)
  );
  const hostRecovery = HostRecoverySchema.parse(input.hostRecovery);
  if (
    cycles.length !== M1_MICROSTRUCTURE_FORWARD_PROFILE.cycleCount ||
    multiAsset.releaseId !== upstream.releaseId ||
    plan.releaseId !== upstream.releaseId ||
    multiAsset.upstreamBindingId !== upstream.upstreamBindingId ||
    plan.upstreamBindingId !== upstream.upstreamBindingId ||
    multiAsset.upstreamBindingHash !== upstream.contentHash ||
    plan.upstreamBindingHash !== upstream.contentHash ||
    multiAsset.evidenceClass !== upstream.evidenceClass ||
    multiAsset.networkEnvironment !== upstream.networkEnvironment
  ) {
    throw new Error(
      "forward evidence exact release, upstream or evidence class drifted",
    );
  }
  for (const [index, cycle] of cycles.entries()) {
    if (
      cycle.cycleIndex !== index + 1 ||
      cycle.releaseId !== plan.releaseId ||
      cycle.planId !== plan.planId ||
      cycle.planHash !== plan.contentHash
    ) {
      throw new Error("forward evidence cycle identity or order drifted");
    }
    if (index === 0) {
      continue;
    }
    const previous = cycles[index - 1]!;
    if (
      cycle.workerRunId !== previous.workerRunId ||
      cycle.runtimeConfigDigest !== previous.runtimeConfigDigest ||
      Date.parse(cycle.scheduledAt) - Date.parse(previous.scheduledAt) !==
        M1_MICROSTRUCTURE_FORWARD_PROFILE.cadenceMs ||
      Date.parse(cycle.startedAt) < Date.parse(previous.completedAt) ||
      Date.parse(cycle.sourceCutoff) <= Date.parse(previous.sourceCutoff)
    ) {
      throw new Error(
        "stitched, overlapping, non-contiguous or non-monotonic forward cycles are forbidden",
      );
    }
  }
  const observationMs =
    Date.parse(cycles.at(-1)!.scheduledAt) -
    Date.parse(cycles[0]!.scheduledAt);
  const expectedCoverageCellCount = sumCycleField(
    cycles,
    "expectedCoverageCellCount",
  );
  const observedNonemptyCellCount = sumCycleField(
    cycles,
    "observedNonemptyCellCount",
  );
  const observedEmptyCellCount = sumCycleField(
    cycles,
    "observedEmptyCellCount",
  );
  const degradedCellCount = sumCycleField(cycles, "degradedCellCount");
  const unavailableCellCount = sumCycleField(cycles, "unavailableCellCount");
  const totalRecordCount = sumCycleField(cycles, "totalRecordCount");
  const persistedRecordCount = sumCycleField(cycles, "persistedRecordCount");
  const sequenceGapCount = sumCycleField(cycles, "sequenceGapCount");
  const outOfOrderCount = sumCycleField(cycles, "outOfOrderCount");
  const droppedEventCount = sumCycleField(cycles, "droppedEventCount");
  const lateEventCount = sumCycleField(cycles, "lateEventCount");
  const maximumEventLatencyP95Ms = Math.max(
    ...cycles.map((cycle) => cycle.maximumEventLatencyP95Ms),
  );
  const captureQualityPassCycleCount = cycles.filter(
    (cycle) => cycle.captureQualityGate === "PASS",
  ).length;
  const pairRoleFactsPerCycle =
    plan.pairCount * M1_MICROSTRUCTURE_FACT_TYPES.length;
  const triggerCellCount = cycles.reduce(
    (total, cycle) =>
      total +
      cycle.coverageCells.filter(
        (cell) => cell.selectionRole === "RESEARCH_TRIGGER",
      ).length,
    0,
  );
  const controlCellCount = cycles.reduce(
    (total, cycle) =>
      total +
      cycle.coverageCells.filter(
        (cell) => cell.selectionRole === "MATCHED_CONTROL",
      ).length,
    0,
  );
  const expectedRoleCellCount =
    pairRoleFactsPerCycle * M1_MICROSTRUCTURE_FORWARD_PROFILE.cycleCount;
  const matchedControlCoverageRatio =
    expectedRoleCellCount === 0
      ? 0
      : Math.min(triggerCellCount, controlCellCount) / expectedRoleCellCount;
  const selectedSubjects = plan.pairs.flatMap((pair) => [
    pair.trigger,
    pair.matchedControl,
  ]);
  const requiredNonemptySubjectFactKeys = selectedSubjects.flatMap((subject) =>
    M1_MICROSTRUCTURE_FORWARD_PROFILE.requiredNonemptyFactTypes.map(
      (factType) => `${subject.subjectId}|${factType}`,
    )
  );
  const observedRequiredNonemptySubjectFactKeys = new Set(
    cycles.flatMap((cycle) =>
      cycle.coverageCells
        .filter((cell) =>
          cell.disposition === "OBSERVED_NONEMPTY" &&
          M1_MICROSTRUCTURE_FORWARD_PROFILE.requiredNonemptyFactTypes.includes(
            cell.factType as
              (typeof M1_MICROSTRUCTURE_FORWARD_PROFILE.requiredNonemptyFactTypes)[number],
          )
        )
        .map((cell) => `${cell.subjectId}|${cell.factType}`)
    ),
  );
  const expectedRequiredNonemptySubjectFactCount =
    requiredNonemptySubjectFactKeys.length;
  const observedRequiredNonemptySubjectFactCount =
    requiredNonemptySubjectFactKeys.filter((key) =>
      observedRequiredNonemptySubjectFactKeys.has(key)
    ).length;
  const venueFactFamilyPass = Object.fromEntries(
    M1_VENUE_SOURCE_IDS.map((venue) => [
      venue,
      M1_MICROSTRUCTURE_FACT_TYPES.every((factType) =>
        cycles.every((cycle) =>
          cycle.coverageCells.some(
            (cell) =>
              cell.venue === venue &&
              cell.factType === factType &&
              ["OBSERVED_NONEMPTY", "OBSERVED_EMPTY"].includes(
                cell.disposition,
              ),
          )
        ) &&
        (
          !M1_MICROSTRUCTURE_FORWARD_PROFILE.requiredNonemptyFactTypes
            .includes(
              factType as
                (typeof M1_MICROSTRUCTURE_FORWARD_PROFILE.requiredNonemptyFactTypes)[number],
            ) ||
          selectedSubjects
            .filter((subject) => subject.venue === venue)
            .every((subject) =>
              observedRequiredNonemptySubjectFactKeys.has(
                `${subject.subjectId}|${factType}`,
              )
            )
        )
      ),
    ]),
  ) as Record<(typeof M1_VENUE_SOURCE_IDS)[number], boolean>;
  const resourceTotals = {
    redisReadBytes: sumResourceField(cycles, "redisReadBytes"),
    redisWriteBytes: sumResourceField(cycles, "redisWriteBytes"),
    postgresInsertedRows: sumResourceField(cycles, "postgresInsertedRows"),
    postgresWriteBytes: sumResourceField(cycles, "postgresWriteBytes"),
    postgresWalBytes: sumResourceField(cycles, "postgresWalBytes"),
    cosObjectCount: sumResourceField(cycles, "cosObjectCount"),
    cosWriteBytes: sumResourceField(cycles, "cosWriteBytes"),
    networkIngressBytes: sumResourceField(cycles, "networkIngressBytes"),
    networkEgressBytes: sumResourceField(cycles, "networkEgressBytes"),
    rawPayloadBytes: sumResourceField(cycles, "rawPayloadBytes"),
    compressedPayloadBytes: sumResourceField(
      cycles,
      "compressedPayloadBytes",
    ),
    persistedPayloadBytes: sumResourceField(
      cycles,
      "persistedPayloadBytes",
    ),
    maximumRssBytes: Math.max(
      ...cycles.map((cycle) => cycle.resources.rssBytes),
    ),
    maximumCpuP95Percent: Math.max(
      ...cycles.map((cycle) => cycle.resources.cpuP95Percent),
    ),
  };
  const capturePass =
    observationMs >= M1_MICROSTRUCTURE_FORWARD_PROFILE.minObservationMs &&
    captureQualityPassCycleCount === cycles.length &&
    degradedCellCount === 0 &&
    unavailableCellCount === 0 &&
    sequenceGapCount === 0 &&
    outOfOrderCount === 0 &&
    droppedEventCount === 0 &&
    lateEventCount === 0 &&
    persistedRecordCount === totalRecordCount &&
    maximumEventLatencyP95Ms <=
      M1_MICROSTRUCTURE_FORWARD_PROFILE.maxEventLatencyP95Ms &&
    matchedControlCoverageRatio === 1 &&
    expectedRequiredNonemptySubjectFactCount > 0 &&
    observedRequiredNonemptySubjectFactCount ===
      expectedRequiredNonemptySubjectFactCount &&
    Object.values(venueFactFamilyPass).every(Boolean);
  const upstreamPass = multiAsset.fullMultiAssetGate === "PASS";
  const recoveryPass = upstream.evidenceClass === "TEST_ONLY"
    ? hostRecovery.status === "NOT_EXECUTED_TEST_ONLY"
    : hostRecovery.status === "RESTORED_EXACT";
  const resourcePass =
    resourceTotals.rawPayloadBytes >= resourceTotals.compressedPayloadBytes &&
    resourceTotals.compressedPayloadBytes >=
      resourceTotals.persistedPayloadBytes &&
    resourceTotals.maximumRssBytes <=
      M1_MICROSTRUCTURE_FORWARD_PROFILE.maxRssBytes &&
    recoveryPass;
  const live = upstream.evidenceClass === "LIVE_READ_ONLY";
  const status = !live
    ? "TEST_ONLY_NOT_FORWARD_LIVE_EVIDENCE" as const
    : !capturePass
      ? "BLOCKED_FORWARD_COVERAGE_OR_QUALITY" as const
      : !recoveryPass
        ? "BLOCKED_HOST_RECOVERY" as const
        : !upstreamPass
          ? "BLOCKED_UPSTREAM_MULTI_ASSET_GATE" as const
          : "PASS_FORWARD_MICROSTRUCTURE_SHADOW_NO_AUTHORITY" as const;
  const reasons = [
    ...(!capturePass ? ["forward_capture_quality_blocked"] : []),
    ...(!upstreamPass ? ["upstream_multi_asset_gate_blocked"] : []),
    ...(!recoveryPass ? ["host_recovery_not_exact"] : []),
    ...(!resourcePass ? ["resource_evidence_blocked"] : []),
    ...(!live ? ["live_forward_evidence_missing"] : []),
  ].filter((reason, index, values) => values.indexOf(reason) === index);
  const releaseAdmissionPass =
    live && capturePass && upstreamPass && resourcePass;
  const core = forwardEvidenceCore({
    schemaVersion: M1_MICROSTRUCTURE_FORWARD_EVIDENCE_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: upstream.releaseId,
    evaluatedAt: input.evaluatedAt,
    upstreamBindingId: upstream.upstreamBindingId,
    upstreamBindingHash: upstream.contentHash,
    multiAssetShadowEvidenceId: multiAsset.evidenceId,
    multiAssetShadowEvidenceHash: multiAsset.contentHash,
    planId: plan.planId,
    planHash: plan.contentHash,
    evidenceClass: upstream.evidenceClass,
    networkEnvironment: upstream.networkEnvironment,
    workerRunId: cycles[0]!.workerRunId,
    runtimeConfigDigest: cycles[0]!.runtimeConfigDigest,
    cycleCount: 31,
    observationMs,
    cycleIds: cycles.map((cycle) => cycle.cycleId),
    cycleContentHashes: cycles.map((cycle) => cycle.contentHash),
    expectedCoverageCellCount,
    observedNonemptyCellCount,
    observedEmptyCellCount,
    degradedCellCount,
    unavailableCellCount,
    totalRecordCount,
    persistedRecordCount,
    sequenceGapCount,
    outOfOrderCount,
    droppedEventCount,
    lateEventCount,
    maximumEventLatencyP95Ms,
    captureQualityPassCycleCount,
    matchedControlCoverageRatio,
    expectedRequiredNonemptySubjectFactCount,
    observedRequiredNonemptySubjectFactCount,
    venueFactFamilyPass,
    resourceTotals,
    hostRecovery,
    captureQualityGate: capturePass ? "PASS" : "BLOCKED",
    upstreamMultiAssetGate: upstreamPass ? "PASS" : "BLOCKED",
    resourceEvidenceGate: resourcePass ? "PASS" : "BLOCKED",
    releaseAdmissionGate: releaseAdmissionPass ? "PASS" : "BLOCKED",
    status,
    reasonCodes: reasons,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    capacityAuthorityGranted: false,
    automaticTradingAllowed: false,
    productionChanged: false,
    secretMaterialPresent: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1MicrostructureForwardEvidenceSchema.parse({
    ...core,
    evidenceId:
      `m1-micro-forward-evidence:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}
