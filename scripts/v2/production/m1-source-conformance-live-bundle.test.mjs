import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  buildLiveSourceConformanceApprovalRequest,
  buildLiveSourceConformanceBundle,
} from "./m1-source-conformance-live-bundle.mjs";
import {
  LIVE_SOURCE_CONFORMANCE_ENTRYPOINT,
  LIVE_SOURCE_CONFORMANCE_PACKAGE_ID,
  LIVE_SOURCE_CONFORMANCE_SUCCESS_MARKER,
  validateLiveSourceConformanceRequest,
} from "./m1-source-conformance-live-runner.mjs";
import {
  generateSigningKeyPair,
  prepareDispatch,
  validateOutbox,
} from "./fixed-channel/production-dispatch.mjs";

const execFileAsync = promisify(execFile);
const SOURCE_COMMIT = "a".repeat(40);
const SOURCE_TREE = "b".repeat(40);
const PRODUCTION_HEAD = "c".repeat(40);
const ISSUED_AT = "2026-07-23T14:00:00.000Z";
const EXPIRES_AT = "2026-07-23T15:30:00.000Z";
const SOURCE_REF = "refs/heads/codex/market-radar-v2-implementation";
const DISPATCH_ID = "m1-1b0-bundle-rehearsal-20260723t220000z";
const RUNNER_UNIT = "market-radar-m1-1b0-rehearsal01";
const CONTAINER_IDS = Object.freeze(
  Array.from(
    { length: 11 },
    (_, index) => (index + 1).toString(16).padStart(64, "0"),
  ),
);

function approval() {
  return {
    dispatchId: DISPATCH_ID,
    expectedContainerIds: CONTAINER_IDS,
    expectedProductionHead: PRODUCTION_HEAD,
    expiresAt: EXPIRES_AT,
    issuedAt: ISSUED_AT,
    revocationEpoch: 1,
    runnerUnitName: RUNNER_UNIT,
    sourceRef: SOURCE_REF,
  };
}

test("builds a deterministic no-secret runtime bundle accepted by the fixed channel", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "m1-1b0-bundle-test-"));
  try {
    const first = await buildLiveSourceConformanceBundle({
      approval: approval(),
      outputDirectory: join(temporary, "first"),
      root: process.cwd(),
      sourceCommit: SOURCE_COMMIT,
      sourceTree: SOURCE_TREE,
      verifySourceBinding: false,
    });
    const second = await buildLiveSourceConformanceBundle({
      approval: approval(),
      outputDirectory: join(temporary, "second"),
      root: process.cwd(),
      sourceCommit: SOURCE_COMMIT,
      sourceTree: SOURCE_TREE,
      verifySourceBinding: false,
    });

    assert.equal(first.result.bundleSha256, second.result.bundleSha256);
    assert.equal(first.result.approvalRequestSha256,
      second.result.approvalRequestSha256);
    assert.equal(first.result.containsSecrets, false);
    assert.equal(first.result.fileCount, 125);
    assert.equal(first.request.sourceCommit, SOURCE_COMMIT);
    assert.equal(first.request.expectedProbeCount, 15);
    assert.equal(first.request.applicationMutationAllowed, false);
    assert.equal(first.request.databaseMutationAllowed, false);
    assert.equal(first.request.workerMutationAllowed, false);
    assert.equal(first.request.transportContainsSecrets, false);
    assert.equal(
      first.request.productionMutationScope,
      "dispatch_staging_and_sanitized_evidence_only",
    );

    const { stdout: entriesRaw } = await execFileAsync(
      "tar",
      ["-tzf", join(temporary, "first/bundle.tar.gz")],
      { encoding: "utf8" },
    );
    const entries = entriesRaw.split(/\r?\n/u).filter(Boolean);
    assert.equal(entries.length, 125);
    assert.ok(entries.includes(LIVE_SOURCE_CONFORMANCE_ENTRYPOINT));
    assert.ok(entries.includes(
      "runtime/v2/modules/source-conformance/adapters/exact-source-conformance-runner.js",
    ));
    assert.ok(entries.includes("runtime/node_modules/zod/package.json"));
    assert.equal(
      entries.some((entry) =>
        /(?:^|\/)(?:\.env|credentials?|secrets?|id_rsa)(?:\/|$)/iu.test(entry)
      ),
      false,
    );

    const privateKey = join(temporary, "keys/private.pem");
    const publicKey = join(temporary, "keys/public.pem");
    await generateSigningKeyPair({
      privateKeyPath: privateKey,
      publicKeyPath: publicKey,
    });
    const outbox = join(temporary, "outbox");
    const prepared = await prepareDispatch({
      approvalRequestPath: join(temporary, "first/approval-request.json"),
      bundlePath: join(temporary, "first/bundle.tar.gz"),
      dispatch: {
        dispatchId: DISPATCH_ID,
        entrypointPath: LIVE_SOURCE_CONFORMANCE_ENTRYPOINT,
        expiresAt: EXPIRES_AT,
        issuedAt: ISSUED_AT,
        launchSuccessMarker: LIVE_SOURCE_CONFORMANCE_SUCCESS_MARKER,
        packageId: LIVE_SOURCE_CONFORMANCE_PACKAGE_ID,
        revocationEpoch: 1,
        runnerUnitName: RUNNER_UNIT,
        runtimeMaxSeconds: 100,
        sourceRef: SOURCE_REF,
        stagingDirectory: first.request.stagingDirectory,
        targetCommit: SOURCE_COMMIT,
      },
      outbox,
      privateKeyPath: privateKey,
      now: new Date(ISSUED_AT),
    });
    const validated = await validateOutbox(outbox, publicKey, {
      now: new Date(ISSUED_AT),
    });
    assert.equal(prepared.status, "PASS_SIGNED_DISPATCH_PREPARED");
    assert.equal(validated.status, "PASS_SIGNED_DISPATCH_OUTBOX");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("request contract rejects authority, identity and approval inflation", () => {
  const request = buildLiveSourceConformanceApprovalRequest({
    ...approval(),
    bundleSha256: "d".repeat(64),
    manifestSha256: "e".repeat(64),
    probePlanDigest: `sha256:${"f".repeat(64)}`,
    registryDigest: `sha256:${"1".repeat(64)}`,
    sourceCommit: SOURCE_COMMIT,
    sourceTree: SOURCE_TREE,
  });
  const now = new Date(ISSUED_AT);

  assert.equal(validateLiveSourceConformanceRequest(request, { now }), request);
  for (const tampered of [
    { ...request, applicationMutationAllowed: true },
    { ...request, databaseMutationAllowed: true },
    { ...request, expectedProbeCount: 14 },
    { ...request, transportContainsSecrets: true },
    {
      ...request,
      expectedContainerIds: request.expectedContainerIds.slice(1),
    },
    {
      ...request,
      approvalExpiresAt: "2026-07-23T16:00:01.000Z",
    },
  ]) {
    assert.throws(
      () => validateLiveSourceConformanceRequest(tampered, { now }),
    );
  }
});

test("build result and approval request contain no credential material", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "m1-1b0-secret-test-"));
  try {
    await buildLiveSourceConformanceBundle({
      approval: approval(),
      outputDirectory: join(temporary, "package"),
      root: process.cwd(),
      sourceCommit: SOURCE_COMMIT,
      sourceTree: SOURCE_TREE,
      verifySourceBinding: false,
    });
    const output = [
      await readFile(join(temporary, "package/build-result.json"), "utf8"),
      await readFile(join(temporary, "package/approval-request.json"), "utf8"),
    ].join("\n");
    assert.doesNotMatch(
      output,
      /(?:CG-API-KEY|CHANGE_ME_COINGLASS_API_KEY|Bearer\s+[A-Za-z0-9._-]{20,})/u,
    );
    assert.match(output, /PRODUCTION_ENV_FILE_EXACT_KEY/u);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
