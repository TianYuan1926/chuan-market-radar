import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildM1ProductionStorageReadOnlyPreflight,
  classifyProductionStorageSchema,
  P0_DATABASE_FACTS_SCHEMA_VERSION,
  P0_EXPECTED_MIGRATIONS,
  P0_HOST_FACTS_SCHEMA_VERSION,
  P0_READ_ONLY_SQL,
  P0_RECOVERY_EVIDENCE_SCHEMA_VERSION,
  verifyM1ProductionStorageReadOnlyPreflight,
} from "./m1-production-storage-read-only-preflight.mjs";

const GIB = 1024 ** 3;
const NOW = "2026-07-21T12:00:00.000Z";
const SOURCE_COMMIT = "a".repeat(40);
const PROBE_DIGEST = `sha256:${"b".repeat(64)}`;
const DATABASE_IDENTITY_DIGEST = `sha256:${"c".repeat(64)}`;
const PRODUCTION_HEAD = "f".repeat(40);

function role(roleName, overrides = {}) {
  return {
    bypassRls: false,
    canLogin: false,
    createDatabase: false,
    createRole: false,
    inherit: false,
    replication: false,
    roleName,
    superuser: false,
    ...overrides,
  };
}

function databaseFacts() {
  return {
    boundary: {
      automaticTradingAllowed: false,
      candidateEmissionAllowed: false,
      migrationPerformed: false,
      productionDatabaseMutation: false,
      productionServiceMutation: false,
    },
    capturedAt: "2026-07-21T11:58:00.000Z",
    identity: {
      constrainedRoleSwitchesSucceeded: true,
      dataRole: "pg_read_all_data",
      databaseIdentityDigest: DATABASE_IDENTITY_DIGEST,
      monitorRole: "pg_monitor",
      sessionRole: "market_radar_bootstrap",
      sessionRoleAttributes: role("market_radar_bootstrap", {
        canLogin: true,
        inherit: true,
        superuser: true,
      }),
    },
    probeScriptDigest: PROBE_DIGEST,
    runtime: {
      activeConnections: 12,
      idleInTransactionCount: 0,
      longTransactionCount: 0,
      maxConnections: 100,
      preparedTransactionCount: 0,
      reservedConnections: 3,
      waitingLockCount: 0,
    },
    schemaVersion: P0_DATABASE_FACTS_SCHEMA_VERSION,
    server: {
      archiveCommandConfigured: false,
      archiveMode: "off",
      dataChecksums: "off",
      databaseSizeBytes: 2 * GIB,
      inRecovery: false,
      maxWalBytes: GIB,
      postgresMajor: 16,
      probeTimeZone: "UTC",
      serverDefaultTimeZone: "UTC",
      serverVersionNum: 160009,
      walDirectoryBytes: GIB,
    },
    sourceCommit: SOURCE_COMMIT,
    storage: {
      activeIdentityCount: 0,
      backupEvidenceCount: 0,
      capabilityRoles: [],
      functions: [],
      legacyFactCount: 0,
      migrations: [],
      partitionCount: 0,
      partitionedFactCount: 0,
      relations: [],
      retentionRunCount: 0,
      schemaExists: false,
      schemaOwner: null,
      triggers: [],
    },
    transaction: {
      deletedRows: 0,
      insertedRows: 0,
      isolation: "repeatable read",
      readOnly: true,
      transactionIdAssignedAfter: false,
      transactionIdAssignedBefore: false,
      updatedRows: 0,
    },
  };
}

function hostFacts() {
  return {
    capturedAt: "2026-07-21T11:59:00.000Z",
    disk: {
      availableBytes: 260 * GIB,
      postgresDataBytes: 3 * GIB,
      postgresWalBytes: GIB,
      totalBytes: 300 * GIB,
      usedBytes: 40 * GIB,
    },
    docker: {
      networkCountAfter: 4,
      networkCountBefore: 4,
      runningContainerCountAfter: 11,
      runningContainerCountBefore: 11,
      stateDigestAfter: `sha256:${"1".repeat(64)}`,
      stateDigestBefore: `sha256:${"1".repeat(64)}`,
      volumeCountAfter: 5,
      volumeCountBefore: 5,
    },
    productionHeadAfter: PRODUCTION_HEAD,
    productionHeadBefore: PRODUCTION_HEAD,
    productionWorktreeCleanAfter: true,
    productionWorktreeCleanBefore: true,
    runnerBoundary: {
      productionDatabaseMutation: false,
      productionRepositoryMutation: false,
      productionServiceMutation: false,
      secretFileRemoved: true,
      temporaryRuntimeRemoved: true,
    },
    schemaVersion: P0_HOST_FACTS_SCHEMA_VERSION,
    sourceCommit: SOURCE_COMMIT,
  };
}

function recoveryEvidence() {
  return {
    backup: {
      archiveVerified: true,
      checksumVerified: true,
      completedAt: "2026-07-21T11:35:00.000Z",
      createdAt: "2026-07-21T11:30:00.000Z",
      encrypted: true,
      encryptedBackupBytes: GIB,
      encryptedBackupDigest: `sha256:${"d".repeat(64)}`,
      offHost: true,
    },
    capturedAt: "2026-07-21T11:45:00.000Z",
    productionHead: PRODUCTION_HEAD,
    restore: {
      businessRowsOutput: false,
      completedAt: "2026-07-21T11:40:00.000Z",
      evidenceDigest: `sha256:${"e".repeat(64)}`,
      isolated: true,
      passed: true,
      plaintextDumpRetained: false,
      restoreClusterRetained: false,
      rpoMinutes: 10,
      rtoMinutes: 5,
      sourceEncryptedBackupDigest: `sha256:${"d".repeat(64)}`,
      targetAvailableBytes: 200 * GIB,
    },
    schemaVersion: P0_RECOVERY_EVIDENCE_SCHEMA_VERSION,
    sourceDatabaseIdentityDigest: DATABASE_IDENTITY_DIGEST,
  };
}

function preflight(overrides = {}) {
  return buildM1ProductionStorageReadOnlyPreflight({
    databaseFacts: databaseFacts(),
    evaluatedAt: NOW,
    expectedProbeScriptDigest: PROBE_DIGEST,
    expectedSourceCommit: SOURCE_COMMIT,
    hostFacts: hostFacts(),
    recoveryEvidence: recoveryEvidence(),
    ...overrides,
  });
}

function check(report, id) {
  return report.checks.find((entry) => entry.id === id);
}

function baseExactStorage() {
  return {
    activeIdentityCount: 0,
    backupEvidenceCount: 0,
    capabilityRoles: [
      role("market_radar_v2_m1_audit"),
      role("market_radar_v2_m1_migration"),
      role("market_radar_v2_m1_reader"),
      role("market_radar_v2_m1_replay"),
      role("market_radar_v2_m1_writer"),
    ],
    functions: ["reject_ledger_mutation"],
    legacyFactCount: 0,
    migrations: [P0_EXPECTED_MIGRATIONS[0]],
    partitionCount: 0,
    partitionedFactCount: 0,
    relations: ["artifact_ledger", "replay_manifest_ledger", "schema_migrations"],
    retentionRunCount: 0,
    schemaExists: true,
    schemaOwner: "market_radar_v2_m1_migration",
    triggers: [
      "artifact_ledger:reject_artifact_ledger_mutation",
      "replay_manifest_ledger:reject_replay_manifest_mutation",
      "schema_migrations:reject_schema_migration_mutation",
    ],
  };
}

test("passes only with fresh read-only, capacity and recovery evidence", () => {
  const report = preflight();
  assert.equal(report.status, "PASS");
  assert.equal(report.conclusion, "PASS_READY_FOR_ADDITIVE_SCHEMA");
  assert.equal(report.database.schemaStage, "ABSENT_CLEAN");
  assert.equal(report.nextAction, "REQUEST_EXPLICIT_M1_6_P1_ADD_SCHEMA_APPROVAL");
  assert.equal(report.blockers.length, 0);
  assert.ok(report.capacity.projectedFactRows > 2_000_000);
  assert.ok(report.capacity.requiredHeadroomBytes > 0);
  assert.equal(report.productionDatabaseMutation, false);
  assert.equal(report.migrationPerformed, false);
  assert.equal(verifyM1ProductionStorageReadOnlyPreflight(report), report);
});

test("accepts an exact base migration prefix but not checksum drift", () => {
  const exact = databaseFacts();
  exact.storage = baseExactStorage();
  const exactReport = preflight({ databaseFacts: exact });
  assert.equal(exactReport.status, "PASS");
  assert.equal(exactReport.database.schemaStage, "BASE_EXACT");

  const drift = structuredClone(exact);
  drift.storage.migrations[0].checksum = `sha256:${"0".repeat(64)}`;
  const driftReport = preflight({ databaseFacts: drift });
  assert.equal(driftReport.status, "BLOCKED");
  assert.equal(driftReport.database.schemaStage, "SCHEMA_DRIFT");
  assert.equal(check(driftReport, "schema_clean_or_exact_prefix").passed, false);
});

test("blocks old unpartitioned facts instead of treating compatibility as readiness", () => {
  const facts = databaseFacts();
  facts.storage = { ...baseExactStorage(), legacyFactCount: 1 };
  const report = preflight({ databaseFacts: facts });
  assert.equal(report.status, "BLOCKED");
  assert.ok(report.blockers.includes("legacy_point_in_time_fact_zero"));
});

test("blocks unknown managed relations and unsafe capability roles", () => {
  const facts = databaseFacts();
  facts.storage = baseExactStorage();
  facts.storage.relations.push("mystery_ledger");
  facts.storage.capabilityRoles[0].canLogin = true;
  const report = preflight({ databaseFacts: facts });
  assert.equal(report.status, "BLOCKED");
  assert.ok(report.database.schemaReasonCodes.includes("managed_relation_inventory_drift"));
  assert.ok(report.database.schemaReasonCodes.includes("capability_role_inventory_or_attributes_drift"));
});

for (const [name, mutate, blocker] of [
  [
    "writable transaction",
    (facts) => { facts.transaction.readOnly = false; },
    "read_only_repeatable_read_transaction",
  ],
  [
    "assigned transaction ID",
    (facts) => { facts.transaction.transactionIdAssignedAfter = true; },
    "transaction_id_never_assigned",
  ],
  [
    "observed DML",
    (facts) => { facts.transaction.insertedRows = 1; },
    "transaction_dml_zero",
  ],
  [
    "failed constrained role switch",
    (facts) => { facts.identity.constrainedRoleSwitchesSucceeded = false; },
    "constrained_read_roles_used",
  ],
  [
    "wrong PostgreSQL major",
    (facts) => { facts.server.postgresMajor = 15; facts.server.serverVersionNum = 150012; },
    "postgres_16_primary",
  ],
  [
    "recovery replica",
    (facts) => { facts.server.inRecovery = true; },
    "postgres_16_primary",
  ],
  [
    "non-UTC probe session",
    (facts) => { facts.server.probeTimeZone = "Asia/Shanghai"; },
    "probe_session_utc",
  ],
  [
    "waiting lock",
    (facts) => { facts.runtime.waitingLockCount = 1; },
    "lock_and_transaction_blockers_absent",
  ],
  [
    "connection saturation",
    (facts) => { facts.runtime.activeConnections = 90; },
    "connection_headroom_available",
  ],
]) {
  test(`fails closed for ${name}`, () => {
    const facts = databaseFacts();
    mutate(facts);
    const report = preflight({ databaseFacts: facts });
    assert.equal(report.status, "BLOCKED");
    assert.ok(report.blockers.includes(blocker));
  });
}

test("blocks stale facts and source or probe identity drift", () => {
  const facts = databaseFacts();
  facts.capturedAt = "2026-07-21T11:44:59.000Z";
  facts.sourceCommit = "9".repeat(40);
  facts.probeScriptDigest = `sha256:${"8".repeat(64)}`;
  const report = preflight({ databaseFacts: facts });
  assert.equal(report.status, "BLOCKED");
  assert.ok(report.blockers.includes("database_facts_fresh"));
  assert.ok(report.blockers.includes("source_commit_bound"));
  assert.ok(report.blockers.includes("probe_script_digest_bound"));
});

test("blocks host Git or Docker drift and unclean temporary scope", () => {
  const host = hostFacts();
  host.productionHeadAfter = "8".repeat(40);
  host.productionWorktreeCleanAfter = false;
  host.docker.stateDigestAfter = `sha256:${"7".repeat(64)}`;
  host.runnerBoundary.secretFileRemoved = false;
  const report = preflight({ hostFacts: host });
  assert.equal(report.status, "BLOCKED");
  assert.ok(report.blockers.includes("production_git_unchanged"));
  assert.ok(report.blockers.includes("production_docker_state_restored"));
  assert.ok(report.blockers.includes("runner_temporary_scope_clean"));
});

test("blocks insufficient production and restore capacity", () => {
  const host = hostFacts();
  host.disk.totalBytes = 80 * GIB;
  host.disk.usedBytes = 70 * GIB;
  host.disk.availableBytes = 10 * GIB;
  const recovery = recoveryEvidence();
  recovery.restore.targetAvailableBytes = 10 * GIB;
  const report = preflight({ hostFacts: host, recoveryEvidence: recovery });
  assert.equal(report.status, "BLOCKED");
  assert.ok(report.blockers.includes("primary_capacity_headroom_available"));
  assert.ok(report.blockers.includes("primary_projected_disk_use_below_70_percent"));
  assert.ok(report.blockers.includes("restore_target_capacity_sufficient"));
});

test("blocks missing, stale, unbound or incomplete recovery evidence", () => {
  const missing = preflight({ recoveryEvidence: null });
  assert.equal(missing.status, "BLOCKED");
  assert.deepEqual(missing.recovery, { status: "UNAVAILABLE" });
  assert.ok(missing.blockers.includes("recovery_evidence_present"));

  const recovery = recoveryEvidence();
  recovery.backup.completedAt = "2026-07-21T10:29:59.000Z";
  recovery.backup.encrypted = false;
  recovery.sourceDatabaseIdentityDigest = `sha256:${"9".repeat(64)}`;
  recovery.restore.sourceEncryptedBackupDigest = `sha256:${"0".repeat(64)}`;
  recovery.restore.rtoMinutes = 121;
  const blocked = preflight({ recoveryEvidence: recovery });
  assert.equal(blocked.status, "BLOCKED");
  assert.ok(blocked.blockers.includes("recovery_database_identity_bound"));
  assert.ok(blocked.blockers.includes("fresh_encrypted_off_host_backup"));
  assert.ok(blocked.blockers.includes("isolated_restore_drill_verified"));
  assert.ok(blocked.blockers.includes("restore_rpo_rto_within_target"));
});

test("rejects unknown evidence fields and tampered report digests", () => {
  const facts = databaseFacts();
  facts.databaseUrl = "forbidden";
  assert.throws(
    () => preflight({ databaseFacts: facts }),
    /databaseFacts fields must be exact/u,
  );

  const tampered = structuredClone(preflight());
  tampered.status = "BLOCKED";
  assert.throws(
    () => verifyM1ProductionStorageReadOnlyPreflight(tampered),
    /evidence digest mismatch/u,
  );
});

test("report contains no connection string, credential or business-row payload", () => {
  const serialized = JSON.stringify(preflight()).toLowerCase();
  for (const forbidden of [
    "databaseurl",
    "postgresql://",
    "password",
    "private key",
    "businessrow",
    "payload",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `report contains ${forbidden}`);
  }
});

test("every database statement is statically read-only or transaction-local", () => {
  for (const [name, sql] of Object.entries(P0_READ_ONLY_SQL)) {
    for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
      assert.match(
        statement,
        /^(BEGIN|ROLLBACK|SELECT|SET)\b/iu,
        `${name} contains a non-read-only statement`,
      );
      assert.doesNotMatch(
        statement,
        /\b(ALTER|CALL|COPY|CREATE|DELETE|DO|DROP|GRANT|INSERT|REVOKE|TRUNCATE|UPDATE)\b/iu,
        `${name} contains a mutating SQL keyword`,
      );
    }
  }
});

test("production runner is a scoped, no-authority temporary host runtime", async () => {
  const runnerPath = fileURLToPath(new URL(
    "./m1-production-storage-read-only-preflight.sh",
    import.meta.url,
  ));
  const source = await readFile(runnerPath, "utf8");
  assert.match(source, /HOST_NODE_BINARY/u);
  assert.match(source, /HOST_NODE_MODULES/u);
  assert.match(source, /\.State\.Pid/u);
  assert.match(source, /--preserve-symlinks/u);
  assert.match(source, /timeout 60s/u);
  assert.match(source, /sudo test -d "\$\{POSTGRES_DATA_SOURCE\}"/u);
  assert.match(source, /REPEATABLE_READ_READ_ONLY/u);
  assert.match(source, /database-facts\.json/u);
  assert.match(source, /docker-before\.json/u);
  assert.match(source, /docker-after\.json/u);
  assert.match(source, /docker inspect "\$\{POSTGRES_CONTAINER\}"/u);
  assert.match(source, /@uri/u);
  assert.match(source, /\.s\.PGSQL\.5432/u);
  assert.match(source, /temporaryRuntimeRemoved/u);
  assert.match(source, /productionDatabaseMutation: false/u);
  assert.doesNotMatch(source, /GraphDriver/u);
  assert.doesNotMatch(source, /POSTGRES_PASSWORD/u);
  assert.doesNotMatch(source, /substr\(\$0, 1, 13\) == "DATABASE_URL="/u);
  assert.doesNotMatch(source, /sudo docker run/u);
  assert.doesNotMatch(source, /docker compose[^\n]*(up|down|restart)/u);
  assert.doesNotMatch(source, /\bpsql\b/u);
  assert.doesNotMatch(source, /\b(CONFIRM_MIGRATION|INSERT INTO|CREATE TABLE|DROP TABLE)\b/u);
  const plan = JSON.parse(execFileSync("bash", [runnerPath, "plan"], {
    encoding: "utf8",
  }));
  assert.equal(plan.productionDatabaseMutation, false);
  assert.equal(plan.migrationAllowed, false);
  assert.equal(plan.temporaryHostRuntimeOnly, true);
});

test("schema classifier rejects managed residue when the schema is reported absent", () => {
  const storage = databaseFacts().storage;
  storage.capabilityRoles = [role("market_radar_v2_m1_reader")];
  assert.deepEqual(classifyProductionStorageSchema(storage), {
    reasonCodes: ["absent_schema_has_managed_residue"],
    stage: "SCHEMA_DRIFT",
    valid: false,
  });
});
