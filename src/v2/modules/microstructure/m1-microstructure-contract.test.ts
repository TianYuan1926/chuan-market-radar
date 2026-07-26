import assert from "node:assert/strict";
import test from "node:test";
import {
  M1_MARKET_MECHANICS_FEATURE_DEFINITIONS,
  M1_MICROSTRUCTURE_AUTHORITY,
  M1MicrostructureFactSchema,
  assessM1MarketMechanicsParity,
  buildM1LiquidityWallEpisode,
  buildM1MarketMechanicsFeatureSet,
  buildM1MicrostructureFact,
  type M1LiquidityWallEpisodeInput,
  type M1MarketMechanicsFeatureSetInput,
  type M1MicrostructureFactInput,
} from "./m1-microstructure-contract";

const RELEASE = "a".repeat(40);
const EVENT_TIME = "2026-07-26T01:00:00.000Z";
const RECEIVED_AT = "2026-07-26T01:00:00.100Z";
const NORMALIZED_AT = "2026-07-26T01:00:00.200Z";
const SOURCE_CUTOFF = "2026-07-26T01:00:00.300Z";
const GENERATED_AT = "2026-07-26T01:00:00.400Z";

const fresh = {
  status: "FRESH" as const,
  ageMs: 100,
  reasonCodes: [] as string[],
};

function factInput(
  overrides: Partial<M1MicrostructureFactInput> = {},
): M1MicrostructureFactInput {
  return {
    schemaVersion: "v2-m1-microstructure-fact.v1",
    scopeEpoch: "SCOPE_EPOCH_V2_MULTI_ASSET_4V",
    releaseId: RELEASE,
    sourceId: "BINANCE_FUTURES",
    venue: "BINANCE_FUTURES",
    sourceCapability: "PUBLIC_TRADE",
    collectionTier: "T2_CANDIDATE_BURST",
    capabilityGrantId: "grant:binance:public-trade",
    capabilityGrantContentHash:
      "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    collectionIntentId: "intent:binance:btc:public-trade",
    collectionIntentContentHash:
      "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    sourceCapabilityRegistryContentHash:
      "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    identityObservationContentHash:
      "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    assetDomain: "CRYPTO_LINEAR_PERPETUAL",
    lifecycleState: "ESTABLISHED",
    canonicalInstrumentId: "scope-v2:binance:btcusdt",
    venueInstrumentId: "BTCUSDT",
    listingEpoch: "listing:binance:btcusdt:v1",
    identityEpoch: "identity:binance:btcusdt:v1",
    factType: "PUBLIC_TRADE",
    payload: {
      kind: "PUBLIC_TRADE",
      tradeId: "trade-1",
      aggressorSide: "BUY",
      price: "118000",
      quantity: "0.25",
      quoteNotional: "29500",
    },
    sourceRecordIds: ["source-record-2", "source-record-1"],
    eventTime: EVENT_TIME,
    receivedAt: RECEIVED_AT,
    normalizedAt: NORMALIZED_AT,
    persistedAt: null,
    sourceCutoff: SOURCE_CUTOFF,
    generatedAt: GENERATED_AT,
    exchangeSequence: "1001",
    sequenceStatus: "CONTIGUOUS",
    sourceClockStatus: "SYNCHRONIZED",
    quality: fresh,
    thresholdPolicy:
      "ADAPTIVE_BY_INSTRUMENT_VENUE_REGIME_LIQUIDITY_SEGMENT",
    fixedNotionalDetectorThresholdAllowed: false,
    authority: M1_MICROSTRUCTURE_AUTHORITY,
    candidateEmissionAllowed: false,
    signalGradeAllowed: false,
    readyAuthorityAllowed: false,
    ...overrides,
  } as M1MicrostructureFactInput;
}

function wallInput(
  overrides: Partial<M1LiquidityWallEpisodeInput> = {},
): M1LiquidityWallEpisodeInput {
  return {
    schemaVersion: "v2-m1-liquidity-wall-episode.v1",
    scopeEpoch: "SCOPE_EPOCH_V2_MULTI_ASSET_4V",
    releaseId: RELEASE,
    venue: "BINANCE_FUTURES",
    assetDomain: "CRYPTO_LINEAR_PERPETUAL",
    lifecycleState: "ESTABLISHED",
    canonicalInstrumentId: "scope-v2:binance:btcusdt",
    venueInstrumentId: "BTCUSDT",
    listingEpoch: "listing:binance:btcusdt:v1",
    identityEpoch: "identity:binance:btcusdt:v1",
    side: "BID",
    priceBandLower: "117900",
    priceBandUpper: "118000",
    normalizedNotional: "10000",
    distanceBps: 12,
    firstSeenAt: "2026-07-26T01:00:00.000Z",
    lastSeenAt: "2026-07-26T01:00:05.000Z",
    persistenceMs: 5_000,
    executedNotional: "1000",
    cancelledNotional: "2000",
    refillCount: 3,
    migrationBps: 0,
    state: "ACTIVE",
    sourceFactIds: ["micro-fact-2", "micro-fact-1"],
    sourceCutoff: "2026-07-26T01:00:05.000Z",
    generatedAt: "2026-07-26T01:00:05.100Z",
    quality: fresh,
    featureVersion: "liquidity-wall-feature.v1",
    thresholdPolicy:
      "ADAPTIVE_BY_INSTRUMENT_VENUE_REGIME_LIQUIDITY_SEGMENT",
    fixedNotionalDetectorThresholdAllowed: false,
    authority: M1_MICROSTRUCTURE_AUTHORITY,
    candidateEmissionAllowed: false,
    ...overrides,
  };
}

function featureInput(
  overrides: Partial<M1MarketMechanicsFeatureSetInput> = {},
): M1MarketMechanicsFeatureSetInput {
  const features = M1_MARKET_MECHANICS_FEATURE_DEFINITIONS.map(
    (definition, index) => ({
      featureId: definition.featureId,
      axis: definition.axis,
      value: index / 10,
      unit: definition.unit,
      sourceFactIds: ["micro-fact-1"],
      sourceWallEpisodeIds: ["wall-episode-1"],
      quality: fresh,
      reasonCodes: ["fixture_observed"],
    }),
  );
  return {
    schemaVersion: "v2-m1-market-mechanics-feature-set.v1",
    scopeEpoch: "SCOPE_EPOCH_V2_MULTI_ASSET_4V",
    releaseId: RELEASE,
    venue: "BINANCE_FUTURES",
    assetDomain: "CRYPTO_LINEAR_PERPETUAL",
    lifecycleState: "ESTABLISHED",
    canonicalInstrumentId: "scope-v2:binance:btcusdt",
    venueInstrumentId: "BTCUSDT",
    listingEpoch: "listing:binance:btcusdt:v1",
    identityEpoch: "identity:binance:btcusdt:v1",
    timeframe: "1m",
    regime: "TRANSITION",
    liquiditySegment: "DEEP",
    sectorSnapshotId: "sector-snapshot:meme:20260726t010000z",
    computationMode: "ONLINE",
    computationRunId: "online-run-1",
    featureDefinitionVersion: "market-mechanics-features.v1",
    inputFactIds: ["micro-fact-2", "micro-fact-1"],
    inputWallEpisodeIds: ["wall-episode-1"],
    features,
    sourceCutoff: SOURCE_CUTOFF,
    computedAt: "2026-07-26T01:00:00.350Z",
    generatedAt: GENERATED_AT,
    authority: M1_MICROSTRUCTURE_AUTHORITY,
    candidateEmissionAllowed: false,
    signalGradeAllowed: false,
    readyAuthorityAllowed: false,
    ...overrides,
  };
}

test("builds deterministic immutable first-party facts for all four Venues", () => {
  for (const venue of [
    "BINANCE_FUTURES",
    "OKX_SWAP",
    "BYBIT_DERIVATIVES",
    "BITGET_FUTURES",
  ] as const) {
    const first = buildM1MicrostructureFact(factInput({
      sourceId: venue,
      venue,
      canonicalInstrumentId: `scope-v2:${venue}:btcusdt`,
      capabilityGrantId: `grant:${venue}:public-trade`,
      collectionIntentId: `intent:${venue}:btcusdt:public-trade`,
    }));
    const reordered = buildM1MicrostructureFact(factInput({
      sourceId: venue,
      venue,
      canonicalInstrumentId: `scope-v2:${venue}:btcusdt`,
      capabilityGrantId: `grant:${venue}:public-trade`,
      collectionIntentId: `intent:${venue}:btcusdt:public-trade`,
      sourceRecordIds: ["source-record-1", "source-record-2"],
    }));
    assert.equal(first.contentHash, reordered.contentHash);
    assert.equal(first.factId, reordered.factId);
    assert.equal(first.authority, M1_MICROSTRUCTURE_AUTHORITY);
    assert.equal(first.candidateEmissionAllowed, false);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.payload), true);
  }
});

test("accepts the six fact families only with their registered capability", () => {
  const families: readonly Partial<M1MicrostructureFactInput>[] = [
    {},
    {
      factType: "TOP_OF_BOOK",
      sourceCapability: "ORDER_BOOK_SNAPSHOT",
      collectionTier: "T1_WIDE_MARKET",
      payload: {
        kind: "TOP_OF_BOOK",
        bestBidPrice: "117999",
        bestBidQuantity: "2",
        bestAskPrice: "118001",
        bestAskQuantity: "3",
      },
    },
    {
      factType: "ORDER_BOOK_SNAPSHOT",
      sourceCapability: "ORDER_BOOK_SNAPSHOT",
      payload: {
        kind: "ORDER_BOOK_SNAPSHOT",
        snapshotSequence: "1000",
        depthBps: 100,
        levels: [
          { side: "BID", price: "117999", quantity: "2", quoteNotional: "235998" },
          { side: "BID", price: "117998", quantity: "3", quoteNotional: "353994" },
          { side: "ASK", price: "118001", quantity: "2", quoteNotional: "236002" },
          { side: "ASK", price: "118002", quantity: "3", quoteNotional: "354006" },
        ],
      },
    },
    {
      factType: "ORDER_BOOK_DELTA",
      sourceCapability: "ORDER_BOOK_DELTA",
      payload: {
        kind: "ORDER_BOOK_DELTA",
        fromSequence: "1000",
        toSequence: "1001",
        changes: [
          { side: "BID", price: "117999", quantity: "4", action: "UPSERT" },
          { side: "ASK", price: "118002", quantity: "0", action: "DELETE" },
        ],
      },
    },
    {
      factType: "LIQUIDATION_EVENT",
      sourceCapability: "LIQUIDATION_EVENT",
      payload: {
        kind: "LIQUIDATION_EVENT",
        liquidationId: "liquidation-1",
        liquidatedSide: "LONG",
        price: "117500",
        quantity: "4",
        quoteNotional: "470000",
      },
    },
    {
      factType: "MARK_INDEX_REFERENCE",
      sourceCapability: "MARK_PRICE",
      collectionTier: "T1_WIDE_MARKET",
      payload: {
        kind: "MARK_INDEX_REFERENCE",
        markPrice: "118000",
        indexPrice: "117995",
      },
    },
  ];
  for (const family of families) {
    assert.doesNotThrow(() =>
      buildM1MicrostructureFact(factInput(family)));
  }

  assert.throws(
    () =>
      buildM1MicrostructureFact(factInput({
        factType: "PUBLIC_TRADE",
        sourceCapability: "ORDER_BOOK_DELTA",
      })),
    /fact type and registered source capability must match/u,
  );
});

test("rejects cross-Venue identity splicing and aggregator fact substitution", () => {
  assert.throws(
    () =>
      buildM1MicrostructureFact(factInput({
        sourceId: "BITGET_FUTURES",
        venue: "BINANCE_FUTURES",
      })),
    /must preserve their Venue/u,
  );
  assert.throws(
    () =>
      buildM1MicrostructureFact(factInput({
        sourceId: "COINGLASS_V4",
      })),
    /cannot replace first-party trade or order-book facts/u,
  );
  assert.doesNotThrow(() =>
    buildM1MicrostructureFact(factInput({
      sourceId: "COINGLASS_V4",
      sourceCapability: "LIQUIDATION_EVENT",
      factType: "LIQUIDATION_EVENT",
      payload: {
        kind: "LIQUIDATION_EVENT",
        liquidationId: "coinglass-liquidation-1",
        liquidatedSide: "UNKNOWN",
        price: "117500",
        quantity: "4",
        quoteNotional: "470000",
      },
    })));
});

test("raw microstructure cannot leak into baseline or catalog tiers", () => {
  assert.throws(
    () =>
      buildM1MicrostructureFact(factInput({
        collectionTier: "T1_WIDE_MARKET",
      })),
    /require bounded burst tiers/u,
  );
  assert.throws(
    () =>
      buildM1MicrostructureFact(factInput({
        collectionTier: "T0_CATALOG_EVENT",
        factType: "TOP_OF_BOOK",
        sourceCapability: "ORDER_BOOK_SNAPSHOT",
        payload: {
          kind: "TOP_OF_BOOK",
          bestBidPrice: "117999",
          bestBidQuantity: "2",
          bestAskPrice: "118001",
          bestAskQuantity: "3",
        },
      })),
    /catalog tier cannot carry/u,
  );
});

test("fresh facts fail closed on sequence gaps, clock drift and future lineage", () => {
  assert.throws(
    () =>
      buildM1MicrostructureFact(factInput({
        sequenceStatus: "GAP",
      })),
    /fresh microstructure facts require/u,
  );
  assert.throws(
    () =>
      buildM1MicrostructureFact(factInput({
        sourceClockStatus: "UNKNOWN",
      })),
    /fresh microstructure facts require/u,
  );
  assert.throws(
    () =>
      buildM1MicrostructureFact(factInput({
        eventTime: "2026-07-26T01:00:00.500Z",
      })),
    /point-in-time lineage is not monotonic/u,
  );
});

test("order-book contracts reject crossed, unsorted and duplicate levels", () => {
  assert.throws(
    () =>
      buildM1MicrostructureFact(factInput({
        factType: "ORDER_BOOK_SNAPSHOT",
        sourceCapability: "ORDER_BOOK_SNAPSHOT",
        payload: {
          kind: "ORDER_BOOK_SNAPSHOT",
          snapshotSequence: "1000",
          depthBps: 100,
          levels: [
            { side: "BID", price: "118001", quantity: "1", quoteNotional: "118001" },
            { side: "ASK", price: "118000", quantity: "1", quoteNotional: "118000" },
          ],
        },
      })),
    /must not be crossed or locked/u,
  );
});

test("fixed notional thresholds and unknown fields are rejected at the schema edge", () => {
  const invalid = {
    ...factInput(),
    fixedNotionalDetectorThresholdAllowed: true,
    fixedThresholdUsdt: 100_000,
  };
  assert.equal(M1MicrostructureFactSchema.safeParse(invalid).success, false);
});

test("builds deterministic wall lifecycles without assigning intent or authority", () => {
  const first = buildM1LiquidityWallEpisode(wallInput());
  const reordered = buildM1LiquidityWallEpisode(wallInput({
    sourceFactIds: ["micro-fact-1", "micro-fact-2"],
  }));
  assert.equal(first.contentHash, reordered.contentHash);
  assert.equal(first.wallEpisodeId, reordered.wallEpisodeId);
  assert.equal(first.candidateEmissionAllowed, false);
  assert.equal(first.fixedNotionalDetectorThresholdAllowed, false);
  assert.equal(Object.isFrozen(first), true);
});

test("wall lifecycle accounting rejects impossible state and notional claims", () => {
  assert.throws(
    () =>
      buildM1LiquidityWallEpisode(wallInput({
        executedNotional: "9000",
        cancelledNotional: "2000",
      })),
    /cannot exceed observed notional/u,
  );
  assert.throws(
    () =>
      buildM1LiquidityWallEpisode(wallInput({
        state: "MIGRATED",
        migrationBps: 0,
      })),
    /requires a non-zero migration distance/u,
  );
  assert.throws(
    () =>
      buildM1LiquidityWallEpisode(wallInput({
        persistenceMs: 4_999,
      })),
    /times and persistence must agree/u,
  );
});

test("feature sets preserve the exact 13-feature denominator and lineage", () => {
  const featureSet = buildM1MarketMechanicsFeatureSet(featureInput());
  assert.equal(
    featureSet.features.length,
    M1_MARKET_MECHANICS_FEATURE_DEFINITIONS.length,
  );
  assert.deepEqual(featureSet.inputFactIds, [
    "micro-fact-1",
    "micro-fact-2",
  ]);
  assert.equal(featureSet.candidateEmissionAllowed, false);
  assert.equal(featureSet.signalGradeAllowed, false);
  assert.equal(featureSet.readyAuthorityAllowed, false);
  assert.equal(Object.isFrozen(featureSet.features), true);
});

test("null features remain explicit instead of becoming zero", () => {
  const input = featureInput();
  const features = structuredClone(input.features);
  features[0] = {
    ...features[0]!,
    value: null,
    quality: {
      status: "UNAVAILABLE",
      ageMs: null,
      reasonCodes: ["trade_stream_unavailable"],
    },
    reasonCodes: ["trade_stream_unavailable"],
  };
  const featureSet = buildM1MarketMechanicsFeatureSet({
    ...input,
    features,
  });
  assert.equal(featureSet.features[0]!.value, null);
  assert.equal(featureSet.features[0]!.quality.status, "UNAVAILABLE");
});

test("feature registry, denominator and source containment fail closed", () => {
  const missing = featureInput();
  missing.features = missing.features.slice(1);
  assert.throws(
    () => buildM1MarketMechanicsFeatureSet(missing),
    /expected array to have 13 items|feature denominator/u,
  );

  const wrongAxis = featureInput();
  wrongAxis.features[0] = {
    ...wrongAxis.features[0]!,
    axis: "PRICE_STRUCTURE",
  };
  assert.throws(
    () => buildM1MarketMechanicsFeatureSet(wrongAxis),
    /axis and unit must match/u,
  );

  const spliced = featureInput();
  spliced.features[0] = {
    ...spliced.features[0]!,
    sourceFactIds: ["foreign-fact"],
  };
  assert.throws(
    () => buildM1MarketMechanicsFeatureSet(spliced),
    /lineage must be contained/u,
  );
});

test("ONLINE and repeated REPLAY outputs must be semantically identical", () => {
  const online = buildM1MarketMechanicsFeatureSet(featureInput());
  const replay = buildM1MarketMechanicsFeatureSet(featureInput({
    computationMode: "REPLAY",
    computationRunId: "replay-run-1",
  }));
  const replayRepeat = buildM1MarketMechanicsFeatureSet(featureInput({
    computationMode: "REPLAY",
    computationRunId: "replay-run-2",
  }));
  const parity = assessM1MarketMechanicsParity({
    online,
    replay,
    replayRepeat,
  });
  assert.equal(parity.status, "PASS");
  assert.equal(parity.candidateEmissionAllowed, false);
  assert.equal(Object.isFrozen(parity), true);

  const changed = featureInput({
    computationMode: "REPLAY",
    computationRunId: "replay-run-changed",
  });
  changed.features[0] = {
    ...changed.features[0]!,
    value: 99,
  };
  const mismatch = assessM1MarketMechanicsParity({
    online,
    replay: buildM1MarketMechanicsFeatureSet(changed),
    replayRepeat,
  });
  assert.equal(mismatch.status, "FAIL");
  assert.ok(mismatch.reasonCodes.includes(
    "online_replay_semantic_mismatch",
  ));
});
