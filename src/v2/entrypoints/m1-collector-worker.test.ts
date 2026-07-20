import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { M1SqlPool } from "../modules/market-fact/store/contracts";
import {
  loadM1CollectorProcessConfig,
  parseM1CollectorProcessConfig,
  verifyM1CollectorDatabaseIdentities,
} from "./m1-collector-worker";

const SOURCE_COMMIT = "a".repeat(40);

function validEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    V2_M1_COLLECTOR_AUTHORITY_MODE: "NO_AUTHORITY",
    V2_M1_COLLECTOR_AUTOMATIC_TRADING_ALLOWED: "false",
    V2_M1_COLLECTOR_CYCLE_INTERVAL_MS: "60000",
    V2_M1_COLLECTOR_DATABASE_HOST: "db.internal",
    V2_M1_COLLECTOR_DATABASE_NAME: "radar",
    V2_M1_COLLECTOR_MAX_CYCLES: "31",
    V2_M1_COLLECTOR_MAX_FACT_AGE_MS: "60000",
    V2_M1_COLLECTOR_MAX_SEQUENCE_GAP_MS: "300000",
    V2_M1_COLLECTOR_POLICY_VERSION: "m1-live-linear-usdt-perpetual.v1",
    V2_M1_COLLECTOR_READER_DATABASE_URL:
      "postgresql://collector_reader@db.internal/radar",
    V2_M1_COLLECTOR_RECONCILIATION_INTERVAL_MS: "3600000",
    V2_M1_COLLECTOR_RELEASE_ID: `m1-collector:${SOURCE_COMMIT}`,
    V2_M1_COLLECTOR_RETENTION_MS: "604800000",
    V2_M1_COLLECTOR_RUN_PROFILE: "EARLY_30_MINUTES",
    V2_M1_COLLECTOR_SOURCE_COMMIT: SOURCE_COMMIT,
    V2_M1_COLLECTOR_WRITER_DATABASE_URL:
      "postgresql://collector_writer@db.internal/radar",
  };
}

test("requires exact no-authority, source-bound and split database identities", () => {
  const config = parseM1CollectorProcessConfig(validEnv());

  assert.equal(config.sourceCommit, SOURCE_COMMIT);
  assert.equal(config.runtimeConfig.releaseId, `m1-collector:${SOURCE_COMMIT}`);
  assert.equal(config.runtimeConfig.maxFactAgeMs, 60_000);
  assert.equal(config.cycleIntervalMs, 60_000);
  assert.equal(config.maxCycles, 31);
  assert.equal(config.runProfile, "EARLY_30_MINUTES");
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.runtimeConfig), true);
});

test("locks each shadow profile to finite schedule and retention bounds", () => {
  const sustained = parseM1CollectorProcessConfig({
    ...validEnv(),
    V2_M1_COLLECTOR_MAX_CYCLES: "1441",
    V2_M1_COLLECTOR_RUN_PROFILE: "SUSTAINED_24_HOURS",
  });
  assert.equal(sustained.maxCycles, 1_441);
  assert.throws(
    () => parseM1CollectorProcessConfig({
      ...validEnv(),
      V2_M1_COLLECTOR_MAX_CYCLES: "1000000",
    }),
    /runtime_bounds_rejected/u,
  );
  assert.throws(
    () => parseM1CollectorProcessConfig({
      ...validEnv(),
      V2_M1_COLLECTOR_RETENTION_MS: "63072000000",
    }),
    /runtime_bounds_rejected/u,
  );
});

test("loads split database URLs from secret files without accepting ambiguity", async () => {
  const env = validEnv();
  delete env.V2_M1_COLLECTOR_WRITER_DATABASE_URL;
  delete env.V2_M1_COLLECTOR_READER_DATABASE_URL;
  env.V2_M1_COLLECTOR_WRITER_DATABASE_URL_FILE = "/run/secrets/writer";
  env.V2_M1_COLLECTOR_READER_DATABASE_URL_FILE = "/run/secrets/reader";
  const values = new Map([
    ["/run/secrets/writer", "postgresql://collector_writer@db.internal/radar\n"],
    ["/run/secrets/reader", "postgresql://collector_reader@db.internal/radar\n"],
  ]);
  const config = await loadM1CollectorProcessConfig(
    env,
    async (path) => values.get(path) ?? "",
  );

  assert.equal(
    config.writerDatabaseUrl,
    "postgresql://collector_writer@db.internal/radar",
  );
  assert.equal(
    config.readerDatabaseUrl,
    "postgresql://collector_reader@db.internal/radar",
  );
  await assert.rejects(
    () => loadM1CollectorProcessConfig({
      ...env,
      V2_M1_COLLECTOR_WRITER_DATABASE_URL:
        "postgresql://another_writer@db.internal/radar",
    }, async (path) => values.get(path) ?? ""),
    /exactly_one_database_secret_source_required/u,
  );
});

test("requires distinct login sessions assuming the exact reader and writer roles", async () => {
  function pool(currentUser: string, sessionUser: string): M1SqlPool {
    return {
      connect: async () => {
        throw new Error("not used");
      },
      query: async () => ({
        rowCount: 1,
        rows: [{ current_user: currentUser, session_user: sessionUser }],
      }),
    } as unknown as M1SqlPool;
  }

  await verifyM1CollectorDatabaseIdentities({
    readerPool: pool("market_radar_v2_m1_reader", "collector_reader_login"),
    writerPool: pool("market_radar_v2_m1_writer", "collector_writer_login"),
  });
  await assert.rejects(
    () => verifyM1CollectorDatabaseIdentities({
      readerPool: pool("market_radar_v2_m1_reader", "shared_login"),
      writerPool: pool("market_radar_v2_m1_writer", "shared_login"),
    }),
    /identity_verification_failed/u,
  );
  await assert.rejects(
    () => verifyM1CollectorDatabaseIdentities({
      readerPool: pool("market_radar_v2_m1_writer", "collector_reader_login"),
      writerPool: pool("market_radar_v2_m1_writer", "collector_writer_login"),
    }),
    /identity_verification_failed/u,
  );
});

test("rejects any attempt to grant authority or automatic trading", () => {
  assert.throws(
    () => parseM1CollectorProcessConfig({
      ...validEnv(),
      V2_M1_COLLECTOR_AUTHORITY_MODE: "PRIMARY",
    }),
    /must_be_no_authority/u,
  );
  assert.throws(
    () => parseM1CollectorProcessConfig({
      ...validEnv(),
      V2_M1_COLLECTOR_AUTOMATIC_TRADING_ALLOWED: "true",
    }),
    /must_remain_disabled/u,
  );
});

test("rejects partial commits, unbound releases and shared database identities", () => {
  assert.throws(
    () => parseM1CollectorProcessConfig({
      ...validEnv(),
      V2_M1_COLLECTOR_SOURCE_COMMIT: "abc123",
    }),
    /must_be_full_sha1/u,
  );
  assert.throws(
    () => parseM1CollectorProcessConfig({
      ...validEnv(),
      V2_M1_COLLECTOR_RELEASE_ID: "unbound-release",
    }),
    /must_bind_source_commit/u,
  );
  assert.throws(
    () => parseM1CollectorProcessConfig({
      ...validEnv(),
      V2_M1_COLLECTOR_READER_DATABASE_URL:
        "postgresql://collector_writer@db.internal/radar",
    }),
    /identities_must_differ/u,
  );
  assert.throws(
    () => parseM1CollectorProcessConfig({
      ...validEnv(),
      V2_M1_COLLECTOR_READER_DATABASE_URL:
        "postgresql://collector_reader@another.internal/radar",
    }),
    /endpoint_binding_rejected/u,
  );
  assert.throws(
    () => parseM1CollectorProcessConfig({
      ...validEnv(),
      NODE_ENV: "production",
    }),
    /endpoint_binding_rejected/u,
  );
});

test("entrypoint never owns migrations or embeds a database credential", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/v2/entrypoints/m1-collector-worker.ts"),
    "utf8",
  );

  assert.equal(source.includes("MIGRATION_SQL"), false);
  assert.equal(source.includes("postgresql://"), false);
  assert.equal(source.includes("DATABASE_URL="), false);
});
