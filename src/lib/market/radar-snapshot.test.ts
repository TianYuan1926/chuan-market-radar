import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal } from "../analysis/types";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import type { GetConfiguredMarketProviderOptions, ProviderEnv } from "./provider-registry";
import {
  buildRepositoryAwareMarketProvider,
  enrichSnapshotWithAiReviews,
  getMarketRadarSnapshot,
  getReadableMarketRadarSnapshot,
  refreshMarketRadarSnapshot,
} from "./radar-snapshot";
import type { MarketDataProvider, MarketRadarSnapshot } from "./types";

function signal(overrides: Partial<MarketSignal> = {}): MarketSignal {
  return {
    id: "ena-ai-boundary",
    symbol: "ENAUSDT",
    exchange: "BINANCE",
    direction: "long",
    state: "near_trigger",
    timeframe: "15m",
    regime: "mixed",
    confidence: 76,
    risk: "medium",
    updatedAt: "2026-06-14T12:00:00.000Z",
    summary: "测试信号",
    evidence: [
      {
        label: "Volume Ratio 1.9",
        value: "量能放大。",
        layer: "price_volume",
        polarity: "supportive",
      },
    ],
    strategy: {
      bias: "long",
      entry: "回踩确认",
      invalidation: "跌回箱体",
      targets: ["前高"],
      riskReward: 3,
      positionHint: "等待确认",
    },
    ...overrides,
  };
}

function snapshot(signals: MarketSignal[] = [signal()]): MarketRadarSnapshot {
  return {
    metadata: {
      id: "scan-ai-boundary",
      mode: "demo",
      status: "ready",
      source: "mock",
      isRealtime: false,
      cadenceMinutes: 15,
      scannedCount: 8,
      anomalyCount: signals.length,
      candidateCount: signals.length,
      riskGate: "on",
      generatedAt: "2026-06-14T12:00:00.000Z",
      nextScanAt: "2026-06-14T12:15:00.000Z",
      staleAfterMinutes: 30,
      notes: ["test"],
    },
    instrumentPool: {
      instruments: [],
      rejected: [],
      summary: {
        total: 0,
        accepted: 0,
        rejected: 0,
        duplicatesRemoved: 0,
        minVolume24hUsd: 5_000_000,
        quoteAssets: ["USDT"],
        marketTypes: ["perpetual"],
      },
    },
    instruments: [],
    tickers: [],
    derivatives: [],
    heatmap: [],
    signals,
    journalEvents: [],
  };
}

test("enrichSnapshotWithAiReviews attaches rule review without external AI config", async () => {
  const enriched = await enrichSnapshotWithAiReviews(snapshot(), {
    now: () => new Date("2026-06-14T12:01:00.000Z"),
  });

  assert.equal(enriched.signals[0]?.aiReview?.status, "reviewed");
  assert.equal(enriched.signals[0]?.aiReview?.provider, "rule-engine");
  assert.equal(enriched.signals[0]?.aiReview?.model, "deterministic-counter-review-v1");
});

test("enrichSnapshotWithAiReviews ignores stale AI env and keeps using rules", async () => {
  const enriched = await enrichSnapshotWithAiReviews(snapshot(), {
    now: () => new Date("2026-06-14T12:02:00.000Z"),
  });

  assert.equal(enriched.signals.length, 1);
  assert.equal(enriched.signals[0]?.aiReview?.status, "reviewed");
  assert.equal(enriched.signals[0]?.aiReview?.boundary.cost.reason, "external AI disabled by product decision");
});

test("enrichSnapshotWithAiReviews reviews every mature signal without AI budget caps", async () => {
  const enriched = await enrichSnapshotWithAiReviews(snapshot([
    signal({ id: "ai-budget-1", symbol: "TIAUSDT" }),
    signal({ id: "ai-budget-2", symbol: "SUIUSDT" }),
  ]));

  assert.equal(enriched.signals[0]?.aiReview?.status, "reviewed");
  assert.equal(enriched.signals[1]?.aiReview?.status, "reviewed");
  assert.equal(enriched.signals[1]?.aiReview?.boundary.cost.maxSignalsPerSnapshot, Number.MAX_SAFE_INTEGER);
  assert.equal(enriched.signals[1]?.aiReview?.boundary.canCreateTradeSignal, false);
});

test("enrichSnapshotWithAiReviews skips model calls for signals below evidence maturity", async () => {
  const enriched = await enrichSnapshotWithAiReviews(snapshot([
    signal({
      evidence: [],
      state: "insufficient_data",
      strategy: {
        bias: "neutral",
        entry: "等待数据补齐",
        invalidation: "数据缺失",
        positionHint: "不参与",
        riskReward: 0,
        status: "blocked",
        targets: [],
      },
      symbol: "COLDUSDT",
    }),
  ]), {
    now: () => new Date("2026-06-14T12:03:00.000Z"),
  });

  assert.equal(enriched.signals[0]?.maturity?.stage, "DEEP_SCAN_CANDIDATE");
  assert.equal(enriched.signals[0]?.aiReview?.status, "disabled");
  assert.match(enriched.signals[0]?.aiReview?.reason ?? "", /RULE_REVIEW_MATURITY_GATE/);
});

test("buildRepositoryAwareMarketProvider injects durable priority hints into the default provider", async () => {
  const repository = createMemoryPersistenceRepository();
  let capturedOptions: GetConfiguredMarketProviderOptions | undefined;
  const provider: MarketDataProvider = {
    id: "mock",
    label: "Captured Provider",
    async fetchSnapshot() {
      return snapshot([]);
    },
  };

  await repository.addScanArchive({
    id: "scan-tia",
    source: "coinglass",
    status: "ready",
    generatedAt: "2026-06-15T00:00:00.000Z",
    scannedCount: 30,
    anomalyCount: 1,
    candidateCount: 1,
    topSymbols: ["TIAUSDT"],
    notes: [],
  }, {
    id: "scan-tia",
    source: "coinglass",
    status: "ready",
    generatedAt: "2026-06-15T00:00:00.000Z",
    nextScanAt: "2026-06-15T00:15:00.000Z",
    cadenceMinutes: 15,
    scannedCount: 30,
    anomalyCount: 1,
    candidateCount: 1,
    signals: [],
  });

  const result = await buildRepositoryAwareMarketProvider({
    env: {
      MARKET_DATA_PROVIDER: "coinglass",
      COINGLASS_API_KEY: "test-key",
    },
    providerFactory: (_env?: ProviderEnv, options?: GetConfiguredMarketProviderOptions) => {
      capturedOptions = options;
      return provider;
    },
    repository,
  });

  assert.equal(result.label, "Captured Provider");
  assert.equal(capturedOptions?.universePriorityHints?.[0]?.symbol, "TIAUSDT");
  assert.match(capturedOptions?.universePriorityHintNotes?.join("\n") ?? "", /repository priority hints: 1 built from memory/);
});

test("buildRepositoryAwareMarketProvider injects durable BTC dominance and TOTAL2 TOTAL3 macro anchors", async () => {
  const repository = createMemoryPersistenceRepository();
  let capturedOptions: GetConfiguredMarketProviderOptions | undefined;
  const provider: MarketDataProvider = {
    id: "mock",
    label: "Captured Macro Provider",
    async fetchSnapshot() {
      return snapshot([]);
    },
  };

  await repository.addMacroMarketSnapshot({
    allowedUse: "macro_context_only",
    btcDominancePercent: 53,
    canCreateTradeSignal: false,
    ethDominancePercent: 11,
    fetchedAt: "2026-06-20T00:00:00.000Z",
    guardrail: "不能直接生成交易方向",
    id: "macro-old",
    source: "coingecko_global",
    total2MarketCapUsd: 1_316_000_000_000,
    total3MarketCapUsd: 1_008_000_000_000,
    totalMarketCapChangePercent24h: -0.2,
    totalMarketCapUsd: 2_800_000_000_000,
    updatedAt: "2026-06-20T00:00:00.000Z",
  });
  await repository.addMacroMarketSnapshot({
    allowedUse: "macro_context_only",
    btcDominancePercent: 52,
    canCreateTradeSignal: false,
    ethDominancePercent: 10,
    fetchedAt: "2026-06-21T00:00:00.000Z",
    guardrail: "不能直接生成交易方向",
    id: "macro-current",
    source: "coingecko_global",
    total2MarketCapUsd: 1_440_000_000_000,
    total3MarketCapUsd: 1_140_000_000_000,
    totalMarketCapChangePercent24h: 1.8,
    totalMarketCapUsd: 3_000_000_000_000,
    updatedAt: "2026-06-21T00:00:00.000Z",
  });

  await buildRepositoryAwareMarketProvider({
    env: {
      MARKET_DATA_PROVIDER: "coinglass",
      COINGLASS_API_KEY: "test-key",
    },
    providerFactory: (_env?: ProviderEnv, options?: GetConfiguredMarketProviderOptions) => {
      capturedOptions = options;
      return provider;
    },
    repository,
  });

  assert.equal(capturedOptions?.altcoinMacro?.source, "coingecko_global");
  assert.equal(capturedOptions?.altcoinMacro?.btcDominancePercent, 52);
  assert.equal(capturedOptions?.altcoinMacro?.total2ChangePercent24h, 9.42);
  assert.equal(capturedOptions?.altcoinMacro?.total3ChangePercent24h, 13.1);
  assert.match(capturedOptions?.universePriorityHintNotes?.join("\n") ?? "", /macro anchors: coingecko_global BTC.D 52/);
});

test("getReadableMarketRadarSnapshot returns a failed placeholder when the provider is unavailable", async () => {
  const repository = createMemoryPersistenceRepository();
  const provider: MarketDataProvider = {
    id: "coinglass",
    label: "Unavailable CoinGlass Provider",
    async fetchSnapshot() {
      throw new Error("Upgrade plan");
    },
  };

  await assert.rejects(
    getMarketRadarSnapshot(provider, { repository }),
    /Upgrade plan/,
  );

  const readable = await getReadableMarketRadarSnapshot(provider, {
    repository,
    trigger: "health_get",
  });

  assert.equal(readable.metadata.status, "failed");
  assert.equal(readable.metadata.source, "composite");
  assert.equal(readable.metadata.runtime?.cacheStatus, "failed");
  assert.equal(readable.metadata.runtime?.trigger, "health_get");
  assert.match(readable.metadata.notes.join("\n"), /Upgrade plan/);
  assert.equal(readable.signals.length, 0);
});

test("getReadableMarketRadarSnapshot can perform a no-refresh read for health checks", async () => {
  const repository = createMemoryPersistenceRepository();
  let fetchCount = 0;
  const provider: MarketDataProvider = {
    id: "coinglass",
    label: "Expensive Provider",
    async fetchSnapshot() {
      fetchCount += 1;
      return snapshot([]);
    },
  };

  const readable = await getReadableMarketRadarSnapshot(provider, {
    allowRefresh: false,
    repository,
    trigger: "health_get",
  });

  assert.equal(fetchCount, 0);
  assert.equal(readable.metadata.status, "failed");
  assert.equal(readable.metadata.runtime?.cacheStatus, "failed");
  assert.equal(readable.metadata.runtime?.trigger, "health_get");
  assert.match(readable.metadata.notes.join("\n"), /no-refresh read/);
});

test("getReadableMarketRadarSnapshot degrades when no-refresh repository reads hang", async () => {
  const previousTimeout = process.env.READONLY_SNAPSHOT_READ_TIMEOUT_MS;
  process.env.READONLY_SNAPSHOT_READ_TIMEOUT_MS = "500";
  const baseRepository = createMemoryPersistenceRepository();
  const never = () => new Promise<never>(() => {});
  const repository = {
    ...baseRepository,
    mode: "database" as const,
    compareLatestScanArchives: never,
    getScanReplayFrame: never,
    getScanSnapshot: never,
    listScanArchives: never,
  };
  const provider: MarketDataProvider = {
    id: "mock",
    label: "Unused Provider",
    async fetchSnapshot() {
      return snapshot([]);
    },
  };

  try {
    const startedAt = Date.now();
    const readable = await getReadableMarketRadarSnapshot(provider, {
      allowRefresh: false,
      repository,
      trigger: "page_ssr",
    });
    const elapsedMs = Date.now() - startedAt;

    assert.ok(elapsedMs < 2_000, `expected snapshot timeout below 2s, got ${elapsedMs}ms`);
    assert.equal(readable.metadata.status, "failed");
    assert.equal(readable.metadata.runtime?.trigger, "page_ssr");
    assert.match(readable.metadata.notes.join("\n"), /timed out/);
    assert.equal(readable.archive?.entries.length, 0);
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.READONLY_SNAPSHOT_READ_TIMEOUT_MS;
    } else {
      process.env.READONLY_SNAPSHOT_READ_TIMEOUT_MS = previousTimeout;
    }
  }
});

test("getMarketRadarSnapshot reads without writing archives while refresh persists them", async () => {
  const repository = createMemoryPersistenceRepository();
  const provider: MarketDataProvider = {
    id: "mock",
    label: "Read Write Boundary Provider",
    async fetchSnapshot() {
      return snapshot([]);
    },
  };

  await getMarketRadarSnapshot(provider, { repository });

  assert.equal((await repository.listScanArchives()).length, 0);

  const refreshed = await refreshMarketRadarSnapshot(provider, { repository });

  assert.equal(refreshed.status, "updated");
  assert.equal((await repository.listScanArchives()).length, 1);
});

test("refreshMarketRadarSnapshot persists scan asset rotation states from coverage", async () => {
  const repository = createMemoryPersistenceRepository();
  const provider: MarketDataProvider = {
    id: "coinglass",
    label: "Coverage Provider",
    async fetchSnapshot() {
      return {
        ...snapshot([]),
        metadata: {
          ...snapshot([]).metadata,
          generatedAt: "2026-06-20T09:15:00.000Z",
          source: "coinglass",
          coverage: {
            batchIndex: 1,
            coveragePercent: 50,
            dynamicPriority: {
              boostedAssets: ["TIA"],
              candidateCount: 1,
              candidates: [],
              enabled: true,
              reasonCounts: {
                anomaly: 1,
                early_opportunity: 0,
                liquidity: 0,
                recent_deep_scan: 0,
                overextended_move: 0,
                recent_signal: 1,
                rotation_age: 0,
                venue_coverage: 0,
              },
              slotsAvailable: 1,
              slotsUsed: 1,
              topAssets: [
                {
                  baseAsset: "TIA",
                  dynamicBoost: 820000,
                  reasons: ["anomaly"],
                  score: 1000000,
                  staticPriority: 180000,
                  symbol: "TIAUSDT",
                },
              ],
            },
            eligible: 5,
            nextBatchIndex: 2,
            pending: 2,
            pendingAssets: ["SUI", "ENA"],
            scanned: 3,
            scannedAssets: ["BTC", "ETH", "TIA"],
            skipped: 0,
            skippedAssets: [],
            total: 5,
            totalBatches: 2,
          },
        },
      };
    },
  };

  const refreshed = await refreshMarketRadarSnapshot(provider, { repository });
  const states = await repository.listScanAssetStates();
  const bySymbol = new Map(states.map((state) => [state.symbol, state]));
  const persistedGeneratedAt = refreshed.snapshot?.metadata.generatedAt;

  assert.equal(refreshed.status, "updated");
  assert.equal(bySymbol.get("TIAUSDT")?.lastDeepScannedAt, persistedGeneratedAt);
  assert.equal(bySymbol.get("TIAUSDT")?.lastSelectedReason, "dynamic_priority");
  assert.equal(bySymbol.get("SUIUSDT")?.consecutiveSkipped, 1);
  assert.equal(bySymbol.get("ENAUSDT")?.consecutiveSkipped, 1);
});
