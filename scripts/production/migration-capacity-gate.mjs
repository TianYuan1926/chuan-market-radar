#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SCHEMA_VERSION = "candidate-migration-capacity-evidence.v1";
const MAX_EVIDENCE_AGE_MINUTES = 15;
const MAX_BACKUP_AGE_MINUTES = 15;
const MAX_RESTORE_DRILL_AGE_DAYS = 90;
const MAX_PROJECTED_DISK_USE_PERCENT = 70;
const MAX_RPO_MINUTES = 24 * 60;
const MAX_RTO_MINUTES = 2 * 60;

const ALLOWED_KEYS = {
  root: new Set([
    "schemaVersion",
    "capturedAt",
    "primaryHost",
    "offHostBackup",
    "restoreTarget",
    "restoreDrill",
  ]),
  primaryHost: new Set([
    "totalBytes",
    "usedBytes",
    "databaseBytes",
    "localBackupBytes",
    "migrationTempBytes",
    "walPeakBytes",
    "rollbackReserveBytes",
    "safetyReserveBytes",
  ]),
  offHostBackup: new Set([
    "createdAt",
    "encrypted",
    "offHost",
    "checksumVerified",
    "archiveVerified",
  ]),
  restoreTarget: new Set(["class", "totalBytes", "availableBytes"]),
  restoreDrill: new Set([
    "completedAt",
    "passed",
    "isolated",
    "rpoMinutes",
    "rtoMinutes",
  ]),
};

export class CapacityGateError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = "CapacityGateError";
    this.reason = reason;
  }
}

function fail(reason, message) {
  throw new CapacityGateError(reason, message);
}

function assertPlainObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("evidence_invalid", `${path} must be an object`);
  }
}

function assertAllowedKeys(value, allowed, path) {
  assertPlainObject(value, path);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail("unexpected_evidence_key", `${path}.${key} is not allowed`);
    }
  }
}

function requireFiniteNumber(value, path, { allowZero = false } = {}) {
  const valid = Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);
  if (!valid) {
    fail("evidence_invalid", `${path} must be a ${allowZero ? "non-negative" : "positive"} number`);
  }
  return value;
}

function requireBoolean(value, path) {
  if (typeof value !== "boolean") {
    fail("evidence_invalid", `${path} must be a boolean`);
  }
  return value;
}

function requireDate(value, path) {
  if (typeof value !== "string") {
    fail("evidence_invalid", `${path} must be an ISO timestamp`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    fail("evidence_invalid", `${path} must be a canonical ISO timestamp`);
  }
  return date;
}

function ageMinutes(date, now) {
  return (now.getTime() - date.getTime()) / 60_000;
}

function ageDays(date, now) {
  return ageMinutes(date, now) / (24 * 60);
}

function withinAge(date, now, maximum) {
  const age = ageMinutes(date, now);
  return age >= 0 && age <= maximum;
}

function addCheck(checks, name, passed, detail) {
  checks.push({ name, passed, detail });
}

function validateShape(evidence) {
  assertAllowedKeys(evidence, ALLOWED_KEYS.root, "evidence");
  assertAllowedKeys(evidence.primaryHost, ALLOWED_KEYS.primaryHost, "primaryHost");
  assertAllowedKeys(evidence.offHostBackup, ALLOWED_KEYS.offHostBackup, "offHostBackup");
  assertAllowedKeys(evidence.restoreTarget, ALLOWED_KEYS.restoreTarget, "restoreTarget");
  assertAllowedKeys(evidence.restoreDrill, ALLOWED_KEYS.restoreDrill, "restoreDrill");

  if (evidence.schemaVersion !== SCHEMA_VERSION) {
    fail("evidence_invalid", `schemaVersion must equal ${SCHEMA_VERSION}`);
  }

  requireDate(evidence.capturedAt, "capturedAt");
  const primary = evidence.primaryHost;
  requireFiniteNumber(primary.totalBytes, "primaryHost.totalBytes");
  requireFiniteNumber(primary.usedBytes, "primaryHost.usedBytes", { allowZero: true });
  requireFiniteNumber(primary.databaseBytes, "primaryHost.databaseBytes");
  requireFiniteNumber(primary.localBackupBytes, "primaryHost.localBackupBytes");
  requireFiniteNumber(primary.migrationTempBytes, "primaryHost.migrationTempBytes");
  requireFiniteNumber(primary.walPeakBytes, "primaryHost.walPeakBytes");
  requireFiniteNumber(primary.rollbackReserveBytes, "primaryHost.rollbackReserveBytes");
  requireFiniteNumber(primary.safetyReserveBytes, "primaryHost.safetyReserveBytes");

  const backup = evidence.offHostBackup;
  requireDate(backup.createdAt, "offHostBackup.createdAt");
  requireBoolean(backup.encrypted, "offHostBackup.encrypted");
  requireBoolean(backup.offHost, "offHostBackup.offHost");
  requireBoolean(backup.checksumVerified, "offHostBackup.checksumVerified");
  requireBoolean(backup.archiveVerified, "offHostBackup.archiveVerified");

  const restoreTarget = evidence.restoreTarget;
  if (restoreTarget.class !== "external_isolated") {
    fail("evidence_invalid", "restoreTarget.class must equal external_isolated");
  }
  requireFiniteNumber(restoreTarget.totalBytes, "restoreTarget.totalBytes");
  requireFiniteNumber(restoreTarget.availableBytes, "restoreTarget.availableBytes");

  const drill = evidence.restoreDrill;
  requireDate(drill.completedAt, "restoreDrill.completedAt");
  requireBoolean(drill.passed, "restoreDrill.passed");
  requireBoolean(drill.isolated, "restoreDrill.isolated");
  requireFiniteNumber(drill.rpoMinutes, "restoreDrill.rpoMinutes", { allowZero: true });
  requireFiniteNumber(drill.rtoMinutes, "restoreDrill.rtoMinutes", { allowZero: true });

  if (primary.usedBytes > primary.totalBytes) {
    fail("evidence_invalid", "primaryHost.usedBytes cannot exceed totalBytes");
  }
  if (restoreTarget.availableBytes > restoreTarget.totalBytes) {
    fail("evidence_invalid", "restoreTarget.availableBytes cannot exceed totalBytes");
  }
}

export function evaluateMigrationCapacity(evidence, { now = new Date() } = {}) {
  validateShape(evidence);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail("evidence_invalid", "now must be a valid Date");
  }

  const primary = evidence.primaryHost;
  const backup = evidence.offHostBackup;
  const restoreTarget = evidence.restoreTarget;
  const drill = evidence.restoreDrill;
  const capturedAt = requireDate(evidence.capturedAt, "capturedAt");
  const backupCreatedAt = requireDate(backup.createdAt, "offHostBackup.createdAt");
  const restoreCompletedAt = requireDate(drill.completedAt, "restoreDrill.completedAt");

  const projectedConsumptionBytes =
    primary.localBackupBytes
    + primary.migrationTempBytes
    + primary.walPeakBytes
    + primary.rollbackReserveBytes;
  const requiredPrimaryHeadroomBytes = projectedConsumptionBytes + primary.safetyReserveBytes;
  const availablePrimaryBytes = primary.totalBytes - primary.usedBytes;
  const projectedDiskUsePercent = Math.ceil(
    ((primary.usedBytes + projectedConsumptionBytes) / primary.totalBytes) * 100,
  );
  const requiredRestoreBytes =
    primary.databaseBytes + primary.localBackupBytes + primary.safetyReserveBytes;

  const checks = [];
  addCheck(
    checks,
    "capacity_evidence_fresh",
    withinAge(capturedAt, now, MAX_EVIDENCE_AGE_MINUTES),
    { ageMinutes: ageMinutes(capturedAt, now), maximumMinutes: MAX_EVIDENCE_AGE_MINUTES },
  );
  addCheck(
    checks,
    "primary_required_headroom_available",
    availablePrimaryBytes >= requiredPrimaryHeadroomBytes,
    { availableBytes: availablePrimaryBytes, requiredBytes: requiredPrimaryHeadroomBytes },
  );
  addCheck(
    checks,
    "primary_projected_disk_below_threshold",
    projectedDiskUsePercent <= MAX_PROJECTED_DISK_USE_PERCENT,
    { projectedPercent: projectedDiskUsePercent, maximumPercent: MAX_PROJECTED_DISK_USE_PERCENT },
  );
  addCheck(checks, "off_host_backup_fresh", withinAge(backupCreatedAt, now, MAX_BACKUP_AGE_MINUTES), {
    ageMinutes: ageMinutes(backupCreatedAt, now),
    maximumMinutes: MAX_BACKUP_AGE_MINUTES,
  });
  addCheck(checks, "off_host_backup_encrypted", backup.encrypted, {});
  addCheck(checks, "off_host_backup_location_verified", backup.offHost, {});
  addCheck(checks, "off_host_backup_checksum_verified", backup.checksumVerified, {});
  addCheck(checks, "off_host_backup_archive_verified", backup.archiveVerified, {});
  addCheck(
    checks,
    "restore_target_capacity_sufficient",
    restoreTarget.availableBytes >= requiredRestoreBytes,
    { availableBytes: restoreTarget.availableBytes, requiredBytes: requiredRestoreBytes },
  );
  addCheck(checks, "restore_drill_passed", drill.passed, {});
  addCheck(checks, "restore_drill_isolated", drill.isolated, {});
  addCheck(
    checks,
    "restore_drill_fresh",
    ageDays(restoreCompletedAt, now) >= 0
      && ageDays(restoreCompletedAt, now) <= MAX_RESTORE_DRILL_AGE_DAYS,
    { ageDays: ageDays(restoreCompletedAt, now), maximumDays: MAX_RESTORE_DRILL_AGE_DAYS },
  );
  addCheck(
    checks,
    "restore_drill_rpo_within_target",
    drill.rpoMinutes <= MAX_RPO_MINUTES,
    { actualMinutes: drill.rpoMinutes, maximumMinutes: MAX_RPO_MINUTES },
  );
  addCheck(
    checks,
    "restore_drill_rto_within_target",
    drill.rtoMinutes <= MAX_RTO_MINUTES,
    { actualMinutes: drill.rtoMinutes, maximumMinutes: MAX_RTO_MINUTES },
  );

  const failedChecks = checks.filter((check) => !check.passed).map((check) => check.name);
  return {
    schemaVersion: "candidate-migration-capacity-gate-result.v1",
    evaluatedAt: now.toISOString(),
    sourceCapturedAt: evidence.capturedAt,
    status: failedChecks.length === 0 ? "pass" : "fail",
    canRequestAddSchemaApproval: failedChecks.length === 0,
    projectedDiskUsePercent,
    availablePrimaryBytes,
    requiredPrimaryHeadroomBytes,
    requiredRestoreBytes,
    checks,
    failedChecks,
    boundary: {
      authorizesMigration: false,
      connectsToProduction: false,
      executesBackupOrRestore: false,
      nextStep: failedChecks.length === 0
        ? "request_explicit_wp_g0_2_add_schema_rerun_approval"
        : "remediate_failed_capacity_or_recovery_checks",
    },
  };
}

export function createCapacityTemplate({ now = new Date() } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    capturedAt: now.toISOString(),
    primaryHost: {
      totalBytes: 0,
      usedBytes: 0,
      databaseBytes: 0,
      localBackupBytes: 0,
      migrationTempBytes: 0,
      walPeakBytes: 0,
      rollbackReserveBytes: 0,
      safetyReserveBytes: 0,
    },
    offHostBackup: {
      createdAt: now.toISOString(),
      encrypted: false,
      offHost: false,
      checksumVerified: false,
      archiveVerified: false,
    },
    restoreTarget: {
      class: "external_isolated",
      totalBytes: 0,
      availableBytes: 0,
    },
    restoreDrill: {
      completedAt: now.toISOString(),
      passed: false,
      isolated: false,
      rpoMinutes: 0,
      rtoMinutes: 0,
    },
  };
}

export async function loadCapacityEvidence(path) {
  let value;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    fail("evidence_invalid", `cannot read capacity evidence: ${error.message}`);
  }
  assertAllowedKeys(value, ALLOWED_KEYS.root, "evidence");
  return value;
}

function parseCliArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      fail("cli_invalid", "options must use --name value pairs");
    }
    options[key.slice(2)] = value;
  }
  return { command, options };
}

async function writeOutput(value, output) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (output) {
    await writeFile(resolve(output), serialized, { mode: 0o600 });
  } else {
    process.stdout.write(serialized);
  }
}

async function main() {
  const { command, options } = parseCliArgs(process.argv.slice(2));
  const now = options.now ? new Date(options.now) : new Date();
  if (command === "template") {
    await writeOutput(createCapacityTemplate({ now }), options.output);
    return;
  }
  if (command !== "evaluate" || !options.input) {
    fail(
      "cli_invalid",
      "usage: migration-capacity-gate.mjs template [--output file] | evaluate --input file [--output file] [--now ISO]",
    );
  }
  const result = evaluateMigrationCapacity(await loadCapacityEvidence(resolve(options.input)), { now });
  await writeOutput(result, options.output);
  if (result.status !== "pass") {
    process.exitCode = 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    const reason = error instanceof CapacityGateError ? error.reason : "unexpected_error";
    process.stderr.write(`${JSON.stringify({ status: "fail", reason, message: error.message })}\n`);
    process.exitCode = 1;
  });
}
