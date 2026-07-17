#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  validateProductionPacketContract,
} from "../production/candidate-legacy-pending-drain-production/bundle.mjs";

const CONTRACT = "docs/governance/wp-g0-2-legacy-pending-drain-production-packet.v1.json";
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
  if (contract.databasePrecondition?.outbox !== 5_914
      || contract.databasePrecondition?.completed !== 2_957
      || contract.databasePrecondition?.pending !== 2_957
      || contract.databasePrecondition?.unresolved !== 2_957) {
    violations.push("pending_snapshot_changed");
  }
  if (contract.databasePrecondition?.sourceEpoch !== 4
      || contract.databasePrecondition?.drainEpoch !== 5
      || contract.databasePrecondition?.finalEpoch !== 6) violations.push("epoch_sequence_changed");
  if (contract.successBoundary?.outboxTotalUnchanged !== true
      || contract.successBoundary?.completedFinal !== 5_914
      || contract.successBoundary?.unresolvedFinal !== 0
      || contract.successBoundary?.controlFinalEpoch !== 6
      || contract.successBoundary?.cycle2Started !== false) violations.push("success_boundary_relaxed");
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
      || contract.execution?.baselineHealthWaitSeconds !== 1_200) {
    violations.push("scanner_wait_boundary_relaxed");
  }
  for (const token of [
    "service_allowlist=web,scanner-worker,candidate-shadow-worker",
    "scanner_lock_still_present", "database_runner preflight", "database_runner open",
    "database_runner close", "database_runner rollback", "CANDIDATE_EPISODE_DRAIN_ONLY=true",
    "PASS_LEGACY_PENDING_DRAINED_AND_REFROZEN", "ROLLBACK_PASS", "wait_baseline_health",
    "wait_for_scan_lock_absent", "ROLLBACK_INCOMPLETE_LEASE_RETAINED", "leaseRetained",
  ]) if (!runner.includes(token)) violations.push(`runner_guard_missing:${token}`);
  for (const token of [
    "systemd-run", "RuntimeMaxSec=5400", "validate-request", "prepare-admin-url",
    "temporaryArtifactCleanupRequired", "rm -rf -- \"${SECURE_ROOT}\"",
    "rm -rf -- \"${ACTUAL_ROOT}\"",
  ]) if (!entrypoint.includes(token)) violations.push(`entrypoint_guard_missing:${token}`);
  for (const token of [
    '"close"', '"open"', '"preflight"', '"rollback"', '"snapshot"', '"verify"',
    "expectedCounts?.outbox === 5_914", "expectedCounts?.pending === 2_957",
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
    expectedPending: 2_957,
    expectedOutbox: 5_914,
    finalEpoch: 6,
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
