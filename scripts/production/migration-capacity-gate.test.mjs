import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CapacityGateError,
  createCapacityTemplate,
  evaluateMigrationCapacity,
  loadCapacityEvidence,
} from "./migration-capacity-gate.mjs";

const gib = 1024 ** 3;
const now = new Date("2026-07-11T08:00:00.000Z");

const passingEvidence = {
  schemaVersion: "candidate-migration-capacity-evidence.v1",
  capturedAt: "2026-07-11T07:55:00.000Z",
  primaryHost: {
    totalBytes: 100 * gib,
    usedBytes: 45 * gib,
    databaseBytes: 8 * gib,
    localBackupBytes: 9 * gib,
    migrationTempBytes: 2 * gib,
    walPeakBytes: 3 * gib,
    rollbackReserveBytes: 2 * gib,
    safetyReserveBytes: 5 * gib,
  },
  offHostBackup: {
    createdAt: "2026-07-11T07:50:00.000Z",
    encrypted: true,
    offHost: true,
    checksumVerified: true,
    archiveVerified: true,
  },
  restoreTarget: {
    class: "external_isolated",
    totalBytes: 80 * gib,
    availableBytes: 60 * gib,
  },
  restoreDrill: {
    completedAt: "2026-06-20T08:00:00.000Z",
    passed: true,
    isolated: true,
    rpoMinutes: 30,
    rtoMinutes: 70,
  },
};

test("passes only when capacity and recovery evidence satisfy every hard gate", () => {
  const result = evaluateMigrationCapacity(passingEvidence, { now });
  assert.equal(result.status, "pass");
  assert.equal(result.canRequestAddSchemaApproval, true);
  assert.equal(result.failedChecks.length, 0);
  assert.equal(result.projectedDiskUsePercent, 61);
});

for (const [name, mutate, expectedCheck] of [
  [
    "stale capacity evidence",
    (value) => ({ ...value, capturedAt: "2026-07-11T07:44:59.000Z" }),
    "capacity_evidence_fresh",
  ],
  [
    "projected disk use above 70 percent",
    (value) => ({
      ...value,
      primaryHost: { ...value.primaryHost, usedBytes: 60 * gib },
    }),
    "primary_projected_disk_below_threshold",
  ],
  [
    "insufficient available bytes",
    (value) => ({
      ...value,
      primaryHost: { ...value.primaryHost, totalBytes: 62 * gib },
    }),
    "primary_required_headroom_available",
  ],
  [
    "backup older than 15 minutes",
    (value) => ({
      ...value,
      offHostBackup: { ...value.offHostBackup, createdAt: "2026-07-11T07:44:59.000Z" },
    }),
    "off_host_backup_fresh",
  ],
  [
    "unencrypted backup",
    (value) => ({
      ...value,
      offHostBackup: { ...value.offHostBackup, encrypted: false },
    }),
    "off_host_backup_encrypted",
  ],
  [
    "backup without archive verification",
    (value) => ({
      ...value,
      offHostBackup: { ...value.offHostBackup, archiveVerified: false },
    }),
    "off_host_backup_archive_verified",
  ],
  [
    "restore target without enough space",
    (value) => ({
      ...value,
      restoreTarget: { ...value.restoreTarget, availableBytes: 10 * gib },
    }),
    "restore_target_capacity_sufficient",
  ],
  [
    "restore drill older than 90 days",
    (value) => ({
      ...value,
      restoreDrill: { ...value.restoreDrill, completedAt: "2026-04-01T07:59:59.000Z" },
    }),
    "restore_drill_fresh",
  ],
  [
    "restore drill above RTO",
    (value) => ({
      ...value,
      restoreDrill: { ...value.restoreDrill, rtoMinutes: 121 },
    }),
    "restore_drill_rto_within_target",
  ],
  [
    "restore drill above RPO",
    (value) => ({
      ...value,
      restoreDrill: { ...value.restoreDrill, rpoMinutes: 1441 },
    }),
    "restore_drill_rpo_within_target",
  ],
]) {
  test(`fails closed for ${name}`, () => {
    const result = evaluateMigrationCapacity(mutate(passingEvidence), { now });
    assert.equal(result.status, "fail");
    assert.equal(result.canRequestAddSchemaApproval, false);
    assert.ok(result.failedChecks.includes(expectedCheck));
  });
}

test("rejects missing or unsafe numeric evidence instead of treating it as zero", () => {
  const invalid = structuredClone(passingEvidence);
  delete invalid.primaryHost.walPeakBytes;
  assert.throws(
    () => evaluateMigrationCapacity(invalid, { now }),
    (error) => error instanceof CapacityGateError && error.reason === "evidence_invalid",
  );
});

test("template is deliberately blocked until real evidence replaces every placeholder", () => {
  const template = createCapacityTemplate({ now });
  assert.equal(template.schemaVersion, "candidate-migration-capacity-evidence.v1");
  assert.throws(
    () => evaluateMigrationCapacity(template, { now }),
    (error) => error instanceof CapacityGateError && error.reason === "evidence_invalid",
  );
});

test("loads valid JSON evidence and rejects unexpected top-level keys", async () => {
  const root = await mkdtemp(join(tmpdir(), "capacity-gate-"));
  const good = join(root, "good.json");
  const bad = join(root, "bad.json");
  await writeFile(good, JSON.stringify(passingEvidence));
  await writeFile(bad, JSON.stringify({ ...passingEvidence, databaseUrl: "forbidden" }));
  try {
    assert.deepEqual(await loadCapacityEvidence(good), passingEvidence);
    await assert.rejects(
      () => loadCapacityEvidence(bad),
      (error) => error instanceof CapacityGateError && error.reason === "unexpected_evidence_key",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("template contains no connection or credential fields", () => {
  const serialized = JSON.stringify(createCapacityTemplate({ now })).toLowerCase();
  for (const forbidden of ["databaseurl", "password", "secret", "token", "username"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("test fixture remains valid JSON when serialized", async () => {
  const root = await mkdtemp(join(tmpdir(), "capacity-json-"));
  const file = join(root, "evidence.json");
  await writeFile(file, JSON.stringify(passingEvidence, null, 2));
  try {
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), passingEvidence);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
