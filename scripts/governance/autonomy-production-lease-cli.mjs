#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  acquireProductionLease,
  consumeProductionApproval,
  heartbeatProductionLease,
  isProductionApprovalConsumed,
  releaseProductionLease,
  verifyProductionLease,
} from "./autonomy-production-lease.mjs";

const AUTHORIZATION_SCHEMA = "market-radar-package-authorization.v1";
const EXECUTION_SCHEMA = "market-radar-production-lease-execution.v1";
const MAX_LEASE_SECONDS = 90 * 60;
const SAFETY_IGNORABLE_VIOLATIONS = new Set([
  "production_lease_expired",
  "production_lease_revoked",
]);

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    ensure(key?.startsWith("--") && value !== undefined && !value.startsWith("--"), "argument_invalid");
    options[key.slice(2)] = value;
  }
  return { command, options };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function replaceExecutionSnapshot(path, value) {
  const temporaryPath = `${path}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

function parseNow(value) {
  if (value === undefined) return new Date();
  const now = new Date(value);
  ensure(Number.isFinite(now.getTime()), "now_invalid");
  return now;
}

function authorizationFromRequest(request) {
  const authorization = request?.autonomyAuthorization;
  ensure(authorization?.schemaVersion === AUTHORIZATION_SCHEMA, "autonomy_authorization_schema_invalid");
  ensure(authorization.packageId === request.packageId, "autonomy_authorization_package_mismatch");
  ensure(authorization.maxExecutions === 1, "autonomy_authorization_execution_count_invalid");
  return authorization;
}

function leaseIdentity(authorization, execution) {
  return {
    leaseId: execution.leaseId,
    packageId: authorization.packageId,
    approvalId: authorization.approvalId,
    nonce: authorization.nonce,
    fencingToken: execution.fencingToken,
    revocationEpoch: authorization.revocationEpoch,
  };
}

async function loadInputs(options) {
  ensure(isAbsolute(options["trust-root"] ?? ""), "trust_root_must_be_absolute");
  ensure(isAbsolute(options.request ?? ""), "request_path_must_be_absolute");
  ensure(isAbsolute(options.execution ?? ""), "execution_path_must_be_absolute");
  const trustRoot = resolve(options["trust-root"]);
  const requestPath = resolve(options.request);
  const executionPath = resolve(options.execution);
  ensure(executionPath !== requestPath, "execution_path_must_differ_from_request");
  const request = await readJson(requestPath);
  const authorization = authorizationFromRequest(request);
  return { authorization, executionPath, request, trustRoot };
}

async function acquire(options) {
  const { authorization, executionPath, trustRoot } = await loadInputs(options);
  const now = parseNow(options.now);
  ensure(options["owner-id"], "owner_id_missing");
  ensure(!(await isProductionApprovalConsumed({
    trustRoot,
    approvalId: authorization.approvalId,
  })), "production_approval_already_consumed");
  const expiresAt = new Date(authorization.expiresAt);
  ensure(Number.isFinite(expiresAt.getTime()) && expiresAt > now, "autonomy_authorization_not_current");
  const ttlSeconds = Math.min(
    MAX_LEASE_SECONDS,
    Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)),
  );
  const lease = await acquireProductionLease({
    trustRoot,
    packageId: authorization.packageId,
    approvalId: authorization.approvalId,
    nonce: authorization.nonce,
    ownerId: options["owner-id"],
    approvalExpiresAt: authorization.expiresAt,
    revocationEpoch: authorization.revocationEpoch,
    ttlSeconds,
    now,
  });
  const execution = {
    schemaVersion: EXECUTION_SCHEMA,
    grantId: authorization.grantId,
    approvalId: authorization.approvalId,
    packageId: authorization.packageId,
    leaseId: lease.leaseId,
    fencingToken: lease.fencingToken,
    revocationEpoch: lease.revocationEpoch,
    acquiredAt: lease.acquiredAt,
    expiresAt: lease.expiresAt,
    status: "active_unconsumed",
  };
  try {
    await writeFile(executionPath, `${JSON.stringify(execution, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    await releaseProductionLease({
      trustRoot,
      ...leaseIdentity(authorization, execution),
      outcome: "SAFE_STOP_PRE_MUTATION",
      now,
    }).catch(() => {});
    throw error;
  }
  return execution;
}

async function checkpoint(options, { safety = false } = {}) {
  const { authorization, executionPath, trustRoot } = await loadInputs(options);
  const execution = await readJson(executionPath);
  ensure(execution.schemaVersion === EXECUTION_SCHEMA, "lease_execution_schema_invalid");
  const now = parseNow(options.now);
  const identity = leaseIdentity(authorization, execution);
  const violations = await verifyProductionLease({ trustRoot, ...identity, now });
  const blocking = safety
    ? violations.filter((value) => !SAFETY_IGNORABLE_VIOLATIONS.has(value))
    : violations;
  ensure(blocking.length === 0, `production_lease_invalid:${blocking.join(",")}`);
  if (!safety) await heartbeatProductionLease({ trustRoot, ...identity, now });
  return {
    schemaVersion: EXECUTION_SCHEMA,
    checkpoint: options.checkpoint ?? "unspecified",
    leaseId: execution.leaseId,
    fencingToken: execution.fencingToken,
    safety,
    status: "pass",
    verifiedAt: now.toISOString(),
  };
}

async function consume(options) {
  const { authorization, executionPath, trustRoot } = await loadInputs(options);
  const execution = await readJson(executionPath);
  const now = parseNow(options.now);
  const identity = leaseIdentity(authorization, execution);
  const violations = await verifyProductionLease({ trustRoot, ...identity, now });
  ensure(violations.length === 0, `production_lease_invalid:${violations.join(",")}`);
  await consumeProductionApproval({
    trustRoot,
    approvalId: authorization.approvalId,
    nonce: authorization.nonce,
    leaseId: execution.leaseId,
    fencingToken: execution.fencingToken,
    consumedAt: now,
  });
  await replaceExecutionSnapshot(executionPath, {
    ...execution,
    consumedAt: now.toISOString(),
    status: "active_consumed",
  });
  return {
    schemaVersion: EXECUTION_SCHEMA,
    approvalId: authorization.approvalId,
    leaseId: execution.leaseId,
    fencingToken: execution.fencingToken,
    status: "consumed",
    consumedAt: now.toISOString(),
  };
}

async function release(options) {
  const { authorization, executionPath, trustRoot } = await loadInputs(options);
  const execution = await readJson(executionPath);
  ensure([
    "PASS",
    "ROLLBACK_PASS",
    "SAFE_STOP_AFTER_REVOCATION",
    "SAFE_STOP_PRE_MUTATION",
  ].includes(options.outcome), "lease_release_outcome_invalid");
  const now = parseNow(options.now);
  const released = await releaseProductionLease({
    trustRoot,
    ...leaseIdentity(authorization, execution),
    outcome: options.outcome,
    now,
  });
  await replaceExecutionSnapshot(executionPath, {
    ...execution,
    outcome: released.outcome,
    releasedAt: released.releasedAt,
    status: "released",
  });
  return {
    schemaVersion: EXECUTION_SCHEMA,
    leaseId: released.leaseId,
    fencingToken: released.fencingToken,
    outcome: released.outcome,
    releasedAt: released.releasedAt,
    status: "released",
  };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  let result;
  if (command === "acquire") result = await acquire(options);
  else if (command === "checkpoint") result = await checkpoint(options);
  else if (command === "safety-checkpoint") result = await checkpoint(options, { safety: true });
  else if (command === "consume") result = await consume(options);
  else if (command === "release") result = await release(options);
  else throw new Error("command_invalid");
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, reason: error?.message ?? "unexpected_error" })}\n`);
    process.exitCode = 1;
  });
}
