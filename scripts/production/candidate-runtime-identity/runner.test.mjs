import assert from "node:assert/strict";
import test from "node:test";
import {
  renderIdentityEnvironment,
  validateApprovalRequest,
  validateCredentials,
  validateDormantEvidence,
} from "./runner.mjs";

const credentials = {
  databaseHost: "postgres",
  databaseName: "market_radar",
  databasePort: 5432,
  environment: "production",
  identities: {
    consumer: { login: "market_radar_candidate_consumer", password: "B".repeat(40) },
    monitor: { login: "market_radar_candidate_monitor", password: "C".repeat(40) },
    source: { login: "market_radar_candidate_source", password: "A".repeat(40) },
  },
  schemaVersion: "candidate-runtime-identity-credentials.v1",
};

test("credentials require three unique NOINHERIT-oriented production identities", () => {
  assert.equal(validateCredentials(credentials), credentials);
  assert.throws(
    () => validateCredentials({
      ...credentials,
      identities: { ...credentials.identities, monitor: credentials.identities.source },
    }),
    /runtime_logins_not_unique/,
  );
  assert.throws(
    () => validateCredentials({
      ...credentials,
      identities: {
        ...credentials.identities,
        source: { ...credentials.identities.source, password: "weak" },
      },
    }),
    /password_invalid:source/,
  );
});

test("environment rendering changes only three candidate URL keys", () => {
  const source = [
    "CANDIDATE_SOURCE_DATABASE_URL=",
    "CANDIDATE_CONSUMER_DATABASE_URL=",
    "CANDIDATE_MONITOR_DATABASE_URL=",
    "CANDIDATE_EPISODE_SHADOW_WRITE=false",
    "CANDIDATE_RUNTIME_RELEASE_ID=disabled",
    "UNCHANGED=value",
    "",
  ].join("\n");
  const rendered = renderIdentityEnvironment(source, credentials);
  assert.match(rendered, /CANDIDATE_SOURCE_DATABASE_URL="postgresql:\/\/market_radar_candidate_source:/);
  assert.match(rendered, /CANDIDATE_CONSUMER_DATABASE_URL="postgresql:\/\/market_radar_candidate_consumer:/);
  assert.match(rendered, /CANDIDATE_MONITOR_DATABASE_URL="postgresql:\/\/market_radar_candidate_monitor:/);
  assert.match(rendered, /CANDIDATE_EPISODE_SHADOW_WRITE=false/);
  assert.match(rendered, /CANDIDATE_RUNTIME_RELEASE_ID=disabled/);
  assert.match(rendered, /UNCHANGED=value/);
  assert.equal((rendered.match(/CANDIDATE_SOURCE_DATABASE_URL=/g) ?? []).length, 1);
});

test("approval authorizes role and URL mutation but never activation or business data", () => {
  const now = new Date("2026-07-12T08:00:00.000Z");
  const request = {
    approvalExpiresAt: "2026-07-12T09:00:00.000Z",
    approvalIssuedAt: "2026-07-12T07:59:00.000Z",
    approvalRef: "runtime-identity-approval",
    approvedArtifactSha256: "c".repeat(64),
    approvedProductionCommit: "a".repeat(40),
    approvedRunnerSourceCommit: "d".repeat(40),
    approvedWebImageId: `sha256:${"7".repeat(64)}`,
    automaticDatabaseRollbackAllowed: true,
    automaticEnvironmentRollbackAllowed: true,
    automaticWebRollbackAllowed: true,
    businessDmlAllowed: false,
    candidateControlLifecycleStartAllowed: false,
    candidateDatabaseUrlConfigurationAllowed: true,
    candidateFeatureFlagEnablementAllowed: false,
    candidateWorkerStartAllowed: false,
    codeActivationAllowed: false,
    databaseRoleMutationAllowed: true,
    baseEnvSha256: "1".repeat(64),
    composeSha256: "2".repeat(64),
    dormantDeployEvidenceSha256: "3".repeat(64),
    dormantDeployStatus: "PASS_PRODUCTION_DORMANT_RUNTIME_WEB_ONLY_1800_SECOND_OBSERVATION",
    environmentMutationAllowed: true,
    execute: true,
    identityOverridePath: "/var/lib/market-radar-ops/runtime/runtime-identity.override.yml",
    identityOverrideSha256: "4".repeat(64),
    identityWrapperPath: "/var/lib/market-radar-ops/runtime/compose-identity-safe",
    identityWrapperSha256: "5".repeat(64),
    migrationAllowed: false,
    operator: "codex",
    packageId: "WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION",
    productionEnvSha256: "6".repeat(64),
    rollbackWebImageRef: `market-radar-rollback/wp-g0-2-runtime-identity:web-${"7".repeat(16)}`,
    runtimeAccessSha256: "b".repeat(64),
    schemaDdlAllowed: false,
    services: ["web"],
    webRecreateAllowed: true,
  };
  const contract = {
    artifact: { sha256: "c".repeat(64) },
    dormantEvidence: {
      finalStatus: "PASS_PRODUCTION_DORMANT_RUNTIME_WEB_ONLY_1800_SECOND_OBSERVATION",
      summarySha256: request.dormantDeployEvidenceSha256,
    },
    productionIdentity: {
      overridePath: request.identityOverridePath,
      overrideSha256: request.identityOverrideSha256,
      wrapperPath: request.identityWrapperPath,
      wrapperSha256: request.identityWrapperSha256,
    },
    productionTarget: { commit: request.approvedProductionCommit, repositoryState: "clean_detached" },
    runtimeAccess: { sqlSha256: "b".repeat(64) },
  };
  assert.equal(validateApprovalRequest(request, contract, { now }), request);
  for (const key of [
    "candidateFeatureFlagEnablementAllowed", "codeActivationAllowed", "businessDmlAllowed",
  ]) {
    assert.throws(
      () => validateApprovalRequest({ ...request, [key]: true }, contract, { now }),
      new RegExp(`${key}_must_be_false`),
    );
  }
  assert.throws(
    () => validateApprovalRequest({ ...request, approvedProductionCommit: "e".repeat(40) }, contract, { now }),
    /approved_production_commit_mismatch/,
  );
  assert.throws(
    () => validateApprovalRequest({ ...request, identityWrapperSha256: "0".repeat(64) }, contract, { now }),
    /identity_wrapper_checksum_mismatch/,
  );
  assert.throws(
    () => validateApprovalRequest({ ...request, dormantDeployStatus: "PASS_DORMANT_RUNTIME_DEPLOY" }, contract, { now }),
    /dormant_deploy_not_pass/,
  );
  assert.throws(
    () => validateApprovalRequest({ ...request, dormantDeployEvidenceSha256: "8".repeat(64) }, contract, { now }),
    /dormant_evidence_checksum_mismatch/,
  );
});

test("dormant evidence accepts the exact production summary schema and rejects weakened boundaries", () => {
  const now = new Date("2026-07-15T02:10:00.000Z");
  const request = {
    approvedProductionCommit: "cec0b6572bb09ae91ff9e013f8bb160f73c045e2",
    approvedWebImageId: "sha256:cd3652c1e72c8aabea87cee11233fb662a9209187435c14107f3da6426ba9efd",
  };
  const contract = {
    dormantEvidence: {
      baselineCommit: "70722ea71b33268b688be5d42af9908d40f49859",
      candidateRuntimeDormantRequired: true,
      candidateWorkerAbsentRequired: true,
      finalStatus: "PASS_PRODUCTION_DORMANT_RUNTIME_WEB_ONLY_1800_SECOND_OBSERVATION",
      maximumEvidenceAgeHours: 24,
      minimumObservationSeconds: 1800,
      minimumSampleCount: 57,
      packageId: "WP-G0.2-DORMANT-RUNTIME-DEPLOY-STANDING-AUTHORITY-AND-RUNNER-REFRESH",
    },
    productionTarget: { commit: request.approvedProductionCommit },
  };
  const summary = {
    status: contract.dormantEvidence.finalStatus,
    packageId: contract.dormantEvidence.packageId,
    completedAt: "2026-07-14T17:00:15Z",
    baselineCommit: contract.dormantEvidence.baselineCommit,
    targetCommit: request.approvedProductionCommit,
    detachedHead: true,
    webImageId: request.approvedWebImageId,
    rollbackImageRetained: true,
    rollbackWebImageRef: "market-radar-rollback/wp-g0-2-dormant:web-6d02c759f295e398",
    rollbackCleanupRequiresSeparateApproval: true,
    observationDurationSeconds: 1800,
    sampleCount: 57,
    continuousReadyFresh: true,
    candidateDormant: true,
    candidateWorkerAbsent: true,
    databaseMutation: false,
    redisMutation: false,
    environmentMutation: false,
    otherServiceMutation: false,
  };
  assert.equal(validateDormantEvidence(summary, request, contract, { now }), summary);
  for (const [key, value, reason] of [
    ["observationDurationSeconds", 1799, "dormant_observation_too_short"],
    ["sampleCount", 56, "dormant_sample_count_too_low"],
    ["candidateDormant", false, "dormant_runtime_boundary_mismatch"],
    ["candidateWorkerAbsent", false, "dormant_worker_boundary_mismatch"],
    ["databaseMutation", true, "dormant_databaseMutation_must_be_false"],
  ]) {
    assert.throws(
      () => validateDormantEvidence({ ...summary, [key]: value }, request, contract, { now }),
      new RegExp(reason),
    );
  }
  assert.throws(
    () => validateDormantEvidence({ ...summary, unknownField: true }, request, contract, { now }),
    /dormant_evidence_keys_mismatch/,
  );
});
