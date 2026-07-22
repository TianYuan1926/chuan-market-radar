#!/usr/bin/env node

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  ACCEPTANCE_ENTRYPOINT,
  ACCEPTANCE_MANIFEST,
  ACCEPTANCE_MANIFEST_SCHEMA,
  ACCEPTANCE_PACKAGE_ID,
  ACCEPTANCE_REQUEST_SCHEMA,
  ACCEPTANCE_RUNNER,
  ACCEPTANCE_SUCCESS_MARKER,
  DEFAULT_ACCEPTANCE_POLICY,
  canonicalJson,
  sha256,
  validateAcceptanceRequest,
} from "./production-dispatch-acceptance.mjs";

const execFileAsync = promisify(execFile);
const SOURCE_DATE_EPOCH = 946_684_800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

async function git(root, args, options = {}) {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
  return typeof stdout === "string" ? stdout.trim() : stdout;
}

async function committedFile(root, sourceCommit, path) {
  const { stdout } = await execFileAsync("git", [
    "-C", root, "show", `${sourceCommit}:${path}`,
  ], { encoding: null, maxBuffer: 4 * 1024 * 1024 });
  return stdout;
}

async function writePayloadFile(payloadRoot, path, bytes, mode) {
  const target = join(payloadRoot, path);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, bytes, { mode });
  await chmod(target, mode);
  await utimes(target, FIXED_TIME, FIXED_TIME);
}

export async function buildAcceptanceBundle({
  dispatchId,
  expectedContainerIds,
  expectedProductionHead,
  expiresAt,
  issuedAt,
  outputDirectory,
  revocationEpoch,
  root = process.cwd(),
  runnerUnitName,
  sourceCommit,
  sourceRef,
}) {
  const repository = resolve(root);
  const output = resolve(outputDirectory);
  ensure(output !== repository && !output.startsWith(`${repository}${sep}`),
    "acceptance_output_inside_worktree");
  await execFileAsync("git", ["-C", repository, "cat-file", "-e", `${sourceCommit}^{commit}`]);
  const sourceFiles = {};
  for (const path of [ACCEPTANCE_ENTRYPOINT, ACCEPTANCE_RUNNER]) {
    sourceFiles[path] = await committedFile(repository, sourceCommit, path);
  }
  const manifest = {
    archiveFormat: "ustar+gzip-n",
    containsSecrets: false,
    files: Object.fromEntries(Object.entries(sourceFiles).map(([path, bytes]) => [path, sha256(bytes)])),
    mutationScope: "dispatch_state_staging_and_evidence_only",
    packageId: ACCEPTANCE_PACKAGE_ID,
    schemaVersion: ACCEPTANCE_MANIFEST_SCHEMA,
    sourceCommit,
    sourceDateEpoch: SOURCE_DATE_EPOCH,
  };
  const manifestBytes = Buffer.from(canonicalJson(manifest));
  const temporary = await mkdtemp(join(tmpdir(), "market-radar-dispatch-acceptance-"));
  const payloadRoot = join(temporary, "payload");
  try {
    await mkdir(payloadRoot, { recursive: true, mode: 0o700 });
    await writePayloadFile(payloadRoot, ACCEPTANCE_ENTRYPOINT,
      sourceFiles[ACCEPTANCE_ENTRYPOINT], 0o700);
    await writePayloadFile(payloadRoot, ACCEPTANCE_RUNNER, sourceFiles[ACCEPTANCE_RUNNER], 0o600);
    await writePayloadFile(payloadRoot, ACCEPTANCE_MANIFEST, manifestBytes, 0o600);
    const archivePath = join(temporary, "payload.tar");
    const archiveEntries = [ACCEPTANCE_ENTRYPOINT, ACCEPTANCE_MANIFEST, ACCEPTANCE_RUNNER].sort();
    await execFileAsync("tar", [
      "-cf", archivePath,
      "--format=ustar",
      "--uid=0",
      "--gid=0",
      "--numeric-owner",
      "-C", payloadRoot,
      ...archiveEntries,
    ], { env: { ...process.env, COPYFILE_DISABLE: "1", LC_ALL: "C" } });
    const { stdout: archiveBytes } = await execFileAsync("gzip", ["-n", "-9", "-c", archivePath], {
      encoding: null,
      maxBuffer: 8 * 1024 * 1024,
    });
    ensure(Buffer.isBuffer(archiveBytes), "acceptance_archive_not_binary");
    const bundleSha256 = sha256(archiveBytes);
    const stagingDirectory = join(
      DEFAULT_ACCEPTANCE_POLICY.stagingRoot,
      `g0-fixed-dispatch-acceptance-${dispatchId}`,
    );
    const request = {
      applicationMutationAllowed: false,
      approvalExpiresAt: expiresAt,
      approvalIssuedAt: issuedAt,
      artifactManifestSha256: sha256(manifestBytes),
      automaticRollbackRequired: true,
      databaseMutationAllowed: false,
      dispatchId,
      dispatchStateRoot: DEFAULT_ACCEPTANCE_POLICY.dispatchStateRoot,
      expectedContainerCount: DEFAULT_ACCEPTANCE_POLICY.expectedContainerCount,
      expectedContainerIds: [...expectedContainerIds].sort(),
      expectedHealth: {
        level: "ready",
        persistenceDatabaseStatus: "ready",
        scanFreshness: "fresh",
        scanStatus: "ready",
      },
      expectedProductionHead,
      expectedRedisContainer: DEFAULT_ACCEPTANCE_POLICY.expectedRedisContainer,
      expectedTimerUnit: DEFAULT_ACCEPTANCE_POLICY.expectedTimerUnit,
      launchSuccessMarker: ACCEPTANCE_SUCCESS_MARKER,
      maxExecutions: 1,
      packageId: ACCEPTANCE_PACKAGE_ID,
      productionMutationScope: "dispatch_state_staging_and_evidence_only",
      productionWorktree: DEFAULT_ACCEPTANCE_POLICY.productionWorktree,
      redisMutationAllowed: false,
      resultPath: join(
        DEFAULT_ACCEPTANCE_POLICY.dispatchStateRoot,
        "acceptance",
        `${dispatchId}.json`,
      ),
      revocationEpoch,
      runnerUnitName,
      schemaVersion: ACCEPTANCE_REQUEST_SCHEMA,
      sessionIndependentExecutionRequired: true,
      sourceCommit,
      sourceRef,
      stagingDirectory,
      temporaryStagingCleanupRequired: true,
      transportBundleSha256: bundleSha256,
      transportContainsSecrets: false,
      transportMethod: "signed_git_bundle",
      workerMutationAllowed: false,
    };
    validateAcceptanceRequest(request, { now: new Date(issuedAt) });
    await mkdir(output, { mode: 0o700 });
    await writeFile(join(output, "bundle.tar.gz"), archiveBytes, { mode: 0o600 });
    await writeFile(join(output, "approval-request.json"), canonicalJson(request), { mode: 0o600 });
    const result = {
      approvalRequestSha256: sha256(canonicalJson(request)),
      artifactManifestSha256: request.artifactManifestSha256,
      bundleBytes: archiveBytes.length,
      bundleSha256,
      containsSecrets: false,
      dispatchId,
      outputDirectory: output,
      packageId: ACCEPTANCE_PACKAGE_ID,
      sourceCommit,
      status: "PASS_FIXED_DISPATCH_ACCEPTANCE_BUNDLE_BUILT",
    };
    await writeFile(join(output, "build-result.json"), canonicalJson(result), { mode: 0o600 });
    return { request, result };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    ensure(key?.startsWith("--") && value && !value.startsWith("--"),
      "acceptance_bundle_argument_invalid");
    options[key.slice(2)] = value;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());
  const sourceCommit = await git(root, ["rev-parse", "HEAD"]);
  ensure((await git(root, ["status", "--porcelain=v1", "--untracked-files=all"])).length === 0,
    "acceptance_source_worktree_not_clean");
  const remote = await git(root, ["ls-remote", "origin", options["source-ref"]]);
  ensure(remote.split(/\s+/u)[0] === sourceCommit, "acceptance_source_commit_not_pushed");
  const expectedContainerIds = options["expected-container-ids"]?.split(",").filter(Boolean) ?? [];
  const { result } = await buildAcceptanceBundle({
    dispatchId: options["dispatch-id"],
    expectedContainerIds,
    expectedProductionHead: options["expected-production-head"],
    expiresAt: options["expires-at"],
    issuedAt: options["issued-at"],
    outputDirectory: options["output-directory"],
    revocationEpoch: Number(options["revocation-epoch"]),
    root,
    runnerUnitName: options["runner-unit-name"],
    sourceCommit,
    sourceRef: options["source-ref"],
  });
  process.stdout.write(canonicalJson(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(canonicalJson({
      reason: error?.reason ?? error?.message ?? "acceptance_bundle_unexpected_error",
      status: "FAIL_FIXED_DISPATCH_ACCEPTANCE_BUNDLE",
    }));
    process.exitCode = 1;
  });
}
