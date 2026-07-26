import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  canonicalTreeIdentity,
  loadA0ReleaseQualificationPolicy,
  validateA0ReleaseQualificationPolicy,
} from "./a0-release-qualification-contract.mjs";
import {
  runLocalA0ReleaseQualification,
  verifyApplicationCapsule,
} from "./a0-release-qualification.mjs";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const RELEASE_INPUT_SCHEMA =
  "market-radar-v2-a0-application-release-input.v1";

test("A0 release qualification policy is frozen and rejects weaker limits", async () => {
  const { policy } = await loadA0ReleaseQualificationPolicy(repositoryRoot);
  assert.equal(validateA0ReleaseQualificationPolicy(policy), policy);

  const weakerMemory = structuredClone(policy);
  weakerMemory.performanceBaseline.budgets.maximumRssMiB = 512;
  assert.throws(
    () => validateA0ReleaseQualificationPolicy(weakerMemory),
    /maximumRssMiB/u,
  );

  const fewerSamples = structuredClone(policy);
  fewerSamples.performanceBaseline.measuredIncrementalCycles = 12;
  assert.throws(
    () => validateA0ReleaseQualificationPolicy(fewerSamples),
    /measuredIncrementalCycles/u,
  );

  const hiddenTest = structuredClone(policy);
  hiddenTest.runtimeArtifact.allowedCompiledTestCount = 2;
  assert.throws(
    () => validateA0ReleaseQualificationPolicy(hiddenTest),
    /allowedCompiledTestCount/u,
  );

  const oneSerialization = structuredClone(policy);
  oneSerialization.reproducibility.applicationCapsuleSerializationCount = 1;
  assert.throws(
    () => validateA0ReleaseQualificationPolicy(oneSerialization),
    /applicationCapsuleSerializationCount/u,
  );

  const oneRootfsBuild = structuredClone(policy);
  oneRootfsBuild.reproducibility.independentRootfsBuildCount = 1;
  assert.throws(
    () => validateA0ReleaseQualificationPolicy(oneRootfsBuild),
    /independentRootfsBuildCount/u,
  );
});

test("canonical rootfs identity changes on bytes, modes and symlink targets", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "v2-a0-tree-"));
  try {
    const first = join(temporary, "first");
    const second = join(temporary, "second");
    await mkdir(first);
    await mkdir(second);
    await writeFile(join(first, "runtime.js"), "trusted\n", { mode: 0o444 });
    await writeFile(join(second, "runtime.js"), "trusted\n", { mode: 0o444 });
    const firstIdentity = await canonicalTreeIdentity(first);
    const secondIdentity = await canonicalTreeIdentity(second);
    assert.equal(firstIdentity.digest, secondIdentity.digest);

    await chmod(join(second, "runtime.js"), 0o644);
    await writeFile(join(second, "runtime.js"), "changed\n");
    const changed = await canonicalTreeIdentity(second);
    assert.notEqual(firstIdentity.digest, changed.digest);

    await writeFile(join(second, "runtime.js"), "trusted\n");
    await chmod(join(second, "runtime.js"), 0o555);
    const modeChanged = await canonicalTreeIdentity(second);
    assert.notEqual(firstIdentity.digest, modeChanged.digest);

    await chmod(join(second, "runtime.js"), 0o444);
    await symlink("runtime.js", join(first, "current"));
    await symlink("other.js", join(second, "current"));
    const firstLink = await canonicalTreeIdentity(first);
    const secondLink = await canonicalTreeIdentity(second);
    assert.notEqual(firstLink.digest, secondLink.digest);
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
});

test("A0 application capsule is byte-reproducible and all rollback scenarios pass", async () => {
  const compiledEntrypoint = resolve(
    repositoryRoot,
    ".tmp/m1-collector-image/v2/entrypoints/m1-collector-worker.js",
  );
  assert.equal(
    (await readFile(compiledEntrypoint, "utf8")).length > 0,
    true,
    "run build:v2-m1-collector-image before the qualification tests",
  );
  const temporary = await mkdtemp(join(tmpdir(), "v2-a0-release-"));
  const output = join(temporary, "qualification");
  try {
    const sourceCommit = execFileSync(
      "git",
      ["-C", repositoryRoot, "rev-parse", "HEAD"],
      { encoding: "utf8" },
    ).trim();
    const evidence = await runLocalA0ReleaseQualification({
      outputRoot: output,
      repositoryRoot,
      sourceCommit,
      verifyCleanSource: false,
    });
    assert.equal(
      evidence.status,
      "PASS_DETERMINISTIC_APPLICATION_CAPSULE_AND_ISOLATED_ROLLBACK_DRILL",
    );
    assert.equal(evidence.applicationCapsule.byteIdentical, true);
    assert.equal(
      evidence.applicationCapsule.independentSerializationCount,
      2,
    );
    assert.equal(
      Object.hasOwn(evidence.applicationCapsule, "independentBuildCount"),
      false,
    );
    assert.equal(evidence.applicationCapsule.compiledRuntimeTestCount, 1);
    assert.deepEqual(
      evidence.rollbackDrill.scenarios.map((scenario) => scenario.status),
      [
        "PASS_POINTER_UNCHANGED",
        "PASS_EXACT_BASELINE_RESTORED",
        "PASS_EXACT_BASELINE_RESTORED",
      ],
    );
    assert.deepEqual((await readdir(output)).sort(), [
      "a0-release-local-evidence.json",
      "application-release-a.tar",
    ]);

    const policy = await loadA0ReleaseQualificationPolicy(repositoryRoot);
    const archivePath = join(output, "application-release-a.tar");
    const archive = await readFile(archivePath);
    const marker = Buffer.from(RELEASE_INPUT_SCHEMA, "utf8");
    const markerOffset = archive.indexOf(marker);
    assert.ok(markerOffset >= 0);
    const tampered = Buffer.from(archive);
    tampered[markerOffset] ^= 1;
    const tamperedPath = join(output, "tampered.tar");
    await writeFile(tamperedPath, tampered, { mode: 0o600 });
    await assert.rejects(
      () => verifyApplicationCapsule({
        archivePath: tamperedPath,
        expectedPolicyDigest: policy.digest,
        expectedSourceCommit: sourceCommit,
        maximumArchiveBytes:
          policy.policy.reproducibility.maximumApplicationCapsuleBytes,
      }),
    );
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
});
