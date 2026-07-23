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
  DEFAULT_LIVE_SOURCE_CONFORMANCE_POLICY,
  LIVE_SOURCE_CONFORMANCE_ENTRYPOINT,
  LIVE_SOURCE_CONFORMANCE_MANIFEST,
  LIVE_SOURCE_CONFORMANCE_MANIFEST_SCHEMA,
  LIVE_SOURCE_CONFORMANCE_PACKAGE_ID,
  LIVE_SOURCE_CONFORMANCE_REQUEST_SCHEMA,
  LIVE_SOURCE_CONFORMANCE_RUNNER,
  LIVE_SOURCE_CONFORMANCE_RUNTIME_ENTRY,
  LIVE_SOURCE_CONFORMANCE_SUCCESS_MARKER,
  LIVE_SOURCE_CONFORMANCE_ZOD_RUNTIME_TREE_DIGEST,
  canonicalJson,
  sha256,
  validateLiveSourceConformanceRequest,
} from "./m1-source-conformance-live-runner.mjs";

const execFileAsync = promisify(execFile);
const SOURCE_DATE_EPOCH = 946_684_800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);
const COMMIT = /^[a-f0-9]{40}$/u;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_FILE_BYTES = 16 * 1024 * 1024;

const SOURCE_BOUND_FILES = Object.freeze([
  LIVE_SOURCE_CONFORMANCE_ENTRYPOINT,
  LIVE_SOURCE_CONFORMANCE_RUNNER,
  "package-lock.json",
  "package.json",
  "tsconfig.json",
  "tsconfig.m1-source-conformance-package.json",
]);

const COMPILED_RUNTIME_FILES = Object.freeze([
  "v2/domain/module-registry.js",
  "v2/domain/product-constitution.js",
  "v2/domain/states.js",
  "v2/domain/uncertainty.js",
  "v2/entrypoints/m1-exact-source-conformance.js",
  "v2/modules/multi-asset-universe/adapters/bybit-bitget-listing-announcements.js",
  "v2/modules/multi-asset-universe/adapters/four-venue-multi-asset-catalog.js",
  "v2/modules/multi-asset-universe/listing-lifecycle-contract.js",
  "v2/modules/multi-asset-universe/multi-asset-identity-contract.js",
  "v2/modules/source-capability/adapters/four-venue-capability-registry.js",
  "v2/modules/source-capability/source-capability-contract.js",
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
    join(root, "tsconfig.m1-source-conformance-package.json"),
    "--outDir",
    outputRoot,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
  });
  for (const path of COMPILED_RUNTIME_FILES) {
    await requireRegular(
      join(outputRoot, path),
      `compiled runtime file is absent: ${path}`,
    );
  }
  return [...COMPILED_RUNTIME_FILES];
}

async function loadRuntimeConstants(compiledRoot, repositoryRoot) {
  const script = [
    "const runtime=require(process.argv[1]);",
    "const registry=require(process.argv[2]);",
    "process.stdout.write(JSON.stringify({",
    "probePlanDigest:runtime.M1_EXACT_SOURCE_PROBE_PLAN_DIGEST,",
    "registryDigest:registry.M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest",
    "}));",
  ].join("");
  const { stdout } = await execFileAsync(process.execPath, [
    "-e",
    script,
    join(
      compiledRoot,
      LIVE_SOURCE_CONFORMANCE_RUNTIME_ENTRY.replace(/^runtime\//u, ""),
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
    (path) => path.endsWith(".cjs") || path === "package.json" || path === "LICENSE",
  );
  assert.ok(paths.length >= 100 && paths.length <= 150, "zod runtime closure drifted");
  const fileHashes = {};
  for (const path of paths) {
    fileHashes[path] = sha256(await readFile(join(zodRoot, path)));
  }
  assert.equal(
    `sha256:${sha256(canonicalJson(fileHashes))}`,
    LIVE_SOURCE_CONFORMANCE_ZOD_RUNTIME_TREE_DIGEST,
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

export function buildLiveSourceConformanceApprovalRequest({
  bundleSha256,
  dispatchId,
  expectedContainerIds,
  expectedProductionHead,
  expiresAt,
  issuedAt,
  manifestSha256,
  probePlanDigest,
  registryDigest,
  revocationEpoch,
  runnerUnitName,
  sourceCommit,
  sourceRef,
  sourceTree,
  policy = DEFAULT_LIVE_SOURCE_CONFORMANCE_POLICY,
}) {
  const request = {
    applicationMutationAllowed: false,
    approvalExpiresAt: expiresAt,
    approvalIssuedAt: issuedAt,
    artifactManifestSha256: manifestSha256,
    artifactPath: join(
      policy.evidenceRoot,
      `${dispatchId}.artifact.json`,
    ),
    automaticRollbackRequired: true,
    coinGlassCredential: {
      envKey: policy.credentialEnvKey,
      file: policy.credentialFile,
      source: "PRODUCTION_ENV_FILE_EXACT_KEY",
    },
    databaseMutationAllowed: false,
    dispatchId,
    dispatchStateRoot: policy.dispatchStateRoot,
    expectedContainerCount: expectedContainerIds.length,
    expectedContainerIds: [...expectedContainerIds].sort(),
    expectedHealth: {
      level: "ready",
      persistenceDatabaseStatus: "ready",
      scanFreshness: "fresh",
      scanStatus: "ready",
    },
    expectedProbeCount: 15,
    expectedProbePlanDigest: probePlanDigest,
    expectedProductionHead,
    expectedRegistryDigest: registryDigest,
    expectedTimerUnit: policy.expectedTimerUnit,
    launchSuccessMarker: LIVE_SOURCE_CONFORMANCE_SUCCESS_MARKER,
    maxExecutions: 1,
    networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
    packageId: LIVE_SOURCE_CONFORMANCE_PACKAGE_ID,
    probeDeadlineSeconds: 85,
    productionMutationScope: "dispatch_staging_and_sanitized_evidence_only",
    productionWorktree: policy.productionWorktree,
    redisMutationAllowed: false,
    resultPath: join(policy.evidenceRoot, `${dispatchId}.result.json`),
    revocationEpoch,
    runnerUnitName,
    schemaVersion: LIVE_SOURCE_CONFORMANCE_REQUEST_SCHEMA,
    sessionIndependentExecutionRequired: true,
    sourceCommit,
    sourceRef,
    sourceTree,
    stagingDirectory: join(policy.stagingRoot, `${policy.stagingPrefix}${dispatchId}`),
    temporaryStagingCleanupRequired: true,
    transportBundleSha256: bundleSha256,
    transportContainsSecrets: false,
    transportMethod: "signed_git_bundle",
    workerMutationAllowed: false,
  };
  validateLiveSourceConformanceRequest(request, {
    now: new Date(issuedAt),
    policy,
  });
  return request;
}

export async function buildLiveSourceConformanceBundle({
  approval,
  outputDirectory,
  root = process.cwd(),
  sourceCommit,
  sourceTree,
  verifySourceBinding = true,
  policy = DEFAULT_LIVE_SOURCE_CONFORMANCE_POLICY,
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

  const temporary = await mkdtemp(join(tmpdir(), "market-radar-m1-1b0-bundle-"));
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

    for (const path of [LIVE_SOURCE_CONFORMANCE_ENTRYPOINT, LIVE_SOURCE_CONFORMANCE_RUNNER]) {
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
      mutationScope: "dispatch_staging_and_sanitized_evidence_only",
      packageId: LIVE_SOURCE_CONFORMANCE_PACKAGE_ID,
      probePlanDigest: constants.probePlanDigest,
      registryDigest: constants.registryDigest,
      runtimeEntry: LIVE_SOURCE_CONFORMANCE_RUNTIME_ENTRY,
      schemaVersion: LIVE_SOURCE_CONFORMANCE_MANIFEST_SCHEMA,
      sourceCommit,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
      sourceTree,
      zodRuntimeTreeDigest: LIVE_SOURCE_CONFORMANCE_ZOD_RUNTIME_TREE_DIGEST,
      zodVersion: zod.version,
    };
    const manifestBytes = Buffer.from(canonicalJson(manifest));
    payloadFiles.push({
      bytes: manifestBytes,
      mode: 0o600,
      path: LIVE_SOURCE_CONFORMANCE_MANIFEST,
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
    const request = buildLiveSourceConformanceApprovalRequest({
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
      containsSecrets: false,
      dispatchId: request.dispatchId,
      fileCount: payloadFiles.length,
      manifestSha256: request.artifactManifestSha256,
      outputDirectory: output,
      packageId: request.packageId,
      probePlanDigest: request.expectedProbePlanDigest,
      registryDigest: request.expectedRegistryDigest,
      sourceCommit,
      sourceTree,
      status: "PASS_M1_1B0_NO_SECRET_LIVE_CONFORMANCE_BUNDLE_BUILT",
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
  const built = await buildLiveSourceConformanceBundle({
    approval: {
      dispatchId: options["dispatch-id"],
      expectedContainerIds,
      expectedProductionHead: options["expected-production-head"],
      expiresAt: options["expires-at"],
      issuedAt: options["issued-at"],
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
