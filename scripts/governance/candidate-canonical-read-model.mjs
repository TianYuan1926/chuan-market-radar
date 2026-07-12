import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(
  ROOT,
  "docs/governance/wp-g0-2-canonical-compat-read-model-local-preparation.v1.json",
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

export async function loadCandidateCanonicalReadContract() {
  return JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
}

export async function validateCandidateCanonicalReadPreparation(contract) {
  contract ??= await loadCandidateCanonicalReadContract();
  const violations = [];
  const implementation = await artifact(contract.implementationArtifact?.files ?? []);
  const model = await readFile(
    resolve(ROOT, "src/lib/candidate-episode/canonical-read-model.ts"),
    "utf8",
  );
  const postgresTest = await readFile(
    resolve(ROOT, "src/lib/candidate-episode/canonical-read-model-postgres.test.ts"),
    "utf8",
  );
  const rehearsal = await readFile(
    resolve(ROOT, "scripts/rehearsal/candidate-canonical-read-postgres16.sh"),
    "utf8",
  );

  if (contract.schemaVersion !== "wp-g0.2-canonical-compat-read-model-local-preparation.v1") {
    violations.push("schema_version");
  }
  if (contract.productionAuthorization !== false || contract.productionExecuted !== false) {
    violations.push("production_state_claim");
  }
  if (implementation.fileCount !== 4
      || implementation.fileCount !== contract.implementationArtifact?.fileCount
      || implementation.sha256 !== contract.implementationArtifact?.sha256) {
    violations.push("implementation_artifact");
  }
  if (contract.readPolicy?.scope !== "production_radar"
      || contract.readPolicy?.asOfRequired !== true
      || contract.readPolicy?.asOfMaximumAgeSeconds !== 600
      || contract.readPolicy?.releaseIdRequired !== true
      || contract.readPolicy?.observationCohortRequired !== true
      || contract.readPolicy?.dueCohortRequired !== true
      || contract.readPolicy?.checkpointKindRequired !== true
      || contract.readPolicy?.evidenceGradeVersion !== "eg.v1"
      || contract.readPolicy?.pageMaximum !== 1000
      || contract.readPolicy?.databaseFailureStatus !== "unavailable"
      || contract.readPolicy?.invariantFailureStatus !== "partial") {
    violations.push("read_policy");
  }
  if (contract.databaseBoundary?.transactionIsolation !== "serializable"
      || contract.databaseBoundary?.transactionReadOnly !== true
      || contract.databaseBoundary?.transactionDeferrable !== true
      || contract.databaseBoundary?.readerRole !== "candidate_application_reader_role"
      || contract.databaseBoundary?.readerProductionLoginProvisioned !== false
      || contract.databaseBoundary?.readerOutboxAccessAllowed !== false
      || contract.databaseBoundary?.productionDmlAllowed !== false
      || contract.databaseBoundary?.schemaDdlAllowed !== false
      || contract.databaseBoundary?.migrationAllowed !== false) {
    violations.push("database_boundary");
  }
  for (const [key, value] of Object.entries(contract.truthBoundary ?? {})) {
    const expectedFalse = new Set([
      "futureOutcomeAsRankingInputAllowed",
      "tradePlanCreationAllowed",
      "liveRankingMutationAllowed",
      "databaseErrorAsEmptyAllowed",
    ]).has(key);
    if (value !== !expectedFalse) violations.push(`truth_boundary:${key}`);
  }
  if (contract.readRoute?.currentCodeCanonicalReadAuthorization !== false
      || contract.readRoute?.shadowVerifyAuthority !== "legacy"
      || contract.readRoute?.canonicalCompatFallback !== "explicit_legacy_fallback_on_non_pass_parity"
      || contract.readRoute?.canonicalFailureFallback !== "prohibited"
      || contract.readRoute?.automaticPhaseAdvance !== false) {
    violations.push("read_route");
  }
  if (contract.parityEvidence?.reconciliationEvidenceRequired !== true
      || contract.parityEvidence?.dualReadWindowRequired !== true
      || contract.parityEvidence?.canonicalCompatWindowRequired !== true
      || contract.parityEvidence?.windowsMustBeSeparate !== true
      || contract.parityEvidence?.minimumHoursPerWindow !== 24
      || contract.parityEvidence?.minimumSamplesPerWindow !== 289
      || contract.parityEvidence?.maximumSampleGapSeconds !== 600
      || contract.parityEvidence?.maximumDifferences !== 0
      || contract.parityEvidence?.partialOrUnavailableSampleAllowed !== false) {
    violations.push("parity_evidence");
  }
  for (const token of [
    "CANDIDATE_PRODUCTION_CANONICAL_READ_ALLOWED = false",
    "CANDIDATE_READ_AS_OF_MAXIMUM_AGE_SECONDS = 600",
    'isolation: "serializable"',
    "readOnly: true",
    "deferrable: true",
    "candidate_read_as_of_stale_for_current_snapshot",
    "candidate_review_invariant_failed",
    "evidence_version_mismatch",
    "metric_sample_count",
    "canonical_compat_parity_not_pass",
    "source: \"legacy_fallback\"",
    "canCreateTradePlan: false",
    "canMutateLiveRanking: false",
  ]) if (!model.includes(token)) violations.push(`model_guard_missing:${token}`);
  for (const token of [
    "release_id=$2",
    "checkpoint.checkpoint_kind=$5",
    "evidence_grade_version=$9",
    "status: \"partial\"",
    "status: \"unavailable\"",
  ]) if (!model.includes(token)) violations.push(`query_guard_missing:${token}`);
  if (model.includes("metricSamplesEqualEvidenceGradeOutcomes: true")) {
    violations.push("metric_sample_invariant_hardcoded");
  }
  for (const token of [
    "NOINHERIT NOREPLICATION NOBYPASSRLS",
    "candidate_application_reader_role",
    "candidate_episode_ingest_outbox",
    "error.code === \"42501\"",
  ]) if (!postgresTest.includes(token)) violations.push(`postgres_guard_missing:${token}`);
  for (const token of [
    "env -u DATABASE_URL -u POSTGRES_URL",
    "WP_G0_2_CANONICAL_READ_REHEARSAL_DATABASE_URL",
    '"productionConnected":false',
  ]) if (!rehearsal.includes(token)) violations.push(`rehearsal_guard_missing:${token}`);
  for (const forbidden of [
    "production_connection", "production_mutation", "api_wiring", "frontend_wiring",
    "compose_change", "migration_change", "automatic_phase_advance", "canonical_cutover",
    "null_to_zero", "unknown_to_direction", "database_error_as_empty",
    "future_outcome_ranking_input", "formal_backtest",
  ]) if (!contract.forbidden?.includes(forbidden)) violations.push(`forbidden_missing:${forbidden}`);
  if (contract.nextProductionPackage !== "WP-G0.2-SHADOW-CAPTURE-DORMANT-RUNTIME-DEPLOY") {
    violations.push("production_sequence");
  }
  return {
    status: violations.length === 0 ? "PASS_LOCAL_CANONICAL_READ_MODEL_PREPARATION" : "FAIL",
    productionDecision: contract.currentProductionDecision,
    productionMutationAllowed: false,
    canonicalReadAuthorized: false,
    automaticPhaseAdvance: false,
    implementationArtifactSha256: implementation.sha256,
    violations,
  };
}

async function main() {
  const result = await validateCandidateCanonicalReadPreparation();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.status.startsWith("PASS_")) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
