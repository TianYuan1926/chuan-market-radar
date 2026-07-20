import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  B1A_BRANCH,
  B1A_BUILDX_IMAGE,
  B1A_NODE_BASE_IMAGE,
  B1A_POSTGRES_IMAGE,
  B1A_REPOSITORY,
  B1A_TENCENT_RUNNER_PROVIDER,
  stableDigest,
} from "./m1-reachable-runner-preflight.mjs";
import {
  B1B_RELEASE_PREFIX,
  B1B_SCOPE_LABEL,
  buildEarlyShadowRunnerEvidence,
  verifyEarlyShadowRunnerEvidence,
} from "./m1-early-shadow-runner-evidence.mjs";

const SOURCE_COMMIT = "a".repeat(40);
const RUN_ID = "1753000000000";
const RELEASE_ID = `${B1B_RELEASE_PREFIX}:${SOURCE_COMMIT}`;
const COLLECTOR_IMAGE =
  `market-radar-v2-m1-collector:b1b-${SOURCE_COMMIT}`;
const STORAGE_NETWORK = `v2-m1-b1b-storage-${RUN_ID}`;
const EGRESS_NETWORK = `v2-m1-b1b-egress-${RUN_ID}`;
const RUNTIME_CONFIG_DIGEST = `sha256:${"9".repeat(64)}`;
const WORKER_RUN_ID = "worker-run:b1b1-test";

function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function rawArtifacts() {
  const observationLines = Array.from({ length: 31 }, (_, index) =>
    JSON.stringify({
      cycle: {
        authorityMode: "NO_AUTHORITY",
        automaticTradingAllowed: false,
        cycleIndex: index + 1,
        releaseId: RELEASE_ID,
        runtimeConfigDigest: RUNTIME_CONFIG_DIGEST,
        schemaVersion: "v2-m1-collector-worker-cycle.v1",
        workerRunId: WORKER_RUN_ID,
      },
      event: "M1_COLLECTOR_CYCLE",
      schemaVersion: "v2-m1-collector-observation-log.v1",
    })
  );
  const summary = JSON.stringify({
    authorityMode: "NO_AUTHORITY",
    automaticTradingAllowed: false,
    contractVersion: "v2-m1-collector-process.v1",
    cycleCount: 31,
    exitCode: 0,
    releaseId: RELEASE_ID,
    restore: { checkpointId: null, status: "COLD_START" },
    runProfile: "EARLY_30_MINUTES",
    status: "COMPLETED",
    stopReason: "MAX_CYCLES_REACHED",
  });
  return {
    observationBytes: Buffer.from(`${observationLines.join("\n")}\n`),
    processOutputBytes: Buffer.from(
      `${observationLines.join("\n")}\n${summary}\n`,
    ),
  };
}

function hostSafety() {
  const snapshot = {
    containers: [{
      health: "healthy",
      id: "4".repeat(64),
      image: "market-radar-production:web",
      name: "market-radar-web-1",
      restartCount: 0,
      startedAt: "2026-07-21T00:00:00.000000000Z",
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
      load1: 1,
      memoryAvailableBytes: 4 * 1024 * 1024 * 1024,
    },
  };
}

function domainEvidence(processOutputBytes, observationBytes, conclusion = "PASS") {
  const core = {
    authorityMode: "NO_AUTHORITY",
    automaticTradingAllowed: false,
    businessGate: {
      conclusion,
      earlyShadowSloPassed: conclusion === "PASS",
      m1ExitClaimed: false,
      reasons: conclusion === "PASS" ? [] : ["fresh_coverage_below_slo"],
    },
    capture: {
      cycleCount: 31,
      notReadyCycleCount: conclusion === "PASS" ? 0 : 1,
      operationalReadyCycleCount: conclusion === "PASS" ? 31 : 30,
      venues: [
        "BINANCE_FUTURES",
        "BYBIT_LINEAR_PERPETUAL",
        "OKX_SWAP",
      ].map((venue) => ({ venue })),
      workerRunId: WORKER_RUN_ID,
    },
    evaluatedAt: "2026-07-21T00:31:00.000Z",
    process: {
      authorityMode: "NO_AUTHORITY",
      automaticTradingAllowed: false,
      contractVersion: "v2-m1-collector-process.v1",
      cycleCount: 31,
      exitCode: 0,
      releaseId: RELEASE_ID,
      restore: { checkpointId: null, status: "COLD_START" },
      runProfile: "EARLY_30_MINUTES",
      status: "COMPLETED",
      stopReason: "MAX_CYCLES_REACHED",
    },
    releaseId: RELEASE_ID,
    runtimeConfigDigest: RUNTIME_CONFIG_DIGEST,
    schemaVersion: "v2-m1-collector-early-shadow-evidence.v1",
    sourceArtifacts: {
      observationBytes: observationBytes.length,
      observationDigest: digest(observationBytes),
      observationLineCount: 31,
      processOutputBytes: processOutputBytes.length,
      processOutputDigest: digest(processOutputBytes),
      processOutputLineCount: 32,
    },
    slo: {
      conclusion,
      reasons: conclusion === "PASS" ? [] : ["fresh_coverage_below_slo"],
    },
    status: conclusion === "PASS"
      ? "CAPTURE_COMPLETE_BUSINESS_PASS"
      : "CAPTURE_COMPLETE_BUSINESS_FAIL",
  };
  const evidenceDigest = stableDigest(core);
  return {
    ...core,
    evidenceDigest,
    evidenceId: `v2-m1-b1b0:${evidenceDigest.slice("sha256:".length)}`,
  };
}

function workerEnvironment() {
  return [
    "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "NODE_VERSION=22.0.0",
    "NODE_OPTIONS=--disable-proto=throw --unhandled-rejections=strict",
    "NODE_ENV=production",
    "V2_M1_COLLECTOR_AUTHORITY_MODE=NO_AUTHORITY",
    "V2_M1_COLLECTOR_AUTOMATIC_TRADING_ALLOWED=false",
    `V2_M1_COLLECTOR_SOURCE_COMMIT=${SOURCE_COMMIT}`,
    `V2_M1_COLLECTOR_RELEASE_ID=${RELEASE_ID}`,
    "V2_M1_COLLECTOR_POLICY_VERSION=m1-live-linear-usdt-perpetual.v1",
    "V2_M1_COLLECTOR_RUN_PROFILE=EARLY_30_MINUTES",
    "V2_M1_COLLECTOR_DATABASE_HOST=v2-m1-postgres",
    "V2_M1_COLLECTOR_DATABASE_NAME=v2_m1_b1b",
    "V2_M1_COLLECTOR_CYCLE_INTERVAL_MS=60000",
    "V2_M1_COLLECTOR_MAX_CYCLES=31",
    "V2_M1_COLLECTOR_MAX_FACT_AGE_MS=60000",
    "V2_M1_COLLECTOR_MAX_SEQUENCE_GAP_MS=300000",
    "V2_M1_COLLECTOR_RECONCILIATION_INTERVAL_MS=86400000",
    "V2_M1_COLLECTOR_RETENTION_MS=604800000",
    "V2_M1_COLLECTOR_WRITER_DATABASE_URL_FILE=/run/secrets/v2_m1_writer_database_url",
    "V2_M1_COLLECTOR_READER_DATABASE_URL_FILE=/run/secrets/v2_m1_reader_database_url",
  ];
}

function pinnedImageInspect(reference, idCharacter) {
  return [{
    Architecture: "amd64",
    Config: { Env: [], Labels: {}, User: "" },
    Id: `sha256:${idCharacter.repeat(64)}`,
    Os: "linux",
    RepoDigests: [`image@${reference.split("@")[1]}`],
  }];
}

function fixture(conclusion = "PASS") {
  const { processOutputBytes, observationBytes } = rawArtifacts();
  return {
    buildxImageInspect: pinnedImageInspect(B1A_BUILDX_IMAGE, "6"),
    collectorImageInspect: [{
      Architecture: "amd64",
      Config: {
        Entrypoint: [
          "node",
          ".tmp/market-tests/v2/entrypoints/m1-collector-worker.js",
        ],
        Env: [
          "NODE_ENV=production",
          "NODE_OPTIONS=--disable-proto=throw --unhandled-rejections=strict",
        ],
        Labels: { "org.opencontainers.image.revision": SOURCE_COMMIT },
        User: "node",
      },
      Id: `sha256:${"1".repeat(64)}`,
      Os: "linux",
    }],
    collectorImageReference: COLLECTOR_IMAGE,
    dockerfileBytes: Buffer.from("FROM locked\n"),
    domainEvidence: domainEvidence(
      processOutputBytes,
      observationBytes,
      conclusion,
    ),
    generatedAt: "2026-07-21T00:31:01.000Z",
    hostSafety: hostSafety(),
    networkInspect: [
      {
        Attachable: false,
        Driver: "bridge",
        Internal: true,
        Labels: {
          "market-radar.v2.run-id": RUN_ID,
          "market-radar.v2.scope": B1B_SCOPE_LABEL,
        },
        Name: STORAGE_NETWORK,
      },
      {
        Attachable: false,
        Driver: "bridge",
        Internal: false,
        Labels: {
          "market-radar.v2.run-id": RUN_ID,
          "market-radar.v2.scope": B1B_SCOPE_LABEL,
        },
        Name: EGRESS_NETWORK,
      },
    ],
    observationBytes,
    nodeBaseImageInspect: pinnedImageInspect(B1A_NODE_BASE_IMAGE, "2"),
    packageLockBytes: Buffer.from("{\"lockfileVersion\":3}\n"),
    postgresContainerInspect: [{
      Config: {
        Env: [
          "POSTGRES_HOST_AUTH_METHOD=trust",
          "POSTGRES_DB=v2_m1_b1b",
        ],
        Image: B1A_POSTGRES_IMAGE,
        Labels: {
          "market-radar.v2.run-id": RUN_ID,
          "market-radar.v2.scope": B1B_SCOPE_LABEL,
        },
      },
      HostConfig: {
        Memory: 384 * 1024 * 1024,
        NanoCpus: 500_000_000,
        PidsLimit: 128,
        PortBindings: {},
        Privileged: false,
        RestartPolicy: { Name: "no" },
        SecurityOpt: ["no-new-privileges"],
        Tmpfs: {
          "/var/lib/postgresql/data": "rw,noexec,nosuid,nodev,size=512m",
          "/var/run/postgresql": "rw,nosuid,nodev,size=16m",
        },
      },
      Mounts: [{ Type: "tmpfs" }],
      NetworkSettings: { Networks: { [STORAGE_NETWORK]: {} } },
      State: { Health: { Status: "healthy" }, Running: true },
    }],
    postgresImageInspect: pinnedImageInspect(B1A_POSTGRES_IMAGE, "3"),
    processOutputBytes,
    ref: `refs/heads/${B1A_BRANCH}`,
    releaseId: RELEASE_ID,
    repository: B1A_REPOSITORY,
    runId: RUN_ID,
    runnerBinaryBytes: Buffer.from("node-binary\n"),
    runnerContractBytes: Buffer.from("runner\n"),
    runnerPluginBytes: Buffer.from("buildx-plugin\n"),
    runnerProvider: B1A_TENCENT_RUNNER_PROVIDER,
    runtimeProbe: {
      cwd: "/app",
      gid: 1000,
      paths: {
        "/app/.env": false,
        "/app/.git": false,
        "/app/.tmp/market-tests/v2/entrypoints/m1-collector-early-shadow-report.js": true,
        "/app/.tmp/market-tests/v2/entrypoints/m1-collector-worker.js": true,
        "/app/deploy": false,
        "/app/scripts": false,
        "/app/src": false,
      },
      uid: 1000,
    },
    sourceCommit: SOURCE_COMMIT,
    validatorBytes: Buffer.from("validator\n"),
    workerContainerInspect: [{
      Config: {
        Cmd: null,
        Entrypoint: [
          "node",
          ".tmp/market-tests/v2/entrypoints/m1-collector-worker.js",
        ],
        Env: workerEnvironment(),
        Image: COLLECTOR_IMAGE,
        Labels: {
          "market-radar.v2.run-id": RUN_ID,
          "market-radar.v2.scope": B1B_SCOPE_LABEL,
        },
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
      Mounts: [
        {
          Destination: "/run/secrets/v2_m1_writer_database_url",
          RW: false,
          Source: "/temporary/writer",
          Type: "bind",
        },
        {
          Destination: "/run/secrets/v2_m1_reader_database_url",
          RW: false,
          Source: "/temporary/reader",
          Type: "bind",
        },
      ],
      NetworkSettings: {
        Networks: { [EGRESS_NETWORK]: {}, [STORAGE_NETWORK]: {} },
      },
      State: { ExitCode: 0, Status: "exited" },
    }],
  };
}

test("binds a complete 31-cycle PASS to exact runtime and host restoration", () => {
  const report = buildEarlyShadowRunnerEvidence(fixture());

  assert.equal(report.status, "PASS_EARLY_SHADOW_BUSINESS_GATE");
  assert.equal(report.executionConclusion, "PASS_31_CYCLE_CAPTURE");
  assert.equal(report.businessGateConclusion, "PASS");
  assert.equal(report.scope.m1ExitClaimed, false);
  assert.equal(report.scope.productionMutation, false);
  assert.equal(report.hostSafety.exactDockerStateRestored, true);
  assert.equal(verifyEarlyShadowRunnerEvidence(report), report);
});

test("retains a complete capture while refusing to promote business FAIL", () => {
  const report = buildEarlyShadowRunnerEvidence(fixture("FAIL"));

  assert.equal(report.status, "CAPTURE_COMPLETE_BUSINESS_FAIL");
  assert.equal(report.executionConclusion, "PASS_31_CYCLE_CAPTURE");
  assert.equal(report.businessGateConclusion, "FAIL");
  assert.equal(report.scope.earlyShadowSloPassed, false);
});

test("rejects domain inflation, direct database capability and report tampering", () => {
  const malformedRaw = fixture();
  malformedRaw.processOutputBytes = Buffer.from("forged\n");
  malformedRaw.observationBytes = Buffer.from("x\n");
  assert.throws(
    () => buildEarlyShadowRunnerEvidence(malformedRaw),
    /exactly 32 lines/u,
  );

  const inflated = fixture("FAIL");
  inflated.domainEvidence.businessGate.conclusion = "PASS";
  assert.throws(
    () => buildEarlyShadowRunnerEvidence(inflated),
    /Expected values to be strictly equal/u,
  );

  const directCapability = fixture();
  directCapability.workerContainerInspect[0].Config.Env.push(
    [
      "V2_M1_COLLECTOR_WRITER_DATABASE",
      "URL=postgresql://forbidden",
    ].join("_"),
  );
  assert.throws(
    () => buildEarlyShadowRunnerEvidence(directCapability),
    /true !== false/u,
  );

  const report = buildEarlyShadowRunnerEvidence(fixture());
  assert.throws(
    () => verifyEarlyShadowRunnerEvidence({
      ...report,
      status: "CAPTURE_COMPLETE_BUSINESS_FAIL",
    }),
    /Expected values to be strictly equal/u,
  );
});
