import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(
  ROOT,
  "docs/governance/wp-g0-2-canonical-api-resource-contract-local-preparation.v1.json",
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

export async function loadCandidateCanonicalApiResourceContract() {
  return JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
}

export async function validateCandidateCanonicalApiResourcePreparation(contract) {
  contract ??= await loadCandidateCanonicalApiResourceContract();
  const violations = [];
  const implementation = await artifact(contract.implementationArtifact?.files ?? []);
  const source = await readFile(
    resolve(ROOT, "src/lib/candidate-episode/canonical-read-resource.ts"),
    "utf8",
  );

  if (contract.schemaVersion !== "wp-g0.2-canonical-api-resource-contract-local-preparation.v1") {
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
  const envelope = contract.resourceEnvelope ?? {};
  if (envelope.schemaVersion !== "candidate-canonical-api-resource.v1"
      || envelope.modeExplicit !== true
      || envelope.readSourceExplicit !== true
      || envelope.authorityExplicit !== true
      || envelope.statusExplicit !== true
      || envelope.policyExplicit !== true
      || envelope.parityExplicit !== true
      || envelope.candidateAndLegacySeparate !== true
      || envelope.blockersExplicit !== true
      || envelope.contentHashDeterministic !== true
      || envelope.parityProofHashRequired !== true) {
    violations.push("resource_envelope");
  }
  const matrix = contract.modeMatrix ?? {};
  if (matrix.legacyOnly !== "legacy_diagnostic_only_no_parity"
      || matrix.dualReadLegacyAuthority !== "legacy_diagnostic_with_reference_parity"
      || matrix.canonicalCompatPass !== "candidate_ready_only_after_per_request_zero_difference"
      || matrix.canonicalCompatFail !== "explicit_legacy_fallback_without_candidate_data"
      || matrix.canonicalAuthority !== "candidate_partial_or_unavailable_without_legacy_fallback") {
    violations.push("mode_matrix");
  }
  const truth = contract.truthBoundary ?? {};
  for (const key of [
    "legacyCanPopulateCandidateCanonical",
    "legacyCanProveCanonicalAuthority",
    "canonicalFailureFallbackAllowed",
    "canAuthorizeCutover",
    "canCreateTradePlan",
    "canMutateLiveRanking",
    "automaticPhaseAdvance",
  ]) if (truth[key] !== false) violations.push(`truth_false:${key}`);
  for (const key of [
    "canonicalCompatCandidateRequiresReady",
    "canonicalCompatCandidateRequiresParityPass",
    "runtimeResultBoundaryValidated",
    "unknownDirectionPreserved",
    "nullObservationPricePreserved",
    "nullMfeMaePreserved",
  ]) if (truth[key] !== true) violations.push(`truth_true:${key}`);
  if (truth.illegalCombinationStatus !== "unavailable") violations.push("illegal_combination_status");

  const runtime = contract.runtimeBoundary ?? {};
  for (const key of [
    "existingApiRouteModified",
    "frontendModified",
    "databaseConnected",
    "productionConnected",
    "featureFlagChanged",
    "canonicalReadAuthorized",
  ]) if (runtime[key] !== false) violations.push(`runtime_boundary:${key}`);

  for (const token of [
    '"candidate-canonical-api-resource.v1"',
    'readSource: CandidateReadResourceSource | "none"',
    "candidateCanonical: CandidateCanonicalReadResult | null",
    "legacyDiagnostic: LegacyCandidateDiagnosticRead | null",
    "candidateCanonicalReviewUsable: boolean",
    "candidate_read_resource_contract_invalid",
    "candidate_reference_parity_not_pass",
    "function validHash",
    "function validResultBoundary",
    "canAuthorizeCutover: false",
    "canCreateTradePlan: false",
    "canMutateLiveRanking: false",
    "automaticPhaseAdvance: false",
  ]) if (!source.includes(token)) violations.push(`source_guard_missing:${token}`);
  for (const forbiddenImport of ["next/server", "@/app", "DATABASE_URL", "REDIS_URL"]) {
    if (source.includes(forbiddenImport)) violations.push(`source_forbidden:${forbiddenImport}`);
  }
  for (const forbidden of [
    "legacy_populates_candidate_payload", "legacy_proves_candidate_authority",
    "canonical_compat_without_parity_pass", "canonical_partial_to_ready",
    "canonical_unavailable_to_empty", "canonical_silent_legacy_fallback", "null_to_zero",
    "unknown_to_direction", "trade_plan_creation", "production_ranking_mutation",
    "automatic_phase_advance", "existing_api_route_change", "frontend_change",
    "production_connection", "database_connection", "migration_change", "compose_change",
    "feature_flag_change", "formal_backtest",
  ]) if (!contract.forbidden?.includes(forbidden)) violations.push(`forbidden_missing:${forbidden}`);
  if (contract.nextProductionPackage !== "WP-G0.2-SHADOW-CAPTURE-DORMANT-RUNTIME-DEPLOY") {
    violations.push("production_sequence");
  }
  return {
    status: violations.length === 0
      ? "PASS_LOCAL_CANONICAL_API_RESOURCE_CONTRACT_PREPARATION"
      : "FAIL",
    productionDecision: contract.currentProductionDecision,
    productionMutationAllowed: false,
    existingApiRouteModified: false,
    frontendModified: false,
    canonicalReadAuthorized: false,
    canAuthorizeCutover: false,
    implementationArtifactSha256: implementation.sha256,
    violations,
  };
}

async function main() {
  const result = await validateCandidateCanonicalApiResourcePreparation();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.status.startsWith("PASS_")) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
