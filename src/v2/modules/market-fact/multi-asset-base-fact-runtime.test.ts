import assert from "node:assert/strict";
import test from "node:test";
import type {
  PublicJsonRequest,
  PublicJsonTransport,
} from "../universe/public-json-transport";
import {
  m1WideMarketProfileFor,
} from "./adapters/four-venue-wide-market-fact";
import {
  captureM1WideMarketVenueBatches,
  runM1MultiAssetBaseFactRuntime,
  runM1ScopeV2BaseMarketCaptureRuntime,
} from "./multi-asset-base-fact-runtime";
import {
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
  type M1SourceId,
} from "../source-capability/source-capability-contract";
import {
  buildM1MultiAssetCatalogCaptureBinding,
  buildM1MultiAssetCatalogVenueCapture,
  buildM1MultiAssetIdentitySnapshot,
  createM1MultiAssetObservation,
  deriveM1CanonicalInstrumentId,
  deriveM1IdentityEpoch,
  deriveM1ListingEpoch,
  M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE,
} from "../multi-asset-universe/multi-asset-identity-contract";
import { stableContentHash } from "../universe/stable-artifact";
import {
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
} from "../source-capability/adapters/four-venue-capability-registry";
import {
  M1_MULTI_ASSET_SHADOW_AXIS_IDS,
  M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
  M1MultiAssetShadowUpstreamBindingSchema,
} from "../shadow/m1-multi-asset-shadow-contract";

const EVENT_MS = Date.parse("2026-07-27T00:00:00.000Z");
const RECEIVED_AT = "2026-07-27T00:00:01.000Z";
const RELEASE = "e".repeat(40);

function upstreamBinding(
  evidenceClass: "LIVE_READ_ONLY" | "TEST_ONLY" = "TEST_ONLY",
) {
  const live = evidenceClass === "LIVE_READ_ONLY";
  const core = {
    schemaVersion: M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: RELEASE,
    generatedAt: "2026-07-26T23:59:59.000Z",
    sourceCutoff: "2026-07-26T23:59:59.000Z",
    runtimeAdapterArtifactId: "runtime-adapter-live:base-fact-runtime-fixture",
    runtimeAdapterArtifactHash:
      "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    conformanceArtifactId: "source-conformance:base-fact-runtime-fixture",
    conformanceArtifactHash:
      "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    registryDigest:
      M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest,
    profileSetHash:
      "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    evidenceClass,
    networkEnvironment: live
      ? "TENCENT_ISOLATED_READ_ONLY" as const
      : "TEST_HARNESS" as const,
    runtimeAdapterStatus: live
      ? "PASS_BOUNDED_ROUTE_SEGMENT_NO_AUTHORITY" as const
      : "TEST_ONLY_NOT_LIVE_EVIDENCE" as const,
    liveConformantProfileCount: 15 as const,
    routeEligibleProfileCount: 14 as const,
    registryBlockedProfileCount: 1 as const,
    listingCheckpointCommittedCount: 2 as const,
    listingGapCount: 0 as const,
    acceptanceAxes: M1_MULTI_ASSET_SHADOW_AXIS_IDS.map(
      (axisId, index) => ({
        axisId,
        routeGateStatus: "PASS" as const,
        axisEvidenceId: `axis:${axisId}`,
        contentHash: `sha256:${String(index + 4).repeat(64)}`,
      }),
    ),
    authorityGranted: false as const,
    productionChanged: false as const,
    secretMaterialPresent: false as const,
  };
  const contentHash = stableContentHash(core);
  return M1MultiAssetShadowUpstreamBindingSchema.parse({
    ...core,
    upstreamBindingId: `m1-shadow-upstream:${contentHash.slice(7, 31)}`,
    contentHash,
  });
}

function payloadFor(url: string): unknown {
  if (url.endsWith("/fapi/v1/exchangeInfo")) {
    return {
      symbols: [{
        symbol: "BTCUSDT",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        marginAsset: "USDT",
        contractType: "PERPETUAL",
        status: "TRADING",
        onboardDate: Date.parse("2026-07-26T00:00:00.000Z"),
        deliveryDate: 0,
        underlyingType: "COIN",
        filters: [
          { filterType: "PRICE_FILTER", tickSize: "0.01" },
          { filterType: "LOT_SIZE", stepSize: "0.001" },
        ],
      }],
    };
  }
  if (url.includes("/api/v5/public/instruments")) {
    return {
      code: "0",
      data: [{
        instId: "BTC-USDT-SWAP",
        instType: "SWAP",
        ctType: "linear",
        ctVal: "1",
        ctValCcy: "BTC",
        quoteCcy: "USDT",
        settleCcy: "USDT",
        state: "live",
        instCategory: "1",
        uly: "BTC-USDT",
        listTime: String(Date.parse("2026-07-26T00:00:00.000Z")),
        expTime: "",
        tickSz: "0.01",
        lotSz: "0.001",
      }],
    };
  }
  if (url.includes("/v5/market/instruments-info")) {
    return {
      retCode: 0,
      result: {
        category: "linear",
        list: [{
          symbol: "BTCUSDT",
          contractType: "LinearPerpetual",
          status: "Trading",
          baseCoin: "BTC",
          quoteCoin: "USDT",
          settleCoin: "USDT",
          launchTime: String(Date.parse("2026-07-26T00:00:00.000Z")),
          deliveryTime: "0",
          symbolType: "",
          isPreListing: false,
          priceFilter: { tickSize: "0.01" },
          lotSizeFilter: { qtyStep: "0.001" },
        }],
        nextPageCursor: "",
      },
    };
  }
  if (url.includes("/api/v2/mix/market/contracts")) {
    return {
      code: "00000",
      data: [{
        symbol: "BTCUSDT",
        baseCoin: "BTC",
        quoteCoin: "USDT",
        supportMarginCoins: ["USDT"],
        symbolType: "perpetual",
        symbolStatus: "normal",
        launchTime: String(Date.parse("2026-07-26T00:00:00.000Z")),
        offTime: "-1",
        maintainTime: "",
        sizeMultiplier: "0.001",
        pricePlace: "2",
        priceEndStep: "1",
        isRwa: "NO",
      }],
    };
  }
  if (url.endsWith("/fapi/v1/premiumIndex")) {
    return [{
      symbol: "BTCUSDT",
      markPrice: "100",
      indexPrice: "99",
      lastFundingRate: "0.0001",
      time: EVENT_MS,
    }];
  }
  if (url.endsWith("/fapi/v1/ticker/24hr")) {
    return [{
      symbol: "BTCUSDT",
      lastPrice: "101",
      bidPrice: "100",
      askPrice: "102",
      volume: "1000",
      quoteVolume: "100000",
      closeTime: EVENT_MS,
    }];
  }
  if (url.includes("/api/v5/market/tickers")) {
    return {
      code: "0",
      data: [{
        instId: "BTC-USDT-SWAP",
        last: "101",
        bidPx: "100",
        askPx: "102",
        volCcy24h: "1000",
        ts: String(EVENT_MS),
      }],
    };
  }
  if (url.includes("/api/v5/public/mark-price")) {
    return {
      code: "0",
      data: [{
        instId: "BTC-USDT-SWAP",
        markPx: "100",
        ts: String(EVENT_MS),
      }],
    };
  }
  if (url.includes("api.bybit.com")) {
    return {
      retCode: 0,
      time: EVENT_MS,
      result: {
        category: "linear",
        list: [{
          symbol: "BTCUSDT",
          lastPrice: "101",
          markPrice: "100",
          indexPrice: "99",
          bid1Price: "100",
          ask1Price: "102",
          fundingRate: "0.0001",
          openInterest: "10000",
          volume24h: "1000",
          turnover24h: "100000",
        }],
      },
    };
  }
  return {
    code: "00000",
    requestTime: EVENT_MS,
    data: [{
      symbol: "BTCUSDT",
      lastPr: "101",
      markPrice: "100",
      indexPrice: "99",
      bidPr: "100",
      askPr: "102",
      fundingRate: "0.0001",
      holdingAmount: "10000",
      baseVolume: "1000",
      quoteVolume: "100000",
      ts: String(EVENT_MS),
    }],
  };
}

function transport(
  requests: PublicJsonRequest[],
  override?: (request: PublicJsonRequest) => unknown,
): PublicJsonTransport {
  return async (request) => {
    requests.push(request);
    const data = override?.(request) ?? payloadFor(request.url);
    return {
      ok: true,
      status: 200,
      receivedAt: RECEIVED_AT,
      bodyBytes: Buffer.byteLength(JSON.stringify(data)),
      bodyDigest: stableContentHash(data),
      data,
    };
  };
}

function identity(
  sourceId: Exclude<M1SourceId, "COINGLASS_V4">,
  venueInstrumentId: string,
) {
  const listingEpoch = deriveM1ListingEpoch({
    sourceId,
    venueInstrumentId,
    providerListTime: "2026-07-26T00:00:00.000Z",
    firstObservedAt: "2026-07-26T00:00:00.000Z",
  });
  const identityEpoch = deriveM1IdentityEpoch({
    sourceId,
    venueInstrumentId,
    listingEpoch,
    assetDomain: "CRYPTO_LINEAR_PERPETUAL",
    underlyingReferenceId: "BTC",
  });
  return createM1MultiAssetObservation({
    coverageClass: "SUPPORTED_DERIVATIVE",
    assetDomain: "CRYPTO_LINEAR_PERPETUAL",
    sourceId,
    venueInstrumentId,
    canonicalInstrumentId: deriveM1CanonicalInstrumentId({
      sourceId,
      venueInstrumentId,
      identityEpoch,
    }),
    underlyingGroupId:
      `${M1_SCOPE_EPOCH}:CRYPTO_LINEAR_PERPETUAL:BTC:USDT`,
    underlyingReferenceId: "BTC",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    settlementAsset: "USDT",
    contractMechanism: "LINEAR_PERPETUAL",
    contractMultiplier: "1",
    priceTick: "0.01",
    quantityStep: "0.001",
    listingEpoch,
    identityEpoch,
    identityStatus: "EXACT",
    classificationAuthority: "PROVIDER_EXPLICIT_CATEGORY",
    classificationEvidenceIds: [],
    providerStatus: "TRADING",
    lifecycleState: "ESTABLISHED",
    providerListTime: "2026-07-26T00:00:00.000Z",
    providerDelistTime: null,
    firstObservedAt: "2026-07-26T00:00:00.000Z",
    statusEffectiveAt: "2026-07-26T00:00:00.000Z",
    knowledgeTime: "2026-07-26T23:59:59.000Z",
    jurisdictionAvailability: "UNVERIFIED",
    sourceCapability: "DERIVATIVE_INSTRUMENT_CATALOG",
    sourceRecordDigest: stableContentHash({ sourceId, venueInstrumentId }),
    reasonCodes: [],
  });
}

function identitySnapshot(
  evidenceClass: "LIVE_READ_ONLY" | "TEST_ONLY" = "TEST_ONLY",
) {
  const observations = [
    identity("BINANCE_FUTURES", "BTCUSDT"),
    identity("OKX_SWAP", "BTC-USDT-SWAP"),
    identity("BYBIT_DERIVATIVES", "BTCUSDT"),
    identity("BITGET_FUTURES", "BTCUSDT"),
  ];
  const upstream = upstreamBinding(evidenceClass);
  const venueCaptures = M1_VENUE_SOURCE_IDS.map((sourceId) => {
    const venueObservations = observations.filter(
      (observation) => observation.sourceId === sourceId,
    );
    return buildM1MultiAssetCatalogVenueCapture({
      releaseId: RELEASE,
      registryDigest:
        M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest,
      upstreamBindingId: upstream.upstreamBindingId,
      upstreamBindingHash: upstream.contentHash,
      evidenceClass,
      networkEnvironment: upstream.networkEnvironment,
      sourceId,
      requestOutcomes: [{
        outcome: "SUCCESS",
        pageIndex: 1,
        requestUrlHash:
          M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE.sources[sourceId]
            .initialRequestUrlHash,
        receivedAt: "2026-07-26T23:59:59.000Z",
        httpStatus: 200,
        responseBytes: 100,
        responseHash: stableContentHash(venueObservations),
        recordCount: 1,
        nextPageAvailable: false,
        rawBodyRetained: false,
        secretMaterialPresent: false,
      }],
      rawRecordCount: 1,
      observations: venueObservations,
      normalizationStatus: "PASS",
    });
  });
  const catalogCaptureBinding = buildM1MultiAssetCatalogCaptureBinding({
    releaseId: RELEASE,
    generatedAt: "2026-07-26T23:59:59.000Z",
    registryDigest:
      M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest,
    upstreamBindingId: upstream.upstreamBindingId,
    upstreamBindingHash: upstream.contentHash,
    evidenceClass,
    networkEnvironment: upstream.networkEnvironment,
    venueCaptures,
  });
  return buildM1MultiAssetIdentitySnapshot({
    releaseId: RELEASE,
    generatedAt: "2026-07-26T23:59:59.000Z",
    sourceCutoff: "2026-07-26T23:59:59.000Z",
    registryDigest:
      M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest,
    catalogCaptureBinding,
    observations,
  });
}

test("runtime captures six exact public requests and returns four immutable Venue batches", async () => {
  const requests: PublicJsonRequest[] = [];
  const batches = await captureM1WideMarketVenueBatches(
    transport(requests),
  );
  const expected = M1_VENUE_SOURCE_IDS
    .flatMap(
      (sourceId) => [...m1WideMarketProfileFor(sourceId).requests],
    )
    .map((request) => ({
      url: request.url,
      allowedHost: request.allowedHost,
      timeoutMs: request.timeoutMs,
      maxResponseBytes: request.maxResponseBytes,
      captureBody: false,
    }))
    .sort((left, right) => left.url.localeCompare(right.url));
  const actual = requests.map((request) => ({
    url: request.url,
    allowedHost: request.allowedHost,
    timeoutMs: request.timeoutMs,
    maxResponseBytes: request.maxResponseBytes,
    captureBody: request.captureBody,
  })).sort((left, right) => left.url.localeCompare(right.url));

  assert.deepEqual(actual, expected);
  assert.equal(requests.length, 6);
  assert.deepEqual(
    batches.map((batch) => batch.sourceId),
    [
      "BINANCE_FUTURES",
      "OKX_SWAP",
      "BYBIT_DERIVATIVES",
      "BITGET_FUTURES",
    ],
  );
  assert.ok(batches.every((batch) => batch.status === "COMPLETE"));
  assert.ok(batches.every((batch) => batch.rawBodyRetained === false));
  assert.ok(batches.every((batch) => batch.secretMaterialPresent === false));
  assert.ok(batches.every((batch) => batch.authorityGranted === false));
  assert.equal(Object.isFrozen(batches), true);
});

test("runtime rejects unsafe native integers before normalization", async () => {
  const requests: PublicJsonRequest[] = [];
  const batches = await captureM1WideMarketVenueBatches(
    transport(requests, (request) =>
      request.url.includes("api.bitget.com")
        ? {
          code: "00000",
          requestTime: Number.MAX_SAFE_INTEGER + 2,
          data: [],
        }
        : payloadFor(request.url)
    ),
  );
  const bitget = batches.find(
    (batch) => batch.sourceId === "BITGET_FUTURES",
  )!;
  assert.equal(bitget.status, "FAILED");
  assert.equal(bitget.failedComponentCount, 1);
  assert.equal(
    bitget.components[0]!.providerFailureKind,
    "INVALID",
  );
  assert.deepEqual(bitget.reasonCodes, [
    "provider_payload_contains_unsafe_native_integer",
  ]);
});

test("runtime derives cutoff and normalization time after real receipt", async () => {
  const snapshot = await runM1MultiAssetBaseFactRuntime({
    releaseId: RELEASE,
    upstreamBinding: upstreamBinding(),
    identitySnapshot: identitySnapshot(),
    networkEnvironment: "TEST_HARNESS",
    transportImplementation: transport([]),
    now: () => new Date("2026-07-27T00:00:02.000Z"),
  });
  assert.equal(snapshot.sourceCutoff, RECEIVED_AT);
  assert.equal(snapshot.normalizedAt, "2026-07-27T00:00:02.000Z");
  assert.equal(snapshot.generatedAt, "2026-07-27T00:00:02.000Z");
  assert.equal(snapshot.routeEligibleCount, 4);
  assert.equal(snapshot.freshCount, 4);
  assert.equal(
    snapshot.status,
    "TEST_ONLY_NO_LIVE_FACT_EVIDENCE",
  );

  await assert.rejects(
    runM1MultiAssetBaseFactRuntime({
      releaseId: RELEASE,
      upstreamBinding: upstreamBinding(),
      identitySnapshot: identitySnapshot(),
      networkEnvironment: "TEST_HARNESS",
      transportImplementation: transport([]),
      now: () => new Date("2026-07-27T00:00:00.500Z"),
    }),
    /clock cannot precede completed source receipt/u,
  );
});

test("runtime cannot promote an injected transport to live evidence", async () => {
  const requests: PublicJsonRequest[] = [];
  await assert.rejects(
    runM1MultiAssetBaseFactRuntime({
      releaseId: RELEASE,
      upstreamBinding: upstreamBinding("LIVE_READ_ONLY"),
      identitySnapshot: identitySnapshot(),
      networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
      transportImplementation: transport(requests),
      now: () => new Date("2026-07-27T00:00:02.000Z"),
    }),
    /injected wide-market transport must remain TEST_HARNESS/u,
  );
  assert.equal(requests.length, 0);
});

test("runtime cannot label native transport with test-only upstream evidence", async () => {
  await assert.rejects(
    runM1MultiAssetBaseFactRuntime({
      releaseId: RELEASE,
      upstreamBinding: upstreamBinding(),
      identitySnapshot: identitySnapshot(),
      networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
      now: () => new Date("2026-07-27T00:00:02.000Z"),
    }),
    /transport and upstream evidence class must match/u,
  );
});

test("composition binds catalog identity and wide-market facts under one exact upstream", async () => {
  const requests: PublicJsonRequest[] = [];
  const result = await runM1ScopeV2BaseMarketCaptureRuntime({
    upstreamBinding: upstreamBinding(),
    networkEnvironment: "TEST_HARNESS",
    transportImplementation: transport(requests),
    now: () => new Date("2026-07-27T00:00:02.000Z"),
  });
  assert.equal(requests.length, 10);
  assert.equal(result.identityCapture.identitySnapshot.observedCount, 4);
  assert.equal(result.baseFactSnapshot.observedSubjectCount, 4);
  assert.equal(
    result.baseFactSnapshot.identitySnapshotHash,
    result.identityCapture.identitySnapshot.contentHash,
  );
  assert.equal(
    result.baseFactSnapshot.catalogCaptureBindingHash,
    result.identityCapture.captureBinding.contentHash,
  );
  assert.equal(
    result.baseFactSnapshot.status,
    "TEST_ONLY_NO_LIVE_FACT_EVIDENCE",
  );
  assert.equal(result.authorityGranted, false);
  assert.equal(result.productionChanged, false);
  assert.equal(result.secretMaterialPresent, false);
});
