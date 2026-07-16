import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateG0CloseoutPreparation } from "./g0-security-release-incident-closeout.mjs";

function fixture() {
  return JSON.parse(readFileSync(
    "docs/governance/wp-g0-3-g0-5-security-release-incident-local-superpackage.v1.json",
    "utf8",
  ));
}

test("current G0 security release and incident preparation passes locally but not production", () => {
  const result = validateG0CloseoutPreparation();
  assert.equal(result.status, "pass");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.g0Completed, false);
  assert.match(result.productionDecision, /BLOCKED_UNTIL_CANDIDATE_CHAIN/);
});

test("contract rejects premature production TLS release Candidate or G0 claims", () => {
  const mutations = [
    (value) => { value.currentProductionTruth.activationObservationPass = true; },
    (value) => { value.currentProductionTruth.productionReconciliationPass = true; },
    (value) => { value.currentProductionTruth.canonicalReadCutoverPass = true; },
    (value) => { value.currentProductionTruth.productionTlsStatus = "pass"; },
    (value) => { value.currentProductionTruth.productionReleaseRecordPass = true; },
    (value) => { value.currentProductionTruth.g0ExitPass = true; },
    (value) => { value.scope.productionMutationAllowed = true; },
    (value) => { value.httpsSession.tlsBurnInSecondsRequired = 0; },
    (value) => { value.releaseEvidence.productionRecordPassed = true; },
    (value) => { value.incidentRegistry.requiredIssueCount = 9; },
    (value) => { value.status = "g0_complete"; },
  ];
  for (const mutate of mutations) {
    const contract = fixture();
    mutate(contract);
    assert.equal(validateG0CloseoutPreparation(process.cwd(), contract).status, "fail");
  }
});

test("artifact checksum drift blocks local PASS", () => {
  const contract = fixture();
  contract.artifact.sha256 = "0".repeat(64);
  assert.match(
    validateG0CloseoutPreparation(process.cwd(), contract).violations.join("\n"),
    /artifact_checksum_mismatch/,
  );
});
