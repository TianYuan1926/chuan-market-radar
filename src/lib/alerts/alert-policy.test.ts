import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal } from "@/lib/analysis/types";
import type { SystemHealthReport } from "@/lib/api/system-health";
import { buildDataSourceCapabilityPlan } from "../market/data-source-capabilities";
import { buildFallbackScanStatePoolReport } from "../market/scan-state-pool";
import {
  buildAlertControlReport,
  buildAlertEvent,
  buildAlertHistoryReport,
  buildOperationsAlertEvent,
  mergeAlertEventsById,
  notificationCopyForAlert,
  shouldKeepAlertEventForPreferences,
  shouldSuppressAlert,
  soundProfileForSeverity,
  type AlertHistoryAction,
  type AlertPreferences,
} from "./alert-policy";

const baseSignal: MarketSignal = {
  id: "ena-near-trigger",
  symbol: "ENAUSDT",
  exchange: "BINANCE",
  direction: "long",
  state: "near_trigger",
  timeframe: "15m",
  regime: "mixed",
  confidence: 78,
  risk: "low",
  updatedAt: "2026-06-14T10:00:00.000Z",
  summary: "压缩接近触发，等待回踩确认。",
  evidence: [
    {
      label: "structure",
      value: "compression",
      layer: "structure_location",
      polarity: "supportive",
    },
  ],
  strategy: {
    bias: "long",
    entry: "trigger 10.00",
    invalidation: "stop 9.40",
    targets: ["target 11.20"],
    riskReward: 3.5,
    status: "actionable",
    positionHint: "Only act after trigger confirmation.",
  },
};

type SignalOverrides = Partial<Omit<MarketSignal, "strategy">> & {
  strategy?: Partial<MarketSignal["strategy"]>;
};

function signal(overrides: SignalOverrides = {}): MarketSignal {
  return {
    ...baseSignal,
    ...overrides,
    strategy: {
      ...baseSignal.strategy,
      ...overrides.strategy,
    },
  };
}

function health(overrides: Partial<SystemHealthReport> = {}): SystemHealthReport {
  return {
    generatedAt: "2026-06-14T10:05:00.000Z",
    level: "ready",
    summary: "系统状态可用。",
    dataSource: {
      activeSource: "coinglass",
      configuredProvider: "coinglass",
      detail: "live",
      isRealtime: true,
      mode: "live",
      status: "ready",
    },
    dataSourceCapabilities: buildDataSourceCapabilityPlan({
      COINGLASS_API_KEY: "configured",
      MARKET_DATA_PROVIDER: "coinglass",
    }),
    persistence: {
      databaseDriver: "postgres",
      databaseStatus: "ready",
      detail: "durable",
      durable: true,
      mode: "database",
      scope: "public",
    },
    scan: {
      ageMinutes: 3,
      anomalyCount: 4,
      cadenceMinutes: 15,
      candidateCount: 2,
      freshness: "fresh",
      generatedAt: "2026-06-14T10:00:00.000Z",
      nextScanAt: "2026-06-14T10:15:00.000Z",
      riskGate: "on",
      scannedCount: 24,
      status: "ready",
      staleAfterMinutes: 40,
    },
    archive: {
      detail: "scan_archives storage is readable.",
      entries: 3,
      retentionMode: "database",
      status: "ready",
    },
    lightScan: null,
    scanDiagnostics: null,
    coverage: {
      batchIndex: 1,
      coveragePercent: 40,
      eligible: 60,
      nextBatchIndex: 2,
      pending: 36,
      pendingAssets: [],
      scanned: 24,
      scannedAssets: [],
      skipped: 0,
      skippedAssets: [],
      total: 60,
      totalBatches: 3,
    },
    fullMarketCoverage: {
      coverage: {
        batchLabel: "2/3",
        cadenceMinutes: 15,
        coveragePercent: 40,
        eligible: 60,
        estimatedFullCycleMinutes: 45,
        nextBatchLabel: "3/3",
        pending: 36,
        scanned: 24,
        skipped: 0,
        total: 60,
        totalBatches: 3,
      },
      exchangeQuality: {
        majorThree: 0,
        majorThreePercent: 0,
        multiExchange: 0,
        singleExchange: 0,
        unlisted: 0,
      },
      exchangeDrilldown: {
        guardrail: "交易所覆盖钻取只读取本轮 coverage metadata；覆盖质量只能影响观察优先级，不能单独生成交易方向。",
        nextActions: [],
        rows: [],
        unsupported: {
          count: 0,
          operatorHint: "当前没有过滤样本，继续保持质量门槛。",
          samples: [],
        },
      },
      guardrails: [
        "全市场扫描采用轻扫描轮转，深度分析只给候选池和关键观察标的。",
        "前端覆盖报告只读取本轮 metadata，不会触发额外 CoinGlass 请求。",
      ],
      highPriority: {
        candidateCount: 0,
        enabled: false,
        operatorHint: "当前没有可用的高优先级提示，按层级轮转扫描。",
        queuedAssets: [],
        reasonCounts: [],
        rotatingSelectedAssets: [],
        selectedAssets: [],
        slotsAvailable: 0,
        slotsUsed: 0,
      },
      lanes: [],
      mode: "full_market_coverage_depth_mvp",
      operatorHint: "全市场覆盖正在按预算压缩轮转。",
      priorityExplanation: "候选池优先级来自锚定币、配置白名单、流动性、交易所覆盖和近期信号。",
      rotationAudit: null,
      samples: {
        pendingAssets: [],
        rejectedAssets: [],
        scannedAssets: [],
      },
      status: "budget_capped",
    },
    marketDataQuality: {
      filters: {
        acceptedPool: 24,
        cleanRows: 24,
        duplicateSymbolCount: 0,
        duplicatesRemoved: 0,
        minVolume24hUsd: 5_000_000,
        primaryRows: 24,
        quoteNotSupported: 0,
        rawRows: 24,
        rejectedPool: 0,
        unsupportedExchange: 0,
      },
      guardrails: [
        "数据质量层只能阻断、降级或解释候选，不能单独生成交易方向。",
        "UNKNOWN、非 USDT、报价冲突和低流动性标的不能包装成机会。",
      ],
      issues: [],
      mode: "market_data_quality_mvp",
      operatorHint: "数据质量干净。",
      primarySelection: {
        duplicateGroups: 0,
        operatorHint: "本轮没有重复交易所行，主信号无需聚合。",
        rule: "exchange_priority_then_volume_oi",
        samples: [],
      },
      qualityScore: 100,
      rejectedSamples: [],
      rejectedRowSamples: [],
      status: "clean",
    },
    macroMarket: {
      ageMinutes: null,
      allowedUse: "macro_context_only",
      btcDominancePercent: null,
      canCreateTradeSignal: false,
      fetchedAt: null,
      guardrail: "BTC.D/TOTAL2/TOTAL3 只能作为山寨大盘环境锚点，不能直接生成交易方向，不能降低 3:1 最低盈亏比。",
      operatorHint: "还没有宏观环境快照。",
      snapshotCount: 0,
      source: null,
      status: "empty",
      total2MarketCapUsd: null,
      total3MarketCapUsd: null,
    },
    scanStatePool: buildFallbackScanStatePoolReport({
      batchIndex: 1,
      coveragePercent: 40,
      eligible: 60,
      nextBatchIndex: 2,
      pending: 36,
      pendingAssets: [],
      scanned: 24,
      scannedAssets: [],
      skipped: 0,
      skippedAssets: [],
      total: 60,
      totalBatches: 3,
    }),
    scanEconomy: {
      budget: {
        budgetUsagePercent: 96,
        configuredDailyRequestBudget: 300,
        effectiveBatchSize: 3,
        estimatedDailyRequests: 288,
        estimatedRemainingDailyRequests: 12,
        estimatedRequestsPerScan: 3,
        maxRequestsPerScan: 3,
        publicDiscoveryRequestsPerDayEstimate: 96,
        requestedBatchSize: 7,
        status: "near_budget",
        wasCapped: true,
      },
      coverage: {
        batchIndex: 1,
        coveragePercent: 40,
        eligible: 60,
        nextBatchIndex: 2,
        pending: 36,
        pendingAssets: [],
        scanned: 24,
        scannedAssets: [],
        skipped: 0,
        totalBatches: 3,
      },
      guardrail: "扫描经济只复用本轮 scan metadata，不会增加 CoinGlass 请求，也不会从前端触发额外扫描。",
      mode: "scan_economy_mvp",
      nextTier: "core",
      operatorHint: "预算接近上限，当前批次已保守轮转，优先保障锚定币和高价值合约池。",
      tiers: {
        active: { pending: 0, selected: 0, total: 0 },
        anchor: { pending: 0, selected: 2, total: 2 },
        core: { pending: 0, selected: 0, total: 0 },
        longTail: { pending: 0, selected: 0, total: 0 },
        skipped: 0,
      },
    },
    runtimeProbes: {
      generatedAt: "2026-06-14T10:05:00.000Z",
      redis: {
        checkedAt: "2026-06-14T10:05:00.000Z",
        detail: "Redis 可读，运行心跳探针可用。",
        status: "healthy",
      },
      staleAfterSeconds: 900,
      workers: [],
    },
    operations: {
      batchDetail: "batch 1/3",
      lastProblemScanAt: null,
      lastSuccessfulScanAt: "2026-06-14T10:00:00.000Z",
      minutesUntilNextScan: 10,
      minutesUntilStale: 35,
      operatorHint: "扫描链路正常。",
      recentProblemCount: 0,
      recentSuccessCount: 3,
      requestDetail: "requests 3/7",
      runtimeCacheStatus: "updated",
      runtimeDetail: "scan runtime: 1200ms",
      runtimeTrigger: "cron_post",
      persistedArchive: true,
      repositoryMode: "database",
      verdict: "healthy",
    },
    outcomes: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      calibrationAdmission: {
        allowedUse: "research_only",
        autoWeightEligible: false,
        blockers: ["closed_samples_below_threshold"],
        canAutoAdjustWeights: false,
        closedEvents: 0,
        counterEvidenceEvents: 0,
        expiredEvents: 0,
        failedEvents: 0,
        guardrail: "outcome 样本准入只服务人工校准和回滚复核，不能自动改权重。",
        manualCalibrationReady: false,
        mode: "manual_calibration_gate",
        nextStep: "继续积累 outcome 样本，只读观察有效、反证和过期比例。",
        pendingEvents: 0,
        readinessScore: 0,
        sampleCount: 0,
        status: "collecting",
        validationRatePercent: 0,
        validatedEvents: 0,
      },
      calibrationFlow: {
        admissionStatus: "collecting",
        allowedUse: "research_only",
        autoWeightEligible: false,
        blockerDetails: [
          {
            code: "closed_samples_below_threshold",
            detail: "已关闭样本不足，当前只能继续观察。",
            label: "样本不足",
            nextStep: "继续积累已关闭 outcome 样本，不进入权重讨论。",
            severity: "watch",
          },
        ],
        calibrationReviewEvents: 0,
        canAutoAdjustWeights: false,
        checkpoints: [
          {
            detail: "继续积累 outcome 样本并观察阻断项。",
            id: "sample_admission",
            label: "样本准入",
            status: "collecting",
          },
          {
            detail: "0 个人工确认 / 0 个校准复盘。",
            id: "manual_confirmation",
            label: "人工确认",
            status: "waiting",
          },
          {
            detail: "0 个版本进入回滚观察。",
            id: "rollback_boundary",
            label: "回滚边界",
            status: "waiting",
          },
        ],
        confirmedStrategyVersions: 0,
        guardrail: "outcome 校准流只读展示样本准入、人工确认和回滚边界，不能自动改权重。",
        manualConfirmationEvents: 0,
        manualReviewVersions: 0,
        mode: "outcome_calibration_readonly_flow",
        nextStep: "继续积累 outcome 样本和校准复盘，不进入策略版本确认。",
        pendingCalibrationReviews: 0,
        retainedObservationVersions: 0,
        rollbackWatchVersions: 0,
        sampleBreakdown: {
          expired: 0,
          pending: 0,
          rejected: 0,
          validated: 0,
        },
        sampleDrilldown: [],
        sampleGateReady: false,
        status: "collecting_samples",
        thresholdLayers: [
          {
            current: "0 已关闭",
            detail: "已关闭样本不足，继续等待 outcome executor 写回。",
            id: "sample_floor",
            label: "样本地板",
            nextStep: "继续积累已关闭样本，不进入确认流程。",
            status: "collecting",
            target: ">= 12 已关闭样本",
          },
          {
            current: "0% 有效率",
            detail: "有效率只用于人工校准准入，不能直接升级策略权重。",
            id: "validation_quality",
            label: "有效率阈值",
            nextStep: "有效率达到基础线后仍需人工确认。",
            status: "collecting",
            target: ">= 50% 有效已关闭样本",
          },
          {
            current: "0 反证 / 0 有效",
            detail: "反证不能压过有效样本；一旦反证占优，策略只能降级或进入观察。",
            id: "counterevidence_pressure",
            label: "反证压力",
            nextStep: "保留反证监控，等待更多样本验证。",
            status: "ready",
            target: "反证不高于有效样本，且亏损不形成聚集",
          },
          {
            current: "0 个人工确认",
            detail: "策略版本必须经过人工确认后才能进入长期表现观察。",
            id: "manual_confirmation",
            label: "人工确认",
            nextStep: "等待人工确认策略版本和适用边界。",
            status: "collecting",
            target: ">= 1 个人工确认版本",
          },
          {
            current: "0 回滚观察 / 0 人工复核",
            detail: "确认后反证会触发回滚观察；该层只冻结加权讨论，不写权重。",
            id: "rollback_pressure",
            label: "回滚压力",
            nextStep: "继续按确认后样本观察保留、复核或回滚边界。",
            status: "collecting",
            target: "0 个回滚观察版本，或明确人工降级理由",
          },
        ],
        rollbackPlan: {
          allowedUse: "research_only",
          canAutoAdjustWeights: false,
          checkpoints: [
            {
              detail: "0 个人工确认版本。",
              id: "confirm_version",
              label: "确认版本",
              nextStep: "先人工确认策略版本。",
              status: "waiting",
            },
            {
              detail: "0 个校准复盘仍待复查。",
              id: "observe_followups",
              label: "观察样本",
              nextStep: "用已关闭样本判断保留、复核或回滚。",
              status: "waiting",
            },
            {
              detail: "0 回滚观察 / 0 保留观察。",
              id: "freeze_or_retain",
              label: "冻结或保留",
              nextStep: "继续积累 outcome 样本和校准复盘，不进入权重讨论。",
              status: "waiting",
            },
          ],
          guardrail: "回滚计划只服务人工复核和版本边界，不自动写入策略权重。",
          mode: "manual_rollback_plan",
          nextStep: "继续积累 outcome 样本和校准复盘，不进入权重讨论。",
          severity: "low",
          stage: "collect_samples",
          trigger: "样本仍在收集中，尚未进入策略版本回滚判断。",
        },
      },
      strategyWeightCalibration: {
        allowedUse: "research_only",
        canAutoAdjustWeights: false,
        candidateCount: 0,
        candidates: [],
        closedSamples: 0,
        decreaseCandidates: 0,
        guardrail: "策略权重回测校准 MVP 只输出人工候选和审计边界，不自动写入策略权重。",
        increaseCandidates: 0,
        mode: "strategy_weight_backtest_calibration_mvp",
        nextStep: "继续积累校准样本，暂不进入权重校准讨论。",
        pendingCandidates: 0,
        quarantineCandidates: 0,
        sampleCount: 0,
        status: "collecting",
      },
      strategyWeightChangeAudit: {
        allowedUse: "research_only",
        auditCandidateCount: 0,
        blockedAuditCount: 0,
        canAutoAdjustWeights: false,
        canExecuteWeightChange: false,
        guardrail: "策略权重变更审计 MVP 只生成只读人工审计包和回滚验证要求，不执行真实权重变更。",
        items: [],
        mode: "strategy_weight_change_audit_mvp",
        nextStep: "继续积累回测候选和人工确认记录，暂不进入权重变更审计。",
        readyAuditCount: 0,
        rollbackVerificationCount: 0,
        status: "collecting",
      },
      strategyWeightChangeExecution: {
        allowedUse: "research_only",
        approvedRecordCount: 0,
        blockedRecordCount: 0,
        canAutoAdjustWeights: false,
        canExecuteWeightChange: false,
        canWriteRuleWeights: false,
        executionRecordCount: 0,
        guardrail: "人工权重变更执行记录 MVP 只保存审批与回滚观察边界，不写入规则权重，不触发自动调权。",
        items: [],
        mode: "strategy_weight_manual_execution_registry_mvp",
        nextStep: "继续积累审计候选和人工确认样本，暂不生成执行记录。",
        pendingApprovalCount: 0,
        requiresManualApproval: true,
        rollbackWatchCount: 0,
        status: "collecting",
      },
      strategyWeightActivationGate: {
        activationMode: "disabled",
        allowedUse: "research_only",
        blockerCount: 7,
        blockers: ["启用模式：当前配置关闭真实权重启用；默认 disabled，不允许进入真实权重。"],
        canAffectLiveSignals: false,
        canAutoAdjustWeights: false,
        canWriteRuleWeights: false,
        checks: [],
        eligibleDiffCount: 0,
        eligibleForManualActivation: false,
        guardrail: "真实权重启用 gate 只做条件解释，不会改变扫描、评分、策略或规则权重；即使满足条件也仍需单独发布真实接入阶段。",
        mode: "strategy_weight_activation_gate_mvp",
        nextStep: "配置关闭真实权重启用，继续保持影子观察和人工复盘。",
        requiredPostApprovalSamples: 5,
        requiresSeparateRelease: true,
        safetySummary: {
          activationBlockerIds: ["activation_mode"],
          rollbackPressure: {
            blockingCount: 0,
            highCount: 0,
            samples: [],
            watchCount: 0,
          },
          sampleFloor: {
            lowestPostApprovalSamples: 0,
            requiredPostApprovalSamples: 5,
            underSampledCount: 0,
            underSampledTags: [],
          },
        },
        status: "active_disabled_by_config",
      },
      strategyWeightShadow: {
        allowedUse: "research_only",
        approvedRecordCount: 0,
        baseWeights: [],
        canAffectLiveSignals: false,
        canAutoAdjustWeights: false,
        diffs: [],
        guardrail: "影子策略权重只读展示人工审批后的假设差异，不影响真实扫描、真实评分或真实策略权重。",
        ignoredRecordCount: 0,
        mode: "strategy_weight_shadow_readonly_mvp",
        nextStep: "继续积累人工执行记录，暂不形成影子权重差异。",
        shadowWeights: [],
        status: "collecting",
      },
      strategyWeightShadowEvaluation: {
        allowedUse: "research_only",
        blockedCount: 0,
        canAffectLiveSignals: false,
        canAutoAdjustWeights: false,
        evaluatedShadowCount: 0,
        guardrail: "影子表现评估只读观察人工审批后的样本表现，不执行真实权重、不自动调权。",
        improvingCount: 0,
        insufficientSamplesCount: 0,
        items: [],
        mixedCount: 0,
        mode: "strategy_weight_shadow_evaluation_mvp",
        nextStep: "继续积累影子观察期样本，暂不判断策略权重。",
        rollbackWatchCount: 0,
        status: "insufficient_samples",
        totalPostApprovalSamples: 0,
      },
      closedEvents: 0,
      coveragePercent: 0,
      dueEvents: 0,
      lastRun: null,
      latestOutcomeAt: null,
      latestRunAt: null,
      mode: "outcome_executor_mvp",
      operatorHint: "还没有自动复盘样本，等待信号进入跟踪队列。",
      pendingEvents: 0,
      sampleQuality: {
        autoWeightEligible: false,
        expiredEvents: 0,
        failedEvents: 0,
        manualReviewReady: false,
        pendingEvents: 0,
        status: "empty",
        validatedEvents: 0,
      },
      status: "idle",
      trackingEvents: 0,
    },
    v3ForwardMapReviews: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      latestReviewAt: null,
      latestRunAt: null,
      lastRun: null,
      mode: "v3_forward_map_review_health_mvp",
      operatorHint: "还没有可复盘的 v3 事前地图，先等待扫描归档保存 Forward Map 快照。",
      savedSnapshots: 0,
      status: "idle",
      storageDetail: "v3_forward_map_snapshots storage is readable.",
      storageStatus: "ready",
    },
    strategyEvolutionLoop: {
      allowedUse: "research_only",
      blockers: [],
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      canWriteRuleWeights: false,
      guardrail: "进化闭环只能串联 v3 实时证据、outcome 复盘、人工校准、影子权重和启用门禁；不能自动下单、不能自动改权重、不能改变实时排序。",
      mode: "strategy_evolution_loop_mvp",
      nextActions: [],
      operatorHint: "进化闭环正在收集 live v3、outcome 和校准样本，当前只做观察。",
      readinessScore: 0,
      stages: [],
      status: "collecting_samples",
    },
    v3StrategyLoop: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      candidates: [],
      guardrail: "v3 实战闭环只读聚合 live 信号、Forward Map 和复盘样本；不能自动下单、不能自动改权重、不能改变实时排序。",
      live: {
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
      mode: "v3_strategy_loop_mvp",
      operatorHint: "当前扫描还缺少 v3 结构地图，先等待 OHLCV 和 Forward Map 样本进入扫描归档。",
      readinessBuckets: [],
      review: {
        closedSamples: 0,
        patternStatus: "empty",
        pendingSamples: 0,
        sampleCount: 0,
        topPatternLabel: null,
        topTradePlanLabel: null,
      },
      status: "waiting_data",
    },
    guards: [],
    ...overrides,
    apiUsage: overrides.apiUsage ?? {
      dailyBudget: 300,
      day: "2026-06-14",
      detail: "Redis daily counter is readable.",
      generatedAt: "2026-06-14T10:05:00.000Z",
      pacingMs: 500,
      perMinuteLimit: 30,
      provider: "CoinGlass",
      remainingToday: 280,
      source: "redis",
      status: "ready",
      throttled: false,
      usedToday: 20,
    },
    dataSourceLatency: overrides.dataSourceLatency ?? {
      generatedAt: "2026-06-14T10:05:00.000Z",
      probes: [],
      status: "partial",
    },
  };
}

test("buildAlertEvent promotes near_trigger signals to high severity", () => {
  const event = buildAlertEvent(signal(), {
    generatedAt: "2026-06-14T10:00:00.000Z",
    scanId: "scan-1",
  });

  assert.equal(event?.severity, "high");
  assert.equal(event?.symbol, "ENAUSDT");
  assert.equal(event?.state, "near_trigger");
  assert.equal(event?.sound, "pulse");
  assert.match(event?.title ?? "", /接近触发/);
});

test("buildAlertEvent promotes triggered signals to critical severity", () => {
  const event = buildAlertEvent(signal({
    id: "ena-triggered",
    state: "triggered",
    strategy: {
      status: "actionable",
    },
  }), {
    generatedAt: "2026-06-14T10:01:00.000Z",
    scanId: "scan-2",
  });

  assert.equal(event?.severity, "critical");
  assert.equal(event?.sound, "alarm");
  assert.match(notificationCopyForAlert(event!).body, /失效/);
});

test("shouldSuppressAlert suppresses repeated same-symbol same-state alerts within the dedupe window", () => {
  const first = buildAlertEvent(signal(), {
    generatedAt: "2026-06-14T10:00:00.000Z",
    scanId: "scan-1",
  })!;
  const second = buildAlertEvent(signal({
    id: "ena-near-trigger-again",
    updatedAt: "2026-06-14T10:03:00.000Z",
  }), {
    generatedAt: "2026-06-14T10:03:00.000Z",
    scanId: "scan-2",
  })!;

  assert.equal(shouldSuppressAlert(second, [first], new Date("2026-06-14T10:04:00.000Z")), true);
  assert.equal(shouldSuppressAlert(second, [first], new Date("2026-06-14T10:12:00.000Z")), false);
});

test("mergeAlertEventsById keeps one stable event per alert id", () => {
  const first = buildAlertEvent(signal(), {
    generatedAt: "2026-06-14T10:00:00.000Z",
    scanId: "scan-1",
  })!;
  const duplicate = {
    ...first,
    detail: "newer detail",
    generatedAt: "2026-06-14T10:01:00.000Z",
  };
  const other = buildAlertEvent(signal({
    symbol: "SUIUSDT",
  }), {
    generatedAt: "2026-06-14T10:02:00.000Z",
    scanId: "scan-1",
  })!;

  const merged = mergeAlertEventsById([duplicate, first, other], 5);

  assert.deepEqual(merged.map((event) => event.id), [duplicate.id, other.id]);
  assert.equal(merged[0].detail, "newer detail");
});

test("buildAlertHistoryReport tracks seen archive restore and filters local in-app history", () => {
  const first = buildAlertEvent(signal(), {
    generatedAt: "2026-06-14T10:00:00.000Z",
    scanId: "scan-history-1",
  })!;
  const second = buildAlertEvent(signal({
    symbol: "SUIUSDT",
    state: "triggered",
  }), {
    generatedAt: "2026-06-14T10:03:00.000Z",
    scanId: "scan-history-2",
  })!;
  const operations = buildOperationsAlertEvent(health({
    scan: {
      ...health().scan,
      freshness: "expired",
      status: "stale",
    },
    operations: {
      ...health().operations,
      verdict: "attention",
    },
  }))!;
  const actions: AlertHistoryAction[] = [
    { alertId: first.id, at: "2026-06-14T10:01:00.000Z", type: "seen" },
    { alertId: second.id, at: "2026-06-14T10:04:00.000Z", type: "archive" },
    { alertId: second.id, at: "2026-06-14T10:05:00.000Z", type: "restore" },
    { alertId: operations.id, at: "2026-06-14T10:06:00.000Z", type: "archive" },
  ];

  const active = buildAlertHistoryReport([first, second, operations], actions, {
    filter: "active",
    limit: 10,
  });
  const archived = buildAlertHistoryReport([first, second, operations], actions, {
    filter: "archived",
    limit: 10,
  });
  const unseen = buildAlertHistoryReport([first, second, operations], actions, {
    filter: "unseen",
    limit: 10,
  });
  const system = buildAlertHistoryReport([first, second, operations], actions, {
    filter: "system",
    limit: 10,
  });

  assert.equal(active.allowedUse, "in_app_only");
  assert.equal(active.canUseTelegram, false);
  assert.equal(active.canUseWebhook, false);
  assert.equal(active.externalChannelsEnabled, false);
  assert.equal(active.totalCount, 3);
  assert.equal(active.activeCount, 2);
  assert.equal(active.archivedCount, 1);
  assert.equal(active.unseenCount, 0);
  assert.deepEqual(active.entries.map((entry) => entry.id), [second.id, first.id]);
  assert.equal(active.entries.find((entry) => entry.id === first.id)?.historyStatus, "seen");
  assert.equal(active.entries.find((entry) => entry.id === second.id)?.historyStatus, "seen");
  assert.deepEqual(archived.entries.map((entry) => entry.id), [operations.id]);
  assert.deepEqual(unseen.entries, []);
  assert.deepEqual(system.entries, []);
  assert.match(active.guardrail, /不接 Telegram\/Webhook/);
});

test("quiet hours suppress sound but keep alert event copy available", () => {
  const profile = soundProfileForSeverity("high", {
    now: new Date("2026-06-14T15:30:00.000Z"),
    quietHours: {
      endHour: 8,
      startHour: 23,
      timeZone: "Asia/Shanghai",
    },
  });
  const event = buildAlertEvent(signal(), {
    generatedAt: "2026-06-14T15:30:00.000Z",
    scanId: "scan-quiet",
  })!;

  assert.equal(profile.muted, true);
  assert.equal(profile.shouldPlay, false);
  assert.equal(event.severity, "high");
  assert.match(notificationCopyForAlert(event).title, /ENA/);
});

test("local alert preferences filter signal severity without hiding operations alerts", () => {
  const preferences: AlertPreferences = {
    browserNotificationsEnabled: false,
    dedupeWindowMinutes: 15,
    minimumSignalSeverity: "high",
    quietHours: {
      endHour: 8,
      startHour: 23,
      timeZone: "Asia/Shanghai",
    },
    quietHoursEnabled: true,
    soundEnabled: true,
  };
  const watch = buildAlertEvent(signal({
    state: "abnormal_watch",
  }), {
    generatedAt: "2026-06-14T10:00:00.000Z",
    scanId: "scan-alert-control",
  })!;
  const high = buildAlertEvent(signal(), {
    generatedAt: "2026-06-14T10:00:00.000Z",
    scanId: "scan-alert-control",
  })!;
  const operations = buildOperationsAlertEvent(health({
    scan: {
      ...health().scan,
      freshness: "expired",
      status: "stale",
    },
    operations: {
      ...health().operations,
      verdict: "attention",
    },
  }))!;
  const report = buildAlertControlReport(preferences, new Date("2026-06-14T15:30:00.000Z"));

  assert.equal(watch.severity, "watch");
  assert.equal(shouldKeepAlertEventForPreferences(watch, preferences), false);
  assert.equal(shouldKeepAlertEventForPreferences(high, preferences), true);
  assert.equal(shouldKeepAlertEventForPreferences(operations, preferences), true);
  assert.equal(report.mode, "local_alert_control_mvp");
  assert.equal(report.allowedUse, "in_app_only");
  assert.equal(report.canUseTelegram, false);
  assert.equal(report.canUseWebhook, false);
  assert.equal(report.externalChannelsEnabled, false);
  assert.equal(report.dedupeWindowMinutes, 15);
  assert.equal(report.thresholdLabel, "接近触发+触发");
  assert.equal(report.suppressedByQuietHours, true);
  assert.equal(report.soundArmed, false);
  assert.match(report.operatorHint, /不接 Telegram\/Webhook/);
});

test("buildOperationsAlertEvent creates an operations alert for stale or failed scan state", () => {
  const stale = buildOperationsAlertEvent(health({
    level: "degraded",
    scan: {
      ...health().scan,
      freshness: "expired",
      status: "stale",
    },
    operations: {
      ...health().operations,
      operatorHint: "扫描结果已经过期，需要确认定时任务是否继续运行。",
      verdict: "attention",
    },
  }));
  const failed = buildOperationsAlertEvent(health({
    level: "blocked",
    scan: {
      ...health().scan,
      freshness: "expired",
      status: "failed",
    },
    operations: {
      ...health().operations,
      operatorHint: "当前扫描失败，先处理接口鉴权、数据源或持久化错误。",
      verdict: "blocked",
    },
  }));

  assert.equal(stale?.severity, "operations");
  assert.equal(stale?.type, "system_stale");
  assert.equal(failed?.severity, "critical");
  assert.equal(failed?.type, "system_failed");
  assert.match(failed?.detail ?? "", /扫描失败/);
});
