import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(
  ROOT,
  "docs/governance/wp-g0-2-canonical-api-route-adapter-local-preparation.v1.json",
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

export async function loadCandidateCanonicalApiRouteAdapterContract() {
  return JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
}

export async function validateCandidateCanonicalApiRouteAdapterPreparation(contract) {
  contract ??= await loadCandidateCanonicalApiRouteAdapterContract();
  const violations = [];
  const implementation = await artifact(contract.implementationArtifact?.files ?? []);
  const source = await readFile(
    resolve(ROOT, "src/lib/candidate-episode/canonical-read-route-adapter.ts"),
    "utf8",
  );

  if (contract.schemaVersion !== "wp-g0.2-canonical-api-route-adapter-local-preparation.v1") {
    violations.push("schema_version");
  }
  if (contract.productionAuthorization !== false || contract.productionExecuted !== false) {
    violations.push("production_state_claim");
  }
  if (implementation.fileCount !== 2
      || implementation.fileCount !== contract.implementationArtifact?.fileCount
      || implementation.sha256 !== contract.implementationArtifact?.sha256) {
    violations.push("implementation_artifact");
  }

  const request = contract.requestBoundary ?? {};
  if (JSON.stringify(request.allowedPublicQuery) !== JSON.stringify([
    "limit", "cursorFirstSeenAt", "cursorEpisodeId",
  ])
      || request.unknownQueryRejected !== true
      || request.duplicateQueryRejected !== true
      || request.defaultLimit !== 100
      || request.maximumLimit !== 1000
      || request.cursorPairRequired !== true) {
    violations.push("request_allowlist");
  }
  for (const key of [
    "releaseRequestControlled", "asOfRequestControlled", "cohortRequestControlled",
    "phaseRequestControlled", "evidenceRequestControlled", "codeAuthorizationRequestControlled",
  ]) if (request[key] !== false) violations.push(`request_control:${key}`);

  const trusted = contract.trustedBoundary ?? {};
  if (trusted.singleTrustedContextProvider !== true
      || trusted.separatePolicyControlProvidersAllowed !== false
      || trusted.contextProviderReceivesPublicRequest !== false
      || trusted.policyValidatedBeforeDataRead !== true
      || trusted.controlValidatedBeforeDataRead !== true
      || trusted.authorityFingerprintRecheckedAfterDataRead !== true
      || trusted.authorityDriftStatusCode !== 503
      || trusted.controlTimeoutMs !== 2000
      || trusted.abortSignalProvided !== true
      || trusted.controlFailureStatusCode !== 503
      || trusted.staleControlFallbackAllowed !== false) {
    violations.push("trusted_boundary");
  }
  const authorization = contract.authorizationBoundary ?? {};
  if (authorization.currentCodeCanonicalReadAllowed !== false
      || authorization.authorizationSource !== "CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED"
      || authorization.authorizationDependencyInjectable !== false
      || authorization.authorizationEnvironmentControlled !== false
      || authorization.authorizationHeaderControlled !== false
      || authorization.authorizationQueryControlled !== false) {
    violations.push("authorization_boundary");
  }
  const orchestration = contract.orchestrationBoundary ?? {};
  if (orchestration.usesExistingReadStateMachine !== true
      || orchestration.legacyOnlyCandidateReadCalls !== 0
      || orchestration.legacyOnlyOracleCompareCalls !== 0
      || orchestration.legacyEventsBoundedByRequestLimit !== true
      || orchestration.dataTimeoutMs !== 15000
      || orchestration.abortSignalProvided !== true
      || orchestration.dependencyFailureStatusCode !== 503
      || orchestration.dependencyFailureStaleFallbackAllowed !== false
      || orchestration.resourceEnvelopeRequired !== true) {
    violations.push("orchestration_boundary");
  }
  const http = contract.httpBoundary ?? {};
  if (http.schemaVersion !== "candidate-canonical-api-route.v1"
      || http.cacheControl !== "no-store"
      || http.contractHeaderRequired !== true
      || http.statusHeaderRequired !== true
      || http.sourceHeaderRequired !== true
      || http.authorityHeaderRequired !== true
      || http.invalidRequestStatusCode !== 400
      || http.unavailableStatusCode !== 503
      || http.partialStatusPreserved !== true
      || http.unavailableAsSuccessAllowed !== false) {
    violations.push("http_boundary");
  }
  const runtime = contract.runtimeBoundary ?? {};
  for (const key of [
    "existingApiRouteModified", "frontendModified", "databaseConnected", "productionConnected",
    "featureFlagChanged", "canonicalReadAuthorized", "automaticPhaseAdvance",
    "tradePlanCreationAllowed", "productionRankingMutationAllowed",
  ]) if (runtime[key] !== false) violations.push(`runtime_boundary:${key}`);

  for (const token of [
    '"candidate-canonical-api-route.v1"',
    '"cache-control": "no-store"',
    '"x-chuan-authority"',
    '"x-chuan-data-status"',
    '"x-chuan-read-source"',
    "CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED",
    "CANDIDATE_API_ROUTE_CONTROL_TIMEOUT_MS = 2_000",
    "CANDIDATE_API_ROUTE_DATA_TIMEOUT_MS = 15_000",
    "withDeadline(",
    "signal: AbortSignal",
    "controller.abort(reason)",
    "executeCandidateReadRoute",
    "buildCandidateCanonicalApiResource",
    "readTrustedContext:",
    "assertCandidateTrustedReadContext(trustedContext)",
    "recheckedContext.authorityFingerprint !== trustedContext.authorityFingerprint",
    "candidate_read_authority_changed_during_read",
    "events.slice(0, parsed.request.limit)",
    'errorResponse(400, "invalid_candidate_read_request"',
    'errorResponse(503, "candidate_read_control_unavailable"',
    'errorResponse(503, "candidate_read_dependency_unavailable"',
  ]) if (!source.includes(token)) violations.push(`source_guard_missing:${token}`);
  for (const forbiddenToken of [
    "next/server", "process.env", 'query.get("phase")', 'query.get("releaseId")',
    'query.get("asOf")', "readTrustedPolicy:", "readTrustedControl:",
    "codeCanonicalReadAllowed:",
  ]) {
    if (forbiddenToken === "codeCanonicalReadAllowed:") continue;
    if (source.includes(forbiddenToken)) violations.push(`source_forbidden:${forbiddenToken}`);
  }
  const authorizationAssignments = source.match(/codeCanonicalReadAllowed:/g) ?? [];
  if (authorizationAssignments.length !== 1
      || !source.includes("codeCanonicalReadAllowed: CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED")) {
    violations.push("source_authorization_assignment");
  }
  for (const forbidden of [
    "request_controls_release", "request_controls_asof", "request_controls_cohort",
    "request_controls_phase", "request_controls_evidence", "request_controls_code_authorization",
    "environment_controls_code_authorization", "header_controls_code_authorization",
    "injectable_code_authorization", "legacy_only_reads_candidate", "legacy_only_runs_oracle",
    "unbounded_legacy_read", "unbounded_control_read", "unbounded_data_read",
    "stale_control_fallback", "stale_dependency_fallback",
    "unavailable_http_200", "cacheable_candidate_response", "existing_api_route_change",
    "frontend_change", "production_connection", "database_connection", "migration_change",
    "compose_change", "feature_flag_change", "trade_plan_creation",
    "production_ranking_mutation", "automatic_phase_advance", "formal_backtest",
  ]) if (!contract.forbidden?.includes(forbidden)) violations.push(`forbidden_missing:${forbidden}`);
  if (contract.nextProductionPackage !== "WP-G0.2-SHADOW-CAPTURE-DORMANT-RUNTIME-DEPLOY") {
    violations.push("production_sequence");
  }
  return {
    status: violations.length === 0
      ? "PASS_LOCAL_CANONICAL_API_ROUTE_ADAPTER_PREPARATION"
      : "FAIL",
    productionDecision: contract.currentProductionDecision,
    productionMutationAllowed: false,
    currentCodeCanonicalReadAllowed: false,
    existingApiRouteModified: false,
    frontendModified: false,
    canAutoDeploy: false,
    implementationArtifactSha256: implementation.sha256,
    violations,
  };
}

async function main() {
  const result = await validateCandidateCanonicalApiRouteAdapterPreparation();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.status.startsWith("PASS_")) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
