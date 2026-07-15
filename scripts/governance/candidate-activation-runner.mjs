import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(
  ROOT,
  "docs/governance/wp-g0-2-activation-observation-runner-preparation.v1.json",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function artifact(files) {
  const checksums = {};
  for (const file of [...files].sort()) checksums[file] = sha256(await readFile(resolve(ROOT, file)));
  return { fileCount: Object.keys(checksums).length, sha256: sha256(JSON.stringify(checksums)) };
}

export async function loadActivationRunnerContract() {
  return JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
}

export async function validateActivationRunnerPreparation(contract) {
  contract ??= await loadActivationRunnerContract();
  const violations = [];
  const [runnerArtifact, currentReleaseArtifact, shell, observer, entrypoint, runner, flags, migration] = await Promise.all([
    artifact(contract.runnerArtifact?.files ?? []),
    artifact(contract.activationReleaseArtifact?.files ?? []),
    readFile(resolve(ROOT, "scripts/production/candidate-activation/production-runner.sh"), "utf8"),
    readFile(resolve(ROOT, "scripts/production/candidate-activation/observation-runner.sh"), "utf8"),
    readFile(resolve(ROOT, "scripts/production/candidate-activation/production-entrypoint.sh"), "utf8").catch(() => ""),
    readFile(resolve(ROOT, "scripts/production/candidate-activation/runner.mjs"), "utf8"),
    readFile(resolve(ROOT, "src/lib/candidate-episode/feature-flags.ts"), "utf8"),
    readFile(resolve(ROOT, "migrations/candidate-episode/009_candidate_shadow_capture_safety.sql"), "utf8"),
  ]);

  if (contract.schemaVersion !== "wp-g0.2-activation-observation-runner-preparation.v1") violations.push("schema_version");
  if (contract.productionAuthorization !== false || contract.productionExecuted !== false) violations.push("production_state_claim");
  if (contract.currentSource?.codeActivationAllowed !== false
      || contract.currentSource?.futureActivationReleaseRequired !== true) violations.push("current_source_boundary");
  if (contract.prerequisites?.approvalBindsRunnerContractSha256 !== true) violations.push("runner_contract_binding");
  if (!/CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED = false as const/.test(flags)
      || /CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED = true as const/.test(flags)) violations.push("current_code_activation_lock");
  if (runnerArtifact.sha256 !== contract.runnerArtifact?.sha256 || runnerArtifact.fileCount !== 4) violations.push("runner_artifact");
  if (currentReleaseArtifact.sha256 !== contract.activationReleaseArtifact?.currentDormantSha256
      || currentReleaseArtifact.fileCount !== 16) violations.push("current_release_artifact");
  if (contract.activationReleaseArtifact?.approvalMustBindFutureSha256 !== true
      || contract.activationReleaseArtifact?.futureSha256MustDifferFromCurrentDormantSha256 !== true) violations.push("future_release_binding");
  if (sha256(migration) !== contract.schemaBoundary?.migration009Sha256) violations.push("migration_checksum");
  if (contract.schemaBoundary?.candidateLedgerRequired !== 9
      || contract.schemaBoundary?.controlRowsBeforeActivation !== 0
      || contract.schemaBoundary?.migrationExecutionAllowed !== false
      || contract.schemaBoundary?.schemaDdlAllowed !== false
      || contract.schemaBoundary?.businessDmlAllowed !== false) violations.push("schema_boundary");
  if (JSON.stringify(contract.mutationAllowlist?.services) !== '["web","candidate-shadow-worker"]'
      || contract.mutationAllowlist?.composeProfile !== "candidate-shadow-runtime"
      || contract.mutationAllowlist?.candidateDatabaseUrlsChanged !== 0
      || contract.mutationAllowlist?.candidateDatabaseRolesChanged !== 0
      || contract.mutationAllowlist?.controlLifecycleStarts !== 1
      || contract.mutationAllowlist?.shadowWriteEnabled !== true
      || contract.mutationAllowlist?.canonicalWriteEnabled !== false
      || contract.mutationAllowlist?.dualReadEnabled !== false
      || contract.mutationAllowlist?.canonicalReadEnabled !== false
      || contract.mutationAllowlist?.reviewReadEnabled !== false
      || contract.mutationAllowlist?.automaticPhaseAdvance !== false) violations.push("mutation_allowlist");
  if (contract.observation?.minimumCleanWindowHours !== 24
      || contract.observation?.sampleIntervalSeconds !== 300
      || contract.observation?.maximumSampleGapSeconds !== 600
      || contract.observation?.minimumSamples !== 289
      || contract.observation?.lifecycleMaximumHours !== 72
      || contract.observation?.minimumComparedWritesForThisPackage !== null
      || contract.observation?.minimumComparedWritesForNextGate !== 10000) violations.push("observation_thresholds");
  if (contract.execution?.activationRunner !== "transient_systemd_unit"
      || contract.execution?.observationRunner !== "transient_systemd_unit"
      || contract.execution?.restart !== "no"
      || contract.execution?.activationRuntimeMaxSeconds !== 5400
      || contract.execution?.observationRuntimeMaxSeconds !== 90000
      || contract.execution?.sessionIndependent !== true
      || contract.execution?.externalLeaseRequired !== true
      || contract.execution?.fencingRequired !== true
      || contract.execution?.leaseRetainedThroughObservation !== true
      || contract.execution?.productionRepositoryBefore !== "clean_detached"
      || contract.execution?.productionRepositoryAfter !== "clean_detached"
      || contract.execution?.hostNodeRequired !== false) violations.push("execution_boundary");
  if (contract.rollback?.automaticRollbackRequired !== true
      || contract.rollback?.approvalExpiryMayBlockSafetyRollback !== false
      || contract.rollback?.transitionControlToLegacyRequired !== true
      || contract.rollback?.writeFrozenAfterRollback !== true
      || contract.rollback?.deleteCandidateEvidenceAllowed !== false
      || contract.rollback?.retainWebImageBeforeMutation !== true
      || contract.rollback?.retentionRepository !== "market-radar-rollback/wp-g0-2-candidate-activation"
      || contract.rollback?.cleanupRequiresSeparateApproval !== true) violations.push("rollback_boundary");
  for (const token of [
    "CANDIDATE_ACTIVATION_MODE:-dry_run", "runtimeIdentityStatus", "approvedActivationArtifactSha256",
    "runnerContractSha256", "runner_contract_checksum_mismatch",
    "release_not_activation_authorized", "start_shadow_capture_v3", "control-rollback",
    "candidate-shadow-runtime", "PASS_IMMEDIATE_SHADOW_CAPTURE_AWAITING_OBSERVATION",
  ]) if (!shell.includes(token) && !runner.includes(token)) violations.push(`activation_guard_missing:${token}`);
  for (const token of [
    "SAMPLE_LIMIT=289", "INTERVAL_SECONDS=300", "observation_sample_gap_exceeded",
    "observation_completed_regressed", "PASS_ACTIVATE_AND_OBSERVE", "automatic_rollback",
  ]) if (!observer.includes(token) && !runner.includes(token)) violations.push(`observation_guard_missing:${token}`);
  for (const token of [
    "systemd-run", "--collect", "Restart=no", "RuntimeMaxSec=5400",
    "CANDIDATE_ACTIVATION_ENTRYPOINT_MODE=detached_worker",
  ]) if (!entrypoint.includes(token)) violations.push(`entrypoint_guard_missing:${token}`);
  for (const token of [
    "autonomy-production-lease-cli.mjs", "lease_acquire", "lease_consume", "lease_checkpoint",
    "observation-checkpoint",
    "market-radar-rollback/wp-g0-2-candidate-activation", "git -C \"${ROOT_DIR}\" checkout --detach",
    "RuntimeMaxSec=90000", "Restart=no",
  ]) if (!shell.includes(token) && !observer.includes(token)) violations.push(`production_guard_missing:${token}`);
  if (/--remove-orphans|\bnohup\b|git merge|git branch -f main|git checkout main/.test(shell)
      || /backtest:formal|candidate:migrate|persistence\/migrate/.test(shell)) {
    violations.push("forbidden_command");
  }
  if (/shadow_verify|canonical_compat/.test(shell) || /transition_migration_control_v1[\s\S]*shadow_verify/.test(runner)) {
    violations.push("automatic_phase_advance");
  }
  for (const required of [
    "production_execution_from_current_dormant_source", "schema_migration", "canonical_write",
    "automatic_phase_advance", "scan_ranking_change", "formal_backtest",
  ]) if (!contract.forbidden?.includes(required)) violations.push(`forbidden_missing:${required}`);
  if (contract.nextProductionPackage !== "WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION") {
    violations.push("production_sequence");
  }

  return {
    status: violations.length === 0 ? "PASS_LOCAL_ACTIVATION_OBSERVATION_RUNNER_PREPARATION" : "FAIL",
    productionDecision: "BLOCKED_UNTIL_DORMANT_AND_RUNTIME_IDENTITY_FINAL_PASS_AND_NEW_EXACT_APPROVAL",
    productionMutationAllowed: false,
    currentCodeActivationAllowed: false,
    runnerArtifactSha256: runnerArtifact.sha256,
    runnerArtifactFiles: runnerArtifact.fileCount,
    currentDormantReleaseArtifactSha256: currentReleaseArtifact.sha256,
    activationReleaseArtifactFiles: currentReleaseArtifact.fileCount,
    violations,
  };
}

async function main() {
  const result = await validateActivationRunnerPreparation();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "PASS_LOCAL_ACTIVATION_OBSERVATION_RUNNER_PREPARATION") process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
