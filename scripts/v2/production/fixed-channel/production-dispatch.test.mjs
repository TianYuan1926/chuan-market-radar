import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  AGENT_CONFIG_SCHEMA,
  AGENT_LOCK_SCHEMA,
  AGENT_LOCK_UNOWNED_STALE_MS,
  DISPATCH_FILES,
  DispatchPolicyError,
  MAX_BUNDLE_BYTES,
  MAX_UNCOMPRESSED_BUNDLE_BYTES,
  acquireAgentLock,
  agentOnce,
  canonicalJson,
  generateSigningKeyPair,
  initializeAgent,
  prepareDispatch,
  publishDispatch,
  releaseAgentLock,
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

test("publish accepts a short branch name and rejects a full Git ref before I/O", async () => {
  await assert.rejects(
    publishDispatch({
      branch: "refs/heads/production-dispatch",
      outbox: "/does/not/exist",
      publicKeyPath: "/does/not/exist",
      repo: "/does/not/exist",
    }),
    policyReason("dispatch_branch_invalid"),
  );
});

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

test("agent lock refuses a live owner and recovers a dead owner without weakening exclusivity", async () => {
  const root = await mkdtemp(join(tmpdir(), "dispatch-agent-owned-lock-"));
  const now = new Date("2026-07-27T08:00:00.000Z");
  const firstOwner = {
    acquiredAt: now.toISOString(),
    bootId: "test-boot-id",
    pid: 1001,
    processStartToken: "4001",
    schemaVersion: AGENT_LOCK_SCHEMA,
    token: "a".repeat(64),
  };
  const secondOwner = {
    ...firstOwner,
    pid: 1002,
    processStartToken: "4002",
    token: "b".repeat(64),
  };
  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const first = await acquireAgentLock(root, {
      now,
      ownerFactory: async () => firstOwner,
    });
    await assert.rejects(
      acquireAgentLock(root, {
        now,
        ownerFactory: async () => secondOwner,
        ownerIsActive: async () => true,
      }),
      policyReason("dispatch_agent_already_running"),
    );
    const recovered = await acquireAgentLock(root, {
      now: new Date(now.getTime() + 1_000),
      ownerFactory: async () => secondOwner,
      ownerIsActive: async () => false,
    });
    assert.equal(recovered.recovery, "RECOVERED_DEAD_OWNER_LOCK");
    await releaseAgentLock(recovered);
    await assert.rejects(
      releaseAgentLock(first),
      policyReason("dispatch_agent_lock_owner_missing_or_invalid"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent lock self-heals the exact empty directory left by a timed-out legacy process", async () => {
  const root = await mkdtemp(join(tmpdir(), "dispatch-agent-empty-stale-lock-"));
  const lockPath = join(root, "agent.lock");
  const now = new Date("2026-07-27T08:00:00.000Z");
  const staleAt = new Date(now.getTime() - AGENT_LOCK_UNOWNED_STALE_MS - 1);
  const owner = {
    acquiredAt: now.toISOString(),
    bootId: "test-boot-id",
    pid: 1003,
    processStartToken: "4003",
    schemaVersion: AGENT_LOCK_SCHEMA,
    token: "c".repeat(64),
  };
  try {
    await mkdir(lockPath, { mode: 0o700 });
    await utimes(lockPath, staleAt, staleAt);
    const recovered = await acquireAgentLock(root, {
      now,
      ownerFactory: async () => owner,
    });
    assert.equal(recovered.recovery, "RECOVERED_UNOWNED_STALE_LOCK");
    await releaseAgentLock(recovered);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent lock fails closed for a recent empty directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "dispatch-agent-empty-recent-lock-"));
  const lockPath = join(root, "agent.lock");
  const now = new Date();
  try {
    await mkdir(lockPath, { mode: 0o700 });
    await assert.rejects(
      acquireAgentLock(root, { now }),
      policyReason("dispatch_agent_lock_owner_missing_or_invalid_recent"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent service source contains no browser, SSH, arbitrary command or secret transport", async () => {
  const source = await readFile("scripts/v2/production/fixed-channel/production-dispatch.mjs", "utf8");
  const sshWrapper = await readFile(
    "scripts/v2/production/fixed-channel/git-ssh-dispatch.sh",
    "utf8",
  );
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
  assert.match(source, /Math\.min\(requestedTimeout, AGENT_GIT_COMMAND_TIMEOUT_MS\)/);
  assert.match(source, /\n\s+timeout,\n/u);
  assert.match(source, /RECOVERED_UNOWNED_STALE_LOCK/);
  assert.match(source, /RECOVERED_DEAD_OWNER_LOCK/);
  assert.match(sshWrapper, /ConnectTimeout=20/);
  assert.match(sshWrapper, /ConnectionAttempts=2/);
  assert.match(sshWrapper, /ServerAliveInterval=15/);
  assert.match(sshWrapper, /ServerAliveCountMax=2/);
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
  assert.match(installer, /STATE_ROOT="\/var\/lib\/market-radar-production-dispatch"/u);
  assert.doesNotMatch(installer, /STATE_ROOT="\/var\/lib\/market-radar-ops/u);
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
      const xzShim = join(shimRoot, "xz");
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
      await writeFile(xzShim, "#!/bin/sh\nprintf 'test xz shim must not execute\\n' >&2\nexit 99\n");
      await execFileAsync("chmod", ["755", statShim]);
      await execFileAsync("chmod", ["755", systemctlShim]);
      await execFileAsync("chmod", ["755", xzShim]);
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
  assert.match(service, /^ReadWritePaths=\/var\/lib\/market-radar-production-dispatch$/mu);
  assert.doesNotMatch(service, /\/var\/lib\/market-radar-ops/u);
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
  assert.equal(contract.status, "production_operational_first_signed_dispatch_accepted");
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
  assert.equal(contract.execution.gitChildTimeoutSeconds, 90);
  assert.equal(contract.execution.gitChildTimeoutCallerOverrideAllowed, false);
  assert.equal(contract.execution.lockOwnerIdentityRequired, true);
  assert.deepEqual(contract.execution.lockOwnerFields, [
    "bootId",
    "pid",
    "processStartToken",
    "acquiredAt",
    "token",
  ]);
  assert.equal(contract.execution.liveOwnerRecoveryAllowed, false);
  assert.equal(contract.execution.provenDeadOwnerRecoveryRequired, true);
  assert.equal(contract.execution.legacyUnownedLockMinimumStaleSeconds, 240);
  assert.equal(contract.execution.lockReleaseOwnershipTokenRequired, true);
  assert.equal(contract.installation.installerIncludedInSourceSet, true);
  assert.equal(contract.installation.checksumBoundShortLauncherRequired, true);
  assert.equal(contract.installation.manualLongEnvironmentCommandRequired, false);
  assert.equal(contract.installation.hostNodeRequired, false);
  assert.equal(contract.installation.runtimeBundled, false);
  assert.equal(contract.installation.runtimeProvisioning, "pinned_official_https_download");
  assert.equal(contract.installation.runtimeVersion, "v24.18.0");
  assert.equal(contract.installation.stateRoot, "/var/lib/market-radar-production-dispatch");
  assert.equal(contract.installation.runtimeBinarySha256,
    "41a74efb34cbde5c7632cdac0cf8bd1a14d0b8d73dc1e82755014d9a9ce70f5c");
  assert.equal(contract.installation.runtimeGlobalInstallAllowed, false);
  assert.equal(contract.installation.existingInstallOverwriteAllowed, false);
  assert.equal(contract.installation.partialFirstInstallRollbackRequired, true);
  assert.equal(contract.bootstrapEvidence.sourceCommit,
    "7a59e45b1c277907475f093a25cbb310b7287e12");
  assert.equal(contract.bootstrapEvidence.archiveSha256,
    "cf05305b3d8e869375e2c9cb37db9a79cedc3b426c71ba4793b405a80b4d8337");
  assert.equal(contract.bootstrapEvidence.sourceSetSha256,
    "39387c3a01cae0ce1532e5cd9f065c3629a4bdd0651c8396b5f1a6b392bb998c");
  assert.equal(contract.bootstrapEvidence.publicKeySha256,
    "dc1030528911cfb0027bc1237562f84cb0c8c155cdb8bf55d0dacfe6b32ceb93");
  assert.equal(contract.bootstrapEvidence.targetVerifyMarker,
    "PASS_EXACT_INSTALL_PACKAGE_VERIFIED_NO_MUTATION");
  assert.equal(contract.bootstrapEvidence.installMarker,
    "PASS_SIGNED_PULL_ONLY_PRODUCTION_DISPATCH_INSTALLED");
  assert.equal(contract.bootstrapEvidence.productionMutation, true);
  assert.equal(contract.bootstrapEvidence.persistentServiceInstalled, true);
  assert.equal(contract.bootstrapEvidence.timerEnabled, true);
  assert.equal(contract.bootstrapEvidence.timerActive, true);
  assert.equal(contract.bootstrapEvidence.firstAgentState, "initialized_no_replay");
  assert.equal(contract.bootstrapEvidence.steadyAgentStatus, "IDLE_NO_DISPATCH_REF");
  assert.equal(contract.bootstrapEvidence.productionHeadBeforeAfter,
    "cec0b6572bb09ae91ff9e013f8bb160f73c045e2");
  assert.equal(contract.bootstrapEvidence.containerIdentityUnchanged, true);
  assert.equal(contract.bootstrapEvidence.productionHealthLevel, "ready");
  assert.equal(contract.bootstrapEvidence.scanFreshness, "fresh");
  assert.equal(contract.bootstrapEvidence.opensInboundPort, false);
  assert.equal(contract.bootstrapEvidence.stagingCleaned, true);
  assert.equal(contract.bootstrapEvidence.firstSignedDispatchAccepted, true);
  assert.equal(contract.firstSignedDispatchEvidence.status,
    "PASS_FIXED_DISPATCH_FIRST_SIGNED_ACCEPTANCE");
  assert.equal(contract.firstSignedDispatchEvidence.dispatchCommit,
    "467ce8e2156aabe399ca61211b232c9d81294c4e");
  assert.equal(contract.firstSignedDispatchEvidence.sourceCommit,
    "5a98c7d2783a2e74e36fec47541a2b9f2d7eada4");
  assert.equal(contract.firstSignedDispatchEvidence.containerCount, 11);
  assert.equal(contract.firstSignedDispatchEvidence.containerIdentityUnchanged, true);
  assert.equal(contract.firstSignedDispatchEvidence.transportContainsSecrets, false);
  assert.equal(contract.firstSignedDispatchEvidence.stagingCleaned, true);
  assert.equal(contract.timeoutLockRecoveryEvidence.status,
    "PASS_FIXED_DISPATCH_LOCK_RECOVERY");
  assert.equal(contract.timeoutLockRecoveryEvidence.sourceCommit,
    "2b4fccc9f3affe613d4f0da0f97295d97b0c6452");
  assert.equal(contract.timeoutLockRecoveryEvidence.alreadyRunningFailureCount, 4526);
  assert.equal(contract.timeoutLockRecoveryEvidence.expiredDispatchClaimCreated, false);
  assert.equal(contract.timeoutLockRecoveryEvidence.expiredBusinessRunnerLaunched, false);
  assert.equal(contract.timeoutLockRecoveryEvidence.agentLockAbsentAfterAcceptance, true);
  assert.equal(contract.timeoutLockRecoveryEvidence.containerIdentityUnchanged, true);
  assert.equal(contract.timeoutLockRecoveryEvidence.businessRuntimeMutation, false);
  assert.equal(contract.timeoutLockRecoveryEvidence.stagingCleaned, true);
  assert.equal(contract.recurrenceRootCauseGate.requiredForEveryActivePackage, true);
  assert.equal(contract.recurrenceRootCauseGate.currentOpenIncidentCount, 2);
  assert.equal(contract.recurrenceRootCauseGate.allowedBootstrapOperation,
    "fixed_dispatch_bootstrap_install");
  assert.equal(contract.recurrenceRootCauseGate.nextRequiredOperation,
    "p0r_fixed_dispatch_transport_stage_delivery");
  assert.equal(contract.recurrenceRootCauseGate.p0rReceiverCanaryStatus,
    "PASS_REAL_TARGET_NO_SECRET_DUAL_SESSION_BOUNDED_SHORT_COMMAND");
  assert.equal(contract.recurrenceRootCauseGate.p0rAtomicSessionStatus,
    "BE87_SOURCE_REMOTE_FOUR_GATES_AND_FRESH_REBIND_PASS_EXACT_TRANSPORT_V3_QUALIFIED_ORCATERM_DELIVERY_FAILED_ZERO_TARGET_ZERO_PRODUCTION_DRIFT_FIXED_DISPATCH_STAGE_LOCAL_PASS_NEW_SOURCE_AND_TARGET_ACCEPTANCE_PENDING");
  assert.equal(contract.recurrenceRootCauseGate.p0rRawStsResponsePersistenceAllowed, false);
  assert.equal(
    contract.recurrenceRootCauseGate.p0rComposeEnvReinterpolationForRuntimeIdentityAllowed,
    false,
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rSessionPidStartTokenAndSourceBindingRequired,
    true,
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rSecondaryFailureCleansAllSessionSecrets,
    true,
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rSuccessRequiresVerifiedSecretCleanup,
    true,
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rCredentialAndAgeIdentityOwnerUid,
    0,
  );
  assert.equal(
    contract.recurrenceRootCauseGate
      .p0rAgeIdentityExactBech32AlphabetAndLengthRequired,
    true,
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rRunnerEvidenceOutputDirectoryCreation,
    "ATOMIC_MODE_700",
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rRunnerPrivateEphemeralDirectoryRequired,
    true,
  );
  assert.equal(contract.recurrenceRootCauseGate.p0rRunnerInternalTeeAllowed, false);
  assert.equal(
    contract.recurrenceRootCauseGate
      .p0rRunnerPrivateEphemeralDirectoryVerifiedCleanupRequired,
    true,
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rFreshRebindRequestSchema,
    "market-radar-v2-m1-p0r-rebind-request.v4",
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rFreshRebindResultSchema,
    "market-radar-v2-m1-p0r-rebind-result.v3",
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rFreshRebindForbiddenListenerPort,
    8022,
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rFreshRebindForbiddenListenerUnit,
    "market-radar-p0r-8022.service",
  );
  assert.equal(
    contract.recurrenceRootCauseGate
      .p0rFreshRebindForbiddenListenerAndUnitAbsenceRequired,
    true,
  );
  assert.equal(
    contract.recurrenceRootCauseGate
      .p0rFreshRebindDispatchRuntimeMaxSeconds,
    90,
  );
  assert.equal(
    contract.recurrenceRootCauseGate
      .p0rFreshRebindDispatchRuntimeBoundInRequest,
    true,
  );
  assert.equal(
    contract.recurrenceRootCauseGate
      .p0rFixedChannelCrossLayerApprovalBindingRequired,
    true,
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rInvalidOuterRuntimeRejectedBeforeOutbox,
    true,
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rSingleHighLevelReleaseEntrypoint,
    "scripts/v2/production/m1-p0r-rebind-dispatch-release.mjs",
  );
  assert.equal(
    contract.recurrenceRootCauseGate
      .p0rOperatorSuppliedDispatchRuntimeAllowed,
    false,
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rFreshRebindCurrentRuntimeFileCount,
    8,
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rFreshRebindCurrentRuntimeIncludesAtomicSession,
    true,
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rFreshRebindCurrentRuntimeIncludesRuntimeCapsuleHelper,
    true,
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rHistoricalSupersessionComparisonFileCount,
    3,
  );
  assert.equal(
    contract.recurrenceRootCauseGate
      .p0rCurrentRuntimeAndHistoricalComparisonSetsMustRemainSeparate,
    true,
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rSecretInputCompletion,
    "PRESS_ENTER_THEN_CTRL_D_ONCE",
  );
  assert.equal(contract.recurrenceRootCauseGate.p0rSecretSessionEntrypointCount, 2);
  assert.equal(contract.recurrenceRootCauseGate.p0rOrcaTermCommandMaxUtf8Bytes, 200);
  assert.equal(contract.recurrenceRootCauseGate.p0rOrcaTermEditorClearBeforeEveryCommand, true);
  assert.equal(contract.recurrenceRootCauseGate.p0rOrcaTermEditorMinimumSettleMilliseconds, 1000);
  assert.equal(contract.recurrenceRootCauseGate.p0rOrcaTermExactVisiblePreviewBeforeEveryExecution, true);
  assert.equal(
    contract.recurrenceRootCauseGate.p0rOrcaTermFileManagerPackageTransportAllowed,
    false,
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rTransportStageRequestSchema,
    "market-radar-v2-m1-p0r-transport-stage-request.v1",
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rTransportStageManifestSchema,
    "market-radar-v2-m1-p0r-transport-stage-manifest.v1",
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rTransportStageTransportSchema,
    "v2-m1-production-storage-p0r-transport.v4",
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rTransportStageSingleHighLevelReleaseEntrypoint,
    "scripts/v2/production/m1-p0r-transport-staging-release.mjs",
  );
  assert.equal(contract.recurrenceRootCauseGate.p0rTransportStageRuntimeMaxSeconds, 90);
  assert.equal(contract.recurrenceRootCauseGate.p0rTransportStageOuterMemberCount, 5);
  assert.equal(contract.recurrenceRootCauseGate.p0rTransportStageInnerMemberCount, 17);
  assert.equal(contract.recurrenceRootCauseGate.p0rTransportStageContainsSecrets, false);
  assert.equal(
    contract.recurrenceRootCauseGate.p0rTransportStageCredentialRequestAllowed,
    false,
  );
  assert.equal(contract.recurrenceRootCauseGate.p0rTransportStageDatabaseAccessAllowed, false);
  assert.equal(contract.recurrenceRootCauseGate.p0rTransportStageRecoveryLaunchAllowed, false);
  assert.equal(
    contract.recurrenceRootCauseGate.p0rTransportStageDeliveryRoot,
    "/home/ubuntu/.cache/market-radar-v2/p0r/staging",
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rTransportStageAtomicNoClobberDeliveryRequired,
    true,
  );
  assert.equal(
    contract.recurrenceRootCauseGate.p0rTransportStageExactModesOwnerHashesAndCleanupRequired,
    true,
  );
  assert.ok(contract.recurrenceRootCauseGate.retiredOperations.includes(
    "p0r_orcaterm_overlength_composite_command"));
  assert.ok(contract.recurrenceRootCauseGate.retiredOperations.includes(
    "p0r_orcaterm_unsettled_rapid_editor_write"));
  for (const operation of [
    "p0r_persisted_raw_sts_and_manual_compile_sequence",
    "p0r_ax_response_reconstruction",
    "p0r_compose_env_reinterpolation_for_runtime_identity",
    "p0r_orcaterm_recovery_bundle_transport",
  ]) assert.ok(contract.recurrenceRootCauseGate.retiredOperations.includes(operation));
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
  assert.equal(
    workflow.match(/"scripts\/v2\/production\/\*\*"/gu)?.length,
    2,
    "push and pull_request must qualify every V2 production script change",
  );
  assert.doesNotMatch(workflow, /"scripts\/v2\/production\/fixed-channel\/\*\*"/u);
  assert.doesNotMatch(workflow, /runs-on:\s*\[?self-hosted|environment:\s*production/iu);
  assert.doesNotMatch(workflow, /production:dispatch(?:\s+|:)publish|systemctl|docker compose|\bssh\b|\bscp\b/iu);
  assert.doesNotMatch(workflow, /permissions:[\s\S]*?\bwrite\b/iu);
  assert.doesNotMatch(workflow, /secrets\./u);
});
