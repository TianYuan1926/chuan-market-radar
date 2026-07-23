import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  copyFile,
  lstat,
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
  buildLiveRuntimeAdapterBundle,
} from "./m1-runtime-adapter-live-bundle.mjs";
import {
  LIVE_RUNTIME_ADAPTER_ENTRYPOINT,
  LIVE_RUNTIME_ADAPTER_FAILURE_RESULT_SCHEMA,
  LIVE_RUNTIME_ADAPTER_PACKAGE_ID,
  LiveRuntimeAdapterError,
  canonicalJson,
  runLiveRuntimeAdapter,
  sha256,
} from "./m1-runtime-adapter-live-runner.mjs";
import {
  LiveSourceConformanceError,
} from "./m1-source-conformance-live-runner.mjs";

const execFileAsync = promisify(execFile);
const SOURCE_COMMIT = "a".repeat(40);
const SOURCE_TREE = "b".repeat(40);
const PRODUCTION_HEAD = "c".repeat(40);
const CONFORMANCE_RELEASE = "e".repeat(40);
const CONFORMANCE_HASH = `sha256:${"d".repeat(64)}`;
const CONFORMANCE_ID = "source-conformance:test-r3";
const ISSUED_AT = "2026-07-24T00:00:00.000Z";
const EXPIRES_AT = "2026-07-24T01:30:00.000Z";
const CONTAINER_IDS = Object.freeze(
  Array.from(
    { length: 3 },
    (_, index) => (index + 1).toString(16).padStart(64, "0"),
  ),
);
const COINGLASS_KEY = "K".repeat(40);
const ROUTE_PROBE_IDS = Object.freeze([
  "BINANCE_DERIVATIVE_CATALOG",
  "BINANCE_SERVER_TIME",
  "BITGET_DERIVATIVE_CATALOG",
  "BITGET_LISTING_ANNOUNCEMENT",
  "BITGET_SERVER_TIME",
  "BITGET_SPOT_CATALOG",
  "BYBIT_DERIVATIVE_CATALOG",
  "BYBIT_LISTING_ANNOUNCEMENT",
  "BYBIT_SERVER_TIME",
  "BYBIT_SPOT_CATALOG",
  "COINGLASS_SUPPORTED_COINS",
  "OKX_DERIVATIVE_CATALOG",
  "OKX_SERVER_TIME",
  "OKX_SPOT_CATALOG",
]);

function policy(root) {
  const state = join(root, "state");
  return {
    checkpointRoot: join(state, "evidence/m1-runtime-adapter/checkpoints"),
    conformanceEvidenceRoot:
      join(state, "evidence/m1-source-conformance"),
    credentialEnvKey: "COINGLASS_API_KEY",
    credentialFile: join(root, "production/.env.production"),
    dispatchStateRoot: state,
    evidenceRoot: join(state, "evidence/m1-runtime-adapter"),
    expectedTimerUnit: "market-radar-production-dispatch.timer",
    productionWorktree: join(root, "production"),
    stagingRoot: join(root, "staging"),
    stagingPrefix: "m1-4b-runtime-adapter-",
  };
}

function dispatchEnvelope(request) {
  return {
    approvalRequestSha256: sha256(canonicalJson(request)),
    automaticRollbackRequired: true,
    bundleSha256: request.transportBundleSha256,
    dispatchId: request.dispatchId,
    entrypointPath: LIVE_RUNTIME_ADAPTER_ENTRYPOINT,
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
    runtimeMaxSeconds: request.runtimeDeadlineSeconds + 30,
    sessionIndependentExecutionRequired: true,
    sourceRef: request.sourceRef,
    stagingDirectory: request.stagingDirectory,
    targetCommit: request.sourceCommit,
    transportContainsSecrets: false,
    transportMethod: "signed_git_bundle",
  };
}

async function buildStaging(root, suffix, { priorCheckpoints } = {}) {
  const currentPolicy = policy(root);
  const dispatchId = `m1-4b-runtime-runner-${suffix}-20260724`;
  await mkdir(currentPolicy.productionWorktree, {
    recursive: true,
    mode: 0o700,
  });
  await mkdir(currentPolicy.stagingRoot, { recursive: true, mode: 0o700 });
  await mkdir(currentPolicy.conformanceEvidenceRoot, {
    recursive: true,
    mode: 0o700,
  });
  const conformancePath = join(
    currentPolicy.conformanceEvidenceRoot,
    "r3.artifact.json",
  );
  const built = await buildLiveRuntimeAdapterBundle({
    approval: {
      conformanceArtifact: {
        artifactId: CONFORMANCE_ID,
        contentHash: CONFORMANCE_HASH,
        path: conformancePath,
        releaseId: CONFORMANCE_RELEASE,
      },
      dispatchId,
      expectedContainerIds: CONTAINER_IDS,
      expectedProductionHead: PRODUCTION_HEAD,
      expiresAt: EXPIRES_AT,
      issuedAt: ISSUED_AT,
      ...(priorCheckpoints === undefined ? {} : { priorCheckpoints }),
      revocationEpoch: 1,
      runnerUnitName: `market-radar-m1-4b-${suffix}test01`,
      sourceRef: "refs/heads/codex/m1-4b-tencent-runtime",
    },
    outputDirectory: join(root, `package-${suffix}`),
    policy: currentPolicy,
    root: process.cwd(),
    sourceCommit: SOURCE_COMMIT,
    sourceTree: SOURCE_TREE,
    verifySourceBinding: false,
  });
  await writeFile(
    conformancePath,
    canonicalJson({
      artifactId: CONFORMANCE_ID,
      contentHash: CONFORMANCE_HASH,
      evidenceClass: "LIVE_READ_ONLY",
      failCount: 0,
      networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
      notRunCount: 0,
      passCount: 15,
      probePlanDigest: built.request.expectedProbePlanDigest,
      registryDigest: built.request.expectedRegistryDigest,
      releaseId: CONFORMANCE_RELEASE,
    }),
    { mode: 0o600 },
  );
  await mkdir(built.request.stagingDirectory, { mode: 0o700 });
  await execFileAsync("tar", [
    "-xzf",
    join(root, `package-${suffix}/bundle.tar.gz`),
    "-C",
    built.request.stagingDirectory,
  ]);
  const requestPath = join(
    built.request.stagingDirectory,
    "approval-request.json",
  );
  await copyFile(
    join(root, `package-${suffix}/approval-request.json`),
    requestPath,
  );
  await chmod(requestPath, 0o600);
  const bundleMarkerPath = join(
    built.request.stagingDirectory,
    ".transport-bundle.sha256",
  );
  await writeFile(
    bundleMarkerPath,
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
    bundleMarkerPath,
    policy: currentPolicy,
    request: built.request,
    requestPath,
  };
}

function checkpoint(sourceId) {
  return {
    checkpointId:
      `listing-history-checkpoint:${sourceId}:${sourceId.toLowerCase()}`,
    contentHash:
      `sha256:${sourceId === "BYBIT_DERIVATIVES" ? "5" : "6"}`.padEnd(
        71,
        sourceId === "BYBIT_DERIVATIVES" ? "5" : "6",
      ),
    productionChanged: false,
    releaseId: SOURCE_COMMIT,
    sourceId,
  };
}

function artifact(request) {
  return {
    acceptanceAxes: [
      { axisId: "BITGET_VENUE", routeGateStatus: "PASS", acceptanceGranted: false },
      { axisId: "LISTING_LIFECYCLE", routeGateStatus: "PASS", acceptanceGranted: false },
      { axisId: "EQUITY_ASSET_DOMAIN", routeGateStatus: "PASS", acceptanceGranted: false },
      { axisId: "DATA_MAXIMIZATION", routeGateStatus: "PASS", acceptanceGranted: false },
    ],
    artifactId: "runtime-adapter-live:test",
    candidateAuthorityGranted: false,
    conformanceArtifactHash: request.conformanceArtifact.contentHash,
    conformanceArtifactId: request.conformanceArtifact.artifactId,
    conformanceReleaseId: request.conformanceArtifact.releaseId,
    contentHash: `sha256:${"7".repeat(64)}`,
    evidenceClass: "LIVE_READ_ONLY",
    executedProbeIds: [...ROUTE_PROBE_IDS],
    factAuthorityGranted: false,
    failedProbeIds: [],
    generatedAt: "2026-07-24T00:01:00.000Z",
    listingCheckpointCommittedCount: 2,
    listingGapCount: 0,
    liveConformantProfileCount: 15,
    networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
    passedProbeIds: [...ROUTE_PROBE_IDS],
    probePlanDigest: request.expectedProbePlanDigest,
    productionChanged: false,
    rawBodyRetained: false,
    readyAuthorityGranted: false,
    registryBlockedProbeIds: ["BINANCE_SPOT_CATALOG"],
    registryBlockedProfileCount: 1,
    registryDigest: request.expectedRegistryDigest,
    requestAttemptCount: 14,
    routeEligibleProfileCount: 14,
    runtimeAuthorityGranted: false,
    runtimeReleaseId: request.sourceCommit,
    secretMaterialPresent: false,
    status: "PASS_BOUNDED_ROUTE_SEGMENT_NO_AUTHORITY",
    strategyAuthorityGranted: false,
  };
}

function bindings(request) {
  const bybit = checkpoint("BYBIT_DERIVATIVES");
  const bitget = checkpoint("BITGET_FUTURES");
  return {
    artifactSchema: { parse: (value) => value },
    blockedProbeIds: ["BINANCE_SPOT_CATALOG"],
    conformanceSchema: { parse: (value) => value },
    extractCheckpoints: () => ({
      BITGET_FUTURES: bitget,
      BYBIT_DERIVATIVES: bybit,
    }),
    listingCheckpointSchema: { parse: (value) => value },
    probePlanDigest: request.expectedProbePlanDigest,
    registryDigest: request.expectedRegistryDigest,
    run: async () => {},
  };
}

function commandRunner({ driftAfter = false } = {}) {
  let dockerCalls = 0;
  return async (command, args) => {
    if (command === "git") {
      return args.includes("rev-parse") ? PRODUCTION_HEAD : "";
    }
    if (command === "docker") {
      dockerCalls += 1;
      return driftAfter && dockerCalls === 2
        ? [...CONTAINER_IDS.slice(0, -1), "f".repeat(64)].sort().join("\n")
        : CONTAINER_IDS.join("\n");
    }
    if (command === "ss") {
      return "LISTEN 0 4096 127.0.0.1:3000 0.0.0.0:*";
    }
    if (command === "systemctl") {
      return args.includes("is-enabled") ? "enabled" : "active";
    }
    if (command === "curl") {
      return JSON.stringify({
        ok: true,
        health: {
          level: "ready",
          persistence: { databaseStatus: "ready" },
          scan: { freshness: "fresh", status: "ready" },
        },
      });
    }
    throw new Error(`unexpected command ${command}`);
  };
}

test("runner persists only sanitized artifact, committed checkpoints, and unchanged-host evidence", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "m1-runtime-runner-test-")),
  );
  try {
    const staged = await buildStaging(root, "pass");
    const expectedArtifact = artifact(staged.request);
    const result = await runLiveRuntimeAdapter({
      bundleMarkerPath: staged.bundleMarkerPath,
      commandRunner: commandRunner(),
      credentialReader: async () => COINGLASS_KEY,
      now: new Date(ISSUED_AT),
      policy: staged.policy,
      requestPath: staged.requestPath,
      runtimeBindingsLoader: () => bindings(staged.request),
      runtimeExecutor: async ({ credential }) => {
        assert.equal(credential, COINGLASS_KEY);
        return canonicalJson(expectedArtifact);
      },
    });

    assert.equal(
      result.status,
      "PASS_TENCENT_RUNTIME_ADAPTER_BOUNDED_SEGMENT",
    );
    assert.equal(result.packageId, LIVE_RUNTIME_ADAPTER_PACKAGE_ID);
    assert.equal(result.profileCounts.passed, 14);
    assert.equal(result.profileCounts.registryBlocked, 1);
    assert.equal(result.productionChanged, false);
    assert.equal(JSON.stringify(result).includes(COINGLASS_KEY), false);
    const writtenArtifact = JSON.parse(
      await readFile(staged.request.artifactPath, "utf8"),
    );
    assert.deepEqual(writtenArtifact, expectedArtifact);
    for (const source of ["BYBIT_DERIVATIVES", "BITGET_FUTURES"]) {
      const path = staged.request.checkpointPaths[source];
      const written = JSON.parse(await readFile(path, "utf8"));
      assert.equal(written.sourceId, source);
      assert.equal(written.productionChanged, false);
      assert.equal((await lstat(path)).mode & 0o077, 0);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runner blocks before evidence promotion when production container identity drifts", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "m1-runtime-runner-drift-")),
  );
  try {
    const staged = await buildStaging(root, "drift");
    await assert.rejects(
      () =>
        runLiveRuntimeAdapter({
          bundleMarkerPath: staged.bundleMarkerPath,
          commandRunner: commandRunner({ driftAfter: true }),
          credentialReader: async () => COINGLASS_KEY,
          now: new Date(ISSUED_AT),
          policy: staged.policy,
          requestPath: staged.requestPath,
          runtimeBindingsLoader: () => bindings(staged.request),
          runtimeExecutor: async () => canonicalJson(artifact(staged.request)),
        }),
      (error) =>
        error instanceof LiveSourceConformanceError ||
        error instanceof LiveRuntimeAdapterError,
    );
    assert.equal(
      await lstat(staged.request.artifactPath).catch(() => null),
      null,
    );
    for (const path of Object.values(staged.request.checkpointPaths)) {
      assert.equal(await lstat(path).catch(() => null), null);
    }
    const failure = JSON.parse(
      await readFile(staged.request.resultPath, "utf8"),
    );
    assert.equal(
      failure.schemaVersion,
      LIVE_RUNTIME_ADAPTER_FAILURE_RESULT_SCHEMA,
    );
    assert.equal(failure.failurePhase, "PRODUCTION_IDENTITY_AFTER");
    assert.equal(failure.productionMutationAttempted, false);
    assert.equal(failure.status, "BLOCKED_TENCENT_RUNTIME_ADAPTER_EXECUTION_FAILURE");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a blocked bounded segment persists diagnostics but never promotes a checkpoint", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "m1-runtime-runner-blocked-")),
  );
  try {
    const staged = await buildStaging(root, "blocked");
    const blockedArtifact = {
      ...artifact(staged.request),
      acceptanceAxes: artifact(staged.request).acceptanceAxes.map((axis) =>
        axis.axisId === "LISTING_LIFECYCLE" ||
          axis.axisId === "DATA_MAXIMIZATION"
          ? { ...axis, routeGateStatus: "BLOCKED" }
          : axis
      ),
      listingGapCount: 1,
      status: "BLOCKED_BOUNDED_ROUTE_SEGMENT_NO_AUTHORITY",
    };
    await assert.rejects(
      () =>
        runLiveRuntimeAdapter({
          bundleMarkerPath: staged.bundleMarkerPath,
          commandRunner: commandRunner(),
          credentialReader: async () => COINGLASS_KEY,
          now: new Date(ISSUED_AT),
          policy: staged.policy,
          requestPath: staged.requestPath,
          runtimeBindingsLoader: () => bindings(staged.request),
          runtimeExecutor: async () => canonicalJson(blockedArtifact),
        }),
      (error) =>
        error instanceof LiveRuntimeAdapterError &&
        error.reason === "runtime_adapter_gates_blocked",
    );
    assert.deepEqual(
      JSON.parse(await readFile(staged.request.artifactPath, "utf8")),
      blockedArtifact,
    );
    for (const path of Object.values(staged.request.checkpointPaths)) {
      assert.equal(await lstat(path).catch(() => null), null);
    }
    const result = JSON.parse(
      await readFile(staged.request.resultPath, "utf8"),
    );
    assert.equal(
      result.status,
      "BLOCKED_TENCENT_RUNTIME_ADAPTER_BOUNDED_SEGMENT",
    );
    assert.equal(result.checkpoints.BYBIT_DERIVATIVES.written, false);
    assert.equal(result.checkpoints.BITGET_FUTURES.written, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a prior checkpoint is reusable only through its exact bound PASS result", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "m1-runtime-runner-prior-")),
  );
  try {
    const seed = await buildStaging(root, "seed");
    await runLiveRuntimeAdapter({
      bundleMarkerPath: seed.bundleMarkerPath,
      commandRunner: commandRunner(),
      credentialReader: async () => COINGLASS_KEY,
      now: new Date(ISSUED_AT),
      policy: seed.policy,
      requestPath: seed.requestPath,
      runtimeBindingsLoader: () => bindings(seed.request),
      runtimeExecutor: async () => canonicalJson(artifact(seed.request)),
    });
    const seedResultRaw = await readFile(seed.request.resultPath, "utf8");
    const priorCheckpoints = {};
    for (const source of ["BYBIT_DERIVATIVES", "BITGET_FUTURES"]) {
      const prior = JSON.parse(
        await readFile(seed.request.checkpointPaths[source], "utf8"),
      );
      priorCheckpoints[source] = {
        checkpointId: prior.checkpointId,
        contentHash: prior.contentHash,
        path: seed.request.checkpointPaths[source],
        resultPath: seed.request.resultPath,
        resultSha256: sha256(seedResultRaw),
      };
    }
    const resume = await buildStaging(root, "resume", { priorCheckpoints });
    const resumed = await runLiveRuntimeAdapter({
      bundleMarkerPath: resume.bundleMarkerPath,
      commandRunner: commandRunner(),
      credentialReader: async () => COINGLASS_KEY,
      now: new Date(ISSUED_AT),
      policy: resume.policy,
      requestPath: resume.requestPath,
      runtimeBindingsLoader: () => bindings(resume.request),
      runtimeExecutor: async () => canonicalJson(artifact(resume.request)),
    });
    assert.equal(
      resumed.status,
      "PASS_TENCENT_RUNTIME_ADAPTER_BOUNDED_SEGMENT",
    );

    const blockedSeedResult = {
      ...JSON.parse(seedResultRaw),
      status: "BLOCKED_TENCENT_RUNTIME_ADAPTER_BOUNDED_SEGMENT",
    };
    await writeFile(
      seed.request.resultPath,
      canonicalJson(blockedSeedResult),
      { mode: 0o600 },
    );
    const blockedResultRaw = await readFile(seed.request.resultPath, "utf8");
    const blockedPrior = Object.fromEntries(
      Object.entries(priorCheckpoints).map(([source, prior]) => [
        source,
        { ...prior, resultSha256: sha256(blockedResultRaw) },
      ]),
    );
    const rejected = await buildStaging(root, "reject", {
      priorCheckpoints: blockedPrior,
    });
    let productionReadAttempted = false;
    await assert.rejects(
      () =>
        runLiveRuntimeAdapter({
          bundleMarkerPath: rejected.bundleMarkerPath,
          commandRunner: async () => {
            productionReadAttempted = true;
            throw new Error("production identity must not be read");
          },
          credentialReader: async () => COINGLASS_KEY,
          now: new Date(ISSUED_AT),
          policy: rejected.policy,
          requestPath: rejected.requestPath,
          runtimeBindingsLoader: () => bindings(rejected.request),
          runtimeExecutor: async () => canonicalJson(artifact(rejected.request)),
        }),
      (error) =>
        error instanceof LiveRuntimeAdapterError &&
        error.reason === "runtime_prior_checkpoint_binding_mismatch",
    );
    assert.equal(productionReadAttempted, false);
    for (const path of Object.values(rejected.request.checkpointPaths)) {
      assert.equal(await lstat(path).catch(() => null), null);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
