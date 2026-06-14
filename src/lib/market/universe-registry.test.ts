import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCoverageReport,
  buildUniverseRegistry,
  normalizeUniverseAsset,
  planUniverseScan,
} from "./universe-registry";
import type { ContractInstrument } from "./types";

function instrument(
  baseAsset: string,
  overrides: Partial<ContractInstrument> = {},
): ContractInstrument {
  const symbol = `${baseAsset}USDT`;

  return {
    id: `BINANCE:${symbol}`,
    symbol,
    baseAsset,
    quoteAsset: "USDT",
    exchange: "BINANCE",
    marketType: "perpetual",
    isActive: true,
    volume24hUsd: 50_000_000,
    tags: [],
    lastSeenAt: "2026-06-14T00:00:00.000Z",
    ...overrides,
  };
}

test("normalizeUniverseAsset accepts base and USDT contract formats", () => {
  assert.deepEqual(normalizeUniverseAsset("BTC"), {
    baseAsset: "BTC",
    quoteAsset: "USDT",
    symbol: "BTCUSDT",
  });
  assert.deepEqual(normalizeUniverseAsset("btc/usdt"), {
    baseAsset: "BTC",
    quoteAsset: "USDT",
    symbol: "BTCUSDT",
  });
  assert.deepEqual(normalizeUniverseAsset("BTCUSDT"), {
    baseAsset: "BTC",
    quoteAsset: "USDT",
    symbol: "BTCUSDT",
  });
  assert.equal(normalizeUniverseAsset(""), null);
});

test("buildUniverseRegistry dedupes assets and keeps BTC and ETH as anchors", () => {
  const registry = buildUniverseRegistry(
    ["ena", "ENAUSDT", "SUI/USDT"],
    [instrument("ONDO"), instrument("SUI", { volume24hUsd: 90_000_000 })],
  );

  assert.deepEqual(registry.assets.map((asset) => asset.symbol), [
    "BTCUSDT",
    "ETHUSDT",
    "SUIUSDT",
    "ENAUSDT",
    "ONDOUSDT",
  ]);
  assert.deepEqual(
    registry.assets.filter((asset) => asset.isAnchor).map((asset) => asset.baseAsset),
    ["BTC", "ETH"],
  );
  assert.equal(registry.assets.find((asset) => asset.symbol === "ENAUSDT")?.sources.includes("configured"), true);
  assert.equal(registry.assets.find((asset) => asset.symbol === "SUIUSDT")?.sources.includes("observed"), true);
});

test("buildUniverseRegistry assigns scan tiers from anchors configuration and liquidity", () => {
  const registry = buildUniverseRegistry(
    ["ENA"],
    [
      instrument("SOL", { volume24hUsd: 180_000_000 }),
      instrument("SUI", { volume24hUsd: 60_000_000 }),
      instrument("MEME", { volume24hUsd: 0 }),
    ],
  );
  const tiers = new Map(registry.assets.map((asset) => [asset.baseAsset, asset.tier]));

  assert.equal(tiers.get("BTC"), "anchor");
  assert.equal(tiers.get("ETH"), "anchor");
  assert.equal(tiers.get("ENA"), "core");
  assert.equal(tiers.get("SOL"), "core");
  assert.equal(tiers.get("SUI"), "active");
  assert.equal(tiers.get("MEME"), "long_tail");
  assert.equal(registry.summary.core, 2);
  assert.equal(registry.summary.active, 1);
  assert.equal(registry.summary.longTail, 1);
});

test("buildUniverseRegistry records multi-exchange venue coverage quality", () => {
  const registry = buildUniverseRegistry([], [
    instrument("ARB", { exchange: "BINANCE", id: "BINANCE:ARBUSDT" }),
    instrument("ARB", { exchange: "OKX", id: "OKX:ARBUSDT" }),
    instrument("ARB", { exchange: "BYBIT", id: "BYBIT:ARBUSDT" }),
    instrument("SUI", { exchange: "OKX", id: "OKX:SUIUSDT" }),
    instrument("SUI", { exchange: "BYBIT", id: "BYBIT:SUIUSDT" }),
    instrument("MEME", { exchange: "BYBIT", id: "BYBIT:MEMEUSDT" }),
  ]);
  const coverageByBase = new Map(registry.assets.map((asset) => [asset.baseAsset, asset.venueCoverage]));

  assert.deepEqual(registry.assets.find((asset) => asset.baseAsset === "ARB")?.exchanges, [
    "BINANCE",
    "OKX",
    "BYBIT",
  ]);
  assert.equal(coverageByBase.get("ARB"), "major_three");
  assert.equal(coverageByBase.get("SUI"), "multi_exchange");
  assert.equal(coverageByBase.get("MEME"), "single_exchange");
  assert.equal(coverageByBase.get("BTC"), "unlisted");
  assert.equal(registry.summary.majorThree, 1);
  assert.equal(registry.summary.multiExchange, 1);
  assert.equal(registry.summary.singleExchange, 1);
  assert.equal(registry.summary.unlisted, 2);
});

test("buildUniverseRegistry marks unsupported observed instruments as skipped", () => {
  const registry = buildUniverseRegistry([], [
    instrument("OLD", { isActive: false }),
    instrument("BTC", { symbol: "BTCUSD", quoteAsset: "USD" }),
    instrument("DELIVERY", { marketType: "delivery" }),
  ]);

  assert.deepEqual(
    registry.skipped.map((asset) => [asset.symbol, asset.reason]),
    [
      ["OLDUSDT", "inactive"],
      ["BTCUSD", "quote_not_supported"],
      ["DELIVERYUSDT", "market_type_not_supported"],
    ],
  );
});

test("planUniverseScan pins anchors and rotates the remaining priority assets", () => {
  const registry = buildUniverseRegistry(
    ["ENA", "SUI", "ONDO", "TIA"],
    [
      instrument("SUI", { volume24hUsd: 120_000_000 }),
      instrument("ONDO", { volume24hUsd: 80_000_000 }),
      instrument("TIA", { volume24hUsd: 20_000_000 }),
    ],
  );
  const plan = planUniverseScan(registry, 4, new Date("2026-06-14T00:15:00.000Z"));

  assert.equal(plan.batchSize, 4);
  assert.deepEqual(plan.assets.slice(0, 2), ["BTC", "ETH"]);
  assert.equal(plan.assets.length, 4);
  assert.equal(plan.totalBatches, 2);
  assert.deepEqual(plan.anchorAssets, ["BTC", "ETH"]);
});

test("planUniverseScan rotates long tail assets at a lower frequency than core assets", () => {
  const registry = buildUniverseRegistry(
    ["SOL", "ENA"],
    [
      instrument("ARB", { volume24hUsd: 0 }),
      instrument("OP", { volume24hUsd: 0 }),
    ],
  );
  const firstCorePlan = planUniverseScan(registry, 3, new Date("2026-06-14T00:00:00.000Z"));
  const secondCorePlan = planUniverseScan(registry, 3, new Date("2026-06-14T00:15:00.000Z"));
  const longTailPlan = planUniverseScan(registry, 3, new Date("2026-06-14T01:45:00.000Z"));

  assert.deepEqual(firstCorePlan.assets, ["BTC", "ETH", "SOL"]);
  assert.deepEqual(secondCorePlan.assets, ["BTC", "ETH", "ENA"]);
  assert.deepEqual(longTailPlan.assets, ["BTC", "ETH", "ARB"]);
  assert.equal(longTailPlan.tierCounts.core, 2);
  assert.equal(longTailPlan.tierCounts.long_tail, 2);
  assert.equal(longTailPlan.selectedTierCounts.anchor, 2);
  assert.equal(longTailPlan.selectedTierCounts.long_tail, 1);
  assert.equal(longTailPlan.tierPolicy.longTailEveryWindows, 8);
});

test("buildCoverageReport includes scanned, pending, skipped, and coverage percent", () => {
  const registry = buildUniverseRegistry(
    ["ENA", "SUI", "ONDO", "TIA"],
    [
      instrument("SUI", { volume24hUsd: 120_000_000 }),
      instrument("OLD", { isActive: false }),
    ],
  );
  const plan = planUniverseScan(registry, 3, new Date("2026-06-14T00:00:00.000Z"));
  const coverage = buildCoverageReport(registry, plan);

  assert.equal(coverage.total, 7);
  assert.equal(coverage.eligible, 6);
  assert.equal(coverage.scanned, 3);
  assert.equal(coverage.pending, 3);
  assert.equal(coverage.skipped, 1);
  assert.equal(coverage.coveragePercent, 50);
  assert.deepEqual(coverage.skippedAssets, [{ symbol: "OLDUSDT", reason: "inactive" }]);
});

test("buildCoverageReport includes exchange coverage details and summary", () => {
  const registry = buildUniverseRegistry([], [
    instrument("ARB", { exchange: "BINANCE", id: "BINANCE:ARBUSDT" }),
    instrument("ARB", { exchange: "OKX", id: "OKX:ARBUSDT" }),
    instrument("ARB", { exchange: "BYBIT", id: "BYBIT:ARBUSDT" }),
    instrument("SUI", { exchange: "OKX", id: "OKX:SUIUSDT" }),
    instrument("SUI", { exchange: "BYBIT", id: "BYBIT:SUIUSDT" }),
    instrument("MEME", { exchange: "BYBIT", id: "BYBIT:MEMEUSDT" }),
  ]);
  const plan = planUniverseScan(registry, 4, new Date("2026-06-14T00:00:00.000Z"));
  const coverage = buildCoverageReport(registry, plan);

  assert.deepEqual(coverage.exchangeCoverageSummary, {
    majorThree: 1,
    multiExchange: 1,
    singleExchange: 1,
    unlisted: 2,
  });
  assert.deepEqual(
    (coverage.exchangeCoverage ?? []).find((item) => item.symbol === "ARBUSDT"),
    {
      baseAsset: "ARB",
      exchangeCount: 3,
      exchanges: ["BINANCE", "OKX", "BYBIT"],
      symbol: "ARBUSDT",
      venueCoverage: "major_three",
    },
  );
});
