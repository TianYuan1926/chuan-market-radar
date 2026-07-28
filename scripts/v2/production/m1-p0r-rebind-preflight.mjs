#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  unlink,
} from "node:fs/promises";
import { isIP } from "node:net";
import { basename, dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const P0R_REBIND_PACKAGE_ID =
  "V2-M1-6-P0R-READ-ONLY-REBIND-PREFLIGHT";
export const P0R_REBIND_REQUEST_SCHEMA =
  "market-radar-v2-m1-p0r-rebind-request.v2";
export const P0R_REBIND_RESULT_SCHEMA =
  "market-radar-v2-m1-p0r-rebind-result.v2";
export const P0R_REBIND_FAILURE_RESULT_SCHEMA =
  "market-radar-v2-m1-p0r-rebind-failure-result.v2";
export const P0R_REBIND_MANIFEST_SCHEMA =
  "market-radar-v2-m1-p0r-rebind-manifest.v1";
export const P0R_REBIND_MANIFEST =
  "m1-p0r-rebind-preflight-manifest.json";
export const P0R_REBIND_ENTRYPOINT =
  "scripts/v2/production/m1-p0r-rebind-preflight-entrypoint.sh";
export const P0R_REBIND_RUNNER =
  "scripts/v2/production/m1-p0r-rebind-preflight.mjs";
export const P0R_REBIND_SUCCESS_MARKER =
  "PASS_V2_M1_6_P0R_READ_ONLY_REBIND_PREFLIGHT";
export const P0R_REBIND_METADATA_ENDPOINT =
  "http://metadata.tencentyun.com/latest/meta-data/public-ipv4";

export const P0R_REBIND_LEGACY_SUPERSESSION_FILES = Object.freeze([
  "m1-production-storage-backup-capture.mjs",
  "m1-production-storage-p0r-cos-provisioning.mjs",
  "m1-production-storage-recovery-evidence.mjs",
]);

export const P0R_REBIND_CURRENT_RUNTIME_FILES = Object.freeze([
  "m1-production-storage-backup-capture.mjs",
  "m1-production-storage-database-fingerprint.mjs",
  "m1-production-storage-p0r-cos-provisioning.mjs",
  "m1-production-storage-p0r-runner.sh",
  "m1-production-storage-p0r-session.sh",
  "m1-production-storage-read-only-preflight.mjs",
  "m1-production-storage-recovery-evidence.mjs",
]);

export const DEFAULT_P0R_REBIND_POLICY = Object.freeze({
  dispatchStateRoot: "/var/lib/market-radar-production-dispatch",
  evidenceRoot:
    "/var/lib/market-radar-production-dispatch/evidence/m1-p0r-rebind",
  expectedTimerUnit: "market-radar-production-dispatch.timer",
  p0rStagingRoot: "/home/ubuntu/.cache/market-radar-v2/p0r/staging",
  productionWorktree: "/home/ubuntu/apps/chuan-market-radar",
  shmRoot: "/dev/shm",
  stagingPrefix: "m1-p0r-rebind-",
  stagingRoot: "/home/ubuntu/.cache/market-radar-v2",
});

const REQUEST_KEYS = Object.freeze([
  "applicationMutationAllowed",
  "approvalExpiresAt",
  "approvalIssuedAt",
  "artifactManifestSha256",
  "automaticRollbackRequired",
  "currentLegacySupersessionFileDigests",
  "currentP0RRuntimeFileDigests",
  "databaseMutationAllowed",
  "dispatchId",
  "dispatchStateRoot",
  "expectedContainerCount",
  "expectedContainerIds",
  "expectedHealth",
  "expectedLegacyBindingsSha256",
  "expectedLegacyBundleSha256",
  "expectedLegacyPlanDigest",
  "expectedLegacyPlanSha256",
  "expectedLegacyRunId",
  "expectedLegacySourceCommit",
  "expectedLegacyTransportManifestSha256",
  "expectedProductionHead",
  "expectedSourceIpCidrSha256",
  "expectedTimerUnit",
  "launchSuccessMarker",
  "legacyStagingDirectory",
  "maxExecutions",
  "metadataEndpoint",
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
  "sourceTree",
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
  "sourceTree",
]);

const SHA256 = /^[a-f0-9]{64}$/u;
const PREFIXED_SHA256 = /^sha256:[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const DISPATCH_ID = /^[a-z0-9][a-z0-9-]{15,100}$/u;
const RUN_ID = /^p0r-[a-z0-9][a-z0-9-]{20,80}$/u;
const SOURCE_REF =
  /^refs\/heads\/(?:main|codex\/[a-z0-9][a-z0-9._/-]{2,180})$/u;
const RUNNER_UNIT =
  /^market-radar-p0r-rebind-[a-z0-9][a-z0-9-]{7,28}$/u;
const P0R_EPHEMERAL_NAME =
  /^(?:market-radar-v2-p0r-|p0r-sts$)/u;
const P0R_RUNTIME_NAME = /^mr-v2-p0r-/u;

export class P0RRebindError extends Error {
  constructor(reason, details = undefined) {
    super(reason);
    this.name = "P0RRebindError";
    this.reason = reason;
    this.details = details;
  }
}

function ensure(condition, reason, details = undefined) {
  if (!condition) throw new P0RRebindError(reason, details);
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

export function validateP0RRebindRequest(
  request,
  {
    now = new Date(),
    policy = DEFAULT_P0R_REBIND_POLICY,
  } = {},
) {
  exactKeys(request, REQUEST_KEYS, "p0r_rebind_request_keys_invalid");
  exactKeys(
    request.expectedHealth,
    HEALTH_KEYS,
    "p0r_rebind_health_keys_invalid",
  );
  exactKeys(
    request.currentLegacySupersessionFileDigests,
    P0R_REBIND_LEGACY_SUPERSESSION_FILES,
    "p0r_rebind_legacy_supersession_file_keys_invalid",
  );
  exactKeys(
    request.currentP0RRuntimeFileDigests,
    P0R_REBIND_CURRENT_RUNTIME_FILES,
    "p0r_rebind_current_runtime_file_keys_invalid",
  );
  ensure(
    request.schemaVersion === P0R_REBIND_REQUEST_SCHEMA,
    "p0r_rebind_request_schema_invalid",
  );
  ensure(
    request.packageId === P0R_REBIND_PACKAGE_ID,
    "p0r_rebind_package_invalid",
  );
  ensure(DISPATCH_ID.test(request.dispatchId), "p0r_rebind_dispatch_id_invalid");
  ensure(COMMIT.test(request.sourceCommit), "p0r_rebind_source_commit_invalid");
  ensure(COMMIT.test(request.sourceTree), "p0r_rebind_source_tree_invalid");
  ensure(
    SOURCE_REF.test(request.sourceRef) &&
      !request.sourceRef.includes("..") &&
      !request.sourceRef.includes("//"),
    "p0r_rebind_source_ref_invalid",
  );
  ensure(
    RUNNER_UNIT.test(request.runnerUnitName),
    "p0r_rebind_runner_unit_invalid",
  );
  ensure(
    request.launchSuccessMarker === P0R_REBIND_SUCCESS_MARKER,
    "p0r_rebind_success_marker_invalid",
  );
  ensure(
    request.dispatchStateRoot === policy.dispatchStateRoot &&
      request.productionWorktree === policy.productionWorktree &&
      request.expectedTimerUnit === policy.expectedTimerUnit,
    "p0r_rebind_runtime_policy_invalid",
  );
  ensure(
    request.metadataEndpoint === P0R_REBIND_METADATA_ENDPOINT,
    "p0r_rebind_metadata_endpoint_invalid",
  );
  ensure(
    COMMIT.test(request.expectedProductionHead) &&
      COMMIT.test(request.expectedLegacySourceCommit) &&
      request.sourceCommit !== request.expectedLegacySourceCommit,
    "p0r_rebind_source_lineage_invalid",
  );
  ensure(
    RUN_ID.test(request.expectedLegacyRunId),
    "p0r_rebind_legacy_run_id_invalid",
  );
  for (const digest of [
    request.artifactManifestSha256,
    request.expectedLegacyBindingsSha256,
    request.expectedLegacyBundleSha256,
    request.expectedLegacyPlanSha256,
    request.expectedLegacyTransportManifestSha256,
    request.expectedSourceIpCidrSha256,
    request.transportBundleSha256,
    ...Object.values(request.currentLegacySupersessionFileDigests),
    ...Object.values(request.currentP0RRuntimeFileDigests),
  ]) {
    ensure(SHA256.test(digest), "p0r_rebind_digest_invalid");
  }
  ensure(
    PREFIXED_SHA256.test(request.expectedLegacyPlanDigest),
    "p0r_rebind_plan_digest_invalid",
  );
  ensure(
    Number.isSafeInteger(request.expectedContainerCount) &&
      request.expectedContainerCount > 0 &&
      request.expectedContainerCount <= 100 &&
      Array.isArray(request.expectedContainerIds) &&
      request.expectedContainerIds.length === request.expectedContainerCount &&
      request.expectedContainerIds.every((id) => SHA256.test(id)) &&
      new Set(request.expectedContainerIds).size ===
        request.expectedContainerIds.length &&
      JSON.stringify(request.expectedContainerIds) ===
        JSON.stringify([...request.expectedContainerIds].sort()),
    "p0r_rebind_container_identity_invalid",
  );
  ensure(
    request.expectedHealth.level === "ready" &&
      request.expectedHealth.persistenceDatabaseStatus === "ready" &&
      request.expectedHealth.scanFreshness === "fresh" &&
      request.expectedHealth.scanStatus === "ready",
    "p0r_rebind_health_expectation_weakened",
  );
  ensure(
    request.transportMethod === "signed_git_bundle" &&
      request.transportContainsSecrets === false,
    "p0r_rebind_transport_boundary_invalid",
  );
  ensure(
    request.productionMutationScope ===
      "dispatch_staging_and_sanitized_evidence_only",
    "p0r_rebind_mutation_scope_invalid",
  );
  for (const key of [
    "applicationMutationAllowed",
    "databaseMutationAllowed",
    "redisMutationAllowed",
    "workerMutationAllowed",
  ]) {
    ensure(request[key] === false, `p0r_rebind_${key}_must_be_false`);
  }
  ensure(
    request.automaticRollbackRequired === true &&
      request.sessionIndependentExecutionRequired === true &&
      request.temporaryStagingCleanupRequired === true &&
      request.maxExecutions === 1,
    "p0r_rebind_execution_boundary_invalid",
  );
  ensure(
    Number.isSafeInteger(request.revocationEpoch) &&
      request.revocationEpoch >= 0,
    "p0r_rebind_revocation_epoch_invalid",
  );

  directChild(
    request.stagingDirectory,
    policy.stagingRoot,
    policy.stagingPrefix,
    "p0r_rebind_staging_directory_invalid",
  );
  const legacyStaging = directChild(
    request.legacyStagingDirectory,
    policy.p0rStagingRoot,
    "p0r-",
    "p0r_rebind_legacy_staging_directory_invalid",
  );
  ensure(
    basename(legacyStaging) === request.expectedLegacyRunId,
    "p0r_rebind_legacy_staging_run_mismatch",
  );
  directChild(
    request.resultPath,
    policy.evidenceRoot,
    `${request.dispatchId}.result.json`,
    "p0r_rebind_result_path_invalid",
  );
  ensure(
    basename(request.resultPath) === `${request.dispatchId}.result.json`,
    "p0r_rebind_result_path_invalid",
  );

  const issuedAt = parseTimestamp(
    request.approvalIssuedAt,
    "p0r_rebind_issued_at_invalid",
  );
  const expiresAt = parseTimestamp(
    request.approvalExpiresAt,
    "p0r_rebind_expires_at_invalid",
  );
  ensure(
    expiresAt > issuedAt &&
      expiresAt.getTime() - issuedAt.getTime() <= 90 * 60_000,
    "p0r_rebind_approval_window_invalid",
  );
  ensure(now >= issuedAt && now <= expiresAt, "p0r_rebind_request_not_current");
  return request;
}

async function readRegularFile(
  path,
  reason,
  maximumBytes = 16 * 1024 * 1024,
) {
  let handle;
  try {
    handle = await open(
      path,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const facts = await handle.stat();
    ensure(
      facts.isFile() &&
        facts.size > 0 &&
        facts.size <= maximumBytes,
      reason,
    );
    const bytes = await handle.readFile();
    ensure(bytes.length <= maximumBytes, reason);
    return { bytes, facts };
  } catch (error) {
    if (error instanceof P0RRebindError) throw error;
    throw new P0RRebindError(reason);
  } finally {
    await handle?.close();
  }
}

async function readCanonicalJson(path, reason, maximumBytes) {
  const { bytes, facts } = await readRegularFile(path, reason, maximumBytes);
  let value;
  const raw = bytes.toString("utf8");
  try {
    value = JSON.parse(raw);
  } catch {
    throw new P0RRebindError(reason);
  }
  ensure(raw === canonicalJson(value), `${reason}_not_canonical`);
  return { bytes, facts, raw, value };
}

async function sha256File(path, maximumBytes) {
  const { bytes } = await readRegularFile(
    path,
    "p0r_rebind_file_unsafe",
    maximumBytes,
  );
  return sha256(bytes);
}

async function walkRegularFiles(root, directory = root) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relative = path.slice(root.length + 1);
    ensure(
      relative.length > 0 &&
        !relative.startsWith(`..${sep}`) &&
        !relative.includes("\0"),
      "p0r_rebind_manifest_path_escape",
    );
    if (entry.isDirectory()) {
      output.push(...await walkRegularFiles(root, path));
    } else {
      ensure(
        entry.isFile() && !entry.isSymbolicLink(),
        "p0r_rebind_manifest_special_file",
      );
      output.push(relative);
    }
  }
  return output.sort();
}

export async function validateP0RRebindManifest(stagingDirectory, request) {
  const manifestPath = join(stagingDirectory, P0R_REBIND_MANIFEST);
  const { raw, value: manifest } = await readCanonicalJson(
    manifestPath,
    "p0r_rebind_manifest_invalid",
    512 * 1024,
  );
  exactKeys(manifest, MANIFEST_KEYS, "p0r_rebind_manifest_keys_invalid");
  ensure(
    manifest.schemaVersion === P0R_REBIND_MANIFEST_SCHEMA &&
      manifest.packageId === request.packageId &&
      manifest.sourceCommit === request.sourceCommit &&
      manifest.sourceTree === request.sourceTree,
    "p0r_rebind_manifest_identity_mismatch",
  );
  ensure(
    manifest.containsSecrets === false &&
      manifest.mutationScope === request.productionMutationScope &&
      manifest.archiveFormat === "ustar+gzip-n" &&
      manifest.sourceDateEpoch === 946_684_800,
    "p0r_rebind_manifest_boundary_invalid",
  );
  ensure(
    sha256(raw) === request.artifactManifestSha256,
    "p0r_rebind_manifest_sha256_mismatch",
  );
  exactKeys(
    manifest.files,
    [P0R_REBIND_ENTRYPOINT, P0R_REBIND_RUNNER],
    "p0r_rebind_manifest_files_invalid",
  );
  for (const [path, expected] of Object.entries(manifest.files)) {
    ensure(
      !path.startsWith("/") &&
        !path.includes("..") &&
        !path.includes("\\") &&
        SHA256.test(expected),
      "p0r_rebind_manifest_file_entry_invalid",
    );
    ensure(
      await sha256File(join(stagingDirectory, path)) === expected,
      "p0r_rebind_manifest_file_sha_mismatch",
      path,
    );
  }
  const controls = new Set([
    ".dispatch.json",
    ".dispatch.sig",
    ".transport-bundle.sha256",
    "approval-request.json",
    P0R_REBIND_MANIFEST,
  ]);
  const payloadFiles = (await walkRegularFiles(stagingDirectory))
    .filter((path) => !controls.has(path));
  ensure(
    JSON.stringify(payloadFiles) ===
      JSON.stringify(Object.keys(manifest.files).sort()),
    "p0r_rebind_manifest_payload_set_mismatch",
  );
  return manifest;
}

export async function validateP0RRebindDispatchBinding(
  stagingDirectory,
  request,
  requestRaw,
  bundleMarkerPath,
) {
  const { value: envelope } = await readCanonicalJson(
    join(stagingDirectory, ".dispatch.json"),
    "p0r_rebind_dispatch_invalid",
    512 * 1024,
  );
  const { bytes: markerBytes } = await readRegularFile(
    bundleMarkerPath,
    "p0r_rebind_bundle_marker_unsafe",
    256,
  );
  const marker = markerBytes.toString("utf8").trim();
  ensure(
    marker === request.transportBundleSha256 &&
      envelope.bundleSha256 === request.transportBundleSha256,
    "p0r_rebind_dispatch_bundle_mismatch",
  );
  ensure(
    envelope.approvalRequestSha256 === sha256(requestRaw),
    "p0r_rebind_dispatch_request_mismatch",
  );
  ensure(
    envelope.dispatchId === request.dispatchId &&
      envelope.packageId === request.packageId &&
      envelope.targetCommit === request.sourceCommit &&
      envelope.sourceRef === request.sourceRef &&
      envelope.runnerUnitName === request.runnerUnitName &&
      envelope.stagingDirectory === request.stagingDirectory &&
      envelope.entrypointPath === P0R_REBIND_ENTRYPOINT &&
      envelope.launchSuccessMarker === request.launchSuccessMarker,
    "p0r_rebind_dispatch_identity_mismatch",
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
      envelope.runtimeMaxSeconds >= 30 &&
      envelope.runtimeMaxSeconds <= 120,
    "p0r_rebind_dispatch_safety_binding_invalid",
  );
  ensure(
    envelope.issuedAt === request.approvalIssuedAt &&
      envelope.expiresAt === request.approvalExpiresAt &&
      envelope.revocationEpoch === request.revocationEpoch,
    "p0r_rebind_dispatch_authorization_mismatch",
  );
  return envelope;
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

export function p0rRebindReadOnlyInvocation(command, args, request) {
  ensure(
    Array.isArray(args) &&
      args.every((value) => typeof value === "string" && !value.includes("\0")),
    "p0r_rebind_command_arguments_invalid",
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
      "p0r_rebind_git_command_not_read_only",
    );
    return { args, executable: COMMAND_PATHS.git };
  }
  if (command === "docker") {
    const containerIds = [
      "ps",
      "--no-trunc",
      "--format",
      "{{.ID}}",
    ];
    const allNames = [
      "ps",
      "-a",
      "--format",
      "{{.Names}}",
    ];
    const volumeNames = [
      "volume",
      "ls",
      "--format",
      "{{.Name}}",
    ];
    ensure(
      sameArgs(args, containerIds) ||
        sameArgs(args, allNames) ||
        sameArgs(args, volumeNames),
      "p0r_rebind_docker_command_not_read_only",
    );
    return {
      args: ["-n", "--", COMMAND_PATHS.docker, ...args],
      executable: COMMAND_PATHS.sudo,
    };
  }
  if (command === "systemctl") {
    ensure(
      sameArgs(args, ["is-enabled", request.expectedTimerUnit]) ||
        sameArgs(args, ["is-active", request.expectedTimerUnit]),
      "p0r_rebind_systemctl_command_not_read_only",
    );
    return { args, executable: COMMAND_PATHS.systemctl };
  }
  if (command === "ss") {
    ensure(sameArgs(args, ["-lntH"]), "p0r_rebind_ss_command_not_read_only");
    return { args, executable: COMMAND_PATHS.ss };
  }
  if (command === "curl") {
    const health = [
      "-kfsS",
      "--max-time",
      "20",
      "http://127.0.0.1/api/health",
    ];
    const metadata = [
      "-fsS",
      "--max-time",
      "10",
      request.metadataEndpoint,
    ];
    ensure(
      sameArgs(args, health) || sameArgs(args, metadata),
      "p0r_rebind_curl_command_not_read_only",
    );
    return { args, executable: COMMAND_PATHS.curl };
  }
  throw new P0RRebindError("p0r_rebind_command_not_allowlisted");
}

export async function runP0RRebindReadOnlyCommand(command, args, request) {
  const invocation = p0rRebindReadOnlyInvocation(command, args, request);
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
    throw new P0RRebindError(`p0r_rebind_command_${command}_failed`);
  }
}

function normalizedLines(value) {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

function healthSummary(raw, expected) {
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new P0RRebindError("p0r_rebind_health_json_invalid");
  }
  const health = body?.health;
  ensure(
    body?.ok === true &&
      health?.level === expected.level &&
      health?.scan?.status === expected.scanStatus &&
      health?.scan?.freshness === expected.scanFreshness &&
      health?.persistence?.databaseStatus ===
        expected.persistenceDatabaseStatus,
    "p0r_rebind_health_not_ready",
  );
  return {
    level: health.level,
    persistenceDatabaseStatus: health.persistence.databaseStatus,
    scanFreshness: health.scan.freshness,
    scanStatus: health.scan.status,
  };
}

export async function captureP0RRebindProductionIdentity(
  request,
  commandRunner,
) {
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
  const p0rContainerNames = normalizedLines(await run("docker", [
    "ps",
    "-a",
    "--format",
    "{{.Names}}",
  ])).filter((name) => P0R_RUNTIME_NAME.test(name));
  const p0rVolumeNames = normalizedLines(await run("docker", [
    "volume",
    "ls",
    "--format",
    "{{.Name}}",
  ])).filter((name) => P0R_RUNTIME_NAME.test(name));
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
    p0rContainerNames,
    p0rVolumeNames,
    productionHead,
    timerActive,
    timerEnabled,
    worktreeClean: worktreeStatus.length === 0,
  };
}

export function assertP0RRebindProductionIdentity(identity, request, phase) {
  ensure(
    identity.productionHead === request.expectedProductionHead,
    `p0r_rebind_${phase}_production_head_mismatch`,
  );
  ensure(
    identity.worktreeClean,
    `p0r_rebind_${phase}_production_worktree_dirty`,
  );
  ensure(
    JSON.stringify(identity.containerIds) ===
      JSON.stringify(request.expectedContainerIds),
    `p0r_rebind_${phase}_container_identity_mismatch`,
  );
  ensure(
    identity.timerActive === "active" && identity.timerEnabled === "enabled",
    `p0r_rebind_${phase}_dispatch_timer_invalid`,
  );
  ensure(
    identity.p0rContainerNames.length === 0 &&
      identity.p0rVolumeNames.length === 0,
    `p0r_rebind_${phase}_runtime_residue_detected`,
  );
}

export function boundedP0RRebindIdentity(identity) {
  return {
    containerCount: identity.containerIds.length,
    containerIdsSha256: sha256(`${identity.containerIds.join("\n")}\n`),
    health: identity.health,
    listenerSha256: identity.listenerSha256,
    p0rContainerCount: identity.p0rContainerNames.length,
    p0rContainerNamesSha256: sha256(
      `${identity.p0rContainerNames.join("\n")}\n`,
    ),
    p0rVolumeCount: identity.p0rVolumeNames.length,
    p0rVolumeNamesSha256: sha256(`${identity.p0rVolumeNames.join("\n")}\n`),
    productionHead: identity.productionHead,
    timerActive: identity.timerActive,
    timerEnabled: identity.timerEnabled,
    worktreeClean: identity.worktreeClean,
  };
}

export async function verifyP0RSourceIpBinding(request, commandRunner) {
  const raw = await commandRunner(
    "curl",
    ["-fsS", "--max-time", "10", request.metadataEndpoint],
    request,
  );
  const address = raw.trim();
  ensure(
    isIP(address) === 4 && !address.includes("\n"),
    "p0r_rebind_metadata_public_ip_invalid",
  );
  const sourceIpCidrSha256 = sha256(`${address}/32`);
  ensure(
    sourceIpCidrSha256 === request.expectedSourceIpCidrSha256,
    "p0r_rebind_source_ip_binding_mismatch",
  );
  return {
    metadataProvider: "TENCENT_INSTANCE_METADATA",
    sourceIpCidrMatched: true,
    sourceIpCidrSha256,
  };
}

export async function inspectP0REphemeralSecretBaseline(
  request,
  policy = DEFAULT_P0R_REBIND_POLICY,
) {
  const shmFacts = await lstat(policy.shmRoot);
  ensure(
    shmFacts.isDirectory() &&
      !shmFacts.isSymbolicLink() &&
      await realpath(policy.shmRoot) === resolve(policy.shmRoot),
    "p0r_rebind_shm_root_unsafe",
  );
  const names = (await readdir(policy.shmRoot))
    .filter((name) => P0R_EPHEMERAL_NAME.test(name))
    .sort();
  ensure(names.length === 0, "p0r_rebind_ephemeral_secret_residue_detected");
  return {
    matchingEntryCount: 0,
    matchingEntryNamesSha256: sha256("\n"),
    status: "PASS_NO_P0R_EPHEMERAL_SECRET_RESIDUE",
  };
}

function legacyManifestFileMap(manifest) {
  ensure(
    Array.isArray(manifest.files) &&
      manifest.files.length >= 10 &&
      manifest.files.length <= 32,
    "p0r_rebind_legacy_manifest_files_invalid",
  );
  const map = {};
  for (const item of manifest.files) {
    exactKeys(
      item,
      ["name", "sha256", "sizeBytes", "sourcePath"],
      "p0r_rebind_legacy_manifest_file_keys_invalid",
    );
    ensure(
      typeof item.name === "string" &&
        !item.name.startsWith("/") &&
        !item.name.includes("/") &&
        !item.name.includes("..") &&
        SHA256.test(item.sha256) &&
        Number.isSafeInteger(item.sizeBytes) &&
        item.sizeBytes > 0 &&
        item.sizeBytes <= 32 * 1024 * 1024 &&
        (item.sourcePath === null || typeof item.sourcePath === "string") &&
        map[item.name] === undefined,
      "p0r_rebind_legacy_manifest_file_invalid",
    );
    map[item.name] = item;
  }
  return map;
}

export async function inspectSupersededP0RStaging(request) {
  const staging = resolve(request.legacyStagingDirectory);
  const stagingFacts = await lstat(staging);
  ensure(
    stagingFacts.isDirectory() &&
      !stagingFacts.isSymbolicLink() &&
      (stagingFacts.mode & 0o077) === 0 &&
      await realpath(staging) === staging,
    "p0r_rebind_legacy_staging_unsafe",
  );
  const manifestPath = join(staging, "transport-manifest.json");
  const { bytes: manifestBytes } = await readRegularFile(
    manifestPath,
    "p0r_rebind_legacy_manifest_unsafe",
    512 * 1024,
  );
  ensure(
    sha256(manifestBytes) === request.expectedLegacyTransportManifestSha256,
    "p0r_rebind_legacy_manifest_sha256_mismatch",
  );
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new P0RRebindError("p0r_rebind_legacy_manifest_invalid");
  }
  ensure(
    manifest.schemaVersion === "v2-m1-production-storage-p0r-transport.v1" &&
      manifest.sourceCommit === request.expectedLegacySourceCommit &&
      manifest.reproducibleArchive === true &&
      manifest.containsSecrets === false &&
      manifest.containsPersistentCredentials === false &&
      manifest.containsPrivateKey === false &&
      manifest.productionDatabaseMutationAllowed === false &&
      manifest.productionRepositoryMutationAllowed === false &&
      manifest.productionServiceMutationAllowed === false,
    "p0r_rebind_legacy_manifest_boundary_invalid",
  );
  const fileMap = legacyManifestFileMap(manifest);
  const expectedNames = [
    ...Object.keys(fileMap),
    "transport-manifest.json",
  ].sort();
  const actualNames = (await readdir(staging, { withFileTypes: true }))
    .map((entry) => {
      ensure(
        entry.isFile() && !entry.isSymbolicLink(),
        "p0r_rebind_legacy_staging_special_file",
      );
      return entry.name;
    })
    .sort();
  ensure(
    JSON.stringify(actualNames) === JSON.stringify(expectedNames),
    "p0r_rebind_legacy_staging_file_set_mismatch",
  );
  const observedFileDigests = {};
  for (const [name, item] of Object.entries(fileMap)) {
    const { bytes, facts } = await readRegularFile(
      join(staging, name),
      "p0r_rebind_legacy_staging_file_unsafe",
      32 * 1024 * 1024,
    );
    ensure(
      facts.size === item.sizeBytes && sha256(bytes) === item.sha256,
      "p0r_rebind_legacy_staging_file_sha256_mismatch",
      name,
    );
    observedFileDigests[name] = item.sha256;
  }
  ensure(
    observedFileDigests["p0r-bindings.env"] ===
      request.expectedLegacyBindingsSha256 &&
      observedFileDigests["cos-provisioning-plan.json"] ===
        request.expectedLegacyPlanSha256,
    "p0r_rebind_legacy_control_digest_mismatch",
  );

  const { bytes: planBytes } = await readRegularFile(
    join(staging, "cos-provisioning-plan.json"),
    "p0r_rebind_legacy_plan_unsafe",
    512 * 1024,
  );
  let plan;
  try {
    plan = JSON.parse(planBytes.toString("utf8"));
  } catch {
    throw new P0RRebindError("p0r_rebind_legacy_plan_invalid");
  }
  ensure(
    plan.schemaVersion ===
      "v2-m1-production-storage-cos-provisioning-plan.v2" &&
      plan.sourceCommit === request.expectedLegacySourceCommit &&
      plan.credentialGrant?.runId === request.expectedLegacyRunId &&
      plan.planDigest === request.expectedLegacyPlanDigest &&
      sha256(plan.credentialGrant?.sourceIpCidr ?? "") ===
        request.expectedSourceIpCidrSha256,
    "p0r_rebind_legacy_plan_binding_invalid",
  );

  const superseded = {};
  for (const name of P0R_REBIND_LEGACY_SUPERSESSION_FILES) {
    const legacyDigest = fileMap[name]?.sha256;
    const currentDigest =
      request.currentLegacySupersessionFileDigests[name];
    ensure(
      SHA256.test(legacyDigest ?? "") &&
        SHA256.test(currentDigest) &&
        legacyDigest !== currentDigest,
      "p0r_rebind_critical_security_source_not_superseded",
      name,
    );
    superseded[name] = { currentDigest, legacyDigest };
  }
  const stagingTreeRows = Object.entries(observedFileDigests)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, digest]) => `${name}\0${digest}`);
  return {
    currentSourceCommit: request.sourceCommit,
    currentP0RRuntimeFileSetSha256: sha256(
      canonicalJson(request.currentP0RRuntimeFileDigests),
    ),
    expectedLegacyBundleSha256: request.expectedLegacyBundleSha256,
    fileCount: actualNames.length,
    legacyBindingsSha256: request.expectedLegacyBindingsSha256,
    legacyPlanDigest: request.expectedLegacyPlanDigest,
    legacyPlanSha256: request.expectedLegacyPlanSha256,
    legacyRunId: request.expectedLegacyRunId,
    legacySourceCommit: request.expectedLegacySourceCommit,
    legacyTransportManifestSha256:
      request.expectedLegacyTransportManifestSha256,
    sourceIpCidrSha256: request.expectedSourceIpCidrSha256,
    stagingTreeSha256: sha256(`${stagingTreeRows.join("\n")}\n`),
    status: "REJECTED_SUPERSEDED_SECURITY_SOURCE",
    supersededCriticalFileSetSha256: sha256(canonicalJson(superseded)),
    transportArchivePresentInStaging: false,
  };
}

export async function ensureP0RRebindEvidenceRoot(
  policy = DEFAULT_P0R_REBIND_POLICY,
) {
  await mkdir(policy.evidenceRoot, { recursive: true, mode: 0o700 });
  const facts = await lstat(policy.evidenceRoot);
  ensure(
    facts.isDirectory() &&
      !facts.isSymbolicLink() &&
      (facts.mode & 0o077) === 0 &&
      await realpath(policy.evidenceRoot) === resolve(policy.evidenceRoot),
    "p0r_rebind_evidence_root_unsafe",
  );
}

export async function writeExclusiveCanonical(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(canonicalJson(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, path);
    await unlink(temporary);
    await chmod(path, 0o600);
    const directory = await open(dirname(path), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    await unlink(temporary).catch(() => {});
    if (error?.code === "EEXIST") {
      throw new P0RRebindError(
        "p0r_rebind_evidence_path_already_exists",
      );
    }
    throw error;
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

const FAILURE_PHASES = Object.freeze([
  "REQUEST_VALIDATION",
  "PACKAGE_BINDING",
  "PRODUCTION_IDENTITY_BEFORE",
  "EPHEMERAL_SECRET_BASELINE",
  "SOURCE_IP_BINDING",
  "SUPERSEDED_STAGING_VALIDATION",
  "PRODUCTION_IDENTITY_AFTER",
  "EVIDENCE_PERSISTENCE",
]);

async function persistBlockedResult({ context, error, policy }) {
  const request = context.request;
  if (request === null || !FAILURE_PHASES.includes(context.phase)) return;
  const existing = await lstat(request.resultPath).catch((readError) => {
    if (readError?.code === "ENOENT") return null;
    throw readError;
  });
  if (existing !== null) return;
  const reason = error instanceof P0RRebindError
    ? error.reason
    : "unexpected_error";
  ensure(
    /^[a-z0-9_]{3,140}$/u.test(reason),
    "p0r_rebind_failure_reason_invalid",
  );
  const before = context.before === null
    ? null
    : boundedP0RRebindIdentity(context.before);
  const after = context.after === null
    ? null
    : boundedP0RRebindIdentity(context.after);
  const result = {
    after,
    before,
    dispatchId: request.dispatchId,
    failurePhase: context.phase,
    failureReason: reason,
    generatedAt: new Date().toISOString(),
    packageId: request.packageId,
    productionChanged: false,
    productionIdentityUnchangedVerified:
      before !== null &&
      after !== null &&
      canonicalJson(before) === canonicalJson(after),
    productionMutationAttempted: false,
    resultPath: request.resultPath,
    schemaVersion: P0R_REBIND_FAILURE_RESULT_SCHEMA,
    secretMaterialPresent: false,
    sourceCommit: request.sourceCommit,
    sourceTree: request.sourceTree,
    status: "BLOCKED_P0R_READ_ONLY_REBIND_PREFLIGHT",
  };
  await ensureP0RRebindEvidenceRoot(policy);
  await writeExclusiveCanonical(request.resultPath, result);
}

async function executeP0RRebindPreflight({
  bundleMarkerPath,
  commandRunner = runP0RRebindReadOnlyCommand,
  context,
  now = new Date(),
  policy = DEFAULT_P0R_REBIND_POLICY,
  requestPath,
}) {
  context.phase = "REQUEST_VALIDATION";
  const { facts: requestFacts, raw, value: request } =
    await readCanonicalJson(
      requestPath,
      "p0r_rebind_request_invalid",
      512 * 1024,
    );
  ensure(
    (requestFacts.mode & 0o077) === 0,
    "p0r_rebind_request_mode_unsafe",
  );
  validateP0RRebindRequest(request, { now, policy });
  context.request = request;

  context.phase = "PACKAGE_BINDING";
  ensure(
    await realpath(request.stagingDirectory) === request.stagingDirectory &&
      await realpath(requestPath) ===
        join(request.stagingDirectory, "approval-request.json"),
    "p0r_rebind_staging_identity_mismatch",
  );
  const stagingFacts = await lstat(request.stagingDirectory);
  ensure(
    stagingFacts.isDirectory() &&
      !stagingFacts.isSymbolicLink() &&
      (stagingFacts.mode & 0o077) === 0,
    "p0r_rebind_staging_mode_unsafe",
  );
  await validateP0RRebindManifest(request.stagingDirectory, request);
  await validateP0RRebindDispatchBinding(
    request.stagingDirectory,
    request,
    raw,
    bundleMarkerPath,
  );

  context.phase = "PRODUCTION_IDENTITY_BEFORE";
  const before = await captureP0RRebindProductionIdentity(
    request,
    commandRunner,
  );
  context.before = before;
  assertP0RRebindProductionIdentity(before, request, "before");

  context.phase = "EPHEMERAL_SECRET_BASELINE";
  const ephemeralSecretBaseline =
    await inspectP0REphemeralSecretBaseline(request, policy);

  context.phase = "SOURCE_IP_BINDING";
  const sourceIpBinding = await verifyP0RSourceIpBinding(
    request,
    commandRunner,
  );

  context.phase = "SUPERSEDED_STAGING_VALIDATION";
  const supersededStaging = await inspectSupersededP0RStaging(request);

  context.phase = "PRODUCTION_IDENTITY_AFTER";
  const after = await captureP0RRebindProductionIdentity(
    request,
    commandRunner,
  );
  context.after = after;
  assertP0RRebindProductionIdentity(after, request, "after");
  const beforeBounded = boundedP0RRebindIdentity(before);
  const afterBounded = boundedP0RRebindIdentity(after);
  ensure(
    canonicalJson(beforeBounded) === canonicalJson(afterBounded),
    "p0r_rebind_production_identity_drift",
  );

  context.phase = "EVIDENCE_PERSISTENCE";
  const result = {
    after: afterBounded,
    before: beforeBounded,
    dispatchId: request.dispatchId,
    ephemeralSecretBaseline,
    generatedAt: new Date().toISOString(),
    packageId: request.packageId,
    productionChanged: false,
    productionIdentityUnchangedVerified: true,
    productionMutationAttempted: false,
    resultPath: request.resultPath,
    schemaVersion: P0R_REBIND_RESULT_SCHEMA,
    secretMaterialPresent: false,
    sourceCommit: request.sourceCommit,
    sourceIpBinding,
    sourceTree: request.sourceTree,
    status: "PASS_P0R_READ_ONLY_REBIND_PREFLIGHT",
    supersededStaging,
  };
  await ensureP0RRebindEvidenceRoot(policy);
  await writeExclusiveCanonical(request.resultPath, result);
  return result;
}

export async function runP0RRebindPreflight(options) {
  const context = {
    after: null,
    before: null,
    phase: "REQUEST_VALIDATION",
    request: null,
  };
  try {
    return await executeP0RRebindPreflight({ ...options, context });
  } catch (error) {
    await persistBlockedResult({
      context,
      error,
      policy: options.policy ?? DEFAULT_P0R_REBIND_POLICY,
    }).catch(() => {});
    throw error;
  }
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  ensure(rest.length % 2 === 0, "p0r_rebind_arguments_invalid");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    ensure(
      /^--[a-z][a-z-]*$/u.test(key ?? "") &&
        typeof value === "string" &&
        !value.startsWith("--") &&
        options[key.slice(2)] === undefined,
      "p0r_rebind_arguments_invalid",
    );
    options[key.slice(2)] = value;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  ensure(
    command === "run" && options.request && options["bundle-marker"],
    "p0r_rebind_command_invalid",
  );
  const result = await runP0RRebindPreflight({
    bundleMarkerPath: resolve(options["bundle-marker"]),
    requestPath: resolve(options.request),
  });
  process.stdout.write(canonicalJson(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(canonicalJson({
      reason: error instanceof P0RRebindError
        ? error.reason
        : "unexpected_error",
      status: "BLOCKED",
    }));
    process.exitCode = 1;
  });
}
