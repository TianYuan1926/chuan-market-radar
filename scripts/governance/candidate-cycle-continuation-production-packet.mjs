#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  validateProductionPacketContract,
} from "../production/candidate-cycle-continuation/bundle.mjs";

const CONTRACT = "docs/governance/wp-g0-2-validation-cycle-continuation-production-packet.v1.json";
const RUNNER = "scripts/production/candidate-cycle-continuation/production-runner.sh";
const ENTRYPOINT = "scripts/production/candidate-cycle-continuation/production-entrypoint.sh";
const OBSERVER = "scripts/production/candidate-cycle-continuation/observation-runner.sh";

export function evaluateProductionPacketGovernance({ contract, runner, entrypoint, observer }) {
  const violations = [];
  if (contract.productionAuthorization !== false || contract.productionExecuted !== false
      || contract.currentActivationFinalPass !== false) violations.push("local_truth_overclaimed");
  if (contract.observation?.minimumComparedWrites !== 10_000) violations.push("write_threshold_changed");
  if (contract.prerequisites?.minimumActivationHours !== 24
      || contract.prerequisites?.activationSamplesExact !== 289) violations.push("activation_window_changed");
  if (contract.databaseBoundary?.oldDeadlineMutationAllowed !== false
      || contract.databaseBoundary?.candidateBusinessDataMutationAllowed !== false) {
    violations.push("database_boundary_relaxed");
  }
  for (const token of [
    "control-preflight", "control-continue", "control-rollback", "render-disabled-env",
    "rollbackWebImageRef", "rollbackWorkerImageRef", "service_allowlist=web,candidate-shadow-worker",
    "observation-checkpoint",
  ]) if (!runner.includes(token)) violations.push(`runner_guard_missing:${token}`);
  for (const token of [
    "systemd-run", "RuntimeMaxSec=5400", "validate-request", "prepare-admin-url",
  ]) if (!entrypoint.includes(token)) violations.push(`entrypoint_guard_missing:${token}`);
  for (const token of [
    "PASS_ACCUMULATION_READY_FOR_FRESH_VERIFICATION_CYCLE", "sleep 300",
    "automatic_rollback", "retain_evidence", "cleanup_temporary_artifacts",
  ]) if (!observer.includes(token)) violations.push(`observer_guard_missing:${token}`);
  const combined = `${runner}\n${entrypoint}\n${observer}`;
  for (const forbidden of [
    "scanner-worker", "docker volume rm", "git reset --hard", "DROP TABLE", "TRUNCATE",
    "CANDIDATE_EPISODE_CANONICAL_READ=true", "backtest:formal",
  ]) if (combined.includes(forbidden)) violations.push(`forbidden_runtime_token:${forbidden}`);
  return violations;
}

export async function validateCandidateCycleContinuationProductionPacket(root = process.cwd()) {
  const [contract, runner, entrypoint, observer, packet] = await Promise.all([
    readFile(resolve(root, CONTRACT), "utf8").then(JSON.parse),
    readFile(resolve(root, RUNNER), "utf8"),
    readFile(resolve(root, ENTRYPOINT), "utf8"),
    readFile(resolve(root, OBSERVER), "utf8"),
    validateProductionPacketContract(root),
  ]);
  const violations = [
    ...packet.violations,
    ...evaluateProductionPacketGovernance({ contract, runner, entrypoint, observer }),
  ];
  return {
    status: violations.length === 0
      ? "PASS_LOCAL_CYCLE_CONTINUATION_PRODUCTION_PACKET"
      : "FAIL",
    productionAuthorization: false,
    productionExecuted: false,
    currentActivationFinalPass: false,
    minimumComparedWrites: 10_000,
    activationSamplesExact: 289,
    activationHoursMinimum: 24,
    runnerArtifactSha256: packet.runnerArtifactSha256,
    violations: [...new Set(violations)],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  validateCandidateCycleContinuationProductionPacket().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.status.startsWith("PASS_")) process.exitCode = 2;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
