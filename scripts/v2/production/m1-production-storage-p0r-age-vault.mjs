#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const P0R_AGE_VAULT_SCHEMA_VERSION =
  "v2-m1-production-storage-age-vault-attestation.v1";
export const P0R_AGE_DARWIN_ARM64_ARCHIVE_URL =
  "https://github.com/FiloSottile/age/releases/download/v1.3.1/age-v1.3.1-darwin-arm64.tar.gz";
export const P0R_AGE_DARWIN_ARM64_ARCHIVE_SHA256 =
  "01120ea2cbf0463d4c6bd767f99f3271bbed1cdc8a9aa718a76ba1fe4f01998b";
export const P0R_AGE_VERSION = "v1.3.1";

const AGE_SECRET_PATTERN =
  /^AGE-SECRET-KEY-1[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{58}$/u;
const AGE_RECIPIENT_PATTERN =
  /^age1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/u;
const AGE_SECRET_SEARCH_PATTERN =
  /AGE-SECRET-KEY-1[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{58}/gu;
const AGE_RECIPIENT_SEARCH_PATTERN =
  /age1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}/gu;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const KEYCHAIN_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u;
const MAXIMUM_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAXIMUM_BINARY_BYTES = 32 * 1024 * 1024;
const MAXIMUM_SECRET_BYTES = 8 * 1024;
const SECURITY_BINARY = "/usr/bin/security";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactKeys(value, keys, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} fields must be exact`);
}

function normalizedLines(value, label) {
  assert.equal(typeof value, "string", `${label} must be text`);
  assert.ok(Buffer.byteLength(value) > 0 && Buffer.byteLength(value) <= MAXIMUM_SECRET_BYTES,
    `${label} size is invalid`);
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

export function normalizeAgeIdentity(value) {
  const lines = normalizedLines(value, "age identity");
  assert.equal(lines.length, 1, "exactly one age X25519 identity is required");
  assert.match(lines[0], AGE_SECRET_PATTERN, "age X25519 identity is invalid");
  return `${lines[0]}\n`;
}

export function normalizeAgeRecipient(value) {
  const lines = normalizedLines(value, "age recipient");
  assert.equal(lines.length, 1, "exactly one age X25519 recipient is required");
  assert.match(lines[0], AGE_RECIPIENT_PATTERN, "age X25519 recipient is invalid");
  return `${lines[0]}\n`;
}

export function parseAgeKeygenOutput(stdout, stderr = "") {
  assert.equal(typeof stdout, "string", "age-keygen stdout must be text");
  assert.equal(typeof stderr, "string", "age-keygen stderr must be text");
  const text = `${stdout}\n${stderr}`;
  assert.ok(Buffer.byteLength(text) <= MAXIMUM_SECRET_BYTES, "age-keygen output is too large");
  const identityMatches = text.match(AGE_SECRET_SEARCH_PATTERN) ?? [];
  const recipientMatches = text.match(AGE_RECIPIENT_SEARCH_PATTERN) ?? [];
  const distinctRecipients = [...new Set(recipientMatches)];
  assert.equal(identityMatches.length, 1, "age-keygen must emit exactly one private identity");
  assert.equal(distinctRecipients.length, 1,
    "age-keygen must emit exactly one distinct public recipient");
  return Object.freeze({
    identity: normalizeAgeIdentity(identityMatches[0]),
    recipient: normalizeAgeRecipient(distinctRecipients[0]),
  });
}

export function buildP0RAgeVaultAttestation(input) {
  const generatedAt = new Date(input.generatedAt).toISOString();
  assert.equal(generatedAt, input.generatedAt, "generatedAt must be canonical UTC");
  assert.match(input.archiveDigest, SHA256_PATTERN, "archive digest is invalid");
  assert.match(input.binaryDigest, SHA256_PATTERN, "binary digest is invalid");
  assert.match(input.identityDigest, SHA256_PATTERN, "identity digest is invalid");
  assert.match(input.keychainAccount, KEYCHAIN_NAME_PATTERN, "keychain account is invalid");
  assert.match(input.keychainService, KEYCHAIN_NAME_PATTERN, "keychain service is invalid");
  const recipient = normalizeAgeRecipient(input.recipient).trim();
  const unsigned = {
    algorithm: "AGE_X25519",
    containsPrivateKey: false,
    generatedAt,
    identityDigest: input.identityDigest,
    productionHostPrivateKeyCopies: 0,
    recipient,
    recipientDigest: `sha256:${sha256(Buffer.from(`${recipient}\n`))}`,
    schemaVersion: P0R_AGE_VAULT_SCHEMA_VERSION,
    secretMaterialOutput: false,
    status: "PASS_P0R_AGE_IDENTITY_VAULT",
    toolchain: {
      archiveDigest: input.archiveDigest,
      binaryDigest: input.binaryDigest,
      platform: "darwin-arm64",
      sourceUrl: P0R_AGE_DARWIN_ARM64_ARCHIVE_URL,
      version: P0R_AGE_VERSION,
    },
    vault: {
      accountDigest: `sha256:${sha256(Buffer.from(input.keychainAccount))}`,
      durableCopyCount: 1,
      keychainReadbackVerified: true,
      offProductionHost: true,
      provider: "MACOS_LOGIN_KEYCHAIN",
      rawIdentityFileCreated: false,
      serviceDigest: `sha256:${sha256(Buffer.from(input.keychainService))}`,
    },
  };
  return Object.freeze({
    ...unsigned,
    attestationDigest: `sha256:${sha256(Buffer.from(canonicalJson(unsigned)))}`,
  });
}

export function validateP0RAgeVaultAttestation(value) {
  exactKeys(value, [
    "algorithm",
    "attestationDigest",
    "containsPrivateKey",
    "generatedAt",
    "identityDigest",
    "productionHostPrivateKeyCopies",
    "recipient",
    "recipientDigest",
    "schemaVersion",
    "secretMaterialOutput",
    "status",
    "toolchain",
    "vault",
  ], "age vault attestation");
  exactKeys(value.toolchain, [
    "archiveDigest", "binaryDigest", "platform", "sourceUrl", "version",
  ], "age vault attestation toolchain");
  exactKeys(value.vault, [
    "accountDigest",
    "durableCopyCount",
    "keychainReadbackVerified",
    "offProductionHost",
    "provider",
    "rawIdentityFileCreated",
    "serviceDigest",
  ], "age vault attestation vault");
  assert.equal(value.schemaVersion, P0R_AGE_VAULT_SCHEMA_VERSION);
  assert.equal(value.status, "PASS_P0R_AGE_IDENTITY_VAULT");
  assert.equal(value.algorithm, "AGE_X25519");
  assert.equal(value.containsPrivateKey, false);
  assert.equal(value.secretMaterialOutput, false);
  assert.equal(value.productionHostPrivateKeyCopies, 0);
  assert.equal(value.vault.provider, "MACOS_LOGIN_KEYCHAIN");
  assert.equal(value.vault.durableCopyCount, 1);
  assert.equal(value.vault.keychainReadbackVerified, true);
  assert.equal(value.vault.offProductionHost, true);
  assert.equal(value.vault.rawIdentityFileCreated, false);
  assert.equal(value.toolchain.platform, "darwin-arm64");
  assert.equal(value.toolchain.version, P0R_AGE_VERSION);
  assert.equal(value.toolchain.sourceUrl, P0R_AGE_DARWIN_ARM64_ARCHIVE_URL);
  assert.match(value.identityDigest, SHA256_PATTERN);
  assert.match(value.toolchain.archiveDigest, SHA256_PATTERN);
  assert.match(value.toolchain.binaryDigest, SHA256_PATTERN);
  assert.match(value.vault.accountDigest, SHA256_PATTERN);
  assert.match(value.vault.serviceDigest, SHA256_PATTERN);
  const recipient = normalizeAgeRecipient(value.recipient).trim();
  assert.equal(value.recipientDigest, `sha256:${sha256(Buffer.from(`${recipient}\n`))}`);
  const { attestationDigest, ...unsigned } = value;
  assert.equal(
    attestationDigest,
    `sha256:${sha256(Buffer.from(canonicalJson(unsigned)))}`,
    "age vault attestation digest mismatch",
  );
  return value;
}

export function assertDarwinArm64MachO(bytes, label = "binary") {
  assert.ok(Buffer.isBuffer(bytes), `${label} must be bytes`);
  assert.ok(bytes.length >= 32 && bytes.length <= MAXIMUM_BINARY_BYTES, `${label} size is invalid`);
  assert.deepEqual([...bytes.subarray(0, 4)], [0xcf, 0xfa, 0xed, 0xfe], `${label} is not Mach-O 64`);
  assert.equal(bytes.readUInt32LE(4), 0x0100000c, `${label} is not arm64`);
}

async function requireRegular(path, label, maximumBytes) {
  const facts = await lstat(path);
  assert.equal(facts.isSymbolicLink(), false, `${label} must not be a symlink`);
  assert.equal(facts.isFile(), true, `${label} must be a regular file`);
  assert.ok(facts.size > 0 && facts.size <= maximumBytes, `${label} size is invalid`);
  return facts;
}

async function runProcess(path, arguments_, options = {}) {
  const maximumOutputBytes = options.maximumOutputBytes ?? MAXIMUM_SECRET_BYTES;
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(path, arguments_, {
      env: options.env ?? { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectPromise(error);
      else resolvePromise(value);
    };
    const collect = (chunks) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maximumOutputBytes) {
        child.kill("SIGKILL");
        finish(new Error(`${options.label ?? "process"} output exceeded the safety limit`));
        return;
      }
      chunks.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.once("error", (error) => finish(new Error(`${options.label ?? "process"} failed to start: ${error.message}`)));
    child.once("close", (code, signal) => {
      if (code !== 0) {
        finish(new Error(`${options.label ?? "process"} failed with code ${code ?? "null"} signal ${signal ?? "none"}`));
        return;
      }
      finish(null, { stderr: Buffer.concat(stderr), stdout: Buffer.concat(stdout) });
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`${options.label ?? "process"} timed out`));
    }, options.timeoutMs ?? 15_000);
    child.stdin.end(options.input ?? Buffer.alloc(0));
  });
}

export async function loadOfficialAgeDarwinArm64Archive(path) {
  await requireRegular(path, "age archive", MAXIMUM_ARCHIVE_BYTES);
  const archive = await readFile(path);
  assert.equal(
    sha256(archive),
    P0R_AGE_DARWIN_ARM64_ARCHIVE_SHA256,
    "official age darwin/arm64 archive checksum mismatch",
  );
  const extracted = await runProcess("/usr/bin/tar", ["-xOzf", path, "age/age-keygen"], {
    label: "age-keygen extraction",
    maximumOutputBytes: MAXIMUM_BINARY_BYTES,
    timeoutMs: 30_000,
  });
  assert.equal(extracted.stderr.length, 0, "age-keygen extraction emitted diagnostics");
  assertDarwinArm64MachO(extracted.stdout, "official age-keygen binary");
  return Object.freeze({
    archiveDigest: `sha256:${sha256(archive)}`,
    binary: extracted.stdout,
    binaryDigest: `sha256:${sha256(extracted.stdout)}`,
  });
}

function keychainName(value, label) {
  assert.match(value, KEYCHAIN_NAME_PATTERN, `${label} is invalid`);
  return value;
}

async function keychainItemExists(account, service) {
  const result = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(SECURITY_BINARY, [
      "find-generic-password", "-a", account, "-s", service,
    ], { stdio: ["ignore", "ignore", "ignore"] });
    child.once("error", rejectPromise);
    child.once("close", (code) => resolvePromise(code));
  });
  if (result === 0) return true;
  if (result === 44) return false;
  throw new Error(`macOS Keychain lookup failed with code ${result}`);
}

async function addKeychainItem(account, service, identity) {
  const promptInput = Buffer.from(`${identity.trim()}\n${identity.trim()}\n`);
  try {
    await runProcess(SECURITY_BINARY, [
      "add-generic-password",
      "-a", account,
      "-s", service,
      "-D", "Market Radar recovery identity",
      "-j", "Retain until every bound COS object retention period has expired",
      "-l", "Market Radar V2 P0R age recovery identity",
      "-w",
    ], {
      input: promptInput,
      label: "macOS Keychain create",
      maximumOutputBytes: 8 * 1024,
    });
  } finally {
    promptInput.fill(0);
  }
}

async function readKeychainItem(account, service) {
  const result = await runProcess(SECURITY_BINARY, [
    "find-generic-password", "-a", account, "-s", service, "-w",
  ], {
    label: "macOS Keychain readback",
    maximumOutputBytes: MAXIMUM_SECRET_BYTES,
  });
  assert.equal(result.stderr.length, 0, "macOS Keychain readback emitted diagnostics");
  return result.stdout;
}

async function deleteKeychainItem(account, service) {
  await runProcess(SECURITY_BINARY, [
    "delete-generic-password", "-a", account, "-s", service,
  ], {
    label: "macOS Keychain rollback",
    maximumOutputBytes: 8 * 1024,
  });
}

async function deriveRecipient(ageKeygenBinary, identityBuffer) {
  const result = await runProcess(ageKeygenBinary, ["-y"], {
    input: identityBuffer,
    label: "age recipient derivation",
    maximumOutputBytes: MAXIMUM_SECRET_BYTES,
  });
  assert.equal(result.stderr.length, 0, "age recipient derivation emitted diagnostics");
  return normalizeAgeRecipient(result.stdout.toString("utf8"));
}

async function generateIdentity(ageKeygenBinary) {
  const result = await runProcess(ageKeygenBinary, [], {
    label: "age identity generation",
    maximumOutputBytes: MAXIMUM_SECRET_BYTES,
  });
  const combined = Buffer.concat([result.stdout, result.stderr]);
  try {
    return parseAgeKeygenOutput(
      result.stdout.toString("utf8"),
      result.stderr.toString("utf8"),
    );
  } finally {
    combined.fill(0);
    result.stdout.fill(0);
    result.stderr.fill(0);
  }
}

async function writeProtectedPair(recipientOutput, attestationOutput, recipient, attestation) {
  const recipientPath = resolve(recipientOutput);
  const attestationPath = resolve(attestationOutput);
  assert.equal(dirname(recipientPath), dirname(attestationPath), "age outputs must share one protected directory");
  const parent = dirname(recipientPath);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const parentFacts = await lstat(parent);
  assert.equal(parentFacts.isSymbolicLink(), false, "age output directory must not be a symlink");
  assert.equal(parentFacts.isDirectory(), true, "age output parent must be a directory");
  assert.equal(parentFacts.mode & 0o077, 0, "age output directory permissions are too open");
  await assert.rejects(() => stat(recipientPath), { code: "ENOENT" }, "recipient output already exists");
  await assert.rejects(() => stat(attestationPath), { code: "ENOENT" }, "attestation output already exists");
  const nonce = `${process.pid}-${Date.now()}`;
  const temporaryRecipient = `${recipientPath}.${nonce}.tmp`;
  const temporaryAttestation = `${attestationPath}.${nonce}.tmp`;
  try {
    await writeFile(temporaryRecipient, recipient, { flag: "wx", mode: 0o600 });
    await chmod(temporaryRecipient, 0o600);
    await writeFile(temporaryAttestation, `${JSON.stringify(attestation, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await chmod(temporaryAttestation, 0o600);
    await rename(temporaryRecipient, recipientPath);
    await rename(temporaryAttestation, attestationPath);
  } catch (error) {
    await rm(temporaryRecipient, { force: true });
    await rm(temporaryAttestation, { force: true });
    await rm(recipientPath, { force: true });
    await rm(attestationPath, { force: true });
    throw error;
  }
}

export async function provisionP0RAgeIdentityVault(input, dependencies = {}) {
  const account = keychainName(input.keychainAccount, "keychain account");
  const service = keychainName(input.keychainService, "keychain service");
  const runtime = {
    addKeychainItem,
    deleteKeychainItem,
    deriveRecipient,
    generateIdentity,
    keychainItemExists,
    readKeychainItem,
    writeProtectedPair,
    ...dependencies,
  };
  assert.equal(await runtime.keychainItemExists(account, service), false,
    "age recovery identity already exists in macOS Keychain");
  const generated = await runtime.generateIdentity(input.ageKeygenBinary);
  const identity = normalizeAgeIdentity(generated.identity);
  const identityBuffer = Buffer.from(identity);
  let keychainCreated = false;
  try {
    const generatedRecipient = normalizeAgeRecipient(generated.recipient);
    const independentlyDerived = await runtime.deriveRecipient(input.ageKeygenBinary, identityBuffer);
    assert.equal(independentlyDerived, generatedRecipient,
      "generated age identity and recipient do not match");
    await runtime.addKeychainItem(account, service, identity);
    keychainCreated = true;
    const readback = await runtime.readKeychainItem(account, service);
    try {
      const readbackIdentity = normalizeAgeIdentity(readback.toString("utf8"));
      assert.equal(readbackIdentity, identity, "macOS Keychain readback changed the age identity");
      const readbackRecipient = await runtime.deriveRecipient(input.ageKeygenBinary, readback);
      assert.equal(readbackRecipient, generatedRecipient,
        "macOS Keychain readback does not derive the expected recipient");
    } finally {
      readback.fill(0);
    }
    const attestation = buildP0RAgeVaultAttestation({
      archiveDigest: input.archiveDigest,
      binaryDigest: input.binaryDigest,
      generatedAt: input.generatedAt,
      identityDigest: `sha256:${sha256(identityBuffer)}`,
      keychainAccount: account,
      keychainService: service,
      recipient: generatedRecipient,
    });
    validateP0RAgeVaultAttestation(attestation);
    await runtime.writeProtectedPair(
      input.recipientOutput,
      input.attestationOutput,
      generatedRecipient,
      attestation,
    );
    return attestation;
  } catch (error) {
    if (keychainCreated) await runtime.deleteKeychainItem(account, service);
    throw error;
  } finally {
    identityBuffer.fill(0);
  }
}

function parseArguments(argv) {
  assert.equal(argv.length % 2, 0, "arguments must be name/value pairs");
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    assert.match(argv[index], /^--[a-z][a-z0-9-]*$/u, "argument name is invalid");
    const name = argv[index].slice(2);
    assert.equal(options[name], undefined, `duplicate argument ${argv[index]}`);
    options[name] = argv[index + 1];
  }
  return options;
}

async function main() {
  assert.equal(process.platform, "darwin", "age vault provisioning must run on macOS");
  assert.equal(process.arch, "arm64", "age vault provisioning requires darwin/arm64");
  const [command, ...argumentList] = process.argv.slice(2);
  assert.equal(command, "generate", "command must be generate");
  const options = parseArguments(argumentList);
  assert.equal(
    options.confirm,
    "CREATE_V2_M1_P0R_AGE_IDENTITY_IN_MACOS_KEYCHAIN",
    "exact age identity creation confirmation is required",
  );
  for (const required of [
    "age-archive",
    "attestation-output",
    "keychain-account",
    "keychain-service",
    "recipient-output",
  ]) {
    assert.ok(options[required], `--${required} is required`);
  }
  const official = await loadOfficialAgeDarwinArm64Archive(resolve(options["age-archive"]));
  const temporaryRoot = await mkdtemp(join(tmpdir(), "market-radar-v2-p0r-age-vault-"));
  try {
    const ageKeygenBinary = join(temporaryRoot, "age-keygen");
    await writeFile(ageKeygenBinary, official.binary, { flag: "wx", mode: 0o700 });
    await chmod(ageKeygenBinary, 0o700);
    const generatedAt = options.now ?? new Date().toISOString();
    const attestation = await provisionP0RAgeIdentityVault({
      ageKeygenBinary,
      archiveDigest: official.archiveDigest,
      attestationOutput: resolve(options["attestation-output"]),
      binaryDigest: official.binaryDigest,
      generatedAt,
      keychainAccount: options["keychain-account"],
      keychainService: options["keychain-service"],
      recipientOutput: resolve(options["recipient-output"]),
    });
    process.stdout.write(`${JSON.stringify({
      attestationDigest: attestation.attestationDigest,
      containsPrivateKey: false,
      recipientDigest: attestation.recipientDigest,
      status: attestation.status,
    })}\n`);
  } finally {
    official.binary.fill(0);
    await rm(temporaryRoot, { recursive: true, force: true });
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
