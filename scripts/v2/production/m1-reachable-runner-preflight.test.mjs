import assert from "node:assert/strict";
import test from "node:test";
import {
  B1A_BRANCH,
  B1A_BUILDX_IMAGE,
  B1A_NODE_BASE_IMAGE,
  B1A_POSTGRES_IMAGE,
  B1A_REPOSITORY,
  B1A_TENCENT_RUNNER_PROVIDER,
  buildReachableRunnerEvidence,
  classifyTencentHostSafetyValidationError,
  stableDigest,
  validateTencentHostSafety,
  verifyReachableRunnerEvidence,
} from "./m1-reachable-runner-preflight.mjs";

const SOURCE_COMMIT = "a".repeat(40);
const COLLECTOR_IMAGE = `market-radar-v2-m1-collector:b1a-${SOURCE_COMMIT}`;
const STORAGE_NETWORK = "v2-m1-b1a-storage-123";
const EGRESS_NETWORK = "v2-m1-b1a-egress-123";

function ratio(count) {
  return { denominator: count, numerator: count, ratio: 1 };
}

function venueCoverage(venue, observed = 20) {
  return {
    accountedCount: 20,
    carriedForwardCount: observed === null ? 20 : 0,
    collectedCount: 12,
    collectionCoverage: ratio(12),
    eligibleCount: 12,
    freshCount: 12,
    freshCoverage: ratio(12),
    providerFailures: [],
    providerObservedCount: observed,
    venue,
  };
}

function coverage(observed = 60) {
  return {
    accountedCount: 60,
    carriedForwardCount: observed === null ? 60 : 0,
    collectedCount: 36,
    collectionCoverage: ratio(36),
    eligibleCount: 36,
    freshCount: 36,
    freshCoverage: ratio(36),
    providerObservedCount: observed,
    venues: [
      venueCoverage("BINANCE_FUTURES", observed === null ? null : 20),
      venueCoverage("OKX_SWAP", observed === null ? null : 20),
      venueCoverage("BYBIT_LINEAR_PERPETUAL", observed === null ? null : 20),
    ],
  };
}

function liveTap() {
  const runtime = {
    authorityMode: "NO_AUTHORITY",
    automaticTradingAllowed: false,
    cycles: [
      {
        coverage: coverage(),
        operationalReadiness: "READY",
        providerFailures: [],
        reasons: [],
        state: "READY",
        trigger: "STARTUP_FULL",
      },
      {
        coverage: coverage(null),
        operationalReadiness: "READY",
        providerFailures: [],
        reasons: [],
        state: "READY",
        trigger: "INCREMENTAL_TICKER",
      },
    ],
    releaseId: `m1-5-live:${SOURCE_COMMIT.slice(0, 12)}`,
    status: "COMPLETED",
  };
  return [
    "TAP version 13",
    `# ${JSON.stringify(runtime)}`,
    '# {"sloConclusion":"INSUFFICIENT_EVIDENCE"}',
    "ok 1 - collects two live public no-authority cycles",
    "# tests 1",
    "# pass 1",
    "# fail 0",
    "# skipped 0",
    "",
  ].join("\n");
}

function imageInspect({ idCharacter, labels = {}, user = "" }) {
  return [{
    Architecture: "amd64",
    Config: {
      Entrypoint: user === "node"
        ? ["node", ".tmp/market-tests/v2/entrypoints/m1-collector-worker.js"]
        : null,
      Env: user === "node"
        ? [
          "NODE_ENV=production",
          "NODE_OPTIONS=--disable-proto=throw --unhandled-rejections=strict",
        ]
        : [],
      Labels: labels,
      User: user,
    },
    Id: `sha256:${idCharacter.repeat(64)}`,
    Os: "linux",
    RepoDigests: [],
  }];
}

function fixture() {
  const rehearsalDatabaseUrl = [
    "postgresql:",
    "",
    "postgres@v2-m1-postgres:5432",
    "v2_m1_b1a",
  ].join("/");
  const collectorImageInspect = imageInspect({
    idCharacter: "1",
    labels: { "org.opencontainers.image.revision": SOURCE_COMMIT },
    user: "node",
  });
  const nodeBaseImageInspect = imageInspect({ idCharacter: "2" });
  nodeBaseImageInspect[0].RepoDigests = [
    `node@${B1A_NODE_BASE_IMAGE.split("@")[1]}`,
  ];
  const postgresImageInspect = imageInspect({ idCharacter: "3" });
  postgresImageInspect[0].RepoDigests = [
    `postgres@${B1A_POSTGRES_IMAGE.split("@")[1]}`,
  ];
  const buildxImageInspect = imageInspect({ idCharacter: "6" });
  buildxImageInspect[0].RepoDigests = [
    `docker/buildx-bin@${B1A_BUILDX_IMAGE.split("@")[1]}`,
  ];
  const workerContainerInspect = [{
    Config: {
      Cmd: [
        "--test",
        "--test-reporter=tap",
        ".tmp/market-tests/v2/modules/market-fact/collector/collector-live.integration.test.js",
      ],
      Entrypoint: ["node"],
      Env: [
        "NODE_ENV=production",
        "NODE_OPTIONS=--disable-proto=throw --unhandled-rejections=strict",
        "V2_M1_LIVE_REHEARSAL=1",
        `V2_M1_REHEARSAL_SOURCE_COMMIT=${SOURCE_COMMIT}`,
        `V2_M1_REHEARSAL_DATABASE_URL=${rehearsalDatabaseUrl}`,
      ],
      Image: COLLECTOR_IMAGE,
      User: "1000:1000",
    },
    HostConfig: {
      CapDrop: ["ALL"],
      Memory: 512 * 1024 * 1024,
      NanoCpus: 750_000_000,
      PidsLimit: 128,
      PortBindings: {},
      Privileged: false,
      ReadonlyRootfs: true,
      RestartPolicy: { Name: "no" },
      SecurityOpt: ["no-new-privileges"],
      Tmpfs: { "/tmp": "rw,noexec,nosuid,nodev,size=32m" },
    },
    NetworkSettings: {
      Networks: { [EGRESS_NETWORK]: {}, [STORAGE_NETWORK]: {} },
      Ports: {},
    },
    State: { ExitCode: 0 },
  }];
  const postgresContainerInspect = [{
    Config: {
      Env: [
        "POSTGRES_HOST_AUTH_METHOD=trust",
        "POSTGRES_DB=v2_m1_b1a",
      ],
      Image: B1A_POSTGRES_IMAGE,
    },
    HostConfig: {
      PortBindings: {},
      Privileged: false,
      RestartPolicy: { Name: "no" },
    },
    Mounts: [{ Type: "tmpfs" }],
    NetworkSettings: {
      Networks: { [STORAGE_NETWORK]: {} },
      Ports: { "5432/tcp": null },
    },
    State: { Health: { Status: "healthy" }, Running: true },
  }];
  const runtimeProbe = {
    cwd: "/app",
    gid: 1000,
    paths: {
      "/app/.env": false,
      "/app/.git": false,
      "/app/.tmp/market-tests/v2/entrypoints/m1-collector-worker.js": true,
      "/app/.tmp/market-tests/v2/modules/market-fact/collector/collector-live.integration.test.js": true,
      "/app/deploy": false,
      "/app/scripts": false,
      "/app/src": false,
    },
    uid: 1000,
  };
  return {
    buildxImageInspect,
    collectorImageInspect,
    collectorImageReference: COLLECTOR_IMAGE,
    dockerfileBytes: Buffer.from("FROM locked\n"),
    generatedAt: "2026-07-20T10:00:00.000Z",
    liveTap: liveTap(),
    networkInspect: [
      { Attachable: false, Driver: "bridge", Internal: true, Name: STORAGE_NETWORK },
      { Attachable: false, Driver: "bridge", Internal: false, Name: EGRESS_NETWORK },
    ],
    nodeBaseImageInspect,
    nodeBaseImageReference: B1A_NODE_BASE_IMAGE,
    packageLockBytes: Buffer.from("{\"lockfileVersion\":3}\n"),
    postgresContainerInspect,
    postgresImageInspect,
    postgresImageReference: B1A_POSTGRES_IMAGE,
    ref: `refs/heads/${B1A_BRANCH}`,
    repository: B1A_REPOSITORY,
    runAttempt: "1",
    runId: "123456789",
    runnerArch: "X64",
    runnerOs: "Linux",
    runtimeProbe,
    sourceCommit: SOURCE_COMMIT,
    validatorBytes: Buffer.from("validator\n"),
    workerContainerInspect,
    workflowBytes: Buffer.from("workflow\n"),
  };
}

function tencentHostSafety() {
  const snapshot = {
    containers: [{
      health: "healthy",
      id: "4".repeat(64),
      image: "market-radar-production:web",
      name: "market-radar-web-1",
      restartCount: 0,
      startedAt: "2026-07-20T09:00:00.000000000Z",
    }],
    networks: [{
      driver: "bridge",
      id: "5".repeat(64),
      name: "market-radar-default",
      scope: "local",
    }],
    volumes: [{ driver: "local", name: "market-radar-postgres-data" }],
  };
  return {
    after: structuredClone(snapshot),
    before: structuredClone(snapshot),
    cleanup: {
      builderPresentAfter: false,
      buildxImagePresentAfter: false,
      buildxImagePresentBefore: false,
      collectorImagePresentAfter: false,
      collectorImagePresentBefore: false,
      namespaceContainersAfter: [],
      namespaceNetworksAfter: [],
      namespaceVolumesAfter: [],
      nodeBaseImagePresentAfter: true,
      nodeBaseImagePresentBefore: true,
      postgresImagePresentAfter: false,
      postgresImagePresentBefore: false,
    },
    executionLimits: {
      buildCpuNano: 1_500_000_000,
      buildMemoryBytes: 2 * 1024 * 1024 * 1024,
      buildMemorySwapBytes: 3 * 1024 * 1024 * 1024,
    },
    resources: {
      cpuCount: 4,
      diskAvailableBytes: 40 * 1024 * 1024 * 1024,
      load1: 1.25,
      memoryAvailableBytes: 4 * 1024 * 1024 * 1024,
    },
  };
}

test("builds a content-addressed, no-authority reachable-runner report", () => {
  const report = buildReachableRunnerEvidence(fixture());
  assert.equal(report.status, "PASS_REACHABLE_DOCKER_RUNNER_PREFLIGHT");
  assert.equal(report.scope.productionMutation, false);
  assert.equal(report.scope.productionSecretsUsed, false);
  assert.equal(report.liveValidation.cycleCount, 2);
  assert.equal(report.liveValidation.cycles[0].coverage.venues.length, 3);
  assert.match(report.evidenceDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(verifyReachableRunnerEvidence(report), report);
});

test("evidence digest covers every report fact", () => {
  const report = buildReachableRunnerEvidence(fixture());
  const { evidenceDigest, evidenceId, ...core } = report;
  assert.equal(evidenceDigest, stableDigest(core));
  assert.ok(evidenceId.endsWith(evidenceDigest.slice("sha256:".length)));
  const altered = structuredClone(report);
  altered.liveValidation.cycles[0].coverage.eligibleCount += 1;
  assert.throws(() => verifyReachableRunnerEvidence(altered));
});

test("rejects a missing venue denominator", () => {
  const input = fixture();
  const runtimeLine = input.liveTap
    .split("\n")
    .find((line) => line.startsWith("# {\"authorityMode\""));
  const runtime = JSON.parse(runtimeLine.slice(2));
  runtime.cycles[0].coverage.venues[0].providerObservedCount = 0;
  input.liveTap = input.liveTap.replace(runtimeLine, `# ${JSON.stringify(runtime)}`);
  assert.throws(
    () => buildReachableRunnerEvidence(input),
    /providerObservedCount/u,
  );
});

test("rejects authority, skipped live execution, or sufficient-SLO inflation", () => {
  for (const mutate of [
    (tap) => tap.replace('"authorityMode":"NO_AUTHORITY"', '"authorityMode":"TRADE"'),
    (tap) => tap.replace("# skipped 0", "# skipped 1"),
    (tap) => tap.replace("INSUFFICIENT_EVIDENCE", "PASS"),
  ]) {
    const input = fixture();
    input.liveTap = mutate(input.liveTap);
    assert.throws(() => buildReachableRunnerEvidence(input));
  }
});

test("rejects image identity drift and embedded capability environment", () => {
  const revisionDrift = fixture();
  revisionDrift.collectorImageInspect[0].Config.Labels[
    "org.opencontainers.image.revision"
  ] = "b".repeat(40);
  assert.throws(() => buildReachableRunnerEvidence(revisionDrift), /revision/u);

  const secretDrift = fixture();
  secretDrift.collectorImageInspect[0].Config.Env.push("API_KEY=not-allowed");
  assert.throws(() => buildReachableRunnerEvidence(secretDrift), /capability/u);
});

test("rejects runtime privilege, source pollution, and production-like storage", () => {
  const privileged = fixture();
  privileged.workerContainerInspect[0].HostConfig.Privileged = true;
  assert.throws(() => buildReachableRunnerEvidence(privileged), /privileged/u);

  const polluted = fixture();
  polluted.runtimeProbe.paths["/app/src"] = true;
  assert.throws(() => buildReachableRunnerEvidence(polluted), /forbidden/u);

  const mounted = fixture();
  mounted.postgresContainerInspect[0].Mounts = [{ Type: "bind" }];
  assert.throws(() => buildReachableRunnerEvidence(mounted), /production data/u);
});

test("binds Tencent isolated execution to exact host restoration evidence", () => {
  const input = fixture();
  input.runnerProvider = B1A_TENCENT_RUNNER_PROVIDER;
  input.runnerBinaryBytes = Buffer.from("pinned node binary\n");
  input.runnerContractBytes = Buffer.from("isolated runner contract\n");
  input.runnerPluginBytes = Buffer.from("pinned buildx plugin\n");
  input.hostSafety = tencentHostSafety();
  input.workerContainerInspect[0].Config.Labels = {
    "market-radar.v2.run-id": input.runId,
    "market-radar.v2.scope": "b1a2-isolated-preflight",
  };
  input.postgresContainerInspect[0].Config.Labels = {
    "market-radar.v2.run-id": input.runId,
    "market-radar.v2.scope": "b1a2-isolated-preflight",
  };
  Object.assign(input.postgresContainerInspect[0].HostConfig, {
    Memory: 384 * 1024 * 1024,
    NanoCpus: 500_000_000,
    PidsLimit: 128,
    SecurityOpt: ["no-new-privileges"],
  });
  for (const network of input.networkInspect) {
    network.Labels = {
      "market-radar.v2.run-id": input.runId,
      "market-radar.v2.scope": "b1a2-isolated-preflight",
    };
  }

  const report = buildReachableRunnerEvidence(input);
  assert.equal(report.runner.provider, B1A_TENCENT_RUNNER_PROVIDER);
  assert.equal(report.scope.productionHostUsed, true);
  assert.equal(report.scope.productionMutation, false);
  assert.equal(report.hostSafety.cleanupVerified, true);
  assert.equal(
    report.hostSafety.baselineDigest,
    report.hostSafety.postCleanupDigest,
  );
  assert.match(report.supplyChain.runnerContractDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(report.supplyChain.runnerBinaryDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(report.supplyChain.buildxImageReference, B1A_BUILDX_IMAGE);
  assert.match(report.supplyChain.runnerPluginDigest, /^sha256:[0-9a-f]{64}$/u);
});

test("rejects Tencent host restart, residue, and weak resource claims", () => {
  const restarted = tencentHostSafety();
  restarted.after.containers[0].restartCount = 1;
  assert.throws(
    () => validateTencentHostSafety(restarted),
    /restored exactly/u,
  );

  const residue = tencentHostSafety();
  residue.cleanup.namespaceNetworksAfter.push("v2-m1-b1a-egress-residue");
  assert.throws(() => validateTencentHostSafety(residue), /must be empty/u);

  const lowMemory = tencentHostSafety();
  lowMemory.resources.memoryAvailableBytes = 2 * 1024 * 1024 * 1024;
  assert.throws(() => validateTencentHostSafety(lowMemory), /available memory/u);
});

test("classifies host validation failures without exposing Docker values", () => {
  assert.equal(
    classifyTencentHostSafetyValidationError(
      new Error("hostSafety.before.networks[0].id is invalid: secret-value"),
    ),
    "HOST_NETWORK_SNAPSHOT_SCHEMA_INVALID",
  );
  assert.equal(
    classifyTencentHostSafetyValidationError(
      new Error("available memory is below the locked execution threshold"),
    ),
    "HOST_MEMORY_THRESHOLD_FAILED",
  );
  assert.equal(
    classifyTencentHostSafetyValidationError(new Error("unknown raw detail")),
    "HOST_SAFETY_CONTRACT_FAILED",
  );
});
