import assert from "node:assert/strict";
import test from "node:test";
import {
  binanceIntervalMap,
  createPublicExchangeOhlcvProvider,
  normalizeBinanceKline,
} from "./public-exchange-provider";

test("normalizeBinanceKline converts Binance kline arrays into typed candles", () => {
  const candle = normalizeBinanceKline([
    1_718_000_000_000,
    "101.2",
    "110.5",
    "99.9",
    "108.4",
    "12345.67",
    1_718_000_059_999,
  ]);

  assert.deepEqual(candle, {
    openTime: "2024-06-10T08:53:20.000Z",
    open: 101.2,
    high: 110.5,
    low: 99.9,
    close: 108.4,
    volume: 12345.67,
    closeTime: "2024-06-10T08:54:19.999Z",
  });
});

test("normalizeBinanceKline rejects invalid numeric fields", () => {
  const candle = normalizeBinanceKline([
    1_718_000_000_000,
    "101.2",
    "bad-high",
    "99.9",
    "108.4",
    "12345.67",
    1_718_000_059_999,
  ]);

  assert.equal(candle, null);
});

test("createPublicExchangeOhlcvProvider maps all supported app intervals", () => {
  assert.deepEqual(binanceIntervalMap, {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
    "4h": "4h",
    "1d": "1d",
    "1w": "1w",
  });
});

test("createPublicExchangeOhlcvProvider fetches normalized candles from an injected fetcher", async () => {
  const requestedUrls: string[] = [];
  const provider = createPublicExchangeOhlcvProvider({
    fetcher: async (input) => {
      requestedUrls.push(input.toString());

      return new Response(JSON.stringify([
        [
          1_718_000_000_000,
          "101.2",
          "110.5",
          "99.9",
          "108.4",
          "12345.67",
          1_718_000_059_999,
        ],
      ]));
    },
  });

  const result = await provider.fetchCandles({
    symbol: "ENAUSDT",
    interval: "15m",
    limit: 120,
  });

  assert.equal(result.ok, true);
  assert.equal(result.source, "binance-public-futures");
  assert.equal(result.symbol, "ENAUSDT");
  assert.equal(result.interval, "15m");
  assert.deepEqual(result.ok ? result.candles.map((candle) => candle.close) : [], [108.4]);
  assert.match(requestedUrls[0] ?? "", /fapi\.binance\.com\/fapi\/v1\/klines/);
  assert.match(requestedUrls[0] ?? "", /symbol=ENAUSDT/);
  assert.match(requestedUrls[0] ?? "", /interval=15m/);
  assert.match(requestedUrls[0] ?? "", /limit=120/);
});

test("createPublicExchangeOhlcvProvider returns typed failures without throwing", async () => {
  const provider = createPublicExchangeOhlcvProvider({
    fetcher: async () => new Response("upstream down", { status: 503 }),
  });

  const result = await provider.fetchCandles({
    symbol: "ENAUSDT",
    interval: "1h",
    limit: 50,
  });

  assert.deepEqual(result, {
    ok: false,
    source: "binance-public-futures",
    symbol: "ENAUSDT",
    interval: "1h",
    reason: "upstream_error",
    error: "OHLCV upstream returned 503",
    status: 503,
  });
});
