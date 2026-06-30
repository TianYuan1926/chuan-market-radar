import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { resource, type Resource } from "../data-status";
import { runGoldenCases } from "../backtest/golden-case-runner";
import type {
  CoreJudgeSystemLane,
  CoreJudgeSystemState,
  HistoricalBacktestFinding,
  HistoricalBacktestAuditV2Finding,
  HistoricalBacktestAuditV2Remediation,
  HistoricalBacktestAuditRoundProgress,
  HistoricalBacktestAuditV2State,
  HistoricalBacktestLaneMetric,
  HistoricalBacktestMissedOpportunity,
  HistoricalBacktestReasonMetric,
  HistoricalBacktestScoreBucket,
  HistoricalBacktestState,
} from "./frontend-contract";
import {
  emptyHistoricalBacktestLaneMetric,
  emptyHistoricalBacktestState,
} from "./frontend-contract";

const DEFAULT_REPORT_ROOTS = [
  "reports/professional-backtest-audit",
  "reports/historical-backtest",
  "tmp/chuan-historical-backtest-medium",
  "tmp/chuan-historical-backtest-smoke",
];

type HistoricalBacktestReportCandidate = {
  dir: string;
  findingsPath: string;
  mtimeMs: number;
};

type AuditMode = "analysis" | "full" | "scan" | "strategy";

type AuditModeReport = {
  candidate: HistoricalBacktestReportCandidate;
  payload: Record<string, unknown>;
};

type HistoricalBacktestReadonlyOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  roots?: string[];
};

type ParsedSummaryInput = {
  days: number | null;
  horizonBars: number | null;
  interval: string | null;
  moveThresholdPct: number | null;
  replayTimes: number | null;
  source: string | null;
  topN: number | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numericValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOpportunityLane(value: unknown): HistoricalBacktestAuditV2State["opportunityLaneMetrics"][number]["lane"] {
  const lane = stringValue(value);

  if (
    lane === "early_setup" ||
    lane === "higher_timeframe_context" ||
    lane === "pullback_retest" ||
    lane === "risk_review"
  ) {
    return lane;
  }

  return "early_setup";
}

function defaultOpportunityLaneLabel(lane: HistoricalBacktestAuditV2State["opportunityLaneMetrics"][number]["lane"]) {
  const labels = {
    early_setup: "启动前机会",
    higher_timeframe_context: "大周期背景机会",
    pullback_retest: "回踩/反抽确认机会",
    risk_review: "风险复盘教材",
  } satisfies Record<HistoricalBacktestAuditV2State["opportunityLaneMetrics"][number]["lane"], string>;

  return labels[lane];
}

function normalizeLaneMetric(
  lane: HistoricalBacktestLaneMetric["lane"],
  value: unknown,
): HistoricalBacktestLaneMetric {
  const item = asObject(value);

  return {
    ...emptyHistoricalBacktestLaneMetric(lane),
    avgMaePct: numericValue(item.avgMaePct),
    avgMfePct: numericValue(item.avgMfePct),
    avgOpportunityScore: numericValue(item.avgOpportunityScore),
    count: numericValue(item.count),
    falsePositiveRatePct: numericValue(item.falsePositiveRatePct),
    hitCount: numericValue(item.hitCount),
    hitRatePct: numericValue(item.hitRatePct),
    lateCount: numericValue(item.lateCount),
    lateRatePct: numericValue(item.lateRatePct),
  };
}

function normalizeFinding(value: unknown): HistoricalBacktestFinding {
  const item = asObject(value);
  const severity = stringValue(item.severity);

  return {
    detail: stringValue(item.detail, "没有详细说明。"),
    id: stringValue(item.id, "HBT-UNKNOWN"),
    severity: severity === "high" || severity === "medium" || severity === "low" ? severity : "medium",
    title: stringValue(item.title, "历史回测发现未命名问题"),
  };
}

function normalizeAuditV2Finding(value: unknown): HistoricalBacktestAuditV2Finding {
  const item = asObject(value);
  const severity = stringValue(item.severity);

  return {
    detail: stringValue(item.detail, "没有详细说明。"),
    id: stringValue(item.id, "PBA-UNKNOWN"),
    layer: stringValue(item.layer, "review"),
    nextAction: stringValue(item.nextAction, "等待下一轮整改方案。"),
    rootCause: stringValue(item.rootCause, "未标注根因。"),
    severity: severity === "high" || severity === "medium" || severity === "low" ? severity : "medium",
    title: stringValue(item.title, "专业回测发现未命名问题"),
  };
}

function normalizeAuditV2Remediation(value: unknown): HistoricalBacktestAuditV2Remediation {
  const item = asObject(value);
  const priority = stringValue(item.priority);

  return {
    acceptanceCriteria: stringValue(item.acceptanceCriteria, "未定义验收标准。"),
    action: stringValue(item.action, "未定义整改动作。"),
    canAutoApply: false,
    layer: stringValue(item.layer, "review"),
    priority: priority === "P0" || priority === "P1" || priority === "P2" ? priority : "P1",
    targetModule: stringValue(item.targetModule, "unknown"),
  };
}

function normalizeAuditV2LaneMetric(
  lane: HistoricalBacktestAuditV2State["baselineMetrics"]["radar"]["lane"],
  value: unknown,
): HistoricalBacktestAuditV2State["baselineMetrics"]["radar"] {
  const item = asObject(value);

  return {
    avgConfidence: numericValue(item.avgConfidence),
    avgMaePct: numericValue(item.avgMaePct),
    avgMfePct: numericValue(item.avgMfePct),
    avgMoveAtSelectionPct: numericValue(item.avgMoveAtSelectionPct),
    avgVolumeRatio: numericValue(item.avgVolumeRatio),
    count: numericValue(item.count),
    earlyHitCount: numericValue(item.earlyHitCount),
    earlyHitRatePct: numericValue(item.earlyHitRatePct),
    hitCount: numericValue(item.hitCount),
    hitRatePct: numericValue(item.hitRatePct),
    lane,
    lateCount: numericValue(item.lateCount),
    lateRatePct: numericValue(item.lateRatePct),
    qualityScore: numericValue(item.qualityScore),
  };
}

function auditV2LaneToHistoricalLane(
  metric: HistoricalBacktestAuditV2State["baselineMetrics"]["radar"],
): HistoricalBacktestLaneMetric {
  return {
    ...emptyHistoricalBacktestLaneMetric(metric.lane),
    avgMaePct: metric.avgMaePct,
    avgMfePct: metric.avgMfePct,
    avgOpportunityScore: metric.avgConfidence,
    count: metric.count,
    hitCount: metric.hitCount,
    hitRatePct: metric.hitRatePct,
    lateCount: metric.lateCount,
    lateRatePct: metric.lateRatePct,
  };
}

function normalizeAuditV2MissedOpportunity(value: unknown): HistoricalBacktestAuditV2State["missedOpportunities"][number] {
  const item = asObject(value);
  const direction = stringValue(item.direction);
  const opportunityLane = normalizeOpportunityLane(item.opportunityLane);

  return {
    coinType: stringValue(item.coinType, "unknown"),
    coinTypeLabel: stringValue(item.coinTypeLabel, "未分类"),
    confidence: numericValue(item.confidence),
    direction: direction === "short" ? "short" : "long",
    maePct: numericValue(item.maePct),
    mfePct: numericValue(item.mfePct),
    moveAtSelectionPct: numericValue(item.moveAtSelectionPct),
    nodeRole: stringValue(item.nodeRole, "unknown"),
    observedAt: stringValue(item.observedAt),
    opportunityLane,
    opportunityLaneLabel: stringValue(item.opportunityLaneLabel, defaultOpportunityLaneLabel(opportunityLane)),
    opportunityLaneScore: numericValue(item.opportunityLaneScore),
    planBlockers: asArray(item.planBlockers).map((entry) => stringValue(entry)).filter(Boolean),
    radarRank: nullableNumber(item.radarRank),
    radarScore: numericValue(item.radarScore),
    reason: stringValue(item.reason, "该样本未进入 radar topN，需复盘覆盖率、排序或深扫槽位。"),
    rewardRisk: nullableNumber(item.rewardRisk),
    symbol: stringValue(item.symbol, "UNKNOWN"),
    timeframeBand: stringValue(item.timeframeBand, "unknown"),
    tradePlanStatus: stringValue(item.tradePlanStatus, "UNCLASSIFIED"),
    validationWindowLabel: stringValue(item.validationWindowLabel, "未知"),
    volumeRatio: numericValue(item.volumeRatio),
  };
}

function normalizeAuditRoundNode(value: unknown): HistoricalBacktestAuditRoundProgress["nodes"][number] {
  const item = asObject(value);
  const direction = stringValue(item.direction);
  const timeframeBand = stringValue(item.timeframeBand);
  const opportunityLane = normalizeOpportunityLane(item.opportunityLane);
  const selectedLane = stringValue(item.selectedLane);

  return {
    capturedByRadar: Boolean(item.capturedByRadar),
    coinType: stringValue(item.coinType, "unknown"),
    coinTypeLabel: stringValue(item.coinTypeLabel, "未分类"),
    confidence: numericValue(item.confidence),
    direction: direction === "short" ? "short" : "long",
    findingCount: numericValue(item.findingCount),
    hit: Boolean(item.hit),
    lateAtSelection: Boolean(item.lateAtSelection),
    maePct: numericValue(item.maePct),
    maturity: stringValue(item.maturity, "UNCLASSIFIED"),
    mfePct: numericValue(item.mfePct),
    moveAtSelectionPct: numericValue(item.moveAtSelectionPct),
    nodeIndex: numericValue(item.nodeIndex),
    nodeRole: stringValue(item.nodeRole, "unknown"),
    observedAt: stringValue(item.observedAt),
    opportunityLane,
    opportunityLaneLabel: stringValue(item.opportunityLaneLabel, defaultOpportunityLaneLabel(opportunityLane)),
    opportunityLaneScore: numericValue(item.opportunityLaneScore),
    planBlockers: asArray(item.planBlockers).map((entry) => stringValue(entry)).filter(Boolean),
    qualityHit: Boolean(item.qualityHit),
    radarRank: nullableNumber(item.radarRank),
    radarScore: numericValue(item.radarScore),
    rewardRisk: nullableNumber(item.rewardRisk),
    selectedAsOpportunity: Boolean(item.selectedAsOpportunity),
    selectedLane: selectedLane === "early_setup" ||
      selectedLane === "higher_timeframe_context" ||
      selectedLane === "pullback_retest" ||
      selectedLane === "risk_review"
      ? selectedLane
      : null,
    symbol: stringValue(item.symbol, "UNKNOWN"),
    timeframeBand: timeframeBand === "large" || timeframeBand === "medium" ? timeframeBand : "small",
    tradePlanStatus: stringValue(item.tradePlanStatus, "UNCLASSIFIED"),
    validationWindowBars: numericValue(item.validationWindowBars),
    validationWindowHours: numericValue(item.validationWindowHours),
    validationWindowLabel: stringValue(item.validationWindowLabel, "未知"),
    topN: numericValue(item.topN),
    volumeRatio: numericValue(item.volumeRatio),
    waitPlanEvaluation: normalizeWaitPlanEvaluation(item.waitPlanEvaluation),
  };
}

function normalizeAuditV2OpportunityLaneMetric(value: unknown): HistoricalBacktestAuditV2State["opportunityLaneMetrics"][number] {
  const item = asObject(value);
  const lane = normalizeOpportunityLane(item.lane);

  return {
    avgRadarRank: nullableNumber(item.avgRadarRank),
    avgRadarScore: numericValue(item.avgRadarScore),
    captureRatePct: numericValue(item.captureRatePct),
    capturedCount: numericValue(item.capturedCount),
    hitCount: numericValue(item.hitCount),
    hitRatePct: numericValue(item.hitRatePct),
    label: stringValue(item.label, defaultOpportunityLaneLabel(lane)),
    lane,
    lateCount: numericValue(item.lateCount),
    lateRatePct: numericValue(item.lateRatePct),
    missedEarlyHitCount: numericValue(item.missedEarlyHitCount),
    missedEarlyQualityHitCount: numericValue(item.missedEarlyQualityHitCount),
    planReadyCount: numericValue(item.planReadyCount),
    qualityHitCount: numericValue(item.qualityHitCount),
    qualityHitRatePct: numericValue(item.qualityHitRatePct),
    selectedCount: numericValue(item.selectedCount),
    totalNodes: numericValue(item.totalNodes),
  };
}

function normalizeAuditV2CoreFailure(value: unknown): HistoricalBacktestAuditV2State["coreCapabilityMetrics"][number]["mainFailures"][number] {
  const item = asObject(value);

  return {
    code: stringValue(item.code, "unknown"),
    count: numericValue(item.count),
    detail: stringValue(item.detail, "未提供问题细节。"),
    label: stringValue(item.label, "未标注问题"),
    nextAction: stringValue(item.nextAction, "继续复核该能力项。"),
    sampleSymbols: asArray(item.sampleSymbols).map((entry) => stringValue(entry)).filter(Boolean),
  };
}

function normalizeAuditV2CoreCapabilityMetric(value: unknown): HistoricalBacktestAuditV2State["coreCapabilityMetrics"][number] {
  const item = asObject(value);
  const id = stringValue(item.id);
  const status = stringValue(item.status);
  const keyMetrics = asObject(item.keyMetrics);

  return {
    failedNodes: numericValue(item.failedNodes),
    id: id === "analysis" || id === "strategy" ? id : "scan",
    keyMetrics: Object.fromEntries(
      Object.entries(keyMetrics).map(([key, metricValue]) => [
        key,
        typeof metricValue === "number" || typeof metricValue === "string" || metricValue === null ? metricValue : stringValue(metricValue),
      ]),
    ),
    label: stringValue(item.label, "核心能力"),
    mainFailures: asArray(item.mainFailures).map(normalizeAuditV2CoreFailure).slice(0, 6),
    nextAction: stringValue(item.nextAction, "继续扩大样本验证。"),
    passedNodes: numericValue(item.passedNodes),
    passRatePct: numericValue(item.passRatePct),
    score: numericValue(item.score),
    status: status === "pass" || status === "watch" ? status : "fail",
    summary: stringValue(item.summary, "核心能力暂无总结。"),
    testedNodes: numericValue(item.testedNodes),
  };
}

function normalizeAuditV2PlanBlockerMetric(value: unknown): HistoricalBacktestAuditV2State["planBlockerMetrics"][number] {
  const item = asObject(value);

  return {
    blocker: stringValue(item.blocker, "unknown"),
    capturedCount: numericValue(item.capturedCount),
    category: stringValue(item.category, "unknown"),
    conditionalWaitCount: numericValue(item.conditionalWaitCount),
    count: numericValue(item.count),
    diagnosis: stringValue(item.diagnosis, "needs_strategy_audit"),
    label: stringValue(item.label, stringValue(item.blocker, "未标注阻断原因")),
    lateCount: numericValue(item.lateCount),
    qualityHitCount: numericValue(item.qualityHitCount),
    riskReviewCount: numericValue(item.riskReviewCount),
    sampleContexts: asArray(item.sampleContexts).map((entry) => {
      const context = asObject(entry);

      return {
        capturedByRadar: context.capturedByRadar === true,
        hit: context.hit === true,
        lateAtSelection: context.lateAtSelection === true,
        nodeRole: stringValue(context.nodeRole, "unknown"),
        opportunityLane: stringValue(context.opportunityLane, "unknown"),
        qualityHit: context.qualityHit === true,
        rewardRisk: nullableNumber(context.rewardRisk),
        symbol: stringValue(context.symbol, "UNKNOWN"),
        tradePlanStatus: stringValue(context.tradePlanStatus, "UNKNOWN"),
      };
    }).filter((entry) => entry.symbol !== "UNKNOWN").slice(0, 6),
    sampleSymbols: asArray(item.sampleSymbols).map((entry) => stringValue(entry)).filter(Boolean),
  };
}

function normalizeWaitPlanEvaluation(value: unknown): HistoricalBacktestAuditRoundProgress["nodes"][number]["waitPlanEvaluation"] {
  const item = asObject(value);
  const status = stringValue(item.status);
  const outcome = stringValue(item.outcome);

  return {
    barsToTrigger: nullableNumber(item.barsToTrigger),
    diagnosticFlags: asArray(item.diagnosticFlags).map((entry) => stringValue(entry)).filter(Boolean),
    label: stringValue(item.label, "不是等待型计划"),
    maxAdverseAfterTriggerPct: nullableNumber(item.maxAdverseAfterTriggerPct),
    maxFavorableAfterTriggerPct: nullableNumber(item.maxFavorableAfterTriggerPct),
    outcome: outcome === "bad_wait" ||
      outcome === "inconclusive" ||
      outcome === "no_trade" ||
      outcome === "useful_wait"
      ? outcome
      : "not_applicable",
    postTriggerRewardRisk: nullableNumber(item.postTriggerRewardRisk),
    reason: stringValue(item.reason, "该节点没有等待计划后验。"),
    status: status === "missing_plan_levels" ||
      status === "not_triggered" ||
      status === "triggered_sl_first" ||
      status === "triggered_timeout" ||
      status === "triggered_tp_first"
      ? status
      : "not_wait_plan",
    stopHit: Boolean(item.stopHit),
    targetHit: Boolean(item.targetHit),
    triggerObservedAt: stringValue(item.triggerObservedAt) || null,
    triggerPrice: nullableNumber(item.triggerPrice),
    triggerQualityScore: nullableNumber(item.triggerQualityScore),
  };
}

function normalizeWaitPlanDiagnostic(value: unknown): HistoricalBacktestAuditV2State["waitPlanMetrics"]["diagnosticBreakdown"][number] {
  const item = asObject(value);

  return {
    code: stringValue(item.code, "unknown"),
    count: numericValue(item.count),
    label: stringValue(item.label, stringValue(item.code, "未标注诊断")),
    sampleSymbols: asArray(item.sampleSymbols).map((entry) => stringValue(entry)).filter(Boolean),
  };
}

function normalizeWaitPlanMetrics(value: unknown): HistoricalBacktestAuditV2State["waitPlanMetrics"] {
  const item = asObject(value);

  return {
    avgTriggerQualityScore: nullableNumber(item.avgTriggerQualityScore),
    badWaitRatePct: numericValue(item.badWaitRatePct),
    diagnosticBreakdown: asArray(item.diagnosticBreakdown).map(normalizeWaitPlanDiagnostic),
    label: stringValue(item.label, "等待型计划后验"),
    missingLevelCount: numericValue(item.missingLevelCount),
    noTradeRatePct: numericValue(item.noTradeRatePct),
    notTriggeredCount: numericValue(item.notTriggeredCount),
    stopFirstCount: numericValue(item.stopFirstCount),
    targetFirstCount: numericValue(item.targetFirstCount),
    timeoutCount: numericValue(item.timeoutCount),
    totalWaitPlans: numericValue(item.totalWaitPlans),
    triggeredCount: numericValue(item.triggeredCount),
    usefulWaitRatePct: numericValue(item.usefulWaitRatePct),
  };
}

function normalizePressureMetric(value: unknown): HistoricalBacktestAuditV2State["pressureTestMetrics"][number] {
  const item = asObject(value);

  return {
    captureRatePct: numericValue(item.captureRatePct),
    earlyCaptureRatePct: numericValue(item.earlyCaptureRatePct),
    label: stringValue(item.label, "TopN"),
    missedEarlyQualityHitCount: numericValue(item.missedEarlyQualityHitCount),
    qualityHitRatePct: numericValue(item.qualityHitRatePct),
    selectedCount: numericValue(item.selectedCount),
    topN: numericValue(item.topN),
    universePressurePct: numericValue(item.universePressurePct),
  };
}

function normalizeMarketRegimeMetric(value: unknown): HistoricalBacktestAuditV2State["marketRegimeMetrics"][number] {
  const item = asObject(value);

  return {
    avgRadarRank: nullableNumber(item.avgRadarRank),
    captureRatePct: numericValue(item.captureRatePct),
    label: stringValue(item.label, "未分类市场状态"),
    lateRatePct: numericValue(item.lateRatePct),
    qualityHitRatePct: numericValue(item.qualityHitRatePct),
    regime: stringValue(item.regime, "unknown"),
    sampleSymbols: asArray(item.sampleSymbols).map((entry) => stringValue(entry)).filter(Boolean),
    totalNodes: numericValue(item.totalNodes),
  };
}

function normalizeRuleStabilityMetric(value: unknown): HistoricalBacktestAuditV2State["ruleStabilityMetrics"][number] {
  const item = asObject(value);
  const status = stringValue(item.status);

  return {
    blocker: stringValue(item.blocker, "unknown"),
    label: stringValue(item.label, "未标注规则"),
    missedQualityHitCount: numericValue(item.missedQualityHitCount),
    occurrenceCount: numericValue(item.occurrenceCount),
    sampleSymbols: asArray(item.sampleSymbols).map((entry) => stringValue(entry)).filter(Boolean),
    selectedUsefulCount: numericValue(item.selectedUsefulCount),
    stabilityScore: numericValue(item.stabilityScore),
    status: status === "stable" || status === "unstable" ? status : "watch",
  };
}

function normalizeRoundTrendMetric(value: unknown): HistoricalBacktestAuditV2State["roundTrendComparison"]["metrics"][number] {
  const item = asObject(value);
  const status = stringValue(item.status);

  return {
    current: nullableNumber(item.current),
    delta: nullableNumber(item.delta),
    label: stringValue(item.label, "未命名指标"),
    previous: nullableNumber(item.previous),
    status: status === "improved" || status === "regressed" || status === "flat" ? status : "unavailable",
  };
}

function normalizeRoundTrendComparison(value: unknown): HistoricalBacktestAuditV2State["roundTrendComparison"] {
  const item = asObject(value);

  return {
    metrics: asArray(item.metrics).map(normalizeRoundTrendMetric),
    previousReportId: stringValue(item.previousReportId) || null,
    summary: stringValue(item.summary, "没有找到上一轮专业回测报告，本轮无法做趋势对比。"),
  };
}

function normalizeJudgeLane(value: unknown): CoreJudgeSystemLane {
  const item = asObject(value);
  const id = stringValue(item.id);
  const status = stringValue(item.status);

  return {
    id: id === "analysis_audit" ||
      id === "formal_audit" ||
      id === "scan_audit" ||
      id === "shadow_live" ||
      id === "strategy_audit"
      ? id
      : "golden_cases",
    label: stringValue(item.label, "核心裁判环节"),
    source: stringValue(item.source, "unknown"),
    status: status === "pass" || status === "watch" || status === "waiting" ? status : "fail",
    summary: stringValue(item.summary, "该环节暂无说明。"),
    updatedAt: stringValue(item.updatedAt) || undefined,
  };
}

function normalizeJudgeSystem(value: unknown): CoreJudgeSystemState | undefined {
  const item = asObject(value);

  if (item.schemaVersion !== "core-judge-system.v1") {
    return undefined;
  }

  const statusLabel = stringValue(item.statusLabel);

  return {
    guardrails: asArray(item.guardrails).map((rule) => stringValue(rule)).filter(Boolean),
    lanes: asArray(item.lanes).map(normalizeJudgeLane),
    schemaVersion: "core-judge-system.v1",
    statusLabel: statusLabel === "完整完成" ||
      statusLabel === "临时验证版" ||
      statusLabel === "等待外部条件" ||
      statusLabel === "不能支撑实战"
      ? statusLabel
      : "可运行但不完整",
    summary: stringValue(item.summary, "裁判系统状态未完整写入。"),
  };
}

function auditModeFromPayload(payload: Record<string, unknown>): AuditMode {
  const value = stringValue(payload.auditMode);

  if (value === "scan" || value === "analysis" || value === "strategy" || value === "full") {
    return value;
  }

  return "full";
}

function coreMetricStatusFromPayload(payload: Record<string, unknown>, mode: Exclude<AuditMode, "full">): CoreJudgeSystemLane["status"] {
  const metric = asArray(payload.coreCapabilityMetrics)
    .map(asObject)
    .find((item) => item.id === mode);
  const status = stringValue(metric?.status);

  if (status === "pass" || status === "watch") {
    return status;
  }

  return metric ? "fail" : "waiting";
}

function coreMetricSummaryFromPayload(payload: Record<string, unknown>, mode: Exclude<AuditMode, "full">) {
  const metric = asArray(payload.coreCapabilityMetrics)
    .map(asObject)
    .find((item) => item.id === mode);

  return stringValue(metric?.summary) || "尚未生成该专项审计报告。";
}

function buildJudgeSystemFromReports(
  latestByMode: Partial<Record<AuditMode, AuditModeReport>>,
  currentPayload: Record<string, unknown>,
): CoreJudgeSystemState {
  const existing = normalizeJudgeSystem(currentPayload.judgeSystem);

  if (existing) {
    return existing;
  }

  const currentMode = auditModeFromPayload(currentPayload);
  const reportFor = (mode: AuditMode) => latestByMode[mode]?.payload ?? (currentMode === mode ? currentPayload : undefined);
  const generatedAtFor = (mode: AuditMode) => stringValue(reportFor(mode)?.generatedAt) || undefined;
  const golden = runGoldenCases();
  const fullReport = reportFor("full");
  const fullSummary = asObject(fullReport?.roundSummary);
  const highSeverityFindings = numericValue(fullSummary.highSeverityFindings);
  const lanes: CoreJudgeSystemLane[] = [
    {
      id: "golden_cases",
      label: "金样本基础逻辑",
      source: "executable-fixtures",
      status: golden.status === "passed" ? "pass" : "fail",
      summary: golden.status === "passed"
        ? `基础逻辑样本 ${golden.passed}/${golden.total} 通过。`
        : `基础逻辑样本失败 ${golden.failed}/${golden.total}，禁止包装正式审计。`,
    },
    {
      id: "scan_audit",
      label: "扫描提前性审计",
      source: reportFor("scan") ? "professional-backtest-report" : "missing-report",
      status: reportFor("scan") ? coreMetricStatusFromPayload(reportFor("scan")!, "scan") : "waiting",
      summary: reportFor("scan") ? coreMetricSummaryFromPayload(reportFor("scan")!, "scan") : "尚未生成扫描专项审计报告。",
      updatedAt: generatedAtFor("scan"),
    },
    {
      id: "analysis_audit",
      label: "分析判断审计",
      source: reportFor("analysis") ? "professional-backtest-report" : "missing-report",
      status: reportFor("analysis") ? coreMetricStatusFromPayload(reportFor("analysis")!, "analysis") : "waiting",
      summary: reportFor("analysis") ? coreMetricSummaryFromPayload(reportFor("analysis")!, "analysis") : "尚未生成分析专项审计报告。",
      updatedAt: generatedAtFor("analysis"),
    },
    {
      id: "strategy_audit",
      label: "策略计划审计",
      source: reportFor("strategy") ? "professional-backtest-report" : "missing-report",
      status: reportFor("strategy") ? coreMetricStatusFromPayload(reportFor("strategy")!, "strategy") : "waiting",
      summary: reportFor("strategy") ? coreMetricSummaryFromPayload(reportFor("strategy")!, "strategy") : "尚未生成策略专项审计报告。",
      updatedAt: generatedAtFor("strategy"),
    },
    {
      id: "formal_audit",
      label: "正式综合审计",
      source: fullReport ? "professional-backtest-report" : "missing-report",
      status: fullReport ? (highSeverityFindings > 0 ? "fail" : "watch") : "waiting",
      summary: fullReport
        ? highSeverityFindings > 0
          ? `正式审计仍有 ${highSeverityFindings} 个高优先级问题。`
          : "正式审计没有高优先级问题，但仍需 shadow-live 长期样本确认。"
        : "等待金样本和三个专项审计通过后再跑正式综合审计。",
      updatedAt: generatedAtFor("full"),
    },
    {
      id: "shadow_live",
      label: "影子实盘验证",
      source: "review-contract",
      status: "waiting",
      summary: "等待生产候选写入影子跟踪样本；该状态不允许自动交易或自动改权重。",
    },
  ];
  const failing = lanes.filter((lane) => lane.status === "fail");
  const waiting = lanes.filter((lane) => lane.status === "waiting");
  const statusLabel: CoreJudgeSystemState["statusLabel"] = failing.length > 0
    ? "不能支撑实战"
    : waiting.length > 0
      ? "可运行但不完整"
      : "临时验证版";

  return {
    guardrails: [
      "正式回测不是第一调试工具，必须先过金样本和专项审计。",
      "扫描、分析、策略三项必须分开验收，不能用综合分掩盖短板。",
      "影子实盘只做纸面验证，不能自动交易，不能自动改实时权重。",
    ],
    lanes,
    schemaVersion: "core-judge-system.v1",
    statusLabel,
    summary: statusLabel === "不能支撑实战"
      ? `裁判系统发现 ${failing.length} 个核心阻断项，先整改再继续正式回测。`
      : statusLabel === "可运行但不完整"
        ? `裁判系统可运行，但还有 ${waiting.length} 个环节等待报告或生产样本。`
        : "裁判系统具备临时验证能力，仍需扩大样本和影子实盘确认。",
  };
}

function normalizeAuditRoundProgress(value: unknown): HistoricalBacktestAuditRoundProgress | undefined {
  const item = asObject(value);

  if (item.schemaVersion !== "professional-backtest-audit-round-progress.v1") {
    return undefined;
  }

  const phase = stringValue(item.phase);
  const status = stringValue(item.status);

  return {
    candidateUniverseSize: numericValue(item.candidateUniverseSize),
    completedAt: stringValue(item.completedAt) || null,
    completedNodes: numericValue(item.completedNodes),
    currentNodeRole: stringValue(item.currentNodeRole) || null,
    currentSymbol: stringValue(item.currentSymbol) || null,
    generatedAt: stringValue(item.generatedAt),
    guardrails: asArray(item.guardrails).map((rule) => stringValue(rule)).filter(Boolean),
    nodes: asArray(item.nodes).map(normalizeAuditRoundNode).slice(0, 120),
    nodesPerSymbol: numericValue(item.nodesPerSymbol),
    phase: phase === "completed" ||
      phase === "evaluating_nodes" ||
      phase === "failed" ||
      phase === "fetching_candles" ||
      phase === "fetching_derivatives" ||
      phase === "planning"
      ? phase
      : "idle",
    plannedSymbols: asArray(item.plannedSymbols).map((entry) => {
      const symbol = asObject(entry);

      return {
        coinType: stringValue(symbol.coinType, "unknown"),
        coinTypeLabel: stringValue(symbol.coinTypeLabel, "未分类"),
        symbol: stringValue(symbol.symbol, "UNKNOWN"),
      };
    }),
    schemaVersion: "professional-backtest-audit-round-progress.v1",
    status: status === "completed" || status === "failed" ? status : "running",
    summary: stringValue(item.summary, "专业回测轮次正在准备。"),
    totalNodes: numericValue(item.totalNodes),
    updatedAt: stringValue(item.updatedAt),
  };
}

function normalizeAuditV2(payload: Record<string, unknown>): HistoricalBacktestAuditV2State | undefined {
  if (payload.schemaVersion !== "professional-backtest-audit-report.v2") {
    return undefined;
  }

  const roundSummary = asObject(payload.roundSummary);
  const baselineMetrics = asObject(payload.baselineMetrics);
  const timingMetrics = asObject(payload.timingMetrics);

  return {
    schemaVersion: "professional-backtest-audit-report.v2",
    auditRound: normalizeAuditRoundProgress(payload.auditRound),
    baselineMetrics: {
      momentum: normalizeAuditV2LaneMetric("momentum", baselineMetrics.momentum),
      radar: normalizeAuditV2LaneMetric("radar", baselineMetrics.radar),
      random: normalizeAuditV2LaneMetric("random", baselineMetrics.random),
      volume: normalizeAuditV2LaneMetric("volume", baselineMetrics.volume),
    },
    cases: numericValue(roundSummary.cases),
    findings: asArray(payload.findings).map(normalizeAuditV2Finding).slice(0, 100),
    guardrails: asArray(payload.guardrails).map((item) => stringValue(item)).filter(Boolean),
    highSeverityFindings: numericValue(roundSummary.highSeverityFindings),
    missedOpportunities: asArray(payload.missedOpportunities).map(normalizeAuditV2MissedOpportunity).slice(0, 50),
    judgeSystem: normalizeJudgeSystem(payload.judgeSystem),
    coreCapabilityMetrics: asArray(payload.coreCapabilityMetrics).map(normalizeAuditV2CoreCapabilityMetric),
    opportunityLaneMetrics: asArray(payload.opportunityLaneMetrics).map(normalizeAuditV2OpportunityLaneMetric),
    planBlockerMetrics: asArray(payload.planBlockerMetrics).map(normalizeAuditV2PlanBlockerMetric).slice(0, 20),
    waitPlanMetrics: normalizeWaitPlanMetrics(payload.waitPlanMetrics),
    pressureTestMetrics: asArray(payload.pressureTestMetrics).map(normalizePressureMetric).slice(0, 8),
    marketRegimeMetrics: asArray(payload.marketRegimeMetrics).map(normalizeMarketRegimeMetric).slice(0, 12),
    ruleStabilityMetrics: asArray(payload.ruleStabilityMetrics).map(normalizeRuleStabilityMetric).slice(0, 12),
    roundTrendComparison: normalizeRoundTrendComparison(payload.roundTrendComparison),
    planReadyCount: numericValue(roundSummary.planReadyCount),
    remediationPlan: asArray(payload.remediationPlan).map(normalizeAuditV2Remediation).slice(0, 30),
    summary: stringValue(payload.summary, "专业回测 v2 暂无总结。"),
    testedCapabilities: numericValue(roundSummary.testedCapabilities),
    timingMetrics: {
      earlyCount: numericValue(timingMetrics.earlyCount),
      earlyRatePct: numericValue(timingMetrics.earlyRatePct),
      lateCount: numericValue(timingMetrics.lateCount),
      lateRatePct: numericValue(timingMetrics.lateRatePct),
      noPlanCount: numericValue(timingMetrics.noPlanCount),
      planReadyCount: numericValue(timingMetrics.planReadyCount),
    },
  };
}

function normalizeScoreBucket(value: unknown): HistoricalBacktestScoreBucket {
  const item = asObject(value);

  return {
    avgMaePct: numericValue(item.avgMaePct),
    avgMfePct: numericValue(item.avgMfePct),
    count: numericValue(item.count),
    hitRatePct: numericValue(item.hitRatePct),
    label: stringValue(item.label, "unknown"),
    lateRatePct: numericValue(item.lateRatePct),
  };
}

function normalizeReasonMetric(value: unknown): HistoricalBacktestReasonMetric {
  const item = asObject(value);

  return {
    avgMaePct: numericValue(item.avgMaePct),
    avgMfePct: numericValue(item.avgMfePct),
    count: numericValue(item.count),
    hitRatePct: numericValue(item.hitRatePct),
    lateRatePct: numericValue(item.lateRatePct),
    reason: stringValue(item.reason, "未标注原因"),
  };
}

function normalizeMissedOpportunity(value: unknown): HistoricalBacktestMissedOpportunity {
  const item = asObject(value);
  const direction = stringValue(item.direction);

  return {
    change24hPct: numericValue(item.change24hPct),
    direction: direction === "SHORT" ? "SHORT" : "LONG",
    mfePct: numericValue(item.mfePct),
    observedAt: stringValue(item.observedAt),
    opportunityScore: numericValue(item.opportunityScore),
    reasons: asArray(item.reasons).map((reason) => stringValue(reason)).filter(Boolean),
    symbol: stringValue(item.symbol, "UNKNOWN"),
  };
}

function resolveReportRoots(options: HistoricalBacktestReadonlyOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const configured = options.roots ?? (options.env?.HISTORICAL_BACKTEST_REPORT_ROOTS
    ? options.env.HISTORICAL_BACKTEST_REPORT_ROOTS.split(",")
    : DEFAULT_REPORT_ROOTS);

  return configured
    .map((root) => root.trim())
    .filter(Boolean)
    .map((root) => path.isAbsolute(root) ? root : path.join(cwd, root));
}

async function fileExists(file: string) {
  try {
    const details = await stat(file);

    return details.isFile();
  } catch {
    return false;
  }
}

async function listReportCandidates(root: string): Promise<HistoricalBacktestReportCandidate[]> {
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const candidates: HistoricalBacktestReportCandidate[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const dir = path.join(root, entry.name);
    const findingsPath = path.join(dir, "findings.json");

    if (!(await fileExists(findingsPath))) {
      continue;
    }

    const details = await stat(findingsPath);
    candidates.push({
      dir,
      findingsPath,
      mtimeMs: details.mtimeMs,
    });
  }

  return candidates;
}

async function findLatestReportCandidate(roots: string[]) {
  const candidates = (await Promise.all(roots.map(listReportCandidates))).flat();

  return candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)[0] ?? null;
}

async function readLatestReportsByAuditMode(roots: string[]): Promise<Partial<Record<AuditMode, AuditModeReport>>> {
  const candidates = (await Promise.all(roots.map(listReportCandidates))).flat()
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  const reports: Partial<Record<AuditMode, AuditModeReport>> = {};

  for (const candidate of candidates) {
    if (reports.scan && reports.analysis && reports.strategy && reports.full) {
      break;
    }

    try {
      const payload = asObject(JSON.parse(await readFile(candidate.findingsPath, "utf8")));

      if (payload.schemaVersion !== "professional-backtest-audit-report.v2") {
        continue;
      }

      const mode = auditModeFromPayload(payload);

      if (!reports[mode]) {
        reports[mode] = { candidate, payload };
      }
    } catch {
      continue;
    }
  }

  return reports;
}

function parseSummaryInput(markdown: string): ParsedSummaryInput {
  const pickString = (label: string) => {
    const match = markdown.match(new RegExp(`- ${label}：([^\\n]+)`, "u"));

    return match?.[1]?.trim() ?? null;
  };
  const pickNumber = (label: string) => {
    const value = pickString(label);

    if (!value) {
      return null;
    }

    const match = value.match(/-?\d+(?:\.\d+)?/u);

    return match ? nullableNumber(match[0]) : null;
  };

  return {
    days: pickNumber("天数"),
    horizonBars: pickNumber("未来验证窗口"),
    interval: pickString("周期"),
    moveThresholdPct: pickNumber("命中阈值"),
    replayTimes: pickNumber("回放时间点"),
    source: pickString("数据源"),
    topN: pickNumber("每轮候选数"),
  };
}

function ageSeconds(from: string | null, now: Date) {
  if (!from) {
    return undefined;
  }

  const parsed = Date.parse(from);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.max(0, Math.round((now.getTime() - parsed) / 1000));
}

function buildSummary(state: HistoricalBacktestState) {
  const radar = state.lanes.radar;
  const momentum = state.lanes.momentum;
  const random = state.lanes.random;
  const auditRadar = state.auditV2?.baselineMetrics.radar;
  const auditMomentum = state.auditV2?.baselineMetrics.momentum;
  const auditRandom = state.auditV2?.baselineMetrics.random;

  if (radar.count === 0) {
    return "历史回测报告没有有效雷达样本，不能判断筛选能力。";
  }

  if (state.findings.some((finding) => finding.severity === "high")) {
    return "历史回测发现高优先级问题：当前扫描评分还不能证明有稳定筛选优势。";
  }

  if (auditRadar && auditMomentum && auditRandom) {
    if (auditRadar.qualityScore <= auditMomentum.qualityScore) {
      return `雷达质量分 ${auditRadar.qualityScore} 未跑赢 24h 涨跌幅基线 ${auditMomentum.qualityScore}，说明提前发现评分仍需继续打磨。`;
    }

    if (auditRadar.qualityScore <= auditRandom.qualityScore) {
      return `雷达质量分 ${auditRadar.qualityScore} 未跑赢随机基线 ${auditRandom.qualityScore}，当前不能作为实战筛选优势证明。`;
    }

    return `雷达质量分 ${auditRadar.qualityScore}，提前命中率 ${auditRadar.earlyHitRatePct}%，偏晚率 ${auditRadar.lateRatePct}%，本轮回放暂时优于随机基线，但仍需扩大样本继续验证。`;
  }

  if (radar.hitRatePct <= momentum.hitRatePct) {
    return `雷达命中率 ${radar.hitRatePct}% 未跑赢 24h 涨跌幅基线 ${momentum.hitRatePct}%，说明提前发现评分仍需继续打磨。`;
  }

  if (radar.hitRatePct <= random.hitRatePct) {
    return `雷达命中率 ${radar.hitRatePct}% 未跑赢随机基线 ${random.hitRatePct}%，当前不能作为实战筛选优势证明。`;
  }

  return `雷达命中率 ${radar.hitRatePct}%，偏晚率 ${radar.lateRatePct}%，本轮回放暂时优于随机基线，但仍需扩大样本继续验证。`;
}

function buildNextAction(state: HistoricalBacktestState) {
  const firstFinding = state.findings[0];

  if (firstFinding) {
    return `优先处理：${firstFinding.title}。`;
  }

  if (state.input.symbolsUsed < 80) {
    return "下一轮扩大币种数和历史天数，避免小样本误判。";
  }

  return "继续增加不同市场环境样本，复核分数区间和原因标签的稳定性。";
}

function describeSourceCounts(value: unknown) {
  const sourceCounts = asObject(value);
  const entries = Object.entries(sourceCounts)
    .map(([source, count]) => `${source}:${numericValue(count)}`)
    .filter((item) => !item.endsWith(":0"));

  return entries.length > 0 ? entries.join(", ") : null;
}

async function readOptionalText(file: string) {
  try {
    return await readFile(file, "utf8");
  } catch {
    return "";
  }
}

async function readLatestProgress(roots: string[]) {
  const candidates = await Promise.all(roots.map(async (root) => {
    const file = path.join(root, "latest-progress.json");

    try {
      const details = await stat(file);
      const raw = await readFile(file, "utf8");
      const progress = normalizeAuditRoundProgress(JSON.parse(raw));

      if (!progress) {
        return null;
      }

      return {
        mtimeMs: details.mtimeMs,
        progress,
      };
    } catch {
      return null;
    }
  }));

  return candidates
    .filter((item): item is { mtimeMs: number; progress: HistoricalBacktestAuditRoundProgress } => Boolean(item))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.progress;
}

export async function getLatestHistoricalBacktestResource(
  options: HistoricalBacktestReadonlyOptions = {},
): Promise<Resource<HistoricalBacktestState>> {
  const now = options.now ?? new Date();
  const roots = resolveReportRoots(options);
  const [candidate, latestProgress, latestByMode] = await Promise.all([
    findLatestReportCandidate(roots),
    readLatestProgress(roots),
    readLatestReportsByAuditMode(roots),
  ]);

  if (!candidate) {
    if (latestProgress) {
      return resource(
        {
          ...emptyHistoricalBacktestState(latestProgress.summary),
          generatedAt: latestProgress.generatedAt || null,
          input: {
            days: null,
            horizonBars: null,
            interval: "15m",
            moveThresholdPct: null,
            replayTimes: latestProgress.completedNodes,
            source: "professional-backtest-audit-round-progress.v1",
            symbolsUsed: latestProgress.plannedSymbols.length,
            topN: latestProgress.nodes[0]?.topN ?? null,
          },
          progress: latestProgress,
          status: latestProgress.status === "failed" ? "degraded" : "empty",
        },
        latestProgress.status === "running" ? "partial" : "cached",
        {
          ageSec: ageSeconds(latestProgress.updatedAt, now),
          source: "professional-backtest-progress",
          reason: latestProgress.summary,
          updatedAt: latestProgress.updatedAt,
        },
      );
    }

    return resource(
      emptyHistoricalBacktestState("尚未找到历史回测报告。"),
      "empty",
      {
        source: "historical-backtest",
        reason: "未发现 reports/historical-backtest 或 tmp/chuan-historical-backtest-* 下的 findings.json。",
      },
    );
  }

  try {
    const [rawJson, summaryMarkdown] = await Promise.all([
      readFile(candidate.findingsPath, "utf8"),
      readOptionalText(path.join(candidate.dir, "summary.md")),
    ]);
    const payload = asObject(JSON.parse(rawJson));
    const laneMetrics = asObject(payload.laneMetrics);
    const diagnostics = asObject(payload.diagnostics);
    const optionsPayload = asObject(payload.options);
    const parsedSummary = parseSummaryInput(summaryMarkdown);
    const findings = asArray(payload.findings).map(normalizeFinding);
    const failures = asArray(payload.failures);
    const judgeSystem = buildJudgeSystemFromReports(latestByMode, payload);
    const auditV2 = normalizeAuditV2({
      ...payload,
      judgeSystem,
    });
    const progress = auditV2?.auditRound ?? latestProgress;
    const v2HistoricalLanes = auditV2
      ? {
        momentum: auditV2LaneToHistoricalLane(auditV2.baselineMetrics.momentum),
        radar: auditV2LaneToHistoricalLane(auditV2.baselineMetrics.radar),
        random: auditV2LaneToHistoricalLane(auditV2.baselineMetrics.random),
        volume: auditV2LaneToHistoricalLane(auditV2.baselineMetrics.volume),
      }
      : null;
    const state: HistoricalBacktestState = {
      schemaVersion: "historical-backtest.v1",
      status: auditV2?.highSeverityFindings || findings.some((finding) => finding.severity === "high") || failures.length > 0 ? "degraded" : "ready",
      generatedAt: stringValue(payload.generatedAt) || null,
      reportId: path.basename(candidate.dir),
      input: {
        days: parsedSummary.days,
        horizonBars: nullableNumber(optionsPayload.horizonBars) ?? parsedSummary.horizonBars,
        interval: parsedSummary.interval,
        moveThresholdPct: nullableNumber(optionsPayload.moveThresholdPct) ?? parsedSummary.moveThresholdPct,
        replayTimes: nullableNumber(payload.replayTimes) ?? parsedSummary.replayTimes,
        source: parsedSummary.source ?? describeSourceCounts(payload.sourceCounts),
        symbolsUsed: asArray(payload.symbolsUsed).length,
        topN: nullableNumber(optionsPayload.topN) ?? parsedSummary.topN,
      },
      lanes: {
        momentum: v2HistoricalLanes?.momentum ?? normalizeLaneMetric("momentum", laneMetrics.momentum),
        radar: v2HistoricalLanes?.radar ?? normalizeLaneMetric("radar", laneMetrics.radar),
        random: v2HistoricalLanes?.random ?? normalizeLaneMetric("random", laneMetrics.random),
        volume: v2HistoricalLanes?.volume ?? normalizeLaneMetric("volume", laneMetrics.volume),
      },
      findings,
      diagnostics: {
        missedOpportunities: asArray(diagnostics.missedOpportunities).map(normalizeMissedOpportunity).slice(0, 20),
        radarReasonMetrics: asArray(diagnostics.radarReasonMetrics).map(normalizeReasonMetric).slice(0, 12),
        radarScoreBuckets: asArray(diagnostics.radarScoreBuckets).map(normalizeScoreBucket),
      },
      summary: "",
      nextAction: "",
      guardrails: [
        "历史回测只用于验证扫描逻辑，不是收益承诺。",
        "每个回放点只能使用当时之前的数据，禁止偷看未来。",
        "回测结论不能自动修改实时权重，必须人工复核。",
        "样本不足或未跑赢基线时，前端必须明确提示，不得包装成已验证能力。",
      ],
      auditV2,
      progress,
    };
    const completedState = {
      ...state,
      summary: auditV2?.summary ?? buildSummary(state),
      nextAction: auditV2?.remediationPlan[0]?.action ?? buildNextAction(state),
    };
    const status = completedState.status === "degraded" ? "partial" : "cached";

    return resource(
      completedState,
      status,
      {
        ageSec: ageSeconds(completedState.generatedAt, now),
        source: "historical-backtest",
        reason: completedState.summary,
        updatedAt: completedState.generatedAt ?? undefined,
      },
    );
  } catch (error) {
    return resource(
      emptyHistoricalBacktestState("历史回测报告解析失败。"),
      "failed",
      {
        source: "historical-backtest",
        reason: error instanceof Error ? error.message : "无法解析历史回测报告。",
      },
    );
  }
}
