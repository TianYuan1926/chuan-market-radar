#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  PRODUCTION_EVIDENCE_MAX_SEALED_BYTES,
  ProductionEvidenceError,
  evidenceObjectName,
  openProductionEvidence,
} from "./production-evidence-channel.mjs";
import { canonicalJson, sha256 } from "./production-dispatch.mjs";

const execFileAsync = promisify(execFile);

export const PRODUCTION_EVIDENCE_BASE_URL =
  "http://43.161.202.227/_market-radar/evidence";
export const PRODUCTION_EVIDENCE_HOST_ALIAS = "43.161.202.227";
export const PRODUCTION_EVIDENCE_HOST_ED25519_FINGERPRINT =
  "SHA256:wxHx/NcT7wmgM6aOJnjgYKK4gOQGGeN44XkHYARbpbc";
export const PRODUCTION_EVIDENCE_PROXY_HOST = "127.0.0.1";
export const PRODUCTION_EVIDENCE_PROXY_PORT = 7892;
export const PRODUCTION_EVIDENCE_WAIT_MS = 180 * 1000;
export const PRODUCTION_EVIDENCE_POLL_MS = 3 * 1000;
export const PRODUCTION_EVIDENCE_LOCAL_PRIVATE_KEY = join(
  homedir(),
  ".local/share/market-radar-production-evidence/recipient-private.pem",
);
export const PRODUCTION_EVIDENCE_LOCAL_OUTPUT_ROOT = join(
  homedir(),
  ".cache/market-radar-v2/production-evidence",
);
export const PRODUCTION_EVIDENCE_KNOWN_HOSTS = join(homedir(), ".ssh/known_hosts");

const DISPATCH_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,180}$/u;
const SCHEMA_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,180}$/u;
const OPENSSH_ED25519 = /^ssh-ed25519 ([A-Za-z0-9+/]+={0,3})$/u;

export class ProductionEvidenceRetrieveError extends Error {
  constructor(reason, details = undefined) {
    super(reason);
    this.name = "ProductionEvidenceRetrieveError";
    this.reason = reason;
    this.details = details;
  }
}

function ensure(condition, reason, details = undefined) {
  if (!condition) throw new ProductionEvidenceRetrieveError(reason, details);
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function openSshFingerprint(publicKey) {
  const match = OPENSSH_ED25519.exec(publicKey);
  ensure(match, "evidence_retrieve_host_public_key_invalid");
  const blob = Buffer.from(match[1], "base64");
  ensure(blob.length > 0 && blob.toString("base64") === match[1],
    "evidence_retrieve_host_public_key_invalid");
  return `SHA256:${createHash("sha256").update(blob).digest("base64").replace(/=+$/u, "")}`;
}

export function parseKnownHostsEd25519(raw, {
  expectedFingerprint = PRODUCTION_EVIDENCE_HOST_ED25519_FINGERPRINT,
} = {}) {
  ensure(typeof raw === "string" && raw.length > 0,
    "evidence_retrieve_known_hosts_lookup_empty");
  const keys = new Set();
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const fields = trimmed.split(/\s+/u);
    const keyIndex = fields.indexOf("ssh-ed25519");
    if (keyIndex < 0 || !fields[keyIndex + 1]) continue;
    keys.add(`ssh-ed25519 ${fields[keyIndex + 1]}`);
  }
  ensure(keys.size === 1, "evidence_retrieve_host_key_not_unique", {
    keyCount: keys.size,
  });
  const [publicKey] = keys;
  ensure(
    openSshFingerprint(publicKey) === expectedFingerprint,
    "evidence_retrieve_host_key_fingerprint_mismatch",
  );
  return publicKey;
}

export async function trustedProductionHostPublicKey({
  hostAlias = PRODUCTION_EVIDENCE_HOST_ALIAS,
  knownHostsPath = PRODUCTION_EVIDENCE_KNOWN_HOSTS,
  sshKeygenPath = "/usr/bin/ssh-keygen",
} = {}) {
  ensure(/^[A-Za-z0-9.:[\]-]{3,180}$/u.test(hostAlias),
    "evidence_retrieve_host_alias_invalid");
  ensure(isAbsolute(knownHostsPath), "evidence_retrieve_known_hosts_path_invalid");
  const { stdout } = await execFileAsync(sshKeygenPath, [
    "-F", hostAlias,
    "-f", knownHostsPath,
  ], { encoding: "utf8", maxBuffer: 256 * 1024, timeout: 10_000 });
  return parseKnownHostsEd25519(stdout);
}

async function readPrivateKeyNoFollow(path) {
  ensure(isAbsolute(path), "evidence_retrieve_private_key_path_invalid");
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const before = await handle.stat();
    ensure(
      before.isFile()
        && before.size > 0
        && before.size <= 16 * 1024
        && (before.mode & 0o777) === 0o600,
      "evidence_retrieve_private_key_unsafe",
    );
    const bytes = await handle.readFile();
    const after = await handle.stat();
    ensure(
      before.dev === after.dev
        && before.ino === after.ino
        && before.size === after.size
        && before.mtimeMs === after.mtimeMs,
      "evidence_retrieve_private_key_changed",
    );
    return bytes.toString("utf8");
  } catch (error) {
    if (error instanceof ProductionEvidenceRetrieveError) throw error;
    throw new ProductionEvidenceRetrieveError("evidence_retrieve_private_key_unsafe", {
      code: typeof error?.code === "string" ? error.code.slice(0, 40) : null,
    });
  } finally {
    if (handle) await handle.close();
  }
}

function validateBaseUrl(baseUrl) {
  ensure(
    baseUrl === PRODUCTION_EVIDENCE_BASE_URL
      || baseUrl === `${PRODUCTION_EVIDENCE_BASE_URL}/`,
    "evidence_retrieve_base_url_invalid",
  );
  let parsed;
  try {
    parsed = new URL(`${PRODUCTION_EVIDENCE_BASE_URL}/`);
  } catch {
    throw new ProductionEvidenceRetrieveError("evidence_retrieve_base_url_invalid");
  }
  ensure(
    parsed.href === `${PRODUCTION_EVIDENCE_BASE_URL}/`
      && parsed.username === ""
      && parsed.password === ""
      && parsed.search === ""
      && parsed.hash === "",
    "evidence_retrieve_base_url_invalid",
  );
  return parsed;
}

export async function curlProductionEvidence(url, {
  curlPath = "/usr/bin/curl",
  proxyHost = PRODUCTION_EVIDENCE_PROXY_HOST,
  proxyPort = PRODUCTION_EVIDENCE_PROXY_PORT,
} = {}) {
  const parsed = new URL(url);
  ensure(
    parsed.origin === new URL(PRODUCTION_EVIDENCE_BASE_URL).origin
      && parsed.pathname.startsWith("/_market-radar/evidence/")
      && parsed.search === ""
      && parsed.hash === "",
    "evidence_retrieve_url_invalid",
  );
  ensure(proxyHost === "127.0.0.1" && proxyPort === 7892,
    "evidence_retrieve_proxy_invalid");
  const root = await mkdtemp(join(tmpdir(), "market-radar-evidence-download-"));
  const bodyPath = join(root, "body.mre");
  try {
    await chmod(root, 0o700);
    const { stdout } = await execFileAsync(curlPath, [
      "--silent",
      "--show-error",
      "--connect-timeout", "10",
      "--max-time", "30",
      "--max-filesize", String(PRODUCTION_EVIDENCE_MAX_SEALED_BYTES),
      "--max-redirs", "0",
      "--proto", "=http,https",
      "--socks5-hostname", `${proxyHost}:${proxyPort}`,
      "--output", bodyPath,
      "--write-out", "%{http_code}",
      parsed.href,
    ], { encoding: "utf8", maxBuffer: 32 * 1024, timeout: 40_000 });
    ensure(/^\d{3}$/u.test(stdout), "evidence_retrieve_http_status_invalid");
    const statusCode = Number(stdout);
    const body = await readFile(bodyPath).catch((error) => {
      if (error?.code === "ENOENT") return Buffer.alloc(0);
      throw error;
    });
    ensure(body.length <= PRODUCTION_EVIDENCE_MAX_SEALED_BYTES,
      "evidence_retrieve_body_too_large");
    return { body, statusCode };
  } catch (error) {
    if (error instanceof ProductionEvidenceRetrieveError) throw error;
    throw new ProductionEvidenceRetrieveError("evidence_retrieve_transport_failed", {
      exitCode: Number.isInteger(error?.code) ? error.code : null,
      stderrSha256: sha256(String(error?.stderr ?? "")),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function retrieveProductionEvidence({
  baseUrl = PRODUCTION_EVIDENCE_BASE_URL,
  dispatchId,
  expectedSchemaVersion,
  fetcher = curlProductionEvidence,
  now = () => new Date(),
  pollMs = PRODUCTION_EVIDENCE_POLL_MS,
  recipientPrivateKey,
  sleeper = sleep,
  trustedSignerPublicKey,
  verifierOptions = {},
  waitMs = PRODUCTION_EVIDENCE_WAIT_MS,
}) {
  ensure(typeof dispatchId === "string" && DISPATCH_ID.test(dispatchId),
    "evidence_retrieve_dispatch_id_invalid");
  ensure(typeof expectedSchemaVersion === "string" && SCHEMA_ID.test(expectedSchemaVersion),
    "evidence_retrieve_expected_schema_invalid");
  ensure(Number.isSafeInteger(waitMs) && waitMs >= 0 && waitMs <= 5 * 60_000,
    "evidence_retrieve_wait_invalid");
  ensure(Number.isSafeInteger(pollMs) && pollMs >= 100 && pollMs <= 30_000,
    "evidence_retrieve_poll_invalid");
  const parsedBase = validateBaseUrl(baseUrl);
  const objectName = evidenceObjectName(dispatchId);
  const url = new URL(objectName, parsedBase).href;
  const startedAt = now();
  ensure(startedAt instanceof Date && Number.isFinite(startedAt.getTime()),
    "evidence_retrieve_clock_invalid");
  let attempts = 0;
  while (true) {
    attempts += 1;
    const response = await fetcher(url);
    ensure(
      response
        && Number.isInteger(response.statusCode)
        && Buffer.isBuffer(response.body),
      "evidence_retrieve_response_invalid",
    );
    if (response.statusCode === 200) {
      ensure(
        response.body.length > 0
          && response.body.length <= PRODUCTION_EVIDENCE_MAX_SEALED_BYTES,
        "evidence_retrieve_body_invalid",
      );
      let sealed;
      try {
        sealed = JSON.parse(response.body.toString("utf8"));
      } catch {
        throw new ProductionEvidenceRetrieveError("evidence_retrieve_body_invalid");
      }
      ensure(canonicalJson(sealed) === response.body.toString("utf8"),
        "evidence_retrieve_body_not_canonical");
      const retrievedAt = now();
      try {
        const receipt = await openProductionEvidence({
          dispatchId,
          expectedSchemaVersion,
          now: retrievedAt,
          recipientPrivateKey,
          sealed,
          trustedSignerPublicKey,
          verifierOptions,
        });
        return { attempts, objectName, receipt, sealed, url };
      } catch (error) {
        if (error instanceof ProductionEvidenceError) {
          throw new ProductionEvidenceRetrieveError(
            `evidence_retrieve_verification_failed:${error.reason}`,
          );
        }
        throw error;
      }
    }
    ensure(response.statusCode === 404, "evidence_retrieve_http_status_rejected", {
      statusCode: response.statusCode,
    });
    const current = now();
    ensure(current instanceof Date && Number.isFinite(current.getTime()),
      "evidence_retrieve_clock_invalid");
    if (current.getTime() - startedAt.getTime() >= waitMs) {
      throw new ProductionEvidenceRetrieveError("evidence_retrieve_wait_expired", {
        attempts,
      });
    }
    await sleeper(pollMs);
  }
}

async function ensureOutputRoot(root) {
  ensure(isAbsolute(root), "evidence_retrieve_output_root_invalid");
  const resolved = resolve(root);
  const cwd = resolve(process.cwd());
  ensure(resolved !== cwd && !resolved.startsWith(`${cwd}${sep}`),
    "evidence_retrieve_output_inside_worktree");
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  ensure(await realpath(resolved) === resolved, "evidence_retrieve_output_root_unsafe");
  return resolved;
}

async function writeExclusive(path, bytes, mode = 0o600) {
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  await writeFile(temporary, bytes, { flag: "wx", mode });
  try {
    await link(temporary, path);
    await unlink(temporary);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    if (error?.code === "EEXIST") {
      throw new ProductionEvidenceRetrieveError("evidence_retrieve_output_already_exists");
    }
    throw error;
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export async function persistProductionEvidenceRetrieval({
  dispatchId,
  outputRoot = PRODUCTION_EVIDENCE_LOCAL_OUTPUT_ROOT,
  retrieval,
}) {
  ensure(retrieval?.receipt?.dispatchId === dispatchId,
    "evidence_retrieve_persistence_binding_invalid");
  const root = await ensureOutputRoot(outputRoot);
  const prefix = evidenceObjectName(dispatchId).replace(/\.mre$/u, "");
  const paths = {
    payload: join(root, `${prefix}.payload.json`),
    receipt: join(root, `${prefix}.receipt.json`),
    sealed: join(root, `${prefix}.sealed.mre`),
  };
  const files = [
    [paths.payload, Buffer.from(canonicalJson(retrieval.receipt.payload))],
    [paths.receipt, Buffer.from(canonicalJson(retrieval.receipt))],
    [paths.sealed, Buffer.from(canonicalJson(retrieval.sealed))],
  ];
  for (const [path] of files) {
    await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
      .then(async (handle) => {
        await handle.close();
        throw new ProductionEvidenceRetrieveError("evidence_retrieve_output_already_exists");
      })
      .catch((error) => {
        if (error instanceof ProductionEvidenceRetrieveError) throw error;
        if (error?.code !== "ENOENT") throw error;
      });
  }
  const written = [];
  try {
    for (const [path, bytes] of files) {
      await writeExclusive(path, bytes);
      written.push(path);
    }
  } catch (error) {
    for (const path of written) await unlink(path).catch(() => {});
    throw error;
  }
  return {
    dispatchId,
    paths,
    status: "PASS_PRODUCTION_EVIDENCE_RETRIEVAL_PERSISTED",
  };
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  ensure(rest.length % 2 === 0, "evidence_retrieve_arguments_invalid");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    ensure(
      /^--[a-z][a-z-]*$/u.test(key ?? "")
        && typeof value === "string"
        && !value.startsWith("--")
        && options[key.slice(2)] === undefined,
      "evidence_retrieve_arguments_invalid",
    );
    options[key.slice(2)] = value;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  ensure(
    command === "retrieve"
      && options["dispatch-id"]
      && options["expected-schema"]
      && Object.keys(options).length === 2,
    "evidence_retrieve_command_invalid",
  );
  const dispatchId = options["dispatch-id"];
  const recipientPrivateKey = await readPrivateKeyNoFollow(
    PRODUCTION_EVIDENCE_LOCAL_PRIVATE_KEY,
  );
  const trustedSignerPublicKey = await trustedProductionHostPublicKey();
  const retrieval = await retrieveProductionEvidence({
    dispatchId,
    expectedSchemaVersion: options["expected-schema"],
    recipientPrivateKey,
    trustedSignerPublicKey,
  });
  const persisted = await persistProductionEvidenceRetrieval({
    dispatchId,
    retrieval,
  });
  process.stdout.write(canonicalJson({
    attempts: retrieval.attempts,
    dispatchId,
    objectName: retrieval.objectName,
    payloadSha256: retrieval.receipt.payloadSha256,
    persisted,
    status: "PASS_PRODUCTION_EVIDENCE_AUTONOMOUSLY_RETRIEVED",
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(canonicalJson({
      details: error instanceof ProductionEvidenceRetrieveError ? error.details : undefined,
      reason: error instanceof ProductionEvidenceRetrieveError
        ? error.reason
        : "unexpected_error",
      status: "BLOCKED",
    }));
    process.exitCode = 1;
  });
}
