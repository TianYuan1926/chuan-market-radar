#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  readFile,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  A0_RELEASE_QUALIFICATION_EVIDENCE_SCHEMA,
  assertCommit,
  assertSha256,
  canonicalJson,
  canonicalTreeIdentity,
  loadA0ReleaseQualificationPolicy,
  stableDigest,
} from "./a0-release-qualification-contract.mjs";
import {
  verifyApplicationCapsule,
} from "./a0-release-qualification.mjs";
import {
  A0_RUNTIME_SMOKE_EVIDENCE_SCHEMA,
} from "./a0-runtime-smoke-evidence.mjs";

const execFileAsync = promisify(execFile);
const A0_ROOTFS_PROVENANCE_EVIDENCE_SCHEMA =
  "market-radar-v2-a0-rootfs-provenance-evidence.v1";
const MAX_GIT_OUTPUT = 4 * 1024 * 1024;

function evidenceCore(evidence) {
  const core = { ...evidence };
  Reflect.deleteProperty(core, "evidenceHash");
  return core;
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

export function validateA0ImageInspect(inspectValue, policy, sourceCommit) {
  assert.ok(Array.isArray(inspectValue) && inspectValue.length === 1);
  const image = inspectValue[0];
  assertSha256(image.Id, "image ID");
  assert.equal(image.Os, "linux");
  assert.equal(image.Architecture, "amd64");
  assert.ok(
    Number.isSafeInteger(image.Size) &&
      image.Size > 0 &&
      image.Size <= policy.reproducibility.maximumImageBytes,
    "collector image escaped its byte budget",
  );
  assert.equal(image.Config?.User, "65532:65532");
  assert.deepEqual(image.Config?.Entrypoint, [
    "/nodejs/bin/node",
    ".tmp/market-tests/v2/entrypoints/m1-collector-worker.js",
  ]);
  assert.equal(image.Config?.WorkingDir, "/app");
  assert.equal(
    image.Config?.Labels?.["org.opencontainers.image.revision"],
    sourceCommit,
  );
  const environment = new Set(image.Config?.Env ?? []);
  assert.equal(environment.has("NODE_ENV=production"), true);
  assert.equal(
    environment.has(
      "NODE_OPTIONS=--disable-proto=throw --unhandled-rejections=strict",
    ),
    true,
  );
  assert.ok(
    Array.isArray(image.RootFS?.Layers) &&
      image.RootFS.Layers.length > 0 &&
      image.RootFS.Layers.every((digest) =>
        /^sha256:[0-9a-f]{64}$/u.test(digest)
      ),
    "image layers must remain content addressed",
  );
  const configuration = {
    architecture: image.Architecture,
    entrypoint: image.Config.Entrypoint,
    environment: [...environment].sort(),
    labels: image.Config.Labels,
    layerDigests: image.RootFS.Layers,
    operatingSystem: image.Os,
    sizeBytes: image.Size,
    user: image.Config.User,
    workingDirectory: image.Config.WorkingDir,
  };
  return Object.freeze({
    configuration,
    configurationDigest: stableDigest(configuration),
    imageId: image.Id,
    sizeBytes: image.Size,
  });
}

export function validateA0RuntimeSmokeEvidence(evidence, sourceCommit) {
  assert.equal(
    evidence?.schemaVersion,
    A0_RUNTIME_SMOKE_EVIDENCE_SCHEMA,
  );
  assert.equal(
    evidence?.status,
    "PASS_RUNTIME_LOADS_AND_FAILS_CLOSED_BEFORE_NETWORK_OR_DATABASE",
  );
  assert.equal(evidence?.sourceCommit, sourceCommit);
  assert.equal(evidence?.execution?.networkMode, "NONE");
  assert.equal(evidence?.execution?.rootFilesystem, "READ_ONLY");
  assert.equal(evidence?.productionRead, false);
  assert.equal(evidence?.productionMutation, false);
  assert.equal(evidence?.productionCredentials, false);
  assert.equal(evidence?.automaticTradingAllowed, false);
  assert.equal(evidence?.evidenceHash, stableDigest(evidenceCore(evidence)));
  return evidence;
}

export function validateA0LocalReleaseEvidence(
  evidence,
  sourceCommit,
  policyDigest,
) {
  assert.equal(
    evidence?.schemaVersion,
    A0_RELEASE_QUALIFICATION_EVIDENCE_SCHEMA,
  );
  assert.equal(
    evidence?.status,
    "PASS_DETERMINISTIC_APPLICATION_CAPSULE_AND_ISOLATED_ROLLBACK_DRILL",
  );
  assert.equal(evidence?.sourceCommit, sourceCommit);
  assert.equal(evidence?.policyDigest, policyDigest);
  assert.equal(evidence?.applicationCapsule?.byteIdentical, true);
  assert.equal(
    evidence?.applicationCapsule?.independentSerializationCount,
    2,
  );
  assert.equal(evidence?.applicationCapsule?.compiledRuntimeTestCount, 1);
  assertSha256(
    evidence?.applicationCapsule?.compiledRuntimeTreeDigest,
    "compiled runtime tree digest",
  );
  assert.deepEqual(
    evidence?.rollbackDrill?.scenarios?.map((scenario) => scenario.status),
    [
      "PASS_POINTER_UNCHANGED",
      "PASS_EXACT_BASELINE_RESTORED",
      "PASS_EXACT_BASELINE_RESTORED",
    ],
  );
  assert.equal(evidence?.productionRead, false);
  assert.equal(evidence?.productionMutation, false);
  assert.equal(evidence?.productionCredentials, false);
  assert.equal(evidence?.automaticTradingAllowed, false);
  assert.equal(evidence?.evidenceHash, stableDigest(evidenceCore(evidence)));
  return evidence;
}

async function validateRootfsComposition(rootfsRoot, identity, policy) {
  assert.ok(
    identity.entryCount <= policy.reproducibility.maximumRootfsFileCount,
    "rootfs entry count escaped its boundary",
  );
  const paths = new Set(identity.entries.map((entry) => entry.path));
  for (const required of [
    "app/package.json",
    "app/.tmp/market-tests/v2/entrypoints/m1-collector-worker.js",
    "app/.tmp/market-tests/v2/modules/market-fact/collector/collector-live.integration.test.js",
    "app/node_modules/pg/package.json",
    "app/node_modules/zod/package.json",
  ]) {
    assert.equal(paths.has(required), true, `rootfs path is absent: ${required}`);
  }
  for (const forbidden of [
    "app/.env",
    "app/.git",
    "app/deploy",
    "app/scripts",
    "app/src",
    "app/node_modules/next",
    "app/node_modules/react",
    "app/node_modules/react-dom",
    "app/node_modules/sharp",
    "app/node_modules/tailwindcss",
  ]) {
    assert.equal(
      [...paths].some((path) => path === forbidden || path.startsWith(`${forbidden}/`)),
      false,
      `forbidden runtime path is present: ${forbidden}`,
    );
  }
  const compiledTests = [...paths].filter(
    (path) =>
      path.startsWith("app/.tmp/market-tests/v2/") &&
      path.endsWith(".test.js"),
  );
  assert.deepEqual(compiledTests, [
    "app/.tmp/market-tests/v2/modules/market-fact/collector/collector-live.integration.test.js",
  ]);
  const runtimePackage = JSON.parse(await readFile(
    resolve(rootfsRoot, "app/package.json"),
    "utf8",
  ));
  assert.deepEqual(
    runtimePackage.dependencies,
    policy.runtimeArtifact.externalDependencies,
  );
  assert.equal(runtimePackage.devDependencies, undefined);
}

export async function buildA0RootfsProvenanceEvidence({
  applicationCapsulePath,
  imageInspectPath,
  localEvidencePath,
  outputPath,
  repositoryRoot,
  rootfsA,
  rootfsB,
  runtimeSmokePath,
  sourceCommit,
}) {
  assertCommit(sourceCommit);
  const root = resolve(repositoryRoot);
  assert.equal(await git(root, ["rev-parse", "HEAD"]), sourceCommit);
  assert.equal(
    await git(root, ["status", "--porcelain", "--untracked-files=all"]),
    "",
    "rootfs qualification requires exact clean source",
  );
  const sourceTree = await git(root, [
    "rev-parse",
    `${sourceCommit}^{tree}`,
  ]);
  assertCommit(sourceTree, "source tree");
  const policyBinding = await loadA0ReleaseQualificationPolicy(root);
  const [firstRootfs, secondRootfs] = await Promise.all([
    canonicalTreeIdentity(rootfsA, {
      maximumEntries:
        policyBinding.policy.reproducibility.maximumRootfsFileCount,
    }),
    canonicalTreeIdentity(rootfsB, {
      maximumEntries:
        policyBinding.policy.reproducibility.maximumRootfsFileCount,
    }),
  ]);
  assert.equal(
    firstRootfs.digest,
    secondRootfs.digest,
    "independent rootfs builds are not reproducible",
  );
  assert.deepEqual(
    {
      directoryCount: firstRootfs.directoryCount,
      entryCount: firstRootfs.entryCount,
      fileCount: firstRootfs.fileCount,
      payloadBytes: firstRootfs.payloadBytes,
      symlinkCount: firstRootfs.symlinkCount,
    },
    {
      directoryCount: secondRootfs.directoryCount,
      entryCount: secondRootfs.entryCount,
      fileCount: secondRootfs.fileCount,
      payloadBytes: secondRootfs.payloadBytes,
      symlinkCount: secondRootfs.symlinkCount,
    },
  );
  await validateRootfsComposition(
    resolve(rootfsA),
    firstRootfs,
    policyBinding.policy,
  );
  await validateRootfsComposition(
    resolve(rootfsB),
    secondRootfs,
    policyBinding.policy,
  );
  const [firstCompiledRuntime, secondCompiledRuntime] = await Promise.all([
    canonicalTreeIdentity(
      resolve(rootfsA, "app/.tmp/market-tests/v2"),
      {
        maximumEntries:
          policyBinding.policy.runtimeArtifact.maximumCompiledFileCount * 2,
      },
    ),
    canonicalTreeIdentity(
      resolve(rootfsB, "app/.tmp/market-tests/v2"),
      {
        maximumEntries:
          policyBinding.policy.runtimeArtifact.maximumCompiledFileCount * 2,
      },
    ),
  ]);
  assert.equal(
    firstCompiledRuntime.digest,
    secondCompiledRuntime.digest,
    "compiled collector runtime drifted across independent rootfs builds",
  );

  const localEvidence = validateA0LocalReleaseEvidence(
    JSON.parse(await readFile(localEvidencePath, "utf8")),
    sourceCommit,
    policyBinding.digest,
  );
  assert.equal(
    firstCompiledRuntime.digest,
    localEvidence.applicationCapsule.compiledRuntimeTreeDigest,
    "application capsule runtime does not match the Docker rootfs runtime",
  );
  assert.equal(
    firstCompiledRuntime.fileCount,
    localEvidence.applicationCapsule.compiledRuntimeFileCount,
  );
  const capsule = await verifyApplicationCapsule({
    archivePath: applicationCapsulePath,
    expectedPolicyDigest: policyBinding.digest,
    expectedSourceCommit: sourceCommit,
    maximumArchiveBytes:
      policyBinding.policy.reproducibility.maximumApplicationCapsuleBytes,
  });
  assert.equal(
    capsule.archiveDigest,
    localEvidence.applicationCapsule.sha256,
  );
  assert.equal(
    capsule.manifest.compiledRuntimeTreeDigest,
    firstCompiledRuntime.digest,
    "capsule manifest runtime does not match the Docker rootfs runtime",
  );
  const runtimeSmoke = validateA0RuntimeSmokeEvidence(
    JSON.parse(await readFile(runtimeSmokePath, "utf8")),
    sourceCommit,
  );
  const image = validateA0ImageInspect(
    JSON.parse(await readFile(imageInspectPath, "utf8")),
    policyBinding.policy,
    sourceCommit,
  );
  const qualificationIdentity = stableDigest({
    sourceCommit,
    sourceTree,
    policyDigest: policyBinding.digest,
    applicationCapsuleDigest: capsule.archiveDigest,
    compiledRuntimeTreeDigest: firstCompiledRuntime.digest,
    rootfsDigest: firstRootfs.digest,
    imageConfigurationDigest: image.configurationDigest,
    runtimeSmokeEvidenceHash: runtimeSmoke.evidenceHash,
  });
  const evidenceCoreValue = {
    schemaVersion: A0_ROOTFS_PROVENANCE_EVIDENCE_SCHEMA,
    status:
      "PASS_REPRODUCIBLE_ROOTFS_EXACT_CONFIG_PROVENANCE_AND_ROLLBACK",
    evidenceClass:
      "GITHUB_HOSTED_ENGINEERING_QUALIFICATION_NOT_PRODUCTION_DEPLOYMENT",
    sourceCommit,
    sourceTree,
    policyDigest: policyBinding.digest,
    qualificationIdentity,
    applicationCapsule: {
      sha256: capsule.archiveDigest,
      bytes: capsule.archiveBytes,
      entryCount: capsule.entryCount,
      releaseId: capsule.manifest.releaseId,
      byteIdenticalSerializationCount:
        policyBinding.policy.reproducibility
          .applicationCapsuleSerializationCount,
    },
    compiledRuntime: {
      canonicalDigest: firstCompiledRuntime.digest,
      fileCount: firstCompiledRuntime.fileCount,
      directoryCount: firstCompiledRuntime.directoryCount,
      capsuleMatch: true,
    },
    rootfs: {
      canonicalDigest: firstRootfs.digest,
      independentBuildCount:
        policyBinding.policy.reproducibility.independentRootfsBuildCount,
      entryCount: firstRootfs.entryCount,
      fileCount: firstRootfs.fileCount,
      directoryCount: firstRootfs.directoryCount,
      symlinkCount: firstRootfs.symlinkCount,
      payloadBytes: firstRootfs.payloadBytes,
    },
    image: {
      imageId: image.imageId,
      configurationDigest: image.configurationDigest,
      sizeBytes: image.sizeBytes,
      user: image.configuration.user,
      entrypoint: image.configuration.entrypoint,
    },
    rollbackDrill: {
      evidenceHash: localEvidence.evidenceHash,
      evidenceClass: localEvidence.rollbackDrill.evidenceClass,
      scenarios: localEvidence.rollbackDrill.scenarios,
    },
    runtimeSmoke: {
      evidenceHash: runtimeSmoke.evidenceHash,
      status: runtimeSmoke.status,
    },
    claims: {
      reproducibleApplicationCapsule: true,
      reproducibleCanonicalRootfs: true,
      bitIdenticalOciArchiveClaimed: false,
      productionRollbackExecuted: false,
      p0rDatabaseRecoveryExecuted: false,
      productionRead: false,
      productionMutation: false,
      productionCredentials: false,
      automaticTradingAllowed: false,
    },
  };
  const evidence = {
    ...evidenceCoreValue,
    evidenceHash: stableDigest(evidenceCoreValue),
  };
  await writeFile(outputPath, canonicalJson(evidence), {
    flag: "wx",
    mode: 0o600,
  });
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
  const values = parseArguments(process.argv.slice(2));
  const required = [
    "application-capsule",
    "image-inspect",
    "local-evidence",
    "output",
    "rootfs-a",
    "rootfs-b",
    "runtime-smoke",
    "source-commit",
  ];
  for (const key of required) assert.ok(values.get(key), `--${key} is required`);
  const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../..",
  );
  const evidence = await buildA0RootfsProvenanceEvidence({
    applicationCapsulePath: values.get("application-capsule"),
    imageInspectPath: values.get("image-inspect"),
    localEvidencePath: values.get("local-evidence"),
    outputPath: values.get("output"),
    repositoryRoot,
    rootfsA: values.get("rootfs-a"),
    rootfsB: values.get("rootfs-b"),
    runtimeSmokePath: values.get("runtime-smoke"),
    sourceCommit: values.get("source-commit"),
  });
  process.stdout.write(`${JSON.stringify({
    evidenceHash: evidence.evidenceHash,
    qualificationIdentity: evidence.qualificationIdentity,
    status: evidence.status,
  })}\n`);
}
