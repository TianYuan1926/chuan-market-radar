import assert from "node:assert/strict";
import test from "node:test";
import type { SchemaMigrationResult } from "./database-client";
import {
  runAdminPersistenceMigration,
  type AdminPersistenceMigrationResponse,
} from "./database-admin";
import type { RuntimeSqlClientBundle } from "./configured-sql-client";
import type { SqlClient } from "./persistence-store";

const readyClient: SqlClient = {
  async query() {
    return { rows: [] };
  },
};

function readySqlBundle(
  driver: RuntimeSqlClientBundle["driver"] = "neon",
  client: SqlClient = readyClient,
): RuntimeSqlClientBundle {
  return {
    active: true,
    client,
    connectionStringEnv: "DATABASE_URL",
    driver,
  };
}

function migrationResult(): SchemaMigrationResult {
  return {
    ok: true,
    tableCount: 3,
    tables: ["journal_events", "scan_archives", "rank_profiles"],
  };
}

function assertError(
  response: AdminPersistenceMigrationResponse,
  expected: {
    error: string;
    status: number;
  },
) {
  assert.equal(response.status, expected.status);
  assert.equal(response.body.ok, false);

  if (response.body.ok === false) {
    assert.equal(response.body.error, expected.error);
  }
}

test("runAdminPersistenceMigration refuses to run when CRON_SECRET is missing", async () => {
  let migrated = false;
  const response = await runAdminPersistenceMigration({
    authorization: "Bearer anything",
    clientBundle: readySqlBundle(),
    env: {
      DATABASE_DRIVER: "neon",
      DATABASE_URL: "postgresql://example.neon.tech/neondb",
    },
    migrate: async () => {
      migrated = true;

      return migrationResult();
    },
  });

  assertError(response, {
    error: "migration_secret_missing",
    status: 503,
  });
  assert.equal(migrated, false);
});

test("runAdminPersistenceMigration rejects requests with the wrong bearer token", async () => {
  let migrated = false;
  const response = await runAdminPersistenceMigration({
    authorization: "Bearer wrong",
    clientBundle: readySqlBundle(),
    env: {
      CRON_SECRET: "correct-secret",
      DATABASE_DRIVER: "neon",
      DATABASE_URL: "postgresql://example.neon.tech/neondb",
    },
    migrate: async () => {
      migrated = true;

      return migrationResult();
    },
  });

  assertError(response, {
    error: "unauthorized",
    status: 401,
  });
  assert.equal(migrated, false);
});

test("runAdminPersistenceMigration reports SQL client as unavailable before touching schema", async () => {
  let migrated = false;
  const response = await runAdminPersistenceMigration({
    authorization: "Bearer correct-secret",
    clientBundle: {
      active: false,
      driver: "none",
      reason: "database_url_missing",
    },
    env: {
      CRON_SECRET: "correct-secret",
    },
    migrate: async () => {
      migrated = true;

      return migrationResult();
    },
  });

  assertError(response, {
    error: "database_unavailable",
    status: 503,
  });
  assert.equal(migrated, false);

  if (response.body.ok === false) {
    assert.equal(response.body.reason, "database_url_missing");
  }
});

test("runAdminPersistenceMigration executes schema migration only after auth and SQL client are ready", async () => {
  const calls: SqlClient[] = [];
  const response = await runAdminPersistenceMigration({
    authorization: "Bearer correct-secret",
    clientBundle: readySqlBundle("neon", readyClient),
    env: {
      CRON_SECRET: "correct-secret",
      DATABASE_DRIVER: "neon",
      DATABASE_URL: "postgresql://example.neon.tech/neondb",
    },
    migrate: async (client: SqlClient) => {
      calls.push(client);

      return migrationResult();
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);

  if (response.body.ok) {
    assert.equal(response.body.database.driver, "neon");
    assert.equal(response.body.database.status, "ready");
    assert.equal(response.body.migration.tableCount, 3);
    assert.deepEqual(response.body.migration.tables, [
      "journal_events",
      "scan_archives",
      "rank_profiles",
    ]);
  }

  assert.deepEqual(calls, [readyClient]);
});

test("runAdminPersistenceMigration supports self-hosted Postgres drivers", async () => {
  const calls: SqlClient[] = [];
  const response = await runAdminPersistenceMigration({
    authorization: "Bearer correct-secret",
    clientBundle: readySqlBundle("postgres", readyClient),
    env: {
      CRON_SECRET: "correct-secret",
      DATABASE_DRIVER: "postgres",
      DATABASE_URL: "postgresql://chuan:secret@postgres:5432/chuan_market_radar",
    },
    migrate: async (client: SqlClient) => {
      calls.push(client);

      return migrationResult();
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);

  if (response.body.ok) {
    assert.equal(response.body.database.driver, "postgres");
    assert.equal(response.body.database.status, "ready");
    assert.equal(response.body.migration.tableCount, 3);
  }

  assert.deepEqual(calls, [readyClient]);
});
