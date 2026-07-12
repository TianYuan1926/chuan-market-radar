#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import yaml from "js-yaml";

export const CONTRACT_PATH = "docs/governance/wp-g0-2-shadow-capture-dormant-runtime-deploy.v1.json";
export const PACKAGE_ID = "WP-G0.2-SHADOW-CAPTURE-DORMANT-RUNTIME-DEPLOY";
const FEATURE_FLAGS = [
  "CANDIDATE_EPISODE_CANONICAL_WRITE",
  "CANDIDATE_EPISODE_SHADOW_WRITE",
  "CANDIDATE_EPISODE_DUAL_READ",
  "CANDIDATE_EPISODE_CANONICAL_READ",
  "CANDIDATE_EPISODE_REVIEW_READ",
];
const DATABASE_URLS = [
  "CANDIDATE_SOURCE_DATABASE_URL",
  "CANDIDATE_CONSUMER_DATABASE_URL",
  "CANDIDATE_MONITOR_DATABASE_URL",
];

export class DormantDeployPolicyError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "DormantDeployPolicyError";
    this.reason = reason;
  }
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function ensure(condition, reason) {
  if (!condition) throw new DormantDeployPolicyError(reason);
}

export function validateContract(contract) {
  ensure(contract?.schemaVersion === "wp-g0.2-shadow-capture-dormant-runtime-deploy.v1", "schema_version_mismatch");
  ensure(contract.packageId === PACKAGE_ID, "package_id_mismatch");
  ensure(contract.status === "local_preparation_verified_awaiting_production_approval", "contract_status_not_locked");
  ensure(contract.productionAuthorization === false, "production_authorization_must_be_false");
  ensure(contract.productionDeployed === false, "production_deployed_must_be_false");
  ensure(contract.productionActivated === false, "production_activated_must_be_false");
  ensure(contract.deployment?.mode === "dormant_runtime_web_only", "deployment_mode_mismatch");
  ensure(JSON.stringify(contract.deployment?.serviceAllowlist) === '["web"]', "service_allowlist_mismatch");
  ensure(contract.deployment?.buildCommand === "docker compose build web", "build_command_mismatch");
  ensure(contract.deployment?.recreateCommand === "docker compose up -d --no-deps web", "recreate_command_mismatch");
  ensure(contract.deployment?.removeOrphansAllowed === false, "remove_orphans_must_be_false");
  ensure(contract.deployment?.composeProfileAllowed === false, "compose_profile_must_be_false");
  ensure(contract.deployment?.candidateWorkerStartAllowed === false, "candidate_worker_start_must_be_false");
  ensure(contract.deployment?.maximumApprovalWindowMinutes === 90, "approval_window_mismatch");
  ensure(contract.deployment?.automaticWebRollbackRequired === true, "automatic_rollback_required");
  ensure(contract.dormantBoundary?.codeActivationAllowed === false, "code_activation_must_be_false");
  ensure(contract.dormantBoundary?.candidateFeatureFlagsEnabled === 0, "feature_flags_must_be_zero");
  ensure(contract.dormantBoundary?.candidateDatabaseUrlsConfigured === 0, "candidate_database_urls_must_be_zero");
  ensure(contract.dormantBoundary?.candidateRuntimeReleaseId === "disabled", "candidate_release_must_be_disabled");
  ensure(contract.dormantBoundary?.candidateWorkerExpected === false, "candidate_worker_expected_must_be_false");
  ensure(contract.dormantBoundary?.candidateControlRows === 0, "candidate_control_rows_must_be_zero");
  ensure(contract.dormantBoundary?.migrationAllowed === false, "migration_must_be_false");
  ensure(contract.dormantBoundary?.databaseMutationAllowed === false, "database_mutation_must_be_false");
  ensure(Array.isArray(contract.artifact?.files) && contract.artifact.files.length > 0, "artifact_files_missing");
  ensure(/^[0-9a-f]{64}$/.test(contract.artifact?.sha256 ?? ""), "artifact_checksum_not_locked");
  ensure(contract.forbiddenInThisPackage?.includes("migration_execute"), "migration_forbidden_missing");
  ensure(contract.forbiddenInThisPackage?.includes("candidate_worker_start"), "candidate_worker_forbidden_missing");
  return contract;
}

export async function loadContract(root = process.cwd()) {
  return validateContract(JSON.parse(await readFile(resolve(root, CONTRACT_PATH), "utf8")));
}

export async function inspectArtifact(root, contract) {
  const checksums = {};
  for (const file of [...contract.artifact.files].sort()) {
    checksums[file] = sha256(await readFile(resolve(root, file)));
  }
  const checksum = sha256(JSON.stringify(checksums));
  ensure(checksum === contract.artifact.sha256, "artifact_checksum_mismatch");
  return { checksum, fileCount: Object.keys(checksums).length };
}

export async function inspectRepository(root = process.cwd(), contract) {
  const [composeSource, flagsSource, runnerSource] = await Promise.all([
    readFile(resolve(root, "docker-compose.yml"), "utf8"),
    readFile(resolve(root, "src/lib/candidate-episode/feature-flags.ts"), "utf8"),
    readFile(resolve(root, "scripts/production/candidate-dormant-deploy.sh"), "utf8"),
  ]);
  const compose = yaml.load(composeSource);
  const webEnvironment = compose?.services?.web?.environment ?? {};
  const candidateWorker = compose?.services?.["candidate-shadow-worker"] ?? {};
  const appEnvironment = compose?.["x-app-env"] ?? {};
  const facts = {
    candidateDatabaseUrlsOnlyOnWeb: DATABASE_URLS.every((key) => key in webEnvironment)
      && DATABASE_URLS.every((key) => !(key in (candidateWorker.environment ?? {}))),
    candidateWorkerProfileIsolated: JSON.stringify(candidateWorker.profiles) === '["candidate-shadow-runtime"]',
    candidateWorkerNotStartedByRunner: !/\$\{COMPOSE\[@\]\}"[^\n]*(?:up|start|run)[^\n]*candidate-shadow-worker/.test(runnerSource),
    codeActivationHardFalse: /CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED = false as const/.test(flagsSource),
    defaultCandidateFlagsFalse: FEATURE_FLAGS.every((key) => String(appEnvironment[key] ?? "").includes("-false}")),
    defaultCandidateReleaseDisabled: String(appEnvironment.CANDIDATE_RUNTIME_RELEASE_ID ?? "").includes("-disabled}"),
    defaultCandidateWorkerExpectedFalse: String(appEnvironment.CANDIDATE_SHADOW_WORKER_EXPECTED ?? "").includes("-false}"),
    exactWebBuild: /\$\{COMPOSE\[@\]\}" build web/.test(runnerSource),
    exactWebRecreate: /\$\{COMPOSE\[@\]\}" up -d --no-deps web/.test(runnerSource),
    noComposeProfile: !/--profile/.test(runnerSource),
    noMigrationCommand: !/(migration:runner|candidate:migrate|persistence\/migrate)/.test(runnerSource),
    noRemoveOrphans: !/--remove-orphans/.test(runnerSource),
  };
  const violations = Object.entries(facts).filter(([, value]) => value !== true).map(([key]) => `repository_guard_missing:${key}`);
  ensure(violations.length === 0, violations.join(","));
  ensure(JSON.stringify(contract.deployment.serviceAllowlist) === '["web"]', "contract_service_allowlist_mismatch");
  return facts;
}

function parseTimestamp(value, reason) {
  const timestamp = Date.parse(value);
  ensure(Number.isFinite(timestamp), reason);
  return timestamp;
}

export function validateApprovalRequest(request, contract, { now = new Date() } = {}) {
  ensure(request && typeof request === "object" && !Array.isArray(request), "request_not_object");
  const expectedKeys = [
    "approvalExpiresAt", "approvalIssuedAt", "approvalRef", "approvedArtifactSha256",
    "approvedCommit", "automaticWebRollbackAllowed", "candidateControlLifecycleStartAllowed",
    "candidateDatabaseUrlConfigurationAllowed", "candidateFeatureFlagEnablementAllowed",
    "candidateWorkerStartAllowed", "codeActivationAllowed", "databaseMutationAllowed",
    "deploymentMode", "execute", "migrationAllowed", "operator", "packageId",
    "rollbackCommit", "services",
  ];
  ensure(exactKeys(request, expectedKeys), "request_keys_mismatch");
  ensure(request.packageId === PACKAGE_ID, "request_package_mismatch");
  ensure(request.deploymentMode === "dormant_runtime_web_only", "request_mode_mismatch");
  ensure(JSON.stringify(request.services) === '["web"]', "request_services_mismatch");
  ensure(/^[0-9a-f]{40}$/.test(request.approvedCommit ?? ""), "approved_commit_invalid");
  ensure(/^[0-9a-f]{40}$/.test(request.rollbackCommit ?? ""), "rollback_commit_invalid");
  ensure(request.approvedCommit !== request.rollbackCommit, "rollback_commit_matches_approved");
  ensure(request.approvedArtifactSha256 === contract.artifact.sha256, "approved_artifact_checksum_mismatch");
  ensure(typeof request.approvalRef === "string" && request.approvalRef.trim().length >= 8, "approval_ref_invalid");
  ensure(typeof request.operator === "string" && request.operator.trim().length >= 2, "operator_invalid");
  ensure(typeof request.execute === "boolean", "execute_flag_missing");
  ensure(request.automaticWebRollbackAllowed === true, "automatic_web_rollback_not_allowed");
  for (const key of [
    "candidateControlLifecycleStartAllowed", "candidateDatabaseUrlConfigurationAllowed",
    "candidateFeatureFlagEnablementAllowed", "candidateWorkerStartAllowed", "codeActivationAllowed",
    "databaseMutationAllowed", "migrationAllowed",
  ]) ensure(request[key] === false, `${key}_must_be_false`);
  const issuedAt = parseTimestamp(request.approvalIssuedAt, "approval_issued_at_invalid");
  const expiresAt = parseTimestamp(request.approvalExpiresAt, "approval_expires_at_invalid");
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  ensure(expiresAt > issuedAt && expiresAt - issuedAt <= 90 * 60 * 1000, "approval_window_too_long");
  ensure(nowMs >= issuedAt && nowMs <= expiresAt, "approval_window_not_active");
  return request;
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function parseDormantEnvironment(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) values[match[1]] = unquote(match[2]);
  }
  const invalidFlags = FEATURE_FLAGS.filter((key) => key in values && values[key].toLowerCase() !== "false");
  const configuredUrls = DATABASE_URLS.filter((key) => (values[key] ?? "").trim().length > 0);
  const release = (values.CANDIDATE_RUNTIME_RELEASE_ID ?? "disabled").toLowerCase();
  const workerExpected = (values.CANDIDATE_SHADOW_WORKER_EXPECTED ?? "false").toLowerCase();
  ensure(invalidFlags.length === 0, `candidate_feature_flag_not_false:${invalidFlags.join(",")}`);
  ensure(configuredUrls.length === 0, `candidate_database_url_configured:${configuredUrls.join(",")}`);
  ensure(release === "disabled", "candidate_runtime_release_not_disabled");
  ensure(workerExpected === "false", "candidate_shadow_worker_expected_not_false");
  return {
    candidateDatabaseUrlsConfigured: 0,
    candidateFeatureFlagsEnabled: 0,
    candidateRuntimeReleaseDisabled: true,
    candidateWorkerExpected: false,
  };
}

export async function validateLocalPreparation(root = process.cwd()) {
  const contract = await loadContract(root);
  const [artifact, repository] = await Promise.all([
    inspectArtifact(root, contract),
    inspectRepository(root, contract),
  ]);
  return {
    schemaVersion: "wp-g0.2-shadow-capture-dormant-runtime-deploy-result.v1",
    status: "PASS_LOCAL_DORMANT_DEPLOY_PREPARATION",
    productionDecision: "BLOCKED_AWAITING_EXPLICIT_PRODUCTION_APPROVAL",
    productionMutationAllowed: false,
    artifact,
    repository,
    nextRequiredAction: "approve_exact_commit_artifact_web_only_90_minute_window",
  };
}

function parseArgs(argv) {
  const [command = "validate", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    ensure(key.startsWith("--"), "argument_invalid");
    const value = rest[index + 1];
    ensure(value && !value.startsWith("--"), `argument_value_missing:${key}`);
    options[key.slice(2)] = value;
    index += 1;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());
  let result;
  if (command === "validate") {
    result = await validateLocalPreparation(root);
  } else if (command === "request") {
    const contract = await loadContract(root);
    const request = JSON.parse(await readFile(resolve(options.request ?? ""), "utf8"));
    result = {
      ok: true,
      request: validateApprovalRequest(request, contract, options.now ? { now: new Date(options.now) } : {}),
    };
  } else if (command === "env") {
    result = {
      ok: true,
      environment: parseDormantEnvironment(await readFile(resolve(options["env-file"] ?? ""), "utf8")),
    };
  } else {
    throw new DormantDeployPolicyError("command_invalid");
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, reason: error?.reason ?? "unexpected_error" })}\n`);
    process.exitCode = 1;
  });
}
