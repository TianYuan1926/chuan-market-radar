import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import { runCoinGlassDailyMoverIngest } from "./daily-mover-ingest";
import type { CoinGlassMarketRow } from "./providers/coinglass-mapper";

const observedAt = "2026-06-14T00:00:00.000Z";

function row(symbol: string, overrides: Partial<CoinGlassMarketRow> = {}): CoinGlassMarketRow {
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

test("runCoinGlassDailyMoverIngest fetches only configured assets and stores the snapshot", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "chuan-public" });
  const requestedSymbols: string[] = [];

  const result = await runCoinGlassDailyMoverIngest({
    apiKey: "test-key",
    baseAssets: ["SOL", "AVAX"],
    fetcher: async (input) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol") ?? "";
      requestedSymbols.push(symbol);

      return new Response(JSON.stringify({
        code: "0",
        msg: "success",
        data: symbol === "SOL"
          ? [row("SOL", {
            price_change_percent_24h: 38.4,
            volume_usd: 720_000_000,
            volume_usd_change_percent_24h: 185,
            open_interest_change_percent_24h: 31,
            funding_rate: 0.0009,
          })]
          : [row("AVAX", {
            price_change_percent_24h: -24.8,
            volume_usd: 410_000_000,
            volume_usd_change_percent_24h: 142,
            open_interest_change_percent_24h: 27,
            funding_rate: -0.0007,
          })],
      }));
    },
    limitPerSide: 5,
    now: () => new Date(observedAt),
    radarSignals: [
      {
        id: "sig-sol-compression",
        symbol: "SOLUSDT",
        state: "near_trigger",
        confidence: 78,
        updatedAt: "2026-06-13T21:10:00.000Z",
      },
    ],
    repository,
  });

  const stored = await repository.getDailyMoverSnapshot(result.snapshot.id);

  assert.equal(result.status, "stored");
  assert.equal(result.storage, "memory");
  assert.deepEqual(result.requestedAssets, ["SOL", "AVAX"]);
  assert.deepEqual(requestedSymbols, ["SOL", "AVAX"]);
  assert.equal(result.rawRowCount, 2);
  assert.equal(result.snapshot.gainers[0]?.symbol, "SOLUSDT");
  assert.equal(result.snapshot.losers[0]?.symbol, "AVAXUSDT");
  assert.equal(result.snapshot.reviews[0]?.radarReview.status, "caught");
  assert.equal(stored?.id, "daily-movers-coinglass-2026-06-14");
  assert.equal(stored?.reviews[0]?.allowedUse, "research_only");
});
