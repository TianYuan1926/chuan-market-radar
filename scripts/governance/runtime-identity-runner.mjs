import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(
  ROOT,
  "docs/governance/wp-g0-2-runtime-identity-runner-preparation.v1.json",
);

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
  if (contract.prerequisite?.dormantDeployFinalStatus !== "PASS_DORMANT_RUNTIME_DEPLOY") violations.push("dormant_prerequisite");
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
    "RUNTIME_IDENTITY_MODE:-dry_run", "PASS_DORMANT_RUNTIME_DEPLOY", "assert_private_file",
    "runtimeLoginsDropped", "env.production.before", "runtime-identity-rollback",
    "up -d --no-deps --no-build --force-recreate web",
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
    status: violations.length === 0 ? "PASS_LOCAL_RUNTIME_IDENTITY_RUNNER_PREPARATION" : "FAIL",
    productionDecision: "BLOCKED_UNTIL_DORMANT_DEPLOY_PASS_AND_NEW_EXPLICIT_APPROVAL",
    productionMutationAllowed: false,
    artifactSha256: artifact.sha256,
    artifactFiles: Object.keys(artifact.checksums).length,
    violations,
  };
}

async function main() {
  const result = await validateRuntimeIdentityRunner();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "PASS_LOCAL_RUNTIME_IDENTITY_RUNNER_PREPARATION") process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
