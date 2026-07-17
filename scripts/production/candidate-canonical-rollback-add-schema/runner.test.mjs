import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  EXPECTED_MIGRATIONS,
  MIGRATION_CHECKSUM,
  MIGRATION_FILE,
  MIGRATION_VERSION,
  PACKAGE_ID,
  readLockedMigration,
  validateLedger,
  validateRequest,
} from "./runner.mjs";
import {
  buildTransportBundle,
  createProductionRequest,
  validateContract,
  validateLocalPreparation,
} from "./bundle.mjs";

const root = resolve(import.meta.dirname, "../../..");
const now = new Date("2026-07-17T12:00:00.000Z");

function request(overrides = {}) {
  return {
    schemaVersion: "candidate-canonical-rollback-add-schema-request.v1",
    packageId: PACKAGE_ID,
    actionClass: "additive_schema_migration",
    riskTier: "R2_DATABASE_SCHEMA",
    sourceCommit: "a".repeat(40), sourceTree: "b".repeat(40),
    contractSha256: "c".repeat(64), runnerArtifactSha256: "d".repeat(64),
    transportArtifactSha256: "e".repeat(64), bundleSha256: "f".repeat(64),
    migrationFile: MIGRATION_FILE, migrationVersion: MIGRATION_VERSION,
    migrationChecksum: MIGRATION_CHECKSUM, onlyPendingMigration: MIGRATION_VERSION,
    expectedAppliedBaselineCount: 9, expectedAppliedCompletionCount: 10,
    migrationReleaseId: "wp-g0-2-canonical-rollback-safety-test-0001",
    approvalRef: "MR-G0-CANONICAL-ROLLBACK-SAFETY-TEST-00000001",
    approvalIssuedAt: "2026-07-17T11:30:00.000Z",
    approvalExpiresAt: "2026-07-17T12:30:00.000Z",
    lockTimeout: "5s", statementTimeout: "30s", idleTransactionTimeout: "60s",
    roleBootstrapAllowed: false, destructiveSqlAllowed: false,
    businessDataMutationAllowed: false, featureFlagMutationAllowed: false,
    serviceMutationAllowed: false, sourceSyncAllowed: false,
    ...overrides,
  };
}

test("validates the exact migration 010 production request", () => {
  assert.equal(validateRequest(request(), { now }).migrationChecksum, MIGRATION_CHECKSUM);
});

test("rejects migration, ledger, timeout and scope relaxation", () => {
  for (const change of [
    { migrationChecksum: "0".repeat(64) },
    { expectedAppliedBaselineCount: 8 },
    { lockTimeout: "60s" },
    { businessDataMutationAllowed: true },
    { serviceMutationAllowed: true },
  ]) assert.throws(() => validateRequest(request(change), { now }));
});

test("requires an exact 1-9 or 1-10 migration ledger", () => {
  const rows = Object.entries(EXPECTED_MIGRATIONS).map(([version, checksum]) => ({
    version, checksum, status: "applied",
  }));
  assert.equal(validateLedger(rows.slice(0, 9), 9).length, 9);
  assert.equal(validateLedger(rows, 10).length, 10);
  assert.throws(() => validateLedger(rows.slice(0, 8), 9));
  assert.throws(() => validateLedger(rows.map((row, index) =>
    index === 4 ? { ...row, checksum: "0".repeat(64) } : row), 10));
});

test("locks migration 010 bytes and rejects checksum drift", async () => {
  assert.equal((await readLockedMigration(root)).bytes.length > 0, true);
  const temporary = await mkdtemp(join(tmpdir(), "rollback-add-schema-drift-"));
  try {
    const target = resolve(temporary, MIGRATION_FILE);
    await import("node:fs/promises").then(({ mkdir }) => mkdir(resolve(target, ".."), { recursive: true }));
    await writeFile(target, `${await readFile(resolve(root, MIGRATION_FILE), "utf8")}\n`);
    await assert.rejects(() => readLockedMigration(temporary), /migration_checksum_mismatch/u);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("validates the machine contract and local packet", async () => {
  const contract = JSON.parse(await readFile(resolve(root,
    "docs/governance/wp-g0-2-canonical-rollback-safety-production-add-schema.v1.json")));
  assert.equal(validateContract(contract).productionExecuted, false);
  const local = await validateLocalPreparation(root);
  assert.equal(local.status, "PASS_LOCAL_CANONICAL_ROLLBACK_SAFETY_PRODUCTION_ADD_SCHEMA_PACKET");
});

test("builds a byte-identical secret-free transport twice", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "rollback-add-schema-bundle-"));
  const identity = {
    sourceCommit: "1".repeat(40), sourceTree: "2".repeat(40),
    sourceParentCommit: "3".repeat(40), sourceDiffSha256: "4".repeat(64),
    sourcePathSetSha256: "5".repeat(64), gateEvidenceSha256: "6".repeat(64),
  };
  try {
    const first = await buildTransportBundle({ root, output: join(temporary, "one.tar.gz"),
      sourceIdentity: identity });
    const second = await buildTransportBundle({ root, output: join(temporary, "two.tar.gz"),
      sourceIdentity: identity });
    assert.equal(first.sha256, second.sha256);
    assert.equal(Buffer.compare(await readFile(first.output), await readFile(second.output)), 0);
    assert.equal(first.manifest.containsSecrets, false);
    assert.deepEqual(first.manifest.services, []);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("builds a one-use 90-minute standing-grant request", () => {
  const manifest = {
    sourceCommit: "1".repeat(40), sourceTree: "2".repeat(40),
    contractSha256: "3".repeat(64), runnerArtifactSha256: "4".repeat(64),
    transportArtifactSha256: "5".repeat(64), gateEvidenceSha256: "6".repeat(64),
    policySha256: "7".repeat(64),
  };
  const runtime = {
    productionRoot: "/home/ubuntu/apps/chuan-market-radar",
    productionCommit: "8".repeat(40), productionTree: "9".repeat(40),
    composeSha256: "a".repeat(64), webImageId: `sha256:${"b".repeat(64)}`,
    migrationUrlFile: "/var/lib/market-radar-ops/identity/secrets/migration-login.url",
    opsRoot: "/home/ubuntu/.cache/market-radar-ops/canonical-rollback-add-schema-ops/test",
    evidenceDirectory:
      "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-canonical-rollback-add-schema-test",
    autonomyTrustRoot: "/home/ubuntu/.local/state/market-radar-autonomy",
  };
  const value = createProductionRequest({
    bundleSha256: "c".repeat(64), manifest, nonce: "nonce-00000001", now, runtime,
  });
  assert.equal(value.autonomyAuthorization.maxExecutions, 1);
  assert.equal(Date.parse(value.approvalExpiresAt) - Date.parse(value.approvalIssuedAt), 90 * 60 * 1000);
  assert.equal(validateRequest(value, { now, production: true }).migrationVersion, MIGRATION_VERSION);
});
