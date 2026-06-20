import assert from "node:assert/strict";
import test from "node:test";
import type { MarketRadarSnapshot } from "../market/types";
import { buildDataSourceCapabilityPlan } from "../market/data-source-capabilities";
import type { SystemHealthReport } from "./system-health";
import { buildBackendContract } from "./backend-contract";

function snapshot(): MarketRadarSnapshot {
  return {
    metadata: {
      id: "scan-contract",
      mode: "scheduled",
      status: "ready",
      source: "coinglass",
      isRealtime: true,
      cadenceMinutes: 15,
      scannedCount: 6,
      anomalyCount: 3,
      candidateCount: 3,
      riskGate: "on",
      generatedAt: "2026-06-19T08:00:00.000Z",
      nextScanAt: "2026-06-19T08:15:00.000Z",
      staleAfterMinutes: 30,
      notes: ["scan runtime: updated from coinglass"],
      diagnostics: {
        discovery: {
          fallbackActivated: false,
          fallbackInstrumentCount: 0,
          liveInstrumentCount: 420,
          sources: [
            {
              instrumentCount: 220,
              requestCount: 1,
              source: "binance",
              status: "ok",
            },
          ],
        },
        requests: {
          acceptedInstruments: 420,
          cleanRows: 12,
          coinGlassRequestsPlanned: 6,
          duplicateSymbolGroups: 1,
          emptyResultAssets: ["BAKE"],
          filteredRows: 2,
          plannedAssets: ["BTC", "ETH", "ARB", "ENA", "TIA", "BAKE"],
          primaryRows: 6,
          quoteUnsupportedRows: 1,
          rawRows: 15,
          statusCounts: {
            clean: 6,
            conflict: 0,
            empty: 1,
            fallback_only: 0,
            filtered: 2,
            live_ok: 6,
            stale: 0,
            unsupported: 1,
          },
          unsupportedExchangeRows: 1,
        },
        v3Coverage: {
          missingSignals: 1,
          ohlcvAttemptedSymbols: ["ARBUSDT", "TIAUSDT"],
          ohlcvFailureCount: 0,
          totalSignals: 3,
          withV3Signals: 2,
        },
      },
      lightScan: {
        acceptedCount: 360,
        candidateCount: 24,
        generatedAt: "2026-06-19T08:00:00.000Z",
        notes: [
          "binance-public-futures-24h ready 360/520 accepted",
          "okx-public-swap-24h ready 180/220 accepted",
        ],
        requestCount: 1,
        source: "public-light-composite",
        status: "ready",
        topCandidates: [
          {
            baseAsset: "ARB",
            changePercent24h: 9.4,
            distanceFromHighPercent: 2.1,
            distanceFromLowPercent: 13.8,
            reasons: ["volume_price_anomaly"],
            score: 86,
            state: "PRE_TREND",
            symbol: "ARBUSDT",
            volume24hUsd: 92_000_000,
            volatilityPercent: 8.2,
          },
        ],
        universeCount: 520,
      },
      coverage: {
        batchIndex: 3,
        coveragePercent: 38.2,
        eligible: 420,
        nextBatchIndex: 4,
        pending: 414,
        pendingAssets: ["SUI", "MANTA", "ALT"],
        scanned: 6,
        scannedAssets: ["BTC", "ETH", "ARB", "ENA", "TIA", "BAKE"],
        skipped: 2,
        skippedAssets: [{ reason: "quote_not_supported", symbol: "TIAUSDC" }],
        total: 520,
        totalBatches: 70,
        twoStageAllocation: {
          guardrail: "二段深扫只分配本轮 CoinGlass 名额；未进入深扫不代表淘汰。",
          mode: "two_stage_deep_scan_v1",
          slots: [
            {
              baseAsset: "BTC",
              kind: "anchor_context",
              priorityReasons: [],
              reason: "BTC/ETH 锚点用于大盘环境。",
              slotIndex: 0,
              source: "anchor",
              symbol: "BTCUSDT",
              tier: "anchor",
              venueCoverage: "major_three",
            },
            {
              baseAsset: "BAKE",
              kind: "long_tail_exploration",
              priorityReasons: [],
              reason: "冷门探索保底。",
              slotIndex: 5,
              source: "exploration_reserve",
              symbol: "BAKEUSDT",
              tier: "long_tail",
              venueCoverage: "single_exchange",
            },
          ],
          stageOne: {
            priorityCandidates: 24,
            priorityQueued: 12,
            source: "public_light_scan_and_repository_hints",
            universeAssets: 420,
          },
          stageTwo: {
            anchorSlots: 2,
            capacity: 6,
            explorationSlots: 1,
            prioritySlots: 2,
            queuedPriorityAssets: ["SUI", "MANTA"],
            rotationSlots: 1,
            selectedAssets: ["BTC", "ETH", "ARB", "ENA", "TIA", "BAKE"],
          },
        },
        statePool: {
          assetSamples: [
            {
              baseAsset: "BTC",
              cadenceHint: "每轮锚定",
              nextAction: "维护大盘环境",
              reasons: ["anchor_market_context"],
              scannedThisRound: true,
              selectedThisRound: true,
              state: "BATTLE_READY",
              symbol: "BTCUSDT",
              tier: "anchor",
              venueCoverage: "major_three",
            },
            {
              baseAsset: "ARB",
              cadenceHint: "高频复扫",
              nextAction: "进入深扫候选",
              reasons: ["volume_price_anomaly", "dynamic_priority"],
              scannedThisRound: true,
              selectedThisRound: true,
              state: "HOT",
              symbol: "ARBUSDT",
              tier: "active",
              venueCoverage: "major_three",
            },
            {
              baseAsset: "BAKE",
              cadenceHint: "低频探索",
              nextAction: "等待复活观察",
              reasons: ["cold_exploration"],
              scannedThisRound: true,
              selectedThisRound: true,
              state: "COLD",
              symbol: "BAKEUSDT",
              tier: "long_tail",
              venueCoverage: "single_exchange",
            },
          ],
          counts: {
            BATTLE_READY: 1,
            BATTLE_WATCH: 0,
            CANDIDATE: 0,
            COLD: 1,
            COOLDOWN: 0,
            DEEP_QUEUE: 0,
            HOT: 1,
            REVIVE_WATCH: 0,
            WARM: 0,
          },
          deepScan: {
            anchorSlots: 2,
            battleSlots: 2,
            capacity: 6,
            explorationSlots: 1,
            guardrail: "保留冷门探索槽位",
            hotSlots: 1,
            queuedAssets: ["SUI", "MANTA"],
            reviveSlots: 1,
            selectedAssets: ["BTC", "ETH", "ARB", "ENA", "TIA", "BAKE"],
          },
          guardrail: "state pool readonly",
          lanes: [],
          mode: "state_pool_mvp",
          omittedAssetCount: 390,
          proof: {
            coldExplorationAssets: ["BAKE"],
            nextBatchAssets: ["SUI", "MANTA"],
            notEliminatedAssets: 420,
            notes: ["未入深扫不代表淘汰"],
            pendingAssets: ["SUI", "MANTA"],
            reviveWatchAssets: [],
            scannedAssets: ["BTC", "ETH", "ARB", "ENA", "TIA", "BAKE"],
            universeAssets: 420,
          },
          promotionBridge: {
            guardrail: "readonly",
            samples: [],
            summary: {
              blockedByRisk: 1,
              conflictOrInvalidated: 0,
              eligibleForBattle: 2,
              readonlySignals: 3,
              rewardRiskBlocked: 1,
            },
          },
        },
      },
    },
    archive: undefined,
    derivatives: [],
    heatmap: [],
    instrumentPool: {
      instruments: [],
      rejected: [],
      summary: {
        accepted: 420,
        duplicatesRemoved: 4,
        marketTypes: ["perpetual"],
        minVolume24hUsd: 5_000_000,
        quoteAssets: ["USDT"],
        rejected: 18,
        total: 520,
      },
    },
    instruments: [],
    journalEvents: [],
    signals: [
      {
        id: "arb-signal",
        symbol: "ARBUSDT",
        exchange: "BINANCE",
        direction: "long",
        state: "near_trigger",
        timeframe: "15m",
        regime: "risk_on",
        confidence: 82,
        risk: "medium",
        updatedAt: "2026-06-19T08:00:00.000Z",
        summary: "ARB pre-trend",
        evidence: [],
        strategy: {
          bias: "long",
          entry: "wait breakout",
          invalidation: "range lost",
          positionHint: "small",
          riskReward: 3.4,
          targets: ["R1"],
        },
        strategyV3: {
          allowedUse: "research_only",
          canAutoAdjustWeights: false,
          canMutateLiveRanking: false,
          currentPrice: 1.2,
          forwardLevels: [],
          guardrails: ["readonly"],
          keyLevels: [],
          primaryTimeframe: "1h",
          source: "existing_ohlcv_key_level_mvp",
          sourceTimeframes: ["15m", "1h"],
          summary: "v3 readonly",
          symbol: "ARBUSDT",
        },
      },
    ],
    tickers: [],
  };
}

function health(): SystemHealthReport {
  return {
    level: "ready",
    generatedAt: "2026-06-19T08:01:00.000Z",
    summary: "ready",
    dataSource: {
      activeSource: "coinglass",
      configuredProvider: "coinglass",
      detail: "CoinGlass ready",
      isRealtime: true,
      mode: "live",
      status: "ready",
    },
    dataSourceCapabilities: buildDataSourceCapabilityPlan({
      COINGLASS_API_KEY: "configured",
      MARKET_DATA_PROVIDER: "coinglass",
    }),
    persistence: {
      databaseStatus: "ready",
      detail: "Neon ready",
      databaseDriver: "neon",
      durable: true,
      mode: "database",
      scope: "public-demo",
    },
    scan: {
      ageMinutes: 1,
      anomalyCount: 3,
      cadenceMinutes: 15,
      candidateCount: 3,
      freshness: "fresh",
      generatedAt: "2026-06-19T08:00:00.000Z",
      nextScanAt: "2026-06-19T08:15:00.000Z",
      riskGate: "on",
      scannedCount: 6,
      status: "ready",
      staleAfterMinutes: 30,
    },
    archive: {
      entries: 12,
      retentionMode: "database",
    },
    coverage: snapshot().metadata.coverage!,
    fullMarketCoverage: {
      status: "rotating",
      operatorHint: "全市场轮转中",
    } as SystemHealthReport["fullMarketCoverage"],
    guards: [],
    lightScan: snapshot().metadata.lightScan!,
    marketDataQuality: {
      operatorHint: "质量正常",
      status: "clean",
    } as SystemHealthReport["marketDataQuality"],
    operations: {
      batchDetail: "6 planned",
      lastProblemScanAt: null,
      lastSuccessfulScanAt: "2026-06-19T08:00:00.000Z",
      minutesUntilNextScan: 14,
      minutesUntilStale: 29,
      operatorHint: "scan ready",
      persistedArchive: true,
      recentProblemCount: 0,
      recentSuccessCount: 3,
      repositoryMode: "database",
      requestDetail: "6 CoinGlass requests planned",
      runtimeCacheStatus: "updated",
      runtimeDetail: "radar_get updated",
      runtimeTrigger: "radar_get",
      verdict: "healthy",
    },
    outcomes: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      coveragePercent: 35,
      dueEvents: 2,
      latestOutcomeAt: "2026-06-19T07:00:00.000Z",
      latestRunAt: "2026-06-19T07:30:00.000Z",
      mode: "outcome_executor_mvp",
      operatorHint: "collecting",
      pendingEvents: 12,
      status: "collecting",
      trackingEvents: 20,
    } as SystemHealthReport["outcomes"],
    scanDiagnostics: snapshot().metadata.diagnostics!,
    scanEconomy: {
      guardrail: "no extra requests",
      mode: "scan_economy_mvp",
    } as SystemHealthReport["scanEconomy"],
    scanStatePool: snapshot().metadata.coverage!.statePool!,
    strategyEvolutionLoop: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      canWriteRuleWeights: false,
      mode: "strategy_evolution_loop_mvp",
      status: "collecting",
    } as unknown as SystemHealthReport["strategyEvolutionLoop"],
    v3ForwardMapReviews: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      mode: "v3_forward_map_review_mvp",
      status: "collecting",
    } as unknown as SystemHealthReport["v3ForwardMapReviews"],
    v3StrategyLoop: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      live: {
        blockedPlans: 0,
        conflictSignals: 0,
        forwardLevels: 0,
        keyLevels: 0,
        missingV3Signals: 0,
        readyPlans: 0,
        riskGateBlocked: 0,
        totalSignals: 1,
        v3Signals: 1,
      },
      mode: "v3_strategy_loop_mvp",
      status: "collecting",
    } as SystemHealthReport["v3StrategyLoop"],
  } as unknown as SystemHealthReport;
}

test("buildBackendContract exposes scan proof and allocation without adding UI assumptions", () => {
  const contract = buildBackendContract({
    health: health(),
    snapshot: snapshot(),
  });

  assert.equal(contract.schemaVersion, "backend-contract.v1");
  assert.equal(contract.source.activeSource, "coinglass");
  assert.equal(contract.dataSourceCapabilities.coinGlassHobbyist.accountPlan, "hobbyist");
  assert.equal(contract.dataSourceCapabilities.coinGlassHobbyist.minuteLimit, 30);
  assert.equal(
    contract.dataSourceCapabilities.coinGlassHobbyist.endpointFamilies.find((family) =>
      family.id === "coins_price_change"
    )?.implementationStatus,
    "blocked",
  );
  assert.ok(
    contract.dataSourceCapabilities.visualizationContracts.some((visualContract) =>
      visualContract.id === "candidate_deep_scan"
    ),
  );
  assert.equal(contract.sourceAudit.publicDiscovery.sources[0]?.source, "binance");
  assert.equal(contract.sourceAudit.publicLightScan.source, "public-light-composite");
  assert.equal(contract.sourceAudit.publicLightScan.topSymbols[0], "ARBUSDT");
  assert.equal(contract.sourceAudit.coinGlassDeepScan.plannedRequests, 6);
  assert.equal(contract.sourceAudit.coinGlassDeepScan.failedPlannedAssets[0], "BAKE");
  assert.match(contract.sourceAudit.guardrail, /CoinGlass deep scan confirms/u);
  assert.equal(contract.runtime.repositoryMode, "database");
  assert.equal(contract.scanProof.fullMarket.eligibleAssets, 420);
  assert.equal(contract.scanProof.fullMarket.pendingAssets, 414);
  assert.equal(contract.scanProof.lightScan.status, "ready");
  assert.equal(contract.scanProof.deepScan.plannedAssets.length, 6);
  assert.equal(contract.scanProof.deepScan.emptyResultAssets[0], "BAKE");
  assert.equal(contract.scanProof.allocation.capacity, 6);
  assert.equal(contract.scanProof.allocation.assets.find((asset) => asset.symbol === "BTCUSDT")?.bucket, "anchor");
  assert.equal(contract.scanProof.allocation.assets.find((asset) => asset.symbol === "ARBUSDT")?.bucket, "hot");
  assert.equal(contract.scanProof.allocation.assets.find((asset) => asset.symbol === "BAKEUSDT")?.bucket, "cold_exploration");
  assert.equal(contract.scanProof.twoStageAllocation?.mode, "two_stage_deep_scan_v1");
  assert.equal(contract.scanProof.twoStageAllocation?.stageTwo.explorationSlots, 1);
  assert.ok(contract.scanProof.twoStageAllocation?.stageTwo.queuedPriorityAssets.includes("SUI"));
  assert.equal(contract.analysis.v3Coverage.withV3Signals, 2);
  assert.equal(contract.analysis.evolution.canAutoAdjustWeights, false);
  assert.ok(contract.guardrails.includes("no_silent_ui_truncation"));
  assert.ok(contract.guardrails.includes("light_scan_never_trades_directly"));
});
