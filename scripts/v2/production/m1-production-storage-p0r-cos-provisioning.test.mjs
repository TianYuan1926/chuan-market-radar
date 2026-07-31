import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import {
  buildP0RCosProvisioningPlan,
  compileP0RCosCredentials,
  createP0RRunId,
  P0R_COS_CREDENTIAL_SCHEMA_VERSION,
  P0R_COS_GRANT_ACTIONS,
  readBoundedSecretInput,
  receiveP0RAgeIdentity,
  receiveP0RCredentials,
  stableSha256,
  validateP0RAgeIdentity,
  validateP0RCosProvisioningPlan,
} from "./m1-production-storage-p0r-cos-provisioning.mjs";

const NOW = "2026-07-21T12:34:56.000Z";
const RUN_ID = `p0r-20260721t123456z-${"a".repeat(32)}`;
const SOURCE_COMMIT = "b".repeat(40);

function plan() {
  return buildP0RCosProvisioningPlan({
    appId: "1234567890",
    bucketBaseName: "market-radar-v2-p0r",
    plannedAt: NOW,
    region: "ap-hongkong",
    runId: RUN_ID,
    sourceCommit: SOURCE_COMMIT,
    sourceIpCidr: "203.0.113.24/32",
  });
}

function response() {
  const expiredTime = Date.parse(NOW) / 1000 + 7_200;
  return {
    Response: {
      Credentials: {
        TmpSecretId: "AKIDtemporary123456",
        TmpSecretKey: "temporary-secret-key-material",
        Token: "temporary-session-token-material",
      },
      Expiration: new Date(expiredTime * 1000).toISOString(),
      ExpiredTime: expiredTime,
      RequestId: "59a5e07e-4147-4d2e-a808-dca76ac5b3fd",
    },
  };
}

test("builds a deterministic single-AZ immutable COS plan with exact object scope", () => {
  const value = plan();
  assert.deepEqual(validateP0RCosProvisioningPlan(value), value);
  assert.equal(value.bucketConfiguration.availabilityZoneType, "SINGLE_AZ");
  assert.equal(value.bucketConfiguration.accessControl, "PRIVATE");
  assert.equal(value.bucketConfiguration.versioning, "ENABLED");
  assert.deepEqual(value.bucketConfiguration.objectLock, {
    defaultRetentionDays: 31,
    mode: "COMPLIANCE",
    permanent: true,
  });
  assert.equal(value.credentialGrant.objectKey, `${
    "market-radar-v2/p0r/2026-07-21/"
  }${RUN_ID}.dump.age`);
  assert.deepEqual(value.credentialGrant.actions, P0R_COS_GRANT_ACTIONS);
  assert.deepEqual(Object.keys(value.stsRequest).sort(), [
    "action",
    "durationSeconds",
    "endpoint",
    "name",
    "policy",
    "region",
    "version",
  ]);
  assert.equal(value.stsRequest.durationSeconds, 7_200);
  assert.equal(value.stsRequest.region, "ap-hongkong");
  assert.equal("principal" in value.stsRequest.policy, false);
  assert.equal(value.overwriteProtection.forbidOverwriteHeaderEffectiveWithVersioning, false);
  assert.equal(value.overwriteProtection.preUploadAbsenceRequired, true);
  const policyText = JSON.stringify(value.stsRequest.policy);
  assert.match(policyText, /name\/cos:HeadBucket/u);
  assert.match(policyText, /name\/cos:PutObject/u);
  assert.match(policyText, /cos:object-lock-mode/u);
  assert.match(policyText, /203\.0\.113\.24\/32/u);
  assert.doesNotMatch(policyText, /DeleteObject|resource":"\*"/u);

  const bucketStatement = value.stsRequest.policy.statement.find((statement) =>
    statement.action.includes("name/cos:HeadBucket"));
  assert.ok(bucketStatement, "bucket-control statement is missing");
  const appId = value.credentialGrant.bucket.split("-").at(-1);
  const bucketRootResource = `${
    `qcs::cos:${value.credentialGrant.region}:uid/${appId}:`
  }${value.credentialGrant.bucket}/`;
  assert.deepEqual(bucketStatement.resource, [
    bucketRootResource,
    `${bucketRootResource}*`,
  ]);
  assert.deepEqual(bucketStatement.action, [
    "name/cos:GetBucketACL",
    "name/cos:GetBucketObjectLock",
    "name/cos:GetBucketPolicy",
    "name/cos:GetBucketVersioning",
    "name/cos:HeadBucket",
  ]);
  assert.ok(value.credentialGrant.actions.includes("cos:GetBucketObjectLock"));
  assert.equal(
    value.credentialGrant.actions.includes("cos:GetBucketObjectLockConfiguration"),
    false,
  );

  const objectResource = `${bucketRootResource}${value.credentialGrant.objectKey}`;
  for (const statement of value.stsRequest.policy.statement.slice(1)) {
    assert.deepEqual(statement.resource, [objectResource]);
  }
});

test("high-entropy run ID binds timestamp and exactly 128 random bits", () => {
  const value = createP0RRunId(new Date(NOW), Buffer.alloc(16, 0xab));
  assert.equal(value, `p0r-20260721t123456z-${"ab".repeat(16)}`);
});

test("rejects plan drift, broad network scope and timestamp reuse", () => {
  const drifted = structuredClone(plan());
  drifted.stsRequest.policy.statement[2].resource = ["*"];
  assert.throws(() => validateP0RCosProvisioningPlan(drifted), /digest mismatch/u);
  assert.throws(() => buildP0RCosProvisioningPlan({
    ...{
      appId: "1234567890",
      bucketBaseName: "market-radar-v2-p0r",
      plannedAt: NOW,
      region: "ap-hongkong",
      runId: RUN_ID,
      sourceCommit: SOURCE_COMMIT,
    },
    sourceIpCidr: "0.0.0.0/0",
  }), /IPv4 \/32/u);
  assert.throws(() => buildP0RCosProvisioningPlan({
    appId: "1234567890",
    bucketBaseName: "market-radar-v2-p0r",
    plannedAt: NOW,
    region: "ap-hongkong",
    runId: `p0r-20260721t123455z-${"a".repeat(32)}`,
    sourceCommit: SOURCE_COMMIT,
    sourceIpCidr: "203.0.113.24/32",
  }), /timestamp/u);
});

test("fails closed when the required Tencent STS Region is missing or mismatched", () => {
  for (const mutate of [
    (value) => {
      delete value.stsRequest.region;
    },
    (value) => {
      value.stsRequest.region = "ap-singapore";
    },
  ]) {
    const drifted = structuredClone(plan());
    mutate(drifted);
    const unsigned = structuredClone(drifted);
    delete unsigned.planDigest;
    drifted.planDigest = stableSha256(unsigned);
    assert.throws(
      () => validateP0RCosProvisioningPlan(drifted),
      /contract drift/u,
    );
  }
});

test("rejects superseded Object Lock actions, plan schemas and credential schemas", () => {
  const supersededPlan = structuredClone(plan());
  supersededPlan.schemaVersion = "v2-m1-production-storage-cos-provisioning-plan.v3";
  const unsignedPlan = structuredClone(supersededPlan);
  delete unsignedPlan.planDigest;
  supersededPlan.planDigest = stableSha256(unsignedPlan);
  assert.throws(
    () => validateP0RCosProvisioningPlan(supersededPlan),
    /strictly equal/u,
  );

  const wrongActionPlan = structuredClone(plan());
  wrongActionPlan.credentialGrant.actions = wrongActionPlan.credentialGrant.actions.map(
    (action) => action === "cos:GetBucketObjectLock"
      ? "cos:GetBucketObjectLockConfiguration"
      : action,
  );
  wrongActionPlan.stsRequest.policy.statement[0].action =
    wrongActionPlan.stsRequest.policy.statement[0].action.map(
      (action) => action === "name/cos:GetBucketObjectLock"
        ? "name/cos:GetBucketObjectLockConfiguration"
        : action,
    );
  const unsignedWrongAction = structuredClone(wrongActionPlan);
  delete unsignedWrongAction.planDigest;
  wrongActionPlan.planDigest = stableSha256(unsignedWrongAction);
  assert.throws(
    () => validateP0RCosProvisioningPlan(wrongActionPlan),
    /contract drift/u,
  );

  const supersededCredentials = compileP0RCosCredentials({
    now: NOW,
    plan: plan(),
    stsResponse: response(),
  });
  assert.equal(supersededCredentials.schemaVersion, P0R_COS_CREDENTIAL_SCHEMA_VERSION);
  assert.notEqual(
    supersededCredentials.schemaVersion,
    "v2-m1-production-storage-cos-temporary-credentials.v2",
  );
});

test("compiles current Tencent STS response into a plan-bound credential envelope", () => {
  const value = compileP0RCosCredentials({ now: NOW, plan: plan(), stsResponse: response() });
  assert.equal(value.schemaVersion, P0R_COS_CREDENTIAL_SCHEMA_VERSION);
  assert.deepEqual(value.grant, plan().credentialGrant);
  assert.equal(value.issuance.durationSeconds, 7_200);
  assert.equal(value.issuance.planDigest, plan().planDigest);
  assert.equal(value.issuance.policyDigest, stableSha256(plan().stsRequest.policy));
  assert.equal(value.issuance.requestDigest, stableSha256(plan().stsRequest));
  assert.equal(value.issuance.method, "TENCENT_STS_GET_FEDERATION_TOKEN");
});

test("credential compiler fails closed on stale, inflated or ambiguous responses", () => {
  const stale = response();
  assert.throws(() => compileP0RCosCredentials({
    now: "2026-07-21T12:11:00.000Z",
    plan: plan(),
    stsResponse: stale,
  }), /immediately after issuance/u);

  const extra = response();
  extra.Response.AssumedRoleUser = {};
  assert.throws(() => compileP0RCosCredentials({ now: NOW, plan: plan(), stsResponse: extra }), /fields must be exact/u);

  const mismatch = response();
  mismatch.Response.Expiration = "2026-07-21T14:35:00.000Z";
  assert.throws(() => compileP0RCosCredentials({ now: NOW, plan: plan(), stsResponse: mismatch }), /disagree/u);
});

test("bounded secret ingress drains, limits and validates exact age identity input", async () => {
  const sourceChunk = Buffer.from("abcdef");
  const value = await readBoundedSecretInput(
    Readable.from([sourceChunk]),
    6,
    "fixture",
  );
  assert.equal(value.toString("utf8"), "abcdef");
  assert.equal(sourceChunk.equals(Buffer.alloc(sourceChunk.length)), true);
  value.fill(0);
  await assert.rejects(
    () => readBoundedSecretInput(Readable.from(["abcdef", "g"]), 6, "fixture"),
    /bounded input limit/u,
  );
  assert.equal(
    validateP0RAgeIdentity(`# generated\nAGE-SECRET-KEY-1${"A".repeat(58)}\n`),
    `AGE-SECRET-KEY-1${"A".repeat(58)}\n`,
  );
  assert.throws(
    () => validateP0RAgeIdentity("AGE-SECRET-KEY-1ABC\nAGE-SECRET-KEY-1DEF\n"),
    /exactly one/u,
  );
  assert.throws(
    () => validateP0RAgeIdentity(`AGE-SECRET-KEY-1${"B".repeat(58)}\n`),
    /not one X25519/u,
  );
  assert.throws(
    () => validateP0RAgeIdentity(`AGE-SECRET-KEY-1${"A".repeat(57)}\n`),
    /not one X25519/u,
  );
});

test("stdin credential ingress compiles immediately without persisting a raw response", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p0r-cos-stdin-"));
  const runId = createP0RRunId(new Date(NOW), randomBytes(16));
  const exactPlan = buildP0RCosProvisioningPlan({
    appId: "1234567890",
    bucketBaseName: "market-radar-v2-p0r",
    plannedAt: NOW,
    region: "ap-hongkong",
    runId,
    sourceCommit: SOURCE_COMMIT,
    sourceIpCidr: "203.0.113.24/32",
  });
  const credentialPath = join(directory, "cos-credentials.json");
  const rawPath = join(directory, "sts-response.json");
  try {
    const credentials = await receiveP0RCredentials({
      input: Readable.from([JSON.stringify(response())]),
      now: NOW,
      output: credentialPath,
      plan: exactPlan,
    });
    assert.equal(credentials.issuance.planDigest, exactPlan.planDigest);
    await assert.rejects(() => access(rawPath), /ENOENT/u);
    const handle = await open(credentialPath, "r");
    try {
      const facts = await handle.stat();
      assert.equal(facts.mode & 0o077, 0);
      const stored = JSON.parse(await handle.readFile("utf8"));
      assert.equal(stored.issuance.planDigest, exactPlan.planDigest);
    } finally {
      await handle.close();
    }
  } finally {
    await rm(credentialPath, { force: true });
    await rm(rawPath, { force: true });
    await rm(directory, { recursive: true, force: true });
  }
});

test("credential ingress CLI rejects every caller-supplied clock override", () => {
  const result = spawnSync(process.execPath, [
    "scripts/v2/production/m1-production-storage-p0r-cos-provisioning.mjs",
    "receive-credentials",
    "--plan", "/does/not/matter.json",
    "--now", NOW,
  ], { encoding: "utf8", input: "{}" });
  assert.notEqual(result.status, 0);
  const failure = JSON.parse(result.stderr);
  assert.equal(failure.status, "BLOCKED");
  assert.match(failure.reason, /accepts only the exact plan path/u);
});

test("stdin age ingress writes only the exact mode-600 run-bound identity path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p0r-age-stdin-"));
  const identityPath = join(directory, "age-identity.txt");
  const identity = `AGE-SECRET-KEY-1${"Q".repeat(58)}`;
  try {
    await receiveP0RAgeIdentity({
      input: Readable.from([`${identity}\n`]),
      output: identityPath,
    });
    const handle = await open(identityPath, "r");
    try {
      assert.equal((await handle.stat()).mode & 0o077, 0);
      assert.equal(await handle.readFile("utf8"), `${identity}\n`);
    } finally {
      await handle.close();
    }
  } finally {
    await rm(identityPath, { force: true });
    await rm(directory, { recursive: true, force: true });
  }
});

test("create-plan CLI writes a mode-600, secret-free artifact", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p0r-cos-plan-"));
  const output = join(directory, "plan.json");
  const stdout = execFileSync(process.execPath, [
    "scripts/v2/production/m1-production-storage-p0r-cos-provisioning.mjs",
    "create-plan",
    "--app-id", "1234567890",
    "--bucket-base-name", "market-radar-v2-p0r",
    "--now", NOW,
    "--output", output,
    "--run-id", RUN_ID,
    "--source-commit", SOURCE_COMMIT,
    "--source-ip-cidr", "203.0.113.24/32",
  ], { encoding: "utf8" });
  assert.equal(JSON.parse(stdout).status, "PASS_P0R_COS_PROVISIONING_PLAN");
  const outputHandle = await open(output, "r");
  let content;
  try {
    assert.equal((await outputHandle.stat()).mode & 0o077, 0);
    content = await outputHandle.readFile("utf8");
  } finally {
    await outputHandle.close();
  }
  for (const forbidden of ["TmpSecret", "sessionToken", "privateKey", "password"]) {
    assert.equal(content.includes(forbidden), false);
  }
});
