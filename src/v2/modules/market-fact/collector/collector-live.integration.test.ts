import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { createPublicJsonTransport } from "../../universe/public-json-transport";
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
import { M1_COLLECTOR_CHECKPOINT_POSTGRES_MIGRATION_SQL } from "./checkpoint-postgres-schema";
import { createM1CollectorWorker } from "./collector-worker";
import { evaluateM1CollectorSlo } from "./collector-slo";
import { M1PostgresCollectorCheckpointStore } from "./postgres-checkpoint-store";
import type { CollectorClock, CollectorRuntimeConfig } from "./contracts";

const databaseUrl = process.env.V2_M1_REHEARSAL_DATABASE_URL;
const liveEnabled = process.env.V2_M1_LIVE_REHEARSAL === "1";
const sourceCommit = process.env.V2_M1_REHEARSAL_SOURCE_COMMIT ??
  "live-collector-rehearsal-unbound";
const WRITER_LOGIN = "v2_m1_live_rehearsal_writer_login";
const READER_LOGIN = "v2_m1_live_rehearsal_reader_login";
const DAY_MS = 24 * 60 * 60 * 1_000;

function roleUrl(base: string, login: string): string {
  const url = new URL(base);
  url.username = login;
  url.password = "";
  return url.toString();
}

function rolePool(base: string, login: string, role: string): Pool {
  return new Pool({
    connectionString: roleUrl(base, login),
    max: 2,
    options: `-c role=${role}`,
  });
}

test(
  "collects two live public no-authority cycles and keeps the short SLO window insufficient",
  { skip: databaseUrl === undefined || !liveEnabled, timeout: 120_000 },
  async () => {
    assert.ok(databaseUrl);
    const admin = new Pool({ connectionString: databaseUrl, max: 2 });
    let writer: Pool | undefined;
    let reader: Pool | undefined;
    try {
      await admin.query(M1_STORE_POSTGRES_MIGRATION_SQL);
      await admin.query(M1_COLLECTOR_CHECKPOINT_POSTGRES_MIGRATION_SQL);
      await admin.query(M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL);
      await admin.query(`
        SET ROLE ${M1_FACT_RETENTION_IDENTITY};
        SELECT * FROM ${M1_STORE_POSTGRES_SCHEMA}.ensure_market_fact_partitions(
          (clock_timestamp() AT TIME ZONE 'UTC')::date,
          ((clock_timestamp() AT TIME ZONE 'UTC')::date + 1),
          'm1-5-live-rehearsal'
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
      const clock: CollectorClock = Object.freeze({ now: () => new Date() });
      const config: CollectorRuntimeConfig = {
        maxFactAgeMs: 60_000,
        maxSequenceGapMs: 5 * 60_000,
        policyVersion: "m1-live-linear-usdt-perpetual.v1",
        reconciliationIntervalMs: DAY_MS,
        releaseId: `m1-5-live:${sourceCommit.slice(0, 12)}`,
        retentionMs: 730 * DAY_MS,
      };
      const artifactStore = new M1PostgresArtifactStore(
        writer as unknown as M1SqlPool,
      );
      const checkpointRepository = new M1PostgresCollectorCheckpointStore({
        readerPool: reader as unknown as M1SqlPool,
        writerPool: writer as unknown as M1SqlPool,
      });
      const cycles = [];
      const worker = await createM1CollectorWorker({
        adapterRuntime: createPublicRestCollectorAdapterRuntime({
          clock,
          transport: createPublicJsonTransport(fetch, () => clock.now()),
        }),
        artifactStore,
        checkpointRepository,
        clock,
        runtimeConfig: config,
        telemetrySink: (cycle) => {
          cycles.push(cycle);
        },
        workerConfig: { cycleIntervalMs: 2_000 },
      });

      const report = await worker.run({ maxCycles: 2 });
      assert.equal(report.status, "COMPLETED");
      assert.equal(report.exitCode, 0);
      assert.equal(report.cycles.length, 2);
      console.log(JSON.stringify({
        authorityMode: report.authorityMode,
        automaticTradingAllowed: report.automaticTradingAllowed,
        cycles: report.cycles.map((cycle) => ({
          coverage: cycle.runtime.coverage,
          operationalReadiness: cycle.operationalReadiness,
          providerFailures: cycle.runtime.providerFailures,
          reasons: cycle.runtime.reasons,
          state: cycle.runtime.state,
          trigger: cycle.runtime.trigger,
        })),
        releaseId: config.releaseId,
        status: report.status,
      }));
      assert.ok(report.cycles.every(
        (cycle) => cycle.operationalReadiness === "READY",
      ));
      const startup = report.cycles[0]!;
      assert.equal(startup.runtime.trigger, "STARTUP_FULL");
      assert.ok((startup.runtime.coverage.providerObservedCount ?? 0) > 0);
      assert.ok(startup.runtime.coverage.accountedCount > 0);
      assert.ok(startup.runtime.coverage.eligibleCount > 0);
      assert.equal(
        startup.runtime.coverage.collectedCount,
        startup.runtime.coverage.eligibleCount,
      );
      assert.equal(
        startup.runtime.coverage.freshCount,
        startup.runtime.coverage.eligibleCount,
      );
      assert.ok(startup.runtime.coverage.venues.every(
        (venue) =>
          (venue.providerObservedCount ?? 0) > 0 &&
          venue.eligibleCount > 0 &&
          venue.freshCount === venue.eligibleCount,
      ));

      const slo = evaluateM1CollectorSlo({
        cycles: report.cycles,
        evaluatedAt: report.completedAt,
        policy: {
          maxMissedScheduleStarts: 0,
          maxP95CycleDurationMs: 30_000,
          maxProviderFailureCycleRatio: 0,
          maxRssBytes: 512 * 1024 * 1024,
          maxScheduleLagMs: 2_000,
          minCheckpointRatio: 1,
          minCycles: 30,
          minFreshCoverageRatio: 1,
          minObservationMs: 30 * 60 * 1_000,
          minOperationalReadyRatio: 1,
        },
        releaseId: config.releaseId,
      });
      assert.equal(slo.conclusion, "INSUFFICIENT_EVIDENCE");

      console.log(JSON.stringify({ sloConclusion: slo.conclusion }));
    } finally {
      await writer?.end();
      await reader?.end();
      try {
        await admin.query(`DROP ROLE IF EXISTS ${WRITER_LOGIN}`);
        await admin.query(`DROP ROLE IF EXISTS ${READER_LOGIN}`);
      } finally {
        await admin.end();
      }
    }
  },
);
