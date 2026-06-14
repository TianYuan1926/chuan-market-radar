import assert from "node:assert/strict";
import test from "node:test";

import {
  createOkxUniverseDiscoveryProvider,
  OKX_PUBLIC_INSTRUMENTS_URL,
  normalizeOkxInstrument,
} from "./okx-universe-discovery";

const observedAt = "2026-06-15T00:00:00.000Z";

test("normalizeOkxInstrument accepts live USDT linear swaps", () => {
  const instrument = normalizeOkxInstrument({
    instType: "SWAP",
    instId: "ARB-USDT-SWAP",
    baseCcy: "ARB",
    quoteCcy: "USDT",
    settleCcy: "USDT",
    ctType: "linear",
    state: "live",
  }, observedAt);

  assert.deepEqual(instrument, {
    id: "OKX:ARBUSDT",
    symbol: "ARBUSDT",
    baseAsset: "ARB",
    quoteAsset: "USDT",
    exchange: "OKX",
    marketType: "perpetual",
    isActive: true,
    volume24hUsd: 0,
    tags: ["okx-public-swap", "instType:SWAP", "ctType:linear", "state:live"],
    lastSeenAt: observedAt,
  });
});

test("normalizeOkxInstrument rejects non-USDT inactive or non-linear swaps", () => {
  assert.equal(normalizeOkxInstrument({
    instType: "SWAP",
    instId: "BTC-USD-SWAP",
    baseCcy: "BTC",
    quoteCcy: "USD",
    settleCcy: "USD",
    ctType: "inverse",
    state: "live",
  }, observedAt), null);

  assert.equal(normalizeOkxInstrument({
    instType: "SWAP",
    instId: "ETH-USDT-SWAP",
    baseCcy: "ETH",
    quoteCcy: "USDT",
    settleCcy: "USDT",
    ctType: "linear",
    state: "suspend",
  }, observedAt), null);

  assert.equal(normalizeOkxInstrument({
    instType: "FUTURES",
    instId: "SOL-USDT-260626",
    baseCcy: "SOL",
    quoteCcy: "USDT",
    settleCcy: "USDT",
    ctType: "linear",
    state: "live",
  }, observedAt), null);
});

test("createOkxUniverseDiscoveryProvider fetches normalized USDT swap instruments", async () => {
  const requestedUrls: string[] = [];
  const provider = createOkxUniverseDiscoveryProvider({
    now: () => new Date(observedAt),
    fetcher: async (input: Parameters<typeof fetch>[0]) => {
      requestedUrls.push(input.toString());

      return new Response(JSON.stringify({
        code: "0",
        msg: "",
        data: [
          {
            instType: "SWAP",
            instId: "ARB-USDT-SWAP",
            baseCcy: "ARB",
            quoteCcy: "USDT",
            settleCcy: "USDT",
            ctType: "linear",
            state: "live",
          },
          {
            instType: "SWAP",
            instId: "BTC-USD-SWAP",
            baseCcy: "BTC",
            quoteCcy: "USD",
            settleCcy: "USD",
            ctType: "inverse",
            state: "live",
          },
          {
            instType: "SWAP",
            instId: "SUI-USDT-SWAP",
            baseCcy: "SUI",
            quoteCcy: "USDT",
            settleCcy: "USDT",
            ctType: "linear",
            state: "live",
          },
        ],
      }));
    },
  });

  const result = await provider.discoverInstruments();

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.instruments.map((item) => item.symbol) : [], [
    "ARBUSDT",
    "SUIUSDT",
  ]);
  assert.match(requestedUrls[0] ?? "", new RegExp(OKX_PUBLIC_INSTRUMENTS_URL));
  assert.match(requestedUrls[0] ?? "", /instType=SWAP/);
});

test("createOkxUniverseDiscoveryProvider returns typed failures without throwing", async () => {
  const provider = createOkxUniverseDiscoveryProvider({
    fetcher: async () => new Response("upstream down", { status: 503 }),
  });

  const result = await provider.discoverInstruments();

  assert.deepEqual(result, {
    ok: false,
    source: "okx-public-swap",
    reason: "upstream_error",
    error: "Universe discovery upstream returned 503",
    status: 503,
  });
});
