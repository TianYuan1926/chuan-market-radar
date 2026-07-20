import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  B1A_BRANCH,
  B1A_BUILDX_IMAGE,
  B1A_NODE_BASE_IMAGE,
  B1A_POSTGRES_IMAGE,
  B1A_REPOSITORY,
  B1A_TENCENT_RUNNER_PROVIDER,
} from "./m1-reachable-runner-preflight.mjs";
import {
  B1B_RELEASE_PREFIX,
  B1B_SCOPE_LABEL,
  buildEarlyShadowRunnerEvidence,
  buildEarlyShadowRunnerFailure,
} from "./m1-early-shadow-runner-evidence.mjs";
import {
  BUILDX_PLUGIN_PATH,
  BUILD_CPU_NANO,
  BUILD_MEMORY_BYTES,
  BUILD_MEMORY_SWAP_BYTES,
  RunnerFailure,
  assertExactCheckout,
  assertNoDockerCredentialConfig,
  cleanupSnapshot,
  command,
  docker,
  hostSnapshot,
  imagePresent,
  inspectJson,
  parseJson,
  proveTencentHostSafety,
  removeDockerResources,
  resourceSnapshot,
  writeReport,
} from "./m1-tencent-isolated-runner.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DOCKERFILE_PATH = "deploy/v2/m1-collector/Dockerfile";
const VALIDATOR_PATH =
  "scripts/v2/production/m1-early-shadow-runner-evidence.mjs";
const RUNNER_PATH =
  "scripts/v2/production/m1-tencent-early-shadow-runner.mjs";
const EARLY_SHADOW_REPORT_PATH =
  ".tmp/market-tests/v2/entrypoints/m1-collector-early-shadow-report.js";
const MAX_PROCESS_OUTPUT_BYTES = 32 * 1024 * 1024;
const WORKER_TIMEOUT_MS = 45 * 60 * 1_000;

function stage(name) {
  process.stdout.write(`B1B1_STAGE ${name}\n`);
}

export function earlyShadowRunnerNames(runId, sourceCommit) {
  assert.match(String(runId), /^[1-9][0-9]{9,15}$/u);
  assert.match(sourceCommit, /^[0-9a-f]{40}$/u);
  const builder = `v2m1b1b${runId}`;
  return {
    builder,
    builderContainer: `buildx_buildkit_${builder}0`,
    buildxProof: `v2-m1-b1b-buildx-proof-${runId}`,
    collectorImage: `market-radar-v2-m1-collector:b1b-${sourceCommit}`,
    egressNetwork: `v2-m1-b1b-egress-${runId}`,
    postgres: `v2-m1-b1b-postgres-${runId}`,
    storageNetwork: `v2-m1-b1b-storage-${runId}`,
    worker: `v2-m1-b1b-worker-${runId}`,
  };
}

export function parseEarlyShadowRunnerArguments(arguments_) {
  assert.deepEqual(
    Object.keys(arguments_),
    arguments_.map((_, index) => String(index)),
  );
  assert.equal(arguments_.length, 2, "run and exact source commit are required");
  assert.equal(arguments_[0], "run", "only the run command is allowed");
  const expectedSourceCommit = arguments_[1];
  assert.equal(typeof expectedSourceCommit, "string");
  assert.match(expectedSourceCommit, /^[0-9a-f]{40}$/u);
  return expectedSourceCommit;
}

export function earlyShadowWorkerEnvironment(input) {
  assert.match(input.sourceCommit, /^[0-9a-f]{40}$/u);
  assert.equal(
    input.releaseId,
    `${B1B_RELEASE_PREFIX}:${input.sourceCommit}`,
    "early-shadow release must bind the exact source commit",
  );
  return Object.freeze([
    "NODE_ENV=production",
    "V2_M1_COLLECTOR_AUTHORITY_MODE=NO_AUTHORITY",
    "V2_M1_COLLECTOR_AUTOMATIC_TRADING_ALLOWED=false",
    `V2_M1_COLLECTOR_SOURCE_COMMIT=${input.sourceCommit}`,
    `V2_M1_COLLECTOR_RELEASE_ID=${input.releaseId}`,
    "V2_M1_COLLECTOR_POLICY_VERSION=m1-live-linear-usdt-perpetual.v1",
    "V2_M1_COLLECTOR_RUN_PROFILE=EARLY_30_MINUTES",
    "V2_M1_COLLECTOR_DATABASE_HOST=v2-m1-postgres",
    "V2_M1_COLLECTOR_DATABASE_NAME=v2_m1_b1b",
    "V2_M1_COLLECTOR_CYCLE_INTERVAL_MS=60000",
    "V2_M1_COLLECTOR_MAX_CYCLES=31",
    "V2_M1_COLLECTOR_MAX_FACT_AGE_MS=60000",
    "V2_M1_COLLECTOR_MAX_SEQUENCE_GAP_MS=300000",
    "V2_M1_COLLECTOR_RECONCILIATION_INTERVAL_MS=3600000",
    "V2_M1_COLLECTOR_RETENTION_MS=604800000",
    "V2_M1_COLLECTOR_WRITER_DATABASE_URL_FILE=/run/secrets/v2_m1_writer_database_url",
    "V2_M1_COLLECTOR_READER_DATABASE_URL_FILE=/run/secrets/v2_m1_reader_database_url",
  ]);
}

async function waitForPostgres(name) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const health = docker([
      "inspect",
      "--format",
      "{{.State.Health.Status}}",
      name,
    ], { failureCode: "POSTGRES_HEALTH_FAILED" }).stdout.trim();
    if (health === "healthy") {
      return;
    }
    if (health === "unhealthy") {
      throw new RunnerFailure("POSTGRES_UNHEALTHY");
    }
    await new Promise((done) => setTimeout(done, 2_000));
  }
  throw new RunnerFailure("POSTGRES_HEALTH_TIMEOUT");
}

function bootstrapProgram() {
  return [
    'const {Pool}=require("pg");',
    'const {M1_STORE_IDENTITIES}=require("./.tmp/market-tests/v2/modules/market-fact/store/contracts.js");',
    'const {M1_STORE_POSTGRES_MIGRATION_SQL,M1_STORE_POSTGRES_SCHEMA}=require("./.tmp/market-tests/v2/modules/market-fact/store/postgres-schema.js");',
    'const {M1_COLLECTOR_CHECKPOINT_POSTGRES_MIGRATION_SQL}=require("./.tmp/market-tests/v2/modules/market-fact/collector/checkpoint-postgres-schema.js");',
    'const {M1_FACT_RETENTION_IDENTITY}=require("./.tmp/market-tests/v2/modules/market-fact/store/partitioned-fact-contract.js");',
    'const {M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL}=require("./.tmp/market-tests/v2/modules/market-fact/store/partitioned-fact-postgres-schema.js");',
    'async function main(){const pool=new Pool({connectionString:process.env.BOOTSTRAP_DATABASE_URL,max:1});try{await pool.query(M1_STORE_POSTGRES_MIGRATION_SQL);await pool.query(M1_COLLECTOR_CHECKPOINT_POSTGRES_MIGRATION_SQL);await pool.query(M1_PARTITIONED_FACT_POSTGRES_MIGRATION_SQL);await pool.query(`SET ROLE ${M1_FACT_RETENTION_IDENTITY}; SELECT * FROM ${M1_STORE_POSTGRES_SCHEMA}.ensure_market_fact_partitions((clock_timestamp() AT TIME ZONE \'UTC\')::date,((clock_timestamp() AT TIME ZONE \'UTC\')::date + 1),\'m1-5-b1b-isolated\'); RESET ROLE;`);await pool.query(`CREATE ROLE v2_m1_b1b_writer_login LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; CREATE ROLE v2_m1_b1b_reader_login LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; GRANT ${M1_STORE_IDENTITIES.writer} TO v2_m1_b1b_writer_login; GRANT ${M1_STORE_IDENTITIES.reader} TO v2_m1_b1b_reader_login;`);}finally{await pool.end();}}',
    'main().catch(()=>{process.exitCode=1;});',
  ].join("");
}

async function writeContentAddressedObject(root, name, bytes) {
  assert.match(name, /^[a-z0-9-]+\.jsonl$/u);
  const path = join(root, name);
  try {
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
    const existing = await readFile(path);
    assert.equal(
      createHash("sha256").update(existing).digest("hex"),
      createHash("sha256").update(bytes).digest("hex"),
      "content-addressed evidence object conflicts with existing bytes",
    );
  }
  return path;
}

function observationBytesFromProcessOutput(processOutputBytes) {
  const output = processOutputBytes.toString("utf8");
  assert.equal(output.endsWith("\n"), true);
  const lines = output.slice(0, -1).split("\n");
  assert.equal(lines.length, 32);
  return Buffer.from(`${lines.slice(0, 31).join("\n")}\n`);
}

export async function runEarlyShadow() {
  const expectedSourceCommit = parseEarlyShadowRunnerArguments(
    process.argv.slice(2),
  );
  command("sudo", ["-n", "true"], { failureCode: "SUDO_PREFLIGHT_FAILED" });
  await assertNoDockerCredentialConfig();
  docker(["info"], { failureCode: "DOCKER_PREFLIGHT_FAILED" });
  assert.match(
    docker(["buildx", "version"], {
      failureCode: "BUILDX_PREFLIGHT_FAILED",
    }).stdout,
    /\bv0\.31\.1\b/u,
  );

  let sourceCommit = "0".repeat(40);
  let runId = String(Date.now());
  let names = earlyShadowRunnerNames(runId, sourceCommit);
  const cacheRoot = join(homedir(), ".cache", "market-radar-v2");
  const evidenceRoot = join(cacheRoot, "evidence", "b1b1");
  await mkdir(cacheRoot, { recursive: true, mode: 0o700 });
  const rawRoot = await mkdtemp(join(cacheRoot, "b1b1-raw-"));

  let before;
  let resources;
  let hostSafetyInput;
  let hostSafetySummary;
  let runtimeEvidence;
  let processOutputBytes;
  let observationBytes;
  let domainEvidence;
  let runnerBinaryBytes;
  let runnerPluginBytes;
  let failure;
  let restorationCode;
  const imageState = {
    buildxPresentBefore: imagePresent(B1A_BUILDX_IMAGE),
    collectorPresentBefore: false,
    nodeBasePresentBefore: imagePresent(B1A_NODE_BASE_IMAGE),
    postgresPresentBefore: imagePresent(B1A_POSTGRES_IMAGE),
  };

  try {
    sourceCommit = assertExactCheckout();
    if (sourceCommit !== expectedSourceCommit) {
      throw new RunnerFailure("SOURCE_COMMIT_BINDING_FAILED");
    }
    runId = String(Date.now());
    names = earlyShadowRunnerNames(runId, sourceCommit);
    imageState.collectorPresentBefore = imagePresent(names.collectorImage);
    assert.equal(imageState.collectorPresentBefore, false);
    const releaseId = `${B1B_RELEASE_PREFIX}:${sourceCommit}`;

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
    for (const image of [
      B1A_NODE_BASE_IMAGE,
      B1A_POSTGRES_IMAGE,
      B1A_BUILDX_IMAGE,
    ]) {
      docker(["pull", image], {
        failureCode: "LOCKED_IMAGE_PULL_FAILED",
        timeout: 600_000,
      });
    }

    stage("PROVE_PINNED_TOOLCHAIN");
    runnerPluginBytes = await readFile(BUILDX_PLUGIN_PATH);
    docker([
      "create",
      "--name",
      names.buildxProof,
      "--label",
      `market-radar.v2.scope=${B1B_SCOPE_LABEL}`,
      "--label",
      `market-radar.v2.run-id=${runId}`,
      B1A_BUILDX_IMAGE,
      "/buildx",
      "version",
    ], { failureCode: "BUILDX_PROOF_CONTAINER_FAILED" });
    const pinnedPluginPath = join(rawRoot, "pinned-buildx");
    docker(["cp", `${names.buildxProof}:/buildx`, pinnedPluginPath], {
      failureCode: "BUILDX_PROOF_COPY_FAILED",
    });
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
      failureCode: "BUILDX_PROOF_REMOVE_FAILED",
    });
    runnerBinaryBytes = await readFile(process.execPath);
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
    assert.equal(
      createHash("sha256").update(runnerBinaryBytes).digest("hex"),
      pinnedBinaryDigest,
    );

    stage("BUILD_EXACT_LIMITED_IMAGE");
    docker([
      "buildx", "create", "--name", names.builder,
      "--driver", "docker-container",
    ], { failureCode: "BUILDER_CREATE_FAILED" });
    docker(["buildx", "inspect", "--bootstrap", names.builder], {
      failureCode: "BUILDER_BOOTSTRAP_FAILED",
      timeout: 300_000,
    });
    docker([
      "update",
      "--cpus", String(BUILD_CPU_NANO / 1_000_000_000),
      "--memory", String(BUILD_MEMORY_BYTES),
      "--memory-swap", String(BUILD_MEMORY_SWAP_BYTES),
      names.builderContainer,
    ], { failureCode: "BUILDER_LIMIT_FAILED" });
    docker([
      "buildx", "build",
      "--builder", names.builder,
      "--pull",
      "--load",
      "--build-arg", `V2_M1_COLLECTOR_SOURCE_COMMIT=${sourceCommit}`,
      "--file", DOCKERFILE_PATH,
      "--tag", names.collectorImage,
      ".",
    ], { failureCode: "COLLECTOR_BUILD_FAILED", timeout: 1_800_000 });
    docker(["buildx", "rm", "--force", names.builder], {
      failureCode: "BUILDER_REMOVE_FAILED",
      timeout: 300_000,
    });

    const requiredPaths = [
      "/app/.tmp/market-tests/v2/entrypoints/m1-collector-worker.js",
      "/app/.tmp/market-tests/v2/entrypoints/m1-collector-early-shadow-report.js",
    ];
    const forbiddenPaths = [
      "/app/.env", "/app/.git", "/app/deploy", "/app/scripts", "/app/src",
    ];
    const probeProgram = `const fs=require("node:fs");const paths=Object.fromEntries(${JSON.stringify([...requiredPaths, ...forbiddenPaths])}.map((path)=>[path,fs.existsSync(path)]));process.stdout.write(JSON.stringify({cwd:process.cwd(),gid:process.getgid(),paths,uid:process.getuid()}));`;
    const runtimeProbe = parseJson(docker([
      "run", "--rm", "--network", "none", "--read-only",
      "--user", "1000:1000", "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges", "--pids-limit", "32",
      "--memory", "128m", "--cpus", "0.25", "--entrypoint", "node",
      names.collectorImage, "-e", probeProgram,
    ], { failureCode: "RUNTIME_PROBE_FAILED" }).stdout, "RUNTIME_PROBE_INVALID");

    stage("START_EPHEMERAL_STORAGE");
    for (const [name, internal] of [
      [names.storageNetwork, true],
      [names.egressNetwork, false],
    ]) {
      docker([
        "network", "create", ...(internal ? ["--internal"] : []),
        "--label", `market-radar.v2.scope=${B1B_SCOPE_LABEL}`,
        "--label", `market-radar.v2.run-id=${runId}`,
        name,
      ], { failureCode: "NETWORK_CREATE_FAILED" });
    }
    docker([
      "run", "--detach", "--name", names.postgres,
      "--label", `market-radar.v2.scope=${B1B_SCOPE_LABEL}`,
      "--label", `market-radar.v2.run-id=${runId}`,
      "--network", names.storageNetwork,
      "--network-alias", "v2-m1-postgres",
      "--restart", "no",
      "--security-opt", "no-new-privileges",
      "--pids-limit", "128", "--memory", "384m", "--cpus", "0.5",
      "--tmpfs", "/var/lib/postgresql/data:rw,noexec,nosuid,nodev,size=512m",
      "--tmpfs", "/var/run/postgresql:rw,nosuid,nodev,size=16m",
      "--env", "POSTGRES_HOST_AUTH_METHOD=trust",
      "--env", "POSTGRES_DB=v2_m1_b1b",
      "--health-cmd", "pg_isready -U postgres -d v2_m1_b1b",
      "--health-interval", "2s", "--health-timeout", "2s",
      "--health-retries", "60", B1A_POSTGRES_IMAGE,
    ], { failureCode: "POSTGRES_START_FAILED" });
    await waitForPostgres(names.postgres);

    stage("BOOTSTRAP_EPHEMERAL_SCHEMA_AND_IDENTITIES");
    const adminDatabaseUrl = [
      "postgresql:", "", "postgres@v2-m1-postgres:5432", "v2_m1_b1b",
    ].join("/");
    docker([
      "run", "--rm", "--network", names.storageNetwork,
      "--read-only", "--user", "1000:1000", "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges", "--pids-limit", "64",
      "--memory", "256m", "--cpus", "0.5",
      "--env", `BOOTSTRAP_DATABASE_URL=${adminDatabaseUrl}`,
      "--entrypoint", "node", names.collectorImage,
      "-e", bootstrapProgram(),
    ], { failureCode: "EPHEMERAL_SCHEMA_BOOTSTRAP_FAILED", timeout: 300_000 });

    const writerSecretPath = join(rawRoot, "writer-url");
    const readerSecretPath = join(rawRoot, "reader-url");
    const writerPassword = randomBytes(32).toString("hex");
    const readerPassword = randomBytes(32).toString("hex");
    await writeFile(
      writerSecretPath,
      `postgresql://v2_m1_b1b_writer_login:${writerPassword}@v2-m1-postgres:5432/v2_m1_b1b\n`,
      { mode: 0o600 },
    );
    await writeFile(
      readerSecretPath,
      `postgresql://v2_m1_b1b_reader_login:${readerPassword}@v2-m1-postgres:5432/v2_m1_b1b\n`,
      { mode: 0o600 },
    );

    stage("RUN_ATOMIC_31_CYCLE_SHADOW");
    const environment = earlyShadowWorkerEnvironment({
      releaseId,
      sourceCommit,
    });
    const createWorker = [
      "create", "--name", names.worker,
      "--label", `market-radar.v2.scope=${B1B_SCOPE_LABEL}`,
      "--label", `market-radar.v2.run-id=${runId}`,
      "--network", names.storageNetwork,
      "--restart", "no",
      "--read-only", "--user", "1000:1000", "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges", "--pids-limit", "128",
      "--memory", "512m", "--cpus", "0.75",
      "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=32m,uid=1000,gid=1000,mode=0700",
      "--mount", `type=bind,src=${writerSecretPath},dst=/run/secrets/v2_m1_writer_database_url,readonly`,
      "--mount", `type=bind,src=${readerSecretPath},dst=/run/secrets/v2_m1_reader_database_url,readonly`,
      ...environment.flatMap((value) => ["--env", value]),
      names.collectorImage,
    ];
    docker(createWorker, { failureCode: "WORKER_CREATE_FAILED" });
    docker(["network", "connect", names.egressNetwork, names.worker], {
      failureCode: "WORKER_EGRESS_CONNECT_FAILED",
    });
    const workerResult = docker(["start", "--attach", names.worker], {
      allowFailure: true,
      failureCode: "EARLY_SHADOW_WORKER_FAILED",
      timeout: WORKER_TIMEOUT_MS,
    });
    if (workerResult.status !== 0) {
      throw new RunnerFailure("EARLY_SHADOW_WORKER_FAILED", workerResult.status);
    }
    assert.equal(workerResult.stderr, "");
    processOutputBytes = Buffer.from(workerResult.stdout);
    assert.ok(
      processOutputBytes.length > 0 &&
        processOutputBytes.length <= MAX_PROCESS_OUTPUT_BYTES,
    );
    const processOutputPath = join(rawRoot, "process-output.jsonl");
    await writeFile(processOutputPath, processOutputBytes, { mode: 0o600 });
    observationBytes = observationBytesFromProcessOutput(processOutputBytes);

    stage("BUILD_DOMAIN_EVIDENCE");
    const domainResult = docker([
      "run", "--rm", "--network", "none", "--read-only",
      "--user", "1000:1000", "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges", "--pids-limit", "64",
      "--memory", "256m", "--cpus", "0.5",
      "--mount", `type=bind,src=${processOutputPath},dst=/evidence/process-output.jsonl,readonly`,
      "--entrypoint", "node", names.collectorImage,
      EARLY_SHADOW_REPORT_PATH,
      "--input", "/evidence/process-output.jsonl",
      "--release-id", releaseId,
    ], { failureCode: "DOMAIN_EVIDENCE_BUILD_FAILED", timeout: 120_000 });
    assert.equal(domainResult.stderr, "");
    const domainOutput = domainResult.stdout.trim();
    assert.equal(domainOutput.includes("\n"), false);
    domainEvidence = parseJson(domainOutput, "DOMAIN_EVIDENCE_INVALID");

    runtimeEvidence = {
      buildxImageInspect: inspectJson(
        "image", B1A_BUILDX_IMAGE, "BUILDX_IMAGE_INSPECT_FAILED",
      ),
      collectorImageInspect: inspectJson(
        "image", names.collectorImage, "COLLECTOR_IMAGE_INSPECT_FAILED",
      ),
      networkInspect: inspectJson(
        "network", names.storageNetwork, "NETWORK_INSPECT_FAILED",
      ).concat(inspectJson(
        "network", names.egressNetwork, "NETWORK_INSPECT_FAILED",
      )),
      nodeBaseImageInspect: inspectJson(
        "image", B1A_NODE_BASE_IMAGE, "NODE_IMAGE_INSPECT_FAILED",
      ),
      postgresContainerInspect: inspectJson(
        "container", names.postgres, "POSTGRES_CONTAINER_INSPECT_FAILED",
      ),
      postgresImageInspect: inspectJson(
        "image", B1A_POSTGRES_IMAGE, "POSTGRES_IMAGE_INSPECT_FAILED",
      ),
      runtimeProbe,
      workerContainerInspect: inspectJson(
        "container", names.worker, "WORKER_CONTAINER_INSPECT_FAILED",
      ),
    };
  } catch (error) {
    failure = error instanceof RunnerFailure
      ? error
      : new RunnerFailure("UNCLASSIFIED_EARLY_SHADOW_FAILURE");
  }

  stage("RESTORE_EXACT_HOST_STATE");
  removeDockerResources(names, imageState);
  try {
    const after = hostSnapshot();
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
    hostSafetySummary = null;
    restorationCode = "HOST_RESTORATION_NOT_PROVEN";
    failure ??= new RunnerFailure(restorationCode);
  }

  try {
    await rm(rawRoot, { force: true, recursive: true });
  } catch {
    failure ??= new RunnerFailure("RAW_EVIDENCE_CLEANUP_FAILED");
  }

  let report;
  if (!failure) {
    stage("BUILD_SANITIZED_EVIDENCE");
    try {
      report = buildEarlyShadowRunnerEvidence({
        ...runtimeEvidence,
        collectorImageReference: names.collectorImage,
        dockerfileBytes: await readFile(join(REPO_ROOT, DOCKERFILE_PATH)),
        domainEvidence,
        generatedAt: new Date().toISOString(),
        hostSafety: hostSafetyInput,
        observationBytes,
        packageLockBytes: await readFile(join(REPO_ROOT, "package-lock.json")),
        processOutputBytes,
        ref: `refs/heads/${B1A_BRANCH}`,
        releaseId: `${B1B_RELEASE_PREFIX}:${sourceCommit}`,
        repository: B1A_REPOSITORY,
        runId,
        runnerBinaryBytes,
        runnerContractBytes: await readFile(join(REPO_ROOT, RUNNER_PATH)),
        runnerPluginBytes,
        runnerProvider: B1A_TENCENT_RUNNER_PROVIDER,
        sourceCommit,
        validatorBytes: await readFile(join(REPO_ROOT, VALIDATOR_PATH)),
      });
    } catch {
      failure = new RunnerFailure("SANITIZED_EVIDENCE_VALIDATION_FAILED");
    }
  }
  if (failure) {
    report = buildEarlyShadowRunnerFailure({
      code: failure.code,
      generatedAt: new Date().toISOString(),
      hostSafety: hostSafetySummary === null ? null : hostSafetyInput,
      restorationCode,
      runId,
      sourceCommit,
    });
  }

  await mkdir(evidenceRoot, { recursive: true, mode: 0o700 });
  if (!failure) {
    await writeContentAddressedObject(
      evidenceRoot,
      report.artifacts.observationObjectName,
      observationBytes,
    );
    await writeContentAddressedObject(
      evidenceRoot,
      report.artifacts.processOutputObjectName,
      processOutputBytes,
    );
  }
  const reportPath = await writeReport(report, evidenceRoot);
  process.stdout.write(
    `${report.status} ${report.evidenceDigest} ${reportPath}\n`,
  );
  if (failure) {
    process.exitCode = 1;
  } else if (report.businessGateConclusion !== "PASS") {
    process.exitCode = 2;
  }
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runEarlyShadow().catch((error) => {
    process.stderr.write(
      `M1_TENCENT_EARLY_SHADOW_FATAL ${
        error instanceof RunnerFailure ? error.code : "UNCLASSIFIED_FATAL"
      }\n`,
    );
    process.exitCode = 1;
  });
}
