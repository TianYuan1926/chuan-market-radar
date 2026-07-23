import assert from "node:assert/strict";
import test from "node:test";
import {
  runM1ExactSourceConformanceEntrypoint,
} from "../../entrypoints/m1-exact-source-conformance";
import {
  M1_EXACT_SOURCE_EXECUTION_POLICY,
  M1_EXACT_SOURCE_PROBE_DEFINITIONS,
  M1_EXACT_SOURCE_PROBE_PLAN_DIGEST,
  runM1ExactSourceConformance,
} from "./adapters/exact-source-conformance-runner";
import {
  M1_SOURCE_CONFORMANCE_PROBE_IDS,
  M1SourceConformanceArtifactSchema,
} from "./source-conformance-contract";
import {
  stableContentHash,
} from "../universe/stable-artifact";

const NOW = "2026-07-23T10:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const RELEASE_ID = "2e4a632ed92b9478612fb42bded6e1a00e114bd1";
const REGISTRY_DIGEST =
  "sha256:45832cf889c92153a29d511582c386a9089d1eeb904a3e8ecdee5772904dfd94";

function response(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function binanceDerivativeRow(): Record<string, unknown> {
  return {
    symbol: "BTCUSDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    marginAsset: "USDT",
    contractType: "PERPETUAL",
    status: "TRADING",
    onboardDate: NOW_MS - 1_000,
    deliveryDate: 0,
    underlyingType: "COIN",
    filters: [],
  };
}

function okxDerivativeRow(): Record<string, unknown> {
  return {
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
    listTime: String(NOW_MS - 1_000),
    tickSz: "0.1",
    lotSz: "1",
  };
}

function bybitDerivativeRow(): Record<string, unknown> {
  return {
    symbol: "BTCUSDT",
    contractType: "LinearPerpetual",
    status: "Trading",
    baseCoin: "BTC",
    quoteCoin: "USDT",
    settleCoin: "USDT",
    launchTime: String(NOW_MS - 1_000),
    deliveryTime: "0",
    symbolType: "",
    isPreListing: false,
    priceFilter: { tickSize: "0.1" },
    lotSizeFilter: { qtyStep: "0.001" },
  };
}

function bitgetDerivativeRow(): Record<string, unknown> {
  return {
    symbol: "BTCUSDT",
    baseCoin: "BTC",
    quoteCoin: "USDT",
    supportMarginCoins: ["USDT"],
    symbolType: "perpetual",
    symbolStatus: "normal",
    launchTime: String(NOW_MS - 1_000),
    offTime: "-1",
    maintainTime: "",
    sizeMultiplier: "0.001",
    pricePlace: "1",
    priceEndStep: "1",
    isRwa: "NO",
  };
}

function fixtureFetch(options: {
  binanceClockOffsetMs?: number;
  emptyBitgetDerivativeCatalog?: boolean;
  malformedOkxDerivativeCatalog?: boolean;
  observedUrls?: string[];
  bybitAnnouncementTotal?: number;
  repeatBybitCursor?: boolean;
  observedCoinGlassKey?: string[];
} = {}): typeof fetch {
  return async (request, init) => {
    const url = new URL(String(request));
    options.observedUrls?.push(url.toString());
    if (url.hostname === "fapi.binance.com") {
      return url.pathname.endsWith("/time")
        ? response({
          serverTime: NOW_MS + (options.binanceClockOffsetMs ?? 0),
        })
        : response({ symbols: [binanceDerivativeRow()] });
    }
    if (url.hostname === "api.binance.com") {
      return response({
        symbols: [{
          symbol: "BTCUSDT",
          status: "TRADING",
          baseAsset: "BTC",
          quoteAsset: "USDT",
        }],
      });
    }
    if (url.hostname === "www.okx.com") {
      if (url.pathname.endsWith("/time")) {
        return response({ code: "0", data: [{ ts: String(NOW_MS) }] });
      }
      return response({
        code: "0",
        data: url.searchParams.get("instType") === "SPOT"
          ? [{
            instId: "BTC-USDT",
            instType: "SPOT",
            state: "live",
            baseCcy: "BTC",
            quoteCcy: "USDT",
          }]
          : options.malformedOkxDerivativeCatalog
            ? [{ instId: "BTC-USDT-SWAP" }]
            : [okxDerivativeRow()],
      });
    }
    if (url.hostname === "api.bybit.com") {
      if (url.pathname.endsWith("/time")) {
        return response({
          retCode: 0,
          time: NOW_MS,
          result: { timeSecond: String(NOW_MS / 1000) },
        });
      }
      if (url.pathname.includes("announcements")) {
        const page = Number(url.searchParams.get("page") ?? "1");
        return response({
          retCode: 0,
          time: NOW_MS,
          result: {
            total: options.bybitAnnouncementTotal ?? 1,
            list: [{
              title: `Fixture listing page ${page}`,
              type: { key: "new_crypto" },
              tags: ["Derivatives"],
              url: "https://announcements.bybit.com/example",
              publishTime: NOW_MS - 1_000,
            }],
          },
        });
      }
      const category = url.searchParams.get("category");
      const cursor = url.searchParams.get("cursor");
      return response({
        retCode: 0,
        time: NOW_MS,
        result: {
          category,
          list: category === "spot"
            ? [{
              symbol: "BTCUSDT",
              status: "Trading",
              baseCoin: "BTC",
              quoteCoin: "USDT",
            }]
            : [bybitDerivativeRow()],
          nextPageCursor:
            category === "linear" && options.repeatBybitCursor
              ? cursor ?? "same"
              : "",
        },
      });
    }
    if (url.hostname === "api.bitget.com") {
      if (url.pathname.endsWith("/time")) {
        return response({
          code: "00000",
          requestTime: NOW_MS,
          data: { serverTime: String(NOW_MS) },
        });
      }
      if (url.pathname.includes("annoucements")) {
        return response({
          code: "00000",
          requestTime: NOW_MS,
          data: [{
            annId: "1",
            annTitle: "Fixture listing",
            annUrl: "https://www.bitget.com/support/articles/example",
            cTime: String(NOW_MS - 1_000),
            annType: "coin_listings",
            annSubType: "futures",
          }],
        });
      }
      if (
        url.pathname.includes("/mix/market/contracts") &&
        options.emptyBitgetDerivativeCatalog
      ) {
        return response({
          code: "00000",
          requestTime: NOW_MS,
          data: [],
        });
      }
      return response({
        code: "00000",
        requestTime: NOW_MS,
        data: url.pathname.includes("/spot/public/symbols")
          ? [{
            symbol: "BTCUSDT",
            status: "online",
            baseCoin: "BTC",
            quoteCoin: "USDT",
          }]
          : [bitgetDerivativeRow()],
      });
    }
    if (url.hostname === "open-api-v4.coinglass.com") {
      const headers = new Headers(init?.headers);
      options.observedCoinGlassKey?.push(
        headers.get("CG-API-KEY") ?? "",
      );
      return response({ code: "0", data: ["BTC", "ETH"] });
    }
    throw new Error(`unexpected fixture URL ${url.toString()}`);
  };
}

function rehashTamperedArtifact(
  artifact: Record<string, unknown>,
): Record<string, unknown> {
  const core = structuredClone(artifact);
  delete core.schemaVersion;
  delete core.artifactId;
  delete core.contentHash;
  const contentHash = stableContentHash(core);
  return {
    ...artifact,
    artifactId: `source-conformance:${contentHash.slice(7, 31)}`,
    contentHash,
  };
}

test("freezes exactly fifteen unique B1 source conformance probes", () => {
  assert.equal(M1_EXACT_SOURCE_PROBE_DEFINITIONS.length, 15);
  assert.deepEqual(
    [...M1_EXACT_SOURCE_PROBE_DEFINITIONS]
      .map((definition) => definition.probeId)
      .sort(),
    [...M1_SOURCE_CONFORMANCE_PROBE_IDS].sort(),
  );
  assert.equal(
    new Set(M1_EXACT_SOURCE_PROBE_DEFINITIONS.map(
      (definition) => definition.probeId,
    )).size,
    15,
  );
  assert.match(M1_EXACT_SOURCE_PROBE_PLAN_DIGEST, /^sha256:[0-9a-f]{64}$/u);
});

test("runs all probes in a test harness without manufacturing live gate PASS", async () => {
  const seenKeys: string[] = [];
  const artifact = await runM1ExactSourceConformance({
    releaseId: RELEASE_ID,
    registryDigest: REGISTRY_DIGEST,
    networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
    coinGlassApiKey: "test-only-key-not-real",
    fetchImplementation: fixtureFetch({ observedCoinGlassKey: seenKeys }),
    now: () => new Date(NOW),
  });

  assert.equal(artifact.evidenceClass, "TEST_ONLY");
  assert.equal(artifact.networkEnvironment, "TEST_HARNESS");
  assert.equal(artifact.passCount, 15);
  assert.equal(artifact.failCount, 0);
  assert.equal(artifact.notRunCount, 0);
  assert.equal(artifact.identityGateStatus, "NOT_EVALUATED_TEST_ONLY");
  assert.equal(artifact.listingGateStatus, "NOT_EVALUATED_TEST_ONLY");
  assert.equal(artifact.coinGlassGateStatus, "NOT_EVALUATED_TEST_ONLY");
  assert.deepEqual(seenKeys, ["test-only-key-not-real"]);
  assert.equal(artifact.secretMaterialPresent, false);
  assert.equal(
    artifact.probes.every((probe) =>
      probe.rawBodyRetained === false &&
      probe.responseBodyDigest?.startsWith("sha256:") === true
    ),
    true,
  );
  assert.doesNotMatch(JSON.stringify(artifact), /test-only-key-not-real/u);
});

test("uses exact listing-only announcement scopes and parallelizes only across sources", async () => {
  const observedUrls: string[] = [];
  const activeBySource = new Map<string, number>();
  const sourceForHost = (host: string): string => {
    if (host === "fapi.binance.com" || host === "api.binance.com") {
      return "BINANCE";
    }
    if (host === "www.okx.com") return "OKX";
    if (host === "api.bybit.com") return "BYBIT";
    if (host === "api.bitget.com") return "BITGET";
    return "COINGLASS";
  };
  let activeTotal = 0;
  let maxActiveTotal = 0;
  let maxActivePerSource = 0;
  const baseFetch = fixtureFetch({ observedUrls });
  const delayedFetch: typeof fetch = async (request, init) => {
    const host = new URL(String(request)).hostname;
    const source = sourceForHost(host);
    const sourceActive = (activeBySource.get(source) ?? 0) + 1;
    activeBySource.set(source, sourceActive);
    activeTotal += 1;
    maxActiveTotal = Math.max(maxActiveTotal, activeTotal);
    maxActivePerSource = Math.max(maxActivePerSource, sourceActive);
    try {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
      return await baseFetch(request, init);
    } finally {
      activeBySource.set(source, (activeBySource.get(source) ?? 1) - 1);
      activeTotal -= 1;
    }
  };

  await runM1ExactSourceConformance({
    releaseId: RELEASE_ID,
    registryDigest: REGISTRY_DIGEST,
    networkEnvironment: "LOCAL_WORKSTATION",
    coinGlassApiKey: "test-key",
    fetchImplementation: delayedFetch,
    now: () => new Date(NOW),
  });

  const bybitAnnouncement = observedUrls.find((url) =>
    url.includes("api.bybit.com/v5/announcements/index")
  );
  const bitgetAnnouncement = observedUrls.find((url) =>
    url.includes("api.bitget.com/api/v2/public/annoucements")
  );
  assert.equal(new URL(bybitAnnouncement!).searchParams.get("type"), "new_crypto");
  assert.equal(
    new URL(bitgetAnnouncement!).searchParams.get("annType"),
    "coin_listings",
  );
  assert.ok(maxActiveTotal > 1);
  assert.equal(maxActivePerSource, 1);
  assert.equal(
    M1_EXACT_SOURCE_EXECUTION_POLICY.announcementScope.bybit,
    "LATEST_TWO_NEW_CRYPTO_PAGES_FOR_CONFORMANCE_FULL_BACKFILL_DEFERRED_TO_LISTING_RUNTIME",
  );
});

test("bounds Bybit live conformance to the newest two pages without claiming a full backfill", async () => {
  const observedUrls: string[] = [];
  const artifact = await runM1ExactSourceConformance({
    releaseId: RELEASE_ID,
    registryDigest: REGISTRY_DIGEST,
    networkEnvironment: "LOCAL_WORKSTATION",
    coinGlassApiKey: "test-key",
    fetchImplementation: fixtureFetch({
      bybitAnnouncementTotal: 1_617,
      observedUrls,
    }),
    now: () => new Date(NOW),
  });
  const announcementUrls = observedUrls.filter((url) =>
    url.includes("api.bybit.com/v5/announcements/index")
  );
  const bybit = artifact.probes.find(
    (probe) => probe.probeId === "BYBIT_LISTING_ANNOUNCEMENT",
  );

  assert.deepEqual(
    announcementUrls.map((url) => new URL(url).searchParams.get("page")),
    ["1", "2"],
  );
  assert.equal(bybit?.outcome, "PASS");
  assert.equal(bybit?.paginationStatus, "BOUNDED_COMPLETE");
  assert.equal(bybit?.observedRecordCount, 2);
});

test("keeps missing CoinGlass Hobbyist credential as NOT_RUN while public probes proceed", async () => {
  const artifact = await runM1ExactSourceConformance({
    releaseId: RELEASE_ID,
    registryDigest: REGISTRY_DIGEST,
    networkEnvironment: "LOCAL_WORKSTATION",
    coinGlassApiKey: null,
    fetchImplementation: fixtureFetch(),
    now: () => new Date(NOW),
  });
  const coinGlass = artifact.probes.find(
    (probe) => probe.probeId === "COINGLASS_SUPPORTED_COINS",
  );

  assert.equal(artifact.passCount, 14);
  assert.equal(artifact.notRunCount, 1);
  assert.equal(coinGlass?.outcome, "NOT_RUN");
  assert.equal(
    coinGlass?.failure,
    "MISSING_REQUIRED_READ_ONLY_CREDENTIAL",
  );
  assert.equal(
    coinGlass?.credentialDisposition,
    "MISSING_REQUIRED_READ_ONLY_KEY",
  );
  assert.equal(coinGlass?.attemptStartedAt, null);
});

test("fails closed on repeated pagination cursors", async () => {
  const artifact = await runM1ExactSourceConformance({
    releaseId: RELEASE_ID,
    registryDigest: REGISTRY_DIGEST,
    networkEnvironment: "LOCAL_WORKSTATION",
    coinGlassApiKey: "test-key",
    fetchImplementation: fixtureFetch({ repeatBybitCursor: true }),
    now: () => new Date(NOW),
  });
  const bybit = artifact.probes.find(
    (probe) => probe.probeId === "BYBIT_DERIVATIVE_CATALOG",
  );

  assert.equal(bybit?.outcome, "FAIL");
  assert.equal(bybit?.failure, "PAGINATION_INCOMPLETE_UNAVAILABLE");
  assert.equal(bybit?.paginationStatus, "INCOMPLETE");
});

test("fails closed when a required catalog is structurally valid but empty", async () => {
  const artifact = await runM1ExactSourceConformance({
    releaseId: RELEASE_ID,
    registryDigest: REGISTRY_DIGEST,
    networkEnvironment: "LOCAL_WORKSTATION",
    coinGlassApiKey: "test-key",
    fetchImplementation: fixtureFetch({
      emptyBitgetDerivativeCatalog: true,
    }),
    now: () => new Date(NOW),
  });
  const bitget = artifact.probes.find(
    (probe) => probe.probeId === "BITGET_DERIVATIVE_CATALOG",
  );

  assert.equal(bitget?.outcome, "FAIL");
  assert.equal(bitget?.failure, "EMPTY_RESPONSE_OBSERVED_EMPTY");
  assert.equal(bitget?.observedRecordCount, null);
});

test("fails closed when a catalog envelope passes but adapter rows drift", async () => {
  const artifact = await runM1ExactSourceConformance({
    releaseId: RELEASE_ID,
    registryDigest: REGISTRY_DIGEST,
    networkEnvironment: "LOCAL_WORKSTATION",
    coinGlassApiKey: "test-key",
    fetchImplementation: fixtureFetch({
      malformedOkxDerivativeCatalog: true,
    }),
    now: () => new Date(NOW),
  });
  const okx = artifact.probes.find(
    (probe) => probe.probeId === "OKX_DERIVATIVE_CATALOG",
  );

  assert.equal(okx?.outcome, "FAIL");
  assert.equal(okx?.failure, "SCHEMA_DRIFT_UNAVAILABLE");
});

test("fails closed when an exchange clock exceeds the permitted skew", async () => {
  const artifact = await runM1ExactSourceConformance({
    releaseId: RELEASE_ID,
    registryDigest: REGISTRY_DIGEST,
    networkEnvironment: "LOCAL_WORKSTATION",
    coinGlassApiKey: "test-key",
    fetchImplementation: fixtureFetch({
      binanceClockOffsetMs: 120_000,
    }),
    now: () => new Date(NOW),
  });
  const binance = artifact.probes.find(
    (probe) => probe.probeId === "BINANCE_SERVER_TIME",
  );

  assert.equal(binance?.outcome, "FAIL");
  assert.equal(binance?.failure, "SOURCE_CLOCK_UNKNOWN_UNAVAILABLE");
});

test("entrypoint binds release identity and exits nonzero for test-only evidence", async () => {
  const result = await runM1ExactSourceConformanceEntrypoint({
    args: [
      "--repository-root",
      "/tmp/market-radar-fixture",
      "--release-id",
      RELEASE_ID,
      "--network-environment",
      "TENCENT_ISOLATED_READ_ONLY",
    ],
    env: { COINGLASS_API_KEY: "test-key" },
    fetchImplementation: fixtureFetch(),
    now: () => new Date(NOW),
    resolveRepositoryRelease: () => RELEASE_ID,
  });
  const artifact = M1SourceConformanceArtifactSchema.parse(
    JSON.parse(result.output),
  );

  assert.equal(result.exitCode, 2);
  assert.equal(artifact.evidenceClass, "TEST_ONLY");
  assert.equal(artifact.productionChanged, false);
});

test("artifact schema rejects count inflation even after rehashing", async () => {
  const artifact = await runM1ExactSourceConformance({
    releaseId: RELEASE_ID,
    registryDigest: REGISTRY_DIGEST,
    networkEnvironment: "LOCAL_WORKSTATION",
    coinGlassApiKey: "test-key",
    fetchImplementation: fixtureFetch(),
    now: () => new Date(NOW),
  });
  const tampered = structuredClone(artifact) as Record<string, unknown>;
  tampered.passCount = 99;
  const rehashed = rehashTamperedArtifact(tampered);

  assert.equal(
    M1SourceConformanceArtifactSchema.safeParse(rehashed).success,
    false,
  );
});

test("artifact schema rejects TEST_ONLY authority inflation after rehashing", async () => {
  const artifact = await runM1ExactSourceConformance({
    releaseId: RELEASE_ID,
    registryDigest: REGISTRY_DIGEST,
    networkEnvironment: "LOCAL_WORKSTATION",
    coinGlassApiKey: "test-key",
    fetchImplementation: fixtureFetch(),
    now: () => new Date(NOW),
  });
  const tampered = structuredClone(artifact) as Record<string, unknown>;
  tampered.identityGateStatus = "PASS";
  const rehashed = rehashTamperedArtifact(tampered);

  assert.equal(
    M1SourceConformanceArtifactSchema.safeParse(rehashed).success,
    false,
  );
});
