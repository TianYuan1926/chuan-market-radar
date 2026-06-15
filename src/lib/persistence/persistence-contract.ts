import type { JournalEvent } from "@/lib/analysis/types";
import type { RankProfile } from "@/lib/journal/rank-engine";
import type {
  DailyMover,
  DailyMoverReview,
  DailyMoverSnapshot,
  MoverAttribution,
  RadarMoverReview,
} from "@/lib/market/daily-movers";
import type { OhlcvCandleCacheEntry } from "@/lib/market/ohlcv/types";
import type {
  MarketDataSource,
  MarketDataStatus,
  ScanArchiveSummary,
  ScanReplayFrame,
} from "@/lib/market/types";

export type PersistenceScope = string;

export type PersistedJournalEventRecord = {
  id: string;
  scope: PersistenceScope;
  symbol: string;
  result: JournalEvent["result"];
  rank_delta: number;
  action: JournalEvent["action"] | null;
  review_status: JournalEvent["reviewStatus"] | null;
  outcome_status: JournalEvent["outcomeStatus"] | null;
  created_at: string;
  payload: JournalEvent;
};

export type PersistedScanArchiveRecord = {
  id: string;
  scope: PersistenceScope;
  source: MarketDataSource;
  status: MarketDataStatus;
  generated_at: string;
  scanned_count: number;
  anomaly_count: number;
  candidate_count: number;
  signals_count: number;
  top_symbols: string[];
  payload: {
    summary: ScanArchiveSummary;
    replayFrame: ScanReplayFrame;
  };
};

export type PersistedRankProfileRecord = {
  scope: PersistenceScope;
  tier_id: string;
  tier_label: string;
  total_xp: number;
  raw_score: number;
  progress_percent: number;
  updated_at: string;
  payload: RankProfile;
};

export type PersistedDailyMoverSnapshotRecord = {
  id: string;
  scope: PersistenceScope;
  source: MarketDataSource;
  observed_at: string;
  gainer_count: number;
  loser_count: number;
  payload: DailyMoverSnapshot;
};

export type PersistedDailyMoverAssetRecord = {
  scope: PersistenceScope;
  snapshot_id: string;
  mover_id: string;
  symbol: string;
  exchange: DailyMover["exchange"];
  direction: DailyMover["direction"];
  rank: number;
  observed_at: string;
  price_change_percent: number;
  volume_24h_usd: number;
  payload: DailyMover;
};

export type PersistedMoverAttributionReviewRecord = {
  scope: PersistenceScope;
  mover_id: string;
  symbol: string;
  direction: DailyMoverReview["direction"];
  observed_at: string;
  evidence_strength: MoverAttribution["evidenceStrength"];
  learnability: MoverAttribution["learnability"];
  primary_drivers: MoverAttribution["primaryDrivers"];
  payload: DailyMoverReview;
};

export type PersistedRadarMissReviewRecord = {
  scope: PersistenceScope;
  mover_id: string;
  symbol: string;
  status: RadarMoverReview["status"];
  matched_signal_ids: string[];
  improvement_tags: string[];
  payload: DailyMoverReview;
};

export type PersistedOhlcvCandleCacheRecord = {
  scope: PersistenceScope;
  symbol: string;
  interval: string;
  cache_key: string;
  source: string;
  fetched_at: string;
  candle_count: number;
  first_open_time: string;
  last_close_time: string;
  payload: OhlcvCandleCacheEntry;
};

export type PersistedDailyMoverSnapshotRecords = {
  snapshot: PersistedDailyMoverSnapshotRecord;
  assets: PersistedDailyMoverAssetRecord[];
  attributionReviews: PersistedMoverAttributionReviewRecord[];
  radarReviews: PersistedRadarMissReviewRecord[];
};

export const persistenceTables = [
  "journal_events",
  "scan_archives",
  "rank_profiles",
  "daily_mover_snapshots",
  "daily_mover_assets",
  "mover_attribution_reviews",
  "radar_miss_reviews",
  "ohlcv_candle_cache",
] as const;

export function journalEventToRecord(
  event: JournalEvent,
  scope: PersistenceScope,
): PersistedJournalEventRecord {
  return {
    id: event.id,
    scope,
    symbol: event.symbol,
    result: event.result,
    rank_delta: event.rankDelta,
    action: event.action ?? null,
    review_status: event.reviewStatus ?? null,
    outcome_status: event.outcomeStatus ?? null,
    created_at: event.createdAt,
    payload: event,
  };
}

export function journalEventRecordToEvent(record: PersistedJournalEventRecord): JournalEvent {
  return {
    ...record.payload,
    id: record.id,
    symbol: record.symbol,
    result: record.result,
    rankDelta: record.rank_delta,
    createdAt: record.created_at,
    outcomeStatus: record.payload.outcomeStatus ?? record.outcome_status ?? undefined,
  };
}

export function scanArchiveToRecord(
  summary: ScanArchiveSummary,
  replayFrame: ScanReplayFrame,
  scope: PersistenceScope,
): PersistedScanArchiveRecord {
  return {
    id: summary.id,
    scope,
    source: summary.source,
    status: summary.status,
    generated_at: summary.generatedAt,
    scanned_count: summary.scannedCount,
    anomaly_count: summary.anomalyCount,
    candidate_count: summary.candidateCount,
    signals_count: replayFrame.signals.length,
    top_symbols: summary.topSymbols,
    payload: {
      summary,
      replayFrame,
    },
  };
}

export function scanArchiveRecordToSummary(
  record: PersistedScanArchiveRecord,
): ScanArchiveSummary {
  return {
    ...record.payload.summary,
    id: record.id,
    source: record.source,
    status: record.status,
    generatedAt: record.generated_at,
    scannedCount: record.scanned_count,
    anomalyCount: record.anomaly_count,
    candidateCount: record.candidate_count,
    topSymbols: record.top_symbols,
  };
}

export function rankProfileToRecord(
  profile: RankProfile,
  scope: PersistenceScope,
  updatedAt: string,
): PersistedRankProfileRecord {
  return {
    scope,
    tier_id: profile.tier.id,
    tier_label: profile.tier.label,
    total_xp: profile.totalXp,
    raw_score: profile.rawScore,
    progress_percent: profile.progressPercent,
    updated_at: updatedAt,
    payload: profile,
  };
}

export function rankProfileRecordToProfile(
  record: PersistedRankProfileRecord,
): RankProfile {
  return {
    ...record.payload,
    totalXp: record.total_xp,
    rawScore: record.raw_score,
    progressPercent: record.progress_percent,
    tier: {
      ...record.payload.tier,
      id: record.tier_id,
      label: record.tier_label,
    },
  };
}

export function dailyMoverSnapshotToRecords(
  snapshot: DailyMoverSnapshot,
  scope: PersistenceScope,
): PersistedDailyMoverSnapshotRecords {
  const movers = [...snapshot.gainers, ...snapshot.losers];

  return {
    snapshot: {
      id: snapshot.id,
      scope,
      source: snapshot.source,
      observed_at: snapshot.observedAt,
      gainer_count: snapshot.gainers.length,
      loser_count: snapshot.losers.length,
      payload: snapshot,
    },
    assets: movers.map((mover) => ({
      scope,
      snapshot_id: snapshot.id,
      mover_id: mover.id,
      symbol: mover.symbol,
      exchange: mover.exchange,
      direction: mover.direction,
      rank: mover.rank,
      observed_at: mover.observedAt,
      price_change_percent: mover.priceChangePercent,
      volume_24h_usd: mover.volume24hUsd,
      payload: mover,
    })),
    attributionReviews: snapshot.reviews.map((review) => ({
      scope,
      mover_id: review.id,
      symbol: review.symbol,
      direction: review.direction,
      observed_at: review.observedAt,
      evidence_strength: review.attribution.evidenceStrength,
      learnability: review.attribution.learnability,
      primary_drivers: review.attribution.primaryDrivers,
      payload: review,
    })),
    radarReviews: snapshot.reviews.map((review) => ({
      scope,
      mover_id: review.id,
      symbol: review.symbol,
      status: review.radarReview.status,
      matched_signal_ids: review.radarReview.matchedSignalIds,
      improvement_tags: review.radarReview.improvementTags,
      payload: review,
    })),
  };
}

export function ohlcvCandleCacheEntryToRecord(
  entry: OhlcvCandleCacheEntry,
  scope: PersistenceScope,
): PersistedOhlcvCandleCacheRecord {
  const first = entry.candles[0];
  const last = entry.candles.at(-1);

  return {
    scope,
    symbol: entry.symbol,
    interval: entry.interval,
    cache_key: entry.cacheKey,
    source: entry.source,
    fetched_at: entry.fetchedAt,
    candle_count: entry.candles.length,
    first_open_time: first?.openTime ?? entry.fetchedAt,
    last_close_time: last?.closeTime ?? entry.fetchedAt,
    payload: entry,
  };
}

export function ohlcvCandleCacheEntryRecordToEntry(
  record: PersistedOhlcvCandleCacheRecord,
): OhlcvCandleCacheEntry {
  return {
    ...record.payload,
    cacheKey: record.cache_key,
    fetchedAt: record.fetched_at,
    interval: record.interval as OhlcvCandleCacheEntry["interval"],
    source: record.source,
    symbol: record.symbol,
  };
}

export function buildPersistenceSchemaSql() {
  return `
create table if not exists journal_events (
  scope text not null,
  id text not null,
  symbol text not null,
  result text not null,
  rank_delta integer not null default 0,
  action text,
  review_status text,
  outcome_status text,
  created_at timestamptz not null,
  payload jsonb not null,
  primary key (scope, id)
);

create index if not exists journal_events_scope_created_at_idx
  on journal_events (scope, created_at desc);

create index if not exists journal_events_scope_symbol_idx
  on journal_events (scope, symbol);

create index if not exists journal_events_scope_outcome_status_idx
  on journal_events (scope, outcome_status);

create table if not exists scan_archives (
  scope text not null,
  id text not null,
  source text not null,
  status text not null,
  generated_at timestamptz not null,
  scanned_count integer not null default 0,
  anomaly_count integer not null default 0,
  candidate_count integer not null default 0,
  signals_count integer not null default 0,
  top_symbols text[] not null default '{}',
  payload jsonb not null,
  primary key (scope, id)
);

create index if not exists scan_archives_scope_generated_at_idx
  on scan_archives (scope, generated_at desc);

create table if not exists rank_profiles (
  scope text not null,
  tier_id text not null,
  tier_label text not null,
  total_xp integer not null default 0,
  raw_score integer not null default 0,
  progress_percent integer not null default 0,
  updated_at timestamptz not null,
  payload jsonb not null,
  primary key (scope)
);

create table if not exists daily_mover_snapshots (
  scope text not null,
  id text not null,
  source text not null,
  observed_at timestamptz not null,
  gainer_count integer not null default 0,
  loser_count integer not null default 0,
  payload jsonb not null,
  primary key (scope, id)
);

create index if not exists daily_mover_snapshots_scope_observed_at_idx
  on daily_mover_snapshots (scope, observed_at desc);

create table if not exists daily_mover_assets (
  scope text not null,
  snapshot_id text not null,
  mover_id text not null,
  symbol text not null,
  exchange text not null,
  direction text not null,
  rank integer not null,
  observed_at timestamptz not null,
  price_change_percent numeric not null,
  volume_24h_usd numeric not null,
  payload jsonb not null,
  primary key (scope, snapshot_id, mover_id)
);

create index if not exists daily_mover_assets_scope_snapshot_rank_idx
  on daily_mover_assets (scope, snapshot_id, direction, rank);

create index if not exists daily_mover_assets_scope_symbol_observed_idx
  on daily_mover_assets (scope, symbol, observed_at desc);

create table if not exists mover_attribution_reviews (
  scope text not null,
  mover_id text not null,
  symbol text not null,
  direction text not null,
  observed_at timestamptz not null,
  evidence_strength text not null,
  learnability text not null,
  primary_drivers text[] not null default '{}',
  payload jsonb not null,
  primary key (scope, mover_id)
);

create index if not exists mover_attribution_reviews_scope_learnability_idx
  on mover_attribution_reviews (scope, learnability, observed_at desc);

create table if not exists radar_miss_reviews (
  scope text not null,
  mover_id text not null,
  symbol text not null,
  status text not null,
  matched_signal_ids text[] not null default '{}',
  improvement_tags text[] not null default '{}',
  payload jsonb not null,
  primary key (scope, mover_id)
);

create index if not exists radar_miss_reviews_scope_status_idx
  on radar_miss_reviews (scope, status);

create table if not exists ohlcv_candle_cache (
  scope text not null,
  symbol text not null,
  interval text not null,
  cache_key text not null,
  source text not null,
  fetched_at timestamptz not null,
  candle_count integer not null default 0,
  first_open_time timestamptz not null,
  last_close_time timestamptz not null,
  payload jsonb not null,
  primary key (scope, symbol, interval)
);

create index if not exists ohlcv_candle_cache_scope_fetched_at_idx
  on ohlcv_candle_cache (scope, fetched_at desc);

create index if not exists ohlcv_candle_cache_scope_symbol_idx
  on ohlcv_candle_cache (scope, symbol, interval);
`.trim();
}
