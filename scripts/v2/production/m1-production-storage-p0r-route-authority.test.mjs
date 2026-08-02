import assert from "node:assert/strict";
import test from "node:test";

import {
  FIXED_LISTENER_UNIT,
  FIXED_SSH_HOST,
  LISTENER_OBSERVATION_SCHEMA,
  REMOTE_LISTENER_OBSERVATION_SCHEMA,
  ROUTE_EVIDENCE_SCHEMA,
  ROUTE_TARGET_SCHEMA,
  TENCENT_API_EXPLORER_CAPTURE_METHOD,
  TENCENT_FIREWALL_CAPTURE_SCHEMA,
  TENCENT_LIGHTHOUSE_API_ACTION,
  TENCENT_LIGHTHOUSE_API_ENDPOINT,
  TENCENT_LIGHTHOUSE_API_VERSION,
  TENCENT_LIGHTHOUSE_PROVIDER,
  buildListenerObservation,
  buildRouteEvidence,
  listenerRemoteCommandSha256,
  routeTargetDigest,
  validateListenerObservation,
  validateRemoteListenerObservation,
  validateRouteTarget,
  validateTencentFirewallCapture,
} from "./m1-production-storage-p0r-route-authority.mjs";

const SOURCE_COMMIT = "a".repeat(40);
const PLAN_SHA256 = "b".repeat(64);
const RUN_ID = "p0r-20990101t000000z-0123456789abcdef0123456789abcdef";
const NOW = "2099-01-01T00:01:30.000Z";

function target() {
  return {
    schemaVersion: ROUTE_TARGET_SCHEMA,
    provider: TENCENT_LIGHTHOUSE_PROVIDER,
    apiEndpoint: TENCENT_LIGHTHOUSE_API_ENDPOINT,
    apiAction: TENCENT_LIGHTHOUSE_API_ACTION,
    apiVersion: TENCENT_LIGHTHOUSE_API_VERSION,
    region: "ap-hongkong",
    instanceId: "lhins-abcdefgh",
    sshHost: FIXED_SSH_HOST,
    sshHostAlias: FIXED_SSH_HOST,
    sshUser: "ubuntu",
    listenerPort: 8022,
    listenerUnit: FIXED_LISTENER_UNIT,
    containsSecret: false,
  };
}

function lease() {
  const routeTarget = target();
  return {
    leaseId: "p0r-lease-20990101t000000000z-0123456789abcdef",
    sourceCommit: SOURCE_COMMIT,
    runId: RUN_ID,
    planSha256: PLAN_SHA256,
    routeTargetSha256: routeTargetDigest(routeTarget),
    createdAt: "2099-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T02:00:00.000Z",
    egress: { ipv4: "156.248.15.36" },
    resources: {
      firewall: {
        direction: "INGRESS",
        port: 8022,
        protocol: "TCP",
        remark: "market-radar-p0r-b9-012345abcdef",
        sourceCidr: "156.248.15.36/32",
      },
      listener: {
        observerScriptSha256: "e".repeat(64),
        port: 8022,
        unit: FIXED_LISTENER_UNIT,
      },
    },
  };
}

function exactRule(overrides = {}) {
  return {
    Action: "ACCEPT",
    AppType: "Custom",
    CidrBlock: "156.248.15.36/32",
    FirewallRuleDescription: "market-radar-p0r-b9-012345abcdef",
    Port: "8022",
    Protocol: "TCP",
    ...overrides,
  };
}

function firewallCapture(rules = [exactRule()]) {
  return {
    schemaVersion: TENCENT_FIREWALL_CAPTURE_SCHEMA,
    provider: TENCENT_LIGHTHOUSE_PROVIDER,
    apiEndpoint: TENCENT_LIGHTHOUSE_API_ENDPOINT,
    apiAction: TENCENT_LIGHTHOUSE_API_ACTION,
    apiVersion: TENCENT_LIGHTHOUSE_API_VERSION,
    region: "ap-hongkong",
    instanceId: "lhins-abcdefgh",
    captureMethod: TENCENT_API_EXPLORER_CAPTURE_METHOD,
    capturedAt: "2099-01-01T00:01:10.000Z",
    pages: [{
      offset: 0,
      limit: 100,
      response: {
        Response: {
          FirewallRuleSet: rules,
          FirewallVersion: 17,
          RequestId: "01234567-89ab-cdef-0123-456789abcdef",
          TotalCount: rules.length,
        },
      },
    }],
    containsSecret: false,
  };
}

function remoteListener(overrides = {}) {
  return {
    schemaVersion: REMOTE_LISTENER_OBSERVATION_SCHEMA,
    checkedAt: "2099-01-01T00:01:20.000Z",
    hostname: "VM-0-9-ubuntu",
    listenerUnit: FIXED_LISTENER_UNIT,
    listenerPort: 8022,
    loadState: "loaded",
    activeState: "active",
    subState: "running",
    mainPid: 4242,
    ipv4ListenerCount: 1,
    ipv6ListenerCount: 0,
    listenerLocalAddress: "0.0.0.0:8022",
    listenerProcessName: "sshd",
    listenerProcessPid: 4242,
    containsSecret: false,
    ...overrides,
  };
}

function listenerObservation(overrides = {}) {
  return {
    ...buildListenerObservation({
      identityPublicKeySha256: "c".repeat(64),
      knownHostsSha256: "d".repeat(64),
      lease: lease(),
      now: NOW,
      remoteObservation: remoteListener(),
      target: target(),
    }),
    ...overrides,
  };
}

test("route target is exact, secret-free and canonically digestible", () => {
  const value = target();
  assert.equal(validateRouteTarget(value), value);
  assert.match(routeTargetDigest(value), /^[a-f0-9]{64}$/u);
  assert.throws(() => validateRouteTarget({ ...value, listenerPort: 22 }));
  assert.throws(() => validateRouteTarget({ ...value, instanceId: "not-an-instance" }));
  assert.throws(() => validateRouteTarget({ ...value, containsSecret: true }));
  assert.throws(() => validateRouteTarget({ ...value, unexpected: true }));
});

test("Tencent capture yields one exact provider rule identity", () => {
  const result = validateTencentFirewallCapture({
    capture: firewallCapture(),
    lease: lease(),
    now: NOW,
    target: target(),
  });
  assert.equal(result.firewallVersion, 17);
  assert.equal(result.firewallTotalCount, 1);
  assert.deepEqual(result.requestIds, ["01234567-89ab-cdef-0123-456789abcdef"]);
  assert.match(result.firewallRuleIdentityHash, /^[a-f0-9]{64}$/u);
});

test("official ICMP shape and complete two-page pagination remain valid", () => {
  const icmpRule = exactRule({
    Action: "ACCEPT",
    AppType: "Ping-ICMP",
    CidrBlock: "0.0.0.0/0",
    FirewallRuleDescription: "",
    Port: "",
    Protocol: "ICMP",
  });
  const nonTargetRules = Array.from({ length: 99 }, (_, index) => exactRule({
    Action: "DROP",
    CidrBlock: "0.0.0.0/0",
    FirewallRuleDescription: `blocked-${index}`,
    Port: String(index + 1),
  }));
  const capture = firewallCapture();
  capture.pages = [
    {
      limit: 100,
      offset: 0,
      response: {
        Response: {
          FirewallRuleSet: [icmpRule, ...nonTargetRules],
          FirewallVersion: 17,
          RequestId: "01234567-89ab-cdef-0123-456789abcdef",
          TotalCount: 101,
        },
      },
    },
    {
      limit: 100,
      offset: 100,
      response: {
        Response: {
          FirewallRuleSet: [exactRule()],
          FirewallVersion: 17,
          RequestId: "11234567-89ab-cdef-0123-456789abcdef",
          TotalCount: 101,
        },
      },
    },
  ];
  const result = validateTencentFirewallCapture({
    capture,
    lease: lease(),
    now: NOW,
    target: target(),
  });
  assert.equal(result.firewallTotalCount, 101);
  assert.deepEqual(result.requestIds, [
    "01234567-89ab-cdef-0123-456789abcdef",
    "11234567-89ab-cdef-0123-456789abcdef",
  ]);

  capture.pages[1].response.Response.RequestId =
    "01234567-89ab-cdef-0123-456789abcdef";
  assert.throws(() => validateTencentFirewallCapture({
    capture,
    lease: lease(),
    now: NOW,
    target: target(),
  }), /firewall_request_id_reused/u);
  capture.pages[1].response.Response.RequestId =
    "11234567-89ab-cdef-0123-456789abcdef";

  capture.pages[1].response.Response.FirewallVersion = 18;
  assert.throws(() => validateTencentFirewallCapture({
    capture,
    lease: lease(),
    now: NOW,
    target: target(),
  }), /firewall_version_drifted/u);
});

test("any extra, broad, multi-port, duplicate or mismatched 8022 allow rule fails closed", () => {
  const cases = [
    [exactRule({ CidrBlock: "0.0.0.0/0" }), /firewall_exact_lease_rule_count_invalid/u],
    [exactRule({ Port: "22,8022" }), /firewall_exact_lease_rule_count_invalid/u],
    [exactRule({ Port: "8000-8080" }), /firewall_exact_lease_rule_count_invalid/u],
    [exactRule({ Action: "DROP" }), /firewall_exact_lease_rule_count_invalid/u],
    [exactRule({ Protocol: "UDP" }), /firewall_exact_lease_rule_count_invalid/u],
    [exactRule({ FirewallRuleDescription: "wrong" }), /firewall_exact_lease_rule_count_invalid/u],
    [exactRule({ Ipv6CidrBlock: "::/0" }), /firewall_exact_lease_rule_count_invalid/u],
  ];
  for (const [rule, expected] of cases) {
    assert.throws(() => validateTencentFirewallCapture({
      capture: firewallCapture([rule]),
      lease: lease(),
      now: NOW,
      target: target(),
    }), expected);
  }

  assert.throws(() => validateTencentFirewallCapture({
    capture: firewallCapture([exactRule(), exactRule()]),
    lease: lease(),
    now: NOW,
    target: target(),
  }), /firewall_exact_lease_rule_count_invalid/u);

  assert.throws(() => validateTencentFirewallCapture({
    capture: firewallCapture([exactRule(), exactRule({ CidrBlock: "0.0.0.0/0", FirewallRuleDescription: "legacy" })]),
    lease: lease(),
    now: NOW,
    target: target(),
  }), /firewall_8022_nonlease_rule_present/u);

  for (const invalidPort of ["0", "65536", "80-80", "80-70000", "80,,81", "-"]) {
    assert.throws(() => validateTencentFirewallCapture({
      capture: firewallCapture([exactRule({ Action: "DROP", Port: invalidPort })]),
      lease: lease(),
      now: NOW,
      target: target(),
    }), /port_invalid/u);
  }
});

test("firewall pagination, response shape, count and version are authoritative", () => {
  const truncated = firewallCapture();
  truncated.pages[0].response.Response.TotalCount = 2;
  assert.throws(() => validateTencentFirewallCapture({
    capture: truncated,
    lease: lease(),
    now: NOW,
    target: target(),
  }), /firewall_capture_truncated/u);

  const extraResponseField = firewallCapture();
  extraResponseField.pages[0].response.Response.Unexpected = true;
  assert.throws(() => validateTencentFirewallCapture({
    capture: extraResponseField,
    lease: lease(),
    now: NOW,
    target: target(),
  }), /keys_invalid/u);

  const arbitraryHash = firewallCapture();
  arbitraryHash.firewallRuleIdentityHash = "e".repeat(64);
  assert.throws(() => validateTencentFirewallCapture({
    capture: arbitraryHash,
    lease: lease(),
    now: NOW,
    target: target(),
  }), /keys_invalid/u);

  const stale = firewallCapture();
  stale.capturedAt = "2099-01-01T00:00:00.000Z";
  assert.throws(() => validateTencentFirewallCapture({
    capture: stale,
    lease: lease(),
    now: "2099-01-01T00:02:01.000Z",
    target: target(),
  }), /firewall_capture_stale/u);
});

test("listener observation binds exact unit, one IPv4 socket, no IPv6 and the main sshd PID", () => {
  const value = listenerObservation();
  assert.equal(value.schemaVersion, LISTENER_OBSERVATION_SCHEMA);
  assert.equal(validateListenerObservation({
    lease: lease(),
    now: NOW,
    observation: value,
    target: target(),
  }), value);
  assert.equal(
    value.remoteCommandSha256,
    listenerRemoteCommandSha256(RUN_ID, "e".repeat(64)),
  );

  for (const overrides of [
    { ipv4ListenerCount: 2 },
    { ipv6ListenerCount: 1 },
    { listenerProcessPid: 4243 },
    { activeState: "inactive" },
    { listenerLocalAddress: "127.0.0.1:8022" },
  ]) {
    assert.throws(() => validateRemoteListenerObservation(
      remoteListener(overrides),
      NOW,
    ));
  }

  assert.throws(() => validateListenerObservation({
    lease: lease(),
    now: NOW,
    observation: listenerObservation({ strictHostKeyChecking: false }),
    target: target(),
  }), /listener_strict_host_key_missing/u);
  assert.throws(() => validateListenerObservation({
    lease: lease(),
    now: NOW,
    observation: listenerObservation({ remoteCommandSha256: "e".repeat(64) }),
    target: target(),
  }), /listener_remote_command_sha_invalid/u);
});

test("route evidence is derived from fresh independent provider and server observations", () => {
  const value = buildRouteEvidence({
    egressA: "156.248.15.36",
    egressB: "156.248.15.36",
    firewallCapture: firewallCapture(),
    lease: lease(),
    listenerObservation: listenerObservation(),
    now: NOW,
    target: target(),
  });
  assert.equal(value.schemaVersion, ROUTE_EVIDENCE_SCHEMA);
  assert.equal(value.firewallProvider, TENCENT_LIGHTHOUSE_PROVIDER);
  assert.equal(value.firewallApiAction, TENCENT_LIGHTHOUSE_API_ACTION);
  assert.equal(value.firewallVersion, 17);
  assert.equal(value.firewallRuleCount, 1);
  assert.equal(value.listenerCount, 1);
  assert.equal(value.listenerIpv6Count, 0);
  assert.equal(value.listenerStrictHostKeyChecking, true);
  assert.match(value.firewallCaptureSha256, /^[a-f0-9]{64}$/u);
  assert.match(value.listenerObservationSha256, /^[a-f0-9]{64}$/u);
  assert.equal(value.containsSecret, false);

  assert.throws(() => buildRouteEvidence({
    egressA: "156.248.15.36",
    egressB: "156.248.15.37",
    firewallCapture: firewallCapture(),
    lease: lease(),
    listenerObservation: listenerObservation(),
    now: NOW,
    target: target(),
  }), /route_egress_b_mismatch/u);

  const wrongTargetLease = lease();
  wrongTargetLease.routeTargetSha256 = "f".repeat(64);
  assert.throws(() => buildRouteEvidence({
    egressA: "156.248.15.36",
    egressB: "156.248.15.36",
    firewallCapture: firewallCapture(),
    lease: wrongTargetLease,
    listenerObservation: listenerObservation(),
    now: NOW,
    target: target(),
  }), /route_target_sha_mismatch/u);
});
