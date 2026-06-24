import assert from "node:assert/strict";
import test from "node:test";
import { collectDexScreenerExternalIntel } from "./dex-screener-collector";

test("DEX Screener collector maps latest boosts into context-only external events", async () => {
  const result = await collectDexScreenerExternalIntel({
    now: new Date("2026-06-24T08:00:00.000Z"),
    fetchImpl: async () => new Response(JSON.stringify([
      {
        chainId: "solana",
        tokenAddress: "So11111111111111111111111111111111111111112",
        url: "https://dexscreener.com/solana/So11111111111111111111111111111111111111112",
        amount: 700,
        totalAmount: 1200,
        description: "Boosted token profile",
      },
      {
        chainId: "",
        tokenAddress: "ignored",
      },
    ]), {
      headers: { "content-type": "application/json" },
      status: 200,
    }),
    limit: 5,
  });

  assert.equal(result.latestRuns[0]?.status, "success");
  assert.equal(result.latestRuns[0]?.rowsRead, 2);
  assert.equal(result.latestRuns[0]?.rowsAccepted, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.sourceId, "dex_screener_public_api");
  assert.equal(result.events[0]?.kind, "NARRATIVE_CATALYST");
  assert.equal(result.events[0]?.impact, "bullish_context");
  assert.equal(result.events[0]?.allowedUse, "context_only");
  assert.equal(result.events[0]?.canCreateTradeSignal, false);
  assert.equal(result.events[0]?.rawBodyStored, false);
  assert.match(result.events[0]?.summary ?? "", /只作为早期观察和风险背景/);
});

test("DEX Screener collector reports skipped when disabled", async () => {
  const result = await collectDexScreenerExternalIntel({
    enabled: false,
    now: new Date("2026-06-24T08:00:00.000Z"),
  });

  assert.equal(result.events.length, 0);
  assert.equal(result.latestRuns[0]?.status, "skipped");
});

test("DEX Screener collector reports failure without creating fake events", async () => {
  const result = await collectDexScreenerExternalIntel({
    fetchImpl: async () => new Response("rate limited", { status: 429 }),
    now: new Date("2026-06-24T08:00:00.000Z"),
  });

  assert.equal(result.events.length, 0);
  assert.equal(result.latestRuns[0]?.status, "failed");
  assert.match(result.latestRuns[0]?.error ?? "", /HTTP 429/);
});
