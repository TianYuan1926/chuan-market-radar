import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  buildTransportBundle,
  validateProductionExecutionContract,
  validateProductionExecutionRequest,
  verifyStagedTransport,
} from "./bundle.mjs";

const execFileAsync = promisify(execFile);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

test("current repository satisfies the production packet contract without claiming production", async () => {
  const result = await validateProductionExecutionContract();
  assert.equal(result.status, "PASS_LOCAL_RUNTIME_IDENTITY_PRODUCTION_PACKET");
  assert.equal(result.productionMutationAllowed, false);
  assert.deepEqual(result.violations, []);
});

function requestFixture() {
  const now = Date.now();
  const request = {
    approvalExpiresAt: new Date(now + 89 * 60_000).toISOString(),
    approvalIssuedAt: new Date(now - 30_000).toISOString(),
    approvalRef: "runtime-identity-production-packet",
    autonomyAuthorization: {
      schemaVersion: "market-radar-package-authorization.v1",
      mode: "g0_g8_standing_user_grant",
      approvedBy: "user_standing_grant",
      grantId: "MR-G0-G8-USER-STANDING-GRANT-20260714-034826",
      approvalId: "runtime-identity-approval-0001",
      nonce: "runtime-identity-nonce-0001",
      gate: "G0",
      packageId: "WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION",
      scope: "WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION",
      actionClass: "runtime_identity_provision",
      riskTier: "R2_PRIVILEGED_IDENTITY",
      builderAgentId: "codex-primary",
      baseCommit: "1".repeat(40),
      targetCommit: "2".repeat(40),
      targetTree: "3".repeat(40),
      diffSha256: "4".repeat(64),
      pathSetSha256: "5".repeat(64),
      contractSha256: "6".repeat(64),
      runnerSha256: "7".repeat(64),
      artifactSha256: "8".repeat(64),
      imageOrMigrationSha256: "9".repeat(64),
      composeSha256: "a".repeat(64),
      environmentFingerprintSha256: "b".repeat(64),
      productionIdentitySha256: "c".repeat(64),
      gateEvidenceSha256: "d".repeat(64),
      preflightSha256: "e".repeat(64),
      backupRestoreEvidenceSha256: "f".repeat(64),
      rollbackTarget: "cec0b6572bb09ae91ff9e013f8bb160f73c045e2:web",
      observationContractSha256: "0".repeat(64),
      policySha256: "1".repeat(64),
      revocationEpoch: 2,
      issuedAt: new Date(now - 30_000).toISOString(),
      expiresAt: new Date(now + 89 * 60_000).toISOString(),
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
    },
    autonomyTrustRoot: "/home/ubuntu/.local/state/market-radar-autonomy",
    dormantEvidencePath: "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-dormant-runtime-deploy-8c81598-mrmrkuexyz/summary.json",
    evidenceDirectory: "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-runtime-identity-packet-0001",
    execute: true,
    operator: "codex-primary",
    opsRoot: "/home/ubuntu/.cache/market-radar-ops/runtime-identity-ops/wp-g0-2-runtime-identity-packet-0001",
    packageId: "WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION",
    runnerUnitName: "market-radar-runtime-identity-packet-0001",
    secureRoot: "/home/ubuntu/.local/state/market-radar-runtime-identity/packet-0001",
    services: ["web"],
    sessionIndependentExecutionRequired: true,
    stagingDirectory: "/home/ubuntu/.cache/market-radar-ops/wp-g0-2-runtime-identity-packet-0001",
    temporaryArtifactCleanupRequired: true,
    transportBundleSha256: "2".repeat(64),
    transportMethod: "approved_orcaterm_bundle_upload",
    runtimeIdentityApproval: {
      approvedWebImageId: `sha256:${"a".repeat(64)}`,
      approvedProductionCommit: "cec0b6572bb09ae91ff9e013f8bb160f73c045e2",
      approvedRunnerSourceCommit: "2".repeat(40),
      automaticDatabaseRollbackAllowed: true,
      automaticEnvironmentRollbackAllowed: true,
      automaticWebRollbackAllowed: true,
      baseEnvSha256: "b".repeat(64),
      composeSha256: "c".repeat(64),
      dormantDeployEvidenceSha256: "d".repeat(64),
      identityOverrideSha256: "e".repeat(64),
      identityWrapperSha256: "f".repeat(64),
      productionEnvSha256: "0".repeat(64),
      rollbackWebImageRef: `market-radar-rollback/wp-g0-2-runtime-identity:web-${"a".repeat(16)}`,
    },
  };
  request.runtimeIdentityApprovalSha256 = sha256(`${canonicalJson(request.runtimeIdentityApproval)}\n`);
  const authorization = request.autonomyAuthorization;
  authorization.imageOrMigrationSha256 = sha256(`${request.runtimeIdentityApproval.approvedWebImageId}\n`);
  authorization.composeSha256 = request.runtimeIdentityApproval.composeSha256;
  authorization.environmentFingerprintSha256 = sha256(
    `${request.runtimeIdentityApproval.baseEnvSha256}\n${request.runtimeIdentityApproval.productionEnvSha256}\n`,
  );
  authorization.productionIdentitySha256 = sha256(
    `${request.runtimeIdentityApproval.identityOverrideSha256}\n${request.runtimeIdentityApproval.identityWrapperSha256}\n`,
  );
  authorization.preflightSha256 = sha256(canonicalJson({
    productionCommit: request.runtimeIdentityApproval.approvedProductionCommit,
    runtimeIdentityApprovalSha256: request.runtimeIdentityApprovalSha256,
    transportBundleSha256: request.transportBundleSha256,
    stagingDirectory: request.stagingDirectory,
    dormantDeployEvidenceSha256: request.runtimeIdentityApproval.dormantDeployEvidenceSha256,
  }));
  authorization.backupRestoreEvidenceSha256 = sha256(canonicalJson({
    automaticDatabaseRollbackAllowed: true,
    automaticEnvironmentRollbackAllowed: true,
    automaticWebRollbackAllowed: true,
    rollbackWebImageRef: request.runtimeIdentityApproval.rollbackWebImageRef,
  }));
  authorization.rollbackTarget = `cec0b6572bb09ae91ff9e013f8bb160f73c045e2:web:${request.runtimeIdentityApproval.rollbackWebImageRef}`;
  authorization.observationContractSha256 = sha256(canonicalJson({
    candidateDormant: true,
    candidateWorkerAbsent: true,
    finalStatus: "PASS_IMMEDIATE_RUNTIME_IDENTITY_AWAITING_OBSERVATION",
  }));
  return request;
}

test("transport template is byte reproducible and excludes credentials and environment files", async () => {
  const directory = await mkdtemp("/tmp/runtime-identity-bundle-");
  try {
    const first = join(directory, "first.tar.gz");
    const second = join(directory, "second.tar.gz");
    const a = await buildTransportBundle({ output: first, sourceCommit: null, approvalEligible: false });
    const b = await buildTransportBundle({ output: second, sourceCommit: null, approvalEligible: false });
    assert.equal(a.sha256, b.sha256);
    assert.deepEqual(await readFile(first), await readFile(second));
    const { stdout } = await execFileAsync("tar", ["-tzf", first]);
    assert.doesNotMatch(stdout, /(?:^|\/)(?:\.env(?:\.|$)|credentials\.json|role-admin\.url|approval-request\.json)/);
    assert.equal(a.manifest.containsSecrets, false);
    assert.equal(a.manifest.approvalEligible, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("production execution request is exact, external, single-use and time bounded", async () => {
  const request = requestFixture();
  const bindings = {
    artifactSha256: "8".repeat(64),
    contractSha256: "6".repeat(64),
    gateEvidenceSha256: "d".repeat(64),
    policySha256: "1".repeat(64),
    runnerSha256: "7".repeat(64),
    sourceCommit: "2".repeat(40),
    sourceDiffSha256: "4".repeat(64),
    sourceParentCommit: "1".repeat(40),
    sourcePathSetSha256: "5".repeat(64),
    sourceTree: "3".repeat(40),
    transportBundleSha256: "2".repeat(64),
  };
  assert.equal(validateProductionExecutionRequest(request, bindings).execute, true);
  assert.throws(() => validateProductionExecutionRequest({ ...request, execute: false }, bindings), /execute/);
  assert.throws(() => validateProductionExecutionRequest({
    ...request,
    approvalExpiresAt: new Date(Date.now() + 91 * 60_000).toISOString(),
  }, bindings), /approval/);
  assert.throws(() => validateProductionExecutionRequest({
    ...request,
    autonomyAuthorization: { ...request.autonomyAuthorization, maxExecutions: 2 },
  }, bindings), /execution/);
  assert.throws(() => validateProductionExecutionRequest({
    ...request,
    autonomyAuthorization: { ...request.autonomyAuthorization, approvedBy: "codex-primary" },
  }, bindings), /issuer/);
  assert.throws(() => validateProductionExecutionRequest({
    ...request,
    opsRoot: "/var/lib/market-radar-ops/wp-g0-2-runtime-identity-packet-0001",
  }, bindings), /ops_root/);
});

test("staged transport fails closed on byte drift and symlink substitution", async () => {
  const directory = await mkdtemp("/tmp/runtime-identity-stage-");
  try {
    const archive = join(directory, "packet.tar.gz");
    const stage = join(directory, "stage");
    const built = await buildTransportBundle({ output: archive, sourceCommit: null, approvalEligible: false });
    await execFileAsync("mkdir", ["-p", stage]);
    await execFileAsync("tar", ["-xzf", archive, "-C", stage]);
    const manifest = JSON.parse(await readFile(join(stage, "transport-manifest.json"), "utf8"));
    Object.assign(manifest, {
      approvalEligible: true,
      sourceCommit: "2".repeat(40),
      sourceTree: "3".repeat(40),
      sourceParentCommit: "1".repeat(40),
      sourceDiffSha256: "4".repeat(64),
      sourcePathSetSha256: "5".repeat(64),
      gateEvidenceSha256: "6".repeat(64),
      policySha256: "7".repeat(64),
    });
    assert.equal((await verifyStagedTransport(stage, manifest)).fileCount, built.manifest.files.length);
    const target = join(stage, "scripts/governance/autonomy-policy.mjs");
    const original = await readFile(target);
    await writeFile(target, `${original}\n// drift\n`);
    await assert.rejects(() => verifyStagedTransport(stage, manifest), /checksum_mismatch/);
    await writeFile(target, original);
    await rm(target);
    await execFileAsync("ln", ["-s", "/dev/null", target]);
    await assert.rejects(() => verifyStagedTransport(stage, manifest), /not_regular/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
