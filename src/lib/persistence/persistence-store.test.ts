import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent } from "@/lib/analysis/types";
import type { RankProfile } from "@/lib/journal/rank-engine";
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

test("repository factory falls back to memory when database mode is configured without a client", () => {
  const repository = createPersistenceRepository({
    env: { DATABASE_URL: "postgres://example", PERSISTENCE_SCOPE: "chuan-public" },
    initialJournalEvents: [journalEvent()],
  });

  assert.equal(repository.mode, "memory");
  assert.equal(repository.scope, "chuan-public");
});
