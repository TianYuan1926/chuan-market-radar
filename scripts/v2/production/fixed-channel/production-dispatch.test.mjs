import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  AGENT_CONFIG_SCHEMA,
  DISPATCH_FILES,
  DispatchPolicyError,
  MAX_BUNDLE_BYTES,
  MAX_UNCOMPRESSED_BUNDLE_BYTES,
  agentOnce,
  canonicalJson,
  generateSigningKeyPair,
  initializeAgent,
  prepareDispatch,
  publishDispatch,
  sha256,
  signEnvelope,
  validateBundleEntries,
  validateEnvelope,
  validateOutbox,
  verifyEnvelopeSignature,
} from "./production-dispatch.mjs";

const execFileAsync = promisify(execFile);

function policyReason(reason) {
  return (error) => error instanceof DispatchPolicyError && error.reason === reason;
}

function envelopeFixture(now = new Date("2026-07-22T02:00:00.000Z"), overrides = {}) {
  return {
    approvalRequestPath: "approval-request.json",
    approvalRequestSha256: "a".repeat(64),
    automaticRollbackRequired: true,
    bundleBytes: 1024,
    bundleSha256: "b".repeat(64),
    dispatchId: "dispatch-test-0001",
    entrypointPath: "scripts/production/example/production-entrypoint.sh",
    entrypointSha256: "c".repeat(64),
    expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
    issuedAt: new Date(now.getTime() - 1_000).toISOString(),
    launchSuccessMarker: "DETACHED_EXAMPLE_RUNNER_STARTED",
    maxExecutions: 1,
    noArbitraryCommand: true,
    packageId: "WP-G0-DISPATCH-TEST",
    productionMutation: true,
    productionWipLimit: 1,
    revocationEpoch: 0,
    runnerUnitName: "market-radar-dispatch-test-0001",
    runtimeMaxSeconds: 5_400,
    schemaVersion: "market-radar-production-dispatch.v1",
    sessionIndependentExecutionRequired: true,
    sourceRef: "refs/heads/codex/dispatch-test",
    stagingDirectory: "/home/ubuntu/.cache/market-radar-ops/wp-g0-dispatch-test-0001",
    targetCommit: "d".repeat(40),
    transportContainsSecrets: false,
    transportMethod: "signed_git_bundle",
    ...overrides,
  };
}

async function createBundle(root, content = "#!/usr/bin/env bash\nprintf 'DETACHED_EXAMPLE_RUNNER_STARTED\\n'\n") {
  const source = join(root, "bundle-source");
  const entrypoint = join(source, "scripts/production/example/production-entrypoint.sh");
  await mkdir(join(source, "scripts/production/example"), { recursive: true });
  await writeFile(entrypoint, content, { mode: 0o700 });
  const bundle = join(root, "bundle.tar.gz");
  await execFileAsync("tar", ["-czf", bundle, "-C", source, "scripts"]);
  return { bundle, entrypoint, entrypointPath: "scripts/production/example/production-entrypoint.sh" };
}

async function git(repo, args) {
  const { stdout } = await execFileAsync("git", ["-C", repo, ...args], { encoding: "utf8" });
  return stdout.trim();
}

test("dispatch envelope is exact, time bounded, single-use and command-free", () => {
  const now = new Date("2026-07-22T02:00:00.000Z");
  const envelope = envelopeFixture(now);
  assert.equal(validateEnvelope(envelope, { now }), envelope);

  assert.throws(
    () => validateEnvelope({ ...envelope, command: "rm -rf /" }, { now }),
    policyReason("dispatch_envelope_keys_invalid"),
  );
  assert.throws(
    () => validateEnvelope({ ...envelope, entrypointPath: "scripts/deploy/run.sh" }, { now }),
    policyReason("dispatch_entrypoint_not_allowlisted"),
  );
  assert.throws(
    () => validateEnvelope({ ...envelope, maxExecutions: 2 }, { now }),
    policyReason("dispatch_execution_count_invalid"),
  );
  assert.throws(
    () => validateEnvelope({ ...envelope, automaticRollbackRequired: false }, { now }),
    policyReason("dispatch_rollback_required"),
  );
  assert.throws(
    () => validateEnvelope(envelope, { now: new Date(envelope.expiresAt).getTime() + 1 }),
    policyReason("dispatch_not_current"),
  );
});

test("Ed25519 signature binds the canonical envelope and rejects tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "dispatch-signature-"));
  try {
    const privateKeyPath = join(root, "private.pem");
    const publicKeyPath = join(root, "public.pem");
    await generateSigningKeyPair({ privateKeyPath, publicKeyPath });
    const envelope = envelopeFixture();
    const privateKey = await readFile(privateKeyPath, "utf8");
    const publicKey = await readFile(publicKeyPath, "utf8");
    const signature = signEnvelope(envelope, privateKey);
    assert.equal(verifyEnvelopeSignature(envelope, signature, publicKey), true);
    assert.throws(
      () => verifyEnvelopeSignature({ ...envelope, bundleBytes: 1025 }, signature, publicKey),
      policyReason("dispatch_signature_invalid"),
    );
    await assert.rejects(
      generateSigningKeyPair({ privateKeyPath, publicKeyPath }),
      policyReason("dispatch_key_path_already_exists"),
    );
    await assert.rejects(
      generateSigningKeyPair({
        privateKeyPath: join(process.cwd(), ".tmp", "forbidden-dispatch-private.pem"),
        publicKeyPath: join(root, "unused-public.pem"),
      }),
      policyReason("dispatch_private_key_inside_worktree"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bundle policy rejects traversal, duplicate, secret and special-file paths", () => {
  assert.deepEqual(validateBundleEntries([
    "scripts/",
    "scripts/production/",
    "scripts/production/example/production-entrypoint.sh",
  ]), [
    "scripts",
    "scripts/production",
    "scripts/production/example/production-entrypoint.sh",
  ]);
  assert.throws(
    () => validateBundleEntries(["../../.env"]),
    policyReason("dispatch_bundle_path_unsafe"),
  );
  assert.throws(
    () => validateBundleEntries(["scripts/run.sh", "scripts/run.sh"]),
    policyReason("dispatch_bundle_duplicate_path"),
  );
  assert.throws(
    () => validateBundleEntries(["safe/.env.production"]),
    policyReason("dispatch_bundle_forbidden_path"),
  );
  assert.throws(
    () => validateBundleEntries(["scripts/link"], ["lrwxr-xr-x user group 0 date scripts/link -> /tmp/x"]),
    policyReason("dispatch_bundle_special_file_forbidden"),
  );
});

test("prepare rejects sensitive credentials hidden inside an allowlisted bundle path", async () => {
  const root = await mkdtemp(join(tmpdir(), "dispatch-sensitive-content-"));
  try {
    const now = new Date();
    const { bundle, entrypointPath } = await createBundle(
      root,
      "#!/usr/bin/env bash\nprintf '%s\\n' '{\"TmpSecretKey\":\"must-not-cross-git\"}'\n",
    );
    const bundleBytes = await readFile(bundle);
    const privateKeyPath = join(root, "private.pem");
    const publicKeyPath = join(root, "public.pem");
    await generateSigningKeyPair({ privateKeyPath, publicKeyPath });
    const targetCommit = "f".repeat(40);
    const stagingDirectory = "/home/ubuntu/.cache/market-radar-ops/wp-g0-dispatch-sensitive-0001";
    const runnerUnitName = "market-radar-dispatch-sensitive-0001";
    const approvalRequestPath = join(root, "approval-request.json");
    await writeFile(approvalRequestPath, `${JSON.stringify({
      packageId: "WP-G0-DISPATCH-SENSITIVE",
      runnerSourceCommit: targetCommit,
      runnerUnitName,
      stagingDirectory,
      transportBundleSha256: sha256(bundleBytes),
      transportMethod: "signed_git_bundle",
    })}\n`, { mode: 0o600 });

    await assert.rejects(prepareDispatch({
      approvalRequestPath,
      bundlePath: bundle,
      dispatch: {
        dispatchId: "dispatch-sensitive-0001",
        entrypointPath,
        expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
        issuedAt: new Date(now.getTime() - 1_000).toISOString(),
        launchSuccessMarker: "DETACHED_EXAMPLE_RUNNER_STARTED",
        packageId: "WP-G0-DISPATCH-SENSITIVE",
        revocationEpoch: 0,
        runnerUnitName,
        runtimeMaxSeconds: 5_400,
        sourceRef: "refs/heads/codex/dispatch-test",
        stagingDirectory,
        targetCommit,
      },
      outbox: join(root, "outbox"),
      privateKeyPath,
      now,
    }), policyReason("dispatch_bundle_sensitive_content"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prepare and validate bind bundle, external approval request and entrypoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "dispatch-prepare-"));
  try {
    const now = new Date();
    const { bundle, entrypointPath } = await createBundle(root);
    const bundleBytes = await readFile(bundle);
    const privateKeyPath = join(root, "private.pem");
    const publicKeyPath = join(root, "public.pem");
    await generateSigningKeyPair({ privateKeyPath, publicKeyPath });
    const targetCommit = "e".repeat(40);
    const stagingDirectory = "/home/ubuntu/.cache/market-radar-ops/wp-g0-dispatch-prepare-0001";
    const runnerUnitName = "market-radar-dispatch-prepare-0001";
    const approvalRequestPath = join(root, "approval-request.json");
    const approvalRequest = {
      packageId: "WP-G0-DISPATCH-PREPARE",
      runnerSourceCommit: targetCommit,
      runnerUnitName,
      stagingDirectory,
      transportBundleSha256: sha256(bundleBytes),
      transportMethod: "signed_git_bundle",
    };
    await writeFile(approvalRequestPath, `${JSON.stringify({
      ...approvalRequest,
      transportMethod: "approved_orcaterm_bundle_upload",
    })}\n`, { mode: 0o600 });
    await assert.rejects(prepareDispatch({
      approvalRequestPath,
      bundlePath: bundle,
      dispatch: {
        dispatchId: "dispatch-wrong-transport-0001",
        entrypointPath,
        expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
        issuedAt: new Date(now.getTime() - 1_000).toISOString(),
        launchSuccessMarker: "DETACHED_EXAMPLE_RUNNER_STARTED",
        packageId: "WP-G0-DISPATCH-PREPARE",
        revocationEpoch: 0,
        runnerUnitName,
        runtimeMaxSeconds: 5_400,
        sourceRef: "refs/heads/codex/dispatch-test",
        stagingDirectory,
        targetCommit,
      },
      outbox: join(root, "wrong-transport-outbox"),
      privateKeyPath,
      now,
    }), policyReason("dispatch_approval_request_transport_mismatch"));
    const requestWithoutPackageId = { ...approvalRequest };
    delete requestWithoutPackageId.packageId;
    await writeFile(approvalRequestPath, `${JSON.stringify(requestWithoutPackageId)}\n`, { mode: 0o600 });
    await assert.rejects(prepareDispatch({
      approvalRequestPath,
      bundlePath: bundle,
      dispatch: {
        dispatchId: "dispatch-missing-binding-0001",
        entrypointPath,
        expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
        issuedAt: new Date(now.getTime() - 1_000).toISOString(),
        launchSuccessMarker: "DETACHED_EXAMPLE_RUNNER_STARTED",
        packageId: "WP-G0-DISPATCH-PREPARE",
        revocationEpoch: 0,
        runnerUnitName,
        runtimeMaxSeconds: 5_400,
        sourceRef: "refs/heads/codex/dispatch-test",
        stagingDirectory,
        targetCommit,
      },
      outbox: join(root, "missing-binding-outbox"),
      privateKeyPath,
      now,
    }), policyReason("dispatch_approval_request_package_mismatch"));
    await writeFile(approvalRequestPath, `${JSON.stringify(approvalRequest)}\n`, { mode: 0o600 });
    const outbox = join(root, "outbox");
    const prepared = await prepareDispatch({
      approvalRequestPath,
      bundlePath: bundle,
      dispatch: {
        dispatchId: "dispatch-prepare-0001",
        entrypointPath,
        expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
        issuedAt: new Date(now.getTime() - 1_000).toISOString(),
        launchSuccessMarker: "DETACHED_EXAMPLE_RUNNER_STARTED",
        packageId: "WP-G0-DISPATCH-PREPARE",
        revocationEpoch: 0,
        runnerUnitName,
        runtimeMaxSeconds: 5_400,
        sourceRef: "refs/heads/codex/dispatch-test",
        stagingDirectory,
        targetCommit,
      },
      outbox,
      privateKeyPath,
      now,
    });
    assert.equal(prepared.status, "PASS_SIGNED_DISPATCH_PREPARED");
    const validated = await validateOutbox(outbox, publicKeyPath, { now });
    assert.equal(validated.status, "PASS_SIGNED_DISPATCH_OUTBOX");

    const request = JSON.parse(await readFile(join(outbox, "approval-request.json"), "utf8"));
    request.packageId = "WP-G0-TAMPERED";
    await writeFile(join(outbox, "approval-request.json"), `${JSON.stringify(request)}\n`);
    await assert.rejects(
      validateOutbox(outbox, publicKeyPath, { now }),
      policyReason("dispatch_approval_request_sha256_mismatch"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent pulls one signed dispatch, defers on WIP, then launches exactly once", async () => {
  const root = await mkdtemp(join(tmpdir(), "dispatch-agent-"));
  const remote = join(root, "remote.git");
  const repo = join(root, "publisher");
  const stagingRoot = join(root, "staging");
  const trustRoot = join(root, "trust");
  try {
    await execFileAsync("git", ["init", "--bare", remote]);
    await execFileAsync("git", ["init", repo]);
    await git(repo, ["config", "user.name", "Market Radar Test"]);
    await git(repo, ["config", "user.email", "market-radar-test@example.invalid"]);
    await git(repo, ["remote", "add", "origin", remote]);
    await writeFile(join(repo, "target.txt"), "target\n");
    await git(repo, ["add", "target.txt"]);
    await git(repo, ["commit", "-m", "target"]);
    await git(repo, ["branch", "-M", "codex/dispatch-test"]);
    await git(repo, ["push", "-u", "origin", "codex/dispatch-test"]);
    const targetCommit = await git(repo, ["rev-parse", "HEAD"]);

    await mkdir(stagingRoot, { recursive: true, mode: 0o700 });
    await mkdir(trustRoot, { recursive: true, mode: 0o700 });
    const privateKeyPath = join(root, "private.pem");
    const publicKeyPath = join(root, "public.pem");
    await generateSigningKeyPair({ privateKeyPath, publicKeyPath });
    const config = {
      dispatchRef: "refs/heads/production-dispatch-test",
      dispatchTrackingRef: "refs/market-radar-dispatch/incoming-test",
      mirrorPath: join(root, "agent", "mirror.git"),
      publicKeyPath,
      remoteUrl: remote,
      schemaVersion: AGENT_CONFIG_SCHEMA,
      sourceRefs: ["refs/heads/codex/dispatch-test"],
      stagingRoots: [stagingRoot],
      stateRoot: join(root, "agent"),
      trustRoot,
    };
    const initialized = await initializeAgent(config);
    assert.equal(initialized.lastDispatchCommit, null);

    const { bundle, entrypointPath } = await createBundle(root);
    const bundleBytes = await readFile(bundle);
    const now = new Date();
    const stagingDirectory = join(stagingRoot, "wp-g0-dispatch-agent-0001");
    const runnerUnitName = "market-radar-dispatch-agent-0001";
    const approvalRequestPath = join(root, "agent-approval-request.json");
    await writeFile(approvalRequestPath, `${JSON.stringify({
      packageId: "WP-G0-DISPATCH-AGENT",
      runnerSourceCommit: targetCommit,
      runnerUnitName,
      stagingDirectory,
      transportBundleSha256: sha256(bundleBytes),
      transportMethod: "signed_git_bundle",
    })}\n`, { mode: 0o600 });
    const outbox = join(root, "agent-outbox");
    await prepareDispatch({
      approvalRequestPath,
      bundlePath: bundle,
      dispatch: {
        dispatchId: "dispatch-agent-0001",
        entrypointPath,
        expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
        issuedAt: new Date(now.getTime() - 1_000).toISOString(),
        launchSuccessMarker: "DETACHED_EXAMPLE_RUNNER_STARTED",
        packageId: "WP-G0-DISPATCH-AGENT",
        revocationEpoch: 0,
        runnerUnitName,
        runtimeMaxSeconds: 5_400,
        sourceRef: "refs/heads/codex/dispatch-test",
        sourceRefs: ["refs/heads/codex/dispatch-test"],
        stagingDirectory,
        stagingRoots: [stagingRoot],
        targetCommit,
      },
      outbox,
      privateKeyPath,
      now,
    });
    await publishDispatch({
      branch: "production-dispatch-test",
      outbox,
      publicKeyPath,
      remote: "origin",
      repo,
      sourceRefs: config.sourceRefs,
      stagingRoots: config.stagingRoots,
    });

    await mkdir(join(trustRoot, "production-global.lock"), { recursive: true, mode: 0o700 });
    await writeFile(join(trustRoot, "production-global.lock", "lease.json"), `${JSON.stringify({
      schemaVersion: "market-radar-production-lease.v1",
      expiresAt: "invalid",
      status: "active",
    })}\n`, { mode: 0o600 });
    let launchCount = 0;
    const launch = async ({ envelope, marker, requestPath }) => {
      launchCount += 1;
      assert.equal(envelope.targetCommit, targetCommit);
      assert.equal(marker, "DETACHED_EXAMPLE_RUNNER_STARTED");
      assert.equal(JSON.parse(await readFile(requestPath, "utf8")).packageId,
        "WP-G0-DISPATCH-AGENT");
      return { stderrSha256: sha256(""), stdoutSha256: sha256(`${marker}\n`) };
    };
    const uncertain = await agentOnce(config, { launch, now });
    assert.equal(uncertain.status, "DEFERRED_PRODUCTION_LEASE_UNCERTAIN");
    assert.equal(launchCount, 0);

    await writeFile(join(trustRoot, "production-global.lock", "lease.json"), `${JSON.stringify({
      schemaVersion: "market-radar-production-lease.v1",
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      status: "active",
    })}\n`, { mode: 0o600 });
    const deferred = await agentOnce(config, { launch, now });
    assert.equal(deferred.status, "DEFERRED_PRODUCTION_WIP_ACTIVE");
    assert.equal(launchCount, 0);

    await rm(join(trustRoot, "production-global.lock"), { recursive: true, force: true });
    const launched = await agentOnce(config, { launch, now });
    assert.equal(launched.status, "PASS_SESSION_INDEPENDENT_RUNNER_LAUNCHED");
    assert.equal(launchCount, 1);
    assert.equal((await readFile(join(stagingDirectory, ".transport-bundle.sha256"), "utf8")).trim(),
      sha256(bundleBytes));

    const idle = await agentOnce(config, { launch, now });
    assert.equal(idle.status, "IDLE_NO_NEW_DISPATCH");
    assert.equal(launchCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent quarantines one invalid dispatch commit instead of deadlocking the queue", async () => {
  const root = await mkdtemp(join(tmpdir(), "dispatch-invalid-commit-"));
  const remote = join(root, "remote.git");
  const repo = join(root, "publisher");
  try {
    await execFileAsync("git", ["init", "--bare", remote]);
    await execFileAsync("git", ["init", repo]);
    await git(repo, ["config", "user.name", "Market Radar Test"]);
    await git(repo, ["config", "user.email", "market-radar-test@example.invalid"]);
    await git(repo, ["remote", "add", "origin", remote]);
    const privateKeyPath = join(root, "private.pem");
    const publicKeyPath = join(root, "public.pem");
    await generateSigningKeyPair({ privateKeyPath, publicKeyPath });
    const stagingRoot = join(root, "staging");
    const trustRoot = join(root, "trust");
    await mkdir(stagingRoot, { recursive: true, mode: 0o700 });
    await mkdir(trustRoot, { recursive: true, mode: 0o700 });
    const config = {
      dispatchRef: "refs/heads/production-dispatch-invalid-test",
      dispatchTrackingRef: "refs/market-radar-dispatch/incoming-invalid-test",
      mirrorPath: join(root, "agent", "mirror.git"),
      publicKeyPath,
      remoteUrl: remote,
      schemaVersion: AGENT_CONFIG_SCHEMA,
      sourceRefs: ["refs/heads/codex/dispatch-test"],
      stagingRoots: [stagingRoot],
      stateRoot: join(root, "agent"),
      trustRoot,
    };
    const initialized = await initializeAgent(config);
    assert.equal(initialized.lastDispatchCommit, null);

    await writeFile(join(repo, "unexpected.txt"), "invalid dispatch tree\n");
    await git(repo, ["add", "unexpected.txt"]);
    await git(repo, ["commit", "-m", "invalid dispatch"]);
    const invalidCommit = await git(repo, ["rev-parse", "HEAD"]);
    await git(repo, ["push", "origin", `HEAD:${config.dispatchRef}`]);

    await assert.rejects(
      agentOnce(config),
      policyReason("dispatch_commit_files_invalid"),
    );
    const result = JSON.parse(await readFile(
      join(config.stateRoot, "results", `commit-${invalidCommit}-failed.json`),
      "utf8",
    ));
    assert.equal(result.reason, "dispatch_commit_files_invalid");
    assert.equal(result.status, "FAIL_DISPATCH_NOT_REUSABLE");
    const idle = await agentOnce(config);
    assert.equal(idle.status, "IDLE_NO_NEW_DISPATCH");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent reports a stable policy reason when its remote cannot be read", async () => {
  const root = await mkdtemp(join(tmpdir(), "dispatch-agent-remote-failure-"));
  try {
    const config = {
      dispatchRef: "refs/heads/production-dispatch-test",
      dispatchTrackingRef: "refs/market-radar-dispatch/incoming-test",
      mirrorPath: join(root, "agent", "mirror.git"),
      publicKeyPath: join(root, "public.pem"),
      remoteUrl: join(root, "missing-remote.git"),
      schemaVersion: AGENT_CONFIG_SCHEMA,
      sourceRefs: ["refs/heads/main"],
      stagingRoots: [join(root, "staging")],
      stateRoot: join(root, "agent"),
      trustRoot: join(root, "trust"),
    };
    await assert.rejects(
      initializeAgent(config),
      policyReason("dispatch_agent_remote_fetch_failed"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent service source contains no browser, SSH, arbitrary command or secret transport", async () => {
  const source = await readFile("scripts/v2/production/fixed-channel/production-dispatch.mjs", "utf8");
  assert.doesNotMatch(source, /execFile(?:Async)?\(\s*["'](?:ssh|scp)["']|OrcaTerm|playwright|computer-use/iu);
  assert.doesNotMatch(source, /child_process\.(?:exec|execSync)|\beval\s*\(/u);
  assert.match(source, /noArbitraryCommand/);
  assert.match(source, /transportContainsSecrets/);
  assert.match(source, /productionLeaseState/);
  assert.match(source, /DEFERRED_PRODUCTION_LEASE_UNCERTAIN/);
  assert.match(source, /cwd: dirname\(requestPath\)/);
  assert.match(source, /NODE_OPTIONS: "--jitless"/);
  assert.match(source, /dirname\(process\.execPath\)/);
  assert.match(source, /claimHandle\.sync\(\)/);
  assert.match(source, /merge-base/);
  assert.equal(canonicalJson({ z: 1, a: { y: 2, b: 3 } }),
    "{\"a\":{\"b\":3,\"y\":2},\"z\":1}\n");
});

test("installer plan is non-mutating and install remains exact-hash gated", async () => {
  const { stdout } = await execFileAsync("bash", [
    "scripts/v2/production/fixed-channel/install-production-dispatch.sh",
    "plan",
  ], { encoding: "utf8" });
  const plan = JSON.parse(stdout);
  assert.equal(plan.productionMutation, false);
  assert.equal(plan.opensInboundPort, false);
  assert.equal(plan.transportsSecret, false);
  assert.equal(plan.credentialBootstrapRequired, true);
  assert.equal(plan.credentialIncludedInArchive, false);
  assert.equal(plan.credentialScope, "single_repository_read_only_deploy_key");
  assert.equal(plan.dispatchRemoteUrl, "git@github.com:TianYuan1926/chuan-market-radar.git");
  assert.equal(plan.arbitraryCommandAllowed, false);
  assert.equal(plan.pollSeconds, 20);
  assert.equal(plan.hostNodeRequired, false);
  assert.equal(plan.nodeRuntime.distribution, "official_nodejs_linux_x64");
  assert.equal(plan.nodeRuntime.version, "v24.18.0");
  assert.equal(plan.nodeRuntime.archiveSha256,
    "55aa7153f9d88f28d765fcdad5ae6945b5c0f98a36881703817e4c450fa76742");
  assert.equal(plan.nodeRuntime.binarySha256,
    "41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c");
  assert.equal(plan.nodeRuntime.licenseSha256,
    "148eacf7863ef4329224a29398623077200a27194aa075569faf4a0a85566ca5");
  assert.equal(plan.nodeRuntime.globalInstallAllowed, false);
  assert.match(plan.sourceSetSha256, /^[a-f0-9]{64}$/u);

  const installer = await readFile(
    "scripts/v2/production/fixed-channel/install-production-dispatch.sh",
    "utf8",
  );
  assert.match(installer, /INSTALL_SIGNED_PULL_ONLY_PRODUCTION_DISPATCH/);
  assert.match(installer, /EXPECTED_DISPATCH_SOURCE_SET_SHA256/);
  assert.match(installer, /EXPECTED_DISPATCH_PUBLIC_KEY_SHA256/);
  assert.match(installer, /EXPECTED_DISPATCH_NODE_SHA256/);
  assert.match(installer, /EXPECTED_DISPATCH_NODE_ARCHIVE_SHA256/);
  assert.match(installer, /EXPECTED_DISPATCH_NODE_LICENSE_SHA256/);
  assert.match(installer, /EXPECTED_DISPATCH_DEPLOY_PUBLIC_KEY_SHA256/);
  assert.match(installer, /EXPECTED_DISPATCH_KNOWN_HOSTS_SHA256/);
  assert.match(installer, /read-only deploy key cannot read the pinned private repository/);
  assert.match(installer, /PINNED_NODE_VERSION="v24\.18\.0"/);
  assert.match(installer,
    /NODE_ARCHIVE_URL="https:\/\/nodejs\.org\/dist\/v24\.18\.0\/\$\{NODE_ARCHIVE_NAME\}"/u);
  assert.match(installer, /curl --fail --location --proto '=https'/u);
  assert.match(installer, /Node runtime archive checksum mismatch/u);
  assert.match(installer, /pinned Node runtime requires x86_64/);
  assert.ok(installer.indexOf("curl --fail") < installer.indexOf("INSTALL_STARTED=true"));
  assert.ok(installer.indexOf("Node runtime version binding mismatch")
    < installer.indexOf("INSTALL_STARTED=true"));
  assert.ok(installer.indexOf("git ls-remote --exit-code")
    < installer.indexOf("INSTALL_STARTED=true"));
  assert.match(installer, /INSTALLER_SOURCE/);
  assert.match(installer, /LAUNCHER_SOURCE/);
  assert.match(installer, /agent-initialize/);
  assert.match(installer, /systemctl enable --now/);
  assert.match(installer, /ROLLBACK_PRODUCTION_DISPATCH_PARTIAL_INSTALL/);
  assert.doesNotMatch(installer, /\bscp\b/u);
  assert.doesNotMatch(installer, /docker compose|git checkout|git pull|\.env\.production/u);
});

test("short installer launcher verifies exact package facts and rejects tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-radar-dispatch-launcher-"));
  const packageRoot = join(root, "package");
  const sourceRoot = "scripts/v2/production/fixed-channel";
  const sourceFiles = [
    "README.md",
    "git-ssh-dispatch.sh",
    "github-known-hosts",
    "install-production-dispatch-launcher.sh",
    "install-production-dispatch.sh",
    "market-radar-production-dispatch.service",
    "market-radar-production-dispatch.timer",
    "production-dispatch.mjs",
  ];
  try {
    await mkdir(packageRoot);
    for (const name of sourceFiles) {
      await execFileAsync("cp", [join(sourceRoot, name), join(packageRoot, name)]);
    }
    const { stdout: planRaw } = await execFileAsync("bash", [
      join(packageRoot, "install-production-dispatch.sh"),
      "plan",
    ], { encoding: "utf8" });
    const plan = JSON.parse(planRaw);
    const publicKey = "-----BEGIN PUBLIC KEY-----\nTEST-ONLY-PUBLIC-KEY\n-----END PUBLIC KEY-----\n";
    await writeFile(join(packageRoot, "ed25519-public.pem"), publicKey);
    const generatedDeployKey = join(root, "commented-deploy-key");
    await execFileAsync("ssh-keygen", [
      "-q",
      "-t",
      "ed25519",
      "-N",
      "",
      "-C",
      "market-radar-commented-key-test",
      "-f",
      generatedDeployKey,
    ]);
    const generatedDeployPublicFields = (await readFile(`${generatedDeployKey}.pub`, "utf8"))
      .trim()
      .split(/\s+/u);
    const canonicalDeployPublicKey = `${generatedDeployPublicFields[0]} ${generatedDeployPublicFields[1]}\n`;
    const facts = {
      schemaVersion: "market-radar-production-dispatch-install-facts.v3",
      generatedAt: "2026-07-22T00:00:00Z",
      sourceCommit: "a".repeat(40),
      sourceRef: "refs/heads/codex/market-radar-v2-implementation",
      sourceSetSha256: plan.sourceSetSha256,
      publicKeySha256: sha256(publicKey),
      transportContainsSecrets: false,
      productionMutationPrepared: false,
      hostNodeRequired: false,
      repositoryAccess: {
        authentication: "github_read_only_deploy_key",
        deployPublicKeySha256: sha256(canonicalDeployPublicKey),
        dispatchRemoteUrl: "git@github.com:TianYuan1926/chuan-market-radar.git",
        knownHostsSha256: sha256(await readFile(join(packageRoot, "github-known-hosts"))),
        privateKeyIncludedInArchive: false,
        writeAccessAllowed: false,
      },
      nodeRuntime: {
        provisioning: "pinned_official_https_download",
        distribution: "official_nodejs_linux_x64",
        version: plan.nodeRuntime.version,
        archiveSha256: plan.nodeRuntime.archiveSha256,
        binarySha256: plan.nodeRuntime.binarySha256,
        licenseSha256: plan.nodeRuntime.licenseSha256,
        globalInstallAllowed: false,
      },
    };
    await writeFile(join(packageRoot, "INSTALL_FACTS.json"), `${JSON.stringify(facts, null, 2)}\n`);
    const manifestFiles = ["INSTALL_FACTS.json", "ed25519-public.pem", ...sourceFiles].sort();
    const manifestLines = [];
    for (const name of manifestFiles) {
      manifestLines.push(`${sha256(await readFile(join(packageRoot, name)))}  ${name}`);
    }
    await writeFile(join(packageRoot, "SHA256SUMS"), `${manifestLines.join("\n")}\n`);

    const { stdout } = await execFileAsync("bash", [
      join(packageRoot, "install-production-dispatch-launcher.sh"),
      "verify",
    ], { encoding: "utf8" });
    const result = JSON.parse(stdout);
    assert.equal(result.status, "PASS_EXACT_INSTALL_PACKAGE_VERIFIED_NO_MUTATION");
    assert.equal(result.productionMutation, false);
    assert.equal(result.sourceSetSha256, plan.sourceSetSha256);

    await assert.rejects(
      execFileAsync("bash", [
        join(packageRoot, "install-production-dispatch-launcher.sh"),
        "install",
      ], { encoding: "utf8" }),
      /server-generated deploy key is missing/u,
    );

    const packagedDeployKey = join(packageRoot, "github-deploy-key");
    await execFileAsync("cp", [generatedDeployKey, packagedDeployKey]);
    await execFileAsync("chmod", ["600", packagedDeployKey]);
    let installEnvironment = process.env;
    if (process.platform === "darwin") {
      const shimRoot = join(root, "bin");
      const statShim = join(shimRoot, "stat");
      const systemctlShim = join(shimRoot, "systemctl");
      await mkdir(shimRoot);
      await writeFile(statShim, `#!/bin/sh
if [ "$1" = "-c" ] && [ "$2" = "%a" ]; then
  exec /usr/bin/stat -f "%Lp" "$3"
fi
if [ "$1" = "-c" ] && [ "$2" = "%u" ]; then
  exec /usr/bin/stat -f "%u" "$3"
fi
exec /usr/bin/stat "$@"
`);
      await writeFile(systemctlShim, "#!/bin/sh\nexit 1\n");
      await execFileAsync("chmod", ["755", statShim]);
      await execFileAsync("chmod", ["755", systemctlShim]);
      installEnvironment = { ...process.env, PATH: `${shimRoot}:${process.env.PATH}` };
    }
    await assert.rejects(
      execFileAsync("bash", [
        join(packageRoot, "install-production-dispatch-launcher.sh"),
        "install",
      ], { encoding: "utf8", env: installEnvironment }),
      (error) => {
        const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
        assert.doesNotMatch(output, /deploy key.*(?:does not match|checksum binding mismatch)/u);
        assert.match(output, /pinned Node runtime requires x86_64|production repository is unavailable/u);
        return true;
      },
    );

    await writeFile(join(packageRoot, "README.md"), "tampered\n");
    await assert.rejects(
      execFileAsync("bash", [
        join(packageRoot, "install-production-dispatch-launcher.sh"),
        "verify",
      ], { encoding: "utf8" }),
      /package checksum verification failed/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("systemd poller is timer-bound, least-write and does not load production secrets", async () => {
  const service = await readFile(
    "scripts/v2/production/fixed-channel/market-radar-production-dispatch.service",
    "utf8",
  );
  const timer = await readFile(
    "scripts/v2/production/fixed-channel/market-radar-production-dispatch.timer",
    "utf8",
  );
  assert.match(service, /^User=ubuntu$/mu);
  assert.match(service, /^UMask=0077$/mu);
  assert.match(service,
    /^Environment=GIT_SSH_COMMAND=\/opt\/market-radar-production-dispatch\/git-ssh-dispatch\.sh$/mu);
  assert.match(service, /^ProtectSystem=strict$/mu);
  assert.match(service, /^ProtectHome=read-only$/mu);
  assert.match(service, /^PrivateDevices=true$/mu);
  assert.match(service, /^MemoryDenyWriteExecute=true$/mu);
  assert.match(service,
    /\/opt\/market-radar-production-dispatch\/runtime\/node --jitless .*agent-once --config/);
  assert.doesNotMatch(service, /EnvironmentFile|\.env|DATABASE_URL|TOKEN|PASSWORD/u);
  assert.match(timer, /^OnUnitActiveSec=20s$/mu);
  assert.match(timer, /^Persistent=true$/mu);
  assert.match(timer, /^Unit=market-radar-production-dispatch\.service$/mu);
  const wrapper = await readFile(
    "scripts/v2/production/fixed-channel/git-ssh-dispatch.sh",
    "utf8",
  );
  const knownHosts = await readFile(
    "scripts/v2/production/fixed-channel/github-known-hosts",
    "utf8",
  );
  assert.match(wrapper, /exec \/usr\/bin\/ssh/u);
  assert.match(wrapper, /BatchMode=yes/u);
  assert.match(wrapper, /IdentitiesOnly=yes/u);
  assert.match(wrapper, /StrictHostKeyChecking=yes/u);
  assert.doesNotMatch(wrapper, /eval|StrictHostKeyChecking=no/u);
  assert.match(knownHosts,
    /^github\.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n$/u);
});

test("governance contract matches the executable transport and truth boundary", async () => {
  const contract = JSON.parse(await readFile(
    "docs/governance/production-fixed-dispatch-channel.v1.json",
    "utf8",
  ));
  assert.equal(contract.status, "production_bootstrap_verified_not_installed");
  assert.equal(contract.cost.additionalPaidServiceRequired, false);
  assert.equal(contract.transport.method, "signed_git_bundle");
  assert.deepEqual(contract.transport.files, DISPATCH_FILES);
  assert.equal(contract.transport.maximumCompressedBytes, MAX_BUNDLE_BYTES);
  assert.equal(contract.transport.maximumUncompressedBytes, MAX_UNCOMPRESSED_BUNDLE_BYTES);
  assert.equal(contract.transport.secretsAllowed, false);
  assert.equal(contract.execution.arbitraryCommandAllowed, false);
  assert.equal(contract.execution.productionWipLimit, 1);
  assert.equal(contract.execution.externalLeaseDeferralRequired, true);
  assert.equal(contract.execution.uncertainLeaseDeferralRequired, true);
  assert.equal(contract.execution.automaticRollbackRequired, true);
  assert.equal(contract.execution.durableClaimRequiredBeforeLaunch, true);
  assert.equal(contract.execution.invalidSingleDispatchQuarantineRequired, true);
  assert.equal(contract.execution.launchWorkingDirectory, "exact_staging_root");
  assert.equal(contract.execution.nodeChildJitlessRequired, true);
  assert.equal(contract.installation.installerIncludedInSourceSet, true);
  assert.equal(contract.installation.checksumBoundShortLauncherRequired, true);
  assert.equal(contract.installation.manualLongEnvironmentCommandRequired, false);
  assert.equal(contract.installation.hostNodeRequired, false);
  assert.equal(contract.installation.runtimeBundled, false);
  assert.equal(contract.installation.runtimeProvisioning, "pinned_official_https_download");
  assert.equal(contract.installation.runtimeVersion, "v24.18.0");
  assert.equal(contract.installation.runtimeBinarySha256,
    "41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c");
  assert.equal(contract.installation.runtimeGlobalInstallAllowed, false);
  assert.equal(contract.installation.existingInstallOverwriteAllowed, false);
  assert.equal(contract.installation.partialFirstInstallRollbackRequired, true);
  assert.equal(contract.bootstrapEvidence.sourceCommit,
    "1411618d44eccd88b8714bf04df2a99a47f471dd");
  assert.equal(contract.bootstrapEvidence.archiveSha256,
    "80e0932a64feb0347dd41a7e4361cc90d0e64497a526cc16ad58148317479cdd");
  assert.equal(contract.bootstrapEvidence.sourceSetSha256,
    "92a629309c8e043ed9717b1e4f518242ea4fa208744f5570596a5a8be9a10dcb");
  assert.equal(contract.bootstrapEvidence.publicKeySha256,
    "dc1030528911cfb0027bc1237562f84cb0c8c155cdb8bf55d0dacfe6b32ceb93");
  assert.equal(contract.bootstrapEvidence.targetVerifyMarker,
    "PASS_EXACT_INSTALL_PACKAGE_VERIFIED_NO_MUTATION");
  assert.equal(contract.bootstrapEvidence.productionMutation, false);
  assert.equal(contract.bootstrapEvidence.persistentServiceInstalled, false);
  assert.equal(contract.recurrenceRootCauseGate.requiredForEveryActivePackage, true);
  assert.equal(contract.recurrenceRootCauseGate.currentOpenIncidentCount, 2);
  assert.equal(contract.recurrenceRootCauseGate.allowedBootstrapOperation,
    "fixed_dispatch_bootstrap_install");
  assert.equal(contract.exceptions[0].mayBypassCloudMfa, false);
  assert.equal(contract.exceptions[1].mayMisreportTransport, false);
});

test("V2 GitHub workflow has quality authority only", async () => {
  const workflow = await readFile(
    ".github/workflows/v2-production-dispatch-quality.yml",
    "utf8",
  );
  assert.match(workflow, /npm run test:production-dispatch/u);
  assert.match(workflow, /npm run test:recurrence-gate/u);
  assert.match(workflow, /runs-on: ubuntu-24\.04/u);
  assert.match(workflow, /contents: read/u);
  assert.match(workflow, /production_execution=false/u);
  assert.doesNotMatch(workflow, /runs-on:\s*\[?self-hosted|environment:\s*production/iu);
  assert.doesNotMatch(workflow, /production:dispatch(?:\s+|:)publish|systemctl|docker compose|\bssh\b|\bscp\b/iu);
  assert.doesNotMatch(workflow, /permissions:[\s\S]*?\bwrite\b/iu);
  assert.doesNotMatch(workflow, /secrets\./u);
});
