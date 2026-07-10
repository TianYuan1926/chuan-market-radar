import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  CandidateEpisodeService,
  type CandidateEpisodeRow,
  type OpenOrRefreshEpisodeCommand,
} from "./candidate-episode-service";
import type {
  PostgresTransactionAdapter,
  QueryResult,
  TransactionContext,
  TransactionOptions,
} from "./transaction-adapter";

type QueryCall = { params: unknown[]; sql: string; transaction: number };

function adapter(
  respond: (sql: string, params: unknown[]) => unknown[] = () => [],
): {
  calls: QueryCall[];
  options: TransactionOptions[];
  value: PostgresTransactionAdapter;
} {
  const calls: QueryCall[] = [];
  const options: TransactionOptions[] = [];
  let transaction = 0;
  const value: PostgresTransactionAdapter = {
    async withTransaction<T>(
      transactionOptions: TransactionOptions,
      work: (tx: TransactionContext) => Promise<T>,
    ) {
      options.push(transactionOptions);
      transaction += 1;
      const currentTransaction = transaction;
      const tx: TransactionContext = {
        async query<R = unknown>(sql: string, params: unknown[] = []) {
          calls.push({ sql, params, transaction: currentTransaction });
          return { rows: respond(sql, params) as R[] } satisfies QueryResult<R>;
        },
        async withSavepoint<R>(nested: (context: TransactionContext) => Promise<R>) {
          return nested(tx);
        },
      };
      return work(tx);
    },
  };

  return { calls, options, value };
}

function ids(...values: string[]) {
  let index = 0;
  return () => values[index++];
}

const openCommand: OpenOrRefreshEpisodeCommand = {
  scope: "production_radar",
  canonicalInstrumentId: "BINANCE:BTCUSDT:PERP",
  venueContext: { market: "perpetual", settlementAsset: "USDT", venue: "binance" },
  firstSeenAt: "2026-07-10T08:00:00.000Z",
  lastSeenAt: "2026-07-10T08:01:00.000Z",
  observationPrice: null,
  observationPriceFactId: null,
  discoveryReasons: ["quiet_compression"],
  priorityTier: "P1",
  maturity: "deep_candidate",
  directionState: "long",
  expiresAt: null,
  releaseId: "release-wp-g0-2",
  sourceScanCycleId: "scan-cycle-1",
  runtimeId: "candidate-rehearsal",
  idempotencyKey: "open:btc:scan-cycle-1",
};

test("openOrRefreshEpisode locks the instrument and calls the approved procedure with null facts intact", async () => {
  const db = adapter((sql) => sql.includes("open_or_refresh_episode_v1")
    ? [{ result_episode_id: "episode-existing", created: false, result_row_version: "4" }]
    : []);
  const service = new CandidateEpisodeService(db.value, {
    generateId: ids("episode-new", "event-new"),
  });

  const result = await service.openOrRefreshEpisode(openCommand);

  assert.deepEqual(result, { episodeId: "episode-existing", created: false, rowVersion: 4 });
  assert.deepEqual(db.options, [{
    idleInTransactionTimeoutMs: 30_000,
    isolation: "serializable",
    lockTimeoutMs: 1_000,
    maxRetries: 2,
    statementTimeoutMs: 30_000,
  }]);
  assert.equal(db.calls.length, 2);
  assert.deepEqual(db.calls[0], {
    sql: "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    params: ["16:production_radar|BINANCE:BTCUSDT:PERP"],
    transaction: 1,
  });
  assert.match(db.calls[1].sql, /^SELECT \* FROM candidate_authority\.open_or_refresh_episode_v1\(/);
  assert.doesNotMatch(db.calls[1].sql, /BTCUSDT|scan-cycle-1|quiet_compression/);
  assert.deepEqual(db.calls[1].params.slice(0, 10), [
    "production_radar",
    "episode-new",
    "event-new",
    "BINANCE:BTCUSDT:PERP",
    openCommand.venueContext,
    openCommand.firstSeenAt,
    openCommand.lastSeenAt,
    null,
    null,
    ["quiet_compression"],
  ]);
  assert.equal(db.calls[1].params.length, 19);
  assert.match(String(db.calls[1].params[18]), /^sha256:[a-f0-9]{64}$/);
});

test("openOrRefreshEpisode keeps the command hash stable for an idempotent retry", async () => {
  const db = adapter((sql) => sql.includes("open_or_refresh_episode_v1")
    ? [{ result_episode_id: "episode-1", created: false, result_row_version: 2 }]
    : []);
  const service = new CandidateEpisodeService(db.value, {
    generateId: ids("episode-a", "event-a", "episode-b", "event-b"),
  });

  await service.openOrRefreshEpisode(openCommand);
  await service.openOrRefreshEpisode(openCommand);

  const procedureCalls = db.calls.filter((call) => call.sql.includes("open_or_refresh_episode_v1"));
  assert.equal(procedureCalls.length, 2);
  assert.equal(procedureCalls[0].params[18], procedureCalls[1].params[18]);
  assert.notEqual(procedureCalls[0].params[1], procedureCalls[1].params[1]);
  assert.equal(procedureCalls[0].params[17], procedureCalls[1].params[17]);
});

test("closeEpisode uses serializable locking and the approved close reason enum", async () => {
  const db = adapter((sql) => sql.includes("close_episode_v1")
    ? [{ result_episode_id: "episode-1", result_row_version: "7" }]
    : []);
  const service = new CandidateEpisodeService(db.value, { generateId: ids("close-event") });

  const result = await service.closeEpisode({
    scope: "production_radar",
    episodeId: "episode-1",
    canonicalInstrumentId: "BINANCE:BTCUSDT:PERP",
    closedAt: "2026-07-10T09:00:00.000Z",
    closedReason: "structure_invalidated",
    releaseId: "release-wp-g0-2",
    runtimeId: "candidate-rehearsal",
    idempotencyKey: "close:episode-1:structure",
  });

  assert.deepEqual(result, { episodeId: "episode-1", rowVersion: 7 });
  assert.equal(db.options[0].isolation, "serializable");
  assert.equal(db.calls[0].sql, "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))");
  assert.match(db.calls[1].sql, /^SELECT \* FROM candidate_authority\.close_episode_v1\(/);
  assert.deepEqual(db.calls[1].params.slice(0, 7), [
    "production_radar",
    "episode-1",
    "close-event",
    "2026-07-10T09:00:00.000Z",
    "structure_invalidated",
    "release-wp-g0-2",
    "candidate-rehearsal",
  ]);
  assert.equal(db.calls[1].params.length, 9);
});

test("reverseDirectionEpisode closes with direction_reversed then creates the child in one transaction", async () => {
  const db = adapter((sql) => {
    if (sql.includes("assert_episode_direction_v1")) {
      return [{ assert_episode_direction_v1: null }];
    }
    if (sql.includes("close_episode_v1")) {
      return [{ result_episode_id: "episode-parent", result_row_version: 5 }];
    }
    if (sql.includes("open_or_refresh_episode_v1")) {
      return [{ result_episode_id: "episode-child", created: true, result_row_version: 1 }];
    }
    return [];
  });
  const service = new CandidateEpisodeService(db.value, {
    generateId: ids("close-event", "episode-child", "open-event"),
  });

  const result = await service.reverseDirectionEpisode({
    scope: "production_radar",
    episodeId: "episode-parent",
    canonicalInstrumentId: "BINANCE:BTCUSDT:PERP",
    previousDirectionState: "long",
    closedAt: "2026-07-10T09:00:00.000Z",
    closeIdempotencyKey: "reverse-close:episode-parent",
    replacement: {
      ...openCommand,
      directionState: "short",
      firstSeenAt: "2026-07-10T09:00:00.000Z",
      lastSeenAt: "2026-07-10T09:00:00.000Z",
      idempotencyKey: "reverse-open:episode-parent",
    },
  });

  assert.deepEqual(result, {
    closed: { episodeId: "episode-parent", rowVersion: 5 },
    opened: { episodeId: "episode-child", created: true, rowVersion: 1 },
  });
  assert.equal(db.options.length, 1);
  assert.deepEqual(new Set(db.calls.map((call) => call.transaction)), new Set([1]));
  assert.equal(db.calls.filter((call) => call.sql.includes("pg_advisory_xact_lock")).length, 1);
  const closeIndex = db.calls.findIndex((call) => call.sql.includes("close_episode_v1"));
  const openIndex = db.calls.findIndex((call) => call.sql.includes("open_or_refresh_episode_v1"));
  assert.ok(closeIndex > 0);
  assert.ok(openIndex > closeIndex);
  assert.equal(db.calls[closeIndex].params[4], "direction_reversed");
  assert.equal(db.calls[openIndex].params[12], "short");
});

test("reverseDirectionEpisode verifies the persisted direction before closing", async () => {
  const db = adapter((sql) => {
    if (sql.includes("assert_episode_direction_v1")) {
      throw new Error("The persisted Episode direction does not match the reversal command");
    }
    if (sql.includes("close_episode_v1")) {
      return [{ result_episode_id: "episode-parent", result_row_version: 5 }];
    }
    if (sql.includes("open_or_refresh_episode_v1")) {
      return [{ result_episode_id: "episode-child", created: true, result_row_version: 1 }];
    }
    return [];
  });
  const service = new CandidateEpisodeService(db.value, {
    generateId: ids("close-event", "episode-child", "open-event"),
  });

  await assert.rejects(
    service.reverseDirectionEpisode({
      scope: "production_radar",
      episodeId: "episode-parent",
      canonicalInstrumentId: "BINANCE:BTCUSDT:PERP",
      previousDirectionState: "long",
      closedAt: "2026-07-10T09:00:00.000Z",
      closeIdempotencyKey: "reverse-close:episode-parent",
      replacement: {
        ...openCommand,
        directionState: "short",
        idempotencyKey: "reverse-open:episode-parent",
      },
    }),
    /persisted Episode direction does not match/,
  );
  assert.equal(db.calls.filter((call) => call.sql.includes("close_episode_v1")).length, 0);
  assert.equal(db.calls.filter((call) => call.sql.includes("open_or_refresh_episode_v1")).length, 0);
});

test("reverseDirectionEpisode rejects anything except a long-short inversion before opening a transaction", async () => {
  const db = adapter();
  const service = new CandidateEpisodeService(db.value, { generateId: ids() });

  await assert.rejects(
    service.reverseDirectionEpisode({
      scope: "production_radar",
      episodeId: "episode-parent",
      canonicalInstrumentId: "BINANCE:BTCUSDT:PERP",
      previousDirectionState: "long",
      closedAt: "2026-07-10T09:00:00.000Z",
      closeIdempotencyKey: "reverse-close:episode-parent",
      replacement: { ...openCommand, directionState: "long" },
    }),
    /long-short inversion/,
  );
  assert.equal(db.options.length, 0);
});

const activeRow: CandidateEpisodeRow = {
  episode_id: "episode-1",
  canonical_instrument_id: "BINANCE:BTCUSDT:PERP",
  venue_context: { venue: "binance" },
  first_seen_at: new Date("2026-07-10T08:00:00.000Z"),
  last_seen_at: "2026-07-10T08:01:00.000Z",
  observation_price: null,
  observation_price_fact_id: null,
  discovery_reasons: ["quiet_compression"],
  priority_tier: "P1",
  lifecycle: "discovered",
  maturity: "deep_candidate",
  direction_state: "unknown",
  expires_at: null,
  closed_at: null,
  closed_reason: null,
  parent_episode_id: null,
  release_id: "release-wp-g0-2",
  source_scan_cycle_id: "scan-cycle-1",
  row_version: "1",
};

test("getActiveEpisode and getEpisodeHistory map authoritative rows without replacing null facts", async () => {
  const closedRow: CandidateEpisodeRow = {
    ...activeRow,
    episode_id: "episode-0",
    lifecycle: "closed",
    closed_at: new Date("2026-07-09T09:00:00.000Z"),
    closed_reason: "expired",
    row_version: 3,
  };
  const db = adapter((sql) => sql.includes("closed_at IS NULL") ? [activeRow] : [closedRow]);
  const service = new CandidateEpisodeService(db.value, { generateId: ids() });

  const active = await service.getActiveEpisode({
    scope: "production_radar",
    canonicalInstrumentId: "BINANCE:BTCUSDT:PERP",
  });
  const history = await service.getEpisodeHistory({
    scope: "production_radar",
    canonicalInstrumentId: "BINANCE:BTCUSDT:PERP",
    limit: 25,
  });

  assert.equal(active?.firstSeenAt, "2026-07-10T08:00:00.000Z");
  assert.equal(active?.observationPrice, null);
  assert.equal(active?.observationPriceFactId, null);
  assert.equal(active?.directionState, "unknown");
  assert.equal(history[0].closedReason, "expired");
  assert.equal(history[0].closedAt, "2026-07-09T09:00:00.000Z");
  assert.deepEqual(db.calls.at(-1)?.params, ["production_radar", "BINANCE:BTCUSDT:PERP", 25]);
  assert.ok(db.options.every((option) => option.readOnly && option.isolation === "serializable"));
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(entryPath) : [entryPath];
  }));
  return files.flat().filter((file) => /\.[cm]?[jt]sx?$/.test(file));
}

test("dormant CandidateEpisodeService is not imported by production API routes", async () => {
  const apiDirectory = path.join(process.cwd(), "src", "app", "api");
  const files = await sourceFiles(apiDirectory);
  const imports = await Promise.all(files.map(async (file) => ({
    file,
    source: await readFile(file, "utf8"),
  })));

  assert.deepEqual(
    imports.filter(({ source }) => /candidate-episode-service/.test(source)).map(({ file }) => file),
    [],
  );
});
