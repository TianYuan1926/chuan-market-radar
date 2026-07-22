import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  ACCEPTANCE_ENTRYPOINT,
  ACCEPTANCE_DOCKER_READ_ACCESS_MODE,
  ACCEPTANCE_MANIFEST,
  ACCEPTANCE_MANIFEST_SCHEMA,
  ACCEPTANCE_PACKAGE_ID,
  ACCEPTANCE_REQUEST_SCHEMA,
  ACCEPTANCE_RESULT_SCHEMA,
  ACCEPTANCE_RUNNER,
  ACCEPTANCE_SUCCESS_MARKER,
  assertAcceptanceIdentity,
  canonicalJson,
  productionCommandInvocation,
  runAcceptance,
  runProductionCommand,
  sha256,
  validateAcceptanceRequest,
} from "./production-dispatch-acceptance.mjs";
import { buildAcceptanceBundle } from "./production-dispatch-acceptance-bundle.mjs";

const execFileAsync = promisify(execFile);
const SOURCE_COMMIT = "a".repeat(40);
const PRODUCTION_HEAD = "b".repeat(40);
const CONTAINER_IDS = Array.from({ length: 11 }, (_, index) => index.toString(16).padStart(64, "0"));

function fixtureRequest(policy, now = new Date("2026-07-23T04:00:00.000Z")) {
  const dispatchId = "g0-first-signed-20260723t040000z";
  return {
    applicationMutationAllowed: false,
    approvalExpiresAt: new Date(now.getTime() + 60 * 60_000).toISOString(),
    approvalIssuedAt: now.toISOString(),
    artifactManifestSha256: "c".repeat(64),
    automaticRollbackRequired: true,
    databaseMutationAllowed: false,
    dispatchId,
    dispatchStateRoot: policy.dispatchStateRoot,
    dockerReadAccessMode: ACCEPTANCE_DOCKER_READ_ACCESS_MODE,
    expectedContainerCount: 11,
    expectedContainerIds: CONTAINER_IDS,
    expectedHealth: {
      level: "ready",
      persistenceDatabaseStatus: "ready",
      scanFreshness: "fresh",
      scanStatus: "ready",
    },
    expectedProductionHead: PRODUCTION_HEAD,
    expectedRedisContainer: "chuan-market-radar-redis-1",
    expectedTimerUnit: "market-radar-production-dispatch.timer",
    launchSuccessMarker: ACCEPTANCE_SUCCESS_MARKER,
    maxExecutions: 1,
    packageId: ACCEPTANCE_PACKAGE_ID,
    productionMutationScope: "dispatch_state_staging_and_evidence_only",
    productionWorktree: policy.productionWorktree,
    redisMutationAllowed: false,
    resultPath: join(policy.dispatchStateRoot, "acceptance", `${dispatchId}.json`),
    revocationEpoch: 0,
    runnerUnitName: "market-radar-dispatch-accept-first20260723",
    schemaVersion: ACCEPTANCE_REQUEST_SCHEMA,
    sessionIndependentExecutionRequired: true,
    sourceCommit: SOURCE_COMMIT,
    sourceRef: "refs/heads/codex/market-radar-v2-implementation",
    stagingDirectory: join(policy.stagingRoot, `g0-fixed-dispatch-acceptance-${dispatchId}`),
    temporaryStagingCleanupRequired: true,
    transportBundleSha256: "d".repeat(64),
    transportContainsSecrets: false,
    transportMethod: "signed_git_bundle",
    workerMutationAllowed: false,
  };
}

test("acceptance request freezes no-secret read-only production boundaries", () => {
  const policy = {
    dispatchStateRoot: "/state",
    expectedContainerCount: 11,
    expectedRedisContainer: "chuan-market-radar-redis-1",
    expectedTimerUnit: "market-radar-production-dispatch.timer",
    productionWorktree: "/production",
    stagingRoot: "/staging",
  };
  const now = new Date("2026-07-23T04:00:00.000Z");
  const request = fixtureRequest(policy, now);
  assert.equal(validateAcceptanceRequest(request, { now, policy }), request);
  for (const key of [
    "applicationMutationAllowed", "databaseMutationAllowed", "redisMutationAllowed", "workerMutationAllowed",
  ]) {
    assert.throws(
      () => validateAcceptanceRequest({ ...request, [key]: true }, { now, policy }),
      new RegExp(`acceptance_${key}_must_be_false`),
    );
  }
  assert.throws(
    () => validateAcceptanceRequest({ ...request, transportMethod: "approved_orcaterm_bundle_upload" },
      { now, policy }),
    /acceptance_transport_method_invalid/,
  );
  assert.throws(
    () => validateAcceptanceRequest({ ...request, dockerReadAccessMode: "direct_socket" },
      { now, policy }),
    /acceptance_docker_read_access_mode_invalid/,
  );
});

test("production command invocation scopes sudo to exact read-only Docker calls", async () => {
  const inventory = ["ps", "--no-trunc", "--format", "{{.ID}}"];
  assert.deepEqual(productionCommandInvocation("docker", inventory), {
    args: ["-n", "--", "/usr/bin/docker", ...inventory],
    executable: "/usr/bin/sudo",
  });
  const redisPing = ["exec", "chuan-market-radar-redis-1", "redis-cli", "ping"];
  assert.deepEqual(productionCommandInvocation("docker", redisPing), {
    args: ["-n", "--", "/usr/bin/docker", ...redisPing],
    executable: "/usr/bin/sudo",
  });
  assert.throws(
    () => productionCommandInvocation("docker", ["compose", "up"]),
    /acceptance_docker_command_not_read_only/,
  );
  assert.deepEqual(productionCommandInvocation("git", ["status"]), {
    args: ["status"],
    executable: "/usr/bin/git",
  });
  await assert.rejects(
    runProductionCommand("docker", inventory, {
      execute: async () => { throw new Error("permission denied"); },
    }),
    /acceptance_command_docker_failed/,
  );
});

test("acceptance request rejects stale authority, weakened health and container ambiguity", () => {
  const policy = {
    dispatchStateRoot: "/state",
    expectedContainerCount: 11,
    expectedRedisContainer: "chuan-market-radar-redis-1",
    expectedTimerUnit: "market-radar-production-dispatch.timer",
    productionWorktree: "/production",
    stagingRoot: "/staging",
  };
  const issuedAt = new Date("2026-07-23T04:00:00.000Z");
  const request = fixtureRequest(policy, issuedAt);
  assert.throws(
    () => validateAcceptanceRequest(request, { now: new Date("2026-07-23T06:00:00.000Z"), policy }),
    /acceptance_request_not_current/,
  );
  assert.throws(
    () => validateAcceptanceRequest({
      ...request,
      expectedHealth: { ...request.expectedHealth, scanFreshness: "aging" },
    }, { now: issuedAt, policy }),
    /acceptance_health_expectation_weakened/,
  );
  assert.throws(
    () => validateAcceptanceRequest({
      ...request,
      expectedContainerIds: request.expectedContainerIds.map((id, index) => index === 1 ? request.expectedContainerIds[0] : id),
    }, { now: issuedAt, policy }),
    /acceptance_container_ids_duplicate/,
  );
});

test("acceptance runner verifies exact dispatch and writes content-addressed zero-drift evidence", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "dispatch-acceptance-test-")));
  const policy = {
    dispatchStateRoot: join(root, "state"),
    expectedContainerCount: 11,
    expectedRedisContainer: "chuan-market-radar-redis-1",
    expectedTimerUnit: "market-radar-production-dispatch.timer",
    productionWorktree: join(root, "production"),
    stagingRoot: join(root, "staging"),
  };
  const now = new Date("2026-07-23T04:00:00.000Z");
  const request = fixtureRequest(policy, now);
  const staging = request.stagingDirectory;
  const requestPath = join(staging, "approval-request.json");
  const markerPath = join(staging, ".transport-bundle.sha256");
  try {
    await mkdir(dirname(staging), { recursive: true, mode: 0o700 });
    await mkdir(staging, { mode: 0o700 });
    await mkdir(policy.productionWorktree, { mode: 0o700 });
    const entrypointBytes = await readFile(new URL("../fixed-channel-acceptance-entrypoint.sh", import.meta.url));
    const runnerBytes = await readFile(new URL("./production-dispatch-acceptance.mjs", import.meta.url));
    await mkdir(dirname(join(staging, ACCEPTANCE_ENTRYPOINT)), { recursive: true, mode: 0o700 });
    await mkdir(dirname(join(staging, ACCEPTANCE_RUNNER)), { recursive: true, mode: 0o700 });
    await writeFile(join(staging, ACCEPTANCE_ENTRYPOINT), entrypointBytes, { mode: 0o700 });
    await writeFile(join(staging, ACCEPTANCE_RUNNER), runnerBytes, { mode: 0o600 });
    const manifest = {
      archiveFormat: "ustar+gzip-n",
      containsSecrets: false,
      files: {
        [ACCEPTANCE_ENTRYPOINT]: sha256(entrypointBytes),
        [ACCEPTANCE_RUNNER]: sha256(runnerBytes),
      },
      mutationScope: request.productionMutationScope,
      packageId: request.packageId,
      schemaVersion: ACCEPTANCE_MANIFEST_SCHEMA,
      sourceCommit: request.sourceCommit,
      sourceDateEpoch: 946_684_800,
    };
    const manifestRaw = canonicalJson(manifest);
    request.artifactManifestSha256 = sha256(manifestRaw);
    const requestRaw = canonicalJson(request);
    const envelope = {
      approvalRequestSha256: sha256(requestRaw),
      automaticRollbackRequired: true,
      bundleSha256: request.transportBundleSha256,
      dispatchId: request.dispatchId,
      entrypointPath: ACCEPTANCE_ENTRYPOINT,
      expiresAt: request.approvalExpiresAt,
      issuedAt: request.approvalIssuedAt,
      launchSuccessMarker: request.launchSuccessMarker,
      maxExecutions: 1,
      packageId: request.packageId,
      productionMutation: true,
      revocationEpoch: request.revocationEpoch,
      runnerUnitName: request.runnerUnitName,
      sessionIndependentExecutionRequired: true,
      sourceRef: request.sourceRef,
      stagingDirectory: request.stagingDirectory,
      targetCommit: request.sourceCommit,
      transportContainsSecrets: false,
      transportMethod: "signed_git_bundle",
    };
    await writeFile(join(staging, ACCEPTANCE_MANIFEST), manifestRaw, { mode: 0o600 });
    await writeFile(requestPath, requestRaw, { mode: 0o600 });
    await writeFile(markerPath, `${request.transportBundleSha256}\n`, { mode: 0o600 });
    await writeFile(join(staging, ".dispatch.json"), canonicalJson(envelope), { mode: 0o600 });
    const calls = [];
    const health = JSON.stringify({
      ok: true,
      health: {
        level: "ready",
        persistence: { databaseStatus: "ready" },
        scan: { freshness: "fresh", status: "ready" },
      },
    });
    const commandRunner = async (command, args) => {
      calls.push([command, ...args]);
      if (command === "git" && args.includes("rev-parse")) return PRODUCTION_HEAD;
      if (command === "git") return "";
      if (command === "docker" && args[0] === "ps") return `${CONTAINER_IDS.join("\n")}\n`;
      if (command === "docker") return "PONG";
      if (command === "ss") return "LISTEN 0 4096 0.0.0.0:443 0.0.0.0:*";
      if (command === "systemctl" && args[0] === "is-enabled") return "enabled";
      if (command === "systemctl") return "active";
      if (command === "curl" && args.at(-1).endsWith("/api/health")) return health;
      if (command === "curl") return JSON.stringify({ contract: "present" });
      throw new Error(`unexpected command ${command}`);
    };
    const result = await runAcceptance({ bundleMarkerPath: markerPath, commandRunner, now, policy, requestPath });
    assert.equal(result.schemaVersion, ACCEPTANCE_RESULT_SCHEMA);
    assert.equal(result.status, ACCEPTANCE_SUCCESS_MARKER);
    assert.equal(result.productionHeadBefore, PRODUCTION_HEAD);
    assert.equal(result.productionHeadAfter, PRODUCTION_HEAD);
    assert.equal(result.containerCount, 11);
    assert.equal(result.databaseMutationAttempted, false);
    assert.equal(result.dockerReadAccessMode, ACCEPTANCE_DOCKER_READ_ACCESS_MODE);
    assert.match(result.evidenceSha256, /^[a-f0-9]{64}$/);
    const persisted = JSON.parse(await readFile(request.resultPath, "utf8"));
    assert.deepEqual(persisted, result);
    assert.deepEqual([...new Set(calls.map(([command]) => command))].sort(),
      ["curl", "docker", "git", "ss", "systemctl"]);
    const forbiddenTokens = new Set(["checkout", "compose", "migration", "psql", "rm"]);
    assert.equal(calls.some((call) => call.some((token) => forbiddenTokens.has(token))), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("acceptance identity gate rejects a production container drift", () => {
  const policy = {
    dispatchStateRoot: "/state",
    expectedContainerCount: 11,
    expectedRedisContainer: "chuan-market-radar-redis-1",
    expectedTimerUnit: "market-radar-production-dispatch.timer",
    productionWorktree: "/production",
    stagingRoot: "/staging",
  };
  const now = new Date("2026-07-23T04:00:00.000Z");
  const request = fixtureRequest(policy, now);
  const identity = {
    containerIds: [...request.expectedContainerIds],
    listenerSha256: "e".repeat(64),
    productionHead: request.expectedProductionHead,
    redis: "PONG",
    timerActive: "active",
    timerEnabled: "enabled",
    worktreeClean: true,
  };
  identity.containerIds[0] = "f".repeat(64);
  identity.containerIds.sort();
  assert.throws(
    () => assertAcceptanceIdentity(identity, request, "before"),
    /acceptance_before_container_identity_mismatch/,
  );
});

test("bundle builder emits a reproducible secret-free package from the exact commit", async () => {
  const root = await mkdtemp(join(tmpdir(), "dispatch-acceptance-bundle-test-"));
  const repository = join(root, "repo");
  const out1 = join(root, "out-1");
  const out2 = join(root, "out-2");
  try {
    await execFileAsync("git", ["init", repository]);
    await execFileAsync("git", ["-C", repository, "config", "user.name", "Acceptance Test"]);
    await execFileAsync("git", ["-C", repository, "config", "user.email", "acceptance@example.invalid"]);
    for (const relative of [ACCEPTANCE_ENTRYPOINT, ACCEPTANCE_RUNNER]) {
      const bytes = await readFile(new URL(relative === ACCEPTANCE_ENTRYPOINT
        ? "../fixed-channel-acceptance-entrypoint.sh"
        : "./production-dispatch-acceptance.mjs", import.meta.url));
      const path = join(repository, relative);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    }
    await execFileAsync("git", ["-C", repository, "add", "."]);
    await execFileAsync("git", ["-C", repository, "commit", "-m", "fixture"]);
    const { stdout } = await execFileAsync("git", ["-C", repository, "rev-parse", "HEAD"]);
    const sourceCommit = stdout.trim();
    const options = {
      dispatchId: "g0-first-signed-20260723t040000z",
      expectedContainerIds: CONTAINER_IDS,
      expectedProductionHead: PRODUCTION_HEAD,
      expiresAt: "2026-07-23T05:00:00.000Z",
      issuedAt: "2026-07-23T04:00:00.000Z",
      revocationEpoch: 0,
      root: repository,
      runnerUnitName: "market-radar-dispatch-accept-first20260723",
      sourceCommit,
      sourceRef: "refs/heads/codex/market-radar-v2-implementation",
    };
    const first = await buildAcceptanceBundle({ ...options, outputDirectory: out1 });
    const second = await buildAcceptanceBundle({ ...options, outputDirectory: out2 });
    assert.equal(first.result.bundleSha256, second.result.bundleSha256);
    assert.equal(first.result.approvalRequestSha256, second.result.approvalRequestSha256);
    assert.equal(first.result.containsSecrets, false);
    assert.deepEqual(await readFile(join(out1, "bundle.tar.gz")), await readFile(join(out2, "bundle.tar.gz")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("entrypoint only invokes the fixed verifier and exact staging cleanup", async () => {
  const source = await readFile(new URL("../fixed-channel-acceptance-entrypoint.sh", import.meta.url), "utf8");
  assert.match(source, /production-dispatch-acceptance\.mjs/u);
  assert.match(source, /PASS_FIXED_DISPATCH_FIRST_SIGNED_ACCEPTANCE/u);
  assert.match(source, /rm -rf -- "\$\{ACTUAL_SOURCE_ROOT\}"/u);
  assert.doesNotMatch(source, /docker compose|git checkout|psql|eval |source \.env|curl .*-X/u);
});
