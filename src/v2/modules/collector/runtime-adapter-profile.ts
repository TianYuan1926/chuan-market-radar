import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
} from "../../runtime-schema/primitives";
import {
  M1AdaptiveCollectorPlanSchema,
  type M1AdaptiveCollectorPlan,
} from "./adaptive-collector-contract";
import {
  M1_ASSET_DOMAINS,
  M1_CAPABILITY_IDS,
  M1_COLLECTION_TIERS,
  M1_SCOPE_EPOCH,
  M1_SOURCE_IDS,
} from "../source-capability/source-capability-contract";
import {
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
} from "../source-capability/adapters/four-venue-capability-registry";
import {
  M1SourceConformanceArtifactSchema,
  type M1SourceConformanceArtifact,
  type M1SourceConformanceProbeId,
} from "../source-conformance/source-conformance-contract";
import {
  M1_EXACT_SOURCE_ENDPOINT_DEFINITIONS,
  M1_EXACT_SOURCE_PROBE_PLAN_DIGEST,
  type M1ExactSourceEndpointDefinition,
} from "../source-conformance/adapters/exact-source-conformance-runner";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";

export const M1_RUNTIME_ADAPTER_PROFILE_VERSION =
  "v2-m1-runtime-adapter-profile.v1" as const;
export const M1_RUNTIME_ADAPTER_PROFILE_SET_VERSION =
  "v2-m1-runtime-adapter-profile-set.v1" as const;
export const M1_RUNTIME_ADAPTER_BATCH_PLAN_VERSION =
  "v2-m1-runtime-adapter-batch-plan.v1" as const;
export const M1_RUNTIME_ADAPTER_BATCH_POLICY_VERSION =
  "v2-m1-runtime-adapter-batch-policy.v1" as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const ProbeIdSchema = z.enum(
  M1_EXACT_SOURCE_ENDPOINT_DEFINITIONS.map((definition) =>
    definition.probeId
  ) as [
    M1SourceConformanceProbeId,
    ...M1SourceConformanceProbeId[],
  ],
);

const UniqueStringsSchema = z.array(NonEmptyStringSchema)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "values must be unique",
      });
    }
  });

const AcceptanceAxesSchema = z.strictObject({
  bitgetVenue: z.boolean(),
  listingLifecycle: z.boolean(),
  equityAssetDomain: z.boolean(),
});

type AcceptanceAxes = z.infer<typeof AcceptanceAxesSchema>;

const RuntimeAdapterRegistryDispositionSchema = z.enum([
  "ADOPTED_AS_FACT",
  "DERIVED_WITH_LINEAGE",
  "OBSERVED_UNSUPPORTED",
  "REJECTED_REDUNDANT",
  "REJECTED_UNLICENSED",
  "REJECTED_LOW_VALUE_HIGH_COST",
  "UNAVAILABLE",
]);

type ProfileSemantics = Readonly<{
  paginationMode:
    | "SINGLE_REQUEST"
    | "CURSOR_UNTIL_TERMINAL"
    | "CHECKPOINTED_PAGE_HISTORY";
  historyResponsibility:
    | "CURRENT_SNAPSHOT_ONLY"
    | "CURRENT_CATALOG_WITH_EXPLICIT_PAGINATION"
    | "BYBIT_PROVIDER_AVAILABLE_HISTORY_CHECKPOINTED"
    | "BITGET_OFFICIAL_ONE_MONTH_WINDOW_CHECKPOINTED";
  maxRequestsPerSegment: number;
  operation:
    | "SOURCE_WIDE_SNAPSHOT"
    | "PAGINATED_SOURCE_WIDE_SNAPSHOT"
    | "LISTING_HISTORY_SEGMENT";
}>;

const PROFILE_SEMANTICS:
  Readonly<Record<M1SourceConformanceProbeId, ProfileSemantics>> =
    Object.freeze({
      BINANCE_SERVER_TIME: snapshot(),
      BINANCE_DERIVATIVE_CATALOG: snapshot(),
      BINANCE_SPOT_CATALOG: snapshot(),
      OKX_SERVER_TIME: snapshot(),
      OKX_DERIVATIVE_CATALOG: snapshot(),
      OKX_SPOT_CATALOG: snapshot(),
      BYBIT_SERVER_TIME: snapshot(),
      BYBIT_DERIVATIVE_CATALOG: Object.freeze({
        paginationMode: "CURSOR_UNTIL_TERMINAL",
        historyResponsibility: "CURRENT_CATALOG_WITH_EXPLICIT_PAGINATION",
        maxRequestsPerSegment: 64,
        operation: "PAGINATED_SOURCE_WIDE_SNAPSHOT",
      }),
      BYBIT_SPOT_CATALOG: snapshot(),
      BYBIT_LISTING_ANNOUNCEMENT: Object.freeze({
        paginationMode: "CHECKPOINTED_PAGE_HISTORY",
        historyResponsibility:
          "BYBIT_PROVIDER_AVAILABLE_HISTORY_CHECKPOINTED",
        maxRequestsPerSegment: 64,
        operation: "LISTING_HISTORY_SEGMENT",
      }),
      BITGET_SERVER_TIME: snapshot(),
      BITGET_DERIVATIVE_CATALOG: snapshot(),
      BITGET_SPOT_CATALOG: snapshot(),
      BITGET_LISTING_ANNOUNCEMENT: Object.freeze({
        paginationMode: "CURSOR_UNTIL_TERMINAL",
        historyResponsibility:
          "BITGET_OFFICIAL_ONE_MONTH_WINDOW_CHECKPOINTED",
        maxRequestsPerSegment: 64,
        operation: "LISTING_HISTORY_SEGMENT",
      }),
      COINGLASS_SUPPORTED_COINS: snapshot(),
    });

function snapshot(): ProfileSemantics {
  return Object.freeze({
    paginationMode: "SINGLE_REQUEST",
    historyResponsibility: "CURRENT_SNAPSHOT_ONLY",
    maxRequestsPerSegment: 1,
    operation: "SOURCE_WIDE_SNAPSHOT",
  });
}

function axesFor(input: {
  sourceId: string;
  capabilityId: string;
}): AcceptanceAxes {
  return {
    bitgetVenue: input.sourceId === "BITGET_FUTURES",
    listingLifecycle: [
      "SPOT_INSTRUMENT_CATALOG",
      "LISTING_ANNOUNCEMENT",
    ].includes(input.capabilityId),
    equityAssetDomain:
      input.sourceId !== "COINGLASS_V4" &&
      input.capabilityId === "DERIVATIVE_INSTRUMENT_CATALOG",
  };
}

const RuntimeAdapterProfileCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_RUNTIME_ADAPTER_PROFILE_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  runtimeReleaseId: ReleaseIdSchema,
  conformanceReleaseId: ReleaseIdSchema,
  conformanceArtifactId: NonEmptyStringSchema,
  conformanceArtifactHash: DigestSchema,
  probePlanDigest: DigestSchema,
  probeId: ProbeIdSchema,
  probeDefinitionDigest: DigestSchema,
  sourceId: z.enum(M1_SOURCE_IDS),
  capabilityId: z.enum(M1_CAPABILITY_IDS),
  gate: z.enum([
    "MULTI_ASSET_IDENTITY",
    "LISTING_INTELLIGENCE",
    "COINGLASS_CONTEXT",
  ]),
  endpointHost: NonEmptyStringSchema,
  initialUrl: z.string().url(),
  httpMethod: z.literal("GET"),
  credentialClass: z.enum([
    "PUBLIC_NO_CREDENTIAL",
    "READ_ONLY_API_KEY_RUNTIME_ONLY",
  ]),
  transportMode: z.literal("REST_POLL"),
  batchScope: z.literal("SOURCE_WIDE"),
  paginationMode: z.enum([
    "SINGLE_REQUEST",
    "CURSOR_UNTIL_TERMINAL",
    "CHECKPOINTED_PAGE_HISTORY",
  ]),
  conformancePaginationScope: z.enum([
    "NOT_APPLICABLE",
    "MUST_TERMINATE",
    "BOUNDED_HEAD_WINDOW",
  ]),
  historyResponsibility: z.enum([
    "CURRENT_SNAPSHOT_ONLY",
    "CURRENT_CATALOG_WITH_EXPLICIT_PAGINATION",
    "BYBIT_PROVIDER_AVAILABLE_HISTORY_CHECKPOINTED",
    "BITGET_OFFICIAL_ONE_MONTH_WINDOW_CHECKPOINTED",
  ]),
  operation: z.enum([
    "SOURCE_WIDE_SNAPSHOT",
    "PAGINATED_SOURCE_WIDE_SNAPSHOT",
    "LISTING_HISTORY_SEGMENT",
  ]),
  schedulerRequestTokensPerHttpRequest: z.literal(1),
  maxRequestsPerSegment: z.number().int().positive().max(64),
  perSourceConcurrency: z.literal(1),
  requestTimeoutMs: z.literal(12_000),
  maxResponseBytesPerPage: z.literal(8 * 1024 * 1024),
  disconnectRecovery: z.literal(
    "CHECKPOINTED_RETRY_WITHOUT_STALE_PROMOTION",
  ),
  registryDisposition: RuntimeAdapterRegistryDispositionSchema,
  schedulerRouteEligible: z.boolean(),
  routeBlockReasonCode: NonEmptyStringSchema.nullable(),
  acceptanceAxes: AcceptanceAxesSchema,
  equityUsageBoundary: z.enum([
    "NOT_APPLICABLE",
    "CATALOG_ACCOUNTING_ONLY_SESSION_CORPORATE_ACTION_FX_BASIS_BLOCKED",
  ]),
  liveConformancePassed: z.literal(true),
  noAuthorityShadowEligible: z.boolean(),
  runtimeExecutionAllowed: z.literal(false),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
});

export const M1RuntimeAdapterProfileSchema =
  RuntimeAdapterProfileCoreSchema.extend({
    profileId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((profile, context) => {
    const endpoint = new URL(profile.initialUrl);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.hostname !== profile.endpointHost ||
      endpoint.username !== "" ||
      endpoint.password !== ""
    ) {
      context.addIssue({
        code: "custom",
        message: "runtime adapter endpoint must remain exact HTTPS allowlist",
        path: ["initialUrl"],
      });
    }
    if (
      profile.equityUsageBoundary !==
        (
          profile.acceptanceAxes.equityAssetDomain
            ? "CATALOG_ACCOUNTING_ONLY_SESSION_CORPORATE_ACTION_FX_BASIS_BLOCKED"
            : "NOT_APPLICABLE"
        )
    ) {
      context.addIssue({
        code: "custom",
        message: "equity usage boundary does not match profile scope",
        path: ["equityUsageBoundary"],
      });
    }
    const expectedRouteEligible = [
      "ADOPTED_AS_FACT",
      "DERIVED_WITH_LINEAGE",
    ].includes(profile.registryDisposition);
    if (
      profile.schedulerRouteEligible !== expectedRouteEligible ||
      profile.noAuthorityShadowEligible !== expectedRouteEligible ||
      (
        expectedRouteEligible
          ? profile.routeBlockReasonCode !== null
          : profile.routeBlockReasonCode !==
            `registry_disposition_${profile.registryDisposition.toLowerCase()}`
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "runtime profile route eligibility does not match registry",
        path: ["schedulerRouteEligible"],
      });
    }
    const expectedHash = stableContentHash(runtimeAdapterProfileCore(profile));
    if (profile.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "runtime adapter profile content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      profile.profileId !==
        `runtime-profile:${profile.probeId}:${expectedHash.slice(7, 23)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "runtime adapter profile id mismatch",
        path: ["profileId"],
      });
    }
  });

export type M1RuntimeAdapterProfile = z.infer<
  typeof M1RuntimeAdapterProfileSchema
>;

function runtimeAdapterProfileCore(
  profile: z.input<typeof RuntimeAdapterProfileCoreSchema> & {
    readonly profileId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof RuntimeAdapterProfileCoreSchema> {
  return RuntimeAdapterProfileCoreSchema.parse({
    schemaVersion: profile.schemaVersion,
    scopeEpoch: profile.scopeEpoch,
    runtimeReleaseId: profile.runtimeReleaseId,
    conformanceReleaseId: profile.conformanceReleaseId,
    conformanceArtifactId: profile.conformanceArtifactId,
    conformanceArtifactHash: profile.conformanceArtifactHash,
    probePlanDigest: profile.probePlanDigest,
    probeId: profile.probeId,
    probeDefinitionDigest: profile.probeDefinitionDigest,
    sourceId: profile.sourceId,
    capabilityId: profile.capabilityId,
    gate: profile.gate,
    endpointHost: profile.endpointHost,
    initialUrl: profile.initialUrl,
    httpMethod: profile.httpMethod,
    credentialClass: profile.credentialClass,
    transportMode: profile.transportMode,
    batchScope: profile.batchScope,
    paginationMode: profile.paginationMode,
    conformancePaginationScope: profile.conformancePaginationScope,
    historyResponsibility: profile.historyResponsibility,
    operation: profile.operation,
    schedulerRequestTokensPerHttpRequest:
      profile.schedulerRequestTokensPerHttpRequest,
    maxRequestsPerSegment: profile.maxRequestsPerSegment,
    perSourceConcurrency: profile.perSourceConcurrency,
    requestTimeoutMs: profile.requestTimeoutMs,
    maxResponseBytesPerPage: profile.maxResponseBytesPerPage,
    disconnectRecovery: profile.disconnectRecovery,
    registryDisposition: profile.registryDisposition,
    schedulerRouteEligible: profile.schedulerRouteEligible,
    routeBlockReasonCode: profile.routeBlockReasonCode,
    acceptanceAxes: profile.acceptanceAxes,
    equityUsageBoundary: profile.equityUsageBoundary,
    liveConformancePassed: profile.liveConformancePassed,
    noAuthorityShadowEligible: profile.noAuthorityShadowEligible,
    runtimeExecutionAllowed: profile.runtimeExecutionAllowed,
    factAuthorityGranted: profile.factAuthorityGranted,
    candidateAuthorityGranted: profile.candidateAuthorityGranted,
    strategyAuthorityGranted: profile.strategyAuthorityGranted,
    readyAuthorityGranted: profile.readyAuthorityGranted,
  });
}

function buildProfile(input: {
  runtimeReleaseId: string;
  conformance: M1SourceConformanceArtifact;
  definition: M1ExactSourceEndpointDefinition;
}): M1RuntimeAdapterProfile {
  const semantics = PROFILE_SEMANTICS[input.definition.probeId];
  const acceptanceAxes = axesFor(input.definition);
  const registryRow = M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.rows.find(
    (row) =>
      row.sourceId === input.definition.sourceId &&
      row.capabilityId === input.definition.capabilityId,
  );
  if (registryRow === undefined) {
    throw new Error(
      `runtime endpoint has no registered capability: ${input.definition.probeId}`,
    );
  }
  const schedulerRouteEligible = [
    "ADOPTED_AS_FACT",
    "DERIVED_WITH_LINEAGE",
  ].includes(registryRow.disposition);
  const core = runtimeAdapterProfileCore({
    schemaVersion: M1_RUNTIME_ADAPTER_PROFILE_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    runtimeReleaseId: input.runtimeReleaseId,
    conformanceReleaseId: input.conformance.releaseId,
    conformanceArtifactId: input.conformance.artifactId,
    conformanceArtifactHash: input.conformance.contentHash,
    probePlanDigest: input.conformance.probePlanDigest,
    probeId: input.definition.probeId,
    probeDefinitionDigest: input.definition.definitionDigest,
    sourceId: input.definition.sourceId,
    capabilityId: input.definition.capabilityId,
    gate: input.definition.gate,
    endpointHost: input.definition.host,
    initialUrl: input.definition.initialUrl,
    httpMethod: "GET",
    credentialClass: input.definition.requiresReadOnlyApiKey
      ? "READ_ONLY_API_KEY_RUNTIME_ONLY"
      : "PUBLIC_NO_CREDENTIAL",
    transportMode: "REST_POLL",
    batchScope: "SOURCE_WIDE",
    paginationMode: semantics.paginationMode,
    conformancePaginationScope: input.definition.paginationExpectation,
    historyResponsibility: semantics.historyResponsibility,
    operation: semantics.operation,
    schedulerRequestTokensPerHttpRequest: 1,
    maxRequestsPerSegment: semantics.maxRequestsPerSegment,
    perSourceConcurrency: 1,
    requestTimeoutMs: 12_000,
    maxResponseBytesPerPage: 8 * 1024 * 1024,
    disconnectRecovery: "CHECKPOINTED_RETRY_WITHOUT_STALE_PROMOTION",
    registryDisposition: registryRow.disposition,
    schedulerRouteEligible,
    routeBlockReasonCode: schedulerRouteEligible
      ? null
      : `registry_disposition_${registryRow.disposition.toLowerCase()}`,
    acceptanceAxes,
    equityUsageBoundary:
      acceptanceAxes.equityAssetDomain
        ? "CATALOG_ACCOUNTING_ONLY_SESSION_CORPORATE_ACTION_FX_BASIS_BLOCKED"
        : "NOT_APPLICABLE",
    liveConformancePassed: true,
    noAuthorityShadowEligible: schedulerRouteEligible,
    runtimeExecutionAllowed: false,
    factAuthorityGranted: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
  });
  const contentHash = stableContentHash(core);
  return M1RuntimeAdapterProfileSchema.parse({
    ...core,
    profileId:
      `runtime-profile:${core.probeId}:${contentHash.slice(7, 23)}`,
    contentHash,
  });
}

const ProfileSetStatusSchema = z.enum([
  "COMPLETE_15_OF_15_LIVE_CONFORMANCE_PASS",
  "PARTIAL_LIVE_CONFORMANCE_PASS_FAILED_CAPABILITIES_ABSENT",
  "TEST_ONLY_NO_RUNTIME_PROFILES",
]);

const SchedulerRouteStatusSchema = z.enum([
  "ALL_LIVE_PROFILES_ROUTE_ELIGIBLE",
  "PARTIAL_LIVE_PROFILES_ROUTE_ELIGIBLE",
  "NO_LIVE_PROFILES",
]);

const RuntimeAdapterProfileSetCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_RUNTIME_ADAPTER_PROFILE_SET_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  runtimeReleaseId: ReleaseIdSchema,
  conformanceReleaseId: ReleaseIdSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  conformanceArtifactId: NonEmptyStringSchema,
  conformanceArtifactHash: DigestSchema,
  registryDigest: DigestSchema,
  probePlanDigest: DigestSchema,
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  networkEnvironment: z.enum([
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  status: ProfileSetStatusSchema,
  expectedProbeCount: z.literal(15),
  passedProbeCount: NonNegativeIntegerSchema,
  profileCount: NonNegativeIntegerSchema,
  missingProbeIds: z.array(ProbeIdSchema),
  schedulerRouteStatus: SchedulerRouteStatusSchema,
  schedulerRouteEligibleProfileCount: NonNegativeIntegerSchema,
  registryBlockedProfileCount: NonNegativeIntegerSchema,
  registryBlockedProbeIds: z.array(ProbeIdSchema),
  bitgetVenueProfileCount: NonNegativeIntegerSchema,
  listingLifecycleProfileCount: NonNegativeIntegerSchema,
  equityCatalogProfileCount: NonNegativeIntegerSchema,
  restProfileCount: NonNegativeIntegerSchema,
  webSocketProfileCount: z.literal(0),
  profiles: z.array(M1RuntimeAdapterProfileSchema),
  acceptanceAccounting: z.literal(
    "INDEPENDENT_OVERLAPPING_AXES_NO_CROSS_PASS",
  ),
  webSocketCoverageStatus: z.literal(
    "ABSENT_NO_LIVE_CONFORMANCE_NO_WS_RUNTIME_PROFILE",
  ),
  failedCapabilityProfileAllowed: z.literal(false),
  runtimeExecutionAllowed: z.literal(false),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1RuntimeAdapterProfileSetSchema =
  RuntimeAdapterProfileSetCoreSchema.extend({
    profileSetId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((profileSet, context) => {
    if (Date.parse(profileSet.sourceCutoff) > Date.parse(profileSet.generatedAt)) {
      context.addIssue({
        code: "custom",
        message: "profile source cutoff cannot be later than generation",
        path: ["sourceCutoff"],
      });
    }
    const profileProbeIds = profileSet.profiles.map((profile) =>
      profile.probeId
    );
    if (
      new Set(profileProbeIds).size !== profileProbeIds.length ||
      profileSet.profiles.some((profile, index) =>
        index > 0 &&
        profileSet.profiles[index - 1]!.probeId.localeCompare(
            profile.probeId,
          ) >= 0
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "profiles must be unique and canonically ordered",
        path: ["profiles"],
      });
    }
    if (
      profileSet.profileCount !== profileSet.profiles.length ||
      profileSet.passedProbeCount !== profileSet.profiles.length ||
      profileSet.restProfileCount !== profileSet.profiles.length
    ) {
      context.addIssue({
        code: "custom",
        message: "profile counts do not match live-passed profiles",
        path: ["profileCount"],
      });
    }
    const routeEligibleProfiles = profileSet.profiles.filter((profile) =>
      profile.schedulerRouteEligible
    );
    const registryBlockedProbeIds = profileSet.profiles
      .filter((profile) => !profile.schedulerRouteEligible)
      .map((profile) => profile.probeId)
      .sort();
    const expectedRouteStatus = profileSet.profileCount === 0
      ? "NO_LIVE_PROFILES"
      : routeEligibleProfiles.length === profileSet.profileCount
        ? "ALL_LIVE_PROFILES_ROUTE_ELIGIBLE"
        : "PARTIAL_LIVE_PROFILES_ROUTE_ELIGIBLE";
    if (
      profileSet.schedulerRouteEligibleProfileCount !==
        routeEligibleProfiles.length ||
      profileSet.registryBlockedProfileCount !==
        registryBlockedProbeIds.length ||
      stableContentHash(profileSet.registryBlockedProbeIds) !==
        stableContentHash(registryBlockedProbeIds) ||
      profileSet.schedulerRouteStatus !== expectedRouteStatus
    ) {
      context.addIssue({
        code: "custom",
        message: "profile route-eligibility accounting does not reconcile",
        path: ["schedulerRouteStatus"],
      });
    }
    const expectedMissing = M1_EXACT_SOURCE_ENDPOINT_DEFINITIONS
      .map((definition) => definition.probeId)
      .filter((probeId) => !profileProbeIds.includes(probeId))
      .sort();
    if (
      stableContentHash(profileSet.missingProbeIds) !==
        stableContentHash(expectedMissing)
    ) {
      context.addIssue({
        code: "custom",
        message: "missing probe ids do not match absent profiles",
        path: ["missingProbeIds"],
      });
    }
    for (const [field, expected] of [
      [
        "bitgetVenueProfileCount",
        profileSet.profiles.filter((profile) =>
          profile.acceptanceAxes.bitgetVenue
        ).length,
      ],
      [
        "listingLifecycleProfileCount",
        profileSet.profiles.filter((profile) =>
          profile.acceptanceAxes.listingLifecycle
        ).length,
      ],
      [
        "equityCatalogProfileCount",
        profileSet.profiles.filter((profile) =>
          profile.acceptanceAxes.equityAssetDomain
        ).length,
      ],
    ] as const) {
      if (profileSet[field] !== expected) {
        context.addIssue({
          code: "custom",
          message: `${field} does not match profile axes`,
          path: [field],
        });
      }
    }
    const expectedStatus =
      profileSet.evidenceClass === "TEST_ONLY"
        ? "TEST_ONLY_NO_RUNTIME_PROFILES"
        : profileSet.profileCount === 15
          ? "COMPLETE_15_OF_15_LIVE_CONFORMANCE_PASS"
          : "PARTIAL_LIVE_CONFORMANCE_PASS_FAILED_CAPABILITIES_ABSENT";
    if (profileSet.status !== expectedStatus) {
      context.addIssue({
        code: "custom",
        message: "profile set status does not match evidence",
        path: ["status"],
      });
    }
    const expectedHash = stableContentHash(
      runtimeAdapterProfileSetCore(profileSet),
    );
    if (profileSet.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "runtime profile set content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      profileSet.profileSetId !==
        `runtime-profile-set:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "runtime profile set id mismatch",
        path: ["profileSetId"],
      });
    }
  });

export type M1RuntimeAdapterProfileSet = z.infer<
  typeof M1RuntimeAdapterProfileSetSchema
>;

function runtimeAdapterProfileSetCore(
  profileSet: z.input<typeof RuntimeAdapterProfileSetCoreSchema> & {
    readonly profileSetId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof RuntimeAdapterProfileSetCoreSchema> {
  return RuntimeAdapterProfileSetCoreSchema.parse({
    schemaVersion: profileSet.schemaVersion,
    scopeEpoch: profileSet.scopeEpoch,
    runtimeReleaseId: profileSet.runtimeReleaseId,
    conformanceReleaseId: profileSet.conformanceReleaseId,
    generatedAt: profileSet.generatedAt,
    sourceCutoff: profileSet.sourceCutoff,
    conformanceArtifactId: profileSet.conformanceArtifactId,
    conformanceArtifactHash: profileSet.conformanceArtifactHash,
    registryDigest: profileSet.registryDigest,
    probePlanDigest: profileSet.probePlanDigest,
    evidenceClass: profileSet.evidenceClass,
    networkEnvironment: profileSet.networkEnvironment,
    status: profileSet.status,
    expectedProbeCount: profileSet.expectedProbeCount,
    passedProbeCount: profileSet.passedProbeCount,
    profileCount: profileSet.profileCount,
    missingProbeIds: profileSet.missingProbeIds,
    schedulerRouteStatus: profileSet.schedulerRouteStatus,
    schedulerRouteEligibleProfileCount:
      profileSet.schedulerRouteEligibleProfileCount,
    registryBlockedProfileCount: profileSet.registryBlockedProfileCount,
    registryBlockedProbeIds: profileSet.registryBlockedProbeIds,
    bitgetVenueProfileCount: profileSet.bitgetVenueProfileCount,
    listingLifecycleProfileCount:
      profileSet.listingLifecycleProfileCount,
    equityCatalogProfileCount: profileSet.equityCatalogProfileCount,
    restProfileCount: profileSet.restProfileCount,
    webSocketProfileCount: profileSet.webSocketProfileCount,
    profiles: profileSet.profiles,
    acceptanceAccounting: profileSet.acceptanceAccounting,
    webSocketCoverageStatus: profileSet.webSocketCoverageStatus,
    failedCapabilityProfileAllowed: profileSet.failedCapabilityProfileAllowed,
    runtimeExecutionAllowed: profileSet.runtimeExecutionAllowed,
    factAuthorityGranted: profileSet.factAuthorityGranted,
    candidateAuthorityGranted: profileSet.candidateAuthorityGranted,
    strategyAuthorityGranted: profileSet.strategyAuthorityGranted,
    readyAuthorityGranted: profileSet.readyAuthorityGranted,
    productionChanged: profileSet.productionChanged,
  });
}

export function buildM1RuntimeAdapterProfileSet(input: {
  runtimeReleaseId: string;
  generatedAt: string;
  conformanceArtifact: M1SourceConformanceArtifact;
}): M1RuntimeAdapterProfileSet {
  ReleaseIdSchema.parse(input.runtimeReleaseId);
  const conformance = M1SourceConformanceArtifactSchema.parse(
    input.conformanceArtifact,
  );
  if (conformance.probePlanDigest !== M1_EXACT_SOURCE_PROBE_PLAN_DIGEST) {
    throw new Error(
      "source conformance probe plan does not match current endpoint semantics",
    );
  }
  if (
    conformance.registryDigest !==
      M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest
  ) {
    throw new Error(
      "source conformance artifact does not match the current capability registry",
    );
  }
  if (Date.parse(input.generatedAt) < Date.parse(conformance.generatedAt)) {
    throw new Error("profile set cannot predate conformance evidence");
  }
  if (
    conformance.evidenceClass === "LIVE_READ_ONLY" &&
    conformance.networkEnvironment !== "TENCENT_ISOLATED_READ_ONLY"
  ) {
    throw new Error("live profiles require Tencent isolated read-only evidence");
  }

  const observations = new Map(
    conformance.probes.map((observation) => [
      observation.probeId,
      observation,
    ]),
  );
  for (const definition of M1_EXACT_SOURCE_ENDPOINT_DEFINITIONS) {
    const observation = observations.get(definition.probeId);
    if (
      observation === undefined ||
      observation.definitionDigest !== definition.definitionDigest
    ) {
      throw new Error(
        `source definition drift for ${definition.probeId}`,
      );
    }
  }

  const profiles = conformance.evidenceClass === "LIVE_READ_ONLY"
    ? M1_EXACT_SOURCE_ENDPOINT_DEFINITIONS
      .filter((definition) =>
        observations.get(definition.probeId)?.outcome === "PASS"
      )
      .map((definition) =>
        buildProfile({
          runtimeReleaseId: input.runtimeReleaseId,
          conformance,
          definition,
        })
      )
      .sort((left, right) => left.probeId.localeCompare(right.probeId))
    : [];
  const missingProbeIds = M1_EXACT_SOURCE_ENDPOINT_DEFINITIONS
    .map((definition) => definition.probeId)
    .filter((probeId) =>
      !profiles.some((profile) => profile.probeId === probeId)
    )
    .sort();
  const status = conformance.evidenceClass === "TEST_ONLY"
    ? "TEST_ONLY_NO_RUNTIME_PROFILES" as const
    : profiles.length === 15
      ? "COMPLETE_15_OF_15_LIVE_CONFORMANCE_PASS" as const
      : "PARTIAL_LIVE_CONFORMANCE_PASS_FAILED_CAPABILITIES_ABSENT" as const;
  const schedulerRouteEligibleProfileCount = profiles.filter((profile) =>
    profile.schedulerRouteEligible
  ).length;
  const registryBlockedProbeIds = profiles
    .filter((profile) => !profile.schedulerRouteEligible)
    .map((profile) => profile.probeId)
    .sort();
  const schedulerRouteStatus = profiles.length === 0
    ? "NO_LIVE_PROFILES" as const
    : schedulerRouteEligibleProfileCount === profiles.length
      ? "ALL_LIVE_PROFILES_ROUTE_ELIGIBLE" as const
      : "PARTIAL_LIVE_PROFILES_ROUTE_ELIGIBLE" as const;
  const core = runtimeAdapterProfileSetCore({
    schemaVersion: M1_RUNTIME_ADAPTER_PROFILE_SET_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    runtimeReleaseId: input.runtimeReleaseId,
    conformanceReleaseId: conformance.releaseId,
    generatedAt: input.generatedAt,
    sourceCutoff: conformance.sourceCutoff,
    conformanceArtifactId: conformance.artifactId,
    conformanceArtifactHash: conformance.contentHash,
    registryDigest: conformance.registryDigest,
    probePlanDigest: conformance.probePlanDigest,
    evidenceClass: conformance.evidenceClass,
    networkEnvironment: conformance.evidenceClass === "LIVE_READ_ONLY"
      ? "TENCENT_ISOLATED_READ_ONLY"
      : "TEST_HARNESS",
    status,
    expectedProbeCount: 15,
    passedProbeCount: profiles.length,
    profileCount: profiles.length,
    missingProbeIds,
    schedulerRouteStatus,
    schedulerRouteEligibleProfileCount,
    registryBlockedProfileCount: registryBlockedProbeIds.length,
    registryBlockedProbeIds,
    bitgetVenueProfileCount: profiles.filter((profile) =>
      profile.acceptanceAxes.bitgetVenue
    ).length,
    listingLifecycleProfileCount: profiles.filter((profile) =>
      profile.acceptanceAxes.listingLifecycle
    ).length,
    equityCatalogProfileCount: profiles.filter((profile) =>
      profile.acceptanceAxes.equityAssetDomain
    ).length,
    restProfileCount: profiles.length,
    webSocketProfileCount: 0,
    profiles,
    acceptanceAccounting:
      "INDEPENDENT_OVERLAPPING_AXES_NO_CROSS_PASS",
    webSocketCoverageStatus:
      "ABSENT_NO_LIVE_CONFORMANCE_NO_WS_RUNTIME_PROFILE",
    failedCapabilityProfileAllowed: false,
    runtimeExecutionAllowed: false,
    factAuthorityGranted: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1RuntimeAdapterProfileSetSchema.parse({
    ...core,
    profileSetId: `runtime-profile-set:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}

export const M1RuntimeAdapterBatchPolicySchema = z.strictObject({
  policyVersion: z.literal(M1_RUNTIME_ADAPTER_BATCH_POLICY_VERSION),
  maxBatchCount: z.number().int().positive().max(1_000),
  maxCoveredIntentsPerBatch: z.number().int().positive().max(200_000),
  maxListingHistoryPagesPerSegment: z.number().int().positive().max(64),
  maxTotalRequestTokens: z.number().int().positive().max(100_000),
  crossSourceConcurrency: z.number().int().positive().max(5),
  perSourceConcurrency: z.literal(1),
  fullReadyIntentAccountingRequired: z.literal(true),
  failedCapabilityBatchAllowed: z.literal(false),
  staleFallbackAllowed: z.literal(false),
  automaticRuntimeExecutionAllowed: z.literal(false),
  automaticFactAuthorityAllowed: z.literal(false),
});

export type M1RuntimeAdapterBatchPolicy = z.infer<
  typeof M1RuntimeAdapterBatchPolicySchema
>;

const RuntimeAdapterBatchSchema = z.strictObject({
  batchId: NonEmptyStringSchema,
  profileId: NonEmptyStringSchema,
  sourceId: z.enum(M1_SOURCE_IDS),
  capabilityId: z.enum(M1_CAPABILITY_IDS),
  operation: z.enum([
    "SOURCE_WIDE_SNAPSHOT",
    "PAGINATED_SOURCE_WIDE_SNAPSHOT",
    "LISTING_HISTORY_SEGMENT",
  ]),
  requestBudgetClass: z.enum([
    "ADAPTIVE_INTENT_BATCHED",
    "LISTING_HISTORY_CHECKPOINTED",
  ]),
  collectionTiers: z.array(z.enum(M1_COLLECTION_TIERS)).min(1),
  assetDomains: z.array(z.enum(M1_ASSET_DOMAINS)).min(1),
  coveredIntentKeys: UniqueStringsSchema.min(1),
  coveredSubjectIds: UniqueStringsSchema.min(1),
  coveredIntentCount: z.number().int().positive(),
  maxHttpRequests: z.number().int().positive().max(64),
  maxRequestTokens: z.number().int().positive().max(64),
  acceptanceAxes: AcceptanceAxesSchema,
  equityUsageBoundary: z.enum([
    "NOT_APPLICABLE",
    "CATALOG_ACCOUNTING_ONLY_SESSION_CORPORATE_ACTION_FX_BASIS_BLOCKED",
  ]),
  runtimeExecutionAllowed: z.literal(false),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
}).superRefine((batch, context) => {
  if (
    batch.coveredIntentCount !== batch.coveredIntentKeys.length ||
    batch.maxRequestTokens !== batch.maxHttpRequests
  ) {
    context.addIssue({
      code: "custom",
      message: "batch counts do not match covered intents or request tokens",
    });
  }
  const expectedBudgetClass = batch.operation === "LISTING_HISTORY_SEGMENT"
    ? "LISTING_HISTORY_CHECKPOINTED"
    : "ADAPTIVE_INTENT_BATCHED";
  if (batch.requestBudgetClass !== expectedBudgetClass) {
    context.addIssue({
      code: "custom",
      message: "batch request budget class does not match its operation",
      path: ["requestBudgetClass"],
    });
  }
});

export type M1RuntimeAdapterBatch = z.infer<
  typeof RuntimeAdapterBatchSchema
>;

const AcceptanceCountsSchema = z.strictObject({
  bitgetVenue: NonNegativeIntegerSchema,
  listingLifecycle: NonNegativeIntegerSchema,
  equityAssetDomain: NonNegativeIntegerSchema,
});

const RuntimeAdapterBatchPlanCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_RUNTIME_ADAPTER_BATCH_PLAN_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  adaptivePlanId: NonEmptyStringSchema,
  adaptivePlanHash: DigestSchema,
  profileSetId: NonEmptyStringSchema,
  profileSetHash: DigestSchema,
  policyHash: DigestSchema,
  inputIntentCount: NonNegativeIntegerSchema,
  readyIntentCount: NonNegativeIntegerSchema,
  nonReadyIntentCount: NonNegativeIntegerSchema,
  batchedReadyIntentCount: NonNegativeIntegerSchema,
  batchCount: NonNegativeIntegerSchema,
  maximumHttpRequests: NonNegativeIntegerSchema,
  maximumRequestTokens: NonNegativeIntegerSchema,
  snapshotReadyIntentCount: NonNegativeIntegerSchema,
  snapshotPerIntentTokenUpperBound: NonNegativeIntegerSchema,
  snapshotRequestTokens: NonNegativeIntegerSchema,
  snapshotRequestTokenSavings: NonNegativeIntegerSchema,
  listingHistoryRequestTokens: NonNegativeIntegerSchema,
  acceptanceIntentDenominators: AcceptanceCountsSchema,
  acceptanceBatchCounts: AcceptanceCountsSchema,
  batches: z.array(RuntimeAdapterBatchSchema),
  readyIntentAccountingStatus: z.literal("COMPLETE_EXACTLY_ONCE"),
  acceptanceAccounting: z.literal(
    "INDEPENDENT_OVERLAPPING_AXES_NO_CROSS_PASS",
  ),
  equityTradableFactBatchCount: z.literal(0),
  listingCandidateEmissionAllowed: z.literal(false),
  webSocketRuntimeProfileCount: z.literal(0),
  runtimeExecutionAllowed: z.literal(false),
  factAuthorityGranted: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1RuntimeAdapterBatchPlanSchema =
  RuntimeAdapterBatchPlanCoreSchema.extend({
    batchPlanId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((plan, context) => {
    if (Date.parse(plan.sourceCutoff) > Date.parse(plan.generatedAt)) {
      context.addIssue({
        code: "custom",
        message: "batch plan source cutoff cannot be in the future",
        path: ["sourceCutoff"],
      });
    }
    if (
      plan.inputIntentCount !==
        plan.readyIntentCount + plan.nonReadyIntentCount ||
      plan.batchedReadyIntentCount !== plan.readyIntentCount ||
      plan.batchCount !== plan.batches.length
    ) {
      context.addIssue({
        code: "custom",
        message: "batch plan denominator counts do not reconcile",
      });
    }
    const covered = plan.batches.flatMap((batch) =>
      batch.coveredIntentKeys
    );
    if (
      new Set(covered).size !== covered.length ||
      covered.length !== plan.readyIntentCount
    ) {
      context.addIssue({
        code: "custom",
        message: "ready intents must be covered exactly once",
        path: ["batches"],
      });
    }
    const maximumHttpRequests = plan.batches.reduce(
      (sum, batch) => sum + batch.maxHttpRequests,
      0,
    );
    const maximumRequestTokens = plan.batches.reduce(
      (sum, batch) => sum + batch.maxRequestTokens,
      0,
    );
    const snapshotBatches = plan.batches.filter((batch) =>
      batch.requestBudgetClass === "ADAPTIVE_INTENT_BATCHED"
    );
    const snapshotReadyIntentCount = snapshotBatches.reduce(
      (sum, batch) => sum + batch.coveredIntentCount,
      0,
    );
    const snapshotRequestTokens = snapshotBatches.reduce(
      (sum, batch) => sum + batch.maxRequestTokens,
      0,
    );
    const listingHistoryRequestTokens = plan.batches
      .filter((batch) =>
        batch.requestBudgetClass === "LISTING_HISTORY_CHECKPOINTED"
      )
      .reduce((sum, batch) => sum + batch.maxRequestTokens, 0);
    if (
      plan.maximumHttpRequests !== maximumHttpRequests ||
      plan.maximumRequestTokens !== maximumRequestTokens ||
      plan.snapshotReadyIntentCount !== snapshotReadyIntentCount ||
      plan.snapshotRequestTokens !== snapshotRequestTokens ||
      plan.listingHistoryRequestTokens !== listingHistoryRequestTokens ||
      plan.maximumRequestTokens !==
        plan.snapshotRequestTokens + plan.listingHistoryRequestTokens ||
      plan.snapshotRequestTokenSavings !==
        plan.snapshotPerIntentTokenUpperBound -
          plan.snapshotRequestTokens
    ) {
      context.addIssue({
        code: "custom",
        message: "request batching totals do not reconcile",
      });
    }
    const expectedHash = stableContentHash(runtimeAdapterBatchPlanCore(plan));
    if (plan.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "runtime adapter batch plan content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      plan.batchPlanId !==
        `runtime-batch-plan:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "runtime adapter batch plan id mismatch",
        path: ["batchPlanId"],
      });
    }
  });

export type M1RuntimeAdapterBatchPlan = z.infer<
  typeof M1RuntimeAdapterBatchPlanSchema
>;

function runtimeAdapterBatchPlanCore(
  plan: z.input<typeof RuntimeAdapterBatchPlanCoreSchema> & {
    readonly batchPlanId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof RuntimeAdapterBatchPlanCoreSchema> {
  return RuntimeAdapterBatchPlanCoreSchema.parse({
    schemaVersion: plan.schemaVersion,
    scopeEpoch: plan.scopeEpoch,
    releaseId: plan.releaseId,
    generatedAt: plan.generatedAt,
    sourceCutoff: plan.sourceCutoff,
    adaptivePlanId: plan.adaptivePlanId,
    adaptivePlanHash: plan.adaptivePlanHash,
    profileSetId: plan.profileSetId,
    profileSetHash: plan.profileSetHash,
    policyHash: plan.policyHash,
    inputIntentCount: plan.inputIntentCount,
    readyIntentCount: plan.readyIntentCount,
    nonReadyIntentCount: plan.nonReadyIntentCount,
    batchedReadyIntentCount: plan.batchedReadyIntentCount,
    batchCount: plan.batchCount,
    maximumHttpRequests: plan.maximumHttpRequests,
    maximumRequestTokens: plan.maximumRequestTokens,
    snapshotReadyIntentCount: plan.snapshotReadyIntentCount,
    snapshotPerIntentTokenUpperBound:
      plan.snapshotPerIntentTokenUpperBound,
    snapshotRequestTokens: plan.snapshotRequestTokens,
    snapshotRequestTokenSavings: plan.snapshotRequestTokenSavings,
    listingHistoryRequestTokens: plan.listingHistoryRequestTokens,
    acceptanceIntentDenominators: plan.acceptanceIntentDenominators,
    acceptanceBatchCounts: plan.acceptanceBatchCounts,
    batches: plan.batches,
    readyIntentAccountingStatus: plan.readyIntentAccountingStatus,
    acceptanceAccounting: plan.acceptanceAccounting,
    equityTradableFactBatchCount: plan.equityTradableFactBatchCount,
    listingCandidateEmissionAllowed: plan.listingCandidateEmissionAllowed,
    webSocketRuntimeProfileCount: plan.webSocketRuntimeProfileCount,
    runtimeExecutionAllowed: plan.runtimeExecutionAllowed,
    factAuthorityGranted: plan.factAuthorityGranted,
    candidateAuthorityGranted: plan.candidateAuthorityGranted,
    strategyAuthorityGranted: plan.strategyAuthorityGranted,
    readyAuthorityGranted: plan.readyAuthorityGranted,
    productionChanged: plan.productionChanged,
  });
}

function countAcceptance(
  values: readonly AcceptanceAxes[],
): z.infer<typeof AcceptanceCountsSchema> {
  return {
    bitgetVenue: values.filter((value) => value.bitgetVenue).length,
    listingLifecycle: values.filter((value) =>
      value.listingLifecycle
    ).length,
    equityAssetDomain: values.filter((value) =>
      value.equityAssetDomain
    ).length,
  };
}

function intentAxes(
  intent: M1AdaptiveCollectorPlan["intents"][number],
): AcceptanceAxes {
  return {
    bitgetVenue: intent.collectionSourceId === "BITGET_FUTURES",
    listingLifecycle: [
      "SPOT_INSTRUMENT_CATALOG",
      "LISTING_ANNOUNCEMENT",
    ].includes(intent.capabilityId),
    equityAssetDomain: intent.assetDomain.startsWith("EQUITY_"),
  };
}

export function buildM1RuntimeAdapterBatchPlan(input: {
  generatedAt: string;
  adaptivePlan: M1AdaptiveCollectorPlan;
  profileSet: M1RuntimeAdapterProfileSet;
  policy: M1RuntimeAdapterBatchPolicy;
}): M1RuntimeAdapterBatchPlan {
  const adaptivePlan = M1AdaptiveCollectorPlanSchema.parse(input.adaptivePlan);
  const profileSet = M1RuntimeAdapterProfileSetSchema.parse(input.profileSet);
  const policy = M1RuntimeAdapterBatchPolicySchema.parse(input.policy);
  if (
    adaptivePlan.releaseId !== profileSet.runtimeReleaseId ||
    adaptivePlan.registryDigest !== profileSet.registryDigest
  ) {
    throw new Error(
      "adaptive plan and runtime profiles must share release and registry",
    );
  }

  const readyIntents = adaptivePlan.intents.filter((intent) =>
    intent.disposition === "READY_FOR_RUNTIME_ADAPTER"
  );
  const profileByKey = new Map(
    profileSet.profiles.map((profile) => [
      `${profile.sourceId}:${profile.capabilityId}`,
      profile,
    ]),
  );
  const groups = new Map<string, {
    profile: M1RuntimeAdapterProfile;
    intents: M1AdaptiveCollectorPlan["intents"][number][];
  }>();
  for (const intent of readyIntents) {
    const profile = profileByKey.get(
      `${intent.collectionSourceId}:${intent.capabilityId}`,
    );
    if (profile === undefined || !profile.schedulerRouteEligible) {
      throw new Error(
        `ready intent has no live-passed route-eligible runtime profile: ` +
          intent.intentKey,
      );
    }
    const existing = groups.get(profile.profileId);
    if (existing === undefined) {
      groups.set(profile.profileId, { profile, intents: [intent] });
    } else {
      existing.intents.push(intent);
    }
  }

  if (groups.size > policy.maxBatchCount) {
    throw new Error("runtime adapter batch count exceeds bounded policy");
  }
  const batches = [...groups.values()].map(({ profile, intents }) => {
    if (intents.length > policy.maxCoveredIntentsPerBatch) {
      throw new Error(
        `profile batch exceeds covered-intent bound: ${profile.profileId}`,
      );
    }
    const coveredIntentKeys = intents.map((intent) => intent.intentKey).sort();
    const collectionTiers = [...new Set(
      intents.map((intent) => intent.tier),
    )].sort();
    const assetDomains = [...new Set(
      intents.map((intent) => intent.assetDomain),
    )].sort();
    const coveredSubjectIds = [...new Set(
      intents.map((intent) => intent.subjectId),
    )].sort();
    const maxHttpRequests = profile.operation === "LISTING_HISTORY_SEGMENT"
      ? Math.min(
        profile.maxRequestsPerSegment,
        policy.maxListingHistoryPagesPerSegment,
      )
      : profile.maxRequestsPerSegment;
    const acceptanceAxes = {
      bitgetVenue:
        intents.some((intent) => intentAxes(intent).bitgetVenue),
      listingLifecycle:
        intents.some((intent) => intentAxes(intent).listingLifecycle),
      equityAssetDomain:
        intents.some((intent) => intentAxes(intent).equityAssetDomain),
    };
    const batchCore = {
      profileId: profile.profileId,
      sourceId: profile.sourceId,
      capabilityId: profile.capabilityId,
      operation: profile.operation,
      requestBudgetClass: profile.operation === "LISTING_HISTORY_SEGMENT"
        ? "LISTING_HISTORY_CHECKPOINTED" as const
        : "ADAPTIVE_INTENT_BATCHED" as const,
      collectionTiers,
      assetDomains,
      coveredIntentKeys,
      coveredSubjectIds,
      coveredIntentCount: coveredIntentKeys.length,
      maxHttpRequests,
      maxRequestTokens:
        maxHttpRequests * profile.schedulerRequestTokensPerHttpRequest,
      acceptanceAxes,
      equityUsageBoundary: acceptanceAxes.equityAssetDomain
        ? profile.equityUsageBoundary
        : "NOT_APPLICABLE" as const,
      runtimeExecutionAllowed: false as const,
      factAuthorityGranted: false as const,
      candidateAuthorityGranted: false as const,
      strategyAuthorityGranted: false as const,
      readyAuthorityGranted: false as const,
    };
    return RuntimeAdapterBatchSchema.parse({
      ...batchCore,
      batchId: `runtime-batch:${
        stableContentHash(batchCore).slice(7, 31)
      }`,
    });
  }).sort((left, right) => left.batchId.localeCompare(right.batchId));

  const maximumHttpRequests = batches.reduce(
    (sum, batch) => sum + batch.maxHttpRequests,
    0,
  );
  const maximumRequestTokens = batches.reduce(
    (sum, batch) => sum + batch.maxRequestTokens,
    0,
  );
  if (maximumRequestTokens > policy.maxTotalRequestTokens) {
    throw new Error("runtime adapter request tokens exceed bounded policy");
  }
  const listingHistoryIntentKeys = new Set(
    batches
      .filter((batch) =>
        batch.requestBudgetClass === "LISTING_HISTORY_CHECKPOINTED"
      )
      .flatMap((batch) => batch.coveredIntentKeys),
  );
  const snapshotReadyIntents = readyIntents.filter((intent) =>
    !listingHistoryIntentKeys.has(intent.intentKey)
  );
  const snapshotPerIntentTokenUpperBound = snapshotReadyIntents.reduce(
    (sum, intent) => sum + intent.plannedRequestTokens,
    0,
  );
  const snapshotRequestTokens = batches
    .filter((batch) =>
      batch.requestBudgetClass === "ADAPTIVE_INTENT_BATCHED"
    )
    .reduce((sum, batch) => sum + batch.maxRequestTokens, 0);
  const listingHistoryRequestTokens = maximumRequestTokens -
    snapshotRequestTokens;
  if (snapshotRequestTokens > snapshotPerIntentTokenUpperBound) {
    throw new Error(
      "snapshot batching cannot exceed its per-intent token upper bound",
    );
  }
  const core = runtimeAdapterBatchPlanCore({
    schemaVersion: M1_RUNTIME_ADAPTER_BATCH_PLAN_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: adaptivePlan.releaseId,
    generatedAt: input.generatedAt,
    sourceCutoff: adaptivePlan.sourceCutoff,
    adaptivePlanId: adaptivePlan.planId,
    adaptivePlanHash: adaptivePlan.contentHash,
    profileSetId: profileSet.profileSetId,
    profileSetHash: profileSet.contentHash,
    policyHash: stableContentHash(policy),
    inputIntentCount: adaptivePlan.intentCount,
    readyIntentCount: readyIntents.length,
    nonReadyIntentCount: adaptivePlan.intentCount - readyIntents.length,
    batchedReadyIntentCount: readyIntents.length,
    batchCount: batches.length,
    maximumHttpRequests,
    maximumRequestTokens,
    snapshotReadyIntentCount: snapshotReadyIntents.length,
    snapshotPerIntentTokenUpperBound,
    snapshotRequestTokens,
    snapshotRequestTokenSavings:
      snapshotPerIntentTokenUpperBound - snapshotRequestTokens,
    listingHistoryRequestTokens,
    acceptanceIntentDenominators: countAcceptance(
      readyIntents.map(intentAxes),
    ),
    acceptanceBatchCounts: countAcceptance(
      batches.map((batch) => batch.acceptanceAxes),
    ),
    batches,
    readyIntentAccountingStatus: "COMPLETE_EXACTLY_ONCE",
    acceptanceAccounting:
      "INDEPENDENT_OVERLAPPING_AXES_NO_CROSS_PASS",
    equityTradableFactBatchCount: 0,
    listingCandidateEmissionAllowed: false,
    webSocketRuntimeProfileCount: 0,
    runtimeExecutionAllowed: false,
    factAuthorityGranted: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1RuntimeAdapterBatchPlanSchema.parse({
    ...core,
    batchPlanId: `runtime-batch-plan:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}
