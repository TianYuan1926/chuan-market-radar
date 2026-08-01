import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildM0ExitReport,
  type M0ExitReport,
} from "./m0-exit-validator";

const BRANCH_IDENTITY_CHECK = "clean_v2_branch_identity";
const V2_CANDIDATE_BRANCH_PATTERN =
  /^codex\/market-radar-v2-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;

export type M0CandidateSourceReport = Readonly<{
  schemaVersion: "market-radar-v2-m0-candidate-source-report.v1";
  status:
    | "PASS_M0_CANDIDATE_SOURCE_QUALITY_NO_PRODUCTION_BRANCH_AUTHORITY"
    | "FAIL_M0_CANDIDATE_SOURCE_QUALITY";
  candidateBranch: string;
  productionBranch: string;
  strictM0Status: M0ExitReport["status"];
  strictFailedCheckIds: readonly string[];
  branchClass: "V2_FEATURE" | "MAIN_INTEGRATION" | "INVALID";
  productionBranchAuthorityGranted: false;
  productionMutationPerformed: false;
  evidence: string;
  nextEntry: "MERGE_OR_FAST_FORWARD_TO_PRODUCTION_BRANCH_THEN_RERUN_STRICT_M0";
}>;

function normalizeBranchRef(value: string | undefined): string {
  return (value ?? "").trim().replace(/^refs\/heads\//u, "");
}

export function resolveCandidateBranch(
  strictReportBranch: string,
  environment: Readonly<Record<string, string | undefined>>,
): string {
  return normalizeBranchRef(
    strictReportBranch ||
      environment.GITHUB_HEAD_REF ||
      environment.GITHUB_REF_NAME ||
      environment.GITHUB_REF,
  );
}

function branchClass(
  candidateBranch: string,
): M0CandidateSourceReport["branchClass"] {
  if (candidateBranch === "main") {
    return "MAIN_INTEGRATION";
  }
  if (V2_CANDIDATE_BRANCH_PATTERN.test(candidateBranch)) {
    return "V2_FEATURE";
  }
  return "INVALID";
}

export function evaluateM0CandidateSourceReport(input: Readonly<{
  strictReport: M0ExitReport;
  productionBranch: string;
  candidateBranch: string;
}>): M0CandidateSourceReport {
  const candidateBranch = normalizeBranchRef(input.candidateBranch);
  const productionBranch = normalizeBranchRef(input.productionBranch);
  const strictFailedCheckIds = input.strictReport.checks
    .filter((check) => !check.passed)
    .map((check) => check.id)
    .sort();
  const resolvedBranchClass = branchClass(candidateBranch);
  const reportBranchMatches =
    input.strictReport.branch === "" ||
    input.strictReport.branch === candidateBranch;
  const onlyExpectedBranchFailure =
    strictFailedCheckIds.length === 1 &&
    strictFailedCheckIds[0] === BRANCH_IDENTITY_CHECK;
  const passed =
    candidateBranch !== productionBranch &&
    resolvedBranchClass !== "INVALID" &&
    reportBranchMatches &&
    input.strictReport.status === "FAIL_M0_EXIT" &&
    onlyExpectedBranchFailure;

  return Object.freeze({
    schemaVersion: "market-radar-v2-m0-candidate-source-report.v1",
    status: passed
      ? "PASS_M0_CANDIDATE_SOURCE_QUALITY_NO_PRODUCTION_BRANCH_AUTHORITY"
      : "FAIL_M0_CANDIDATE_SOURCE_QUALITY",
    candidateBranch,
    productionBranch,
    strictM0Status: input.strictReport.status,
    strictFailedCheckIds: Object.freeze(strictFailedCheckIds),
    branchClass: resolvedBranchClass,
    productionBranchAuthorityGranted: false,
    productionMutationPerformed: false,
    evidence: passed
      ? "all non-branch M0 checks passed; production branch identity remains intentionally absent"
      : "candidate source must have exactly one strict M0 failure: production branch identity",
    nextEntry:
      "MERGE_OR_FAST_FORWARD_TO_PRODUCTION_BRANCH_THEN_RERUN_STRICT_M0",
  });
}

export function buildM0CandidateSourceReport(
  repositoryRoot: string,
  environment: NodeJS.ProcessEnv = process.env,
): M0CandidateSourceReport {
  const manifest = JSON.parse(
    readFileSync(
      resolve(repositoryRoot, "docs/architecture/v2/V2_BASE_MANIFEST.v1.json"),
      "utf8",
    ),
  ) as { implementation: { branch: string } };
  const strictReport = buildM0ExitReport(repositoryRoot);
  const candidateBranch = resolveCandidateBranch(
    strictReport.branch,
    environment,
  );

  return evaluateM0CandidateSourceReport({
    strictReport,
    productionBranch: manifest.implementation.branch,
    candidateBranch,
  });
}

if (require.main === module) {
  const report = buildM0CandidateSourceReport(process.cwd());
  console.log(JSON.stringify(report, null, 2));
  if (
    report.status !==
    "PASS_M0_CANDIDATE_SOURCE_QUALITY_NO_PRODUCTION_BRANCH_AUTHORITY"
  ) {
    process.exitCode = 1;
  }
}
