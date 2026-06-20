import assert from "node:assert/strict";
import test from "node:test";
import { createConfiguredSqlClient } from "./configured-sql-client";

test("createConfiguredSqlClient stays inactive without a database URL", () => {
  const bundle = createConfiguredSqlClient({});

  assert.equal(bundle.active, false);
  assert.equal(bundle.driver, "none");
  assert.equal(bundle.reason, "database_url_missing");
});

test("createConfiguredSqlClient leaves unsupported drivers inactive", () => {
  const bundle = createConfiguredSqlClient({
    env: {
      DATABASE_DRIVER: "supabase",
      DATABASE_URL: "postgresql://user:pass@example.supabase.co/postgres",
    },
  });

  assert.equal(bundle.active, false);
  assert.equal(bundle.driver, "supabase");
  assert.equal(bundle.reason, "driver_not_supported");
});

test("createConfiguredSqlClient selects the Neon adapter for Neon drivers", () => {
  const bundle = createConfiguredSqlClient({
    env: {
      DATABASE_DRIVER: "neon",
      DATABASE_URL: "postgresql://user:pass@example.neon.tech/neondb",
    },
  });

  assert.equal(bundle.active, true);
  assert.equal(bundle.driver, "neon");
  assert.equal(bundle.connectionStringEnv, "DATABASE_URL");
});

test("createConfiguredSqlClient selects the Postgres adapter for self-hosted Postgres drivers", () => {
  const bundle = createConfiguredSqlClient({
    env: {
      DATABASE_DRIVER: "postgres",
      DATABASE_URL: "postgresql://chuan:secret@postgres:5432/chuan_market_radar",
    },
  });

  assert.equal(bundle.active, true);
  assert.equal(bundle.driver, "postgres");
  assert.equal(bundle.connectionStringEnv, "DATABASE_URL");
});
