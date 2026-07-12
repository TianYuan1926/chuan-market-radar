import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  DormantDeployPolicyError,
  loadContract,
  parseDormantEnvironment,
  validateApprovalRequest,
  validateContract,
  validateLocalPreparation,
} from "./candidate-dormant-deploy.mjs";

function throwsReason(reason, operation) {
  assert.throws(operation, (error) => error instanceof DormantDeployPolicyError && error.reason === reason);
}

test("current repository passes local dormant deploy preparation without authorizing production", async () => {
  const contract = await loadContract();
  const result = await validateLocalPreparation();
  assert.equal(result.status, "PASS_LOCAL_DORMANT_DEPLOY_PREPARATION");
  assert.equal(result.productionDecision, "BLOCKED_AWAITING_EXPLICIT_PRODUCTION_APPROVAL");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.artifact.fileCount, 14);
  assert.equal(
    contract.artifact.files.includes("src/lib/candidate-episode/transaction-adapter.ts"),
    true,
  );
  assert.equal(result.repository.exactWebBuild, true);
  assert.equal(result.repository.exactWebRecreate, true);
  assert.equal(result.repository.composeEnvFilesOrdered, true);
  assert.equal(result.repository.bothEnvFilesValidatedDormant, true);
  assert.equal(result.repository.noRemoveOrphans, true);
  assert.equal(result.repository.noMigrationCommand, true);
});

test("contract rejects scope expansion or dormant boundary weakening", async () => {
  const contract = await loadContract();
  const cases = [
    [{ productionAuthorization: true }, "production_authorization_must_be_false"],
    [{ deployment: { ...contract.deployment, serviceAllowlist: ["web", "candidate-shadow-worker"] } }, "service_allowlist_mismatch"],
    [{ deployment: { ...contract.deployment, composeEnvFileOrder: [".env.production"] } }, "compose_env_file_order_mismatch"],
    [{ deployment: { ...contract.deployment, removeOrphansAllowed: true } }, "remove_orphans_must_be_false"],
    [{ dormantBoundary: { ...contract.dormantBoundary, candidateDatabaseUrlsConfigured: 1 } }, "candidate_database_urls_must_be_zero"],
    [{ dormantBoundary: { ...contract.dormantBoundary, candidateFeatureFlagsEnabled: 1 } }, "feature_flags_must_be_zero"],
    [{ dormantBoundary: { ...contract.dormantBoundary, migrationAllowed: true } }, "migration_must_be_false"],
  ];
  for (const [patch, reason] of cases) {
    throwsReason(reason, () => validateContract({ ...contract, ...patch }));
  }
});

test("environment validator accepts absent or explicit false switches and blank candidate URLs", () => {
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
});

test("environment validator rejects a flag, candidate identity URL, release or worker expectation", () => {
  throwsReason("candidate_feature_flag_not_false:CANDIDATE_EPISODE_SHADOW_WRITE", () =>
    parseDormantEnvironment("CANDIDATE_EPISODE_SHADOW_WRITE=true"));
  throwsReason("candidate_database_url_configured:CANDIDATE_SOURCE_DATABASE_URL", () =>
    parseDormantEnvironment("CANDIDATE_SOURCE_DATABASE_URL=configured-value"));
  throwsReason("candidate_runtime_release_not_disabled", () =>
    parseDormantEnvironment("CANDIDATE_RUNTIME_RELEASE_ID=release-1"));
  throwsReason("candidate_shadow_worker_expected_not_false", () =>
    parseDormantEnvironment("CANDIDATE_SHADOW_WORKER_EXPECTED=true"));
});

test("approval request is exact, time bounded and cannot authorize activation", async () => {
  const contract = await loadContract();
  const request = {
    approvalExpiresAt: "2026-07-12T05:00:00.000Z",
    approvalIssuedAt: "2026-07-12T04:00:00.000Z",
    approvalRef: "user-approved-dormant-web-only",
    approvedArtifactSha256: contract.artifact.sha256,
    approvedCommit: "a".repeat(40),
    automaticWebRollbackAllowed: true,
    candidateControlLifecycleStartAllowed: false,
    candidateDatabaseUrlConfigurationAllowed: false,
    candidateFeatureFlagEnablementAllowed: false,
    candidateWorkerStartAllowed: false,
    codeActivationAllowed: false,
    databaseMutationAllowed: false,
    deploymentMode: "dormant_runtime_web_only",
    execute: true,
    migrationAllowed: false,
    operator: "approved-operator",
    packageId: contract.packageId,
    rollbackCommit: "b".repeat(40),
    services: ["web"],
  };
  assert.equal(validateApprovalRequest(request, contract, { now: new Date("2026-07-12T04:30:00.000Z") }), request);
  throwsReason("approval_window_not_active", () => validateApprovalRequest(request, contract, { now: new Date("2026-07-12T05:00:01.000Z") }));
  throwsReason("candidateWorkerStartAllowed_must_be_false", () => validateApprovalRequest({ ...request, candidateWorkerStartAllowed: true }, contract, { now: new Date("2026-07-12T04:30:00.000Z") }));
  throwsReason("request_services_mismatch", () => validateApprovalRequest({ ...request, services: ["web", "scanner-worker"] }, contract, { now: new Date("2026-07-12T04:30:00.000Z") }));
});

test("shell stays web-only and contains an automatic web rollback path", async () => {
  const source = await readFile("scripts/production/candidate-dormant-deploy.sh", "utf8");
  assert.match(source, /\$\{COMPOSE\[@\]\}" build web/);
  assert.match(source, /\$\{COMPOSE\[@\]\}" up -d --no-deps web/);
  assert.equal((source.match(/--env-file "\$\{BASE_ENV_FILE\}" --env-file "\$\{ENV_FILE\}"/g) ?? []).length, 2);
  assert.match(source, /env \\\n+  --env-file "\$\{BASE_ENV_FILE\}"/);
  assert.match(source, /env \\\n+  --env-file "\$\{ENV_FILE\}"/);
  assert.doesNotMatch(source, /readarray|mapfile/);
  assert.match(source, /rollback_on_failure/);
  assert.match(source, /candidate_dormant_contract_failed/);
  assert.match(source, /PASS_IMMEDIATE_DORMANT_WEB_CHECKS_AWAITING_DB_VERIFY_AND_OBSERVATION/);
  assert.doesNotMatch(source, /PASS_DORMANT_RUNTIME_DEPLOY_WEB_ONLY/);
  assert.doesNotMatch(source, /--remove-orphans/);
  assert.doesNotMatch(source, /--profile/);
  assert.doesNotMatch(source, /migration:runner|candidate:migrate|persistence\/migrate/);
});

test("shared production verification uses the same base then override env order", async () => {
  const source = await readFile("scripts/verify/production-check.sh", "utf8");
  assert.match(source, /BASE_ENV_FILE="\$\{BASE_ENV_FILE:-\$\{ROOT_DIR\}\/\.env\}"/);
  assert.equal((source.match(/--env-file "\$\{BASE_ENV_FILE\}" --env-file "\$\{ENV_FILE\}"/g) ?? []).length, 2);
});

test("approval request JSON never needs a secret field", async () => {
  const directory = await mkdtemp(join(tmpdir(), "candidate-dormant-request-"));
  try {
    const file = join(directory, "request.json");
    await writeFile(file, JSON.stringify({ note: "no secret material" }));
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /CRON_SECRET|DATABASE_URL|PASSWORD|TOKEN|PRIVATE KEY/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
