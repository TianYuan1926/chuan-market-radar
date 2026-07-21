import assert from "node:assert/strict";
import test from "node:test";
import {
  M1_PARTITIONED_FACT_SIX_HOUR_POSTGRES_MIGRATION_CHECKSUM,
  M1_PARTITIONED_FACT_SIX_HOUR_POSTGRES_MIGRATION_SQL,
} from "./partitioned-fact-postgres-six-hour-schema";

test("freezes the additive six-hour partition migration boundary", () => {
  assert.match(
    M1_PARTITIONED_FACT_SIX_HOUR_POSTGRES_MIGRATION_CHECKSUM,
    /^sha256:[0-9a-f]{64}$/u,
  );
  assert.equal(
    M1_PARTITIONED_FACT_SIX_HOUR_POSTGRES_MIGRATION_CHECKSUM,
    "sha256:17cf407811a3f3518cfd7bf15312dda771e0709d8eb23a62b8bcc56f7c14b68e",
  );
  for (const required of [
    "v2-m1-partitioned-fact-store.v2",
    "v2-m1-fact-six-hour-partition.v2",
    "interval '6 hours'",
    "YYYYMMDD_HH24",
    "p_cutoff_at timestamptz",
    "cutoff_at TYPE timestamptz",
    "active replay evidence still references",
    "verified backup evidence does not cover",
    "ACCESS EXCLUSIVE MODE",
    "requires an empty v1 partition state",
    "SECURITY DEFINER",
  ]) {
    assert.ok(
      M1_PARTITIONED_FACT_SIX_HOUR_POSTGRES_MIGRATION_SQL.includes(required),
      required,
    );
  }
  assert.equal(
    M1_PARTITIONED_FACT_SIX_HOUR_POSTGRES_MIGRATION_SQL.includes("DEFAULT PARTITION"),
    false,
  );
  assert.equal(
    /DROP TABLE[^;]+CASCADE/iu.test(
      M1_PARTITIONED_FACT_SIX_HOUR_POSTGRES_MIGRATION_SQL,
    ),
    false,
  );
});
