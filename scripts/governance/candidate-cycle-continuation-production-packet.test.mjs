import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateProductionPacketGovernance,
  validateCandidateCycleContinuationProductionPacket,
} from "./candidate-cycle-continuation-production-packet.mjs";

async function fixture() {
  const [contract, runner, entrypoint, observer] = await Promise.all([
    readFile("docs/governance/wp-g0-2-validation-cycle-continuation-production-packet.v2.json", "utf8").then(JSON.parse),
    readFile("scripts/production/candidate-cycle-continuation/production-runner.sh", "utf8"),
    readFile("scripts/production/candidate-cycle-continuation/production-entrypoint.sh", "utf8"),
    readFile("scripts/production/candidate-cycle-continuation/observation-runner.sh", "utf8"),
  ]);
  return { contract, runner, entrypoint, observer };
}

test("current production packet governance passes without claiming production", async () => {
  const current = await fixture();
  assert.equal(current.contract.prerequisites.currentProductionAuthorityEpoch, 2);
  assert.equal(current.contract.prerequisites.currentProductionMigrationId,
    "candidate-episode-v1-cycle-3");
  const result = await validateCandidateCycleContinuationProductionPacket();
  assert.equal(result.status, "PASS_LOCAL_CYCLE_CONTINUATION_PRODUCTION_PACKET");
  assert.equal(result.productionAuthorization, false);
  assert.equal(result.productionExecuted, false);
  assert.equal(result.priorActivationFinalPass, false);
  assert.deepEqual(result.violations, []);
});

test("threshold lowering deadline relaxation and missing rollback fail governance", async () => {
  const current = await fixture();
  const degraded = {
    ...current,
    contract: {
      ...current.contract,
      observation: {
        ...current.contract.observation,
        minimumComparedWrites: 9_000,
        transientClaimBoundary: {
          ...current.contract.observation.transientClaimBoundary,
          oldestUnresolvedAgeExclusiveMaximumSeconds: 600,
        },
      },
      databaseBoundary: {
        ...current.contract.databaseBoundary,
        oldDeadlineMutationAllowed: true,
      },
      prerequisites: {
        ...current.contract.prerequisites,
        legacySourceUnresolvedMaximum: 2_957,
      },
      cleanup: {
        ...current.contract.cleanup,
        targetImageDeletionRequiresNoContainers: false,
      },
    },
    runner: current.runner.replaceAll("control-rollback", "control-disabled"),
  };
  const violations = evaluateProductionPacketGovernance(degraded);
  assert.ok(violations.includes("write_threshold_changed"));
  assert.ok(violations.includes("database_boundary_relaxed"));
  assert.ok(violations.includes("source_lane_prerequisites_changed"));
  assert.ok(violations.includes("cleanup_boundary_relaxed"));
  assert.ok(violations.includes("transient_claim_boundary_changed"));
  assert.ok(violations.includes("runner_guard_missing:control-rollback"));
});
