#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  DETERMINISTIC_USTAR_SOURCE_DATE_EPOCH,
  readDeterministicUstar,
} from "../lib/deterministic-ustar.mjs";

export const P0R_TRANSPORT_STAGE_PACKAGE_ID =
  "V2-M1-6-P0R-TRANSPORT-STAGE";
export const P0R_TRANSPORT_STAGE_REQUEST_SCHEMA =
  "market-radar-v2-m1-p0r-transport-stage-request.v1";
export const P0R_TRANSPORT_STAGE_MANIFEST_SCHEMA =
  "market-radar-v2-m1-p0r-transport-stage-manifest.v1";
export const P0R_TRANSPORT_STAGE_SUCCESS_MARKER =
  "PASS_V2_M1_6_P0R_TRANSPORT_STAGED";
export const P0R_TRANSPORT_STAGE_ENTRYPOINT =
  "scripts/v2/production/m1-p0r-transport-staging-entrypoint.sh";
export const P0R_TRANSPORT_STAGE_RUNNER =
  "scripts/v2/production/m1-p0r-transport-staging.mjs";
export const P0R_TRANSPORT_STAGE_USTAR_LIBRARY =
  "scripts/v2/lib/deterministic-ustar.mjs";
export const P0R_TRANSPORT_STAGE_MANIFEST =
  "p0r-transport-staging-manifest.json";
export const P0R_TRANSPORT_STAGE_INNER_BUNDLE =
  "p0r-transport.tar.gz";
export const P0R_TRANSPORT_STAGE_RUNTIME_MAX_SECONDS = 90;
export const P0R_TRANSPORT_SCHEMA =
  "v2-m1-production-storage-p0r-transport.v4";

export const P0R_TRANSPORT_STAGE_OUTER_MEMBER_MODES = Object.freeze({
  [P0R_TRANSPORT_STAGE_ENTRYPOINT]: 0o700,
  [P0R_TRANSPORT_STAGE_INNER_BUNDLE]: 0o600,
  [P0R_TRANSPORT_STAGE_MANIFEST]: 0o600,
  [P0R_TRANSPORT_STAGE_RUNNER]: 0o600,
  [P0R_TRANSPORT_STAGE_USTAR_LIBRARY]: 0o600,
});

export const P0R_TRANSPORT_STAGE_OUTER_BOUND_FILES = Object.freeze(
  Object.keys(P0R_TRANSPORT_STAGE_OUTER_MEMBER_MODES)
    .filter((path) => path !== P0R_TRANSPORT_STAGE_MANIFEST)
    .sort(),
);

export const DEFAULT_P0R_TRANSPORT_STAGE_POLICY = Object.freeze({
  deliveryRoot: "/home/ubuntu/.cache/market-radar-v2/p0r/staging",
  dispatchStateRoot: "/var/lib/market-radar-production-dispatch",
  expectedTimerUnit: "market-radar-production-dispatch.timer",
  stagingPrefix: "m1-p0r-transport-stage-",
  stagingRoot: "/home/ubuntu/.cache/market-radar-v2",
});

const COMMIT = /^[a-f0-9]{40}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const DISPATCH_ID = /^[a-z0-9][a-z0-9.-]{15,180}$/u;
const RUN_ID = /^p0r-[0-9]{8}t[0-9]{6}z-[a-f0-9]{32}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SOURCE_REF =
  /^refs\/heads\/codex\/[a-z0-9][a-z0-9._/-]{2,180}$/u;
const UNIT = /^market-radar-[a-z0-9][a-z0-9-]{7,56}$/u;
const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_INNER_BUNDLE_BYTES = 16 * 1024 * 1024;
const MAX_INNER_TAR_BYTES = 32 * 1024 * 1024;

export const P0R_TRANSPORT_MEMBER_MODES = Object.freeze({
  "AGE-LICENSE": 0o400,
  age: 0o700,
  "age-recipient.txt": 0o400,
  "cos-provisioning-plan.json": 0o600,
  "m1-production-storage-backup-capture.mjs": 0o600,
  "m1-production-storage-database-fingerprint.mjs": 0o600,
  "m1-production-storage-p0r-cos-provisioning.mjs": 0o600,
  "m1-production-storage-p0r-route-listener-observer.sh": 0o700,
  "m1-production-storage-p0r-runner.sh": 0o700,
  "m1-production-storage-p0r-runtime-capsule.mjs": 0o600,
  "m1-production-storage-p0r-session.sh": 0o700,
  "m1-production-storage-read-only-preflight.mjs": 0o600,
  "m1-production-storage-recovery-evidence.mjs": 0o600,
  "p0r-bindings.env": 0o600,
  "p0r-cos-archive": 0o700,
  "p0r-node-runtime.tar": 0o400,
  "transport-manifest.json": 0o600,
});

export const P0R_TRANSPORT_MEMBER_NAMES = Object.freeze(
  Object.keys(P0R_TRANSPORT_MEMBER_MODES).sort(),
);

const REQUEST_KEYS = Object.freeze([
  "applicationMutationAllowed",
  "approvalExpiresAt",
  "approvalIssuedAt",
  "artifactManifestSha256",
  "automaticRollbackRequired",
  "containsRestrictedDestinationMetadata",
  "credentialMaterialAllowed",
  "databaseMutationAllowed",
  "deliveryRoot",
  "deliveryTargetDirectory",
  "dispatchId",
  "dispatchRuntimeMaxSeconds",
  "dispatchStateRoot",
  "expectedInnerMemberCount",
  "expectedP0RPlanDigest",
  "expectedP0RRunId",
  "expectedP0RSourceCommit",
  "expectedTimerUnit",
  "expectedTransportManifestDigest",
  "expectedTransportManifestSha256",
  "innerTransportBundleBytes",
  "innerTransportBundleSha256",
  "launchSuccessMarker",
  "maxExecutions",
  "packageId",
  "p0rRecoveryExecutionAllowed",
  "productionDatabaseMutationAllowed",
  "productionMutationScope",
  "productionRepositoryMutationAllowed",
  "productionServiceMutationAllowed",
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
  "transportBundleSha256",
  "transportContainsSecrets",
  "transportMethod",
  "workerMutationAllowed",
]);
const OUTER_MANIFEST_KEYS = Object.freeze([
  "archiveFormat",
  "containsRestrictedDestinationMetadata",
  "containsSecrets",
  "deliveryOnly",
  "files",
  "innerTransportBundleBytes",
  "innerTransportBundleSha256",
  "innerTransportManifestDigest",
  "innerTransportManifestSha256",
  "packageId",
  "p0rRecoveryExecutionAllowed",
  "productionDatabaseMutationAllowed",
  "productionRepositoryMutationAllowed",
  "productionServiceMutationAllowed",
  "schemaVersion",
  "sourceCommit",
  "sourceDateEpoch",
  "sourceTree",
]);

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

function exactKeys(value, keys, reason) {
  ensure(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      JSON.stringify(Object.keys(value).sort()) ===
        JSON.stringify([...keys].sort()),
    reason,
  );
}

function sortedValue(value) {
  if (Array.isArray(value)) return value.map(sortedValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortedValue(value[key])]),
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

function manifestDigest(value) {
  return `sha256:${sha256(JSON.stringify(sortedValue(value)))}`;
}

function parseTime(value, reason) {
  const time = new Date(value);
  ensure(Number.isFinite(time.getTime()), reason);
  ensure(time.toISOString() === value, reason);
  return time;
}

function directChild(root, target, prefix, reason) {
  const normalizedRoot = resolve(root);
  const normalizedTarget = resolve(target);
  ensure(
    dirname(normalizedTarget) === normalizedRoot &&
      basename(normalizedTarget).startsWith(prefix) &&
      basename(normalizedTarget).length > prefix.length,
    reason,
  );
  return normalizedTarget;
}

async function readRegular(path, maximumBytes, reason) {
  let handle;
  try {
    handle = await open(
      resolve(path),
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const before = await handle.stat({ bigint: true });
    ensure(
      before.isFile() &&
        before.size > 0n &&
        before.size <= BigInt(maximumBytes),
      reason,
    );
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    ensure(
      bytes.length === Number(before.size) &&
        before.dev === after.dev &&
        before.ino === after.ino &&
        before.size === after.size &&
        before.mtimeNs === after.mtimeNs &&
        before.ctimeNs === after.ctimeNs,
      reason,
    );
    return bytes;
  } catch {
    throw new Error(reason);
  } finally {
    if (handle) await handle.close();
  }
}

function parseJson(bytes, reason) {
  try {
    const value = JSON.parse(bytes.toString("utf8"));
    ensure(value && typeof value === "object" && !Array.isArray(value), reason);
    return value;
  } catch {
    throw new Error(reason);
  }
}

function validateTransportManifest(manifest, entries) {
  ensure(
    manifest.schemaVersion === P0R_TRANSPORT_SCHEMA &&
      manifest.approvalEligible === true &&
      manifest.reproducibleArchive === true &&
      manifest.containsSecrets === false &&
      manifest.containsPersistentCredentials === false &&
      manifest.containsPrivateKey === false &&
      manifest.productionDatabaseMutationAllowed === false &&
      manifest.productionRepositoryMutationAllowed === false &&
      manifest.productionServiceMutationAllowed === false &&
      manifest.migrationAllowed === false &&
      manifest.automaticTradingAllowed === false &&
      manifest.sourceDateEpoch === DETERMINISTIC_USTAR_SOURCE_DATE_EPOCH &&
      COMMIT.test(manifest.sourceCommit),
    "p0r_transport_stage_manifest_boundary_invalid",
  );
  ensure(
    manifest.nodeRuntime?.capsuleSchemaVersion ===
      "v2-m1-production-storage-p0r-node-runtime.v1" &&
      manifest.nodeRuntime.nodeVersion === "22.23.1" &&
      manifest.nodeRuntime.npmVersion === "10.9.8" &&
      manifest.nodeRuntime.packageVersions?.pg === "8.16.3" &&
      manifest.nodeRuntime.productionNodeModulesRequired === false &&
      manifest.nodeRuntime.runtimeDependencyBoundary ===
        "EXACT_SOURCE_BOUND_P0R_NODE_RUNTIME_CAPSULE" &&
      SHA256.test(manifest.nodeRuntime.capsuleSha256),
    "p0r_transport_stage_runtime_boundary_invalid",
  );
  ensure(
    Array.isArray(manifest.files) &&
      manifest.files.length === P0R_TRANSPORT_MEMBER_NAMES.length - 1,
    "p0r_transport_stage_manifest_files_invalid",
  );
  const expectedNames = P0R_TRANSPORT_MEMBER_NAMES.filter(
    (name) => name !== "transport-manifest.json",
  );
  const observed = [];
  for (const file of manifest.files) {
    ensure(
      file &&
        typeof file === "object" &&
        typeof file.name === "string" &&
        expectedNames.includes(file.name) &&
        entries.has(file.name) &&
        file.sizeBytes === entries.get(file.name).size &&
        file.sha256 === sha256(entries.get(file.name).bytes),
      "p0r_transport_stage_manifest_file_mismatch",
    );
    observed.push(file.name);
  }
  ensure(
    JSON.stringify(observed.sort()) === JSON.stringify(expectedNames),
    "p0r_transport_stage_manifest_file_set_mismatch",
  );
  ensure(
    manifest.nodeRuntime.capsuleSha256 ===
      sha256(entries.get("p0r-node-runtime.tar").bytes),
    "p0r_transport_stage_runtime_capsule_mismatch",
  );
}

export async function inspectP0RTransportArchiveBytes(bytes) {
  ensure(
    Buffer.isBuffer(bytes) &&
      bytes.length > 0 &&
      bytes.length <= MAX_INNER_BUNDLE_BYTES,
    "p0r_transport_stage_inner_bundle_size_invalid",
  );
  let tarBytes;
  try {
    tarBytes = gunzipSync(bytes, { maxOutputLength: MAX_INNER_TAR_BYTES });
  } catch {
    throw new Error("p0r_transport_stage_inner_gzip_invalid");
  }
  const temporary = await mkdtemp(join(tmpdir(), "p0r-transport-inspect-"));
  const tarPath = join(temporary, "transport.tar");
  try {
    await writeFile(tarPath, tarBytes, { flag: "wx", mode: 0o600 });
    const parsed = await readDeterministicUstar({
      archivePath: tarPath,
      maxArchiveBytes: MAX_INNER_TAR_BYTES,
      maxEntries: P0R_TRANSPORT_MEMBER_NAMES.length,
      sourceDateEpoch: DETERMINISTIC_USTAR_SOURCE_DATE_EPOCH,
    });
    ensure(
      parsed.entryCount === P0R_TRANSPORT_MEMBER_NAMES.length,
      "p0r_transport_stage_inner_member_count_invalid",
    );
    const names = parsed.entries.map((entry) => entry.entry).sort();
    ensure(
      JSON.stringify(names) === JSON.stringify(P0R_TRANSPORT_MEMBER_NAMES),
      "p0r_transport_stage_inner_member_set_invalid",
    );
    const entries = new Map(
      parsed.entries.map((entry) => [entry.entry, entry]),
    );
    for (const name of P0R_TRANSPORT_MEMBER_NAMES) {
      ensure(
        entries.get(name).mode === P0R_TRANSPORT_MEMBER_MODES[name],
        "p0r_transport_stage_inner_member_mode_invalid",
      );
    }
    const manifestBytes = entries.get("transport-manifest.json").bytes;
    const manifest = parseJson(
      manifestBytes,
      "p0r_transport_stage_manifest_json_invalid",
    );
    validateTransportManifest(manifest, entries);
    const plan = parseJson(
      entries.get("cos-provisioning-plan.json").bytes,
      "p0r_transport_stage_plan_json_invalid",
    );
    ensure(
      RUN_ID.test(plan.credentialGrant?.runId) &&
        plan.sourceCommit === manifest.sourceCommit &&
        DIGEST.test(plan.planDigest),
      "p0r_transport_stage_plan_binding_invalid",
    );
    ensure(
      manifest.cosProvisioningPlan?.runId === plan.credentialGrant.runId &&
        manifest.cosProvisioningPlan?.planDigest === plan.planDigest,
      "p0r_transport_stage_manifest_plan_mismatch",
    );
    return Object.freeze({
      archiveSha256: sha256(bytes),
      archiveSizeBytes: bytes.length,
      entries,
      manifest,
      manifestDigest: manifestDigest(manifest),
      manifestSha256: sha256(manifestBytes),
      memberCount: parsed.entryCount,
      planDigest: plan.planDigest,
      runId: plan.credentialGrant.runId,
      sourceCommit: manifest.sourceCommit,
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function inspectP0RTransportArchive(path) {
  return inspectP0RTransportArchiveBytes(
    await readRegular(
      path,
      MAX_INNER_BUNDLE_BYTES,
      "p0r_transport_stage_inner_bundle_unsafe",
    ),
  );
}

export function validateP0RTransportStageRequest(
  request,
  {
    now = new Date(),
    policy = DEFAULT_P0R_TRANSPORT_STAGE_POLICY,
  } = {},
) {
  exactKeys(
    request,
    REQUEST_KEYS,
    "p0r_transport_stage_request_keys_invalid",
  );
  ensure(
    request.schemaVersion === P0R_TRANSPORT_STAGE_REQUEST_SCHEMA &&
      request.packageId === P0R_TRANSPORT_STAGE_PACKAGE_ID &&
      request.launchSuccessMarker === P0R_TRANSPORT_STAGE_SUCCESS_MARKER &&
      request.dispatchRuntimeMaxSeconds ===
        P0R_TRANSPORT_STAGE_RUNTIME_MAX_SECONDS &&
      request.maxExecutions === 1 &&
      request.revocationEpoch === 0 &&
      request.sessionIndependentExecutionRequired === true &&
      request.automaticRollbackRequired === true &&
      request.temporaryStagingCleanupRequired === true,
    "p0r_transport_stage_request_control_invalid",
  );
  ensure(
    request.applicationMutationAllowed === false &&
      request.databaseMutationAllowed === false &&
      request.redisMutationAllowed === false &&
      request.workerMutationAllowed === false &&
      request.productionDatabaseMutationAllowed === false &&
      request.productionRepositoryMutationAllowed === false &&
      request.productionServiceMutationAllowed === false &&
      request.credentialMaterialAllowed === false &&
      request.p0rRecoveryExecutionAllowed === false &&
      request.productionMutationScope ===
        "dispatch_staging_and_exact_p0r_transport_delivery_only",
    "p0r_transport_stage_mutation_boundary_invalid",
  );
  ensure(
    request.transportMethod === "signed_git_bundle" &&
      request.transportContainsSecrets === false &&
      request.containsRestrictedDestinationMetadata === true &&
      SHA256.test(request.transportBundleSha256) &&
      SHA256.test(request.innerTransportBundleSha256) &&
      Number.isSafeInteger(request.innerTransportBundleBytes) &&
      request.innerTransportBundleBytes > 0 &&
      request.innerTransportBundleBytes <= MAX_INNER_BUNDLE_BYTES &&
      SHA256.test(request.artifactManifestSha256) &&
      SHA256.test(request.expectedTransportManifestSha256) &&
      DIGEST.test(request.expectedTransportManifestDigest),
    "p0r_transport_stage_transport_identity_invalid",
  );
  ensure(
    DISPATCH_ID.test(request.dispatchId) &&
      UNIT.test(request.runnerUnitName) &&
      COMMIT.test(request.sourceCommit) &&
      COMMIT.test(request.sourceTree) &&
      SOURCE_REF.test(request.sourceRef) &&
      COMMIT.test(request.expectedP0RSourceCommit) &&
      RUN_ID.test(request.expectedP0RRunId) &&
      DIGEST.test(request.expectedP0RPlanDigest) &&
      request.expectedInnerMemberCount ===
        P0R_TRANSPORT_MEMBER_NAMES.length,
    "p0r_transport_stage_identity_invalid",
  );
  ensure(
    request.dispatchStateRoot === policy.dispatchStateRoot &&
      request.expectedTimerUnit === policy.expectedTimerUnit &&
      request.deliveryRoot === policy.deliveryRoot &&
      resolve(request.deliveryTargetDirectory) ===
        join(resolve(policy.deliveryRoot), request.expectedP0RRunId),
    "p0r_transport_stage_destination_invalid",
  );
  directChild(
    policy.stagingRoot,
    request.stagingDirectory,
    policy.stagingPrefix,
    "p0r_transport_stage_dispatch_staging_invalid",
  );
  const issued = parseTime(
    request.approvalIssuedAt,
    "p0r_transport_stage_issued_at_invalid",
  );
  const expires = parseTime(
    request.approvalExpiresAt,
    "p0r_transport_stage_expires_at_invalid",
  );
  ensure(
    expires > issued &&
      expires.getTime() - issued.getTime() <= 90 * 60 * 1000 &&
      now >= issued &&
      now <= expires,
    "p0r_transport_stage_approval_window_invalid",
  );
  return request;
}

async function ensureRealDirectory(path, { create = false } = {}) {
  const target = resolve(path);
  let created = false;
  if (create) {
    try {
      await mkdir(target, { mode: 0o700 });
      created = true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  const facts = await lstat(target);
  ensure(
    facts.isDirectory() &&
      !facts.isSymbolicLink() &&
      await realpath(target) === target &&
      (facts.mode & 0o077) === 0,
    "p0r_transport_stage_directory_unsafe",
  );
  if (created) await chmod(target, 0o700);
}

async function ensureDeliveryRoot(policy) {
  const stagingRoot = resolve(policy.stagingRoot);
  await ensureRealDirectory(stagingRoot);
  const relativeDelivery = relative(stagingRoot, resolve(policy.deliveryRoot));
  ensure(
    relativeDelivery &&
      !relativeDelivery.startsWith(`..${sep}`) &&
      relativeDelivery !== "..",
    "p0r_transport_stage_delivery_root_outside_boundary",
  );
  let current = stagingRoot;
  for (const component of relativeDelivery.split(sep)) {
    ensure(
      component && component !== "." && component !== "..",
      "p0r_transport_stage_delivery_root_invalid",
    );
    current = join(current, component);
    await ensureRealDirectory(current, { create: true });
  }
  ensure(
    await realpath(policy.deliveryRoot) === resolve(policy.deliveryRoot),
    "p0r_transport_stage_delivery_root_unsafe",
  );
}

async function assertAbsent(path, reason) {
  await lstat(path).then(
    () => {
      throw new Error(reason);
    },
    (error) => {
      if (error?.code !== "ENOENT") throw error;
    },
  );
}

async function verifyOuterManifest({
  innerBundleBytes,
  manifestPath,
  request,
  sourceRoot,
}) {
  const manifestBytes = await readRegular(
    manifestPath,
    MAX_REQUEST_BYTES,
    "p0r_transport_stage_outer_manifest_unsafe",
  );
  ensure(
    sha256(manifestBytes) === request.artifactManifestSha256,
    "p0r_transport_stage_outer_manifest_sha_mismatch",
  );
  const manifest = parseJson(
    manifestBytes,
    "p0r_transport_stage_outer_manifest_json_invalid",
  );
  exactKeys(
    manifest,
    OUTER_MANIFEST_KEYS,
    "p0r_transport_stage_outer_manifest_keys_invalid",
  );
  ensure(
    manifest.schemaVersion === P0R_TRANSPORT_STAGE_MANIFEST_SCHEMA &&
      manifest.packageId === P0R_TRANSPORT_STAGE_PACKAGE_ID &&
      manifest.sourceCommit === request.sourceCommit &&
      manifest.sourceTree === request.sourceTree &&
      manifest.sourceDateEpoch ===
        DETERMINISTIC_USTAR_SOURCE_DATE_EPOCH &&
      manifest.archiveFormat === "ustar+gzip-n" &&
      manifest.deliveryOnly === true &&
      manifest.containsSecrets === false &&
      manifest.containsRestrictedDestinationMetadata === true &&
      manifest.p0rRecoveryExecutionAllowed === false &&
      manifest.productionDatabaseMutationAllowed === false &&
      manifest.productionRepositoryMutationAllowed === false &&
      manifest.productionServiceMutationAllowed === false &&
      manifest.innerTransportBundleSha256 ===
        request.innerTransportBundleSha256 &&
      manifest.innerTransportBundleBytes ===
        request.innerTransportBundleBytes &&
      manifest.innerTransportManifestDigest ===
        request.expectedTransportManifestDigest &&
      manifest.innerTransportManifestSha256 ===
        request.expectedTransportManifestSha256,
    "p0r_transport_stage_outer_manifest_boundary_invalid",
  );
  ensure(
    manifest.files &&
      typeof manifest.files === "object" &&
      !Array.isArray(manifest.files) &&
      JSON.stringify(Object.keys(manifest.files).sort()) ===
        JSON.stringify(P0R_TRANSPORT_STAGE_OUTER_BOUND_FILES) &&
      manifest.files[P0R_TRANSPORT_STAGE_INNER_BUNDLE] ===
        sha256(innerBundleBytes),
    "p0r_transport_stage_outer_manifest_inner_mismatch",
  );
  for (const [path, expectedSha256] of Object.entries(manifest.files)) {
    ensure(
      typeof path === "string" &&
        !path.startsWith("/") &&
        !path.includes("\\") &&
        !path.split("/").includes("..") &&
        SHA256.test(expectedSha256),
      "p0r_transport_stage_outer_manifest_file_invalid",
    );
    const target = resolve(sourceRoot, ...path.split("/"));
    ensure(
      target.startsWith(`${resolve(sourceRoot)}${sep}`),
      "p0r_transport_stage_outer_manifest_file_escape",
    );
    const maximum =
      path === P0R_TRANSPORT_STAGE_INNER_BUNDLE
        ? MAX_INNER_BUNDLE_BYTES
        : MAX_REQUEST_BYTES;
    ensure(
      sha256(await readRegular(
        target,
        maximum,
        "p0r_transport_stage_outer_manifest_file_unsafe",
      )) === expectedSha256,
      "p0r_transport_stage_outer_manifest_file_mismatch",
    );
  }
}

async function verifyDispatchEnvelope(path, request) {
  const bytes = await readRegular(
    path,
    MAX_REQUEST_BYTES,
    "p0r_transport_stage_dispatch_envelope_unsafe",
  );
  const envelope = parseJson(
    bytes,
    "p0r_transport_stage_dispatch_envelope_invalid",
  );
  ensure(
    envelope.schemaVersion === "market-radar-production-dispatch.v1" &&
      envelope.dispatchId === request.dispatchId &&
      envelope.packageId === request.packageId &&
      envelope.targetCommit === request.sourceCommit &&
      envelope.sourceRef === request.sourceRef &&
      envelope.stagingDirectory === request.stagingDirectory &&
      envelope.bundleSha256 === request.transportBundleSha256 &&
      envelope.entrypointPath === P0R_TRANSPORT_STAGE_ENTRYPOINT &&
      envelope.launchSuccessMarker === request.launchSuccessMarker &&
      envelope.runtimeMaxSeconds === request.dispatchRuntimeMaxSeconds &&
      envelope.transportContainsSecrets === false &&
      envelope.transportMethod === "signed_git_bundle",
    "p0r_transport_stage_dispatch_envelope_mismatch",
  );
}

async function syncDirectory(path) {
  const handle = await open(path, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function verifyStagedMember(path, {
  expectedBytes,
  expectedMode,
  expectedUid,
}) {
  const facts = await lstat(path);
  ensure(
    facts.isFile() &&
      !facts.isSymbolicLink() &&
      (facts.mode & 0o777) === expectedMode &&
      (expectedUid === null || facts.uid === expectedUid),
    "p0r_transport_stage_written_member_metadata_mismatch",
  );
  const bytes = await readRegular(
    path,
    MAX_INNER_TAR_BYTES,
    "p0r_transport_stage_written_member_unsafe",
  );
  ensure(
    bytes.length === expectedBytes.length &&
      sha256(bytes) === sha256(expectedBytes),
    "p0r_transport_stage_written_member_mismatch",
  );
}

export async function stageP0RTransport({
  bundleMarkerPath,
  dispatchEnvelopePath,
  innerBundlePath,
  manifestPath,
  now = new Date(),
  policy = DEFAULT_P0R_TRANSPORT_STAGE_POLICY,
  request,
  sourceRoot,
}) {
  validateP0RTransportStageRequest(request, { now, policy });
  await ensureRealDirectory(request.stagingDirectory);
  const actualSourceRoot = await realpath(sourceRoot);
  const actualStagingRoot = await realpath(policy.stagingRoot);
  ensure(
    actualSourceRoot === await realpath(request.stagingDirectory) &&
      dirname(actualSourceRoot) === actualStagingRoot &&
      basename(actualSourceRoot).startsWith(policy.stagingPrefix),
    "p0r_transport_stage_source_root_invalid",
  );
  const marker = (
    await readRegular(
      bundleMarkerPath,
      256,
      "p0r_transport_stage_bundle_marker_unsafe",
    )
  ).toString("utf8").trim();
  ensure(
    marker === request.transportBundleSha256,
    "p0r_transport_stage_bundle_marker_mismatch",
  );
  await verifyDispatchEnvelope(dispatchEnvelopePath, request);
  const innerBundleBytes = await readRegular(
    innerBundlePath,
    MAX_INNER_BUNDLE_BYTES,
    "p0r_transport_stage_inner_bundle_unsafe",
  );
  ensure(
    innerBundleBytes.length === request.innerTransportBundleBytes &&
      sha256(innerBundleBytes) === request.innerTransportBundleSha256,
    "p0r_transport_stage_inner_bundle_identity_mismatch",
  );
  await verifyOuterManifest({
    innerBundleBytes,
    manifestPath,
    request,
    sourceRoot: actualSourceRoot,
  });
  const inspected = await inspectP0RTransportArchiveBytes(innerBundleBytes);
  ensure(
    inspected.archiveSha256 === request.innerTransportBundleSha256 &&
      inspected.archiveSizeBytes === request.innerTransportBundleBytes &&
      inspected.manifestSha256 ===
        request.expectedTransportManifestSha256 &&
      inspected.manifestDigest ===
        request.expectedTransportManifestDigest &&
      inspected.memberCount === request.expectedInnerMemberCount &&
      inspected.planDigest === request.expectedP0RPlanDigest &&
      inspected.runId === request.expectedP0RRunId &&
      inspected.sourceCommit === request.expectedP0RSourceCommit,
    "p0r_transport_stage_inner_contract_mismatch",
  );

  await ensureDeliveryRoot(policy);
  const target = resolve(request.deliveryTargetDirectory);
  await assertAbsent(
    target,
    "p0r_transport_stage_target_already_exists",
  );
  const incoming = join(
    resolve(policy.deliveryRoot),
    `.incoming-${request.expectedP0RRunId}-${request.dispatchId}`,
  );
  await assertAbsent(
    incoming,
    "p0r_transport_stage_incoming_already_exists",
  );
  let renamed = false;
  const expectedUid =
    typeof process.getuid === "function" ? process.getuid() : null;
  try {
    await mkdir(incoming, { mode: 0o700 });
    for (const name of P0R_TRANSPORT_MEMBER_NAMES) {
      const entry = inspected.entries.get(name);
      const path = join(incoming, name);
      await writeFile(path, entry.bytes, {
        flag: "wx",
        mode: P0R_TRANSPORT_MEMBER_MODES[name],
      });
      await chmod(path, P0R_TRANSPORT_MEMBER_MODES[name]);
      await verifyStagedMember(path, {
        expectedBytes: entry.bytes,
        expectedMode: P0R_TRANSPORT_MEMBER_MODES[name],
        expectedUid,
      });
    }
    await chmod(incoming, 0o700);
    await syncDirectory(incoming);
    await rename(incoming, target);
    renamed = true;
    await syncDirectory(policy.deliveryRoot);
    ensure(
      await realpath(target) === target,
      "p0r_transport_stage_target_realpath_mismatch",
    );
    const targetFacts = await lstat(target);
    ensure(
      targetFacts.isDirectory() &&
        !targetFacts.isSymbolicLink() &&
        (targetFacts.mode & 0o777) === 0o700 &&
        (expectedUid === null || targetFacts.uid === expectedUid),
      "p0r_transport_stage_target_metadata_mismatch",
    );
    for (const name of P0R_TRANSPORT_MEMBER_NAMES) {
      await verifyStagedMember(join(target, name), {
        expectedBytes: inspected.entries.get(name).bytes,
        expectedMode: P0R_TRANSPORT_MEMBER_MODES[name],
        expectedUid,
      });
    }
    return Object.freeze({
      innerTransportBundleSha256: inspected.archiveSha256,
      memberCount: inspected.memberCount,
      planDigest: inspected.planDigest,
      runId: inspected.runId,
      sourceCommit: inspected.sourceCommit,
      status: P0R_TRANSPORT_STAGE_SUCCESS_MARKER,
      target,
      transportManifestDigest: inspected.manifestDigest,
      transportManifestSha256: inspected.manifestSha256,
    });
  } catch (error) {
    if (!renamed) {
      await rm(incoming, { recursive: true, force: true }).catch(() => {});
    }
    throw error;
  }
}

async function readCanonicalRequest(path) {
  const bytes = await readRegular(
    path,
    MAX_REQUEST_BYTES,
    "p0r_transport_stage_request_unsafe",
  );
  const request = parseJson(
    bytes,
    "p0r_transport_stage_request_json_invalid",
  );
  ensure(
    bytes.toString("utf8") === canonicalJson(request),
    "p0r_transport_stage_request_not_canonical",
  );
  return request;
}

async function main() {
  ensure(
    process.argv.length === 3 && process.argv[2] === "stage",
    "p0r_transport_stage_command_invalid",
  );
  const runnerDirectory = dirname(fileURLToPath(import.meta.url));
  const sourceRoot = resolve(runnerDirectory, "../../..");
  const requestPath = resolve(
    process.env.REQUEST_FILE ?? join(sourceRoot, "approval-request.json"),
  );
  const result = await stageP0RTransport({
    bundleMarkerPath: join(sourceRoot, ".transport-bundle.sha256"),
    dispatchEnvelopePath: join(sourceRoot, ".dispatch.json"),
    innerBundlePath: join(sourceRoot, P0R_TRANSPORT_STAGE_INNER_BUNDLE),
    manifestPath: join(sourceRoot, P0R_TRANSPORT_STAGE_MANIFEST),
    request: await readCanonicalRequest(requestPath),
    sourceRoot,
  });
  process.stdout.write(canonicalJson(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(canonicalJson({
      reason:
        error instanceof Error
          ? error.message
          : "p0r_transport_stage_unexpected_error",
      status: "BLOCKED",
    }));
    process.exitCode = 1;
  });
}
