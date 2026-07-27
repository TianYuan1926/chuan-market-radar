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
import { writeDeterministicUstar } from "../lib/deterministic-ustar.mjs";
import {
  DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY,
  M1_EXPANDED_SHADOW_LIVE_ENTRYPOINT,
  M1_EXPANDED_SHADOW_LIVE_PACKAGE_ID,
  M1_EXPANDED_SHADOW_LIVE_REQUEST_SCHEMA,
  M1_EXPANDED_SHADOW_LIVE_RUNNER,
  M1_EXPANDED_SHADOW_LIVE_RUNTIME_ENTRY,
  M1_EXPANDED_SHADOW_LIVE_SAFETY_RUNNER,
  M1_EXPANDED_SHADOW_LIVE_SUCCESS_MARKER,
  M1_EXPANDED_SHADOW_POSTGRES_IMAGE,
  validateM1ExpandedShadowLiveRequest,
} from "./m1-expanded-shadow-live-runner.mjs";
import {
  canonicalJson,
  sha256,
} from "./m1-source-conformance-live-runner.mjs";

const execFileAsync = promisify(execFile);
const SOURCE_DATE_EPOCH = 946_684_800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);
const COMMIT = /^[a-f0-9]{40}$/u;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_FILE_BYTES = 32 * 1024 * 1024;

const SOURCE_BOUND_FILES = Object.freeze([
  M1_EXPANDED_SHADOW_LIVE_ENTRYPOINT,
  M1_EXPANDED_SHADOW_LIVE_RUNNER,
  M1_EXPANDED_SHADOW_LIVE_SAFETY_RUNNER,
  "package-lock.json",
  "package.json",
  "tsconfig.json",
  "tsconfig.m1-expanded-shadow-live-package.json",
]);

const CRITICAL_COMPILED_RUNTIME_FILES = Object.freeze([
  "v2/entrypoints/m1-expanded-shadow-live-runtime.js",
  "v2/modules/collector/runtime-adapter-live.js",
  "v2/modules/collector/runtime-adapter-profile.js",
  "v2/modules/market-fact/multi-asset-base-fact-runtime.js",
  "v2/modules/multi-asset-universe/m1-listing-watch-live-runtime.js",
  "v2/modules/shadow/m1-expanded-shadow-release-contract.js",
  "v2/modules/shadow/m1-expanded-shadow-store.js",
  "v2/modules/shadow/m1-microstructure-forward-evidence-verifier.js",
  "v2/modules/shadow/m1-microstructure-forward-selection-runtime.js",
  "v2/modules/shadow/m1-microstructure-forward-worker.js",
  "v2/modules/shadow/m1-multi-asset-shadow-evidence-verifier.js",
  "v2/modules/shadow/m1-multi-asset-shadow-runtime.js",
]);

const ROOT_RUNTIME_DEPENDENCIES = Object.freeze([
  "lossless-json",
  "pg",
  "zod",
]);

const FROZEN_DIRECT_DEPENDENCY_VERSIONS = Object.freeze({
  "lossless-json": "4.3.0",
  pg: "8.16.3",
  zod: "4.4.3",
});

const ALLOWED_VENUE_HOSTS = Object.freeze([
  "api.bitget.com",
  "api.bybit.com",
  "fapi.binance.com",
  "fstream.binance.com",
  "stream.bybit.com",
  "ws.bitget.com",
  "ws.okx.com",
  "www.okx.com",
]);

async function git(root, args, options = {}) {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  return typeof stdout === "string" ? stdout.trim() : stdout;
}

function prefixedSha256(value) {
  return `sha256:${sha256(value)}`;
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

async function writePayloadFile(payloadRoot, file) {
  const target = join(payloadRoot, file.path);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, file.bytes, { flag: "wx", mode: file.mode });
  await chmod(target, file.mode);
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

export async function compileM1ExpandedShadowRuntime(root, outputRoot) {
  const tsc = await realpath(join(root, "node_modules/.bin/tsc"));
  await requireRegular(tsc, "local TypeScript compiler is unavailable");
  await execFileAsync(tsc, [
    "-p",
    join(root, "tsconfig.m1-expanded-shadow-live-package.json"),
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
    files.length >= 35 && files.length <= 55,
    "compiled expanded-shadow runtime closure drifted",
  );
  for (const path of CRITICAL_COMPILED_RUNTIME_FILES) {
    assert.ok(files.includes(path), `compiled runtime file is absent: ${path}`);
    await requireRegular(join(outputRoot, path), `compiled file unsafe: ${path}`);
  }
  return files;
}

function dependencyClosure(packageLock) {
  const pending = [...ROOT_RUNTIME_DEPENDENCIES];
  const closure = new Set();
  while (pending.length > 0) {
    const name = pending.shift();
    if (closure.has(name)) continue;
    const locked = packageLock.packages?.[`node_modules/${name}`];
    assert.ok(locked, `runtime dependency is absent from package-lock: ${name}`);
    closure.add(name);
    for (const dependency of Object.keys({
      ...locked.dependencies,
      ...locked.optionalDependencies,
    })) {
      pending.push(dependency);
    }
  }
  return [...closure].sort();
}

function isGenericRuntimeFile(path) {
  return (
    (
      path.endsWith(".js") ||
      path.endsWith(".cjs") ||
      path.endsWith(".mjs") ||
      path.endsWith(".json")
    ) &&
    !/(?:^|\/)(?:test|tests)(?:\/|\.|-)/u.test(path) &&
    !/\.test\.(?:js|cjs|mjs)$/u.test(path)
  ) || /^(?:LICENSE|LICENSE\.md)$/u.test(path);
}

function isZodRuntimeFile(path) {
  return path.endsWith(".cjs") ||
    path === "package.json" ||
    path === "LICENSE";
}

function isLosslessRuntimeFile(path) {
  return [
    "LICENSE.md",
    "lib/umd/lossless-json.js",
    "lib/umd/package.json",
    "package.json",
  ].includes(path);
}

export async function loadM1ExpandedShadowRuntimeDependencies(root) {
  const packageLockBytes = await readFile(join(root, "package-lock.json"));
  const packageLock = JSON.parse(packageLockBytes.toString("utf8"));
  const names = dependencyClosure(packageLock);
  const files = [];
  const dependencyHashes = {};
  const zodHashes = {};
  for (const name of names) {
    const packageRoot = join(root, "node_modules", name);
    const packageMetadata = JSON.parse(
      await readFile(join(packageRoot, "package.json"), "utf8"),
    );
    const locked = packageLock.packages[`node_modules/${name}`];
    assert.equal(
      packageMetadata.version,
      locked.version,
      `${name} package-lock version drift`,
    );
    if (FROZEN_DIRECT_DEPENDENCY_VERSIONS[name] !== undefined) {
      assert.equal(
        packageMetadata.version,
        FROZEN_DIRECT_DEPENDENCY_VERSIONS[name],
        `${name} direct version is not frozen`,
      );
    }
    const predicate = name === "zod"
      ? isZodRuntimeFile
      : name === "lossless-json"
        ? isLosslessRuntimeFile
        : isGenericRuntimeFile;
    const paths = await listFiles(packageRoot, predicate);
    assert.ok(paths.includes("package.json"), `${name} metadata is absent`);
    for (const path of paths) {
      const bytesPath = join(packageRoot, path);
      const bundlePath = `runtime/node_modules/${name}/${path}`;
      const digest = sha256(await readFile(bytesPath));
      dependencyHashes[bundlePath] = digest;
      if (name === "zod") zodHashes[path] = digest;
      files.push({
        bytesPath,
        bundlePath,
        class: /^LICENSE(?:\.md)?$/u.test(path) ? "LICENSE" : "DEPENDENCY",
      });
    }
  }
  assert.ok(
    files.length >= 175 && files.length <= 215,
    "runtime dependency closure drifted",
  );
  return {
    dependencyLockSha256: prefixedSha256(packageLockBytes),
    dependencyTreeHash: prefixedSha256(canonicalJson(dependencyHashes)),
    files,
    names,
    zodRuntimeTreeHash: prefixedSha256(canonicalJson(zodHashes)),
  };
}

async function runtimeOperation({
  compiledRoot,
  input,
  operation,
  repositoryRoot,
  temporaryRoot,
}) {
  const inputPath = join(
    temporaryRoot,
    `runtime-operation-${operation}-${sha256(canonicalJson(input)).slice(0, 12)}.json`,
  );
  await writeFile(inputPath, canonicalJson(input), {
    flag: "wx",
    mode: 0o600,
  });
  const script = [
    "const fs=require('node:fs');",
    "const runtime=require(process.argv[1]);",
    "const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));",
    "let output;",
    "if(process.argv[3]==='validate-upstream'){",
    "const runtimeArtifact=runtime.M1RuntimeAdapterLiveArtifactSchema.parse(input.runtimeArtifact);",
    "const conformanceArtifact=runtime.M1SourceConformanceArtifactSchema.parse(input.conformanceArtifact);",
    "const upstream=runtime.buildM1MultiAssetShadowUpstreamBinding(runtimeArtifact);",
    "const profileSet=runtime.buildM1RuntimeAdapterProfileSet({runtimeReleaseId:runtimeArtifact.runtimeReleaseId,generatedAt:runtimeArtifact.generatedAt,conformanceArtifact});",
    "const checkpoints=runtime.extractM1ListingHistoryCheckpoints(runtimeArtifact);",
    "if(profileSet.contentHash!==runtimeArtifact.profileSetHash||!checkpoints.BITGET_FUTURES||!checkpoints.BYBIT_DERIVATIVES)throw Error('upstream reconstruction mismatch');",
    "output={upstream,runtimeArtifact,conformanceArtifact};",
    "}else if(process.argv[3]==='build-manifest'){",
    "output=runtime.buildM1ExpandedShadowReleaseManifest(input);",
    "}else{throw Error('runtime operation invalid');}",
    "process.stdout.write(JSON.stringify(output));",
  ].join("");
  const { stdout } = await execFileAsync(process.execPath, [
    "-e",
    script,
    join(
      compiledRoot,
      M1_EXPANDED_SHADOW_LIVE_RUNTIME_ENTRY.replace(/^runtime\//u, ""),
    ),
    inputPath,
    operation,
  ], {
    encoding: "utf8",
    env: {
      HOME: process.env.HOME ?? tmpdir(),
      LANG: "C",
      LC_ALL: "C",
      NODE_PATH: join(repositoryRoot, "node_modules"),
      PATH: dirname(process.execPath),
    },
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30_000,
  });
  return JSON.parse(stdout);
}

function artifactReference(parsed, bytes, productionPath) {
  return {
    artifactId: parsed.artifactId,
    contentHash: parsed.contentHash,
    path: productionPath,
    releaseId:
      parsed.runtimeReleaseId ?? parsed.releaseId,
    sha256: sha256(bytes),
  };
}

export function buildM1ExpandedShadowApprovalRequest({
  approval,
  bundleSha256,
  conformanceArtifact,
  manifest,
  runtimeAdapterArtifact,
  sourceCommit,
  sourceTree,
  policy = DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY,
}) {
  const request = {
    applicationMutationAllowed: false,
    approvalExpiresAt: approval.expiresAt,
    approvalIssuedAt: approval.issuedAt,
    artifactManifestSha256: sha256(canonicalJson(manifest)),
    automaticRollbackRequired: true,
    automaticTradingAllowed: false,
    buildOnTargetAllowed: false,
    candidateAuthorityAllowed: false,
    conformanceArtifact,
    databaseMutationAllowed: false,
    dependencyInstallAllowed: false,
    dispatchId: approval.dispatchId,
    dispatchStateRoot: policy.dispatchStateRoot,
    evidenceRoot: policy.evidenceRoot,
    expectedContainerCount: approval.expectedContainerIds.length,
    expectedContainerIds: [...approval.expectedContainerIds].sort(),
    expectedHealth: {
      level: "ready",
      persistenceDatabaseStatus: "ready",
      scanFreshness: "fresh",
      scanStatus: "ready",
    },
    expectedPostgresImageId: approval.expectedPostgresImageId,
    expectedProductionHead: approval.expectedProductionHead,
    expectedTimerUnit: policy.expectedTimerUnit,
    expectedTopologyBeforeHash: approval.expectedTopologyBeforeHash,
    factAuthorityAllowed: false,
    launchSuccessMarker: M1_EXPANDED_SHADOW_LIVE_SUCCESS_MARKER,
    maxExecutions: 1,
    networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
    packageId: M1_EXPANDED_SHADOW_LIVE_PACKAGE_ID,
    postgresImageReference: M1_EXPANDED_SHADOW_POSTGRES_IMAGE,
    productionMutationScope:
      "SANITIZED_EVIDENCE_AND_EPHEMERAL_ISOLATED_POSTGRES_ONLY",
    productionRepositoryMutationAllowed: false,
    productionServiceMutationAllowed: false,
    productionWorktree: policy.productionWorktree,
    readProductionSecretsAllowed: false,
    redisMutationAllowed: false,
    releaseManifest: manifest,
    resultPath: join(
      policy.evidenceRoot,
      `${approval.dispatchId}.result.json`,
    ),
    revocationEpoch: approval.revocationEpoch,
    rotationOrdinal: approval.rotationOrdinal,
    runnerUnitName: approval.runnerUnitName,
    runtimeAdapterArtifact,
    runtimeDeadlineSeconds: 5_350,
    schemaVersion: M1_EXPANDED_SHADOW_LIVE_REQUEST_SCHEMA,
    sessionIndependentExecutionRequired: true,
    sourceCommit,
    sourceRef: approval.sourceRef,
    sourceTree,
    stagingDirectory: join(
      policy.stagingRoot,
      `${policy.stagingPrefix}${approval.dispatchId}`,
    ),
    strategyAuthorityAllowed: false,
    temporaryIsolatedShadowStorageAllowed: true,
    temporaryStagingCleanupRequired: true,
    transportBundleSha256: bundleSha256,
    transportContainsSecrets: false,
    transportMethod: "signed_git_bundle",
    workerMutationAllowed: false,
    writeProductionEnvironmentAllowed: false,
  };
  validateM1ExpandedShadowLiveRequest(request, {
    now: new Date(approval.issuedAt),
    policy,
  });
  return request;
}

function manifestFile(payloadFile) {
  return {
    path: payloadFile.path,
    sha256: prefixedSha256(payloadFile.bytes),
    bytes: payloadFile.bytes.length,
    mode: payloadFile.mode === 0o555 ? "0555" : "0444",
    class: payloadFile.class,
    containsSecret: false,
  };
}

export async function buildM1ExpandedShadowLiveBundle({
  approval,
  artifactInputs,
  outputDirectory,
  root = process.cwd(),
  sourceCommit,
  sourceTree,
  verifySourceBinding = true,
  policy = DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY,
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
    join(tmpdir(), "market-radar-m1-expanded-shadow-bundle-"),
  );
  const payload = join(temporary, "payload");
  const compiled = join(temporary, "compiled");
  try {
    await mkdir(payload, { recursive: true, mode: 0o700 });
    const compiledFiles = await compileM1ExpandedShadowRuntime(
      repository,
      compiled,
    );
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

    const runtimeArtifactBytes = await readFile(
      resolve(artifactInputs.runtimeAdapter.localPath),
    );
    const conformanceArtifactBytes = await readFile(
      resolve(artifactInputs.conformance.localPath),
    );
    const reconstructed = await runtimeOperation({
      compiledRoot: compiled,
      input: {
        runtimeArtifact: JSON.parse(runtimeArtifactBytes.toString("utf8")),
        conformanceArtifact: JSON.parse(
          conformanceArtifactBytes.toString("utf8"),
        ),
      },
      operation: "validate-upstream",
      repositoryRoot: repository,
      temporaryRoot: temporary,
    });
    assert.equal(
      reconstructed.runtimeArtifact.runtimeReleaseId,
      sourceCommit,
      "runtime adapter artifact does not match package source commit",
    );
    assert.equal(
      reconstructed.conformanceArtifact.releaseId,
      sourceCommit,
      "conformance artifact does not match package source commit",
    );
    const runtimeAdapterReference = artifactReference(
      reconstructed.runtimeArtifact,
      runtimeArtifactBytes,
      artifactInputs.runtimeAdapter.productionPath,
    );
    const conformanceReference = artifactReference(
      reconstructed.conformanceArtifact,
      conformanceArtifactBytes,
      artifactInputs.conformance.productionPath,
    );

    const dependencies = await loadM1ExpandedShadowRuntimeDependencies(
      repository,
    );
    const payloadFiles = [];
    for (const path of [
      M1_EXPANDED_SHADOW_LIVE_ENTRYPOINT,
      M1_EXPANDED_SHADOW_LIVE_RUNNER,
      M1_EXPANDED_SHADOW_LIVE_SAFETY_RUNNER,
    ]) {
      payloadFiles.push({
        bytes: await readFile(join(repository, path)),
        class: path.endsWith(".sh") ? "ENTRYPOINT" : "RUNTIME",
        mode: path.endsWith(".sh") || path === M1_EXPANDED_SHADOW_LIVE_RUNNER
          ? 0o555
          : 0o444,
        path,
      });
    }
    for (const path of compiledFiles) {
      payloadFiles.push({
        bytes: await readFile(join(compiled, path)),
        class: "RUNTIME",
        mode: 0o444,
        path: `runtime/${path}`,
      });
    }
    for (const file of dependencies.files) {
      payloadFiles.push({
        bytes: await readFile(file.bytesPath),
        class: file.class,
        mode: 0o444,
        path: file.bundlePath,
      });
    }
    payloadFiles.push({
      bytes: await readFile(join(repository, "package-lock.json")),
      class: "MANIFEST",
      mode: 0o444,
      path: "runtime/package-lock.json",
    });
    payloadFiles.sort((left, right) => left.path.localeCompare(right.path));
    assert.ok(
      payloadFiles.length >= 210 && payloadFiles.length <= 256,
      "expanded-shadow bundle file count drifted",
    );
    const compiledHashes = Object.fromEntries(
      payloadFiles
        .filter((file) => file.path.startsWith("runtime/v2/"))
        .map((file) => [file.path, sha256(file.bytes)]),
    );
    const compiledRuntimeTreeHash = prefixedSha256(
      canonicalJson(compiledHashes),
    );
    for (const file of payloadFiles) await writePayloadFile(payload, file);

    const archivePath = join(temporary, "payload.tar");
    await writeDeterministicUstar({
      archivePath,
      entries: payloadFiles.map((file) => file.path),
      root: payload,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
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
      "expanded-shadow archive is invalid",
    );
    const bundleSha256 = sha256(archiveBytes);
    const entrypoint = payloadFiles.find(
      (file) => file.path === M1_EXPANDED_SHADOW_LIVE_ENTRYPOINT,
    );
    const m15cContract = payloadFiles.find(
      (file) =>
        file.path ===
          "runtime/v2/modules/shadow/m1-multi-asset-shadow-contract.js",
    );
    const m15dContract = payloadFiles.find(
      (file) =>
        file.path ===
          "runtime/v2/modules/shadow/m1-microstructure-forward-shadow-contract.js",
    );
    assert.ok(entrypoint && m15cContract && m15dContract);
    const manifestInput = {
      sourceCommit,
      sourceRef: approval.sourceRef,
      sourceTreeHash: prefixedSha256(`${sourceTree}\n`),
      generatedAt: approval.issuedAt,
      approvalIssuedAt: approval.issuedAt,
      approvalExpiresAt: approval.expiresAt,
      dispatchId: approval.dispatchId,
      expectedProductionHead: approval.expectedProductionHead,
      productionTopologyBeforeHash: approval.expectedTopologyBeforeHash,
      upstreamBindingId: reconstructed.upstream.upstreamBindingId,
      upstreamBindingHash: reconstructed.upstream.contentHash,
      evidenceClass: reconstructed.upstream.evidenceClass,
      networkEnvironment: reconstructed.upstream.networkEnvironment,
      allowedVenueHosts: [...ALLOWED_VENUE_HOSTS],
      components: [
        {
          componentId: "M1_5C_FOUR_VENUE_MULTI_ASSET_SHADOW",
          contractPath: m15cContract.path,
          contractSha256: prefixedSha256(m15cContract.bytes),
          runtimeEntrypointPath: entrypoint.path,
          runtimeEntrypointSha256: prefixedSha256(entrypoint.bytes),
          compiledRuntimeTreeHash,
          evidenceDirectoryName: "m1-5c",
          rollbackUnitName: "market-radar-m1-5c-expanded-shadow",
          runProfile: "31_CYCLES_60_SECOND_CADENCE_MINIMUM_1800_SECONDS",
          authorityMode: "NO_AUTHORITY",
          productionDatabaseMutationAllowed: false,
          productionRedisMutationAllowed: false,
          productionApplicationMutationAllowed: false,
          persistentRawMarketBytesAllowed: false,
          temporaryIsolatedShadowStorageAllowed: true,
          automaticRollbackRequired: true,
          independentAcceptanceRequired: true,
        },
        {
          componentId: "M1_5D_MICROSTRUCTURE_FORWARD_SHADOW",
          contractPath: m15dContract.path,
          contractSha256: prefixedSha256(m15dContract.bytes),
          runtimeEntrypointPath: entrypoint.path,
          runtimeEntrypointSha256: prefixedSha256(entrypoint.bytes),
          compiledRuntimeTreeHash,
          evidenceDirectoryName: "m1-5d",
          rollbackUnitName: "market-radar-m1-5d-expanded-shadow",
          runProfile: "31_CYCLES_60_SECOND_CADENCE_MINIMUM_1800_SECONDS",
          authorityMode: "NO_AUTHORITY",
          productionDatabaseMutationAllowed: false,
          productionRedisMutationAllowed: false,
          productionApplicationMutationAllowed: false,
          persistentRawMarketBytesAllowed: false,
          temporaryIsolatedShadowStorageAllowed: true,
          automaticRollbackRequired: true,
          independentAcceptanceRequired: true,
        },
      ],
      files: payloadFiles.map(manifestFile),
      transportArchiveSha256: prefixedSha256(archiveBytes),
      dependencyLockSha256: dependencies.dependencyLockSha256,
      zodRuntimeTreeHash: dependencies.zodRuntimeTreeHash,
      stagingDirectory: join(
        policy.stagingRoot,
        `${policy.stagingPrefix}${approval.dispatchId}`,
      ),
      evidenceRoot: policy.evidenceRoot,
      maxExecutions: 1,
      maxRuntimeSeconds: 5_400,
      buildOnTargetAllowed: false,
      sourceSyncAllowed: false,
      dependencyInstallAllowed: false,
      transportContainsSecrets: false,
      readProductionSecretsAllowed: false,
      writeProductionEnvironmentAllowed: false,
      productionRepositoryMutationAllowed: false,
      productionServiceMutationAllowed: false,
      temporaryStagingCleanupRequired: true,
      crossComponentPassAllowed: false,
      automaticTradingAllowed: false,
    };
    const manifest = await runtimeOperation({
      compiledRoot: compiled,
      input: {
        upstreamBinding: reconstructed.upstream,
        manifest: manifestInput,
      },
      operation: "build-manifest",
      repositoryRoot: repository,
      temporaryRoot: temporary,
    });
    const request = buildM1ExpandedShadowApprovalRequest({
      approval,
      bundleSha256,
      conformanceArtifact: conformanceReference,
      manifest,
      runtimeAdapterArtifact: runtimeAdapterReference,
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
      compiledRuntimeTreeHash,
      containsSecrets: false,
      dependencyLockSha256: dependencies.dependencyLockSha256,
      dependencyTreeHash: dependencies.dependencyTreeHash,
      dispatchId: request.dispatchId,
      fileCount: payloadFiles.length,
      manifestHash: manifest.contentHash,
      manifestId: manifest.manifestId,
      manifestSha256: request.artifactManifestSha256,
      outputDirectory: output,
      packageId: request.packageId,
      runtimeDependencies: dependencies.names,
      sourceCommit,
      sourceTree,
      status: "PASS_M1_5C_5D_NO_SECRET_EXACT_SOURCE_BUNDLE_BUILT",
      upstreamBindingHash: reconstructed.upstream.contentHash,
      upstreamBindingId: reconstructed.upstream.upstreamBindingId,
      zodRuntimeTreeHash: dependencies.zodRuntimeTreeHash,
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

function required(options, name) {
  assert.ok(options[name], `missing --${name}`);
  return options[name];
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());
  const sourceCommit = await git(root, ["rev-parse", "HEAD"]);
  assert.match(sourceCommit, COMMIT, "repository HEAD is invalid");
  const sourceTree = await git(root, ["rev-parse", `${sourceCommit}^{tree}`]);
  const sourceRef = required(options, "source-ref");
  const remote = await git(root, ["ls-remote", "origin", sourceRef]);
  assert.equal(
    remote.split(/\s+/u)[0],
    sourceCommit,
    "source commit is not the exact pushed source ref",
  );
  const built = await buildM1ExpandedShadowLiveBundle({
    approval: {
      dispatchId: required(options, "dispatch-id"),
      expectedContainerIds:
        (options["expected-container-ids"] ?? "").split(",").filter(Boolean),
      expectedPostgresImageId: required(
        options,
        "expected-postgres-image-id",
      ),
      expectedProductionHead: required(options, "expected-production-head"),
      expectedTopologyBeforeHash: required(
        options,
        "expected-topology-before-hash",
      ),
      expiresAt: required(options, "expires-at"),
      issuedAt: required(options, "issued-at"),
      revocationEpoch: Number(required(options, "revocation-epoch")),
      rotationOrdinal: Number(required(options, "rotation-ordinal")),
      runnerUnitName: required(options, "runner-unit-name"),
      sourceRef,
    },
    artifactInputs: {
      runtimeAdapter: {
        localPath: required(options, "runtime-adapter-artifact-file"),
        productionPath: required(options, "runtime-adapter-production-path"),
      },
      conformance: {
        localPath: required(options, "conformance-artifact-file"),
        productionPath: required(options, "conformance-production-path"),
      },
    },
    outputDirectory: required(options, "output-directory"),
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
