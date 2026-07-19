import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  BUILD_RECORD_PATH,
  buildTransportBundle,
  createProductionVerificationRequest,
  validateContract,
  validateLocalPreparation,
  validateProductionVerificationRequest,
  validateTransportManifest,
} from "./bundle.mjs";

const execFileAsync = promisify(execFile);
const hash = (value) => String(value).repeat(64).slice(0, 64);
const sourceIdentity = {
  sourceCommit: "a".repeat(40),
  sourceTree: "b".repeat(40),
  sourceParentCommit: "c".repeat(40),
};
const cycle5ProductionCommit = "94b6d415573f5d8b2d0190c809a4b8e128a25aa8";
const cycle5ProductionTree = "3d362ceaad05f24f705efe2d871a5a46c3d8704e";
const cycle5BuildRecordPath =
  "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-cycle-continuation-94b6d415573f-98459433/target-images-record.json";

test("validates exact local reference, production, and current code blobs", async () => {
  const result = await validateLocalPreparation(process.cwd());
  assert.equal(result.status, "PASS_LOCAL_SHADOW_VERIFY_CODE_PRESENCE_PREPARATION");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.codePathCount, 3);
});

test("builds byte-identical redacted transports", async () => {
  const directory = await mkdtemp(join(tmpdir(), "code-presence-bundle-test-"));
  try {
    const first = await buildTransportBundle({
      root: process.cwd(), output: join(directory, "first.tar.gz"), sourceIdentity,
    });
    const second = await buildTransportBundle({
      root: process.cwd(), output: join(directory, "second.tar.gz"), sourceIdentity,
    });
    assert.equal(first.sha256, second.sha256);
    assert.deepEqual(await readFile(first.output), await readFile(second.output));
    assert.equal(first.manifest.productionMutationAllowed, false);
    assert.deepEqual(first.manifest.services, []);
    const extracted = join(directory, "extracted");
    await execFileAsync("mkdir", ["-p", extracted]);
    await execFileAsync("tar", ["-xzf", first.output, "-C", extracted]);
    assert.equal(await validateTransportManifest(first.manifest, extracted), first.manifest);
    await appendFile(join(extracted,
      "scripts/production/candidate-shadow-verify-code-presence/production-runner.sh"), "\n# drift\n");
    await assert.rejects(() => validateTransportManifest(first.manifest, extracted),
      /transport_manifest_file_hash_mismatch/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("creates a 30-minute verify-only request and rejects runtime drift", () => {
  const runtime = {
    buildRecordSha256: hash("1"),
    buildRecordWebImageId: `sha256:${hash("2")}`,
    currentWebContainerId: "3".repeat(64),
    currentWebImageId: `sha256:${hash("2")}`,
    healthLevel: "ready",
    scanFreshness: "fresh",
  };
  const manifest = {
    ...sourceIdentity,
    runnerArtifactSha256: hash("4"),
    contractSha256: hash("5"),
  };
  const now = new Date("2026-07-19T02:00:00.000Z");
  const request = createProductionVerificationRequest({
    bundleSha256: hash("6"), manifest, runtime, now,
    nonce: "12345678-1234-4123-8123-123456789abc",
  });
  assert.equal(validateProductionVerificationRequest(request, manifest, {
    bundleSha256: hash("6"), now,
  }).productionMutationAllowed, false);
  assert.deepEqual(request.services, []);
  assert.equal(request.authorization.riskTier, "R0_READ_ONLY");
  assert.equal(request.authorization.transportBundleSha256, hash("6"));
  assert.throws(() => validateProductionVerificationRequest({
    ...request,
    currentWebImageId: `sha256:${hash("7")}`,
  }, manifest, { bundleSha256: hash("6"), now }), /request_runtime_invalid/u);
  assert.throws(() => validateProductionVerificationRequest({
    ...request,
    authorization: { ...request.authorization, targetCommit: "8".repeat(40) },
  }, manifest, {
    bundleSha256: hash("6"), now,
  }), /request_authorization_invalid/u);
  assert.throws(() => validateProductionVerificationRequest(request, manifest, {
    bundleSha256: hash("6"), now: new Date("2026-07-19T02:31:00.000Z"),
  }), /request_window_invalid/u);
});

test("rejects the Cycle-5 contract, production identity, and obsolete build record path", async () => {
  const legacyContract = JSON.parse(await readFile(resolve(process.cwd(),
    "docs/governance/wp-g0-2-shadow-verify-production-code-presence-identity-remediation.v1.json"),
  "utf8"));
  assert.throws(() => validateContract(legacyContract), /contract_identity_invalid/u);

  const runtime = {
    buildRecordSha256: hash("1"),
    buildRecordWebImageId: `sha256:${hash("2")}`,
    currentWebContainerId: "3".repeat(64),
    currentWebImageId: `sha256:${hash("2")}`,
    healthLevel: "ready",
    scanFreshness: "fresh",
  };
  const manifest = {
    ...sourceIdentity,
    runnerArtifactSha256: hash("4"),
    contractSha256: hash("5"),
  };
  const now = new Date("2026-07-19T02:00:00.000Z");
  const request = createProductionVerificationRequest({
    bundleSha256: hash("6"), manifest, runtime, now,
    nonce: "12345678-1234-4123-8123-123456789abc",
  });
  assert.equal(request.buildRecordPath, BUILD_RECORD_PATH);
  for (const drift of [
    { productionCommit: cycle5ProductionCommit },
    { productionTree: cycle5ProductionTree },
    { buildRecordPath: cycle5BuildRecordPath },
  ]) {
    assert.throws(() => validateProductionVerificationRequest({ ...request, ...drift }, manifest, {
      bundleSha256: hash("6"), now,
    }), /request_identity_invalid/u);
  }
});
