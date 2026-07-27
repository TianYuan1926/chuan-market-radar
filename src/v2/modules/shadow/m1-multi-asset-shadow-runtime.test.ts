import assert from "node:assert/strict";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  M1_LISTING_WATCH_BINDING_VERSION,
  buildM1ListingWatchEvidenceBinding,
  type M1ListingWatchEvidenceBinding,
} from "../market-fact/multi-asset-base-fact-contract";
import {
  M1_SCOPE_EPOCH,
} from "../source-capability/source-capability-contract";
import {
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
} from "../source-capability/adapters/four-venue-capability-registry";
import type {
  PublicJsonRequest,
  PublicJsonTransport,
} from "../universe/public-json-transport";
import {
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M1_MULTI_ASSET_SHADOW_AXIS_IDS,
  M1_MULTI_ASSET_SHADOW_PROFILE,
  M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
  M1MultiAssetShadowCycleSchema,
  M1MultiAssetShadowEvidenceSchema,
  M1MultiAssetShadowUpstreamBindingSchema,
} from "./m1-multi-asset-shadow-contract";
import {
  M1MultiAssetShadowCheckpointReceiptSchema,
  M1MultiAssetShadowPersistenceReceiptSchema,
  runM1MultiAssetShadowWorker,
} from "./m1-multi-asset-shadow-runtime";
import {
  verifyM1MultiAssetShadowEvidenceStore,
} from "./m1-multi-asset-shadow-evidence-verifier";

const RELEASE = "f".repeat(40);
const START_MS = Date.parse("2026-07-27T02:00:00.000Z");

function upstreamBinding(
  evidenceClass: "LIVE_READ_ONLY" | "TEST_ONLY" = "TEST_ONLY",
) {
  const live = evidenceClass === "LIVE_READ_ONLY";
  const core = {
    schemaVersion: M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: RELEASE,
    generatedAt: "2026-07-27T01:59:58.000Z",
    sourceCutoff: "2026-07-27T01:59:58.000Z",
    runtimeAdapterArtifactId: "runtime-adapter-live:shadow-worker-fixture",
    runtimeAdapterArtifactHash:
      "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    conformanceArtifactId: "source-conformance:shadow-worker-fixture",
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

function payloadFor(url: string, eventMs: number): unknown {
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
      time: eventMs,
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
      closeTime: eventMs,
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
        ts: String(eventMs),
      }],
    };
  }
  if (url.includes("/api/v5/public/mark-price")) {
    return {
      code: "0",
      data: [{
        instId: "BTC-USDT-SWAP",
        markPx: "100",
        ts: String(eventMs),
      }],
    };
  }
  if (url.includes("/v5/market/tickers")) {
    return {
      retCode: 0,
      time: eventMs,
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
    requestTime: eventMs,
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
      ts: String(eventMs),
    }],
  };
}

function fixtureTransport(input: {
  requests: PublicJsonRequest[];
  currentMs: () => number;
}): PublicJsonTransport {
  return async (request) => {
    input.requests.push(request);
    const eventMs = input.currentMs();
    const data = payloadFor(request.url, eventMs);
    return {
      ok: true,
      status: 200,
      receivedAt: new Date(eventMs).toISOString(),
      bodyBytes: Buffer.byteLength(JSON.stringify(data)),
      bodyDigest: stableContentHash(data),
      data,
    };
  };
}

function listingBindings(
  upstream: ReturnType<typeof upstreamBinding>,
  sourceCutoff: string,
): readonly M1ListingWatchEvidenceBinding[] {
  return (
    ["BYBIT_DERIVATIVES", "BITGET_FUTURES"] as const
  ).map((sourceId) => buildM1ListingWatchEvidenceBinding({
    schemaVersion: M1_LISTING_WATCH_BINDING_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: upstream.releaseId,
    upstreamBindingId: upstream.upstreamBindingId,
    upstreamBindingHash: upstream.contentHash,
    sourceId,
    evidenceId: `listing-checkpoint:${sourceId}:${sourceCutoff}`,
    evidenceHash: stableContentHash({ sourceId, sourceCutoff }),
    sourceCutoff,
    status: "COMMITTED_NO_GAP",
    checkpointGapCount: 0,
    evidenceClass: upstream.evidenceClass,
    networkEnvironment: upstream.networkEnvironment,
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
  }));
}

async function parseJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

test("runs 31 exact cycles and persists an exclusive chained no-authority evidence set", async () => {
  const temporaryParent = await mkdtemp(
    path.join(os.tmpdir(), "m1-shadow-runtime-"),
  );
  const evidenceRoot = path.join(temporaryParent, "evidence");
  const upstream = upstreamBinding();
  const requests: PublicJsonRequest[] = [];
  let clockMs = START_MS;

  try {
    const result = await runM1MultiAssetShadowWorker({
      upstreamBinding: upstream,
      networkEnvironment: "TEST_HARNESS",
      evidenceRoot,
      workerRunId: "m1-shadow-runtime-test-31-cycles",
      listingWatchBindings: async () =>
        listingBindings(upstream, new Date(clockMs).toISOString()),
      transportImplementation: fixtureTransport({
        requests,
        currentMs: () => clockMs,
      }),
      now: () => new Date(clockMs),
      sleepImplementation: async (milliseconds) => {
        clockMs += milliseconds;
      },
      rssImplementation: () => 64 * 1024 * 1024,
    });

    assert.equal(
      requests.length,
      M1_MULTI_ASSET_SHADOW_PROFILE.cycleCount * 10,
    );
    assert.equal(result.cycles.length, 31);
    assert.equal(result.persistenceReceiptHashes.length, 31);
    assert.equal(result.checkpointReceiptHashes.length, 31);
    assert.equal(result.evidence.observationMs, 30 * 60_000);
    assert.equal(
      result.evidence.status,
      "TEST_ONLY_NOT_LIVE_EVIDENCE",
    );
    assert.equal(result.evidence.baseCollectionGate, "PASS");
    assert.equal(result.evidence.equityTradableFactGate, "BLOCKED");
    assert.equal(result.evidence.fullMultiAssetGate, "BLOCKED");
    assert.equal(
      result.evidence.axisPassCycleCounts.BITGET_VENUE,
      31,
    );
    assert.equal(
      result.evidence.axisPassCycleCounts.LISTING_LIFECYCLE,
      31,
    );
    assert.equal(
      result.evidence.axisPassCycleCounts.DATA_MAXIMIZATION,
      31,
    );
    assert.equal(
      result.evidence.axisPassCycleCounts.EQUITY_ASSET_DOMAIN,
      0,
    );
    assert.equal(result.authorityGranted, false);
    assert.equal(result.productionChanged, false);
    assert.equal(result.secretMaterialPresent, false);

    for (let index = 0; index < 31; index += 1) {
      const cycleIndex = index + 1;
      const directory = path.join(
        result.canonicalEvidenceRoot,
        `cycle-${String(cycleIndex).padStart(2, "0")}`,
      );
      assert.deepEqual((await readdir(directory)).sort(), [
        "base-fact-snapshot.json",
        "catalog-capture-binding.json",
        "checkpoint-receipt.json",
        "cycle.json",
        "identity-snapshot.json",
        "listing-watch-binding-bitget.json",
        "listing-watch-binding-bybit.json",
        "persistence-receipt.json",
      ]);
      const persistence =
        M1MultiAssetShadowPersistenceReceiptSchema.parse(
          await parseJson(path.join(directory, "persistence-receipt.json")),
        );
      const checkpoint =
        M1MultiAssetShadowCheckpointReceiptSchema.parse(
          await parseJson(path.join(directory, "checkpoint-receipt.json")),
        );
      const cycle = M1MultiAssetShadowCycleSchema.parse(
        await parseJson(path.join(directory, "cycle.json")),
      );
      assert.equal(
        persistence.previousReceiptHash,
        index === 0 ? null : result.persistenceReceiptHashes[index - 1],
      );
      assert.equal(
        checkpoint.previousCheckpointHash,
        index === 0 ? null : result.checkpointReceiptHashes[index - 1],
      );
      assert.equal(
        persistence.contentHash,
        result.persistenceReceiptHashes[index],
      );
      assert.equal(
        checkpoint.contentHash,
        result.checkpointReceiptHashes[index],
      );
      assert.equal(cycle.persistenceReceiptHash, persistence.contentHash);
      assert.equal(cycle.checkpointReceiptHash, checkpoint.contentHash);
      assert.equal(cycle.baseFactSnapshotHash, persistence.baseFactSnapshotHash);
      assert.equal(cycle.runtimeAuthorityGranted, false);
      assert.equal(cycle.productionChanged, false);
    }

    const persistedEvidence = M1MultiAssetShadowEvidenceSchema.parse(
      await parseJson(path.join(result.canonicalEvidenceRoot, "evidence.json")),
    );
    assert.equal(persistedEvidence.contentHash, result.evidence.contentHash);
    assert.deepEqual(
      persistedEvidence.cycleContentHashes,
      result.cycles.map((cycle) => cycle.contentHash),
    );

    const audit = await verifyM1MultiAssetShadowEvidenceStore({
      evidenceRoot: result.canonicalEvidenceRoot,
      upstreamBinding: upstream,
      expectedWorkerRunId: "m1-shadow-runtime-test-31-cycles",
      verifiedAt: new Date(clockMs).toISOString(),
    });
    assert.equal(audit.verification.verifiedFileCount, 249);
    assert.equal(
      audit.verification.verificationStatus,
      "PASS_EVIDENCE_INTEGRITY_NO_AUTHORITY",
    );
    assert.equal(audit.verification.componentAcceptanceGate, "BLOCKED");
    assert.equal(
      audit.verification.evidenceStatus,
      "TEST_ONLY_NOT_LIVE_EVIDENCE",
    );
    assert.equal(audit.authorityGranted, false);

    await appendFile(
      path.join(
        result.canonicalEvidenceRoot,
        "cycle-01",
        "identity-snapshot.json",
      ),
      "\n",
    );
    await assert.rejects(
      verifyM1MultiAssetShadowEvidenceStore({
        evidenceRoot: result.canonicalEvidenceRoot,
        upstreamBinding: upstream,
        expectedWorkerRunId: "m1-shadow-runtime-test-31-cycles",
        verifiedAt: new Date(clockMs).toISOString(),
      }),
      /persistence receipt does not bind disk bytes/u,
    );
  } finally {
    await rm(temporaryParent, { recursive: true, force: true });
  }
});

test("rejects an existing evidence root before collection instead of overwriting it", async () => {
  const temporaryParent = await mkdtemp(
    path.join(os.tmpdir(), "m1-shadow-existing-"),
  );
  const evidenceRoot = path.join(temporaryParent, "evidence");
  await mkdir(evidenceRoot);
  const requests: PublicJsonRequest[] = [];
  const upstream = upstreamBinding();
  try {
    await assert.rejects(
      runM1MultiAssetShadowWorker({
        upstreamBinding: upstream,
        networkEnvironment: "TEST_HARNESS",
        evidenceRoot,
        workerRunId: "must-not-overwrite",
        listingWatchBindings: [],
        transportImplementation: fixtureTransport({
          requests,
          currentMs: () => START_MS,
        }),
        now: () => new Date(START_MS),
        sleepImplementation: async () => undefined,
      }),
      /evidence root must not already exist/u,
    );
    assert.equal(requests.length, 0);
    assert.deepEqual(await readdir(evidenceRoot), []);
  } finally {
    await rm(temporaryParent, { recursive: true, force: true });
  }
});

test("rejects injected clocks or transports before they can masquerade as live evidence", async () => {
  const temporaryParent = await mkdtemp(
    path.join(os.tmpdir(), "m1-shadow-live-spoof-"),
  );
  const evidenceRoot = path.join(temporaryParent, "evidence");
  const requests: PublicJsonRequest[] = [];
  try {
    await assert.rejects(
      runM1MultiAssetShadowWorker({
        upstreamBinding: upstreamBinding("LIVE_READ_ONLY"),
        networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
        evidenceRoot,
        workerRunId: "must-not-be-live",
        listingWatchBindings: [],
        transportImplementation: fixtureTransport({
          requests,
          currentMs: () => START_MS,
        }),
        now: () => new Date(START_MS),
      }),
      /injected runtime implementations must remain TEST_ONLY/u,
    );
    assert.equal(requests.length, 0);
    await assert.rejects(readFile(path.join(evidenceRoot, "evidence.json")));
  } finally {
    await rm(temporaryParent, { recursive: true, force: true });
  }
});
