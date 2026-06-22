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
import {
  readWorkerHeartbeatReport,
  type RuntimeProbeReport,
} from "../runtime/worker-heartbeat";
import {
  readConfiguredApiObservabilityReport,
  type ApiUsageReport,
  type DataSourceLatencyReport,
} from "../runtime/api-observability";
import {
  evaluateStrategyV3Readiness,
  type StrategyV3ReadinessBucket,
} from "../analysis/v3/readiness";
import {
  buildDataSourceCapabilityPlan,
  type DataSourceCapabilityPlan,
} from "../market/data-source-capabilities";
import type { MacroMarketSnapshot } from "../market/macro-snapshot";
import {
  buildFallbackScanStatePoolReport,
} from "../market/scan-state-pool";
import type {
  MarketDataSource,
  MarketDataStatus,
  MarketRadarSnapshot,
  ScanCoverage,
  ScanArchiveSummary,
  ScanDynamicPriorityPlan,
  ScanPriorityReason,
  ScanRotationAudit,
  ScanStatePoolReport,
  ScanTierCounts,
  ScanTierKey,
  VenueCoverageQuality,
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

export type MacroMarketHealthStatus =
  | "empty"
  | "ready"
  | "stale"
  | "unavailable";

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
  | "fallback"
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

export type FullMarketHighPriorityReason = {
  count: number;
  id: ScanPriorityReason;
  label: string;
};

export type FullMarketHighPriorityReport = {
  candidateCount: number;
  enabled: boolean;
  operatorHint: string;
  queuedAssets: string[];
  reasonCounts: FullMarketHighPriorityReason[];
  selectedAssets: string[];
  slotsAvailable: number;
  slotsUsed: number;
  rotatingSelectedAssets: string[];
};

export type FullMarketExchangeDrilldownRow = {
  action: string;
  count: number;
  id: VenueCoverageQuality;
  label: string;
  operatorHint: string;
  percent: number;
  samples: string[];
};

export type FullMarketExchangeDrilldownReport = {
  guardrail: string;
  nextActions: string[];
  rows: FullMarketExchangeDrilldownRow[];
  unsupported: {
    count: number;
    operatorHint: string;
    samples: string[];
  };
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
  exchangeDrilldown: FullMarketExchangeDrilldownReport;
  guardrails: string[];
  highPriority: FullMarketHighPriorityReport;
  lanes: FullMarketCoverageLane[];
  mode: "full_market_coverage_depth_mvp";
  operatorHint: string;
  priorityExplanation: string;
  rotationAudit: ScanRotationAudit | null;
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

export type MarketDataRejectedRowSample = {
  exchangeName: string;
  reason: string;
  symbol: string;
};

export type MarketDataAggregationSample = {
  discardedExchanges: string[];
  reason: string;
  selectedExchange: string;
  symbol: string;
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
  primarySelection: {
    duplicateGroups: number;
    operatorHint: string;
    rule: string;
    samples: MarketDataAggregationSample[];
  };
  qualityScore: number;
  rejectedSamples: string[];
  rejectedRowSamples: MarketDataRejectedRowSample[];
  status: MarketDataQualityStatus;
};

export type MacroMarketHealthReport = {
  ageMinutes: number | null;
  allowedUse: "macro_context_only";
  btcDominancePercent: number | null;
  canCreateTradeSignal: false;
  fetchedAt: string | null;
  guardrail: string;
  operatorHint: string;
  snapshotCount: number;
  source: MacroMarketSnapshot["source"] | null;
  status: MacroMarketHealthStatus;
  total2MarketCapUsd: number | null;
  total3MarketCapUsd: number | null;
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
  readinessBucket: StrategyV3ReadinessBucket;
  readinessLabel: string;
  readinessScore: number;
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
  readinessBuckets: Array<{
    bucket: StrategyV3ReadinessBucket;
    count: number;
    label: string;
    samples: string[];
  }>;
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

export type StrategyEvolutionLoopStatus =
  | "activation_disabled"
  | "blocked"
  | "collecting_samples"
  | "manual_review_ready"
  | "shadow_observation";

export type StrategyEvolutionLoopStageStatus =
  | "blocked"
  | "collecting"
  | "disabled"
  | "ready"
  | "watch";

export type StrategyEvolutionLoopStage = {
  count: number;
  detail: string;
  id:
    | "activation_gate"
    | "manual_audit"
    | "manual_execution"
    | "outcome_samples"
    | "shadow_weights"
    | "v3_live";
  label: string;
  status: StrategyEvolutionLoopStageStatus;
};

export type StrategyEvolutionLoopReport = {
  allowedUse: "research_only";
  blockers: string[];
  canAutoAdjustWeights: false;
  canMutateLiveRanking: false;
  canWriteRuleWeights: false;
  guardrail: string;
  mode: "strategy_evolution_loop_mvp";
  nextActions: string[];
  operatorHint: string;
  readinessScore: number;
  stages: StrategyEvolutionLoopStage[];
  status: StrategyEvolutionLoopStatus;
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
  dataSourceCapabilities: DataSourceCapabilityPlan;
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
    detail: string;
    entries: number;
    retentionMode: PersistenceMode;
    status: "ready" | "unavailable";
  };
  coverage: ScanCoverage;
  lightScan: MarketRadarSnapshot["metadata"]["lightScan"] | null;
  signalMaturity?: MarketRadarSnapshot["metadata"]["signalMaturity"] | null;
  scanDiagnostics: MarketRadarSnapshot["metadata"]["diagnostics"] | null;
  fullMarketCoverage: FullMarketCoverageReport;
  marketDataQuality: MarketDataQualityReport;
  macroMarket: MacroMarketHealthReport;
  scanStatePool: ScanStatePoolReport;
  scanEconomy: ScanEconomyReport;
  apiUsage: ApiUsageReport;
  dataSourceLatency: DataSourceLatencyReport;
  runtimeProbes: RuntimeProbeReport;
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
    runtimeTrigger: NonNullable<MarketRadarSnapshot["metadata"]["runtime"]>["trigger"] | "unknown";
    runtimeCacheStatus: NonNullable<MarketRadarSnapshot["metadata"]["runtime"]>["cacheStatus"] | "unknown";
    persistedArchive: boolean;
    repositoryMode: NonNullable<MarketRadarSnapshot["metadata"]["runtime"]>["repositoryMode"] | "unknown";
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
  strategyEvolutionLoop: StrategyEvolutionLoopReport;
  v3StrategyLoop: V3StrategyLoopReport;
  guards: SystemHealthGuard[];
};

export type BuildSystemHealthReportOptions = {
  database?: DatabaseClientDiagnostics;
  env?: Record<string, string | undefined>;
  now?: Date;
  repository: PersistenceRepository;
  runtimeProbes?: RuntimeProbeReport;
  snapshot: MarketRadarSnapshot;
};

type RepositoryReadResult<T> = {
  detail: string;
  items: T[];
  status: "ready" | "unavailable";
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

function repositoryReadErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function readRepositoryListSafely<T>(
  label: string,
  read: () => Promise<T[]>,
): Promise<RepositoryReadResult<T>> {
  try {
    return {
      detail: `${label} storage is readable.`,
      items: await read(),
      status: "ready",
    };
  } catch (error) {
    return {
      detail: `${label} storage unavailable: ${repositoryReadErrorMessage(error)}`,
      items: [],
      status: "unavailable",
    };
  }
}

function repositoryReadIssueDetail(reads: RepositoryReadResult<unknown>[]) {
  const unavailable = reads.filter((read) => read.status === "unavailable");

  if (unavailable.length === 0) {
    return null;
  }

  return unavailable.map((read) => read.detail).join(" ");
}

const macroMarketGuardrail =
  "BTC.D/TOTAL2/TOTAL3 只能作为山寨大盘环境锚点，不能直接生成交易方向，不能降低 3:1 最低盈亏比。";

function buildMacroMarketHealthReport(
  read: RepositoryReadResult<MacroMarketSnapshot>,
  now: Date,
): MacroMarketHealthReport {
  if (read.status === "unavailable") {
    return {
      ageMinutes: null,
      allowedUse: "macro_context_only",
      btcDominancePercent: null,
      canCreateTradeSignal: false,
      fetchedAt: null,
      guardrail: macroMarketGuardrail,
      operatorHint: "宏观环境快照读取失败；扫描和交易计划仍按现有证据链运行，但缺少 BTC.D/TOTAL2/TOTAL3 顺逆风参考。",
      snapshotCount: 0,
      source: null,
      status: "unavailable",
      total2MarketCapUsd: null,
      total3MarketCapUsd: null,
    };
  }

  const snapshots = [...read.items].sort((left, right) =>
    new Date(right.fetchedAt).getTime() - new Date(left.fetchedAt).getTime()
  );
  const latest = snapshots[0];

  if (!latest) {
    return {
      ageMinutes: null,
      allowedUse: "macro_context_only",
      btcDominancePercent: null,
      canCreateTradeSignal: false,
      fetchedAt: null,
      guardrail: macroMarketGuardrail,
      operatorHint: "还没有宏观环境快照；建议运行 /api/admin/macro/ingest，让 BTC.D/TOTAL2/TOTAL3 成为山寨扫描的环境参考。",
      snapshotCount: 0,
      source: null,
      status: "empty",
      total2MarketCapUsd: null,
      total3MarketCapUsd: null,
    };
  }

  const age = ageMinutes(latest.fetchedAt, now);
  const status = age !== null && age <= 180 ? "ready" : "stale";

  return {
    ageMinutes: age,
    allowedUse: "macro_context_only",
    btcDominancePercent: latest.btcDominancePercent,
    canCreateTradeSignal: false,
    fetchedAt: latest.fetchedAt,
    guardrail: latest.guardrail || macroMarketGuardrail,
    operatorHint: status === "ready"
      ? "宏观环境快照已写入，可用于山寨大盘顺逆风判断；它不能单独生成交易方向。"
      : "宏观环境快照已过期，建议触发 macro ingest；过期数据只能作为弱参考。",
    snapshotCount: snapshots.length,
    source: latest.source,
    status,
    total2MarketCapUsd: latest.total2MarketCapUsd,
    total3MarketCapUsd: latest.total3MarketCapUsd,
  };
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

  if (metadata.notes.some((note) => note.includes("fallback seed activated"))) {
    return "fallback";
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

  if (status === "fallback") {
    return "交易所实时币池发现降级，当前启用广谱兜底池轮转；候选仍需 CoinGlass 数据和风控门确认。";
  }

  if (status === "complete") {
    return "当前可见合约币池已完成本轮覆盖，后续继续按节奏刷新并复用归档。";
  }

  return `全市场覆盖正在轮转，还有 ${coverage.pending} 个标的等待后续批次。`;
}

function fullMarketPriorityExplanation(coverage: ScanCoverage) {
  const tierPolicy = coverage.tierPolicy;
  const dynamicPriority = coverage.dynamicPriority;

  if (!tierPolicy) {
    return "候选池优先级来自锚定币、配置白名单、流动性、交易所覆盖和近期信号；当前缺少层级策略元数据。";
  }

  const explanation = [
    "候选池优先级来自锚定币、配置白名单、流动性、交易所覆盖和近期信号。",
    `热门资产约每 ${tierPolicy.activeEveryWindows} 个扫描窗口轮到一次，长尾资产约每 ${tierPolicy.longTailEveryWindows} 个窗口低频巡检。`,
    "只有进入候选或关键观察状态的标的才进入后续深度分析。",
  ];

  if (dynamicPriority?.enabled) {
    explanation.push(
      `本轮高优先级槽位 ${dynamicPriority.slotsUsed}/${dynamicPriority.slotsAvailable}，候选池 ${dynamicPriority.candidateCount} 个标的；未选中的高优先级标的保留到后续批次，不额外打 API。`,
    );
  }

  return explanation.join(" ");
}

const highPriorityReasonLabels: Record<ScanPriorityReason, string> = {
  anomaly: "异动",
  cooldown_review: "冷却复盘",
  history: "复盘",
  liquidity: "流动性",
  missed_opportunity: "漏判复查",
  recent_deep_scan: "近期已深扫",
  recent_signal: "近期信号",
  rotation_age: "轮转等待过久",
  venue_coverage: "交易所覆盖",
};

function fullMarketHighPriorityOperatorHint(
  dynamicPriority?: ScanDynamicPriorityPlan,
) {
  if (!dynamicPriority?.enabled) {
    return "当前没有可用的高优先级提示，按层级轮转扫描。";
  }

  if (dynamicPriority.slotsAvailable === 0) {
    return "本轮没有非锚定槽位，高优先级候选等待后续批次。";
  }

  if (dynamicPriority.slotsUsed === 0) {
    return "本轮有高优先级候选，但未占用槽位，优先检查候选是否已被轮转覆盖。";
  }

  if (dynamicPriority.slotsUsed < dynamicPriority.slotsAvailable) {
    return "高优先级槽位未满，说明可用候选有限或已被轮转覆盖。";
  }

  return "高优先级槽位已用满，剩余候选等待后续批次。";
}

function fullMarketHighPriorityReport(
  dynamicPriority?: ScanDynamicPriorityPlan,
): FullMarketHighPriorityReport {
  const selectedAssets = dynamicPriority?.candidates
    .filter((candidate) => candidate.status === "selected")
    .map((candidate) => candidate.baseAsset)
    .slice(0, 8) ?? [];
  const queuedAssets = dynamicPriority?.candidates
    .filter((candidate) => candidate.status === "queued")
    .map((candidate) => candidate.baseAsset)
    .slice(0, 8) ?? [];
  const rotatingSelectedAssets = dynamicPriority?.candidates
    .filter((candidate) => candidate.status === "already_selected")
    .map((candidate) => candidate.baseAsset)
    .slice(0, 8) ?? [];
  const reasonCounts = Object.entries(dynamicPriority?.reasonCounts ?? {})
    .map(([id, count]) => ({
      count,
      id: id as ScanPriorityReason,
      label: highPriorityReasonLabels[id as ScanPriorityReason] ?? id,
    }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-CN"))
    .slice(0, 5);

  return {
    candidateCount: dynamicPriority?.candidateCount ?? 0,
    enabled: dynamicPriority?.enabled ?? false,
    operatorHint: fullMarketHighPriorityOperatorHint(dynamicPriority),
    queuedAssets,
    reasonCounts,
    selectedAssets,
    slotsAvailable: dynamicPriority?.slotsAvailable ?? 0,
    slotsUsed: dynamicPriority?.slotsUsed ?? 0,
    rotatingSelectedAssets,
  };
}

const exchangeDrilldownLabels: Record<VenueCoverageQuality, string> = {
  major_three: "三所共振",
  multi_exchange: "多所覆盖",
  single_exchange: "单所观察",
  unlisted: "发现缺口",
};

const exchangeDrilldownHints: Record<VenueCoverageQuality, string> = {
  major_three: "Binance/OKX/Bybit 同时覆盖，适合优先进入候选深挖。",
  multi_exchange: "多所覆盖但不是三所齐全，信号可用但仍需留意交易所差异。",
  single_exchange: "只有单所覆盖，信号需要更严格的流动性、OI 和波动验证。",
  unlisted: "未在主要发现源确认，不能包装成可靠全市场覆盖。",
};

const exchangeDrilldownActions: Record<VenueCoverageQuality, string> = {
  major_three: "优先承接深度分析候选。",
  multi_exchange: "保留轮转，等待更多交易所确认。",
  single_exchange: "降权观察，避免单所噪音直接触发。",
  unlisted: "确认发现源、报价和合约状态后再纳入。",
};

const exchangeDrilldownOrder: VenueCoverageQuality[] = [
  "major_three",
  "multi_exchange",
  "single_exchange",
  "unlisted",
];

function exchangeCoverageSampleLabel(
  item: NonNullable<ScanCoverage["exchangeCoverage"]>[number],
) {
  const exchanges = item.exchanges.length > 0 ? item.exchanges.join("/") : "未发现";

  return `${item.baseAsset} ${exchanges}`;
}

function buildExchangeDrilldownRows(
  coverage: ScanCoverage,
  eligible: number,
): FullMarketExchangeDrilldownRow[] {
  const exchangeCoverage = coverage.exchangeCoverage ?? [];

  return exchangeDrilldownOrder.map((id) => {
    const items = exchangeCoverage.filter((item) => item.venueCoverage === id);
    const summaryKey = id === "major_three"
      ? "majorThree"
      : id === "multi_exchange"
        ? "multiExchange"
        : id === "single_exchange"
          ? "singleExchange"
          : "unlisted";
    const count = items.length > 0
      ? items.length
      : coverage.exchangeCoverageSummary?.[summaryKey] ?? 0;

    return {
      action: exchangeDrilldownActions[id],
      count,
      id,
      label: exchangeDrilldownLabels[id],
      operatorHint: exchangeDrilldownHints[id],
      percent: eligible > 0 ? Math.round((count / eligible) * 100) : 0,
      samples: items.slice(0, 5).map(exchangeCoverageSampleLabel),
    };
  });
}

function fullMarketExchangeDrilldownReport(
  coverage: ScanCoverage,
  eligible: number,
): FullMarketExchangeDrilldownReport {
  const rows = buildExchangeDrilldownRows(coverage, eligible);
  const singleOrUnlisted = rows
    .filter((row) => row.id === "single_exchange" || row.id === "unlisted")
    .reduce((sum, row) => sum + row.count, 0);
  const majorThree = rows.find((row) => row.id === "major_three")?.count ?? 0;
  const rejectedSamples = coverage.skippedAssets
    .slice(0, 6)
    .map((asset) => `${asset.symbol}:${asset.reason}`);
  const nextActions = [
    singleOrUnlisted > 0
      ? `先复核 ${singleOrUnlisted} 个单所/发现缺口标的，避免低质量数据进入深挖。`
      : "当前没有单所或发现缺口标的，保持现有轮转。",
    majorThree > 0
      ? `三所共振标的 ${majorThree} 个，可优先进入候选深度分析。`
      : "三所共振覆盖不足，先检查 discovery source 和配置白名单。",
    "交易所覆盖钻取只读扫描 metadata，不会触发额外请求。",
  ];

  return {
    guardrail: "交易所覆盖钻取只读取本轮 coverage metadata；覆盖质量只能影响观察优先级，不能单独生成交易方向。",
    nextActions,
    rows,
    unsupported: {
      count: coverage.skipped,
      operatorHint: coverage.skipped > 0
        ? "过滤标的来自停牌、非 USDT、非永续或流动性不足，必须留在分析外层。"
        : "当前没有过滤样本，继续保持质量门槛。",
      samples: rejectedSamples,
    },
  };
}

function fullMarketLaneRows(scanEconomy: ScanEconomyReport): FullMarketCoverageLane[] {
  return [
    {
      cadenceHint: "每轮优先保留",
      id: "anchor",
      label: "锚定大盘",
      pending: scanEconomy.tiers.anchor.pending,
      priorityHint: "BTC/ETH 每轮固定占用锚点请求，用于大盘天气；剩余深扫槽位轮转山寨。",
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
    exchangeDrilldown: fullMarketExchangeDrilldownReport(coverage, eligible),
    guardrails: [
      "全市场扫描采用轻扫描轮转，深度分析只给候选池和关键观察标的。",
      "前端覆盖报告只读取本轮 metadata，不会触发额外 CoinGlass 请求。",
      "覆盖率不是胜率，未扫标的只代表等待轮转，不代表没有机会。",
    ],
    highPriority: fullMarketHighPriorityReport(coverage.dynamicPriority),
    lanes: fullMarketLaneRows(scanEconomy),
    mode: "full_market_coverage_depth_mvp",
    operatorHint: fullMarketOperatorHint(status, coverage),
    priorityExplanation: fullMarketPriorityExplanation(coverage),
    rotationAudit: coverage.rotationAudit ?? null,
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

function parseQualityRejectedSamples(notes: string[]): MarketDataRejectedRowSample[] {
  const note = metadataNote(notes, "quality rejected samples:");
  const payload = note?.replace(/^quality rejected samples:\s*/u, "").trim();

  if (!payload || payload === "none") {
    return [];
  }

  return payload
    .split(";")
    .map((item) => item.trim())
    .map((item) => {
      const match = item.match(/^(.+?):([A-Z0-9]+):([a-z_]+)$/u);

      if (!match) {
        return null;
      }

      return {
        exchangeName: match[1],
        reason: match[3],
        symbol: match[2],
      };
    })
    .filter((item): item is MarketDataRejectedRowSample => item !== null)
    .slice(0, 8);
}

function parseQualityAggregationSummary(notes: string[]) {
  const note = metadataNote(notes, "quality aggregation summary:");
  const match = note?.match(/duplicate_groups\s+(\d+),\s+rule\s+([a-z_]+)/u);

  return {
    duplicateGroups: match ? Number(match[1]) : 0,
    rule: match?.[2] ?? "exchange_priority_then_volume_oi",
  };
}

function parseQualityAggregationSamples(notes: string[]): MarketDataAggregationSample[] {
  const note = metadataNote(notes, "quality aggregation:");
  const payload = note?.replace(/^quality aggregation:\s*/u, "").trim();

  if (!payload || payload === "none") {
    return [];
  }

  return payload
    .split(";")
    .map((item) => item.trim())
    .map((item) => {
      const match = item.match(/^([A-Z0-9]+)\s+selected\s+([A-Z_]+)\s+over\s+([A-Z_/]+|none)\s+by\s+([a-z_]+)$/u);

      if (!match) {
        return null;
      }

      return {
        discardedExchanges: match[3] === "none" ? [] : match[3].split("/"),
        reason: match[4],
        selectedExchange: match[2],
        symbol: match[1],
      };
    })
    .filter((item): item is MarketDataAggregationSample => item !== null)
    .slice(0, 8);
}

function primarySelectionOperatorHint({
  duplicateGroups,
  samples,
}: {
  duplicateGroups: number;
  samples: MarketDataAggregationSample[];
}) {
  if (duplicateGroups === 0) {
    return "本轮没有重复交易所行，主信号无需聚合。";
  }

  if (samples.length === 0) {
    return `${duplicateGroups} 个重复币种已聚合，但缺少可展示样本，保留观察。`;
  }

  return `${duplicateGroups} 个重复币种已按交易所优先级、成交量和 OI 聚合为主信号。`;
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
  const rejectedRowSamples = parseQualityRejectedSamples(snapshot.metadata.notes);
  const aggregationSummary = parseQualityAggregationSummary(snapshot.metadata.notes);
  const aggregationSamples = parseQualityAggregationSamples(snapshot.metadata.notes);
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
    primarySelection: {
      duplicateGroups: aggregationSummary.duplicateGroups,
      operatorHint: primarySelectionOperatorHint({
        duplicateGroups: aggregationSummary.duplicateGroups,
        samples: aggregationSamples,
      }),
      rule: aggregationSummary.rule,
      samples: aggregationSamples,
    },
    qualityScore,
    rejectedSamples: snapshot.instrumentPool.rejected
      .slice(0, 6)
      .map((item) => `${item.instrument.symbol}:${item.reason}`),
    rejectedRowSamples,
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
    persistedArchive: metadata.runtime?.persistedArchive ?? false,
    recentProblemCount,
    recentSuccessCount,
    requestDetail,
    repositoryMode: metadata.runtime?.repositoryMode ?? "unknown",
    runtimeCacheStatus: metadata.runtime?.cacheStatus ?? "unknown",
    runtimeDetail,
    runtimeTrigger: metadata.runtime?.trigger ?? "unknown",
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
  const readinessReports = v3Signals.map((signal) => ({
    report: evaluateStrategyV3Readiness(signal),
    signal,
  }));
  const readinessBuckets = readinessReports.reduce<V3StrategyLoopReport["readinessBuckets"]>((current, item) => {
    const existing = current.find((bucket) => bucket.bucket === item.report.bucket);

    if (existing) {
      existing.count += 1;
      existing.samples = [...existing.samples, item.signal.symbol].slice(0, 5);
      return current;
    }

    return [
      ...current,
      {
        bucket: item.report.bucket,
        count: 1,
        label: item.report.label,
        samples: [item.signal.symbol],
      },
    ];
  }, []).sort((first, second) => second.count - first.count || first.label.localeCompare(second.label));
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
    candidates: readinessReports.slice(0, 5).map(({ report, signal }) => ({
      decision: signal.strategyV3?.trendContext?.decision ?? "WATCH_ONLY",
      nextStep: report.nextStep,
      planStatus: signal.strategyV3?.tradePlan?.status ?? "WATCH_ONLY",
      readinessBucket: report.bucket,
      readinessLabel: report.label,
      readinessScore: report.score,
      rewardRisk: signal.strategyV3?.tradePlan?.rewardRisk ?? null,
      riskGateAllowed: signal.strategyV3?.trendContext?.riskGate.allowed ?? false,
      state: signal.strategyV3?.trendContext?.state ?? "RANGE_IDLE",
      symbol: signal.symbol,
    })),
    guardrail: "v3 实战闭环只读聚合 live 信号、Forward Map 和复盘样本；不能自动下单、不能自动改权重、不能改变实时排序。",
    live,
    mode: "v3_strategy_loop_mvp",
    operatorHint: v3StrategyLoopOperatorHint(status),
    readinessBuckets,
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

function strategyEvolutionLoopStageStatus({
  blocked,
  disabled,
  ready,
  watch,
}: {
  blocked?: boolean;
  disabled?: boolean;
  ready?: boolean;
  watch?: boolean;
}): StrategyEvolutionLoopStageStatus {
  if (disabled) {
    return "disabled";
  }

  if (blocked) {
    return "blocked";
  }

  if (ready) {
    return "ready";
  }

  if (watch) {
    return "watch";
  }

  return "collecting";
}

function strategyEvolutionLoopStatus({
  activationDisabled,
  blockerCount,
  manualReady,
  shadowObservation,
  hasAnySample,
}: {
  activationDisabled: boolean;
  blockerCount: number;
  hasAnySample: boolean;
  manualReady: boolean;
  shadowObservation: boolean;
}): StrategyEvolutionLoopStatus {
  if (!hasAnySample) {
    return "collecting_samples";
  }

  if (shadowObservation) {
    return "shadow_observation";
  }

  if (manualReady) {
    return "manual_review_ready";
  }

  if (activationDisabled) {
    return "activation_disabled";
  }

  if (blockerCount > 0) {
    return "blocked";
  }

  return "collecting_samples";
}

function strategyEvolutionLoopOperatorHint(status: StrategyEvolutionLoopStatus) {
  if (status === "shadow_observation") {
    return "进化闭环已到影子观察层，只能人工复核表现，不能让权重自动生效。";
  }

  if (status === "manual_review_ready") {
    return "进化闭环已有人工复核候选，先看样本、反证和回滚边界，再考虑人工记录。";
  }

  if (status === "activation_disabled") {
    return "真实权重启用被配置关闭，系统只展示学习链路，不让任何权重进入实时扫描。";
  }

  if (status === "blocked") {
    return "进化闭环存在阻断项，先处理样本质量、审计或回滚压力，不推进权重讨论。";
  }

  return "进化闭环正在收集 live v3、outcome 和校准样本，当前只做观察。";
}

function strategyEvolutionReadinessScore(
  outcomes: SystemHealthReport["outcomes"],
  v3StrategyLoop: V3StrategyLoopReport,
) {
  let score = 0;

  if (v3StrategyLoop.live.totalSignals > 0) {
    score += Math.min(20, Math.round((v3StrategyLoop.live.v3Signals / v3StrategyLoop.live.totalSignals) * 20));
  }

  score += Math.min(25, outcomes.sampleQuality.validatedEvents * 3);
  score += Math.min(15, outcomes.calibrationFlow.calibrationReviewEvents * 3);
  score += Math.min(15, outcomes.strategyWeightChangeAudit.readyAuditCount * 8);
  score += Math.min(15, outcomes.strategyWeightShadowEvaluation.improvingCount * 8);

  if (outcomes.strategyWeightActivationGate.status === "eligible_for_manual_activation") {
    score += 10;
  }

  if (outcomes.strategyWeightShadowEvaluation.rollbackWatchCount > 0) {
    score -= 12;
  }

  if (outcomes.calibrationAdmission.status === "blocked") {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

function strategyEvolutionLoopReport(
  outcomes: SystemHealthReport["outcomes"],
  v3StrategyLoop: V3StrategyLoopReport,
): StrategyEvolutionLoopReport {
  const blockers = [
    ...outcomes.calibrationAdmission.blockers.slice(0, 2),
    ...outcomes.calibrationFlow.blockerDetails.slice(0, 2).map((blocker) => blocker.detail),
    ...outcomes.strategyWeightChangeAudit.items.flatMap((item) => item.blockers).slice(0, 2),
    ...outcomes.strategyWeightActivationGate.blockers.slice(0, 2),
  ].filter((blocker, index, list) => blocker && list.indexOf(blocker) === index);
  const activationDisabled = outcomes.strategyWeightActivationGate.status === "active_disabled_by_config";
  const manualReady =
    outcomes.calibrationAdmission.status === "ready" ||
    outcomes.strategyWeightCalibration.candidates.length > 0 ||
    outcomes.strategyWeightChangeAudit.readyAuditCount > 0 ||
    v3StrategyLoop.status === "ready_for_manual_review";
  const shadowObservation =
    outcomes.strategyWeightShadow.approvedRecordCount > 0 ||
    outcomes.strategyWeightShadowEvaluation.evaluatedShadowCount > 0;
  const hasAnySample =
    v3StrategyLoop.live.v3Signals > 0 ||
    v3StrategyLoop.review.sampleCount > 0 ||
    outcomes.trackingEvents > 0 ||
    outcomes.calibrationFlow.calibrationReviewEvents > 0;
  const status = strategyEvolutionLoopStatus({
    activationDisabled,
    blockerCount: blockers.length,
    hasAnySample,
    manualReady,
    shadowObservation,
  });
  const stages: StrategyEvolutionLoopStage[] = [
    {
      count: v3StrategyLoop.live.v3Signals,
      detail: `${v3StrategyLoop.live.keyLevels} 个关键位，${v3StrategyLoop.live.readyPlans} 个可读计划。`,
      id: "v3_live",
      label: "v3 实时样本",
      status: strategyEvolutionLoopStageStatus({
        blocked: v3StrategyLoop.status === "blocked",
        ready: v3StrategyLoop.status === "ready_for_manual_review",
        watch: v3StrategyLoop.live.v3Signals > 0,
      }),
    },
    {
      count: outcomes.closedEvents,
      detail: `跟踪 ${outcomes.trackingEvents}，待复查 ${outcomes.pendingEvents}，到期 ${outcomes.dueEvents}。`,
      id: "outcome_samples",
      label: "outcome 复盘",
      status: strategyEvolutionLoopStageStatus({
        blocked: outcomes.sampleQuality.status === "counterevidence_watch",
        ready: outcomes.sampleQuality.manualReviewReady,
        watch: outcomes.trackingEvents > 0,
      }),
    },
    {
      count: outcomes.strategyWeightChangeAudit.readyAuditCount,
      detail: `${outcomes.strategyWeightCalibration.candidates.length} 个校准候选，${outcomes.strategyWeightChangeAudit.rollbackVerificationCount} 个需回滚验证。`,
      id: "manual_audit",
      label: "人工审计",
      status: strategyEvolutionLoopStageStatus({
        blocked: outcomes.strategyWeightChangeAudit.status === "blocked",
        ready: outcomes.strategyWeightChangeAudit.readyAuditCount > 0,
        watch: outcomes.strategyWeightCalibration.candidates.length > 0,
      }),
    },
    {
      count: outcomes.strategyWeightChangeExecution.executionRecordCount,
      detail: `${outcomes.strategyWeightChangeExecution.approvedRecordCount} 条已批准记录，${outcomes.strategyWeightChangeExecution.pendingApprovalCount} 条待审批。`,
      id: "manual_execution",
      label: "人工记录",
      status: strategyEvolutionLoopStageStatus({
        blocked: outcomes.strategyWeightChangeExecution.status === "blocked",
        ready: outcomes.strategyWeightChangeExecution.approvedRecordCount > 0,
        watch: outcomes.strategyWeightChangeExecution.pendingApprovalCount > 0,
      }),
    },
    {
      count: outcomes.strategyWeightShadowEvaluation.evaluatedShadowCount,
      detail: `${outcomes.strategyWeightShadow.approvedRecordCount} 条影子权重，${outcomes.strategyWeightShadowEvaluation.rollbackWatchCount} 条回滚观察。`,
      id: "shadow_weights",
      label: "影子观察",
      status: strategyEvolutionLoopStageStatus({
        blocked: outcomes.strategyWeightShadowEvaluation.status === "blocked",
        ready: outcomes.strategyWeightShadowEvaluation.status === "improving",
        watch: outcomes.strategyWeightShadowEvaluation.evaluatedShadowCount > 0,
      }),
    },
    {
      count: outcomes.strategyWeightActivationGate.checks.filter((check) => check.status === "passed").length,
      detail: `${outcomes.strategyWeightActivationGate.activationMode} 模式，${outcomes.strategyWeightActivationGate.blockers.length} 个阻断项。`,
      id: "activation_gate",
      label: "真实启用门禁",
      status: strategyEvolutionLoopStageStatus({
        blocked: outcomes.strategyWeightActivationGate.status === "blocked",
        disabled: activationDisabled,
        ready: outcomes.strategyWeightActivationGate.status === "eligible_for_manual_activation",
      }),
    },
  ];
  const nextActions = [
    v3StrategyLoop.operatorHint,
    outcomes.calibrationFlow.nextStep,
    outcomes.strategyWeightActivationGate.nextStep,
  ].filter((action, index, list) => action && list.indexOf(action) === index).slice(0, 3);

  return {
    allowedUse: "research_only",
    blockers: blockers.slice(0, 5),
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    canWriteRuleWeights: false,
    guardrail: "进化闭环只能串联 v3 实时证据、outcome 复盘、人工校准、影子权重和启用门禁；不能自动下单、不能自动改权重、不能改变实时排序。",
    mode: "strategy_evolution_loop_mvp",
    nextActions,
    operatorHint: strategyEvolutionLoopOperatorHint(status),
    readinessScore: strategyEvolutionReadinessScore(outcomes, v3StrategyLoop),
    stages,
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
  runtimeProbes,
  snapshot,
}: BuildSystemHealthReportOptions): Promise<SystemHealthReport> {
  const configuredProvider = requestedProvider(env);
  const metadata = snapshot.metadata;
  const coverage = metadata.coverage ?? fallbackCoverage(metadata);
  const scanStatePool = coverage.statePool ?? buildFallbackScanStatePoolReport(coverage);
  const scanEconomy = buildScanEconomyReport(metadata, coverage);
  const fullMarketCoverage = fullMarketCoverageReport(metadata, coverage, scanEconomy);
  const marketDataQuality = marketDataQualityReport(snapshot);
  const dataSourceCapabilities = buildDataSourceCapabilityPlan(env);
  const [resolvedRuntimeProbes, apiObservability] = await Promise.all([
    runtimeProbes ?? readWorkerHeartbeatReport({
      env,
      now,
    }),
    readConfiguredApiObservabilityReport(env, now),
  ]);
  const age = ageMinutes(metadata.generatedAt, now);
  const freshness = scanFreshness({ age, metadata });
  const providerStatus = sourceStatus({
    activeSource: metadata.source,
    configuredProvider,
    env,
  });
  const [archiveRead, journalRead, macroMarketRead, v3ForwardMapSnapshotRead] = await Promise.all([
    readRepositoryListSafely("scan_archives", () => repository.listScanArchives(24)),
    readRepositoryListSafely("journal_events", () => repository.listJournalEvents(120)),
    readRepositoryListSafely("macro_market_snapshots", () => repository.listMacroMarketSnapshots(96)),
    readV3ForwardMapSnapshotsSafely(repository),
  ]);
  const archiveSummaries = archiveRead.items;
  const journalEvents = journalRead.items;
  const macroMarket = buildMacroMarketHealthReport(macroMarketRead, now);
  const archiveEntries = archiveSummaries.length;
  const durable = repository.mode === "database";
  const databaseDiagnostics = database ?? fallbackDatabaseDiagnostics({ durable, repository });
  const repositoryReadIssue = repositoryReadIssueDetail([archiveRead, journalRead]);
  const persistenceDetail = repositoryReadIssue
    ? `${databaseDiagnostics.detail} Repository reads degraded: ${repositoryReadIssue}`
    : databaseDiagnostics.detail;
  const outcomes = outcomeExecutorHealth(journalEvents, now, env);
  const v3ForwardMapReviews = v3ForwardMapReviewHealth({
    events: journalEvents,
    savedSnapshots: v3ForwardMapSnapshotRead.snapshots.length,
    storageDetail: v3ForwardMapSnapshotRead.storageDetail,
    storageStatus: v3ForwardMapSnapshotRead.storageStatus,
  });
  const v3StrategyLoop = v3StrategyLoopReport(snapshot, journalEvents);
  const strategyEvolutionLoop = strategyEvolutionLoopReport(outcomes, v3StrategyLoop);
  const sourceLevel: SystemHealthLevel = providerStatus === "missing_key" ||
      providerStatus === "fallback"
    ? "degraded"
    : providerStatus === "preview"
      ? "preview"
      : "ready";
  const persistenceLevel: SystemHealthLevel = repositoryReadIssue
    ? "degraded"
    : durable
      ? "ready"
      : "preview";
  const freshnessLevel: SystemHealthLevel = metadata.status === "failed"
    ? "blocked"
    : freshness === "expired" || freshness === "unknown"
      ? "degraded"
      : freshness === "aging"
        ? "degraded"
        : "ready";
  const archiveLevel: SystemHealthLevel = archiveRead.status === "unavailable"
    ? "degraded"
    : archiveEntries > 0
      ? persistenceLevel
      : "degraded";
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
    dataSourceCapabilities,
    persistence: {
      databaseDriver: databaseDiagnostics.driver,
      databaseReason: databaseDiagnostics.reason,
      databaseStatus: databaseDiagnostics.status,
      detail: persistenceDetail,
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
      detail: archiveRead.detail,
      entries: archiveEntries,
      retentionMode: repository.mode,
      status: archiveRead.status,
    },
    coverage,
    lightScan: metadata.lightScan ?? null,
    signalMaturity: metadata.signalMaturity ?? null,
    scanDiagnostics: metadata.diagnostics ?? null,
    fullMarketCoverage,
    marketDataQuality,
    macroMarket,
    scanStatePool,
    scanEconomy,
    apiUsage: apiObservability.apiUsage,
    dataSourceLatency: apiObservability.dataSourceLatency,
    runtimeProbes: resolvedRuntimeProbes,
    operations: scanOperations({
      archiveSummaries,
      freshness,
      metadata,
      now,
    }),
    outcomes,
    v3ForwardMapReviews,
    strategyEvolutionLoop,
    v3StrategyLoop,
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
        detail: persistenceDetail,
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
        detail: archiveRead.status === "unavailable"
          ? archiveRead.detail
          : archiveEntries > 0
            ? `已记录 ${archiveEntries} 个扫描回放帧。`
            : "还没有扫描回放帧。",
      },
    ],
  };
}
