import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CONTRACT_PATH,
  evaluateShadowCaptureProductionDecision,
  inspectShadowCaptureRepository,
  validateCurrentShadowCaptureDesign,
  validateShadowCaptureContract,
} from "./shadow-capture-contract.mjs";

async function contractFixture() {
  return JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
}

test("current shadow_capture design passes locally but cannot authorize production", async () => {
  const result = await validateCurrentShadowCaptureDesign();
  assert.equal(result.localDesignStatus, "PASS_LOCAL_DESIGN");
  assert.equal(result.productionDecision, "BLOCKED_NOT_AUTHORIZED");
  assert.equal(result.productionMutationAllowed, false);
  assert.deepEqual(result.contractViolations, []);
  assert.deepEqual(result.repository.violations, []);
  assert.deepEqual(result.blockers, [
    "source_transaction_outbox_hook_missing",
    "outbox_attempt_exhaustion_quarantine_missing",
    "production_runtime_wiring_not_implemented",
    "isolated_postgres_rehearsal_not_passed",
    "new_explicit_production_approval_missing",
  ]);
});

test("repository inspection proves dormant wiring and existing database fences", async () => {
  const { facts, violations } = await inspectShadowCaptureRepository();
  assert.deepEqual(violations, []);
  assert.equal(facts.outboxHasPayloadHashConstraint, true);
  assert.equal(facts.outboxHasIdempotencyUniqueness, true);
  assert.equal(facts.migrationControlHas72HourLimit, true);
  assert.equal(facts.claimRequiresShadowPhaseAndEpoch, true);
  assert.equal(facts.claimUsesSkipLockedAndFencing, true);
  assert.equal(facts.completionRejectsPayloadConflict, true);
  assert.equal(facts.completionRejectsStaleFence, true);
  assert.equal(facts.productionActivationHardDisabled, true);
  assert.equal(facts.outboxServiceExists, true);
  assert.equal(facts.sourceTransactionOutboxHookImplemented, false);
  assert.equal(facts.boundedRetryQuarantineImplemented, false);
  assert.equal(facts.productionRuntimeWiringImplemented, false);
});

test("contract rejects authority, strategy, deadline, retry, and approval weakening", async () => {
  const base = await contractFixture();
  const cases = [
    ["production authorization", { productionAuthorization: true }, /production_authorization/],
    ["authority write", { authority: { ...base.authority, write: "candidate" } }, /authority_write/],
    ["authority read", { authority: { ...base.authority, read: "candidate" } }, /authority_read/],
    ["environment authorization", { authority: { ...base.authority, environmentFlagMayAuthorize: true } }, /environment_flag_authority/],
    ["ranking mutation", { transactionBoundary: { ...base.transactionBoundary, shadowConsumerMutatesRanking: true } }, /shadowConsumerMutatesRanking/],
    ["strategy mutation", { transactionBoundary: { ...base.transactionBoundary, shadowConsumerMutatesStrategy: true } }, /shadowConsumerMutatesStrategy/],
    ["RR mutation", { transactionBoundary: { ...base.transactionBoundary, shadowConsumerMutatesReadyOrRiskReward: true } }, /shadowConsumerMutatesReadyOrRiskReward/],
    ["Redis authority", { transactionBoundary: { ...base.transactionBoundary, redisIsCorrectnessBoundary: true } }, /redisIsCorrectnessBoundary/],
    ["hash conflict softening", { idempotencyAndConcurrency: { ...base.idempotencyAndConcurrency, sameIdempotencyKeyDifferentHash: "retry" } }, /idempotency_conflict/],
    ["missing fence", { idempotencyAndConcurrency: { ...base.idempotencyAndConcurrency, fencingTokenRequired: false } }, /fencing_token_required/],
    ["unbounded retry", { failureIsolation: { ...base.failureIsolation, retryPolicy: "unbounded" } }, /retry_policy/],
    ["attempt increase", { failureIsolation: { ...base.failureIsolation, maximumAttempts: 80 } }, /maximum_attempts/],
    ["deadline extension", { timeBounds: { ...base.timeBounds, dualProjectionMaximumHours: 168 } }, /dual_projection_hours/],
    ["deadline reset", { timeBounds: { ...base.timeBounds, deadlineResetAllowed: true } }, /deadline_reset_allowed/],
    ["write threshold reduction", { timeBounds: { ...base.timeBounds, minimumComparedWrites: 9999 } }, /minimum_compared_writes/],
    ["blocker removal", { productionBlockers: base.productionBlockers.slice(1) }, /production_blockers_changed/],
    ["forbidden action removal", { forbiddenInThisPackage: base.forbiddenInThisPackage.slice(1) }, /forbidden_actions_changed/],
  ];

  for (const [name, mutation, expected] of cases) {
    const violations = validateShadowCaptureContract({ ...base, ...mutation });
    assert.match(violations.join("\n"), expected, name);
  }
});

test("malformed contract and failed repository inspection fail closed", async () => {
  assert.deepEqual(validateShadowCaptureContract(null), ["contract_not_object"]);
  const decision = evaluateShadowCaptureProductionDecision(
    ["contract_broken"],
    { violations: ["repository_broken"] },
  );
  assert.equal(decision.localDesignStatus, "FAIL_LOCAL_DESIGN");
  assert.equal(decision.productionDecision, "BLOCKED_NOT_AUTHORIZED");
  assert.equal(decision.productionMutationAllowed, false);
  assert.deepEqual(decision.blockers, [
    "local_contract_validation_failed",
    "contract_broken",
    "repository_broken",
  ]);
});
