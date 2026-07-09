import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  defaultCoinGlassBatchSize,
  defaultCoinGlassDailyRequestBudget,
  defaultCoinGlassMaxConcurrency,
  defaultCoinGlassRequestIntervalMs,
  createConfiguredPublicLightScanProvider,
  getConfiguredMarketProvider,
  parseBaseAssets,
} from "./provider-registry";
import { resetCoinGlassRateLimitStateForTest } from "./providers/coinglass-client";
import type { ContractInstrument } from "./types";

test.beforeEach(() => {
  resetCoinGlassRateLimitStateForTest();
});

function instrument(baseAsset: string): ContractInstrument {
  return {
    id: `BINANCE:${baseAsset}USDT`,
    symbol: `${baseAsset}USDT`,
    baseAsset,
    quoteAsset: "USDT",
    exchange: "BINANCE",
    marketType: "perpetual",
    isActive: true,
    volume24hUsd: 0,
    tags: ["test-discovery"],
    lastSeenAt: "2026-06-15T00:00:00.000Z",
  };
}

function coinglassRow(symbol: string) {
  return {
    instrument_id: `${symbol}USDT`,
    exchange_name: "Binance",
    symbol: `${symbol}/USDT`,
    current_price: 12.7,
    price_change_percent_24h: 4.8,
    volume_usd: 35_000_000,
    volume_usd_change_percent_24h: 140,
    open_interest_usd: 18_000_000,
    open_interest_change_percent_24h: 5,
    funding_rate: 0.0001,
    long_liquidation_usd_24h: 100_000,
    short_liquidation_usd_24h: 50_000,
  };
}

function klineRows() {
  return [10, 10.4, 10.9, 10.6, 10.1, 11.3, 12.1, 11.4, 10.7, 12.2, 13.3, 12.8, 11.9, 13.6]
    .map((close, index) => {
      const openTime = Date.UTC(2026, 5, 15, 0, index);
      return [
        openTime,
        String(close - 0.2),
        String(close + 0.4),
        String(close - 0.5),
        String(close),
        String(10_000 + index * 500),
        openTime + 60_000 - 1,
      ];
    });
}

test("parseBaseAssets normalizes configured symbols and removes empty values", () => {
  assert.deepEqual(parseBaseAssets(" btc, ETHUSDT, sui/usdt, , ondo "), [
    "BTC",
    "ETH",
    "SUI",
    "ONDO",
  ]);
});

test("getConfiguredMarketProvider attaches default OHLCV so production scans can build v3 dossiers", async () => {
  const originalFetch = globalThis.fetch;
  const requestedKlines: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input.toString());

    if (url.pathname.endsWith("/klines")) {
      requestedKlines.push(`${url.searchParams.get("symbol")}:${url.searchParams.get("interval")}`);
      return new Response(JSON.stringify(klineRows()));
    }

    return new Response(JSON.stringify({
      code: "0",
      msg: "success",
      data: [coinglassRow(url.searchParams.get("symbol") ?? "ENA")],
    }));
  }) as typeof fetch;

  try {
    const provider = getConfiguredMarketProvider({
      MARKET_DATA_PROVIDER: "coinglass",
      COINGLASS_API_KEY: "test-key",
      COINGLASS_BASE_ASSETS: "ENA",
      COINGLASS_BATCH_SIZE: "1",
      COINGLASS_REQUEST_INTERVAL_MS: "0",
    }, {
      now: () => new Date("2026-06-15T00:00:00.000Z"),
      publicLightScanProvider: {
        id: "disabled",
        label: "Disabled Public Light Scan",
        async scan() {
          return {
            diagnostics: {
              acceptedCount: 0,
              candidateCount: 0,
              generatedAt: "2026-06-15T00:00:00.000Z",
              notes: ["disabled"],
              requestCount: 0,
              source: "disabled",
              status: "disabled",
              topCandidates: [],
              universeCount: 0,
            },
            instruments: [],
            priorityCandidates: [],
            tickers: [],
          };
        },
      },
      universeDiscoveryProvider: {
        id: "test-discovery",
        label: "Test Discovery",
        async discoverInstruments() {
          return {
            ok: true,
            source: "test-discovery",
            instruments: [instrument("ENA")],
          };
        },
      },
    });

    const snapshot = await provider.fetchSnapshot();
    const signal = snapshot.signals.find((item) => item.symbol === "ENAUSDT");

    assert.ok(signal?.strategyV3);
    assert.ok(requestedKlines.some((request) => request === "ENAUSDT:15m"));
    assert.ok((snapshot.metadata.diagnostics?.v3Coverage.withV3Signals ?? 0) >= 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getConfiguredMarketProvider fails closed instead of falling back to mock", () => {
  assert.equal(getConfiguredMarketProvider({}).id, "unconfigured");
  assert.equal(getConfiguredMarketProvider({
    MARKET_DATA_PROVIDER: "coinglass",
  }).id, "unconfigured");
});

test("production provider registry does not statically import mock provider", () => {
  const source = readFileSync("src/lib/market/provider-registry.ts", "utf8");

  assert.doesNotMatch(source, /mock-market-provider/u);
  assert.doesNotMatch(source, /mockMarketProvider/u);
});

test("getConfiguredMarketProvider returns CoinGlass provider when enabled", () => {
  const provider = getConfiguredMarketProvider({
    MARKET_DATA_PROVIDER: "coinglass",
    COINGLASS_API_KEY: "test-key",
    COINGLASS_BASE_ASSETS: "BTC,ENA",
  });

  assert.equal(provider.id, "coinglass");
  assert.equal(provider.label, "CoinGlass Contract Provider");
});

test("getConfiguredMarketProvider defaults to conservative CoinGlass pacing", () => {
  assert.equal(defaultCoinGlassRequestIntervalMs, 3_000);
});

test("createConfiguredPublicLightScanProvider merges websocket Redis snapshots before REST fallback", async () => {
  const provider = createConfiguredPublicLightScanProvider({
    WS_LIGHT_SCAN_ENABLED: "true",
  }, {
    restPublicLightScanProvider: {
      id: "rest-test",
      label: "REST Test",
      async scan() {
        return {
          diagnostics: {
            acceptedCount: 0,
            candidateCount: 0,
            generatedAt: "2026-06-21T00:00:00.000Z",
            notes: ["rest fallback disabled in test"],
            requestCount: 0,
            source: "rest-test",
            status: "disabled",
            topCandidates: [],
            universeCount: 0,
          },
          instruments: [],
          priorityCandidates: [],
          tickers: [],
        };
      },
    },
    webSocketLightScanStore: {
      async readSnapshot() {
        return {
          diagnostics: {
            acceptedCount: 1,
            candidateCount: 1,
            generatedAt: new Date().toISOString(),
            notes: ["snapshot is scheduling input; CoinGlass deep scan and Evidence gate still required"],
            requestCount: 0,
            source: "websocket-light-scan",
            status: "ready",
            topCandidates: [],
            universeCount: 1,
          },
          instruments: [instrument("ARB")],
          mode: "websocket_sliding_window",
          priorityCandidates: [{
            baseAsset: "ARB",
            changePercent24h: 2.3,
            distanceFromHighPercent: 3,
            distanceFromLowPercent: 4,
            reasons: ["websocket_sliding_window", "volume_zscore_spike"],
            score: 88,
            state: "HOT",
            symbol: "ARBUSDT",
            volume24hUsd: 800_000,
            volatilityPercent: 3.1,
          }],
          tickers: [{
            exchange: "BINANCE",
            symbol: "ARBUSDT",
            price: 1.2,
            changePercent24h: 2.3,
            volume24hUsd: 800_000,
            high24h: 1.24,
            low24h: 1.1,
            updatedAt: "2026-06-21T00:00:00.000Z",
          }],
          windowMs: 900_000,
        };
      },
      async writeSnapshot() {},
    },
  });

  const result = await provider.scan();

  assert.equal(result.diagnostics.status, "ready");
  assert.equal(result.priorityCandidates[0]?.symbol, "ARBUSDT");
  assert.match(result.diagnostics.notes.join("\n"), /websocket-light-scan ready 1\/1 accepted/);
  assert.match(result.priorityCandidates[0]?.reasons.join(","), /volume_zscore_spike/);
});

test("getConfiguredMarketProvider defaults to a wider Hobbyist-safe scan batch", async () => {
  const requestedSymbols: string[] = [];
  const discovered = Array.from({ length: 30 }, (_, index) => instrument(`ALT${index + 1}`));
  const provider = getConfiguredMarketProvider({
    MARKET_DATA_PROVIDER: "coinglass",
    COINGLASS_API_KEY: "test-key",
    COINGLASS_REQUEST_INTERVAL_MS: "0",
  }, {
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";
      requestedSymbols.push(symbol);

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [
          {
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
          },
        ],
      }));
    },
    now: () => new Date("2026-06-15T00:00:00.000Z"),
    universeDiscoveryProvider: {
      id: "test-discovery",
      label: "Test Discovery",
      async discoverInstruments() {
        return {
          ok: true,
          source: "test-discovery",
          instruments: discovered,
        };
      },
    },
  });

  const snapshot = await provider.fetchSnapshot();

  assert.equal(defaultCoinGlassBatchSize, 24);
  assert.equal(defaultCoinGlassDailyRequestBudget, 3_000);
  assert.equal(defaultCoinGlassMaxConcurrency, 6);
  assert.equal(requestedSymbols.length, 24);
  assert.equal(snapshot.metadata.quota?.requestedBatchSize, 24);
  assert.equal(snapshot.metadata.quota?.effectiveBatchSize, 24);
  assert.equal(snapshot.metadata.quota?.coinGlassDailyRequestBudget, 3_000);
  assert.equal(snapshot.metadata.quota?.coinGlassRequestsPerDayEstimate, 2_304);
  assert.equal(snapshot.metadata.quota?.status, "within_budget");
  assert.equal(snapshot.metadata.coverage?.scanned, 24);
  assert.equal(snapshot.metadata.coverage?.pending, 9);
  assert.match(snapshot.metadata.notes.join("\n"), /coinglass concurrency: 6 parallel pair-market requests/);
});

test("getConfiguredMarketProvider threads repository priority hints into CoinGlass scans", async () => {
  const requestedSymbols: string[] = [];
  const provider = getConfiguredMarketProvider({
    MARKET_DATA_PROVIDER: "coinglass",
    COINGLASS_API_KEY: "test-key",
    COINGLASS_BASE_ASSETS: "SOL,ENA",
    COINGLASS_BATCH_SIZE: "4",
    COINGLASS_REQUEST_INTERVAL_MS: "0",
  }, {
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";
      requestedSymbols.push(symbol);

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: [
          {
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
          },
        ],
      }));
    },
    now: () => new Date("2026-06-15T00:00:00.000Z"),
    universeDiscoveryProvider: {
      id: "test-discovery",
      label: "Test Discovery",
      async discoverInstruments() {
        return {
          ok: true,
          source: "test-discovery",
          instruments: [instrument("ARB")],
        };
      },
    },
    universePriorityHints: [{
      anomalyScore: 95,
      recentSignalCount: 3,
      symbol: "ARBUSDT",
    }],
    universePriorityHintNotes: ["priority hints: 1 built from repository"],
  });

  const snapshot = await provider.fetchSnapshot();

  assert.deepEqual(requestedSymbols, ["BTC", "ETH", "ARB", "ENA"]);
  assert.equal(snapshot.metadata.quota?.effectiveBatchSize, 4);
  assert.equal(snapshot.metadata.coverage?.scanned, 4);
  assert.equal(snapshot.metadata.coverage?.pending, 1);
  assert.match(snapshot.metadata.notes.join("\n"), /priority hints: 1 built from repository/);
  assert.match(snapshot.metadata.notes.join("\n"), /dynamic priority: selected ARB, top ARB/);
});
