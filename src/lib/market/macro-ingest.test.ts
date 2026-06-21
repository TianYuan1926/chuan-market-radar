import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import {
  runAdminMacroMarketIngest,
  runMacroMarketIngest,
} from "./macro-ingest";

function response(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function coingeckoPayload() {
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
    },
  };
}

test("runMacroMarketIngest stores CoinGecko global macro context without creating trade signals", async () => {
  const repository = createMemoryPersistenceRepository();
  const result = await runMacroMarketIngest({
    fetcher: async () => response(coingeckoPayload()),
    now: () => new Date("2026-06-21T00:00:00.000Z"),
    repository,
  });

  const latest = await repository.getLatestMacroMarketSnapshot();

  assert.equal(result.status, "stored");
  assert.equal(result.snapshot.btcDominancePercent, 52);
  assert.equal(result.snapshot.canCreateTradeSignal, false);
  assert.equal(latest?.id, result.snapshot.id);
  assert.match(result.notes.join("\n"), /macro guardrail/u);
});

test("runAdminMacroMarketIngest requires CRON_SECRET and bearer authorization", async () => {
  const repository = createMemoryPersistenceRepository();

  const missingSecret = await runAdminMacroMarketIngest({
    authorization: "Bearer secret",
    env: {},
    repository,
  });
  const unauthorized = await runAdminMacroMarketIngest({
    authorization: "Bearer wrong",
    env: { CRON_SECRET: "secret" },
    repository,
  });

  assert.equal(missingSecret.status, 503);
  assert.equal(missingSecret.body.ok, false);
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.body.ok, false);
});

test("runAdminMacroMarketIngest returns a compact success payload after storing macro context", async () => {
  const repository = createMemoryPersistenceRepository();
  const result = await runAdminMacroMarketIngest({
    authorization: "Bearer secret",
    env: { CRON_SECRET: "secret" },
    ingest: async () => ({
      notes: ["macro guardrail: readonly environment context"],
      scope: "public-demo",
      snapshot: {
        allowedUse: "macro_context_only",
        btcDominancePercent: 52,
        canCreateTradeSignal: false,
        ethDominancePercent: 10,
        fetchedAt: "2026-06-21T00:00:00.000Z",
        guardrail: "不能直接生成交易方向",
        id: "macro-test",
        source: "coingecko_global",
        total2MarketCapUsd: 1_440_000_000_000,
        total3MarketCapUsd: 1_140_000_000_000,
        totalMarketCapChangePercent24h: 1.8,
        totalMarketCapUsd: 3_000_000_000_000,
        updatedAt: "2026-06-21T00:00:00.000Z",
      },
      status: "stored",
      storage: "memory",
    }),
    repository,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    ok: true,
    macro: {
      btcDominancePercent: 52,
      fetchedAt: "2026-06-21T00:00:00.000Z",
      guardrail: "不能直接生成交易方向",
      scope: "public-demo",
      snapshotId: "macro-test",
      source: "coingecko_global",
      storage: "memory",
      total2MarketCapUsd: 1_440_000_000_000,
      total3MarketCapUsd: 1_140_000_000_000,
    },
  });
});
