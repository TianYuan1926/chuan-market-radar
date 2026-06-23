import assert from "node:assert/strict";
import test from "node:test";

import {
  BINANCE_FUTURES_EXCHANGE_INFO_URL,
  createBinanceUniverseDiscoveryProvider,
  normalizeBinanceExchangeInfoSymbol,
} from "./binance-universe-discovery";

const observedAt = "2026-06-15T00:00:00.000Z";

test("normalizeBinanceExchangeInfoSymbol accepts active USDT perpetual contracts", () => {
  const instrument = normalizeBinanceExchangeInfoSymbol({
    symbol: "ARBUSDT",
    pair: "ARBUSDT",
    contractType: "PERPETUAL",
    status: "TRADING",
    baseAsset: "ARB",
    quoteAsset: "USDT",
    underlyingType: "COIN",
  }, observedAt);

  assert.deepEqual(instrument, {
    id: "BINANCE:ARBUSDT",
    symbol: "ARBUSDT",
    baseAsset: "ARB",
    quoteAsset: "USDT",
    exchange: "BINANCE",
    marketType: "perpetual",
    isActive: true,
    volume24hUsd: 0,
    tags: ["binance-public-futures", "contract:PERPETUAL", "status:TRADING"],
    lastSeenAt: observedAt,
  });
});

test("normalizeBinanceExchangeInfoSymbol rejects non-USDT inactive or dated contracts", () => {
  assert.equal(normalizeBinanceExchangeInfoSymbol({
    symbol: "BTCUSD_PERP",
    contractType: "PERPETUAL",
    status: "TRADING",
    baseAsset: "BTC",
    quoteAsset: "USD",
    underlyingType: "COIN",
  }, observedAt), null);

  assert.equal(normalizeBinanceExchangeInfoSymbol({
    symbol: "ETHUSDT_260626",
    contractType: "CURRENT_QUARTER",
    status: "TRADING",
    baseAsset: "ETH",
    quoteAsset: "USDT",
    underlyingType: "COIN",
  }, observedAt), null);

  assert.equal(normalizeBinanceExchangeInfoSymbol({
    symbol: "OLDUSDT",
    contractType: "PERPETUAL",
    status: "BREAK",
    baseAsset: "OLD",
    quoteAsset: "USDT",
    underlyingType: "COIN",
  }, observedAt), null);

  assert.equal(normalizeBinanceExchangeInfoSymbol({
    symbol: "COHRUSDT",
    contractType: "TRADIFI_PERPETUAL",
    status: "TRADING",
    baseAsset: "COHR",
    quoteAsset: "USDT",
    underlyingType: "EQUITY",
  }, observedAt), null);

  assert.equal(normalizeBinanceExchangeInfoSymbol({
    symbol: "OPENAIUSDT",
    contractType: "TRADIFI_PERPETUAL",
    status: "TRADING",
    baseAsset: "OPENAI",
    quoteAsset: "USDT",
    underlyingType: "PREMARKET",
  }, observedAt), null);

  assert.equal(normalizeBinanceExchangeInfoSymbol({
    symbol: "龙虾USDT",
    contractType: "PERPETUAL",
    status: "TRADING",
    baseAsset: "龙虾",
    quoteAsset: "USDT",
    underlyingType: "COIN",
  }, observedAt), null);
});

test("createBinanceUniverseDiscoveryProvider fetches normalized USDT perpetual instruments", async () => {
  const requestedUrls: string[] = [];
  const provider = createBinanceUniverseDiscoveryProvider({
    now: () => new Date(observedAt),
    fetcher: async (input: Parameters<typeof fetch>[0]) => {
      requestedUrls.push(input.toString());

      return new Response(JSON.stringify({
        symbols: [
          {
            symbol: "ARBUSDT",
            pair: "ARBUSDT",
            contractType: "PERPETUAL",
            status: "TRADING",
            baseAsset: "ARB",
            quoteAsset: "USDT",
            underlyingType: "COIN",
          },
          {
            symbol: "BTCUSD_PERP",
            pair: "BTCUSD",
            contractType: "PERPETUAL",
            status: "TRADING",
            baseAsset: "BTC",
            quoteAsset: "USD",
            underlyingType: "COIN",
          },
          {
            symbol: "SOLUSDT",
            pair: "SOLUSDT",
            contractType: "PERPETUAL",
            status: "TRADING",
            baseAsset: "SOL",
            quoteAsset: "USDT",
            underlyingType: "COIN",
          },
          {
            symbol: "COHRUSDT",
            pair: "COHRUSDT",
            contractType: "TRADIFI_PERPETUAL",
            status: "TRADING",
            baseAsset: "COHR",
            quoteAsset: "USDT",
            underlyingType: "EQUITY",
          },
        ],
      }));
    },
  });

  const result = await provider.discoverInstruments();

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.source : "", "binance-public-futures");
  assert.deepEqual(result.ok ? result.instruments.map((item: { symbol: string }) => item.symbol) : [], [
    "ARBUSDT",
    "SOLUSDT",
  ]);
  assert.match(requestedUrls[0] ?? "", new RegExp(BINANCE_FUTURES_EXCHANGE_INFO_URL));
});

test("createBinanceUniverseDiscoveryProvider returns typed failures without throwing", async () => {
  const provider = createBinanceUniverseDiscoveryProvider({
    fetcher: async () => new Response("upstream down", { status: 503 }),
  });

  const result = await provider.discoverInstruments();

  assert.deepEqual(result, {
    ok: false,
    source: "binance-public-futures",
    reason: "upstream_error",
    error: "Universe discovery upstream returned 503",
    requestCount: 1,
    status: 503,
  });
});
