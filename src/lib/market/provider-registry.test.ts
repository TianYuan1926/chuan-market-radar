import assert from "node:assert/strict";
import test from "node:test";
import { getConfiguredMarketProvider, parseBaseAssets } from "./provider-registry";
import type { ContractInstrument } from "./types";

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

test("parseBaseAssets normalizes configured symbols and removes empty values", () => {
  assert.deepEqual(parseBaseAssets(" btc, ETHUSDT, sui/usdt, , ondo "), [
    "BTC",
    "ETH",
    "SUI",
    "ONDO",
  ]);
});

test("getConfiguredMarketProvider stays on mock unless CoinGlass is explicitly enabled with a key", () => {
  assert.equal(getConfiguredMarketProvider({}).id, "mock");
  assert.equal(getConfiguredMarketProvider({
    MARKET_DATA_PROVIDER: "coinglass",
  }).id, "mock");
});

test("getConfiguredMarketProvider returns CoinGlass provider when enabled", () => {
  const provider = getConfiguredMarketProvider({
    MARKET_DATA_PROVIDER: "coinglass",
    COINGLASS_API_KEY: "test-key",
    COINGLASS_BASE_ASSETS: "BTC,ENA",
  });

  assert.equal(provider.id, "coinglass");
  assert.equal(provider.label, "CoinGlass Futures Provider");
});

test("getConfiguredMarketProvider threads repository priority hints into CoinGlass scans", async () => {
  const requestedSymbols: string[] = [];
  const provider = getConfiguredMarketProvider({
    MARKET_DATA_PROVIDER: "coinglass",
    COINGLASS_API_KEY: "test-key",
    COINGLASS_BASE_ASSETS: "SOL,ENA",
    COINGLASS_BATCH_SIZE: "4",
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

  assert.deepEqual(requestedSymbols, ["BTC", "ETH", "SOL"]);
  assert.match(snapshot.metadata.notes.join("\n"), /priority hints: 1 built from repository/);
  assert.match(snapshot.metadata.notes.join("\n"), /dynamic priority: selected none, top ARB/);
});
