import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildP0RCosProvisioningPlan,
  compileP0RCosCredentials,
  createP0RRunId,
  P0R_COS_CREDENTIAL_SCHEMA_VERSION,
  P0R_COS_GRANT_ACTIONS,
  stableSha256,
  validateP0RCosProvisioningPlan,
} from "./m1-production-storage-p0r-cos-provisioning.mjs";

const NOW = "2026-07-21T12:34:56.000Z";
const RUN_ID = `p0r-20260721t123456z-${"a".repeat(32)}`;
const SOURCE_COMMIT = "b".repeat(40);

function plan() {
  return buildP0RCosProvisioningPlan({
    appId: "1445289689",
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
  assert.equal(value.stsRequest.durationSeconds, 7_200);
  assert.equal("principal" in value.stsRequest.policy, false);
  assert.equal(value.overwriteProtection.forbidOverwriteHeaderEffectiveWithVersioning, false);
  assert.equal(value.overwriteProtection.preUploadAbsenceRequired, true);
  const policyText = JSON.stringify(value.stsRequest.policy);
  assert.match(policyText, /name\/cos:HeadBucket/u);
  assert.match(policyText, /name\/cos:PutObject/u);
  assert.match(policyText, /cos:object-lock-mode/u);
  assert.match(policyText, /203\.0\.113\.24\/32/u);
  assert.doesNotMatch(policyText, /DeleteObject|resource":"\*"/u);
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
      appId: "1445289689",
      bucketBaseName: "market-radar-v2-p0r",
      plannedAt: NOW,
      region: "ap-hongkong",
      runId: RUN_ID,
      sourceCommit: SOURCE_COMMIT,
    },
    sourceIpCidr: "0.0.0.0/0",
  }), /IPv4 \/32/u);
  assert.throws(() => buildP0RCosProvisioningPlan({
    appId: "1445289689",
    bucketBaseName: "market-radar-v2-p0r",
    plannedAt: NOW,
    region: "ap-hongkong",
    runId: `p0r-20260721t123455z-${"a".repeat(32)}`,
    sourceCommit: SOURCE_COMMIT,
    sourceIpCidr: "203.0.113.24/32",
  }), /timestamp/u);
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

test("create-plan CLI writes a mode-600, secret-free artifact", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p0r-cos-plan-"));
  const output = join(directory, "plan.json");
  const stdout = execFileSync(process.execPath, [
    "scripts/v2/production/m1-production-storage-p0r-cos-provisioning.mjs",
    "create-plan",
    "--app-id", "1445289689",
    "--bucket-base-name", "market-radar-v2-p0r",
    "--now", NOW,
    "--output", output,
    "--run-id", RUN_ID,
    "--source-commit", SOURCE_COMMIT,
    "--source-ip-cidr", "203.0.113.24/32",
  ], { encoding: "utf8" });
  assert.equal(JSON.parse(stdout).status, "PASS_P0R_COS_PROVISIONING_PLAN");
  assert.equal((await stat(output)).mode & 0o077, 0);
  const content = await readFile(output, "utf8");
  for (const forbidden of ["TmpSecret", "sessionToken", "privateKey", "password"]) {
    assert.equal(content.includes(forbidden), false);
  }
});
