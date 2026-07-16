import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(
  ROOT,
  "docs/governance/wp-g0-2-shadow-verify-runtime-wiring-local-superpackage.v1.json",
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

export async function loadShadowVerifyRuntimeWiringContract() {
  return JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
}

export async function validateShadowVerifyRuntimeWiring(contract) {
  contract ??= await loadShadowVerifyRuntimeWiringContract();
  const violations = [];
  const implementation = await artifact(contract.implementationArtifact?.files ?? []);
  const [route, server, model, oracle, routeAdapter] = await Promise.all([
    readFile(resolve(ROOT, "src/app/api/frontend/candidate-lifecycle/route.ts"), "utf8"),
    readFile(resolve(ROOT, "src/lib/candidate-episode/canonical-read-server.ts"), "utf8"),
    readFile(resolve(ROOT, "src/lib/candidate-episode/canonical-read-model.ts"), "utf8"),
    readFile(resolve(ROOT, "src/lib/candidate-episode/canonical-read-oracle.ts"), "utf8"),
    readFile(resolve(ROOT, "src/lib/candidate-episode/canonical-read-route-adapter.ts"), "utf8"),
  ]);

  if (contract.schemaVersion !== "wp-g0.2-shadow-verify-runtime-wiring-local-superpackage.v1"
      || contract.packageId !== "WP-G0.2-SHADOW-VERIFY-RUNTIME-WIRING-LOCAL-SUPERPACKAGE") {
    violations.push("contract_identity");
  }
  if (contract.productionAuthorization !== false
      || contract.productionExecuted !== false
      || contract.productionConnected !== false) violations.push("production_truth");
  if (implementation.fileCount !== 8
      || implementation.fileCount !== contract.implementationArtifact?.fileCount
      || implementation.sha256 !== contract.implementationArtifact?.sha256) {
    violations.push("implementation_artifact");
  }
  const endpoint = contract.endpointBoundary ?? {};
  if (endpoint.path !== "/api/frontend/candidate-lifecycle"
      || endpoint.method !== "GET"
      || endpoint.cacheControl !== "no-store"
      || endpoint.rateLimited !== true
      || JSON.stringify(endpoint.allowedPublicQuery) !== JSON.stringify([
        "limit", "cursorFirstSeenAt", "cursorEpisodeId",
      ])) violations.push("endpoint_boundary");
  for (const key of [
    "requestControlsAuthority", "requestControlsRelease", "requestControlsEvidence",
    "requestControlsPhase", "existingReviewRouteModified", "frontendModified",
  ]) if (endpoint[key] !== false) violations.push(`endpoint_false:${key}`);

  const runtime = contract.runtimeBoundary ?? {};
  if (runtime.databasePurpose !== "monitor"
      || runtime.databaseRole !== "candidate_audit_role"
      || runtime.transactionIsolation !== "serializable"
      || runtime.transactionReadOnly !== true
      || runtime.transactionDeferrable !== true
      || runtime.databaseStatementTimeoutMs !== 12_000
      || runtime.httpDataTimeoutMs !== 15_000
      || runtime.databaseTimeoutLessThanHttpDeadline !== true
      || runtime.databaseStatementTimeoutMs >= runtime.httpDataTimeoutMs
      || runtime.trustedManifestPath !== "/run/market-radar/candidate-read-authority.json"
      || runtime.codeCanonicalReadAllowed !== false
      || runtime.missingMonitorDatabaseStatusCode !== 503
      || runtime.missingManifestStatusCode !== 503
      || runtime.dependencyFailureStatusCode !== 503
      || runtime.staleFallbackAllowed !== false
      || runtime.abortSignalReachesDatabaseTransaction !== true
      || runtime.automaticPhaseAdvance !== false
      || runtime.canCreateTradePlan !== false
      || runtime.canMutateLiveRanking !== false) violations.push("runtime_boundary");
  for (const [key, value] of Object.entries(contract.deploymentBoundary ?? {})) {
    if (value !== false) violations.push(`deployment_boundary:${key}`);
  }

  for (const token of [
    "getCandidateCanonicalReadServer", "request.nextUrl.searchParams",
    '"cache-control": "no-store"', "MemoryRateLimiter", "rateLimitHeaders",
  ]) if (!route.includes(token)) violations.push(`route_guard_missing:${token}`);
  for (const forbidden of [
    'searchParams.get("phase")', 'searchParams.get("releaseId")',
    'searchParams.get("evidence")', "CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED = true",
  ]) if (route.includes(forbidden)) violations.push(`route_forbidden:${forbidden}`);
  for (const token of [
    'createCandidateRuntimeDatabase({ purpose: "monitor" })',
    "CandidateTrustedReadContextProvider", "CandidateCanonicalReadModel",
    "CandidateCanonicalReadOracleCoordinator", "repository.listJournalEvents(maximumEvents)",
    "candidate.read({ cursor, limit, policy, signal })",
    "oracle.compare({ cursor, limit, policy, signal })",
    "candidate_monitor_database_unavailable",
  ]) if (!server.includes(token)) violations.push(`server_guard_missing:${token}`);
  for (const token of [
    "CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED = false",
    "statementTimeoutMs: 12_000",
    "{ ...CANDIDATE_CANONICAL_READ_TRANSACTION, signal: input.signal }",
  ]) if (!model.includes(token)) violations.push(`model_guard_missing:${token}`);
  if (!oracle.includes("{ ...CANDIDATE_CANONICAL_READ_TRANSACTION, signal: input.signal }")) {
    violations.push("oracle_abort_signal_missing");
  }
  if (!routeAdapter.includes("CANDIDATE_API_ROUTE_DATA_TIMEOUT_MS = 15_000")) {
    violations.push("route_data_timeout_missing");
  }
  for (const forbidden of [
    "production_connection", "production_deployment", "canonical_read_authorization",
    "request_authority_control", "request_release_control", "request_evidence_control",
    "request_phase_control", "stale_fallback", "database_write", "schema_migration",
    "database_deadline_exceeds_http_deadline",
    "compose_change", "environment_change", "feature_flag_change", "redis_change",
    "worker_change", "existing_review_route_change", "frontend_change",
    "trade_plan_creation", "production_ranking_mutation", "future_outcome_production_input",
    "automatic_phase_advance", "formal_backtest",
  ]) if (!contract.forbidden?.includes(forbidden)) violations.push(`forbidden_missing:${forbidden}`);
  if (contract.currentProductionDecision !== "BLOCKED_UNTIL_ACTIVATION_AND_RECONCILIATION_PASS"
      || contract.nextPackage
        !== "WP-G0.2-SHADOW-VERIFY-PHASE-TRANSITION-AND-DUAL-READ-OBSERVATION") {
    violations.push("sequence_boundary");
  }
  return {
    status: violations.length === 0 ? "PASS_LOCAL_SHADOW_VERIFY_RUNTIME_WIRING" : "FAIL",
    productionMutationAllowed: false,
    codeCanonicalReadAllowed: false,
    existingReviewRouteModified: false,
    frontendModified: false,
    implementationArtifactSha256: implementation.sha256,
    violations,
  };
}

async function main() {
  const result = await validateShadowVerifyRuntimeWiring();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.status.startsWith("PASS_")) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
