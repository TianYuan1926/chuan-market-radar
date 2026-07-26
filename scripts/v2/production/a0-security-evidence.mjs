import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const MAX_FINDING_LOCATIONS = 1_000;
const FULL_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const RULE_ID_PATTERN = /^[A-Za-z0-9._:/-]{1,128}$/u;

function sanitizeCommit(value) {
  return typeof value === "string" && FULL_COMMIT_PATTERN.test(value)
    ? value
    : "<invalid-commit>";
}

function sanitizeRepositoryPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    return "<invalid-repository-path>";
  }

  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  const hasControlCharacter = [...normalized].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
  const hasUnsafeSegment = segments.some(
    (segment) => segment === "" || segment === "." || segment === "..",
  );

  if (
    normalized.startsWith("/")
    || hasControlCharacter
    || hasUnsafeSegment
  ) {
    return "<invalid-repository-path>";
  }

  return normalized;
}

function sanitizeRuleId(value) {
  return typeof value === "string" && RULE_ID_PATTERN.test(value)
    ? value
    : "<invalid-rule-id>";
}

function sanitizeStartLine(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function buildSanitizedGitleaksLocations(findings) {
  if (!Array.isArray(findings)) {
    throw new TypeError("Gitleaks JSON report must be an array");
  }

  const locations = findings.map((finding) => ({
    commit: sanitizeCommit(finding?.Commit),
    file: sanitizeRepositoryPath(finding?.File),
    ruleId: sanitizeRuleId(finding?.RuleID),
    startLine: sanitizeStartLine(finding?.StartLine),
  }));

  locations.sort((left, right) => (
    left.commit.localeCompare(right.commit)
    || left.file.localeCompare(right.file)
    || (left.startLine ?? Number.MAX_SAFE_INTEGER)
      - (right.startLine ?? Number.MAX_SAFE_INTEGER)
    || left.ruleId.localeCompare(right.ruleId)
  ));

  return {
    findingLocations: locations.slice(0, MAX_FINDING_LOCATIONS),
    findingLocationsTruncated: locations.length > MAX_FINDING_LOCATIONS,
  };
}

export function buildGitleaksSummary({
  findings,
  incrementalOutcome,
  reportBytes,
  repository,
  resolvedVersion,
  runAttempt,
  runId,
  scanExitCode,
  sourceCommit,
}) {
  const {
    findingLocations,
    findingLocationsTruncated,
  } = buildSanitizedGitleaksLocations(findings);

  return {
    schemaVersion: "v2-a0-secret-scan-evidence.v2",
    sourceCommit,
    repository,
    runId,
    runAttempt,
    scanner: {
      name: "gitleaks",
      requiredVersion: "8.30.1",
      resolvedVersion,
      actionCommit: "e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e",
      incrementalOutcome,
      fullHistoryExitCode: scanExitCode,
    },
    policy: {
      fullReachableHistory: true,
      redacted: true,
      rawFindingArtifactUploaded: false,
      findingFields: ["commit", "file", "ruleId", "startLine"],
    },
    findingCount: findings.length,
    findingLocationCount: findingLocations.length,
    findingLocationsTruncated,
    findingLocations,
    reportDigest: reportBytes === null
      ? null
      : `sha256:${crypto
        .createHash("sha256")
        .update(reportBytes)
        .digest("hex")}`,
    productionMutation: false,
  };
}

function runCli() {
  const [reportPath, outputPath] = process.argv.slice(2);
  if (reportPath === undefined || outputPath === undefined) {
    throw new Error(
      "Usage: node a0-security-evidence.mjs <gitleaks-report> <summary-output>",
    );
  }

  const reportPresent = fs.existsSync(reportPath);
  const reportBytes = reportPresent ? fs.readFileSync(reportPath) : null;
  const findings = reportBytes === null ? [] : JSON.parse(reportBytes);
  const summary = buildGitleaksSummary({
    findings,
    incrementalOutcome: process.env.GITLEAKS_INCREMENTAL_OUTCOME,
    reportBytes,
    repository: process.env.GITHUB_REPOSITORY,
    resolvedVersion: process.env.GITLEAKS_RESOLVED_VERSION,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    runId: process.env.GITHUB_RUN_ID,
    scanExitCode: Number(process.env.GITLEAKS_FULL_HISTORY_EXIT_CODE),
    sourceCommit: process.env.GITHUB_SHA,
  });

  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, {
    mode: 0o600,
  });
  process.stdout.write(
    `Gitleaks full-history findings=${summary.findingCount}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli();
}
