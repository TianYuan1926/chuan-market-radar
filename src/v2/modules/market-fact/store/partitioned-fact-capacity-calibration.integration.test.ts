import assert from "node:assert/strict";
import { chmod, lstat, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import test from "node:test";
import { Pool } from "pg";
import {
  FullScopeProviderHarness,
  MutableCollectorClock,
} from "../../../testing/m1-collector-harness";
import { stableContentHash } from "../../universe/stable-artifact";
import { createPublicRestCollectorAdapterRuntime } from "../collector/adapters/public-rest-adapter-runtime";
import { M1CollectorRuntime } from "../collector/collector-runtime";
import { M1_FACT_RETENTION_IDENTITY } from "./partitioned-fact-contract";
import { M1PostgresFactPartitionRetention } from "./partitioned-fact-postgres-governance";
import {
  M1_PARTITIONED_FACT_IDENTITY_TABLE,
  M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL,
  M1_PARTITIONED_FACT_TABLE,
} from "./partitioned-fact-postgres-schema";
import {
  M1_STORE_IDENTITIES,
  type M1SqlPool,
} from "./contracts";
import { M1PostgresArtifactStore } from "./postgres-artifact-store";
import {
  M1_STORE_POSTGRES_MIGRATION_SQL,
  M1_STORE_POSTGRES_SCHEMA,
} from "./postgres-schema";

const databaseUrl = process.env.V2_M1_REHEARSAL_DATABASE_URL;
const outputPath = process.env.V2_M1_CAPACITY_CALIBRATION_OUTPUT;
const sourceCommit = process.env.V2_M1_REHEARSAL_SOURCE_COMMIT;
const sourceTree = process.env.V2_M1_REHEARSAL_SOURCE_TREE;
const sourceState = process.env.V2_M1_CAPACITY_CALIBRATION_SOURCE_STATE;
const CYCLE_INTERVAL_MS = 60_000;
const FACTS_PER_CYCLE = 1_444;
const RETENTION_MS = 30 * 60 * 60_000;
const RELEASE_ID = "m1-p0r-d0-capacity-calibration-v1";
const WRITER_LOGIN = "v2_m1_capacity_writer_login";
const RETENTION_LOGIN = "v2_m1_capacity_retention_login";

function integer(value: string | undefined, label: string): number {
  assert.match(value ?? "", /^[1-9][0-9]*$/u, `${label} must be a positive integer`);
  const parsed = Number(value);
  assert.ok(Number.isSafeInteger(parsed), `${label} is outside the safe integer range`);
  return parsed;
}

function measured(value: string, label: string): number {
  assert.match(value, /^[0-9]+(?:\.[0-9]+)?$/u, `${label} is not numeric`);
  const parsed = Number(value);
  assert.ok(Number.isFinite(parsed) && parsed >= 0, `${label} is invalid`);
  return parsed;
}

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

function syntheticAssets(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    `${prefix}${String(index + 1).padStart(4, "0")}`);
}

async function writeProtectedReport(path: string, report: unknown): Promise<void> {
  const destination = resolve(path);
  assert.equal(isAbsolute(path), true, "capacity calibration output must be absolute");
  const workspaceRelative = relative(process.cwd(), destination);
  assert.ok(
    workspaceRelative === ".." || workspaceRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`),
    "capacity calibration output must remain outside the Git workspace",
  );
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  await chmod(parent, 0o700);
  const parentFacts = await lstat(parent);
  assert.equal(parentFacts.isSymbolicLink(), false, "capacity evidence parent must not be a symlink");
  assert.equal(parentFacts.isDirectory(), true, "capacity evidence parent must be a directory");
  assert.equal(parentFacts.mode & 0o077, 0, "capacity evidence parent permissions are too open");
  await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  await chmod(destination, 0o600);
}

test(
  "measures production-shaped Fact, index, ledger and WAL cost on isolated PostgreSQL 16",
  {
    skip: databaseUrl === undefined || outputPath === undefined,
    timeout: 35 * 60_000,
  },
  async () => {
    assert.ok(databaseUrl);
    assert.ok(outputPath);
    assert.match(sourceCommit ?? "", /^[0-9a-f]{40}$/u);
    assert.match(sourceTree ?? "", /^[0-9a-f]{40}$/u);
    assert.ok(
      sourceState === "CLEAN_COMMIT" || sourceState === "DIRTY_DIAGNOSTIC",
      "capacity calibration source state is invalid",
    );
    const endpoint = new URL(databaseUrl);
    assert.equal(endpoint.hostname, "127.0.0.1");
    assert.match(endpoint.pathname, /^\/market_radar_v2_m1_rehearsal$/u);
    assert.equal(endpoint.password, "");

    const cycles = integer(
      process.env.V2_M1_CAPACITY_CALIBRATION_CYCLES ?? "8",
      "capacity calibration cycles",
    );
    assert.ok(cycles >= 4 && cycles <= 31, "capacity calibration cycles must be between 4 and 31");
    const calibrationDay = new Date().toISOString().slice(0, 10);
    const calibrationSourceCutoff = `${calibrationDay}T00:00:00.500Z`;
    const partitionName = `point_in_time_market_fact_ledger_p${calibrationDay.replaceAll("-", "")}`;
    const admin = new Pool({ connectionString: databaseUrl, max: 2 });
    let writer: Pool | undefined;
    let retention: Pool | undefined;
    try {
      await admin.query(M1_STORE_POSTGRES_MIGRATION_SQL);
      await admin.query(M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL);
      await admin.query(`
        CREATE ROLE ${WRITER_LOGIN} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
        CREATE ROLE ${RETENTION_LOGIN} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
        GRANT ${M1_STORE_IDENTITIES.writer} TO ${WRITER_LOGIN};
        GRANT ${M1_FACT_RETENTION_IDENTITY} TO ${RETENTION_LOGIN};
      `);
      writer = rolePool(databaseUrl, WRITER_LOGIN, M1_STORE_IDENTITIES.writer);
      retention = rolePool(databaseUrl, RETENTION_LOGIN, M1_FACT_RETENTION_IDENTITY);
      const partitions = await new M1PostgresFactPartitionRetention(
        retention as unknown as M1SqlPool,
      ).ensurePartitions({
        endDay: calibrationDay,
        releaseId: RELEASE_ID,
        startDay: calibrationDay,
      });
      assert.equal(partitions.length, 1);
      assert.equal(partitions[0]!.partitionName, partitionName);

      await admin.query("CHECKPOINT");
      const baseline = await admin.query<{
        database_bytes: string;
        wal_lsn: string;
      }>(`
        SELECT
          pg_database_size(current_database())::text AS database_bytes,
          pg_current_wal_insert_lsn()::text AS wal_lsn
      `);
      const clock = new MutableCollectorClock(calibrationSourceCutoff);
      const provider = new FullScopeProviderHarness(clock);
      provider.assetsByVenue.BINANCE_FUTURES = syntheticAssets("BN", 482);
      provider.assetsByVenue.OKX_SWAP = syntheticAssets("OK", 481);
      provider.assetsByVenue.BYBIT_LINEAR_PERPETUAL = syntheticAssets("BY", 481);
      const runtime = new M1CollectorRuntime({
        adapterRuntime: createPublicRestCollectorAdapterRuntime({
          clock,
          transport: provider.transport,
        }),
        clock,
        config: {
          maxFactAgeMs: 5_000,
          maxSequenceGapMs: CYCLE_INTERVAL_MS,
          policyVersion: "m1-full-linear-usdt-perpetual.v1",
          reconciliationIntervalMs: 24 * 60 * 60_000,
          releaseId: RELEASE_ID,
          retentionMs: RETENTION_MS,
        },
        store: new M1PostgresArtifactStore(writer as unknown as M1SqlPool),
      });

      const startedAt = new Date().toISOString();
      const cycleSamples: Array<{
        cycle: number;
        databaseBytes: number;
        factIdentityTotalBytes: number;
        factPartitionTotalBytes: number;
        factRows: number;
        wallDurationMs: number;
      }> = [];
      for (let cycle = 1; cycle <= cycles; cycle += 1) {
        const cycleStartedAtMs = Date.now();
        const result = await runtime.runNextCycle();
        assert.equal(
          result.telemetry.state,
          "READY",
          JSON.stringify({
            coverage: result.telemetry.coverage,
            providerFailures: result.telemetry.providerFailures,
            reasons: result.telemetry.reasons,
            request: result.telemetry.request,
            trigger: result.telemetry.trigger,
          }),
        );
        assert.equal(result.telemetry.coverage.eligibleCount, FACTS_PER_CYCLE);
        assert.equal(result.telemetry.coverage.collectedCount, FACTS_PER_CYCLE);
        assert.equal(result.telemetry.coverage.usablePriceCount, FACTS_PER_CYCLE);
        assert.equal(result.telemetry.coverage.freshCount, FACTS_PER_CYCLE);
        const sample = await admin.query<{
          database_bytes: string;
          fact_identity_total_bytes: string;
          fact_partition_total_bytes: string;
          fact_rows: string;
        }>(`
          SELECT
            pg_database_size(current_database())::text AS database_bytes,
            pg_total_relation_size('${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_IDENTITY_TABLE}'::regclass)::text
              AS fact_identity_total_bytes,
            pg_total_relation_size($1::regclass)::text AS fact_partition_total_bytes,
            (SELECT count(*)::text
              FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}) AS fact_rows
        `, [`${M1_STORE_POSTGRES_SCHEMA}.${partitionName}`]);
        cycleSamples.push({
          cycle,
          databaseBytes: measured(sample.rows[0]!.database_bytes, "sample database bytes"),
          factIdentityTotalBytes: measured(
            sample.rows[0]!.fact_identity_total_bytes,
            "sample identity bytes",
          ),
          factPartitionTotalBytes: measured(
            sample.rows[0]!.fact_partition_total_bytes,
            "sample partition bytes",
          ),
          factRows: measured(sample.rows[0]!.fact_rows, "sample fact rows"),
          wallDurationMs: Date.now() - cycleStartedAtMs,
        });
        clock.advance(CYCLE_INTERVAL_MS);
      }
      const completedAt = new Date().toISOString();
      await admin.query(
        `ANALYZE ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}`,
      );
      const measurements = await admin.query<{
        artifact_ledger_rows: string;
        artifact_ledger_total_bytes: string;
        average_payload_bytes: string;
        average_row_bytes: string;
        database_bytes: string;
        fact_identity_total_bytes: string;
        fact_partition_heap_bytes: string;
        fact_partition_index_bytes: string;
        fact_partition_total_bytes: string;
        fact_rows: string;
        maximum_payload_bytes: string;
        maximum_row_bytes: string;
        wal_lsn: string;
      }>(`
        SELECT
          (SELECT count(*)::text FROM ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger)
            AS artifact_ledger_rows,
          pg_total_relation_size('${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger'::regclass)::text
            AS artifact_ledger_total_bytes,
          (SELECT round(avg(pg_column_size(payload)))::text
            FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE})
            AS average_payload_bytes,
          (SELECT round(avg(pg_column_size(fact_row)))::text
            FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE} AS fact_row)
            AS average_row_bytes,
          pg_database_size(current_database())::text AS database_bytes,
          pg_total_relation_size('${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_IDENTITY_TABLE}'::regclass)::text
            AS fact_identity_total_bytes,
          pg_relation_size($1::regclass)::text
            AS fact_partition_heap_bytes,
          pg_indexes_size($1::regclass)::text
            AS fact_partition_index_bytes,
          pg_total_relation_size($1::regclass)::text
            AS fact_partition_total_bytes,
          (SELECT count(*)::text
            FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}) AS fact_rows,
          (SELECT max(pg_column_size(payload))::text
            FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE})
            AS maximum_payload_bytes,
          (SELECT max(pg_column_size(fact_row))::text
            FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE} AS fact_row)
            AS maximum_row_bytes,
          pg_current_wal_insert_lsn()::text AS wal_lsn
      `, [`${M1_STORE_POSTGRES_SCHEMA}.${partitionName}`]);
      const row = measurements.rows[0]!;
      const factRows = measured(row.fact_rows, "fact rows");
      assert.equal(factRows, cycles * FACTS_PER_CYCLE);
      const partitionTotalBytes = measured(
        row.fact_partition_total_bytes,
        "fact partition total bytes",
      );
      const identityTotalBytes = measured(
        row.fact_identity_total_bytes,
        "fact identity total bytes",
      );
      const wal = await admin.query<{ bytes: string }>(
        "SELECT pg_wal_lsn_diff($1::pg_lsn, $2::pg_lsn)::text AS bytes",
        [row.wal_lsn, baseline.rows[0]!.wal_lsn],
      );
      const databaseBaselineBytes = measured(
        baseline.rows[0]!.database_bytes,
        "baseline database bytes",
      );
      const databaseFinalBytes = measured(row.database_bytes, "final database bytes");
      const firstSample = cycleSamples[0]!;
      const lastSample = cycleSamples.at(-1)!;
      const incrementalRows = lastSample.factRows - firstSample.factRows;
      assert.ok(incrementalRows > 0, "capacity calibration needs incremental rows");
      const incrementalFactStorageBytes =
        lastSample.factPartitionTotalBytes + lastSample.factIdentityTotalBytes
        - firstSample.factPartitionTotalBytes - firstSample.factIdentityTotalBytes;
      assert.ok(incrementalFactStorageBytes > 0, "incremental Fact storage must grow");
      const maximumCycleWallDurationMs = Math.max(
        ...cycleSamples.map((sample) => sample.wallDurationMs),
      );
      assert.ok(
        maximumCycleWallDurationMs <= CYCLE_INTERVAL_MS,
        "isolated production-shaped persistence exceeded the fixed cycle interval",
      );
      const unsigned = {
        admissibleForProductionCapacityPass: false,
        automaticTradingAllowed: false,
        boundary: {
          candidateEmissionAllowed: false,
          productionConnected: false,
          productionDatabaseMutation: false,
          productionRepositoryMutation: false,
          productionServiceMutation: false,
          syntheticProviderData: true,
        },
        calibration: {
          configuredRetentionHours: RETENTION_MS / 3_600_000,
          cycleSamples,
          cycleIntervalMs: CYCLE_INTERVAL_MS,
          cycles,
          factsPerCycle: FACTS_PER_CYCLE,
          logicalFactHoursRepresented: cycles * CYCLE_INTERVAL_MS / 3_600_000,
          maximumCycleWallDurationMs,
          meanCycleWallDurationMs: Math.ceil(
            cycleSamples.reduce((total, sample) => total + sample.wallDurationMs, 0)
              / cycleSamples.length,
          ),
          sourceCutoffStart: calibrationSourceCutoff,
        },
        completedAt,
        evidenceClass: sourceState === "CLEAN_COMMIT"
          ? "ISOLATED_SYNTHETIC_PRODUCTION_SHAPE"
          : "DIRTY_WORKTREE_DIAGNOSTIC_ONLY",
        measurements: {
          artifactLedgerRows: measured(row.artifact_ledger_rows, "artifact ledger rows"),
          artifactLedgerTotalBytes: measured(
            row.artifact_ledger_total_bytes,
            "artifact ledger total bytes",
          ),
          averagePayloadBytes: measured(row.average_payload_bytes, "average payload bytes"),
          averageRowBytes: measured(row.average_row_bytes, "average row bytes"),
          databaseBaselineBytes,
          databaseFinalBytes,
          databaseGrowthBytes: Math.max(0, databaseFinalBytes - databaseBaselineBytes),
          factIdentityTotalBytes: identityTotalBytes,
          factPartitionHeapBytes: measured(
            row.fact_partition_heap_bytes,
            "fact partition heap bytes",
          ),
          factPartitionIndexBytes: measured(
            row.fact_partition_index_bytes,
            "fact partition index bytes",
          ),
          factPartitionTotalBytes: partitionTotalBytes,
          factRows,
          incrementalFactStorageBytes,
          incrementalFactStorageBytesPerRowCeiling: Math.ceil(
            incrementalFactStorageBytes / incrementalRows,
          ),
          incrementalRows,
          factStorageBytesPerRowCeiling: Math.ceil(
            (partitionTotalBytes + identityTotalBytes) / factRows,
          ),
          maximumPayloadBytes: measured(row.maximum_payload_bytes, "maximum payload bytes"),
          maximumRowBytes: measured(row.maximum_row_bytes, "maximum row bytes"),
          walBytes: measured(wal.rows[0]!.bytes, "WAL bytes"),
          walBytesPerFactCeiling: Math.ceil(
            measured(wal.rows[0]!.bytes, "WAL bytes") / factRows,
          ),
        },
        postgresMajor: 16,
        releaseId: RELEASE_ID,
        schemaVersion: "v2-m1-p0r-d0-isolated-capacity-calibration.v1",
        sourceCommit,
        sourceState,
        sourceTree,
        startedAt,
        status: sourceState === "CLEAN_COMMIT"
          ? "PASS_ISOLATED_CAPACITY_CALIBRATION"
          : "DIAGNOSTIC_DIRTY_WORKTREE_NOT_ADMISSIBLE",
      } as const;
      const report = {
        ...unsigned,
        calibrationDigest: stableContentHash(unsigned),
      };
      assert.equal(report.boundary.productionConnected, false);
      assert.equal(report.admissibleForProductionCapacityPass, false);
      await writeProtectedReport(outputPath, report);
    } finally {
      await Promise.allSettled([
        writer?.end(),
        retention?.end(),
        admin.end(),
      ]);
    }
  },
);
