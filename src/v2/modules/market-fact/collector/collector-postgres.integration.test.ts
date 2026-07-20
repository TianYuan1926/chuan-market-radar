import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import {
  FullScopeProviderHarness,
  MutableCollectorClock,
} from "../../../testing/m1-collector-harness";
import {
  M1_STORE_IDENTITIES,
  type M1SqlPool,
} from "../store/contracts";
import { M1PostgresArtifactStore } from "../store/postgres-artifact-store";
import {
  M1_STORE_POSTGRES_MIGRATION_SQL,
  M1_STORE_POSTGRES_SCHEMA,
} from "../store/postgres-schema";
import { M1_FACT_RETENTION_IDENTITY } from "../store/partitioned-fact-contract";
import {
  M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL,
  M1_PARTITIONED_FACT_TABLE,
} from "../store/partitioned-fact-postgres-schema";
import { M1CollectorRuntime } from "./collector-runtime";
import { createPublicRestCollectorAdapterRuntime } from "./adapters/public-rest-adapter-runtime";

const databaseUrl = process.env.V2_M1_REHEARSAL_DATABASE_URL;
const sourceCommit = process.env.V2_M1_REHEARSAL_SOURCE_COMMIT ??
  "collector-rehearsal-unbound";
const WRITER_LOGIN = "v2_m1_collector_rehearsal_writer_login";
const DAY_MS = 24 * 60 * 60 * 1_000;

function roleUrl(base: string, login: string): string {
  const url = new URL(base);
  url.username = login;
  url.password = "";
  return url.toString();
}

test(
  "persists full-scope startup and incremental collector cycles in PostgreSQL 16",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);
    const admin = new Pool({ connectionString: databaseUrl, max: 2 });
    let writer: Pool | undefined;
    try {
      await admin.query(M1_STORE_POSTGRES_MIGRATION_SQL);
      await admin.query(M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL);
      await admin.query(`
        SET ROLE ${M1_FACT_RETENTION_IDENTITY};
        SELECT * FROM ${M1_STORE_POSTGRES_SCHEMA}.ensure_market_fact_partitions(
          '2026-01-15'::date,
          '2026-01-17'::date,
          'm1-4-collector-rehearsal'
        );
        RESET ROLE;
      `);
      await admin.query(`
        CREATE ROLE ${WRITER_LOGIN} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
        GRANT ${M1_STORE_IDENTITIES.writer} TO ${WRITER_LOGIN};
      `);
      writer = new Pool({
        connectionString: roleUrl(databaseUrl, WRITER_LOGIN),
        max: 2,
        options: `-c role=${M1_STORE_IDENTITIES.writer}`,
      });
      const clock = new MutableCollectorClock("2026-01-15T00:00:00.500Z");
      const provider = new FullScopeProviderHarness(clock);
      const store = new M1PostgresArtifactStore(
        writer as unknown as M1SqlPool,
      );
      const runtime = new M1CollectorRuntime({
        adapterRuntime: createPublicRestCollectorAdapterRuntime({
          clock,
          transport: provider.transport,
        }),
        clock,
        config: {
          maxFactAgeMs: 5_000,
          maxSequenceGapMs: 60_000,
          policyVersion: "m1-full-linear-usdt-perpetual.v1",
          reconciliationIntervalMs: DAY_MS,
          releaseId: `m1-4-rehearsal:${sourceCommit.slice(0, 12)}`,
          retentionMs: 730 * DAY_MS,
        },
        store,
      });

      const startup = await runtime.runNextCycle();
      assert.equal(startup.telemetry.state, "READY");
      assert.equal(startup.telemetry.persistence, "INSERTED");
      assert.equal(startup.telemetry.coverage.accountedCount, 21);
      assert.equal(startup.telemetry.coverage.eligibleCount, 15);
      assert.equal(startup.telemetry.coverage.freshCount, 15);

      const firstCounts = await admin.query<{
        artifact_name: string;
        count: string;
      }>(`
        SELECT artifact_name, count(*)::text AS count
        FROM (
          SELECT artifact_name FROM ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger
          UNION ALL
          SELECT artifact_name FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}
        ) AS all_artifacts
        GROUP BY artifact_name
        ORDER BY artifact_name
      `);
      assert.deepEqual(firstCounts.rows, [
        { artifact_name: "EligibleInstrumentSnapshot", count: "1" },
        { artifact_name: "FactQualitySnapshot", count: "1" },
        { artifact_name: "PointInTimeMarketFact", count: "15" },
      ]);

      const persistedDenominator = await admin.query<{
        accounted: number;
        eligible: number;
      }>(`
        SELECT
          jsonb_array_length(payload->'accounting')::integer AS accounted,
          (payload->>'eligibleCount')::integer AS eligible
        FROM (
          SELECT * FROM ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger
          UNION ALL
          SELECT * FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}
        ) AS all_artifacts
        WHERE artifact_name = 'EligibleInstrumentSnapshot'
      `);
      assert.deepEqual(persistedDenominator.rows, [{
        accounted: 21,
        eligible: 15,
      }]);

      clock.advance(1_000);
      const incremental = await runtime.runNextCycle();
      assert.equal(
        incremental.telemetry.trigger,
        "INCREMENTAL_MARK_PRICE",
      );
      assert.equal(incremental.telemetry.state, "READY");
      assert.equal(
        incremental.telemetry.persistence,
        "MIXED_INSERT_AND_IDEMPOTENT",
      );
      const secondCounts = await admin.query<{
        artifact_name: string;
        count: string;
      }>(`
        SELECT artifact_name, count(*)::text AS count
        FROM (
          SELECT artifact_name FROM ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger
          UNION ALL
          SELECT artifact_name FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}
        ) AS all_artifacts
        GROUP BY artifact_name
        ORDER BY artifact_name
      `);
      assert.deepEqual(secondCounts.rows, [
        { artifact_name: "EligibleInstrumentSnapshot", count: "1" },
        { artifact_name: "FactQualitySnapshot", count: "2" },
        { artifact_name: "PointInTimeMarketFact", count: "30" },
      ]);

      for (const venue of [
        "BINANCE_FUTURES",
        "OKX_SWAP",
        "BYBIT_LINEAR_PERPETUAL",
      ] as const) {
        provider.setFailure(`${venue}:CATALOG`, {
          kind: "TRANSPORT_ERROR",
          reasonCode: `${venue.toLowerCase()}_catalog_unreachable`,
        });
      }
      clock.advance(DAY_MS + 1);
      const outage = await runtime.runNextCycle();
      assert.equal(outage.telemetry.state, "DEGRADED");
      assert.equal(outage.telemetry.coverage.providerObservedCount, 0);
      assert.equal(outage.telemetry.coverage.accountedCount, 21);
      assert.equal(outage.telemetry.coverage.carriedForwardCount, 21);
      assert.equal(outage.telemetry.coverage.eligibleCount, 0);
      assert.equal(outage.artifacts?.facts.length, 0);
      assert.equal(outage.telemetry.persistence, "INSERTED");
      const outageCounts = await admin.query<{
        artifact_name: string;
        count: string;
      }>(`
        SELECT artifact_name, count(*)::text AS count
        FROM (
          SELECT artifact_name FROM ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger
          UNION ALL
          SELECT artifact_name FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}
        ) AS all_artifacts
        GROUP BY artifact_name
        ORDER BY artifact_name
      `);
      assert.deepEqual(outageCounts.rows, [
        { artifact_name: "EligibleInstrumentSnapshot", count: "2" },
        { artifact_name: "FactQualitySnapshot", count: "3" },
        { artifact_name: "PointInTimeMarketFact", count: "30" },
      ]);
    } finally {
      await writer?.end();
      try {
        await admin.query(`DROP ROLE IF EXISTS ${WRITER_LOGIN}`);
      } finally {
        await admin.end();
      }
    }
  },
);
