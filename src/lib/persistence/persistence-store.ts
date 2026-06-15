import type { JournalEvent } from "../analysis/types";
import { createJournalStore } from "../journal/journal-store";
import { buildRankProfile, type RankProfile } from "../journal/rank-engine";
import type { DailyMoverSnapshot } from "../market/daily-movers";
import type { OhlcvCandleCacheEntry, OhlcvInterval } from "../market/ohlcv/types";
import { compareScanReplayFrames } from "../market/scan-archive";
import type { ScanArchiveSummary, ScanComparison, ScanReplayFrame } from "../market/types";
import {
  dailyMoverSnapshotToRecords,
  journalEventRecordToEvent,
  journalEventToRecord,
  ohlcvCandleCacheEntryRecordToEntry,
  ohlcvCandleCacheEntryToRecord,
  type PersistedOhlcvCandleCacheRecord,
  rankProfileRecordToProfile,
  rankProfileToRecord,
  scanArchiveRecordToSummary,
  scanArchiveToRecord,
  type PersistedDailyMoverSnapshotRecord,
  type PersistedJournalEventRecord,
  type PersistedRankProfileRecord,
  type PersistedScanArchiveRecord,
  type PersistenceScope,
} from "./persistence-contract";

export type PersistenceMode = "memory" | "database";

export type PersistenceModeDecision = {
  mode: PersistenceMode;
  scope: PersistenceScope;
  reason?: "database_url_missing";
};

export type PersistenceEnv = Record<string, string | undefined>;

export type SqlClient = {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

export type PersistenceRepository = {
  mode: PersistenceMode;
  scope: PersistenceScope;
  listJournalEvents: (limit?: number) => Promise<JournalEvent[]>;
  addJournalEvent: (entry: JournalEvent) => Promise<JournalEvent>;
  getRankProfile: () => Promise<RankProfile>;
  upsertRankProfile: (profile: RankProfile, updatedAt?: string) => Promise<RankProfile>;
  addScanArchive: (
    summary: ScanArchiveSummary,
    replayFrame: ScanReplayFrame,
  ) => Promise<ScanArchiveSummary>;
  listScanArchives: (limit?: number) => Promise<ScanArchiveSummary[]>;
  getScanReplayFrame: (id?: string) => Promise<ScanReplayFrame | null>;
  compareLatestScanArchives: () => Promise<ScanComparison | null>;
  addDailyMoverSnapshot: (snapshot: DailyMoverSnapshot) => Promise<DailyMoverSnapshot>;
  listDailyMoverSnapshots: (limit?: number) => Promise<DailyMoverSnapshot[]>;
  getDailyMoverSnapshot: (id?: string) => Promise<DailyMoverSnapshot | null>;
  upsertOhlcvCandleCache: (entry: OhlcvCandleCacheEntry) => Promise<OhlcvCandleCacheEntry>;
  listOhlcvCandleCaches: (limit?: number) => Promise<OhlcvCandleCacheEntry[]>;
  getOhlcvCandleCache: (symbol: string, interval: OhlcvInterval) => Promise<OhlcvCandleCacheEntry | null>;
};

export type MemoryPersistenceRepositoryOptions = {
  scope?: PersistenceScope;
  initialJournalEvents?: JournalEvent[];
  maxScanArchives?: number;
  maxDailyMoverSnapshots?: number;
};

export type PostgresPersistenceRepositoryOptions = {
  client: SqlClient;
  scope?: PersistenceScope;
  rankRebuildLimit?: number;
  maxDailyMoverSnapshots?: number;
};

export type CreatePersistenceRepositoryOptions = {
  env?: PersistenceEnv;
  client?: SqlClient;
  scope?: PersistenceScope;
  initialJournalEvents?: JournalEvent[];
  maxScanArchives?: number;
  maxDailyMoverSnapshots?: number;
};

const defaultScope = "public-demo";
const defaultJournalLimit = 500;
const defaultArchiveLimit = 24;
const defaultDailyMoverSnapshotLimit = 30;

function resolveScope(scope?: string) {
  const trimmed = scope?.trim();

  return trimmed || defaultScope;
}

function sortableTime(value: string) {
  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
}

function sortArchives(records: PersistedScanArchiveRecord[]) {
  return [...records].sort(
    (left, right) => sortableTime(right.generated_at) - sortableTime(left.generated_at),
  );
}

function sortDailyMoverSnapshots(snapshots: DailyMoverSnapshot[]) {
  return [...snapshots].sort(
    (left, right) => sortableTime(right.observedAt) - sortableTime(left.observedAt),
  );
}

function sortOhlcvCandleCaches(entries: OhlcvCandleCacheEntry[]) {
  return [...entries].sort(
    (left, right) => sortableTime(right.fetchedAt) - sortableTime(left.fetchedAt),
  );
}

function dailyMoverSnapshotRecordToSnapshot(
  record: PersistedDailyMoverSnapshotRecord,
): DailyMoverSnapshot {
  return {
    ...record.payload,
    id: record.id,
    source: record.source,
    observedAt: record.observed_at,
  };
}

export function detectPersistenceMode(env: PersistenceEnv = {}): PersistenceModeDecision {
  const scope = resolveScope(env.PERSISTENCE_SCOPE);
  const databaseUrl = env.DATABASE_URL?.trim() || env.POSTGRES_URL?.trim();

  if (!databaseUrl) {
    return {
      mode: "memory",
      scope,
      reason: "database_url_missing",
    };
  }

  return {
    mode: "database",
    scope,
  };
}

export function createMemoryPersistenceRepository({
  initialJournalEvents = [],
  maxScanArchives = defaultArchiveLimit,
  maxDailyMoverSnapshots = defaultDailyMoverSnapshotLimit,
  scope = defaultScope,
}: MemoryPersistenceRepositoryOptions = {}): PersistenceRepository {
  const journalStore = createJournalStore(initialJournalEvents);
  let archives: PersistedScanArchiveRecord[] = [];
  let dailyMoverSnapshots: DailyMoverSnapshot[] = [];
  let ohlcvCandleCaches: OhlcvCandleCacheEntry[] = [];
  let rankProfile = buildRankProfile(journalStore.list());
  const resolvedScope = resolveScope(scope);

  return {
    mode: "memory",
    scope: resolvedScope,

    async listJournalEvents(limit = defaultJournalLimit) {
      return journalStore.list().slice(0, limit);
    },

    async addJournalEvent(entry) {
      journalStore.add(entry);
      rankProfile = buildRankProfile(journalStore.list());

      return entry;
    },

    async getRankProfile() {
      return rankProfile;
    },

    async upsertRankProfile(profile) {
      rankProfile = profile;

      return profile;
    },

    async addScanArchive(summary, replayFrame) {
      const record = scanArchiveToRecord(summary, replayFrame, resolvedScope);
      archives = sortArchives([
        record,
        ...archives.filter((entry) => entry.id !== record.id),
      ]).slice(0, maxScanArchives);

      return scanArchiveRecordToSummary(record);
    },

    async listScanArchives(limit = maxScanArchives) {
      return archives.slice(0, limit).map(scanArchiveRecordToSummary);
    },

    async getScanReplayFrame(id) {
      const record = id
        ? archives.find((entry) => entry.id === id)
        : archives[0];

      return record?.payload.replayFrame ?? null;
    },

    async compareLatestScanArchives() {
      const [current, previous] = archives;

      if (!current || !previous) {
        return null;
      }

      return compareScanReplayFrames(previous.payload.replayFrame, current.payload.replayFrame);
    },

    async addDailyMoverSnapshot(snapshot) {
      dailyMoverSnapshots = sortDailyMoverSnapshots([
        snapshot,
        ...dailyMoverSnapshots.filter((entry) => entry.id !== snapshot.id),
      ]).slice(0, maxDailyMoverSnapshots);

      return snapshot;
    },

    async listDailyMoverSnapshots(limit = maxDailyMoverSnapshots) {
      return dailyMoverSnapshots.slice(0, limit);
    },

    async getDailyMoverSnapshot(id) {
      return id
        ? dailyMoverSnapshots.find((entry) => entry.id === id) ?? null
        : dailyMoverSnapshots[0] ?? null;
    },

    async upsertOhlcvCandleCache(entry) {
      ohlcvCandleCaches = sortOhlcvCandleCaches([
        entry,
        ...ohlcvCandleCaches.filter((item) => (
          item.symbol !== entry.symbol || item.interval !== entry.interval
        )),
      ]);

      return entry;
    },

    async listOhlcvCandleCaches(limit = defaultArchiveLimit) {
      return ohlcvCandleCaches.slice(0, limit);
    },

    async getOhlcvCandleCache(symbol, interval) {
      return ohlcvCandleCaches.find((entry) => (
        entry.symbol === symbol && entry.interval === interval
      )) ?? null;
    },
  };
}

export function createPostgresPersistenceRepository({
  client,
  maxDailyMoverSnapshots = defaultDailyMoverSnapshotLimit,
  rankRebuildLimit = defaultJournalLimit,
  scope = defaultScope,
}: PostgresPersistenceRepositoryOptions): PersistenceRepository {
  const resolvedScope = resolveScope(scope);

  async function listJournalEvents(limit = defaultJournalLimit) {
    const result = await client.query<PersistedJournalEventRecord>(
      `
select * from journal_events
where scope = $1
order by created_at desc
limit $2
`.trim(),
      [resolvedScope, limit],
    );

    return result.rows.map(journalEventRecordToEvent);
  }

  async function listScanArchiveRecords(limit = defaultArchiveLimit) {
    const result = await client.query<PersistedScanArchiveRecord>(
      `
select * from scan_archives
where scope = $1
order by generated_at desc
limit $2
`.trim(),
      [resolvedScope, limit],
    );

    return result.rows;
  }

  async function listDailyMoverSnapshotRecords(limit = maxDailyMoverSnapshots) {
    const result = await client.query<PersistedDailyMoverSnapshotRecord>(
      `
select * from daily_mover_snapshots
where scope = $1
order by observed_at desc
limit $2
`.trim(),
      [resolvedScope, limit],
    );

    return result.rows;
  }

  async function listOhlcvCandleCacheRecords(limit = defaultArchiveLimit) {
    const result = await client.query<PersistedOhlcvCandleCacheRecord>(
      `
select * from ohlcv_candle_cache
where scope = $1
order by fetched_at desc
limit $2
`.trim(),
      [resolvedScope, limit],
    );

    return result.rows;
  }

  async function upsertRankProfile(profile: RankProfile, updatedAt = new Date().toISOString()) {
    const record = rankProfileToRecord(profile, resolvedScope, updatedAt);

    await client.query(
      `
insert into rank_profiles (
  scope,
  tier_id,
  tier_label,
  total_xp,
  raw_score,
  progress_percent,
  updated_at,
  payload
) values ($1, $2, $3, $4, $5, $6, $7, $8)
on conflict (scope) do update set
  tier_id = excluded.tier_id,
  tier_label = excluded.tier_label,
  total_xp = excluded.total_xp,
  raw_score = excluded.raw_score,
  progress_percent = excluded.progress_percent,
  updated_at = excluded.updated_at,
  payload = excluded.payload
`.trim(),
      [
        record.scope,
        record.tier_id,
        record.tier_label,
        record.total_xp,
        record.raw_score,
        record.progress_percent,
        record.updated_at,
        record.payload,
      ],
    );

    return profile;
  }

  return {
    mode: "database",
    scope: resolvedScope,

    listJournalEvents,

    async addJournalEvent(entry) {
      const record = journalEventToRecord(entry, resolvedScope);

      await client.query(
        `
insert into journal_events (
  id,
  scope,
  symbol,
  result,
  rank_delta,
  action,
  review_status,
  outcome_status,
  created_at,
  payload
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
on conflict (scope, id) do update set
  symbol = excluded.symbol,
  result = excluded.result,
  rank_delta = excluded.rank_delta,
  action = excluded.action,
  review_status = excluded.review_status,
  outcome_status = excluded.outcome_status,
  created_at = excluded.created_at,
  payload = excluded.payload
`.trim(),
        [
          record.id,
          record.scope,
          record.symbol,
          record.result,
          record.rank_delta,
          record.action,
          record.review_status,
          record.outcome_status,
          record.created_at,
          record.payload,
        ],
      );

      const entries = await listJournalEvents(rankRebuildLimit);
      await upsertRankProfile(buildRankProfile(entries));

      return entry;
    },

    async getRankProfile() {
      const result = await client.query<PersistedRankProfileRecord>(
        `
select * from rank_profiles
where scope = $1
limit 1
`.trim(),
        [resolvedScope],
      );
      const record = result.rows[0];

      if (record) {
        return rankProfileRecordToProfile(record);
      }

      return buildRankProfile(await listJournalEvents(rankRebuildLimit));
    },

    upsertRankProfile,

    async addScanArchive(summary, replayFrame) {
      const record = scanArchiveToRecord(summary, replayFrame, resolvedScope);

      await client.query(
        `
insert into scan_archives (
  id,
  scope,
  source,
  status,
  generated_at,
  scanned_count,
  anomaly_count,
  candidate_count,
  signals_count,
  top_symbols,
  payload
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
on conflict (scope, id) do update set
  source = excluded.source,
  status = excluded.status,
  generated_at = excluded.generated_at,
  scanned_count = excluded.scanned_count,
  anomaly_count = excluded.anomaly_count,
  candidate_count = excluded.candidate_count,
  signals_count = excluded.signals_count,
  top_symbols = excluded.top_symbols,
  payload = excluded.payload
`.trim(),
        [
          record.id,
          record.scope,
          record.source,
          record.status,
          record.generated_at,
          record.scanned_count,
          record.anomaly_count,
          record.candidate_count,
          record.signals_count,
          record.top_symbols,
          record.payload,
        ],
      );

      return scanArchiveRecordToSummary(record);
    },

    async listScanArchives(limit = defaultArchiveLimit) {
      return (await listScanArchiveRecords(limit)).map(scanArchiveRecordToSummary);
    },

    async getScanReplayFrame(id) {
      const result = await client.query<PersistedScanArchiveRecord>(
        id
          ? `
select * from scan_archives
where scope = $1 and id = $2
limit 1
`.trim()
          : `
select * from scan_archives
where scope = $1
order by generated_at desc
limit 1
`.trim(),
        id ? [resolvedScope, id] : [resolvedScope],
      );

      return result.rows[0]?.payload.replayFrame ?? null;
    },

    async compareLatestScanArchives() {
      const [current, previous] = await listScanArchiveRecords(2);

      if (!current || !previous) {
        return null;
      }

      return compareScanReplayFrames(previous.payload.replayFrame, current.payload.replayFrame);
    },

    async addDailyMoverSnapshot(snapshot) {
      const records = dailyMoverSnapshotToRecords(snapshot, resolvedScope);
      const snapshotRecord = records.snapshot;

      await client.query(
        `
insert into daily_mover_snapshots (
  id,
  scope,
  source,
  observed_at,
  gainer_count,
  loser_count,
  payload
) values ($1, $2, $3, $4, $5, $6, $7)
on conflict (scope, id) do update set
  source = excluded.source,
  observed_at = excluded.observed_at,
  gainer_count = excluded.gainer_count,
  loser_count = excluded.loser_count,
  payload = excluded.payload
`.trim(),
        [
          snapshotRecord.id,
          snapshotRecord.scope,
          snapshotRecord.source,
          snapshotRecord.observed_at,
          snapshotRecord.gainer_count,
          snapshotRecord.loser_count,
          snapshotRecord.payload,
        ],
      );

      for (const asset of records.assets) {
        await client.query(
          `
insert into daily_mover_assets (
  scope,
  snapshot_id,
  mover_id,
  symbol,
  exchange,
  direction,
  rank,
  observed_at,
  price_change_percent,
  volume_24h_usd,
  payload
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
on conflict (scope, snapshot_id, mover_id) do update set
  symbol = excluded.symbol,
  exchange = excluded.exchange,
  direction = excluded.direction,
  rank = excluded.rank,
  observed_at = excluded.observed_at,
  price_change_percent = excluded.price_change_percent,
  volume_24h_usd = excluded.volume_24h_usd,
  payload = excluded.payload
`.trim(),
          [
            asset.scope,
            asset.snapshot_id,
            asset.mover_id,
            asset.symbol,
            asset.exchange,
            asset.direction,
            asset.rank,
            asset.observed_at,
            asset.price_change_percent,
            asset.volume_24h_usd,
            asset.payload,
          ],
        );
      }

      for (const review of records.attributionReviews) {
        await client.query(
          `
insert into mover_attribution_reviews (
  scope,
  mover_id,
  symbol,
  direction,
  observed_at,
  evidence_strength,
  learnability,
  primary_drivers,
  payload
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
on conflict (scope, mover_id) do update set
  symbol = excluded.symbol,
  direction = excluded.direction,
  observed_at = excluded.observed_at,
  evidence_strength = excluded.evidence_strength,
  learnability = excluded.learnability,
  primary_drivers = excluded.primary_drivers,
  payload = excluded.payload
`.trim(),
          [
            review.scope,
            review.mover_id,
            review.symbol,
            review.direction,
            review.observed_at,
            review.evidence_strength,
            review.learnability,
            review.primary_drivers,
            review.payload,
          ],
        );
      }

      for (const review of records.radarReviews) {
        await client.query(
          `
insert into radar_miss_reviews (
  scope,
  mover_id,
  symbol,
  status,
  matched_signal_ids,
  improvement_tags,
  payload
) values ($1, $2, $3, $4, $5, $6, $7)
on conflict (scope, mover_id) do update set
  symbol = excluded.symbol,
  status = excluded.status,
  matched_signal_ids = excluded.matched_signal_ids,
  improvement_tags = excluded.improvement_tags,
  payload = excluded.payload
`.trim(),
          [
            review.scope,
            review.mover_id,
            review.symbol,
            review.status,
            review.matched_signal_ids,
            review.improvement_tags,
            review.payload,
          ],
        );
      }

      return dailyMoverSnapshotRecordToSnapshot(snapshotRecord);
    },

    async listDailyMoverSnapshots(limit = maxDailyMoverSnapshots) {
      return (await listDailyMoverSnapshotRecords(limit)).map(dailyMoverSnapshotRecordToSnapshot);
    },

    async getDailyMoverSnapshot(id) {
      const result = await client.query<PersistedDailyMoverSnapshotRecord>(
        id
          ? `
select * from daily_mover_snapshots
where scope = $1 and id = $2
limit 1
`.trim()
          : `
select * from daily_mover_snapshots
where scope = $1
order by observed_at desc
limit 1
`.trim(),
        id ? [resolvedScope, id] : [resolvedScope],
      );

      return result.rows[0]
        ? dailyMoverSnapshotRecordToSnapshot(result.rows[0])
        : null;
    },

    async upsertOhlcvCandleCache(entry) {
      const record = ohlcvCandleCacheEntryToRecord(entry, resolvedScope);

      await client.query(
        `
insert into ohlcv_candle_cache (
  scope,
  symbol,
  interval,
  cache_key,
  source,
  fetched_at,
  candle_count,
  first_open_time,
  last_close_time,
  payload
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
on conflict (scope, symbol, interval) do update set
  cache_key = excluded.cache_key,
  source = excluded.source,
  fetched_at = excluded.fetched_at,
  candle_count = excluded.candle_count,
  first_open_time = excluded.first_open_time,
  last_close_time = excluded.last_close_time,
  payload = excluded.payload
`.trim(),
        [
          record.scope,
          record.symbol,
          record.interval,
          record.cache_key,
          record.source,
          record.fetched_at,
          record.candle_count,
          record.first_open_time,
          record.last_close_time,
          record.payload,
        ],
      );

      return entry;
    },

    async listOhlcvCandleCaches(limit = defaultArchiveLimit) {
      return (await listOhlcvCandleCacheRecords(limit)).map(ohlcvCandleCacheEntryRecordToEntry);
    },

    async getOhlcvCandleCache(symbol, interval) {
      const result = await client.query<PersistedOhlcvCandleCacheRecord>(
        `
select * from ohlcv_candle_cache
where scope = $1 and symbol = $2 and interval = $3
limit 1
`.trim(),
        [resolvedScope, symbol, interval],
      );

      return result.rows[0]
        ? ohlcvCandleCacheEntryRecordToEntry(result.rows[0])
        : null;
    },
  };
}

export function createPersistenceRepository({
  client,
  env = {},
  initialJournalEvents = [],
  maxDailyMoverSnapshots = defaultDailyMoverSnapshotLimit,
  maxScanArchives = defaultArchiveLimit,
  scope,
}: CreatePersistenceRepositoryOptions = {}): PersistenceRepository {
  const decision = detectPersistenceMode(env);
  const resolvedScope = resolveScope(scope ?? decision.scope);

  if (decision.mode === "database" && client) {
    return createPostgresPersistenceRepository({
      client,
      maxDailyMoverSnapshots,
      scope: resolvedScope,
    });
  }

  return createMemoryPersistenceRepository({
    initialJournalEvents,
    maxDailyMoverSnapshots,
    maxScanArchives,
    scope: resolvedScope,
  });
}
