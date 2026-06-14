import assert from "node:assert/strict";
import test from "node:test";
import { createCoinGlassProvider } from "./coinglass-provider";
import type { Candle, OhlcvProvider } from "../ohlcv/types";

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
  assert.match(snapshot.metadata.notes.join("\n"), /quality filter: raw 6, clean 3, primary 1/);
  assert.match(snapshot.metadata.notes.join("\n"), /quality rejections: unsupported_exchange 1, quote_not_supported 2, duplicate_symbol 2/);
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
  assert.match(snapshot.metadata.notes.join("\n"), /quality rejections: unsupported_exchange 0, quote_not_supported 2, duplicate_symbol 0/);
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
