#!/usr/bin/env node

import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  realpath,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  PRODUCTION_EVIDENCE_DEFAULT_TTL_MS,
  ProductionEvidenceError,
  evidenceObjectName,
  publishSealedEvidence,
  scheduleProductionEvidenceExpiry,
  sealProductionEvidence,
} from "./fixed-channel/production-evidence-channel.mjs";
import { canonicalJson, sha256 } from "./fixed-channel/production-dispatch.mjs";

const execFileAsync = promisify(execFile);

export const PRODUCTION_EVIDENCE_GATEWAY_PACKAGE_ID =
  "V2-PRODUCTION-EVIDENCE-GATEWAY-CADDY-ONLY";
export const PRODUCTION_EVIDENCE_GATEWAY_REQUEST_SCHEMA =
  "market-radar-production-evidence-gateway-request.v1";
export const PRODUCTION_EVIDENCE_GATEWAY_RESULT_SCHEMA =
  "market-radar-production-evidence-gateway-result.v1";
export const PRODUCTION_EVIDENCE_GATEWAY_MANIFEST_SCHEMA =
  "market-radar-production-evidence-gateway-manifest.v1";
export const PRODUCTION_EVIDENCE_GATEWAY_MANIFEST =
  "production-evidence-gateway-manifest.json";
export const PRODUCTION_EVIDENCE_GATEWAY_ENTRYPOINT =
  "scripts/v2/production/production-evidence-gateway-entrypoint.sh";
export const PRODUCTION_EVIDENCE_GATEWAY_RUNNER =
  "scripts/v2/production/production-evidence-gateway.mjs";
export const PRODUCTION_EVIDENCE_GATEWAY_CADDYFILE =
  "deploy/caddy/Caddyfile";
export const PRODUCTION_EVIDENCE_GATEWAY_OVERRIDE =
  "scripts/v2/production/fixed-channel/production-evidence-gateway.compose.yml";
export const PRODUCTION_EVIDENCE_GATEWAY_RECIPIENT =
  "scripts/v2/production/fixed-channel/production-evidence-recipient-public.spki";
export const PRODUCTION_EVIDENCE_GATEWAY_SUCCESS_MARKER =
  "PASS_V2_PRODUCTION_EVIDENCE_GATEWAY_CADDY_ONLY";
export const PRODUCTION_EVIDENCE_GATEWAY_RUNTIME_MAX_SECONDS = 110;
export const PRODUCTION_EVIDENCE_GATEWAY_SOURCE_FILES = Object.freeze([
  PRODUCTION_EVIDENCE_GATEWAY_CADDYFILE,
  PRODUCTION_EVIDENCE_GATEWAY_ENTRYPOINT,
  PRODUCTION_EVIDENCE_GATEWAY_OVERRIDE,
  PRODUCTION_EVIDENCE_GATEWAY_RECIPIENT,
  "scripts/v2/production/fixed-channel/production-dispatch.mjs",
  "scripts/v2/production/fixed-channel/production-evidence-channel.mjs",
  PRODUCTION_EVIDENCE_GATEWAY_RUNNER,
].sort());

export const DEFAULT_PRODUCTION_EVIDENCE_GATEWAY_POLICY = Object.freeze({
  caddyContainerName: "chuan-market-radar-caddy-1",
  composeProjectName: "chuan-market-radar",
  dispatchStateRoot: "/var/lib/market-radar-production-dispatch",
  gatewayRoot:
    "/var/lib/market-radar-production-dispatch/evidence-gateway",
  outboxRoot: "/var/lib/market-radar-production-dispatch/outbound",
  productionWorktree: "/home/ubuntu/apps/chuan-market-radar",
  stagingPrefix: "production-evidence-gateway-",
  stagingRoot: "/home/ubuntu/.cache/market-radar-v2",
});

const REQUEST_KEYS = Object.freeze([
  "approvalExpiresAt",
  "approvalIssuedAt",
  "artifactManifestSha256",
  "automaticRollbackRequired",
  "caddyContainerName",
  "caddyMutationAllowed",
  "composeProjectName",
  "databaseMutationAllowed",
  "dispatchId",
  "dispatchRuntimeMaxSeconds",
  "dispatchStateRoot",
  "envMutationAllowed",
  "evidenceOutboxRoot",
  "evidenceRecipientFileSha256",
  "evidenceRecipientFingerprintSha256",
  "expectedBaselineCaddyfileSha256",
  "expectedBaselineComposeSha256",
  "expectedContainerCount",
  "expectedContainerIds",
  "expectedHealth",
  "expectedProductionHead",
  "expectedTargetCaddyfileSha256",
  "expectedTargetComposeOverrideSha256",
  "featureFlagMutationAllowed",
  "gatewayRoot",
  "launchSuccessMarker",
  "maxExecutions",
  "migrationAllowed",
  "packageId",
  "productionMutationScope",
  "productionRepositoryMutationAllowed",
  "productionWorktree",
  "redisMutationAllowed",
  "revocationEpoch",
  "runnerUnitName",
  "schemaVersion",
  "sessionIndependentExecutionRequired",
  "sourceCommit",
  "sourceRef",
  "sourceTree",
  "stagingDirectory",
  "temporaryStagingCleanupRequired",
  "trafficMutationScope",
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
const COMMIT = /^[a-f0-9]{40}$/u;
const TREE = /^[a-f0-9]{40}$/u;
const DISPATCH_ID = /^[a-z0-9][a-z0-9-]{20,100}$/u;
const SOURCE_REF =
  /^refs\/heads\/(?:main|codex\/[a-z0-9][a-z0-9._/-]{2,180})$/u;
const RUNNER_UNIT = /^market-radar-evidence-gateway-[a-z0-9][a-z0-9-]{7,24}$/u;
const CONTAINER_ID = /^[a-f0-9]{64}$/u;
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/u;

export class ProductionEvidenceGatewayError extends Error {
  constructor(reason, details = undefined) {
    super(reason);
    this.name = "ProductionEvidenceGatewayError";
    this.reason = reason;
    this.details = details;
  }
}

function ensure(condition, reason, details = undefined) {
  if (!condition) throw new ProductionEvidenceGatewayError(reason, details);
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
  const parsed = new Date(value);
  ensure(Number.isFinite(parsed.getTime()) && parsed.toISOString() === value, reason);
  return parsed;
}

function directChild(path, parent, prefix, reason) {
  ensure(
    typeof path === "string"
      && isAbsolute(path)
      && !path.includes("\0")
      && resolve(dirname(path)) === resolve(parent)
      && basename(path).startsWith(prefix),
    reason,
  );
  return resolve(path);
}

export function validateProductionEvidenceGatewayRequest(request, {
  now = new Date(),
  policy = DEFAULT_PRODUCTION_EVIDENCE_GATEWAY_POLICY,
} = {}) {
  exactKeys(request, REQUEST_KEYS, "evidence_gateway_request_keys_invalid");
  ensure(request.schemaVersion === PRODUCTION_EVIDENCE_GATEWAY_REQUEST_SCHEMA,
    "evidence_gateway_request_schema_invalid");
  ensure(request.packageId === PRODUCTION_EVIDENCE_GATEWAY_PACKAGE_ID,
    "evidence_gateway_request_package_invalid");
  ensure(DISPATCH_ID.test(request.dispatchId), "evidence_gateway_dispatch_id_invalid");
  ensure(COMMIT.test(request.sourceCommit) && TREE.test(request.sourceTree),
    "evidence_gateway_source_identity_invalid");
  ensure(SOURCE_REF.test(request.sourceRef), "evidence_gateway_source_ref_invalid");
  ensure(COMMIT.test(request.expectedProductionHead),
    "evidence_gateway_production_head_invalid");
  ensure([
    request.artifactManifestSha256,
    request.evidenceRecipientFileSha256,
    request.evidenceRecipientFingerprintSha256,
    request.expectedBaselineCaddyfileSha256,
    request.expectedBaselineComposeSha256,
    request.expectedTargetCaddyfileSha256,
    request.expectedTargetComposeOverrideSha256,
    request.transportBundleSha256,
  ].every((value) => SHA256.test(value)), "evidence_gateway_hash_binding_invalid");
  ensure(
    request.dispatchStateRoot === policy.dispatchStateRoot
      && request.evidenceOutboxRoot === policy.outboxRoot
      && request.gatewayRoot === policy.gatewayRoot
      && request.productionWorktree === policy.productionWorktree
      && request.caddyContainerName === policy.caddyContainerName
      && request.composeProjectName === policy.composeProjectName,
    "evidence_gateway_policy_path_mismatch",
  );
  directChild(
    request.stagingDirectory,
    policy.stagingRoot,
    policy.stagingPrefix,
    "evidence_gateway_staging_invalid",
  );
  const issuedAt = parseTimestamp(
    request.approvalIssuedAt,
    "evidence_gateway_approval_time_invalid",
  );
  const expiresAt = parseTimestamp(
    request.approvalExpiresAt,
    "evidence_gateway_approval_time_invalid",
  );
  ensure(
    expiresAt > issuedAt
      && expiresAt.getTime() - issuedAt.getTime() <= 90 * 60_000
      && now >= issuedAt
      && now <= expiresAt,
    "evidence_gateway_approval_not_current",
  );
  ensure(
    Number.isSafeInteger(request.revocationEpoch) && request.revocationEpoch >= 0,
    "evidence_gateway_revocation_epoch_invalid",
  );
  ensure(
    request.dispatchRuntimeMaxSeconds === PRODUCTION_EVIDENCE_GATEWAY_RUNTIME_MAX_SECONDS
      && request.maxExecutions === 1
      && request.sessionIndependentExecutionRequired === true,
    "evidence_gateway_execution_boundary_invalid",
  );
  ensure(RUNNER_UNIT.test(request.runnerUnitName),
    "evidence_gateway_runner_unit_invalid");
  ensure(
    request.launchSuccessMarker === PRODUCTION_EVIDENCE_GATEWAY_SUCCESS_MARKER
      && request.transportMethod === "signed_git_bundle"
      && request.transportContainsSecrets === false
      && request.temporaryStagingCleanupRequired === true,
    "evidence_gateway_transport_boundary_invalid",
  );
  ensure(
    request.automaticRollbackRequired === true
      && request.caddyMutationAllowed === true
      && request.databaseMutationAllowed === false
      && request.envMutationAllowed === false
      && request.featureFlagMutationAllowed === false
      && request.migrationAllowed === false
      && request.productionRepositoryMutationAllowed === false
      && request.redisMutationAllowed === false
      && request.workerMutationAllowed === false
      && request.productionMutationScope
        === "caddy_container_and_evidence_gateway_state_only"
      && request.trafficMutationScope
        === "high_entropy_encrypted_evidence_get_head_route_only",
    "evidence_gateway_mutation_boundary_invalid",
  );
  exactKeys(request.expectedHealth, HEALTH_KEYS, "evidence_gateway_health_keys_invalid");
  ensure(
    request.expectedHealth.level === "ready"
      && request.expectedHealth.persistenceDatabaseStatus === "ready"
      && request.expectedHealth.scanFreshness === "fresh"
      && request.expectedHealth.scanStatus === "ready",
    "evidence_gateway_health_expectation_invalid",
  );
  ensure(
    Number.isSafeInteger(request.expectedContainerCount)
      && request.expectedContainerCount > 0
      && Array.isArray(request.expectedContainerIds)
      && request.expectedContainerIds.length === request.expectedContainerCount
      && request.expectedContainerIds.every((value) => CONTAINER_ID.test(value))
      && new Set(request.expectedContainerIds).size === request.expectedContainerIds.length
      && canonicalJson(request.expectedContainerIds)
        === canonicalJson([...request.expectedContainerIds].sort()),
    "evidence_gateway_container_identity_invalid",
  );
  return request;
}

export async function readBoundedProductionEvidenceGatewayFile(
  path,
  maximumBytes,
  reason,
  requiredMode = undefined,
) {
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const before = await handle.stat();
    ensure(
      before.isFile()
        && before.size > 0
        && before.size <= maximumBytes
        && (requiredMode === undefined || (before.mode & 0o777) === requiredMode),
      reason,
    );
    const bytes = await handle.readFile();
    const after = await handle.stat();
    ensure(
      bytes.length === before.size
        && before.dev === after.dev
        && before.ino === after.ino
        && before.size === after.size
        && before.mtimeMs === after.mtimeMs,
      reason,
    );
    return bytes;
  } catch (error) {
    if (error instanceof ProductionEvidenceGatewayError) throw error;
    throw new ProductionEvidenceGatewayError(reason, {
      code: typeof error?.code === "string" ? error.code.slice(0, 40) : null,
    });
  } finally {
    await handle?.close();
  }
}

async function readCanonicalJson(path, maximumBytes, reason, requiredMode = 0o600) {
  const bytes = await readBoundedProductionEvidenceGatewayFile(
    path,
    maximumBytes,
    reason,
    requiredMode,
  );
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new ProductionEvidenceGatewayError(reason);
  }
  ensure(canonicalJson(value) === bytes.toString("utf8"), reason);
  return { bytes, value };
}

async function validateGatewayBundle(request) {
  const marker = await readBoundedProductionEvidenceGatewayFile(
    join(request.stagingDirectory, ".transport-bundle.sha256"),
    128,
    "evidence_gateway_bundle_marker_invalid",
    0o600,
  );
  ensure(marker.toString("utf8") === `${request.transportBundleSha256}\n`,
    "evidence_gateway_bundle_marker_mismatch");
  const manifestPath = join(
    request.stagingDirectory,
    PRODUCTION_EVIDENCE_GATEWAY_MANIFEST,
  );
  const { bytes, value: manifest } = await readCanonicalJson(
    manifestPath,
    512 * 1024,
    "evidence_gateway_manifest_invalid",
  );
  ensure(sha256(bytes) === request.artifactManifestSha256,
    "evidence_gateway_manifest_hash_mismatch");
  exactKeys(manifest, MANIFEST_KEYS, "evidence_gateway_manifest_keys_invalid");
  ensure(
    manifest.schemaVersion === PRODUCTION_EVIDENCE_GATEWAY_MANIFEST_SCHEMA
      && manifest.packageId === PRODUCTION_EVIDENCE_GATEWAY_PACKAGE_ID
      && manifest.sourceCommit === request.sourceCommit
      && manifest.sourceTree === request.sourceTree
      && manifest.archiveFormat === "ustar+gzip-n"
      && manifest.containsSecrets === false
      && manifest.mutationScope === "caddy_container_and_evidence_gateway_state_only"
      && manifest.sourceDateEpoch === 946_684_800,
    "evidence_gateway_manifest_binding_invalid",
  );
  const expectedNames = [...PRODUCTION_EVIDENCE_GATEWAY_SOURCE_FILES].sort();
  ensure(
    manifest.files
      && typeof manifest.files === "object"
      && !Array.isArray(manifest.files)
      && canonicalJson(Object.keys(manifest.files).sort()) === canonicalJson(expectedNames),
    "evidence_gateway_manifest_file_set_invalid",
  );
  for (const name of expectedNames) {
    ensure(SHA256.test(manifest.files[name]), "evidence_gateway_manifest_file_hash_invalid");
    const file = await readBoundedProductionEvidenceGatewayFile(
      join(request.stagingDirectory, name),
      16 * 1024 * 1024,
      "evidence_gateway_source_file_invalid",
      name === PRODUCTION_EVIDENCE_GATEWAY_ENTRYPOINT ? 0o700 : 0o600,
    );
    ensure(sha256(file) === manifest.files[name],
      "evidence_gateway_source_file_hash_mismatch", { name });
  }
  ensure(
    manifest.files[PRODUCTION_EVIDENCE_GATEWAY_CADDYFILE]
      === request.expectedTargetCaddyfileSha256
      && manifest.files[PRODUCTION_EVIDENCE_GATEWAY_OVERRIDE]
        === request.expectedTargetComposeOverrideSha256
      && manifest.files[PRODUCTION_EVIDENCE_GATEWAY_RECIPIENT]
        === request.evidenceRecipientFileSha256,
    "evidence_gateway_target_hash_mismatch",
  );
  return manifest;
}

function parseHealth(raw, expected) {
  let body;
  try {
    body = JSON.parse(String(raw));
  } catch {
    throw new ProductionEvidenceGatewayError("evidence_gateway_health_invalid");
  }
  const health = body?.health;
  ensure(
    body?.ok === true
      && health?.level === expected.level
      && health?.scan?.status === expected.scanStatus
      && health?.scan?.freshness === expected.scanFreshness
      && health?.persistence?.databaseStatus === expected.persistenceDatabaseStatus,
    "evidence_gateway_health_not_ready",
  );
  return {
    level: health.level,
    persistenceDatabaseStatus: health.persistence.databaseStatus,
    scanFreshness: health.scan.freshness,
    scanStatus: health.scan.status,
  };
}

function parseContainerMap(raw) {
  const entries = String(raw).split(/\r?\n/u).filter(Boolean);
  const map = new Map();
  for (const line of entries) {
    const separator = line.indexOf("=");
    ensure(separator > 0, "evidence_gateway_container_map_invalid");
    const name = line.slice(0, separator);
    const id = line.slice(separator + 1);
    ensure(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,180}$/u.test(name) && CONTAINER_ID.test(id),
      "evidence_gateway_container_map_invalid");
    ensure(!map.has(name), "evidence_gateway_container_map_invalid");
    map.set(name, id);
  }
  return map;
}

async function defaultCommandRunner(command, args) {
  const common = { maxBuffer: 4 * 1024 * 1024, timeout: 30_000 };
  if (command === "git") {
    const { stdout } = await execFileAsync("/usr/bin/git", args, {
      ...common,
      encoding: "utf8",
    });
    return stdout.trim();
  }
  if (command === "docker") {
    const { stdout } = await execFileAsync(
      "/usr/bin/sudo",
      ["-n", "--", "/usr/bin/docker", ...args],
      { ...common, encoding: "utf8", timeout: 75_000 },
    );
    return stdout.trim();
  }
  if (command === "curl") {
    const { stdout } = await execFileAsync("/usr/bin/curl", args, {
      ...common,
      encoding: null,
    });
    return stdout;
  }
  if (command === "systemctl") {
    const { stdout } = await execFileAsync("/usr/bin/systemctl", args, {
      ...common,
      encoding: "utf8",
    });
    return stdout.trim();
  }
  throw new ProductionEvidenceGatewayError("evidence_gateway_command_not_allowed");
}

function composePrefix(request, includeOverride) {
  const args = [
    "compose",
    "--project-directory", request.productionWorktree,
    "--project-name", request.composeProjectName,
    "--env-file", join(request.productionWorktree, ".env.production"),
    "-f", join(request.productionWorktree, "docker-compose.yml"),
  ];
  if (includeOverride) {
    args.push("-f", join(request.gatewayRoot, "production-evidence-gateway.compose.yml"));
  }
  return args;
}

async function captureIdentity(request, commandRunner) {
  const run = (command, args) => commandRunner(command, args, request);
  const productionHead = await run("git", [
    "-C", request.productionWorktree, "rev-parse", "HEAD",
  ]);
  const worktreeStatus = await run("git", [
    "-C", request.productionWorktree, "status", "--porcelain=v1", "--untracked-files=all",
  ]);
  const containers = parseContainerMap(await run("docker", [
    "ps", "--no-trunc", "--format", "{{.Names}}={{.ID}}",
  ]));
  const caddyImageId = await run("docker", [
    "inspect", "--format", "{{.Image}}", request.caddyContainerName,
  ]);
  ensure(IMAGE_ID.test(caddyImageId), "evidence_gateway_caddy_image_invalid");
  const health = parseHealth(await run("curl", [
    "-kfsS", "--max-time", "20", "http://127.0.0.1/api/health",
  ]), request.expectedHealth);
  const timerActive = await run("systemctl", [
    "is-active", "market-radar-production-dispatch.timer",
  ]);
  const timerEnabled = await run("systemctl", [
    "is-enabled", "market-radar-production-dispatch.timer",
  ]);
  return {
    caddyImageId,
    containers,
    health,
    productionHead,
    timerActive,
    timerEnabled,
    worktreeClean: worktreeStatus.length === 0,
  };
}

function assertBaselineIdentity(identity, request) {
  const ids = [...identity.containers.values()].sort();
  ensure(
    identity.productionHead === request.expectedProductionHead
      && identity.worktreeClean
      && canonicalJson(ids) === canonicalJson(request.expectedContainerIds)
      && identity.containers.size === request.expectedContainerCount
      && identity.containers.has(request.caddyContainerName)
      && identity.timerActive === "active"
      && identity.timerEnabled === "enabled",
    "evidence_gateway_baseline_identity_mismatch",
  );
}

async function installGatewayFiles(request) {
  await lstat(request.gatewayRoot).then(
    () => { throw new ProductionEvidenceGatewayError("evidence_gateway_root_already_exists"); },
    (error) => { if (error?.code !== "ENOENT") throw error; },
  );
  await mkdir(request.gatewayRoot, { mode: 0o755 });
  try {
    const files = [
      [PRODUCTION_EVIDENCE_GATEWAY_CADDYFILE, "Caddyfile"],
      [PRODUCTION_EVIDENCE_GATEWAY_OVERRIDE, "production-evidence-gateway.compose.yml"],
    ];
    for (const [source, name] of files) {
      const bytes = await readBoundedProductionEvidenceGatewayFile(
        join(request.stagingDirectory, source),
        1024 * 1024,
        "evidence_gateway_install_source_invalid",
        0o600,
      );
      const target = join(request.gatewayRoot, name);
      await writeFile(target, bytes, { flag: "wx", mode: 0o644 });
      await chmod(target, 0o644);
    }
    await mkdir(request.evidenceOutboxRoot, { recursive: true, mode: 0o755 });
    await chmod(request.evidenceOutboxRoot, 0o755);
    ensure(await realpath(request.gatewayRoot) === resolve(request.gatewayRoot),
      "evidence_gateway_root_unsafe");
  } catch (error) {
    await rm(request.gatewayRoot, { recursive: true, force: true });
    throw error;
  }
}

async function validateTargetCaddy(request, baseline, commandRunner) {
  const suffix = sha256(request.dispatchId).slice(0, 16);
  await commandRunner("docker", [
    "run",
    "--rm",
    "--network", "none",
    "--name", `market-radar-evidence-gateway-validate-${suffix}`,
    "--read-only",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--env", "CHUAN_PUBLIC_HOST=:80",
    "--volume", `${join(request.gatewayRoot, "Caddyfile")}:/etc/caddy/Caddyfile:ro`,
    "--volume", `${request.evidenceOutboxRoot}:/srv/market-radar-production-evidence:ro`,
    "--tmpfs", "/config:rw,noexec,nosuid,nodev,size=1m",
    "--tmpfs", "/data:rw,noexec,nosuid,nodev,size=1m",
    "--entrypoint", "/usr/bin/caddy",
    baseline.caddyImageId,
    "validate",
    "--config", "/etc/caddy/Caddyfile",
    "--adapter", "caddyfile",
  ], request);
  await commandRunner("docker", [
    ...composePrefix(request, true),
    "config",
    "--quiet",
  ], request);
}

async function recreateCaddy(request, commandRunner, includeOverride) {
  await commandRunner("docker", [
    ...composePrefix(request, includeOverride),
    "up",
    "-d",
    "--no-deps",
    "--force-recreate",
    "--pull", "never",
    "caddy",
  ], request);
}

async function waitForReadyHealth(request, commandRunner, sleeper) {
  let lastError;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      return parseHealth(await commandRunner("curl", [
        "-kfsS", "--max-time", "10", "http://127.0.0.1/api/health",
      ], request), request.expectedHealth);
    } catch (error) {
      lastError = error;
      if (attempt < 12) await sleeper(2_000);
    }
  }
  throw new ProductionEvidenceGatewayError("evidence_gateway_health_recovery_timeout", {
    lastReason: lastError instanceof ProductionEvidenceGatewayError
      ? lastError.reason
      : "unexpected_error",
  });
}

function assertPostIdentity(before, after, request) {
  ensure(
    after.productionHead === before.productionHead
      && after.worktreeClean
      && after.caddyImageId === before.caddyImageId
      && after.containers.size === before.containers.size,
    "evidence_gateway_post_identity_mismatch",
  );
  for (const [name, id] of before.containers) {
    const afterId = after.containers.get(name);
    ensure(
      name === request.caddyContainerName ? afterId !== id : afterId === id,
      "evidence_gateway_non_target_container_drift",
      { name },
    );
  }
}

async function assertGatewayMounts(request, commandRunner) {
  const raw = await commandRunner("docker", [
    "inspect", "--format", "{{json .Mounts}}", request.caddyContainerName,
  ], request);
  let mounts;
  try {
    mounts = JSON.parse(raw);
  } catch {
    throw new ProductionEvidenceGatewayError("evidence_gateway_mounts_invalid");
  }
  ensure(Array.isArray(mounts), "evidence_gateway_mounts_invalid");
  const byDestination = new Map(mounts.map((mount) => [mount.Destination, mount]));
  const caddyfile = byDestination.get("/etc/caddy/Caddyfile");
  const outbox = byDestination.get("/srv/market-radar-production-evidence");
  ensure(
    caddyfile?.Source === join(request.gatewayRoot, "Caddyfile")
      && caddyfile?.RW === false
      && outbox?.Source === request.evidenceOutboxRoot
      && outbox?.RW === false,
    "evidence_gateway_mount_binding_mismatch",
  );
}

async function verifyRouteProbe(request, commandRunner) {
  const objectName = `${sha256(`market-radar-evidence-gateway-probe\0${request.dispatchId}`)}.mre`;
  const path = join(request.evidenceOutboxRoot, objectName);
  const bytes = Buffer.from(canonicalJson({
    dispatchId: request.dispatchId,
    status: "SANITIZED_GATEWAY_ROUTE_PROBE",
  }));
  await writeFile(path, bytes, { flag: "wx", mode: 0o644 });
  await chmod(path, 0o644);
  try {
    const received = await commandRunner("curl", [
      "-kfsS",
      "--max-time", "10",
      `http://127.0.0.1/_market-radar/evidence/${objectName}`,
    ], request);
    ensure(Buffer.isBuffer(received) && sha256(received) === sha256(bytes),
      "evidence_gateway_route_probe_mismatch");
    const malformedStatus = await commandRunner("curl", [
      "-ksS",
      "--max-time", "10",
      "--output", "/dev/null",
      "--write-out", "%{http_code}",
      "http://127.0.0.1/_market-radar/evidence/not-allowed.mre",
    ], request);
    ensure(String(malformedStatus) === "404", "evidence_gateway_namespace_not_closed");
  } finally {
    await unlink(path).catch(() => {});
  }
}

async function publishGatewayEvidence({
  after,
  before,
  expiryScheduler,
  now,
  request,
  signer,
  signerOptions,
}) {
  const recipientPath = join(
    request.stagingDirectory,
    PRODUCTION_EVIDENCE_GATEWAY_RECIPIENT,
  );
  const recipient = await readBoundedProductionEvidenceGatewayFile(
    recipientPath,
    16 * 1024,
    "evidence_gateway_recipient_invalid",
    0o600,
  );
  ensure(sha256(recipient) === request.evidenceRecipientFileSha256,
    "evidence_gateway_recipient_hash_mismatch");
  const payload = {
    caddyContainerRecreated: true,
    caddyImageIdentityUnchanged: after.caddyImageId === before.caddyImageId,
    databaseChanged: false,
    dispatchId: request.dispatchId,
    envChanged: false,
    evidenceRouteProbeVerified: true,
    featureFlagChanged: false,
    generatedAt: now.toISOString(),
    migrationExecuted: false,
    nonCaddyContainerIdentityUnchanged: true,
    packageId: request.packageId,
    productionHead: after.productionHead,
    productionRepositoryChanged: false,
    redisChanged: false,
    schemaVersion: PRODUCTION_EVIDENCE_GATEWAY_RESULT_SCHEMA,
    sourceCommit: request.sourceCommit,
    sourceTree: request.sourceTree,
    status: "PASS_PRODUCTION_EVIDENCE_GATEWAY_CADDY_ONLY",
    workerChanged: false,
  };
  const expiresAt = new Date(
    now.getTime() + PRODUCTION_EVIDENCE_DEFAULT_TTL_MS,
  ).toISOString();
  const sealOptions = {
    dispatchId: request.dispatchId,
    expectedSchemaVersion: PRODUCTION_EVIDENCE_GATEWAY_RESULT_SCHEMA,
    expiresAt,
    now,
    payload,
    recipientPublicKey: recipient.toString("utf8"),
    signerOptions,
  };
  if (signer) sealOptions.signer = signer;
  let sealed;
  try {
    sealed = await sealProductionEvidence(sealOptions);
  } catch (error) {
    if (error instanceof ProductionEvidenceError) {
      throw new ProductionEvidenceGatewayError(
        `evidence_gateway_seal_failed:${error.reason}`,
      );
    }
    throw error;
  }
  ensure(sealed.recipientKeySha256 === request.evidenceRecipientFingerprintSha256,
    "evidence_gateway_recipient_identity_mismatch");
  const scheduled = await expiryScheduler({
    dispatchId: request.dispatchId,
    expiresAt,
    now,
    outboxRoot: request.evidenceOutboxRoot,
  });
  ensure(
    scheduled?.status === "PASS_PRODUCTION_EVIDENCE_EXPIRY_SCHEDULED"
      && scheduled?.objectName === evidenceObjectName(request.dispatchId),
    "evidence_gateway_expiry_schedule_invalid",
  );
  const publication = await publishSealedEvidence({
    outboxRoot: request.evidenceOutboxRoot,
    sealed,
  });
  ensure(publication.objectName === evidenceObjectName(request.dispatchId),
    "evidence_gateway_publication_binding_mismatch");
  return { payload, publication, scheduled };
}

async function rollbackGateway(request, before, commandRunner, sleeper) {
  await recreateCaddy(request, commandRunner, false);
  await waitForReadyHealth(request, commandRunner, sleeper);
  const afterRollback = await captureIdentity(request, commandRunner);
  ensure(
    afterRollback.productionHead === before.productionHead
      && afterRollback.worktreeClean
      && afterRollback.caddyImageId === before.caddyImageId
      && afterRollback.containers.size === before.containers.size,
    "evidence_gateway_rollback_identity_mismatch",
  );
  for (const [name, id] of before.containers) {
    if (name !== request.caddyContainerName) {
      ensure(afterRollback.containers.get(name) === id,
        "evidence_gateway_rollback_non_target_drift", { name });
    }
  }
  const mounts = await commandRunner("docker", [
    "inspect", "--format", "{{json .Mounts}}", request.caddyContainerName,
  ], request);
  ensure(
    !String(mounts).includes(request.gatewayRoot)
      && !String(mounts).includes(request.evidenceOutboxRoot),
    "evidence_gateway_rollback_mount_residue",
  );
}

export async function runProductionEvidenceGateway({
  commandRunner = defaultCommandRunner,
  expiryScheduler = scheduleProductionEvidenceExpiry,
  now = new Date(),
  policy = DEFAULT_PRODUCTION_EVIDENCE_GATEWAY_POLICY,
  requestPath,
  signer = undefined,
  signerOptions = undefined,
  sleeper = (milliseconds) => new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds)),
}) {
  ensure(isAbsolute(requestPath), "evidence_gateway_request_path_invalid");
  const { value: request } = await readCanonicalJson(
    requestPath,
    512 * 1024,
    "evidence_gateway_request_invalid",
  );
  validateProductionEvidenceGatewayRequest(request, { now, policy });
  ensure(
    await realpath(requestPath) === join(request.stagingDirectory, "approval-request.json"),
    "evidence_gateway_request_identity_mismatch",
  );
  await validateGatewayBundle(request);
  const baseCaddyfile = await readBoundedProductionEvidenceGatewayFile(
    join(request.productionWorktree, "deploy/caddy/Caddyfile"),
    1024 * 1024,
    "evidence_gateway_baseline_caddyfile_invalid",
  );
  const baseCompose = await readBoundedProductionEvidenceGatewayFile(
    join(request.productionWorktree, "docker-compose.yml"),
    4 * 1024 * 1024,
    "evidence_gateway_baseline_compose_invalid",
  );
  ensure(
    sha256(baseCaddyfile) === request.expectedBaselineCaddyfileSha256
      && sha256(baseCompose) === request.expectedBaselineComposeSha256,
    "evidence_gateway_baseline_file_hash_mismatch",
  );
  const before = await captureIdentity(request, commandRunner);
  assertBaselineIdentity(before, request);
  let gatewayInstalled = false;
  let mutationStarted = false;
  try {
    await installGatewayFiles(request);
    gatewayInstalled = true;
    await validateTargetCaddy(request, before, commandRunner);
    mutationStarted = true;
    await recreateCaddy(request, commandRunner, true);
    await waitForReadyHealth(request, commandRunner, sleeper);
    const after = await captureIdentity(request, commandRunner);
    assertPostIdentity(before, after, request);
    await assertGatewayMounts(request, commandRunner);
    await verifyRouteProbe(request, commandRunner);
    const evidence = await publishGatewayEvidence({
      after,
      before,
      expiryScheduler,
      now,
      request,
      signer,
      signerOptions,
    });
    return {
      caddyImageId: after.caddyImageId,
      dispatchId: request.dispatchId,
      evidenceObjectName: evidence.publication.objectName,
      evidenceObjectSha256: evidence.publication.objectSha256,
      evidenceExpiryUnitName: evidence.scheduled.unitName,
      nonTargetContainerCount: after.containers.size - 1,
      packageId: request.packageId,
      productionHead: after.productionHead,
      sourceCommit: request.sourceCommit,
      status: "PASS_PRODUCTION_EVIDENCE_GATEWAY_CADDY_ONLY",
    };
  } catch (error) {
    if (mutationStarted) {
      try {
        await rollbackGateway(request, before, commandRunner, sleeper);
      } catch (rollbackError) {
        throw new ProductionEvidenceGatewayError("evidence_gateway_rollback_failed", {
          originalReason: error instanceof ProductionEvidenceGatewayError
            ? error.reason
            : "unexpected_error",
          rollbackReason: rollbackError instanceof ProductionEvidenceGatewayError
            ? rollbackError.reason
            : "unexpected_error",
        });
      }
    }
    if (gatewayInstalled) await rm(request.gatewayRoot, { recursive: true, force: true });
    throw error;
  }
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  ensure(rest.length % 2 === 0, "evidence_gateway_arguments_invalid");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    ensure(
      /^--[a-z][a-z-]*$/u.test(key ?? "")
        && typeof value === "string"
        && !value.startsWith("--")
        && options[key.slice(2)] === undefined,
      "evidence_gateway_arguments_invalid",
    );
    options[key.slice(2)] = value;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  ensure(
    command === "run"
      && typeof options.request === "string"
      && Object.keys(options).length === 1,
    "evidence_gateway_command_invalid",
  );
  const result = await runProductionEvidenceGateway({
    requestPath: options.request,
  });
  process.stdout.write(canonicalJson(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(canonicalJson({
      details: error instanceof ProductionEvidenceGatewayError ? error.details : undefined,
      reason: error instanceof ProductionEvidenceGatewayError
        ? error.reason
        : "unexpected_error",
      status: "BLOCKED",
    }));
    process.exitCode = 1;
  });
}
