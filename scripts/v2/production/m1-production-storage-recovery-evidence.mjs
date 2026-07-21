#!/usr/bin/env node

import assert from "node:assert/strict";
import { link, lstat, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  P0_RECOVERY_EVIDENCE_SCHEMA_VERSION,
  stableDigest,
} from "./m1-production-storage-read-only-preflight.mjs";

export const P0R_BACKUP_FACTS_SCHEMA_VERSION =
  "v2-m1-production-storage-backup-artifact-facts.v1";
export const P0R_RESTORE_FACTS_SCHEMA_VERSION =
  "v2-m1-production-storage-isolated-restore-facts.v1";
export const P0R_COS_ARCHIVE_FACTS_SCHEMA_VERSION =
  "v2-m1-production-storage-cos-archive-facts.v1";
export const P0R_BACKUP_CAPTURE_SCHEMA_VERSION =
  "v2-m1-production-storage-backup-capture.v1";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_BACKUP_AGE_MS = 90 * 60_000;
const TARGET_RPO_MINUTES = 15;
const TARGET_RTO_MINUTES = 60;
const MINIMUM_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;
const MINIMUM_RESTORE_TARGET_BYTES = 51_836_979_428;

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

function bool(value, label) {
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

function milliseconds(value) {
  return Date.parse(value);
}

function minutesBetween(earlier, later, label) {
  const difference = milliseconds(later) - milliseconds(earlier);
  assert.ok(difference >= 0, `${label} time order is invalid`);
  return Math.ceil(difference / 60_000);
}

export function sealM1ProductionStorageRecoveryFact(value) {
  assert.ok(isRecord(value), "recovery fact must be an object");
  assert.equal(value.evidenceDigest, undefined, "recovery fact is already sealed");
  return Object.freeze({ ...value, evidenceDigest: stableDigest(value) });
}

function verifySeal(value, label) {
  const { evidenceDigest, ...unsigned } = value;
  digest(evidenceDigest, `${label}.evidenceDigest`);
  assert.equal(evidenceDigest, stableDigest(unsigned), `${label} evidence digest mismatch`);
}

function normalizeCaptureFacts(value) {
  exactKeys(value, [
    "ageBinaryDigest",
    "completedAt",
    "databaseIdentityDigest",
    "encryption",
    "evidenceDigest",
    "format",
    "postgresMajor",
    "productionDatabaseMutation",
    "productionHead",
    "productionRepositoryMutation",
    "productionServiceMutation",
    "schemaVersion",
    "snapshotImportedByPgDump",
    "sourceCommit",
    "sourceDatabaseCapturedAt",
    "startedAt",
    "structuralDigest",
    "transaction",
    "verificationDigest",
  ], "captureFacts");
  exactKeys(value.encryption, [
    "algorithm",
    "appliedBeforeOffHostTransfer",
    "encryptedBackupBytes",
    "encryptedBackupDigest",
    "plaintextDumpCreated",
  ], "captureFacts.encryption");
  exactKeys(value.transaction, [
    "isolation",
    "readOnly",
    "transactionIdUnassigned",
  ], "captureFacts.transaction");
  assert.equal(value.schemaVersion, P0R_BACKUP_CAPTURE_SCHEMA_VERSION);
  verifySeal(value, "captureFacts");
  assert.equal(value.format, "PG_DUMP_CUSTOM");
  assert.equal(value.postgresMajor, 16);
  assert.equal(value.snapshotImportedByPgDump, true);
  assert.deepEqual(value.transaction, {
    isolation: "REPEATABLE_READ_READ_ONLY",
    readOnly: true,
    transactionIdUnassigned: true,
  });
  assert.deepEqual({
    algorithm: value.encryption.algorithm,
    appliedBeforeOffHostTransfer: value.encryption.appliedBeforeOffHostTransfer,
    plaintextDumpCreated: value.encryption.plaintextDumpCreated,
  }, {
    algorithm: "AGE_X25519",
    appliedBeforeOffHostTransfer: true,
    plaintextDumpCreated: false,
  });
  assert.equal(value.productionDatabaseMutation, false);
  assert.equal(value.productionRepositoryMutation, false);
  assert.equal(value.productionServiceMutation, false);
  return value;
}

function normalizeArchiveFacts(value) {
  exactKeys(value, ["evidenceDigest", "offHost", "schemaVersion"], "archiveFacts");
  assert.equal(value.schemaVersion, P0R_COS_ARCHIVE_FACTS_SCHEMA_VERSION);
  verifySeal(value, "archiveFacts");
  return value;
}

export function buildM1ProductionStorageBackupFacts(input) {
  exactKeys(input, ["archiveFacts", "captureFacts"], "backupFactsInput");
  const capture = normalizeCaptureFacts(input.captureFacts);
  const archive = normalizeArchiveFacts(input.archiveFacts);
  assert.equal(
    archive.offHost.retrievedDigest,
    capture.encryption.encryptedBackupDigest,
    "COS retrieval digest does not match capture",
  );
  assert.equal(
    archive.offHost.retrievedBytes,
    capture.encryption.encryptedBackupBytes,
    "COS retrieval byte count does not match capture",
  );
  assert.ok(
    Date.parse(capture.completedAt) <= Date.parse(archive.offHost.uploadedAt),
    "COS upload predates backup completion",
  );
  const sealed = sealM1ProductionStorageRecoveryFact({
    completedAt: capture.completedAt,
    encryption: {
      algorithm: capture.encryption.algorithm,
      appliedBeforeOffHostTransfer: capture.encryption.appliedBeforeOffHostTransfer,
      encryptedBackupBytes: capture.encryption.encryptedBackupBytes,
      encryptedBackupDigest: capture.encryption.encryptedBackupDigest,
      plaintextDumpRemoved: true,
    },
    format: capture.format,
    offHost: archive.offHost,
    postgresMajor: capture.postgresMajor,
    productionDatabaseMutation: capture.productionDatabaseMutation,
    productionHead: capture.productionHead,
    productionRepositoryMutation: capture.productionRepositoryMutation,
    productionServiceMutation: capture.productionServiceMutation,
    schemaVersion: P0R_BACKUP_FACTS_SCHEMA_VERSION,
    sourceCommit: capture.sourceCommit,
    sourceDatabaseCapturedAt: capture.sourceDatabaseCapturedAt,
    sourceDatabaseIdentityDigest: capture.databaseIdentityDigest,
    sourceDatabaseStructuralDigest: capture.structuralDigest,
    sourceDatabaseVerificationDigest: capture.verificationDigest,
    startedAt: capture.startedAt,
    transactionConsistent: true,
  });
  normalizeBackupFacts(sealed);
  return sealed;
}

export function sealM1ProductionStorageRestoreFacts(value) {
  const sealed = sealM1ProductionStorageRecoveryFact(value);
  normalizeRestoreFacts(sealed);
  return sealed;
}

function normalizeBackupFacts(value) {
  exactKeys(value, [
    "completedAt",
    "encryption",
    "evidenceDigest",
    "format",
    "offHost",
    "postgresMajor",
    "productionDatabaseMutation",
    "productionHead",
    "productionRepositoryMutation",
    "productionServiceMutation",
    "schemaVersion",
    "sourceCommit",
    "sourceDatabaseCapturedAt",
    "sourceDatabaseIdentityDigest",
    "sourceDatabaseStructuralDigest",
    "sourceDatabaseVerificationDigest",
    "startedAt",
    "transactionConsistent",
  ], "backupFacts");
  exactKeys(value.encryption, [
    "algorithm",
    "appliedBeforeOffHostTransfer",
    "encryptedBackupBytes",
    "encryptedBackupDigest",
    "plaintextDumpRemoved",
  ], "backupFacts.encryption");
  exactKeys(value.offHost, [
    "archiveVerified",
    "bucketAclPrivate",
    "bucketPolicyPublicAccess",
    "checksumVerified",
    "controlPlaneEvidenceDigest",
    "credentialExpiresAt",
    "destinationIdentityDigest",
    "objectLockEnabled",
    "objectIdentityDigest",
    "objectRetentionMode",
    "objectRetentionUntil",
    "objectVersionIdentityDigest",
    "privateAccessVerified",
    "provider",
    "retrievedAt",
    "retrievedBytes",
    "retrievedDigest",
    "serverSideEncryption",
    "temporaryCredentials",
    "uploadedAt",
    "versioningStatus",
  ], "backupFacts.offHost");
  assert.equal(value.schemaVersion, P0R_BACKUP_FACTS_SCHEMA_VERSION);
  verifySeal(value, "backupFacts");
  return {
    completedAt: iso(value.completedAt, "backupFacts.completedAt"),
    encryption: {
      algorithm: text(
        value.encryption.algorithm,
        "backupFacts.encryption.algorithm",
        /^(AGE_X25519|AES_256_GCM_ENVELOPE)$/u,
      ),
      appliedBeforeOffHostTransfer: bool(
        value.encryption.appliedBeforeOffHostTransfer,
        "backupFacts.encryption.appliedBeforeOffHostTransfer",
      ),
      encryptedBackupBytes: integer(
        value.encryption.encryptedBackupBytes,
        "backupFacts.encryption.encryptedBackupBytes",
        { positive: true },
      ),
      encryptedBackupDigest: digest(
        value.encryption.encryptedBackupDigest,
        "backupFacts.encryption.encryptedBackupDigest",
      ),
      plaintextDumpRemoved: bool(
        value.encryption.plaintextDumpRemoved,
        "backupFacts.encryption.plaintextDumpRemoved",
      ),
    },
    evidenceDigest: value.evidenceDigest,
    format: text(value.format, "backupFacts.format", /^PG_DUMP_CUSTOM$/u),
    offHost: {
      archiveVerified: bool(value.offHost.archiveVerified, "backupFacts.offHost.archiveVerified"),
      bucketAclPrivate: bool(value.offHost.bucketAclPrivate, "backupFacts.offHost.bucketAclPrivate"),
      bucketPolicyPublicAccess: bool(
        value.offHost.bucketPolicyPublicAccess,
        "backupFacts.offHost.bucketPolicyPublicAccess",
      ),
      checksumVerified: bool(value.offHost.checksumVerified, "backupFacts.offHost.checksumVerified"),
      controlPlaneEvidenceDigest: digest(
        value.offHost.controlPlaneEvidenceDigest,
        "backupFacts.offHost.controlPlaneEvidenceDigest",
      ),
      credentialExpiresAt: iso(
        value.offHost.credentialExpiresAt,
        "backupFacts.offHost.credentialExpiresAt",
      ),
      destinationIdentityDigest: digest(
        value.offHost.destinationIdentityDigest,
        "backupFacts.offHost.destinationIdentityDigest",
      ),
      objectLockEnabled: bool(
        value.offHost.objectLockEnabled,
        "backupFacts.offHost.objectLockEnabled",
      ),
      objectIdentityDigest: digest(
        value.offHost.objectIdentityDigest,
        "backupFacts.offHost.objectIdentityDigest",
      ),
      objectRetentionMode: text(
        value.offHost.objectRetentionMode,
        "backupFacts.offHost.objectRetentionMode",
        /^COMPLIANCE$/u,
      ),
      objectRetentionUntil: iso(
        value.offHost.objectRetentionUntil,
        "backupFacts.offHost.objectRetentionUntil",
      ),
      objectVersionIdentityDigest: digest(
        value.offHost.objectVersionIdentityDigest,
        "backupFacts.offHost.objectVersionIdentityDigest",
      ),
      privateAccessVerified: bool(
        value.offHost.privateAccessVerified,
        "backupFacts.offHost.privateAccessVerified",
      ),
      provider: text(value.offHost.provider, "backupFacts.offHost.provider", /^TENCENT_COS$/u),
      retrievedAt: iso(value.offHost.retrievedAt, "backupFacts.offHost.retrievedAt"),
      retrievedBytes: integer(value.offHost.retrievedBytes, "backupFacts.offHost.retrievedBytes", { positive: true }),
      retrievedDigest: digest(value.offHost.retrievedDigest, "backupFacts.offHost.retrievedDigest"),
      serverSideEncryption: text(
        value.offHost.serverSideEncryption,
        "backupFacts.offHost.serverSideEncryption",
        /^AES256$/u,
      ),
      temporaryCredentials: bool(
        value.offHost.temporaryCredentials,
        "backupFacts.offHost.temporaryCredentials",
      ),
      uploadedAt: iso(value.offHost.uploadedAt, "backupFacts.offHost.uploadedAt"),
      versioningStatus: text(
        value.offHost.versioningStatus,
        "backupFacts.offHost.versioningStatus",
        /^ENABLED$/u,
      ),
    },
    postgresMajor: integer(value.postgresMajor, "backupFacts.postgresMajor", { positive: true }),
    productionDatabaseMutation: bool(value.productionDatabaseMutation, "backupFacts.productionDatabaseMutation"),
    productionHead: commit(value.productionHead, "backupFacts.productionHead"),
    productionRepositoryMutation: bool(value.productionRepositoryMutation, "backupFacts.productionRepositoryMutation"),
    productionServiceMutation: bool(value.productionServiceMutation, "backupFacts.productionServiceMutation"),
    schemaVersion: value.schemaVersion,
    sourceCommit: commit(value.sourceCommit, "backupFacts.sourceCommit"),
    sourceDatabaseCapturedAt: iso(value.sourceDatabaseCapturedAt, "backupFacts.sourceDatabaseCapturedAt"),
    sourceDatabaseIdentityDigest: digest(
      value.sourceDatabaseIdentityDigest,
      "backupFacts.sourceDatabaseIdentityDigest",
    ),
    sourceDatabaseStructuralDigest: digest(
      value.sourceDatabaseStructuralDigest,
      "backupFacts.sourceDatabaseStructuralDigest",
    ),
    sourceDatabaseVerificationDigest: digest(
      value.sourceDatabaseVerificationDigest,
      "backupFacts.sourceDatabaseVerificationDigest",
    ),
    startedAt: iso(value.startedAt, "backupFacts.startedAt"),
    transactionConsistent: bool(value.transactionConsistent, "backupFacts.transactionConsistent"),
  };
}

function normalizeRestoreFacts(value) {
  exactKeys(value, [
    "cleanup",
    "completedAt",
    "evidenceDigest",
    "isolation",
    "postgresMajor",
    "productionDatabaseMutation",
    "productionHead",
    "productionRepositoryMutation",
    "productionServiceMutation",
    "retrievedBackupDigest",
    "schemaVersion",
    "sourceCommit",
    "sourceDatabaseIdentityDigest",
    "sourceDatabaseStructuralDigest",
    "sourceDatabaseVerificationDigest",
    "sourceEncryptedBackupDigest",
    "startedAt",
    "targetAvailableBytes",
    "verification",
  ], "restoreFacts");
  exactKeys(value.isolation, [
    "containerized",
    "hostPortsPublished",
    "networkMode",
    "productionCredentialsMounted",
    "productionNetworksAttached",
    "productionVolumesMounted",
  ], "restoreFacts.isolation");
  exactKeys(value.verification, [
    "businessRowValuesOutput",
    "constraintsVerified",
    "decryptSucceeded",
    "indexesVerified",
    "restoreSucceeded",
    "restoredDatabaseStructuralDigest",
    "restoredDatabaseVerificationDigest",
  ], "restoreFacts.verification");
  exactKeys(value.cleanup, [
    "credentialFileRemoved",
    "decryptedBackupRemoved",
    "plaintextDumpRemoved",
    "restoreClusterRemoved",
    "restoreVolumeRemoved",
  ], "restoreFacts.cleanup");
  assert.equal(value.schemaVersion, P0R_RESTORE_FACTS_SCHEMA_VERSION);
  verifySeal(value, "restoreFacts");
  return {
    cleanup: Object.fromEntries(Object.entries(value.cleanup).map(([key, entry]) => [
      key,
      bool(entry, `restoreFacts.cleanup.${key}`),
    ])),
    completedAt: iso(value.completedAt, "restoreFacts.completedAt"),
    evidenceDigest: value.evidenceDigest,
    isolation: {
      containerized: bool(value.isolation.containerized, "restoreFacts.isolation.containerized"),
      hostPortsPublished: bool(value.isolation.hostPortsPublished, "restoreFacts.isolation.hostPortsPublished"),
      networkMode: text(value.isolation.networkMode, "restoreFacts.isolation.networkMode", /^NONE$/u),
      productionCredentialsMounted: bool(
        value.isolation.productionCredentialsMounted,
        "restoreFacts.isolation.productionCredentialsMounted",
      ),
      productionNetworksAttached: bool(
        value.isolation.productionNetworksAttached,
        "restoreFacts.isolation.productionNetworksAttached",
      ),
      productionVolumesMounted: bool(
        value.isolation.productionVolumesMounted,
        "restoreFacts.isolation.productionVolumesMounted",
      ),
    },
    postgresMajor: integer(value.postgresMajor, "restoreFacts.postgresMajor", { positive: true }),
    productionDatabaseMutation: bool(value.productionDatabaseMutation, "restoreFacts.productionDatabaseMutation"),
    productionHead: commit(value.productionHead, "restoreFacts.productionHead"),
    productionRepositoryMutation: bool(value.productionRepositoryMutation, "restoreFacts.productionRepositoryMutation"),
    productionServiceMutation: bool(value.productionServiceMutation, "restoreFacts.productionServiceMutation"),
    retrievedBackupDigest: digest(value.retrievedBackupDigest, "restoreFacts.retrievedBackupDigest"),
    schemaVersion: value.schemaVersion,
    sourceCommit: commit(value.sourceCommit, "restoreFacts.sourceCommit"),
    sourceDatabaseIdentityDigest: digest(
      value.sourceDatabaseIdentityDigest,
      "restoreFacts.sourceDatabaseIdentityDigest",
    ),
    sourceDatabaseStructuralDigest: digest(
      value.sourceDatabaseStructuralDigest,
      "restoreFacts.sourceDatabaseStructuralDigest",
    ),
    sourceDatabaseVerificationDigest: digest(
      value.sourceDatabaseVerificationDigest,
      "restoreFacts.sourceDatabaseVerificationDigest",
    ),
    sourceEncryptedBackupDigest: digest(
      value.sourceEncryptedBackupDigest,
      "restoreFacts.sourceEncryptedBackupDigest",
    ),
    startedAt: iso(value.startedAt, "restoreFacts.startedAt"),
    targetAvailableBytes: integer(value.targetAvailableBytes, "restoreFacts.targetAvailableBytes", { positive: true }),
    verification: {
      businessRowValuesOutput: bool(
        value.verification.businessRowValuesOutput,
        "restoreFacts.verification.businessRowValuesOutput",
      ),
      constraintsVerified: bool(value.verification.constraintsVerified, "restoreFacts.verification.constraintsVerified"),
      decryptSucceeded: bool(value.verification.decryptSucceeded, "restoreFacts.verification.decryptSucceeded"),
      indexesVerified: bool(value.verification.indexesVerified, "restoreFacts.verification.indexesVerified"),
      restoreSucceeded: bool(value.verification.restoreSucceeded, "restoreFacts.verification.restoreSucceeded"),
      restoredDatabaseStructuralDigest: digest(
        value.verification.restoredDatabaseStructuralDigest,
        "restoreFacts.verification.restoredDatabaseStructuralDigest",
      ),
      restoredDatabaseVerificationDigest: digest(
        value.verification.restoredDatabaseVerificationDigest,
        "restoreFacts.verification.restoredDatabaseVerificationDigest",
      ),
    },
  };
}

export function buildM1ProductionStorageRecoveryEvidence(input) {
  exactKeys(input, [
    "backupFacts",
    "evaluatedAt",
    "expectedDatabaseIdentityDigest",
    "expectedProductionHead",
    "expectedSourceCommit",
    "restoreFacts",
  ], "recoveryInput");
  const backup = normalizeBackupFacts(input.backupFacts);
  const restore = normalizeRestoreFacts(input.restoreFacts);
  const evaluatedAt = iso(input.evaluatedAt, "recoveryInput.evaluatedAt");
  const expectedSourceCommit = commit(input.expectedSourceCommit, "recoveryInput.expectedSourceCommit");
  const expectedProductionHead = commit(input.expectedProductionHead, "recoveryInput.expectedProductionHead");
  const expectedDatabaseIdentityDigest = digest(
    input.expectedDatabaseIdentityDigest,
    "recoveryInput.expectedDatabaseIdentityDigest",
  );

  assert.equal(backup.sourceCommit, expectedSourceCommit, "backup source commit drift");
  assert.equal(restore.sourceCommit, expectedSourceCommit, "restore source commit drift");
  assert.equal(backup.productionHead, expectedProductionHead, "backup production HEAD drift");
  assert.equal(restore.productionHead, expectedProductionHead, "restore production HEAD drift");
  assert.equal(
    backup.sourceDatabaseIdentityDigest,
    expectedDatabaseIdentityDigest,
    "backup database identity drift",
  );
  assert.equal(
    restore.sourceDatabaseIdentityDigest,
    expectedDatabaseIdentityDigest,
    "restore database identity drift",
  );
  assert.equal(backup.postgresMajor, 16, "backup PostgreSQL major must be 16");
  assert.equal(restore.postgresMajor, 16, "restore PostgreSQL major must be 16");
  assert.equal(backup.transactionConsistent, true, "backup must be transaction consistent");

  minutesBetween(backup.startedAt, backup.sourceDatabaseCapturedAt, "backup capture");
  minutesBetween(backup.sourceDatabaseCapturedAt, backup.completedAt, "backup completion");
  minutesBetween(backup.completedAt, backup.offHost.uploadedAt, "off-host upload");
  minutesBetween(backup.offHost.uploadedAt, backup.offHost.retrievedAt, "off-host retrieval");
  minutesBetween(backup.offHost.retrievedAt, backup.offHost.credentialExpiresAt, "credential expiry");
  minutesBetween(backup.offHost.retrievedAt, restore.startedAt, "restore start");
  const rtoMinutes = minutesBetween(restore.startedAt, restore.completedAt, "restore completion");
  minutesBetween(restore.completedAt, evaluatedAt, "recovery evaluation");
  const backupAgeMinutes = minutesBetween(backup.completedAt, evaluatedAt, "backup age");
  const rpoMinutes = minutesBetween(
    backup.sourceDatabaseCapturedAt,
    backup.offHost.retrievedAt,
    "recovery point objective",
  );

  assert.ok(backupAgeMinutes * 60_000 <= MAX_BACKUP_AGE_MS, "backup evidence is stale");
  assert.ok(rpoMinutes <= TARGET_RPO_MINUTES, "recovery point objective exceeds 15 minutes");
  assert.ok(rtoMinutes <= TARGET_RTO_MINUTES, "recovery time objective exceeds 60 minutes");
  assert.equal(backup.encryption.appliedBeforeOffHostTransfer, true, "backup was not encrypted before transfer");
  assert.equal(backup.encryption.plaintextDumpRemoved, true, "backup plaintext was retained");
  assert.equal(backup.offHost.privateAccessVerified, true, "off-host object is not private");
  assert.equal(backup.offHost.bucketAclPrivate, true, "off-host bucket ACL is not private");
  assert.equal(backup.offHost.bucketPolicyPublicAccess, false, "off-host bucket policy permits public access");
  assert.equal(backup.offHost.versioningStatus, "ENABLED", "off-host versioning is not enabled");
  assert.equal(backup.offHost.objectLockEnabled, true, "off-host object lock is not enabled");
  assert.equal(backup.offHost.objectRetentionMode, "COMPLIANCE", "off-host retention mode is not COMPLIANCE");
  assert.ok(
    milliseconds(backup.offHost.objectRetentionUntil) - milliseconds(backup.offHost.uploadedAt)
      >= MINIMUM_RETENTION_DAYS * DAY_MS,
    "off-host retention is below 30 days",
  );
  assert.equal(backup.offHost.temporaryCredentials, true, "off-host credentials are not temporary");
  assert.equal(backup.offHost.checksumVerified, true, "off-host checksum was not verified");
  assert.equal(backup.offHost.archiveVerified, true, "off-host retrieval was not verified");
  assert.equal(
    backup.offHost.retrievedDigest,
    backup.encryption.encryptedBackupDigest,
    "retrieved backup digest mismatch",
  );
  assert.equal(
    backup.offHost.retrievedBytes,
    backup.encryption.encryptedBackupBytes,
    "retrieved backup byte count mismatch",
  );
  assert.equal(restore.retrievedBackupDigest, backup.offHost.retrievedDigest, "restore did not use retrieved backup");
  assert.equal(
    restore.sourceEncryptedBackupDigest,
    backup.encryption.encryptedBackupDigest,
    "restore encrypted backup identity drift",
  );
  assert.equal(restore.sourceDatabaseStructuralDigest, backup.sourceDatabaseStructuralDigest, "restore source structural digest drift");
  assert.equal(restore.sourceDatabaseVerificationDigest, backup.sourceDatabaseVerificationDigest, "restore source verification digest drift");
  assert.equal(
    restore.verification.restoredDatabaseStructuralDigest,
    backup.sourceDatabaseStructuralDigest,
    "restored structural digest mismatch",
  );
  assert.equal(
    restore.verification.restoredDatabaseVerificationDigest,
    backup.sourceDatabaseVerificationDigest,
    "restored verification digest mismatch",
  );

  assert.deepEqual(restore.isolation, {
    containerized: true,
    hostPortsPublished: false,
    networkMode: "NONE",
    productionCredentialsMounted: false,
    productionNetworksAttached: false,
    productionVolumesMounted: false,
  }, "restore target is not isolated");
  assert.equal(restore.verification.decryptSucceeded, true, "backup decryption failed");
  assert.equal(restore.verification.restoreSucceeded, true, "database restore failed");
  assert.equal(restore.verification.constraintsVerified, true, "restored constraints were not verified");
  assert.equal(restore.verification.indexesVerified, true, "restored indexes were not verified");
  assert.equal(restore.verification.businessRowValuesOutput, false, "restore evidence exposed business rows");
  assert.ok(
    restore.targetAvailableBytes >= MINIMUM_RESTORE_TARGET_BYTES,
    "restore target capacity is insufficient",
  );
  assert.ok(Object.values(restore.cleanup).every((entry) => entry === true), "restore temporary scope was not cleaned");
  assert.equal(backup.productionDatabaseMutation, false, "backup mutated production database");
  assert.equal(backup.productionRepositoryMutation, false, "backup mutated production repository");
  assert.equal(backup.productionServiceMutation, false, "backup mutated production services");
  assert.equal(restore.productionDatabaseMutation, false, "restore mutated production database");
  assert.equal(restore.productionRepositoryMutation, false, "restore mutated production repository");
  assert.equal(restore.productionServiceMutation, false, "restore mutated production services");

  return Object.freeze({
    backup: {
      archiveVerified: true,
      checksumVerified: true,
      completedAt: backup.completedAt,
      createdAt: backup.startedAt,
      encrypted: true,
      encryptedBackupBytes: backup.encryption.encryptedBackupBytes,
      encryptedBackupDigest: backup.encryption.encryptedBackupDigest,
      offHost: true,
    },
    capturedAt: evaluatedAt,
    productionHead: expectedProductionHead,
    restore: {
      businessRowsOutput: false,
      completedAt: restore.completedAt,
      evidenceDigest: restore.evidenceDigest,
      isolated: true,
      passed: true,
      plaintextDumpRetained: false,
      restoreClusterRetained: false,
      rpoMinutes,
      rtoMinutes,
      sourceEncryptedBackupDigest: backup.encryption.encryptedBackupDigest,
      targetAvailableBytes: restore.targetAvailableBytes,
    },
    schemaVersion: P0_RECOVERY_EVIDENCE_SCHEMA_VERSION,
    sourceDatabaseIdentityDigest: expectedDatabaseIdentityDigest,
  });
}

async function readJson(path, label) {
  const target = resolve(path);
  const facts = await lstat(target);
  assert.equal(facts.isSymbolicLink(), false, `${label} must not be a symlink`);
  assert.equal(facts.isFile(), true, `${label} must be a regular file`);
  assert.ok(facts.size > 0 && facts.size <= 1024 * 1024, `${label} size is invalid`);
  return JSON.parse(await readFile(target, "utf8"));
}

async function writeAtomic(path, value) {
  const target = resolve(path);
  const temporary = resolve(dirname(target), `.${target.split("/").at(-1)}.${process.pid}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await link(temporary, target);
    await rm(temporary);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function parseArguments(argv) {
  const [command = "", ...rest] = argv;
  assert.ok(
    ["assemble-backup", "build", "seal-restore", "verify-facts"].includes(command),
    "command is unsupported",
  );
  assert.equal(rest.length % 2, 0, "arguments must be name/value pairs");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    assert.match(rest[index], /^--[a-z][a-z0-9-]*$/u, "argument name is invalid");
    const name = rest[index].slice(2);
    assert.equal(options[name], undefined, `duplicate argument ${rest[index]}`);
    options[name] = rest[index + 1];
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === "assemble-backup") {
    const captureFacts = await readJson(options["capture-facts"], "capture facts");
    const archiveFacts = await readJson(options["archive-facts"], "archive facts");
    const facts = buildM1ProductionStorageBackupFacts({ archiveFacts, captureFacts });
    assert.ok(options.output, "output is required");
    await writeAtomic(options.output, facts);
    process.stdout.write(`${JSON.stringify({
      backupEvidenceDigest: facts.evidenceDigest,
      containsSecret: false,
      status: "PASS_BACKUP_FACTS",
    })}\n`);
    return;
  }
  if (command === "seal-restore") {
    const unsigned = await readJson(options.input, "unsigned restore facts");
    const facts = sealM1ProductionStorageRestoreFacts(unsigned);
    assert.ok(options.output, "output is required");
    await writeAtomic(options.output, facts);
    process.stdout.write(`${JSON.stringify({
      containsSecret: false,
      restoreEvidenceDigest: facts.evidenceDigest,
      status: "PASS_RESTORE_FACTS",
    })}\n`);
    return;
  }
  const backupFacts = await readJson(options["backup-facts"], "backup facts");
  const restoreFacts = await readJson(options["restore-facts"], "restore facts");
  if (command === "verify-facts") {
    normalizeBackupFacts(backupFacts);
    normalizeRestoreFacts(restoreFacts);
    process.stdout.write(`${JSON.stringify({ factsValid: true, status: "PASS" })}\n`);
    return;
  }
  const evidence = buildM1ProductionStorageRecoveryEvidence({
    backupFacts,
    evaluatedAt: options.now ?? new Date().toISOString(),
    expectedDatabaseIdentityDigest: options["database-identity-digest"],
    expectedProductionHead: options["production-head"],
    expectedSourceCommit: options["source-commit"],
    restoreFacts,
  });
  assert.ok(options.output, "output is required");
  await writeAtomic(options.output, evidence);
  process.stdout.write(`${JSON.stringify({
    containsSecret: false,
    outputWritten: true,
    recoveryEvidenceDigest: stableDigest(evidence),
    status: "PASS_RECOVERY_EVIDENCE",
  })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      reason: error instanceof Error ? error.message : "unexpected_error",
      status: "BLOCKED",
    })}\n`);
    process.exitCode = 1;
  });
}
