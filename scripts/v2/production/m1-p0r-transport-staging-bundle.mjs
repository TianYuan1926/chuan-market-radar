#!/usr/bin/env node

import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { writeDeterministicUstar } from "../lib/deterministic-ustar.mjs";
import {
  DEFAULT_P0R_TRANSPORT_STAGE_POLICY,
  P0R_TRANSPORT_STAGE_ENTRYPOINT,
  P0R_TRANSPORT_STAGE_INNER_BUNDLE,
  P0R_TRANSPORT_STAGE_MANIFEST,
  P0R_TRANSPORT_STAGE_MANIFEST_SCHEMA,
  P0R_TRANSPORT_STAGE_OUTER_MEMBER_MODES,
  P0R_TRANSPORT_STAGE_PACKAGE_ID,
  P0R_TRANSPORT_STAGE_REQUEST_SCHEMA,
  P0R_TRANSPORT_STAGE_RUNNER,
  P0R_TRANSPORT_STAGE_RUNTIME_MAX_SECONDS,
  P0R_TRANSPORT_STAGE_SUCCESS_MARKER,
  P0R_TRANSPORT_STAGE_USTAR_LIBRARY,
  canonicalJson,
  inspectP0RTransportArchiveBytes,
  sha256,
  validateP0RTransportStageRequest,
} from "./m1-p0r-transport-staging.mjs";

const execFileAsync = promisify(execFile);
const SOURCE_DATE_EPOCH = 946_684_800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);
const COMMIT = /^[a-f0-9]{40}$/u;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_INNER_BUNDLE_BYTES = 16 * 1024 * 1024;

const SOURCE_BOUND_FILES = Object.freeze([
  P0R_TRANSPORT_STAGE_ENTRYPOINT,
  P0R_TRANSPORT_STAGE_RUNNER,
  P0R_TRANSPORT_STAGE_USTAR_LIBRARY,
]);

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

async function git(root, args, options = {}) {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  return typeof stdout === "string" ? stdout.trim() : stdout;
}

async function committedFile(root, sourceCommit, path) {
  const bytes = await git(
    root,
    ["show", `${sourceCommit}:${path}`],
    { encoding: null },
  );
  ensure(Buffer.isBuffer(bytes), "p0r_transport_stage_source_not_binary");
  return bytes;
}

async function writePayloadFile(root, path, bytes, mode) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, bytes, { flag: "wx", mode });
  await chmod(target, mode);
  await utimes(target, FIXED_TIME, FIXED_TIME);
}

async function readBoundedNoFollow(path, maximumBytes, reason) {
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

export function buildP0RTransportStageApprovalRequest({
  artifactManifestSha256,
  dispatchId,
  expiresAt,
  inner,
  issuedAt,
  outerBundleSha256,
  revocationEpoch,
  runnerUnitName,
  sourceCommit,
  sourceRef,
  sourceTree,
  policy = DEFAULT_P0R_TRANSPORT_STAGE_POLICY,
}) {
  const request = {
    applicationMutationAllowed: false,
    approvalExpiresAt: expiresAt,
    approvalIssuedAt: issuedAt,
    artifactManifestSha256,
    automaticRollbackRequired: true,
    containsRestrictedDestinationMetadata: true,
    credentialMaterialAllowed: false,
    databaseMutationAllowed: false,
    deliveryRoot: policy.deliveryRoot,
    deliveryTargetDirectory: join(policy.deliveryRoot, inner.runId),
    dispatchId,
    dispatchRuntimeMaxSeconds:
      P0R_TRANSPORT_STAGE_RUNTIME_MAX_SECONDS,
    dispatchStateRoot: policy.dispatchStateRoot,
    expectedInnerMemberCount: inner.memberCount,
    expectedP0RPlanDigest: inner.planDigest,
    expectedP0RRunId: inner.runId,
    expectedP0RSourceCommit: inner.sourceCommit,
    expectedTimerUnit: policy.expectedTimerUnit,
    expectedTransportManifestDigest: inner.manifestDigest,
    expectedTransportManifestSha256: inner.manifestSha256,
    innerTransportBundleBytes: inner.archiveSizeBytes,
    innerTransportBundleSha256: inner.archiveSha256,
    launchSuccessMarker: P0R_TRANSPORT_STAGE_SUCCESS_MARKER,
    maxExecutions: 1,
    packageId: P0R_TRANSPORT_STAGE_PACKAGE_ID,
    p0rRecoveryExecutionAllowed: false,
    productionDatabaseMutationAllowed: false,
    productionMutationScope:
      "dispatch_staging_and_exact_p0r_transport_delivery_only",
    productionRepositoryMutationAllowed: false,
    productionServiceMutationAllowed: false,
    redisMutationAllowed: false,
    revocationEpoch,
    runnerUnitName,
    schemaVersion: P0R_TRANSPORT_STAGE_REQUEST_SCHEMA,
    sessionIndependentExecutionRequired: true,
    sourceCommit,
    sourceRef,
    sourceTree,
    stagingDirectory: join(
      policy.stagingRoot,
      `${policy.stagingPrefix}${dispatchId}`,
    ),
    temporaryStagingCleanupRequired: true,
    transportBundleSha256: outerBundleSha256,
    transportContainsSecrets: false,
    transportMethod: "signed_git_bundle",
    workerMutationAllowed: false,
  };
  validateP0RTransportStageRequest(request, {
    now: new Date(issuedAt),
    policy,
  });
  return request;
}

export async function buildP0RTransportStageBundle({
  approval,
  innerBundlePath,
  outputDirectory,
  policy = DEFAULT_P0R_TRANSPORT_STAGE_POLICY,
  root = process.cwd(),
  sourceCommit,
  sourceTree,
  verifySourceBinding = true,
}) {
  const repository = resolve(root);
  const output = resolve(outputDirectory);
  ensure(COMMIT.test(sourceCommit), "p0r_transport_stage_source_commit_invalid");
  ensure(COMMIT.test(sourceTree), "p0r_transport_stage_source_tree_invalid");
  ensure(
    output !== repository && !output.startsWith(`${repository}${sep}`),
    "p0r_transport_stage_output_inside_worktree",
  );
  if (verifySourceBinding) {
    ensure(
      await git(repository, ["rev-parse", `${sourceCommit}^{tree}`]) ===
        sourceTree,
      "p0r_transport_stage_source_tree_mismatch",
    );
  }
  await access(output, fsConstants.F_OK).then(
    () => {
      throw new Error("p0r_transport_stage_output_exists");
    },
    (error) => {
      if (error?.code !== "ENOENT") throw error;
    },
  );

  const innerBundleBytes = await readBoundedNoFollow(
    innerBundlePath,
    MAX_INNER_BUNDLE_BYTES,
    "p0r_transport_stage_inner_bundle_unsafe",
  );
  const inner = await inspectP0RTransportArchiveBytes(innerBundleBytes);
  const sourceFiles = {};
  for (const path of SOURCE_BOUND_FILES) {
    sourceFiles[path] = verifySourceBinding
      ? await committedFile(repository, sourceCommit, path)
      : await readFile(join(repository, path));
  }
  const manifest = {
    archiveFormat: "ustar+gzip-n",
    containsRestrictedDestinationMetadata: true,
    containsSecrets: false,
    deliveryOnly: true,
    files: {
      [P0R_TRANSPORT_STAGE_ENTRYPOINT]:
        sha256(sourceFiles[P0R_TRANSPORT_STAGE_ENTRYPOINT]),
      [P0R_TRANSPORT_STAGE_INNER_BUNDLE]: inner.archiveSha256,
      [P0R_TRANSPORT_STAGE_RUNNER]:
        sha256(sourceFiles[P0R_TRANSPORT_STAGE_RUNNER]),
      [P0R_TRANSPORT_STAGE_USTAR_LIBRARY]:
        sha256(sourceFiles[P0R_TRANSPORT_STAGE_USTAR_LIBRARY]),
    },
    innerTransportBundleBytes: inner.archiveSizeBytes,
    innerTransportBundleSha256: inner.archiveSha256,
    innerTransportManifestDigest: inner.manifestDigest,
    innerTransportManifestSha256: inner.manifestSha256,
    packageId: P0R_TRANSPORT_STAGE_PACKAGE_ID,
    p0rRecoveryExecutionAllowed: false,
    productionDatabaseMutationAllowed: false,
    productionRepositoryMutationAllowed: false,
    productionServiceMutationAllowed: false,
    schemaVersion: P0R_TRANSPORT_STAGE_MANIFEST_SCHEMA,
    sourceCommit,
    sourceDateEpoch: SOURCE_DATE_EPOCH,
    sourceTree,
  };
  const manifestBytes = Buffer.from(canonicalJson(manifest));
  const temporary = await mkdtemp(
    join(tmpdir(), "p0r-transport-stage-bundle-"),
  );
  const payload = join(temporary, "payload");
  try {
    await mkdir(payload, { mode: 0o700 });
    await writePayloadFile(
      payload,
      P0R_TRANSPORT_STAGE_ENTRYPOINT,
      sourceFiles[P0R_TRANSPORT_STAGE_ENTRYPOINT],
      P0R_TRANSPORT_STAGE_OUTER_MEMBER_MODES[
        P0R_TRANSPORT_STAGE_ENTRYPOINT
      ],
    );
    await writePayloadFile(
      payload,
      P0R_TRANSPORT_STAGE_RUNNER,
      sourceFiles[P0R_TRANSPORT_STAGE_RUNNER],
      P0R_TRANSPORT_STAGE_OUTER_MEMBER_MODES[
        P0R_TRANSPORT_STAGE_RUNNER
      ],
    );
    await writePayloadFile(
      payload,
      P0R_TRANSPORT_STAGE_USTAR_LIBRARY,
      sourceFiles[P0R_TRANSPORT_STAGE_USTAR_LIBRARY],
      P0R_TRANSPORT_STAGE_OUTER_MEMBER_MODES[
        P0R_TRANSPORT_STAGE_USTAR_LIBRARY
      ],
    );
    await writePayloadFile(
      payload,
      P0R_TRANSPORT_STAGE_INNER_BUNDLE,
      innerBundleBytes,
      P0R_TRANSPORT_STAGE_OUTER_MEMBER_MODES[
        P0R_TRANSPORT_STAGE_INNER_BUNDLE
      ],
    );
    await writePayloadFile(
      payload,
      P0R_TRANSPORT_STAGE_MANIFEST,
      manifestBytes,
      P0R_TRANSPORT_STAGE_OUTER_MEMBER_MODES[
        P0R_TRANSPORT_STAGE_MANIFEST
      ],
    );
    const archivePath = join(temporary, "payload.tar");
    await writeDeterministicUstar({
      archivePath,
      entries: Object.keys(P0R_TRANSPORT_STAGE_OUTER_MEMBER_MODES).sort(),
      root: payload,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
    });
    const { stdout: compressed } = await execFileAsync(
      "gzip",
      ["-n", "-9", "-c", archivePath],
      { encoding: null, maxBuffer: MAX_ARCHIVE_BYTES },
    );
    ensure(
      Buffer.isBuffer(compressed) &&
        compressed.length > 0 &&
        compressed.length <= MAX_ARCHIVE_BYTES,
      "p0r_transport_stage_outer_bundle_invalid",
    );
    const request = buildP0RTransportStageApprovalRequest({
      ...approval,
      artifactManifestSha256: sha256(manifestBytes),
      inner,
      outerBundleSha256: sha256(compressed),
      policy,
      sourceCommit,
      sourceTree,
    });
    await mkdir(output, { mode: 0o700 });
    await writeFile(join(output, "bundle.tar.gz"), compressed, {
      flag: "wx",
      mode: 0o600,
    });
    await writeFile(
      join(output, "approval-request.json"),
      canonicalJson(request),
      { flag: "wx", mode: 0o600 },
    );
    const result = {
      approvalRequestSha256: sha256(canonicalJson(request)),
      bundleBytes: compressed.length,
      bundleSha256: sha256(compressed),
      containsRestrictedDestinationMetadata: true,
      containsSecrets: false,
      deliveryTargetDirectory: request.deliveryTargetDirectory,
      dispatchId: request.dispatchId,
      innerTransportBundleBytes: inner.archiveSizeBytes,
      innerTransportBundleSha256: inner.archiveSha256,
      outputDirectory: output,
      packageId: request.packageId,
      p0rRecoveryExecutionAllowed: false,
      sourceCommit,
      sourceTree,
      status: "PASS_P0R_TRANSPORT_STAGE_BUNDLE_BUILT",
    };
    await writeFile(
      join(output, "build-result.json"),
      canonicalJson(result),
      { flag: "wx", mode: 0o600 },
    );
    return { manifest, request, result };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function parseArguments(argv) {
  ensure(
    argv.length % 2 === 0,
    "p0r_transport_stage_bundle_arguments_invalid",
  );
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    ensure(
      /^--[a-z][a-z0-9-]*$/u.test(key ?? "") &&
        typeof value === "string" &&
        !value.startsWith("--") &&
        options[key.slice(2)] === undefined,
      "p0r_transport_stage_bundle_arguments_invalid",
    );
    options[key.slice(2)] = value;
  }
  return options;
}

function required(options, key) {
  ensure(
    typeof options[key] === "string" && options[key].length > 0,
    `p0r_transport_stage_bundle_option_missing:${key}`,
  );
  return options[key];
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());
  ensure(
    (await git(root, ["status", "--porcelain=v1"])) === "",
    "p0r_transport_stage_repository_dirty",
  );
  const sourceCommit = await git(root, ["rev-parse", "HEAD"]);
  const sourceTree = await git(root, ["rev-parse", `${sourceCommit}^{tree}`]);
  const sourceRef = required(options, "source-ref");
  const remote = await git(root, ["ls-remote", "origin", sourceRef]);
  ensure(
    remote.split(/\s+/u)[0] === sourceCommit,
    "p0r_transport_stage_source_not_exact_remote_head",
  );
  const built = await buildP0RTransportStageBundle({
    approval: {
      dispatchId: required(options, "dispatch-id"),
      expiresAt: required(options, "expires-at"),
      issuedAt: required(options, "issued-at"),
      revocationEpoch: Number(required(options, "revocation-epoch")),
      runnerUnitName: required(options, "runner-unit-name"),
      sourceRef,
    },
    innerBundlePath: required(options, "inner-bundle"),
    outputDirectory: required(options, "output-directory"),
    root,
    sourceCommit,
    sourceTree,
  });
  process.stdout.write(canonicalJson(built.result));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(canonicalJson({
      reason:
        error instanceof Error
          ? error.message
          : "p0r_transport_stage_bundle_unexpected_error",
      status: "BLOCKED",
    }));
    process.exitCode = 1;
  });
}
