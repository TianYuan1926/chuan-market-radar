#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { chmod, lstat, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const P0R_COS_PROVISIONING_PLAN_SCHEMA_VERSION =
  "v2-m1-production-storage-cos-provisioning-plan.v1";
export const P0R_COS_CREDENTIAL_SCHEMA_VERSION =
  "v2-m1-production-storage-cos-temporary-credentials.v2";
export const P0R_STS_DURATION_SECONDS = 7_200;

export const P0R_COS_GRANT_ACTIONS = Object.freeze([
  "cos:GetBucketACL",
  "cos:GetBucketObjectLockConfiguration",
  "cos:GetBucketPolicy",
  "cos:GetBucketVersioning",
  "cos:GetObject",
  "cos:GetObjectACL",
  "cos:GetObjectRetention",
  "cos:HeadBucket",
  "cos:HeadObject",
  "cos:PutObject",
]);

const APP_ID_PATTERN = /^[0-9]{5,20}$/u;
const BUCKET_BASE_PATTERN = /^[a-z][a-z0-9-]{2,38}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const RUN_ID_PATTERN = /^p0r-\d{8}t\d{6}z-[0-9a-f]{32}$/u;
const MAXIMUM_JSON_BYTES = 256 * 1024;
const MINIMUM_COMPILED_REMAINING_SECONDS = 6_600;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  assert.ok(isRecord(value), `${label} must be an object`);
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    `${label} fields must be exact`,
  );
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function stableSha256(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function canonicalTime(value, label) {
  assert.equal(typeof value, "string", `${label} must be text`);
  assert.match(value, ISO_PATTERN, `${label} must be canonical UTC milliseconds`);
  assert.equal(new Date(value).toISOString(), value, `${label} must be canonical UTC`);
  return value;
}

function ipv4Cidr32(value, label) {
  assert.equal(typeof value, "string", `${label} must be text`);
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/32$/u.exec(value);
  assert.ok(match, `${label} must be one IPv4 /32 address`);
  assert.ok(match.slice(1).every((part) => Number(part) <= 255), `${label} is invalid`);
  return value;
}

function commonCondition(sourceIpCidr) {
  return {
    bool_equal: { "cos:secure-transport": "true" },
    ip_equal: { "qcs:ip": [sourceIpCidr] },
    numeric_greater_than_equal: { "cos:tls-version": 1.2 },
  };
}

function buildStsPolicy({ appId, bucket, objectKey, region, sourceIpCidr }) {
  const bucketResource = `qcs::cos:${region}:uid/${appId}:${bucket}/*`;
  const objectResource = `qcs::cos:${region}:uid/${appId}:${bucket}/${objectKey}`;
  return {
    statement: [
      {
        action: [
          "name/cos:GetBucketACL",
          "name/cos:GetBucketObjectLockConfiguration",
          "name/cos:GetBucketPolicy",
          "name/cos:GetBucketVersioning",
          "name/cos:HeadBucket",
        ],
        condition: commonCondition(sourceIpCidr),
        effect: "allow",
        resource: [bucketResource],
      },
      {
        action: [
          "name/cos:GetObject",
          "name/cos:GetObjectACL",
          "name/cos:GetObjectRetention",
          "name/cos:HeadObject",
        ],
        condition: commonCondition(sourceIpCidr),
        effect: "allow",
        resource: [objectResource],
      },
      {
        action: ["name/cos:PutObject"],
        condition: {
          ...commonCondition(sourceIpCidr),
          numeric_greater_than_equal: {
            "cos:object-lock-remaining-retention-days": 30,
            "cos:tls-version": 1.2,
          },
          string_equal: {
            "cos:object-lock-mode": "COMPLIANCE",
            "cos:x-cos-acl": "private",
            "cos:x-cos-forbid-overwrite": "true",
          },
          string_equal_ignore_case: {
            "cos:content-type": "application/octet-stream",
          },
        },
        effect: "allow",
        resource: [objectResource],
      },
    ],
    version: "2.0",
  };
}

export function createP0RRunId(now = new Date(), entropy = randomBytes(16)) {
  assert.ok(now instanceof Date && !Number.isNaN(now.valueOf()), "run time is invalid");
  assert.ok(Buffer.isBuffer(entropy) && entropy.length === 16, "run entropy must be 16 bytes");
  const compact = now.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "z").toLowerCase();
  return `p0r-${compact}-${entropy.toString("hex")}`;
}

export function buildP0RCosProvisioningPlan(input) {
  exactKeys(input, [
    "appId",
    "bucketBaseName",
    "plannedAt",
    "region",
    "runId",
    "sourceCommit",
    "sourceIpCidr",
  ], "provisioning input");
  assert.match(input.appId, APP_ID_PATTERN, "APPID is invalid");
  assert.match(input.bucketBaseName, BUCKET_BASE_PATTERN, "bucket base name is invalid");
  assert.equal(input.region, "ap-hongkong", "P0R COS region must be ap-hongkong");
  assert.match(input.sourceCommit, COMMIT_PATTERN, "source commit is invalid");
  assert.match(input.runId, RUN_ID_PATTERN, "run ID is invalid");
  canonicalTime(input.plannedAt, "plannedAt");
  ipv4Cidr32(input.sourceIpCidr, "sourceIpCidr");

  const timestamp = input.plannedAt.replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "z").toLowerCase();
  assert.equal(input.runId.slice(4, 20), timestamp, "run ID timestamp must match plannedAt");
  const bucket = `${input.bucketBaseName}-${input.appId}`;
  assert.ok(bucket.length <= 60, "full bucket name is too long");
  const date = input.plannedAt.slice(0, 10);
  const objectKey = `market-radar-v2/p0r/${date}/${input.runId}.dump.age`;
  const policy = buildStsPolicy({
    appId: input.appId,
    bucket,
    objectKey,
    region: input.region,
    sourceIpCidr: input.sourceIpCidr,
  });
  const stsRequest = {
    action: "GetFederationToken",
    durationSeconds: P0R_STS_DURATION_SECONDS,
    endpoint: "sts.tencentcloudapi.com",
    name: "MarketRadarRecovery",
    policy,
    version: "2018-08-13",
  };
  const unsigned = {
    bucketConfiguration: {
      accessControl: "PRIVATE",
      availabilityZoneType: "SINGLE_AZ",
      defaultEncryption: "SSE_COS_AES256",
      objectLock: {
        defaultRetentionDays: 31,
        mode: "COMPLIANCE",
        permanent: true,
      },
      versioning: "ENABLED",
    },
    credentialGrant: {
      actions: [...P0R_COS_GRANT_ACTIONS],
      bucket,
      objectKey,
      region: input.region,
      runId: input.runId,
      sourceIpCidr: input.sourceIpCidr,
    },
    overwriteProtection: {
      forbidOverwriteHeaderEffectiveWithVersioning: false,
      mode: "HIGH_ENTROPY_UNIQUE_KEY_PLUS_PREUPLOAD_ABSENCE_CHECK",
      preUploadAbsenceRequired: true,
    },
    plannedAt: input.plannedAt,
    schemaVersion: P0R_COS_PROVISIONING_PLAN_SCHEMA_VERSION,
    sourceCommit: input.sourceCommit,
    stsRequest,
  };
  return Object.freeze({ ...unsigned, planDigest: stableSha256(unsigned) });
}

export function validateP0RCosProvisioningPlan(value) {
  exactKeys(value, [
    "bucketConfiguration",
    "credentialGrant",
    "overwriteProtection",
    "planDigest",
    "plannedAt",
    "schemaVersion",
    "sourceCommit",
    "stsRequest",
  ], "provisioning plan");
  assert.equal(value.schemaVersion, P0R_COS_PROVISIONING_PLAN_SCHEMA_VERSION);
  assert.match(value.planDigest, DIGEST_PATTERN, "plan digest is invalid");
  const { planDigest, ...unsigned } = value;
  assert.equal(planDigest, stableSha256(unsigned), "provisioning plan digest mismatch");
  const rebuilt = buildP0RCosProvisioningPlan({
    appId: value.credentialGrant.bucket.split("-").at(-1),
    bucketBaseName: value.credentialGrant.bucket.replace(/-[0-9]{5,20}$/u, ""),
    plannedAt: value.plannedAt,
    region: value.credentialGrant.region,
    runId: value.credentialGrant.runId,
    sourceCommit: value.sourceCommit,
    sourceIpCidr: value.credentialGrant.sourceIpCidr,
  });
  assert.deepEqual(value, rebuilt, "provisioning plan contract drift");
  return value;
}

export function compileP0RCosCredentials({ now, plan, stsResponse }) {
  validateP0RCosProvisioningPlan(plan);
  exactKeys(stsResponse, ["Response"], "STS response");
  exactKeys(stsResponse.Response, [
    "Credentials",
    "Expiration",
    "ExpiredTime",
    "RequestId",
  ], "STS response.Response");
  exactKeys(stsResponse.Response.Credentials, [
    "TmpSecretId",
    "TmpSecretKey",
    "Token",
  ], "STS response credentials");
  assert.match(stsResponse.Response.RequestId, REQUEST_ID_PATTERN, "STS request ID is invalid");
  assert.ok(
    Number.isSafeInteger(stsResponse.Response.ExpiredTime),
    "STS expiration epoch is invalid",
  );
  const expiresAt = new Date(stsResponse.Response.ExpiredTime * 1000).toISOString();
  assert.equal(
    Date.parse(stsResponse.Response.Expiration),
    Date.parse(expiresAt),
    "STS expiration fields disagree",
  );
  const issuedAt = new Date(
    (stsResponse.Response.ExpiredTime - plan.stsRequest.durationSeconds) * 1000,
  ).toISOString();
  const current = new Date(now);
  assert.ok(!Number.isNaN(current.valueOf()), "credential compile time is invalid");
  assert.ok(
    current.valueOf() >= Date.parse(issuedAt) - 60_000
      && current.valueOf() <= Date.parse(issuedAt) + 5 * 60_000,
    "STS response was not compiled immediately after issuance",
  );
  assert.ok(
    Date.parse(expiresAt) - current.valueOf() >= MINIMUM_COMPILED_REMAINING_SECONDS * 1000,
    "STS credentials do not retain the required execution window",
  );
  const secrets = stsResponse.Response.Credentials;
  for (const [label, value, minimum] of [
    ["temporary SecretId", secrets.TmpSecretId, 12],
    ["temporary SecretKey", secrets.TmpSecretKey, 16],
    ["temporary token", secrets.Token, 16],
  ]) {
    assert.equal(typeof value, "string", `${label} is invalid`);
    assert.ok(value.length >= minimum, `${label} is incomplete`);
    assert.equal(value.trim(), value, `${label} contains forbidden whitespace`);
    assert.doesNotMatch(value, /[\r\n\0]/u, `${label} contains forbidden whitespace`);
  }
  return Object.freeze({
    expiresAt,
    grant: plan.credentialGrant,
    issuance: {
      durationSeconds: plan.stsRequest.durationSeconds,
      method: "TENCENT_STS_GET_FEDERATION_TOKEN",
      planDigest: plan.planDigest,
      policyDigest: stableSha256(plan.stsRequest.policy),
      requestDigest: stableSha256(plan.stsRequest),
      requestId: stsResponse.Response.RequestId.toLowerCase(),
    },
    issuedAt,
    schemaVersion: P0R_COS_CREDENTIAL_SCHEMA_VERSION,
    secretId: secrets.TmpSecretId,
    secretKey: secrets.TmpSecretKey,
    sessionToken: secrets.Token,
  });
}

async function readJson(path, label, { secure = false } = {}) {
  const facts = await lstat(path);
  assert.equal(facts.isSymbolicLink(), false, `${label} must not be a symlink`);
  assert.equal(facts.isFile(), true, `${label} must be a regular file`);
  assert.ok(facts.size > 0 && facts.size <= MAXIMUM_JSON_BYTES, `${label} size is invalid`);
  if (secure) assert.equal(facts.mode & 0o077, 0, `${label} permissions are too open`);
  const value = JSON.parse(await readFile(path, "utf8"));
  assert.ok(isRecord(value), `${label} must contain one JSON object`);
  return value;
}

async function writeJsonExclusive(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  await chmod(path, 0o600);
}

function parseArguments(argv) {
  assert.equal(argv.length % 2, 0, "arguments must be name/value pairs");
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    assert.match(argv[index], /^--[a-z][a-z0-9-]*$/u, "argument name is invalid");
    const name = argv[index].slice(2);
    assert.equal(options[name], undefined, `duplicate argument ${argv[index]}`);
    options[name] = argv[index + 1];
  }
  return options;
}

async function main() {
  const [command, ...values] = process.argv.slice(2);
  const options = parseArguments(values);
  if (command === "create-plan") {
    for (const name of ["app-id", "bucket-base-name", "output", "source-commit", "source-ip-cidr"]) {
      assert.ok(options[name], `--${name} is required`);
    }
    const plannedAt = options.now ?? new Date().toISOString();
    const runId = options["run-id"] ?? createP0RRunId(new Date(plannedAt));
    const plan = buildP0RCosProvisioningPlan({
      appId: options["app-id"],
      bucketBaseName: options["bucket-base-name"],
      plannedAt,
      region: options.region ?? "ap-hongkong",
      runId,
      sourceCommit: options["source-commit"],
      sourceIpCidr: options["source-ip-cidr"],
    });
    assert.deepEqual(
      Object.keys(options).sort(),
      ["app-id", "bucket-base-name", "now", "output", "region", "run-id", "source-commit", "source-ip-cidr"]
        .filter((name) => options[name] !== undefined)
        .sort(),
      "unknown create-plan argument",
    );
    await writeJsonExclusive(resolve(options.output), plan);
    process.stdout.write(`${JSON.stringify({
      containsSecret: false,
      planDigest: plan.planDigest,
      runId,
      status: "PASS_P0R_COS_PROVISIONING_PLAN",
    })}\n`);
    return;
  }
  if (command === "verify-plan") {
    assert.deepEqual(Object.keys(options).sort(), ["input", "run-id", "source-commit"]);
    const plan = validateP0RCosProvisioningPlan(await readJson(resolve(options.input), "plan"));
    assert.equal(plan.sourceCommit, options["source-commit"], "plan source commit mismatch");
    assert.equal(plan.credentialGrant.runId, options["run-id"], "plan run ID mismatch");
    process.stdout.write(`${JSON.stringify({
      containsSecret: false,
      planDigest: plan.planDigest,
      policyDigest: stableSha256(plan.stsRequest.policy),
      status: "PASS_P0R_COS_PROVISIONING_PLAN_VERIFIED",
    })}\n`);
    return;
  }
  if (command === "compile-credentials") {
    assert.deepEqual(Object.keys(options).sort(), ["now", "output", "plan", "sts-response"]
      .filter((name) => options[name] !== undefined).sort());
    for (const name of ["output", "plan", "sts-response"]) {
      assert.ok(options[name], `--${name} is required`);
    }
    const plan = validateP0RCosProvisioningPlan(await readJson(resolve(options.plan), "plan"));
    const output = resolve(options.output);
    assert.equal(
      output,
      `/dev/shm/market-radar-v2-p0r-${plan.credentialGrant.runId}.cos-credentials.json`,
      "credential output must use the exact /dev/shm run path",
    );
    const responsePath = resolve(options["sts-response"]);
    assert.ok(responsePath.startsWith("/dev/shm/"), "STS response must remain in /dev/shm");
    try {
      const stsResponse = await readJson(responsePath, "STS response", { secure: true });
      const credentials = compileP0RCosCredentials({
        now: options.now ?? new Date().toISOString(),
        plan,
        stsResponse,
      });
      await writeJsonExclusive(output, credentials);
      process.stdout.write(`${JSON.stringify({
        containsSecret: false,
        planDigest: credentials.issuance.planDigest,
        requestId: credentials.issuance.requestId,
        status: "PASS_P0R_EPHEMERAL_CREDENTIAL_COMPILED",
      })}\n`);
    } finally {
      await rm(responsePath, { force: true });
    }
    return;
  }
  throw new Error("command must be create-plan, verify-plan or compile-credentials");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      reason: error instanceof Error ? error.message : "unexpected_error",
      status: "BLOCKED",
    })}\n`);
    process.exitCode = 1;
  });
}
