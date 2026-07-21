import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildM1P0RNoCostCapacityAssessment,
  P0R_NO_COST_CAPACITY_PLAN,
  P0R_NO_COST_CAPACITY_POLICY,
  verifyM1P0RNoCostCapacityAssessment,
} from "./m1-production-storage-p0r-no-cost-capacity.mjs";
import { stableDigest } from "./m1-production-storage-read-only-preflight.mjs";

const SOURCE_COMMIT = "a".repeat(40);
const SOURCE_TREE = "b".repeat(40);
const FILE_DIGEST = `sha256:${"c".repeat(64)}`;

function signedCalibration(overrides = {}) {
  const cycles = overrides.cycles ?? 8;
  const factsPerCycle = overrides.factsPerCycle ?? 1_444;
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
    completedAt: "2026-07-21T09:15:00.000Z",
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
    startedAt: "2026-07-21T09:10:00.000Z",
    status: "PASS_ISOLATED_CAPACITY_CALIBRATION",
  };
  const calibration = { ...unsigned, calibrationDigest: stableDigest(unsigned) };
  if (overrides.mutate) overrides.mutate(calibration);
  if (overrides.resign) {
    const { calibrationDigest: ignored, ...changed } = calibration;
    void ignored;
    calibration.calibrationDigest = stableDigest(changed);
  }
  return calibration;
}

async function p0Evidence() {
  return JSON.parse(await readFile(
    new URL("../../../docs/blueprints/V2_M1_6_P0_PRODUCTION_STORAGE_EVIDENCE_INDEX.json", import.meta.url),
    "utf8",
  ));
}

async function assessment({ calibration, plan = {}, assessedAt = "2026-07-21T09:20:00.000Z" } = {}) {
  return buildM1P0RNoCostCapacityAssessment({
    assessedAt,
    calibrationEvidence: calibration ?? signedCalibration(),
    calibrationFileDigest: FILE_DIGEST,
    expectedSourceCommit: SOURCE_COMMIT,
    expectedSourceTree: SOURCE_TREE,
    p0EvidenceFileDigest: P0R_NO_COST_CAPACITY_POLICY.baselineEvidenceIndexDigest,
    p0EvidenceIndex: await p0Evidence(),
    plan: { ...P0R_NO_COST_CAPACITY_PLAN, ...plan },
  });
}

test("six-hour no-cost plan passes capacity math but cannot claim production readiness", async () => {
  const value = await assessment();
  assert.equal(value.capacityMathStatus, "PASS_LOCAL_NO_COST_MODEL");
  assert.equal(value.status, "BLOCKED_EXTERNAL_PREREQUISITES");
  assert.equal(value.capacity.physicalResidenceHours, 37);
  assert.equal(value.policy.maximumSteadyProjectedDiskUsePercent, 60);
  assert.equal(value.policy.maximumProjectedDiskUsePercent, 70);
  assert.equal(value.capacityChecks.steady_projected_disk_use_below_or_equal_60_percent, true);
  assert.ok(value.capacity.steadyProjectedDiskUsePercent <= 60);
  assert.ok(value.capacity.peakProjectedDiskUsePercent <= 70);
  assert.equal(value.decision.canStartLocalSixHourPartitionImplementation, true);
  assert.equal(value.decision.canApplyProduction, false);
  assert.equal(value.decision.canRerunP0, false);
  assert.equal(value.productionCapacityPassClaimed, false);
  assert.deepEqual(value.externalPrerequisiteBlockers, [
    "baseline_remote_bundle_digest_well_formed",
    "production_recovery_evidence_present",
    "production_topology_evidence_fresh",
  ]);
  assert.deepEqual(verifyM1P0RNoCostCapacityAssessment(value), value);
});

test("daily partitions fail the hard headroom model and the bounded span policy", async () => {
  const value = await assessment({ plan: { partitionSpanHours: 24 } });
  assert.equal(value.capacityMathStatus, "FAIL_LOCAL_NO_COST_MODEL");
  assert.ok(value.capacityModelBlockers.includes("partition_span_bounded_and_day_aligned"));
  assert.ok(value.capacityModelBlockers.includes("peak_projected_disk_use_below_or_equal_70_percent"));
  assert.equal(value.decision.canStartLocalSixHourPartitionImplementation, false);
});

test("seven-day retention cannot fit the existing production root", async () => {
  const value = await assessment({ plan: { configuredRetentionHours: 7 * 24 } });
  assert.equal(value.capacityMathStatus, "FAIL_LOCAL_NO_COST_MODEL");
  assert.ok(value.blockers.includes("peak_headroom_available"));
  assert.ok(value.blockers.includes("steady_projected_disk_use_below_or_equal_60_percent"));
});

test("cannot manufacture a pass by shrinking coverage, cadence, lookback or margin", async () => {
  const value = await assessment({
    plan: {
      detectorMaxLookbackHours: 12,
      factStorageSafetyMultiplierBasisPoints: 10_000,
      plannedFactsPerCycle: 1_000,
      recoveryOverlapHours: 2,
      scanCycleIntervalMs: 120_000,
    },
  });
  assert.equal(value.capacity.effectiveFactsPerCycle, 1_805);
  assert.equal(value.capacity.effectiveCycleIntervalMs, 60_000);
  assert.ok(value.blockers.includes("detector_lookback_not_reduced"));
  assert.ok(value.blockers.includes("fact_storage_safety_multiplier_not_reduced"));
  assert.ok(value.blockers.includes("planned_universe_reserve_not_reduced"));
  assert.ok(value.blockers.includes("recovery_overlap_not_reduced"));
  assert.ok(value.blockers.includes("scan_cadence_not_reduced"));
});

test("rejects local backup, root restore and research bulk shortcuts", async () => {
  const value = await assessment({
    plan: {
      localPlaintextBackupBytes: 1,
      researchBulkOnProductionRoot: true,
      restoreTargetOnProductionRoot: true,
      streamEncryptedBackupDirectlyOffHost: false,
    },
  });
  assert.ok(value.blockers.includes("encrypted_backup_streamed_directly_off_host"));
  assert.ok(value.blockers.includes("local_plaintext_backup_not_reserved"));
  assert.ok(value.blockers.includes("research_bulk_excluded_from_production_root"));
  assert.ok(value.blockers.includes("restore_target_excluded_from_production_root"));
});

test("rejects shortened or dirty calibration evidence", async () => {
  await assert.rejects(
    assessment({ calibration: signedCalibration({ cycles: 4 }) }),
    /too few cycles/u,
  );
  await assert.rejects(
    assessment({
      calibration: signedCalibration({
        mutate: (value) => {
          value.sourceState = "DIRTY_DIAGNOSTIC";
          value.evidenceClass = "DIRTY_WORKTREE_DIAGNOSTIC_ONLY";
          value.status = "DIAGNOSTIC_DIRTY_WORKTREE_NOT_ADMISSIBLE";
        },
        resign: true,
      }),
    }),
    /CLEAN_COMMIT/u,
  );
});

test("rejects calibration and baseline digest tampering", async () => {
  const tampered = signedCalibration();
  tampered.measurements.factRows += 1;
  await assert.rejects(assessment({ calibration: tampered }), /digest mismatch/u);
  const baseline = await p0Evidence();
  assert.throws(() => buildM1P0RNoCostCapacityAssessment({
    assessedAt: "2026-07-21T09:20:00.000Z",
    calibrationEvidence: signedCalibration(),
    calibrationFileDigest: FILE_DIGEST,
    expectedSourceCommit: SOURCE_COMMIT,
    expectedSourceTree: SOURCE_TREE,
    p0EvidenceFileDigest: `sha256:${"d".repeat(64)}`,
    p0EvidenceIndex: baseline,
    plan: { ...P0R_NO_COST_CAPACITY_PLAN },
  }), /bound baseline/u);
});

test("rejects weakened fixed reserve budgets", async () => {
  const value = await assessment({
    plan: {
      migrationReserveBytes: 1,
      nonFactOverheadBytes: 1,
      rollbackReserveBytes: 1,
      runtimeAndLogReserveBytes: 1,
      walReserveBytes: 1,
    },
  });
  assert.ok(value.blockers.includes("migration_reserve_not_reduced"));
  assert.ok(value.blockers.includes("non_fact_overhead_not_reduced"));
  assert.ok(value.blockers.includes("rollback_reserve_not_reduced"));
  assert.ok(value.blockers.includes("runtime_and_log_reserve_not_reduced"));
  assert.ok(value.blockers.includes("wal_reserve_not_reduced"));
});
