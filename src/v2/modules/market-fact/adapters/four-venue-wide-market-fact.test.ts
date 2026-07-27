import assert from "node:assert/strict";
import test from "node:test";
import {
  M1_WIDE_MARKET_COMPONENT_IDS,
  M1_WIDE_MARKET_SOURCE_PROFILE_DIGEST,
  M1_WIDE_MARKET_SOURCE_PROFILES,
  M1WideMarketComponentResultSchema,
  buildM1WideMarketVenueBatch,
  failedM1WideMarketComponent,
  m1WideMarketProfileFor,
  parseM1WideMarketComponent,
} from "./four-venue-wide-market-fact";
import { stableContentHash } from "../../universe/stable-artifact";
import {
  M1_VENUE_SOURCE_IDS,
} from "../../source-capability/source-capability-contract";

const EVENT_AT = "2026-07-27T00:00:00.000Z";
const RECEIVED_AT = "2026-07-27T00:00:01.000Z";
const EVENT_MS = Date.parse(EVENT_AT);
const RESPONSE_HASH =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function parse(
  componentId: (typeof M1_WIDE_MARKET_COMPONENT_IDS)[number],
  payload: unknown,
) {
  return parseM1WideMarketComponent({
    componentId,
    payload,
    receivedAt: RECEIVED_AT,
    responseHash: RESPONSE_HASH,
    responseBytes: 1_024,
  });
}

test("freezes exact public-only source-wide endpoints including Bitget all tickers", () => {
  const profiles = M1_WIDE_MARKET_SOURCE_PROFILES;
  assert.equal(
    stableContentHash(profiles),
    M1_WIDE_MARKET_SOURCE_PROFILE_DIGEST,
  );
  assert.deepEqual(profiles.sourceOrder, [
    "BINANCE_FUTURES",
    "OKX_SWAP",
    "BYBIT_DERIVATIVES",
    "BITGET_FUTURES",
  ]);
  assert.equal(profiles.credentialsRequired, false);
  assert.equal(profiles.rawBodyRetentionAllowed, false);
  assert.equal(profiles.automaticTradingAllowed, false);
  assert.equal(
    profiles.sources.BITGET_FUTURES.requests[0].url,
    "https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES",
  );
  assert.ok(
    M1_VENUE_SOURCE_IDS.flatMap(
      (sourceId) => [...m1WideMarketProfileFor(sourceId).requests],
    )
      .every(
        (request) =>
          request.url.startsWith("https://") &&
          new URL(request.url).hostname === request.allowedHost &&
          request.required &&
          request.officialDocumentation.startsWith("https://"),
      ),
  );
});

test("normalizes all six source-wide components with point-in-time field lineage", () => {
  const components = [
    parse("BINANCE_PREMIUM_INDEX", [{
      symbol: "BTCUSDT",
      markPrice: "118000.5000",
      indexPrice: "117990.25",
      lastFundingRate: "-0.0001",
      time: EVENT_MS,
    }]),
    parse("BINANCE_TICKER_24H", [{
      symbol: "BTCUSDT",
      lastPrice: "118010.5",
      bidPrice: "118010",
      askPrice: "118011",
      volume: "1000.50",
      quoteVolume: "118000000",
      closeTime: EVENT_MS,
    }]),
    parse("OKX_TICKERS", {
      code: "0",
      data: [{
        instId: "BTC-USDT-SWAP",
        last: "118005",
        bidPx: "118004",
        askPx: "118006",
        volCcy24h: "900.25",
        ts: String(EVENT_MS),
      }],
    }),
    parse("OKX_MARK_PRICE", {
      code: "0",
      data: [{
        instId: "BTC-USDT-SWAP",
        markPx: "118001",
        ts: String(EVENT_MS),
      }],
    }),
    parse("BYBIT_TICKERS", {
      retCode: 0,
      time: EVENT_MS,
      result: {
        category: "linear",
        list: [{
          symbol: "BTCUSDT",
          lastPrice: "118002",
          markPrice: "118001",
          indexPrice: "117999",
          bid1Price: "118001",
          ask1Price: "118003",
          fundingRate: "0.0001",
          openInterest: "25000",
          volume24h: "800",
          turnover24h: "94000000",
        }],
      },
    }),
    parse("BITGET_TICKERS", {
      code: "00000",
      requestTime: EVENT_MS,
      data: [{
        symbol: "BTCUSDT",
        lastPr: "118003",
        markPrice: "118002",
        indexPrice: "118000",
        bidPr: "118002",
        askPr: "118004",
        fundingRate: "-0.0002",
        holdingAmount: "22000",
        baseVolume: "700",
        quoteVolume: "82600000",
        ts: String(EVENT_MS),
      }],
    }),
  ];

  for (const component of components) {
    assert.equal(component.status, "SUCCESS");
    assert.equal(component.normalizedRecordCount, 1);
    assert.equal(component.invalidRecordCount, 0);
    assert.equal(component.observations[0]!.eventTime, EVENT_AT);
    assert.equal(component.rawBodyRetained, false);
    assert.equal(component.secretMaterialPresent, false);
    assert.equal(component.authorityGranted, false);
    assert.equal(
      M1WideMarketComponentResultSchema.parse(component).contentHash,
      component.contentHash,
    );
  }
  assert.equal(
    components[0]!.observations[0]!.values.markPrice,
    "118000.5",
  );
  assert.equal(
    components[4]!.observations[0]!.values.openInterest,
    "25000",
  );
  assert.equal(
    components[5]!.observations[0]!.values.fundingRate,
    "-0.0002",
  );
});

test("keeps malformed and duplicate provider rows visible instead of shrinking scope", () => {
  const duplicate = parse("BINANCE_TICKER_24H", [
    {
      symbol: "BTCUSDT",
      lastPrice: "118010",
      bidPrice: "118009",
      askPrice: "118011",
      volume: "100",
      quoteVolume: "11800000",
      closeTime: EVENT_MS,
    },
    {
      symbol: "BTCUSDT",
      lastPrice: "118012",
      bidPrice: "118011",
      askPrice: "118013",
      volume: "101",
      quoteVolume: "11900000",
      closeTime: EVENT_MS,
    },
    { symbol: null },
  ]);
  assert.equal(duplicate.status, "PARTIAL");
  assert.equal(duplicate.rawRecordCount, 3);
  assert.equal(duplicate.normalizedRecordCount, 2);
  assert.equal(duplicate.invalidRecordCount, 1);
  assert.equal(duplicate.duplicateInstrumentCount, 1);

  const schemaDrift = parse("BITGET_TICKERS", { code: "00000", data: {} });
  assert.equal(schemaDrift.status, "FAILED");
  assert.equal(schemaDrift.providerFailureKind, "INVALID");
  assert.equal(schemaDrift.rawRecordCount, 0);
  assert.equal(schemaDrift.responseBytes, 1_024);
  assert.equal(schemaDrift.responseHash, RESPONSE_HASH);
  assert.match(schemaDrift.reasonCodes[0]!, /schema_or_provider_error/u);
});

test("Venue batches require every exact component and preserve provider failures", () => {
  const premium = parse("BINANCE_PREMIUM_INDEX", [{
    symbol: "BTCUSDT",
    markPrice: "118000",
    indexPrice: "117999",
    lastFundingRate: "0",
    time: EVENT_MS,
  }]);
  const failedTicker = failedM1WideMarketComponent({
    componentId: "BINANCE_TICKER_24H",
    receivedAt: RECEIVED_AT,
    failure: {
      kind: "RATE_LIMITED",
      reasonCode: "provider_http_429",
    },
  });
  const batch = buildM1WideMarketVenueBatch({
    sourceId: "BINANCE_FUTURES",
    components: [failedTicker, premium],
  });
  assert.equal(batch.status, "PARTIAL");
  assert.equal(batch.attemptedComponentCount, 2);
  assert.equal(batch.successfulComponentCount, 1);
  assert.equal(batch.failedComponentCount, 1);
  assert.deepEqual(
    batch.components.map((component) => component.componentId),
    ["BINANCE_PREMIUM_INDEX", "BINANCE_TICKER_24H"],
  );
  assert.throws(
    () =>
      buildM1WideMarketVenueBatch({
        sourceId: "BINANCE_FUTURES",
        components: [premium],
      }),
    /missing exact wide-market component/u,
  );
});
