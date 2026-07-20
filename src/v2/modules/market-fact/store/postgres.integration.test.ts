import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import type { ReleaseRecord } from "../../../domain/contracts";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "../../../runtime-schema/schema-versions";
import {
  buildRuntimeTruthSnapshot,
  M1_RUNTIME_TRUTH_PROFILE,
} from "../../runtime/build-runtime-truth";
import { buildFrozenM1FeatureContextSlice } from "../../../testing/m1-slice-builders";
import {
  type M1ArtifactAppendRequest,
  M1PostgresArtifactStore,
} from "./postgres-artifact-store";
import {
  type M1ArtifactName,
  type M1SqlPool,
  type M1StoredArtifactRecord,
  M1_STORE_IDENTITIES,
  M1_STORE_SCHEMA_VERSION,
  M1StoreError,
} from "./contracts";
import {
  M1_STORE_POSTGRES_MIGRATION_CHECKSUM,
  M1_STORE_POSTGRES_MIGRATION_SQL,
  M1_STORE_POSTGRES_SCHEMA,
} from "./postgres-schema";
import {
  M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL,
  M1_PARTITIONED_FACT_TABLE,
} from "./partitioned-fact-postgres-schema";
import { M1_FACT_RETENTION_IDENTITY } from "./partitioned-fact-contract";
import { buildM1ReplayManifest } from "./replay-manifest";
import { runM1Replay } from "./replay-runner";

const databaseUrl = process.env.V2_M1_REHEARSAL_DATABASE_URL;
const sourceCommit = process.env.V2_M1_REHEARSAL_SOURCE_COMMIT ??
  "rehearsal-source-commit-unbound";
const sourceTree = process.env.V2_M1_REHEARSAL_SOURCE_TREE ??
  "rehearsal-source-tree-unbound";

const LOGIN_IDENTITIES = Object.freeze({
  writer: "v2_m1_rehearsal_writer_login",
  reader: "v2_m1_rehearsal_reader_login",
  replay: "v2_m1_rehearsal_replay_login",
  audit: "v2_m1_rehearsal_audit_login",
});

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

function sqlPool(pool: Pool): M1SqlPool {
  return pool as unknown as M1SqlPool;
}

function pgCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function recordByName<Name extends M1ArtifactName>(
  records: readonly M1StoredArtifactRecord[],
  name: Name,
): M1StoredArtifactRecord<Name> {
  const record = records.find((candidate) => candidate.artifactName === name);
  assert.ok(record, `${name} must be present in rehearsal records`);
  return record as M1StoredArtifactRecord<Name>;
}

test(
  "proves append-only identities, idempotency, corruption detection and durable replay on PostgreSQL 16",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);
    const admin = new Pool({ connectionString: databaseUrl, max: 2 });
    let writer: Pool | undefined;
    let reader: Pool | undefined;
    let replay: Pool | undefined;
    let audit: Pool | undefined;
    try {
      await admin.query(M1_STORE_POSTGRES_MIGRATION_SQL);
      await admin.query(M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL);
      await admin.query(`
        SET ROLE ${M1_FACT_RETENTION_IDENTITY};
        SELECT * FROM ${M1_STORE_POSTGRES_SCHEMA}.ensure_market_fact_partitions(
          '2026-01-15'::date,
          '2026-01-15'::date,
          'm1-3-store-replay-rehearsal'
        );
        RESET ROLE;
      `);
      const migration = await admin.query<{
        version: string;
        checksum: string;
      }>(`
        SELECT version, checksum
        FROM ${M1_STORE_POSTGRES_SCHEMA}.schema_migrations
        WHERE version = $1
      `, [M1_STORE_SCHEMA_VERSION]);
      assert.deepEqual(migration.rows, [{
        version: M1_STORE_SCHEMA_VERSION,
        checksum: M1_STORE_POSTGRES_MIGRATION_CHECKSUM,
      }]);

      await admin.query(`
        CREATE ROLE ${LOGIN_IDENTITIES.writer} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
        CREATE ROLE ${LOGIN_IDENTITIES.reader} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
        CREATE ROLE ${LOGIN_IDENTITIES.replay} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
        CREATE ROLE ${LOGIN_IDENTITIES.audit} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
        GRANT ${M1_STORE_IDENTITIES.writer} TO ${LOGIN_IDENTITIES.writer};
        GRANT ${M1_STORE_IDENTITIES.reader} TO ${LOGIN_IDENTITIES.reader};
        GRANT ${M1_STORE_IDENTITIES.replay} TO ${LOGIN_IDENTITIES.replay};
        GRANT ${M1_STORE_IDENTITIES.audit} TO ${LOGIN_IDENTITIES.audit};
      `);
      writer = rolePool(databaseUrl, LOGIN_IDENTITIES.writer, M1_STORE_IDENTITIES.writer);
      reader = rolePool(databaseUrl, LOGIN_IDENTITIES.reader, M1_STORE_IDENTITIES.reader);
      replay = rolePool(databaseUrl, LOGIN_IDENTITIES.replay, M1_STORE_IDENTITIES.replay);
      audit = rolePool(databaseUrl, LOGIN_IDENTITIES.audit, M1_STORE_IDENTITIES.audit);

      const roleProof = await writer.query<{ current_user: string; session_user: string }>(
        "SELECT current_user, session_user",
      );
      assert.equal(roleProof.rows[0]!.current_user, M1_STORE_IDENTITIES.writer);
      assert.equal(roleProof.rows[0]!.session_user, LOGIN_IDENTITIES.writer);
      const roleAttributes = await admin.query<{
        rolname: string;
        rolcanlogin: boolean;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
      }>(`
        SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole
        FROM pg_roles
        WHERE rolname = ANY($1::text[])
        ORDER BY rolname
      `, [Object.values(M1_STORE_IDENTITIES)]);
      assert.equal(roleAttributes.rows.length, 5);
      assert.ok(roleAttributes.rows.every((role) =>
        !role.rolcanlogin && !role.rolsuper && !role.rolcreatedb && !role.rolcreaterole));

      const slice = await buildFrozenM1FeatureContextSlice();
      const retainUntil = new Date(Date.now() + 730 * 24 * 60 * 60 * 1_000)
        .toISOString();
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
      const writerStore = new M1PostgresArtifactStore(sqlPool(writer));
      const inserted = await writerStore.appendArtifacts(requests);
      assert.ok(inserted.every((result) => result.status === "INSERTED"));
      assert.ok(inserted.every((result) =>
        result.record.writerIdentity === M1_STORE_IDENTITIES.writer));
      const retried = await writerStore.appendArtifacts(requests);
      assert.ok(retried.every((result) => result.status === "IDEMPOTENT_REPLAY"));

      const changedFacts = slice.marketFacts.facts.map((fact, index) =>
        index === 0
          ? {
            ...fact,
            lineage: { ...fact.lineage, sourceId: "forged-source-identity" },
          }
          : fact);
      await assert.rejects(
        writerStore.appendArtifacts(requests.map((request) => {
          if (request.artifactName !== "PointInTimeMarketFact") {
            return request;
          }
          const replacement = changedFacts.find((fact) =>
            fact.factId === request.artifact.factId)!;
          return { ...request, artifact: replacement };
        })),
        (error: unknown) =>
          error instanceof M1StoreError && error.code === "IDEMPOTENCY_CONFLICT",
      );

      const privilegeProof = await admin.query<{
        writer_update: boolean;
        writer_delete: boolean;
        reader_insert: boolean;
        replay_artifact_insert: boolean;
        public_select: boolean;
      }>(`
        SELECT
          has_table_privilege($1, $4, 'UPDATE') AS writer_update,
          has_table_privilege($1, $4, 'DELETE') AS writer_delete,
          has_table_privilege($2, $4, 'INSERT') AS reader_insert,
          has_table_privilege($3, $4, 'INSERT') AS replay_artifact_insert,
          has_table_privilege('public', $4, 'SELECT') AS public_select
      `, [
        M1_STORE_IDENTITIES.writer,
        M1_STORE_IDENTITIES.reader,
        M1_STORE_IDENTITIES.replay,
        `${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger`,
      ]);
      assert.deepEqual(privilegeProof.rows[0], {
        writer_update: false,
        writer_delete: false,
        reader_insert: false,
        replay_artifact_insert: false,
        public_select: false,
      });
      await assert.rejects(
        writer.query(`UPDATE ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger SET payload = payload`),
        (error: unknown) => pgCode(error) === "42501",
      );
      await assert.rejects(
        reader.query(`INSERT INTO ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger DEFAULT VALUES`),
        (error: unknown) => pgCode(error) === "42501",
      );
      await assert.rejects(
        admin.query(`UPDATE ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger SET payload = payload`),
        (error: unknown) => pgCode(error) === "55000",
      );

      const records = inserted.map((result) => result.record);
      const universe = recordByName(records, "EligibleInstrumentSnapshot");
      const facts = records.filter((record) =>
        record.artifactName === "PointInTimeMarketFact") as
        M1StoredArtifactRecord<"PointInTimeMarketFact">[];
      const factQuality = recordByName(records, "FactQualitySnapshot");
      const onlineFeatureSet = recordByName(records, "FeatureSetSnapshot");
      const manifestSourceRecords: readonly M1StoredArtifactRecord[] = [
        universe,
        ...facts,
        factQuality,
        onlineFeatureSet,
      ];
      const knowledgeCutoff = manifestSourceRecords
        .map((record) => record.persistedAt)
        .sort()
        .at(-1)!;
      const createdAt = new Date().toISOString();
      assert.ok(Date.parse(createdAt) >= Date.parse(knowledgeCutoff));
      const manifest = buildM1ReplayManifest({
        createdAt,
        eventCutoff: slice.universe.sourceCutoff,
        knowledgeCutoff,
        universe,
        facts,
        factQuality,
        onlineFeatureSet,
      });
      const replayStore = new M1PostgresArtifactStore(sqlPool(replay));
      const manifestInsert = await replayStore.appendReplayManifest(
        manifest,
        retainUntil,
      );
      assert.equal(manifestInsert.status, "INSERTED");
      assert.equal(manifestInsert.record.replayIdentity, M1_STORE_IDENTITIES.replay);
      assert.equal(
        (await replayStore.appendReplayManifest(manifest, retainUntil)).status,
        "IDEMPOTENT_REPLAY",
      );

      const readerStore = new M1PostgresArtifactStore(sqlPool(reader));
      const storedManifest = await readerStore.readReplayManifest(manifest.manifestId);
      const replayResult = await runM1Replay({
        store: readerStore,
        manifest: storedManifest.manifest,
        replayRunId: "postgres16-durable-replay-run-1",
        replayRepeatRunId: "postgres16-durable-replay-run-2",
      });
      assert.equal(replayResult.featureQuality.onlineOfflineParity, "PASS");
      assert.equal(replayResult.featureQuality.replayDeterministic, true);

      const tamperTarget = facts[0]!;
      try {
        await admin.query(`ALTER TABLE ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE} DISABLE TRIGGER reject_partitioned_fact_mutation`);
        await admin.query(`
          UPDATE ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}
          SET payload = jsonb_set(payload, '{lineage,sourceId}', '"tampered-source"'::jsonb)
          WHERE artifact_name = $1 AND artifact_id = $2
        `, [tamperTarget.artifactName, tamperTarget.artifactId]);
        await admin.query(`ALTER TABLE ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE} ENABLE TRIGGER reject_partitioned_fact_mutation`);
        await assert.rejects(
          readerStore.readArtifact(tamperTarget.artifactName, tamperTarget.artifactId),
          (error: unknown) =>
            error instanceof M1StoreError &&
            error.code === "ARTIFACT_STORAGE_DIGEST_MISMATCH",
        );
      } finally {
        await admin.query(`ALTER TABLE ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE} DISABLE TRIGGER reject_partitioned_fact_mutation`);
        await admin.query(`
          UPDATE ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}
          SET payload = $3::jsonb
          WHERE artifact_name = $1 AND artifact_id = $2
        `, [
          tamperTarget.artifactName,
          tamperTarget.artifactId,
          JSON.stringify(tamperTarget.payload),
        ]);
        await admin.query(`ALTER TABLE ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE} ENABLE TRIGGER reject_partitioned_fact_mutation`);
      }
      await readerStore.readArtifact(tamperTarget.artifactName, tamperTarget.artifactId);

      const releaseRecord: ReleaseRecord = {
        schemaVersion: RUNTIME_OBJECT_SCHEMA_VERSIONS.ReleaseRecord,
        releaseId: "m1-test-release",
        producerModule: "runtime_security_release_control",
        generatedAt: createdAt,
        sourceCutoff: slice.universe.sourceCutoff,
        contentHash: manifest.manifestDigest,
        releaseRecordId: `rehearsal-release:${sourceCommit.slice(0, 24)}`,
        commit: sourceCommit,
        tree: sourceTree,
        artifactDigest: manifest.manifestDigest,
        imageDigests: {},
        databaseSchemaVersion: M1_STORE_SCHEMA_VERSION,
        featureVersions: [slice.onlineFeatureSet.featureSetVersion],
        ruleVersions: [slice.marketContext.contextRuleVersion],
        rollbackReleaseId: "rehearsal-no-production-rollback",
        evidenceDigest: manifest.manifestDigest,
      };
      const truthGeneratedAt = new Date().toISOString();
      const runtimeTruth = buildRuntimeTruthSnapshot({
        runtimeMode: "REHEARSAL",
        generatedAt: truthGeneratedAt,
        sourceCutoff: slice.universe.sourceCutoff,
        releaseId: "m1-test-release",
        liveness: {
          checkId: "process_liveness",
          status: "READY",
          checkedAt: truthGeneratedAt,
          evidenceIds: ["postgres16-ephemeral-process-ready"],
          reasonCodes: [],
        },
        dependencies: M1_RUNTIME_TRUTH_PROFILE.dependencyCheckIds.map(
          (checkId) => ({
            checkId,
            status: "READY" as const,
            checkedAt: truthGeneratedAt,
            evidenceIds: [M1_STORE_POSTGRES_MIGRATION_CHECKSUM],
            reasonCodes: [],
          }),
        ),
        businessCapabilities: M1_RUNTIME_TRUTH_PROFILE.businessCapabilityCheckIds.map(
          (checkId) => ({
            checkId,
            status: "READY" as const,
            checkedAt: truthGeneratedAt,
            evidenceIds: [manifest.manifestDigest],
            reasonCodes: [],
          }),
        ),
        factQuality: slice.marketFacts.qualitySnapshot,
        featureQuality: replayResult.featureQuality,
        releaseRecord,
        expectedRelease: {
          releaseId: "m1-test-release",
          commit: sourceCommit,
          tree: sourceTree,
          databaseSchemaVersion: M1_STORE_SCHEMA_VERSION,
          featureVersions: [slice.onlineFeatureSet.featureSetVersion],
        },
      });
      assert.equal(runtimeTruth.liveness, "READY");
      assert.equal(runtimeTruth.dependencyReadiness, "READY");
      assert.equal(runtimeTruth.dataFreshness, "FRESH");
      assert.equal(runtimeTruth.releaseValidity, "VALID");
      assert.equal(runtimeTruth.businessReadiness, "PARTIAL");

      const auditCount = await audit.query<{ count: string }>(`
        SELECT sum(count)::text AS count
        FROM (
          SELECT count(*)::bigint AS count
          FROM ${M1_STORE_POSTGRES_SCHEMA}.artifact_ledger
          UNION ALL
          SELECT count(*)::bigint AS count
          FROM ${M1_STORE_POSTGRES_SCHEMA}.${M1_PARTITIONED_FACT_TABLE}
        ) AS ledgers
      `);
      assert.equal(Number(auditCount.rows[0]!.count), inserted.length);
      console.log(`M1_REHEARSAL_EVIDENCE=${JSON.stringify({
        status: "PASS",
        postgresMajor: 16,
        productionConnected: false,
        artifactCount: inserted.length,
        appendOnlyMutationDenied: true,
        idempotencyConflictRejected: true,
        corruptionDetected: true,
        replayManifestId: manifest.manifestId,
        replayParity: replayResult.featureQuality.onlineOfflineParity,
        replayDeterministic: replayResult.featureQuality.replayDeterministic,
        runtimeMode: runtimeTruth.runtimeMode,
        businessReadiness: runtimeTruth.businessReadiness,
      })}`);
    } finally {
      await Promise.all([
        writer?.end(),
        reader?.end(),
        replay?.end(),
        audit?.end(),
      ]);
      await admin.end();
    }
  },
);
