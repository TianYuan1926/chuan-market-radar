#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  validateProductionPacketContract,
} from "../production/candidate-legacy-pending-drain-production/bundle.mjs";

const CONTRACT =
  "docs/governance/wp-g0-2-cycle-6-legacy-pending-drain-production-packet.v2.json";
const RUNNER =
  "scripts/production/candidate-legacy-pending-drain-production/production-runner.sh";
const ENTRYPOINT =
  "scripts/production/candidate-legacy-pending-drain-production/production-entrypoint.sh";
const DB_RUNNER =
  "scripts/production/candidate-legacy-pending-drain-production/db-runner.mjs";

export function evaluatePendingDrainProductionGovernance({ contract, dbRunner, entrypoint, runner }) {
  const violations = [];
  if (contract.productionAuthorization !== false || contract.productionExecuted !== false
      || contract.productionPass !== false) violations.push("local_truth_overclaimed");
  if (contract.databasePrecondition?.outbox !== 10_484
      || contract.databasePrecondition?.completed !== 5_218
      || contract.databasePrecondition?.pending !== 5_266
      || contract.databasePrecondition?.unresolved !== 5_266) {
    violations.push("pending_snapshot_changed");
  }
  if (contract.databasePrecondition?.legacyCompleted !== 5_218
      || contract.databasePrecondition?.legacyPending !== 48
      || contract.databasePrecondition?.legacyUnresolved !== 48
      || contract.databasePrecondition?.candidateEventPending !== 5_218
      || contract.databasePrecondition?.candidateEventNonPending !== 0
      || contract.databasePrecondition?.candidateEventUnresolved !== 5_218
      || contract.databasePrecondition?.candidateEventOrphans !== 0
      || contract.databasePrecondition?.candidateEventContractMismatches !== 0) {
    violations.push("source_lane_snapshot_changed");
  }
  if (contract.sourceLaneBoundary?.currentProductionExecutable !== true
      || contract.sourceLaneBoundary?.legacySourceLaneMustDrain !== true
      || contract.sourceLaneBoundary?.candidateEventLaneMustRemainPending !== true
      || contract.sourceLaneBoundary?.candidateEventLaneMustRemainUnconsumedByShadowConsumer !== true
      || contract.sourceLaneBoundary?.candidateEventMirrorIntegrityRequired !== true) {
    violations.push("source_lane_boundary_missing");
  }
  if (contract.databasePrecondition?.sourceEpoch !== 2
      || contract.databasePrecondition?.drainEpoch !== 3
      || contract.databasePrecondition?.finalEpoch !== 4) violations.push("epoch_sequence_changed");
  if (contract.successBoundary?.legacyDrainedExact !== 48
      || contract.successBoundary?.legacyCompletedFinal !== 5_266
      || contract.successBoundary?.legacyUnresolvedFinal !== 0
      || contract.successBoundary?.candidateEventPendingFinal !== 5_266
      || contract.successBoundary?.candidateEventNonPendingFinal !== 0
      || contract.successBoundary?.candidateEventOrphansFinal !== 0
      || contract.successBoundary?.candidateEventContractMismatchesFinal !== 0
      || contract.successBoundary?.outboxFinal !== 10_532
      || contract.successBoundary?.globalUnresolvedFinal !== 5_266
      || contract.successBoundary?.controlFinalEpoch !== 4
      || contract.successBoundary?.nextCycleStarted !== false) violations.push("success_boundary_relaxed");
  if (contract.rollback?.automatic !== true || contract.rollback?.refreezeCurrentControl !== true
      || contract.rollback?.deleteOutboxAllowed !== false
      || contract.rollback?.restoreScannerService !== true
      || contract.rollback?.incompleteLeaseRetained !== true
      || contract.rollback?.incompleteLabel !== "ROLLBACK_INCOMPLETE_LEASE_RETAINED"
      || contract.rollback?.invalidReleaseOutcomeAllowed !== false
      || contract.rollback?.resultStatusSingleValued !== true
      || contract.rollback?.productionPassAfterRollback !== false) {
    violations.push("rollback_boundary_relaxed");
  }
  if (contract.execution?.scannerLockWaitSeconds !== 660
      || contract.execution?.baselineHealthWaitSeconds !== 1_200
      || contract.execution?.targetImageBuiltBeforeScannerPause !== true
      || contract.execution?.databaseRunnerImage !== "target_web_image_with_pg"
      || contract.execution?.databaseRunnerModuleRoot !== "/app/package.json") {
    violations.push("scanner_wait_boundary_relaxed");
  }
  if (contract.execution?.databaseJqContractsSingleLine !== true) {
    violations.push("database_jq_contract_boundary_relaxed");
  }
  if (contract.execution?.environmentRendererSourceMount !== "exact_file_read_only"
      || contract.execution?.environmentRendererSourcePath !== "/runtime/env.production"
      || contract.execution?.environmentRendererOutputRoot !== "temporary_ops_only"
      || contract.execution?.environmentRendererLeaseIsolation !== true) {
    violations.push("environment_renderer_boundary_relaxed");
  }
  for (const token of [
    "service_allowlist=web,scanner-worker,candidate-shadow-worker",
    "scanner_lock_still_present", "database_runner preflight", "database_runner open",
    "database_runner close", "database_runner rollback", "CANDIDATE_EPISODE_DRAIN_ONLY=true",
    "PASS_LEGACY_PENDING_DRAINED_AND_REFROZEN", "ROLLBACK_PASS", "wait_baseline_health",
    "wait_for_scan_lock_absent", "ROLLBACK_INCOMPLETE_LEASE_RETAINED", "leaseRetained",
    "readonly PREFLIGHT_CONTRACT_FILTER=", "readonly DRAIN_OPEN_CONTRACT_FILTER=",
    "readonly DRAIN_VERIFY_CONTRACT_FILTER=", '"${PREFLIGHT_CONTRACT_FILTER}"',
    '"${DRAIN_OPEN_CONTRACT_FILTER}"', '"${DRAIN_VERIFY_CONTRACT_FILTER}"',
    '--argjson legacyPending "${EXPECTED_LEGACY_PENDING}"',
    '--argjson drainEpoch "${DRAIN_EPOCH}"',
    "render_drain_environment", "dst=/runtime/env.production,readonly",
    "--source /runtime/env.production", "dst=${OPS_ROOT}",
  ]) if (!runner.includes(token)) violations.push(`runner_guard_missing:${token}`);
  if (runner.includes("jq -e '")) violations.push("database_jq_contract_inlined");
  for (const token of [
    "systemd-run", "RuntimeMaxSec=5400", "validate-request", "prepare-admin-url",
    "temporaryArtifactCleanupRequired", "rm -rf -- \"${SECURE_ROOT}\"",
    "rm -rf -- \"${ACTUAL_ROOT}\"",
  ]) if (!entrypoint.includes(token)) violations.push(`entrypoint_guard_missing:${token}`);
  for (const token of [
    '"close"', '"open"', '"preflight"', '"rollback"', '"snapshot"', '"verify"',
    "EXPECTED_COUNTS", "request_count_invalid:${key}",
    'applicationRoot = "/app"', 'requireCandidate("pg")',
    "legacy_scan_candidate' AND status='pending'", "candidate_episode_event' AND status='pending'",
    "candidate_event_orphans", "candidate_event_contract_mismatches",
  ]) if (!dbRunner.includes(token)) violations.push(`database_guard_missing:${token}`);
  const combined = `${runner}\n${entrypoint}\n${dbRunner}`;
  for (const forbidden of [
    "git reset --hard", "docker volume rm", "DROP TABLE", "TRUNCATE", "DELETE FROM",
    "backtest:formal", "release --outcome ROLLBACK_FAIL",
  ]) if (combined.includes(forbidden)) violations.push(`forbidden_runtime_token:${forbidden}`);
  return violations;
}

export async function validateCandidateLegacyPendingDrainProductionPacket(root = process.cwd()) {
  const [contract, runner, entrypoint, dbRunner, packet] = await Promise.all([
    readFile(resolve(root, CONTRACT), "utf8").then(JSON.parse),
    readFile(resolve(root, RUNNER), "utf8"),
    readFile(resolve(root, ENTRYPOINT), "utf8"),
    readFile(resolve(root, DB_RUNNER), "utf8"),
    validateProductionPacketContract(root),
  ]);
  const violations = [
    ...packet.violations,
    ...evaluatePendingDrainProductionGovernance({ contract, dbRunner, entrypoint, runner }),
  ];
  return {
    status: violations.length === 0 ? "PASS_LOCAL_PENDING_DRAIN_PRODUCTION_PACKET" : "FAIL",
    productionAuthorization: false,
    productionExecuted: false,
    productionPass: false,
    expectedPending: 48,
    expectedOutbox: 10_484,
    finalEpoch: 4,
    runnerArtifactSha256: packet.runnerArtifactSha256,
    violations: [...new Set(violations)],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  validateCandidateLegacyPendingDrainProductionPacket().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.status.startsWith("PASS_")) process.exitCode = 2;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
