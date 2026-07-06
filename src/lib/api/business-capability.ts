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
  | "analysis_reasoning"
  | "candidate_rotation"
  | "deep_scan_verification"
  | "evolution_suggestions"
  | "full_market_discovery"
  | "historical_case_replay"
  | "outcome_standard"
  | "risk_reward_gate"
  | "shadow_tracking"
  | "signal_lifecycle"
  | "signal_maturity"
  | "source_truth"
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
    REVIEW_ONLY: snapshot.signals.filter((signal) => signal.maturity?.stage === "REVIEW_ONLY").length,
    TRADE_PLAN_READY: snapshot.signals.filter((signal) => signal.maturity?.stage === "TRADE_PLAN_READY").length,
  };
}

function maturityStage(signal: MarketSignal) {
  return signal.maturity?.stage ?? "DEEP_SCAN_CANDIDATE";
}

function sourceTruthStage(health: SystemHealthReport): BusinessCapabilityStage {
  const dataSource = health.dataSource ?? {
    activeSource: "mock",
    configuredProvider: "unknown",
    mode: "demo",
    status: "fallback",
  };
  const persistence = health.persistence ?? {
    databaseDriver: "memory",
    databaseStatus: "unavailable",
    durable: false,
  };
  const coinGlass = health.coinGlassRuntimeCapability ?? {
    deepScanStatus: "not_requested",
    keyConfigured: false,
  };
  const sourceReady = dataSource.status === "ready" && dataSource.mode === "live";
  const databaseReady = persistence.databaseStatus === "ready" && persistence.durable;
  const coinGlassReady = coinGlass.keyConfigured &&
    coinGlass.deepScanStatus !== "auth_error" &&
    coinGlass.deepScanStatus !== "not_configured";
  const status: BusinessCapabilityStageStatus = sourceReady && databaseReady && coinGlassReady
    ? "ready"
    : dataSource.status === "missing_key" || coinGlass.deepScanStatus === "auth_error"
      ? "blocked"
      : "partial";

  return {
    id: "source_truth",
    title: "事实源边界",
    status,
    score: clampScore(statusScore(status) + (databaseReady ? 5 : -12) + (coinGlassReady ? 5 : -8)),
    summary: `当前事实源 ${dataSource.activeSource} / ${dataSource.mode}，数据库 ${persistence.databaseStatus}，CoinGlass ${coinGlass.deepScanStatus}。`,
    evidence: [
      `configuredProvider=${dataSource.configuredProvider}`,
      `databaseDriver=${persistence.databaseDriver}`,
      `coinGlassKeyConfigured=${coinGlass.keyConfigured}`,
    ],
    nextAction: status === "ready"
      ? "继续保持所有页面展示 source/status/age，不允许 mock 或旧缓存冒充实时数据。"
      : "先修复事实源、数据库或 CoinGlass 认证状态，再扩展分析和前端展示。",
    guardrail: "页面必须明确 live/cached/partial/stale/failed；未知数据只能显示等待或不可用，不能补假值。",
  };
}

function fullMarketDiscoveryStage(health: SystemHealthReport): BusinessCapabilityStage {
  const light = health.lightScan;
  const coverage = health.fullMarketCoverage?.coverage ?? {
    batchLabel: "unknown",
    coveragePercent: health.coverage?.coveragePercent ?? 0,
    eligible: health.coverage?.eligible ?? 0,
    nextBatchLabel: "unknown",
    pending: health.coverage?.pending ?? 0,
    scanned: health.coverage?.scanned ?? 0,
    total: health.coverage?.total ?? 0,
  };
  const lightReady = light?.status === "ready" && (light.acceptedCount ?? 0) > 0;
  const hasUniverse = coverage.eligible > 0 || coverage.total > 0;
  const fullMarketStatus = health.fullMarketCoverage?.status ?? "preview";
  const status: BusinessCapabilityStageStatus = !hasUniverse || fullMarketStatus === "blocked"
    ? "blocked"
    : lightReady && (fullMarketStatus === "rotating" || fullMarketStatus === "complete")
      ? "ready"
      : "partial";

  return {
    id: "full_market_discovery",
    title: "全市场发现",
    status,
    score: clampScore(statusScore(status) + Math.min(10, Math.round(coverage.coveragePercent / 10))),
    summary: `轻扫 accepted=${light?.acceptedCount ?? 0}/${light?.universeCount ?? coverage.total}，本轮覆盖 ${coverage.scanned}/${coverage.eligible}，待轮转 ${coverage.pending}。`,
    evidence: [
      `lightScanStatus=${light?.status ?? "missing"}`,
      `source=${light?.source ?? "unknown"}`,
      `batch=${coverage.batchLabel}, next=${coverage.nextBatchLabel}`,
    ],
    nextAction: health.fullMarketCoverage?.operatorHint ?? "补齐 fullMarketCoverage/lightScan 后再判断全市场发现质量。",
    guardrail: "轻扫只负责发现异常和调度候选；不能直接生成交易计划，未进入深扫也不代表淘汰。",
  };
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
    title: "观察生命周期",
    status,
    score: clampScore(statusScore(status) + Math.min(10, maturedSignals.length * 2)),
    summary: `当前 ${maturedSignals.length} 个成熟观察，${tracking} 个跟踪样本，${closed} 个已关闭样本。`,
    evidence: [
      `成熟观察 ${maturedSignals.map((signal) => signal.symbol).slice(0, 6).join(", ") || "等待"}`,
      `latestOutcomeAt=${health.outcomes.latestOutcomeAt ?? "none"}`,
    ],
    nextAction: closed > 0
      ? "继续让 outcome executor 复查到期样本，并把结果写回日记。"
      : "优先把证据融合级观察写入跟踪队列，形成可复盘生命周期。",
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

function deepScanVerificationStage(health: SystemHealthReport): BusinessCapabilityStage {
  const requests = health.scanDiagnostics?.requests;
  const planned = requests?.coinGlassRequestsPlanned ?? 0;
  const clean = requests?.cleanRows ?? 0;
  const raw = requests?.rawRows ?? 0;
  const failures = requests?.requestFailures?.length ?? 0;
  const coinGlass = health.coinGlassRuntimeCapability ?? {
    canCreateDerivativeEvidence: false,
    deepScanStatus: "not_requested",
    minuteLimit: 30,
    operatorHint: "CoinGlass runtime capability missing from health report.",
  };
  const runtimeStatus = coinGlass.deepScanStatus;
  const status: BusinessCapabilityStageStatus = clean > 0 && runtimeStatus === "ready"
    ? "ready"
    : runtimeStatus === "auth_error" || runtimeStatus === "not_configured"
      ? "blocked"
      : planned > 0 || raw > 0
        ? "watch"
        : "collecting";

  return {
    id: "deep_scan_verification",
    title: "深扫验证",
    status,
    score: clampScore(statusScore(status) + Math.min(12, clean * 2) - Math.min(20, failures * 4)),
    summary: `CoinGlass 计划请求 ${planned}，原始行 ${raw}，清洗可用 ${clean}，失败 ${failures}，状态 ${runtimeStatus}。`,
    evidence: [
      `minuteLimit=${coinGlass.minuteLimit}`,
      `canCreateDerivativeEvidence=${coinGlass.canCreateDerivativeEvidence}`,
      `operatorHint=${coinGlass.operatorHint}`,
    ],
    nextAction: clean > 0
      ? "继续用 CoinGlass 做付费衍生品确认，并用公开交易所数据交叉验证。"
      : "优先修复 CoinGlass 深扫可用性；公开交易所深扫只能标为 public verification，不能冒充 CoinGlass。",
    guardrail: "没有真实衍生品深扫证据时，只能保留验证中候选，不得输出完整交易计划。",
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
    summary: `轻扫 ${counts.LIGHT_SCAN_MARK}，深扫候选 ${counts.DEEP_SCAN_CANDIDATE}，证据观察 ${counts.EVIDENCE_SIGNAL}，计划就绪 ${counts.TRADE_PLAN_READY}。`,
    evidence: [
      `主信号区 ${mainSignals}`,
      `candidateLane=${snapshot.metadata.signalMaturity?.candidateLaneSymbols.slice(0, 6).join(", ") || "none"}`,
    ],
    nextAction: mainSignals > 0
      ? "前端主观察区只展示证据观察和交易计划就绪样本。"
      : "继续深扫候选，等待结构、衍生品和结构盈亏比证据补齐。",
    guardrail: health.signalMaturity?.guardrail ??
      "LIGHT_SCAN_MARK 只做调度输入，不能直接展示成交易机会。",
  };
}

function analysisReasoningStage(health: SystemHealthReport): BusinessCapabilityStage {
  const loop = {
    ...(health.v3StrategyLoop ?? {}),
    live: health.v3StrategyLoop?.live ?? {
      blockedPlans: 0,
      conflictSignals: 0,
      forwardLevels: 0,
      keyLevels: 0,
      missingV3Signals: 0,
      readyPlans: 0,
      riskGateBlocked: 0,
      totalSignals: 0,
      v3Signals: 0,
    },
    operatorHint: health.v3StrategyLoop?.operatorHint ?? "v3StrategyLoop missing from health report.",
    readinessBuckets: health.v3StrategyLoop?.readinessBuckets ?? [],
    status: health.v3StrategyLoop?.status ?? "collecting",
  };
  const live = loop.live;
  const status: BusinessCapabilityStageStatus = loop.status === "blocked"
    ? "blocked"
    : live.totalSignals === 0
      ? "collecting"
      : live.v3Signals > 0
        ? "ready"
        : "partial";

  return {
    id: "analysis_reasoning",
    title: "分析推理链",
    status,
    score: clampScore(
      statusScore(status) +
      Math.min(10, live.keyLevels) +
      Math.min(8, live.forwardLevels) -
      Math.min(16, live.missingV3Signals * 2),
    ),
    summary: `当前观察 ${live.totalSignals}，v3 覆盖 ${live.v3Signals}，关键位 ${live.keyLevels}，Forward Map ${live.forwardLevels}，缺失 ${live.missingV3Signals}。`,
    evidence: [
      `status=${loop.status}`,
      `readinessBuckets=${loop.readinessBuckets.map((bucket) => `${bucket.bucket}:${bucket.count}`).join(", ") || "none"}`,
    ],
    nextAction: loop.operatorHint,
    guardrail: "分析必须按大盘环境、相对强弱、多周期结构、关键位、量能、衍生品、指标辅助、反证和风险门控顺序走；单一指标不能直接出结论。",
  };
}

function riskRewardGateStage({
  health,
  snapshot,
}: {
  health: SystemHealthReport;
  snapshot: MarketRadarSnapshot;
}): BusinessCapabilityStage {
  const loop = {
    ...(health.v3StrategyLoop ?? {}),
    canMutateLiveRanking: false,
    live: health.v3StrategyLoop?.live ?? {
      blockedPlans: 0,
      readyPlans: 0,
      riskGateBlocked: 0,
      totalSignals: 0,
    },
  };
  const live = loop.live;
  const riskGateOn = snapshot.metadata.riskGate === "on";
  const status: BusinessCapabilityStageStatus = !riskGateOn
    ? "blocked"
    : live.totalSignals === 0
      ? "collecting"
      : "ready";

  return {
    id: "risk_reward_gate",
    title: "赔率风控门",
    status,
    score: clampScore(statusScore(status) + Math.min(10, live.riskGateBlocked + live.blockedPlans) + Math.min(8, live.readyPlans * 2)),
    summary: `Risk Gate=${snapshot.metadata.riskGate}，计划就绪 ${live.readyPlans}，风控拦截 ${live.riskGateBlocked}，计划阻断 ${live.blockedPlans}。`,
    evidence: [
      `minimumRR=3:1`,
      `canAutoExecute=false`,
      `canMutateLiveRanking=${loop.canMutateLiveRanking}`,
    ],
    nextAction: live.readyPlans > 0
      ? "计划就绪标的必须继续在单币档案展示入场触发、止损、目标、失效条件和个人仓位镜头。"
      : "继续等待结构、证据和 3:1 以上赔率同时满足；不要为了让前端有内容降低门槛。",
    guardrail: "3:1 是最低结构赔率下限，不是固定目标；低于 3:1、RiskScore 过高或高周期冲突时不得输出交易计划。",
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
    title: "规则反证复核",
    status,
    score: clampScore(statusScore(status) + Math.min(10, statusCounts.reviewed * 3)),
    summary: `可复核成熟信号 ${reviewableSignals.length}，规则已复核 ${statusCounts.reviewed}，异常 ${statusCounts.fallback}，未满足成熟度 ${statusCounts.disabled}。`,
    evidence: [
      `maxSignalsPerSnapshot=${firstBoundary?.cost.maxSignalsPerSnapshot ?? "unknown"}`,
      `costStatus=${firstBoundary?.cost.status ?? "missing"}`,
    ],
    nextAction: status === "disabled"
      ? "等待 EVIDENCE_SIGNAL 或 TRADE_PLAN_READY 后触发规则反证；外部 AI 已取消。"
      : "继续限制规则反证只做漏洞、失败路径和不确定性提示。",
    guardrail: "规则反证不能创建交易计划，不能覆盖主规则引擎，不能改实时排序和权重。",
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
    return "业务闭环已经连起来，但仍有样本量、影子观察或规则反证边界需要继续观察。";
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
    sourceTruthStage(health),
    fullMarketDiscoveryStage(health),
    candidateRotationStage({ health, snapshot }),
    deepScanVerificationStage(health),
    signalMaturityStage({ health, snapshot }),
    analysisReasoningStage(health),
    riskRewardGateStage({ health, snapshot }),
    outcomeLifecycleStage({ health, snapshot }),
    outcomeStandardStage(health),
    historicalCaseReplayStage(health),
    strategyFamilyStatsStage(health),
    shadowTrackingStage(health),
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
      "前端必须展示事实源、覆盖、候选、深扫、分析、风控、复盘状态，不能只展示漂亮卡片。",
      "主信号区只能展示 EVIDENCE_SIGNAL / TRADE_PLAN_READY；LIGHT_SCAN_MARK 只能作为覆盖数量。",
      "历史回放和进化建议必须标明 research_only，不能暗示自动调权或自动下单。",
    ],
    gaps,
    mode: "business_capability_loop_v1",
    nextActions,
    operatingRules: [
      "所有功能必须服务扫描 -> 候选 -> 深扫 -> 结构分析 -> 风险赔率 -> 交易计划 -> 复盘进化这条主链。",
      "规则引擎先给结构化结论，外部 AI 已取消；反证复核由代码规则完成。",
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
