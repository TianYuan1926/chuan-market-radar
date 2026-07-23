#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  DEFAULT_LIVE_RUNTIME_ADAPTER_POLICY,
  LIVE_RUNTIME_ADAPTER_ENTRYPOINT,
  LIVE_RUNTIME_ADAPTER_MANIFEST,
  LIVE_RUNTIME_ADAPTER_MANIFEST_SCHEMA,
  LIVE_RUNTIME_ADAPTER_PACKAGE_ID,
  LIVE_RUNTIME_ADAPTER_REQUEST_SCHEMA,
  LIVE_RUNTIME_ADAPTER_RUNNER,
  LIVE_RUNTIME_ADAPTER_RUNTIME_ENTRY,
  LIVE_RUNTIME_ADAPTER_SAFETY_RUNNER,
  LIVE_RUNTIME_ADAPTER_SUCCESS_MARKER,
  LIVE_RUNTIME_ADAPTER_ZOD_RUNTIME_TREE_DIGEST,
  canonicalJson,
  sha256,
  validateLiveRuntimeAdapterRequest,
} from "./m1-runtime-adapter-live-runner.mjs";

const execFileAsync = promisify(execFile);
const SOURCE_DATE_EPOCH = 946_684_800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);
const COMMIT = /^[a-f0-9]{40}$/u;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_FILE_BYTES = 32 * 1024 * 1024;

const SOURCE_BOUND_FILES = Object.freeze([
  LIVE_RUNTIME_ADAPTER_ENTRYPOINT,
  LIVE_RUNTIME_ADAPTER_RUNNER,
  LIVE_RUNTIME_ADAPTER_SAFETY_RUNNER,
  "package-lock.json",
  "package.json",
  "tsconfig.json",
  "tsconfig.m1-runtime-adapter-live-package.json",
]);

const CRITICAL_COMPILED_RUNTIME_FILES = Object.freeze([
  "v2/modules/collector/runtime-adapter-live.js",
  "v2/modules/collector/runtime-adapter-profile.js",
  "v2/modules/multi-asset-universe/listing-history-runtime.js",
  "v2/modules/source-capability/adapters/four-venue-capability-registry.js",
  "v2/modules/source-conformance/adapters/exact-source-conformance-runner.js",
  "v2/modules/source-conformance/source-conformance-contract.js",
  "v2/modules/universe/stable-artifact.js",
  "v2/runtime-schema/primitives.js",
]);

async function git(root, args, options = {}) {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  return typeof stdout === "string" ? stdout.trim() : stdout;
}

async function requireRegular(path, reason, maximumBytes = MAX_FILE_BYTES) {
  const facts = await lstat(path);
  assert.equal(facts.isFile(), true, reason);
  assert.equal(facts.isSymbolicLink(), false, reason);
  assert.ok(facts.size > 0 && facts.size <= maximumBytes, reason);
  return facts;
}

async function listFiles(root, predicate = () => true, directory = root) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...await listFiles(root, predicate, path));
    } else {
      assert.equal(entry.isFile(), true, "package source contains a special file");
      const relativePath = relative(root, path).split(sep).join("/");
      if (predicate(relativePath)) output.push(relativePath);
    }
  }
  return output.sort();
}

async function writePayloadFile(payloadRoot, path, bytes, mode) {
  const target = join(payloadRoot, path);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, bytes, { flag: "wx", mode });
  await chmod(target, mode);
  await utimes(target, FIXED_TIME, FIXED_TIME);
}

async function assertCommittedFile(root, sourceCommit, path) {
  const working = await readFile(join(root, path));
  const committed = await git(root, ["show", `${sourceCommit}:${path}`], {
    encoding: null,
  });
  assert.ok(Buffer.isBuffer(committed));
  assert.equal(
    sha256(working),
    sha256(committed),
    `${path} differs from the bound source commit`,
  );
}

async function compileRuntime(root, outputRoot) {
  const tsc = await realpath(join(root, "node_modules/.bin/tsc"));
  await requireRegular(tsc, "local TypeScript compiler is unavailable");
  await execFileAsync(tsc, [
    "-p",
    join(root, "tsconfig.m1-runtime-adapter-live-package.json"),
    "--outDir",
    outputRoot,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
  });
  const files = await listFiles(outputRoot, (path) => path.endsWith(".js"));
  assert.ok(
    files.length >= 15 && files.length <= 40,
    "compiled runtime closure drifted",
  );
  for (const path of CRITICAL_COMPILED_RUNTIME_FILES) {
    assert.ok(files.includes(path), `compiled runtime file is absent: ${path}`);
    await requireRegular(join(outputRoot, path), `compiled file unsafe: ${path}`);
  }
  return files;
}

async function loadRuntimeConstants(compiledRoot, repositoryRoot) {
  const script = [
    "const runtime=require(process.argv[1]);",
    "const source=require(process.argv[2]);",
    "const registry=require(process.argv[3]);",
    "process.stdout.write(JSON.stringify({",
    "blockedProbeIds:runtime.M1_RUNTIME_ADAPTER_BLOCKED_PROBE_IDS,",
    "probePlanDigest:source.M1_EXACT_SOURCE_PROBE_PLAN_DIGEST,",
    "registryDigest:registry.M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest",
    "}));",
  ].join("");
  const { stdout } = await execFileAsync(process.execPath, [
    "-e",
    script,
    join(compiledRoot, LIVE_RUNTIME_ADAPTER_RUNTIME_ENTRY.replace(/^runtime\//u, "")),
    join(
      compiledRoot,
      "v2/modules/source-conformance/adapters/exact-source-conformance-runner.js",
    ),
    join(
      compiledRoot,
      "v2/modules/source-capability/adapters/four-venue-capability-registry.js",
    ),
  ], {
    encoding: "utf8",
    env: {
      HOME: process.env.HOME ?? tmpdir(),
      LANG: "C",
      LC_ALL: "C",
      NODE_PATH: join(repositoryRoot, "node_modules"),
      PATH: dirname(process.execPath),
    },
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  });
  const constants = JSON.parse(stdout);
  assert.deepEqual(constants.blockedProbeIds, ["BINANCE_SPOT_CATALOG"]);
  assert.match(constants.probePlanDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.match(constants.registryDigest, /^sha256:[a-f0-9]{64}$/u);
  return constants;
}

async function loadZodFiles(root) {
  const zodRoot = join(root, "node_modules/zod");
  const packageJsonPath = join(zodRoot, "package.json");
  const licensePath = join(zodRoot, "LICENSE");
  await requireRegular(packageJsonPath, "zod package metadata is absent");
  await requireRegular(licensePath, "zod license is absent");
  const packageMetadata = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const packageLockBytes = await readFile(join(root, "package-lock.json"));
  const packageLock = JSON.parse(packageLockBytes.toString("utf8"));
  const locked = packageLock.packages?.["node_modules/zod"];
  assert.equal(packageMetadata.version, locked?.version, "zod lock version drift");
  assert.equal(packageMetadata.version, "4.4.3", "zod version is not frozen");
  const paths = await listFiles(
    zodRoot,
    (path) =>
      path.endsWith(".cjs") || path === "package.json" || path === "LICENSE",
  );
  assert.ok(
    paths.length >= 100 && paths.length <= 150,
    "zod runtime closure drifted",
  );
  const fileHashes = {};
  for (const path of paths) {
    fileHashes[path] = sha256(await readFile(join(zodRoot, path)));
  }
  assert.equal(
    `sha256:${sha256(canonicalJson(fileHashes))}`,
    LIVE_RUNTIME_ADAPTER_ZOD_RUNTIME_TREE_DIGEST,
    "zod runtime file tree digest drifted",
  );
  return {
    files: paths.map((path) => ({
      bytesPath: join(zodRoot, path),
      bundlePath: `runtime/node_modules/zod/${path}`,
    })),
    packageLockSha256: sha256(packageLockBytes),
    version: packageMetadata.version,
  };
}

function emptyPriorCheckpoint() {
  return {
    checkpointId: null,
    contentHash: null,
    path: null,
    resultPath: null,
    resultSha256: null,
  };
}

export function buildLiveRuntimeAdapterApprovalRequest({
  bundleSha256,
  conformanceArtifact,
  dispatchId,
  expectedContainerIds,
  expectedProductionHead,
  expiresAt,
  issuedAt,
  manifestSha256,
  priorCheckpoints = {
    BITGET_FUTURES: emptyPriorCheckpoint(),
    BYBIT_DERIVATIVES: emptyPriorCheckpoint(),
  },
  probePlanDigest,
  registryDigest,
  revocationEpoch,
  runnerUnitName,
  sourceCommit,
  sourceRef,
  sourceTree,
  policy = DEFAULT_LIVE_RUNTIME_ADAPTER_POLICY,
}) {
  const request = {
    applicationMutationAllowed: false,
    approvalExpiresAt: expiresAt,
    approvalIssuedAt: issuedAt,
    artifactManifestSha256: manifestSha256,
    artifactPath: join(policy.evidenceRoot, `${dispatchId}.artifact.json`),
    automaticRollbackRequired: true,
    candidateAuthorityAllowed: false,
    checkpointPaths: {
      BITGET_FUTURES: join(
        policy.checkpointRoot,
        `${dispatchId}.bitget_futures.checkpoint.json`,
      ),
      BYBIT_DERIVATIVES: join(
        policy.checkpointRoot,
        `${dispatchId}.bybit_derivatives.checkpoint.json`,
      ),
    },
    coinGlassCredential: {
      envKey: policy.credentialEnvKey,
      file: policy.credentialFile,
      source: "PRODUCTION_ENV_FILE_EXACT_KEY",
    },
    conformanceArtifact: {
      artifactId: conformanceArtifact.artifactId,
      contentHash: conformanceArtifact.contentHash,
      path: conformanceArtifact.path,
      releaseId: conformanceArtifact.releaseId,
    },
    databaseMutationAllowed: false,
    dispatchId,
    dispatchStateRoot: policy.dispatchStateRoot,
    expectedBlockedProbeIds: ["BINANCE_SPOT_CATALOG"],
    expectedContainerCount: expectedContainerIds.length,
    expectedContainerIds: [...expectedContainerIds].sort(),
    expectedHealth: {
      level: "ready",
      persistenceDatabaseStatus: "ready",
      scanFreshness: "fresh",
      scanStatus: "ready",
    },
    expectedLiveConformantProfileCount: 15,
    expectedProbePlanDigest: probePlanDigest,
    expectedProductionHead,
    expectedRegistryDigest: registryDigest,
    expectedRouteEligibleProfileCount: 14,
    expectedTimerUnit: policy.expectedTimerUnit,
    factAuthorityAllowed: false,
    launchSuccessMarker: LIVE_RUNTIME_ADAPTER_SUCCESS_MARKER,
    listingCheckpointMutationAllowed: true,
    maxExecutions: 1,
    maxListingPagesPerSource: 64,
    networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
    packageId: LIVE_RUNTIME_ADAPTER_PACKAGE_ID,
    priorCheckpoints,
    productionMutationScope:
      "dispatch_staging_and_sanitized_evidence_checkpoints_only",
    productionWorktree: policy.productionWorktree,
    rawMarketBodyPersistenceAllowed: false,
    redisMutationAllowed: false,
    resultPath: join(policy.evidenceRoot, `${dispatchId}.result.json`),
    revocationEpoch,
    runnerUnitName,
    runtimeAuthorityAllowed: false,
    runtimeDeadlineSeconds: 1_200,
    schemaVersion: LIVE_RUNTIME_ADAPTER_REQUEST_SCHEMA,
    sessionIndependentExecutionRequired: true,
    sourceCommit,
    sourceRef,
    sourceTree,
    stagingDirectory: join(
      policy.stagingRoot,
      `${policy.stagingPrefix}${dispatchId}`,
    ),
    strategyAuthorityAllowed: false,
    temporaryStagingCleanupRequired: true,
    transportBundleSha256: bundleSha256,
    transportContainsSecrets: false,
    transportMethod: "signed_git_bundle",
    workerMutationAllowed: false,
  };
  validateLiveRuntimeAdapterRequest(request, {
    now: new Date(issuedAt),
    policy,
  });
  return request;
}

export async function buildLiveRuntimeAdapterBundle({
  approval,
  outputDirectory,
  root = process.cwd(),
  sourceCommit,
  sourceTree,
  verifySourceBinding = true,
  policy = DEFAULT_LIVE_RUNTIME_ADAPTER_POLICY,
}) {
  const repository = resolve(root);
  const output = resolve(outputDirectory);
  assert.match(sourceCommit, COMMIT, "source commit is invalid");
  assert.match(sourceTree, COMMIT, "source tree is invalid");
  assert.ok(
    output !== repository && !output.startsWith(`${repository}${sep}`),
    "bundle output must stay outside the worktree",
  );
  await access(output, fsConstants.F_OK).then(
    () => assert.fail("bundle output directory already exists"),
    (error) => {
      if (error?.code !== "ENOENT") throw error;
    },
  );

  const temporary = await mkdtemp(
    join(tmpdir(), "market-radar-m1-4b-runtime-bundle-"),
  );
  const payload = join(temporary, "payload");
  const compiled = join(temporary, "compiled");
  try {
    await mkdir(payload, { recursive: true, mode: 0o700 });
    const compiledFiles = await compileRuntime(repository, compiled);
    if (verifySourceBinding) {
      for (const path of SOURCE_BOUND_FILES) {
        await assertCommittedFile(repository, sourceCommit, path);
      }
      for (const path of compiledFiles) {
        await assertCommittedFile(
          repository,
          sourceCommit,
          `src/${path.replace(/\.js$/u, ".ts")}`,
        );
      }
    }
    const constants = await loadRuntimeConstants(compiled, repository);
    const zod = await loadZodFiles(repository);
    const payloadFiles = [];
    for (const path of [
      LIVE_RUNTIME_ADAPTER_ENTRYPOINT,
      LIVE_RUNTIME_ADAPTER_RUNNER,
      LIVE_RUNTIME_ADAPTER_SAFETY_RUNNER,
    ]) {
      payloadFiles.push({
        bytes: await readFile(join(repository, path)),
        mode: path.endsWith(".sh") ? 0o700 : 0o600,
        path,
      });
    }
    for (const path of compiledFiles) {
      payloadFiles.push({
        bytes: await readFile(join(compiled, path)),
        mode: 0o600,
        path: `runtime/${path}`,
      });
    }
    for (const file of zod.files) {
      payloadFiles.push({
        bytes: await readFile(file.bytesPath),
        mode: 0o600,
        path: file.bundlePath,
      });
    }
    payloadFiles.sort((left, right) => left.path.localeCompare(right.path));
    const manifest = {
      archiveFormat: "ustar+gzip-n",
      containsSecrets: false,
      dependencyLockSha256: zod.packageLockSha256,
      files: Object.fromEntries(
        payloadFiles.map((file) => [file.path, sha256(file.bytes)]),
      ),
      mutationScope:
        "dispatch_staging_and_sanitized_evidence_checkpoints_only",
      packageId: LIVE_RUNTIME_ADAPTER_PACKAGE_ID,
      probePlanDigest: constants.probePlanDigest,
      registryDigest: constants.registryDigest,
      runtimeEntry: LIVE_RUNTIME_ADAPTER_RUNTIME_ENTRY,
      schemaVersion: LIVE_RUNTIME_ADAPTER_MANIFEST_SCHEMA,
      sourceCommit,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
      sourceTree,
      zodRuntimeTreeDigest: LIVE_RUNTIME_ADAPTER_ZOD_RUNTIME_TREE_DIGEST,
      zodVersion: zod.version,
    };
    const manifestBytes = Buffer.from(canonicalJson(manifest));
    payloadFiles.push({
      bytes: manifestBytes,
      mode: 0o600,
      path: LIVE_RUNTIME_ADAPTER_MANIFEST,
    });
    for (const file of payloadFiles) {
      await writePayloadFile(payload, file.path, file.bytes, file.mode);
    }

    const archivePath = join(temporary, "payload.tar");
    await execFileAsync("tar", [
      "-cf",
      archivePath,
      "--format=ustar",
      "--uid=0",
      "--gid=0",
      "--numeric-owner",
      "-C",
      payload,
      ...payloadFiles.map((file) => file.path).sort(),
    ], {
      env: { ...process.env, COPYFILE_DISABLE: "1", LC_ALL: "C" },
      maxBuffer: 8 * 1024 * 1024,
    });
    const { stdout: archiveBytes } = await execFileAsync(
      "gzip",
      ["-n", "-9", "-c", archivePath],
      { encoding: null, maxBuffer: MAX_ARCHIVE_BYTES },
    );
    assert.ok(
      Buffer.isBuffer(archiveBytes) &&
        archiveBytes.length > 0 &&
        archiveBytes.length <= MAX_ARCHIVE_BYTES,
      "bundle archive is invalid",
    );
    const bundleSha256 = sha256(archiveBytes);
    const request = buildLiveRuntimeAdapterApprovalRequest({
      ...approval,
      bundleSha256,
      manifestSha256: sha256(manifestBytes),
      probePlanDigest: constants.probePlanDigest,
      registryDigest: constants.registryDigest,
      sourceCommit,
      sourceTree,
      policy,
    });
    await mkdir(output, { mode: 0o700 });
    await writeFile(join(output, "bundle.tar.gz"), archiveBytes, {
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
      bundleBytes: archiveBytes.length,
      bundleSha256,
      conformanceArtifact: request.conformanceArtifact,
      containsSecrets: false,
      dispatchId: request.dispatchId,
      expectedBlockedProbeIds: request.expectedBlockedProbeIds,
      expectedRouteEligibleProfileCount:
        request.expectedRouteEligibleProfileCount,
      fileCount: payloadFiles.length,
      manifestSha256: request.artifactManifestSha256,
      outputDirectory: output,
      packageId: request.packageId,
      probePlanDigest: request.expectedProbePlanDigest,
      registryDigest: request.expectedRegistryDigest,
      sourceCommit,
      sourceTree,
      status: "PASS_M1_4B_NO_SECRET_RUNTIME_ADAPTER_BUNDLE_BUILT",
    };
    await writeFile(join(output, "build-result.json"), canonicalJson(result), {
      flag: "wx",
      mode: 0o600,
    });
    return { manifest, request, result };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function parseArguments(argv) {
  assert.equal(argv.length % 2, 0, "arguments must be name/value pairs");
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    assert.match(argv[index], /^--[a-z][a-z0-9-]*$/u, "argument name is invalid");
    const name = argv[index].slice(2);
    assert.equal(options[name], undefined, `duplicate argument ${argv[index]}`);
    options[name] = argv[index + 1];
  }
  return options;
}

function optionalPrior(options, prefix) {
  const path = options[`prior-${prefix}-path`];
  const checkpointId = options[`prior-${prefix}-checkpoint-id`];
  const contentHash = options[`prior-${prefix}-content-hash`];
  const resultPath = options[`prior-${prefix}-result-path`];
  const resultSha256 = options[`prior-${prefix}-result-sha256`];
  if (
    path === undefined &&
    checkpointId === undefined &&
    contentHash === undefined &&
    resultPath === undefined &&
    resultSha256 === undefined
  ) {
    return emptyPriorCheckpoint();
  }
  assert.ok(
    path && checkpointId && contentHash && resultPath && resultSha256,
    `incomplete ${prefix} checkpoint`,
  );
  return {
    checkpointId,
    contentHash,
    path,
    resultPath,
    resultSha256,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());
  const sourceCommit = await git(root, ["rev-parse", "HEAD"]);
  assert.match(sourceCommit, COMMIT, "repository HEAD is invalid");
  const sourceTree = await git(root, ["rev-parse", `${sourceCommit}^{tree}`]);
  const remote = await git(root, ["ls-remote", "origin", options["source-ref"]]);
  assert.equal(
    remote.split(/\s+/u)[0],
    sourceCommit,
    "source commit is not the exact pushed source ref",
  );
  const expectedContainerIds =
    options["expected-container-ids"]?.split(",").filter(Boolean) ?? [];
  const built = await buildLiveRuntimeAdapterBundle({
    approval: {
      conformanceArtifact: {
        artifactId: options["conformance-artifact-id"],
        contentHash: options["conformance-content-hash"],
        path: options["conformance-path"],
        releaseId: options["conformance-release-id"],
      },
      dispatchId: options["dispatch-id"],
      expectedContainerIds,
      expectedProductionHead: options["expected-production-head"],
      expiresAt: options["expires-at"],
      issuedAt: options["issued-at"],
      priorCheckpoints: {
        BITGET_FUTURES: optionalPrior(options, "bitget"),
        BYBIT_DERIVATIVES: optionalPrior(options, "bybit"),
      },
      revocationEpoch: Number(options["revocation-epoch"]),
      runnerUnitName: options["runner-unit-name"],
      sourceRef: options["source-ref"],
    },
    outputDirectory: options["output-directory"],
    root,
    sourceCommit,
    sourceTree,
  });
  process.stdout.write(canonicalJson(built.result));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      reason: error instanceof Error ? error.message : "unexpected_error",
      status: "BLOCKED",
    })}\n`);
    process.exitCode = 1;
  });
}
