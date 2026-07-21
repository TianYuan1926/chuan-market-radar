import assert from "node:assert/strict";
import { chmod, lstat, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildP0RBackupCaptureFacts,
  P0R_BACKUP_CAPTURE_SCHEMA_VERSION,
  readSingleAgeRecipient,
  runEncryptedSnapshotDump,
} from "./m1-production-storage-backup-capture.mjs";

const DIGEST = `sha256:${"a".repeat(64)}`;

function input(overrides = {}) {
  return {
    ageBinaryDigest: DIGEST,
    completedAt: "2026-07-21T12:05:00.000Z",
    databaseIdentityDigest: DIGEST,
    encryptedBackupBytes: 1024,
    encryptedBackupDigest: DIGEST,
    postgresMajor: 16,
    productionHead: "b".repeat(40),
    sourceCommit: "c".repeat(40),
    sourceDatabaseCapturedAt: "2026-07-21T12:01:00.000Z",
    startedAt: "2026-07-21T12:00:00.000Z",
    structuralDigest: DIGEST,
    transactionIdUnassigned: true,
    verificationDigest: DIGEST,
    ...overrides,
  };
}

test("seals a no-plaintext, read-only capture fact", () => {
  const facts = buildP0RBackupCaptureFacts(input());
  assert.equal(facts.schemaVersion, P0R_BACKUP_CAPTURE_SCHEMA_VERSION);
  assert.equal(facts.encryption.plaintextDumpCreated, false);
  assert.equal(facts.encryption.appliedBeforeOffHostTransfer, true);
  assert.equal(facts.productionDatabaseMutation, false);
  assert.match(facts.evidenceDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.deepEqual(facts, buildP0RBackupCaptureFacts(input()));
});

test("rejects chronology, identity, transaction and unknown field drift", () => {
  assert.throws(() => buildP0RBackupCaptureFacts(input({
    completedAt: "2026-07-21T11:59:00.000Z",
  })));
  assert.throws(() => buildP0RBackupCaptureFacts(input({ postgresMajor: 15 })));
  assert.throws(() => buildP0RBackupCaptureFacts(input({ transactionIdUnassigned: false })));
  assert.throws(() => buildP0RBackupCaptureFacts(input({ unexpected: true })));
});

test("accepts exactly one public age X25519 recipient", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p0r-age-recipient-"));
  const path = join(directory, "recipients.txt");
  const recipient = `age1${"q".repeat(58)}`;
  await writeFile(path, `# recovery recipient\n${recipient}\n`, { mode: 0o600 });
  assert.equal(await readSingleAgeRecipient(path), recipient);
  await writeFile(path, `${recipient}\n${recipient}\n`, { mode: 0o600 });
  await assert.rejects(() => readSingleAgeRecipient(path), /exactly one/u);
});

test("streams pg_dump directly into encryption and removes partial output on failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p0r-stream-"));
  const docker = join(directory, "docker");
  const age = join(directory, "age");
  const recipient = join(directory, "recipient.txt");
  const output = join(directory, "production.dump.age");
  await writeFile(docker, "#!/bin/sh\nprintf 'custom-format-dump'\n", { mode: 0o700 });
  await writeFile(age, "#!/bin/sh\ncat\n", { mode: 0o700 });
  await writeFile(recipient, `age1${"q".repeat(58)}\n`, { mode: 0o600 });
  await chmod(docker, 0o700);
  await chmod(age, 0o700);
  const base = {
    ageBinary: age,
    ageRecipientFile: recipient,
    databaseName: "market_radar",
    databaseUser: "postgres",
    dockerBinary: docker,
    encryptedOutput: output,
    postgresContainer: "f".repeat(64),
    snapshotId: "00000003-0000001B-1",
  };
  await runEncryptedSnapshotDump(base);
  assert.equal(await readFile(output, "utf8"), "custom-format-dump");

  const failedOutput = join(directory, "failed.dump.age");
  await writeFile(docker, "#!/bin/sh\nprintf 'partial'\nexit 7\n", { mode: 0o700 });
  await assert.rejects(
    () => runEncryptedSnapshotDump({ ...base, encryptedOutput: failedOutput }),
    /pg_dump failed/u,
  );
  await assert.rejects(lstat(failedOutput), (error) => error?.code === "ENOENT");
});
