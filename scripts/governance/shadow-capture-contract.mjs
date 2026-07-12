#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
export const CONTRACT_PATH = resolve(
  ROOT,
  "docs/governance/wp-g0-2-shadow-capture-contract.v1.json",
);

const REQUIRED_BLOCKERS = [
  "shadow_safety_migration_not_approved_or_applied_in_production",
  "quarantine_resolution_workflow_not_implemented",
  "production_runtime_wiring_not_implemented",
  "new_explicit_production_approval_missing",
];

const REQUIRED_FORBIDDEN_ACTIONS = [
  "production_connection",
  "production_database_write",
  "production_migration_execute",
  "candidate_feature_flag_enablement",
  "backfill",
  "dual_read",
  "read_cutover",
  "legacy_authority_change",
  "scan_ranking_change",
  "analysis_change",
  "strategy_change",
  "frontend_change",
  "formal_backtest",
];

function exactArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function requireValue(violations, actual, expected, name) {
  if (actual !== expected) violations.push(`${name}:expected_${String(expected)}`);
}

export function validateShadowCaptureContract(contract) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    return ["contract_not_object"];
  }

  const violations = [];
  requireValue(violations, contract.schemaVersion, "wp-g0.2-shadow-capture-contract.v1", "schema_version");
  requireValue(violations, contract.packageId, "WP-G0.2-SHADOW-CAPTURE-LOCAL-IMPLEMENTATION-AND-POSTGRES-REHEARSAL", "package_id");
  requireValue(violations, contract.status, "local_implementation_rehearsed_production_blocked", "status");
  requireValue(violations, contract.scope, "production_radar", "scope");
  requireValue(violations, contract.productionAuthorization, false, "production_authorization");

  requireValue(violations, contract.authority?.write, "legacy", "authority_write");
  requireValue(violations, contract.authority?.read, "legacy", "authority_read");
  requireValue(violations, contract.authority?.secondaryProjection, "legacy_to_candidate_episode", "secondary_projection");
  requireValue(violations, contract.authority?.authoritySource, "candidate_authority.candidate_migration_control", "authority_source");
  requireValue(violations, contract.authority?.requiredPhase, "shadow_capture", "required_phase");
  requireValue(violations, contract.authority?.environmentFlagMayAuthorize, false, "environment_flag_authority");
  requireValue(violations, contract.authority?.environmentFlagIsAdditionalKillSwitchOnly, true, "environment_flag_kill_switch");
  requireValue(violations, contract.authority?.consumerSeesCommittedSourceOnly, true, "committed_source_only");

  const boundary = contract.transactionBoundary ?? {};
  requireValue(violations, boundary.legacyWriteAndOutboxInsertSameConnectionTransaction, true, "source_outbox_atomicity");
  for (const field of [
    "shadowConsumerWritesLegacy",
    "shadowConsumerMutatesRanking",
    "shadowConsumerMutatesAnalysis",
    "shadowConsumerMutatesStrategy",
    "shadowConsumerMutatesReadyOrRiskReward",
    "shadowConsumerMutatesFrontend",
    "redisIsCorrectnessBoundary",
  ]) {
    requireValue(violations, boundary[field], false, field);
  }

  const concurrency = contract.idempotencyAndConcurrency ?? {};
  requireValue(violations, concurrency.scope, "production_radar", "outbox_scope");
  requireValue(violations, concurrency.payloadHashAlgorithm, "sha256", "payload_hash_algorithm");
  requireValue(violations, concurrency.sameIdempotencyKeyDifferentHash, "hard_stop", "idempotency_conflict");
  requireValue(violations, concurrency.claimLeaseSeconds, 300, "claim_lease_seconds");
  requireValue(violations, concurrency.claimBatchMaximum, 100, "claim_batch_maximum");
  requireValue(violations, concurrency.authorityEpochRequired, true, "authority_epoch_required");
  requireValue(violations, concurrency.fencingTokenRequired, true, "fencing_token_required");
  requireValue(violations, concurrency.expiredOrStaleClaim, "reject", "stale_claim_policy");
  requireValue(violations, concurrency.completedItemReplay, "idempotent_noop", "completed_replay_policy");

  const failure = contract.failureIsolation ?? {};
  requireValue(violations, failure.legacyCommitShadowFailure, "retain_retryable_outbox_and_alert", "legacy_commit_shadow_failure");
  requireValue(violations, failure.shadowSuccessLegacyFailure, "impossible_committed_source_only", "shadow_success_legacy_failure");
  requireValue(violations, failure.retryPolicy, "bounded_exponential_backoff", "retry_policy");
  requireValue(violations, failure.maximumAttempts, 8, "maximum_attempts");
  requireValue(violations, failure.attemptExhaustion, "quarantine_and_block_phase_advance", "attempt_exhaustion");
  requireValue(violations, failure.payloadHashConflict, "halt_consumer_and_alert_p0", "payload_hash_conflict");

  const time = contract.timeBounds ?? {};
  requireValue(violations, time.dualProjectionMaximumHours, 72, "dual_projection_hours");
  requireValue(violations, time.deadlineResetAllowed, false, "deadline_reset_allowed");
  requireValue(violations, time.cleanWindowMinimumHours, 24, "clean_window_hours");
  requireValue(violations, time.minimumComparedWrites, 10000, "minimum_compared_writes");
  requireValue(violations, time.cutoverWriteFreezeMaximumSeconds, 120, "write_freeze_seconds");

  const facts = contract.implementationFacts ?? {};
  requireValue(violations, facts.candidateSchemaAppliedVerifiedDormant, true, "candidate_schema_fact");
  requireValue(violations, facts.candidateFeatureFlagsEnabledInProduction, false, "production_flag_fact");
  requireValue(violations, facts.sourceTransactionOutboxHookImplemented, true, "sourceTransactionOutboxHookImplemented");
  requireValue(violations, facts.boundedRetryQuarantineImplemented, true, "boundedRetryQuarantineImplemented");
  requireValue(violations, facts.productionRuntimeWiringImplemented, false, "productionRuntimeWiringImplemented");
  requireValue(violations, facts.isolatedPostgresRehearsalPassed, true, "isolatedPostgresRehearsalPassed");
  requireValue(violations, facts.shadowSafetyMigrationAppliedInProduction, false, "shadowSafetyMigrationAppliedInProduction");
  requireValue(violations, facts.quarantineResolutionWorkflowImplemented, false, "quarantineResolutionWorkflowImplemented");

  if (!exactArray(contract.productionBlockers, REQUIRED_BLOCKERS)) {
    violations.push("production_blockers_changed");
  }
  if (!exactArray(contract.forbiddenInThisPackage, REQUIRED_FORBIDDEN_ACTIONS)) {
    violations.push("forbidden_actions_changed");
  }
  requireValue(
    violations,
    contract.nextRequiredPackage,
    "WP-G0.2-SHADOW-CAPTURE-PRODUCTION-READINESS-AND-APPROVAL-PACKET",
    "next_required_package",
  );

  return [...new Set(violations)];
}

async function read(relativePath) {
  return readFile(resolve(ROOT, relativePath), "utf8");
}

async function sourceFilesUnder(relativePath) {
  const root = resolve(ROOT, relativePath);
  const entries = await readdir(root, { recursive: true });
  return entries.filter((entry) => /\.(?:ts|tsx|mjs)$/.test(entry));
}

export async function inspectShadowCaptureRepository() {
  const [outboxDdl, procedures, shadowSafety, flags, sourceWriter, consumer, outboxService, rehearsal] = await Promise.all([
    read("migrations/candidate-episode/005_candidate_episode_outbox.sql"),
    read("migrations/candidate-episode/008_candidate_constraints_and_procedures.sql"),
    read("migrations/candidate-episode/009_candidate_shadow_capture_safety.sql"),
    read("src/lib/candidate-episode/feature-flags.ts"),
    read("src/lib/candidate-episode/shadow-capture-source.ts"),
    read("src/lib/candidate-episode/shadow-capture-consumer.ts"),
    read("src/lib/candidate-episode/outbox-service.ts"),
    read("scripts/rehearsal/shadow-capture-postgres16.sh"),
  ]);
  const runtimeRoots = ["src/app/api", "deploy/workers"];
  const runtimeSources = [];
  for (const root of runtimeRoots) {
    for (const relative of await sourceFilesUnder(root)) {
      runtimeSources.push(await read(`${root}/${relative}`));
    }
  }

  const facts = {
    outboxHasPayloadHashConstraint: /payload_hash text NOT NULL CHECK \(payload_hash ~ '\^sha256:\[0-9a-f\]\{64\}\$'\)/.test(outboxDdl),
    outboxHasIdempotencyUniqueness: /UNIQUE \(scope, idempotency_key\)/.test(outboxDdl),
    migrationControlHas72HourLimit: /deadline_at <= started_at \+ interval '72 hours'/.test(outboxDdl),
    claimRequiresShadowPhaseAndEpoch: /control_row\.phase NOT IN \('shadow_capture','shadow_verify','canonical_compat'\)/.test(procedures)
      && /control_row\.epoch <> p_expected_epoch/.test(procedures),
    claimUsesSkipLockedAndFencing: /FOR UPDATE SKIP LOCKED/.test(procedures)
      && /fencing_token = item\.fencing_token \+ 1/.test(procedures),
    completionRejectsPayloadConflict: /outbox payload hash conflict/.test(procedures),
    completionRejectsStaleFence: /stale outbox fencing token rejected/.test(procedures),
    productionActivationHardDisabled: /CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED = false as const/.test(flags),
    outboxServiceExists: /class CandidateOutboxService/.test(outboxService),
    sourceTransactionOutboxHookImplemented: /transactions\.withTransaction/.test(sourceWriter)
      && /INSERT INTO scan_archives/i.test(sourceWriter)
      && /enqueue_shadow_candidate_outbox_v2/.test(sourceWriter),
    boundedRetryQuarantineImplemented: /max_attempts/.test(shadowSafety)
      && /status = 'quarantined'/.test(shadowSafety)
      && /unresolved shadow outbox blocks phase advance/.test(shadowSafety),
    authorityEpochUsesDatabaseLockAndDeadline: /FOR SHARE/.test(shadowSafety)
      && /clock_timestamp\(\) > control_row\.deadline_at/.test(shadowSafety),
    sourceClaimFiltered: /source_type = 'legacy_scan_candidate'/.test(shadowSafety),
    scanSourceCandidateOnlyBoundary:
      /const allowedMaturities = new Set<CandidateMaturity>\(\[\s*"light_candidate",\s*"deep_candidate",\s*\]\)/.test(sourceWriter)
      && /const allowedDirections = new Set<CandidateDirectionState>\(\[\s*"neutral",\s*"unknown",\s*\]\)/.test(sourceWriter),
    consumerHasHardStop: /ShadowCaptureHardStopError/.test(consumer),
    isolatedPostgresRehearsalImplemented: /initdb/.test(rehearsal)
      && /shadow-capture-postgres-rehearsal\.test\.js/.test(rehearsal),
    productionRuntimeWiringImplemented: runtimeSources.some((source) => (
      /candidate-episode\/(?:outbox-service|shadow-capture-source|shadow-capture-consumer)/.test(source)
      || /Candidate(?:OutboxService|ShadowCaptureSourceWriter|ShadowCaptureConsumer)/.test(source)
    )),
  };

  const violations = [];
  for (const field of [
    "outboxHasPayloadHashConstraint",
    "outboxHasIdempotencyUniqueness",
    "migrationControlHas72HourLimit",
    "claimRequiresShadowPhaseAndEpoch",
    "claimUsesSkipLockedAndFencing",
    "completionRejectsPayloadConflict",
    "completionRejectsStaleFence",
    "productionActivationHardDisabled",
    "outboxServiceExists",
    "sourceTransactionOutboxHookImplemented",
    "boundedRetryQuarantineImplemented",
    "authorityEpochUsesDatabaseLockAndDeadline",
    "sourceClaimFiltered",
    "scanSourceCandidateOnlyBoundary",
    "consumerHasHardStop",
    "isolatedPostgresRehearsalImplemented",
  ]) {
    if (!facts[field]) violations.push(`repository_guard_missing:${field}`);
  }
  if (facts.productionRuntimeWiringImplemented) violations.push("unexpected_production_runtime_wiring_present");

  return { facts, violations };
}

export function evaluateShadowCaptureProductionDecision(contractViolations, repositoryInspection) {
  const validationViolations = [
    ...contractViolations,
    ...(repositoryInspection?.violations ?? ["repository_inspection_missing"]),
  ];
  const blockers = validationViolations.length === 0 ? [...REQUIRED_BLOCKERS] : [
    "local_contract_validation_failed",
    ...validationViolations,
  ];
  return {
    localDesignStatus: validationViolations.length === 0
      ? "PASS_LOCAL_IMPLEMENTATION_AND_REHEARSAL"
      : "FAIL_LOCAL_IMPLEMENTATION_AND_REHEARSAL",
    productionDecision: "BLOCKED_NOT_AUTHORIZED",
    productionMutationAllowed: false,
    blockers,
    nextRequiredPackage: "WP-G0.2-SHADOW-CAPTURE-PRODUCTION-READINESS-AND-APPROVAL-PACKET",
  };
}

export async function validateCurrentShadowCaptureDesign() {
  const contract = JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
  const contractViolations = validateShadowCaptureContract(contract);
  const repository = await inspectShadowCaptureRepository();
  return {
    schemaVersion: "wp-g0.2-shadow-capture-validation-result.v1",
    ...evaluateShadowCaptureProductionDecision(contractViolations, repository),
    contractViolations,
    repository,
  };
}

async function main() {
  const result = await validateCurrentShadowCaptureDesign();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.localDesignStatus !== "PASS_LOCAL_IMPLEMENTATION_AND_REHEARSAL") process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
