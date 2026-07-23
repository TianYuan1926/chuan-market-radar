import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
} from "../../runtime-schema/primitives";
import {
  M1_CAPABILITY_IDS,
  M1_SCOPE_EPOCH,
  M1_SOURCE_IDS,
} from "../source-capability/source-capability-contract";
import {
  M1SourceConformanceArtifactSchema,
  M1SourceConformanceProbeObservationSchema,
  type M1SourceConformanceArtifact,
  type M1SourceConformanceFailure,
  type M1SourceConformanceProbeId,
} from "../source-conformance/source-conformance-contract";
import {
  fetchM1ExactListingRuntimePage,
  runM1ExactSourceRuntimeProbe,
  type M1SourceConformanceTransport,
} from "../source-conformance/adapters/exact-source-conformance-runner";
import {
  M1RuntimeAdapterProfileSetSchema,
  buildM1RuntimeAdapterProfileSet,
  type M1RuntimeAdapterProfile,
} from "./runtime-adapter-profile";
import {
  M1ListingHistoryAdvanceResultSchema,
  M1ListingHistoryCheckpointSchema,
  advanceM1ListingHistory,
  buildM1ListingHistoryPageRequest,
  buildM1ListingHistoryRequest,
  parseM1ListingHistoryPage,
  type M1ListingHistoryCheckpoint,
  type M1ListingHistoryPage,
} from "../multi-asset-universe/listing-history-runtime";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";

export const M1_RUNTIME_ADAPTER_LIVE_ARTIFACT_VERSION =
  "v2-m1-runtime-adapter-live-artifact.v1" as const;
export const M1_RUNTIME_ADAPTER_PROFILE_EXECUTION_VERSION =
  "v2-m1-runtime-adapter-profile-execution.v1" as const;
export const M1_RUNTIME_ADAPTER_ACCEPTANCE_AXIS_VERSION =
  "v2-m1-runtime-adapter-acceptance-axis.v1" as const;

export const M1_RUNTIME_ADAPTER_BLOCKED_PROBE_IDS = [
  "BINANCE_SPOT_CATALOG",
] as const satisfies readonly M1SourceConformanceProbeId[];

const M1_RUNTIME_ADAPTER_AXIS_ORDER = [
  "BITGET_VENUE",
  "LISTING_LIFECYCLE",
  "EQUITY_ASSET_DOMAIN",
  "DATA_MAXIMIZATION",
] as const;

const M1_RUNTIME_ADAPTER_FIXED_AXIS_PROBES = Object.freeze({
  BITGET_VENUE: Object.freeze([
    "BITGET_DERIVATIVE_CATALOG",
    "BITGET_LISTING_ANNOUNCEMENT",
    "BITGET_SERVER_TIME",
    "BITGET_SPOT_CATALOG",
  ]),
  LISTING_LIFECYCLE: Object.freeze([
    "BITGET_LISTING_ANNOUNCEMENT",
    "BITGET_SPOT_CATALOG",
    "BYBIT_LISTING_ANNOUNCEMENT",
    "BYBIT_SPOT_CATALOG",
    "OKX_SPOT_CATALOG",
  ]),
  EQUITY_ASSET_DOMAIN: Object.freeze([
    "BINANCE_DERIVATIVE_CATALOG",
    "BITGET_DERIVATIVE_CATALOG",
    "BYBIT_DERIVATIVE_CATALOG",
    "OKX_DERIVATIVE_CATALOG",
  ]),
});

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const ProbeIdSchema = z.enum([
  "BINANCE_SERVER_TIME",
  "BINANCE_DERIVATIVE_CATALOG",
  "BINANCE_SPOT_CATALOG",
  "OKX_SERVER_TIME",
  "OKX_DERIVATIVE_CATALOG",
  "OKX_SPOT_CATALOG",
  "BYBIT_SERVER_TIME",
  "BYBIT_DERIVATIVE_CATALOG",
  "BYBIT_SPOT_CATALOG",
  "BYBIT_LISTING_ANNOUNCEMENT",
  "BITGET_SERVER_TIME",
  "BITGET_DERIVATIVE_CATALOG",
  "BITGET_SPOT_CATALOG",
  "BITGET_LISTING_ANNOUNCEMENT",
  "COINGLASS_SUPPORTED_COINS",
]);
const UniqueProbeIdsSchema = z.array(ProbeIdSchema)
  .superRefine((values, context) => {
    if (
      new Set(values).size !== values.length ||
      values.some((value, index) =>
        index > 0 && values[index - 1]!.localeCompare(value) >= 0
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "probe ids must be unique and canonically ordered",
      });
    }
  });

const ProfileExecutionCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_RUNTIME_ADAPTER_PROFILE_EXECUTION_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  profileId: NonEmptyStringSchema,
  probeId: ProbeIdSchema,
  sourceId: z.enum(M1_SOURCE_IDS),
  capabilityId: z.enum(M1_CAPABILITY_IDS),
  operation: z.enum([
    "SOURCE_WIDE_SNAPSHOT",
    "PAGINATED_SOURCE_WIDE_SNAPSHOT",
    "LISTING_HISTORY_SEGMENT",
  ]),
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  outcome: z.enum(["PASS", "FAIL", "NOT_RUN"]),
  requestAttempts: NonNegativeIntegerSchema,
  requestTokenBudget: z.number().int().positive().max(64),
  pageCount: NonNegativeIntegerSchema,
  responseBytes: NonNegativeIntegerSchema,
  observedRecordCount: NonNegativeIntegerSchema,
  sourceCutoff: IsoDateTimeSchema.nullable(),
  failure: NonEmptyStringSchema.nullable(),
  listingMode: z.enum(["BOOTSTRAP", "INCREMENTAL"]).nullable(),
  listingSegmentStop: z.enum([
    "SOURCE_TERMINAL",
    "SEGMENT_PAGE_LIMIT",
    "PRIOR_CHECKPOINT_OVERLAP",
    "TRANSPORT_FAILURE",
  ]).nullable(),
  listingAdvance: M1ListingHistoryAdvanceResultSchema.nullable(),
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  runtimeAuthorityGranted: z.literal(false),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1RuntimeAdapterProfileExecutionSchema =
  ProfileExecutionCoreSchema.extend({
    executionId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((execution, context) => {
    if (
      execution.requestAttempts > execution.requestTokenBudget ||
      execution.pageCount > execution.requestAttempts
    ) {
      context.addIssue({
        code: "custom",
        message: "runtime request accounting exceeded the exact profile budget",
        path: ["requestAttempts"],
      });
    }
    const listing = execution.operation === "LISTING_HISTORY_SEGMENT";
    if (
      listing !== (execution.listingMode !== null) ||
      listing !== (execution.listingSegmentStop !== null) ||
      (
        execution.listingAdvance !== null &&
        !listing
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "listing execution metadata does not match the operation",
        path: ["listingMode"],
      });
    }
    if (
      execution.outcome === "PASS" &&
      (
        execution.failure !== null ||
        (
          listing &&
          execution.listingAdvance?.status !== "COMMITTED"
        )
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "passing runtime execution cannot hide a failure or gap",
        path: ["outcome"],
      });
    }
    if (
      execution.outcome !== "PASS" &&
      execution.failure === null
    ) {
      context.addIssue({
        code: "custom",
        message: "non-passing runtime execution requires an explicit failure",
        path: ["failure"],
      });
    }
    const expectedHash = stableContentHash(profileExecutionCore(execution));
    if (execution.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "runtime profile execution content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      execution.executionId !==
        `runtime-execution:${execution.probeId}:${
          expectedHash.slice(7, 23)
        }`
    ) {
      context.addIssue({
        code: "custom",
        message: "runtime profile execution id mismatch",
        path: ["executionId"],
      });
    }
  });

export type M1RuntimeAdapterProfileExecution = z.infer<
  typeof M1RuntimeAdapterProfileExecutionSchema
>;

function profileExecutionCore(
  execution: z.input<typeof ProfileExecutionCoreSchema> & {
    readonly executionId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof ProfileExecutionCoreSchema> {
  return ProfileExecutionCoreSchema.parse({
    schemaVersion: execution.schemaVersion,
    scopeEpoch: execution.scopeEpoch,
    profileId: execution.profileId,
    probeId: execution.probeId,
    sourceId: execution.sourceId,
    capabilityId: execution.capabilityId,
    operation: execution.operation,
    evidenceClass: execution.evidenceClass,
    outcome: execution.outcome,
    requestAttempts: execution.requestAttempts,
    requestTokenBudget: execution.requestTokenBudget,
    pageCount: execution.pageCount,
    responseBytes: execution.responseBytes,
    observedRecordCount: execution.observedRecordCount,
    sourceCutoff: execution.sourceCutoff,
    failure: execution.failure,
    listingMode: execution.listingMode,
    listingSegmentStop: execution.listingSegmentStop,
    listingAdvance: execution.listingAdvance,
    rawBodyRetained: execution.rawBodyRetained,
    secretMaterialPresent: execution.secretMaterialPresent,
    runtimeAuthorityGranted: execution.runtimeAuthorityGranted,
    factAuthorityGranted: execution.factAuthorityGranted,
    candidateAuthorityGranted: execution.candidateAuthorityGranted,
    strategyAuthorityGranted: execution.strategyAuthorityGranted,
    readyAuthorityGranted: execution.readyAuthorityGranted,
    productionChanged: execution.productionChanged,
  });
}

const AcceptanceAxisCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_RUNTIME_ADAPTER_ACCEPTANCE_AXIS_VERSION),
  axisId: z.enum([
    "BITGET_VENUE",
    "LISTING_LIFECYCLE",
    "EQUITY_ASSET_DOMAIN",
    "DATA_MAXIMIZATION",
  ]),
  expectedProbeIds: UniqueProbeIdsSchema,
  executedProbeIds: UniqueProbeIdsSchema,
  passedProbeIds: UniqueProbeIdsSchema,
  routeGateStatus: z.enum(["PASS", "BLOCKED"]),
  scopeBoundary: z.enum([
    "BITGET_PUBLIC_VENUE_ROUTES_NO_TRADING_AUTHORITY",
    "LISTING_DISCOVERY_AND_HISTORY_ONLY_NO_CANDIDATE_AUTHORITY",
    "CATALOG_ACCOUNTING_ONLY_SESSION_CORPORATE_ACTION_FX_BASIS_BLOCKED",
    "ALL_ROUTE_ELIGIBLE_PROFILES_ONLY_REGISTRY_BLOCK_RETAINED",
  ]),
  acceptanceGranted: z.literal(false),
});

export const M1RuntimeAdapterAcceptanceAxisSchema =
  AcceptanceAxisCoreSchema.extend({
    axisEvidenceId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((axis, context) => {
    const passed = new Set(axis.passedProbeIds);
    const executed = new Set(axis.executedProbeIds);
    if (
      axis.passedProbeIds.some((probeId) => !executed.has(probeId)) ||
      axis.routeGateStatus !==
        (
          axis.expectedProbeIds.every((probeId) => passed.has(probeId))
            ? "PASS"
            : "BLOCKED"
        )
    ) {
      context.addIssue({
        code: "custom",
        message: "acceptance axis denominator does not reconcile",
        path: ["routeGateStatus"],
      });
    }
    const expectedHash = stableContentHash(acceptanceAxisCore(axis));
    if (axis.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "acceptance axis content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      axis.axisEvidenceId !==
        `runtime-axis:${axis.axisId}:${expectedHash.slice(7, 23)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "acceptance axis evidence id mismatch",
        path: ["axisEvidenceId"],
      });
    }
  });

export type M1RuntimeAdapterAcceptanceAxis = z.infer<
  typeof M1RuntimeAdapterAcceptanceAxisSchema
>;

function acceptanceAxisCore(
  axis: z.input<typeof AcceptanceAxisCoreSchema> & {
    readonly axisEvidenceId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof AcceptanceAxisCoreSchema> {
  return AcceptanceAxisCoreSchema.parse({
    schemaVersion: axis.schemaVersion,
    axisId: axis.axisId,
    expectedProbeIds: axis.expectedProbeIds,
    executedProbeIds: axis.executedProbeIds,
    passedProbeIds: axis.passedProbeIds,
    routeGateStatus: axis.routeGateStatus,
    scopeBoundary: axis.scopeBoundary,
    acceptanceGranted: axis.acceptanceGranted,
  });
}

const RuntimeAdapterLiveArtifactCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_RUNTIME_ADAPTER_LIVE_ARTIFACT_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  runtimeReleaseId: ReleaseIdSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  conformanceReleaseId: ReleaseIdSchema,
  conformanceArtifactId: NonEmptyStringSchema,
  conformanceArtifactHash: DigestSchema,
  profileSetId: NonEmptyStringSchema,
  profileSetHash: DigestSchema,
  registryDigest: DigestSchema,
  probePlanDigest: DigestSchema,
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  networkEnvironment: z.enum([
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  status: z.enum([
    "PASS_BOUNDED_ROUTE_SEGMENT_NO_AUTHORITY",
    "BLOCKED_ROUTE_SEGMENT_NO_STALE_PROMOTION",
    "TEST_ONLY_NOT_LIVE_EVIDENCE",
  ]),
  liveConformantProfileCount: z.literal(15),
  routeEligibleProfileCount: z.literal(14),
  registryBlockedProfileCount: z.literal(1),
  registryBlockedProbeIds: UniqueProbeIdsSchema,
  expectedExecutionProbeIds: UniqueProbeIdsSchema,
  executedProbeIds: UniqueProbeIdsSchema,
  passedProbeIds: UniqueProbeIdsSchema,
  failedProbeIds: UniqueProbeIdsSchema,
  requestAttemptCount: NonNegativeIntegerSchema,
  requestTokenBudget: NonNegativeIntegerSchema,
  listingCheckpointCommittedCount: NonNegativeIntegerSchema,
  listingGapCount: NonNegativeIntegerSchema,
  executions: z.array(M1RuntimeAdapterProfileExecutionSchema),
  acceptanceAxes: z.array(M1RuntimeAdapterAcceptanceAxisSchema).length(4),
  acceptanceAccounting: z.literal(
    "FOUR_INDEPENDENT_AXES_NO_CROSS_PASS",
  ),
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  runtimeAuthorityGranted: z.literal(false),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1RuntimeAdapterLiveArtifactSchema =
  RuntimeAdapterLiveArtifactCoreSchema.extend({
    artifactId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((artifact, context) => {
    if (
      artifact.executions.some((execution, index) =>
        index > 0 &&
        artifact.executions[index - 1]!.probeId.localeCompare(
            execution.probeId,
          ) >= 0
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "runtime executions must remain canonically ordered",
        path: ["executions"],
      });
    }
    const executionProbeIds = artifact.executions
      .map((execution) => execution.probeId)
      .sort();
    const passedProbeIds = artifact.executions
      .filter((execution) => execution.outcome === "PASS")
      .map((execution) => execution.probeId)
      .sort();
    const failedProbeIds = artifact.executions
      .filter((execution) => execution.outcome !== "PASS")
      .map((execution) => execution.probeId)
      .sort();
    const requestAttemptCount = artifact.executions.reduce(
      (total, execution) => total + execution.requestAttempts,
      0,
    );
    const requestTokenBudget = artifact.executions.reduce(
      (total, execution) => total + execution.requestTokenBudget,
      0,
    );
    const committed = artifact.executions.filter((execution) =>
      execution.listingAdvance?.status === "COMMITTED"
    ).length;
    const gaps = artifact.executions.filter((execution) =>
      execution.listingAdvance?.status === "BLOCKED_GAP"
    ).length;
    if (
      stableContentHash(executionProbeIds) !==
        stableContentHash(artifact.executedProbeIds) ||
      stableContentHash(passedProbeIds) !==
        stableContentHash(artifact.passedProbeIds) ||
      stableContentHash(failedProbeIds) !==
        stableContentHash(artifact.failedProbeIds) ||
      requestAttemptCount !== artifact.requestAttemptCount ||
      requestTokenBudget !== artifact.requestTokenBudget ||
      committed !== artifact.listingCheckpointCommittedCount ||
      gaps !== artifact.listingGapCount
    ) {
      context.addIssue({
        code: "custom",
        message: "runtime artifact denominator accounting does not reconcile",
      });
    }
    if (
      artifact.acceptanceAxes.some((axis, index) =>
        axis.axisId !== M1_RUNTIME_ADAPTER_AXIS_ORDER[index]
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "acceptance axes must remain complete and ordered",
        path: ["acceptanceAxes"],
      });
    }
    for (const axis of artifact.acceptanceAxes) {
      const expected = axis.axisId === "DATA_MAXIMIZATION"
        ? artifact.expectedExecutionProbeIds
        : M1_RUNTIME_ADAPTER_FIXED_AXIS_PROBES[axis.axisId];
      if (
        stableContentHash(axis.expectedProbeIds) !==
          stableContentHash(expected)
      ) {
        context.addIssue({
          code: "custom",
          message: `${axis.axisId} acceptance denominator drifted`,
          path: ["acceptanceAxes"],
        });
      }
    }
    if (
      stableContentHash(artifact.registryBlockedProbeIds) !==
        stableContentHash([...M1_RUNTIME_ADAPTER_BLOCKED_PROBE_IDS]) ||
      artifact.executedProbeIds.some((probeId) =>
        M1_RUNTIME_ADAPTER_BLOCKED_PROBE_IDS.includes(
          probeId as (typeof M1_RUNTIME_ADAPTER_BLOCKED_PROBE_IDS)[number],
        )
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "registry-blocked probe was not retained as blocked",
        path: ["registryBlockedProbeIds"],
      });
    }
    const liveRoutePass =
      artifact.executedProbeIds.length === 14 &&
      artifact.passedProbeIds.length === 14 &&
      artifact.failedProbeIds.length === 0 &&
      artifact.listingCheckpointCommittedCount === 2 &&
      artifact.listingGapCount === 0 &&
      artifact.acceptanceAxes.every((axis) =>
        axis.routeGateStatus === "PASS"
      );
    const expectedStatus = artifact.evidenceClass === "TEST_ONLY"
      ? "TEST_ONLY_NOT_LIVE_EVIDENCE"
      : liveRoutePass
        ? "PASS_BOUNDED_ROUTE_SEGMENT_NO_AUTHORITY"
        : "BLOCKED_ROUTE_SEGMENT_NO_STALE_PROMOTION";
    if (artifact.status !== expectedStatus) {
      context.addIssue({
        code: "custom",
        message: "runtime artifact status overstates observed evidence",
        path: ["status"],
      });
    }
    if (
      artifact.evidenceClass === "LIVE_READ_ONLY" &&
      artifact.networkEnvironment !== "TENCENT_ISOLATED_READ_ONLY"
    ) {
      context.addIssue({
        code: "custom",
        message: "live runtime evidence must come from Tencent isolation",
        path: ["networkEnvironment"],
      });
    }
    if (
      artifact.evidenceClass === "TEST_ONLY" &&
      artifact.networkEnvironment !== "TEST_HARNESS"
    ) {
      context.addIssue({
        code: "custom",
        message: "test transport cannot claim live network evidence",
        path: ["networkEnvironment"],
      });
    }
    const expectedHash = stableContentHash(runtimeAdapterLiveArtifactCore(
      artifact,
    ));
    if (artifact.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "runtime adapter live artifact content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      artifact.artifactId !==
        `runtime-adapter-live:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "runtime adapter live artifact id mismatch",
        path: ["artifactId"],
      });
    }
  });

export type M1RuntimeAdapterLiveArtifact = z.infer<
  typeof M1RuntimeAdapterLiveArtifactSchema
>;

function runtimeAdapterLiveArtifactCore(
  artifact: z.input<typeof RuntimeAdapterLiveArtifactCoreSchema> & {
    readonly artifactId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof RuntimeAdapterLiveArtifactCoreSchema> {
  return RuntimeAdapterLiveArtifactCoreSchema.parse({
    schemaVersion: artifact.schemaVersion,
    scopeEpoch: artifact.scopeEpoch,
    runtimeReleaseId: artifact.runtimeReleaseId,
    generatedAt: artifact.generatedAt,
    sourceCutoff: artifact.sourceCutoff,
    conformanceReleaseId: artifact.conformanceReleaseId,
    conformanceArtifactId: artifact.conformanceArtifactId,
    conformanceArtifactHash: artifact.conformanceArtifactHash,
    profileSetId: artifact.profileSetId,
    profileSetHash: artifact.profileSetHash,
    registryDigest: artifact.registryDigest,
    probePlanDigest: artifact.probePlanDigest,
    evidenceClass: artifact.evidenceClass,
    networkEnvironment: artifact.networkEnvironment,
    status: artifact.status,
    liveConformantProfileCount: artifact.liveConformantProfileCount,
    routeEligibleProfileCount: artifact.routeEligibleProfileCount,
    registryBlockedProfileCount: artifact.registryBlockedProfileCount,
    registryBlockedProbeIds: artifact.registryBlockedProbeIds,
    expectedExecutionProbeIds: artifact.expectedExecutionProbeIds,
    executedProbeIds: artifact.executedProbeIds,
    passedProbeIds: artifact.passedProbeIds,
    failedProbeIds: artifact.failedProbeIds,
    requestAttemptCount: artifact.requestAttemptCount,
    requestTokenBudget: artifact.requestTokenBudget,
    listingCheckpointCommittedCount:
      artifact.listingCheckpointCommittedCount,
    listingGapCount: artifact.listingGapCount,
    executions: artifact.executions,
    acceptanceAxes: artifact.acceptanceAxes,
    acceptanceAccounting: artifact.acceptanceAccounting,
    rawBodyRetained: artifact.rawBodyRetained,
    secretMaterialPresent: artifact.secretMaterialPresent,
    runtimeAuthorityGranted: artifact.runtimeAuthorityGranted,
    factAuthorityGranted: artifact.factAuthorityGranted,
    candidateAuthorityGranted: artifact.candidateAuthorityGranted,
    strategyAuthorityGranted: artifact.strategyAuthorityGranted,
    readyAuthorityGranted: artifact.readyAuthorityGranted,
    productionChanged: artifact.productionChanged,
  });
}

function buildExecution(
  input: Omit<
    z.input<typeof ProfileExecutionCoreSchema>,
    | "schemaVersion"
    | "scopeEpoch"
    | "rawBodyRetained"
    | "secretMaterialPresent"
    | "runtimeAuthorityGranted"
    | "factAuthorityGranted"
    | "candidateAuthorityGranted"
    | "strategyAuthorityGranted"
    | "readyAuthorityGranted"
    | "productionChanged"
  >,
): M1RuntimeAdapterProfileExecution {
  const core = profileExecutionCore({
    schemaVersion: M1_RUNTIME_ADAPTER_PROFILE_EXECUTION_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    ...input,
    rawBodyRetained: false,
    secretMaterialPresent: false,
    runtimeAuthorityGranted: false,
    factAuthorityGranted: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  return M1RuntimeAdapterProfileExecutionSchema.parse({
    ...core,
    executionId:
      `runtime-execution:${core.probeId}:${contentHash.slice(7, 23)}`,
    contentHash,
  });
}

function listingProbeId(
  profile: M1RuntimeAdapterProfile,
): "BYBIT_LISTING_ANNOUNCEMENT" | "BITGET_LISTING_ANNOUNCEMENT" {
  if (profile.probeId === "BYBIT_LISTING_ANNOUNCEMENT") {
    return profile.probeId;
  }
  if (profile.probeId === "BITGET_LISTING_ANNOUNCEMENT") {
    return profile.probeId;
  }
  throw new Error("listing runtime received a non-listing profile");
}

async function executeListingProfile(input: {
  profile: M1RuntimeAdapterProfile;
  priorCheckpoint: M1ListingHistoryCheckpoint | null;
  evidenceClass: "LIVE_READ_ONLY" | "TEST_ONLY";
  networkEnvironment: "TENCENT_ISOLATED_READ_ONLY" | "TEST_HARNESS";
  transportImplementation?: M1SourceConformanceTransport;
  now: () => Date;
}): Promise<M1RuntimeAdapterProfileExecution> {
  const prior = input.priorCheckpoint === null
    ? null
    : M1ListingHistoryCheckpointSchema.parse(input.priorCheckpoint);
  const mode = prior === null || prior.status === "BOOTSTRAP_IN_PROGRESS"
    ? "BOOTSTRAP" as const
    : "INCREMENTAL" as const;
  const initial = buildM1ListingHistoryRequest({
    profile: input.profile,
    mode,
    checkpoint: prior,
  });
  const pages: M1ListingHistoryPage[] = [];
  const priorAnnouncementIds = new Set(
    prior?.observations.map((observation) => observation.announcementId) ?? [],
  );
  let requestToken = initial.requestToken;
  let requestAttempts = 0;
  let responseBytes = 0;
  let failure: M1SourceConformanceFailure | null = null;
  let segmentStop:
    | "SOURCE_TERMINAL"
    | "SEGMENT_PAGE_LIMIT"
    | "PRIOR_CHECKPOINT_OVERLAP"
    | "TRANSPORT_FAILURE" = "SEGMENT_PAGE_LIMIT";

  while (requestAttempts < input.profile.maxRequestsPerSegment) {
    const request = buildM1ListingHistoryPageRequest({
      profile: input.profile,
      requestToken,
    });
    const fetched = await fetchM1ExactListingRuntimePage({
      probeId: listingProbeId(input.profile),
      url: request.url,
      networkEnvironment: input.networkEnvironment,
      transportImplementation: input.transportImplementation,
      now: input.now,
    });
    requestAttempts += fetched.requestAttempts;
    if (!fetched.ok) {
      failure = fetched.failure;
      segmentStop = "TRANSPORT_FAILURE";
      break;
    }
    if (fetched.evidenceClass !== input.evidenceClass) {
      throw new Error("listing runtime evidence class drifted");
    }
    responseBytes += fetched.page.responseBytes;
    const page = parseM1ListingHistoryPage({
      profile: input.profile,
      mode,
      pageOrdinal: pages.length + 1,
      requestToken,
      receivedAt: fetched.page.receivedAt,
      responseBodyHash: fetched.page.responseBodyDigest,
      payload: fetched.page.payload,
    });
    pages.push(page);
    if (
      mode === "INCREMENTAL" &&
      page.observations.some((observation) =>
        priorAnnouncementIds.has(observation.announcementId)
      )
    ) {
      segmentStop = "PRIOR_CHECKPOINT_OVERLAP";
      break;
    }
    if (page.providerTerminal) {
      segmentStop = "SOURCE_TERMINAL";
      break;
    }
    requestToken = page.nextRequestToken!;
  }

  const sourceCutoff = pages
    .map((page) => page.receivedAt)
    .sort()
    .at(-1) ?? null;
  if (failure !== null) {
    return buildExecution({
      profileId: input.profile.profileId,
      probeId: input.profile.probeId,
      sourceId: input.profile.sourceId,
      capabilityId: input.profile.capabilityId,
      operation: input.profile.operation,
      evidenceClass: input.evidenceClass,
      outcome: "FAIL",
      requestAttempts,
      requestTokenBudget: input.profile.maxRequestsPerSegment,
      pageCount: pages.length,
      responseBytes,
      observedRecordCount: pages.reduce(
        (total, page) => total + page.normalizedRecordCount,
        0,
      ),
      sourceCutoff,
      failure,
      listingMode: mode,
      listingSegmentStop: segmentStop,
      listingAdvance: null,
    });
  }

  const generatedAt = input.now().toISOString();
  if (segmentStop === "TRANSPORT_FAILURE") {
    throw new Error("listing transport failure escaped the blocked result");
  }
  const advance = advanceM1ListingHistory({
    profile: input.profile,
    mode,
    priorCheckpoint: prior,
    pages,
    segmentStop,
    generatedAt,
    sourceCutoff: sourceCutoff ?? generatedAt,
  });
  const gapFailure = advance.status === "BLOCKED_GAP"
    ? `LISTING_HISTORY_GAP_${advance.gap.reason}`
    : null;
  return buildExecution({
    profileId: input.profile.profileId,
    probeId: input.profile.probeId,
    sourceId: input.profile.sourceId,
    capabilityId: input.profile.capabilityId,
    operation: input.profile.operation,
    evidenceClass: input.evidenceClass,
    outcome: advance.status === "COMMITTED" ? "PASS" : "FAIL",
    requestAttempts,
    requestTokenBudget: input.profile.maxRequestsPerSegment,
    pageCount: pages.length,
    responseBytes,
    observedRecordCount: pages.reduce(
      (total, page) => total + page.normalizedRecordCount,
      0,
    ),
    sourceCutoff,
    failure: gapFailure,
    listingMode: mode,
    listingSegmentStop: segmentStop,
    listingAdvance: advance,
  });
}

async function executeSnapshotProfile(input: {
  profile: M1RuntimeAdapterProfile;
  coinGlassApiKey: string | null;
  evidenceClass: "LIVE_READ_ONLY" | "TEST_ONLY";
  networkEnvironment: "TENCENT_ISOLATED_READ_ONLY" | "TEST_HARNESS";
  transportImplementation?: M1SourceConformanceTransport;
  now: () => Date;
}): Promise<M1RuntimeAdapterProfileExecution> {
  const result = await runM1ExactSourceRuntimeProbe({
    probeId: input.profile.probeId,
    networkEnvironment: input.networkEnvironment,
    coinGlassApiKey: input.coinGlassApiKey,
    transportImplementation: input.transportImplementation,
    now: input.now,
  });
  const observation = M1SourceConformanceProbeObservationSchema.parse(
    result.observation,
  );
  if (observation.evidenceClass !== input.evidenceClass) {
    throw new Error("snapshot runtime evidence class drifted");
  }
  return buildExecution({
    profileId: input.profile.profileId,
    probeId: input.profile.probeId,
    sourceId: input.profile.sourceId,
    capabilityId: input.profile.capabilityId,
    operation: input.profile.operation,
    evidenceClass: input.evidenceClass,
    outcome: observation.outcome,
    requestAttempts: result.requestAttempts,
    requestTokenBudget: input.profile.maxRequestsPerSegment,
    pageCount: result.requestAttempts,
    responseBytes: observation.responseBytes ?? 0,
    observedRecordCount: observation.observedRecordCount ?? 0,
    sourceCutoff: observation.receivedAt,
    failure: observation.failure,
    listingMode: null,
    listingSegmentStop: null,
    listingAdvance: null,
  });
}

function buildAxis(input: {
  axisId: M1RuntimeAdapterAcceptanceAxis["axisId"];
  expectedProbeIds: readonly M1SourceConformanceProbeId[];
  executions: readonly M1RuntimeAdapterProfileExecution[];
  scopeBoundary: M1RuntimeAdapterAcceptanceAxis["scopeBoundary"];
}): M1RuntimeAdapterAcceptanceAxis {
  const expectedProbeIds = [...input.expectedProbeIds].sort();
  const expected = new Set(expectedProbeIds);
  const executedProbeIds = input.executions
    .filter((execution) => expected.has(execution.probeId))
    .map((execution) => execution.probeId)
    .sort();
  const passedProbeIds = input.executions
    .filter((execution) =>
      expected.has(execution.probeId) && execution.outcome === "PASS"
    )
    .map((execution) => execution.probeId)
    .sort();
  const core = acceptanceAxisCore({
    schemaVersion: M1_RUNTIME_ADAPTER_ACCEPTANCE_AXIS_VERSION,
    axisId: input.axisId,
    expectedProbeIds,
    executedProbeIds,
    passedProbeIds,
    routeGateStatus:
      passedProbeIds.length === expectedProbeIds.length ? "PASS" : "BLOCKED",
    scopeBoundary: input.scopeBoundary,
    acceptanceGranted: false,
  });
  const contentHash = stableContentHash(core);
  return M1RuntimeAdapterAcceptanceAxisSchema.parse({
    ...core,
    axisEvidenceId:
      `runtime-axis:${core.axisId}:${contentHash.slice(7, 23)}`,
    contentHash,
  });
}

export async function runM1RuntimeAdapterLiveSegment(input: {
  runtimeReleaseId: string;
  conformanceArtifact: M1SourceConformanceArtifact;
  coinGlassApiKey?: string | null;
  listingCheckpoints?: Partial<
    Readonly<Record<
      "BYBIT_DERIVATIVES" | "BITGET_FUTURES",
      M1ListingHistoryCheckpoint | null
    >>
  >;
  networkEnvironment: "TENCENT_ISOLATED_READ_ONLY" | "TEST_HARNESS";
  transportImplementation?: M1SourceConformanceTransport;
  now?: () => Date;
}): Promise<M1RuntimeAdapterLiveArtifact> {
  ReleaseIdSchema.parse(input.runtimeReleaseId);
  const conformance = M1SourceConformanceArtifactSchema.parse(
    input.conformanceArtifact,
  );
  if (
    conformance.evidenceClass !== "LIVE_READ_ONLY" ||
    conformance.networkEnvironment !== "TENCENT_ISOLATED_READ_ONLY" ||
    conformance.passCount !== 15 ||
    conformance.failCount !== 0 ||
    conformance.notRunCount !== 0
  ) {
    throw new Error(
      "runtime adapter requires exact 15-of-15 Tencent live conformance",
    );
  }
  const evidenceClass = input.transportImplementation === undefined
    ? "LIVE_READ_ONLY" as const
    : "TEST_ONLY" as const;
  const expectedEnvironment = evidenceClass === "LIVE_READ_ONLY"
    ? "TENCENT_ISOLATED_READ_ONLY" as const
    : "TEST_HARNESS" as const;
  if (input.networkEnvironment !== expectedEnvironment) {
    throw new Error("runtime adapter evidence environment is invalid");
  }
  const now = input.now ?? (() => new Date());
  const profileSet = M1RuntimeAdapterProfileSetSchema.parse(
    buildM1RuntimeAdapterProfileSet({
      runtimeReleaseId: input.runtimeReleaseId,
      generatedAt: now().toISOString(),
      conformanceArtifact: conformance,
    }),
  );
  if (
    profileSet.profileCount !== 15 ||
    profileSet.schedulerRouteEligibleProfileCount !== 14 ||
    profileSet.registryBlockedProfileCount !== 1 ||
    stableContentHash(profileSet.registryBlockedProbeIds) !==
      stableContentHash([...M1_RUNTIME_ADAPTER_BLOCKED_PROBE_IDS])
  ) {
    throw new Error("runtime adapter route denominator drifted");
  }
  const routeProfiles = profileSet.profiles
    .filter((profile) => profile.schedulerRouteEligible)
    .sort((left, right) => left.probeId.localeCompare(right.probeId));
  const profilesBySource = new Map<
    M1RuntimeAdapterProfile["sourceId"],
    M1RuntimeAdapterProfile[]
  >();
  for (const profile of routeProfiles) {
    const profiles = profilesBySource.get(profile.sourceId) ?? [];
    profiles.push(profile);
    profilesBySource.set(profile.sourceId, profiles);
  }

  const executions = (
    await Promise.all(
      [...profilesBySource.entries()].map(async ([sourceId, profiles]) => {
        const sourceExecutions: M1RuntimeAdapterProfileExecution[] = [];
        for (const profile of profiles) {
          sourceExecutions.push(
            profile.operation === "LISTING_HISTORY_SEGMENT"
              ? await executeListingProfile({
                profile,
                priorCheckpoint:
                  input.listingCheckpoints?.[
                    sourceId as "BYBIT_DERIVATIVES" | "BITGET_FUTURES"
                  ] ?? null,
                evidenceClass,
                networkEnvironment: input.networkEnvironment,
                transportImplementation: input.transportImplementation,
                now,
              })
              : await executeSnapshotProfile({
                profile,
                coinGlassApiKey: input.coinGlassApiKey?.trim() || null,
                evidenceClass,
                networkEnvironment: input.networkEnvironment,
                transportImplementation: input.transportImplementation,
                now,
              }),
          );
        }
        return sourceExecutions;
      }),
    )
  ).flat().sort((left, right) => left.probeId.localeCompare(right.probeId));
  const executedProbeIds = executions.map((execution) =>
    execution.probeId
  ).sort();
  const passedProbeIds = executions
    .filter((execution) => execution.outcome === "PASS")
    .map((execution) => execution.probeId)
    .sort();
  const failedProbeIds = executions
    .filter((execution) => execution.outcome !== "PASS")
    .map((execution) => execution.probeId)
    .sort();
  const axisInputs = [
    {
      axisId: "BITGET_VENUE" as const,
      expectedProbeIds: routeProfiles
        .filter((profile) => profile.acceptanceAxes.bitgetVenue)
        .map((profile) => profile.probeId),
      scopeBoundary:
        "BITGET_PUBLIC_VENUE_ROUTES_NO_TRADING_AUTHORITY" as const,
    },
    {
      axisId: "LISTING_LIFECYCLE" as const,
      expectedProbeIds: routeProfiles
        .filter((profile) => profile.acceptanceAxes.listingLifecycle)
        .map((profile) => profile.probeId),
      scopeBoundary:
        "LISTING_DISCOVERY_AND_HISTORY_ONLY_NO_CANDIDATE_AUTHORITY" as const,
    },
    {
      axisId: "EQUITY_ASSET_DOMAIN" as const,
      expectedProbeIds: routeProfiles
        .filter((profile) => profile.acceptanceAxes.equityAssetDomain)
        .map((profile) => profile.probeId),
      scopeBoundary:
        "CATALOG_ACCOUNTING_ONLY_SESSION_CORPORATE_ACTION_FX_BASIS_BLOCKED" as const,
    },
    {
      axisId: "DATA_MAXIMIZATION" as const,
      expectedProbeIds: routeProfiles.map((profile) => profile.probeId),
      scopeBoundary:
        "ALL_ROUTE_ELIGIBLE_PROFILES_ONLY_REGISTRY_BLOCK_RETAINED" as const,
    },
  ];
  const acceptanceAxes = axisInputs.map((axis) =>
    buildAxis({ ...axis, executions })
  );
  const listingCheckpointCommittedCount = executions.filter((execution) =>
    execution.listingAdvance?.status === "COMMITTED"
  ).length;
  const listingGapCount = executions.filter((execution) =>
    execution.listingAdvance?.status === "BLOCKED_GAP"
  ).length;
  const liveRoutePass =
    passedProbeIds.length === 14 &&
    failedProbeIds.length === 0 &&
    listingCheckpointCommittedCount === 2 &&
    listingGapCount === 0 &&
    acceptanceAxes.every((axis) => axis.routeGateStatus === "PASS");
  const generatedAt = now().toISOString();
  const sourceCutoff = executions
    .map((execution) => execution.sourceCutoff)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? generatedAt;
  const core = runtimeAdapterLiveArtifactCore({
    schemaVersion: M1_RUNTIME_ADAPTER_LIVE_ARTIFACT_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    runtimeReleaseId: input.runtimeReleaseId,
    generatedAt,
    sourceCutoff,
    conformanceReleaseId: conformance.releaseId,
    conformanceArtifactId: conformance.artifactId,
    conformanceArtifactHash: conformance.contentHash,
    profileSetId: profileSet.profileSetId,
    profileSetHash: profileSet.contentHash,
    registryDigest: profileSet.registryDigest,
    probePlanDigest: profileSet.probePlanDigest,
    evidenceClass,
    networkEnvironment: input.networkEnvironment,
    status: evidenceClass === "TEST_ONLY"
      ? "TEST_ONLY_NOT_LIVE_EVIDENCE"
      : liveRoutePass
        ? "PASS_BOUNDED_ROUTE_SEGMENT_NO_AUTHORITY"
        : "BLOCKED_ROUTE_SEGMENT_NO_STALE_PROMOTION",
    liveConformantProfileCount: 15,
    routeEligibleProfileCount: 14,
    registryBlockedProfileCount: 1,
    registryBlockedProbeIds: [...M1_RUNTIME_ADAPTER_BLOCKED_PROBE_IDS],
    expectedExecutionProbeIds: routeProfiles.map((profile) =>
      profile.probeId
    ).sort(),
    executedProbeIds,
    passedProbeIds,
    failedProbeIds,
    requestAttemptCount: executions.reduce(
      (total, execution) => total + execution.requestAttempts,
      0,
    ),
    requestTokenBudget: executions.reduce(
      (total, execution) => total + execution.requestTokenBudget,
      0,
    ),
    listingCheckpointCommittedCount,
    listingGapCount,
    executions,
    acceptanceAxes,
    acceptanceAccounting: "FOUR_INDEPENDENT_AXES_NO_CROSS_PASS",
    rawBodyRetained: false,
    secretMaterialPresent: false,
    runtimeAuthorityGranted: false,
    factAuthorityGranted: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1RuntimeAdapterLiveArtifactSchema.parse({
    ...core,
    artifactId: `runtime-adapter-live:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}

export function extractM1ListingHistoryCheckpoints(
  artifact: M1RuntimeAdapterLiveArtifact,
): Readonly<{
  BYBIT_DERIVATIVES: M1ListingHistoryCheckpoint | null;
  BITGET_FUTURES: M1ListingHistoryCheckpoint | null;
}> {
  const parsed = M1RuntimeAdapterLiveArtifactSchema.parse(artifact);
  const checkpoint = (
    probeId:
      | "BYBIT_LISTING_ANNOUNCEMENT"
      | "BITGET_LISTING_ANNOUNCEMENT",
  ): M1ListingHistoryCheckpoint | null => {
    const advance = parsed.executions.find((execution) =>
      execution.probeId === probeId
    )?.listingAdvance;
    return advance?.status === "COMMITTED"
      ? M1ListingHistoryCheckpointSchema.parse(advance.checkpoint)
      : null;
  };
  return deepFreezeArtifact({
    BYBIT_DERIVATIVES: checkpoint("BYBIT_LISTING_ANNOUNCEMENT"),
    BITGET_FUTURES: checkpoint("BITGET_LISTING_ANNOUNCEMENT"),
  });
}
