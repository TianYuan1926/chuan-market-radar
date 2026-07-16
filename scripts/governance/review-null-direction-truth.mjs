import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT_PATH = resolve(
  ROOT,
  "docs/governance/wp-g0-2-review-null-direction-truth-remediation.v1.json",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function artifact(files) {
  const checksums = {};
  for (const file of [...files].sort()) {
    checksums[file] = sha256(await readFile(resolve(ROOT, file)));
  }
  return {
    fileCount: Object.keys(checksums).length,
    sha256: sha256(JSON.stringify(checksums)),
  };
}

export async function loadReviewNullDirectionTruthContract() {
  return JSON.parse(await readFile(CONTRACT_PATH, "utf8"));
}

export async function validateReviewNullDirectionTruth(contract) {
  contract ??= await loadReviewNullDirectionTruthContract();
  const violations = [];
  const implementation = await artifact(contract.implementationArtifact?.files ?? []);
  const statistics = await readFile(resolve(ROOT, "src/lib/journal/review-statistics.ts"), "utf8");
  const frontendContract = await readFile(resolve(ROOT, "src/lib/api/frontend-contract.ts"), "utf8");
  const legacyContract = await readFile(resolve(ROOT, "src/lib/radar-contract.ts"), "utf8");
  const component = await readFile(resolve(ROOT, "src/components/review/review-evolution.tsx"), "utf8");

  if (contract.schemaVersion !== "wp-g0.2-review-null-direction-truth-remediation.v1") {
    violations.push("schema_version");
  }
  if (contract.productionAuthorization !== false || contract.productionExecuted !== false) {
    violations.push("production_state_claim");
  }
  if (implementation.fileCount !== 6
      || implementation.fileCount !== contract.implementationArtifact?.fileCount
      || implementation.sha256 !== contract.implementationArtifact?.sha256) {
    violations.push("implementation_artifact");
  }

  const truth = contract.truthBoundary ?? {};
  for (const key of [
    "unknownDirectionPreserved",
    "unknownMissedDirectionPreserved",
    "missingPricesRemainNull",
    "missingValidationWindowRemainsNull",
    "missingMfeMaeRemainNull",
    "metricSampleRequiresMfeAndMae",
    "emptyMetricAverageIsNull",
    "onlyExpiredCanRenderTimedOut",
    "pendingAndUnknownOutcomesSeparated",
    "incompleteLifecycleResourceIsPartial",
  ]) if (truth[key] !== true) violations.push(`truth_true:${key}`);
  for (const key of [
    "unknownDirectionCanDefaultLong",
    "frontendCanCalculateOutcome",
    "frontendCanCalculateDirection",
  ]) if (truth[key] !== false) violations.push(`truth_false:${key}`);

  const scope = contract.scopeBoundary ?? {};
  for (const key of ["reviewStatisticsModified", "frontendReviewContractModified", "reviewComponentModified"]) {
    if (scope[key] !== true) violations.push(`scope_true:${key}`);
  }
  for (const key of [
    "scanModified", "analysisModified", "strategyModified", "riskGateModified",
    "backtestModified", "apiRouteModified", "databaseModified", "redisModified",
    "workerModified", "deploymentModified", "secretModified", "productionConnected",
  ]) if (scope[key] !== false) violations.push(`scope_false:${key}`);

  for (const token of [
    "averagePercent: number | null",
    "Number.isFinite(event.outcomeMetrics?.mfePercent)",
    "Number.isFinite(event.outcomeMetrics?.maePercent)",
    "mfeValues.length === 0 ? null",
    "maeValues.length === 0 ? null",
    "withMetrics: withMetrics.length",
  ]) if (!statistics.includes(token)) violations.push(`statistics_guard_missing:${token}`);

  for (const token of [
    'side: "多" | "空" | "未知"',
    'outcome: "target_first" | "stop_first" | "timed_out" | "pending" | "unknown"',
    'side: "涨" | "跌" | "未知"',
    'event.outcomeStatus === "expired"',
    'event.result === "watching"',
    ': "未知"',
    'row.outcome !== "unknown"',
    'lifecycleComplete ? "live" : "partial"',
    '"部分生命周期缺少明确方向、结果或 MFE/MAE；保留未知值，禁止补 0 或默认多头。"',
  ]) if (!frontendContract.includes(token)) violations.push(`frontend_guard_missing:${token}`);

  for (const token of [
    "maeAvg: null",
    "mfeAvg: null",
    "sampleStatus: 'empty'",
  ]) if (!legacyContract.includes(token)) violations.push(`legacy_guard_missing:${token}`);

  for (const token of [
    "'暂无有效指标'",
    "'等待结果'",
    "'结果未知'",
    "暂无有效 MFE / MAE",
    "'text-muted-foreground'",
    "'未知' || m.move === null",
    "幅度待记录",
  ]) if (!component.includes(token)) violations.push(`component_guard_missing:${token}`);

  for (const token of [
    'event.direction === "short" ? "空" : "多"',
    'event.direction === "short" ? "跌" : "涨"',
    "mfePercent ?? 0",
    "maePercent ?? 0",
  ]) if (frontendContract.includes(token) || statistics.includes(token)) {
    violations.push(`forbidden_default_present:${token}`);
  }
  for (const token of ["maeAvg: 0", "mfeAvg: 0", "lc.hitTpFirst", "lc.hitSlFirst"]) {
    if (legacyContract.includes(token) || component.includes(token)) {
      violations.push(`forbidden_ui_default_present:${token}`);
    }
  }

  for (const forbidden of [
    "unknown_direction_defaults_long", "unknown_missed_direction_defaults_up",
    "missing_price_defaults_zero", "missing_metric_defaults_zero",
    "unknown_outcome_defaults_timeout", "partial_lifecycle_claimed_live",
    "frontend_outcome_inference", "frontend_direction_inference", "scan_change",
    "analysis_change", "strategy_change", "risk_gate_change", "backtest_change",
    "api_route_change", "database_change", "redis_change", "worker_change",
    "deployment_change", "production_connection", "formal_backtest",
  ]) if (!contract.forbidden?.includes(forbidden)) violations.push(`forbidden_missing:${forbidden}`);

  if (contract.currentProductionDecision !== "BLOCKED_UNTIL_PASS_ACTIVATE_AND_OBSERVE_THEN_PRODUCTION_RECONCILIATION"
      || contract.nextProductionPackage !== "WP-G0.2-SHADOW-VERIFY-RECONCILIATION") {
    violations.push("production_sequence");
  }

  return {
    status: violations.length === 0 ? "PASS_LOCAL_REVIEW_NULL_DIRECTION_TRUTH" : "FAIL",
    productionDecision: contract.currentProductionDecision,
    productionMutationAllowed: false,
    scanModified: false,
    strategyModified: false,
    implementationArtifactSha256: implementation.sha256,
    violations,
  };
}

async function main() {
  const result = await validateReviewNullDirectionTruth();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.status.startsWith("PASS_")) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
