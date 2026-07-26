import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCodeqlEvidence,
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
    ruleCounts: [],
    runCount: 1,
    status: "PASS_ZERO_UNTRIAGED_RESULTS",
  });
});

test("CodeQL evidence blocks and exposes only sanitized rule aggregates", () => {
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
                artifactLocation: { uri: "secret/path.ts" },
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
  assert.doesNotMatch(JSON.stringify(evidence), /sensitive|secret\/path/u);
  assert.equal(evidence.policy.rawSarifArtifactUploaded, false);
  assert.equal(evidence.productionMutation, false);
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
