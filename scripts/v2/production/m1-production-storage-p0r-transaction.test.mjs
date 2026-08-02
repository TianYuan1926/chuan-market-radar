import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  CLEANUP_EVIDENCE_MAX_AGE_SECONDS,
  CLEANUP_EVIDENCE_SCHEMA,
  MAX_SAFE_BRIDGE_OUTPUT_BYTES,
  MAX_SAFE_BRIDGE_STATUS_COUNT,
  MAX_SECURE_CONTROL_FILE_BYTES,
  READY_EVIDENCE_SCHEMA,
  ROUTE_EVIDENCE_SCHEMA,
  ROUTE_TARGET_SCHEMA,
  TRANSACTION_SCHEMA,
  appendSafeBridgeStatus,
  authorizeBridgeReady,
  authorizeIssuance,
  buildTransactionLease,
  closeTransaction,
  parseSafeBridgeLine,
  readSecureControlFile,
  validateSuccessfulBridgeStatuses,
  validateRouteEvidence,
  validateTransactionLease,
} from "./m1-production-storage-p0r-transaction.mjs";
import {
  LISTENER_OBSERVATION_SCHEMA,
  REMOTE_LISTENER_OBSERVATION_SCHEMA,
  TENCENT_API_EXPLORER_CAPTURE_METHOD,
  TENCENT_FIREWALL_CAPTURE_SCHEMA,
  TENCENT_LIGHTHOUSE_API_ACTION,
  TENCENT_LIGHTHOUSE_API_ENDPOINT,
  TENCENT_LIGHTHOUSE_API_VERSION,
  TENCENT_LIGHTHOUSE_PROVIDER,
  buildListenerObservation,
  buildRouteEvidence,
  routeTargetDigest,
} from "./m1-production-storage-p0r-route-authority.mjs";

const SOURCE_COMMIT = "a".repeat(40);
const PLAN_SHA256 = "b".repeat(64);
const RUN_ID = "p0r-20990101t000000z-0123456789abcdef0123456789abcdef";
const NOW = "2099-01-01T00:00:00.000Z";

function routeTarget() {
  return {
    schemaVersion: ROUTE_TARGET_SCHEMA,
    provider: TENCENT_LIGHTHOUSE_PROVIDER,
    apiEndpoint: TENCENT_LIGHTHOUSE_API_ENDPOINT,
    apiAction: TENCENT_LIGHTHOUSE_API_ACTION,
    apiVersion: TENCENT_LIGHTHOUSE_API_VERSION,
    region: "ap-hongkong",
    instanceId: "lhins-abcdefgh",
    sshHost: "43.161.202.227",
    sshHostAlias: "43.161.202.227",
    sshUser: "ubuntu",
    listenerPort: 8022,
    listenerUnit: "market-radar-p0r-8022.service",
    containsSecret: false,
  };
}

function lease() {
  const target = routeTarget();
  return buildTransactionLease({
    egressA: "156.248.15.36",
    egressB: "156.248.15.36",
    listenerObserverScriptSha256: "e".repeat(64),
    now: NOW,
    plan: {
      credentialGrant: { runId: RUN_ID },
      sourceCommit: SOURCE_COMMIT,
    },
    planSha256: PLAN_SHA256,
    routeTarget: target,
    routeTargetSha256: routeTargetDigest(target),
    sourceFacts: { clean: true, head: SOURCE_COMMIT },
  });
}

function readyEvidence(target) {
  return {
    schemaVersion: READY_EVIDENCE_SCHEMA,
    leaseId: target.leaseId,
    sourceCommit: target.sourceCommit,
    runId: target.runId,
    planSha256: target.planSha256,
    checkedAt: "2099-01-01T00:01:00.000Z",
    egressIpv4A: target.egress.ipv4,
    egressIpv4B: target.egress.ipv4,
    listenerActive: true,
    listenerCount: 1,
    firewallRuleCount: 1,
    primaryTtyReady: true,
    secondaryTtyReady: true,
    bridgeClipboardSentinelArmed: true,
    postIssuanceReconnectRequired: false,
    containsSecret: false,
  };
}

function routeEvidence(target, checkedAt = "2099-01-01T00:01:00.000Z") {
  const capture = {
    schemaVersion: TENCENT_FIREWALL_CAPTURE_SCHEMA,
    provider: target.resources.firewall.provider,
    apiEndpoint: target.resources.firewall.apiEndpoint,
    apiAction: target.resources.firewall.apiAction,
    apiVersion: target.resources.firewall.apiVersion,
    region: target.resources.firewall.region,
    instanceId: target.resources.firewall.instanceId,
    captureMethod: TENCENT_API_EXPLORER_CAPTURE_METHOD,
    capturedAt: "2099-01-01T00:00:30.000Z",
    pages: [{
      offset: 0,
      limit: 100,
      response: {
        Response: {
          FirewallRuleSet: [{
            Action: "ACCEPT",
            AppType: "Custom",
            CidrBlock: target.resources.firewall.sourceCidr,
            FirewallRuleDescription: target.resources.firewall.remark,
            Port: String(target.resources.firewall.port),
            Protocol: target.resources.firewall.protocol,
          }],
          FirewallVersion: 17,
          RequestId: "01234567-89ab-cdef-0123-456789abcdef",
          TotalCount: 1,
        },
      },
    }],
    containsSecret: false,
  };
  const remote = {
    schemaVersion: REMOTE_LISTENER_OBSERVATION_SCHEMA,
    checkedAt: "2099-01-01T00:00:45.000Z",
    hostname: "VM-0-9-ubuntu",
    listenerUnit: target.resources.listener.unit,
    listenerPort: target.resources.listener.port,
    loadState: "loaded",
    activeState: "active",
    subState: "running",
    mainPid: 4242,
    ipv4ListenerCount: 1,
    ipv6ListenerCount: 0,
    listenerLocalAddress: `0.0.0.0:${target.resources.listener.port}`,
    listenerProcessName: "sshd",
    listenerProcessPid: 4242,
    containsSecret: false,
  };
  const observation = buildListenerObservation({
    identityPublicKeySha256: "c".repeat(64),
    knownHostsSha256: "d".repeat(64),
    lease: target,
    now: checkedAt,
    remoteObservation: remote,
    target: routeTarget(),
  });
  assert.equal(observation.schemaVersion, LISTENER_OBSERVATION_SCHEMA);
  return buildRouteEvidence({
    egressA: target.egress.ipv4,
    egressB: target.egress.ipv4,
    firewallCapture: capture,
    lease: target,
    listenerObservation: observation,
    now: checkedAt,
    target: routeTarget(),
  });
}

function cleanupEvidence(target) {
  return {
    schemaVersion: CLEANUP_EVIDENCE_SCHEMA,
    leaseId: target.leaseId,
    sourceCommit: target.sourceCommit,
    runId: target.runId,
    checkedAt: "2099-01-01T01:00:00.000Z",
    listenerActive: false,
    listenerCount: 0,
    firewallRuleCount: 0,
    bridgeProcessCount: 0,
    p0rSecretFileCount: 0,
    p0rProcessCount: 0,
    p0rContainerCount: 0,
    p0rVolumeCount: 0,
    runStagingCount: 0,
    clipboardCleared: true,
    containsSecret: false,
  };
}

test("transaction plan requires a lease, dual prearm and explicit cleanup proof", () => {
  const plan = JSON.parse(execFileSync(
    process.execPath,
    ["scripts/v2/production/m1-production-storage-p0r-transaction.mjs", "plan"],
    { encoding: "utf8" },
  ));
  assert.equal(plan.schemaVersion, TRANSACTION_SCHEMA);
  assert.equal(plan.temporaryResourceLeaseRequired, true);
  assert.equal(plan.bothSshSessionsPrearmedBeforeIssuance, true);
  assert.equal(plan.bridgeOutputExactAllowlistRequired, true);
  assert.equal(plan.bridgeExactTerminalSequenceRequired, true);
  assert.equal(plan.maxSafeBridgeOutputBytes, MAX_SAFE_BRIDGE_OUTPUT_BYTES);
  assert.equal(plan.maxSafeBridgeStatusCount, MAX_SAFE_BRIDGE_STATUS_COUNT);
  assert.equal(plan.maxSecureControlFileBytes, MAX_SECURE_CONTROL_FILE_BYTES);
  assert.equal(plan.secureControlFileStableNoFollowReadRequired, true);
  assert.equal(plan.postIssuanceNetworkReconnectRequired, false);
  assert.equal(plan.egressEndpointCount, 2);
  assert.equal(plan.egressRecheckBeforeBridgeRequired, true);
  assert.equal(plan.exactRouteEvidenceRequiredBeforeBridge, true);
  assert.equal(plan.authoritativeRouteEvidenceProducerRequired, true);
  assert.equal(plan.routeEvidenceSchema, ROUTE_EVIDENCE_SCHEMA);
  assert.equal(plan.routeTargetSchema, ROUTE_TARGET_SCHEMA);
  assert.equal(plan.routeEvidenceMaxAgeSeconds, 120);
  assert.equal(plan.cleanupEvidenceMaxAgeSeconds, CLEANUP_EVIDENCE_MAX_AGE_SECONDS);
  assert.equal(plan.cloudFirewallAutoExpirySufficient, false);
  assert.equal(plan.detachedAuthorizeCommandAllowed, false);
  assert.equal(plan.cleanupEvidenceRequired, true);
  assert.equal(plan.containsSecret, false);
});

test("lease binds the exact source, plan, route, TTL and destructor scope", () => {
  const target = lease();
  assert.equal(validateTransactionLease(target), target);
  assert.equal(target.schemaVersion, TRANSACTION_SCHEMA);
  assert.match(target.leaseId, /^p0r-lease-[a-z0-9-]+$/u);
  assert.equal(target.sourceCommit, SOURCE_COMMIT);
  assert.equal(target.runId, RUN_ID);
  assert.equal(target.planSha256, PLAN_SHA256);
  assert.equal(target.routeTargetSha256, routeTargetDigest(routeTarget()));
  assert.equal(target.phase, "PREPARED_NO_PRODUCTION_MUTATION");
  assert.equal(target.egress.endpointCount, 2);
  assert.equal(target.egress.cidr, "156.248.15.36/32");
  assert.equal(target.resources.listener.port, 8022);
  assert.equal(target.resources.listener.runtimeMaxSeconds, 7200);
  assert.equal(target.resources.firewall.sourceCidr, "156.248.15.36/32");
  assert.equal(target.resources.firewall.provider, TENCENT_LIGHTHOUSE_PROVIDER);
  assert.equal(target.resources.firewall.instanceId, "lhins-abcdefgh");
  assert.equal(target.resources.listener.host, "43.161.202.227");
  assert.equal(target.resources.bridge.bothSessionsPrearmedBeforeIssuance, true);
  assert.equal(target.resources.bridge.postIssuanceReconnectRequired, false);
  assert.equal(target.resources.bridge.clipboardWaitSeconds, 1200);
  assert.ok(target.cleanupRequired.includes("firewall_rule"));
  assert.ok(target.cleanupRequired.includes("dev_shm_secret"));
  assert.equal(target.issuanceAllowed, false);
});

test("lease validation rejects preauthorization, TTL and nested route drift", () => {
  for (const mutate of [
    (value) => { value.issuanceAllowed = true; },
    (value) => { value.ttlSeconds = 7_201; },
    (value) => { value.resources.listener.port = 22; },
    (value) => { value.resources.firewall.sourceCidr = "0.0.0.0/0"; },
    (value) => { value.routeTargetSha256 = "f".repeat(64); },
    (value) => { value.cleanupRequired = value.cleanupRequired.slice(1); },
  ]) {
    const invalid = structuredClone(lease());
    mutate(invalid);
    assert.throws(() => validateTransactionLease(invalid));
  }
});

test("issuance remains forbidden until both live TTYs and the exact route pass", () => {
  const target = lease();
  const authorized = authorizeIssuance(target, readyEvidence(target));
  assert.equal(authorized.phase, "ISSUANCE_AUTHORIZED_BOTH_TTYS_PREARMED");
  assert.equal(authorized.issuanceAllowed, true);

  for (const mutate of [
    (value) => { value.egressIpv4B = "156.248.15.37"; },
    (value) => { value.firewallRuleCount = 0; },
    (value) => { value.secondaryTtyReady = false; },
    (value) => { value.postIssuanceReconnectRequired = true; },
  ]) {
    const evidence = readyEvidence(target);
    mutate(evidence);
    assert.throws(() => authorizeIssuance(target, evidence));
  }
});

test("route evidence binds the exact listener and firewall and expires after 120 seconds", () => {
  const target = lease();
  const evidence = routeEvidence(target);
  assert.equal(
    validateRouteEvidence(target, evidence, "2099-01-01T00:02:00.000Z"),
    evidence,
  );

  for (const mutate of [
    (value) => { value.listenerUnit = "unexpected.service"; },
    (value) => { value.firewallSourceCidr = "156.248.15.37/32"; },
    (value) => { value.firewallRemark = "wrong"; },
    (value) => { value.firewallRuleIdentityHash = "not-a-hash"; },
    (value) => { value.firewallRuleIdentityHash = "e".repeat(64); },
    (value) => { value.listenerObservationSha256 = "f".repeat(64); },
  ]) {
    const invalid = routeEvidence(target);
    mutate(invalid);
    assert.throws(() => validateRouteEvidence(
      target,
      invalid,
      "2099-01-01T00:02:00.000Z",
    ));
  }
  assert.throws(
    () => validateRouteEvidence(target, evidence, "2099-01-01T00:03:01.000Z"),
    /route_evidence_stale/u,
  );
});

test("operator READY is authorized only after exactly one dual-TTY prearm", () => {
  const target = lease();
  const evidence = routeEvidence(target);
  const authorized = authorizeBridgeReady({
    lease: target,
    now: "2099-01-01T00:02:00.000Z",
    routeEvidence: evidence,
    statuses: ["PASS_P0R_BOTH_TTY_SESSIONS_PREARMED"],
  });
  assert.equal(authorized.issuanceAllowed, true);

  for (const statuses of [
    [],
    [
      "PASS_P0R_BOTH_TTY_SESSIONS_PREARMED",
      "PASS_P0R_BOTH_TTY_SESSIONS_PREARMED",
    ],
    [
      "PASS_P0R_BOTH_TTY_SESSIONS_PREARMED",
      "READY_P0R_API_NATIVE_COPY_TO_LOCAL_TTY_BRIDGE",
    ],
  ]) {
    assert.throws(() => authorizeBridgeReady({
      lease: target,
      now: "2099-01-01T00:02:00.000Z",
      routeEvidence: evidence,
      statuses,
    }));
  }

  const valid = [];
  appendSafeBridgeStatus(valid, "PASS_P0R_BOTH_TTY_SESSIONS_PREARMED");
  appendSafeBridgeStatus(valid, "READY_P0R_API_NATIVE_COPY_TO_LOCAL_TTY_BRIDGE");
  appendSafeBridgeStatus(valid, "WAITING_P0R_NATIVE_COPY_BOTH_TTY_SESSIONS_ALIVE");
  appendSafeBridgeStatus(valid, "PASS_P0R_EPHEMERAL_CREDENTIAL_HANDOFF");
  appendSafeBridgeStatus(valid, "PASS_P0R_AGE_IDENTITY_HANDOFF");
  appendSafeBridgeStatus(valid, "PASS_P0R_LOCAL_TTY_BRIDGE");
  assert.equal(validateSuccessfulBridgeStatuses(valid), valid);

  for (const [prefix, next] of [
    [[], "PASS_P0R_LOCAL_TTY_BRIDGE"],
    [["PASS_P0R_BOTH_TTY_SESSIONS_PREARMED"], "PASS_P0R_BOTH_TTY_SESSIONS_PREARMED"],
    [["BLOCKED_P0R_LOCAL_TTY_BRIDGE"], "PASS_P0R_LOCAL_TTY_BRIDGE"],
    [
      [
        "PASS_P0R_BOTH_TTY_SESSIONS_PREARMED",
        "READY_P0R_API_NATIVE_COPY_TO_LOCAL_TTY_BRIDGE",
      ],
      "PASS_P0R_AGE_IDENTITY_HANDOFF",
    ],
    [valid, "PASS_P0R_LOCAL_TTY_BRIDGE"],
  ]) {
    assert.throws(() => appendSafeBridgeStatus([...prefix], next));
  }
});

test("a transaction closes only with exact zero-residue evidence", () => {
  const target = lease();
  const closed = closeTransaction(
    target,
    cleanupEvidence(target),
    "2099-01-01T01:00:30.000Z",
  );
  assert.equal(closed.phase, "CLOSED_ZERO_TEMPORARY_RESIDUE");
  assert.equal(closed.containsSecret, false);

  const residue = cleanupEvidence(target);
  residue.firewallRuleCount = 1;
  assert.throws(
    () => closeTransaction(target, residue, "2099-01-01T01:00:30.000Z"),
    /firewallRuleCount_nonzero/u,
  );
  assert.throws(
    () => closeTransaction(
      target,
      cleanupEvidence(target),
      "2099-01-01T01:02:01.000Z",
    ),
    /cleanup_evidence_stale/u,
  );
  assert.throws(
    () => closeTransaction(
      target,
      cleanupEvidence(target),
      "2099-01-01T00:59:59.000Z",
    ),
    /cleanup_from_future/u,
  );
});

test("the transaction coordinator emits only bounded secret-free bridge states", async () => {
  assert.deepEqual(
    parseSafeBridgeLine(
      '{"containsSecret":false,"status":"PASS_P0R_BOTH_TTY_SESSIONS_PREARMED"}',
    ),
    {
      containsSecret: false,
      status: "PASS_P0R_BOTH_TTY_SESSIONS_PREARMED",
    },
  );
  assert.throws(() => parseSafeBridgeLine(
    '{"containsSecret":true,"status":"PASS_P0R_LOCAL_TTY_BRIDGE"}',
  ));
  assert.throws(() => parseSafeBridgeLine(
    '{"containsSecret":false,"status":"PASS_P0R_LOCAL_TTY_BRIDGE","reason":"SECRET=bad"}',
  ));
  assert.throws(() => parseSafeBridgeLine(
    '{"containsSecret":false,"status":"PASS_P0R_LOCAL_TTY_BRIDGE","unexpected":"not-allowed"}',
  ));
  assert.throws(() => parseSafeBridgeLine(
    '{"containsSecret":false,"status":"READY_P0R_UNREGISTERED_STATE"}',
  ));

  const saturated = [
    "PASS_P0R_BOTH_TTY_SESSIONS_PREARMED",
    "READY_P0R_API_NATIVE_COPY_TO_LOCAL_TTY_BRIDGE",
    ...Array.from(
      { length: MAX_SAFE_BRIDGE_STATUS_COUNT - 2 },
      () => "WAITING_P0R_NATIVE_COPY_BOTH_TTY_SESSIONS_ALIVE",
    ),
  ];
  assert.throws(
    () => appendSafeBridgeStatus(saturated, "PASS_P0R_EPHEMERAL_CREDENTIAL_HANDOFF"),
    /bridge_status_count_exceeded/u,
  );

  const root = await mkdtemp(join(await realpath(process.cwd()), ".tmp-p0r-transaction-"));
  try {
    const secure = join(root, "secure.json");
    await writeFile(secure, '{"safe":true}\n', { mode: 0o600 });
    assert.equal(
      (await readSecureControlFile(secure, "fixture")).bytes.toString("utf8"),
      '{"safe":true}\n',
    );

    const linked = join(root, "linked.json");
    await symlink(secure, linked);
    await assert.rejects(
      readSecureControlFile(linked, "fixture_link"),
      /path_not_canonical/u,
    );

    const empty = join(root, "empty.json");
    await writeFile(empty, "", { mode: 0o600 });
    await assert.rejects(readSecureControlFile(empty, "fixture_empty"), /empty/u);

    const oversized = join(root, "oversized.json");
    await writeFile(oversized, Buffer.alloc(MAX_SECURE_CONTROL_FILE_BYTES + 1), {
      mode: 0o600,
    });
    await assert.rejects(readSecureControlFile(oversized, "fixture_large"), /too_large/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("the CLI exposes no detached issuance authorization command", () => {
  assert.throws(() => execFileSync(
    process.execPath,
    ["scripts/v2/production/m1-production-storage-p0r-transaction.mjs", "authorize"],
    { encoding: "utf8", stdio: "pipe" },
  ));
});

test("egress disagreement and dirty source facts fail before a lease exists", () => {
  const target = routeTarget();
  const base = {
    egressA: "156.248.15.36",
    egressB: "156.248.15.36",
    listenerObserverScriptSha256: "e".repeat(64),
    now: NOW,
    plan: {
      credentialGrant: { runId: RUN_ID },
      sourceCommit: SOURCE_COMMIT,
    },
    planSha256: PLAN_SHA256,
    routeTarget: target,
    routeTargetSha256: routeTargetDigest(target),
    sourceFacts: { clean: true, head: SOURCE_COMMIT },
  };
  assert.throws(() => buildTransactionLease({ ...base, egressB: "156.248.15.37" }));
  assert.throws(() => buildTransactionLease({
    ...base,
    sourceFacts: { clean: false, head: SOURCE_COMMIT },
  }));
});
