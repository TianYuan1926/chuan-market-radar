import assert from "node:assert/strict";
import test from "node:test";

import { buildCoinGlassDailyMoverSnapshot } from "./coinglass-daily-movers";
import type { CoinGlassMarketRow } from "./coinglass-mapper";

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

test("buildCoinGlassDailyMoverSnapshot maps external mover rows into a research-only snapshot", () => {
  const snapshot = buildCoinGlassDailyMoverSnapshot({
    observedAt,
    limitPerSide: 2,
    rows: [
      row("SOL", {
        price_change_percent_24h: 38.4,
        volume_usd: 720_000_000,
        volume_usd_change_percent_24h: 185,
        open_interest_change_percent_24h: 31,
        funding_rate: 0.0009,
        long_liquidation_usd_24h: 8_000_000,
        short_liquidation_usd_24h: 10_000_000,
      }),
      row("SOL", {
        exchange_name: "OKX",
        price_change_percent_24h: 41,
        volume_usd: 90_000_000,
      }),
      row("AVAX", {
        price_change_percent_24h: -24.8,
        volume_usd: 410_000_000,
        volume_usd_change_percent_24h: 142,
        open_interest_change_percent_24h: 27,
        funding_rate: -0.0007,
        long_liquidation_usd_24h: 20_000_000,
        short_liquidation_usd_24h: 9_000_000,
      }),
      row("DOGE", {
        instrument_id: "DOGEUSDC",
        symbol: "DOGE/USDC",
        price_change_percent_24h: 55,
        volume_usd: 600_000_000,
      }),
      row("TIA", {
        exchange_name: "Gate.io",
        price_change_percent_24h: -31,
        volume_usd: 500_000_000,
      }),
    ],
    radarSignals: [
      {
        id: "sig-sol-compression",
        symbol: "SOLUSDT",
        state: "near_trigger",
        confidence: 78,
        updatedAt: "2026-06-13T21:10:00.000Z",
      },
    ],
  });

  assert.equal(snapshot.id, "daily-movers-coinglass-2026-06-14");
  assert.equal(snapshot.source, "coinglass");
  assert.deepEqual(snapshot.gainers.map((mover) => mover.symbol), ["SOLUSDT"]);
  assert.deepEqual(snapshot.losers.map((mover) => mover.symbol), ["AVAXUSDT"]);
  assert.equal(snapshot.gainers[0]?.rank, 1);
  assert.equal(snapshot.gainers[0]?.exchange, "BINANCE");
  assert.equal(snapshot.gainers[0]?.priceChangePercent, 38.4);
  assert.equal(snapshot.gainers[0]?.liquidationUsd24h, 18_000_000);
  assert.equal(snapshot.reviews.length, 2);
  assert.equal(snapshot.reviews[0]?.allowedUse, "research_only");
  assert.equal(snapshot.reviews[0]?.radarReview.status, "caught");
  assert.deepEqual(snapshot.reviews[0]?.radarReview.matchedSignalIds, ["sig-sol-compression"]);
  assert.equal(snapshot.reviews[1]?.radarReview.status, "missed");
  assert.ok(snapshot.reviews[1]?.radarReview.improvementTags.includes("review_short_side_detection"));
});
