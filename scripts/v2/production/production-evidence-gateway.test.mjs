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
  canonicalJson,
  generateSigningKeyPair,
  prepareDispatch,
  sha256,
  validateOutbox,
} from "./fixed-channel/production-dispatch.mjs";
import {
  ProductionEvidenceError,
  evidenceObjectName,
  generateEvidenceRecipientKeyPair,
  openProductionEvidence,
  readSealedEvidenceFile,
  signEvidenceStatementWithSshKey,
} from "./fixed-channel/production-evidence-channel.mjs";
import {
  buildProductionEvidenceGatewayBundle,
} from "./production-evidence-gateway-bundle.mjs";
import {
  PRODUCTION_EVIDENCE_GATEWAY_ENTRYPOINT,
  PRODUCTION_EVIDENCE_GATEWAY_PACKAGE_ID,
  PRODUCTION_EVIDENCE_GATEWAY_RECURRENCE_REGISTRY,
  PRODUCTION_EVIDENCE_GATEWAY_REMEDIATION_OPERATION,
  PRODUCTION_EVIDENCE_GATEWAY_RESULT_SCHEMA,
  PRODUCTION_EVIDENCE_GATEWAY_SOURCE_FILES,
  PRODUCTION_EVIDENCE_GATEWAY_SUCCESS_MARKER,
  ProductionEvidenceGatewayError,
  readBoundedProductionEvidenceGatewayFile,
  runProductionEvidenceGateway,
  validateProductionEvidenceGatewayRecurrenceAuthority,
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
const COMPOSE_IDENTITY_WRAPPER = "#!/bin/sh\nexec docker compose \"$@\"\n";
const RUNTIME_IDENTITY_OVERRIDE = "services:\n  web:\n    environment:\n      DATABASE_URL: test-only\n";
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
  const { stdout } = await execFileAsync("/usr/bin/ssh-keygen", [
    "-lf", `${keyPath}.pub`, "-E", "sha256",
  ]);
  const fingerprint = stdout.trim().split(/\s+/u)[1];
  return { fingerprint, keyPath, publicKey };
}

function localHostSigner(statementBytes, options) {
  return signEvidenceStatementWithSshKey(statementBytes, {
    ...options,
    useSudo: false,
  });
}

async function buildFixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "production-evidence-gateway-")));
  const host = await createHostKey(root);
  const sourceRoot = join(root, "source");
  const productionWorktree = join(root, "production");
  const stagingRoot = join(root, "staging");
  const stateRoot = join(root, "state");
  const policy = {
    caddyContainerName: "chuan-market-radar-caddy-1",
    composeIdentityWrapper: join(stateRoot, "compose-identity-safe"),
    composeProjectName: "chuan-market-radar",
    dispatchStateRoot: stateRoot,
    evidenceSignerKeyPath: host.keyPath,
    evidenceSignerPublicKeyFingerprint: host.fingerprint,
    gatewayRoot: join(stateRoot, "evidence-gateway"),
    outboxRoot: join(stateRoot, "outbound"),
    productionWorktree,
    runtimeIdentityOverride: join(stateRoot, "runtime-identity.override.yml"),
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
  await writeFile(policy.composeIdentityWrapper, COMPOSE_IDENTITY_WRAPPER, { mode: 0o700 });
  await writeFile(policy.runtimeIdentityOverride, RUNTIME_IDENTITY_OVERRIDE, { mode: 0o600 });
  const containers = containerFixture();
  const approval = {
    composeIdentityWrapperSha256: sha256(COMPOSE_IDENTITY_WRAPPER),
    dispatchId: "production-evidence-gateway-20260802t060000z-test0001",
    expiresAt: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
    expectedContainerIds: [...containers.values()].sort(),
    expectedProductionHead: PRODUCTION_HEAD,
    issuedAt: NOW.toISOString(),
    revocationEpoch: 0,
    runnerUnitName: "market-radar-evidence-gateway-test0001",
    runtimeIdentityOverrideSha256: sha256(RUNTIME_IDENTITY_OVERRIDE),
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
    host,
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

function healthBody({ legacyNested = false } = {}) {
  const health = {
    level: "ready",
    persistence: { databaseStatus: "ready" },
    scan: { freshness: "fresh", status: "ready" },
  };
  return Buffer.from(JSON.stringify(legacyNested
    ? { data: { health }, ok: true }
    : { health, ok: true }));
}

function simulation(fixture, {
  failTargetComposeValidation = false,
  failAfterDeployHealth = false,
  legacyNestedHealth = false,
} = {}) {
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
    if (command === "privileged-file-identity") {
      const wrapper = args[0] === fixture.request.composeIdentityWrapper;
      return JSON.stringify({
        gid: 0,
        mode: wrapper ? "700" : "600",
        sha256: wrapper
          ? fixture.request.composeIdentityWrapperSha256
          : fixture.request.runtimeIdentityOverrideSha256,
        uid: 0,
      });
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
    }
    if (command === "compose-wrapper") {
      if (args.includes("config")) {
        if (failTargetComposeValidation) {
          throw new ProductionEvidenceGatewayError(
            "evidence_gateway_command_failed:validate_target_compose",
            {
              command: "compose-wrapper",
              exitCode: 1,
              stderrSha256: "e".repeat(64),
              stdoutSha256: sha256(""),
            },
          );
        }
        return "";
      }
      if (args.includes("up")) {
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
        return healthBody({ legacyNested: legacyNestedHealth });
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
    assert.equal(
      fixture.request.recurrenceRemediationOperation,
      PRODUCTION_EVIDENCE_GATEWAY_REMEDIATION_OPERATION,
    );
    assert.equal(
      fixture.request.recurrenceRegistrySha256,
      sha256(await readFile(join(
        fixture.request.stagingDirectory,
        PRODUCTION_EVIDENCE_GATEWAY_RECURRENCE_REGISTRY,
      ))),
    );
    assert.equal(
      fixture.request.composeIdentityWrapperSha256,
      sha256(COMPOSE_IDENTITY_WRAPPER),
    );
    assert.equal(
      fixture.request.runtimeIdentityOverrideSha256,
      sha256(RUNTIME_IDENTITY_OVERRIDE),
    );
    assert.match(
      fixture.request.evidenceRecipientFingerprintSha256,
      /^[a-f0-9]{64}$/u,
    );
    assert.equal(
      fixture.request.evidenceSignerKeyPath,
      fixture.host.keyPath,
    );
    assert.equal(
      fixture.request.evidenceSignerPublicKeyFingerprint,
      fixture.host.fingerprint,
    );
    assert.equal(
      Object.hasOwn(fixture.request, "evidenceRecipientKeySha256"),
      false,
    );
    await assert.rejects(
      async () => validateProductionEvidenceGatewayRequest({
        ...fixture.request,
        workerMutationAllowed: true,
      }, { now: NOW, policy: fixture.policy }),
      gatewayReason("evidence_gateway_mutation_boundary_invalid"),
    );
    await assert.rejects(
      async () => validateProductionEvidenceGatewayRequest({
        ...fixture.request,
        composeIdentityWrapper: `${fixture.request.composeIdentityWrapper}.other`,
      }, { now: NOW, policy: fixture.policy }),
      gatewayReason("evidence_gateway_policy_path_mismatch"),
    );
    await assert.rejects(
      async () => validateProductionEvidenceGatewayRequest({
        ...fixture.request,
        evidenceSignerKeyPath: `${fixture.request.evidenceSignerKeyPath}.other`,
      }, { now: NOW, policy: fixture.policy }),
      gatewayReason("evidence_gateway_policy_path_mismatch"),
    );
    await assert.rejects(
      async () => validateProductionEvidenceGatewayRequest({
        ...fixture.request,
        evidenceSignerPublicKeyFingerprint: "SHA256:not-a-fingerprint",
      }, { now: NOW, policy: fixture.policy }),
      gatewayReason("evidence_gateway_policy_path_mismatch"),
    );
    await assert.rejects(
      async () => validateProductionEvidenceGatewayRequest({
        ...fixture.request,
        runtimeIdentityOverrideSha256: "not-a-sha256",
      }, { now: NOW, policy: fixture.policy }),
      gatewayReason("evidence_gateway_hash_binding_invalid"),
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("gateway recurrence authority honors verified closure and still rejects missing or prohibited bindings", async () => {
  const fixture = await buildFixture();
  try {
    const registryPath = join(
      fixture.request.stagingDirectory,
      PRODUCTION_EVIDENCE_GATEWAY_RECURRENCE_REGISTRY,
    );
    const registryBytes = await readFile(registryPath);
    assert.doesNotThrow(() =>
      validateProductionEvidenceGatewayRecurrenceAuthority(
        fixture.request,
        registryBytes,
      ));

    const registry = JSON.parse(registryBytes.toString("utf8"));
    const incident = registry.incidents.find(({ id }) =>
      id === "REC-2026-08-02-PRODUCTION-GATEWAY-PREFLIGHT-EQUIVALENCE");
    incident.affectedOperations = incident.affectedOperations.filter(
      (operation) => operation !== PRODUCTION_EVIDENCE_GATEWAY_REMEDIATION_OPERATION,
    );
    const blockedBytes = Buffer.from(`${JSON.stringify(registry, null, 2)}\n`);
    assert.throws(
      () => validateProductionEvidenceGatewayRecurrenceAuthority(
        {
          ...fixture.request,
          recurrenceRegistrySha256: sha256(blockedBytes),
        },
        blockedBytes,
      ),
      gatewayReason("evidence_gateway_recurrence_incident_missing"),
    );

    const blockedRegistry = JSON.parse(registryBytes.toString("utf8"));
    const blockedIncident = blockedRegistry.incidents.find(({ id }) =>
      id === "REC-2026-08-02-PRODUCTION-GATEWAY-PREFLIGHT-EQUIVALENCE");
    blockedIncident.prohibitedOperations.push(
      PRODUCTION_EVIDENCE_GATEWAY_REMEDIATION_OPERATION,
    );
    const gateOpenBytes = Buffer.from(
      `${JSON.stringify(blockedRegistry, null, 2)}\n`,
    );
    assert.throws(
      () => validateProductionEvidenceGatewayRecurrenceAuthority(
        {
          ...fixture.request,
          recurrenceRegistrySha256: sha256(gateOpenBytes),
        },
        gateOpenBytes,
      ),
      gatewayReason("evidence_gateway_recurrence_gate_open"),
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
    const schedules = [];
    const signerKeyPaths = [];
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
      signer: async (statementBytes, options) => {
        signerKeyPaths.push(options.keyPath);
        return localHostSigner(statementBytes, options);
      },
      sleeper: async () => {},
    });
    assert.equal(result.status, "PASS_PRODUCTION_EVIDENCE_GATEWAY_CADDY_ONLY");
    assert.equal(simulated.overrideActive(), true);
    assert.equal(simulated.mutationCount(), 1);
    assert.equal(schedules.length, 1);
    assert.deepEqual(signerKeyPaths, [
      fixture.request.evidenceSignerKeyPath,
      fixture.request.evidenceSignerKeyPath,
    ]);
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
      trustedSignerPublicKey: fixture.host.publicKey,
      verifierOptions: { sshKeygenPath: "/usr/bin/ssh-keygen" },
    });
    assert.equal(receipt.payload.status,
      "PASS_PRODUCTION_EVIDENCE_GATEWAY_CADDY_ONLY");
    assert.equal(receipt.payload.nonCaddyContainerIdentityUnchanged, true);
    assert.equal(receipt.payload.productionRepositoryChanged, false);
    assert.ok(simulated.calls.some(({ args, command }) =>
      command === "docker"
        && args[0] === "run"
        && args.includes("--network")
        && args.includes("--cap-drop")
        && args.includes("--cap-add")
        && args.includes("NET_BIND_SERVICE")));
    assert.ok(simulated.calls.some(({ args, command }) =>
      command === "compose-wrapper"
        && args.includes("config")
        && args.some((value) => value.endsWith("production-evidence-gateway.compose.yml"))));
    assert.ok(simulated.calls.some(({ args, command }) =>
      command === "compose-wrapper" && args.includes("up")));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("gateway accepts the production health envelope and rejects the obsolete nested fixture before mutation", async () => {
  const healthRouteSource = await readFile(
    new URL("../../../src/app/api/health/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    healthRouteSource,
    /NextResponse\.json\(\{\s*ok:\s*true,\s*health,\s*\}/u,
  );

  const fixture = await buildFixture();
  try {
    const simulated = simulation(fixture, { legacyNestedHealth: true });
    await assert.rejects(
      runProductionEvidenceGateway({
        commandRunner: simulated.commandRunner,
        expiryScheduler: async () => {
          throw new Error("must not schedule for an invalid health envelope");
        },
        now: new Date(NOW.getTime() + 1_000),
        policy: fixture.policy,
        requestPath: join(fixture.request.stagingDirectory, "approval-request.json"),
        signer: localHostSigner,
        sleeper: async () => {},
      }),
      gatewayReason("evidence_gateway_health_not_ready"),
    );
    assert.equal(simulated.mutationCount(), 0);
    await assert.rejects(lstat(fixture.request.gatewayRoot), { code: "ENOENT" });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("target Compose validation failure is classified before mutation and removes all gateway state", async () => {
  const fixture = await buildFixture();
  try {
    const simulated = simulation(fixture, { failTargetComposeValidation: true });
    await assert.rejects(
      runProductionEvidenceGateway({
        commandRunner: simulated.commandRunner,
        expiryScheduler: async () => {
          throw new Error("must not schedule after failed Compose validation");
        },
        now: new Date(NOW.getTime() + 1_000),
        policy: fixture.policy,
        requestPath: join(fixture.request.stagingDirectory, "approval-request.json"),
        signer: localHostSigner,
        sleeper: async () => {},
      }),
      gatewayReason("evidence_gateway_command_failed:validate_target_compose"),
    );
    assert.equal(simulated.mutationCount(), 0);
    await assert.rejects(lstat(fixture.request.gatewayRoot), { code: "ENOENT" });
    await assert.rejects(lstat(fixture.request.evidenceOutboxRoot), { code: "ENOENT" });
    assert.equal(
      simulated.calls.some(({ args, command }) =>
        command === "docker" && args[0] === "compose"),
      false,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("a pre-existing outbox is preserved and blocks the gateway before mutation", async () => {
  const fixture = await buildFixture();
  try {
    const marker = join(fixture.request.evidenceOutboxRoot, "unknown-owner.txt");
    await mkdir(fixture.request.evidenceOutboxRoot, { mode: 0o700 });
    await writeFile(marker, "preserve-me\n", { mode: 0o600 });
    const simulated = simulation(fixture);
    await assert.rejects(
      runProductionEvidenceGateway({
        commandRunner: simulated.commandRunner,
        now: new Date(NOW.getTime() + 1_000),
        policy: fixture.policy,
        requestPath: join(fixture.request.stagingDirectory, "approval-request.json"),
        sleeper: async () => {},
      }),
      gatewayReason("evidence_gateway_outbox_already_exists"),
    );
    assert.equal(simulated.mutationCount(), 0);
    assert.equal(await readFile(marker, "utf8"), "preserve-me\n");
    await assert.rejects(lstat(fixture.request.gatewayRoot), { code: "ENOENT" });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("signer preflight failure is classified and removes owned state before Caddy mutation", async () => {
  const fixture = await buildFixture();
  try {
    const simulated = simulation(fixture);
    let observedKeyPath;
    await assert.rejects(
      runProductionEvidenceGateway({
        commandRunner: simulated.commandRunner,
        expiryScheduler: async () => {
          throw new Error("must not schedule after failed signer preflight");
        },
        now: new Date(NOW.getTime() + 1_000),
        policy: fixture.policy,
        requestPath: join(fixture.request.stagingDirectory, "approval-request.json"),
        signer: async (_statementBytes, options) => {
          observedKeyPath = options.keyPath;
          throw new ProductionEvidenceError("evidence_signing_key_path_invalid");
        },
        sleeper: async () => {},
      }),
      gatewayReason(
        "evidence_gateway_signer_preflight_failed:evidence_signing_key_path_invalid",
      ),
    );
    assert.equal(observedKeyPath, fixture.request.evidenceSignerKeyPath);
    assert.equal(simulated.mutationCount(), 0);
    assert.equal(simulated.overrideActive(), false);
    await assert.rejects(lstat(fixture.request.gatewayRoot), { code: "ENOENT" });
    await assert.rejects(lstat(fixture.request.evidenceOutboxRoot), { code: "ENOENT" });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("signer identity mismatch fails closed before Caddy mutation", async () => {
  const fixture = await buildFixture();
  try {
    const wrongFingerprint = `SHA256:${"A".repeat(43)}`;
    const request = {
      ...fixture.request,
      evidenceSignerPublicKeyFingerprint: wrongFingerprint,
    };
    const policy = {
      ...fixture.policy,
      evidenceSignerPublicKeyFingerprint: wrongFingerprint,
    };
    await writeFile(
      join(request.stagingDirectory, "approval-request.json"),
      canonicalJson(request),
      { mode: 0o600 },
    );
    const simulated = simulation(fixture);
    await assert.rejects(
      runProductionEvidenceGateway({
        commandRunner: simulated.commandRunner,
        expiryScheduler: async () => {
          throw new Error("must not schedule with a mismatched signer identity");
        },
        now: new Date(NOW.getTime() + 1_000),
        policy,
        requestPath: join(request.stagingDirectory, "approval-request.json"),
        signer: localHostSigner,
        sleeper: async () => {},
      }),
      gatewayReason("evidence_gateway_signer_identity_mismatch"),
    );
    assert.equal(simulated.mutationCount(), 0);
    assert.equal(simulated.overrideActive(), false);
    await assert.rejects(lstat(request.gatewayRoot), { code: "ENOENT" });
    await assert.rejects(lstat(request.evidenceOutboxRoot), { code: "ENOENT" });
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
        signer: localHostSigner,
        sleeper: async () => {},
      }),
      gatewayReason("evidence_gateway_health_recovery_timeout"),
    );
    assert.equal(simulated.overrideActive(), false);
    assert.equal(simulated.mutationCount(), 2);
    await assert.rejects(lstat(fixture.request.gatewayRoot), { code: "ENOENT" });
    await assert.rejects(lstat(fixture.request.evidenceOutboxRoot), { code: "ENOENT" });
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

test("gateway process failures expose stable command or unclassified fingerprints", async () => {
  const source = await readFile(
    new URL("./production-evidence-gateway.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /evidence_gateway_command_failed:\$\{operation\}/u);
  assert.match(source, /evidence_gateway_unclassified_failure/u);
  assert.doesNotMatch(source, /:\s*"unexpected_error"/u);
});
