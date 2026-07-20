import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const B1A_BRANCH = "codex/market-radar-v2-implementation";
export const B1A_REPOSITORY = "TianYuan1926/chuan-market-radar";
export const B1A_NODE_BASE_IMAGE =
  "node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3";
export const B1A_POSTGRES_IMAGE =
  "postgres:16-bookworm@sha256:92620daddcd947f8d5ab5ba66e848702fe443d87fed30c4cea8e389fd78dfc55";
export const B1A_BUILDX_IMAGE =
  "docker/buildx-bin:0.31.1@sha256:49141c168b609ef38f2b11bc231d48e2492ec1f979c2b9aa4ab691790cce115d";
export const B1A_WORKFLOW_PATH =
  ".github/workflows/v2-m1-5-b1-reachable-runner-preflight.yml";
export const B1A_GITHUB_RUNNER_PROVIDER = "GITHUB_HOSTED";
export const B1A_TENCENT_RUNNER_PROVIDER =
  "TENCENT_LIGHTHOUSE_ISOLATED";

const SCHEMA_VERSION =
  "v2-m1-reachable-runner-preflight-evidence.v2";
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const TARGET_VENUES = [
  "BINANCE_FUTURES",
  "BYBIT_LINEAR_PERPETUAL",
  "OKX_SWAP",
];
const DATA_QUALITY_STATES = [
  "FRESH",
  "PARTIAL",
  "STALE",
  "UNAVAILABLE",
  "RATE_LIMITED",
  "AUTH_ERROR",
  "TRANSPORT_ERROR",
  "INVALID",
];
const SUCCESSFUL_PERSISTENCE_STATES = [
  "INSERTED",
  "IDEMPOTENT_REPLAY",
  "MIXED_INSERT_AND_IDEMPOTENT",
];
const SUCCESSFUL_CHECKPOINT_STATES = ["INSERTED", "IDEMPOTENT_REPLAY"];
const TENCENT_MIN_MEMORY_AVAILABLE_BYTES = 3 * 1024 * 1024 * 1024;
const TENCENT_MIN_DISK_AVAILABLE_BYTES = 20 * 1024 * 1024 * 1024;
const TENCENT_BUILD_CPU_NANO = 1_500_000_000;
const TENCENT_BUILD_MEMORY_BYTES = 2 * 1024 * 1024 * 1024;
const TENCENT_BUILD_MEMORY_SWAP_BYTES = 3 * 1024 * 1024 * 1024;
const EXPECTED_TEST_PATH =
  ".tmp/market-tests/v2/modules/market-fact/collector/collector-live.integration.test.js";
const EXPECTED_ENTRYPOINT = [
  "node",
  ".tmp/market-tests/v2/entrypoints/m1-collector-worker.js",
];
const REQUIRED_RUNTIME_PATHS = [
  "/app/.tmp/market-tests/v2/entrypoints/m1-collector-worker.js",
  `/app/${EXPECTED_TEST_PATH}`,
];
const FORBIDDEN_RUNTIME_PATHS = [
  "/app/.env",
  "/app/.git",
  "/app/deploy",
  "/app/scripts",
  "/app/src",
];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  assert.notEqual(value, undefined, "canonical evidence cannot contain undefined");
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), "canonical evidence numbers must be finite");
  }
  return value;
}

export function stableDigest(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex")}`;
}

function byteDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function assertNonNegativeInteger(value, label) {
  assert.ok(
    Number.isSafeInteger(value) && value >= 0,
    `${label} must be a non-negative safe integer`,
  );
}

function assertPositiveInteger(value, label) {
  assert.ok(
    Number.isSafeInteger(value) && value > 0,
    `${label} must be a positive safe integer`,
  );
}

function assertExactArray(actual, expected, label) {
  assert.deepEqual(actual, expected, `${label} must match the locked contract`);
}

function assertBoolean(value, label) {
  assert.equal(typeof value, "boolean", `${label} must be boolean`);
}

function normalizeSnapshotRecords(records, fields, validators, label) {
  assert.ok(Array.isArray(records), `${label} must be an array`);
  const normalized = records.map((record, index) => {
    assert.ok(isRecord(record), `${label}[${index}] must be an object`);
    assert.deepEqual(
      Object.keys(record).sort(),
      [...fields].sort(),
      `${label}[${index}] fields must be exact`,
    );
    for (const field of fields) {
      validators[field](record[field], `${label}[${index}].${field}`);
    }
    return Object.fromEntries(fields.map((field) => [field, record[field]]));
  });
  normalized.sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );
  assert.equal(
    new Set(normalized.map((record) => JSON.stringify(record))).size,
    normalized.length,
    `${label} must not contain duplicates`,
  );
  return normalized;
}

function normalizeHostSnapshot(snapshot, label) {
  assert.ok(isRecord(snapshot), `${label} must be an object`);
  assert.deepEqual(
    Object.keys(snapshot).sort(),
    ["containers", "networks", "volumes"],
    `${label} fields must be exact`,
  );
  const text = (pattern) => (value, fieldLabel) => {
    assert.equal(typeof value, "string", `${fieldLabel} must be text`);
    assert.match(value, pattern, `${fieldLabel} is invalid`);
  };
  const integer = (value, fieldLabel) =>
    assertNonNegativeInteger(value, fieldLabel);
  return {
    containers: normalizeSnapshotRecords(
      snapshot.containers,
      ["health", "id", "image", "name", "restartCount", "startedAt"],
      {
        health: text(/^(healthy|none|starting)$/u),
        id: text(/^[0-9a-f]{64}$/u),
        image: text(/^[A-Za-z0-9_./:@-]{1,512}$/u),
        name: text(/^[A-Za-z0-9_.-]{1,255}$/u),
        restartCount: integer,
        startedAt: text(/^\d{4}-\d{2}-\d{2}T[^\s]{1,64}Z$/u),
      },
      `${label}.containers`,
    ),
    networks: normalizeSnapshotRecords(
      snapshot.networks,
      ["driver", "id", "name", "scope"],
      {
        driver: text(/^[A-Za-z0-9_.-]{1,64}$/u),
        id: text(/^[0-9a-f]{64}$/u),
        name: text(/^[A-Za-z0-9_.-]{1,255}$/u),
        scope: text(/^[A-Za-z0-9_.-]{1,64}$/u),
      },
      `${label}.networks`,
    ),
    volumes: normalizeSnapshotRecords(
      snapshot.volumes,
      ["driver", "name"],
      {
        driver: text(/^[A-Za-z0-9_.-]{1,64}$/u),
        name: text(/^[A-Za-z0-9_.-]{1,255}$/u),
      },
      `${label}.volumes`,
    ),
  };
}

export function validateTencentHostSafety(hostSafety) {
  assert.ok(isRecord(hostSafety), "Tencent host safety input must be an object");
  assert.deepEqual(
    Object.keys(hostSafety).sort(),
    ["after", "before", "cleanup", "executionLimits", "resources"],
    "Tencent host safety fields must be exact",
  );
  const before = normalizeHostSnapshot(hostSafety.before, "hostSafety.before");
  const after = normalizeHostSnapshot(hostSafety.after, "hostSafety.after");
  assertPositiveInteger(
    before.containers.length,
    "hostSafety.before running container count",
  );
  assert.equal(
    before.containers.every((container) =>
      container.health === "healthy" || container.health === "none"
    ),
    true,
    "production containers must not be starting or unhealthy before execution",
  );
  assert.deepEqual(after, before, "production host Docker state must be restored exactly");

  const resources = hostSafety.resources;
  assert.ok(isRecord(resources), "hostSafety.resources must be an object");
  assert.deepEqual(
    Object.keys(resources).sort(),
    ["cpuCount", "diskAvailableBytes", "load1", "memoryAvailableBytes"],
  );
  assertPositiveInteger(resources.cpuCount, "hostSafety.resources.cpuCount");
  assert.ok(
    Number.isFinite(resources.load1) && resources.load1 >= 0,
    "hostSafety.resources.load1 must be finite and non-negative",
  );
  assert.ok(
    resources.load1 <= resources.cpuCount * 1.5,
    "host load exceeds the locked execution threshold",
  );
  assert.ok(
    Number.isSafeInteger(resources.memoryAvailableBytes) &&
      resources.memoryAvailableBytes >= TENCENT_MIN_MEMORY_AVAILABLE_BYTES,
    "available memory is below the locked execution threshold",
  );
  assert.ok(
    Number.isSafeInteger(resources.diskAvailableBytes) &&
      resources.diskAvailableBytes >= TENCENT_MIN_DISK_AVAILABLE_BYTES,
    "available disk is below the locked execution threshold",
  );

  assert.deepEqual(hostSafety.executionLimits, {
    buildCpuNano: TENCENT_BUILD_CPU_NANO,
    buildMemoryBytes: TENCENT_BUILD_MEMORY_BYTES,
    buildMemorySwapBytes: TENCENT_BUILD_MEMORY_SWAP_BYTES,
  });

  const cleanup = hostSafety.cleanup;
  assert.ok(isRecord(cleanup), "hostSafety.cleanup must be an object");
  assert.deepEqual(
    Object.keys(cleanup).sort(),
    [
      "builderPresentAfter",
      "buildxImagePresentAfter",
      "buildxImagePresentBefore",
      "collectorImagePresentAfter",
      "collectorImagePresentBefore",
      "namespaceContainersAfter",
      "namespaceNetworksAfter",
      "namespaceVolumesAfter",
      "nodeBaseImagePresentAfter",
      "nodeBaseImagePresentBefore",
      "postgresImagePresentAfter",
      "postgresImagePresentBefore",
    ],
  );
  for (const name of [
    "builderPresentAfter",
    "buildxImagePresentAfter",
    "buildxImagePresentBefore",
    "collectorImagePresentAfter",
    "collectorImagePresentBefore",
    "nodeBaseImagePresentAfter",
    "nodeBaseImagePresentBefore",
    "postgresImagePresentAfter",
    "postgresImagePresentBefore",
  ]) {
    assertBoolean(cleanup[name], `hostSafety.cleanup.${name}`);
  }
  assert.equal(cleanup.builderPresentAfter, false);
  assert.equal(
    cleanup.buildxImagePresentAfter,
    cleanup.buildxImagePresentBefore,
  );
  assert.equal(cleanup.collectorImagePresentBefore, false);
  assert.equal(cleanup.collectorImagePresentAfter, false);
  assert.equal(
    cleanup.nodeBaseImagePresentAfter,
    cleanup.nodeBaseImagePresentBefore,
  );
  assert.equal(
    cleanup.postgresImagePresentAfter,
    cleanup.postgresImagePresentBefore,
  );
  for (const name of [
    "namespaceContainersAfter",
    "namespaceNetworksAfter",
    "namespaceVolumesAfter",
  ]) {
    assert.deepEqual(cleanup[name], [], `hostSafety.cleanup.${name} must be empty`);
  }

  const baselineDigest = stableDigest(before);
  return {
    baselineDigest,
    buildLimits: { ...hostSafety.executionLimits },
    cleanupVerified: true,
    cpuCount: resources.cpuCount,
    diskAvailableBytes: resources.diskAvailableBytes,
    exactDockerStateRestored: true,
    load1: resources.load1,
    memoryAvailableBytes: resources.memoryAvailableBytes,
    networkCount: before.networks.length,
    postCleanupDigest: stableDigest(after),
    preexistingRunningContainerCount: before.containers.length,
    volumeCount: before.volumes.length,
  };
}

export function classifyTencentHostSafetyValidationError(error) {
  const message = error instanceof Error ? error.message : "";
  const categories = [
    [/hostSafety\.(before|after)\.containers/u, "HOST_CONTAINER_SNAPSHOT_SCHEMA_INVALID"],
    [/hostSafety\.(before|after)\.networks/u, "HOST_NETWORK_SNAPSHOT_SCHEMA_INVALID"],
    [/hostSafety\.(before|after)\.volumes/u, "HOST_VOLUME_SNAPSHOT_SCHEMA_INVALID"],
    [/running container count/u, "HOST_RUNNING_CONTAINER_COUNT_INVALID"],
    [/production containers must not be/u, "HOST_CONTAINER_HEALTH_NOT_READY"],
    [/Docker state must be restored exactly/u, "HOST_DOCKER_STATE_DRIFTED"],
    [/(cpuCount|load1|host load)/u, "HOST_CPU_LOAD_THRESHOLD_FAILED"],
    [/available memory/u, "HOST_MEMORY_THRESHOLD_FAILED"],
    [/available disk/u, "HOST_DISK_THRESHOLD_FAILED"],
    [/(executionLimits|build limits)/u, "HOST_BUILD_LIMIT_CONTRACT_INVALID"],
    [/hostSafety\.cleanup/u, "HOST_CLEANUP_PROOF_INVALID"],
  ];
  return categories.find(([pattern]) => pattern.test(message))?.[1] ??
    "HOST_SAFETY_CONTRACT_FAILED";
}

function oneInspect(value, label) {
  assert.ok(Array.isArray(value), `${label} must be a Docker inspect array`);
  assert.equal(value.length, 1, `${label} must contain exactly one object`);
  assert.ok(isRecord(value[0]), `${label}[0] must be an object`);
  return value[0];
}

function environmentMap(environment, label) {
  assert.ok(Array.isArray(environment), `${label} environment must be an array`);
  const result = new Map();
  for (const entry of environment) {
    assert.equal(typeof entry, "string", `${label} environment entry must be text`);
    const separator = entry.indexOf("=");
    assert.ok(separator > 0, `${label} environment entry must contain a name`);
    const name = entry.slice(0, separator);
    assert.equal(result.has(name), false, `${label} has duplicate environment ${name}`);
    result.set(name, entry.slice(separator + 1));
  }
  return result;
}

function assertNoPublishedPorts(inspect, label) {
  const portBindings = inspect.HostConfig?.PortBindings;
  assert.ok(
    portBindings === null ||
      portBindings === undefined ||
      (isRecord(portBindings) && Object.keys(portBindings).length === 0),
    `${label} must not publish ports`,
  );
  const ports = inspect.NetworkSettings?.Ports;
  if (ports !== null && ports !== undefined) {
    assert.ok(isRecord(ports), `${label} network ports must be an object`);
    for (const bindings of Object.values(ports)) {
      assert.ok(
        bindings === null ||
          (Array.isArray(bindings) && bindings.length === 0),
        `${label} must not expose a host binding`,
      );
    }
  }
}

function validateImageInspect(input, runnerProvider) {
  const collector = oneInspect(input.collectorImageInspect, "collector image inspect");
  assert.match(collector.Id, SHA256_PATTERN, "collector image ID must be content addressed");
  assert.equal(collector.Os, "linux", "collector image OS must be linux");
  assert.equal(collector.Architecture, "amd64", "collector image architecture must be amd64");
  assert.equal(collector.Config?.User, "node", "collector image must run as node");
  assertExactArray(
    collector.Config?.Entrypoint,
    EXPECTED_ENTRYPOINT,
    "collector image entrypoint",
  );
  assert.equal(
    collector.Config?.Labels?.["org.opencontainers.image.revision"],
    input.sourceCommit,
    "collector image revision label must bind the exact source commit",
  );
  const collectorEnvironment = environmentMap(
    collector.Config?.Env,
    "collector image",
  );
  for (const name of collectorEnvironment.keys()) {
    assert.equal(
      /(SECRET|TOKEN|PASSWORD|API_KEY|DATABASE_URL|CRON|REDIS)/u.test(name),
      false,
      `collector image must not embed capability environment ${name}`,
    );
  }

  const nodeBase = oneInspect(input.nodeBaseImageInspect, "Node base image inspect");
  assert.match(nodeBase.Id, SHA256_PATTERN, "Node base image ID must be content addressed");
  assert.equal(nodeBase.Os, "linux", "Node base image OS must be linux");
  assert.equal(nodeBase.Architecture, "amd64", "Node base image architecture must be amd64");
  assert.ok(
    (nodeBase.RepoDigests ?? []).some((digest) =>
      digest.endsWith(B1A_NODE_BASE_IMAGE.slice(B1A_NODE_BASE_IMAGE.indexOf("@")))),
    "Node base image inspect must resolve the locked digest",
  );

  const postgres = oneInspect(
    input.postgresImageInspect,
    "Postgres image inspect",
  );
  assert.match(postgres.Id, SHA256_PATTERN, "Postgres image ID must be content addressed");
  assert.equal(postgres.Os, "linux", "Postgres image OS must be linux");
  assert.equal(postgres.Architecture, "amd64", "Postgres image architecture must be amd64");
  assert.ok(
    (postgres.RepoDigests ?? []).some((digest) =>
      digest.endsWith(B1A_POSTGRES_IMAGE.slice(B1A_POSTGRES_IMAGE.indexOf("@")))),
    "Postgres image inspect must resolve the locked digest",
  );

  let buildxImageId;
  if (runnerProvider === B1A_TENCENT_RUNNER_PROVIDER) {
    const buildx = oneInspect(input.buildxImageInspect, "Buildx image inspect");
    assert.match(buildx.Id, SHA256_PATTERN, "Buildx image ID must be content addressed");
    assert.equal(buildx.Os, "linux", "Buildx image OS must be linux");
    assert.equal(buildx.Architecture, "amd64", "Buildx image architecture must be amd64");
    assert.ok(
      (buildx.RepoDigests ?? []).some((digest) =>
        digest.endsWith(B1A_BUILDX_IMAGE.slice(B1A_BUILDX_IMAGE.indexOf("@")))
      ),
      "Buildx image inspect must resolve the locked digest",
    );
    buildxImageId = buildx.Id;
  }

  return {
    ...(buildxImageId === undefined ? {} : { buildxImageId }),
    collectorImageId: collector.Id,
    nodeBaseImageId: nodeBase.Id,
    postgresImageId: postgres.Id,
  };
}

function validateRuntimeProbe(probe) {
  assert.ok(isRecord(probe), "runtime probe must be an object");
  assert.equal(probe.cwd, "/app", "runtime image cwd must be /app");
  assert.equal(probe.uid, 1000, "runtime probe uid must be 1000");
  assert.equal(probe.gid, 1000, "runtime probe gid must be 1000");
  assert.ok(isRecord(probe.paths), "runtime probe paths must be an object");
  for (const path of REQUIRED_RUNTIME_PATHS) {
    assert.equal(probe.paths[path], true, `runtime image is missing ${path}`);
  }
  for (const path of FORBIDDEN_RUNTIME_PATHS) {
    assert.equal(probe.paths[path], false, `runtime image contains forbidden ${path}`);
  }
  assert.deepEqual(
    Object.keys(probe.paths).sort(),
    [...REQUIRED_RUNTIME_PATHS, ...FORBIDDEN_RUNTIME_PATHS].sort(),
    "runtime probe path set must be exact",
  );
}

function validateWorkerContainer(input, runnerProvider) {
  const worker = oneInspect(input.workerContainerInspect, "worker container inspect");
  assert.equal(worker.Config?.Image, input.collectorImageReference);
  assert.equal(worker.Config?.User, "1000:1000", "worker must run as 1000:1000");
  assertExactArray(worker.Config?.Entrypoint, ["node"], "worker test entrypoint");
  assertExactArray(
    worker.Config?.Cmd,
    ["--test", "--test-reporter=tap", EXPECTED_TEST_PATH],
    "worker test command",
  );
  assert.equal(worker.HostConfig?.ReadonlyRootfs, true, "worker root filesystem must be read-only");
  assert.equal(worker.HostConfig?.Privileged, false, "worker must not be privileged");
  assert.deepEqual(worker.HostConfig?.CapDrop, ["ALL"], "worker must drop all capabilities");
  assert.ok(
    worker.HostConfig?.SecurityOpt?.includes("no-new-privileges"),
    "worker must set no-new-privileges",
  );
  assert.equal(worker.HostConfig?.PidsLimit, 128, "worker PID limit must be 128");
  assert.equal(worker.HostConfig?.Memory, 512 * 1024 * 1024, "worker memory must be 512 MiB");
  assert.equal(worker.HostConfig?.NanoCpus, 750_000_000, "worker CPU limit must be 0.75");
  assert.equal(worker.HostConfig?.RestartPolicy?.Name, "no", "worker restart policy must be no");
  assert.equal(worker.State?.ExitCode, 0, "worker integration container must exit zero");
  assertNoPublishedPorts(worker, "worker");
  assert.ok(isRecord(worker.HostConfig?.Tmpfs), "worker must have a bounded tmpfs");
  assert.ok("/tmp" in worker.HostConfig.Tmpfs, "worker must mount /tmp as tmpfs");
  if (runnerProvider === B1A_TENCENT_RUNNER_PROVIDER) {
    assert.equal(
      worker.Config?.Labels?.["market-radar.v2.scope"],
      "b1a2-isolated-preflight",
    );
    assert.equal(
      worker.Config?.Labels?.["market-radar.v2.run-id"],
      String(input.runId),
    );
  }

  const workerEnvironment = environmentMap(worker.Config?.Env, "worker");
  assert.equal(workerEnvironment.get("V2_M1_LIVE_REHEARSAL"), "1");
  assert.equal(
    workerEnvironment.get("V2_M1_REHEARSAL_SOURCE_COMMIT"),
    input.sourceCommit,
  );
  const databaseUrl = new URL(
    workerEnvironment.get("V2_M1_REHEARSAL_DATABASE_URL"),
  );
  assert.equal(databaseUrl.protocol, "postgresql:");
  assert.equal(databaseUrl.username, "postgres");
  assert.equal(databaseUrl.password, "");
  assert.equal(databaseUrl.hostname, "v2-m1-postgres");
  assert.equal(databaseUrl.port, "5432");
  assert.equal(databaseUrl.pathname, "/v2_m1_b1a");

  const networks = Object.keys(worker.NetworkSettings?.Networks ?? {}).sort();
  assert.equal(networks.length, 2, "worker must have exactly storage and egress networks");
  assert.ok(networks.some((name) => name.startsWith("v2-m1-b1a-storage-")));
  assert.ok(networks.some((name) => name.startsWith("v2-m1-b1a-egress-")));
  return networks;
}

function validatePostgresContainer(input, workerNetworks, runnerProvider) {
  const postgres = oneInspect(
    input.postgresContainerInspect,
    "Postgres container inspect",
  );
  assert.equal(postgres.Config?.Image, B1A_POSTGRES_IMAGE);
  assert.equal(postgres.HostConfig?.Privileged, false, "Postgres must not be privileged");
  assert.equal(postgres.HostConfig?.RestartPolicy?.Name, "no");
  assert.equal(postgres.State?.Running, true, "ephemeral Postgres must be running during validation");
  assert.equal(postgres.State?.Health?.Status, "healthy", "ephemeral Postgres must be healthy");
  assertNoPublishedPorts(postgres, "Postgres");
  assert.equal(
    (postgres.Mounts ?? []).some((mount) => mount.Type === "bind"),
    false,
    "ephemeral Postgres must not bind host or production data",
  );
  const postgresNetworks = Object.keys(postgres.NetworkSettings?.Networks ?? {});
  assert.equal(postgresNetworks.length, 1, "Postgres must only use the internal storage network");
  assert.ok(postgresNetworks[0].startsWith("v2-m1-b1a-storage-"));
  assert.ok(workerNetworks.includes(postgresNetworks[0]));

  const postgresEnvironment = environmentMap(postgres.Config?.Env, "Postgres");
  assert.equal(postgresEnvironment.get("POSTGRES_HOST_AUTH_METHOD"), "trust");
  assert.equal(postgresEnvironment.get("POSTGRES_DB"), "v2_m1_b1a");
  assert.equal(postgresEnvironment.has("POSTGRES_PASSWORD"), false);
  if (runnerProvider === B1A_TENCENT_RUNNER_PROVIDER) {
    assert.equal(postgres.HostConfig?.Memory, 384 * 1024 * 1024);
    assert.equal(postgres.HostConfig?.NanoCpus, 500_000_000);
    assert.equal(postgres.HostConfig?.PidsLimit, 128);
    assert.ok(
      postgres.HostConfig?.SecurityOpt?.includes("no-new-privileges"),
      "Tencent isolated Postgres must set no-new-privileges",
    );
    assert.equal(
      postgres.Config?.Labels?.["market-radar.v2.scope"],
      "b1a2-isolated-preflight",
    );
    assert.equal(
      postgres.Config?.Labels?.["market-radar.v2.run-id"],
      String(input.runId),
    );
  }
}

function validateNetworks(input, runnerProvider) {
  assert.ok(Array.isArray(input.networkInspect), "network inspect must be an array");
  assert.equal(input.networkInspect.length, 2, "exactly two isolated networks are required");
  const normalized = input.networkInspect
    .map((network) => {
      assert.ok(isRecord(network), "network inspect entry must be an object");
      assert.equal(network.Driver, "bridge", "preflight networks must use bridge isolation");
      assert.equal(network.Attachable, false, "preflight networks must not be attachable");
      assert.ok(
        network.Name.startsWith("v2-m1-b1a-storage-") ||
          network.Name.startsWith("v2-m1-b1a-egress-"),
        "preflight network name is outside the locked namespace",
      );
      if (runnerProvider === B1A_TENCENT_RUNNER_PROVIDER) {
        assert.equal(
          network.Labels?.["market-radar.v2.scope"],
          "b1a2-isolated-preflight",
        );
        assert.equal(
          network.Labels?.["market-radar.v2.run-id"],
          String(input.runId),
        );
      }
      return { internal: network.Internal, name: network.Name };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  assert.equal(normalized.filter((network) => network.internal).length, 1);
  assert.equal(normalized.filter((network) => !network.internal).length, 1);
  assert.ok(normalized.find((network) => network.internal)?.name.includes("storage"));
  assert.ok(normalized.find((network) => !network.internal)?.name.includes("egress"));
}

function tapSummary(tap) {
  assert.equal(typeof tap, "string", "live TAP must be text");
  assert.equal(/(^|\n)not ok\b/u.test(tap), false, "live TAP contains a failing test");
  const counts = new Map();
  const jsonRecords = [];
  for (const rawLine of tap.split(/\r?\n/u)) {
    const line = rawLine.trim();
    const count = /^# (tests|pass|fail|skipped) (\d+)$/u.exec(line);
    if (count) {
      counts.set(count[1], Number(count[2]));
    }
    const candidate = line.replace(/^#\s?/u, "");
    if (candidate.startsWith("{") && candidate.endsWith("}")) {
      try {
        jsonRecords.push(JSON.parse(candidate));
      } catch {
        assert.fail("live TAP contains malformed JSON evidence");
      }
    }
  }
  assert.equal(counts.get("tests"), 1, "live TAP must execute exactly one test");
  assert.equal(counts.get("pass"), 1, "live TAP must pass exactly one test");
  assert.equal(counts.get("fail"), 0, "live TAP must have zero failures");
  assert.equal(counts.get("skipped"), 0, "live TAP must not skip the live test");
  const runtimeRecords = jsonRecords.filter((record) => "authorityMode" in record);
  const sloRecords = jsonRecords.filter((record) => "sloConclusion" in record);
  assert.equal(runtimeRecords.length, 1, "live TAP must contain one runtime evidence record");
  assert.equal(sloRecords.length, 1, "live TAP must contain one SLO evidence record");
  return { runtime: runtimeRecords[0], slo: sloRecords[0] };
}

function normalizeCoverageCounts(coverage, label, requireObserved) {
  assert.ok(isRecord(coverage), `${label} coverage must be an object`);
  for (const key of [
    "accountedCount",
    "carriedForwardCount",
    "collectedCount",
    "eligibleCount",
    "freshCount",
  ]) {
    assertNonNegativeInteger(coverage[key], `${label}.${key}`);
  }
  assertPositiveInteger(coverage.accountedCount, `${label}.accountedCount`);
  assertPositiveInteger(coverage.eligibleCount, `${label}.eligibleCount`);
  assert.equal(coverage.collectedCount, coverage.eligibleCount, `${label} collection must be complete`);
  assertPositiveInteger(coverage.freshCount, `${label}.freshCount`);
  assert.ok(
    coverage.freshCount <= coverage.collectedCount,
    `${label} freshness cannot exceed collection`,
  );
  if (requireObserved) {
    assertPositiveInteger(
      coverage.providerObservedCount,
      `${label}.providerObservedCount`,
    );
  } else {
    assert.ok(
      coverage.providerObservedCount === null ||
        (Number.isSafeInteger(coverage.providerObservedCount) &&
          coverage.providerObservedCount > 0),
      `${label}.providerObservedCount must be null or positive`,
    );
  }
  assert.equal(coverage.collectionCoverage?.denominator, coverage.eligibleCount);
  assert.equal(coverage.collectionCoverage?.numerator, coverage.collectedCount);
  assert.equal(coverage.collectionCoverage?.ratio, 1);
  assert.equal(coverage.freshCoverage?.denominator, coverage.eligibleCount);
  assert.equal(coverage.freshCoverage?.numerator, coverage.freshCount);
  assert.equal(
    coverage.freshCoverage?.ratio,
    coverage.freshCount / coverage.eligibleCount,
  );
  return {
    accountedCount: coverage.accountedCount,
    carriedForwardCount: coverage.carriedForwardCount,
    collectedCount: coverage.collectedCount,
    collectionCoverageRatio: coverage.collectionCoverage.ratio,
    eligibleCount: coverage.eligibleCount,
    freshCount: coverage.freshCount,
    freshCoverageRatio: coverage.freshCoverage.ratio,
    providerObservedCount: coverage.providerObservedCount,
  };
}

function normalizeCoverage(coverage, label, requireObserved) {
  const aggregate = normalizeCoverageCounts(coverage, label, requireObserved);
  assert.ok(Array.isArray(coverage.venues), `${label}.venues must be an array`);
  assert.equal(coverage.venues.length, 3, `${label} must include all three venues`);
  const venues = coverage.venues
    .map((venueCoverage) => {
      assert.ok(isRecord(venueCoverage), `${label} venue coverage must be an object`);
      assert.ok(TARGET_VENUES.includes(venueCoverage.venue));
      assert.deepEqual(venueCoverage.providerFailures, []);
      const normalized = normalizeCoverageCounts(
        venueCoverage,
        `${label}.${venueCoverage.venue}`,
        requireObserved,
      );
      return { ...normalized, venue: venueCoverage.venue };
    })
    .sort((left, right) => left.venue.localeCompare(right.venue));
  assert.deepEqual(venues.map((venue) => venue.venue), TARGET_VENUES);
  for (const field of [
    "accountedCount",
    "carriedForwardCount",
    "collectedCount",
    "eligibleCount",
    "freshCount",
  ]) {
    assert.equal(
      venues.reduce((sum, venue) => sum + venue[field], 0),
      aggregate[field],
      `${label}.${field} must equal the venue total`,
    );
  }
  if (aggregate.providerObservedCount === null) {
    assert.ok(
      venues.every((venue) => venue.providerObservedCount === null),
      `${label}.providerObservedCount nullability must match every venue`,
    );
  } else {
    assert.equal(
      venues.reduce(
        (sum, venue) => sum + (venue.providerObservedCount ?? 0),
        0,
      ),
      aggregate.providerObservedCount,
      `${label}.providerObservedCount must equal the venue total`,
    );
  }
  return {
    ...aggregate,
    venues,
  };
}

function validateLiveEvidence(input) {
  const parsed = tapSummary(input.liveTap);
  assert.ok(isRecord(parsed.runtime), "runtime evidence must be an object");
  assert.equal(parsed.runtime.authorityMode, "NO_AUTHORITY");
  assert.equal(parsed.runtime.automaticTradingAllowed, false);
  assert.equal(parsed.runtime.status, "COMPLETED");
  assert.equal(
    parsed.runtime.releaseId,
    `m1-5-live:${input.sourceCommit.slice(0, 12)}`,
  );
  assert.ok(Array.isArray(parsed.runtime.cycles));
  assert.equal(parsed.runtime.cycles.length, 2, "preflight must contain exactly two live cycles");
  const cycles = parsed.runtime.cycles.map((cycle, index) => {
    assert.ok(isRecord(cycle), `cycle ${index} must be an object`);
    assert.ok(
      cycle.operationalReadiness === "READY" ||
        cycle.operationalReadiness === "NOT_READY",
      `cycle ${index} readiness is invalid`,
    );
    assert.ok(
      DATA_QUALITY_STATES.includes(cycle.dataQuality),
      `cycle ${index} data quality is invalid`,
    );
    assert.ok(
      SUCCESSFUL_PERSISTENCE_STATES.includes(cycle.persistence),
      `cycle ${index} persistence must succeed`,
    );
    assert.ok(
      SUCCESSFUL_CHECKPOINT_STATES.includes(cycle.checkpointStatus),
      `cycle ${index} checkpoint must persist`,
    );
    assert.deepEqual(cycle.providerFailures, []);
    assert.ok(Array.isArray(cycle.reasons), `cycle ${index} reasons must be an array`);
    const reasons = cycle.reasons.map((reason) => {
      assert.ok(
        typeof reason === "string" && reason.length > 0,
        `cycle ${index} contains an invalid reason`,
      );
      return reason;
    });
    assert.deepEqual(
      reasons,
      [...new Set(reasons)].sort(),
      `cycle ${index} reasons must be unique and sorted`,
    );
    const coverage = normalizeCoverage(
      cycle.coverage,
      `cycle[${index}]`,
      index === 0,
    );
    if (cycle.operationalReadiness === "READY") {
      assert.equal(cycle.state, "READY");
      assert.equal(cycle.dataQuality, "FRESH");
      assert.deepEqual(reasons, []);
      assert.equal(
        coverage.freshCount,
        coverage.eligibleCount,
        `cycle ${index} READY cannot exceed freshness truth`,
      );
    } else {
      assert.equal(cycle.state, "DEGRADED");
      assert.ok(reasons.length > 0, `cycle ${index} must explain NOT_READY`);
      if (coverage.freshCount < coverage.eligibleCount) {
        assert.ok(
          reasons.includes("fresh_coverage_incomplete"),
          `cycle ${index} must preserve incomplete freshness truth`,
        );
      }
    }
    return {
      checkpointStatus: cycle.checkpointStatus,
      coverage,
      dataQuality: cycle.dataQuality,
      operationalReadiness: cycle.operationalReadiness,
      ordinal: index,
      persistence: cycle.persistence,
      providerFailureCount: cycle.providerFailures.length,
      reasons,
      state: cycle.state,
      trigger: cycle.trigger,
    };
  });
  assert.equal(cycles[0].trigger, "STARTUP_FULL");
  assert.equal(
    cycles[1].trigger,
    cycles[0].operationalReadiness === "READY"
      ? "INCREMENTAL_TICKER"
      : "RECOVERY",
  );
  assert.equal(parsed.slo.sloConclusion, "INSUFFICIENT_EVIDENCE");
  const operationalReadyCycleCount = cycles.filter(
    (cycle) => cycle.operationalReadiness === "READY",
  ).length;
  return {
    authorityMode: parsed.runtime.authorityMode,
    automaticTradingAllowed: parsed.runtime.automaticTradingAllowed,
    businessReadinessConclusion: "INSUFFICIENT_EVIDENCE",
    cycleCount: cycles.length,
    cycles,
    notReadyCycleCount: cycles.length - operationalReadyCycleCount,
    operationalReadyCycleCount,
    releaseId: parsed.runtime.releaseId,
    sloConclusion: parsed.slo.sloConclusion,
    status: parsed.runtime.status,
    technicalPreflightConclusion: "PASS_REACHABLE_DOCKER_RUNNER",
  };
}

export function verifyReachableRunnerEvidence(report) {
  assert.ok(isRecord(report), "evidence report must be an object");
  assert.match(report.evidenceDigest, SHA256_PATTERN);
  const { evidenceDigest, evidenceId, ...core } = report;
  assert.equal(evidenceDigest, stableDigest(core));
  assert.equal(
    evidenceId,
    `v2-m1-b1a:${evidenceDigest.slice("sha256:".length)}`,
  );
  assert.equal(report.schemaVersion, SCHEMA_VERSION);
  assert.equal(report.status, "PASS_REACHABLE_DOCKER_RUNNER_PREFLIGHT");
  assert.equal(report.scope.productionMutation, false);
  assert.ok(
    [B1A_GITHUB_RUNNER_PROVIDER, B1A_TENCENT_RUNNER_PROVIDER].includes(
      report.runner.provider,
    ),
    "runner provider is outside the locked contract",
  );
  if (report.runner.provider === B1A_TENCENT_RUNNER_PROVIDER) {
    assert.equal(report.scope.productionHostUsed, true);
    assert.equal(report.hostSafety?.cleanupVerified, true);
    assert.equal(report.hostSafety?.exactDockerStateRestored, true);
    assert.equal(
      report.hostSafety?.postCleanupDigest,
      report.hostSafety?.baselineDigest,
    );
    assert.match(report.supplyChain.runnerContractDigest, SHA256_PATTERN);
    assert.match(report.supplyChain.runnerBinaryDigest, SHA256_PATTERN);
    assert.match(report.supplyChain.runnerPluginDigest, SHA256_PATTERN);
    assert.match(report.supplyChain.buildxImageId, SHA256_PATTERN);
    assert.equal(report.supplyChain.buildxImageReference, B1A_BUILDX_IMAGE);
  } else {
    assert.equal(report.scope.productionHostUsed, false);
    assert.equal("hostSafety" in report, false);
    assert.equal("runnerContractDigest" in report.supplyChain, false);
    assert.equal("runnerBinaryDigest" in report.supplyChain, false);
    assert.equal("runnerPluginDigest" in report.supplyChain, false);
    assert.equal("buildxImageId" in report.supplyChain, false);
  }
  assert.equal(report.scope.automaticTradingAllowed, false);
  assert.equal(report.scope.businessReadinessClaimed, false);
  assert.equal(report.scope.operationalSloPassed, false);
  assert.equal(
    report.liveValidation.technicalPreflightConclusion,
    "PASS_REACHABLE_DOCKER_RUNNER",
  );
  assert.equal(
    report.liveValidation.businessReadinessConclusion,
    "INSUFFICIENT_EVIDENCE",
  );
  assert.equal(
    report.liveValidation.operationalReadyCycleCount +
      report.liveValidation.notReadyCycleCount,
    report.liveValidation.cycleCount,
  );
  assert.equal(report.liveValidation.sloConclusion, "INSUFFICIENT_EVIDENCE");
  return report;
}

export function buildReachableRunnerEvidence(input) {
  const runnerProvider =
    input.runnerProvider ?? B1A_GITHUB_RUNNER_PROVIDER;
  assert.ok(
    [B1A_GITHUB_RUNNER_PROVIDER, B1A_TENCENT_RUNNER_PROVIDER].includes(
      runnerProvider,
    ),
    "runner provider is outside the locked contract",
  );
  assert.match(input.sourceCommit, COMMIT_PATTERN, "source commit must be exact");
  assert.equal(input.repository, B1A_REPOSITORY);
  assert.equal(input.ref, `refs/heads/${B1A_BRANCH}`);
  assert.match(String(input.runId), /^[1-9][0-9]*$/u);
  assertPositiveInteger(Number(input.runAttempt), "run attempt");
  assert.equal(input.runnerOs, "Linux");
  assert.equal(input.runnerArch, "X64");
  assert.equal(
    input.collectorImageReference,
    `market-radar-v2-m1-collector:b1a-${input.sourceCommit}`,
  );
  assert.equal(input.nodeBaseImageReference, B1A_NODE_BASE_IMAGE);
  assert.equal(input.postgresImageReference, B1A_POSTGRES_IMAGE);
  assert.equal(new Date(input.generatedAt).toISOString(), input.generatedAt);

  const imageIds = validateImageInspect(input, runnerProvider);
  validateRuntimeProbe(input.runtimeProbe);
  const workerNetworks = validateWorkerContainer(input, runnerProvider);
  validatePostgresContainer(input, workerNetworks, runnerProvider);
  validateNetworks(input, runnerProvider);
  const liveValidation = validateLiveEvidence(input);
  const hostSafety =
    runnerProvider === B1A_TENCENT_RUNNER_PROVIDER
      ? validateTencentHostSafety(input.hostSafety)
      : null;
  if (runnerProvider === B1A_TENCENT_RUNNER_PROVIDER) {
    assert.ok(
      Buffer.isBuffer(input.runnerContractBytes) &&
        input.runnerContractBytes.length > 0,
      "Tencent runner contract bytes are required",
    );
    assert.ok(
      Buffer.isBuffer(input.runnerBinaryBytes) &&
        input.runnerBinaryBytes.length > 0,
      "Tencent runner binary bytes are required",
    );
    assert.ok(
      Buffer.isBuffer(input.runnerPluginBytes) &&
        input.runnerPluginBytes.length > 0,
      "Tencent runner plugin bytes are required",
    );
  }

  const core = {
    generatedAt: input.generatedAt,
    liveValidation,
    runner: {
      architecture: input.runnerArch,
      attempt: Number(input.runAttempt),
      id: String(input.runId),
      operatingSystem: input.runnerOs,
      provider: runnerProvider,
    },
    schemaVersion: SCHEMA_VERSION,
    scope: {
      automaticTradingAllowed: false,
      businessReadinessClaimed: false,
      candidateRuntimePresent: false,
      databaseMigrationAppliedToProduction: false,
      detectorExecuted: false,
      productionHostUsed:
        runnerProvider === B1A_TENCENT_RUNNER_PROVIDER,
      productionDependenciesUsed: false,
      productionMutation: false,
      productionNetworkUsed: false,
      productionSecretsUsed: false,
      operationalSloPassed: false,
      tradingPlanGenerated: false,
    },
    source: {
      commit: input.sourceCommit,
      ref: input.ref,
      repository: input.repository,
      trackedCheckoutClean: true,
    },
    status: "PASS_REACHABLE_DOCKER_RUNNER_PREFLIGHT",
    supplyChain: {
      collectorImageId: imageIds.collectorImageId,
      collectorImageReference: input.collectorImageReference,
      dockerfileDigest: byteDigest(input.dockerfileBytes),
      nodeBaseImageId: imageIds.nodeBaseImageId,
      nodeBaseImageReference: input.nodeBaseImageReference,
      packageLockDigest: byteDigest(input.packageLockBytes),
      postgresImageId: imageIds.postgresImageId,
      postgresImageReference: input.postgresImageReference,
      validatorDigest: byteDigest(input.validatorBytes),
      workflowDigest: byteDigest(input.workflowBytes),
      ...(runnerProvider === B1A_TENCENT_RUNNER_PROVIDER
        ? {
          buildxImageId: imageIds.buildxImageId,
          buildxImageReference: B1A_BUILDX_IMAGE,
          runnerBinaryDigest: byteDigest(input.runnerBinaryBytes),
          runnerContractDigest: byteDigest(input.runnerContractBytes),
          runnerPluginDigest: byteDigest(input.runnerPluginBytes),
        }
        : {}),
    },
    ...(hostSafety === null ? {} : { hostSafety }),
  };
  const evidenceDigest = stableDigest(core);
  return verifyReachableRunnerEvidence({
    ...core,
    evidenceDigest,
    evidenceId: `v2-m1-b1a:${evidenceDigest.slice("sha256:".length)}`,
  });
}

async function readBounded(path, label) {
  const stats = await lstat(path);
  assert.ok(stats.isFile() && !stats.isSymbolicLink(), `${label} must be a regular file`);
  assert.ok(stats.size > 0 && stats.size <= MAX_INPUT_BYTES, `${label} has invalid size`);
  return readFile(path);
}

async function readJson(path, label) {
  const bytes = await readBounded(path, label);
  return JSON.parse(bytes.toString("utf8"));
}

function parseFlags(arguments_) {
  assert.equal(arguments_[0], "build", "only the build command is allowed");
  const flags = new Map();
  for (let index = 1; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    assert.match(name ?? "", /^--[a-z0-9-]+$/u, "invalid flag name");
    assert.notEqual(value, undefined, `missing value for ${name}`);
    assert.equal(flags.has(name), false, `duplicate flag ${name}`);
    flags.set(name, value);
  }
  return flags;
}

function requireFlag(flags, name) {
  const value = flags.get(name);
  assert.ok(value, `missing ${name}`);
  return value;
}

function verifyCheckout(sourceCommit) {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  assert.equal(head, sourceCommit, "checked-out HEAD must equal source commit");
  const trackedStatus = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { encoding: "utf8" },
  ).trim();
  assert.equal(trackedStatus, "", "tracked checkout must remain clean");
}

async function runCli() {
  const flags = parseFlags(process.argv.slice(2));
  const allowedFlags = new Set([
    "--collector-image-inspect",
    "--collector-image-reference",
    "--dockerfile",
    "--generated-at",
    "--live-tap",
    "--network-inspect",
    "--node-base-image-inspect",
    "--node-base-image-reference",
    "--output",
    "--package-lock",
    "--postgres-container-inspect",
    "--postgres-image-inspect",
    "--postgres-image-reference",
    "--ref",
    "--repository",
    "--run-attempt",
    "--run-id",
    "--runner-arch",
    "--runner-os",
    "--runtime-probe",
    "--source-commit",
    "--validator",
    "--worker-container-inspect",
    "--workflow",
  ]);
  for (const name of flags.keys()) {
    assert.ok(allowedFlags.has(name), `unknown flag ${name}`);
  }
  assert.equal(flags.size, allowedFlags.size, "all locked inputs are required");
  const sourceCommit = requireFlag(flags, "--source-commit");
  verifyCheckout(sourceCommit);
  const report = buildReachableRunnerEvidence({
    collectorImageInspect: await readJson(
      requireFlag(flags, "--collector-image-inspect"),
      "collector image inspect",
    ),
    collectorImageReference: requireFlag(flags, "--collector-image-reference"),
    dockerfileBytes: await readBounded(
      requireFlag(flags, "--dockerfile"),
      "Dockerfile",
    ),
    generatedAt: requireFlag(flags, "--generated-at"),
    liveTap: (await readBounded(requireFlag(flags, "--live-tap"), "live TAP")).toString("utf8"),
    networkInspect: await readJson(
      requireFlag(flags, "--network-inspect"),
      "network inspect",
    ),
    nodeBaseImageInspect: await readJson(
      requireFlag(flags, "--node-base-image-inspect"),
      "Node base image inspect",
    ),
    nodeBaseImageReference: requireFlag(flags, "--node-base-image-reference"),
    packageLockBytes: await readBounded(
      requireFlag(flags, "--package-lock"),
      "package lock",
    ),
    postgresContainerInspect: await readJson(
      requireFlag(flags, "--postgres-container-inspect"),
      "Postgres container inspect",
    ),
    postgresImageInspect: await readJson(
      requireFlag(flags, "--postgres-image-inspect"),
      "Postgres image inspect",
    ),
    postgresImageReference: requireFlag(flags, "--postgres-image-reference"),
    ref: requireFlag(flags, "--ref"),
    repository: requireFlag(flags, "--repository"),
    runAttempt: requireFlag(flags, "--run-attempt"),
    runId: requireFlag(flags, "--run-id"),
    runnerArch: requireFlag(flags, "--runner-arch"),
    runnerOs: requireFlag(flags, "--runner-os"),
    runtimeProbe: await readJson(
      requireFlag(flags, "--runtime-probe"),
      "runtime probe",
    ),
    sourceCommit,
    validatorBytes: await readBounded(
      requireFlag(flags, "--validator"),
      "validator",
    ),
    workerContainerInspect: await readJson(
      requireFlag(flags, "--worker-container-inspect"),
      "worker container inspect",
    ),
    workflowBytes: await readBounded(
      requireFlag(flags, "--workflow"),
      "workflow",
    ),
  });
  const output = resolve(requireFlag(flags, "--output"));
  await mkdir(dirname(output), { mode: 0o700, recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(`${report.status} ${report.evidenceDigest}\n`);
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli().catch((error) => {
    process.stderr.write(
      `M1_REACHABLE_RUNNER_PREFLIGHT_FAIL ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  });
}
