#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import {
  open,
  realpath,
} from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  PRODUCTION_EVIDENCE_DEFAULT_TTL_MS,
  ProductionEvidenceError,
  evidenceObjectName,
  publishSealedEvidence,
  scheduleProductionEvidenceExpiry,
  sealProductionEvidence,
} from "./fixed-channel/production-evidence-channel.mjs";
import { canonicalJson, sha256 } from "./fixed-channel/production-dispatch.mjs";
import {
  DEFAULT_P0R_REBIND_POLICY,
  P0R_REBIND_FAILURE_RESULT_SCHEMA,
  P0R_REBIND_PACKAGE_ID,
  P0R_REBIND_REQUEST_SCHEMA,
  P0R_REBIND_RESULT_SCHEMA,
  validateP0RRebindRequest,
} from "./m1-p0r-rebind-preflight.mjs";

export const P0R_REBIND_EVIDENCE_EXPORT_SCHEMA =
  "market-radar-v2-m1-p0r-rebind-evidence-export.v1";
export const P0R_REBIND_EVIDENCE_RECIPIENT_RELATIVE_PATH =
  "scripts/v2/production/fixed-channel/production-evidence-recipient-public.spki";
export const P0R_REBIND_EVIDENCE_RECIPIENT_FILE_SHA256 =
  "07e974dfe5469b924b030ced80f9365dae5cce384a7b32f5c37ed99c898f7273";
export const P0R_REBIND_EVIDENCE_RECIPIENT_KEY_SHA256 =
  "7dbe6852c834e65bacd6c25b79bbbe1596523ea3ea1c45f5e08cfe3172f79879";
export const P0R_REBIND_EVIDENCE_OUTBOX_ROOT =
  "/var/lib/market-radar-production-dispatch/outbound";
export const P0R_REBIND_EVIDENCE_SIGNING_KEY =
  "/etc/ssh/ssh_host_ed25519_key";

const PASS_RESULT_KEYS = Object.freeze([
  "after",
  "before",
  "dispatchId",
  "ephemeralSecretBaseline",
  "generatedAt",
  "packageId",
  "productionChanged",
  "productionIdentityUnchangedVerified",
  "productionMutationAttempted",
  "resultPath",
  "schemaVersion",
  "secretMaterialPresent",
  "sourceCommit",
  "sourceIpBinding",
  "sourceTree",
  "status",
  "supersededStaging",
]);
const FAILURE_RESULT_KEYS = Object.freeze([
  "after",
  "before",
  "dispatchId",
  "failurePhase",
  "failureReason",
  "generatedAt",
  "packageId",
  "productionChanged",
  "productionIdentityUnchangedVerified",
  "productionMutationAttempted",
  "resultPath",
  "schemaVersion",
  "secretMaterialPresent",
  "sourceCommit",
  "sourceTree",
  "status",
]);

export class P0RRebindEvidenceExportError extends Error {
  constructor(reason, details = undefined) {
    super(reason);
    this.name = "P0RRebindEvidenceExportError";
    this.reason = reason;
    this.details = details;
  }
}

function ensure(condition, reason, details = undefined) {
  if (!condition) throw new P0RRebindEvidenceExportError(reason, details);
}

function exactKeys(value, expected, reason) {
  ensure(value && typeof value === "object" && !Array.isArray(value), reason);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  ensure(
    actual.length === wanted.length
      && actual.every((key, index) => key === wanted[index]),
    reason,
    { actual, expected: wanted },
  );
}

function parseTimestamp(value, reason) {
  ensure(typeof value === "string", reason);
  const timestamp = new Date(value);
  ensure(Number.isFinite(timestamp.getTime()) && timestamp.toISOString() === value, reason);
  return timestamp;
}

async function readCanonicalJsonNoFollow(path, maximumBytes, reason, {
  requiredMode = 0o600,
} = {}) {
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const before = await handle.stat();
    ensure(
      before.isFile()
        && before.size > 0
        && before.size <= maximumBytes
        && (before.mode & 0o777) === requiredMode,
      reason,
    );
    const bytes = await handle.readFile();
    const after = await handle.stat();
    ensure(
      bytes.length > 0
        && bytes.length <= maximumBytes
        && before.dev === after.dev
        && before.ino === after.ino
        && before.size === after.size
        && before.mtimeMs === after.mtimeMs,
      reason,
    );
    let value;
    try {
      value = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new P0RRebindEvidenceExportError(reason);
    }
    ensure(canonicalJson(value) === bytes.toString("utf8"), reason);
    return { bytes, value };
  } catch (error) {
    if (error instanceof P0RRebindEvidenceExportError) throw error;
    throw new P0RRebindEvidenceExportError(reason, {
      code: typeof error?.code === "string" ? error.code.slice(0, 40) : null,
    });
  } finally {
    if (handle) await handle.close();
  }
}

async function readPublicKeyNoFollow(path, expectedFileSha256) {
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const before = await handle.stat();
    ensure(
      before.isFile()
        && before.size > 0
        && before.size <= 16 * 1024
        && (before.mode & 0o777) === 0o600,
      "p0r_rebind_evidence_recipient_file_unsafe",
    );
    const bytes = await handle.readFile();
    const after = await handle.stat();
    ensure(
      before.dev === after.dev
        && before.ino === after.ino
        && before.size === after.size
        && before.mtimeMs === after.mtimeMs,
      "p0r_rebind_evidence_recipient_file_changed",
    );
    ensure(
      sha256(bytes) === expectedFileSha256,
      "p0r_rebind_evidence_recipient_file_hash_mismatch",
    );
    return bytes.toString("utf8");
  } catch (error) {
    if (error instanceof P0RRebindEvidenceExportError) throw error;
    throw new P0RRebindEvidenceExportError(
      "p0r_rebind_evidence_recipient_file_unsafe",
      { code: typeof error?.code === "string" ? error.code.slice(0, 40) : null },
    );
  } finally {
    if (handle) await handle.close();
  }
}

function validateResult(result, request, now) {
  const isPass = result?.schemaVersion === P0R_REBIND_RESULT_SCHEMA;
  const isFailure = result?.schemaVersion === P0R_REBIND_FAILURE_RESULT_SCHEMA;
  ensure(isPass || isFailure, "p0r_rebind_evidence_result_schema_invalid");
  exactKeys(
    result,
    isPass ? PASS_RESULT_KEYS : FAILURE_RESULT_KEYS,
    "p0r_rebind_evidence_result_keys_invalid",
  );
  ensure(
    result.dispatchId === request.dispatchId
      && result.packageId === P0R_REBIND_PACKAGE_ID
      && result.sourceCommit === request.sourceCommit
      && result.sourceTree === request.sourceTree
      && result.resultPath === request.resultPath,
    "p0r_rebind_evidence_result_binding_mismatch",
  );
  ensure(
    result.productionChanged === false
      && result.productionMutationAttempted === false
      && result.secretMaterialPresent === false,
    "p0r_rebind_evidence_result_safety_boundary_invalid",
  );
  const generatedAt = parseTimestamp(
    result.generatedAt,
    "p0r_rebind_evidence_result_time_invalid",
  );
  const issuedAt = new Date(request.approvalIssuedAt);
  ensure(generatedAt >= issuedAt && generatedAt <= now,
    "p0r_rebind_evidence_result_time_invalid");
  if (isPass) {
    ensure(
      result.status === "PASS_P0R_READ_ONLY_REBIND_PREFLIGHT"
        && result.productionIdentityUnchangedVerified === true
        && canonicalJson(result.before) === canonicalJson(result.after),
      "p0r_rebind_evidence_pass_result_invalid",
    );
  } else {
    ensure(
      result.status === "BLOCKED_P0R_READ_ONLY_REBIND_PREFLIGHT"
        && /^[A-Z_]{3,80}$/u.test(result.failurePhase)
        && /^[a-z0-9_]{3,140}$/u.test(result.failureReason),
      "p0r_rebind_evidence_failure_result_invalid",
    );
  }
  return result.schemaVersion;
}

export async function exportP0RRebindEvidence({
  now = new Date(),
  outboxRoot = P0R_REBIND_EVIDENCE_OUTBOX_ROOT,
  policy = DEFAULT_P0R_REBIND_POLICY,
  recipientFileSha256 = P0R_REBIND_EVIDENCE_RECIPIENT_FILE_SHA256,
  recipientKeySha256 = P0R_REBIND_EVIDENCE_RECIPIENT_KEY_SHA256,
  recipientPublicKeyPath,
  requestPath,
  signer = undefined,
  signerOptions = undefined,
  expiryScheduler = scheduleProductionEvidenceExpiry,
  signingKeyPath = P0R_REBIND_EVIDENCE_SIGNING_KEY,
}) {
  ensure(isAbsolute(requestPath), "p0r_rebind_evidence_request_path_invalid");
  ensure(isAbsolute(recipientPublicKeyPath),
    "p0r_rebind_evidence_recipient_path_invalid");
  const { value: request } = await readCanonicalJsonNoFollow(
    requestPath,
    512 * 1024,
    "p0r_rebind_evidence_request_invalid",
  );
  ensure(request.schemaVersion === P0R_REBIND_REQUEST_SCHEMA,
    "p0r_rebind_evidence_request_schema_invalid");
  validateP0RRebindRequest(request, { now, policy });
  ensure(
    await realpath(requestPath) === join(request.stagingDirectory, "approval-request.json"),
    "p0r_rebind_evidence_request_identity_mismatch",
  );
  ensure(
    await realpath(recipientPublicKeyPath)
      === join(request.stagingDirectory, P0R_REBIND_EVIDENCE_RECIPIENT_RELATIVE_PATH),
    "p0r_rebind_evidence_recipient_identity_mismatch",
  );
  ensure(
    basename(request.resultPath) === `${request.dispatchId}.result.json`
      && await realpath(request.resultPath) === resolve(request.resultPath),
    "p0r_rebind_evidence_result_path_invalid",
  );
  const { value: result } = await readCanonicalJsonNoFollow(
    request.resultPath,
    512 * 1024,
    "p0r_rebind_evidence_result_invalid",
  );
  const resultSchemaVersion = validateResult(result, request, now);
  ensure(/^[a-f0-9]{64}$/u.test(recipientFileSha256),
    "p0r_rebind_evidence_recipient_file_hash_invalid");
  ensure(/^[a-f0-9]{64}$/u.test(recipientKeySha256),
    "p0r_rebind_evidence_recipient_key_hash_invalid");
  const recipientPublicKey = await readPublicKeyNoFollow(
    recipientPublicKeyPath,
    recipientFileSha256,
  );
  const expiresAt = new Date(
    now.getTime() + PRODUCTION_EVIDENCE_DEFAULT_TTL_MS,
  ).toISOString();
  const sealOptions = {
    dispatchId: request.dispatchId,
    expectedSchemaVersion: resultSchemaVersion,
    expiresAt,
    now,
    payload: result,
    recipientPublicKey,
    signerOptions: signerOptions ?? {
      keyPath: signingKeyPath,
    },
  };
  if (signer) sealOptions.signer = signer;
  let sealed;
  try {
    sealed = await sealProductionEvidence(sealOptions);
  } catch (error) {
    if (error instanceof ProductionEvidenceError) {
      throw new P0RRebindEvidenceExportError(
        `p0r_rebind_evidence_seal_failed:${error.reason}`,
      );
    }
    throw error;
  }
  ensure(
    sealed.recipientKeySha256 === recipientKeySha256,
    "p0r_rebind_evidence_recipient_key_identity_mismatch",
  );
  const expirySchedule = await expiryScheduler({
    dispatchId: request.dispatchId,
    expiresAt,
    now,
    outboxRoot,
  });
  ensure(
    expirySchedule?.dispatchId === request.dispatchId
      && expirySchedule?.objectName === evidenceObjectName(request.dispatchId)
      && expirySchedule?.status
        === "PASS_PRODUCTION_EVIDENCE_EXPIRY_SCHEDULED",
    "p0r_rebind_evidence_expiry_schedule_invalid",
  );
  const publication = await publishSealedEvidence({ outboxRoot, sealed });
  ensure(
    publication.dispatchId === request.dispatchId
      && publication.expiresAt === expiresAt,
    "p0r_rebind_evidence_publication_binding_mismatch",
  );
  return {
    dispatchId: request.dispatchId,
    expiresAt,
    expiryUnitName: expirySchedule.unitName,
    objectName: publication.objectName,
    objectSha256: publication.objectSha256,
    recipientKeySha256,
    resultSchemaVersion,
    schemaVersion: P0R_REBIND_EVIDENCE_EXPORT_SCHEMA,
    sourceCommit: request.sourceCommit,
    status: "PASS_P0R_REBIND_EVIDENCE_ENCRYPTED_AND_PUBLISHED",
  };
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  ensure(rest.length % 2 === 0, "p0r_rebind_evidence_arguments_invalid");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    ensure(
      /^--[a-z][a-z-]*$/u.test(key ?? "")
        && typeof value === "string"
        && !value.startsWith("--")
        && options[key.slice(2)] === undefined,
      "p0r_rebind_evidence_arguments_invalid",
    );
    options[key.slice(2)] = value;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  ensure(
    command === "export"
      && options.request
      && options["recipient-public-key"]
      && Object.keys(options).length === 2,
    "p0r_rebind_evidence_command_invalid",
  );
  const result = await exportP0RRebindEvidence({
    recipientPublicKeyPath: resolve(options["recipient-public-key"]),
    requestPath: resolve(options.request),
  });
  process.stdout.write(canonicalJson(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(canonicalJson({
      reason: error instanceof P0RRebindEvidenceExportError
        ? error.reason
        : "unexpected_error",
      status: "BLOCKED",
    }));
    process.exitCode = 1;
  });
}
