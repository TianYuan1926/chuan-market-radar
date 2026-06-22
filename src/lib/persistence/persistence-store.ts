import type { JournalEvent } from "../analysis/types";
import type { V3ForwardMapSnapshot } from "../analysis/v3/types";
import { createJournalStore } from "../journal/journal-store";
import { buildRankProfile, type RankProfile } from "../journal/rank-engine";
import type { DailyMoverSnapshot } from "../market/daily-movers";
import type { MacroMarketSnapshot } from "../market/macro-snapshot";
import type { OhlcvCandleCacheEntry, OhlcvInterval } from "../market/ohlcv/types";
import { compareScanReplayFrames } from "../market/scan-archive";
import type {
  MarketRadarSnapshot,
  ScanArchiveSummary,
  ScanAssetState,
  ScanComparison,
  ScanReplayFrame,
} from "../market/types";
import {
  dailyMoverSnapshotToRecords,
  frontendUiStateRecordToEntry,
  frontendUiStateToRecord,
  journalEventRecordToEvent,
  journalEventToRecord,
  macroMarketSnapshotRecordToSnapshot,
  macroMarketSnapshotToRecord,
  ohlcvCandleCacheEntryRecordToEntry,
  ohlcvCandleCacheEntryToRecord,
  type PersistedMacroMarketSnapshotRecord,
  type PersistedOhlcvCandleCacheRecord,
  type PersistedScanAssetStateRecord,
  rankProfileRecordToProfile,
  rankProfileToRecord,
  scanAssetStateRecordToState,
  scanAssetStateToRecord,
  scanReplayFrameToV3ForwardMapSnapshotRecords,
  scanArchiveRecordToSummary,
  scanArchiveToRecord,
  type PersistedDailyMoverSnapshotRecord,
  type PersistedFrontendUiStateRecord,
  type PersistedJournalEventRecord,
  type PersistedRankProfileRecord,
  type PersistedScanArchiveRecord,
  type PersistedV3ForwardMapSnapshotRecord,
  type FrontendUiStateEntry,
  type FrontendUiStateKind,
  type PersistenceScope,
  v3ForwardMapRecordToSnapshot,
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
    snapshot?: MarketRadarSnapshot,
  ) => Promise<ScanArchiveSummary>;
  listScanArchives: (limit?: number) => Promise<ScanArchiveSummary[]>;
  getScanSnapshot: (id?: string) => Promise<MarketRadarSnapshot | null>;
  getScanReplayFrame: (id?: string) => Promise<ScanReplayFrame | null>;
  compareLatestScanArchives: () => Promise<ScanComparison | null>;
  addV3ForwardMapSnapshots: (replayFrame: ScanReplayFrame) => Promise<V3ForwardMapSnapshot[]>;
  listV3ForwardMapSnapshots: (limit?: number) => Promise<V3ForwardMapSnapshot[]>;
  getV3ForwardMapSnapshotsForScan: (scanId: string) => Promise<V3ForwardMapSnapshot[]>;
  addDailyMoverSnapshot: (snapshot: DailyMoverSnapshot) => Promise<DailyMoverSnapshot>;
  listDailyMoverSnapshots: (limit?: number) => Promise<DailyMoverSnapshot[]>;
  getDailyMoverSnapshot: (id?: string) => Promise<DailyMoverSnapshot | null>;
  upsertOhlcvCandleCache: (entry: OhlcvCandleCacheEntry) => Promise<OhlcvCandleCacheEntry>;
  listOhlcvCandleCaches: (limit?: number) => Promise<OhlcvCandleCacheEntry[]>;
  getOhlcvCandleCache: (symbol: string, interval: OhlcvInterval) => Promise<OhlcvCandleCacheEntry | null>;
  upsertScanAssetStates: (states: ScanAssetState[]) => Promise<ScanAssetState[]>;
  listScanAssetStates: (limit?: number) => Promise<ScanAssetState[]>;
  addMacroMarketSnapshot: (snapshot: MacroMarketSnapshot) => Promise<MacroMarketSnapshot>;
  listMacroMarketSnapshots: (limit?: number) => Promise<MacroMarketSnapshot[]>;
  getLatestMacroMarketSnapshot: () => Promise<MacroMarketSnapshot | null>;
  getFrontendUiState: <TPayload = Record<string, unknown>>(
    kind: FrontendUiStateKind,
  ) => Promise<FrontendUiStateEntry<TPayload> | null>;
  upsertFrontendUiState: <TPayload = Record<string, unknown>>(
    entry: FrontendUiStateEntry<TPayload>,
  ) => Promise<FrontendUiStateEntry<TPayload>>;
};

export type MemoryPersistenceRepositoryOptions = {
  scope?: PersistenceScope;
  initialJournalEvents?: JournalEvent[];
  maxScanArchives?: number;
  maxDailyMoverSnapshots?: number;
  maxV3ForwardMapSnapshots?: number;
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
  maxV3ForwardMapSnapshots?: number;
};

const defaultScope = "public-demo";
const defaultJournalLimit = 500;
const defaultArchiveLimit = 24;
const defaultDailyMoverSnapshotLimit = 30;
const defaultV3ForwardMapSnapshotLimit = 240;

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

function sortV3ForwardMapSnapshotRecords(records: PersistedV3ForwardMapSnapshotRecord[]) {
  return [...records].sort(
    (left, right) => sortableTime(right.generated_at) - sortableTime(left.generated_at) ||
      left.symbol.localeCompare(right.symbol) ||
      left.signal_id.localeCompare(right.signal_id),
  );
}

function sortScanAssetStateRecords(records: PersistedScanAssetStateRecord[]) {
  return [...records].sort(
    (left, right) => sortableTime(right.updated_at) - sortableTime(left.updated_at) ||
      right.rotation_priority_score - left.rotation_priority_score ||
      left.symbol.localeCompare(right.symbol),
  );
}

function sortMacroMarketSnapshotRecords(records: PersistedMacroMarketSnapshotRecord[]) {
  return [...records].sort(
    (left, right) => sortableTime(right.fetched_at) - sortableTime(left.fetched_at) ||
      left.id.localeCompare(right.id),
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
  maxV3ForwardMapSnapshots = defaultV3ForwardMapSnapshotLimit,
  scope = defaultScope,
}: MemoryPersistenceRepositoryOptions = {}): PersistenceRepository {
  const journalStore = createJournalStore(initialJournalEvents);
  let archives: PersistedScanArchiveRecord[] = [];
  let dailyMoverSnapshots: DailyMoverSnapshot[] = [];
  let ohlcvCandleCaches: OhlcvCandleCacheEntry[] = [];
  let scanAssetStates: PersistedScanAssetStateRecord[] = [];
  let macroMarketSnapshots: PersistedMacroMarketSnapshotRecord[] = [];
  let frontendUiStates: PersistedFrontendUiStateRecord[] = [];
  let v3ForwardMapSnapshots: PersistedV3ForwardMapSnapshotRecord[] = [];
  let rankProfile = buildRankProfile(journalStore.list());
  const resolvedScope = resolveScope(scope);

  function upsertV3ForwardMapSnapshotRecords(replayFrame: ScanReplayFrame) {
    const records = scanReplayFrameToV3ForwardMapSnapshotRecords(replayFrame, resolvedScope);

    if (records.length === 0) {
      return [];
    }

    const recordKeys = new Set(records.map((record) => (
      `${record.scope}:${record.scan_id}:${record.signal_id}`
    )));
    v3ForwardMapSnapshots = sortV3ForwardMapSnapshotRecords([
      ...records,
      ...v3ForwardMapSnapshots.filter((record) => (
        !recordKeys.has(`${record.scope}:${record.scan_id}:${record.signal_id}`)
      )),
    ]).slice(0, maxV3ForwardMapSnapshots);

    return records.map(v3ForwardMapRecordToSnapshot);
  }

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

    async addScanArchive(summary, replayFrame, snapshot) {
      const record = scanArchiveToRecord(summary, replayFrame, resolvedScope, snapshot);
      archives = sortArchives([
        record,
        ...archives.filter((entry) => entry.id !== record.id),
      ]).slice(0, maxScanArchives);
      upsertV3ForwardMapSnapshotRecords(replayFrame);

      return scanArchiveRecordToSummary(record);
    },

    async listScanArchives(limit = maxScanArchives) {
      return archives.slice(0, limit).map(scanArchiveRecordToSummary);
    },

    async getScanSnapshot(id) {
      const record = id
        ? archives.find((entry) => entry.id === id)
        : archives[0];

      return record?.payload.snapshot ?? null;
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

    async addV3ForwardMapSnapshots(replayFrame) {
      return upsertV3ForwardMapSnapshotRecords(replayFrame);
    },

    async listV3ForwardMapSnapshots(limit = maxV3ForwardMapSnapshots) {
      return v3ForwardMapSnapshots.slice(0, limit).map(v3ForwardMapRecordToSnapshot);
    },

    async getV3ForwardMapSnapshotsForScan(scanId) {
      return v3ForwardMapSnapshots
        .filter((record) => record.scan_id === scanId)
        .map(v3ForwardMapRecordToSnapshot);
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

    async upsertScanAssetStates(states) {
      const records = states.map((state) => scanAssetStateToRecord(state, resolvedScope));
      const keys = new Set(records.map((record) => `${record.scope}:${record.symbol}`));
      scanAssetStates = sortScanAssetStateRecords([
        ...records,
        ...scanAssetStates.filter((record) => !keys.has(`${record.scope}:${record.symbol}`)),
      ]);

      return records.map(scanAssetStateRecordToState);
    },

    async listScanAssetStates(limit = defaultArchiveLimit) {
      return scanAssetStates.slice(0, limit).map(scanAssetStateRecordToState);
    },

    async addMacroMarketSnapshot(snapshot) {
      const record = macroMarketSnapshotToRecord(snapshot, resolvedScope);
      macroMarketSnapshots = sortMacroMarketSnapshotRecords([
        record,
        ...macroMarketSnapshots.filter((item) => item.id !== record.id),
      ]);

      return macroMarketSnapshotRecordToSnapshot(record);
    },

    async listMacroMarketSnapshots(limit = defaultArchiveLimit) {
      return macroMarketSnapshots.slice(0, limit).map(macroMarketSnapshotRecordToSnapshot);
    },

    async getLatestMacroMarketSnapshot() {
      const record = macroMarketSnapshots[0];

      return record ? macroMarketSnapshotRecordToSnapshot(record) : null;
    },

    async getFrontendUiState<TPayload = Record<string, unknown>>(kind: FrontendUiStateKind) {
      const record = frontendUiStates.find((entry) => entry.kind === kind);

      return record
        ? frontendUiStateRecordToEntry(record as PersistedFrontendUiStateRecord<TPayload>)
        : null;
    },

    async upsertFrontendUiState<TPayload = Record<string, unknown>>(
      entry: FrontendUiStateEntry<TPayload>,
    ) {
      const record = frontendUiStateToRecord(entry, resolvedScope);
      frontendUiStates = [
        record as PersistedFrontendUiStateRecord,
        ...frontendUiStates.filter((item) => item.kind !== entry.kind),
      ].sort((left, right) => sortableTime(right.updated_at) - sortableTime(left.updated_at));

      return frontendUiStateRecordToEntry(record);
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

  async function listV3ForwardMapSnapshotRecords(limit = defaultV3ForwardMapSnapshotLimit) {
    const result = await client.query<PersistedV3ForwardMapSnapshotRecord>(
      `
select * from v3_forward_map_snapshots
where scope = $1
order by generated_at desc, symbol asc, signal_id asc
limit $2
`.trim(),
      [resolvedScope, limit],
    );

    return result.rows;
  }

  async function listScanAssetStateRecords(limit = defaultArchiveLimit) {
    const result = await client.query<PersistedScanAssetStateRecord>(
      `
select * from scan_asset_states
where scope = $1
order by updated_at desc, rotation_priority_score desc, symbol asc
limit $2
`.trim(),
      [resolvedScope, limit],
    );

    return result.rows;
  }

  async function listMacroMarketSnapshotRecords(limit = defaultArchiveLimit) {
    const result = await client.query<PersistedMacroMarketSnapshotRecord>(
      `
select * from macro_market_snapshots
where scope = $1
order by fetched_at desc
limit $2
`.trim(),
      [resolvedScope, limit],
    );

    return result.rows;
  }

  async function getFrontendUiState<TPayload = Record<string, unknown>>(
    kind: FrontendUiStateKind,
  ) {
    const result = await client.query<PersistedFrontendUiStateRecord<TPayload>>(
      `
select * from frontend_ui_states
where scope = $1 and kind = $2
limit 1
`.trim(),
      [resolvedScope, kind],
    );

    return result.rows[0] ? frontendUiStateRecordToEntry(result.rows[0]) : null;
  }

  async function insertV3ForwardMapSnapshots(replayFrame: ScanReplayFrame) {
    const records = scanReplayFrameToV3ForwardMapSnapshotRecords(replayFrame, resolvedScope);

    for (const record of records) {
      await client.query(
        `
insert into v3_forward_map_snapshots (
  scope,
  scan_id,
  signal_id,
  symbol,
  generated_at,
  key_level_count,
  forward_level_count,
  source_timeframes,
  allowed_use,
  can_auto_adjust_weights,
  can_mutate_live_ranking,
  payload
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
on conflict (scope, scan_id, signal_id) do update set
  symbol = excluded.symbol,
  generated_at = excluded.generated_at,
  key_level_count = excluded.key_level_count,
  forward_level_count = excluded.forward_level_count,
  source_timeframes = excluded.source_timeframes,
  allowed_use = excluded.allowed_use,
  can_auto_adjust_weights = excluded.can_auto_adjust_weights,
  can_mutate_live_ranking = excluded.can_mutate_live_ranking,
  payload = excluded.payload
`.trim(),
        [
          record.scope,
          record.scan_id,
          record.signal_id,
          record.symbol,
          record.generated_at,
          record.key_level_count,
          record.forward_level_count,
          record.source_timeframes,
          record.allowed_use,
          record.can_auto_adjust_weights,
          record.can_mutate_live_ranking,
          record.payload,
        ],
      );
    }

    return records.map(v3ForwardMapRecordToSnapshot);
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

    async addScanArchive(summary, replayFrame, snapshot) {
      const record = scanArchiveToRecord(summary, replayFrame, resolvedScope, snapshot);

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

      await insertV3ForwardMapSnapshots(replayFrame);

      return scanArchiveRecordToSummary(record);
    },

    async listScanArchives(limit = defaultArchiveLimit) {
      return (await listScanArchiveRecords(limit)).map(scanArchiveRecordToSummary);
    },

    async getScanSnapshot(id) {
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

      return result.rows[0]?.payload.snapshot ?? null;
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

    async addV3ForwardMapSnapshots(replayFrame) {
      return insertV3ForwardMapSnapshots(replayFrame);
    },

    async listV3ForwardMapSnapshots(limit = defaultV3ForwardMapSnapshotLimit) {
      return (await listV3ForwardMapSnapshotRecords(limit)).map(v3ForwardMapRecordToSnapshot);
    },

    async getV3ForwardMapSnapshotsForScan(scanId) {
      const result = await client.query<PersistedV3ForwardMapSnapshotRecord>(
        `
select * from v3_forward_map_snapshots
where scope = $1 and scan_id = $2
order by generated_at desc, symbol asc, signal_id asc
`.trim(),
        [resolvedScope, scanId],
      );

      return result.rows.map(v3ForwardMapRecordToSnapshot);
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

    async upsertScanAssetStates(states) {
      const records = states.map((state) => scanAssetStateToRecord(state, resolvedScope));

      for (const record of records) {
        await client.query(
          `
insert into scan_asset_states (
  scope,
  symbol,
  base_asset,
  tier,
  state_pool,
  last_light_scanned_at,
  last_deep_scanned_at,
  consecutive_skipped,
  deep_scan_count_1h,
  deep_scan_count_24h,
  dynamic_priority_score,
  rotation_priority_score,
  was_displaced_by_dynamic_priority,
  last_selected_reason,
  last_skipped_reason,
  updated_at,
  payload
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
on conflict (scope, symbol) do update set
  base_asset = excluded.base_asset,
  tier = excluded.tier,
  state_pool = excluded.state_pool,
  last_light_scanned_at = excluded.last_light_scanned_at,
  last_deep_scanned_at = excluded.last_deep_scanned_at,
  consecutive_skipped = excluded.consecutive_skipped,
  deep_scan_count_1h = excluded.deep_scan_count_1h,
  deep_scan_count_24h = excluded.deep_scan_count_24h,
  dynamic_priority_score = excluded.dynamic_priority_score,
  rotation_priority_score = excluded.rotation_priority_score,
  was_displaced_by_dynamic_priority = excluded.was_displaced_by_dynamic_priority,
  last_selected_reason = excluded.last_selected_reason,
  last_skipped_reason = excluded.last_skipped_reason,
  updated_at = excluded.updated_at,
  payload = excluded.payload
`.trim(),
          [
            record.scope,
            record.symbol,
            record.base_asset,
            record.tier,
            record.state_pool,
            record.last_light_scanned_at,
            record.last_deep_scanned_at,
            record.consecutive_skipped,
            record.deep_scan_count_1h,
            record.deep_scan_count_24h,
            record.dynamic_priority_score,
            record.rotation_priority_score,
            record.was_displaced_by_dynamic_priority,
            record.last_selected_reason,
            record.last_skipped_reason,
            record.updated_at,
            record.payload,
          ],
        );
      }

      return records.map(scanAssetStateRecordToState);
    },

    async listScanAssetStates(limit = defaultArchiveLimit) {
      return (await listScanAssetStateRecords(limit)).map(scanAssetStateRecordToState);
    },

    async addMacroMarketSnapshot(snapshot) {
      const record = macroMarketSnapshotToRecord(snapshot, resolvedScope);

      await client.query(
        `
insert into macro_market_snapshots (
  scope,
  id,
  source,
  fetched_at,
  updated_at,
  btc_dominance_percent,
  eth_dominance_percent,
  total_market_cap_usd,
  total_market_cap_change_percent_24h,
  total2_market_cap_usd,
  total3_market_cap_usd,
  allowed_use,
  can_create_trade_signal,
  payload
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
on conflict (scope, id) do update set
  source = excluded.source,
  fetched_at = excluded.fetched_at,
  updated_at = excluded.updated_at,
  btc_dominance_percent = excluded.btc_dominance_percent,
  eth_dominance_percent = excluded.eth_dominance_percent,
  total_market_cap_usd = excluded.total_market_cap_usd,
  total_market_cap_change_percent_24h = excluded.total_market_cap_change_percent_24h,
  total2_market_cap_usd = excluded.total2_market_cap_usd,
  total3_market_cap_usd = excluded.total3_market_cap_usd,
  allowed_use = excluded.allowed_use,
  can_create_trade_signal = excluded.can_create_trade_signal,
  payload = excluded.payload
`.trim(),
        [
          record.scope,
          record.id,
          record.source,
          record.fetched_at,
          record.updated_at,
          record.btc_dominance_percent,
          record.eth_dominance_percent,
          record.total_market_cap_usd,
          record.total_market_cap_change_percent_24h,
          record.total2_market_cap_usd,
          record.total3_market_cap_usd,
          record.allowed_use,
          record.can_create_trade_signal,
          record.payload,
        ],
      );

      return macroMarketSnapshotRecordToSnapshot(record);
    },

    async listMacroMarketSnapshots(limit = defaultArchiveLimit) {
      return (await listMacroMarketSnapshotRecords(limit)).map(macroMarketSnapshotRecordToSnapshot);
    },

    async getLatestMacroMarketSnapshot() {
      const records = await listMacroMarketSnapshotRecords(1);

      return records[0] ? macroMarketSnapshotRecordToSnapshot(records[0]) : null;
    },

    getFrontendUiState,

    async upsertFrontendUiState<TPayload = Record<string, unknown>>(
      entry: FrontendUiStateEntry<TPayload>,
    ) {
      const record = frontendUiStateToRecord(entry, resolvedScope);

      await client.query(
        `
insert into frontend_ui_states (
  scope,
  kind,
  updated_at,
  version,
  allowed_use,
  can_create_trade_signal,
  can_mutate_live_ranking,
  can_auto_adjust_weights,
  payload
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
on conflict (scope, kind) do update set
  updated_at = excluded.updated_at,
  version = excluded.version,
  allowed_use = excluded.allowed_use,
  can_create_trade_signal = excluded.can_create_trade_signal,
  can_mutate_live_ranking = excluded.can_mutate_live_ranking,
  can_auto_adjust_weights = excluded.can_auto_adjust_weights,
  payload = excluded.payload
`.trim(),
        [
          record.scope,
          record.kind,
          record.updated_at,
          record.version,
          record.allowed_use,
          record.can_create_trade_signal,
          record.can_mutate_live_ranking,
          record.can_auto_adjust_weights,
          record.payload,
        ],
      );

      return frontendUiStateRecordToEntry(record);
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
