import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(
  ROOT,
  "docs/governance/wp-g0-2-current-cycle-shadow-verify-dependency-refresh-local-superpackage.v4.json",
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

export async function loadShadowVerifyCodeAuthorizationContract() {
  return JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
}

export async function validateShadowVerifyCodeAuthorization(contract) {
  contract ??= await loadShadowVerifyCodeAuthorizationContract();
  const violations = [];
  const implementation = await artifact(contract.implementationArtifact?.files ?? []);
  const [route, runtimeDatabase, model, resource, adapter, server, trusted] = await Promise.all([
    readFile(resolve(ROOT, "src/app/api/frontend/candidate-lifecycle/route.ts"), "utf8"),
    readFile(resolve(ROOT, "src/lib/candidate-episode/candidate-runtime-database.ts"), "utf8"),
    readFile(resolve(ROOT, "src/lib/candidate-episode/canonical-read-model.ts"), "utf8"),
    readFile(resolve(ROOT, "src/lib/candidate-episode/canonical-read-resource.ts"), "utf8"),
    readFile(resolve(ROOT, "src/lib/candidate-episode/canonical-read-route-adapter.ts"), "utf8"),
    readFile(resolve(ROOT, "src/lib/candidate-episode/canonical-read-server.ts"), "utf8"),
    readFile(resolve(ROOT, "src/lib/candidate-episode/canonical-read-trusted-context.ts"), "utf8"),
  ]);

  if (contract.schemaVersion
        !== "wp-g0.2-current-cycle-shadow-verify-dependency-refresh-local-superpackage.v4"
      || contract.packageId
        !== "WP-G0.2-CURRENT-CYCLE-SHADOW-VERIFY-DEPENDENCY-REFRESH-LOCAL-SUPERPACKAGE") {
    violations.push("contract_identity");
  }
  for (const key of [
    "productionAuthorization", "productionConnected", "productionDeployed",
    "productionPhaseTransitionExecuted",
  ]) if (contract[key] !== false) violations.push(`production_truth:${key}`);
  if (implementation.fileCount !== 7
      || implementation.fileCount !== contract.implementationArtifact?.fileCount
      || implementation.sha256 !== contract.implementationArtifact?.sha256) {
    violations.push("implementation_artifact");
  }

  const code = contract.codeBoundary ?? {};
  if (code.candidateReadStateMachineAuthorized !== true
      || code.authorizationSource !== "CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED") {
    violations.push("code_authorization");
  }
  for (const key of [
    "environmentOverrideAllowed", "requestOverrideAllowed", "headerOverrideAllowed",
    "automaticPhaseAdvance", "canAuthorizeCutover", "canCreateTradePlan",
    "canMutateLiveRanking",
  ]) if (code[key] !== false) violations.push(`code_boundary:${key}`);

  const expectedMatrix = {
    legacy: "legacy_only",
    shadow_capture: "legacy_only",
    shadow_verify: "dual_read_legacy_authority",
    canonical_compat: "candidate_only_after_dual_read_evidence_otherwise_legacy",
    canonical: "candidate_only_after_canonical_compat_evidence",
  };
  if (JSON.stringify(contract.phaseMatrix) !== JSON.stringify(expectedMatrix)) {
    violations.push("phase_matrix");
  }

  const shadow = contract.shadowVerifyBoundary ?? {};
  if (shadow.lineageSchemaRequired !== "candidate-multi-cycle-lineage-evidence.v3"
      || shadow.lineageStatusRequired
        !== "PASS_CURRENT_CYCLE_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH"
      || shadow.reconciliationSchemaRequired
        !== "candidate-multi-cycle-reconciliation-evidence.v3"
      || shadow.reconciliationEvidenceRequired
        !== "PASS_CURRENT_CYCLE_UNIFIED_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL"
      || shadow.codePresenceSchemaRequired
        !== "candidate-shadow-verify-code-presence-evidence.v1"
      || shadow.codePresenceStatusRequired
        !== "PASS_PRODUCTION_SHADOW_VERIFY_CODE_PRESENCE_VERIFIED"
      || shadow.sourceReleaseWindowsExact !== 6
      || shadow.sourceReleaseWindowsDerivedFromMigrationId !== true
      || shadow.currentMigrationIdRequired !== "candidate-episode-v1-cycle-6"
      || shadow.minimumComparedWrites !== 10000
      || shadow.zeroUnresolvedRequired !== true
      || shadow.dualReadFlagRequired !== true
      || shadow.canonicalReadFlagRequired !== false
      || shadow.reviewReadFlagRequired !== false
      || shadow.sameDatabaseSnapshotRequired !== true
      || shadow.zeroDifferenceRequired !== true
      || shadow.legacyResponseAuthorityRequired !== true
      || shadow.candidateReviewUsable !== false
      || shadow.readTransactionRole !== "candidate_audit_role"
      || shadow.readTransactionIsolation !== "serializable_read_only_deferrable"
      || shadow.trustedManifestPath !== "/run/market-radar/candidate-read-authority.json"
      || shadow.authorityFingerprintRecheckRequired !== true
      || shadow.historicalWebReleaseAccepted !== false) {
    violations.push("shadow_verify_boundary");
  }

  const endpoint = contract.publicEndpointBoundary ?? {};
  if (endpoint.path !== "/api/frontend/candidate-lifecycle"
      || endpoint.method !== "GET"
      || JSON.stringify(endpoint.allowedQuery) !== JSON.stringify([
        "limit", "cursorFirstSeenAt", "cursorEpisodeId",
      ])
      || endpoint.cacheControl !== "no-store"
      || endpoint.failureStatus !== 503
      || endpoint.staleFallbackAllowed !== false) violations.push("endpoint_boundary");
  for (const key of [
    "requestControlsPhase", "requestControlsFlags", "requestControlsEvidence",
    "requestControlsRelease",
  ]) if (endpoint[key] !== false) violations.push(`endpoint_boundary:${key}`);

  if (!model.includes("CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED = true as const")
      || model.includes("process.env.CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED")
      || !model.includes('phase === "shadow_verify"')
      || !model.includes('mode: "dual_read_legacy_authority"')
      || !model.includes('blockers: ["reconciliation_evidence_missing"]')
      || !model.includes('source: "legacy", result: legacy, parity')) {
    violations.push("model_guards");
  }
  for (const forbidden of [
    'searchParams.get("phase")', 'searchParams.get("flags")',
    'searchParams.get("evidence")', 'searchParams.get("releaseId")',
  ]) if (route.includes(forbidden)) violations.push(`route_override:${forbidden}`);
  for (const token of [
    "CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED",
    "candidate_read_authority_changed_during_read",
  ]) if (!adapter.includes(token)) violations.push(`adapter_guard:${token}`);
  for (const token of [
    'mode === "dual_read_legacy_authority"',
    'authority: "legacy_projection_non_authoritative"',
    "candidateCanonicalReviewUsable: false",
    "canAuthorizeCutover: false",
  ]) if (!resource.includes(token)) violations.push(`resource_guard:${token}`);
  for (const token of [
    'createCandidateRuntimeDatabase({ purpose: "monitor" })',
    "CandidateCanonicalReadOracleCoordinator",
  ]) if (!server.includes(token)) violations.push(`server_guard:${token}`);
  for (const token of [
    "CANDIDATE_READ_AUTHORITY_MANIFEST_PATH",
    '"/run/market-radar/candidate-read-authority.json"',
    "authorityFingerprint",
  ]) if (!trusted.includes(token)) violations.push(`trusted_guard:${token}`);
  if (!runtimeDatabase.includes('monitor: "candidate_audit_role"')) {
    violations.push("runtime_database_audit_role_missing");
  }

  const forbiddenRequired = [
    "production_connection", "production_deployment", "phase_transition", "database_write",
    "schema_migration", "environment_override", "request_authority_control",
    "header_authority_control", "missing_reconciliation_evidence_bypass",
    "candidate_authority_during_shadow_verify", "parity_failure_candidate_fallback",
    "missing_code_presence_evidence_bypass", "historical_web_release_reuse",
    "automatic_phase_advance", "canonical_cutover", "frontend_change", "scan_change",
    "analysis_change", "strategy_change", "backtest_change", "production_ranking_change",
    "future_outcome_input", "formal_backtest",
  ];
  for (const token of forbiddenRequired) {
    if (!contract.forbidden?.includes(token)) violations.push(`forbidden_missing:${token}`);
  }
  if (contract.currentProductionDecision
        !== "BLOCKED_UNTIL_CYCLE6_FINAL_CODE_PRESENCE_LINEAGE_AND_RECONCILIATION_PASS_AND_SEPARATE_PHASE_AUTHORIZATION"
      || contract.nextPackage
        !== "WP-G0.2-SHADOW-VERIFY-PHASE-TRANSITION-AND-DUAL-READ-OBSERVATION") {
    violations.push("sequence_boundary");
  }

  return {
    status: violations.length === 0 ? "PASS_LOCAL_SHADOW_VERIFY_CODE_AUTHORIZATION" : "FAIL",
    productionMutationAllowed: false,
    codeStateMachineAuthorized: true,
    shadowVerifyResponseAuthority: "legacy",
    implementationArtifactSha256: implementation.sha256,
    violations,
  };
}

async function main() {
  const result = await validateShadowVerifyCodeAuthorization();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.status.startsWith("PASS_")) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
