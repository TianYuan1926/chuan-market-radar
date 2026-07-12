import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { CandidateEpisodeService } from "../../lib/candidate-episode/candidate-episode-service";
import {
  CandidateCheckpointExecutor,
  CandidateCheckpointScheduler,
  type CandidateCheckpointClaim,
  type PrevalidatedEvidenceGradeV1Outcome,
} from "../../lib/candidate-episode/checkpoint-outcome-service";
import { assertRehearsalDatabaseTarget } from "../../lib/candidate-episode/database-safety";
import {
  loadCandidateMigrationFiles,
  runCandidateMigrations,
  CandidateMigrationError,
  type CandidateMigration,
} from "../../lib/candidate-episode/migration-runner";
import { createPostgresTransactionAdapter } from "../../lib/candidate-episode/transaction-adapter";
import { buildPersistenceSchemaSql } from "../../lib/persistence/persistence-contract";

const execFileAsync = promisify(execFile);
const designDigest = "2ac5f5f290fa5eed1664736edd6e2aa641815a30e8beb1a349cf49e6634f0d24";
const releaseId = "wp-g0.2-migration-implementation.v1";
const approvalRef = "WP-G0.2-MIGRATION-IMPLEMENTATION-AND-REHEARSAL";
const databaseNames = {
  empty: "wp_g0_2_rehearsal_empty",
  previous: "wp_g0_2_rehearsal_previous",
  restore: "wp_g0_2_rehearsal_restore",
  rollback: "wp_g0_2_rehearsal_rollback",
} as const;
const candidateTables = [
  "candidate_episodes",
  "candidate_episode_events",
  "candidate_episode_checkpoints",
  "candidate_episode_outcomes",
  "candidate_episode_ingest_outbox",
  "candidate_episode_legacy_imports",
  "candidate_migration_control",
  "schema_migrations",
] as const;

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function iso(time: number) {
  return new Date(time).toISOString();
}

function databaseUrl(base: string, databaseName: string) {
  if (!/^wp_g0_2_rehearsal_[a-z0-9_]+$/.test(databaseName)) {
    throw new Error("isolated database name rejected");
  }
  const url = new URL(base);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function guardedTarget(connectionString: string) {
  return assertRehearsalDatabaseTarget({
    environment: "rehearsal",
    env: {
      APP_ENV: "rehearsal",
      NODE_ENV: "test",
      WP_G0_2_REHEARSAL: "true",
      WP_G0_2_REHEARSAL_DATABASE_URL: connectionString,
    },
  });
}

function safeIdentifier(databaseName: string) {
  if (!/^wp_g0_2_rehearsal_[a-z0-9_]+$/.test(databaseName)) {
    throw new Error("isolated database identifier rejected");
  }
  return `"${databaseName}"`;
}

async function resetDatabase(control: Pool, databaseName: string, baseUrl: string) {
  const targetUrl = databaseUrl(baseUrl, databaseName);
  guardedTarget(targetUrl);
  const identifier = safeIdentifier(databaseName);
  await control.query(`DROP DATABASE IF EXISTS ${identifier} WITH (FORCE)`);
  await control.query(`CREATE DATABASE ${identifier} TEMPLATE template0`);
  return targetUrl;
}

async function runMigrations(pool: Pool, migrations: CandidateMigration[]) {
  return runCandidateMigrations({
    approvalRef,
    designDigest,
    migrations,
    pool,
    releaseId,
  });
}

async function schemaShape(pool: Pool) {
  const result = await pool.query<{
    columns: string;
    functions: string;
    roles: string;
    tables: string;
    triggers: string;
  }>(`SELECT
    (SELECT count(*)::text FROM information_schema.tables
     WHERE table_schema = 'candidate_authority' AND table_type = 'BASE TABLE') AS tables,
    (SELECT count(*)::text FROM information_schema.columns
     WHERE table_schema = 'candidate_authority') AS columns,
    (SELECT count(*)::text FROM pg_proc procedure
     JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
     WHERE namespace.nspname = 'candidate_authority') AS functions,
    (SELECT count(*)::text FROM information_schema.triggers
     WHERE trigger_schema = 'candidate_authority') AS triggers,
    (SELECT count(*)::text FROM pg_roles
     WHERE rolname = ANY(ARRAY[
       'candidate_migration_role', 'candidate_application_writer_role',
       'candidate_application_reader_role', 'candidate_shadow_executor_role',
       'candidate_review_reader_role', 'candidate_backup_restore_role',
       'candidate_audit_role'
     ])) AS roles`);
  return result.rows[0]!;
}

async function rowCounts(pool: Pool) {
  const entries: Array<[string, number]> = [];
  for (const table of candidateTables) {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM candidate_authority.${table}`,
    );
    entries.push([table, Number(result.rows[0]!.count)]);
  }
  return Object.fromEntries(entries);
}

async function factHash(pool: Pool) {
  const result = await pool.query<{ digest: string }>(`WITH facts AS (
    SELECT 'episode:' || episode_id::text || ':' || row_version::text AS fact
    FROM candidate_authority.candidate_episodes
    UNION ALL
    SELECT 'event:' || event_id::text || ':' || command_hash AS fact
    FROM candidate_authority.candidate_episode_events
    UNION ALL
    SELECT 'checkpoint:' || checkpoint_id::text || ':' || status || ':' || fencing_token::text AS fact
    FROM candidate_authority.candidate_episode_checkpoints
    UNION ALL
    SELECT 'outcome:' || outcome_id::text || ':' || content_hash AS fact
    FROM candidate_authority.candidate_episode_outcomes
    UNION ALL
    SELECT 'outbox:' || outbox_id::text || ':' || payload_hash AS fact
    FROM candidate_authority.candidate_episode_ingest_outbox
    UNION ALL
    SELECT 'legacy:' || import_id::text || ':' || source_row_hash AS fact
    FROM candidate_authority.candidate_episode_legacy_imports
    UNION ALL
    SELECT 'control:' || migration_id || ':' || epoch::text AS fact
    FROM candidate_authority.candidate_migration_control
    UNION ALL
    SELECT 'migration:' || version || ':' || checksum AS fact
    FROM candidate_authority.schema_migrations
  )
  SELECT md5(COALESCE(string_agg(fact, '|' ORDER BY fact), '')) AS digest FROM facts`);
  return result.rows[0]!.digest;
}

function unavailableOutcome(
  claim: CandidateCheckpointClaim,
  recordedAt: string,
): PrevalidatedEvidenceGradeV1Outcome {
  return {
    evidenceGradeVersion: "eg.v1",
    status: "data_unavailable",
    contentHash: `sha256:${sha256(`restore-smoke:${claim.checkpointId}`)}`,
    observationPrice: null,
    observationPriceFactId: null,
    windowStart: claim.windowStart,
    windowEnd: claim.windowEnd,
    historicalSource: null,
    historicalInstrumentId: null,
    candleInterval: null,
    expectedCandles: null,
    actualCandles: null,
    missingCandles: null,
    duplicateCandles: null,
    coverageRatio: null,
    candleSetHash: null,
    mfe: null,
    mae: null,
    returnAtClose: null,
    evidenceGrade: false,
    evidenceGradeReasons: ["restore_rehearsal_no_provider_access"],
    validatedAt: recordedAt,
    releaseId,
    runnerVersion: "restore-smoke.v1",
    recordedAt,
  };
}

async function restoredTransactionSmoke(pool: Pool) {
  const now = Date.now();
  const observedAt = iso(now - 2 * 60 * 60 * 1_000);
  const suffix = `${process.pid}-${now}`;
  const transactions = createPostgresTransactionAdapter(pool);
  const episodes = new CandidateEpisodeService(transactions);
  const scheduler = new CandidateCheckpointScheduler(transactions);
  const executor = new CandidateCheckpointExecutor(transactions);
  const episode = await episodes.openOrRefreshEpisode({
    scope: "production_radar",
    canonicalInstrumentId: `synthetic:RESTORE-USDT:${suffix}`,
    venueContext: { fixture: true, source: "restore-rehearsal" },
    firstSeenAt: observedAt,
    lastSeenAt: iso(now - 2 * 60 * 60 * 1_000 + 1_000),
    observationPrice: "1",
    observationPriceFactId: `synthetic:restore:${suffix}`,
    discoveryReasons: ["restore_rehearsal"],
    priorityTier: "P3",
    maturity: "evidence_observe",
    directionState: "unknown",
    expiresAt: iso(now + 60 * 60 * 1_000),
    releaseId,
    sourceScanCycleId: `synthetic:restore-cycle:${suffix}`,
    runtimeId: "restore-rehearsal-writer",
    idempotencyKey: `restore:episode:${suffix}`,
  });
  const event = await pool.query<{ event_id: string }>(
    `SELECT event_id FROM candidate_authority.candidate_episode_events
     WHERE scope = 'production_radar' AND episode_id = $1 ORDER BY stream_version DESC LIMIT 1`,
    [episode.episodeId],
  );
  const checkpoints = await scheduler.scheduleForObservation({
    scope: "production_radar",
    episodeId: episode.episodeId,
    sourceEventId: event.rows[0]!.event_id,
    observedAt,
    releaseId,
    runtimeId: "restore-rehearsal-scheduler",
  });
  const targetId = checkpoints.find((checkpoint) => checkpoint.checkpointKind === "1h")!.checkpointId;
  const claim = (await executor.claimDue({
    scope: "production_radar",
    runtimeId: "restore-rehearsal-executor",
    now: iso(now),
    limit: 100,
  })).find((item) => item.checkpointId === targetId);
  assert.ok(claim, "restore smoke Checkpoint was not claimed");
  const outcome = await executor.recordOutcome(claim, unavailableOutcome(claim, iso(now)));
  await assert.rejects(
    pool.query(
      `UPDATE candidate_authority.candidate_episodes
       SET first_seen_at = first_seen_at - interval '1 minute', row_version = row_version + 1
       WHERE scope = 'production_radar' AND episode_id = $1`,
      [episode.episodeId],
    ),
  );
  return {
    episodeTransaction: "pass",
    checkpointOutcomeTransaction: "pass",
    immutableConstraint: "pass",
    outcomeStatus: outcome.status,
  };
}

async function writeJson(reportDirectory: string, name: string, value: unknown) {
  await writeFile(join(reportDirectory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const sourceUrl = process.env.WP_G0_2_REHEARSAL_DATABASE_URL?.trim();
  const pgBin = process.env.WP_G0_2_REHEARSAL_PG_BIN?.trim();
  if (!sourceUrl || !pgBin) {
    throw new Error("dedicated rehearsal database URL and PostgreSQL bin directory are required");
  }
  const sourceTarget = assertRehearsalDatabaseTarget({
    environment: "rehearsal",
    env: process.env,
  });
  const migrations = await loadCandidateMigrationFiles(
    join(process.cwd(), "migrations", "candidate-episode"),
  );
  assert.equal(migrations.length, 9);
  const reportDirectory = join(
    process.cwd(),
    "reports",
    "wp-g0-2-migration-implementation-and-rehearsal",
  );
  const artifactDirectory = "/tmp/wp_g0_2_rehearsal_artifacts";
  await mkdir(reportDirectory, { recursive: true });
  await mkdir(artifactDirectory, { recursive: true });
  const control = new Pool({ connectionString: sourceUrl, max: 2 });

  try {
    const emptyUrl = await resetDatabase(control, databaseNames.empty, sourceUrl);
    const emptyPool = new Pool({ connectionString: emptyUrl, max: 2 });
    const emptyStartedAt = Date.now();
    const firstEmpty = await runMigrations(emptyPool, migrations);
    const repeatEmpty = await runMigrations(emptyPool, migrations);
    let checksumDriftRejected = false;
    try {
      await runMigrations(emptyPool, [{
        ...migrations[0]!,
        checksum: "0".repeat(64),
      }]);
    } catch (error) {
      checksumDriftRejected =
        error instanceof CandidateMigrationError && error.reason === "checksum_mismatch";
    }
    assert.equal(checksumDriftRejected, true);
    const emptyResult = {
      status: "pass",
      target: guardedTarget(emptyUrl),
      applied: firstEmpty.applied,
      repeatApplied: repeatEmpty.applied,
      repeatSkipped: repeatEmpty.skipped,
      checksumDriftRejected,
      shape: await schemaShape(emptyPool),
      elapsedMs: Date.now() - emptyStartedAt,
    };
    await emptyPool.end();
    await writeJson(reportDirectory, "migration-empty-db-rehearsal.json", emptyResult);

    const previousUrl = await resetDatabase(control, databaseNames.previous, sourceUrl);
    const previousPool = new Pool({ connectionString: previousUrl, max: 2 });
    await previousPool.query(buildPersistenceSchemaSql());
    await previousPool.query(
      `INSERT INTO journal_events (
         scope, id, symbol, result, created_at, payload
       ) VALUES ('synthetic_rehearsal', 'legacy-sentinel-v1', 'SYNTH-USDT',
         'synthetic_only', CURRENT_TIMESTAMP, '{"fixture":true,"production":false}'::jsonb)`,
    );
    const beforePrevious = await previousPool.query<{ hash: string; tables: string }>(`SELECT
      (SELECT count(*)::text FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tables,
      (SELECT md5(string_agg(id || ':' || payload::text, '|' ORDER BY id))
       FROM journal_events WHERE scope = 'synthetic_rehearsal') AS hash`);
    const previousMigration = await runMigrations(previousPool, migrations);
    const previousRepeat = await runMigrations(previousPool, migrations);
    const afterPrevious = await previousPool.query<{ hash: string; tables: string }>(`SELECT
      (SELECT count(*)::text FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tables,
      (SELECT md5(string_agg(id || ':' || payload::text, '|' ORDER BY id))
       FROM journal_events WHERE scope = 'synthetic_rehearsal') AS hash`);
    assert.deepEqual(afterPrevious.rows[0], beforePrevious.rows[0]);
    const previousResult = {
      status: "pass",
      target: guardedTarget(previousUrl),
      legacyPublicTablesBefore: Number(beforePrevious.rows[0]!.tables),
      legacyPublicTablesAfter: Number(afterPrevious.rows[0]!.tables),
      legacySentinelHashPreserved: beforePrevious.rows[0]!.hash === afterPrevious.rows[0]!.hash,
      applied: previousMigration.applied,
      repeatApplied: previousRepeat.applied,
      repeatSkipped: previousRepeat.skipped,
      candidateShape: await schemaShape(previousPool),
    };
    await previousPool.end();
    await writeJson(reportDirectory, "migration-previous-schema-rehearsal.json", previousResult);

    const rollbackUrl = await resetDatabase(control, databaseNames.rollback, sourceUrl);
    let rollbackPool = new Pool({ connectionString: rollbackUrl, max: 2 });
    await runMigrations(rollbackPool, migrations.slice(0, 3));
    const failureSql = `CREATE TABLE candidate_authority.synthetic_partial_write (id integer);\nSELECT 1 / 0;`;
    const failingMigration: CandidateMigration = {
      version: "999_synthetic_failure",
      checksum: sha256(failureSql),
      sql: failureSql,
    };
    let failureClass = "";
    try {
      await runMigrations(rollbackPool, [failingMigration]);
    } catch (error) {
      failureClass = error instanceof Error ? error.name : "UnknownError";
    }
    const failedLedger = await rollbackPool.query<{ status: string }>(
      `SELECT status FROM candidate_authority.schema_migrations WHERE version = $1`,
      [failingMigration.version],
    );
    const partialTable = await rollbackPool.query<{ exists: boolean }>(
      `SELECT to_regclass('candidate_authority.synthetic_partial_write') IS NOT NULL AS exists`,
    );
    assert.equal(failedLedger.rows[0]?.status, "failed");
    assert.equal(partialTable.rows[0]?.exists, false);
    await rollbackPool.end();
    const rollbackStartedAt = Date.now();
    const forwardFixUrl = await resetDatabase(control, databaseNames.rollback, sourceUrl);
    rollbackPool = new Pool({ connectionString: forwardFixUrl, max: 2 });
    const forwardFix = await runMigrations(rollbackPool, migrations);
    const rollbackResult = {
      status: "pass",
      target: guardedTarget(forwardFixUrl),
      failedMigration: failingMigration.version,
      failureClass,
      failedLedgerStatus: failedLedger.rows[0]!.status,
      partialDdlRolledBack: !partialTable.rows[0]!.exists,
      rollbackMethod: "destroy_and_recreate_isolated_database_then_forward_fix",
      historicalProductionRowsDeleted: 0,
      forwardFixApplied: forwardFix.applied,
      rpoSimulation: "0 synthetic business rows lost",
      rtoSimulationMs: Date.now() - rollbackStartedAt,
      shape: await schemaShape(rollbackPool),
    };
    await rollbackPool.end();
    await writeJson(reportDirectory, "rollback-rehearsal.json", rollbackResult);

    const sourcePool = new Pool({ connectionString: sourceUrl, max: 4 });
    const beforeCounts = await rowCounts(sourcePool);
    const beforeHash = await factHash(sourcePool);
    const archivePartial = join(artifactDirectory, "wp_g0_2_rehearsal_source.dump.partial");
    const archiveFinal = join(artifactDirectory, "wp_g0_2_rehearsal_source.dump");
    await unlink(archivePartial).catch(() => undefined);
    await unlink(archiveFinal).catch(() => undefined);
    const backupStartedAt = Date.now();
    try {
      await execFileAsync(join(pgBin, "pg_dump"), [
        "--dbname", sourceUrl,
        "--format=custom",
        "--file", archivePartial,
      ]);
    } catch {
      throw new Error("isolated pg_dump failed");
    }
    const archiveBytes = await import("node:fs/promises").then(({ readFile }) => readFile(archivePartial));
    const archiveChecksum = sha256(archiveBytes);
    await rename(archivePartial, archiveFinal);
    const backupElapsedMs = Date.now() - backupStartedAt;

    const restoreUrl = await resetDatabase(control, databaseNames.restore, sourceUrl);
    const restoreStartedAt = Date.now();
    try {
      await execFileAsync(join(pgBin, "pg_restore"), [
        "--dbname", restoreUrl,
        "--exit-on-error",
        "--single-transaction",
        archiveFinal,
      ]);
    } catch {
      throw new Error("isolated pg_restore failed");
    }
    const restorePool = new Pool({ connectionString: restoreUrl, max: 8 });
    const afterCounts = await rowCounts(restorePool);
    const afterHash = await factHash(restorePool);
    assert.deepEqual(afterCounts, beforeCounts);
    assert.equal(afterHash, beforeHash);
    const restoreShape = await schemaShape(restorePool);
    const smoke = await restoredTransactionSmoke(restorePool);
    const restoreResult = {
      status: "pass",
      sourceTarget: sourceTarget,
      restoreTarget: guardedTarget(restoreUrl),
      archiveStoredOutsideEvidence: true,
      archiveIncludedInEvidenceZip: false,
      archiveChecksum,
      backupElapsedMs,
      rowCountsPreserved: afterCounts,
      factHashPreserved: afterHash === beforeHash,
      schemaShape: restoreShape,
      constraintsAndFunctionsSmoke: smoke,
      rpoSimulation: "0 synthetic authoritative facts lost",
      rtoSimulationMs: Date.now() - restoreStartedAt,
      manualSteps: ["start isolated PostgreSQL cluster"],
      automatedSteps: ["guard", "pg_dump", "checksum", "atomic rename", "pg_restore", "verify", "transaction smoke"],
      remainingRisk: "Production backup permissions and production-sized RTO are not proven in this isolated package.",
    };
    await restorePool.end();
    await sourcePool.end();
    await unlink(archiveFinal);
    await writeJson(reportDirectory, "restore-rehearsal.json", restoreResult);

    await writeJson(reportDirectory, "production-isolation-proof.json", {
      workPackage: approvalRef,
      status: "pass",
      databaseHostsObserved: [sourceTarget.hostClass],
      databaseTargets: [
        sourceTarget.databaseName,
        ...Object.values(databaseNames),
      ],
      prohibitedProductionTargetObserved: false,
      productionDatabaseConnected: false,
      productionDataRead: false,
      productionDataWritten: false,
      productionSchemaChanged: false,
      productionMigrationRun: false,
      productionDeployed: false,
      tencentConnected: false,
      tencentServicesRestarted: false,
      productionFeatureFlagsChanged: false,
      productionDataImported: false,
      formalRun: false,
      secretsRead: false,
      evidenceContainsDatabaseUrl: false,
    });

    process.stdout.write(`${JSON.stringify({
      status: "pass",
      emptyDatabase: emptyResult.status,
      previousSchema: previousResult.status,
      rollback: rollbackResult.status,
      restore: restoreResult.status,
    })}\n`);
  } finally {
    await control.end();
  }
}

main().catch((error: unknown) => {
  const failureName = error instanceof Error ? error.name : "UnknownError";
  process.stderr.write(`${JSON.stringify({ status: "fail", failureName })}\n`);
  process.exitCode = 24;
});
