import assert from "node:assert/strict";
import test from "node:test";
import {
  createNeonSqlClient,
  createSqlClientFromNeon,
  type NeonQueryFunction,
} from "./neon-client";

type QueryCall = {
  params: unknown[];
  sql: string;
};

function fakeNeonQuery(rows: unknown[], calls: QueryCall[] = []): NeonQueryFunction {
  return {
    async query<T = unknown>(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });

      return rows as T[];
    },
  };
}

test("createNeonSqlClient stays inactive when no database URL exists", () => {
  const bundle = createNeonSqlClient({});

  assert.equal(bundle.active, false);
  assert.equal(bundle.client, undefined);
  assert.equal(bundle.reason, "database_url_missing");
});

test("createNeonSqlClient requires a Neon driver or Neon hostname before creating a client", () => {
  const bundle = createNeonSqlClient({
    env: {
      DATABASE_DRIVER: "postgres",
      DATABASE_URL: "postgresql://user:pass@example.com/db",
    },
    neonFactory: () => fakeNeonQuery([]),
  });

  assert.equal(bundle.active, false);
  assert.equal(bundle.client, undefined);
  assert.equal(bundle.reason, "driver_not_neon");
});

test("createNeonSqlClient adapts an inferred Neon connection into the repository SqlClient contract", async () => {
  const calls: QueryCall[] = [];
  let capturedConnectionString = "";
  const bundle = createNeonSqlClient({
    env: {
      DATABASE_URL: "postgresql://user:pass@ep-silent-water-123456.us-east-2.aws.neon.tech/neondb",
    },
    neonFactory: (connectionString: string) => {
      capturedConnectionString = connectionString;

      return fakeNeonQuery([{ id: "scan-1", scope: "chuan-public" }], calls);
    },
  });

  const result = await bundle.client?.query("select * from scan_archives where scope = $1", [
    "chuan-public",
  ]);

  assert.equal(bundle.active, true);
  assert.equal(bundle.driver, "neon");
  assert.equal(bundle.connectionStringEnv, "DATABASE_URL");
  assert.equal(capturedConnectionString, "postgresql://user:pass@ep-silent-water-123456.us-east-2.aws.neon.tech/neondb");
  assert.deepEqual(result?.rows, [{ id: "scan-1", scope: "chuan-public" }]);
  assert.deepEqual(calls, [
    {
      sql: "select * from scan_archives where scope = $1",
      params: ["chuan-public"],
    },
  ]);
});

test("createSqlClientFromNeon normalizes fullResults responses when callers opt into metadata", async () => {
  const client = createSqlClientFromNeon({
    async query<T = unknown>() {
      return {
        rows: [{ tier_id: "observer" }] as T[],
      };
    },
  });

  const result = await client.query("select * from rank_profiles", []);

  assert.deepEqual(result.rows, [{ tier_id: "observer" }]);
});
