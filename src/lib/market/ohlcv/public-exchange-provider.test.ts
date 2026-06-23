import assert from "node:assert/strict";
import test from "node:test";
import {
  binanceIntervalMap,
  bybitIntervalMap,
  createPublicExchangeOhlcvProvider,
  normalizeBinanceKline,
  normalizeBybitKline,
  normalizeOkxCandle,
  okxIntervalMap,
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
    openTime: "2024-06-10T06:13:20.000Z",
    open: 101.2,
    high: 110.5,
    low: 99.9,
    close: 108.4,
    volume: 12345.67,
    closeTime: "2024-06-10T06:14:19.999Z",
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

test("normalizeOkxCandle converts OKX swap candle rows into typed candles", () => {
  const candle = normalizeOkxCandle([
    "1718000000000",
    "101.2",
    "110.5",
    "99.9",
    "108.4",
    "12345.67",
    "987.65",
    "1234567.89",
    "1",
  ], "15m");

  assert.deepEqual(candle, {
    openTime: "2024-06-10T06:13:20.000Z",
    open: 101.2,
    high: 110.5,
    low: 99.9,
    close: 108.4,
    volume: 1234567.89,
    closeTime: "2024-06-10T06:28:19.999Z",
  });
});

test("normalizeBybitKline converts Bybit linear rows into typed candles", () => {
  const candle = normalizeBybitKline([
    "1718000000000",
    "101.2",
    "110.5",
    "99.9",
    "108.4",
    "12345.67",
    "1234567.89",
  ], "1h");

  assert.deepEqual(candle, {
    openTime: "2024-06-10T06:13:20.000Z",
    open: 101.2,
    high: 110.5,
    low: 99.9,
    close: 108.4,
    volume: 12345.67,
    closeTime: "2024-06-10T07:13:19.999Z",
  });
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
  assert.deepEqual(okxIntervalMap, {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1H",
    "4h": "4H",
    "1d": "1D",
    "1w": "1W",
  });
  assert.deepEqual(bybitIntervalMap, {
    "1m": "1",
    "5m": "5",
    "15m": "15",
    "30m": "30",
    "1h": "60",
    "4h": "240",
    "1d": "D",
    "1w": "W",
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

test("createPublicExchangeOhlcvProvider falls back to OKX when Binance OHLCV fails", async () => {
  const requestedUrls: string[] = [];
  const provider = createPublicExchangeOhlcvProvider({
    fetcher: async (input) => {
      const url = input.toString();
      requestedUrls.push(url);

      if (url.includes("fapi.binance.com")) {
        return new Response("blocked", { status: 451 });
      }

      return new Response(JSON.stringify({
        code: "0",
        data: [
          [
            "1718000000000",
            "101.2",
            "110.5",
            "99.9",
            "108.4",
            "12345.67",
            "987.65",
            "1234567.89",
            "1",
          ],
        ],
      }));
    },
  });

  const result = await provider.fetchCandles({
    symbol: "ENAUSDT",
    interval: "15m",
    limit: 120,
  });

  assert.equal(result.ok, true);
  assert.equal(result.source, "okx-public-swap");
  assert.deepEqual(result.ok ? result.candles.map((candle) => candle.close) : [], [108.4]);
  assert.match(requestedUrls[1] ?? "", /www\.okx\.com\/api\/v5\/market\/candles/);
  assert.match(requestedUrls[1] ?? "", /instId=ENA-USDT-SWAP/);
  assert.equal(requestedUrls.length, 2);
});

test("createPublicExchangeOhlcvProvider falls back to Bybit when Binance and OKX fail", async () => {
  const requestedUrls: string[] = [];
  const provider = createPublicExchangeOhlcvProvider({
    fetcher: async (input) => {
      const url = input.toString();
      requestedUrls.push(url);

      if (!url.includes("api.bybit.com")) {
        return new Response("blocked", { status: 451 });
      }

      return new Response(JSON.stringify({
        retCode: 0,
        result: {
          list: [
            [
              "1718000000000",
              "101.2",
              "110.5",
              "99.9",
              "108.4",
              "12345.67",
              "1234567.89",
            ],
          ],
        },
      }));
    },
  });

  const result = await provider.fetchCandles({
    symbol: "ENAUSDT",
    interval: "1h",
    limit: 120,
  });

  assert.equal(result.ok, true);
  assert.equal(result.source, "bybit-public-linear");
  assert.deepEqual(result.ok ? result.candles.map((candle) => candle.close) : [], [108.4]);
  assert.match(requestedUrls[2] ?? "", /api\.bybit\.com\/v5\/market\/kline/);
  assert.match(requestedUrls[2] ?? "", /category=linear/);
  assert.match(requestedUrls[2] ?? "", /symbol=ENAUSDT/);
  assert.equal(requestedUrls.length, 3);
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
    source: "public-exchange-ohlcv",
    symbol: "ENAUSDT",
    interval: "1h",
    reason: "upstream_error",
    error:
      "binance-public-futures:upstream_error:OHLCV upstream returned 503; okx-public-swap:upstream_error:OHLCV upstream returned 503; bybit-public-linear:upstream_error:OHLCV upstream returned 503",
    status: 503,
  });
});

test("createPublicExchangeOhlcvProvider times out hanging public K-line upstreams", async () => {
  const provider = createPublicExchangeOhlcvProvider({
    requestTimeoutMs: 50,
    fetcher: ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch,
  });

  const result = await provider.fetchCandles({
    symbol: "ENAUSDT",
    interval: "1h",
    limit: 50,
  });

  assert.equal(result.ok, false);
  assert.equal(result.source, "public-exchange-ohlcv");
  assert.equal(result.reason, "network_error");
  assert.match(result.ok ? "" : result.error, /timed out after 50ms/);
});
