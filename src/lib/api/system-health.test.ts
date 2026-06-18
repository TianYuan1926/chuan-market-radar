import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseClientDiagnostics } from "../persistence/database-client";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import { buildSystemHealthReport } from "./system-health";
import type { MarketRadarSnapshot, ScanArchiveSummary, ScanReplayFrame } from "../market/types";
import type { StrategyV3Dossier } from "../analysis/v3/types";

function snapshot(
  metadata: Partial<MarketRadarSnapshot["metadata"]> = {},
): MarketRadarSnapshot {
  return {
    metadata: {
      id: "scan-health",
      mode: "demo",
      status: "ready",
      source: "mock",
      isRealtime: false,
      cadenceMinutes: 15,
      scannedCount: 24,
      anomalyCount: 4,
      candidateCount: 4,
      riskGate: "on",
      generatedAt: "2026-06-12T10:00:00.000Z",
      nextScanAt: "2026-06-12T10:15:00.000Z",
      staleAfterMinutes: 30,
      notes: ["演示数据", "scan runtime: updated from Demo Market Provider"],
      ...metadata,
    },
    instrumentPool: {
      instruments: [],
      rejected: [],
      summary: {
        total: 29,
        accepted: 24,
        rejected: 4,
        duplicatesRemoved: 1,
        minVolume24hUsd: 5_000_000,
        quoteAssets: ["USDT"],
        marketTypes: ["perpetual"],
      },
    },
    instruments: [],
    tickers: [],
    derivatives: [],
    heatmap: [],
    signals: [],
    journalEvents: [],
  };
}

function archiveSummary(overrides: Partial<ScanArchiveSummary> = {}): ScanArchiveSummary {
  return {
    id: "scan-health",
    source: "mock",
    status: "ready",
    generatedAt: "2026-06-12T10:00:00.000Z",
    scannedCount: 24,
    anomalyCount: 4,
    candidateCount: 4,
    topSymbols: ["ENAUSDT"],
    notes: ["演示数据"],
    ...overrides,
  };
}

function replayFrame(): ScanReplayFrame {
  return {
    id: "scan-health",
    source: "mock",
    status: "ready",
    generatedAt: "2026-06-12T10:00:00.000Z",
    nextScanAt: "2026-06-12T10:15:00.000Z",
    cadenceMinutes: 15,
    scannedCount: 24,
    anomalyCount: 4,
    candidateCount: 4,
    signals: [],
  };
}

function strategyV3Dossier(): StrategyV3Dossier {
  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    currentPrice: 100,
    forwardLevels: [
      {
        id: "ENAUSDT-current-defense-s1",
        symbol: "ENAUSDT",
        side: "SUPPORT",
        role: "CURRENT_DEFENSE",
        zoneLow: 94,
        zoneHigh: 96,
        timeframeWeight: 4,
        keyScore: 82,
        status: "AHEAD",
        reasons: ["4h swing low"],
        confirmationRules: ["15m reclaim zoneHigh"],
        invalidationRules: ["1h close below zoneLow"],
        sourceLevelIds: ["ENAUSDT-4h-swing-low"],
      },
    ],
    guardrails: ["manual review only"],
    keyLevels: [
      {
        id: "ENAUSDT-4h-swing-low",
        symbol: "ENAUSDT",
        timeframe: "4h",
        type: "SWING_LOW",
        zoneLow: 94,
        zoneHigh: 96,
        midPrice: 95,
        direction: "SUPPORT",
        keyScore: 80,
        reactionScore: 40,
        confluenceScore: 72,
        status: "POTENTIAL",
        reasons: ["4h swing low"],
        confirmationRules: ["reclaim 96"],
        invalidationRule: "close below 94",
      },
    ],
    primaryTimeframe: "4h",
    source: "existing_ohlcv_key_level_mvp",
    sourceTimeframes: ["15m", "1h", "4h"],
    summary: "Readonly v3 map.",
    symbol: "ENAUSDT",
  };
}

function v3ReplayFrame(): ScanReplayFrame {
  return {
    ...replayFrame(),
    id: "scan-health-v3",
    generatedAt: "2026-06-12T09:00:00.000Z",
    signals: [
      {
        id: "ena-v3-signal",
        symbol: "ENAUSDT",
        direction: "long",
        state: "near_trigger",
        timeframe: "15m",
        confidence: 80,
        risk: "medium",
        riskReward: 3.4,
        strategyStatus: "waiting",
        strategyV3: strategyV3Dossier(),
        updatedAt: "2026-06-12T09:00:00.000Z",
        summary: "v3 test signal",
      },
    ],
  };
}

test("buildSystemHealthReport marks mock and memory mode as a visible preview state", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  await repository.addScanArchive(archiveSummary(), replayFrame());

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T10:04:30.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.level, "preview");
  assert.equal(report.dataSource.mode, "demo");
  assert.equal(report.dataSource.activeSource, "mock");
  assert.equal(report.dataSource.configuredProvider, "mock");
  assert.equal(report.persistence.mode, "memory");
  assert.equal(report.persistence.durable, false);
  assert.equal(report.archive.entries, 1);
  assert.equal(report.scan.freshness, "fresh");
  assert.equal(report.scan.ageMinutes, 5);
  assert.deepEqual(report.guards.map((guard) => guard.id), [
    "data-source",
    "persistence",
    "freshness",
    "archive",
  ]);
});

test("buildSystemHealthReport reports a degraded provider when CoinGlass is requested without a key", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "coinglass" },
    now: new Date("2026-06-12T10:02:00.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.level, "degraded");
  assert.equal(report.dataSource.configuredProvider, "coinglass");
  assert.equal(report.dataSource.status, "missing_key");
  assert.match(report.dataSource.detail, /COINGLASS_API_KEY/);
  assert.equal(report.guards.find((guard) => guard.id === "data-source")?.state, "degraded");
});

test("buildSystemHealthReport exposes database fallback diagnostics instead of hiding them behind memory mode", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "chuan-public" });
  const database: DatabaseClientDiagnostics = {
    connectionStringEnv: "DATABASE_URL",
    detail: "检测到 DATABASE_URL，但还没有注入服务端 SQL client，当前安全回落到内存存储。",
    driver: "neon",
    durable: false,
    hasDatabaseUrl: true,
    reason: "sql_client_missing",
    scope: "chuan-public",
    status: "fallback",
  };

  const report = await buildSystemHealthReport({
    database,
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T10:04:30.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.persistence.databaseStatus, "fallback");
  assert.equal(report.persistence.databaseDriver, "neon");
  assert.equal(report.persistence.databaseReason, "sql_client_missing");
  assert.match(report.persistence.detail, /SQL client/);
  assert.match(
    report.guards.find((guard) => guard.id === "persistence")?.detail ?? "",
    /SQL client/,
  );
});

test("buildSystemHealthReport escalates stale scans past the stale window", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T10:45:00.000Z"),
    repository,
    snapshot: snapshot({
      status: "stale",
      generatedAt: "2026-06-12T10:00:00.000Z",
      staleAfterMinutes: 30,
    }),
  });

  assert.equal(report.level, "degraded");
  assert.equal(report.scan.freshness, "expired");
  assert.equal(report.scan.ageMinutes, 45);
  assert.equal(report.guards.find((guard) => guard.id === "freshness")?.state, "degraded");
});

test("buildSystemHealthReport exposes scan operation timing and provider notes", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  await repository.addScanArchive(
    archiveSummary({
      id: "scan-ready",
      status: "ready",
      generatedAt: "2026-06-12T10:00:00.000Z",
      notes: ["ready archive"],
    }),
    replayFrame(),
  );
  await repository.addScanArchive(
    archiveSummary({
      id: "scan-failed",
      status: "failed",
      generatedAt: "2026-06-12T09:45:00.000Z",
      notes: ["provider failed"],
    }),
    replayFrame(),
  );

  const report = await buildSystemHealthReport({
    env: {
      COINGLASS_API_KEY: "test-key",
      MARKET_DATA_PROVIDER: "coinglass",
    },
    now: new Date("2026-06-12T10:04:20.000Z"),
    repository,
    snapshot: snapshot({
      source: "coinglass",
      isRealtime: true,
      generatedAt: "2026-06-12T10:00:00.000Z",
      nextScanAt: "2026-06-12T10:15:00.000Z",
      notes: [
        "batch 2/3: ENA,SUI,ONDO",
        "requests 3/7, next batch 3",
        "scan runtime: updated from CoinGlass",
      ],
    }),
  });

  assert.equal(report.operations.verdict, "healthy");
  assert.equal(report.operations.lastSuccessfulScanAt, "2026-06-12T10:00:00.000Z");
  assert.equal(report.operations.lastProblemScanAt, "2026-06-12T09:45:00.000Z");
  assert.equal(report.operations.minutesUntilNextScan, 11);
  assert.equal(report.operations.minutesUntilStale, 26);
  assert.equal(report.operations.recentSuccessCount, 1);
  assert.equal(report.operations.recentProblemCount, 1);
  assert.equal(report.operations.batchDetail, "batch 2/3: ENA,SUI,ONDO");
  assert.equal(report.operations.requestDetail, "requests 3/7, next batch 3");
  assert.equal(report.operations.runtimeDetail, "scan runtime: updated from CoinGlass");
});

test("buildSystemHealthReport exposes structured universe coverage", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });

  const report = await buildSystemHealthReport({
    env: {
      COINGLASS_API_KEY: "test-key",
      MARKET_DATA_PROVIDER: "coinglass",
    },
    now: new Date("2026-06-12T10:04:20.000Z"),
    repository,
    snapshot: snapshot({
      source: "coinglass",
      isRealtime: true,
      notes: [
        "quality filter: raw 10, clean 5, primary 1",
        "quality rejections: unsupported_exchange 2, quote_not_supported 3, duplicate_symbol 4",
      ],
      quota: {
        cadenceMinutes: 15,
        coinGlassBudgetUsagePercent: 96,
        coinGlassDailyRequestBudget: 300,
        coinGlassRemainingDailyRequestEstimate: 12,
        coinGlassRequestsPerDayEstimate: 288,
        coinGlassRequestsPerScan: 3,
        effectiveBatchSize: 3,
        maxCoinGlassRequestsPerScan: 3,
        minimumRequestsPerScan: 3,
        publicDiscoveryRequestsPerDayEstimate: 96,
        publicDiscoveryRequestsPerScan: 1,
        requestedBatchSize: 7,
        status: "near_budget",
        warningUsagePercent: 80,
        wasCapped: true,
        windowsPerDay: 96,
      },
      coverage: {
        batchIndex: 1,
        coveragePercent: 60,
        eligible: 5,
        exchangeCoverageSummary: {
          majorThree: 2,
          multiExchange: 1,
          singleExchange: 2,
          unlisted: 0,
        },
        nextBatchIndex: 2,
        pending: 2,
        pendingAssets: ["SOL", "SUI"],
        scanned: 3,
        scannedAssets: ["BTC", "ETH", "ENA"],
        selectedTierCounts: {
          active: 0,
          anchor: 2,
          core: 1,
          long_tail: 0,
        },
        skipped: 1,
        skippedAssets: [{ symbol: "OLDUSDT", reason: "inactive" }],
        tierCounts: {
          active: 1,
          anchor: 2,
          core: 2,
          long_tail: 0,
        },
        tierPolicy: {
          activeEveryWindows: 3,
          longTailEveryWindows: 8,
        },
        total: 6,
        totalBatches: 3,
      },
    }),
  });

  assert.equal(report.coverage.coveragePercent, 60);
  assert.equal(report.coverage.scanned, 3);
  assert.equal(report.coverage.pending, 2);
  assert.equal(report.coverage.skipped, 1);
  assert.deepEqual(report.coverage.scannedAssets, ["BTC", "ETH", "ENA"]);
  assert.equal(report.scanEconomy.mode, "scan_economy_mvp");
  assert.equal(report.scanEconomy.budget.configuredDailyRequestBudget, 300);
  assert.equal(report.scanEconomy.budget.estimatedRequestsPerScan, 3);
  assert.equal(report.scanEconomy.budget.estimatedDailyRequests, 288);
  assert.equal(report.scanEconomy.budget.estimatedRemainingDailyRequests, 12);
  assert.equal(report.scanEconomy.budget.wasCapped, true);
  assert.equal(report.scanEconomy.budget.requestedBatchSize, 7);
  assert.equal(report.scanEconomy.budget.effectiveBatchSize, 3);
  assert.equal(report.scanEconomy.tiers.anchor.total, 2);
  assert.equal(report.scanEconomy.tiers.anchor.selected, 2);
  assert.equal(report.scanEconomy.tiers.core.total, 2);
  assert.equal(report.scanEconomy.tiers.core.selected, 1);
  assert.equal(report.scanEconomy.tiers.active.total, 1);
  assert.equal(report.scanEconomy.tiers.longTail.total, 0);
  assert.equal(report.scanEconomy.tiers.skipped, 1);
  assert.equal(report.scanEconomy.nextTier, "core");
  assert.match(report.scanEconomy.operatorHint, /预算接近上限/);
  assert.match(report.scanEconomy.guardrail, /不会增加 CoinGlass 请求/);
  assert.equal(report.fullMarketCoverage.mode, "full_market_coverage_depth_mvp");
  assert.equal(report.fullMarketCoverage.status, "budget_capped");
  assert.equal(report.fullMarketCoverage.coverage.batchLabel, "2/3");
  assert.equal(report.fullMarketCoverage.coverage.nextBatchLabel, "3/3");
  assert.equal(report.fullMarketCoverage.coverage.estimatedFullCycleMinutes, 45);
  assert.equal(report.fullMarketCoverage.exchangeQuality.majorThreePercent, 40);
  assert.equal(report.fullMarketCoverage.lanes.length, 5);
  assert.equal(report.fullMarketCoverage.lanes.find((lane) => lane.id === "core")?.pending, 1);
  assert.deepEqual(report.fullMarketCoverage.samples.scannedAssets, ["BTC", "ETH", "ENA"]);
  assert.deepEqual(report.fullMarketCoverage.samples.pendingAssets, ["SOL", "SUI"]);
  assert.match(report.fullMarketCoverage.samples.rejectedAssets[0], /OLDUSDT:inactive/);
  assert.match(report.fullMarketCoverage.operatorHint, /预算压缩轮转/);
  assert.match(report.fullMarketCoverage.priorityExplanation, /长尾资产/);
  assert.match(report.fullMarketCoverage.guardrails.join(" "), /不会触发额外 CoinGlass 请求/);
  assert.equal(report.marketDataQuality.mode, "market_data_quality_mvp");
  assert.equal(report.marketDataQuality.status, "degraded");
  assert.equal(report.marketDataQuality.filters.rawRows, 10);
  assert.equal(report.marketDataQuality.filters.cleanRows, 5);
  assert.equal(report.marketDataQuality.filters.primaryRows, 1);
  assert.equal(report.marketDataQuality.filters.unsupportedExchange, 2);
  assert.equal(report.marketDataQuality.filters.quoteNotSupported, 3);
  assert.equal(report.marketDataQuality.filters.duplicateSymbolCount, 4);
  assert.equal(report.marketDataQuality.filters.acceptedPool, 24);
  assert.equal(report.marketDataQuality.filters.rejectedPool, 4);
  assert.ok(report.marketDataQuality.qualityScore < 65);
  assert.deepEqual(
    report.marketDataQuality.issues.map((issue) => issue.label),
    ["未知交易所", "报价不支持", "重复币种", "池过滤"],
  );
  assert.match(report.marketDataQuality.operatorHint, /数据清洗/);
  assert.match(report.marketDataQuality.guardrails.join(" "), /不能单独生成交易方向/);
});

test("buildSystemHealthReport marks scan operations blocked without a recent success", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  await repository.addScanArchive(
    archiveSummary({
      id: "scan-failed",
      status: "failed",
      generatedAt: "2026-06-12T10:00:00.000Z",
      notes: ["provider failed"],
    }),
    replayFrame(),
  );

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T10:05:00.000Z"),
    repository,
    snapshot: snapshot({
      status: "failed",
      generatedAt: "2026-06-12T10:00:00.000Z",
      notes: ["scan runtime: provider failed before cache"],
    }),
  });

  assert.equal(report.operations.verdict, "blocked");
  assert.equal(report.operations.lastSuccessfulScanAt, null);
  assert.equal(report.operations.lastProblemScanAt, "2026-06-12T10:00:00.000Z");
  assert.equal(report.operations.recentSuccessCount, 0);
  assert.equal(report.operations.recentProblemCount, 1);
  assert.match(report.operations.operatorHint, /没有成功扫描/);
});

test("buildSystemHealthReport exposes outcome executor coverage from journal events", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  await repository.addJournalEvent({
    id: "journal-ena-track",
    signalId: "ena-plan",
    symbol: "ENAUSDT",
    title: "纸面跟踪计划",
    result: "watching",
    note: "等待复盘。",
    rankDelta: 0,
    createdAt: "2026-06-12T10:00:00.000Z",
    action: "paper_trade",
    reviewStatus: "tracking",
    outcomeStatus: "pending",
    plannedReviewAt: "2026-06-12T11:00:00.000Z",
    reviewCheckpoints: [
      {
        id: "1h",
        label: "1h 误报检查",
        reviewAt: "2026-06-12T11:00:00.000Z",
        status: "pending",
      },
    ],
  });
  await repository.addJournalEvent({
    id: "journal-sol-lifecycle",
    signalId: "sol-plan",
    symbol: "SOLUSDT",
    title: "目标前置命中复盘",
    result: "win",
    note: "首目标已到。",
    rankDelta: 2,
    createdAt: "2026-06-12T10:30:00.000Z",
    action: "paper_trade",
    reviewStatus: "closed",
    outcomeStatus: "partial_win",
    firstTargetHit: true,
  });

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T11:10:00.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.outcomes.mode, "outcome_executor_mvp");
  assert.equal(report.outcomes.allowedUse, "research_only");
  assert.equal(report.outcomes.canAutoAdjustWeights, false);
  assert.equal(report.outcomes.strategyWeightActivationGate.mode, "strategy_weight_activation_gate_mvp");
  assert.equal(report.outcomes.strategyWeightActivationGate.activationMode, "disabled");
  assert.equal(report.outcomes.strategyWeightActivationGate.status, "active_disabled_by_config");
  assert.equal(report.outcomes.strategyWeightActivationGate.canAffectLiveSignals, false);
  assert.equal(report.outcomes.strategyWeightActivationGate.canWriteRuleWeights, false);
  assert.match(report.outcomes.strategyWeightActivationGate.nextStep, /配置关闭/);
  assert.equal(report.outcomes.trackingEvents, 2);
  assert.equal(report.outcomes.pendingEvents, 1);
  assert.equal(report.outcomes.closedEvents, 1);
  assert.equal(report.outcomes.dueEvents, 1);
  assert.equal(report.outcomes.coveragePercent, 50);
  assert.equal(report.outcomes.latestOutcomeAt, "2026-06-12T10:30:00.000Z");
  assert.equal(report.outcomes.status, "reviewing");
  assert.match(report.outcomes.operatorHint, /自动复盘/);
});

test("buildSystemHealthReport exposes the latest outcome executor run summary", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  await repository.addJournalEvent({
    id: "journal-outcome-executor-2026-06-12t10-30-00-000z",
    symbol: "OUTCOME_EXECUTOR",
    title: "自动复盘执行批次",
    result: "watching",
    note: "自动复盘执行：扫描 24，到期 3，写回 1，跳过 2，失败 1。",
    rankDelta: 0,
    createdAt: "2026-06-12T10:30:00.000Z",
    action: "outcome_executor_run",
    reviewStatus: "closed",
    source: "outcome_executor",
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    outcomeExecutorRun: {
      dueEvents: 3,
      failedFetches: 1,
      failures: [
        {
          eventId: "journal-tia-track",
          signalId: "tia-plan",
          symbol: "TIAUSDT",
          reason: "network",
          error: "upstream request failed with a long provider error",
        },
      ],
      fetchedCandles: 180,
      scannedEvents: 24,
      skippedReasons: [
        {
          code: "ohlcv_unavailable",
          count: 1,
          label: "行情请求失败",
          symbols: ["TIAUSDT"],
        },
      ],
      skippedEvents: 2,
      writtenEvents: 1,
    },
  });

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T11:10:00.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.outcomes.latestRunAt, "2026-06-12T10:30:00.000Z");
  assert.deepEqual(report.outcomes.lastRun, {
    dueEvents: 3,
    failedFetches: 1,
    failureReasons: ["TIAUSDT:network"],
    fetchedCandles: 180,
    ranAt: "2026-06-12T10:30:00.000Z",
    scannedEvents: 24,
    skippedEvents: 2,
    writtenEvents: 1,
  });
  assert.match(report.outcomes.operatorHint, /失败/);
});

test("buildSystemHealthReport exposes v3 forward map review executor status", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  await repository.addScanArchive(
    archiveSummary({
      id: "scan-health-v3",
      generatedAt: "2026-06-12T09:00:00.000Z",
      topSymbols: ["ENAUSDT"],
    }),
    v3ReplayFrame(),
  );
  await repository.addJournalEvent({
    id: "journal-v3-forward-map-review-run",
    symbol: "V3_FORWARD_MAP_REVIEW",
    title: "v3 Forward Map 复盘执行批次",
    result: "watching",
    note: "v3 Forward Map 复盘执行：扫描 3，完成 1，写回 2，跳过 1，失败 1。",
    rankDelta: 0,
    createdAt: "2026-06-12T10:45:00.000Z",
    action: "trend_radar_review_run",
    reviewStatus: "closed",
    source: "trend_radar_review_executor",
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    trendRadarReviewRun: {
      failedFetches: 1,
      failures: [
        {
          error: "upstream timeout",
          reason: "network",
          scanId: "scan-health-v3",
          signalId: "tia-v3-signal",
          symbol: "TIAUSDT",
        },
      ],
      fetchedCandles: 180,
      reviewedSnapshots: 1,
      scannedSnapshots: 3,
      skippedReasons: [
        {
          code: "ohlcv_unavailable",
          count: 1,
          label: "行情请求失败",
          symbols: ["TIAUSDT"],
        },
      ],
      skippedSnapshots: 1,
      writtenEvents: 2,
    },
  });

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T11:10:00.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.v3ForwardMapReviews.mode, "v3_forward_map_review_health_mvp");
  assert.equal(report.v3ForwardMapReviews.allowedUse, "research_only");
  assert.equal(report.v3ForwardMapReviews.canAutoAdjustWeights, false);
  assert.equal(report.v3ForwardMapReviews.savedSnapshots, 1);
  assert.equal(report.v3ForwardMapReviews.storageStatus, "ready");
  assert.equal(report.v3ForwardMapReviews.latestRunAt, "2026-06-12T10:45:00.000Z");
  assert.equal(report.v3ForwardMapReviews.status, "attention");
  assert.deepEqual(report.v3ForwardMapReviews.lastRun, {
    failedFetches: 1,
    failureReasons: ["TIAUSDT:network"],
    fetchedCandles: 180,
    ranAt: "2026-06-12T10:45:00.000Z",
    reviewedSnapshots: 1,
    scannedSnapshots: 3,
    skippedReasons: [
      {
        code: "ohlcv_unavailable",
        count: 1,
        label: "行情请求失败",
        symbols: ["TIAUSDT"],
      },
    ],
    skippedSnapshots: 1,
    writtenEvents: 2,
  });
  assert.match(report.v3ForwardMapReviews.operatorHint, /失败/);
});

test("buildSystemHealthReport exposes readonly v3 strategy loop coverage", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });

  for (let index = 0; index < 5; index += 1) {
    await repository.addJournalEvent({
      id: `journal-v3-loop-${index}`,
      signalId: `ena-v3-loop-${index}`,
      symbol: "ENAUSDT",
      title: "v3 计划复盘样本",
      result: index < 4 ? "win" : "loss",
      note: "v3 pattern/trade sample.",
      rankDelta: 0,
      createdAt: `2026-06-12T10:0${index}:00.000Z`,
      action: "paper_trade",
      reviewStatus: "closed",
      outcomeStatus: index < 4 ? "partial_win" : "loss",
      lessons: ["still_tracking", "v3_trade_READY_LONG", "v3_pattern_context", "v3_pattern_DOUBLE_BOTTOM"],
    });
  }

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T11:10:00.000Z"),
    repository,
    snapshot: {
      ...snapshot(),
      signals: [
        {
          id: "ena-v3-loop-signal",
          symbol: "ENAUSDT",
          exchange: "BINANCE",
          direction: "long",
          state: "near_trigger",
          timeframe: "15m",
          regime: "risk_on",
          confidence: 80,
          risk: "medium",
          evidence: [],
          strategy: {
            bias: "long",
            entry: "wait reclaim",
            invalidation: "close below support",
            positionHint: "paper only",
            riskReward: 3.4,
            status: "waiting",
            targets: ["target 1"],
          },
          strategyV3: strategyV3Dossier(),
          updatedAt: "2026-06-12T10:00:00.000Z",
          summary: "v3 loop signal",
        },
      ],
    },
  });

  assert.equal(report.v3StrategyLoop.mode, "v3_strategy_loop_mvp");
  assert.equal(report.v3StrategyLoop.allowedUse, "research_only");
  assert.equal(report.v3StrategyLoop.canAutoAdjustWeights, false);
  assert.equal(report.v3StrategyLoop.canMutateLiveRanking, false);
  assert.equal(report.v3StrategyLoop.status, "ready_for_manual_review");
  assert.equal(report.v3StrategyLoop.live.totalSignals, 1);
  assert.equal(report.v3StrategyLoop.live.v3Signals, 1);
  assert.equal(report.v3StrategyLoop.live.missingV3Signals, 0);
  assert.equal(report.v3StrategyLoop.live.keyLevels, 1);
  assert.equal(report.v3StrategyLoop.live.forwardLevels, 1);
  assert.equal(report.v3StrategyLoop.review.sampleCount, 5);
  assert.equal(report.v3StrategyLoop.review.closedSamples, 5);
  assert.equal(report.v3StrategyLoop.review.topPatternLabel, "双底");
  assert.equal(report.v3StrategyLoop.review.topTradePlanLabel, "多头就绪");
  assert.equal(report.v3StrategyLoop.candidates[0]?.symbol, "ENAUSDT");
  assert.match(report.v3StrategyLoop.guardrail, /不能自动下单/);
  assert.match(report.v3StrategyLoop.operatorHint, /人工查看|人工校准|可复核/);
  assert.equal(report.strategyEvolutionLoop.mode, "strategy_evolution_loop_mvp");
  assert.equal(report.strategyEvolutionLoop.allowedUse, "research_only");
  assert.equal(report.strategyEvolutionLoop.canAutoAdjustWeights, false);
  assert.equal(report.strategyEvolutionLoop.canMutateLiveRanking, false);
  assert.equal(report.strategyEvolutionLoop.canWriteRuleWeights, false);
  assert.equal(report.strategyEvolutionLoop.status, "manual_review_ready");
  assert.ok(report.strategyEvolutionLoop.readinessScore >= 30);
  assert.equal(report.strategyEvolutionLoop.stages.find((stage) => stage.id === "v3_live")?.status, "ready");
  assert.equal(report.strategyEvolutionLoop.stages.find((stage) => stage.id === "outcome_samples")?.count, 5);
  assert.match(report.strategyEvolutionLoop.guardrail, /不能自动下单/);
  assert.match(report.strategyEvolutionLoop.operatorHint, /人工复核/);
});

test("buildSystemHealthReport keeps the site available when v3 forward map storage is not migrated", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  const repositoryWithMissingV3Table = {
    ...repository,
    async listV3ForwardMapSnapshots() {
      throw new Error('relation "v3_forward_map_snapshots" does not exist');
    },
  };

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T11:10:00.000Z"),
    repository: repositoryWithMissingV3Table,
    snapshot: snapshot(),
  });

  assert.equal(report.v3ForwardMapReviews.savedSnapshots, 0);
  assert.equal(report.v3ForwardMapReviews.status, "idle");
  assert.equal(report.v3ForwardMapReviews.storageStatus, "unavailable");
  assert.match(report.v3ForwardMapReviews.storageDetail, /v3_forward_map_snapshots/);
  assert.match(report.v3ForwardMapReviews.operatorHint, /迁移/);
});

test("buildSystemHealthReport segments outcome sample quality without enabling automatic weights", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  const baseEvent = {
    note: "样本复盘。",
    rankDelta: 0,
    result: "watching" as const,
    reviewStatus: "closed" as const,
    title: "生命周期复盘",
  };

  await repository.addJournalEvent({
    ...baseEvent,
    id: "journal-win",
    signalId: "win-plan",
    symbol: "ENAUSDT",
    createdAt: "2026-06-12T10:00:00.000Z",
    outcomeStatus: "partial_win",
    result: "win",
  });
  await repository.addJournalEvent({
    ...baseEvent,
    id: "journal-saved",
    signalId: "saved-plan",
    symbol: "SOLUSDT",
    createdAt: "2026-06-12T10:05:00.000Z",
    outcomeStatus: "saved",
    result: "saved",
  });
  await repository.addJournalEvent({
    ...baseEvent,
    id: "journal-loss",
    signalId: "loss-plan",
    symbol: "TIAUSDT",
    createdAt: "2026-06-12T10:10:00.000Z",
    outcomeStatus: "loss",
    result: "loss",
  });
  await repository.addJournalEvent({
    ...baseEvent,
    id: "journal-expired",
    signalId: "expired-plan",
    symbol: "ONDOUSDT",
    createdAt: "2026-06-12T10:15:00.000Z",
    outcomeStatus: "expired",
  });
  await repository.addJournalEvent({
    id: "journal-pending",
    signalId: "pending-plan",
    symbol: "SUIUSDT",
    title: "纸面跟踪计划",
    result: "watching",
    note: "等待复查。",
    rankDelta: 0,
    createdAt: "2026-06-12T10:20:00.000Z",
    outcomeStatus: "pending",
    reviewStatus: "tracking",
  });

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T11:10:00.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.deepEqual(report.outcomes.sampleQuality, {
    autoWeightEligible: false,
    expiredEvents: 1,
    failedEvents: 1,
    manualReviewReady: false,
    pendingEvents: 1,
    status: "collecting",
    validatedEvents: 2,
  });
});

test("buildSystemHealthReport exposes the read-only calibration flow through manual confirmation and rollback", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  const baseEvent = {
    note: "样本复盘。",
    rankDelta: 0,
    result: "watching" as const,
    reviewStatus: "closed" as const,
    title: "生命周期复盘",
  };

  for (let index = 0; index < 8; index += 1) {
    await repository.addJournalEvent({
      ...baseEvent,
      id: `flow-valid-${index}`,
      signalId: `flow-valid-plan-${index}`,
      symbol: `FLOWVALID${index}USDT`,
      createdAt: `2026-06-12T10:0${index}:00.000Z`,
      outcomeStatus: index % 2 === 0 ? "partial_win" : "saved",
      result: index % 2 === 0 ? "win" : "saved",
    });
  }

  for (let index = 0; index < 4; index += 1) {
    await repository.addJournalEvent({
      ...baseEvent,
      id: `flow-counter-${index}`,
      signalId: `flow-counter-plan-${index}`,
      symbol: `FLOWCOUNTER${index}USDT`,
      createdAt: `2026-06-12T10:1${index}:00.000Z`,
      outcomeStatus: index % 2 === 0 ? "loss" : "expired",
      result: index % 2 === 0 ? "loss" : "watching",
    });
  }

  await repository.addJournalEvent({
    action: "calibration_review",
    allowedUse: "research_only",
    calibrationTag: "review_volume_oi_weight",
    canAutoAdjustWeights: false,
    createdAt: "2026-06-12T10:30:00.000Z",
    id: "flow-calibration-pending",
    note: "规则校准复盘样本。",
    outcomeStatus: "pending",
    rankDelta: 0,
    result: "watching",
    reviewStatus: "tracking",
    source: "daily_mover_calibration",
    symbol: "SUIUSDT",
    title: "规则校准复盘",
  });
  await repository.addJournalEvent({
    action: "strategy_confirmation",
    allowedUse: "research_only",
    calibrationTag: "review_volume_oi_weight",
    canAutoAdjustWeights: false,
    createdAt: "2026-06-12T11:00:00.000Z",
    id: "flow-strategy-confirmation",
    note: "人工确认策略版本。",
    rankDelta: 0,
    result: "watching",
    reviewStatus: "closed",
    source: "strategy_version_confirmation",
    strategyDraftId: "strategy-review_volume_oi_weight",
    strategyTag: "review_volume_oi_weight",
    strategyVersionLabel: "draft-volume-oi-weight-v1",
    symbol: "STRATEGY",
    title: "策略版本人工确认",
  });

  for (let index = 0; index < 3; index += 1) {
    await repository.addJournalEvent({
      action: "calibration_review",
      allowedUse: "research_only",
      calibrationTag: "review_volume_oi_weight",
      canAutoAdjustWeights: false,
      createdAt: `2026-06-12T1${index + 2}:00:00.000Z`,
      id: `flow-calibration-loss-${index}`,
      note: "确认后反证样本。",
      outcomeStatus: "loss",
      rankDelta: 0,
      result: "loss",
      reviewStatus: "closed",
      source: "daily_mover_calibration",
      symbol: `LOSS${index}USDT`,
      title: "规则校准复盘",
    });
  }

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T15:10:00.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.outcomes.calibrationFlow.status, "rollback_watch");
  assert.equal(report.outcomes.calibrationFlow.admissionStatus, "ready");
  assert.equal(report.outcomes.calibrationFlow.sampleGateReady, true);
  assert.equal(report.outcomes.calibrationFlow.manualConfirmationEvents, 1);
  assert.equal(report.outcomes.calibrationFlow.calibrationReviewEvents, 4);
  assert.equal(report.outcomes.calibrationFlow.pendingCalibrationReviews, 1);
  assert.equal(report.outcomes.calibrationFlow.rollbackWatchVersions, 1);
  assert.equal(report.outcomes.calibrationFlow.canAutoAdjustWeights, false);
  assert.match(report.outcomes.calibrationFlow.nextStep, /回滚观察/);
});

test("buildSystemHealthReport exposes manual calibration admission for outcome samples", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  const baseEvent = {
    note: "样本复盘。",
    rankDelta: 0,
    result: "watching" as const,
    reviewStatus: "closed" as const,
    title: "生命周期复盘",
  };

  for (let index = 0; index < 8; index += 1) {
    await repository.addJournalEvent({
      ...baseEvent,
      id: `journal-valid-${index}`,
      signalId: `valid-plan-${index}`,
      symbol: `VALID${index}USDT`,
      createdAt: `2026-06-12T10:0${index}:00.000Z`,
      outcomeStatus: index % 2 === 0 ? "partial_win" : "saved",
      result: index % 2 === 0 ? "win" : "saved",
    });
  }

  for (let index = 0; index < 4; index += 1) {
    await repository.addJournalEvent({
      ...baseEvent,
      id: `journal-counter-${index}`,
      signalId: `counter-plan-${index}`,
      symbol: `COUNTER${index}USDT`,
      createdAt: `2026-06-12T10:1${index}:00.000Z`,
      outcomeStatus: index % 2 === 0 ? "loss" : "expired",
      result: index % 2 === 0 ? "loss" : "watching",
    });
  }

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T11:10:00.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.deepEqual(report.outcomes.calibrationAdmission, {
    allowedUse: "research_only",
    autoWeightEligible: false,
    blockers: [],
    canAutoAdjustWeights: false,
    closedEvents: 12,
    counterEvidenceEvents: 4,
    expiredEvents: 2,
    failedEvents: 2,
    guardrail: "outcome 样本准入只服务人工校准和回滚复核，不能自动改权重。",
    manualCalibrationReady: true,
    mode: "manual_calibration_gate",
    nextStep: "样本达到人工校准准入门槛，可以进入人工校准和回滚边界复核，不能自动改权重。",
    pendingEvents: 0,
    readinessScore: 100,
    sampleCount: 12,
    status: "ready",
    validationRatePercent: 67,
    validatedEvents: 8,
  });
});

test("buildSystemHealthReport exposes readonly strategy weight calibration from journal samples", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });

  for (let index = 0; index < 5; index += 1) {
    await repository.addJournalEvent({
      action: "calibration_review",
      allowedUse: "research_only",
      calibrationTag: "review_volume_oi_weight",
      canAutoAdjustWeights: false,
      createdAt: `2026-06-12T10:0${index}:00.000Z`,
      id: `weight-volume-win-${index}`,
      note: "权重校准有效样本。",
      outcomeStatus: index % 2 === 0 ? "partial_win" : "saved",
      rankDelta: 0,
      result: index % 2 === 0 ? "win" : "saved",
      reviewStatus: "closed",
      source: "daily_mover_calibration",
      symbol: `VOL${index}USDT`,
      title: "规则校准复盘",
    });
  }

  await repository.addJournalEvent({
    action: "calibration_review",
    allowedUse: "research_only",
    calibrationTag: "review_volume_oi_weight",
    canAutoAdjustWeights: false,
    createdAt: "2026-06-12T10:10:00.000Z",
    id: "weight-volume-loss",
    note: "权重校准反证样本。",
    outcomeStatus: "loss",
    rankDelta: 0,
    result: "loss",
    reviewStatus: "closed",
    source: "daily_mover_calibration",
    symbol: "VLOSSUSDT",
    title: "规则校准复盘",
  });

  await repository.addJournalEvent({
    action: "strategy_confirmation",
    allowedUse: "research_only",
    calibrationTag: "review_volume_oi_weight",
    canAutoAdjustWeights: false,
    createdAt: "2026-06-12T11:00:00.000Z",
    id: "weight-volume-confirmation",
    note: "人工确认策略版本。",
    rankDelta: 0,
    result: "watching",
    reviewStatus: "closed",
    source: "strategy_version_confirmation",
    strategyDraftId: "strategy-review_volume_oi_weight",
    strategyTag: "review_volume_oi_weight",
    strategyVersionLabel: "draft-volume-oi-weight-v1",
    symbol: "STRATEGY",
    title: "策略版本人工确认",
  });

  await repository.addJournalEvent({
    action: "strategy_weight_change_execution",
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    createdAt: "2026-06-12T11:30:00.000Z",
    id: "weight-volume-execution",
    note: "人工权重变更执行记录，只记录审批边界，不写入规则权重。",
    rankDelta: 0,
    result: "watching",
    reviewStatus: "closed",
    source: "strategy_weight_change_execution",
    strategyWeightChange: {
      approvalStatus: "approved",
      approvedAt: "2026-06-12T11:30:00.000Z",
      approvedBy: "chuan",
      canExecuteWeightChange: false,
      direction: "increase",
      rollbackTrigger: "如果未来 14 天新增 3 个反证样本，进入人工回滚复核。",
      rollbackWindowDays: 14,
      tag: "review_volume_oi_weight",
      versionLabel: "draft-volume-oi-weight-v1",
    },
    symbol: "STRATEGY",
    title: "人工权重变更执行记录",
  });

  for (let index = 0; index < 3; index += 1) {
    await repository.addJournalEvent({
      action: "calibration_review",
      allowedUse: "research_only",
      calibrationTag: "review_volume_oi_weight",
      canAutoAdjustWeights: false,
      createdAt: `2026-06-12T11:3${index + 1}:00.000Z`,
      id: `weight-volume-shadow-valid-${index}`,
      note: "影子权重观察期有效样本。",
      outcomeStatus: index % 2 === 0 ? "partial_win" : "saved",
      rankDelta: 0,
      result: index % 2 === 0 ? "win" : "saved",
      reviewStatus: "closed",
      source: "daily_mover_calibration",
      symbol: `SHADOWVOL${index}USDT`,
      title: "规则校准复盘",
    });
  }

  await repository.addJournalEvent({
    action: "strategy_confirmation",
    allowedUse: "research_only",
    calibrationTag: "review_volume_oi_weight",
    canAutoAdjustWeights: false,
    createdAt: "2026-06-12T11:40:00.000Z",
    id: "weight-volume-shadow-confirmation",
    note: "影子权重观察期人工确认。",
    rankDelta: 0,
    result: "watching",
    reviewStatus: "closed",
    source: "strategy_version_confirmation",
    strategyDraftId: "strategy-review_volume_oi_weight",
    strategyTag: "review_volume_oi_weight",
    strategyVersionLabel: "draft-volume-oi-weight-v1",
    symbol: "STRATEGY",
    title: "策略版本人工确认",
  });

  const report = await buildSystemHealthReport({
    env: {
      MARKET_DATA_PROVIDER: "mock",
      STRATEGY_WEIGHT_ACTIVATION_MODE: "manual",
    },
    now: new Date("2026-06-12T12:10:00.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.outcomes.strategyWeightCalibration.mode, "strategy_weight_backtest_calibration_mvp");
  assert.equal(report.outcomes.strategyWeightCalibration.allowedUse, "research_only");
  assert.equal(report.outcomes.strategyWeightCalibration.canAutoAdjustWeights, false);
  assert.equal(report.outcomes.strategyWeightCalibration.status, "manual_review_ready");
  assert.equal(report.outcomes.strategyWeightCalibration.increaseCandidates, 1);
  assert.equal(report.outcomes.strategyWeightCalibration.candidates[0]?.tag, "review_volume_oi_weight");
  assert.equal(report.outcomes.strategyWeightCalibration.candidates[0]?.recommendation, "increase_candidate");
  assert.equal(report.outcomes.strategyWeightCalibration.candidates[0]?.latestVersionLabel, "draft-volume-oi-weight-v1");
  assert.match(report.outcomes.strategyWeightCalibration.nextStep, /人工复核/);
  assert.equal(report.outcomes.strategyWeightChangeAudit.mode, "strategy_weight_change_audit_mvp");
  assert.equal(report.outcomes.strategyWeightChangeAudit.allowedUse, "research_only");
  assert.equal(report.outcomes.strategyWeightChangeAudit.canAutoAdjustWeights, false);
  assert.equal(report.outcomes.strategyWeightChangeAudit.canExecuteWeightChange, false);
  assert.equal(report.outcomes.strategyWeightChangeAudit.status, "manual_audit_ready");
  assert.equal(report.outcomes.strategyWeightChangeAudit.auditCandidateCount, 1);
  assert.equal(report.outcomes.strategyWeightChangeAudit.readyAuditCount, 1);
  assert.equal(report.outcomes.strategyWeightChangeAudit.items[0]?.tag, "review_volume_oi_weight");
  assert.equal(report.outcomes.strategyWeightChangeAudit.items[0]?.auditStatus, "ready_for_manual_audit");
  assert.match(report.outcomes.strategyWeightChangeAudit.guardrail, /不执行真实权重变更/);
  assert.equal(report.outcomes.strategyWeightChangeExecution.mode, "strategy_weight_manual_execution_registry_mvp");
  assert.equal(report.outcomes.strategyWeightChangeExecution.allowedUse, "research_only");
  assert.equal(report.outcomes.strategyWeightChangeExecution.canAutoAdjustWeights, false);
  assert.equal(report.outcomes.strategyWeightChangeExecution.canExecuteWeightChange, false);
  assert.equal(report.outcomes.strategyWeightChangeExecution.canWriteRuleWeights, false);
  assert.equal(report.outcomes.strategyWeightChangeExecution.requiresManualApproval, true);
  assert.equal(report.outcomes.strategyWeightChangeExecution.status, "recorded_observation");
  assert.equal(report.outcomes.strategyWeightChangeExecution.executionRecordCount, 1);
  assert.equal(report.outcomes.strategyWeightChangeExecution.approvedRecordCount, 1);
  assert.equal(report.outcomes.strategyWeightChangeExecution.items[0]?.executionStatus, "approved_recorded");
  assert.equal(report.outcomes.strategyWeightChangeExecution.items[0]?.approvalBy, "chuan");
  assert.match(report.outcomes.strategyWeightChangeExecution.guardrail, /不写入规则权重/);
  assert.equal(report.outcomes.strategyWeightShadow.mode, "strategy_weight_shadow_readonly_mvp");
  assert.equal(report.outcomes.strategyWeightShadow.allowedUse, "research_only");
  assert.equal(report.outcomes.strategyWeightShadow.canAutoAdjustWeights, false);
  assert.equal(report.outcomes.strategyWeightShadow.canAffectLiveSignals, false);
  assert.equal(report.outcomes.strategyWeightShadow.status, "shadow_ready");
  assert.equal(report.outcomes.strategyWeightShadow.approvedRecordCount, 1);
  assert.equal(report.outcomes.strategyWeightShadow.baseWeights[0]?.weight, 100);
  assert.equal(report.outcomes.strategyWeightShadow.shadowWeights[0]?.weight, 110);
  assert.equal(report.outcomes.strategyWeightShadow.diffs[0]?.delta, 10);
  assert.match(report.outcomes.strategyWeightShadow.guardrail, /不影响真实扫描/);
  assert.equal(report.outcomes.strategyWeightShadowEvaluation.mode, "strategy_weight_shadow_evaluation_mvp");
  assert.equal(report.outcomes.strategyWeightShadowEvaluation.allowedUse, "research_only");
  assert.equal(report.outcomes.strategyWeightShadowEvaluation.canAutoAdjustWeights, false);
  assert.equal(report.outcomes.strategyWeightShadowEvaluation.canAffectLiveSignals, false);
  assert.equal(report.outcomes.strategyWeightShadowEvaluation.status, "improving");
  assert.equal(report.outcomes.strategyWeightShadowEvaluation.evaluatedShadowCount, 1);
  assert.equal(report.outcomes.strategyWeightShadowEvaluation.improvingCount, 1);
  assert.equal(report.outcomes.strategyWeightShadowEvaluation.items[0]?.tag, "review_volume_oi_weight");
  assert.equal(report.outcomes.strategyWeightShadowEvaluation.items[0]?.postApprovalSamples, 3);
  assert.equal(report.outcomes.strategyWeightShadowEvaluation.items[0]?.validatedSamples, 3);
  assert.equal(report.outcomes.strategyWeightShadowEvaluation.items[0]?.rollbackPressure, "low");
  assert.match(report.outcomes.strategyWeightShadowEvaluation.guardrail, /不执行真实权重/);
  assert.equal(report.outcomes.strategyWeightActivationGate.mode, "strategy_weight_activation_gate_mvp");
  assert.equal(report.outcomes.strategyWeightActivationGate.activationMode, "manual");
  assert.equal(report.outcomes.strategyWeightActivationGate.status, "blocked");
  assert.equal(report.outcomes.strategyWeightActivationGate.requiredPostApprovalSamples, 5);
  assert.equal(report.outcomes.strategyWeightActivationGate.eligibleForManualActivation, false);
  assert.equal(
    report.outcomes.strategyWeightActivationGate.checks.find((check: { id: string }) =>
      check.id === "sample_floor"
    )?.status,
    "blocked",
  );
  assert.equal(report.outcomes.strategyWeightActivationGate.canAffectLiveSignals, false);
  assert.equal(report.outcomes.strategyWeightActivationGate.canWriteRuleWeights, false);
  assert.match(report.outcomes.strategyWeightActivationGate.guardrail, /不会改变扫描/);
});
