import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const CONTRACT = "docs/governance/wp-g0-2-canonical-rollback-state-machine-remediation-local-superpackage.v1.json";
const MIGRATION = "migrations/candidate-episode/010_candidate_canonical_rollback_safety.sql";
const REHEARSAL = "scripts/production/candidate-canonical-rollback-remediation/runner-postgres.integration.mjs";
const HISTORICAL_RUNNER_TEST = "scripts/production/migration-runner/migration-runner.test.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

export function validateCanonicalRollbackRemediation({
  contract,
  historicalRunnerTest,
  migration,
  rehearsal,
}) {
  ensure(contract.schemaVersion === "wp-g0.2-canonical-rollback-state-machine-remediation-local-superpackage.v1",
    "schema_version_invalid");
  ensure(contract.packageId === "WP-G0.2-CANONICAL-ROLLBACK-STATE-MACHINE-REMEDIATION-LOCAL-SUPERPACKAGE",
    "package_id_invalid");
  ensure(contract.productionAuthorization === false && contract.productionExecuted === false,
    "production_claim_invalid");
  ensure(contract.problem?.severity === "P0_PRE_CUTOVER_BLOCKER"
    && contract.problem?.canonicalCutoverBlockedUntilRemediated === true,
  "problem_boundary_invalid");
  ensure(contract.migration?.filename === "010_candidate_canonical_rollback_safety.sql"
    && contract.migration?.sha256 === sha256(migration)
    && contract.migration?.baseline === "001_through_009_applied_verified"
    && contract.migration?.additive === true
    && contract.migration?.tablesAdded === 0
    && contract.migration?.columnsAdded === 0
    && contract.migration?.businessRowsMutated === false
    && contract.migration?.existingMigrationChecksumsChanged === false,
  "migration_boundary_invalid");

  const procedure = contract.rollbackProcedure ?? {};
  ensure(procedure.name === "candidate_authority.rollback_canonical_migration_control_v1"
    && procedure.sourcePhase === "canonical"
    && procedure.sourceWriteFrozen === false
    && procedure.targetPhase === "legacy"
    && procedure.targetWriteFrozen === true
    && procedure.epochIncrement === 1
    && procedure.securityDefinerOwner === "candidate_migration_role"
    && procedure.publicExecuteRevoked === true
    && JSON.stringify(procedure.executeRoleAllowlist) === JSON.stringify(["candidate_migration_role"])
    && procedure.candidateDataPreserved === true,
  "procedure_boundary_invalid");

  ensure(/CREATE OR REPLACE FUNCTION candidate_authority\.rollback_canonical_migration_control_v1/u.test(migration)
    && /control_row\.phase <> 'canonical' OR control_row\.write_frozen/u.test(migration)
    && /SET phase = 'legacy',[\s\S]*epoch = control\.epoch \+ 1,[\s\S]*write_frozen = true/u.test(migration)
    && /approval_digest !~ '\^sha256:\[0-9a-f\]\{64\}\$'/u.test(migration)
    && /REVOKE ALL ON FUNCTION candidate_authority\.rollback_canonical_migration_control_v1\([\s\S]*FROM PUBLIC/u.test(migration)
    && /ALTER FUNCTION candidate_authority\.rollback_canonical_migration_control_v1\([\s\S]*OWNER TO candidate_migration_role/u.test(migration)
    && /GRANT EXECUTE ON FUNCTION candidate_authority\.rollback_canonical_migration_control_v1\([\s\S]*TO candidate_migration_role/u.test(migration),
  "migration_sql_guard_missing");
  ensure(!/\b(?:DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+candidate_authority\.(?:candidate_episodes|candidate_episode_events|candidate_episode_checkpoints|candidate_episode_outcomes|candidate_episode_ingest_outbox))\b/iu.test(migration),
    "destructive_or_business_mutation_forbidden");
  ensure(!/candidate_authority\.transition_migration_control_v1\s*\(/u.test(migration),
    "existing_transition_procedure_must_not_change");

  ensure(contract.rehearsal?.postgresMajor === 16
    && contract.rehearsal?.migrationCount === 10
    && contract.rehearsal?.productionConnected === false
    && contract.rehearsal?.canonicalToLegacyFrozen === true
    && contract.rehearsal?.dataPreservation === true
    && contract.rehearsal?.leastPrivilege === true,
  "rehearsal_contract_invalid");
  for (const proof of [
    "application_writer_execute_denied",
    "application_writer_direct_update_denied",
    "stale_epoch_denied",
    "noncanonical_phase_denied",
    "repeat_rollback_denied",
    "invalid_approval_digest_denied",
  ]) ensure(rehearsal.includes(proof), `rehearsal_proof_missing:${proof}`);

  ensure(contract.historicalRunnerBoundary?.migration009RunnerRemainsFrozenToFiles001Through009 === true
    && contract.historicalRunnerBoundary?.migration009RunnerMustRejectCurrentRepositoryAfter010 === true
    && contract.historicalRunnerBoundary?.historicalRunnerTestUsesFrozenNineFileFixture === true
    && /runner-nine-file-fixture-/u.test(historicalRunnerTest),
  "historical_runner_boundary_invalid");
  ensure(contract.resultBoundary?.migration010AppliedToProduction === false
    && contract.resultBoundary?.canonicalCutoverAuthorized === false
    && contract.resultBoundary?.canonicalPhaseEntered === false
    && contract.resultBoundary?.wpG02Completed === false
    && contract.resultBoundary?.g0Completed === false,
  "result_boundary_invalid");
  ensure(contract.nextPackageOnPass === "WP-G0.2-CANONICAL-ROLLBACK-SAFETY-PRODUCTION-ADD-SCHEMA",
    "next_package_invalid");
  return {
    status: "PASS_LOCAL_CANONICAL_ROLLBACK_STATE_MACHINE_REMEDIATION",
    packageId: contract.packageId,
    migration010Sha256: contract.migration.sha256,
    productionAuthorization: false,
    productionExecuted: false,
    canonicalCutoverAuthorized: false,
  };
}

export async function validateCanonicalRollbackRemediationFiles(root = ROOT) {
  const [contractText, migration, rehearsal, historicalRunnerTest] = await Promise.all([
    readFile(resolve(root, CONTRACT), "utf8"),
    readFile(resolve(root, MIGRATION), "utf8"),
    readFile(resolve(root, REHEARSAL), "utf8"),
    readFile(resolve(root, HISTORICAL_RUNNER_TEST), "utf8"),
  ]);
  return validateCanonicalRollbackRemediation({
    contract: JSON.parse(contractText),
    historicalRunnerTest,
    migration,
    rehearsal,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  validateCanonicalRollbackRemediationFiles()
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${JSON.stringify({ status: "FAIL", reason: error.message })}\n`);
      process.exitCode = 1;
    });
}
