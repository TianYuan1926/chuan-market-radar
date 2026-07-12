import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(
  ROOT,
  "docs/governance/wp-g0-2-trusted-read-context-local-preparation.v1.json",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function artifact(files) {
  const checksums = {};
  for (const file of [...files].sort()) {
    checksums[file] = sha256(await readFile(resolve(ROOT, file)));
  }
  return {
    fileCount: Object.keys(checksums).length,
    sha256: sha256(JSON.stringify(checksums)),
  };
}

export async function loadCandidateTrustedReadContextContract() {
  return JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
}

export async function validateCandidateTrustedReadContextPreparation(contract) {
  contract ??= await loadCandidateTrustedReadContextContract();
  const violations = [];
  const implementation = await artifact(contract.implementationArtifact?.files ?? []);
  const source = await readFile(
    resolve(ROOT, "src/lib/candidate-episode/canonical-read-trusted-context.ts"),
    "utf8",
  );
  const route = await readFile(
    resolve(ROOT, "src/lib/candidate-episode/canonical-read-route-adapter.ts"),
    "utf8",
  );

  if (contract.schemaVersion !== "wp-g0.2-trusted-read-context-local-preparation.v1") {
    violations.push("schema_version");
  }
  if (contract.productionAuthorization !== false || contract.productionExecuted !== false) {
    violations.push("production_state_claim");
  }
  if (implementation.fileCount !== 6
      || implementation.fileCount !== contract.implementationArtifact?.fileCount
      || implementation.sha256 !== contract.implementationArtifact?.sha256) {
    violations.push("implementation_artifact");
  }
  const authority = contract.authorityBoundary ?? {};
  if (authority.singleTrustedContextProvider !== true
      || authority.separatePolicyAndControlProvidersAllowed !== false
      || authority.databaseControlAndPolicySameSnapshot !== true
      || authority.transactionIsolation !== "serializable"
      || authority.transactionReadOnly !== true
      || authority.transactionDeferrable !== true
      || authority.fixedMigrationId !== "candidate-episode-v1"
      || authority.databaseClockRequired !== true
      || authority.approvedReleaseMatchesPolicy !== true
      || authority.contextProofRecomputedBeforeUse !== true
      || authority.authorityFingerprintRecheckedAfterDataRead !== true
      || authority.authorityDriftStatusCode !== 503) {
    violations.push("authority_boundary");
  }
  const manifest = contract.manifestBoundary ?? {};
  if (manifest.schemaVersion !== "candidate-read-authority-manifest.v1"
      || manifest.fixedRuntimePath !== "/run/market-radar/candidate-read-authority.json"
      || manifest.exactRawBytesSha256MatchesDatabaseApprovalDigest !== true
      || manifest.maximumApprovalArtifactAgeMinutes !== 90
      || manifest.unknownFieldsRejected !== true
      || manifest.releaseEpochPhaseMatchControl !== true
      || manifest.phaseCanInferEvidencePass !== false
      || manifest.missingEvidenceHashMustBeNull !== true
      || manifest.passEvidenceHashRequired !== true) {
    violations.push("manifest_boundary");
  }
  const runtime = contract.runtimeBoundary ?? {};
  if (runtime.runtimeReleaseMatchesApprovedRelease !== true
      || runtime.flagsExplicitBooleanRequired !== true
      || runtime.flagsMustMatchManifest !== true
      || runtime.flagsMustMatchPhase !== true
      || runtime.checkpointKind !== "24h"
      || runtime.cohortFromControlStartedAt !== true
      || runtime.asOfFromDatabaseClock !== true
      || runtime.codeCanonicalReadAllowed !== false) {
    violations.push("runtime_boundary");
  }
  for (const key of [
    "existingApiRouteModified", "frontendModified", "productionConnected",
    "featureFlagChanged", "automaticPhaseAdvance", "tradePlanCreationAllowed",
    "productionRankingMutationAllowed",
  ]) if (runtime[key] !== false) violations.push(`runtime_false:${key}`);

  for (const token of [
    '"candidate-trusted-read-context.v1"',
    '"candidate-read-authority-manifest.v1"',
    '"/run/market-radar/candidate-read-authority.json"',
    '"candidate-episode-v1"',
    'CANDIDATE_CANONICAL_API_CHECKPOINT_KIND = "24h"',
    'isolation: "serializable"',
    "readOnly: true",
    "deferrable: true",
    "approvalDigest !== hash(rawManifest)",
    "candidate_read_evidence_phase_mismatch",
    "candidate_read_runtime_flag_phase_mismatch",
    "candidate_read_runtime_release_mismatch",
    "clock_timestamp() AS database_now",
    "const expectedFingerprint = hashObject",
    "value.authorityFingerprint !== expectedFingerprint",
  ]) if (!source.includes(token)) violations.push(`source_guard_missing:${token}`);
  for (const token of [
    "readTrustedContext:",
    "recheckedContext.authorityFingerprint !== trustedContext.authorityFingerprint",
    "candidate_read_authority_changed_during_read",
  ]) if (!route.includes(token)) violations.push(`route_guard_missing:${token}`);
  for (const forbiddenToken of ["readTrustedPolicy:", "readTrustedControl:"]) {
    if (route.includes(forbiddenToken)) violations.push(`separate_provider_present:${forbiddenToken}`);
  }
  for (const forbidden of [
    "separate_policy_control_reads", "phase_infers_evidence_pass",
    "manifest_digest_mismatch_allowed", "manifest_unknown_fields_allowed",
    "request_controls_authority", "runtime_release_mismatch_allowed",
    "runtime_flag_phase_mismatch_allowed", "authority_drift_result_returned",
    "stale_control_fallback", "existing_api_route_change", "frontend_change",
    "production_connection", "database_mutation", "migration_change", "compose_change",
    "feature_flag_change", "trade_plan_creation", "production_ranking_mutation",
    "automatic_phase_advance", "formal_backtest",
  ]) if (!contract.forbidden?.includes(forbidden)) violations.push(`forbidden_missing:${forbidden}`);
  if (contract.localPostgres16?.migrationCount !== 9
      || contract.localPostgres16?.contextRole !== "candidate_audit_role"
      || contract.localPostgres16?.noInheritLogin !== true
      || contract.localPostgres16?.writeRejected !== true
      || contract.localPostgres16?.productionConnected !== false) {
    violations.push("postgres_boundary");
  }
  if (contract.nextProductionPackage !== "WP-G0.2-SHADOW-CAPTURE-DORMANT-RUNTIME-DEPLOY") {
    violations.push("production_sequence");
  }
  return {
    status: violations.length === 0
      ? "PASS_LOCAL_TRUSTED_READ_CONTEXT_PREPARATION"
      : "FAIL",
    productionDecision: contract.currentProductionDecision,
    productionMutationAllowed: false,
    existingApiRouteModified: false,
    frontendModified: false,
    currentCodeCanonicalReadAllowed: false,
    canAutoDeploy: false,
    implementationArtifactSha256: implementation.sha256,
    violations,
  };
}

async function main() {
  const result = await validateCandidateTrustedReadContextPreparation();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.status.startsWith("PASS_")) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
