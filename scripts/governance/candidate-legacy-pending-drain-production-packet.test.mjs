import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluatePendingDrainProductionGovernance,
  validateCandidateLegacyPendingDrainProductionPacket,
} from "./candidate-legacy-pending-drain-production-packet.mjs";

const root = process.cwd();

test("production pending drain packet passes its frozen local governance", async () => {
  const result = await validateCandidateLegacyPendingDrainProductionPacket(root);
  assert.equal(result.status, "PASS_LOCAL_PENDING_DRAIN_PRODUCTION_PACKET");
  assert.equal(result.productionExecuted, false);
  assert.equal(result.productionPass, false);
  assert.equal(result.expectedPending, 48);
  assert.equal(result.finalEpoch, 4);
  assert.deepEqual(result.violations, []);
});

test("governance rejects count, epoch, rollback, or runner guard weakening", async () => {
  const [contract, runner, entrypoint, dbRunner] = await Promise.all([
    readFile("docs/governance/wp-g0-2-cycle-6-legacy-pending-drain-production-packet.v2.json", "utf8")
      .then(JSON.parse),
    readFile("scripts/production/candidate-legacy-pending-drain-production/production-runner.sh", "utf8"),
    readFile("scripts/production/candidate-legacy-pending-drain-production/production-entrypoint.sh", "utf8"),
    readFile("scripts/production/candidate-legacy-pending-drain-production/db-runner.mjs", "utf8"),
  ]);
  const weakened = structuredClone(contract);
  weakened.databasePrecondition.pending = 5_265;
  weakened.databasePrecondition.finalEpoch = 3;
  weakened.rollback.automatic = false;
  weakened.execution.baselineHealthWaitSeconds = 600;
  weakened.execution.databaseRunnerModuleRoot = "/packet/package.json";
  weakened.execution.databaseJqContractsSingleLine = false;
  const weakenedRunner = runner
    .replace("scanner_lock_still_present", "lock-check-removed")
    .replace('"${PREFLIGHT_CONTRACT_FILTER}"', '".status == \\\"PASS\\\""')
    + "\njq -e '.status == \\\"PASS\\\"'\n";
  const violations = evaluatePendingDrainProductionGovernance({
    contract: weakened,
    dbRunner,
    entrypoint,
    runner: weakenedRunner,
  });
  assert.ok(violations.includes("pending_snapshot_changed"));
  assert.ok(violations.includes("epoch_sequence_changed"));
  assert.ok(violations.includes("rollback_boundary_relaxed"));
  assert.ok(violations.includes("scanner_wait_boundary_relaxed"));
  assert.ok(violations.includes("database_jq_contract_boundary_relaxed"));
  assert.ok(violations.includes('runner_guard_missing:"${PREFLIGHT_CONTRACT_FILTER}"'));
  assert.ok(violations.includes("database_jq_contract_inlined"));
  assert.ok(violations.includes("runner_guard_missing:scanner_lock_still_present"));
});
