import type { SystemHealthReport } from "./system-health";
import {
  buildBusinessCapabilityReport,
  type BusinessCapabilityReport,
} from "./business-capability";
import {
  buildCoreChainGovernanceReport,
  type CoreChainGovernanceReport,
} from "./core-chain-governance";
import type {
  TimeframeHardGateAction,
  TimeframeHardGateBlocker,
  Timeframe,
} from "../analysis/types";
import type {
  MarketRadarSnapshot,
  ScanSignalMaturityDiagnostics,
  ScanLightScanCandidate,
  ScanRotationAudit,
  ScanStatePoolAssetSample,
  ScanStatePoolKey,
  ScanStatePoolReason,
  ScanTwoStageAllocationPlan,
} from "../market/types";

export type BackendContractSchemaVersion = "backend-contract.v1";

export type DeepScanAllocationBucket =
  | "anchor"
  | "battle_ready"
  | "battle_watch"
  | "cold_exploration"
  | "fallback_rotation"
  | "hot"
  | "pre_trend"
  | "revive_watch"
  | "unknown";

export type DeepScanAllocationAsset = {
  baseAsset: string;
  bucket: DeepScanAllocationBucket;
  cadenceHint: string | null;
  reasons: ScanStatePoolReason[];
  scannedThisRound: boolean;
  selectedThisRound: boolean;
  source: "diagnostics_planned_asset" | "state_pool";
  state: ScanStatePoolKey | "PUBLIC_LIGHT_SCAN" | "UNKNOWN";
  symbol: string;
};

export type BackendContract = {
  schemaVersion: BackendContractSchemaVersion;
  generatedAt: string;
  source: {
    activeSource: MarketRadarSnapshot["metadata"]["source"];
    configuredProvider: string;
    isRealtime: boolean;
    mode: SystemHealthReport["dataSource"]["mode"];
    status: SystemHealthReport["dataSource"]["status"];
  };
  dataSourceCapabilities: SystemHealthReport["dataSourceCapabilities"];
  sourceAudit: {
    coinGlassCapability: SystemHealthReport["coinGlassRuntimeCapability"];
    coinGlassDeepScan: {
      cleanRows: number;
      failedPlannedAssets: string[];
      plannedAssets: string[];
      plannedRequests: number;
      rawRows: number;
      requestFailures: NonNullable<MarketRadarSnapshot["metadata"]["diagnostics"]>["requests"]["requestFailures"];
      status: MarketRadarSnapshot["metadata"]["status"];
    };
    guardrail: string;
    publicDiscovery: {
      fallbackActivated: boolean;
      fallbackInstrumentCount: number;
      liveInstrumentCount: number;
      sources: NonNullable<MarketRadarSnapshot["metadata"]["diagnostics"]>["discovery"]["sources"];
    };
    publicLightScan: {
      acceptedCount: number;
      candidateCount: number;
      notes: string[];
      requestCount: number;
      source: string | null;
      status: "disabled" | "failed" | "missing" | "partial" | "ready";
      topSymbols: string[];
      universeCount: number;
    };
    macroMarket: {
      ageMinutes: number | null;
      allowedUse: "macro_context_only";
      btcDominancePercent: number | null;
      canCreateTradeSignal: false;
      fetchedAt: string | null;
      guardrail: string;
      operatorHint: string;
      source: SystemHealthReport["macroMarket"]["source"];
      status: SystemHealthReport["macroMarket"]["status"];
      total2MarketCapUsd: number | null;
      total3MarketCapUsd: number | null;
    };
  };
  runtime: {
    apiUsage: SystemHealthReport["apiUsage"];
    cacheStatus: SystemHealthReport["operations"]["runtimeCacheStatus"];
    persistedArchive: boolean;
    repositoryMode: SystemHealthReport["operations"]["repositoryMode"];
    runtimeProbes: SystemHealthReport["runtimeProbes"];
    scanStability: SystemHealthReport["scanStability"];
    sourceLatency: SystemHealthReport["dataSourceLatency"];
    trigger: SystemHealthReport["operations"]["runtimeTrigger"];
  };
  presentation: {
    counts: {
      candidateLaneSignals: number;
      currentSignals: number;
      deepScanAllocationAssets: number;
      lightScanCandidates: number;
      lightScanMarks: number;
      mainSignalArea: number;
      omittedStatePoolAssets: number;
      pendingAssets: number;
      tradePlanReady: number;
    };
    noSilentTruncation: true;
    rules: Array<
      | "main_signal_area_requires_evidence_or_trade_plan"
      | "show_empty_states"
      | "show_overflow_counts"
      | "show_pending_assets"
      | "show_signal_maturity"
      | "show_source_status"
    >;
  };
  scanProof: {
    fullMarket: {
      coveragePercent: number;
      eligibleAssets: number;
      pendingAssets: number;
      scannedAssets: number;
      totalAssets: number;
      totalBatches: number;
      status: SystemHealthReport["fullMarketCoverage"]["status"];
      operatorHint: string;
    };
    lightScan: {
      acceptedCount: number;
      candidateCount: number;
      generatedAt: string | null;
      requestCount: number;
      source: string | null;
      status: "disabled" | "failed" | "missing" | "partial" | "ready";
      topCandidates: ScanLightScanCandidate[];
      universeCount: number;
    };
    deepScan: {
      cleanRows: number;
      coinGlassRequestsPlanned: number;
      duplicateSymbolGroups: number;
      emptyResultAssets: string[];
      filteredRows: number;
      plannedAssets: string[];
      primaryRows: number;
      rawRows: number;
      rejectedRows: number;
    };
    allocation: {
      assets: DeepScanAllocationAsset[];
      capacity: number;
      coldExplorationAssets: string[];
      guardrail: string;
      nextBatchAssets: string[];
      notEliminatedAssets: number;
      pendingAssets: string[];
      reviveWatchAssets: string[];
      selectedAssets: string[];
    };
    twoStageAllocation: ScanTwoStageAllocationPlan | null;
    rotationAudit: ScanRotationAudit | null;
  };
  dataQuality: {
    cleanRows: number;
    duplicateSymbolGroups: number;
    filteredRows: number;
    quoteUnsupportedRows: number;
    rawRows: number;
    statusCounts: MarketRadarSnapshot["metadata"]["diagnostics"] extends infer Diagnostics
      ? Diagnostics extends { requests: { statusCounts: infer StatusCounts } }
        ? StatusCounts
        : Record<string, number>
      : Record<string, number>;
    unsupportedExchangeRows: number;
  };
  analysis: {
    businessCapability: BusinessCapabilityReport;
    coreChainGovernance: CoreChainGovernanceReport;
    evolution: {
      allowedUse: "research_only";
      canAutoAdjustWeights: false;
      canMutateLiveRanking: false;
      canWriteRuleWeights: false;
      status: SystemHealthReport["strategyEvolutionLoop"]["status"];
    };
    reviewStatistics: SystemHealthReport["reviewStatistics"];
    signalMaturity: {
      candidateLaneSymbols: string[];
      counts: ScanSignalMaturityDiagnostics["counts"];
      guardrail: string;
      mainSignalSymbols: string[];
      rules: ScanSignalMaturityDiagnostics["rules"];
      tradePlanReadySymbols: string[];
    };
    timeframeGate: {
      blockedSymbols: string[];
      blockers: Record<TimeframeHardGateBlocker, number>;
      conflictTimeframes: Timeframe[];
      counts: Record<TimeframeHardGateAction, number>;
      guardrail: string;
      mode: "multi_timeframe_hard_gate_v1";
    };
    v3Coverage: {
      missingSignals: number;
      ohlcvAttemptedSymbols: string[];
      ohlcvFailureCount: number;
      totalSignals: number;
      withV3Signals: number;
    };
    v3StrategyLoop: {
      missingV3Signals: number;
      readyPlans: number;
      readinessBuckets: SystemHealthReport["v3StrategyLoop"]["readinessBuckets"];
      riskGateBlocked: number;
      status: SystemHealthReport["v3StrategyLoop"]["status"];
      totalSignals: number;
      v3Signals: number;
    };
  };
  apiSurfaces: {
    backendContract: "/api/radar/backend-contract";
    businessCapability: "/api/radar/business-capability";
    coinGlassCapability: "/api/admin/coinglass/capability";
    health: "/api/health";
    radar: "/api/radar";
    scan: "/api/scan";
    signalDossier: "/api/radar/dossier?symbol=SYMBOL";
  };
  guardrails: string[];
};

function normalizeBaseAsset(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[-_/]/g, "")
    .replace(/(USDT|USDC|USD|PERP|SWAP)\.?P?$/u, "");
}

function normalizeSymbol(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[-_/]/g, "");

  if (normalized.endsWith("USDT")) {
    return normalized;
  }

  if (normalized.endsWith("USDC") || normalized.endsWith("USD")) {
    return `${normalizeBaseAsset(normalized)}USDT`;
  }

  return `${normalized}USDT`;
}

function buildTimeframeGateSummary(snapshot: MarketRadarSnapshot): BackendContract["analysis"]["timeframeGate"] {
  const counts: Record<TimeframeHardGateAction, number> = {
    ALLOW: 0,
    WAIT_HIGH_TIMEFRAME_BREAK: 0,
    WATCH_ONLY: 0,
  };
  const blockers: Record<TimeframeHardGateBlocker, number> = {
    regime_timeframe_double_conflict: 0,
    structure_timeframe_conflict: 0,
  };
  const blockedSymbols: string[] = [];
  const conflictTimeframes = new Set<Timeframe>();

  for (const signal of snapshot.signals) {
    const gate = signal.timeframeGate;

    if (!gate) {
      counts.ALLOW += 1;
      continue;
    }

    counts[gate.action] += 1;

    if (!gate.allowed) {
      blockedSymbols.push(signal.symbol);
    }

    for (const blocker of gate.blockedBy) {
      blockers[blocker] += 1;
    }

    for (const timeframe of gate.conflictTimeframes) {
      conflictTimeframes.add(timeframe);
    }
  }

  return {
    blockedSymbols,
    blockers,
    conflictTimeframes: Array.from(conflictTimeframes),
    counts,
    guardrail: "低周期不能推翻高周期；1h/4h 压力未解除只能等待突破；1d/1w 双冲突只能观察。",
    mode: "multi_timeframe_hard_gate_v1",
  };
}

function allocationBucket({
  fallbackActivated,
  lightCandidate,
  sample,
}: {
  fallbackActivated: boolean;
  lightCandidate?: ScanLightScanCandidate;
  sample?: ScanStatePoolAssetSample;
}): DeepScanAllocationBucket {
  if (sample?.tier === "anchor" || sample?.reasons.includes("anchor_market_context")) {
    return "anchor";
  }

  if (sample?.state === "BATTLE_READY") {
    return "battle_ready";
  }

  if (sample?.state === "BATTLE_WATCH") {
    return "battle_watch";
  }

  if (sample?.state === "HOT" || lightCandidate?.state === "HOT") {
    return "hot";
  }

  if (sample?.state === "COLD") {
    return "cold_exploration";
  }

  if (
    sample?.state === "CANDIDATE" ||
    sample?.state === "DEEP_QUEUE" ||
    sample?.state === "WARM" ||
    lightCandidate?.state === "PRE_TREND" ||
    lightCandidate?.state === "WARM"
  ) {
    return "pre_trend";
  }

  if (fallbackActivated) {
    return "fallback_rotation";
  }

  return "unknown";
}

function buildAllocationAssets(snapshot: MarketRadarSnapshot): DeepScanAllocationAsset[] {
  const diagnostics = snapshot.metadata.diagnostics;
  const plannedAssets = diagnostics?.requests.plannedAssets ?? snapshot.metadata.coverage?.scannedAssets ?? [];
  const statePoolSamples = snapshot.metadata.coverage?.statePool?.assetSamples ?? [];
  const lightCandidates = snapshot.metadata.lightScan?.topCandidates ?? [];
  const fallbackActivated = diagnostics?.discovery.fallbackActivated ?? false;
  const uniqueSymbols = new Set<string>();

  return plannedAssets.flatMap((plannedAsset) => {
    const symbol = normalizeSymbol(plannedAsset);

    if (uniqueSymbols.has(symbol)) {
      return [];
    }

    uniqueSymbols.add(symbol);

    const baseAsset = normalizeBaseAsset(symbol);
    const sample = statePoolSamples.find((item) =>
      normalizeSymbol(item.symbol) === symbol ||
      normalizeBaseAsset(item.baseAsset) === baseAsset
    );
    const lightCandidate = lightCandidates.find((item) =>
      normalizeSymbol(item.symbol) === symbol ||
      normalizeBaseAsset(item.baseAsset) === baseAsset
    );

    return [{
      baseAsset,
      bucket: allocationBucket({
        fallbackActivated,
        lightCandidate,
        sample,
      }),
      cadenceHint: sample?.cadenceHint ?? null,
      reasons: sample?.reasons ?? [],
      scannedThisRound: sample?.scannedThisRound ?? snapshot.metadata.coverage?.scannedAssets.includes(baseAsset) ?? false,
      selectedThisRound: sample?.selectedThisRound ?? true,
      source: sample ? "state_pool" : "diagnostics_planned_asset",
      state: sample?.state ?? (lightCandidate ? "PUBLIC_LIGHT_SCAN" : "UNKNOWN"),
      symbol,
    }];
  });
}

export function buildBackendContract({
  health,
  snapshot,
}: {
  health: SystemHealthReport;
  snapshot: MarketRadarSnapshot;
}): BackendContract {
  const coverage = snapshot.metadata.coverage ?? health.coverage;
  const diagnostics = snapshot.metadata.diagnostics;
  const requests = diagnostics?.requests;
  const v3Coverage = diagnostics?.v3Coverage;
  const statePool = coverage.statePool ?? health.scanStatePool;
  const lightScan = snapshot.metadata.lightScan ?? health.lightScan;
  const signalMaturity = snapshot.metadata.signalMaturity ?? {
    candidateLaneSymbols: [],
    counts: {
      DEEP_SCAN_CANDIDATE: 0,
      EVIDENCE_SIGNAL: snapshot.signals.length,
      LIGHT_SCAN_MARK: lightScan?.candidateCount ?? 0,
      REVIEW_ONLY: 0,
      TRADE_PLAN_READY: 0,
    },
    guardrail: "轻扫标记不进入主信号区；深扫候选只能进候选/验证中区域；复盘观察只用于解释晚到/追涨风险；只有证据融合信号和交易计划就绪能进入主信号区。",
    mainSignalSymbols: snapshot.signals.map((signal) => signal.symbol),
    rules: [
      "LIGHT_SCAN_MARK is scheduling input only",
      "DEEP_SCAN_CANDIDATE is visible as verifying candidate only",
      "EVIDENCE_SIGNAL can enter the main signal area without a trade plan",
      "REVIEW_ONLY is late/no-chase education and cannot attach a trade plan",
      "TRADE_PLAN_READY is the only maturity allowed to attach a structured trade plan",
    ],
    tradePlanReadySymbols: [],
  };
  const liveV3 = health.v3StrategyLoop.live;
  const allocationAssets = buildAllocationAssets(snapshot);
  const timeframeGate = buildTimeframeGateSummary(snapshot);
  const businessCapability = buildBusinessCapabilityReport({
    health,
    snapshot,
  });
  const coreChainGovernance = buildCoreChainGovernanceReport({
    businessCapability,
    health,
    snapshot,
  });

  return {
    schemaVersion: "backend-contract.v1",
    generatedAt: health.generatedAt,
    source: {
      activeSource: snapshot.metadata.source,
      configuredProvider: health.dataSource.configuredProvider,
      isRealtime: snapshot.metadata.isRealtime,
      mode: health.dataSource.mode,
      status: health.dataSource.status,
    },
    dataSourceCapabilities: health.dataSourceCapabilities,
    sourceAudit: {
      coinGlassCapability: health.coinGlassRuntimeCapability,
      coinGlassDeepScan: {
        cleanRows: requests?.cleanRows ?? 0,
        failedPlannedAssets: requests?.emptyResultAssets ?? [],
        plannedAssets: requests?.plannedAssets ?? coverage.scannedAssets,
        plannedRequests: requests?.coinGlassRequestsPlanned ?? 0,
        rawRows: requests?.rawRows ?? 0,
        requestFailures: requests?.requestFailures ?? [],
        status: snapshot.metadata.status,
      },
      guardrail: "Binance/OKX/Bybit public light scan can discover and prioritize; CoinGlass deep scan confirms funds and risk; neither bypasses Evidence or Risk Gate.",
      publicDiscovery: {
        fallbackActivated: diagnostics?.discovery.fallbackActivated ?? false,
        fallbackInstrumentCount: diagnostics?.discovery.fallbackInstrumentCount ?? 0,
        liveInstrumentCount: diagnostics?.discovery.liveInstrumentCount ?? 0,
        sources: diagnostics?.discovery.sources ?? [],
      },
      publicLightScan: {
        acceptedCount: lightScan?.acceptedCount ?? 0,
        candidateCount: lightScan?.candidateCount ?? 0,
        notes: lightScan?.notes ?? [],
        requestCount: lightScan?.requestCount ?? 0,
        source: lightScan?.source ?? null,
        status: lightScan?.status ?? "missing",
        topSymbols: (lightScan?.topCandidates ?? []).slice(0, 20).map((candidate) => candidate.symbol),
        universeCount: lightScan?.universeCount ?? 0,
      },
      macroMarket: {
        ageMinutes: health.macroMarket.ageMinutes,
        allowedUse: health.macroMarket.allowedUse,
        btcDominancePercent: health.macroMarket.btcDominancePercent,
        canCreateTradeSignal: health.macroMarket.canCreateTradeSignal,
        fetchedAt: health.macroMarket.fetchedAt,
        guardrail: health.macroMarket.guardrail,
        operatorHint: health.macroMarket.operatorHint,
        source: health.macroMarket.source,
        status: health.macroMarket.status,
        total2MarketCapUsd: health.macroMarket.total2MarketCapUsd,
        total3MarketCapUsd: health.macroMarket.total3MarketCapUsd,
      },
    },
    runtime: {
      apiUsage: health.apiUsage,
      cacheStatus: health.operations.runtimeCacheStatus,
      persistedArchive: health.operations.persistedArchive,
      repositoryMode: health.operations.repositoryMode,
      runtimeProbes: health.runtimeProbes,
      scanStability: health.scanStability,
      sourceLatency: health.dataSourceLatency,
      trigger: health.operations.runtimeTrigger,
    },
    presentation: {
      counts: {
        candidateLaneSignals: signalMaturity.candidateLaneSymbols.length,
        currentSignals: snapshot.signals.length,
        deepScanAllocationAssets: allocationAssets.length,
        lightScanCandidates: lightScan?.candidateCount ?? 0,
        lightScanMarks: signalMaturity.counts.LIGHT_SCAN_MARK,
        mainSignalArea: signalMaturity.mainSignalSymbols.length,
        omittedStatePoolAssets: statePool.omittedAssetCount,
        pendingAssets: coverage.pending,
        tradePlanReady: signalMaturity.tradePlanReadySymbols.length,
      },
      noSilentTruncation: true,
      rules: [
        "main_signal_area_requires_evidence_or_trade_plan",
        "show_empty_states",
        "show_overflow_counts",
        "show_pending_assets",
        "show_signal_maturity",
        "show_source_status",
      ],
    },
    scanProof: {
      fullMarket: {
        coveragePercent: coverage.coveragePercent,
        eligibleAssets: coverage.eligible,
        operatorHint: health.fullMarketCoverage.operatorHint,
        pendingAssets: coverage.pending,
        scannedAssets: coverage.scanned,
        status: health.fullMarketCoverage.status,
        totalAssets: coverage.total,
        totalBatches: coverage.totalBatches,
      },
      lightScan: {
        acceptedCount: lightScan?.acceptedCount ?? 0,
        candidateCount: lightScan?.candidateCount ?? 0,
        generatedAt: lightScan?.generatedAt ?? null,
        requestCount: lightScan?.requestCount ?? 0,
        source: lightScan?.source ?? null,
        status: lightScan?.status ?? "missing",
        topCandidates: lightScan?.topCandidates ?? [],
        universeCount: lightScan?.universeCount ?? 0,
      },
      deepScan: {
        cleanRows: requests?.cleanRows ?? 0,
        coinGlassRequestsPlanned: requests?.coinGlassRequestsPlanned ?? 0,
        duplicateSymbolGroups: requests?.duplicateSymbolGroups ?? 0,
        emptyResultAssets: requests?.emptyResultAssets ?? [],
        filteredRows: requests?.filteredRows ?? 0,
        plannedAssets: requests?.plannedAssets ?? coverage.scannedAssets,
        primaryRows: requests?.primaryRows ?? snapshot.signals.length,
        rawRows: requests?.rawRows ?? 0,
        rejectedRows: (requests?.filteredRows ?? 0) +
          (requests?.quoteUnsupportedRows ?? 0) +
          (requests?.unsupportedExchangeRows ?? 0),
      },
      allocation: {
        assets: allocationAssets,
        capacity: statePool.deepScan.capacity,
        coldExplorationAssets: statePool.proof.coldExplorationAssets,
        guardrail: statePool.deepScan.guardrail || statePool.guardrail,
        nextBatchAssets: statePool.proof.nextBatchAssets,
        notEliminatedAssets: statePool.proof.notEliminatedAssets,
        pendingAssets: statePool.proof.pendingAssets,
        reviveWatchAssets: statePool.proof.reviveWatchAssets,
        selectedAssets: statePool.deepScan.selectedAssets,
      },
      twoStageAllocation: coverage.twoStageAllocation ?? null,
      rotationAudit: coverage.rotationAudit ?? null,
    },
    dataQuality: {
      cleanRows: requests?.cleanRows ?? 0,
      duplicateSymbolGroups: requests?.duplicateSymbolGroups ?? 0,
      filteredRows: requests?.filteredRows ?? 0,
      quoteUnsupportedRows: requests?.quoteUnsupportedRows ?? 0,
      rawRows: requests?.rawRows ?? 0,
      statusCounts: requests?.statusCounts ?? {},
      unsupportedExchangeRows: requests?.unsupportedExchangeRows ?? 0,
    },
    analysis: {
      businessCapability,
      coreChainGovernance,
      evolution: {
        allowedUse: "research_only",
        canAutoAdjustWeights: false,
        canMutateLiveRanking: false,
        canWriteRuleWeights: false,
        status: health.strategyEvolutionLoop.status,
      },
      reviewStatistics: health.reviewStatistics,
      signalMaturity: {
        candidateLaneSymbols: signalMaturity.candidateLaneSymbols,
        counts: signalMaturity.counts,
        guardrail: signalMaturity.guardrail,
        mainSignalSymbols: signalMaturity.mainSignalSymbols,
        rules: signalMaturity.rules,
        tradePlanReadySymbols: signalMaturity.tradePlanReadySymbols,
      },
      timeframeGate,
      v3Coverage: {
        missingSignals: v3Coverage?.missingSignals ?? Math.max(0, snapshot.signals.length - liveV3.v3Signals),
        ohlcvAttemptedSymbols: v3Coverage?.ohlcvAttemptedSymbols ?? [],
        ohlcvFailureCount: v3Coverage?.ohlcvFailureCount ?? 0,
        totalSignals: v3Coverage?.totalSignals ?? snapshot.signals.length,
        withV3Signals: v3Coverage?.withV3Signals ?? liveV3.v3Signals,
      },
      v3StrategyLoop: {
        missingV3Signals: liveV3.missingV3Signals,
        readyPlans: liveV3.readyPlans,
        readinessBuckets: health.v3StrategyLoop.readinessBuckets,
        riskGateBlocked: liveV3.riskGateBlocked,
        status: health.v3StrategyLoop.status,
        totalSignals: liveV3.totalSignals,
        v3Signals: liveV3.v3Signals,
      },
    },
    apiSurfaces: {
      backendContract: "/api/radar/backend-contract",
      businessCapability: "/api/radar/business-capability",
      coinGlassCapability: "/api/admin/coinglass/capability",
      health: "/api/health",
      radar: "/api/radar",
      scan: "/api/scan",
      signalDossier: "/api/radar/dossier?symbol=SYMBOL",
    },
    guardrails: [
      "no_auto_execution",
      "no_auto_weight_change",
      "no_live_ranking_mutation",
      "no_silent_ui_truncation",
      "light_scan_never_trades_directly",
      "deep_scan_budget_is_explicit",
      "report_is_translation_only",
    ],
  };
}
