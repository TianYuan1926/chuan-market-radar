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
  assert.equal(plan.arbitraryCommandAllowed, false);
  assert.equal(plan.pollSeconds, 20);
  assert.match(plan.sourceSetSha256, /^[a-f0-9]{64}$/u);

  const installer = await readFile(
    "scripts/v2/production/fixed-channel/install-production-dispatch.sh",
    "utf8",
  );
  assert.match(installer, /INSTALL_SIGNED_PULL_ONLY_PRODUCTION_DISPATCH/);
  assert.match(installer, /EXPECTED_DISPATCH_SOURCE_SET_SHA256/);
  assert.match(installer, /EXPECTED_DISPATCH_PUBLIC_KEY_SHA256/);
  assert.match(installer, /INSTALLER_SOURCE/);
  assert.match(installer, /agent-initialize/);
  assert.match(installer, /systemctl enable --now/);
  assert.match(installer, /ROLLBACK_PRODUCTION_DISPATCH_PARTIAL_INSTALL/);
  assert.doesNotMatch(installer, /\b(?:ssh|scp|curl)\s/u);
  assert.doesNotMatch(installer, /docker compose|git checkout|git pull|\.env\.production/u);
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
  assert.match(service, /^ProtectSystem=strict$/mu);
  assert.match(service, /^ProtectHome=read-only$/mu);
  assert.match(service, /^PrivateDevices=true$/mu);
  assert.match(service, /^MemoryDenyWriteExecute=true$/mu);
  assert.match(service, /node --jitless .*agent-once --config/);
  assert.doesNotMatch(service, /EnvironmentFile|\.env|DATABASE_URL|TOKEN|PASSWORD/u);
  assert.match(timer, /^OnUnitActiveSec=20s$/mu);
  assert.match(timer, /^Persistent=true$/mu);
  assert.match(timer, /^Unit=market-radar-production-dispatch\.service$/mu);
});

test("governance contract matches the executable transport and truth boundary", async () => {
  const contract = JSON.parse(await readFile(
    "docs/governance/production-fixed-dispatch-channel.v1.json",
    "utf8",
  ));
  assert.equal(contract.status, "local_implemented_production_not_installed");
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
  assert.equal(contract.installation.existingInstallOverwriteAllowed, false);
  assert.equal(contract.installation.partialFirstInstallRollbackRequired, true);
  assert.equal(contract.exceptions[0].mayBypassCloudMfa, false);
  assert.equal(contract.exceptions[1].mayMisreportTransport, false);
});

test("V2 GitHub workflow has quality authority only", async () => {
  const workflow = await readFile(
    ".github/workflows/v2-production-dispatch-quality.yml",
    "utf8",
  );
  assert.match(workflow, /npm run test:production-dispatch/u);
  assert.match(workflow, /runs-on: ubuntu-24\.04/u);
  assert.match(workflow, /contents: read/u);
  assert.match(workflow, /production_execution=false/u);
  assert.doesNotMatch(workflow, /runs-on:\s*\[?self-hosted|environment:\s*production/iu);
  assert.doesNotMatch(workflow, /production:dispatch(?:\s+|:)publish|systemctl|docker compose|\bssh\b|\bscp\b/iu);
  assert.doesNotMatch(workflow, /permissions:[\s\S]*?\bwrite\b/iu);
  assert.doesNotMatch(workflow, /secrets\./u);
});
