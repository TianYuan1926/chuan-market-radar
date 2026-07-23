import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  buildLiveSourceConformanceBundle,
} from "./m1-source-conformance-live-bundle.mjs";
import {
  LIVE_SOURCE_CONFORMANCE_ENTRYPOINT,
  LIVE_SOURCE_CONFORMANCE_FAILURE_RESULT_SCHEMA,
  LIVE_SOURCE_CONFORMANCE_PACKAGE_ID,
  LIVE_SOURCE_CONFORMANCE_RUNNER,
  LIVE_SOURCE_CONFORMANCE_RUNTIME_ENTRY,
  LIVE_SOURCE_CONFORMANCE_SUCCESS_MARKER,
  LiveSourceConformanceError,
  canonicalJson,
  liveReadOnlyCommandInvocation,
  readExactCoinGlassCredential,
  runLiveSourceConformance,
  sha256,
} from "./m1-source-conformance-live-runner.mjs";

const execFileAsync = promisify(execFile);
const SOURCE_COMMIT = "a".repeat(40);
const SOURCE_TREE = "b".repeat(40);
const PRODUCTION_HEAD = "c".repeat(40);
const ISSUED_AT = "2026-07-23T14:00:00.000Z";
const EXPIRES_AT = "2026-07-23T15:30:00.000Z";
const DISPATCH_ID = "m1-1b0-runner-rehearsal-20260723t220000z";
const CONTAINER_IDS = Object.freeze(
  Array.from(
    { length: 11 },
    (_, index) => (index + 1).toString(16).padStart(64, "0"),
  ),
);
const COINGLASS_KEY = "K".repeat(40);

function policy(root) {
  const productionWorktree = join(root, "production");
  const dispatchStateRoot = join(root, "state");
  return {
    credentialEnvKey: "COINGLASS_API_KEY",
    credentialFile: join(productionWorktree, ".env.production"),
    dispatchStateRoot,
    evidenceRoot: join(dispatchStateRoot, "evidence/m1-source-conformance"),
    expectedTimerUnit: "market-radar-production-dispatch.timer",
    productionWorktree,
    stagingRoot: join(root, "staging"),
    stagingPrefix: "m1-1b0-source-conformance-",
  };
}

function approval(dispatchId = DISPATCH_ID) {
  return {
    dispatchId,
    expectedContainerIds: CONTAINER_IDS,
    expectedProductionHead: PRODUCTION_HEAD,
    expiresAt: EXPIRES_AT,
    issuedAt: ISSUED_AT,
    revocationEpoch: 1,
    runnerUnitName: "market-radar-m1-1b0-rehearsal01",
    sourceRef: "refs/heads/codex/market-radar-v2-implementation",
  };
}

function dispatchEnvelope(request) {
  return {
    approvalRequestSha256: sha256(canonicalJson(request)),
    automaticRollbackRequired: true,
    bundleSha256: request.transportBundleSha256,
    dispatchId: request.dispatchId,
    entrypointPath: LIVE_SOURCE_CONFORMANCE_ENTRYPOINT,
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
    runtimeMaxSeconds: 100,
    sessionIndependentExecutionRequired: true,
    sourceRef: request.sourceRef,
    stagingDirectory: request.stagingDirectory,
    targetCommit: request.sourceCommit,
    transportContainsSecrets: false,
    transportMethod: "signed_git_bundle",
  };
}

async function buildStaging(root, dispatchId = DISPATCH_ID) {
  const currentPolicy = policy(root);
  await mkdir(currentPolicy.productionWorktree, { recursive: true, mode: 0o700 });
  await mkdir(currentPolicy.stagingRoot, { recursive: true, mode: 0o700 });
  await mkdir(currentPolicy.dispatchStateRoot, { recursive: true, mode: 0o700 });
  await writeFile(
    currentPolicy.credentialFile,
    `COINGLASS_API_KEY=${COINGLASS_KEY}\nOTHER=value\n`,
    { mode: 0o600 },
  );
  const built = await buildLiveSourceConformanceBundle({
    approval: approval(dispatchId),
    outputDirectory: join(root, "package"),
    policy: currentPolicy,
    root: process.cwd(),
    sourceCommit: SOURCE_COMMIT,
    sourceTree: SOURCE_TREE,
    verifySourceBinding: false,
  });
  await mkdir(built.request.stagingDirectory, { mode: 0o700 });
  await execFileAsync("tar", [
    "-xzf",
    join(root, "package/bundle.tar.gz"),
    "-C",
    built.request.stagingDirectory,
  ]);
  const requestPath = join(built.request.stagingDirectory, "approval-request.json");
  await copyFile(join(root, "package/approval-request.json"), requestPath);
  await chmod(requestPath, 0o600);
  await writeFile(
    join(built.request.stagingDirectory, ".transport-bundle.sha256"),
    `${built.request.transportBundleSha256}\n`,
    { mode: 0o600 },
  );
  await writeFile(
    join(built.request.stagingDirectory, ".dispatch.json"),
    canonicalJson(dispatchEnvelope(built.request)),
    { mode: 0o600 },
  );
  await writeFile(
    join(built.request.stagingDirectory, ".dispatch.sig"),
    "test-signature-already-verified-by-fixed-channel\n",
    { mode: 0o600 },
  );
  return {
    bundleMarkerPath: join(
      built.request.stagingDirectory,
      ".transport-bundle.sha256",
    ),
    policy: currentPolicy,
    request: built.request,
    requestPath,
    staging: built.request.stagingDirectory,
  };
}

function validArtifact(staging, request) {
  const require = createRequire(import.meta.url);
  const runtime = require(join(staging, LIVE_SOURCE_CONFORMANCE_RUNTIME_ENTRY));
  const contract = require(join(
    staging,
    "runtime/v2/modules/source-conformance/source-conformance-contract.js",
  ));
  const timestamp = "2026-07-23T14:00:01.000Z";
  const probes = runtime.M1_EXACT_SOURCE_PROBE_DEFINITIONS.map((definition) =>
    contract.M1SourceConformanceProbeObservationSchema.parse({
      absoluteClockSkewMs:
        definition.capabilityId === "SERVER_TIME" ? 0 : null,
      attemptStartedAt: timestamp,
      capabilityId: definition.capabilityId,
      credentialDisposition: definition.requiresReadOnlyApiKey
        ? "READ_ONLY_KEY_USED_NOT_RETAINED"
        : "PUBLIC_NO_CREDENTIAL",
      definitionDigest: `sha256:${"d".repeat(64)}`,
      evidenceClass: "LIVE_READ_ONLY",
      failure: null,
      gate: definition.gate,
      httpStatus: 200,
      latencyMs: 0,
      observedRecordCount: 1,
      outcome: "PASS",
      paginationStatus: definition.paginationExpectation === "MUST_TERMINATE"
        ? "COMPLETE"
        : definition.paginationExpectation === "BOUNDED_HEAD_WINDOW"
          ? "BOUNDED_COMPLETE"
        : "NOT_APPLICABLE",
      probeId: definition.probeId,
      providerServerTime:
        definition.capabilityId === "SERVER_TIME" ? timestamp : null,
      rawBodyRetained: false,
      reasonCodes: [],
      receivedAt: timestamp,
      recordKeys: ["fixture"],
      responseBodyDigest: `sha256:${"e".repeat(64)}`,
      responseBytes: 1,
      secretMaterialPresent: false,
      sourceId: definition.sourceId,
      topLevelKeys: ["data"],
    })
  );
  return contract.buildM1SourceConformanceArtifact({
    evidenceClass: "LIVE_READ_ONLY",
    generatedAt: timestamp,
    networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
    probePlanDigest: request.expectedProbePlanDigest,
    probes,
    registryDigest: request.expectedRegistryDigest,
    releaseId: request.sourceCommit,
    sourceCutoff: timestamp,
  });
}

function blockedArtifact(staging, request) {
  const require = createRequire(import.meta.url);
  const contract = require(join(
    staging,
    "runtime/v2/modules/source-conformance/source-conformance-contract.js",
  ));
  const valid = validArtifact(staging, request);
  const probes = valid.probes.map((probe, index) =>
    index === 0
      ? contract.M1SourceConformanceProbeObservationSchema.parse({
        ...probe,
        failure: "TRANSPORT_FAILURE_UNAVAILABLE",
        httpStatus: null,
        observedRecordCount: null,
        outcome: "FAIL",
        paginationStatus: "INCOMPLETE",
        reasonCodes: ["transport_failure_unavailable"],
        responseBodyDigest: null,
        responseBytes: null,
      })
      : probe
  );
  return contract.buildM1SourceConformanceArtifact({
    evidenceClass: valid.evidenceClass,
    generatedAt: valid.generatedAt,
    networkEnvironment: valid.networkEnvironment,
    probePlanDigest: valid.probePlanDigest,
    probes,
    registryDigest: valid.registryDigest,
    releaseId: valid.releaseId,
    sourceCutoff: valid.sourceCutoff,
  });
}

function commandRunner(calls) {
  return async (command, args) => {
    calls.push({ args, command });
    if (command === "git") {
      return args.includes("rev-parse") ? PRODUCTION_HEAD : "";
    }
    if (command === "docker") return CONTAINER_IDS.join("\n");
    if (command === "ss") return "LISTEN 0 4096 127.0.0.1:3000 0.0.0.0:*";
    if (command === "systemctl") {
      return args[0] === "is-enabled" ? "enabled" : "active";
    }
    if (command === "curl") {
      return JSON.stringify({
        health: {
          level: "ready",
          persistence: { databaseStatus: "ready" },
          scan: { freshness: "fresh", status: "ready" },
        },
        ok: true,
      });
    }
    throw new Error("unexpected command");
  };
}

test("runs an isolated live rehearsal, persists sanitized evidence and preserves production identity", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "m1-1b0-runner-test-")),
  );
  try {
    const staged = await buildStaging(root);
    const artifact = validArtifact(staged.staging, staged.request);
    const calls = [];
    let observedCredential = null;
    const result = await runLiveSourceConformance({
      bundleMarkerPath: staged.bundleMarkerPath,
      commandRunner: commandRunner(calls),
      credentialReader: async () => COINGLASS_KEY,
      now: new Date(ISSUED_AT),
      policy: staged.policy,
      probeExecutor: async ({ credential }) => {
        observedCredential = credential;
        return canonicalJson(artifact);
      },
      requestPath: staged.requestPath,
    });

    assert.equal(observedCredential, COINGLASS_KEY);
    assert.equal(result.status, "PASS_TENCENT_LIVE_READ_ONLY_SOURCE_CONFORMANCE");
    assert.equal(result.productionChanged, false);
    assert.equal(result.secretMaterialPresent, false);
    assert.equal(result.probeCounts.passed, 15);
    assert.equal(calls.length, 14);
    const persistedArtifact = await readFile(staged.request.artifactPath, "utf8");
    const persistedResult = await readFile(staged.request.resultPath, "utf8");
    assert.doesNotMatch(persistedArtifact, new RegExp(COINGLASS_KEY, "u"));
    assert.doesNotMatch(persistedResult, new RegExp(COINGLASS_KEY, "u"));
    assert.equal(JSON.parse(persistedArtifact).evidenceClass, "LIVE_READ_ONLY");
    assert.equal(
      JSON.parse(persistedResult).status,
      "PASS_TENCENT_LIVE_READ_ONLY_SOURCE_CONFORMANCE",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("persists a blocked live artifact without emitting the success marker path", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "m1-1b0-blocked-test-")),
  );
  try {
    const dispatchId = "m1-1b0-blocked-rehearsal-20260723t220000z";
    const staged = await buildStaging(root, dispatchId);
    const artifact = blockedArtifact(staged.staging, staged.request);
    await assert.rejects(
      () => runLiveSourceConformance({
        bundleMarkerPath: staged.bundleMarkerPath,
        commandRunner: commandRunner([]),
        credentialReader: async () => COINGLASS_KEY,
        now: new Date(ISSUED_AT),
        policy: staged.policy,
        probeExecutor: async () => canonicalJson(artifact),
        requestPath: staged.requestPath,
      }),
      (error) =>
        error instanceof LiveSourceConformanceError &&
        error.reason === "live_source_conformance_gates_blocked",
    );
    const persistedArtifact = JSON.parse(
      await readFile(staged.request.artifactPath, "utf8"),
    );
    const persistedResult = JSON.parse(
      await readFile(staged.request.resultPath, "utf8"),
    );
    assert.equal(persistedArtifact.failCount, 1);
    assert.equal(
      persistedResult.status,
      "BLOCKED_TENCENT_LIVE_READ_ONLY_SOURCE_CONFORMANCE",
    );
    assert.equal(persistedResult.productionChanged, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("persists a sanitized pre-artifact failure result for probe process failures", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "m1-1b0-probe-failure-test-")),
  );
  try {
    const dispatchId = "m1-1b0-probe-failure-20260723t220000z";
    const staged = await buildStaging(root, dispatchId);
    await assert.rejects(
      () => runLiveSourceConformance({
        bundleMarkerPath: staged.bundleMarkerPath,
        commandRunner: commandRunner([]),
        credentialReader: async () => COINGLASS_KEY,
        now: new Date(ISSUED_AT),
        policy: staged.policy,
        probeExecutor: async () => {
          throw new LiveSourceConformanceError("live_probe_process_failed");
        },
        requestPath: staged.requestPath,
      }),
      (error) =>
        error instanceof LiveSourceConformanceError &&
        error.reason === "live_probe_process_failed",
    );
    const persistedResultRaw = await readFile(
      staged.request.resultPath,
      "utf8",
    );
    const persistedResult = JSON.parse(persistedResultRaw);

    assert.equal(
      persistedResult.schemaVersion,
      LIVE_SOURCE_CONFORMANCE_FAILURE_RESULT_SCHEMA,
    );
    assert.equal(persistedResult.failurePhase, "PROBE_EXECUTION");
    assert.equal(
      persistedResult.failureReason,
      "live_probe_process_failed",
    );
    assert.equal(persistedResult.artifactWritten, false);
    assert.equal(persistedResult.productionMutationAttempted, false);
    assert.equal(persistedResult.productionIdentityUnchangedVerified, false);
    assert.equal(persistedResult.secretMaterialPresent, false);
    assert.doesNotMatch(persistedResultRaw, new RegExp(COINGLASS_KEY, "u"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reads exactly one private CoinGlass key and rejects weak file boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "m1-1b0-credential-test-"));
  const path = join(root, ".env.production");
  try {
    await writeFile(path, `OTHER=value\nCOINGLASS_API_KEY=${COINGLASS_KEY}\n`, {
      mode: 0o600,
    });
    assert.equal(await readExactCoinGlassCredential(path), COINGLASS_KEY);

    await chmod(path, 0o644);
    await assert.rejects(() => readExactCoinGlassCredential(path));
    await chmod(path, 0o600);
    await writeFile(
      path,
      `COINGLASS_API_KEY=${COINGLASS_KEY}\nCOINGLASS_API_KEY=${COINGLASS_KEY}\n`,
      { mode: 0o600 },
    );
    await assert.rejects(() => readExactCoinGlassCredential(path));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("production command surface is exact and read-only", () => {
  const request = {
    expectedTimerUnit: "market-radar-production-dispatch.timer",
    productionWorktree: "/home/ubuntu/apps/chuan-market-radar",
  };
  assert.deepEqual(
    liveReadOnlyCommandInvocation(
      "git",
      ["-C", request.productionWorktree, "rev-parse", "HEAD"],
      request,
    ),
    {
      args: ["-C", request.productionWorktree, "rev-parse", "HEAD"],
      executable: "/usr/bin/git",
    },
  );
  assert.throws(
    () => liveReadOnlyCommandInvocation(
      "git",
      ["-C", request.productionWorktree, "checkout", "main"],
      request,
    ),
    LiveSourceConformanceError,
  );
  assert.throws(
    () => liveReadOnlyCommandInvocation(
      "docker",
      ["compose", "up", "-d"],
      request,
    ),
    LiveSourceConformanceError,
  );
  assert.throws(
    () => liveReadOnlyCommandInvocation("bash", ["-c", "true"], request),
    LiveSourceConformanceError,
  );
});

test("entrypoint exposes only the fixed runner, success marker and exact staging cleanup", async () => {
  const source = await readFile(LIVE_SOURCE_CONFORMANCE_ENTRYPOINT, "utf8");
  assert.match(source, /set -euo pipefail/u);
  assert.match(source, /m1-1b0-source-conformance-/u);
  assert.match(source, new RegExp(LIVE_SOURCE_CONFORMANCE_RUNNER, "u"));
  assert.match(source, new RegExp(LIVE_SOURCE_CONFORMANCE_SUCCESS_MARKER, "u"));
  assert.doesNotMatch(source, /(?:curl|docker|git|psql|redis-cli|source\s+.*env)/u);
  assert.equal((source.match(/rm -rf --/gu) ?? []).length, 1);
});

test("runner source never prints, persists or transports the credential value", async () => {
  const source = await readFile(LIVE_SOURCE_CONFORMANCE_RUNNER, "utf8");
  assert.doesNotMatch(
    source,
    /(?:console\.(?:log|error)|process\.(?:stdout|stderr)\.write)\([^)]*credential/iu,
  );
  assert.doesNotMatch(source, /writeFile\([^)]*COINGLASS/iu);
  assert.match(source, /artifact_contains_credential/u);
  assert.match(source, /result_contains_credential/u);
  assert.match(source, /rawBodyRetained === false/u);
  assert.match(source, /productionChanged === false/u);
  assert.equal(LIVE_SOURCE_CONFORMANCE_PACKAGE_ID,
    "V2-M1-1B0-TENCENT-LIVE-SOURCE-CONFORMANCE");
});
