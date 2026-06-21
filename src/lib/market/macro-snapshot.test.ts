import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAltcoinMacroAnchorInputFromSnapshots,
  normalizeCoinGeckoGlobalPayload,
} from "./macro-snapshot";

const now = "2026-06-21T00:00:00.000Z";

function coingeckoGlobalPayload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      market_cap_change_percentage_24h_usd: 1.8,
      market_cap_percentage: {
        btc: 52,
        eth: 10,
      },
      total_market_cap: {
        usd: 3_000_000_000_000,
      },
      ...overrides,
    },
  };
}

test("normalizeCoinGeckoGlobalPayload stores BTC.D TOTAL2 TOTAL3 as macro context only", () => {
  const snapshot = normalizeCoinGeckoGlobalPayload(coingeckoGlobalPayload(), now);

  assert.ok(snapshot);
  assert.equal(snapshot.allowedUse, "macro_context_only");
  assert.equal(snapshot.canCreateTradeSignal, false);
  assert.equal(snapshot.source, "coingecko_global");
  assert.equal(snapshot.btcDominancePercent, 52);
  assert.equal(snapshot.ethDominancePercent, 10);
  assert.equal(snapshot.totalMarketCapUsd, 3_000_000_000_000);
  assert.equal(snapshot.total2MarketCapUsd, 1_440_000_000_000);
  assert.equal(snapshot.total3MarketCapUsd, 1_140_000_000_000);
  assert.match(snapshot.guardrail, /不能直接生成交易方向/u);
});

test("buildAltcoinMacroAnchorInputFromSnapshots computes dominance averages and TOTAL2 TOTAL3 changes", () => {
  const current = normalizeCoinGeckoGlobalPayload(coingeckoGlobalPayload(), now);
  const oneDayAgo = normalizeCoinGeckoGlobalPayload(
    coingeckoGlobalPayload({
      market_cap_percentage: {
        btc: 53,
        eth: 11,
      },
      total_market_cap: {
        usd: 2_800_000_000_000,
      },
    }),
    "2026-06-20T00:00:00.000Z",
  );
  const sixDaysAgo = normalizeCoinGeckoGlobalPayload(
    coingeckoGlobalPayload({
      market_cap_percentage: {
        btc: 54,
        eth: 10,
      },
      total_market_cap: {
        usd: 2_700_000_000_000,
      },
    }),
    "2026-06-15T00:00:00.000Z",
  );

  assert.ok(current);
  assert.ok(oneDayAgo);
  assert.ok(sixDaysAgo);

  const input = buildAltcoinMacroAnchorInputFromSnapshots([
    sixDaysAgo,
    current,
    oneDayAgo,
  ]);

  assert.ok(input);
  assert.equal(input.source, "coingecko_global");
  assert.equal(input.btcDominancePercent, 52);
  assert.equal(input.btcDominance7dAveragePercent, 53);
  assert.equal(input.totalMarketCapUsd, 3_000_000_000_000);
  assert.equal(input.total2ChangePercent24h, 9.42);
  assert.equal(input.total3ChangePercent24h, 13.1);
});

test("normalizeCoinGeckoGlobalPayload rejects incomplete macro payloads", () => {
  const snapshot = normalizeCoinGeckoGlobalPayload({
    data: {
      market_cap_percentage: {
        btc: 52,
      },
    },
  }, now);

  assert.equal(snapshot, null);
});
