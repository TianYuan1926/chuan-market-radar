import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  validateCollectorRuntimePackagePolicy,
  validateCodeqlEvidencePolicy,
  validateCodeqlSuppressionPolicy,
  validateA0ReleaseQualificationWorkflowPolicy,
  validateFullCiWorkflowPolicy,
  validateGitleaksFalsePositivePolicy,
  validatePackagePolicy,
  validateSegmentedSecuritySourceIdentity,
  validateSecurityEvidencePolicy,
  validateSecurityWorkflowPolicy,
  validateWorkflowPolicy,
} from "./a0-engineering-materials-gate.mjs";

function packageFixture() {
  return {
    packageJson: {
      packageManager: "npm@10.9.8",
      engines: { node: "22.23.1", npm: "10.9.8" },
      volta: { node: "22.23.1", npm: "10.9.8" },
      dependencies: {
        next: "16.2.12",
        react: "19.2.7",
      },
      devDependencies: {
        "@next/eslint-plugin-next": "16.2.12",
      },
    },
    packageLock: {
      packages: {
        "": {
          dependencies: {
            next: "16.2.12",
            react: "19.2.7",
          },
          devDependencies: {
            "@next/eslint-plugin-next": "16.2.12",
          },
        },
        "node_modules/next": {
          version: "16.2.12",
          license: "MIT",
        },
        "node_modules/react": {
          version: "19.2.7",
          license: "MIT",
        },
        "node_modules/@next/eslint-plugin-next": {
          version: "16.2.12",
          license: "MIT",
        },
      },
    },
  };
}

test("materials gate accepts exact runtime, package and license truth", () => {
  const fixture = packageFixture();
  assert.deepEqual(
    validatePackagePolicy(fixture.packageJson, fixture.packageLock),
    [],
  );
});

test("materials gate rejects latest, lock drift, vulnerable Next and GPL", () => {
  const fixture = packageFixture();
  fixture.packageJson.dependencies.next = "latest";
  fixture.packageLock.packages["node_modules/react"].license = "GPL-3.0";
  const codes = validatePackagePolicy(
    fixture.packageJson,
    fixture.packageLock,
  ).map((item) => item.code);
  assert.ok(codes.includes("DIRECT_DEPENDENCY_NOT_EXACT"));
  assert.ok(codes.includes("LOCK_ROOT_SPEC_DRIFT"));
  assert.ok(codes.includes("LOCK_RESOLUTION_DRIFT"));
  assert.ok(codes.includes("NEXT_SECURITY_PATCH_BELOW_MINIMUM"));
  assert.ok(codes.includes("NEXT_ESLINT_VERSION_DRIFT"));
  assert.ok(codes.includes("FORBIDDEN_STRONG_COPYLEFT_LICENSE"));
});

test("collector runtime lock remains a narrow production-only subset of the root lock", () => {
  const runtimePackage = JSON.parse(readFileSync(
    "deploy/v2/m1-collector/runtime/package.json",
    "utf8",
  ));
  const runtimePackageLock = JSON.parse(readFileSync(
    "deploy/v2/m1-collector/runtime/package-lock.json",
    "utf8",
  ));
  const rootPackageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  assert.deepEqual(validateCollectorRuntimePackagePolicy({
    rootPackageLock,
    runtimePackage,
    runtimePackageLock,
  }), []);

  const broadened = structuredClone(runtimePackage);
  broadened.dependencies.next = "16.2.12";
  assert.ok(validateCollectorRuntimePackagePolicy({
    rootPackageLock,
    runtimePackage: broadened,
    runtimePackageLock,
  }).some((item) => item.code === "V2_COLLECTOR_RUNTIME_MANIFEST_DRIFT"));

  const relicensed = structuredClone(runtimePackageLock);
  relicensed.packages["node_modules/pg"].license = "GPL-3.0";
  assert.ok(validateCollectorRuntimePackagePolicy({
    rootPackageLock,
    runtimePackage,
    runtimePackageLock: relicensed,
  }).some((item) => item.code === "V2_COLLECTOR_RUNTIME_LICENSE_REJECTED"));
});

test("workflow gate requires full action SHA and exact runner versions", () => {
  assert.deepEqual(
    validateWorkflowPolicy(
      ".github/workflows/pass.yml",
      [
        "jobs:",
        "  test:",
        "    runs-on: ubuntu-24.04",
        "    steps:",
        "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
        "      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
        "        with:",
        "          node-version: 22.23.1",
      ].join("\n"),
    ),
    [],
  );

  const codes = validateWorkflowPolicy(
    ".github/workflows/fail.yml",
    [
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - uses: actions/setup-node@v4",
      "        with:",
      "          node-version: 22",
    ].join("\n"),
  ).map((item) => item.code);
  assert.ok(codes.includes("GITHUB_ACTION_NOT_PINNED_TO_FULL_SHA"));
  assert.ok(codes.includes("GITHUB_NODE_RUNTIME_NOT_EXACT"));
  assert.ok(codes.includes("GITHUB_RUNNER_FLOATING_LATEST"));

  const staleV2Codes = validateWorkflowPolicy(
    ".github/workflows/v2-stale.yml",
    [
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-24.04",
      "    steps:",
      "      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
    ].join("\n"),
  ).map((item) => item.code);
  assert.ok(
    staleV2Codes.includes("V2_GITHUB_ACTION_REVISION_NOT_APPROVED"),
  );
});

test("full quality workflow retains the Git ancestry required by M0", () => {
  const workflow = [
    "on:",
    "  pull_request:",
    "  push:",
    "jobs:",
    "  test:",
    "    steps:",
    "      - name: Checkout exact source",
    "        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    "        with:",
    "          fetch-depth: 0",
    "          persist-credentials: false",
    "      - name: Run complete production CI",
    "        run: npm run ci:production",
  ].join("\n");
  assert.deepEqual(
    validateFullCiWorkflowPolicy(
      ".github/workflows/v2-full-quality.yml",
      workflow,
    ),
    [],
  );

  const issues = validateFullCiWorkflowPolicy(
    ".github/workflows/v2-full-quality.yml",
    workflow.replace("          fetch-depth: 0\n", ""),
  );
  assert.ok(
    issues.some((item) => item.code === "V2_FULL_CI_GIT_HISTORY_SHALLOW"),
  );
});

test("security workflow keeps independent fail-closed no-authority controls", () => {
  const path = ".github/workflows/v2-security-quality.yml";
  const source = readFileSync(path, "utf8");
  assert.deepEqual(validateSecurityWorkflowPolicy(path, source), []);

  const incomplete = validateSecurityWorkflowPolicy(
    path,
    source.replace("GITLEAKS_VERSION: \"8.30.1\"", "GITLEAKS_VERSION: latest"),
  );
  assert.ok(
    incomplete.some(
      (item) => item.code === "V2_SECURITY_TOOL_CONTRACT_INCOMPLETE",
    ),
  );

  const suppressionQueryMissing = validateSecurityWorkflowPolicy(
    path,
    source.replace(
      "packs: codeql/javascript-queries@2.4.1:AlertSuppression.ql",
      "packs: codeql/javascript-queries:AlertSuppression.ql",
    ),
  );
  assert.ok(
    suppressionQueryMissing.some(
      (item) => item.code === "V2_SECURITY_TOOL_CONTRACT_INCOMPLETE"
        || item.code === "V2_CODEQL_SUPPRESSION_QUERY_NOT_EXACT",
    ),
  );

  const privileged = validateSecurityWorkflowPolicy(
    path,
    `${source}\nenvironment: production\n`,
  );
  assert.ok(
    privileged.some(
      (item) => item.code === "V2_SECURITY_WORKFLOW_HAS_PRODUCTION_AUTHORITY",
    ),
  );
});

test("A0 release qualification keeps two independent builds and no production authority", () => {
  const path = ".github/workflows/v2-a0-release-qualification.yml";
  const source = readFileSync(path, "utf8");
  assert.deepEqual(
    validateA0ReleaseQualificationWorkflowPolicy(path, source),
    [],
  );

  const oneBuild = validateA0ReleaseQualificationWorkflowPolicy(
    path,
    source.replace("            --no-cache \\\n", ""),
  );
  assert.ok(
    oneBuild.some(
      (item) =>
        item.code === "V2_A0_RELEASE_INDEPENDENT_BUILD_COUNT_DRIFT",
    ),
  );

  const privileged = validateA0ReleaseQualificationWorkflowPolicy(
    path,
    `${source}\nenvironment: production\n`,
  );
  assert.ok(
    privileged.some(
      (item) =>
        item.code ===
          "V2_A0_RELEASE_QUALIFICATION_HAS_PRODUCTION_AUTHORITY",
    ),
  );

  const unsafeCleanup = validateA0ReleaseQualificationWorkflowPolicy(
    path,
    source.replace('          sudo rm -rf -- "$EVIDENCE_ROOT"\n', ""),
  );
  assert.ok(
    unsafeCleanup.some(
      (item) =>
        item.code === "V2_A0_RELEASE_QUALIFICATION_WORKFLOW_INCOMPLETE",
    ),
  );
});

test("security evidence contract stays actionable and sanitized", () => {
  const path = "scripts/v2/production/a0-security-evidence.mjs";
  const source = readFileSync(path, "utf8");
  assert.deepEqual(validateSecurityEvidencePolicy(path, source), []);

  const incomplete = validateSecurityEvidencePolicy(
    path,
    source.replace(
      'findingFields: ["commit", "file", "ruleId", "startLine"]',
      "findingFields: []",
    ),
  );
  assert.ok(
    incomplete.some(
      (item) => item.code === "V2_SECURITY_EVIDENCE_CONTRACT_INCOMPLETE",
    ),
  );
});

test("CodeQL evidence is sanitized and fails closed on every untriaged result", () => {
  const path = "scripts/v2/production/a0-codeql-evidence.mjs";
  const source = readFileSync(path, "utf8");
  assert.deepEqual(validateCodeqlEvidencePolicy(path, source), []);

  const incomplete = validateCodeqlEvidencePolicy(
    path,
    source.replace("blockOnAnyUntriagedResult: true", "gateDisabled: true"),
  );
  assert.ok(
    incomplete.some(
      (item) => item.code === "V2_CODEQL_EVIDENCE_CONTRACT_INCOMPLETE",
    ),
  );
});

test("CodeQL source suppressions require exact structured reviews", () => {
  const reviewPath =
    "docs/governance/v2-a0-codeql-reviewed-suppressions.v3.json";
  const review = JSON.parse(readFileSync(reviewPath, "utf8"));
  const sources = Object.fromEntries(review.entries.map((entry) => [
    entry.path,
    readFileSync(entry.path, "utf8"),
  ]));

  assert.deepEqual(validateCodeqlSuppressionPolicy({
    review,
    reviewPath,
    sources,
  }), []);

  const unregistered = validateCodeqlSuppressionPolicy({
    review,
    reviewPath,
    sources: {
      ...sources,
      "src/unregistered.ts":
        "// MR-CODEQL-999: This exact suppression has no structured review.\n// codeql[js/http-to-file-access]\nwrite();\n",
    },
  });
  assert.ok(unregistered.some(
    (item) => item.code === "V2_CODEQL_SUPPRESSION_UNREGISTERED",
  ));
  assert.ok(unregistered.some(
    (item) => item.code === "V2_CODEQL_SUPPRESSION_REVIEW_DRIFT",
  ));

  const broad = validateCodeqlSuppressionPolicy({
    review: {
      ...review,
      policy: { ...review.policy, ruleWideSuppression: true },
    },
    reviewPath,
    sources,
  });
  assert.ok(broad.some(
    (item) => item.code === "V2_CODEQL_SUPPRESSION_POLICY_TOO_BROAD",
  ));

  const driftedAlertLine = validateCodeqlSuppressionPolicy({
    review: {
      ...review,
      entries: review.entries.map((entry, index) => index === 0
        ? { ...entry, alertLine: entry.alertLine + 20 }
        : entry),
    },
    reviewPath,
    sources,
  });
  assert.ok(driftedAlertLine.some(
    (item) => item.code === "V2_CODEQL_SUPPRESSION_ALERT_LINE_DRIFT",
  ));
});

test("Gitleaks ignores only exact independently reviewed false positives", () => {
  const ignorePath = ".gitleaksignore";
  const reviewPath =
    "docs/governance/v2-a0-secret-history-false-positive-review.v4.json";
  const ignoreSource = readFileSync(ignorePath, "utf8");
  const reviewSource = readFileSync(reviewPath, "utf8");
  const review = JSON.parse(reviewSource);

  assert.doesNotMatch(
    reviewSource,
    /(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/u,
    "the review document must not recursively resemble a secret",
  );

  assert.deepEqual(validateGitleaksFalsePositivePolicy({
    ignorePath,
    ignoreSource,
    review,
    reviewPath,
  }), []);

  const broadIgnoreIssues = validateGitleaksFalsePositivePolicy({
    ignorePath,
    ignoreSource: `${ignoreSource}src/.*\n`,
    review,
    reviewPath,
  });
  assert.ok(
    broadIgnoreIssues.some(
      (item) => item.code === "V2_GITLEAKS_IGNORE_NOT_EXACT_FINGERPRINT",
    ),
  );

  const broadReviewIssues = validateGitleaksFalsePositivePolicy({
    ignorePath,
    ignoreSource,
    review: {
      ...review,
      policy: { ...review.policy, pathWideAllowlist: true },
    },
    reviewPath,
  });
  assert.ok(
    broadReviewIssues.some(
      (item) => item.code === "V2_GITLEAKS_ALLOWLIST_SCOPE_TOO_BROAD",
    ),
  );

  const driftedEntryIssues = validateGitleaksFalsePositivePolicy({
    ignorePath,
    ignoreSource,
    review: {
      ...review,
      entries: review.entries.map((entry, index) => (
        index === 0 ? { ...entry, line: entry.line + 1 } : entry
      )),
    },
    reviewPath,
  });
  assert.ok(
    driftedEntryIssues.some(
      (item) => item.code === "V2_GITLEAKS_FALSE_POSITIVE_ENTRY_INVALID",
    ),
  );

  const driftedEvidenceIssues = validateGitleaksFalsePositivePolicy({
    ignorePath,
    ignoreSource,
    review: {
      ...review,
      sourceEvidence: {
        ...review.sourceEvidence,
        totalFindingCount: review.sourceEvidence.totalFindingCount - 1,
      },
    },
    reviewPath,
  });
  assert.ok(
    driftedEvidenceIssues.some(
      (item) => item.code === "V2_GITLEAKS_FALSE_POSITIVE_REVIEW_INCOMPLETE",
    ),
  );

  const driftedRemediationIssues = validateGitleaksFalsePositivePolicy({
    ignorePath,
    ignoreSource,
    review: {
      ...review,
      remediationValidation: {
        ...review.remediationValidation,
        findingCount: 1,
      },
    },
    reviewPath,
  });
  assert.ok(
    driftedRemediationIssues.some(
      (item) => item.code === "V2_GITLEAKS_FALSE_POSITIVE_REVIEW_INCOMPLETE",
    ),
  );
});

test("A0 security source identities remain exact and credential-safe", () => {
  const matrixPath =
    "docs/blueprints/market-radar-v2-controlled-replacement-traceability.v1.json";
  const reportPath =
    "docs/blueprints/V2_A0_INDEPENDENT_SECURITY_QUALITY_DELIVERY_REPORT.md";
  const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));
  const reportSource = readFileSync(reportPath, "utf8");

  assert.deepEqual(validateSegmentedSecuritySourceIdentity({
    matrix,
    matrixPath,
    reportPath,
    reportSource,
  }), []);

  const parts =
    matrix.lastCompletedEngineeringControl.sourceCommitParts;
  const contiguousReport = reportSource.replace(
    `Source commit parts: ${parts[0]} / ${parts[1]}`,
    `Source commit: ${parts.join("")}`,
  );
  const contiguousIssues = validateSegmentedSecuritySourceIdentity({
    matrix,
    matrixPath,
    reportPath,
    reportSource: contiguousReport,
  });
  assert.ok(contiguousIssues.some(
    (item) => item.code === "V2_A0_SECURITY_REPORT_SOURCE_IDENTITY_DRIFT",
  ));

  const driftedMatrix = structuredClone(matrix);
  driftedMatrix.lastCompletedEngineeringControl.sourceCommitParts[1] =
    "00000000000000000000";
  const driftedIssues = validateSegmentedSecuritySourceIdentity({
    matrix: driftedMatrix,
    matrixPath,
    reportPath,
    reportSource,
  });
  assert.ok(driftedIssues.some(
    (item) => item.code === "V2_A0_SECURITY_SOURCE_IDENTITY_NOT_SEGMENTED",
  ));

  const driftedRemediationMatrix = structuredClone(matrix);
  driftedRemediationMatrix.engineeringFoundationGate.independentSecurityQuality
    .postClosureRemediationValidation.secretScan.findingCount = 1;
  const driftedRemediationMatrixIssues =
    validateSegmentedSecuritySourceIdentity({
      matrix: driftedRemediationMatrix,
      matrixPath,
      reportPath,
      reportSource,
    });
  assert.ok(driftedRemediationMatrixIssues.some(
    (item) => item.code === "V2_A0_SECURITY_REMEDIATION_EVIDENCE_DRIFT",
  ));
});
