#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
export const READINESS_CONTRACT_PATH = resolve(
  ROOT,
  "docs/governance/wp-g0-2-shadow-capture-production-readiness.v1.json",
);

const EXPECTED_ACTIONS = ["replay_after_approved_fix", "exclude_invalid_source"];
const EXPECTED_BLOCKERS = [
  "shadow_safety_schema_not_applied_in_production",
  "production_runtime_wiring_not_deployed",
  "new_explicit_production_approval_missing",
];
const EXPECTED_FORBIDDEN = [
  "production_connection",
  "production_database_write",
  "production_migration_execute",
  "candidate_feature_flag_enablement",
  "runtime_deployment",
  "shadow_writer_activation",
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

function requireValue(violations, actual, expected, field) {
  if (actual !== expected) violations.push(`${field}:expected_${String(expected)}`);
}

function exactArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

export function validateShadowCaptureReadinessContract(contract) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    return ["contract_not_object"];
  }
  const violations = [];
  requireValue(violations, contract.schemaVersion, "wp-g0.2-shadow-capture-production-readiness.v1", "schema_version");
  requireValue(violations, contract.packageId, "WP-G0.2-SHADOW-CAPTURE-PRODUCTION-READINESS-AND-APPROVAL-PACKET", "package_id");
  requireValue(violations, contract.status, "production_readiness_locally_verified_approval_missing", "status");
  requireValue(violations, contract.scope, "production_radar", "scope");
  requireValue(violations, contract.productionAuthorization, false, "production_authorization");

  requireValue(violations, contract.authority?.write, "legacy", "authority_write");
  requireValue(violations, contract.authority?.read, "legacy", "authority_read");
  requireValue(violations, contract.authority?.environmentFlagMayAuthorize, false, "environment_authority");
  requireValue(violations, contract.authority?.databaseControlRequired, true, "database_control_required");
  requireValue(violations, contract.authority?.codeReleaseAuthorizationRequired, true, "code_authorization_required");
  requireValue(violations, contract.authority?.environmentFlagIsAdditionalKillSwitchOnly, true, "environment_kill_switch_only");

  const migration = contract.migrationArtifact ?? {};
  requireValue(violations, migration.filename, "009_candidate_shadow_capture_safety.sql", "migration_filename");
  if (!/^[a-f0-9]{64}$/.test(migration.sha256 ?? "")) violations.push("migration_checksum_invalid");
  requireValue(violations, migration.productionApplied, false, "migration_production_applied");
  requireValue(violations, migration.legacyMutationAllowed, false, "legacy_mutation_allowed");
  requireValue(violations, migration.destructiveRollbackAllowed, false, "destructive_rollback_allowed");
  requireValue(violations, migration.applyMode, "single_transaction_ledgered_additive", "migration_apply_mode");
  requireValue(violations, migration.nextProductionPackageScope, "schema_only_dormant", "next_production_scope");

  const quarantine = contract.quarantineResolution ?? {};
  for (const field of [
    "implemented",
    "approvalDigestRequired",
    "databaseActorRecorded",
    "replacementUsesNewOutboxItem",
    "unresolvedItemsBlockPhaseAdvance",
  ]) requireValue(violations, quarantine[field], true, field);
  for (const field of ["originalTerminalItemMutable", "ledgerMutable"]) {
    requireValue(violations, quarantine[field], false, field);
  }
  if (!exactArray(quarantine.allowedActions, EXPECTED_ACTIONS)) {
    violations.push("quarantine_actions_changed");
  }

  const runtime = contract.runtimeReadiness ?? {};
  requireValue(violations, runtime.failClosedGateImplemented, true, "runtime_gate");
  requireValue(violations, runtime.canonicalVenueMapperImplemented, true, "canonical_mapper");
  requireValue(violations, runtime.unresolvedIdentityMayBeGuessed, false, "identity_guessing");
  requireValue(violations, runtime.tradeDirectionCopiedFromAnalysis, false, "analysis_direction_copy");
  requireValue(violations, runtime.productionCompositionWired, false, "production_composition_wired");
  requireValue(violations, runtime.productionActivationHardDisabled, true, "production_activation_disabled");
  requireValue(violations, runtime.productionFeatureFlagEnabled, false, "production_feature_flag");

  const observability = contract.observability ?? {};
  requireValue(violations, observability.readOnlyMonitorImplemented, true, "readonly_monitor");
  requireValue(violations, observability.oldestPendingWarningSeconds, 300, "pending_warning");
  requireValue(violations, observability.oldestPendingCriticalSeconds, 600, "pending_critical");
  requireValue(violations, observability.unresolvedQuarantineCritical, 1, "quarantine_critical");
  requireValue(violations, observability.payloadOrSecretInMetrics, false, "metric_payload_secret");

  const rollback = contract.rollback ?? {};
  for (const field of [
    "disableKillSwitchFirst",
    "stopConsumer",
    "transitionToLegacyBeforeDeadlineOrAfterFailure",
    "preserveSchemaAndEvidence",
    "legacyAuthorityRemainsCanonical",
  ]) requireValue(violations, rollback[field], true, field);
  requireValue(violations, rollback.dropTableOrDeleteEvidence, false, "destructive_rollback");

  const approval = contract.approvalRequirements ?? {};
  for (const field of [
    "explicitUserApprovalRequired",
    "sourceCommitMustEqualReviewedGitHubMain",
    "migrationChecksumMustMatch",
    "freshBackupAndRestoreEvidenceRequired",
    "freshCapacityGateRequired",
    "freshProductionHealthRequired",
    "featureFlagsMustRemainFalse",
  ]) requireValue(violations, approval[field], true, field);
  requireValue(violations, approval.maximumWindowMinutes, 90, "approval_window_minutes");
  requireValue(violations, approval.runtimeDeploymentAllowed, false, "runtime_deployment_allowed");
  requireValue(violations, approval.shadowWriterActivationAllowed, false, "shadow_writer_allowed");

  if (!exactArray(contract.productionBlockers, EXPECTED_BLOCKERS)) {
    violations.push("production_blockers_changed");
  }
  if (!exactArray(contract.forbiddenInThisPackage, EXPECTED_FORBIDDEN)) {
    violations.push("forbidden_actions_changed");
  }
  requireValue(violations, contract.nextRequiredPackage, "WP-G0.2-SHADOW-CAPTURE-PRODUCTION-ADD-SAFETY-SCHEMA", "next_package");
  return [...new Set(violations)];
}

async function read(relativePath) {
  return readFile(resolve(ROOT, relativePath), "utf8");
}

async function runtimeSources() {
  const sources = [];
  for (const root of ["src/app/api", "deploy/workers"]) {
    const entries = await readdir(resolve(ROOT, root), { recursive: true });
    for (const entry of entries.filter((name) => /\.(?:ts|tsx|mjs)$/.test(name))) {
      sources.push(await read(`${root}/${entry}`));
    }
  }
  return sources;
}

export async function inspectShadowCaptureReadinessRepository(contract) {
  const [migration, resolution, runtime, monitor, flags, productionSources] = await Promise.all([
    read("migrations/candidate-episode/009_candidate_shadow_capture_safety.sql"),
    read("src/lib/candidate-episode/quarantine-resolution-service.ts"),
    read("src/lib/candidate-episode/shadow-capture-runtime.ts"),
    read("src/lib/candidate-episode/shadow-capture-monitor.ts"),
    read("src/lib/candidate-episode/feature-flags.ts"),
    runtimeSources(),
  ]);
  const checksum = createHash("sha256").update(migration).digest("hex");
  const productionRuntimeWired = productionSources.some((source) => (
    /candidate-episode\/(?:shadow-capture-runtime|shadow-capture-source|shadow-capture-consumer)/.test(source)
  ));
  const facts = {
    migrationChecksum: checksum,
    migrationChecksumLocked: checksum === contract.migrationArtifact?.sha256,
    migrationAdditiveOnly: !/\b(?:DROP\s+(?:TABLE|SCHEMA|DATABASE)|TRUNCATE)\b/i.test(migration),
    migrationDoesNotMutateLegacy: !/\b(?:ALTER|UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+(?:public\.)?(?:scan_archives|journal_events|scan_asset_states)\b/i.test(migration),
    migrationDoesNotEnableFlags: !/CANDIDATE_EPISODE_(?:SHADOW_WRITE|CANONICAL_WRITE|DUAL_READ|CANONICAL_READ|REVIEW_READ)/.test(migration),
    immutableResolutionLedger: /CREATE TABLE IF NOT EXISTS candidate_authority\.candidate_outbox_quarantine_resolutions/.test(migration)
      && /candidate_outbox_quarantine_resolution_immutable_v3/.test(migration)
      && /BEFORE UPDATE OR DELETE/.test(migration),
    approvedResolutionProcedure: /resolve_shadow_outbox_quarantine_v3/.test(migration)
      && /p_approval_digest !~ '\^sha256:\[0-9a-f\]\{64\}\$'/.test(migration)
      && /session_user, clock_timestamp\(\)/.test(migration)
      && /shadow-quarantine-resolution:/.test(migration),
    migrationRoleOnlyResolution: /resolve_shadow_outbox_quarantine_v3\([\s\S]*?\) TO candidate_migration_role;/.test(migration),
    databaseClockLifecycle: /start_shadow_capture_v3/.test(migration)
      && /started_at_value \+ interval '72 hours'/.test(migration)
      && /migration lifecycle cannot be restarted/.test(migration),
    unresolvedBlocksAdvance: /status <> 'completed'/.test(migration)
      && /unresolved shadow outbox blocks phase advance/.test(migration),
    phaseStateMachine: /illegal candidate migration phase transition/.test(migration),
    resolutionServiceValidatesPayload: /validateShadowCandidateObservation/.test(resolution)
      && /hashShadowCandidatePayload/.test(resolution),
    runtimeFailClosed: /evaluateCurrentShadowCaptureRuntimeGate/.test(runtime)
      && /CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED/.test(runtime)
      && /database_repository_required/.test(runtime)
      && /migration_deadline_expired/.test(runtime)
      && /release_mismatch/.test(runtime),
    runtimeCanonicalMapping: /canonicalInstrumentId: instrument\.id/.test(runtime)
      && /directionState: "unknown"/.test(runtime)
      && /instrument_identity_unresolved/.test(runtime),
    monitorReadOnly: /readOnly: true/.test(monitor)
      && /oldestPendingWarningSeconds: 300/.test(monitor)
      && /oldestPendingCriticalSeconds: 600/.test(monitor)
      && !/SELECT[\s\S]{0,200}\bpayload\b/i.test(monitor),
    productionActivationHardDisabled: /CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED = false as const/.test(flags),
    productionRuntimeWired,
  };
  const required = [
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
  ];
  const violations = required.filter((field) => !facts[field]).map((field) => `repository_guard_missing:${field}`);
  if (facts.productionRuntimeWired) violations.push("unexpected_production_runtime_wiring");
  return { facts, violations };
}

export function evaluateShadowCaptureReadiness(contractViolations, repository) {
  const violations = [...contractViolations, ...(repository?.violations ?? ["repository_inspection_missing"])];
  return {
    readinessStatus: violations.length === 0
      ? "PASS_PRODUCTION_READINESS_PACKET"
      : "FAIL_PRODUCTION_READINESS_PACKET",
    productionDecision: "BLOCKED_AWAITING_EXPLICIT_APPROVAL",
    productionMutationAllowed: false,
    blockers: violations.length === 0
      ? [...EXPECTED_BLOCKERS]
      : ["local_readiness_validation_failed", ...violations],
    nextRequiredPackage: "WP-G0.2-SHADOW-CAPTURE-PRODUCTION-ADD-SAFETY-SCHEMA",
  };
}

export async function validateCurrentShadowCaptureReadiness() {
  const contract = JSON.parse(await readFile(READINESS_CONTRACT_PATH, "utf8"));
  const contractViolations = validateShadowCaptureReadinessContract(contract);
  const repository = await inspectShadowCaptureReadinessRepository(contract);
  return {
    schemaVersion: "wp-g0.2-shadow-capture-production-readiness-result.v1",
    ...evaluateShadowCaptureReadiness(contractViolations, repository),
    contractViolations,
    repository,
  };
}

async function main() {
  const result = await validateCurrentShadowCaptureReadiness();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.readinessStatus !== "PASS_PRODUCTION_READINESS_PACKET") process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
