import assert from "node:assert/strict";
import test from "node:test";
import {
  buildM1MultiAssetBaseFactSnapshot,
  buildM1ListingWatchEvidenceBinding,
  M1_LISTING_WATCH_BINDING_VERSION,
} from "../market-fact/multi-asset-base-fact-contract";
import {
  buildM1WideMarketVenueBatch,
  parseM1WideMarketComponent,
  type M1WideMarketVenueBatch,
} from "../market-fact/adapters/four-venue-wide-market-fact";
import {
  buildM1MultiAssetCatalogCaptureBinding,
  buildM1MultiAssetCatalogVenueCapture,
  buildM1MultiAssetIdentitySnapshot,
  createM1MultiAssetObservation,
  deriveM1CanonicalInstrumentId,
  deriveM1IdentityEpoch,
  deriveM1ListingEpoch,
  M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE,
  type M1MultiAssetIdentitySnapshot,
  type M1MultiAssetInstrumentObservation,
} from "../multi-asset-universe/multi-asset-identity-contract";
import {
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
  type M1SourceId,
} from "../source-capability/source-capability-contract";
import {
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
} from "../source-capability/adapters/four-venue-capability-registry";
import {
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M1_MULTI_ASSET_SHADOW_AXIS_IDS,
  M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
  M1MultiAssetShadowUpstreamBindingSchema,
  type M1MultiAssetShadowUpstreamBinding,
} from "./m1-multi-asset-shadow-contract";
import {
  buildM1MicrostructureForwardRuntimeSelection,
} from "./m1-microstructure-forward-selection-runtime";

const RELEASE = "8".repeat(40);
const FIRST_OBSERVED_AT = "2026-07-26T00:00:00.000Z";
const UPSTREAM_AT = "2026-07-27T00:00:00.000Z";
const IDENTITY_AT = "2026-07-27T00:00:01.000Z";
const EVENT_AT = "2026-07-27T00:00:02.000Z";
const RECEIVED_AT = "2026-07-27T00:00:03.000Z";
const BASE_FACT_CUTOFF = "2026-07-27T00:00:04.000Z";
const NORMALIZED_AT = "2026-07-27T00:00:05.000Z";
const BASE_FACT_GENERATED_AT = "2026-07-27T00:00:06.000Z";
const SELECTION_GENERATED_AT = "2026-07-27T00:00:07.000Z";
const SELECTION_CUTOFF = "2026-07-27T00:00:08.000Z";
const WINDOW_STARTS_AT = "2026-07-27T00:00:09.000Z";
const WINDOW_ENDS_AT = "2026-07-27T00:31:09.000Z";
const EVENT_MS = Date.parse(EVENT_AT);
const REGISTRY_DIGEST =
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest;
const ASSETS = ["BTC", "ETH", "SOL", "XRP"] as const;
type VenueSourceId = Exclude<M1SourceId, "COINGLASS_V4">;

function upstreamBinding(): M1MultiAssetShadowUpstreamBinding {
  const core = {
    schemaVersion: M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: RELEASE,
    generatedAt: UPSTREAM_AT,
    sourceCutoff: UPSTREAM_AT,
    runtimeAdapterArtifactId: "runtime-adapter-live:selection-fixture",
    runtimeAdapterArtifactHash:
      "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    conformanceArtifactId: "source-conformance:selection-fixture",
    conformanceArtifactHash:
      "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    registryDigest: REGISTRY_DIGEST,
    profileSetHash:
      "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    evidenceClass: "TEST_ONLY" as const,
    networkEnvironment: "TEST_HARNESS" as const,
    runtimeAdapterStatus: "TEST_ONLY_NOT_LIVE_EVIDENCE" as const,
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

function venueInstrumentId(sourceId: VenueSourceId, asset: string): string {
  return sourceId === "OKX_SWAP"
    ? `${asset}-USDT-SWAP`
    : `${asset}USDT`;
}

function instrument(input: {
  sourceId: VenueSourceId;
  asset: string;
  missingOkxRouting?: boolean;
  knowledgeTime?: string;
}): M1MultiAssetInstrumentObservation {
  const instrumentId = venueInstrumentId(input.sourceId, input.asset);
  const listingEpoch = deriveM1ListingEpoch({
    sourceId: input.sourceId,
    venueInstrumentId: instrumentId,
    providerListTime: FIRST_OBSERVED_AT,
    firstObservedAt: FIRST_OBSERVED_AT,
  });
  const identityEpoch = deriveM1IdentityEpoch({
    sourceId: input.sourceId,
    venueInstrumentId: instrumentId,
    listingEpoch,
    assetDomain: "CRYPTO_LINEAR_PERPETUAL",
    underlyingReferenceId: input.asset,
  });
  const okxReference =
    input.sourceId === "OKX_SWAP" && !input.missingOkxRouting
      ? `${input.asset}-USDT`
      : null;
  return createM1MultiAssetObservation({
    coverageClass: "SUPPORTED_DERIVATIVE",
    assetDomain: "CRYPTO_LINEAR_PERPETUAL",
    sourceId: input.sourceId,
    venueInstrumentId: instrumentId,
    providerTransportSymbol: instrumentId,
    providerReferenceInstrumentId: okxReference,
    providerInstrumentFamily: okxReference,
    providerRoutingAuthority: input.sourceId === "OKX_SWAP"
      ? okxReference === null
        ? "PROVIDER_CATALOG_INCOMPLETE"
        : "PROVIDER_CATALOG_EXPLICIT"
      : "VENUE_INSTRUMENT_ID_EXACT",
    canonicalInstrumentId: deriveM1CanonicalInstrumentId({
      sourceId: input.sourceId,
      venueInstrumentId: instrumentId,
      identityEpoch,
    }),
    underlyingGroupId:
      `${M1_SCOPE_EPOCH}:CRYPTO_LINEAR_PERPETUAL:${input.asset}:USDT`,
    underlyingReferenceId: input.asset,
    baseAsset: input.asset,
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
    providerListTime: FIRST_OBSERVED_AT,
    providerDelistTime: null,
    firstObservedAt: FIRST_OBSERVED_AT,
    statusEffectiveAt: FIRST_OBSERVED_AT,
    knowledgeTime: input.knowledgeTime ?? IDENTITY_AT,
    jurisdictionAvailability: "UNVERIFIED",
    sourceCapability: "DERIVATIVE_INSTRUMENT_CATALOG",
    sourceRecordDigest: stableContentHash({
      sourceId: input.sourceId,
      instrumentId,
      explicitOkxReference: okxReference,
    }),
    reasonCodes: [],
  });
}

function identitySnapshot(input: {
  missingOkxRouting?: boolean;
  futureKnowledgeVenue?: VenueSourceId;
} = {}): M1MultiAssetIdentitySnapshot {
  const upstream = upstreamBinding();
  const observations = M1_VENUE_SOURCE_IDS.flatMap((sourceId) =>
    ASSETS.map((asset) => instrument({
      sourceId,
      asset,
      missingOkxRouting:
        input.missingOkxRouting &&
        sourceId === "OKX_SWAP" &&
        asset !== "ETH",
      knowledgeTime:
        input.futureKnowledgeVenue === sourceId && asset !== "ETH"
        ? "2026-07-27T00:00:10.000Z"
        : undefined,
    }))
  );
  const venueCaptures = M1_VENUE_SOURCE_IDS.map((sourceId) => {
    const venueObservations = observations.filter(
      (observation) => observation.sourceId === sourceId,
    );
    return buildM1MultiAssetCatalogVenueCapture({
      releaseId: RELEASE,
      registryDigest: REGISTRY_DIGEST,
      upstreamBindingId: upstream.upstreamBindingId,
      upstreamBindingHash: upstream.contentHash,
      evidenceClass: "TEST_ONLY",
      networkEnvironment: "TEST_HARNESS",
      sourceId,
      requestOutcomes: [{
        outcome: "SUCCESS",
        pageIndex: 1,
        requestUrlHash:
          M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE.sources[sourceId]
            .initialRequestUrlHash,
        receivedAt: IDENTITY_AT,
        httpStatus: 200,
        responseBytes: 4_096,
        responseHash: stableContentHash(venueObservations),
        recordCount: venueObservations.length,
        nextPageAvailable: false,
        rawBodyRetained: false,
        secretMaterialPresent: false,
      }],
      rawRecordCount: venueObservations.length,
      observations: venueObservations,
      normalizationStatus: "PASS",
      reasonCodes: [],
    });
  });
  const captureBinding = buildM1MultiAssetCatalogCaptureBinding({
    releaseId: RELEASE,
    generatedAt: IDENTITY_AT,
    registryDigest: REGISTRY_DIGEST,
    upstreamBindingId: upstream.upstreamBindingId,
    upstreamBindingHash: upstream.contentHash,
    evidenceClass: "TEST_ONLY",
    networkEnvironment: "TEST_HARNESS",
    venueCaptures,
  });
  return buildM1MultiAssetIdentitySnapshot({
    releaseId: RELEASE,
    generatedAt: IDENTITY_AT,
    sourceCutoff: IDENTITY_AT,
    registryDigest: REGISTRY_DIGEST,
    catalogCaptureBinding: captureBinding,
    observations,
  });
}

function parsed(
  componentId: Parameters<typeof parseM1WideMarketComponent>[0]["componentId"],
  payload: unknown,
) {
  return parseM1WideMarketComponent({
    componentId,
    payload,
    receivedAt: RECEIVED_AT,
    responseHash: stableContentHash({ componentId, payload }),
    responseBytes: Buffer.byteLength(JSON.stringify(payload)),
  });
}

function venueBatches(): readonly M1WideMarketVenueBatch[] {
  const binance = buildM1WideMarketVenueBatch({
    sourceId: "BINANCE_FUTURES",
    components: [
      parsed("BINANCE_PREMIUM_INDEX", ASSETS.map((asset, index) => ({
        symbol: `${asset}USDT`,
        markPrice: String(100 + index),
        indexPrice: String(99 + index),
        lastFundingRate: "0.0001",
        time: EVENT_MS,
      }))),
      parsed("BINANCE_TICKER_24H", ASSETS.map((asset, index) => ({
        symbol: `${asset}USDT`,
        lastPrice: String(101 + index),
        bidPrice: String(100 + index),
        askPrice: String(102 + index),
        volume: String(1_000 + index),
        quoteVolume: String(100_000 + index),
        closeTime: EVENT_MS,
      }))),
    ],
  });
  const okx = buildM1WideMarketVenueBatch({
    sourceId: "OKX_SWAP",
    components: [
      parsed("OKX_TICKERS", {
        code: "0",
        data: ASSETS.map((asset, index) => ({
          instId: `${asset}-USDT-SWAP`,
          last: String(201 + index),
          bidPx: String(200 + index),
          askPx: String(202 + index),
          volCcy24h: String(900 + index),
          ts: String(EVENT_MS),
        })),
      }),
      parsed("OKX_MARK_PRICE", {
        code: "0",
        data: ASSETS.map((asset, index) => ({
          instId: `${asset}-USDT-SWAP`,
          markPx: String(200 + index),
          ts: String(EVENT_MS),
        })),
      }),
    ],
  });
  const bybit = buildM1WideMarketVenueBatch({
    sourceId: "BYBIT_DERIVATIVES",
    components: [
      parsed("BYBIT_TICKERS", {
        retCode: 0,
        time: EVENT_MS,
        result: {
          category: "linear",
          list: ASSETS.map((asset, index) => ({
            symbol: `${asset}USDT`,
            lastPrice: String(301 + index),
            markPrice: String(300 + index),
            indexPrice: String(299 + index),
            bid1Price: String(300 + index),
            ask1Price: String(302 + index),
            fundingRate: "0.0001",
            openInterest: String(10_000 + index),
            volume24h: String(800 + index),
            turnover24h: String(240_000 + index),
          })),
        },
      }),
    ],
  });
  const bitget = buildM1WideMarketVenueBatch({
    sourceId: "BITGET_FUTURES",
    components: [
      parsed("BITGET_TICKERS", {
        code: "00000",
        requestTime: EVENT_MS,
        data: ASSETS.map((asset, index) => ({
          symbol: `${asset}USDT`,
          lastPr: String(401 + index),
          markPrice: String(400 + index),
          indexPrice: String(399 + index),
          bidPr: String(400 + index),
          askPr: String(402 + index),
          fundingRate: "0.0001",
          holdingAmount: String(20_000 + index),
          baseVolume: String(700 + index),
          quoteVolume: String(280_000 + index),
          ts: String(EVENT_MS),
        })),
      }),
    ],
  });
  return [bitget, bybit, okx, binance];
}

function listingBindings(upstream: M1MultiAssetShadowUpstreamBinding) {
  return (
    ["BYBIT_DERIVATIVES", "BITGET_FUTURES"] as const
  ).map((sourceId) => buildM1ListingWatchEvidenceBinding({
    schemaVersion: M1_LISTING_WATCH_BINDING_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: RELEASE,
    upstreamBindingId: upstream.upstreamBindingId,
    upstreamBindingHash: upstream.contentHash,
    sourceId,
    evidenceId: `listing-checkpoint:${sourceId}:selection-fixture`,
    evidenceHash: stableContentHash({ sourceId, fixture: "listing" }),
    sourceCutoff: RECEIVED_AT,
    status: "COMMITTED_NO_GAP",
    checkpointGapCount: 0,
    evidenceClass: "TEST_ONLY",
    networkEnvironment: "TEST_HARNESS",
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
  }));
}

function fixture(input: {
  missingOkxRouting?: boolean;
  futureKnowledgeVenue?: VenueSourceId;
} = {}) {
  const upstream = upstreamBinding();
  const identity = identitySnapshot(input);
  const baseFact = buildM1MultiAssetBaseFactSnapshot({
    releaseId: RELEASE,
    generatedAt: BASE_FACT_GENERATED_AT,
    sourceCutoff: BASE_FACT_CUTOFF,
    normalizedAt: NORMALIZED_AT,
    upstreamBinding: upstream,
    identitySnapshot: identity,
    venueBatches: venueBatches(),
    listingWatchBindings: listingBindings(upstream),
  });
  return { upstream, identity, baseFact };
}

function buildSelection(input: {
  missingOkxRouting?: boolean;
  futureKnowledgeVenue?: VenueSourceId;
  rotationOrdinal?: number;
} = {}) {
  const current = fixture(input);
  return buildM1MicrostructureForwardRuntimeSelection({
    upstreamBinding: current.upstream,
    identitySnapshot: current.identity,
    baseFactSnapshot: current.baseFact,
    generatedAt: SELECTION_GENERATED_AT,
    selectionCutoff: SELECTION_CUTOFF,
    windowStartsAt: WINDOW_STARTS_AT,
    windowEndsAt: WINDOW_ENDS_AT,
    rotationOrdinal: input.rotationOrdinal ?? 0,
  });
}

test("builds a deterministic four-Venue point-in-time selection and provider plan", () => {
  const first = buildSelection();
  const second = buildSelection();

  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.selectionPlan.contentHash, second.selectionPlan.contentHash);
  assert.equal(first.providerPlan.contentHash, second.providerPlan.contentHash);
  assert.equal(first.selectionPlan.pairCount, 4);
  assert.equal(first.selectedSubjectCount, 8);
  assert.equal(first.providerSubjectCount, 8);
  assert.deepEqual(first.selectionPlan.venuePairCounts, {
    BINANCE_FUTURES: 1,
    OKX_SWAP: 1,
    BYBIT_DERIVATIVES: 1,
    BITGET_FUTURES: 1,
  });
  assert.equal(first.selectionPlan.universeSnapshotId, first.baseFactSnapshotId);
  assert.equal(
    first.selectionPlan.universeSnapshotHash,
    first.baseFactSnapshotHash,
  );
  assert.ok(
    first.selectionPlan.pairs.every((pair) =>
      pair.trigger.regime === "UNKNOWN" &&
      pair.trigger.liquiditySegment === "UNKNOWN" &&
      pair.trigger.assetDomain === "CRYPTO_LINEAR_PERPETUAL" &&
      pair.outcomeKnownAtSelection === false &&
      pair.candidateEpisodeUsedForSelection === false
    ),
  );
  const okxSubjects = first.providerPlan.subjects.filter(
    (subject) => subject.venue === "OKX_SWAP",
  );
  assert.equal(okxSubjects.length, 2);
  assert.ok(
    okxSubjects.every((subject) =>
      subject.referenceInstrumentId !== null &&
      subject.instrumentFamily !== null &&
      subject.referenceInstrumentId === subject.instrumentFamily
    ),
  );
  assert.equal(first.regimeClassificationAuthority, false);
  assert.equal(first.liquiditySegmentationAuthority, false);
  assert.equal(first.candidateAuthorityGranted, false);
  assert.equal(first.strategyAuthorityGranted, false);
  assert.equal(first.readyAuthorityGranted, false);
  assert.equal(first.productionChanged, false);
});

test("rotates deterministically without mutating weights or reading outcomes", () => {
  const zero = buildSelection({ rotationOrdinal: 0 });
  const one = buildSelection({ rotationOrdinal: 1 });
  const oneAgain = buildSelection({ rotationOrdinal: 1 });

  assert.notEqual(
    zero.selectionPlan.deterministicSeedHash,
    one.selectionPlan.deterministicSeedHash,
  );
  assert.equal(one.contentHash, oneAgain.contentHash);
  assert.equal(
    one.selectionPlan.automaticSelectionWeightMutationAllowed,
    false,
  );
  assert.equal(one.selectionPlan.outcomeFieldsRead, false);
  assert.equal(one.selectionPlan.futureDataRead, false);
  assert.equal(one.selectionPlan.candidateStoreRead, false);
});

test("rejects missing provider-explicit OKX routing instead of inferring it", () => {
  const current = fixture({ missingOkxRouting: true });
  assert.equal(
    current.identity.observations.find(
      (observation) =>
        observation.sourceId === "OKX_SWAP" &&
        observation.venueInstrumentId === "BTC-USDT-SWAP",
    )?.providerRoutingAuthority,
    "PROVIDER_CATALOG_INCOMPLETE",
  );
  assert.throws(
    () => buildM1MicrostructureForwardRuntimeSelection({
      upstreamBinding: current.upstream,
      identitySnapshot: current.identity,
      baseFactSnapshot: current.baseFact,
      generatedAt: SELECTION_GENERATED_AT,
      selectionCutoff: SELECTION_CUTOFF,
      windowStartsAt: WINDOW_STARTS_AT,
      windowEndsAt: WINDOW_ENDS_AT,
      rotationOrdinal: 0,
    }),
    /selection requires two fresh exact same-stratum subjects for OKX_SWAP/u,
  );
});

test("rejects post-cutoff identity knowledge before it reaches selection", () => {
  assert.throws(
    () => fixture({
      futureKnowledgeVenue: "BITGET_FUTURES",
    }),
    /observations cannot be known after sourceCutoff/u,
  );
});

test("rejects snapshot and selection chronology drift", () => {
  const current = fixture();
  assert.throws(
    () => buildM1MicrostructureForwardRuntimeSelection({
      upstreamBinding: current.upstream,
      identitySnapshot: current.identity,
      baseFactSnapshot: current.baseFact,
      generatedAt: "2026-07-27T00:00:03.500Z",
      selectionCutoff: SELECTION_CUTOFF,
      windowStartsAt: WINDOW_STARTS_AT,
      windowEndsAt: WINDOW_ENDS_AT,
      rotationOrdinal: 0,
    }),
    /selection cannot read a snapshot created after selection/u,
  );
});
