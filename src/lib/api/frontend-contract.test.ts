import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal } from "../analysis/types";
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
import type { SignalBackendDossier } from "../market/signal-backend-dossier";
import type { OhlcvProvider } from "../market/ohlcv/types";

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
    maturity: {
      canAttachTradePlan: true,
      canEnterMainSignalArea: true,
      canRequestAiReview: true,
      label: "计划就绪",
      reasons: ["eligible_v3_trade_plan"],
      stage: "TRADE_PLAN_READY",
    },
    ...overrides,
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
        guardrail: "扫描稳定性报告只用于运维诊断；不能直接生成交易信号。",
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

test("buildFrontendRadarContract exposes full-market proof and mature radar signals", () => {
  const radar = buildFrontendRadarContract({
    backend: backendContract(),
    snapshot: snapshot(),
    env: { COINGLASS_DAILY_REQUEST_BUDGET: "300" },
    now: new Date("2026-06-21T08:00:10.000Z"),
  });

  assert.equal(radar.scanProof.status, "live");
  assert.equal(radar.scanProof.data.totalMonitored, 820);
  assert.equal(radar.scanProof.data.scannable, 720);
  assert.equal(radar.scanProof.data.deepScanned, 24);
  assert.equal(radar.deepScanQueue.data.currentBatch.includes("TIA"), true);
  assert.equal(radar.radarSignals.data[0]?.symbol, "TIA");
  assert.equal(radar.radarSignals.data[0]?.direction, "多");
  assert.equal(radar.radarSignals.data[0]?.maturity, "TRADE_PLAN_READY");
  assert.equal(radar.radarSignals.data[0]?.rr, 3.2);
  assert.equal(radar.fundFlow.status, "partial");
  assert.equal(radar.fundFlow.data.canCreateTradeSignal, false);
  assert.equal(radar.fundFlow.data.takerBuySellAvailable, false);
  assert.equal(radar.derivatives.data.takerBuySellStatus, "not_connected");
  assert.equal(radar.scanStability.status, "live");
  assert.equal(radar.scanStability.data.status, "healthy");
  assert.match(radar.scanStability.reason ?? "", /不能直接生成交易信号/);
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
});

test("buildFrontendLeaderboardContract falls back to public light scan candidates when tickers are absent", () => {
  const backend = backendContract();
  backend.scanProof.allocation.pendingAssets.push("POWER");
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

  assert.equal(volume.status, "live");
  assert.equal(volume.data[0]?.symbol, "POWER");
  assert.equal(volume.data[0]?.price, 0.42);
  assert.equal(volume.data[0]?.value, 58_000_000);
  assert.equal(volume.data[0]?.inCandidatePool, true);
  assert.equal(volume.data[0]?.hasSignal, false);
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
    signal: {
      confidence: 84,
      direction: "long",
      exchange: "BINANCE",
      id: "sig-tia",
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
  assert.equal(res.data.maturity, "EVIDENCE_SIGNAL");
  assert.equal(res.data.tradePlan, null);
  assert.equal(res.data.riskGate.allowTradePlan, false);
  assert.match(res.data.riskGate.reasons.join("；"), /等待后端结构化交易计划/);
  assert.equal(res.data.aiReview.note.includes("AI 仅对反证进行复核"), true);
  assert.equal(res.data.structures.every((item) => item.support === 0 && item.resistance === 0), true);
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
    signal: {
      confidence: 84,
      direction: "long",
      exchange: "BINANCE",
      id: "sig-tia",
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
    signal: {
      confidence: 84,
      direction: "long",
      exchange: "BINANCE",
      id: "sig-tia",
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
      keyLevels: [],
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
        confirmationChecklist: ["突破 8.28", "回踩不破 8.20"],
        direction: "long",
        entryZone: "8.20 - 8.28",
        hasAutoExecution: false,
        invalidation: "1h 跌回 7.76",
        isPlanEligible: true,
        manualReviewRequired: true,
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
  assert.equal(res.data.riskGate.allowTradePlan, true);
  assert.deepEqual(res.data.riskGate.reasons, []);
  assert.equal(res.data.tradePlan?.bias, "多");
  assert.equal(res.data.tradePlan?.entryCondition, "8.20 - 8.28");
  assert.match(res.data.tradePlan?.stop ?? "", /7\.76/);
  assert.equal(res.data.tradePlan?.tp1, "8.6");
  assert.equal(res.data.tradePlan?.tp2, "9.15");
  assert.equal(res.data.tradePlan?.tp3, "10.2");
  assert.equal(res.data.tradePlan?.rr, 3.4);
  assert.equal(res.data.tradePlan?.allowChase, false);
});

test("buildFrontendReviewContract returns review resources from journal and capability data", () => {
  const review = buildFrontendReviewContract({
    backend: backendContract(),
    snapshot: snapshot(),
    now: new Date("2026-06-21T08:00:10.000Z"),
  });

  assert.equal(review.signalLifecycles.status, "live");
  assert.equal(review.signalLifecycles.data[0]?.symbol, "TIA");
  assert.equal(review.strategyArchetypes.data.length > 0, true);
  assert.equal(review.evolutionSuggestions.data[0]?.adopted, false);
  assert.equal(review.reviewStats.data.totalSamples, 1);
  assert.equal(review.reviewStats.data.evidenceSamples, 1);
  assert.equal(review.reviewStats.data.winRate, null);
  assert.equal(review.aiReviewStats.data.unboundFallbackProtected, true);
  assert.match(review.aiReviewStats.reason ?? "", /不替代规则引擎/);
});
