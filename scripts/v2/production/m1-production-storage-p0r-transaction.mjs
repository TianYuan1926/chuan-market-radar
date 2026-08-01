#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isIPv4 } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { validateP0RCosProvisioningPlan } from "./m1-production-storage-p0r-cos-provisioning.mjs";

const execFileAsync = promisify(execFile);

export const TRANSACTION_SCHEMA =
  "market-radar-v2-m1-p0r-external-transaction.v1";
export const READY_EVIDENCE_SCHEMA =
  "market-radar-v2-m1-p0r-external-ready-evidence.v1";
export const ROUTE_EVIDENCE_SCHEMA =
  "market-radar-v2-m1-p0r-external-route-evidence.v1";
export const CLEANUP_EVIDENCE_SCHEMA =
  "market-radar-v2-m1-p0r-external-cleanup-evidence.v1";
export const TRANSACTION_RESULT_SCHEMA =
  "market-radar-v2-m1-p0r-external-transaction-result.v1";
export const TRANSACTION_TTL_SECONDS = 7200;
export const CLIPBOARD_WAIT_SECONDS = 1200;
export const ROUTE_EVIDENCE_MAX_AGE_SECONDS = 120;
export const CLEANUP_EVIDENCE_MAX_AGE_SECONDS = 120;
export const FIXED_SSH_PORT = 8022;
export const FIXED_LISTENER_UNIT = "market-radar-p0r-8022.service";
export const FIXED_FIREWALL_REMARK_PREFIX = "market-radar-p0r-b9-";
export const MAX_SAFE_BRIDGE_OUTPUT_BYTES = 65_536;
export const MAX_SAFE_BRIDGE_STATUS_COUNT = 64;
export const MAX_SECURE_CONTROL_FILE_BYTES = 1_048_576;

const SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SOURCE_DIRECTORY, "../../..");
const BRIDGE_PATH = resolve(
  SOURCE_DIRECTORY,
  "m1-production-storage-p0r-local-tty-bridge.exp",
);
const CURL_PATH = "/usr/bin/curl";
const EXPECT_PATH = "/usr/bin/expect";
const GIT_PATH = "/usr/bin/git";
const EGRESS_ENDPOINTS = Object.freeze([
  "https://api.ipify.org",
  "https://ifconfig.me/ip",
]);
const COMMIT = /^[a-f0-9]{40}$/u;
const RUN_ID = /^p0r-[0-9]{8}t[0-9]{6}z-[a-f0-9]{32}$/u;
const LEASE_ID = /^p0r-lease-[0-9]{8}t[0-9]{9}z-[a-f0-9]{16}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_REASON = /^[a-z0-9_]{1,128}$/u;
const SAFE_BRIDGE_STATUSES = new Set([
  "BLOCKED_P0R_LOCAL_TTY_BRIDGE",
  "PASS_P0R_AGE_IDENTITY_HANDOFF",
  "PASS_P0R_BOTH_TTY_SESSIONS_PREARMED",
  "PASS_P0R_EPHEMERAL_CREDENTIAL_HANDOFF",
  "PASS_P0R_LOCAL_TTY_BRIDGE",
  "READY_P0R_API_NATIVE_COPY_TO_LOCAL_TTY_BRIDGE",
  "WAITING_P0R_NATIVE_COPY_BOTH_TTY_SESSIONS_ALIVE",
]);
const BRIDGE_STATUS = Object.freeze({
  blocked: "BLOCKED_P0R_LOCAL_TTY_BRIDGE",
  ageHandoff: "PASS_P0R_AGE_IDENTITY_HANDOFF",
  prearmed: "PASS_P0R_BOTH_TTY_SESSIONS_PREARMED",
  credentialHandoff: "PASS_P0R_EPHEMERAL_CREDENTIAL_HANDOFF",
  passed: "PASS_P0R_LOCAL_TTY_BRIDGE",
  ready: "READY_P0R_API_NATIVE_COPY_TO_LOCAL_TTY_BRIDGE",
  heartbeat: "WAITING_P0R_NATIVE_COPY_BOTH_TTY_SESSIONS_ALIVE",
});
const BRIDGE_TRANSITIONS = Object.freeze({
  EMPTY: Object.freeze({
    [BRIDGE_STATUS.blocked]: "BLOCKED",
    [BRIDGE_STATUS.prearmed]: "PREARMED",
  }),
  PREARMED: Object.freeze({
    [BRIDGE_STATUS.blocked]: "BLOCKED",
    [BRIDGE_STATUS.ready]: "WAITING_FOR_CREDENTIAL",
  }),
  WAITING_FOR_CREDENTIAL: Object.freeze({
    [BRIDGE_STATUS.blocked]: "BLOCKED",
    [BRIDGE_STATUS.credentialHandoff]: "CREDENTIAL_HANDED_OFF",
    [BRIDGE_STATUS.heartbeat]: "WAITING_FOR_CREDENTIAL",
  }),
  CREDENTIAL_HANDED_OFF: Object.freeze({
    [BRIDGE_STATUS.ageHandoff]: "AGE_HANDED_OFF",
    [BRIDGE_STATUS.blocked]: "BLOCKED",
  }),
  AGE_HANDED_OFF: Object.freeze({
    [BRIDGE_STATUS.blocked]: "BLOCKED",
    [BRIDGE_STATUS.passed]: "PASSED",
  }),
  PASSED: Object.freeze({}),
  BLOCKED: Object.freeze({}),
});
const CLEANUP_REQUIRED = Object.freeze([
  "bridge_process",
  "clipboard",
  "listener_unit",
  "listener_socket",
  "firewall_rule",
  "dev_shm_secret",
  "p0r_process",
  "temporary_container",
  "temporary_volume",
  "run_staging",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactKeys(value, expected, label) {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label}_keys_invalid`);
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

function isoDate(value, label) {
  const date = new Date(value);
  assert.ok(Number.isFinite(date.getTime()), `${label}_invalid`);
  assert.equal(date.toISOString(), value, `${label}_not_canonical`);
  return date;
}

export function buildTransactionLease({ egressA, egressB, now, plan, planSha256, sourceFacts }) {
  assert.ok(plan && typeof plan === "object" && !Array.isArray(plan), "plan_invalid");
  assert.ok(COMMIT.test(plan.sourceCommit), "plan_source_commit_invalid");
  const runId = plan.credentialGrant?.runId;
  assert.ok(RUN_ID.test(runId), "plan_run_id_invalid");
  assert.ok(SHA256.test(planSha256), "plan_sha256_invalid");
  assert.deepEqual(
    sourceFacts,
    { clean: true, head: plan.sourceCommit },
    "source_not_clean_exact_plan_commit",
  );
  assert.ok(globalIpv4(egressA), "egress_a_invalid");
  assert.equal(egressB, egressA, "egress_endpoints_disagree");
  const createdAt = isoDate(now, "created_at");
  const expiresAt = new Date(createdAt.getTime() + TRANSACTION_TTL_SECONDS * 1000);
  const leaseId = `p0r-lease-${createdAt.toISOString().replaceAll(/[-:.]/gu, "").toLowerCase()}-${randomBytes(8).toString("hex")}`;
  const firewallRemark = `${FIXED_FIREWALL_REMARK_PREFIX}${runId.slice(-12)}`;
  return {
    schemaVersion: TRANSACTION_SCHEMA,
    leaseId,
    owner: "market-radar-v2-p0r-transaction-coordinator",
    sourceCommit: plan.sourceCommit,
    runId,
    planSha256,
    phase: "PREPARED_NO_PRODUCTION_MUTATION",
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ttlSeconds: TRANSACTION_TTL_SECONDS,
    egress: {
      endpointCount: 2,
      ipv4: egressA,
      cidr: `${egressA}/32`,
      recheckRequiredBeforeRouteAndBeforeBridge: true,
    },
    resources: {
      bridge: {
        bothSessionsPrearmedBeforeIssuance: true,
        clipboardWaitSeconds: CLIPBOARD_WAIT_SECONDS,
        postIssuanceReconnectRequired: false,
      },
      firewall: {
        direction: "INGRESS",
        port: FIXED_SSH_PORT,
        protocol: "TCP",
        remark: firewallRemark,
        sourceCidr: `${egressA}/32`,
      },
      listener: {
        port: FIXED_SSH_PORT,
        runtimeMaxSeconds: TRANSACTION_TTL_SECONDS,
        unit: FIXED_LISTENER_UNIT,
      },
    },
    cleanupRequired: [...CLEANUP_REQUIRED],
    issuanceAllowed: false,
    containsSecret: false,
  };
}

export function validateTransactionLease(lease) {
  exactKeys(lease, [
    "cleanupRequired",
    "containsSecret",
    "createdAt",
    "egress",
    "expiresAt",
    "issuanceAllowed",
    "leaseId",
    "owner",
    "phase",
    "planSha256",
    "resources",
    "runId",
    "schemaVersion",
    "sourceCommit",
    "ttlSeconds",
  ], "transaction_lease");
  assert.equal(lease.schemaVersion, TRANSACTION_SCHEMA, "lease_schema_invalid");
  assert.ok(LEASE_ID.test(lease.leaseId), "lease_id_invalid");
  assert.equal(
    lease.owner,
    "market-radar-v2-p0r-transaction-coordinator",
    "lease_owner_invalid",
  );
  assert.ok(COMMIT.test(lease.sourceCommit), "lease_source_commit_invalid");
  assert.ok(RUN_ID.test(lease.runId), "lease_run_id_invalid");
  assert.ok(SHA256.test(lease.planSha256), "lease_plan_sha256_invalid");
  assert.equal(lease.phase, "PREPARED_NO_PRODUCTION_MUTATION", "lease_phase_invalid");
  assert.equal(lease.ttlSeconds, TRANSACTION_TTL_SECONDS, "lease_ttl_invalid");
  const createdAt = isoDate(lease.createdAt, "lease_created_at");
  const expiresAt = isoDate(lease.expiresAt, "lease_expires_at");
  assert.equal(
    expiresAt.getTime() - createdAt.getTime(),
    TRANSACTION_TTL_SECONDS * 1000,
    "lease_expiry_interval_invalid",
  );
  exactKeys(lease.egress, [
    "cidr",
    "endpointCount",
    "ipv4",
    "recheckRequiredBeforeRouteAndBeforeBridge",
  ], "lease_egress");
  assert.equal(lease.egress.endpointCount, EGRESS_ENDPOINTS.length, "lease_egress_count_invalid");
  assert.ok(globalIpv4(lease.egress.ipv4), "lease_egress_ipv4_invalid");
  assert.equal(lease.egress.cidr, `${lease.egress.ipv4}/32`, "lease_egress_cidr_invalid");
  assert.equal(
    lease.egress.recheckRequiredBeforeRouteAndBeforeBridge,
    true,
    "lease_egress_recheck_invalid",
  );
  exactKeys(lease.resources, ["bridge", "firewall", "listener"], "lease_resources");
  exactKeys(lease.resources.bridge, [
    "bothSessionsPrearmedBeforeIssuance",
    "clipboardWaitSeconds",
    "postIssuanceReconnectRequired",
  ], "lease_bridge");
  assert.equal(
    lease.resources.bridge.bothSessionsPrearmedBeforeIssuance,
    true,
    "lease_dual_prearm_invalid",
  );
  assert.equal(
    lease.resources.bridge.clipboardWaitSeconds,
    CLIPBOARD_WAIT_SECONDS,
    "lease_clipboard_window_invalid",
  );
  assert.equal(
    lease.resources.bridge.postIssuanceReconnectRequired,
    false,
    "lease_post_issuance_reconnect_invalid",
  );
  exactKeys(lease.resources.firewall, [
    "direction",
    "port",
    "protocol",
    "remark",
    "sourceCidr",
  ], "lease_firewall");
  assert.equal(lease.resources.firewall.direction, "INGRESS", "lease_firewall_direction_invalid");
  assert.equal(lease.resources.firewall.port, FIXED_SSH_PORT, "lease_firewall_port_invalid");
  assert.equal(lease.resources.firewall.protocol, "TCP", "lease_firewall_protocol_invalid");
  assert.equal(
    lease.resources.firewall.sourceCidr,
    lease.egress.cidr,
    "lease_firewall_source_invalid",
  );
  assert.equal(
    lease.resources.firewall.remark,
    `${FIXED_FIREWALL_REMARK_PREFIX}${lease.runId.slice(-12)}`,
    "lease_firewall_remark_invalid",
  );
  exactKeys(lease.resources.listener, ["port", "runtimeMaxSeconds", "unit"], "lease_listener");
  assert.equal(lease.resources.listener.port, FIXED_SSH_PORT, "lease_listener_port_invalid");
  assert.equal(
    lease.resources.listener.runtimeMaxSeconds,
    TRANSACTION_TTL_SECONDS,
    "lease_listener_runtime_invalid",
  );
  assert.equal(lease.resources.listener.unit, FIXED_LISTENER_UNIT, "lease_listener_unit_invalid");
  assert.deepEqual(lease.cleanupRequired, CLEANUP_REQUIRED, "lease_cleanup_scope_invalid");
  assert.equal(lease.issuanceAllowed, false, "lease_preauthorized_forbidden");
  assert.equal(lease.containsSecret, false, "lease_contains_secret");
  return lease;
}

export function authorizeIssuance(lease, evidence) {
  validateTransactionLease(lease);
  exactKeys(evidence, [
    "bridgeClipboardSentinelArmed",
    "checkedAt",
    "containsSecret",
    "egressIpv4A",
    "egressIpv4B",
    "firewallRuleCount",
    "leaseId",
    "listenerActive",
    "listenerCount",
    "planSha256",
    "postIssuanceReconnectRequired",
    "primaryTtyReady",
    "runId",
    "schemaVersion",
    "secondaryTtyReady",
    "sourceCommit",
  ], "ready_evidence");
  assert.equal(evidence.schemaVersion, READY_EVIDENCE_SCHEMA, "ready_schema_invalid");
  assert.equal(evidence.containsSecret, false, "ready_evidence_contains_secret");
  assert.equal(evidence.leaseId, lease.leaseId, "ready_lease_mismatch");
  assert.equal(evidence.sourceCommit, lease.sourceCommit, "ready_source_mismatch");
  assert.equal(evidence.runId, lease.runId, "ready_run_mismatch");
  assert.equal(evidence.planSha256, lease.planSha256, "ready_plan_mismatch");
  assert.equal(evidence.egressIpv4A, lease.egress.ipv4, "ready_egress_a_mismatch");
  assert.equal(evidence.egressIpv4B, lease.egress.ipv4, "ready_egress_b_mismatch");
  assert.equal(evidence.listenerActive, true, "ready_listener_inactive");
  assert.equal(evidence.listenerCount, 1, "ready_listener_count_invalid");
  assert.equal(evidence.firewallRuleCount, 1, "ready_firewall_count_invalid");
  assert.equal(evidence.primaryTtyReady, true, "ready_primary_tty_absent");
  assert.equal(evidence.secondaryTtyReady, true, "ready_secondary_tty_absent");
  assert.equal(
    evidence.bridgeClipboardSentinelArmed,
    true,
    "ready_clipboard_sentinel_absent",
  );
  assert.equal(
    evidence.postIssuanceReconnectRequired,
    false,
    "ready_post_issuance_reconnect_forbidden",
  );
  const checkedAt = isoDate(evidence.checkedAt, "ready_checked_at");
  assert.ok(checkedAt >= isoDate(lease.createdAt, "lease_created_at"), "ready_before_lease");
  assert.ok(checkedAt < isoDate(lease.expiresAt, "lease_expires_at"), "ready_after_expiry");
  return {
    ...lease,
    phase: "ISSUANCE_AUTHORIZED_BOTH_TTYS_PREARMED",
    issuanceAllowed: true,
    readyCheckedAt: checkedAt.toISOString(),
  };
}

export function validateRouteEvidence(lease, evidence, now) {
  validateTransactionLease(lease);
  exactKeys(evidence, [
    "checkedAt",
    "containsSecret",
    "egressIpv4A",
    "egressIpv4B",
    "firewallDirection",
    "firewallPort",
    "firewallProtocol",
    "firewallRemark",
    "firewallRuleCount",
    "firewallRuleIdentityHash",
    "firewallSourceCidr",
    "leaseId",
    "listenerActive",
    "listenerCount",
    "listenerPort",
    "listenerUnit",
    "planSha256",
    "runId",
    "schemaVersion",
    "sourceCommit",
  ], "route_evidence");
  assert.equal(evidence.schemaVersion, ROUTE_EVIDENCE_SCHEMA, "route_schema_invalid");
  assert.equal(evidence.containsSecret, false, "route_evidence_contains_secret");
  assert.equal(evidence.leaseId, lease.leaseId, "route_lease_mismatch");
  assert.equal(evidence.sourceCommit, lease.sourceCommit, "route_source_mismatch");
  assert.equal(evidence.runId, lease.runId, "route_run_mismatch");
  assert.equal(evidence.planSha256, lease.planSha256, "route_plan_mismatch");
  assert.equal(evidence.egressIpv4A, lease.egress.ipv4, "route_egress_a_mismatch");
  assert.equal(evidence.egressIpv4B, lease.egress.ipv4, "route_egress_b_mismatch");
  assert.equal(evidence.listenerActive, true, "route_listener_inactive");
  assert.equal(evidence.listenerCount, 1, "route_listener_count_invalid");
  assert.equal(evidence.listenerPort, lease.resources.listener.port, "route_listener_port_invalid");
  assert.equal(evidence.listenerUnit, lease.resources.listener.unit, "route_listener_unit_invalid");
  assert.equal(evidence.firewallRuleCount, 1, "route_firewall_count_invalid");
  assert.equal(
    evidence.firewallSourceCidr,
    lease.resources.firewall.sourceCidr,
    "route_firewall_source_invalid",
  );
  assert.equal(
    evidence.firewallDirection,
    lease.resources.firewall.direction,
    "route_firewall_direction_invalid",
  );
  assert.equal(
    evidence.firewallProtocol,
    lease.resources.firewall.protocol,
    "route_firewall_protocol_invalid",
  );
  assert.equal(evidence.firewallPort, lease.resources.firewall.port, "route_firewall_port_invalid");
  assert.equal(
    evidence.firewallRemark,
    lease.resources.firewall.remark,
    "route_firewall_remark_invalid",
  );
  assert.ok(
    SHA256.test(evidence.firewallRuleIdentityHash),
    "route_firewall_identity_hash_invalid",
  );
  const checkedAt = isoDate(evidence.checkedAt, "route_checked_at");
  const observedAt = isoDate(now, "route_observed_at");
  assert.ok(checkedAt >= isoDate(lease.createdAt, "lease_created_at"), "route_before_lease");
  assert.ok(checkedAt <= observedAt, "route_from_future");
  assert.ok(observedAt < isoDate(lease.expiresAt, "lease_expires_at"), "route_after_expiry");
  assert.ok(
    observedAt.getTime() - checkedAt.getTime() <= ROUTE_EVIDENCE_MAX_AGE_SECONDS * 1000,
    "route_evidence_stale",
  );
  return evidence;
}

export function authorizeBridgeReady({ lease, now, routeEvidence, statuses }) {
  validateRouteEvidence(lease, routeEvidence, now);
  assert.deepEqual(statuses, [BRIDGE_STATUS.prearmed], "bridge_ready_prefix_invalid");
  return authorizeIssuance(lease, {
    schemaVersion: READY_EVIDENCE_SCHEMA,
    leaseId: lease.leaseId,
    sourceCommit: lease.sourceCommit,
    runId: lease.runId,
    planSha256: lease.planSha256,
    checkedAt: now,
    egressIpv4A: routeEvidence.egressIpv4A,
    egressIpv4B: routeEvidence.egressIpv4B,
    listenerActive: routeEvidence.listenerActive,
    listenerCount: routeEvidence.listenerCount,
    firewallRuleCount: routeEvidence.firewallRuleCount,
    primaryTtyReady: true,
    secondaryTtyReady: true,
    bridgeClipboardSentinelArmed: true,
    postIssuanceReconnectRequired: false,
    containsSecret: false,
  });
}

export function closeTransaction(lease, evidence, now) {
  validateTransactionLease(lease);
  exactKeys(evidence, [
    "bridgeProcessCount",
    "checkedAt",
    "clipboardCleared",
    "containsSecret",
    "firewallRuleCount",
    "leaseId",
    "listenerActive",
    "listenerCount",
    "p0rContainerCount",
    "p0rProcessCount",
    "p0rSecretFileCount",
    "p0rVolumeCount",
    "runId",
    "runStagingCount",
    "schemaVersion",
    "sourceCommit",
  ], "cleanup_evidence");
  assert.equal(evidence.schemaVersion, CLEANUP_EVIDENCE_SCHEMA, "cleanup_schema_invalid");
  assert.equal(evidence.containsSecret, false, "cleanup_evidence_contains_secret");
  assert.equal(evidence.leaseId, lease.leaseId, "cleanup_lease_mismatch");
  assert.equal(evidence.sourceCommit, lease.sourceCommit, "cleanup_source_mismatch");
  assert.equal(evidence.runId, lease.runId, "cleanup_run_mismatch");
  assert.equal(evidence.listenerActive, false, "cleanup_listener_still_active");
  assert.equal(evidence.clipboardCleared, true, "cleanup_clipboard_not_cleared");
  for (const key of [
    "bridgeProcessCount",
    "firewallRuleCount",
    "listenerCount",
    "p0rContainerCount",
    "p0rProcessCount",
    "p0rSecretFileCount",
    "p0rVolumeCount",
    "runStagingCount",
  ]) assert.equal(evidence[key], 0, `cleanup_${key}_nonzero`);
  const checkedAt = isoDate(evidence.checkedAt, "cleanup_checked_at");
  assert.ok(checkedAt >= isoDate(lease.createdAt, "lease_created_at"), "cleanup_before_lease");
  const observedAt = isoDate(now, "cleanup_observed_at");
  assert.ok(checkedAt <= observedAt, "cleanup_from_future");
  assert.ok(
    observedAt.getTime() - checkedAt.getTime() <= CLEANUP_EVIDENCE_MAX_AGE_SECONDS * 1000,
    "cleanup_evidence_stale",
  );
  return {
    schemaVersion: TRANSACTION_RESULT_SCHEMA,
    leaseId: lease.leaseId,
    sourceCommit: lease.sourceCommit,
    runId: lease.runId,
    phase: "CLOSED_ZERO_TEMPORARY_RESIDUE",
    checkedAt: checkedAt.toISOString(),
    containsSecret: false,
  };
}

export function parseSafeBridgeLine(line) {
  const value = JSON.parse(line);
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "bridge_line_invalid");
  exactKeys(
    value,
    value.reason === undefined
      ? ["containsSecret", "status"]
      : ["containsSecret", "reason", "status"],
    "bridge_line",
  );
  assert.equal(value.containsSecret, false, "bridge_line_secret_boundary_invalid");
  assert.ok(SAFE_BRIDGE_STATUSES.has(value.status), "bridge_status_invalid");
  if (value.status === "BLOCKED_P0R_LOCAL_TTY_BRIDGE") {
    assert.ok(SAFE_REASON.test(value.reason), "bridge_reason_invalid");
  } else {
    assert.equal(value.reason, undefined, "bridge_reason_for_pass_forbidden");
  }
  return value;
}

function bridgeSequenceState(statuses) {
  assert.ok(Array.isArray(statuses), "bridge_statuses_invalid");
  assert.ok(
    statuses.length <= MAX_SAFE_BRIDGE_STATUS_COUNT,
    "bridge_status_count_exceeded",
  );
  let state = "EMPTY";
  for (const status of statuses) {
    assert.ok(SAFE_BRIDGE_STATUSES.has(status), "bridge_status_invalid");
    const nextState = BRIDGE_TRANSITIONS[state][status];
    assert.ok(nextState, `bridge_status_transition_invalid_${state.toLowerCase()}`);
    state = nextState;
  }
  return state;
}

export function appendSafeBridgeStatus(statuses, status) {
  assert.ok(Array.isArray(statuses), "bridge_statuses_invalid");
  assert.ok(
    statuses.length < MAX_SAFE_BRIDGE_STATUS_COUNT,
    "bridge_status_count_exceeded",
  );
  assert.ok(SAFE_BRIDGE_STATUSES.has(status), "bridge_status_invalid");
  const state = bridgeSequenceState(statuses);
  const nextState = BRIDGE_TRANSITIONS[state][status];
  assert.ok(nextState, `bridge_status_transition_invalid_${state.toLowerCase()}`);
  statuses.push(status);
  return nextState;
}

export function validateSuccessfulBridgeStatuses(statuses) {
  assert.equal(bridgeSequenceState(statuses), "PASSED", "bridge_terminal_state_invalid");
  return statuses;
}

function assertStableFileIdentity(before, after, label) {
  for (const field of [
    "dev",
    "ino",
    "mode",
    "nlink",
    "uid",
    "gid",
    "size",
    "mtimeNs",
    "ctimeNs",
  ]) {
    assert.equal(after[field], before[field], `${label}_${field}_changed_during_read`);
  }
}

export async function readSecureControlFile(path, label) {
  const resolved = resolve(path);
  const canonicalParent = await realpath(dirname(resolved));
  assert.equal(canonicalParent, dirname(resolved), `${label}_parent_not_canonical`);
  assert.equal(await realpath(resolved), resolved, `${label}_path_not_canonical`);
  const handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    assert.ok(before.isFile(), `${label}_not_regular`);
    assert.equal(before.mode & 0o077n, 0n, `${label}_mode_too_open`);
    if (typeof process.getuid === "function") {
      assert.equal(before.uid, BigInt(process.getuid()), `${label}_owner_invalid`);
    }
    assert.ok(before.size > 0n, `${label}_empty`);
    assert.ok(
      before.size <= BigInt(MAX_SECURE_CONTROL_FILE_BYTES),
      `${label}_too_large`,
    );

    const bounded = Buffer.alloc(MAX_SECURE_CONTROL_FILE_BYTES + 1);
    let length = 0;
    while (length < bounded.length) {
      const { bytesRead } = await handle.read(
        bounded,
        length,
        bounded.length - length,
        null,
      );
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    assert.ok(length > 0, `${label}_empty`);
    assert.ok(length <= MAX_SECURE_CONTROL_FILE_BYTES, `${label}_too_large`);

    const after = await handle.stat({ bigint: true });
    assertStableFileIdentity(before, after, label);
    const pathFacts = await lstat(resolved, { bigint: true });
    assertStableFileIdentity(before, pathFacts, label);
    assert.equal(await realpath(resolved), resolved, `${label}_path_changed_during_read`);
    return { bytes: bounded.subarray(0, length), path: resolved };
  } finally {
    await handle.close();
  }
}

async function readSecureJson(path, label) {
  const source = await readSecureControlFile(path, label);
  return { ...source, value: JSON.parse(source.bytes.toString("utf8")) };
}

async function writeExclusiveJson(path, value) {
  const resolved = resolve(path);
  const parent = await realpath(dirname(resolved));
  assert.equal(dirname(resolved), parent, "output_parent_not_canonical");
  const handle = await open(resolved, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function sourceFacts(expectedHead) {
  const [{ stdout: head }, { stdout: status }] = await Promise.all([
    execFileAsync(GIT_PATH, ["-C", REPOSITORY_ROOT, "rev-parse", "HEAD"]),
    execFileAsync(GIT_PATH, ["-C", REPOSITORY_ROOT, "status", "--porcelain=v1"]),
  ]);
  assert.ok(COMMIT.test(expectedHead), "expected_source_commit_invalid");
  return { clean: status.trim() === "", head: head.trim() };
}

async function clearClipboard() {
  await new Promise((resolveClear, reject) => {
    const child = spawn("/usr/bin/pbcopy", [], { stdio: ["pipe", "ignore", "ignore"] });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolveClear();
      else reject(new Error("clipboard_clear_failed"));
    });
    child.stdin.end("MARKET_RADAR_P0R_CLIPBOARD_CLEARED_BY_TRANSACTION");
  });
}

async function measureEgress() {
  const values = [];
  for (const endpoint of EGRESS_ENDPOINTS) {
    const { stdout } = await execFileAsync(CURL_PATH, [
      "--silent",
      "--show-error",
      "--fail",
      "--max-time",
      "15",
      "--socks5-hostname",
      "127.0.0.1:7892",
      endpoint,
    ]);
    values.push(stdout.trim());
  }
  return values;
}

function parseOptions(argv) {
  const [command, ...tail] = argv;
  const options = {};
  for (let index = 0; index < tail.length; index += 2) {
    const name = tail[index];
    const value = tail[index + 1];
    assert.ok(name?.startsWith("--") && value !== undefined, "arguments_invalid");
    const key = name.slice(2);
    assert.equal(options[key], undefined, `duplicate_option_${key}`);
    options[key] = value;
  }
  return { command, options };
}

async function createLease(options) {
  exactKeys(options, ["output", "plan"], "create_options");
  const planSource = await readSecureJson(options.plan, "plan");
  validateP0RCosProvisioningPlan(planSource.value);
  const facts = await sourceFacts(planSource.value.sourceCommit);
  const [egressA, egressB] = await measureEgress();
  const lease = buildTransactionLease({
    egressA,
    egressB,
    now: new Date().toISOString(),
    plan: planSource.value,
    planSha256: sha256(planSource.bytes),
    sourceFacts: {
      clean: facts.clean,
      head: facts.head,
    },
  });
  await writeExclusiveJson(options.output, lease);
  process.stdout.write(`${JSON.stringify({
    containsSecret: false,
    egressCidr: lease.egress.cidr,
    leaseId: lease.leaseId,
    status: "PASS_P0R_TRANSACTION_LEASE_CREATED",
  })}\n`);
}

async function runBridgeOnce(options) {
  exactKeys(options, ["lease", "plan", "result", "route-evidence"], "execute_options");
  const leaseSource = await readSecureJson(options.lease, "lease");
  const planSource = await readSecureControlFile(options.plan, "plan");
  const routeSource = await readSecureJson(options["route-evidence"], "route_evidence");
  const lease = validateTransactionLease(leaseSource.value);
  const plan = validateP0RCosProvisioningPlan(JSON.parse(planSource.bytes.toString("utf8")));
  assert.equal(sha256(planSource.bytes), lease.planSha256, "lease_plan_sha_mismatch");
  assert.equal(plan.sourceCommit, lease.sourceCommit, "lease_plan_source_mismatch");
  assert.equal(plan.credentialGrant.runId, lease.runId, "lease_plan_run_mismatch");
  const facts = await sourceFacts(lease.sourceCommit);
  assert.deepEqual(
    { clean: facts.clean, head: facts.head },
    { clean: true, head: lease.sourceCommit },
    "source_not_clean_exact_lease_commit",
  );
  const [egressA, egressB] = await measureEgress();
  assert.equal(egressA, lease.egress.ipv4, "bridge_egress_a_drifted");
  assert.equal(egressB, lease.egress.ipv4, "bridge_egress_b_drifted");
  validateRouteEvidence(lease, routeSource.value, new Date().toISOString());

  const child = spawn(EXPECT_PATH, [BRIDGE_PATH, "execute", "--plan", resolve(options.plan)], {
    cwd: REPOSITORY_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let unsafe = false;
  let issuanceAuthorized = false;
  let cumulativeOutputBytes = 0;
  const statuses = [];
  const stopChild = () => child.kill("SIGTERM");
  process.once("SIGINT", stopChild);
  process.once("SIGTERM", stopChild);
  const consume = (stream) => {
    let pending = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      cumulativeOutputBytes += Buffer.byteLength(chunk, "utf8");
      if (cumulativeOutputBytes > MAX_SAFE_BRIDGE_OUTPUT_BYTES) {
        unsafe = true;
        child.kill("SIGTERM");
        return;
      }
      pending += chunk;
      if (Buffer.byteLength(pending, "utf8") > MAX_SAFE_BRIDGE_OUTPUT_BYTES) {
        unsafe = true;
        child.kill("SIGTERM");
        return;
      }
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        try {
          const status = parseSafeBridgeLine(line);
          if (status.status === "READY_P0R_API_NATIVE_COPY_TO_LOCAL_TTY_BRIDGE") {
            assert.equal(issuanceAuthorized, false, "bridge_ready_repeated");
            authorizeBridgeReady({
              lease,
              now: new Date().toISOString(),
              routeEvidence: routeSource.value,
              statuses,
            });
            issuanceAuthorized = true;
            process.stdout.write(
              '{"containsSecret":false,"status":"PASS_P0R_ISSUANCE_AUTHORIZED"}\n',
            );
          }
          appendSafeBridgeStatus(statuses, status.status);
          process.stdout.write(`${JSON.stringify(status)}\n`);
        } catch {
          unsafe = true;
          child.kill("SIGTERM");
        }
      }
    });
    return () => pending;
  };
  const stdoutPending = consume(child.stdout);
  const stderrPending = consume(child.stderr);
  let exit;
  try {
    exit = await new Promise((resolveExit, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolveExit({ code, signal }));
    });
  } finally {
    process.removeListener("SIGINT", stopChild);
    process.removeListener("SIGTERM", stopChild);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  assert.equal(stdoutPending(), "", "bridge_stdout_partial_line");
  assert.equal(stderrPending(), "", "bridge_stderr_partial_line");
  assert.equal(unsafe, false, "bridge_output_boundary_violation");
  let terminalSequencePassed;
  try {
    validateSuccessfulBridgeStatuses(statuses);
    terminalSequencePassed = true;
  } catch {
    terminalSequencePassed = false;
  }
  const passed = exit.code === 0
    && issuanceAuthorized
    && terminalSequencePassed;
  const result = {
    schemaVersion: TRANSACTION_RESULT_SCHEMA,
    leaseId: lease.leaseId,
    sourceCommit: lease.sourceCommit,
    runId: lease.runId,
    phase: passed ? "BRIDGE_PASS_CLEANUP_STILL_REQUIRED" : "BRIDGE_BLOCKED_CLEANUP_REQUIRED",
    bridgeExitCode: exit.code,
    bridgeSignal: exit.signal,
    issuanceAuthorized,
    safeStatuses: statuses,
    containsSecret: false,
  };
  await writeExclusiveJson(options.result, result);
  if (!passed) process.exitCode = 1;
}

async function runBridge(options) {
  try {
    return await runBridgeOnce(options);
  } finally {
    await clearClipboard();
  }
}

async function close(options) {
  exactKeys(options, ["evidence", "lease", "output"], "close_options");
  const lease = (await readSecureJson(options.lease, "lease")).value;
  const evidence = (await readSecureJson(options.evidence, "cleanup_evidence")).value;
  await writeExclusiveJson(
    options.output,
    closeTransaction(lease, evidence, new Date().toISOString()),
  );
  process.stdout.write('{"containsSecret":false,"status":"PASS_P0R_TRANSACTION_CLOSED_ZERO_RESIDUE"}\n');
}

async function main() {
  const { command, options } = parseOptions(process.argv.slice(2));
  if (command === "plan") {
    exactKeys(options, [], "plan_options");
    process.stdout.write(`${JSON.stringify({
      schemaVersion: TRANSACTION_SCHEMA,
      bothSshSessionsPrearmedBeforeIssuance: true,
      bridgeExactTerminalSequenceRequired: true,
      bridgeOutputExactAllowlistRequired: true,
      cleanupEvidenceRequired: true,
      cloudFirewallAutoExpirySufficient: false,
      containsSecret: false,
      detachedAuthorizeCommandAllowed: false,
      egressEndpointCount: EGRESS_ENDPOINTS.length,
      egressRecheckBeforeBridgeRequired: true,
      exactRouteEvidenceRequiredBeforeBridge: true,
      maxSafeBridgeOutputBytes: MAX_SAFE_BRIDGE_OUTPUT_BYTES,
      maxSafeBridgeStatusCount: MAX_SAFE_BRIDGE_STATUS_COUNT,
      maxSecureControlFileBytes: MAX_SECURE_CONTROL_FILE_BYTES,
      postIssuanceNetworkReconnectRequired: false,
      cleanupEvidenceMaxAgeSeconds: CLEANUP_EVIDENCE_MAX_AGE_SECONDS,
      routeEvidenceMaxAgeSeconds: ROUTE_EVIDENCE_MAX_AGE_SECONDS,
      secureControlFileStableNoFollowReadRequired: true,
      temporaryResourceLeaseRequired: true,
      ttlSeconds: TRANSACTION_TTL_SECONDS,
      status: "PASS_P0R_TRANSACTION_PLAN",
    })}\n`);
    return;
  }
  if (command === "create") return createLease(options);
  if (command === "execute") return runBridge(options);
  if (command === "close") return close(options);
  throw new Error("command_invalid");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    const reason = error instanceof Error && SAFE_REASON.test(error.message)
      ? error.message
      : "p0r_transaction_unexpected_failure";
    process.stderr.write(`${JSON.stringify({
      containsSecret: false,
      reason,
      status: "BLOCKED_P0R_TRANSACTION",
    })}\n`);
    process.exitCode = 1;
  });
}
