#!/usr/bin/env node

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  LiveSourceConformanceError,
  assertProductionIdentity,
  boundedIdentity,
  canonicalJson,
  captureProductionIdentity,
  ensureEvidenceRoot,
  runLiveReadOnlyCommand,
  sha256,
  writeExclusiveCanonical,
} from "./m1-source-conformance-live-runner.mjs";

const execFileAsync = promisify(execFile);

export const M1_EXPANDED_SHADOW_LIVE_PACKAGE_ID =
  "V2-M1-5C-5D-TENCENT-EXPANDED-SHADOW";
export const M1_EXPANDED_SHADOW_LIVE_REQUEST_SCHEMA =
  "market-radar-v2-m1-expanded-shadow-live-request.v1";
export const M1_EXPANDED_SHADOW_LIVE_RESULT_SCHEMA =
  "market-radar-v2-m1-expanded-shadow-live-result.v2";
export const M1_EXPANDED_SHADOW_LIVE_FAILURE_SCHEMA =
  "market-radar-v2-m1-expanded-shadow-live-failure.v2";
export const M1_EXPANDED_SHADOW_LIVE_ENTRYPOINT =
  "scripts/v2/production/m1-expanded-shadow-live-entrypoint.sh";
export const M1_EXPANDED_SHADOW_LIVE_RUNNER =
  "scripts/v2/production/m1-expanded-shadow-live-runner.mjs";
export const M1_EXPANDED_SHADOW_LIVE_SAFETY_RUNNER =
  "scripts/v2/production/m1-source-conformance-live-runner.mjs";
export const M1_EXPANDED_SHADOW_LIVE_RUNTIME_ENTRY =
  "runtime/v2/entrypoints/m1-expanded-shadow-live-runtime.js";
export const M1_EXPANDED_SHADOW_LIVE_SUCCESS_MARKER =
  "PASS_V2_M1_5C_5D_TENCENT_EXPANDED_SHADOW";
export const M1_EXPANDED_SHADOW_POSTGRES_IMAGE =
  "postgres:16-bookworm@sha256:92620daddcd947f8d5ab5ba66e848702fe443d87fed30c4cea8e389fd78dfc55";

export const DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY = Object.freeze({
  conformanceEvidenceRoot:
    "/var/lib/market-radar-production-dispatch/evidence/m1-source-conformance",
  dispatchStateRoot: "/var/lib/market-radar-production-dispatch",
  evidenceRoot:
    "/var/lib/market-radar-production-dispatch/evidence/m1-expanded-shadow",
  expectedTimerUnit: "market-radar-production-dispatch.timer",
  productionWorktree: "/home/ubuntu/apps/chuan-market-radar",
  runtimeAdapterEvidenceRoot:
    "/var/lib/market-radar-production-dispatch/evidence/m1-runtime-adapter",
  stagingRoot: "/home/ubuntu/.cache/market-radar-v2",
  stagingPrefix: "m1-expanded-shadow-",
});

const REQUEST_KEYS = Object.freeze([
  "applicationMutationAllowed",
  "approvalExpiresAt",
  "approvalIssuedAt",
  "artifactManifestSha256",
  "automaticRollbackRequired",
  "automaticTradingAllowed",
  "buildOnTargetAllowed",
  "candidateAuthorityAllowed",
  "conformanceArtifact",
  "databaseMutationAllowed",
  "dependencyInstallAllowed",
  "dispatchId",
  "dispatchStateRoot",
  "evidenceRoot",
  "expectedContainerCount",
  "expectedContainerIds",
  "expectedHealth",
  "expectedPostgresImageId",
  "expectedProductionHead",
  "expectedTimerUnit",
  "expectedTopologyBeforeHash",
  "factAuthorityAllowed",
  "launchSuccessMarker",
  "maxExecutions",
  "networkEnvironment",
  "packageId",
  "postgresImageReference",
  "productionMutationScope",
  "productionRepositoryMutationAllowed",
  "productionServiceMutationAllowed",
  "productionWorktree",
  "readProductionSecretsAllowed",
  "redisMutationAllowed",
  "releaseManifest",
  "resultPath",
  "revocationEpoch",
  "rotationOrdinal",
  "runnerUnitName",
  "runtimeAdapterArtifact",
  "runtimeDeadlineSeconds",
  "schemaVersion",
  "sessionIndependentExecutionRequired",
  "sourceCommit",
  "sourceRef",
  "sourceTree",
  "stagingDirectory",
  "strategyAuthorityAllowed",
  "temporaryIsolatedShadowStorageAllowed",
  "temporaryStagingCleanupRequired",
  "transportBundleSha256",
  "transportContainsSecrets",
  "transportMethod",
  "workerMutationAllowed",
  "writeProductionEnvironmentAllowed",
]);
const ARTIFACT_REFERENCE_KEYS = Object.freeze([
  "artifactId",
  "contentHash",
  "path",
  "releaseId",
  "sha256",
]);
const HEALTH_KEYS = Object.freeze([
  "level",
  "persistenceDatabaseStatus",
  "scanFreshness",
  "scanStatus",
]);
const SHA256 = /^[a-f0-9]{64}$/u;
const PREFIXED_SHA256 = /^sha256:[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9-]{15,100}$/u;
const SOURCE_REF =
  /^refs\/heads\/(?:main|codex\/[a-z0-9][a-z0-9._/-]{2,180})$/u;
const RUNNER_UNIT =
  /^market-radar-m1-expanded-shadow-[a-z0-9][a-z0-9-]{5,28}$/u;
const MAX_JSON_BYTES = 64 * 1024 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 4 * 1024 * 1024;

export class M1ExpandedShadowLiveError extends Error {
  constructor(reason, details = undefined) {
    super(reason);
    this.name = "M1ExpandedShadowLiveError";
    this.reason = reason;
    this.details = details;
  }
}

function createExecutionContext() {
  return {
    phase: "REQUEST_LOAD",
    topologyBeforeHash: null,
    nonTargetServiceCountBefore: null,
    m15cEvidenceId: null,
    m15cEvidenceHash: null,
    m23aRuntimeEvidenceId: null,
    m23aRuntimeEvidenceHash: null,
    m15dEvidenceId: null,
    m15dEvidenceHash: null,
  };
}

function ensure(condition, reason, details = undefined) {
  if (!condition) {
    throw new M1ExpandedShadowLiveError(reason, details);
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

function parseTimestamp(value, reason) {
  const parsed = new Date(value);
  ensure(
    Number.isFinite(parsed.getTime()) && parsed.toISOString() === value,
    reason,
  );
  return parsed;
}

function prefixedSha256(value) {
  return `sha256:${sha256(value)}`;
}

function evidenceArtifactPath(path, root, reason) {
  ensure(
    typeof path === "string" &&
      path.startsWith("/") &&
      !path.includes("\0") &&
      path.endsWith(".json") &&
      (
        resolve(path) === resolve(root, basename(path)) ||
        resolve(path).startsWith(`${resolve(root)}${sep}`)
      ),
    reason,
  );
  return resolve(path);
}

function validateHealth(value) {
  exactKeys(value, HEALTH_KEYS, "expanded_shadow_health_keys_invalid");
  ensure(
    value.level === "ready" &&
      value.persistenceDatabaseStatus === "ready" &&
      value.scanFreshness === "fresh" &&
      value.scanStatus === "ready",
    "expanded_shadow_health_expectation_invalid",
  );
}

function validateArtifactReference(value, root, name) {
  exactKeys(
    value,
    ARTIFACT_REFERENCE_KEYS,
    `expanded_shadow_${name}_reference_keys_invalid`,
  );
  ensure(
    typeof value.artifactId === "string" &&
      value.artifactId.length > 0 &&
      PREFIXED_SHA256.test(value.contentHash) &&
      COMMIT.test(value.releaseId) &&
      SHA256.test(value.sha256),
    `expanded_shadow_${name}_reference_identity_invalid`,
  );
  evidenceArtifactPath(
    value.path,
    root,
    `expanded_shadow_${name}_reference_path_invalid`,
  );
}

function assertNoSecretLikeMaterial(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of [
    "api_key=",
    "apikey=",
    "secret=",
    "token=",
    "authorization:",
    "private_key",
    "begin rsa private key",
    ".env.production",
  ]) {
    ensure(
      !serialized.includes(forbidden),
      "expanded_shadow_request_contains_secret_like_material",
    );
  }
}

export function validateM1ExpandedShadowLiveRequest(
  value,
  {
    now = new Date(),
    policy = DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY,
  } = {},
) {
  exactKeys(value, REQUEST_KEYS, "expanded_shadow_request_keys_invalid");
  ensure(
    value.schemaVersion === M1_EXPANDED_SHADOW_LIVE_REQUEST_SCHEMA &&
      value.packageId === M1_EXPANDED_SHADOW_LIVE_PACKAGE_ID &&
      SAFE_ID.test(value.dispatchId) &&
      COMMIT.test(value.sourceCommit) &&
      COMMIT.test(value.sourceTree) &&
      SOURCE_REF.test(value.sourceRef) &&
      RUNNER_UNIT.test(value.runnerUnitName),
    "expanded_shadow_request_identity_invalid",
  );
  ensure(
    value.launchSuccessMarker === M1_EXPANDED_SHADOW_LIVE_SUCCESS_MARKER &&
      value.transportMethod === "signed_git_bundle" &&
      SHA256.test(value.transportBundleSha256) &&
      SHA256.test(value.artifactManifestSha256),
    "expanded_shadow_transport_binding_invalid",
  );
  const issuedAt = parseTimestamp(
    value.approvalIssuedAt,
    "expanded_shadow_approval_issued_at_invalid",
  );
  const expiresAt = parseTimestamp(
    value.approvalExpiresAt,
    "expanded_shadow_approval_expires_at_invalid",
  );
  ensure(
    expiresAt > issuedAt &&
      expiresAt.getTime() - issuedAt.getTime() <= 90 * 60_000 &&
      now >= issuedAt &&
      now <= expiresAt,
    "expanded_shadow_approval_not_current",
  );
  ensure(
    value.maxExecutions === 1 &&
      value.runtimeDeadlineSeconds === 5_350 &&
      Number.isSafeInteger(value.revocationEpoch) &&
      value.revocationEpoch >= 0 &&
      Number.isSafeInteger(value.rotationOrdinal) &&
      value.rotationOrdinal >= 0,
    "expanded_shadow_execution_boundary_invalid",
  );
  ensure(
    value.networkEnvironment === "TENCENT_ISOLATED_READ_ONLY" &&
      value.postgresImageReference === M1_EXPANDED_SHADOW_POSTGRES_IMAGE &&
      PREFIXED_SHA256.test(value.expectedPostgresImageId) &&
      PREFIXED_SHA256.test(value.expectedTopologyBeforeHash),
    "expanded_shadow_runtime_identity_invalid",
  );
  ensure(
    value.dispatchStateRoot === policy.dispatchStateRoot &&
      value.evidenceRoot === policy.evidenceRoot &&
      value.productionWorktree === policy.productionWorktree &&
      value.expectedTimerUnit === policy.expectedTimerUnit &&
      value.stagingDirectory ===
        join(policy.stagingRoot, `${policy.stagingPrefix}${value.dispatchId}`) &&
      value.resultPath ===
        join(policy.evidenceRoot, `${value.dispatchId}.result.json`),
    "expanded_shadow_policy_path_drift",
  );
  validateHealth(value.expectedHealth);
  ensure(
    Array.isArray(value.expectedContainerIds) &&
      value.expectedContainerIds.length === value.expectedContainerCount &&
      value.expectedContainerIds.every(
        (id) => /^[a-f0-9]{64}$/u.test(id),
      ) &&
      JSON.stringify(value.expectedContainerIds) ===
        JSON.stringify([...new Set(value.expectedContainerIds)].sort()),
    "expanded_shadow_container_identity_invalid",
  );
  validateArtifactReference(
    value.runtimeAdapterArtifact,
    policy.runtimeAdapterEvidenceRoot,
    "runtime_adapter",
  );
  validateArtifactReference(
    value.conformanceArtifact,
    policy.conformanceEvidenceRoot,
    "conformance",
  );
  ensure(
    value.sourceCommit === value.runtimeAdapterArtifact.releaseId &&
      value.sourceCommit === value.conformanceArtifact.releaseId,
    "expanded_shadow_upstream_must_match_worker_source_commit",
  );
  ensure(
    value.productionMutationScope ===
      "SANITIZED_EVIDENCE_AND_EPHEMERAL_ISOLATED_POSTGRES_ONLY" &&
      value.automaticRollbackRequired === true &&
      value.sessionIndependentExecutionRequired === true &&
      value.temporaryIsolatedShadowStorageAllowed === true &&
      value.temporaryStagingCleanupRequired === true,
    "expanded_shadow_required_safety_controls_missing",
  );
  for (const key of [
    "applicationMutationAllowed",
    "automaticTradingAllowed",
    "buildOnTargetAllowed",
    "candidateAuthorityAllowed",
    "databaseMutationAllowed",
    "dependencyInstallAllowed",
    "factAuthorityAllowed",
    "productionRepositoryMutationAllowed",
    "productionServiceMutationAllowed",
    "readProductionSecretsAllowed",
    "redisMutationAllowed",
    "strategyAuthorityAllowed",
    "transportContainsSecrets",
    "workerMutationAllowed",
    "writeProductionEnvironmentAllowed",
  ]) {
    ensure(value[key] === false, `expanded_shadow_forbidden_flag:${key}`);
  }
  ensure(
    value.releaseManifest &&
      typeof value.releaseManifest === "object" &&
      !Array.isArray(value.releaseManifest) &&
      sha256(canonicalJson(value.releaseManifest)) ===
        value.artifactManifestSha256,
    "expanded_shadow_release_manifest_hash_mismatch",
  );
  assertNoSecretLikeMaterial(value);
  return value;
}

export async function readM1ExpandedShadowStableRegularFile(
  path,
  reason,
  {
    expectedBytes = null,
    maximumBytes = MAX_JSON_BYTES,
  } = {},
) {
  let handle;
  try {
    handle = await open(
      path,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const before = await handle.stat({ bigint: true });
    ensure(
      before.isFile() &&
        before.size > 0n &&
        before.size <= BigInt(maximumBytes) &&
        (
          expectedBytes === null ||
          before.size === BigInt(expectedBytes)
        ),
      reason,
    );
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    ensure(
      BigInt(bytes.length) === after.size &&
        before.ctimeNs === after.ctimeNs &&
        before.dev === after.dev &&
        before.ino === after.ino &&
        before.mode === after.mode &&
        before.mtimeNs === after.mtimeNs &&
        before.size === after.size,
      reason,
    );
    return bytes;
  } catch (error) {
    if (error instanceof M1ExpandedShadowLiveError) throw error;
    throw new M1ExpandedShadowLiveError(reason, {
      code: typeof error?.code === "string" ? error.code.slice(0, 40) : null,
    });
  } finally {
    await handle?.close();
  }
}

async function readCanonicalJson(path, reason, maximumBytes = MAX_JSON_BYTES) {
  const bytes = await readM1ExpandedShadowStableRegularFile(path, reason, {
    maximumBytes,
  });
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new M1ExpandedShadowLiveError(reason);
  }
  ensure(
    bytes.equals(Buffer.from(canonicalJson(value))),
    `${reason}_not_canonical`,
  );
  return { bytes, value };
}

async function readBoundJson(reference, schema, root, reason) {
  const expectedPath = evidenceArtifactPath(reference.path, root, reason);
  const canonicalPath = await realpath(expectedPath);
  ensure(canonicalPath === expectedPath, `${reason}_not_canonical_path`);
  const { bytes, value } = await readCanonicalJson(expectedPath, reason);
  ensure(sha256(bytes) === reference.sha256, `${reason}_byte_hash_mismatch`);
  const parsed = schema.parse(value);
  ensure(
    parsed.artifactId === reference.artifactId &&
      parsed.contentHash === reference.contentHash,
    `${reason}_content_identity_mismatch`,
  );
  return parsed;
}

async function walkRegularFiles(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkRegularFiles(root, path));
    } else {
      ensure(entry.isFile(), "expanded_shadow_payload_special_file");
      files.push(relative(root, path).split(sep).join("/"));
    }
  }
  return files.sort();
}

async function validatePayloadFiles(stagingDirectory, manifest) {
  const expectedFiles = manifest.files.map((file) => file.path).sort();
  const controls = new Set([
    ".dispatch.json",
    ".dispatch.sig",
    ".transport-bundle.sha256",
    "approval-request.json",
  ]);
  const actualFiles = (await walkRegularFiles(stagingDirectory))
    .filter((path) => !controls.has(path));
  ensure(
    JSON.stringify(actualFiles) === JSON.stringify(expectedFiles),
    "expanded_shadow_payload_file_set_mismatch",
    { actualFiles, expectedFiles },
  );
  for (const file of manifest.files) {
    const path = join(stagingDirectory, file.path);
    const bytes = await readM1ExpandedShadowStableRegularFile(
      path,
      "expanded_shadow_payload_file_hash_mismatch",
      {
        expectedBytes: file.bytes,
        maximumBytes: MAX_JSON_BYTES,
      },
    );
    ensure(
      prefixedSha256(bytes) === file.sha256,
      "expanded_shadow_payload_file_hash_mismatch",
      file.path,
    );
  }
}

export function validateM1ExpandedShadowDispatchEnvelope({
  envelope,
  marker,
  request,
  requestRaw,
}) {
  ensure(
    envelope && typeof envelope === "object" && !Array.isArray(envelope),
    "expanded_shadow_dispatch_envelope_invalid",
  );
  ensure(
    marker === request.transportBundleSha256 &&
      envelope.bundleSha256 === request.transportBundleSha256 &&
      envelope.approvalRequestSha256 === sha256(requestRaw) &&
      envelope.dispatchId === request.dispatchId &&
      envelope.packageId === request.packageId &&
      envelope.targetCommit === request.sourceCommit &&
      envelope.sourceRef === request.sourceRef &&
      envelope.runnerUnitName === request.runnerUnitName &&
      envelope.stagingDirectory === request.stagingDirectory &&
      envelope.entrypointPath === M1_EXPANDED_SHADOW_LIVE_ENTRYPOINT &&
      envelope.launchSuccessMarker === request.launchSuccessMarker &&
      envelope.transportMethod === "signed_git_bundle" &&
      envelope.transportContainsSecrets === false &&
      envelope.noArbitraryCommand === true &&
      envelope.productionMutation === true &&
      envelope.productionWipLimit === 1 &&
      envelope.maxExecutions === 1 &&
      envelope.sessionIndependentExecutionRequired === true &&
      envelope.automaticRollbackRequired === true &&
      envelope.runtimeMaxSeconds === 5_400 &&
      envelope.issuedAt === request.approvalIssuedAt &&
      envelope.expiresAt === request.approvalExpiresAt &&
      envelope.revocationEpoch === request.revocationEpoch,
    "expanded_shadow_dispatch_binding_invalid",
  );
  return envelope;
}

async function validateDispatchBinding(
  stagingDirectory,
  request,
  requestRaw,
  bundleMarkerPath,
) {
  const { value: envelope } = await readCanonicalJson(
    join(stagingDirectory, ".dispatch.json"),
    "expanded_shadow_dispatch_envelope_invalid",
    512 * 1024,
  );
  const marker = (await readFile(bundleMarkerPath, "utf8")).trim();
  return validateM1ExpandedShadowDispatchEnvelope({
    envelope,
    marker,
    request,
    requestRaw,
  });
}

function loadRuntimeBindings(stagingDirectory) {
  const require = createRequire(import.meta.url);
  const runtime = require(join(
    stagingDirectory,
    M1_EXPANDED_SHADOW_LIVE_RUNTIME_ENTRY,
  ));
  const pg = require(join(
    stagingDirectory,
    "runtime/node_modules/pg",
  ));
  return { pg, runtime };
}

function validateRuntimeBindings(bindings) {
  const requiredFunctions = [
    "buildM1ExpandedShadowReleaseResult",
    "buildM2ListingVenueEventEvidenceJoin",
    "buildM2ListingVenueEventRuntimeEvidence",
    "buildM2ListingVenueEventRuntimeEvidenceFromM15cAudit",
    "buildM1MicrostructureForwardRuntimeSelection",
    "buildM1MultiAssetShadowUpstreamBinding",
    "buildM1RuntimeAdapterProfileSet",
    "captureM1MicrostructureForwardWorker",
    "extractM1ListingHistoryCheckpoints",
    "finalizeM1MicrostructureForwardWorker",
    "refreshM1ListingWatchEvidence",
    "runM1MultiAssetShadowWorker",
    "verifyM1MicrostructureForwardCaptureStore",
    "verifyM1MicrostructureForwardEvidenceStore",
    "verifyM1MultiAssetShadowEvidenceStore",
    "verifyM2ListingVenueEventRuntimeEvidenceSet",
  ];
  ensure(
    requiredFunctions.every(
      (name) => typeof bindings.runtime[name] === "function",
    ) &&
      typeof bindings.runtime.M1ExpandedShadowReleaseManifestSchema?.parse ===
        "function" &&
      typeof bindings.runtime.M1RuntimeAdapterLiveArtifactSchema?.parse ===
        "function" &&
      typeof bindings.runtime.M1SourceConformanceArtifactSchema?.parse ===
        "function" &&
      typeof bindings.runtime.M2ListingVenueEventEvidenceJoinSchema?.parse ===
        "function" &&
      typeof bindings.runtime.M2ListingVenueEventRuntimeEvidenceSchema?.parse ===
        "function" &&
      typeof bindings.runtime.M2ListingWatchRefreshEvidenceSchema?.parse ===
        "function" &&
      typeof bindings.runtime.M2ListingVenueEventResearchBundleSchema?.parse ===
        "function" &&
      typeof bindings.runtime.M1ListingLifecycleLedgerSchema?.parse ===
        "function" &&
      typeof bindings.runtime.M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY
          ?.registryDigest === "string" &&
      bindings.runtime.M1_EXPANDED_SHADOW_DATABASE_NAME ===
        "market_radar_m1_expanded_shadow" &&
      typeof bindings.pg.Pool === "function",
    "expanded_shadow_runtime_binding_invalid",
  );
}

function topologyHash(identity) {
  return prefixedSha256(canonicalJson(boundedIdentity(identity)));
}

async function validatePackagedRuntimeTrees(stagingDirectory, manifest) {
  const packageLockBytes = await readFile(
    join(stagingDirectory, "runtime/package-lock.json"),
  );
  ensure(
    prefixedSha256(packageLockBytes) === manifest.dependencyLockSha256,
    "expanded_shadow_dependency_lock_hash_mismatch",
  );
  const zodHashes = Object.fromEntries(
    manifest.files
      .filter((file) => file.path.startsWith("runtime/node_modules/zod/"))
      .map((file) => [
        file.path.slice("runtime/node_modules/zod/".length),
        file.sha256.slice(7),
      ]),
  );
  ensure(
    prefixedSha256(canonicalJson(zodHashes)) === manifest.zodRuntimeTreeHash,
    "expanded_shadow_zod_runtime_tree_hash_mismatch",
  );
  const compiledHashes = Object.fromEntries(
    manifest.files
      .filter((file) => file.path.startsWith("runtime/v2/"))
      .map((file) => [file.path, file.sha256.slice(7)]),
  );
  const compiledRuntimeTreeHash = prefixedSha256(
    canonicalJson(compiledHashes),
  );
  ensure(
    manifest.components.every(
      (component) =>
        component.compiledRuntimeTreeHash === compiledRuntimeTreeHash,
    ),
    "expanded_shadow_compiled_runtime_tree_hash_mismatch",
  );
}

async function runDocker(args, timeout = 30_000) {
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/sudo",
      ["-n", "--", "/usr/bin/docker", ...args],
      {
        encoding: "utf8",
        maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
        timeout,
      },
    );
    return stdout.trim();
  } catch {
    throw new M1ExpandedShadowLiveError("expanded_shadow_docker_command_failed");
  }
}

export function m1ExpandedShadowTemporaryResourceNames(dispatchId) {
  ensure(SAFE_ID.test(dispatchId), "expanded_shadow_dispatch_id_invalid");
  const suffix = sha256(dispatchId).slice(0, 16);
  return Object.freeze({
    container: `mr-m1-shadow-${suffix}-pg`,
    network: `mr-m1-shadow-${suffix}-net`,
    volume: `mr-m1-shadow-${suffix}-vol`,
  });
}

export function buildM1ExpandedShadowPostgresRunArgs(request, names) {
  ensure(
    request.postgresImageReference === M1_EXPANDED_SHADOW_POSTGRES_IMAGE &&
      names &&
      Object.values(names).every(
        (name) => /^mr-m1-shadow-[a-f0-9]{16}-(?:pg|net|vol)$/u.test(name),
      ),
    "expanded_shadow_postgres_run_plan_invalid",
  );
  return [
    "run",
    "--detach",
    "--pull",
    "never",
    "--name",
    names.container,
    "--label",
    "market-radar-v2.scope=m1-expanded-shadow",
    "--label",
    `market-radar-v2.dispatch-id=${request.dispatchId}`,
    "--network",
    names.network,
    "--publish",
    "127.0.0.1::5432",
    "--read-only",
    "--cpus",
    "0.75",
    "--memory",
    "768m",
    "--memory-swap",
    "1g",
    "--pids-limit",
    "192",
    "--restart",
    "no",
    "--security-opt",
    "no-new-privileges=true",
    "--tmpfs",
    "/run/postgresql:rw,noexec,nosuid,size=64m",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m",
    "--mount",
    `type=volume,source=${names.volume},target=/var/lib/postgresql/data`,
    "--env",
    "POSTGRES_DB=market_radar_m1_expanded_shadow",
    "--env",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "--health-cmd",
    "pg_isready -U postgres -d market_radar_m1_expanded_shadow",
    "--health-interval",
    "2s",
    "--health-timeout",
    "2s",
    "--health-retries",
    "90",
    request.postgresImageReference,
  ];
}

async function resourceExists(kind, name) {
  const command = kind === "container"
    ? ["ps", "--all", "--filter", `name=^/${name}$`, "--format", "{{.Names}}"]
    : kind === "network"
      ? ["network", "ls", "--filter", `name=^${name}$`, "--format", "{{.Name}}"]
      : ["volume", "ls", "--filter", `name=^${name}$`, "--format", "{{.Name}}"];
  const rows = (await runDocker(command))
    .split(/\r?\n/u)
    .map((row) => row.trim())
    .filter(Boolean);
  ensure(
    rows.every((row) => row === name) && rows.length <= 1,
    "expanded_shadow_temporary_resource_lookup_ambiguous",
  );
  return rows.length === 1;
}

async function assertTemporaryResourcesAbsent(names) {
  const states = await Promise.all([
    resourceExists("container", names.container),
    resourceExists("network", names.network),
    resourceExists("volume", names.volume),
  ]);
  ensure(
    states.every((present) => !present),
    "expanded_shadow_temporary_resource_namespace_already_exists",
  );
}

async function inspectPinnedPostgres(request) {
  const imageId = await runDocker([
    "image",
    "inspect",
    "--format",
    "{{.Id}}",
    request.postgresImageReference,
  ]);
  ensure(
    imageId === request.expectedPostgresImageId,
    "expanded_shadow_postgres_image_identity_mismatch",
  );
}

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const status = await runDocker([
        "inspect",
        "--format",
        "{{.State.Health.Status}}",
        container,
      ]);
      if (status === "healthy") return;
    } catch {
      // The bounded retry remains authoritative.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  throw new M1ExpandedShadowLiveError(
    "expanded_shadow_postgres_health_timeout",
  );
}

function parsePublishedPort(value) {
  const line = value.split(/\r?\n/u).map((item) => item.trim())
    .find((item) => /^127\.0\.0\.1:[1-9][0-9]{3,4}$/u.test(item));
  ensure(line, "expanded_shadow_postgres_loopback_port_invalid");
  const port = Number(line.slice(line.lastIndexOf(":") + 1));
  ensure(
    Number.isInteger(port) && port >= 1_024 && port <= 65_535,
    "expanded_shadow_postgres_loopback_port_invalid",
  );
  return port;
}

async function startIsolatedPostgres(request, names) {
  await assertTemporaryResourcesAbsent(names);
  await inspectPinnedPostgres(request);
  await runDocker([
    "network",
    "create",
    "--internal",
    "--label",
    "market-radar-v2.scope=m1-expanded-shadow",
    "--label",
    `market-radar-v2.dispatch-id=${request.dispatchId}`,
    names.network,
  ]);
  try {
    await runDocker([
      "volume",
      "create",
      "--label",
      "market-radar-v2.scope=m1-expanded-shadow",
      "--label",
      `market-radar-v2.dispatch-id=${request.dispatchId}`,
      names.volume,
    ]);
    await runDocker(
      buildM1ExpandedShadowPostgresRunArgs(request, names),
      60_000,
    );
    await waitForPostgres(names.container);
    const port = parsePublishedPort(
      await runDocker(["port", names.container, "5432/tcp"]),
    );
    const inspect = JSON.parse(
      await runDocker(["inspect", names.container]),
    )[0];
    ensure(
      inspect?.Config?.Image === request.postgresImageReference &&
        inspect?.Image === request.expectedPostgresImageId &&
        inspect?.HostConfig?.Privileged === false &&
        inspect?.HostConfig?.ReadonlyRootfs === true &&
        inspect?.HostConfig?.RestartPolicy?.Name === "no" &&
        inspect?.HostConfig?.NetworkMode === names.network &&
        inspect?.NetworkSettings?.Ports?.["5432/tcp"]?.every(
          (binding) => binding.HostIp === "127.0.0.1",
        ),
      "expanded_shadow_postgres_runtime_boundary_invalid",
    );
    return { port };
  } catch (error) {
    await cleanupTemporaryResources(names);
    throw error;
  }
}

async function cleanupTemporaryResources(names) {
  await runDocker(["rm", "--force", names.container]).catch(() => undefined);
  await runDocker(["volume", "rm", "--force", names.volume])
    .catch(() => undefined);
  await runDocker(["network", "rm", names.network]).catch(() => undefined);
}

async function temporaryResourceCounts(names) {
  const [container, network, volume] = await Promise.all([
    resourceExists("container", names.container),
    resourceExists("network", names.network),
    resourceExists("volume", names.volume),
  ]);
  return {
    temporaryContainerCountAfter: container ? 1 : 0,
    temporaryNetworkCountAfter: network ? 1 : 0,
    temporaryVolumeCountAfter: volume ? 1 : 0,
  };
}

async function removeExactStagingDirectory(request, policy) {
  ensure(
    dirname(request.stagingDirectory) === policy.stagingRoot &&
      basename(request.stagingDirectory) ===
        `${policy.stagingPrefix}${request.dispatchId}`,
    "expanded_shadow_staging_cleanup_boundary_invalid",
  );
  const canonical = await realpath(request.stagingDirectory).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (canonical === null) return;
  ensure(
    canonical === request.stagingDirectory &&
      dirname(canonical) === policy.stagingRoot &&
      basename(canonical) === `${policy.stagingPrefix}${request.dispatchId}`,
    "expanded_shadow_staging_cleanup_boundary_invalid",
  );
  await rm(canonical, { recursive: true, force: false });
}

async function readLastM15cSelectionInputs(root, runtime) {
  const cycleRoot = join(root, "cycle-31");
  const identity = (
    await readCanonicalJson(
      join(cycleRoot, "identity-snapshot.json"),
      "expanded_shadow_last_identity_snapshot_invalid",
    )
  ).value;
  const baseFact = (
    await readCanonicalJson(
      join(cycleRoot, "base-fact-snapshot.json"),
      "expanded_shadow_last_base_fact_snapshot_invalid",
    )
  ).value;
  return {
    identitySnapshot: runtime.M1MultiAssetIdentitySnapshotSchema.parse(
      identity,
    ),
    baseFactSnapshot: runtime.M1MultiAssetBaseFactSnapshotSchema.parse(
      baseFact,
    ),
  };
}

async function persistM23aListingRuntimeEvidence({
  audit,
  evidenceRoot,
  runtime,
  upstream,
}) {
  const latestSourceMs = Math.max(
    Date.now(),
    Date.parse(runtime.M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.reviewedAt),
    ...audit.catalogCaptureBindings.map((catalog) =>
      Date.parse(catalog.generatedAt)
    ),
    ...audit.identitySnapshots.map((identity) =>
      Date.parse(identity.sourceCutoff)
    ),
    ...audit.listingWatchRefreshBatches.flatMap((batch) =>
      batch.results.flatMap((result) => [
        ...result.pages.map((page) => Date.parse(page.receivedAt)),
        ...(result.checkpoint === null
          ? []
          : [Date.parse(result.checkpoint.sourceCutoff)]),
      ])
    ),
  );
  ensure(
    Number.isFinite(latestSourceMs),
    "m2_listing_runtime_source_clock_invalid",
  );
  const generatedAt = new Date(latestSourceMs + 1).toISOString();
  const built = runtime.buildM2ListingVenueEventRuntimeEvidenceFromM15cAudit({
    upstreamBinding: upstream,
    registry: runtime.M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
    audit,
    generatedAt,
  });
  const { result, runtimeEvidence, sourceAudit } = built;
  await mkdir(evidenceRoot, { mode: 0o700 });
  const paths = {
    refresh: join(evidenceRoot, "listing-refresh-evidence.json"),
    ledger: join(evidenceRoot, "listing-lifecycle-ledger.json"),
    research: join(evidenceRoot, "listing-event-research-bundle.json"),
    join: join(evidenceRoot, "listing-event-evidence-join.json"),
    runtime: join(evidenceRoot, "runtime-evidence.json"),
  };
  await writeExclusiveCanonical(paths.refresh, result.refreshEvidence);
  await writeExclusiveCanonical(paths.ledger, result.lifecycleLedger);
  await writeExclusiveCanonical(paths.research, result.researchBundle);
  await writeExclusiveCanonical(paths.join, result.evidenceJoin);
  await writeExclusiveCanonical(paths.runtime, runtimeEvidence);

  const persistedResult = {
    refreshEvidence: runtime.M2ListingWatchRefreshEvidenceSchema.parse(
      (await readCanonicalJson(
        paths.refresh,
        "m2_listing_runtime_refresh_evidence_invalid",
        64 * 1024 * 1024,
      )).value,
    ),
    lifecycleLedger: runtime.M1ListingLifecycleLedgerSchema.parse(
      (await readCanonicalJson(
        paths.ledger,
        "m2_listing_runtime_lifecycle_ledger_invalid",
        64 * 1024 * 1024,
      )).value,
    ),
    researchBundle: runtime.M2ListingVenueEventResearchBundleSchema.parse(
      (await readCanonicalJson(
        paths.research,
        "m2_listing_runtime_research_bundle_invalid",
        64 * 1024 * 1024,
      )).value,
    ),
    evidenceJoin: runtime.M2ListingVenueEventEvidenceJoinSchema.parse(
      (await readCanonicalJson(
        paths.join,
        "m2_listing_runtime_evidence_join_invalid",
        64 * 1024 * 1024,
      )).value,
    ),
  };
  const persistedRuntimeEvidence = (
    await readCanonicalJson(
      paths.runtime,
      "m2_listing_runtime_manifest_invalid",
      8 * 1024 * 1024,
    )
  ).value;
  const verified = runtime.verifyM2ListingVenueEventRuntimeEvidenceSet({
    sourceAudit,
    result: persistedResult,
    runtimeEvidence: persistedRuntimeEvidence,
  });
  ensure(
    verified.contentHash === runtimeEvidence.contentHash &&
      verified.productionRuntimeAllowed === false &&
      verified.candidateEmissionAllowed === false &&
      verified.readyAuthorityAllowed === false,
    "m2_listing_runtime_evidence_verification_invalid",
  );
  return { paths, runtimeEvidence: verified };
}

function componentResult(componentId, evidence, rollbackStatus, reasonCodes) {
  if (evidence === null) {
    return {
      componentId,
      executed: false,
      evidenceId: null,
      evidenceHash: null,
      status: "NOT_EXECUTED",
      acceptanceGate: "NOT_EVALUATED",
      rollbackStatus: "NOT_EXECUTED",
      reasonCodes,
    };
  }
  const pass = evidence.status ===
      "PASS_FOUR_VENUE_MULTI_ASSET_SHADOW_NO_AUTHORITY" ||
    evidence.status ===
      "PASS_FORWARD_MICROSTRUCTURE_SHADOW_NO_AUTHORITY";
  return {
    componentId,
    executed: true,
    evidenceId: evidence.evidenceId,
    evidenceHash: evidence.contentHash,
    status: evidence.status,
    acceptanceGate: pass ? "PASS" : "BLOCKED",
    rollbackStatus,
    reasonCodes: pass ? [] : [...new Set(evidence.reasonCodes)].sort(),
  };
}

async function executeExpandedShadow({
  bundleMarkerPath,
  executionContext,
  requestPath,
  policy = DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY,
}) {
  executionContext.phase = "REQUEST_AND_TRANSPORT_VALIDATION";
  const requestReal = await realpath(requestPath);
  const stagingDirectory = await realpath(dirname(requestReal));
  ensure(
    requestReal === join(stagingDirectory, "approval-request.json"),
    "expanded_shadow_request_path_invalid",
  );
  const { bytes: requestRaw, value: requestValue } = await readCanonicalJson(
    requestReal,
    "expanded_shadow_request_file_invalid",
    2 * 1024 * 1024,
  );
  const request = validateM1ExpandedShadowLiveRequest(requestValue, { policy });
  ensure(
    stagingDirectory === request.stagingDirectory,
    "expanded_shadow_staging_identity_mismatch",
  );
  await validateDispatchBinding(
    stagingDirectory,
    request,
    requestRaw,
    bundleMarkerPath,
  );

  const manifest = request.releaseManifest;
  await validatePayloadFiles(stagingDirectory, manifest);
  executionContext.phase = "PACKAGED_RUNTIME_VALIDATION";
  const bindings = loadRuntimeBindings(stagingDirectory);
  validateRuntimeBindings(bindings);
  const runtime = bindings.runtime;
  const parsedManifest =
    runtime.M1ExpandedShadowReleaseManifestSchema.parse(manifest);
  ensure(
    parsedManifest.sourceCommit === request.sourceCommit &&
      parsedManifest.sourceRef === request.sourceRef &&
      parsedManifest.sourceTreeHash ===
        prefixedSha256(`${request.sourceTree}\n`) &&
      parsedManifest.expectedProductionHead ===
        request.expectedProductionHead &&
      parsedManifest.transportArchiveSha256 ===
        `sha256:${request.transportBundleSha256}` &&
      parsedManifest.productionTopologyBeforeHash ===
        request.expectedTopologyBeforeHash &&
      parsedManifest.stagingDirectory === request.stagingDirectory &&
      parsedManifest.evidenceRoot === request.evidenceRoot,
    "expanded_shadow_release_manifest_binding_invalid",
  );
  await validatePackagedRuntimeTrees(stagingDirectory, parsedManifest);

  executionContext.phase = "UPSTREAM_LINEAGE_VALIDATION";
  const upstreamArtifact = await readBoundJson(
    request.runtimeAdapterArtifact,
    runtime.M1RuntimeAdapterLiveArtifactSchema,
    policy.runtimeAdapterEvidenceRoot,
    "expanded_shadow_runtime_adapter_artifact_invalid",
  );
  const conformanceArtifact = await readBoundJson(
    request.conformanceArtifact,
    runtime.M1SourceConformanceArtifactSchema,
    policy.conformanceEvidenceRoot,
    "expanded_shadow_conformance_artifact_invalid",
  );
  ensure(
    upstreamArtifact.runtimeReleaseId === request.sourceCommit &&
      upstreamArtifact.conformanceArtifactId ===
        conformanceArtifact.artifactId &&
      upstreamArtifact.conformanceArtifactHash ===
        conformanceArtifact.contentHash &&
      upstreamArtifact.evidenceClass === "LIVE_READ_ONLY" &&
      upstreamArtifact.networkEnvironment ===
        "TENCENT_ISOLATED_READ_ONLY",
    "expanded_shadow_upstream_artifact_lineage_invalid",
  );
  const upstream = runtime.buildM1MultiAssetShadowUpstreamBinding(
    upstreamArtifact,
  );
  ensure(
    upstream.upstreamBindingId === parsedManifest.upstreamBindingId &&
      upstream.contentHash === parsedManifest.upstreamBindingHash,
    "expanded_shadow_upstream_manifest_identity_mismatch",
  );
  const profileSet = runtime.buildM1RuntimeAdapterProfileSet({
    runtimeReleaseId: upstreamArtifact.runtimeReleaseId,
    generatedAt: upstreamArtifact.generatedAt,
    conformanceArtifact,
  });
  ensure(
    profileSet.contentHash === upstreamArtifact.profileSetHash,
    "expanded_shadow_profile_set_reconstruction_mismatch",
  );
  const extractedCheckpoints =
    runtime.extractM1ListingHistoryCheckpoints(upstreamArtifact);
  let listingCheckpoints = [
    extractedCheckpoints.BITGET_FUTURES,
    extractedCheckpoints.BYBIT_DERIVATIVES,
  ].map((checkpoint) =>
    runtime.M1ListingHistoryCheckpointSchema.parse(checkpoint)
  );
  const initialListingCheckpoints = [...listingCheckpoints];

  await ensureEvidenceRoot({ evidenceRoot: request.evidenceRoot });
  const runRoot = join(request.evidenceRoot, request.dispatchId);
  await mkdir(runRoot, { mode: 0o700 });
  executionContext.phase = "PRODUCTION_BASELINE_CAPTURE";
  const before = await captureProductionIdentity(
    request,
    runLiveReadOnlyCommand,
  );
  assertProductionIdentity(before, request, "before");
  const beforeHash = topologyHash(before);
  ensure(
    beforeHash === request.expectedTopologyBeforeHash,
    "expanded_shadow_topology_before_hash_mismatch",
  );
  executionContext.topologyBeforeHash = beforeHash;
  executionContext.nonTargetServiceCountBefore = before.containerIds.length;

  const names = m1ExpandedShadowTemporaryResourceNames(request.dispatchId);
  const m15cRoot = join(runRoot, "m1-5c");
  const m15dRoot = join(runRoot, "m1-5d");
  const m15cWorkerRunId =
    `m1-5c:${request.dispatchId}:${randomBytes(8).toString("hex")}`;
  const m15dWorkerRunId =
    `m1-5d:${request.dispatchId}:${randomBytes(8).toString("hex")}`;
  let m15cEvidence;
  let m15dEvidence;
  let m23aRuntimeEvidence;
  let pool = null;
  let capture;
  try {
    executionContext.phase = "M1_5C_CAPTURE";
    const m15c = await runtime.runM1MultiAssetShadowWorker({
      upstreamBinding: upstream,
      networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
      evidenceRoot: m15cRoot,
      workerRunId: m15cWorkerRunId,
      initialListingCheckpoints,
      listingWatchRefreshBatch: async () => {
        const refreshed = await runtime.refreshM1ListingWatchEvidence({
          upstreamBinding: upstream,
          profileSet,
          priorCheckpoints: listingCheckpoints,
          networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
        });
        ensure(
          refreshed.allCommitted &&
            refreshed.bindings.length === 2 &&
            refreshed.checkpoints.length === 2,
          "expanded_shadow_listing_watch_refresh_blocked",
        );
        listingCheckpoints = refreshed.checkpoints;
        return refreshed;
      },
    });
    const m15cAudit = await runtime.verifyM1MultiAssetShadowEvidenceStore({
      evidenceRoot: m15c.canonicalEvidenceRoot,
      upstreamBinding: upstream,
      expectedWorkerRunId: m15cWorkerRunId,
      initialListingCheckpoints,
      verifiedAt: new Date().toISOString(),
    });
    m15cEvidence = runtime.M1MultiAssetShadowEvidenceSchema.parse(
      m15cAudit.evidence,
    );
    executionContext.m15cEvidenceId = m15cEvidence.evidenceId;
    executionContext.m15cEvidenceHash = m15cEvidence.contentHash;

    executionContext.phase = "M2_3A_LISTING_RUNTIME_EVIDENCE";
    const m23a = await persistM23aListingRuntimeEvidence({
      audit: m15cAudit,
      evidenceRoot: join(runRoot, "m2-3a"),
      runtime,
      upstream,
    });
    m23aRuntimeEvidence = m23a.runtimeEvidence;
    executionContext.m23aRuntimeEvidenceId =
      m23aRuntimeEvidence.runtimeEvidenceId;
    executionContext.m23aRuntimeEvidenceHash =
      m23aRuntimeEvidence.contentHash;

    const selectionInputs = await readLastM15cSelectionInputs(
      m15cRoot,
      runtime,
    );
    executionContext.phase = "ISOLATED_POSTGRES_START";
    const isolated = await startIsolatedPostgres(request, names);
    pool = new bindings.pg.Pool({
      host: "127.0.0.1",
      port: isolated.port,
      user: "postgres",
      database: "market_radar_m1_expanded_shadow",
      max: 4,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      ssl: false,
    });
    const store = new runtime.M1PostgresShadowObservationStore(pool);
    const generatedAt = new Date().toISOString();
    const windowStartsAt = new Date(Date.now() + 15_000).toISOString();
    const windowEndsAt = new Date(
      Date.parse(windowStartsAt) + 31 * 60_000,
    ).toISOString();
    const selected = runtime.buildM1MicrostructureForwardRuntimeSelection({
      upstreamBinding: upstream,
      identitySnapshot: selectionInputs.identitySnapshot,
      baseFactSnapshot: selectionInputs.baseFactSnapshot,
      generatedAt,
      selectionCutoff: generatedAt,
      windowStartsAt,
      windowEndsAt,
      rotationOrdinal: request.rotationOrdinal,
    });
    executionContext.phase = "M1_5D_CAPTURE";
    capture = await runtime.captureM1MicrostructureForwardWorker({
      upstreamBinding: upstream,
      multiAssetShadowEvidence: m15cEvidence,
      selectionPlan: selected.selectionPlan,
      providerPlan: selected.providerPlan,
      evidenceRoot: m15dRoot,
      workerRunId: m15dWorkerRunId,
      observationStore: store,
    });
    const captureAudit =
      await runtime.verifyM1MicrostructureForwardCaptureStore({
        evidenceRoot: capture.canonicalEvidenceRoot,
        observationStore: store,
        expectedReleaseId: upstream.releaseId,
        expectedWorkerRunId: m15dWorkerRunId,
        verifiedAt: new Date().toISOString(),
      });
    executionContext.phase = "TEMPORARY_RESOURCE_CLEANUP";
    await pool.end();
    pool = null;
    await cleanupTemporaryResources(names);
    await removeExactStagingDirectory(request, policy);
    const resourceCounts = await temporaryResourceCounts(names);
    const afterCleanup = await captureProductionIdentity(
      request,
      runLiveReadOnlyCommand,
    );
    assertProductionIdentity(afterCleanup, request, "after");
    const afterCleanupHash = topologyHash(afterCleanup);
    const hostRecovery = {
      status:
        beforeHash === afterCleanupHash &&
          Object.values(resourceCounts).every((count) => count === 0)
          ? "RESTORED_EXACT"
          : "FAILED",
      topologyBeforeHash: beforeHash,
      topologyAfterHash: afterCleanupHash,
      nonTargetServiceCountBefore: before.containerIds.length,
      nonTargetServiceCountAfter: afterCleanup.containerIds.length,
      ...resourceCounts,
      stagingPathCountAfter: 0,
      productionChanged: false,
      reasonCodes:
        beforeHash === afterCleanupHash &&
          Object.values(resourceCounts).every((count) => count === 0)
          ? []
          : ["host_or_temporary_resource_identity_drift"],
    };
    const finalized = await runtime.finalizeM1MicrostructureForwardWorker({
      capture,
      captureVerification: captureAudit.verification,
      evaluatedAt: new Date().toISOString(),
      hostRecovery,
    });
    executionContext.phase = "M1_5D_FINAL_VERIFICATION";
    const finalAudit =
      await runtime.verifyM1MicrostructureForwardEvidenceStore({
        evidenceRoot: finalized.canonicalEvidenceRoot,
        expectedReleaseId: upstream.releaseId,
        expectedWorkerRunId: m15dWorkerRunId,
        verifiedAt: new Date().toISOString(),
      });
    m15dEvidence = runtime.M1MicrostructureForwardEvidenceSchema.parse(
      finalAudit.evidence,
    );
    executionContext.m15dEvidenceId = m15dEvidence.evidenceId;
    executionContext.m15dEvidenceHash = m15dEvidence.contentHash;
  } finally {
    if (pool !== null) await pool.end().catch(() => undefined);
    await cleanupTemporaryResources(names);
  }

  executionContext.phase = "PRODUCTION_RECOVERY_VERIFICATION";
  const after = await captureProductionIdentity(
    request,
    runLiveReadOnlyCommand,
  );
  assertProductionIdentity(after, request, "after");
  const afterHash = topologyHash(after);
  const resourceCounts = await temporaryResourceCounts(names);
  await removeExactStagingDirectory(request, policy);
  const stagingPathCountAfter = await lstat(request.stagingDirectory)
    .then(() => 1)
    .catch((error) => {
      if (error?.code === "ENOENT") return 0;
      throw error;
    });
  const releaseResult = runtime.buildM1ExpandedShadowReleaseResult({
    manifest: parsedManifest,
    result: {
      releaseId: request.sourceCommit,
      manifestId: parsedManifest.manifestId,
      manifestHash: parsedManifest.contentHash,
      dispatchId: request.dispatchId,
      evaluatedAt: new Date().toISOString(),
      evidenceClass: "LIVE_READ_ONLY",
      components: [
        componentResult(
          "M1_5C_FOUR_VENUE_MULTI_ASSET_SHADOW",
          m15cEvidence,
          "RESTORED_EXACT",
          [],
        ),
        componentResult(
          "M1_5D_MICROSTRUCTURE_FORWARD_SHADOW",
          m15dEvidence,
          "RESTORED_EXACT",
          [],
        ),
      ],
      topologyBeforeHash: beforeHash,
      topologyAfterHash: afterHash,
      nonTargetServiceCountBefore: before.containerIds.length,
      nonTargetServiceCountAfter: after.containerIds.length,
      stagingPathCountAfter,
      ...resourceCounts,
      productionChanged: false,
      secretMaterialPresent: false,
      crossComponentPassAllowed: false,
      candidateAuthorityGranted: false,
      strategyAuthorityGranted: false,
      readyAuthorityGranted: false,
      automaticTradingAllowed: false,
    },
  });
  const result = {
    schemaVersion: M1_EXPANDED_SHADOW_LIVE_RESULT_SCHEMA,
    packageId: request.packageId,
    dispatchId: request.dispatchId,
    sourceCommit: request.sourceCommit,
    manifestId: parsedManifest.manifestId,
    manifestHash: parsedManifest.contentHash,
    releaseResult,
    m15cEvidenceId: m15cEvidence.evidenceId,
    m15cEvidenceHash: m15cEvidence.contentHash,
    m15dEvidenceId: m15dEvidence.evidenceId,
    m15dEvidenceHash: m15dEvidence.contentHash,
    m23aRuntimeEvidenceId: m23aRuntimeEvidence.runtimeEvidenceId,
    m23aRuntimeEvidenceHash: m23aRuntimeEvidence.contentHash,
    m23aRuntimeEvidenceStatus: m23aRuntimeEvidence.status,
    topologyBeforeHash: beforeHash,
    topologyAfterHash: afterHash,
    productionChanged: false,
    secretMaterialPresent: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    automaticTradingAllowed: false,
    status: releaseResult.status,
  };
  await writeExclusiveCanonical(request.resultPath, result);
  executionContext.phase = "RESULT_PERSISTED";
  ensure(
    releaseResult.releaseAcceptanceGate === "PASS",
    "expanded_shadow_release_acceptance_blocked",
    releaseResult.reasonCodes,
  );
  return result;
}

function failureReason(error) {
  return error instanceof M1ExpandedShadowLiveError
    ? error.reason
    : error instanceof LiveSourceConformanceError
      ? error.reason
      : "unexpected_error";
}

async function captureFailureRecovery({
  executionContext,
  policy,
  request,
}) {
  const reasonCodes = [];
  const validDispatchId = SAFE_ID.test(request?.dispatchId ?? "");
  let temporaryContainerCountAfter = null;
  let temporaryNetworkCountAfter = null;
  let temporaryVolumeCountAfter = null;
  if (validDispatchId) {
    const names = m1ExpandedShadowTemporaryResourceNames(request.dispatchId);
    await cleanupTemporaryResources(names);
    try {
      ({
        temporaryContainerCountAfter,
        temporaryNetworkCountAfter,
        temporaryVolumeCountAfter,
      } = await temporaryResourceCounts(names));
    } catch {
      reasonCodes.push("temporary_resource_recovery_not_verified");
    }
  } else {
    reasonCodes.push("temporary_resource_namespace_not_verified");
  }

  let stagingPathCountAfter = null;
  const expectedStagingPath = validDispatchId
    ? join(policy.stagingRoot, `${policy.stagingPrefix}${request.dispatchId}`)
    : null;
  if (
    expectedStagingPath !== null &&
    request?.stagingDirectory === expectedStagingPath
  ) {
    try {
      await removeExactStagingDirectory(request, policy);
      stagingPathCountAfter = await lstat(expectedStagingPath)
        .then(() => 1)
        .catch((error) => {
          if (error?.code === "ENOENT") return 0;
          throw error;
        });
    } catch {
      reasonCodes.push("staging_recovery_not_verified");
    }
  } else {
    reasonCodes.push("staging_boundary_not_verified");
  }

  let topologyAfterHash = null;
  let nonTargetServiceCountAfter = null;
  if (executionContext.topologyBeforeHash !== null) {
    try {
      const after = await captureProductionIdentity(
        request,
        runLiveReadOnlyCommand,
      );
      topologyAfterHash = topologyHash(after);
      nonTargetServiceCountAfter = after.containerIds.length;
      assertProductionIdentity(after, request, "failure_recovery");
    } catch {
      reasonCodes.push("production_topology_recovery_not_verified");
    }
  } else {
    reasonCodes.push("production_baseline_not_captured");
  }

  if (
    executionContext.topologyBeforeHash !== null &&
    topologyAfterHash !== null &&
    executionContext.topologyBeforeHash !== topologyAfterHash
  ) {
    reasonCodes.push("production_topology_not_restored_exactly");
  }
  if (
    [
      temporaryContainerCountAfter,
      temporaryNetworkCountAfter,
      temporaryVolumeCountAfter,
    ].some((count) => count !== null && count !== 0)
  ) {
    reasonCodes.push("temporary_resources_remain");
  }
  if (stagingPathCountAfter !== null && stagingPathCountAfter !== 0) {
    reasonCodes.push("staging_path_remains");
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)].sort();
  const restoredExactly =
    executionContext.topologyBeforeHash !== null &&
    topologyAfterHash === executionContext.topologyBeforeHash &&
    temporaryContainerCountAfter === 0 &&
    temporaryNetworkCountAfter === 0 &&
    temporaryVolumeCountAfter === 0 &&
    stagingPathCountAfter === 0 &&
    uniqueReasonCodes.length === 0;
  return {
    status: restoredExactly
      ? "RESTORED_EXACT"
      : executionContext.topologyBeforeHash === null
        ? "NOT_VERIFIED"
        : "FAILED",
    topologyBeforeHash: executionContext.topologyBeforeHash,
    topologyAfterHash,
    nonTargetServiceCountBefore:
      executionContext.nonTargetServiceCountBefore,
    nonTargetServiceCountAfter,
    temporaryContainerCountAfter,
    temporaryNetworkCountAfter,
    temporaryVolumeCountAfter,
    stagingPathCountAfter,
    productionChanged: restoredExactly ? false : null,
    reasonCodes: uniqueReasonCodes,
  };
}

export function buildM1ExpandedShadowFailureArtifact({
  error,
  executionContext,
  failedAt = new Date().toISOString(),
  recovery,
  request,
}) {
  const reason = failureReason(error);
  return {
    schemaVersion: M1_EXPANDED_SHADOW_LIVE_FAILURE_SCHEMA,
    packageId: M1_EXPANDED_SHADOW_LIVE_PACKAGE_ID,
    dispatchId: request.dispatchId,
    sourceCommit:
      COMMIT.test(request.sourceCommit ?? "") ? request.sourceCommit : null,
    failedAt,
    failurePhase: executionContext.phase,
    reason,
    reasonCodes: [...new Set([reason, ...recovery.reasonCodes])].sort(),
    m15cEvidenceId: executionContext.m15cEvidenceId,
    m15cEvidenceHash: executionContext.m15cEvidenceHash,
    m23aRuntimeEvidenceId:
      executionContext.m23aRuntimeEvidenceId ?? null,
    m23aRuntimeEvidenceHash:
      executionContext.m23aRuntimeEvidenceHash ?? null,
    m15dEvidenceId: executionContext.m15dEvidenceId,
    m15dEvidenceHash: executionContext.m15dEvidenceHash,
    hostRecoveryStatus: recovery.status,
    topologyBeforeHash: recovery.topologyBeforeHash,
    topologyAfterHash: recovery.topologyAfterHash,
    nonTargetServiceCountBefore: recovery.nonTargetServiceCountBefore,
    nonTargetServiceCountAfter: recovery.nonTargetServiceCountAfter,
    temporaryContainerCountAfter: recovery.temporaryContainerCountAfter,
    temporaryNetworkCountAfter: recovery.temporaryNetworkCountAfter,
    temporaryVolumeCountAfter: recovery.temporaryVolumeCountAfter,
    stagingPathCountAfter: recovery.stagingPathCountAfter,
    productionChanged: recovery.productionChanged,
    productionMutationAuthorityGranted: false,
    secretMaterialPresent: false,
    acceptanceGate: "BLOCKED",
  };
}

async function persistFailure(
  error,
  request,
  policy,
  executionContext,
  recovery,
) {
  if (!request || !SAFE_ID.test(request.dispatchId ?? "")) return;
  await ensureEvidenceRoot({ evidenceRoot: policy.evidenceRoot });
  const path = join(
    policy.evidenceRoot,
    `${request.dispatchId}.failure.json`,
  );
  const failure = buildM1ExpandedShadowFailureArtifact({
    error,
    executionContext,
    recovery,
    request,
  });
  await writeExclusiveCanonical(path, failure).catch(() => undefined);
}

export async function runM1ExpandedShadowLive(options) {
  let request = null;
  const policy = options.policy ?? DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY;
  const executionContext = createExecutionContext();
  try {
    const loaded = await readCanonicalJson(
      resolve(options.requestPath),
      "expanded_shadow_request_file_invalid",
      2 * 1024 * 1024,
    );
    request = loaded.value;
    return await executeExpandedShadow({
      ...options,
      executionContext,
      policy,
    });
  } catch (error) {
    const recovery = await captureFailureRecovery({
      executionContext,
      policy,
      request,
    });
    await persistFailure(
      error,
      request,
      policy,
      executionContext,
      recovery,
    );
    throw error;
  }
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  ensure(rest.length % 2 === 0, "expanded_shadow_arguments_invalid");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    ensure(
      /^--[a-z][a-z-]*$/u.test(key ?? "") &&
        typeof value === "string" &&
        !value.startsWith("--") &&
        options[key.slice(2)] === undefined,
      "expanded_shadow_arguments_invalid",
    );
    options[key.slice(2)] = value;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  ensure(
    command === "run" &&
      options.request &&
      options["bundle-marker"],
    "expanded_shadow_command_invalid",
  );
  const result = await runM1ExpandedShadowLive({
    bundleMarkerPath: resolve(options["bundle-marker"]),
    requestPath: resolve(options.request),
  });
  process.stdout.write(canonicalJson(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      reason: error instanceof M1ExpandedShadowLiveError
        ? error.reason
        : error instanceof LiveSourceConformanceError
          ? error.reason
          : "unexpected_error",
      status: "BLOCKED",
    })}\n`);
    process.exitCode = 1;
  });
}
