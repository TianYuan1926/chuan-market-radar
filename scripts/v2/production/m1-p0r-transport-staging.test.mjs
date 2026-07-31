import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
  readDeterministicUstar,
  writeDeterministicUstar,
} from "../lib/deterministic-ustar.mjs";
import {
  buildP0RTransportStageBundle,
} from "./m1-p0r-transport-staging-bundle.mjs";
import {
  deriveP0RTransportStageDispatch,
} from "./m1-p0r-transport-staging-release.mjs";
import {
  P0R_TRANSPORT_MEMBER_MODES,
  P0R_TRANSPORT_MEMBER_NAMES,
  P0R_TRANSPORT_STAGE_INNER_BUNDLE,
  P0R_TRANSPORT_STAGE_MANIFEST,
  P0R_TRANSPORT_STAGE_OUTER_MEMBER_MODES,
  P0R_TRANSPORT_STAGE_PACKAGE_ID,
  P0R_TRANSPORT_STAGE_SUCCESS_MARKER,
  canonicalJson,
  inspectP0RTransportArchive,
  sha256,
  stageP0RTransport,
  validateP0RTransportStageRequest,
} from "./m1-p0r-transport-staging.mjs";

const execFileAsync = promisify(execFile);
const FIXED_TIME = new Date(946_684_800_000);
const INNER_SOURCE_COMMIT = "a".repeat(40);
const OUTER_SOURCE_COMMIT = "b".repeat(40);
const OUTER_SOURCE_TREE = "c".repeat(40);
const RUN_ID = `p0r-20260730t120000z-${"d".repeat(32)}`;
const PLAN_DIGEST = `sha256:${"e".repeat(64)}`;
const DISPATCH_ID = "p0r-transport-stage-20260730t120100z-f00d1234";
const ISSUED_AT = "2026-07-30T12:01:00.000Z";
const EXPIRES_AT = "2026-07-30T13:01:00.000Z";

async function writeFixtureFile(root, name, bytes) {
  const target = join(root, name);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, bytes, {
    flag: "wx",
    mode: P0R_TRANSPORT_MEMBER_MODES[name],
  });
  await chmod(target, P0R_TRANSPORT_MEMBER_MODES[name]);
  await utimes(target, FIXED_TIME, FIXED_TIME);
}

async function createInnerBundle(root) {
  const payload = join(root, "inner-payload");
  await mkdir(payload, { mode: 0o700 });
  const contents = new Map();
  for (const name of P0R_TRANSPORT_MEMBER_NAMES) {
    if (name === "transport-manifest.json") continue;
    let bytes = Buffer.from(`fixture:${name}\n`);
    if (name === "cos-provisioning-plan.json") {
      bytes = Buffer.from(`${JSON.stringify({
        credentialGrant: { runId: RUN_ID },
        planDigest: PLAN_DIGEST,
        schemaVersion:
          "v2-m1-production-storage-cos-provisioning-plan.v4",
        sourceCommit: INNER_SOURCE_COMMIT,
      }, null, 2)}\n`);
    }
    contents.set(name, bytes);
  }
  const runtimeBytes = contents.get("p0r-node-runtime.tar");
  const files = [...contents.entries()]
    .map(([name, bytes]) => ({
      name,
      sha256: sha256(bytes),
      sizeBytes: bytes.length,
      sourcePath: null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const manifest = {
    age: {
      archiveSha256: "f".repeat(64),
      binarySha256: sha256(contents.get("age")),
      licenseIncluded: true,
      sourceUrl: "https://example.invalid/age.tar.gz",
      version: "v1.3.1",
    },
    approvalEligible: true,
    automaticTradingAllowed: false,
    containsPersistentCredentials: false,
    containsPrivateKey: false,
    containsSecrets: false,
    containsSensitiveDestinationMetadata: true,
    cosProvisioningPlan: {
      planDigest: PLAN_DIGEST,
      runId: RUN_ID,
    },
    files,
    migrationAllowed: false,
    nodeRuntime: {
      capsuleSchemaVersion:
        "v2-m1-production-storage-p0r-node-runtime.v1",
      capsuleSha256: sha256(runtimeBytes),
      entryCount: 3,
      nodeVersion: "22.23.1",
      npmVersion: "10.9.8",
      packageLockSha256: "1".repeat(64),
      packageManifestSha256: "2".repeat(64),
      packageVersions: { pg: "8.16.3" },
      productionNodeModulesRequired: false,
      runtimeDependencyBoundary:
        "EXACT_SOURCE_BOUND_P0R_NODE_RUNTIME_CAPSULE",
      unpackedBytes: runtimeBytes.length,
    },
    productionDatabaseMutationAllowed: false,
    productionRepositoryMutationAllowed: false,
    productionServiceMutationAllowed: false,
    reproducibleArchive: true,
    schemaVersion: "v2-m1-production-storage-p0r-transport.v3",
    sourceCommit: INNER_SOURCE_COMMIT,
    sourceDateEpoch: 946_684_800,
  };
  contents.set(
    "transport-manifest.json",
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
  );
  for (const [name, bytes] of contents) {
    await writeFixtureFile(payload, name, bytes);
  }
  const tarPath = join(root, "inner.tar");
  await writeDeterministicUstar({
    archivePath: tarPath,
    entries: P0R_TRANSPORT_MEMBER_NAMES,
    root: payload,
  });
  const output = join(root, "p0r-transport.tar.gz");
  const { stdout: compressed } = await execFileAsync(
    "gzip",
    ["-n", "-9", "-c", tarPath],
    { encoding: null, maxBuffer: 32 * 1024 * 1024 },
  );
  await writeFile(output, compressed, { flag: "wx", mode: 0o600 });
  return output;
}

async function extractOuterBundle(bundlePath, destination) {
  const tarPath = join(dirname(destination), "outer.tar");
  await writeFile(
    tarPath,
    gunzipSync(await readFile(bundlePath)),
    { flag: "wx", mode: 0o600 },
  );
  const parsed = await readDeterministicUstar({
    archivePath: tarPath,
    maxArchiveBytes: 64 * 1024 * 1024,
    maxEntries: 20,
  });
  await mkdir(destination, { mode: 0o700 });
  for (const entry of parsed.entries) {
    const target = join(destination, entry.entry);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, entry.bytes, {
      flag: "wx",
      mode: entry.mode,
    });
    await chmod(target, entry.mode);
  }
}

async function prepareFixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "p0r-transport-stage-test-")),
  );
  const stagingRoot = join(root, "staging-root");
  const deliveryRoot = join(stagingRoot, "p0r", "staging");
  const policy = {
    deliveryRoot,
    dispatchStateRoot: join(root, "dispatch-state"),
    expectedTimerUnit: "market-radar-production-dispatch.timer",
    stagingPrefix: "m1-p0r-transport-stage-",
    stagingRoot,
  };
  await mkdir(stagingRoot, { mode: 0o700 });
  const innerBundle = await createInnerBundle(root);
  const outputDirectory = join(root, "built");
  const repositoryRoot = process.cwd();
  const built = await buildP0RTransportStageBundle({
    approval: {
      dispatchId: DISPATCH_ID,
      expiresAt: EXPIRES_AT,
      issuedAt: ISSUED_AT,
      revocationEpoch: 0,
      runnerUnitName: "market-radar-p0r-stage-f00d1234",
      sourceRef: "refs/heads/codex/market-radar-v2-implementation",
    },
    innerBundlePath: innerBundle,
    outputDirectory,
    policy,
    root: repositoryRoot,
    sourceCommit: OUTER_SOURCE_COMMIT,
    sourceTree: OUTER_SOURCE_TREE,
    verifySourceBinding: false,
  });
  const sourceRoot = built.request.stagingDirectory;
  await extractOuterBundle(
    join(outputDirectory, "bundle.tar.gz"),
    sourceRoot,
  );
  await writeFile(
    join(sourceRoot, "approval-request.json"),
    canonicalJson(built.request),
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(
    join(sourceRoot, ".transport-bundle.sha256"),
    `${built.request.transportBundleSha256}\n`,
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(
    join(sourceRoot, ".dispatch.json"),
    canonicalJson({
      bundleSha256: built.request.transportBundleSha256,
      dispatchId: built.request.dispatchId,
      entrypointPath:
        "scripts/v2/production/m1-p0r-transport-staging-entrypoint.sh",
      launchSuccessMarker: built.request.launchSuccessMarker,
      packageId: built.request.packageId,
      runtimeMaxSeconds: built.request.dispatchRuntimeMaxSeconds,
      schemaVersion: "market-radar-production-dispatch.v1",
      sourceRef: built.request.sourceRef,
      stagingDirectory: built.request.stagingDirectory,
      targetCommit: built.request.sourceCommit,
      transportContainsSecrets: false,
      transportMethod: "signed_git_bundle",
    }),
    { flag: "wx", mode: 0o600 },
  );
  return {
    built,
    innerBundle,
    outputDirectory,
    policy,
    root,
    sourceRoot,
  };
}

test("transport v3 inspection binds the exact 16-member package", async () => {
  const root = await mkdtemp(join(tmpdir(), "p0r-inner-inspect-test-"));
  try {
    const path = await createInnerBundle(root);
    const inspected = await inspectP0RTransportArchive(path);
    assert.equal(inspected.memberCount, 16);
    assert.equal(inspected.runId, RUN_ID);
    assert.equal(inspected.planDigest, PLAN_DIGEST);
    assert.equal(inspected.sourceCommit, INNER_SOURCE_COMMIT);
    assert.equal(inspected.archiveSha256, sha256(await readFile(path)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("delivery request and release derive a delivery-only signed dispatch", async () => {
  const fixture = await prepareFixture();
  try {
    const request = validateP0RTransportStageRequest(
      fixture.built.request,
      {
        now: new Date(ISSUED_AT),
        policy: fixture.policy,
      },
    );
    assert.equal(request.packageId, P0R_TRANSPORT_STAGE_PACKAGE_ID);
    assert.equal(request.p0rRecoveryExecutionAllowed, false);
    assert.equal(request.credentialMaterialAllowed, false);
    const dispatch = deriveP0RTransportStageDispatch(request, {
      now: new Date(ISSUED_AT),
      policy: fixture.policy,
    });
    assert.equal(dispatch.targetCommit, OUTER_SOURCE_COMMIT);
    assert.equal(dispatch.runtimeMaxSeconds, 90);
    assert.equal(
      dispatch.launchSuccessMarker,
      P0R_TRANSPORT_STAGE_SUCCESS_MARKER,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("stage atomically writes the exact package without starting recovery", async () => {
  const fixture = await prepareFixture();
  try {
    const result = await stageP0RTransport({
      bundleMarkerPath: join(
        fixture.sourceRoot,
        ".transport-bundle.sha256",
      ),
      dispatchEnvelopePath: join(fixture.sourceRoot, ".dispatch.json"),
      innerBundlePath: join(
        fixture.sourceRoot,
        P0R_TRANSPORT_STAGE_INNER_BUNDLE,
      ),
      manifestPath: join(
        fixture.sourceRoot,
        "p0r-transport-staging-manifest.json",
      ),
      now: new Date(ISSUED_AT),
      policy: fixture.policy,
      request: fixture.built.request,
      sourceRoot: fixture.sourceRoot,
    });
    assert.equal(result.status, P0R_TRANSPORT_STAGE_SUCCESS_MARKER);
    assert.equal(result.runId, RUN_ID);
    assert.deepEqual(
      (await readdir(result.target)).sort(),
      P0R_TRANSPORT_MEMBER_NAMES,
    );
    assert.equal((await lstat(result.target)).mode & 0o777, 0o700);
    for (const name of P0R_TRANSPORT_MEMBER_NAMES) {
      const facts = await lstat(join(result.target, name));
      assert.equal(facts.isFile(), true);
      assert.equal(facts.isSymbolicLink(), false);
      assert.equal(
        facts.mode & 0o777,
        P0R_TRANSPORT_MEMBER_MODES[name],
      );
    }
    await assert.rejects(
      stageP0RTransport({
        bundleMarkerPath: join(
          fixture.sourceRoot,
          ".transport-bundle.sha256",
        ),
        dispatchEnvelopePath: join(fixture.sourceRoot, ".dispatch.json"),
        innerBundlePath: join(
          fixture.sourceRoot,
          P0R_TRANSPORT_STAGE_INNER_BUNDLE,
        ),
        manifestPath: join(
          fixture.sourceRoot,
          "p0r-transport-staging-manifest.json",
        ),
        now: new Date(ISSUED_AT),
        policy: fixture.policy,
        request: fixture.built.request,
        sourceRoot: fixture.sourceRoot,
      }),
      /p0r_transport_stage_target_already_exists/u,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("outer delivery bundle is byte reproducible for the same authority", async () => {
  const fixture = await prepareFixture();
  try {
    const secondOutput = join(fixture.root, "built-second");
    const second = await buildP0RTransportStageBundle({
      approval: {
        dispatchId: DISPATCH_ID,
        expiresAt: EXPIRES_AT,
        issuedAt: ISSUED_AT,
        revocationEpoch: 0,
        runnerUnitName: "market-radar-p0r-stage-f00d1234",
        sourceRef:
          "refs/heads/codex/market-radar-v2-implementation",
      },
      innerBundlePath: fixture.innerBundle,
      outputDirectory: secondOutput,
      policy: fixture.policy,
      root: process.cwd(),
      sourceCommit: OUTER_SOURCE_COMMIT,
      sourceTree: OUTER_SOURCE_TREE,
      verifySourceBinding: false,
    });
    assert.deepEqual(
      await readFile(join(fixture.outputDirectory, "bundle.tar.gz")),
      await readFile(join(secondOutput, "bundle.tar.gz")),
    );
    assert.equal(
      canonicalJson(fixture.built.request),
      canonicalJson(second.request),
    );
    const outerTar = join(fixture.root, "reproducible-outer.tar");
    await writeFile(
      outerTar,
      gunzipSync(await readFile(join(secondOutput, "bundle.tar.gz"))),
      { flag: "wx", mode: 0o600 },
    );
    const parsed = await readDeterministicUstar({
      archivePath: outerTar,
      maxArchiveBytes: 64 * 1024 * 1024,
      maxEntries: 5,
    });
    assert.deepEqual(
      parsed.entries.map((entry) => entry.entry).sort(),
      Object.keys(P0R_TRANSPORT_STAGE_OUTER_MEMBER_MODES).sort(),
    );
    for (const entry of parsed.entries) {
      assert.equal(
        entry.mode,
        P0R_TRANSPORT_STAGE_OUTER_MEMBER_MODES[entry.entry],
      );
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("approval expiry and destination drift fail before delivery", async () => {
  const fixture = await prepareFixture();
  try {
    assert.throws(
      () => validateP0RTransportStageRequest(
        fixture.built.request,
        {
          now: new Date("2026-07-30T13:01:00.001Z"),
          policy: fixture.policy,
        },
      ),
      /p0r_transport_stage_approval_window_invalid/u,
    );
    assert.throws(
      () => validateP0RTransportStageRequest({
        ...fixture.built.request,
        deliveryTargetDirectory: join(
          fixture.policy.deliveryRoot,
          "wrong-run",
        ),
      }, {
        now: new Date(ISSUED_AT),
        policy: fixture.policy,
      }),
      /p0r_transport_stage_destination_invalid/u,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("outer manifest extra members fail closed even when re-bound", async () => {
  const fixture = await prepareFixture();
  try {
    const manifestPath = join(
      fixture.sourceRoot,
      P0R_TRANSPORT_STAGE_MANIFEST,
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.files["unexpected.txt"] = "0".repeat(64);
    const bytes = Buffer.from(canonicalJson(manifest));
    await writeFile(manifestPath, bytes);
    await assert.rejects(
      stageP0RTransport({
        bundleMarkerPath: join(
          fixture.sourceRoot,
          ".transport-bundle.sha256",
        ),
        dispatchEnvelopePath: join(
          fixture.sourceRoot,
          ".dispatch.json",
        ),
        innerBundlePath: join(
          fixture.sourceRoot,
          P0R_TRANSPORT_STAGE_INNER_BUNDLE,
        ),
        manifestPath,
        now: new Date(ISSUED_AT),
        policy: fixture.policy,
        request: {
          ...fixture.built.request,
          artifactManifestSha256: sha256(bytes),
        },
        sourceRoot: fixture.sourceRoot,
      }),
      /p0r_transport_stage_outer_manifest_inner_mismatch/u,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("builder rejects a symlinked inner transport before reading bytes", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "p0r-transport-symlink-test-")),
  );
  try {
    const inner = await createInnerBundle(root);
    const linked = join(root, "linked-transport.tar.gz");
    await symlink(inner, linked);
    await assert.rejects(
      buildP0RTransportStageBundle({
        approval: {
          dispatchId: DISPATCH_ID,
          expiresAt: EXPIRES_AT,
          issuedAt: ISSUED_AT,
          revocationEpoch: 0,
          runnerUnitName: "market-radar-p0r-stage-f00d1234",
          sourceRef:
            "refs/heads/codex/market-radar-v2-implementation",
        },
        innerBundlePath: linked,
        outputDirectory: join(root, "built"),
        policy: {
          deliveryRoot: join(root, "delivery"),
          dispatchStateRoot: join(root, "dispatch-state"),
          expectedTimerUnit:
            "market-radar-production-dispatch.timer",
          stagingPrefix: "m1-p0r-transport-stage-",
          stagingRoot: join(root, "staging"),
        },
        root: process.cwd(),
        sourceCommit: OUTER_SOURCE_COMMIT,
        sourceTree: OUTER_SOURCE_TREE,
        verifySourceBinding: false,
      }),
      /p0r_transport_stage_inner_bundle_unsafe/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unsafe existing delivery permissions are rejected without chmod", async () => {
  const fixture = await prepareFixture();
  try {
    await mkdir(fixture.policy.deliveryRoot, {
      mode: 0o755,
      recursive: true,
    });
    await chmod(fixture.policy.deliveryRoot, 0o755);
    await assert.rejects(
      stageP0RTransport({
        bundleMarkerPath: join(
          fixture.sourceRoot,
          ".transport-bundle.sha256",
        ),
        dispatchEnvelopePath: join(
          fixture.sourceRoot,
          ".dispatch.json",
        ),
        innerBundlePath: join(
          fixture.sourceRoot,
          P0R_TRANSPORT_STAGE_INNER_BUNDLE,
        ),
        manifestPath: join(
          fixture.sourceRoot,
          P0R_TRANSPORT_STAGE_MANIFEST,
        ),
        now: new Date(ISSUED_AT),
        policy: fixture.policy,
        request: fixture.built.request,
        sourceRoot: fixture.sourceRoot,
      }),
      /p0r_transport_stage_directory_unsafe/u,
    );
    assert.equal(
      (await lstat(fixture.policy.deliveryRoot)).mode & 0o777,
      0o755,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("unsafe existing delivery ancestor is rejected before child creation", async () => {
  const fixture = await prepareFixture();
  try {
    const deliveryParent = dirname(fixture.policy.deliveryRoot);
    await mkdir(deliveryParent, {
      mode: 0o755,
      recursive: true,
    });
    await chmod(deliveryParent, 0o755);
    await assert.rejects(
      stageP0RTransport({
        bundleMarkerPath: join(
          fixture.sourceRoot,
          ".transport-bundle.sha256",
        ),
        dispatchEnvelopePath: join(
          fixture.sourceRoot,
          ".dispatch.json",
        ),
        innerBundlePath: join(
          fixture.sourceRoot,
          P0R_TRANSPORT_STAGE_INNER_BUNDLE,
        ),
        manifestPath: join(
          fixture.sourceRoot,
          P0R_TRANSPORT_STAGE_MANIFEST,
        ),
        now: new Date(ISSUED_AT),
        policy: fixture.policy,
        request: fixture.built.request,
        sourceRoot: fixture.sourceRoot,
      }),
      /p0r_transport_stage_directory_unsafe/u,
    );
    assert.equal(
      (await lstat(deliveryParent)).mode & 0o777,
      0o755,
    );
    await assert.rejects(
      lstat(fixture.policy.deliveryRoot),
      (error) => error?.code === "ENOENT",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("mutation authority and inner identity drift fail closed", async () => {
  const fixture = await prepareFixture();
  try {
    assert.throws(
      () => validateP0RTransportStageRequest({
        ...fixture.built.request,
        p0rRecoveryExecutionAllowed: true,
      }, {
        now: new Date(ISSUED_AT),
        policy: fixture.policy,
      }),
      /p0r_transport_stage_mutation_boundary_invalid/u,
    );
    const tampered = Buffer.from(
      await readFile(join(
        fixture.sourceRoot,
        P0R_TRANSPORT_STAGE_INNER_BUNDLE,
      )),
    );
    tampered[tampered.length - 1] ^= 1;
    await writeFile(
      join(fixture.sourceRoot, P0R_TRANSPORT_STAGE_INNER_BUNDLE),
      tampered,
    );
    await assert.rejects(
      stageP0RTransport({
        bundleMarkerPath: join(
          fixture.sourceRoot,
          ".transport-bundle.sha256",
        ),
        dispatchEnvelopePath: join(fixture.sourceRoot, ".dispatch.json"),
        innerBundlePath: join(
          fixture.sourceRoot,
          P0R_TRANSPORT_STAGE_INNER_BUNDLE,
        ),
        manifestPath: join(
          fixture.sourceRoot,
          "p0r-transport-staging-manifest.json",
        ),
        now: new Date(ISSUED_AT),
        policy: fixture.policy,
        request: fixture.built.request,
        sourceRoot: fixture.sourceRoot,
      }),
      /p0r_transport_stage_inner_bundle_identity_mismatch/u,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("entrypoint cleans only its fixed dispatch staging and never runs recovery", async () => {
  const [entrypoint, release] = await Promise.all([
    readFile(
      "scripts/v2/production/m1-p0r-transport-staging-entrypoint.sh",
      "utf8",
    ),
    readFile(
      "scripts/v2/production/m1-p0r-transport-staging-release.mjs",
      "utf8",
    ),
  ]);
  assert.match(entrypoint, /m1-p0r-transport-stage-/u);
  assert.match(entrypoint, /PASS_V2_M1_6_P0R_TRANSPORT_STAGED/u);
  assert.match(entrypoint, /m1-p0r-transport-staging\.mjs/u);
  assert.doesNotMatch(
    entrypoint,
    /m1-production-storage-p0r-(?:runner|session)\.sh/u,
  );
  assert.match(release, /O_NOFOLLOW/u);
  assert.match(release, /before\.mtimeNs === after\.mtimeNs/u);
  assert.match(release, /before\.ctimeNs === after\.ctimeNs/u);
});
