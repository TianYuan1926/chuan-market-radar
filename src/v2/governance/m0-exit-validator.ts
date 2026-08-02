import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { MODULE_REGISTRY } from "../domain/module-registry";
import { RUNTIME_SCHEMA_NAMES } from "../runtime-schema/registry";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "../runtime-schema/schema-versions";
import {
  buildLegacyConsumerMap,
  resolveReviewedGitCommit,
  type LegacyCapabilityAtlas,
  type LegacyConsumerMap,
  type LegacyExtractionPolicy,
} from "./legacy-consumer-map";

const SECURITY_REMEDIATION_SOURCE_PARTS = [
  "9f6d4731e6afbf0a68d3",
  "2a98df64da179f20d84a",
] as const;

const A0_QUALIFICATION_SOURCE_PARTS = [
  "9ef63b85d1a76f3ad7ac",
  "815e081506c5dbc074a5",
] as const;

const EXACT_PRODUCTION_CI_WRAPPER =
  "bash scripts/v2/production/run-exact-toolchain.sh ci:production:exact";

const EXACT_PRODUCTION_CI_COMMANDS = [
  "npm run ci:forbidden-files",
  "npm run ci:secret-patterns",
  "npm run v2:a0:materials:verify",
  "npm run test:recurrence-gate",
  "npm run test:production-dispatch",
  "npm run typecheck",
  "npm run lint",
  "npm run test:market",
  "npm run test:v2-foundation",
  "npm run test:v2-ops",
  "npm run v2:m0:verify",
  "npm run build",
  "npm run backtest:golden",
  "npm run security:check",
] as const;

const EXACT_M0_VERIFIER =
  "npm run build:market-cli && npm run v2:m0:verify:compiled";
const EXACT_M0_COMPILED_VERIFIER =
  "node .tmp/market-tests/v2/governance/m0-exit-validator.js";

export type M0ExitCheck = Readonly<{
  id: string;
  passed: boolean;
  evidence: string;
}>;

export type M0ExitReport = Readonly<{
  schemaVersion: "market-radar-v2-m0-exit-report.v1";
  status: "PASS_M0_ENGINEERING_EXIT_PRODUCTION_UNCHANGED" | "FAIL_M0_EXIT";
  branch: string;
  checks: readonly M0ExitCheck[];
  authorityOutputs: number;
  runtimeSchemas: number;
  legacyCapabilities: number;
  legacySourceFiles: number;
  productionMutationPerformed: false;
  productionStatus: "UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION";
  nextEntry: string;
}>;

type CheckRunner = () => string;

export function validateM0ProductionCiBinding(
  scripts: Readonly<Record<string, string>>,
): string {
  const wrapper = scripts["ci:production"] ?? "";
  if (wrapper !== EXACT_PRODUCTION_CI_WRAPPER) {
    throw new Error(
      "ci:production is not bound to the exact-toolchain production target",
    );
  }

  const exactProductionCi = scripts["ci:production:exact"] ?? "";
  const expectedProductionCi = EXACT_PRODUCTION_CI_COMMANDS.join(" && ");
  if (exactProductionCi !== expectedProductionCi) {
    throw new Error(
      "ci:production:exact differs from the locked production quality chain",
    );
  }

  if (scripts["v2:m0:verify"] !== EXACT_M0_VERIFIER) {
    throw new Error("v2:m0:verify is not the self-building M0 verifier");
  }
  if (scripts["v2:m0:verify:compiled"] !== EXACT_M0_COMPILED_VERIFIER) {
    throw new Error(
      "v2:m0:verify:compiled does not execute the compiled M0 authority",
    );
  }

  return `${EXACT_PRODUCTION_CI_COMMANDS.length} locked production gates + exact-toolchain wrapper + self-building M0 verifier`;
}

function readJson<T>(repositoryRoot: string, path: string): T {
  return JSON.parse(
    readFileSync(resolve(repositoryRoot, path), "utf8"),
  ) as T;
}

function listSourceFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  const files: string[] = [];
  for (const name of readdirSync(root).sort()) {
    const path = resolve(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(path));
    } else if (/\.(?:ts|tsx)$/u.test(name)) {
      files.push(path);
    }
  }
  return files;
}

function importSpecifiers(path: string): string[] {
  return ts
    .preProcessFile(readFileSync(path, "utf8"), true, true)
    .importedFiles.map((entry) => entry.fileName);
}

function gitOutputLines(repositoryRoot: string, args: readonly string[]): string[] {
  return execFileSync("git", [...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isolationViolations(repositoryRoot: string): string[] {
  const sourceRoot = resolve(repositoryRoot, "src");
  const v2Root = resolve(sourceRoot, "v2");
  const violations: string[] = [];

  for (const file of listSourceFiles(v2Root)) {
    const repositoryPath = relative(repositoryRoot, file).split(sep).join("/");
    const productionFile =
      !file.endsWith(".test.ts") &&
      !file.includes(`${sep}fixtures${sep}`) &&
      !file.includes(`${sep}testing${sep}`);
    for (const specifier of importSpecifiers(file)) {
      if (
        productionFile &&
        (specifier.includes("fixtures") || specifier.includes("testing"))
      ) {
        violations.push(`${repositoryPath}:test-support:${specifier}`);
      }
      if (!productionFile) {
        continue;
      }
      if (specifier.startsWith("@/") && !specifier.startsWith("@/v2")) {
        violations.push(`${repositoryPath}:legacy-alias:${specifier}`);
      }
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(file), specifier);
        if (target !== v2Root && !target.startsWith(`${v2Root}${sep}`)) {
          violations.push(`${repositoryPath}:v2-escape:${specifier}`);
        }
      }
    }
  }

  for (const file of listSourceFiles(sourceRoot)) {
    if (file === v2Root || file.startsWith(`${v2Root}${sep}`)) {
      continue;
    }
    const repositoryPath = relative(repositoryRoot, file).split(sep).join("/");
    for (const specifier of importSpecifiers(file)) {
      if (specifier.startsWith("@/v2")) {
        violations.push(`${repositoryPath}:v2-alias:${specifier}`);
      }
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(file), specifier);
        if (target === v2Root || target.startsWith(`${v2Root}${sep}`)) {
          violations.push(`${repositoryPath}:legacy-to-v2:${specifier}`);
        }
      }
    }
  }

  return violations.sort();
}

export function buildM0ExitReport(repositoryRoot: string): M0ExitReport {
  const atlas = readJson<LegacyCapabilityAtlas>(
    repositoryRoot,
    "docs/architecture/v2/legacy-capability-atlas.v1.json",
  );
  const policy = readJson<LegacyExtractionPolicy>(
    repositoryRoot,
    "docs/architecture/v2/LEGACY_EXTRACTION_POLICY_V2.json",
  );
  const committedMap = readJson<LegacyConsumerMap>(
    repositoryRoot,
    "docs/architecture/v2/legacy-consumer-map.v2.json",
  );
  const baseManifest = readJson<{
    implementation: { branch: string };
    production: { mutationPerformed: boolean; finalStatus: string };
    authorizations: {
      productionMutation: boolean;
      databaseMigration: boolean;
      legacyDeletion: boolean;
      automaticTrading: boolean;
    };
  }>(repositoryRoot, "docs/architecture/v2/V2_BASE_MANIFEST.v1.json");
  const executionMatrix = readJson<{
    lastCompletedImplementationEntry: { id: string };
    longTermEngineeringGovernance: {
      status: string;
      fixedInvariants: readonly string[];
      dynamicBlueprintPositiveAdjustmentGate: {
        required: boolean;
        checks: readonly string[];
        routeDriftAllowed: boolean;
      };
      generalizationAndAntiOverfitGate: {
        required: boolean;
        protectedDimensions: readonly string[];
        requiredEvidence: readonly string[];
        productionAuthorityBeforePass: boolean;
      };
      productionMutationPerformed: boolean;
    };
    engineeringFoundationGate: {
      id: string;
      status: string;
      completedControls: readonly string[];
      pendingControls: readonly string[];
      m1_5cAllowed: boolean;
      m1_5dAllowed: boolean;
      independentSecurityQuality: {
        postClosureRemediationValidation: {
          sourceCommitParts: readonly string[];
          securityWorkflowRunId: number;
          fullQualityWorkflowRunId: number;
          fullQualityJobId: number;
          secretScan: {
            findingCount: number;
          };
          codeql: {
            resultCount: number;
            reviewedSuppressionCount: number;
            blockingResultCount: number;
          };
          collectorImageScan: {
            criticalCount: number;
            highCount: number;
          };
          productionMutationPerformed: boolean;
        };
      };
      reproducibleReleaseAndResourceBaseline: {
        sourceCommitParts: readonly string[];
        status: string;
        workflowRunId: number;
        releaseProvenance: {
          jobId: number;
          status: string;
          artifactId: number;
          rollbackStatuses: readonly string[];
        };
        performanceAndResourceBaseline: {
          jobId: number;
          status: string;
          evidenceClass: string;
          measuredColdCycles: number;
          measuredIncrementalCycles: number;
          eventLoopDelayP99Ms: number;
          artifactId: number;
          liveCapacityClaimAllowed: boolean;
        };
        exactSourceFullQuality: {
          workflowRunId: number;
          jobId: number;
          status: string;
        };
        exactSourceIndependentSecurity: {
          workflowRunId: number;
          status: string;
          secretFindingCount: number;
          codeqlUntriagedResultCount: number;
          collectorImageHighCount: number;
          collectorImageCriticalCount: number;
        };
        productionMutationPerformed: boolean;
      };
    };
    currentLocalImplementationEntry: {
      id: string;
      status: string;
      productionMutationAllowed: boolean;
    };
    lastCompletedEngineeringControl: {
      id: string;
      sourceCommitParts: readonly string[];
      status: string;
      releaseQualificationWorkflowRunId: number;
      fullQualityWorkflowRunId: number;
      securityWorkflowRunId: number;
      productionMutationPerformed: boolean;
    };
    nextScopeV2ImplementationEntry: {
      id: string;
      blockedBy: string;
      productionMutationAllowed: boolean;
    };
    currentImplementationEntry: {
      id: string;
      productionMutationAllowed: boolean;
    };
    pendingHistoricalDataGate: { id: string };
  }>(
    repositoryRoot,
    "docs/blueprints/market-radar-v2-controlled-replacement-traceability.v1.json",
  );
  const fixture = readJson<{
    fixtureKind: string;
    synthetic: boolean;
    mustNeverEnterRuntime: boolean;
  }>(repositoryRoot, "src/v2/fixtures/m1-foundation-slice.v1.json");
  const packageJson = readJson<{
    dependencies: Record<string, string>;
    scripts: Record<string, string>;
  }>(repositoryRoot, "package.json");
  const currentMap = buildLegacyConsumerMap(repositoryRoot, atlas, policy);
  const branch = execFileSync("git", ["branch", "--show-current"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  const authorityOutputs = MODULE_REGISTRY.flatMap(
    (definition) => definition.authorityOutputs,
  ).sort();
  const checks: M0ExitCheck[] = [];

  function check(id: string, runner: CheckRunner): void {
    try {
      checks.push({ id, passed: true, evidence: runner() });
    } catch (error) {
      checks.push({
        id,
        passed: false,
        evidence: error instanceof Error ? error.message : "unknown validation error",
      });
    }
  }

  check("clean_v2_branch_identity", () => {
    if (branch !== baseManifest.implementation.branch) {
      throw new Error(
        `branch ${branch} does not match ${baseManifest.implementation.branch}`,
      );
    }
    return branch;
  });

  check("single_runtime_schema_per_authority_output", () => {
    const objectSchemaVersions = Object.values(RUNTIME_OBJECT_SCHEMA_VERSIONS);
    if (
      authorityOutputs.length !== new Set(authorityOutputs).size ||
      JSON.stringify(authorityOutputs) !== JSON.stringify(RUNTIME_SCHEMA_NAMES) ||
      objectSchemaVersions.length !== authorityOutputs.length - 1 ||
      new Set(objectSchemaVersions).size !== objectSchemaVersions.length
    ) {
      throw new Error(
        "runtime schema registry or exact version registry does not cover authority outputs",
      );
    }
    return `${RUNTIME_SCHEMA_NAMES.length} strict schemas / ${objectSchemaVersions.length} exact envelope versions`;
  });

  check("legacy_consumer_map_current", () => {
    if (JSON.stringify(currentMap) !== JSON.stringify(committedMap)) {
      throw new Error("committed Legacy consumer map differs from current source graph");
    }
    return `${currentMap.totals.sourceFiles} source files / ${currentMap.totals.directRuntimeConsumerEdges} runtime edges`;
  });

  check("legacy_sources_match_reviewed_commit", () => {
    const reviewedCommit = resolveReviewedGitCommit(
      policy.reviewedAgainstCommit,
    );
    execFileSync(
      "git",
      ["cat-file", "-e", `${reviewedCommit}^{commit}`],
      { cwd: repositoryRoot, stdio: "ignore" },
    );
    execFileSync(
      "git",
      ["merge-base", "--is-ancestor", reviewedCommit, "HEAD"],
      { cwd: repositoryRoot, stdio: "ignore" },
    );

    const protectedSources = new Set(
      [...currentMap.capabilities, ...committedMap.capabilities].flatMap(
        (capability) => capability.sourceFiles,
      ),
    );
    const changedPaths = new Set([
      ...gitOutputLines(repositoryRoot, [
        "diff",
        "--name-only",
        "--diff-filter=ACDMRT",
        reviewedCommit,
        "--",
      ]),
      ...gitOutputLines(repositoryRoot, [
        "ls-files",
        "--others",
        "--exclude-standard",
      ]),
    ]);
    const changedLegacySources = [...changedPaths]
      .filter((path) => protectedSources.has(path))
      .sort();
    if (changedLegacySources.length > 0) {
      throw new Error(
        `Legacy sources changed after policy review: ${changedLegacySources
          .slice(0, 5)
          .join(", ")}`,
      );
    }
    return `${reviewedCommit} / zero protected source drift`;
  });

  check("legacy_extraction_policy_closed", () => {
    if (
      currentMap.legacyDeletionAllowed ||
      currentMap.legacyRuntimeImportAllowed ||
      currentMap.copyPasteWithoutBehavioralFixtureAllowed ||
      currentMap.capabilities.some((capability) => capability.deletionAllowedNow)
    ) {
      throw new Error("Legacy extraction or deletion policy is open");
    }
    return `${currentMap.totals.extractionCandidates} reviewed extraction candidates / deletion false`;
  });

  check("v2_legacy_bidirectional_import_fence", () => {
    const violations = isolationViolations(repositoryRoot);
    if (violations.length > 0) {
      throw new Error(violations.slice(0, 5).join(", "));
    }
    return "zero V2/Legacy production import violations";
  });

  check("synthetic_fixture_runtime_forbidden", () => {
    if (
      fixture.fixtureKind !== "TEST_ONLY_POINT_IN_TIME" ||
      !fixture.synthetic ||
      !fixture.mustNeverEnterRuntime
    ) {
      throw new Error("M1 fixture lost its explicit test-only boundary");
    }
    return "test-only / synthetic / runtime-forbidden";
  });

  check("runtime_schema_dependency_pinned", () => {
    if (packageJson.dependencies.zod !== "4.4.3") {
      throw new Error("zod runtime schema dependency is not pinned to 4.4.3");
    }
    return "zod@4.4.3";
  });

  check("m0_gates_in_production_ci", () => {
    return validateM0ProductionCiBinding(packageJson.scripts);
  });

  check("production_and_destructive_authority_closed", () => {
    if (
      baseManifest.production.mutationPerformed ||
      baseManifest.authorizations.productionMutation ||
      baseManifest.authorizations.databaseMigration ||
      baseManifest.authorizations.legacyDeletion ||
      baseManifest.authorizations.automaticTrading
    ) {
      throw new Error("M0 baseline contains forbidden production authority");
    }
    if (
      baseManifest.production.finalStatus !==
      "unknown_until_fresh_read_only_verification"
    ) {
      throw new Error("M0 baseline overstates current production truth");
    }
    return "production mutation false / destructive authority false / status unknown";
  });

  check("long_term_goal_governance_current", () => {
    const governance = executionMatrix.longTermEngineeringGovernance;
    const expectedInvariants = [
      "CORE_OPPORTUNITY_DISCOVERY_AND_DECISION_CHAIN",
      "POINT_IN_TIME_DATA_TRUTH",
      "SECURITY_RECOVERY_AND_ROLLBACK",
      "GENERALIZATION_AND_ANTI_OVERFIT",
      "FINAL_PRACTICAL_ACCEPTANCE",
    ];
    const expectedBlueprintChecks = [
      "CURRENT_FACT_RECHECK",
      "CORE_VALUE_LINK",
      "REAL_DEPENDENCY_REVALIDATION",
      "UPSTREAM_DOWNSTREAM_TRACE",
      "NO_TEST_SAMPLE_OBSERVATION_SECURITY_RECOVERY_ACCEPTANCE_DEGRADATION",
      "VALIDATION_FAILURE_AND_ROLLBACK",
      "AUTHORITY_DOCUMENT_SYNC",
      "SUPERSEDED_TRUTH_INVALIDATION",
    ];
    const expectedProtectedDimensions = [
      "MODEL",
      "RULE",
      "THRESHOLD",
      "FEATURE",
      "INSTRUMENT",
      "VENUE",
      "TIME_WINDOW",
      "MARKET_REGIME",
      "LIQUIDITY",
      "DIRECTION",
      "ASSET_DOMAIN",
      "POST_HOC_EXPLANATION",
    ];
    const expectedGeneralizationEvidence = [
      "PRE_REGISTERED_HYPOTHESIS_FEATURE_OUTCOME_AND_TRIAL_REGISTRY",
      "POINT_IN_TIME_TARGET_BLIND_DATA",
      "UP_DOWN_AND_NON_EVENT_OUTCOMES",
      "MATCHED_CONTROL",
      "PURGED_EMBARGO_WALK_FORWARD",
      "ABLATION_AND_SIMPLE_BASELINE",
      "PARAMETER_NEIGHBORHOOD_STABILITY",
      "MULTIPLE_TESTING_CONTROL",
      "SEALED_UNTOUCHED_HOLDOUT",
      "FORWARD_NO_AUTHORITY_SHADOW",
      "INDEPENDENT_AUDIT",
      "FEES_SLIPPAGE_DEPTH_CAPACITY_AND_LATENCY",
    ];
    if (
      governance.status !==
        "ACTIVE_FIXED_CORE_DYNAMIC_BLUEPRINT_AND_ANTI_OVERFIT_FAIL_CLOSED" ||
      governance.fixedInvariants.join("|") !== expectedInvariants.join("|") ||
      !governance.dynamicBlueprintPositiveAdjustmentGate.required ||
      governance.dynamicBlueprintPositiveAdjustmentGate.checks.join("|") !==
        expectedBlueprintChecks.join("|") ||
      governance.dynamicBlueprintPositiveAdjustmentGate.routeDriftAllowed ||
      !governance.generalizationAndAntiOverfitGate.required ||
      governance.generalizationAndAntiOverfitGate.protectedDimensions.join(
        "|",
      ) !== expectedProtectedDimensions.join("|") ||
      governance.generalizationAndAntiOverfitGate.requiredEvidence.join("|") !==
        expectedGeneralizationEvidence.join("|") ||
      governance.generalizationAndAntiOverfitGate.productionAuthorityBeforePass ||
      governance.productionMutationPerformed
    ) {
      throw new Error(
        "long-term goal, dynamic-blueprint or anti-overfit governance drifted",
      );
    }
    return "fixed core / dynamic blueprint / anti-overfit fail closed";
  });

  check("active_execution_entry_matches_machine_matrix", () => {
    const ids = [
      executionMatrix.lastCompletedImplementationEntry.id,
      executionMatrix.currentLocalImplementationEntry.id,
      executionMatrix.currentImplementationEntry.id,
      executionMatrix.nextScopeV2ImplementationEntry.id,
      executionMatrix.pendingHistoricalDataGate.id,
    ];
    if (ids.some((id) => !/^V2-(?:A0|M[0-9])/u.test(id))) {
      throw new Error("machine matrix contains an invalid implementation entry id");
    }
    if (new Set(ids).size !== ids.length) {
      throw new Error("machine matrix reuses one identity across execution lanes");
    }
    const securityRemediation = executionMatrix.engineeringFoundationGate
      .independentSecurityQuality.postClosureRemediationValidation;
    const securityRemediationEvidenceExact =
      securityRemediation.sourceCommitParts.length === 2
      && securityRemediation.sourceCommitParts.every(
        (part) => /^[0-9a-f]{20}$/u.test(part),
      )
      && securityRemediation.sourceCommitParts.join("")
        === SECURITY_REMEDIATION_SOURCE_PARTS.join("")
      && securityRemediation.securityWorkflowRunId === 30212437973
      && securityRemediation.fullQualityWorkflowRunId === 30212437974
      && securityRemediation.fullQualityJobId === 89820836431
      && securityRemediation.secretScan.findingCount === 0
      && securityRemediation.codeql.resultCount === 8
      && securityRemediation.codeql.reviewedSuppressionCount === 8
      && securityRemediation.codeql.blockingResultCount === 0
      && securityRemediation.collectorImageScan.criticalCount === 0
      && securityRemediation.collectorImageScan.highCount === 0
      && !securityRemediation.productionMutationPerformed;
    const qualification = executionMatrix.engineeringFoundationGate
      .reproducibleReleaseAndResourceBaseline;
    const qualificationEvidenceExact =
      qualification.sourceCommitParts.length === 2
      && qualification.sourceCommitParts.every(
        (part) => /^[0-9a-f]{20}$/u.test(part),
      )
      && qualification.sourceCommitParts.join("")
        === A0_QUALIFICATION_SOURCE_PARTS.join("")
      && qualification.status
        === "PASS_REPRODUCIBLE_RELEASE_ROLLBACK_AND_FROZEN_ENGINEERING_RESOURCE_BASELINE"
      && qualification.workflowRunId === 30217335595
      && qualification.releaseProvenance.jobId === 89833713538
      && qualification.releaseProvenance.status
        === "PASS_REPRODUCIBLE_ROOTFS_EXACT_CONFIG_PROVENANCE_AND_ROLLBACK"
      && qualification.releaseProvenance.artifactId === 8636196061
      && qualification.releaseProvenance.rollbackStatuses.join("|") ===
        [
          "PASS_POINTER_UNCHANGED",
          "PASS_EXACT_BASELINE_RESTORED",
          "PASS_EXACT_BASELINE_RESTORED",
        ].join("|")
      && qualification.performanceAndResourceBaseline.jobId === 89833713570
      && qualification.performanceAndResourceBaseline.status
        === "PASS_FROZEN_ENGINEERING_RESOURCE_BASELINE"
      && qualification.performanceAndResourceBaseline.evidenceClass
        === "TEST_ONLY_ENGINEERING_RESOURCE_BASELINE_NOT_LIVE_MARKET_CAPACITY"
      && qualification.performanceAndResourceBaseline.measuredColdCycles === 12
      && qualification.performanceAndResourceBaseline
        .measuredIncrementalCycles === 60
      && qualification.performanceAndResourceBaseline.eventLoopDelayP99Ms
        === 64.75
      && qualification.performanceAndResourceBaseline.artifactId === 8636187635
      && !qualification.performanceAndResourceBaseline.liveCapacityClaimAllowed
      && qualification.exactSourceFullQuality.workflowRunId === 30217335543
      && qualification.exactSourceFullQuality.jobId === 89833713330
      && qualification.exactSourceFullQuality.status === "PASS"
      && qualification.exactSourceIndependentSecurity.workflowRunId
        === 30217335622
      && qualification.exactSourceIndependentSecurity.status
        === "PASS_ZERO_UNTRIAGED_SECRET_SAST_AND_HIGH_CRITICAL_IMAGE_RESULTS"
      && qualification.exactSourceIndependentSecurity.secretFindingCount === 0
      && qualification.exactSourceIndependentSecurity
        .codeqlUntriagedResultCount === 0
      && qualification.exactSourceIndependentSecurity
        .collectorImageHighCount === 0
      && qualification.exactSourceIndependentSecurity
        .collectorImageCriticalCount === 0
      && !qualification.productionMutationPerformed;
    if (
      executionMatrix.currentLocalImplementationEntry.id !==
        executionMatrix.engineeringFoundationGate.id ||
      executionMatrix.engineeringFoundationGate.status !==
        "ENGINEERING_MATERIALS_SUPPLY_CHAIN_INDEPENDENT_SECURITY_REPRODUCIBLE_RELEASE_AND_RESOURCE_BASELINE_PASS_TOTAL_GATE_INCOMPLETE_P0R_PENDING" ||
      executionMatrix.currentLocalImplementationEntry.status !==
        "engineering_materials_supply_chain_independent_security_reproducible_release_and_resource_baseline_remote_pass_total_gate_incomplete_p0r_pending" ||
      executionMatrix.engineeringFoundationGate.pendingControls.join("|") !==
        [
          "P0R_REAL_ENCRYPTED_BACKUP_EXACT_RETRIEVAL_AND_ISOLATED_RESTORE",
        ].join("|") ||
      !executionMatrix.engineeringFoundationGate.completedControls.includes(
        "INDEPENDENT_FULL_HISTORY_GITLEAKS_8_30_1_ZERO_FINDINGS_RUN_30209898205",
      ) ||
      !executionMatrix.engineeringFoundationGate.completedControls.includes(
        "INDEPENDENT_CODEQL_ZERO_UNTRIAGED_RESULTS_RUN_30209898205",
      ) ||
      !executionMatrix.engineeringFoundationGate.completedControls.includes(
        "COLLECTOR_IMAGE_TRIVY_ZERO_HIGH_CRITICAL_RUN_30209898205",
      ) ||
      !executionMatrix.engineeringFoundationGate.completedControls.includes(
        "CREDENTIAL_SHAPED_IDENTITY_ROOT_CAUSE_REMEDIATION_SECURITY_RUN_30212437973",
      ) ||
      !executionMatrix.engineeringFoundationGate.completedControls.includes(
        "CREDENTIAL_SHAPED_IDENTITY_ROOT_CAUSE_REMEDIATION_FULL_QUALITY_RUN_30212437974",
      ) ||
      !executionMatrix.engineeringFoundationGate.completedControls.includes(
        "REPRODUCIBLE_ARTIFACT_PROVENANCE_AND_ROLLBACK_DRILL_RUN_30217335595",
      ) ||
      !executionMatrix.engineeringFoundationGate.completedControls.includes(
        "PERFORMANCE_AND_RESOURCE_BASELINE_RUN_30217335595",
      ) ||
      !executionMatrix.engineeringFoundationGate.completedControls.includes(
        "EXACT_QUALIFICATION_FULL_QUALITY_RUN_30217335543",
      ) ||
      !executionMatrix.engineeringFoundationGate.completedControls.includes(
        "EXACT_QUALIFICATION_SECURITY_RUN_30217335622",
      ) ||
      !securityRemediationEvidenceExact ||
      !qualificationEvidenceExact ||
      executionMatrix.lastCompletedEngineeringControl.id !==
        "V2-A0-REPRODUCIBLE-RELEASE-AND-RESOURCE-BASELINE" ||
      executionMatrix.lastCompletedEngineeringControl.sourceCommitParts.length !==
        2 ||
      executionMatrix.lastCompletedEngineeringControl.sourceCommitParts.some(
        (part) => !/^[0-9a-f]{20}$/u.test(part),
      ) ||
      executionMatrix.lastCompletedEngineeringControl.sourceCommitParts.join(
        "",
      ) !== A0_QUALIFICATION_SOURCE_PARTS.join("") ||
      executionMatrix.lastCompletedEngineeringControl.status !==
        "remote_reproducible_release_rollback_resource_and_same_source_quality_security_pass_production_unchanged" ||
      executionMatrix.lastCompletedEngineeringControl
        .releaseQualificationWorkflowRunId !== 30217335595 ||
      executionMatrix.lastCompletedEngineeringControl.fullQualityWorkflowRunId
        !== 30217335543 ||
      executionMatrix.lastCompletedEngineeringControl.securityWorkflowRunId
        !== 30217335622 ||
      executionMatrix.lastCompletedEngineeringControl.productionMutationPerformed ||
      executionMatrix.engineeringFoundationGate.m1_5cAllowed ||
      executionMatrix.engineeringFoundationGate.m1_5dAllowed
    ) {
      throw new Error("A0 current local gate or blocked Shadow authority drifted");
    }
    if (
      executionMatrix.nextScopeV2ImplementationEntry.blockedBy !==
        executionMatrix.engineeringFoundationGate.id
    ) {
      throw new Error("next Scope V2 package is not explicitly blocked by A0");
    }
    if (
      executionMatrix.currentLocalImplementationEntry.productionMutationAllowed ||
      executionMatrix.currentImplementationEntry.productionMutationAllowed ||
      executionMatrix.nextScopeV2ImplementationEntry.productionMutationAllowed
    ) {
      throw new Error("active execution lane unexpectedly grants production mutation");
    }
    return ids.join(" -> ");
  });

  const passed = checks.every((item) => item.passed);
  return {
    schemaVersion: "market-radar-v2-m0-exit-report.v1",
    status: passed
      ? "PASS_M0_ENGINEERING_EXIT_PRODUCTION_UNCHANGED"
      : "FAIL_M0_EXIT",
    branch,
    checks,
    authorityOutputs: authorityOutputs.length,
    runtimeSchemas: RUNTIME_SCHEMA_NAMES.length,
    legacyCapabilities: currentMap.totals.capabilities,
    legacySourceFiles: currentMap.totals.sourceFiles,
    productionMutationPerformed: false,
    productionStatus: "UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION",
    nextEntry: `COMPLETED=${executionMatrix.lastCompletedImplementationEntry.id} LOCAL_GATE=${executionMatrix.currentLocalImplementationEntry.id} PRODUCTION_NEXT=${executionMatrix.currentImplementationEntry.id} SCOPE_V2_NEXT=${executionMatrix.nextScopeV2ImplementationEntry.id} EXTERNAL_GATE=${executionMatrix.pendingHistoricalDataGate.id} DETECTORS_DRAFT`,
  };
}

if (require.main === module) {
  const report = buildM0ExitReport(process.cwd());
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "PASS_M0_ENGINEERING_EXIT_PRODUCTION_UNCHANGED") {
    process.exitCode = 1;
  }
}
