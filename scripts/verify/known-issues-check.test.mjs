import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateKnownIssuesRegistry } from "./known-issues-check.mjs";

function fixture() {
  return JSON.parse(readFileSync("docs/operations/known-issues-registry.json", "utf8"));
}

test("all ten known incidents are connected to executable regression evidence", () => {
  const result = validateKnownIssuesRegistry();
  assert.equal(result.status, "pass");
  assert.equal(result.issueCount, 10);
  assert.equal(result.coveredCount, 10);
  assert.equal(result.productionMutationAllowed, false);
  assert.match(result.productionDecision, /BLOCKED_UNTIL_RELEASE/);
});

test("registry fails missing duplicate renamed or non-executable regression guards", () => {
  const mutations = [
    (value) => { value.issues.pop(); },
    (value) => { value.issues[1].id = value.issues[0].id; },
    (value) => { value.issues[0].status = "open"; },
    (value) => { value.issues[0].regressionEvidence[0].path = "missing.test.ts"; },
    (value) => { value.issues[0].regressionEvidence[0].testPattern = "renamed away"; },
    (value) => { value.issues[0].regressionEvidence[0].command = "unknown:test"; },
  ];
  for (const mutate of mutations) {
    const registry = fixture();
    mutate(registry);
    assert.equal(validateKnownIssuesRegistry(process.cwd(), registry).status, "fail");
  }
});

test("registry cannot claim that local guards complete production G0", () => {
  const registry = fixture();
  registry.status = "g0_complete";
  assert.match(
    validateKnownIssuesRegistry(process.cwd(), registry).violations.join("\n"),
    /registry_status_invalid/,
  );
});
