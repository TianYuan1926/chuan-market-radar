import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  READINESS_CONTRACT_PATH,
  evaluateShadowCaptureReadiness,
  inspectShadowCaptureReadinessRepository,
  validateCurrentShadowCaptureReadiness,
  validateShadowCaptureReadinessContract,
} from "./shadow-capture-readiness.mjs";

async function fixture() {
  return JSON.parse(await readFile(READINESS_CONTRACT_PATH, "utf8"));
}

test("current production readiness packet passes locally but cannot mutate production", async () => {
  const result = await validateCurrentShadowCaptureReadiness();
  assert.equal(result.readinessStatus, "PASS_PRODUCTION_READINESS_PACKET");
  assert.equal(result.productionDecision, "BLOCKED_AWAITING_EXPLICIT_APPROVAL");
  assert.equal(result.productionMutationAllowed, false);
  assert.deepEqual(result.contractViolations, []);
  assert.deepEqual(result.repository.violations, []);
  assert.deepEqual(result.blockers, [
    "shadow_safety_schema_not_applied_in_production",
    "production_runtime_wiring_not_deployed",
    "new_explicit_production_approval_missing",
  ]);
});

test("repository inspection locks checksum, immutable resolution, runtime gate and dormant boundary", async () => {
  const contract = await fixture();
  const { facts, violations } = await inspectShadowCaptureReadinessRepository(contract);
  assert.deepEqual(violations, []);
  for (const field of [
    "migrationChecksumLocked",
    "migrationAdditiveOnly",
    "migrationDoesNotMutateLegacy",
    "migrationDoesNotEnableFlags",
    "immutableResolutionLedger",
    "approvedResolutionProcedure",
    "migrationRoleOnlyResolution",
    "databaseClockLifecycle",
    "unresolvedBlocksAdvance",
    "phaseStateMachine",
    "resolutionServiceValidatesPayload",
    "runtimeFailClosed",
    "runtimeCanonicalMapping",
    "monitorReadOnly",
    "productionActivationHardDisabled",
  ]) assert.equal(facts[field], true, field);
  assert.equal(facts.productionRuntimeWired, false);
});

test("contract rejects authorization, rollback, monitoring and approval weakening", async () => {
  const base = await fixture();
  const cases = [
    [{ productionAuthorization: true }, /production_authorization/],
    [{ authority: { ...base.authority, environmentFlagMayAuthorize: true } }, /environment_authority/],
    [{ migrationArtifact: { ...base.migrationArtifact, legacyMutationAllowed: true } }, /legacy_mutation_allowed/],
    [{ migrationArtifact: { ...base.migrationArtifact, destructiveRollbackAllowed: true } }, /destructive_rollback_allowed/],
    [{ quarantineResolution: { ...base.quarantineResolution, originalTerminalItemMutable: true } }, /originalTerminalItemMutable/],
    [{ quarantineResolution: { ...base.quarantineResolution, allowedActions: ["skip"] } }, /quarantine_actions_changed/],
    [{ runtimeReadiness: { ...base.runtimeReadiness, unresolvedIdentityMayBeGuessed: true } }, /identity_guessing/],
    [{ runtimeReadiness: { ...base.runtimeReadiness, productionCompositionWired: true } }, /production_composition_wired/],
    [{ observability: { ...base.observability, oldestPendingCriticalSeconds: 3600 } }, /pending_critical/],
    [{ observability: { ...base.observability, payloadOrSecretInMetrics: true } }, /metric_payload_secret/],
    [{ rollback: { ...base.rollback, dropTableOrDeleteEvidence: true } }, /destructive_rollback/],
    [{ approvalRequirements: { ...base.approvalRequirements, maximumWindowMinutes: 1440 } }, /approval_window_minutes/],
    [{ approvalRequirements: { ...base.approvalRequirements, runtimeDeploymentAllowed: true } }, /runtime_deployment_allowed/],
    [{ productionBlockers: base.productionBlockers.slice(1) }, /production_blockers_changed/],
    [{ forbiddenInThisPackage: base.forbiddenInThisPackage.slice(1) }, /forbidden_actions_changed/],
  ];
  for (const [mutation, expected] of cases) {
    assert.match(
      validateShadowCaptureReadinessContract({ ...base, ...mutation }).join("\n"),
      expected,
    );
  }
});

test("malformed or failed repository evidence keeps production blocked", () => {
  assert.deepEqual(validateShadowCaptureReadinessContract(null), ["contract_not_object"]);
  const result = evaluateShadowCaptureReadiness(
    ["contract_broken"],
    { violations: ["repository_broken"] },
  );
  assert.equal(result.readinessStatus, "FAIL_PRODUCTION_READINESS_PACKET");
  assert.equal(result.productionMutationAllowed, false);
  assert.deepEqual(result.blockers, [
    "local_readiness_validation_failed",
    "contract_broken",
    "repository_broken",
  ]);
});
