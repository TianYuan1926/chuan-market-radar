import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildM1ProductionStorageBackupFacts,
  buildM1ProductionStorageRecoveryEvidence,
  P0R_COS_ARCHIVE_FACTS_SCHEMA_VERSION,
  P0R_BACKUP_FACTS_SCHEMA_VERSION,
  P0R_RESTORE_FACTS_SCHEMA_VERSION,
  sealM1ProductionStorageRecoveryFact,
} from "./m1-production-storage-recovery-evidence.mjs";
import { buildP0RBackupCaptureFacts } from "./m1-production-storage-backup-capture.mjs";
import {
  P0_RECOVERY_EVIDENCE_SCHEMA_VERSION,
  stableDigest,
} from "./m1-production-storage-read-only-preflight.mjs";

const GIB = 1024 ** 3;
const SOURCE_COMMIT = "a".repeat(40);
const PRODUCTION_HEAD = "f".repeat(40);
const DATABASE_IDENTITY = `sha256:${"b".repeat(64)}`;
const STRUCTURAL_DIGEST = `sha256:${"c".repeat(64)}`;
const VERIFICATION_DIGEST = `sha256:${"d".repeat(64)}`;
const BACKUP_DIGEST = `sha256:${"e".repeat(64)}`;
const NOW = "2026-07-21T12:12:00.000Z";

function backupFacts() {
  return sealM1ProductionStorageRecoveryFact({
    completedAt: "2026-07-21T12:03:00.000Z",
    encryption: {
      algorithm: "AGE_X25519",
      appliedBeforeOffHostTransfer: true,
      encryptedBackupBytes: GIB,
      encryptedBackupDigest: BACKUP_DIGEST,
      plaintextDumpRemoved: true,
    },
    format: "PG_DUMP_CUSTOM",
    offHost: {
      availabilityZoneType: "SINGLE_AZ",
      archiveVerified: true,
      bucketAclPrivate: true,
      bucketPolicyPublicAccess: false,
      checksumVerified: true,
      controlPlaneEvidenceDigest: `sha256:${"0".repeat(64)}`,
      credentialExpiresAt: "2026-07-21T14:00:00.000Z",
      credentialPolicyDigest: `sha256:${"a".repeat(64)}`,
      credentialRequestDigest: `sha256:${"9".repeat(64)}`,
      credentialRequestIdDigest: `sha256:${"8".repeat(64)}`,
      destinationIdentityDigest: `sha256:${"1".repeat(64)}`,
      objectLockEnabled: true,
      objectIdentityDigest: `sha256:${"2".repeat(64)}`,
      objectRetentionMode: "COMPLIANCE",
      objectRetentionUntil: "2026-08-20T12:04:00.000Z",
      objectVersionIdentityDigest: `sha256:${"3".repeat(64)}`,
      overwriteProtectionMode: "HIGH_ENTROPY_UNIQUE_KEY_PLUS_PREUPLOAD_ABSENCE_CHECK",
      preUploadObjectAbsent: true,
      privateAccessVerified: true,
      provider: "TENCENT_COS",
      provisioningPlanDigest: `sha256:${"7".repeat(64)}`,
      region: "ap-hongkong",
      retrievedAt: "2026-07-21T12:05:00.000Z",
      retrievedBytes: GIB,
      retrievedDigest: BACKUP_DIGEST,
      serverSideEncryption: "AES256",
      temporaryCredentials: true,
      uploadedAt: "2026-07-21T12:04:00.000Z",
      versioningStatus: "ENABLED",
    },
    postgresMajor: 16,
    productionDatabaseMutation: false,
    productionHead: PRODUCTION_HEAD,
    productionRepositoryMutation: false,
    productionServiceMutation: false,
    schemaVersion: P0R_BACKUP_FACTS_SCHEMA_VERSION,
    sourceCommit: SOURCE_COMMIT,
    sourceDatabaseCapturedAt: "2026-07-21T12:01:00.000Z",
    sourceDatabaseIdentityDigest: DATABASE_IDENTITY,
    sourceDatabaseStructuralDigest: STRUCTURAL_DIGEST,
    sourceDatabaseVerificationDigest: VERIFICATION_DIGEST,
    startedAt: "2026-07-21T12:00:00.000Z",
    transactionConsistent: true,
  });
}

function restoreFacts() {
  return sealM1ProductionStorageRecoveryFact({
    cleanup: {
      credentialFileRemoved: true,
      decryptedBackupRemoved: true,
      plaintextDumpRemoved: true,
      restoreClusterRemoved: true,
      restoreVolumeRemoved: true,
    },
    completedAt: "2026-07-21T12:10:00.000Z",
    isolation: {
      containerized: true,
      hostPortsPublished: false,
      networkMode: "NONE",
      productionCredentialsMounted: false,
      productionNetworksAttached: false,
      productionVolumesMounted: false,
    },
    postgresMajor: 16,
    productionDatabaseMutation: false,
    productionHead: PRODUCTION_HEAD,
    productionRepositoryMutation: false,
    productionServiceMutation: false,
    retrievedBackupDigest: BACKUP_DIGEST,
    schemaVersion: P0R_RESTORE_FACTS_SCHEMA_VERSION,
    sourceCommit: SOURCE_COMMIT,
    sourceDatabaseIdentityDigest: DATABASE_IDENTITY,
    sourceDatabaseStructuralDigest: STRUCTURAL_DIGEST,
    sourceDatabaseVerificationDigest: VERIFICATION_DIGEST,
    sourceEncryptedBackupDigest: BACKUP_DIGEST,
    startedAt: "2026-07-21T12:06:00.000Z",
    targetAvailableBytes: 60 * GIB,
    verification: {
      businessRowValuesOutput: false,
      constraintsVerified: true,
      decryptSucceeded: true,
      indexesVerified: true,
      restoreSucceeded: true,
      restoredDatabaseStructuralDigest: STRUCTURAL_DIGEST,
      restoredDatabaseVerificationDigest: VERIFICATION_DIGEST,
    },
  });
}

function captureFacts() {
  return buildP0RBackupCaptureFacts({
    ageBinaryDigest: `sha256:${"4".repeat(64)}`,
    completedAt: "2026-07-21T12:03:00.000Z",
    databaseIdentityDigest: DATABASE_IDENTITY,
    encryptedBackupBytes: GIB,
    encryptedBackupDigest: BACKUP_DIGEST,
    postgresMajor: 16,
    productionHead: PRODUCTION_HEAD,
    sourceCommit: SOURCE_COMMIT,
    sourceDatabaseCapturedAt: "2026-07-21T12:01:00.000Z",
    startedAt: "2026-07-21T12:00:00.000Z",
    structuralDigest: STRUCTURAL_DIGEST,
    transactionIdUnassigned: true,
    verificationDigest: VERIFICATION_DIGEST,
  });
}

function archiveFacts() {
  const unsigned = {
    offHost: structuredClone(backupFacts().offHost),
    schemaVersion: P0R_COS_ARCHIVE_FACTS_SCHEMA_VERSION,
  };
  return { ...unsigned, evidenceDigest: stableDigest(unsigned) };
}

function reseal(value) {
  const copy = structuredClone(value);
  delete copy.evidenceDigest;
  return sealM1ProductionStorageRecoveryFact(copy);
}

function build(overrides = {}) {
  return buildM1ProductionStorageRecoveryEvidence({
    backupFacts: backupFacts(),
    evaluatedAt: NOW,
    expectedDatabaseIdentityDigest: DATABASE_IDENTITY,
    expectedProductionHead: PRODUCTION_HEAD,
    expectedSourceCommit: SOURCE_COMMIT,
    restoreFacts: restoreFacts(),
    ...overrides,
  });
}

test("builds exact P0-compatible recovery evidence only from complete proof", () => {
  const evidence = build();
  assert.equal(evidence.schemaVersion, P0_RECOVERY_EVIDENCE_SCHEMA_VERSION);
  assert.equal(evidence.backup.encrypted, true);
  assert.equal(evidence.backup.offHost, true);
  assert.equal(evidence.restore.isolated, true);
  assert.equal(evidence.restore.passed, true);
  assert.equal(evidence.restore.rpoMinutes, 4);
  assert.equal(evidence.restore.rtoMinutes, 4);
  assert.equal(evidence.restore.plaintextDumpRetained, false);
  assert.equal(evidence.restore.restoreClusterRetained, false);
  assert.equal(evidence.sourceDatabaseIdentityDigest, DATABASE_IDENTITY);
});

test("assembles final backup facts only from sealed capture and COS retrieval", () => {
  const assembled = buildM1ProductionStorageBackupFacts({
    archiveFacts: archiveFacts(),
    captureFacts: captureFacts(),
  });
  assert.deepEqual(assembled, backupFacts());

  const tampered = structuredClone(archiveFacts());
  tampered.offHost.retrievedBytes += 1;
  assert.throws(
    () => buildM1ProductionStorageBackupFacts({
      archiveFacts: tampered,
      captureFacts: captureFacts(),
    }),
    /evidence digest mismatch/u,
  );
});

test("is deterministic for the same sealed facts", () => {
  assert.equal(stableDigest(build()), stableDigest(build()));
});

test("rejects source, production and database identity drift", () => {
  assert.throws(
    () => build({ expectedSourceCommit: "9".repeat(40) }),
    /backup source commit drift/u,
  );
  assert.throws(
    () => build({ expectedProductionHead: "8".repeat(40) }),
    /backup production HEAD drift/u,
  );
  assert.throws(
    () => build({ expectedDatabaseIdentityDigest: `sha256:${"7".repeat(64)}` }),
    /backup database identity drift/u,
  );
});

test("rejects tampered or unknown fact fields", () => {
  const tampered = structuredClone(backupFacts());
  tampered.transactionConsistent = false;
  assert.throws(() => build({ backupFacts: tampered }), /evidence digest mismatch/u);

  const extra = structuredClone(backupFacts());
  delete extra.evidenceDigest;
  extra.databaseUrl = "forbidden";
  assert.throws(
    () => build({ backupFacts: sealM1ProductionStorageRecoveryFact(extra) }),
    /backupFacts fields must be exact/u,
  );
});

test("rejects invalid chronology and stale backup evidence", () => {
  const chronology = structuredClone(backupFacts());
  chronology.offHost.uploadedAt = "2026-07-21T11:59:00.000Z";
  assert.throws(
    () => build({ backupFacts: reseal(chronology) }),
    /off-host upload time order is invalid/u,
  );

  assert.throws(
    () => build({ evaluatedAt: "2026-07-21T13:34:00.000Z" }),
    /backup evidence is stale/u,
  );
});

test("enforces the strengthened RPO and RTO targets", () => {
  const rpo = structuredClone(backupFacts());
  rpo.sourceDatabaseCapturedAt = "2026-07-21T11:40:00.000Z";
  rpo.startedAt = "2026-07-21T11:39:00.000Z";
  assert.throws(
    () => build({ backupFacts: reseal(rpo) }),
    /recovery point objective exceeds 15 minutes/u,
  );

  const restore = structuredClone(restoreFacts());
  restore.startedAt = "2026-07-21T11:05:00.000Z";
  const backup = structuredClone(backupFacts());
  backup.offHost.retrievedAt = "2026-07-21T11:04:00.000Z";
  backup.offHost.uploadedAt = "2026-07-21T11:03:00.000Z";
  backup.completedAt = "2026-07-21T11:02:00.000Z";
  backup.sourceDatabaseCapturedAt = "2026-07-21T11:01:00.000Z";
  backup.startedAt = "2026-07-21T11:00:00.000Z";
  assert.throws(
    () => build({ backupFacts: reseal(backup), restoreFacts: reseal(restore) }),
    /recovery time objective exceeds 60 minutes/u,
  );
});

test("rejects weak off-host, encryption and retention claims", () => {
  for (const mutate of [
    (facts) => { facts.encryption.appliedBeforeOffHostTransfer = false; },
    (facts) => { facts.encryption.plaintextDumpRemoved = false; },
    (facts) => { facts.offHost.privateAccessVerified = false; },
    (facts) => { facts.offHost.availabilityZoneType = "MULTI_AZ"; },
    (facts) => { facts.offHost.bucketAclPrivate = false; },
    (facts) => { facts.offHost.bucketPolicyPublicAccess = true; },
    (facts) => { facts.offHost.versioningStatus = "SUSPENDED"; },
    (facts) => { facts.offHost.objectLockEnabled = false; },
    (facts) => { facts.offHost.objectRetentionMode = "GOVERNANCE"; },
    (facts) => { facts.offHost.objectRetentionUntil = "2026-08-19T12:04:00.000Z"; },
    (facts) => { facts.offHost.temporaryCredentials = false; },
    (facts) => { facts.offHost.archiveVerified = false; },
    (facts) => { facts.offHost.checksumVerified = false; },
    (facts) => { facts.offHost.preUploadObjectAbsent = false; },
    (facts) => { facts.offHost.overwriteProtectionMode = "HEADER_ONLY"; },
  ]) {
    const facts = structuredClone(backupFacts());
    mutate(facts);
    assert.throws(() => build({ backupFacts: reseal(facts) }));
  }
});

test("rejects remote retrieval and restore source mismatch", () => {
  const bytes = structuredClone(backupFacts());
  bytes.offHost.retrievedBytes += 1;
  assert.throws(() => build({ backupFacts: reseal(bytes) }), /byte count mismatch/u);

  const digest = structuredClone(restoreFacts());
  digest.retrievedBackupDigest = `sha256:${"6".repeat(64)}`;
  assert.throws(() => build({ restoreFacts: reseal(digest) }), /did not use retrieved backup/u);
});

test("rejects any production attachment in the restore target", () => {
  const facts = structuredClone(restoreFacts());
  facts.isolation.productionNetworksAttached = true;
  assert.throws(() => build({ restoreFacts: reseal(facts) }), /restore target is not isolated/u);
});

test("rejects incomplete restore verification or structural mismatch", () => {
  const incomplete = structuredClone(restoreFacts());
  incomplete.verification.constraintsVerified = false;
  assert.throws(
    () => build({ restoreFacts: reseal(incomplete) }),
    /constraints were not verified/u,
  );

  const mismatch = structuredClone(restoreFacts());
  mismatch.verification.restoredDatabaseVerificationDigest = `sha256:${"5".repeat(64)}`;
  assert.throws(
    () => build({ restoreFacts: reseal(mismatch) }),
    /restored verification digest mismatch/u,
  );
});

test("rejects business-row output, insufficient target or incomplete cleanup", () => {
  const output = structuredClone(restoreFacts());
  output.verification.businessRowValuesOutput = true;
  assert.throws(() => build({ restoreFacts: reseal(output) }), /exposed business rows/u);

  const capacity = structuredClone(restoreFacts());
  capacity.targetAvailableBytes = 40 * GIB;
  assert.throws(() => build({ restoreFacts: reseal(capacity) }), /target capacity is insufficient/u);

  const cleanup = structuredClone(restoreFacts());
  cleanup.cleanup.restoreVolumeRemoved = false;
  assert.throws(() => build({ restoreFacts: reseal(cleanup) }), /temporary scope was not cleaned/u);
});

test("rejects any claimed production mutation", () => {
  const backup = structuredClone(backupFacts());
  backup.productionServiceMutation = true;
  assert.throws(() => build({ backupFacts: reseal(backup) }), /backup mutated production services/u);

  const restore = structuredClone(restoreFacts());
  restore.productionDatabaseMutation = true;
  assert.throws(() => build({ restoreFacts: reseal(restore) }), /restore mutated production database/u);
});

test("CLI writes a mode-600 P0 recovery artifact without sensitive material", async () => {
  const directory = await mkdtemp(join(tmpdir(), "m1-p0r-recovery-"));
  const backupPath = join(directory, "backup.json");
  const restorePath = join(directory, "restore.json");
  const outputPath = join(directory, "recovery.json");
  await writeFile(backupPath, JSON.stringify(backupFacts()));
  await writeFile(restorePath, JSON.stringify(restoreFacts()));

  const stdout = execFileSync(process.execPath, [
    "scripts/v2/production/m1-production-storage-recovery-evidence.mjs",
    "build",
    "--backup-facts", backupPath,
    "--restore-facts", restorePath,
    "--source-commit", SOURCE_COMMIT,
    "--production-head", PRODUCTION_HEAD,
    "--database-identity-digest", DATABASE_IDENTITY,
    "--now", NOW,
    "--output", outputPath,
  ], { encoding: "utf8" });
  assert.equal(JSON.parse(stdout).status, "PASS_RECOVERY_EVIDENCE");
  assert.equal((await stat(outputPath)).mode & 0o077, 0);
  const output = await readFile(outputPath, "utf8");
  assert.equal(JSON.parse(output).schemaVersion, P0_RECOVERY_EVIDENCE_SCHEMA_VERSION);
  for (const forbidden of [
    "postgresql://",
    "password",
    "private key",
    "accesskey",
    "databaseurl",
  ]) assert.equal(output.toLowerCase().includes(forbidden), false);
});
