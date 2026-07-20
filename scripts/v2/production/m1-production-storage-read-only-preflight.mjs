#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const P0_DATABASE_FACTS_SCHEMA_VERSION =
  "v2-m1-production-storage-database-read-only-facts.v1";
export const P0_HOST_FACTS_SCHEMA_VERSION =
  "v2-m1-production-storage-host-read-only-facts.v1";
export const P0_RECOVERY_EVIDENCE_SCHEMA_VERSION =
  "v2-m1-production-storage-recovery-evidence.v1";
export const P0_REPORT_SCHEMA_VERSION =
  "v2-m1-production-storage-read-only-preflight-report.v1";

export const P0_EXPECTED_MIGRATIONS = Object.freeze([
  Object.freeze({
    checksum:
      "sha256:88915ee4a13d14eb03eae6172bb57a52b5929f69b4c4f7232dcf987041644f51",
    version: "v2-m1-artifact-store.v1",
  }),
  Object.freeze({
    checksum:
      "sha256:fa04652c2c72f00c3a6f1f5cd1b39f2b9f098f998dffd3cb275a54b7e030f37d",
    version: "v2-m1-collector-checkpoint.v1",
  }),
  Object.freeze({
    checksum:
      "sha256:9a507139b88efa86a5bb5d4593149881a4e8fad8081f27e5a7ada791c8ac7303",
    version: "v2-m1-partitioned-fact-store.v1",
  }),
]);

const GIB = 1024 ** 3;
const EVIDENCE_MAX_AGE_MS = 15 * 60_000;
const BACKUP_MAX_AGE_MS = 90 * 60_000;
const RESTORE_MAX_AGE_MS = 90 * 24 * 60 * 60_000;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MIGRATION_ROLE = "market_radar_v2_m1_migration";
const BASE_ROLES = Object.freeze([
  "market_radar_v2_m1_audit",
  "market_radar_v2_m1_migration",
  "market_radar_v2_m1_reader",
  "market_radar_v2_m1_replay",
  "market_radar_v2_m1_writer",
]);
const RETENTION_ROLE = "market_radar_v2_m1_retention";

export const P0_CAPACITY_POLICY = Object.freeze({
  b1b3EvidenceDigest:
    "sha256:58b5d118503def8287642b78e12eb895a26130ac0ecb12b52bbf06e82ce51860",
  cycleIntervalMs: 60_000,
  factRowsPerCycle: 1_444,
  maximumProjectedDiskUsePercent: 70,
  maximumRuntimeConnectionUsePercent: 70,
  nonFactOverheadBytes: 4 * GIB,
  perFactStorageBudgetBytes: 8 * 1024,
  requiredShadowHours: 30,
  restoreMaximumAgeDays: 90,
  rpoMaximumMinutes: 24 * 60,
  rtoMaximumMinutes: 2 * 60,
});

const STAGE_CONTRACTS = Object.freeze({
  BASE_EXACT: Object.freeze({
    functions: ["reject_ledger_mutation"],
    migrations: P0_EXPECTED_MIGRATIONS.slice(0, 1),
    relations: [
      "artifact_ledger",
      "replay_manifest_ledger",
      "schema_migrations",
    ],
    roles: BASE_ROLES,
    triggers: [
      "artifact_ledger:reject_artifact_ledger_mutation",
      "replay_manifest_ledger:reject_replay_manifest_mutation",
      "schema_migrations:reject_schema_migration_mutation",
    ],
  }),
  CHECKPOINT_EXACT: Object.freeze({
    functions: [
      "reject_ledger_mutation",
      "validate_collector_checkpoint_references",
    ],
    migrations: P0_EXPECTED_MIGRATIONS.slice(0, 2),
    relations: [
      "artifact_ledger",
      "collector_cycle_checkpoint_ledger",
      "replay_manifest_ledger",
      "schema_migrations",
    ],
    roles: BASE_ROLES,
    triggers: [
      "artifact_ledger:reject_artifact_ledger_mutation",
      "collector_cycle_checkpoint_ledger:reject_collector_checkpoint_mutation",
      "collector_cycle_checkpoint_ledger:validate_collector_checkpoint_references",
      "replay_manifest_ledger:reject_replay_manifest_mutation",
      "schema_migrations:reject_schema_migration_mutation",
    ],
  }),
  PARTITION_EXACT: Object.freeze({
    functions: [
      "drop_expired_market_fact_partitions",
      "ensure_market_fact_partitions",
      "inspect_market_fact_partitions",
      "register_point_in_time_market_fact_identity",
      "reject_ledger_mutation",
      "reject_unpartitioned_market_fact_insert",
      "validate_collector_checkpoint_references",
    ],
    migrations: P0_EXPECTED_MIGRATIONS,
    relations: [
      "artifact_ledger",
      "collector_cycle_checkpoint_ledger",
      "market_fact_backup_evidence_ledger",
      "market_fact_partition_event_ledger",
      "market_fact_retention_run_ledger",
      "point_in_time_market_fact_active_identity_registry",
      "point_in_time_market_fact_ledger",
      "replay_manifest_ledger",
      "schema_migrations",
    ],
    roles: [...BASE_ROLES, RETENTION_ROLE].sort(),
    triggers: [
      "artifact_ledger:reject_artifact_ledger_mutation",
      "artifact_ledger:reject_unpartitioned_market_fact_insert",
      "collector_cycle_checkpoint_ledger:reject_collector_checkpoint_mutation",
      "collector_cycle_checkpoint_ledger:validate_collector_checkpoint_references",
      "market_fact_backup_evidence_ledger:reject_fact_backup_evidence_mutation",
      "market_fact_partition_event_ledger:reject_fact_partition_event_mutation",
      "market_fact_retention_run_ledger:reject_fact_retention_run_mutation",
      "point_in_time_market_fact_ledger:register_point_in_time_market_fact_identity",
      "point_in_time_market_fact_ledger:reject_partitioned_fact_mutation",
      "replay_manifest_ledger:reject_replay_manifest_mutation",
      "schema_migrations:reject_schema_migration_mutation",
    ],
  }),
});

export const P0_READ_ONLY_SQL = Object.freeze({
  activeIdentityCount: `SELECT count(*)::text AS count
    FROM market_radar_v2.point_in_time_market_fact_active_identity_registry`,
  backupEvidenceCount: `SELECT count(*)::text AS count
    FROM market_radar_v2.market_fact_backup_evidence_ledger`,
  begin:
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
  databaseIdentity: `SELECT
      current_database() AS database_name,
      COALESCE(inet_server_addr()::text, 'local-socket') AS server_address,
      COALESCE(inet_server_port(), 0)::int AS server_port`,
  databaseRoleAttributes: `SELECT
      rolname AS role_name,
      rolcanlogin AS can_login,
      rolsuper AS superuser,
      rolcreatedb AS create_database,
      rolcreaterole AS create_role,
      rolinherit AS inherit,
      rolreplication AS replication,
      rolbypassrls AS bypass_rls
    FROM pg_roles
    WHERE rolname = ANY($1::text[])
    ORDER BY rolname`,
  dmlCounters: `SELECT
      COALESCE(sum(n_tup_ins), 0)::text AS inserted_rows,
      COALESCE(sum(n_tup_upd), 0)::text AS updated_rows,
      COALESCE(sum(n_tup_del), 0)::text AS deleted_rows
    FROM pg_stat_xact_user_tables`,
  functions: `SELECT DISTINCT p.proname AS name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'market_radar_v2'
    ORDER BY p.proname`,
  legacyFactCount: `SELECT count(*)::text AS count
    FROM market_radar_v2.artifact_ledger
    WHERE artifact_name = 'PointInTimeMarketFact'`,
  migrations: `SELECT version, checksum
    FROM market_radar_v2.schema_migrations
    ORDER BY version`,
  partitionCount: `SELECT count(*)::text AS partition_count
    FROM pg_inherits
    WHERE inhparent = to_regclass('market_radar_v2.point_in_time_market_fact_ledger')`,
  partitionedFactCount: `SELECT count(*)::text AS count
    FROM market_radar_v2.point_in_time_market_fact_ledger`,
  relationPresence: `SELECT
      to_regnamespace('market_radar_v2') IS NOT NULL AS schema_exists,
      to_regclass('market_radar_v2.schema_migrations') IS NOT NULL AS migrations_exist,
      to_regclass('market_radar_v2.artifact_ledger') IS NOT NULL AS artifact_ledger_exists,
      to_regclass('market_radar_v2.point_in_time_market_fact_ledger') IS NOT NULL AS partitioned_ledger_exists,
      to_regclass('market_radar_v2.point_in_time_market_fact_active_identity_registry') IS NOT NULL AS active_identity_registry_exists,
      to_regclass('market_radar_v2.market_fact_backup_evidence_ledger') IS NOT NULL AS backup_evidence_ledger_exists,
      to_regclass('market_radar_v2.market_fact_retention_run_ledger') IS NOT NULL AS retention_run_ledger_exists`,
  relations: `SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'market_radar_v2'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    ORDER BY c.relname`,
  rollback: "ROLLBACK",
  retentionRunCount: `SELECT count(*)::text AS count
    FROM market_radar_v2.market_fact_retention_run_ledger`,
  runtime: `SELECT
      (SELECT count(*)::int FROM pg_stat_activity
        WHERE datname = current_database()) AS active_connections,
      current_setting('max_connections')::int AS max_connections,
      current_setting('superuser_reserved_connections')::int AS reserved_connections,
      (SELECT count(*)::int FROM pg_locks WHERE NOT granted) AS waiting_lock_count,
      (SELECT count(*)::int FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
          AND xact_start < clock_timestamp() - interval '5 minutes') AS long_transaction_count,
      (SELECT count(*)::int FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
          AND state = 'idle in transaction'
          AND state_change < clock_timestamp() - interval '5 minutes') AS idle_in_transaction_count,
      (SELECT count(*)::int FROM pg_prepared_xacts) AS prepared_transaction_count`,
  schemaOwner: `SELECT r.rolname AS schema_owner
    FROM pg_namespace n
    JOIN pg_roles r ON r.oid = n.nspowner
    WHERE n.nspname = 'market_radar_v2'`,
  server: `SELECT
      current_setting('server_version_num')::int AS server_version_num,
      current_setting('TimeZone') AS server_default_time_zone,
      pg_is_in_recovery() AS in_recovery,
      current_setting('data_checksums') AS data_checksums,
      current_setting('archive_mode') AS archive_mode,
      current_setting('archive_command') NOT IN ('', '(disabled)') AS archive_command_configured,
      pg_database_size(current_database())::text AS database_size_bytes,
      COALESCE((SELECT sum(size) FROM pg_ls_waldir()), 0)::text AS wal_directory_bytes,
      pg_size_bytes(current_setting('max_wal_size'))::text AS max_wal_bytes,
      clock_timestamp() AS captured_at`,
  sessionIdentity: `SELECT
      session_user AS session_role,
      current_user AS effective_role,
      current_setting('transaction_read_only') AS transaction_read_only,
      current_setting('transaction_isolation') AS transaction_isolation,
      current_setting('TimeZone') AS probe_time_zone,
      txid_current_if_assigned()::text AS transaction_id`,
  setDataRole: "SET LOCAL ROLE pg_read_all_data",
  setLimits: `SET LOCAL statement_timeout = '60s';
    SET LOCAL lock_timeout = '3s';
    SET LOCAL idle_in_transaction_session_timeout = '90s'`,
  setMonitorRole: "SET LOCAL ROLE pg_monitor",
  setUtc: "SET LOCAL TIME ZONE 'UTC'",
  triggers: `SELECT c.relname || ':' || t.tgname AS name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'market_radar_v2'
      AND NOT t.tgisinternal
    ORDER BY c.relname, t.tgname`,
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  assert.ok(isRecord(value), `${label} must be an object`);
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    `${label} fields must be exact`,
  );
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  assert.notEqual(value, undefined, "canonical evidence cannot contain undefined");
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), "canonical evidence numbers must be finite");
  }
  return value;
}

export function stableDigest(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex")}`;
}

function byteDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function text(value, label, pattern = /^.{1,512}$/u) {
  assert.equal(typeof value, "string", `${label} must be text`);
  assert.match(value, pattern, `${label} is invalid`);
  return value;
}

function boolean(value, label) {
  assert.equal(typeof value, "boolean", `${label} must be boolean`);
  return value;
}

function integer(value, label, { positive = false } = {}) {
  assert.ok(
    Number.isSafeInteger(value) && (positive ? value > 0 : value >= 0),
    `${label} must be a ${positive ? "positive" : "non-negative"} safe integer`,
  );
  return value;
}

function iso(value, label) {
  text(value, label, ISO_PATTERN);
  assert.equal(new Date(value).toISOString(), value, `${label} must be canonical UTC`);
  return value;
}

function digest(value, label) {
  return text(value, label, SHA256_PATTERN);
}

function commit(value, label) {
  return text(value, label, COMMIT_PATTERN);
}

function nullable(value, validator, label) {
  return value === null ? null : validator(value, label);
}

function sortedUniqueStrings(values, label, pattern = /^[A-Za-z0-9_.:-]{1,128}$/u) {
  assert.ok(Array.isArray(values), `${label} must be an array`);
  const result = values.map((value, index) =>
    text(value, `${label}[${index}]`, pattern)).sort();
  assert.equal(new Set(result).size, result.length, `${label} must be unique`);
  return result;
}

function roleAttributes(value, label) {
  exactKeys(value, [
    "bypassRls",
    "canLogin",
    "createDatabase",
    "createRole",
    "inherit",
    "replication",
    "roleName",
    "superuser",
  ], label);
  return {
    bypassRls: boolean(value.bypassRls, `${label}.bypassRls`),
    canLogin: boolean(value.canLogin, `${label}.canLogin`),
    createDatabase: boolean(value.createDatabase, `${label}.createDatabase`),
    createRole: boolean(value.createRole, `${label}.createRole`),
    inherit: boolean(value.inherit, `${label}.inherit`),
    replication: boolean(value.replication, `${label}.replication`),
    roleName: text(value.roleName, `${label}.roleName`, /^[a-z][a-z0-9_]{1,62}$/u),
    superuser: boolean(value.superuser, `${label}.superuser`),
  };
}

function normalizeMigrations(values, label) {
  assert.ok(Array.isArray(values), `${label} must be an array`);
  const result = values.map((value, index) => {
    exactKeys(value, ["checksum", "version"], `${label}[${index}]`);
    return {
      checksum: digest(value.checksum, `${label}[${index}].checksum`),
      version: text(value.version, `${label}[${index}].version`, /^v2-[a-z0-9.-]{1,96}$/u),
    };
  }).sort((left, right) => left.version.localeCompare(right.version));
  assert.equal(
    new Set(result.map((entry) => entry.version)).size,
    result.length,
    `${label} versions must be unique`,
  );
  return result;
}

function normalizeDatabaseFacts(value) {
  exactKeys(value, [
    "boundary",
    "capturedAt",
    "identity",
    "probeScriptDigest",
    "runtime",
    "schemaVersion",
    "server",
    "sourceCommit",
    "storage",
    "transaction",
  ], "databaseFacts");
  assert.equal(value.schemaVersion, P0_DATABASE_FACTS_SCHEMA_VERSION);
  exactKeys(value.boundary, [
    "automaticTradingAllowed",
    "candidateEmissionAllowed",
    "migrationPerformed",
    "productionDatabaseMutation",
    "productionServiceMutation",
  ], "databaseFacts.boundary");
  exactKeys(value.identity, [
    "constrainedRoleSwitchesSucceeded",
    "dataRole",
    "databaseIdentityDigest",
    "monitorRole",
    "sessionRole",
    "sessionRoleAttributes",
  ], "databaseFacts.identity");
  exactKeys(value.runtime, [
    "activeConnections",
    "idleInTransactionCount",
    "longTransactionCount",
    "maxConnections",
    "preparedTransactionCount",
    "reservedConnections",
    "waitingLockCount",
  ], "databaseFacts.runtime");
  exactKeys(value.server, [
    "archiveCommandConfigured",
    "archiveMode",
    "dataChecksums",
    "databaseSizeBytes",
    "inRecovery",
    "maxWalBytes",
    "postgresMajor",
    "probeTimeZone",
    "serverDefaultTimeZone",
    "serverVersionNum",
    "walDirectoryBytes",
  ], "databaseFacts.server");
  exactKeys(value.storage, [
    "activeIdentityCount",
    "backupEvidenceCount",
    "capabilityRoles",
    "functions",
    "legacyFactCount",
    "migrations",
    "partitionCount",
    "partitionedFactCount",
    "relations",
    "retentionRunCount",
    "schemaExists",
    "schemaOwner",
    "triggers",
  ], "databaseFacts.storage");
  exactKeys(value.transaction, [
    "deletedRows",
    "insertedRows",
    "isolation",
    "readOnly",
    "transactionIdAssignedAfter",
    "transactionIdAssignedBefore",
    "updatedRows",
  ], "databaseFacts.transaction");

  const capabilityRoles = value.storage.capabilityRoles.map((role, index) =>
    roleAttributes(role, `databaseFacts.storage.capabilityRoles[${index}]`))
    .sort((left, right) => left.roleName.localeCompare(right.roleName));
  assert.equal(
    new Set(capabilityRoles.map((role) => role.roleName)).size,
    capabilityRoles.length,
    "databaseFacts.storage.capabilityRoles must be unique",
  );

  return {
    boundary: {
      automaticTradingAllowed: boolean(
        value.boundary.automaticTradingAllowed,
        "databaseFacts.boundary.automaticTradingAllowed",
      ),
      candidateEmissionAllowed: boolean(
        value.boundary.candidateEmissionAllowed,
        "databaseFacts.boundary.candidateEmissionAllowed",
      ),
      migrationPerformed: boolean(
        value.boundary.migrationPerformed,
        "databaseFacts.boundary.migrationPerformed",
      ),
      productionDatabaseMutation: boolean(
        value.boundary.productionDatabaseMutation,
        "databaseFacts.boundary.productionDatabaseMutation",
      ),
      productionServiceMutation: boolean(
        value.boundary.productionServiceMutation,
        "databaseFacts.boundary.productionServiceMutation",
      ),
    },
    capturedAt: iso(value.capturedAt, "databaseFacts.capturedAt"),
    identity: {
      constrainedRoleSwitchesSucceeded: boolean(
        value.identity.constrainedRoleSwitchesSucceeded,
        "databaseFacts.identity.constrainedRoleSwitchesSucceeded",
      ),
      dataRole: text(value.identity.dataRole, "databaseFacts.identity.dataRole", /^[a-z][a-z0-9_]{1,62}$/u),
      databaseIdentityDigest: digest(
        value.identity.databaseIdentityDigest,
        "databaseFacts.identity.databaseIdentityDigest",
      ),
      monitorRole: text(value.identity.monitorRole, "databaseFacts.identity.monitorRole", /^[a-z][a-z0-9_]{1,62}$/u),
      sessionRole: text(value.identity.sessionRole, "databaseFacts.identity.sessionRole", /^[a-z][a-z0-9_]{1,62}$/u),
      sessionRoleAttributes: roleAttributes(
        value.identity.sessionRoleAttributes,
        "databaseFacts.identity.sessionRoleAttributes",
      ),
    },
    probeScriptDigest: digest(value.probeScriptDigest, "databaseFacts.probeScriptDigest"),
    runtime: Object.fromEntries(
      Object.entries(value.runtime).map(([key, entry]) => [
        key,
        integer(entry, `databaseFacts.runtime.${key}`),
      ]),
    ),
    schemaVersion: value.schemaVersion,
    server: {
      archiveCommandConfigured: boolean(value.server.archiveCommandConfigured, "databaseFacts.server.archiveCommandConfigured"),
      archiveMode: text(value.server.archiveMode, "databaseFacts.server.archiveMode", /^(always|off|on)$/u),
      dataChecksums: text(value.server.dataChecksums, "databaseFacts.server.dataChecksums", /^(off|on)$/u),
      databaseSizeBytes: integer(value.server.databaseSizeBytes, "databaseFacts.server.databaseSizeBytes", { positive: true }),
      inRecovery: boolean(value.server.inRecovery, "databaseFacts.server.inRecovery"),
      maxWalBytes: integer(value.server.maxWalBytes, "databaseFacts.server.maxWalBytes", { positive: true }),
      postgresMajor: integer(value.server.postgresMajor, "databaseFacts.server.postgresMajor", { positive: true }),
      probeTimeZone: text(value.server.probeTimeZone, "databaseFacts.server.probeTimeZone"),
      serverDefaultTimeZone: text(value.server.serverDefaultTimeZone, "databaseFacts.server.serverDefaultTimeZone"),
      serverVersionNum: integer(value.server.serverVersionNum, "databaseFacts.server.serverVersionNum", { positive: true }),
      walDirectoryBytes: integer(value.server.walDirectoryBytes, "databaseFacts.server.walDirectoryBytes"),
    },
    sourceCommit: commit(value.sourceCommit, "databaseFacts.sourceCommit"),
    storage: {
      activeIdentityCount: integer(value.storage.activeIdentityCount, "databaseFacts.storage.activeIdentityCount"),
      backupEvidenceCount: integer(value.storage.backupEvidenceCount, "databaseFacts.storage.backupEvidenceCount"),
      capabilityRoles,
      functions: sortedUniqueStrings(value.storage.functions, "databaseFacts.storage.functions", /^[a-z][a-z0-9_]{1,96}$/u),
      legacyFactCount: integer(value.storage.legacyFactCount, "databaseFacts.storage.legacyFactCount"),
      migrations: normalizeMigrations(value.storage.migrations, "databaseFacts.storage.migrations"),
      partitionCount: integer(value.storage.partitionCount, "databaseFacts.storage.partitionCount"),
      partitionedFactCount: integer(value.storage.partitionedFactCount, "databaseFacts.storage.partitionedFactCount"),
      relations: sortedUniqueStrings(value.storage.relations, "databaseFacts.storage.relations", /^[a-z][a-z0-9_]{1,96}$/u),
      retentionRunCount: integer(value.storage.retentionRunCount, "databaseFacts.storage.retentionRunCount"),
      schemaExists: boolean(value.storage.schemaExists, "databaseFacts.storage.schemaExists"),
      schemaOwner: nullable(value.storage.schemaOwner, text, "databaseFacts.storage.schemaOwner"),
      triggers: sortedUniqueStrings(value.storage.triggers, "databaseFacts.storage.triggers", /^[a-z][a-z0-9_]{1,96}:[a-z][a-z0-9_]{1,96}$/u),
    },
    transaction: {
      deletedRows: integer(value.transaction.deletedRows, "databaseFacts.transaction.deletedRows"),
      insertedRows: integer(value.transaction.insertedRows, "databaseFacts.transaction.insertedRows"),
      isolation: text(value.transaction.isolation, "databaseFacts.transaction.isolation", /^repeatable read$/u),
      readOnly: boolean(value.transaction.readOnly, "databaseFacts.transaction.readOnly"),
      transactionIdAssignedAfter: boolean(value.transaction.transactionIdAssignedAfter, "databaseFacts.transaction.transactionIdAssignedAfter"),
      transactionIdAssignedBefore: boolean(value.transaction.transactionIdAssignedBefore, "databaseFacts.transaction.transactionIdAssignedBefore"),
      updatedRows: integer(value.transaction.updatedRows, "databaseFacts.transaction.updatedRows"),
    },
  };
}

function normalizeHostFacts(value) {
  exactKeys(value, [
    "capturedAt",
    "disk",
    "docker",
    "productionHeadAfter",
    "productionHeadBefore",
    "productionWorktreeCleanAfter",
    "productionWorktreeCleanBefore",
    "runnerBoundary",
    "schemaVersion",
    "sourceCommit",
  ], "hostFacts");
  assert.equal(value.schemaVersion, P0_HOST_FACTS_SCHEMA_VERSION);
  exactKeys(value.disk, [
    "availableBytes",
    "postgresDataBytes",
    "postgresWalBytes",
    "totalBytes",
    "usedBytes",
  ], "hostFacts.disk");
  exactKeys(value.docker, [
    "networkCountAfter",
    "networkCountBefore",
    "runningContainerCountAfter",
    "runningContainerCountBefore",
    "stateDigestAfter",
    "stateDigestBefore",
    "volumeCountAfter",
    "volumeCountBefore",
  ], "hostFacts.docker");
  exactKeys(value.runnerBoundary, [
    "productionDatabaseMutation",
    "productionRepositoryMutation",
    "productionServiceMutation",
    "secretFileRemoved",
    "temporaryContainerRemoved",
  ], "hostFacts.runnerBoundary");
  return {
    capturedAt: iso(value.capturedAt, "hostFacts.capturedAt"),
    disk: Object.fromEntries(
      Object.entries(value.disk).map(([key, entry]) => [
        key,
        integer(entry, `hostFacts.disk.${key}`, { positive: true }),
      ]),
    ),
    docker: {
      networkCountAfter: integer(value.docker.networkCountAfter, "hostFacts.docker.networkCountAfter", { positive: true }),
      networkCountBefore: integer(value.docker.networkCountBefore, "hostFacts.docker.networkCountBefore", { positive: true }),
      runningContainerCountAfter: integer(value.docker.runningContainerCountAfter, "hostFacts.docker.runningContainerCountAfter", { positive: true }),
      runningContainerCountBefore: integer(value.docker.runningContainerCountBefore, "hostFacts.docker.runningContainerCountBefore", { positive: true }),
      stateDigestAfter: digest(value.docker.stateDigestAfter, "hostFacts.docker.stateDigestAfter"),
      stateDigestBefore: digest(value.docker.stateDigestBefore, "hostFacts.docker.stateDigestBefore"),
      volumeCountAfter: integer(value.docker.volumeCountAfter, "hostFacts.docker.volumeCountAfter", { positive: true }),
      volumeCountBefore: integer(value.docker.volumeCountBefore, "hostFacts.docker.volumeCountBefore", { positive: true }),
    },
    productionHeadAfter: commit(value.productionHeadAfter, "hostFacts.productionHeadAfter"),
    productionHeadBefore: commit(value.productionHeadBefore, "hostFacts.productionHeadBefore"),
    productionWorktreeCleanAfter: boolean(value.productionWorktreeCleanAfter, "hostFacts.productionWorktreeCleanAfter"),
    productionWorktreeCleanBefore: boolean(value.productionWorktreeCleanBefore, "hostFacts.productionWorktreeCleanBefore"),
    runnerBoundary: Object.fromEntries(
      Object.entries(value.runnerBoundary).map(([key, entry]) => [
        key,
        boolean(entry, `hostFacts.runnerBoundary.${key}`),
      ]),
    ),
    schemaVersion: value.schemaVersion,
    sourceCommit: commit(value.sourceCommit, "hostFacts.sourceCommit"),
  };
}

function normalizeRecoveryEvidence(value) {
  exactKeys(value, [
    "backup",
    "capturedAt",
    "productionHead",
    "restore",
    "schemaVersion",
    "sourceDatabaseIdentityDigest",
  ], "recoveryEvidence");
  assert.equal(value.schemaVersion, P0_RECOVERY_EVIDENCE_SCHEMA_VERSION);
  exactKeys(value.backup, [
    "archiveVerified",
    "checksumVerified",
    "completedAt",
    "createdAt",
    "encrypted",
    "encryptedBackupBytes",
    "encryptedBackupDigest",
    "offHost",
  ], "recoveryEvidence.backup");
  exactKeys(value.restore, [
    "businessRowsOutput",
    "completedAt",
    "evidenceDigest",
    "isolated",
    "passed",
    "plaintextDumpRetained",
    "restoreClusterRetained",
    "rpoMinutes",
    "rtoMinutes",
    "sourceEncryptedBackupDigest",
    "targetAvailableBytes",
  ], "recoveryEvidence.restore");
  return {
    backup: {
      archiveVerified: boolean(value.backup.archiveVerified, "recoveryEvidence.backup.archiveVerified"),
      checksumVerified: boolean(value.backup.checksumVerified, "recoveryEvidence.backup.checksumVerified"),
      completedAt: iso(value.backup.completedAt, "recoveryEvidence.backup.completedAt"),
      createdAt: iso(value.backup.createdAt, "recoveryEvidence.backup.createdAt"),
      encrypted: boolean(value.backup.encrypted, "recoveryEvidence.backup.encrypted"),
      encryptedBackupBytes: integer(value.backup.encryptedBackupBytes, "recoveryEvidence.backup.encryptedBackupBytes", { positive: true }),
      encryptedBackupDigest: digest(value.backup.encryptedBackupDigest, "recoveryEvidence.backup.encryptedBackupDigest"),
      offHost: boolean(value.backup.offHost, "recoveryEvidence.backup.offHost"),
    },
    capturedAt: iso(value.capturedAt, "recoveryEvidence.capturedAt"),
    productionHead: commit(value.productionHead, "recoveryEvidence.productionHead"),
    restore: {
      businessRowsOutput: boolean(value.restore.businessRowsOutput, "recoveryEvidence.restore.businessRowsOutput"),
      completedAt: iso(value.restore.completedAt, "recoveryEvidence.restore.completedAt"),
      evidenceDigest: digest(value.restore.evidenceDigest, "recoveryEvidence.restore.evidenceDigest"),
      isolated: boolean(value.restore.isolated, "recoveryEvidence.restore.isolated"),
      passed: boolean(value.restore.passed, "recoveryEvidence.restore.passed"),
      plaintextDumpRetained: boolean(value.restore.plaintextDumpRetained, "recoveryEvidence.restore.plaintextDumpRetained"),
      restoreClusterRetained: boolean(value.restore.restoreClusterRetained, "recoveryEvidence.restore.restoreClusterRetained"),
      rpoMinutes: integer(value.restore.rpoMinutes, "recoveryEvidence.restore.rpoMinutes"),
      rtoMinutes: integer(value.restore.rtoMinutes, "recoveryEvidence.restore.rtoMinutes"),
      sourceEncryptedBackupDigest: digest(value.restore.sourceEncryptedBackupDigest, "recoveryEvidence.restore.sourceEncryptedBackupDigest"),
      targetAvailableBytes: integer(value.restore.targetAvailableBytes, "recoveryEvidence.restore.targetAvailableBytes", { positive: true }),
    },
    schemaVersion: value.schemaVersion,
    sourceDatabaseIdentityDigest: digest(
      value.sourceDatabaseIdentityDigest,
      "recoveryEvidence.sourceDatabaseIdentityDigest",
    ),
  };
}

function sameRecords(actual, expected) {
  return JSON.stringify(canonicalize(actual)) === JSON.stringify(canonicalize(expected));
}

function exactCapabilityRoles(actual, expectedNames) {
  if (actual.length !== expectedNames.length) return false;
  for (const [index, roleName] of [...expectedNames].sort().entries()) {
    const role = actual[index];
    if (
      role?.roleName !== roleName ||
      role.canLogin ||
      role.superuser ||
      role.createDatabase ||
      role.createRole ||
      role.inherit ||
      role.replication ||
      role.bypassRls
    ) return false;
  }
  return true;
}

export function classifyProductionStorageSchema(storage) {
  if (!storage.schemaExists) {
    const clean = storage.schemaOwner === null
      && storage.migrations.length === 0
      && storage.relations.length === 0
      && storage.functions.length === 0
      && storage.triggers.length === 0
      && storage.capabilityRoles.length === 0
      && storage.legacyFactCount === 0
      && storage.partitionedFactCount === 0
      && storage.activeIdentityCount === 0
      && storage.partitionCount === 0
      && storage.backupEvidenceCount === 0
      && storage.retentionRunCount === 0;
    return {
      reasonCodes: clean ? [] : ["absent_schema_has_managed_residue"],
      stage: clean ? "ABSENT_CLEAN" : "SCHEMA_DRIFT",
      valid: clean,
    };
  }

  const candidates = Object.entries(STAGE_CONTRACTS).filter(([, contract]) =>
    sameRecords(storage.migrations, contract.migrations));
  if (candidates.length !== 1) {
    return {
      reasonCodes: ["migration_version_or_checksum_drift"],
      stage: "SCHEMA_DRIFT",
      valid: false,
    };
  }
  const [stage, contract] = candidates[0];
  const reasonCodes = [];
  if (storage.schemaOwner !== MIGRATION_ROLE) reasonCodes.push("schema_owner_drift");
  if (!sameRecords(storage.relations, [...contract.relations].sort())) {
    reasonCodes.push("managed_relation_inventory_drift");
  }
  if (!sameRecords(storage.functions, [...contract.functions].sort())) {
    reasonCodes.push("managed_function_inventory_drift");
  }
  if (!sameRecords(storage.triggers, [...contract.triggers].sort())) {
    reasonCodes.push("managed_trigger_inventory_drift");
  }
  if (!exactCapabilityRoles(storage.capabilityRoles, contract.roles)) {
    reasonCodes.push("capability_role_inventory_or_attributes_drift");
  }
  return {
    reasonCodes,
    stage: reasonCodes.length === 0 ? stage : "SCHEMA_DRIFT",
    valid: reasonCodes.length === 0,
  };
}

function ageWithin(timestamp, nowMs, maximumMs) {
  const age = nowMs - Date.parse(timestamp);
  return age >= 0 && age <= maximumMs;
}

function calculateCapacity(database, host) {
  const projectedFactRows = P0_CAPACITY_POLICY.factRowsPerCycle
    * 60
    * P0_CAPACITY_POLICY.requiredShadowHours;
  const projectedDataBytes = projectedFactRows
    * P0_CAPACITY_POLICY.perFactStorageBudgetBytes
    + P0_CAPACITY_POLICY.nonFactOverheadBytes;
  const walPeakReserveBytes = Math.max(
    database.server.walDirectoryBytes,
    database.server.maxWalBytes * 2,
    2 * GIB,
  );
  const backupReserveBytes = database.server.databaseSizeBytes + projectedDataBytes;
  const migrationTempBytes = 2 * GIB;
  const rollbackReserveBytes = Math.max(database.server.databaseSizeBytes, 5 * GIB);
  const safetyReserveBytes = Math.max(10 * GIB, Math.ceil(host.disk.totalBytes * 0.2));
  const projectedConsumptionBytes = projectedDataBytes
    + walPeakReserveBytes
    + backupReserveBytes
    + migrationTempBytes
    + rollbackReserveBytes;
  const requiredHeadroomBytes = projectedConsumptionBytes + safetyReserveBytes;
  const projectedDiskUsePercent = Math.ceil(
    ((host.disk.usedBytes + projectedConsumptionBytes) / host.disk.totalBytes) * 100,
  );
  return {
    backupReserveBytes,
    migrationTempBytes,
    projectedDataBytes,
    projectedDiskUsePercent,
    projectedFactRows,
    requiredHeadroomBytes,
    requiredRestoreBytes:
      database.server.databaseSizeBytes + projectedDataBytes + safetyReserveBytes,
    rollbackReserveBytes,
    safetyReserveBytes,
    walPeakReserveBytes,
  };
}

function checkCollector() {
  const checks = [];
  return {
    add(id, passed) {
      checks.push({ id, passed: Boolean(passed) });
    },
    values() {
      assert.equal(
        new Set(checks.map((entry) => entry.id)).size,
        checks.length,
        "preflight check IDs must be unique",
      );
      return checks;
    },
  };
}

export function buildM1ProductionStorageReadOnlyPreflight(input) {
  exactKeys(input, [
    "databaseFacts",
    "evaluatedAt",
    "expectedProbeScriptDigest",
    "expectedSourceCommit",
    "hostFacts",
    "recoveryEvidence",
  ], "preflightInput");
  const database = normalizeDatabaseFacts(input.databaseFacts);
  const host = normalizeHostFacts(input.hostFacts);
  const recovery = input.recoveryEvidence === null
    ? null
    : normalizeRecoveryEvidence(input.recoveryEvidence);
  const evaluatedAt = iso(input.evaluatedAt, "preflightInput.evaluatedAt");
  const expectedSourceCommit = commit(
    input.expectedSourceCommit,
    "preflightInput.expectedSourceCommit",
  );
  const expectedProbeScriptDigest = digest(
    input.expectedProbeScriptDigest,
    "preflightInput.expectedProbeScriptDigest",
  );
  const nowMs = Date.parse(evaluatedAt);
  const schema = classifyProductionStorageSchema(database.storage);
  const capacity = calculateCapacity(database, host);
  const checks = checkCollector();

  checks.add("source_commit_bound", database.sourceCommit === expectedSourceCommit
    && host.sourceCommit === expectedSourceCommit);
  checks.add("probe_script_digest_bound", database.probeScriptDigest === expectedProbeScriptDigest);
  checks.add("database_facts_fresh", ageWithin(database.capturedAt, nowMs, EVIDENCE_MAX_AGE_MS));
  checks.add("host_facts_fresh", ageWithin(host.capturedAt, nowMs, EVIDENCE_MAX_AGE_MS));
  checks.add("read_only_repeatable_read_transaction", database.transaction.readOnly
    && database.transaction.isolation === "repeatable read");
  checks.add("transaction_id_never_assigned", !database.transaction.transactionIdAssignedBefore
    && !database.transaction.transactionIdAssignedAfter);
  checks.add("transaction_dml_zero", database.transaction.insertedRows === 0
    && database.transaction.updatedRows === 0
    && database.transaction.deletedRows === 0);
  checks.add("no_authority_boundary", !database.boundary.automaticTradingAllowed
    && !database.boundary.candidateEmissionAllowed
    && !database.boundary.migrationPerformed
    && !database.boundary.productionDatabaseMutation
    && !database.boundary.productionServiceMutation);
  checks.add("constrained_read_roles_used", database.identity.constrainedRoleSwitchesSucceeded
    && database.identity.monitorRole === "pg_monitor"
    && database.identity.dataRole === "pg_read_all_data");
  checks.add("postgres_16_primary", database.server.postgresMajor === 16
    && database.server.serverVersionNum >= 160000
    && database.server.serverVersionNum < 170000
    && !database.server.inRecovery);
  checks.add("probe_session_utc", database.server.probeTimeZone === "UTC");
  checks.add("schema_clean_or_exact_prefix", schema.valid);
  checks.add("legacy_point_in_time_fact_zero", database.storage.legacyFactCount === 0);
  checks.add("pre_p3_partition_data_absent", database.storage.partitionedFactCount === 0
    && database.storage.activeIdentityCount === 0
    && database.storage.partitionCount === 0
    && database.storage.backupEvidenceCount === 0
    && database.storage.retentionRunCount === 0);

  const usableConnections = database.runtime.maxConnections
    - database.runtime.reservedConnections;
  const connectionUsePercent = usableConnections <= 0
    ? 100
    : Math.ceil((database.runtime.activeConnections / usableConnections) * 100);
  checks.add("connection_headroom_available", usableConnections > 0
    && connectionUsePercent <= P0_CAPACITY_POLICY.maximumRuntimeConnectionUsePercent);
  checks.add("lock_and_transaction_blockers_absent", database.runtime.waitingLockCount === 0
    && database.runtime.longTransactionCount === 0
    && database.runtime.idleInTransactionCount === 0
    && database.runtime.preparedTransactionCount === 0);

  const dockerRestored = host.docker.stateDigestBefore === host.docker.stateDigestAfter
    && host.docker.runningContainerCountBefore === host.docker.runningContainerCountAfter
    && host.docker.networkCountBefore === host.docker.networkCountAfter
    && host.docker.volumeCountBefore === host.docker.volumeCountAfter;
  checks.add("production_git_unchanged", host.productionHeadBefore === host.productionHeadAfter
    && host.productionWorktreeCleanBefore
    && host.productionWorktreeCleanAfter);
  checks.add("production_docker_state_restored", dockerRestored);
  checks.add("runner_temporary_scope_clean", host.runnerBoundary.temporaryContainerRemoved
    && host.runnerBoundary.secretFileRemoved
    && !host.runnerBoundary.productionDatabaseMutation
    && !host.runnerBoundary.productionRepositoryMutation
    && !host.runnerBoundary.productionServiceMutation);

  const walDifference = Math.abs(
    host.disk.postgresWalBytes - database.server.walDirectoryBytes,
  );
  checks.add("host_database_wal_measurements_consistent", walDifference
    <= Math.max(16 * 1024 * 1024, Math.ceil(database.server.walDirectoryBytes * 0.1)));
  checks.add("primary_capacity_headroom_available", host.disk.availableBytes
    >= capacity.requiredHeadroomBytes);
  checks.add("primary_projected_disk_use_below_70_percent",
    capacity.projectedDiskUsePercent <= P0_CAPACITY_POLICY.maximumProjectedDiskUsePercent);

  checks.add("recovery_evidence_present", recovery !== null);
  if (recovery !== null) {
    checks.add("recovery_database_identity_bound",
      recovery.sourceDatabaseIdentityDigest === database.identity.databaseIdentityDigest);
    checks.add("recovery_production_head_bound",
      recovery.productionHead === host.productionHeadAfter);
    checks.add("fresh_encrypted_off_host_backup",
      ageWithin(recovery.backup.completedAt, nowMs, BACKUP_MAX_AGE_MS)
      && Date.parse(recovery.backup.createdAt) <= Date.parse(recovery.backup.completedAt)
      && recovery.backup.encrypted
      && recovery.backup.offHost
      && recovery.backup.checksumVerified
      && recovery.backup.archiveVerified);
    checks.add("isolated_restore_drill_verified",
      ageWithin(recovery.restore.completedAt, nowMs, RESTORE_MAX_AGE_MS)
      && recovery.restore.passed
      && recovery.restore.isolated
      && !recovery.restore.businessRowsOutput
      && !recovery.restore.plaintextDumpRetained
      && !recovery.restore.restoreClusterRetained
      && recovery.restore.sourceEncryptedBackupDigest
        === recovery.backup.encryptedBackupDigest);
    checks.add("restore_rpo_rto_within_target",
      recovery.restore.rpoMinutes <= P0_CAPACITY_POLICY.rpoMaximumMinutes
      && recovery.restore.rtoMinutes <= P0_CAPACITY_POLICY.rtoMaximumMinutes);
    checks.add("restore_target_capacity_sufficient",
      recovery.restore.targetAvailableBytes >= capacity.requiredRestoreBytes);
  }

  const checkValues = checks.values();
  const blockers = checkValues.filter((entry) => !entry.passed).map((entry) => entry.id);
  const advisories = [];
  if (database.server.dataChecksums === "off") advisories.push("postgres_data_checksums_disabled");
  if (database.server.archiveMode === "off") advisories.push("continuous_wal_archiving_disabled");
  if (database.identity.sessionRoleAttributes.superuser
    || database.identity.sessionRoleAttributes.createDatabase
    || database.identity.sessionRoleAttributes.createRole
    || database.identity.sessionRoleAttributes.bypassRls) {
    advisories.push("bootstrap_session_role_is_privileged_but_probe_statements_used_constrained_roles");
  }
  if (database.server.serverDefaultTimeZone !== "UTC") {
    advisories.push("database_default_timezone_is_not_utc_probe_was_forced_to_utc");
  }

  const passed = blockers.length === 0;
  const conclusion = passed
    ? schema.stage === "PARTITION_EXACT"
      ? "PASS_EXACT_SCHEMA_ALREADY_PRESENT"
      : "PASS_READY_FOR_ADDITIVE_SCHEMA"
    : "BLOCKED";
  const report = {
    advisories,
    authorityMode: "NO_AUTHORITY",
    automaticTradingAllowed: false,
    blockers,
    candidateEmissionAllowed: false,
    capacity: {
      ...capacity,
      availablePrimaryBytes: host.disk.availableBytes,
      maximumProjectedDiskUsePercent:
        P0_CAPACITY_POLICY.maximumProjectedDiskUsePercent,
      policyEvidenceDigest: P0_CAPACITY_POLICY.b1b3EvidenceDigest,
    },
    checks: checkValues,
    conclusion,
    database: {
      connectionUsePercent,
      databaseIdentityDigest: database.identity.databaseIdentityDigest,
      databaseSizeBytes: database.server.databaseSizeBytes,
      legacyFactCount: database.storage.legacyFactCount,
      migrationCount: database.storage.migrations.length,
      partitionCount: database.storage.partitionCount,
      partitionedFactCount: database.storage.partitionedFactCount,
      postgresMajor: database.server.postgresMajor,
      schemaStage: schema.stage,
      schemaReasonCodes: schema.reasonCodes,
      sessionRole: database.identity.sessionRole,
      walDirectoryBytes: database.server.walDirectoryBytes,
    },
    evaluatedAt,
    expiresAt: new Date(nowMs + EVIDENCE_MAX_AGE_MS).toISOString(),
    migrationPerformed: false,
    nextAction: passed
      ? schema.stage === "PARTITION_EXACT"
        ? "AUDIT_EXISTING_EXACT_SCHEMA_AND_SKIP_P1"
        : "REQUEST_EXPLICIT_M1_6_P1_ADD_SCHEMA_APPROVAL"
      : "REMEDIATE_BLOCKERS_AND_RERUN_P0",
    productionDatabaseMutation: false,
    productionHead: host.productionHeadAfter,
    productionRepositoryMutation: false,
    productionServiceMutation: false,
    recovery: recovery === null
      ? { status: "UNAVAILABLE" }
      : {
          backupCompletedAt: recovery.backup.completedAt,
          encryptedBackupDigest: recovery.backup.encryptedBackupDigest,
          restoreCompletedAt: recovery.restore.completedAt,
          restoreEvidenceDigest: recovery.restore.evidenceDigest,
          status: "SUPPLIED",
        },
    schemaVersion: P0_REPORT_SCHEMA_VERSION,
    sourceCommit: expectedSourceCommit,
    status: passed ? "PASS" : "BLOCKED",
  };
  return Object.freeze({ ...report, evidenceDigest: stableDigest(report) });
}

export function verifyM1ProductionStorageReadOnlyPreflight(report) {
  exactKeys(report, [
    "advisories",
    "authorityMode",
    "automaticTradingAllowed",
    "blockers",
    "candidateEmissionAllowed",
    "capacity",
    "checks",
    "conclusion",
    "database",
    "evaluatedAt",
    "evidenceDigest",
    "expiresAt",
    "migrationPerformed",
    "nextAction",
    "productionDatabaseMutation",
    "productionHead",
    "productionRepositoryMutation",
    "productionServiceMutation",
    "recovery",
    "schemaVersion",
    "sourceCommit",
    "status",
  ], "report");
  assert.equal(report.schemaVersion, P0_REPORT_SCHEMA_VERSION);
  digest(report.evidenceDigest, "report.evidenceDigest");
  const { evidenceDigest, ...unsigned } = report;
  assert.equal(evidenceDigest, stableDigest(unsigned), "report evidence digest mismatch");
  assert.equal(report.authorityMode, "NO_AUTHORITY");
  assert.equal(report.automaticTradingAllowed, false);
  assert.equal(report.candidateEmissionAllowed, false);
  assert.equal(report.migrationPerformed, false);
  assert.equal(report.productionDatabaseMutation, false);
  assert.equal(report.productionRepositoryMutation, false);
  assert.equal(report.productionServiceMutation, false);
  assert.equal(report.status === "PASS", report.blockers.length === 0);
  assert.equal(
    report.status === "PASS",
    report.checks.every((entry) => entry.passed === true),
  );
  return report;
}

function rowInteger(value, label) {
  const parsed = Number(value);
  return integer(parsed, label);
}

function mapRoleRow(row) {
  return {
    bypassRls: row.bypass_rls,
    canLogin: row.can_login,
    createDatabase: row.create_database,
    createRole: row.create_role,
    inherit: row.inherit,
    replication: row.replication,
    roleName: row.role_name,
    superuser: row.superuser,
  };
}

async function queryOne(client, query, values = []) {
  const result = await client.query(query, values);
  assert.equal(result.rows.length, 1, "read-only query must return exactly one row");
  return result.rows[0];
}

async function readSecureDatabaseConnection(path) {
  assert.equal(path, resolve(path), "database connection secret path must be absolute");
  const facts = await lstat(path);
  assert.equal(facts.isSymbolicLink(), false, "database connection secret must not be a symlink");
  assert.equal(facts.isFile(), true, "database connection secret must be a regular file");
  assert.equal(facts.mode & 0o077, 0, "database connection secret permissions are too open");
  assert.ok(facts.size > 0 && facts.size <= 8 * 1024, "database connection secret size is invalid");
  const value = (await readFile(path, "utf8")).trim();
  assert.equal(value.includes("\n"), false, "database connection secret must be one line");
  const parsed = new URL(value);
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol));
  assert.ok(parsed.username.length > 0 && parsed.password.length > 0);
  assert.ok(parsed.hostname.length > 0 && parsed.pathname.length > 1);
  return value;
}

async function loadPgClient() {
  const imported = await import("pg");
  const Client = imported.Client ?? imported.default?.Client;
  assert.equal(typeof Client, "function", "pg Client runtime is unavailable");
  return Client;
}

export async function runProductionStorageReadOnlyProbe(input) {
  exactKeys(input, ["databaseConnectionFile", "sourceCommit"], "probeInput");
  const sourceCommit = commit(input.sourceCommit, "probeInput.sourceCommit");
  const connectionString = await readSecureDatabaseConnection(
    resolve(input.databaseConnectionFile),
  );
  const Client = await loadPgClient();
  const client = new Client({
    application_name: "market-radar-v2-m1-p0-read-only-preflight",
    connectionString,
  });
  const probeScriptDigest = byteDigest(
    await readFile(fileURLToPath(import.meta.url)),
  );
  await client.connect();
  let transactionOpen = false;
  try {
    await client.query(P0_READ_ONLY_SQL.begin);
    transactionOpen = true;
    await client.query(P0_READ_ONLY_SQL.setLimits);
    const initialIdentity = await queryOne(client, P0_READ_ONLY_SQL.sessionIdentity);
    await client.query(P0_READ_ONLY_SQL.setUtc);
    await client.query(P0_READ_ONLY_SQL.setMonitorRole);
    const monitorIdentity = await queryOne(client, P0_READ_ONLY_SQL.sessionIdentity);
    const server = await queryOne(client, P0_READ_ONLY_SQL.server);
    const runtime = await queryOne(client, P0_READ_ONLY_SQL.runtime);
    const databaseIdentity = await queryOne(client, P0_READ_ONLY_SQL.databaseIdentity);
    const roleNames = [
      initialIdentity.session_role,
      "pg_monitor",
      "pg_read_all_data",
      ...BASE_ROLES,
      RETENTION_ROLE,
    ];
    const allRoleRows = await client.query(
      P0_READ_ONLY_SQL.databaseRoleAttributes,
      [[...new Set(roleNames)]],
    );
    const sessionRoleAttributes = allRoleRows.rows.find(
      (row) => row.role_name === initialIdentity.session_role,
    );
    assert.ok(sessionRoleAttributes, "session role attributes are unavailable");

    await client.query(P0_READ_ONLY_SQL.setDataRole);
    const dataIdentity = await queryOne(client, P0_READ_ONLY_SQL.sessionIdentity);
    const presence = await queryOne(client, P0_READ_ONLY_SQL.relationPresence);
    const relations = await client.query(P0_READ_ONLY_SQL.relations);
    const functions = await client.query(P0_READ_ONLY_SQL.functions);
    const triggers = await client.query(P0_READ_ONLY_SQL.triggers);
    const schemaOwner = presence.schema_exists
      ? await queryOne(client, P0_READ_ONLY_SQL.schemaOwner)
      : null;
    const migrations = presence.migrations_exist
      ? (await client.query(P0_READ_ONLY_SQL.migrations)).rows
      : [];
    const legacyFactCount = presence.artifact_ledger_exists
      ? await queryOne(client, P0_READ_ONLY_SQL.legacyFactCount)
      : { count: "0" };
    const partitionedFactCount = presence.partitioned_ledger_exists
      ? await queryOne(client, P0_READ_ONLY_SQL.partitionedFactCount)
      : { count: "0" };
    const activeIdentityCount = presence.active_identity_registry_exists
      ? await queryOne(client, P0_READ_ONLY_SQL.activeIdentityCount)
      : { count: "0" };
    const backupEvidenceCount = presence.backup_evidence_ledger_exists
      ? await queryOne(client, P0_READ_ONLY_SQL.backupEvidenceCount)
      : { count: "0" };
    const retentionRunCount = presence.retention_run_ledger_exists
      ? await queryOne(client, P0_READ_ONLY_SQL.retentionRunCount)
      : { count: "0" };
    const partition = presence.partitioned_ledger_exists
      ? await queryOne(client, P0_READ_ONLY_SQL.partitionCount)
      : { partition_count: "0" };

    await client.query(P0_READ_ONLY_SQL.setMonitorRole);
    const dml = await queryOne(client, P0_READ_ONLY_SQL.dmlCounters);
    const finalIdentity = await queryOne(client, P0_READ_ONLY_SQL.sessionIdentity);
    await client.query(P0_READ_ONLY_SQL.rollback);
    transactionOpen = false;

    const expectedCapabilityNames = new Set([...BASE_ROLES, RETENTION_ROLE]);
    const facts = {
      boundary: {
        automaticTradingAllowed: false,
        candidateEmissionAllowed: false,
        migrationPerformed: false,
        productionDatabaseMutation: false,
        productionServiceMutation: false,
      },
      capturedAt: new Date(server.captured_at).toISOString(),
      identity: {
        constrainedRoleSwitchesSucceeded:
          monitorIdentity.effective_role === "pg_monitor"
          && dataIdentity.effective_role === "pg_read_all_data"
          && finalIdentity.effective_role === "pg_monitor",
        dataRole: dataIdentity.effective_role,
        databaseIdentityDigest: stableDigest({
          databaseName: databaseIdentity.database_name,
          serverAddress: databaseIdentity.server_address,
          serverPort: databaseIdentity.server_port,
          serverVersionNum: server.server_version_num,
        }),
        monitorRole: monitorIdentity.effective_role,
        sessionRole: initialIdentity.session_role,
        sessionRoleAttributes: mapRoleRow(sessionRoleAttributes),
      },
      probeScriptDigest,
      runtime: {
        activeConnections: runtime.active_connections,
        idleInTransactionCount: runtime.idle_in_transaction_count,
        longTransactionCount: runtime.long_transaction_count,
        maxConnections: runtime.max_connections,
        preparedTransactionCount: runtime.prepared_transaction_count,
        reservedConnections: runtime.reserved_connections,
        waitingLockCount: runtime.waiting_lock_count,
      },
      schemaVersion: P0_DATABASE_FACTS_SCHEMA_VERSION,
      server: {
        archiveCommandConfigured: server.archive_command_configured,
        archiveMode: server.archive_mode,
        dataChecksums: server.data_checksums,
        databaseSizeBytes: rowInteger(server.database_size_bytes, "server.database_size_bytes"),
        inRecovery: server.in_recovery,
        maxWalBytes: rowInteger(server.max_wal_bytes, "server.max_wal_bytes"),
        postgresMajor: Math.floor(server.server_version_num / 10_000),
        probeTimeZone: monitorIdentity.probe_time_zone,
        serverDefaultTimeZone: initialIdentity.probe_time_zone,
        serverVersionNum: server.server_version_num,
        walDirectoryBytes: rowInteger(server.wal_directory_bytes, "server.wal_directory_bytes"),
      },
      sourceCommit,
      storage: {
        activeIdentityCount: rowInteger(activeIdentityCount.count, "activeIdentityCount.count"),
        backupEvidenceCount: rowInteger(backupEvidenceCount.count, "backupEvidenceCount.count"),
        capabilityRoles: allRoleRows.rows
          .filter((row) => expectedCapabilityNames.has(row.role_name))
          .map(mapRoleRow),
        functions: functions.rows.map((row) => row.name),
        legacyFactCount: rowInteger(legacyFactCount.count, "legacyFactCount.count"),
        migrations: migrations.map((row) => ({ checksum: row.checksum, version: row.version })),
        partitionCount: rowInteger(partition.partition_count, "partition.partition_count"),
        partitionedFactCount: rowInteger(partitionedFactCount.count, "partitionedFactCount.count"),
        relations: relations.rows.map((row) => row.name),
        retentionRunCount: rowInteger(retentionRunCount.count, "retentionRunCount.count"),
        schemaExists: presence.schema_exists,
        schemaOwner: schemaOwner?.schema_owner ?? null,
        triggers: triggers.rows.map((row) => row.name),
      },
      transaction: {
        deletedRows: rowInteger(dml.deleted_rows, "dml.deleted_rows"),
        insertedRows: rowInteger(dml.inserted_rows, "dml.inserted_rows"),
        isolation: String(initialIdentity.transaction_isolation).toLowerCase(),
        readOnly: initialIdentity.transaction_read_only === "on",
        transactionIdAssignedAfter: finalIdentity.transaction_id !== null,
        transactionIdAssignedBefore: initialIdentity.transaction_id !== null,
        updatedRows: rowInteger(dml.updated_rows, "dml.updated_rows"),
      },
    };
    return normalizeDatabaseFacts(facts);
  } finally {
    if (transactionOpen) {
      await client.query(P0_READ_ONLY_SQL.rollback).catch(() => undefined);
    }
    await client.end();
  }
}

async function readJson(path, label) {
  const bytes = await readFile(resolve(path));
  assert.ok(bytes.length > 0 && bytes.length <= 4 * 1024 * 1024, `${label} size is invalid`);
  return JSON.parse(bytes.toString("utf8"));
}

async function writeAtomic(path, value) {
  const target = resolve(path);
  const temporary = resolve(dirname(target), `.${target.split("/").at(-1)}.${process.pid}.tmp`);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, target);
}

function parseArguments(argv) {
  const [command = "", ...rest] = argv;
  assert.ok(["evaluate", "probe", "verify"].includes(command), "command is unsupported");
  assert.equal(rest.length % 2, 0, "arguments must be name/value pairs");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index];
    assert.match(name, /^--[a-z][a-z0-9-]*$/u, "argument name is invalid");
    assert.equal(options[name.slice(2)], undefined, `duplicate argument ${name}`);
    options[name.slice(2)] = rest[index + 1];
  }
  return { command, options };
}

async function emit(value, output) {
  if (output === undefined) {
    process.stdout.write(`${JSON.stringify(value)}\n`);
    return;
  }
  await writeAtomic(output, value);
  process.stdout.write(`${JSON.stringify({
    containsSecret: false,
    evidenceDigest: value.evidenceDigest ?? stableDigest(value),
    outputWritten: true,
    status: value.status ?? "PASS_READ_ONLY_FACT_CAPTURE",
  })}\n`);
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === "probe") {
    assert.equal(process.env.V2_M1_PRODUCTION_DATABASE_URL, undefined,
      "inline production database URL is forbidden");
    const facts = await runProductionStorageReadOnlyProbe({
      databaseConnectionFile: options["database-connection-file"],
      sourceCommit: options["source-commit"],
    });
    await emit(facts, options.output);
    return;
  }
  if (command === "evaluate") {
    const recoveryEvidence = options["recovery-evidence"] === "none"
      ? null
      : await readJson(options["recovery-evidence"], "recovery evidence");
    const report = buildM1ProductionStorageReadOnlyPreflight({
      databaseFacts: await readJson(options["database-facts"], "database facts"),
      evaluatedAt: options.now ?? new Date().toISOString(),
      expectedProbeScriptDigest: options["probe-script-digest"],
      expectedSourceCommit: options["source-commit"],
      hostFacts: await readJson(options["host-facts"], "host facts"),
      recoveryEvidence,
    });
    await emit(report, options.output);
    return;
  }
  const report = await readJson(options.report, "preflight report");
  verifyM1ProductionStorageReadOnlyPreflight(report);
  process.stdout.write(`${JSON.stringify({
    evidenceDigest: report.evidenceDigest,
    reportValid: true,
    status: report.status,
  })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      reason: error instanceof Error ? error.message : "unexpected_error",
      status: "INVALID",
    })}\n`);
    process.exitCode = 1;
  });
}
