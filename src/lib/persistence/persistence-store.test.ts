import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent } from "@/lib/analysis/types";
import type { RankProfile } from "@/lib/journal/rank-engine";
import type { DailyMoverSnapshot } from "@/lib/market/daily-movers";
import type { ScanArchiveSummary, ScanReplayFrame } from "@/lib/market/types";
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

test("repository factory falls back to memory when database mode is configured without a client", () => {
  const repository = createPersistenceRepository({
    env: { DATABASE_URL: "postgres://example", PERSISTENCE_SCOPE: "chuan-public" },
    initialJournalEvents: [journalEvent()],
  });

  assert.equal(repository.mode, "memory");
  assert.equal(repository.scope, "chuan-public");
});
