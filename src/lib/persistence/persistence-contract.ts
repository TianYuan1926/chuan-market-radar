import type { JournalEvent } from "@/lib/analysis/types";
import type { RankProfile } from "@/lib/journal/rank-engine";
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

export const persistenceTables = [
  "journal_events",
  "scan_archives",
  "rank_profiles",
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
  created_at timestamptz not null,
  payload jsonb not null,
  primary key (scope, id)
);

create index if not exists journal_events_scope_created_at_idx
  on journal_events (scope, created_at desc);

create index if not exists journal_events_scope_symbol_idx
  on journal_events (scope, symbol);

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
`.trim();
}
