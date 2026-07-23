import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeBinanceMultiAssetCatalog,
  normalizeBitgetMultiAssetCatalog,
  normalizeBybitMultiAssetCatalog,
  normalizeOkxMultiAssetCatalog,
} from "./adapters/four-venue-multi-asset-catalog";
import {
  normalizeBitgetListingAnnouncements,
  normalizeBybitListingAnnouncements,
} from "./adapters/bybit-bitget-listing-announcements";
import {
  buildM1ListingLifecycleLedger,
} from "./listing-lifecycle-contract";
import {
  M1MultiAssetIdentitySnapshotSchema,
  buildM1MultiAssetIdentitySnapshot,
  type M1OfficialUnderlyingMapping,
} from "./multi-asset-identity-contract";

const RECEIVED_AT = "2026-07-23T10:00:00.000Z";
const LATER_AT = "2026-07-23T10:05:00.000Z";
const RELEASE_ID = "2e4a632ed92b9478612fb42bded6e1a00e114bd1";
const REGISTRY_DIGEST =
  "sha256:45832cf889c92153a29d511582c386a9089d1eeb904a3e8ecdee5772904dfd94";

function binanceRow(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function okxRow(overrides: Record<string, unknown> = {}) {
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
    listTime: "1700000000000",
    expTime: "",
    tickSz: "0.1",
    lotSz: "1",
    ...overrides,
  };
}

function bybitRow(overrides: Record<string, unknown> = {}) {
  return {
    symbol: "BTCUSDT",
    contractType: "LinearPerpetual",
    status: "Trading",
    baseCoin: "BTC",
    quoteCoin: "USDT",
    settleCoin: "USDT",
    launchTime: "1700000000000",
    deliveryTime: "0",
    symbolType: "",
    isPreListing: false,
    priceFilter: { tickSize: "0.10" },
    lotSizeFilter: { qtyStep: "0.001" },
    ...overrides,
  };
}

function bitgetRow(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function mapping(input: Partial<M1OfficialUnderlyingMapping> = {}):
  M1OfficialUnderlyingMapping {
  return {
    sourceId: "BITGET_FUTURES",
    venueInstrumentId: "AAPLUSDT",
    assetDomain: "EQUITY_SINGLE_NAME_PERPETUAL",
    underlyingReferenceId: "NASDAQ:AAPL",
    evidenceIds: ["bitget-official-stock-product-aapl-2026-07-23"],
    reviewedAt: "2026-07-23T09:00:00.000Z",
    expiresAt: "2026-07-30T09:00:00.000Z",
    ...input,
  };
}

test("normalizes one exact crypto perpetual from every Scope V2 venue", () => {
  const results = [
    normalizeBinanceMultiAssetCatalog({
      payload: { symbols: [binanceRow()] },
      receivedAt: RECEIVED_AT,
    }),
    normalizeOkxMultiAssetCatalog({
      payload: { code: "0", data: [okxRow()] },
      receivedAt: RECEIVED_AT,
    }),
    normalizeBybitMultiAssetCatalog({
      payload: {
        retCode: 0,
        result: { category: "linear", list: [bybitRow()] },
      },
      receivedAt: RECEIVED_AT,
    }),
    normalizeBitgetMultiAssetCatalog({
      payload: { code: "00000", data: [bitgetRow()] },
      receivedAt: RECEIVED_AT,
    }),
  ];

  assert.equal(results.length, 4);
  for (const result of results) {
    assert.equal(result.status, "PASS");
    assert.equal(result.observations.length, 1);
    const observation = result.observations[0]!;
    assert.equal(observation.assetDomain, "CRYPTO_LINEAR_PERPETUAL");
    assert.equal(observation.identityStatus, "EXACT");
    assert.ok(observation.canonicalInstrumentId);
    assert.equal(observation.runtimeEligibility, "NOT_EVALUATED_NO_AUTHORITY");
    assert.equal(observation.candidateEmissionAllowed, false);
  }
});

test("does not classify a stock from its symbol or Bitget isRwa alone", () => {
  const binanceStockWithoutCategory = binanceRow({
    symbol: "AAPLUSDT",
    baseAsset: "AAPL",
  });
  delete (binanceStockWithoutCategory as { underlyingType?: string })
    .underlyingType;
  const binance = normalizeBinanceMultiAssetCatalog({
    payload: {
      symbols: [binanceStockWithoutCategory],
    },
    receivedAt: RECEIVED_AT,
  }).observations[0]!;
  const bitget = normalizeBitgetMultiAssetCatalog({
    payload: {
      code: "00000",
      data: [bitgetRow({
        symbol: "AAPLUSDT",
        baseCoin: "AAPL",
        isRwa: "YES",
      })],
    },
    receivedAt: RECEIVED_AT,
  }).observations[0]!;

  assert.equal(binance.assetDomain, null);
  assert.equal(binance.identityStatus, "UNRESOLVED");
  assert.equal(binance.canonicalInstrumentId, null);
  assert.ok(
    binance.reasonCodes.includes(
      "asset_domain_not_proven_without_symbol_guessing",
    ),
  );
  assert.equal(bitget.assetDomain, "OTHER_RWA_DERIVATIVE");
  assert.notEqual(bitget.assetDomain, "EQUITY_SINGLE_NAME_PERPETUAL");
  assert.ok(
    bitget.reasonCodes.includes(
      "bitget_is_rwa_does_not_prove_stock_or_etf_identity",
    ),
  );
});

test("uses a fresh evidence-bound product mapping to refine broad RWA identity", () => {
  const result = normalizeBitgetMultiAssetCatalog({
    payload: {
      code: "00000",
      data: [bitgetRow({
        symbol: "AAPLUSDT",
        baseCoin: "AAPL",
        isRwa: "YES",
      })],
    },
    receivedAt: RECEIVED_AT,
    mappings: [mapping()],
  });
  const observation = result.observations[0]!;

  assert.equal(observation.assetDomain, "EQUITY_SINGLE_NAME_PERPETUAL");
  assert.equal(observation.classificationAuthority, "OFFICIAL_PRODUCT_MAPPING");
  assert.equal(observation.underlyingReferenceId, "NASDAQ:AAPL");
  assert.deepEqual(observation.classificationEvidenceIds, [
    "bitget-official-stock-product-aapl-2026-07-23",
  ]);
  assert.equal(observation.identityStatus, "EXACT");
});

test("keeps expired mappings and conflicting classifications unresolved", () => {
  const expired = normalizeBitgetMultiAssetCatalog({
    payload: {
      code: "00000",
      data: [bitgetRow({
        symbol: "AAPLUSDT",
        baseCoin: "AAPL",
        isRwa: "YES",
      })],
    },
    receivedAt: RECEIVED_AT,
    mappings: [mapping({ expiresAt: "2026-07-23T09:30:00.000Z" })],
  }).observations[0]!;
  const conflict = normalizeBitgetMultiAssetCatalog({
    payload: {
      code: "00000",
      data: [bitgetRow({
        symbol: "AAPLUSDT",
        baseCoin: "AAPL",
        isRwa: "NO",
      })],
    },
    receivedAt: RECEIVED_AT,
    mappings: [mapping()],
  }).observations[0]!;

  assert.equal(expired.assetDomain, "OTHER_RWA_DERIVATIVE");
  assert.equal(expired.classificationAuthority, "PROVIDER_EXPLICIT_CATEGORY");
  assert.equal(conflict.assetDomain, null);
  assert.equal(conflict.identityStatus, "UNRESOLVED");
  assert.ok(
    conflict.reasonCodes.includes(
      "provider_and_official_mapping_classification_conflict",
    ),
  );
});

test("fails closed when more than one active official mapping claims an instrument", () => {
  const observation = normalizeBitgetMultiAssetCatalog({
    payload: {
      code: "00000",
      data: [bitgetRow({
        symbol: "AAPLUSDT",
        baseCoin: "AAPL",
        isRwa: "YES",
      })],
    },
    receivedAt: RECEIVED_AT,
    mappings: [
      mapping(),
      mapping({
        underlyingReferenceId: "NASDAQ:AAPL:CONFLICT",
        evidenceIds: ["conflicting-official-mapping"],
      }),
    ],
  }).observations[0]!;

  assert.equal(observation.assetDomain, null);
  assert.equal(observation.identityStatus, "UNRESOLVED");
  assert.ok(
    observation.reasonCodes.includes(
      "multiple_active_official_mappings_for_instrument",
    ),
  );
});

test("uses provider categories without collapsing equity and broad TradFi", () => {
  const okxStock = normalizeOkxMultiAssetCatalog({
    payload: {
      code: "0",
      data: [okxRow({
        instId: "AAPL-USDT-SWAP",
        ctValCcy: "AAPL",
        uly: "AAPL-USDT",
        instCategory: "3",
      })],
    },
    receivedAt: RECEIVED_AT,
  }).observations[0]!;
  const bybitTradFi = normalizeBybitMultiAssetCatalog({
    payload: {
      retCode: 0,
      result: {
        category: "linear",
        list: [bybitRow({
          symbol: "QQQUSDT",
          baseCoin: "QQQ",
          symbolType: "stock",
        })],
      },
    },
    receivedAt: RECEIVED_AT,
  }).observations[0]!;

  assert.equal(okxStock.assetDomain, "EQUITY_SINGLE_NAME_PERPETUAL");
  assert.equal(bybitTradFi.assetDomain, "OTHER_RWA_DERIVATIVE");
  assert.ok(
    bybitTradFi.reasonCodes.includes(
      "bybit_stock_category_does_not_distinguish_single_name_from_etf",
    ),
  );
});

test("builds a deterministic four-venue snapshot without runtime authority", () => {
  const observations = [
    normalizeBinanceMultiAssetCatalog({
      payload: { symbols: [binanceRow()] },
      receivedAt: RECEIVED_AT,
    }).observations[0]!,
    normalizeOkxMultiAssetCatalog({
      payload: { code: "0", data: [okxRow()] },
      receivedAt: RECEIVED_AT,
    }).observations[0]!,
    normalizeBybitMultiAssetCatalog({
      payload: {
        retCode: 0,
        result: { category: "linear", list: [bybitRow()] },
      },
      receivedAt: RECEIVED_AT,
    }).observations[0]!,
    normalizeBitgetMultiAssetCatalog({
      payload: { code: "00000", data: [bitgetRow()] },
      receivedAt: RECEIVED_AT,
    }).observations[0]!,
  ];
  const snapshot = buildM1MultiAssetIdentitySnapshot({
    releaseId: RELEASE_ID,
    generatedAt: LATER_AT,
    sourceCutoff: RECEIVED_AT,
    registryDigest: REGISTRY_DIGEST,
    observations,
  });
  const reordered = buildM1MultiAssetIdentitySnapshot({
    releaseId: RELEASE_ID,
    generatedAt: LATER_AT,
    sourceCutoff: RECEIVED_AT,
    registryDigest: REGISTRY_DIGEST,
    observations: [...observations].reverse(),
  });

  assert.equal(snapshot.venueDenominator, 4);
  assert.equal(snapshot.observedCount, 4);
  assert.equal(snapshot.exactIdentityCount, 4);
  assert.deepEqual(snapshot.countsByVenue, {
    BINANCE_FUTURES: 1,
    OKX_SWAP: 1,
    BYBIT_DERIVATIVES: 1,
    BITGET_FUTURES: 1,
  });
  assert.equal(snapshot.contentHash, reordered.contentHash);
  assert.equal(snapshot.productionChanged, false);
  assert.match(snapshot.authorityBoundary, /NO_ELIGIBLE_FACT_CANDIDATE/u);
  assert.equal(Object.isFrozen(snapshot), true);
});

test("keeps announcements unlinked instead of extracting symbols from titles", () => {
  const bybit = normalizeBybitListingAnnouncements({
    payload: {
      retCode: 0,
      result: {
        total: 1,
        list: [{
          title: "New Listing: AAPLUSDT Perpetual",
          type: { key: "new_crypto" },
          tags: ["Derivatives", "New Listings"],
          url: "https://announcements.bybit.com/en-US/article/example/",
          publishTime: 1_700_000_000_000,
        }],
      },
    },
    receivedAt: RECEIVED_AT,
  });
  const bitget = normalizeBitgetListingAnnouncements({
    payload: {
      code: "00000",
      data: [{
        annId: "123",
        annTitle: "Bitget lists XYZUSDT futures",
        annUrl: "https://www.bitget.com/support/articles/example",
        cTime: "1700000000000",
        annType: "coin_listings",
        annSubType: "futures",
      }],
    },
    receivedAt: RECEIVED_AT,
  });

  for (const result of [bybit, bitget]) {
    assert.equal(result.status, "PASS");
    const announcement = result.observations[0]!;
    assert.deepEqual(announcement.structuredVenueInstrumentIds, []);
    assert.equal(
      announcement.instrumentLinkAuthority,
      "UNLINKED_NO_SYMBOL_GUESSING",
    );
    assert.equal(announcement.candidateEmissionAllowed, false);
    assert.doesNotMatch(JSON.stringify(announcement), /AAPLUSDT|XYZUSDT/u);
  }
});

test("catalog disappearance remains unresolved and never becomes inferred delisting", () => {
  const firstObservation = normalizeBitgetMultiAssetCatalog({
    payload: { code: "00000", data: [bitgetRow()] },
    receivedAt: RECEIVED_AT,
  }).observations[0]!;
  const previous = buildM1MultiAssetIdentitySnapshot({
    releaseId: RELEASE_ID,
    generatedAt: RECEIVED_AT,
    sourceCutoff: RECEIVED_AT,
    registryDigest: REGISTRY_DIGEST,
    observations: [firstObservation],
  });
  const current = buildM1MultiAssetIdentitySnapshot({
    releaseId: RELEASE_ID,
    generatedAt: "2026-07-23T10:10:00.000Z",
    sourceCutoff: LATER_AT,
    registryDigest: REGISTRY_DIGEST,
    observations: [],
  });
  const ledger = buildM1ListingLifecycleLedger({
    releaseId: RELEASE_ID,
    generatedAt: "2026-07-23T10:10:00.000Z",
    sourceCutoff: LATER_AT,
    current,
    previous,
    completeCatalogSources: ["BITGET_FUTURES"],
    announcements: [],
  });
  const event = ledger.events[0]!;

  assert.equal(event.eventSource, "CATALOG_ABSENCE");
  assert.equal(event.currentState, "UNRESOLVED");
  assert.equal(
    event.correlationStatus,
    "MISSING_FROM_COMPLETE_CATALOG_NOT_DELISTING_PROOF",
  );
  assert.notEqual(event.currentState, "DELISTING");
});

test("provider listing time creates a new epoch instead of silently reusing a symbol", () => {
  const first = normalizeBitgetMultiAssetCatalog({
    payload: { code: "00000", data: [bitgetRow()] },
    receivedAt: RECEIVED_AT,
  }).observations[0]!;
  const reused = normalizeBitgetMultiAssetCatalog({
    payload: {
      code: "00000",
      data: [bitgetRow({ launchTime: "1800000000000" })],
    },
    receivedAt: LATER_AT,
  }).observations[0]!;

  assert.notEqual(first.listingEpoch, reused.listingEpoch);
  assert.notEqual(first.identityEpoch, reused.identityEpoch);
  assert.notEqual(first.canonicalInstrumentId, reused.canonicalInstrumentId);
});

test("preserves a provisional listing epoch when the provider omits list time", () => {
  const firstObservation = normalizeBitgetMultiAssetCatalog({
    payload: {
      code: "00000",
      data: [bitgetRow({ launchTime: "" })],
    },
    receivedAt: RECEIVED_AT,
  }).observations[0]!;
  const previous = buildM1MultiAssetIdentitySnapshot({
    releaseId: RELEASE_ID,
    generatedAt: RECEIVED_AT,
    sourceCutoff: RECEIVED_AT,
    registryDigest: REGISTRY_DIGEST,
    observations: [firstObservation],
  });
  const laterObservation = normalizeBitgetMultiAssetCatalog({
    payload: {
      code: "00000",
      data: [bitgetRow({ launchTime: "" })],
    },
    receivedAt: LATER_AT,
  }).observations[0]!;
  const current = buildM1MultiAssetIdentitySnapshot({
    releaseId: "3e4a632ed92b9478612fb42bded6e1a00e114bd2",
    generatedAt: "2026-07-23T10:10:00.000Z",
    sourceCutoff: LATER_AT,
    registryDigest: REGISTRY_DIGEST,
    observations: [laterObservation],
    previous,
  });

  assert.equal(
    current.observations[0]?.listingEpoch,
    previous.observations[0]?.listingEpoch,
  );
  assert.equal(current.observations[0]?.firstObservedAt, RECEIVED_AT);
  assert.ok(
    current.observations[0]?.reasonCodes.includes(
      "listing_epoch_preserved_from_prior_observation",
    ),
  );
});

test("snapshot schema rejects duplicate current instruments and digest tampering", () => {
  const observation = normalizeBitgetMultiAssetCatalog({
    payload: { code: "00000", data: [bitgetRow()] },
    receivedAt: RECEIVED_AT,
  }).observations[0]!;
  assert.throws(() =>
    buildM1MultiAssetIdentitySnapshot({
      releaseId: RELEASE_ID,
      generatedAt: LATER_AT,
      sourceCutoff: RECEIVED_AT,
      registryDigest: REGISTRY_DIGEST,
      observations: [observation, observation],
    })
  );

  const snapshot = buildM1MultiAssetIdentitySnapshot({
    releaseId: RELEASE_ID,
    generatedAt: LATER_AT,
    sourceCutoff: RECEIVED_AT,
    registryDigest: REGISTRY_DIGEST,
    observations: [observation],
  });
  const tampered = structuredClone(snapshot);
  tampered.countsByVenue.BITGET_FUTURES = 9;
  assert.equal(
    M1MultiAssetIdentitySnapshotSchema.safeParse(tampered).success,
    false,
  );
});
