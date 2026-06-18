import type { JournalEvent, OutcomeExecutorRunSummary } from "../analysis/types";
import {
  buildOutcomeCalibrationFlow,
  type OutcomeCalibrationFlow,
} from "../journal/outcome-calibration-flow";
import {
  buildOutcomeCalibrationAdmission,
  type OutcomeCalibrationAdmission,
} from "../journal/outcome-sample-admission";
import {
  buildStrategyWeightCalibrationReport,
  type StrategyWeightCalibrationReport,
} from "../journal/strategy-weight-calibration";
import {
  buildStrategyWeightChangeAuditReport,
  type StrategyWeightChangeAuditReport,
} from "../journal/strategy-weight-change-audit";
import {
  buildStrategyWeightChangeExecutionReport,
  type StrategyWeightChangeExecutionReport,
} from "../journal/strategy-weight-change-execution";
import {
  buildStrategyWeightActivationGate,
  type StrategyWeightActivationGateReport,
} from "../journal/strategy-weight-activation-gate";
import {
  buildStrategyWeightShadowReport,
  type StrategyWeightShadowReport,
} from "../journal/strategy-weight-shadow";
import {
  buildStrategyWeightShadowEvaluationReport,
  type StrategyWeightShadowEvaluationReport,
} from "../journal/strategy-weight-shadow-evaluation";
import { buildV3PatternReviewStats } from "../journal/v3-pattern-review-stats";
import type { PersistenceMode, PersistenceRepository } from "../persistence/persistence-store";
import type { DatabaseClientDiagnostics } from "../persistence/database-client";
import type {
  MarketDataSource,
  MarketDataStatus,
  MarketRadarSnapshot,
  ScanCoverage,
  ScanArchiveSummary,
  ScanTierCounts,
  ScanTierKey,
} from "../market/types";

export type SystemHealthLevel = "ready" | "preview" | "degraded" | "blocked";
export type ScanFreshness = "fresh" | "aging" | "expired" | "unknown";
export type DataSourceHealthStatus = "ready" | "preview" | "missing_key" | "fallback";

export type SystemHealthGuard = {
  id: "data-source" | "persistence" | "freshness" | "archive";
  label: string;
  state: SystemHealthLevel;
  detail: string;
};

export type ScanOperationsVerdict = "healthy" | "watch" | "attention" | "blocked";
export type OutcomeExecutorStatus = "idle" | "collecting" | "reviewing" | "covered";
export type OutcomeSampleQualityStatus =
  | "collecting"
  | "counterevidence_watch"
  | "empty"
  | "manual_review_ready";

export type V3ForwardMapReviewStatus =
  | "attention"
  | "covered"
  | "idle"
  | "waiting_run";

export type V3StrategyLoopStatus =
  | "blocked"
  | "collecting"
  | "ready_for_manual_review"
  | "waiting_data";

export type ScanEconomyBudgetStatus =
  | "near_budget"
  | "over_budget"
  | "unbudgeted"
  | "within_budget";

export type ScanEconomyTier = {
  pending: number;
  selected: number;
  total: number;
};

export type ScanEconomyNextTier = ScanTierKey | "complete";

export type ScanEconomyReport = {
  budget: {
    budgetUsagePercent: number | null;
    configuredDailyRequestBudget: number | null;
    effectiveBatchSize: number;
    estimatedDailyRequests: number;
    estimatedRemainingDailyRequests: number | null;
    estimatedRequestsPerScan: number;
    maxRequestsPerScan: number;
    publicDiscoveryRequestsPerDayEstimate: number;
    requestedBatchSize: number;
    status: ScanEconomyBudgetStatus;
    wasCapped: boolean;
  };
  coverage: {
    batchIndex: number;
    coveragePercent: number;
    eligible: number;
    nextBatchIndex: number;
    pending: number;
    pendingAssets: string[];
    scanned: number;
    scannedAssets: string[];
    skipped: number;
    totalBatches: number;
  };
  guardrail: string;
  mode: "scan_economy_mvp";
  nextTier: ScanEconomyNextTier;
  operatorHint: string;
  tiers: {
    active: ScanEconomyTier;
    anchor: ScanEconomyTier;
    core: ScanEconomyTier;
    longTail: ScanEconomyTier;
    skipped: number;
  };
};

export type FullMarketCoverageStatus =
  | "blocked"
  | "budget_capped"
  | "complete"
  | "preview"
  | "rotating";

export type FullMarketCoverageLane = {
  cadenceHint: string;
  id: ScanTierKey | "skipped";
  label: string;
  pending: number;
  priorityHint: string;
  selected: number;
  total: number;
};

export type FullMarketCoverageReport = {
  coverage: {
    batchLabel: string;
    cadenceMinutes: number;
    coveragePercent: number;
    eligible: number;
    estimatedFullCycleMinutes: number;
    nextBatchLabel: string;
    pending: number;
    scanned: number;
    skipped: number;
    total: number;
    totalBatches: number;
  };
  exchangeQuality: {
    majorThree: number;
    majorThreePercent: number;
    multiExchange: number;
    singleExchange: number;
    unlisted: number;
  };
  guardrails: string[];
  lanes: FullMarketCoverageLane[];
  mode: "full_market_coverage_depth_mvp";
  operatorHint: string;
  priorityExplanation: string;
  samples: {
    pendingAssets: string[];
    rejectedAssets: string[];
    scannedAssets: string[];
  };
  status: FullMarketCoverageStatus;
};

export type MarketDataQualityStatus =
  | "blocked"
  | "clean"
  | "degraded"
  | "preview"
  | "watch";

export type MarketDataQualityIssue = {
  action: string;
  count: number;
  label: string;
  severity: "high" | "low" | "medium";
};

export type MarketDataQualityReport = {
  filters: {
    acceptedPool: number;
    cleanRows: number | null;
    duplicateSymbolCount: number;
    duplicatesRemoved: number;
    minVolume24hUsd: number;
    primaryRows: number | null;
    quoteNotSupported: number;
    rawRows: number | null;
    rejectedPool: number;
    unsupportedExchange: number;
  };
  guardrails: string[];
  issues: MarketDataQualityIssue[];
  mode: "market_data_quality_mvp";
  operatorHint: string;
  qualityScore: number;
  rejectedSamples: string[];
  status: MarketDataQualityStatus;
};

export type V3ForwardMapReviewHealthReport = {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  latestReviewAt: string | null;
  latestRunAt: string | null;
  lastRun: {
    failedFetches: number;
    failureReasons: string[];
    fetchedCandles: number;
    ranAt: string;
    reviewedSnapshots: number;
    scannedSnapshots: number;
    skippedReasons: NonNullable<JournalEvent["trendRadarReviewRun"]>["skippedReasons"];
    skippedSnapshots: number;
    writtenEvents: number;
  } | null;
  mode: "v3_forward_map_review_health_mvp";
  operatorHint: string;
  savedSnapshots: number;
  status: V3ForwardMapReviewStatus;
  storageDetail: string;
  storageStatus: "ready" | "unavailable";
};

export type V3StrategyLoopCandidate = {
  decision: string;
  nextStep: string;
  planStatus: string;
  rewardRisk: number | null;
  riskGateAllowed: boolean;
  state: string;
  symbol: string;
};

export type V3StrategyLoopReport = {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  canMutateLiveRanking: false;
  candidates: V3StrategyLoopCandidate[];
  guardrail: string;
  live: {
    blockedPlans: number;
    conflictSignals: number;
    forwardLevels: number;
    keyLevels: number;
    missingV3Signals: number;
    readyPlans: number;
    riskGateBlocked: number;
    totalSignals: number;
    v3Signals: number;
  };
  mode: "v3_strategy_loop_mvp";
  operatorHint: string;
  review: {
    closedSamples: number;
    patternStatus: string;
    pendingSamples: number;
    sampleCount: number;
    topPatternLabel: string | null;
    topTradePlanLabel: string | null;
  };
  status: V3StrategyLoopStatus;
};

export type SystemHealthReport = {
  generatedAt: string;
  level: SystemHealthLevel;
  summary: string;
  dataSource: {
    activeSource: MarketDataSource;
    configuredProvider: string;
    detail: string;
    isRealtime: boolean;
    mode: "demo" | "live";
    status: DataSourceHealthStatus;
  };
  persistence: {
    databaseDriver: DatabaseClientDiagnostics["driver"];
    databaseReason?: DatabaseClientDiagnostics["reason"];
    databaseStatus: DatabaseClientDiagnostics["status"];
    detail: string;
    durable: boolean;
    mode: PersistenceMode;
    scope: string;
  };
  scan: {
    ageMinutes: number | null;
    anomalyCount: number;
    cadenceMinutes: number;
    candidateCount: number;
    freshness: ScanFreshness;
    generatedAt: string;
    nextScanAt: string;
    riskGate: MarketRadarSnapshot["metadata"]["riskGate"];
    scannedCount: number;
    status: MarketDataStatus;
    staleAfterMinutes: number;
  };
  archive: {
    entries: number;
    retentionMode: PersistenceMode;
  };
  coverage: ScanCoverage;
  fullMarketCoverage: FullMarketCoverageReport;
  marketDataQuality: MarketDataQualityReport;
  scanEconomy: ScanEconomyReport;
  operations: {
    batchDetail: string | null;
    lastProblemScanAt: string | null;
    lastSuccessfulScanAt: string | null;
    minutesUntilNextScan: number | null;
    minutesUntilStale: number | null;
    operatorHint: string;
    recentProblemCount: number;
    recentSuccessCount: number;
    requestDetail: string | null;
    runtimeDetail: string | null;
    verdict: ScanOperationsVerdict;
  };
  outcomes: {
    allowedUse: "research_only";
    canAutoAdjustWeights: false;
    calibrationAdmission: OutcomeCalibrationAdmission;
    calibrationFlow: OutcomeCalibrationFlow;
    closedEvents: number;
    coveragePercent: number;
    dueEvents: number;
    latestRunAt: string | null;
    latestOutcomeAt: string | null;
    lastRun: {
      dueEvents: number;
      failedFetches: number;
      failureReasons: string[];
      fetchedCandles: number;
      ranAt: string;
      scannedEvents: number;
      skippedEvents: number;
      writtenEvents: number;
    } | null;
    mode: "outcome_executor_mvp";
    operatorHint: string;
    pendingEvents: number;
    sampleQuality: {
      autoWeightEligible: false;
      expiredEvents: number;
      failedEvents: number;
      manualReviewReady: boolean;
      pendingEvents: number;
      status: OutcomeSampleQualityStatus;
      validatedEvents: number;
    };
    status: OutcomeExecutorStatus;
    strategyWeightChangeAudit: StrategyWeightChangeAuditReport;
    strategyWeightChangeExecution: StrategyWeightChangeExecutionReport;
    strategyWeightActivationGate: StrategyWeightActivationGateReport;
    strategyWeightCalibration: StrategyWeightCalibrationReport;
    strategyWeightShadow: StrategyWeightShadowReport;
    strategyWeightShadowEvaluation: StrategyWeightShadowEvaluationReport;
    trackingEvents: number;
  };
  v3ForwardMapReviews: V3ForwardMapReviewHealthReport;
  v3StrategyLoop: V3StrategyLoopReport;
  guards: SystemHealthGuard[];
};

export type BuildSystemHealthReportOptions = {
  database?: DatabaseClientDiagnostics;
  env?: Record<string, string | undefined>;
  now?: Date;
  repository: PersistenceRepository;
  snapshot: MarketRadarSnapshot;
};

function requestedProvider(env: Record<string, string | undefined>) {
  return env.MARKET_DATA_PROVIDER?.trim() || "mock";
}

function ageMinutes(generatedAt: string, now: Date) {
  const generatedTime = new Date(generatedAt).getTime();

  if (Number.isNaN(generatedTime)) {
    return null;
  }

  return Math.max(0, Math.round((now.getTime() - generatedTime) / 60_000));
}

function minutesUntil(value: string, now: Date) {
  const targetTime = new Date(value).getTime();

  if (Number.isNaN(targetTime)) {
    return null;
  }

  return Math.max(0, Math.ceil((targetTime - now.getTime()) / 60_000));
}

function addMinutes(value: string, minutes: number) {
  const time = new Date(value).getTime();

  if (Number.isNaN(time)) {
    return null;
  }

  return new Date(time + minutes * 60_000).toISOString();
}

function scanFreshness({
  age,
  metadata,
}: {
  age: number | null;
  metadata: MarketRadarSnapshot["metadata"];
}): ScanFreshness {
  if (age === null) {
    return "unknown";
  }

  if (metadata.status === "failed" || age > metadata.staleAfterMinutes) {
    return "expired";
  }

  if (metadata.status === "stale" || age > metadata.cadenceMinutes) {
    return "aging";
  }

  return "fresh";
}

function metadataNote(notes: string[], prefix: string) {
  return notes.find((note) => note.startsWith(prefix)) ?? null;
}

function fallbackCoverage(metadata: MarketRadarSnapshot["metadata"]): ScanCoverage {
  const scannedAssets: string[] = [];

  return {
    batchIndex: 0,
    coveragePercent: metadata.scannedCount > 0 ? 100 : 0,
    eligible: metadata.scannedCount,
    nextBatchIndex: 0,
    pending: 0,
    pendingAssets: [],
    scanned: metadata.scannedCount,
    scannedAssets,
    skipped: 0,
    skippedAssets: [],
    total: metadata.scannedCount,
    totalBatches: 1,
  };
}

function emptyTierCounts(): ScanTierCounts {
  return {
    active: 0,
    anchor: 0,
    core: 0,
    long_tail: 0,
  };
}

function tierStats(
  tier: ScanTierKey,
  tierCounts: ScanTierCounts,
  selectedTierCounts: ScanTierCounts,
): ScanEconomyTier {
  const total = tierCounts[tier];
  const selected = Math.min(total, selectedTierCounts[tier] ?? 0);

  return {
    pending: Math.max(0, total - selected),
    selected,
    total,
  };
}

function nextPendingTier(tierCounts: ScanTierCounts, selectedTierCounts: ScanTierCounts): ScanEconomyNextTier {
  const tierOrder: ScanTierKey[] = ["anchor", "core", "active", "long_tail"];

  return tierOrder.find((tier) => (selectedTierCounts[tier] ?? 0) < tierCounts[tier]) ?? "complete";
}

function fallbackQuota(metadata: MarketRadarSnapshot["metadata"], coverage: ScanCoverage) {
  const windowsPerDay = Math.ceil(1_440 / metadata.cadenceMinutes);
  const estimatedRequestsPerScan = Math.max(1, coverage.scanned || metadata.scannedCount || 1);

  return {
    budgetUsagePercent: null,
    configuredDailyRequestBudget: null,
    effectiveBatchSize: estimatedRequestsPerScan,
    estimatedDailyRequests: estimatedRequestsPerScan * windowsPerDay,
    estimatedRemainingDailyRequests: null,
    estimatedRequestsPerScan,
    maxRequestsPerScan: estimatedRequestsPerScan,
    publicDiscoveryRequestsPerDayEstimate: 0,
    requestedBatchSize: estimatedRequestsPerScan,
    status: "unbudgeted" as const,
    wasCapped: false,
  };
}

function scanEconomyHint({
  coverage,
  status,
  wasCapped,
}: {
  coverage: ScanCoverage;
  status: ScanEconomyBudgetStatus;
  wasCapped: boolean;
}) {
  if (status === "over_budget") {
    return "预算已经超出，保持最小锚定扫描并等待下一轮预算窗口。";
  }

  if (status === "near_budget") {
    return "预算接近上限，当前批次已保守轮转，优先保障锚定币和高价值合约池。";
  }

  if (wasCapped) {
    return "批次已按预算压缩，覆盖率靠轮转补齐，不一次性扫完全市场。";
  }

  if (status === "unbudgeted") {
    return "未配置 CoinGlass 日预算，当前只展示估算扫描经济，建议保留默认保守批次。";
  }

  if (coverage.pending > 0) {
    return "预算仍在安全区，继续按层级轮转覆盖待扫资产。";
  }

  return "当前扫描覆盖已完成本轮可见币池，继续复用缓存和归档结果。";
}

function buildScanEconomyReport(
  metadata: MarketRadarSnapshot["metadata"],
  coverage: ScanCoverage,
): ScanEconomyReport {
  const tierCounts = coverage.tierCounts ?? emptyTierCounts();
  const selectedTierCounts = coverage.selectedTierCounts ?? emptyTierCounts();
  const quota = metadata.quota
    ? {
        budgetUsagePercent: metadata.quota.coinGlassBudgetUsagePercent,
        configuredDailyRequestBudget: metadata.quota.coinGlassDailyRequestBudget,
        effectiveBatchSize: metadata.quota.effectiveBatchSize,
        estimatedDailyRequests: metadata.quota.coinGlassRequestsPerDayEstimate,
        estimatedRemainingDailyRequests: metadata.quota.coinGlassRemainingDailyRequestEstimate,
        estimatedRequestsPerScan: metadata.quota.coinGlassRequestsPerScan,
        maxRequestsPerScan: metadata.quota.maxCoinGlassRequestsPerScan,
        publicDiscoveryRequestsPerDayEstimate: metadata.quota.publicDiscoveryRequestsPerDayEstimate,
        requestedBatchSize: metadata.quota.requestedBatchSize,
        status: metadata.quota.status,
        wasCapped: metadata.quota.wasCapped,
      }
    : fallbackQuota(metadata, coverage);

  return {
    budget: quota,
    coverage: {
      batchIndex: coverage.batchIndex,
      coveragePercent: coverage.coveragePercent,
      eligible: coverage.eligible,
      nextBatchIndex: coverage.nextBatchIndex,
      pending: coverage.pending,
      pendingAssets: coverage.pendingAssets.slice(0, 8),
      scanned: coverage.scanned,
      scannedAssets: coverage.scannedAssets.slice(0, 8),
      skipped: coverage.skipped,
      totalBatches: coverage.totalBatches,
    },
    guardrail: "扫描经济只复用本轮 scan metadata，不会增加 CoinGlass 请求，也不会从前端触发额外扫描。",
    mode: "scan_economy_mvp",
    nextTier: nextPendingTier(tierCounts, selectedTierCounts),
    operatorHint: scanEconomyHint({
      coverage,
      status: quota.status,
      wasCapped: quota.wasCapped,
    }),
    tiers: {
      active: tierStats("active", tierCounts, selectedTierCounts),
      anchor: tierStats("anchor", tierCounts, selectedTierCounts),
      core: tierStats("core", tierCounts, selectedTierCounts),
      longTail: tierStats("long_tail", tierCounts, selectedTierCounts),
      skipped: coverage.skipped,
    },
  };
}

function fullMarketStatus({
  coverage,
  metadata,
  quotaStatus,
  wasCapped,
}: {
  coverage: ScanCoverage;
  metadata: MarketRadarSnapshot["metadata"];
  quotaStatus: ScanEconomyBudgetStatus;
  wasCapped: boolean;
}): FullMarketCoverageStatus {
  if (coverage.eligible === 0 || metadata.status === "failed") {
    return "blocked";
  }

  if (metadata.source === "mock") {
    return "preview";
  }

  if (quotaStatus === "near_budget" || quotaStatus === "over_budget" || wasCapped) {
    return "budget_capped";
  }

  if (coverage.pending === 0) {
    return "complete";
  }

  return "rotating";
}

function fullMarketOperatorHint(status: FullMarketCoverageStatus, coverage: ScanCoverage) {
  if (status === "blocked") {
    return "当前没有可解释的合约币池覆盖，先确认数据源、币池发现和扫描成功率。";
  }

  if (status === "preview") {
    return "当前是预览覆盖，只能验证流程和界面，不代表真实全市场扫描。";
  }

  if (status === "budget_capped") {
    return "全市场覆盖正在按预算压缩轮转，先保证锚定币和高优先级山寨，不做一次性深扫。";
  }

  if (status === "complete") {
    return "当前可见合约币池已完成本轮覆盖，后续继续按节奏刷新并复用归档。";
  }

  return `全市场覆盖正在轮转，还有 ${coverage.pending} 个标的等待后续批次。`;
}

function fullMarketPriorityExplanation(coverage: ScanCoverage) {
  const tierPolicy = coverage.tierPolicy;

  if (!tierPolicy) {
    return "候选池优先级来自锚定币、配置白名单、流动性、交易所覆盖和近期信号；当前缺少层级策略元数据。";
  }

  return [
    "候选池优先级来自锚定币、配置白名单、流动性、交易所覆盖和近期信号。",
    `热门资产约每 ${tierPolicy.activeEveryWindows} 个扫描窗口轮到一次，长尾资产约每 ${tierPolicy.longTailEveryWindows} 个窗口低频巡检。`,
    "只有进入候选或关键观察状态的标的才进入后续深度分析。",
  ].join(" ");
}

function fullMarketLaneRows(scanEconomy: ScanEconomyReport): FullMarketCoverageLane[] {
  return [
    {
      cadenceHint: "每轮优先保留",
      id: "anchor",
      label: "锚定大盘",
      pending: scanEconomy.tiers.anchor.pending,
      priorityHint: "BTC/ETH 用于判断大盘天气，不与山寨抢请求预算。",
      selected: scanEconomy.tiers.anchor.selected,
      total: scanEconomy.tiers.anchor.total,
    },
    {
      cadenceHint: "高频主池",
      id: "core",
      label: "核心山寨",
      pending: scanEconomy.tiers.core.pending,
      priorityHint: "优先覆盖流动性更好、配置优先或交易所覆盖更完整的山寨。",
      selected: scanEconomy.tiers.core.selected,
      total: scanEconomy.tiers.core.total,
    },
    {
      cadenceHint: "中频轮转",
      id: "active",
      label: "活跃山寨",
      pending: scanEconomy.tiers.active.pending,
      priorityHint: "保持中频巡检，捕捉突然进入启动前状态的热门标的。",
      selected: scanEconomy.tiers.active.selected,
      total: scanEconomy.tiers.active.total,
    },
    {
      cadenceHint: "低频长尾",
      id: "long_tail",
      label: "长尾新币",
      pending: scanEconomy.tiers.longTail.pending,
      priorityHint: "低频覆盖新币和长尾币，避免为了全市场一次性打爆配额。",
      selected: scanEconomy.tiers.longTail.selected,
      total: scanEconomy.tiers.longTail.total,
    },
    {
      cadenceHint: "不进入扫描",
      id: "skipped",
      label: "过滤标的",
      pending: 0,
      priorityHint: "非 USDT、非永续、停牌或数据质量不合格的标的不进入分析。",
      selected: scanEconomy.tiers.skipped,
      total: scanEconomy.tiers.skipped,
    },
  ];
}

function fullMarketCoverageReport(
  metadata: MarketRadarSnapshot["metadata"],
  coverage: ScanCoverage,
  scanEconomy: ScanEconomyReport,
): FullMarketCoverageReport {
  const exchangeSummary = coverage.exchangeCoverageSummary ?? {
    majorThree: 0,
    multiExchange: 0,
    singleExchange: 0,
    unlisted: 0,
  };
  const eligible = Math.max(0, coverage.eligible);
  const status = fullMarketStatus({
    coverage,
    metadata,
    quotaStatus: scanEconomy.budget.status,
    wasCapped: scanEconomy.budget.wasCapped,
  });
  const totalBatches = Math.max(1, coverage.totalBatches);
  const estimatedFullCycleMinutes = totalBatches * metadata.cadenceMinutes;
  const majorThreePercent = eligible > 0
    ? Math.round((exchangeSummary.majorThree / eligible) * 100)
    : 0;

  return {
    coverage: {
      batchLabel: `${coverage.batchIndex + 1}/${totalBatches}`,
      cadenceMinutes: metadata.cadenceMinutes,
      coveragePercent: coverage.coveragePercent,
      eligible,
      estimatedFullCycleMinutes,
      nextBatchLabel: `${coverage.nextBatchIndex + 1}/${totalBatches}`,
      pending: coverage.pending,
      scanned: coverage.scanned,
      skipped: coverage.skipped,
      total: coverage.total,
      totalBatches,
    },
    exchangeQuality: {
      majorThree: exchangeSummary.majorThree,
      majorThreePercent,
      multiExchange: exchangeSummary.multiExchange,
      singleExchange: exchangeSummary.singleExchange,
      unlisted: exchangeSummary.unlisted,
    },
    guardrails: [
      "全市场扫描采用轻扫描轮转，深度分析只给候选池和关键观察标的。",
      "前端覆盖报告只读取本轮 metadata，不会触发额外 CoinGlass 请求。",
      "覆盖率不是胜率，未扫标的只代表等待轮转，不代表没有机会。",
    ],
    lanes: fullMarketLaneRows(scanEconomy),
    mode: "full_market_coverage_depth_mvp",
    operatorHint: fullMarketOperatorHint(status, coverage),
    priorityExplanation: fullMarketPriorityExplanation(coverage),
    samples: {
      pendingAssets: coverage.pendingAssets.slice(0, 10),
      rejectedAssets: coverage.skippedAssets.slice(0, 6).map((asset) => `${asset.symbol}:${asset.reason}`),
      scannedAssets: coverage.scannedAssets.slice(0, 10),
    },
    status,
  };
}

function parseQualityFilterNote(notes: string[]) {
  const note = metadataNote(notes, "quality filter:");
  const match = note?.match(/raw\s+(\d+),\s+clean\s+(\d+),\s+primary\s+(\d+)/u);

  if (!match) {
    return {
      cleanRows: null,
      primaryRows: null,
      rawRows: null,
    };
  }

  return {
    cleanRows: Number(match[2]),
    primaryRows: Number(match[3]),
    rawRows: Number(match[1]),
  };
}

function parseQualityRejectionNote(notes: string[]) {
  const note = metadataNote(notes, "quality rejections:");
  const match = note?.match(
    /unsupported_exchange\s+(\d+),\s+quote_not_supported\s+(\d+),\s+duplicate_symbol\s+(\d+)/u,
  );

  if (!match) {
    return {
      duplicateSymbolCount: 0,
      quoteNotSupported: 0,
      unsupportedExchange: 0,
    };
  }

  return {
    duplicateSymbolCount: Number(match[3]),
    quoteNotSupported: Number(match[2]),
    unsupportedExchange: Number(match[1]),
  };
}

function marketDataQualityScore({
  duplicateSymbolCount,
  duplicatesRemoved,
  quoteNotSupported,
  rejectedPool,
  totalPool,
  unsupportedExchange,
}: {
  duplicateSymbolCount: number;
  duplicatesRemoved: number;
  quoteNotSupported: number;
  rejectedPool: number;
  totalPool: number;
  unsupportedExchange: number;
}) {
  const rejectionRatioPenalty = totalPool > 0
    ? Math.round((rejectedPool / totalPool) * 22)
    : 0;
  const penalty = Math.min(30, unsupportedExchange * 8) +
    Math.min(25, quoteNotSupported * 5) +
    Math.min(18, duplicateSymbolCount * 3 + duplicatesRemoved * 2) +
    rejectionRatioPenalty;

  return Math.max(0, Math.min(100, 100 - penalty));
}

function marketDataQualityStatus({
  acceptedPool,
  metadata,
  qualityScore,
}: {
  acceptedPool: number;
  metadata: MarketRadarSnapshot["metadata"];
  qualityScore: number;
}): MarketDataQualityStatus {
  if (metadata.status === "failed" || acceptedPool === 0) {
    return "blocked";
  }

  if (metadata.source === "mock") {
    return "preview";
  }

  if (qualityScore < 65) {
    return "degraded";
  }

  if (qualityScore < 92) {
    return "watch";
  }

  return "clean";
}

function marketDataQualityOperatorHint(status: MarketDataQualityStatus) {
  if (status === "blocked") {
    return "数据质量阻断，当前不能把扫描结果当成可用候选池。";
  }

  if (status === "preview") {
    return "当前是演示或预览质量，只用于验证流程，不代表真实市场数据。";
  }

  if (status === "degraded") {
    return "数据清洗发现较多异常，优先检查非 USDT、未知交易所、重复币种和低流动性过滤。";
  }

  if (status === "watch") {
    return "数据质量可用但有过滤痕迹，继续观察被拒原因和主交易所聚合是否稳定。";
  }

  return "数据质量干净，主扫描已完成交易所、报价、去重和流动性基础过滤。";
}

function marketDataQualityIssues({
  duplicateSymbolCount,
  duplicatesRemoved,
  quoteNotSupported,
  rejectedPool,
  unsupportedExchange,
}: {
  duplicateSymbolCount: number;
  duplicatesRemoved: number;
  quoteNotSupported: number;
  rejectedPool: number;
  unsupportedExchange: number;
}): MarketDataQualityIssue[] {
  const issues: MarketDataQualityIssue[] = [];

  if (unsupportedExchange > 0) {
    issues.push({
      action: "降级或拒绝 UNKNOWN，优先保留 Binance/OKX/Bybit/Coinbase。",
      count: unsupportedExchange,
      label: "未知交易所",
      severity: "high",
    });
  }

  if (quoteNotSupported > 0) {
    issues.push({
      action: "只保留 USDT 永续，报价冲突或 USDC/USD 行不进入候选。",
      count: quoteNotSupported,
      label: "报价不支持",
      severity: "medium",
    });
  }

  if (duplicateSymbolCount + duplicatesRemoved > 0) {
    issues.push({
      action: "同币种按交易所优先级、成交量和 OI 聚合为主信号。",
      count: duplicateSymbolCount + duplicatesRemoved,
      label: "重复币种",
      severity: "low",
    });
  }

  if (rejectedPool > 0) {
    issues.push({
      action: "停牌、非永续、非 USDT 或低于流动性门槛的标的不进入分析。",
      count: rejectedPool,
      label: "池过滤",
      severity: "medium",
    });
  }

  return issues;
}

function marketDataQualityReport(snapshot: MarketRadarSnapshot): MarketDataQualityReport {
  const qualityFilter = parseQualityFilterNote(snapshot.metadata.notes);
  const qualityRejections = parseQualityRejectionNote(snapshot.metadata.notes);
  const poolSummary = snapshot.instrumentPool.summary;
  const qualityScore = marketDataQualityScore({
    duplicateSymbolCount: qualityRejections.duplicateSymbolCount,
    duplicatesRemoved: poolSummary.duplicatesRemoved,
    quoteNotSupported: qualityRejections.quoteNotSupported,
    rejectedPool: poolSummary.rejected,
    totalPool: poolSummary.total,
    unsupportedExchange: qualityRejections.unsupportedExchange,
  });
  const status = marketDataQualityStatus({
    acceptedPool: poolSummary.accepted,
    metadata: snapshot.metadata,
    qualityScore,
  });

  return {
    filters: {
      acceptedPool: poolSummary.accepted,
      cleanRows: qualityFilter.cleanRows,
      duplicateSymbolCount: qualityRejections.duplicateSymbolCount,
      duplicatesRemoved: poolSummary.duplicatesRemoved,
      minVolume24hUsd: poolSummary.minVolume24hUsd,
      primaryRows: qualityFilter.primaryRows,
      quoteNotSupported: qualityRejections.quoteNotSupported,
      rawRows: qualityFilter.rawRows,
      rejectedPool: poolSummary.rejected,
      unsupportedExchange: qualityRejections.unsupportedExchange,
    },
    guardrails: [
      "数据质量层只能阻断、降级或解释候选，不能单独生成交易方向。",
      "UNKNOWN、非 USDT、报价冲突和低流动性标的不能包装成机会。",
      "同币种多交易所行必须聚合，避免重复信号刷屏。",
    ],
    issues: marketDataQualityIssues({
      duplicateSymbolCount: qualityRejections.duplicateSymbolCount,
      duplicatesRemoved: poolSummary.duplicatesRemoved,
      quoteNotSupported: qualityRejections.quoteNotSupported,
      rejectedPool: poolSummary.rejected,
      unsupportedExchange: qualityRejections.unsupportedExchange,
    }),
    mode: "market_data_quality_mvp",
    operatorHint: marketDataQualityOperatorHint(status),
    qualityScore,
    rejectedSamples: snapshot.instrumentPool.rejected
      .slice(0, 6)
      .map((item) => `${item.instrument.symbol}:${item.reason}`),
    status,
  };
}

function sourceStatus({
  activeSource,
  configuredProvider,
  env,
}: {
  activeSource: MarketDataSource;
  configuredProvider: string;
  env: Record<string, string | undefined>;
}): DataSourceHealthStatus {
  if (configuredProvider === "coinglass" && !env.COINGLASS_API_KEY?.trim()) {
    return "missing_key";
  }

  if (configuredProvider === "coinglass" && activeSource !== "coinglass") {
    return "fallback";
  }

  return activeSource === "mock" ? "preview" : "ready";
}

function sourceDetail(status: DataSourceHealthStatus, activeSource: MarketDataSource) {
  if (status === "missing_key") {
    return "已请求 CoinGlass，但缺少 COINGLASS_API_KEY，当前不能视为真实行情。";
  }

  if (status === "fallback") {
    return `配置请求真实数据，但当前返回 ${activeSource}，需要检查 provider 启用条件。`;
  }

  if (status === "preview") {
    return "当前使用演示数据，适合预览界面和流程，不代表真实市场。";
  }

  return "当前使用真实数据源，仍需同时观察缓存和限速状态。";
}

function levelRank(level: SystemHealthLevel) {
  return {
    ready: 0,
    preview: 1,
    degraded: 2,
    blocked: 3,
  }[level];
}

function strongestLevel(levels: SystemHealthLevel[]): SystemHealthLevel {
  return levels.reduce<SystemHealthLevel>(
    (current, item) => (levelRank(item) > levelRank(current) ? item : current),
    "ready",
  );
}

function overallSummary(level: SystemHealthLevel) {
  if (level === "blocked") {
    return "系统有阻断项，不能把当前结果当成可用扫描。";
  }

  if (level === "degraded") {
    return "系统可访问，但存在数据源或新鲜度问题，需要先排查。";
  }

  if (level === "preview") {
    return "系统处于预览状态，适合调试流程，不能承诺永久保存或真实行情。";
  }

  return "系统状态可用，数据源、扫描和持久化边界清晰。";
}

function fallbackDatabaseDiagnostics({
  durable,
  repository,
}: {
  durable: boolean;
  repository: PersistenceRepository;
}): DatabaseClientDiagnostics {
  if (durable) {
    return {
      detail: `当前使用 ${repository.mode} 持久化，scope 为 ${repository.scope}。`,
      driver: "postgres",
      durable: true,
      hasDatabaseUrl: true,
      scope: repository.scope,
      status: "ready",
    };
  }

  return {
    detail: `当前使用 ${repository.mode} 存储，刷新或重启后可能丢失演示记录。`,
    driver: "none",
    durable: false,
    hasDatabaseUrl: false,
    reason: "database_url_missing",
    scope: repository.scope,
    status: "unconfigured",
  };
}

function scanOperations({
  archiveSummaries,
  freshness,
  metadata,
  now,
}: {
  archiveSummaries: ScanArchiveSummary[];
  freshness: ScanFreshness;
  metadata: MarketRadarSnapshot["metadata"];
  now: Date;
}): SystemHealthReport["operations"] {
  const successfulArchives = archiveSummaries.filter((archive) =>
    archive.status === "ready" || archive.status === "partial"
  );
  const problemArchives = archiveSummaries.filter((archive) =>
    archive.status === "failed" || archive.status === "stale"
  );
  const currentIsSuccessful = metadata.status === "ready" || metadata.status === "partial";
  const lastSuccessfulScanAt = currentIsSuccessful
    ? metadata.generatedAt
    : successfulArchives[0]?.generatedAt ?? null;
  const lastProblemScanAt = problemArchives[0]?.generatedAt ??
    (metadata.status === "failed" || metadata.status === "stale" ? metadata.generatedAt : null);
  const staleAt = addMinutes(metadata.generatedAt, metadata.staleAfterMinutes);
  const minutesUntilStale = staleAt ? minutesUntil(staleAt, now) : null;
  const minutesUntilNextScan = minutesUntil(metadata.nextScanAt, now);
  const recentProblemCount = problemArchives.length;
  const recentSuccessCount = successfulArchives.length;
  const batchDetail = metadataNote(metadata.notes, "batch ");
  const requestDetail = metadataNote(metadata.notes, "requests ");
  const runtimeDetail = metadataNote(metadata.notes, "scan runtime:");
  const verdict: ScanOperationsVerdict = metadata.status === "failed" || !lastSuccessfulScanAt
    ? "blocked"
    : freshness === "expired" || freshness === "unknown"
      ? "attention"
      : freshness === "aging" || metadata.status === "stale"
        ? "watch"
        : "healthy";

  let operatorHint = "扫描链路正常，继续观察下一次自动触发。";

  if (!lastSuccessfulScanAt) {
    operatorHint = "没有成功扫描记录，先检查 GitHub Actions、CRON_SECRET 和数据源响应。";
  } else if (verdict === "blocked") {
    operatorHint = "当前扫描失败，先处理接口鉴权、数据源或持久化错误。";
  } else if (verdict === "attention") {
    operatorHint = "扫描结果已经过期，需要确认定时任务是否继续运行。";
  } else if (verdict === "watch") {
    operatorHint = "扫描正在接近过期窗口，观察下一次自动刷新是否准时。";
  } else if (recentProblemCount > 0) {
    operatorHint = "最近出现过异常，但当前扫描已恢复，建议继续观察一轮。";
  } else if (minutesUntilStale !== null && minutesUntilStale <= 5) {
    operatorHint = "距离过期窗口很近，下一轮扫描需要准时完成。";
  }

  return {
    batchDetail,
    lastProblemScanAt,
    lastSuccessfulScanAt,
    minutesUntilNextScan,
    minutesUntilStale,
    operatorHint,
    recentProblemCount,
    recentSuccessCount,
    requestDetail,
    runtimeDetail,
    verdict,
  };
}

function journalTime(value: string | undefined) {
  const time = value ? new Date(value).getTime() : Number.NaN;

  return Number.isNaN(time) ? 0 : time;
}

function isSignalOutcomeEvent(event: JournalEvent) {
  return Boolean(
    event.signalId &&
    event.outcomeStatus &&
    event.action !== "calibration_review" &&
    event.action !== "strategy_confirmation",
  );
}

function isPendingOutcome(event: JournalEvent) {
  return event.reviewStatus === "tracking" && event.outcomeStatus === "pending";
}

function isClosedOutcome(event: JournalEvent) {
  return event.reviewStatus === "closed" && Boolean(event.outcomeStatus) && event.outcomeStatus !== "pending";
}

function isDueOutcome(event: JournalEvent, now: Date) {
  if (!isPendingOutcome(event)) {
    return false;
  }

  const nowTime = now.getTime();
  const plannedReviewTime = journalTime(event.plannedReviewAt);
  const hasDueCheckpoint = (event.reviewCheckpoints ?? []).some((checkpoint) => (
    checkpoint.status !== "complete" &&
    journalTime(checkpoint.reviewAt) > 0 &&
    journalTime(checkpoint.reviewAt) <= nowTime
  ));

  return (plannedReviewTime > 0 && plannedReviewTime <= nowTime) || hasDueCheckpoint;
}

function latestClosedOutcomeAt(events: JournalEvent[]) {
  return events
    .filter(isClosedOutcome)
    .sort((left, right) => journalTime(right.createdAt) - journalTime(left.createdAt))[0]?.createdAt ?? null;
}

function isOutcomeExecutorRunEvent(event: JournalEvent): event is JournalEvent & {
  outcomeExecutorRun: OutcomeExecutorRunSummary;
} {
  return event.action === "outcome_executor_run" && Boolean(event.outcomeExecutorRun);
}

function summarizeRunFailures(summary: OutcomeExecutorRunSummary) {
  return summary.failures
    .slice(0, 5)
    .map((failure) => `${failure.symbol}:${failure.reason}`);
}

function latestOutcomeExecutorRun(events: JournalEvent[]): SystemHealthReport["outcomes"]["lastRun"] {
  const event = events
    .filter(isOutcomeExecutorRunEvent)
    .sort((left, right) => journalTime(right.createdAt) - journalTime(left.createdAt))[0];

  if (!event) {
    return null;
  }

  return {
    dueEvents: event.outcomeExecutorRun.dueEvents,
    failedFetches: event.outcomeExecutorRun.failedFetches,
    failureReasons: summarizeRunFailures(event.outcomeExecutorRun),
    fetchedCandles: event.outcomeExecutorRun.fetchedCandles,
    ranAt: event.createdAt,
    scannedEvents: event.outcomeExecutorRun.scannedEvents,
    skippedEvents: event.outcomeExecutorRun.skippedEvents,
    writtenEvents: event.outcomeExecutorRun.writtenEvents,
  };
}

function isTrendRadarReviewEvent(event: JournalEvent) {
  return event.action === "trend_radar_review" && Boolean(event.trendRadarReview);
}

function isTrendRadarReviewRunEvent(event: JournalEvent): event is JournalEvent & {
  trendRadarReviewRun: NonNullable<JournalEvent["trendRadarReviewRun"]>;
} {
  return event.action === "trend_radar_review_run" && Boolean(event.trendRadarReviewRun);
}

function summarizeTrendRadarRunFailures(summary: NonNullable<JournalEvent["trendRadarReviewRun"]>) {
  return summary.failures
    .slice(0, 5)
    .map((failure) => `${failure.symbol}:${failure.reason}`);
}

function latestTrendRadarReviewAt(events: JournalEvent[]) {
  return events
    .filter(isTrendRadarReviewEvent)
    .sort((left, right) => journalTime(right.createdAt) - journalTime(left.createdAt))[0]?.createdAt ?? null;
}

function latestTrendRadarReviewRun(events: JournalEvent[]): V3ForwardMapReviewHealthReport["lastRun"] {
  const event = events
    .filter(isTrendRadarReviewRunEvent)
    .sort((left, right) => journalTime(right.createdAt) - journalTime(left.createdAt))[0];

  if (!event) {
    return null;
  }

  return {
    failedFetches: event.trendRadarReviewRun.failedFetches,
    failureReasons: summarizeTrendRadarRunFailures(event.trendRadarReviewRun),
    fetchedCandles: event.trendRadarReviewRun.fetchedCandles,
    ranAt: event.createdAt,
    reviewedSnapshots: event.trendRadarReviewRun.reviewedSnapshots,
    scannedSnapshots: event.trendRadarReviewRun.scannedSnapshots,
    skippedReasons: event.trendRadarReviewRun.skippedReasons,
    skippedSnapshots: event.trendRadarReviewRun.skippedSnapshots,
    writtenEvents: event.trendRadarReviewRun.writtenEvents,
  };
}

function v3ForwardMapReviewOperatorHint({
  lastRun,
  savedSnapshots,
  storageStatus,
  status,
}: {
  lastRun: V3ForwardMapReviewHealthReport["lastRun"];
  savedSnapshots: number;
  storageStatus: V3ForwardMapReviewHealthReport["storageStatus"];
  status: V3ForwardMapReviewStatus;
}) {
  if (storageStatus === "unavailable") {
    return "v3 事前地图存储暂不可读，先运行数据库迁移，再判断 Forward Map 复盘覆盖。";
  }

  if (savedSnapshots === 0) {
    return "还没有可复盘的 v3 事前地图，先等待扫描归档保存 Forward Map 快照。";
  }

  if (!lastRun) {
    return "已有 v3 事前地图，等待受保护的 Forward Map 复盘执行器运行。";
  }

  if (lastRun.failedFetches > 0 || lastRun.failureReasons.length > 0) {
    return "v3 Forward Map 复盘最近有失败样本，先检查行情请求失败原因和跳过分布。";
  }

  if (lastRun.reviewedSnapshots === 0) {
    return "v3 Forward Map 复盘已执行，但还没有完成样本，继续等待后续 K 线或补跑。";
  }

  if (status === "covered") {
    return "v3 Forward Map 复盘已写回只读样本，可用于人工校准和漏判复盘，不自动改权重。";
  }

  return "v3 Forward Map 复盘正在收集结构样本，继续观察下一轮受保护执行。";
}

function v3ForwardMapReviewHealth({
  events,
  savedSnapshots,
  storageDetail,
  storageStatus,
}: {
  events: JournalEvent[];
  savedSnapshots: number;
  storageDetail: string;
  storageStatus: V3ForwardMapReviewHealthReport["storageStatus"];
}): V3ForwardMapReviewHealthReport {
  const lastRun = latestTrendRadarReviewRun(events);
  const status: V3ForwardMapReviewStatus = savedSnapshots === 0
    ? "idle"
    : !lastRun
      ? "waiting_run"
      : lastRun.failedFetches > 0 || lastRun.failureReasons.length > 0
        ? "attention"
        : lastRun.reviewedSnapshots > 0 || lastRun.writtenEvents > 0
          ? "covered"
          : "waiting_run";

  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    latestReviewAt: latestTrendRadarReviewAt(events),
    latestRunAt: lastRun?.ranAt ?? null,
    lastRun,
    mode: "v3_forward_map_review_health_mvp",
    operatorHint: v3ForwardMapReviewOperatorHint({
      lastRun,
      savedSnapshots,
      storageStatus,
      status,
    }),
    savedSnapshots,
    status,
    storageDetail,
    storageStatus,
  };
}

function v3StrategyLoopStatus({
  reviewSampleCount,
  reviewStatus,
  riskGateBlocked,
  totalSignals,
  v3Signals,
}: {
  reviewSampleCount: number;
  reviewStatus: string;
  riskGateBlocked: number;
  totalSignals: number;
  v3Signals: number;
}): V3StrategyLoopStatus {
  if (totalSignals === 0 || v3Signals === 0) {
    return "waiting_data";
  }

  if (riskGateBlocked >= v3Signals && v3Signals > 0) {
    return "blocked";
  }

  if (reviewStatus === "review_ready" || reviewSampleCount >= 5) {
    return "ready_for_manual_review";
  }

  return "collecting";
}

function v3StrategyLoopOperatorHint(status: V3StrategyLoopStatus) {
  if (status === "waiting_data") {
    return "当前扫描还缺少 v3 结构地图，先等待 OHLCV 和 Forward Map 样本进入扫描归档。";
  }

  if (status === "blocked") {
    return "当前 v3 信号主要被 Risk Gate 或结构冲突阻断，只能观察或等待回踩/反抽确认。";
  }

  if (status === "ready_for_manual_review") {
    return "v3 实战闭环已有可复核样本，可以人工查看形态/计划统计，但不能自动改权重。";
  }

  return "v3 实战闭环正在收集 live 地图、计划草案和复盘样本。";
}

function v3StrategyLoopReport(snapshot: MarketRadarSnapshot, events: JournalEvent[]): V3StrategyLoopReport {
  const v3Signals = snapshot.signals.filter((signal) => signal.strategyV3);
  const reviewStats = buildV3PatternReviewStats(events);
  const live = v3Signals.reduce<V3StrategyLoopReport["live"]>((current, signal) => {
    const strategyV3 = signal.strategyV3;

    if (!strategyV3) {
      return current;
    }

    current.keyLevels += strategyV3.keyLevels.length;
    current.forwardLevels += strategyV3.forwardLevels.length;

    if (strategyV3.tradePlan?.isPlanEligible) {
      current.readyPlans += 1;
    } else if (strategyV3.tradePlan) {
      current.blockedPlans += 1;
    }

    if (strategyV3.trendContext?.riskGate.allowed === false) {
      current.riskGateBlocked += 1;
    }

    if (strategyV3.trendContext?.state === "CONFLICT" || (strategyV3.trendContext?.conflicts.length ?? 0) > 0) {
      current.conflictSignals += 1;
    }

    return current;
  }, {
    blockedPlans: 0,
    conflictSignals: 0,
    forwardLevels: 0,
    keyLevels: 0,
    missingV3Signals: Math.max(0, snapshot.signals.length - v3Signals.length),
    readyPlans: 0,
    riskGateBlocked: 0,
    totalSignals: snapshot.signals.length,
    v3Signals: v3Signals.length,
  });
  const status = v3StrategyLoopStatus({
    reviewSampleCount: reviewStats.sampleCount,
    reviewStatus: reviewStats.status,
    riskGateBlocked: live.riskGateBlocked,
    totalSignals: live.totalSignals,
    v3Signals: live.v3Signals,
  });

  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    candidates: v3Signals.slice(0, 5).map((signal) => ({
      decision: signal.strategyV3?.trendContext?.decision ?? "WATCH_ONLY",
      nextStep: signal.strategyV3?.trendContext?.nextStep ?? signal.strategyV3?.summary ?? "等待 v3 上下文补齐。",
      planStatus: signal.strategyV3?.tradePlan?.status ?? "WATCH_ONLY",
      rewardRisk: signal.strategyV3?.tradePlan?.rewardRisk ?? null,
      riskGateAllowed: signal.strategyV3?.trendContext?.riskGate.allowed ?? false,
      state: signal.strategyV3?.trendContext?.state ?? "RANGE_IDLE",
      symbol: signal.symbol,
    })),
    guardrail: "v3 实战闭环只读聚合 live 信号、Forward Map 和复盘样本；不能自动下单、不能自动改权重、不能改变实时排序。",
    live,
    mode: "v3_strategy_loop_mvp",
    operatorHint: v3StrategyLoopOperatorHint(status),
    review: {
      closedSamples: reviewStats.closedSamples,
      patternStatus: reviewStats.status,
      pendingSamples: reviewStats.pendingSamples,
      sampleCount: reviewStats.sampleCount,
      topPatternLabel: reviewStats.topPattern?.label ?? null,
      topTradePlanLabel: reviewStats.tradePlanBuckets[0]?.label ?? null,
    },
    status,
  };
}

async function readV3ForwardMapSnapshotsSafely(repository: PersistenceRepository) {
  try {
    const snapshots = await repository.listV3ForwardMapSnapshots(240);

    return {
      snapshots,
      storageDetail: "v3_forward_map_snapshots storage is readable.",
      storageStatus: "ready" as const,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      snapshots: [],
      storageDetail: `v3_forward_map_snapshots storage unavailable: ${message}`,
      storageStatus: "unavailable" as const,
    };
  }
}

function outcomeSampleQuality(outcomeEvents: JournalEvent[]): SystemHealthReport["outcomes"]["sampleQuality"] {
  const pendingEvents = outcomeEvents.filter(isPendingOutcome).length;
  const validatedEvents = outcomeEvents.filter((event) =>
    event.outcomeStatus === "partial_win" || event.outcomeStatus === "saved"
  ).length;
  const failedEvents = outcomeEvents.filter((event) => event.outcomeStatus === "loss").length;
  const expiredEvents = outcomeEvents.filter((event) => event.outcomeStatus === "expired").length;
  const closedEvents = validatedEvents + failedEvents + expiredEvents;
  const counterEvidenceEvents = failedEvents + expiredEvents;
  const manualReviewReady = closedEvents >= 12 && validatedEvents >= counterEvidenceEvents;
  const status: OutcomeSampleQualityStatus = closedEvents + pendingEvents === 0
    ? "empty"
    : closedEvents >= 5 && counterEvidenceEvents > validatedEvents
      ? "counterevidence_watch"
      : manualReviewReady
        ? "manual_review_ready"
        : "collecting";

  return {
    autoWeightEligible: false,
    expiredEvents,
    failedEvents,
    manualReviewReady,
    pendingEvents,
    status,
    validatedEvents,
  };
}

function outcomeOperatorHint(status: OutcomeExecutorStatus, lastRun: SystemHealthReport["outcomes"]["lastRun"]) {
  if (lastRun && (lastRun.failedFetches > 0 || lastRun.failureReasons.length > 0)) {
    return "自动复盘最近有失败样本，先看失败原因，再决定是否补跑或等待下一轮。";
  }

  if (status === "idle") {
    return "还没有自动复盘样本，等待信号进入跟踪队列。";
  }

  if (status === "reviewing") {
    return "自动复盘有到期样本，等待 outcome executor 写回结果。";
  }

  if (status === "collecting") {
    return "自动复盘正在收集样本，未到复查窗口前不强行判断。";
  }

  return "自动复盘样本已覆盖，继续累积结果后再进入人工校准。";
}

function outcomeExecutorHealth(
  events: JournalEvent[],
  now: Date,
  env: Record<string, string | undefined>,
): SystemHealthReport["outcomes"] {
  const outcomeEvents = events.filter(isSignalOutcomeEvent);
  const pendingEvents = outcomeEvents.filter(isPendingOutcome);
  const closedEvents = outcomeEvents.filter(isClosedOutcome);
  const dueEvents = pendingEvents.filter((event) => isDueOutcome(event, now));
  const trackingEvents = pendingEvents.length + closedEvents.length;
  const lastRun = latestOutcomeExecutorRun(events);
  const status: OutcomeExecutorStatus = trackingEvents === 0
    ? "idle"
    : dueEvents.length > 0
      ? "reviewing"
      : pendingEvents.length > 0
        ? "collecting"
        : "covered";
  const strategyWeightCalibration = buildStrategyWeightCalibrationReport(events);
  const strategyWeightChangeAudit = buildStrategyWeightChangeAuditReport(strategyWeightCalibration);
  const strategyWeightChangeExecution = buildStrategyWeightChangeExecutionReport(strategyWeightChangeAudit, events);
  const strategyWeightShadow = buildStrategyWeightShadowReport(events);
  const strategyWeightShadowEvaluation = buildStrategyWeightShadowEvaluationReport({
    events,
    shadowReport: strategyWeightShadow,
  });

  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    closedEvents: closedEvents.length,
    coveragePercent: trackingEvents > 0 ? Math.round((closedEvents.length / trackingEvents) * 100) : 0,
    dueEvents: dueEvents.length,
    latestRunAt: lastRun?.ranAt ?? null,
    latestOutcomeAt: latestClosedOutcomeAt(outcomeEvents),
    lastRun,
    calibrationAdmission: buildOutcomeCalibrationAdmission(outcomeEvents),
    calibrationFlow: buildOutcomeCalibrationFlow(events),
    mode: "outcome_executor_mvp",
    operatorHint: outcomeOperatorHint(status, lastRun),
    pendingEvents: pendingEvents.length,
    sampleQuality: outcomeSampleQuality(outcomeEvents),
    status,
    strategyWeightChangeAudit,
    strategyWeightChangeExecution,
    strategyWeightActivationGate: buildStrategyWeightActivationGate({
      activationMode: env.STRATEGY_WEIGHT_ACTIVATION_MODE,
      executionReport: strategyWeightChangeExecution,
      shadowEvaluationReport: strategyWeightShadowEvaluation,
      shadowReport: strategyWeightShadow,
    }),
    strategyWeightCalibration,
    strategyWeightShadow,
    strategyWeightShadowEvaluation,
    trackingEvents,
  };
}

export async function buildSystemHealthReport({
  database,
  env = {},
  now = new Date(),
  repository,
  snapshot,
}: BuildSystemHealthReportOptions): Promise<SystemHealthReport> {
  const configuredProvider = requestedProvider(env);
  const metadata = snapshot.metadata;
  const coverage = metadata.coverage ?? fallbackCoverage(metadata);
  const scanEconomy = buildScanEconomyReport(metadata, coverage);
  const fullMarketCoverage = fullMarketCoverageReport(metadata, coverage, scanEconomy);
  const marketDataQuality = marketDataQualityReport(snapshot);
  const age = ageMinutes(metadata.generatedAt, now);
  const freshness = scanFreshness({ age, metadata });
  const providerStatus = sourceStatus({
    activeSource: metadata.source,
    configuredProvider,
    env,
  });
  const [archiveSummaries, journalEvents, v3ForwardMapSnapshotRead] = await Promise.all([
    repository.listScanArchives(24),
    repository.listJournalEvents(120),
    readV3ForwardMapSnapshotsSafely(repository),
  ]);
  const archiveEntries = archiveSummaries.length;
  const durable = repository.mode === "database";
  const databaseDiagnostics = database ?? fallbackDatabaseDiagnostics({ durable, repository });
  const sourceLevel: SystemHealthLevel = providerStatus === "missing_key" ||
      providerStatus === "fallback"
    ? "degraded"
    : providerStatus === "preview"
      ? "preview"
      : "ready";
  const persistenceLevel: SystemHealthLevel = durable ? "ready" : "preview";
  const freshnessLevel: SystemHealthLevel = metadata.status === "failed"
    ? "blocked"
    : freshness === "expired" || freshness === "unknown"
      ? "degraded"
      : freshness === "aging"
        ? "degraded"
        : "ready";
  const archiveLevel: SystemHealthLevel = archiveEntries > 0 ? persistenceLevel : "degraded";
  const level = strongestLevel([sourceLevel, persistenceLevel, freshnessLevel, archiveLevel]);

  return {
    generatedAt: now.toISOString(),
    level,
    summary: overallSummary(level),
    dataSource: {
      activeSource: metadata.source,
      configuredProvider,
      detail: sourceDetail(providerStatus, metadata.source),
      isRealtime: metadata.isRealtime,
      mode: metadata.source === "mock" ? "demo" : "live",
      status: providerStatus,
    },
    persistence: {
      databaseDriver: databaseDiagnostics.driver,
      databaseReason: databaseDiagnostics.reason,
      databaseStatus: databaseDiagnostics.status,
      detail: databaseDiagnostics.detail,
      durable,
      mode: repository.mode,
      scope: repository.scope,
    },
    scan: {
      ageMinutes: age,
      anomalyCount: metadata.anomalyCount,
      cadenceMinutes: metadata.cadenceMinutes,
      candidateCount: metadata.candidateCount,
      freshness,
      generatedAt: metadata.generatedAt,
      nextScanAt: metadata.nextScanAt,
      riskGate: metadata.riskGate,
      scannedCount: metadata.scannedCount,
      status: metadata.status,
      staleAfterMinutes: metadata.staleAfterMinutes,
    },
    archive: {
      entries: archiveEntries,
      retentionMode: repository.mode,
    },
    coverage,
    fullMarketCoverage,
    marketDataQuality,
    scanEconomy,
    operations: scanOperations({
      archiveSummaries,
      freshness,
      metadata,
      now,
    }),
    outcomes: outcomeExecutorHealth(journalEvents, now, env),
    v3ForwardMapReviews: v3ForwardMapReviewHealth({
      events: journalEvents,
      savedSnapshots: v3ForwardMapSnapshotRead.snapshots.length,
      storageDetail: v3ForwardMapSnapshotRead.storageDetail,
      storageStatus: v3ForwardMapSnapshotRead.storageStatus,
    }),
    v3StrategyLoop: v3StrategyLoopReport(snapshot, journalEvents),
    guards: [
      {
        id: "data-source",
        label: "数据源",
        state: sourceLevel,
        detail: sourceDetail(providerStatus, metadata.source),
      },
      {
        id: "persistence",
        label: "持久化",
        state: persistenceLevel,
        detail: databaseDiagnostics.detail,
      },
      {
        id: "freshness",
        label: "新鲜度",
        state: freshnessLevel,
        detail: age === null
          ? "扫描时间无法解析。"
          : `距离上次扫描约 ${age} 分钟，过期阈值 ${metadata.staleAfterMinutes} 分钟。`,
      },
      {
        id: "archive",
        label: "归档",
        state: archiveLevel,
        detail: archiveEntries > 0
          ? `已记录 ${archiveEntries} 个扫描回放帧。`
          : "还没有扫描回放帧。",
      },
    ],
  };
}
