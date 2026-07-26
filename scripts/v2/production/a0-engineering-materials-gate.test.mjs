import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  validateCodeqlEvidencePolicy,
  validateCodeqlSuppressionPolicy,
  validateFullCiWorkflowPolicy,
  validateGitleaksFalsePositivePolicy,
  validatePackagePolicy,
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
    "docs/governance/v2-a0-codeql-reviewed-suppressions.v2.json";
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
    "docs/governance/v2-a0-secret-history-false-positive-review.v2.json";
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
});
