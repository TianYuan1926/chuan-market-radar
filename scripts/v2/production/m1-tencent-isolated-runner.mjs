import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, mkdir, mkdtemp, rm, statfs, writeFile } from "node:fs/promises";
import { homedir, arch, cpus, loadavg, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  B1A_BRANCH,
  B1A_BUILDX_IMAGE,
  B1A_NODE_BASE_IMAGE,
  B1A_POSTGRES_IMAGE,
  B1A_REPOSITORY,
  B1A_TENCENT_RUNNER_PROVIDER,
  B1A_WORKFLOW_PATH,
  buildReachableRunnerEvidence,
  classifyTencentHostSafetyValidationError,
  stableDigest,
  validateTencentHostSafety,
} from "./m1-reachable-runner-preflight.mjs";
import { buildFailureDiagnostic } from "./m1-reachable-runner-failure-diagnostic.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DOCKERFILE_PATH = "deploy/v2/m1-collector/Dockerfile";
const VALIDATOR_PATH =
  "scripts/v2/production/m1-reachable-runner-preflight.mjs";
const RUNNER_PATH =
  "scripts/v2/production/m1-tencent-isolated-runner.mjs";
const LIVE_TEST_PATH =
  ".tmp/market-tests/v2/modules/market-fact/collector/collector-live.integration.test.js";
const SCOPE_LABEL = "b1a2-isolated-preflight";
const BUILD_CPU_NANO = 1_500_000_000;
const BUILD_MEMORY_BYTES = 2 * 1024 * 1024 * 1024;
const BUILD_MEMORY_SWAP_BYTES = 3 * 1024 * 1024 * 1024;
const COMMAND_BUFFER_BYTES = 64 * 1024 * 1024;
const MAX_LIVE_TAP_BYTES = 5 * 1024 * 1024;
const DOCKER_FIELD_SEPARATOR = "|";
const DOCKER_HEALTH_FORMAT =
  '{{with (index .State "Health")}}{{.Status}}{{else}}none{{end}}';
const BUILDX_PLUGIN_PATH = join(
  homedir(),
  ".cache",
  "market-radar-v2",
  "docker-buildx",
);

class RunnerFailure extends Error {
  constructor(code, exitCode = 1) {
    super(code);
    this.code = code;
    this.exitCode = exitCode;
  }
}

function command(file, arguments_, options = {}) {
  const result = spawnSync(file, arguments_, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      HOME: homedir(),
      LANG: "C",
      LC_ALL: "C",
      PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    },
    maxBuffer: COMMAND_BUFFER_BYTES,
    timeout: options.timeout ?? 120_000,
  });
  if (result.error || result.status === null) {
    throw new RunnerFailure(options.failureCode ?? "COMMAND_EXECUTION_FAILED");
  }
  if (!options.allowFailure && result.status !== 0) {
    throw new RunnerFailure(
      options.failureCode ?? "COMMAND_EXITED_NONZERO",
      result.status,
    );
  }
  return {
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function docker(arguments_, options = {}) {
  return command(
    "sudo",
    ["-n", "env", `HOME=${homedir()}`, "docker", ...arguments_],
    options,
  );
}

async function assertNoDockerCredentialConfig() {
  try {
    await lstat(join(homedir(), ".docker", "config.json"));
    assert.fail("Docker credential config is forbidden for this public-only runner");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function lines(value) {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function splitDockerFormatRecord(value, expectedFieldCount, failureCode) {
  assert.equal(typeof value, "string");
  assert.ok(Number.isSafeInteger(expectedFieldCount) && expectedFieldCount > 0);
  assert.match(failureCode, /^[A-Z][A-Z0-9_]{2,95}$/u);
  const fields = value.split(DOCKER_FIELD_SEPARATOR);
  if (
    fields.length !== expectedFieldCount ||
    fields.some((field) => field.length === 0)
  ) {
    throw new RunnerFailure(failureCode);
  }
  return fields;
}

function imagePresent(reference) {
  return docker(["image", "inspect", reference], {
    allowFailure: true,
    failureCode: "IMAGE_INSPECT_FAILED",
  }).status === 0;
}

function containerPresent(name) {
  return docker(["container", "inspect", name], {
    allowFailure: true,
    failureCode: "CONTAINER_INSPECT_FAILED",
  }).status === 0;
}

function buildxPresent(name) {
  return docker(["buildx", "inspect", name], {
    allowFailure: true,
    failureCode: "BUILDER_INSPECT_FAILED",
  }).status === 0;
}

function runningContainerSnapshot() {
  const ids = lines(docker(["ps", "--quiet", "--no-trunc"], {
    failureCode: "CONTAINER_SNAPSHOT_FAILED",
  }).stdout);
  return ids.map((id) => {
    const output = docker([
      "inspect",
      "--format",
      `{{.Id}}|{{.Name}}|{{.Config.Image}}|{{.RestartCount}}|{{.State.StartedAt}}|${DOCKER_HEALTH_FORMAT}`,
      id,
    ], { failureCode: "CONTAINER_SNAPSHOT_FAILED" }).stdout.trim();
    const [containerId, rawName, image, restartCount, startedAt, health] =
      splitDockerFormatRecord(output, 6, "CONTAINER_SNAPSHOT_FAILED");
    return {
      health,
      id: containerId,
      image,
      name: rawName.replace(/^\//u, ""),
      restartCount: Number(restartCount),
      startedAt,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function networkSnapshot() {
  return lines(docker([
    "network",
    "ls",
    "--no-trunc",
    "--format",
    "{{.ID}}|{{.Name}}|{{.Driver}}|{{.Scope}}",
  ], { failureCode: "NETWORK_SNAPSHOT_FAILED" }).stdout).map((line) => {
    const [id, name, driver, scope] = splitDockerFormatRecord(
      line,
      4,
      "NETWORK_SNAPSHOT_FAILED",
    );
    return { driver, id, name, scope };
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function volumeSnapshot() {
  return lines(docker([
    "volume",
    "ls",
    "--format",
    "{{.Name}}|{{.Driver}}",
  ], { failureCode: "VOLUME_SNAPSHOT_FAILED" }).stdout).map((line) => {
    const [name, driver] = splitDockerFormatRecord(
      line,
      2,
      "VOLUME_SNAPSHOT_FAILED",
    );
    return { driver, name };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

function hostSnapshot() {
  return {
    containers: runningContainerSnapshot(),
    networks: networkSnapshot(),
    volumes: volumeSnapshot(),
  };
}

function proveTencentHostSafety(input) {
  try {
    return validateTencentHostSafety(input);
  } catch (error) {
    throw new RunnerFailure(classifyTencentHostSafetyValidationError(error));
  }
}

function namespaceResources(kind, runId) {
  const base = kind === "container"
    ? ["ps", "--all"]
    : [kind, "ls"];
  return lines(docker([
    ...base,
    "--filter",
    `label=market-radar.v2.run-id=${runId}`,
    "--format",
    kind === "container" ? "{{.Names}}" : "{{.Name}}",
  ], { failureCode: "NAMESPACE_INSPECT_FAILED" }).stdout).sort();
}

async function resourceSnapshot() {
  const memory = await readFile("/proc/meminfo", "utf8");
  const match = /^MemAvailable:\s+(\d+)\s+kB$/mu.exec(memory);
  assert.ok(match, "MemAvailable is required");
  const disk = await statfs(REPO_ROOT, { bigint: true });
  const diskAvailableBytes = Number(disk.bavail * disk.bsize);
  assert.ok(Number.isSafeInteger(diskAvailableBytes));
  return {
    cpuCount: cpus().length,
    diskAvailableBytes,
    load1: Number(loadavg()[0].toFixed(3)),
    memoryAvailableBytes: Number(match[1]) * 1024,
  };
}

function assertExactCheckout() {
  assert.equal(platform(), "linux", "Tencent runner must be Linux");
  assert.equal(arch(), "x64", "Tencent runner must be x64");
  const head = command("git", ["rev-parse", "HEAD"], {
    failureCode: "SOURCE_IDENTITY_FAILED",
  }).stdout.trim();
  assert.match(head, /^[0-9a-f]{40}$/u);
  assert.equal(command("git", ["status", "--porcelain"], {
    failureCode: "SOURCE_CLEANLINESS_FAILED",
  }).stdout.trim(), "", "source checkout must be clean");
  const origin = command("git", ["remote", "get-url", "origin"], {
    failureCode: "SOURCE_ORIGIN_FAILED",
  }).stdout.trim().replace(/\.git$/u, "");
  assert.ok(
    origin === `https://github.com/${B1A_REPOSITORY}` ||
      origin === `git@github.com:${B1A_REPOSITORY}`,
    "source origin is outside the locked repository",
  );
  return head;
}

function parseJson(text, code) {
  try {
    return JSON.parse(text);
  } catch {
    throw new RunnerFailure(code);
  }
}

function inspectJson(kind, reference, code) {
  return parseJson(
    docker([kind, "inspect", reference], { failureCode: code }).stdout,
    code,
  );
}

function removeDockerResources(names, imageState) {
  for (const name of [names.worker, names.postgres, names.buildxProof]) {
    docker(["rm", "--force", name], { allowFailure: true });
  }
  docker(["buildx", "rm", "--force", names.builder], {
    allowFailure: true,
  });
  docker(["rm", "--force", names.builderContainer], {
    allowFailure: true,
  });
  docker(["volume", "rm", `${names.builderContainer}_state`], {
    allowFailure: true,
  });
  for (const name of [names.egressNetwork, names.storageNetwork]) {
    docker(["network", "rm", name], { allowFailure: true });
  }
  if (!imageState.collectorPresentBefore) {
    docker(["image", "rm", "--force", names.collectorImage], {
      allowFailure: true,
    });
  }
  if (!imageState.nodeBasePresentBefore) {
    docker(["image", "rm", B1A_NODE_BASE_IMAGE], { allowFailure: true });
  }
  if (!imageState.postgresPresentBefore) {
    docker(["image", "rm", B1A_POSTGRES_IMAGE], { allowFailure: true });
  }
  if (!imageState.buildxPresentBefore) {
    docker(["image", "rm", B1A_BUILDX_IMAGE], { allowFailure: true });
  }
}

function cleanupSnapshot(names, runId, imageState) {
  return {
    builderPresentAfter:
      containerPresent(names.builderContainer) || buildxPresent(names.builder),
    buildxImagePresentAfter: imagePresent(B1A_BUILDX_IMAGE),
    buildxImagePresentBefore: imageState.buildxPresentBefore,
    collectorImagePresentAfter: imagePresent(names.collectorImage),
    collectorImagePresentBefore: imageState.collectorPresentBefore,
    namespaceContainersAfter: namespaceResources("container", runId),
    namespaceNetworksAfter: namespaceResources("network", runId),
    namespaceVolumesAfter: namespaceResources("volume", runId),
    nodeBaseImagePresentAfter: imagePresent(B1A_NODE_BASE_IMAGE),
    nodeBaseImagePresentBefore: imageState.nodeBasePresentBefore,
    postgresImagePresentAfter: imagePresent(B1A_POSTGRES_IMAGE),
    postgresImagePresentBefore: imageState.postgresPresentBefore,
  };
}

async function writeReport(report, evidenceRoot) {
  await mkdir(evidenceRoot, { recursive: true, mode: 0o700 });
  const digestHex = report.evidenceDigest.slice("sha256:".length);
  const path = join(evidenceRoot, `${report.status.toLowerCase()}-${digestHex}.json`);
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return path;
}

export function buildStageFailure({
  code,
  hostSafety,
  restorationCode,
  runId,
  sourceCommit,
}) {
  assert.match(code, /^[A-Z][A-Z0-9_]{2,95}$/u);
  if (restorationCode !== undefined) {
    assert.match(restorationCode, /^[A-Z][A-Z0-9_]{2,95}$/u);
  }
  const core = {
    diagnostic: {
      code,
      ...(restorationCode && restorationCode !== code
        ? { restorationCode }
        : {}),
    },
    generatedAt: new Date().toISOString(),
    runner: {
      architecture: "X64",
      id: runId,
      operatingSystem: "Linux",
      provider: B1A_TENCENT_RUNNER_PROVIDER,
    },
    schemaVersion: "v2-m1-tencent-isolated-runner-stage-failure.v1",
    scope: {
      automaticTradingAllowed: false,
      productionHostUsed: true,
      productionMutation: hostSafety ? false : "UNKNOWN",
      productionSecretsUsed: false,
      rawLogIncluded: false,
      tradingPlanGenerated: false,
    },
    source: {
      commit: sourceCommit,
      ref: `refs/heads/${B1A_BRANCH}`,
      repository: B1A_REPOSITORY,
    },
    status: "FAIL_TENCENT_ISOLATED_RUNNER",
    ...(hostSafety ? { hostSafety } : {}),
  };
  const evidenceDigest = stableDigest(core);
  return {
    ...core,
    evidenceDigest,
    evidenceId: `v2-m1-b1a2-failure:${evidenceDigest.slice("sha256:".length)}`,
  };
}

function stage(name) {
  process.stdout.write(`B1A2_STAGE ${name}\n`);
}

export function runnerNames(runId, sourceCommit) {
  assert.match(String(runId), /^[1-9][0-9]{9,15}$/u);
  assert.match(sourceCommit, /^[0-9a-f]{40}$/u);
  const builder = `v2m1b1a2${runId}`;
  return {
    builder,
    builderContainer: `buildx_buildkit_${builder}0`,
    buildxProof: `v2-m1-b1a-buildx-proof-${runId}`,
    collectorImage: `market-radar-v2-m1-collector:b1a-${sourceCommit}`,
    egressNetwork: `v2-m1-b1a-egress-${runId}`,
    postgres: `v2-m1-b1a-postgres-${runId}`,
    storageNetwork: `v2-m1-b1a-storage-${runId}`,
    worker: `v2-m1-b1a-worker-${runId}`,
  };
}

async function run() {
  assert.deepEqual(process.argv.slice(2), ["run"], "only the run command is allowed");
  command("sudo", ["-n", "true"], { failureCode: "SUDO_PREFLIGHT_FAILED" });
  await assertNoDockerCredentialConfig();
  docker(["info"], { failureCode: "DOCKER_PREFLIGHT_FAILED" });
  assert.match(
    docker(["buildx", "version"], {
      failureCode: "BUILDX_PREFLIGHT_FAILED",
    }).stdout,
    /\bv0\.31\.1\b/u,
  );

  const sourceCommit = assertExactCheckout();
  const runId = String(Date.now());
  const names = runnerNames(runId, sourceCommit);
  const cacheRoot = join(homedir(), ".cache", "market-radar-v2");
  const evidenceRoot = join(cacheRoot, "evidence", "b1a2");
  await mkdir(cacheRoot, { recursive: true, mode: 0o700 });
  const rawRoot = await mkdtemp(join(cacheRoot, "b1a2-raw-"));

  let before;
  let after;
  let resources;
  let hostSafetyInput;
  let hostSafetySummary;
  let runtimeEvidence;
  let runnerBinaryBytes;
  let runnerPluginBytes;
  let liveTap = "";
  let liveExitCode = 0;
  let failure;
  let restorationCode;
  const imageState = {
    collectorPresentBefore: imagePresent(names.collectorImage),
    buildxPresentBefore: imagePresent(B1A_BUILDX_IMAGE),
    nodeBasePresentBefore: imagePresent(B1A_NODE_BASE_IMAGE),
    postgresPresentBefore: imagePresent(B1A_POSTGRES_IMAGE),
  };

  try {
    assert.equal(
      imageState.collectorPresentBefore,
      false,
      "exact collector image must not preexist",
    );
    stage("LOCK_HOST_BASELINE");
    resources = await resourceSnapshot();
    before = hostSnapshot();
    proveTencentHostSafety({
      after: before,
      before,
      cleanup: {
        builderPresentAfter: false,
        buildxImagePresentAfter: imageState.buildxPresentBefore,
        buildxImagePresentBefore: imageState.buildxPresentBefore,
        collectorImagePresentAfter: false,
        collectorImagePresentBefore: false,
        namespaceContainersAfter: [],
        namespaceNetworksAfter: [],
        namespaceVolumesAfter: [],
        nodeBaseImagePresentAfter: imageState.nodeBasePresentBefore,
        nodeBaseImagePresentBefore: imageState.nodeBasePresentBefore,
        postgresImagePresentAfter: imageState.postgresPresentBefore,
        postgresImagePresentBefore: imageState.postgresPresentBefore,
      },
      executionLimits: {
        buildCpuNano: BUILD_CPU_NANO,
        buildMemoryBytes: BUILD_MEMORY_BYTES,
        buildMemorySwapBytes: BUILD_MEMORY_SWAP_BYTES,
      },
      resources,
    });

    stage("PULL_LOCKED_BASES");
    docker(["pull", B1A_NODE_BASE_IMAGE], {
      failureCode: "NODE_BASE_PULL_FAILED",
      timeout: 600_000,
    });
    docker(["pull", B1A_POSTGRES_IMAGE], {
      failureCode: "POSTGRES_BASE_PULL_FAILED",
      timeout: 600_000,
    });
    docker(["pull", B1A_BUILDX_IMAGE], {
      failureCode: "BUILDX_IMAGE_PULL_FAILED",
      timeout: 600_000,
    });

    stage("PROVE_PINNED_BUILDX_PLUGIN");
    runnerPluginBytes = await readFile(BUILDX_PLUGIN_PATH);
    docker([
      "create",
      "--name",
      names.buildxProof,
      "--label",
      `market-radar.v2.scope=${SCOPE_LABEL}`,
      "--label",
      `market-radar.v2.run-id=${runId}`,
      B1A_BUILDX_IMAGE,
      "/buildx",
      "version",
    ], { failureCode: "BUILDX_PROOF_CONTAINER_FAILED" });
    const pinnedPluginPath = join(rawRoot, "pinned-buildx");
    docker([
      "cp",
      `${names.buildxProof}:/buildx`,
      pinnedPluginPath,
    ], { failureCode: "BUILDX_PROOF_COPY_FAILED" });
    command("sudo", [
      "-n",
      "chown",
      `${process.getuid()}:${process.getgid()}`,
      pinnedPluginPath,
    ], { failureCode: "BUILDX_PROOF_OWNERSHIP_FAILED" });
    const pinnedPluginBytes = await readFile(pinnedPluginPath);
    assert.equal(
      createHash("sha256").update(runnerPluginBytes).digest("hex"),
      createHash("sha256").update(pinnedPluginBytes).digest("hex"),
    );
    docker(["rm", "--force", names.buildxProof], {
      failureCode: "BUILDX_PROOF_CONTAINER_REMOVE_FAILED",
    });

    stage("PROVE_PINNED_RUNNER_BINARY");
    runnerBinaryBytes = await readFile(process.execPath);
    const runnerBinaryDigest = createHash("sha256")
      .update(runnerBinaryBytes)
      .digest("hex");
    const pinnedBinaryDigest = docker([
      "run",
      "--rm",
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--entrypoint",
      "sha256sum",
      B1A_NODE_BASE_IMAGE,
      "/usr/local/bin/node",
    ], { failureCode: "RUNNER_BINARY_PROOF_FAILED" }).stdout.trim().split(/\s+/u)[0];
    assert.equal(runnerBinaryDigest, pinnedBinaryDigest);

    stage("BUILD_EXACT_LIMITED_IMAGE");
    docker(["buildx", "create", "--name", names.builder, "--driver", "docker-container"], {
      failureCode: "BUILDER_CREATE_FAILED",
    });
    docker(["buildx", "inspect", "--bootstrap", names.builder], {
      failureCode: "BUILDER_BOOTSTRAP_FAILED",
      timeout: 300_000,
    });
    docker([
      "update",
      "--cpus",
      String(BUILD_CPU_NANO / 1_000_000_000),
      "--memory",
      String(BUILD_MEMORY_BYTES),
      "--memory-swap",
      String(BUILD_MEMORY_SWAP_BYTES),
      names.builderContainer,
    ], { failureCode: "BUILDER_LIMIT_FAILED" });
    const buildLimitOutput = docker([
      "inspect",
      "--format",
      "{{.HostConfig.NanoCpus}}|{{.HostConfig.Memory}}|{{.HostConfig.MemorySwap}}",
      names.builderContainer,
    ], { failureCode: "BUILDER_LIMIT_INSPECT_FAILED" }).stdout.trim();
    const buildLimits = splitDockerFormatRecord(
      buildLimitOutput,
      3,
      "BUILDER_LIMIT_INSPECT_FAILED",
    ).map(Number);
    assert.deepEqual(buildLimits, [
      BUILD_CPU_NANO,
      BUILD_MEMORY_BYTES,
      BUILD_MEMORY_SWAP_BYTES,
    ]);
    docker([
      "buildx",
      "build",
      "--builder",
      names.builder,
      "--pull",
      "--load",
      "--build-arg",
      `V2_M1_COLLECTOR_SOURCE_COMMIT=${sourceCommit}`,
      "--file",
      DOCKERFILE_PATH,
      "--tag",
      names.collectorImage,
      ".",
    ], { failureCode: "COLLECTOR_BUILD_FAILED", timeout: 1_800_000 });
    docker(["buildx", "rm", "--force", names.builder], {
      failureCode: "BUILDER_REMOVE_FAILED",
      timeout: 300_000,
    });

    const collectorImageInspect = inspectJson(
      "image",
      names.collectorImage,
      "COLLECTOR_IMAGE_INSPECT_FAILED",
    );
    const nodeBaseImageInspect = inspectJson(
      "image",
      B1A_NODE_BASE_IMAGE,
      "NODE_IMAGE_INSPECT_FAILED",
    );
    const postgresImageInspect = inspectJson(
      "image",
      B1A_POSTGRES_IMAGE,
      "POSTGRES_IMAGE_INSPECT_FAILED",
    );
    const buildxImageInspect = inspectJson(
      "image",
      B1A_BUILDX_IMAGE,
      "BUILDX_IMAGE_INSPECT_FAILED",
    );

    stage("PROVE_MINIMAL_RUNTIME");
    const probeProgram = 'const fs=require("node:fs");const required=["/app/.tmp/market-tests/v2/entrypoints/m1-collector-worker.js","/app/.tmp/market-tests/v2/modules/market-fact/collector/collector-live.integration.test.js"];const forbidden=["/app/.env","/app/.git","/app/deploy","/app/scripts","/app/src"];const paths=Object.fromEntries([...required,...forbidden].map((path)=>[path,fs.existsSync(path)]));process.stdout.write(JSON.stringify({cwd:process.cwd(),gid:process.getgid(),paths,uid:process.getuid()}));';
    const runtimeProbe = parseJson(docker([
      "run",
      "--rm",
      "--network",
      "none",
      "--read-only",
      "--user",
      "1000:1000",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "32",
      "--memory",
      "128m",
      "--cpus",
      "0.25",
      "--entrypoint",
      "node",
      names.collectorImage,
      "-e",
      probeProgram,
    ], { failureCode: "RUNTIME_PROBE_FAILED" }).stdout, "RUNTIME_PROBE_INVALID");

    stage("START_EPHEMERAL_STORAGE");
    for (const [name, internal] of [
      [names.storageNetwork, true],
      [names.egressNetwork, false],
    ]) {
      docker([
        "network",
        "create",
        ...(internal ? ["--internal"] : []),
        "--label",
        `market-radar.v2.scope=${SCOPE_LABEL}`,
        "--label",
        `market-radar.v2.run-id=${runId}`,
        name,
      ], { failureCode: "NETWORK_CREATE_FAILED" });
    }
    docker([
      "run",
      "--detach",
      "--name",
      names.postgres,
      "--label",
      `market-radar.v2.scope=${SCOPE_LABEL}`,
      "--label",
      `market-radar.v2.run-id=${runId}`,
      "--network",
      names.storageNetwork,
      "--network-alias",
      "v2-m1-postgres",
      "--restart",
      "no",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "128",
      "--memory",
      "384m",
      "--cpus",
      "0.5",
      "--tmpfs",
      "/var/lib/postgresql/data:rw,noexec,nosuid,nodev,size=512m",
      "--tmpfs",
      "/var/run/postgresql:rw,nosuid,nodev,size=16m",
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "--env",
      "POSTGRES_DB=v2_m1_b1a",
      "--health-cmd",
      "pg_isready -U postgres -d v2_m1_b1a",
      "--health-interval",
      "2s",
      "--health-timeout",
      "2s",
      "--health-retries",
      "60",
      B1A_POSTGRES_IMAGE,
    ], { failureCode: "POSTGRES_START_FAILED" });
    let postgresHealthy = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const health = docker([
        "inspect",
        "--format",
        "{{.State.Health.Status}}",
        names.postgres,
      ], { failureCode: "POSTGRES_HEALTH_FAILED" }).stdout.trim();
      if (health === "healthy") {
        postgresHealthy = true;
        break;
      }
      assert.notEqual(health, "unhealthy");
      await new Promise((done) => setTimeout(done, 2_000));
    }
    assert.equal(postgresHealthy, true, "ephemeral Postgres did not become healthy");

    stage("RUN_TWO_LIVE_THREE_VENUE_CYCLES");
    const databaseUrl = [
      "postgresql:",
      "",
      "postgres@v2-m1-postgres:5432",
      "v2_m1_b1a",
    ].join("/");
    docker([
      "create",
      "--name",
      names.worker,
      "--label",
      `market-radar.v2.scope=${SCOPE_LABEL}`,
      "--label",
      `market-radar.v2.run-id=${runId}`,
      "--network",
      names.storageNetwork,
      "--read-only",
      "--user",
      "1000:1000",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "128",
      "--memory",
      "512m",
      "--cpus",
      "0.75",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,nodev,size=32m,uid=1000,gid=1000,mode=0700",
      "--env",
      "V2_M1_LIVE_REHEARSAL=1",
      "--env",
      `V2_M1_REHEARSAL_SOURCE_COMMIT=${sourceCommit}`,
      "--env",
      `V2_M1_REHEARSAL_DATABASE_URL=${databaseUrl}`,
      "--entrypoint",
      "node",
      names.collectorImage,
      "--test",
      "--test-reporter=tap",
      LIVE_TEST_PATH,
    ], { failureCode: "WORKER_CREATE_FAILED" });
    docker(["network", "connect", names.egressNetwork, names.worker], {
      failureCode: "WORKER_EGRESS_CONNECT_FAILED",
    });
    const live = docker(["start", "--attach", names.worker], {
      allowFailure: true,
      failureCode: "LIVE_COLLECTOR_FAILED",
      timeout: 600_000,
    });
    liveExitCode = live.status;
    liveTap = `${live.stdout}${live.stderr}`;
    assert.ok(Buffer.byteLength(liveTap) <= MAX_LIVE_TAP_BYTES);
    await writeFile(join(rawRoot, "live.tap"), liveTap, {
      encoding: "utf8",
      mode: 0o600,
    });
    runtimeEvidence = {
      collectorImageInspect,
      buildxImageInspect,
      networkInspect: inspectJson(
        "network",
        names.storageNetwork,
        "NETWORK_INSPECT_FAILED",
      ).concat(inspectJson(
        "network",
        names.egressNetwork,
        "NETWORK_INSPECT_FAILED",
      )),
      nodeBaseImageInspect,
      postgresContainerInspect: inspectJson(
        "container",
        names.postgres,
        "POSTGRES_CONTAINER_INSPECT_FAILED",
      ),
      postgresImageInspect,
      runtimeProbe,
      workerContainerInspect: inspectJson(
        "container",
        names.worker,
        "WORKER_CONTAINER_INSPECT_FAILED",
      ),
    };
    if (liveExitCode !== 0) {
      throw new RunnerFailure("LIVE_COLLECTOR_FAILED", liveExitCode);
    }
  } catch (error) {
    failure = error instanceof RunnerFailure
      ? error
      : new RunnerFailure("UNCLASSIFIED_EXECUTION_FAILURE");
  }

  stage("RESTORE_EXACT_HOST_STATE");
  removeDockerResources(names, imageState);
  try {
    after = hostSnapshot();
    hostSafetyInput = {
      after,
      before,
      cleanup: cleanupSnapshot(names, runId, imageState),
      executionLimits: {
        buildCpuNano: BUILD_CPU_NANO,
        buildMemoryBytes: BUILD_MEMORY_BYTES,
        buildMemorySwapBytes: BUILD_MEMORY_SWAP_BYTES,
      },
      resources,
    };
    hostSafetySummary = proveTencentHostSafety(hostSafetyInput);
  } catch {
    restorationCode = "HOST_RESTORATION_NOT_PROVEN";
    failure ??= new RunnerFailure(restorationCode);
    hostSafetySummary = null;
  }

  try {
    await rm(rawRoot, { force: true, recursive: true });
  } catch {
    failure = new RunnerFailure("RAW_EVIDENCE_CLEANUP_FAILED");
  }

  let report;
  if (failure) {
    if (
      failure.code === "LIVE_COLLECTOR_FAILED" &&
      liveTap.length > 0 &&
      hostSafetySummary
    ) {
      report = buildFailureDiagnostic({
        exitCode: Math.max(1, liveExitCode),
        generatedAt: new Date().toISOString(),
        hostSafety: hostSafetyInput,
        liveTap,
        ref: `refs/heads/${B1A_BRANCH}`,
        repository: B1A_REPOSITORY,
        runAttempt: 1,
        runId,
        runnerProvider: B1A_TENCENT_RUNNER_PROVIDER,
        sourceCommit,
      });
    } else {
      report = buildStageFailure({
        code: failure.code,
        hostSafety: hostSafetySummary,
        restorationCode,
        runId,
        sourceCommit,
      });
    }
  } else {
    stage("BUILD_SANITIZED_EVIDENCE");
    try {
      report = buildReachableRunnerEvidence({
        ...runtimeEvidence,
        collectorImageReference: names.collectorImage,
        dockerfileBytes: await readFile(join(REPO_ROOT, DOCKERFILE_PATH)),
        generatedAt: new Date().toISOString(),
        hostSafety: hostSafetyInput,
        liveTap,
        nodeBaseImageReference: B1A_NODE_BASE_IMAGE,
        packageLockBytes: await readFile(join(REPO_ROOT, "package-lock.json")),
        postgresImageReference: B1A_POSTGRES_IMAGE,
        ref: `refs/heads/${B1A_BRANCH}`,
        repository: B1A_REPOSITORY,
        runAttempt: "1",
        runId,
        runnerArch: "X64",
        runnerBinaryBytes,
        runnerContractBytes: await readFile(join(REPO_ROOT, RUNNER_PATH)),
        runnerPluginBytes,
        runnerOs: "Linux",
        runnerProvider: B1A_TENCENT_RUNNER_PROVIDER,
        sourceCommit,
        validatorBytes: await readFile(join(REPO_ROOT, VALIDATOR_PATH)),
        workflowBytes: await readFile(join(REPO_ROOT, B1A_WORKFLOW_PATH)),
      });
    } catch {
      failure = new RunnerFailure("EVIDENCE_VALIDATION_FAILED");
      report = buildStageFailure({
        code: failure.code,
        hostSafety: hostSafetySummary,
        restorationCode,
        runId,
        sourceCommit,
      });
    }
  }

  const reportPath = await writeReport(report, evidenceRoot);
  process.stdout.write(
    `${report.status} ${report.evidenceDigest} ${reportPath}\n`,
  );
  if (failure) {
    process.exitCode = 1;
  }
}

export {
  BUILDX_PLUGIN_PATH,
  BUILD_CPU_NANO,
  BUILD_MEMORY_BYTES,
  BUILD_MEMORY_SWAP_BYTES,
  RunnerFailure,
  assertExactCheckout,
  assertNoDockerCredentialConfig,
  buildxPresent,
  cleanupSnapshot,
  command,
  containerPresent,
  docker,
  hostSnapshot,
  imagePresent,
  inspectJson,
  parseJson,
  proveTencentHostSafety,
  removeDockerResources,
  resourceSnapshot,
  writeReport,
};

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  run().catch((error) => {
    process.stderr.write(
      `M1_TENCENT_ISOLATED_RUNNER_FATAL ${
        error instanceof RunnerFailure ? error.code : "UNCLASSIFIED_FATAL"
      }\n`,
    );
    process.exitCode = 1;
  });
}
