#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import {
  constants as fsConstants,
  createReadStream,
} from "node:fs";
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

export const DISPATCH_SCHEMA = "market-radar-production-dispatch.v1";
export const AGENT_CONFIG_SCHEMA = "market-radar-production-dispatch-agent-config.v1";
export const AGENT_STATE_SCHEMA = "market-radar-production-dispatch-agent-state.v1";
export const MAX_APPROVAL_WINDOW_MS = 90 * 60 * 1000;
export const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;
export const MAX_UNCOMPRESSED_BUNDLE_BYTES = 128 * 1024 * 1024;
export const MAX_RUNTIME_SECONDS = 90 * 60;
export const DISPATCH_FILES = Object.freeze([
  "approval-request.json",
  "bundle.tar.gz",
  "dispatch.json",
  "dispatch.sig",
]);

const ENVELOPE_KEYS = Object.freeze([
  "approvalRequestPath",
  "approvalRequestSha256",
  "automaticRollbackRequired",
  "bundleBytes",
  "bundleSha256",
  "dispatchId",
  "entrypointPath",
  "entrypointSha256",
  "expiresAt",
  "issuedAt",
  "launchSuccessMarker",
  "maxExecutions",
  "noArbitraryCommand",
  "packageId",
  "productionMutation",
  "productionWipLimit",
  "revocationEpoch",
  "runnerUnitName",
  "runtimeMaxSeconds",
  "schemaVersion",
  "sessionIndependentExecutionRequired",
  "sourceRef",
  "stagingDirectory",
  "targetCommit",
  "transportContainsSecrets",
  "transportMethod",
]);

const CONFIG_KEYS = Object.freeze([
  "dispatchRef",
  "dispatchTrackingRef",
  "mirrorPath",
  "publicKeyPath",
  "remoteUrl",
  "schemaVersion",
  "sourceRefs",
  "stagingRoots",
  "stateRoot",
  "trustRoot",
]);

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,180}$/u;
const SAFE_PACKAGE_ID = /^[A-Z0-9][A-Z0-9._-]{5,180}$/u;
const SAFE_UNIT = /^market-radar-[a-z0-9][a-z0-9-]{7,56}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const SOURCE_REF = /^refs\/heads\/(?:main|codex\/[a-z0-9][a-z0-9._/-]{2,180})$/u;
const DISPATCH_REF = /^refs\/heads\/[a-z0-9][a-z0-9._/-]{2,180}$/u;
const TRACKING_REF = /^refs\/market-radar-dispatch\/[a-z0-9][a-z0-9._/-]{2,180}$/u;
const ENTRYPOINT = /^scripts\/(?:production\/(?:[a-z0-9][a-z0-9-]*\/production-entrypoint|[a-z0-9][a-z0-9-]*-entrypoint)|v2\/production\/[a-z0-9][a-z0-9-]*-entrypoint)\.sh$/u;
const SUCCESS_MARKER = /^[A-Z][A-Z0-9_]{7,120}$/u;
const FORBIDDEN_ARCHIVE_PATH = /(?:^|\/)(?:\.env(?:\..*)?|id_(?:rsa|ed25519)|[^/]+\.(?:key|pem|p12|pfx)|credentials?(?:\..*)?|secrets?(?:\..*)?)(?:\/|$)/iu;
const SENSITIVE_CONTENT = [
  /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/u,
  /\bAKID[A-Za-z0-9]{13,}\b/u,
  /postgres(?:ql)?:\/\/[^\s:/]+:[^\s@/]+@/iu,
  /"(?:AccessToken|PrivateKey|Password|SecretId|SecretKey|SessionToken|TmpSecretKey|TmpToken|Token)"\s*:\s*"(?!REDACTED|<[^>]+>|\*{3})[^"\s][^"]*"/iu,
];

export class DispatchPolicyError extends Error {
  constructor(reason, details = undefined) {
    super(reason);
    this.name = "DispatchPolicyError";
    this.reason = reason;
    this.details = details;
  }
}

function ensure(condition, reason, details = undefined) {
  if (!condition) throw new DispatchPolicyError(reason, details);
}

function exactKeys(value, expected, reason) {
  ensure(value && typeof value === "object" && !Array.isArray(value), reason);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  ensure(
    actual.length === wanted.length && actual.every((key, index) => key === wanted[index]),
    reason,
    { actual, expected: wanted },
  );
}

function sortedValue(value) {
  if (Array.isArray(value)) return value.map(sortedValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sortedValue(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(sortedValue(value))}\n`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function parseTimestamp(value, reason) {
  const timestamp = new Date(value);
  ensure(Number.isFinite(timestamp.getTime()), reason);
  ensure(timestamp.toISOString() === value, reason);
  return timestamp;
}

function safeRelativePath(value, reason) {
  ensure(typeof value === "string" && value.length > 0 && value.length <= 300, reason);
  ensure(!isAbsolute(value) && !value.includes("\\") && !value.includes("\0"), reason);
  ensure(/^[A-Za-z0-9._/-]+$/u.test(value), reason);
  const components = value.replace(/^\.\//u, "").split("/");
  ensure(components.every((component) => component && component !== "." && component !== ".."), reason);
  return components.join("/");
}

function validateSourceRef(value, allowlist = undefined) {
  ensure(typeof value === "string" && SOURCE_REF.test(value), "dispatch_source_ref_invalid");
  ensure(!value.includes("..") && !value.includes("//") && !value.endsWith("/"), "dispatch_source_ref_invalid");
  if (allowlist) ensure(allowlist.includes(value), "dispatch_source_ref_not_allowed");
  return value;
}

function validateStagingDirectory(value, roots) {
  ensure(typeof value === "string" && isAbsolute(value), "dispatch_staging_directory_invalid");
  ensure(!value.includes("..") && !value.includes("\0"), "dispatch_staging_directory_invalid");
  const normalized = resolve(value);
  const matchingRoot = roots.find((root) => dirname(normalized) === resolve(root));
  ensure(matchingRoot, "dispatch_staging_directory_outside_allowed_roots");
  ensure(/^[a-z0-9][a-z0-9._-]{10,180}$/u.test(basename(normalized)), "dispatch_staging_basename_invalid");
  return normalized;
}

export function validateEnvelope(envelope, {
  now = new Date(),
  sourceRefs = undefined,
  stagingRoots = [
    "/home/ubuntu/.cache/market-radar-ops",
    "/home/ubuntu/.cache/market-radar-v2",
  ],
} = {}) {
  exactKeys(envelope, ENVELOPE_KEYS, "dispatch_envelope_keys_invalid");
  ensure(envelope.schemaVersion === DISPATCH_SCHEMA, "dispatch_schema_invalid");
  ensure(SAFE_ID.test(envelope.dispatchId), "dispatch_id_invalid");
  ensure(SAFE_PACKAGE_ID.test(envelope.packageId), "dispatch_package_id_invalid");
  ensure(COMMIT.test(envelope.targetCommit), "dispatch_target_commit_invalid");
  validateSourceRef(envelope.sourceRef, sourceRefs);
  ensure(SHA256.test(envelope.bundleSha256), "dispatch_bundle_sha256_invalid");
  ensure(Number.isSafeInteger(envelope.bundleBytes)
    && envelope.bundleBytes > 0
    && envelope.bundleBytes <= MAX_BUNDLE_BYTES, "dispatch_bundle_size_invalid");
  ensure(ENTRYPOINT.test(envelope.entrypointPath), "dispatch_entrypoint_not_allowlisted");
  safeRelativePath(envelope.entrypointPath, "dispatch_entrypoint_path_invalid");
  ensure(SHA256.test(envelope.entrypointSha256), "dispatch_entrypoint_sha256_invalid");
  ensure(envelope.approvalRequestPath === "approval-request.json", "dispatch_approval_request_path_invalid");
  ensure(SHA256.test(envelope.approvalRequestSha256), "dispatch_approval_request_sha256_invalid");
  ensure(SAFE_UNIT.test(envelope.runnerUnitName), "dispatch_runner_unit_invalid");
  ensure(SUCCESS_MARKER.test(envelope.launchSuccessMarker), "dispatch_success_marker_invalid");
  validateStagingDirectory(envelope.stagingDirectory, stagingRoots);
  ensure(envelope.transportMethod === "signed_git_bundle", "dispatch_transport_method_invalid");
  ensure(envelope.transportContainsSecrets === false, "dispatch_secret_transport_forbidden");
  ensure(envelope.noArbitraryCommand === true, "dispatch_arbitrary_command_boundary_disabled");
  ensure(envelope.sessionIndependentExecutionRequired === true, "dispatch_session_independence_required");
  ensure(envelope.automaticRollbackRequired === true, "dispatch_rollback_required");
  ensure(envelope.productionMutation === true, "dispatch_production_mutation_flag_invalid");
  ensure(envelope.maxExecutions === 1, "dispatch_execution_count_invalid");
  ensure(envelope.productionWipLimit === 1, "dispatch_wip_limit_invalid");
  ensure(Number.isSafeInteger(envelope.revocationEpoch) && envelope.revocationEpoch >= 0,
    "dispatch_revocation_epoch_invalid");
  ensure(Number.isSafeInteger(envelope.runtimeMaxSeconds)
    && envelope.runtimeMaxSeconds > 0
    && envelope.runtimeMaxSeconds <= MAX_RUNTIME_SECONDS,
  "dispatch_runtime_limit_invalid");

  const issuedAt = parseTimestamp(envelope.issuedAt, "dispatch_issued_at_invalid");
  const expiresAt = parseTimestamp(envelope.expiresAt, "dispatch_expires_at_invalid");
  ensure(expiresAt > issuedAt, "dispatch_window_invalid");
  ensure(expiresAt.getTime() - issuedAt.getTime() <= MAX_APPROVAL_WINDOW_MS,
    "dispatch_window_too_long");
  ensure(now >= issuedAt && now <= expiresAt, "dispatch_not_current");
  return envelope;
}

function normalizedArchiveEntry(raw) {
  const withoutDot = raw.replace(/^\.\//u, "").replace(/\/$/u, "");
  if (!withoutDot) return null;
  return safeRelativePath(withoutDot, "dispatch_bundle_path_unsafe");
}

export function validateBundleEntries(entries, verboseEntries = []) {
  ensure(Array.isArray(entries) && entries.length > 0, "dispatch_bundle_empty");
  ensure(entries.length <= 500, "dispatch_bundle_file_count_exceeded");
  const normalized = [];
  const seen = new Set();
  for (const raw of entries) {
    const entry = normalizedArchiveEntry(raw);
    if (!entry) continue;
    ensure(!seen.has(entry), "dispatch_bundle_duplicate_path", entry);
    ensure(!FORBIDDEN_ARCHIVE_PATH.test(entry), "dispatch_bundle_forbidden_path", entry);
    seen.add(entry);
    normalized.push(entry);
  }
  for (const line of verboseEntries) {
    const type = line.trimStart()[0];
    ensure(type === "-" || type === "d",
      "dispatch_bundle_special_file_forbidden");
  }
  return normalized;
}

async function measureArchivePayload(bundlePath) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("tar", ["-xOzf", bundlePath], { stdio: ["ignore", "pipe", "pipe"] });
    let bytes = 0;
    let exceeded = false;
    const stderrHash = createHash("sha256");
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_UNCOMPRESSED_BUNDLE_BYTES && !exceeded) {
        exceeded = true;
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk) => stderrHash.update(chunk));
    child.on("error", rejectPromise);
    child.on("close", (exitCode) => {
      if (exceeded) {
        rejectPromise(new DispatchPolicyError("dispatch_bundle_uncompressed_size_exceeded"));
      } else if (exitCode !== 0) {
        rejectPromise(new DispatchPolicyError("dispatch_bundle_payload_measure_failed", {
          exitCode,
          stderrSha256: stderrHash.digest("hex"),
        }));
      } else {
        resolvePromise(bytes);
      }
    });
  });
}

async function inspectArchive(bundlePath) {
  const facts = await lstat(bundlePath);
  ensure(facts.isFile() && !facts.isSymbolicLink(), "dispatch_bundle_not_regular_file");
  ensure(facts.size > 0 && facts.size <= MAX_BUNDLE_BYTES, "dispatch_bundle_size_invalid");
  const [{ stdout: names }, { stdout: verbose }] = await Promise.all([
    execFileAsync("tar", ["-tzf", bundlePath], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }),
    execFileAsync("tar", ["-tvzf", bundlePath], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }),
  ]);
  const entries = names.split(/\r?\n/u).filter(Boolean);
  const verboseEntries = verbose.split(/\r?\n/u).filter(Boolean);
  const validatedEntries = validateBundleEntries(entries, verboseEntries);
  const uncompressedBytes = await measureArchivePayload(bundlePath);
  return { entries: validatedEntries, size: facts.size, uncompressedBytes };
}

async function extractArchive(bundlePath, destination) {
  await execFileAsync("tar", [
    "--extract",
    "--gzip",
    "--file", bundlePath,
    "--directory", destination,
    "--no-same-owner",
    "--no-same-permissions",
  ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

async function assertRegularFile(path, reason) {
  const facts = await lstat(path);
  ensure(facts.isFile() && !facts.isSymbolicLink(), reason);
  return facts;
}

async function scanExtractedContent(root, entries) {
  for (const entry of entries) {
    const path = resolve(root, entry);
    const rel = relative(root, path);
    ensure(rel && !rel.startsWith(`..${sep}`) && rel !== "..", "dispatch_bundle_extract_escape");
    const facts = await lstat(path);
    if (!facts.isFile()) continue;
    ensure(facts.size <= 16 * 1024 * 1024, "dispatch_bundle_file_too_large", entry);
    const bytes = await readFile(path);
    const content = bytes.toString("latin1");
    for (const pattern of SENSITIVE_CONTENT) {
      ensure(!pattern.test(content), "dispatch_bundle_sensitive_content", entry);
    }
  }
}

function requestValueMatches(request, keys, expected, reason) {
  const present = keys.filter((key) => request[key] !== undefined);
  ensure(present.length > 0, reason);
  ensure(present.every((key) => request[key] === expected), reason);
}

async function inspectExtractedDispatch(root, envelope, entries) {
  const entrypoint = resolve(root, envelope.entrypointPath);
  const requestPath = resolve(root, envelope.approvalRequestPath);
  await assertRegularFile(entrypoint, "dispatch_entrypoint_missing_or_unsafe");
  await assertRegularFile(requestPath, "dispatch_approval_request_missing_or_unsafe");
  ensure(await sha256File(entrypoint) === envelope.entrypointSha256,
    "dispatch_entrypoint_sha256_mismatch");
  ensure(await sha256File(requestPath) === envelope.approvalRequestSha256,
    "dispatch_approval_request_sha256_mismatch");
  const request = JSON.parse(await readFile(requestPath, "utf8"));
  ensure(request && typeof request === "object" && !Array.isArray(request),
    "dispatch_approval_request_invalid");
  requestValueMatches(request, ["packageId"], envelope.packageId,
    "dispatch_approval_request_package_mismatch");
  requestValueMatches(request, ["stagingDirectory"], envelope.stagingDirectory,
    "dispatch_approval_request_staging_mismatch");
  requestValueMatches(request, ["runnerUnitName"], envelope.runnerUnitName,
    "dispatch_approval_request_unit_mismatch");
  requestValueMatches(request, ["runnerSourceCommit", "sourceCommit", "targetCommit"],
    envelope.targetCommit, "dispatch_approval_request_commit_mismatch");
  requestValueMatches(request, ["transportBundleSha256"], envelope.bundleSha256,
    "dispatch_approval_request_bundle_mismatch");
  ensure(request.transportMethod === envelope.transportMethod,
    "dispatch_approval_request_transport_mismatch");
  if (request.autonomyAuthorization !== undefined) {
    ensure(request.autonomyAuthorization?.packageId === envelope.packageId,
      "dispatch_autonomy_package_mismatch");
    ensure(request.autonomyAuthorization?.maxExecutions === 1,
      "dispatch_autonomy_execution_count_invalid");
    ensure(request.autonomyAuthorization?.revocationEpoch === envelope.revocationEpoch,
      "dispatch_autonomy_revocation_epoch_mismatch");
  }
  await scanExtractedContent(root, entries);
  return { entrypoint, request, requestPath };
}

export function signEnvelope(envelope, privateKeyPem) {
  const key = createPrivateKey(privateKeyPem);
  return sign(null, Buffer.from(canonicalJson(envelope)), key).toString("base64");
}

export function verifyEnvelopeSignature(envelope, signatureBase64, publicKeyPem) {
  ensure(typeof signatureBase64 === "string"
    && /^[A-Za-z0-9+/]+={0,2}$/u.test(signatureBase64.trim()),
  "dispatch_signature_encoding_invalid");
  const key = createPublicKey(publicKeyPem);
  ensure(verify(
    null,
    Buffer.from(canonicalJson(envelope)),
    key,
    Buffer.from(signatureBase64.trim(), "base64"),
  ), "dispatch_signature_invalid");
  return true;
}

async function readCanonicalEnvelope(path) {
  const raw = await readFile(path, "utf8");
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw new DispatchPolicyError("dispatch_json_invalid");
  }
  ensure(raw === canonicalJson(envelope), "dispatch_json_not_canonical");
  return envelope;
}

export async function validateOutbox(outbox, publicKeyPath, options = {}) {
  const root = resolve(outbox);
  const expected = new Set(DISPATCH_FILES);
  const names = (await readdir(root)).sort();
  ensure(names.length === expected.size && names.every((name) => expected.has(name)),
    "dispatch_outbox_files_invalid", names);
  const envelope = await readCanonicalEnvelope(join(root, "dispatch.json"));
  validateEnvelope(envelope, options);
  await assertRegularFile(publicKeyPath, "dispatch_public_key_missing_or_unsafe");
  await assertRegularFile(join(root, "approval-request.json"),
    "dispatch_approval_request_missing_or_unsafe");
  const publicKey = await readFile(publicKeyPath, "utf8");
  const signature = await readFile(join(root, "dispatch.sig"), "utf8");
  verifyEnvelopeSignature(envelope, signature, publicKey);
  const archive = await inspectArchive(join(root, "bundle.tar.gz"));
  ensure(archive.size === envelope.bundleBytes, "dispatch_bundle_size_mismatch");
  ensure(await sha256File(join(root, "bundle.tar.gz")) === envelope.bundleSha256,
    "dispatch_bundle_sha256_mismatch");
  const scratch = await mkdtemp(join(tmpdir(), "market-radar-dispatch-validate-"));
  try {
    await extractArchive(join(root, "bundle.tar.gz"), scratch);
    await copyFile(join(root, "approval-request.json"), join(scratch, "approval-request.json"));
    await inspectExtractedDispatch(scratch, envelope, [...archive.entries, "approval-request.json"]);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  return { envelope, status: "PASS_SIGNED_DISPATCH_OUTBOX" };
}

export async function generateSigningKeyPair({ privateKeyPath, publicKeyPath }) {
  ensure(isAbsolute(privateKeyPath) && isAbsolute(publicKeyPath), "dispatch_key_path_must_be_absolute");
  ensure(privateKeyPath !== publicKeyPath, "dispatch_key_paths_must_differ");
  const worktree = resolve(process.cwd());
  const privateKeyAbsolute = resolve(privateKeyPath);
  ensure(privateKeyAbsolute !== worktree && !privateKeyAbsolute.startsWith(`${worktree}${sep}`),
    "dispatch_private_key_inside_worktree");
  for (const path of [privateKeyPath, publicKeyPath]) {
    await access(path, fsConstants.F_OK).then(
      () => { throw new DispatchPolicyError("dispatch_key_path_already_exists", path); },
      (error) => { if (error?.code !== "ENOENT") throw error; },
    );
  }
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" },
  });
  await mkdir(dirname(privateKeyPath), { recursive: true, mode: 0o700 });
  await mkdir(dirname(publicKeyPath), { recursive: true, mode: 0o700 });
  let privateKeyCreated = false;
  try {
    await writeFile(privateKeyPath, privateKey, { flag: "wx", mode: 0o600 });
    privateKeyCreated = true;
    await writeFile(publicKeyPath, publicKey, { flag: "wx", mode: 0o644 });
  } catch (error) {
    if (privateKeyCreated) await rm(privateKeyPath, { force: true });
    throw error;
  }
  return {
    privateKeyPath,
    publicKeyPath,
    publicKeySha256: sha256(publicKey),
    status: "PASS_DISPATCH_SIGNING_KEY_GENERATED",
  };
}

export async function prepareDispatch({
  approvalRequestPath,
  bundlePath,
  dispatch,
  outbox,
  privateKeyPath,
  now = new Date(),
}) {
  const bundle = resolve(bundlePath);
  const request = resolve(approvalRequestPath);
  const output = resolve(outbox);
  await assertRegularFile(request, "dispatch_approval_request_missing_or_unsafe");
  ensure(isAbsolute(privateKeyPath), "dispatch_private_key_path_must_be_absolute");
  const privateKeyFacts = await assertRegularFile(privateKeyPath,
    "dispatch_private_key_missing_or_unsafe");
  ensure((privateKeyFacts.mode & 0o077) === 0, "dispatch_private_key_mode_unsafe");
  const worktree = resolve(process.cwd());
  const privateKeyAbsolute = resolve(privateKeyPath);
  ensure(privateKeyAbsolute !== worktree && !privateKeyAbsolute.startsWith(`${worktree}${sep}`),
    "dispatch_private_key_inside_worktree");
  const archive = await inspectArchive(bundle);
  const bundleSha256 = await sha256File(bundle);
  const approvalRequestSha256 = await sha256File(request);
  const scratch = await mkdtemp(join(tmpdir(), "market-radar-dispatch-prepare-"));
  try {
    await extractArchive(bundle, scratch);
    const stagedRequest = resolve(scratch, "approval-request.json");
    await copyFile(request, stagedRequest);
    const entrypointPath = safeRelativePath(dispatch.entrypointPath,
      "dispatch_entrypoint_path_invalid");
    const entrypoint = resolve(scratch, entrypointPath);
    await assertRegularFile(entrypoint, "dispatch_entrypoint_missing_or_unsafe");
    const envelope = {
      approvalRequestPath: "approval-request.json",
      approvalRequestSha256,
      automaticRollbackRequired: true,
      bundleBytes: archive.size,
      bundleSha256,
      dispatchId: dispatch.dispatchId,
      entrypointPath,
      entrypointSha256: await sha256File(entrypoint),
      expiresAt: dispatch.expiresAt,
      issuedAt: dispatch.issuedAt,
      launchSuccessMarker: dispatch.launchSuccessMarker,
      maxExecutions: 1,
      noArbitraryCommand: true,
      packageId: dispatch.packageId,
      productionMutation: true,
      productionWipLimit: 1,
      revocationEpoch: dispatch.revocationEpoch,
      runnerUnitName: dispatch.runnerUnitName,
      runtimeMaxSeconds: dispatch.runtimeMaxSeconds,
      schemaVersion: DISPATCH_SCHEMA,
      sessionIndependentExecutionRequired: true,
      sourceRef: dispatch.sourceRef,
      stagingDirectory: dispatch.stagingDirectory,
      targetCommit: dispatch.targetCommit,
      transportContainsSecrets: false,
      transportMethod: "signed_git_bundle",
    };
    validateEnvelope(envelope, { now, sourceRefs: dispatch.sourceRefs, stagingRoots: dispatch.stagingRoots });
    await inspectExtractedDispatch(scratch, envelope, [
      ...archive.entries.filter((entry) => entry !== "approval-request.json"),
      "approval-request.json",
    ]);
    const privateKey = await readFile(privateKeyPath, "utf8");
    const signature = signEnvelope(envelope, privateKey);
    await access(output, fsConstants.F_OK).then(
      () => { throw new DispatchPolicyError("dispatch_outbox_already_exists"); },
      (error) => { if (error?.code !== "ENOENT") throw error; },
    );
    await mkdir(output, { recursive: false, mode: 0o700 });
    await copyFile(request, join(output, "approval-request.json"));
    await chmod(join(output, "approval-request.json"), 0o600);
    await copyFile(bundle, join(output, "bundle.tar.gz"));
    await chmod(join(output, "bundle.tar.gz"), 0o600);
    await writeFile(join(output, "dispatch.json"), canonicalJson(envelope), { mode: 0o600 });
    await writeFile(join(output, "dispatch.sig"), `${signature}\n`, { mode: 0o600 });
    return { envelope, outbox: output, status: "PASS_SIGNED_DISPATCH_PREPARED" };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function runGit(repo, args, options = {}) {
  const { stdout } = await execFileAsync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  return stdout.trim();
}

function safeChildFailureDetails(error) {
  const details = {};
  if (typeof error?.code === "number" || typeof error?.code === "string") {
    details.code = String(error.code).slice(0, 80);
  }
  if (typeof error?.signal === "string") details.signal = error.signal.slice(0, 40);
  if (error?.stderr !== undefined) details.stderrSha256 = sha256(String(error.stderr));
  return details;
}

async function runFileWithInput(command, args, input) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", rejectPromise);
    child.on("close", (exitCode) => {
      const output = Buffer.concat(stdout).toString("utf8").trim();
      if (exitCode === 0) resolvePromise(output);
      else rejectPromise(new DispatchPolicyError("dispatch_child_process_failed", {
        command,
        exitCode,
        stderrSha256: sha256(Buffer.concat(stderr)),
      }));
    });
    child.stdin.end(input);
  });
}

function validateDispatchBranch(branch) {
  ensure(/^[a-z0-9][a-z0-9._/-]{2,180}$/u.test(branch), "dispatch_branch_invalid");
  ensure(!branch.includes("..") && !branch.includes("//") && !branch.endsWith("/"),
    "dispatch_branch_invalid");
  return branch;
}

export async function publishDispatch({
  outbox,
  publicKeyPath,
  repo,
  remote = "origin",
  branch,
  sourceRefs = undefined,
  stagingRoots = [
    "/home/ubuntu/.cache/market-radar-ops",
    "/home/ubuntu/.cache/market-radar-v2",
  ],
}) {
  ensure(/^[A-Za-z0-9._-]{1,80}$/u.test(remote), "dispatch_remote_invalid");
  validateDispatchBranch(branch);
  const validation = await validateOutbox(outbox, publicKeyPath, {
    sourceRefs,
    stagingRoots,
  });
  const targetRef = `refs/heads/${branch}`;
  const remoteLine = await execFileAsync("git", ["-C", repo, "ls-remote", "--heads", remote, targetRef], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  const parent = remoteLine.stdout.trim().split(/\s+/u)[0] || null;
  if (parent) ensure(COMMIT.test(parent), "dispatch_remote_parent_invalid");
  const blobs = [];
  for (const name of DISPATCH_FILES) {
    const hash = await runGit(repo, ["hash-object", "-w", join(resolve(outbox), name)]);
    ensure(COMMIT.test(hash), "dispatch_git_blob_invalid");
    blobs.push({ hash, name });
  }
  const treeInput = blobs
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ hash, name }) => `100644 blob ${hash}\t${name}\n`)
    .join("");
  const tree = await runFileWithInput("git", ["-C", repo, "mktree"], treeInput);
  ensure(COMMIT.test(tree), "dispatch_git_tree_invalid");
  const commitArgs = ["commit-tree", tree];
  if (parent) commitArgs.push("-p", parent);
  commitArgs.push("-m", `dispatch: ${validation.envelope.dispatchId}`);
  const commit = await runGit(repo, commitArgs);
  ensure(COMMIT.test(commit), "dispatch_git_commit_invalid");
  await execFileAsync("git", ["-C", repo, "push", remote, `${commit}:${targetRef}`], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const receipt = {
    schemaVersion: "market-radar-production-dispatch-publish-receipt.v1",
    branch: targetRef,
    commit,
    dispatchId: validation.envelope.dispatchId,
    parent,
    publishedAt: new Date().toISOString(),
    status: "PASS_SIGNED_DISPATCH_PUBLISHED",
  };
  await writeFile(`${resolve(outbox)}.publish-receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, {
    mode: 0o600,
  });
  return receipt;
}

export function validateAgentConfig(config) {
  exactKeys(config, CONFIG_KEYS, "dispatch_agent_config_keys_invalid");
  ensure(config.schemaVersion === AGENT_CONFIG_SCHEMA, "dispatch_agent_config_schema_invalid");
  for (const [key, value] of Object.entries({
    mirrorPath: config.mirrorPath,
    publicKeyPath: config.publicKeyPath,
    stateRoot: config.stateRoot,
    trustRoot: config.trustRoot,
  })) {
    ensure(typeof value === "string" && isAbsolute(value), `dispatch_agent_${key}_invalid`);
  }
  ensure(typeof config.remoteUrl === "string" && config.remoteUrl.length > 0,
    "dispatch_agent_remote_url_invalid");
  ensure(!/^https?:\/\/[^/@]+:[^/@]+@/iu.test(config.remoteUrl),
    "dispatch_agent_remote_url_embeds_credentials");
  ensure(DISPATCH_REF.test(config.dispatchRef) && !config.dispatchRef.includes(".."),
    "dispatch_agent_dispatch_ref_invalid");
  ensure(TRACKING_REF.test(config.dispatchTrackingRef) && !config.dispatchTrackingRef.includes(".."),
    "dispatch_agent_tracking_ref_invalid");
  ensure(Array.isArray(config.sourceRefs) && config.sourceRefs.length > 0,
    "dispatch_agent_source_refs_invalid");
  ensure(new Set(config.sourceRefs).size === config.sourceRefs.length,
    "dispatch_agent_source_refs_duplicate");
  config.sourceRefs.forEach((sourceRef) => validateSourceRef(sourceRef));
  ensure(Array.isArray(config.stagingRoots) && config.stagingRoots.length > 0,
    "dispatch_agent_staging_roots_invalid");
  ensure(new Set(config.stagingRoots).size === config.stagingRoots.length,
    "dispatch_agent_staging_roots_duplicate");
  config.stagingRoots.forEach((root) => ensure(isAbsolute(root), "dispatch_agent_staging_root_invalid"));
  return config;
}

async function ensureBareMirror(config) {
  await access(config.mirrorPath, fsConstants.F_OK).then(async () => {
    ensure(await runGit(config.mirrorPath, ["rev-parse", "--is-bare-repository"]) === "true",
      "dispatch_agent_mirror_not_bare");
  }, async (error) => {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(dirname(config.mirrorPath), { recursive: true, mode: 0o700 });
    await execFileAsync("git", ["init", "--bare", config.mirrorPath], { encoding: "utf8" });
    await runGit(config.mirrorPath, ["remote", "add", "origin", config.remoteUrl]);
  });
  const remote = await runGit(config.mirrorPath, ["remote", "get-url", "origin"]);
  ensure(remote === config.remoteUrl, "dispatch_agent_remote_url_drift");
}

async function fetchOptionalRef(config, sourceRef, trackingRef) {
  try {
    await runGit(config.mirrorPath, ["fetch", "--no-tags", "origin", `+${sourceRef}:${trackingRef}`]);
    return true;
  } catch (error) {
    const stderr = String(error?.stderr ?? "");
    if (/couldn't find remote ref|not found/iu.test(stderr)) return false;
    throw new DispatchPolicyError("dispatch_agent_remote_fetch_failed", safeChildFailureDetails(error));
  }
}

async function atomicWrite(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, value, { flag: "wx", mode: 0o600 });
  await rename(temporary, path);
}

async function readJson(path, reason) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new DispatchPolicyError(reason);
  }
}

export async function initializeAgent(configInput) {
  const config = validateAgentConfig(configInput);
  try {
    await mkdir(config.stateRoot, { recursive: true, mode: 0o700 });
    await mkdir(join(config.stateRoot, "claims"), { recursive: true, mode: 0o700 });
    await mkdir(join(config.stateRoot, "results"), { recursive: true, mode: 0o700 });
    await ensureBareMirror(config);
    const cursorPath = join(config.stateRoot, "cursor.json");
    await access(cursorPath, fsConstants.F_OK).then(
      () => { throw new DispatchPolicyError("dispatch_agent_cursor_already_exists"); },
      (error) => { if (error?.code !== "ENOENT") throw error; },
    );
    const exists = await fetchOptionalRef(config, config.dispatchRef, config.dispatchTrackingRef);
    const cursor = exists ? await runGit(config.mirrorPath, ["rev-parse", config.dispatchTrackingRef]) : null;
    const state = {
      schemaVersion: AGENT_STATE_SCHEMA,
      initializedAt: new Date().toISOString(),
      lastDispatchCommit: cursor,
      status: "initialized_no_replay",
    };
    await atomicWrite(cursorPath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  } catch (error) {
    if (error instanceof DispatchPolicyError) throw error;
    throw new DispatchPolicyError("dispatch_agent_initialize_failed", safeChildFailureDetails(error));
  }
}

async function acquireAgentLock(stateRoot) {
  const lock = join(stateRoot, "agent.lock");
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") throw new DispatchPolicyError("dispatch_agent_already_running");
    throw error;
  }
  return lock;
}

async function writeCommitFile(config, commit, name, destination) {
  const { stdout } = await execFileAsync("git", [
    "-C", config.mirrorPath, "show", `${commit}:${name}`,
  ], { encoding: null, maxBuffer: MAX_BUNDLE_BYTES + 1024 * 1024 });
  await writeFile(destination, stdout, { mode: 0o600 });
}

async function productionLeaseState(config, now) {
  const lockPath = join(config.trustRoot, "production-global.lock");
  const leasePath = join(lockPath, "lease.json");
  try {
    const lockFacts = await lstat(lockPath);
    if (!lockFacts.isDirectory() || lockFacts.isSymbolicLink()) return "uncertain";
  } catch (error) {
    if (error?.code === "ENOENT") return "inactive";
    return "uncertain";
  }
  try {
    const leaseFacts = await lstat(leasePath);
    if (!leaseFacts.isFile() || leaseFacts.isSymbolicLink()) return "uncertain";
    const lease = JSON.parse(await readFile(leasePath, "utf8"));
    const expiresAt = new Date(lease.expiresAt);
    if (lease.schemaVersion !== "market-radar-production-lease.v1"
      || lease.status !== "active"
      || !Number.isFinite(expiresAt.getTime())
      || expiresAt.toISOString() !== lease.expiresAt) return "uncertain";
    return expiresAt > now ? "active" : "inactive";
  } catch {
    return "uncertain";
  }
}

async function validateSourceCommit(config, envelope) {
  const suffix = sha256(envelope.sourceRef).slice(0, 20);
  const tracking = `refs/market-radar-dispatch/source/${suffix}`;
  await runGit(config.mirrorPath, [
    "fetch", "--no-tags", "origin", `+${envelope.sourceRef}:${tracking}`,
  ]);
  const type = await runGit(config.mirrorPath, ["cat-file", "-t", envelope.targetCommit]);
  ensure(type === "commit", "dispatch_target_commit_unavailable");
  try {
    await runGit(config.mirrorPath, ["merge-base", "--is-ancestor", envelope.targetCommit, tracking]);
  } catch {
    throw new DispatchPolicyError("dispatch_target_commit_not_reachable_from_source_ref");
  }
}

async function verifyStagingRoot(config, stagingDirectory) {
  const root = config.stagingRoots.find((candidate) => dirname(stagingDirectory) === resolve(candidate));
  ensure(root, "dispatch_staging_directory_outside_allowed_roots");
  const rootFacts = await lstat(root);
  ensure(rootFacts.isDirectory() && !rootFacts.isSymbolicLink(), "dispatch_staging_root_unsafe");
  ensure(await realpath(dirname(stagingDirectory)) === await realpath(root),
    "dispatch_staging_root_unsafe");
  await access(stagingDirectory, fsConstants.F_OK).then(
    () => { throw new DispatchPolicyError("dispatch_staging_directory_already_exists"); },
    (error) => { if (error?.code !== "ENOENT") throw error; },
  );
}

async function defaultLaunch({ entrypoint, marker, requestPath }) {
  try {
    const { stdout, stderr } = await execFileAsync("bash", [entrypoint], {
      cwd: dirname(requestPath),
      encoding: "utf8",
      env: {
        HOME: "/home/ubuntu",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        LOGNAME: "ubuntu",
        NODE_OPTIONS: "--jitless",
        PATH: `${dirname(process.execPath)}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
        REQUEST_FILE: requestPath,
        USER: "ubuntu",
      },
      maxBuffer: 1024 * 1024,
      timeout: 120_000,
    });
    ensure(stdout.includes(marker), "dispatch_launch_success_marker_missing");
    return { exitCode: 0, stderrSha256: sha256(stderr), stdoutSha256: sha256(stdout) };
  } catch (error) {
    if (error instanceof DispatchPolicyError) throw error;
    throw new DispatchPolicyError("dispatch_entrypoint_launch_failed", {
      exitCode: error?.code,
      stderrSha256: sha256(String(error?.stderr ?? "")),
      stdoutSha256: sha256(String(error?.stdout ?? "")),
    });
  }
}

async function updateCursor(config, commit, status) {
  const cursorPath = join(config.stateRoot, "cursor.json");
  const state = {
    schemaVersion: AGENT_STATE_SCHEMA,
    lastDispatchCommit: commit,
    status,
    updatedAt: new Date().toISOString(),
  };
  await atomicWrite(cursorPath, `${JSON.stringify(state, null, 2)}\n`);
}

async function writeResult(config, name, result) {
  const path = join(config.stateRoot, "results", `${name}.json`);
  await atomicWrite(path, `${JSON.stringify(result, null, 2)}\n`);
}

async function processCommit(config, commit, { launch, now }) {
  let scratch;
  let envelope;
  try {
    const names = (await runGit(config.mirrorPath, ["ls-tree", "-r", "--name-only", commit]))
      .split(/\r?\n/u).filter(Boolean).sort();
    ensure(names.length === DISPATCH_FILES.length
      && names.every((name, index) => name === [...DISPATCH_FILES].sort()[index]),
    "dispatch_commit_files_invalid");
    scratch = await mkdtemp(join(config.stateRoot, ".incoming-"));
    for (const name of DISPATCH_FILES) {
      await writeCommitFile(config, commit, name, join(scratch, name));
    }
    const validation = await validateOutbox(scratch, config.publicKeyPath, {
      now,
      sourceRefs: config.sourceRefs,
      stagingRoots: config.stagingRoots,
    });
    envelope = validation.envelope;
    const leaseState = await productionLeaseState(config, now);
    if (leaseState !== "inactive") {
      return {
        commit,
        dispatchId: envelope.dispatchId,
        status: leaseState === "active"
          ? "DEFERRED_PRODUCTION_WIP_ACTIVE"
          : "DEFERRED_PRODUCTION_LEASE_UNCERTAIN",
      };
    }
    await validateSourceCommit(config, envelope);
    const claimPath = join(config.stateRoot, "claims", `${envelope.dispatchId}.json`);
    const claimHandle = await open(claimPath, "wx", 0o600).catch((error) => {
      if (error?.code === "EEXIST") throw new DispatchPolicyError("dispatch_already_claimed");
      throw error;
    });
    try {
      await claimHandle.writeFile(`${JSON.stringify({
        schemaVersion: "market-radar-production-dispatch-claim.v1",
        claimedAt: now.toISOString(),
        commit,
        dispatchId: envelope.dispatchId,
        packageId: envelope.packageId,
        status: "claimed_before_launch",
      }, null, 2)}\n`);
      await claimHandle.sync();
    } finally {
      await claimHandle.close();
    }
    const claimsDirectory = await open(dirname(claimPath), "r");
    try {
      await claimsDirectory.sync();
    } finally {
      await claimsDirectory.close();
    }

    await verifyStagingRoot(config, envelope.stagingDirectory);
    await mkdir(envelope.stagingDirectory, { mode: 0o700 });
    await extractArchive(join(scratch, "bundle.tar.gz"), envelope.stagingDirectory);
    await copyFile(join(scratch, "approval-request.json"),
      join(envelope.stagingDirectory, "approval-request.json"));
    await copyFile(join(scratch, "dispatch.json"), join(envelope.stagingDirectory, ".dispatch.json"));
    await copyFile(join(scratch, "dispatch.sig"), join(envelope.stagingDirectory, ".dispatch.sig"));
    await writeFile(join(envelope.stagingDirectory, ".transport-bundle.sha256"),
      `${envelope.bundleSha256}\n`, { mode: 0o600 });
    await chmod(envelope.stagingDirectory, 0o700);
    await chmod(resolve(envelope.stagingDirectory, envelope.approvalRequestPath), 0o600);

    const archive = await inspectArchive(join(scratch, "bundle.tar.gz"));
    const inspected = await inspectExtractedDispatch(envelope.stagingDirectory, envelope, archive.entries);
    const launchResult = await launch({
      entrypoint: inspected.entrypoint,
      envelope,
      marker: envelope.launchSuccessMarker,
      requestPath: inspected.requestPath,
    });
    const result = {
      schemaVersion: "market-radar-production-dispatch-launch-result.v1",
      bundleSha256: envelope.bundleSha256,
      commit,
      dispatchId: envelope.dispatchId,
      entrypointSha256: envelope.entrypointSha256,
      launchedAt: new Date().toISOString(),
      packageId: envelope.packageId,
      runnerUnitName: envelope.runnerUnitName,
      sourceCommit: envelope.targetCommit,
      status: "PASS_SESSION_INDEPENDENT_RUNNER_LAUNCHED",
      stderrSha256: launchResult.stderrSha256,
      stdoutSha256: launchResult.stdoutSha256,
    };
    await writeResult(config, envelope.dispatchId, result);
    await updateCursor(config, commit, "dispatch_launched");
    return result;
  } catch (error) {
    const result = {
      schemaVersion: "market-radar-production-dispatch-launch-result.v1",
      commit,
      dispatchId: envelope?.dispatchId ?? null,
      failedAt: new Date().toISOString(),
      packageId: envelope?.packageId ?? null,
      reason: error instanceof DispatchPolicyError ? error.reason : "unexpected_error",
      status: "FAIL_DISPATCH_NOT_REUSABLE",
    };
    const resultName = envelope ? `${envelope.dispatchId}-failed` : `commit-${commit}-failed`;
    await writeResult(config, resultName, result).catch(() => {});
    await updateCursor(config, commit, "dispatch_failed_not_reusable").catch(() => {});
    throw error;
  } finally {
    if (scratch) await rm(scratch, { recursive: true, force: true });
  }
}

export async function agentOnce(configInput, {
  launch = defaultLaunch,
  now = new Date(),
} = {}) {
  const config = validateAgentConfig(configInput);
  const lock = await acquireAgentLock(config.stateRoot);
  try {
    await ensureBareMirror(config);
    const cursorPath = join(config.stateRoot, "cursor.json");
    const cursor = await readJson(cursorPath, "dispatch_agent_cursor_missing_or_invalid");
    ensure(cursor.schemaVersion === AGENT_STATE_SCHEMA, "dispatch_agent_cursor_schema_invalid");
    const exists = await fetchOptionalRef(config, config.dispatchRef, config.dispatchTrackingRef);
    if (!exists) return { status: "IDLE_NO_DISPATCH_REF" };
    const head = await runGit(config.mirrorPath, ["rev-parse", config.dispatchTrackingRef]);
    ensure(COMMIT.test(head), "dispatch_agent_head_invalid");
    if (cursor.lastDispatchCommit === head) return { commit: head, status: "IDLE_NO_NEW_DISPATCH" };
    let commits;
    if (cursor.lastDispatchCommit === null) {
      const count = Number(await runGit(config.mirrorPath, ["rev-list", "--count", head]));
      ensure(count === 1, "dispatch_first_queue_depth_not_one");
      commits = [head];
    } else {
      ensure(COMMIT.test(cursor.lastDispatchCommit), "dispatch_agent_cursor_commit_invalid");
      try {
        await runGit(config.mirrorPath, ["merge-base", "--is-ancestor", cursor.lastDispatchCommit, head]);
      } catch {
        throw new DispatchPolicyError("dispatch_history_not_fast_forward");
      }
      commits = (await runGit(config.mirrorPath, [
        "rev-list", "--reverse", `${cursor.lastDispatchCommit}..${head}`,
      ])).split(/\r?\n/u).filter(Boolean);
      ensure(commits.length === 1, "dispatch_queue_depth_exceeds_one");
    }
    return await processCommit(config, commits[0], { launch, now });
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    ensure(key?.startsWith("--") && value !== undefined && !value.startsWith("--"),
      "dispatch_argument_invalid");
    options[key.slice(2)] = value;
  }
  return { command, options };
}

function requiredOption(options, key) {
  ensure(typeof options[key] === "string" && options[key].length > 0,
    `dispatch_option_missing:${key}`);
  return options[key];
}

async function loadConfig(path) {
  return validateAgentConfig(JSON.parse(await readFile(path, "utf8")));
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  let result;
  if (command === "keygen") {
    result = await generateSigningKeyPair({
      privateKeyPath: requiredOption(options, "private-key"),
      publicKeyPath: requiredOption(options, "public-key"),
    });
  } else if (command === "prepare") {
    const issuedAt = requiredOption(options, "issued-at");
    const dispatch = {
      dispatchId: requiredOption(options, "dispatch-id"),
      entrypointPath: requiredOption(options, "entrypoint"),
      expiresAt: requiredOption(options, "expires-at"),
      issuedAt,
      launchSuccessMarker: requiredOption(options, "success-marker"),
      packageId: requiredOption(options, "package-id"),
      revocationEpoch: Number(requiredOption(options, "revocation-epoch")),
      runnerUnitName: requiredOption(options, "runner-unit"),
      runtimeMaxSeconds: Number(requiredOption(options, "runtime-max-seconds")),
      sourceRef: requiredOption(options, "source-ref"),
      stagingDirectory: requiredOption(options, "staging-directory"),
      targetCommit: requiredOption(options, "target-commit"),
    };
    result = await prepareDispatch({
      approvalRequestPath: requiredOption(options, "approval-request"),
      bundlePath: requiredOption(options, "bundle"),
      dispatch,
      outbox: requiredOption(options, "outbox"),
      privateKeyPath: requiredOption(options, "private-key"),
      now: new Date(issuedAt),
    });
  } else if (command === "validate") {
    result = await validateOutbox(
      requiredOption(options, "outbox"),
      requiredOption(options, "public-key"),
    );
  } else if (command === "publish") {
    result = await publishDispatch({
      branch: requiredOption(options, "branch"),
      outbox: requiredOption(options, "outbox"),
      publicKeyPath: requiredOption(options, "public-key"),
      remote: options.remote ?? "origin",
      repo: requiredOption(options, "repo"),
    });
  } else if (command === "config-validate") {
    result = {
      config: await loadConfig(requiredOption(options, "config")),
      status: "PASS_PRODUCTION_DISPATCH_AGENT_CONFIG",
    };
  } else if (command === "agent-initialize") {
    result = await initializeAgent(await loadConfig(requiredOption(options, "config")));
  } else if (command === "agent-once") {
    result = await agentOnce(await loadConfig(requiredOption(options, "config")));
  } else {
    throw new DispatchPolicyError("dispatch_command_invalid");
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      details: error instanceof DispatchPolicyError ? error.details : undefined,
      reason: error instanceof DispatchPolicyError ? error.reason : "unexpected_error",
      status: "BLOCKED",
    })}\n`);
    process.exitCode = 1;
  });
}
