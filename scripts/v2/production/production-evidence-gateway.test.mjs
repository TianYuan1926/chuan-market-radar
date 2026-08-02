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
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  generateSigningKeyPair,
  prepareDispatch,
  sha256,
  validateOutbox,
} from "./fixed-channel/production-dispatch.mjs";
import {
  evidenceObjectName,
  generateEvidenceRecipientKeyPair,
  openProductionEvidence,
  readSealedEvidenceFile,
} from "./fixed-channel/production-evidence-channel.mjs";
import {
  buildProductionEvidenceGatewayBundle,
} from "./production-evidence-gateway-bundle.mjs";
import {
  PRODUCTION_EVIDENCE_GATEWAY_ENTRYPOINT,
  PRODUCTION_EVIDENCE_GATEWAY_PACKAGE_ID,
  PRODUCTION_EVIDENCE_GATEWAY_RESULT_SCHEMA,
  PRODUCTION_EVIDENCE_GATEWAY_SOURCE_FILES,
  PRODUCTION_EVIDENCE_GATEWAY_SUCCESS_MARKER,
  ProductionEvidenceGatewayError,
  readBoundedProductionEvidenceGatewayFile,
  runProductionEvidenceGateway,
  validateProductionEvidenceGatewayRequest,
} from "./production-evidence-gateway.mjs";
import {
  prepareProductionEvidenceGatewayRelease,
} from "./production-evidence-gateway-release.mjs";

const execFileAsync = promisify(execFile);
const NOW = new Date("2026-08-02T06:00:00.000Z");
const SOURCE_COMMIT = "a".repeat(40);
const SOURCE_TREE = "b".repeat(40);
const PRODUCTION_HEAD = "c".repeat(40);
const CADDY_IMAGE = `sha256:${"d".repeat(64)}`;
const BASELINE_CADDYFILE = `{$CHUAN_PUBLIC_HOST} {\n\treverse_proxy web:3000\n}\n`;
const BASELINE_COMPOSE = "services:\n  caddy:\n    image: caddy:2-alpine\n";

function gatewayReason(reason) {
  return (error) => error instanceof ProductionEvidenceGatewayError
    && error.reason === reason;
}

function containerFixture() {
  const names = [
    "chuan-market-radar-caddy-1",
    "chuan-market-radar-coinglass-worker-1",
    "chuan-market-radar-dynamic-scan-scheduler-1",
    "chuan-market-radar-macro-worker-1",
    "chuan-market-radar-postgres-1",
    "chuan-market-radar-redis-1",
    "chuan-market-radar-scanner-worker-1",
    "chuan-market-radar-shadow-runner-1",
    "chuan-market-radar-signal-worker-1",
    "chuan-market-radar-web-1",
    "chuan-market-radar-websocket-light-worker-1",
  ];
  return new Map(names.map((name, index) => [
    name,
    (index + 1).toString(16).padStart(64, "0"),
  ]));
}

async function writeSource(root, path, bytes, mode = 0o600) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, bytes, { mode });
  await chmod(target, mode);
}

async function createHostKey(root) {
  const keyPath = join(root, "host-ed25519");
  await execFileAsync("/usr/bin/ssh-keygen", [
    "-q", "-t", "ed25519", "-N", "", "-f", keyPath,
  ]);
  const publicKey = (await readFile(`${keyPath}.pub`, "utf8"))
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .join(" ");
  return { keyPath, publicKey };
}

async function buildFixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "production-evidence-gateway-")));
  const sourceRoot = join(root, "source");
  const productionWorktree = join(root, "production");
  const stagingRoot = join(root, "staging");
  const stateRoot = join(root, "state");
  const policy = {
    caddyContainerName: "chuan-market-radar-caddy-1",
    composeProjectName: "chuan-market-radar",
    dispatchStateRoot: stateRoot,
    gatewayRoot: join(stateRoot, "evidence-gateway"),
    outboxRoot: join(stateRoot, "outbound"),
    productionWorktree,
    stagingPrefix: "production-evidence-gateway-",
    stagingRoot,
  };
  await mkdir(sourceRoot, { recursive: true, mode: 0o700 });
  for (const path of PRODUCTION_EVIDENCE_GATEWAY_SOURCE_FILES) {
    await writeSource(
      sourceRoot,
      path,
      await readFile(join(process.cwd(), path)),
      path === PRODUCTION_EVIDENCE_GATEWAY_ENTRYPOINT ? 0o700 : 0o600,
    );
  }
  const recipientRoot = join(root, "recipient");
  const recipientPrivatePath = join(recipientRoot, "private.pem");
  const recipientPublicPath = join(recipientRoot, "public.pem");
  await generateEvidenceRecipientKeyPair({
    privateKeyPath: recipientPrivatePath,
    publicKeyPath: recipientPublicPath,
  });
  await writeSource(
    sourceRoot,
    "scripts/v2/production/fixed-channel/production-evidence-recipient-public.spki",
    await readFile(recipientPublicPath),
  );
  await writeSource(
    sourceRoot,
    ".test-production-baseline/deploy/caddy/Caddyfile",
    BASELINE_CADDYFILE,
  );
  await writeSource(
    sourceRoot,
    ".test-production-baseline/docker-compose.yml",
    BASELINE_COMPOSE,
  );
  await writeSource(productionWorktree, "deploy/caddy/Caddyfile", BASELINE_CADDYFILE, 0o644);
  await writeSource(productionWorktree, "docker-compose.yml", BASELINE_COMPOSE, 0o644);
  await writeSource(productionWorktree, ".env.production", "CHUAN_PUBLIC_HOST=:80\n", 0o600);
  await mkdir(stagingRoot, { recursive: true, mode: 0o700 });
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  const containers = containerFixture();
  const approval = {
    dispatchId: "production-evidence-gateway-20260802t060000z-test0001",
    expiresAt: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
    expectedContainerIds: [...containers.values()].sort(),
    expectedProductionHead: PRODUCTION_HEAD,
    issuedAt: NOW.toISOString(),
    revocationEpoch: 0,
    runnerUnitName: "market-radar-evidence-gateway-test0001",
    sourceRef: "refs/heads/codex/market-radar-v2-implementation",
  };
  const outputA = join(root, "build-a");
  const outputB = join(root, "build-b");
  const first = await buildProductionEvidenceGatewayBundle({
    approval,
    outputDirectory: outputA,
    policy,
    root: sourceRoot,
    sourceCommit: SOURCE_COMMIT,
    sourceTree: SOURCE_TREE,
    verifySourceBinding: false,
  });
  const second = await buildProductionEvidenceGatewayBundle({
    approval,
    outputDirectory: outputB,
    policy,
    root: sourceRoot,
    sourceCommit: SOURCE_COMMIT,
    sourceTree: SOURCE_TREE,
    verifySourceBinding: false,
  });
  const request = first.request;
  await mkdir(request.stagingDirectory, { recursive: true, mode: 0o700 });
  await execFileAsync("/usr/bin/tar", [
    "-xzf", join(outputA, "bundle.tar.gz"), "-C", request.stagingDirectory,
  ]);
  await copyFile(join(outputA, "approval-request.json"),
    join(request.stagingDirectory, "approval-request.json"));
  await chmod(join(request.stagingDirectory, "approval-request.json"), 0o600);
  await writeFile(
    join(request.stagingDirectory, ".transport-bundle.sha256"),
    `${request.transportBundleSha256}\n`,
    { mode: 0o600 },
  );
  return {
    approval,
    containers,
    first,
    outputA,
    outputB,
    policy,
    recipientPrivatePath,
    request,
    root,
    second,
    sourceRoot,
  };
}

function healthBody() {
  return Buffer.from(JSON.stringify({
    data: {
      health: {
        level: "ready",
        persistence: { databaseStatus: "ready" },
        scan: { freshness: "fresh", status: "ready" },
      },
    },
    ok: true,
  }));
}

function simulation(fixture, { failAfterDeployHealth = false } = {}) {
  const containers = new Map(fixture.containers);
  let caddyGeneration = 20;
  let overrideActive = false;
  let mutationCount = 0;
  const calls = [];
  const commandRunner = async (command, args) => {
    calls.push({ args: [...args], command });
    if (command === "git") {
      if (args.includes("rev-parse")) return PRODUCTION_HEAD;
      if (args.includes("status")) return "";
    }
    if (command === "systemctl") {
      return args[0] === "is-active" ? "active" : "enabled";
    }
    if (command === "docker") {
      if (args[0] === "ps") {
        return [...containers.entries()].map(([name, id]) => `${name}=${id}`).join("\n");
      }
      if (args[0] === "inspect" && args[2] === "{{.Image}}") return CADDY_IMAGE;
      if (args[0] === "inspect" && args[2] === "{{json .Mounts}}") {
        return JSON.stringify(overrideActive ? [
          {
            Destination: "/etc/caddy/Caddyfile",
            RW: false,
            Source: join(fixture.request.gatewayRoot, "Caddyfile"),
          },
          {
            Destination: "/srv/market-radar-production-evidence",
            RW: false,
            Source: fixture.request.evidenceOutboxRoot,
          },
        ] : [
          {
            Destination: "/etc/caddy/Caddyfile",
            RW: false,
            Source: join(fixture.request.productionWorktree, "deploy/caddy/Caddyfile"),
          },
        ]);
      }
      if (args[0] === "run") return "Valid configuration";
      if (args[0] === "compose" && args.includes("config")) return "";
      if (args[0] === "compose" && args.includes("up")) {
        overrideActive = args.includes(
          join(fixture.request.gatewayRoot, "production-evidence-gateway.compose.yml"),
        );
        mutationCount += 1;
        caddyGeneration += 1;
        containers.set(
          fixture.request.caddyContainerName,
          caddyGeneration.toString(16).padStart(64, "0"),
        );
        return "";
      }
    }
    if (command === "curl") {
      const url = args.at(-1);
      if (url === "http://127.0.0.1/api/health") {
        if (overrideActive && failAfterDeployHealth) {
          return Buffer.from(JSON.stringify({ ok: false }));
        }
        return healthBody();
      }
      if (url.endsWith("/not-allowed.mre")) return Buffer.from("404");
      if (url.includes("/_market-radar/evidence/") && overrideActive) {
        return readFile(join(fixture.request.evidenceOutboxRoot, url.split("/").at(-1)));
      }
    }
    throw new Error(`unexpected simulated command: ${command} ${args.join(" ")}`);
  };
  return {
    calls,
    commandRunner,
    mutationCount: () => mutationCount,
    overrideActive: () => overrideActive,
  };
}

test("gateway request freezes a Caddy-only, no-repository, auto-rollback boundary", async () => {
  const fixture = await buildFixture();
  try {
    assert.equal(
      validateProductionEvidenceGatewayRequest(fixture.request, {
        now: new Date(NOW.getTime() + 1_000),
        policy: fixture.policy,
      }),
      fixture.request,
    );
    assert.equal(fixture.request.caddyMutationAllowed, true);
    assert.equal(fixture.request.productionRepositoryMutationAllowed, false);
    assert.equal(fixture.request.databaseMutationAllowed, false);
    assert.equal(fixture.request.redisMutationAllowed, false);
    assert.equal(fixture.request.workerMutationAllowed, false);
    assert.equal(fixture.request.automaticRollbackRequired, true);
    await assert.rejects(
      async () => validateProductionEvidenceGatewayRequest({
        ...fixture.request,
        workerMutationAllowed: true,
      }, { now: NOW, policy: fixture.policy }),
      gatewayReason("evidence_gateway_mutation_boundary_invalid"),
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("gateway control files reject broad modes and symbolic links", async () => {
  const root = await mkdtemp(join(tmpdir(), "market-radar-evidence-control-"));
  try {
    const control = join(root, "approval-request.json");
    const link = join(root, "approval-link.json");
    await writeFile(control, "{}", { mode: 0o644 });
    await assert.rejects(
      readBoundedProductionEvidenceGatewayFile(
        control,
        1024,
        "evidence_gateway_control_unsafe",
        0o600,
      ),
      gatewayReason("evidence_gateway_control_unsafe"),
    );
    await chmod(control, 0o600);
    assert.equal(
      (await readBoundedProductionEvidenceGatewayFile(
        control,
        1024,
        "evidence_gateway_control_unsafe",
        0o600,
      )).toString("utf8"),
      "{}",
    );
    await symlink(control, link);
    await assert.rejects(
      readBoundedProductionEvidenceGatewayFile(
        link,
        1024,
        "evidence_gateway_control_unsafe",
        0o600,
      ),
      gatewayReason("evidence_gateway_control_unsafe"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gateway bundle is deterministic, secret-free and accepted by signed fixed dispatch", async () => {
  const fixture = await buildFixture();
  try {
    assert.equal(
      sha256(await readFile(join(fixture.outputA, "bundle.tar.gz"))),
      sha256(await readFile(join(fixture.outputB, "bundle.tar.gz"))),
    );
    assert.equal(fixture.first.result.bundleSha256, fixture.second.result.bundleSha256);
    const keysRoot = join(fixture.root, "dispatch-keys");
    await mkdir(keysRoot, { mode: 0o700 });
    const privateKeyPath = join(keysRoot, "private.key");
    const publicKeyPath = join(keysRoot, "public.key");
    await generateSigningKeyPair({ privateKeyPath, publicKeyPath });
    const outbox = join(fixture.root, "dispatch-outbox");
    const dispatch = {
      dispatchId: fixture.request.dispatchId,
      entrypointPath: PRODUCTION_EVIDENCE_GATEWAY_ENTRYPOINT,
      expiresAt: fixture.request.approvalExpiresAt,
      issuedAt: fixture.request.approvalIssuedAt,
      launchSuccessMarker: PRODUCTION_EVIDENCE_GATEWAY_SUCCESS_MARKER,
      packageId: PRODUCTION_EVIDENCE_GATEWAY_PACKAGE_ID,
      revocationEpoch: fixture.request.revocationEpoch,
      runnerUnitName: fixture.request.runnerUnitName,
      runtimeMaxSeconds: fixture.request.dispatchRuntimeMaxSeconds,
      sourceRef: fixture.request.sourceRef,
      sourceRefs: [fixture.request.sourceRef],
      stagingDirectory: fixture.request.stagingDirectory,
      stagingRoots: [fixture.policy.stagingRoot],
      targetCommit: fixture.request.sourceCommit,
    };
    await prepareDispatch({
      approvalRequestPath: join(fixture.outputA, "approval-request.json"),
      bundlePath: join(fixture.outputA, "bundle.tar.gz"),
      dispatch,
      now: NOW,
      outbox,
      privateKeyPath,
    });
    const validated = await validateOutbox(outbox, publicKeyPath, {
      now: NOW,
      sourceRefs: [fixture.request.sourceRef],
      stagingRoots: [fixture.policy.stagingRoot],
    });
    assert.equal(validated.status, "PASS_SIGNED_DISPATCH_OUTBOX");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("high-level gateway release rejects broad approval permissions before outbox creation", async () => {
  const fixture = await buildFixture();
  try {
    const output = join(fixture.root, "release-build");
    const built = await buildProductionEvidenceGatewayBundle({
      approval: fixture.approval,
      outputDirectory: output,
      root: fixture.sourceRoot,
      sourceCommit: SOURCE_COMMIT,
      sourceTree: SOURCE_TREE,
      verifySourceBinding: false,
    });
    const keysRoot = join(fixture.root, "release-keys");
    await mkdir(keysRoot, { mode: 0o700 });
    const privateKeyPath = join(keysRoot, "private.key");
    const publicKeyPath = join(keysRoot, "public.key");
    await generateSigningKeyPair({ privateKeyPath, publicKeyPath });
    const approvalRequestPath = join(output, "approval-request.json");
    const outbox = join(fixture.root, "release-outbox");
    await chmod(approvalRequestPath, 0o644);
    await assert.rejects(
      prepareProductionEvidenceGatewayRelease({
        approvalRequestPath,
        bundlePath: join(output, "bundle.tar.gz"),
        now: NOW,
        outbox,
        privateKeyPath,
        publicKeyPath,
      }),
      gatewayReason("evidence_gateway_release_request_unsafe"),
    );
    await assert.rejects(lstat(outbox), { code: "ENOENT" });
    await chmod(approvalRequestPath, 0o600);
    const release = await prepareProductionEvidenceGatewayRelease({
      approvalRequestPath,
      bundlePath: join(output, "bundle.tar.gz"),
      now: NOW,
      outbox,
      privateKeyPath,
      publicKeyPath,
    });
    assert.equal(
      release.status,
      "PASS_PRODUCTION_EVIDENCE_GATEWAY_RELEASE_PREPARED",
    );
    assert.equal(release.dispatchId, built.request.dispatchId);
    assert.equal(release.bundleSha256, built.result.bundleSha256);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("gateway changes only Caddy, proves the route, and returns verifiable encrypted evidence", async () => {
  const fixture = await buildFixture();
  try {
    const simulated = simulation(fixture);
    const host = await createHostKey(fixture.root);
    const schedules = [];
    const result = await runProductionEvidenceGateway({
      commandRunner: simulated.commandRunner,
      expiryScheduler: async (schedule) => {
        schedules.push(schedule);
        return {
          dispatchId: schedule.dispatchId,
          objectName: evidenceObjectName(schedule.dispatchId),
          status: "PASS_PRODUCTION_EVIDENCE_EXPIRY_SCHEDULED",
          unitName: "market-radar-production-evidence-prune-test",
        };
      },
      now: new Date(NOW.getTime() + 1_000),
      policy: fixture.policy,
      requestPath: join(fixture.request.stagingDirectory, "approval-request.json"),
      signerOptions: {
        keyPath: host.keyPath,
        sshKeygenPath: "/usr/bin/ssh-keygen",
        useSudo: false,
      },
      sleeper: async () => {},
    });
    assert.equal(result.status, "PASS_PRODUCTION_EVIDENCE_GATEWAY_CADDY_ONLY");
    assert.equal(simulated.overrideActive(), true);
    assert.equal(simulated.mutationCount(), 1);
    assert.equal(schedules.length, 1);
    const sealed = await readSealedEvidenceFile(join(
      fixture.request.evidenceOutboxRoot,
      evidenceObjectName(fixture.request.dispatchId),
    ));
    const receipt = await openProductionEvidence({
      dispatchId: fixture.request.dispatchId,
      expectedSchemaVersion: PRODUCTION_EVIDENCE_GATEWAY_RESULT_SCHEMA,
      now: new Date(NOW.getTime() + 2_000),
      recipientPrivateKey: await readFile(fixture.recipientPrivatePath, "utf8"),
      sealed,
      trustedSignerPublicKey: host.publicKey,
      verifierOptions: { sshKeygenPath: "/usr/bin/ssh-keygen" },
    });
    assert.equal(receipt.payload.status,
      "PASS_PRODUCTION_EVIDENCE_GATEWAY_CADDY_ONLY");
    assert.equal(receipt.payload.nonCaddyContainerIdentityUnchanged, true);
    assert.equal(receipt.payload.productionRepositoryChanged, false);
    assert.ok(simulated.calls.some(({ args, command }) =>
      command === "docker" && args[0] === "run" && args.includes("--network")));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("post-deploy health failure restores baseline Caddy and removes gateway state", async () => {
  const fixture = await buildFixture();
  try {
    const simulated = simulation(fixture, { failAfterDeployHealth: true });
    await assert.rejects(
      runProductionEvidenceGateway({
        commandRunner: simulated.commandRunner,
        expiryScheduler: async () => {
          throw new Error("must not schedule after failed health");
        },
        now: new Date(NOW.getTime() + 1_000),
        policy: fixture.policy,
        requestPath: join(fixture.request.stagingDirectory, "approval-request.json"),
        sleeper: async () => {},
      }),
      gatewayReason("evidence_gateway_health_recovery_timeout"),
    );
    assert.equal(simulated.overrideActive(), false);
    assert.equal(simulated.mutationCount(), 2);
    await assert.rejects(lstat(fixture.request.gatewayRoot), { code: "ENOENT" });
    await assert.rejects(
      lstat(join(
        fixture.request.evidenceOutboxRoot,
        evidenceObjectName(fixture.request.dispatchId),
      )),
      { code: "ENOENT" },
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("entrypoint always removes only its exact staging directory", async () => {
  const source = await readFile(
    new URL("./production-evidence-gateway-entrypoint.sh", import.meta.url),
    "utf8",
  );
  assert.match(source, /trap cleanup_staging EXIT/u);
  assert.match(source, /STAGING_PREFIX="production-evidence-gateway-"/u);
  assert.match(source, /rm -rf -- "\$\{ACTUAL_SOURCE_ROOT\}"/u);
  assert.doesNotMatch(source, /docker compose down|docker system prune|git reset/u);
});
