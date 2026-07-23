import assert from "node:assert/strict";
import test from "node:test";
import {
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
} from "../source-capability/adapters/four-venue-capability-registry";
import {
  M1SourceConformanceProbeObservationSchema,
  buildM1SourceConformanceArtifact,
} from "../source-conformance/source-conformance-contract";
import {
  M1_EXACT_SOURCE_ENDPOINT_DEFINITIONS,
  M1_EXACT_SOURCE_PROBE_PLAN_DIGEST,
  type M1SourceConformanceTransport,
} from "../source-conformance/adapters/exact-source-conformance-runner";
import {
  extractM1ListingHistoryCheckpoints,
  M1RuntimeAdapterLiveArtifactSchema,
  runM1RuntimeAdapterLiveSegment,
} from "./runtime-adapter-live";
import { stableContentHash } from "../universe/stable-artifact";

const CONFORMANCE_RELEASE = "a".repeat(40);
const RUNTIME_RELEASE = "b".repeat(40);
const CONFORMANCE_AT = "2026-07-24T02:59:00.000Z";
const RUNTIME_AT = "2026-07-24T03:00:00.000Z";
const PROVIDER_TIME = Date.parse(RUNTIME_AT);
const COINGLASS_KEY = "test-read-only-key-not-a-production-secret";

function liveConformanceArtifact() {
  const probes = M1_EXACT_SOURCE_ENDPOINT_DEFINITIONS.map(
    (definition, index) =>
      M1SourceConformanceProbeObservationSchema.parse({
        probeId: definition.probeId,
        sourceId: definition.sourceId,
        capabilityId: definition.capabilityId,
        gate: definition.gate,
        definitionDigest: definition.definitionDigest,
        evidenceClass: "LIVE_READ_ONLY",
        outcome: "PASS",
        attemptStartedAt: "2026-07-24T02:58:59.000Z",
        receivedAt: CONFORMANCE_AT,
        latencyMs: 1_000,
        httpStatus: 200,
        responseBodyDigest:
          `sha256:${(index + 1).toString(16).padStart(64, "0")}`,
        responseBytes: 1_000,
        topLevelKeys: ["data"],
        recordKeys: ["id"],
        observedRecordCount: 1,
        providerServerTime: null,
        absoluteClockSkewMs: null,
        paginationStatus:
          definition.paginationExpectation === "BOUNDED_HEAD_WINDOW"
            ? "BOUNDED_COMPLETE"
            : definition.paginationExpectation === "MUST_TERMINATE"
              ? "COMPLETE"
              : "NOT_APPLICABLE",
        credentialDisposition: definition.requiresReadOnlyApiKey
          ? "READ_ONLY_KEY_USED_NOT_RETAINED"
          : "PUBLIC_NO_CREDENTIAL",
        failure: null,
        reasonCodes: [],
        rawBodyRetained: false,
        secretMaterialPresent: false,
      }),
  );
  return buildM1SourceConformanceArtifact({
    releaseId: CONFORMANCE_RELEASE,
    generatedAt: CONFORMANCE_AT,
    sourceCutoff: CONFORMANCE_AT,
    registryDigest:
      M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest,
    probePlanDigest: M1_EXACT_SOURCE_PROBE_PLAN_DIGEST,
    evidenceClass: "LIVE_READ_ONLY",
    networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
    probes,
  });
}

function bybitAnnouncement(key: string) {
  return {
    retCode: 0,
    result: {
      total: 1,
      list: [{
        title: `Listing ${key}`,
        type: { key: "new_crypto" },
        tags: ["Spot", "Spot Listings"],
        url: `https://announcements.bybit.com/en-US/article/${key}`,
        publishTime: PROVIDER_TIME - 60_000,
      }],
    },
    time: PROVIDER_TIME,
  };
}

function bitgetAnnouncement(id: string) {
  return {
    code: "00000",
    requestTime: PROVIDER_TIME,
    data: [{
      annId: id,
      annTitle: `Listing ${id}`,
      annUrl: `https://www.bitget.com/support/articles/${id}`,
      cTime: String(PROVIDER_TIME - 60_000),
      annType: "coin_listings",
      annSubType: "spot",
    }],
  };
}

function payloadFor(
  url: URL,
  {
    bitgetListingId,
    bybitListingKey,
  }: {
    bitgetListingId: string;
    bybitListingKey: string;
  },
): unknown {
  if (url.hostname === "api.binance.com") {
    throw new Error("registry-blocked Binance Spot route was requested");
  }
  if (url.hostname === "fapi.binance.com" && url.pathname.endsWith("/time")) {
    return { serverTime: PROVIDER_TIME };
  }
  if (
    url.hostname === "fapi.binance.com" &&
    url.pathname.endsWith("/exchangeInfo")
  ) {
    return {
      symbols: [{
        symbol: "BTCUSDT",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        marginAsset: "USDT",
        contractType: "PERPETUAL",
        status: "TRADING",
      }],
    };
  }
  if (url.hostname === "www.okx.com" && url.pathname.endsWith("/time")) {
    return {
      code: "0",
      data: [{ ts: String(PROVIDER_TIME) }],
    };
  }
  if (
    url.hostname === "www.okx.com" &&
    url.searchParams.get("instType") === "SWAP"
  ) {
    return {
      code: "0",
      data: [{
        instId: "BTC-USDT-SWAP",
        instType: "SWAP",
        ctType: "linear",
        ctVal: "0.01",
        ctValCcy: "BTC",
        settleCcy: "USDT",
        state: "live",
      }],
    };
  }
  if (
    url.hostname === "www.okx.com" &&
    url.searchParams.get("instType") === "SPOT"
  ) {
    return {
      code: "0",
      data: [{
        instId: "BTC-USDT",
        instType: "SPOT",
        state: "live",
        baseCcy: "BTC",
        quoteCcy: "USDT",
      }],
    };
  }
  if (url.hostname === "api.bybit.com" && url.pathname.endsWith("/time")) {
    return {
      retCode: 0,
      result: { timeSecond: String(PROVIDER_TIME / 1_000) },
      time: PROVIDER_TIME,
    };
  }
  if (
    url.hostname === "api.bybit.com" &&
    url.pathname.endsWith("/instruments-info") &&
    url.searchParams.get("category") === "linear"
  ) {
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
        }],
        nextPageCursor: "",
      },
      time: PROVIDER_TIME,
    };
  }
  if (
    url.hostname === "api.bybit.com" &&
    url.pathname.endsWith("/instruments-info") &&
    url.searchParams.get("category") === "spot"
  ) {
    return {
      retCode: 0,
      result: {
        category: "spot",
        list: [{
          symbol: "BTCUSDT",
          status: "Trading",
          baseCoin: "BTC",
          quoteCoin: "USDT",
        }],
      },
      time: PROVIDER_TIME,
    };
  }
  if (
    url.hostname === "api.bybit.com" &&
    url.pathname.endsWith("/announcements/index")
  ) {
    return bybitAnnouncement(bybitListingKey);
  }
  if (url.hostname === "api.bitget.com" && url.pathname.endsWith("/time")) {
    return {
      code: "00000",
      data: { serverTime: String(PROVIDER_TIME) },
      requestTime: PROVIDER_TIME,
    };
  }
  if (
    url.hostname === "api.bitget.com" &&
    url.pathname.endsWith("/contracts")
  ) {
    return {
      code: "00000",
      data: [{
        symbol: "BTCUSDT",
        baseCoin: "BTC",
        quoteCoin: "USDT",
        symbolType: "perpetual",
        symbolStatus: "normal",
      }],
    };
  }
  if (
    url.hostname === "api.bitget.com" &&
    url.pathname.endsWith("/symbols")
  ) {
    return {
      code: "00000",
      data: [{
        symbol: "BTCUSDT",
        status: "online",
        baseCoin: "BTC",
        quoteCoin: "USDT",
      }],
    };
  }
  if (
    url.hostname === "api.bitget.com" &&
    url.pathname.endsWith("/annoucements")
  ) {
    return bitgetAnnouncement(bitgetListingId);
  }
  if (
    url.hostname === "open-api-v4.coinglass.com" &&
    url.pathname.endsWith("/supported-coins")
  ) {
    return { code: "0", data: ["BTC"] };
  }
  throw new Error(`unexpected test URL ${url.toString()}`);
}

function strictTransport(input: {
  bitgetListingId?: string;
  bybitListingKey?: string;
} = {}): Readonly<{
  calls: readonly string[];
  maximumConcurrentRequestsByHost: ReadonlyMap<string, number>;
  transport: M1SourceConformanceTransport;
}> {
  const calls: string[] = [];
  const active = new Map<string, number>();
  const maximum = new Map<string, number>();
  const transport: M1SourceConformanceTransport = async (request) => {
    const url = new URL(request.url);
    assert.equal(url.hostname, request.allowedHost);
    calls.push(url.toString());
    const current = (active.get(url.hostname) ?? 0) + 1;
    active.set(url.hostname, current);
    maximum.set(
      url.hostname,
      Math.max(maximum.get(url.hostname) ?? 0, current),
    );
    try {
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (url.hostname === "open-api-v4.coinglass.com") {
        assert.equal(request.headers["CG-API-KEY"], COINGLASS_KEY);
      } else {
        assert.equal(request.headers["CG-API-KEY"], undefined);
      }
      const payload = payloadFor(url, {
        bitgetListingId: input.bitgetListingId ?? "bitget-known",
        bybitListingKey: input.bybitListingKey ?? "bybit-known",
      });
      return {
        ok: true,
        response: {
          body: Buffer.from(JSON.stringify(payload)),
          receivedAt: RUNTIME_AT,
          status: 200,
        },
      };
    } finally {
      active.set(url.hostname, current - 1);
    }
  };
  return {
    calls,
    maximumConcurrentRequestsByHost: maximum,
    transport,
  };
}

test("runtime executes exactly 14 route-eligible profiles and keeps four axes independent", async () => {
  const fixture = strictTransport();
  const artifact = await runM1RuntimeAdapterLiveSegment({
    runtimeReleaseId: RUNTIME_RELEASE,
    conformanceArtifact: liveConformanceArtifact(),
    coinGlassApiKey: COINGLASS_KEY,
    networkEnvironment: "TEST_HARNESS",
    transportImplementation: fixture.transport,
    now: () => new Date(RUNTIME_AT),
  });

  assert.equal(artifact.status, "TEST_ONLY_NOT_LIVE_EVIDENCE");
  assert.equal(artifact.liveConformantProfileCount, 15);
  assert.equal(artifact.routeEligibleProfileCount, 14);
  assert.deepEqual(artifact.registryBlockedProbeIds, [
    "BINANCE_SPOT_CATALOG",
  ]);
  assert.equal(artifact.executions.length, 14);
  assert.equal(artifact.passedProbeIds.length, 14);
  assert.equal(artifact.failedProbeIds.length, 0);
  assert.equal(artifact.requestAttemptCount, 14);
  assert.equal(artifact.listingCheckpointCommittedCount, 2);
  assert.equal(artifact.listingGapCount, 0);
  assert.equal(fixture.calls.length, 14);
  assert.equal(
    fixture.calls.some((url) => new URL(url).hostname === "api.binance.com"),
    false,
  );
  assert.equal(
    [...fixture.maximumConcurrentRequestsByHost.values()]
      .every((maximum) => maximum === 1),
    true,
  );
  assert.deepEqual(
    artifact.acceptanceAxes.map((axis) => [
      axis.axisId,
      axis.routeGateStatus,
      axis.acceptanceGranted,
    ]),
    [
      ["BITGET_VENUE", "PASS", false],
      ["LISTING_LIFECYCLE", "PASS", false],
      ["EQUITY_ASSET_DOMAIN", "PASS", false],
      ["DATA_MAXIMIZATION", "PASS", false],
    ],
  );
  assert.equal(artifact.runtimeAuthorityGranted, false);
  assert.equal(artifact.factAuthorityGranted, false);
  assert.equal(artifact.candidateAuthorityGranted, false);
  assert.equal(artifact.strategyAuthorityGranted, false);
  assert.equal(artifact.readyAuthorityGranted, false);
  assert.equal(artifact.productionChanged, false);
  assert.equal(JSON.stringify(artifact).includes(COINGLASS_KEY), false);

  const checkpoints = extractM1ListingHistoryCheckpoints(artifact);
  assert.equal(
    checkpoints.BYBIT_DERIVATIVES?.status,
    "BOOTSTRAP_COMPLETE",
  );
  assert.equal(
    checkpoints.BITGET_FUTURES?.status,
    "BOOTSTRAP_COMPLETE",
  );
});

test("a listing overlap gap blocks only its own dependent axes and does not advance the checkpoint", async () => {
  const bootstrapFixture = strictTransport();
  const bootstrap = await runM1RuntimeAdapterLiveSegment({
    runtimeReleaseId: RUNTIME_RELEASE,
    conformanceArtifact: liveConformanceArtifact(),
    coinGlassApiKey: COINGLASS_KEY,
    networkEnvironment: "TEST_HARNESS",
    transportImplementation: bootstrapFixture.transport,
    now: () => new Date(RUNTIME_AT),
  });
  const prior = extractM1ListingHistoryCheckpoints(bootstrap);
  const incrementalFixture = strictTransport({
    bybitListingKey: "bybit-new-without-overlap",
    bitgetListingId: "bitget-known",
  });
  const incremental = await runM1RuntimeAdapterLiveSegment({
    runtimeReleaseId: RUNTIME_RELEASE,
    conformanceArtifact: liveConformanceArtifact(),
    coinGlassApiKey: COINGLASS_KEY,
    listingCheckpoints: prior,
    networkEnvironment: "TEST_HARNESS",
    transportImplementation: incrementalFixture.transport,
    now: () => new Date(RUNTIME_AT),
  });

  assert.deepEqual(incremental.failedProbeIds, [
    "BYBIT_LISTING_ANNOUNCEMENT",
  ]);
  assert.equal(incremental.listingCheckpointCommittedCount, 1);
  assert.equal(incremental.listingGapCount, 1);
  const bybit = incremental.executions.find((execution) =>
    execution.probeId === "BYBIT_LISTING_ANNOUNCEMENT"
  );
  assert.equal(bybit?.outcome, "FAIL");
  assert.equal(bybit?.listingAdvance?.status, "BLOCKED_GAP");
  assert.equal(
    bybit?.listingAdvance?.gap.reason,
    "NO_CHECKPOINT_OVERLAP",
  );
  assert.equal(bybit?.listingAdvance?.gap.checkpointAdvanced, false);
  assert.deepEqual(
    Object.fromEntries(
      incremental.acceptanceAxes.map((axis) => [
        axis.axisId,
        axis.routeGateStatus,
      ]),
    ),
    {
      BITGET_VENUE: "PASS",
      LISTING_LIFECYCLE: "BLOCKED",
      EQUITY_ASSET_DOMAIN: "PASS",
      DATA_MAXIMIZATION: "BLOCKED",
    },
  );
});

test("artifact schema rejects a rehashed attempt to shrink an independent axis denominator", async () => {
  const fixture = strictTransport();
  const artifact = await runM1RuntimeAdapterLiveSegment({
    runtimeReleaseId: RUNTIME_RELEASE,
    conformanceArtifact: liveConformanceArtifact(),
    coinGlassApiKey: COINGLASS_KEY,
    networkEnvironment: "TEST_HARNESS",
    transportImplementation: fixture.transport,
    now: () => new Date(RUNTIME_AT),
  });
  const axes = artifact.acceptanceAxes.map((axis) => {
    if (axis.axisId !== "BITGET_VENUE") return axis;
    const core = Object.fromEntries(
      Object.entries(axis).filter(([key]) =>
        key !== "axisEvidenceId" && key !== "contentHash"
      ),
    );
    const shrunkCore = {
      ...core,
      expectedProbeIds: ["BITGET_SERVER_TIME"],
      executedProbeIds: ["BITGET_SERVER_TIME"],
      passedProbeIds: ["BITGET_SERVER_TIME"],
    };
    const contentHash = stableContentHash(shrunkCore);
    return {
      ...shrunkCore,
      axisEvidenceId:
        `runtime-axis:BITGET_VENUE:${contentHash.slice(7, 23)}`,
      contentHash,
    };
  });
  const artifactCore = Object.fromEntries(
    Object.entries(artifact).filter(([key]) =>
      key !== "artifactId" && key !== "contentHash"
    ),
  );
  const tamperedCore = { ...artifactCore, acceptanceAxes: axes };
  const contentHash = stableContentHash(tamperedCore);

  assert.throws(
    () =>
      M1RuntimeAdapterLiveArtifactSchema.parse({
        ...tamperedCore,
        artifactId: `runtime-adapter-live:${contentHash.slice(7, 31)}`,
        contentHash,
      }),
    /BITGET_VENUE acceptance denominator drifted/u,
  );
});
