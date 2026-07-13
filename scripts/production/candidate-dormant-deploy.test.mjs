import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { buildTransportBundle } from "./candidate-dormant-deploy-bundle.mjs";
import {
  AUTONOMY_ACTION_CLASS,
  AUTONOMY_BUILDER_AGENT_ID,
  AUTONOMY_GRANT_ID,
  AUTONOMY_REVOCATION_EPOCH,
  AUTONOMY_RISK_TIER,
  AUTONOMY_TRUST_ROOT,
  BASELINE_COMMIT,
  DormantDeployPolicyError,
  PACKAGE_ID,
  RELEASE_DIFF_SHA256,
  RELEASE_PATH_SET_SHA256,
  TARGET_COMMIT,
  TARGET_COMPOSE_SHA256,
  TARGET_REMOTE_BRANCH,
  TARGET_TREE,
  inspectRelease,
  loadContract,
  parseDormantEnvironment,
  productionPreflightSha256,
  rollbackEvidenceSha256,
  rollbackImageRef,
  sha256,
  validateApprovalRequest,
  validateContract,
  validateIdentityOverrideFile,
  validateLocalPreparation,
} from "./candidate-dormant-deploy.mjs";

const execFileAsync = promisify(execFile);

function throwsReason(reason, operation) {
  assert.throws(operation, (error) => error instanceof DormantDeployPolicyError && error.reason === reason);
}

function validRequest(contract) {
  const issuedAt = "2026-07-14T00:00:00.000Z";
  const expiresAt = "2026-07-14T01:30:00.000Z";
  const webImageId = `sha256:${"a".repeat(64)}`;
  const request = {
    approvalExpiresAt: expiresAt,
    approvalIssuedAt: issuedAt,
    approvalRef: "standing-dormant-web-only",
    automaticRollbackAllowed: true,
    autonomyAuthorization: null,
    autonomyTrustRoot: AUTONOMY_TRUST_ROOT,
    baseEnvSha256: "b".repeat(64),
    baselineCommit: BASELINE_COMMIT,
    baselineComposeSha256: "c".repeat(64),
    buildAllowed: true,
    candidateControlLifecycleStartAllowed: false,
    candidateDatabaseUrlConfigurationAllowed: false,
    candidateFeatureFlagEnablementAllowed: false,
    candidateRuntimeMutationAllowed: false,
    candidateWorkerStartAllowed: false,
    codeActivationAllowed: false,
    composeWrapperSha256: "d".repeat(64),
    contractSha256: "e".repeat(64),
    databaseMutationAllowed: false,
    detachedHeadAfterSuccess: true,
    environmentMutationAllowed: false,
    evidenceDirectory: "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-dormant-runtime-deploy-test-0001",
    execute: true,
    gateEvidenceSha256: "f".repeat(64),
    identityOverrideSha256: "1".repeat(64),
    migrationAllowed: false,
    observationDurationSeconds: 1800,
    observationPollSeconds: 30,
    operator: "codex-primary",
    otherServiceRestartAllowed: false,
    packageId: PACKAGE_ID,
    policySha256: "2".repeat(64),
    productionEnvSha256: "3".repeat(64),
    productionRepositoryMutationAllowed: true,
    redisMutationAllowed: false,
    releaseArtifactSha256: contract.artifact.sha256,
    releaseDiffSha256: RELEASE_DIFF_SHA256,
    releasePathSetSha256: RELEASE_PATH_SET_SHA256,
    rollbackImageRetentionRequired: true,
    rollbackWebImageRef: rollbackImageRef(webImageId),
    runnerSha256: "4".repeat(64),
    runnerSourceCommit: "5".repeat(40),
    runnerSourceDiffSha256: "6".repeat(64),
    runnerSourceParentCommit: "7".repeat(40),
    runnerSourcePathSetSha256: "8".repeat(64),
    runnerSourceTree: "9".repeat(40),
    runnerUnitName: "market-radar-dormant-test-0001",
    services: ["web"],
    sessionIndependentExecutionRequired: true,
    sourceFetchAllowed: true,
    stagingDirectory: "/home/ubuntu/.cache/market-radar-ops/wp-g0-2-dormant-runtime-deploy-test-0001",
    targetCommit: TARGET_COMMIT,
    targetComposeSha256: TARGET_COMPOSE_SHA256,
    targetRemoteBranch: TARGET_REMOTE_BRANCH,
    targetTree: TARGET_TREE,
    temporaryArtifactCleanupRequired: true,
    transportBundleSha256: "0".repeat(64),
    transportMethod: "approved_orcaterm_bundle_upload",
    webImageId,
  };
  request.autonomyAuthorization = {
    schemaVersion: "market-radar-package-authorization.v1",
    mode: "g0_g8_standing_user_grant",
    approvedBy: "user_standing_grant",
    grantId: AUTONOMY_GRANT_ID,
    approvalId: "dormant-test-approval-0001",
    nonce: "dormant-test-nonce-0001",
    gate: "G0",
    packageId: PACKAGE_ID,
    scope: PACKAGE_ID,
    actionClass: AUTONOMY_ACTION_CLASS,
    riskTier: AUTONOMY_RISK_TIER,
    builderAgentId: AUTONOMY_BUILDER_AGENT_ID,
    baseCommit: request.runnerSourceParentCommit,
    targetCommit: request.runnerSourceCommit,
    targetTree: request.runnerSourceTree,
    diffSha256: request.runnerSourceDiffSha256,
    pathSetSha256: request.runnerSourcePathSetSha256,
    contractSha256: request.contractSha256,
    runnerSha256: request.runnerSha256,
    artifactSha256: contract.artifact.sha256,
    imageOrMigrationSha256: sha256(`${request.webImageId}\n`),
    composeSha256: request.targetComposeSha256,
    environmentFingerprintSha256: sha256(`${request.baseEnvSha256}\n${request.productionEnvSha256}\n`),
    productionIdentitySha256: sha256(`${request.identityOverrideSha256}\n${request.composeWrapperSha256}\n`),
    gateEvidenceSha256: request.gateEvidenceSha256,
    preflightSha256: productionPreflightSha256(request),
    backupRestoreEvidenceSha256: rollbackEvidenceSha256(request),
    rollbackTarget: `${BASELINE_COMMIT}:web`,
    observationContractSha256: sha256(JSON.stringify({
      durationSeconds: contract.deployment.observationDurationSeconds,
      pollSeconds: contract.deployment.observationPollSeconds,
      continuousReadyFresh: true,
      candidateDormant: true,
    })),
    policySha256: request.policySha256,
    revocationEpoch: AUTONOMY_REVOCATION_EPOCH,
    issuedAt,
    expiresAt,
    maxExecutions: 1,
    packageAssertions: {
      qualityThresholdChanged: false,
      scopeMatchesBlueprint: true,
      dynamicPreflightCurrent: true,
      requiredGatesPassed: true,
      rollbackVerified: true,
      productionWipAvailable: true,
      secretsPresentInEvidence: false,
      knownP0Open: false,
      pollutionCleanupManifestExact: true,
    },
  };
  return request;
}

test("current repository passes the refreshed local dormant deployment contract", async () => {
  const result = await validateLocalPreparation();
  assert.equal(result.status, "PASS_LOCAL_DORMANT_DEPLOY_STANDING_AUTHORITY_RUNNER_REFRESH");
  assert.equal(result.productionDecision,
    "BLOCKED_UNTIL_CURRENT_DYNAMIC_PREFLIGHT_AND_EXTERNAL_SINGLE_USE_APPROVAL");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.artifact.fileCount, 18);
  assert.equal(result.release.fileCount, 18);
  assert.equal(result.release.baselineCommit, BASELINE_COMMIT);
  assert.equal(result.release.targetCommit, TARGET_COMMIT);
  assert.equal(result.release.targetTree, TARGET_TREE);
  assert.equal(result.runner.leaseFenced, true);
  assert.equal(result.runner.transientSystemdUnit, true);
});

test("release object is one exact child of the current production target", async () => {
  const contract = await loadContract();
  const release = await inspectRelease(process.cwd(), contract);
  assert.equal(release.checksum, RELEASE_DIFF_SHA256);
  assert.equal(release.pathSetSha256, RELEASE_PATH_SET_SHA256);
  const { stdout } = await execFileAsync("git", ["rev-list", "--parents", "-n", "1", TARGET_COMMIT]);
  assert.equal(stdout.trim(), `${TARGET_COMMIT} ${BASELINE_COMMIT}`);
});

test("contract rejects dormant, standing authority, observation and rollback weakening", async () => {
  const contract = await loadContract();
  const cases = [
    [{ productionAuthorization: true }, "production_authorization_must_be_false"],
    [{ deployment: { ...contract.deployment, serviceAllowlist: ["web", "candidate-shadow-worker"] } },
      "service_allowlist_mismatch"],
    [{ deployment: { ...contract.deployment, sessionIndependentExecutionRequired: false } },
      "session_independent_execution_required"],
    [{ deployment: { ...contract.deployment, observationDurationSeconds: 1 } },
      "observation_duration_not_locked"],
    [{ dormantBoundary: { ...contract.dormantBoundary, candidateFeatureFlagsEnabled: 1 } },
      "feature_flags_must_be_zero"],
    [{ autonomy: { ...contract.autonomy, externalProductionLeaseRequired: false } },
      "autonomy_external_lease_required"],
    [{ rollback: { ...contract.rollback, retainAfterSuccess: false } },
      "rollback_image_success_retention_required"],
    [{ releaseBoundary: { ...contract.releaseBoundary, baselineCommit: "0".repeat(40) } },
      "baseline_commit_not_locked"],
  ];
  for (const [patch, reason] of cases) {
    throwsReason(reason, () => validateContract({ ...contract, ...patch }));
  }
});

test("approval is exact, time bounded, single use and cannot authorize activation", async () => {
  const contract = await loadContract();
  const request = validRequest(contract);
  const now = new Date("2026-07-14T00:30:00.000Z");
  assert.equal(validateApprovalRequest(request, contract, { now }), request);
  throwsReason("approval_window_not_active", () => validateApprovalRequest(request, contract, {
    now: new Date("2026-07-14T01:30:01.000Z"),
  }));
  throwsReason("candidateWorkerStartAllowed_must_be_false", () => validateApprovalRequest({
    ...request,
    candidateWorkerStartAllowed: true,
  }, contract, { now }));
  throwsReason("request_services_mismatch", () => validateApprovalRequest({
    ...request,
    services: ["web", "candidate-shadow-worker"],
  }, contract, { now }));
  throwsReason("request_target_commit_mismatch", () => validateApprovalRequest({
    ...request,
    targetCommit: "0".repeat(40),
  }, contract, { now }));
});

test("approval rejects standing authorization binding drift and embedded lease identity", async () => {
  const contract = await loadContract();
  const request = validRequest(contract);
  const now = new Date("2026-07-14T00:30:00.000Z");
  throwsReason("autonomy_runner_checksum_mismatch", () => validateApprovalRequest({
    ...request,
    autonomyAuthorization: { ...request.autonomyAuthorization, runnerSha256: "f".repeat(64) },
  }, contract, { now }));
  throwsReason("autonomy_assertion_failed:requiredGatesPassed", () => validateApprovalRequest({
    ...request,
    autonomyAuthorization: {
      ...request.autonomyAuthorization,
      packageAssertions: { ...request.autonomyAuthorization.packageAssertions, requiredGatesPassed: false },
    },
  }, contract, { now }));
  throwsReason("autonomy_authorization_keys_mismatch", () => validateApprovalRequest({
    ...request,
    autonomyAuthorization: { ...request.autonomyAuthorization, fencingToken: 1 },
  }, contract, { now }));
});

test("environment validator accepts only a fully dormant Candidate environment", () => {
  assert.deepEqual(parseDormantEnvironment(""), {
    candidateDatabaseUrlsConfigured: 0,
    candidateFeatureFlagsEnabled: 0,
    candidateRuntimeReleaseDisabled: true,
    candidateWorkerExpected: false,
  });
  assert.equal(parseDormantEnvironment([
    "CANDIDATE_EPISODE_SHADOW_WRITE=false",
    "CANDIDATE_SOURCE_DATABASE_URL=",
    "CANDIDATE_RUNTIME_RELEASE_ID=disabled",
    "CANDIDATE_SHADOW_WORKER_EXPECTED=false",
  ].join("\n")).candidateFeatureFlagsEnabled, 0);
  throwsReason("candidate_feature_flag_not_false:CANDIDATE_EPISODE_SHADOW_WRITE", () =>
    parseDormantEnvironment("CANDIDATE_EPISODE_SHADOW_WRITE=true"));
  throwsReason("candidate_database_url_configured:CANDIDATE_SOURCE_DATABASE_URL", () =>
    parseDormantEnvironment("CANDIDATE_SOURCE_DATABASE_URL=configured-value"));
});

test("identity override requires an absolute regular 0600 checksum-bound file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "candidate-identity-override-"));
  try {
    const file = join(directory, "identity.override.yml");
    const source = "services:\n  web:\n    environment:\n      DATABASE_URL: approved-test-value\n";
    await writeFile(file, source, { mode: 0o600 });
    assert.equal((await validateIdentityOverrideFile(file, sha256(source))).permissions, "0600");
    await assert.rejects(validateIdentityOverrideFile(file, "0".repeat(64)), (error) =>
      error instanceof DormantDeployPolicyError && error.reason === "identity_override_checksum_mismatch");
    await chmod(file, 0o644);
    await assert.rejects(validateIdentityOverrideFile(file, sha256(source)), (error) =>
      error instanceof DormantDeployPolicyError && error.reason === "identity_override_permissions_not_0600");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("runner is Web-only, lease fenced, detached-target and rollback retaining", async () => {
  const source = await readFile("scripts/production/candidate-dormant-deploy.sh", "utf8");
  assert.match(source, /\$\{IDENTITY_COMPOSE\[@\]\} build web/);
  assert.match(source, /\$\{IDENTITY_COMPOSE\[@\]\} up -d --no-deps --force-recreate web/);
  for (const name of ["lease_acquire", "lease_consume", "lease_checkpoint", "lease_release"]) {
    assert.match(source, new RegExp(name));
  }
  assert.match(source, /lease_safety_checkpoint rollback/);
  assert.match(source, /checkout --detach/);
  assert.match(source, /rollback-image-retention/);
  assert.doesNotMatch(source, /git merge --ff-only|--profile|--remove-orphans/);
});

test("entrypoint requires transient systemd execution and has no foreground fallback", async () => {
  const source = await readFile("scripts/production/candidate-dormant-deploy-entrypoint.sh", "utf8");
  assert.match(source, /systemd-run/);
  assert.match(source, /Restart=no/);
  assert.match(source, /RuntimeMaxSec=5400/);
  assert.match(source, /unsupported dormant deploy entrypoint mode/);
  assert.doesNotMatch(source, /nohup/);
});

test("transport template is reproducible, source-bound and secret-file free", async () => {
  const directory = await mkdtemp(join(tmpdir(), "candidate-dormant-bundle-"));
  try {
    const first = join(directory, "first.tar.gz");
    const second = join(directory, "second.tar.gz");
    const a = await buildTransportBundle({ output: first, sourceCommit: null, approvalEligible: false });
    const b = await buildTransportBundle({ output: second, sourceCommit: null, approvalEligible: false });
    assert.equal(a.sha256, b.sha256);
    assert.equal(a.manifest.sourceCommit, null);
    assert.equal(a.manifest.approvalEligible, false);
    assert.equal(a.manifest.containsSecrets, false);
    const { stdout } = await execFileAsync("tar", ["-tzf", first]);
    assert.match(stdout, /candidate-dormant-deploy-entrypoint\.sh/);
    assert.match(stdout, /transport-manifest\.json/);
    assert.doesNotMatch(stdout, /(^|\/)\.env(?:\.|$)|approval-request\.json/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("shell sources are syntactically valid and the bundle builder carries no secret values", async () => {
  await execFileAsync("bash", ["-n",
    "scripts/production/candidate-dormant-deploy.sh",
    "scripts/production/candidate-dormant-deploy-entrypoint.sh",
  ]);
  const source = await readFile("scripts/production/candidate-dormant-deploy-bundle.mjs", "utf8");
  assert.match(source, /sourceCommit/);
  assert.match(source, /sourceTree/);
  assert.match(source, /transportBundleSha256/);
  assert.match(source, /\.transport-bundle\.sha256/);
  assert.doesNotMatch(source, /BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|approved-test-value/);
});
