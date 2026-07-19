import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  buildTransportBundle,
  createProductionVerificationRequest,
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

test("validates exact local reference, production, and current code blobs", async () => {
  const result = await validateLocalPreparation(process.cwd());
  assert.equal(result.status, "PASS_LOCAL_CANONICAL_COMPAT_CODE_PRESENCE_PREPARATION");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.codePathCount, 8);
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
      "scripts/production/candidate-canonical-compat-code-presence/production-runner.sh"), "\n# drift\n");
    await assert.rejects(() => validateTransportManifest(first.manifest, extracted),
      /transport_manifest_file_hash_mismatch/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("creates a 30-minute verify-only request and rejects runtime drift", () => {
  const runtime = {
    buildRecordPath: "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-shadow-verify-release-test-12345678/target-images-redacted.json",
    buildRecordSha256: hash("1"),
    buildRecordWebImageId: `sha256:${hash("2")}`,
    currentWebContainerId: "3".repeat(64),
    currentWebImageId: `sha256:${hash("2")}`,
    migrationId: "candidate-episode-v1-cycle-6",
    releaseId: "candidate-shadow-cycle-6-72ee2893",
    authorityEpoch: 2,
    manifestSha256: hash("8"),
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
  assert.throws(() => validateProductionVerificationRequest({
    ...request,
    currentWebImageId: `sha256:${hash("7")}`,
  }, manifest, { bundleSha256: hash("6"), now }), /request_runtime_invalid/u);
  assert.throws(() => validateProductionVerificationRequest(request, manifest, {
    bundleSha256: hash("6"), now: new Date("2026-07-19T02:31:00.000Z"),
  }), /request_window_invalid/u);
});
