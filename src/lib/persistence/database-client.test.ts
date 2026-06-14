import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent } from "@/lib/analysis/types";
import {
  createDatabaseAwarePersistenceRepository,
  detectDatabaseClientConfig,
  runPersistenceSchemaMigration,
} from "./database-client";
import type { SqlClient } from "./persistence-store";

type QueryCall = {
  sql: string;
  params: unknown[];
};

class RecordingSqlClient implements SqlClient {
  calls: QueryCall[] = [];

  async query<T = unknown>(sql: string, params: unknown[] = []) {
    this.calls.push({ sql, params });

    return { rows: [] as T[] };
  }
}

function journalEvent(overrides: Partial<JournalEvent> = {}): JournalEvent {
  return {
    id: "journal-db-fallback",
    symbol: "SUIUSDT",
    title: "数据库未接入时仍可预览",
    result: "watching",
    note: "不能因为填了 URL 就假装已经持久化。",
    rankDelta: 0,
    createdAt: "2026-06-13T10:00:00.000+08:00",
    action: "track",
    reviewStatus: "tracking",
    ...overrides,
  };
}

test("detectDatabaseClientConfig keeps the app in memory preview without a database URL", () => {
  const config = detectDatabaseClientConfig({});

  assert.equal(config.status, "unconfigured");
  assert.equal(config.driver, "none");
  assert.equal(config.scope, "public-demo");
  assert.equal(config.hasDatabaseUrl, false);
  assert.equal(config.durable, false);
  assert.equal(config.reason, "database_url_missing");
});

test("detectDatabaseClientConfig reads provider and scope without locking repository code to one SDK", () => {
  const config = detectDatabaseClientConfig({
    DATABASE_DRIVER: "neon",
    DATABASE_URL: "postgres://example",
    PERSISTENCE_SCOPE: "chuan-public",
  });

  assert.equal(config.status, "configured");
  assert.equal(config.driver, "neon");
  assert.equal(config.scope, "chuan-public");
  assert.equal(config.hasDatabaseUrl, true);
  assert.equal(config.connectionStringEnv, "DATABASE_URL");
  assert.equal(config.durable, false);
  assert.equal(config.reason, undefined);
});

test("database-aware repository falls back to memory when URL exists but no SQL client is active", async () => {
  const { diagnostics, repository } = createDatabaseAwarePersistenceRepository({
    env: {
      DATABASE_URL: "postgres://example",
      PERSISTENCE_SCOPE: "chuan-public",
    },
    initialJournalEvents: [journalEvent()],
  });

  assert.equal(repository.mode, "memory");
  assert.equal(repository.scope, "chuan-public");
  assert.equal(diagnostics.status, "fallback");
  assert.equal(diagnostics.reason, "sql_client_missing");
  assert.equal(diagnostics.durable, false);
  assert.equal((await repository.listJournalEvents())[0]?.symbol, "SUIUSDT");
});

test("database-aware repository uses the database path when a SQL client is injected", async () => {
  const client = new RecordingSqlClient();
  const { diagnostics, repository } = createDatabaseAwarePersistenceRepository({
    client,
    env: {
      DATABASE_DRIVER: "supabase",
      POSTGRES_URL: "postgres://example",
      PERSISTENCE_SCOPE: "chuan-public",
    },
  });

  assert.equal(repository.mode, "database");
  assert.equal(repository.scope, "chuan-public");
  assert.equal(diagnostics.status, "ready");
  assert.equal(diagnostics.driver, "supabase");
  assert.equal(diagnostics.durable, true);

  await repository.listScanArchives(3);

  assert.match(client.calls[0]?.sql ?? "", /select \* from scan_archives/i);
  assert.deepEqual(client.calls[0]?.params, ["chuan-public", 3]);
});

test("runPersistenceSchemaMigration sends one schema statement per query for Neon-compatible prepared execution", async () => {
  const client = new RecordingSqlClient();
  const result = await runPersistenceSchemaMigration(client);

  assert.equal(result.ok, true);
  assert.deepEqual(result.tables, ["journal_events", "scan_archives", "rank_profiles"]);
  assert.equal(result.tableCount, 3);
  assert.equal(client.calls.length, 7);
  assert.match(client.calls[0]?.sql ?? "", /^create table if not exists journal_events/i);
  assert.match(client.calls[1]?.sql ?? "", /^create index if not exists journal_events_scope_created_at_idx/i);
  assert.match(client.calls[2]?.sql ?? "", /^create index if not exists journal_events_scope_symbol_idx/i);
  assert.match(client.calls[3]?.sql ?? "", /^create index if not exists journal_events_scope_outcome_status_idx/i);
  assert.match(client.calls[4]?.sql ?? "", /^create table if not exists scan_archives/i);
  assert.match(client.calls[5]?.sql ?? "", /^create index if not exists scan_archives_scope_generated_at_idx/i);
  assert.match(client.calls[6]?.sql ?? "", /^create table if not exists rank_profiles/i);
  assert.equal(client.calls.some((call) => call.sql.includes(";\n\ncreate")), false);
  assert.deepEqual(client.calls.map((call) => call.params), [[], [], [], [], [], [], []]);
});
