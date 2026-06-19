import type { SystemHealthReport } from "./system-health";
import type {
  MarketRadarSnapshot,
  ScanLightScanCandidate,
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
  runtime: {
    cacheStatus: SystemHealthReport["operations"]["runtimeCacheStatus"];
    persistedArchive: boolean;
    repositoryMode: SystemHealthReport["operations"]["repositoryMode"];
    trigger: SystemHealthReport["operations"]["runtimeTrigger"];
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
    evolution: {
      allowedUse: "research_only";
      canAutoAdjustWeights: false;
      canMutateLiveRanking: false;
      canWriteRuleWeights: false;
      status: SystemHealthReport["strategyEvolutionLoop"]["status"];
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
      riskGateBlocked: number;
      status: SystemHealthReport["v3StrategyLoop"]["status"];
      totalSignals: number;
      v3Signals: number;
    };
  };
  apiSurfaces: {
    backendContract: "/api/radar/backend-contract";
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

  if (sample?.state === "REVIVE_WATCH") {
    return "revive_watch";
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
  const liveV3 = health.v3StrategyLoop.live;

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
    runtime: {
      cacheStatus: health.operations.runtimeCacheStatus,
      persistedArchive: health.operations.persistedArchive,
      repositoryMode: health.operations.repositoryMode,
      trigger: health.operations.runtimeTrigger,
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
        assets: buildAllocationAssets(snapshot),
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
      evolution: {
        allowedUse: "research_only",
        canAutoAdjustWeights: false,
        canMutateLiveRanking: false,
        canWriteRuleWeights: false,
        status: health.strategyEvolutionLoop.status,
      },
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
        riskGateBlocked: liveV3.riskGateBlocked,
        status: health.v3StrategyLoop.status,
        totalSignals: liveV3.totalSignals,
        v3Signals: liveV3.v3Signals,
      },
    },
    apiSurfaces: {
      backendContract: "/api/radar/backend-contract",
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
