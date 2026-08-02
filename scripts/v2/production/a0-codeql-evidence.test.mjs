import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCodeqlEvidence,
  githubWorkflowAnnotations,
  summarizeCodeqlSarifDocuments,
} from "./a0-codeql-evidence.mjs";

function sarif(results = []) {
  return {
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "CodeQL",
            rules: [
              {
                id: "js/example",
                defaultConfiguration: { level: "warning" },
                properties: { "security-severity": "8.1" },
              },
            ],
          },
        },
        results,
      },
    ],
  };
}

test("CodeQL evidence passes only with zero untriaged results", () => {
  assert.deepEqual(summarizeCodeqlSarifDocuments([sarif()]), {
    blockingResultCount: 0,
    resultCount: 0,
    resultLocationCount: 0,
    resultLocations: [],
    resultLocationsTruncated: false,
    reviewedSuppressionCount: 0,
    reviewedSuppressionLocations: [],
    reviewedSuppressionLocationsTruncated: false,
    ruleCounts: [],
    runCount: 1,
    status: "PASS_ZERO_UNTRIAGED_RESULTS",
  });
});

test("CodeQL evidence blocks and exposes sanitized repository locations", () => {
  const evidence = buildCodeqlEvidence({
    repository: "owner/repository",
    runAttempt: "1",
    runId: "123",
    sarifInputs: [
      {
        bytes: Buffer.from(JSON.stringify(sarif([
          {
            ruleId: "js/example",
            level: "error",
            message: { text: "sensitive source explanation" },
            locations: [{
              physicalLocation: {
                artifactLocation: { uri: "src/example.ts" },
                region: { startLine: 42 },
              },
            }],
          },
        ]))),
        name: "javascript.sarif",
      },
    ],
    sourceCommit: "a".repeat(40),
  });

  assert.equal(evidence.status, "BLOCKED_UNTRIAGED_RESULTS");
  assert.equal(evidence.blockingResultCount, 1);
  assert.deepEqual(evidence.ruleCounts, [{
    count: 1,
    maxLevel: "error",
    maxSecuritySeverity: 8.1,
    ruleId: "js/example",
  }]);
  assert.deepEqual(evidence.resultLocations, [{
    file: "src/example.ts",
    level: "error",
    ruleId: "js/example",
    securitySeverity: 8.1,
    startLine: 42,
  }]);
  assert.equal(evidence.resultLocationCount, 1);
  assert.equal(evidence.resultLocationsTruncated, false);
  assert.equal(
    evidence.schemaVersion,
    "v2-a0-codeql-sast-evidence.v3",
  );
  assert.doesNotMatch(
    JSON.stringify(evidence),
    /sensitive source explanation/u,
  );
  assert.equal(evidence.policy.rawSarifArtifactUploaded, false);
  assert.equal(evidence.productionMutation, false);
});

test("CodeQL evidence emits bounded sanitized GitHub annotations", () => {
  const resultLocations = Array.from({ length: 51 }, (_, index) => ({
    file: index === 0 ? "src/example,one.ts" : `src/example-${index}.ts`,
    level: index === 0 ? "error\nforged" : "warning",
    ruleId: index === 0 ? "js/example:one" : "js/example",
    securitySeverity: index === 0 ? 8.1 : null,
    startLine: index + 1,
  }));

  const annotations = githubWorkflowAnnotations({ resultLocations });

  assert.equal(annotations.length, 50);
  assert.equal(
    annotations[0],
    "::error title=Untriaged CodeQL js/example%3Aone,file=src/example%2Cone.ts,line=1::Untriaged error%0Aforged CodeQL result; security severity 8.1.",
  );
  assert.ok(annotations.every((annotation) => !annotation.includes("\n")));
  assert.doesNotMatch(annotations.join("\n"), /sensitive source explanation/u);
});

test("CodeQL annotation output omits invalid paths and unavailable lines", () => {
  assert.deepEqual(githubWorkflowAnnotations({
    resultLocations: [{
      file: "<invalid-repository-path>",
      level: "warning",
      ruleId: "js/example",
      securitySeverity: null,
      startLine: null,
    }],
  }), [
    "::error title=Untriaged CodeQL js/example::Untriaged warning CodeQL result; security severity unrated.",
  ]);
  assert.throws(() => githubWorkflowAnnotations({}));
});

test("CodeQL evidence accepts only an exact registered in-source suppression", () => {
  const exactLocation = {
    physicalLocation: {
      artifactLocation: { uri: "src/example.ts" },
      region: { startLine: 42 },
    },
  };
  const exactReviewedSuppressions = new Map([
    [["src/example.ts", "js/example", "42"].join("\0"), "MR-CODEQL-999"],
  ]);
  const inSourceResult = {
    locations: [exactLocation],
    ruleId: "js/example",
    suppressions: [{ kind: "inSource", status: "accepted" }],
  };

  const accepted = summarizeCodeqlSarifDocuments(
    [sarif([inSourceResult])],
    { reviewedSuppressions: exactReviewedSuppressions },
  );
  assert.equal(accepted.resultCount, 1);
  assert.equal(accepted.blockingResultCount, 0);
  assert.equal(accepted.reviewedSuppressionCount, 1);
  assert.deepEqual(accepted.reviewedSuppressionLocations, [{
    file: "src/example.ts",
    level: "warning",
    reviewId: "MR-CODEQL-999",
    ruleId: "js/example",
    securitySeverity: 8.1,
    startLine: 42,
  }]);
  assert.equal(accepted.status, "PASS_ZERO_UNTRIAGED_RESULTS");

  const missingSarifSuppression = summarizeCodeqlSarifDocuments(
    [sarif([{ ...inSourceResult, suppressions: undefined }])],
    { reviewedSuppressions: exactReviewedSuppressions },
  );
  assert.equal(missingSarifSuppression.blockingResultCount, 1);
  assert.equal(missingSarifSuppression.reviewedSuppressionCount, 0);

  const wrongLine = summarizeCodeqlSarifDocuments(
    [sarif([{
      ...inSourceResult,
      locations: [{
        physicalLocation: {
          ...exactLocation.physicalLocation,
          region: { startLine: 43 },
        },
      }],
    }])],
    { reviewedSuppressions: exactReviewedSuppressions },
  );
  assert.equal(wrongLine.blockingResultCount, 1);
  assert.equal(wrongLine.reviewedSuppressionCount, 0);
});

test("CodeQL evidence does not expose absolute or traversing paths", () => {
  for (const uri of [
    "/home/runner/work/repository/src/example.ts",
    "C:\\repository\\src\\example.ts",
    "src/%2e%2e/secret.ts",
    "file:///repository/src/example.ts",
  ]) {
    const summary = summarizeCodeqlSarifDocuments([sarif([{
      locations: [{
        physicalLocation: {
          artifactLocation: { uri },
          region: { startLine: -1 },
        },
      }],
      ruleId: "js/example",
    }])]);

    assert.equal(
      summary.resultLocations[0].file,
      "<invalid-repository-path>",
    );
    assert.equal(summary.resultLocations[0].startLine, null);
  }
});

test("CodeQL evidence bounds locations without hiding blocking results", () => {
  const results = Array.from({ length: 1_001 }, (_, index) => ({
    locations: [{
      physicalLocation: {
        artifactLocation: {
          uri: `src/example-${String(index).padStart(4, "0")}.ts`,
        },
        region: { startLine: index + 1 },
      },
    }],
    ruleId: "js/example",
  }));
  const summary = summarizeCodeqlSarifDocuments([sarif(results)]);

  assert.equal(summary.blockingResultCount, 1_001);
  assert.equal(summary.resultLocationCount, 1_000);
  assert.equal(summary.resultLocations.length, 1_000);
  assert.equal(summary.resultLocationsTruncated, true);
});

test("CodeQL evidence rejects malformed SARIF and rule identities", () => {
  assert.throws(() => summarizeCodeqlSarifDocuments([]));
  assert.throws(() => summarizeCodeqlSarifDocuments([{
    version: "2.0.0",
    runs: [],
  }]));
  assert.throws(() => summarizeCodeqlSarifDocuments([sarif([{
    ruleId: "invalid rule identity",
  }])]));
});
