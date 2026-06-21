import type { JournalEvent, MarketSignal, SignalMaturityStage } from "@/lib/analysis/types";
import type { ScanQuotaPlan } from "./scan-quota";

export type ExchangeId = "BINANCE" | "OKX" | "BYBIT" | "COINBASE" | "UNKNOWN";

export type MarketDataSource =
  | "mock"
  | "coinglass"
  | "exchange_public"
  | "coingecko"
  | "composite";

export type MarketDataStatus = "ready" | "partial" | "stale" | "failed";

export type ContractInstrument = {
  id: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: "perpetual" | "delivery";
  isActive: boolean;
  volume24hUsd: number;
  openInterestUsd?: number;
  tags: string[];
  lastSeenAt: string;
};

export type InstrumentRejectionReason =
  | "inactive"
  | "quote_not_supported"
  | "market_type_not_supported"
  | "volume_below_floor";

export type InstrumentPoolOptions = {
  minVolume24hUsd?: number;
  allowedQuoteAssets?: string[];
  allowedMarketTypes?: ContractInstrument["marketType"][];
};

export type RejectedInstrument = {
  instrument: ContractInstrument;
  reason: InstrumentRejectionReason;
};

export type InstrumentPoolSummary = {
  total: number;
  accepted: number;
  rejected: number;
  duplicatesRemoved: number;
  minVolume24hUsd: number;
  quoteAssets: string[];
  marketTypes: ContractInstrument["marketType"][];
};

export type InstrumentPoolResult = {
  instruments: ContractInstrument[];
  rejected: RejectedInstrument[];
  summary: InstrumentPoolSummary;
};

export type MarketTicker = {
  symbol: string;
  exchange: ExchangeId;
  price: number;
  changePercent24h: number;
  volume24hUsd: number;
  high24h: number;
  low24h: number;
  updatedAt: string;
};

export type DerivativeSnapshot = {
  symbol: string;
  exchange: ExchangeId;
  source: MarketDataSource;
  openInterestUsd: number;
  openInterestChangePercent: number;
  fundingRate: number;
  fundingRateZScore: number;
  longShortRatio?: number;
  liquidationUsd24h?: number;
  updatedAt: string;
};

export type HeatmapTone = "up" | "watch" | "sleep" | "down";

export type MarketHeatCell = {
  symbol: string;
  tone: HeatmapTone;
  changePercent: number;
  anomalyScore: number;
  volumeRank?: number;
};

export type VenueCoverageQuality =
  | "major_three"
  | "multi_exchange"
  | "single_exchange"
  | "unlisted";

export type ExchangeCoverageSummary = {
  majorThree: number;
  multiExchange: number;
  singleExchange: number;
  unlisted: number;
};

export type AssetExchangeCoverage = {
  baseAsset: string;
  exchangeCount: number;
  exchanges: ExchangeId[];
  symbol: string;
  venueCoverage: VenueCoverageQuality;
};

export type ScanTierKey = "anchor" | "core" | "active" | "long_tail";

export type ScanTierCounts = Record<ScanTierKey, number>;

export type ScanTierPolicy = {
  activeEveryWindows: number;
  longTailEveryWindows: number;
};

export type ScanPriorityReason =
  | "anomaly"
  | "cooldown_review"
  | "history"
  | "liquidity"
  | "missed_opportunity"
  | "recent_signal"
  | "recent_deep_scan"
  | "rotation_age"
  | "venue_coverage";

export type ScanPriorityDecision = {
  baseAsset: string;
  dynamicBoost: number;
  reasons: ScanPriorityReason[];
  score: number;
  staticPriority: number;
  symbol: string;
};

export type ScanPriorityCandidateStatus = "already_selected" | "queued" | "selected";

export type ScanPriorityCandidate = ScanPriorityDecision & {
  status: ScanPriorityCandidateStatus;
  statusReason: string;
};

export type ScanStatePoolKey =
  | "BATTLE_READY"
  | "BATTLE_WATCH"
  | "CANDIDATE"
  | "COLD"
  | "COOLDOWN"
  | "DEEP_QUEUE"
  | "HOT"
  | "REVIVE_WATCH"
  | "WARM";

export type ScanStatePoolReason =
  | "anchor_market_context"
  | "battle_ready"
  | "battle_watch"
  | "cold_exploration"
  | "cooldown_risk"
  | "derivative_activity"
  | "dynamic_priority"
  | "light_scan_pending"
  | "recent_or_historical_review"
  | "signal_candidate"
  | "tier_rotation"
  | "volume_price_anomaly";

export type ScanStatePoolCounts = Record<ScanStatePoolKey, number>;

export type ScanStatePoolAssetSample = {
  baseAsset: string;
  cadenceHint: string;
  nextAction: string;
  promotionBridge?: ScanPromotionBridgeSample;
  reasons: ScanStatePoolReason[];
  scannedThisRound: boolean;
  selectedThisRound: boolean;
  state: ScanStatePoolKey;
  symbol: string;
  tier?: ScanTierKey;
  venueCoverage?: VenueCoverageQuality;
};

export type ScanPromotionBridgeSample = {
  allowedUse: "scan_explanation_only";
  baseAsset: string;
  blockers: string[];
  canMutateLiveRanking: false;
  currentState: ScanStatePoolKey;
  drivers: string[];
  rewardRisk: number | null;
  summary: string;
  suggestedState: ScanStatePoolKey;
  symbol: string;
  v2?: {
    decision: string;
    riskGateAllowed: boolean;
    stage: string;
  };
  v3?: {
    decision: string;
    riskGateAllowed: boolean;
    state: string;
  };
};

export type ScanStatePoolLane = {
  cadenceHint: string;
  count: number;
  id: ScanStatePoolKey;
  label: string;
  operatorHint: string;
  queued: number;
  samples: string[];
  selected: number;
};

export type ScanStatePoolReport = {
  assetSamples: ScanStatePoolAssetSample[];
  counts: ScanStatePoolCounts;
  deepScan: {
    anchorSlots: number;
    battleSlots: number;
    capacity: number;
    explorationSlots: number;
    guardrail: string;
    hotSlots: number;
    queuedAssets: string[];
    reviveSlots: number;
    selectedAssets: string[];
  };
  guardrail: string;
  lanes: ScanStatePoolLane[];
  mode: "state_pool_mvp";
  omittedAssetCount: number;
  proof: {
    coldExplorationAssets: string[];
    nextBatchAssets: string[];
    notEliminatedAssets: number;
    notes: string[];
    pendingAssets: string[];
    reviveWatchAssets: string[];
    scannedAssets: string[];
    universeAssets: number;
  };
  promotionBridge: {
    guardrail: string;
    samples: ScanPromotionBridgeSample[];
    summary: {
      blockedByRisk: number;
      conflictOrInvalidated: number;
      eligibleForBattle: number;
      readonlySignals: number;
      rewardRiskBlocked: number;
    };
  };
};

export type ScanAssetStatePayload = {
  notes?: string[];
  recentDeepScanTimes?: string[];
  source: "scan_rotation_state_v1";
};

export type ScanAssetState = {
  baseAsset: string;
  consecutiveSkipped: number;
  deepScanCount1h: number;
  deepScanCount24h: number;
  dynamicPriorityScore: number;
  lastDeepScannedAt: string | null;
  lastLightScannedAt: string | null;
  lastSelectedReason: string | null;
  lastSkippedReason: string | null;
  payload: ScanAssetStatePayload;
  rotationPriorityScore: number;
  statePool: ScanStatePoolKey;
  symbol: string;
  tier: ScanTierKey;
  updatedAt: string;
  wasDisplacedByDynamicPriority: boolean;
};

export type ScanDynamicPriorityPlan = {
  boostedAssets: string[];
  candidateCount: number;
  candidates: ScanPriorityCandidate[];
  enabled: boolean;
  reasonCounts: Record<ScanPriorityReason, number>;
  slotsAvailable: number;
  slotsUsed: number;
  topAssets: ScanPriorityDecision[];
};

export type ScanTwoStageSlotKind =
  | "anchor_context"
  | "active_rotation"
  | "core_rotation"
  | "hot_priority"
  | "long_tail_exploration"
  | "revive_priority";

export type ScanTwoStageSlot = {
  baseAsset: string;
  kind: ScanTwoStageSlotKind;
  priorityReasons: ScanPriorityReason[];
  reason: string;
  slotIndex: number;
  source: "anchor" | "dynamic_priority" | "exploration_reserve" | "tier_rotation";
  symbol: string;
  tier: ScanTierKey;
  venueCoverage: VenueCoverageQuality;
};

export type ScanTwoStageAllocationPlan = {
  guardrail: string;
  mode: "two_stage_deep_scan_v1";
  slots: ScanTwoStageSlot[];
  stageOne: {
    priorityCandidates: number;
    priorityQueued: number;
    source: "public_light_scan_and_repository_hints";
    universeAssets: number;
  };
  stageTwo: {
    anchorSlots: number;
    capacity: number;
    explorationSlots: number;
    prioritySlots: number;
    queuedPriorityAssets: string[];
    rotationSlots: number;
    selectedAssets: string[];
  };
};

export type ScanRotationAuditWarning = {
  action: string;
  detail: string;
  id:
    | "deep_scan_starved"
    | "exploration_missing"
    | "full_cycle_slow"
    | "priority_queue_waiting"
    | "single_rotation_slot";
  severity: "high" | "low" | "medium";
};

export type ScanRotationAudit = {
  fairnessRules: string[];
  guardrail: string;
  mode: "scan_rotation_audit_v1";
  operatorHint: string;
  priorityQueue: {
    queuedAssets: string[];
    queuedCount: number;
    selectedPriorityAssets: string[];
  };
  slots: {
    anchorSlots: number;
    dynamicPrioritySlots: number;
    explorationReserveSlots: number;
    rotatingSlots: number;
    selectedLongTailAssets: string[];
    selectedNonAnchorAssets: string[];
  };
  status: "blocked" | "healthy" | "starved" | "watch";
  timing: {
    cadenceMinutes: 15;
    estimatedFullCycleMinutes: number;
    estimatedFullCycleWindows: number;
    pendingNonAnchorAssets: number;
  };
  warnings: ScanRotationAuditWarning[];
};

export type ScanCoverage = {
  batchIndex: number;
  coveragePercent: number;
  dynamicPriority?: ScanDynamicPriorityPlan;
  eligible: number;
  exchangeCoverage?: AssetExchangeCoverage[];
  exchangeCoverageSummary?: ExchangeCoverageSummary;
  nextBatchIndex: number;
  pending: number;
  pendingAssets: string[];
  scanned: number;
  scannedAssets: string[];
  selectedTierCounts?: ScanTierCounts;
  skipped: number;
  skippedAssets: Array<{
    reason: InstrumentRejectionReason;
    symbol: string;
  }>;
  rotationAudit?: ScanRotationAudit;
  statePool?: ScanStatePoolReport;
  tierCounts?: ScanTierCounts;
  tierPolicy?: ScanTierPolicy;
  twoStageAllocation?: ScanTwoStageAllocationPlan;
  total: number;
  totalBatches: number;
};

export type ScanDiscoverySourceDiagnostic = {
  error?: string;
  instrumentCount: number;
  reason?: string;
  requestCount: number;
  source: string;
  status: "failed" | "fallback" | "ok" | "partial";
  statusCode?: number;
};

export type ScanLightScanCandidate = {
  baseAsset: string;
  changePercent24h: number;
  distanceFromHighPercent: number;
  distanceFromLowPercent: number;
  reasons: string[];
  score: number;
  state: "COLD" | "HOT" | "PRE_TREND" | "WARM";
  symbol: string;
  volume24hUsd: number;
  volatilityPercent: number;
};

export type ScanLightScanDiagnostics = {
  acceptedCount: number;
  candidateCount: number;
  generatedAt: string;
  notes: string[];
  requestCount: number;
  source: string;
  status: "disabled" | "failed" | "partial" | "ready";
  topCandidates: ScanLightScanCandidate[];
  universeCount: number;
};

export type ScanDataQualityStatus =
  | "clean"
  | "conflict"
  | "empty"
  | "fallback_only"
  | "filtered"
  | "live_ok"
  | "stale"
  | "unsupported";

export type ScanRequestDiagnostics = {
  acceptedInstruments: number;
  cleanRows: number;
  coinGlassRequestsPlanned: number;
  duplicateSymbolGroups: number;
  emptyResultAssets: string[];
  filteredRows: number;
  plannedAssets: string[];
  primaryRows: number;
  quoteUnsupportedRows: number;
  rawRows: number;
  statusCounts: Record<ScanDataQualityStatus, number>;
  unsupportedExchangeRows: number;
};

export type ScanV3CoverageDiagnostics = {
  missingSignals: number;
  ohlcvAttemptedSymbols: string[];
  ohlcvFailureCount: number;
  totalSignals: number;
  withV3Signals: number;
};

export type ScanDiagnostics = {
  discovery: {
    fallbackActivated: boolean;
    fallbackInstrumentCount: number;
    liveInstrumentCount: number;
    sources: ScanDiscoverySourceDiagnostic[];
  };
  requests: ScanRequestDiagnostics;
  v3Coverage: ScanV3CoverageDiagnostics;
};

export type ScanSignalMaturityDiagnostics = {
  candidateLaneSymbols: string[];
  counts: Record<SignalMaturityStage, number>;
  guardrail: string;
  mainSignalSymbols: string[];
  rules: string[];
  tradePlanReadySymbols: string[];
};

export type ScanRuntimeDiagnostics = {
  cacheStatus?: "failed" | "served_cache" | "updated";
  persistedArchive: boolean;
  repositoryMode?: "database" | "memory";
  trigger:
    | "cron_post"
    | "health_get"
    | "internal"
    | "journal_get"
    | "page_ssr"
    | "radar_get"
    | "readiness_get"
    | "scan_get"
    | "unknown";
};

export type ScanMetadata = {
  id: string;
  mode: "demo" | "scheduled" | "manual";
  status: MarketDataStatus;
  source: MarketDataSource;
  isRealtime: boolean;
  cadenceMinutes: number;
  scannedCount: number;
  anomalyCount: number;
  candidateCount: number;
  riskGate: "on" | "off";
  generatedAt: string;
  nextScanAt: string;
  quota?: ScanQuotaPlan;
  diagnostics?: ScanDiagnostics;
  lightScan?: ScanLightScanDiagnostics;
  macroWeather?: import("./macro-weather").MacroWeatherReport;
  signalMaturity?: ScanSignalMaturityDiagnostics;
  runtime?: ScanRuntimeDiagnostics;
  staleAfterMinutes: number;
  notes: string[];
  coverage?: ScanCoverage;
};

export type ScanArchiveSummary = {
  id: string;
  source: MarketDataSource;
  status: MarketDataStatus;
  generatedAt: string;
  scannedCount: number;
  anomalyCount: number;
  candidateCount: number;
  topSymbols: string[];
  notes: string[];
};

export type ScanReplaySignal = {
  id: string;
  symbol: string;
  direction: MarketSignal["direction"];
  state: MarketSignal["state"];
  timeframe: MarketSignal["timeframe"];
  confidence: number;
  risk: MarketSignal["risk"];
  riskReward: number;
  maturity?: MarketSignal["maturity"];
  timeframeGate?: MarketSignal["timeframeGate"];
  strategyStatus: MarketSignal["strategy"]["status"] | "unknown";
  strategyV3?: MarketSignal["strategyV3"];
  updatedAt: string;
  summary: string;
};

export type ScanReplayFrame = {
  id: string;
  source: MarketDataSource;
  status: MarketDataStatus;
  generatedAt: string;
  nextScanAt: string;
  cadenceMinutes: number;
  scannedCount: number;
  anomalyCount: number;
  candidateCount: number;
  signals: ScanReplaySignal[];
};

export type ScanComparison = {
  fromId: string;
  toId: string;
  scannedDelta: number;
  anomalyDelta: number;
  candidateDelta: number;
  newSignalSymbols: string[];
  removedSignalSymbols: string[];
  statusChanged: boolean;
  sourceChanged: boolean;
};

export type ScanArchiveBundle = {
  entries: ScanArchiveSummary[];
  latestReplay?: ScanReplayFrame;
  comparison?: ScanComparison | null;
  retention: {
    storage: "memory" | "database";
    durable: boolean;
    maxEntries: number;
  };
};

export type MarketRadarSnapshot = {
  metadata: ScanMetadata;
  instrumentPool: InstrumentPoolResult;
  instruments: ContractInstrument[];
  tickers: MarketTicker[];
  derivatives: DerivativeSnapshot[];
  heatmap: MarketHeatCell[];
  signals: MarketSignal[];
  journalEvents: JournalEvent[];
  archive?: ScanArchiveBundle;
};

export type MarketDataProvider = {
  id: MarketDataSource;
  label: string;
  fetchSnapshot: () => Promise<MarketRadarSnapshot>;
};
