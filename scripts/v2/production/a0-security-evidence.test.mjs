import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGitleaksSummary,
  buildSanitizedGitleaksLocations,
} from "./a0-security-evidence.mjs";

const commitA = "a".repeat(40);
const commitB = "b".repeat(40);

test("Gitleaks evidence retains only actionable non-secret locations", () => {
  const findings = [
    {
      Commit: commitB,
      File: "src/b.ts",
      Match: "DO_NOT_LEAK_MATCH",
      RuleID: "generic-api-key",
      Secret: "DO_NOT_LEAK_SECRET",
      StartLine: 9,
    },
    {
      Commit: commitA,
      File: "src/a.ts",
      Match: "DO_NOT_LEAK_SECOND_MATCH",
      RuleID: "private-key",
      Secret: "DO_NOT_LEAK_SECOND_SECRET",
      StartLine: 3,
    },
  ];

  const summary = buildGitleaksSummary({
    findings,
    incrementalOutcome: "success",
    reportBytes: Buffer.from(JSON.stringify(findings)),
    repository: "owner/repository",
    resolvedVersion: "8.30.1",
    runAttempt: "1",
    runId: "123",
    scanExitCode: 2,
    sourceCommit: commitA,
  });
  const serialized = JSON.stringify(summary);

  assert.equal(summary.schemaVersion, "v2-a0-secret-scan-evidence.v2");
  assert.equal(summary.findingCount, 2);
  assert.deepEqual(summary.findingLocations, [
    {
      commit: commitA,
      file: "src/a.ts",
      ruleId: "private-key",
      startLine: 3,
    },
    {
      commit: commitB,
      file: "src/b.ts",
      ruleId: "generic-api-key",
      startLine: 9,
    },
  ]);
  assert.equal(serialized.includes("DO_NOT_LEAK"), false);
  assert.deepEqual(summary.policy.findingFields, [
    "commit",
    "file",
    "ruleId",
    "startLine",
  ]);
});

test("Gitleaks evidence rejects unsafe location metadata", () => {
  const result = buildSanitizedGitleaksLocations([
    {
      Commit: "not-a-commit",
      File: "../secret.txt",
      RuleID: "rule with spaces",
      StartLine: -1,
    },
  ]);

  assert.deepEqual(result, {
    findingLocations: [
      {
        commit: "<invalid-commit>",
        file: "<invalid-repository-path>",
        ruleId: "<invalid-rule-id>",
        startLine: null,
      },
    ],
    findingLocationsTruncated: false,
  });
});
