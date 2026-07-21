#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stableDigest } from "./m1-production-storage-read-only-preflight.mjs";

const execFile = promisify(execFileCallback);
const GIB = 1024 ** 3;
const HOUR_MS = 60 * 60_000;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");

export const P0R_NO_COST_CAPACITY_POLICY = Object.freeze({
  baselineEvidenceIndexDigest:
    "sha256:b87c5d25229094e8b07f3a2c9b63c35e95d08b93d224f3b47c07479e26139a51",
  baselineReportEvidenceDigest:
    "sha256:344ae4e05ec78e74ca97c92728fc06576f744e795bf4919d6eb3b76ee145769e",
  calibrationCycleIntervalMs: 60_000,
  calibrationFactsPerCycle: 1_444,
  calibrationMaximumAgeHours: 24,
  calibrationMinimumCycles: 8,
  detectorMinimumLookbackHours: 24,
  factStorageSafetyMultiplierBasisPoints: 15_000,
  maximumPartitionSpanHours: 6,
  maximumProjectedDiskUsePercent: 70,
  maximumScanCycleIntervalMs: 60_000,
  maximumSweepLagHours: 1,
  migrationReserveBytes: 2 * GIB,
  nonFactOverheadBytes: 4 * GIB,
  plannedUniverseReserveBasisPoints: 2_500,
  recoveryMinimumOverlapHours: 6,
  rollbackReserveBytes: 5 * GIB,
  runtimeAndLogReserveBytes: 2 * GIB,
  walReserveBytes: 2 * GIB,
});

export const P0R_NO_COST_CAPACITY_PLAN = Object.freeze({
  configuredRetentionHours: 30,
  detectorMaxLookbackHours: 24,
  factStorageSafetyMultiplierBasisPoints: 15_000,
  localPlaintextBackupBytes: 0,
  maximumSweepLagHours: 1,
  migrationReserveBytes: 2 * GIB,
  nonFactOverheadBytes: 4 * GIB,
  partitionBoundaryTimeZone: "UTC",
  partitionSpanHours: 6,
  plannedFactsPerCycle: 1_805,
  recoveryOverlapHours: 6,
  researchBulkOnProductionRoot: false,
  restoreTargetOnProductionRoot: false,
  rollbackReserveBytes: 5 * GIB,
  runtimeAndLogReserveBytes: 2 * GIB,
  scanCycleIntervalMs: 60_000,
  streamEncryptedBackupDirectlyOffHost: true,
  walReserveBytes: 2 * GIB,
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

function finiteNumber(value, label, { positive = false } = {}) {
  assert.ok(
    typeof value === "number"
      && Number.isFinite(value)
      && (positive ? value > 0 : value >= 0),
    `${label} must be a ${positive ? "positive" : "non-negative"} number`,
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

function sortedUniqueStrings(values, label) {
  assert.ok(Array.isArray(values), `${label} must be an array`);
  const normalized = values.map((value, index) =>
    text(value, `${label}[${index}]`, /^[a-z0-9_.:-]{1,128}$/u)).sort();
  assert.equal(new Set(normalized).size, normalized.length, `${label} must be unique`);
  return normalized;
}

function fileDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function percentage(usedBytes, totalBytes) {
  return Math.ceil((usedBytes / totalBytes) * 100);
}

function validateCycleSample(value, index) {
  const label = `calibration.calibration.cycleSamples[${index}]`;
  exactKeys(value, [
    "cycle",
    "databaseBytes",
    "factIdentityTotalBytes",
    "factPartitionTotalBytes",
    "factRows",
    "wallDurationMs",
  ], label);
  return {
    cycle: integer(value.cycle, `${label}.cycle`, { positive: true }),
    databaseBytes: integer(value.databaseBytes, `${label}.databaseBytes`, { positive: true }),
    factIdentityTotalBytes: integer(
      value.factIdentityTotalBytes,
      `${label}.factIdentityTotalBytes`,
      { positive: true },
    ),
    factPartitionTotalBytes: integer(
      value.factPartitionTotalBytes,
      `${label}.factPartitionTotalBytes`,
      { positive: true },
    ),
    factRows: integer(value.factRows, `${label}.factRows`, { positive: true }),
    wallDurationMs: integer(value.wallDurationMs, `${label}.wallDurationMs`, { positive: true }),
  };
}

function validateCalibrationMeasurements(value) {
  exactKeys(value, [
    "artifactLedgerRows",
    "artifactLedgerTotalBytes",
    "averagePayloadBytes",
    "averageRowBytes",
    "databaseBaselineBytes",
    "databaseFinalBytes",
    "databaseGrowthBytes",
    "factIdentityTotalBytes",
    "factPartitionHeapBytes",
    "factPartitionIndexBytes",
    "factPartitionTotalBytes",
    "factRows",
    "factStorageBytesPerRowCeiling",
    "incrementalFactStorageBytes",
    "incrementalFactStorageBytesPerRowCeiling",
    "incrementalRows",
    "maximumPayloadBytes",
    "maximumRowBytes",
    "walBytes",
    "walBytesPerFactCeiling",
  ], "calibration.measurements");
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    integer(entry, `calibration.measurements.${key}`, { positive: true }),
  ]));
}

export function validateP0RCapacityCalibration(
  value,
  { expectedSourceCommit, expectedSourceTree, assessedAt },
) {
  exactKeys(value, [
    "admissibleForProductionCapacityPass",
    "automaticTradingAllowed",
    "boundary",
    "calibration",
    "calibrationDigest",
    "completedAt",
    "evidenceClass",
    "measurements",
    "postgresMajor",
    "releaseId",
    "schemaVersion",
    "sourceCommit",
    "sourceState",
    "sourceTree",
    "startedAt",
    "status",
  ], "calibration");
  const { calibrationDigest, ...unsigned } = value;
  assert.equal(
    digest(calibrationDigest, "calibration.calibrationDigest"),
    stableDigest(unsigned),
    "capacity calibration digest mismatch",
  );
  assert.equal(value.schemaVersion, "v2-m1-p0r-d0-isolated-capacity-calibration.v1");
  assert.equal(value.releaseId, "m1-p0r-d0-capacity-calibration-v1");
  assert.equal(value.sourceState, "CLEAN_COMMIT");
  assert.equal(value.evidenceClass, "ISOLATED_SYNTHETIC_PRODUCTION_SHAPE");
  assert.equal(value.status, "PASS_ISOLATED_CAPACITY_CALIBRATION");
  assert.equal(value.admissibleForProductionCapacityPass, false);
  assert.equal(value.automaticTradingAllowed, false);
  assert.equal(commit(value.sourceCommit, "calibration.sourceCommit"), expectedSourceCommit);
  assert.equal(commit(value.sourceTree, "calibration.sourceTree"), expectedSourceTree);
  const startedAt = iso(value.startedAt, "calibration.startedAt");
  const completedAt = iso(value.completedAt, "calibration.completedAt");
  assert.ok(Date.parse(completedAt) >= Date.parse(startedAt));
  assert.ok(
    Date.parse(assessedAt) - Date.parse(completedAt)
      <= P0R_NO_COST_CAPACITY_POLICY.calibrationMaximumAgeHours * HOUR_MS,
    "capacity calibration is stale",
  );
  assert.ok(Date.parse(assessedAt) >= Date.parse(completedAt), "calibration is from the future");

  exactKeys(value.boundary, [
    "candidateEmissionAllowed",
    "productionConnected",
    "productionDatabaseMutation",
    "productionRepositoryMutation",
    "productionServiceMutation",
    "syntheticProviderData",
  ], "calibration.boundary");
  assert.equal(boolean(value.boundary.candidateEmissionAllowed, "candidateEmissionAllowed"), false);
  assert.equal(boolean(value.boundary.productionConnected, "productionConnected"), false);
  assert.equal(boolean(value.boundary.productionDatabaseMutation, "productionDatabaseMutation"), false);
  assert.equal(boolean(value.boundary.productionRepositoryMutation, "productionRepositoryMutation"), false);
  assert.equal(boolean(value.boundary.productionServiceMutation, "productionServiceMutation"), false);
  assert.equal(boolean(value.boundary.syntheticProviderData, "syntheticProviderData"), true);

  exactKeys(value.calibration, [
    "configuredRetentionHours",
    "cycleIntervalMs",
    "cycleSamples",
    "cycles",
    "factsPerCycle",
    "logicalFactHoursRepresented",
    "maximumCycleWallDurationMs",
    "meanCycleWallDurationMs",
    "sourceCutoffStart",
  ], "calibration.calibration");
  const cycles = integer(value.calibration.cycles, "calibration.calibration.cycles", {
    positive: true,
  });
  assert.ok(
    cycles >= P0R_NO_COST_CAPACITY_POLICY.calibrationMinimumCycles,
    "capacity calibration has too few cycles",
  );
  assert.equal(
    integer(value.calibration.cycleIntervalMs, "calibration.calibration.cycleIntervalMs", {
      positive: true,
    }),
    P0R_NO_COST_CAPACITY_POLICY.calibrationCycleIntervalMs,
  );
  assert.equal(
    integer(value.calibration.factsPerCycle, "calibration.calibration.factsPerCycle", {
      positive: true,
    }),
    P0R_NO_COST_CAPACITY_POLICY.calibrationFactsPerCycle,
  );
  assert.equal(
    finiteNumber(
      value.calibration.configuredRetentionHours,
      "calibration.calibration.configuredRetentionHours",
      { positive: true },
    ),
    30,
  );
  assert.equal(
    finiteNumber(
      value.calibration.logicalFactHoursRepresented,
      "calibration.calibration.logicalFactHoursRepresented",
      { positive: true },
    ),
    cycles * P0R_NO_COST_CAPACITY_POLICY.calibrationCycleIntervalMs / HOUR_MS,
  );
  iso(value.calibration.sourceCutoffStart, "calibration.calibration.sourceCutoffStart");
  assert.ok(Array.isArray(value.calibration.cycleSamples));
  assert.equal(value.calibration.cycleSamples.length, cycles);
  const samples = value.calibration.cycleSamples.map(validateCycleSample);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    assert.equal(sample.cycle, index + 1);
    assert.equal(
      sample.factRows,
      (index + 1) * P0R_NO_COST_CAPACITY_POLICY.calibrationFactsPerCycle,
    );
    assert.ok(
      sample.wallDurationMs <= P0R_NO_COST_CAPACITY_POLICY.calibrationCycleIntervalMs,
      "capacity calibration exceeded the fixed scan interval",
    );
    if (index > 0) {
      const previous = samples[index - 1];
      assert.ok(sample.databaseBytes >= previous.databaseBytes, "database samples regressed");
      assert.ok(
        sample.factIdentityTotalBytes >= previous.factIdentityTotalBytes,
        "identity samples regressed",
      );
      assert.ok(
        sample.factPartitionTotalBytes >= previous.factPartitionTotalBytes,
        "partition samples regressed",
      );
    }
  }
  const maximumWallDuration = Math.max(...samples.map((sample) => sample.wallDurationMs));
  const meanWallDuration = Math.ceil(
    samples.reduce((total, sample) => total + sample.wallDurationMs, 0) / samples.length,
  );
  assert.equal(value.calibration.maximumCycleWallDurationMs, maximumWallDuration);
  assert.equal(value.calibration.meanCycleWallDurationMs, meanWallDuration);

  const measurements = validateCalibrationMeasurements(value.measurements);
  const finalSample = samples.at(-1);
  const firstSample = samples[0];
  assert.equal(measurements.factRows, cycles * value.calibration.factsPerCycle);
  assert.equal(measurements.factRows, finalSample.factRows);
  assert.equal(measurements.factIdentityTotalBytes, finalSample.factIdentityTotalBytes);
  assert.equal(measurements.factPartitionTotalBytes, finalSample.factPartitionTotalBytes);
  assert.ok(measurements.databaseFinalBytes >= finalSample.databaseBytes);
  assert.equal(
    measurements.databaseGrowthBytes,
    measurements.databaseFinalBytes - measurements.databaseBaselineBytes,
  );
  assert.equal(measurements.incrementalRows, finalSample.factRows - firstSample.factRows);
  assert.equal(
    measurements.incrementalFactStorageBytes,
    finalSample.factPartitionTotalBytes + finalSample.factIdentityTotalBytes
      - firstSample.factPartitionTotalBytes - firstSample.factIdentityTotalBytes,
  );
  assert.equal(
    measurements.factStorageBytesPerRowCeiling,
    Math.ceil(
      (measurements.factPartitionTotalBytes + measurements.factIdentityTotalBytes)
        / measurements.factRows,
    ),
  );
  assert.equal(
    measurements.incrementalFactStorageBytesPerRowCeiling,
    Math.ceil(measurements.incrementalFactStorageBytes / measurements.incrementalRows),
  );
  assert.equal(
    measurements.walBytesPerFactCeiling,
    Math.ceil(measurements.walBytes / measurements.factRows),
  );
  assert.ok(measurements.averagePayloadBytes <= measurements.maximumPayloadBytes);
  assert.ok(measurements.averageRowBytes <= measurements.maximumRowBytes);
  assert.equal(integer(value.postgresMajor, "calibration.postgresMajor"), 16);
  return value;
}

function validateP0EvidenceIndex(value, evidenceFileDigest) {
  exactKeys(value, [
    "advisories",
    "blockers",
    "capacity",
    "checksums",
    "conclusion",
    "database",
    "evaluatedAt",
    "expiresAt",
    "nextAction",
    "productionBoundary",
    "productionHead",
    "remoteEvidence",
    "schemaVersion",
    "sourceCommit",
    "status",
    "storageTopology",
  ], "p0EvidenceIndex");
  assert.equal(
    digest(evidenceFileDigest, "p0EvidenceFileDigest"),
    P0R_NO_COST_CAPACITY_POLICY.baselineEvidenceIndexDigest,
    "P0 evidence index is not the bound baseline",
  );
  assert.equal(value.schemaVersion, "market-radar-v2-m1-p0-evidence-index.v1");
  assert.equal(value.status, "BLOCKED");
  assert.equal(value.conclusion, "BLOCKED");
  iso(value.evaluatedAt, "p0EvidenceIndex.evaluatedAt");
  iso(value.expiresAt, "p0EvidenceIndex.expiresAt");
  assert.ok(Date.parse(value.expiresAt) > Date.parse(value.evaluatedAt));
  commit(value.sourceCommit, "p0EvidenceIndex.sourceCommit");
  commit(value.productionHead, "p0EvidenceIndex.productionHead");

  exactKeys(value.checksums, [
    "databaseFactsSha256",
    "hostFactsSha256",
    "probeSha256",
    "remoteBundleSha256",
    "reportEvidenceDigest",
  ], "p0EvidenceIndex.checksums");
  for (const key of ["databaseFactsSha256", "hostFactsSha256", "probeSha256"]) {
    digest(`sha256:${value.checksums[key]}`, `p0EvidenceIndex.checksums.${key}`);
  }
  text(
    value.checksums.remoteBundleSha256,
    "p0EvidenceIndex.checksums.remoteBundleSha256",
    /^[0-9a-f]{32,128}$/u,
  );
  assert.equal(
    value.checksums.reportEvidenceDigest,
    P0R_NO_COST_CAPACITY_POLICY.baselineReportEvidenceDigest,
  );

  exactKeys(value.storageTopology, [
    "filesystemAvailableBytes",
    "filesystemTotalBytes",
    "filesystemUsedBytes",
    "postgresDataBytes",
    "postgresDockerVolume",
    "postgresVolumeOnRootFilesystem",
    "postgresWalBytes",
    "rootDevice",
    "rootFilesystem",
    "systemDiskBytes",
  ], "p0EvidenceIndex.storageTopology");
  const topology = value.storageTopology;
  integer(topology.filesystemAvailableBytes, "filesystemAvailableBytes", { positive: true });
  integer(topology.filesystemTotalBytes, "filesystemTotalBytes", { positive: true });
  integer(topology.filesystemUsedBytes, "filesystemUsedBytes", { positive: true });
  integer(topology.postgresDataBytes, "postgresDataBytes", { positive: true });
  integer(topology.postgresWalBytes, "postgresWalBytes", { positive: true });
  integer(topology.systemDiskBytes, "systemDiskBytes", { positive: true });
  text(topology.postgresDockerVolume, "postgresDockerVolume");
  text(topology.rootDevice, "rootDevice");
  text(topology.rootFilesystem, "rootFilesystem");
  assert.equal(boolean(topology.postgresVolumeOnRootFilesystem, "postgresVolumeOnRootFilesystem"), true);
  assert.ok(topology.filesystemUsedBytes < topology.filesystemTotalBytes);
  assert.ok(topology.filesystemAvailableBytes < topology.filesystemTotalBytes);

  exactKeys(value.productionBoundary, [
    "automaticTradingAllowed",
    "candidateEmissionAllowed",
    "migrationPerformed",
    "productionDatabaseMutation",
    "productionRepositoryMutation",
    "productionServiceMutation",
  ], "p0EvidenceIndex.productionBoundary");
  for (const [key, entry] of Object.entries(value.productionBoundary)) {
    assert.equal(boolean(entry, `p0EvidenceIndex.productionBoundary.${key}`), false);
  }
  const blockers = sortedUniqueStrings(value.blockers, "p0EvidenceIndex.blockers");
  sortedUniqueStrings(value.advisories, "p0EvidenceIndex.advisories");
  return {
    blockers,
    remoteBundleDigestWellFormed:
      /^[0-9a-f]{64}$/u.test(value.checksums.remoteBundleSha256),
    topology,
  };
}

function normalizePlan(value) {
  exactKeys(value, [
    "configuredRetentionHours",
    "detectorMaxLookbackHours",
    "factStorageSafetyMultiplierBasisPoints",
    "localPlaintextBackupBytes",
    "maximumSweepLagHours",
    "migrationReserveBytes",
    "nonFactOverheadBytes",
    "partitionBoundaryTimeZone",
    "partitionSpanHours",
    "plannedFactsPerCycle",
    "recoveryOverlapHours",
    "researchBulkOnProductionRoot",
    "restoreTargetOnProductionRoot",
    "rollbackReserveBytes",
    "runtimeAndLogReserveBytes",
    "scanCycleIntervalMs",
    "streamEncryptedBackupDirectlyOffHost",
    "walReserveBytes",
  ], "plan");
  return {
    configuredRetentionHours: finiteNumber(value.configuredRetentionHours, "configuredRetentionHours", {
      positive: true,
    }),
    detectorMaxLookbackHours: finiteNumber(value.detectorMaxLookbackHours, "detectorMaxLookbackHours", {
      positive: true,
    }),
    factStorageSafetyMultiplierBasisPoints: integer(
      value.factStorageSafetyMultiplierBasisPoints,
      "factStorageSafetyMultiplierBasisPoints",
      { positive: true },
    ),
    localPlaintextBackupBytes: integer(value.localPlaintextBackupBytes, "localPlaintextBackupBytes"),
    maximumSweepLagHours: finiteNumber(value.maximumSweepLagHours, "maximumSweepLagHours"),
    migrationReserveBytes: integer(value.migrationReserveBytes, "migrationReserveBytes", {
      positive: true,
    }),
    nonFactOverheadBytes: integer(value.nonFactOverheadBytes, "nonFactOverheadBytes", {
      positive: true,
    }),
    partitionBoundaryTimeZone: text(value.partitionBoundaryTimeZone, "partitionBoundaryTimeZone"),
    partitionSpanHours: finiteNumber(value.partitionSpanHours, "partitionSpanHours", { positive: true }),
    plannedFactsPerCycle: integer(value.plannedFactsPerCycle, "plannedFactsPerCycle", {
      positive: true,
    }),
    recoveryOverlapHours: finiteNumber(value.recoveryOverlapHours, "recoveryOverlapHours", {
      positive: true,
    }),
    researchBulkOnProductionRoot: boolean(value.researchBulkOnProductionRoot, "researchBulkOnProductionRoot"),
    restoreTargetOnProductionRoot: boolean(value.restoreTargetOnProductionRoot, "restoreTargetOnProductionRoot"),
    rollbackReserveBytes: integer(value.rollbackReserveBytes, "rollbackReserveBytes", {
      positive: true,
    }),
    runtimeAndLogReserveBytes: integer(value.runtimeAndLogReserveBytes, "runtimeAndLogReserveBytes", {
      positive: true,
    }),
    scanCycleIntervalMs: integer(value.scanCycleIntervalMs, "scanCycleIntervalMs", {
      positive: true,
    }),
    streamEncryptedBackupDirectlyOffHost: boolean(
      value.streamEncryptedBackupDirectlyOffHost,
      "streamEncryptedBackupDirectlyOffHost",
    ),
    walReserveBytes: integer(value.walReserveBytes, "walReserveBytes", { positive: true }),
  };
}

function clonePlan(overrides = {}) {
  return { ...P0R_NO_COST_CAPACITY_PLAN, ...overrides };
}

export function buildM1P0RNoCostCapacityAssessment(input) {
  exactKeys(input, [
    "assessedAt",
    "calibrationEvidence",
    "calibrationFileDigest",
    "expectedSourceCommit",
    "expectedSourceTree",
    "p0EvidenceFileDigest",
    "p0EvidenceIndex",
    "plan",
  ], "input");
  const assessedAt = iso(input.assessedAt, "assessedAt");
  const expectedSourceCommit = commit(input.expectedSourceCommit, "expectedSourceCommit");
  const expectedSourceTree = commit(input.expectedSourceTree, "expectedSourceTree");
  const calibrationFileDigest = digest(input.calibrationFileDigest, "calibrationFileDigest");
  const calibration = validateP0RCapacityCalibration(input.calibrationEvidence, {
    assessedAt,
    expectedSourceCommit,
    expectedSourceTree,
  });
  const baseline = validateP0EvidenceIndex(
    input.p0EvidenceIndex,
    input.p0EvidenceFileDigest,
  );
  const plan = normalizePlan(input.plan);
  const policy = P0R_NO_COST_CAPACITY_POLICY;
  const requiredPlannedFactsPerCycle = Math.ceil(
    policy.calibrationFactsPerCycle
      * (10_000 + policy.plannedUniverseReserveBasisPoints) / 10_000,
  );
  const effectiveFactsPerCycle = Math.max(
    plan.plannedFactsPerCycle,
    requiredPlannedFactsPerCycle,
  );
  const effectiveCycleIntervalMs = Math.min(
    plan.scanCycleIntervalMs,
    policy.maximumScanCycleIntervalMs,
  );
  const requiredRetentionHours = Math.max(
    policy.detectorMinimumLookbackHours + policy.recoveryMinimumOverlapHours,
    plan.detectorMaxLookbackHours + plan.recoveryOverlapHours,
  );
  const effectiveRetentionHours = Math.max(
    plan.configuredRetentionHours,
    requiredRetentionHours,
  );
  const effectiveStorageMultiplierBasisPoints = Math.max(
    plan.factStorageSafetyMultiplierBasisPoints,
    policy.factStorageSafetyMultiplierBasisPoints,
  );
  const measurements = calibration.measurements;
  const databaseGrowthBytesPerFactCeiling = Math.ceil(
    measurements.databaseGrowthBytes / measurements.factRows,
  );
  const measuredFactBytesPerRowCeiling = Math.max(
    measurements.factStorageBytesPerRowCeiling,
    measurements.incrementalFactStorageBytesPerRowCeiling,
    databaseGrowthBytesPerFactCeiling,
  );
  const bufferedFactBytesPerRow = Math.ceil(
    measuredFactBytesPerRowCeiling
      * effectiveStorageMultiplierBasisPoints / 10_000,
  );
  const physicalResidenceHours = effectiveRetentionHours
    + plan.partitionSpanHours
    + plan.maximumSweepLagHours;
  const projectedFactRows = Math.ceil(
    effectiveFactsPerCycle * physicalResidenceHours * HOUR_MS
      / effectiveCycleIntervalMs,
  );
  const projectedFactBytes = projectedFactRows * bufferedFactBytesPerRow;
  assert.ok(Number.isSafeInteger(projectedFactBytes), "projected Fact bytes overflowed");
  const effectiveReserves = {
    migrationReserveBytes: Math.max(plan.migrationReserveBytes, policy.migrationReserveBytes),
    nonFactOverheadBytes: Math.max(plan.nonFactOverheadBytes, policy.nonFactOverheadBytes),
    rollbackReserveBytes: Math.max(plan.rollbackReserveBytes, policy.rollbackReserveBytes),
    runtimeAndLogReserveBytes: Math.max(
      plan.runtimeAndLogReserveBytes,
      policy.runtimeAndLogReserveBytes,
    ),
    walReserveBytes: Math.max(plan.walReserveBytes, policy.walReserveBytes),
  };
  const steadyAdditionalBytes = projectedFactBytes
    + effectiveReserves.nonFactOverheadBytes
    + effectiveReserves.runtimeAndLogReserveBytes;
  const peakAdditionalBytes = steadyAdditionalBytes
    + effectiveReserves.walReserveBytes
    + effectiveReserves.migrationReserveBytes
    + effectiveReserves.rollbackReserveBytes
    + plan.localPlaintextBackupBytes;
  const topology = baseline.topology;
  const steadyProjectedUsedBytes = topology.filesystemUsedBytes + steadyAdditionalBytes;
  const peakProjectedUsedBytes = topology.filesystemUsedBytes + peakAdditionalBytes;
  const steadyProjectedDiskUsePercent = percentage(
    steadyProjectedUsedBytes,
    topology.filesystemTotalBytes,
  );
  const peakProjectedDiskUsePercent = percentage(
    peakProjectedUsedBytes,
    topology.filesystemTotalBytes,
  );

  const capacityChecks = {
    calibrated_throughput_within_one_minute:
      calibration.calibration.maximumCycleWallDurationMs
        <= policy.calibrationCycleIntervalMs,
    configured_retention_covers_detector_and_recovery:
      plan.configuredRetentionHours >= requiredRetentionHours,
    detector_lookback_not_reduced:
      plan.detectorMaxLookbackHours >= policy.detectorMinimumLookbackHours,
    encrypted_backup_streamed_directly_off_host:
      plan.streamEncryptedBackupDirectlyOffHost,
    fact_storage_safety_multiplier_not_reduced:
      plan.factStorageSafetyMultiplierBasisPoints
        >= policy.factStorageSafetyMultiplierBasisPoints,
    local_plaintext_backup_not_reserved:
      plan.localPlaintextBackupBytes === 0,
    migration_reserve_not_reduced:
      plan.migrationReserveBytes >= policy.migrationReserveBytes,
    non_fact_overhead_not_reduced:
      plan.nonFactOverheadBytes >= policy.nonFactOverheadBytes,
    partition_boundary_is_utc:
      plan.partitionBoundaryTimeZone === "UTC",
    partition_span_bounded_and_day_aligned:
      plan.partitionSpanHours <= policy.maximumPartitionSpanHours
        && 24 % plan.partitionSpanHours === 0,
    peak_headroom_available:
      topology.filesystemAvailableBytes >= peakAdditionalBytes,
    peak_projected_disk_use_below_or_equal_70_percent:
      peakProjectedDiskUsePercent <= policy.maximumProjectedDiskUsePercent,
    planned_universe_reserve_not_reduced:
      plan.plannedFactsPerCycle >= requiredPlannedFactsPerCycle,
    recovery_overlap_not_reduced:
      plan.recoveryOverlapHours >= policy.recoveryMinimumOverlapHours,
    research_bulk_excluded_from_production_root:
      !plan.researchBulkOnProductionRoot,
    restore_target_excluded_from_production_root:
      !plan.restoreTargetOnProductionRoot,
    rollback_reserve_not_reduced:
      plan.rollbackReserveBytes >= policy.rollbackReserveBytes,
    runtime_and_log_reserve_not_reduced:
      plan.runtimeAndLogReserveBytes >= policy.runtimeAndLogReserveBytes,
    scan_cadence_not_reduced:
      plan.scanCycleIntervalMs <= policy.maximumScanCycleIntervalMs,
    steady_projected_disk_use_below_or_equal_70_percent:
      steadyProjectedDiskUsePercent <= policy.maximumProjectedDiskUsePercent,
    sweep_lag_bounded:
      plan.maximumSweepLagHours <= policy.maximumSweepLagHours,
    wal_reserve_not_reduced:
      plan.walReserveBytes >= policy.walReserveBytes,
  };
  const capacityModelBlockers = Object.entries(capacityChecks)
    .filter(([, passed]) => !passed)
    .map(([id]) => id)
    .sort();
  const topologyFresh = Date.parse(assessedAt) <= Date.parse(input.p0EvidenceIndex.expiresAt);
  const recoveryEvidencePresent = !baseline.blockers.includes("recovery_evidence_present");
  const externalPrerequisiteChecks = {
    baseline_remote_bundle_digest_well_formed:
      baseline.remoteBundleDigestWellFormed,
    production_recovery_evidence_present: recoveryEvidencePresent,
    production_topology_evidence_fresh: topologyFresh,
  };
  const externalPrerequisiteBlockers = Object.entries(externalPrerequisiteChecks)
    .filter(([, passed]) => !passed)
    .map(([id]) => id)
    .sort();
  const capacityMathStatus = capacityModelBlockers.length === 0
    ? "PASS_LOCAL_NO_COST_MODEL"
    : "FAIL_LOCAL_NO_COST_MODEL";
  const canRerunP0 = capacityModelBlockers.length === 0
    && externalPrerequisiteBlockers.length === 0;
  const status = capacityModelBlockers.length > 0
    ? "BLOCKED_NO_COST_CAPACITY_MODEL"
    : canRerunP0
      ? "READY_FOR_P0_RERUN_NOT_PRODUCTION_PASS"
      : "BLOCKED_EXTERNAL_PREREQUISITES";
  const unsigned = {
    assessedAt,
    automaticTradingAllowed: false,
    blockers: [...capacityModelBlockers, ...externalPrerequisiteBlockers].sort(),
    boundary: {
      candidateEmissionAllowed: false,
      productionConnected: false,
      productionDatabaseMutation: false,
      productionRepositoryMutation: false,
      productionServiceMutation: false,
      syntheticCalibrationOnly: true,
    },
    calibratedRates: {
      bufferedFactBytesPerRow,
      databaseGrowthBytesPerFactCeiling,
      factStorageBytesPerRowCeiling: measurements.factStorageBytesPerRowCeiling,
      incrementalFactStorageBytesPerRowCeiling:
        measurements.incrementalFactStorageBytesPerRowCeiling,
      measuredFactBytesPerRowCeiling,
      safetyMultiplierBasisPoints: effectiveStorageMultiplierBasisPoints,
      walBytesPerFactCeiling: measurements.walBytesPerFactCeiling,
    },
    capacity: {
      effectiveCycleIntervalMs,
      effectiveFactsPerCycle,
      effectiveReserves,
      effectiveRetentionHours,
      filesystemAvailableBytes: topology.filesystemAvailableBytes,
      filesystemTotalBytes: topology.filesystemTotalBytes,
      filesystemUsedBytes: topology.filesystemUsedBytes,
      peakAdditionalBytes,
      peakProjectedDiskUsePercent,
      peakProjectedUsedBytes,
      physicalResidenceHours,
      projectedFactBytes,
      projectedFactRows,
      steadyAdditionalBytes,
      steadyProjectedDiskUsePercent,
      steadyProjectedUsedBytes,
    },
    capacityChecks,
    capacityModelBlockers,
    capacityMathStatus,
    decision: {
      canApplyProduction: false,
      canRerunP0,
      canStartLocalSixHourPartitionImplementation:
        capacityModelBlockers.length === 0 && plan.partitionSpanHours === 6,
      productionCapacityPassClaimed: false,
      recommendedPartitionSpanHours: 6,
    },
    evidence: {
      baselineEvaluatedAt: input.p0EvidenceIndex.evaluatedAt,
      baselineExpiresAt: input.p0EvidenceIndex.expiresAt,
      baselineReportEvidenceDigest: input.p0EvidenceIndex.checksums.reportEvidenceDigest,
      calibrationDigest: calibration.calibrationDigest,
      calibrationFileDigest,
      p0EvidenceFileDigest: input.p0EvidenceFileDigest,
    },
    externalPrerequisiteBlockers,
    externalPrerequisiteChecks,
    plan,
    policy,
    productionCapacityPassClaimed: false,
    schemaVersion: "v2-m1-p0r-d0-no-cost-capacity-assessment.v1",
    sourceCommit: expectedSourceCommit,
    sourceTree: expectedSourceTree,
    status,
  };
  return {
    ...unsigned,
    evidenceDigest: stableDigest(unsigned),
  };
}

export function verifyM1P0RNoCostCapacityAssessment(value) {
  exactKeys(value, [
    "assessedAt",
    "automaticTradingAllowed",
    "blockers",
    "boundary",
    "calibratedRates",
    "capacity",
    "capacityChecks",
    "capacityModelBlockers",
    "capacityMathStatus",
    "decision",
    "evidence",
    "evidenceDigest",
    "externalPrerequisiteBlockers",
    "externalPrerequisiteChecks",
    "plan",
    "policy",
    "productionCapacityPassClaimed",
    "schemaVersion",
    "sourceCommit",
    "sourceTree",
    "status",
  ], "assessment");
  const { evidenceDigest, ...unsigned } = value;
  assert.equal(digest(evidenceDigest, "assessment.evidenceDigest"), stableDigest(unsigned));
  assert.equal(value.schemaVersion, "v2-m1-p0r-d0-no-cost-capacity-assessment.v1");
  assert.equal(value.productionCapacityPassClaimed, false);
  assert.equal(value.automaticTradingAllowed, false);
  assert.equal(value.decision.canApplyProduction, false);
  assert.equal(value.boundary.productionConnected, false);
  assert.equal(value.boundary.productionDatabaseMutation, false);
  assert.equal(value.boundary.productionRepositoryMutation, false);
  assert.equal(value.boundary.productionServiceMutation, false);
  assert.equal(value.boundary.candidateEmissionAllowed, false);
  assert.equal(value.boundary.syntheticCalibrationOnly, true);
  return value;
}

async function readProtectedJson(path, label, { outsideWorkspace = false } = {}) {
  const absolutePath = resolve(path);
  assert.equal(isAbsolute(path), true, `${label} path must be absolute`);
  if (outsideWorkspace) {
    const workspaceRelative = relative(WORKSPACE_ROOT, absolutePath);
    assert.ok(
      workspaceRelative === ".."
        || workspaceRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`),
      `${label} must remain outside the Git workspace`,
    );
  }
  const facts = await lstat(absolutePath);
  assert.equal(facts.isSymbolicLink(), false, `${label} must not be a symlink`);
  assert.equal(facts.isFile(), true, `${label} must be a regular file`);
  if (outsideWorkspace) {
    assert.equal(facts.mode & 0o077, 0, `${label} permissions are too open`);
  }
  const bytes = await readFile(absolutePath);
  return {
    digest: fileDigest(bytes),
    value: JSON.parse(bytes.toString("utf8")),
  };
}

async function writeProtectedJson(path, value) {
  const absolutePath = resolve(path);
  assert.equal(isAbsolute(path), true, "assessment output path must be absolute");
  const workspaceRelative = relative(WORKSPACE_ROOT, absolutePath);
  assert.ok(
    workspaceRelative === ".."
      || workspaceRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`),
    "assessment output must remain outside the Git workspace",
  );
  const parent = dirname(absolutePath);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  await chmod(parent, 0o700);
  const parentFacts = await lstat(parent);
  assert.equal(parentFacts.isSymbolicLink(), false, "assessment parent must not be a symlink");
  assert.equal(parentFacts.mode & 0o077, 0, "assessment parent permissions are too open");
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  await chmod(absolutePath, 0o600);
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    assert.match(flag ?? "", /^--(?:assessed-at|calibration|output|p0-evidence-index)$/u);
    assert.ok(value && !value.startsWith("--"), `${flag} requires a value`);
    const key = flag.slice(2);
    assert.equal(options[key], undefined, `${flag} was repeated`);
    options[key] = value;
  }
  assert.ok(options.calibration, "--calibration is required");
  assert.ok(options.output, "--output is required");
  assert.ok(options["p0-evidence-index"], "--p0-evidence-index is required");
  return options;
}

async function gitText(...args) {
  const result = await execFile("git", ["-C", WORKSPACE_ROOT, ...args], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  return result.stdout.trim();
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const gitStatus = await gitText("status", "--porcelain");
  assert.equal(gitStatus, "", "official no-cost capacity assessment requires a clean commit");
  const [sourceCommit, sourceTree, calibration, p0Evidence] = await Promise.all([
    gitText("rev-parse", "HEAD"),
    gitText("rev-parse", "HEAD^{tree}"),
    readProtectedJson(options.calibration, "capacity calibration", { outsideWorkspace: true }),
    readProtectedJson(options["p0-evidence-index"], "P0 evidence index"),
  ]);
  const assessment = buildM1P0RNoCostCapacityAssessment({
    assessedAt: options["assessed-at"] ?? new Date().toISOString(),
    calibrationEvidence: calibration.value,
    calibrationFileDigest: calibration.digest,
    expectedSourceCommit: sourceCommit,
    expectedSourceTree: sourceTree,
    p0EvidenceFileDigest: p0Evidence.digest,
    p0EvidenceIndex: p0Evidence.value,
    plan: clonePlan(),
  });
  verifyM1P0RNoCostCapacityAssessment(assessment);
  await writeProtectedJson(options.output, assessment);
  process.stdout.write(`${JSON.stringify({
    blockers: assessment.blockers,
    capacityMathStatus: assessment.capacityMathStatus,
    evidenceDigest: assessment.evidenceDigest,
    outputWritten: true,
    productionChanged: false,
    status: assessment.status,
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
