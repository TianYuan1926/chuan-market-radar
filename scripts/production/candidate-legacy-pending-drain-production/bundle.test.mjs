import assert from "node:assert/strict";
import test from "node:test";

import {
  BASELINE_COMMIT,
  BASELINE_TREE,
  createProductionExecutionRequest,
  prepareAdminUrl,
  renderDrainOnlyEnvironment,
  validateApprovalRequest,
} from "./bundle.mjs";

const hash = "a".repeat(64);
const image = `sha256:${"b".repeat(64)}`;
const manifest = {
  baselineCommit: BASELINE_COMMIT,
  baselineTree: BASELINE_TREE,
  contractSha256: "c".repeat(64),
  policySha256: "d".repeat(64),
  runnerArtifactSha256: "e".repeat(64),
  sourceCommit: "1".repeat(40),
  sourceDiffSha256: "f".repeat(64),
  sourcePathSetSha256: "2".repeat(64),
  sourceTree: "3".repeat(40),
  targetComposeSha256: "4".repeat(64),
  transportArtifactSha256: "5".repeat(64),
};

function runtime() {
  const identityRoot =
    "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z";
  return {
    baseEnvSha256: hash,
    baselineComposeSha256: "6".repeat(64),
    baselineScannerContainerId: "7".repeat(12),
    baselineScannerImageId: image,
    baselineWebContainerId: "8".repeat(12),
    baselineWebImageId: `sha256:${"c".repeat(64)}`,
    controlApprovalDigest: `sha256:${"9".repeat(64)}`,
    deadlineAt: "2099-07-19T01:38:00.099Z",
    identityOverridePath: `${identityRoot}/runtime/runtime-identity.override.yml`,
    identityOverrideSha256: "a".repeat(64),
    identityWrapperPath: `${identityRoot}/runtime/compose-identity-safe`,
    identityWrapperSha256: "b".repeat(64),
    postgresAdminEnvPath: `${identityRoot}/secrets/postgres-admin.env`,
    postgresAdminEnvSha256: "c".repeat(64),
    productionEnvSha256: "d".repeat(64),
    startedAt: "2026-07-16T01:38:00.099Z",
  };
}

test("renders only the bounded drain flags and preserves opaque secrets", () => {
  const source = "OPAQUE_SETTING=opaque-value\nCANDIDATE_EPISODE_SHADOW_WRITE=false\n";
  const rendered = renderDrainOnlyEnvironment(source);
  assert.match(rendered, /^OPAQUE_SETTING=opaque-value$/mu);
  assert.match(rendered, /^CANDIDATE_EPISODE_SHADOW_WRITE=true$/mu);
  assert.match(rendered, /^CANDIDATE_EPISODE_DRAIN_ONLY=true$/mu);
  assert.match(rendered, /^CANDIDATE_RUNTIME_MIGRATION_ID=candidate-episode-v1-cycle-6$/mu);
  assert.match(rendered, /^CANDIDATE_RUNTIME_RELEASE_ID=candidate-shadow-cycle-6-72ee2893$/mu);
  assert.match(rendered, /^CANDIDATE_SHADOW_BATCH_LIMIT=100$/mu);
  assert.match(rendered, /^CANDIDATE_SHADOW_INTERVAL_SECONDS=1$/mu);
  assert.doesNotMatch(rendered, /^CANDIDATE_EPISODE_CANONICAL_READ=true$/mu);
});

test("rejects duplicate protected environment keys", () => {
  assert.throws(() => renderDrainOnlyEnvironment(
    "CANDIDATE_EPISODE_DRAIN_ONLY=false\nCANDIDATE_EPISODE_DRAIN_ONLY=false\n",
  ), /environment_duplicate_key/);
});

test("prepares a URL only from the exact admin credential and container identity tuple", () => {
  const passwordKey = ["POSTGRES", "PASSWORD"].join("_");
  const passwordValue = ["test", "only", "credential", "value"].join("-");
  const input = Buffer.from(
    `POSTGRES_USER=market_admin\n${passwordKey}=${passwordValue}\0market_admin\0radar`,
  );
  assert.equal(prepareAdminUrl(input),
    `postgresql://market_admin:${passwordValue}@postgres:5432/radar`);
  assert.throws(() => prepareAdminUrl(Buffer.from([
    "POSTGRES_USER=wrong",
    `${passwordKey}=${passwordValue}\0market_admin\0radar`,
  ].join("\n"))), /admin_user_mismatch/);
});

test("creates one 89 minute request bound to the exact production snapshot", () => {
  const now = new Date("2026-07-17T04:00:00.000Z");
  const request = createProductionExecutionRequest({
    bundleSha256: "6".repeat(64),
    gateEvidenceSha256: "7".repeat(64),
    manifest,
    nonce: "12345678-1234-4234-8234-123456789abc",
    now,
    runtime: runtime(),
  });
  assert.equal(request.expectedCounts.legacyPending, 48);
  assert.equal(request.expectedCounts.candidateEventPending, 5_218);
  assert.equal(request.expectedCounts.outbox, 10_484);
  assert.equal(request.sourceEpoch, 2);
  assert.equal(request.drainEpoch, 3);
  assert.equal(request.finalEpoch, 4);
  assert.equal(request.services.join(","), "web,scanner-worker,candidate-shadow-worker");
  assert.equal(request.autonomyAuthorization.actionClass, "feature_phase_activation");
  assert.equal(request.autonomyAuthorization.riskTier, "R2_AUTHORITY_TRANSITION");
  assert.equal(
    Date.parse(request.approvalExpiresAt) - Date.parse(request.approvalIssuedAt),
    89 * 60_000,
  );
  assert.equal(validateApprovalRequest({ manifest, now, request }).status,
    "PASS_PENDING_DRAIN_PRODUCTION_REQUEST");

  const drifted = structuredClone(request);
  drifted.expectedCounts.legacyPending = 47;
  assert.throws(() => validateApprovalRequest({ manifest, now, request: drifted }),
    /request_database_boundary_invalid/);

  const authorizationDrifted = structuredClone(request);
  authorizationDrifted.autonomyAuthorization.preflightSha256 = "0".repeat(64);
  assert.throws(() => validateApprovalRequest({
    manifest,
    now,
    request: authorizationDrifted,
  }), /authorization_binding_invalid/);
});

test("requires all privileged runtime files to share one exact identity-runner root", () => {
  const now = new Date("2026-07-17T04:00:00.000Z");
  const base = {
    bundleSha256: "6".repeat(64),
    gateEvidenceSha256: "7".repeat(64),
    manifest,
    now,
  };
  const crossRoot = runtime();
  crossRoot.postgresAdminEnvPath = crossRoot.postgresAdminEnvPath.replace(
    "20260711T034847Z",
    "20260712T034847Z",
  );
  assert.throws(
    () => createProductionExecutionRequest({ ...base, runtime: crossRoot }),
    /runtime_secure_path_invalid/,
  );

  const wrongWrapper = runtime();
  wrongWrapper.identityWrapperPath = wrongWrapper.identityWrapperPath.replace(
    "compose-identity-safe",
    "unapproved-wrapper",
  );
  assert.throws(
    () => createProductionExecutionRequest({ ...base, runtime: wrongWrapper }),
    /runtime_secure_path_invalid/,
  );

  const unstableAlias = runtime();
  unstableAlias.identityOverridePath =
    "/var/lib/market-radar-ops/identity/runtime-identity.override.yml";
  assert.throws(
    () => createProductionExecutionRequest({ ...base, runtime: unstableAlias }),
    /runtime_secure_path_invalid/,
  );
});
