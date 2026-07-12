#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PACKAGE_ID = "WP-G0.2-PRODUCTION-WEB-IDENTITY-RECOVERY";
export const CONTRACT_PATH = "docs/governance/wp-g0-2-production-web-identity-recovery.v1.json";
export const PRODUCTION_HEAD = "0599f802f261fe8e3c1982a07106f362bd62ac13";
export const IDENTITY_OVERRIDE_SHA256 = "1b7f8ba4c623a0025ff35ddc203c6b769d1b262a15a5a16892816cdcb478bacf";
export const COMPOSE_WRAPPER_SHA256 = "fb473dc3bf0a2968be8bad385efac32734f0575ddf17cee73f2003d3a369f1f3";
export const PRODUCTION_COMPOSE_SHA256 = "2749a24dfd2f574ac0ffe64a8e2c9f8afb411dc7d11279f75cfcc9fb0d743a4e";
export const STAGING_DIRECTORY_PATTERN = /^\/home\/ubuntu\/\.cache\/market-radar-ops\/wp-g0-2-web-identity-recovery-[a-z0-9][a-z0-9._-]{7,80}$/;

export class WebIdentityRecoveryPolicyError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "WebIdentityRecoveryPolicyError";
    this.reason = reason;
  }
}

function ensure(condition, reason) {
  if (!condition) throw new WebIdentityRecoveryPolicyError(reason);
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseTimestamp(value, reason) {
  const timestamp = Date.parse(value);
  ensure(Number.isFinite(timestamp), reason);
  return timestamp;
}

export function validateContract(contract) {
  ensure(contract?.schemaVersion === "wp-g0.2-production-web-identity-recovery.v1", "schema_version_mismatch");
  ensure(contract.packageId === PACKAGE_ID, "package_id_mismatch");
  ensure(contract.status === "local_preparation_awaiting_exact_production_approval", "contract_status_not_locked");
  ensure(contract.productionAuthorization === false, "production_authorization_must_be_false");
  ensure(contract.productionExecuted === false, "production_executed_must_be_false");
  ensure(contract.scope?.productionHead === PRODUCTION_HEAD, "production_head_not_locked");
  ensure(contract.scope?.service === "web", "service_not_web_only");
  ensure(contract.scope?.identityOverrideSha256 === IDENTITY_OVERRIDE_SHA256, "identity_override_checksum_not_locked");
  ensure(contract.scope?.composeWrapperSha256 === COMPOSE_WRAPPER_SHA256, "compose_wrapper_checksum_not_locked");
  ensure(contract.scope?.productionComposeSha256 === PRODUCTION_COMPOSE_SHA256, "production_compose_checksum_not_locked");
  ensure(contract.scope?.environmentFileChecksumsRequiredInApproval === true, "environment_checksum_binding_required");
  ensure(contract.scope?.buildAllowed === false, "build_must_be_false");
  ensure(contract.scope?.sourceSyncAllowed === false, "source_sync_must_be_false");
  ensure(contract.scope?.temporaryArtifactStagingAllowed === true, "temporary_artifact_staging_required");
  ensure(contract.scope?.productionRepositoryMutationAllowed === false, "production_repository_mutation_must_be_false");
  ensure(contract.scope?.temporaryArtifactCleanupRequired === true, "temporary_artifact_cleanup_required");
  ensure(contract.scope?.databaseMutationAllowed === false, "database_mutation_must_be_false");
  ensure(contract.scope?.redisMutationAllowed === false, "redis_mutation_must_be_false");
  ensure(contract.scope?.workerRestartAllowed === false, "worker_restart_must_be_false");
  ensure(contract.scope?.featureFlagMutationAllowed === false, "feature_flag_mutation_must_be_false");
  ensure(contract.scope?.maximumApprovalWindowMinutes === 90, "approval_window_not_locked");
  ensure(contract.rollback?.baselineComposeWithoutIdentityOverride === true, "baseline_rollback_required");
  ensure(contract.rollback?.automaticRollbackRequired === true, "automatic_rollback_required");
  ensure(contract.rollback?.rollbackOnlyBeforePersistenceRecoveryVerified === true, "rollback_boundary_not_locked");
  ensure(contract.rollback?.retainRecoveredIdentityOnIndependentScanDegradation === true, "recovered_identity_retention_not_locked");
  ensure(/^[0-9a-f]{64}$/.test(contract.artifact?.sha256 ?? ""), "artifact_checksum_not_locked");
  ensure(JSON.stringify(contract.artifact?.files) === JSON.stringify([
    "scripts/production/web-identity-recovery-entrypoint.sh",
    "scripts/production/web-identity-recovery.mjs",
    "scripts/production/web-identity-recovery.sh",
  ]), "artifact_files_mismatch");
  ensure(exactKeys(contract.artifact?.fileSha256, contract.artifact.files), "artifact_file_checksums_mismatch");
  ensure(Object.values(contract.artifact.fileSha256).every((value) => /^[0-9a-f]{64}$/.test(value)), "artifact_file_checksum_invalid");
  return contract;
}

export function validateApprovalRequest(request, contract, { now = new Date() } = {}) {
  const expectedKeys = [
    "approvalExpiresAt", "approvalIssuedAt", "approvalRef", "automaticBaselineRollbackAllowed",
    "baseEnvSha256", "composeSha256", "composeWrapperSha256", "contractSha256", "databaseMutationAllowed", "execute",
    "featureFlagMutationAllowed", "identityOverrideSha256", "migrationAllowed", "noBuild",
    "noSourceSync", "operator", "packageId", "productionEnvSha256", "productionHead",
    "productionRepositoryMutationAllowed", "recoveryArtifactSha256", "redisMutationAllowed", "runnerSourceCommit",
    "service", "stagingDirectory", "temporaryArtifactCleanupRequired", "temporaryArtifactStagingAllowed",
    "transportBundleSha256", "transportMethod", "webImageId", "workerRestartAllowed",
  ];
  ensure(exactKeys(request, expectedKeys), "request_keys_mismatch");
  ensure(request.packageId === PACKAGE_ID, "request_package_mismatch");
  ensure(request.productionHead === contract.scope.productionHead, "request_production_head_mismatch");
  ensure(request.service === "web", "request_service_not_web_only");
  ensure(request.identityOverrideSha256 === contract.scope.identityOverrideSha256, "request_identity_override_checksum_mismatch");
  ensure(request.composeWrapperSha256 === contract.scope.composeWrapperSha256, "request_wrapper_checksum_mismatch");
  ensure(request.composeSha256 === contract.scope.productionComposeSha256, "request_compose_checksum_mismatch");
  ensure(request.recoveryArtifactSha256 === contract.artifact.sha256, "request_recovery_artifact_checksum_mismatch");
  ensure(/^[0-9a-f]{64}$/.test(request.contractSha256 ?? ""), "request_contract_checksum_invalid");
  ensure(/^[0-9a-f]{64}$/.test(request.transportBundleSha256 ?? ""), "request_transport_bundle_checksum_invalid");
  ensure(/^[0-9a-f]{40}$/.test(request.runnerSourceCommit ?? ""), "request_runner_source_commit_invalid");
  ensure(STAGING_DIRECTORY_PATTERN.test(request.stagingDirectory ?? ""), "request_staging_directory_invalid");
  ensure(request.transportMethod === "approved_orcaterm_bundle_upload", "request_transport_method_invalid");
  ensure(request.temporaryArtifactStagingAllowed === true, "temporary_artifact_staging_not_allowed");
  ensure(request.temporaryArtifactCleanupRequired === true, "temporary_artifact_cleanup_not_required");
  ensure(request.productionRepositoryMutationAllowed === false, "production_repository_mutation_not_forbidden");
  ensure(/^[0-9a-f]{64}$/.test(request.baseEnvSha256 ?? ""), "request_base_env_checksum_invalid");
  ensure(/^[0-9a-f]{64}$/.test(request.productionEnvSha256 ?? ""), "request_production_env_checksum_invalid");
  ensure(/^sha256:[0-9a-f]{64}$/.test(request.webImageId ?? ""), "request_web_image_id_invalid");
  ensure(request.execute === true, "execute_must_be_true");
  ensure(request.noBuild === true, "no_build_must_be_true");
  ensure(request.noSourceSync === true, "no_source_sync_must_be_true");
  ensure(request.automaticBaselineRollbackAllowed === true, "automatic_baseline_rollback_not_allowed");
  for (const key of [
    "databaseMutationAllowed", "featureFlagMutationAllowed", "migrationAllowed",
    "redisMutationAllowed", "workerRestartAllowed",
  ]) ensure(request[key] === false, `${key}_must_be_false`);
  ensure(typeof request.approvalRef === "string" && request.approvalRef.trim().length >= 8, "approval_ref_invalid");
  ensure(typeof request.operator === "string" && request.operator.trim().length >= 2, "operator_invalid");
  const issuedAt = parseTimestamp(request.approvalIssuedAt, "approval_issued_at_invalid");
  const expiresAt = parseTimestamp(request.approvalExpiresAt, "approval_expires_at_invalid");
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  ensure(expiresAt > issuedAt && expiresAt - issuedAt <= 90 * 60 * 1000, "approval_window_too_long");
  ensure(nowMs >= issuedAt && nowMs <= expiresAt, "approval_window_not_active");
  return request;
}

export async function inspectArtifact(root, contract) {
  const checksums = {};
  for (const file of contract.artifact.files) {
    checksums[file] = sha256(await readFile(resolve(root, file)));
    ensure(checksums[file] === contract.artifact.fileSha256[file], `artifact_file_checksum_mismatch:${file}`);
  }
  const checksum = sha256(JSON.stringify(checksums));
  ensure(checksum === contract.artifact.sha256, "artifact_checksum_mismatch");
  return { checksum, fileCount: contract.artifact.files.length };
}

export async function inspectRunner(root) {
  const source = await readFile(resolve(root, "scripts/production/web-identity-recovery.sh"), "utf8");
  const entrypoint = await readFile(resolve(root, "scripts/production/web-identity-recovery-entrypoint.sh"), "utf8");
  const facts = {
    webOnlyRecovery: /IDENTITY_COMPOSE\[@\][^\n]*up -d --no-deps --no-build --force-recreate web/.test(source),
    baselineRollback: /BASELINE_COMPOSE\[@\][^\n]*up -d --no-deps --no-build --force-recreate web/.test(source),
    noSourceSync: !/git\s+(?:-[^\s]+\s+)*(?:fetch|pull|merge|rebase|checkout)/.test(source),
    noBuild: !/\}\"\s+build\s/.test(source),
    noMigration: !/(migration:runner|candidate:migrate|persistence\/migrate)/.test(source),
    noOtherServiceMutation: !/(?:up|start|restart|run)[^\n]*(?:postgres|redis|worker|caddy)/.test(source),
    noEnvWrite: !/(?:sed\s+-i|tee\s+[^|]|cat\s+>)[^\n]*(?:\.env|ENV_FILE)/.test(source),
    otherContainersCompared: /OTHER_CONTAINERS_BEFORE/.test(source) && /OTHER_CONTAINERS_AFTER/.test(source),
    identityFingerprintChecked: /EXPECTED_DATABASE_URL_SHA256/.test(source) && /ACTUAL_DATABASE_URL_SHA256/.test(source),
    automaticRollbackTrap: /trap rollback_on_failure EXIT/.test(source),
    persistenceRecoveryBarrier: /PERSISTENCE_RECOVERY_VERIFIED=true/.test(source)
      && /PERSISTENCE_RECOVERY_VERIFIED.*== "true"/.test(source),
    fullHealthWait: /wait_for_full_recovery_health/.test(source),
    explicitPartialResult: /PARTIAL_PRODUCTION_WEB_IDENTITY_RECOVERY_SCAN_NOT_FRESH/.test(source),
    exactSuccessLabel: /PASS_PRODUCTION_WEB_IDENTITY_RECOVERY/.test(source),
    stagingBoundaryChecked: /APPROVED_STAGING_DIRECTORY/.test(entrypoint) && /STAGING_BASENAME_PREFIX/.test(entrypoint),
    stagingCleanupTrap: /trap cleanup_staging EXIT/.test(entrypoint)
      && /trap 'exit 130' INT/.test(entrypoint)
      && /trap 'exit 143' TERM/.test(entrypoint),
    productionRepositoryUntouchedByEntrypoint: !/git\s+(?:-[^\s]+\s+)*(?:fetch|pull|merge|rebase|checkout)/.test(entrypoint),
  };
  const violations = Object.entries(facts).filter(([, value]) => value !== true).map(([key]) => `runner_guard_missing:${key}`);
  ensure(violations.length === 0, violations.join(","));
  return facts;
}

export async function loadContract(root = process.cwd()) {
  return validateContract(JSON.parse(await readFile(resolve(root, CONTRACT_PATH), "utf8")));
}

export async function validateLocalPreparation(root = process.cwd()) {
  const contract = await loadContract(root);
  const [artifact, runner] = await Promise.all([inspectArtifact(root, contract), inspectRunner(root)]);
  return {
    status: "PASS_LOCAL_WEB_IDENTITY_RECOVERY_PREPARATION",
    productionDecision: "BLOCKED_AWAITING_EXACT_PRODUCTION_APPROVAL",
    productionMutationAllowed: false,
    artifact,
    runner,
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
    const contract = options["contract-base64"]
      ? validateContract(JSON.parse(Buffer.from(options["contract-base64"], "base64").toString("utf8")))
      : await loadContract(root);
    const request = options["request-base64"]
      ? JSON.parse(Buffer.from(options["request-base64"], "base64").toString("utf8"))
      : JSON.parse(await readFile(resolve(options.request ?? ""), "utf8"));
    result = {
      ok: true,
      request: validateApprovalRequest(request, contract, options.now ? { now: new Date(options.now) } : {}),
    };
  } else {
    throw new WebIdentityRecoveryPolicyError("command_invalid");
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href || process.env.WEB_IDENTITY_RECOVERY_STDIN === "true") {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, reason: error?.reason ?? "unexpected_error" })}\n`);
    process.exitCode = 1;
  });
}
