#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  validateP0RCosProvisioningPlan,
} from "./m1-production-storage-p0r-cos-provisioning.mjs";
import {
  LISTENER_OBSERVATION_SCHEMA,
  REMOTE_LISTENER_OBSERVATION_SCHEMA,
  ROUTE_EVIDENCE_SCHEMA,
  ROUTE_TARGET_SCHEMA,
  TENCENT_FIREWALL_CAPTURE_SCHEMA,
  buildListenerObservation,
  buildListenerRemoteCommand,
  buildRouteEvidence,
  routeTargetDigest,
  validateRemoteListenerObservation,
  validateRouteTarget,
} from "./m1-production-storage-p0r-route-authority.mjs";
import {
  readSecureControlFile,
  validateRouteEvidence,
  validateTransactionLease,
} from "./m1-production-storage-p0r-transaction.mjs";
import {
  canonicalJson,
  sha256,
} from "./fixed-channel/production-dispatch.mjs";

const execFileAsync = promisify(execFile);

const CURL_PATH = "/usr/bin/curl";
const GIT_PATH = "/usr/bin/git";
const SSH_PATH = "/usr/bin/ssh";
const NC_PATH = "/usr/bin/nc";
const SSH_IDENTITY_PATH = "/Users/chuan/.ssh/chuan_radar_tencent_ed25519";
const SSH_PUBLIC_KEY_PATH = "/Users/chuan/.ssh/chuan_radar_tencent_ed25519.pub";
const SSH_KNOWN_HOSTS_PATH = "/Users/chuan/.ssh/known_hosts";
const EGRESS_ENDPOINTS = Object.freeze([
  "https://api.ipify.org",
  "https://ifconfig.me/ip",
]);
const MAX_REMOTE_OBSERVATION_BYTES = 16_384;
const MAX_PUBLIC_FILE_BYTES = 1_048_576;
const SAFE_REASON = /^[a-z0-9_]{1,128}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const ED25519_PUBLIC_KEY = /^ssh-ed25519 [A-Za-z0-9+/]+={0,3}(?: [^\r\n]{1,256})?\n$/u;

const SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SOURCE_DIRECTORY, "../../..");

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label}_invalid`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label}_keys_invalid`);
}

export function parseCanonicalJsonSource(source, label) {
  assert.ok(source && Buffer.isBuffer(source.bytes), `${label}_source_invalid`);
  const text = source.bytes.toString("utf8");
  const value = JSON.parse(text);
  assert.equal(text, canonicalJson(value), `${label}_not_canonical`);
  return value;
}

async function readSecureJson(path, label) {
  const source = await readSecureControlFile(path, label);
  return { ...source, value: parseCanonicalJsonSource(source, label) };
}

function stableFileIdentity(facts) {
  return {
    ctimeNs: facts.ctimeNs,
    dev: facts.dev,
    gid: facts.gid,
    ino: facts.ino,
    mode: facts.mode,
    mtimeNs: facts.mtimeNs,
    nlink: facts.nlink,
    size: facts.size,
    uid: facts.uid,
  };
}

function assertStableFileIdentity(expected, actual, label) {
  assert.deepEqual(
    stableFileIdentity(actual),
    stableFileIdentity(expected),
    `${label}_identity_changed`,
  );
}

export async function readStableOwnedPublicFile(path, label) {
  const resolved = resolve(path);
  let handle;
  try {
    handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === "ELOOP") {
      assert.fail(`${label}_symlink_forbidden`);
    }
    throw error;
  }
  try {
    const before = await handle.stat({ bigint: true });
    assert.equal(before.isFile(), true, `${label}_not_regular`);
    assert.ok(
      before.size > 0n && before.size <= BigInt(MAX_PUBLIC_FILE_BYTES),
      `${label}_size_invalid`,
    );
    if (typeof process.getuid === "function") {
      assert.equal(before.uid, BigInt(process.getuid()), `${label}_owner_invalid`);
    }
    assert.equal(await realpath(resolved), resolved, `${label}_path_not_canonical`);
    const pathBefore = await lstat(resolved, { bigint: true });
    assertStableFileIdentity(before, pathBefore, label);
    const expectedSize = Number(before.size);
    const buffer = Buffer.alloc(expectedSize + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        length,
        buffer.length - length,
        null,
      );
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    assert.equal(length, expectedSize, `${label}_size_changed_during_read`);
    const after = await handle.stat({ bigint: true });
    assertStableFileIdentity(before, after, label);
    const pathAfter = await lstat(resolved, { bigint: true });
    assertStableFileIdentity(before, pathAfter, label);
    assert.equal(await realpath(resolved), resolved, `${label}_path_changed_during_read`);
    return buffer.subarray(0, length);
  } finally {
    await handle.close();
  }
}

async function assertSecureIdentityFile(path) {
  const resolved = resolve(path);
  assert.equal(await realpath(resolved), resolved, "ssh_identity_path_not_canonical");
  const facts = await lstat(resolved, { bigint: true });
  assert.equal(facts.isSymbolicLink(), false, "ssh_identity_symlink_forbidden");
  assert.equal(facts.isFile(), true, "ssh_identity_not_regular");
  assert.equal(facts.mode & 0o077n, 0n, "ssh_identity_mode_too_open");
  if (typeof process.getuid === "function") {
    assert.equal(facts.uid, BigInt(process.getuid()), "ssh_identity_owner_invalid");
  }
  return stableFileIdentity(facts);
}

export async function writeExclusiveCanonicalJson(path, value) {
  const resolved = resolve(path);
  const parent = await realpath(dirname(resolved));
  assert.equal(dirname(resolved), parent, "route_output_parent_not_canonical");
  const handle = await open(
    resolved,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(canonicalJson(value), "utf8");
    await handle.sync();
    const facts = await handle.stat();
    assert.equal(facts.isFile(), true, "route_output_not_regular");
    assert.equal(facts.mode & 0o077, 0, "route_output_mode_too_open");
  } finally {
    await handle.close();
  }
}

async function measureEgress() {
  const values = [];
  for (const endpoint of EGRESS_ENDPOINTS) {
    const { stdout } = await execFileAsync(CURL_PATH, [
      "--silent",
      "--show-error",
      "--fail",
      "--max-time",
      "15",
      "--socks5-hostname",
      "127.0.0.1:7892",
      endpoint,
    ], { encoding: "utf8", maxBuffer: 4_096, timeout: 20_000 });
    values.push(stdout.trim());
  }
  return values;
}

async function sourceFacts() {
  const [{ stdout: head }, { stdout: status }] = await Promise.all([
    execFileAsync(GIT_PATH, ["-C", REPOSITORY_ROOT, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }),
    execFileAsync(GIT_PATH, ["-C", REPOSITORY_ROOT, "status", "--porcelain=v1"], {
      encoding: "utf8",
    }),
  ]);
  return { clean: status.trim() === "", head: head.trim() };
}

function targetFromLease(lease) {
  return {
    schemaVersion: ROUTE_TARGET_SCHEMA,
    provider: lease.resources.firewall.provider,
    apiEndpoint: lease.resources.firewall.apiEndpoint,
    apiAction: lease.resources.firewall.apiAction,
    apiVersion: lease.resources.firewall.apiVersion,
    region: lease.resources.firewall.region,
    instanceId: lease.resources.firewall.instanceId,
    sshHost: lease.resources.listener.host,
    sshHostAlias: lease.resources.listener.hostAlias,
    sshUser: lease.resources.listener.user,
    listenerPort: lease.resources.listener.port,
    listenerUnit: lease.resources.listener.unit,
    containsSecret: false,
  };
}

function validateLeaseTarget(lease, target) {
  validateTransactionLease(lease);
  validateRouteTarget(target);
  assert.deepEqual(target, targetFromLease(lease), "route_target_lease_mismatch");
  assert.equal(routeTargetDigest(target), lease.routeTargetSha256, "route_target_digest_mismatch");
}

export function buildListenerSshArguments({ lease, target }) {
  validateLeaseTarget(lease, target);
  return [
    "-F", "/dev/null",
    "-p", String(target.listenerPort),
    "-i", SSH_IDENTITY_PATH,
    "-o", "BatchMode=yes",
    "-o", "ClearAllForwardings=yes",
    "-o", "ConnectTimeout=12",
    "-o", "ConnectionAttempts=1",
    "-o", "ExitOnForwardFailure=yes",
    "-o", `HostKeyAlias=${target.sshHostAlias}`,
    "-o", "HostKeyAlgorithms=ssh-ed25519",
    "-o", "IdentitiesOnly=yes",
    "-o", "LogLevel=ERROR",
    "-o", `ProxyCommand=${NC_PATH} -x 127.0.0.1:7892 -X 5 %h %p`,
    "-o", "RequestTTY=no",
    "-o", "ServerAliveCountMax=1",
    "-o", "ServerAliveInterval=10",
    "-o", "StrictHostKeyChecking=yes",
    "-o", `UserKnownHostsFile=${SSH_KNOWN_HOSTS_PATH}`,
    `${target.sshUser}@${target.sshHost}`,
    buildListenerRemoteCommand(
      lease.runId,
      lease.resources.listener.observerScriptSha256,
    ),
  ];
}

export function parseCanonicalRemoteObservation(stdout, now) {
  assert.equal(typeof stdout, "string", "remote_listener_stdout_invalid");
  assert.ok(Buffer.byteLength(stdout, "utf8") <= MAX_REMOTE_OBSERVATION_BYTES, "remote_listener_stdout_too_large");
  const observation = JSON.parse(stdout);
  assert.equal(stdout, canonicalJson(observation), "remote_listener_stdout_not_canonical");
  return validateRemoteListenerObservation(observation, now);
}

async function observeListener(options) {
  exactKeys(options, ["lease", "output", "route-target"], "observe_listener_options");
  const lease = (await readSecureJson(options.lease, "lease")).value;
  const target = (await readSecureJson(options["route-target"], "route_target")).value;
  validateLeaseTarget(lease, target);
  const identityBefore = await assertSecureIdentityFile(SSH_IDENTITY_PATH);
  const knownHosts = await readSecureControlFile(SSH_KNOWN_HOSTS_PATH, "ssh_known_hosts");
  const publicKey = await readStableOwnedPublicFile(SSH_PUBLIC_KEY_PATH, "ssh_public_key");
  assert.ok(ED25519_PUBLIC_KEY.test(publicKey.toString("utf8")), "ssh_public_key_invalid");
  const { stderr, stdout } = await execFileAsync(
    SSH_PATH,
    buildListenerSshArguments({ lease, target }),
    {
      encoding: "utf8",
      maxBuffer: MAX_REMOTE_OBSERVATION_BYTES,
      timeout: 30_000,
    },
  );
  assert.equal(stderr, "", "remote_listener_stderr_nonempty");
  assert.deepEqual(
    await assertSecureIdentityFile(SSH_IDENTITY_PATH),
    identityBefore,
    "ssh_identity_changed_during_observation",
  );
  const knownHostsAfter = await readSecureControlFile(
    SSH_KNOWN_HOSTS_PATH,
    "ssh_known_hosts_after",
  );
  assert.equal(
    sha256(knownHostsAfter.bytes),
    sha256(knownHosts.bytes),
    "ssh_known_hosts_changed_during_observation",
  );
  assert.equal(
    sha256(await readStableOwnedPublicFile(SSH_PUBLIC_KEY_PATH, "ssh_public_key_after")),
    sha256(publicKey),
    "ssh_public_key_changed_during_observation",
  );
  const now = new Date().toISOString();
  const remoteObservation = parseCanonicalRemoteObservation(stdout, now);
  const observation = buildListenerObservation({
    identityPublicKeySha256: sha256(publicKey),
    knownHostsSha256: sha256(knownHosts.bytes),
    lease,
    now,
    remoteObservation,
    target,
  });
  await writeExclusiveCanonicalJson(options.output, observation);
  process.stdout.write(canonicalJson({
    containsSecret: false,
    listenerObservationSha256: sha256(canonicalJson(observation)),
    schemaVersion: LISTENER_OBSERVATION_SCHEMA,
    status: "PASS_P0R_AUTHORITATIVE_LISTENER_OBSERVATION",
  }));
}

async function produce(options) {
  exactKeys(options, [
    "firewall-capture",
    "lease",
    "listener-observation",
    "output",
    "plan",
    "route-target",
  ], "produce_options");
  const lease = (await readSecureJson(options.lease, "lease")).value;
  const planSource = await readSecureControlFile(options.plan, "plan");
  const target = (await readSecureJson(options["route-target"], "route_target")).value;
  const firewallCapture = (
    await readSecureJson(options["firewall-capture"], "firewall_capture")
  ).value;
  const listenerObservation = (
    await readSecureJson(options["listener-observation"], "listener_observation")
  ).value;
  validateLeaseTarget(lease, target);
  const plan = validateP0RCosProvisioningPlan(JSON.parse(planSource.bytes.toString("utf8")));
  assert.equal(sha256(planSource.bytes), lease.planSha256, "route_plan_sha_mismatch");
  assert.equal(plan.sourceCommit, lease.sourceCommit, "route_plan_source_mismatch");
  assert.equal(plan.credentialGrant.runId, lease.runId, "route_plan_run_mismatch");
  const facts = await sourceFacts();
  assert.ok(COMMIT.test(facts.head), "route_source_head_invalid");
  assert.deepEqual(
    facts,
    { clean: true, head: lease.sourceCommit },
    "route_source_not_clean_exact_lease_commit",
  );
  const [egressA, egressB] = await measureEgress();
  const now = new Date().toISOString();
  const evidence = buildRouteEvidence({
    egressA,
    egressB,
    firewallCapture,
    lease,
    listenerObservation,
    now,
    target,
  });
  validateRouteEvidence(lease, evidence, now);
  await writeExclusiveCanonicalJson(options.output, evidence);
  process.stdout.write(canonicalJson({
    containsSecret: false,
    routeEvidenceSha256: sha256(canonicalJson(evidence)),
    schemaVersion: ROUTE_EVIDENCE_SCHEMA,
    status: "PASS_P0R_AUTHORITATIVE_ROUTE_EVIDENCE",
  }));
}

function parseOptions(argv) {
  const [command, ...tail] = argv;
  const options = {};
  for (let index = 0; index < tail.length; index += 2) {
    const name = tail[index];
    const value = tail[index + 1];
    assert.ok(name?.startsWith("--") && value !== undefined, "arguments_invalid");
    const key = name.slice(2);
    assert.equal(options[key], undefined, `duplicate_option_${key}`);
    options[key] = value;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseOptions(process.argv.slice(2));
  if (command === "plan") {
    exactKeys(options, [], "plan_options");
    process.stdout.write(canonicalJson({
      containsSecret: false,
      canonicalRouteControlInputsRequired: true,
      egressEndpointCount: EGRESS_ENDPOINTS.length,
      exactTencentFirewallPaginationRequired: true,
      firewallCaptureSchema: TENCENT_FIREWALL_CAPTURE_SCHEMA,
      firewallRuleIdentityRecomputed: true,
      listenerObservationSchema: LISTENER_OBSERVATION_SCHEMA,
      listenerStrictHostIdentityRequired: true,
      noClobberCanonicalMode600OutputRequired: true,
      remoteListenerObservationSchema: REMOTE_LISTENER_OBSERVATION_SCHEMA,
      routeEvidenceSchema: ROUTE_EVIDENCE_SCHEMA,
      routeTargetSchema: ROUTE_TARGET_SCHEMA,
      status: "PASS_P0R_ROUTE_EVIDENCE_PRODUCER_PLAN",
    }));
    return;
  }
  if (command === "observe-listener") return observeListener(options);
  if (command === "produce") return produce(options);
  throw new Error("command_invalid");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    const reason = error instanceof Error && SAFE_REASON.test(error.message)
      ? error.message
      : "p0r_route_evidence_unexpected_failure";
    process.stderr.write(canonicalJson({
      containsSecret: false,
      reason,
      status: "BLOCKED_P0R_ROUTE_EVIDENCE_PRODUCER",
    }));
    process.exitCode = 1;
  });
}
