import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { Pool } from "pg";
import {
  FullScopeProviderHarness,
  MutableCollectorClock,
} from "../../../testing/m1-collector-harness";
import { buildFrozenM1FeatureContextSlice } from "../../../testing/m1-slice-builders";
import { stableContentHash } from "../../universe/stable-artifact";
import { createPublicRestCollectorAdapterRuntime } from "../collector/adapters/public-rest-adapter-runtime";
import { M1CollectorRuntime } from "../collector/collector-runtime";
import {
  M1_FACT_RETENTION_IDENTITY,
} from "./partitioned-fact-contract";
import {
  M1PostgresFactPartitionAudit,
  M1PostgresFactPartitionReader,
  M1PostgresFactPartitionRetention,
} from "./partitioned-fact-postgres-governance";
import {
  M1_PARTITIONED_FACT_IDENTITY_TABLE,
  M1_PARTITIONED_FACT_POSTGRES_MIGRATION_CHECKSUM,
  M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL,
  M1_PARTITIONED_FACT_TABLE,
} from "./partitioned-fact-postgres-schema";
import {
  M1_STORE_IDENTITIES,
  type M1SqlPool,
  type M1StoredArtifactRecord,
  M1StoreError,
} from "./contracts";
import {
  type M1ArtifactAppendRequest,
  M1PostgresArtifactStore,
} from "./postgres-artifact-store";
import {
  M1_STORE_POSTGRES_MIGRATION_SQL,
  M1_STORE_POSTGRES_SCHEMA,
} from "./postgres-schema";
import { buildM1ReplayManifest } from "./replay-manifest";
import { runM1Replay } from "./replay-runner";

const execFile = promisify(execFileCallback);
const databaseUrl = process.env.V2_M1_REHEARSAL_DATABASE_URL;
const DAY_MS = 24 * 60 * 60 * 1_000;
const RELEASE_ID = "m1-6-partition-rehearsal";
const LOGINS = Object.freeze({
  writer: "v2_m1_partition_writer_login",
  reader: "v2_m1_partition_reader_login",
  replay: "v2_m1_partition_replay_login",
  audit: "v2_m1_partition_audit_login",
  retention: "v2_m1_partition_retention_login",
});

function roleUrl(base: string, login: string): string {
  const url = new URL(base);
  url.username = login;
  url.password = "";
  return url.toString();
}

function databaseTargetUrl(base: string, database: string): string {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
}

function rolePool(base: string, login: string, role: string): Pool {
  return new Pool({
    connectionString: roleUrl(base, login),
    max: 2,
    options: `-c role=${role}`,
  });
}

function recordByName<Name extends M1StoredArtifactRecord["artifactName"]>(
  records: readonly M1StoredArtifactRecord[],
  name: Name,
): M1StoredArtifactRecord<Name> {
  const record = records.find((candidate) => candidate.artifactName === name);
  assert.ok(record, `${name} must exist`);
  return record as M1StoredArtifactRecord<Name>;
}

function pgCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

test(
  "proves migration compatibility, partition routing, restore parity and audited retention on PostgreSQL 16",
  { skip: databaseUrl === undefined, timeout: 60_000 },
  async () => {
    assert.ok(databaseUrl);
    const admin = new Pool({ connectionString: databaseUrl, max: 2 });
    const restoreDatabase = `m1_partition_restore_${process.pid}`;
    const workDirectory = await mkdtemp(join(tmpdir(), "m1-partition-backup-"));
    const dumpPath = join(workDirectory, "m1-partitioned-fact.dump");
    let writer: Pool | undefined;
    let reader: Pool | undefined;
    let replay: Pool | undefined;
    let audit: Pool | undefined;
    let retention: Pool | undefined;
    let restoredReader: Pool | undefined;
    let restoreCreated = false;
    try {
      await admin.query(M1_STORE_POSTGRES_MIGRATION_SQL);
      await admin.query(`
        CREATE ROLE ${LOGINS.writer} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
        CREATE ROLE ${LOGINS.reader} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
        CREATE ROLE ${LOGINS.replay} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
        CREATE ROLE ${LOGINS.audit} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
        GRANT ${M1_STORE_IDENTITIES.writer} TO ${LOGINS.writer};
        GRANT ${M1_STORE_IDENTITIES.reader} TO ${LOGINS.reader};
        GRANT ${M1_STORE_IDENTITIES.replay} TO ${LOGINS.replay};
        GRANT ${M1_STORE_IDENTITIES.audit} TO ${LOGINS.audit};
      `);
      writer = rolePool(databaseUrl, LOGINS.writer, M1_STORE_IDENTITIES.writer);
      reader = rolePool(databaseUrl, LOGINS.reader, M1_STORE_IDENTITIES.reader);
      replay = rolePool(databaseUrl, LOGINS.replay, M1_STORE_IDENTITIES.replay);
      audit = rolePool(databaseUrl, LOGINS.audit, M1_STORE_IDENTITIES.audit);

      const slice = await buildFrozenM1FeatureContextSlice();
      const factExpiresAtMs = Date.now() + 5_000;
      const manifestExpiresAtMs = Date.now() + 9_000;
      const retainUntil = new Date(factExpiresAtMs).toISOString();
      const manifestRetainUntil = new Date(manifestExpiresAtMs).toISOString();
      const legacyFact = slice.marketFacts.facts[0]!;
      const legacyIdempotencyKey = `m1:v1:PointInTimeMarketFact:${legacyFact.factId}`;
      const legacyStorageDigest = stableContentHash(legacyFact);
      await writer.query(`
        INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger (
          artifact_name,
          artifact_id,
          idempotency_key,
          schema_version,
          release_id,
          source_cutoff,
          generated_at,
          content_hash,
          storage_digest,
          retention_policy_version,
          retain_until,
          payload
        ) VALUES (
          'PointInTimeMarketFact',
          $1,
          $2,
          $3,
          $4,
          $5::timestamptz,
          $6::timestamptz,
          $7,
          $8,
          'v2-m1-rehearsal-retention.v1',
          $9::timestamptz,
          $10::jsonb
        )
      `, [
        legacyFact.factId,
        legacyIdempotencyKey,
        legacyFact.schemaVersion,
        legacyFact.releaseId,
        legacyFact.sourceCutoff,
        legacyFact.generatedAt,
        legacyFact.contentHash,
        legacyStorageDigest,
        retainUntil,
        JSON.stringify(legacyFact),
      ]);

      await admin.query(M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL);
      const migration = await admin.query<{ checksum: string }>(`
        SELECT checksum
        FROM ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations
        WHERE version = 'v2-m1-partitioned-fact-store.v1'
      `);
      assert.equal(
        migration.rows[0]!.checksum,
        M1_PARTITIONED_FACT_POSTGRES_MIGRATION_CHECKSUM,
      );
      const retentionCapability = await admin.query<{
        rolcanlogin: boolean;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolinherit: boolean;
        rolreplication: boolean;
        rolbypassrls: boolean;
      }>(`
        SELECT
          rolcanlogin,
          rolsuper,
          rolcreatedb,
          rolcreaterole,
          rolinherit,
          rolreplication,
          rolbypassrls
        FROM pg_roles
        WHERE rolname = '${M1_FACT_RETENTION_IDENTITY}'
      `);
      assert.deepEqual(retentionCapability.rows[0], {
        rolcanlogin: false,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolinherit: false,
        rolreplication: false,
        rolbypassrls: false,
      });
      await admin.query(`
        CREATE ROLE ${LOGINS.retention} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
        GRANT ${M1_FACT_RETENTION_IDENTITY} TO ${LOGINS.retention};
      `);
      retention = rolePool(
        databaseUrl,
        LOGINS.retention,
        M1_FACT_RETENTION_IDENTITY,
      );

      const retentionStore = new M1PostgresFactPartitionRetention(
        retention as unknown as M1SqlPool,
      );
      const ensured = await retentionStore.ensurePartitions({
        startDay: "2026-01-15",
        endDay: "2026-01-16",
        releaseId: RELEASE_ID,
      });
      assert.equal(ensured.length, 2);
      assert.ok(ensured.every((partition) => partition.created));
      assert.ok((await retentionStore.ensurePartitions({
        startDay: "2026-01-15",
        endDay: "2026-01-16",
        releaseId: RELEASE_ID,
      })).every((partition) => !partition.created));

      const requests = [
        {
          artifactName: "EligibleInstrumentSnapshot",
          artifact: slice.universe,
          retainUntil,
        } satisfies M1ArtifactAppendRequest<"EligibleInstrumentSnapshot">,
        ...slice.marketFacts.facts.map((artifact) => ({
          artifactName: "PointInTimeMarketFact" as const,
          artifact,
          retainUntil,
        } satisfies M1ArtifactAppendRequest<"PointInTimeMarketFact">)),
        {
          artifactName: "FactQualitySnapshot",
          artifact: slice.marketFacts.qualitySnapshot,
          retainUntil,
        } satisfies M1ArtifactAppendRequest<"FactQualitySnapshot">,
        {
          artifactName: "FeatureSetSnapshot",
          artifact: slice.onlineFeatureSet,
          retainUntil,
        } satisfies M1ArtifactAppendRequest<"FeatureSetSnapshot">,
        {
          artifactName: "FeatureQualitySnapshot",
          artifact: slice.featureQuality,
          retainUntil,
        } satisfies M1ArtifactAppendRequest<"FeatureQualitySnapshot">,
        {
          artifactName: "MarketContextSnapshot",
          artifact: slice.marketContext,
          retainUntil,
        } satisfies M1ArtifactAppendRequest<"MarketContextSnapshot">,
      ];
      const writerStore = new M1PostgresArtifactStore(
        writer as unknown as M1SqlPool,
      );
      const inserted = await writerStore.appendArtifacts(requests);
      assert.equal(
        inserted.filter((result) => result.status === "IDEMPOTENT_REPLAY").length,
        1,
      );
      assert.ok((await writerStore.appendArtifacts(requests)).every(
        (result) => result.status === "IDEMPOTENT_REPLAY",
      ));
      await assert.rejects(
        writer.query(`
          INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE} (
            artifact_name,
            artifact_id,
            idempotency_key,
            schema_version,
            release_id,
            source_cutoff,
            generated_at,
            content_hash,
            storage_digest,
            retention_policy_version,
            retain_until,
            payload
          ) VALUES (
            'PointInTimeMarketFact',
            $1,
            $2,
            $3,
            $4,
            $5::timestamptz,
            $6::timestamptz,
            $7,
            $8,
            'v2-m1-rehearsal-retention.v1',
            $9::timestamptz,
            $10::jsonb
          )
        `, [
          legacyFact.factId,
          legacyIdempotencyKey,
          legacyFact.schemaVersion,
          legacyFact.releaseId,
          legacyFact.sourceCutoff,
          legacyFact.generatedAt,
          legacyFact.contentHash,
          legacyStorageDigest,
          retainUntil,
          JSON.stringify(legacyFact),
        ]),
        (error: unknown) =>
          pgCode(error) === "23505" &&
          error instanceof Error &&
          error.message === "partitioned_fact_legacy_identity_conflict",
      );
      const partitionOnlyFact = slice.marketFacts.facts[1]!;
      await assert.rejects(
        writer.query(`
          INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger (
            artifact_name,
            artifact_id,
            idempotency_key,
            schema_version,
            release_id,
            source_cutoff,
            generated_at,
            content_hash,
            storage_digest,
            retention_policy_version,
            retain_until,
            payload
          ) VALUES (
            'PointInTimeMarketFact',
            $1,
            $2,
            $3,
            $4,
            $5::timestamptz,
            $6::timestamptz,
            $7,
            $8,
            'v2-m1-rehearsal-retention.v1',
            $9::timestamptz,
            $10::jsonb
          )
        `, [
          partitionOnlyFact.factId,
          `m1:v1:PointInTimeMarketFact:${partitionOnlyFact.factId}`,
          partitionOnlyFact.schemaVersion,
          partitionOnlyFact.releaseId,
          partitionOnlyFact.sourceCutoff,
          partitionOnlyFact.generatedAt,
          partitionOnlyFact.contentHash,
          stableContentHash(partitionOnlyFact),
          retainUntil,
          JSON.stringify(partitionOnlyFact),
        ]),
        (error: unknown) =>
          pgCode(error) === "55000" &&
          error instanceof Error &&
          error.message === "unpartitioned_market_fact_write_forbidden",
      );

      const records = inserted.map((result) => result.record);
      const universe = recordByName(records, "EligibleInstrumentSnapshot");
      const facts = records.filter((record) =>
        record.artifactName === "PointInTimeMarketFact") as
        M1StoredArtifactRecord<"PointInTimeMarketFact">[];
      const factQuality = recordByName(records, "FactQualitySnapshot");
      const onlineFeatureSet = recordByName(records, "FeatureSetSnapshot");
      const sourceRecords = [
        universe,
        ...facts,
        factQuality,
        onlineFeatureSet,
      ];
      const knowledgeCutoff = sourceRecords
        .map((record) => record.persistedAt)
        .sort()
        .at(-1)!;
      const manifest = buildM1ReplayManifest({
        createdAt: new Date().toISOString(),
        eventCutoff: slice.universe.sourceCutoff,
        knowledgeCutoff,
        universe,
        facts,
        factQuality,
        onlineFeatureSet,
      });
      const replayStore = new M1PostgresArtifactStore(
        replay as unknown as M1SqlPool,
      );
      await replayStore.appendReplayManifest(manifest, manifestRetainUntil);

      const secondClock = new MutableCollectorClock("2026-01-16T00:00:00.500Z");
      const secondProvider = new FullScopeProviderHarness(secondClock);
      const secondRuntime = new M1CollectorRuntime({
        adapterRuntime: createPublicRestCollectorAdapterRuntime({
          clock: secondClock,
          transport: secondProvider.transport,
        }),
        clock: secondClock,
        config: {
          maxFactAgeMs: 5_000,
          maxSequenceGapMs: 60_000,
          policyVersion: "m1-full-linear-usdt-perpetual.v1",
          reconciliationIntervalMs: DAY_MS,
          releaseId: "m1-6-cross-partition-rehearsal",
          retentionMs: 730 * DAY_MS,
        },
        store: writerStore,
      });
      const secondCycle = await secondRuntime.runNextCycle();
      assert.equal(secondCycle.telemetry.state, "READY");
      assert.equal(secondCycle.artifacts?.facts.length, 15);

      const counts = await admin.query<{
        legacy_facts: string;
        partitioned_facts: string;
        active_partitions: string;
      }>(`
        SELECT
          (SELECT count(*)::text FROM ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger
            WHERE artifact_name = 'PointInTimeMarketFact') AS legacy_facts,
          (SELECT count(*)::text FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE})
            AS partitioned_facts,
          (SELECT count(DISTINCT tableoid)::text
            FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE})
            AS active_partitions
      `);
      assert.deepEqual(counts.rows[0], {
        legacy_facts: "1",
        partitioned_facts: "17",
        active_partitions: "2",
      });

      const readerStore = new M1PostgresArtifactStore(
        reader as unknown as M1SqlPool,
      );
      assert.equal(
        (await readerStore.readArtifact(
          "PointInTimeMarketFact",
          legacyFact.factId,
        )).storageDigest,
        legacyStorageDigest,
      );
      const secondFact = secondCycle.artifacts!.facts[0]!;
      assert.equal(
        (await readerStore.readArtifact(
          "PointInTimeMarketFact",
          secondFact.factId,
        )).payload.sourceCutoff,
        secondFact.sourceCutoff,
      );

      await admin.query(
        `ANALYZE ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}`,
      );
      const capacity = await new M1PostgresFactPartitionReader(
        reader as unknown as M1SqlPool,
      ).inspectCapacity({
        maxPartitionBytes: 64 * 1024 * 1024,
        maxTotalBytes: 128 * 1024 * 1024,
        requiredCoverageStart: "2026-01-15T00:00:00.000Z",
        requiredCoverageEnd: "2026-01-17T00:00:00.000Z",
      });
      assert.equal(capacity.status, "PASS");
      assert.equal(capacity.partitionCount, 2);
      assert.ok(capacity.estimatedRows >= 17);

      await assert.rejects(
        retentionStore.dropExpired({
          runId: "m1-6-retention-before-expiry",
          cutoffDay: "2026-01-16",
          releaseId: RELEASE_ID,
          backupEvidenceId: "backup-not-yet-verified",
        }),
        (error: unknown) => pgCode(error) === "55000",
      );

      const backupCreatedAt = new Date().toISOString();
      const pgBindir = (await execFile("pg_config", ["--bindir"])).stdout.trim();
      await execFile(join(pgBindir, "pg_dump"), [
        "--format=custom",
        `--file=${dumpPath}`,
        databaseUrl,
      ]);
      await admin.query(`CREATE DATABASE ${restoreDatabase}`);
      restoreCreated = true;
      const restoreUrl = databaseTargetUrl(databaseUrl, restoreDatabase);
      await execFile(join(pgBindir, "pg_restore"), [
        "--exit-on-error",
        `--dbname=${restoreUrl}`,
        dumpPath,
      ]);
      restoredReader = rolePool(
        restoreUrl,
        LOGINS.reader,
        M1_STORE_IDENTITIES.reader,
      );
      const restoredStore = new M1PostgresArtifactStore(
        restoredReader as unknown as M1SqlPool,
      );
      const restoredReplay = await runM1Replay({
        store: restoredStore,
        manifest,
        replayRunId: "m1-6-restored-replay-1",
        replayRepeatRunId: "m1-6-restored-replay-2",
      });
      assert.equal(restoredReplay.featureQuality.onlineOfflineParity, "PASS");
      assert.equal(restoredReplay.featureQuality.replayDeterministic, true);
      const restoredCounts = await restoredReader.query<{ count: string }>(`
        SELECT count(*)::text AS count
        FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}
      `);
      assert.equal(restoredCounts.rows[0]!.count, "17");
      const restoreVerifiedAt = new Date().toISOString();

      const backup = await new M1PostgresFactPartitionAudit(
        audit as unknown as M1SqlPool,
      ).recordBackupEvidence({
        evidenceId: "m1-6-pg-dump-restore-proof",
        releaseId: RELEASE_ID,
        backupCreatedAt,
        restoreVerifiedAt,
        coveredThrough: "2026-01-17T00:00:00.000Z",
        artifactCount: 18,
        sourceDigest: stableContentHash({
          manifestDigest: manifest.manifestDigest,
          migrationChecksum: M1_PARTITIONED_FACT_POSTGRES_MIGRATION_CHECKSUM,
          partitionedFactCount: 17,
          restoredReplayParity: restoredReplay.featureQuality.onlineOfflineParity,
        }),
        targetIdentity: restoreDatabase,
      });
      assert.equal(backup.status, "INSERTED");
      assert.equal(backup.record.auditorIdentity, M1_STORE_IDENTITIES.audit);
      assert.equal((await new M1PostgresFactPartitionAudit(
        audit as unknown as M1SqlPool,
      ).recordBackupEvidence({
        evidenceId: "m1-6-pg-dump-restore-proof",
        releaseId: RELEASE_ID,
        backupCreatedAt,
        restoreVerifiedAt,
        coveredThrough: "2026-01-17T00:00:00.000Z",
        artifactCount: 18,
        sourceDigest: backup.record.sourceDigest,
        targetIdentity: restoreDatabase,
      })).status, "IDEMPOTENT_REPLAY");
      await assert.rejects(
        retention.query(`INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.market_fact_backup_evidence_ledger DEFAULT VALUES`),
        (error: unknown) => pgCode(error) === "42501",
      );
      await assert.rejects(
        audit.query(`SELECT * FROM ${M1_STORE_POSTGRES_SCHEMA}.drop_expired_market_fact_partitions(
          'audit-cannot-drop', '2026-01-16'::date, '${RELEASE_ID}', '${backup.record.evidenceId}'
        )`),
        (error: unknown) => pgCode(error) === "42501",
      );
      await assert.rejects(
        admin.query(`UPDATE ${M1_STORE_POSTGRES_SCHEMA}.market_fact_backup_evidence_ledger
          SET target_identity = target_identity`),
        (error: unknown) => pgCode(error) === "55000",
      );

      const factExpiryWaitMs = Math.max(0, factExpiresAtMs - Date.now() + 100);
      if (factExpiryWaitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, factExpiryWaitMs));
      }
      await assert.rejects(
        retentionStore.dropExpired({
          runId: "m1-6-active-replay-block",
          cutoffDay: "2026-01-16",
          releaseId: RELEASE_ID,
          backupEvidenceId: backup.record.evidenceId,
        }),
        (error: unknown) =>
          pgCode(error) === "55000" &&
          error instanceof Error &&
          error.message.includes("active replay evidence"),
      );
      const manifestExpiryWaitMs = Math.max(
        0,
        manifestExpiresAtMs - Date.now() + 100,
      );
      if (manifestExpiryWaitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, manifestExpiryWaitMs));
      }
      const retentionRun = await retentionStore.dropExpired({
        runId: "m1-6-drop-expired-2026-01-15",
        cutoffDay: "2026-01-16",
        releaseId: RELEASE_ID,
        backupEvidenceId: backup.record.evidenceId,
      });
      assert.equal(retentionRun.droppedPartitionCount, 1);
      assert.equal(retentionRun.droppedFactCount, 2);
      assert.ok(retentionRun.droppedTotalBytes > 0);
      assert.equal(retentionRun.retentionIdentity, M1_FACT_RETENTION_IDENTITY);
      assert.equal(retentionRun.sessionIdentity, LOGINS.retention);
      assert.deepEqual(
        await retentionStore.dropExpired({
          runId: "m1-6-drop-expired-2026-01-15",
          cutoffDay: "2026-01-16",
          releaseId: RELEASE_ID,
          backupEvidenceId: backup.record.evidenceId,
        }),
        retentionRun,
      );

      const postDrop = await admin.query<{
        dropped_relation: string | null;
        remaining_facts: string;
        active_identities: string;
      }>(`
        SELECT
          to_regclass('${M1_STORE_POSTGRES_SCHEMA}.point_in_time_market_fact_ledger_p20260115')::text
            AS dropped_relation,
          (SELECT count(*)::text
            FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE})
            AS remaining_facts,
          (SELECT count(*)::text
            FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_IDENTITY_TABLE})
            AS active_identities
      `);
      assert.deepEqual(postDrop.rows[0], {
        dropped_relation: null,
        remaining_facts: "15",
        active_identities: "15",
      });
      const retiredFact = slice.marketFacts.facts[1]!;
      await assert.rejects(
        readerStore.readArtifact("PointInTimeMarketFact", retiredFact.factId),
        (error: unknown) =>
          error instanceof M1StoreError && error.code === "ARTIFACT_NOT_FOUND",
      );
      await assert.rejects(
        writerStore.appendArtifacts(requests),
        (error: unknown) =>
          error instanceof M1StoreError && error.code === "ARTIFACT_RETIRED",
      );
      await assert.rejects(
        retentionStore.ensurePartitions({
          startDay: "2026-01-15",
          endDay: "2026-01-15",
          releaseId: RELEASE_ID,
        }),
        (error: unknown) => pgCode(error) === "55000",
      );
      await assert.rejects(
        writer.query(`SELECT * FROM ${M1_STORE_POSTGRES_SCHEMA}.drop_expired_market_fact_partitions(
          'writer-cannot-drop', '2026-01-16'::date, '${RELEASE_ID}', '${backup.record.evidenceId}'
        )`),
        (error: unknown) => pgCode(error) === "42501",
      );

      console.log(`M1_PARTITION_REHEARSAL_EVIDENCE=${JSON.stringify({
        status: "PASS",
        postgresMajor: 16,
        productionConnected: false,
        productionChanged: false,
        legacyFactReadable: true,
        activePartitionsBeforeDrop: 2,
        crossPartitionRead: true,
        backupRestoreReplayParity: restoredReplay.featureQuality.onlineOfflineParity,
        backupRestoreDeterministic: restoredReplay.featureQuality.replayDeterministic,
        droppedPartitionCount: retentionRun.droppedPartitionCount,
        droppedFactCount: retentionRun.droppedFactCount,
        activeIdentityCountAfterDrop: 15,
        retiredRehydrationRejected: true,
      })}`);
    } finally {
      await Promise.all([
        writer?.end(),
        reader?.end(),
        replay?.end(),
        audit?.end(),
        retention?.end(),
        restoredReader?.end(),
      ]);
      if (restoreCreated) {
        await admin.query(`DROP DATABASE IF EXISTS ${restoreDatabase} WITH (FORCE)`);
      }
      await admin.end();
      await rm(workDirectory, { recursive: true, force: true });
    }
  },
);
