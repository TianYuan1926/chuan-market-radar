import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildM0ExitReport,
  isValidV2ExecutionEntryId,
} from "./m0-exit-validator";

test("execution entry ids admit only milestone ids and reviewed production controls", () => {
  assert.equal(isValidV2ExecutionEntryId("V2-M1.6-P0R"), true);
  assert.equal(isValidV2ExecutionEntryId("V2-A0-ENGINEERING-FOUNDATION"), true);
  assert.equal(
    isValidV2ExecutionEntryId("V2-PRODUCTION-EVIDENCE-GATEWAY-CADDY-ONLY"),
    true,
  );
  assert.equal(isValidV2ExecutionEntryId("V2-PRODUCTION-UNREVIEWED-CONTROL"), false);
  assert.equal(isValidV2ExecutionEntryId("V2-LEGACY-G0"), false);
  assert.equal(isValidV2ExecutionEntryId("V2-M1.6-P0R\nV2-M2.1"), false);
  assert.equal(isValidV2ExecutionEntryId("V2-PRODUCTION-EVIDENCE-GATEWAY-CADDY-ONLY\nV2-M1"), false);
});

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
    longTermEngineeringGovernance: {
      status: string;
      dynamicBlueprintPositiveAdjustmentGate: {
        required: boolean;
        routeDriftAllowed: boolean;
      };
      generalizationAndAntiOverfitGate: {
        required: boolean;
        productionAuthorityBeforePass: boolean;
      };
    };
    engineeringFoundationGate: {
      status: string;
      completedControls: string[];
      pendingControls: string[];
      m1_5cAllowed: boolean;
      m1_5dAllowed: boolean;
      independentSecurityQuality: {
        postClosureRemediationValidation: {
          sourceCommitParts: string[];
        };
      };
      reproducibleReleaseAndResourceBaseline: {
        sourceCommitParts: string[];
        status: string;
        workflowRunId: number;
        productionMutationPerformed: boolean;
      };
    };
    lastCompletedImplementationEntry: { id: string };
    currentLocalImplementationEntry: { id: string; status: string };
    lastCompletedEngineeringControl: {
      id: string;
      sourceCommitParts: string[];
      status: string;
      releaseQualificationWorkflowRunId: number;
      fullQualityWorkflowRunId: number;
      securityWorkflowRunId: number;
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
    "ENGINEERING_MATERIALS_SUPPLY_CHAIN_INDEPENDENT_SECURITY_REPRODUCIBLE_RELEASE_AND_RESOURCE_BASELINE_PASS_TOTAL_GATE_INCOMPLETE_P0R_PENDING",
  );
  assert.equal(
    matrix.longTermEngineeringGovernance.status,
    "ACTIVE_FIXED_CORE_DYNAMIC_BLUEPRINT_AND_ANTI_OVERFIT_FAIL_CLOSED",
  );
  assert.equal(
    matrix.longTermEngineeringGovernance
      .dynamicBlueprintPositiveAdjustmentGate.required,
    true,
  );
  assert.equal(
    matrix.longTermEngineeringGovernance
      .dynamicBlueprintPositiveAdjustmentGate.routeDriftAllowed,
    false,
  );
  assert.equal(
    matrix.longTermEngineeringGovernance.generalizationAndAntiOverfitGate
      .required,
    true,
  );
  assert.equal(
    matrix.longTermEngineeringGovernance.generalizationAndAntiOverfitGate
      .productionAuthorityBeforePass,
    false,
  );
  assert.equal(
    matrix.currentLocalImplementationEntry.status,
    "engineering_materials_supply_chain_independent_security_reproducible_release_and_resource_baseline_remote_pass_total_gate_incomplete_p0r_pending",
  );
  assert.deepEqual(matrix.engineeringFoundationGate.pendingControls, [
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
  assert.ok(
    matrix.engineeringFoundationGate.completedControls.includes(
      "CREDENTIAL_SHAPED_IDENTITY_ROOT_CAUSE_REMEDIATION_SECURITY_RUN_30212437973",
    ),
  );
  assert.ok(
    matrix.engineeringFoundationGate.completedControls.includes(
      "CREDENTIAL_SHAPED_IDENTITY_ROOT_CAUSE_REMEDIATION_FULL_QUALITY_RUN_30212437974",
    ),
  );
  assert.ok(
    matrix.engineeringFoundationGate.completedControls.includes(
      "REPRODUCIBLE_ARTIFACT_PROVENANCE_AND_ROLLBACK_DRILL_RUN_30217335595",
    ),
  );
  assert.ok(
    matrix.engineeringFoundationGate.completedControls.includes(
      "PERFORMANCE_AND_RESOURCE_BASELINE_RUN_30217335595",
    ),
  );
  assert.deepEqual(
    matrix.engineeringFoundationGate.independentSecurityQuality
      .postClosureRemediationValidation.sourceCommitParts,
    [
      "9f6d4731e6afbf0a68d3",
      "2a98df64da179f20d84a",
    ],
  );
  assert.deepEqual(
    matrix.engineeringFoundationGate.reproducibleReleaseAndResourceBaseline
      .sourceCommitParts,
    [
      "9ef63b85d1a76f3ad7ac",
      "815e081506c5dbc074a5",
    ],
  );
  assert.equal(
    matrix.engineeringFoundationGate.reproducibleReleaseAndResourceBaseline
      .status,
    "PASS_REPRODUCIBLE_RELEASE_ROLLBACK_AND_FROZEN_ENGINEERING_RESOURCE_BASELINE",
  );
  assert.equal(
    matrix.engineeringFoundationGate.reproducibleReleaseAndResourceBaseline
      .workflowRunId,
    30217335595,
  );
  assert.equal(
    matrix.engineeringFoundationGate.reproducibleReleaseAndResourceBaseline
      .productionMutationPerformed,
    false,
  );
  assert.deepEqual(matrix.lastCompletedEngineeringControl, {
    id: "V2-A0-REPRODUCIBLE-RELEASE-AND-RESOURCE-BASELINE",
    sourceCommitParts: [
      "9ef63b85d1a76f3ad7ac",
      "815e081506c5dbc074a5",
    ],
    status:
      "remote_reproducible_release_rollback_resource_and_same_source_quality_security_pass_production_unchanged",
    releaseQualificationWorkflowRunId: 30217335595,
    fullQualityWorkflowRunId: 30217335543,
    securityWorkflowRunId: 30217335622,
    productionMutationPerformed: false,
  });
});
