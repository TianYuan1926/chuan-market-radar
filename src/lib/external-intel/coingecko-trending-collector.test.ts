import assert from "node:assert/strict";
import test from "node:test";
import { collectCoingeckoTrendingExternalIntel } from "./coingecko-trending-collector";

test("CoinGecko trending collector maps public trending rows into context-only events", async () => {
  const result = await collectCoingeckoTrendingExternalIntel({
    now: new Date("2026-06-24T08:00:00.000Z"),
    fetchImpl: async () => new Response(JSON.stringify({
      coins: [
        {
          item: {
            id: "bitcoin",
            name: "Bitcoin",
            symbol: "BTC",
            small: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
            market_cap_rank: 1,
            data: {
              price_change_percentage_24h: { usd: 2.5 },
              total_volume: 50_000_000_000,
            },
          },
        },
      ],
    }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }),
  });

  assert.equal(result.latestRuns[0]?.status, "success");
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.sourceId, "coingecko_trending");
  assert.equal(result.events[0]?.kind, "NARRATIVE_CATALYST");
  assert.equal(result.events[0]?.symbol, "BTC");
  assert.equal(result.events[0]?.tokenIdentity?.coingeckoId, "bitcoin");
  assert.equal(result.events[0]?.tokenIdentity?.imageUrl, "https://assets.coingecko.com/coins/images/1/small/bitcoin.png");
  assert.equal(result.events[0]?.tokenIdentity?.mappingStatus, "mapped");
  assert.equal(result.events[0]?.impact, "neutral_context");
  assert.equal(result.events[0]?.canCreateTradeSignal, false);
  assert.match(result.events[0]?.summary ?? "", /不能单独生成交易结论/);
});

test("CoinGecko trending collector treats sharp negative attention as risk context", async () => {
  const result = await collectCoingeckoTrendingExternalIntel({
    now: new Date("2026-06-24T08:00:00.000Z"),
    fetchImpl: async () => new Response(JSON.stringify({
      coins: [
        {
          item: {
            id: "risk-token",
            name: "Risk Token",
            symbol: "RISK",
            market_cap_rank: 300,
            data: {
              price_change_percentage_24h: { usd: -18.5 },
            },
          },
        },
      ],
    }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }),
  });

  assert.equal(result.events[0]?.impact, "risk_context");
});

test("CoinGecko trending collector reports failure without fake events", async () => {
  const result = await collectCoingeckoTrendingExternalIntel({
    fetchImpl: async () => new Response("rate limited", { status: 429 }),
    now: new Date("2026-06-24T08:00:00.000Z"),
  });

  assert.equal(result.events.length, 0);
  assert.equal(result.latestRuns[0]?.status, "failed");
  assert.match(result.latestRuns[0]?.error ?? "", /HTTP 429/);
});
