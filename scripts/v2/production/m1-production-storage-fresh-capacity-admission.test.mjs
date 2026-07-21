import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildM1ProductionStorageFreshCapacityAdmission,
  SUPERSEDED_LEGACY_CAPACITY_CHECKS,
  verifyM1ProductionStorageFreshCapacityAdmission,
} from "./m1-production-storage-fresh-capacity-admission.mjs";
import {
  P0_DATABASE_FACTS_SCHEMA_VERSION,
  P0_HOST_FACTS_SCHEMA_VERSION,
  P0_RECOVERY_EVIDENCE_SCHEMA_VERSION,
  buildM1ProductionStorageReadOnlyPreflight,
  stableDigest,
} from "./m1-production-storage-read-only-preflight.mjs";
import { P0R_NO_COST_CAPACITY_PLAN } from "./m1-production-storage-p0r-no-cost-capacity.mjs";

const GIB = 1024 ** 3;
const SOURCE_COMMIT = "a".repeat(40);
const SOURCE_TREE = "b".repeat(40);
const PRODUCTION_HEAD = "c".repeat(40);
const PROBE_DIGEST = `sha256:${"d".repeat(64)}`;
const DATABASE_IDENTITY_DIGEST = `sha256:${"e".repeat(64)}`;
const FILE_DIGEST = `sha256:${"f".repeat(64)}`;
const PREFLIGHT_AT = "2026-07-21T12:00:00.000Z";
const ADMITTED_AT = "2026-07-21T12:01:00.000Z";
const SCRIPT_PATH = fileURLToPath(new URL(
  "./m1-production-storage-fresh-capacity-admission.mjs",
  import.meta.url,
));

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
      activeConnections: 2,
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
      availableBytes: 70 * GIB,
      postgresDataBytes: 3 * GIB,
      postgresWalBytes: GIB,
      totalBytes: 120 * GIB,
      usedBytes: 47 * GIB,
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

function recoveryEvidence(targetAvailableBytes = 30 * GIB) {
  return {
    backup: {
      archiveVerified: true,
      checksumVerified: true,
      completedAt: "2026-07-21T11:35:00.000Z",
      createdAt: "2026-07-21T11:30:00.000Z",
      encrypted: true,
      encryptedBackupBytes: GIB,
      encryptedBackupDigest: `sha256:${"2".repeat(64)}`,
      offHost: true,
    },
    capturedAt: "2026-07-21T11:45:00.000Z",
    productionHead: PRODUCTION_HEAD,
    restore: {
      businessRowsOutput: false,
      completedAt: "2026-07-21T11:40:00.000Z",
      evidenceDigest: `sha256:${"3".repeat(64)}`,
      isolated: true,
      passed: true,
      plaintextDumpRetained: false,
      restoreClusterRetained: false,
      rpoMinutes: 10,
      rtoMinutes: 5,
      sourceEncryptedBackupDigest: `sha256:${"2".repeat(64)}`,
      targetAvailableBytes,
    },
    schemaVersion: P0_RECOVERY_EVIDENCE_SCHEMA_VERSION,
    sourceDatabaseIdentityDigest: DATABASE_IDENTITY_DIGEST,
  };
}

function signedCalibration() {
  const cycles = 8;
  const factsPerCycle = 1_444;
  const cycleSamples = Array.from({ length: cycles }, (_, index) => ({
    cycle: index + 1,
    databaseBytes: 8_000_000 + (index + 1) * 4_100_000,
    factIdentityTotalBytes: 1_300_000 * (index + 1),
    factPartitionTotalBytes: 2_800_000 * (index + 1),
    factRows: (index + 1) * factsPerCycle,
    wallDurationMs: 25_000 + index * 500,
  }));
  const first = cycleSamples[0];
  const last = cycleSamples.at(-1);
  const factRows = cycles * factsPerCycle;
  const incrementalRows = last.factRows - first.factRows;
  const incrementalFactStorageBytes =
    last.factIdentityTotalBytes + last.factPartitionTotalBytes
    - first.factIdentityTotalBytes - first.factPartitionTotalBytes;
  const databaseBaselineBytes = 8_000_000;
  const databaseFinalBytes = last.databaseBytes + 100_000;
  const walBytes = factRows * 3_321;
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
      configuredRetentionHours: 30,
      cycleIntervalMs: 60_000,
      cycleSamples,
      cycles,
      factsPerCycle,
      logicalFactHoursRepresented: cycles / 60,
      maximumCycleWallDurationMs: Math.max(...cycleSamples.map((entry) => entry.wallDurationMs)),
      meanCycleWallDurationMs: Math.ceil(
        cycleSamples.reduce((total, entry) => total + entry.wallDurationMs, 0) / cycles,
      ),
      sourceCutoffStart: "2026-07-21T00:00:00.500Z",
    },
    completedAt: "2026-07-21T11:50:00.000Z",
    evidenceClass: "ISOLATED_SYNTHETIC_PRODUCTION_SHAPE",
    measurements: {
      artifactLedgerRows: cycles + 1,
      artifactLedgerTotalBytes: 250_000,
      averagePayloadBytes: 1_005,
      averageRowBytes: 1_465,
      databaseBaselineBytes,
      databaseFinalBytes,
      databaseGrowthBytes: databaseFinalBytes - databaseBaselineBytes,
      factIdentityTotalBytes: last.factIdentityTotalBytes,
      factPartitionHeapBytes: last.factPartitionTotalBytes - 1_500_000,
      factPartitionIndexBytes: 1_450_000,
      factPartitionTotalBytes: last.factPartitionTotalBytes,
      factRows,
      factStorageBytesPerRowCeiling: Math.ceil(
        (last.factIdentityTotalBytes + last.factPartitionTotalBytes) / factRows,
      ),
      incrementalFactStorageBytes,
      incrementalFactStorageBytesPerRowCeiling: Math.ceil(
        incrementalFactStorageBytes / incrementalRows,
      ),
      incrementalRows,
      maximumPayloadBytes: 1_015,
      maximumRowBytes: 1_474,
      walBytes,
      walBytesPerFactCeiling: Math.ceil(walBytes / factRows),
    },
    postgresMajor: 16,
    releaseId: "m1-p0r-d0-capacity-calibration-v1",
    schemaVersion: "v2-m1-p0r-d0-isolated-capacity-calibration.v1",
    sourceCommit: SOURCE_COMMIT,
    sourceState: "CLEAN_COMMIT",
    sourceTree: SOURCE_TREE,
    startedAt: "2026-07-21T11:45:00.000Z",
    status: "PASS_ISOLATED_CAPACITY_CALIBRATION",
  };
  return { ...unsigned, calibrationDigest: stableDigest(unsigned) };
}

function admissionInput(overrides = {}) {
  const database = overrides.databaseFacts ?? databaseFacts();
  const host = overrides.hostFacts ?? hostFacts();
  const recovery = overrides.recoveryEvidence === undefined
    ? recoveryEvidence()
    : overrides.recoveryEvidence;
  const preflight = overrides.preflightReport
    ?? buildM1ProductionStorageReadOnlyPreflight({
      databaseFacts: database,
      evaluatedAt: PREFLIGHT_AT,
      expectedProbeScriptDigest: PROBE_DIGEST,
      expectedSourceCommit: SOURCE_COMMIT,
      hostFacts: host,
      recoveryEvidence: recovery,
    });
  return {
    admittedAt: overrides.admittedAt ?? ADMITTED_AT,
    calibrationEvidence: overrides.calibrationEvidence ?? signedCalibration(),
    calibrationFileDigest: FILE_DIGEST,
    databaseFacts: database,
    databaseFactsFileDigest: FILE_DIGEST,
    expectedProbeScriptDigest: PROBE_DIGEST,
    expectedSourceCommit: SOURCE_COMMIT,
    expectedSourceTree: SOURCE_TREE,
    hostFacts: host,
    hostFactsFileDigest: FILE_DIGEST,
    plan: { ...P0R_NO_COST_CAPACITY_PLAN, ...(overrides.plan ?? {}) },
    preflightReport: preflight,
    preflightReportFileDigest: FILE_DIGEST,
    recoveryEvidence: recovery,
    recoveryEvidenceFileDigest: recovery === null ? null : FILE_DIGEST,
  };
}

test("fresh six-hour admission supersedes only legacy capacity failures", () => {
  const input = admissionInput();
  assert.equal(input.preflightReport.status, "BLOCKED");
  assert.deepEqual(input.preflightReport.blockers.sort(), [
    "primary_capacity_headroom_available",
    "primary_projected_disk_use_below_70_percent",
    "restore_target_capacity_sufficient",
  ]);
  const report = buildM1ProductionStorageFreshCapacityAdmission(input);
  assert.equal(report.status, "PASS");
  assert.equal(report.conclusion, "PASS_READY_FOR_ADDITIVE_SIX_HOUR_SCHEMA");
  assert.equal(report.capacityMathStatus, "PASS_FRESH_PRODUCTION_TOPOLOGY_MODEL");
  assert.equal(report.productionCapacityPassClaimed, true);
  assert.deepEqual(report.inheritedPreflightBlockers, []);
  assert.deepEqual(
    report.supersededLegacyCapacityBlockers,
    [...SUPERSEDED_LEGACY_CAPACITY_CHECKS].sort(),
  );
  assert.ok(report.capacity.peakProjectedDiskUsePercent <= 70);
  assert.ok(
    report.capacity.recoveryTargetAvailableBytes
      >= report.capacity.requiredIsolatedRestoreTargetBytes,
  );
  assert.equal(verifyM1ProductionStorageFreshCapacityAdmission(report), report);
});

test("inherits every non-capacity P0 blocker", () => {
  const database = databaseFacts();
  database.runtime.waitingLockCount = 1;
  const report = buildM1ProductionStorageFreshCapacityAdmission(
    admissionInput({ databaseFacts: database }),
  );
  assert.equal(report.status, "BLOCKED");
  assert.equal(report.productionCapacityPassClaimed, false);
  assert.ok(report.blockers.includes("lock_and_transaction_blockers_absent"));
  assert.ok(report.blockers.includes("inherited_non_capacity_preflight_checks_pass"));
});

test("cannot pass without bound recovery evidence", () => {
  const report = buildM1ProductionStorageFreshCapacityAdmission(
    admissionInput({ recoveryEvidence: null }),
  );
  assert.equal(report.status, "BLOCKED");
  assert.ok(report.blockers.includes("recovery_evidence_present"));
  assert.ok(report.blockers.includes("recovery_evidence_supplied"));
  assert.ok(report.blockers.includes("isolated_restore_target_capacity_sufficient"));
});

test("expired production topology remains a blocker", () => {
  const report = buildM1ProductionStorageFreshCapacityAdmission(
    admissionInput({ admittedAt: "2026-07-21T12:16:00.000Z" }),
  );
  assert.equal(report.status, "BLOCKED");
  assert.ok(report.blockers.includes("fresh_read_only_preflight"));
  assert.equal(verifyM1ProductionStorageFreshCapacityAdmission(report), report);
});

test("daily partitions and weakened plans cannot manufacture a pass", () => {
  const report = buildM1ProductionStorageFreshCapacityAdmission(admissionInput({
    plan: {
      detectorMaxLookbackHours: 12,
      partitionSpanHours: 24,
      plannedFactsPerCycle: 1_000,
    },
  }));
  assert.equal(report.status, "BLOCKED");
  assert.ok(report.blockers.includes("partition_span_bounded_and_day_aligned"));
  assert.ok(report.blockers.includes("detector_lookback_not_reduced"));
  assert.ok(report.blockers.includes("planned_universe_reserve_not_reduced"));
});

test("steady use above 60 percent blocks even when peak stays within 70 percent", () => {
  const host = hostFacts();
  host.disk.usedBytes = 52 * GIB;
  host.disk.availableBytes = 65 * GIB;
  const report = buildM1ProductionStorageFreshCapacityAdmission(
    admissionInput({ hostFacts: host }),
  );
  assert.equal(report.status, "BLOCKED");
  assert.ok(report.capacity.steadyProjectedDiskUsePercent > 60);
  assert.ok(report.capacity.peakProjectedDiskUsePercent <= 70);
  assert.ok(
    report.blockers.includes("steady_projected_disk_use_below_or_equal_60_percent"),
  );
});

test("isolated restore target must fit the new full projected dataset", () => {
  const report = buildM1ProductionStorageFreshCapacityAdmission(admissionInput({
    recoveryEvidence: recoveryEvidence(20 * GIB),
  }));
  assert.equal(report.status, "BLOCKED");
  assert.ok(report.blockers.includes("isolated_restore_target_capacity_sufficient"));
  assert.ok(
    report.capacity.recoveryTargetAvailableBytes
      < report.capacity.requiredIsolatedRestoreTargetBytes,
  );
});

test("rejects a re-signed report that is not reproducible from raw evidence", () => {
  const input = admissionInput();
  const tampered = structuredClone(input.preflightReport);
  tampered.advisories.push("invented_advisory");
  const { evidenceDigest: ignored, ...unsigned } = tampered;
  void ignored;
  tampered.evidenceDigest = stableDigest(unsigned);
  assert.throws(
    () => buildM1ProductionStorageFreshCapacityAdmission({
      ...input,
      preflightReport: tampered,
    }),
    /not reproducible/u,
  );
});

test("rejects mismatched source and evidence-file bindings", () => {
  const input = admissionInput();
  assert.throws(
    () => buildM1ProductionStorageFreshCapacityAdmission({
      ...input,
      expectedSourceCommit: "0".repeat(40),
    }),
    /source_commit_bound|not reproducible/u,
  );
  assert.throws(
    () => buildM1ProductionStorageFreshCapacityAdmission({
      ...input,
      recoveryEvidenceFileDigest: null,
    }),
    /supplied together/u,
  );
});

test("CLI evaluates protected evidence files and verifies its immutable output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "market-radar-fresh-p0-"));
  await chmod(directory, 0o700);
  try {
    const input = admissionInput();
    const paths = Object.fromEntries([
      ["calibration", input.calibrationEvidence],
      ["database-facts", input.databaseFacts],
      ["host-facts", input.hostFacts],
      ["preflight-report", input.preflightReport],
      ["recovery-evidence", input.recoveryEvidence],
    ].map(([name, value]) => [name, {
      path: join(directory, `${name}.json`),
      value,
    }]));
    await Promise.all(Object.values(paths).map(async ({ path, value }) => {
      await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
      await chmod(path, 0o600);
    }));
    const output = join(directory, "fresh-capacity-admission.json");
    const evaluate = JSON.parse(execFileSync(process.execPath, [
      SCRIPT_PATH,
      "evaluate",
      "--admitted-at", ADMITTED_AT,
      "--calibration", paths.calibration.path,
      "--database-facts", paths["database-facts"].path,
      "--host-facts", paths["host-facts"].path,
      "--output", output,
      "--preflight-report", paths["preflight-report"].path,
      "--probe-script-digest", PROBE_DIGEST,
      "--recovery-evidence", paths["recovery-evidence"].path,
      "--source-commit", SOURCE_COMMIT,
      "--source-tree", SOURCE_TREE,
    ], { encoding: "utf8" }));
    assert.equal(evaluate.status, "PASS");
    assert.equal(evaluate.productionCapacityPassClaimed, true);
    assert.equal(evaluate.productionChanged, false);
    const report = JSON.parse(await readFile(output, "utf8"));
    assert.equal(verifyM1ProductionStorageFreshCapacityAdmission(report), report);
    const verify = JSON.parse(execFileSync(process.execPath, [
      SCRIPT_PATH,
      "verify",
      "--report", output,
    ], { encoding: "utf8" }));
    assert.equal(verify.reportValid, true);
    assert.equal(verify.evidenceDigest, report.evidenceDigest);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
