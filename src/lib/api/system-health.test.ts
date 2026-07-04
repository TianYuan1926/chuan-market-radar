import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseClientDiagnostics } from "../persistence/database-client";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import { buildSystemHealthReport } from "./system-health";
import type { MarketRadarSnapshot, ScanArchiveSummary, ScanReplayFrame } from "../market/types";
import type { MacroMarketSnapshot } from "../market/macro-snapshot";
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

function macroMarketSnapshot(overrides: Partial<MacroMarketSnapshot> = {}): MacroMarketSnapshot {
  return {
    allowedUse: "macro_context_only",
    btcDominancePercent: 53.2,
    canCreateTradeSignal: false,
    ethDominancePercent: 16.4,
    fetchedAt: "2026-06-12T09:50:00.000Z",
    guardrail: "BTC.D/TOTAL2/TOTAL3 只能作为山寨大盘环境锚点，不能直接生成交易方向，不能降低 3:1 最低盈亏比。",
    id: "macro-coingecko-global-20260612095000000",
    source: "coingecko_global",
    total2MarketCapUsd: 1_420_000_000_000,
    total3MarketCapUsd: 910_000_000_000,
    totalMarketCapChangePercent24h: 1.8,
    totalMarketCapUsd: 3_040_000_000_000,
    updatedAt: "2026-06-12T09:50:00.000Z",
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
    tradePlan: {
      allowedUse: "research_only",
      blockedBy: [],
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      confirmationChecklist: ["Risk Gate 已通过", "位置/RR 不低于 3:1"],
      direction: "long",
      entryZone: "等待人工确认",
      hasAutoExecution: false,
      invalidation: "跌破 94",
      isPlanEligible: true,
      manualReviewRequired: true,
      positionSizing: "人工确认",
      rewardRisk: 3.4,
      status: "READY_LONG",
      structuralStop: 94,
      summary: "v3 只读多头计划草案。",
      takeProfitPlan: "分批止盈",
      targets: [112],
    },
    trendContext: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      conflicts: [],
      decision: "LONG_PLAN",
      guardrail: "只读复核，不改变实时排序。",
      locationRiskReward: {
        allowedUse: "research_only",
        canAutoAdjustWeights: false,
        canMutateLiveRanking: false,
        currentPrice: 100,
        direction: "long",
        hasTradeSignal: false,
        isTradeEligible: true,
        minRewardRisk: 3,
        nearestTarget: 112,
        positionQuality: "GOOD_LOCATION",
        rewardRisk: 3.4,
        riskFlags: [],
        stopDistance: 6,
        stopDistancePercent: 6,
        stopLevelId: "ENAUSDT-4h-swing-low",
        structuralStop: 94,
        summary: "位置/RR 合格。",
        targetDistance: 12,
        targetDistancePercent: 12,
        targetLevelId: "ENAUSDT-forward-r1",
      },
      marketReadings: [],
      nextStep: "进入人工复核。",
      noParticipationReasons: [],
      reactionQuality: {
        allowedUse: "research_only",
        canAutoAdjustWeights: false,
        canMutateLiveRanking: false,
        direction: "long",
        evidence: ["回踩承接已确认。"],
        hasTradeSignal: false,
        qualityScore: 80,
        riskFlags: [],
        status: "CONFIRMED",
        summary: "回踩确认。",
        touchedLevelId: "ENAUSDT-4h-swing-low",
      },
      riskGate: {
        allowed: true,
        blockedBy: [],
        mode: "readonly_v3_risk_gate",
      },
      scores: {
        exhaustionScore: 12,
        longPreTrendScore: 78,
        longTrendEnergyScore: 80,
        riskScore: 24,
        shortPreTrendScore: 20,
        shortTrendEnergyScore: 12,
        trendHoldScore: 72,
      },
      state: "LONG_BREAKOUT",
      summary: "v3 ready context",
      timeframes: [],
      trendIntegrity: {
        allowedUse: "research_only",
        canAutoAdjustWeights: false,
        canMutateLiveRanking: false,
        direction: "long",
        evidence: ["HH/HL 保持。"],
        hasTradeSignal: false,
        integrityScore: 82,
        riskFlags: [],
        status: "HEALTHY_TREND",
        summary: "趋势健康。",
      },
    },
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
  assert.equal(report.apiUsage.status, "unconfigured");
  assert.equal(report.apiUsage.usedToday, 0);
  assert.equal(report.dataSourceLatency.status, "unconfigured");
  assert.equal(report.dataSourceLatency.probes.find((probe) => probe.name === "CoinGlass")?.latencyMs, null);
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
  assert.equal(
    report.dataSourceCapabilities.providers.find((provider) => provider.id === "coinglass_paid")?.implementationStatus,
    "blocked",
  );
  assert.equal(
    report.dataSourceCapabilities.coinGlassHobbyist.endpointFamilies.find((family) =>
      family.id === "open_interest_current"
    )?.implementationStatus,
    "blocked",
  );
  assert.equal(
    report.dataSourceCapabilities.coinGlassHobbyist.endpointFamilies.find((family) =>
      family.id === "coins_price_change"
    )?.hobbyistStatus,
    "unsupported_by_hobbyist",
  );
  assert.equal(report.guards.find((guard) => guard.id === "data-source")?.state, "degraded");
});

test("buildSystemHealthReport exposes CoinGlass Hobbyist capability contract when configured", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });

  const report = await buildSystemHealthReport({
    env: {
      COINGLASS_API_KEY: "configured",
      MARKET_DATA_PROVIDER: "coinglass",
    },
    now: new Date("2026-06-12T10:02:00.000Z"),
    repository,
    snapshot: snapshot({
      source: "coinglass",
      isRealtime: true,
    }),
  });

  assert.equal(report.dataSourceCapabilities.coinGlassHobbyist.accountPlan, "hobbyist");
  assert.equal(report.dataSourceCapabilities.coinGlassHobbyist.minuteLimit, 30);
  assert.equal(
    report.dataSourceCapabilities.providers.find((provider) => provider.id === "coinglass_paid")?.implementationStatus,
    "enabled",
  );
  assert.equal(
    report.dataSourceCapabilities.coinGlassHobbyist.endpointFamilies.find((family) =>
      family.id === "open_interest_current"
    )?.implementationStatus,
    "enabled",
  );
  assert.equal(
    report.dataSourceCapabilities.coinGlassHobbyist.endpointFamilies.find((family) =>
      family.id === "technical_indicators"
    )?.implementationStatus,
    "blocked",
  );
  assert.ok(
    report.dataSourceCapabilities.visualizationContracts.some((contract) =>
      contract.id === "scan_proof"
    ),
  );
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

test("buildSystemHealthReport degrades instead of throwing when database tables are not migrated yet", async () => {
  const baseRepository = createMemoryPersistenceRepository({ scope: "chuan-prod" });
  const repository = {
    ...baseRepository,
    mode: "database" as const,
    async listJournalEvents() {
      throw new Error('relation "journal_events" does not exist');
    },
    async listScanArchives() {
      throw new Error('relation "scan_archives" does not exist');
    },
  };

  const database: DatabaseClientDiagnostics = {
    connectionStringEnv: "DATABASE_URL",
    detail: "已启用 postgres SQL client，scope 为 chuan-prod，可写入远端数据库。",
    driver: "postgres",
    durable: true,
    hasDatabaseUrl: true,
    scope: "chuan-prod",
    status: "ready",
  };

  const report = await buildSystemHealthReport({
    database,
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T10:04:30.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.level, "degraded");
  assert.equal(report.persistence.mode, "database");
  assert.equal(report.persistence.databaseDriver, "postgres");
  assert.equal(report.persistence.databaseStatus, "ready");
  assert.match(report.persistence.detail, /journal_events/);
  assert.match(report.persistence.detail, /scan_archives/);
  assert.equal(report.archive.entries, 0);
  assert.equal(report.archive.status, "unavailable");
  assert.match(report.archive.detail, /scan_archives/);
  assert.equal(report.guards.find((guard) => guard.id === "persistence")?.state, "degraded");
  assert.match(report.guards.find((guard) => guard.id === "archive")?.detail ?? "", /scan_archives/);
});

test("buildSystemHealthReport times out slow repository reads instead of blocking frontend contracts", async () => {
  const previousTimeout = process.env.SYSTEM_HEALTH_REPOSITORY_READ_TIMEOUT_MS;
  process.env.SYSTEM_HEALTH_REPOSITORY_READ_TIMEOUT_MS = "500";
  const baseRepository = createMemoryPersistenceRepository({ scope: "chuan-prod" });
  const never = () => new Promise<never>(() => {});
  const repository = {
    ...baseRepository,
    mode: "database" as const,
    listJournalEvents: never,
    listMacroMarketSnapshots: never,
    listScanArchives: never,
    listV3ForwardMapSnapshots: never,
  };

  const database: DatabaseClientDiagnostics = {
    connectionStringEnv: "DATABASE_URL",
    detail: "已启用 postgres SQL client，scope 为 chuan-prod，可写入远端数据库。",
    driver: "postgres",
    durable: true,
    hasDatabaseUrl: true,
    scope: "chuan-prod",
    status: "ready",
  };

  try {
    const startedAt = Date.now();
    const report = await buildSystemHealthReport({
      database,
      env: { MARKET_DATA_PROVIDER: "mock" },
      now: new Date("2026-06-12T10:04:30.000Z"),
      repository,
      snapshot: snapshot(),
    });
    const elapsedMs = Date.now() - startedAt;

    assert.ok(elapsedMs < 2_000, `expected timeout guard below 2s, got ${elapsedMs}ms`);
    assert.equal(report.level, "degraded");
    assert.equal(report.archive.status, "unavailable");
    assert.match(report.archive.detail, /timed out/);
    assert.match(report.persistence.detail, /timed out/);
    assert.equal(report.macroMarket.status, "unavailable");
    assert.equal(report.v3ForwardMapReviews.storageStatus, "unavailable");
    assert.match(report.v3ForwardMapReviews.storageDetail, /timed out/);
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.SYSTEM_HEALTH_REPOSITORY_READ_TIMEOUT_MS;
    } else {
      process.env.SYSTEM_HEALTH_REPOSITORY_READ_TIMEOUT_MS = previousTimeout;
    }
  }
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

test("buildSystemHealthReport exposes runtime, light scan, and request diagnostics", async () => {
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
      diagnostics: {
        discovery: {
          fallbackActivated: true,
          fallbackInstrumentCount: 220,
          liveInstrumentCount: 0,
          sources: [
            {
              instrumentCount: 0,
              reason: "upstream_unavailable",
              requestCount: 1,
              source: "binance-futures-exchange-info",
              status: "failed",
              statusCode: 451,
            },
          ],
        },
        requests: {
          acceptedInstruments: 22,
          cleanRows: 22,
          coinGlassRequestsPlanned: 24,
          duplicateSymbolGroups: 1,
          emptyResultAssets: ["NEW"],
          filteredRows: 2,
          plannedAssets: ["BTC", "ETH", "ARB", "NEW"],
          primaryRows: 21,
          quoteUnsupportedRows: 1,
          rawRows: 24,
          statusCounts: {
            clean: 22,
            conflict: 1,
            empty: 1,
            fallback_only: 0,
            filtered: 2,
            live_ok: 21,
            stale: 0,
            unsupported: 2,
          },
          unsupportedExchangeRows: 1,
        },
        v3Coverage: {
          missingSignals: 3,
          ohlcvAttemptedSymbols: ["ARBUSDT", "ENAUSDT"],
          ohlcvFailureCount: 4,
          totalSignals: 8,
          withV3Signals: 5,
        },
      },
      lightScan: {
        acceptedCount: 180,
        candidateCount: 36,
        generatedAt: "2026-06-12T10:00:00.000Z",
        notes: ["public light scan ready"],
        requestCount: 1,
        source: "binance-public-futures-24h",
        status: "ready",
        topCandidates: [
          {
            baseAsset: "ARB",
            changePercent24h: 6.4,
            distanceFromHighPercent: 1.2,
            distanceFromLowPercent: 8.4,
            reasons: ["price_volume_anomaly"],
            score: 92,
            state: "HOT",
            symbol: "ARBUSDT",
            volume24hUsd: 64_000_000,
            volatilityPercent: 9.6,
          },
        ],
        universeCount: 220,
      },
      signalMaturity: {
        candidateLaneSymbols: ["NEWUSDT"],
        counts: {
          DEEP_SCAN_CANDIDATE: 1,
          EVIDENCE_SIGNAL: 3,
          LIGHT_SCAN_MARK: 36,
          REVIEW_ONLY: 0,
          TRADE_PLAN_READY: 2,
        },
        guardrail: "轻扫标记不进入主信号区；深扫候选只能进候选/验证中区域；只有证据融合信号和交易计划就绪能进入主信号区。",
        mainSignalSymbols: ["ARBUSDT", "ENAUSDT", "SUIUSDT", "TIAUSDT", "ONDOUSDT"],
        rules: [
          "LIGHT_SCAN_MARK is scheduling input only",
          "DEEP_SCAN_CANDIDATE is visible as verifying candidate only",
          "EVIDENCE_SIGNAL can enter the main signal area without a trade plan",
          "REVIEW_ONLY is late/no-chase education and cannot attach a trade plan",
          "TRADE_PLAN_READY is the only maturity allowed to attach a structured trade plan",
        ],
        tradePlanReadySymbols: ["ARBUSDT", "ENAUSDT"],
      },
      runtime: {
        cacheStatus: "updated",
        persistedArchive: true,
        repositoryMode: "database",
        trigger: "cron_post",
      },
    }),
  });

  assert.equal(report.lightScan?.status, "ready");
  assert.equal(report.lightScan?.topCandidates[0]?.symbol, "ARBUSDT");
  assert.equal(report.signalMaturity?.counts.LIGHT_SCAN_MARK, 36);
  assert.deepEqual(report.signalMaturity?.candidateLaneSymbols, ["NEWUSDT"]);
  assert.deepEqual(report.signalMaturity?.tradePlanReadySymbols, ["ARBUSDT", "ENAUSDT"]);
  assert.equal(report.scanDiagnostics?.discovery.fallbackActivated, true);
  assert.equal(report.scanDiagnostics?.requests.coinGlassRequestsPlanned, 24);
  assert.deepEqual(report.scanDiagnostics?.requests.emptyResultAssets, ["NEW"]);
  assert.deepEqual(report.scanDiagnostics?.v3Coverage.ohlcvAttemptedSymbols, ["ARBUSDT", "ENAUSDT"]);
  assert.equal(report.operations.runtimeTrigger, "cron_post");
  assert.equal(report.operations.runtimeCacheStatus, "updated");
  assert.equal(report.operations.persistedArchive, true);
  assert.equal(report.operations.repositoryMode, "database");
});

test("buildSystemHealthReport exposes durable macro market anchors without making trade signals", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "chuan-prod" });
  await repository.addScanArchive(archiveSummary(), replayFrame());
  await repository.addMacroMarketSnapshot(macroMarketSnapshot());

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
    }),
  });

  assert.equal(report.macroMarket.status, "ready");
  assert.equal(report.macroMarket.allowedUse, "macro_context_only");
  assert.equal(report.macroMarket.canCreateTradeSignal, false);
  assert.equal(report.macroMarket.source, "coingecko_global");
  assert.equal(report.macroMarket.ageMinutes, 14);
  assert.equal(report.macroMarket.btcDominancePercent, 53.2);
  assert.equal(report.macroMarket.total2MarketCapUsd, 1_420_000_000_000);
  assert.equal(report.macroMarket.total3MarketCapUsd, 910_000_000_000);
  assert.match(report.macroMarket.guardrail, /不能直接生成交易方向/);
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
        "quality rejections: unsupported_exchange 2, quote_not_supported 3, non_crypto_underlying 1, duplicate_symbol 4",
        "quality rejected samples: Gate.io:TIAUSDT:unsupported_exchange; Binance:TIAUSDC:quote_not_supported",
        "quality aggregation summary: duplicate_groups 1, rule exchange_priority_then_volume_oi",
        "quality aggregation: TIAUSDT selected BINANCE over OKX/BYBIT by exchange_priority_then_volume_oi",
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
        dynamicPriority: {
          boostedAssets: ["ENA"],
          candidateCount: 2,
          candidates: [
            {
              baseAsset: "ENA",
              dynamicBoost: 192_000,
              reasons: ["anomaly", "recent_signal"],
              score: 312_000,
              staticPriority: 120_000,
              status: "selected",
              statusReason: "本轮占用高优先级槽位",
              symbol: "ENAUSDT",
            },
            {
              baseAsset: "SUI",
              dynamicBoost: 121_000,
              reasons: ["anomaly", "liquidity"],
              score: 201_000,
              staticPriority: 80_000,
              status: "queued",
              statusReason: "等待后续批次或高优先级槽位",
              symbol: "SUIUSDT",
            },
          ],
          enabled: true,
          reasonCounts: {
            anomaly: 2,
            early_opportunity: 0,
            liquidity: 1,
            recent_deep_scan: 0,
            overextended_move: 0,
            recent_signal: 1,
            rotation_age: 0,
            venue_coverage: 0,
          },
          slotsAvailable: 1,
          slotsUsed: 1,
          topAssets: [
            {
              baseAsset: "ENA",
              dynamicBoost: 192_000,
              reasons: ["anomaly", "recent_signal"],
              score: 312_000,
              staticPriority: 120_000,
              symbol: "ENAUSDT",
            },
          ],
        },
        eligible: 5,
        exchangeCoverageSummary: {
          majorThree: 2,
          multiExchange: 1,
          singleExchange: 1,
          unlisted: 1,
        },
        exchangeCoverage: [
          {
            baseAsset: "BTC",
            exchangeCount: 3,
            exchanges: ["BINANCE", "OKX", "BYBIT"],
            symbol: "BTCUSDT",
            venueCoverage: "major_three",
          },
          {
            baseAsset: "ETH",
            exchangeCount: 3,
            exchanges: ["BINANCE", "OKX", "BYBIT"],
            symbol: "ETHUSDT",
            venueCoverage: "major_three",
          },
          {
            baseAsset: "SOL",
            exchangeCount: 2,
            exchanges: ["BINANCE", "OKX"],
            symbol: "SOLUSDT",
            venueCoverage: "multi_exchange",
          },
          {
            baseAsset: "ENA",
            exchangeCount: 1,
            exchanges: ["BINANCE"],
            symbol: "ENAUSDT",
            venueCoverage: "single_exchange",
          },
          {
            baseAsset: "SUI",
            exchangeCount: 0,
            exchanges: [],
            symbol: "SUIUSDT",
            venueCoverage: "unlisted",
          },
        ],
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
  assert.equal(report.fullMarketCoverage.exchangeDrilldown.rows.length, 4);
  assert.equal(report.fullMarketCoverage.exchangeDrilldown.rows[0]?.label, "三所共振");
  assert.equal(report.fullMarketCoverage.exchangeDrilldown.rows[0]?.count, 2);
  assert.deepEqual(report.fullMarketCoverage.exchangeDrilldown.rows[0]?.samples, [
    "BTC BINANCE/OKX/BYBIT",
    "ETH BINANCE/OKX/BYBIT",
  ]);
  assert.equal(report.fullMarketCoverage.exchangeDrilldown.rows.find((row) => row.id === "single_exchange")?.count, 1);
  assert.equal(report.fullMarketCoverage.exchangeDrilldown.rows.find((row) => row.id === "unlisted")?.samples[0], "SUI 未发现");
  assert.match(report.fullMarketCoverage.exchangeDrilldown.guardrail, /只读取本轮 coverage metadata/);
  assert.match(report.fullMarketCoverage.exchangeDrilldown.nextActions.join(" "), /单所\/发现缺口/);
  assert.deepEqual(report.fullMarketCoverage.exchangeDrilldown.unsupported.samples, ["OLDUSDT:inactive"]);
  assert.equal(report.fullMarketCoverage.highPriority.enabled, true);
  assert.equal(report.fullMarketCoverage.highPriority.slotsUsed, 1);
  assert.equal(report.fullMarketCoverage.highPriority.slotsAvailable, 1);
  assert.deepEqual(report.fullMarketCoverage.highPriority.selectedAssets, ["ENA"]);
  assert.deepEqual(report.fullMarketCoverage.highPriority.queuedAssets, ["SUI"]);
  assert.match(report.fullMarketCoverage.highPriority.operatorHint, /槽位已用满/);
  assert.equal(report.fullMarketCoverage.highPriority.reasonCounts[0]?.label, "异动");
  assert.equal(report.fullMarketCoverage.highPriority.reasonCounts[0]?.count, 2);
  assert.equal(report.fullMarketCoverage.lanes.length, 5);
  assert.equal(report.fullMarketCoverage.lanes.find((lane) => lane.id === "core")?.pending, 1);
  assert.deepEqual(report.fullMarketCoverage.samples.scannedAssets, ["BTC", "ETH", "ENA"]);
  assert.deepEqual(report.fullMarketCoverage.samples.pendingAssets, ["SOL", "SUI"]);
  assert.match(report.fullMarketCoverage.samples.rejectedAssets[0], /OLDUSDT:inactive/);
  assert.match(report.fullMarketCoverage.operatorHint, /预算压缩轮转/);
  assert.match(report.fullMarketCoverage.priorityExplanation, /长尾资产/);
  assert.match(report.fullMarketCoverage.priorityExplanation, /高优先级槽位 1\/1/);
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
  assert.equal(report.marketDataQuality.primarySelection.duplicateGroups, 1);
  assert.equal(report.marketDataQuality.primarySelection.rule, "exchange_priority_then_volume_oi");
  assert.match(report.marketDataQuality.primarySelection.operatorHint, /交易所优先级/);
  assert.deepEqual(report.marketDataQuality.primarySelection.samples[0], {
    discardedExchanges: ["OKX", "BYBIT"],
    reason: "exchange_priority_then_volume_oi",
    selectedExchange: "BINANCE",
    symbol: "TIAUSDT",
  });
  assert.deepEqual(report.marketDataQuality.rejectedRowSamples, [
    {
      exchangeName: "Gate.io",
      reason: "unsupported_exchange",
      symbol: "TIAUSDT",
    },
    {
      exchangeName: "Binance",
      reason: "quote_not_supported",
      symbol: "TIAUSDC",
    },
  ]);
  assert.ok(report.marketDataQuality.qualityScore < 65);
  assert.deepEqual(
    report.marketDataQuality.issues.map((issue) => issue.label),
    ["未知交易所", "报价不支持", "非加密标的", "重复币种", "池过滤"],
  );
  assert.match(report.marketDataQuality.operatorHint, /数据清洗/);
  assert.match(report.marketDataQuality.guardrails.join(" "), /不能单独生成交易方向/);
});

test("buildSystemHealthReport marks broad universe fallback as degraded rotation", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });

  const report = await buildSystemHealthReport({
    env: {
      COINGLASS_API_KEY: "test-key",
      MARKET_DATA_PROVIDER: "coinglass",
    },
    now: new Date("2026-06-19T10:04:20.000Z"),
    repository,
    snapshot: snapshot({
      source: "coinglass",
      isRealtime: true,
      notes: [
        "universe discovery: public-futures-multi-exchange ok 214 instruments",
        "universe source: fallback seed activated: live 0 below 50, seed 214",
      ],
      coverage: {
        batchIndex: 0,
        coveragePercent: 11,
        eligible: 214,
        exchangeCoverageSummary: {
          majorThree: 0,
          multiExchange: 0,
          singleExchange: 0,
          unlisted: 214,
        },
        nextBatchIndex: 1,
        pending: 190,
        pendingAssets: ["SOL", "ENA", "SUI"],
        scanned: 24,
        scannedAssets: ["BTC", "ETH", "ARB"],
        skipped: 0,
        skippedAssets: [],
        total: 214,
        totalBatches: 10,
      },
    }),
  });

  assert.equal(report.fullMarketCoverage.status, "fallback");
  assert.match(report.fullMarketCoverage.operatorHint, /广谱兜底池轮转/);
  assert.equal(report.fullMarketCoverage.coverage.eligible, 214);
  assert.equal(report.fullMarketCoverage.coverage.scanned, 24);
  assert.equal(report.fullMarketCoverage.coverage.estimatedFullCycleMinutes, 150);
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
  assert.equal(report.v3StrategyLoop.candidates[0]?.readinessBucket, "manual_review_ready");
  assert.equal(report.v3StrategyLoop.candidates[0]?.readinessLabel, "可人工复核");
  assert.equal(report.v3StrategyLoop.readinessBuckets[0]?.bucket, "manual_review_ready");
  assert.equal(report.v3StrategyLoop.readinessBuckets[0]?.count, 1);
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
    signalMaturityStage: "EVIDENCE_SIGNAL" as const,
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
    signalMaturityStage: "EVIDENCE_SIGNAL",
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
    signalMaturityStage: "EVIDENCE_SIGNAL" as const,
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
    signalMaturityStage: "EVIDENCE_SIGNAL" as const,
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
