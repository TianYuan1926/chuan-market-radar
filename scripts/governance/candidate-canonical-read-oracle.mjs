import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(
  ROOT,
  "docs/governance/wp-g0-2-canonical-read-compatibility-oracle-local-preparation.v1.json",
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

export async function loadCandidateCanonicalOracleContract() {
  return JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
}

export async function validateCandidateCanonicalOraclePreparation(contract) {
  contract ??= await loadCandidateCanonicalOracleContract();
  const violations = [];
  const implementation = await artifact(contract.implementationArtifact?.files ?? []);
  const model = await readFile(resolve(ROOT, "src/lib/candidate-episode/canonical-read-model.ts"), "utf8");
  const oracle = await readFile(resolve(ROOT, "src/lib/candidate-episode/canonical-read-oracle.ts"), "utf8");
  const legacy = await readFile(resolve(ROOT, "src/lib/candidate-episode/legacy-read-diagnostic.ts"), "utf8");
  const postgresTest = await readFile(
    resolve(ROOT, "src/lib/candidate-episode/canonical-read-oracle-postgres.test.ts"),
    "utf8",
  );
  const rehearsal = await readFile(
    resolve(ROOT, "scripts/rehearsal/candidate-canonical-read-oracle-postgres16.sh"),
    "utf8",
  );

  if (contract.schemaVersion !== "wp-g0.2-canonical-read-compatibility-oracle-local-preparation.v1") {
    violations.push("schema_version");
  }
  if (contract.productionAuthorization !== false || contract.productionExecuted !== false) {
    violations.push("production_state_claim");
  }
  if (implementation.fileCount !== 8
      || implementation.fileCount !== contract.implementationArtifact?.fileCount
      || implementation.sha256 !== contract.implementationArtifact?.sha256) {
    violations.push("implementation_artifact");
  }
  for (const [key, value] of Object.entries(contract.legacyBoundary ?? {})) {
    const expectedFalse = new Set([
      "canProveCanonicalParity",
      "canAuthorizeCutover",
      "canCreateTradePlan",
      "canMutateLiveRanking",
      "outcomeMetricsIncluded",
      "emptyCountsAsCanonicalReady",
    ]).has(key);
    if (typeof value === "boolean" && value !== !expectedFalse) {
      violations.push(`legacy_boundary:${key}`);
    }
  }
  if (contract.legacyBoundary?.authority !== "legacy_projection_non_authoritative"
      || contract.legacyBoundary?.allowedUse !== "compatibility_diagnostics_only") {
    violations.push("legacy_authority");
  }
  if (contract.oracleBoundary?.referenceSource !== "candidate_raw_episode_checkpoint_outcome_rows"
      || contract.oracleBoundary?.sameDatabaseSnapshotRequired !== true
      || contract.oracleBoundary?.transactionIsolation !== "serializable"
      || contract.oracleBoundary?.transactionReadOnly !== true
      || contract.oracleBoundary?.transactionDeferrable !== true
      || contract.oracleBoundary?.reusesMainAggregateResult !== false
      || contract.oracleBoundary?.recomputesPolicy !== true
      || contract.oracleBoundary?.recomputesPagination !== true
      || contract.oracleBoundary?.recomputesReviewDenominators !== true
      || contract.oracleBoundary?.recomputesMetrics !== true
      || contract.oracleBoundary?.detectsDuplicateIdentity !== true
      || contract.oracleBoundary?.databaseFailureStatus !== "unavailable") {
    violations.push("oracle_boundary");
  }
  if (contract.parityBoundary?.sampleSchemaVersion !== "candidate-read-parity-sample.v2"
      || contract.parityBoundary?.referenceStatusField !== "referenceStatus"
      || contract.parityBoundary?.policyCompared !== true
      || contract.parityBoundary?.episodesCompared !== true
      || contract.parityBoundary?.pageCompared !== true
      || contract.parityBoundary?.reviewCompared !== true
      || contract.parityBoundary?.maximumDifferences !== 0
      || contract.parityBoundary?.referencePartialOrUnavailableAllowed !== false
      || contract.parityBoundary?.candidatePartialOrUnavailableAllowed !== false
      || contract.parityBoundary?.automaticPhaseAdvance !== false) {
    violations.push("parity_boundary");
  }
  if (contract.routeBoundary?.currentCodeCanonicalReadAuthorization !== true
      || contract.routeBoundary?.shadowVerifyResponseAuthority !== "legacy_diagnostic"
      || contract.routeBoundary?.shadowVerifyParityReference !== "candidate_raw_oracle"
      || contract.routeBoundary?.canonicalCompatRequiresPerRequestReferencePass !== true
      || contract.routeBoundary?.canonicalCompatFallback !== "explicit_legacy_fallback"
      || contract.routeBoundary?.canonicalFailureFallback !== "prohibited") {
    violations.push("route_boundary");
  }
  for (const token of [
    'schemaVersion: "candidate-read-parity-sample.v2"',
    'referenceStatus: "ready" | "partial" | "unavailable"',
    "compareCandidateCanonicalReferenceReads",
    "referencePairRead: () => Promise<Readonly<{",
    "sameDatabaseSnapshot: true;",
    "policy: read.policy",
  ]) if (!model.includes(token)) violations.push(`model_guard_missing:${token}`);
  for (const token of [
    "sameDatabaseSnapshot: true",
    "serializable_read_only_deferrable",
    "buildCandidateCanonicalOracleFromRaw",
    "normalizeOraclePolicy",
    "normalizeOracleCursor",
    "oracleReview",
    "oracle_duplicate_episode",
    "oracle_duplicate_outcome_for_checkpoint",
    "candidate_episode_checkpoints",
    "candidate_episode_outcomes",
  ]) if (!oracle.includes(token)) violations.push(`oracle_guard_missing:${token}`);
  for (const sharedNormalizer of [
    "normalizeCandidateCanonicalReadPolicy",
    "normalizeCandidateCanonicalReadCursor",
  ]) if (oracle.includes(sharedNormalizer)) violations.push(`oracle_shared_normalizer:${sharedNormalizer}`);
  for (const token of [
    'authority: "legacy_projection_non_authoritative"',
    "canProveCanonicalParity: false",
    "canAuthorizeCutover: false",
    "LEGACY_UNSUPPORTED_CANONICAL_FIELDS",
    "legacy_authoritative_denominators_unavailable",
  ]) if (!legacy.includes(token)) violations.push(`legacy_guard_missing:${token}`);
  for (const forbiddenToken of ["outcomeMetrics", "mfePercent", "maePercent", "entryPrice"]) {
    if (legacy.includes(forbiddenToken)) violations.push(`legacy_forbidden_field:${forbiddenToken}`);
  }
  for (const token of [
    "CandidateCanonicalReadOracleCoordinator",
    "candidate_application_reader_role",
    "candidate_episode_ingest_outbox",
    'error.code === "42501"',
  ]) if (!postgresTest.includes(token)) violations.push(`postgres_guard_missing:${token}`);
  for (const token of [
    "env -u DATABASE_URL -u POSTGRES_URL",
    "WP_G0_2_CANONICAL_ORACLE_REHEARSAL_DATABASE_URL",
    '"sameDatabaseSnapshot":true',
    '"productionConnected":false',
  ]) if (!rehearsal.includes(token)) violations.push(`rehearsal_guard_missing:${token}`);
  for (const forbidden of [
    "legacy_fabricates_episode_identity", "legacy_fabricates_review_denominator",
    "legacy_reads_candidate_to_fake_parity", "null_to_zero", "unknown_to_direction",
    "database_error_as_empty", "reference_reuses_main_aggregate", "production_connection",
    "production_mutation", "api_wiring", "frontend_wiring", "migration_change",
    "compose_change", "feature_flag_change", "automatic_phase_advance",
    "canonical_cutover", "future_outcome_ranking_input", "formal_backtest",
  ]) if (!contract.forbidden?.includes(forbidden)) violations.push(`forbidden_missing:${forbidden}`);
  if (contract.currentProductionDecision !== "BLOCKED_UNTIL_PASS_DUAL_READ_OBSERVATION_AND_SEPARATE_CANONICAL_COMPAT_APPROVAL"
      || contract.nextProductionPackage
        !== "WP-G0.2-CANONICAL-COMPAT-PHASE-TRANSITION-AND-OBSERVATION") {
    violations.push("production_sequence");
  }
  return {
    status: violations.length === 0 ? "PASS_LOCAL_CANONICAL_READ_ORACLE_PREPARATION" : "FAIL",
    productionDecision: contract.currentProductionDecision,
    productionMutationAllowed: false,
    legacyCanProveCanonicalParity: false,
    sameDatabaseSnapshotRequired: true,
    canonicalReadAuthorized: false,
    automaticPhaseAdvance: false,
    implementationArtifactSha256: implementation.sha256,
    violations,
  };
}

async function main() {
  const result = await validateCandidateCanonicalOraclePreparation();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.status.startsWith("PASS_")) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
