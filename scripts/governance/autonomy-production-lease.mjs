import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const MAX_LEASE_SECONDS = 90 * 60;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,180}$/u;

function assertTrustRoot(trustRoot) {
  if (!isAbsolute(trustRoot)) throw new Error("trust_root_must_be_absolute");
  return resolve(trustRoot);
}

function assertSafeIdentity(...values) {
  if (values.some((value) => typeof value !== "string" || !SAFE_ID_PATTERN.test(value))) {
    throw new Error("lease_identity_unsafe");
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value, options = {}) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, ...options });
}

async function acquireCounterLock(root) {
  const lockPath = resolve(root, "fencing-counter.lock");
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      return lockPath;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
  }
  throw new Error("fencing_counter_lock_timeout");
}

async function nextFencingToken(root) {
  const lockPath = await acquireCounterLock(root);
  try {
    const counterPath = resolve(root, "fencing-counter");
    let current = 0;
    try {
      current = Number.parseInt(await readFile(counterPath, "utf8"), 10);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (!Number.isSafeInteger(current) || current < 0) throw new Error("fencing_counter_invalid");
    const next = current + 1;
    await writeFile(counterPath, `${next}\n`, { mode: 0o600 });
    return next;
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

async function currentRevocationEpoch(root) {
  try {
    const value = await readJson(resolve(root, "revocation.json"));
    return Number.isSafeInteger(value.epoch) && value.epoch >= 0 ? value.epoch : 0;
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
}

export async function acquireProductionLease({
  trustRoot,
  packageId,
  approvalId,
  nonce,
  ownerId,
  approvalExpiresAt,
  revocationEpoch,
  ttlSeconds = MAX_LEASE_SECONDS,
  now = new Date(),
}) {
  const root = assertTrustRoot(trustRoot);
  if (!packageId || !approvalId || !nonce || !ownerId) throw new Error("lease_identity_missing");
  assertSafeIdentity(packageId, approvalId, nonce, ownerId);
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > MAX_LEASE_SECONDS) {
    throw new Error("lease_ttl_invalid");
  }
  const approvalExpiry = new Date(approvalExpiresAt);
  if (!Number.isFinite(approvalExpiry.getTime()) || approvalExpiry <= now) {
    throw new Error("lease_approval_expired");
  }
  const externalRevocationEpoch = await currentRevocationEpoch(root).catch((error) => {
    if (error?.code === "ENOENT") return 0;
    throw error;
  });
  if (!Number.isSafeInteger(revocationEpoch) || revocationEpoch < externalRevocationEpoch) {
    throw new Error("lease_revocation_epoch_stale");
  }
  await mkdir(root, { recursive: true, mode: 0o700 });
  await mkdir(resolve(root, "history"), { recursive: true, mode: 0o700 });
  await mkdir(resolve(root, "consumed"), { recursive: true, mode: 0o700 });
  const lockPath = resolve(root, "production-global.lock");
  try {
    await mkdir(lockPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = await readJson(resolve(lockPath, "lease.json"));
    if (new Date(existing.expiresAt) > now) throw new Error("production_lease_already_held");
    await rename(lockPath, resolve(root, "history", `expired-${existing.fencingToken}-${randomUUID()}`));
    await mkdir(lockPath, { mode: 0o700 });
  }

  try {
    const fencingToken = await nextFencingToken(root);
    const leaseId = randomUUID();
    const ttlExpiry = new Date(now.getTime() + ttlSeconds * 1000);
    const expiresAt = new Date(Math.min(ttlExpiry.getTime(), approvalExpiry.getTime()));
    const lease = {
      schemaVersion: "market-radar-production-lease.v1",
      leaseId,
      packageId,
      approvalId,
      nonce,
      ownerId,
      fencingToken,
      revocationEpoch,
      acquiredAt: now.toISOString(),
      heartbeatAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: "active",
    };
    await writeJson(resolve(lockPath, "lease.json"), lease, { flag: "wx" });
    return lease;
  } catch (error) {
    await rm(lockPath, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyProductionLease({
  trustRoot,
  leaseId,
  packageId,
  approvalId,
  nonce,
  fencingToken,
  revocationEpoch,
  now = new Date(),
}) {
  const root = assertTrustRoot(trustRoot);
  let lease;
  try {
    lease = await readJson(resolve(root, "production-global.lock", "lease.json"));
  } catch {
    return ["production_lease_missing"];
  }
  const violations = [];
  if (lease.status !== "active") violations.push("production_lease_not_active");
  if (lease.leaseId !== leaseId) violations.push("production_lease_id_mismatch");
  if (lease.packageId !== packageId) violations.push("production_lease_package_mismatch");
  if (lease.approvalId !== approvalId) violations.push("production_lease_approval_mismatch");
  if (lease.nonce !== nonce) violations.push("production_lease_nonce_mismatch");
  if (lease.fencingToken !== fencingToken) violations.push("production_lease_fencing_mismatch");
  if (lease.revocationEpoch !== revocationEpoch) violations.push("production_lease_revocation_mismatch");
  if (new Date(lease.expiresAt) <= now) violations.push("production_lease_expired");
  const externalRevocationEpoch = await currentRevocationEpoch(root);
  if (externalRevocationEpoch > revocationEpoch) violations.push("production_lease_revoked");
  return violations;
}

export async function heartbeatProductionLease({ trustRoot, now = new Date(), ...identity }) {
  const violations = await verifyProductionLease({ trustRoot, now, ...identity });
  if (violations.length > 0) throw new Error(`production_lease_invalid:${violations.join(",")}`);
  const root = assertTrustRoot(trustRoot);
  const leasePath = resolve(root, "production-global.lock", "lease.json");
  const lease = await readJson(leasePath);
  lease.heartbeatAt = now.toISOString();
  await writeJson(leasePath, lease);
  return lease;
}

export async function consumeProductionApproval({
  trustRoot,
  approvalId,
  nonce,
  leaseId,
  fencingToken,
  consumedAt = new Date(),
}) {
  const root = assertTrustRoot(trustRoot);
  assertSafeIdentity(approvalId, nonce, leaseId);
  if (!Number.isSafeInteger(fencingToken) || fencingToken <= 0) {
    throw new Error("lease_fencing_token_invalid");
  }
  const path = resolve(root, "consumed", `${approvalId}.json`);
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify({
      schemaVersion: "market-radar-production-approval-consumption.v1",
      approvalId,
      nonce,
      leaseId,
      fencingToken,
      consumedAt: consumedAt.toISOString(),
    }, null, 2)}\n`);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("production_approval_already_consumed");
    throw error;
  } finally {
    await handle?.close();
  }
}

export async function isProductionApprovalConsumed({ trustRoot, approvalId }) {
  const root = assertTrustRoot(trustRoot);
  try {
    await readFile(resolve(root, "consumed", `${approvalId}.json`));
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function releaseProductionLease({ trustRoot, outcome, now = new Date(), ...identity }) {
  const root = assertTrustRoot(trustRoot);
  const violations = await verifyProductionLease({ trustRoot: root, now, ...identity });
  const rollbackCloseout = new Set([
    "ROLLBACK_PASS",
    "SAFE_STOP_AFTER_REVOCATION",
    "SAFE_STOP_PRE_MUTATION",
  ]).has(outcome);
  const blockingViolations = rollbackCloseout
    ? violations.filter((value) => !new Set([
      "production_lease_revoked",
      "production_lease_expired",
    ]).has(value))
    : violations;
  if (blockingViolations.length > 0) {
    throw new Error(`production_lease_invalid:${blockingViolations.join(",")}`);
  }
  const lockPath = resolve(root, "production-global.lock");
  const lease = await readJson(resolve(lockPath, "lease.json"));
  lease.status = "released";
  lease.releasedAt = now.toISOString();
  lease.outcome = outcome;
  await writeJson(resolve(lockPath, "lease.json"), lease);
  await rename(lockPath, resolve(root, "history", `released-${lease.fencingToken}-${lease.leaseId}`));
  return lease;
}

export async function advanceRevocationEpoch({ trustRoot, epoch, reason, now = new Date() }) {
  const root = assertTrustRoot(trustRoot);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const current = await currentRevocationEpoch(root);
  if (!Number.isSafeInteger(epoch) || epoch <= current) throw new Error("revocation_epoch_must_increase");
  await writeJson(resolve(root, "revocation.json"), {
    schemaVersion: "market-radar-production-revocation.v1",
    epoch,
    reason,
    revokedAt: now.toISOString(),
  });
}
