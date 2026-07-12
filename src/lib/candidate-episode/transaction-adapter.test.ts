import assert from "node:assert/strict";
import test from "node:test";
import {
  createPostgresTransactionAdapter,
  withInstrumentLock,
  type PostgresTransactionConnection,
  type PostgresTransactionPool,
} from "./transaction-adapter";

type Call = { params: unknown[]; sql: string };

function connection(
  calls: Call[],
  options: {
    failRollback?: boolean;
    workRows?: unknown[];
  } = {},
): PostgresTransactionConnection & { releases: unknown[] } {
  const releases: unknown[] = [];

  return {
    releases,
    async query<T = unknown>(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });

      if (options.failRollback && sql === "ROLLBACK") {
        throw new Error("rollback failed");
      }

      return { rows: (options.workRows ?? []) as T[] };
    },
    release(error?: Error | boolean) {
      releases.push(error);
    },
  };
}

test("withTransaction keeps begin, work and commit on one checked-out connection", async () => {
  const calls: Call[] = [];
  const client = connection(calls, { workRows: [{ ok: true }] });
  let connectCount = 0;
  const pool: PostgresTransactionPool = {
    async connect() {
      connectCount += 1;
      return client;
    },
  };
  const adapter = createPostgresTransactionAdapter(pool);

  const result = await adapter.withTransaction(
    {
      idleInTransactionTimeoutMs: 30_000,
      isolation: "serializable",
      lockTimeoutMs: 1_000,
      statementTimeoutMs: 30_000,
    },
    async (tx) => (await tx.query<{ ok: boolean }>("SELECT synthetic_work($1)", ["value"])).rows[0],
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(connectCount, 1);
  assert.deepEqual(calls.map((call) => call.sql), [
    "BEGIN",
    "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE READ WRITE",
    "SELECT set_config('lock_timeout', $1, true)",
    "SELECT set_config('statement_timeout', $1, true)",
    "SELECT set_config('idle_in_transaction_session_timeout', $1, true)",
    "SELECT synthetic_work($1)",
    "COMMIT",
  ]);
  assert.deepEqual(client.releases, [undefined]);
});

test("withTransaction applies an allowlisted local role before timeouts and work", async () => {
  const calls: Call[] = [];
  const client = connection(calls);
  const adapter = createPostgresTransactionAdapter(
    { async connect() { return client; } },
    { role: "candidate_application_writer_role" },
  );

  await adapter.withTransaction({}, (tx) => tx.query("SELECT current_user"));

  assert.deepEqual(calls.map((call) => call.sql), [
    "BEGIN",
    "SET TRANSACTION ISOLATION LEVEL READ COMMITTED READ WRITE",
    'SET LOCAL ROLE "candidate_application_writer_role"',
    "SELECT set_config('lock_timeout', $1, true)",
    "SELECT set_config('statement_timeout', $1, true)",
    "SELECT set_config('idle_in_transaction_session_timeout', $1, true)",
    "SELECT current_user",
    "COMMIT",
  ]);
});

test("transaction role rejects unsafe identifiers before checking out a connection", () => {
  let connected = false;
  const pool: PostgresTransactionPool = {
    async connect() {
      connected = true;
      return connection([]);
    },
  };

  assert.throws(
    () => createPostgresTransactionAdapter(pool, { role: "writer; SET ROLE superuser" }),
    /Invalid PostgreSQL transaction role/,
  );
  assert.equal(connected, false);
});

test("withTransaction rolls back and releases when work fails", async () => {
  const calls: Call[] = [];
  const client = connection(calls);
  const adapter = createPostgresTransactionAdapter({ async connect() { return client; } });

  await assert.rejects(
    adapter.withTransaction({}, async () => {
      throw new Error("work failed");
    }),
    /work failed/,
  );

  assert.deepEqual(calls.map((call) => call.sql), [
    "BEGIN",
    "SET TRANSACTION ISOLATION LEVEL READ COMMITTED READ WRITE",
    "SELECT set_config('lock_timeout', $1, true)",
    "SELECT set_config('statement_timeout', $1, true)",
    "SELECT set_config('idle_in_transaction_session_timeout', $1, true)",
    "ROLLBACK",
  ]);
  assert.deepEqual(client.releases, [undefined]);
});

test("withTransaction destroys an uncertain connection when rollback fails", async () => {
  const calls: Call[] = [];
  const client = connection(calls, { failRollback: true });
  const adapter = createPostgresTransactionAdapter({ async connect() { return client; } });

  await assert.rejects(
    adapter.withTransaction({}, async () => {
      throw new Error("work failed");
    }),
    /work failed/,
  );

  assert.equal(client.releases.length, 1);
  assert.ok(client.releases[0] instanceof Error);
});

test("transaction savepoints roll back only nested work", async () => {
  const calls: Call[] = [];
  const client = connection(calls);
  const adapter = createPostgresTransactionAdapter({ async connect() { return client; } });

  await adapter.withTransaction({}, async (tx) => {
    await assert.rejects(
      tx.withSavepoint(async () => {
        throw new Error("nested failure");
      }),
      /nested failure/,
    );
    await tx.query("SELECT still_alive");
  });

  assert.ok(calls.some((call) => call.sql === "SAVEPOINT candidate_sp_1"));
  assert.ok(calls.some((call) => call.sql === "ROLLBACK TO SAVEPOINT candidate_sp_1"));
  assert.ok(calls.some((call) => call.sql === "RELEASE SAVEPOINT candidate_sp_1"));
  assert.ok(calls.some((call) => call.sql === "SELECT still_alive"));
});

test("serialization failures retry with a fresh checked-out connection", async () => {
  const allCalls: Call[][] = [[], []];
  const clients = allCalls.map((calls) => connection(calls));
  let index = 0;
  const adapter = createPostgresTransactionAdapter({
    async connect() {
      return clients[index++];
    },
  });
  let attempts = 0;

  const value = await adapter.withTransaction({ maxRetries: 1 }, async () => {
    attempts += 1;
    if (attempts === 1) {
      throw Object.assign(new Error("serialization"), { code: "40001" });
    }
    return "ok";
  });

  assert.equal(value, "ok");
  assert.equal(index, 2);
  assert.deepEqual(clients.map((client) => client.releases.length), [1, 1]);
});

test("aborted work fails before a connection is checked out", async () => {
  const controller = new AbortController();
  controller.abort();
  let connected = false;
  const adapter = createPostgresTransactionAdapter({
    async connect() {
      connected = true;
      return connection([]);
    },
  });

  await assert.rejects(adapter.withTransaction({ signal: controller.signal }, async () => undefined), {
    name: "AbortError",
  });
  assert.equal(connected, false);
});

test("instrument lock is parameterized and scoped", async () => {
  const calls: Call[] = [];
  const tx = connection(calls) as PostgresTransactionConnection;

  const value = await withInstrumentLock(tx, "production_radar", "BINANCE:BTCUSDT:PERP", async () => "locked");

  assert.equal(value, "locked");
  assert.deepEqual(calls[0], {
    sql: "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    params: ["16:production_radar|BINANCE:BTCUSDT:PERP"],
  });
});
