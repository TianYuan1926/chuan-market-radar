import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal, SignalMaturityStage } from "../analysis/types";
import type { BackendContract } from "./backend-contract";
import {
  buildFrontendKlineContract,
  buildFrontendLeaderboardContract,
  buildFrontendRadarContract,
  buildFrontendReviewContract,
  buildFrontendTokenDossierContract,
  normalizeFrontendKlineSymbol,
} from "./frontend-contract";
import type { MarketRadarSnapshot } from "../market/types";
import {
  buildSignalBackendDossier,
  type SignalBackendDossier,
} from "../market/signal-backend-dossier";
import type { OhlcvCandleCacheEntry, OhlcvProvider } from "../market/ohlcv/types";
import {
  buildCoinGlassRuntimeCapabilityReport,
  buildDataSourceCapabilityPlan,
} from "../market/data-source-capabilities";
import type { StrategyV3Dossier, StrategyV3TradePlan, StrategyV3TrendContext } from "../analysis/v3/types";

function signal(overrides: Partial<MarketSignal> = {}): MarketSignal {
  return {
    id: "sig-tia",
    symbol: "TIAUSDT",
    exchange: "BINANCE",
    direction: "long",
    state: "near_trigger",
    timeframe: "1h",
    regime: "mixed",
    confidence: 84,
    risk: "medium",
    updatedAt: "2026-06-21T08:00:00.000Z",
    summary: "压缩突破后等待回踩确认",
    evidence: [
      { label: "结构突破", value: "4h 压缩区上沿突破", layer: "structure_location", polarity: "supportive" },
      { label: "OI 温和抬升", value: "+8.2%", layer: "derivatives", polarity: "supportive" },
      { label: "日线压力", value: "上方前高压力仍在", layer: "structure_location", polarity: "conflicting" },
    ],
    strategy: {
      bias: "long",
      entry: "回踩不破再考虑",
      invalidation: "跌回箱体",
      targets: ["8.2", "8.8", "9.6"],
      riskReward: 3.2,
      positionHint: "不追单",
      status: "waiting",
      stopLoss: "7.2",
      takeProfitPlan: "TP1 40% / TP2 40% / TP3 20%",
      noChase: true,
    },
    ...overrides,
  };
}

function signalMaturity(stage: SignalMaturityStage): NonNullable<MarketSignal["maturity"]> {
  return {
    canAttachTradePlan: stage === "TRADE_PLAN_READY",
    canEnterMainSignalArea: stage !== "LIGHT_SCAN_MARK",
    canRequestAiReview: stage === "EVIDENCE_SIGNAL" || stage === "TRADE_PLAN_READY",
    label: stage,
    reasons: stage === "TRADE_PLAN_READY" ? ["eligible_v3_trade_plan"] : ["has_structured_evidence"],
    stage,
  };
}

function snapshot(signals: MarketSignal[] = [signal()]): MarketRadarSnapshot {
  return {
    metadata: {
      id: "front-contract-scan",
      mode: "scheduled",
      status: "ready",
      source: "coinglass",
      isRealtime: true,
      cadenceMinutes: 15,
      scannedCount: 24,
      anomalyCount: signals.length,
      candidateCount: signals.length,
      riskGate: "on",
      generatedAt: "2026-06-21T08:00:00.000Z",
      nextScanAt: "2026-06-21T08:15:00.000Z",
      staleAfterMinutes: 30,
      notes: [],
    },
    instrumentPool: {
      instruments: [],
      rejected: [],
      summary: {
        total: 0,
        accepted: 0,
        rejected: 0,
        duplicatesRemoved: 0,
        minVolume24hUsd: 0,
        quoteAssets: ["USDT"],
        marketTypes: ["perpetual"],
      },
    },
    instruments: [],
    tickers: [
      {
        symbol: "TIAUSDT",
        exchange: "BINANCE",
        price: 7.84,
        changePercent24h: 6.2,
        volume24hUsd: 180_000_000,
        high24h: 8.1,
        low24h: 7.1,
        updatedAt: "2026-06-21T08:00:00.000Z",
      },
      {
        symbol: "WIFUSDT",
        exchange: "BINANCE",
        price: 1.82,
        changePercent24h: -4.4,
        volume24hUsd: 280_000_000,
        high24h: 1.98,
        low24h: 1.75,
        updatedAt: "2026-06-21T08:00:00.000Z",
      },
    ],
    derivatives: [
      {
        symbol: "TIAUSDT",
        exchange: "BINANCE",
        source: "coinglass",
        openInterestUsd: 120_000_000,
        openInterestChangePercent: 8.4,
        fundingRate: 0.0125,
        fundingRateZScore: 0.4,
        longShortRatio: 1.22,
        updatedAt: "2026-06-21T08:00:00.000Z",
      },
    ],
    heatmap: [],
    signals,
    journalEvents: [
      {
        id: "j-1",
        signalId: "sig-tia",
        symbol: "TIAUSDT",
        title: "TIA 跟踪",
        result: "watching",
        note: "等待验证",
        rankDelta: 1,
        createdAt: "2026-06-21T07:30:00.000Z",
        direction: "long",
        riskReward: 3.2,
        outcomeMetrics: {
          evaluatedCandles: 12,
          validationWindowHours: 24,
          validationWindowLabel: "24h",
          entryPrice: 7.84,
          invalidationPrice: 7.2,
          firstTargetPrice: 8.8,
          mfePercent: 6.4,
          maePercent: -1.8,
        },
      },
    ],
  };
}

function confirmedTrendContext(overrides: Partial<StrategyV3TrendContext> = {}): StrategyV3TrendContext {
  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    conflicts: [],
    decision: "LONG_PLAN",
    guardrail: "只读趋势上下文",
    locationRiskReward: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      currentPrice: 7.84,
      direction: "long",
      hasTradeSignal: false,
      isTradeEligible: true,
      minRewardRisk: 3,
      nearestTarget: 10.2,
      positionQuality: "GOOD_LOCATION",
      rewardRisk: 3.4,
      riskFlags: [],
      stopDistance: 0.08,
      stopDistancePercent: 1.02,
      structuralStop: 7.76,
      summary: "贴近突破位，赔率达标",
      targetDistance: 2.36,
      targetDistancePercent: 30.1,
      targetLevelId: "tia-fwd-r1",
      stopLevelId: "tia-s1",
    },
    marketReadings: [],
    nextStep: "等待突破后回踩确认",
    noParticipationReasons: [],
    reactionQuality: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      direction: "long",
      evidence: ["回踩不破"],
      hasTradeSignal: false,
      qualityScore: 76,
      riskFlags: [],
      status: "CONFIRMED",
      summary: "回踩质量确认",
      touchedLevelId: "tia-r1",
    },
    riskGate: {
      allowed: true,
      blockedBy: [],
      mode: "readonly_v3_risk_gate",
    },
    scores: {
      longPreTrendScore: 82,
      shortPreTrendScore: 12,
      longTrendEnergyScore: 74,
      shortTrendEnergyScore: 8,
      riskScore: 28,
      trendHoldScore: 66,
      exhaustionScore: 21,
    },
    state: "LONG_BREAKOUT",
    summary: "多头趋势切换确认",
    timeframes: [],
    trendIntegrity: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      direction: "long",
      evidence: ["HH/HL 未破坏"],
      hasTradeSignal: false,
      integrityScore: 70,
      riskFlags: [],
      status: "HEALTHY_TREND",
      summary: "趋势完整度健康",
    },
    ...overrides,
  };
}

function strategyV3WithTradePlan(overrides: Partial<StrategyV3TradePlan> = {}): StrategyV3Dossier {
  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    currentPrice: 7.84,
    forwardLevels: [],
    guardrails: ["readonly"],
    keyLevels: [],
    primaryTimeframe: "1h",
    source: "existing_ohlcv_key_level_mvp",
    sourceTimeframes: ["1h"],
    summary: "v3 交易计划测试",
    symbol: "TIAUSDT",
    trendContext: confirmedTrendContext(),
    tradePlan: {
      allowedUse: "research_only",
      blockedBy: [],
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      confirmationChecklist: ["突破后回踩不破"],
      direction: "long",
      entryZone: "8.20 - 8.28",
      hasAutoExecution: false,
      invalidation: "1h 跌回 7.76",
      isPlanEligible: true,
      manualReviewRequired: true,
      plannedEntryPrice: 8.24,
      positionSizing: "轻仓确认",
      rewardRisk: 3.4,
      status: "READY_LONG",
      structuralStop: 7.76,
      summary: "等待突破确认",
      takeProfitPlan: "TP1 减仓，TP2 锁定本金，TP3 趋势仓管理",
      targets: [8.6, 9.15, 10.2],
      ...overrides,
    },
  };
}

function backendContract(): BackendContract {
  return {
    generatedAt: "2026-06-21T08:00:00.000Z",
    source: {
      activeSource: "coinglass",
      configuredProvider: "coinglass",
      isRealtime: true,
      mode: "live",
      status: "ready",
    },
    dataSourceCapabilities: buildDataSourceCapabilityPlan({
      COINGLASS_API_KEY: "configured",
      MARKET_DATA_PROVIDER: "coinglass",
    }),
    runtime: {
      apiUsage: {
        dailyBudget: 300,
        day: "2026-06-21",
        detail: "Redis daily counter is readable.",
        generatedAt: "2026-06-21T08:00:00.000Z",
        pacingMs: 500,
        perMinuteLimit: 30,
        provider: "CoinGlass",
        remainingToday: 276,
        source: "redis",
        status: "ready",
        throttled: false,
        usedToday: 24,
      },
      cacheStatus: "updated",
      persistedArchive: true,
      repositoryMode: "database",
      runtimeProbes: {
        generatedAt: "2026-06-21T08:00:00.000Z",
        redis: {
          checkedAt: "2026-06-21T08:00:00.000Z",
          detail: "Redis 可读，运行心跳探针可用。",
          status: "healthy",
        },
        staleAfterSeconds: 900,
        workers: [],
      },
      scanStability: {
        generatedAt: "2026-06-21T08:00:00.000Z",
        guardrail: "扫描稳定性报告只用于运维诊断；不能直接生成交易计划。",
        issues: [],
        rotation: {
          coveragePercent: 42,
          eligibleAssets: 720,
          estimatedFullCycleMinutes: 450,
          pendingAssets: 696,
          scannedAssets: 24,
        },
        runtime: {
          redisStatus: "healthy",
          workerDown: 0,
          workerHealthy: 0,
          workerTotal: 0,
        },
        score: 100,
        status: "healthy",
        summary: "扫描链路健康，覆盖、归档和 worker 心跳可用。",
        trend: {
          recentArchives: 1,
          recentFailures: 0,
          recentSuccesses: 1,
        },
      },
      sourceLatency: {
        generatedAt: "2026-06-21T08:00:00.000Z",
        probes: [],
        status: "partial",
      },
      trigger: "radar_get",
    },
    scanProof: {
      fullMarket: {
        coveragePercent: 42,
        eligibleAssets: 720,
        pendingAssets: 696,
        scannedAssets: 24,
        status: "rotating",
        totalAssets: 820,
        totalBatches: 30,
        operatorHint: "轮转中",
      },
      lightScan: {
        acceptedCount: 720,
        candidateCount: 33,
        generatedAt: "2026-06-21T08:00:00.000Z",
        requestCount: 3,
        source: "public-light-composite",
        status: "ready",
        topCandidates: [],
        universeCount: 820,
      },
      deepScan: {
        cleanRows: 24,
        coinGlassRequestsPlanned: 24,
        duplicateSymbolGroups: 0,
        emptyResultAssets: [],
        filteredRows: 0,
        plannedAssets: ["BTC", "ETH", "TIA", "WIF"],
        primaryRows: 24,
        rawRows: 24,
        rejectedRows: 0,
      },
      allocation: {
        assets: [],
        capacity: 24,
        coldExplorationAssets: ["REI"],
        guardrail: "轮换名额保底",
        nextBatchAssets: ["SUI", "ARB"],
        notEliminatedAssets: 696,
        pendingAssets: ["OP", "SEI"],
        reviveWatchAssets: ["LDO"],
        selectedAssets: ["BTC", "ETH", "TIA", "WIF"],
      },
      twoStageAllocation: null,
      rotationAudit: null,
    },
    sourceAudit: {
      coinGlassCapability: buildCoinGlassRuntimeCapabilityReport({
        checkedAt: "2026-06-21T08:00:00.000Z",
        diagnostics: {
          cleanRows: 24,
          coinGlassRequestsPlanned: 24,
          rawRows: 24,
          requestFailures: [],
        },
        env: {
          COINGLASS_API_KEY: "configured",
          MARKET_DATA_PROVIDER: "coinglass",
        },
      }),
      coinGlassDeepScan: {
        cleanRows: 24,
        failedPlannedAssets: [],
        plannedAssets: ["BTC", "ETH", "TIA", "WIF"],
        plannedRequests: 24,
        rawRows: 24,
        status: "ready",
      },
      guardrail: "test",
      publicDiscovery: {
        fallbackActivated: false,
        fallbackInstrumentCount: 0,
        liveInstrumentCount: 820,
        sources: [
          { instrumentCount: 420, requestCount: 1, source: "binance", status: "ok" },
          { instrumentCount: 220, requestCount: 1, source: "okx", status: "ok" },
        ],
      },
      publicLightScan: {
        acceptedCount: 720,
        candidateCount: 33,
        notes: [],
        requestCount: 3,
        source: "public-light-composite",
        status: "ready",
        topSymbols: ["TIAUSDT"],
        universeCount: 820,
      },
      macroMarket: {
        ageMinutes: 5,
        allowedUse: "macro_context_only",
        btcDominancePercent: 54.2,
        canCreateTradeSignal: false,
        fetchedAt: "2026-06-21T07:55:00.000Z",
        guardrail: "macro only",
        operatorHint: "BTC.D 下降，山寨环境改善",
        source: "coingecko",
        status: "ready",
        total2MarketCapUsd: 1_400_000_000_000,
        total3MarketCapUsd: 700_000_000_000,
      },
    },
    analysis: {
      businessCapability: {
        schemaVersion: "business-capability.v1",
        generatedAt: "2026-06-21T08:00:00.000Z",
        allowedUse: "research_only",
        canAutoAdjustWeights: false,
        canAutoExecute: false,
        canMutateLiveRanking: false,
        mode: "business_capability_loop_v1",
        operatorHint: "ready",
        readinessScore: 72,
        status: "operational",
        stages: [
          {
            id: "signal_lifecycle",
            title: "信号生命周期",
            status: "ready",
            score: 90,
            summary: "正常",
            evidence: [],
            nextAction: "继续",
            guardrail: "不自动下单",
          },
        ],
        gaps: [],
        nextActions: ["继续跟踪"],
        frontendContracts: [],
        operatingRules: [],
      },
      coreChainGovernance: {
        schemaVersion: "core-chain-governance.v1",
        generatedAt: "2026-06-21T08:00:00.000Z",
        allowedUse: "product_governance_only",
        canAutoExecute: false,
        canCreateTradeSignal: false,
        canMutateLiveRanking: false,
        coreObjective: "提前发现有潜力的山寨币异动，并判断它有没有交易价值。",
        chain: [
          {
            id: "full_market_discovery",
            title: "全市场发现",
            status: "ready",
            summary: "公开交易所轻扫覆盖正常",
            requiredEvidence: ["全市场 universe", "轻扫覆盖"],
            blockers: [],
            nextAction: "继续轮转",
            guardrail: "轻扫不直接执行",
          },
          {
            id: "candidate_filtering",
            title: "候选筛选",
            status: "partial",
            summary: "候选和信号分层展示",
            requiredEvidence: ["成熟度", "轮换状态"],
            blockers: [],
            nextAction: "继续验证",
            guardrail: "候选不进计划就绪区",
          },
          {
            id: "deep_scan_verification",
            title: "深扫验证",
            status: "ready",
            summary: "CoinGlass 深扫可用",
            requiredEvidence: ["OI", "Funding"],
            blockers: [],
            nextAction: "继续监控",
            guardrail: "partial 必须明示",
          },
          {
            id: "structure_analysis",
            title: "结构分析",
            status: "partial",
            summary: "等待更多多周期样本",
            requiredEvidence: ["多周期结构", "关键位"],
            blockers: ["样本薄"],
            nextAction: "继续积累",
            guardrail: "低周期不推翻高周期",
          },
          {
            id: "risk_reward_gate",
            title: "风险赔率",
            status: "ready",
            summary: "RR gate 已启用",
            requiredEvidence: ["RR >= 3:1"],
            blockers: [],
            nextAction: "继续拦截低赔率",
            guardrail: "低于 3:1 不就绪",
          },
          {
            id: "trade_plan_readiness",
            title: "交易计划",
            status: "partial",
            summary: "计划就绪由后端决定",
            requiredEvidence: ["入场", "止损", "目标", "失效"],
            blockers: [],
            nextAction: "等待证据完整",
            guardrail: "前端不编计划",
          },
          {
            id: "review_evolution",
            title: "复盘进化",
            status: "collecting",
            summary: "样本积累中",
            requiredEvidence: ["MFE/MAE", "TP/SL"],
            blockers: ["样本不足"],
            nextAction: "继续追踪",
            guardrail: "不自动调权",
          },
        ],
        featureTriage: [
          {
            id: "mock_market_facts",
            label: "mock 数据冒充真实数据",
            classification: "delete",
            action: "delete",
            reason: "会污染实战判断",
            linkedSteps: ["full_market_discovery"],
            guardrail: "mock 不进 active 页面",
          },
        ],
        pageRoles: [
          {
            route: "/token/[id]",
            role: "core",
            job: "单币交易判断档案",
            mustShow: ["证据链", "Risk Gate"],
            mustNotShow: ["前端编入场"],
          },
        ],
        apiRoles: [
          {
            route: "/api/frontend/radar-contract",
            role: "core",
            job: "前端雷达总控事实源",
            mustReturn: ["scanProof", "coreChainGovernance"],
            mustNotDo: ["触发扫描", "生成交易计划"],
          },
        ],
        p0Completion: {
          checks: [
            {
              key: "core_chain_visible",
              label: "核心链路完整可见",
              status: "pass",
              detail: "测试合同已覆盖核心链路。",
            },
          ],
          percent: 100,
          remaining: [],
          status: "ready",
          summary: "P0 测试合同已闭环。",
        },
        p1Completion: {
          checks: [
            {
              key: "public_light_scan_ready",
              label: "公开轻扫可用",
              status: "pass",
              detail: "测试合同已覆盖轻扫。",
            },
          ],
          percent: 100,
          remaining: [],
          status: "ready",
          summary: "P1 测试合同已闭环。",
        },
        readiness: {
          blockedSteps: 0,
          coreReadySteps: 3,
          status: "partial",
          totalSteps: 7,
        },
        cleanupRules: ["mock、旧缓存、0 值不能冒充真实数据。"],
        operatingSequence: ["大盘是否允许做山寨", "RR 是否至少 3:1"],
      },
      evolution: {
        allowedUse: "research_only",
        canAutoAdjustWeights: false,
        canMutateLiveRanking: false,
        canWriteRuleWeights: false,
        status: "ready",
      },
      signalMaturity: {
        candidateLaneSymbols: ["PEPEUSDT"],
        counts: {
          LIGHT_SCAN_MARK: 33,
          DEEP_SCAN_CANDIDATE: 4,
          EVIDENCE_SIGNAL: 1,
          REVIEW_ONLY: 0,
          TRADE_PLAN_READY: 1,
        },
        guardrail: "轻扫标记不交易",
        mainSignalSymbols: ["TIAUSDT"],
        rules: [],
        tradePlanReadySymbols: ["TIAUSDT"],
      },
      timeframeGate: {
        blockedSymbols: [],
        blockers: {
          regime_timeframe_double_conflict: 0,
          structure_timeframe_conflict: 0,
        },
        conflictTimeframes: [],
        counts: {
          ALLOW: 1,
          WAIT_HIGH_TIMEFRAME_BREAK: 0,
          WATCH_ONLY: 0,
        },
        guardrail: "高周期优先",
        mode: "multi_timeframe_hard_gate_v1",
      },
      v3Coverage: {
        missingSignals: 0,
        ohlcvAttemptedSymbols: ["TIAUSDT"],
        ohlcvFailureCount: 0,
        totalSignals: 1,
        withV3Signals: 1,
      },
      v3StrategyLoop: {
        missingV3Signals: 0,
        readyPlans: 1,
        readinessBuckets: {},
        riskGateBlocked: 0,
        status: "ready",
        totalSignals: 1,
        v3Signals: 1,
      },
      reviewStatistics: {
        allowedUse: "research_only",
        canAutoAdjustWeights: false,
        canMutateLiveRanking: false,
        generatedAt: "2026-06-21T08:00:00.000Z",
        guardrail: "复盘统计只用于人工校准和回滚验证；不能自动改权重、不能改变实时排序。",
        mae: {
          averagePercent: -1.8,
          maxPercent: 0,
        },
        mfe: {
          averagePercent: 6.4,
          maxPercent: 6.4,
        },
        outcomeBuckets: [],
        sampleStatus: "collecting",
        samples: {
          closed: 0,
          evidenceLevel: 1,
          pending: 1,
          total: 1,
          tradePlanReady: 0,
          withMetrics: 1,
        },
        summary: "已关闭样本 0 条，仍处于收集阶段，不能据此调整权重。",
        winRate: {
          expiredExcludedPercent: null,
          rawResolvedPercent: null,
        },
      },
    },
  } as unknown as BackendContract;
}

function ohlcvProvider(): OhlcvProvider & { requests: Array<{ symbol: string; interval: string; limit?: number }> } {
  return {
    id: "test-public-ohlcv",
    label: "Test Public OHLCV",
    requests: [],
    async fetchCandles(request) {
      this.requests.push(request);
      return {
        ok: true,
        source: "test-public-ohlcv",
        symbol: request.symbol,
        interval: request.interval,
        candles: [
          {
            openTime: "2026-06-21T08:00:00.000Z",
            open: 7.1,
            high: 7.8,
            low: 7,
            close: 7.6,
            volume: 123456,
            closeTime: "2026-06-21T08:59:59.999Z",
          },
        ],
      };
    },
  };
}

function klineOverlayDossier({
  maturityStage = "TRADE_PLAN_READY",
  planOverrides = {},
}: {
  maturityStage?: SignalMaturityStage;
  planOverrides?: Partial<StrategyV3TradePlan>;
} = {}): SignalBackendDossier {
  const tradePlan: StrategyV3TradePlan = {
    allowedUse: "research_only",
    blockedBy: [],
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    confirmationChecklist: ["突破站稳 8.2"],
    direction: "long",
    entryZone: "8.2 上方确认",
    hasAutoExecution: false,
    invalidation: "跌回箱体",
    isPlanEligible: true,
    manualReviewRequired: true,
    plannedEntryPrice: 8.24,
    positionSizing: "轻仓",
    rewardRisk: 3.4,
    status: "READY_LONG",
    structuralStop: 7.72,
    summary: "只读交易计划",
    takeProfitPlan: "分批止盈",
    targets: [8.6, 9.15, 10.2],
    ...planOverrides,
  };

  return {
    found: true,
    generatedAt: "2026-06-21T08:00:00.000Z",
    guardrails: ["report_is_translation_only"],
    symbol: "TIAUSDT",
    chart: {
      availableTimeframes: ["1h"],
      selectedTimeframe: "1h",
      tradingView: {
        interval: "1h",
        symbol: "BINANCE:TIAUSDT.P",
        url: "https://www.tradingview.com/chart/?symbol=BINANCE%3ATIAUSDT.P",
      },
    },
    evidence: {
      conflictingCount: 0,
      items: signal().evidence,
      neutralCount: 0,
      supportiveCount: 2,
      total: 3,
    },
    journal: {
      recentEvents: [],
      totalEvents: 0,
    },
    execution: {
      maxLeverage: 50,
      maxLeverageSource: "coinglass_instrument_tag",
    },
    signal: {
      confidence: 84,
      direction: "long",
      exchange: "BINANCE",
      id: "sig-tia",
      maturity: signalMaturity(maturityStage),
      risk: "medium",
      state: "near_trigger",
      summary: "压缩突破",
      timeframe: "1h",
      updatedAt: "2026-06-21T08:00:00.000Z",
    },
    strategyV3: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      currentPrice: 7.84,
      forwardLevels: [
        {
          id: "tia-forward-r1",
          symbol: "TIAUSDT",
          side: "RESISTANCE",
          role: "NEXT_REACTION_ZONE",
          zoneLow: 8.55,
          zoneHigh: 8.65,
          timeframeWeight: 70,
          keyScore: 78,
          status: "AHEAD",
          reasons: ["前方反应区"],
          confirmationRules: ["放量站上"],
          invalidationRules: ["跌回突破位"],
          sourceLevelIds: ["tia-r1"],
        },
      ],
      guardrails: ["research_only"],
      keyLevels: [
        {
          id: "tia-s1",
          symbol: "TIAUSDT",
          timeframe: "1h",
          type: "RANGE_LOW",
          zoneLow: 7.72,
          zoneHigh: 7.82,
          midPrice: 7.77,
          direction: "SUPPORT",
          keyScore: 80,
          reactionScore: 55,
          confluenceScore: 70,
          status: "POTENTIAL",
          reasons: ["箱体下沿"],
          confirmationRules: ["回踩守住"],
          invalidationRule: "跌破箱体",
        },
      ],
      primaryTimeframe: "1h",
      source: "existing_ohlcv_key_level_mvp",
      sourceTimeframes: ["1h"],
      summary: "v3 关键位地图",
      symbol: "TIAUSDT",
      tradePlan,
    },
  };
}

test("buildFrontendRadarContract exposes full-market proof and mature radar signals", () => {
  const radar = buildFrontendRadarContract({
    backend: backendContract(),
    snapshot: snapshot(),
    env: { COINGLASS_DAILY_REQUEST_BUDGET: "300" },
    now: new Date("2026-06-21T08:00:10.000Z"),
  });

  assert.equal(radar.scanProof.status, "live");
  assert.equal(radar.scanProof.data.observedAssets, 820);
  assert.equal(radar.scanProof.data.acceptedAssets, 720);
  assert.equal(radar.scanProof.data.eligibleAssets, 720);
  assert.equal(radar.scanProof.data.currentCycleScannedAssets, 24);
  assert.equal(radar.scanProof.data.deepScanned, 24);
  assert.equal(radar.scanProof.data.lightAcceptancePercent, 87.8);
  assert.equal(radar.scanProof.data.currentCycleCoveragePercent, 3.3);
  assert.equal(radar.scanProof.data.deepCoveragePercent, 3.3);
  assert.equal(radar.scanProof.data.lightAcceptanceDenominator, "observed_assets");
  assert.equal(radar.scanProof.data.currentCycleCoverageDenominator, "eligible_assets");
  assert.equal(radar.scanProof.data.deepCoverageDenominator, "eligible_assets");
  assert.match(radar.scanProof.reason ?? "", /公开轻扫接受率/);
  assert.match(radar.scanProof.reason ?? "", /深扫覆盖率/);
  assert.equal(radar.deepScanQueue.data.currentBatch.includes("TIA"), true);
  assert.equal(radar.coreChainGovernance.status, "partial");
  assert.equal(radar.coreChainGovernance.data.schemaVersion, "core-chain-governance.v1");
  assert.equal(radar.coreChainGovernance.data.allowedUse, "product_governance_only");
  assert.equal(radar.coreChainGovernance.data.canCreateTradeSignal, false);
  assert.equal(radar.coreChainGovernance.data.chain.length, 7);
  assert.equal(radar.coreChainGovernance.data.p0Completion.percent, 100);
  assert.equal(radar.coreChainGovernance.data.p0Completion.status, "ready");
  assert.equal(radar.coreChainGovernance.data.p1Completion.percent, 100);
  assert.equal(radar.coreChainGovernance.data.p1Completion.status, "ready");
  assert.ok(radar.coreChainGovernance.data.apiRoles.some((api) => api.route === "/api/frontend/radar-contract"));
  assert.ok(radar.coreChainGovernance.data.featureTriage.some((item) =>
    item.id === "mock_market_facts" &&
    item.action === "delete"
  ));
  assert.match(radar.coreChainGovernance.reason ?? "", /不生成交易计划/);
  assert.equal(radar.radarSignals.data[0]?.symbol, "TIA");
  assert.equal(radar.radarSignals.data[0]?.direction, "多");
  assert.equal(radar.radarSignals.data[0]?.maturity, "EVIDENCE_SIGNAL");
  assert.equal(radar.radarSignals.data[0]?.rr, 3.2);
  assert.equal(radar.radarSignals.data[0]?.score, 84);
  assert.equal(radar.fundFlow.status, "partial");
  assert.equal(radar.fundFlow.data.canCreateTradeSignal, false);
  assert.deepEqual(radar.fundFlow.data.connectedFields, ["open_interest", "funding_rate", "long_short_ratio"]);
  assert.match(radar.fundFlow.data.decisionBoundary, /不能生成或放大交易计划/);
  assert.equal(radar.fundFlow.data.takerBuySellAvailable, false);
  assert.deepEqual(radar.fundFlow.data.unavailableFields, ["exchange_native_taker_buy_sell", "exchange_native_cvd", "real_fund_flow"]);
  assert.deepEqual(radar.derivatives.data.connectedFields, ["open_interest", "funding_rate", "long_short_ratio"]);
  assert.equal(radar.derivatives.data.takerBuySellStatus, "not_connected");
  assert.deepEqual(radar.derivatives.data.unavailableFields, ["exchange_native_taker_buy_sell", "exchange_native_cvd", "real_fund_flow"]);
  assert.equal(radar.scanStability.status, "live");
  assert.equal(radar.scanStability.data.status, "healthy");
  assert.match(radar.scanStability.reason ?? "", /不能直接生成交易计划/);
  assert.equal(radar.lightScanQuality.data.schemaVersion, "light-scan-quality.v1");
  assert.equal(radar.lightScanQuality.data.canCreateTradeSignal, false);
  assert.ok(radar.lightScanQuality.data.checks.some((check) => check.key === "decision_boundary" && check.status === "pass"));
  assert.equal(radar.opportunityQuality.data.schemaVersion, "opportunity-quality.v1");
  assert.equal(radar.opportunityQuality.data.counts.evidenceSignal, 1);
  assert.equal(radar.opportunityQuality.data.counts.tradePlanReady, 0);
  assert.ok(radar.opportunityQuality.data.antiChase.guardrails.some((rule) => /计划就绪区只允许/.test(rule)));
  assert.match(radar.opportunityQuality.reason ?? "", /机会质量只判断提前性/);
  assert.equal(radar.deepScanQuality.data.schemaVersion, "deep-scan-quality.v1");
  assert.equal(radar.deepScanQuality.data.cleanRows, 24);
  assert.equal(radar.deepScanQuality.data.cleanRate, 100);
  assert.match(radar.deepScanQuality.data.boundary, /不能写成市场无机会/);
  assert.equal(radar.macroReadiness.data.schemaVersion, "macro-readiness.v1");
  assert.equal(radar.macroReadiness.data.availableFields.includes("btc_dominance"), true);
  assert.match(radar.macroReadiness.reason ?? "", /宏观只做山寨环境背景/);
  assert.equal(radar.opsReliability.data.schemaVersion, "ops-reliability.v1");
  assert.ok(radar.opsReliability.data.checks.some((check) => check.key === "postgres" && check.status === "pass"));
  assert.equal(radar.realtimeCapability.status, "live");
  assert.equal(radar.realtimeCapability.data.schemaVersion, "realtime-capability.v1");
  assert.equal(radar.realtimeCapability.data.lanes.length >= 7, true);
  assert.equal(radar.realtimeCapability.data.lanes.every((lane) => lane.canCreateTradeSignal === false), true);
  assert.ok(radar.realtimeCapability.data.lanes.some((lane) => lane.key === "exchange_websocket_light_scan" && lane.allowedUse === "anomaly_discovery"));
  assert.ok(radar.realtimeCapability.data.boundaries.some((rule) => /秒级数据只负责发现异常/.test(rule)));
  assert.match(radar.realtimeCapability.reason ?? "", /秒级层只用于发现异常/);
});

test("scan proof keeps public observation and eligible-asset denominators separate", () => {
  const backend = backendContract();
  backend.scanProof.fullMarket.totalAssets = 593;
  backend.scanProof.fullMarket.eligibleAssets = 593;
  backend.scanProof.fullMarket.scannedAssets = 24;
  backend.scanProof.lightScan.universeCount = 3_113;
  backend.scanProof.lightScan.acceptedCount = 1_316;
  backend.scanProof.deepScan.cleanRows = 46;

  const radar = buildFrontendRadarContract({
    backend,
    snapshot: snapshot(),
    env: {},
    now: new Date("2026-06-21T08:00:10.000Z"),
  });

  assert.equal(radar.scanProof.data.observedAssets, 3_113);
  assert.equal(radar.scanProof.data.acceptedAssets, 1_316);
  assert.equal(radar.scanProof.data.eligibleAssets, 593);
  assert.equal(radar.scanProof.data.currentCycleScannedAssets, 24);
  assert.equal(radar.scanProof.data.deepScanned, 46);
  assert.equal(radar.scanProof.data.lightAcceptancePercent, 42.3);
  assert.equal(radar.scanProof.data.currentCycleCoveragePercent, 4);
  assert.equal(radar.scanProof.data.deepCoveragePercent, 7.8);
});

test("buildFrontendRadarContract exposes realtime capability boundaries and CoinGlass failures explicitly", () => {
  const backend = backendContract();
  backend.runtime.runtimeProbes.workers = [
    {
      ageSec: 3,
      detail: "websocket light scan heartbeat ok",
      key: "websocket-light-worker",
      lastSeenAt: "2026-06-21T08:00:07.000Z",
      name: "websocket-light-worker",
      status: "healthy",
      task: "light-scan",
    },
    {
      ageSec: 4,
      detail: "scanner worker heartbeat ok",
      key: "scanner-worker",
      lastSeenAt: "2026-06-21T08:00:06.000Z",
      name: "scanner-worker",
      status: "healthy",
      task: "scan",
    },
  ];
  backend.sourceAudit.coinGlassCapability = buildCoinGlassRuntimeCapabilityReport({
    checkedAt: "2026-06-21T08:00:00.000Z",
    diagnostics: {
      cleanRows: 0,
      coinGlassRequestsPlanned: 24,
      rawRows: 0,
      requestFailures: [
        {
          code: "401",
          error: "Upgrade plan",
          httpStatus: 200,
          symbol: "BTC",
        },
      ],
    },
    env: {
      COINGLASS_API_KEY: "configured",
      MARKET_DATA_PROVIDER: "coinglass",
    },
  });

  const radar = buildFrontendRadarContract({
    backend,
    snapshot: snapshot(),
    env: { COINGLASS_DAILY_REQUEST_BUDGET: "300" },
    now: new Date("2026-06-21T08:00:10.000Z"),
  });

  const websocketLane = radar.realtimeCapability.data.lanes.find((lane) => lane.key === "exchange_websocket_light_scan");
  const coinGlassLane = radar.realtimeCapability.data.lanes.find((lane) => lane.key === "coinglass_deep_scan");

  assert.equal(radar.realtimeCapability.data.secondLevelOnline, true);
  assert.equal(websocketLane?.status, "live");
  assert.equal(websocketLane?.canCreateTradeSignal, false);
  assert.equal(coinGlassLane?.status, "failed");
  assert.match(coinGlassLane?.guardrail ?? "", /不突破套餐限制/);
  assert.equal(radar.realtimeCapability.data.lanes.every((lane) => lane.canCreateTradeSignal === false), true);
});

test("buildFrontendRadarContract exposes light scan quality without granting trading authority", () => {
  const backend = backendContract();
  backend.runtime.runtimeProbes.workers = [
    {
      ageSec: 2,
      detail: "websocket light scan heartbeat ok",
      key: "websocket-light-worker",
      lastSeenAt: "2026-06-21T08:00:08.000Z",
      name: "websocket-light-worker",
      status: "healthy",
      task: "light-scan",
    },
  ];
  backend.scanProof.lightScan = {
    acceptedCount: 720,
    candidateCount: 3,
    generatedAt: "2026-06-21T08:00:08.000Z",
    requestCount: 0,
    source: "websocket-light-scan",
    status: "ready",
    topCandidates: [
      {
        baseAsset: "TIA",
        changePercent24h: 1.8,
        distanceFromHighPercent: 1.2,
        distanceFromLowPercent: 7.4,
        earlyOpportunityScore: 86,
        opportunityPhase: "early_setup",
        overextensionRisk: "low",
        price: 7.84,
        reasons: ["websocket_sliding_window", "volume_zscore_spike", "compression_volume_accumulation"],
        score: 91,
        state: "PRE_TREND",
        symbol: "TIAUSDT",
        volume24hUsd: 1_200_000,
        volumeSource: "rolling_window",
        volumeWindowMs: 900_000,
        volumeWindowUsd: 1_200_000,
        volatilityPercent: 2.1,
        microstructure: {
          bookAskUsd: 180_000,
          bookBidUsd: 520_000,
          bookImbalance: 0.4857,
          bookPressureSide: "buy",
          bookProxyQuality: "book_ticker_proxy",
          buyPressureUsd: 780_000,
          cvdProxyUsd: 560_000,
          largeBuyTradeUsd: 420_000,
          largeSellTradeUsd: 0,
          largeTakerTradeCount: 1,
          largeTakerTradeSide: "buy",
          largeTakerTradeUsd: 420_000,
          pressureSide: "buy",
          proxyQuality: "taker_trade_proxy",
          sellPressureUsd: 220_000,
          spreadBps: 2.1,
          tradeFlowImbalance: 0.4667,
        },
      },
      {
        baseAsset: "WIF",
        changePercent24h: 3.2,
        distanceFromHighPercent: 0.8,
        distanceFromLowPercent: 8.1,
        earlyOpportunityScore: 12,
        opportunityPhase: "late_move",
        overextensionRisk: "high",
        price: 1.82,
        reasons: ["websocket_sliding_window", "price_impulse"],
        score: 73,
        state: "HOT",
        symbol: "WIFUSDT",
        volume24hUsd: 900_000,
        volumeSource: "rolling_window",
        volumeWindowMs: 900_000,
        volumeWindowUsd: 900_000,
        volatilityPercent: 4.3,
        microstructure: {
          buyPressureUsd: 200_000,
          cvdProxyUsd: -500_000,
          pressureSide: "sell",
          proxyQuality: "rolling_price_volume_proxy",
          sellPressureUsd: 700_000,
          tradeFlowImbalance: -0.5556,
        },
      },
      {
        baseAsset: "REZ",
        changePercent24h: 0.65,
        distanceFromHighPercent: 0,
        distanceFromLowPercent: 0.65,
        earlyOpportunityScore: 72,
        opportunityPhase: "early_setup",
        overextensionRisk: "low",
        price: 0.002956,
        reasons: [
          "websocket_sliding_window",
          "volume_zscore_spike",
          "trade_flow_proxy_imbalance",
          "cvd_proxy_positive",
        ],
        score: 88,
        state: "PRE_TREND",
        symbol: "REZUSDT",
        volume24hUsd: 3_261,
        volumeSource: "rolling_window",
        volumeWindowMs: 900_000,
        volumeWindowUsd: 3_261,
        volatilityPercent: 0.64,
      },
    ],
    universeCount: 720,
  };

  const radar = buildFrontendRadarContract({
    backend,
    snapshot: snapshot(),
    env: { WS_LIGHT_SCAN_STALE_AFTER_MS: "180000" },
    now: new Date("2026-06-21T08:00:10.000Z"),
  });

  assert.equal(radar.lightScanQuality.status, "live");
  assert.equal(radar.lightScanQuality.data.status, "healthy");
  assert.equal(radar.lightScanQuality.data.canCreateTradeSignal, false);
  assert.equal(radar.lightScanQuality.data.coverage.rollingWindowCandidateCount, 3);
  assert.equal(radar.lightScanQuality.data.coverage.zScoreCandidateCount, 2);
  assert.equal(radar.lightScanQuality.data.coverage.cvdProxyCandidateCount, 3);
  assert.equal(radar.lightScanQuality.data.coverage.bookPressureCandidateCount, 1);
  assert.equal(radar.lightScanQuality.data.coverage.largeTakerTradeCandidateCount, 1);
  assert.equal(radar.lightScanQuality.data.coverage.buyPressureCandidateCount, 2);
  assert.equal(radar.lightScanQuality.data.coverage.sellPressureCandidateCount, 1);
  assert.equal(radar.lightScanQuality.data.coverage.earlyOpportunityCandidateCount, 2);
  assert.equal(radar.lightScanQuality.data.coverage.lateMoveCandidateCount, 1);
  assert.equal(radar.lightScanQuality.data.coverage.preTrendCandidateCount, 2);
  assert.equal(radar.lightScanQuality.data.coverage.hotCandidateCount, 1);
  assert.equal(radar.lightScanQuality.data.topCandidates[0]?.symbol, "TIA");
  assert.equal(radar.lightScanQuality.data.topCandidates[0]?.opportunityPhase, "early_setup");
  assert.equal(radar.lightScanQuality.data.topCandidates[0]?.earlyOpportunityScore, 86);
  assert.equal(radar.lightScanQuality.data.topCandidates[0]?.pressureSide, "buy");
  assert.equal(radar.lightScanQuality.data.topCandidates[0]?.flowImbalance, 0.4667);
  assert.equal(radar.lightScanQuality.data.topCandidates[0]?.bookPressureSide, "buy");
  assert.equal(radar.lightScanQuality.data.topCandidates[0]?.largeTakerTradeUsd, 420_000);
  assert.equal(radar.lightScanQuality.data.topCandidates[2]?.symbol, "REZ");
  assert.equal(radar.lightScanQuality.data.topCandidates[2]?.pressureSide, "buy");
  assert.equal(radar.lightScanQuality.data.topCandidates[2]?.flowImbalance, null);
  assert.ok(radar.lightScanQuality.data.checks.some((check) => check.key === "volume_zscore" && check.status === "pass"));
  assert.ok(radar.lightScanQuality.data.checks.some((check) => check.key === "cvd_proxy_quality" && check.status === "pass"));
  assert.ok(radar.lightScanQuality.data.checks.some((check) => check.key === "orderbook_pressure_proxy" && check.status === "pass"));
  assert.ok(radar.lightScanQuality.data.checks.some((check) => check.key === "large_taker_trade_proxy" && check.status === "pass"));
  assert.ok(radar.lightScanQuality.data.guardrails.some((rule) => /不能生成交易计划/.test(rule)));
  const lateMoveSignal = radar.radarSignals.data.find((item) => item.symbol === "WIF");
  const earlySignal = radar.radarSignals.data.find((item) => item.symbol === "REZ");
  assert.equal(lateMoveSignal?.maturity, "REVIEW_ONLY");
  assert.equal(lateMoveSignal?.discovery?.pressureSide, "sell");
  assert.match(lateMoveSignal?.whyBlocked ?? "", /晚到/);
  assert.equal(earlySignal?.maturity, "DEEP_SCAN_CANDIDATE");
  assert.equal(earlySignal?.discovery?.proxyQuality, "reason_tag_proxy");
  assert.equal(earlySignal?.discovery?.earlyOpportunityScore, 72);
});

test("buildFrontendRadarContract recalculates stale persisted signal maturity", () => {
  const radar = buildFrontendRadarContract({
    backend: backendContract(),
    snapshot: snapshot([
      signal({
        maturity: {
          canAttachTradePlan: true,
          canEnterMainSignalArea: true,
          canRequestAiReview: true,
          label: "交易计划就绪",
          reasons: ["eligible_v3_trade_plan"],
          stage: "TRADE_PLAN_READY",
        },
      }),
    ]),
    env: { COINGLASS_DAILY_REQUEST_BUDGET: "300" },
    now: new Date("2026-06-21T08:00:10.000Z"),
  });

  assert.equal(radar.radarSignals.data[0]?.maturity, "EVIDENCE_SIGNAL");
  assert.equal(radar.radarSignals.data[0]?.unifiedDecision.decision, "OBSERVE");
  assert.equal(radar.radarSignals.data[0]?.unifiedDecision.canTradeNow, false);
  assert.match(radar.radarSignals.data[0]?.whyBlocked ?? "", /不能进计划就绪区|不能附带完整计划/);
});

test("frontend radar and token dossier agree when a stale ready signal has no ready trade plan", () => {
  const sharedSnapshot = snapshot([
    signal({
      maturity: {
        canAttachTradePlan: true,
        canEnterMainSignalArea: true,
        canRequestAiReview: true,
        label: "交易计划就绪",
        reasons: ["eligible_v3_trade_plan"],
        stage: "TRADE_PLAN_READY",
      },
    }),
  ]);

  const radar = buildFrontendRadarContract({
    backend: backendContract(),
    env: { COINGLASS_DAILY_REQUEST_BUDGET: "300" },
    snapshot: sharedSnapshot,
    now: new Date("2026-06-21T08:00:10.000Z"),
  });
  const dossier = buildFrontendTokenDossierContract({
    basePrice: 7.84,
    dossier: buildSignalBackendDossier({
      snapshot: sharedSnapshot,
      symbol: "TIAUSDT",
    }),
    now: new Date("2026-06-21T08:00:10.000Z"),
  });

  assert.equal(radar.radarSignals.data[0]?.maturity, "EVIDENCE_SIGNAL");
  assert.equal(radar.radarSignals.data[0]?.unifiedDecision.canTradeNow, false);
  assert.equal(dossier.data.maturity, "EVIDENCE_SIGNAL");
  assert.equal(dossier.data.tradePlan, null);
  assert.deepEqual(dossier.data.riskGate.reasons, [
    "后端成熟度事实为 EVIDENCE_SIGNAL，Token 页面不得自行升级为交易计划就绪。",
    "等待后端结构化交易计划",
  ]);
});

test("frontend radar and token dossier agree when a real v3 plan is ready", () => {
  const sharedSnapshot = snapshot([
    signal({
      maturity: signalMaturity("TRADE_PLAN_READY"),
      strategyV3: strategyV3WithTradePlan(),
    }),
  ]);
  sharedSnapshot.instruments = [
    {
      id: "BINANCE:TIAUSDT",
      symbol: "TIAUSDT",
      baseAsset: "TIA",
      quoteAsset: "USDT",
      exchange: "BINANCE",
      marketType: "perpetual",
      isActive: true,
      volume24hUsd: 180_000_000,
      tags: ["coinglass", "Binance", "lev:50"],
      lastSeenAt: "2026-06-21T08:00:00.000Z",
    },
  ];
  const backend = backendContract();
  backend.scanProof.lightScan.topCandidates = [
    {
      baseAsset: "TIA",
      changePercent24h: 1.8,
      distanceFromHighPercent: 1.2,
      distanceFromLowPercent: 7.4,
      earlyOpportunityScore: 86,
      opportunityPhase: "early_setup",
      overextensionRisk: "low",
      price: 7.84,
      reasons: ["websocket_sliding_window", "volume_zscore_spike", "cvd_proxy_positive"],
      score: 91,
      state: "PRE_TREND",
      symbol: "TIAUSDT",
      volume24hUsd: 1_200_000,
      volumeSource: "rolling_window",
      volumeWindowMs: 900_000,
      volumeWindowUsd: 1_200_000,
      volatilityPercent: 2.1,
      microstructure: {
        buyPressureUsd: 780_000,
        cvdProxyUsd: 560_000,
        pressureSide: "buy",
        proxyQuality: "taker_trade_proxy",
        sellPressureUsd: 220_000,
        tradeFlowImbalance: 0.4667,
      },
    },
  ];

  const radar = buildFrontendRadarContract({
    backend,
    env: { COINGLASS_DAILY_REQUEST_BUDGET: "300" },
    snapshot: sharedSnapshot,
    now: new Date("2026-06-21T08:00:10.000Z"),
  });
  const dossier = buildFrontendTokenDossierContract({
    basePrice: 7.84,
    dossier: buildSignalBackendDossier({
      lightScanCandidates: backend.scanProof.lightScan.topCandidates,
      snapshot: sharedSnapshot,
      symbol: "TIAUSDT",
    }),
    now: new Date("2026-06-21T08:00:10.000Z"),
  });

  assert.equal(radar.radarSignals.data[0]?.maturity, "TRADE_PLAN_READY");
  assert.equal(radar.radarSignals.data[0]?.unifiedDecision.source, "unified_decision_engine");
  assert.equal(radar.radarSignals.data[0]?.unifiedDecision.decision, "TRADE_PLAN_READY");
  assert.equal(radar.radarSignals.data[0]?.unifiedDecision.readyPlan?.plannedEntryPrice, 8.24);
  assert.equal(dossier.data.maturity, "TRADE_PLAN_READY");
  assert.equal(dossier.data.unifiedDecision.decision, "TRADE_PLAN_READY");
  assert.equal(dossier.data.unifiedDecision.source, "unified_decision_engine");
  assert.equal(dossier.data.unifiedDecision.readyPlan?.plannedEntryPrice, 8.24);
  assert.equal(dossier.data.tradePlan?.positionLens.status, "ready");
  assert.equal(dossier.data.tradePlan?.positionLens.marginFractionPercent, 0.3);
  assert.equal(dossier.data.discovery.foundInLightScan, true);
  assert.equal(dossier.data.discovery.pressureSide, "buy");
  assert.equal(dossier.data.discovery.proxyQuality, "taker_trade_proxy");
  assert.ok(dossier.data.reportSections.some((section) =>
    section.items.some((item) => item.sourceId === "discovery:light_scan_top_candidate")
  ));
});

test("token dossier blocks stale READY drafts that fail unified decision planned entry guard", () => {
  const sharedSnapshot = snapshot([
    signal({
      maturity: signalMaturity("TRADE_PLAN_READY"),
      strategyV3: strategyV3WithTradePlan({ plannedEntryPrice: null }),
    }),
  ]);

  const dossier = buildFrontendTokenDossierContract({
    basePrice: 7.84,
    dossier: buildSignalBackendDossier({
      snapshot: sharedSnapshot,
      symbol: "TIAUSDT",
    }),
    now: new Date("2026-06-21T08:00:10.000Z"),
  });

  assert.equal(dossier.data.unifiedDecision.source, "unified_decision_engine");
  assert.equal(dossier.data.unifiedDecision.decision, "BLOCKED");
  assert.equal(dossier.data.maturity, "BLOCKED");
  assert.equal(dossier.data.riskGate.allowTradePlan, false);
  assert.equal(dossier.data.tradePlan, null);
  assert.equal(
    dossier.data.unifiedDecision.blockers.some((item) => item.reason === "missing_planned_entry" && item.severity === "critical"),
    true,
  );
  assert.match(dossier.data.strategyReadiness.summary, /统一决策引擎|后端交易计划/);
});

test("token dossier maps complete unified WAIT without fabricating a trade plan", () => {
  const sharedSnapshot = snapshot([
    signal({
      maturity: signalMaturity("EVIDENCE_SIGNAL"),
      strategyV3: strategyV3WithTradePlan({
        isPlanEligible: false,
        secondaryConfirmation: "回踩后 15m 收回 8.24",
        status: "WAIT_PULLBACK",
        triggerCondition: "回踩 8.20 - 8.28 后重新放量",
        waitReason: "等待回踩确认",
        whyNotNow: "突破后尚未回踩，当前位置追多不满足结构位置。",
      }),
    }),
  ]);

  const dossier = buildFrontendTokenDossierContract({
    basePrice: 7.84,
    dossier: buildSignalBackendDossier({
      snapshot: sharedSnapshot,
      symbol: "TIAUSDT",
    }),
    now: new Date("2026-06-21T08:00:10.000Z"),
  });

  assert.equal(dossier.data.unifiedDecision.decision, "WAIT");
  assert.equal(dossier.data.unifiedDecision.waitPlan?.trigger, "回踩 8.20 - 8.28 后重新放量");
  assert.equal(dossier.data.tradePlan, null);
  assert.equal(dossier.data.riskGate.allowTradePlan, false);
  assert.equal(dossier.data.strategyReadiness.status, "watch");
  assert.equal(dossier.data.strategyReadiness.executionMap.tradabilityRead, "wait_pullback_or_retest");
  assert.match(dossier.data.strategyReadiness.nextAction, /等待触发/);
  assert.equal(
    dossier.data.reportSections.find((section) => section.key === "trade_plan")?.status,
    "partial",
  );
  assert.equal(
    dossier.data.reportSections
      .find((section) => section.key === "trade_plan")
      ?.items.some((item) => item.sourceId === "trade-plan:wait-boundary"),
    true,
  );
});

test("buildFrontendRadarContract uses observed CoinGlass usage instead of planned requests", () => {
  const backend = backendContract();
  backend.runtime.apiUsage = {
    dailyBudget: 300,
    day: "2026-06-21",
    detail: "Redis daily counter is readable.",
    generatedAt: "2026-06-21T08:00:00.000Z",
    pacingMs: 500,
    perMinuteLimit: 30,
    provider: "CoinGlass",
    remainingToday: 163,
    source: "redis",
    status: "ready",
    throttled: false,
    usedToday: 137,
  };

  const radar = buildFrontendRadarContract({
    backend,
    snapshot: snapshot(),
    env: { COINGLASS_DAILY_REQUEST_BUDGET: "300" },
    now: new Date("2026-06-21T08:00:10.000Z"),
  });

  assert.equal(radar.apiUsage.status, "live");
  assert.equal(radar.apiUsage.data.usedToday, 137);
  assert.equal(radar.apiUsage.data.remainingToday, 163);
  assert.equal(radar.apiUsage.data.source, "redis");
  assert.match(radar.apiUsage.reason ?? "", /Redis daily counter/);
});

test("buildFrontendRadarContract defaults CoinGlass budget to Hobbyist production value", () => {
  const backend = backendContract();
  delete (backend.runtime as Partial<typeof backend.runtime>).apiUsage;
  const radar = buildFrontendRadarContract({
    backend,
    snapshot: snapshot(),
    env: {},
    now: new Date("2026-06-21T08:00:10.000Z"),
  });

  assert.equal(radar.apiUsage.data.remainingToday, 3000);
  assert.equal(radar.apiUsage.data.pacingMs, 3000);
});

test("buildFrontendRadarContract uses observed source latency when probes exist", () => {
  const backend = backendContract();
  backend.runtime.sourceLatency = {
    generatedAt: "2026-06-21T08:00:00.000Z",
    probes: [
      {
        checkedAt: "2026-06-21T08:00:00.000Z",
        detail: "CoinGlass API call elapsedMs recorded.",
        latencyMs: 184,
        name: "CoinGlass",
        source: "redis",
        status: "ready",
      },
      {
        checkedAt: "2026-06-21T08:00:01.000Z",
        detail: "Binance source probe elapsedMs recorded.",
        latencyMs: 42,
        name: "Binance",
        source: "redis",
        status: "ready",
      },
    ],
    status: "partial",
  };

  const radar = buildFrontendRadarContract({
    backend,
    snapshot: snapshot(),
    env: {},
    now: new Date("2026-06-21T08:00:10.000Z"),
  });

  assert.equal(radar.dataSources.data.find((source) => source.name === "CoinGlass")?.latencyMs, 184);
  assert.equal(radar.dataSources.data.find((source) => source.name === "Binance")?.latencyMs, 42);
  assert.equal(radar.dataSources.data.find((source) => source.name === "OKX")?.latencyStatus, "partial");
  assert.doesNotMatch(radar.dataSources.reason ?? "", /0 占位/);
});

test("buildFrontendRadarContract exposes CoinGlass Upgrade plan failures in data source notes", () => {
  const backend = backendContract();
  backend.sourceAudit.coinGlassDeepScan.requestFailures = [
    {
      code: "401",
      error: "Upgrade plan",
      httpStatus: 200,
      symbol: "BTC",
    },
  ];
  backend.sourceAudit.coinGlassCapability = buildCoinGlassRuntimeCapabilityReport({
    checkedAt: "2026-06-21T08:00:00.000Z",
    diagnostics: {
      cleanRows: 0,
      coinGlassRequestsPlanned: 24,
      rawRows: 0,
      requestFailures: backend.sourceAudit.coinGlassDeepScan.requestFailures,
    },
    env: {
      COINGLASS_API_KEY: "configured",
      MARKET_DATA_PROVIDER: "coinglass",
    },
  });

  const radar = buildFrontendRadarContract({
    backend,
    snapshot: snapshot(),
    env: {},
    now: new Date("2026-06-21T08:00:10.000Z"),
  });

  const coinGlass = radar.dataSources.data.find((source) => source.name === "CoinGlass");

  assert.match(coinGlass?.note ?? "", /Upgrade plan/);
  assert.match(coinGlass?.note ?? "", /不能生成衍生品证据/);
  assert.equal(coinGlass?.feed, "partial");
});

test("buildFrontendRadarContract derives BLOCKED when risk gate or RR blocks the plan", () => {
  const blocked = signal({
    id: "sig-fet",
    symbol: "FETUSDT",
    risk: "blocked",
    strategy: {
      bias: "long",
      entry: "不追",
      invalidation: "失效",
      targets: ["1.2"],
      riskReward: 1.4,
      positionHint: "等待",
      status: "blocked",
    },
    maturity: {
      canAttachTradePlan: false,
      canEnterMainSignalArea: true,
      canRequestAiReview: true,
      label: "风险拦截",
      reasons: ["risk_gate_or_rr_blocked"],
      stage: "EVIDENCE_SIGNAL",
    },
  });

  const radar = buildFrontendRadarContract({
    backend: backendContract(),
    snapshot: snapshot([blocked]),
    env: {},
    now: new Date("2026-06-21T08:00:10.000Z"),
  });

  assert.equal(radar.radarSignals.data[0]?.maturity, "BLOCKED");
  assert.equal(radar.radarSignals.data[0]?.risk, "极高");
  assert.match(radar.radarSignals.data[0]?.whyBlocked ?? "", /3:1|Risk Gate/);
});

test("buildFrontendLeaderboardContract maps and sorts real ticker data", () => {
  const gainers = buildFrontendLeaderboardContract({
    kind: "gainers",
    snapshot: snapshot(),
    backend: backendContract(),
  });
  const losers = buildFrontendLeaderboardContract({
    kind: "losers",
    snapshot: snapshot(),
    backend: backendContract(),
  });

  assert.equal(gainers.status, "live");
  assert.equal(gainers.data[0]?.symbol, "TIA");
  assert.equal(losers.data[0]?.symbol, "WIF");
  assert.equal(gainers.data[0]?.hasSignal, true);
  assert.equal(gainers.data[0]?.source, "scanner_snapshot_ticker");
  assert.match(gainers.reason ?? "", /扫描快照|scanner/u);
});

test("buildFrontendLeaderboardContract uses public market ticker metrics without candidate filler", () => {
  const backend = backendContract();
  backend.scanProof.lightScan.topCandidates = [
    {
      baseAsset: "CANDY",
      changePercent24h: 99,
      distanceFromHighPercent: 0,
      distanceFromLowPercent: 50,
      price: 0.12,
      reasons: ["price_volume_anomaly"],
      score: 100,
      state: "HOT",
      symbol: "CANDYUSDT",
      volume24hUsd: 10_000_000,
      volatilityPercent: 10,
    },
  ];

  const gainers = buildFrontendLeaderboardContract({
    backend,
    kind: "gainers",
    publicMarket: {
      diagnostics: {
        acceptedCount: 3,
        candidateCount: 1,
        generatedAt: "2026-06-21T08:00:30.000Z",
        notes: [],
        requestCount: 3,
        source: "public-light-composite",
        status: "ready",
        topCandidates: [],
        universeCount: 3,
      },
      tickers: [
        {
          symbol: "AAAUSDT",
          exchange: "BINANCE",
          price: 1,
          changePercent24h: 21,
          volume24hUsd: 1_000_000,
          high24h: 1.1,
          low24h: 0.8,
          updatedAt: "2026-06-21T08:00:30.000Z",
        },
        {
          symbol: "BBBUSDT",
          exchange: "OKX",
          price: 2,
          changePercent24h: 7,
          volume24hUsd: 2_000_000,
          high24h: 2.1,
          low24h: 1.7,
          updatedAt: "2026-06-21T08:00:30.000Z",
        },
        {
          symbol: "BBBUSDT",
          exchange: "BYBIT",
          price: 2.01,
          changePercent24h: 55,
          volume24hUsd: 100_000,
          high24h: 2.2,
          low24h: 1.6,
          updatedAt: "2026-06-21T08:00:30.000Z",
        },
      ],
    },
    snapshot: snapshot([]),
  });

  assert.equal(gainers.status, "live");
  assert.equal(gainers.data[0]?.symbol, "BBB");
  assert.equal(gainers.data.some((row) => row.symbol === "CANDY"), false);
  assert.equal(gainers.data[0]?.source, "public_market_ticker");
  assert.equal(gainers.data[0]?.rankingScope, "market_board");
  assert.equal(gainers.data.find((row) => row.symbol === "BBB")?.value, 55);
  assert.match(gainers.data.find((row) => row.symbol === "BBB")?.sourceLabel ?? "", /BYBIT/);
  assert.match(gainers.data.find((row) => row.symbol === "BBB")?.venueScope ?? "", /BINANCE|BYBIT|OKX/);
  assert.match(gainers.reason ?? "", /真实市场榜单/);
});

test("buildFrontendLeaderboardContract aggregates cross-venue volume for volume board", () => {
  const volume = buildFrontendLeaderboardContract({
    backend: backendContract(),
    kind: "volume",
    publicMarket: {
      diagnostics: {
        acceptedCount: 3,
        candidateCount: 0,
        generatedAt: "2026-06-21T08:00:30.000Z",
        notes: [],
        requestCount: 3,
        source: "public-light-composite",
        status: "ready",
        topCandidates: [],
        universeCount: 3,
      },
      tickers: [
        {
          symbol: "AAAUSDT",
          exchange: "BINANCE",
          price: 1,
          changePercent24h: 10,
          volume24hUsd: 1_000_000,
          high24h: 1.1,
          low24h: 0.8,
          updatedAt: "2026-06-21T08:00:10.000Z",
        },
        {
          symbol: "AAAUSDT",
          exchange: "OKX",
          price: 1.01,
          changePercent24h: 20,
          volume24hUsd: 2_000_000,
          high24h: 1.12,
          low24h: 0.82,
          updatedAt: "2026-06-21T08:00:30.000Z",
        },
        {
          symbol: "BBBUSDT",
          exchange: "BYBIT",
          price: 2,
          changePercent24h: 2,
          volume24hUsd: 2_500_000,
          high24h: 2.1,
          low24h: 1.9,
          updatedAt: "2026-06-21T08:00:20.000Z",
        },
      ],
    },
    snapshot: snapshot([]),
  });

  assert.equal(volume.status, "live");
  assert.equal(volume.data[0]?.symbol, "AAA");
  assert.equal(volume.data[0]?.value, 3_000_000);
  assert.equal(volume.data[0]?.price, 1.01);
  assert.match(volume.data[0]?.sourceLabel ?? "", /aggregated volume/);
});

test("buildFrontendLeaderboardContract falls back to public light scan candidates when tickers are absent", () => {
  const backend = backendContract();
  backend.scanProof.lightScan.topCandidates = [
    {
      baseAsset: "POWER",
      changePercent24h: 12.4,
      distanceFromHighPercent: 1.2,
      distanceFromLowPercent: 18.5,
      price: 0.42,
      reasons: ["price_volume_anomaly", "liquid_enough"],
      score: 91,
      state: "HOT",
      symbol: "POWERUSDT",
      volume24hUsd: 58_000_000,
      volatilityPercent: 8.4,
    },
  ];

  const lightOnlySnapshot = {
    ...snapshot([]),
    tickers: [],
    signals: [],
  };

  const volume = buildFrontendLeaderboardContract({
    kind: "volume",
    snapshot: lightOnlySnapshot,
    backend,
  });

  assert.equal(volume.status, "partial");
  assert.equal(volume.data[0]?.symbol, "POWER");
  assert.equal(volume.data[0]?.price, 0.42);
  assert.equal(volume.data[0]?.value, 58_000_000);
  assert.equal(volume.data[0]?.inCandidatePool, true);
  assert.equal(volume.data[0]?.hasSignal, false);
  assert.equal(volume.data[0]?.source, "light_scan_candidate");
  assert.match(volume.reason ?? "", /不能当作真实全市场涨跌幅榜|候选/u);
});

test("buildFrontendRadarContract exposes light scan candidates as validation signals when evidence signals are empty", () => {
  const backend = backendContract();
  backend.scanProof.deepScan.cleanRows = 0;
  backend.scanProof.deepScan.rawRows = 0;
  backend.sourceAudit.coinGlassDeepScan.cleanRows = 0;
  backend.sourceAudit.coinGlassDeepScan.rawRows = 0;
  backend.scanProof.lightScan.topCandidates = [
    {
      baseAsset: "POWER",
      changePercent24h: 12.4,
      distanceFromHighPercent: 1.2,
      distanceFromLowPercent: 18.5,
      price: 0.42,
      reasons: ["price_volume_anomaly", "liquid_enough"],
      score: 91,
      state: "HOT",
      symbol: "POWERUSDT",
      volume24hUsd: 58_000_000,
      volatilityPercent: 8.4,
    },
  ];

  const radar = buildFrontendRadarContract({
    backend,
    snapshot: {
      ...snapshot([]),
      signals: [],
      tickers: [],
      derivatives: [],
    },
    env: {},
    now: new Date("2026-06-21T08:01:00.000Z"),
  });

  assert.equal(radar.radarSignals.status, "partial");
  assert.equal(radar.radarSignals.source, "public-light-scan");
  assert.equal(radar.radarSignals.data[0]?.symbol, "POWER");
  assert.equal(radar.radarSignals.data[0]?.maturity, "DEEP_SCAN_CANDIDATE");
  assert.equal(radar.radarSignals.data[0]?.direction, "观察");
  assert.equal(radar.radarSignals.data[0]?.rr, null);
  assert.match(radar.radarSignals.data[0]?.whyBlocked ?? "", /不能生成交易计划/);
  assert.equal(radar.petBackendStatus.data.signal, "验证中");
});

test("frontend contract does not mark planned CoinGlass assets as deep scanned when clean rows are zero", () => {
  const backend = backendContract();
  backend.scanProof.deepScan.cleanRows = 0;
  backend.scanProof.deepScan.rawRows = 0;
  backend.scanProof.deepScan.emptyResultAssets = ["TIA", "WIF"];
  backend.sourceAudit.coinGlassDeepScan.cleanRows = 0;
  backend.sourceAudit.coinGlassDeepScan.rawRows = 0;

  const radar = buildFrontendRadarContract({
    backend,
    snapshot: snapshot(),
    env: {},
    now: new Date("2026-06-21T08:00:10.000Z"),
  });
  const rows = buildFrontendLeaderboardContract({
    backend,
    kind: "gainers",
    snapshot: snapshot(),
  });
  const tia = rows.data.find((row) => row.symbol === "TIA");

  assert.equal(radar.scanProof.data.deepScanned, 0);
  assert.equal(tia?.deepScanned, false);
  assert.equal(tia?.awaitingScan, true);
});

test("buildFrontendLeaderboardContract excludes non-crypto underlyings from frontend rows", () => {
  const backend = backendContract();
  backend.scanProof.allocation.selectedAssets.push("NVDA");
  backend.scanProof.lightScan.topCandidates = [
    {
      baseAsset: "NVDA",
      changePercent24h: 12.4,
      distanceFromHighPercent: 1.2,
      distanceFromLowPercent: 18.5,
      price: 140,
      reasons: ["price_volume_anomaly", "liquid_enough"],
      score: 99,
      state: "HOT",
      symbol: "NVDAUSDT",
      volume24hUsd: 900_000_000,
      volatilityPercent: 8.4,
    },
  ];

  const pollutedSnapshot = {
    ...snapshot([]),
    signals: [],
    tickers: [
      {
        symbol: "NVDAUSDT",
        exchange: "BINANCE" as const,
        price: 140,
        changePercent24h: 9.1,
        volume24hUsd: 900_000_000,
        high24h: 145,
        low24h: 132,
        updatedAt: "2026-06-21T08:00:00.000Z",
      },
    ],
  };

  const rows = buildFrontendLeaderboardContract({
    kind: "volume",
    snapshot: pollutedSnapshot,
    backend,
  });

  assert.equal(rows.status, "empty");
  assert.deepEqual(rows.data, []);
});

test("buildFrontendRadarContract filters polluted historical symbols from visible contract fields", () => {
  const backend = backendContract();
  backend.scanProof.allocation.selectedAssets.push("龙虾");
  backend.scanProof.allocation.pendingAssets.push("龙虾");
  backend.scanProof.allocation.nextBatchAssets.push("龙虾");
  backend.scanProof.allocation.coldExplorationAssets.push("龙虾");
  backend.scanProof.lightScan.topCandidates = [
    {
      baseAsset: "龙虾",
      changePercent24h: 12.4,
      distanceFromHighPercent: 1.2,
      distanceFromLowPercent: 18.5,
      price: 140,
      reasons: ["price_volume_anomaly", "liquid_enough"],
      score: 99,
      state: "HOT",
      symbol: "龙虾USDT",
      volume24hUsd: 900_000_000,
      volatilityPercent: 8.4,
    },
  ];

  const radar = buildFrontendRadarContract({
    backend,
    env: {},
    now: new Date("2026-06-21T08:00:10.000Z"),
    snapshot: snapshot([signal(), signal({ id: "polluted", symbol: "龙虾USDT" })]),
  });

  assert.equal(radar.radarSignals.data.some((item) => item.symbol === "龙虾"), false);
  assert.equal(radar.deepScanQueue.data.currentBatch.includes("龙虾"), false);
  assert.equal(radar.deepScanQueue.data.nextBatch.includes("龙虾"), false);
  assert.equal(radar.deepScanQueue.data.highPriority.includes("龙虾"), false);
  assert.equal(radar.deepScanQueue.data.coldExploration.includes("龙虾"), false);
  assert.equal(radar.deepScanQueue.data.longUnscanned.some((item) => item.symbol === "龙虾"), false);
});

test("normalizeFrontendKlineSymbol prepares base assets for public futures OHLCV", () => {
  assert.equal(normalizeFrontendKlineSymbol("TIA"), "TIAUSDT");
  assert.equal(normalizeFrontendKlineSymbol("tia/usdt"), "TIAUSDT");
  assert.equal(normalizeFrontendKlineSymbol("BINANCE:ETHUSDT.P"), "ETHUSDT");
});

test("buildFrontendKlineContract maps public OHLCV candles into frontend chart candles", async () => {
  const provider = ohlcvProvider();

  const kline = await buildFrontendKlineContract({
    interval: "1h",
    limit: 80,
    now: new Date("2026-06-21T08:01:30.000Z"),
    ohlcvProvider: provider,
    symbol: "TIA",
  });

  assert.equal(kline.status, "live");
  assert.equal(kline.source, "test-public-ohlcv");
  assert.equal(kline.ageSec, 90);
  assert.deepEqual(provider.requests, [
    {
      symbol: "TIAUSDT",
      interval: "1h",
      limit: 80,
    },
  ]);
  assert.deepEqual(kline.data, [
    {
      t: Date.parse("2026-06-21T08:00:00.000Z"),
      o: 7.1,
      h: 7.8,
      l: 7,
      c: 7.6,
      v: 123456,
    },
  ]);
  assert.deepEqual(kline.overlays, []);
  assert.equal(kline.overlayStatus, "empty");
});

test("buildFrontendKlineContract exposes readonly v3 chart overlays from backend dossier", async () => {
  const provider = ohlcvProvider();
  const dossier: SignalBackendDossier = {
    found: true,
    generatedAt: "2026-06-21T08:00:00.000Z",
    guardrails: ["report_is_translation_only"],
    symbol: "TIAUSDT",
    chart: {
      availableTimeframes: ["1h"],
      selectedTimeframe: "1h",
      tradingView: {
        interval: "1h",
        symbol: "BINANCE:TIAUSDT.P",
        url: "https://www.tradingview.com/chart/?symbol=BINANCE%3ATIAUSDT.P",
      },
    },
    evidence: {
      conflictingCount: 0,
      items: signal().evidence,
      neutralCount: 0,
      supportiveCount: 2,
      total: 3,
    },
    journal: {
      recentEvents: [],
      totalEvents: 0,
    },
    execution: {
      maxLeverage: 50,
      maxLeverageSource: "coinglass_instrument_tag",
    },
    signal: {
      confidence: 84,
      direction: "long",
      exchange: "BINANCE",
      id: "sig-tia",
      maturity: signalMaturity("TRADE_PLAN_READY"),
      risk: "medium",
      state: "near_trigger",
      summary: "压缩突破",
      timeframe: "1h",
      updatedAt: "2026-06-21T08:00:00.000Z",
    },
    strategyV3: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      currentPrice: 7.84,
      forwardLevels: [
        {
          id: "tia-forward-r1",
          symbol: "TIAUSDT",
          side: "RESISTANCE",
          role: "NEXT_REACTION_ZONE",
          zoneLow: 8.55,
          zoneHigh: 8.65,
          timeframeWeight: 70,
          keyScore: 78,
          status: "AHEAD",
          reasons: ["前方反应区"],
          confirmationRules: ["放量站上"],
          invalidationRules: ["跌回突破位"],
          sourceLevelIds: ["tia-r1"],
        },
      ],
      guardrails: ["research_only"],
      keyLevels: [
        {
          id: "tia-s1",
          symbol: "TIAUSDT",
          timeframe: "1h",
          type: "RANGE_LOW",
          zoneLow: 7.72,
          zoneHigh: 7.82,
          midPrice: 7.77,
          direction: "SUPPORT",
          keyScore: 80,
          reactionScore: 55,
          confluenceScore: 70,
          status: "POTENTIAL",
          reasons: ["箱体下沿"],
          confirmationRules: ["回踩守住"],
          invalidationRule: "跌破箱体",
        },
      ],
      primaryTimeframe: "1h",
      source: "existing_ohlcv_key_level_mvp",
      sourceTimeframes: ["1h"],
      summary: "v3 关键位地图",
      symbol: "TIAUSDT",
      tradePlan: {
        allowedUse: "research_only",
        blockedBy: [],
        canAutoAdjustWeights: false,
        canMutateLiveRanking: false,
        confirmationChecklist: ["突破站稳 8.2"],
        direction: "long",
        entryZone: "8.2 上方确认",
        hasAutoExecution: false,
        invalidation: "跌回箱体",
        isPlanEligible: true,
        manualReviewRequired: true,
        plannedEntryPrice: 8.24,
        positionSizing: "轻仓",
        rewardRisk: 3.4,
        status: "READY_LONG",
        structuralStop: 7.72,
        summary: "只读交易计划",
        takeProfitPlan: "分批止盈",
        targets: [8.6, 9.15, 10.2],
      },
    },
  };

  const kline = await buildFrontendKlineContract({
    dossier,
    interval: "1h",
    now: new Date("2026-06-21T08:01:30.000Z"),
    ohlcvProvider: provider,
    symbol: "TIA",
  });

  assert.equal(kline.status, "live");
  assert.equal(kline.overlayStatus, "live");
  assert.equal(kline.tradingView?.symbol, "BINANCE:TIAUSDT.P");
  assert.equal(kline.overlays.some((overlay) => overlay.sourceId === "v3:key-level:tia-s1"), true);
  assert.equal(kline.overlays.some((overlay) => overlay.sourceId === "v3:forward-level:tia-forward-r1"), true);
  assert.equal(kline.overlays.some((overlay) => overlay.sourceId === "unified-decision:ready-plan:stop"), true);
  assert.equal(kline.overlays.some((overlay) => overlay.sourceId === "unified-decision:ready-plan:tp1"), true);
  assert.equal(kline.overlays.every((overlay) =>
    overlay.kind !== "target" && overlay.kind !== "stop" ||
    overlay.semanticRole === "ready_trade_plan" && overlay.sourceDecision === "unified_decision_engine"
  ), true);
});

test("buildFrontendKlineContract does not expose plan stop or targets when backend maturity is not ready", async () => {
  const provider = ohlcvProvider();
  const dossier = klineOverlayDossier({ maturityStage: "EVIDENCE_SIGNAL" });

  const kline = await buildFrontendKlineContract({
    dossier,
    interval: "1h",
    now: new Date("2026-06-21T08:01:30.000Z"),
    ohlcvProvider: provider,
    symbol: "TIA",
  });

  assert.equal(kline.status, "live");
  assert.equal(kline.overlayStatus, "live");
  assert.equal(kline.overlays.some((overlay) => overlay.sourceId === "v3:key-level:tia-s1"), true);
  assert.equal(kline.overlays.some((overlay) => overlay.sourceId === "v3:forward-level:tia-forward-r1"), true);
  assert.equal(kline.overlays.some((overlay) => overlay.kind === "stop" || overlay.kind === "target"), false);
  assert.equal(kline.overlays.some((overlay) => overlay.semanticRole === "ready_trade_plan"), false);
});

test("buildFrontendKlineContract marks wait overlays as wait conditions without target or stop semantics", async () => {
  const provider = ohlcvProvider();
  const dossier = klineOverlayDossier({
    maturityStage: "EVIDENCE_SIGNAL",
    planOverrides: {
      isPlanEligible: false,
      secondaryConfirmation: "15m 收盘重新站稳等待区",
      status: "WAIT_PULLBACK",
      triggerCondition: "等待回踩 8.12 后重新放量",
      waitReason: "当前位置距离结构止损偏远，不能追",
      whyNotNow: "当前位置追入盈亏比不稳定",
    },
  });

  const kline = await buildFrontendKlineContract({
    dossier,
    interval: "1h",
    now: new Date("2026-06-21T08:01:30.000Z"),
    ohlcvProvider: provider,
    symbol: "TIA",
  });

  assert.equal(kline.status, "live");
  assert.equal(kline.overlays.some((overlay) => overlay.sourceId === "unified-decision:wait:trigger"), true);
  assert.equal(kline.overlays.some((overlay) => overlay.sourceId === "unified-decision:wait:invalidation"), true);
  assert.equal(kline.overlays.some((overlay) => overlay.kind === "target" || overlay.kind === "stop"), false);
  assert.equal(kline.overlays.every((overlay) => overlay.semanticRole !== "ready_trade_plan"), true);
});

test("buildFrontendKlineContract hides ready plan overlays when candles are stale", async () => {
  const dossier = klineOverlayDossier();
  const provider: OhlcvProvider = {
    id: "failing-public-ohlcv",
    label: "Failing Public OHLCV",
    async fetchCandles(request) {
      return {
        ok: false,
        error: "upstream failed",
        interval: request.interval,
        reason: "upstream_error",
        source: "failing-public-ohlcv",
        symbol: request.symbol,
      };
    },
  };
  const cachedEntry: OhlcvCandleCacheEntry = {
    allowedUse: "research_only" as const,
    cacheKey: "TIAUSDT:1h",
    canAutoAdjustWeights: false as const,
    candles: [
      {
        close: 7.2,
        closeTime: "2026-06-21T07:59:59.999Z",
        high: 7.3,
        low: 7,
        open: 7.1,
        openTime: "2026-06-21T07:00:00.000Z",
        volume: 1000,
      },
    ],
    fetchedAt: "2026-06-21T07:00:00.000Z",
    interval: "1h" as const,
    source: "cached-public-ohlcv",
    symbol: "TIAUSDT",
  };
  const repository = {
    async getOhlcvCandleCache() {
      return cachedEntry;
    },
    async upsertOhlcvCandleCache(entry: OhlcvCandleCacheEntry) {
      return entry;
    },
  };

  const kline = await buildFrontendKlineContract({
    dossier,
    interval: "1h",
    maxCacheAgeMs: 1,
    now: new Date("2026-06-21T09:00:00.000Z"),
    ohlcvProvider: provider,
    repository,
    symbol: "TIA",
  });

  assert.equal(kline.status, "stale");
  assert.equal(kline.overlayStatus, "stale");
  assert.equal(kline.overlays.some((overlay) => overlay.sourceId === "v3:key-level:tia-s1"), true);
  assert.equal(kline.overlays.some((overlay) => overlay.kind === "stop" || overlay.kind === "target"), false);
  assert.equal(kline.overlays.some((overlay) => overlay.semanticRole === "ready_trade_plan"), false);
});

test("buildFrontendTokenDossierContract translates backend dossier without report-side decisions", () => {
  const dossier: SignalBackendDossier = {
    found: true,
    generatedAt: "2026-06-21T08:00:00.000Z",
    guardrails: ["report_is_translation_only"],
    symbol: "TIAUSDT",
    chart: {
      availableTimeframes: ["15m", "1h", "4h", "1d"],
      selectedTimeframe: "1h",
      tradingView: {
        interval: "1h",
        symbol: "BINANCE:TIAUSDT.P",
        url: "https://www.tradingview.com/chart/?symbol=BINANCE%3ATIAUSDT.P",
      },
    },
    evidence: {
      conflictingCount: 1,
      items: signal().evidence,
      neutralCount: 0,
      supportiveCount: 2,
      total: 3,
    },
    journal: {
      recentEvents: [],
      totalEvents: 0,
    },
    execution: {
      maxLeverage: 50,
      maxLeverageSource: "coinglass_instrument_tag",
    },
    signal: {
      confidence: 84,
      direction: "long",
      exchange: "BINANCE",
      id: "sig-tia",
      maturity: signalMaturity("TRADE_PLAN_READY"),
      risk: "medium",
      state: "near_trigger",
      summary: "压缩突破",
      timeframe: "1h",
      updatedAt: "2026-06-21T08:00:00.000Z",
    },
    strategyV3: null,
  };

  const res = buildFrontendTokenDossierContract({
    dossier,
    basePrice: 7.84,
    now: new Date("2026-06-21T08:00:05.000Z"),
  });

  assert.equal(res.status, "live");
  assert.equal(res.data.symbol, "TIA");
  assert.equal(res.data.direction, "看多");
  assert.equal(res.data.maturity, "BLOCKED");
  assert.equal(res.data.chart.status, "partial");
  assert.equal(res.data.chart.canUseMockCandles, false);
  assert.equal(res.data.chart.tradingViewSymbol, "BINANCE:TIAUSDT.P");
  assert.equal(res.data.chart.overlaySource, "none");
  assert.equal(res.data.tradePlan, null);
  assert.equal(res.data.riskGate.allowTradePlan, false);
  assert.match(res.data.riskGate.reasons.join("；"), /maturity fact 缺失|等待后端结构化交易计划/);
  assert.equal(res.data.aiReview.note.includes("规则反证检查漏洞"), true);
  assert.equal(res.data.structures.every((item) => item.support === 0 && item.resistance === 0), true);
  assert.equal(res.data.reportSections.some((section) => section.key === "facts"), true);
  assert.equal(res.data.reportSections.some((section) => section.key === "risk_gate"), true);
  assert.equal(res.data.evidence.every((item) => item.sourceId), true);
  assert.equal(res.data.counter.every((item) => item.sourceId), true);
});

test("buildFrontendTokenDossierContract maps real v3 key levels without fabricating missing levels", () => {
  const dossier: SignalBackendDossier = {
    found: true,
    generatedAt: "2026-06-21T08:00:00.000Z",
    guardrails: ["report_is_translation_only"],
    symbol: "TIAUSDT",
    chart: {
      availableTimeframes: ["1h"],
      selectedTimeframe: "1h",
      tradingView: {
        interval: "1h",
        symbol: "BINANCE:TIAUSDT.P",
        url: "https://www.tradingview.com/chart/?symbol=BINANCE%3ATIAUSDT.P",
      },
    },
    evidence: {
      conflictingCount: 0,
      items: signal().evidence,
      neutralCount: 0,
      supportiveCount: 2,
      total: 3,
    },
    journal: {
      recentEvents: [],
      totalEvents: 0,
    },
    execution: {
      maxLeverage: 50,
      maxLeverageSource: "coinglass_instrument_tag",
    },
    signal: {
      confidence: 84,
      direction: "long",
      exchange: "BINANCE",
      id: "sig-tia",
      maturity: signalMaturity("TRADE_PLAN_READY"),
      risk: "medium",
      state: "near_trigger",
      summary: "压缩突破",
      timeframe: "1h",
      updatedAt: "2026-06-21T08:00:00.000Z",
    },
    strategyV3: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      currentPrice: 7.84,
      forwardLevels: [],
      guardrails: ["research_only"],
      keyLevels: [
        {
          id: "tia-s1",
          symbol: "TIAUSDT",
          timeframe: "1h",
          type: "RANGE_LOW",
          zoneLow: 7.72,
          zoneHigh: 7.82,
          midPrice: 7.77,
          direction: "SUPPORT",
          keyScore: 80,
          reactionScore: 55,
          confluenceScore: 70,
          status: "POTENTIAL",
          reasons: ["箱体下沿"],
          confirmationRules: ["回踩守住"],
          invalidationRule: "跌破箱体",
        },
        {
          id: "tia-r1",
          symbol: "TIAUSDT",
          timeframe: "1h",
          type: "RANGE_HIGH",
          zoneLow: 8.2,
          zoneHigh: 8.32,
          midPrice: 8.26,
          direction: "RESISTANCE",
          keyScore: 84,
          reactionScore: 58,
          confluenceScore: 72,
          status: "POTENTIAL",
          reasons: ["箱体上沿"],
          confirmationRules: ["突破站稳"],
          invalidationRule: "跌回箱体",
        },
      ],
      primaryTimeframe: "1h",
      source: "existing_ohlcv_key_level_mvp",
      sourceTimeframes: ["1h"],
      summary: "v3 关键位地图",
      symbol: "TIAUSDT",
    },
  };

  const res = buildFrontendTokenDossierContract({
    dossier,
    basePrice: 7.84,
    now: new Date("2026-06-21T08:00:05.000Z"),
  });

  const oneHour = res.data.structures.find((item) => item.tf === "1h");
  const fourHour = res.data.structures.find((item) => item.tf === "4h");

  assert.equal(oneHour?.support, 7.77);
  assert.equal(oneHour?.resistance, 8.26);
  assert.equal(fourHour?.support, 0);
  assert.equal(fourHour?.resistance, 0);
  assert.equal(res.data.chart.status, "ready");
  assert.equal(res.data.chart.overlaySource, "v3_key_levels_forward_map");
});

test("buildFrontendTokenDossierContract maps backend v3 trade plan without frontend fabrication", () => {
  const dossier: SignalBackendDossier = {
    found: true,
    generatedAt: "2026-06-21T08:00:00.000Z",
    guardrails: ["report_is_translation_only"],
    symbol: "TIAUSDT",
    chart: {
      availableTimeframes: ["1h"],
      selectedTimeframe: "1h",
      tradingView: {
        interval: "1h",
        symbol: "BINANCE:TIAUSDT.P",
        url: "https://www.tradingview.com/chart/?symbol=BINANCE%3ATIAUSDT.P",
      },
    },
    evidence: {
      conflictingCount: 0,
      items: signal().evidence,
      neutralCount: 0,
      supportiveCount: 2,
      total: 3,
    },
    journal: {
      recentEvents: [],
      totalEvents: 0,
    },
    execution: {
      maxLeverage: 50,
      maxLeverageSource: "coinglass_instrument_tag",
    },
    signal: {
      confidence: 84,
      direction: "long",
      exchange: "BINANCE",
      id: "sig-tia",
      maturity: signalMaturity("TRADE_PLAN_READY"),
      risk: "medium",
      state: "near_trigger",
      summary: "压缩突破",
      timeframe: "1h",
      updatedAt: "2026-06-21T08:00:00.000Z",
    },
    strategyV3: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      currentPrice: 7.84,
      forwardLevels: [
        {
          id: "tia-fwd-r1",
          symbol: "TIAUSDT",
          side: "RESISTANCE",
          role: "NEXT_REACTION_ZONE",
          zoneLow: 8.55,
          zoneHigh: 8.65,
          timeframeWeight: 70,
          keyScore: 78,
          status: "AHEAD",
          reasons: ["前方反应区"],
          confirmationRules: ["放量站上"],
          invalidationRules: ["跌回突破位"],
          sourceLevelIds: ["tia-r1"],
        },
      ],
      guardrails: ["research_only"],
      keyLevels: [
        {
          id: "tia-r1",
          symbol: "TIAUSDT",
          timeframe: "1h",
          type: "RANGE_HIGH",
          zoneLow: 8.2,
          zoneHigh: 8.32,
          midPrice: 8.26,
          direction: "RESISTANCE",
          keyScore: 84,
          reactionScore: 58,
          confluenceScore: 72,
          status: "POTENTIAL",
          reasons: ["箱体上沿"],
          confirmationRules: ["突破站稳"],
          invalidationRule: "跌回箱体",
        },
      ],
      primaryTimeframe: "1h",
      source: "existing_ohlcv_key_level_mvp",
      sourceTimeframes: ["1h"],
      summary: "v3 关键位地图",
      symbol: "TIAUSDT",
      trendContext: {
        allowedUse: "research_only",
        canAutoAdjustWeights: false,
        canMutateLiveRanking: false,
        conflicts: [],
        decision: "LONG_PLAN",
        guardrail: "只读趋势上下文",
        locationRiskReward: {
          allowedUse: "research_only",
          canAutoAdjustWeights: false,
          canMutateLiveRanking: false,
          currentPrice: 7.84,
          direction: "long",
          hasTradeSignal: false,
          isTradeEligible: true,
          minRewardRisk: 3,
          nearestTarget: 10.2,
          positionQuality: "GOOD_LOCATION",
          rewardRisk: 3.4,
          riskFlags: [],
          stopDistance: 0.08,
          stopDistancePercent: 1.02,
          structuralStop: 7.76,
          summary: "贴近突破位，赔率达标",
          targetDistance: 2.36,
          targetDistancePercent: 30.1,
          targetLevelId: "tia-fwd-r1",
          stopLevelId: "tia-s1",
        },
        nextStep: "等待突破后回踩确认",
        noParticipationReasons: [],
        reactionQuality: {
          allowedUse: "research_only",
          canAutoAdjustWeights: false,
          canMutateLiveRanking: false,
          direction: "long",
          evidence: ["回踩不破"],
          hasTradeSignal: false,
          qualityScore: 76,
          riskFlags: [],
          status: "CONFIRMED",
          summary: "回踩质量确认",
          touchedLevelId: "tia-r1",
        },
        riskGate: {
          allowed: true,
          blockedBy: [],
          mode: "readonly_v3_risk_gate",
        },
        scores: {
          longPreTrendScore: 82,
          shortPreTrendScore: 12,
          longTrendEnergyScore: 74,
          shortTrendEnergyScore: 8,
          riskScore: 28,
          trendHoldScore: 66,
          exhaustionScore: 21,
        },
        state: "LONG_BREAKOUT",
        summary: "多头趋势切换确认中",
        timeframes: [],
        trendIntegrity: {
          allowedUse: "research_only",
          canAutoAdjustWeights: false,
          canMutateLiveRanking: false,
          direction: "long",
          evidence: ["HH/HL 未破坏"],
          hasTradeSignal: false,
          integrityScore: 70,
          riskFlags: [],
          status: "HEALTHY_TREND",
          summary: "趋势完整度健康",
        },
      },
      tradePlan: {
        allowedUse: "research_only",
        blockedBy: [],
        canAutoAdjustWeights: false,
        canMutateLiveRanking: false,
        confirmationChecklist: ["突破 8.28", "回踩不破 8.20"],
        direction: "long",
        entryZone: "8.20 - 8.28",
        hasAutoExecution: false,
        invalidation: "1h 跌回 7.76",
        isPlanEligible: true,
        manualReviewRequired: true,
        plannedEntryPrice: 8.24,
        positionSizing: "轻仓确认",
        rewardRisk: 3.4,
        status: "READY_LONG",
        structuralStop: 7.76,
        summary: "等待突破确认",
        takeProfitPlan: "TP1 减仓，TP2 锁定本金，TP3 趋势仓管理",
        targets: [8.6, 9.15, 10.2],
      },
    },
  };

  const res = buildFrontendTokenDossierContract({
    dossier,
    basePrice: 7.84,
    now: new Date("2026-06-21T08:00:05.000Z"),
  });

  assert.equal(res.data.maturity, "TRADE_PLAN_READY");
  assert.equal(res.data.chart.status, "ready");
  assert.equal(res.data.chart.canUseMockCandles, false);
  assert.equal(res.data.riskGate.allowTradePlan, true);
  assert.deepEqual(res.data.riskGate.reasons, []);
  assert.equal(res.data.unifiedDecision.source, "unified_decision_engine");
  assert.equal(res.data.unifiedDecision.decision, "TRADE_PLAN_READY");
  assert.equal(res.data.unifiedDecision.canTradeNow, true);
  assert.equal(res.data.unifiedDecision.readyPlan?.plannedEntryPrice, 8.24);
  assert.equal(res.data.unifiedDecision.readyPlan?.rewardRisk, 3.4);
  assert.deepEqual(res.data.unifiedDecision.blockers, []);
  assert.equal(res.data.strategyReadiness.schemaVersion, "token-strategy-readiness.v1");
  assert.equal(res.data.strategyReadiness.status, "ready");
  assert.equal(res.data.strategyReadiness.canTradeNow, true);
  assert.equal(res.data.strategyReadiness.executionMap.schemaVersion, "token-execution-map.v1");
  assert.equal(res.data.strategyReadiness.executionMap.tradabilityRead, "trade_plan_ready");
  assert.equal(res.data.strategyReadiness.executionMap.positionQuality, "good");
  assert.match(res.data.strategyReadiness.executionMap.chartBoundary, /TradingView/);
  assert.equal(res.data.strategyReadiness.positionLensStatus, "ready");
  assert.match(res.data.strategyReadiness.personalLens, /不改变结构盈亏比/);
  assert.equal(res.data.tradePlan?.bias, "多");
  assert.equal(res.data.tradePlan?.entryCondition, "8.20 - 8.28");
  assert.match(res.data.tradePlan?.stop ?? "", /7\.76/);
  assert.equal(res.data.tradePlan?.tp1, "8.6");
  assert.equal(res.data.tradePlan?.tp2, "9.15");
  assert.equal(res.data.tradePlan?.tp3, "10.2");
  assert.equal(res.data.tradePlan?.rr, 3.4);
  assert.equal(res.data.tradePlan?.allowChase, false);
  assert.equal(res.data.tradePlan?.positionLens.status, "ready");
  assert.equal(res.data.tradePlan?.positionLens.leverage, 50);
  assert.equal(res.data.tradePlan?.positionLens.leverageSource, "exchange_max");
  assert.equal(res.data.tradePlan?.positionLens.marginFractionPercent, 0.3);
  assert.equal(res.data.tradePlan?.positionLens.notionalPerEquity, 15);
  assert.match(res.data.tradePlan?.positionLens.summary ?? "", /不改变结构盈亏比/);
  assert.equal(
    res.data.reportSections
      .find((section) => section.key === "facts")
      ?.items.some((item) => item.sourceId === "v3:key-level:tia-r1"),
    true,
  );
  assert.equal(
    res.data.reportSections
      .find((section) => section.key === "supportive_evidence")
      ?.items.some((item) => item.sourceId === "v3:trend-context:scores"),
    true,
  );
  assert.equal(
    res.data.reportSections
      .find((section) => section.key === "supportive_evidence")
      ?.items.some((item) => item.sourceId === "v3:forward-level:tia-fwd-r1"),
    true,
  );
  assert.match(
    res.data.reportSections
      .find((section) => section.key === "trade_plan")
      ?.items.find((item) => item.sourceId === "trade-plan:confirmation-checklist")
      ?.detail ?? "",
    /突破 8\.28/,
  );
  assert.match(
    res.data.reportSections
      .find((section) => section.key === "trade_plan")
      ?.items.find((item) => item.sourceId === "trade-plan:position-lens")
      ?.detail ?? "",
    /个人仓位镜头/,
  );
  assert.match(
    res.data.reportSections
      .find((section) => section.key === "trade_plan")
      ?.items.find((item) => item.sourceId === "trade-plan:manual-review")
      ?.detail ?? "",
    /不自动下单/,
  );
});

test("buildFrontendTokenDossierContract turns late avoid-chase dossiers into review-only without a trade plan", () => {
  const dossier: SignalBackendDossier = {
    found: true,
    generatedAt: "2026-06-21T08:00:00.000Z",
    guardrails: ["report_is_translation_only"],
    symbol: "TIAUSDT",
    chart: {
      availableTimeframes: ["1h"],
      selectedTimeframe: "1h",
      tradingView: {
        interval: "1h",
        symbol: "BINANCE:TIAUSDT.P",
        url: "https://www.tradingview.com/chart/?symbol=BINANCE%3ATIAUSDT.P",
      },
    },
    evidence: {
      conflictingCount: 0,
      items: signal().evidence,
      neutralCount: 0,
      supportiveCount: 2,
      total: 3,
    },
    journal: {
      recentEvents: [],
      totalEvents: 0,
    },
    execution: {
      maxLeverage: 50,
      maxLeverageSource: "coinglass_instrument_tag",
    },
    signal: {
      confidence: 84,
      direction: "long",
      exchange: "BINANCE",
      id: "sig-tia",
      risk: "medium",
      state: "near_trigger",
      summary: "已经大幅拉升后出现追高风险",
      timeframe: "1h",
      updatedAt: "2026-06-21T08:00:00.000Z",
    },
    strategyV3: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      currentPrice: 9.8,
      forwardLevels: [],
      guardrails: ["research_only"],
      keyLevels: [],
      primaryTimeframe: "1h",
      source: "existing_ohlcv_key_level_mvp",
      sourceTimeframes: ["1h"],
      summary: "v3 关键位地图",
      symbol: "TIAUSDT",
      trendContext: {
        allowedUse: "research_only",
        canAutoAdjustWeights: false,
        canMutateLiveRanking: false,
        conflicts: [],
        decision: "AVOID_CHASE_LONG",
        guardrail: "只读趋势上下文",
        locationRiskReward: {
          allowedUse: "research_only",
          canAutoAdjustWeights: false,
          canMutateLiveRanking: false,
          currentPrice: 9.8,
          direction: "long",
          hasTradeSignal: false,
          isTradeEligible: true,
          minRewardRisk: 3,
          nearestTarget: 11.2,
          positionQuality: "CHASE_RISK",
          rewardRisk: 3.4,
          riskFlags: ["chase_risk"],
          stopDistance: 0.2,
          stopDistancePercent: 2.04,
          structuralStop: 9.6,
          summary: "位置已经偏追，等待回踩。",
          targetDistance: 1.4,
          targetDistancePercent: 14.29,
          targetLevelId: "tia-r1",
          stopLevelId: "tia-s1",
        },
        nextStep: "已经追高，只做复盘观察，等待重新回到结构位。",
        noParticipationReasons: ["位置/RR：当前位置偏追，等待回踩或反抽到更优区域。"],
        riskGate: {
          allowed: true,
          blockedBy: [],
          mode: "readonly_v3_risk_gate",
        },
        scores: {
          longPreTrendScore: 34,
          shortPreTrendScore: 12,
          longTrendEnergyScore: 82,
          shortTrendEnergyScore: 8,
          riskScore: 72,
          trendHoldScore: 32,
          exhaustionScore: 85,
        },
        state: "LONG_EXHAUSTION",
        summary: "多头衰竭/追高风险区。",
        timeframes: [],
        trendIntegrity: {
          allowedUse: "research_only",
          canAutoAdjustWeights: false,
          canMutateLiveRanking: false,
          direction: "long",
          evidence: ["上影线衰竭"],
          hasTradeSignal: false,
          integrityScore: 35,
          riskFlags: ["upper_wick_exhaustion"],
          status: "EXHAUSTION_RISK",
          summary: "趋势完整度进入衰竭风险。",
        },
      },
      tradePlan: {
        allowedUse: "research_only",
        blockedBy: [],
        canAutoAdjustWeights: false,
        canMutateLiveRanking: false,
        confirmationChecklist: ["等待回踩"],
        direction: "long",
        entryZone: "9.60 - 9.80",
        hasAutoExecution: false,
        invalidation: "跌回 9.20",
        isPlanEligible: true,
        manualReviewRequired: true,
        plannedEntryPrice: 9.7,
        positionSizing: "轻仓确认",
        rewardRisk: 3.4,
        status: "READY_LONG",
        structuralStop: 9.6,
        summary: "旧计划残留，不应在追高区展示为可交易。",
        takeProfitPlan: "等待",
        targets: [11.2],
      },
    },
  };

  const res = buildFrontendTokenDossierContract({
    dossier,
    basePrice: 9.8,
    now: new Date("2026-06-21T08:00:05.000Z"),
  });

  assert.equal(res.data.maturity, "BLOCKED");
  assert.equal(res.data.unifiedDecision.source, "unified_decision_engine");
  assert.equal(res.data.unifiedDecision.decision, "BLOCKED");
  assert.equal(res.data.tradePlan, null);
  assert.equal(res.data.riskGate.allowTradePlan, false);
  assert.equal(res.data.strategyReadiness.status, "review_only");
  assert.equal(res.data.strategyReadiness.canTradeNow, false);
  assert.equal(res.data.strategyReadiness.executionMap.tradabilityRead, "review_only");
  assert.equal(res.data.strategyReadiness.executionMap.positionQuality, "late");
  assert.ok(res.data.strategyReadiness.executionMap.waitFor.some((item) => /回踩|反抽/.test(item)));
  assert.match(res.data.strategyReadiness.summary, /晚到|延展/);
  assert.match(res.data.riskGate.reasons.join("；"), /复盘观察|追高|衰竭/);
  assert.match(
    res.data.reportSections.find((section) => section.key === "trade_plan")?.items[0]?.detail ?? "",
    /不得生成入场、止损、目标/,
  );
});

test("buildFrontendReviewContract returns review resources from journal and capability data", () => {
  const backend = backendContract();
  backend.scanProof.lightScan.topCandidates = [
    {
      baseAsset: "TIA",
      changePercent24h: 1.8,
      distanceFromHighPercent: 1.2,
      distanceFromLowPercent: 7.4,
      earlyOpportunityScore: 86,
      opportunityPhase: "early_setup",
      overextensionRisk: "low",
      price: 7.84,
      reasons: ["websocket_sliding_window", "volume_zscore_spike", "cvd_proxy_positive"],
      score: 91,
      state: "PRE_TREND",
      symbol: "TIAUSDT",
      volume24hUsd: 1_200_000,
      volumeSource: "rolling_window",
      volumeWindowMs: 900_000,
      volumeWindowUsd: 1_200_000,
      volatilityPercent: 2.1,
      microstructure: {
        bookAskUsd: 180_000,
        bookBidUsd: 520_000,
        bookImbalance: 0.4857,
        bookPressureSide: "buy",
        bookProxyQuality: "book_ticker_proxy",
        buyPressureUsd: 780_000,
        cvdProxyUsd: 560_000,
        largeBuyTradeUsd: 420_000,
        largeSellTradeUsd: 0,
        largeTakerTradeCount: 1,
        largeTakerTradeSide: "buy",
        largeTakerTradeUsd: 420_000,
        pressureSide: "buy",
        proxyQuality: "taker_trade_proxy",
        sellPressureUsd: 220_000,
        spreadBps: 2.1,
        tradeFlowImbalance: 0.4667,
      },
    },
    {
      baseAsset: "WIF",
      changePercent24h: 16.4,
      distanceFromHighPercent: 0.4,
      distanceFromLowPercent: 19.2,
      earlyOpportunityScore: 10,
      opportunityPhase: "late_move",
      overextensionRisk: "high",
      price: 1.82,
      reasons: ["price_impulse"],
      score: 72,
      state: "HOT",
      symbol: "WIFUSDT",
      volume24hUsd: 900_000,
      volatilityPercent: 6.2,
    },
  ];
  const review = buildFrontendReviewContract({
    backend,
    snapshot: snapshot(),
    now: new Date("2026-06-21T08:00:10.000Z"),
  });

  assert.equal(review.signalLifecycles.status, "live");
  assert.equal(review.signalLifecycles.data[0]?.symbol, "TIA");
  assert.equal(review.strategyArchetypes.status, "partial");
  assert.equal(review.strategyArchetypes.data.length > 0, true);
  assert.equal(review.strategyArchetypes.data[0]?.winRate, null);
  assert.equal(review.strategyArchetypes.data[0]?.avgRR, null);
  assert.equal(review.strategyArchetypes.data[0]?.samples, 0);
  assert.match(review.strategyArchetypes.data[0]?.commonFailure ?? "", /样本收集中/);
  assert.equal(review.missedDetections.status, "empty");
  assert.equal(review.evolutionSuggestions.data[0]?.adopted, false);
  assert.equal(review.reviewStats.status, "partial");
  assert.equal(review.reviewStats.data.totalSamples, 1);
  assert.equal(review.reviewStats.data.evidenceSamples, 1);
  assert.equal(review.reviewStats.data.winRate, null);
  assert.equal(review.discoveryReview.status, "partial");
  assert.equal(review.discoveryReview.data.totalLightCandidates, 2);
  assert.equal(review.discoveryReview.data.earlyOpportunityCount, 1);
  assert.equal(review.discoveryReview.data.lateMoveCount, 1);
  assert.equal(review.discoveryReview.data.cvdProxyCandidateCount, 1);
  assert.equal(review.discoveryReview.data.bookPressureCandidateCount, 1);
  assert.equal(review.discoveryReview.data.largeTakerTradeCandidateCount, 1);
  assert.equal(review.discoveryReview.data.calibration.status, "collecting");
  assert.equal(review.discoveryReview.data.calibration.earlyOutcomeLink, "ready");
  assert.equal(review.discoveryReview.data.calibration.lateSignalPenalty, "active");
  assert.ok(review.discoveryReview.data.calibration.notes.some((note) => /不自动改实时权重/.test(note)));
  assert.ok(review.discoveryReview.data.guardrails.some((rule) => /晚到涨跌榜样本/.test(rule)));
  assert.equal(review.opportunityCalibration.status, "partial");
  assert.equal(review.opportunityCalibration.data.schemaVersion, "opportunity-calibration.v1");
  assert.equal(review.opportunityCalibration.data.sampleGate.minClosedSamples, 30);
  assert.equal(review.opportunityCalibration.data.sampleGate.minMetricSamples, 15);
  assert.equal(review.opportunityCalibration.data.thresholds.minimumStructuralRR, 3);
  assert.ok(review.opportunityCalibration.data.segments.some((segment) => segment.key === "late_move"));
  assert.ok(review.opportunityCalibration.data.guardrails.some((rule) => /不自动改实时权重/.test(rule)));
  assert.equal(review.aiReviewStats.status, "empty");
  assert.equal(review.aiReviewStats.data.unboundFallbackProtected, true);
  assert.match(review.aiReviewStats.reason ?? "", /不替代规则引擎/);
});
