import assert from "node:assert/strict";
import test from "node:test";
import {
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
  type M1AssetDomain,
  type M1SourceId,
} from "../source-capability/source-capability-contract";
import {
  createM1MultiAssetObservation,
  deriveM1CanonicalInstrumentId,
  deriveM1IdentityEpoch,
  deriveM1ListingEpoch,
  buildM1MultiAssetCatalogCaptureBinding,
  buildM1MultiAssetCatalogVenueCapture,
  buildM1MultiAssetIdentitySnapshot,
  M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE,
  type M1MultiAssetInstrumentObservation,
} from "../multi-asset-universe/multi-asset-identity-contract";
import {
  M1_MULTI_ASSET_SHADOW_AXIS_IDS,
  M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
  M1MultiAssetShadowUpstreamBindingSchema,
  buildM1MultiAssetShadowCycle,
  type M1MultiAssetShadowUpstreamBinding,
} from "../shadow/m1-multi-asset-shadow-contract";
import {
  buildM1WideMarketVenueBatch,
  failedM1WideMarketComponent,
  parseM1WideMarketComponent,
  type M1WideMarketVenueBatch,
} from "./adapters/four-venue-wide-market-fact";
import {
  M1_LISTING_WATCH_BINDING_VERSION,
  M1MultiAssetBaseFactSnapshotSchema,
  buildM1BaseFactShadowAccounting,
  buildM1ListingWatchEvidenceBinding,
  buildM1MultiAssetBaseFactSnapshot,
  type M1ListingWatchEvidenceBinding,
} from "./multi-asset-base-fact-contract";
import { stableContentHash } from "../universe/stable-artifact";
import {
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
} from "../source-capability/adapters/four-venue-capability-registry";

const RELEASE = "d".repeat(40);
const REGISTRY_DIGEST =
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest;
const FIRST_OBSERVED_AT = "2026-07-26T23:00:00.000Z";
const IDENTITY_CUTOFF = "2026-07-27T00:00:00.000Z";
const EVENT_AT = "2026-07-27T00:00:02.000Z";
const RECEIVED_AT = "2026-07-27T00:00:03.000Z";
const SOURCE_CUTOFF = "2026-07-27T00:00:04.000Z";
const NORMALIZED_AT = "2026-07-27T00:00:05.000Z";
const GENERATED_AT = "2026-07-27T00:00:06.000Z";
const EVENT_MS = Date.parse(EVENT_AT);
const RESPONSE_HASH =
  "sha256:2222222222222222222222222222222222222222222222222222222222222222";

type VenueSourceId = Exclude<M1SourceId, "COINGLASS_V4">;

function upstreamBinding(
  evidenceClass: "LIVE_READ_ONLY" | "TEST_ONLY" = "TEST_ONLY",
): M1MultiAssetShadowUpstreamBinding {
  const live = evidenceClass === "LIVE_READ_ONLY";
  const core = {
    schemaVersion: M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: RELEASE,
    generatedAt: IDENTITY_CUTOFF,
    sourceCutoff: IDENTITY_CUTOFF,
    runtimeAdapterArtifactId: "runtime-adapter-live:base-fact-fixture",
    runtimeAdapterArtifactHash:
      "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    conformanceArtifactId: "source-conformance:base-fact-fixture",
    conformanceArtifactHash:
      "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    registryDigest: REGISTRY_DIGEST,
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

function instrument(input: {
  sourceId: VenueSourceId;
  venueInstrumentId: string;
  baseAsset?: string;
  assetDomain?: M1AssetDomain | null;
  identityStatus?: "EXACT" | "PARTIAL" | "UNRESOLVED";
  coverageClass?: "SUPPORTED_DERIVATIVE" | "ASSET_LISTING_WATCH";
  lifecycleState?:
    | "ANNOUNCED_WAITING_CATALOG"
    | "ESTABLISHED";
}): M1MultiAssetInstrumentObservation {
  const coverageClass = input.coverageClass ?? "SUPPORTED_DERIVATIVE";
  const watch = coverageClass === "ASSET_LISTING_WATCH";
  const identityStatus = input.identityStatus ?? (watch ? "PARTIAL" : "EXACT");
  const assetDomain = input.assetDomain === undefined
    ? (watch ? "ASSET_LISTING_WATCH" : "CRYPTO_LINEAR_PERPETUAL")
    : input.assetDomain;
  const baseAsset = watch ? null : (input.baseAsset ?? "BTC");
  const listingEpoch = deriveM1ListingEpoch({
    sourceId: input.sourceId,
    venueInstrumentId: input.venueInstrumentId,
    providerListTime: FIRST_OBSERVED_AT,
    firstObservedAt: FIRST_OBSERVED_AT,
  });
  const identityEpoch = deriveM1IdentityEpoch({
    sourceId: input.sourceId,
    venueInstrumentId: input.venueInstrumentId,
    listingEpoch,
    assetDomain,
    underlyingReferenceId: baseAsset,
  });
  const exact = identityStatus === "EXACT";
  return createM1MultiAssetObservation({
    coverageClass,
    assetDomain,
    sourceId: input.sourceId,
    venueInstrumentId: input.venueInstrumentId,
    canonicalInstrumentId: exact
      ? deriveM1CanonicalInstrumentId({
        sourceId: input.sourceId,
        venueInstrumentId: input.venueInstrumentId,
        identityEpoch,
      })
      : null,
    underlyingGroupId: exact
      ? `${M1_SCOPE_EPOCH}:${assetDomain}:${baseAsset}:USDT`
      : null,
    underlyingReferenceId: watch ? null : baseAsset,
    baseAsset,
    quoteAsset: watch ? null : "USDT",
    settlementAsset: watch ? null : "USDT",
    contractMechanism: watch ? "NONE_ASSET_WATCH" : "LINEAR_PERPETUAL",
    contractMultiplier: exact ? "1" : null,
    priceTick: exact ? "0.01" : null,
    quantityStep: exact ? "0.001" : null,
    listingEpoch,
    identityEpoch,
    identityStatus,
    classificationAuthority: assetDomain === null
      ? "UNRESOLVED"
      : "PROVIDER_EXPLICIT_CATEGORY",
    classificationEvidenceIds: [],
    providerStatus: watch ? "ANNOUNCED" : "TRADING",
    lifecycleState: input.lifecycleState ??
      (watch ? "ANNOUNCED_WAITING_CATALOG" : "ESTABLISHED"),
    providerListTime: FIRST_OBSERVED_AT,
    providerDelistTime: null,
    firstObservedAt: FIRST_OBSERVED_AT,
    statusEffectiveAt: FIRST_OBSERVED_AT,
    knowledgeTime: IDENTITY_CUTOFF,
    jurisdictionAvailability: "UNVERIFIED",
    sourceCapability: "DERIVATIVE_INSTRUMENT_CATALOG",
    sourceRecordDigest: stableContentHash({
      sourceId: input.sourceId,
      venueInstrumentId: input.venueInstrumentId,
    }),
    reasonCodes: identityStatus === "UNRESOLVED"
      ? ["fixture_identity_unresolved"]
      : identityStatus === "PARTIAL" && !watch
        ? ["fixture_identity_partial"]
        : [],
  });
}

function identities() {
  return [
    instrument({
      sourceId: "BINANCE_FUTURES",
      venueInstrumentId: "BTCUSDT",
    }),
    instrument({
      sourceId: "BINANCE_FUTURES",
      venueInstrumentId: "AAPLUSDT",
      baseAsset: "AAPL",
      assetDomain: "EQUITY_SINGLE_NAME_PERPETUAL",
    }),
    instrument({
      sourceId: "OKX_SWAP",
      venueInstrumentId: "BTC-USDT-SWAP",
    }),
    instrument({
      sourceId: "BYBIT_DERIVATIVES",
      venueInstrumentId: "BTCUSDT",
    }),
    instrument({
      sourceId: "BYBIT_DERIVATIVES",
      venueInstrumentId: "QQQUSDT",
      baseAsset: "QQQ",
      assetDomain: "EQUITY_INDEX_ETF_PERPETUAL",
    }),
    instrument({
      sourceId: "BITGET_FUTURES",
      venueInstrumentId: "BTCUSDT",
    }),
    instrument({
      sourceId: "BYBIT_DERIVATIVES",
      venueInstrumentId: "NEWCOIN",
      coverageClass: "ASSET_LISTING_WATCH",
    }),
    instrument({
      sourceId: "BITGET_FUTURES",
      venueInstrumentId: "NEWSTOCK",
      coverageClass: "ASSET_LISTING_WATCH",
    }),
    instrument({
      sourceId: "BINANCE_FUTURES",
      venueInstrumentId: "PARTIALUSDT",
      identityStatus: "PARTIAL",
    }),
    instrument({
      sourceId: "OKX_SWAP",
      venueInstrumentId: "UNKNOWN-USDT-SWAP",
      assetDomain: null,
      identityStatus: "UNRESOLVED",
    }),
  ];
}

function identitySnapshot(
  evidenceClass: "LIVE_READ_ONLY" | "TEST_ONLY" = "TEST_ONLY",
) {
  const observations = identities();
  const upstream = upstreamBinding(evidenceClass);
  const captures = M1_VENUE_SOURCE_IDS.map((sourceId) => {
    const venueObservations = observations.filter(
      (observation) => observation.sourceId === sourceId,
    );
    const normalizationStatus = venueObservations.some(
        (observation) => observation.identityStatus !== "EXACT",
      )
      ? "PARTIAL" as const
      : "PASS" as const;
    return buildM1MultiAssetCatalogVenueCapture({
      releaseId: RELEASE,
      registryDigest: REGISTRY_DIGEST,
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
        receivedAt: IDENTITY_CUTOFF,
        httpStatus: 200,
        responseBytes: venueObservations.length * 100,
        responseHash: stableContentHash(venueObservations),
        recordCount: venueObservations.length,
        nextPageAvailable: false,
        rawBodyRetained: false,
        secretMaterialPresent: false,
      }],
      rawRecordCount: venueObservations.length,
      observations: venueObservations,
      normalizationStatus,
      reasonCodes: venueObservations.flatMap(
        (observation) => observation.reasonCodes,
      ),
    });
  });
  const catalogCaptureBinding = buildM1MultiAssetCatalogCaptureBinding({
    releaseId: RELEASE,
    generatedAt: IDENTITY_CUTOFF,
    registryDigest: REGISTRY_DIGEST,
    upstreamBindingId: upstream.upstreamBindingId,
    upstreamBindingHash: upstream.contentHash,
    evidenceClass,
    networkEnvironment: upstream.networkEnvironment,
    venueCaptures: captures,
  });
  return buildM1MultiAssetIdentitySnapshot({
    releaseId: RELEASE,
    generatedAt: IDENTITY_CUTOFF,
    sourceCutoff: IDENTITY_CUTOFF,
    registryDigest: REGISTRY_DIGEST,
    catalogCaptureBinding,
    observations,
  });
}

function parsed(
  componentId: Parameters<typeof parseM1WideMarketComponent>[0]["componentId"],
  payload: unknown,
  receivedAt = RECEIVED_AT,
) {
  return parseM1WideMarketComponent({
    componentId,
    payload,
    receivedAt,
    responseHash: RESPONSE_HASH,
    responseBytes: 1_024,
  });
}

function binancePremiumRows(eventMs: number) {
  return ["BTCUSDT", "AAPLUSDT"].map((symbol, index) => ({
    symbol,
    markPrice: String(100 + index),
    indexPrice: String(99 + index),
    lastFundingRate: index === 0 ? "0.0001" : "-0.0001",
    time: eventMs,
  }));
}

function binanceTickerRows(eventMs: number) {
  return ["BTCUSDT", "AAPLUSDT"].map((symbol, index) => ({
    symbol,
    lastPrice: String(101 + index),
    bidPrice: String(100 + index),
    askPrice: String(102 + index),
    volume: String(1_000 + index),
    quoteVolume: String(100_000 + index),
    closeTime: eventMs,
  }));
}

function bybitRows() {
  return ["BTCUSDT", "QQQUSDT"].map((symbol, index) => ({
    symbol,
    lastPrice: String(201 + index),
    markPrice: String(200 + index),
    indexPrice: String(199 + index),
    bid1Price: String(200 + index),
    ask1Price: String(202 + index),
    fundingRate: index === 0 ? "0.0001" : "-0.0001",
    openInterest: String(20_000 + index),
    volume24h: String(900 + index),
    turnover24h: String(180_000 + index),
  }));
}

function venueBatches(input: {
  eventMs?: number;
  omitBybitQqq?: boolean;
  bitgetFailure?: boolean;
} = {}): readonly M1WideMarketVenueBatch[] {
  const eventMs = input.eventMs ?? EVENT_MS;
  const binance = buildM1WideMarketVenueBatch({
    sourceId: "BINANCE_FUTURES",
    components: [
      parsed("BINANCE_PREMIUM_INDEX", binancePremiumRows(eventMs)),
      parsed("BINANCE_TICKER_24H", binanceTickerRows(eventMs)),
    ],
  });
  const okx = buildM1WideMarketVenueBatch({
    sourceId: "OKX_SWAP",
    components: [
      parsed("OKX_TICKERS", {
        code: "0",
        data: [{
          instId: "BTC-USDT-SWAP",
          last: "301",
          bidPx: "300",
          askPx: "302",
          volCcy24h: "800",
          ts: String(eventMs),
        }],
      }),
      parsed("OKX_MARK_PRICE", {
        code: "0",
        data: [{
          instId: "BTC-USDT-SWAP",
          markPx: "300",
          ts: String(eventMs),
        }],
      }),
    ],
  });
  const bybit = buildM1WideMarketVenueBatch({
    sourceId: "BYBIT_DERIVATIVES",
    components: [
      parsed("BYBIT_TICKERS", {
        retCode: 0,
        time: eventMs,
        result: {
          category: "linear",
          list: input.omitBybitQqq ? bybitRows().slice(0, 1) : bybitRows(),
        },
      }),
    ],
  });
  const bitgetComponent = input.bitgetFailure
    ? failedM1WideMarketComponent({
      componentId: "BITGET_TICKERS",
      receivedAt: RECEIVED_AT,
      failure: {
        kind: "RATE_LIMITED",
        reasonCode: "provider_http_429",
      },
    })
    : parsed("BITGET_TICKERS", {
      code: "00000",
      requestTime: eventMs,
      data: [{
        symbol: "BTCUSDT",
        lastPr: "401",
        markPrice: "400",
        indexPrice: "399",
        bidPr: "400",
        askPr: "402",
        fundingRate: "0.0002",
        holdingAmount: "18000",
        baseVolume: "700",
        quoteVolume: "280000",
        ts: String(eventMs),
      }],
    });
  const bitget = buildM1WideMarketVenueBatch({
    sourceId: "BITGET_FUTURES",
    components: [bitgetComponent],
  });
  return [bitget, bybit, okx, binance];
}

function listingBindings(
  evidenceClass: "LIVE_READ_ONLY" | "TEST_ONLY" = "TEST_ONLY",
): readonly M1ListingWatchEvidenceBinding[] {
  const upstream = upstreamBinding(evidenceClass);
  const sources = [
    "BYBIT_DERIVATIVES",
    "BITGET_FUTURES",
  ] as const;
  return sources.map((sourceId) => buildM1ListingWatchEvidenceBinding({
    schemaVersion: M1_LISTING_WATCH_BINDING_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: RELEASE,
    upstreamBindingId: upstream.upstreamBindingId,
    upstreamBindingHash: upstream.contentHash,
    sourceId,
    evidenceId: `listing-checkpoint:${sourceId}`,
    evidenceHash: sourceId === "BYBIT_DERIVATIVES"
      ? "sha256:3333333333333333333333333333333333333333333333333333333333333333"
      : "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    sourceCutoff: RECEIVED_AT,
    status: "COMMITTED_NO_GAP",
    checkpointGapCount: 0,
    evidenceClass,
    networkEnvironment: upstream.networkEnvironment,
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
  }));
}

function build(input: {
  batches?: readonly M1WideMarketVenueBatch[];
  sourceCutoff?: string;
  maxAgeMs?: number;
  bindings?: readonly M1ListingWatchEvidenceBinding[];
  evidenceClass?: "LIVE_READ_ONLY" | "TEST_ONLY";
} = {}) {
  const evidenceClass = input.evidenceClass ?? "TEST_ONLY";
  return buildM1MultiAssetBaseFactSnapshot({
    releaseId: RELEASE,
    generatedAt: GENERATED_AT,
    sourceCutoff: input.sourceCutoff ?? SOURCE_CUTOFF,
    normalizedAt: NORMALIZED_AT,
    upstreamBinding: upstreamBinding(evidenceClass),
    identitySnapshot: identitySnapshot(evidenceClass),
    venueBatches: input.batches ?? venueBatches(),
    listingWatchBindings: input.bindings ?? listingBindings(evidenceClass),
    maxAgeMs: input.maxAgeMs,
  });
}

test("identity and Fact accounting retain exact, partial and unresolved denominators", () => {
  const identity = identitySnapshot();
  assert.equal(identity.observedCount, 10);
  assert.equal(identity.exactIdentityCount, 6);
  assert.equal(identity.partialIdentityCount, 3);
  assert.equal(identity.unresolvedIdentityCount, 1);

  const snapshot = build();
  assert.equal(snapshot.observedSubjectCount, 10);
  assert.equal(snapshot.routeEligibleCount, 8);
  assert.equal(snapshot.routeBlockedCount, 2);
  assert.equal(snapshot.scheduledCount, 8);
  assert.equal(snapshot.attemptedCount, 8);
  assert.equal(snapshot.freshCount, 8);
  assert.equal(snapshot.qualityCounts.UNAVAILABLE, 2);
  assert.equal(
    snapshot.status,
    "TEST_ONLY_NO_LIVE_FACT_EVIDENCE",
  );
  assert.equal(snapshot.evidenceClass, "TEST_ONLY");
  assert.equal(snapshot.networkEnvironment, "TEST_HARNESS");
  assert.equal(snapshot.facts.length, identity.observations.length);
  assert.equal(snapshot.rawBodyRetained, false);
  assert.equal(snapshot.secretMaterialPresent, false);
  assert.equal(
    M1MultiAssetBaseFactSnapshotSchema.parse(snapshot).contentHash,
    snapshot.contentHash,
  );
});

test("feeds exact four-Venue, unresolved-domain and lifecycle accounting into Shadow", () => {
  const snapshot = build();
  const accounting = buildM1BaseFactShadowAccounting(snapshot);
  assert.deepEqual(
    accounting.venues.map((row) => row.venue),
    [
      "BINANCE_FUTURES",
      "OKX_SWAP",
      "BYBIT_DERIVATIVES",
      "BITGET_FUTURES",
    ],
  );
  assert.equal(
    accounting.venues.reduce(
      (total, row) => total + row.partialIdentityCount,
      0,
    ),
    3,
  );
  assert.equal(
    accounting.assetDomains.find(
      (row) => row.assetDomain === "UNRESOLVED",
    )?.observedSubjectCount,
    1,
  );
  const cycle = buildM1MultiAssetShadowCycle({
    releaseId: RELEASE,
    upstreamBindingId: "upstream:fixture",
    upstreamBindingHash:
      "sha256:5555555555555555555555555555555555555555555555555555555555555555",
    catalogCaptureBindingId: snapshot.catalogCaptureBindingId,
    catalogCaptureBindingHash: snapshot.catalogCaptureBindingHash,
    identitySnapshotId: snapshot.identitySnapshotId,
    identitySnapshotHash: snapshot.identitySnapshotHash,
    baseFactSnapshotId: snapshot.snapshotId,
    baseFactSnapshotHash: snapshot.contentHash,
    workerRunId: "base-fact-shadow-fixture",
    runtimeConfigDigest:
      "sha256:6666666666666666666666666666666666666666666666666666666666666666",
    cycleIndex: 1,
    scheduledAt: "2026-07-27T00:00:00.000Z",
    startedAt: "2026-07-27T00:00:00.100Z",
    sourceCutoff: SOURCE_CUTOFF,
    completedAt: "2026-07-27T00:00:05.000Z",
    scheduleLagMs: 100,
    durationMs: 4_900,
    missedScheduleStarts: 0,
    rssBytes: 128 * 1024 * 1024,
    checkpointStatus: "COMMITTED",
    checkpointReceiptId: "checkpoint-receipt:base-fact-fixture",
    checkpointReceiptHash:
      "sha256:7777777777777777777777777777777777777777777777777777777777777777",
    persistenceStatus: "COMMITTED",
    persistenceReceiptId: "persistence-receipt:base-fact-fixture",
    persistenceReceiptHash:
      "sha256:8888888888888888888888888888888888888888888888888888888888888888",
    venues: accounting.venues.map((row) => ({
      ...row,
      reasonCodes: [...row.reasonCodes],
    })),
    assetDomains: accounting.assetDomains.map((row) => ({
      ...row,
      reasonCodes: [...row.reasonCodes],
    })),
    lifecycleStates: accounting.lifecycleStates.map((row) => ({
      ...row,
      reasonCodes: [...row.reasonCodes],
    })),
    listingCheckpoint: {
      ...accounting.listingCheckpoint,
      reasonCodes: [...accounting.listingCheckpoint.reasonCodes],
    },
    rawBodyRetained: false,
    secretMaterialPresent: false,
    runtimeAuthorityGranted: false,
    factAuthorityGranted: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    productionChanged: false,
  });
  assert.equal(cycle.aggregate.observedSubjectCount, 10);
  assert.equal(cycle.aggregate.partialIdentityCount, 3);
  assert.equal(cycle.status, "PASS_ALL_REQUIRED_AXES_NO_AUTHORITY");
});

test("only exact live upstream evidence can receive the live base-Fact PASS", () => {
  const snapshot = build({ evidenceClass: "LIVE_READ_ONLY" });
  assert.equal(snapshot.evidenceClass, "LIVE_READ_ONLY");
  assert.equal(
    snapshot.networkEnvironment,
    "TENCENT_ISOLATED_READ_ONLY",
  );
  assert.equal(
    snapshot.status,
    "PASS_ALL_ROUTE_ELIGIBLE_FACTS_FRESH_NO_AUTHORITY",
  );
  assert.ok(
    snapshot.facts.every(
      (fact) =>
        fact.evidenceClass === "LIVE_READ_ONLY" &&
        fact.upstreamBindingHash === snapshot.upstreamBindingHash,
    ),
  );
});

test("missing market rows remain explicit unavailable facts without denominator shrink", () => {
  const snapshot = build({
    batches: venueBatches({ omitBybitQqq: true }),
    evidenceClass: "LIVE_READ_ONLY",
  });
  const qqq = snapshot.facts.find(
    (fact) => fact.venueInstrumentId === "QQQUSDT",
  )!;
  assert.equal(qqq.qualityStatus, "UNAVAILABLE");
  assert.ok(
    qqq.reasonCodes.includes(
      "venue_instrument_missing_from_wide_market_snapshot",
    ),
  );
  assert.equal(snapshot.observedSubjectCount, 10);
  assert.equal(snapshot.routeEligibleCount, 8);
  assert.equal(snapshot.freshCount, 7);
  assert.equal(snapshot.qualityCounts.UNAVAILABLE, 3);
  assert.equal(snapshot.status, "PARTIAL_OR_BLOCKED_NO_STALE_PROMOTION");
});

test("provider failure and stale event time never promote to fresh", () => {
  const failed = build({
    batches: venueBatches({ bitgetFailure: true }),
    evidenceClass: "LIVE_READ_ONLY",
  });
  const bitget = failed.facts.find(
    (fact) =>
      fact.sourceId === "BITGET_FUTURES" &&
      fact.venueInstrumentId === "BTCUSDT",
  )!;
  assert.equal(bitget.qualityStatus, "RATE_LIMITED");
  assert.deepEqual(bitget.providerFailureKinds, ["RATE_LIMITED"]);
  assert.equal(failed.providerFailureSubjectCount, 1);
  assert.equal(failed.componentFailureCount, 1);

  const stale = build({
    batches: venueBatches({
      eventMs: Date.parse("2026-07-26T23:59:00.000Z"),
    }),
    maxAgeMs: 15_000,
    evidenceClass: "LIVE_READ_ONLY",
  });
  assert.equal(stale.freshCount, 2);
  assert.equal(stale.qualityCounts.STALE, 6);
  assert.equal(stale.status, "PARTIAL_OR_BLOCKED_NO_STALE_PROMOTION");
});

test("listing watch cannot claim fresh collection without an exact checkpoint binding", () => {
  const snapshot = build({
    bindings: [],
    evidenceClass: "LIVE_READ_ONLY",
  });
  const listingFacts = snapshot.facts.filter(
    (fact) => fact.coverageClass === "ASSET_LISTING_WATCH",
  );
  assert.equal(listingFacts.length, 2);
  assert.ok(listingFacts.every((fact) => !fact.attempted));
  assert.ok(
    listingFacts.every((fact) => fact.qualityStatus === "UNAVAILABLE"),
  );
  assert.equal(snapshot.attemptedCount, 6);
  assert.equal(snapshot.status, "PARTIAL_OR_BLOCKED_NO_STALE_PROMOTION");
});

test("snapshot rejects a later identity cutoff and duplicate Venue batches", () => {
  const snapshot = identitySnapshot();
  assert.throws(
    () =>
      buildM1MultiAssetBaseFactSnapshot({
        releaseId: RELEASE,
        generatedAt: GENERATED_AT,
        sourceCutoff: "2026-07-26T23:59:59.000Z",
        normalizedAt: NORMALIZED_AT,
        upstreamBinding: upstreamBinding(),
        identitySnapshot: snapshot,
        venueBatches: venueBatches(),
      }),
    /chronology is invalid/u,
  );
  const batches = venueBatches();
  assert.throws(
    () =>
      buildM1MultiAssetBaseFactSnapshot({
        releaseId: RELEASE,
        generatedAt: GENERATED_AT,
        sourceCutoff: SOURCE_CUTOFF,
        normalizedAt: NORMALIZED_AT,
        upstreamBinding: upstreamBinding(),
        identitySnapshot: snapshot,
        venueBatches: [batches[0]!, batches[0]!, batches[1]!, batches[2]!],
      }),
    /one and only one wide-market batch/u,
  );
});

test("rejects stale registry lineage and mixed listing evidence classes", () => {
  const current = identitySnapshot();
  const staleRegistry = {
    ...current,
    registryDigest:
      "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  };
  const staleContentHash = stableContentHash({
    scopeEpoch: staleRegistry.scopeEpoch,
    releaseId: staleRegistry.releaseId,
    generatedAt: staleRegistry.generatedAt,
    sourceCutoff: staleRegistry.sourceCutoff,
    registryDigest: staleRegistry.registryDigest,
    upstreamBindingId: staleRegistry.upstreamBindingId,
    upstreamBindingHash: staleRegistry.upstreamBindingHash,
    catalogCaptureBindingId: staleRegistry.catalogCaptureBindingId,
    catalogCaptureBindingHash: staleRegistry.catalogCaptureBindingHash,
    evidenceClass: staleRegistry.evidenceClass,
    networkEnvironment: staleRegistry.networkEnvironment,
    venueDenominator: staleRegistry.venueDenominator,
    observedCount: staleRegistry.observedCount,
    exactIdentityCount: staleRegistry.exactIdentityCount,
    partialIdentityCount: staleRegistry.partialIdentityCount,
    unresolvedIdentityCount: staleRegistry.unresolvedIdentityCount,
    countsByVenue: staleRegistry.countsByVenue,
    countsByAssetDomain: staleRegistry.countsByAssetDomain,
    observations: staleRegistry.observations,
    status: staleRegistry.status,
    authorityBoundary: staleRegistry.authorityBoundary,
    productionChanged: staleRegistry.productionChanged,
  });
  assert.throws(
    () =>
      buildM1MultiAssetBaseFactSnapshot({
        releaseId: RELEASE,
        generatedAt: GENERATED_AT,
        sourceCutoff: SOURCE_CUTOFF,
        normalizedAt: NORMALIZED_AT,
        upstreamBinding: upstreamBinding(),
        identitySnapshot: {
          ...staleRegistry,
          snapshotId: `multi-asset-identity:${staleContentHash.slice(7, 31)}`,
          contentHash: staleContentHash,
        },
        venueBatches: venueBatches(),
      }),
    /release binding or point-in-time chronology is invalid/u,
  );

  assert.throws(
    () =>
      buildM1MultiAssetBaseFactSnapshot({
        releaseId: RELEASE,
        generatedAt: GENERATED_AT,
        sourceCutoff: SOURCE_CUTOFF,
        normalizedAt: NORMALIZED_AT,
        upstreamBinding: upstreamBinding("LIVE_READ_ONLY"),
        identitySnapshot: identitySnapshot("LIVE_READ_ONLY"),
        venueBatches: venueBatches(),
        listingWatchBindings: listingBindings("TEST_ONLY"),
      }),
    /listing watch bindings must be unique and release-exact/u,
  );
});
