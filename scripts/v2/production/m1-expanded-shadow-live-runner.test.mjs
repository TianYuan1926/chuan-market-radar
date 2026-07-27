import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  compileM1ExpandedShadowRuntime,
} from "./m1-expanded-shadow-live-bundle.mjs";
import {
  DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY,
  M1_EXPANDED_SHADOW_LIVE_ENTRYPOINT,
  M1_EXPANDED_SHADOW_LIVE_FAILURE_SCHEMA,
  M1_EXPANDED_SHADOW_LIVE_PACKAGE_ID,
  M1_EXPANDED_SHADOW_LIVE_REQUEST_SCHEMA,
  M1_EXPANDED_SHADOW_LIVE_RUNTIME_ENTRY,
  M1_EXPANDED_SHADOW_LIVE_SUCCESS_MARKER,
  M1_EXPANDED_SHADOW_POSTGRES_IMAGE,
  M1ExpandedShadowLiveError,
  buildM1ExpandedShadowFailureArtifact,
  buildM1ExpandedShadowPostgresRunArgs,
  m1ExpandedShadowTemporaryResourceNames,
  readM1ExpandedShadowStableRegularFile,
  validateM1ExpandedShadowDispatchEnvelope,
  validateM1ExpandedShadowLiveRequest,
} from "./m1-expanded-shadow-live-runner.mjs";
import {
  canonicalJson,
  sha256,
} from "./m1-source-conformance-live-runner.mjs";

const SOURCE_COMMIT = "a".repeat(40);
const DISPATCH_ID = "m1-expanded-shadow-20260727t010000z";
const ISSUED_AT = "2026-07-27T01:00:00.000Z";
const EXPIRES_AT = "2026-07-27T02:30:00.000Z";

function digest(character) {
  return `sha256:${character.repeat(64)}`;
}

function artifactReference(kind) {
  const runtime = kind === "runtime";
  return {
    artifactId: runtime
      ? "runtime-adapter-live:fixture"
      : "source-conformance:fixture",
    contentHash: digest(runtime ? "1" : "2"),
    path: runtime
      ? `${DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY.runtimeAdapterEvidenceRoot}/fixture.artifact.json`
      : `${DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY.conformanceEvidenceRoot}/fixture.artifact.json`,
    releaseId: SOURCE_COMMIT,
    sha256: (runtime ? "3" : "4").repeat(64),
  };
}

function validRequest() {
  const releaseManifest = {
    schemaVersion: "fixture-release-manifest",
    sourceCommit: SOURCE_COMMIT,
    containsSecrets: false,
  };
  return {
    applicationMutationAllowed: false,
    approvalExpiresAt: EXPIRES_AT,
    approvalIssuedAt: ISSUED_AT,
    artifactManifestSha256: sha256(canonicalJson(releaseManifest)),
    automaticRollbackRequired: true,
    automaticTradingAllowed: false,
    buildOnTargetAllowed: false,
    candidateAuthorityAllowed: false,
    conformanceArtifact: artifactReference("conformance"),
    databaseMutationAllowed: false,
    dependencyInstallAllowed: false,
    dispatchId: DISPATCH_ID,
    dispatchStateRoot:
      DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY.dispatchStateRoot,
    evidenceRoot: DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY.evidenceRoot,
    expectedContainerCount: 1,
    expectedContainerIds: ["5".repeat(64)],
    expectedHealth: {
      level: "ready",
      persistenceDatabaseStatus: "ready",
      scanFreshness: "fresh",
      scanStatus: "ready",
    },
    expectedPostgresImageId: digest("6"),
    expectedProductionHead: "b".repeat(40),
    expectedTimerUnit:
      DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY.expectedTimerUnit,
    expectedTopologyBeforeHash: digest("7"),
    factAuthorityAllowed: false,
    launchSuccessMarker: M1_EXPANDED_SHADOW_LIVE_SUCCESS_MARKER,
    maxExecutions: 1,
    networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
    packageId: M1_EXPANDED_SHADOW_LIVE_PACKAGE_ID,
    postgresImageReference: M1_EXPANDED_SHADOW_POSTGRES_IMAGE,
    productionMutationScope:
      "SANITIZED_EVIDENCE_AND_EPHEMERAL_ISOLATED_POSTGRES_ONLY",
    productionRepositoryMutationAllowed: false,
    productionServiceMutationAllowed: false,
    productionWorktree:
      DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY.productionWorktree,
    readProductionSecretsAllowed: false,
    redisMutationAllowed: false,
    releaseManifest,
    resultPath:
      `${DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY.evidenceRoot}/${DISPATCH_ID}.result.json`,
    revocationEpoch: 9,
    rotationOrdinal: 0,
    runnerUnitName: "market-radar-m1-expanded-shadow-live01",
    runtimeAdapterArtifact: artifactReference("runtime"),
    runtimeDeadlineSeconds: 5_350,
    schemaVersion: M1_EXPANDED_SHADOW_LIVE_REQUEST_SCHEMA,
    sessionIndependentExecutionRequired: true,
    sourceCommit: SOURCE_COMMIT,
    sourceRef: "refs/heads/codex/market-radar-v2-implementation",
    sourceTree: "c".repeat(40),
    stagingDirectory:
      `${DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY.stagingRoot}/${DEFAULT_M1_EXPANDED_SHADOW_LIVE_POLICY.stagingPrefix}${DISPATCH_ID}`,
    strategyAuthorityAllowed: false,
    temporaryIsolatedShadowStorageAllowed: true,
    temporaryStagingCleanupRequired: true,
    transportBundleSha256: "8".repeat(64),
    transportContainsSecrets: false,
    transportMethod: "signed_git_bundle",
    workerMutationAllowed: false,
    writeProductionEnvironmentAllowed: false,
  };
}

test("expanded-shadow approval request is exact, current and no-authority", () => {
  const request = validRequest();
  assert.equal(
    validateM1ExpandedShadowLiveRequest(request, {
      now: new Date(ISSUED_AT),
    }),
    request,
  );
});

test("expanded-shadow request rejects stale upstream and all production authority", () => {
  const stale = structuredClone(validRequest());
  stale.runtimeAdapterArtifact.releaseId = "d".repeat(40);
  assert.throws(
    () => validateM1ExpandedShadowLiveRequest(stale, {
      now: new Date(ISSUED_AT),
    }),
    /expanded_shadow_upstream_must_match_worker_source_commit/u,
  );

  for (const key of [
    "applicationMutationAllowed",
    "automaticTradingAllowed",
    "databaseMutationAllowed",
    "productionRepositoryMutationAllowed",
    "productionServiceMutationAllowed",
    "readProductionSecretsAllowed",
    "redisMutationAllowed",
    "workerMutationAllowed",
    "writeProductionEnvironmentAllowed",
  ]) {
    const mutated = structuredClone(validRequest());
    mutated[key] = true;
    assert.throws(
      () => validateM1ExpandedShadowLiveRequest(mutated, {
        now: new Date(ISSUED_AT),
      }),
      new RegExp(`expanded_shadow_forbidden_flag:${key}`, "u"),
    );
  }
});

test("expanded-shadow request rejects manifest tampering and expired approval", () => {
  const tampered = structuredClone(validRequest());
  tampered.releaseManifest.containsSecrets = true;
  assert.throws(
    () => validateM1ExpandedShadowLiveRequest(tampered, {
      now: new Date(ISSUED_AT),
    }),
    /expanded_shadow_release_manifest_hash_mismatch/u,
  );
  assert.throws(
    () => validateM1ExpandedShadowLiveRequest(validRequest(), {
      now: new Date("2026-07-27T02:30:00.001Z"),
    }),
    /expanded_shadow_approval_not_current/u,
  );
});

test("expanded-shadow dispatch envelope binds exact signed transport", () => {
  const request = validRequest();
  const requestRaw = Buffer.from(canonicalJson(request));
  const envelope = {
    approvalRequestSha256: sha256(requestRaw),
    automaticRollbackRequired: true,
    bundleSha256: request.transportBundleSha256,
    dispatchId: request.dispatchId,
    entrypointPath: M1_EXPANDED_SHADOW_LIVE_ENTRYPOINT,
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
    runtimeMaxSeconds: 5_400,
    sessionIndependentExecutionRequired: true,
    sourceRef: request.sourceRef,
    stagingDirectory: request.stagingDirectory,
    targetCommit: request.sourceCommit,
    transportContainsSecrets: false,
    transportMethod: "signed_git_bundle",
  };
  assert.equal(
    validateM1ExpandedShadowDispatchEnvelope({
      envelope,
      marker: request.transportBundleSha256,
      request,
      requestRaw,
    }),
    envelope,
  );
  const drifted = { ...envelope, runtimeMaxSeconds: 5_399 };
  assert.throws(
    () => validateM1ExpandedShadowDispatchEnvelope({
      envelope: drifted,
      marker: request.transportBundleSha256,
      request,
      requestRaw,
    }),
    /expanded_shadow_dispatch_binding_invalid/u,
  );
});

test("isolated Postgres plan is digest-pinned, loopback-only and detached", () => {
  const request = validRequest();
  const names = m1ExpandedShadowTemporaryResourceNames(request.dispatchId);
  const args = buildM1ExpandedShadowPostgresRunArgs(request, names);
  assert.equal(args.at(-1), M1_EXPANDED_SHADOW_POSTGRES_IMAGE);
  for (const required of [
    "--pull",
    "never",
    "--read-only",
    "--restart",
    "no",
    "--security-opt",
    "no-new-privileges=true",
    "--publish",
    "127.0.0.1::5432",
    "POSTGRES_DB=market_radar_m1_expanded_shadow",
    "POSTGRES_HOST_AUTH_METHOD=trust",
  ]) {
    assert.ok(args.includes(required), `missing PostgreSQL boundary: ${required}`);
  }
  const serialized = args.join(" ");
  for (const forbidden of [
    "/home/ubuntu/apps/chuan-market-radar",
    ".env.production",
    "DATABASE_URL",
    "POSTGRES_PASSWORD",
    "0.0.0.0:",
    "--privileged",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("failure artifact preserves partial evidence and only claims unchanged production after exact recovery", () => {
  const request = validRequest();
  const failure = buildM1ExpandedShadowFailureArtifact({
    error: new M1ExpandedShadowLiveError(
      "expanded_shadow_m15d_capture_blocked",
    ),
    executionContext: {
      phase: "M1_5D_CAPTURE",
      topologyBeforeHash: digest("7"),
      nonTargetServiceCountBefore: 1,
      m15cEvidenceId: "m1-multi-asset-shadow:fixture",
      m15cEvidenceHash: digest("1"),
      m15dEvidenceId: null,
      m15dEvidenceHash: null,
    },
    failedAt: "2026-07-27T01:30:00.000Z",
    recovery: {
      status: "RESTORED_EXACT",
      topologyBeforeHash: digest("7"),
      topologyAfterHash: digest("7"),
      nonTargetServiceCountBefore: 1,
      nonTargetServiceCountAfter: 1,
      temporaryContainerCountAfter: 0,
      temporaryNetworkCountAfter: 0,
      temporaryVolumeCountAfter: 0,
      stagingPathCountAfter: 0,
      productionChanged: false,
      reasonCodes: [],
    },
    request,
  });
  assert.equal(
    failure.schemaVersion,
    M1_EXPANDED_SHADOW_LIVE_FAILURE_SCHEMA,
  );
  assert.equal(failure.failurePhase, "M1_5D_CAPTURE");
  assert.equal(
    failure.m15cEvidenceId,
    "m1-multi-asset-shadow:fixture",
  );
  assert.equal(failure.m15dEvidenceId, null);
  assert.equal(failure.hostRecoveryStatus, "RESTORED_EXACT");
  assert.equal(failure.productionChanged, false);
  assert.equal(failure.acceptanceGate, "BLOCKED");
});

test("failure artifact refuses to claim unchanged production when recovery is unverified", () => {
  const failure = buildM1ExpandedShadowFailureArtifact({
    error: new Error("raw failure text must not enter evidence"),
    executionContext: {
      phase: "REQUEST_AND_TRANSPORT_VALIDATION",
      topologyBeforeHash: null,
      nonTargetServiceCountBefore: null,
      m15cEvidenceId: null,
      m15cEvidenceHash: null,
      m15dEvidenceId: null,
      m15dEvidenceHash: null,
    },
    recovery: {
      status: "NOT_VERIFIED",
      topologyBeforeHash: null,
      topologyAfterHash: null,
      nonTargetServiceCountBefore: null,
      nonTargetServiceCountAfter: null,
      temporaryContainerCountAfter: null,
      temporaryNetworkCountAfter: null,
      temporaryVolumeCountAfter: null,
      stagingPathCountAfter: null,
      productionChanged: null,
      reasonCodes: ["production_baseline_not_captured"],
    },
    request: validRequest(),
  });
  assert.equal(failure.reason, "unexpected_error");
  assert.equal(failure.hostRecoveryStatus, "NOT_VERIFIED");
  assert.equal(failure.productionChanged, null);
  assert.deepEqual(failure.reasonCodes, [
    "production_baseline_not_captured",
    "unexpected_error",
  ]);
  assert.equal(
    JSON.stringify(failure).includes("raw failure text"),
    false,
  );
});

test("compiled runtime exports both independent workers and exact verifiers", async () => {
  await mkdir(".tmp", { recursive: true });
  const temporary = await mkdtemp(
    resolve(".tmp/m1-expanded-shadow-runtime-test-"),
  );
  try {
    const outputRoot = join(temporary, "compiled");
    await compileM1ExpandedShadowRuntime(process.cwd(), outputRoot);
    const require = createRequire(import.meta.url);
    const runtime = require(resolve(
      outputRoot,
      M1_EXPANDED_SHADOW_LIVE_RUNTIME_ENTRY.replace(/^runtime\//u, ""),
    ));
    for (const name of [
      "runM1MultiAssetShadowWorker",
      "verifyM1MultiAssetShadowEvidenceStore",
      "buildM1MicrostructureForwardRuntimeSelection",
      "captureM1MicrostructureForwardWorker",
      "verifyM1MicrostructureForwardCaptureStore",
      "finalizeM1MicrostructureForwardWorker",
      "verifyM1MicrostructureForwardEvidenceStore",
      "buildM1ExpandedShadowReleaseManifest",
      "buildM1ExpandedShadowReleaseResult",
    ]) {
      assert.equal(typeof runtime[name], "function", `missing runtime: ${name}`);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("stable payload reads reject symbolic links and bind bytes to one file handle", async () => {
  const temporary = await mkdtemp(
    join(tmpdir(), "m1-expanded-shadow-stable-read-test-"),
  );
  try {
    const target = join(temporary, "target.json");
    const alias = join(temporary, "alias.json");
    const bytes = Buffer.from('{"ok":true}\n');
    await writeFile(target, bytes);
    await symlink(target, alias);
    assert.deepEqual(
      await readM1ExpandedShadowStableRegularFile(
        target,
        "stable_read_invalid",
        {
          expectedBytes: bytes.length,
          maximumBytes: bytes.length,
        },
      ),
      bytes,
    );
    await assert.rejects(
      () =>
        readM1ExpandedShadowStableRegularFile(
          alias,
          "stable_read_invalid",
        ),
      (error) =>
        error instanceof M1ExpandedShadowLiveError &&
        error.reason === "stable_read_invalid",
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("entrypoint owns exact staging cleanup and emits success only after runner", async () => {
  const entrypoint = await readFile(
    "scripts/v2/production/m1-expanded-shadow-live-entrypoint.sh",
    "utf8",
  );
  assert.ok(entrypoint.includes('STAGING_PREFIX="m1-expanded-shadow-"'));
  assert.ok(entrypoint.includes('trap cleanup_staging EXIT'));
  assert.ok(entrypoint.includes('node "${RUNNER}" run'));
  assert.ok(entrypoint.includes(M1_EXPANDED_SHADOW_LIVE_SUCCESS_MARKER));
  assert.ok(
    entrypoint.indexOf('node "${RUNNER}" run') <
      entrypoint.indexOf(M1_EXPANDED_SHADOW_LIVE_SUCCESS_MARKER),
  );
});
