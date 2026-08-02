import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isIPv4 } from "node:net";

import {
  canonicalJson,
} from "./fixed-channel/production-dispatch.mjs";

export const ROUTE_TARGET_SCHEMA =
  "market-radar-v2-m1-p0r-route-target.v1";
export const TENCENT_FIREWALL_CAPTURE_SCHEMA =
  "market-radar-v2-m1-p0r-tencent-firewall-capture.v1";
export const REMOTE_LISTENER_OBSERVATION_SCHEMA =
  "market-radar-v2-m1-p0r-remote-listener-observation.v1";
export const LISTENER_OBSERVATION_SCHEMA =
  "market-radar-v2-m1-p0r-listener-observation.v1";
export const ROUTE_EVIDENCE_SCHEMA =
  "market-radar-v2-m1-p0r-external-route-evidence.v2";
export const TENCENT_LIGHTHOUSE_PROVIDER = "TENCENT_LIGHTHOUSE";
export const TENCENT_LIGHTHOUSE_API_ENDPOINT =
  "lighthouse.tencentcloudapi.com";
export const TENCENT_LIGHTHOUSE_API_ACTION = "DescribeFirewallRules";
export const TENCENT_LIGHTHOUSE_API_VERSION = "2020-03-24";
export const TENCENT_API_EXPLORER_CAPTURE_METHOD =
  "TENCENT_API_EXPLORER_AUTHENTICATED_NATIVE_RESPONSE";
export const FIXED_SSH_HOST = "43.161.202.227";
export const FIXED_SSH_USER = "ubuntu";
export const FIXED_SSH_PORT = 8022;
export const FIXED_LISTENER_UNIT = "market-radar-p0r-8022.service";
export const ROUTE_SOURCE_MAX_AGE_SECONDS = 120;
export const MAX_FIREWALL_RULES = 10_000;
export const FIREWALL_PAGE_LIMIT = 100;

const COMMIT = /^[a-f0-9]{40}$/u;
const RUN_ID = /^p0r-[0-9]{8}t[0-9]{6}z-[a-f0-9]{32}$/u;
const LEASE_ID = /^p0r-lease-[0-9]{8}t[0-9]{9}z-[a-f0-9]{16}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const LIGHTHOUSE_INSTANCE_ID = /^lhins-[a-z0-9]{8,32}$/u;
const TENCENT_REGION = /^ap-[a-z]+(?:-[a-z]+)*$/u;
const REQUEST_ID = /^[A-Za-z0-9-]{8,128}$/u;
const HOSTNAME = /^[A-Za-z0-9._-]{1,253}$/u;
const SAFE_APP_TYPE = /^.{1,128}$/u;
const SAFE_DESCRIPTION = /^.{0,64}$/u;
const SAFE_PORT_EXPRESSION = /^[0-9,-]{1,64}$/u;
const SAFE_CIDR = /^[0-9a-fA-F:./]{1,64}$/u;
const ALLOWED_PROTOCOLS = new Set(["ALL", "ICMP", "ICMPv6", "TCP", "UDP"]);
const ALLOWED_ACTIONS = new Set(["ACCEPT", "DROP"]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label}_invalid`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label}_keys_invalid`);
}

function exactOrOptionalKeys(value, required, optional, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label}_invalid`);
  const keys = Object.keys(value);
  for (const key of required) assert.ok(keys.includes(key), `${label}_${key}_missing`);
  const allowed = new Set([...required, ...optional]);
  assert.ok(keys.every((key) => allowed.has(key)), `${label}_keys_invalid`);
}

function isoDate(value, label) {
  const date = new Date(value);
  assert.ok(Number.isFinite(date.getTime()), `${label}_invalid`);
  assert.equal(date.toISOString(), value, `${label}_not_canonical`);
  return date;
}

function globalIpv4(value) {
  if (!isIPv4(value)) return false;
  const octets = value.split(".").map(Number);
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  return true;
}

function assertFresh({ checkedAt, lease, label, now }) {
  const checked = isoDate(checkedAt, `${label}_checked_at`);
  const observed = isoDate(now, `${label}_observed_at`);
  assert.ok(checked >= isoDate(lease.createdAt, "lease_created_at"), `${label}_before_lease`);
  assert.ok(checked <= observed, `${label}_from_future`);
  assert.ok(observed < isoDate(lease.expiresAt, "lease_expires_at"), `${label}_after_expiry`);
  assert.ok(
    observed.getTime() - checked.getTime() <= ROUTE_SOURCE_MAX_AGE_SECONDS * 1000,
    `${label}_stale`,
  );
  return checked;
}

export function routeTargetDigest(target) {
  validateRouteTarget(target);
  return sha256(Buffer.from(canonicalJson(target)));
}

export function listenerObservationDigest(observation) {
  return sha256(Buffer.from(canonicalJson(observation)));
}

export function firewallRuleIdentityDigest({
  firewallVersion,
  requestIds,
  rule,
  target,
}) {
  validateRouteTarget(target);
  assert.ok(
    Number.isSafeInteger(firewallVersion) && firewallVersion >= 0,
    "firewall_identity_version_invalid",
  );
  assert.ok(Array.isArray(requestIds) && requestIds.length > 0, "firewall_identity_requests_invalid");
  assert.equal(
    new Set(requestIds).size,
    requestIds.length,
    "firewall_identity_request_id_reused",
  );
  for (const requestId of requestIds) {
    assert.ok(REQUEST_ID.test(requestId), "firewall_identity_request_id_invalid");
  }
  const normalizedRule = validateFirewallRule(rule, "identity");
  const identity = {
    apiAction: target.apiAction,
    apiEndpoint: target.apiEndpoint,
    apiVersion: target.apiVersion,
    firewallVersion,
    instanceId: target.instanceId,
    provider: target.provider,
    region: target.region,
    requestIds,
    rule: normalizedRule,
  };
  return sha256(Buffer.from(canonicalJson(identity)));
}

export function validateRouteTarget(target) {
  exactKeys(target, [
    "apiAction",
    "apiEndpoint",
    "apiVersion",
    "containsSecret",
    "instanceId",
    "listenerPort",
    "listenerUnit",
    "provider",
    "region",
    "schemaVersion",
    "sshHost",
    "sshHostAlias",
    "sshUser",
  ], "route_target");
  assert.equal(target.schemaVersion, ROUTE_TARGET_SCHEMA, "route_target_schema_invalid");
  assert.equal(target.provider, TENCENT_LIGHTHOUSE_PROVIDER, "route_target_provider_invalid");
  assert.equal(target.apiEndpoint, TENCENT_LIGHTHOUSE_API_ENDPOINT, "route_target_endpoint_invalid");
  assert.equal(target.apiAction, TENCENT_LIGHTHOUSE_API_ACTION, "route_target_action_invalid");
  assert.equal(target.apiVersion, TENCENT_LIGHTHOUSE_API_VERSION, "route_target_version_invalid");
  assert.ok(TENCENT_REGION.test(target.region), "route_target_region_invalid");
  assert.ok(LIGHTHOUSE_INSTANCE_ID.test(target.instanceId), "route_target_instance_invalid");
  assert.equal(target.sshHost, FIXED_SSH_HOST, "route_target_ssh_host_invalid");
  assert.equal(target.sshHostAlias, FIXED_SSH_HOST, "route_target_ssh_alias_invalid");
  assert.equal(target.sshUser, FIXED_SSH_USER, "route_target_ssh_user_invalid");
  assert.equal(target.listenerPort, FIXED_SSH_PORT, "route_target_listener_port_invalid");
  assert.equal(target.listenerUnit, FIXED_LISTENER_UNIT, "route_target_listener_unit_invalid");
  assert.equal(target.containsSecret, false, "route_target_contains_secret");
  return target;
}

function validateFirewallRule(rule, index) {
  const label = `firewall_rule_${index}`;
  exactOrOptionalKeys(rule, [
    "Action",
    "AppType",
    "CidrBlock",
    "FirewallRuleDescription",
    "Port",
    "Protocol",
  ], ["Ipv6CidrBlock"], label);
  assert.ok(ALLOWED_ACTIONS.has(rule.Action), `${label}_action_invalid`);
  assert.ok(ALLOWED_PROTOCOLS.has(rule.Protocol), `${label}_protocol_invalid`);
  assert.equal(typeof rule.AppType, "string", `${label}_app_type_invalid`);
  assert.ok(SAFE_APP_TYPE.test(rule.AppType), `${label}_app_type_invalid`);
  assert.equal(typeof rule.Port, "string", `${label}_port_invalid`);
  if (rule.Protocol === "ICMP" || rule.Protocol === "ICMPv6") {
    assert.ok(rule.Port === "" || rule.Port === "ALL", `${label}_port_invalid`);
  } else if (rule.Protocol === "ALL") {
    assert.equal(rule.Port, "ALL", `${label}_port_invalid`);
  } else {
    validatePortExpression(rule.Port, label);
  }
  assert.equal(typeof rule.CidrBlock, "string", `${label}_cidr_invalid`);
  assert.ok(rule.CidrBlock === "" || SAFE_CIDR.test(rule.CidrBlock), `${label}_cidr_invalid`);
  if (rule.Ipv6CidrBlock !== undefined) {
    assert.equal(typeof rule.Ipv6CidrBlock, "string", `${label}_ipv6_cidr_invalid`);
    assert.ok(
      rule.Ipv6CidrBlock === "" || SAFE_CIDR.test(rule.Ipv6CidrBlock),
      `${label}_ipv6_cidr_invalid`,
    );
  }
  assert.equal(
    typeof rule.FirewallRuleDescription,
    "string",
    `${label}_description_invalid`,
  );
  assert.ok(
    SAFE_DESCRIPTION.test(rule.FirewallRuleDescription),
    `${label}_description_invalid`,
  );
  return {
    Action: rule.Action,
    AppType: rule.AppType,
    CidrBlock: rule.CidrBlock,
    FirewallRuleDescription: rule.FirewallRuleDescription,
    Ipv6CidrBlock: rule.Ipv6CidrBlock ?? "",
    Port: rule.Port,
    Protocol: rule.Protocol,
  };
}

function validatePortExpression(expression, label) {
  assert.ok(SAFE_PORT_EXPRESSION.test(expression), `${label}_port_invalid`);
  for (const component of expression.split(",")) {
    if (/^[0-9]+$/u.test(component)) {
      const value = Number(component);
      assert.ok(value >= 1 && value <= 65_535, `${label}_port_invalid`);
      continue;
    }
    const range = component.match(/^([0-9]+)-([0-9]+)$/u);
    assert.ok(range, `${label}_port_invalid`);
    const start = Number(range[1]);
    const end = Number(range[2]);
    assert.ok(
      start >= 1 && end <= 65_535 && start < end,
      `${label}_port_invalid`,
    );
  }
}

function portExpressionCovers(expression, port) {
  if (expression === "ALL") return true;
  for (const component of expression.split(",")) {
    if (/^[0-9]+$/u.test(component)) {
      if (Number(component) === port) return true;
      continue;
    }
    const range = component.match(/^([0-9]+)-([0-9]+)$/u);
    assert.ok(range, "firewall_port_expression_invalid");
    const start = Number(range[1]);
    const end = Number(range[2]);
    assert.ok(start >= 1 && end <= 65_535 && start < end, "firewall_port_range_invalid");
    if (start <= port && port <= end) return true;
  }
  return false;
}

function ruleAllowsPort(rule, port) {
  if (rule.Action !== "ACCEPT") return false;
  if (rule.Protocol === "ALL") return true;
  return rule.Protocol === "TCP" && portExpressionCovers(rule.Port, port);
}

export function validateTencentFirewallCapture({ capture, lease, now, target }) {
  validateRouteTarget(target);
  exactKeys(capture, [
    "apiAction",
    "apiEndpoint",
    "apiVersion",
    "captureMethod",
    "capturedAt",
    "containsSecret",
    "instanceId",
    "pages",
    "provider",
    "region",
    "schemaVersion",
  ], "firewall_capture");
  assert.equal(
    capture.schemaVersion,
    TENCENT_FIREWALL_CAPTURE_SCHEMA,
    "firewall_capture_schema_invalid",
  );
  for (const key of ["provider", "apiEndpoint", "apiAction", "apiVersion", "region", "instanceId"]) {
    assert.equal(capture[key], target[key], `firewall_capture_${key}_mismatch`);
  }
  assert.equal(
    capture.captureMethod,
    TENCENT_API_EXPLORER_CAPTURE_METHOD,
    "firewall_capture_method_invalid",
  );
  assert.equal(capture.containsSecret, false, "firewall_capture_contains_secret");
  const capturedAt = assertFresh({
    checkedAt: capture.capturedAt,
    lease,
    label: "firewall_capture",
    now,
  });
  assert.ok(Array.isArray(capture.pages) && capture.pages.length > 0, "firewall_pages_invalid");
  assert.ok(capture.pages.length <= 100, "firewall_pages_excessive");

  let expectedTotal = null;
  let expectedVersion = null;
  const requestIds = new Set();
  const rules = [];
  for (const [pageIndex, page] of capture.pages.entries()) {
    exactKeys(page, ["limit", "offset", "response"], `firewall_page_${pageIndex}`);
    assert.equal(page.offset, pageIndex * FIREWALL_PAGE_LIMIT, "firewall_page_offset_invalid");
    assert.equal(page.limit, FIREWALL_PAGE_LIMIT, "firewall_page_limit_invalid");
    exactKeys(page.response, ["Response"], `firewall_page_${pageIndex}_envelope`);
    const response = page.response.Response;
    exactKeys(response, [
      "FirewallRuleSet",
      "FirewallVersion",
      "RequestId",
      "TotalCount",
    ], `firewall_page_${pageIndex}_response`);
    assert.ok(
      Number.isSafeInteger(response.TotalCount)
        && response.TotalCount >= 0
        && response.TotalCount <= MAX_FIREWALL_RULES,
      "firewall_total_count_invalid",
    );
    assert.ok(
      Number.isSafeInteger(response.FirewallVersion) && response.FirewallVersion >= 0,
      "firewall_version_invalid",
    );
    assert.ok(REQUEST_ID.test(response.RequestId), "firewall_request_id_invalid");
    assert.equal(requestIds.has(response.RequestId), false, "firewall_request_id_reused");
    requestIds.add(response.RequestId);
    assert.ok(Array.isArray(response.FirewallRuleSet), "firewall_rule_set_invalid");
    assert.ok(response.FirewallRuleSet.length <= FIREWALL_PAGE_LIMIT, "firewall_page_overflow");
    if (expectedTotal === null) {
      expectedTotal = response.TotalCount;
      expectedVersion = response.FirewallVersion;
    } else {
      assert.equal(response.TotalCount, expectedTotal, "firewall_total_count_drifted");
      assert.equal(response.FirewallVersion, expectedVersion, "firewall_version_drifted");
    }
    for (const rule of response.FirewallRuleSet) {
      rules.push(validateFirewallRule(rule, rules.length));
    }
  }
  assert.equal(rules.length, expectedTotal, "firewall_capture_truncated");
  assert.equal(
    capture.pages.length,
    Math.max(1, Math.ceil(expectedTotal / FIREWALL_PAGE_LIMIT)),
    "firewall_page_count_invalid",
  );
  for (let index = 0; index < capture.pages.length - 1; index += 1) {
    assert.equal(
      capture.pages[index].response.Response.FirewallRuleSet.length,
      FIREWALL_PAGE_LIMIT,
      "firewall_nonfinal_page_incomplete",
    );
  }

  const desired = lease.resources.firewall;
  const allowed8022Rules = rules.filter((rule) => ruleAllowsPort(rule, desired.port));
  const exactMatches = allowed8022Rules.filter((rule) =>
    rule.Action === "ACCEPT"
      && rule.Protocol === desired.protocol
      && rule.Port === String(desired.port)
      && rule.CidrBlock === desired.sourceCidr
      && rule.Ipv6CidrBlock === ""
      && rule.FirewallRuleDescription === desired.remark);
  assert.equal(exactMatches.length, 1, "firewall_exact_lease_rule_count_invalid");
  assert.equal(allowed8022Rules.length, 1, "firewall_8022_nonlease_rule_present");

  return {
    capturedAt: capturedAt.toISOString(),
    firewallRuleIdentityHash: firewallRuleIdentityDigest({
      firewallVersion: expectedVersion,
      requestIds: [...requestIds],
      rule: exactMatches[0],
      target,
    }),
    firewallTotalCount: expectedTotal,
    firewallVersion: expectedVersion,
    requestIds: [...requestIds],
    rule: exactMatches[0],
  };
}

export function buildListenerRemoteCommand(runId, observerScriptSha256) {
  assert.ok(RUN_ID.test(runId), "listener_remote_run_id_invalid");
  assert.ok(SHA256.test(observerScriptSha256), "listener_observer_script_sha_invalid");
  return `cd /home/ubuntu/.cache/market-radar-v2/p0r/staging/${runId} && printf '%s  %s\\n' '${observerScriptSha256}' './m1-production-storage-p0r-route-listener-observer.sh' | /usr/bin/sha256sum --check --status && exec ./m1-production-storage-p0r-route-listener-observer.sh`;
}

export function listenerRemoteCommandSha256(runId, observerScriptSha256) {
  return sha256(Buffer.from(buildListenerRemoteCommand(runId, observerScriptSha256)));
}

export function validateRemoteListenerObservation(observation, now) {
  exactKeys(observation, [
    "activeState",
    "checkedAt",
    "containsSecret",
    "hostname",
    "ipv4ListenerCount",
    "ipv6ListenerCount",
    "listenerLocalAddress",
    "listenerPort",
    "listenerProcessName",
    "listenerProcessPid",
    "listenerUnit",
    "loadState",
    "mainPid",
    "schemaVersion",
    "subState",
  ], "remote_listener_observation");
  assert.equal(
    observation.schemaVersion,
    REMOTE_LISTENER_OBSERVATION_SCHEMA,
    "remote_listener_schema_invalid",
  );
  assert.equal(observation.containsSecret, false, "remote_listener_contains_secret");
  assert.ok(HOSTNAME.test(observation.hostname), "remote_listener_hostname_invalid");
  assert.equal(observation.listenerUnit, FIXED_LISTENER_UNIT, "remote_listener_unit_invalid");
  assert.equal(observation.listenerPort, FIXED_SSH_PORT, "remote_listener_port_invalid");
  assert.equal(observation.loadState, "loaded", "remote_listener_load_state_invalid");
  assert.equal(observation.activeState, "active", "remote_listener_active_state_invalid");
  assert.equal(observation.subState, "running", "remote_listener_sub_state_invalid");
  assert.ok(Number.isSafeInteger(observation.mainPid) && observation.mainPid > 1, "remote_listener_main_pid_invalid");
  assert.equal(observation.ipv4ListenerCount, 1, "remote_listener_ipv4_count_invalid");
  assert.equal(observation.ipv6ListenerCount, 0, "remote_listener_ipv6_count_invalid");
  assert.ok(
    observation.listenerLocalAddress === `0.0.0.0:${FIXED_SSH_PORT}`
      || observation.listenerLocalAddress === `${FIXED_SSH_HOST}:${FIXED_SSH_PORT}`,
    "remote_listener_address_invalid",
  );
  assert.equal(observation.listenerProcessName, "sshd", "remote_listener_process_invalid");
  assert.equal(
    observation.listenerProcessPid,
    observation.mainPid,
    "remote_listener_process_pid_mismatch",
  );
  const checkedAt = isoDate(observation.checkedAt, "remote_listener_checked_at");
  const observedAt = isoDate(now, "remote_listener_observed_at");
  assert.ok(checkedAt <= observedAt, "remote_listener_from_future");
  assert.ok(
    observedAt.getTime() - checkedAt.getTime() <= ROUTE_SOURCE_MAX_AGE_SECONDS * 1000,
    "remote_listener_stale",
  );
  return observation;
}

export function buildListenerObservation({
  identityPublicKeySha256,
  knownHostsSha256,
  lease,
  now,
  remoteObservation,
  target,
}) {
  validateRouteTarget(target);
  validateRemoteListenerObservation(remoteObservation, now);
  assert.ok(SHA256.test(identityPublicKeySha256), "listener_identity_public_key_sha_invalid");
  assert.ok(SHA256.test(knownHostsSha256), "listener_known_hosts_sha_invalid");
  assert.ok(COMMIT.test(lease.sourceCommit), "listener_lease_source_invalid");
  assert.ok(RUN_ID.test(lease.runId), "listener_lease_run_invalid");
  assert.ok(LEASE_ID.test(lease.leaseId), "listener_lease_id_invalid");
  return {
    schemaVersion: LISTENER_OBSERVATION_SCHEMA,
    leaseId: lease.leaseId,
    sourceCommit: lease.sourceCommit,
    runId: lease.runId,
    checkedAt: remoteObservation.checkedAt,
    sshHost: target.sshHost,
    sshHostAlias: target.sshHostAlias,
    sshUser: target.sshUser,
    listenerActive: true,
    listenerCount: 1,
    listenerPort: target.listenerPort,
    listenerUnit: target.listenerUnit,
    hostname: remoteObservation.hostname,
    mainPid: remoteObservation.mainPid,
    listenerLocalAddress: remoteObservation.listenerLocalAddress,
    listenerProcessName: remoteObservation.listenerProcessName,
    listenerProcessPid: remoteObservation.listenerProcessPid,
    ipv4ListenerCount: remoteObservation.ipv4ListenerCount,
    ipv6ListenerCount: remoteObservation.ipv6ListenerCount,
    strictHostKeyChecking: true,
    knownHostsSha256,
    identityPublicKeySha256,
    remoteCommandSha256: listenerRemoteCommandSha256(
      lease.runId,
      lease.resources.listener.observerScriptSha256,
    ),
    remoteObservationSha256: sha256(Buffer.from(canonicalJson(remoteObservation))),
    containsSecret: false,
  };
}

export function validateListenerObservation({ lease, now, observation, target }) {
  validateRouteTarget(target);
  exactKeys(observation, [
    "checkedAt",
    "containsSecret",
    "hostname",
    "identityPublicKeySha256",
    "ipv4ListenerCount",
    "ipv6ListenerCount",
    "knownHostsSha256",
    "leaseId",
    "listenerActive",
    "listenerCount",
    "listenerLocalAddress",
    "listenerPort",
    "listenerProcessName",
    "listenerProcessPid",
    "listenerUnit",
    "mainPid",
    "remoteCommandSha256",
    "remoteObservationSha256",
    "runId",
    "schemaVersion",
    "sourceCommit",
    "sshHost",
    "sshHostAlias",
    "sshUser",
    "strictHostKeyChecking",
  ], "listener_observation");
  assert.equal(observation.schemaVersion, LISTENER_OBSERVATION_SCHEMA, "listener_schema_invalid");
  assert.equal(observation.containsSecret, false, "listener_contains_secret");
  assert.equal(observation.leaseId, lease.leaseId, "listener_lease_mismatch");
  assert.equal(observation.sourceCommit, lease.sourceCommit, "listener_source_mismatch");
  assert.equal(observation.runId, lease.runId, "listener_run_mismatch");
  for (const key of ["sshHost", "sshHostAlias", "sshUser", "listenerPort", "listenerUnit"]) {
    assert.equal(observation[key], target[key], `listener_${key}_mismatch`);
  }
  assert.ok(HOSTNAME.test(observation.hostname), "listener_hostname_invalid");
  assert.equal(observation.listenerActive, true, "listener_inactive");
  assert.equal(observation.listenerCount, 1, "listener_count_invalid");
  assert.ok(Number.isSafeInteger(observation.mainPid) && observation.mainPid > 1, "listener_main_pid_invalid");
  assert.equal(observation.listenerProcessName, "sshd", "listener_process_invalid");
  assert.equal(observation.listenerProcessPid, observation.mainPid, "listener_pid_mismatch");
  assert.equal(observation.ipv4ListenerCount, 1, "listener_ipv4_count_invalid");
  assert.equal(observation.ipv6ListenerCount, 0, "listener_ipv6_count_invalid");
  assert.ok(
    observation.listenerLocalAddress === `0.0.0.0:${target.listenerPort}`
      || observation.listenerLocalAddress === `${target.sshHost}:${target.listenerPort}`,
    "listener_address_invalid",
  );
  assert.equal(observation.strictHostKeyChecking, true, "listener_strict_host_key_missing");
  assert.ok(SHA256.test(observation.knownHostsSha256), "listener_known_hosts_sha_invalid");
  assert.ok(SHA256.test(observation.identityPublicKeySha256), "listener_public_key_sha_invalid");
  assert.equal(
    observation.remoteCommandSha256,
    listenerRemoteCommandSha256(
      lease.runId,
      lease.resources.listener.observerScriptSha256,
    ),
    "listener_remote_command_sha_invalid",
  );
  assert.ok(SHA256.test(observation.remoteObservationSha256), "listener_remote_observation_sha_invalid");
  assertFresh({ checkedAt: observation.checkedAt, lease, label: "listener", now });
  return observation;
}

export function buildRouteEvidence({
  egressA,
  egressB,
  firewallCapture,
  lease,
  listenerObservation,
  now,
  target,
}) {
  validateRouteTarget(target);
  assert.equal(lease.routeTargetSha256, routeTargetDigest(target), "route_target_sha_mismatch");
  assert.ok(globalIpv4(egressA), "route_egress_a_invalid");
  assert.equal(egressA, lease.egress.ipv4, "route_egress_a_mismatch");
  assert.equal(egressB, lease.egress.ipv4, "route_egress_b_mismatch");
  const firewall = validateTencentFirewallCapture({
    capture: firewallCapture,
    lease,
    now,
    target,
  });
  const listener = validateListenerObservation({
    lease,
    now,
    observation: listenerObservation,
    target,
  });
  const checkedAt = isoDate(now, "route_checked_at");
  return {
    schemaVersion: ROUTE_EVIDENCE_SCHEMA,
    leaseId: lease.leaseId,
    sourceCommit: lease.sourceCommit,
    runId: lease.runId,
    planSha256: lease.planSha256,
    routeTargetSha256: lease.routeTargetSha256,
    checkedAt: checkedAt.toISOString(),
    egressIpv4A: egressA,
    egressIpv4B: egressB,
    listenerActive: listener.listenerActive,
    listenerCount: listener.listenerCount,
    listenerPort: listener.listenerPort,
    listenerUnit: listener.listenerUnit,
    listenerCheckedAt: listener.checkedAt,
    listenerObservationSha256: listenerObservationDigest(listener),
    listenerHostname: listener.hostname,
    listenerMainPid: listener.mainPid,
    listenerIpv4Count: listener.ipv4ListenerCount,
    listenerIpv6Count: listener.ipv6ListenerCount,
    listenerLocalAddress: listener.listenerLocalAddress,
    listenerProcessName: listener.listenerProcessName,
    listenerProcessPid: listener.listenerProcessPid,
    listenerStrictHostKeyChecking: listener.strictHostKeyChecking,
    listenerKnownHostsSha256: listener.knownHostsSha256,
    listenerIdentityPublicKeySha256: listener.identityPublicKeySha256,
    listenerRemoteCommandSha256: listener.remoteCommandSha256,
    listenerRemoteObservationSha256: listener.remoteObservationSha256,
    firewallRuleCount: 1,
    firewallRuleIdentityHash: firewall.firewallRuleIdentityHash,
    firewallRuleAction: firewall.rule.Action,
    firewallRuleAppType: firewall.rule.AppType,
    firewallRuleIpv6Cidr: firewall.rule.Ipv6CidrBlock,
    firewallSourceCidr: firewall.rule.CidrBlock,
    firewallDirection: lease.resources.firewall.direction,
    firewallProtocol: firewall.rule.Protocol,
    firewallPort: Number(firewall.rule.Port),
    firewallRemark: firewall.rule.FirewallRuleDescription,
    firewallProvider: target.provider,
    firewallApiAction: target.apiAction,
    firewallApiVersion: target.apiVersion,
    firewallRegion: target.region,
    firewallInstanceId: target.instanceId,
    firewallVersion: firewall.firewallVersion,
    firewallTotalCount: firewall.firewallTotalCount,
    firewallRequestIds: firewall.requestIds,
    firewallCapturedAt: firewall.capturedAt,
    firewallCaptureSha256: sha256(Buffer.from(canonicalJson(firewallCapture))),
    containsSecret: false,
  };
}
