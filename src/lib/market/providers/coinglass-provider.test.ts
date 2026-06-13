import assert from "node:assert/strict";
import test from "node:test";
import { createCoinGlassProvider } from "./coinglass-provider";

function coinglassRow(symbol: string) {
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
  };
}

test("CoinGlass provider fetches only the current low-rate scan batch", async () => {
  const requestedSymbols: string[] = [];
  const provider = createCoinGlassProvider({
    apiKey: "test-key",
    baseAssets: ["BTC", "ETH", "SOL", "ENA", "SUI"],
    batchSize: 2,
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

  assert.deepEqual(requestedSymbols, ["SOL", "ENA"]);
  assert.equal(snapshot.metadata.scannedCount, 2);
  assert.match(snapshot.metadata.notes.join("\n"), /batch 2\/3/);
  assert.match(snapshot.metadata.notes.join("\n"), /requests 2\/5/);
});
