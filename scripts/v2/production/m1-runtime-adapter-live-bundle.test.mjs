import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  buildLiveRuntimeAdapterBundle,
} from "./m1-runtime-adapter-live-bundle.mjs";
import {
  LIVE_RUNTIME_ADAPTER_ENTRYPOINT,
  LIVE_RUNTIME_ADAPTER_PACKAGE_ID,
  LIVE_RUNTIME_ADAPTER_RUNTIME_ENTRY,
  canonicalJson,
  sha256,
  validateLiveRuntimeAdapterRequest,
} from "./m1-runtime-adapter-live-runner.mjs";
import {
  preflightLiveRuntimeAdapterDispatch,
} from "./m1-runtime-adapter-live-dispatch-preflight.mjs";

const execFileAsync = promisify(execFile);
const SOURCE_COMMIT = "a".repeat(40);
const SOURCE_TREE = "b".repeat(40);
const PRODUCTION_HEAD = "c".repeat(40);
const CONTAINER_IDS = ["1".repeat(64), "2".repeat(64)];
const ISSUED_AT = "2026-07-24T00:00:00.000Z";
const EXPIRES_AT = "2026-07-24T01:30:00.000Z";
const DISPATCH_ID = "m1-4b-runtime-bundle-test-20260724";

function policy(root) {
  const state = join(root, "state");
  return {
    checkpointRoot: join(state, "evidence/m1-runtime-adapter/checkpoints"),
    conformanceEvidenceRoot:
      join(state, "evidence/m1-source-conformance"),
    credentialEnvKey: "COINGLASS_API_KEY",
    credentialFile: join(root, "production/.env.production"),
    dispatchStateRoot: state,
    evidenceRoot: join(state, "evidence/m1-runtime-adapter"),
    expectedTimerUnit: "market-radar-production-dispatch.timer",
    productionWorktree: join(root, "production"),
    stagingRoot: join(root, "staging"),
    stagingPrefix: "m1-4b-runtime-adapter-",
  };
}

function approval(currentPolicy) {
  return {
    conformanceArtifact: {
      artifactId: "source-conformance:test-r3",
      contentHash: `sha256:${"d".repeat(64)}`,
      path: join(
        currentPolicy.conformanceEvidenceRoot,
        "r3.artifact.json",
      ),
      releaseId: "e".repeat(40),
    },
    dispatchId: DISPATCH_ID,
    expectedContainerIds: CONTAINER_IDS,
    expectedProductionHead: PRODUCTION_HEAD,
    expiresAt: EXPIRES_AT,
    issuedAt: ISSUED_AT,
    revocationEpoch: 1,
    runnerUnitName: "market-radar-m1-4b-bundletest01",
    sourceRef: "refs/heads/codex/m1-4b-tencent-runtime",
  };
}

function dispatchEnvelope(request, requestRaw) {
  return {
    approvalRequestSha256: sha256(requestRaw),
    automaticRollbackRequired: true,
    bundleSha256: request.transportBundleSha256,
    dispatchId: request.dispatchId,
    entrypointPath: LIVE_RUNTIME_ADAPTER_ENTRYPOINT,
    expiresAt: request.approvalExpiresAt,
    issuedAt: request.approvalIssuedAt,
    launchSuccessMarker: request.launchSuccessMarker,
    maxExecutions: 1,
    noArbitraryCommand: true,
    packageId: request.packageId,
    productionMutation: true,
    productionWipLimit: 1,
    revocationEpoch: request.revocationEpoch,
    runnerUnitName: request.runnerUnitName,
    runtimeMaxSeconds: request.runtimeDeadlineSeconds + 30,
    sessionIndependentExecutionRequired: true,
    sourceRef: request.sourceRef,
    stagingDirectory: request.stagingDirectory,
    targetCommit: request.sourceCommit,
    transportContainsSecrets: false,
    transportMethod: "signed_git_bundle",
  };
}

test("builds a deterministic no-secret fixed-dispatch runtime bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "m1-runtime-bundle-test-"));
  try {
    const currentPolicy = policy(root);
    await mkdir(root, { recursive: true, mode: 0o700 });
    const first = await buildLiveRuntimeAdapterBundle({
      approval: approval(currentPolicy),
      outputDirectory: join(root, "package-1"),
      policy: currentPolicy,
      root: process.cwd(),
      sourceCommit: SOURCE_COMMIT,
      sourceTree: SOURCE_TREE,
      verifySourceBinding: false,
    });
    const second = await buildLiveRuntimeAdapterBundle({
      approval: approval(currentPolicy),
      outputDirectory: join(root, "package-2"),
      policy: currentPolicy,
      root: process.cwd(),
      sourceCommit: SOURCE_COMMIT,
      sourceTree: SOURCE_TREE,
      verifySourceBinding: false,
    });

    assert.equal(first.result.bundleSha256, second.result.bundleSha256);
    assert.equal(
      first.result.approvalRequestSha256,
      second.result.approvalRequestSha256,
    );
    assert.equal(first.request.packageId, LIVE_RUNTIME_ADAPTER_PACKAGE_ID);
    assert.equal(first.request.transportContainsSecrets, false);
    assert.equal(first.request.expectedLiveConformantProfileCount, 15);
    assert.equal(first.request.expectedRouteEligibleProfileCount, 14);
    assert.deepEqual(first.request.expectedBlockedProbeIds, [
      "BINANCE_SPOT_CATALOG",
    ]);
    assert.equal(first.request.runtimeAuthorityAllowed, false);
    assert.equal(first.request.factAuthorityAllowed, false);
    assert.equal(first.request.candidateAuthorityAllowed, false);
    assert.equal(first.request.strategyAuthorityAllowed, false);
    assert.equal(first.request.rawMarketBodyPersistenceAllowed, false);
    validateLiveRuntimeAdapterRequest(first.request, {
      now: new Date(ISSUED_AT),
      policy: currentPolicy,
    });

    const { stdout } = await execFileAsync("tar", [
      "-tzf",
      join(root, "package-1/bundle.tar.gz"),
    ], { encoding: "utf8" });
    const entries = stdout.trim().split(/\r?\n/u).sort();
    assert.ok(entries.includes(LIVE_RUNTIME_ADAPTER_ENTRYPOINT));
    assert.ok(entries.includes(LIVE_RUNTIME_ADAPTER_RUNTIME_ENTRY));
    assert.ok(entries.includes("scripts/v2/production/m1-source-conformance-live-runner.mjs"));
    assert.ok(entries.includes("runtime/node_modules/zod/package.json"));
    assert.equal(
      entries.some((entry) =>
        /(?:^|\/)(?:\.env|credentials?|secrets?|id_rsa)(?:\/|$)/iu.test(entry)
      ),
      false,
    );
    const archive = await readFile(join(root, "package-1/bundle.tar.gz"));
    assert.equal(archive.includes(Buffer.from("COINGLASS_API_KEY=")), false);
    const entrypoint = await readFile(
      join(process.cwd(), LIVE_RUNTIME_ADAPTER_ENTRYPOINT),
      "utf8",
    );
    assert.match(entrypoint, /m1-4b-runtime-adapter-/u);
    assert.match(
      entrypoint,
      /PASS_V2_M1_4B_TENCENT_RUNTIME_LISTING_CHECKPOINT/u,
    );
    assert.match(entrypoint, /rm -rf -- "\$\{ACTUAL_SOURCE_ROOT\}"/u);
    assert.doesNotMatch(entrypoint, /\bgit\b|\bdocker\b|\bcurl\b/u);

    const requestPath = join(root, "package-1/approval-request.json");
    const requestRaw = await readFile(requestPath);
    const envelope = dispatchEnvelope(first.request, requestRaw);
    const dispatchPath = join(root, "package-1/dispatch.json");
    await writeFile(dispatchPath, canonicalJson(envelope), { mode: 0o600 });
    const preflight = await preflightLiveRuntimeAdapterDispatch({
      bundlePath: join(root, "package-1/bundle.tar.gz"),
      dispatchPath,
      now: new Date(ISSUED_AT),
      policy: currentPolicy,
      requestPath,
    });
    assert.equal(
      preflight.status,
      "PASS_M1_4B_DISPATCH_CROSS_LAYER_PREFLIGHT",
    );

    for (const mutation of [
      { runtimeMaxSeconds: 5_400 },
      { sourceRef: "refs/heads/codex/wrong-source-ref" },
    ]) {
      await writeFile(
        dispatchPath,
        canonicalJson({ ...envelope, ...mutation }),
        { mode: 0o600 },
      );
      await assert.rejects(
        () =>
          preflightLiveRuntimeAdapterDispatch({
            bundlePath: join(root, "package-1/bundle.tar.gz"),
            dispatchPath,
            now: new Date(ISSUED_AT),
            policy: currentPolicy,
            requestPath,
          }),
        /runtime_dispatch_binding_invalid/u,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("request validation rejects route, authority, and checkpoint boundary inflation", async () => {
  const root = await mkdtemp(join(tmpdir(), "m1-runtime-request-test-"));
  try {
    const currentPolicy = policy(root);
    const built = await buildLiveRuntimeAdapterBundle({
      approval: approval(currentPolicy),
      outputDirectory: join(root, "package"),
      policy: currentPolicy,
      root: process.cwd(),
      sourceCommit: SOURCE_COMMIT,
      sourceTree: SOURCE_TREE,
      verifySourceBinding: false,
    });
    for (const mutation of [
      { expectedRouteEligibleProfileCount: 15 },
      { runtimeAuthorityAllowed: true },
      { rawMarketBodyPersistenceAllowed: true },
      {
        priorCheckpoints: {
          ...built.request.priorCheckpoints,
          BYBIT_DERIVATIVES: {
            checkpointId: "listing-history-checkpoint:BYBIT_DERIVATIVES:test",
            contentHash: `sha256:${"f".repeat(64)}`,
            path: "/tmp/escaped.checkpoint.json",
            resultPath: "/tmp/escaped.result.json",
            resultSha256: "f".repeat(64),
          },
        },
      },
    ]) {
      assert.throws(
        () =>
          validateLiveRuntimeAdapterRequest(
            { ...built.request, ...mutation },
            {
              now: new Date(ISSUED_AT),
              policy: currentPolicy,
            },
          ),
        /runtime_request_/u,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
