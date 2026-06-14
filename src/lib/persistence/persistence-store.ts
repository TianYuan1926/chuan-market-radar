import type { JournalEvent } from "../analysis/types";
import { createJournalStore } from "../journal/journal-store";
import { buildRankProfile, type RankProfile } from "../journal/rank-engine";
import { compareScanReplayFrames } from "../market/scan-archive";
import type { ScanArchiveSummary, ScanComparison, ScanReplayFrame } from "../market/types";
import {
  journalEventRecordToEvent,
  journalEventToRecord,
  rankProfileRecordToProfile,
  rankProfileToRecord,
  scanArchiveRecordToSummary,
  scanArchiveToRecord,
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
};

export type MemoryPersistenceRepositoryOptions = {
  scope?: PersistenceScope;
  initialJournalEvents?: JournalEvent[];
  maxScanArchives?: number;
};

export type PostgresPersistenceRepositoryOptions = {
  client: SqlClient;
  scope?: PersistenceScope;
  rankRebuildLimit?: number;
};

export type CreatePersistenceRepositoryOptions = {
  env?: PersistenceEnv;
  client?: SqlClient;
  scope?: PersistenceScope;
  initialJournalEvents?: JournalEvent[];
  maxScanArchives?: number;
};

const defaultScope = "public-demo";
const defaultJournalLimit = 500;
const defaultArchiveLimit = 24;

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
  scope = defaultScope,
}: MemoryPersistenceRepositoryOptions = {}): PersistenceRepository {
  const journalStore = createJournalStore(initialJournalEvents);
  let archives: PersistedScanArchiveRecord[] = [];
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
  };
}

export function createPostgresPersistenceRepository({
  client,
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
  };
}

export function createPersistenceRepository({
  client,
  env = {},
  initialJournalEvents = [],
  maxScanArchives = defaultArchiveLimit,
  scope,
}: CreatePersistenceRepositoryOptions = {}): PersistenceRepository {
  const decision = detectPersistenceMode(env);
  const resolvedScope = resolveScope(scope ?? decision.scope);

  if (decision.mode === "database" && client) {
    return createPostgresPersistenceRepository({ client, scope: resolvedScope });
  }

  return createMemoryPersistenceRepository({
    initialJournalEvents,
    maxScanArchives,
    scope: resolvedScope,
  });
}
