#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  LiveSourceConformanceError,
  assertProductionIdentity,
  boundedIdentity,
  canonicalJson,
  captureProductionIdentity,
  ensureEvidenceRoot,
  readExactCoinGlassCredential,
  runLiveReadOnlyCommand,
  sha256,
  writeExclusiveCanonical,
} from "./m1-source-conformance-live-runner.mjs";

export { canonicalJson, sha256 };

export const LIVE_RUNTIME_ADAPTER_PACKAGE_ID =
  "V2-M1-4B-TENCENT-RUNTIME-LISTING-CHECKPOINT";
export const LIVE_RUNTIME_ADAPTER_REQUEST_SCHEMA =
  "market-radar-v2-m1-runtime-adapter-live-request.v1";
export const LIVE_RUNTIME_ADAPTER_RESULT_SCHEMA =
  "market-radar-v2-m1-runtime-adapter-live-result.v1";
export const LIVE_RUNTIME_ADAPTER_FAILURE_RESULT_SCHEMA =
  "market-radar-v2-m1-runtime-adapter-live-failure-result.v1";
export const LIVE_RUNTIME_ADAPTER_MANIFEST_SCHEMA =
  "market-radar-v2-m1-runtime-adapter-live-manifest.v1";
export const LIVE_RUNTIME_ADAPTER_MANIFEST =
  "m1-runtime-adapter-live-manifest.json";
export const LIVE_RUNTIME_ADAPTER_ENTRYPOINT =
  "scripts/v2/production/m1-runtime-adapter-live-entrypoint.sh";
export const LIVE_RUNTIME_ADAPTER_RUNNER =
  "scripts/v2/production/m1-runtime-adapter-live-runner.mjs";
export const LIVE_RUNTIME_ADAPTER_SAFETY_RUNNER =
  "scripts/v2/production/m1-source-conformance-live-runner.mjs";
export const LIVE_RUNTIME_ADAPTER_RUNTIME_ENTRY =
  "runtime/v2/modules/collector/runtime-adapter-live.js";
export const LIVE_RUNTIME_ADAPTER_REGISTRY_ENTRY =
  "runtime/v2/modules/source-capability/adapters/four-venue-capability-registry.js";
export const LIVE_RUNTIME_ADAPTER_SOURCE_ENTRY =
  "runtime/v2/modules/source-conformance/adapters/exact-source-conformance-runner.js";
export const LIVE_RUNTIME_ADAPTER_CONFORMANCE_SCHEMA_ENTRY =
  "runtime/v2/modules/source-conformance/source-conformance-contract.js";
export const LIVE_RUNTIME_ADAPTER_LISTING_SCHEMA_ENTRY =
  "runtime/v2/modules/multi-asset-universe/listing-history-runtime.js";
export const LIVE_RUNTIME_ADAPTER_SUCCESS_MARKER =
  "PASS_V2_M1_4B_TENCENT_RUNTIME_LISTING_CHECKPOINT";
export const LIVE_RUNTIME_ADAPTER_ZOD_RUNTIME_TREE_DIGEST =
  "sha256:551bb42edd08048b521e6022806d36b1541249c05b8111e8df4249c260628d21";

export const DEFAULT_LIVE_RUNTIME_ADAPTER_POLICY = Object.freeze({
  checkpointRoot:
    "/var/lib/market-radar-production-dispatch/evidence/m1-runtime-adapter/checkpoints",
  conformanceEvidenceRoot:
    "/var/lib/market-radar-production-dispatch/evidence/m1-source-conformance",
  credentialEnvKey: "COINGLASS_API_KEY",
  credentialFile: "/home/ubuntu/apps/chuan-market-radar/.env.production",
  dispatchStateRoot: "/var/lib/market-radar-production-dispatch",
  evidenceRoot:
    "/var/lib/market-radar-production-dispatch/evidence/m1-runtime-adapter",
  expectedTimerUnit: "market-radar-production-dispatch.timer",
  productionWorktree: "/home/ubuntu/apps/chuan-market-radar",
  stagingRoot: "/home/ubuntu/.cache/market-radar-v2",
  stagingPrefix: "m1-4b-runtime-adapter-",
});

const REQUEST_KEYS = Object.freeze([
  "applicationMutationAllowed",
  "approvalExpiresAt",
  "approvalIssuedAt",
  "artifactManifestSha256",
  "artifactPath",
  "automaticRollbackRequired",
  "candidateAuthorityAllowed",
  "checkpointPaths",
  "coinGlassCredential",
  "conformanceArtifact",
  "databaseMutationAllowed",
  "dispatchId",
  "dispatchStateRoot",
  "expectedBlockedProbeIds",
  "expectedContainerCount",
  "expectedContainerIds",
  "expectedHealth",
  "expectedLiveConformantProfileCount",
  "expectedProbePlanDigest",
  "expectedProductionHead",
  "expectedRegistryDigest",
  "expectedRouteEligibleProfileCount",
  "expectedTimerUnit",
  "factAuthorityAllowed",
  "launchSuccessMarker",
  "listingCheckpointMutationAllowed",
  "maxExecutions",
  "maxListingPagesPerSource",
  "networkEnvironment",
  "packageId",
  "priorCheckpoints",
  "productionMutationScope",
  "productionWorktree",
  "rawMarketBodyPersistenceAllowed",
  "redisMutationAllowed",
  "resultPath",
  "revocationEpoch",
  "runnerUnitName",
  "runtimeAuthorityAllowed",
  "runtimeDeadlineSeconds",
  "schemaVersion",
  "sessionIndependentExecutionRequired",
  "sourceCommit",
  "sourceRef",
  "sourceTree",
  "stagingDirectory",
  "strategyAuthorityAllowed",
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
const CONFORMANCE_KEYS = Object.freeze([
  "artifactId",
  "contentHash",
  "path",
  "releaseId",
]);
const CHECKPOINT_PATH_KEYS = Object.freeze([
  "BITGET_FUTURES",
  "BYBIT_DERIVATIVES",
]);
const PRIOR_CHECKPOINT_KEYS = CHECKPOINT_PATH_KEYS;
const PRIOR_CHECKPOINT_VALUE_KEYS = Object.freeze([
  "checkpointId",
  "contentHash",
  "path",
  "resultPath",
  "resultSha256",
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
  /^market-radar-m1-4b-[a-z0-9][a-z0-9-]{7,32}$/u;

export class LiveRuntimeAdapterError extends Error {
  constructor(reason, details = undefined) {
    super(reason);
    this.name = "LiveRuntimeAdapterError";
    this.reason = reason;
    this.details = details;
  }
}

function ensure(condition, reason, details = undefined) {
  if (!condition) throw new LiveRuntimeAdapterError(reason, details);
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
  const timestamp = new Date(value);
  ensure(
    Number.isFinite(timestamp.getTime()) && timestamp.toISOString() === value,
    reason,
  );
  return timestamp;
}

function directChild(path, parent, expectedName, reason) {
  ensure(
    typeof path === "string" &&
      path.startsWith("/") &&
      !path.includes("\0") &&
      resolve(dirname(path)) === resolve(parent) &&
      basename(path) === expectedName,
    reason,
  );
  return resolve(path);
}

function checkpointPath(
  path,
  parent,
  dispatchId,
  source,
  reason,
) {
  return directChild(
    path,
    parent,
    `${dispatchId}.${source.toLowerCase()}.checkpoint.json`,
    reason,
  );
}

function priorCheckpoint(value, policy, source) {
  exactKeys(
    value,
    PRIOR_CHECKPOINT_VALUE_KEYS,
    "runtime_request_prior_checkpoint_keys_invalid",
  );
  const allNull =
    value.checkpointId === null &&
    value.contentHash === null &&
    value.path === null &&
    value.resultPath === null &&
    value.resultSha256 === null;
  if (allNull) return;
  ensure(
    typeof value.checkpointId === "string" &&
      value.checkpointId.startsWith(
        `listing-history-checkpoint:${source}:`,
      ) &&
      PREFIXED_SHA256.test(value.contentHash),
    "runtime_request_prior_checkpoint_identity_invalid",
  );
  ensure(
    typeof value.path === "string" &&
      resolve(dirname(value.path)) === resolve(policy.checkpointRoot) &&
      basename(value.path).endsWith(`.${source.toLowerCase()}.checkpoint.json`),
    "runtime_request_prior_checkpoint_path_invalid",
  );
  ensure(
    typeof value.resultPath === "string" &&
      resolve(dirname(value.resultPath)) === resolve(policy.evidenceRoot) &&
      basename(value.resultPath).endsWith(".result.json") &&
      SHA256.test(value.resultSha256),
    "runtime_request_prior_checkpoint_result_invalid",
  );
  const priorDispatchId = basename(value.resultPath, ".result.json");
  ensure(
    DISPATCH_ID.test(priorDispatchId) &&
      basename(value.path) ===
        `${priorDispatchId}.${source.toLowerCase()}.checkpoint.json`,
    "runtime_request_prior_checkpoint_dispatch_binding_invalid",
  );
}

export function validateLiveRuntimeAdapterRequest(
  request,
  {
    now = new Date(),
    policy = DEFAULT_LIVE_RUNTIME_ADAPTER_POLICY,
  } = {},
) {
  exactKeys(request, REQUEST_KEYS, "runtime_request_keys_invalid");
  exactKeys(
    request.coinGlassCredential,
    CREDENTIAL_KEYS,
    "runtime_request_credential_keys_invalid",
  );
  exactKeys(
    request.expectedHealth,
    HEALTH_KEYS,
    "runtime_request_health_keys_invalid",
  );
  exactKeys(
    request.conformanceArtifact,
    CONFORMANCE_KEYS,
    "runtime_request_conformance_keys_invalid",
  );
  exactKeys(
    request.checkpointPaths,
    CHECKPOINT_PATH_KEYS,
    "runtime_request_checkpoint_path_keys_invalid",
  );
  exactKeys(
    request.priorCheckpoints,
    PRIOR_CHECKPOINT_KEYS,
    "runtime_request_prior_checkpoint_keys_invalid",
  );
  ensure(
    request.schemaVersion === LIVE_RUNTIME_ADAPTER_REQUEST_SCHEMA,
    "runtime_request_schema_invalid",
  );
  ensure(
    request.packageId === LIVE_RUNTIME_ADAPTER_PACKAGE_ID,
    "runtime_request_package_invalid",
  );
  ensure(DISPATCH_ID.test(request.dispatchId), "runtime_request_dispatch_id_invalid");
  ensure(COMMIT.test(request.sourceCommit), "runtime_request_source_commit_invalid");
  ensure(COMMIT.test(request.sourceTree), "runtime_request_source_tree_invalid");
  ensure(
    SOURCE_REF.test(request.sourceRef) &&
      !request.sourceRef.includes("..") &&
      !request.sourceRef.includes("//"),
    "runtime_request_source_ref_invalid",
  );
  ensure(RUNNER_UNIT.test(request.runnerUnitName), "runtime_request_runner_unit_invalid");
  ensure(
    request.launchSuccessMarker === LIVE_RUNTIME_ADAPTER_SUCCESS_MARKER,
    "runtime_request_success_marker_invalid",
  );
  ensure(
    request.dispatchStateRoot === policy.dispatchStateRoot &&
      request.productionWorktree === policy.productionWorktree &&
      request.expectedTimerUnit === policy.expectedTimerUnit,
    "runtime_request_host_policy_invalid",
  );
  ensure(
    request.coinGlassCredential.source === "PRODUCTION_ENV_FILE_EXACT_KEY" &&
      request.coinGlassCredential.file === policy.credentialFile &&
      request.coinGlassCredential.envKey === policy.credentialEnvKey,
    "runtime_request_credential_source_invalid",
  );
  ensure(
    request.networkEnvironment === "TENCENT_ISOLATED_READ_ONLY" &&
      request.expectedLiveConformantProfileCount === 15 &&
      request.expectedRouteEligibleProfileCount === 14 &&
      JSON.stringify(request.expectedBlockedProbeIds) ===
        JSON.stringify(["BINANCE_SPOT_CATALOG"]),
    "runtime_request_route_denominator_invalid",
  );
  ensure(
    PREFIXED_SHA256.test(request.expectedProbePlanDigest) &&
      PREFIXED_SHA256.test(request.expectedRegistryDigest),
    "runtime_request_runtime_digest_invalid",
  );
  ensure(
    COMMIT.test(request.conformanceArtifact.releaseId) &&
      typeof request.conformanceArtifact.artifactId === "string" &&
      request.conformanceArtifact.artifactId.startsWith("source-conformance:") &&
      PREFIXED_SHA256.test(request.conformanceArtifact.contentHash),
    "runtime_request_conformance_identity_invalid",
  );
  directChild(
    request.conformanceArtifact.path,
    policy.conformanceEvidenceRoot,
    basename(request.conformanceArtifact.path),
    "runtime_request_conformance_path_invalid",
  );
  ensure(
    basename(request.conformanceArtifact.path).endsWith(".artifact.json"),
    "runtime_request_conformance_path_invalid",
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
    "runtime_request_container_identity_invalid",
  );
  ensure(
    request.expectedHealth.level === "ready" &&
      request.expectedHealth.persistenceDatabaseStatus === "ready" &&
      request.expectedHealth.scanFreshness === "fresh" &&
      request.expectedHealth.scanStatus === "ready",
    "runtime_request_health_expectation_weakened",
  );
  ensure(
    Number.isSafeInteger(request.runtimeDeadlineSeconds) &&
      request.runtimeDeadlineSeconds >= 120 &&
      request.runtimeDeadlineSeconds <= 1_800 &&
      request.maxListingPagesPerSource === 64,
    "runtime_request_deadline_or_listing_budget_invalid",
  );
  ensure(
    SHA256.test(request.transportBundleSha256) &&
      SHA256.test(request.artifactManifestSha256) &&
      request.transportMethod === "signed_git_bundle" &&
      request.transportContainsSecrets === false,
    "runtime_request_transport_boundary_invalid",
  );
  ensure(
    request.productionMutationScope ===
      "dispatch_staging_and_sanitized_evidence_checkpoints_only" &&
      request.listingCheckpointMutationAllowed === true &&
      request.rawMarketBodyPersistenceAllowed === false,
    "runtime_request_mutation_scope_invalid",
  );
  for (const key of [
    "applicationMutationAllowed",
    "databaseMutationAllowed",
    "redisMutationAllowed",
    "workerMutationAllowed",
    "runtimeAuthorityAllowed",
    "factAuthorityAllowed",
    "candidateAuthorityAllowed",
    "strategyAuthorityAllowed",
  ]) {
    ensure(request[key] === false, `runtime_request_${key}_must_be_false`);
  }
  ensure(
    request.automaticRollbackRequired === true &&
      request.sessionIndependentExecutionRequired === true &&
      request.temporaryStagingCleanupRequired === true &&
      request.maxExecutions === 1 &&
      Number.isSafeInteger(request.revocationEpoch) &&
      request.revocationEpoch >= 0,
    "runtime_request_execution_safety_invalid",
  );
  directChild(
    request.stagingDirectory,
    policy.stagingRoot,
    `${policy.stagingPrefix}${request.dispatchId}`,
    "runtime_request_staging_directory_invalid",
  );
  directChild(
    request.artifactPath,
    policy.evidenceRoot,
    `${request.dispatchId}.artifact.json`,
    "runtime_request_artifact_path_invalid",
  );
  directChild(
    request.resultPath,
    policy.evidenceRoot,
    `${request.dispatchId}.result.json`,
    "runtime_request_result_path_invalid",
  );
  checkpointPath(
    request.checkpointPaths.BYBIT_DERIVATIVES,
    policy.checkpointRoot,
    request.dispatchId,
    "BYBIT_DERIVATIVES",
    "runtime_request_bybit_checkpoint_path_invalid",
  );
  checkpointPath(
    request.checkpointPaths.BITGET_FUTURES,
    policy.checkpointRoot,
    request.dispatchId,
    "BITGET_FUTURES",
    "runtime_request_bitget_checkpoint_path_invalid",
  );
  priorCheckpoint(
    request.priorCheckpoints.BYBIT_DERIVATIVES,
    policy,
    "BYBIT_DERIVATIVES",
  );
  priorCheckpoint(
    request.priorCheckpoints.BITGET_FUTURES,
    policy,
    "BITGET_FUTURES",
  );
  const issuedAt = parseTimestamp(
    request.approvalIssuedAt,
    "runtime_request_issued_at_invalid",
  );
  const expiresAt = parseTimestamp(
    request.approvalExpiresAt,
    "runtime_request_expires_at_invalid",
  );
  ensure(
    expiresAt > issuedAt &&
      expiresAt.getTime() - issuedAt.getTime() <= 90 * 60_000 &&
      now >= issuedAt &&
      now <= expiresAt,
    "runtime_request_approval_window_invalid",
  );
  return request;
}

async function assertRegularFile(path, reason, maximumBytes = 32 * 1024 * 1024) {
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

async function readCanonicalJson(path, reason, maximumBytes) {
  await assertRegularFile(path, reason, maximumBytes);
  const raw = await readFile(path, "utf8");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new LiveRuntimeAdapterError(reason);
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
      "runtime_manifest_path_escape",
    );
    if (entry.isDirectory()) {
      output.push(...await walkRegularFiles(root, path));
    } else {
      ensure(
        entry.isFile() && !entry.isSymbolicLink(),
        "runtime_manifest_special_file",
      );
      output.push(relative);
    }
  }
  return output.sort();
}

async function validateManifest(stagingDirectory, request) {
  const { raw, value: manifest } = await readCanonicalJson(
    join(stagingDirectory, LIVE_RUNTIME_ADAPTER_MANIFEST),
    "runtime_manifest_invalid",
    512 * 1024,
  );
  exactKeys(manifest, MANIFEST_KEYS, "runtime_manifest_keys_invalid");
  ensure(
    manifest.schemaVersion === LIVE_RUNTIME_ADAPTER_MANIFEST_SCHEMA &&
      manifest.packageId === request.packageId &&
      manifest.sourceCommit === request.sourceCommit &&
      manifest.sourceTree === request.sourceTree &&
      manifest.containsSecrets === false &&
      manifest.mutationScope === request.productionMutationScope &&
      manifest.archiveFormat === "ustar+gzip-n" &&
      manifest.sourceDateEpoch === 946_684_800 &&
      manifest.runtimeEntry === LIVE_RUNTIME_ADAPTER_RUNTIME_ENTRY &&
      manifest.probePlanDigest === request.expectedProbePlanDigest &&
      manifest.registryDigest === request.expectedRegistryDigest &&
      manifest.zodRuntimeTreeDigest ===
        LIVE_RUNTIME_ADAPTER_ZOD_RUNTIME_TREE_DIGEST &&
      /^\d+\.\d+\.\d+$/u.test(manifest.zodVersion) &&
      SHA256.test(manifest.dependencyLockSha256) &&
      sha256(raw) === request.artifactManifestSha256,
    "runtime_manifest_binding_invalid",
  );
  ensure(
    manifest.files &&
      typeof manifest.files === "object" &&
      !Array.isArray(manifest.files) &&
      Object.keys(manifest.files).length >= 20 &&
      Object.keys(manifest.files).length <= 400,
    "runtime_manifest_files_invalid",
  );
  for (const [path, expected] of Object.entries(manifest.files)) {
    ensure(
      typeof path === "string" &&
        !path.startsWith("/") &&
        !path.includes("..") &&
        !path.includes("\\") &&
        SHA256.test(expected),
      "runtime_manifest_file_entry_invalid",
    );
    await assertRegularFile(
      join(stagingDirectory, path),
      "runtime_manifest_file_missing_or_unsafe",
    );
    ensure(
      sha256(await readFile(join(stagingDirectory, path))) === expected,
      "runtime_manifest_file_sha_mismatch",
      path,
    );
  }
  for (const required of [
    LIVE_RUNTIME_ADAPTER_ENTRYPOINT,
    LIVE_RUNTIME_ADAPTER_RUNNER,
    LIVE_RUNTIME_ADAPTER_SAFETY_RUNNER,
    LIVE_RUNTIME_ADAPTER_RUNTIME_ENTRY,
    LIVE_RUNTIME_ADAPTER_REGISTRY_ENTRY,
    LIVE_RUNTIME_ADAPTER_SOURCE_ENTRY,
    LIVE_RUNTIME_ADAPTER_CONFORMANCE_SCHEMA_ENTRY,
    LIVE_RUNTIME_ADAPTER_LISTING_SCHEMA_ENTRY,
    "runtime/node_modules/zod/package.json",
  ]) {
    ensure(
      manifest.files[required] !== undefined,
      "runtime_manifest_required_file_missing",
      required,
    );
  }
  const controls = new Set([
    ".dispatch.json",
    ".dispatch.sig",
    ".transport-bundle.sha256",
    "approval-request.json",
    LIVE_RUNTIME_ADAPTER_MANIFEST,
  ]);
  const actualPayloadFiles = (await walkRegularFiles(stagingDirectory))
    .filter((path) => !controls.has(path));
  ensure(
    JSON.stringify(actualPayloadFiles) ===
      JSON.stringify(Object.keys(manifest.files).sort()),
    "runtime_manifest_payload_set_mismatch",
  );
  return manifest;
}

export function validateLiveRuntimeAdapterDispatchEnvelope({
  envelope,
  marker,
  request,
  requestRaw,
}) {
  ensure(
    envelope &&
      typeof envelope === "object" &&
      !Array.isArray(envelope),
    "runtime_dispatch_envelope_invalid",
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
      envelope.entrypointPath === LIVE_RUNTIME_ADAPTER_ENTRYPOINT &&
      envelope.launchSuccessMarker === request.launchSuccessMarker &&
      envelope.transportMethod === "signed_git_bundle" &&
      envelope.transportContainsSecrets === false &&
      envelope.noArbitraryCommand === true &&
      envelope.productionMutation === true &&
      envelope.productionWipLimit === 1 &&
      envelope.maxExecutions === 1 &&
      envelope.sessionIndependentExecutionRequired === true &&
      envelope.automaticRollbackRequired === true &&
      Number.isSafeInteger(envelope.runtimeMaxSeconds) &&
      envelope.runtimeMaxSeconds >= request.runtimeDeadlineSeconds + 30 &&
      envelope.runtimeMaxSeconds <= 1_860 &&
      envelope.issuedAt === request.approvalIssuedAt &&
      envelope.expiresAt === request.approvalExpiresAt &&
      envelope.revocationEpoch === request.revocationEpoch,
    "runtime_dispatch_binding_invalid",
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
    "runtime_dispatch_envelope_invalid",
    512 * 1024,
  );
  const marker = (await readFile(bundleMarkerPath, "utf8")).trim();
  return validateLiveRuntimeAdapterDispatchEnvelope({
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
    LIVE_RUNTIME_ADAPTER_RUNTIME_ENTRY,
  ));
  const registry = require(join(
    stagingDirectory,
    LIVE_RUNTIME_ADAPTER_REGISTRY_ENTRY,
  ));
  const source = require(join(
    stagingDirectory,
    LIVE_RUNTIME_ADAPTER_SOURCE_ENTRY,
  ));
  const conformance = require(join(
    stagingDirectory,
    LIVE_RUNTIME_ADAPTER_CONFORMANCE_SCHEMA_ENTRY,
  ));
  const listing = require(join(
    stagingDirectory,
    LIVE_RUNTIME_ADAPTER_LISTING_SCHEMA_ENTRY,
  ));
  return {
    artifactSchema: runtime.M1RuntimeAdapterLiveArtifactSchema,
    blockedProbeIds: runtime.M1_RUNTIME_ADAPTER_BLOCKED_PROBE_IDS,
    conformanceSchema: conformance.M1SourceConformanceArtifactSchema,
    extractCheckpoints: runtime.extractM1ListingHistoryCheckpoints,
    listingCheckpointSchema: listing.M1ListingHistoryCheckpointSchema,
    probePlanDigest: source.M1_EXACT_SOURCE_PROBE_PLAN_DIGEST,
    registryDigest:
      registry.M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest,
    run: runtime.runM1RuntimeAdapterLiveSegment,
  };
}

function validateRuntimeBindings(bindings, request) {
  ensure(
    typeof bindings.run === "function" &&
      typeof bindings.extractCheckpoints === "function" &&
      typeof bindings.artifactSchema?.parse === "function" &&
      typeof bindings.conformanceSchema?.parse === "function" &&
      typeof bindings.listingCheckpointSchema?.parse === "function" &&
      bindings.probePlanDigest === request.expectedProbePlanDigest &&
      bindings.registryDigest === request.expectedRegistryDigest &&
      JSON.stringify(bindings.blockedProbeIds) ===
        JSON.stringify(request.expectedBlockedProbeIds),
    "runtime_binding_mismatch",
  );
}

async function loadBoundConformance(request, bindings) {
  const { value } = await readCanonicalJson(
    request.conformanceArtifact.path,
    "runtime_conformance_artifact_invalid",
    16 * 1024 * 1024,
  );
  const artifact = bindings.conformanceSchema.parse(value);
  ensure(
    artifact.releaseId === request.conformanceArtifact.releaseId &&
      artifact.artifactId === request.conformanceArtifact.artifactId &&
      artifact.contentHash === request.conformanceArtifact.contentHash &&
      artifact.registryDigest === request.expectedRegistryDigest &&
      artifact.probePlanDigest === request.expectedProbePlanDigest &&
      artifact.evidenceClass === "LIVE_READ_ONLY" &&
      artifact.networkEnvironment === "TENCENT_ISOLATED_READ_ONLY" &&
      artifact.passCount === 15 &&
      artifact.failCount === 0 &&
      artifact.notRunCount === 0,
    "runtime_conformance_artifact_binding_mismatch",
  );
  return artifact;
}

async function loadPriorCheckpoints(request, bindings) {
  const output = {};
  for (const source of CHECKPOINT_PATH_KEYS) {
    const expected = request.priorCheckpoints[source];
    if (expected.path === null) {
      output[source] = null;
      continue;
    }
    const { value } = await readCanonicalJson(
      expected.path,
      "runtime_prior_checkpoint_invalid",
      32 * 1024 * 1024,
    );
    const checkpoint = bindings.listingCheckpointSchema.parse(value);
    const { raw: resultRaw, value: result } = await readCanonicalJson(
      expected.resultPath,
      "runtime_prior_checkpoint_result_invalid",
      4 * 1024 * 1024,
    );
    const resultCheckpoint = result?.checkpoints?.[source];
    ensure(
      checkpoint.sourceId === source &&
        checkpoint.checkpointId === expected.checkpointId &&
        checkpoint.contentHash === expected.contentHash &&
        checkpoint.productionChanged === false &&
        sha256(resultRaw) === expected.resultSha256 &&
        result.schemaVersion === LIVE_RUNTIME_ADAPTER_RESULT_SCHEMA &&
        result.packageId === LIVE_RUNTIME_ADAPTER_PACKAGE_ID &&
        result.status === "PASS_TENCENT_RUNTIME_ADAPTER_BOUNDED_SEGMENT" &&
        result.productionChanged === false &&
        result.secretMaterialPresent === false &&
        result.sourceCommit === checkpoint.releaseId &&
        result.resultPath === expected.resultPath &&
        resultCheckpoint?.written === true &&
        resultCheckpoint.checkpointId === expected.checkpointId &&
        resultCheckpoint.contentHash === expected.contentHash &&
        resultCheckpoint.path === expected.path,
      "runtime_prior_checkpoint_binding_mismatch",
    );
    output[source] = checkpoint;
  }
  return output;
}

async function runRuntimeChild({ requestPath, stagingDirectory }) {
  const { value: request } = await readCanonicalJson(
    requestPath,
    "runtime_child_request_invalid",
    512 * 1024,
  );
  const bindings = loadRuntimeBindings(stagingDirectory);
  validateRuntimeBindings(bindings, request);
  const conformanceArtifact = await loadBoundConformance(request, bindings);
  const listingCheckpoints = await loadPriorCheckpoints(request, bindings);
  const credential = process.env.MARKET_RADAR_M1_4B_COINGLASS_KEY ?? "";
  delete process.env.MARKET_RADAR_M1_4B_COINGLASS_KEY;
  ensure(credential.length >= 20, "runtime_child_credential_missing");
  const artifact = await bindings.run({
    runtimeReleaseId: request.sourceCommit,
    conformanceArtifact,
    coinGlassApiKey: credential,
    listingCheckpoints,
    networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
  });
  process.stdout.write(canonicalJson(artifact));
}

async function executeRuntimeProcess({
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
        "runtime-child",
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
          MARKET_RADAR_M1_4B_COINGLASS_KEY: credential,
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
    const maximumStdout = 32 * 1024 * 1024;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, request.runtimeDeadlineSeconds * 1000);
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maximumStdout) child.kill("SIGKILL");
      else stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => stderrHash.update(chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(new LiveRuntimeAdapterError("runtime_process_error", {
        code: String(error?.code ?? "unknown").slice(0, 80),
      }));
    });
    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (exitCode !== 0 || stdoutBytes > maximumStdout) {
        rejectPromise(new LiveRuntimeAdapterError("runtime_process_failed", {
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

export function validateLiveRuntimeArtifact(artifact, request, bindings) {
  const parsed = bindings.artifactSchema.parse(artifact);
  ensure(
    parsed.runtimeReleaseId === request.sourceCommit &&
      parsed.conformanceReleaseId === request.conformanceArtifact.releaseId &&
      parsed.conformanceArtifactId === request.conformanceArtifact.artifactId &&
      parsed.conformanceArtifactHash ===
        request.conformanceArtifact.contentHash &&
      parsed.registryDigest === request.expectedRegistryDigest &&
      parsed.probePlanDigest === request.expectedProbePlanDigest &&
      parsed.evidenceClass === "LIVE_READ_ONLY" &&
      parsed.networkEnvironment === "TENCENT_ISOLATED_READ_ONLY" &&
      parsed.liveConformantProfileCount ===
        request.expectedLiveConformantProfileCount &&
      parsed.routeEligibleProfileCount ===
        request.expectedRouteEligibleProfileCount &&
      parsed.registryBlockedProfileCount === 1 &&
      JSON.stringify(parsed.registryBlockedProbeIds) ===
        JSON.stringify(request.expectedBlockedProbeIds) &&
      parsed.executedProbeIds.length === 14 &&
      !parsed.executedProbeIds.includes("BINANCE_SPOT_CATALOG") &&
      parsed.rawBodyRetained === false &&
      parsed.secretMaterialPresent === false &&
      parsed.runtimeAuthorityGranted === false &&
      parsed.factAuthorityGranted === false &&
      parsed.candidateAuthorityGranted === false &&
      parsed.strategyAuthorityGranted === false &&
      parsed.readyAuthorityGranted === false &&
      parsed.productionChanged === false,
    "runtime_artifact_authority_or_denominator_invalid",
  );
  return parsed;
}

async function ensureEvidenceRoots(policy) {
  await ensureEvidenceRoot(policy);
  await mkdir(policy.checkpointRoot, { recursive: true, mode: 0o700 });
  const facts = await lstat(policy.checkpointRoot);
  ensure(
    facts.isDirectory() &&
      !facts.isSymbolicLink() &&
      (facts.mode & 0o077) === 0 &&
      await realpath(policy.checkpointRoot) === resolve(policy.checkpointRoot),
    "runtime_checkpoint_root_unsafe",
  );
}

const FAILURE_PHASES = Object.freeze([
  "REQUEST_FILE_VALIDATION",
  "PACKAGE_BINDING_VALIDATION",
  "RUNTIME_BINDING_VALIDATION",
  "CONFORMANCE_BINDING_VALIDATION",
  "PRIOR_CHECKPOINT_VALIDATION",
  "PRODUCTION_IDENTITY_BEFORE",
  "CREDENTIAL_VALIDATION",
  "RUNTIME_EXECUTION",
  "ARTIFACT_VALIDATION",
  "PRODUCTION_IDENTITY_AFTER",
  "EVIDENCE_PERSISTENCE",
  "GATE_EVALUATION",
]);

async function persistFailure({ error, executionContext, policy }) {
  const request = executionContext.request;
  if (request === null) return;
  if (await lstat(request.resultPath).catch(() => null) !== null) return;
  const failureReason =
    error instanceof LiveRuntimeAdapterError ||
      error instanceof LiveSourceConformanceError
      ? error.reason
      : "unexpected_error";
  ensure(
    /^[a-z0-9_]{3,120}$/u.test(failureReason) &&
      FAILURE_PHASES.includes(executionContext.phase),
    "runtime_failure_evidence_reason_invalid",
  );
  const before = executionContext.before === null
    ? null
    : boundedIdentity(executionContext.before);
  const after = executionContext.after === null
    ? null
    : boundedIdentity(executionContext.after);
  const result = {
    after,
    artifactPath: request.artifactPath,
    before,
    checkpointPaths: request.checkpointPaths,
    dispatchId: request.dispatchId,
    failurePhase: executionContext.phase,
    failureReason,
    generatedAt: new Date().toISOString(),
    packageId: request.packageId,
    productionIdentityUnchangedVerified:
      before !== null &&
      after !== null &&
      canonicalJson(before) === canonicalJson(after),
    productionMutationAttempted: false,
    resultPath: request.resultPath,
    schemaVersion: LIVE_RUNTIME_ADAPTER_FAILURE_RESULT_SCHEMA,
    secretMaterialPresent: false,
    sourceCommit: request.sourceCommit,
    sourceTree: request.sourceTree,
    status: "BLOCKED_TENCENT_RUNTIME_ADAPTER_EXECUTION_FAILURE",
  };
  await ensureEvidenceRoots(policy);
  await writeExclusiveCanonical(request.resultPath, result);
}

async function executeLiveRuntimeAdapter({
  bundleMarkerPath,
  commandRunner = runLiveReadOnlyCommand,
  credentialReader = readExactCoinGlassCredential,
  executionContext,
  now = new Date(),
  policy = DEFAULT_LIVE_RUNTIME_ADAPTER_POLICY,
  runtimeBindingsLoader = loadRuntimeBindings,
  runtimeExecutor = executeRuntimeProcess,
  requestPath,
}) {
  executionContext.phase = "REQUEST_FILE_VALIDATION";
  const requestFacts = await assertRegularFile(
    requestPath,
    "runtime_request_file_unsafe",
    512 * 1024,
  );
  ensure((requestFacts.mode & 0o077) === 0, "runtime_request_file_mode_unsafe");
  await assertRegularFile(bundleMarkerPath, "runtime_bundle_marker_unsafe", 256);
  const { raw: requestRaw, value: request } = await readCanonicalJson(
    requestPath,
    "runtime_request_invalid",
    512 * 1024,
  );
  validateLiveRuntimeAdapterRequest(request, { now, policy });
  executionContext.request = request;

  executionContext.phase = "PACKAGE_BINDING_VALIDATION";
  ensure(
    await realpath(request.stagingDirectory) === request.stagingDirectory &&
      await realpath(requestPath) ===
        join(request.stagingDirectory, "approval-request.json"),
    "runtime_staging_identity_mismatch",
  );
  const stagingFacts = await lstat(request.stagingDirectory);
  ensure(
    stagingFacts.isDirectory() &&
      !stagingFacts.isSymbolicLink() &&
      (stagingFacts.mode & 0o077) === 0,
    "runtime_staging_mode_unsafe",
  );
  await validateManifest(request.stagingDirectory, request);
  await validateDispatchBinding(
    request.stagingDirectory,
    request,
    requestRaw,
    bundleMarkerPath,
  );

  executionContext.phase = "RUNTIME_BINDING_VALIDATION";
  const bindings = runtimeBindingsLoader(request.stagingDirectory);
  validateRuntimeBindings(bindings, request);
  executionContext.phase = "CONFORMANCE_BINDING_VALIDATION";
  await loadBoundConformance(request, bindings);
  executionContext.phase = "PRIOR_CHECKPOINT_VALIDATION";
  await loadPriorCheckpoints(request, bindings);

  executionContext.phase = "PRODUCTION_IDENTITY_BEFORE";
  const before = await captureProductionIdentity(request, commandRunner);
  executionContext.before = before;
  assertProductionIdentity(before, request, "before");
  executionContext.phase = "CREDENTIAL_VALIDATION";
  const credential = await credentialReader(request.coinGlassCredential.file);
  let rawArtifact;
  executionContext.phase = "RUNTIME_EXECUTION";
  rawArtifact = await runtimeExecutor({
    credential,
    request,
    requestPath,
    runnerPath: join(request.stagingDirectory, LIVE_RUNTIME_ADAPTER_RUNNER),
  });
  let artifact;
  try {
    executionContext.phase = "ARTIFACT_VALIDATION";
    artifact = validateLiveRuntimeArtifact(
      JSON.parse(rawArtifact),
      request,
      bindings,
    );
  } catch (error) {
    if (error instanceof LiveRuntimeAdapterError) throw error;
    throw new LiveRuntimeAdapterError("runtime_artifact_invalid");
  }
  ensure(
    !canonicalJson(artifact).includes(credential),
    "runtime_artifact_contains_credential",
  );

  executionContext.phase = "PRODUCTION_IDENTITY_AFTER";
  const after = await captureProductionIdentity(request, commandRunner);
  executionContext.after = after;
  assertProductionIdentity(after, request, "after");
  ensure(
    before.productionHead === after.productionHead &&
      JSON.stringify(before.containerIds) ===
        JSON.stringify(after.containerIds) &&
      before.listenerSha256 === after.listenerSha256,
    "runtime_production_identity_drift",
  );

  const checkpoints = bindings.extractCheckpoints(artifact);
  const parsedCheckpoints = {};
  for (const source of CHECKPOINT_PATH_KEYS) {
    const checkpoint = checkpoints[source];
    if (checkpoint === null) {
      parsedCheckpoints[source] = null;
      continue;
    }
    const parsed = bindings.listingCheckpointSchema.parse(checkpoint);
    ensure(
      parsed.sourceId === source &&
        parsed.releaseId === request.sourceCommit &&
        parsed.productionChanged === false,
      "runtime_checkpoint_authority_boundary_invalid",
    );
    parsedCheckpoints[source] = parsed;
  }
  const gatesPassed =
    artifact.status === "PASS_BOUNDED_ROUTE_SEGMENT_NO_AUTHORITY" &&
    artifact.passedProbeIds.length === 14 &&
    artifact.failedProbeIds.length === 0 &&
    artifact.listingCheckpointCommittedCount === 2 &&
    artifact.listingGapCount === 0 &&
    artifact.acceptanceAxes.every((axis) =>
      axis.routeGateStatus === "PASS" &&
      axis.acceptanceGranted === false
    );
  if (gatesPassed) {
    ensure(
      CHECKPOINT_PATH_KEYS.every((source) =>
        parsedCheckpoints[source] !== null
      ),
      "runtime_checkpoint_set_incomplete",
    );
  }

  executionContext.phase = "EVIDENCE_PERSISTENCE";
  await ensureEvidenceRoots(policy);
  await writeExclusiveCanonical(request.artifactPath, artifact);
  const checkpointResults = {};
  for (const source of CHECKPOINT_PATH_KEYS) {
    const parsed = gatesPassed ? parsedCheckpoints[source] : null;
    if (parsed === null) {
      checkpointResults[source] = {
        checkpointId: null,
        contentHash: null,
        path: null,
        written: false,
      };
      continue;
    }
    await writeExclusiveCanonical(request.checkpointPaths[source], parsed);
    await chmod(request.checkpointPaths[source], 0o600);
    checkpointResults[source] = {
      checkpointId: parsed.checkpointId,
      contentHash: parsed.contentHash,
      path: request.checkpointPaths[source],
      written: true,
    };
  }
  const result = {
    acceptanceAxes: Object.fromEntries(
      artifact.acceptanceAxes.map((axis) => [
        axis.axisId,
        axis.routeGateStatus,
      ]),
    ),
    after: boundedIdentity(after),
    artifactContentHash: artifact.contentHash,
    artifactId: artifact.artifactId,
    artifactPath: request.artifactPath,
    before: boundedIdentity(before),
    checkpoints: checkpointResults,
    conformanceArtifact: request.conformanceArtifact,
    dispatchId: request.dispatchId,
    generatedAt: artifact.generatedAt,
    packageId: request.packageId,
    productionChanged: false,
    profileCounts: {
      executed: artifact.executedProbeIds.length,
      failed: artifact.failedProbeIds.length,
      liveConformant: artifact.liveConformantProfileCount,
      passed: artifact.passedProbeIds.length,
      registryBlocked: artifact.registryBlockedProfileCount,
      routeEligible: artifact.routeEligibleProfileCount,
    },
    requestAttemptCount: artifact.requestAttemptCount,
    resultPath: request.resultPath,
    schemaVersion: LIVE_RUNTIME_ADAPTER_RESULT_SCHEMA,
    secretMaterialPresent: false,
    sourceCommit: request.sourceCommit,
    sourceTree: request.sourceTree,
    status: gatesPassed
      ? "PASS_TENCENT_RUNTIME_ADAPTER_BOUNDED_SEGMENT"
      : "BLOCKED_TENCENT_RUNTIME_ADAPTER_BOUNDED_SEGMENT",
  };
  ensure(
    !canonicalJson(result).includes(credential),
    "runtime_result_contains_credential",
  );
  await writeExclusiveCanonical(request.resultPath, result);
  executionContext.phase = "GATE_EVALUATION";
  ensure(gatesPassed, "runtime_adapter_gates_blocked");
  return result;
}

export async function runLiveRuntimeAdapter(options) {
  const executionContext = {
    after: null,
    before: null,
    phase: "REQUEST_FILE_VALIDATION",
    request: null,
  };
  try {
    return await executeLiveRuntimeAdapter({
      ...options,
      executionContext,
    });
  } catch (error) {
    await persistFailure({
      error,
      executionContext,
      policy: options.policy ?? DEFAULT_LIVE_RUNTIME_ADAPTER_POLICY,
    }).catch(() => {});
    throw error;
  }
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  ensure(rest.length % 2 === 0, "runtime_runner_arguments_invalid");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    ensure(
      /^--[a-z][a-z-]*$/u.test(key ?? "") &&
        typeof value === "string" &&
        !value.startsWith("--") &&
        options[key.slice(2)] === undefined,
      "runtime_runner_arguments_invalid",
    );
    options[key.slice(2)] = value;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === "runtime-child") {
    ensure(
      options.request && options.staging,
      "runtime_child_options_missing",
    );
    await runRuntimeChild({
      requestPath: resolve(options.request),
      stagingDirectory: resolve(options.staging),
    });
    return;
  }
  ensure(
    command === "run" && options.request && options["bundle-marker"],
    "runtime_runner_command_invalid",
  );
  const result = await runLiveRuntimeAdapter({
    bundleMarkerPath: resolve(options["bundle-marker"]),
    requestPath: resolve(options.request),
  });
  process.stdout.write(canonicalJson(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      reason:
        error instanceof LiveRuntimeAdapterError ||
          error instanceof LiveSourceConformanceError
          ? error.reason
          : "unexpected_error",
      status: "BLOCKED",
    })}\n`);
    process.exitCode = 1;
  });
}
