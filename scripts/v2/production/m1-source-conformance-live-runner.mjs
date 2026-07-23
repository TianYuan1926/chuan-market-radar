#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const LIVE_SOURCE_CONFORMANCE_PACKAGE_ID =
  "V2-M1-1B0-TENCENT-LIVE-SOURCE-CONFORMANCE";
export const LIVE_SOURCE_CONFORMANCE_REQUEST_SCHEMA =
  "market-radar-v2-m1-source-conformance-live-request.v1";
export const LIVE_SOURCE_CONFORMANCE_RESULT_SCHEMA =
  "market-radar-v2-m1-source-conformance-live-result.v1";
export const LIVE_SOURCE_CONFORMANCE_FAILURE_RESULT_SCHEMA =
  "market-radar-v2-m1-source-conformance-live-failure-result.v1";
export const LIVE_SOURCE_CONFORMANCE_MANIFEST_SCHEMA =
  "market-radar-v2-m1-source-conformance-live-manifest.v1";
export const LIVE_SOURCE_CONFORMANCE_MANIFEST =
  "m1-source-conformance-live-manifest.json";
export const LIVE_SOURCE_CONFORMANCE_ENTRYPOINT =
  "scripts/v2/production/m1-source-conformance-live-entrypoint.sh";
export const LIVE_SOURCE_CONFORMANCE_RUNNER =
  "scripts/v2/production/m1-source-conformance-live-runner.mjs";
export const LIVE_SOURCE_CONFORMANCE_RUNTIME_ENTRY =
  "runtime/v2/modules/source-conformance/adapters/exact-source-conformance-runner.js";
export const LIVE_SOURCE_CONFORMANCE_REGISTRY_ENTRY =
  "runtime/v2/modules/source-capability/adapters/four-venue-capability-registry.js";
export const LIVE_SOURCE_CONFORMANCE_SCHEMA_ENTRY =
  "runtime/v2/modules/source-conformance/source-conformance-contract.js";
export const LIVE_SOURCE_CONFORMANCE_SUCCESS_MARKER =
  "PASS_V2_M1_1B0_TENCENT_LIVE_SOURCE_CONFORMANCE";
export const LIVE_SOURCE_CONFORMANCE_ZOD_RUNTIME_TREE_DIGEST =
  "sha256:551bb42edd08048b521e6022806d36b1541249c05b8111e8df4249c260628d21";

export const DEFAULT_LIVE_SOURCE_CONFORMANCE_POLICY = Object.freeze({
  credentialEnvKey: "COINGLASS_API_KEY",
  credentialFile: "/home/ubuntu/apps/chuan-market-radar/.env.production",
  dispatchStateRoot: "/var/lib/market-radar-production-dispatch",
  evidenceRoot:
    "/var/lib/market-radar-production-dispatch/evidence/m1-source-conformance",
  expectedTimerUnit: "market-radar-production-dispatch.timer",
  productionWorktree: "/home/ubuntu/apps/chuan-market-radar",
  stagingRoot: "/home/ubuntu/.cache/market-radar-v2",
  stagingPrefix: "m1-1b0-source-conformance-",
});

const REQUEST_KEYS = Object.freeze([
  "applicationMutationAllowed",
  "approvalExpiresAt",
  "approvalIssuedAt",
  "artifactManifestSha256",
  "artifactPath",
  "automaticRollbackRequired",
  "coinGlassCredential",
  "databaseMutationAllowed",
  "dispatchId",
  "dispatchStateRoot",
  "expectedContainerCount",
  "expectedContainerIds",
  "expectedHealth",
  "expectedProbeCount",
  "expectedProbePlanDigest",
  "expectedProductionHead",
  "expectedRegistryDigest",
  "expectedTimerUnit",
  "launchSuccessMarker",
  "maxExecutions",
  "networkEnvironment",
  "packageId",
  "probeDeadlineSeconds",
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
  "sourceTree",
  "stagingDirectory",
  "temporaryStagingCleanupRequired",
  "transportBundleSha256",
  "transportContainsSecrets",
  "transportMethod",
  "workerMutationAllowed",
]);

const CREDENTIAL_KEYS = Object.freeze(["envKey", "file", "source"]);
const HEALTH_KEYS = Object.freeze([
  "level",
  "persistenceDatabaseStatus",
  "scanFreshness",
  "scanStatus",
]);
const MANIFEST_KEYS = Object.freeze([
  "archiveFormat",
  "containsSecrets",
  "dependencyLockSha256",
  "files",
  "mutationScope",
  "packageId",
  "probePlanDigest",
  "registryDigest",
  "runtimeEntry",
  "schemaVersion",
  "sourceCommit",
  "sourceDateEpoch",
  "sourceTree",
  "zodRuntimeTreeDigest",
  "zodVersion",
]);

const SHA256 = /^[a-f0-9]{64}$/u;
const PREFIXED_SHA256 = /^sha256:[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const DISPATCH_ID = /^[a-z0-9][a-z0-9-]{15,100}$/u;
const SOURCE_REF =
  /^refs\/heads\/(?:main|codex\/[a-z0-9][a-z0-9._/-]{2,180})$/u;
const RUNNER_UNIT =
  /^market-radar-m1-1b0-[a-z0-9][a-z0-9-]{7,32}$/u;

export class LiveSourceConformanceError extends Error {
  constructor(reason, details = undefined) {
    super(reason);
    this.name = "LiveSourceConformanceError";
    this.reason = reason;
    this.details = details;
  }
}

function ensure(condition, reason, details = undefined) {
  if (!condition) {
    throw new LiveSourceConformanceError(reason, details);
  }
}

function exactKeys(value, expected, reason) {
  ensure(value && typeof value === "object" && !Array.isArray(value), reason);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  ensure(
    actual.length === wanted.length &&
      actual.every((key, index) => key === wanted[index]),
    reason,
    { actual, expected: wanted },
  );
}

function sortedValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortedValue);
  }
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
  return sha256(await readFile(path));
}

function parseTimestamp(value, reason) {
  const timestamp = new Date(value);
  ensure(
    Number.isFinite(timestamp.getTime()) && timestamp.toISOString() === value,
    reason,
  );
  return timestamp;
}

function directChild(path, parent, prefix, reason) {
  ensure(
    typeof path === "string" &&
      path.startsWith("/") &&
      !path.includes("\0") &&
      resolve(dirname(path)) === resolve(parent) &&
      basename(path).startsWith(prefix),
    reason,
  );
  return resolve(path);
}

export function validateLiveSourceConformanceRequest(
  request,
  {
    now = new Date(),
    policy = DEFAULT_LIVE_SOURCE_CONFORMANCE_POLICY,
  } = {},
) {
  exactKeys(request, REQUEST_KEYS, "live_request_keys_invalid");
  exactKeys(
    request.coinGlassCredential,
    CREDENTIAL_KEYS,
    "live_request_credential_keys_invalid",
  );
  exactKeys(request.expectedHealth, HEALTH_KEYS, "live_request_health_keys_invalid");
  ensure(
    request.schemaVersion === LIVE_SOURCE_CONFORMANCE_REQUEST_SCHEMA,
    "live_request_schema_invalid",
  );
  ensure(
    request.packageId === LIVE_SOURCE_CONFORMANCE_PACKAGE_ID,
    "live_request_package_invalid",
  );
  ensure(DISPATCH_ID.test(request.dispatchId), "live_request_dispatch_id_invalid");
  ensure(COMMIT.test(request.sourceCommit), "live_request_source_commit_invalid");
  ensure(COMMIT.test(request.sourceTree), "live_request_source_tree_invalid");
  ensure(
    SOURCE_REF.test(request.sourceRef) &&
      !request.sourceRef.includes("..") &&
      !request.sourceRef.includes("//"),
    "live_request_source_ref_invalid",
  );
  ensure(
    RUNNER_UNIT.test(request.runnerUnitName),
    "live_request_runner_unit_invalid",
  );
  ensure(
    request.launchSuccessMarker === LIVE_SOURCE_CONFORMANCE_SUCCESS_MARKER,
    "live_request_success_marker_invalid",
  );
  ensure(
    request.dispatchStateRoot === policy.dispatchStateRoot,
    "live_request_dispatch_state_root_invalid",
  );
  ensure(
    request.productionWorktree === policy.productionWorktree,
    "live_request_production_worktree_invalid",
  );
  ensure(
    request.expectedTimerUnit === policy.expectedTimerUnit,
    "live_request_timer_unit_invalid",
  );
  ensure(
    request.coinGlassCredential.source === "PRODUCTION_ENV_FILE_EXACT_KEY" &&
      request.coinGlassCredential.file === policy.credentialFile &&
      request.coinGlassCredential.envKey === policy.credentialEnvKey,
    "live_request_credential_source_invalid",
  );
  ensure(
    request.networkEnvironment === "TENCENT_ISOLATED_READ_ONLY",
    "live_request_network_environment_invalid",
  );
  ensure(request.expectedProbeCount === 15, "live_request_probe_count_invalid");
  ensure(
    PREFIXED_SHA256.test(request.expectedProbePlanDigest),
    "live_request_probe_plan_digest_invalid",
  );
  ensure(
    PREFIXED_SHA256.test(request.expectedRegistryDigest),
    "live_request_registry_digest_invalid",
  );
  ensure(
    Number.isSafeInteger(request.expectedContainerCount) &&
      request.expectedContainerCount > 0 &&
      request.expectedContainerCount <= 100,
    "live_request_container_count_invalid",
  );
  ensure(
    Array.isArray(request.expectedContainerIds) &&
      request.expectedContainerIds.length === request.expectedContainerCount &&
      request.expectedContainerIds.every((id) => SHA256.test(id)) &&
      new Set(request.expectedContainerIds).size ===
        request.expectedContainerIds.length &&
      JSON.stringify(request.expectedContainerIds) ===
        JSON.stringify([...request.expectedContainerIds].sort()),
    "live_request_container_ids_invalid",
  );
  ensure(
    request.expectedHealth.level === "ready" &&
      request.expectedHealth.persistenceDatabaseStatus === "ready" &&
      request.expectedHealth.scanFreshness === "fresh" &&
      request.expectedHealth.scanStatus === "ready",
    "live_request_health_expectation_weakened",
  );
  ensure(
    Number.isSafeInteger(request.probeDeadlineSeconds) &&
      request.probeDeadlineSeconds >= 30 &&
      request.probeDeadlineSeconds <= 90,
    "live_request_probe_deadline_invalid",
  );
  ensure(
    SHA256.test(request.transportBundleSha256) &&
      SHA256.test(request.artifactManifestSha256),
    "live_request_transport_digest_invalid",
  );
  ensure(
    request.transportMethod === "signed_git_bundle" &&
      request.transportContainsSecrets === false,
    "live_request_transport_boundary_invalid",
  );
  ensure(
    request.productionMutationScope ===
      "dispatch_staging_and_sanitized_evidence_only",
    "live_request_mutation_scope_invalid",
  );
  for (const key of [
    "applicationMutationAllowed",
    "databaseMutationAllowed",
    "redisMutationAllowed",
    "workerMutationAllowed",
  ]) {
    ensure(request[key] === false, `live_request_${key}_must_be_false`);
  }
  ensure(request.automaticRollbackRequired === true, "live_request_rollback_required");
  ensure(
    request.sessionIndependentExecutionRequired === true,
    "live_request_session_independence_required",
  );
  ensure(
    request.temporaryStagingCleanupRequired === true,
    "live_request_cleanup_required",
  );
  ensure(request.maxExecutions === 1, "live_request_execution_count_invalid");
  ensure(
    Number.isSafeInteger(request.revocationEpoch) &&
      request.revocationEpoch >= 0,
    "live_request_revocation_epoch_invalid",
  );

  directChild(
    request.stagingDirectory,
    policy.stagingRoot,
    policy.stagingPrefix,
    "live_request_staging_directory_invalid",
  );
  directChild(
    request.artifactPath,
    policy.evidenceRoot,
    `${request.dispatchId}.artifact.json`,
    "live_request_artifact_path_invalid",
  );
  directChild(
    request.resultPath,
    policy.evidenceRoot,
    `${request.dispatchId}.result.json`,
    "live_request_result_path_invalid",
  );
  ensure(
    basename(request.artifactPath) === `${request.dispatchId}.artifact.json` &&
      basename(request.resultPath) === `${request.dispatchId}.result.json`,
    "live_request_evidence_path_invalid",
  );

  const issuedAt = parseTimestamp(
    request.approvalIssuedAt,
    "live_request_issued_at_invalid",
  );
  const expiresAt = parseTimestamp(
    request.approvalExpiresAt,
    "live_request_expires_at_invalid",
  );
  ensure(
    expiresAt > issuedAt &&
      expiresAt.getTime() - issuedAt.getTime() <= 90 * 60_000,
    "live_request_approval_window_invalid",
  );
  ensure(now >= issuedAt && now <= expiresAt, "live_request_not_current");
  return request;
}

async function assertRegularFile(path, reason, maximumBytes = 16 * 1024 * 1024) {
  const facts = await lstat(path).catch(() => null);
  ensure(
    facts?.isFile() &&
      !facts.isSymbolicLink() &&
      facts.size > 0 &&
      facts.size <= maximumBytes,
    reason,
  );
  return facts;
}

async function readCanonicalJson(path, reason) {
  const raw = await readFile(path, "utf8");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new LiveSourceConformanceError(reason);
  }
  ensure(raw === canonicalJson(value), `${reason}_not_canonical`);
  return { raw, value };
}

async function walkRegularFiles(root, directory = root) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relative = path.slice(root.length + 1);
    ensure(
      !relative.startsWith(`..${sep}`) && !relative.includes("\0"),
      "live_manifest_path_escape",
    );
    if (entry.isDirectory()) {
      output.push(...await walkRegularFiles(root, path));
    } else {
      ensure(entry.isFile() && !entry.isSymbolicLink(), "live_manifest_special_file");
      output.push(relative);
    }
  }
  return output.sort();
}

export async function validateLiveSourceConformanceManifest(
  stagingDirectory,
  request,
) {
  const manifestPath = join(stagingDirectory, LIVE_SOURCE_CONFORMANCE_MANIFEST);
  const { raw, value: manifest } = await readCanonicalJson(
    manifestPath,
    "live_manifest_invalid",
  );
  exactKeys(manifest, MANIFEST_KEYS, "live_manifest_keys_invalid");
  ensure(
    manifest.schemaVersion === LIVE_SOURCE_CONFORMANCE_MANIFEST_SCHEMA,
    "live_manifest_schema_invalid",
  );
  ensure(manifest.packageId === request.packageId, "live_manifest_package_mismatch");
  ensure(manifest.sourceCommit === request.sourceCommit, "live_manifest_commit_mismatch");
  ensure(manifest.sourceTree === request.sourceTree, "live_manifest_tree_mismatch");
  ensure(manifest.containsSecrets === false, "live_manifest_secret_boundary_invalid");
  ensure(
    manifest.mutationScope === request.productionMutationScope,
    "live_manifest_mutation_scope_mismatch",
  );
  ensure(
    manifest.archiveFormat === "ustar+gzip-n" &&
      manifest.sourceDateEpoch === 946_684_800,
    "live_manifest_reproducibility_invalid",
  );
  ensure(
    manifest.runtimeEntry === LIVE_SOURCE_CONFORMANCE_RUNTIME_ENTRY,
    "live_manifest_runtime_entry_invalid",
  );
  ensure(
    manifest.probePlanDigest === request.expectedProbePlanDigest &&
      manifest.registryDigest === request.expectedRegistryDigest,
    "live_manifest_capability_binding_mismatch",
  );
  ensure(
    typeof manifest.zodVersion === "string" &&
      /^\d+\.\d+\.\d+$/u.test(manifest.zodVersion) &&
      SHA256.test(manifest.dependencyLockSha256) &&
      manifest.zodRuntimeTreeDigest ===
        LIVE_SOURCE_CONFORMANCE_ZOD_RUNTIME_TREE_DIGEST,
    "live_manifest_dependency_binding_invalid",
  );
  ensure(
    sha256(raw) === request.artifactManifestSha256,
    "live_manifest_sha256_mismatch",
  );
  ensure(
    manifest.files &&
      typeof manifest.files === "object" &&
      !Array.isArray(manifest.files) &&
      Object.keys(manifest.files).length >= 20 &&
      Object.keys(manifest.files).length <= 300,
    "live_manifest_files_invalid",
  );
  for (const [path, expected] of Object.entries(manifest.files)) {
    ensure(
      typeof path === "string" &&
        !path.startsWith("/") &&
        !path.includes("..") &&
        !path.includes("\\") &&
        SHA256.test(expected),
      "live_manifest_file_entry_invalid",
    );
    await assertRegularFile(
      join(stagingDirectory, path),
      "live_manifest_file_missing_or_unsafe",
    );
    ensure(
      await sha256File(join(stagingDirectory, path)) === expected,
      "live_manifest_file_sha_mismatch",
      path,
    );
  }
  for (const required of [
    LIVE_SOURCE_CONFORMANCE_ENTRYPOINT,
    LIVE_SOURCE_CONFORMANCE_RUNNER,
    LIVE_SOURCE_CONFORMANCE_RUNTIME_ENTRY,
    LIVE_SOURCE_CONFORMANCE_REGISTRY_ENTRY,
    LIVE_SOURCE_CONFORMANCE_SCHEMA_ENTRY,
    "runtime/node_modules/zod/package.json",
  ]) {
    ensure(manifest.files[required] !== undefined, "live_manifest_required_file_missing");
  }
  const controls = new Set([
    ".dispatch.json",
    ".dispatch.sig",
    ".transport-bundle.sha256",
    "approval-request.json",
    LIVE_SOURCE_CONFORMANCE_MANIFEST,
  ]);
  const actualPayloadFiles = (await walkRegularFiles(stagingDirectory))
    .filter((path) => !controls.has(path));
  ensure(
    JSON.stringify(actualPayloadFiles) ===
      JSON.stringify(Object.keys(manifest.files).sort()),
    "live_manifest_payload_set_mismatch",
  );
  return manifest;
}

export async function validateLiveSourceDispatchBinding(
  stagingDirectory,
  request,
  requestRaw,
  bundleMarkerPath,
) {
  const { value: envelope } = await readCanonicalJson(
    join(stagingDirectory, ".dispatch.json"),
    "live_dispatch_envelope_invalid",
  );
  const marker = (await readFile(bundleMarkerPath, "utf8")).trim();
  ensure(
    marker === request.transportBundleSha256 &&
      envelope.bundleSha256 === request.transportBundleSha256,
    "live_dispatch_bundle_mismatch",
  );
  ensure(
    envelope.approvalRequestSha256 === sha256(requestRaw),
    "live_dispatch_request_mismatch",
  );
  ensure(
    envelope.dispatchId === request.dispatchId &&
      envelope.packageId === request.packageId &&
      envelope.targetCommit === request.sourceCommit &&
      envelope.sourceRef === request.sourceRef &&
      envelope.runnerUnitName === request.runnerUnitName &&
      envelope.stagingDirectory === request.stagingDirectory,
    "live_dispatch_identity_mismatch",
  );
  ensure(
    envelope.entrypointPath === LIVE_SOURCE_CONFORMANCE_ENTRYPOINT &&
      envelope.launchSuccessMarker === request.launchSuccessMarker,
    "live_dispatch_entrypoint_mismatch",
  );
  ensure(
    envelope.transportMethod === "signed_git_bundle" &&
      envelope.transportContainsSecrets === false &&
      envelope.noArbitraryCommand === true &&
      envelope.productionMutation === true &&
      envelope.productionWipLimit === 1 &&
      envelope.maxExecutions === 1 &&
      envelope.sessionIndependentExecutionRequired === true &&
      envelope.automaticRollbackRequired === true &&
      Number.isSafeInteger(envelope.runtimeMaxSeconds) &&
      envelope.runtimeMaxSeconds >= request.probeDeadlineSeconds + 15 &&
      envelope.runtimeMaxSeconds <= 110,
    "live_dispatch_safety_binding_invalid",
  );
  ensure(
    envelope.issuedAt === request.approvalIssuedAt &&
      envelope.expiresAt === request.approvalExpiresAt &&
      envelope.revocationEpoch === request.revocationEpoch,
    "live_dispatch_authorization_binding_mismatch",
  );
  return envelope;
}

export async function readExactCoinGlassCredential(
  path,
  {
    expectedUid = process.getuid?.(),
    maximumBytes = 512 * 1024,
  } = {},
) {
  const facts = await assertRegularFile(
    path,
    "live_coinglass_credential_file_unsafe",
    maximumBytes,
  );
  ensure(
    (facts.mode & 0o077) === 0 &&
      (expectedUid === undefined || facts.uid === expectedUid),
    "live_coinglass_credential_file_permissions_invalid",
  );
  const bytes = await readFile(path);
  try {
    const text = bytes.toString("utf8");
    ensure(!text.includes("\0"), "live_coinglass_credential_file_invalid");
    const matches = text
      .split(/\r?\n/u)
      .filter((line) => line.startsWith("COINGLASS_API_KEY="));
    ensure(matches.length === 1, "live_coinglass_credential_count_invalid");
    const credential = matches[0].slice("COINGLASS_API_KEY=".length);
    ensure(
      credential.length >= 20 &&
        credential.length <= 256 &&
        credential !== "CHANGE_ME_COINGLASS_API_KEY" &&
        !/\s/u.test(credential) &&
        !/["']/u.test(credential),
      "live_coinglass_credential_value_invalid",
    );
    return credential;
  } finally {
    bytes.fill(0);
  }
}

const COMMAND_PATHS = Object.freeze({
  curl: "/usr/bin/curl",
  docker: "/usr/bin/docker",
  git: "/usr/bin/git",
  ss: "/usr/bin/ss",
  sudo: "/usr/bin/sudo",
  systemctl: "/usr/bin/systemctl",
});

function sameArgs(actual, expected) {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

export function liveReadOnlyCommandInvocation(command, args, request) {
  ensure(
    Array.isArray(args) &&
      args.every((value) => typeof value === "string" && !value.includes("\0")),
    "live_command_arguments_invalid",
  );
  if (command === "git") {
    const head = ["-C", request.productionWorktree, "rev-parse", "HEAD"];
    const status = [
      "-C",
      request.productionWorktree,
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ];
    ensure(
      sameArgs(args, head) || sameArgs(args, status),
      "live_git_command_not_read_only",
    );
    return { executable: COMMAND_PATHS.git, args };
  }
  if (command === "docker") {
    ensure(
      sameArgs(args, ["ps", "--no-trunc", "--format", "{{.ID}}"]),
      "live_docker_command_not_read_only",
    );
    return {
      executable: COMMAND_PATHS.sudo,
      args: ["-n", "--", COMMAND_PATHS.docker, ...args],
    };
  }
  if (command === "ss") {
    ensure(sameArgs(args, ["-lntH"]), "live_ss_command_not_read_only");
    return { executable: COMMAND_PATHS.ss, args };
  }
  if (command === "systemctl") {
    ensure(
      sameArgs(args, ["is-enabled", request.expectedTimerUnit]) ||
        sameArgs(args, ["is-active", request.expectedTimerUnit]),
      "live_systemctl_command_not_read_only",
    );
    return { executable: COMMAND_PATHS.systemctl, args };
  }
  if (command === "curl") {
    ensure(
      sameArgs(args, [
        "-kfsS",
        "--max-time",
        "20",
        "http://127.0.0.1/api/health",
      ]),
      "live_curl_command_not_read_only",
    );
    return { executable: COMMAND_PATHS.curl, args };
  }
  throw new LiveSourceConformanceError("live_command_not_allowlisted");
}

export async function runLiveReadOnlyCommand(command, args, request) {
  const invocation = liveReadOnlyCommandInvocation(command, args, request);
  try {
    const { stdout } = await execFileAsync(
      invocation.executable,
      invocation.args,
      {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        timeout: 30_000,
      },
    );
    return stdout.trim();
  } catch {
    throw new LiveSourceConformanceError(`live_command_${command}_failed`);
  }
}

function normalizedLines(value) {
  return value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).sort();
}

function healthSummary(raw, expected) {
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new LiveSourceConformanceError("live_health_json_invalid");
  }
  const health = body?.health;
  ensure(
    body?.ok === true &&
      health?.level === expected.level &&
      health?.scan?.status === expected.scanStatus &&
      health?.scan?.freshness === expected.scanFreshness &&
      health?.persistence?.databaseStatus === expected.persistenceDatabaseStatus,
    "live_health_not_ready",
  );
  return {
    level: health.level,
    persistenceDatabaseStatus: health.persistence.databaseStatus,
    scanFreshness: health.scan.freshness,
    scanStatus: health.scan.status,
  };
}

async function captureProductionIdentity(request, commandRunner) {
  const run = (command, args) => commandRunner(command, args, request);
  const productionHead = await run("git", [
    "-C",
    request.productionWorktree,
    "rev-parse",
    "HEAD",
  ]);
  const worktreeStatus = await run("git", [
    "-C",
    request.productionWorktree,
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  const containerIds = normalizedLines(await run("docker", [
    "ps",
    "--no-trunc",
    "--format",
    "{{.ID}}",
  ]));
  const listenerLines = normalizedLines(await run("ss", ["-lntH"]));
  const timerEnabled = await run("systemctl", [
    "is-enabled",
    request.expectedTimerUnit,
  ]);
  const timerActive = await run("systemctl", [
    "is-active",
    request.expectedTimerUnit,
  ]);
  const health = healthSummary(
    await run("curl", [
      "-kfsS",
      "--max-time",
      "20",
      "http://127.0.0.1/api/health",
    ]),
    request.expectedHealth,
  );
  return {
    containerIds,
    health,
    listenerSha256: sha256(`${listenerLines.join("\n")}\n`),
    productionHead,
    timerActive,
    timerEnabled,
    worktreeClean: worktreeStatus.length === 0,
  };
}

function assertProductionIdentity(identity, request, phase) {
  ensure(
    identity.productionHead === request.expectedProductionHead,
    `live_${phase}_production_head_mismatch`,
  );
  ensure(identity.worktreeClean, `live_${phase}_production_worktree_dirty`);
  ensure(
    JSON.stringify(identity.containerIds) ===
      JSON.stringify(request.expectedContainerIds),
    `live_${phase}_container_identity_mismatch`,
  );
  ensure(
    identity.timerActive === "active" && identity.timerEnabled === "enabled",
    `live_${phase}_dispatch_timer_invalid`,
  );
}

function loadRuntimeBindings(stagingDirectory) {
  const require = createRequire(import.meta.url);
  const runtime = require(join(stagingDirectory, LIVE_SOURCE_CONFORMANCE_RUNTIME_ENTRY));
  const registry = require(join(stagingDirectory, LIVE_SOURCE_CONFORMANCE_REGISTRY_ENTRY));
  const schema = require(join(stagingDirectory, LIVE_SOURCE_CONFORMANCE_SCHEMA_ENTRY));
  return {
    artifactSchema: schema.M1SourceConformanceArtifactSchema,
    probePlanDigest: runtime.M1_EXACT_SOURCE_PROBE_PLAN_DIGEST,
    registryDigest:
      registry.M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest,
    run: runtime.runM1ExactSourceConformance,
  };
}

function validateRuntimeBindings(bindings, request) {
  ensure(
    bindings.probePlanDigest === request.expectedProbePlanDigest &&
      bindings.registryDigest === request.expectedRegistryDigest &&
      typeof bindings.run === "function" &&
      typeof bindings.artifactSchema?.parse === "function",
    "live_runtime_binding_mismatch",
  );
}

async function runProbeChild({ requestPath, stagingDirectory }) {
  const { value: request } = await readCanonicalJson(
    requestPath,
    "live_probe_child_request_invalid",
  );
  const bindings = loadRuntimeBindings(stagingDirectory);
  validateRuntimeBindings(bindings, request);
  const credential = process.env.MARKET_RADAR_M1B0_COINGLASS_KEY ?? "";
  delete process.env.MARKET_RADAR_M1B0_COINGLASS_KEY;
  ensure(credential.length >= 20, "live_probe_child_credential_missing");
  const artifact = await bindings.run({
    coinGlassApiKey: credential,
    networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
    registryDigest: request.expectedRegistryDigest,
    releaseId: request.sourceCommit,
  });
  process.stdout.write(canonicalJson(artifact));
}

async function executeProbeProcess({
  credential,
  request,
  requestPath,
  runnerPath,
}) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [
        runnerPath,
        "probe-child",
        "--request",
        requestPath,
        "--staging",
        request.stagingDirectory,
      ],
      {
        cwd: request.stagingDirectory,
        env: {
          HOME: "/home/ubuntu",
          LANG: "C.UTF-8",
          LC_ALL: "C.UTF-8",
          LOGNAME: "ubuntu",
          MARKET_RADAR_M1B0_COINGLASS_KEY: credential,
          NODE_OPTIONS: "--jitless",
          PATH: dirname(process.execPath),
          USER: "ubuntu",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdout = [];
    const stderrHash = createHash("sha256");
    let stdoutBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, request.probeDeadlineSeconds * 1000);
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > 4 * 1024 * 1024) {
        child.kill("SIGKILL");
      } else {
        stdout.push(chunk);
      }
    });
    child.stderr.on("data", (chunk) => stderrHash.update(chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(new LiveSourceConformanceError("live_probe_process_error", {
        code: String(error?.code ?? "unknown").slice(0, 80),
      }));
    });
    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (exitCode !== 0 || stdoutBytes > 4 * 1024 * 1024) {
        rejectPromise(new LiveSourceConformanceError("live_probe_process_failed", {
          exitCode,
          signal,
          stderrSha256: stderrHash.digest("hex"),
        }));
        return;
      }
      resolvePromise(Buffer.concat(stdout).toString("utf8"));
    });
  });
}

export function validateLiveArtifact(artifact, request, bindings) {
  const parsed = bindings.artifactSchema.parse(artifact);
  ensure(
    parsed.releaseId === request.sourceCommit &&
      parsed.registryDigest === request.expectedRegistryDigest &&
      parsed.probePlanDigest === request.expectedProbePlanDigest,
    "live_artifact_release_binding_mismatch",
  );
  ensure(
    parsed.evidenceClass === "LIVE_READ_ONLY" &&
      parsed.networkEnvironment === "TENCENT_ISOLATED_READ_ONLY" &&
      parsed.expectedProbeCount === request.expectedProbeCount &&
      parsed.observedProbeCount === request.expectedProbeCount &&
      parsed.runtimeNetworkRequestsPerformed === true &&
      parsed.productionChanged === false &&
      parsed.secretMaterialPresent === false &&
      parsed.probes.every((probe) =>
        probe.evidenceClass === "LIVE_READ_ONLY" &&
        probe.rawBodyRetained === false &&
        probe.secretMaterialPresent === false
      ),
    "live_artifact_authority_boundary_invalid",
  );
  return parsed;
}

async function ensureEvidenceRoot(policy) {
  await mkdir(policy.evidenceRoot, { recursive: true, mode: 0o700 });
  const facts = await lstat(policy.evidenceRoot);
  ensure(
    facts.isDirectory() &&
      !facts.isSymbolicLink() &&
      (facts.mode & 0o077) === 0 &&
      await realpath(policy.evidenceRoot) === resolve(policy.evidenceRoot),
    "live_evidence_root_unsafe",
  );
}

async function writeExclusiveCanonical(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  const existing = await lstat(path).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  ensure(existing === null, "live_evidence_path_already_exists");
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(canonicalJson(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
  await chmod(path, 0o600);
  const directory = await open(dirname(path), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

function boundedIdentity(identity) {
  return {
    containerIdsSha256: sha256(`${identity.containerIds.join("\n")}\n`),
    health: identity.health,
    listenerSha256: identity.listenerSha256,
    productionHead: identity.productionHead,
    timerActive: identity.timerActive,
    timerEnabled: identity.timerEnabled,
    worktreeClean: identity.worktreeClean,
  };
}

const LIVE_FAILURE_PHASES = Object.freeze([
  "REQUEST_FILE_VALIDATION",
  "PACKAGE_BINDING_VALIDATION",
  "RUNTIME_BINDING_VALIDATION",
  "PRODUCTION_IDENTITY_BEFORE",
  "CREDENTIAL_VALIDATION",
  "PROBE_EXECUTION",
  "ARTIFACT_VALIDATION",
  "PRODUCTION_IDENTITY_AFTER",
  "EVIDENCE_PERSISTENCE",
  "GATE_EVALUATION",
]);

async function persistBlockedExecutionResult({
  error,
  executionContext,
  policy,
}) {
  const request = executionContext.request;
  if (request === null) {
    return;
  }
  const existingResult = await lstat(request.resultPath).catch((readError) => {
    if (readError?.code === "ENOENT") return null;
    throw readError;
  });
  if (existingResult !== null) {
    return;
  }
  const failureReason = error instanceof LiveSourceConformanceError
    ? error.reason
    : "unexpected_error";
  ensure(
    /^[a-z0-9_]{3,120}$/u.test(failureReason) &&
      LIVE_FAILURE_PHASES.includes(executionContext.phase),
    "live_failure_evidence_reason_invalid",
  );
  const artifactFacts = await lstat(request.artifactPath).catch((readError) => {
    if (readError?.code === "ENOENT") return null;
    throw readError;
  });
  const before = executionContext.before === null
    ? null
    : boundedIdentity(executionContext.before);
  const after = executionContext.after === null
    ? null
    : boundedIdentity(executionContext.after);
  const productionIdentityUnchangedVerified =
    before !== null &&
    after !== null &&
    canonicalJson(before) === canonicalJson(after);
  const result = {
    after,
    artifactPath: request.artifactPath,
    artifactWritten:
      artifactFacts?.isFile() === true &&
      artifactFacts.isSymbolicLink() === false,
    before,
    dispatchId: request.dispatchId,
    failurePhase: executionContext.phase,
    failureReason,
    generatedAt: new Date().toISOString(),
    packageId: request.packageId,
    productionIdentityUnchangedVerified,
    productionMutationAttempted: false,
    resultPath: request.resultPath,
    schemaVersion: LIVE_SOURCE_CONFORMANCE_FAILURE_RESULT_SCHEMA,
    secretMaterialPresent: false,
    sourceCommit: request.sourceCommit,
    sourceTree: request.sourceTree,
    status:
      "BLOCKED_TENCENT_LIVE_READ_ONLY_SOURCE_CONFORMANCE_EXECUTION_FAILURE",
  };
  await ensureEvidenceRoot(policy);
  await writeExclusiveCanonical(request.resultPath, result);
}

async function executeLiveSourceConformance({
  bundleMarkerPath,
  commandRunner = runLiveReadOnlyCommand,
  credentialReader = readExactCoinGlassCredential,
  executionContext,
  now = new Date(),
  policy = DEFAULT_LIVE_SOURCE_CONFORMANCE_POLICY,
  probeExecutor = executeProbeProcess,
  requestPath,
}) {
  executionContext.phase = "REQUEST_FILE_VALIDATION";
  const requestFacts = await assertRegularFile(
    requestPath,
    "live_request_file_unsafe",
    512 * 1024,
  );
  ensure((requestFacts.mode & 0o077) === 0, "live_request_file_mode_unsafe");
  await assertRegularFile(bundleMarkerPath, "live_bundle_marker_unsafe", 256);
  const { raw: requestRaw, value: request } = await readCanonicalJson(
    requestPath,
    "live_request_invalid",
  );
  validateLiveSourceConformanceRequest(request, { now, policy });
  executionContext.request = request;
  executionContext.phase = "PACKAGE_BINDING_VALIDATION";
  ensure(
    await realpath(request.stagingDirectory) === request.stagingDirectory &&
      await realpath(requestPath) === join(request.stagingDirectory, "approval-request.json"),
    "live_staging_identity_mismatch",
  );
  const stagingFacts = await lstat(request.stagingDirectory);
  ensure(
    stagingFacts.isDirectory() &&
      !stagingFacts.isSymbolicLink() &&
      (stagingFacts.mode & 0o077) === 0,
    "live_staging_mode_unsafe",
  );
  await validateLiveSourceConformanceManifest(request.stagingDirectory, request);
  await validateLiveSourceDispatchBinding(
    request.stagingDirectory,
    request,
    requestRaw,
    bundleMarkerPath,
  );
  executionContext.phase = "RUNTIME_BINDING_VALIDATION";
  const bindings = loadRuntimeBindings(request.stagingDirectory);
  validateRuntimeBindings(bindings, request);

  executionContext.phase = "PRODUCTION_IDENTITY_BEFORE";
  const before = await captureProductionIdentity(request, commandRunner);
  executionContext.before = before;
  assertProductionIdentity(before, request, "before");
  executionContext.phase = "CREDENTIAL_VALIDATION";
  const credential = await credentialReader(request.coinGlassCredential.file);
  let rawArtifact;
  try {
    executionContext.phase = "PROBE_EXECUTION";
    rawArtifact = await probeExecutor({
      credential,
      request,
      requestPath,
      runnerPath: join(request.stagingDirectory, LIVE_SOURCE_CONFORMANCE_RUNNER),
    });
  } finally {
    // The credential is never written; the child and staging are one-shot.
  }
  let artifact;
  try {
    executionContext.phase = "ARTIFACT_VALIDATION";
    artifact = validateLiveArtifact(JSON.parse(rawArtifact), request, bindings);
  } catch (error) {
    if (error instanceof LiveSourceConformanceError) throw error;
    throw new LiveSourceConformanceError("live_artifact_invalid");
  }
  ensure(
    !canonicalJson(artifact).includes(credential),
    "live_artifact_contains_credential",
  );

  executionContext.phase = "PRODUCTION_IDENTITY_AFTER";
  const after = await captureProductionIdentity(request, commandRunner);
  executionContext.after = after;
  assertProductionIdentity(after, request, "after");
  ensure(
    before.productionHead === after.productionHead &&
      JSON.stringify(before.containerIds) === JSON.stringify(after.containerIds) &&
      before.listenerSha256 === after.listenerSha256,
    "live_production_identity_drift",
  );

  executionContext.phase = "EVIDENCE_PERSISTENCE";
  await ensureEvidenceRoot(policy);
  await writeExclusiveCanonical(request.artifactPath, artifact);
  const gatesPassed =
    artifact.identityGateStatus === "PASS" &&
    artifact.listingGateStatus === "PASS" &&
    artifact.coinGlassGateStatus === "PASS" &&
    artifact.passCount === request.expectedProbeCount &&
    artifact.failCount === 0 &&
    artifact.notRunCount === 0;
  const result = {
    artifactContentHash: artifact.contentHash,
    artifactId: artifact.artifactId,
    artifactPath: request.artifactPath,
    before: boundedIdentity(before),
    dispatchId: request.dispatchId,
    evidenceClass: artifact.evidenceClass,
    gateStatus: {
      coinGlass: artifact.coinGlassGateStatus,
      identity: artifact.identityGateStatus,
      listing: artifact.listingGateStatus,
    },
    generatedAt: artifact.generatedAt,
    packageId: request.packageId,
    probeCounts: {
      expected: artifact.expectedProbeCount,
      failed: artifact.failCount,
      notRun: artifact.notRunCount,
      passed: artifact.passCount,
    },
    productionChanged: false,
    resultPath: request.resultPath,
    schemaVersion: LIVE_SOURCE_CONFORMANCE_RESULT_SCHEMA,
    secretMaterialPresent: false,
    sourceCommit: request.sourceCommit,
    sourceTree: request.sourceTree,
    status: gatesPassed
      ? "PASS_TENCENT_LIVE_READ_ONLY_SOURCE_CONFORMANCE"
      : "BLOCKED_TENCENT_LIVE_READ_ONLY_SOURCE_CONFORMANCE",
    after: boundedIdentity(after),
  };
  ensure(
    !canonicalJson(result).includes(credential),
    "live_result_contains_credential",
  );
  await writeExclusiveCanonical(request.resultPath, result);
  executionContext.phase = "GATE_EVALUATION";
  ensure(gatesPassed, "live_source_conformance_gates_blocked");
  return result;
}

export async function runLiveSourceConformance(options) {
  const executionContext = {
    after: null,
    before: null,
    phase: "REQUEST_FILE_VALIDATION",
    request: null,
  };
  try {
    return await executeLiveSourceConformance({
      ...options,
      executionContext,
    });
  } catch (error) {
    await persistBlockedExecutionResult({
      error,
      executionContext,
      policy: options.policy ?? DEFAULT_LIVE_SOURCE_CONFORMANCE_POLICY,
    }).catch(() => {});
    throw error;
  }
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  ensure(
    rest.length % 2 === 0,
    "live_runner_arguments_invalid",
  );
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    ensure(
      /^--[a-z][a-z-]*$/u.test(key ?? "") &&
        typeof value === "string" &&
        !value.startsWith("--") &&
        options[key.slice(2)] === undefined,
      "live_runner_arguments_invalid",
    );
    options[key.slice(2)] = value;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === "probe-child") {
    ensure(options.request && options.staging, "live_probe_child_options_missing");
    await runProbeChild({
      requestPath: resolve(options.request),
      stagingDirectory: resolve(options.staging),
    });
    return;
  }
  ensure(command === "run" && options.request && options["bundle-marker"],
    "live_runner_command_invalid");
  const result = await runLiveSourceConformance({
    bundleMarkerPath: resolve(options["bundle-marker"]),
    requestPath: resolve(options.request),
  });
  process.stdout.write(canonicalJson(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      reason: error instanceof LiveSourceConformanceError
        ? error.reason
        : "unexpected_error",
      status: "BLOCKED",
    })}\n`);
    process.exitCode = 1;
  });
}
