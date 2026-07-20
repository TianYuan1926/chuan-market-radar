import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import {
  FullScopeProviderHarness,
  MutableCollectorClock,
} from "../../../testing/m1-collector-harness";
import { M1_STORE_IDENTITIES, type M1SqlPool } from "../store/contracts";
import { M1PostgresArtifactStore } from "../store/postgres-artifact-store";
import {
  M1_STORE_POSTGRES_MIGRATION_SQL,
  M1_STORE_POSTGRES_SCHEMA,
} from "../store/postgres-schema";
import { M1_FACT_RETENTION_IDENTITY } from "../store/partitioned-fact-contract";
import {
  M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL,
} from "../store/partitioned-fact-postgres-schema";
import { createPublicRestCollectorAdapterRuntime } from "./adapters/public-rest-adapter-runtime";
import { buildM1CollectorCheckpoint } from "./checkpoint-contract";
import {
  M1_COLLECTOR_CHECKPOINT_POSTGRES_MIGRATION_CHECKSUM,
  M1_COLLECTOR_CHECKPOINT_POSTGRES_MIGRATION_SQL,
} from "./checkpoint-postgres-schema";
import { M1CollectorRuntime } from "./collector-runtime";
import {
  M1PostgresCollectorCheckpointStore,
} from "./postgres-checkpoint-store";
import type { CollectorRuntimeConfig } from "./contracts";

const databaseUrl = process.env.V2_M1_REHEARSAL_DATABASE_URL;
const sourceCommit = process.env.V2_M1_REHEARSAL_SOURCE_COMMIT ??
  "collector-checkpoint-rehearsal-unbound";
const WRITER_LOGIN = "v2_m1_checkpoint_rehearsal_writer_login";
const READER_LOGIN = "v2_m1_checkpoint_rehearsal_reader_login";
const DAY_MS = 24 * 60 * 60 * 1_000;

function roleUrl(base: string, login: string): string {
  const url = new URL(base);
  url.username = login;
  url.password = "";
  return url.toString();
}

function runtimeConfig(): CollectorRuntimeConfig {
  return {
    maxFactAgeMs: 5_000,
    maxSequenceGapMs: 60_000,
    policyVersion: "m1-full-linear-usdt-perpetual.v1",
    reconciliationIntervalMs: DAY_MS,
    releaseId: `m1-5-checkpoint:${sourceCommit.slice(0, 12)}`,
    retentionMs: 730 * DAY_MS,
  };
}

function rolePool(base: string, login: string, role: string): Pool {
  return new Pool({
    connectionString: roleUrl(base, login),
    max: 2,
    options: `-c role=${role}`,
  });
}

test(
  "restores an exact append-only collector checkpoint after a PostgreSQL process boundary",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);
    const admin = new Pool({ connectionString: databaseUrl, max: 2 });
    let writer: Pool | undefined;
    let reader: Pool | undefined;
    let restartedWriter: Pool | undefined;
    let restartedReader: Pool | undefined;
    try {
      await admin.query(M1_STORE_POSTGRES_MIGRATION_SQL);
      await admin.query(M1_COLLECTOR_CHECKPOINT_POSTGRES_MIGRATION_SQL);
      await admin.query(M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL);
      await admin.query(`
        SET ROLE ${M1_FACT_RETENTION_IDENTITY};
        SELECT * FROM ${M1_STORE_POSTGRES_SCHEMA}.ensure_market_fact_partitions(
          '2026-01-15'::date,
          '2026-01-16'::date,
          'm1-5-checkpoint-rehearsal'
        );
        RESET ROLE;
      `);
      await admin.query(`
        CREATE ROLE ${WRITER_LOGIN} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
        CREATE ROLE ${READER_LOGIN} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
        GRANT ${M1_STORE_IDENTITIES.writer} TO ${WRITER_LOGIN};
        GRANT ${M1_STORE_IDENTITIES.reader} TO ${READER_LOGIN};
      `);
      writer = rolePool(databaseUrl, WRITER_LOGIN, M1_STORE_IDENTITIES.writer);
      reader = rolePool(databaseUrl, READER_LOGIN, M1_STORE_IDENTITIES.reader);
      const clock = new MutableCollectorClock("2026-01-15T00:00:00.500Z");
      const provider = new FullScopeProviderHarness(clock);
      const config = runtimeConfig();
      const artifactStore = new M1PostgresArtifactStore(
        writer as unknown as M1SqlPool,
      );
      const checkpointStore = new M1PostgresCollectorCheckpointStore({
        readerPool: reader as unknown as M1SqlPool,
        writerPool: writer as unknown as M1SqlPool,
      });
      const runtime = new M1CollectorRuntime({
        adapterRuntime: createPublicRestCollectorAdapterRuntime({
          clock,
          transport: provider.transport,
        }),
        clock,
        config,
        store: artifactStore,
      });

      const first = await runtime.runNextCycle();
      const firstCheckpoint = buildM1CollectorCheckpoint({
        result: first,
        runtimeConfig: config,
      });
      const inserted = await checkpointStore.appendCheckpoint(firstCheckpoint);
      const replayed = await checkpointStore.appendCheckpoint(firstCheckpoint);
      assert.equal(inserted.status, "INSERTED");
      assert.equal(replayed.status, "IDEMPOTENT_REPLAY");

      const migration = await admin.query<{ checksum: string }>(`
        SELECT checksum
        FROM ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations
        WHERE version = 'v2-m1-collector-checkpoint.v1'
      `);
      assert.equal(
        migration.rows[0]?.checksum,
        M1_COLLECTOR_CHECKPOINT_POSTGRES_MIGRATION_CHECKSUM,
      );
      const counts = await admin.query<{ count: string }>(`
        SELECT count(*)::text AS count
        FROM ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger
      `);
      assert.equal(counts.rows[0]?.count, "1");

      await assert.rejects(
        () => admin.query(`
          UPDATE ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger
          SET runtime_state = 'DEGRADED'
        `),
        /append-only ledger rows cannot be updated or deleted/u,
      );
      await assert.rejects(
        () => reader!.query(`
          INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger
          DEFAULT VALUES
        `),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "42501",
      );
      await assert.rejects(
        () => writer!.query(`
          INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger (
            checkpoint_id, idempotency_key, schema_version, release_id,
            runtime_config_digest, cycle_id, next_cycle_ordinal, runtime_state,
            universe_artifact_name, universe_snapshot_id,
            fact_quality_artifact_name, fact_quality_snapshot_id,
            source_cutoff, generated_at, last_catalog_at, next_reconciliation_at,
            sequence_digest, checkpoint_digest, authority_mode,
            automatic_trading_allowed, retain_until, payload
          )
          SELECT
            checkpoint_id || ':ahead', idempotency_key || ':ahead',
            schema_version, release_id, runtime_config_digest,
            cycle_id || ':ahead', next_cycle_ordinal + 1, runtime_state,
            universe_artifact_name, 'missing-universe-snapshot',
            fact_quality_artifact_name, fact_quality_snapshot_id,
            source_cutoff, generated_at, last_catalog_at, next_reconciliation_at,
            sequence_digest, checkpoint_digest, authority_mode,
            automatic_trading_allowed, retain_until,
            payload || jsonb_build_object(
              'checkpointId', checkpoint_id || ':ahead',
              'cycleId', cycle_id || ':ahead',
              'nextCycleOrdinal', next_cycle_ordinal + 1,
              'universeSnapshotId', 'missing-universe-snapshot'
            )
          FROM ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger
          LIMIT 1
        `),
        /references missing artifacts/u,
      );

      await writer.end();
      writer = undefined;
      await reader.end();
      reader = undefined;

      restartedWriter = rolePool(
        databaseUrl,
        WRITER_LOGIN,
        M1_STORE_IDENTITIES.writer,
      );
      restartedReader = rolePool(
        databaseUrl,
        READER_LOGIN,
        M1_STORE_IDENTITIES.reader,
      );
      const restartedCheckpointStore =
        new M1PostgresCollectorCheckpointStore({
          readerPool: restartedReader as unknown as M1SqlPool,
          writerPool: restartedWriter as unknown as M1SqlPool,
        });
      const restored = await restartedCheckpointStore.loadLatest(config);
      assert.ok(restored);
      assert.equal(restored.stored.checkpoint.checkpointId, firstCheckpoint.checkpointId);
      assert.equal(restored.durableState.nextCycleOrdinal, 1);
      assert.equal(
        await restartedCheckpointStore.loadLatest({
          ...config,
          releaseId: "different-release-cold-start",
        }),
        null,
      );
      await assert.rejects(
        () => restartedCheckpointStore.loadLatest({
          ...config,
          maxFactAgeMs: config.maxFactAgeMs + 1,
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "CHECKPOINT_CONFIGURATION_MISMATCH",
      );

      clock.advance(1_000);
      const restartedProvider = new FullScopeProviderHarness(clock);
      const restartedRuntime = new M1CollectorRuntime({
        adapterRuntime: createPublicRestCollectorAdapterRuntime({
          clock,
          transport: restartedProvider.transport,
        }),
        clock,
        config,
        restoredState: restored.durableState,
        store: new M1PostgresArtifactStore(
          restartedWriter as unknown as M1SqlPool,
        ),
      });
      const second = await restartedRuntime.runNextCycle();
      assert.equal(second.telemetry.trigger, "INCREMENTAL_MARK_PRICE");
      assert.equal(second.telemetry.state, "READY");
      assert.equal(
        restartedProvider.calls.filter((call) => call.operation === "CATALOG").length,
        0,
      );
      const secondCheckpoint = buildM1CollectorCheckpoint({
        result: second,
        runtimeConfig: config,
      });
      await restartedCheckpointStore.appendCheckpoint(secondCheckpoint);
      const finalCounts = await admin.query<{ count: string }>(`
        SELECT count(*)::text AS count
        FROM ${M1_STORE_POSTGRES_SCHEMA}.collector_cycle_checkpoint_ledger
      `);
      assert.equal(finalCounts.rows[0]?.count, "2");
    } finally {
      await writer?.end();
      await reader?.end();
      await restartedWriter?.end();
      await restartedReader?.end();
      try {
        await admin.query(`DROP ROLE IF EXISTS ${WRITER_LOGIN}`);
        await admin.query(`DROP ROLE IF EXISTS ${READER_LOGIN}`);
      } finally {
        await admin.end();
      }
    }
  },
);
