import assert from "node:assert/strict";
import test from "node:test";
import {
  coinGlassDefaultRequestConcurrencyForTest,
  coinGlassRequestConcurrencyForTest,
  createCoinGlassProvider,
} from "./coinglass-provider";
import type { Candle, OhlcvProvider } from "../ohlcv/types";
import type { PublicLightScanProvider } from "./public-light-scan";

function coinglassRow(symbol: string, overrides: Record<string, string | number> = {}) {
  return {
    instrument_id: `${symbol}USDT`,
    exchange_name: "Binance",
    symbol: `${symbol}/USDT`,
    current_price: 1,
    price_change_percent_24h: 2,
    volume_usd: 25_000_000,
    volume_usd_change_percent_24h: 10,
    open_interest_usd: 12_000_000,
    open_interest_change_percent_24h: 4,
    funding_rate: 0.0001,
    long_liquidation_usd_24h: 100_000,
    short_liquidation_usd_24h: 50_000,
    ...overrides,
  };
}

function ohlcvCandle(index: number, close: number): Candle {
  const openDate = new Date(Date.UTC(2026, 0, 1, 0, index));

  return {
    openTime: openDate.toISOString(),
    open: close - 0.2,
    high: close + 0.4,
    low: close - 0.5,
    close,
    volume: 100 + index * 20,
    closeTime: new Date(openDate.getTime() + 59_000).toISOString(),
  };
}

function publicLightScanProviderForTest(): PublicLightScanProvider {
  return {
    id: "test-public-light-scan",
    label: "Test Public Light Scan",
    async scan() {
      const candidate = {
        baseAsset: "ARB",
        changePercent24h: 6.4,
        distanceFromHighPercent: 1.2,
        distanceFromLowPercent: 8.4,
        reasons: ["price_volume_anomaly", "near_24h_edge"],
        score: 92,
        state: "HOT" as const,
        symbol: "ARBUSDT",
        volume24hUsd: 64_000_000,
        volatilityPercent: 9.6,
      };

      return {
        diagnostics: {
          acceptedCount: 1,
          candidateCount: 1,
          generatedAt: "2026-06-15T00:00:00.000Z",
          notes: ["test light scan selected ARB"],
          requestCount: 1,
          source: "test-public-light-scan",
          status: "ready" as const,
          topCandidates: [candidate],
          universeCount: 1,
        },
        instruments: [
          {
            id: "BINANCE-LIGHT:ARBUSDT",
            symbol: "ARBUSDT",
            baseAsset: "ARB",
            quoteAsset: "USDT" as const,
            exchange: "BINANCE" as const,
            marketType: "perpetual" as const,
            isActive: true,
            volume24hUsd: 64_000_000,
            tags: ["test-public-light-scan"],
            lastSeenAt: "2026-06-15T00:00:00.000Z",
          },
        ],
        priorityCandidates: [candidate],
        tickers: [],
      };
    },
  };
}

test("CoinGlass provider fetches only the current low-rate scan batch", async () => {
  const requestedSymbols: string[] = [];
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["BTC", "ETH", "SOL", "ENA", "SUI"],
    batchSize: 3,
    now: () => new Date("2026-06-12T00:15:00.000Z"),
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";
      requestedSymbols.push(symbol);

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [coinglassRow(symbol)],
      }));
    },
  });

  const snapshot = await provider.fetchSnapshot();

  assert.deepEqual(requestedSymbols, ["BTC", "ETH", "ENA"]);
  assert.equal(snapshot.metadata.scannedCount, 3);
  assert.equal(snapshot.metadata.coverage?.total, 5);
  assert.equal(snapshot.metadata.coverage?.scanned, 3);
  assert.equal(snapshot.metadata.coverage?.pending, 2);
  assert.equal(snapshot.metadata.coverage?.coveragePercent, 60);
  assert.deepEqual(snapshot.metadata.coverage?.scannedAssets, ["BTC", "ETH", "ENA"]);
  assert.match(snapshot.metadata.notes.join("\n"), /batch 2\/3/);
  assert.match(snapshot.metadata.notes.join("\n"), /requests 3\/5/);
});

test("CoinGlass provider clamps request concurrency for Hobbyist-safe bursts", () => {
  assert.equal(coinGlassDefaultRequestConcurrencyForTest(), 6);
  assert.equal(coinGlassRequestConcurrencyForTest(), 6);
  assert.equal(coinGlassRequestConcurrencyForTest(0), 1);
  assert.equal(coinGlassRequestConcurrencyForTest(12), 12);
  assert.equal(coinGlassRequestConcurrencyForTest(99), 30);
});

test("CoinGlass provider paces deep scan requests before hitting the API", async () => {
  const requestedSymbols: string[] = [];
  const sleepIntervals: number[] = [];
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["BTC", "ETH", "SOL", "ENA"],
    batchSize: 4,
    maxConcurrentRequests: 4,
    requestIntervalMs: 500,
    requestPaceSleep: async (ms) => {
      sleepIntervals.push(ms);
    },
    now: () => new Date("2026-06-21T00:00:00.000Z"),
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";
      requestedSymbols.push(symbol);

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [coinglassRow(symbol)],
      }));
    },
  });

  const snapshot = await provider.fetchSnapshot();

  assert.deepEqual(requestedSymbols, ["BTC", "ETH", "SOL", "ENA"]);
  assert.deepEqual(sleepIntervals, [500, 500, 500]);
  assert.match(snapshot.metadata.notes.join("\n"), /coinglass pacing: 500ms between deep-scan requests/);
});

test("CoinGlass provider defaults to a 24 request scan batch when discovery widens the universe", async () => {
  const requestedSymbols: string[] = [];
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["ENA"],
    universeDiscoveryProvider: {
      id: "test-discovery",
      label: "Test Universe Discovery",
      async discoverInstruments() {
        return {
          ok: true,
          source: "test-discovery",
          instruments: Array.from({ length: 30 }, (_, index) => ({
            id: `BINANCE:ALT${index + 1}USDT`,
            symbol: `ALT${index + 1}USDT`,
            baseAsset: `ALT${index + 1}`,
            quoteAsset: "USDT" as const,
            exchange: "BINANCE" as const,
            marketType: "perpetual" as const,
            isActive: true,
            volume24hUsd: 25_000_000,
            tags: ["test-discovery"],
            lastSeenAt: "2026-06-15T00:00:00.000Z",
          })),
        };
      },
    },
    now: () => new Date("2026-06-15T00:00:00.000Z"),
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";
      requestedSymbols.push(symbol);

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [coinglassRow(symbol)],
      }));
    },
  });

  const snapshot = await provider.fetchSnapshot();

  assert.equal(requestedSymbols.length, 24);
  assert.equal(snapshot.metadata.quota?.requestedBatchSize, 24);
  assert.equal(snapshot.metadata.coverage?.scanned, 24);
  assert.equal(snapshot.metadata.coverage?.pending, 9);
  assert.match(snapshot.metadata.notes.join("\n"), /quota guard: requested batch 24 kept/);
});

test("CoinGlass provider pins BTC and ETH anchors inside the structured universe scan plan", async () => {
  const requestedSymbols: string[] = [];
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["ENA", "SUI", "ONDO", "TIA"],
    batchSize: 4,
    now: () => new Date("2026-06-12T00:15:00.000Z"),
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";
      requestedSymbols.push(symbol);

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [coinglassRow(symbol)],
      }));
    },
  });

  const snapshot = await provider.fetchSnapshot();

  assert.deepEqual(requestedSymbols.slice(0, 2), ["BTC", "ETH"]);
  assert.equal(snapshot.metadata.coverage?.total, 6);
  assert.equal(snapshot.metadata.coverage?.scanned, 4);
  assert.equal(snapshot.metadata.coverage?.pending, 2);
  assert.equal(snapshot.metadata.coverage?.totalBatches, 2);
  assert.match(snapshot.metadata.notes.join("\n"), /coverage 4\/6 \(67%\)/);
});

test("CoinGlass provider can include discovered USDT perpetuals in the low-rate scan plan", async () => {
  const requestedSymbols: string[] = [];
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["ENA"],
    batchSize: 5,
    universeDiscoveryProvider: {
      id: "test-discovery",
      label: "Test Universe Discovery",
      async discoverInstruments() {
        return {
          ok: true,
          source: "test-discovery",
          instruments: [
            {
              id: "BINANCE:ARBUSDT",
              symbol: "ARBUSDT",
              baseAsset: "ARB",
              quoteAsset: "USDT",
              exchange: "BINANCE",
              marketType: "perpetual",
              isActive: true,
              volume24hUsd: 0,
              tags: ["test-discovery"],
              lastSeenAt: "2026-06-15T00:00:00.000Z",
            },
            {
              id: "BINANCE:SOLUSDT",
              symbol: "SOLUSDT",
              baseAsset: "SOL",
              quoteAsset: "USDT",
              exchange: "BINANCE",
              marketType: "perpetual",
              isActive: true,
              volume24hUsd: 0,
              tags: ["test-discovery"],
              lastSeenAt: "2026-06-15T00:00:00.000Z",
            },
          ],
        };
      },
    },
    now: () => new Date("2026-06-15T00:00:00.000Z"),
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";
      requestedSymbols.push(symbol);

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [coinglassRow(symbol)],
      }));
    },
  });

  const snapshot = await provider.fetchSnapshot();

  assert.deepEqual(requestedSymbols, ["BTC", "ETH", "ENA", "ARB", "SOL"]);
  assert.equal(snapshot.metadata.coverage?.total, 5);
  assert.equal(snapshot.metadata.coverage?.scanned, 5);
  assert.match(snapshot.metadata.notes.join("\n"), /universe discovery: test-discovery ok 2 instruments/);
});

test("CoinGlass provider caps oversized batches with the daily request budget guard", async () => {
  const requestedSymbols: string[] = [];
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["ENA", "SUI", "ONDO", "TIA", "ARB", "OP"],
    batchSize: 12,
    coinGlassDailyRequestBudget: 300,
    universeDiscoveryProvider: {
      id: "test-discovery",
      label: "Test Universe Discovery",
      async discoverInstruments() {
        return {
          ok: true,
          source: "test-discovery",
          requestCount: 3,
          instruments: [],
        };
      },
    },
    now: () => new Date("2026-06-15T00:00:00.000Z"),
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";
      requestedSymbols.push(symbol);

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [coinglassRow(symbol)],
      }));
    },
  });

  const snapshot = await provider.fetchSnapshot();

  assert.equal(requestedSymbols.length, 3);
  assert.deepEqual(requestedSymbols.slice(0, 2), ["BTC", "ETH"]);
  assert.equal(snapshot.metadata.quota?.effectiveBatchSize, 3);
  assert.equal(snapshot.metadata.quota?.coinGlassRequestsPerDayEstimate, 288);
  assert.equal(snapshot.metadata.quota?.status, "near_budget");
  assert.match(snapshot.metadata.notes.join("\n"), /quota guard: requested batch 12 capped to 3/);
  assert.match(snapshot.metadata.notes.join("\n"), /quota: coinglass 288\/300 daily \(96%\), public discovery 288 daily, status near_budget/);
});

test("CoinGlass provider promotes dynamic priority hints when rotating capacity has a spare slot", async () => {
  const requestedSymbols: string[] = [];
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["SOL", "ENA"],
    batchSize: 4,
    universePriorityHints: [
      {
        symbol: "ARBUSDT",
        anomalyScore: 96,
        recentSignalCount: 2,
      },
    ],
    universeDiscoveryProvider: {
      id: "test-discovery",
      label: "Test Universe Discovery",
      async discoverInstruments() {
        return {
          ok: true,
          source: "test-discovery",
          instruments: [
            {
              id: "BINANCE:ARBUSDT",
              symbol: "ARBUSDT",
              baseAsset: "ARB",
              quoteAsset: "USDT",
              exchange: "BINANCE",
              marketType: "perpetual",
              isActive: true,
              volume24hUsd: 0,
              tags: ["test-discovery"],
              lastSeenAt: "2026-06-15T00:00:00.000Z",
            },
          ],
        };
      },
    },
    now: () => new Date("2026-06-15T00:00:00.000Z"),
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";
      requestedSymbols.push(symbol);

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [coinglassRow(symbol)],
      }));
    },
  });

  const snapshot = await provider.fetchSnapshot();

  assert.deepEqual(requestedSymbols, ["BTC", "ETH", "ARB", "ENA"]);
  assert.equal(snapshot.metadata.coverage?.scanned, 4);
  assert.match(snapshot.metadata.notes.join("\n"), /dynamic priority: selected ARB/);
  assert.match(snapshot.metadata.notes.join("\n"), /top ARB/);
});

test("CoinGlass provider promotes public light scan candidates into CoinGlass deep scan", async () => {
  const requestedSymbols: string[] = [];
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["SOL", "ENA"],
    batchSize: 4,
    publicLightScanProvider: publicLightScanProviderForTest(),
    now: () => new Date("2026-06-15T00:00:00.000Z"),
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";
      requestedSymbols.push(symbol);

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [coinglassRow(symbol)],
      }));
    },
  });

  const snapshot = await provider.fetchSnapshot();

  assert.deepEqual(requestedSymbols, ["BTC", "ETH", "ARB", "ENA"]);
  assert.equal(snapshot.metadata.lightScan?.status, "ready");
  assert.equal(snapshot.metadata.lightScan?.topCandidates[0]?.symbol, "ARBUSDT");
  assert.deepEqual(snapshot.metadata.diagnostics?.requests.plannedAssets, requestedSymbols);
  assert.equal(snapshot.metadata.diagnostics?.requests.coinGlassRequestsPlanned, 4);
  assert.equal(snapshot.metadata.diagnostics?.requests.emptyResultAssets.length, 0);
  assert.match(snapshot.metadata.notes.join("\n"), /public light scan: test-public-light-scan ready 1\/1 accepted, candidates 1/);
  assert.match(snapshot.metadata.notes.join("\n"), /public light scan priority hints: ARB/);
  assert.match(snapshot.metadata.notes.join("\n"), /dynamic priority: selected ARB/);
});

test("CoinGlass provider preserves public scan output when paid deep scan is plan-restricted", async () => {
  const requestedSymbols: string[] = [];
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["ARB"],
    batchSize: 3,
    publicLightScanProvider: publicLightScanProviderForTest(),
    now: () => new Date("2026-06-15T00:00:00.000Z"),
    fetcher: async (input) => {
      const url = new URL(input.toString());
      requestedSymbols.push(url.searchParams.get("symbol") ?? "");

      return new Response(JSON.stringify({
        code: "403001",
        msg: "Upgrade Plan",
        data: null,
      }));
    },
  });

  const snapshot = await provider.fetchSnapshot();

  assert.deepEqual(requestedSymbols, ["BTC", "ETH", "ARB"]);
  assert.equal(snapshot.metadata.status, "partial");
  assert.equal(snapshot.metadata.lightScan?.status, "ready");
  assert.equal(snapshot.metadata.diagnostics?.requests.coinGlassRequestsPlanned, 3);
  assert.equal(snapshot.metadata.diagnostics?.requests.rawRows, 0);
  assert.equal(snapshot.metadata.anomalyCount, 0);
  assert.match(snapshot.metadata.notes.join("\n"), /coinglass deep scan degraded: 3\/3 requests failed/);
  assert.match(snapshot.metadata.notes.join("\n"), /BTC: Upgrade Plan/);
});

test("CoinGlass provider marks zero clean rows as partial even when the API envelope succeeds", async () => {
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["ARB"],
    batchSize: 3,
    publicLightScanProvider: publicLightScanProviderForTest(),
    now: () => new Date("2026-06-15T00:00:00.000Z"),
    fetcher: async () =>
      new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [],
      })),
  });

  const snapshot = await provider.fetchSnapshot();

  assert.equal(snapshot.metadata.status, "partial");
  assert.equal(snapshot.metadata.scannedCount, 0);
  assert.equal(snapshot.metadata.diagnostics?.requests.coinGlassRequestsPlanned, 3);
  assert.equal(snapshot.metadata.diagnostics?.requests.cleanRows, 0);
  assert.match(snapshot.metadata.notes.join("\n"), /quality filter: raw 0, clean 0, primary 0/);
});

test("CoinGlass provider exposes multi-exchange coverage quality in metadata", async () => {
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: [],
    batchSize: 5,
    universeDiscoveryProvider: {
      id: "test-discovery",
      label: "Test Universe Discovery",
      async discoverInstruments() {
        return {
          ok: true,
          source: "test-discovery",
          instruments: [
            {
              id: "BINANCE:ARBUSDT",
              symbol: "ARBUSDT",
              baseAsset: "ARB",
              quoteAsset: "USDT",
              exchange: "BINANCE",
              marketType: "perpetual",
              isActive: true,
              volume24hUsd: 0,
              tags: ["test-discovery"],
              lastSeenAt: "2026-06-15T00:00:00.000Z",
            },
            {
              id: "OKX:ARBUSDT",
              symbol: "ARBUSDT",
              baseAsset: "ARB",
              quoteAsset: "USDT",
              exchange: "OKX",
              marketType: "perpetual",
              isActive: true,
              volume24hUsd: 0,
              tags: ["test-discovery"],
              lastSeenAt: "2026-06-15T00:00:00.000Z",
            },
            {
              id: "BYBIT:ARBUSDT",
              symbol: "ARBUSDT",
              baseAsset: "ARB",
              quoteAsset: "USDT",
              exchange: "BYBIT",
              marketType: "perpetual",
              isActive: true,
              volume24hUsd: 0,
              tags: ["test-discovery"],
              lastSeenAt: "2026-06-15T00:00:00.000Z",
            },
            {
              id: "OKX:SUIUSDT",
              symbol: "SUIUSDT",
              baseAsset: "SUI",
              quoteAsset: "USDT",
              exchange: "OKX",
              marketType: "perpetual",
              isActive: true,
              volume24hUsd: 0,
              tags: ["test-discovery"],
              lastSeenAt: "2026-06-15T00:00:00.000Z",
            },
            {
              id: "BYBIT:SUIUSDT",
              symbol: "SUIUSDT",
              baseAsset: "SUI",
              quoteAsset: "USDT",
              exchange: "BYBIT",
              marketType: "perpetual",
              isActive: true,
              volume24hUsd: 0,
              tags: ["test-discovery"],
              lastSeenAt: "2026-06-15T00:00:00.000Z",
            },
            {
              id: "BYBIT:MEMEUSDT",
              symbol: "MEMEUSDT",
              baseAsset: "MEME",
              quoteAsset: "USDT",
              exchange: "BYBIT",
              marketType: "perpetual",
              isActive: true,
              volume24hUsd: 0,
              tags: ["test-discovery"],
              lastSeenAt: "2026-06-15T00:00:00.000Z",
            },
          ],
        };
      },
    },
    now: () => new Date("2026-06-15T00:00:00.000Z"),
    fetcher: async () =>
      new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [],
      })),
  });

  const snapshot = await provider.fetchSnapshot();

  assert.deepEqual(snapshot.metadata.coverage?.exchangeCoverageSummary, {
    majorThree: 1,
    multiExchange: 1,
    singleExchange: 1,
    unlisted: 2,
  });
  assert.match(snapshot.metadata.notes.join("\n"), /exchange coverage: major_three 1, multi_exchange 1, single_exchange 1, unlisted 2/);
});

test("CoinGlass provider filters noisy quote markets and aggregates one primary signal per symbol", async () => {
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["TIA"],
    batchSize: 3,
    now: () => new Date("2026-06-12T00:00:00.000Z"),
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: symbol === "TIA" ? [
          {
            ...coinglassRow("TIA"),
            exchange_name: "Gate.io",
            volume_usd: 120_000_000,
          },
          {
            ...coinglassRow("TIA"),
            exchange_name: "Binance",
            volume_usd: 90_000_000,
            open_interest_usd: 45_000_000,
          },
          {
            ...coinglassRow("TIA"),
            exchange_name: "OKX",
            volume_usd: 150_000_000,
            open_interest_usd: 60_000_000,
          },
          {
            ...coinglassRow("TIA"),
            exchange_name: "Bybit",
            volume_usd: 100_000_000,
            open_interest_usd: 50_000_000,
          },
          {
            ...coinglassRow("TIA"),
            exchange_name: "Binance",
            instrument_id: "TIAUSDC",
            symbol: "TIA/USDC",
            volume_usd: 200_000_000,
          },
          {
            ...coinglassRow("TIA"),
            exchange_name: "Coinbase",
            instrument_id: "TIAUSD",
            symbol: "TIA/USD",
            volume_usd: 220_000_000,
          },
          {
            ...coinglassRow("NVDA"),
            exchange_name: "Binance",
            volume_usd: 320_000_000,
          },
        ] : [],
      }));
    },
  });

  const snapshot = await provider.fetchSnapshot();

  assert.deepEqual(snapshot.signals.map((signal) => signal.id), [
    "coinglass-BINANCE-TIAUSDT",
  ]);
  assert.deepEqual([...new Set(snapshot.heatmap.map((item) => item.symbol))], ["TIA"]);
  assert.equal(snapshot.tickers.some((ticker) => ticker.exchange === "UNKNOWN"), false);
  assert.equal(snapshot.tickers.some((ticker) => ticker.symbol.endsWith("USDC")), false);
  assert.equal(snapshot.tickers.some((ticker) => ticker.symbol.endsWith("USD")), false);
  assert.match(snapshot.metadata.notes.join("\n"), /quality filter: raw 7, clean 3, primary 1/);
  assert.match(snapshot.metadata.notes.join("\n"), /quality rejections: unsupported_exchange 1, quote_not_supported 2, non_crypto_underlying 1, duplicate_symbol 2/);
  assert.match(snapshot.metadata.notes.join("\n"), /quality rejected samples: Gate\.io:TIAUSDT:unsupported_exchange; Binance:TIAUSDC:quote_not_supported; Coinbase:TIAUSD:quote_not_supported; Binance:NVDAUSDT:non_crypto_underlying/);
  assert.match(snapshot.metadata.notes.join("\n"), /quality aggregation summary: duplicate_groups 1, rule exchange_priority_then_volume_oi/);
  assert.match(snapshot.metadata.notes.join("\n"), /quality aggregation: TIAUSDT selected BINANCE over OKX\/BYBIT by exchange_priority_then_volume_oi/);
});

test("CoinGlass provider rejects rows whose reported symbol and instrument quote disagree", async () => {
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["TIA"],
    batchSize: 1,
    now: () => new Date("2026-06-12T00:00:00.000Z"),
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: symbol === "TIA" ? [
          {
            ...coinglassRow("TIA"),
            exchange_name: "Binance",
            volume_usd: 90_000_000,
          },
          {
            ...coinglassRow("TIA"),
            exchange_name: "Binance",
            instrument_id: "TIAUSDC",
            symbol: "TIA/USDT",
            volume_usd: 250_000_000,
          },
          {
            ...coinglassRow("TIA"),
            exchange_name: "OKX",
            instrument_id: "TIAUSDT",
            symbol: "TIA/USD",
            volume_usd: 260_000_000,
          },
        ] : [],
      }));
    },
  });

  const snapshot = await provider.fetchSnapshot();

  assert.deepEqual(snapshot.tickers.map((ticker) => ticker.symbol), ["TIAUSDT"]);
  assert.deepEqual(snapshot.signals.map((signal) => signal.id), ["coinglass-BINANCE-TIAUSDT"]);
  assert.match(snapshot.metadata.notes.join("\n"), /quality filter: raw 3, clean 1, primary 1/);
  assert.match(snapshot.metadata.notes.join("\n"), /quality rejections: unsupported_exchange 0, quote_not_supported 2, non_crypto_underlying 0, duplicate_symbol 0/);
  assert.match(snapshot.metadata.notes.join("\n"), /quality rejected samples: Binance:TIAUSDC:quote_not_supported; OKX:TIAUSDT:quote_not_supported/);
  assert.match(snapshot.metadata.notes.join("\n"), /quality aggregation: none/);
});

test("CoinGlass provider threads BTC and ETH anchor context into altcoin analysis", async () => {
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["BTC", "ETH", "ENA"],
    batchSize: 3,
    now: () => new Date("2026-06-12T00:00:00.000Z"),
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";
      const overrides: Record<string, string | number> = symbol === "BTC" || symbol === "ETH"
        ? { price_change_percent_24h: -3.2 }
        : { price_change_percent_24h: 4.6, volume_usd_change_percent_24h: 140 };

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [coinglassRow(symbol, overrides)],
      }));
    },
  });

  const snapshot = await provider.fetchSnapshot();
  const enaSignal = snapshot.signals.find((signal) => signal.symbol === "ENAUSDT");

  assert.ok(enaSignal);
  assert.ok(enaSignal.evidence.some((item) => item.label === "BTC/ETH 环境逆风"));
  assert.match(snapshot.metadata.notes.join("\n"), /market context: btc_eth risk_off/);
});

test("CoinGlass provider keeps derivatives scan alive when optional OHLCV fails", async () => {
  const ohlcvProvider: OhlcvProvider = {
    id: "test-ohlcv",
    label: "Test OHLCV",
    async fetchCandles(request) {
      return {
        ok: false,
        source: "test-ohlcv",
        symbol: request.symbol,
        interval: request.interval,
        reason: "upstream_error",
        error: "test ohlcv unavailable",
        status: 503,
      };
    },
  };
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["ENA"],
    batchSize: 1,
    ohlcvProvider,
    now: () => new Date("2026-06-12T00:00:00.000Z"),
    fetcher: async () =>
      new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [coinglassRow("ENA", { volume_usd_change_percent_24h: 140 })],
      })),
  });

  const snapshot = await provider.fetchSnapshot();
  const enaSignal = snapshot.signals.find((signal) => signal.symbol === "ENAUSDT");

  assert.ok(enaSignal);
  assert.ok(enaSignal.evidence.some((item) => item.label === "OHLCV 数据缺失"));
  assert.match(snapshot.metadata.notes.join("\n"), /ohlcv unavailable: ENAUSDT 15m upstream_error/);
});

test("CoinGlass provider feeds successful OHLCV candles into technical indicator evidence", async () => {
  const ohlcvProvider: OhlcvProvider = {
    id: "test-ohlcv",
    label: "Test OHLCV",
    async fetchCandles(request) {
      return {
        ok: true,
        source: "test-ohlcv",
        symbol: request.symbol,
        interval: request.interval,
        candles: [10, 10.4, 10.9, 11.4, 12, 12.2].map((close, index) => ohlcvCandle(index, close)),
      };
    },
  };
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["ENA"],
    batchSize: 1,
    ohlcvProvider,
    now: () => new Date("2026-06-12T00:00:00.000Z"),
    fetcher: async () =>
      new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [coinglassRow("ENA", { volume_usd_change_percent_24h: 140 })],
      })),
  });

  const snapshot = await provider.fetchSnapshot();
  const enaSignal = snapshot.signals.find((signal) => signal.symbol === "ENAUSDT");

  assert.ok(enaSignal);
  assert.ok(enaSignal.evidence.some((item) => item.label === "EMA 结构"));
  assert.ok(enaSignal.evidence.some((item) => item.label === "RSI 动能"));
  assert.doesNotMatch(snapshot.metadata.notes.join("\n"), /ohlcv unavailable/);
});

test("CoinGlass provider feeds multi-timeframe OHLCV candles into timeframe profile", async () => {
  const requestedCandles: string[] = [];
  const intervals = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
  const ohlcvProvider: OhlcvProvider = {
    id: "test-ohlcv",
    label: "Test OHLCV",
    async fetchCandles(request) {
      requestedCandles.push(`${request.symbol}:${request.interval}:${request.limit}`);

      return {
        ok: true,
        source: "test-ohlcv",
        symbol: request.symbol,
        interval: request.interval,
        candles: [10, 10.4, 10.9, 11.4, 12, 12.2].map((close, index) => ohlcvCandle(index, close)),
      };
    },
  };
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["ENA"],
    batchSize: 3,
    ohlcvProvider,
    now: () => new Date("2026-06-12T00:00:00.000Z"),
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: symbol === "ENA"
          ? [coinglassRow("ENA", { volume_usd_change_percent_24h: 140 })]
          : [],
      }));
    },
  });

  const snapshot = await provider.fetchSnapshot();
  const enaSignal = snapshot.signals.find((signal) => signal.symbol === "ENAUSDT");

  assert.ok(enaSignal?.timeframeProfile);
  assert.deepEqual(enaSignal.timeframeProfile.frames.map((frame) => frame.timeframe), intervals);
  assert.equal(enaSignal.timeframeProfile.missingRoles.length, 0);
  assert.ok(enaSignal.evidence.some((item) => item.label === "多周期结构校验"));
  assert.ok(enaSignal.evidence.some((item) => item.label === "EMA 结构"));
  assert.deepEqual(
    requestedCandles.filter((item) => item.startsWith("ENAUSDT:")),
    intervals.map((interval) => `ENAUSDT:${interval}:120`),
  );
  assert.match(snapshot.metadata.notes.join("\n"), /ohlcv multi-timeframe: ENAUSDT 8\/8/);
});

test("CoinGlass provider uses OHLCV timeframe structure instead of treating every signal as range middle", async () => {
  const ohlcvProvider: OhlcvProvider = {
    id: "test-ohlcv",
    label: "Test OHLCV",
    async fetchCandles(request) {
      return {
        ok: true,
        source: "test-ohlcv",
        symbol: request.symbol,
        interval: request.interval,
        candles: [10, 10.2, 10.4, 10.7, 11.1, 11.8, 12.4, 12.9].map((close, index) =>
          ohlcvCandle(index, close)
        ),
      };
    },
  };
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["ENA"],
    batchSize: 3,
    ohlcvProvider,
    now: () => new Date("2026-06-12T00:00:00.000Z"),
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: symbol === "ENA"
          ? [coinglassRow("ENA", {
            current_price: 12.9,
            price_change_percent_24h: 5.4,
            volume_usd_change_percent_24h: 160,
            open_interest_change_percent_24h: 8,
          })]
          : [],
      }));
    },
  });

  const snapshot = await provider.fetchSnapshot();
  const enaSignal = snapshot.signals.find((signal) => signal.symbol === "ENAUSDT");
  const structureEvidence = enaSignal?.evidence.find((item) => item.label === "结构位置");

  assert.ok(enaSignal);
  assert.notEqual(enaSignal.direction, "neutral");
  assert.notEqual(enaSignal.risk, "high");
  assert.ok((enaSignal.strategy.riskReward ?? 0) >= 3);
  assert.match(structureEvidence?.value ?? "", /关键边界/);
  assert.doesNotMatch(structureEvidence?.value ?? "", /区间中部/);
});

test("CoinGlass provider attaches v3 key level dossiers from the same OHLCV candles without extra requests", async () => {
  const requestedCandles: string[] = [];
  const intervals = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
  const ohlcvProvider: OhlcvProvider = {
    id: "test-ohlcv",
    label: "Test OHLCV",
    async fetchCandles(request) {
      requestedCandles.push(`${request.symbol}:${request.interval}:${request.limit}`);

      return {
        ok: true,
        source: "test-ohlcv",
        symbol: request.symbol,
        interval: request.interval,
        candles: [10, 10.4, 10.9, 10.6, 10.1, 11.3, 12.1, 11.4, 10.7, 12.2, 13.3, 12.8, 11.9, 13.6]
          .map((close, index) => ohlcvCandle(index, close)),
      };
    },
  };
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["ENA"],
    batchSize: 3,
    ohlcvProvider,
    now: () => new Date("2026-06-12T00:00:00.000Z"),
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: symbol === "ENA"
          ? [coinglassRow("ENA", { current_price: 12.7, volume_usd_change_percent_24h: 140 })]
          : [],
      }));
    },
  });

  const snapshot = await provider.fetchSnapshot();
  const enaSignal = snapshot.signals.find((signal) => signal.symbol === "ENAUSDT");

  assert.ok(enaSignal?.strategyV3);
  assert.equal(enaSignal.strategyV3.canMutateLiveRanking, false);
  assert.equal(enaSignal.strategyV3.canAutoAdjustWeights, false);
  assert.equal(enaSignal.strategyV3.allowedUse, "research_only");
  assert.ok(enaSignal.strategyV3.keyLevels.length > 0);
  assert.ok(enaSignal.strategyV3.forwardLevels.length > 0);
  assert.deepEqual(
    requestedCandles.filter((item) => item.startsWith("ENAUSDT:")),
    intervals.map((interval) => `ENAUSDT:${interval}:120`),
  );
  assert.match(snapshot.metadata.notes.join("\n"), /v3 key levels: ENAUSDT/);
});

test("CoinGlass provider reports the full duplicate symbol group count instead of only the sample count", async () => {
  const duplicateBases = Array.from({ length: 10 }, (_, index) => `ALT${index + 1}`);
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: duplicateBases,
    batchSize: 24,
    now: () => new Date("2026-06-12T00:00:00.000Z"),
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [
          coinglassRow(symbol, { exchange_name: "Binance", volume_usd: 100_000_000 }),
          coinglassRow(symbol, { exchange_name: "OKX", volume_usd: 120_000_000 }),
        ],
      }));
    },
  });

  const snapshot = await provider.fetchSnapshot();

  assert.equal(snapshot.metadata.diagnostics?.requests.duplicateSymbolGroups, 12);
  assert.match(snapshot.metadata.notes.join("\n"), /duplicate_groups 12/);
});
