import assert from "node:assert/strict";
import test from "node:test";
import type {
  PublicJsonRequest,
  PublicJsonTransport,
} from "../universe/public-json-transport";
import {
  M1_SCOPE_EPOCH,
} from "../source-capability/source-capability-contract";
import {
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
} from "../source-capability/adapters/four-venue-capability-registry";
import {
  M1_MULTI_ASSET_SHADOW_AXIS_IDS,
  M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
  M1MultiAssetShadowUpstreamBindingSchema,
} from "../shadow/m1-multi-asset-shadow-contract";
import {
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M1_MULTI_ASSET_CATALOG_TRANSPORT_PROFILE,
} from "./adapters/multi-asset-catalog-live-adapter";
import {
  runM1MultiAssetIdentityCaptureRuntime,
} from "./multi-asset-catalog-capture-runtime";

const RELEASE = "c".repeat(40);
const RECEIVED_AT = "2026-07-27T01:00:00.000Z";
const GENERATED_AT = "2026-07-27T01:00:01.000Z";

function upstreamBinding(
  evidenceClass: "LIVE_READ_ONLY" | "TEST_ONLY" = "TEST_ONLY",
) {
  const live = evidenceClass === "LIVE_READ_ONLY";
  const core = {
    schemaVersion: M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: RELEASE,
    generatedAt: "2026-07-27T00:59:59.000Z",
    sourceCutoff: "2026-07-27T00:59:59.000Z",
    runtimeAdapterArtifactId: "runtime-adapter-live:catalog-capture-fixture",
    runtimeAdapterArtifactHash:
      "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    conformanceArtifactId: "source-conformance:catalog-capture-fixture",
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

function binancePayload() {
  return {
    symbols: [{
      symbol: "BTCUSDT",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      marginAsset: "USDT",
      contractType: "PERPETUAL",
      status: "TRADING",
      onboardDate: 1_700_000_000_000,
      deliveryDate: 0,
      underlyingType: "COIN",
      filters: [
        { filterType: "PRICE_FILTER", tickSize: "0.10" },
        { filterType: "LOT_SIZE", stepSize: "0.001" },
      ],
    }],
  };
}

function okxPayload() {
  return {
    code: "0",
    data: [{
      instId: "BTC-USDT-SWAP",
      instType: "SWAP",
      ctType: "linear",
      ctVal: "0.01",
      ctValCcy: "BTC",
      quoteCcy: "USDT",
      settleCcy: "USDT",
      state: "live",
      instCategory: "1",
      uly: "BTC-USDT",
      listTime: "1700000000000",
      expTime: "",
      tickSz: "0.1",
      lotSz: "1",
    }],
  };
}

function bybitPayload(symbol: string, nextPageCursor = "") {
  return {
    retCode: 0,
    result: {
      category: "linear",
      list: [{
        symbol,
        contractType: "LinearPerpetual",
        status: "Trading",
        baseCoin: symbol.replace(/USDT$/u, ""),
        quoteCoin: "USDT",
        settleCoin: "USDT",
        launchTime: "1700000000000",
        deliveryTime: "0",
        symbolType: "",
        isPreListing: false,
        priceFilter: { tickSize: "0.10" },
        lotSizeFilter: { qtyStep: "0.001" },
      }],
      nextPageCursor,
    },
  };
}

function bitgetPayload() {
  return {
    code: "00000",
    data: [{
      symbol: "BTCUSDT",
      baseCoin: "BTC",
      quoteCoin: "USDT",
      supportMarginCoins: ["USDT"],
      symbolType: "perpetual",
      symbolStatus: "normal",
      launchTime: "1700000000000",
      offTime: "-1",
      maintainTime: "",
      sizeMultiplier: "0.001",
      pricePlace: "1",
      priceEndStep: "1",
      isRwa: "NO",
    }],
  };
}

function fixtureTransport(input: {
  requests: PublicJsonRequest[];
  repeatedBybitCursor?: boolean;
  missingBitgetDigest?: boolean;
}): PublicJsonTransport {
  return async (request) => {
    input.requests.push(request);
    let payload: unknown;
    const parsedUrl = new URL(request.url);
    if (parsedUrl.hostname === "fapi.binance.com") {
      payload = binancePayload();
    } else if (parsedUrl.hostname === "www.okx.com") {
      payload = okxPayload();
    } else if (parsedUrl.hostname === "api.bybit.com") {
      const cursor = parsedUrl.searchParams.get("cursor");
      payload = cursor === null
        ? bybitPayload("BTCUSDT", "next-page")
        : bybitPayload(
          "ETHUSDT",
          input.repeatedBybitCursor ? "next-page" : "",
        );
    } else {
      payload = bitgetPayload();
    }
    const body = JSON.stringify(payload);
    return {
      ok: true,
      status: 200,
      receivedAt: RECEIVED_AT,
      ...(
        input.missingBitgetDigest &&
          parsedUrl.hostname === "api.bitget.com"
          ? {}
          : {
            bodyBytes: Buffer.byteLength(body),
            bodyDigest: stableContentHash(payload),
          }
      ),
      data: payload,
    };
  };
}

test("captures the exact four-Venue catalogs and terminates Bybit pagination", async () => {
  const requests: PublicJsonRequest[] = [];
  const result = await runM1MultiAssetIdentityCaptureRuntime({
    upstreamBinding: upstreamBinding(),
    networkEnvironment: "TEST_HARNESS",
    transportImplementation: fixtureTransport({ requests }),
    now: () => new Date(GENERATED_AT),
  });

  assert.equal(requests.length, 5);
  assert.equal(
    requests.filter(
      (request) => new URL(request.url).hostname === "api.bybit.com",
    ).length,
    2,
  );
  assert.deepEqual(
    requests.filter(
      (request) => !new URL(request.url).searchParams.has("cursor"),
    )
      .map((request) => request.url)
      .sort(),
    Object.values(M1_MULTI_ASSET_CATALOG_TRANSPORT_PROFILE.sources)
      .map((profile) => profile.initialUrl)
      .sort(),
  );
  assert.equal(result.captureBinding.venueCaptures.length, 4);
  assert.ok(
    result.captureBinding.venueCaptures.every(
      (capture) => capture.captureStatus === "COMPLETE",
    ),
  );
  assert.equal(
    result.captureBinding.status,
    "TEST_ONLY_NO_LIVE_CATALOG_EVIDENCE",
  );
  assert.equal(result.identitySnapshot.observedCount, 5);
  assert.equal(
    result.identitySnapshot.countsByVenue.BYBIT_DERIVATIVES,
    2,
  );
  assert.equal(
    result.identitySnapshot.status,
    "TEST_ONLY_NO_LIVE_IDENTITY_EVIDENCE",
  );
  assert.equal(result.authorityGranted, false);
  assert.equal(result.productionChanged, false);
  assert.equal(result.secretMaterialPresent, false);
});

test("keeps repeated Bybit cursors visible and blocks the Venue denominator", async () => {
  const result = await runM1MultiAssetIdentityCaptureRuntime({
    upstreamBinding: upstreamBinding(),
    networkEnvironment: "TEST_HARNESS",
    transportImplementation: fixtureTransport({
      requests: [],
      repeatedBybitCursor: true,
    }),
    now: () => new Date(GENERATED_AT),
  });
  const bybit = result.captureBinding.venueCaptures.find(
    (capture) => capture.sourceId === "BYBIT_DERIVATIVES",
  )!;
  assert.equal(bybit.captureStatus, "FAILED");
  assert.equal(bybit.observationCount, 2);
  assert.ok(bybit.reasonCodes.includes("bybit_catalog_cursor_repeated"));
  assert.ok(
    result.captureBinding.reasonCodes.includes(
      "one_or_more_catalog_captures_incomplete",
    ),
  );
});

test("missing raw response identity fails closed without dropping other Venues", async () => {
  const result = await runM1MultiAssetIdentityCaptureRuntime({
    upstreamBinding: upstreamBinding(),
    networkEnvironment: "TEST_HARNESS",
    transportImplementation: fixtureTransport({
      requests: [],
      missingBitgetDigest: true,
    }),
    now: () => new Date(GENERATED_AT),
  });
  const bitget = result.captureBinding.venueCaptures.find(
    (capture) => capture.sourceId === "BITGET_FUTURES",
  )!;
  assert.equal(bitget.captureStatus, "FAILED");
  assert.equal(bitget.observationCount, 0);
  assert.deepEqual(bitget.reasonCodes, [
    "catalog_capture_incomplete",
    "provider_response_digest_or_byte_count_missing",
  ]);
  assert.equal(result.identitySnapshot.countsByVenue.BITGET_FUTURES, 0);
});

test("an injected transport can never manufacture live catalog evidence", async () => {
  const requests: PublicJsonRequest[] = [];
  await assert.rejects(
    runM1MultiAssetIdentityCaptureRuntime({
      upstreamBinding: upstreamBinding("LIVE_READ_ONLY"),
      networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
      transportImplementation: fixtureTransport({ requests }),
      now: () => new Date(GENERATED_AT),
    }),
    /injected catalog transport must remain TEST_HARNESS/u,
  );
  assert.equal(requests.length, 0);
});

test("native transport cannot borrow a test-only upstream binding", async () => {
  await assert.rejects(
    runM1MultiAssetIdentityCaptureRuntime({
      upstreamBinding: upstreamBinding(),
      networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
      now: () => new Date(GENERATED_AT),
    }),
    /transport and upstream evidence class must match/u,
  );
});
