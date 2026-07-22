#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
} from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const ACCEPTANCE_PACKAGE_ID = "WP-G0-FIXED-DISPATCH-FIRST-SIGNED-ACCEPTANCE";
export const ACCEPTANCE_REQUEST_SCHEMA = "market-radar-production-dispatch-acceptance-request.v1";
export const ACCEPTANCE_RESULT_SCHEMA = "market-radar-production-dispatch-acceptance-result.v1";
export const ACCEPTANCE_MANIFEST_SCHEMA = "market-radar-production-dispatch-acceptance-manifest.v1";
export const ACCEPTANCE_ENTRYPOINT = "scripts/v2/production/fixed-channel-acceptance-entrypoint.sh";
export const ACCEPTANCE_RUNNER = "scripts/v2/production/fixed-channel/production-dispatch-acceptance.mjs";
export const ACCEPTANCE_MANIFEST = "dispatch-acceptance-manifest.json";
export const ACCEPTANCE_SUCCESS_MARKER = "PASS_FIXED_DISPATCH_FIRST_SIGNED_ACCEPTANCE";
export const ACCEPTANCE_DOCKER_READ_ACCESS_MODE = "sudo_noninteractive_exact_read_only";

export const DEFAULT_ACCEPTANCE_POLICY = Object.freeze({
  dispatchStateRoot: "/var/lib/market-radar-production-dispatch",
  expectedContainerCount: 11,
  expectedRedisContainer: "chuan-market-radar-redis-1",
  expectedTimerUnit: "market-radar-production-dispatch.timer",
  productionWorktree: "/home/ubuntu/apps/chuan-market-radar",
  stagingRoot: "/home/ubuntu/.cache/market-radar-v2",
});

const REQUEST_KEYS = Object.freeze([
  "applicationMutationAllowed",
  "approvalExpiresAt",
  "approvalIssuedAt",
  "artifactManifestSha256",
  "automaticRollbackRequired",
  "databaseMutationAllowed",
  "dispatchId",
  "dispatchStateRoot",
  "dockerReadAccessMode",
  "expectedContainerCount",
  "expectedContainerIds",
  "expectedHealth",
  "expectedProductionHead",
  "expectedRedisContainer",
  "expectedTimerUnit",
  "launchSuccessMarker",
  "maxExecutions",
  "packageId",
  "productionMutationScope",
  "productionWorktree",
  "redisMutationAllowed",
  "resultPath",
  "revocationEpoch",
  "runnerUnitName",
  "schemaVersion",
  "sessionIndependentExecutionRequired",
  "sourceCommit",
  "sourceRef",
  "stagingDirectory",
  "temporaryStagingCleanupRequired",
  "transportBundleSha256",
  "transportContainsSecrets",
  "transportMethod",
  "workerMutationAllowed",
]);

const HEALTH_KEYS = Object.freeze([
  "level",
  "persistenceDatabaseStatus",
  "scanFreshness",
  "scanStatus",
]);

const MANIFEST_KEYS = Object.freeze([
  "archiveFormat",
  "containsSecrets",
  "files",
  "mutationScope",
  "packageId",
  "schemaVersion",
  "sourceCommit",
  "sourceDateEpoch",
]);

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const DISPATCH_ID = /^[a-z0-9][a-z0-9-]{15,100}$/u;
const SOURCE_REF = /^refs\/heads\/(?:main|codex\/[a-z0-9][a-z0-9._/-]{2,180})$/u;
const RUNNER_UNIT = /^market-radar-dispatch-accept-[a-z0-9][a-z0-9-]{7,36}$/u;

export class AcceptanceError extends Error {
  constructor(reason, details = undefined) {
    super(reason);
    this.name = "AcceptanceError";
    this.reason = reason;
    this.details = details;
  }
}

function ensure(condition, reason, details = undefined) {
  if (!condition) throw new AcceptanceError(reason, details);
}

function exactKeys(value, expected, reason) {
  ensure(value && typeof value === "object" && !Array.isArray(value), reason);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  ensure(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]),
    reason, { actual, expected: wanted });
}

function sortedValue(value) {
  if (Array.isArray(value)) return value.map(sortedValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(sortedValue(value))}\n`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseTimestamp(value, reason) {
  const timestamp = new Date(value);
  ensure(Number.isFinite(timestamp.getTime()) && timestamp.toISOString() === value, reason);
  return timestamp;
}

function isDirectChild(path, parent) {
  return dirname(resolve(path)) === resolve(parent);
}

function assertAbsoluteWithin(path, parent, reason) {
  ensure(typeof path === "string" && path.startsWith("/") && !path.includes("\0"), reason);
  const absolute = resolve(path);
  ensure(absolute.startsWith(`${resolve(parent)}${sep}`), reason);
  return absolute;
}

export function validateAcceptanceRequest(request, {
  now = new Date(),
  policy = DEFAULT_ACCEPTANCE_POLICY,
} = {}) {
  exactKeys(request, REQUEST_KEYS, "acceptance_request_keys_invalid");
  exactKeys(request.expectedHealth, HEALTH_KEYS, "acceptance_health_keys_invalid");
  ensure(request.schemaVersion === ACCEPTANCE_REQUEST_SCHEMA, "acceptance_request_schema_invalid");
  ensure(request.packageId === ACCEPTANCE_PACKAGE_ID, "acceptance_package_id_invalid");
  ensure(DISPATCH_ID.test(request.dispatchId), "acceptance_dispatch_id_invalid");
  ensure(COMMIT.test(request.sourceCommit), "acceptance_source_commit_invalid");
  ensure(SOURCE_REF.test(request.sourceRef) && !request.sourceRef.includes(".."),
    "acceptance_source_ref_invalid");
  ensure(COMMIT.test(request.expectedProductionHead), "acceptance_production_head_invalid");
  ensure(RUNNER_UNIT.test(request.runnerUnitName), "acceptance_runner_unit_invalid");
  ensure(request.launchSuccessMarker === ACCEPTANCE_SUCCESS_MARKER,
    "acceptance_success_marker_invalid");
  ensure(request.dispatchStateRoot === policy.dispatchStateRoot,
    "acceptance_dispatch_state_root_invalid");
  ensure(request.productionWorktree === policy.productionWorktree,
    "acceptance_production_worktree_invalid");
  ensure(request.expectedRedisContainer === policy.expectedRedisContainer,
    "acceptance_redis_container_invalid");
  ensure(request.expectedTimerUnit === policy.expectedTimerUnit,
    "acceptance_timer_unit_invalid");
  ensure(request.expectedContainerCount === policy.expectedContainerCount,
    "acceptance_container_count_invalid");
  ensure(Array.isArray(request.expectedContainerIds)
    && request.expectedContainerIds.length === request.expectedContainerCount,
  "acceptance_container_ids_invalid");
  ensure(request.expectedContainerIds.every((id) => SHA256.test(id)),
    "acceptance_container_ids_invalid");
  ensure(new Set(request.expectedContainerIds).size === request.expectedContainerIds.length,
    "acceptance_container_ids_duplicate");
  ensure(JSON.stringify(request.expectedContainerIds)
    === JSON.stringify([...request.expectedContainerIds].sort()),
  "acceptance_container_ids_not_sorted");
  ensure(SHA256.test(request.transportBundleSha256), "acceptance_bundle_sha256_invalid");
  ensure(SHA256.test(request.artifactManifestSha256), "acceptance_manifest_sha256_invalid");
  ensure(request.transportMethod === "signed_git_bundle", "acceptance_transport_method_invalid");
  ensure(request.transportContainsSecrets === false, "acceptance_secret_transport_forbidden");
  ensure(request.dockerReadAccessMode === ACCEPTANCE_DOCKER_READ_ACCESS_MODE,
    "acceptance_docker_read_access_mode_invalid");
  ensure(request.productionMutationScope === "dispatch_state_staging_and_evidence_only",
    "acceptance_mutation_scope_invalid");
  for (const key of [
    "applicationMutationAllowed",
    "databaseMutationAllowed",
    "redisMutationAllowed",
    "workerMutationAllowed",
  ]) ensure(request[key] === false, `acceptance_${key}_must_be_false`);
  ensure(request.automaticRollbackRequired === true, "acceptance_rollback_required");
  ensure(request.sessionIndependentExecutionRequired === true,
    "acceptance_session_independence_required");
  ensure(request.temporaryStagingCleanupRequired === true, "acceptance_cleanup_required");
  ensure(request.maxExecutions === 1, "acceptance_execution_count_invalid");
  ensure(Number.isSafeInteger(request.revocationEpoch) && request.revocationEpoch >= 0,
    "acceptance_revocation_epoch_invalid");
  ensure(request.expectedHealth.level === "ready"
    && request.expectedHealth.scanStatus === "ready"
    && request.expectedHealth.scanFreshness === "fresh"
    && request.expectedHealth.persistenceDatabaseStatus === "ready",
  "acceptance_health_expectation_weakened");

  const staging = assertAbsoluteWithin(request.stagingDirectory, policy.stagingRoot,
    "acceptance_staging_directory_invalid");
  ensure(isDirectChild(staging, policy.stagingRoot)
    && basename(staging).startsWith("g0-fixed-dispatch-acceptance-"),
  "acceptance_staging_directory_invalid");
  const resultPath = assertAbsoluteWithin(request.resultPath, policy.dispatchStateRoot,
    "acceptance_result_path_invalid");
  ensure(dirname(resultPath) === join(policy.dispatchStateRoot, "acceptance")
    && basename(resultPath) === `${request.dispatchId}.json`,
  "acceptance_result_path_invalid");

  const issuedAt = parseTimestamp(request.approvalIssuedAt, "acceptance_issued_at_invalid");
  const expiresAt = parseTimestamp(request.approvalExpiresAt, "acceptance_expires_at_invalid");
  ensure(expiresAt > issuedAt && expiresAt.getTime() - issuedAt.getTime() <= 90 * 60_000,
    "acceptance_window_invalid");
  ensure(now >= issuedAt && now <= expiresAt, "acceptance_request_not_current");
  return request;
}

async function assertRegularFile(path, reason) {
  const facts = await lstat(path).catch(() => null);
  ensure(facts?.isFile() && !facts.isSymbolicLink(), reason);
  return facts;
}

async function readCanonicalJson(path, reason) {
  const raw = await readFile(path, "utf8");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AcceptanceError(reason);
  }
  ensure(raw === canonicalJson(value), `${reason}_not_canonical`);
  return { raw, value };
}

async function validateManifest(stagingDirectory, request) {
  const manifestPath = join(stagingDirectory, ACCEPTANCE_MANIFEST);
  const { raw, value: manifest } = await readCanonicalJson(manifestPath,
    "acceptance_manifest_invalid");
  exactKeys(manifest, MANIFEST_KEYS, "acceptance_manifest_keys_invalid");
  ensure(manifest.schemaVersion === ACCEPTANCE_MANIFEST_SCHEMA,
    "acceptance_manifest_schema_invalid");
  ensure(manifest.packageId === request.packageId, "acceptance_manifest_package_mismatch");
  ensure(manifest.sourceCommit === request.sourceCommit, "acceptance_manifest_commit_mismatch");
  ensure(manifest.containsSecrets === false, "acceptance_manifest_secret_boundary_invalid");
  ensure(manifest.mutationScope === request.productionMutationScope,
    "acceptance_manifest_mutation_scope_mismatch");
  ensure(manifest.archiveFormat === "ustar+gzip-n" && manifest.sourceDateEpoch === 946_684_800,
    "acceptance_manifest_reproducibility_invalid");
  ensure(sha256(raw) === request.artifactManifestSha256,
    "acceptance_manifest_sha256_mismatch");
  exactKeys(manifest.files, [ACCEPTANCE_ENTRYPOINT, ACCEPTANCE_RUNNER],
    "acceptance_manifest_files_invalid");
  for (const [path, expected] of Object.entries(manifest.files)) {
    ensure(SHA256.test(expected), "acceptance_manifest_file_sha_invalid");
    const bytes = await readFile(join(stagingDirectory, path));
    ensure(sha256(bytes) === expected, "acceptance_manifest_file_sha_mismatch", path);
  }
  return manifest;
}

async function validateDispatchBinding(stagingDirectory, request, requestRaw, bundleMarkerPath) {
  const { raw, value: envelope } = await readCanonicalJson(join(stagingDirectory, ".dispatch.json"),
    "acceptance_dispatch_envelope_invalid");
  const marker = (await readFile(bundleMarkerPath, "utf8")).trim();
  ensure(marker === request.transportBundleSha256, "acceptance_bundle_marker_mismatch");
  ensure(envelope.bundleSha256 === request.transportBundleSha256,
    "acceptance_dispatch_bundle_mismatch");
  ensure(envelope.approvalRequestSha256 === sha256(requestRaw),
    "acceptance_dispatch_request_mismatch");
  ensure(envelope.dispatchId === request.dispatchId
    && envelope.packageId === request.packageId
    && envelope.targetCommit === request.sourceCommit
    && envelope.sourceRef === request.sourceRef
    && envelope.runnerUnitName === request.runnerUnitName
    && envelope.stagingDirectory === request.stagingDirectory,
  "acceptance_dispatch_identity_mismatch");
  ensure(envelope.entrypointPath === ACCEPTANCE_ENTRYPOINT,
    "acceptance_dispatch_entrypoint_mismatch");
  ensure(envelope.launchSuccessMarker === request.launchSuccessMarker,
    "acceptance_dispatch_marker_mismatch");
  ensure(envelope.transportMethod === "signed_git_bundle"
    && envelope.transportContainsSecrets === false
    && envelope.productionMutation === true
    && envelope.maxExecutions === 1
    && envelope.sessionIndependentExecutionRequired === true
    && envelope.automaticRollbackRequired === true,
  "acceptance_dispatch_safety_binding_invalid");
  ensure(envelope.issuedAt === request.approvalIssuedAt
    && envelope.expiresAt === request.approvalExpiresAt
    && envelope.revocationEpoch === request.revocationEpoch,
  "acceptance_dispatch_authorization_binding_mismatch");
  return sha256(raw);
}

const PRODUCTION_COMMAND_PATHS = Object.freeze({
  curl: "/usr/bin/curl",
  docker: "/usr/bin/docker",
  git: "/usr/bin/git",
  ss: "/usr/bin/ss",
  sudo: "/usr/bin/sudo",
  systemctl: "/usr/bin/systemctl",
});

function sameArgs(actual, expected) {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

export function productionCommandInvocation(command, args) {
  ensure(Array.isArray(args)
    && args.every((value) => typeof value === "string" && !value.includes("\0")),
  "acceptance_command_arguments_invalid");
  ensure(["curl", "docker", "git", "ss", "systemctl"].includes(command),
    "acceptance_command_not_allowlisted");
  if (command === "docker") {
    const inventory = ["ps", "--no-trunc", "--format", "{{.ID}}"];
    const redisPing = ["exec", DEFAULT_ACCEPTANCE_POLICY.expectedRedisContainer, "redis-cli", "ping"];
    ensure(sameArgs(args, inventory) || sameArgs(args, redisPing),
      "acceptance_docker_command_not_read_only");
    return {
      args: ["-n", "--", PRODUCTION_COMMAND_PATHS.docker, ...args],
      executable: PRODUCTION_COMMAND_PATHS.sudo,
    };
  }
  return { args: [...args], executable: PRODUCTION_COMMAND_PATHS[command] };
}

export async function runProductionCommand(command, args, { execute = execFileAsync } = {}) {
  const invocation = productionCommandInvocation(command, args);
  try {
    const { stdout } = await execute(invocation.executable, invocation.args, {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (error) {
    if (error instanceof AcceptanceError) throw error;
    throw new AcceptanceError(`acceptance_command_${command}_failed`);
  }
}

const defaultCommandRunner = runProductionCommand;

function parseJsonObject(raw, reason) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AcceptanceError(reason);
  }
  ensure(value && typeof value === "object" && !Array.isArray(value), reason);
  return value;
}

function healthSummary(raw, expected) {
  const body = parseJsonObject(raw, "acceptance_health_json_invalid");
  const health = body.health;
  ensure(body.ok === true && health?.level === expected.level,
    "acceptance_health_level_invalid");
  ensure(health.scan?.status === expected.scanStatus
    && health.scan?.freshness === expected.scanFreshness,
  "acceptance_scan_health_invalid");
  ensure(health.persistence?.databaseStatus === expected.persistenceDatabaseStatus,
    "acceptance_persistence_health_invalid");
  return {
    level: health.level,
    persistenceDatabaseStatus: health.persistence.databaseStatus,
    scanFreshness: health.scan.freshness,
    scanStatus: health.scan.status,
  };
}

function normalizedLines(raw) {
  return raw.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).sort();
}

async function captureIdentity(request, run) {
  const productionHead = await run("git", ["-C", request.productionWorktree, "rev-parse", "HEAD"]);
  const worktreeStatus = await run("git", [
    "-C", request.productionWorktree, "status", "--porcelain=v1", "--untracked-files=all",
  ]);
  const containerIds = normalizedLines(await run("docker", [
    "ps", "--no-trunc", "--format", "{{.ID}}",
  ]));
  const listeners = normalizedLines(await run("ss", ["-lntH"]));
  const timerEnabled = await run("systemctl", ["is-enabled", request.expectedTimerUnit]);
  const timerActive = await run("systemctl", ["is-active", request.expectedTimerUnit]);
  const redis = await run("docker", [
    "exec", request.expectedRedisContainer, "redis-cli", "ping",
  ]);
  return {
    containerIds,
    listenerSha256: sha256(`${listeners.join("\n")}\n`),
    productionHead,
    redis,
    timerActive,
    timerEnabled,
    worktreeClean: worktreeStatus.length === 0,
  };
}

export function assertAcceptanceIdentity(identity, request, phase) {
  ensure(identity.productionHead === request.expectedProductionHead,
    `acceptance_${phase}_production_head_mismatch`);
  ensure(identity.worktreeClean === true, `acceptance_${phase}_worktree_dirty`);
  ensure(JSON.stringify(identity.containerIds) === JSON.stringify(request.expectedContainerIds),
    `acceptance_${phase}_container_identity_mismatch`);
  ensure(identity.timerEnabled === "enabled" && identity.timerActive === "active",
    `acceptance_${phase}_timer_invalid`);
  ensure(identity.redis === "PONG", `acceptance_${phase}_redis_invalid`);
}

async function fetchEndpoint(run, path) {
  return await run("curl", [
    "-kfsSL", "--max-time", "30", `http://127.0.0.1${path}`,
  ]);
}

async function writeResult(path, result) {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const parentFacts = await lstat(parent);
  ensure(parentFacts.isDirectory() && !parentFacts.isSymbolicLink(),
    "acceptance_result_parent_unsafe");
  ensure(await realpath(parent) === parent && await realpath(dirname(parent)) === dirname(parent),
    "acceptance_result_parent_not_canonical");
  const existing = await lstat(path).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  ensure(existing === null, "acceptance_result_already_exists");
  const temporary = `${path}.tmp-${Date.now()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(canonicalJson(result));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
  await chmod(path, 0o600);
  const directory = await open(parent, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export async function runAcceptance({
  bundleMarkerPath,
  commandRunner = defaultCommandRunner,
  now = new Date(),
  policy = DEFAULT_ACCEPTANCE_POLICY,
  requestPath,
}) {
  const requestFacts = await assertRegularFile(requestPath, "acceptance_request_file_unsafe");
  ensure((requestFacts.mode & 0o077) === 0, "acceptance_request_mode_unsafe");
  await assertRegularFile(bundleMarkerPath, "acceptance_bundle_marker_unsafe");
  const { raw: requestRaw, value: request } = await readCanonicalJson(requestPath,
    "acceptance_request_json_invalid");
  validateAcceptanceRequest(request, { now, policy });
  const stagingReal = await realpath(request.stagingDirectory);
  const requestReal = await realpath(requestPath);
  ensure(stagingReal === request.stagingDirectory
    && requestReal === join(stagingReal, "approval-request.json"),
  "acceptance_staging_identity_mismatch");
  const stagingFacts = await lstat(stagingReal);
  ensure(stagingFacts.isDirectory() && !stagingFacts.isSymbolicLink()
    && (stagingFacts.mode & 0o077) === 0,
  "acceptance_staging_mode_unsafe");
  await validateManifest(stagingReal, request);
  const dispatchEnvelopeSha256 = await validateDispatchBinding(
    stagingReal, request, requestRaw, bundleMarkerPath,
  );

  const calls = [];
  const run = async (command, args) => {
    calls.push({ command, args: [...args] });
    return await commandRunner(command, args);
  };
  const before = await captureIdentity(request, run);
  assertAcceptanceIdentity(before, request, "before");
  const healthBefore = healthSummary(await fetchEndpoint(run, "/api/health"), request.expectedHealth);
  const frontend = await fetchEndpoint(run, "/api/frontend/radar-contract");
  const backend = await fetchEndpoint(run, "/api/radar/backend-contract");
  parseJsonObject(frontend, "acceptance_frontend_contract_invalid");
  parseJsonObject(backend, "acceptance_backend_contract_invalid");
  const healthAfter = healthSummary(await fetchEndpoint(run, "/api/health"), request.expectedHealth);
  const after = await captureIdentity(request, run);
  assertAcceptanceIdentity(after, request, "after");
  ensure(before.productionHead === after.productionHead
    && JSON.stringify(before.containerIds) === JSON.stringify(after.containerIds)
    && before.listenerSha256 === after.listenerSha256,
  "acceptance_production_identity_drift");

  const commandSet = [...new Set(calls.map(({ command }) => command))].sort();
  ensure(JSON.stringify(commandSet) === JSON.stringify(["curl", "docker", "git", "ss", "systemctl"]),
    "acceptance_command_boundary_drift");
  const baseResult = {
    applicationMutationAttempted: false,
    backendContract: { bytes: Buffer.byteLength(backend), sha256: sha256(backend) },
    containerCount: after.containerIds.length,
    containerIdentitySha256: sha256(`${after.containerIds.join("\n")}\n`),
    databaseMutationAttempted: false,
    dockerReadAccessMode: request.dockerReadAccessMode,
    dispatchEnvelopeSha256,
    dispatchId: request.dispatchId,
    frontendContract: { bytes: Buffer.byteLength(frontend), sha256: sha256(frontend) },
    healthAfter,
    healthBefore,
    listenerSha256: after.listenerSha256,
    packageId: request.packageId,
    productionHeadAfter: after.productionHead,
    productionHeadBefore: before.productionHead,
    productionMutationScope: request.productionMutationScope,
    productionWorktreeCleanAfter: after.worktreeClean,
    productionWorktreeCleanBefore: before.worktreeClean,
    recordedAt: now.toISOString(),
    redisAfter: after.redis,
    redisBefore: before.redis,
    redisMutationAttempted: false,
    requestSha256: sha256(requestRaw),
    schemaVersion: ACCEPTANCE_RESULT_SCHEMA,
    sourceCommit: request.sourceCommit,
    status: ACCEPTANCE_SUCCESS_MARKER,
    timerActiveAfter: after.timerActive,
    timerActiveBefore: before.timerActive,
    timerEnabledAfter: after.timerEnabled,
    timerEnabledBefore: before.timerEnabled,
    transportBundleSha256: request.transportBundleSha256,
    transportContainsSecrets: false,
    workerMutationAttempted: false,
  };
  const result = { ...baseResult, evidenceSha256: sha256(canonicalJson(baseResult)) };
  await writeResult(request.resultPath, result);
  return result;
}

function parseArgs(argv) {
  ensure(argv[0] === "run", "acceptance_command_invalid");
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    ensure(key?.startsWith("--") && value && !value.startsWith("--"),
      "acceptance_argument_invalid");
    options[key.slice(2)] = value;
  }
  exactKeys(options, ["bundle-marker", "request"], "acceptance_arguments_invalid");
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runAcceptance({
    bundleMarkerPath: resolve(options["bundle-marker"]),
    requestPath: resolve(options.request),
  });
  process.stdout.write(canonicalJson({
    evidenceSha256: result.evidenceSha256,
    resultPath: JSON.parse(await readFile(resolve(options.request), "utf8")).resultPath,
    status: result.status,
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(canonicalJson({
      reason: error instanceof AcceptanceError ? error.reason : "acceptance_unexpected_error",
      status: "FAIL_FIXED_DISPATCH_ACCEPTANCE_NOT_REUSABLE",
    }));
    process.exitCode = 1;
  });
}
