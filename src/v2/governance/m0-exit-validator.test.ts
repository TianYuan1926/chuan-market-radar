import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { buildM0ExitReport } from "./m0-exit-validator";

test("M0 engineering exit remains closed unless every required proof passes", () => {
  const report = buildM0ExitReport(process.cwd());
  const matrix = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "docs/blueprints/market-radar-v2-controlled-replacement-traceability.v1.json",
      ),
      "utf8",
    ),
  ) as {
    engineeringFoundationGate: {
      status: string;
      completedControls: string[];
      pendingControls: string[];
      m1_5cAllowed: boolean;
      m1_5dAllowed: boolean;
    };
    lastCompletedImplementationEntry: { id: string };
    currentLocalImplementationEntry: { id: string; status: string };
    lastCompletedEngineeringControl: {
      id: string;
      sourceCommit: string;
      status: string;
      securityWorkflowRunId: number;
      fullQualityWorkflowRunId: number;
      productionMutationPerformed: boolean;
    };
    currentImplementationEntry: { id: string };
    nextScopeV2ImplementationEntry: { id: string };
    pendingHistoricalDataGate: { id: string };
  };

  assert.equal(
    report.status,
    "PASS_M0_ENGINEERING_EXIT_PRODUCTION_UNCHANGED",
    JSON.stringify(
      report.checks.filter((check) => !check.passed),
      null,
      2,
    ),
  );
  assert.equal(report.authorityOutputs, 30);
  assert.equal(report.runtimeSchemas, 30);
  assert.equal(report.productionMutationPerformed, false);
  assert.equal(
    report.productionStatus,
    "UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION",
  );
  assert.ok(report.checks.length >= 10);
  assert.ok(report.checks.every((check) => check.passed));
  assert.ok(
    report.checks.some(
      (check) => check.id === "legacy_sources_match_reviewed_commit",
    ),
  );
  assert.equal(
    report.nextEntry,
    `COMPLETED=${matrix.lastCompletedImplementationEntry.id} LOCAL_GATE=${matrix.currentLocalImplementationEntry.id} PRODUCTION_NEXT=${matrix.currentImplementationEntry.id} SCOPE_V2_NEXT=${matrix.nextScopeV2ImplementationEntry.id} EXTERNAL_GATE=${matrix.pendingHistoricalDataGate.id} DETECTORS_DRAFT`,
  );
  assert.ok(
    report.checks.some(
      (check) => check.id === "active_execution_entry_matches_machine_matrix",
    ),
  );
  assert.equal(
    matrix.engineeringFoundationGate.status,
    "ENGINEERING_MATERIALS_SUPPLY_CHAIN_AND_INDEPENDENT_SECURITY_PASS_TOTAL_GATE_INCOMPLETE",
  );
  assert.equal(
    matrix.currentLocalImplementationEntry.status,
    "engineering_materials_supply_chain_exact_runtime_and_independent_security_remote_pass_total_gate_incomplete",
  );
  assert.deepEqual(matrix.engineeringFoundationGate.pendingControls, [
    "REPRODUCIBLE_ARTIFACT_PROVENANCE_AND_ROLLBACK_DRILL",
    "PERFORMANCE_AND_RESOURCE_BASELINE",
    "P0R_REAL_ENCRYPTED_BACKUP_EXACT_RETRIEVAL_AND_ISOLATED_RESTORE",
  ]);
  assert.ok(
    matrix.engineeringFoundationGate.completedControls.includes(
      "INDEPENDENT_FULL_HISTORY_GITLEAKS_8_30_1_ZERO_FINDINGS_RUN_30209898205",
    ),
  );
  assert.ok(
    matrix.engineeringFoundationGate.completedControls.includes(
      "INDEPENDENT_CODEQL_ZERO_UNTRIAGED_RESULTS_RUN_30209898205",
    ),
  );
  assert.ok(
    matrix.engineeringFoundationGate.completedControls.includes(
      "COLLECTOR_IMAGE_TRIVY_ZERO_HIGH_CRITICAL_RUN_30209898205",
    ),
  );
  assert.deepEqual(matrix.lastCompletedEngineeringControl, {
    id: "V2-A0-INDEPENDENT-SECURITY-QUALITY",
    sourceCommit: "4f501b0fb8b917ce87e0687eab8480b5c9595f27",
    status:
      "remote_secret_sast_and_collector_image_security_pass_production_unchanged",
    securityWorkflowRunId: 30209898205,
    fullQualityWorkflowRunId: 30209898207,
    productionMutationPerformed: false,
  });
});
