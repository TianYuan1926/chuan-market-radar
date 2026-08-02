#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import {
  constants as fsConstants,
} from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { canonicalJson, sha256 } from "./production-dispatch.mjs";

const execFileAsync = promisify(execFile);

export const PRODUCTION_EVIDENCE_SIGNED_SCHEMA =
  "market-radar-production-evidence-signed.v1";
export const PRODUCTION_EVIDENCE_SEALED_SCHEMA =
  "market-radar-production-evidence-sealed.v1";
export const PRODUCTION_EVIDENCE_RECEIPT_SCHEMA =
  "market-radar-production-evidence-retrieval-receipt.v1";
export const PRODUCTION_EVIDENCE_ALGORITHM =
  "X25519_HKDF_SHA256_AES_256_GCM";
export const PRODUCTION_EVIDENCE_SIGNATURE_NAMESPACE =
  "market-radar-production-evidence-v1";
export const PRODUCTION_EVIDENCE_MAX_PAYLOAD_BYTES = 512 * 1024;
export const PRODUCTION_EVIDENCE_MAX_SEALED_BYTES = 1024 * 1024;
export const PRODUCTION_EVIDENCE_MAX_TTL_MS = 24 * 60 * 60 * 1000;
export const PRODUCTION_EVIDENCE_MIN_TTL_MS = 5 * 60 * 1000;
export const PRODUCTION_EVIDENCE_DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;
export const PRODUCTION_EVIDENCE_PRUNE_GRACE_MS = 5 * 60 * 1000;

const DISPATCH_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,180}$/u;
const SCHEMA_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,180}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/u;
const OPENSSH_ED25519 = /^ssh-ed25519 [A-Za-z0-9+/]+={0,3}$/u;
const OBJECT_NAME = /^[a-f0-9]{64}\.mre$/u;
const SENSITIVE_KEY = /(?:^|_)(?:access|api|auth|credential|password|private|secret|session|token)(?:_|$)/iu;
const SENSITIVE_EXACT_KEY = /^(?:accessToken|apiKey|authorization|credential|password|privateKey|secretId|secretKey|sessionToken|tmpSecretKey)$/iu;
const SENSITIVE_VALUE = [
  /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/u,
  /\bAKID[A-Za-z0-9]{13,}\b/u,
  /postgres(?:ql)?:\/\/[^\s:/]+:[^\s@/]+@/iu,
  /(?:redis|rediss|mysql|amqp|amqps):\/\/[^\s:/]*:[^\s@/]+@/iu,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/iu,
  /(?:TmpSecretKey|SecretId|SecretKey|SessionToken|AccessToken)\s*[=:]\s*[^\s,}]+/iu,
];

const SIGNED_KEYS = Object.freeze([
  "dispatchId",
  "expiresAt",
  "payload",
  "payloadSchemaVersion",
  "payloadSha256",
  "schemaVersion",
  "signedAt",
]);
const SIGNED_ENVELOPE_KEYS = Object.freeze([
  "schemaVersion",
  "signature",
  "signerPublicKey",
  "statement",
]);
const SEALED_HEADER_KEYS = Object.freeze([
  "algorithm",
  "dispatchId",
  "ephemeralPublicKey",
  "expiresAt",
  "iv",
  "plaintextSha256",
  "recipientKeySha256",
  "salt",
  "schemaVersion",
  "sealedAt",
]);
const SEALED_KEYS = Object.freeze([
  ...SEALED_HEADER_KEYS,
  "authTag",
  "ciphertext",
]);

export class ProductionEvidenceError extends Error {
  constructor(reason, details = undefined) {
    super(reason);
    this.name = "ProductionEvidenceError";
    this.reason = reason;
    this.details = details;
  }
}

function ensure(condition, reason, details = undefined) {
  if (!condition) throw new ProductionEvidenceError(reason, details);
}

function exactKeys(value, expected, reason) {
  ensure(value && typeof value === "object" && !Array.isArray(value), reason);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  ensure(
    actual.length === wanted.length
      && actual.every((key, index) => key === wanted[index]),
    reason,
    { actual, expected: wanted },
  );
}

function parseTimestamp(value, reason) {
  ensure(typeof value === "string", reason);
  const timestamp = new Date(value);
  ensure(Number.isFinite(timestamp.getTime()) && timestamp.toISOString() === value, reason);
  return timestamp;
}

function parseBase64(value, maximumBytes, reason) {
  ensure(
    typeof value === "string"
      && value.length > 0
      && value.length <= Math.ceil(maximumBytes / 3) * 4 + 4
      && BASE64.test(value),
    reason,
  );
  const bytes = Buffer.from(value, "base64");
  ensure(bytes.length > 0 && bytes.length <= maximumBytes, reason);
  ensure(bytes.toString("base64") === value, reason);
  return bytes;
}

function validateDispatchId(value) {
  ensure(typeof value === "string" && DISPATCH_ID.test(value), "evidence_dispatch_id_invalid");
  return value;
}

function validateSchemaId(value, reason = "evidence_schema_invalid") {
  ensure(typeof value === "string" && SCHEMA_ID.test(value), reason);
  return value;
}

function validateTtl(signedAt, expiresAt) {
  const issued = parseTimestamp(signedAt, "evidence_signed_at_invalid");
  const expiry = parseTimestamp(expiresAt, "evidence_expires_at_invalid");
  const ttl = expiry.getTime() - issued.getTime();
  ensure(
    ttl >= PRODUCTION_EVIDENCE_MIN_TTL_MS && ttl <= PRODUCTION_EVIDENCE_MAX_TTL_MS,
    "evidence_ttl_invalid",
  );
  return { expiry, issued };
}

function validatePayloadSafety(value, path = "$", depth = 0, budget = { nodes: 0 }) {
  ensure(depth <= 32, "evidence_payload_depth_exceeded");
  budget.nodes += 1;
  ensure(budget.nodes <= 20_000, "evidence_payload_node_count_exceeded");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    ensure(Number.isFinite(value), "evidence_payload_number_invalid", path);
    return;
  }
  if (typeof value === "string") {
    ensure(value.length <= 64 * 1024, "evidence_payload_string_too_long", path);
    for (const pattern of SENSITIVE_VALUE) {
      ensure(!pattern.test(value), "evidence_payload_sensitive_value", path);
    }
    return;
  }
  if (Array.isArray(value)) {
    ensure(value.length <= 10_000, "evidence_payload_array_too_large", path);
    value.forEach((entry, index) => validatePayloadSafety(entry, `${path}[${index}]`, depth + 1, budget));
    return;
  }
  ensure(typeof value === "object", "evidence_payload_type_invalid", path);
  const keys = Object.keys(value);
  ensure(keys.length <= 2_000, "evidence_payload_object_too_large", path);
  for (const key of keys) {
    ensure(
      key.length > 0
        && key.length <= 180
        && !SENSITIVE_KEY.test(key)
        && !SENSITIVE_EXACT_KEY.test(key),
      "evidence_payload_sensitive_or_invalid_key",
      `${path}.${key}`,
    );
    validatePayloadSafety(value[key], `${path}.${key}`, depth + 1, budget);
  }
}

function validatedPayload(payload, { dispatchId, expectedSchemaVersion }) {
  ensure(payload && typeof payload === "object" && !Array.isArray(payload),
    "evidence_payload_not_object");
  validatePayloadSafety(payload);
  ensure(payload.dispatchId === dispatchId, "evidence_payload_dispatch_mismatch");
  ensure(payload.schemaVersion === expectedSchemaVersion, "evidence_payload_schema_mismatch");
  const bytes = Buffer.from(canonicalJson(payload));
  ensure(
    bytes.length > 0 && bytes.length <= PRODUCTION_EVIDENCE_MAX_PAYLOAD_BYTES,
    "evidence_payload_size_invalid",
  );
  return bytes;
}

function x25519PublicKeyFingerprint(publicKey) {
  const key = publicKey?.type === "public" ? publicKey : createPublicKey(publicKey);
  ensure(key.asymmetricKeyType === "x25519", "evidence_recipient_public_key_invalid");
  return sha256(key.export({ format: "der", type: "spki" }));
}

function x25519PrivateKey(privateKey) {
  const key = createPrivateKey(privateKey);
  ensure(key.asymmetricKeyType === "x25519", "evidence_recipient_private_key_invalid");
  return key;
}

function x25519PublicKey(publicKey) {
  const key = createPublicKey(publicKey);
  ensure(key.asymmetricKeyType === "x25519", "evidence_recipient_public_key_invalid");
  return key;
}

function normalizedOpenSshEd25519(value) {
  ensure(typeof value === "string", "evidence_signer_public_key_invalid");
  const fields = value.trim().split(/\s+/u);
  ensure(fields.length >= 2, "evidence_signer_public_key_invalid");
  const normalized = `${fields[0]} ${fields[1]}`;
  ensure(OPENSSH_ED25519.test(normalized), "evidence_signer_public_key_invalid");
  return normalized;
}

async function readBoundedNoFollow(path, maximumBytes, reason, {
  requiredMode = undefined,
  returnFacts = false,
} = {}) {
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const before = await handle.stat();
    ensure(before.isFile() && before.size > 0 && before.size <= maximumBytes, reason);
    if (requiredMode !== undefined) {
      ensure((before.mode & 0o777) === requiredMode, reason);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    ensure(
      bytes.length > 0
        && bytes.length <= maximumBytes
        && before.dev === after.dev
        && before.ino === after.ino
        && before.size === after.size
        && before.mtimeMs === after.mtimeMs,
      reason,
    );
    const facts = {
      dev: after.dev,
      ino: after.ino,
      mode: after.mode,
      mtimeMs: after.mtimeMs,
      size: after.size,
    };
    return returnFacts ? { bytes, facts } : bytes;
  } catch (error) {
    if (error instanceof ProductionEvidenceError) throw error;
    throw new ProductionEvidenceError(reason, {
      code: typeof error?.code === "string" ? error.code.slice(0, 40) : null,
    });
  } finally {
    if (handle) await handle.close();
  }
}

async function ensurePrivateKeyOutsideWorktree(path) {
  const privatePath = resolve(path);
  const cwd = `${resolve(process.cwd())}${sep}`;
  ensure(
    privatePath !== resolve(process.cwd()) && !privatePath.startsWith(cwd),
    "evidence_private_key_inside_worktree",
  );
}

export async function generateEvidenceRecipientKeyPair({ privateKeyPath, publicKeyPath }) {
  ensure(isAbsolute(privateKeyPath) && isAbsolute(publicKeyPath), "evidence_key_path_not_absolute");
  await ensurePrivateKeyOutsideWorktree(privateKeyPath);
  await mkdir(dirname(privateKeyPath), { recursive: true, mode: 0o700 });
  await mkdir(dirname(publicKeyPath), { recursive: true, mode: 0o700 });
  const { privateKey, publicKey } = generateKeyPairSync("x25519", {
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" },
  });
  let privateCreated = false;
  let publicCreated = false;
  try {
    await writeFile(privateKeyPath, privateKey, { flag: "wx", mode: 0o600 });
    privateCreated = true;
    await writeFile(publicKeyPath, publicKey, { flag: "wx", mode: 0o644 });
    publicCreated = true;
  } catch (error) {
    if (privateCreated) await rm(privateKeyPath, { force: true });
    if (publicCreated) await rm(publicKeyPath, { force: true });
    if (error?.code === "EEXIST") {
      throw new ProductionEvidenceError("evidence_key_path_already_exists");
    }
    throw error;
  }
  return {
    privateKeyPath,
    publicKeyPath,
    publicKeySha256: x25519PublicKeyFingerprint(publicKey),
    status: "PASS_PRODUCTION_EVIDENCE_RECIPIENT_KEY_GENERATED",
  };
}

function spawnWithInput(command, args, input, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    const maximumOutputBytes = options.maximumOutputBytes ?? 128 * 1024;
    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes <= maximumOutputBytes) stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes <= maximumOutputBytes) stderr.push(chunk);
    });
    child.on("error", rejectPromise);
    child.on("close", (exitCode) => {
      if (outputBytes > maximumOutputBytes) {
        rejectPromise(new ProductionEvidenceError("evidence_signer_output_too_large"));
        return;
      }
      const result = {
        exitCode,
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8"),
      };
      if (exitCode === 0) resolvePromise(result);
      else rejectPromise(Object.assign(new Error("child_failed"), result));
    });
    child.stdin.end(input);
  });
}

export async function signEvidenceStatementWithSshKey(statementBytes, {
  keyPath,
  sshKeygenPath = "/usr/bin/ssh-keygen",
  sudoPath = "/usr/bin/sudo",
  useSudo = true,
} = {}) {
  ensure(Buffer.isBuffer(statementBytes) && statementBytes.length > 0,
    "evidence_statement_invalid");
  ensure(typeof keyPath === "string" && isAbsolute(keyPath), "evidence_signing_key_path_invalid");
  const root = await mkdtemp(join(tmpdir(), "market-radar-evidence-sign-"));
  const statementPath = join(root, "statement.json");
  try {
    await chmod(root, 0o700);
    await writeFile(statementPath, statementBytes, { flag: "wx", mode: 0o600 });
    const prefix = useSudo ? ["-n", sshKeygenPath] : [];
    const command = useSudo ? sudoPath : sshKeygenPath;
    await execFileAsync(command, [
      ...prefix,
      "-Y", "sign",
      "-f", keyPath,
      "-n", PRODUCTION_EVIDENCE_SIGNATURE_NAMESPACE,
      statementPath,
    ], { encoding: "utf8", maxBuffer: 128 * 1024, timeout: 30_000 });
    const signature = await readBoundedNoFollow(
      `${statementPath}.sig`,
      32 * 1024,
      "evidence_signature_output_invalid",
    );
    const { stdout: publicKeyRaw } = await execFileAsync(command, [
      ...prefix,
      "-y",
      "-f", keyPath,
    ], { encoding: "utf8", maxBuffer: 32 * 1024, timeout: 30_000 });
    return {
      signature,
      signerPublicKey: normalizedOpenSshEd25519(publicKeyRaw),
    };
  } catch (error) {
    if (error instanceof ProductionEvidenceError) throw error;
    throw new ProductionEvidenceError("evidence_ssh_signature_failed", {
      exitCode: Number.isInteger(error?.code) ? error.code : null,
      stderrSha256: sha256(String(error?.stderr ?? "")),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function verifyEvidenceSshSignature(statementBytes, signatureBytes, {
  signerIdentity = "market-radar-production-host",
  signerPublicKey,
  sshKeygenPath = "/usr/bin/ssh-keygen",
} = {}) {
  ensure(Buffer.isBuffer(statementBytes) && statementBytes.length > 0,
    "evidence_statement_invalid");
  ensure(Buffer.isBuffer(signatureBytes) && signatureBytes.length > 0,
    "evidence_signature_invalid");
  ensure(/^[A-Za-z0-9._@+-]{3,120}$/u.test(signerIdentity), "evidence_signer_identity_invalid");
  const normalizedKey = normalizedOpenSshEd25519(signerPublicKey);
  const root = await mkdtemp(join(tmpdir(), "market-radar-evidence-verify-"));
  try {
    await chmod(root, 0o700);
    const allowedSignersPath = join(root, "allowed-signers");
    const signaturePath = join(root, "statement.sig");
    await writeFile(allowedSignersPath, `${signerIdentity} ${normalizedKey}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await writeFile(signaturePath, signatureBytes, { flag: "wx", mode: 0o600 });
    await spawnWithInput(sshKeygenPath, [
      "-Y", "verify",
      "-f", allowedSignersPath,
      "-I", signerIdentity,
      "-n", PRODUCTION_EVIDENCE_SIGNATURE_NAMESPACE,
      "-s", signaturePath,
    ], statementBytes, { timeout: 30_000 });
    return true;
  } catch (error) {
    if (error instanceof ProductionEvidenceError) throw error;
    throw new ProductionEvidenceError("evidence_ssh_signature_invalid", {
      exitCode: Number.isInteger(error?.exitCode) ? error.exitCode : null,
      stderrSha256: sha256(String(error?.stderr ?? "")),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function evidenceKdfInfo(dispatchId, recipientKeySha256) {
  return Buffer.from([
    PRODUCTION_EVIDENCE_SEALED_SCHEMA,
    PRODUCTION_EVIDENCE_ALGORITHM,
    dispatchId,
    recipientKeySha256,
  ].join("\0"));
}

function encryptedHeader(sealed) {
  return Object.fromEntries(SEALED_HEADER_KEYS.map((key) => [key, sealed[key]]));
}

function validateSignedStatement(statement, {
  dispatchId,
  expectedSchemaVersion,
  now,
}) {
  exactKeys(statement, SIGNED_KEYS, "evidence_signed_statement_keys_invalid");
  ensure(statement.schemaVersion === PRODUCTION_EVIDENCE_SIGNED_SCHEMA,
    "evidence_signed_statement_schema_invalid");
  ensure(statement.dispatchId === dispatchId, "evidence_signed_statement_dispatch_mismatch");
  ensure(statement.payloadSchemaVersion === expectedSchemaVersion,
    "evidence_signed_statement_payload_schema_mismatch");
  ensure(SHA256.test(statement.payloadSha256), "evidence_signed_statement_payload_hash_invalid");
  const { expiry, issued } = validateTtl(statement.signedAt, statement.expiresAt);
  ensure(now >= issued && now <= expiry, "evidence_signed_statement_not_current");
  const payloadBytes = validatedPayload(statement.payload, {
    dispatchId,
    expectedSchemaVersion,
  });
  ensure(sha256(payloadBytes) === statement.payloadSha256,
    "evidence_signed_statement_payload_hash_mismatch");
  return payloadBytes;
}

function validateSealedEnvelope(sealed, { dispatchId, now }) {
  exactKeys(sealed, SEALED_KEYS, "evidence_sealed_envelope_keys_invalid");
  ensure(sealed.schemaVersion === PRODUCTION_EVIDENCE_SEALED_SCHEMA,
    "evidence_sealed_envelope_schema_invalid");
  ensure(sealed.algorithm === PRODUCTION_EVIDENCE_ALGORITHM,
    "evidence_sealed_algorithm_invalid");
  ensure(sealed.dispatchId === dispatchId, "evidence_sealed_dispatch_mismatch");
  ensure(SHA256.test(sealed.recipientKeySha256), "evidence_sealed_recipient_hash_invalid");
  ensure(SHA256.test(sealed.plaintextSha256), "evidence_sealed_plaintext_hash_invalid");
  const sealedAt = parseTimestamp(sealed.sealedAt, "evidence_sealed_at_invalid");
  const expiresAt = parseTimestamp(sealed.expiresAt, "evidence_sealed_expires_at_invalid");
  ensure(
    expiresAt > sealedAt
      && expiresAt.getTime() - sealedAt.getTime() >= PRODUCTION_EVIDENCE_MIN_TTL_MS
      && expiresAt.getTime() - sealedAt.getTime() <= PRODUCTION_EVIDENCE_MAX_TTL_MS,
    "evidence_sealed_ttl_invalid",
  );
  ensure(now >= sealedAt && now <= expiresAt, "evidence_sealed_not_current");
  const ephemeralPublicKey = parseBase64(
    sealed.ephemeralPublicKey,
    256,
    "evidence_ephemeral_public_key_invalid",
  );
  const salt = parseBase64(sealed.salt, 64, "evidence_salt_invalid");
  const iv = parseBase64(sealed.iv, 32, "evidence_iv_invalid");
  const authTag = parseBase64(sealed.authTag, 32, "evidence_auth_tag_invalid");
  const ciphertext = parseBase64(
    sealed.ciphertext,
    PRODUCTION_EVIDENCE_MAX_SEALED_BYTES,
    "evidence_ciphertext_invalid",
  );
  ensure(salt.length === 32, "evidence_salt_invalid");
  ensure(iv.length === 12, "evidence_iv_invalid");
  ensure(authTag.length === 16, "evidence_auth_tag_invalid");
  return { authTag, ciphertext, ephemeralPublicKey, iv, salt };
}

export function evidenceObjectName(dispatchId) {
  validateDispatchId(dispatchId);
  return `${sha256(`${PRODUCTION_EVIDENCE_SEALED_SCHEMA}\0${dispatchId}`)}.mre`;
}

export async function sealProductionEvidence({
  dispatchId,
  expectedSchemaVersion,
  expiresAt,
  now = new Date(),
  payload,
  recipientPublicKey,
  signer = signEvidenceStatementWithSshKey,
  signerOptions = {},
}) {
  validateDispatchId(dispatchId);
  validateSchemaId(expectedSchemaVersion, "evidence_expected_schema_invalid");
  const signedAt = now.toISOString();
  const expiry = parseTimestamp(expiresAt, "evidence_expires_at_invalid");
  ensure(now <= expiry, "evidence_expired_before_seal");
  validateTtl(signedAt, expiresAt);
  const payloadBytes = validatedPayload(payload, { dispatchId, expectedSchemaVersion });
  const statement = {
    dispatchId,
    expiresAt,
    payload,
    payloadSchemaVersion: expectedSchemaVersion,
    payloadSha256: sha256(payloadBytes),
    schemaVersion: PRODUCTION_EVIDENCE_SIGNED_SCHEMA,
    signedAt,
  };
  const statementBytes = Buffer.from(canonicalJson(statement));
  const { signature, signerPublicKey } = await signer(statementBytes, signerOptions);
  const signedEnvelope = {
    schemaVersion: PRODUCTION_EVIDENCE_SIGNED_SCHEMA,
    signature: Buffer.from(signature).toString("base64"),
    signerPublicKey: normalizedOpenSshEd25519(signerPublicKey),
    statement,
  };
  const plaintext = Buffer.from(canonicalJson(signedEnvelope));
  ensure(plaintext.length <= PRODUCTION_EVIDENCE_MAX_SEALED_BYTES,
    "evidence_signed_envelope_too_large");

  const recipientKey = x25519PublicKey(recipientPublicKey);
  const recipientKeySha256 = x25519PublicKeyFingerprint(recipientPublicKey);
  const ephemeral = generateKeyPairSync("x25519");
  const sharedSecret = diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: recipientKey,
  });
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = Buffer.from(hkdfSync(
    "sha256",
    sharedSecret,
    salt,
    evidenceKdfInfo(dispatchId, recipientKeySha256),
    32,
  ));
  const header = {
    algorithm: PRODUCTION_EVIDENCE_ALGORITHM,
    dispatchId,
    ephemeralPublicKey: ephemeral.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    expiresAt,
    iv: iv.toString("base64"),
    plaintextSha256: sha256(plaintext),
    recipientKeySha256,
    salt: salt.toString("base64"),
    schemaVersion: PRODUCTION_EVIDENCE_SEALED_SCHEMA,
    sealedAt: signedAt,
  };
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(canonicalJson(header)));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const sealed = {
    ...header,
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  validateSealedEnvelope(sealed, { dispatchId, now });
  return sealed;
}

export async function openProductionEvidence({
  dispatchId,
  expectedSchemaVersion,
  now = new Date(),
  recipientPrivateKey,
  sealed,
  signerIdentity = "market-radar-production-host",
  trustedSignerPublicKey,
  verifier = verifyEvidenceSshSignature,
  verifierOptions = {},
}) {
  validateDispatchId(dispatchId);
  validateSchemaId(expectedSchemaVersion, "evidence_expected_schema_invalid");
  const decoded = validateSealedEnvelope(sealed, { dispatchId, now });
  const privateKey = x25519PrivateKey(recipientPrivateKey);
  const publicKey = createPublicKey(privateKey);
  ensure(
    x25519PublicKeyFingerprint(publicKey) === sealed.recipientKeySha256,
    "evidence_recipient_key_mismatch",
  );
  let ephemeralPublicKey;
  try {
    ephemeralPublicKey = createPublicKey({
      format: "der",
      key: decoded.ephemeralPublicKey,
      type: "spki",
    });
  } catch {
    throw new ProductionEvidenceError("evidence_ephemeral_public_key_invalid");
  }
  ensure(ephemeralPublicKey.asymmetricKeyType === "x25519",
    "evidence_ephemeral_public_key_invalid");
  const sharedSecret = diffieHellman({
    privateKey,
    publicKey: ephemeralPublicKey,
  });
  const key = Buffer.from(hkdfSync(
    "sha256",
    sharedSecret,
    decoded.salt,
    evidenceKdfInfo(dispatchId, sealed.recipientKeySha256),
    32,
  ));
  let plaintext;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, decoded.iv);
    decipher.setAAD(Buffer.from(canonicalJson(encryptedHeader(sealed))));
    decipher.setAuthTag(decoded.authTag);
    plaintext = Buffer.concat([decipher.update(decoded.ciphertext), decipher.final()]);
  } catch {
    throw new ProductionEvidenceError("evidence_decryption_or_authentication_failed");
  }
  ensure(
    plaintext.length > 0
      && plaintext.length <= PRODUCTION_EVIDENCE_MAX_SEALED_BYTES
      && sha256(plaintext) === sealed.plaintextSha256,
    "evidence_plaintext_hash_mismatch",
  );
  let signedEnvelope;
  try {
    signedEnvelope = JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new ProductionEvidenceError("evidence_signed_envelope_invalid");
  }
  exactKeys(signedEnvelope, SIGNED_ENVELOPE_KEYS, "evidence_signed_envelope_keys_invalid");
  ensure(signedEnvelope.schemaVersion === PRODUCTION_EVIDENCE_SIGNED_SCHEMA,
    "evidence_signed_envelope_schema_invalid");
  const trustedKey = normalizedOpenSshEd25519(trustedSignerPublicKey);
  ensure(
    normalizedOpenSshEd25519(signedEnvelope.signerPublicKey) === trustedKey,
    "evidence_signer_public_key_mismatch",
  );
  validateSignedStatement(signedEnvelope.statement, {
    dispatchId,
    expectedSchemaVersion,
    now,
  });
  ensure(
    signedEnvelope.statement.signedAt === sealed.sealedAt
      && signedEnvelope.statement.expiresAt === sealed.expiresAt,
    "evidence_signed_and_sealed_time_mismatch",
  );
  const statementBytes = Buffer.from(canonicalJson(signedEnvelope.statement));
  const signatureBytes = parseBase64(
    signedEnvelope.signature,
    32 * 1024,
    "evidence_signature_invalid",
  );
  await verifier(statementBytes, signatureBytes, {
    signerIdentity,
    signerPublicKey: trustedKey,
    ...verifierOptions,
  });
  return {
    dispatchId,
    expiresAt: signedEnvelope.statement.expiresAt,
    payload: signedEnvelope.statement.payload,
    payloadSha256: signedEnvelope.statement.payloadSha256,
    retrievedAt: now.toISOString(),
    schemaVersion: PRODUCTION_EVIDENCE_RECEIPT_SCHEMA,
    sealedSha256: sha256(canonicalJson(sealed)),
    signerPublicKey: trustedKey,
    status: "PASS_PRODUCTION_EVIDENCE_DECRYPTED_AND_VERIFIED",
  };
}

async function ensureSafeOutboxRoot(root) {
  ensure(typeof root === "string" && isAbsolute(root), "evidence_outbox_root_invalid");
  await mkdir(root, { recursive: true, mode: 0o755 });
  const facts = await lstat(root);
  ensure(
    facts.isDirectory()
      && !facts.isSymbolicLink()
      && await realpath(root) === resolve(root),
    "evidence_outbox_root_unsafe",
  );
  return resolve(root);
}

export async function publishSealedEvidence({ outboxRoot, sealed }) {
  validateDispatchId(sealed?.dispatchId);
  validateSealedEnvelope(sealed, { dispatchId: sealed.dispatchId, now: new Date(sealed.sealedAt) });
  const root = await ensureSafeOutboxRoot(outboxRoot);
  const name = evidenceObjectName(sealed.dispatchId);
  const destination = join(root, name);
  const rel = relative(root, destination);
  ensure(rel === name && !rel.startsWith(`..${sep}`), "evidence_outbox_path_escape");
  const temporary = join(root, `.${name}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  const bytes = Buffer.from(canonicalJson(sealed));
  ensure(bytes.length <= PRODUCTION_EVIDENCE_MAX_SEALED_BYTES,
    "evidence_sealed_output_too_large");
  await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
  try {
    await link(temporary, destination);
    await chmod(destination, 0o644);
    await unlink(temporary);
    const directory = await open(root, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    await unlink(temporary).catch(() => {});
    if (error?.code === "EEXIST") {
      throw new ProductionEvidenceError("evidence_outbox_object_already_exists");
    }
    throw error;
  } finally {
    await unlink(temporary).catch(() => {});
  }
  return {
    bytes: bytes.length,
    dispatchId: sealed.dispatchId,
    expiresAt: sealed.expiresAt,
    objectName: name,
    objectSha256: sha256(bytes),
    status: "PASS_PRODUCTION_EVIDENCE_CIPHERTEXT_PUBLISHED",
  };
}

async function defaultExpiryScheduler(command, args) {
  try {
    await execFileAsync(command, args, {
      encoding: "utf8",
      maxBuffer: 64 * 1024,
      timeout: 15_000,
    });
  } catch (error) {
    throw new ProductionEvidenceError("evidence_expiry_schedule_failed", {
      exitCode: Number.isInteger(error?.code) ? error.code : null,
      stderrSha256: sha256(String(error?.stderr ?? "")),
    });
  }
}

export async function scheduleProductionEvidenceExpiry({
  dispatchId,
  expiresAt,
  graceMs = PRODUCTION_EVIDENCE_PRUNE_GRACE_MS,
  now = new Date(),
  outboxRoot,
  scheduler = defaultExpiryScheduler,
}) {
  validateDispatchId(dispatchId);
  ensure(now instanceof Date && Number.isFinite(now.getTime()),
    "evidence_expiry_schedule_time_invalid");
  ensure(Number.isSafeInteger(graceMs) && graceMs >= 0 && graceMs <= 60 * 60 * 1000,
    "evidence_expiry_schedule_grace_invalid");
  const expiry = parseTimestamp(expiresAt, "evidence_expiry_schedule_time_invalid");
  const delayMs = expiry.getTime() - now.getTime() + graceMs;
  ensure(
    delayMs >= PRODUCTION_EVIDENCE_MIN_TTL_MS
      && delayMs <= PRODUCTION_EVIDENCE_MAX_TTL_MS + 60 * 60 * 1000,
    "evidence_expiry_schedule_delay_invalid",
  );
  const root = await ensureSafeOutboxRoot(outboxRoot);
  const objectName = evidenceObjectName(dispatchId);
  const objectPath = join(root, objectName);
  ensure(
    relative(root, objectPath) === objectName,
    "evidence_expiry_schedule_path_invalid",
  );
  const unitName = `market-radar-production-evidence-prune-${sha256(dispatchId).slice(0, 20)}`;
  const delaySeconds = Math.max(1, Math.ceil(delayMs / 1000));
  const args = [
    "-n",
    "--",
    "/usr/bin/systemd-run",
    "--quiet",
    "--collect",
    `--unit=${unitName}`,
    `--on-active=${delaySeconds}s`,
    "--timer-property=AccuracySec=1s",
    "--property=Type=oneshot",
    "--property=User=ubuntu",
    "--property=Group=ubuntu",
    "--property=UMask=0077",
    "--property=NoNewPrivileges=yes",
    "--property=ProtectSystem=strict",
    "--property=ProtectHome=yes",
    "--property=PrivateTmp=yes",
    "--property=PrivateDevices=yes",
    `--property=ReadWritePaths=${root}`,
    "--property=RestrictAddressFamilies=AF_UNIX",
    "/usr/bin/rm",
    "-f",
    "--",
    objectPath,
  ];
  await scheduler("/usr/bin/sudo", args);
  return {
    delaySeconds,
    dispatchId,
    objectName,
    scheduledDeletionNotBefore: new Date(
      now.getTime() + delaySeconds * 1000,
    ).toISOString(),
    status: "PASS_PRODUCTION_EVIDENCE_EXPIRY_SCHEDULED",
    unitName,
  };
}

export async function readSealedEvidenceFile(path, { returnFacts = false } = {}) {
  const read = await readBoundedNoFollow(
    path,
    PRODUCTION_EVIDENCE_MAX_SEALED_BYTES,
    "evidence_sealed_file_invalid",
    { returnFacts },
  );
  const bytes = returnFacts ? read.bytes : read;
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new ProductionEvidenceError("evidence_sealed_file_invalid");
  }
  ensure(canonicalJson(value) === bytes.toString("utf8"), "evidence_sealed_file_not_canonical");
  return returnFacts ? { facts: read.facts, value } : value;
}

export async function pruneProductionEvidenceOutbox({
  graceMs = 5 * 60 * 1000,
  now = new Date(),
  outboxRoot,
}) {
  ensure(Number.isSafeInteger(graceMs) && graceMs >= 0 && graceMs <= 60 * 60 * 1000,
    "evidence_prune_grace_invalid");
  const root = await ensureSafeOutboxRoot(outboxRoot);
  const entries = await readdir(root, { withFileTypes: true });
  const removed = [];
  const retained = [];
  const unsafe = [];
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || !OBJECT_NAME.test(entry.name)) {
      unsafe.push(entry.name);
      continue;
    }
    const path = join(root, entry.name);
    try {
      const { facts, value: sealed } = await readSealedEvidenceFile(path, { returnFacts: true });
      ensure(evidenceObjectName(sealed.dispatchId) === entry.name,
        "evidence_prune_object_name_mismatch");
      const expiry = parseTimestamp(sealed.expiresAt, "evidence_prune_expiry_invalid");
      candidates.push({ entry, expiry, facts, path });
    } catch {
      unsafe.push(entry.name);
    }
  }
  ensure(unsafe.length === 0, "evidence_prune_unsafe_entry", { unsafe: unsafe.sort() });
  for (const candidate of candidates.sort((left, right) => left.entry.name.localeCompare(right.entry.name))) {
    if (now.getTime() <= candidate.expiry.getTime() + graceMs) {
      retained.push(candidate.entry.name);
      continue;
    }
    const current = await lstat(candidate.path);
    ensure(
      current.isFile()
        && !current.isSymbolicLink()
        && current.dev === candidate.facts.dev
        && current.ino === candidate.facts.ino
        && current.size === candidate.facts.size
        && current.mtimeMs === candidate.facts.mtimeMs,
      "evidence_prune_path_identity_changed",
    );
    await unlink(candidate.path);
    removed.push(candidate.entry.name);
  }
  return {
    removed: removed.sort(),
    retained: retained.sort(),
    status: "PASS_PRODUCTION_EVIDENCE_OUTBOX_PRUNED",
  };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    ensure(key?.startsWith("--") && value !== undefined && !value.startsWith("--"),
      "evidence_argument_invalid");
    options[key.slice(2)] = value;
  }
  return { command, options };
}

function requiredOption(options, name) {
  ensure(typeof options[name] === "string" && options[name].length > 0,
    `evidence_option_missing:${name}`);
  return options[name];
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  let result;
  if (command === "keygen") {
    result = await generateEvidenceRecipientKeyPair({
      privateKeyPath: requiredOption(options, "private-key"),
      publicKeyPath: requiredOption(options, "public-key"),
    });
  } else if (command === "prune") {
    result = await pruneProductionEvidenceOutbox({
      outboxRoot: requiredOption(options, "outbox-root"),
    });
  } else {
    throw new ProductionEvidenceError("evidence_command_invalid");
  }
  process.stdout.write(canonicalJson(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(canonicalJson({
      details: error instanceof ProductionEvidenceError ? error.details : undefined,
      reason: error instanceof ProductionEvidenceError ? error.reason : "unexpected_error",
      status: "BLOCKED",
    }));
    process.exitCode = 1;
  });
}
