import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(
  ROOT,
  "docs/governance/wp-g0-2-runtime-identity-runner-preparation.v1.json",
);
const PRODUCTION_TARGET = "cec0b6572bb09ae91ff9e013f8bb160f73c045e2";
const DORMANT_FINAL_STATUS = "PASS_PRODUCTION_DORMANT_RUNTIME_WEB_ONLY_1800_SECOND_OBSERVATION";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function loadRunnerContract() {
  return JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
}

export async function inspectRunnerArtifact(contract) {
  const checksums = {};
  for (const file of [...contract.artifact.files].sort()) {
    checksums[file] = sha256(await readFile(resolve(ROOT, file)));
  }
  return { checksums, sha256: sha256(JSON.stringify(checksums)) };
}

export async function validateRuntimeIdentityRunner(contract) {
  contract ??= await loadRunnerContract();
  const violations = [];
  const [artifact, shell, runner] = await Promise.all([
    inspectRunnerArtifact(contract),
    readFile(resolve(ROOT, "scripts/production/candidate-runtime-identity/production-runner.sh"), "utf8"),
    readFile(resolve(ROOT, "scripts/production/candidate-runtime-identity/runner.mjs"), "utf8"),
  ]);
  if (contract.schemaVersion !== "wp-g0.2-runtime-identity-runner-preparation.v1") violations.push("schema_version");
  if (contract.productionAuthorization !== false || contract.productionExecuted !== false) violations.push("production_state_claim");
  if (contract.prerequisite?.dormantDeployFinalStatus !== DORMANT_FINAL_STATUS
    || contract.dormantEvidence?.finalStatus !== DORMANT_FINAL_STATUS) violations.push("dormant_prerequisite");
  if (contract.productionTarget?.commit !== PRODUCTION_TARGET
    || contract.productionTarget?.repositoryState !== "clean_detached"
    || contract.dormantEvidence?.targetCommit !== PRODUCTION_TARGET) violations.push("production_target");
  if (contract.dormantEvidence?.minimumObservationSeconds !== 1800
    || contract.dormantEvidence?.minimumSampleCount !== 57
    || contract.dormantEvidence?.maximumEvidenceAgeHours !== 24
    || contract.dormantEvidence?.candidateRuntimeDormantRequired !== true
    || contract.dormantEvidence?.candidateWorkerAbsentRequired !== true
    || contract.dormantEvidence?.redactedEvidenceArchiveSha256
      !== "e6323b02dfe4cc3120f0fa68d5254c89a9cad67d271dd6734c58eecf38eda3a5") {
    violations.push("dormant_evidence_boundary");
  }
  if (contract.productionIdentity?.wrapperPath
      !== "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/runtime/compose-identity-safe"
    || contract.productionIdentity?.wrapperSha256
      !== "fb473dc3bf0a2968be8ad385efac3273f4057530df17cee73f2003d3a369f1f3"
    || contract.productionIdentity?.overridePath
      !== "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/runtime/runtime-identity.override.yml"
    || contract.productionIdentity?.overrideSha256
      !== "1b7f8ba4c623a0025ff35ddc203c6b769d1b262a1545a16892816cdbc478bacf"
    || contract.productionIdentity?.wrapperMode !== "0700"
    || contract.productionIdentity?.overrideMode !== "0600"
    || contract.productionIdentity?.ownerUid !== 0) violations.push("production_identity_boundary");
  if (contract.prerequisite?.maximumApprovalWindowMinutes !== 90) violations.push("approval_window");
  if (artifact.sha256 !== contract.artifact?.sha256) violations.push("artifact_checksum");
  if (contract.runtimeAccess?.sqlSha256 !== "85ec2151f8d14513b6adc47831f6240aa9d96552abf439504904c64ee6e456aa") {
    violations.push("runtime_access_checksum");
  }
  if (contract.mutationAllowlist?.databaseRolesCreated !== 3
    || contract.mutationAllowlist?.candidateCapabilityMembershipsGranted !== 3
    || JSON.stringify(contract.mutationAllowlist?.servicesRecreated) !== '["web"]') {
    violations.push("mutation_allowlist");
  }
  if (JSON.stringify(contract.mutationAllowlist?.environmentKeysChanged) !== JSON.stringify([
    "CANDIDATE_SOURCE_DATABASE_URL", "CANDIDATE_CONSUMER_DATABASE_URL", "CANDIDATE_MONITOR_DATABASE_URL",
  ])) violations.push("environment_key_allowlist");
  if (Object.values(contract.dormantBoundary ?? {}).some((value) => value === true)) violations.push("dormant_boundary");
  for (const token of [
    "RUNTIME_IDENTITY_MODE:-dry_run", "contract.dormantEvidence.finalStatus", "assert_private_file",
    "runtimeLoginsDropped", "env.production.before", "rollbackWebImageRef",
    "up -d --no-deps --no-build --force-recreate web",
    "production_branch_not_detached", "REQUIRE_IDENTITY_WRAPPER=true",
    "production_input_checksum_mismatch", "approvedRunnerSourceCommit",
    "WEB_RECREATE_ATTEMPTED=true", "runtime_identity_rollback_incomplete",
    "ROLLBACK_VERIFIED: env, Web image, Candidate worker absence and production contracts restored.",
    "PASS_IMMEDIATE_RUNTIME_IDENTITY_AWAITING_OBSERVATION",
  ]) if (!shell.includes(token) && !runner.includes(token)) violations.push(`runner_guard_missing:${token}`);
  if (/--profile|--remove-orphans/.test(shell)) violations.push("scope_expansion_command");
  if (/compose[^\n]*(?:up|start|run)[^\n]*candidate-shadow-worker/.test(shell)) violations.push("candidate_worker_command");
  if (!runner.includes("candidate_feature_flag_not_false")
    && !shell.includes("candidate_feature_flag_not_false")) violations.push("feature_flag_guard_missing");
  if (!runner.includes("businessDmlAllowed") || !runner.includes("schemaDdlAllowed")) violations.push("approval_deny_guard_missing");
  if (!contract.rollback?.existingRuntimeLoginsMustBeAbsentAtPreflight) violations.push("rollback_precondition");
  if (!contract.forbidden?.includes("formal_backtest") || !contract.forbidden?.includes("control_lifecycle_start")) {
    violations.push("forbidden_boundary");
  }
  return {
    status: violations.length === 0 ? "PASS_LOCAL_RUNTIME_IDENTITY_CURRENT_RELEASE_PREFLIGHT" : "FAIL",
    productionDecision: "READY_FOR_EXACT_EXTERNAL_RUNTIME_IDENTITY_AUTHORIZATION",
    productionMutationAllowed: false,
    productionTarget: contract.productionTarget?.commit,
    repositoryState: contract.productionTarget?.repositoryState,
    artifactSha256: artifact.sha256,
    artifactFiles: Object.keys(artifact.checksums).length,
    violations,
  };
}

async function main() {
  const result = await validateRuntimeIdentityRunner();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "PASS_LOCAL_RUNTIME_IDENTITY_CURRENT_RELEASE_PREFLIGHT") process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
