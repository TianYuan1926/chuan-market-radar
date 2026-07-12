import assert from "node:assert/strict";
import test from "node:test";
import {
  renderIdentityEnvironment,
  validateApprovalRequest,
  validateCredentials,
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
    approvedCommit: "a".repeat(40),
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
    dormantDeployStatus: "PASS_DORMANT_RUNTIME_DEPLOY",
    environmentMutationAllowed: true,
    execute: true,
    migrationAllowed: false,
    operator: "codex",
    packageId: "WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION",
    runtimeAccessSha256: "b".repeat(64),
    schemaDdlAllowed: false,
    services: ["web"],
    webRecreateAllowed: true,
  };
  const contract = {
    artifact: { sha256: "c".repeat(64) },
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
});
