import {
  createPublicJsonTransport,
  type PublicJsonTransport,
} from "../../universe/public-json-transport";
import type {
  M1MultiAssetIdentitySnapshot,
  M1OfficialUnderlyingMapping,
} from "../../multi-asset-universe/multi-asset-identity-contract";
import {
  runM1MultiAssetIdentityCaptureRuntime,
  type M1MultiAssetIdentityCaptureRuntimeResult,
} from "../../multi-asset-universe/multi-asset-catalog-capture-runtime";
import type {
  M1MultiAssetShadowUpstreamBinding,
} from "../../shadow/m1-multi-asset-shadow-contract";
import {
  M1_VENUE_SOURCE_IDS,
} from "../../source-capability/source-capability-contract";
import {
  M1_WIDE_MARKET_SOURCE_PROFILES,
  buildM1WideMarketVenueBatch,
  failedM1WideMarketComponent,
  parseM1WideMarketComponent,
  type M1WideMarketComponentResult,
  type M1WideMarketVenueBatch,
  type M1WideMarketVenueSourceId,
} from "./four-venue-wide-market-fact";
import {
  buildM1MultiAssetBaseFactSnapshot,
  type M1ListingWatchEvidenceBinding,
  type M1MultiAssetBaseFactSnapshot,
} from "../multi-asset-base-fact-contract";
import {
  deepFreezeArtifact,
} from "../../universe/stable-artifact";

export type M1ScopeV2ProviderTransport = PublicJsonTransport;

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

async function captureComponent(input: {
  transport: PublicJsonTransport;
  request: (
    typeof M1_WIDE_MARKET_SOURCE_PROFILES.sources
  )[M1WideMarketVenueSourceId]["requests"][number];
}): Promise<M1WideMarketComponentResult> {
  const response = await input.transport({
    allowedHost: input.request.allowedHost,
    url: input.request.url,
    timeoutMs: input.request.timeoutMs,
    maxResponseBytes: input.request.maxResponseBytes,
    captureBody: false,
  });
  if (!response.ok) {
    return failedM1WideMarketComponent({
      componentId: input.request.componentId,
      receivedAt: response.receivedAt,
      failure: response.failure,
    });
  }
  const responseHash = response.bodyDigest;
  const responseBytes = response.bodyBytes;
  if (
    typeof responseHash !== "string" ||
    !/^sha256:[0-9a-f]{64}$/u.test(responseHash) ||
    typeof responseBytes !== "number" ||
    !Number.isSafeInteger(responseBytes) ||
    responseBytes < 0
  ) {
    return failedM1WideMarketComponent({
      componentId: input.request.componentId,
      receivedAt: response.receivedAt,
      failure: {
        kind: "INVALID",
        reasonCode: "provider_response_digest_or_byte_count_missing",
      },
    });
  }
  if (containsUnsafeNativeInteger(response.data)) {
    return failedM1WideMarketComponent({
      componentId: input.request.componentId,
      receivedAt: response.receivedAt,
      failure: {
        kind: "INVALID",
        reasonCode: "provider_payload_contains_unsafe_native_integer",
      },
      responseHash,
      responseBytes,
    });
  }
  return parseM1WideMarketComponent({
    componentId: input.request.componentId,
    payload: response.data,
    receivedAt: response.receivedAt,
    responseHash,
    responseBytes,
  });
}

async function captureVenue(input: {
  sourceId: M1WideMarketVenueSourceId;
  transport: PublicJsonTransport;
}): Promise<M1WideMarketVenueBatch> {
  const profile = M1_WIDE_MARKET_SOURCE_PROFILES.sources[input.sourceId];
  const components = await Promise.all(
    profile.requests.map((request) =>
      captureComponent({
        transport: input.transport,
        request,
      })
    ),
  );
  return buildM1WideMarketVenueBatch({
    sourceId: input.sourceId,
    components,
  });
}

export async function captureM1WideMarketVenueBatches(
  transport: PublicJsonTransport,
): Promise<readonly M1WideMarketVenueBatch[]> {
  const batches = await Promise.all(
    M1_VENUE_SOURCE_IDS.map((sourceId) =>
      captureVenue({ sourceId, transport })
    ),
  );
  return deepFreezeArtifact(batches);
}

export async function runM1MultiAssetBaseFactRuntime(input: {
  releaseId: string;
  upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  identitySnapshot: M1MultiAssetIdentitySnapshot;
  listingWatchBindings?: readonly M1ListingWatchEvidenceBinding[];
  networkEnvironment: M1MultiAssetShadowUpstreamBinding["networkEnvironment"];
  transportImplementation?: PublicJsonTransport;
  now?: () => Date;
  maxAgeMs?: number;
  maxListingCheckpointAgeMs?: number;
}): Promise<M1MultiAssetBaseFactSnapshot> {
  const injectedTransport = input.transportImplementation !== undefined;
  const expectedEvidenceClass = injectedTransport
    ? "TEST_ONLY"
    : "LIVE_READ_ONLY";
  const expectedNetworkEnvironment = injectedTransport
    ? "TEST_HARNESS"
    : "TENCENT_ISOLATED_READ_ONLY";
  if (input.networkEnvironment !== expectedNetworkEnvironment) {
    throw new Error(
      injectedTransport
        ? "injected wide-market transport must remain TEST_HARNESS"
        : "native wide-market transport requires Tencent isolated read-only environment",
    );
  }
  if (
    input.upstreamBinding.evidenceClass !== expectedEvidenceClass ||
    input.upstreamBinding.networkEnvironment !== expectedNetworkEnvironment
  ) {
    throw new Error(
      "wide-market runtime transport and upstream evidence class must match",
    );
  }
  const transport = input.transportImplementation ??
    createPublicJsonTransport();
  const venueBatches = await captureM1WideMarketVenueBatches(transport);
  const sourceCutoffMs = Math.max(
    ...venueBatches.map((batch) => Date.parse(batch.latestReceivedAt)),
  );
  const completedAt = (input.now ?? (() => new Date()))();
  if (
    !Number.isFinite(sourceCutoffMs) ||
    !Number.isFinite(completedAt.getTime()) ||
    completedAt.getTime() < sourceCutoffMs
  ) {
    throw new Error(
      "wide-market runtime clock cannot precede completed source receipt",
    );
  }
  const sourceCutoff = new Date(sourceCutoffMs).toISOString();
  const normalizedAt = completedAt.toISOString();
  return buildM1MultiAssetBaseFactSnapshot({
    releaseId: input.releaseId,
    generatedAt: normalizedAt,
    sourceCutoff,
    normalizedAt,
    upstreamBinding: input.upstreamBinding,
    identitySnapshot: input.identitySnapshot,
    venueBatches,
    listingWatchBindings: input.listingWatchBindings,
    maxAgeMs: input.maxAgeMs,
    maxListingCheckpointAgeMs: input.maxListingCheckpointAgeMs,
  });
}

export type M1ScopeV2BaseMarketCaptureResult = Readonly<{
  identityCapture: M1MultiAssetIdentityCaptureRuntimeResult;
  baseFactSnapshot: M1MultiAssetBaseFactSnapshot;
  authorityGranted: false;
  productionChanged: false;
  secretMaterialPresent: false;
}>;

export async function runM1ScopeV2BaseMarketCaptureRuntime(input: {
  upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  networkEnvironment:
    M1MultiAssetShadowUpstreamBinding["networkEnvironment"];
  mappings?: readonly M1OfficialUnderlyingMapping[];
  previousIdentitySnapshot?: M1MultiAssetIdentitySnapshot | null;
  listingWatchBindings?: readonly M1ListingWatchEvidenceBinding[];
  transportImplementation?: PublicJsonTransport;
  now?: () => Date;
  maxAgeMs?: number;
  maxListingCheckpointAgeMs?: number;
}): Promise<M1ScopeV2BaseMarketCaptureResult> {
  const identityCapture = await runM1MultiAssetIdentityCaptureRuntime({
    upstreamBinding: input.upstreamBinding,
    networkEnvironment: input.networkEnvironment,
    mappings: input.mappings,
    previousIdentitySnapshot: input.previousIdentitySnapshot,
    transportImplementation: input.transportImplementation,
    now: input.now,
  });
  const baseFactSnapshot = await runM1MultiAssetBaseFactRuntime({
    releaseId: input.upstreamBinding.releaseId,
    upstreamBinding: input.upstreamBinding,
    identitySnapshot: identityCapture.identitySnapshot,
    listingWatchBindings: input.listingWatchBindings,
    networkEnvironment: input.networkEnvironment,
    transportImplementation: input.transportImplementation,
    now: input.now,
    maxAgeMs: input.maxAgeMs,
    maxListingCheckpointAgeMs: input.maxListingCheckpointAgeMs,
  });
  return deepFreezeArtifact({
    identityCapture,
    baseFactSnapshot,
    authorityGranted: false,
    productionChanged: false,
    secretMaterialPresent: false,
  });
}
