import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent } from "@/lib/analysis/types";
import type { RankProfile } from "@/lib/journal/rank-engine";
import type { ScanArchiveSummary, ScanReplayFrame } from "@/lib/market/types";
import {
  buildPersistenceSchemaSql,
  journalEventRecordToEvent,
  journalEventToRecord,
  persistenceTables,
  rankProfileRecordToProfile,
  rankProfileToRecord,
  scanArchiveRecordToSummary,
  scanArchiveToRecord,
} from "./persistence-contract";

const scope = "public-demo";

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

test("journal events round-trip through a database-ready record", () => {
  const event = journalEvent();
  const record = journalEventToRecord(event, scope);

  assert.equal(record.id, "journal-ena-track");
  assert.equal(record.scope, scope);
  assert.equal(record.symbol, "ENAUSDT");
  assert.equal(record.result, "watching");
  assert.equal(record.rank_delta, 0);
  assert.equal(record.payload.lessons?.[0], "等待确认");
  assert.deepEqual(journalEventRecordToEvent(record), event);
});

test("scan archives store queryable summary columns plus replay payload", () => {
  const summary = scanSummary();
  const frame = replayFrame();
  const record = scanArchiveToRecord(summary, frame, scope);

  assert.equal(record.id, summary.id);
  assert.equal(record.scope, scope);
  assert.equal(record.source, "mock");
  assert.equal(record.status, "ready");
  assert.equal(record.generated_at, summary.generatedAt);
  assert.equal(record.signals_count, 1);
  assert.deepEqual(record.top_symbols, ["ENAUSDT", "SUIUSDT"]);
  assert.equal(record.payload.replayFrame.signals[0]?.symbol, "ENAUSDT");
  assert.deepEqual(scanArchiveRecordToSummary(record), summary);
});

test("rank profiles store the current derived state for fast reads", () => {
  const profile = rankProfile();
  const record = rankProfileToRecord(profile, scope, "2026-06-12T10:20:00.000+08:00");

  assert.equal(record.scope, scope);
  assert.equal(record.tier_id, "observer");
  assert.equal(record.tier_label, "观察席");
  assert.equal(record.total_xp, 21);
  assert.equal(record.progress_percent, 3);
  assert.equal(record.updated_at, "2026-06-12T10:20:00.000+08:00");
  assert.deepEqual(rankProfileRecordToProfile(record), profile);
});

test("buildPersistenceSchemaSql defines the durable Postgres tables without provider lock-in", () => {
  const sql = buildPersistenceSchemaSql();

  assert.deepEqual(persistenceTables, ["journal_events", "scan_archives", "rank_profiles"]);
  assert.match(sql, /create table if not exists journal_events/i);
  assert.match(sql, /create table if not exists scan_archives/i);
  assert.match(sql, /create table if not exists rank_profiles/i);
  assert.match(sql, /payload jsonb not null/i);
  assert.match(sql, /primary key \(scope, id\)/i);
  assert.match(sql, /primary key \(scope\)/i);
  assert.doesNotMatch(sql, /supabase/i);
  assert.doesNotMatch(sql, /neon/i);
});
