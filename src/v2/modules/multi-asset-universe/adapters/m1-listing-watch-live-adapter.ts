import {
  M1_LISTING_WATCH_BINDING_VERSION,
  buildM1ListingWatchEvidenceBinding,
  type M1ListingWatchEvidenceBinding,
} from "../../market-fact/multi-asset-base-fact-contract";
import {
  M1RuntimeAdapterProfileSetSchema,
  type M1RuntimeAdapterProfile,
  type M1RuntimeAdapterProfileSet,
} from "../../collector/runtime-adapter-profile";
import {
  M1ListingHistoryCheckpointSchema,
  advanceM1ListingHistory,
  buildM1ListingHistoryPageRequest,
  buildM1ListingHistoryRequest,
  parseM1ListingHistoryPage,
  type M1ListingHistoryAdvanceResult,
  type M1ListingHistoryCheckpoint,
  type M1ListingHistoryPage,
} from "../listing-history-runtime";
import {
  M1_SCOPE_EPOCH,
} from "../../source-capability/source-capability-contract";
import {
  createPublicJsonTransport,
  type PublicJsonTransport,
} from "../../universe/public-json-transport";
import {
  deepFreezeArtifact,
} from "../../universe/stable-artifact";
import {
  M1MultiAssetShadowUpstreamBindingSchema,
  type M1MultiAssetShadowUpstreamBinding,
} from "../../shadow/m1-multi-asset-shadow-contract";

type ListingSourceId = "BYBIT_DERIVATIVES" | "BITGET_FUTURES";

export type M1ListingWatchRefreshResult = Readonly<{
  sourceId: ListingSourceId;
  status: "COMMITTED" | "BLOCKED";
  requestCount: number;
  responseBytes: number;
  pages: readonly M1ListingHistoryPage[];
  advance: M1ListingHistoryAdvanceResult | null;
  checkpoint: M1ListingHistoryCheckpoint | null;
  binding: M1ListingWatchEvidenceBinding | null;
  reasonCodes: readonly string[];
  rawBodyRetained: false;
  secretMaterialPresent: false;
  authorityGranted: false;
  productionChanged: false;
}>;

export type M1ListingWatchRefreshBatch = Readonly<{
  results: readonly M1ListingWatchRefreshResult[];
  bindings: readonly M1ListingWatchEvidenceBinding[];
  checkpoints: readonly M1ListingHistoryCheckpoint[];
  allCommitted: boolean;
  requestCount: number;
  responseBytes: number;
  rawBodyRetained: false;
  secretMaterialPresent: false;
  authorityGranted: false;
  productionChanged: false;
}>;

function containsUnsafeNativeInteger(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isInteger(value) && !Number.isSafeInteger(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsUnsafeNativeInteger);
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .some(containsUnsafeNativeInteger);
  }
  return false;
}

function exactListingProfiles(
  profileSetInput: M1RuntimeAdapterProfileSet,
  upstream: M1MultiAssetShadowUpstreamBinding,
): readonly M1RuntimeAdapterProfile[] {
  const profileSet = M1RuntimeAdapterProfileSetSchema.parse(profileSetInput);
  const profiles = profileSet.profiles
    .filter(
      (profile) =>
        profile.capabilityId === "LISTING_ANNOUNCEMENT" &&
        (
          profile.sourceId === "BYBIT_DERIVATIVES" ||
          profile.sourceId === "BITGET_FUTURES"
        ),
    )
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  if (
    profileSet.runtimeReleaseId !== upstream.releaseId ||
    profileSet.contentHash !== upstream.profileSetHash ||
    profileSet.registryDigest !== upstream.registryDigest ||
    profileSet.conformanceArtifactId !== upstream.conformanceArtifactId ||
    profileSet.conformanceArtifactHash !== upstream.conformanceArtifactHash ||
    profiles.length !== 2 ||
    profiles[0]!.sourceId !== "BITGET_FUTURES" ||
    profiles[1]!.sourceId !== "BYBIT_DERIVATIVES" ||
    profiles.some(
      (profile) =>
        !profile.schedulerRouteEligible ||
        !profile.noAuthorityShadowEligible ||
        profile.credentialClass !== "PUBLIC_NO_CREDENTIAL",
    )
  ) {
    throw new Error(
      "listing watch profile set is not exact for the upstream release",
    );
  }
  return profiles;
}

function exactPriorCheckpoints(
  checkpointsInput: readonly M1ListingHistoryCheckpoint[],
  profiles: readonly M1RuntimeAdapterProfile[],
): ReadonlyMap<ListingSourceId, M1ListingHistoryCheckpoint> {
  const checkpoints = checkpointsInput
    .map((checkpoint) => M1ListingHistoryCheckpointSchema.parse(checkpoint))
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  if (
    checkpoints.length !== 2 ||
    checkpoints[0]!.sourceId !== "BITGET_FUTURES" ||
    checkpoints[1]!.sourceId !== "BYBIT_DERIVATIVES" ||
    checkpoints.some(
      (checkpoint) => checkpoint.status === "BOOTSTRAP_IN_PROGRESS",
    ) ||
    checkpoints.some((checkpoint) => {
      const profile = profiles.find(
        (candidate) => candidate.sourceId === checkpoint.sourceId,
      );
      return (
        profile === undefined ||
        checkpoint.releaseId !== profile.runtimeReleaseId ||
        checkpoint.profileId !== profile.profileId
      );
    })
  ) {
    throw new Error(
      "listing watch refresh requires exact complete prior checkpoints",
    );
  }
  return new Map(
    checkpoints.map((checkpoint) => [
      checkpoint.sourceId,
      checkpoint,
    ]),
  );
}

function blocked(input: {
  sourceId: ListingSourceId;
  requestCount: number;
  responseBytes: number;
  pages: readonly M1ListingHistoryPage[];
  advance?: M1ListingHistoryAdvanceResult;
  reasonCode: string;
}): M1ListingWatchRefreshResult {
  return deepFreezeArtifact({
    sourceId: input.sourceId,
    status: "BLOCKED",
    requestCount: input.requestCount,
    responseBytes: input.responseBytes,
    pages: input.pages,
    advance: input.advance ?? null,
    checkpoint: null,
    binding: null,
    reasonCodes: [input.reasonCode],
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
    productionChanged: false,
  });
}

async function refreshSource(input: {
  upstream: M1MultiAssetShadowUpstreamBinding;
  profile: M1RuntimeAdapterProfile;
  priorCheckpoint: M1ListingHistoryCheckpoint;
  transport: PublicJsonTransport;
  now: () => Date;
}): Promise<M1ListingWatchRefreshResult> {
  const sourceId = input.profile.sourceId as ListingSourceId;
  const pages: M1ListingHistoryPage[] = [];
  const priorIds = new Set(
    input.priorCheckpoint.observations.map(
      (observation) => observation.announcementId,
    ),
  );
  let requestCount = 0;
  let responseBytes = 0;
  let segmentStop:
    | "SOURCE_TERMINAL"
    | "SEGMENT_PAGE_LIMIT"
    | "PRIOR_CHECKPOINT_OVERLAP" = "SEGMENT_PAGE_LIMIT";

  for (
    let pageOrdinal = 1;
    pageOrdinal <= input.profile.maxRequestsPerSegment;
    pageOrdinal += 1
  ) {
    const request = pageOrdinal === 1
      ? buildM1ListingHistoryRequest({
        profile: input.profile,
        mode: "INCREMENTAL",
        checkpoint: input.priorCheckpoint,
      })
      : buildM1ListingHistoryPageRequest({
        profile: input.profile,
        requestToken: pages.at(-1)!.nextRequestToken!,
      });
    const response = await input.transport({
      url: request.url,
      allowedHost: request.allowedHost,
      timeoutMs: input.profile.requestTimeoutMs,
      maxResponseBytes: input.profile.maxResponseBytesPerPage,
      captureBody: false,
    });
    requestCount += 1;
    if (!response.ok) {
      return blocked({
        sourceId,
        requestCount,
        responseBytes,
        pages,
        reasonCode: response.failure.reasonCode,
      });
    }
    if (
      response.bodyBytes === undefined ||
      response.bodyDigest === undefined ||
      containsUnsafeNativeInteger(response.data)
    ) {
      return blocked({
        sourceId,
        requestCount,
        responseBytes,
        pages,
        reasonCode:
          "listing_response_identity_or_native_integer_invalid",
      });
    }
    responseBytes += response.bodyBytes;
    let page: M1ListingHistoryPage;
    try {
      page = parseM1ListingHistoryPage({
        profile: input.profile,
        mode: "INCREMENTAL",
        pageOrdinal,
        requestToken: request.requestToken,
        receivedAt: response.receivedAt,
        responseBodyHash: response.bodyDigest,
        payload: response.data,
      });
    } catch {
      return blocked({
        sourceId,
        requestCount,
        responseBytes,
        pages,
        reasonCode: "listing_page_schema_or_normalization_failed",
      });
    }
    pages.push(page);
    const overlap = page.observations.some((observation) =>
      priorIds.has(observation.announcementId)
    );
    if (overlap) {
      segmentStop = "PRIOR_CHECKPOINT_OVERLAP";
      break;
    }
    if (page.providerTerminal) {
      segmentStop = "SOURCE_TERMINAL";
      break;
    }
  }

  const sourceCutoff = pages.at(-1)!.receivedAt;
  const generatedAt = input.now();
  if (
    !Number.isFinite(generatedAt.getTime()) ||
    generatedAt.getTime() < Date.parse(sourceCutoff)
  ) {
    return blocked({
      sourceId,
      requestCount,
      responseBytes,
      pages,
      reasonCode: "listing_refresh_clock_precedes_source_receipt",
    });
  }
  const advance = advanceM1ListingHistory({
    profile: input.profile,
    mode: "INCREMENTAL",
    priorCheckpoint: input.priorCheckpoint,
    pages,
    segmentStop,
    generatedAt: generatedAt.toISOString(),
    sourceCutoff,
  });
  if (advance.status !== "COMMITTED") {
    return blocked({
      sourceId,
      requestCount,
      responseBytes,
      pages,
      advance,
      reasonCode:
        `listing_checkpoint_gap_${advance.gap.reason.toLowerCase()}`,
    });
  }
  const checkpoint = advance.checkpoint;
  const binding = buildM1ListingWatchEvidenceBinding({
    schemaVersion: M1_LISTING_WATCH_BINDING_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: input.upstream.releaseId,
    upstreamBindingId: input.upstream.upstreamBindingId,
    upstreamBindingHash: input.upstream.contentHash,
    sourceId,
    evidenceId: checkpoint.checkpointId,
    evidenceHash: checkpoint.contentHash,
    sourceCutoff: checkpoint.sourceCutoff,
    status: "COMMITTED_NO_GAP",
    checkpointGapCount: 0,
    evidenceClass: input.upstream.evidenceClass,
    networkEnvironment: input.upstream.networkEnvironment,
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
  });
  return deepFreezeArtifact({
    sourceId,
    status: "COMMITTED",
    requestCount,
    responseBytes,
    pages,
    advance,
    checkpoint,
    binding,
    reasonCodes: [],
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
    productionChanged: false,
  });
}

export async function refreshM1ListingWatchEvidence(input: {
  upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  profileSet: M1RuntimeAdapterProfileSet;
  priorCheckpoints: readonly M1ListingHistoryCheckpoint[];
  networkEnvironment:
    M1MultiAssetShadowUpstreamBinding["networkEnvironment"];
  transportImplementation?: PublicJsonTransport;
  now?: () => Date;
}): Promise<M1ListingWatchRefreshBatch> {
  const upstream = M1MultiAssetShadowUpstreamBindingSchema.parse(
    input.upstreamBinding,
  );
  const injected = input.transportImplementation !== undefined;
  const expectedEvidenceClass = injected ? "TEST_ONLY" : "LIVE_READ_ONLY";
  const expectedEnvironment = injected
    ? "TEST_HARNESS"
    : "TENCENT_ISOLATED_READ_ONLY";
  if (
    upstream.evidenceClass !== expectedEvidenceClass ||
    upstream.networkEnvironment !== expectedEnvironment ||
    input.networkEnvironment !== expectedEnvironment
  ) {
    throw new Error(
      "listing watch transport cannot mix test and live evidence",
    );
  }
  const profiles = exactListingProfiles(input.profileSet, upstream);
  const prior = exactPriorCheckpoints(input.priorCheckpoints, profiles);
  const transport = input.transportImplementation ??
    createPublicJsonTransport();
  const now = input.now ?? (() => new Date());
  const results = await Promise.all(
    profiles.map((profile) =>
      refreshSource({
        upstream,
        profile,
        priorCheckpoint: prior.get(profile.sourceId as ListingSourceId)!,
        transport,
        now,
      })
    ),
  );
  const bindings = results.flatMap((result) =>
    result.binding === null ? [] : [result.binding]
  );
  const checkpoints = results.flatMap((result) =>
    result.checkpoint === null ? [] : [result.checkpoint]
  );
  return deepFreezeArtifact({
    results,
    bindings,
    checkpoints,
    allCommitted: results.every((result) => result.status === "COMMITTED"),
    requestCount: results.reduce(
      (total, result) => total + result.requestCount,
      0,
    ),
    responseBytes: results.reduce(
      (total, result) => total + result.responseBytes,
      0,
    ),
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
    productionChanged: false,
  });
}
