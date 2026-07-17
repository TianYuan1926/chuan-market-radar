import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  validateCanonicalRollbackRemediation,
  validateCanonicalRollbackRemediationFiles,
} from "./candidate-canonical-rollback-remediation.mjs";

async function fixture() {
  const [contract, migration, rehearsal, historicalRunnerTest] = await Promise.all([
    readFile("docs/governance/wp-g0-2-canonical-rollback-state-machine-remediation-local-superpackage.v1.json", "utf8").then(JSON.parse),
    readFile("migrations/candidate-episode/010_candidate_canonical_rollback_safety.sql", "utf8"),
    readFile("scripts/production/candidate-canonical-rollback-remediation/runner-postgres.integration.mjs", "utf8"),
    readFile("scripts/production/migration-runner/migration-runner.test.mjs", "utf8"),
  ]);
  return { contract, migration, rehearsal, historicalRunnerTest };
}

test("validates the checked-in canonical rollback remediation", async () => {
  const result = await validateCanonicalRollbackRemediationFiles();
  assert.equal(result.status, "PASS_LOCAL_CANONICAL_ROLLBACK_STATE_MACHINE_REMEDIATION");
  assert.equal(result.productionAuthorization, false);
  assert.equal(result.canonicalCutoverAuthorized, false);
});

test("rejects migration checksum drift", async () => {
  const input = await fixture();
  input.migration += "\nSELECT 1;\n";
  assert.throws(() => validateCanonicalRollbackRemediation(input), /migration_boundary_invalid/u);
});

test("rejects a rollback that does not require canonical active authority", async () => {
  const input = await fixture();
  input.migration = input.migration.replace(
    "control_row.phase <> 'canonical' OR control_row.write_frozen",
    "control_row.phase <> 'canonical'",
  );
  input.contract.migration.sha256 = "0".repeat(64);
  assert.throws(() => validateCanonicalRollbackRemediation(input), /migration_boundary_invalid|migration_sql_guard_missing/u);
});

test("rejects production or cutover inflation", async () => {
  const input = await fixture();
  input.contract.productionAuthorization = true;
  input.contract.resultBoundary.canonicalCutoverAuthorized = true;
  assert.throws(() => validateCanonicalRollbackRemediation(input), /production_claim_invalid/u);
});
