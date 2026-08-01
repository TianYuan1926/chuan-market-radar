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
  buildM1RuntimeAdapterProfileSet,
  type M1RuntimeAdapterProfile,
} from "../collector/runtime-adapter-profile";
import {
  M1_LISTING_WATCH_BINDING_VERSION,
  buildM1ListingWatchEvidenceBinding,
} from "../market-fact/multi-asset-base-fact-contract";
import {
  M1_SCOPE_EPOCH,
} from "../source-capability/source-capability-contract";
import {
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
} from "../source-capability/adapters/four-venue-capability-registry";
import {
  M1_EXACT_SOURCE_ENDPOINT_DEFINITIONS,
  M1_EXACT_SOURCE_PROBE_PLAN_DIGEST,
} from "../source-conformance/adapters/exact-source-conformance-runner";
import {
  M1SourceConformanceProbeObservationSchema,
  buildM1SourceConformanceArtifact,
} from "../source-conformance/source-conformance-contract";
import {
  advanceM1ListingHistory,
  buildM1ListingHistoryRequest,
  parseM1ListingHistoryPage,
  type M1ListingHistoryCheckpoint,
} from "../multi-asset-universe/listing-history-runtime";
import {
  M1ListingWatchRefreshBatchSchema,
  type M1ListingWatchRefreshBatch,
  type M1ListingWatchRefreshResult,
} from "../multi-asset-universe/m1-listing-watch-live-runtime";
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
import {
  buildM2ListingVenueEventRuntimeEvidenceFromM15cAudit,
} from "../detection/m2-listing-venue-event-runtime-evidence";

const RELEASE = "f".repeat(40);
const CONFORMANCE_RELEASE = "e".repeat(40);
const START_MS = Date.parse("2026-07-27T02:00:00.000Z");

function conformanceArtifact() {
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
        attemptStartedAt: "2026-07-27T01:58:58.000Z",
        receivedAt: "2026-07-27T01:58:59.000Z",
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
    generatedAt: "2026-07-27T01:58:59.000Z",
    sourceCutoff: "2026-07-27T01:58:59.000Z",
    registryDigest:
      M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest,
    probePlanDigest: M1_EXACT_SOURCE_PROBE_PLAN_DIGEST,
    evidenceClass: "LIVE_READ_ONLY",
    networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
    probes,
  });
}

function profileSet() {
  return buildM1RuntimeAdapterProfileSet({
    runtimeReleaseId: RELEASE,
    generatedAt: "2026-07-27T01:59:00.000Z",
    conformanceArtifact: conformanceArtifact(),
  });
}

function upstreamBinding(
  evidenceClass: "LIVE_READ_ONLY" | "TEST_ONLY" = "TEST_ONLY",
) {
  const live = evidenceClass === "LIVE_READ_ONLY";
  const profiles = profileSet();
  const core = {
    schemaVersion: M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: RELEASE,
    generatedAt: "2026-07-27T01:59:58.000Z",
    sourceCutoff: "2026-07-27T01:59:58.000Z",
    runtimeAdapterArtifactId: "runtime-adapter-live:shadow-worker-fixture",
    runtimeAdapterArtifactHash:
      "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    conformanceArtifactId: profiles.conformanceArtifactId,
    conformanceArtifactHash: profiles.conformanceArtifactHash,
    registryDigest:
      M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest,
    profileSetHash: profiles.contentHash,
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

type ListingSourceId = "BITGET_FUTURES" | "BYBIT_DERIVATIVES";

function listingProfile(
  profiles: ReturnType<typeof profileSet>,
  sourceId: ListingSourceId,
): M1RuntimeAdapterProfile {
  const profile = profiles.profiles.find(
    (candidate) =>
      candidate.sourceId === sourceId &&
      candidate.capabilityId === "LISTING_ANNOUNCEMENT",
  );
  assert.ok(profile);
  return profile;
}

function listingPayload(sourceId: ListingSourceId): unknown {
  if (sourceId === "BYBIT_DERIVATIVES") {
    return {
      retCode: 0,
      result: {
        total: 1,
        list: [{
          title: "Fixture derivative listing",
          type: { key: "new_crypto" },
          tags: ["Derivatives"],
          url: "https://announcements.bybit.com/en-US/article/shadow-fixture",
          publishTime: START_MS - 120_000,
        }],
      },
      time: START_MS,
    };
  }
  return {
    code: "00000",
    requestTime: START_MS,
    data: [{
      annId: "shadow-fixture-bitget",
      annTitle: "Fixture futures listing",
      annUrl:
        "https://www.bitget.com/support/articles/shadow-fixture-bitget",
      cTime: String(START_MS - 120_000),
      annType: "coin_listings",
      annSubType: "futures",
    }],
  };
}

function listingPage(input: {
  profile: M1RuntimeAdapterProfile;
  sourceId: ListingSourceId;
  mode: "BOOTSTRAP" | "INCREMENTAL";
  requestToken: string;
  receivedAt: string;
}) {
  const payload = listingPayload(input.sourceId);
  return parseM1ListingHistoryPage({
    profile: input.profile,
    mode: input.mode,
    pageOrdinal: 1,
    requestToken: input.requestToken,
    receivedAt: input.receivedAt,
    responseBodyHash: stableContentHash(payload),
    payload,
  });
}

function initialListingCheckpoints(input: {
  profiles: ReturnType<typeof profileSet>;
  sourceCutoff: string;
}): readonly M1ListingHistoryCheckpoint[] {
  return (
    ["BITGET_FUTURES", "BYBIT_DERIVATIVES"] as const
  ).map((sourceId) => {
    const profile = listingProfile(input.profiles, sourceId);
    const page = listingPage({
      profile,
      sourceId,
      mode: "BOOTSTRAP",
      requestToken: sourceId === "BYBIT_DERIVATIVES" ? "page:1" : "ROOT",
      receivedAt: input.sourceCutoff,
    });
    const advance = advanceM1ListingHistory({
      profile,
      mode: "BOOTSTRAP",
      priorCheckpoint: null,
      pages: [page],
      segmentStop: "SOURCE_TERMINAL",
      generatedAt: input.sourceCutoff,
      sourceCutoff: input.sourceCutoff,
    });
    assert.equal(advance.status, "COMMITTED");
    return advance.checkpoint;
  });
}

function listingRefreshBatch(input: {
  profiles: ReturnType<typeof profileSet>;
  upstream: ReturnType<typeof upstreamBinding>;
  priorCheckpoints: readonly M1ListingHistoryCheckpoint[];
  sourceCutoff: string;
}): M1ListingWatchRefreshBatch {
  const results: M1ListingWatchRefreshResult[] = (
    ["BITGET_FUTURES", "BYBIT_DERIVATIVES"] as const
  ).map((sourceId) => {
    const profile = listingProfile(input.profiles, sourceId);
    const prior = input.priorCheckpoints.find(
      (checkpoint) => checkpoint.sourceId === sourceId,
    );
    assert.ok(prior);
    const request = buildM1ListingHistoryRequest({
      profile,
      mode: "INCREMENTAL",
      checkpoint: prior,
    });
    const page = listingPage({
      profile,
      sourceId,
      mode: "INCREMENTAL",
      requestToken: request.requestToken,
      receivedAt: input.sourceCutoff,
    });
    const advance = advanceM1ListingHistory({
      profile,
      mode: "INCREMENTAL",
      priorCheckpoint: prior,
      pages: [page],
      segmentStop: "PRIOR_CHECKPOINT_OVERLAP",
      generatedAt: input.sourceCutoff,
      sourceCutoff: input.sourceCutoff,
    });
    assert.equal(advance.status, "COMMITTED");
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
    return {
      sourceId,
      status: "COMMITTED",
      requestCount: 1,
      responseBytes: 1_000,
      priorCheckpointId: prior.checkpointId,
      priorCheckpointHash: prior.contentHash,
      pages: [page],
      advance,
      checkpoint,
      binding,
      reasonCodes: [],
      rawBodyRetained: false,
      secretMaterialPresent: false,
      authorityGranted: false,
      productionChanged: false,
    };
  });
  return M1ListingWatchRefreshBatchSchema.parse({
    results,
    bindings: results.map((result) => result.binding!),
    checkpoints: results.map((result) => result.checkpoint!),
    allCommitted: true,
    requestCount: 2,
    responseBytes: 2_000,
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
    productionChanged: false,
  });
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
  const profiles = profileSet();
  const initialCheckpoints = initialListingCheckpoints({
    profiles,
    sourceCutoff: new Date(START_MS - 60_000).toISOString(),
  });
  let listingCheckpoints = [...initialCheckpoints];
  const requests: PublicJsonRequest[] = [];
  let clockMs = START_MS;

  try {
    const result = await runM1MultiAssetShadowWorker({
      upstreamBinding: upstream,
      networkEnvironment: "TEST_HARNESS",
      evidenceRoot,
      workerRunId: "m1-shadow-runtime-test-31-cycles",
      initialListingCheckpoints: initialCheckpoints,
      listingWatchRefreshBatch: async () => {
        const batch = listingRefreshBatch({
          profiles,
          upstream,
          priorCheckpoints: listingCheckpoints,
          sourceCutoff: new Date(clockMs).toISOString(),
        });
        listingCheckpoints = [...batch.checkpoints];
        return batch;
      },
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
    assert.equal(result.listingWatchRefreshBatchHashes.length, 31);
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
        "listing-watch-refresh-batch.json",
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
      assert.equal(
        persistence.listingWatchRefreshBatchHash,
        result.listingWatchRefreshBatchHashes[index],
      );
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
      initialListingCheckpoints: initialCheckpoints,
      verifiedAt: new Date(clockMs).toISOString(),
    });
    assert.equal(audit.verification.verifiedFileCount, 280);
    assert.equal(audit.listingWatchRefreshBatches.length, 31);
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

    const listingRuntimeEvidence =
      buildM2ListingVenueEventRuntimeEvidenceFromM15cAudit({
        upstreamBinding: upstream,
        registry: M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
        audit,
        generatedAt: new Date(clockMs + 1).toISOString(),
      });
    assert.equal(
      listingRuntimeEvidence.runtimeEvidence.status,
      "TEST_ONLY_UPSTREAM_EVIDENCE_JOIN_NO_RUNTIME_AUTHORITY",
    );
    assert.equal(
      listingRuntimeEvidence.runtimeEvidence
        .sourceAudit.sourceListingRefreshBatchHash,
      audit.verification.lastListingWatchRefreshBatchHash,
    );
    assert.equal(
      listingRuntimeEvidence.runtimeEvidence.candidateEmissionAllowed,
      false,
    );
    assert.equal(
      listingRuntimeEvidence.runtimeEvidence.productionRuntimeAllowed,
      false,
    );

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
        initialListingCheckpoints: initialCheckpoints,
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
        initialListingCheckpoints: [],
        listingWatchRefreshBatch: {} as M1ListingWatchRefreshBatch,
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

test("rejects a refresh batch whose prior checkpoint was spliced from another chain", async () => {
  const temporaryParent = await mkdtemp(
    path.join(os.tmpdir(), "m1-shadow-listing-splice-"),
  );
  const evidenceRoot = path.join(temporaryParent, "evidence");
  const upstream = upstreamBinding();
  const profiles = profileSet();
  const initialCheckpoints = initialListingCheckpoints({
    profiles,
    sourceCutoff: new Date(START_MS - 60_000).toISOString(),
  });
  const validBatch = listingRefreshBatch({
    profiles,
    upstream,
    priorCheckpoints: initialCheckpoints,
    sourceCutoff: new Date(START_MS).toISOString(),
  });
  const tamperedBatch = {
    ...validBatch,
    results: validBatch.results.map((result, index) =>
      index === 0
        ? { ...result, priorCheckpointHash: stableContentHash({ splice: true }) }
        : result
    ),
  };
  const requests: PublicJsonRequest[] = [];
  try {
    await assert.rejects(
      runM1MultiAssetShadowWorker({
        upstreamBinding: upstream,
        networkEnvironment: "TEST_HARNESS",
        evidenceRoot,
        workerRunId: "reject-listing-checkpoint-splice",
        initialListingCheckpoints: initialCheckpoints,
        listingWatchRefreshBatch: tamperedBatch,
        transportImplementation: fixtureTransport({
          requests,
          currentMs: () => START_MS,
        }),
        now: () => new Date(START_MS),
        sleepImplementation: async () => undefined,
      }),
      /listing refresh checkpoint continuity drifted/u,
    );
    assert.equal(requests.length, 0);
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
        initialListingCheckpoints: [],
        listingWatchRefreshBatch: {} as M1ListingWatchRefreshBatch,
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
