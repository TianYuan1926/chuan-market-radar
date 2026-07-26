import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  writeDeterministicUstar,
} from "../lib/deterministic-ustar.mjs";
import {
  generateSigningKeyPair,
  prepareDispatch,
  validateOutbox,
} from "./fixed-channel/production-dispatch.mjs";
import {
  buildP0RRebindBundle,
} from "./m1-p0r-rebind-preflight-bundle.mjs";
import {
  P0R_REBIND_CRITICAL_FILES,
  P0R_REBIND_ENTRYPOINT,
  P0R_REBIND_MANIFEST,
  P0R_REBIND_MANIFEST_SCHEMA,
  P0R_REBIND_METADATA_ENDPOINT,
  P0R_REBIND_PACKAGE_ID,
  P0R_REBIND_REQUEST_SCHEMA,
  P0R_REBIND_RUNNER,
  P0R_REBIND_SUCCESS_MARKER,
  canonicalJson,
  inspectP0REphemeralSecretBaseline,
  inspectSupersededP0RStaging,
  p0rRebindReadOnlyInvocation,
  runP0RRebindPreflight,
  sha256,
  validateP0RRebindRequest,
  verifyP0RSourceIpBinding,
  writeExclusiveCanonical,
} from "./m1-p0r-rebind-preflight.mjs";

const execFileAsync = promisify(execFile);
const SOURCE_COMMIT = "a".repeat(40);
const SOURCE_TREE = "b".repeat(40);
const LEGACY_SOURCE_COMMIT = "c".repeat(40);
const PRODUCTION_HEAD = "d".repeat(40);
const SOURCE_REF = "refs/heads/codex/market-radar-v2-implementation";
const ISSUED_AT = "2026-07-27T01:00:00.000Z";
const EXPIRES_AT = "2026-07-27T02:00:00.000Z";
const DISPATCH_ID = "p0r-rebind-preflight-20260727t010000z";
const RUNNER_UNIT = "market-radar-p0r-rebind-test20260727";
const LEGACY_RUN_ID = `p0r-20260727t000000z-${"1".repeat(32)}`;
const SOURCE_IP_CIDR = "203.0.113.24/32";
const CONTAINER_IDS = Object.freeze(
  Array.from(
    { length: 11 },
    (_, index) => (index + 1).toString(16).padStart(64, "0"),
  ),
);

const LEGACY_FILE_NAMES = Object.freeze([
  "AGE-LICENSE",
  "age",
  "age-recipient.txt",
  "cos-provisioning-plan.json",
  "m1-production-storage-backup-capture.mjs",
  "m1-production-storage-database-fingerprint.mjs",
  "m1-production-storage-p0r-cos-provisioning.mjs",
  "m1-production-storage-p0r-runner.sh",
  "m1-production-storage-read-only-preflight.mjs",
  "m1-production-storage-recovery-evidence.mjs",
  "p0r-bindings.env",
  "p0r-cos-archive",
]);

function testPolicy(root) {
  return {
    dispatchStateRoot: join(root, "state"),
    evidenceRoot: join(root, "state/evidence/m1-p0r-rebind"),
    expectedTimerUnit: "market-radar-production-dispatch.timer",
    p0rStagingRoot: join(root, "p0r/staging"),
    productionWorktree: join(root, "production"),
    shmRoot: join(root, "shm"),
    stagingPrefix: "m1-p0r-rebind-",
    stagingRoot: join(root, "staging"),
  };
}

function currentCriticalFileDigests() {
  return Object.fromEntries(
    P0R_REBIND_CRITICAL_FILES.map((name) => [
      name,
      sha256(`current:${name}`),
    ]),
  );
}

async function createLegacyFixture(root, {
  archiveName = "legacy.tar.gz",
  stagingDirectory = join(root, "legacy-payload"),
} = {}) {
  await mkdir(stagingDirectory, { recursive: true, mode: 0o700 });
  const plan = {
    bucketConfiguration: {},
    credentialGrant: {
      bucket: "restricted-test-bucket",
      objectKey: `market-radar-v2/p0r/2026-07-27/${LEGACY_RUN_ID}.dump.age`,
      runId: LEGACY_RUN_ID,
      sourceIpCidr: SOURCE_IP_CIDR,
    },
    overwriteProtection: {},
    planDigest: `sha256:${"2".repeat(64)}`,
    plannedAt: "2026-07-27T00:00:00.000Z",
    schemaVersion: "v2-m1-production-storage-cos-provisioning-plan.v2",
    sourceCommit: LEGACY_SOURCE_COMMIT,
    stsRequest: {},
  };
  const bytesByName = Object.fromEntries(
    LEGACY_FILE_NAMES.map((name) => [
      name,
      Buffer.from(`legacy fixture for ${name}\n`),
    ]),
  );
  bytesByName["cos-provisioning-plan.json"] =
    Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
  bytesByName["p0r-bindings.env"] =
    Buffer.from(`P0R_SOURCE_COMMIT=${LEGACY_SOURCE_COMMIT}\n`);
  const files = LEGACY_FILE_NAMES.map((name) => ({
    name,
    sha256: sha256(bytesByName[name]),
    sizeBytes: bytesByName[name].length,
    sourcePath: null,
  }));
  const manifest = {
    age: {},
    approvalEligible: true,
    automaticTradingAllowed: false,
    containsPersistentCredentials: false,
    containsPrivateKey: false,
    containsSecrets: false,
    containsSensitiveDestinationMetadata: true,
    cosProvisioningPlan: {},
    files,
    migrationAllowed: false,
    productionDatabaseMutationAllowed: false,
    productionRepositoryMutationAllowed: false,
    productionServiceMutationAllowed: false,
    reproducibleArchive: true,
    schemaVersion: "v2-m1-production-storage-p0r-transport.v1",
    sourceCommit: LEGACY_SOURCE_COMMIT,
    sourceDateEpoch: 946_684_800,
  };
  bytesByName["transport-manifest.json"] =
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  for (const [name, bytes] of Object.entries(bytesByName)) {
    await writeFile(join(stagingDirectory, name), bytes, {
      flag: "wx",
      mode: name === "age" || name === "p0r-cos-archive" ? 0o700 : 0o600,
    });
  }
  const tarPath = join(root, `${archiveName}.tar`);
  await writeDeterministicUstar({
    archivePath: tarPath,
    entries: Object.keys(bytesByName),
    root: stagingDirectory,
  });
  const { stdout: archiveBytes } = await execFileAsync(
    "gzip",
    ["-n", "-9", "-c", tarPath],
    { encoding: null, maxBuffer: 8 * 1024 * 1024 },
  );
  const archivePath = join(root, archiveName);
  await writeFile(archivePath, archiveBytes, {
    flag: "wx",
    mode: 0o600,
  });
  return {
    archivePath,
    bindingsSha256: sha256(bytesByName["p0r-bindings.env"]),
    bundleSha256: sha256(archiveBytes),
    manifest,
    manifestSha256: sha256(bytesByName["transport-manifest.json"]),
    plan,
    planSha256: sha256(bytesByName["cos-provisioning-plan.json"]),
    sourceIpCidrSha256: sha256(SOURCE_IP_CIDR),
    stagingDirectory,
  };
}

function fixtureRequest(policy, legacy) {
  return {
    applicationMutationAllowed: false,
    approvalExpiresAt: EXPIRES_AT,
    approvalIssuedAt: ISSUED_AT,
    artifactManifestSha256: "3".repeat(64),
    automaticRollbackRequired: true,
    currentCriticalFileDigests: currentCriticalFileDigests(),
    databaseMutationAllowed: false,
    dispatchId: DISPATCH_ID,
    dispatchStateRoot: policy.dispatchStateRoot,
    expectedContainerCount: CONTAINER_IDS.length,
    expectedContainerIds: CONTAINER_IDS,
    expectedHealth: {
      level: "ready",
      persistenceDatabaseStatus: "ready",
      scanFreshness: "fresh",
      scanStatus: "ready",
    },
    expectedLegacyBindingsSha256: legacy.bindingsSha256,
    expectedLegacyBundleSha256: legacy.bundleSha256,
    expectedLegacyPlanDigest: legacy.plan.planDigest,
    expectedLegacyPlanSha256: legacy.planSha256,
    expectedLegacyRunId: LEGACY_RUN_ID,
    expectedLegacySourceCommit: LEGACY_SOURCE_COMMIT,
    expectedLegacyTransportManifestSha256: legacy.manifestSha256,
    expectedProductionHead: PRODUCTION_HEAD,
    expectedSourceIpCidrSha256: legacy.sourceIpCidrSha256,
    expectedTimerUnit: policy.expectedTimerUnit,
    launchSuccessMarker: P0R_REBIND_SUCCESS_MARKER,
    legacyStagingDirectory: legacy.stagingDirectory,
    maxExecutions: 1,
    metadataEndpoint: P0R_REBIND_METADATA_ENDPOINT,
    packageId: P0R_REBIND_PACKAGE_ID,
    productionMutationScope: "dispatch_staging_and_sanitized_evidence_only",
    productionWorktree: policy.productionWorktree,
    redisMutationAllowed: false,
    resultPath: join(policy.evidenceRoot, `${DISPATCH_ID}.result.json`),
    revocationEpoch: 1,
    runnerUnitName: RUNNER_UNIT,
    schemaVersion: P0R_REBIND_REQUEST_SCHEMA,
    sessionIndependentExecutionRequired: true,
    sourceCommit: SOURCE_COMMIT,
    sourceRef: SOURCE_REF,
    sourceTree: SOURCE_TREE,
    stagingDirectory: join(
      policy.stagingRoot,
      `${policy.stagingPrefix}${DISPATCH_ID}`,
    ),
    temporaryStagingCleanupRequired: true,
    transportBundleSha256: "4".repeat(64),
    transportContainsSecrets: false,
    transportMethod: "signed_git_bundle",
    workerMutationAllowed: false,
  };
}

test("request freezes no-secret read-only rebinding boundaries", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "p0r-rebind-request-")),
  );
  try {
    const policy = testPolicy(root);
    const legacy = await createLegacyFixture(root, {
      stagingDirectory: join(policy.p0rStagingRoot, LEGACY_RUN_ID),
    });
    const request = fixtureRequest(policy, legacy);
    const now = new Date(ISSUED_AT);
    assert.equal(validateP0RRebindRequest(request, { now, policy }), request);
    for (const tampered of [
      { ...request, applicationMutationAllowed: true },
      { ...request, databaseMutationAllowed: true },
      { ...request, transportContainsSecrets: true },
      { ...request, metadataEndpoint: "https://example.invalid/ip" },
      { ...request, sourceCommit: request.expectedLegacySourceCommit },
      {
        ...request,
        expectedHealth: {
          ...request.expectedHealth,
          scanFreshness: "aging",
        },
      },
      {
        ...request,
        currentCriticalFileDigests: Object.fromEntries(
          Object.entries(request.currentCriticalFileDigests).slice(1),
        ),
      },
      {
        ...request,
        approvalExpiresAt: "2026-07-27T02:30:01.000Z",
      },
    ]) {
      assert.throws(
        () => validateP0RRebindRequest(tampered, { now, policy }),
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("command allowlist permits only exact read-only production probes", () => {
  const request = {
    expectedTimerUnit: "market-radar-production-dispatch.timer",
    metadataEndpoint: P0R_REBIND_METADATA_ENDPOINT,
    productionWorktree: "/production",
  };
  const inventory = ["ps", "--no-trunc", "--format", "{{.ID}}"];
  assert.deepEqual(p0rRebindReadOnlyInvocation("docker", inventory, request), {
    args: ["-n", "--", "/usr/bin/docker", ...inventory],
    executable: "/usr/bin/sudo",
  });
  assert.deepEqual(p0rRebindReadOnlyInvocation("curl", [
    "-fsS",
    "--max-time",
    "10",
    P0R_REBIND_METADATA_ENDPOINT,
  ], request), {
    args: [
      "-fsS",
      "--max-time",
      "10",
      P0R_REBIND_METADATA_ENDPOINT,
    ],
    executable: "/usr/bin/curl",
  });
  assert.throws(
    () => p0rRebindReadOnlyInvocation("docker", ["rm", "-f", "anything"], request),
    /p0r_rebind_docker_command_not_read_only/u,
  );
  assert.throws(
    () => p0rRebindReadOnlyInvocation(
      "curl",
      ["-fsS", "https://example.invalid"],
      request,
    ),
    /p0r_rebind_curl_command_not_read_only/u,
  );
});

test("metadata binding retains only the exact CIDR digest", async () => {
  const request = {
    expectedSourceIpCidrSha256: sha256(SOURCE_IP_CIDR),
    metadataEndpoint: P0R_REBIND_METADATA_ENDPOINT,
  };
  const result = await verifyP0RSourceIpBinding(
    request,
    async () => SOURCE_IP_CIDR.replace("/32", ""),
  );
  assert.equal(result.sourceIpCidrMatched, true);
  assert.equal(result.sourceIpCidrSha256, sha256(SOURCE_IP_CIDR));
  assert.doesNotMatch(JSON.stringify(result), /203\.0\.113\.24/u);
  await assert.rejects(
    verifyP0RSourceIpBinding(
      { ...request, expectedSourceIpCidrSha256: "5".repeat(64) },
      async () => SOURCE_IP_CIDR.replace("/32", ""),
    ),
    /p0r_rebind_source_ip_binding_mismatch/u,
  );
});

test("ephemeral secret inventory fails closed on any P0R residue", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "p0r-rebind-shm-")),
  );
  try {
    const policy = testPolicy(root);
    await mkdir(policy.shmRoot, { mode: 0o700 });
    assert.equal(
      (await inspectP0REphemeralSecretBaseline({}, policy)).matchingEntryCount,
      0,
    );
    await writeFile(
      join(policy.shmRoot, "market-radar-v2-p0r-test.cos-credentials.json"),
      "{}\n",
      { mode: 0o600 },
    );
    await assert.rejects(
      inspectP0REphemeralSecretBaseline({}, policy),
      /p0r_rebind_ephemeral_secret_residue_detected/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("evidence publication never overwrites an existing result", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "p0r-rebind-exclusive-evidence-")),
  );
  try {
    const path = join(root, "result.json");
    const original = canonicalJson({ status: "ORIGINAL" });
    await writeFile(path, original, { flag: "wx", mode: 0o600 });
    await assert.rejects(
      writeExclusiveCanonical(path, { status: "REPLACEMENT" }),
      /p0r_rebind_evidence_path_already_exists/u,
    );
    assert.equal(await readFile(path, "utf8"), original);
    assert.deepEqual(await readdir(root), ["result.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy staging is fully verified and explicitly rejected as superseded", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "p0r-rebind-legacy-")),
  );
  try {
    const policy = testPolicy(root);
    const legacy = await createLegacyFixture(root, {
      stagingDirectory: join(policy.p0rStagingRoot, LEGACY_RUN_ID),
    });
    const result = await inspectSupersededP0RStaging(
      fixtureRequest(policy, legacy),
    );
    assert.equal(result.status, "REJECTED_SUPERSEDED_SECURITY_SOURCE");
    assert.equal(result.fileCount, 13);
    assert.equal(result.transportArchivePresentInStaging, false);
    assert.doesNotMatch(JSON.stringify(result), /restricted-test-bucket/u);
    await writeFile(
      join(legacy.stagingDirectory, "unexpected.secret"),
      "not a real secret\n",
      { mode: 0o600 },
    );
    await assert.rejects(
      inspectSupersededP0RStaging(fixtureRequest(policy, legacy)),
      /p0r_rebind_legacy_staging_file_set_mismatch/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bundle is deterministic, redacted and accepted by fixed dispatch", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "p0r-rebind-bundle-")),
  );
  try {
    const legacy = await createLegacyFixture(root);
    const approval = {
      dispatchId: DISPATCH_ID,
      expectedContainerIds: CONTAINER_IDS,
      expectedProductionHead: PRODUCTION_HEAD,
      expiresAt: EXPIRES_AT,
      issuedAt: ISSUED_AT,
      revocationEpoch: 1,
      runnerUnitName: RUNNER_UNIT,
      sourceRef: SOURCE_REF,
    };
    const first = await buildP0RRebindBundle({
      approval,
      expectedLegacyBundleSha256: legacy.bundleSha256,
      legacyBundlePath: legacy.archivePath,
      outputDirectory: join(root, "first"),
      root: process.cwd(),
      sourceCommit: SOURCE_COMMIT,
      sourceTree: SOURCE_TREE,
      verifySourceBinding: false,
    });
    const second = await buildP0RRebindBundle({
      approval,
      expectedLegacyBundleSha256: legacy.bundleSha256,
      legacyBundlePath: legacy.archivePath,
      outputDirectory: join(root, "second"),
      root: process.cwd(),
      sourceCommit: SOURCE_COMMIT,
      sourceTree: SOURCE_TREE,
      verifySourceBinding: false,
    });
    assert.equal(first.result.bundleSha256, second.result.bundleSha256);
    assert.equal(
      first.result.approvalRequestSha256,
      second.result.approvalRequestSha256,
    );
    const publishedMaterial = [
      await readFile(join(root, "first/approval-request.json"), "utf8"),
      await readFile(join(root, "first/build-result.json"), "utf8"),
    ].join("\n");
    assert.doesNotMatch(
      publishedMaterial,
      /203\.0\.113\.24|restricted-test-bucket|market-radar-v2\/p0r\/2026/u,
    );
    assert.equal(first.request.transportContainsSecrets, false);
    assert.equal(first.request.applicationMutationAllowed, false);

    const privateKey = join(root, "keys/private.pem");
    const publicKey = join(root, "keys/public.pem");
    await generateSigningKeyPair({
      privateKeyPath: privateKey,
      publicKeyPath: publicKey,
    });
    const outbox = join(root, "outbox");
    const prepared = await prepareDispatch({
      approvalRequestPath: join(root, "first/approval-request.json"),
      bundlePath: join(root, "first/bundle.tar.gz"),
      dispatch: {
        dispatchId: DISPATCH_ID,
        entrypointPath: P0R_REBIND_ENTRYPOINT,
        expiresAt: EXPIRES_AT,
        issuedAt: ISSUED_AT,
        launchSuccessMarker: P0R_REBIND_SUCCESS_MARKER,
        packageId: P0R_REBIND_PACKAGE_ID,
        revocationEpoch: 1,
        runnerUnitName: RUNNER_UNIT,
        runtimeMaxSeconds: 90,
        sourceRef: SOURCE_REF,
        stagingDirectory: first.request.stagingDirectory,
        targetCommit: SOURCE_COMMIT,
      },
      outbox,
      privateKeyPath: privateKey,
      now: new Date(ISSUED_AT),
    });
    const validated = await validateOutbox(outbox, publicKey, {
      now: new Date(ISSUED_AT),
    });
    assert.equal(prepared.status, "PASS_SIGNED_DISPATCH_PREPARED");
    assert.equal(validated.status, "PASS_SIGNED_DISPATCH_OUTBOX");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runner produces sanitized zero-drift evidence end to end", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "p0r-rebind-runner-")),
  );
  try {
    const policy = testPolicy(root);
    await mkdir(policy.productionWorktree, { recursive: true, mode: 0o700 });
    await mkdir(policy.shmRoot, { recursive: true, mode: 0o700 });
    const legacy = await createLegacyFixture(root, {
      stagingDirectory: join(policy.p0rStagingRoot, LEGACY_RUN_ID),
    });
    const request = fixtureRequest(policy, legacy);
    await mkdir(request.stagingDirectory, { recursive: true, mode: 0o700 });
    for (const path of [P0R_REBIND_ENTRYPOINT, P0R_REBIND_RUNNER]) {
      await mkdir(dirname(join(request.stagingDirectory, path)), {
        recursive: true,
        mode: 0o700,
      });
      await copyFile(join(process.cwd(), path), join(request.stagingDirectory, path));
      await chmod(
        join(request.stagingDirectory, path),
        path === P0R_REBIND_ENTRYPOINT ? 0o700 : 0o600,
      );
    }
    const manifest = {
      archiveFormat: "ustar+gzip-n",
      containsSecrets: false,
      files: {
        [P0R_REBIND_ENTRYPOINT]: sha256(
          await readFile(join(request.stagingDirectory, P0R_REBIND_ENTRYPOINT)),
        ),
        [P0R_REBIND_RUNNER]: sha256(
          await readFile(join(request.stagingDirectory, P0R_REBIND_RUNNER)),
        ),
      },
      mutationScope: request.productionMutationScope,
      packageId: request.packageId,
      schemaVersion: P0R_REBIND_MANIFEST_SCHEMA,
      sourceCommit: request.sourceCommit,
      sourceDateEpoch: 946_684_800,
      sourceTree: request.sourceTree,
    };
    const manifestRaw = canonicalJson(manifest);
    request.artifactManifestSha256 = sha256(manifestRaw);
    const requestRaw = canonicalJson(request);
    const envelope = {
      approvalRequestSha256: sha256(requestRaw),
      automaticRollbackRequired: true,
      bundleSha256: request.transportBundleSha256,
      dispatchId: request.dispatchId,
      entrypointPath: P0R_REBIND_ENTRYPOINT,
      expiresAt: request.approvalExpiresAt,
      issuedAt: request.approvalIssuedAt,
      launchSuccessMarker: request.launchSuccessMarker,
      maxExecutions: 1,
      noArbitraryCommand: true,
      packageId: request.packageId,
      productionMutation: true,
      productionWipLimit: 1,
      revocationEpoch: request.revocationEpoch,
      runnerUnitName: request.runnerUnitName,
      runtimeMaxSeconds: 90,
      sessionIndependentExecutionRequired: true,
      sourceRef: request.sourceRef,
      stagingDirectory: request.stagingDirectory,
      targetCommit: request.sourceCommit,
      transportContainsSecrets: false,
      transportMethod: "signed_git_bundle",
    };
    const requestPath = join(request.stagingDirectory, "approval-request.json");
    const markerPath = join(
      request.stagingDirectory,
      ".transport-bundle.sha256",
    );
    await writeFile(
      join(request.stagingDirectory, P0R_REBIND_MANIFEST),
      manifestRaw,
      { mode: 0o600 },
    );
    await writeFile(requestPath, requestRaw, { mode: 0o600 });
    await writeFile(
      markerPath,
      `${request.transportBundleSha256}\n`,
      { mode: 0o600 },
    );
    await writeFile(
      join(request.stagingDirectory, ".dispatch.json"),
      canonicalJson(envelope),
      { mode: 0o600 },
    );
    const health = JSON.stringify({
      health: {
        level: "ready",
        persistence: { databaseStatus: "ready" },
        scan: { freshness: "fresh", status: "ready" },
      },
      ok: true,
    });
    const commandRunner = async (command, args) => {
      if (command === "git" && args.at(-1) === "HEAD") return PRODUCTION_HEAD;
      if (command === "git") return "";
      if (command === "docker" && args[0] === "ps" && args[1] === "--no-trunc") {
        return CONTAINER_IDS.join("\n");
      }
      if (command === "docker" && args[0] === "ps") {
        return "chuan-market-radar-web-1\nchuan-market-radar-postgres-1";
      }
      if (command === "docker" && args[0] === "volume") {
        return "chuan-market-radar_postgres_data";
      }
      if (command === "ss") return "LISTEN 0 4096 127.0.0.1:80 0.0.0.0:*";
      if (command === "systemctl" && args[0] === "is-enabled") return "enabled";
      if (command === "systemctl" && args[0] === "is-active") return "active";
      if (command === "curl" && args.includes(request.metadataEndpoint)) {
        return SOURCE_IP_CIDR.replace("/32", "");
      }
      if (command === "curl") return health;
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    };
    const result = await runP0RRebindPreflight({
      bundleMarkerPath: markerPath,
      commandRunner,
      now: new Date(ISSUED_AT),
      policy,
      requestPath,
    });
    assert.equal(result.status, "PASS_P0R_READ_ONLY_REBIND_PREFLIGHT");
    assert.equal(result.productionChanged, false);
    assert.equal(
      result.supersededStaging.status,
      "REJECTED_SUPERSEDED_SECURITY_SOURCE",
    );
    const persisted = await readFile(request.resultPath, "utf8");
    assert.equal(persisted, canonicalJson(result));
    assert.doesNotMatch(
      persisted,
      /203\.0\.113\.24|restricted-test-bucket|\.dump\.age/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("entrypoint has exact staging cleanup and no fallback execution path", async () => {
  const source = await readFile(
    join(process.cwd(), P0R_REBIND_ENTRYPOINT),
    "utf8",
  );
  assert.match(source, /STAGING_PREFIX="m1-p0r-rebind-"/u);
  assert.match(source, /rm -rf -- "\$\{ACTUAL_SOURCE_ROOT\}"/u);
  assert.match(source, /node "\$\{RUNNER\}" run/u);
  assert.doesNotMatch(source, /curl|scp|ssh|docker|credential|secret/iu);
});
