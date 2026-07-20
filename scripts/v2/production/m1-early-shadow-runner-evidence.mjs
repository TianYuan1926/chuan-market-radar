import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import {
  B1A_BRANCH,
  B1A_BUILDX_IMAGE,
  B1A_NODE_BASE_IMAGE,
  B1A_POSTGRES_IMAGE,
  B1A_REPOSITORY,
  B1A_TENCENT_RUNNER_PROVIDER,
  stableDigest,
  validateTencentHostSafety,
} from "./m1-reachable-runner-preflight.mjs";

export const B1B_EVIDENCE_SCHEMA_VERSION =
  "v2-m1-early-shadow-runner-evidence.v1";
export const B1B_SCOPE_LABEL = "b1b-isolated-early-shadow";
export const B1B_RELEASE_PREFIX = "m1-5-b1b";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const MAX_PROCESS_OUTPUT_BYTES = 32 * 1024 * 1024;
const EXPECTED_ENTRYPOINT = [
  "node",
  ".tmp/market-tests/v2/entrypoints/m1-collector-worker.js",
];
const TARGET_VENUES = [
  "BINANCE_FUTURES",
  "BYBIT_LINEAR_PERPETUAL",
  "OKX_SWAP",
];
const REQUIRED_RUNTIME_PATHS = [
  "/app/.tmp/market-tests/v2/entrypoints/m1-collector-worker.js",
  "/app/.tmp/market-tests/v2/entrypoints/m1-collector-early-shadow-report.js",
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

function byteDigest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function parseCanonicalJsonLine(line, label) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    assert.fail(`${label} must be valid JSON`);
  }
  assert.equal(JSON.stringify(parsed), line, `${label} must be canonical JSON`);
  assert.ok(isRecord(parsed), `${label} must be an object`);
  return parsed;
}

function validateRawArtifacts(input) {
  assert.ok(Buffer.isBuffer(input.processOutputBytes));
  assert.ok(Buffer.isBuffer(input.observationBytes));
  assert.ok(
    input.processOutputBytes.length > 0 &&
      input.processOutputBytes.length <= MAX_PROCESS_OUTPUT_BYTES,
  );
  assert.ok(
    input.observationBytes.length > 0 &&
      input.observationBytes.length < input.processOutputBytes.length,
  );
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const processOutput = decoder.decode(input.processOutputBytes);
  assert.equal(processOutput.endsWith("\n"), true);
  assert.equal(processOutput.includes("\r"), false);
  const lines = processOutput.slice(0, -1).split("\n");
  assert.equal(lines.length, 32, "process output must contain exactly 32 lines");
  assert.equal(lines.some((line) => line.length === 0), false);
  const canonicalObservations = `${lines.slice(0, 31).join("\n")}\n`;
  assert.equal(
    input.observationBytes.equals(Buffer.from(canonicalObservations)),
    true,
    "observation artifact must be the exact first 31 process lines",
  );

  const workerRunIds = new Set();
  const runtimeConfigDigests = new Set();
  for (const [index, line] of lines.slice(0, 31).entries()) {
    const observation = parseCanonicalJsonLine(line, `observation ${index + 1}`);
    assert.deepEqual(
      Object.keys(observation).sort(),
      ["cycle", "event", "schemaVersion"],
    );
    assert.equal(observation.event, "M1_COLLECTOR_CYCLE");
    assert.equal(
      observation.schemaVersion,
      "v2-m1-collector-observation-log.v1",
    );
    assert.ok(isRecord(observation.cycle));
    assert.equal(observation.cycle.authorityMode, "NO_AUTHORITY");
    assert.equal(observation.cycle.automaticTradingAllowed, false);
    assert.equal(observation.cycle.cycleIndex, index + 1);
    assert.equal(observation.cycle.releaseId, input.releaseId);
    assert.equal(
      observation.cycle.schemaVersion,
      "v2-m1-collector-worker-cycle.v1",
    );
    assert.match(observation.cycle.runtimeConfigDigest, SHA256_PATTERN);
    assert.equal(typeof observation.cycle.workerRunId, "string");
    assert.ok(observation.cycle.workerRunId.length > 0);
    workerRunIds.add(observation.cycle.workerRunId);
    runtimeConfigDigests.add(observation.cycle.runtimeConfigDigest);
  }
  assert.equal(workerRunIds.size, 1);
  assert.equal(runtimeConfigDigests.size, 1);

  const summary = parseCanonicalJsonLine(lines[31], "process summary");
  assert.deepEqual(Object.keys(summary).sort(), [
    "authorityMode",
    "automaticTradingAllowed",
    "contractVersion",
    "cycleCount",
    "exitCode",
    "releaseId",
    "restore",
    "runProfile",
    "status",
    "stopReason",
  ]);
  assert.equal(summary.authorityMode, "NO_AUTHORITY");
  assert.equal(summary.automaticTradingAllowed, false);
  assert.equal(summary.contractVersion, "v2-m1-collector-process.v1");
  assert.equal(summary.cycleCount, 31);
  assert.equal(summary.exitCode, 0);
  assert.equal(summary.releaseId, input.releaseId);
  assert.deepEqual(summary.restore, { checkpointId: null, status: "COLD_START" });
  assert.equal(summary.runProfile, "EARLY_30_MINUTES");
  assert.equal(summary.status, "COMPLETED");
  assert.equal(summary.stopReason, "MAX_CYCLES_REACHED");
  return {
    runtimeConfigDigest: [...runtimeConfigDigests][0],
    summary,
    workerRunId: [...workerRunIds][0],
  };
}

function oneInspect(value, label) {
  assert.ok(Array.isArray(value), `${label} must be a Docker inspect array`);
  assert.equal(value.length, 1, `${label} must contain one object`);
  assert.ok(isRecord(value[0]), `${label} object is invalid`);
  return value[0];
}

function environmentMap(value, label) {
  assert.ok(Array.isArray(value), `${label} environment must be an array`);
  const result = new Map();
  for (const entry of value) {
    assert.equal(typeof entry, "string");
    const separator = entry.indexOf("=");
    assert.ok(separator > 0, `${label} environment entry is invalid`);
    const name = entry.slice(0, separator);
    assert.equal(result.has(name), false, `${label} environment is duplicated`);
    result.set(name, entry.slice(separator + 1));
  }
  return result;
}

function assertNoPublishedPorts(inspect, label) {
  const bindings = inspect.HostConfig?.PortBindings;
  assert.ok(
    bindings === null || bindings === undefined ||
      (isRecord(bindings) && Object.keys(bindings).length === 0),
    `${label} must not publish host ports`,
  );
}

function validateImage(input) {
  const image = oneInspect(input.collectorImageInspect, "collector image");
  assert.match(image.Id, SHA256_PATTERN);
  assert.equal(image.Os, "linux");
  assert.equal(image.Architecture, "amd64");
  assert.equal(image.Config?.User, "node");
  assert.deepEqual(image.Config?.Entrypoint, EXPECTED_ENTRYPOINT);
  assert.equal(
    image.Config?.Labels?.["org.opencontainers.image.revision"],
    input.sourceCommit,
  );
  assert.equal(
    input.collectorImageReference,
    `market-radar-v2-m1-collector:b1b-${input.sourceCommit}`,
  );
  const environment = environmentMap(image.Config?.Env, "collector image");
  for (const name of environment.keys()) {
    assert.equal(
      /(SECRET|TOKEN|PASSWORD|API_KEY|DATABASE_URL|CRON|REDIS)/u.test(name),
      false,
      `collector image embeds capability environment ${name}`,
    );
  }
  return image.Id;
}

function validatePinnedImage(inspectValue, reference, label) {
  const image = oneInspect(inspectValue, label);
  assert.match(image.Id, SHA256_PATTERN);
  assert.equal(image.Os, "linux");
  assert.equal(image.Architecture, "amd64");
  const expectedDigest = reference.slice(reference.indexOf("@"));
  assert.ok(
    (image.RepoDigests ?? []).some((digestValue) =>
      digestValue.endsWith(expectedDigest)
    ),
    `${label} does not resolve the locked digest`,
  );
  return image.Id;
}

function validateRuntimeProbe(probe) {
  assert.ok(isRecord(probe));
  assert.equal(probe.cwd, "/app");
  assert.equal(probe.uid, 1000);
  assert.equal(probe.gid, 1000);
  assert.ok(isRecord(probe.paths));
  for (const path of REQUIRED_RUNTIME_PATHS) {
    assert.equal(probe.paths[path], true, `runtime image is missing ${path}`);
  }
  for (const path of FORBIDDEN_RUNTIME_PATHS) {
    assert.equal(probe.paths[path], false, `runtime image contains ${path}`);
  }
  assert.deepEqual(
    Object.keys(probe.paths).sort(),
    [...REQUIRED_RUNTIME_PATHS, ...FORBIDDEN_RUNTIME_PATHS].sort(),
  );
  return { cwd: probe.cwd, gid: probe.gid, paths: probe.paths, uid: probe.uid };
}

function validateWorker(input) {
  const worker = oneInspect(input.workerContainerInspect, "worker");
  assert.equal(worker.Config?.Image, input.collectorImageReference);
  assert.equal(worker.Config?.User, "1000:1000");
  assert.deepEqual(worker.Config?.Entrypoint, EXPECTED_ENTRYPOINT);
  assert.ok(
    worker.Config?.Cmd === null ||
      (Array.isArray(worker.Config?.Cmd) && worker.Config.Cmd.length === 0),
  );
  assert.equal(worker.HostConfig?.ReadonlyRootfs, true);
  assert.equal(worker.HostConfig?.Privileged, false);
  assert.deepEqual(worker.HostConfig?.CapDrop, ["ALL"]);
  assert.ok(worker.HostConfig?.SecurityOpt?.includes("no-new-privileges"));
  assert.equal(worker.HostConfig?.PidsLimit, 128);
  assert.equal(worker.HostConfig?.Memory, 512 * 1024 * 1024);
  assert.equal(worker.HostConfig?.NanoCpus, 750_000_000);
  assert.equal(worker.HostConfig?.RestartPolicy?.Name, "no");
  assert.equal(worker.State?.Status, "exited");
  assert.equal(worker.State?.ExitCode, 0);
  assertNoPublishedPorts(worker, "worker");
  assert.ok(isRecord(worker.HostConfig?.Tmpfs));
  assert.ok("/tmp" in worker.HostConfig.Tmpfs);
  assert.equal(
    worker.Config?.Labels?.["market-radar.v2.scope"],
    B1B_SCOPE_LABEL,
  );
  assert.equal(
    worker.Config?.Labels?.["market-radar.v2.run-id"],
    String(input.runId),
  );

  const environment = environmentMap(worker.Config?.Env, "worker");
  const expected = new Map([
    ["NODE_ENV", "production"],
    ["V2_M1_COLLECTOR_AUTHORITY_MODE", "NO_AUTHORITY"],
    ["V2_M1_COLLECTOR_AUTOMATIC_TRADING_ALLOWED", "false"],
    ["V2_M1_COLLECTOR_SOURCE_COMMIT", input.sourceCommit],
    ["V2_M1_COLLECTOR_RELEASE_ID", input.releaseId],
    ["V2_M1_COLLECTOR_POLICY_VERSION", "m1-live-linear-usdt-perpetual.v1"],
    ["V2_M1_COLLECTOR_RUN_PROFILE", "EARLY_30_MINUTES"],
    ["V2_M1_COLLECTOR_DATABASE_HOST", "v2-m1-postgres"],
    ["V2_M1_COLLECTOR_DATABASE_NAME", "v2_m1_b1b"],
    ["V2_M1_COLLECTOR_CYCLE_INTERVAL_MS", "60000"],
    ["V2_M1_COLLECTOR_MAX_CYCLES", "31"],
    ["V2_M1_COLLECTOR_MAX_FACT_AGE_MS", "60000"],
    ["V2_M1_COLLECTOR_MAX_SEQUENCE_GAP_MS", "300000"],
    ["V2_M1_COLLECTOR_RECONCILIATION_INTERVAL_MS", "86400000"],
    ["V2_M1_COLLECTOR_RETENTION_MS", "604800000"],
    [
      "V2_M1_COLLECTOR_WRITER_DATABASE_URL_FILE",
      "/run/secrets/v2_m1_writer_database_url",
    ],
    [
      "V2_M1_COLLECTOR_READER_DATABASE_URL_FILE",
      "/run/secrets/v2_m1_reader_database_url",
    ],
  ]);
  for (const [name, value] of expected) {
    assert.equal(environment.get(name), value, `worker ${name} drifted`);
  }
  for (const forbidden of [
    "V2_M1_COLLECTOR_WRITER_DATABASE_URL",
    "V2_M1_COLLECTOR_READER_DATABASE_URL",
    "CRON_SECRET",
    "REDIS_URL",
    "COINGLASS_API_KEY",
  ]) {
    assert.equal(environment.has(forbidden), false);
  }
  for (const name of environment.keys()) {
    if (/(SECRET|TOKEN|PASSWORD|API_KEY|DATABASE_URL|CRON|REDIS)/u.test(name)) {
      assert.ok(
        name === "V2_M1_COLLECTOR_WRITER_DATABASE_URL_FILE" ||
          name === "V2_M1_COLLECTOR_READER_DATABASE_URL_FILE",
        `worker embeds forbidden capability environment ${name}`,
      );
    }
  }

  const secretDestinations = (worker.Mounts ?? [])
    .filter((mount) => mount.Type === "bind")
    .map((mount) => ({ destination: mount.Destination, readWrite: mount.RW }))
    .sort((left, right) => left.destination.localeCompare(right.destination));
  assert.deepEqual(secretDestinations, [
    {
      destination: "/run/secrets/v2_m1_reader_database_url",
      readWrite: false,
    },
    {
      destination: "/run/secrets/v2_m1_writer_database_url",
      readWrite: false,
    },
  ]);
  const networks = Object.keys(worker.NetworkSettings?.Networks ?? {}).sort();
  assert.equal(networks.length, 2);
  assert.ok(networks.some((name) => name.startsWith("v2-m1-b1b-egress-")));
  assert.ok(networks.some((name) => name.startsWith("v2-m1-b1b-storage-")));
  return { networks, secretDestinations };
}

function validatePostgres(input, workerNetworks) {
  const postgres = oneInspect(input.postgresContainerInspect, "Postgres");
  assert.equal(postgres.Config?.Image, B1A_POSTGRES_IMAGE);
  assert.equal(postgres.HostConfig?.Privileged, false);
  assert.equal(postgres.HostConfig?.RestartPolicy?.Name, "no");
  assert.equal(postgres.State?.Running, true);
  assert.equal(postgres.State?.Health?.Status, "healthy");
  assert.equal(postgres.HostConfig?.Memory, 384 * 1024 * 1024);
  assert.equal(postgres.HostConfig?.NanoCpus, 500_000_000);
  assert.equal(postgres.HostConfig?.PidsLimit, 128);
  assert.ok(postgres.HostConfig?.SecurityOpt?.includes("no-new-privileges"));
  assert.ok(isRecord(postgres.HostConfig?.Tmpfs));
  assert.ok("/var/lib/postgresql/data" in postgres.HostConfig.Tmpfs);
  assert.ok("/var/run/postgresql" in postgres.HostConfig.Tmpfs);
  assertNoPublishedPorts(postgres, "Postgres");
  assert.equal((postgres.Mounts ?? []).some((mount) => mount.Type === "bind"), false);
  const networks = Object.keys(postgres.NetworkSettings?.Networks ?? {});
  assert.equal(networks.length, 1);
  assert.ok(networks[0].startsWith("v2-m1-b1b-storage-"));
  assert.ok(workerNetworks.includes(networks[0]));
  const environment = environmentMap(postgres.Config?.Env, "Postgres");
  assert.equal(environment.get("POSTGRES_HOST_AUTH_METHOD"), "trust");
  assert.equal(environment.get("POSTGRES_DB"), "v2_m1_b1b");
  assert.equal(environment.has("POSTGRES_PASSWORD"), false);
  assert.equal(
    postgres.Config?.Labels?.["market-radar.v2.scope"],
    B1B_SCOPE_LABEL,
  );
  assert.equal(
    postgres.Config?.Labels?.["market-radar.v2.run-id"],
    String(input.runId),
  );
  return networks[0];
}

function validateNetworks(input) {
  assert.ok(Array.isArray(input.networkInspect));
  assert.equal(input.networkInspect.length, 2);
  const networks = input.networkInspect.map((network) => {
    assert.ok(isRecord(network));
    assert.equal(network.Driver, "bridge");
    assert.equal(network.Attachable, false);
    assert.equal(
      network.Labels?.["market-radar.v2.scope"],
      B1B_SCOPE_LABEL,
    );
    assert.equal(
      network.Labels?.["market-radar.v2.run-id"],
      String(input.runId),
    );
    assert.ok(
      network.Name.startsWith("v2-m1-b1b-storage-") ||
        network.Name.startsWith("v2-m1-b1b-egress-"),
    );
    return { internal: network.Internal, name: network.Name };
  }).sort((left, right) => left.name.localeCompare(right.name));
  assert.equal(networks.filter((network) => network.internal).length, 1);
  assert.equal(networks.filter((network) => !network.internal).length, 1);
  return networks;
}

function validateDomainEvidence(input, rawArtifacts) {
  const evidence = input.domainEvidence;
  assert.ok(isRecord(evidence));
  assert.match(evidence.evidenceDigest, SHA256_PATTERN);
  const { evidenceDigest, evidenceId, ...core } = evidence;
  assert.equal(evidenceDigest, stableDigest(core));
  assert.equal(
    evidenceId,
    `v2-m1-b1b0:${evidenceDigest.slice("sha256:".length)}`,
  );
  assert.equal(
    evidence.schemaVersion,
    "v2-m1-collector-early-shadow-evidence.v1",
  );
  assert.equal(evidence.authorityMode, "NO_AUTHORITY");
  assert.equal(evidence.automaticTradingAllowed, false);
  assert.equal(evidence.releaseId, input.releaseId);
  assert.equal(evidence.capture?.cycleCount, 31);
  assert.equal(evidence.process?.cycleCount, 31);
  assert.equal(evidence.process?.runProfile, "EARLY_30_MINUTES");
  assert.equal(evidence.businessGate?.m1ExitClaimed, false);
  assert.ok(["PASS", "FAIL"].includes(evidence.businessGate?.conclusion));
  assert.notEqual(evidence.slo?.conclusion, "INSUFFICIENT_EVIDENCE");
  assert.equal(
    evidence.businessGate?.conclusion,
    evidence.slo?.conclusion,
  );
  assert.equal(
    evidence.businessGate?.earlyShadowSloPassed,
    evidence.businessGate?.conclusion === "PASS",
  );
  assert.equal(
    evidence.status,
    evidence.businessGate?.conclusion === "PASS"
      ? "CAPTURE_COMPLETE_BUSINESS_PASS"
      : "CAPTURE_COMPLETE_BUSINESS_FAIL",
  );
  assert.equal(
    evidence.sourceArtifacts?.processOutputDigest,
    byteDigest(input.processOutputBytes),
  );
  assert.equal(
    evidence.sourceArtifacts?.processOutputBytes,
    input.processOutputBytes.length,
  );
  assert.equal(
    evidence.sourceArtifacts?.observationDigest,
    byteDigest(input.observationBytes),
  );
  assert.equal(
    evidence.sourceArtifacts?.observationBytes,
    input.observationBytes.length,
  );
  assert.deepEqual(evidence.process, rawArtifacts.summary);
  assert.equal(evidence.capture?.workerRunId, rawArtifacts.workerRunId);
  assert.equal(evidence.runtimeConfigDigest, rawArtifacts.runtimeConfigDigest);
  assert.deepEqual(
    evidence.capture?.venues?.map((venue) => venue.venue),
    TARGET_VENUES,
  );
  return evidence;
}

export function verifyEarlyShadowRunnerEvidence(report) {
  assert.ok(isRecord(report));
  assert.match(report.evidenceDigest, SHA256_PATTERN);
  const { evidenceDigest, evidenceId, ...core } = report;
  assert.equal(evidenceDigest, stableDigest(core));
  assert.equal(
    evidenceId,
    `v2-m1-b1b1:${evidenceDigest.slice("sha256:".length)}`,
  );
  assert.equal(report.schemaVersion, B1B_EVIDENCE_SCHEMA_VERSION);
  assert.equal(report.executionConclusion, "PASS_31_CYCLE_CAPTURE");
  assert.equal(report.scope.authorityMode, "NO_AUTHORITY");
  assert.equal(report.scope.automaticTradingAllowed, false);
  assert.equal(report.scope.productionMutation, false);
  assert.equal(report.scope.productionDependenciesUsed, false);
  assert.equal(report.scope.productionSecretsUsed, false);
  assert.equal(report.scope.candidateRuntimePresent, false);
  assert.equal(report.scope.m1ExitClaimed, false);
  assert.equal(report.hostSafety.exactDockerStateRestored, true);
  assert.equal(
    report.hostSafety.baselineDigest,
    report.hostSafety.postCleanupDigest,
  );
  const businessPass = report.businessGateConclusion === "PASS";
  assert.equal(
    report.status,
    businessPass
      ? "PASS_EARLY_SHADOW_BUSINESS_GATE"
      : "CAPTURE_COMPLETE_BUSINESS_FAIL",
  );
  assert.equal(report.domainEvidence.businessGate.conclusion, report.businessGateConclusion);
  assert.equal(report.scope.earlyShadowSloPassed, businessPass);
  return report;
}

export function buildEarlyShadowRunnerEvidence(input) {
  assert.match(input.sourceCommit, COMMIT_PATTERN);
  assert.equal(input.repository, B1A_REPOSITORY);
  assert.equal(input.ref, `refs/heads/${B1A_BRANCH}`);
  assert.equal(input.runnerProvider, B1A_TENCENT_RUNNER_PROVIDER);
  assert.match(String(input.runId), /^[1-9][0-9]{9,15}$/u);
  assert.equal(new Date(input.generatedAt).toISOString(), input.generatedAt);
  assert.equal(input.releaseId, `${B1B_RELEASE_PREFIX}:${input.sourceCommit}`);
  assert.ok(Buffer.isBuffer(input.processOutputBytes));
  assert.ok(Buffer.isBuffer(input.observationBytes));
  const rawArtifacts = validateRawArtifacts(input);
  const domainEvidence = validateDomainEvidence(input, rawArtifacts);
  const collectorImageId = validateImage(input);
  const runtimeProbe = validateRuntimeProbe(input.runtimeProbe);
  const nodeBaseImageId = validatePinnedImage(
    input.nodeBaseImageInspect,
    B1A_NODE_BASE_IMAGE,
    "Node base image",
  );
  const postgresImageId = validatePinnedImage(
    input.postgresImageInspect,
    B1A_POSTGRES_IMAGE,
    "Postgres image",
  );
  const buildxImageId = validatePinnedImage(
    input.buildxImageInspect,
    B1A_BUILDX_IMAGE,
    "Buildx image",
  );
  for (const [value, label] of [
    [input.runnerBinaryBytes, "runner binary"],
    [input.runnerPluginBytes, "runner plugin"],
  ]) {
    assert.ok(Buffer.isBuffer(value) && value.length > 0, `${label} is required`);
  }
  const worker = validateWorker(input);
  const postgresNetwork = validatePostgres(input, worker.networks);
  const networks = validateNetworks(input);
  assert.ok(networks.some((network) => network.name === postgresNetwork));
  const hostSafety = validateTencentHostSafety(input.hostSafety);
  const businessGateConclusion = domainEvidence.businessGate.conclusion;
  const core = {
    artifacts: {
      domainEvidenceDigest: domainEvidence.evidenceDigest,
      observationBytes: input.observationBytes.length,
      observationDigest: byteDigest(input.observationBytes),
      observationObjectName:
        `observations-${byteDigest(input.observationBytes).slice("sha256:".length)}.jsonl`,
      processOutputBytes: input.processOutputBytes.length,
      processOutputDigest: byteDigest(input.processOutputBytes),
      processOutputObjectName:
        `process-output-${byteDigest(input.processOutputBytes).slice("sha256:".length)}.jsonl`,
    },
    businessGateConclusion,
    domainEvidence,
    executionConclusion: "PASS_31_CYCLE_CAPTURE",
    generatedAt: input.generatedAt,
    hostSafety,
    releaseId: input.releaseId,
    runner: {
      architecture: "X64",
      id: String(input.runId),
      operatingSystem: "Linux",
      provider: input.runnerProvider,
    },
    schemaVersion: B1B_EVIDENCE_SCHEMA_VERSION,
    scope: {
      authorityMode: "NO_AUTHORITY",
      automaticTradingAllowed: false,
      candidateRuntimePresent: false,
      databaseMigrationAppliedToProduction: false,
      earlyShadowSloPassed: businessGateConclusion === "PASS",
      m1ExitClaimed: false,
      productionDependenciesUsed: false,
      productionHostUsed: true,
      productionMutation: false,
      productionNetworkUsed: false,
      productionSecretsUsed: false,
      tradingPlanGenerated: false,
    },
    source: {
      commit: input.sourceCommit,
      ref: input.ref,
      repository: input.repository,
      trackedCheckoutClean: true,
    },
    status: businessGateConclusion === "PASS"
      ? "PASS_EARLY_SHADOW_BUSINESS_GATE"
      : "CAPTURE_COMPLETE_BUSINESS_FAIL",
    supplyChain: {
      buildxImageReference: B1A_BUILDX_IMAGE,
      buildxImageId,
      collectorImageId,
      collectorImageReference: input.collectorImageReference,
      dockerfileDigest: byteDigest(input.dockerfileBytes),
      nodeBaseImageReference: B1A_NODE_BASE_IMAGE,
      nodeBaseImageId,
      packageLockDigest: byteDigest(input.packageLockBytes),
      postgresImageReference: B1A_POSTGRES_IMAGE,
      postgresImageId,
      runnerBinaryDigest: byteDigest(input.runnerBinaryBytes),
      runnerContractDigest: byteDigest(input.runnerContractBytes),
      runnerPluginDigest: byteDigest(input.runnerPluginBytes),
      validatorDigest: byteDigest(input.validatorBytes),
    },
    runtimeBoundary: {
      networks,
      runtimeProbe,
      secretDestinations: worker.secretDestinations,
    },
  };
  const evidenceDigest = stableDigest(core);
  return verifyEarlyShadowRunnerEvidence({
    ...core,
    evidenceDigest,
    evidenceId: `v2-m1-b1b1:${evidenceDigest.slice("sha256:".length)}`,
  });
}

export function buildEarlyShadowRunnerFailure(input) {
  assert.match(input.code, /^[A-Z][A-Z0-9_]{2,95}$/u);
  assert.match(input.sourceCommit, COMMIT_PATTERN);
  assert.match(String(input.runId), /^[1-9][0-9]{9,15}$/u);
  assert.equal(new Date(input.generatedAt).toISOString(), input.generatedAt);
  if (input.restorationCode !== undefined) {
    assert.match(input.restorationCode, /^[A-Z][A-Z0-9_]{2,95}$/u);
  }
  const hostSafety = input.hostSafety === null
    ? null
    : validateTencentHostSafety(input.hostSafety);
  const core = {
    diagnostic: {
      code: input.code,
      ...(input.restorationCode !== undefined &&
          input.restorationCode !== input.code
        ? { restorationCode: input.restorationCode }
        : {}),
    },
    generatedAt: input.generatedAt,
    runner: {
      id: String(input.runId),
      provider: B1A_TENCENT_RUNNER_PROVIDER,
    },
    schemaVersion: "v2-m1-early-shadow-runner-failure.v1",
    scope: {
      authorityMode: "NO_AUTHORITY",
      automaticTradingAllowed: false,
      productionMutation: hostSafety === null ? "UNKNOWN" : false,
      productionSecretsUsed: false,
      rawLogIncluded: false,
    },
    source: {
      commit: input.sourceCommit,
      ref: `refs/heads/${B1A_BRANCH}`,
      repository: B1A_REPOSITORY,
    },
    status: "FAIL_EARLY_SHADOW_RUNNER",
    ...(hostSafety === null ? {} : { hostSafety }),
  };
  const evidenceDigest = stableDigest(core);
  return {
    ...core,
    evidenceDigest,
    evidenceId:
      `v2-m1-b1b1-failure:${evidenceDigest.slice("sha256:".length)}`,
  };
}
