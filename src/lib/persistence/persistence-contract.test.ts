import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent } from "@/lib/analysis/types";
import type { StrategyV3Dossier } from "@/lib/analysis/v3/types";
import type { RankProfile } from "@/lib/journal/rank-engine";
import type { DailyMoverSnapshot } from "@/lib/market/daily-movers";
import type { OhlcvCandleCacheEntry } from "@/lib/market/ohlcv/types";
import type { ScanArchiveSummary, ScanReplayFrame } from "@/lib/market/types";
import {
  buildPersistenceSchemaSql,
  dailyMoverSnapshotToRecords,
  journalEventRecordToEvent,
  journalEventToRecord,
  ohlcvCandleCacheEntryRecordToEntry,
  ohlcvCandleCacheEntryToRecord,
  persistenceTables,
  rankProfileRecordToProfile,
  rankProfileToRecord,
  scanArchiveRecordToSummary,
  scanArchiveToRecord,
  v3ForwardMapRecordToSnapshot,
  v3ForwardMapSnapshotToRecord,
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
    outcomeStatus: "expired",
    triggerHit: false,
    invalidationHit: false,
    firstTargetHit: false,
    reviewCheckpoints: [
      {
        id: "1h",
        label: "1h 误报检查",
        reviewAt: "2026-06-12T11:15:00.000+08:00",
        status: "complete",
      },
    ],
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

function dailyMoverSnapshot(): DailyMoverSnapshot {
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
  };
}

function ohlcvCacheEntry(): OhlcvCandleCacheEntry {
  return {
    allowedUse: "research_only",
    cacheKey: "ENAUSDT:15m",
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
  assert.equal(record.outcome_status, "expired");
  assert.equal(record.payload.lessons?.[0], "等待确认");
  assert.equal(record.payload.reviewCheckpoints?.[0]?.id, "1h");
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

test("daily mover snapshots split queryable columns from attribution payloads", () => {
  const records = dailyMoverSnapshotToRecords(dailyMoverSnapshot(), scope);

  assert.equal(records.snapshot.id, "daily-movers-2026-06-14");
  assert.equal(records.snapshot.scope, scope);
  assert.equal(records.snapshot.source, "coinglass");
  assert.equal(records.snapshot.gainer_count, 1);
  assert.equal(records.snapshot.loser_count, 0);
  assert.equal(records.assets[0]?.symbol, "SOL");
  assert.equal(records.assets[0]?.direction, "gainer");
  assert.equal(records.assets[0]?.price_change_percent, 38.4);
  assert.equal(records.assets[0]?.volume_24h_usd, 720_000_000);
  assert.deepEqual(records.attributionReviews[0]?.primary_drivers, [
    "volume_expansion",
    "open_interest_expansion",
  ]);
  assert.equal(records.attributionReviews[0]?.learnability, "learnable");
  assert.equal(records.radarReviews[0]?.status, "caught");
  assert.deepEqual(records.radarReviews[0]?.matched_signal_ids, ["sig-sol-compression"]);
  assert.equal(records.radarReviews[0]?.payload.allowedUse, "research_only");
});

test("ohlcv candle cache entries round-trip through a database-ready record", () => {
  const entry = ohlcvCacheEntry();
  const record = ohlcvCandleCacheEntryToRecord(entry, scope);

  assert.equal(record.scope, scope);
  assert.equal(record.symbol, "ENAUSDT");
  assert.equal(record.interval, "15m");
  assert.equal(record.source, "binance-public-futures");
  assert.equal(record.cache_key, "ENAUSDT:15m");
  assert.equal(record.candle_count, 1);
  assert.equal(record.first_open_time, "2026-06-15T00:15:00.000Z");
  assert.equal(record.last_close_time, "2026-06-15T00:29:59.000Z");
  assert.equal(record.payload.allowedUse, "research_only");
  assert.equal(record.payload.canAutoAdjustWeights, false);
  assert.deepEqual(ohlcvCandleCacheEntryRecordToEntry(record), entry);
});

test("v3 forward map snapshots store queryable review metadata plus readonly payload", () => {
  const snapshot = {
    allowedUse: "research_only" as const,
    canAutoAdjustWeights: false as const,
    canMutateLiveRanking: false as const,
    dossier: strategyV3Dossier(),
    generatedAt: "2026-06-17T08:00:00.000Z",
    scanId: "scan-v3-2026-06-17T08-00",
    signalId: "coinglass-BINANCE-ENAUSDT",
    symbol: "ENAUSDT",
  };
  const record = v3ForwardMapSnapshotToRecord(snapshot, scope);

  assert.equal(record.scope, scope);
  assert.equal(record.scan_id, "scan-v3-2026-06-17T08-00");
  assert.equal(record.signal_id, "coinglass-BINANCE-ENAUSDT");
  assert.equal(record.symbol, "ENAUSDT");
  assert.equal(record.generated_at, "2026-06-17T08:00:00.000Z");
  assert.equal(record.key_level_count, 1);
  assert.equal(record.forward_level_count, 1);
  assert.deepEqual(record.source_timeframes, ["15m", "1h", "4h"]);
  assert.equal(record.allowed_use, "research_only");
  assert.equal(record.can_auto_adjust_weights, false);
  assert.equal(record.can_mutate_live_ranking, false);
  assert.equal(record.payload.dossier.canMutateLiveRanking, false);
  assert.deepEqual(v3ForwardMapRecordToSnapshot(record), snapshot);
});

test("buildPersistenceSchemaSql defines the durable Postgres tables without provider lock-in", () => {
  const sql = buildPersistenceSchemaSql();

  assert.deepEqual(persistenceTables, [
    "journal_events",
    "scan_archives",
    "v3_forward_map_snapshots",
    "rank_profiles",
    "daily_mover_snapshots",
    "daily_mover_assets",
    "mover_attribution_reviews",
    "radar_miss_reviews",
    "ohlcv_candle_cache",
  ]);
  assert.match(sql, /create table if not exists journal_events/i);
  assert.match(sql, /outcome_status text/i);
  assert.match(sql, /journal_events_scope_outcome_status_idx/i);
  assert.match(sql, /create table if not exists scan_archives/i);
  assert.match(sql, /create table if not exists v3_forward_map_snapshots/i);
  assert.match(sql, /v3_forward_map_snapshots_scope_symbol_generated_idx/i);
  assert.match(sql, /can_mutate_live_ranking boolean not null/i);
  assert.match(sql, /create table if not exists rank_profiles/i);
  assert.match(sql, /create table if not exists daily_mover_snapshots/i);
  assert.match(sql, /create table if not exists daily_mover_assets/i);
  assert.match(sql, /create table if not exists mover_attribution_reviews/i);
  assert.match(sql, /create table if not exists radar_miss_reviews/i);
  assert.match(sql, /create table if not exists ohlcv_candle_cache/i);
  assert.match(sql, /daily_mover_assets_scope_snapshot_rank_idx/i);
  assert.match(sql, /mover_attribution_reviews_scope_learnability_idx/i);
  assert.match(sql, /radar_miss_reviews_scope_status_idx/i);
  assert.match(sql, /ohlcv_candle_cache_scope_fetched_at_idx/i);
  assert.match(sql, /payload jsonb not null/i);
  assert.match(sql, /primary key \(scope, id\)/i);
  assert.match(sql, /primary key \(scope\)/i);
  assert.doesNotMatch(sql, /supabase/i);
  assert.doesNotMatch(sql, /neon/i);
});
