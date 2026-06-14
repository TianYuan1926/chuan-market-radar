import assert from "node:assert/strict";
import test from "node:test";

import {
  BYBIT_LINEAR_INSTRUMENTS_URL,
  createBybitUniverseDiscoveryProvider,
  normalizeBybitInstrument,
} from "./bybit-universe-discovery";

const observedAt = "2026-06-15T00:00:00.000Z";

test("normalizeBybitInstrument accepts trading USDT linear perpetual contracts", () => {
  const instrument = normalizeBybitInstrument({
    symbol: "ARBUSDT",
    baseCoin: "ARB",
    quoteCoin: "USDT",
    contractType: "LinearPerpetual",
    status: "Trading",
  }, observedAt);

  assert.deepEqual(instrument, {
    id: "BYBIT:ARBUSDT",
    symbol: "ARBUSDT",
    baseAsset: "ARB",
    quoteAsset: "USDT",
    exchange: "BYBIT",
    marketType: "perpetual",
    isActive: true,
    volume24hUsd: 0,
    tags: ["bybit-public-linear", "contractType:LinearPerpetual", "status:Trading"],
    lastSeenAt: observedAt,
  });
});

test("normalizeBybitInstrument rejects non-USDT inactive or dated contracts", () => {
  assert.equal(normalizeBybitInstrument({
    symbol: "BTCUSD",
    baseCoin: "BTC",
    quoteCoin: "USD",
    contractType: "InversePerpetual",
    status: "Trading",
  }, observedAt), null);

  assert.equal(normalizeBybitInstrument({
    symbol: "ETHUSDT",
    baseCoin: "ETH",
    quoteCoin: "USDT",
    contractType: "LinearPerpetual",
    status: "Settling",
  }, observedAt), null);

  assert.equal(normalizeBybitInstrument({
    symbol: "SOLUSDT-26JUN26",
    baseCoin: "SOL",
    quoteCoin: "USDT",
    contractType: "LinearFutures",
    status: "Trading",
  }, observedAt), null);
});

test("createBybitUniverseDiscoveryProvider fetches paginated normalized USDT perpetual instruments", async () => {
  const requestedUrls: string[] = [];
  const provider = createBybitUniverseDiscoveryProvider({
    now: () => new Date(observedAt),
    fetcher: async (input: Parameters<typeof fetch>[0]) => {
      const url = input.toString();
      requestedUrls.push(url);

      if (url.includes("cursor=next-page")) {
        return new Response(JSON.stringify({
          retCode: 0,
          retMsg: "OK",
          result: {
            list: [
              {
                symbol: "SUIUSDT",
                baseCoin: "SUI",
                quoteCoin: "USDT",
                contractType: "LinearPerpetual",
                status: "Trading",
              },
            ],
            nextPageCursor: "",
          },
        }));
      }

      return new Response(JSON.stringify({
        retCode: 0,
        retMsg: "OK",
        result: {
          list: [
            {
              symbol: "ARBUSDT",
              baseCoin: "ARB",
              quoteCoin: "USDT",
              contractType: "LinearPerpetual",
              status: "Trading",
            },
            {
              symbol: "BTCUSD",
              baseCoin: "BTC",
              quoteCoin: "USD",
              contractType: "InversePerpetual",
              status: "Trading",
            },
          ],
          nextPageCursor: "next-page",
        },
      }));
    },
  });

  const result = await provider.discoverInstruments();

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.instruments.map((item) => item.symbol) : [], [
    "ARBUSDT",
    "SUIUSDT",
  ]);
  assert.match(requestedUrls[0] ?? "", new RegExp(BYBIT_LINEAR_INSTRUMENTS_URL));
  assert.match(requestedUrls[0] ?? "", /category=linear/);
  assert.match(requestedUrls[1] ?? "", /cursor=next-page/);
});

test("createBybitUniverseDiscoveryProvider returns typed failures without throwing", async () => {
  const provider = createBybitUniverseDiscoveryProvider({
    fetcher: async () => new Response("upstream down", { status: 503 }),
  });

  const result = await provider.discoverInstruments();

  assert.deepEqual(result, {
    ok: false,
    source: "bybit-public-linear",
    reason: "upstream_error",
    error: "Universe discovery upstream returned 503",
    status: 503,
  });
});
