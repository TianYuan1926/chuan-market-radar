import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCoverageReport,
  buildUniverseRegistry,
  normalizeUniverseAsset,
  planUniverseScan,
} from "./universe-registry";
import type { ContractInstrument } from "./types";
import { buildStaticFuturesUniverseSeed } from "./providers/static-futures-universe-seed";

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

test("normalizeUniverseAsset rejects non-crypto underlyings", () => {
  assert.equal(normalizeUniverseAsset("NVDAUSDT"), null);
  assert.equal(normalizeUniverseAsset("SPY/USDT"), null);
  assert.equal(normalizeUniverseAsset("XAU"), null);
  assert.equal(normalizeUniverseAsset("CIENUSDT"), null);
  assert.equal(normalizeUniverseAsset("SOXLUSDT"), null);
  assert.equal(normalizeUniverseAsset("WDCUSDT"), null);
  assert.equal(normalizeUniverseAsset("HOODUSDT"), null);
  assert.equal(normalizeUniverseAsset("CRCLUSDT"), null);
  assert.equal(normalizeUniverseAsset("RIVNUSDT"), null);
  assert.equal(normalizeUniverseAsset("LRCXUSDT"), null);
  assert.equal(normalizeUniverseAsset("KLACUSDT"), null);
  assert.equal(normalizeUniverseAsset("ISRGUSDT"), null);
  assert.equal(normalizeUniverseAsset("RKLBUSDT"), null);
  assert.equal(normalizeUniverseAsset("POETUSDT"), null);
  assert.equal(normalizeUniverseAsset("SPCXUSDT"), null);
  assert.equal(normalizeUniverseAsset("CLUSDT"), null);
  assert.equal(normalizeUniverseAsset("QCOMUSDT"), null);
  assert.equal(normalizeUniverseAsset("ARMUSDT"), null);
  assert.equal(normalizeUniverseAsset("MRVLUSDT"), null);
  assert.equal(normalizeUniverseAsset("DRAMUSDT"), null);
  assert.equal(normalizeUniverseAsset("SKHYNIXUSDT"), null);
  assert.equal(normalizeUniverseAsset("MUUSDT"), null);
});

test("buildUniverseRegistry dedupes assets and keeps BTC and ETH as anchors", () => {
  const registry = buildUniverseRegistry(
    ["ena", "ENAUSDT", "SUI/USDT", "NVDAUSDT"],
    [instrument("ONDO"), instrument("SUI", { volume24hUsd: 90_000_000 }), instrument("SPY")],
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

test("planUniverseScan keeps broad fallback universe rotating instead of collapsing to configured assets", () => {
  const registry = buildUniverseRegistry(
    ["SOL", "ENA", "SUI", "ONDO", "TIA"],
    buildStaticFuturesUniverseSeed("2026-06-19T00:00:00.000Z"),
  );
  const plan = planUniverseScan(registry, 24, new Date("2026-06-19T00:00:00.000Z"));
  const coverage = buildCoverageReport(registry, plan);

  assert.ok(registry.summary.observed > 100);
  assert.equal(plan.assets.length, 24);
  assert.deepEqual(plan.assets.slice(0, 2), ["BTC", "ETH"]);
  assert.ok(plan.pendingAssets.length > 100);
  assert.ok(plan.totalBatches > 1);
  assert.equal(coverage.scanned, 24);
  assert.ok(coverage.eligible > 100);
  assert.notEqual(coverage.coveragePercent, 100);
  assert.ok(coverage.pending > 100);
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

test("planUniverseScan keeps the only rotating slot available for rotation when dynamic hints exist", () => {
  const registry = buildUniverseRegistry(
    ["SOL", "ENA"],
    [
      instrument("ARB", { volume24hUsd: 0 }),
      instrument("OP", { volume24hUsd: 0 }),
    ],
  );
  const plan = planUniverseScan(registry, 3, new Date("2026-06-14T00:00:00.000Z"), {
    priorityHints: [
      {
        symbol: "ARBUSDT",
        anomalyScore: 94,
        historicalSampleSize: 12,
        historicalWinRate: 0.72,
        recentSignalCount: 3,
      },
    ],
  });

  assert.deepEqual(plan.assets, ["BTC", "ETH", "SOL"]);
  assert.equal(plan.batchSize, 3);
  assert.equal(plan.requestsPlanned, 3);
  assert.deepEqual(plan.anchorAssets, ["BTC", "ETH"]);
  assert.deepEqual(plan.dynamicPriority.boostedAssets, []);
  assert.equal(plan.dynamicPriority.enabled, true);
  assert.equal(plan.dynamicPriority.slotsAvailable, 0);
  assert.equal(plan.dynamicPriority.candidates[0]?.status, "queued");
  assert.equal(plan.dynamicPriority.topAssets[0]?.baseAsset, "ARB");
  assert.ok(plan.dynamicPriority.topAssets[0]?.dynamicBoost ?? 0 > 0);
  assert.ok(plan.dynamicPriority.topAssets[0]?.reasons.includes("anomaly"));
  assert.equal(plan.rotationAudit.status, "watch");
  assert.equal(plan.rotationAudit.slots.rotatingSlots, 1);
  assert.equal(plan.rotationAudit.slots.dynamicPrioritySlots, 0);
  assert.deepEqual(plan.rotationAudit.priorityQueue.queuedAssets, ["ARB"]);
  assert.equal(
    plan.rotationAudit.warnings.some((warning) => warning.id === "single_rotation_slot"),
    true,
  );
  assert.match(plan.rotationAudit.guardrail, /不增加请求/);
});

test("planUniverseScan exposes priority admission metadata within the same request budget", () => {
  const registry = buildUniverseRegistry(
    ["SOL", "ENA"],
    [
      instrument("ARB", { volume24hUsd: 75_000_000 }),
      instrument("OP", { volume24hUsd: 70_000_000 }),
      instrument("MANTA", { volume24hUsd: 0 }),
    ],
  );
  const plan = planUniverseScan(registry, 4, new Date("2026-06-14T00:00:00.000Z"), {
    dynamicPrioritySlots: 1,
    priorityHints: [
      {
        symbol: "ARBUSDT",
        anomalyScore: 92,
        historicalSampleSize: 20,
        historicalWinRate: 0.75,
        recentSignalCount: 4,
      },
      {
        symbol: "OPUSDT",
        anomalyScore: 88,
        recentSignalCount: 2,
      },
    ],
  });

  assert.equal(plan.assets.length, 4);
  assert.equal(plan.requestsPlanned, 4);
  assert.equal(plan.dynamicPriority.enabled, true);
  assert.equal(plan.dynamicPriority.candidateCount, 2);
  assert.equal(plan.dynamicPriority.slotsAvailable, 1);
  assert.equal(plan.dynamicPriority.slotsUsed, 1);
  assert.equal(plan.dynamicPriority.candidates[0]?.status, "selected");
  assert.equal(plan.dynamicPriority.candidates[1]?.status, "queued");
  assert.match(plan.dynamicPriority.candidates[1]?.statusReason ?? "", /等待后续批次/);
  assert.equal(plan.dynamicPriority.reasonCounts.anomaly, 2);
  assert.equal(plan.dynamicPriority.reasonCounts.recent_signal, 2);
  assert.equal(plan.dynamicPriority.reasonCounts.history, 1);
});

test("planUniverseScan preserves exploration when priority hints are crowded", () => {
  const registry = buildUniverseRegistry(
    ["SOL", "ENA"],
    [
      instrument("ARB", { volume24hUsd: 75_000_000 }),
      instrument("OP", { volume24hUsd: 70_000_000 }),
      instrument("TIA", { volume24hUsd: 60_000_000 }),
      instrument("WIF", { volume24hUsd: 55_000_000 }),
      instrument("MANTA", { volume24hUsd: 0 }),
      instrument("PONKE", { volume24hUsd: 0 }),
    ],
  );
  const plan = planUniverseScan(registry, 6, new Date("2026-06-14T00:00:00.000Z"), {
    dynamicPrioritySlots: 4,
    priorityHints: [
      { symbol: "ARBUSDT", anomalyScore: 95, recentSignalCount: 4 },
      { symbol: "OPUSDT", anomalyScore: 92, recentSignalCount: 3 },
      { symbol: "MANTAUSDT", anomalyScore: 90, historicalSampleSize: 6, historicalWinRate: 0.67 },
      { symbol: "TIAUSDT", anomalyScore: 88, recentSignalCount: 2 },
      { symbol: "WIFUSDT", anomalyScore: 86, recentSignalCount: 2 },
    ],
  });

  assert.equal(plan.assets.length, 6);
  assert.equal(plan.requestsPlanned, 6);
  assert.equal(plan.dynamicPriority.slotsAvailable, 3);
  assert.equal(plan.twoStageAllocation.mode, "two_stage_deep_scan_v1");
  assert.equal(plan.twoStageAllocation.stageTwo.prioritySlots, 3);
  assert.equal(plan.twoStageAllocation.stageTwo.explorationSlots, 1);
  assert.ok(plan.twoStageAllocation.stageTwo.queuedPriorityAssets.includes("WIF"));
  assert.equal(
    plan.twoStageAllocation.slots.some((slot) =>
      slot.kind === "long_tail_exploration" && slot.baseAsset === "PONKE"
    ),
    true,
  );
  assert.match(plan.twoStageAllocation.guardrail, /未进入深扫不代表淘汰/u);
  assert.equal(plan.rotationAudit.slots.explorationReserveSlots, 1);
  assert.deepEqual(plan.rotationAudit.slots.selectedLongTailAssets, ["PONKE"]);
  assert.equal(
    plan.rotationAudit.warnings.some((warning) => warning.id === "exploration_missing"),
    false,
  );
  assert.ok(plan.rotationAudit.priorityQueue.queuedAssets.includes("WIF"));
  assert.match(plan.rotationAudit.fairnessRules.join(" "), /不能长期吃光常规轮转/);
});

test("buildCoverageReport exposes scan rotation audit for frontend and operations", () => {
  const registry = buildUniverseRegistry(
    ["SOL", "ENA"],
    [
      instrument("ARB", { volume24hUsd: 75_000_000 }),
      instrument("MANTA", { volume24hUsd: 0 }),
    ],
  );
  const plan = planUniverseScan(registry, 4, new Date("2026-06-14T00:00:00.000Z"), {
    priorityHints: [
      { symbol: "ARBUSDT", anomalyScore: 94, recentSignalCount: 2 },
      { symbol: "MANTAUSDT", anomalyScore: 88, missedOpportunityCount: 1 },
    ],
  });
  const coverage = buildCoverageReport(registry, plan);

  assert.equal(coverage.rotationAudit?.mode, "scan_rotation_audit_v1");
  assert.equal(coverage.rotationAudit?.slots.anchorSlots, 2);
  assert.equal(coverage.rotationAudit?.slots.rotatingSlots, 2);
  assert.deepEqual(coverage.rotationAudit?.slots.selectedNonAnchorAssets, plan.assets.slice(2));
  assert.match(coverage.rotationAudit?.operatorHint ?? "", /轮转/);
});

test("planUniverseScan ranks missed opportunity hints above stale familiar archive pressure", () => {
  const registry = buildUniverseRegistry(
    ["SOL", "ENA"],
    [
      instrument("OLD", { volume24hUsd: 90_000_000 }),
      instrument("LOSSY", { volume24hUsd: 95_000_000 }),
      instrument("PONKE", { volume24hUsd: 15_000_000 }),
      instrument("MANTA", { volume24hUsd: 45_000_000 }),
    ],
  );
  const plan = planUniverseScan(registry, 5, new Date("2026-06-16T00:00:00.000Z"), {
    dynamicPrioritySlots: 2,
    priorityHints: [
      { symbol: "OLDUSDT", anomalyScore: 100, recentSignalCount: 5 },
      {
        symbol: "LOSSYUSDT",
        anomalyScore: 100,
        cooldownReviewCount: 4,
        historicalSampleSize: 4,
        historicalWinRate: 0,
        recentSignalCount: 5,
      },
      {
        symbol: "PONKEUSDT",
        anomalyScore: 72,
        missedOpportunityCount: 2,
        recentSignalCount: 2,
      },
      { symbol: "MANTAUSDT", anomalyScore: 60, recentSignalCount: 1 },
    ],
  });

  assert.equal(plan.dynamicPriority.topAssets[0]?.baseAsset, "PONKE");
  assert.ok(plan.dynamicPriority.topAssets[0]?.reasons.includes("missed_opportunity"));
  assert.ok(plan.dynamicPriority.reasonCounts.missed_opportunity);
  assert.ok(plan.dynamicPriority.reasonCounts.cooldown_review);
  assert.ok(
    (plan.dynamicPriority.topAssets.find((asset) => asset.baseAsset === "LOSSY")?.score ?? 0) <
      (plan.dynamicPriority.topAssets.find((asset) => asset.baseAsset === "OLD")?.score ?? 0),
  );
});

test("planUniverseScan uses persistent rotation hints to avoid repeatedly deep scanning the same asset", () => {
  const registry = buildUniverseRegistry(
    ["SOL", "ENA"],
    [
      instrument("TIA", { volume24hUsd: 90_000_000 }),
      instrument("SUI", { volume24hUsd: 80_000_000 }),
      instrument("MANTA", { volume24hUsd: 70_000_000 }),
    ],
  );
  const plan = planUniverseScan(registry, 4, new Date("2026-06-20T09:15:00.000Z"), {
    dynamicPrioritySlots: 1,
    priorityHints: [
      {
        symbol: "TIAUSDT",
        anomalyScore: 90,
        deepScanCount1h: 2,
        recentDeepScanPenalty: 900000,
        recentSignalCount: 4,
      },
      {
        symbol: "SUIUSDT",
        consecutiveSkipped: 8,
        rotationAgeBoost: 720000,
        rotationPriorityScore: 720000,
      },
    ],
  });

  assert.equal(plan.dynamicPriority.topAssets[0]?.baseAsset, "SUI");
  assert.ok(plan.dynamicPriority.topAssets[0]?.reasons.includes("rotation_age"));
  assert.equal(plan.dynamicPriority.reasonCounts.rotation_age, 1);
  assert.equal(plan.dynamicPriority.reasonCounts.recent_deep_scan, 1);
  assert.equal(plan.dynamicPriority.boostedAssets.includes("SUI"), true);
  assert.equal(plan.dynamicPriority.boostedAssets.includes("TIA"), false);
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
  assert.equal(coverage.dynamicPriority?.enabled, false);
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
