import assert from "node:assert/strict";
import test from "node:test";
import {
  M1_PARTITIONED_FACT_POSTGRES_MIGRATION_CHECKSUM,
  M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL,
} from "./partitioned-fact-postgres-schema";
import { M1_STORE_POSTGRES_MIGRATION_CHECKSUM } from "./postgres-schema";

test("keeps the reviewed base migration immutable", () => {
  assert.equal(
    M1_STORE_POSTGRES_MIGRATION_CHECKSUM,
    "sha256:88915ee4a13d14eb03eae6172bb57a52b5929f69b4c4f7232dcf987041644f51",
  );
});

test("freezes partition, identity, backup and retention boundaries", () => {
  assert.match(
    M1_PARTITIONED_FACT_POSTGRES_MIGRATION_CHECKSUM,
    /^sha256:[0-9a-f]{64}$/u,
  );
  for (const required of [
    "PARTITION BY RANGE (source_cutoff)",
    "point_in_time_market_fact_active_identity_registry",
    "market_fact_backup_evidence_ledger",
    "market_fact_partition_event_ledger",
    "market_fact_retention_run_ledger",
    "ensure_market_fact_partitions",
    "inspect_market_fact_partitions",
    "drop_expired_market_fact_partitions",
    "reject_unpartitioned_market_fact_insert",
    "partitioned_fact_legacy_identity_conflict",
    "active replay evidence still references",
    "verified backup evidence does not cover",
    "ACCESS EXCLUSIVE MODE",
    "SECURITY DEFINER",
  ]) {
    assert.ok(
      M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL.includes(required),
      required,
    );
  }
  assert.equal(
    M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL.includes("DEFAULT PARTITION"),
    false,
  );
  assert.equal(
    /DROP TABLE[^;]+CASCADE/iu.test(M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL),
    false,
  );
});
