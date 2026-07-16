#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const expectedIssueIds = Array.from({ length: 10 }, (_, index) =>
  `MR-INC-${String(index + 1).padStart(3, "0")}`);

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function commandCoversPath(commandName, command, path) {
  if (commandName === "test:market" && path.startsWith("src/") && path.endsWith(".test.ts")) {
    return true;
  }
  if (command.includes(path)) return true;
  const wildcard = `${dirname(path)}/*.test.mjs`;
  return command.includes(wildcard);
}

export function validateKnownIssuesRegistry(baseDir = rootDir, registryOverride = null) {
  const registryPath = resolve(baseDir, "docs/operations/known-issues-registry.json");
  const registry = registryOverride ?? JSON.parse(readFileSync(registryPath, "utf8"));
  const packageJson = JSON.parse(readFileSync(resolve(baseDir, "package.json"), "utf8"));
  const violations = [];
  if (!exactKeys(registry, ["issues", "requiredIssueIds", "schemaVersion", "status"])) {
    violations.push("top_level_keys_invalid");
  }
  if (registry?.schemaVersion !== "market-radar-known-issues-registry.v1") {
    violations.push("schema_version_invalid");
  }
  if (registry?.status !== "machine_covered_local_production_g0_not_closed") {
    violations.push("registry_status_invalid");
  }
  if (JSON.stringify(registry?.requiredIssueIds) !== JSON.stringify(expectedIssueIds)) {
    violations.push("required_issue_ids_invalid");
  }
  if (!Array.isArray(registry?.issues) || registry.issues.length !== expectedIssueIds.length) {
    violations.push("issue_count_invalid");
  }

  const ids = new Set();
  for (const issue of registry?.issues ?? []) {
    if (!exactKeys(issue, [
      "g0Requirement", "id", "incidentClass", "invariant", "name", "regressionEvidence",
      "severity", "status",
    ])) violations.push(`issue_keys_invalid:${issue?.id ?? "unknown"}`);
    if (ids.has(issue.id)) violations.push(`duplicate_issue_id:${issue.id}`);
    ids.add(issue.id);
    if (!expectedIssueIds.includes(issue.id)) violations.push(`unexpected_issue_id:${issue.id}`);
    if (!/^P[01]$/u.test(issue.severity ?? "")) violations.push(`severity_invalid:${issue.id}`);
    if (issue.status !== "machine_covered") violations.push(`issue_not_covered:${issue.id}`);
    if (typeof issue.invariant !== "string" || issue.invariant.length < 30) {
      violations.push(`invariant_too_weak:${issue.id}`);
    }
    if (!Array.isArray(issue.regressionEvidence) || issue.regressionEvidence.length < 1) {
      violations.push(`regression_evidence_missing:${issue.id}`);
      continue;
    }
    for (const evidence of issue.regressionEvidence) {
      if (!exactKeys(evidence, ["command", "path", "testPattern"])) {
        violations.push(`regression_evidence_keys_invalid:${issue.id}`);
        continue;
      }
      if (evidence.path.includes("..") || evidence.path.startsWith("/")) {
        violations.push(`regression_path_unsafe:${issue.id}`);
        continue;
      }
      const testPath = resolve(baseDir, evidence.path);
      if (!existsSync(testPath)) {
        violations.push(`regression_path_missing:${issue.id}:${evidence.path}`);
        continue;
      }
      const source = readFileSync(testPath, "utf8");
      if (!source.includes(evidence.testPattern)) {
        violations.push(`regression_test_missing:${issue.id}:${evidence.testPattern}`);
      }
      const command = packageJson.scripts?.[evidence.command];
      if (typeof command !== "string") {
        violations.push(`regression_command_missing:${issue.id}:${evidence.command}`);
      } else if (!commandCoversPath(evidence.command, command, evidence.path)) {
        violations.push(`regression_command_does_not_cover_path:${issue.id}:${evidence.command}`);
      }
    }
  }
  for (const expectedId of expectedIssueIds) {
    if (!ids.has(expectedId)) violations.push(`required_issue_missing:${expectedId}`);
  }

  return {
    status: violations.length === 0 ? "pass" : "fail",
    issueCount: registry?.issues?.length ?? 0,
    coveredCount: (registry?.issues ?? []).filter((issue) => issue.status === "machine_covered").length,
    productionDecision: "BLOCKED_UNTIL_RELEASE_AND_PRODUCTION_G0_EXIT_EVIDENCE_PASS",
    productionMutationAllowed: false,
    violations,
  };
}

function main() {
  const result = validateKnownIssuesRegistry();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === "pass" ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
