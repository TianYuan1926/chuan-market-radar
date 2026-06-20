import assert from "node:assert/strict";
import test from "node:test";
import {
  createPostgresSqlClient,
  createSqlClientFromPostgres,
  type PostgresQueryClient,
} from "./postgres-client";

type QueryCall = {
  params: unknown[];
  sql: string;
};

function fakePostgresClient(rows: unknown[], calls: QueryCall[] = []): PostgresQueryClient {
  return {
    async query<T = unknown>(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });

      return {
        rows: rows as T[],
      };
    },
  };
}

test("createPostgresSqlClient stays inactive when no database URL exists", () => {
  const bundle = createPostgresSqlClient({});

  assert.equal(bundle.active, false);
  assert.equal(bundle.client, undefined);
  assert.equal(bundle.reason, "database_url_missing");
});

test("createPostgresSqlClient requires the postgres driver before creating a client", () => {
  const bundle = createPostgresSqlClient({
    env: {
      DATABASE_DRIVER: "neon",
      DATABASE_URL: "postgresql://user:pass@example.neon.tech/neondb",
    },
    poolFactory: () => fakePostgresClient([]),
  });

  assert.equal(bundle.active, false);
  assert.equal(bundle.client, undefined);
  assert.equal(bundle.reason, "driver_not_postgres");
});

test("createPostgresSqlClient adapts a local Postgres pool into the repository SqlClient contract", async () => {
  const calls: QueryCall[] = [];
  let capturedConnectionString = "";
  const bundle = createPostgresSqlClient({
    env: {
      DATABASE_DRIVER: "postgres",
      DATABASE_URL: "postgresql://chuan:secret@postgres:5432/chuan_market_radar",
    },
    poolFactory: (connectionString: string) => {
      capturedConnectionString = connectionString;

      return fakePostgresClient([{ id: "scan-1", scope: "chuan-public" }], calls);
    },
  });

  const result = await bundle.client?.query("select * from scan_archives where scope = $1", [
    "chuan-public",
  ]);

  assert.equal(bundle.active, true);
  assert.equal(bundle.driver, "postgres");
  assert.equal(bundle.connectionStringEnv, "DATABASE_URL");
  assert.equal(capturedConnectionString, "postgresql://chuan:secret@postgres:5432/chuan_market_radar");
  assert.deepEqual(result?.rows, [{ id: "scan-1", scope: "chuan-public" }]);
  assert.deepEqual(calls, [
    {
      sql: "select * from scan_archives where scope = $1",
      params: ["chuan-public"],
    },
  ]);
});

test("createPostgresSqlClient can read POSTGRES_URL when DATABASE_URL is absent", () => {
  let capturedConnectionString = "";
  const bundle = createPostgresSqlClient({
    env: {
      DATABASE_DRIVER: "postgres",
      POSTGRES_URL: "postgresql://chuan:secret@postgres:5432/chuan_market_radar",
    },
    poolFactory: (connectionString: string) => {
      capturedConnectionString = connectionString;

      return fakePostgresClient([]);
    },
  });

  assert.equal(bundle.active, true);
  assert.equal(bundle.connectionStringEnv, "POSTGRES_URL");
  assert.equal(capturedConnectionString, "postgresql://chuan:secret@postgres:5432/chuan_market_radar");
});

test("createSqlClientFromPostgres normalizes query rows", async () => {
  const client = createSqlClientFromPostgres(fakePostgresClient([{ tier_id: "observer" }]));
  const result = await client.query("select * from rank_profiles", []);

  assert.deepEqual(result.rows, [{ tier_id: "observer" }]);
});
