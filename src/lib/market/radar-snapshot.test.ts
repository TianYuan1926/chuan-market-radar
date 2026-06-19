import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal } from "../analysis/types";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import type { GetConfiguredMarketProviderOptions, ProviderEnv } from "./provider-registry";
import {
  buildRepositoryAwareMarketProvider,
  enrichSnapshotWithAiReviews,
  getMarketRadarSnapshot,
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

test("enrichSnapshotWithAiReviews attaches a visible disabled AI review when AI is not configured", async () => {
  let fetchCount = 0;
  const enriched = await enrichSnapshotWithAiReviews(snapshot(), {
    env: {},
    fetcher: async () => {
      fetchCount += 1;
      return new Response("{}");
    },
  });

  assert.equal(fetchCount, 0);
  assert.equal(enriched.signals[0]?.aiReview?.status, "disabled");
  assert.match(enriched.signals[0]?.aiReview?.reason ?? "", /AI_REVIEW_ENABLED/);
});

test("enrichSnapshotWithAiReviews keeps the snapshot usable when the model fails", async () => {
  const enriched = await enrichSnapshotWithAiReviews(snapshot(), {
    env: {
      AI_REVIEW_ENABLED: "true",
      AI_API_KEY: "test-key",
      AI_MODEL: "review-model",
      AI_BASE_URL: "https://ai.example.test/v1/chat/completions",
    },
    fetcher: async () => {
      throw new Error("model offline");
    },
  });

  assert.equal(enriched.signals.length, 1);
  assert.equal(enriched.signals[0]?.aiReview?.status, "fallback");
  assert.match(enriched.signals[0]?.aiReview?.reason ?? "", /model offline/);
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
