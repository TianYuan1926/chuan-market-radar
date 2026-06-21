import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent } from "@/lib/analysis/types";
import type { StrategyV3Dossier } from "@/lib/analysis/v3/types";
import type { RankProfile } from "@/lib/journal/rank-engine";
import type { DailyMoverSnapshot } from "@/lib/market/daily-movers";
import type { MacroMarketSnapshot } from "@/lib/market/macro-snapshot";
import type { OhlcvCandleCacheEntry } from "@/lib/market/ohlcv/types";
import type {
  MarketRadarSnapshot,
  ScanArchiveSummary,
  ScanAssetState,
  ScanReplayFrame,
} from "@/lib/market/types";
import {
  createMemoryPersistenceRepository,
  createPersistenceRepository,
  createPostgresPersistenceRepository,
  detectPersistenceMode,
  type SqlClient,
} from "./persistence-store";

type QueryCall = {
  sql: string;
  params: unknown[];
};

class RecordingSqlClient implements SqlClient {
  calls: QueryCall[] = [];
  responses: Array<{ rows: unknown[] }> = [];

  async query<T = unknown>(sql: string, params: unknown[] = []) {
    this.calls.push({ sql, params });

    return (this.responses.shift() ?? { rows: [] }) as { rows: T[] };
  }
}

function journalEvent(overrides: Partial<JournalEvent> = {}): JournalEvent {
  return {
    id: "journal-ena-track",
    symbol: "ENAUSDT",
    title: "等待突破后回踩",
    result: "watching",
    note: "必须让市场先给确认。",
    rankDelta: 0,
    createdAt: "2026-06-12T10:15:00.000+08:00",
    action: "track",
    reviewStatus: "tracking",
    timeframe: "15m",
    direction: "long",
    strategyStatus: "waiting",
    riskReward: 3.2,
    trigger: "回踩确认",
    invalidation: "跌回箱体",
    thesis: "接近触发，但不能追。",
    plannedReviewAt: "2026-06-12T11:45:00.000+08:00",
    lessons: ["等待确认"],
    ...overrides,
  };
}

function scanSummary(): ScanArchiveSummary {
  return {
    id: "scan-2026-06-12T10-15",
    source: "mock",
    status: "ready",
    generatedAt: "2026-06-12T10:15:00.000+08:00",
    scannedCount: 24,
    anomalyCount: 4,
    candidateCount: 4,
    topSymbols: ["ENAUSDT", "SUIUSDT"],
    notes: ["演示数据", "非实时扫描"],
  };
}

function replayFrame(): ScanReplayFrame {
  return {
    id: "scan-2026-06-12T10-15",
    source: "mock",
    status: "ready",
    generatedAt: "2026-06-12T10:15:00.000+08:00",
    nextScanAt: "2026-06-12T10:30:00.000+08:00",
    cadenceMinutes: 15,
    scannedCount: 24,
    anomalyCount: 4,
    candidateCount: 4,
    signals: [
      {
        id: "ena-near-trigger",
        symbol: "ENAUSDT",
        direction: "long",
        state: "near_trigger",
        timeframe: "15m",
        confidence: 80,
        risk: "low",
        riskReward: 4,
        strategyStatus: "actionable",
        updatedAt: "2026-06-12T10:15:00.000+08:00",
        summary: "压缩、放量、OI 同时出现。",
      },
    ],
  };
}

function radarSnapshot(): MarketRadarSnapshot {
  const summary = scanSummary();

  return {
    metadata: {
      id: summary.id,
      mode: "scheduled",
      status: summary.status,
      source: summary.source,
      isRealtime: false,
      cadenceMinutes: 15,
      scannedCount: summary.scannedCount,
      anomalyCount: summary.anomalyCount,
      candidateCount: summary.candidateCount,
      riskGate: "on",
      generatedAt: summary.generatedAt,
      nextScanAt: "2026-06-12T10:30:00.000+08:00",
      staleAfterMinutes: 30,
      notes: summary.notes,
    },
    instrumentPool: {
      instruments: [],
      rejected: [],
      summary: {
        accepted: 24,
        duplicatesRemoved: 0,
        marketTypes: ["perpetual"],
        minVolume24hUsd: 5_000_000,
        quoteAssets: ["USDT"],
        rejected: 0,
        total: 24,
      },
    },
    instruments: [],
    tickers: [],
    derivatives: [],
    heatmap: [],
    signals: [],
    journalEvents: [],
  };
}

function strategyV3Dossier(): StrategyV3Dossier {
  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    currentPrice: 12.7,
    forwardLevels: [
      {
        id: "enausdt-support-current",
        symbol: "ENAUSDT",
        side: "SUPPORT",
        role: "CURRENT_DEFENSE",
        zoneLow: 11.8,
        zoneHigh: 12.1,
        timeframeWeight: 4,
        keyScore: 78,
        status: "AHEAD",
        reasons: ["4h swing low confluence"],
        confirmationRules: ["守住 12.1 后再观察"],
        invalidationRules: ["跌破 11.8"],
        sourceLevelIds: ["enausdt-4h-swing-low"],
      },
    ],
    guardrails: ["Risk Gate and manual confirmation remain required."],
    keyLevels: [
      {
        id: "enausdt-4h-swing-low",
        symbol: "ENAUSDT",
        timeframe: "4h",
        type: "SWING_LOW",
        zoneLow: 11.8,
        zoneHigh: 12.1,
        midPrice: 11.95,
        direction: "SUPPORT",
        keyScore: 78,
        reactionScore: 42,
        confluenceScore: 66,
        status: "POTENTIAL",
        reasons: ["最近 4h 低点"],
        confirmationRules: ["回踩缩量守住"],
        invalidationRule: "跌破 11.8",
      },
    ],
    primaryTimeframe: "4h",
    source: "existing_ohlcv_key_level_mvp",
    sourceTimeframes: ["15m", "1h", "4h"],
    summary: "ENAUSDT v3 key-level map.",
    symbol: "ENAUSDT",
  };
}

function replayFrameWithV3(): ScanReplayFrame {
  return {
    ...replayFrame(),
    signals: replayFrame().signals.map((signal) => ({
      ...signal,
      strategyV3: strategyV3Dossier(),
    })),
  };
}

function rankProfile(): RankProfile {
  return {
    totalXp: 21,
    rawScore: 21,
    tier: { id: "observer", label: "观察席", minXp: 20 },
    nextTier: { id: "discipline", label: "纪律席", minXp: 60 },
    xpToNextTier: 39,
    progressPercent: 3,
    wins: 0,
    losses: 0,
    saved: 1,
    tracking: 2,
    hitRate: 0,
    disciplineScore: 100,
    recentMomentum: 21,
    lastDelta: 3,
    petMood: "calm",
    petLine: "观察席 状态稳定。",
  };
}

function dailyMoverSnapshot(overrides: Partial<DailyMoverSnapshot> = {}): DailyMoverSnapshot {
  return {
    id: "daily-movers-2026-06-14",
    source: "coinglass",
    observedAt: "2026-06-14T00:00:00.000Z",
    gainers: [
      {
        id: "mover-sol-2026-06-14",
        symbol: "SOL",
        exchange: "BINANCE",
        direction: "gainer",
        rank: 1,
        observedAt: "2026-06-14T00:00:00.000Z",
        priceChangePercent: 38.4,
        volume24hUsd: 720_000_000,
        openInterestChangePercent: 31,
        fundingRate: 0.0009,
        liquidationUsd24h: 18_000_000,
      },
    ],
    losers: [],
    reviews: [
      {
        id: "mover-sol-2026-06-14",
        symbol: "SOL",
        direction: "gainer",
        observedAt: "2026-06-14T00:00:00.000Z",
        allowedUse: "research_only",
        guardrail: "每日涨跌幅榜只用于归因复盘、样本库和规则校准，不用于追涨杀跌。",
        attribution: {
          primaryDrivers: ["volume_expansion", "open_interest_expansion"],
          evidenceStrength: "strong",
          learnability: "learnable",
        },
        radarReview: {
          status: "caught",
          matchedSignalIds: ["sig-sol-compression"],
          improvementTags: [],
        },
      },
    ],
    ...overrides,
  };
}

function ohlcvCacheEntry(overrides: Partial<OhlcvCandleCacheEntry> = {}): OhlcvCandleCacheEntry {
  return {
    allowedUse: "research_only",
    cacheKey: `${overrides.symbol ?? "ENAUSDT"}:${overrides.interval ?? "15m"}`,
    canAutoAdjustWeights: false,
    candles: [
      {
        close: 10.4,
        closeTime: "2026-06-15T00:29:59.000Z",
        high: 10.5,
        low: 9.9,
        open: 10,
        openTime: "2026-06-15T00:15:00.000Z",
        volume: 120000,
      },
    ],
    fetchedAt: "2026-06-15T00:31:00.000Z",
    interval: "15m",
    source: "binance-public-futures",
    symbol: "ENAUSDT",
    ...overrides,
  };
}

function scanAssetState(overrides: Partial<ScanAssetState> = {}): ScanAssetState {
  return {
    baseAsset: "TIA",
    consecutiveSkipped: 4,
    deepScanCount1h: 0,
    deepScanCount24h: 2,
    dynamicPriorityScore: 820000,
    lastDeepScannedAt: "2026-06-20T08:00:00.000Z",
    lastLightScannedAt: "2026-06-20T09:00:00.000Z",
    lastSelectedReason: "dynamic_priority",
    lastSkippedReason: "priority_queue_waiting",
    payload: {
      recentDeepScanTimes: [
        "2026-06-20T08:00:00.000Z",
        "2026-06-19T23:30:00.000Z",
      ],
      source: "scan_rotation_state_v1",
    },
    rotationPriorityScore: 940000,
    statePool: "BATTLE_WATCH",
    symbol: "TIAUSDT",
    tier: "active",
    updatedAt: "2026-06-20T09:00:00.000Z",
    wasDisplacedByDynamicPriority: true,
    ...overrides,
  };
}

function macroMarketSnapshot(overrides: Partial<MacroMarketSnapshot> = {}): MacroMarketSnapshot {
  return {
    allowedUse: "macro_context_only",
    btcDominancePercent: 52,
    canCreateTradeSignal: false,
    ethDominancePercent: 10,
    fetchedAt: "2026-06-21T00:00:00.000Z",
    guardrail: "BTC.D/TOTAL2/TOTAL3 只能作为山寨大盘环境锚点，不能直接生成交易方向，不能降低 3:1 最低盈亏比。",
    id: "macro-coingecko-global-20260621000000000",
    source: "coingecko_global",
    total2MarketCapUsd: 1_440_000_000_000,
    total3MarketCapUsd: 1_140_000_000_000,
    totalMarketCapChangePercent24h: 1.8,
    totalMarketCapUsd: 3_000_000_000_000,
    updatedAt: "2026-06-21T00:00:00.000Z",
    ...overrides,
  };
}

test("detectPersistenceMode keeps local preview on memory unless a database URL exists", () => {
  assert.deepEqual(detectPersistenceMode({}), {
    mode: "memory",
    scope: "public-demo",
    reason: "database_url_missing",
  });
  assert.deepEqual(detectPersistenceMode({
    DATABASE_URL: "postgres://example",
    PERSISTENCE_SCOPE: "chuan-public",
  }), {
    mode: "database",
    scope: "chuan-public",
  });
});

test("memory repository stores journal events, derives rank state, and keeps scan archives in newest order", async () => {
  const repository = createMemoryPersistenceRepository({
    initialJournalEvents: [
      journalEvent({
        id: "journal-old",
        createdAt: "2026-06-12T09:00:00.000+08:00",
        result: "saved",
        action: "skip",
        reviewStatus: "closed",
      }),
    ],
  });

  const added = await repository.addJournalEvent(journalEvent({
    id: "journal-new",
    createdAt: "2026-06-12T10:30:00.000+08:00",
  }));
  const entries = await repository.listJournalEvents();
  const profile = await repository.getRankProfile();
  const firstArchive = await repository.addScanArchive(scanSummary(), replayFrame());
  const firstReplay = await repository.getScanReplayFrame("scan-2026-06-12T10-15");
  const secondArchive = await repository.addScanArchive({
    ...scanSummary(),
    id: "scan-2026-06-12T10-30",
    generatedAt: "2026-06-12T10:30:00.000+08:00",
  }, {
    ...replayFrame(),
    id: "scan-2026-06-12T10-30",
    generatedAt: "2026-06-12T10:30:00.000+08:00",
  });
  const archives = await repository.listScanArchives();
  const latestReplay = await repository.getScanReplayFrame();
  const comparison = await repository.compareLatestScanArchives();

  assert.equal(repository.mode, "memory");
  assert.equal(added.id, "journal-new");
  assert.deepEqual(entries.map((entry) => entry.id), ["journal-new", "journal-old"]);
  assert.equal(profile.saved, 1);
  assert.equal(profile.tracking, 1);
  assert.equal(firstArchive.id, "scan-2026-06-12T10-15");
  assert.equal(firstReplay?.id, "scan-2026-06-12T10-15");
  assert.equal(secondArchive.id, "scan-2026-06-12T10-30");
  assert.deepEqual(archives.map((entry) => entry.id), [
    "scan-2026-06-12T10-30",
    "scan-2026-06-12T10-15",
  ]);
  assert.equal(latestReplay?.id, "scan-2026-06-12T10-30");
  assert.deepEqual(comparison, {
    fromId: "scan-2026-06-12T10-15",
    toId: "scan-2026-06-12T10-30",
    scannedDelta: 0,
    anomalyDelta: 0,
    candidateDelta: 0,
    newSignalSymbols: [],
    removedSignalSymbols: [],
    statusChanged: false,
    sourceChanged: false,
  });
});

test("memory repository stores and reads full scan snapshots for frontend no-refresh recovery", async () => {
  const repository = createMemoryPersistenceRepository();
  const snapshot = radarSnapshot();

  await repository.addScanArchive(scanSummary(), replayFrame(), snapshot);

  assert.equal((await repository.getScanSnapshot("scan-2026-06-12T10-15"))?.metadata.id, snapshot.metadata.id);
  assert.equal((await repository.getScanSnapshot())?.instrumentPool.summary.accepted, 24);
});

test("memory repository stores and reads daily mover snapshots newest first", async () => {
  const repository = createMemoryPersistenceRepository();
  const older = dailyMoverSnapshot({
    id: "daily-movers-2026-06-13",
    observedAt: "2026-06-13T00:00:00.000Z",
  });
  const newer = dailyMoverSnapshot({
    id: "daily-movers-2026-06-14",
    observedAt: "2026-06-14T00:00:00.000Z",
  });

  await repository.addDailyMoverSnapshot(older);
  const added = await repository.addDailyMoverSnapshot(newer);
  const snapshots = await repository.listDailyMoverSnapshots();
  const byId = await repository.getDailyMoverSnapshot("daily-movers-2026-06-13");
  const latest = await repository.getDailyMoverSnapshot();

  assert.equal(added.id, "daily-movers-2026-06-14");
  assert.deepEqual(snapshots.map((snapshot) => snapshot.id), [
    "daily-movers-2026-06-14",
    "daily-movers-2026-06-13",
  ]);
  assert.equal(byId?.observedAt, "2026-06-13T00:00:00.000Z");
  assert.equal(latest?.id, "daily-movers-2026-06-14");
  assert.equal(latest?.reviews[0]?.allowedUse, "research_only");
});

test("memory repository stores and reads ohlcv candle cache entries newest first", async () => {
  const repository = createMemoryPersistenceRepository();
  await repository.upsertOhlcvCandleCache(ohlcvCacheEntry({
    fetchedAt: "2026-06-15T00:31:00.000Z",
    interval: "15m",
    symbol: "ENAUSDT",
  }));
  await repository.upsertOhlcvCandleCache(ohlcvCacheEntry({
    cacheKey: "SUIUSDT:1h",
    fetchedAt: "2026-06-15T01:31:00.000Z",
    interval: "1h",
    symbol: "SUIUSDT",
  }));

  const entries = await repository.listOhlcvCandleCaches();
  const ena = await repository.getOhlcvCandleCache("ENAUSDT", "15m");
  const missing = await repository.getOhlcvCandleCache("ENAUSDT", "4h");

  assert.deepEqual(entries.map((entry) => entry.cacheKey), ["SUIUSDT:1h", "ENAUSDT:15m"]);
  assert.equal(ena?.candles[0]?.close, 10.4);
  assert.equal(ena?.allowedUse, "research_only");
  assert.equal(ena?.canAutoAdjustWeights, false);
  assert.equal(missing, null);
});

test("memory repository stores and updates scan asset rotation states newest first", async () => {
  const repository = createMemoryPersistenceRepository();

  await repository.upsertScanAssetStates([
    scanAssetState({
      symbol: "TIAUSDT",
      baseAsset: "TIA",
      updatedAt: "2026-06-20T09:00:00.000Z",
    }),
    scanAssetState({
      baseAsset: "ENA",
      consecutiveSkipped: 7,
      lastDeepScannedAt: null,
      statePool: "COLD",
      symbol: "ENAUSDT",
      tier: "long_tail",
      updatedAt: "2026-06-20T08:30:00.000Z",
      wasDisplacedByDynamicPriority: false,
    }),
  ]);
  await repository.upsertScanAssetStates([
    scanAssetState({
      consecutiveSkipped: 0,
      deepScanCount1h: 1,
      lastDeepScannedAt: "2026-06-20T09:15:00.000Z",
      lastSelectedReason: "tier_rotation",
      symbol: "TIAUSDT",
      updatedAt: "2026-06-20T09:15:00.000Z",
      wasDisplacedByDynamicPriority: false,
    }),
  ]);

  const states = await repository.listScanAssetStates();
  const limited = await repository.listScanAssetStates(1);

  assert.deepEqual(states.map((state) => state.symbol), ["TIAUSDT", "ENAUSDT"]);
  assert.equal(states[0]?.consecutiveSkipped, 0);
  assert.equal(states[0]?.lastSelectedReason, "tier_rotation");
  assert.equal(states[1]?.consecutiveSkipped, 7);
  assert.deepEqual(limited.map((state) => state.symbol), ["TIAUSDT"]);
});

test("memory repository stores and reads macro market snapshots newest first", async () => {
  const repository = createMemoryPersistenceRepository();

  await repository.addMacroMarketSnapshot(macroMarketSnapshot({
    fetchedAt: "2026-06-20T00:00:00.000Z",
    id: "macro-old",
  }));
  await repository.addMacroMarketSnapshot(macroMarketSnapshot());

  const snapshots = await repository.listMacroMarketSnapshots();
  const latest = await repository.getLatestMacroMarketSnapshot();

  assert.deepEqual(snapshots.map((snapshot) => snapshot.id), [
    "macro-coingecko-global-20260621000000000",
    "macro-old",
  ]);
  assert.equal(latest?.allowedUse, "macro_context_only");
  assert.equal(latest?.canCreateTradeSignal, false);
});

test("memory repository extracts v3 forward map snapshots from scan replay frames", async () => {
  const repository = createMemoryPersistenceRepository();
  await repository.addScanArchive(scanSummary(), replayFrame());
  assert.deepEqual(await repository.listV3ForwardMapSnapshots(), []);

  await repository.addScanArchive({
    ...scanSummary(),
    id: "scan-v3-2026-06-17T08-00",
    generatedAt: "2026-06-17T08:00:00.000Z",
  }, {
    ...replayFrameWithV3(),
    id: "scan-v3-2026-06-17T08-00",
    generatedAt: "2026-06-17T08:00:00.000Z",
  });

  const snapshots = await repository.listV3ForwardMapSnapshots();
  const byScan = await repository.getV3ForwardMapSnapshotsForScan("scan-v3-2026-06-17T08-00");

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0]?.symbol, "ENAUSDT");
  assert.equal(snapshots[0]?.allowedUse, "research_only");
  assert.equal(snapshots[0]?.canAutoAdjustWeights, false);
  assert.equal(snapshots[0]?.canMutateLiveRanking, false);
  assert.equal(snapshots[0]?.dossier.forwardLevels[0]?.role, "CURRENT_DEFENSE");
  assert.deepEqual(byScan.map((snapshot) => snapshot.signalId), ["ena-near-trigger"]);
});

test("postgres repository uses parameterized queries and maps durable records back to domain objects", async () => {
  const client = new RecordingSqlClient();
  client.responses.push(
    { rows: [] },
    {
      rows: [
        {
          id: "journal-ena-track",
          scope: "chuan-public",
          symbol: "ENAUSDT",
          result: "watching",
          rank_delta: 0,
          action: "track",
          review_status: "tracking",
          created_at: "2026-06-12T10:15:00.000+08:00",
          payload: journalEvent(),
        },
      ],
    },
    { rows: [] },
    {
      rows: [
        {
          id: "journal-ena-track",
          scope: "chuan-public",
          symbol: "ENAUSDT",
          result: "watching",
          rank_delta: 0,
          action: "track",
          review_status: "tracking",
          created_at: "2026-06-12T10:15:00.000+08:00",
          payload: journalEvent(),
        },
      ],
    },
    {
      rows: [
        {
          scope: "chuan-public",
          tier_id: "observer",
          tier_label: "观察席",
          total_xp: 21,
          raw_score: 21,
          progress_percent: 3,
          updated_at: "2026-06-12T10:20:00.000+08:00",
          payload: rankProfile(),
        },
      ],
    },
    { rows: [] },
    {
      rows: [
        {
          id: "scan-2026-06-12T10-15",
          scope: "chuan-public",
          source: "mock",
          status: "ready",
          generated_at: "2026-06-12T10:15:00.000+08:00",
          scanned_count: 24,
          anomaly_count: 4,
          candidate_count: 4,
          signals_count: 1,
          top_symbols: ["ENAUSDT", "SUIUSDT"],
          payload: {
            summary: scanSummary(),
            replayFrame: replayFrame(),
          },
        },
      ],
    },
    {
      rows: [
        {
          id: "scan-2026-06-12T10-15",
          scope: "chuan-public",
          source: "mock",
          status: "ready",
          generated_at: "2026-06-12T10:15:00.000+08:00",
          scanned_count: 24,
          anomaly_count: 4,
          candidate_count: 4,
          signals_count: 1,
          top_symbols: ["ENAUSDT", "SUIUSDT"],
          payload: {
            summary: scanSummary(),
            replayFrame: replayFrame(),
          },
        },
      ],
    },
    {
      rows: [
        {
          id: "scan-2026-06-12T10-30",
          scope: "chuan-public",
          source: "mock",
          status: "ready",
          generated_at: "2026-06-12T10:30:00.000+08:00",
          scanned_count: 25,
          anomaly_count: 5,
          candidate_count: 4,
          signals_count: 1,
          top_symbols: ["ENAUSDT"],
          payload: {
            summary: {
              ...scanSummary(),
              id: "scan-2026-06-12T10-30",
              generatedAt: "2026-06-12T10:30:00.000+08:00",
              scannedCount: 25,
              anomalyCount: 5,
              topSymbols: ["ENAUSDT"],
            },
            replayFrame: {
              ...replayFrame(),
              id: "scan-2026-06-12T10-30",
              generatedAt: "2026-06-12T10:30:00.000+08:00",
              scannedCount: 25,
              anomalyCount: 5,
            },
          },
        },
        {
          id: "scan-2026-06-12T10-15",
          scope: "chuan-public",
          source: "mock",
          status: "ready",
          generated_at: "2026-06-12T10:15:00.000+08:00",
          scanned_count: 24,
          anomaly_count: 4,
          candidate_count: 4,
          signals_count: 1,
          top_symbols: ["ENAUSDT", "SUIUSDT"],
          payload: {
            summary: scanSummary(),
            replayFrame: replayFrame(),
          },
        },
      ],
    },
  );
  const repository = createPostgresPersistenceRepository({ client, scope: "chuan-public" });

  await repository.addJournalEvent(journalEvent());
  const events = await repository.listJournalEvents();
  const profile = await repository.getRankProfile();
  await repository.addScanArchive(scanSummary(), replayFrame());
  const archives = await repository.listScanArchives(1);
  const replay = await repository.getScanReplayFrame("scan-2026-06-12T10-15");
  const comparison = await repository.compareLatestScanArchives();

  assert.equal(repository.mode, "database");
  assert.equal(events[0]?.symbol, "ENAUSDT");
  assert.equal(profile.tier.label, "观察席");
  assert.equal(archives[0]?.topSymbols[0], "ENAUSDT");
  assert.equal(replay?.signals[0]?.symbol, "ENAUSDT");
  assert.equal(comparison?.scannedDelta, 1);
  assert.equal(comparison?.anomalyDelta, 1);
  assert.match(client.calls[0]?.sql ?? "", /insert into journal_events/i);
  assert.match(client.calls[1]?.sql ?? "", /select \* from journal_events/i);
  assert.match(client.calls[2]?.sql ?? "", /insert into rank_profiles/i);
  assert.match(client.calls[3]?.sql ?? "", /select \* from journal_events/i);
  assert.match(client.calls[5]?.sql ?? "", /insert into scan_archives/i);
  assert.match(client.calls[7]?.sql ?? "", /select \* from scan_archives/i);
  assert.match(client.calls[8]?.sql ?? "", /select \* from scan_archives/i);
  assert.equal(client.calls[0]?.params[0], "journal-ena-track");
  assert.equal(client.calls[0]?.params[1], "chuan-public");
  assert.equal(client.calls[6]?.params[1], 1);
  assert.equal(client.calls[7]?.params[1], "scan-2026-06-12T10-15");
  assert.equal(client.calls[8]?.params[1], 2);
});

test("postgres repository writes and reads daily mover snapshots through durable tables", async () => {
  const client = new RecordingSqlClient();
  const snapshot = dailyMoverSnapshot();
  client.responses.push(
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    {
      rows: [
        {
          id: snapshot.id,
          scope: "chuan-public",
          source: snapshot.source,
          observed_at: snapshot.observedAt,
          gainer_count: 1,
          loser_count: 0,
          payload: snapshot,
        },
      ],
    },
    {
      rows: [
        {
          id: snapshot.id,
          scope: "chuan-public",
          source: snapshot.source,
          observed_at: snapshot.observedAt,
          gainer_count: 1,
          loser_count: 0,
          payload: snapshot,
        },
      ],
    },
  );
  const repository = createPostgresPersistenceRepository({ client, scope: "chuan-public" });

  const added = await repository.addDailyMoverSnapshot(snapshot);
  const snapshots = await repository.listDailyMoverSnapshots(5);
  const byId = await repository.getDailyMoverSnapshot(snapshot.id);

  assert.equal(added.id, snapshot.id);
  assert.equal(snapshots[0]?.reviews[0]?.radarReview.status, "caught");
  assert.equal(byId?.gainers[0]?.symbol, "SOL");
  assert.match(client.calls[0]?.sql ?? "", /insert into daily_mover_snapshots/i);
  assert.match(client.calls[1]?.sql ?? "", /insert into daily_mover_assets/i);
  assert.match(client.calls[2]?.sql ?? "", /insert into mover_attribution_reviews/i);
  assert.match(client.calls[3]?.sql ?? "", /insert into radar_miss_reviews/i);
  assert.match(client.calls[4]?.sql ?? "", /select \* from daily_mover_snapshots/i);
  assert.match(client.calls[5]?.sql ?? "", /select \* from daily_mover_snapshots/i);
  assert.equal(client.calls[0]?.params[0], "daily-movers-2026-06-14");
  assert.equal(client.calls[0]?.params[1], "chuan-public");
  assert.equal(client.calls[1]?.params[3], "SOL");
  assert.deepEqual(client.calls[2]?.params[7], ["volume_expansion", "open_interest_expansion"]);
  assert.deepEqual(client.calls[3]?.params[4], ["sig-sol-compression"]);
  assert.deepEqual(client.calls[4]?.params, ["chuan-public", 5]);
  assert.deepEqual(client.calls[5]?.params, ["chuan-public", snapshot.id]);
});

test("postgres repository upserts and reads scan asset rotation states through durable tables", async () => {
  const client = new RecordingSqlClient();
  const state = scanAssetState();
  client.responses.push(
    { rows: [] },
    {
      rows: [
        {
          scope: "chuan-public",
          symbol: state.symbol,
          base_asset: state.baseAsset,
          tier: state.tier,
          state_pool: state.statePool,
          last_light_scanned_at: state.lastLightScannedAt,
          last_deep_scanned_at: state.lastDeepScannedAt,
          consecutive_skipped: state.consecutiveSkipped,
          deep_scan_count_1h: state.deepScanCount1h,
          deep_scan_count_24h: state.deepScanCount24h,
          dynamic_priority_score: state.dynamicPriorityScore,
          rotation_priority_score: state.rotationPriorityScore,
          was_displaced_by_dynamic_priority: state.wasDisplacedByDynamicPriority,
          last_selected_reason: state.lastSelectedReason,
          last_skipped_reason: state.lastSkippedReason,
          updated_at: state.updatedAt,
          payload: state.payload,
        },
      ],
    },
  );
  const repository = createPostgresPersistenceRepository({ client, scope: "chuan-public" });

  await repository.upsertScanAssetStates([state]);
  const states = await repository.listScanAssetStates(10);

  assert.equal(states[0]?.symbol, "TIAUSDT");
  assert.equal(states[0]?.consecutiveSkipped, 4);
  assert.equal(states[0]?.wasDisplacedByDynamicPriority, true);
  assert.match(client.calls[0]?.sql ?? "", /insert into scan_asset_states/i);
  assert.match(client.calls[0]?.sql ?? "", /on conflict \(scope, symbol\) do update/i);
  assert.match(client.calls[1]?.sql ?? "", /select \* from scan_asset_states/i);
  assert.deepEqual(client.calls[0]?.params.slice(0, 4), [
    "chuan-public",
    "TIAUSDT",
    "TIA",
    "active",
  ]);
  assert.equal(client.calls[1]?.params[1], 10);
});

test("postgres repository writes and reads ohlcv candle cache entries through durable tables", async () => {
  const client = new RecordingSqlClient();
  const entry = ohlcvCacheEntry();
  client.responses.push(
    { rows: [] },
    {
      rows: [
        {
          cache_key: entry.cacheKey,
          candle_count: 1,
          first_open_time: "2026-06-15T00:15:00.000Z",
          fetched_at: entry.fetchedAt,
          interval: entry.interval,
          last_close_time: "2026-06-15T00:29:59.000Z",
          payload: entry,
          scope: "chuan-public",
          source: entry.source,
          symbol: entry.symbol,
        },
      ],
    },
    {
      rows: [
        {
          cache_key: entry.cacheKey,
          candle_count: 1,
          first_open_time: "2026-06-15T00:15:00.000Z",
          fetched_at: entry.fetchedAt,
          interval: entry.interval,
          last_close_time: "2026-06-15T00:29:59.000Z",
          payload: entry,
          scope: "chuan-public",
          source: entry.source,
          symbol: entry.symbol,
        },
      ],
    },
  );
  const repository = createPostgresPersistenceRepository({ client, scope: "chuan-public" });

  const stored = await repository.upsertOhlcvCandleCache(entry);
  const entries = await repository.listOhlcvCandleCaches(5);
  const byKey = await repository.getOhlcvCandleCache("ENAUSDT", "15m");

  assert.equal(stored.cacheKey, "ENAUSDT:15m");
  assert.equal(entries[0]?.symbol, "ENAUSDT");
  assert.equal(byKey?.interval, "15m");
  assert.match(client.calls[0]?.sql ?? "", /insert into ohlcv_candle_cache/i);
  assert.match(client.calls[1]?.sql ?? "", /select \* from ohlcv_candle_cache/i);
  assert.match(client.calls[2]?.sql ?? "", /select \* from ohlcv_candle_cache/i);
  assert.deepEqual(client.calls[0]?.params.slice(0, 4), [
    "chuan-public",
    "ENAUSDT",
    "15m",
    "ENAUSDT:15m",
  ]);
  assert.deepEqual(client.calls[1]?.params, ["chuan-public", 5]);
  assert.deepEqual(client.calls[2]?.params, ["chuan-public", "ENAUSDT", "15m"]);
});

test("postgres repository writes and reads macro market snapshots through durable tables", async () => {
  const client = new RecordingSqlClient();
  const snapshot = macroMarketSnapshot();
  client.responses.push(
    { rows: [] },
    {
      rows: [
        {
          allowed_use: snapshot.allowedUse,
          btc_dominance_percent: snapshot.btcDominancePercent,
          can_create_trade_signal: snapshot.canCreateTradeSignal,
          eth_dominance_percent: snapshot.ethDominancePercent,
          fetched_at: snapshot.fetchedAt,
          id: snapshot.id,
          payload: snapshot,
          scope: "chuan-public",
          source: snapshot.source,
          total2_market_cap_usd: snapshot.total2MarketCapUsd,
          total3_market_cap_usd: snapshot.total3MarketCapUsd,
          total_market_cap_change_percent_24h: snapshot.totalMarketCapChangePercent24h,
          total_market_cap_usd: snapshot.totalMarketCapUsd,
          updated_at: snapshot.updatedAt,
        },
      ],
    },
    {
      rows: [
        {
          allowed_use: snapshot.allowedUse,
          btc_dominance_percent: snapshot.btcDominancePercent,
          can_create_trade_signal: snapshot.canCreateTradeSignal,
          eth_dominance_percent: snapshot.ethDominancePercent,
          fetched_at: snapshot.fetchedAt,
          id: snapshot.id,
          payload: snapshot,
          scope: "chuan-public",
          source: snapshot.source,
          total2_market_cap_usd: snapshot.total2MarketCapUsd,
          total3_market_cap_usd: snapshot.total3MarketCapUsd,
          total_market_cap_change_percent_24h: snapshot.totalMarketCapChangePercent24h,
          total_market_cap_usd: snapshot.totalMarketCapUsd,
          updated_at: snapshot.updatedAt,
        },
      ],
    },
  );
  const repository = createPostgresPersistenceRepository({ client, scope: "chuan-public" });

  const added = await repository.addMacroMarketSnapshot(snapshot);
  const snapshots = await repository.listMacroMarketSnapshots(5);
  const latest = await repository.getLatestMacroMarketSnapshot();

  assert.equal(added.id, snapshot.id);
  assert.equal(snapshots[0]?.btcDominancePercent, 52);
  assert.equal(latest?.total3MarketCapUsd, 1_140_000_000_000);
  assert.match(client.calls[0]?.sql ?? "", /insert into macro_market_snapshots/i);
  assert.match(client.calls[1]?.sql ?? "", /select \* from macro_market_snapshots/i);
  assert.match(client.calls[2]?.sql ?? "", /select \* from macro_market_snapshots/i);
  assert.deepEqual(client.calls[1]?.params, ["chuan-public", 5]);
  assert.deepEqual(client.calls[2]?.params, ["chuan-public", 1]);
});

test("postgres repository writes and reads v3 forward map snapshots through durable tables", async () => {
  const client = new RecordingSqlClient();
  const snapshot = {
    allowedUse: "research_only" as const,
    canAutoAdjustWeights: false as const,
    canMutateLiveRanking: false as const,
    dossier: strategyV3Dossier(),
    generatedAt: "2026-06-17T08:00:00.000Z",
    scanId: "scan-v3-2026-06-17T08-00",
    signalId: "ena-near-trigger",
    symbol: "ENAUSDT",
  };
  const row = {
    allowed_use: snapshot.allowedUse,
    can_auto_adjust_weights: snapshot.canAutoAdjustWeights,
    can_mutate_live_ranking: snapshot.canMutateLiveRanking,
    forward_level_count: 1,
    generated_at: snapshot.generatedAt,
    key_level_count: 1,
    payload: snapshot,
    scan_id: snapshot.scanId,
    scope: "chuan-public",
    signal_id: snapshot.signalId,
    source_timeframes: ["15m", "1h", "4h"],
    symbol: snapshot.symbol,
  };
  client.responses.push(
    { rows: [] },
    { rows: [] },
    { rows: [row] },
    { rows: [row] },
  );
  const repository = createPostgresPersistenceRepository({ client, scope: "chuan-public" });

  await repository.addScanArchive({
    ...scanSummary(),
    id: "scan-v3-2026-06-17T08-00",
    generatedAt: "2026-06-17T08:00:00.000Z",
  }, {
    ...replayFrameWithV3(),
    id: "scan-v3-2026-06-17T08-00",
    generatedAt: "2026-06-17T08:00:00.000Z",
  });
  const snapshots = await repository.listV3ForwardMapSnapshots(5);
  const byScan = await repository.getV3ForwardMapSnapshotsForScan("scan-v3-2026-06-17T08-00");

  assert.equal(snapshots[0]?.symbol, "ENAUSDT");
  assert.equal(snapshots[0]?.canMutateLiveRanking, false);
  assert.equal(byScan[0]?.dossier.keyLevels[0]?.id, "enausdt-4h-swing-low");
  assert.match(client.calls[0]?.sql ?? "", /insert into scan_archives/i);
  assert.match(client.calls[1]?.sql ?? "", /insert into v3_forward_map_snapshots/i);
  assert.match(client.calls[2]?.sql ?? "", /select \* from v3_forward_map_snapshots/i);
  assert.match(client.calls[3]?.sql ?? "", /select \* from v3_forward_map_snapshots/i);
  assert.deepEqual(client.calls[1]?.params.slice(0, 4), [
    "chuan-public",
    "scan-v3-2026-06-17T08-00",
    "ena-near-trigger",
    "ENAUSDT",
  ]);
  assert.deepEqual(client.calls[2]?.params, ["chuan-public", 5]);
  assert.deepEqual(client.calls[3]?.params, ["chuan-public", "scan-v3-2026-06-17T08-00"]);
});

test("repository factory falls back to memory when database mode is configured without a client", () => {
  const repository = createPersistenceRepository({
    env: { DATABASE_URL: "postgres://example", PERSISTENCE_SCOPE: "chuan-public" },
    initialJournalEvents: [journalEvent()],
  });

  assert.equal(repository.mode, "memory");
  assert.equal(repository.scope, "chuan-public");
});
