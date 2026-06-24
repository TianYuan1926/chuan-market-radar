import assert from "node:assert/strict";
import test from "node:test";

import {
  createBinancePublicLightScanProvider,
  createBybitPublicLightScanProvider,
  createCompositePublicLightScanProvider,
  createOkxPublicLightScanProvider,
  disabledPublicLightScanProvider,
} from "./public-light-scan";

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  } as Response;
}

test("createBinancePublicLightScanProvider converts public futures tickers into light scan candidates", async () => {
  const provider = createBinancePublicLightScanProvider({
    now: () => new Date("2026-06-19T00:00:00.000Z"),
    fetcher: async (input) => {
      if (input.toString().includes("exchangeInfo")) {
        return response({
          symbols: [
            { symbol: "ARBUSDT", contractType: "PERPETUAL", status: "TRADING", baseAsset: "ARB", quoteAsset: "USDT", underlyingType: "COIN" },
            { symbol: "SUIUSDT", contractType: "PERPETUAL", status: "TRADING", baseAsset: "SUI", quoteAsset: "USDT", underlyingType: "COIN" },
            { symbol: "NVDAUSDT", contractType: "TRADIFI_PERPETUAL", status: "TRADING", baseAsset: "NVDA", quoteAsset: "USDT", underlyingType: "EQUITY" },
            { symbol: "ARMUSDT", contractType: "TRADIFI_PERPETUAL", status: "TRADING", baseAsset: "ARM", quoteAsset: "USDT", underlyingType: "EQUITY" },
            { symbol: "OPENAIUSDT", contractType: "TRADIFI_PERPETUAL", status: "TRADING", baseAsset: "OPENAI", quoteAsset: "USDT", underlyingType: "PREMARKET" },
          ],
        });
      }

      return response([
      {
        symbol: "ARBUSDT",
        lastPrice: "1.2",
        highPrice: "1.22",
        lowPrice: "1.01",
        priceChangePercent: "6.5",
        quoteVolume: "42000000",
      },
      {
        symbol: "SUIUSDT",
        lastPrice: "2.1",
        highPrice: "2.14",
        lowPrice: "2.05",
        priceChangePercent: "0.4",
        quoteVolume: "22000000",
      },
      {
        symbol: "BTCUSDC",
        lastPrice: "100",
        highPrice: "101",
        lowPrice: "99",
        priceChangePercent: "1",
        quoteVolume: "1000000",
      },
      {
        symbol: "NVDAUSDT",
        lastPrice: "140",
        highPrice: "145",
        lowPrice: "138",
        priceChangePercent: "3",
        quoteVolume: "90000000",
      },
      {
        symbol: "SOXLUSDT",
        lastPrice: "25",
        highPrice: "26",
        lowPrice: "24",
        priceChangePercent: "8",
        quoteVolume: "70000000",
      },
      {
        symbol: "CIENUSDT",
        lastPrice: "90",
        highPrice: "92",
        lowPrice: "88",
        priceChangePercent: "5",
        quoteVolume: "50000000",
      },
      {
        symbol: "RIVNUSDT",
        lastPrice: "18",
        highPrice: "19",
        lowPrice: "17",
        priceChangePercent: "7",
        quoteVolume: "64000000",
      },
      {
        symbol: "LRCXUSDT",
        lastPrice: "990",
        highPrice: "1010",
        lowPrice: "960",
        priceChangePercent: "4",
        quoteVolume: "61000000",
      },
      {
        symbol: "ISRGUSDT",
        lastPrice: "440",
        highPrice: "450",
        lowPrice: "430",
        priceChangePercent: "4",
        quoteVolume: "62000000",
      },
      {
        symbol: "RKLBUSDT",
        lastPrice: "20",
        highPrice: "21",
        lowPrice: "19",
        priceChangePercent: "6",
        quoteVolume: "63000000",
      },
      {
        symbol: "POETUSDT",
        lastPrice: "4",
        highPrice: "4.2",
        lowPrice: "3.8",
        priceChangePercent: "5",
        quoteVolume: "64000000",
      },
      {
        symbol: "SPCXUSDT",
        lastPrice: "166",
        highPrice: "170",
        lowPrice: "160",
        priceChangePercent: "9",
        quoteVolume: "65000000",
      },
      {
        symbol: "CLUSDT",
        lastPrice: "81",
        highPrice: "83",
        lowPrice: "80",
        priceChangePercent: "2",
        quoteVolume: "66000000",
      },
      {
        symbol: "MRVLUSDT",
        lastPrice: "68",
        highPrice: "70",
        lowPrice: "66",
        priceChangePercent: "4",
        quoteVolume: "67000000",
      },
      {
        symbol: "DRAMUSDT",
        lastPrice: "27",
        highPrice: "29",
        lowPrice: "26",
        priceChangePercent: "5",
        quoteVolume: "68000000",
      },
      {
        symbol: "SKHYNIXUSDT",
        lastPrice: "250",
        highPrice: "260",
        lowPrice: "240",
        priceChangePercent: "6",
        quoteVolume: "69000000",
      },
      {
        symbol: "MUUSDT",
        lastPrice: "115",
        highPrice: "118",
        lowPrice: "110",
        priceChangePercent: "3",
        quoteVolume: "70000000",
      },
      {
        symbol: "QCOMUSDT",
        lastPrice: "155",
        highPrice: "160",
        lowPrice: "150",
        priceChangePercent: "3",
        quoteVolume: "71000000",
      },
      {
        symbol: "ARMUSDT",
        lastPrice: "130",
        highPrice: "135",
        lowPrice: "125",
        priceChangePercent: "4",
        quoteVolume: "72000000",
      },
    ]);
    },
  });

  const result = await provider.scan();

  assert.equal(result.diagnostics.status, "ready");
  assert.equal(result.diagnostics.universeCount, 19);
  assert.equal(result.diagnostics.acceptedCount, 2);
  assert.equal(result.instruments.length, 2);
  assert.deepEqual(result.instruments.map((item) => item.symbol), ["ARBUSDT", "SUIUSDT"]);
  assert.deepEqual(result.priorityCandidates.map((item) => item.symbol), ["ARBUSDT", "SUIUSDT"]);
  assert.equal(result.priorityCandidates[0]?.state, "HOT");
  assert.equal(result.priorityCandidates[1]?.state, "PRE_TREND");
  assert.equal(result.tickers[0]?.exchange, "BINANCE");
});

test("createBinancePublicLightScanProvider caps overextended 24h movers below compression candidates", async () => {
  const provider = createBinancePublicLightScanProvider({
    now: () => new Date("2026-06-21T00:00:00.000Z"),
    fetcher: async (input) => {
      if (input.toString().includes("exchangeInfo")) {
        return response({
          symbols: [
            { symbol: "MOONUSDT", contractType: "PERPETUAL", status: "TRADING", baseAsset: "MOON", quoteAsset: "USDT", underlyingType: "COIN" },
            { symbol: "COILUSDT", contractType: "PERPETUAL", status: "TRADING", baseAsset: "COIL", quoteAsset: "USDT", underlyingType: "COIN" },
          ],
        });
      }

      return response([
      {
        symbol: "MOONUSDT",
        lastPrice: "1.35",
        highPrice: "1.36",
        lowPrice: "0.98",
        priceChangePercent: "35",
        quoteVolume: "50000000",
      },
      {
        symbol: "COILUSDT",
        lastPrice: "1.02",
        highPrice: "1.05",
        lowPrice: "1.00",
        priceChangePercent: "1.2",
        quoteVolume: "32000000",
      },
    ]);
    },
  });

  const result = await provider.scan();

  assert.deepEqual(result.priorityCandidates.map((item) => item.symbol), ["COILUSDT", "MOONUSDT"]);
  assert.equal(result.priorityCandidates[0]?.state, "PRE_TREND");
  assert.ok(result.priorityCandidates[0]?.reasons.includes("compression_priority"));
  assert.ok(result.priorityCandidates[1]?.reasons.includes("overextended_move_capped"));
});

test("createBinancePublicLightScanProvider returns a typed failure without throwing", async () => {
  const provider = createBinancePublicLightScanProvider({
    fetcher: async () => response({ error: "blocked" }, false, 451),
  });

  const result = await provider.scan();

  assert.equal(result.diagnostics.status, "failed");
  assert.equal(result.diagnostics.requestCount, 1);
  assert.match(result.diagnostics.notes.join(" "), /451/);
  assert.equal(result.priorityCandidates.length, 0);
});

test("createBinancePublicLightScanProvider times out a hanging upstream instead of blocking pages", async () => {
  const provider = createBinancePublicLightScanProvider({
    requestTimeoutMs: 50,
    fetcher: ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch,
  });

  const result = await provider.scan();

  assert.equal(result.diagnostics.status, "failed");
  assert.match(result.diagnostics.notes.join(" "), /timed out after 50ms/);
  assert.equal(result.priorityCandidates.length, 0);
});

test("createOkxPublicLightScanProvider converts public swap tickers into light scan candidates", async () => {
  const provider = createOkxPublicLightScanProvider({
    now: () => new Date("2026-06-20T00:00:00.000Z"),
    fetcher: async (input) => {
      const url = input.toString();
      assert.match(url, /instType=SWAP/u);

      if (url.includes("/public/instruments")) {
        return response({
          code: "0",
          data: [
            { instCategory: "1", instId: "ARB-USDT-SWAP", instType: "SWAP", settleCcy: "USDT", ctType: "linear", ruleType: "normal", state: "live" },
            { instCategory: "3", instId: "COHR-USDT-SWAP", instType: "SWAP", settleCcy: "USDT", ctType: "linear", ruleType: "normal", state: "live" },
            { instCategory: "3", instId: "OPENAI-USDT-SWAP", instType: "SWAP", settleCcy: "USDT", ctType: "linear", ruleType: "pre_market", state: "live" },
          ],
        });
      }

      return response({
        code: "0",
        data: [
          { instId: "ARB-USDT-SWAP", last: "1.2", open24h: "1.1", high24h: "1.22", low24h: "1.01", volCcy24h: "35000000" },
          { instId: "BTC-USDC-SWAP", last: "100", open24h: "99", high24h: "101", low24h: "98", volCcy24h: "1000" },
          { instId: "COHR-USDT-SWAP", last: "85", open24h: "80", high24h: "88", low24h: "78", volCcy24h: "1000000" },
          { instId: "OPENAI-USDT-SWAP", last: "700", open24h: "650", high24h: "720", low24h: "640", volCcy24h: "1000000" },
        ],
      });
    },
  });

  const result = await provider.scan();

  assert.equal(result.diagnostics.status, "ready");
  assert.equal(result.diagnostics.universeCount, 4);
  assert.equal(result.diagnostics.acceptedCount, 1);
  assert.deepEqual(result.instruments.map((item) => item.symbol), ["ARBUSDT"]);
  assert.equal(result.instruments[0]?.exchange, "OKX");
  assert.equal(result.priorityCandidates[0]?.state, "HOT");
  assert.equal(result.tickers[0]?.changePercent24h.toFixed(2), "9.09");
});

test("createBybitPublicLightScanProvider converts public linear tickers into light scan candidates", async () => {
  const provider = createBybitPublicLightScanProvider({
    now: () => new Date("2026-06-20T00:00:00.000Z"),
    fetcher: async (input) => {
      const url = input.toString();
      assert.match(url, /category=linear/u);

      if (url.includes("/instruments-info")) {
        return response({
          retCode: 0,
          result: {
            list: [
              { symbol: "MANTAUSDT", baseCoin: "MANTA", quoteCoin: "USDT", contractType: "LinearPerpetual", status: "Trading", symbolType: "innovation" },
              { symbol: "COHRUSDT", baseCoin: "COHR", quoteCoin: "USDT", contractType: "LinearPerpetual", status: "Trading", symbolType: "stock" },
            ],
            nextPageCursor: "",
          },
        });
      }

      return response({
        retCode: 0,
        result: {
          list: [
            { symbol: "MANTAUSDT", lastPrice: "2.4", price24hPcnt: "0.081", highPrice24h: "2.46", lowPrice24h: "2.05", turnover24h: "54000000" },
            { symbol: "BTCUSDC", lastPrice: "100", price24hPcnt: "0.01", highPrice24h: "101", lowPrice24h: "99", turnover24h: "1000000" },
            { symbol: "COHRUSDT", lastPrice: "435", price24hPcnt: "0.11", highPrice24h: "440", lowPrice24h: "380", turnover24h: "8400000" },
          ],
        },
      });
    },
  });

  const result = await provider.scan();

  assert.equal(result.diagnostics.status, "ready");
  assert.equal(result.diagnostics.universeCount, 3);
  assert.equal(result.diagnostics.acceptedCount, 1);
  assert.deepEqual(result.instruments.map((item) => item.symbol), ["MANTAUSDT"]);
  assert.equal(result.instruments[0]?.exchange, "BYBIT");
  assert.equal(result.priorityCandidates[0]?.state, "HOT");
  assert.equal(result.tickers[0]?.changePercent24h, 8.1);
});

test("createCompositePublicLightScanProvider merges Binance and OKX candidates without hiding partial failures", async () => {
  const provider = createCompositePublicLightScanProvider({
    providers: [
      {
        id: "binance-test",
        label: "Binance Test",
        async scan() {
          return {
            diagnostics: {
              acceptedCount: 2,
              candidateCount: 2,
              generatedAt: "2026-06-20T00:00:00.000Z",
              notes: ["binance ready"],
              requestCount: 1,
              source: "binance-test",
              status: "ready",
              topCandidates: [],
              universeCount: 2,
            },
            instruments: [
              {
                id: "BINANCE-LIGHT:ARBUSDT",
                symbol: "ARBUSDT",
                baseAsset: "ARB",
                quoteAsset: "USDT",
                exchange: "BINANCE",
                marketType: "perpetual",
                isActive: true,
                volume24hUsd: 42_000_000,
                tags: ["test"],
                lastSeenAt: "2026-06-20T00:00:00.000Z",
              },
            ],
            priorityCandidates: [
              {
                baseAsset: "ARB",
                changePercent24h: 6.5,
                distanceFromHighPercent: 2,
                distanceFromLowPercent: 14,
                reasons: ["price_volume_anomaly"],
                score: 80,
                state: "HOT",
                symbol: "ARBUSDT",
                volume24hUsd: 42_000_000,
                volumeSource: "rolling_window",
                volumeWindowMs: 15 * 60_000,
                volumeWindowUsd: 42_000_000,
                volatilityPercent: 8,
              },
            ],
            tickers: [],
          };
        },
      },
      {
        id: "okx-test",
        label: "OKX Test",
        async scan() {
          return {
            diagnostics: {
              acceptedCount: 1,
              candidateCount: 1,
              generatedAt: "2026-06-20T00:00:00.000Z",
              notes: ["okx ready"],
              requestCount: 1,
              source: "okx-test",
              status: "ready",
              topCandidates: [],
              universeCount: 1,
            },
            instruments: [
              {
                id: "OKX-LIGHT:ARBUSDT",
                symbol: "ARBUSDT",
                baseAsset: "ARB",
                quoteAsset: "USDT",
                exchange: "OKX",
                marketType: "perpetual",
                isActive: true,
                volume24hUsd: 39_000_000,
                tags: ["test"],
                lastSeenAt: "2026-06-20T00:00:00.000Z",
              },
            ],
            priorityCandidates: [
              {
                baseAsset: "ARB",
                changePercent24h: 6.1,
                distanceFromHighPercent: 1.8,
                distanceFromLowPercent: 13,
                reasons: ["near_24h_edge"],
                score: 78,
                state: "HOT",
                symbol: "ARBUSDT",
                volume24hUsd: 39_000_000,
                volumeSource: "24h_ticker",
                volatilityPercent: 7,
              },
            ],
            tickers: [],
          };
        },
      },
      {
        id: "blocked-test",
        label: "Blocked Test",
        async scan() {
          return {
            diagnostics: {
              acceptedCount: 0,
              candidateCount: 0,
              generatedAt: "2026-06-20T00:00:00.000Z",
              notes: ["region blocked"],
              requestCount: 1,
              source: "blocked-test",
              status: "failed",
              topCandidates: [],
              universeCount: 0,
            },
            instruments: [],
            priorityCandidates: [],
            tickers: [],
          };
        },
      },
      disabledPublicLightScanProvider(() => new Date("2026-06-20T00:00:00.000Z")),
    ],
  });

  const result = await provider.scan();

  assert.equal(result.diagnostics.status, "partial");
  assert.equal(result.diagnostics.source, "public-light-composite");
  assert.equal(result.diagnostics.requestCount, 3);
  assert.equal(result.diagnostics.acceptedCount, 2);
  assert.equal(result.priorityCandidates.length, 1);
  assert.equal(result.priorityCandidates[0]?.symbol, "ARBUSDT");
  assert.equal(result.priorityCandidates[0]?.volume24hUsd, 39_000_000);
  assert.equal(result.priorityCandidates[0]?.volumeSource, "24h_ticker");
  assert.equal(result.priorityCandidates[0]?.volumeWindowUsd, undefined);
  assert.match(result.priorityCandidates[0]?.reasons.join(" ") ?? "", /cross_exchange_light_scan/u);
  assert.match(result.diagnostics.notes.join("\n"), /binance-test ready 2\/2 accepted/u);
  assert.match(result.diagnostics.notes.join("\n"), /okx-test ready 1\/1 accepted/u);
  assert.match(result.diagnostics.notes.join("\n"), /blocked-test failed 0\/0 accepted/u);
});

test("createCompositePublicLightScanProvider keeps WebSocket window tickers out of market ticker boards", async () => {
  const provider = createCompositePublicLightScanProvider({
    providers: [
      {
        id: "ws-test",
        label: "WebSocket Test",
        async scan() {
          return {
            diagnostics: {
              acceptedCount: 1,
              candidateCount: 1,
              generatedAt: "2026-06-20T00:00:00.000Z",
              notes: ["15m window"],
              requestCount: 0,
              source: "websocket-light-scan",
              status: "ready",
              topCandidates: [],
              universeCount: 1,
            },
            instruments: [],
            priorityCandidates: [],
            tickers: [{
              changePercent24h: 5,
              exchange: "BINANCE",
              high24h: 1.1,
              low24h: 1,
              price: 1.05,
              symbol: "ARBUSDT",
              updatedAt: "2026-06-20T00:00:05.000Z",
              volume24hUsd: 1_250_000,
            }],
          };
        },
      },
      {
        id: "rest-test",
        label: "REST Test",
        async scan() {
          return {
            diagnostics: {
              acceptedCount: 1,
              candidateCount: 1,
              generatedAt: "2026-06-20T00:00:00.000Z",
              notes: ["24h ticker"],
              requestCount: 1,
              source: "binance-public-futures-24h",
              status: "ready",
              topCandidates: [],
              universeCount: 1,
            },
            instruments: [],
            priorityCandidates: [],
            tickers: [{
              changePercent24h: 2.5,
              exchange: "BINANCE",
              high24h: 1.2,
              low24h: 0.9,
              price: 1.05,
              symbol: "ARBUSDT",
              updatedAt: "2026-06-20T00:00:00.000Z",
              volume24hUsd: 42_000_000,
            }],
          };
        },
      },
    ],
  });

  const result = await provider.scan();

  assert.equal(result.tickers.length, 1);
  assert.equal(result.tickers[0]?.changePercent24h, 2.5);
  assert.equal(result.tickers[0]?.volume24hUsd, 42_000_000);
});

test("disabledPublicLightScanProvider keeps tests and previews offline", async () => {
  const provider = disabledPublicLightScanProvider(() => new Date("2026-06-19T00:00:00.000Z"));
  const result = await provider.scan();

  assert.equal(result.diagnostics.status, "disabled");
  assert.equal(result.diagnostics.requestCount, 0);
  assert.equal(result.instruments.length, 0);
});
