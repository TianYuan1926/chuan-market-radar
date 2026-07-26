#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  DETERMINISTIC_USTAR_SOURCE_DATE_EPOCH,
  extractDeterministicUstar,
  readDeterministicUstar,
  writeDeterministicUstar,
} from "../lib/deterministic-ustar.mjs";
import {
  A0_RELEASE_QUALIFICATION_EVIDENCE_SCHEMA,
  assertCommit,
  assertSha256,
  byteDigest,
  canonicalJson,
  canonicalTreeIdentity,
  loadA0ReleaseQualificationPolicy,
  readStableRegularFile,
  stableDigest,
} from "./a0-release-qualification-contract.mjs";

const execFileAsync = promisify(execFile);
const RELEASE_INPUT_SCHEMA =
  "market-radar-v2-a0-application-release-input.v1";
const ACTIVE_POINTER_SCHEMA =
  "market-radar-v2-a0-isolated-active-release-pointer.v1";
const FIXED_TIME = new Date(DETERMINISTIC_USTAR_SOURCE_DATE_EPOCH * 1000);
const MAX_GIT_OUTPUT = 16 * 1024 * 1024;
const SOURCE_FILES = Object.freeze([
  "package-lock.json",
  "package.json",
  "tsconfig.json",
  "tsconfig.market-test.json",
  "tsconfig.v2-m1-collector-image.json",
]);

function lexicalOrder(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function git(repositoryRoot, args) {
  const { stdout } = await execFileAsync("git", [
    "-C",
    repositoryRoot,
    ...args,
  ], {
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT,
    timeout: 30_000,
  });
  return stdout.trim();
}

async function listRegularFiles(root, directory = root) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => lexicalOrder(left.name, right.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listRegularFiles(root, path));
      continue;
    }
    const metadata = await lstat(path);
    assert.equal(metadata.isFile(), true, "release input contains a special file");
    assert.equal(
      metadata.isSymbolicLink(),
      false,
      "release input cannot contain symlinks",
    );
    files.push(relative(root, path).split(sep).join("/"));
  }
  return files;
}

async function writePayloadFile(payloadRoot, path, bytes, mode) {
  const target = resolve(payloadRoot, ...path.split("/"));
  assert.ok(
    target.startsWith(`${resolve(payloadRoot)}${sep}`),
    "payload path escaped its root",
  );
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, bytes, { flag: "wx", mode });
  await chmod(target, mode);
  await utimes(target, FIXED_TIME, FIXED_TIME);
}

async function payloadRecord(payloadRoot, path) {
  const target = resolve(payloadRoot, ...path.split("/"));
  const stableFile = await readStableRegularFile(
    target,
    `payload file ${path}`,
  );
  return Object.freeze({
    bytes: stableFile.bytes.length,
    mode: stableFile.mode.toString(8).padStart(4, "0"),
    path,
    sha256: byteDigest(stableFile.bytes),
  });
}

function releaseManifestCore(manifest) {
  const core = { ...manifest };
  Reflect.deleteProperty(core, "contentHash");
  Reflect.deleteProperty(core, "releaseId");
  return core;
}

async function assertExactCleanSource(repositoryRoot, sourceCommit) {
  assertCommit(sourceCommit);
  assert.equal(
    await git(repositoryRoot, ["rev-parse", "HEAD"]),
    sourceCommit,
    "qualification source must equal checked-out HEAD",
  );
  assert.equal(
    await git(repositoryRoot, ["status", "--porcelain", "--untracked-files=all"]),
    "",
    "qualification source must be clean",
  );
  const sourceTree = await git(repositoryRoot, [
    "rev-parse",
    `${sourceCommit}^{tree}`,
  ]);
  assertCommit(sourceTree, "source tree");
  return sourceTree;
}

async function assertRuntimePackageClosure(repositoryRoot, policy) {
  const manifestBytes = await readFile(resolve(
    repositoryRoot,
    policy.runtimeArtifact.runtimePackageManifest,
  ));
  const lockBytes = await readFile(resolve(
    repositoryRoot,
    policy.runtimeArtifact.runtimePackageLock,
  ));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const lock = JSON.parse(lockBytes.toString("utf8"));
  assert.deepEqual(
    manifest.dependencies,
    policy.runtimeArtifact.externalDependencies,
    "collector runtime dependencies drifted",
  );
  assert.deepEqual(
    lock.packages?.[""]?.dependencies,
    policy.runtimeArtifact.externalDependencies,
    "collector runtime lock root drifted",
  );
  assert.equal(lock.packages?.[""]?.devDependencies, undefined);
  assert.equal(lock.lockfileVersion, 3);
  assert.ok(
    Object.keys(lock.packages ?? {}).length >= 10 &&
      Object.keys(lock.packages ?? {}).length <= 20,
    "collector runtime dependency closure is unexpectedly broad",
  );
  return Object.freeze({
    lockBytes,
    lockDigest: byteDigest(lockBytes),
    manifestBytes,
    manifestDigest: byteDigest(manifestBytes),
    packageCount: Object.keys(lock.packages ?? {}).length,
  });
}

async function buildApplicationPayload({
  payloadRoot,
  policyBinding,
  repositoryRoot,
  sourceCommit,
  sourceTree,
}) {
  const { policy, digest: policyDigest } = policyBinding;
  const compiledRoot = resolve(
    repositoryRoot,
    policy.runtimeArtifact.compiledRoot,
  );
  const compiledFiles = await listRegularFiles(compiledRoot);
  const compiledTests = compiledFiles.filter((path) => path.endsWith(".test.js"));
  assert.ok(
    compiledFiles.length >= policy.runtimeArtifact.minimumCompiledFileCount &&
      compiledFiles.length <= policy.runtimeArtifact.maximumCompiledFileCount,
    "compiled collector file count escaped its frozen boundary",
  );
  assert.deepEqual(compiledTests, [
    policy.runtimeArtifact.requiredDiagnostic,
  ]);
  assert.ok(
    compiledFiles.includes(policy.runtimeArtifact.entrypoint),
    "compiled collector entrypoint is absent",
  );
  const runtimeTree = await canonicalTreeIdentity(compiledRoot, {
    maximumEntries: policy.runtimeArtifact.maximumCompiledFileCount,
  });
  assert.equal(runtimeTree.symlinkCount, 0);
  assert.equal(runtimeTree.directoryCount > 0, true);
  const dependency = await assertRuntimePackageClosure(repositoryRoot, policy);

  for (const path of compiledFiles) {
    await writePayloadFile(
      payloadRoot,
      `runtime/v2/${path}`,
      await readFile(resolve(compiledRoot, ...path.split("/"))),
      path === policy.runtimeArtifact.entrypoint ? 0o555 : 0o444,
    );
  }
  const sourceMappings = [
    ...SOURCE_FILES.map((path) => ({ bundlePath: `source/${path}`, path })),
    {
      bundlePath: "source/deploy/v2/m1-collector/Dockerfile",
      path: policy.runtimeArtifact.dockerfile,
    },
    {
      bundlePath: "runtime/package.json",
      path: policy.runtimeArtifact.runtimePackageManifest,
    },
    {
      bundlePath: "runtime/package-lock.json",
      path: policy.runtimeArtifact.runtimePackageLock,
    },
    {
      bundlePath: "governance/v2-a0-release-qualification-policy.v1.json",
      path: "docs/governance/v2-a0-release-qualification-policy.v1.json",
    },
  ];
  for (const mapping of sourceMappings) {
    await writePayloadFile(
      payloadRoot,
      mapping.bundlePath,
      await readFile(resolve(repositoryRoot, mapping.path)),
      0o444,
    );
  }

  const payloadPaths = await listRegularFiles(payloadRoot);
  const payloadFiles = await Promise.all(
    payloadPaths.map((path) => payloadRecord(payloadRoot, path)),
  );
  const manifestCore = {
    schemaVersion: RELEASE_INPUT_SCHEMA,
    evidenceClass:
      "DETERMINISTIC_APPLICATION_LAYER_INPUT_NOT_PRODUCTION_DEPLOYMENT",
    sourceCommit,
    sourceTree,
    sourceDateEpoch: DETERMINISTIC_USTAR_SOURCE_DATE_EPOCH,
    nodeVersion: policy.runtimeArtifact.nodeVersion,
    npmVersion: policy.runtimeArtifact.npmVersion,
    policyDigest,
    dockerfileDigest: payloadFiles.find(
      (file) => file.path ===
        "source/deploy/v2/m1-collector/Dockerfile",
    )?.sha256,
    compileConfigDigest: payloadFiles.find(
      (file) => file.path ===
        "source/tsconfig.v2-m1-collector-image.json",
    )?.sha256,
    sourcePackageLockDigest: payloadFiles.find(
      (file) => file.path === "source/package-lock.json",
    )?.sha256,
    runtimePackageManifestDigest: dependency.manifestDigest,
    runtimePackageLockDigest: dependency.lockDigest,
    runtimePackageCount: dependency.packageCount,
    compiledRuntimeTreeDigest: runtimeTree.digest,
    compiledRuntimeFileCount: compiledFiles.length,
    compiledRuntimeTestCount: compiledTests.length,
    payloadFiles,
    productionRead: false,
    productionMutation: false,
    automaticTradingAllowed: false,
  };
  for (const [label, value] of Object.entries({
    compileConfigDigest: manifestCore.compileConfigDigest,
    dockerfileDigest: manifestCore.dockerfileDigest,
    sourcePackageLockDigest: manifestCore.sourcePackageLockDigest,
  })) {
    assertSha256(value, label);
  }
  const contentHash = stableDigest(manifestCore);
  const manifest = {
    ...manifestCore,
    releaseId: `a0-application:${contentHash.slice(7, 31)}`,
    contentHash,
  };
  await writePayloadFile(
    payloadRoot,
    "manifest/release-input.json",
    Buffer.from(canonicalJson(manifest), "utf8"),
    0o444,
  );
  return Object.freeze({
    compiledFileCount: compiledFiles.length,
    compiledTestCount: compiledTests.length,
    manifest,
    runtimeTreeDigest: runtimeTree.digest,
  });
}

export async function verifyApplicationCapsule({
  archivePath,
  expectedPolicyDigest,
  expectedSourceCommit,
  maximumArchiveBytes,
}) {
  const parsed = await readDeterministicUstar({
    archivePath,
    maxArchiveBytes: maximumArchiveBytes,
    maxEntries: 512,
  });
  const byPath = new Map(parsed.entries.map((entry) => [entry.entry, entry]));
  const manifestEntry = byPath.get("manifest/release-input.json");
  assert.ok(manifestEntry, "application release manifest is absent");
  const manifest = JSON.parse(manifestEntry.bytes.toString("utf8"));
  assert.equal(manifest.schemaVersion, RELEASE_INPUT_SCHEMA);
  assert.equal(manifest.sourceCommit, expectedSourceCommit);
  assert.equal(manifest.policyDigest, expectedPolicyDigest);
  assert.equal(manifest.productionRead, false);
  assert.equal(manifest.productionMutation, false);
  assert.equal(manifest.automaticTradingAllowed, false);
  assertSha256(
    manifest.compiledRuntimeTreeDigest,
    "compiled runtime tree digest",
  );
  const expectedContentHash = stableDigest(releaseManifestCore(manifest));
  assert.equal(manifest.contentHash, expectedContentHash);
  assert.equal(
    manifest.releaseId,
    `a0-application:${expectedContentHash.slice(7, 31)}`,
  );
  assert.ok(Array.isArray(manifest.payloadFiles));
  const expectedPaths = [
    ...manifest.payloadFiles.map((file) => file.path),
    "manifest/release-input.json",
  ].sort(lexicalOrder);
  assert.deepEqual(
    parsed.entries.map((entry) => entry.entry),
    expectedPaths,
    "application capsule entry accounting drifted",
  );
  for (const file of manifest.payloadFiles) {
    const observed = byPath.get(file.path);
    assert.ok(observed, `application capsule file is absent: ${file.path}`);
    assert.equal(observed.size, file.bytes);
    assert.equal(
      observed.mode.toString(8).padStart(4, "0"),
      file.mode,
    );
    assert.equal(byteDigest(observed.bytes), file.sha256);
  }
  return Object.freeze({
    archiveBytes: parsed.archiveBytes,
    archiveDigest: byteDigest(await readFile(archivePath)),
    entryCount: parsed.entryCount,
    manifest,
  });
}

async function syncFile(path) {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(path) {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeActivePointer(drillRoot, pointer) {
  const slotsRoot = resolve(drillRoot, "slots");
  const slotPath = resolve(slotsRoot, pointer.slotName);
  assert.ok(
    slotPath.startsWith(`${slotsRoot}${sep}`),
    "active slot escaped its root",
  );
  assert.equal((await stat(slotPath)).isDirectory(), true);
  const activePath = resolve(drillRoot, "active-release.json");
  const temporaryPath = resolve(
    drillRoot,
    `.active-release.${randomUUID()}.tmp`,
  );
  await writeFile(temporaryPath, canonicalJson(pointer), {
    flag: "wx",
    mode: 0o600,
  });
  await syncFile(temporaryPath);
  await rename(temporaryPath, activePath);
  await syncDirectory(drillRoot);
}

async function readActivePointer(drillRoot) {
  const pointer = JSON.parse(
    await readFile(resolve(drillRoot, "active-release.json"), "utf8"),
  );
  assert.equal(pointer.schemaVersion, ACTIVE_POINTER_SCHEMA);
  assertSha256(pointer.archiveDigest, "active archive digest");
  return pointer;
}

async function installApplicationCapsule({
  archivePath,
  drillRoot,
  expectedPolicyDigest,
  expectedSourceCommit,
  maximumArchiveBytes,
}) {
  const verified = await verifyApplicationCapsule({
    archivePath,
    expectedPolicyDigest,
    expectedSourceCommit,
    maximumArchiveBytes,
  });
  const slotName = `release-${verified.archiveDigest.slice(7, 31)}`;
  const slotPath = resolve(drillRoot, "slots", slotName);
  try {
    await extractDeterministicUstar({
      archivePath,
      destination: slotPath,
      maxArchiveBytes: maximumArchiveBytes,
      maxEntries: 512,
    });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const installed = JSON.parse(
      await readFile(resolve(slotPath, "manifest/release-input.json"), "utf8"),
    );
    assert.equal(installed.contentHash, verified.manifest.contentHash);
  }
  return Object.freeze({
    pointer: {
      schemaVersion: ACTIVE_POINTER_SCHEMA,
      archiveDigest: verified.archiveDigest,
      manifestContentHash: verified.manifest.contentHash,
      releaseId: verified.manifest.releaseId,
      slotName,
    },
    slotPath,
    verified,
  });
}

async function activateApplicationCapsule(input) {
  const baseline = await readActivePointer(input.drillRoot);
  const installed = await installApplicationCapsule(input);
  await writeActivePointer(input.drillRoot, installed.pointer);
  let healthy;
  try {
    healthy = await input.healthProbe(installed.slotPath);
  } catch {
    healthy = false;
  }
  if (!healthy) {
    await writeActivePointer(input.drillRoot, baseline);
    assert.deepEqual(await readActivePointer(input.drillRoot), baseline);
    return Object.freeze({
      activePointer: baseline,
      status: "HEALTH_FAILED_AUTO_ROLLBACK_EXACT",
    });
  }
  assert.deepEqual(
    await readActivePointer(input.drillRoot),
    installed.pointer,
  );
  return Object.freeze({
    activePointer: installed.pointer,
    status: "ACTIVATED_HEALTHY",
  });
}

function tamperArchiveBytes(bytes) {
  const output = Buffer.from(bytes);
  const marker = Buffer.from(RELEASE_INPUT_SCHEMA, "utf8");
  const offset = output.indexOf(marker);
  assert.ok(offset >= 0, "tamper marker is absent");
  output[offset] = output[offset] === 0x6d ? 0x6e : 0x6d;
  return output;
}

export async function runIsolatedRollbackDrill({
  archivePath,
  drillRoot,
  expectedPolicyDigest,
  expectedSourceCommit,
  maximumArchiveBytes,
}) {
  await mkdir(resolve(drillRoot, "slots"), { recursive: true, mode: 0o700 });
  const baselineBytes = Buffer.from(
    canonicalJson({
      schemaVersion: "market-radar-v2-a0-isolated-baseline.v1",
      purpose: "ROLLBACK_MECHANISM_DRILL_ONLY",
      production: false,
    }),
    "utf8",
  );
  const baselineDigest = byteDigest(baselineBytes);
  const baselineSlotName = `baseline-${baselineDigest.slice(7, 31)}`;
  const baselineSlot = resolve(drillRoot, "slots", baselineSlotName);
  await mkdir(baselineSlot, { mode: 0o700 });
  await writeFile(resolve(baselineSlot, "baseline.json"), baselineBytes, {
    flag: "wx",
    mode: 0o400,
  });
  const baselinePointer = {
    schemaVersion: ACTIVE_POINTER_SCHEMA,
    archiveDigest: baselineDigest,
    manifestContentHash: baselineDigest,
    releaseId: `isolated-baseline:${baselineDigest.slice(7, 31)}`,
    slotName: baselineSlotName,
  };
  await writeActivePointer(drillRoot, baselinePointer);

  const tamperedPath = resolve(drillRoot, "tampered-candidate.tar");
  await writeFile(
    tamperedPath,
    tamperArchiveBytes(await readFile(archivePath)),
    { flag: "wx", mode: 0o600 },
  );
  await assert.rejects(
    () => activateApplicationCapsule({
      archivePath: tamperedPath,
      drillRoot,
      expectedPolicyDigest,
      expectedSourceCommit,
      healthProbe: async () => true,
      maximumArchiveBytes,
    }),
  );
  assert.deepEqual(await readActivePointer(drillRoot), baselinePointer);

  const failedHealth = await activateApplicationCapsule({
    archivePath,
    drillRoot,
    expectedPolicyDigest,
    expectedSourceCommit,
    healthProbe: async () => false,
    maximumArchiveBytes,
  });
  assert.equal(failedHealth.status, "HEALTH_FAILED_AUTO_ROLLBACK_EXACT");
  assert.deepEqual(await readActivePointer(drillRoot), baselinePointer);

  const activated = await activateApplicationCapsule({
    archivePath,
    drillRoot,
    expectedPolicyDigest,
    expectedSourceCommit,
    healthProbe: async (slotPath) => {
      const entrypoint = resolve(
        slotPath,
        "runtime/v2/entrypoints/m1-collector-worker.js",
      );
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        ["--check", entrypoint],
        {
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
          timeout: 30_000,
        },
      );
      return stdout === "" && stderr === "";
    },
    maximumArchiveBytes,
  });
  assert.equal(activated.status, "ACTIVATED_HEALTHY");
  assert.notDeepEqual(activated.activePointer, baselinePointer);
  await writeActivePointer(drillRoot, baselinePointer);
  assert.deepEqual(await readActivePointer(drillRoot), baselinePointer);

  return Object.freeze({
    baselineDigest,
    scenarios: Object.freeze([
      {
        scenario: "TAMPERED_CANDIDATE_BLOCKED_BEFORE_ACTIVATION",
        status: "PASS_POINTER_UNCHANGED",
      },
      {
        scenario:
          "VALID_CANDIDATE_HEALTH_FAILURE_AUTO_RESTORES_EXACT_BASELINE",
        status: "PASS_EXACT_BASELINE_RESTORED",
      },
      {
        scenario:
          "VALID_CANDIDATE_ACTIVATES_THEN_EXPLICIT_ROLLBACK_RESTORES_EXACT_BASELINE",
        status: "PASS_EXACT_BASELINE_RESTORED",
      },
    ]),
  });
}

export async function runLocalA0ReleaseQualification({
  outputRoot,
  repositoryRoot,
  sourceCommit,
  verifyCleanSource = true,
}) {
  const root = resolve(repositoryRoot);
  const output = resolve(outputRoot);
  const policyBinding = await loadA0ReleaseQualificationPolicy(root);
  const sourceTree = verifyCleanSource
    ? await assertExactCleanSource(root, sourceCommit)
    : await git(root, ["rev-parse", `${sourceCommit}^{tree}`]);
  if (verifyCleanSource) {
    assert.equal(process.version, `v${policyBinding.policy.runtimeArtifact.nodeVersion}`);
    const { stdout } = await execFileAsync("npm", ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(
      stdout.trim(),
      policyBinding.policy.runtimeArtifact.npmVersion,
      "qualification npm runtime drifted",
    );
  }
  await mkdir(output, { mode: 0o700, recursive: false });
  const payloadRoot = resolve(output, "application-payload");
  await mkdir(payloadRoot, { mode: 0o700 });
  const payload = await buildApplicationPayload({
    payloadRoot,
    policyBinding,
    repositoryRoot: root,
    sourceCommit,
    sourceTree,
  });
  const entries = await listRegularFiles(payloadRoot);
  const firstArchive = resolve(output, "application-release-a.tar");
  const secondArchive = resolve(output, "application-release-b.tar");
  const firstWrite = await writeDeterministicUstar({
    archivePath: firstArchive,
    entries,
    root: payloadRoot,
  });
  const secondWrite = await writeDeterministicUstar({
    archivePath: secondArchive,
    entries: [...entries].reverse(),
    root: payloadRoot,
  });
  const firstBytes = await readFile(firstArchive);
  const secondBytes = await readFile(secondArchive);
  assert.deepEqual(firstBytes, secondBytes);
  assert.ok(
    firstBytes.length <=
      policyBinding.policy.reproducibility.maximumApplicationCapsuleBytes,
    "application capsule exceeded its frozen byte budget",
  );
  const verified = await verifyApplicationCapsule({
    archivePath: firstArchive,
    expectedPolicyDigest: policyBinding.digest,
    expectedSourceCommit: sourceCommit,
    maximumArchiveBytes:
      policyBinding.policy.reproducibility.maximumApplicationCapsuleBytes,
  });
  assert.equal(firstWrite.entryCount, secondWrite.entryCount);
  assert.equal(firstWrite.archiveBytes, secondWrite.archiveBytes);
  assert.equal(verified.manifest.contentHash, payload.manifest.contentHash);

  const drillRoot = resolve(output, "isolated-release-drill");
  await mkdir(drillRoot, { mode: 0o700 });
  const rollback = await runIsolatedRollbackDrill({
    archivePath: firstArchive,
    drillRoot,
    expectedPolicyDigest: policyBinding.digest,
    expectedSourceCommit: sourceCommit,
    maximumArchiveBytes:
      policyBinding.policy.reproducibility.maximumApplicationCapsuleBytes,
  });
  await rm(drillRoot, { force: true, recursive: true });
  await rm(payloadRoot, { force: true, recursive: true });
  await rm(secondArchive, { force: true });

  const evidenceCore = {
    schemaVersion: A0_RELEASE_QUALIFICATION_EVIDENCE_SCHEMA,
    status:
      "PASS_DETERMINISTIC_APPLICATION_CAPSULE_AND_ISOLATED_ROLLBACK_DRILL",
    evidenceClass:
      "LOCAL_OR_GITHUB_ENGINEERING_QUALIFICATION_NOT_PRODUCTION_RECOVERY",
    sourceCommit,
    sourceTree,
    policyDigest: policyBinding.digest,
    applicationCapsule: {
      fileName: "application-release-a.tar",
      sha256: verified.archiveDigest,
      bytes: verified.archiveBytes,
      entryCount: verified.entryCount,
      manifestContentHash: verified.manifest.contentHash,
      releaseId: verified.manifest.releaseId,
      independentSerializationCount:
        policyBinding.policy.reproducibility
          .applicationCapsuleSerializationCount,
      byteIdentical: true,
      compiledRuntimeTreeDigest: payload.runtimeTreeDigest,
      compiledRuntimeFileCount: payload.compiledFileCount,
      compiledRuntimeTestCount: payload.compiledTestCount,
    },
    rollbackDrill: {
      evidenceClass: policyBinding.policy.rollbackDrill.evidenceClass,
      baselineDigest: rollback.baselineDigest,
      scenarios: rollback.scenarios,
    },
    productionRead: false,
    productionMutation: false,
    productionCredentials: false,
    automaticTradingAllowed: false,
  };
  const evidence = {
    ...evidenceCore,
    evidenceHash: stableDigest(evidenceCore),
  };
  await writeFile(
    resolve(output, "a0-release-local-evidence.json"),
    canonicalJson(evidence),
    { flag: "wx", mode: 0o600 },
  );
  return Object.freeze(evidence);
}

function parseArguments(argv) {
  const values = new Map();
  for (const argument of argv) {
    const separator = argument.indexOf("=");
    assert.ok(separator > 2 && argument.startsWith("--"), "invalid argument");
    values.set(argument.slice(2, separator), argument.slice(separator + 1));
  }
  return values;
}

const entryPath = process.argv[1] === undefined
  ? ""
  : resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  const argumentsMap = parseArguments(process.argv.slice(2));
  const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../..",
  );
  const outputRoot = argumentsMap.get("output");
  const sourceCommit = argumentsMap.get("source-commit");
  assert.ok(outputRoot, "--output is required");
  assertCommit(sourceCommit);
  const result = await runLocalA0ReleaseQualification({
    outputRoot,
    repositoryRoot,
    sourceCommit,
  });
  process.stdout.write(`${JSON.stringify({
    applicationCapsule: result.applicationCapsule.sha256,
    evidenceHash: result.evidenceHash,
    status: result.status,
  })}\n`);
}
