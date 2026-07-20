import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { parseM1CollectorProcessConfig } from "./m1-collector-worker";

const SOURCE_COMMIT = "a".repeat(40);

function validEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    V2_M1_COLLECTOR_AUTHORITY_MODE: "NO_AUTHORITY",
    V2_M1_COLLECTOR_AUTOMATIC_TRADING_ALLOWED: "false",
    V2_M1_COLLECTOR_CYCLE_INTERVAL_MS: "5000",
    V2_M1_COLLECTOR_MAX_FACT_AGE_MS: "60000",
    V2_M1_COLLECTOR_MAX_SEQUENCE_GAP_MS: "300000",
    V2_M1_COLLECTOR_POLICY_VERSION: "m1-live-linear-usdt-perpetual.v1",
    V2_M1_COLLECTOR_READER_DATABASE_URL:
      "postgresql://collector_reader@db.internal/radar",
    V2_M1_COLLECTOR_RECONCILIATION_INTERVAL_MS: "86400000",
    V2_M1_COLLECTOR_RELEASE_ID: `m1-collector:${SOURCE_COMMIT}`,
    V2_M1_COLLECTOR_RETENTION_MS: "63072000000",
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
  assert.equal(config.cycleIntervalMs, 5_000);
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.runtimeConfig), true);
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
