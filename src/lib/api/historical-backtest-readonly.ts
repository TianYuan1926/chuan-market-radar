import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { resource, type Resource } from "../data-status";
import type {
  HistoricalBacktestFinding,
  HistoricalBacktestAuditV2Finding,
  HistoricalBacktestAuditV2Remediation,
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
    hitCount: numericValue(item.hitCount),
    hitRatePct: numericValue(item.hitRatePct),
    lane,
    lateCount: numericValue(item.lateCount),
    lateRatePct: numericValue(item.lateRatePct),
  };
}

function normalizeAuditV2MissedOpportunity(value: unknown): HistoricalBacktestAuditV2State["missedOpportunities"][number] {
  const item = asObject(value);
  const direction = stringValue(item.direction);

  return {
    confidence: numericValue(item.confidence),
    direction: direction === "short" ? "short" : "long",
    maePct: numericValue(item.maePct),
    mfePct: numericValue(item.mfePct),
    moveAtSelectionPct: numericValue(item.moveAtSelectionPct),
    observedAt: stringValue(item.observedAt),
    reason: stringValue(item.reason, "该样本未进入 radar topN，需复盘覆盖率、排序或深扫槽位。"),
    symbol: stringValue(item.symbol, "UNKNOWN"),
    volumeRatio: numericValue(item.volumeRatio),
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

  if (radar.count === 0) {
    return "历史回测报告没有有效雷达样本，不能判断筛选能力。";
  }

  if (state.findings.some((finding) => finding.severity === "high")) {
    return "历史回测发现高优先级问题：当前扫描评分还不能证明有稳定筛选优势。";
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

export async function getLatestHistoricalBacktestResource(
  options: HistoricalBacktestReadonlyOptions = {},
): Promise<Resource<HistoricalBacktestState>> {
  const now = options.now ?? new Date();
  const roots = resolveReportRoots(options);
  const candidate = await findLatestReportCandidate(roots);

  if (!candidate) {
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
    const auditV2 = normalizeAuditV2(payload);
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
        momentum: normalizeLaneMetric("momentum", laneMetrics.momentum),
        radar: normalizeLaneMetric("radar", laneMetrics.radar),
        random: normalizeLaneMetric("random", laneMetrics.random),
        volume: normalizeLaneMetric("volume", laneMetrics.volume),
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
