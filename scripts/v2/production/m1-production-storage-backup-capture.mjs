#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  link,
  open,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import {
  collectP0RDatabaseFingerprint,
} from "./m1-production-storage-database-fingerprint.mjs";
import { stableDigest } from "./m1-production-storage-read-only-preflight.mjs";

export const P0R_BACKUP_CAPTURE_SCHEMA_VERSION =
  "v2-m1-production-storage-backup-capture.v1";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const CONTAINER_PATTERN = /^[0-9a-f]{64}$/u;
const DATABASE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$-]{0,62}$/u;
const AGE_RECIPIENT_PATTERN = /^age1[0-9a-z]{58}$/u;
const MAXIMUM_DIAGNOSTIC_BYTES = 64 * 1024;
const DUMP_TIMEOUT_MS = 30 * 60_000;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  assert.ok(isRecord(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} fields must be exact`);
}

function iso(value, label) {
  assert.equal(typeof value, "string", `${label} must be text`);
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u, `${label} is invalid`);
  assert.equal(new Date(value).toISOString(), value, `${label} must be canonical UTC`);
  return value;
}

function prefixedDigest(value, label) {
  assert.equal(typeof value, "string", `${label} must be text`);
  assert.match(value, /^sha256:[0-9a-f]{64}$/u, `${label} is invalid`);
  return value;
}

export function buildP0RBackupCaptureFacts(input) {
  exactKeys(input, [
    "ageBinaryDigest",
    "completedAt",
    "databaseIdentityDigest",
    "encryptedBackupBytes",
    "encryptedBackupDigest",
    "postgresMajor",
    "productionHead",
    "sourceCommit",
    "sourceDatabaseCapturedAt",
    "startedAt",
    "structuralDigest",
    "transactionIdUnassigned",
    "verificationDigest",
  ], "captureInput");
  assert.match(input.sourceCommit, COMMIT_PATTERN, "source commit is invalid");
  assert.match(input.productionHead, COMMIT_PATTERN, "production HEAD is invalid");
  assert.equal(input.postgresMajor, 16, "capture requires PostgreSQL 16");
  assert.equal(input.transactionIdUnassigned, true, "capture transaction assigned an ID");
  assert.ok(Number.isSafeInteger(input.encryptedBackupBytes) && input.encryptedBackupBytes > 0);
  const startedAt = iso(input.startedAt, "startedAt");
  const capturedAt = iso(input.sourceDatabaseCapturedAt, "sourceDatabaseCapturedAt");
  const completedAt = iso(input.completedAt, "completedAt");
  assert.ok(Date.parse(startedAt) <= Date.parse(capturedAt), "capture start order is invalid");
  assert.ok(Date.parse(capturedAt) <= Date.parse(completedAt), "capture completion order is invalid");
  const unsigned = {
    ageBinaryDigest: prefixedDigest(input.ageBinaryDigest, "ageBinaryDigest"),
    completedAt,
    databaseIdentityDigest: prefixedDigest(
      input.databaseIdentityDigest,
      "databaseIdentityDigest",
    ),
    encryption: {
      algorithm: "AGE_X25519",
      appliedBeforeOffHostTransfer: true,
      encryptedBackupBytes: input.encryptedBackupBytes,
      encryptedBackupDigest: prefixedDigest(
        input.encryptedBackupDigest,
        "encryptedBackupDigest",
      ),
      plaintextDumpCreated: false,
    },
    format: "PG_DUMP_CUSTOM",
    postgresMajor: 16,
    productionDatabaseMutation: false,
    productionHead: input.productionHead,
    productionRepositoryMutation: false,
    productionServiceMutation: false,
    schemaVersion: P0R_BACKUP_CAPTURE_SCHEMA_VERSION,
    snapshotImportedByPgDump: true,
    sourceCommit: input.sourceCommit,
    sourceDatabaseCapturedAt: capturedAt,
    startedAt,
    structuralDigest: prefixedDigest(input.structuralDigest, "structuralDigest"),
    transaction: {
      isolation: "REPEATABLE_READ_READ_ONLY",
      readOnly: true,
      transactionIdUnassigned: true,
    },
    verificationDigest: prefixedDigest(input.verificationDigest, "verificationDigest"),
  };
  return Object.freeze({ ...unsigned, evidenceDigest: stableDigest(unsigned) });
}

async function digestFile(path) {
  const file = await open(path, "r");
  try {
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      hash.update(chunk);
      bytes += chunk.length;
    }
    return { bytes, digest: `sha256:${hash.digest("hex")}` };
  } finally {
    await file.close();
  }
}

async function requireRegular(path, label, { executable = false, secure = false } = {}) {
  assert.equal(resolve(path), path, `${label} path must be absolute`);
  const facts = await lstat(path);
  assert.equal(facts.isSymbolicLink(), false, `${label} must not be a symlink`);
  assert.equal(facts.isFile(), true, `${label} must be a regular file`);
  assert.ok(facts.size > 0, `${label} must not be empty`);
  if (executable) assert.notEqual(facts.mode & 0o111, 0, `${label} is not executable`);
  if (secure) assert.equal(facts.mode & 0o077, 0, `${label} permissions are too open`);
  return facts;
}

async function readSecureConnection(path) {
  const facts = await requireRegular(path, "database connection", { secure: true });
  assert.ok(facts.size <= 8 * 1024, "database connection file is too large");
  const value = (await readFile(path, "utf8")).trim();
  assert.equal(value.includes("\n"), false, "database connection must be one line");
  const parsed = new URL(value);
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol));
  assert.ok(parsed.username && parsed.password && parsed.pathname.length > 1);
  return value;
}

export async function readSingleAgeRecipient(path) {
  const facts = await requireRegular(path, "age recipient");
  assert.ok(facts.size <= 8 * 1024, "age recipient file is too large");
  const lines = (await readFile(path, "utf8"))
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  assert.equal(lines.length, 1, "exactly one age X25519 recipient is required");
  assert.match(lines[0], AGE_RECIPIENT_PATTERN, "age X25519 recipient is invalid");
  return lines[0];
}

async function loadPgClient() {
  const imported = await import("pg");
  const Client = imported.Client ?? imported.default?.Client;
  assert.equal(typeof Client, "function", "pg Client runtime is unavailable");
  return Client;
}

function collectDiagnostic(stream) {
  const chunks = [];
  let bytes = 0;
  stream.on("data", (chunk) => {
    if (bytes >= MAXIMUM_DIAGNOSTIC_BYTES) return;
    const remaining = MAXIMUM_DIAGNOSTIC_BYTES - bytes;
    const retained = chunk.subarray(0, remaining);
    chunks.push(retained);
    bytes += retained.length;
  });
  return () => Buffer.concat(chunks).toString("utf8").replaceAll(/[\r\n]+/gu, " ").trim();
}

function childExit(child, label) {
  return new Promise((resolveExit, rejectExit) => {
    child.once("error", (error) => rejectExit(new Error(`${label} failed to start: ${error.message}`)));
    child.once("close", (code, signal) => resolveExit({ code, signal }));
  });
}

export async function runEncryptedSnapshotDump(input) {
  exactKeys(input, [
    "ageBinary",
    "ageRecipientFile",
    "databaseName",
    "databaseUser",
    "dockerBinary",
    "encryptedOutput",
    "postgresContainer",
    "snapshotId",
  ], "encryptedDumpInput");
  assert.match(input.postgresContainer, CONTAINER_PATTERN, "PostgreSQL container ID is invalid");
  assert.match(input.databaseName, DATABASE_IDENTIFIER_PATTERN, "database name is invalid");
  assert.match(input.databaseUser, DATABASE_IDENTIFIER_PATTERN, "database user is invalid");
  assert.match(input.snapshotId, /^[0-9A-F-]{8,80}$/iu, "exported snapshot ID is invalid");
  assert.equal(resolve(input.encryptedOutput), input.encryptedOutput, "encrypted output must be absolute");
  await assert.rejects(lstat(input.encryptedOutput), (error) => error?.code === "ENOENT");

  const encryptedFile = await open(input.encryptedOutput, "wx", 0o600);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DUMP_TIMEOUT_MS);
  let succeeded = false;
  try {
    const dump = spawn(input.dockerBinary, [
      "exec",
      "--interactive",
      "--env",
      "PGOPTIONS=-c default_transaction_read_only=on -c lock_timeout=5000 -c statement_timeout=0",
      input.postgresContainer,
      "pg_dump",
      "--username", input.databaseUser,
      "--dbname", input.databaseName,
      "--format=custom",
      "--compress=6",
      "--no-owner",
      "--no-acl",
      "--no-password",
      `--snapshot=${input.snapshotId}`,
    ], {
      env: { LANG: "C", LC_ALL: "C", PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" },
      signal: controller.signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const encrypt = spawn(input.ageBinary, [
      "--encrypt",
      "--recipients-file", input.ageRecipientFile,
    ], {
      env: { LANG: "C", LC_ALL: "C", PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" },
      signal: controller.signal,
      stdio: ["pipe", encryptedFile.fd, "pipe"],
    });
    const dumpDiagnostic = collectDiagnostic(dump.stderr);
    const ageDiagnostic = collectDiagnostic(encrypt.stderr);
    const pipe = pipeline(dump.stdout, encrypt.stdin).catch((error) => error);
    const [dumpResult, encryptResult, pipeResult] = await Promise.all([
      childExit(dump, "pg_dump"),
      childExit(encrypt, "age"),
      pipe,
    ]);
    if (dumpResult.code !== 0 || dumpResult.signal) {
      throw new Error(`pg_dump failed (${dumpDiagnostic() || "no diagnostic"})`);
    }
    if (encryptResult.code !== 0 || encryptResult.signal) {
      throw new Error(`age encryption failed (${ageDiagnostic() || "no diagnostic"})`);
    }
    if (pipeResult instanceof Error) throw new Error("pg_dump to age stream failed");
    await encryptedFile.sync();
    succeeded = true;
  } finally {
    clearTimeout(timeout);
    await encryptedFile.close().catch(() => {});
    if (!succeeded) await rm(input.encryptedOutput, { force: true });
  }
}

async function writeAtomic(path, value) {
  const target = resolve(path);
  assert.equal(target, path, "output path must be absolute");
  const temporary = resolve(dirname(target), `.${target.split("/").at(-1)}.${process.pid}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await link(temporary, target);
    await rm(temporary);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function parseArguments(argv) {
  const [command = "", ...rest] = argv;
  assert.equal(command, "capture", "command must be capture");
  assert.equal(rest.length % 2, 0, "arguments must be name/value pairs");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    assert.match(rest[index], /^--[a-z][a-z0-9-]*$/u, "argument name is invalid");
    const name = rest[index].slice(2);
    assert.equal(options[name], undefined, `duplicate argument ${rest[index]}`);
    options[name] = rest[index + 1];
  }
  exactKeys(options, [
    "age-binary",
    "age-binary-sha256",
    "age-recipient-file",
    "database-connection-file",
    "database-name",
    "database-user",
    "docker-binary",
    "encrypted-output",
    "output",
    "postgres-container",
    "production-head",
    "source-commit",
  ], "options");
  assert.match(options["age-binary-sha256"], SHA256_PATTERN, "age binary checksum is invalid");
  assert.match(options["source-commit"], COMMIT_PATTERN, "source commit is invalid");
  assert.match(options["production-head"], COMMIT_PATTERN, "production HEAD is invalid");
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await requireRegular(options["age-binary"], "age binary", { executable: true });
  await requireRegular(options["docker-binary"], "Docker binary", { executable: true });
  await readSingleAgeRecipient(options["age-recipient-file"]);
  const ageDigest = await digestFile(options["age-binary"]);
  assert.equal(ageDigest.digest, `sha256:${options["age-binary-sha256"]}`, "age binary checksum mismatch");
  const connectionString = await readSecureConnection(options["database-connection-file"]);
  const Client = await loadPgClient();
  const client = new Client({
    application_name: "market-radar-v2-m1-p0r-backup-capture",
    connectionString,
  });
  const startedAt = new Date().toISOString();
  await client.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionOpen = true;
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15min'");
    const captured = await client.query("SELECT clock_timestamp() AS captured_at");
    assert.equal(captured.rows.length, 1);
    const sourceDatabaseCapturedAt = new Date(captured.rows[0].captured_at).toISOString();
    const fingerprint = await collectP0RDatabaseFingerprint(client);
    const snapshot = await client.query("SELECT pg_export_snapshot() AS snapshot_id");
    assert.equal(snapshot.rows.length, 1);
    await runEncryptedSnapshotDump({
      ageBinary: options["age-binary"],
      ageRecipientFile: options["age-recipient-file"],
      databaseName: options["database-name"],
      databaseUser: options["database-user"],
      dockerBinary: options["docker-binary"],
      encryptedOutput: options["encrypted-output"],
      postgresContainer: options["postgres-container"],
      snapshotId: snapshot.rows[0].snapshot_id,
    });
    await client.query("ROLLBACK");
    transactionOpen = false;
    const encrypted = await digestFile(options["encrypted-output"]);
    const facts = buildP0RBackupCaptureFacts({
      ageBinaryDigest: ageDigest.digest,
      completedAt: new Date().toISOString(),
      databaseIdentityDigest: fingerprint.databaseIdentityDigest,
      encryptedBackupBytes: encrypted.bytes,
      encryptedBackupDigest: encrypted.digest,
      postgresMajor: fingerprint.postgresMajor,
      productionHead: options["production-head"],
      sourceCommit: options["source-commit"],
      sourceDatabaseCapturedAt,
      startedAt,
      structuralDigest: fingerprint.structuralDigest,
      transactionIdUnassigned: fingerprint.transactionIdUnassigned,
      verificationDigest: fingerprint.verificationDigest,
    });
    await writeAtomic(options.output, facts);
    process.stdout.write(`${JSON.stringify({
      backupCaptureDigest: facts.evidenceDigest,
      businessRowsOutput: false,
      encryptedBackupBytes: encrypted.bytes,
      encryptedBackupDigest: encrypted.digest,
      plaintextDumpCreated: false,
      status: "PASS_ENCRYPTED_BACKUP_CAPTURE",
    })}\n`);
  } finally {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
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
