import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeploymentReadinessReport,
  runAdminDeploymentReadiness,
  type DeploymentReadinessReport,
} from "./deployment-readiness";
import type { SystemHealthReport } from "./system-health";

function health(overrides: Partial<SystemHealthReport> = {}): SystemHealthReport {
  return {
    generatedAt: "2026-06-13T12:00:00.000Z",
    level: "preview",
    summary: "系统处于预览状态。",
    dataSource: {
      activeSource: "mock",
      configuredProvider: "mock",
      detail: "当前使用演示数据。",
      isRealtime: false,
      mode: "demo",
      status: "preview",
    },
    persistence: {
      databaseDriver: "neon",
      databaseStatus: "ready",
      detail: "已启用 neon SQL client。",
      durable: true,
      mode: "database",
      scope: "public-demo",
    },
    scan: {
      ageMinutes: 2,
      anomalyCount: 4,
      cadenceMinutes: 15,
      candidateCount: 4,
      freshness: "fresh",
      generatedAt: "2026-06-13T11:58:00.000Z",
      nextScanAt: "2026-06-13T12:13:00.000Z",
      riskGate: "on",
      scannedCount: 24,
      status: "ready",
      staleAfterMinutes: 30,
    },
    archive: {
      entries: 1,
      retentionMode: "database",
    },
    coverage: {
      batchIndex: 0,
      coveragePercent: 100,
      eligible: 24,
      nextBatchIndex: 0,
      pending: 0,
      pendingAssets: [],
      scanned: 24,
      scannedAssets: [],
      skipped: 0,
      skippedAssets: [],
      total: 24,
      totalBatches: 1,
    },
    fullMarketCoverage: {
      coverage: {
        batchLabel: "1/1",
        cadenceMinutes: 15,
        coveragePercent: 100,
        eligible: 24,
        estimatedFullCycleMinutes: 15,
        nextBatchLabel: "1/1",
        pending: 0,
        scanned: 24,
        skipped: 0,
        total: 24,
        totalBatches: 1,
      },
      exchangeQuality: {
        majorThree: 0,
        majorThreePercent: 0,
        multiExchange: 0,
        singleExchange: 0,
        unlisted: 0,
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
      operatorHint: "当前可见合约币池已完成本轮覆盖。",
      priorityExplanation: "候选池优先级来自锚定币、配置白名单、流动性、交易所覆盖和近期信号。",
      samples: {
        pendingAssets: [],
        rejectedAssets: [],
        scannedAssets: [],
      },
      status: "complete",
    },
    marketDataQuality: {
      filters: {
        acceptedPool: 24,
        cleanRows: null,
        duplicateSymbolCount: 0,
        duplicatesRemoved: 0,
        minVolume24hUsd: 5_000_000,
        primaryRows: null,
        quoteNotSupported: 0,
        rawRows: null,
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
      qualityScore: 100,
      rejectedSamples: [],
      status: "clean",
    },
    scanEconomy: {
      budget: {
        budgetUsagePercent: 32,
        configuredDailyRequestBudget: 300,
        effectiveBatchSize: 1,
        estimatedDailyRequests: 96,
        estimatedRemainingDailyRequests: 204,
        estimatedRequestsPerScan: 1,
        maxRequestsPerScan: 3,
        publicDiscoveryRequestsPerDayEstimate: 0,
        requestedBatchSize: 1,
        status: "within_budget",
        wasCapped: false,
      },
      coverage: {
        batchIndex: 0,
        coveragePercent: 100,
        eligible: 24,
        nextBatchIndex: 0,
        pending: 0,
        pendingAssets: [],
        scanned: 24,
        scannedAssets: [],
        skipped: 0,
        totalBatches: 1,
      },
      guardrail: "扫描经济只复用本轮 scan metadata，不会增加 CoinGlass 请求，也不会从前端触发额外扫描。",
      mode: "scan_economy_mvp",
      nextTier: "complete",
      operatorHint: "当前扫描覆盖已完成本轮可见币池，继续复用缓存和归档结果。",
      tiers: {
        active: { pending: 0, selected: 0, total: 0 },
        anchor: { pending: 0, selected: 2, total: 2 },
        core: { pending: 0, selected: 0, total: 0 },
        longTail: { pending: 0, selected: 0, total: 0 },
        skipped: 0,
      },
    },
    operations: {
      batchDetail: "batch 1/1: BTC",
      lastProblemScanAt: null,
      lastSuccessfulScanAt: "2026-06-13T11:58:00.000Z",
      minutesUntilNextScan: 13,
      minutesUntilStale: 28,
      operatorHint: "扫描链路正常，继续观察下一次自动触发。",
      recentProblemCount: 0,
      recentSuccessCount: 1,
      requestDetail: "requests 1/1, next batch 1",
      runtimeDetail: "scan runtime: updated from test",
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
        status: "active_disabled_by_config",
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
  };
}

const readyEnv = {
  CRON_SECRET: "a".repeat(64),
  DATABASE_DRIVER: "neon",
  DATABASE_URL: "postgresql://user:pass@example.neon.tech/neondb",
  JOURNAL_API_RATE_LIMIT: "30",
  MARKET_DATA_PROVIDER: "mock",
  PERSISTENCE_SCOPE: "public-demo",
  SCAN_API_RATE_LIMIT: "60",
};

function check(report: DeploymentReadinessReport, id: string) {
  const item = report.checks.find((entry) => entry.id === id);

  assert.ok(item, `missing check ${id}`);

  return item;
}

test("buildDeploymentReadinessReport treats mock data as deployable preview but not production ready", () => {
  const report = buildDeploymentReadinessReport({
    env: readyEnv,
    health: health(),
    now: new Date("2026-06-13T12:00:00.000Z"),
  });

  assert.equal(report.status, "preview");
  assert.equal(report.deployable, true);
  assert.equal(report.productionReady, false);
  assert.equal(check(report, "database").state, "ready");
  assert.equal(check(report, "data-source").state, "preview");
  assert.equal(report.environment.databaseDriver, "neon");
  assert.equal(report.environment.persistenceScope, "public-demo");
});

test("buildDeploymentReadinessReport blocks production when database is not durable", () => {
  const report = buildDeploymentReadinessReport({
    env: {
      ...readyEnv,
      DATABASE_URL: "",
    },
    health: health({
      persistence: {
        databaseDriver: "none",
        databaseReason: "database_url_missing",
        databaseStatus: "unconfigured",
        detail: "未配置数据库。",
        durable: false,
        mode: "memory",
        scope: "public-demo",
      },
    }),
    now: new Date("2026-06-13T12:00:00.000Z"),
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.deployable, false);
  assert.equal(report.productionReady, false);
  assert.equal(check(report, "database").state, "blocked");
});

test("buildDeploymentReadinessReport marks live CoinGlass configuration as production ready", () => {
  const report = buildDeploymentReadinessReport({
    env: {
      ...readyEnv,
      COINGLASS_API_KEY: "cg-key",
      MARKET_DATA_PROVIDER: "coinglass",
    },
    health: health({
      level: "ready",
      dataSource: {
        activeSource: "coinglass",
        configuredProvider: "coinglass",
        detail: "真实数据源。",
        isRealtime: true,
        mode: "live",
        status: "ready",
      },
    }),
    now: new Date("2026-06-13T12:00:00.000Z"),
  });

  assert.equal(report.status, "ready");
  assert.equal(report.deployable, true);
  assert.equal(report.productionReady, true);
  assert.equal(check(report, "data-source").state, "ready");
});

test("runAdminDeploymentReadiness refuses to run when CRON_SECRET is missing", async () => {
  const response = await runAdminDeploymentReadiness({
    authorization: "Bearer anything",
    env: {},
    health: health(),
  });

  assert.equal(response.status, 503);
  assert.equal(response.body.ok, false);

  if (!response.body.ok) {
    assert.equal(response.body.error, "readiness_secret_missing");
  }
});

test("runAdminDeploymentReadiness rejects the wrong bearer token", async () => {
  const response = await runAdminDeploymentReadiness({
    authorization: "Bearer wrong",
    env: readyEnv,
    health: health(),
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.ok, false);

  if (!response.body.ok) {
    assert.equal(response.body.error, "unauthorized");
  }
});

test("runAdminDeploymentReadiness returns a safe readiness report after authorization", async () => {
  const response = await runAdminDeploymentReadiness({
    authorization: `Bearer ${readyEnv.CRON_SECRET}`,
    env: readyEnv,
    health: health(),
    now: new Date("2026-06-13T12:00:00.000Z"),
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);

  if (response.body.ok) {
    assert.equal(response.body.report.status, "preview");
    assert.equal(response.body.report.secrets.databaseUrl.present, true);
    assert.equal(response.body.report.secrets.databaseUrl.value, undefined);
    assert.equal(response.body.report.secrets.cronSecret.value, undefined);
  }
});
