import { z } from "zod";
import {
  createPublicJsonTransport,
  type PublicJsonResult,
  type PublicJsonTransport,
} from "../../universe/public-json-transport";
import {
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
} from "../../source-capability/adapters/four-venue-capability-registry";
import {
  M1MultiAssetShadowUpstreamBindingSchema,
  type M1MultiAssetShadowUpstreamBinding,
} from "../../shadow/m1-multi-asset-shadow-contract";
import {
  normalizeBinanceMultiAssetCatalog,
  normalizeBitgetMultiAssetCatalog,
  normalizeBybitMultiAssetCatalog,
  normalizeOkxMultiAssetCatalog,
  type M1CatalogNormalizationResult,
} from "./four-venue-multi-asset-catalog";
import {
  M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE,
  M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE_DIGEST,
  buildM1MultiAssetCatalogCaptureBinding,
  buildM1MultiAssetCatalogVenueCapture,
  buildM1MultiAssetIdentitySnapshot,
  type M1MultiAssetCatalogCaptureBinding,
  type M1MultiAssetCatalogRequestOutcome,
  type M1MultiAssetIdentitySnapshot,
  type M1OfficialUnderlyingMapping,
} from "../multi-asset-identity-contract";
import {
  M1_VENUE_SOURCE_IDS,
} from "../../source-capability/source-capability-contract";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../../universe/stable-artifact";

type VenueSourceId = (typeof M1_VENUE_SOURCE_IDS)[number];

export const M1_MULTI_ASSET_CATALOG_TRANSPORT_PROFILE =
  deepFreezeArtifact({
    schemaVersion: "v2-m1-multi-asset-catalog-transport-profile.v1",
    contractProfileDigest:
      M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE_DIGEST,
    sources: {
      BINANCE_FUTURES: {
        profileId: "m1-catalog:binance-futures:exchange-info",
        allowedHost: "fapi.binance.com",
        initialUrl: "https://fapi.binance.com/fapi/v1/exchangeInfo",
      },
      OKX_SWAP: {
        profileId: "m1-catalog:okx-swap:public-instruments",
        allowedHost: "www.okx.com",
        initialUrl:
          "https://www.okx.com/api/v5/public/instruments?instType=SWAP",
      },
      BYBIT_DERIVATIVES: {
        profileId: "m1-catalog:bybit-derivatives:linear-instruments",
        allowedHost: "api.bybit.com",
        initialUrl:
          "https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000",
      },
      BITGET_FUTURES: {
        profileId: "m1-catalog:bitget-futures:usdt-contracts",
        allowedHost: "api.bitget.com",
        initialUrl:
          "https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES",
      },
    },
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
  } as const);

export const M1_MULTI_ASSET_CATALOG_TRANSPORT_PROFILE_DIGEST =
  stableContentHash(M1_MULTI_ASSET_CATALOG_TRANSPORT_PROFILE);

const BybitPageEnvelopeSchema = z.object({
  retCode: z.number().int(),
  result: z.object({
    category: z.string(),
    list: z.array(z.unknown()),
    nextPageCursor: z.string().optional(),
  }).passthrough(),
}).passthrough();

export type M1MultiAssetIdentityCaptureRuntimeResult = Readonly<{
  captureBinding: M1MultiAssetCatalogCaptureBinding;
  identitySnapshot: M1MultiAssetIdentitySnapshot;
  normalizationResults: readonly M1CatalogNormalizationResult[];
  authorityGranted: false;
  productionChanged: false;
  secretMaterialPresent: false;
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

function requestUrlHash(url: string): string {
  return stableContentHash({
    method: "GET",
    url,
  });
}

function catalogCaptureProfile(sourceId: VenueSourceId) {
  const contract =
    M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE.sources[sourceId];
  const transport =
    M1_MULTI_ASSET_CATALOG_TRANSPORT_PROFILE.sources[sourceId];
  if (
    contract.profileId !== transport.profileId ||
    contract.initialRequestUrlHash !== requestUrlHash(transport.initialUrl)
  ) {
    throw new Error(
      "catalog transport route does not match the source-bound contract",
    );
  }
  return {
    ...contract,
    ...transport,
  };
}

function failureOutcome(input: {
  pageIndex: number;
  url: string;
  response: Extract<PublicJsonResult, { ok: false }>;
}): M1MultiAssetCatalogRequestOutcome {
  return {
    outcome: "FAILED",
    pageIndex: input.pageIndex,
    requestUrlHash: requestUrlHash(input.url),
    receivedAt: input.response.receivedAt,
    httpStatus: input.response.status,
    providerFailureKind: input.response.failure.kind,
    reasonCode: input.response.failure.reasonCode,
    rawBodyRetained: false,
    secretMaterialPresent: false,
  };
}

function invalidSuccessOutcome(input: {
  pageIndex: number;
  url: string;
  response: Extract<PublicJsonResult, { ok: true }>;
  reasonCode: string;
}): M1MultiAssetCatalogRequestOutcome {
  return {
    outcome: "FAILED",
    pageIndex: input.pageIndex,
    requestUrlHash: requestUrlHash(input.url),
    receivedAt: input.response.receivedAt,
    httpStatus: input.response.status,
    providerFailureKind: "INVALID",
    reasonCode: input.reasonCode,
    rawBodyRetained: false,
    secretMaterialPresent: false,
  };
}

function validResponseIdentity(
  response: Extract<PublicJsonResult, { ok: true }>,
): response is Extract<PublicJsonResult, { ok: true }> & {
  bodyBytes: number;
  bodyDigest: string;
} {
  return (
    typeof response.bodyBytes === "number" &&
    Number.isSafeInteger(response.bodyBytes) &&
    response.bodyBytes >= 0 &&
    typeof response.bodyDigest === "string" &&
    /^sha256:[0-9a-f]{64}$/u.test(response.bodyDigest)
  );
}

async function requestPage(input: {
  sourceId: VenueSourceId;
  pageIndex: number;
  url: string;
  transport: PublicJsonTransport;
}): Promise<PublicJsonResult> {
  const profile = catalogCaptureProfile(input.sourceId);
  return input.transport({
    allowedHost: profile.allowedHost,
    url: input.url,
    timeoutMs: profile.timeoutMs,
    maxResponseBytes: profile.maxResponseBytes,
    captureBody: false,
  });
}

function emptyNormalization(
  sourceId: VenueSourceId,
  receivedAt: string,
  reasonCodes: readonly string[],
): M1CatalogNormalizationResult {
  return deepFreezeArtifact({
    sourceId,
    receivedAt,
    rawRecordCount: 0,
    observations: [],
    status: "FAIL",
    reasonCodes: [...new Set(reasonCodes)].sort(),
    authorityBoundary:
      "NORMALIZATION_ONLY_NO_ELIGIBLE_FACT_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY",
  });
}

function degradedNormalization(
  result: M1CatalogNormalizationResult,
  reasonCodes: readonly string[],
): M1CatalogNormalizationResult {
  const reasons = [...new Set([
    ...result.reasonCodes,
    ...reasonCodes,
  ])].sort();
  return deepFreezeArtifact({
    ...result,
    status: result.observations.length === 0 ? "FAIL" : "PARTIAL",
    reasonCodes: reasons,
  });
}

function normalizeSingleVenue(input: {
  sourceId: Exclude<VenueSourceId, "BYBIT_DERIVATIVES">;
  payload: unknown;
  receivedAt: string;
  mappings: readonly M1OfficialUnderlyingMapping[];
}): M1CatalogNormalizationResult {
  if (input.sourceId === "BINANCE_FUTURES") {
    return normalizeBinanceMultiAssetCatalog(input);
  }
  if (input.sourceId === "OKX_SWAP") {
    return normalizeOkxMultiAssetCatalog(input);
  }
  return normalizeBitgetMultiAssetCatalog(input);
}

async function captureSingleVenue(input: {
  sourceId: Exclude<VenueSourceId, "BYBIT_DERIVATIVES">;
  transport: PublicJsonTransport;
  mappings: readonly M1OfficialUnderlyingMapping[];
}): Promise<Readonly<{
  normalization: M1CatalogNormalizationResult;
  outcomes: readonly M1MultiAssetCatalogRequestOutcome[];
}>> {
  const profile = catalogCaptureProfile(input.sourceId);
  const response = await requestPage({
    sourceId: input.sourceId,
    pageIndex: 1,
    url: profile.initialUrl,
    transport: input.transport,
  });
  if (!response.ok) {
    return {
      normalization: emptyNormalization(
        input.sourceId,
        response.receivedAt,
        [response.failure.reasonCode],
      ),
      outcomes: [failureOutcome({
        pageIndex: 1,
        url: profile.initialUrl,
        response,
      })],
    };
  }
  if (!validResponseIdentity(response)) {
    const reason = "provider_response_digest_or_byte_count_missing";
    return {
      normalization: emptyNormalization(
        input.sourceId,
        response.receivedAt,
        [reason],
      ),
      outcomes: [invalidSuccessOutcome({
        pageIndex: 1,
        url: profile.initialUrl,
        response,
        reasonCode: reason,
      })],
    };
  }
  if (containsUnsafeNativeInteger(response.data)) {
    const reason = "provider_payload_contains_unsafe_native_integer";
    return {
      normalization: emptyNormalization(
        input.sourceId,
        response.receivedAt,
        [reason],
      ),
      outcomes: [invalidSuccessOutcome({
        pageIndex: 1,
        url: profile.initialUrl,
        response,
        reasonCode: reason,
      })],
    };
  }
  const normalization = normalizeSingleVenue({
    sourceId: input.sourceId,
    payload: response.data,
    receivedAt: response.receivedAt,
    mappings: input.mappings,
  });
  return {
    normalization,
    outcomes: [{
      outcome: "SUCCESS",
      pageIndex: 1,
      requestUrlHash: requestUrlHash(profile.initialUrl),
      receivedAt: response.receivedAt,
      httpStatus: response.status,
      responseBytes: response.bodyBytes,
      responseHash: response.bodyDigest,
      recordCount: normalization.rawRecordCount,
      nextPageAvailable: false,
      rawBodyRetained: false,
      secretMaterialPresent: false,
    }],
  };
}

function nextBybitUrl(cursor: string): string {
  const url = new URL(
    catalogCaptureProfile("BYBIT_DERIVATIVES").initialUrl,
  );
  url.searchParams.set("cursor", cursor);
  return url.toString();
}

async function captureBybit(input: {
  transport: PublicJsonTransport;
  mappings: readonly M1OfficialUnderlyingMapping[];
}): Promise<Readonly<{
  normalization: M1CatalogNormalizationResult;
  outcomes: readonly M1MultiAssetCatalogRequestOutcome[];
}>> {
  const sourceId = "BYBIT_DERIVATIVES" as const;
  const profile = catalogCaptureProfile(sourceId);
  const outcomes: M1MultiAssetCatalogRequestOutcome[] = [];
  const records: unknown[] = [];
  const seenCursors = new Set<string>();
  const failureReasons: string[] = [];
  let url: string = profile.initialUrl;
  let latestReceivedAt = new Date(0).toISOString();

  for (let pageIndex = 1; pageIndex <= profile.maxPages; pageIndex += 1) {
    const response = await requestPage({
      sourceId,
      pageIndex,
      url,
      transport: input.transport,
    });
    latestReceivedAt = response.receivedAt;
    if (!response.ok) {
      outcomes.push(failureOutcome({ pageIndex, url, response }));
      failureReasons.push(response.failure.reasonCode);
      break;
    }
    if (!validResponseIdentity(response)) {
      const reason = "provider_response_digest_or_byte_count_missing";
      outcomes.push(invalidSuccessOutcome({
        pageIndex,
        url,
        response,
        reasonCode: reason,
      }));
      failureReasons.push(reason);
      break;
    }
    if (containsUnsafeNativeInteger(response.data)) {
      const reason = "provider_payload_contains_unsafe_native_integer";
      outcomes.push(invalidSuccessOutcome({
        pageIndex,
        url,
        response,
        reasonCode: reason,
      }));
      failureReasons.push(reason);
      break;
    }
    const parsed = BybitPageEnvelopeSchema.safeParse(response.data);
    if (
      !parsed.success ||
      parsed.data.retCode !== 0 ||
      parsed.data.result.category !== "linear"
    ) {
      const reason = parsed.success
        ? "bybit_catalog_provider_body_error"
        : "bybit_catalog_page_schema_invalid";
      outcomes.push(invalidSuccessOutcome({
        pageIndex,
        url,
        response,
        reasonCode: reason,
      }));
      failureReasons.push(reason);
      break;
    }
    const nextCursor = parsed.data.result.nextPageCursor?.trim() ?? "";
    const nextPageAvailable = nextCursor.length > 0;
    outcomes.push({
      outcome: "SUCCESS",
      pageIndex,
      requestUrlHash: requestUrlHash(url),
      receivedAt: response.receivedAt,
      httpStatus: response.status,
      responseBytes: response.bodyBytes,
      responseHash: response.bodyDigest,
      recordCount: parsed.data.result.list.length,
      nextPageAvailable,
      rawBodyRetained: false,
      secretMaterialPresent: false,
    });
    records.push(...parsed.data.result.list);
    if (!nextPageAvailable) {
      break;
    }
    if (seenCursors.has(nextCursor)) {
      failureReasons.push("bybit_catalog_cursor_repeated");
      break;
    }
    seenCursors.add(nextCursor);
    if (pageIndex === profile.maxPages) {
      failureReasons.push(
        "bybit_catalog_pagination_not_terminated_within_bound",
      );
      break;
    }
    url = nextBybitUrl(nextCursor);
  }

  if (outcomes.length === 0) {
    throw new Error("Bybit catalog runtime produced no request outcome");
  }
  let normalization = normalizeBybitMultiAssetCatalog({
    payload: {
      retCode: 0,
      result: {
        category: "linear",
        list: records,
        nextPageCursor: "",
      },
    },
    receivedAt: latestReceivedAt,
    mappings: input.mappings,
  });
  const lastOutcome = outcomes.at(-1)!;
  if (
    failureReasons.length > 0 ||
    lastOutcome.outcome !== "SUCCESS" ||
    (
      lastOutcome.outcome === "SUCCESS" &&
      lastOutcome.nextPageAvailable
    )
  ) {
    normalization = degradedNormalization(
      normalization,
      failureReasons.length > 0
        ? failureReasons
        : ["bybit_catalog_pagination_incomplete"],
    );
  }
  return {
    normalization,
    outcomes,
  };
}

function selectTransport(input: {
  upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  networkEnvironment:
    M1MultiAssetShadowUpstreamBinding["networkEnvironment"];
  transportImplementation?: PublicJsonTransport;
}): PublicJsonTransport {
  const injected = input.transportImplementation !== undefined;
  const expectedEvidenceClass = injected ? "TEST_ONLY" : "LIVE_READ_ONLY";
  const expectedEnvironment = injected
    ? "TEST_HARNESS"
    : "TENCENT_ISOLATED_READ_ONLY";
  if (input.networkEnvironment !== expectedEnvironment) {
    throw new Error(
      injected
        ? "injected catalog transport must remain TEST_HARNESS"
        : "native catalog transport requires Tencent isolated read-only environment",
    );
  }
  if (
    input.upstreamBinding.evidenceClass !== expectedEvidenceClass ||
    input.upstreamBinding.networkEnvironment !== expectedEnvironment
  ) {
    throw new Error(
      "catalog runtime transport and upstream evidence class must match",
    );
  }
  return input.transportImplementation ?? createPublicJsonTransport();
}

export async function runM1MultiAssetIdentityCaptureRuntime(input: {
  upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  networkEnvironment:
    M1MultiAssetShadowUpstreamBinding["networkEnvironment"];
  mappings?: readonly M1OfficialUnderlyingMapping[];
  previousIdentitySnapshot?: M1MultiAssetIdentitySnapshot | null;
  transportImplementation?: PublicJsonTransport;
  now?: () => Date;
}): Promise<M1MultiAssetIdentityCaptureRuntimeResult> {
  const upstream = M1MultiAssetShadowUpstreamBindingSchema.parse(
    input.upstreamBinding,
  );
  if (
    upstream.registryDigest !==
      M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest
  ) {
    throw new Error(
      "catalog runtime upstream registry does not match current registry",
    );
  }
  const transport = selectTransport({
    upstreamBinding: upstream,
    networkEnvironment: input.networkEnvironment,
    transportImplementation: input.transportImplementation,
  });
  const mappings = input.mappings ?? [];
  const [binance, okx, bybit, bitget] = await Promise.all([
    captureSingleVenue({
      sourceId: "BINANCE_FUTURES",
      transport,
      mappings,
    }),
    captureSingleVenue({
      sourceId: "OKX_SWAP",
      transport,
      mappings,
    }),
    captureBybit({ transport, mappings }),
    captureSingleVenue({
      sourceId: "BITGET_FUTURES",
      transport,
      mappings,
    }),
  ]);
  const captured = [binance, okx, bybit, bitget] as const;
  const normalizationResults = captured.map(
    (result) => result.normalization,
  );
  const venueCaptures = normalizationResults.map(
    (normalization, index) =>
      buildM1MultiAssetCatalogVenueCapture({
        releaseId: upstream.releaseId,
        registryDigest: upstream.registryDigest,
        upstreamBindingId: upstream.upstreamBindingId,
        upstreamBindingHash: upstream.contentHash,
        evidenceClass: upstream.evidenceClass,
        networkEnvironment: upstream.networkEnvironment,
        sourceId: normalization.sourceId,
        requestOutcomes: captured[index]!.outcomes,
        rawRecordCount: normalization.rawRecordCount,
        observations: normalization.observations,
        normalizationStatus: normalization.status,
        reasonCodes: normalization.reasonCodes,
      }),
  );
  const latestReceiptMs = Math.max(
    ...venueCaptures.map(
      (capture) => Date.parse(capture.latestReceivedAt),
    ),
  );
  const generatedAt = (input.now ?? (() => new Date()))();
  if (
    !Number.isFinite(generatedAt.getTime()) ||
    generatedAt.getTime() < latestReceiptMs
  ) {
    throw new Error(
      "catalog runtime clock cannot precede provider receipt cutoff",
    );
  }
  const generatedAtIso = generatedAt.toISOString();
  const captureBinding = buildM1MultiAssetCatalogCaptureBinding({
    releaseId: upstream.releaseId,
    generatedAt: generatedAtIso,
    registryDigest: upstream.registryDigest,
    upstreamBindingId: upstream.upstreamBindingId,
    upstreamBindingHash: upstream.contentHash,
    evidenceClass: upstream.evidenceClass,
    networkEnvironment: upstream.networkEnvironment,
    venueCaptures,
  });
  const observations = normalizationResults.flatMap(
    (result) => result.observations,
  );
  const identitySnapshot = buildM1MultiAssetIdentitySnapshot({
    releaseId: upstream.releaseId,
    generatedAt: generatedAtIso,
    sourceCutoff: captureBinding.sourceCutoff,
    registryDigest: upstream.registryDigest,
    catalogCaptureBinding: captureBinding,
    observations,
    previous: input.previousIdentitySnapshot,
  });
  return deepFreezeArtifact({
    captureBinding,
    identitySnapshot,
    normalizationResults,
    authorityGranted: false,
    productionChanged: false,
    secretMaterialPresent: false,
  });
}
