#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildM1ProductionStorageReadOnlyPreflight,
  stableDigest,
  verifyM1ProductionStorageReadOnlyPreflight,
} from "./m1-production-storage-read-only-preflight.mjs";
import {
  evaluateM1NoCostCapacityModel,
  P0R_NO_COST_CAPACITY_PLAN,
} from "./m1-production-storage-p0r-no-cost-capacity.mjs";

export const FRESH_CAPACITY_ADMISSION_SCHEMA_VERSION =
  "v2-m1-production-storage-fresh-capacity-admission.v1";

export const SUPERSEDED_LEGACY_CAPACITY_CHECKS = Object.freeze([
  "primary_capacity_headroom_available",
  "primary_projected_disk_use_below_70_percent",
  "restore_target_capacity_sufficient",
]);

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAXIMUM_JSON_BYTES = 4 * 1024 * 1024;

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

function text(value, label, pattern) {
  assert.equal(typeof value, "string", `${label} must be text`);
  assert.match(value, pattern, `${label} is invalid`);
  return value;
}

function digest(value, label) {
  return text(value, label, SHA256_PATTERN);
}

function commit(value, label) {
  return text(value, label, COMMIT_PATTERN);
}

function iso(value, label) {
  text(value, label, ISO_PATTERN);
  assert.equal(new Date(value).toISOString(), value, `${label} must be canonical UTC`);
  return value;
}

function fileDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function checkList(checks) {
  return Object.entries(checks)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, passed]) => ({ id, passed: Boolean(passed) }));
}

export function buildM1ProductionStorageFreshCapacityAdmission(input) {
  exactKeys(input, [
    "admittedAt",
    "calibrationEvidence",
    "calibrationFileDigest",
    "databaseFacts",
    "databaseFactsFileDigest",
    "expectedProbeScriptDigest",
    "expectedSourceCommit",
    "expectedSourceTree",
    "hostFacts",
    "hostFactsFileDigest",
    "plan",
    "preflightReport",
    "preflightReportFileDigest",
    "recoveryEvidence",
    "recoveryEvidenceFileDigest",
  ], "admissionInput");
  const admittedAt = iso(input.admittedAt, "admissionInput.admittedAt");
  const expectedSourceCommit = commit(
    input.expectedSourceCommit,
    "admissionInput.expectedSourceCommit",
  );
  const expectedSourceTree = commit(
    input.expectedSourceTree,
    "admissionInput.expectedSourceTree",
  );
  const expectedProbeScriptDigest = digest(
    input.expectedProbeScriptDigest,
    "admissionInput.expectedProbeScriptDigest",
  );
  const evidenceFileDigests = {
    calibrationFileDigest: digest(
      input.calibrationFileDigest,
      "admissionInput.calibrationFileDigest",
    ),
    databaseFactsFileDigest: digest(
      input.databaseFactsFileDigest,
      "admissionInput.databaseFactsFileDigest",
    ),
    hostFactsFileDigest: digest(
      input.hostFactsFileDigest,
      "admissionInput.hostFactsFileDigest",
    ),
    preflightReportFileDigest: digest(
      input.preflightReportFileDigest,
      "admissionInput.preflightReportFileDigest",
    ),
    recoveryEvidenceFileDigest: input.recoveryEvidenceFileDigest === null
      ? null
      : digest(
          input.recoveryEvidenceFileDigest,
          "admissionInput.recoveryEvidenceFileDigest",
        ),
  };
  assert.equal(
    input.recoveryEvidence === null,
    evidenceFileDigests.recoveryEvidenceFileDigest === null,
    "recovery evidence and file digest must be supplied together",
  );

  const preflight = verifyM1ProductionStorageReadOnlyPreflight(input.preflightReport);
  const rebuiltPreflight = buildM1ProductionStorageReadOnlyPreflight({
    databaseFacts: input.databaseFacts,
    evaluatedAt: preflight.evaluatedAt,
    expectedProbeScriptDigest,
    expectedSourceCommit,
    hostFacts: input.hostFacts,
    recoveryEvidence: input.recoveryEvidence,
  });
  assert.deepEqual(
    preflight,
    rebuiltPreflight,
    "preflight report is not reproducible from the bound raw evidence",
  );

  const capacityModel = evaluateM1NoCostCapacityModel({
    assessedAt: admittedAt,
    calibrationEvidence: input.calibrationEvidence,
    expectedSourceCommit,
    expectedSourceTree,
    plan: input.plan,
    topology: {
      filesystemAvailableBytes: input.hostFacts.disk.availableBytes,
      filesystemTotalBytes: input.hostFacts.disk.totalBytes,
      filesystemUsedBytes: input.hostFacts.disk.usedBytes,
    },
  });
  const supersededLegacyCapacityBlockers = preflight.blockers
    .filter((id) => SUPERSEDED_LEGACY_CAPACITY_CHECKS.includes(id))
    .sort();
  const inheritedPreflightBlockers = preflight.blockers
    .filter((id) => !SUPERSEDED_LEGACY_CAPACITY_CHECKS.includes(id))
    .sort();
  const requiredIsolatedRestoreTargetBytes = input.databaseFacts.server.databaseSizeBytes
    + capacityModel.capacity.steadyAdditionalBytes
    + capacityModel.capacity.effectiveReserves.walReserveBytes;
  assert.ok(
    Number.isSafeInteger(requiredIsolatedRestoreTargetBytes),
    "required isolated restore target bytes overflowed",
  );
  const recoveryTargetAvailableBytes = input.recoveryEvidence?.restore.targetAvailableBytes ?? 0;
  const preflightFresh = Date.parse(admittedAt) >= Date.parse(preflight.evaluatedAt)
    && Date.parse(admittedAt) <= Date.parse(preflight.expiresAt);
  const eligibleSchemaStage = [
    "ABSENT_CLEAN",
    "BASE_EXACT",
    "CHECKPOINT_EXACT",
    "PARTITION_EXACT",
  ].includes(preflight.database.schemaStage);
  const admissionChecks = {
    fresh_read_only_preflight: preflightFresh,
    inherited_non_capacity_preflight_checks_pass:
      inheritedPreflightBlockers.length === 0,
    isolated_restore_target_capacity_sufficient:
      input.recoveryEvidence !== null
      && recoveryTargetAvailableBytes >= requiredIsolatedRestoreTargetBytes,
    no_production_mutation_during_preflight:
      !preflight.migrationPerformed
      && !preflight.productionDatabaseMutation
      && !preflight.productionRepositoryMutation
      && !preflight.productionServiceMutation,
    recovery_evidence_supplied:
      input.recoveryEvidence !== null
      && preflight.recovery.status === "SUPPLIED",
    schema_stage_eligible_for_m1_storage: eligibleSchemaStage,
    six_hour_no_cost_capacity_model_pass:
      capacityModel.capacityModelBlockers.length === 0,
  };
  const failedAdmissionChecks = Object.entries(admissionChecks)
    .filter(([, passed]) => !passed)
    .map(([id]) => id);
  const blockers = uniqueSorted([
    ...inheritedPreflightBlockers,
    ...capacityModel.capacityModelBlockers,
    ...failedAdmissionChecks,
  ]);
  const passed = blockers.length === 0;
  const calibrationExpiryMs = Date.parse(input.calibrationEvidence.completedAt)
    + capacityModel.policy.calibrationMaximumAgeHours * 60 * 60_000;
  const expiresAt = new Date(Math.min(
    Date.parse(preflight.expiresAt),
    calibrationExpiryMs,
  )).toISOString();
  const conclusion = passed
    ? preflight.database.schemaStage === "PARTITION_EXACT"
      ? "PASS_EXACT_SCHEMA_ALREADY_PRESENT"
      : "PASS_READY_FOR_ADDITIVE_SIX_HOUR_SCHEMA"
    : "BLOCKED";
  const unsigned = {
    admittedAt,
    advisories: preflight.advisories,
    authorityMode: "NO_AUTHORITY",
    automaticTradingAllowed: false,
    blockers,
    calibration: {
      calibrationDigest: capacityModel.calibration.calibrationDigest,
      completedAt: capacityModel.calibration.completedAt,
      evidenceClass: capacityModel.calibration.evidenceClass,
      sourceCommit: capacityModel.calibration.sourceCommit,
      sourceTree: capacityModel.calibration.sourceTree,
    },
    calibratedRates: capacityModel.calibratedRates,
    candidateEmissionAllowed: false,
    capacity: {
      ...capacityModel.capacity,
      recoveryTargetAvailableBytes,
      requiredIsolatedRestoreTargetBytes,
    },
    capacityChecks: capacityModel.capacityChecks,
    capacityModelBlockers: capacityModel.capacityModelBlockers,
    capacityMathStatus: capacityModel.capacityModelBlockers.length === 0
      ? "PASS_FRESH_PRODUCTION_TOPOLOGY_MODEL"
      : "FAIL_FRESH_PRODUCTION_TOPOLOGY_MODEL",
    checks: checkList(admissionChecks),
    conclusion,
    evidence: {
      ...evidenceFileDigests,
      preflightEvidenceDigest: preflight.evidenceDigest,
      recoveryEvidenceDigest: input.recoveryEvidence?.restore.evidenceDigest ?? null,
    },
    expiresAt,
    inheritedPreflightBlockers,
    migrationPerformed: false,
    nextAction: passed
      ? preflight.database.schemaStage === "PARTITION_EXACT"
        ? "AUDIT_EXISTING_EXACT_SCHEMA_AND_SKIP_P1"
        : "REQUEST_EXPLICIT_M1_6_P1_ADD_SCHEMA_APPROVAL"
      : "REMEDIATE_BLOCKERS_AND_RERUN_FRESH_P0",
    plan: capacityModel.plan,
    productionCapacityPassClaimed: passed,
    productionDatabaseMutation: false,
    productionHead: preflight.productionHead,
    productionRepositoryMutation: false,
    productionServiceMutation: false,
    schemaStage: preflight.database.schemaStage,
    schemaVersion: FRESH_CAPACITY_ADMISSION_SCHEMA_VERSION,
    sourceCommit: expectedSourceCommit,
    sourceTree: expectedSourceTree,
    status: passed ? "PASS" : "BLOCKED",
    supersededLegacyCapacityBlockers,
  };
  return Object.freeze({ ...unsigned, evidenceDigest: stableDigest(unsigned) });
}

export function verifyM1ProductionStorageFreshCapacityAdmission(report) {
  exactKeys(report, [
    "admittedAt",
    "advisories",
    "authorityMode",
    "automaticTradingAllowed",
    "blockers",
    "calibratedRates",
    "calibration",
    "candidateEmissionAllowed",
    "capacity",
    "capacityChecks",
    "capacityMathStatus",
    "capacityModelBlockers",
    "checks",
    "conclusion",
    "evidence",
    "evidenceDigest",
    "expiresAt",
    "inheritedPreflightBlockers",
    "migrationPerformed",
    "nextAction",
    "plan",
    "productionCapacityPassClaimed",
    "productionDatabaseMutation",
    "productionHead",
    "productionRepositoryMutation",
    "productionServiceMutation",
    "schemaStage",
    "schemaVersion",
    "sourceCommit",
    "sourceTree",
    "status",
    "supersededLegacyCapacityBlockers",
  ], "admissionReport");
  const { evidenceDigest, ...unsigned } = report;
  assert.equal(
    digest(evidenceDigest, "admissionReport.evidenceDigest"),
    stableDigest(unsigned),
    "admission report evidence digest mismatch",
  );
  assert.equal(report.schemaVersion, FRESH_CAPACITY_ADMISSION_SCHEMA_VERSION);
  assert.equal(report.authorityMode, "NO_AUTHORITY");
  assert.equal(report.automaticTradingAllowed, false);
  assert.equal(report.candidateEmissionAllowed, false);
  assert.equal(report.migrationPerformed, false);
  assert.equal(report.productionDatabaseMutation, false);
  assert.equal(report.productionRepositoryMutation, false);
  assert.equal(report.productionServiceMutation, false);
  assert.equal(report.status === "PASS", report.blockers.length === 0);
  assert.equal(report.status === "PASS", report.checks.every((entry) => entry.passed));
  assert.equal(report.productionCapacityPassClaimed, report.status === "PASS");
  assert.equal(
    report.capacityMathStatus === "PASS_FRESH_PRODUCTION_TOPOLOGY_MODEL",
    report.capacityModelBlockers.length === 0,
  );
  if (report.status === "PASS") {
    assert.ok(Date.parse(report.expiresAt) >= Date.parse(report.admittedAt));
  }
  return report;
}

async function readProtectedJson(path, label) {
  const absolutePath = resolve(path);
  assert.equal(path, absolutePath, `${label} path must be absolute`);
  const facts = await lstat(absolutePath);
  assert.equal(facts.isSymbolicLink(), false, `${label} must not be a symlink`);
  assert.equal(facts.isFile(), true, `${label} must be a regular file`);
  assert.equal(facts.mode & 0o077, 0, `${label} permissions are too open`);
  assert.ok(
    facts.size > 0 && facts.size <= MAXIMUM_JSON_BYTES,
    `${label} size is invalid`,
  );
  const bytes = await readFile(absolutePath);
  return { digest: fileDigest(bytes), value: JSON.parse(bytes.toString("utf8")) };
}

async function writeProtectedJson(path, value) {
  const absolutePath = resolve(path);
  assert.equal(path, absolutePath, "admission output path must be absolute");
  const parent = dirname(absolutePath);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  await chmod(parent, 0o700);
  const parentFacts = await lstat(parent);
  assert.equal(parentFacts.isSymbolicLink(), false, "output parent must not be a symlink");
  assert.equal(parentFacts.mode & 0o077, 0, "output parent permissions are too open");
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  await chmod(absolutePath, 0o600);
}

function parseArguments(argv) {
  const [command = "", ...rest] = argv;
  assert.ok(["evaluate", "verify"].includes(command), "command is unsupported");
  assert.equal(rest.length % 2, 0, "arguments must be name/value pairs");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    assert.match(flag ?? "", /^--[a-z][a-z0-9-]*$/u, "argument name is invalid");
    assert.ok(value && !value.startsWith("--"), `${flag} requires a value`);
    const key = flag.slice(2);
    assert.equal(options[key], undefined, `${flag} was repeated`);
    options[key] = value;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === "verify") {
    const report = (await readProtectedJson(options.report, "admission report")).value;
    verifyM1ProductionStorageFreshCapacityAdmission(report);
    process.stdout.write(`${JSON.stringify({
      evidenceDigest: report.evidenceDigest,
      reportValid: true,
      status: report.status,
    })}\n`);
    return;
  }
  for (const name of [
    "calibration",
    "database-facts",
    "host-facts",
    "preflight-report",
    "recovery-evidence",
  ]) {
    assert.ok(options[name], `--${name} is required`);
  }
  for (const name of ["output", "probe-script-digest", "source-commit", "source-tree"]) {
    assert.ok(options[name], `--${name} is required`);
  }
  const [calibration, databaseFacts, hostFacts, preflightReport, recoveryEvidence] =
    await Promise.all([
      readProtectedJson(options.calibration, "capacity calibration"),
      readProtectedJson(options["database-facts"], "database facts"),
      readProtectedJson(options["host-facts"], "host facts"),
      readProtectedJson(options["preflight-report"], "preflight report"),
      readProtectedJson(options["recovery-evidence"], "recovery evidence"),
    ]);
  const report = buildM1ProductionStorageFreshCapacityAdmission({
    admittedAt: options["admitted-at"] ?? new Date().toISOString(),
    calibrationEvidence: calibration.value,
    calibrationFileDigest: calibration.digest,
    databaseFacts: databaseFacts.value,
    databaseFactsFileDigest: databaseFacts.digest,
    expectedProbeScriptDigest: options["probe-script-digest"],
    expectedSourceCommit: options["source-commit"],
    expectedSourceTree: options["source-tree"],
    hostFacts: hostFacts.value,
    hostFactsFileDigest: hostFacts.digest,
    plan: { ...P0R_NO_COST_CAPACITY_PLAN },
    preflightReport: preflightReport.value,
    preflightReportFileDigest: preflightReport.digest,
    recoveryEvidence: recoveryEvidence.value,
    recoveryEvidenceFileDigest: recoveryEvidence.digest,
  });
  verifyM1ProductionStorageFreshCapacityAdmission(report);
  await writeProtectedJson(options.output, report);
  process.stdout.write(`${JSON.stringify({
    blockers: report.blockers,
    evidenceDigest: report.evidenceDigest,
    outputWritten: true,
    productionCapacityPassClaimed: report.productionCapacityPassClaimed,
    productionChanged: false,
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
