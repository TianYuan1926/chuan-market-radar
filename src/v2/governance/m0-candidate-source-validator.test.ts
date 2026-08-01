import assert from "node:assert/strict";
import test from "node:test";
import type { M0ExitReport } from "./m0-exit-validator";
import {
  evaluateM0CandidateSourceReport,
  resolveCandidateBranch,
} from "./m0-candidate-source-validator";

function strictReport(input: Readonly<{
  branch: string;
  status?: M0ExitReport["status"];
  extraFailure?: string;
}>): M0ExitReport {
  const checks = [
    {
      id: "clean_v2_branch_identity",
      passed: false,
      evidence: "candidate branch has no production branch authority",
    },
    {
      id: input.extraFailure ?? "all_other_m0_checks",
      passed: input.extraFailure === undefined,
      evidence: input.extraFailure === undefined ? "pass" : "fail",
    },
  ];
  return {
    schemaVersion: "market-radar-v2-m0-exit-report.v1",
    status: input.status ?? "FAIL_M0_EXIT",
    branch: input.branch,
    checks,
    authorityOutputs: 30,
    runtimeSchemas: 30,
    legacyCapabilities: 0,
    legacySourceFiles: 0,
    productionMutationPerformed: false,
    productionStatus: "UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION",
    nextEntry: "test",
  };
}

test("accepts a V2 feature source only when branch identity is the sole M0 failure", () => {
  const report = evaluateM0CandidateSourceReport({
    strictReport: strictReport({
      branch: "codex/market-radar-v2-m3-3e-archetype",
    }),
    productionBranch: "codex/market-radar-v2-implementation",
    candidateBranch: "codex/market-radar-v2-m3-3e-archetype",
  });

  assert.equal(
    report.status,
    "PASS_M0_CANDIDATE_SOURCE_QUALITY_NO_PRODUCTION_BRANCH_AUTHORITY",
  );
  assert.equal(report.productionBranchAuthorityGranted, false);
  assert.deepEqual(report.strictFailedCheckIds, ["clean_v2_branch_identity"]);
});

test("rejects a candidate with any second M0 failure", () => {
  const report = evaluateM0CandidateSourceReport({
    strictReport: strictReport({
      branch: "codex/market-radar-v2-m3-3e-archetype",
      extraFailure: "runtime_schema_drift",
    }),
    productionBranch: "codex/market-radar-v2-implementation",
    candidateBranch: "codex/market-radar-v2-m3-3e-archetype",
  });

  assert.equal(report.status, "FAIL_M0_CANDIDATE_SOURCE_QUALITY");
  assert.deepEqual(report.strictFailedCheckIds, [
    "clean_v2_branch_identity",
    "runtime_schema_drift",
  ]);
});

test("never treats the production implementation branch as a candidate", () => {
  const report = evaluateM0CandidateSourceReport({
    strictReport: strictReport({
      branch: "codex/market-radar-v2-implementation",
      status: "PASS_M0_ENGINEERING_EXIT_PRODUCTION_UNCHANGED",
    }),
    productionBranch: "codex/market-radar-v2-implementation",
    candidateBranch: "codex/market-radar-v2-implementation",
  });

  assert.equal(report.status, "FAIL_M0_CANDIDATE_SOURCE_QUALITY");
  assert.equal(report.productionBranchAuthorityGranted, false);
});

test("accepts main only as a no-authority integration candidate", () => {
  const report = evaluateM0CandidateSourceReport({
    strictReport: strictReport({ branch: "main" }),
    productionBranch: "codex/market-radar-v2-implementation",
    candidateBranch: "main",
  });

  assert.equal(
    report.status,
    "PASS_M0_CANDIDATE_SOURCE_QUALITY_NO_PRODUCTION_BRANCH_AUTHORITY",
  );
  assert.equal(report.branchClass, "MAIN_INTEGRATION");
  assert.equal(report.productionBranchAuthorityGranted, false);
});

test("resolves a detached pull request from GitHub head ref without trusting base ref", () => {
  assert.equal(
    resolveCandidateBranch("", {
      GITHUB_HEAD_REF: "codex/market-radar-v2-m3-3e-archetype",
      GITHUB_REF_NAME: "123/merge",
      GITHUB_REF: "refs/pull/123/merge",
    }),
    "codex/market-radar-v2-m3-3e-archetype",
  );
  assert.equal(
    resolveCandidateBranch("codex/market-radar-v2-local", {
      GITHUB_HEAD_REF: "codex/market-radar-v2-remote",
    }),
    "codex/market-radar-v2-local",
  );
});

test("rejects arbitrary branch names and mismatched checkout identity", () => {
  const arbitrary = evaluateM0CandidateSourceReport({
    strictReport: strictReport({ branch: "experimental" }),
    productionBranch: "codex/market-radar-v2-implementation",
    candidateBranch: "experimental",
  });
  const mismatched = evaluateM0CandidateSourceReport({
    strictReport: strictReport({
      branch: "codex/market-radar-v2-m3-3e-archetype",
    }),
    productionBranch: "codex/market-radar-v2-implementation",
    candidateBranch: "codex/market-radar-v2-another-source",
  });

  assert.equal(arbitrary.status, "FAIL_M0_CANDIDATE_SOURCE_QUALITY");
  assert.equal(mismatched.status, "FAIL_M0_CANDIDATE_SOURCE_QUALITY");
});
