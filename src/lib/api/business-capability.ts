import type {
  AiReviewStatus,
  MarketSignal,
  SignalMaturityStage,
} from "../analysis/types";
import type { MarketRadarSnapshot } from "../market/types";
import type { SystemHealthReport } from "./system-health";

export type BusinessCapabilitySchemaVersion = "business-capability.v1";

export type BusinessCapabilityStageId =
  | "ai_counter_review"
  | "candidate_rotation"
  | "evolution_suggestions"
  | "historical_case_replay"
  | "outcome_standard"
  | "shadow_tracking"
  | "signal_lifecycle"
  | "signal_maturity"
  | "strategy_family_stats";

export type BusinessCapabilityStageStatus =
  | "blocked"
  | "collecting"
  | "disabled"
  | "partial"
  | "ready"
  | "watch";

export type BusinessCapabilityStage = {
  id: BusinessCapabilityStageId;
  title: string;
  status: BusinessCapabilityStageStatus;
  score: number;
  summary: string;
  evidence: string[];
  nextAction: string;
  guardrail: string;
};

export type BusinessCapabilityReport = {
  schemaVersion: BusinessCapabilitySchemaVersion;
  generatedAt: string;
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  canAutoExecute: false;
  canMutateLiveRanking: false;
  mode: "business_capability_loop_v1";
  operatorHint: string;
  readinessScore: number;
  status: "blocked" | "collecting" | "operational" | "partial" | "watch";
  stages: BusinessCapabilityStage[];
  gaps: string[];
  nextActions: string[];
  frontendContracts: string[];
  operatingRules: string[];
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function statusScore(status: BusinessCapabilityStageStatus) {
  return {
    blocked: 15,
    collecting: 45,
    disabled: 25,
    partial: 60,
    ready: 90,
    watch: 70,
  }[status];
}

function unique(values: string[]) {
  return values.filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);
}

function maturityCounts(snapshot: MarketRadarSnapshot): Record<SignalMaturityStage, number> {
  return snapshot.metadata.signalMaturity?.counts ?? {
    DEEP_SCAN_CANDIDATE: 0,
    EVIDENCE_SIGNAL: snapshot.signals.filter((signal) => signal.maturity?.stage === "EVIDENCE_SIGNAL").length,
    LIGHT_SCAN_MARK: snapshot.metadata.lightScan?.candidateCount ?? 0,
    TRADE_PLAN_READY: snapshot.signals.filter((signal) => signal.maturity?.stage === "TRADE_PLAN_READY").length,
  };
}

function maturityStage(signal: MarketSignal) {
  return signal.maturity?.stage ?? "DEEP_SCAN_CANDIDATE";
}

function outcomeLifecycleStage({
  health,
  snapshot,
}: {
  health: SystemHealthReport;
  snapshot: MarketRadarSnapshot;
}): BusinessCapabilityStage {
  const maturedSignals = snapshot.signals.filter((signal) =>
    maturityStage(signal) === "EVIDENCE_SIGNAL" ||
    maturityStage(signal) === "TRADE_PLAN_READY"
  );
  const tracking = health.outcomes.trackingEvents ?? 0;
  const closed = health.outcomes.closedEvents ?? 0;
  const status: BusinessCapabilityStageStatus = tracking + maturedSignals.length === 0
    ? "collecting"
    : closed > 0
      ? "ready"
      : "partial";

  return {
    id: "signal_lifecycle",
    title: "信号生命周期",
    status,
    score: clampScore(statusScore(status) + Math.min(10, maturedSignals.length * 2)),
    summary: `当前 ${maturedSignals.length} 个成熟信号，${tracking} 个跟踪样本，${closed} 个已关闭样本。`,
    evidence: [
      `成熟信号 ${maturedSignals.map((signal) => signal.symbol).slice(0, 6).join(", ") || "等待"}`,
      `latestOutcomeAt=${health.outcomes.latestOutcomeAt ?? "none"}`,
    ],
    nextAction: closed > 0
      ? "继续让 outcome executor 复查到期样本，并把结果写回日记。"
      : "优先把证据融合级信号写入跟踪队列，形成可复盘生命周期。",
    guardrail: "生命周期只记录触发、止损、目标、超时和 MFE/MAE，不做自动下单。",
  };
}

function outcomeStandardStage(health: SystemHealthReport): BusinessCapabilityStage {
  const quality = health.outcomes.sampleQuality ?? {
    autoWeightEligible: false,
    expiredEvents: 0,
    failedEvents: 0,
    manualReviewReady: false,
    pendingEvents: health.outcomes.pendingEvents ?? 0,
    status: "collecting" as const,
    validatedEvents: 0,
  };
  const status: BusinessCapabilityStageStatus = health.outcomes.status === "idle"
    ? "collecting"
    : quality.status === "counterevidence_watch"
      ? "watch"
      : health.outcomes.latestRunAt
        ? "ready"
        : "partial";

  return {
    id: "outcome_standard",
    title: "复盘判定标准",
    status,
    score: clampScore(statusScore(status) + Math.min(10, (health.outcomes.coveragePercent ?? 0) / 10)),
    summary: `验证样本 ${quality.validatedEvents}，失败 ${quality.failedEvents}，过期 ${quality.expiredEvents}，覆盖率 ${health.outcomes.coveragePercent ?? 0}%。`,
    evidence: [
      `validationWindow 来自 outcome tracker：15m=4h，1h=24h，4h/1d=4d。`,
      `lastRun=${health.outcomes.latestRunAt ?? "none"}`,
    ],
    nextAction: (health.outcomes.dueEvents ?? 0) > 0
      ? `有 ${health.outcomes.dueEvents} 个到期样本，运行受保护 outcome executor。`
      : health.outcomes.operatorHint,
    guardrail: "只统计 EVIDENCE_SIGNAL / TRADE_PLAN_READY 等完整验证信号；轻扫标记不进入命中率。",
  };
}

function candidateRotationStage({
  health,
  snapshot,
}: {
  health: SystemHealthReport;
  snapshot: MarketRadarSnapshot;
}): BusinessCapabilityStage {
  const audit = snapshot.metadata.coverage?.rotationAudit ?? health.fullMarketCoverage.rotationAudit;
  const queued = audit?.priorityQueue.queuedCount ?? health.fullMarketCoverage.highPriority?.queuedAssets.length ?? 0;
  const longTail = audit?.slots.selectedLongTailAssets.length ?? 0;
  const status: BusinessCapabilityStageStatus = audit
    ? audit.status === "healthy"
      ? "ready"
      : "watch"
    : health.fullMarketCoverage.status === "rotating" || health.fullMarketCoverage.status === "complete"
      ? "partial"
      : "collecting";

  return {
    id: "candidate_rotation",
    title: "候选池公平轮换",
    status,
    score: clampScore(statusScore(status) + Math.min(8, longTail * 2) - Math.min(12, queued)),
    summary: `本轮覆盖 ${health.coverage.scanned}/${health.coverage.eligible}，排队 ${health.coverage.pending}，高优先级排队 ${queued}，长尾探索 ${longTail}。`,
    evidence: [
      `rotationAudit=${audit?.status ?? "missing"}`,
      `estimatedFullCycleMinutes=${audit?.timing.estimatedFullCycleMinutes ?? health.fullMarketCoverage.coverage?.estimatedFullCycleMinutes ?? "unknown"}`,
    ],
    nextAction: audit?.operatorHint ?? health.fullMarketCoverage.operatorHint,
    guardrail: "轮换只影响扫描优先级和复查顺序，不能永久淘汰标的，不能绕过 Risk Gate。",
  };
}

function signalMaturityStage({
  health,
  snapshot,
}: {
  health: SystemHealthReport;
  snapshot: MarketRadarSnapshot;
}): BusinessCapabilityStage {
  const counts = maturityCounts(snapshot);
  const mainSignals = snapshot.metadata.signalMaturity?.mainSignalSymbols.length ??
    counts.EVIDENCE_SIGNAL + counts.TRADE_PLAN_READY;
  const status: BusinessCapabilityStageStatus = snapshot.metadata.signalMaturity
    ? "ready"
    : snapshot.signals.length > 0
      ? "partial"
      : "collecting";

  return {
    id: "signal_maturity",
    title: "信号成熟度分层",
    status,
    score: statusScore(status),
    summary: `轻扫 ${counts.LIGHT_SCAN_MARK}，深扫候选 ${counts.DEEP_SCAN_CANDIDATE}，证据信号 ${counts.EVIDENCE_SIGNAL}，计划就绪 ${counts.TRADE_PLAN_READY}。`,
    evidence: [
      `主信号区 ${mainSignals}`,
      `candidateLane=${snapshot.metadata.signalMaturity?.candidateLaneSymbols.slice(0, 6).join(", ") || "none"}`,
    ],
    nextAction: mainSignals > 0
      ? "前端主信号区只展示证据融合信号和交易计划就绪信号。"
      : "继续深扫候选，等待结构、衍生品和 RR 证据补齐。",
    guardrail: health.signalMaturity?.guardrail ??
      "LIGHT_SCAN_MARK 只做调度输入，不能直接展示成交易机会。",
  };
}

function shadowTrackingStage(health: SystemHealthReport): BusinessCapabilityStage {
  const shadow = health.outcomes.strategyWeightShadow;
  const evaluation = health.outcomes.strategyWeightShadowEvaluation;
  const approvedRecordCount = shadow?.approvedRecordCount ?? 0;
  const evaluatedShadowCount = evaluation?.evaluatedShadowCount ?? 0;
  const rollbackWatchCount = evaluation?.rollbackWatchCount ?? 0;
  const status: BusinessCapabilityStageStatus = evaluatedShadowCount > 0
    ? evaluation.status === "blocked"
      ? "blocked"
      : evaluation.status === "rollback_watch"
        ? "watch"
        : "ready"
    : approvedRecordCount > 0
      ? "partial"
      : "collecting";

  return {
    id: "shadow_tracking",
    title: "影子实盘追踪",
    status,
    score: clampScore(statusScore(status) + Math.min(10, evaluatedShadowCount * 2)),
    summary: `已批准影子记录 ${approvedRecordCount}，已评估 ${evaluatedShadowCount}，回滚观察 ${rollbackWatchCount}。`,
    evidence: [
      `shadowStatus=${evaluation?.status ?? "missing"}`,
      `improving=${evaluation?.improvingCount ?? 0}, mixed=${evaluation?.mixedCount ?? 0}, blocked=${evaluation?.blockedCount ?? 0}`,
    ],
    nextAction: evaluation?.nextStep ?? "等待人工批准的影子记录和后续 outcome 样本。",
    guardrail: "影子实盘只读观察人工确认后的策略假设，不执行真实权重，不改变实时扫描。",
  };
}

function strategyFamilyStatsStage(health: SystemHealthReport): BusinessCapabilityStage {
  const review = health.v3StrategyLoop.review ?? {
    closedSamples: 0,
    patternStatus: "collecting",
    pendingSamples: 0,
    sampleCount: 0,
    topPatternLabel: null,
    topTradePlanLabel: null,
  };
  const calibration = health.outcomes.strategyWeightCalibration ?? {
    closedSamples: 0,
    sampleCount: 0,
  };
  const status: BusinessCapabilityStageStatus = review.sampleCount === 0 && calibration.sampleCount === 0
    ? "collecting"
    : review.closedSamples >= 5 || calibration.closedSamples >= 5
      ? "ready"
      : "partial";

  return {
    id: "strategy_family_stats",
    title: "策略分型统计",
    status,
    score: clampScore(statusScore(status) + Math.min(10, review.closedSamples + calibration.closedSamples)),
    summary: `v3 分型样本 ${review.sampleCount}，已关闭 ${review.closedSamples}；校准样本 ${calibration.sampleCount}，已关闭 ${calibration.closedSamples}。`,
    evidence: [
      `topPattern=${review.topPatternLabel ?? "none"}`,
      `topTradePlan=${review.topTradePlanLabel ?? "none"}`,
    ],
    nextAction: review.sampleCount > 0
      ? "继续按形态、计划状态和 outcome 归因统计，不足样本不做结论。"
      : "让生命周期日记写入 v3_pattern_* / v3_trade_* 标签后再统计。",
    guardrail: "分型统计只服务人工归因；样本不足时不能自动调权或宣传胜率。",
  };
}

function historicalCaseReplayStage(health: SystemHealthReport): BusinessCapabilityStage {
  const archives = health.archive.entries ?? 0;
  const forwardSnapshots = health.v3ForwardMapReviews.savedSnapshots ?? 0;
  const reviewed = health.v3ForwardMapReviews.lastRun?.reviewedSnapshots ?? 0;
  const status: BusinessCapabilityStageStatus = archives === 0 && forwardSnapshots === 0
    ? "collecting"
    : reviewed > 0
      ? "ready"
      : "partial";

  return {
    id: "historical_case_replay",
    title: "历史案例回放",
    status,
    score: clampScore(statusScore(status) + Math.min(10, reviewed * 2)),
    summary: `扫描归档 ${archives}，v3 事前地图 ${forwardSnapshots}，已复盘 ${reviewed}。`,
    evidence: [
      `forwardMapStatus=${health.v3ForwardMapReviews.status}`,
      `latestReviewAt=${health.v3ForwardMapReviews.latestReviewAt ?? "none"}`,
    ],
    nextAction: health.v3ForwardMapReviews.operatorHint ?? "等待扫描归档和 Forward Map 复盘执行器产生历史样本。",
    guardrail: "历史回放只用当时保存的事前地图和后续 K 线验证，不能用未来信息美化旧判断。",
  };
}

function aiReviewStage(snapshot: MarketRadarSnapshot): BusinessCapabilityStage {
  const reviews = snapshot.signals
    .map((signal) => signal.aiReview)
    .filter((review): review is NonNullable<MarketSignal["aiReview"]> => Boolean(review));
  const statusCounts = reviews.reduce<Record<AiReviewStatus, number>>((current, review) => {
    current[review.status] += 1;
    return current;
  }, {
    disabled: 0,
    fallback: 0,
    reviewed: 0,
  });
  const reviewableSignals = snapshot.signals.filter((signal) => {
    const stage = maturityStage(signal);
    return stage === "EVIDENCE_SIGNAL" || stage === "TRADE_PLAN_READY";
  });
  const status: BusinessCapabilityStageStatus = statusCounts.reviewed > 0
    ? "ready"
    : reviews.length > 0 && statusCounts.disabled < reviews.length
      ? "partial"
      : "disabled";
  const firstBoundary = reviews[0]?.boundary;

  return {
    id: "ai_counter_review",
    title: "AI 反证复核",
    status,
    score: clampScore(statusScore(status) + Math.min(10, statusCounts.reviewed * 3)),
    summary: `可复核成熟信号 ${reviewableSignals.length}，已复核 ${statusCounts.reviewed}，fallback ${statusCounts.fallback}，禁用 ${statusCounts.disabled}。`,
    evidence: [
      `maxSignalsPerSnapshot=${firstBoundary?.cost.maxSignalsPerSnapshot ?? "unknown"}`,
      `costStatus=${firstBoundary?.cost.status ?? "missing"}`,
    ],
    nextAction: status === "disabled"
      ? "如需启用，配置 AI_REVIEW_ENABLED 和 AI_API_KEY；AI 只复核成熟信号，不扫全市场。"
      : "继续限制 AI 只做反证、失败路径和不确定性提示。",
    guardrail: "AI 不能创建交易信号，不能覆盖规则引擎，不能改实时排序和权重。",
  };
}

function evolutionSuggestionsStage(health: SystemHealthReport): BusinessCapabilityStage {
  const loop = health.strategyEvolutionLoop;
  const status: BusinessCapabilityStageStatus = loop.status === "blocked"
    ? "blocked"
    : loop.status === "manual_review_ready" || loop.status === "shadow_observation"
      ? "ready"
      : loop.status === "activation_disabled"
        ? "watch"
        : "collecting";

  return {
    id: "evolution_suggestions",
    title: "进化建议系统",
    status,
    score: clampScore(loop.readinessScore ?? 0),
    summary: `进化准备度 ${loop.readinessScore ?? 0}/100，状态 ${loop.status}，阻断 ${loop.blockers?.length ?? 0}。`,
    evidence: (loop.stages ?? []).map((stage) => `${stage.label}:${stage.status}:${stage.count}`).slice(0, 6),
    nextAction: loop.nextActions?.[0] ?? loop.operatorHint ?? "继续收集样本，不自动改权重。",
    guardrail: loop.guardrail ?? "进化建议只读展示，不能自动改权重。",
  };
}

function overallStatus(stages: BusinessCapabilityStage[]): BusinessCapabilityReport["status"] {
  if (stages.some((stage) => stage.status === "blocked")) {
    return "blocked";
  }

  const readyCount = stages.filter((stage) => stage.status === "ready").length;
  const watchCount = stages.filter((stage) => stage.status === "watch").length;
  const partialCount = stages.filter((stage) => stage.status === "partial").length;

  if (readyCount >= 6 && partialCount === 0 && watchCount <= 1) {
    return "operational";
  }

  if (readyCount >= 4) {
    return "watch";
  }

  if (readyCount + partialCount >= 5) {
    return "partial";
  }

  return "collecting";
}

function operatorHint(status: BusinessCapabilityReport["status"]) {
  if (status === "blocked") {
    return "业务闭环存在阻断项，先处理复盘、数据或门控问题，再扩展新能力。";
  }

  if (status === "operational") {
    return "业务闭环已能从扫描、分析、复盘到人工进化形成闭环；继续积累样本，不自动改权重。";
  }

  if (status === "watch") {
    return "业务闭环已经连起来，但仍有样本量、影子观察或 AI 复核边界需要继续观察。";
  }

  if (status === "partial") {
    return "核心模块已接入，但训练样本和历史复盘还不够，先补真实样本。";
  }

  return "业务闭环处于样本收集阶段，先保证扫描、生命周期和 outcome 写回稳定。";
}

export function buildBusinessCapabilityReport({
  health,
  snapshot,
}: {
  health: SystemHealthReport;
  snapshot: MarketRadarSnapshot;
}): BusinessCapabilityReport {
  const stages = [
    outcomeLifecycleStage({ health, snapshot }),
    outcomeStandardStage(health),
    candidateRotationStage({ health, snapshot }),
    signalMaturityStage({ health, snapshot }),
    shadowTrackingStage(health),
    strategyFamilyStatsStage(health),
    historicalCaseReplayStage(health),
    aiReviewStage(snapshot),
    evolutionSuggestionsStage(health),
  ];
  const readinessScore = clampScore(
    stages.reduce((sum, stage) => sum + stage.score, 0) / Math.max(1, stages.length),
  );
  const status = overallStatus(stages);
  const gaps = stages
    .filter((stage) => stage.status === "blocked" || stage.status === "collecting" || stage.status === "disabled")
    .map((stage) => `${stage.title}: ${stage.nextAction}`)
    .slice(0, 6);
  const nextActions = unique([
    ...stages
      .filter((stage) => stage.status !== "ready")
      .map((stage) => stage.nextAction),
    ...(health.strategyEvolutionLoop.nextActions ?? []),
  ]).slice(0, 8);

  return {
    schemaVersion: "business-capability.v1",
    generatedAt: health.generatedAt,
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canAutoExecute: false,
    canMutateLiveRanking: false,
    frontendContracts: [
      "前端必须展示能力状态、样本数、阻断项和下一步，不能只展示漂亮卡片。",
      "主信号区只能展示 EVIDENCE_SIGNAL / TRADE_PLAN_READY；LIGHT_SCAN_MARK 只能作为覆盖数量。",
      "历史回放和进化建议必须标明 research_only，不能暗示自动调权或自动下单。",
    ],
    gaps,
    mode: "business_capability_loop_v1",
    nextActions,
    operatingRules: [
      "规则引擎先给结构化结论，AI 只做反证复核。",
      "复盘系统可以提出人工建议，不能自动修改实时权重。",
      "最低 3:1 盈亏比是下限，不是固定目标；低于 3:1 不能输出交易计划。",
      "所有业务能力必须接入扫描、分析、复盘同一条链，不能做成两张皮。",
    ],
    operatorHint: operatorHint(status),
    readinessScore,
    stages,
    status,
  };
}
