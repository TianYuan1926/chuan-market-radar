import type {
  EvidencePoint,
  JournalEvent,
  MarketSignal,
  RiskGrade,
  SignalDirection,
  SignalMaturityStage,
} from "../analysis/types";
import type { ForwardLevel, KeyLevel, StrategyV3TradePlan } from "../analysis/v3/types";
import type { SignalBackendDossier } from "../market/signal-backend-dossier";
import { createPublicExchangeOhlcvProvider } from "../market/ohlcv/public-exchange-provider";
import type {
  Candle as OhlcvCandle,
  OhlcvCandleCacheEntry,
  OhlcvInterval,
  OhlcvProvider,
} from "../market/ohlcv/types";
import type {
  DerivativeSnapshot,
  MarketRadarSnapshot,
  MarketTicker,
  ScanLightScanDiagnostics,
  ScanLightScanCandidate,
} from "../market/types";
import { isCryptoFuturesUnderlying } from "../market/asset-class-filter";
import { classifySignalMaturity } from "../market/signal-maturity";
import {
  buildPersonalPositionLens,
  type PersonalPositionLens,
} from "../risk/personal-position-lens";
import type { BackendContract } from "./backend-contract";
import type { BusinessCapabilityStage } from "./business-capability";
import type { CoreChainGovernanceReport } from "./core-chain-governance";
import type { DailyMoverReadArchiveSuccess } from "./daily-mover-readonly";
import type { KlineOverlay } from "../chart-types";

export type DataStatus =
  | "loading"
  | "live"
  | "cached"
  | "stale"
  | "partial"
  | "empty"
  | "error"
  | "failed";

export type Resource<T> = {
  status: DataStatus;
  data: T;
  updatedAt?: string;
  ageSec?: number;
  source?: string;
  reason?: string;
};

export type ScanProofData = {
  totalMonitored: number;
  scannable: number;
  lightScanned: number;
  deepScanned: number;
  awaitingDeepScan: number;
  deepCoverage: number;
  coverage: number;
  lastScanAt: string;
  nextScanCountdownSec: number;
  stuck: boolean;
};

export type DeepScanQueue = {
  currentBatch: string[];
  nextBatch: string[];
  highPriority: string[];
  coldExploration: string[];
  longUnscanned: { symbol: string; idleMin: number }[];
};

export type CapabilityStage = {
  key: string;
  name: string;
  desc: string;
  status: "active" | "standby" | "degraded";
  note: string;
};

export type DataSourceState = {
  name: "CoinGlass" | "Binance" | "OKX" | "Bybit";
  feed: "live" | "cached" | "stale" | "partial" | "failed";
  latencyMs: number | null;
  latencyStatus: "ready" | "partial" | "unconfigured" | "unavailable";
  lastUpdate: string;
  note: string;
};

export type SignalMaturity =
  | SignalMaturityStage
  | "BLOCKED"
  | "INVALIDATED"
  | "COOLDOWN";

export type DiscoveryPressureSide = "buy" | "neutral" | "sell";

export type DiscoveryProxyQuality =
  | "reason_tag_proxy"
  | "rolling_price_volume_proxy"
  | "taker_trade_proxy";

export type DiscoveryFact = {
  buyPressureUsd: number | null;
  changePercent24h: number | null;
  cvdProxyUsd: number | null;
  decisionBoundary: string;
  earlyOpportunityScore: number | null;
  flowImbalance: number | null;
  foundInLightScan: boolean;
  opportunityPhase: ScanLightScanCandidate["opportunityPhase"] | null;
  overextensionRisk: ScanLightScanCandidate["overextensionRisk"] | null;
  pressureSide: DiscoveryPressureSide | null;
  proxyQuality: DiscoveryProxyQuality | null;
  reasons: string[];
  score: number | null;
  sellPressureUsd: number | null;
  source: "light_scan_top_candidate" | "not_in_light_scan_top_candidates";
  state: ScanLightScanCandidate["state"] | null;
  summary: string;
  symbol: string;
  volume24hUsd: number | null;
  volumeWindowUsd: number | null;
};

export type RadarSignal = {
  id: string;
  symbol: string;
  hue: number;
  direction: "多" | "空" | "观察";
  maturity: SignalMaturity;
  lifecycle: SignalLifecycleRead;
  operatorRead: SignalOperatorRead;
  rr: number | null;
  risk: "低" | "中" | "高" | "极高";
  evidenceCount: number;
  counterCount: number;
  freshness: DataSourceState["feed"];
  whySelected: string;
  whyBlocked: string | null;
  updatedMinAgo: number;
  discovery?: DiscoveryFact | null;
};

export type SignalLifecycleRead = {
  firstSeenAt: string | null;
  lastUpdatedAt: string | null;
  ageMin: number;
  ageLabel: string;
  freshnessLabel: "刚出现" | "近期有效" | "旧信号" | "已过期";
  status: "new" | "active" | "stale" | "expired";
  source: "current_signal_timestamp" | "light_scan_snapshot" | "leaderboard_candidate";
  summary: string;
};

export type SignalOperatorLane = "sniper" | "watch" | "validate" | "blocked" | "review";

export type SignalOperatorRead = {
  lane: SignalOperatorLane;
  laneLabel: "狙击榜" | "重点观察" | "验证中" | "不看" | "只复盘";
  worthWatching: boolean;
  canTrade: boolean;
  headline: string;
  nextAction: string;
  noTradeReason: string | null;
};

export type OpportunityQualityCandidate = {
  symbol: string;
  maturity: SignalMaturity;
  phase: ScanLightScanCandidate["opportunityPhase"] | null;
  earlyOpportunityScore: number | null;
  overextensionRisk: ScanLightScanCandidate["overextensionRisk"] | null;
  whySelected: string;
  whyBlocked: string | null;
  nextAction: string;
};

export type OpportunityQualityState = {
  schemaVersion: "opportunity-quality.v1";
  status: "healthy" | "watch" | "blocked";
  summary: string;
  counts: {
    blocked: number;
    breakoutWatch: number;
    deepScanCandidate: number;
    earlySetup: number;
    evidenceSignal: number;
    lateMove: number;
    reviewOnly: number;
    totalVisible: number;
    tradePlanReady: number;
    waitingPullbackOrRetest: number;
  };
  antiChase: {
    blockedLateSignals: number;
    guardrails: string[];
  };
  nextActions: string[];
  topCandidates: OpportunityQualityCandidate[];
};

export type TfStructure = {
  tf: "15m" | "1h" | "4h" | "1d";
  phase: string;
  trend: "多" | "空" | "震荡";
  priorHigh: number;
  priorLow: number;
  support: number;
  resistance: number;
};

export type EvidenceItem = {
  sourceId: string;
  kind: string;
  label: string;
  weight: number;
  detail: string;
  supportive: boolean;
};

export type CounterItem = {
  sourceId: string;
  kind: string;
  label: string;
  detail: string;
};

export type RiskGateResult = {
  allowTradePlan: boolean;
  reasons: string[];
};

export type TradePlanData = {
  bias: "多" | "空" | "观望";
  entryCondition: string;
  stop: string;
  tp1: string;
  tp2: string;
  tp3: string;
  rr: number;
  positionLens: PersonalPositionLens;
  scaleOut: string;
  invalidation: string;
  allowChase: boolean;
};

export type AiReviewData = {
  reviewed: boolean;
  findings: string[];
  suggestDowngrade: boolean;
  note: string;
};

export type AnalysisReportSection = {
  key: "facts" | "supportive_evidence" | "counter_evidence" | "risk_gate" | "trade_plan" | "review_boundary";
  title: string;
  status: "ready" | "partial" | "blocked" | "empty";
  items: {
    detail: string;
    label: string;
    sourceId?: string;
  }[];
};

export type TokenChartIntegrity = {
  availableTimeframes: string[];
  canUseMockCandles: false;
  overlaySource: "v3_key_levels_forward_map_trade_plan" | "none";
  selectedTimeframe: string;
  status: "ready" | "partial" | "empty";
  tradingViewSymbol: string | null;
  tradingViewUrl: string | null;
};

export type TokenDossier = {
  symbol: string;
  direction: "看多" | "看空" | "中性";
  maturity: SignalMaturity;
  chart: TokenChartIntegrity;
  discovery: DiscoveryFact;
  structures: TfStructure[];
  evidence: EvidenceItem[];
  counter: CounterItem[];
  riskGate: RiskGateResult;
  strategyReadiness: TokenStrategyReadiness;
  tradePlan: TradePlanData | null;
  aiReview: AiReviewData;
  reportSections: AnalysisReportSection[];
};

export type TokenStrategyReadiness = {
  schemaVersion: "token-strategy-readiness.v1";
  status: "ready" | "blocked" | "watch" | "review_only";
  canTradeNow: boolean;
  summary: string;
  nextAction: string;
  missingPieces: string[];
  guardrails: string[];
  executionMap: TokenExecutionMap;
  positionLensStatus: PersonalPositionLens["status"] | "not_applicable";
  personalLens: string;
};

export type TokenExecutionMap = {
  schemaVersion: "token-execution-map.v1";
  directionRead: "bullish" | "bearish" | "neutral";
  tradabilityRead: "trade_plan_ready" | "wait_confirmation" | "wait_pullback_or_retest" | "review_only" | "blocked";
  positionQuality: "good" | "waiting" | "late" | "unknown";
  waitFor: string[];
  invalidIf: string[];
  chartBoundary: string;
  manualReviewRequired: true;
};

export type SignalLifecycle = {
  id: string;
  symbol: string;
  hue: number;
  side: "多" | "空";
  appearedAt: string;
  triggerPrice: number;
  stopPrice: number;
  targetPrice: number;
  verifyWindowH: number;
  hitTpFirst: boolean;
  hitSlFirst: boolean;
  timedOut: boolean;
  mfe: number;
  mae: number;
};

export type StrategyArchetype = {
  key: string;
  name: string;
  winRate: number | null;
  avgRR: number | null;
  samples: number;
  commonFailure: string;
};

export type MissedDetection = {
  symbol: string;
  hue: number;
  move: number;
  side: "涨" | "跌";
  reason: "未进轻扫" | "未进深扫" | "被风控挡住" | "证据不足";
  detail: string;
  improvement: string;
};

export type EvolutionSuggestion = {
  title: string;
  rationale: string;
  impact: "高" | "中" | "低";
  adopted: boolean;
};

export type ServiceNode = {
  key: string;
  name: string;
  status: "healthy" | "degraded" | "down";
  detail: string;
};

export type DataPipelineState = {
  lastScanAt: string;
  lastWriteAt: string;
  stale: boolean;
  cacheHit: boolean;
  recentError: string | null;
  recentSuccess: string;
};

export type ApiUsageState = {
  provider: "CoinGlass";
  usedToday: number;
  remainingToday: number;
  perMinuteLimit: number;
  pacingMs: number;
  throttled: boolean;
  source: "redis" | "unconfigured" | "unavailable";
};

export type PetBackendStatus = {
  system: "正常" | "降级" | "异常";
  scan: "扫描中" | "空闲" | "卡住";
  signal: "有就绪信号" | "验证中" | "无信号";
  risk: "低" | "中" | "高";
  rank: string;
  discipline: "优秀" | "良好" | "需改进";
  review: "已完成" | "待复盘";
  todayPerf: number;
};

export type LeaderboardKind =
  | "gainers"
  | "losers"
  | "volume"
  | "volatility_squeeze"
  | "relative_strength"
  | "oi_change"
  | "funding_hot";

export type LeaderboardRow = {
  symbol: string;
  hue: number;
  value: number;
  price: number;
  source: "public_market_ticker" | "scanner_snapshot_ticker" | "light_scan_candidate" | "derivatives_context";
  sourceLabel: string;
  venueScope: string;
  sortKey: string;
  rankingScope: "market_board" | "radar_candidate_board" | "derivatives_board";
  updatedAt?: string;
  inCandidatePool: boolean;
  deepScanned: boolean;
  hasSignal: boolean;
  blocked: boolean;
  awaitingScan: boolean;
};

export type MacroAltEnv = {
  btcState: "强势" | "震荡" | "弱势";
  ethState: "强势" | "震荡" | "弱势";
  btcDominance: number;
  btcDominanceTrend: "上升" | "下降" | "走平";
  total2: number;
  total3: number;
  altStrength: number;
  riskMode: "进攻" | "中性" | "防守";
  suggestion: "更适合做多" | "更适合做空" | "建议观望";
};

export type DerivativesState = {
  connectedFields: string[];
  oiChange: number;
  funding: number;
  longShortRatio: number;
  takerBuySell: number;
  takerBuySellStatus: "connected" | "not_connected";
  exchangeCoverage: number;
  totalExchanges: number;
  lastUpdate: string;
  unavailableFields: string[];
};

export type FundFlowState = {
  allowedUse: "market_context_only";
  canCreateTradeSignal: false;
  detail: string;
  connectedFields: string[];
  decisionBoundary: string;
  source: "coinglass_derivatives" | "not_connected";
  status: "partial" | "waiting_source";
  takerBuySellAvailable: boolean;
  unavailableFields: string[];
};

export type ScanStabilityState = {
  issues: Array<{
    code: string;
    detail: string;
    severity: "info" | "watch" | "critical";
  }>;
  score: number;
  status: "blocked" | "healthy" | "watch";
  summary: string;
};

export type LightScanQualityCheckStatus = "blocked" | "pass" | "watch";

export type LightScanQualityCheck = {
  detail: string;
  evidence: string[];
  key: string;
  label: string;
  status: LightScanQualityCheckStatus;
};

export type LightScanQualityCandidate = {
  changePercent: number;
  earlyOpportunityScore: number | null;
  flowImbalance: number | null;
  opportunityPhase: ScanLightScanCandidate["opportunityPhase"] | null;
  overextensionRisk: ScanLightScanCandidate["overextensionRisk"] | null;
  pressureSide: "buy" | "neutral" | "sell" | null;
  reasons: string[];
  score: number;
  state: ScanLightScanCandidate["state"];
  symbol: string;
  volatilityPercent: number;
  volumeWindowUsd: number | null;
};

export type LightScanQualityState = {
  ageSec: number | null;
  canCreateTradeSignal: false;
  checks: LightScanQualityCheck[];
  coverage: {
    acceptedCount: number;
    averagePriorityScore: number;
    buyPressureCandidateCount: number;
    candidateCount: number;
    cvdProxyCandidateCount: number;
    earlyOpportunityCandidateCount: number;
    hotCandidateCount: number;
    lateMoveCandidateCount: number;
    preTrendCandidateCount: number;
    rollingWindowCandidateCount: number;
    sellPressureCandidateCount: number;
    topCandidateCount: number;
    universeCount: number;
    zScoreCandidateCount: number;
  };
  generatedAt: string;
  guardrails: string[];
  schemaVersion: "light-scan-quality.v1";
  source: string;
  staleAfterSec: number;
  status: "blocked" | "healthy" | "watch";
  summary: string;
  topCandidates: LightScanQualityCandidate[];
};

export type RealtimeCadenceBand =
  | "second_level"
  | "fast_refresh"
  | "minute_level"
  | "low_frequency"
  | "review_cycle";

export type RealtimeCapabilityLane = {
  key: string;
  label: string;
  cadenceBand: RealtimeCadenceBand;
  cadenceLabel: string;
  status: DataStatus;
  source: string;
  metrics: string[];
  allowedUse: "anomaly_discovery" | "candidate_refresh" | "validation" | "context" | "review";
  canCreateTradeSignal: false;
  guardrail: string;
  note: string;
};

export type RealtimeCapabilityState = {
  schemaVersion: "realtime-capability.v1";
  secondLevelOnline: boolean;
  summary: string;
  lanes: RealtimeCapabilityLane[];
  boundaries: string[];
};

export type DeepScanQualityState = {
  schemaVersion: "deep-scan-quality.v1";
  status: "healthy" | "watch" | "blocked";
  summary: string;
  plannedAssets: number;
  plannedRequests: number;
  rawRows: number;
  cleanRows: number;
  cleanRate: number;
  failedAssets: string[];
  requestFailures: Array<{
    code: string | null;
    error: string;
    symbol: string;
  }>;
  boundary: string;
  guardrails: string[];
};

export type MacroReadinessState = {
  schemaVersion: "macro-readiness.v1";
  status: "healthy" | "watch" | "blocked";
  summary: string;
  riskMode: MacroAltEnv["riskMode"];
  availableFields: string[];
  missingFields: string[];
  guardrails: string[];
};

export type OpsReliabilityCheck = {
  key: string;
  label: string;
  status: "pass" | "watch" | "blocked";
  detail: string;
};

export type OpsReliabilityState = {
  schemaVersion: "ops-reliability.v1";
  status: "healthy" | "watch" | "blocked";
  summary: string;
  checks: OpsReliabilityCheck[];
  nextActions: string[];
};

export type RadarContract = {
  scanProof: Resource<ScanProofData>;
  deepScanQueue: Resource<DeepScanQueue>;
  capabilityStages: Resource<CapabilityStage[]>;
  coreChainGovernance: Resource<CoreChainGovernanceReport>;
  dataSources: Resource<DataSourceState[]>;
  apiUsage: Resource<ApiUsageState>;
  dataPipeline: Resource<DataPipelineState>;
  petBackendStatus: Resource<PetBackendStatus>;
  radarSignals: Resource<RadarSignal[]>;
  macroAltEnv: Resource<MacroAltEnv>;
  derivatives: Resource<DerivativesState>;
  fundFlow: Resource<FundFlowState>;
  scanStability: Resource<ScanStabilityState>;
  lightScanQuality: Resource<LightScanQualityState>;
  realtimeCapability: Resource<RealtimeCapabilityState>;
  opportunityQuality: Resource<OpportunityQualityState>;
  deepScanQuality: Resource<DeepScanQualityState>;
  macroReadiness: Resource<MacroReadinessState>;
  opsReliability: Resource<OpsReliabilityState>;
  serviceNodes: Resource<ServiceNode[]>;
};

export type ReviewStatsData = {
  closedSamples: number;
  evidenceSamples: number;
  maeAvg: number;
  mfeAvg: number;
  pendingSamples: number;
  sampleStatus: "empty" | "collecting" | "usable" | "statistically_thin";
  summary: string;
  totalSamples: number;
  winRate: number | null;
};

export type DiscoveryReviewState = {
  calibration: {
    earlyOutcomeLink: "ready" | "collecting";
    lateSignalPenalty: "active" | "collecting";
    mfeMaeLink: "ready" | "collecting";
    notes: string[];
    status: "usable" | "collecting" | "empty";
    summary: string;
  };
  cvdProxyCandidateCount: number;
  earlyOpportunityCount: number;
  guardrails: string[];
  lateMoveCount: number;
  missedDetectionCount: number;
  reviewFocus: string[];
  summary: string;
  totalLightCandidates: number;
};

export type OpportunityCalibrationSegment = {
  key: "early_setup" | "breakout_watch" | "late_move" | "cvd_proxy";
  label: string;
  currentCandidates: number;
  closedSamples: number;
  metricSamples: number;
  interpretation: string;
  nextAction: string;
};

export type OpportunityCalibrationState = {
  schemaVersion: "opportunity-calibration.v1";
  status: "usable" | "collecting" | "empty";
  summary: string;
  sampleGate: {
    minClosedSamples: number;
    minMetricSamples: number;
    closedSamples: number;
    metricSamples: number;
    ready: boolean;
  };
  thresholds: {
    earlyHotScore: number;
    earlyWarmScore: number;
    lateMoveHighRisk: string;
    minimumStructuralRR: number;
  };
  segments: OpportunityCalibrationSegment[];
  guardrails: string[];
};

export type AiReviewStats = {
  disabled: number;
  fallback: number;
  reviewed: number;
  total: number;
  unboundFallbackProtected: boolean;
};

export type DailyMoverReviewState = {
  schemaVersion: "daily-mover-review-status.v1";
  status: "empty" | "collecting" | "usable";
  snapshotCount: number;
  selectedDetailCount: number;
  missedReviewCount: number;
  calibrationSuggestionCount: number;
  latestSnapshotId: string | null;
  latestObservedAt: string | null;
  summary: string;
  nextAction: string;
  guardrails: string[];
};

export type HistoricalBacktestLaneMetric = {
  avgMaePct: number;
  avgMfePct: number;
  avgOpportunityScore: number;
  count: number;
  falsePositiveRatePct: number;
  hitCount: number;
  hitRatePct: number;
  lane: "radar" | "momentum" | "volume" | "random";
  lateCount: number;
  lateRatePct: number;
};

export type HistoricalBacktestFinding = {
  detail: string;
  id: string;
  severity: "low" | "medium" | "high";
  title: string;
};

export type HistoricalBacktestScoreBucket = {
  avgMaePct: number;
  avgMfePct: number;
  count: number;
  hitRatePct: number;
  label: string;
  lateRatePct: number;
};

export type HistoricalBacktestReasonMetric = {
  avgMaePct: number;
  avgMfePct: number;
  count: number;
  hitRatePct: number;
  lateRatePct: number;
  reason: string;
};

export type HistoricalBacktestMissedOpportunity = {
  change24hPct: number;
  direction: "LONG" | "SHORT";
  mfePct: number;
  observedAt: string;
  opportunityScore: number;
  reasons: string[];
  symbol: string;
};

export type HistoricalBacktestAuditV2Finding = {
  detail: string;
  id: string;
  layer: string;
  nextAction: string;
  rootCause: string;
  severity: "high" | "medium" | "low";
  title: string;
};

export type HistoricalBacktestAuditV2Remediation = {
  acceptanceCriteria: string;
  action: string;
  canAutoApply: false;
  layer: string;
  priority: "P0" | "P1" | "P2";
  targetModule: string;
};

export type HistoricalBacktestAuditV2LaneMetric = {
  avgConfidence: number;
  avgMaePct: number;
  avgMfePct: number;
  avgMoveAtSelectionPct: number;
  avgVolumeRatio: number;
  count: number;
  earlyHitCount: number;
  earlyHitRatePct: number;
  hitCount: number;
  hitRatePct: number;
  lane: "momentum" | "radar" | "random" | "volume";
  lateCount: number;
  lateRatePct: number;
  qualityScore: number;
};

export type HistoricalBacktestAuditV2TimingMetrics = {
  earlyCount: number;
  earlyRatePct: number;
  lateCount: number;
  lateRatePct: number;
  noPlanCount: number;
  planReadyCount: number;
};

export type HistoricalBacktestAuditOpportunityLaneMetric = {
  avgRadarRank: number | null;
  avgRadarScore: number;
  captureRatePct: number;
  capturedCount: number;
  hitCount: number;
  hitRatePct: number;
  label: string;
  lane: "early_setup" | "higher_timeframe_context" | "pullback_retest" | "risk_review";
  lateCount: number;
  lateRatePct: number;
  missedEarlyHitCount: number;
  missedEarlyQualityHitCount: number;
  planReadyCount: number;
  qualityHitCount: number;
  qualityHitRatePct: number;
  selectedCount: number;
  totalNodes: number;
};

export type HistoricalBacktestAuditOpportunityQualityId =
  | "fakeout_risk"
  | "late_move"
  | "noise"
  | "premium_early_setup"
  | "trade_plan_ready"
  | "watch_only";

export type HistoricalBacktestAuditOpportunityQualityMetric = {
  avgRadarRank: number | null;
  capturedCount: number;
  captureRatePct: number;
  conditionalWaitCount: number;
  falsePositiveCount: number;
  falsePositiveRatePct: number;
  hitCount: number;
  id: HistoricalBacktestAuditOpportunityQualityId;
  label: string;
  lateCount: number;
  missedQualityHitCount: number;
  nextAction: string;
  planReadyCount: number;
  qualityHitCount: number;
  qualityHitRatePct: number;
  sampleSymbols: string[];
  totalNodes: number;
};

export type HistoricalBacktestAuditCoreFailure = {
  code: string;
  count: number;
  detail: string;
  label: string;
  nextAction: string;
  sampleSymbols: string[];
};

export type HistoricalBacktestAuditCoreCapabilityMetric = {
  failedNodes: number;
  id: "analysis" | "scan" | "strategy";
  keyMetrics: Record<string, number | string | null>;
  label: string;
  mainFailures: HistoricalBacktestAuditCoreFailure[];
  nextAction: string;
  passedNodes: number;
  passRatePct: number;
  score: number;
  status: "fail" | "pass" | "watch";
  summary: string;
  testedNodes: number;
};

export type HistoricalBacktestAuditPlanBlockerMetric = {
  blocker: string;
  capturedCount: number;
  category: string;
  conditionalWaitCount: number;
  count: number;
  diagnosis: string;
  label: string;
  lateCount: number;
  qualityHitCount: number;
  riskReviewCount: number;
  sampleContexts: Array<{
    capturedByRadar: boolean;
    hit: boolean;
    lateAtSelection: boolean;
    nodeRole: string;
    opportunityLane: string;
    qualityHit: boolean;
    rewardRisk: number | null;
    symbol: string;
    tradePlanStatus: string;
  }>;
  sampleSymbols: string[];
};

export type HistoricalBacktestAuditLevelQualityMetric = {
  blocker: string;
  capturedCount: number;
  category: string;
  conditionalWaitCount: number;
  count: number;
  diagnosis: string;
  label: string;
  lateCount: number;
  nextAction: string;
  primaryReason: string;
  primaryReasonLabel: string;
  qualityHitCount: number;
  qualityHitRatePct: number;
  riskReviewCount: number;
  sampleContexts: HistoricalBacktestAuditPlanBlockerMetric["sampleContexts"];
  sampleSymbols: string[];
};

export type HistoricalBacktestAuditWaitPlanEvaluation = {
  barsToTrigger: number | null;
  diagnosticFlags: string[];
  label: string;
  maxAdverseAfterTriggerPct: number | null;
  maxFavorableAfterTriggerPct: number | null;
  outcome: "bad_wait" | "inconclusive" | "no_trade" | "not_applicable" | "useful_wait";
  postTriggerRewardRisk: number | null;
  reason: string;
  status:
    | "missing_plan_levels"
    | "not_triggered"
    | "not_wait_plan"
    | "triggered_sl_first"
    | "triggered_timeout"
    | "triggered_tp_first";
  stopHit: boolean;
  targetHit: boolean;
  triggerObservedAt: string | null;
  triggerPrice: number | null;
  triggerQualityScore: number | null;
};

export type HistoricalBacktestAuditWaitPlanDiagnosticMetric = {
  code: string;
  count: number;
  label: string;
  sampleSymbols: string[];
};

export type HistoricalBacktestAuditWaitPlanMetric = {
  avgTriggerQualityScore: number | null;
  badWaitRatePct: number;
  diagnosticBreakdown: HistoricalBacktestAuditWaitPlanDiagnosticMetric[];
  label: string;
  missingLevelCount: number;
  noTradeRatePct: number;
  notTriggeredCount: number;
  stopFirstCount: number;
  targetFirstCount: number;
  timeoutCount: number;
  totalWaitPlans: number;
  triggeredCount: number;
  usefulWaitRatePct: number;
};

export type HistoricalBacktestAuditPressureMetric = {
  captureRatePct: number;
  earlyCaptureRatePct: number;
  label: string;
  missedEarlyQualityHitCount: number;
  qualityHitRatePct: number;
  selectedCount: number;
  topN: number;
  universePressurePct: number;
};

export type HistoricalBacktestAuditMarketRegimeMetric = {
  avgRadarRank: number | null;
  captureRatePct: number;
  label: string;
  lateRatePct: number;
  qualityHitRatePct: number;
  regime: string;
  sampleSymbols: string[];
  totalNodes: number;
};

export type HistoricalBacktestAuditRuleStabilityMetric = {
  blocker: string;
  label: string;
  missedQualityHitCount: number;
  occurrenceCount: number;
  sampleSymbols: string[];
  selectedUsefulCount: number;
  stabilityScore: number;
  status: "stable" | "unstable" | "watch";
};

export type HistoricalBacktestAuditRoundTrendMetric = {
  current: number | null;
  delta: number | null;
  label: string;
  previous: number | null;
  status: "flat" | "improved" | "regressed" | "unavailable";
};

export type HistoricalBacktestAuditRoundTrendComparison = {
  metrics: HistoricalBacktestAuditRoundTrendMetric[];
  previousReportId: string | null;
  summary: string;
};

export type HistoricalBacktestAuditV2MissedOpportunity = {
  coinType: string;
  coinTypeLabel: string;
  confidence: number;
  direction: "long" | "short";
  maePct: number;
  mfePct: number;
  moveAtSelectionPct: number;
  nodeRole: string;
  observedAt: string;
  opportunityLane: HistoricalBacktestAuditOpportunityLaneMetric["lane"];
  opportunityLaneLabel: string;
  opportunityLaneScore: number;
  opportunityQuality: HistoricalBacktestAuditOpportunityQualityId;
  opportunityQualityLabel: string;
  planBlockers: string[];
  radarRank: number | null;
  radarScore: number;
  reason: string;
  rewardRisk: number | null;
  symbol: string;
  timeframeBand: string;
  tradePlanStatus: string;
  validationWindowLabel: string;
  volumeRatio: number;
};

export type HistoricalBacktestAuditRoundNode = {
  capturedByRadar: boolean;
  coinType: string;
  coinTypeLabel: string;
  confidence: number;
  direction: "long" | "short";
  findingCount: number;
  hit: boolean;
  lateAtSelection: boolean;
  maePct: number;
  maturity: string;
  mfePct: number;
  moveAtSelectionPct: number;
  nodeIndex: number;
  nodeRole: string;
  observedAt: string;
  opportunityLane: HistoricalBacktestAuditOpportunityLaneMetric["lane"];
  opportunityLaneLabel: string;
  opportunityLaneScore: number;
  opportunityQuality: HistoricalBacktestAuditOpportunityQualityId;
  opportunityQualityLabel: string;
  planBlockers: string[];
  qualityHit: boolean;
  radarRank: number | null;
  radarScore: number;
  rewardRisk: number | null;
  selectedAsOpportunity: boolean;
  selectedLane: HistoricalBacktestAuditOpportunityLaneMetric["lane"] | null;
  symbol: string;
  timeframeBand: "large" | "medium" | "small";
  tradePlanStatus: string;
  validationWindowBars: number;
  validationWindowHours: number;
  validationWindowLabel: string;
  topN: number;
  volumeRatio: number;
  waitPlanEvaluation: HistoricalBacktestAuditWaitPlanEvaluation;
};

export type HistoricalBacktestAuditRoundProgress = {
  candidateUniverseSize: number;
  completedAt: string | null;
  completedNodes: number;
  currentNodeRole: string | null;
  currentSymbol: string | null;
  generatedAt: string;
  guardrails: string[];
  nodes: HistoricalBacktestAuditRoundNode[];
  nodesPerSymbol: number;
  phase: "completed" | "evaluating_nodes" | "failed" | "fetching_candles" | "fetching_derivatives" | "idle" | "planning";
  plannedSymbols: Array<{
    coinType: string;
    coinTypeLabel: string;
    symbol: string;
  }>;
  schemaVersion: "professional-backtest-audit-round-progress.v1";
  status: "completed" | "failed" | "running";
  summary: string;
  totalNodes: number;
  updatedAt: string;
};

export type CoreJudgeSystemLane = {
  id:
    | "analysis_audit"
    | "formal_audit"
    | "golden_cases"
    | "scan_audit"
    | "shadow_live"
    | "strategy_audit";
  label: string;
  source: string;
  status: "fail" | "pass" | "waiting" | "watch";
  summary: string;
  updatedAt?: string;
};

export type CoreJudgeSystemState = {
  guardrails: string[];
  lanes: CoreJudgeSystemLane[];
  schemaVersion: "core-judge-system.v1";
  statusLabel: "不能支撑实战" | "可运行但不完整" | "完整完成" | "等待外部条件" | "临时验证版";
  summary: string;
};

export type HistoricalBacktestAuditV2State = {
  schemaVersion: "professional-backtest-audit-report.v2";
  auditRound?: HistoricalBacktestAuditRoundProgress;
  baselineMetrics: {
    momentum: HistoricalBacktestAuditV2LaneMetric;
    radar: HistoricalBacktestAuditV2LaneMetric;
    random: HistoricalBacktestAuditV2LaneMetric;
    volume: HistoricalBacktestAuditV2LaneMetric;
  };
  cases: number;
  highSeverityFindings: number;
  planReadyCount: number;
  testedCapabilities: number;
  summary: string;
  findings: HistoricalBacktestAuditV2Finding[];
  missedOpportunities: HistoricalBacktestAuditV2MissedOpportunity[];
  judgeSystem?: CoreJudgeSystemState;
  coreCapabilityMetrics: HistoricalBacktestAuditCoreCapabilityMetric[];
  opportunityLaneMetrics: HistoricalBacktestAuditOpportunityLaneMetric[];
  opportunityQualityMetrics: HistoricalBacktestAuditOpportunityQualityMetric[];
  planBlockerMetrics: HistoricalBacktestAuditPlanBlockerMetric[];
  levelQualityMetrics: HistoricalBacktestAuditLevelQualityMetric[];
  waitPlanMetrics: HistoricalBacktestAuditWaitPlanMetric;
  pressureTestMetrics: HistoricalBacktestAuditPressureMetric[];
  marketRegimeMetrics: HistoricalBacktestAuditMarketRegimeMetric[];
  ruleStabilityMetrics: HistoricalBacktestAuditRuleStabilityMetric[];
  roundTrendComparison: HistoricalBacktestAuditRoundTrendComparison;
  remediationPlan: HistoricalBacktestAuditV2Remediation[];
  guardrails: string[];
  timingMetrics: HistoricalBacktestAuditV2TimingMetrics;
};

export type HistoricalBacktestState = {
  schemaVersion: "historical-backtest.v1";
  status: "empty" | "ready" | "degraded";
  generatedAt: string | null;
  reportId: string | null;
  input: {
    days: number | null;
    horizonBars: number | null;
    interval: string | null;
    moveThresholdPct: number | null;
    replayTimes: number | null;
    source: string | null;
    symbolsUsed: number;
    topN: number | null;
  };
  lanes: {
    momentum: HistoricalBacktestLaneMetric;
    radar: HistoricalBacktestLaneMetric;
    random: HistoricalBacktestLaneMetric;
    volume: HistoricalBacktestLaneMetric;
  };
  findings: HistoricalBacktestFinding[];
  diagnostics: {
    missedOpportunities: HistoricalBacktestMissedOpportunity[];
    radarReasonMetrics: HistoricalBacktestReasonMetric[];
    radarScoreBuckets: HistoricalBacktestScoreBucket[];
  };
  summary: string;
  nextAction: string;
  guardrails: string[];
  auditV2?: HistoricalBacktestAuditV2State;
  progress?: HistoricalBacktestAuditRoundProgress;
};

export type ReviewContract = {
  signalLifecycles: Resource<SignalLifecycle[]>;
  strategyArchetypes: Resource<StrategyArchetype[]>;
  missedDetections: Resource<MissedDetection[]>;
  evolutionSuggestions: Resource<EvolutionSuggestion[]>;
  reviewStats: Resource<ReviewStatsData>;
  discoveryReview: Resource<DiscoveryReviewState>;
  opportunityCalibration: Resource<OpportunityCalibrationState>;
  dailyMoverReview: Resource<DailyMoverReviewState>;
  historicalBacktest: Resource<HistoricalBacktestState>;
  aiReviewStats: Resource<AiReviewStats>;
};

export type KlineChartCandle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type KlineChartOverlay = KlineOverlay;

export type KlineContractResource = Resource<KlineChartCandle[]> & {
  overlays: KlineChartOverlay[];
  overlayStatus: DataStatus;
  tradingView?: SignalBackendDossier["chart"]["tradingView"];
};

type FrontendKlineRepository = Pick<
  {
    getOhlcvCandleCache: (symbol: string, interval: OhlcvInterval) => Promise<OhlcvCandleCacheEntry | null>;
    upsertOhlcvCandleCache: (entry: OhlcvCandleCacheEntry) => Promise<OhlcvCandleCacheEntry>;
  },
  "getOhlcvCandleCache" | "upsertOhlcvCandleCache"
>;

type FrontendContractEnv = Partial<Record<
  "COINGLASS_DAILY_REQUEST_BUDGET" | "COINGLASS_REQUEST_INTERVAL_MS" | "WS_LIGHT_SCAN_STALE_AFTER_MS",
  string
>>;

function resource<T>(
  data: T,
  status: DataStatus = "live",
  extra: Omit<Resource<T>, "data" | "status"> = {},
): Resource<T> {
  return {
    status,
    data,
    ...extra,
  };
}

function round(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function safeNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function baseSymbol(value: string) {
  return value.trim().toUpperCase().replace(/[-_/]/g, "").replace(/(USDT|USDC|USD|PERP|SWAP)\.?P?$/u, "");
}

function displaySymbol(value: string) {
  return baseSymbol(value);
}

function addFrontendUniverseSymbol(set: Set<string>, value: string | null | undefined) {
  if (!value) {
    return;
  }
  const symbol = baseSymbol(value);
  if (symbol && isCryptoFuturesUnderlying(symbol)) {
    set.add(symbol);
  }
}

function buildFrontendUniverseSymbols(backend: BackendContract, snapshot: MarketRadarSnapshot) {
  const symbols = new Set<string>();

  snapshot.signals.forEach((signal) => addFrontendUniverseSymbol(symbols, signal.symbol));
  backend.scanProof.lightScan.topCandidates.forEach((candidate) => {
    addFrontendUniverseSymbol(symbols, candidate.baseAsset);
    addFrontendUniverseSymbol(symbols, candidate.symbol);
  });
  backend.scanProof.deepScan.plannedAssets.forEach((symbol) => addFrontendUniverseSymbol(symbols, symbol));
  backend.sourceAudit.coinGlassDeepScan.plannedAssets.forEach((symbol) => addFrontendUniverseSymbol(symbols, symbol));
  backend.scanProof.allocation.selectedAssets.forEach((symbol) => addFrontendUniverseSymbol(symbols, symbol));
  backend.scanProof.allocation.pendingAssets.forEach((symbol) => addFrontendUniverseSymbol(symbols, symbol));
  backend.scanProof.allocation.nextBatchAssets.forEach((symbol) => addFrontendUniverseSymbol(symbols, symbol));
  backend.scanProof.allocation.coldExplorationAssets.forEach((symbol) => addFrontendUniverseSymbol(symbols, symbol));
  backend.scanProof.allocation.reviveWatchAssets.forEach((symbol) => addFrontendUniverseSymbol(symbols, symbol));
  backend.scanProof.allocation.assets.forEach((asset) => {
    addFrontendUniverseSymbol(symbols, asset.baseAsset);
    addFrontendUniverseSymbol(symbols, asset.symbol);
  });

  return symbols;
}

function shouldExposeFrontendAsset(symbol: string, universeSymbols: Set<string>) {
  const base = baseSymbol(symbol);
  if (!isCryptoFuturesUnderlying(base)) {
    return false;
  }
  return universeSymbols.size === 0 || universeSymbols.has(base);
}

function symbolHue(symbol: string) {
  let hash = 0;
  for (const char of symbol) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash % 360;
}

function diffSeconds(from: string | null | undefined, now: Date) {
  if (!from) {
    return undefined;
  }
  const parsed = new Date(from).getTime();
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(0, Math.round((now.getTime() - parsed) / 1000));
}

export function normalizeFrontendKlineSymbol(value: string) {
  const clean = value
    .trim()
    .toUpperCase()
    .replace(/^BINANCE:/u, "")
    .replace(/\.P$/u, "")
    .replace(/[^A-Z0-9]/gu, "");

  if (!clean) {
    return "BTCUSDT";
  }

  return /(USDT|USDC)$/u.test(clean) ? clean : `${baseSymbol(clean)}USDT`;
}

function chartCandleFromOhlcv(candle: OhlcvCandle): KlineChartCandle | null {
  const t = Date.parse(candle.openTime);

  if (!Number.isFinite(t)) {
    return null;
  }

  return {
    t,
    o: candle.open,
    h: candle.high,
    l: candle.low,
    c: candle.close,
    v: candle.volume,
  };
}

function chartCandlesFromOhlcv(candles: OhlcvCandle[]) {
  return candles
    .map(chartCandleFromOhlcv)
    .filter((candle): candle is KlineChartCandle => Boolean(candle));
}

function latestCandleOpenTime(candles: OhlcvCandle[]) {
  return candles.at(-1)?.openTime;
}

function cacheFreshEnough(cache: OhlcvCandleCacheEntry, now: Date, maxAgeMs: number) {
  const fetchedAt = new Date(cache.fetchedAt).getTime();
  return Number.isFinite(fetchedAt) && now.getTime() - fetchedAt <= maxAgeMs;
}

function overlayPrice(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function zoneMid(low: number, high: number) {
  return (low + high) / 2;
}

function dedupeKlineOverlays(overlays: KlineChartOverlay[]) {
  const seen = new Set<string>();

  return overlays.filter((overlay) => {
    const key = `${overlay.kind}:${overlay.sourceId ?? overlay.id}:${overlay.price.toFixed(8)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function klineOverlayFromKeyLevel(level: KeyLevel): KlineChartOverlay | null {
  const price = overlayPrice(level.midPrice || zoneMid(level.zoneLow, level.zoneHigh));
  if (price === null) {
    return null;
  }

  const kind = level.direction === "SUPPORT" ? "support" : "resistance";

  return {
    detail: `${level.timeframe} ${level.type} · ${level.status} · score ${level.keyScore}`,
    id: `key-level:${level.id}`,
    kind,
    label: kind === "support" ? "支撑" : "压力",
    price,
    sourceId: `v3:key-level:${level.id}`,
    tone: kind,
    zoneHigh: level.zoneHigh,
    zoneLow: level.zoneLow,
  };
}

function klineOverlayFromForwardLevel(level: ForwardLevel): KlineChartOverlay | null {
  const price = overlayPrice(zoneMid(level.zoneLow, level.zoneHigh));
  if (price === null) {
    return null;
  }

  const tone = level.role === "INVALIDATION_LEVEL"
    ? "risk"
    : level.side === "SUPPORT"
      ? "support"
      : "resistance";

  return {
    detail: `${level.role} · ${level.status} · score ${level.keyScore}`,
    id: `forward-level:${level.id}`,
    kind: level.role === "INVALIDATION_LEVEL" ? "invalidation" : "forward",
    label: level.role === "INVALIDATION_LEVEL" ? "失效" : level.side === "SUPPORT" ? "前方支撑" : "前方压力",
    price,
    sourceId: `v3:forward-level:${level.id}`,
    tone,
    zoneHigh: level.zoneHigh,
    zoneLow: level.zoneLow,
  };
}

function klineOverlaysFromTradePlan(plan: StrategyV3TradePlan | undefined): KlineChartOverlay[] {
  if (!plan) {
    return [];
  }

  const overlays: KlineChartOverlay[] = [];
  const stop = overlayPrice(plan.structuralStop);
  if (stop !== null) {
    overlays.push({
      detail: plan.invalidation,
      id: "trade-plan:stop",
      kind: "stop",
      label: "结构止损",
      price: stop,
      sourceId: "trade-plan:stop",
      tone: "risk",
    });
  }

  plan.targets.slice(0, 3).forEach((target, index) => {
    const price = overlayPrice(target);
    if (price === null) {
      return;
    }
    overlays.push({
      detail: plan.takeProfitPlan,
      id: `trade-plan:tp${index + 1}`,
      kind: "target",
      label: `TP${index + 1}`,
      price,
      sourceId: `trade-plan:tp${index + 1}`,
      tone: "target",
    });
  });

  return overlays;
}

function buildKlineOverlays(dossier: SignalBackendDossier | null | undefined): KlineChartOverlay[] {
  if (!dossier?.found || !dossier.strategyV3) {
    return [];
  }

  return dedupeKlineOverlays([
    ...dossier.strategyV3.keyLevels.map(klineOverlayFromKeyLevel).filter((item): item is KlineChartOverlay => Boolean(item)),
    ...dossier.strategyV3.forwardLevels.map(klineOverlayFromForwardLevel).filter((item): item is KlineChartOverlay => Boolean(item)),
    ...klineOverlaysFromTradePlan(dossier.strategyV3.tradePlan),
  ]).slice(0, 16);
}

function klineResource(
  data: KlineChartCandle[],
  status: DataStatus,
  extra: Omit<Resource<KlineChartCandle[]>, "data" | "status"> & {
    dossier?: SignalBackendDossier | null;
  } = {},
): KlineContractResource {
  const { dossier, ...resourceExtra } = extra;
  const overlays = buildKlineOverlays(dossier);

  return {
    ...resource(data, status, resourceExtra),
    overlays,
    overlayStatus: overlays.length > 0 ? "live" : "empty",
    tradingView: dossier?.found ? dossier.chart.tradingView : undefined,
  };
}

export async function buildFrontendKlineContract({
  dossier,
  interval,
  limit = 160,
  maxCacheAgeMs = 5 * 60_000,
  now = new Date(),
  ohlcvProvider = createPublicExchangeOhlcvProvider(),
  repository,
  symbol,
}: {
  interval: OhlcvInterval;
  limit?: number;
  maxCacheAgeMs?: number;
  now?: Date;
  ohlcvProvider?: OhlcvProvider;
  repository?: FrontendKlineRepository;
  dossier?: SignalBackendDossier | null;
  symbol: string;
}): Promise<KlineContractResource> {
  const normalizedSymbol = normalizeFrontendKlineSymbol(symbol);
  const cached = repository
    ? await repository.getOhlcvCandleCache(normalizedSymbol, interval)
    : null;

  if (cached && cacheFreshEnough(cached, now, maxCacheAgeMs)) {
    return klineResource(chartCandlesFromOhlcv(cached.candles), "cached", {
      ageSec: diffSeconds(latestCandleOpenTime(cached.candles), now),
      dossier,
      source: cached.source,
      updatedAt: cached.fetchedAt,
    });
  }

  const result = await ohlcvProvider.fetchCandles({
    symbol: normalizedSymbol,
    interval,
    limit,
  });

  if (result.ok) {
    const candles = chartCandlesFromOhlcv(result.candles);
    const fetchedAt = now.toISOString();

    if (repository && result.candles.length > 0) {
      await repository.upsertOhlcvCandleCache({
        allowedUse: "research_only",
        cacheKey: `${normalizedSymbol}:${interval}`,
        canAutoAdjustWeights: false,
        candles: result.candles,
        fetchedAt,
        interval,
        source: result.source,
        symbol: normalizedSymbol,
      });
    }

    return klineResource(candles, candles.length > 0 ? "live" : "empty", {
      ageSec: diffSeconds(latestCandleOpenTime(result.candles), now),
      dossier,
      source: result.source,
      updatedAt: fetchedAt,
      reason: candles.length > 0 ? undefined : "公开 K 线源暂未返回可用蜡烛",
    });
  }

  if (cached) {
    return klineResource(chartCandlesFromOhlcv(cached.candles), "stale", {
      ageSec: diffSeconds(latestCandleOpenTime(cached.candles), now),
      dossier,
      source: cached.source,
      updatedAt: cached.fetchedAt,
      reason: `公开 K 线源请求失败，使用旧缓存：${result.reason}`,
    });
  }

  return klineResource([], "failed", {
    dossier,
    source: result.source,
    reason: result.error,
  });
}

function diffMinutes(from: string | null | undefined, now: Date) {
  const seconds = diffSeconds(from, now);
  return seconds === undefined ? 0 : Math.round(seconds / 60);
}

function ageLabel(ageMin: number) {
  if (ageMin < 1) return "刚刚";
  if (ageMin < 60) return `${ageMin} 分钟前`;
  const hours = Math.floor(ageMin / 60);
  const minutes = ageMin % 60;
  if (hours < 24) return minutes === 0 ? `${hours} 小时前` : `${hours} 小时 ${minutes} 分前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function lifecycleRead({
  at,
  now,
  source,
}: {
  at: string | null | undefined;
  now: Date;
  source: SignalLifecycleRead["source"];
}): SignalLifecycleRead {
  const ageMin = diffMinutes(at, now);
  const status: SignalLifecycleRead["status"] = ageMin <= 15
    ? "new"
    : ageMin <= 60
      ? "active"
      : ageMin <= 240
        ? "stale"
        : "expired";
  const freshnessLabel: SignalLifecycleRead["freshnessLabel"] = status === "new"
    ? "刚出现"
    : status === "active"
      ? "近期有效"
      : status === "stale"
        ? "旧信号"
        : "已过期";

  return {
    firstSeenAt: at ?? null,
    lastUpdatedAt: at ?? null,
    ageMin,
    ageLabel: ageLabel(ageMin),
    freshnessLabel,
    status,
    source,
    summary: `当前只基于${source === "light_scan_snapshot" ? "轻扫快照时间" : source === "leaderboard_candidate" ? "榜单快照时间" : "后端信号更新时间"}判断新旧：${freshnessLabel}，${ageLabel(ageMin)}。`,
  };
}

function operatorReadForSignal({
  blockedReasons,
  discovery,
  maturity,
  rr,
}: {
  blockedReasons: string[];
  discovery?: DiscoveryFact | null;
  maturity: SignalMaturity;
  rr: number | null;
}): SignalOperatorRead {
  if (maturity === "TRADE_PLAN_READY" && rr !== null && rr >= 3 && blockedReasons.length === 0) {
    return {
      lane: "sniper",
      laneLabel: "狙击榜",
      worthWatching: true,
      canTrade: true,
      headline: "交易计划就绪",
      nextAction: "进入单币档案，人工复核入场、止损、目标和失效条件。",
      noTradeReason: null,
    };
  }

  if (maturity === "EVIDENCE_SIGNAL") {
    return {
      lane: "watch",
      laneLabel: "重点观察",
      worthWatching: true,
      canTrade: false,
      headline: "已有证据，但还不能直接做",
      nextAction: "等待结构确认、结构盈亏比和风控门禁全部通过。",
      noTradeReason: blockedReasons[0] ?? "尚未形成完整交易计划。",
    };
  }

  if (maturity === "DEEP_SCAN_CANDIDATE" || maturity === "LIGHT_SCAN_MARK") {
    const phase = discovery?.opportunityPhase === "early_setup"
      ? "启动前候选"
      : discovery?.opportunityPhase === "breakout_watch"
        ? "突破观察候选"
        : "等待验证候选";
    return {
      lane: "validate",
      laneLabel: "验证中",
      worthWatching: discovery?.opportunityPhase === "early_setup" || discovery?.opportunityPhase === "breakout_watch",
      canTrade: false,
      headline: phase,
      nextAction: "等待深扫、盘面结构和证据融合，不允许当作交易信号。",
      noTradeReason: "候选层只说明有异动，未完成交易计划条件。",
    };
  }

  if (maturity === "REVIEW_ONLY") {
    return {
      lane: "review",
      laneLabel: "只复盘",
      worthWatching: false,
      canTrade: false,
      headline: "行情已经偏晚，只做复盘",
      nextAction: "回看启动前窗口，研究系统是否提前看到，不追涨追跌。",
      noTradeReason: blockedReasons[0] ?? "位置已经失去优势。",
    };
  }

  return {
    lane: "blocked",
    laneLabel: "不看",
    worthWatching: false,
    canTrade: false,
    headline: maturity === "INVALIDATED" ? "结构失效" : maturity === "COOLDOWN" ? "冷却观察" : "被风控拦截",
    nextAction: "等待新的结构和证据重新进入候选。",
    noTradeReason: blockedReasons[0] ?? "风控门禁、结构盈亏比、结构或数据完整性未通过。",
  };
}

function timeLabel(value: string | null | undefined) {
  if (!value) {
    return "等待数据";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function dateTimeLabel(value: string | null | undefined) {
  if (!value) {
    return "等待数据";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return `${String(parsed.getMonth() + 1).padStart(2, "0")}/${String(parsed.getDate()).padStart(2, "0")} ${
    String(parsed.getHours()).padStart(2, "0")
  }:${String(parsed.getMinutes()).padStart(2, "0")}`;
}

function marketStatusToResourceStatus(status: string | undefined): DataStatus {
  if (status === "ready") {
    return "live";
  }
  if (status === "partial") {
    return "partial";
  }
  if (status === "stale") {
    return "stale";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "missing" || status === "disabled") {
    return "empty";
  }
  return "partial";
}

function sourceStatusToFeed(status: string | undefined): DataSourceState["feed"] {
  if (status === "ok" || status === "ready") {
    return "live";
  }
  if (status === "partial") {
    return "partial";
  }
  if (status === "fallback") {
    return "cached";
  }
  if (status === "failed") {
    return "failed";
  }
  return "stale";
}

function directionCn(direction: SignalDirection): RadarSignal["direction"] {
  if (direction === "long") {
    return "多";
  }
  if (direction === "short") {
    return "空";
  }
  return "观察";
}

function tokenDirectionCn(direction: SignalDirection | undefined): TokenDossier["direction"] {
  if (direction === "long") {
    return "看多";
  }
  if (direction === "short") {
    return "看空";
  }
  return "中性";
}

function riskCn(risk: RiskGrade | undefined): RadarSignal["risk"] {
  if (risk === "low") {
    return "低";
  }
  if (risk === "medium") {
    return "中";
  }
  if (risk === "high") {
    return "高";
  }
  return "极高";
}

function lifecycleStatusReason(signal: MarketSignal) {
  const reasons: string[] = [];
  if (signal.risk === "blocked" || signal.strategy.status === "blocked") {
    reasons.push("风控门禁拦截");
  }
  if (signal.strategy.riskReward > 0 && signal.strategy.riskReward < 3) {
    reasons.push(`结构盈亏比 ${round(signal.strategy.riskReward, 2)}:1 低于最低 3:1 门槛`);
  }
  if (signal.timeframeGate && !signal.timeframeGate.allowed) {
    reasons.push(signal.timeframeGate.summary || "高周期门控未通过");
  }
  if (signal.state === "invalidated") {
    reasons.push("结构已经失效");
  }
  return reasons;
}

function maturityForSignal(signal: MarketSignal): SignalMaturity {
  if (signal.state === "invalidated") {
    return "INVALIDATED";
  }
  if (lifecycleStatusReason(signal).length > 0) {
    return "BLOCKED";
  }
  return classifySignalMaturity(signal).stage;
}

function reviewOnlyStatusReason(signal: MarketSignal) {
  const maturity = classifySignalMaturity(signal);

  if (maturity.stage !== "REVIEW_ONLY") {
    return [];
  }

  const context = signal.strategyV3?.trendContext;
  const plan = signal.strategyV3?.tradePlan;
  const reasons = [
    "行情已经进入追涨/追空或衰竭风险区，只做复盘观察，不生成交易计划",
    context?.nextStep,
    plan?.summary,
  ].filter((item): item is string => Boolean(item));

  return [...new Set(reasons)];
}

function evidenceKind(layer: EvidencePoint["layer"]) {
  return {
    ai_review: "ai",
    data_quality: "data",
    derivatives: "derivatives",
    flexibility: "strategy",
    indicators: "ta",
    lifecycle_review: "review",
    market_regime: "regime",
    price_volume: "volume",
    risk_reward: "rr",
    structure_location: "structure",
  }[layer];
}

function evidenceWeight(item: EvidencePoint, total: number) {
  if (total <= 0) {
    return 0;
  }
  const base = item.polarity === "supportive" ? 100 / total : 50 / total;
  return Math.max(1, Math.round(base));
}

function evidenceSourceId(item: EvidencePoint, index: number) {
  const label = item.label
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gu, "-")
    .replace(/^-|-$/gu, "");

  return `${item.layer}:${label || "evidence"}:${index + 1}`;
}

function buildRadarSignal(signal: MarketSignal, snapshot: MarketRadarSnapshot, now: Date): RadarSignal {
  const maturity = maturityForSignal(signal);
  const blockers = [
    ...lifecycleStatusReason(signal),
    ...reviewOnlyStatusReason(signal),
  ];
  const supportive = signal.evidence.filter((item) => item.polarity === "supportive");
  const counter = signal.evidence.filter((item) => item.polarity === "conflicting" || item.polarity === "blocking");
  const rr = signal.strategy.riskReward > 0 ? round(signal.strategy.riskReward, 2) : null;

  return {
    id: signal.id,
    symbol: displaySymbol(signal.symbol),
    hue: symbolHue(signal.symbol),
    direction: directionCn(signal.direction),
    maturity,
    lifecycle: lifecycleRead({
      at: signal.updatedAt,
      now,
      source: "current_signal_timestamp",
    }),
    operatorRead: operatorReadForSignal({
      blockedReasons: blockers,
      maturity,
      rr,
    }),
    rr,
    risk: riskCn(signal.risk),
    evidenceCount: supportive.length,
    counterCount: counter.length,
    freshness: marketStatusToResourceStatus(snapshot.metadata.status) === "live"
      ? "live"
      : sourceStatusToFeed(snapshot.metadata.status),
    whySelected: signal.summary || supportive[0]?.value || "已进入后端证据链",
    whyBlocked: blockers.length > 0 ? blockers.join("；") : null,
    updatedMinAgo: diffMinutes(signal.updatedAt, now),
    discovery: null,
  };
}

function riskForLightCandidate(candidate: ScanLightScanCandidate): RadarSignal["risk"] {
  if (candidate.overextensionRisk === "high" || candidate.opportunityPhase === "late_move") {
    return "高";
  }
  if (candidate.state === "HOT") {
    return "高";
  }
  if (candidate.state === "COLD") {
    return "低";
  }
  return "中";
}

function maturityForLightCandidate(candidate: ScanLightScanCandidate): SignalMaturity {
  if (candidate.overextensionRisk === "high" || candidate.opportunityPhase === "late_move") {
    return "REVIEW_ONLY";
  }

  return "DEEP_SCAN_CANDIDATE";
}

function whySelectedForLightCandidate(candidate: ScanLightScanCandidate) {
  const reasons = candidate.reasons.length > 0
    ? candidate.reasons.slice(0, 5).join(" / ")
    : "public light scan candidate";
  const discovery = discoveryFactFromCandidate(candidate);

  return `轻扫发现：${discovery.summary}；原因 ${reasons}`;
}

function whyBlockedForLightCandidate(candidate: ScanLightScanCandidate) {
  if (candidate.overextensionRisk === "high" || candidate.opportunityPhase === "late_move") {
    return "行情已进入晚到/延展风险区，只能作为复盘样本或等待回踩重构，不能当作追单机会。";
  }

  return "仅完成轻扫/候选层验证；等待 CoinGlass/公开衍生品深扫、盘面结构、证据融合和风控门禁，不能生成交易计划。";
}

function buildLightCandidateRadarSignal({
  candidate,
  freshness,
  now,
  scanGeneratedAt,
}: {
  candidate: ScanLightScanCandidate;
  freshness: DataSourceState["feed"];
  now: Date;
  scanGeneratedAt: string;
}): RadarSignal {
  const symbol = displaySymbol(candidate.symbol);
  const discovery = discoveryFactFromCandidate(candidate);
  const maturity = maturityForLightCandidate(candidate);
  const blocker = whyBlockedForLightCandidate(candidate);

  return {
    id: `light:${candidate.symbol}`,
    symbol,
    hue: symbolHue(candidate.symbol),
    direction: "观察",
    maturity,
    lifecycle: lifecycleRead({
      at: scanGeneratedAt,
      now,
      source: "light_scan_snapshot",
    }),
    operatorRead: operatorReadForSignal({
      blockedReasons: [blocker],
      discovery,
      maturity,
      rr: null,
    }),
    rr: null,
    risk: riskForLightCandidate(candidate),
    evidenceCount: candidate.reasons.length,
    counterCount: 0,
    freshness,
    whySelected: whySelectedForLightCandidate(candidate),
    whyBlocked: blocker,
    updatedMinAgo: diffMinutes(scanGeneratedAt, now),
    discovery,
  };
}

function buildCandidateRadarSignals({
  backend,
  existingSignals,
  now,
  snapshot,
}: {
  backend: BackendContract;
  existingSignals: RadarSignal[];
  now: Date;
  snapshot: MarketRadarSnapshot;
}) {
  const existingSymbols = new Set(existingSignals.map((signal) => baseSymbol(signal.symbol)));
  const universeSymbols = buildFrontendUniverseSymbols(backend, snapshot);
  const freshness = sourceStatusToFeed(backend.scanProof.lightScan.status);

  return backend.scanProof.lightScan.topCandidates
    .filter((candidate) => shouldExposeFrontendAsset(candidate.symbol, universeSymbols))
    .filter((candidate) => !existingSymbols.has(baseSymbol(candidate.symbol)))
    .slice(0, 24)
    .map((candidate) => buildLightCandidateRadarSignal({
      candidate,
      freshness,
      now,
      scanGeneratedAt: backend.scanProof.lightScan.generatedAt || snapshot.metadata.generatedAt,
    }));
}

function dataSourceRow({
  name,
  feed,
  lastUpdate,
  latencyMs,
  latencyStatus = "partial",
  note,
}: DataSourceState): DataSourceState {
  return {
    name,
    feed,
    latencyMs,
    latencyStatus,
    lastUpdate,
    note,
  };
}

function apiUsageStatusToResourceStatus(status?: NonNullable<BackendContract["runtime"]["apiUsage"]>["status"]): DataStatus {
  if (status === "ready") return "live";
  if (status === "unavailable") return "failed";
  return "partial";
}

function latencyStatusToFeed(status: DataSourceState["latencyStatus"]): DataSourceState["feed"] {
  if (status === "ready") return "live";
  if (status === "unavailable") return "failed";
  if (status === "unconfigured") return "stale";
  return "partial";
}

function coinGlassRuntimeStatusToFeed(
  status: BackendContract["sourceAudit"]["coinGlassCapability"]["deepScanStatus"],
): DataSourceState["feed"] {
  if (status === "ready") return "live";
  if (status === "auth_error" || status === "failed" || status === "not_configured") return "failed";
  return "partial";
}

function workerStatusToDataStatus(status: BackendContract["runtime"]["runtimeProbes"]["workers"][number]["status"] | undefined): DataStatus {
  if (status === "healthy") return "live";
  if (status === "degraded") return "partial";
  if (status === "down") return "failed";
  return "stale";
}

function coinGlassDeepScanDataStatus(status: string | undefined): DataStatus {
  if (status === "ready") return "live";
  if (status === "not_configured" || status === "auth_error" || status === "upgrade_required" || status === "failed") {
    return "failed";
  }
  if (status === "partial" || status === "limited") return "partial";
  return "partial";
}

function runtimeWorker(backend: BackendContract, key: string) {
  return backend.runtime.runtimeProbes.workers.find((worker) => worker.key === key || worker.name === key);
}

function positiveEnvMs(env: FrontendContractEnv, key: keyof FrontendContractEnv, fallback: number) {
  const parsed = Number(env[key] ?? "");

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function lightScanQualityStatus(checks: LightScanQualityCheck[]): LightScanQualityState["status"] {
  if (checks.some((check) => check.status === "blocked")) {
    return "blocked";
  }

  if (checks.some((check) => check.status === "watch")) {
    return "watch";
  }

  return "healthy";
}

function lightScanQualityResourceStatus(status: LightScanQualityState["status"]): DataStatus {
  if (status === "healthy") return "live";

  return "partial";
}

function checkStatusFromWorker(status: BackendContract["runtime"]["runtimeProbes"]["workers"][number]["status"] | undefined): LightScanQualityCheckStatus {
  if (status === "healthy") return "pass";
  if (status === "degraded") return "watch";
  if (status === "down") return "blocked";
  return "watch";
}

function averageScore(candidates: ScanLightScanCandidate[]) {
  if (candidates.length === 0) return 0;

  return Math.round(candidates.reduce((total, candidate) => total + candidate.score, 0) / candidates.length);
}

function candidateReasonSet(candidate: ScanLightScanCandidate) {
  return new Set(candidate.reasons.map((reason) => reason.toLowerCase()));
}

function candidateHasCvdProxy(candidate: ScanLightScanCandidate) {
  if (candidate.microstructure) return true;

  const reasons = candidateReasonSet(candidate);

  return reasons.has("trade_flow_proxy_imbalance") ||
    reasons.has("cvd_proxy_positive") ||
    reasons.has("cvd_proxy_negative");
}

function candidatePressureSide(candidate: ScanLightScanCandidate) {
  if (candidate.microstructure?.pressureSide) return candidate.microstructure.pressureSide;

  const reasons = candidateReasonSet(candidate);
  if (reasons.has("cvd_proxy_positive")) return "buy";
  if (reasons.has("cvd_proxy_negative")) return "sell";

  return null;
}

function candidateProxyQuality(candidate: ScanLightScanCandidate): DiscoveryProxyQuality | null {
  if (candidate.microstructure?.proxyQuality) return candidate.microstructure.proxyQuality;
  if (candidateHasCvdProxy(candidate)) return "reason_tag_proxy";

  return null;
}

function discoveryPhaseLabel(phase: ScanLightScanCandidate["opportunityPhase"] | null | undefined) {
  if (phase === "early_setup") return "启动前";
  if (phase === "breakout_watch") return "突破观察";
  if (phase === "late_move") return "已经晚到";
  if (phase === "neutral_watch") return "中性观察";
  return "等待阶段判定";
}

function pressureSideLabel(side: DiscoveryPressureSide | null | undefined) {
  if (side === "buy") return "主动买压";
  if (side === "sell") return "主动卖压";
  if (side === "neutral") return "买卖均衡";
  return "主动成交不足";
}

function discoverySummary(candidate: ScanLightScanCandidate) {
  const phase = discoveryPhaseLabel(candidate.opportunityPhase);
  const pressure = pressureSideLabel(candidatePressureSide(candidate));
  const earlyScore = typeof candidate.earlyOpportunityScore === "number"
    ? `提前分 ${round(candidate.earlyOpportunityScore, 0)}`
    : "提前分待补";
  const risk = candidate.overextensionRisk === "high"
    ? "延展风险高，只能复盘或等回踩"
    : candidate.overextensionRisk === "medium"
      ? "延展风险中，必须等结构确认"
      : "延展风险低或待确认";

  return `${phase} · ${pressure} · ${earlyScore} · ${risk}`;
}

function discoveryFactFromCandidate(candidate: ScanLightScanCandidate): DiscoveryFact {
  return {
    buyPressureUsd: typeof candidate.microstructure?.buyPressureUsd === "number"
      ? round(candidate.microstructure.buyPressureUsd, 0)
      : null,
    changePercent24h: round(candidate.changePercent24h, 2),
    cvdProxyUsd: typeof candidate.microstructure?.cvdProxyUsd === "number"
      ? round(candidate.microstructure.cvdProxyUsd, 0)
      : null,
    decisionBoundary: "发现层只负责说明为什么进入候选；不能直接生成方向、入场、止损或目标。",
    earlyOpportunityScore: typeof candidate.earlyOpportunityScore === "number"
      ? round(candidate.earlyOpportunityScore, 0)
      : null,
    flowImbalance: typeof candidate.microstructure?.tradeFlowImbalance === "number"
      ? round(candidate.microstructure.tradeFlowImbalance, 4)
      : null,
    foundInLightScan: true,
    opportunityPhase: candidate.opportunityPhase ?? null,
    overextensionRisk: candidate.overextensionRisk ?? null,
    pressureSide: candidatePressureSide(candidate),
    proxyQuality: candidateProxyQuality(candidate),
    reasons: candidate.reasons,
    score: round(candidate.score, 0),
    sellPressureUsd: typeof candidate.microstructure?.sellPressureUsd === "number"
      ? round(candidate.microstructure.sellPressureUsd, 0)
      : null,
    source: "light_scan_top_candidate",
    state: candidate.state,
    summary: discoverySummary(candidate),
    symbol: displaySymbol(candidate.symbol),
    volume24hUsd: round(candidate.volume24hUsd, 0),
    volumeWindowUsd: typeof candidate.volumeWindowUsd === "number" ? round(candidate.volumeWindowUsd, 0) : null,
  };
}

function emptyDiscoveryFact(symbol: string): DiscoveryFact {
  const display = displaySymbol(symbol);

  return {
    buyPressureUsd: null,
    changePercent24h: null,
    cvdProxyUsd: null,
    decisionBoundary: "未进入当前轻扫 Top 候选时，页面不能补造发现层证据。",
    earlyOpportunityScore: null,
    flowImbalance: null,
    foundInLightScan: false,
    opportunityPhase: null,
    overextensionRisk: null,
    pressureSide: null,
    proxyQuality: null,
    reasons: [],
    score: null,
    sellPressureUsd: null,
    source: "not_in_light_scan_top_candidates",
    state: null,
    summary: `${display} 未进入当前轻扫 Top 候选；如有成熟信号，以证据链和风控门禁为准。`,
    symbol: display,
    volume24hUsd: null,
    volumeWindowUsd: null,
  };
}

function discoveryFactFromDossier(dossier: SignalBackendDossier): DiscoveryFact {
  return dossier.discovery?.candidate
    ? discoveryFactFromCandidate(dossier.discovery.candidate)
    : emptyDiscoveryFact(dossier.symbol);
}

function buildLightScanQuality({
  backend,
  env,
  now,
}: {
  backend: BackendContract;
  env: FrontendContractEnv;
  now: Date;
}): LightScanQualityState {
  const lightScan = backend.scanProof.lightScan;
  const websocketWorker = runtimeWorker(backend, "websocket-light-worker");
  const staleAfterSec = Math.round(positiveEnvMs(env, "WS_LIGHT_SCAN_STALE_AFTER_MS", 180_000) / 1000);
  const ageSec = diffSeconds(lightScan.generatedAt, now) ?? null;
  const topCandidates = lightScan.topCandidates ?? [];
  const rollingWindowCandidates = topCandidates.filter((candidate) =>
    candidate.volumeSource === "rolling_window" || candidate.reasons.includes("websocket_sliding_window")
  );
  const zScoreCandidates = topCandidates.filter((candidate) => candidate.reasons.includes("volume_zscore_spike"));
  const cvdProxyCandidates = topCandidates.filter(candidateHasCvdProxy);
  const buyPressureCandidates = topCandidates.filter((candidate) => candidatePressureSide(candidate) === "buy");
  const sellPressureCandidates = topCandidates.filter((candidate) => candidatePressureSide(candidate) === "sell");
  const hotCandidates = topCandidates.filter((candidate) => candidate.state === "HOT");
  const preTrendCandidates = topCandidates.filter((candidate) => candidate.state === "PRE_TREND");
  const earlyOpportunityCandidates = topCandidates.filter((candidate) =>
    (candidate.earlyOpportunityScore ?? 0) >= 55 || candidate.opportunityPhase === "early_setup"
  );
  const lateMoveCandidates = topCandidates.filter((candidate) =>
    candidate.overextensionRisk === "high" || candidate.opportunityPhase === "late_move"
  );
  const lightScanReady = lightScan.status === "ready" || lightScan.status === "partial";
  const fresh = ageSec !== null && ageSec <= staleAfterSec;
  const workerStatus = checkStatusFromWorker(websocketWorker?.status);
  const checks: LightScanQualityCheck[] = [
    {
      detail: lightScanReady
        ? `轻扫状态 ${lightScan.status}，可作为候选发现层。`
        : `轻扫状态 ${lightScan.status}，不能当作正常覆盖。`,
      evidence: [`source=${lightScan.source}`, `accepted=${lightScan.acceptedCount}`, `universe=${lightScan.universeCount}`],
      key: "light_scan_source",
      label: "轻扫源状态",
      status: lightScanReady ? "pass" : "blocked",
    },
    {
      detail: fresh
        ? `轻扫快照 ${ageSec}s 内更新。`
        : `轻扫快照已超过 ${staleAfterSec}s 或缺失更新时间。`,
      evidence: [`generatedAt=${lightScan.generatedAt}`, `ageSec=${ageSec ?? "unknown"}`, `staleAfterSec=${staleAfterSec}`],
      key: "freshness",
      label: "数据新鲜度",
      status: fresh ? "pass" : "watch",
    },
    {
      detail: websocketWorker?.detail ?? "等待 websocket-light-worker 心跳；REST 公开轻扫可兜底，但不能伪装成秒级。",
      evidence: [
        `worker=${websocketWorker?.status ?? "unknown"}`,
        `redis=${backend.runtime.runtimeProbes.redis.status}`,
      ],
      key: "websocket_worker",
      label: "WebSocket worker",
      status: workerStatus,
    },
    {
      detail: rollingWindowCandidates.length > 0
        ? `${rollingWindowCandidates.length} 个 top candidate 来自 rolling-window/秒级窗口。`
        : "当前 top candidate 未体现 rolling-window 证据；可继续用公开榜单候选，但要标注非秒级。",
      evidence: [`rollingWindowCandidates=${rollingWindowCandidates.length}`, `topCandidates=${topCandidates.length}`],
      key: "rolling_window_signal",
      label: "滑动窗口证据",
      status: rollingWindowCandidates.length > 0 ? "pass" : "watch",
    },
    {
      detail: zScoreCandidates.length > 0
        ? `${zScoreCandidates.length} 个候选带有成交量标准差异常。`
        : "当前未出现成交量标准差异常；这不是故障，只代表没有秒级放量候选。",
      evidence: [`zScoreCandidates=${zScoreCandidates.length}`, `candidateCount=${lightScan.candidateCount}`],
      key: "volume_zscore",
      label: "成交量异常分",
      status: zScoreCandidates.length > 0 ? "pass" : "watch",
    },
    {
      detail: cvdProxyCandidates.length > 0
        ? `${cvdProxyCandidates.length} 个候选带有主动买卖代理；优先使用公开主动成交，缺失时回退到滚动价格/成交量。`
        : "当前没有候选携带主动买卖代理样本；这只能说明当前候选来自非秒级或尚无足够窗口样本。",
      evidence: [
        `cvdProxyCandidates=${cvdProxyCandidates.length}`,
        `buyPressureCandidates=${buyPressureCandidates.length}`,
        `sellPressureCandidates=${sellPressureCandidates.length}`,
      ],
      key: "cvd_proxy_quality",
      label: "主动买卖代理",
      status: cvdProxyCandidates.length > 0 ? "pass" : "watch",
    },
    {
      detail: earlyOpportunityCandidates.length > 0
        ? `${earlyOpportunityCandidates.length} 个候选带有启动前机会分，可优先调度深扫。`
        : "当前没有明确启动前机会样本；系统应继续扫描，不得用已爆发行情补位。",
      evidence: [
        `earlyOpportunityCandidates=${earlyOpportunityCandidates.length}`,
        `lateMoveCandidates=${lateMoveCandidates.length}`,
      ],
      key: "early_opportunity_score",
      label: "提前机会分",
      status: earlyOpportunityCandidates.length > 0 ? "pass" : "watch",
    },
    {
      detail: "轻扫质量诊断只能影响候选发现和调度解释，不能直接生成交易信号或交易计划。",
      evidence: ["canCreateTradeSignal=false", "LIGHT_SCAN_MARK stays discovery only"],
      key: "decision_boundary",
      label: "交易边界",
      status: "pass",
    },
  ];
  const status = lightScanQualityStatus(checks);

  return {
    ageSec,
    canCreateTradeSignal: false,
    checks,
    coverage: {
      acceptedCount: lightScan.acceptedCount,
      averagePriorityScore: averageScore(topCandidates),
      buyPressureCandidateCount: buyPressureCandidates.length,
      candidateCount: lightScan.candidateCount,
      cvdProxyCandidateCount: cvdProxyCandidates.length,
      earlyOpportunityCandidateCount: earlyOpportunityCandidates.length,
      hotCandidateCount: hotCandidates.length,
      lateMoveCandidateCount: lateMoveCandidates.length,
      preTrendCandidateCount: preTrendCandidates.length,
      rollingWindowCandidateCount: rollingWindowCandidates.length,
      sellPressureCandidateCount: sellPressureCandidates.length,
      topCandidateCount: topCandidates.length,
      universeCount: lightScan.universeCount,
      zScoreCandidateCount: zScoreCandidates.length,
    },
    generatedAt: lightScan.generatedAt ?? now.toISOString(),
    guardrails: [
      "轻扫质量只解释发现层可靠性，不能生成交易计划。",
      "滚动窗口、量能异常、盘口/成交异常只能推高候选优先级，必须等待深扫、结构和风控门禁。",
      "WebSocket 缺失时必须显示 watch/partial，不能用动画或缓存冒充秒级在线。",
    ],
    schemaVersion: "light-scan-quality.v1",
    source: lightScan.source ?? "unknown-light-scan",
    staleAfterSec,
    status,
    summary: status === "healthy"
      ? "轻扫发现层健康，秒级/快速候选可用于调度深扫。"
      : status === "watch"
        ? "轻扫发现层可用但存在观察项；候选可继续展示为验证中，不能升级为交易计划。"
        : "轻扫发现层阻塞；必须降级显示并排查数据源或 worker。",
    topCandidates: topCandidates.slice(0, 8).map((candidate) => ({
      changePercent: round(candidate.changePercent24h),
      earlyOpportunityScore: typeof candidate.earlyOpportunityScore === "number"
        ? round(candidate.earlyOpportunityScore, 0)
        : null,
      flowImbalance: typeof candidate.microstructure?.tradeFlowImbalance === "number"
        ? round(candidate.microstructure.tradeFlowImbalance, 4)
        : null,
      opportunityPhase: candidate.opportunityPhase ?? null,
      overextensionRisk: candidate.overextensionRisk ?? null,
      pressureSide: candidatePressureSide(candidate),
      reasons: candidate.reasons,
      score: candidate.score,
      state: candidate.state,
      symbol: displaySymbol(candidate.symbol),
      volatilityPercent: round(candidate.volatilityPercent),
      volumeWindowUsd: typeof candidate.volumeWindowUsd === "number" ? round(candidate.volumeWindowUsd, 0) : null,
    })),
  };
}

function buildRealtimeCapability(backend: BackendContract, snapshot: MarketRadarSnapshot, now: Date): RealtimeCapabilityState {
  const websocketWorker = runtimeWorker(backend, "websocket-light-worker");
  const scannerWorker = runtimeWorker(backend, "scanner-worker");
  const coinglassWorker = runtimeWorker(backend, "coinglass-worker");
  const signalWorker = runtimeWorker(backend, "signal-worker");
  const macroWorker = runtimeWorker(backend, "macro-worker");
  const lightScanStatus = marketStatusToResourceStatus(backend.scanProof.lightScan.status);
  const websocketStatus = workerStatusToDataStatus(websocketWorker?.status);
  const secondLevelOnline = websocketStatus === "live" && backend.runtime.runtimeProbes.redis.status === "healthy";
  const coinGlassStatus = coinGlassDeepScanDataStatus(backend.sourceAudit.coinGlassCapability.deepScanStatus);
  const scanAgeSec = diffSeconds(snapshot.metadata.generatedAt, now) ?? null;

  return {
    schemaVersion: "realtime-capability.v1",
    secondLevelOnline,
    summary: secondLevelOnline
      ? "秒级轻扫链路在线；秒级数据只负责发现异常，不能直接生成交易计划。"
      : "秒级轻扫链路未完全在线；页面必须显示 partial/failed，不能用动画冒充实时。",
    lanes: [
      {
        key: "exchange_websocket_light_scan",
        label: "交易所 WebSocket 秒级轻扫",
        cadenceBand: "second_level",
        cadenceLabel: "秒级",
        status: websocketStatus,
        source: "Binance/OKX/Bybit public WebSocket + Redis sliding window",
        metrics: ["价格跳动", "成交量窗口", "15分钟成交量异常分", "候选突变"],
        allowedUse: "anomaly_discovery",
        canCreateTradeSignal: false,
        guardrail: "只负责发现异常和候选入池，不允许直接输出买卖方向。",
        note: websocketWorker?.detail ?? "等待 websocket-light-worker 心跳。",
      },
      {
        key: "frontend_live_events",
        label: "站内候选与系统事件流",
        cadenceBand: "second_level",
        cadenceLabel: "2-30 秒 SSE",
        status: backend.runtime.runtimeProbes.redis.status === "healthy" ? "live" : "partial",
        source: "/api/frontend/live-events/stream",
        metrics: ["候选变化", "信号变化", "扫描心跳", "worker 状态"],
        allowedUse: "candidate_refresh",
        canCreateTradeSignal: false,
        guardrail: "事件流只通知状态变化，不触发扫描、不读取密钥、不生成交易结论。",
        note: `redis=${backend.runtime.runtimeProbes.redis.status}; archive=${backend.runtime.persistedArchive ? "persisted" : "not_persisted"}`,
      },
      {
        key: "public_market_board",
        label: "公开交易所榜单与候选刷新",
        cadenceBand: "fast_refresh",
        cadenceLabel: "15-60 秒",
        status: lightScanStatus,
        source: backend.scanProof.lightScan.source ?? "public futures light scan",
        metrics: ["涨跌幅榜", "成交额榜", "轻扫候选", "交易所覆盖"],
        allowedUse: "candidate_refresh",
        canCreateTradeSignal: false,
        guardrail: "可刷新候选和榜单，但榜单不是推荐，轻扫标记不是交易信号。",
        note: `accepted=${backend.scanProof.lightScan.acceptedCount}; universe=${backend.scanProof.lightScan.universeCount}; age=${scanAgeSec ?? "unknown"}s`,
      },
      {
        key: "public_exchange_ohlcv",
        label: "公开交易所 K 线与结构验证",
        cadenceBand: "minute_level",
        cadenceLabel: "1-5 分钟",
        status: workerStatusToDataStatus(scannerWorker?.status),
        source: "Binance/OKX/Bybit public OHLCV",
        metrics: ["1m/5m/15m K线", "短周期结构", "波动率压缩", "关键位验证"],
        allowedUse: "validation",
        canCreateTradeSignal: false,
        guardrail: "K 线结构必须进入证据融合和风控门禁；低周期不能推翻高周期。",
        note: scannerWorker?.detail ?? "等待 scanner-worker 心跳。",
      },
      {
        key: "coinglass_deep_scan",
        label: "CoinGlass 衍生品深扫",
        cadenceBand: "minute_level",
        cadenceLabel: "5-15 分钟",
        status: coinGlassStatus,
        source: "CoinGlass Hobbyist paced deep scan",
        metrics: ["OI", "Funding", "多空拥挤", "深扫 clean rows"],
        allowedUse: "validation",
        canCreateTradeSignal: false,
        guardrail: "CoinGlass 是资金质量确认层，不做秒级全市场扫描，不突破套餐限制。",
        note: coinglassWorker?.detail ?? backend.sourceAudit.coinGlassCapability.operatorHint,
      },
      {
        key: "macro_external_context",
        label: "宏观与外部情报",
        cadenceBand: "low_frequency",
        cadenceLabel: "5 分钟-小时级",
        status: marketStatusToResourceStatus(backend.sourceAudit.macroMarket.status),
        source: "macro worker + external intel collectors",
        metrics: ["BTC.D", "TOTAL2/TOTAL3", "DEX/Trending/公告背景"],
        allowedUse: "context",
        canCreateTradeSignal: false,
        guardrail: "宏观和外部事件只做背景与风险输入，不能直接喊单。",
        note: macroWorker?.detail ?? backend.sourceAudit.macroMarket.operatorHint,
      },
      {
        key: "review_evolution",
        label: "复盘进化",
        cadenceBand: "review_cycle",
        cadenceLabel: "小时/日级",
        status: backend.analysis.reviewStatistics.sampleStatus === "empty" ? "empty" : "partial",
        source: "journal/outcome/review statistics",
        metrics: ["最大浮盈/最大回撤", "先到目标", "先到止损", "超时", "漏判归因"],
        allowedUse: "review",
        canCreateTradeSignal: false,
        guardrail: "复盘只能提出人工校准建议，不能自动修改实时权重。",
        note: backend.analysis.reviewStatistics.summary,
      },
      {
        key: "ai_counter_review",
        label: "规则反证复核",
        cadenceBand: "review_cycle",
        cadenceLabel: "成熟候选触发",
        status: workerStatusToDataStatus(signalWorker?.status),
        source: "rule-review boundary",
        metrics: ["反证", "逻辑漏洞", "中文解释", "复盘归因"],
        allowedUse: "review",
        canCreateTradeSignal: false,
        guardrail: "外部 AI 已取消；规则反证只审查成熟候选，不能替代主规则引擎或绕过结构盈亏比/风控门禁。",
        note: signalWorker?.detail ?? "等待 signal-worker 心跳。",
      },
    ],
    boundaries: [
      "秒级数据只负责发现异常，不生成交易计划。",
      "CoinGlass、宏观、外部情报、规则反证、复盘不做秒级包装。",
      "交易计划必须经过结构、证据、结构盈亏比、风控门禁和失效条件。",
      "前端实时感必须来自真实 stream、heartbeat 或数据新鲜度，不允许用假动画冒充。",
    ],
  };
}

function latencyProbe(
  backend: BackendContract,
  name: DataSourceState["name"],
) {
  return backend.runtime.sourceLatency?.probes.find((probe) => probe.name === name);
}

function sourceLatencyStatus(
  backend: BackendContract,
  name: DataSourceState["name"],
): DataSourceState["latencyStatus"] {
  const status = latencyProbe(backend, name)?.status;

  if (status === "ready" || status === "partial" || status === "unconfigured" || status === "unavailable") {
    return status;
  }

  return "partial";
}

function sourceLatencyMs(
  backend: BackendContract,
  name: DataSourceState["name"],
) {
  return latencyProbe(backend, name)?.latencyMs ?? null;
}

function sourceLatencyUpdatedAt(
  backend: BackendContract,
  name: DataSourceState["name"],
  fallback: string,
) {
  return timeLabel(latencyProbe(backend, name)?.checkedAt ?? fallback);
}

function runtimeProbeStatusToServiceStatus(
  status: BackendContract["runtime"]["runtimeProbes"]["redis"]["status"] | BackendContract["runtime"]["runtimeProbes"]["workers"][number]["status"],
): ServiceNode["status"] {
  if (status === "healthy") return "healthy";
  if (status === "down") return "down";
  return "degraded";
}

function runtimeProbeServiceNodes(runtimeProbes?: BackendContract["runtime"]["runtimeProbes"]): ServiceNode[] {
  if (!runtimeProbes) {
    return [
      {
        key: "redis",
        name: "redis",
        status: "degraded",
        detail: "运行探针暂不可用",
      },
      ...["scanner-worker", "websocket-light-worker", "coinglass-worker", "signal-worker", "dynamic-scan-scheduler", "macro-worker"]
        .map((name) => ({
          key: name,
          name,
          status: "down" as const,
          detail: "未收到运行探针",
        })),
    ];
  }

  return [
    {
      key: "redis",
      name: "redis",
      status: runtimeProbeStatusToServiceStatus(runtimeProbes.redis.status),
      detail: runtimeProbes.redis.detail,
    },
    ...runtimeProbes.workers.map((worker) => ({
      key: worker.key,
      name: worker.name,
      status: runtimeProbeStatusToServiceStatus(worker.status),
      detail: worker.ageSec === null
        ? worker.detail
        : `${worker.detail} · age=${worker.ageSec}s`,
    })),
  ];
}

function capabilityStatus(status: BusinessCapabilityStage["status"]): CapabilityStage["status"] {
  if (status === "ready") {
    return "active";
  }
  if (status === "blocked" || status === "disabled") {
    return "degraded";
  }
  return "standby";
}

function capabilityKey(id: string) {
  return {
    ai_counter_review: "ai_review",
    candidate_rotation: "rotation",
    evolution_suggestions: "evolution",
    historical_case_replay: "replay",
    outcome_standard: "review",
    shadow_tracking: "shadow",
    signal_lifecycle: "lifecycle",
    signal_maturity: "maturity",
    strategy_family_stats: "archetype",
  }[id] ?? id;
}

function scanCountdown(snapshot: MarketRadarSnapshot, now: Date) {
  const nextScanAt = new Date(snapshot.metadata.nextScanAt).getTime();
  if (!Number.isFinite(nextScanAt)) {
    return 0;
  }
  return Math.max(0, Math.round((nextScanAt - now.getTime()) / 1000));
}

function average(values: number[]) {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) {
    return 0;
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function buildDerivatives(snapshot: MarketRadarSnapshot): DerivativesState {
  const uniqueExchanges = new Set(snapshot.derivatives.map((item) => item.exchange));
  const latest = snapshot.derivatives
    .map((item) => item.updatedAt)
    .sort()
    .at(-1) ?? snapshot.metadata.generatedAt;
  const hasDerivatives = snapshot.derivatives.length > 0;
  const hasLongShort = snapshot.derivatives.some((item) => Number.isFinite(item.longShortRatio ?? NaN));

  return {
    connectedFields: [
      ...(hasDerivatives ? ["open_interest", "funding_rate"] : []),
      ...(hasLongShort ? ["long_short_ratio"] : []),
    ],
    oiChange: round(average(snapshot.derivatives.map((item) => item.openInterestChangePercent)), 2),
    funding: round(average(snapshot.derivatives.map((item) => item.fundingRate)) * 100, 4),
    longShortRatio: round(average(snapshot.derivatives.map((item) => item.longShortRatio ?? 0)), 2),
    takerBuySell: 0,
    takerBuySellStatus: "not_connected",
    exchangeCoverage: uniqueExchanges.size,
    totalExchanges: 3,
    lastUpdate: timeLabel(latest),
    unavailableFields: ["exchange_native_taker_buy_sell", "exchange_native_cvd", "real_fund_flow"],
  };
}

function buildFundFlowState(snapshot: MarketRadarSnapshot): FundFlowState {
  const hasDerivativeContext = snapshot.derivatives.length > 0;
  const hasLongShort = snapshot.derivatives.some((item) => Number.isFinite(item.longShortRatio ?? NaN));

  return {
    allowedUse: "market_context_only",
    canCreateTradeSignal: false,
    connectedFields: [
      ...(hasDerivativeContext ? ["open_interest", "funding_rate"] : []),
      ...(hasLongShort ? ["long_short_ratio"] : []),
    ],
    decisionBoundary: "资金流仅能作为市场上下文和风险提示；未接真实主动买卖数据前，不能生成或放大交易信号。",
    detail: hasDerivativeContext
      ? "已接 OI、Funding、多空比等衍生品上下文；轻扫发现层可展示公开成交主动买卖代理，但它不是交易所原生资金流证据。"
      : "当前没有可用衍生品上下文，资金流只能显示等待数据源。",
    source: hasDerivativeContext ? "coinglass_derivatives" : "not_connected",
    status: hasDerivativeContext ? "partial" : "waiting_source",
    takerBuySellAvailable: false,
    unavailableFields: ["exchange_native_taker_buy_sell", "exchange_native_cvd", "real_fund_flow"],
  };
}

function buildMacro(backend: BackendContract): MacroAltEnv {
  const macro = backend.sourceAudit.macroMarket;
  const btcDominance = safeNumber(macro.btcDominancePercent, 0);
  const hint = `${macro.operatorHint ?? ""}`.toLowerCase();
  const btcDominanceTrend: MacroAltEnv["btcDominanceTrend"] =
    hint.includes("下降") || hint.includes("down") ? "下降" :
    hint.includes("上升") || hint.includes("up") ? "上升" :
    "走平";
  const riskMode: MacroAltEnv["riskMode"] =
    macro.status !== "ready" ? "防守" :
    btcDominanceTrend === "下降" ? "进攻" :
    btcDominanceTrend === "上升" ? "防守" :
    "中性";
  const suggestion: MacroAltEnv["suggestion"] =
    riskMode === "进攻" ? "更适合做多" : riskMode === "防守" ? "建议观望" : "建议观望";

  return {
    btcState: macro.status === "ready" ? "震荡" : "弱势",
    ethState: macro.status === "ready" ? "震荡" : "弱势",
    btcDominance,
    btcDominanceTrend,
    total2: safeNumber(macro.total2MarketCapUsd, 0),
    total3: safeNumber(macro.total3MarketCapUsd, 0),
    altStrength: riskMode === "进攻" ? 66 : riskMode === "防守" ? 38 : 50,
    riskMode,
    suggestion,
  };
}

function normalizeAssetList(values: string[] | undefined) {
  return (values ?? [])
    .map(displaySymbol)
    .filter((value, index, list) =>
      Boolean(value) &&
      isCryptoFuturesUnderlying(value) &&
      list.indexOf(value) === index
    );
}

function resourceStatusFromOpportunity(status: OpportunityQualityState["status"]): DataStatus {
  if (status === "healthy") return "live";
  if (status === "blocked") return "failed";
  return "partial";
}

function nextActionForOpportunity(signal: RadarSignal) {
  if (signal.maturity === "TRADE_PLAN_READY") {
    return "可进入人工复核；仍不得自动下单。";
  }
  if (signal.maturity === "EVIDENCE_SIGNAL") {
    return signal.whyBlocked ?? "继续等待风控门禁、结构盈亏比、关键位和触发条件完整。";
  }
  if (signal.maturity === "DEEP_SCAN_CANDIDATE") {
    return "等待 CoinGlass/公开衍生品深扫、结构和风控门禁。";
  }
  if (signal.maturity === "REVIEW_ONLY") {
    return "只进复盘或等待回踩/反抽重构，不追。";
  }
  if (signal.maturity === "BLOCKED") {
    return signal.whyBlocked ?? "被风控门禁拦截，等待阻断原因解除。";
  }
  return signal.whyBlocked ?? "继续观察，不生成交易计划。";
}

function buildOpportunityQuality(visibleSignals: RadarSignal[]): OpportunityQualityState {
  const earlySetup = visibleSignals.filter((signal) => signal.discovery?.opportunityPhase === "early_setup").length;
  const breakoutWatch = visibleSignals.filter((signal) => signal.discovery?.opportunityPhase === "breakout_watch").length;
  const lateMove = visibleSignals.filter((signal) =>
    signal.maturity === "REVIEW_ONLY" ||
    signal.discovery?.opportunityPhase === "late_move" ||
    signal.discovery?.overextensionRisk === "high"
  ).length;
  const waitingPullbackOrRetest = visibleSignals.filter((signal) =>
    /回踩|反抽|retest|pullback|等待突破|等待确认/iu.test(`${signal.whyBlocked ?? ""} ${signal.whySelected}`)
  ).length;
  const tradePlanReady = visibleSignals.filter((signal) => signal.maturity === "TRADE_PLAN_READY").length;
  const evidenceSignal = visibleSignals.filter((signal) => signal.maturity === "EVIDENCE_SIGNAL").length;
  const deepScanCandidate = visibleSignals.filter((signal) => signal.maturity === "DEEP_SCAN_CANDIDATE").length;
  const blocked = visibleSignals.filter((signal) => signal.maturity === "BLOCKED").length;
  const reviewOnly = visibleSignals.filter((signal) => signal.maturity === "REVIEW_ONLY").length;
  const blockedLateSignals = visibleSignals.filter((signal) =>
    signal.maturity === "REVIEW_ONLY" ||
    /追涨|追空|晚到|过热|跌深|衰竭/iu.test(signal.whyBlocked ?? "")
  ).length;
  const status: OpportunityQualityState["status"] =
    tradePlanReady > 0 || earlySetup > 0 || evidenceSignal > 0
      ? "healthy"
      : visibleSignals.length > 0
        ? "watch"
        : "blocked";

  return {
    schemaVersion: "opportunity-quality.v1",
    status,
    summary: status === "healthy"
      ? `当前有 ${earlySetup} 个启动前候选、${evidenceSignal} 个证据信号、${tradePlanReady} 个计划就绪；系统优先看仍有位置优势的机会。`
      : status === "watch"
        ? `当前有 ${visibleSignals.length} 个可见候选，但尚未形成可交易计划；宁可等待，不用晚到行情补位。`
        : "当前没有可展示候选；页面必须空态展示，不能用 mock 或旧缓存补位。",
    counts: {
      blocked,
      breakoutWatch,
      deepScanCandidate,
      earlySetup,
      evidenceSignal,
      lateMove,
      reviewOnly,
      totalVisible: visibleSignals.length,
      tradePlanReady,
      waitingPullbackOrRetest,
    },
    antiChase: {
      blockedLateSignals,
      guardrails: [
        "已经大涨看多、已经大跌看空默认不是机会，优先等待回踩/反抽或进入复盘。",
        "轻扫、榜单和主动买卖代理只能提升候选优先级，不能直接生成交易计划。",
        "狙击榜只允许 TRADE_PLAN_READY；候选不能补位。",
      ],
    },
    nextActions: [
      earlySetup > 0 ? "优先把启动前候选送入深扫和结构确认。" : "继续等待启动前候选，不追已经发生的大波动。",
      blockedLateSignals > 0 ? "晚到样本进入复盘，回看启动前 1h/3h/6h/12h 线索。" : "继续保持追涨追跌拦截。",
      tradePlanReady > 0 ? "计划就绪只进入人工复核，不自动执行。" : "无计划时前端保持空态或验证中，不编策略。",
    ],
    topCandidates: visibleSignals.slice(0, 10).map((signal) => ({
      symbol: signal.symbol,
      maturity: signal.maturity,
      phase: signal.discovery?.opportunityPhase ?? null,
      earlyOpportunityScore: signal.discovery?.earlyOpportunityScore ?? null,
      overextensionRisk: signal.discovery?.overextensionRisk ?? null,
      whySelected: signal.whySelected,
      whyBlocked: signal.whyBlocked,
      nextAction: nextActionForOpportunity(signal),
    })),
  };
}

function buildDeepScanQuality(backend: BackendContract): DeepScanQualityState {
  const audit = backend.sourceAudit.coinGlassDeepScan;
  const capability = backend.sourceAudit.coinGlassCapability;
  const plannedAssets = audit.plannedAssets.length || backend.scanProof.deepScan.plannedAssets.length;
  const plannedRequests = audit.plannedRequests || backend.scanProof.deepScan.coinGlassRequestsPlanned;
  const rawRows = audit.rawRows || backend.scanProof.deepScan.rawRows;
  const cleanRows = audit.cleanRows || backend.scanProof.deepScan.cleanRows;
  const cleanRate = rawRows > 0 ? round((cleanRows / rawRows) * 100, 1) : 0;
  const failures = (audit.requestFailures ?? []).map((failure) => ({
    code: typeof failure.code === "string" ? failure.code : failure.code === undefined ? null : String(failure.code),
    error: String(failure.error ?? "unknown error"),
    symbol: displaySymbol(String(failure.symbol ?? "UNKNOWN")),
  }));
  const status: DeepScanQualityState["status"] =
    capability.deepScanStatus === "ready" && cleanRows > 0
      ? "healthy"
      : rawRows > 0 || plannedRequests > 0
        ? "watch"
        : "blocked";

  return {
    schemaVersion: "deep-scan-quality.v1",
    status,
    summary: status === "healthy"
      ? `CoinGlass 深扫可用：${cleanRows}/${rawRows} 行通过清洗，clean rate ${cleanRate}%。`
      : status === "watch"
        ? `深扫处于观察状态：计划 ${plannedRequests} 次请求，raw ${rawRows}，clean ${cleanRows}；必须标注 partial。`
        : `深扫阻塞：${capability.operatorHint}`,
    plannedAssets,
    plannedRequests,
    rawRows,
    cleanRows,
    cleanRate,
    failedAssets: audit.failedPlannedAssets.map(displaySymbol),
    requestFailures: failures,
    boundary: "CoinGlass 是付费资金质量确认层；失败时不能写成市场无机会，也不能用公开源冒充 CoinGlass。",
    guardrails: [
      "Hobbyist 限速必须通过 pacing、预算和缓存保护。",
      "cleanRows=0 时不能生成衍生品证据交易计划。",
      "公开交易所 fallback 必须标注为公开源，只能作为验证补充。",
    ],
  };
}

function buildMacroReadiness(backend: BackendContract, macro: MacroAltEnv): MacroReadinessState {
  const source = backend.sourceAudit.macroMarket;
  const fields = [
    ["btc_dominance", source.btcDominancePercent],
    ["total2", source.total2MarketCapUsd],
    ["total3", source.total3MarketCapUsd],
  ] as const;
  const availableFields = fields.filter(([, value]) => Number.isFinite(value ?? NaN)).map(([key]) => key);
  const missingFields = fields.filter(([, value]) => !Number.isFinite(value ?? NaN)).map(([key]) => key);
  const status: MacroReadinessState["status"] =
    source.status === "ready" && missingFields.length === 0
      ? "healthy"
      : source.status === "unavailable" || source.status === "empty"
        ? "blocked"
        : "watch";

  return {
    schemaVersion: "macro-readiness.v1",
    status,
    summary: status === "healthy"
      ? `宏观山寨环境可用：BTC.D ${macro.btcDominance}% ${macro.btcDominanceTrend}，风险模式 ${macro.riskMode}。`
      : status === "watch"
        ? `宏观数据部分可用，缺失 ${missingFields.join(" / ") || "无"}；只能作为背景，不能直接给个币方向。`
        : "宏观数据不可用；山寨机会必须降级显示，不能假装顺风。",
    riskMode: macro.riskMode,
    availableFields,
    missingFields,
    guardrails: [
      "BTC.D/TOTAL2/TOTAL3 只判断山寨顺风逆风，不降低 3:1 结构盈亏比。",
      "宏观顺风不等于个币可交易；仍要过结构、证据和风控门禁。",
      "宏观缺失必须显示 partial/unavailable。",
    ],
  };
}

function buildOpsReliability(backend: BackendContract, deepScanQuality: DeepScanQualityState): OpsReliabilityState {
  const workers = backend.runtime.runtimeProbes.workers;
  const downWorkers = workers.filter((worker) => worker.status === "down");
  const staleWorkers = workers.filter((worker) => worker.status === "degraded");
  const checks: OpsReliabilityCheck[] = [
    {
      key: "postgres",
      label: "Postgres",
      status: backend.runtime.repositoryMode === "database" ? "pass" : "blocked",
      detail: `repository=${backend.runtime.repositoryMode}`,
    },
    {
      key: "redis",
      label: "Redis",
      status: backend.runtime.runtimeProbes.redis.status === "healthy" ? "pass" : "blocked",
      detail: backend.runtime.runtimeProbes.redis.detail,
    },
    {
      key: "workers",
      label: "Worker 心跳",
      status: downWorkers.length > 0 ? "blocked" : staleWorkers.length > 0 ? "watch" : "pass",
      detail: `healthy=${workers.filter((worker) => worker.status === "healthy").length}; degraded=${staleWorkers.length}; down=${downWorkers.length}`,
    },
    {
      key: "api_budget",
      label: "CoinGlass 预算",
      status: backend.runtime.apiUsage?.throttled ? "watch" : backend.runtime.apiUsage?.status === "unavailable" ? "blocked" : "pass",
      detail: backend.runtime.apiUsage?.detail ?? "api usage counter unavailable",
    },
    {
      key: "deep_scan",
      label: "深扫质量",
      status: deepScanQuality.status === "healthy" ? "pass" : deepScanQuality.status === "watch" ? "watch" : "blocked",
      detail: deepScanQuality.summary,
    },
    {
      key: "scan_stability",
      label: "扫描稳定性",
      status: backend.runtime.scanStability.status === "healthy"
        ? "pass"
        : backend.runtime.scanStability.status === "watch"
          ? "watch"
          : "blocked",
      detail: backend.runtime.scanStability.summary,
    },
  ];
  const blocked = checks.filter((check) => check.status === "blocked").length;
  const watch = checks.filter((check) => check.status === "watch").length;
  const status: OpsReliabilityState["status"] = blocked > 0 ? "blocked" : watch > 0 ? "watch" : "healthy";

  return {
    schemaVersion: "ops-reliability.v1",
    status,
    summary: status === "healthy"
      ? "生产底座健康：数据库、Redis、worker、预算和扫描稳定性均通过。"
      : status === "watch"
        ? "生产底座可用但有观察项；上线前必须看具体 check。"
        : "生产底座存在阻塞项；不能把页面状态包装成完全正常。",
    checks,
    nextActions: [
      "发布前继续运行 production:preflight。",
      "上线后运行 production:deploy 和 production:smoke。",
      "定期执行 Postgres 备份/恢复 dry run 和日志打包。",
    ],
  };
}

export function buildFrontendRadarContract({
  backend,
  snapshot,
  env,
  now = new Date(),
}: {
  backend: BackendContract;
  snapshot: MarketRadarSnapshot;
  env: FrontendContractEnv;
  now?: Date;
}): RadarContract {
  const status = marketStatusToResourceStatus(snapshot.metadata.status);
  const ageSec = diffSeconds(snapshot.metadata.generatedAt, now);
  const source = snapshot.metadata.source;
  const coverage = backend.scanProof.fullMarket;
  const allocation = backend.scanProof.allocation;
  const dailyBudget = Math.max(1, Number(env.COINGLASS_DAILY_REQUEST_BUDGET ?? 3_000));
  const observedApiUsage = backend.runtime.apiUsage;
  const derivatives = buildDerivatives(snapshot);
  const tradeReady = snapshot.signals.some((signal) => maturityForSignal(signal) === "TRADE_PLAN_READY");
  const blockedSignals = snapshot.signals.filter((signal) => lifecycleStatusReason(signal).length > 0);
  const frontendUniverseSymbols = buildFrontendUniverseSymbols(backend, snapshot);
  const liveSignals = snapshot.signals
    .filter((signal) => shouldExposeFrontendAsset(signal.symbol, frontendUniverseSymbols))
    .map((signal) => buildRadarSignal(signal, snapshot, now));
  const candidateSignals = buildCandidateRadarSignals({ backend, existingSignals: liveSignals, now, snapshot });
  const visibleSignals = [...liveSignals, ...candidateSignals];
  const coinGlassLatencyStatus = sourceLatencyStatus(backend, "CoinGlass");
  const coinGlassRuntime = backend.sourceAudit.coinGlassCapability;
  const cleanDeepScanRows = backend.scanProof.deepScan.cleanRows;
  const coinGlassRequestFailure = backend.sourceAudit.coinGlassDeepScan.requestFailures?.[0];
  const scannableAssets = Math.max(0, coverage.eligibleAssets);
  const lightScannedAssets = scannableAssets > 0
    ? Math.min(scannableAssets, Math.max(0, backend.scanProof.lightScan.acceptedCount))
    : Math.max(0, backend.scanProof.lightScan.acceptedCount);
  const lightCoverage = scannableAssets > 0
    ? (lightScannedAssets / scannableAssets) * 100
    : coverage.coveragePercent;
  const deepCoverage = scannableAssets > 0
    ? (Math.max(0, cleanDeepScanRows) / scannableAssets) * 100
    : coverage.coveragePercent;
  const lightScanQuality = buildLightScanQuality({ backend, env, now });
  const opportunityQuality = buildOpportunityQuality(visibleSignals);
  const deepScanQuality = buildDeepScanQuality(backend);
  const macroAltEnv = buildMacro(backend);
  const macroReadiness = buildMacroReadiness(backend, macroAltEnv);
  const opsReliability = buildOpsReliability(backend, deepScanQuality);

  return {
    scanProof: resource({
      totalMonitored: coverage.totalAssets,
      scannable: scannableAssets,
      lightScanned: lightScannedAssets,
      deepScanned: cleanDeepScanRows,
      awaitingDeepScan: Math.max(0, scannableAssets - Math.max(0, cleanDeepScanRows)),
      deepCoverage: round(deepCoverage, 1),
      coverage: round(Math.min(100, Math.max(0, lightCoverage)), 1),
      lastScanAt: timeLabel(snapshot.metadata.generatedAt),
      nextScanCountdownSec: scanCountdown(snapshot, now),
      stuck: snapshot.metadata.status === "failed" || coverage.status === "blocked",
    }, status, {
      ageSec,
      source,
      reason: "轻扫覆盖率表示公开交易所全市场快速过筛覆盖；深扫占比表示本轮 CoinGlass 衍生品确认覆盖。深扫是轮转确认层，不是一次性全市场重扫。",
    }),
    deepScanQueue: resource({
      currentBatch: normalizeAssetList(allocation.selectedAssets),
      nextBatch: normalizeAssetList(allocation.nextBatchAssets),
      highPriority: normalizeAssetList(backend.scanProof.twoStageAllocation?.stageTwo.queuedPriorityAssets ?? allocation.pendingAssets),
      coldExploration: normalizeAssetList(allocation.coldExplorationAssets),
      longUnscanned: normalizeAssetList(allocation.pendingAssets).slice(0, 8).map((symbol, index) => ({
        symbol,
        idleMin: (index + 1) * snapshot.metadata.cadenceMinutes,
      })),
    }, status, { ageSec, source: "dynamic-scan-scheduler" }),
    capabilityStages: resource(
      backend.analysis.businessCapability.stages.map((stage) => ({
        key: capabilityKey(stage.id),
        name: stage.title,
        desc: stage.summary,
        status: capabilityStatus(stage.status),
        note: stage.nextAction,
      })),
      marketStatusToResourceStatus(backend.analysis.businessCapability.status === "operational" ? "ready" : "partial"),
      { ageSec, source: "signal-worker" },
    ),
    coreChainGovernance: resource(
      backend.analysis.coreChainGovernance,
      backend.analysis.coreChainGovernance.readiness.status === "blocked"
        ? "partial"
        : backend.analysis.coreChainGovernance.readiness.status === "ready"
          ? status
          : "partial",
      {
        ageSec,
        source: "backend-contract",
        reason: "核心链路治理只用于判断功能是否服务实战链路，不生成交易信号、不修改排序、不自动下单。",
      },
    ),
    dataSources: resource([
      dataSourceRow({
        name: "CoinGlass",
        feed: coinGlassRuntimeStatusToFeed(coinGlassRuntime.deepScanStatus),
        latencyMs: sourceLatencyMs(backend, "CoinGlass"),
        latencyStatus: coinGlassLatencyStatus,
        lastUpdate: sourceLatencyUpdatedAt(backend, "CoinGlass", snapshot.metadata.generatedAt),
        note: coinGlassRequestFailure
          ? `深扫端点失败：${coinGlassRequestFailure.symbol} ${coinGlassRequestFailure.error} code=${coinGlassRequestFailure.code ?? "unknown"}；公开轻扫继续运行，但不能生成衍生品证据。`
          : `${coinGlassRuntime.operatorHint} 深扫 ${backend.sourceAudit.coinGlassDeepScan.cleanRows}/${backend.sourceAudit.coinGlassDeepScan.rawRows} 行可用。`,
      }),
      ...(["Binance", "OKX", "Bybit"] as const).map((name) => {
        const sourceRow = backend.sourceAudit.publicDiscovery.sources.find((item) =>
          item.source.toLowerCase().includes(name.toLowerCase())
        );
        const latencyStatus = sourceLatencyStatus(backend, name);
        return dataSourceRow({
          name,
          feed: latencyStatus === "ready" ? sourceStatusToFeed(sourceRow?.status) : latencyStatusToFeed(latencyStatus),
          latencyMs: sourceLatencyMs(backend, name),
          latencyStatus,
          lastUpdate: sourceLatencyUpdatedAt(backend, name, snapshot.metadata.generatedAt),
          note: sourceRow
            ? `${latencyProbe(backend, name)?.detail ?? "延迟探针待写入"}；发现 ${sourceRow.instrumentCount} 个合约，request=${sourceRow.requestCount}`
            : `${latencyProbe(backend, name)?.detail ?? "当前快照未包含该交易所明细"}`,
        });
      }),
    ], backend.runtime.sourceLatency?.status === "ready" ? status : "partial", {
      ageSec,
      source: "scanner-worker",
      reason: backend.runtime.sourceLatency
        ? `${backend.runtime.sourceLatency.status} source latency probes`
        : "source latency probes unavailable",
    }),
    apiUsage: resource({
      provider: "CoinGlass",
      usedToday: observedApiUsage?.usedToday ?? 0,
      remainingToday: observedApiUsage?.remainingToday ?? dailyBudget,
      perMinuteLimit: observedApiUsage?.perMinuteLimit ?? 30,
      pacingMs: observedApiUsage?.pacingMs ?? Number(env.COINGLASS_REQUEST_INTERVAL_MS ?? 3_000),
      throttled: observedApiUsage?.throttled ?? false,
      source: observedApiUsage?.source ?? "unconfigured",
    }, apiUsageStatusToResourceStatus(observedApiUsage?.status), {
      ageSec,
      source: "coinglass-worker",
      reason: observedApiUsage?.detail ?? "CoinGlass Redis daily usage counter unavailable",
    }),
    dataPipeline: resource({
      lastScanAt: timeLabel(snapshot.metadata.generatedAt),
      lastWriteAt: timeLabel(snapshot.metadata.generatedAt),
      stale: snapshot.metadata.status === "stale",
      cacheHit: backend.runtime.cacheStatus === "served_cache",
      recentError: snapshot.metadata.status === "failed" ? snapshot.metadata.notes.join("；") || "数据源失败" : null,
      recentSuccess: `完成 ${snapshot.signals.length} 条信号融合，候选 ${candidateSignals.length} 条，归档 ${
        backend.runtime.persistedArchive ? "已持久化" : "未持久化"
      }`,
    }, status, { ageSec, source: "web" }),
    petBackendStatus: resource({
      system: status === "live" ? "正常" : status === "failed" ? "异常" : "降级",
      scan: snapshot.metadata.status === "failed" ? "卡住" : scanCountdown(snapshot, now) > 0 ? "扫描中" : "空闲",
      signal: tradeReady ? "有就绪信号" : visibleSignals.length > 0 ? "验证中" : "无信号",
      risk: blockedSignals.length > 0 ? "高" : "中",
      rank: "川流不息",
      discipline: "良好",
      review: snapshot.journalEvents.length > 0 ? "已完成" : "待复盘",
      todayPerf: Math.min(100, Math.max(0, backend.analysis.businessCapability.readinessScore)),
    }, status, { ageSec, source: "web" }),
    radarSignals: resource(
      visibleSignals,
      liveSignals.length > 0 ? status : candidateSignals.length > 0 ? "partial" : status,
      {
        ageSec,
        source: liveSignals.length > 0 ? "signal-worker" : "public-light-scan",
        reason: liveSignals.length > 0
          ? undefined
          : candidateSignals.length > 0
            ? "当前无证据融合/交易计划信号；展示轻扫候选作为验证中队列，不生成交易计划。"
            : undefined,
      },
    ),
    macroAltEnv: resource(
      macroAltEnv,
      marketStatusToResourceStatus(backend.sourceAudit.macroMarket.status),
      {
        ageSec: backend.sourceAudit.macroMarket.ageMinutes === null ? undefined : backend.sourceAudit.macroMarket.ageMinutes * 60,
        source: backend.sourceAudit.macroMarket.source ?? "macro-market",
      },
    ),
    derivatives: resource(
      derivatives,
      snapshot.derivatives.length > 0 ? status : "partial",
      {
        ageSec,
        source: "coinglass",
        reason: snapshot.derivatives.length > 0
          ? "OI/Funding/多空比已接入；主动买卖代理在轻扫发现层展示，不能冒充交易所原生资金流。"
          : "当前快照未包含衍生品明细。",
      },
    ),
    fundFlow: resource(
      buildFundFlowState(snapshot),
      snapshot.derivatives.length > 0 ? "partial" : "empty",
      {
        ageSec,
        source: "coinglass",
        reason: "资金流只能展示已接真实字段；轻扫主动买卖代理只能用于发现层，不等于原生资金流。",
      },
    ),
    scanStability: resource(
      {
        issues: backend.runtime.scanStability.issues,
        score: backend.runtime.scanStability.score,
        status: backend.runtime.scanStability.status,
        summary: backend.runtime.scanStability.summary,
      },
      backend.runtime.scanStability.status === "healthy"
        ? "live"
        : backend.runtime.scanStability.status === "watch"
          ? "partial"
          : "failed",
      {
        ageSec,
        source: "system-health",
        reason: backend.runtime.scanStability.guardrail,
      },
    ),
    lightScanQuality: resource(
      lightScanQuality,
      lightScanQualityResourceStatus(lightScanQuality.status),
      {
        ageSec: lightScanQuality.ageSec ?? ageSec,
        source: lightScanQuality.source,
        reason: "轻扫质量诊断只用于发现层可靠性、候选调度解释和运维排查，不能生成交易计划。",
      },
    ),
    realtimeCapability: resource(
      buildRealtimeCapability(backend, snapshot, now),
      backend.runtime.runtimeProbes.redis.status === "healthy" ? "live" : "partial",
      {
        ageSec,
        source: "runtime-probes-and-scan-contract",
        reason: "秒级层只用于发现异常和状态变化；分钟级和低频层负责验证、背景和复盘。",
      },
    ),
    opportunityQuality: resource(
      opportunityQuality,
      resourceStatusFromOpportunity(opportunityQuality.status),
      {
        ageSec,
        source: "signal-maturity+light-scan",
        reason: "机会质量只判断提前性、成熟度和追涨追跌拦截；不能绕过证据融合、结构盈亏比或风控门禁。",
      },
    ),
    deepScanQuality: resource(
      deepScanQuality,
      deepScanQuality.status === "healthy" ? "live" : deepScanQuality.status === "watch" ? "partial" : "failed",
      {
        ageSec,
        source: "coinglass-deep-scan-audit",
        reason: deepScanQuality.boundary,
      },
    ),
    macroReadiness: resource(
      macroReadiness,
      macroReadiness.status === "healthy" ? "live" : macroReadiness.status === "watch" ? "partial" : "failed",
      {
        ageSec: backend.sourceAudit.macroMarket.ageMinutes === null ? undefined : backend.sourceAudit.macroMarket.ageMinutes * 60,
        source: backend.sourceAudit.macroMarket.source ?? "macro-market",
        reason: "宏观只做山寨环境背景，不能直接给个币买卖方向。",
      },
    ),
    opsReliability: resource(
      opsReliability,
      opsReliability.status === "healthy" ? "live" : opsReliability.status === "watch" ? "partial" : "failed",
      {
        ageSec,
        source: "runtime-probes+scan-stability",
        reason: "生产可靠性只说明系统是否稳定运行，不生成交易判断。",
      },
    ),
    serviceNodes: resource([
      { key: "web", name: "web", status: status === "failed" ? "down" : "healthy", detail: `trigger=${backend.runtime.trigger}` },
      {
        key: "postgres",
        name: "postgres",
        status: backend.runtime.repositoryMode === "database" ? "healthy" : "degraded",
        detail: `repository=${backend.runtime.repositoryMode}`,
      },
      ...runtimeProbeServiceNodes(backend.runtime.runtimeProbes),
    ], status, { ageSec, source: "web" }),
  };
}

function tickerValue(kind: LeaderboardKind, ticker: MarketTicker, derivatives: DerivativeSnapshot[], light?: ScanLightScanCandidate) {
  const derivative = derivatives.find((item) => baseSymbol(item.symbol) === baseSymbol(ticker.symbol));
  if (kind === "losers") {
    return ticker.changePercent24h;
  }
  if (kind === "volume") {
    return ticker.volume24hUsd;
  }
  if (kind === "volatility_squeeze") {
    return light ? Math.max(0, 100 - light.volatilityPercent) : 0;
  }
  if (kind === "relative_strength") {
    return (light?.score ?? 0) + Math.max(0, ticker.changePercent24h);
  }
  if (kind === "oi_change") {
    return derivative?.openInterestChangePercent ?? 0;
  }
  if (kind === "funding_hot") {
    return derivative?.fundingRate ?? 0;
  }
  return ticker.changePercent24h;
}

type LeaderboardTicker = MarketTicker & {
  sourceLabel: string;
  venueScope: string;
};

function latestTimestamp(tickers: MarketTicker[]) {
  return tickers
    .map((ticker) => Date.parse(ticker.updatedAt))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0];
}

function latestUpdatedAt(tickers: MarketTicker[]) {
  const latest = latestTimestamp(tickers);
  return Number.isFinite(latest) ? new Date(latest).toISOString() : tickers[0]?.updatedAt ?? new Date(0).toISOString();
}

function primaryTickerForKind(kind: LeaderboardKind, tickers: MarketTicker[]) {
  if (kind === "gainers") {
    return [...tickers].sort((left, right) =>
      right.changePercent24h - left.changePercent24h ||
      right.volume24hUsd - left.volume24hUsd
    )[0];
  }

  if (kind === "losers") {
    return [...tickers].sort((left, right) =>
      left.changePercent24h - right.changePercent24h ||
      right.volume24hUsd - left.volume24hUsd
    )[0];
  }

  return [...tickers].sort((left, right) =>
    right.volume24hUsd - left.volume24hUsd ||
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  )[0];
}

function weightedChangePercent(tickers: MarketTicker[]) {
  const totalVolume = tickers.reduce((sum, ticker) => sum + Math.max(0, ticker.volume24hUsd), 0);

  if (totalVolume <= 0) {
    return tickers[0]?.changePercent24h ?? 0;
  }

  return tickers.reduce((sum, ticker) =>
    sum + ticker.changePercent24h * (Math.max(0, ticker.volume24hUsd) / totalVolume)
  , 0);
}

function selectLeaderboardTickers(tickers: MarketTicker[], kind: LeaderboardKind): LeaderboardTicker[] {
  const groups = new Map<string, MarketTicker[]>();

  for (const ticker of tickers) {
    const symbol = baseSymbol(ticker.symbol);
    if (!symbol) {
      continue;
    }

    groups.set(symbol, [...(groups.get(symbol) ?? []), ticker]);
  }

  return [...groups.entries()].flatMap(([, group]) => {
    const primary = primaryTickerForKind(kind, group);
    if (!primary) {
      return [];
    }

    const venues = [...new Set(group.map((ticker) => ticker.exchange))].sort();
    const venueScope = venues.length > 1 ? venues.join(" + ") : `${primary.exchange}`;
    const sourceLabel = venues.length > 1
      ? kind === "volume"
        ? `${venueScope} public futures ticker aggregated volume`
        : `${primary.exchange} public futures ticker (${venues.length} venues compared)`
      : `${primary.exchange} public futures ticker`;

    if (kind !== "volume") {
      return [{
        ...primary,
        sourceLabel,
        venueScope,
        updatedAt: latestUpdatedAt(group),
      }];
    }

    const volume24hUsd = group.reduce((sum, ticker) => sum + Math.max(0, ticker.volume24hUsd), 0);

    return [{
      ...primary,
      changePercent24h: weightedChangePercent(group),
      high24h: Math.max(...group.map((ticker) => ticker.high24h)),
      low24h: Math.min(...group.map((ticker) => ticker.low24h)),
      sourceLabel,
      venueScope,
      updatedAt: latestUpdatedAt(group),
      volume24hUsd,
    }];
  });
}

function lightCandidateValue(kind: LeaderboardKind, candidate: ScanLightScanCandidate, derivatives: DerivativeSnapshot[]) {
  const derivative = derivatives.find((item) => baseSymbol(item.symbol) === baseSymbol(candidate.symbol));

  if (kind === "losers" || kind === "gainers") {
    return candidate.changePercent24h;
  }
  if (kind === "volume") {
    return candidate.volume24hUsd;
  }
  if (kind === "volatility_squeeze") {
    return Math.max(0, 100 - candidate.volatilityPercent);
  }
  if (kind === "relative_strength") {
    return candidate.score + Math.max(0, candidate.changePercent24h);
  }
  if (kind === "oi_change") {
    return derivative?.openInterestChangePercent ?? 0;
  }
  if (kind === "funding_hot") {
    return derivative?.fundingRate ?? 0;
  }
  return candidate.score;
}

export function buildFrontendLeaderboardContract({
  backend,
  kind,
  publicMarket,
  snapshot,
}: {
  backend: BackendContract;
  kind: LeaderboardKind;
  publicMarket?: {
    diagnostics: ScanLightScanDiagnostics;
    tickers: MarketTicker[];
  };
  snapshot: MarketRadarSnapshot;
}): Resource<LeaderboardRow[]> {
  const signalSymbols = new Set(snapshot.signals.map((signal) => baseSymbol(signal.symbol)));
  const blockedSymbols = new Set(snapshot.signals.filter((signal) => lifecycleStatusReason(signal).length > 0).map((signal) =>
    baseSymbol(signal.symbol)
  ));
  const candidateSymbols = new Set([
    ...backend.scanProof.lightScan.topCandidates.map((candidate) => baseSymbol(candidate.symbol)),
    ...backend.analysis.signalMaturity.candidateLaneSymbols.map(baseSymbol),
  ]);
  const cleanDeepScanRows = backend.scanProof.deepScan.cleanRows;
  const deepScannedSymbols = cleanDeepScanRows > 0
    ? new Set([
      ...snapshot.tickers.map((ticker) => baseSymbol(ticker.symbol)),
      ...snapshot.derivatives.map((derivative) => baseSymbol(derivative.symbol)),
    ])
    : new Set<string>();
  const awaitingSymbols = new Set([
    ...backend.scanProof.allocation.pendingAssets.map(baseSymbol),
    ...backend.scanProof.allocation.selectedAssets.map(baseSymbol).filter((symbol) => !deepScannedSymbols.has(symbol)),
  ]);
  const lightBySymbol = new Map(backend.scanProof.lightScan.topCandidates.map((candidate) => [baseSymbol(candidate.symbol), candidate]));
  const direction = kind === "losers" ? 1 : -1;
  const rowsBySymbol = new Map<string, LeaderboardRow>();
  const universeSymbols = buildFrontendUniverseSymbols(backend, snapshot);
  publicMarket?.tickers.forEach((ticker) => addFrontendUniverseSymbol(universeSymbols, ticker.symbol));
  const tickerRows = publicMarket?.tickers.length ? publicMarket.tickers : snapshot.tickers;
  const usingPublicMarket = Boolean(publicMarket?.tickers.length);
  const representativeTickerRows = selectLeaderboardTickers(tickerRows, kind);
  const tickerSource: LeaderboardRow["source"] = usingPublicMarket
    ? "public_market_ticker"
    : "scanner_snapshot_ticker";
  const marketBoardKinds = new Set<LeaderboardKind>(["gainers", "losers", "volume"]);
  const shouldUseCandidateFallback = !marketBoardKinds.has(kind) || tickerRows.length === 0;
  const sortKey = leaderboardSortKey(kind);
  const venueScope = usingPublicMarket
    ? "Binance USD-M + OKX USDT SWAP + Bybit USDT linear"
    : "scanner snapshot ticker subset";

  for (const ticker of representativeTickerRows) {
    const symbol = baseSymbol(ticker.symbol);
    if (!shouldExposeFrontendAsset(symbol, universeSymbols)) {
      continue;
    }
    rowsBySymbol.set(symbol, {
      symbol,
      hue: symbolHue(symbol),
      value: round(tickerValue(kind, ticker, snapshot.derivatives, lightBySymbol.get(symbol)), kind === "funding_hot" ? 4 : 2),
      price: ticker.price,
      source: tickerSource,
      sourceLabel: usingPublicMarket ? ticker.sourceLabel : `${ticker.exchange} scanner ticker snapshot`,
      venueScope: usingPublicMarket ? ticker.venueScope : venueScope,
      sortKey,
      rankingScope: marketBoardKinds.has(kind) ? "market_board" : kind === "oi_change" || kind === "funding_hot"
        ? "derivatives_board"
        : "radar_candidate_board",
      updatedAt: ticker.updatedAt,
      inCandidatePool: candidateSymbols.has(symbol),
      deepScanned: deepScannedSymbols.has(symbol),
      hasSignal: signalSymbols.has(symbol),
      blocked: blockedSymbols.has(symbol),
      awaitingScan: awaitingSymbols.has(symbol),
    });
  }

  if (shouldUseCandidateFallback) for (const candidate of backend.scanProof.lightScan.topCandidates) {
    const symbol = baseSymbol(candidate.symbol);
    if (!shouldExposeFrontendAsset(symbol, universeSymbols)) {
      continue;
    }
    if (rowsBySymbol.has(symbol)) {
      continue;
    }
    rowsBySymbol.set(symbol, {
      symbol,
      hue: symbolHue(symbol),
      value: round(lightCandidateValue(kind, candidate, snapshot.derivatives), kind === "funding_hot" ? 4 : 2),
      price: safeNumber(candidate.price, 0),
      source: kind === "oi_change" || kind === "funding_hot" ? "derivatives_context" : "light_scan_candidate",
      sourceLabel: kind === "oi_change" || kind === "funding_hot"
        ? "CoinGlass/scanner derivatives context"
        : "public light scan candidate fallback",
      venueScope: backend.scanProof.lightScan.source || "public light scan",
      sortKey,
      rankingScope: kind === "oi_change" || kind === "funding_hot" ? "derivatives_board" : "radar_candidate_board",
      updatedAt: backend.scanProof.lightScan.generatedAt ?? undefined,
      inCandidatePool: true,
      deepScanned: deepScannedSymbols.has(symbol),
      hasSignal: signalSymbols.has(symbol),
      blocked: blockedSymbols.has(symbol),
      awaitingScan: awaitingSymbols.has(symbol),
    });
  }

  const rows = [...rowsBySymbol.values()]
    .sort((left, right) => direction * (left.value - right.value))
    .slice(0, 50);
  const usedCandidateFallback = rows.some((row) => row.source === "light_scan_candidate");
  const status = rows.length === 0
    ? "empty"
    : usingPublicMarket
      ? marketStatusToResourceStatus(publicMarket?.diagnostics.status)
      : usedCandidateFallback
        ? "partial"
        : marketStatusToResourceStatus(snapshot.metadata.status);
  const source = usingPublicMarket
    ? publicMarket?.diagnostics.source ?? "public-market-tickers"
    : usedCandidateFallback
      ? "public-light-scan-candidate-fallback"
      : "scanner-worker";
  const reason = leaderboardReason({
    kind,
    publicMarket,
    rows,
    usedCandidateFallback,
    usingPublicMarket,
  });

  return resource(rows, status, {
    ageSec: diffSeconds(publicMarket?.diagnostics.generatedAt ?? snapshot.metadata.generatedAt, new Date()),
    source,
    updatedAt: publicMarket?.diagnostics.generatedAt ?? snapshot.metadata.generatedAt,
    reason,
  });
}

function leaderboardSortKey(kind: LeaderboardKind) {
  if (kind === "gainers") {
    return "24h price change percent desc";
  }
  if (kind === "losers") {
    return "24h price change percent asc";
  }
  if (kind === "volume") {
    return "24h quote volume desc";
  }
  if (kind === "volatility_squeeze") {
    return "public light scan volatility compression desc";
  }
  if (kind === "relative_strength") {
    return "public light scan score + positive 24h change desc";
  }
  if (kind === "oi_change") {
    return "open interest change percent desc";
  }
  return "funding rate desc";
}

function leaderboardReason({
  kind,
  publicMarket,
  rows,
  usedCandidateFallback,
  usingPublicMarket,
}: {
  kind: LeaderboardKind;
  publicMarket?: {
    diagnostics: ScanLightScanDiagnostics;
    tickers: MarketTicker[];
  };
  rows: LeaderboardRow[];
  usedCandidateFallback: boolean;
  usingPublicMarket: boolean;
}) {
  if (rows.length === 0) {
    return "没有可展示的真实榜单行；前端不得用 mock 或旧候选补位。";
  }
  if (usingPublicMarket) {
    return `${kind === "gainers" || kind === "losers" || kind === "volume" ? "真实市场榜单" : "雷达辅助榜单"}：${leaderboardSortKey(kind)}；覆盖 ${
      publicMarket?.diagnostics.acceptedCount ?? rows.length
    } 个 USDT 永续 ticker；来源 ${publicMarket?.diagnostics.source ?? "public futures ticker"}。`;
  }
  if (usedCandidateFallback) {
    return "未取得全量 public ticker，本榜单降级为雷达候选/轻扫候选视图；不能当作真实全市场涨跌幅榜。";
  }
  return "使用最近扫描快照中的 ticker 子集；如果需要和交易所实时榜单逐项对照，必须刷新 public market ticker。";
}

function levelMid(level: KeyLevel) {
  const mid = safeNumber(level.midPrice, 0);
  if (mid > 0) {
    return mid;
  }
  return (safeNumber(level.zoneLow, 0) + safeNumber(level.zoneHigh, 0)) / 2;
}

function bestLevel({
  currentPrice,
  direction,
  levels,
}: {
  currentPrice: number;
  direction: "SUPPORT" | "RESISTANCE";
  levels: KeyLevel[];
}) {
  const directional = levels.filter((level) => level.direction === direction || level.direction === "BOTH");
  const located = directional.filter((level) => {
    if (currentPrice <= 0) {
      return true;
    }
    return direction === "SUPPORT"
      ? safeNumber(level.zoneLow, 0) <= currentPrice
      : safeNumber(level.zoneHigh, 0) >= currentPrice;
  });
  const pool = located.length > 0 ? located : directional;

  return pool
    .map((level) => ({
      distance: currentPrice > 0 ? Math.abs(levelMid(level) - currentPrice) : 0,
      level,
    }))
    .sort((left, right) =>
      left.distance - right.distance ||
      right.level.keyScore - left.level.keyScore ||
      right.level.confluenceScore - left.level.confluenceScore
    )[0]?.level ?? null;
}

function structureFromDossier(dossier: SignalBackendDossier, basePrice: number): TfStructure[] {
  const timeframes = ["15m", "1h", "4h", "1d"] as const;
  const selected = new Set(dossier.chart.availableTimeframes);
  const direction = tokenDirectionCn(dossier.signal?.direction);
  const trend: TfStructure["trend"] = direction === "看多" ? "多" : direction === "看空" ? "空" : "震荡";
  const currentPrice = safeNumber(dossier.strategyV3?.currentPrice, safeNumber(basePrice, 0));
  const keyLevels = dossier.strategyV3?.keyLevels ?? [];

  return timeframes.map((tf) => {
    const timeframeLevels = keyLevels.filter((level) => level.timeframe === tf);
    const support = bestLevel({
      currentPrice,
      direction: "SUPPORT",
      levels: timeframeLevels,
    });
    const resistance = bestLevel({
      currentPrice,
      direction: "RESISTANCE",
      levels: timeframeLevels,
    });
    const supportValue = support ? round(levelMid(support), currentPrice < 1 ? 4 : 2) : 0;
    const resistanceValue = resistance ? round(levelMid(resistance), currentPrice < 1 ? 4 : 2) : 0;

    return {
      tf,
      phase: selected.has(tf)
        ? timeframeLevels.length > 0
          ? dossier.strategyV3?.summary ?? dossier.signal?.summary ?? "后端结构"
          : "OHLCV 已接入，关键位待补齐"
        : "等待 OHLCV 补齐",
      trend,
      priorHigh: resistanceValue,
      priorLow: supportValue,
      support: supportValue,
      resistance: resistanceValue,
    };
  });
}

function chartIntegrityFromDossier(dossier: SignalBackendDossier): TokenChartIntegrity {
  const hasTradingView = Boolean(dossier.chart.tradingView?.symbol && dossier.chart.tradingView?.url);
  const hasV3Overlays = Boolean(
    dossier.strategyV3 &&
    (
      dossier.strategyV3.keyLevels.length > 0 ||
      dossier.strategyV3.forwardLevels.length > 0 ||
      dossier.strategyV3.tradePlan
    ),
  );

  return {
    availableTimeframes: [...dossier.chart.availableTimeframes],
    canUseMockCandles: false,
    overlaySource: hasV3Overlays ? "v3_key_levels_forward_map_trade_plan" : "none",
    selectedTimeframe: dossier.chart.selectedTimeframe ?? dossier.chart.availableTimeframes[0] ?? "4h",
    status: hasTradingView
      ? hasV3Overlays
        ? "ready"
        : "partial"
      : "empty",
    tradingViewSymbol: dossier.chart.tradingView?.symbol ?? null,
    tradingViewUrl: dossier.chart.tradingView?.url ?? null,
  };
}

function priceText(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "等待目标位";
  }

  return value >= 100 ? value.toFixed(2) : value.toFixed(6).replace(/0+$/u, "").replace(/\.$/u, "");
}

function tradePlanFromV3({
  altcoinMaxLeverage,
  currentPrice,
  plan,
  symbol,
}: {
  altcoinMaxLeverage?: number | null;
  currentPrice: number | null;
  plan: StrategyV3TradePlan | undefined;
  symbol: string;
}): TradePlanData | null {
  if (!plan || !plan.isPlanEligible || plan.rewardRisk === null || plan.rewardRisk < 3) {
    return null;
  }

  if (plan.status !== "READY_LONG" && plan.status !== "READY_SHORT") {
    return null;
  }

  return {
    bias: plan.direction === "long" ? "多" : plan.direction === "short" ? "空" : "观望",
    entryCondition: plan.entryZone,
    stop: plan.structuralStop === null
      ? plan.invalidation
      : `${priceText(plan.structuralStop)}；${plan.invalidation}`,
    tp1: priceText(plan.targets[0]),
    tp2: priceText(plan.targets[1] ?? plan.targets[0]),
    tp3: priceText(plan.targets[2] ?? plan.targets.at(-1) ?? plan.targets[0]),
    rr: round(plan.rewardRisk, 2),
    positionLens: buildPersonalPositionLens({
      entryPrice: currentPrice,
      profile: {
        altcoinLeverage: altcoinMaxLeverage,
        btcEthLeverage: 150,
        marginFraction: 0.003,
      },
      side: plan.direction,
      stopPrice: plan.structuralStop,
      symbol,
      targetPrice: plan.targets[0],
    }),
    scaleOut: plan.takeProfitPlan,
    invalidation: plan.invalidation,
    allowChase: false,
  };
}

function v3TradePlanBlockers(plan: StrategyV3TradePlan | undefined) {
  if (!plan) {
    return ["等待后端结构化交易计划"];
  }

  if (plan.isPlanEligible && plan.rewardRisk !== null && plan.rewardRisk >= 3 && (
    plan.status === "READY_LONG" || plan.status === "READY_SHORT"
  )) {
    return [];
  }

  return [
    ...plan.blockedBy,
    plan.rewardRisk !== null && plan.rewardRisk < 3 ? `结构盈亏比 ${round(plan.rewardRisk, 2)}:1 低于最低 3:1 门槛` : null,
    plan.status === "WAIT_PULLBACK" ? "等待回踩确认" : null,
    plan.status === "WAIT_RETEST" ? "等待反抽确认" : null,
    plan.status === "WATCH_ONLY" ? "只观察，不生成交易计划" : null,
    plan.summary,
  ].filter((item): item is string => Boolean(item));
}

function dossierReviewOnlyReasons(dossier: SignalBackendDossier) {
  const context = dossier.strategyV3?.trendContext;
  const location = context?.locationRiskReward;
  const integrity = context?.trendIntegrity;
  const isReviewOnly = context?.decision === "AVOID_CHASE_LONG" ||
    context?.decision === "AVOID_CHASE_SHORT" ||
    context?.state === "LONG_EXHAUSTION" ||
    context?.state === "SHORT_EXHAUSTION" ||
    location?.positionQuality === "CHASE_RISK" ||
    location?.riskFlags.includes("chase_risk") === true ||
    integrity?.status === "EXHAUSTION_RISK" ||
    integrity?.riskFlags.includes("upper_wick_exhaustion") === true ||
    integrity?.riskFlags.includes("lower_wick_exhaustion") === true;

  if (!isReviewOnly) {
    return [];
  }

  return [
    "行情已进入追涨/追空或衰竭风险区，只能做复盘观察，不能生成交易计划",
    context?.nextStep,
    ...(context?.noParticipationReasons ?? []),
    dossier.strategyV3?.tradePlan?.summary,
  ].filter((item): item is string => Boolean(item));
}

function zoneText(zoneLow: number, zoneHigh: number) {
  const low = priceText(zoneLow);
  const high = priceText(zoneHigh);

  return low === high ? low : `${low} - ${high}`;
}

function keyLevelLabel(level: KeyLevel) {
  const direction = level.direction === "SUPPORT" ? "支撑" : level.direction === "RESISTANCE" ? "压力" : "双向位";
  return `${level.timeframe} ${direction} · ${keyLevelTypeLabel(level.type)}`;
}

function keyLevelTypeLabel(type: string) {
  const labels: Record<string, string> = {
    DYNAMIC_LEVEL: "动态均线/趋势位",
    PSYCHOLOGICAL: "整数心理位",
    RANGE_HIGH: "箱体上沿",
    RANGE_LOW: "箱体下沿",
    ROLE_FLIP: "支撑压力互换位",
    STATE_CHANGE: "结构切换位",
    SWING_HIGH: "前高",
    SWING_LOW: "前低",
    VOLUME_NODE: "成交密集位",
  };
  return labels[type] ?? engineText(type);
}

function levelStatusLabel(status: string) {
  const labels: Record<string, string> = {
    AHEAD: "尚未到达",
    ARRIVED: "已到关键区",
    BROKEN: "已跌破/突破失守",
    CONFIRMED: "已确认",
    INVALIDATED: "已失效",
    POTENTIAL: "潜在关键位",
    REACTION: "正在反应",
    REACTION_STARTED: "反应开始",
    RECLAIMED: "重新收回",
    WEAKENING: "正在减弱",
  };
  return labels[status] ?? engineText(status);
}

function forwardRoleBusinessLabel(role: string) {
  const labels: Record<string, string> = {
    CURRENT_DEFENSE: "当前防守位",
    FIRST_REBOUND_RESISTANCE: "第一反弹压力",
    INVALIDATION_LEVEL: "失效位",
    NEXT_REACTION_ZONE: "下一反应区",
    SECOND_REBOUND_RESISTANCE: "第二反弹压力",
    TREND_CHANGE_LEVEL: "趋势切换位",
  };
  return labels[role] ?? engineText(role);
}

function reactionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    CONFIRMED: "反应确认",
    FAILED: "反应失败",
    NO_REACTION: "暂无反应",
    REACTION_STARTED: "反应开始",
    TOO_FAR_FROM_LEVEL: "离关键位太远",
  };
  return labels[status] ?? engineText(status);
}

function trendIntegrityStatusLabel(status: string) {
  const labels: Record<string, string> = {
    DAMAGED_TREND: "趋势受损",
    EXHAUSTION_RISK: "衰竭风险",
    HEALTHY_TREND: "趋势健康",
    INSUFFICIENT_DATA: "数据不足",
    RANGE_BOUND: "区间震荡",
  };
  return labels[status] ?? engineText(status);
}

function engineText(value: string | null | undefined) {
  if (!value) {
    return "等待定义";
  }
  const labels: Record<string, string> = {
    bear_structure_broken: "空头结构被破坏",
    bull_structure_broken: "多头结构被破坏",
    chase_risk: "追涨/追空风险",
    lower_wick_exhaustion: "下影线衰竭风险",
    low_alignment: "多周期共振不足",
    neutral_direction: "方向中性",
    no_nearest_target: "缺少最近目标位",
    no_recent_touch: "近期没有触碰关键位",
    no_relevant_level: "缺少相关关键位",
    no_structural_stop: "缺少结构止损",
    resistance_reclaimed: "压力位被重新收回",
    reward_risk_below_minimum: "结构盈亏比不足",
    stop_distance_too_wide: "止损距离过宽",
    support_lost: "支撑位失守",
    upper_wick_exhaustion: "上影线衰竭风险",
  };
  return labels[value] ?? value.replace(/_/g, " ").toLowerCase();
}

function engineList(values: string[] | undefined) {
  if (!values || values.length === 0) {
    return "无";
  }
  return values.map(engineText).join(" / ");
}

function keyLevelReportItems(dossier: SignalBackendDossier): AnalysisReportSection["items"] {
  const currentPrice = safeNumber(dossier.strategyV3?.currentPrice, 0);
  const levels = [...(dossier.strategyV3?.keyLevels ?? [])]
    .map((level) => ({
      distance: currentPrice > 0 ? Math.abs(levelMid(level) - currentPrice) : 0,
      level,
    }))
    .sort((left, right) =>
      left.distance - right.distance ||
      right.level.keyScore - left.level.keyScore ||
      right.level.confluenceScore - left.level.confluenceScore
    )
    .slice(0, 4);

  return levels.map(({ level }, index) => ({
      detail: `${zoneText(level.zoneLow, level.zoneHigh)}；状态 ${levelStatusLabel(level.status)}；关键分 ${level.keyScore}，共振 ${level.confluenceScore}；确认：${engineList(level.confirmationRules)}；失效：${engineText(level.invalidationRule)}`,
    label: keyLevelLabel(level),
    sourceId: `v3:key-level:${level.id || index + 1}`,
  }));
}

function forwardRoleLabel(level: ForwardLevel) {
  const side = level.side === "SUPPORT" ? "支撑" : "压力";
  return `${side} · ${forwardRoleBusinessLabel(level.role)}`;
}

function forwardLevelReportItems(dossier: SignalBackendDossier): AnalysisReportSection["items"] {
  return (dossier.strategyV3?.forwardLevels ?? [])
    .slice(0, 4)
    .map((level, index) => ({
      detail: `${zoneText(level.zoneLow, level.zoneHigh)}；状态 ${levelStatusLabel(level.status)}；权重 ${level.timeframeWeight}，关键分 ${level.keyScore}；原因：${engineList(level.reasons)}；失效：${engineList(level.invalidationRules)}`,
      label: forwardRoleLabel(level),
      sourceId: `v3:forward-level:${level.id || index + 1}`,
    }));
}

function timeframeGateReportItems(signal: SignalBackendDossier["signal"]): AnalysisReportSection["items"] {
  if (!signal?.timeframeGate) {
    return [{
      detail: "当前信号没有触发多周期硬门控；仍需以后端风险门控和结构盈亏比为准。",
      label: "多周期门控",
      sourceId: "timeframe-gate:allow",
    }];
  }

  const gate = signal.timeframeGate;

  return [{
    detail: `${gate.summary}；动作 ${engineText(gate.action)}；阻断：${engineList(gate.blockedBy)}；${gate.guardrail}`,
    label: gate.allowed ? "多周期门控放行" : "多周期门控拦截",
    sourceId: "timeframe-gate:summary",
  }];
}

function trendContextReportItems(dossier: SignalBackendDossier): AnalysisReportSection["items"] {
  const context = dossier.strategyV3?.trendContext;

  if (!context) {
    return [];
  }

  const items: AnalysisReportSection["items"] = [
    {
      detail: `${context.summary}；阶段：${trendStateLabel(context.state)}；当前处理：${trendDecisionLabel(context.decision)}；下一步：${context.nextStep}`,
      label: "趋势状态机",
      sourceId: "v3:trend-context:state",
    },
    {
      detail: `多头启动前 ${context.scores.longPreTrendScore}；空头启动前 ${context.scores.shortPreTrendScore}；多头能量 ${context.scores.longTrendEnergyScore}；空头能量 ${context.scores.shortTrendEnergyScore}；风险 ${context.scores.riskScore}；趋势保持 ${context.scores.trendHoldScore}；衰竭 ${context.scores.exhaustionScore}`,
      label: "趋势评分",
      sourceId: "v3:trend-context:scores",
    },
  ];

  if (context.locationRiskReward) {
    items.push({
      detail: `${context.locationRiskReward.summary}；结构盈亏比 ${context.locationRiskReward.rewardRisk ?? "等待"}；结构止损 ${priceText(context.locationRiskReward.structuralStop)}；最近目标 ${priceText(context.locationRiskReward.nearestTarget)}`,
      label: "位置与赔率",
      sourceId: "v3:location-rr",
    });
  }

  if (context.reactionQuality) {
    items.push({
      detail: `${context.reactionQuality.summary}；状态 ${reactionStatusLabel(context.reactionQuality.status)}；质量分 ${context.reactionQuality.qualityScore}；风险 ${engineList(context.reactionQuality.riskFlags)}`,
      label: "回踩/反抽质量",
      sourceId: "v3:reaction-quality",
    });
  }

  if (context.trendIntegrity) {
    items.push({
      detail: `${context.trendIntegrity.summary}；状态 ${trendIntegrityStatusLabel(context.trendIntegrity.status)}；完整度 ${context.trendIntegrity.integrityScore}；风险 ${engineList(context.trendIntegrity.riskFlags)}`,
      label: "趋势完整度",
      sourceId: "v3:trend-integrity",
    });
  }

  if (context.conflicts.length > 0) {
    items.push({
      detail: context.conflicts.join(" / "),
      label: "趋势冲突",
      sourceId: "v3:trend-context:conflicts",
    });
  }

  return items;
}

function trendStateLabel(state: string) {
  const labels: Record<string, string> = {
    CONFLICT: "多空冲突",
    INVALIDATED: "结构失效",
    LONG_BREAKOUT: "多头突破",
    LONG_EXHAUSTION: "多头衰竭风险",
    LONG_PULLBACK_CONFIRM: "多头回踩确认",
    LONG_TREND_ACCELERATION: "多头趋势加速",
    PRE_TREND_LONG: "多头启动前",
    PRE_TREND_SHORT: "空头启动前",
    RANGE_COMPRESSION: "区间压缩",
    RANGE_IDLE: "区间观察",
    SHORT_BREAKDOWN: "空头破位",
    SHORT_EXHAUSTION: "空头衰竭风险",
    SHORT_RETEST_CONFIRM: "空头反抽确认",
    SHORT_TREND_ACCELERATION: "空头趋势加速",
  };

  return labels[state] ?? state;
}

function trendDecisionLabel(decision: string) {
  const labels: Record<string, string> = {
    AVOID_CHASE_LONG: "不追多，等待回踩",
    AVOID_CHASE_SHORT: "不追空，等待反抽",
    CONFLICT_WAIT: "冲突等待",
    INVALIDATED: "失效",
    LONG_PLAN: "多头计划就绪",
    NO_TRADE: "不交易",
    PREPARE_LONG: "准备观察多头",
    PREPARE_SHORT: "准备观察空头",
    SHORT_PLAN: "空头计划就绪",
    TAKE_PROFIT_LONG: "多头止盈管理",
    TAKE_PROFIT_SHORT: "空头止盈管理",
    TREND_HOLD_LONG: "多头趋势持有观察",
    TREND_HOLD_SHORT: "空头趋势持有观察",
    WAIT_LONG_BREAKOUT: "等待多头突破",
    WAIT_LONG_PULLBACK: "等待多头回踩",
    WAIT_SHORT_BREAKDOWN: "等待空头破位",
    WAIT_SHORT_RETEST: "等待空头反抽",
    WATCH_ONLY: "仅观察",
  };

  return labels[decision] ?? decision;
}

function buildAnalysisReportSections({
  blockedReasons,
  counter,
  dossier,
  discovery,
  evidence,
  tradePlan,
}: {
  blockedReasons: string[];
  counter: CounterItem[];
  dossier: SignalBackendDossier;
  discovery: DiscoveryFact;
  evidence: EvidenceItem[];
  tradePlan: TradePlanData | null;
}): AnalysisReportSection[] {
  const signal = dossier.signal;
  const keyLevelItems = keyLevelReportItems(dossier);
  const forwardItems = forwardLevelReportItems(dossier);
  const timeframeGateItems = timeframeGateReportItems(signal);
  const trendContextItems = trendContextReportItems(dossier);
  const v3Plan = dossier.strategyV3?.tradePlan;
  const currentConclusion = tradePlan
    ? "后端已生成交易计划；仍必须人工复核，不自动下单。"
    : blockedReasons.length > 0
      ? `当前不能交易：${blockedReasons.slice(0, 3).join("；")}。`
      : "当前仅能观察，等待结构、证据、结构盈亏比和风控同时满足。";
  const watchReason = signal
    ? signal.summary
    : "后端没有找到该币种的成熟信号；不能因为页面打开了就生成方向。";
  const canTradeNow = tradePlan
    ? `可以进入人工计划复核；结构盈亏比 ${tradePlan.rr}:1，入场必须满足：${tradePlan.entryCondition}。`
    : "不能给交易计划；缺失交易计划时，前端不得补入场、止损或目标。";
  const failureMode = [
    ...blockedReasons.slice(0, 2),
    ...counter.slice(0, 2).map((item) => item.detail),
  ].filter(Boolean).join("；") || "暂无明确反证，但样本和数据源状态仍需要继续观察。";

  return [
    {
      key: "facts",
      title: "当前结论",
      status: signal ? "ready" : "empty",
      items: [
        { detail: currentConclusion, label: "一句话结论", sourceId: "report:current-conclusion" },
        { detail: watchReason, label: "为什么看", sourceId: signal ? "signal:summary" : "signal:missing" },
        { detail: displaySymbol(dossier.symbol), label: "标的", sourceId: "dossier:symbol" },
        { detail: tokenDirectionCn(signal?.direction), label: "方向", sourceId: "signal:direction" },
        { detail: signal?.summary ?? "后端未找到成熟信号", label: "状态", sourceId: "signal:summary" },
        { detail: signal?.timeframe ?? "等待信号周期", label: "信号周期", sourceId: "signal:timeframe" },
        { detail: String(signal?.confidence ?? "等待评分"), label: "置信度", sourceId: "signal:confidence" },
        { detail: discovery.summary, label: "发现层状态", sourceId: `discovery:${discovery.source}` },
        { detail: dossier.strategyV3?.summary ?? "等待 v3 趋势地图", label: "v3 摘要", sourceId: "v3:summary" },
        { detail: priceText(dossier.strategyV3?.currentPrice), label: "当前价", sourceId: "v3:current-price" },
        {
          detail: dossier.chart.availableTimeframes.join(" / ") || "等待 OHLCV",
          label: "可用周期",
          sourceId: "chart:timeframes",
        },
        ...keyLevelItems,
      ],
    },
    {
      key: "supportive_evidence",
      title: "为什么值得看",
      status: evidence.length > 0 ? "ready" : "empty",
      items: [
        {
          detail: evidence.length > 0
            ? `已有 ${evidence.length} 条支持证据；它们只能说明值得继续看，不能单独等于交易。`
            : "暂无支持证据；该币不能被包装成机会。",
          label: "支持力度",
          sourceId: "evidence:supportive-count",
        },
        {
          detail: discovery.foundInLightScan
            ? `轻扫发现层命中；${discovery.summary}；原因 ${discovery.reasons.slice(0, 4).join(" / ") || "等待原因标签"}。`
            : discovery.summary,
          label: "提前发现证据",
          sourceId: `discovery:${discovery.source}`,
        },
        ...trendContextItems,
        ...forwardItems,
        ...evidence.map((item) => ({
          detail: item.detail,
          label: `${item.label} · 权重 ${item.weight}`,
          sourceId: item.sourceId,
        })),
      ],
    },
    {
      key: "counter_evidence",
      title: "哪里可能错",
      status: counter.length > 0 || timeframeGateItems.length > 0 ? "partial" : "empty",
      items: [
        { detail: failureMode, label: "主要失效点", sourceId: "report:failure-mode" },
        ...timeframeGateItems,
        ...counter.map((item) => ({
          detail: item.detail,
          label: item.label,
          sourceId: item.sourceId,
        })),
      ],
    },
    {
      key: "risk_gate",
      title: "现在能不能做",
      status: blockedReasons.length > 0 ? "blocked" : "ready",
      items: blockedReasons.length > 0
        ? [
          { detail: canTradeNow, label: "交易许可", sourceId: "risk-gate:decision" },
          ...blockedReasons.map((reason, index) => ({
            detail: reason,
            label: `阻断 ${index + 1}`,
            sourceId: `risk-gate:blocker:${index + 1}`,
          })),
        ]
        : [
          { detail: canTradeNow, label: "交易许可", sourceId: "risk-gate:decision" },
          { detail: "未发现阻断交易计划的风控门禁原因。", label: "风控状态", sourceId: "risk-gate:allow" },
        ],
    },
    {
      key: "trade_plan",
      title: "怎么做",
      status: tradePlan ? "ready" : "blocked",
      items: tradePlan
        ? [
          { detail: canTradeNow, label: "操作前提", sourceId: "trade-plan:decision" },
          { detail: v3Plan?.summary ?? "后端已生成交易计划", label: "计划摘要", sourceId: "trade-plan:summary" },
          { detail: tradePlan.entryCondition, label: "入场条件", sourceId: "trade-plan:entry" },
          { detail: tradePlan.stop, label: "止损/失效", sourceId: "trade-plan:stop" },
          { detail: `${tradePlan.tp1} / ${tradePlan.tp2} / ${tradePlan.tp3}`, label: "目标区", sourceId: "trade-plan:targets" },
          { detail: `${tradePlan.rr}:1`, label: "盈亏比", sourceId: "trade-plan:rr" },
          {
            detail: tradePlan.positionLens.summary,
            label: "个人仓位镜头",
            sourceId: "trade-plan:position-lens",
          },
          {
            detail: tradePlan.positionLens.status === "ready"
              ? `名义仓位约占总资金 ${tradePlan.positionLens.notionalPerEquity}%；止损约 -${tradePlan.positionLens.stopLossPctOfEquity}% 总资金 / ROE -${tradePlan.positionLens.stopLossRoe}%；TP1 约 +${tradePlan.positionLens.targetProfitPctOfEquity}% 总资金 / ROE ${tradePlan.positionLens.targetRoe}%。`
              : tradePlan.positionLens.summary,
            label: "杠杆结果换算",
            sourceId: "trade-plan:position-lens-result",
          },
          { detail: tradePlan.scaleOut, label: "分批止盈", sourceId: "trade-plan:scale-out" },
          { detail: v3Plan?.positionSizing ?? "等待仓位提示", label: "仓位规则", sourceId: "trade-plan:position-sizing" },
          {
            detail: v3Plan?.confirmationChecklist.join(" / ") || "等待确认清单",
            label: "确认清单",
            sourceId: "trade-plan:confirmation-checklist",
          },
          {
            detail: v3Plan?.manualReviewRequired ? "必须人工复核；不自动下单" : "等待人工复核状态",
            label: "执行边界",
            sourceId: "trade-plan:manual-review",
          },
        ]
        : [{ detail: "未通过风控门禁或结构盈亏比门槛，前端不得生成入场、止损、目标。", label: "未生成", sourceId: "trade-plan:blocked" }],
    },
    {
      key: "review_boundary",
      title: "复盘与规则反证边界",
      status: "partial",
      items: [
        { detail: `${dossier.journal.totalEvents} 条关联 journal / review 样本。`, label: "复盘样本", sourceId: "journal:samples" },
        { detail: "外部 AI 已取消；规则反证只检查漏洞和反向证据，不替代规则引擎，不直接给买卖方向。", label: "反证边界", sourceId: "rule-review:boundary" },
      ],
    },
  ];
}

function buildTokenStrategyReadiness({
  blockedReasons,
  discovery,
  tradePlan,
}: {
  blockedReasons: string[];
  discovery: DiscoveryFact;
  tradePlan: TradePlanData | null;
}): TokenStrategyReadiness {
  const executionMap = buildTokenExecutionMap({
    blockedReasons,
    discovery,
    tradePlan,
  });

  if (tradePlan) {
    return {
      schemaVersion: "token-strategy-readiness.v1",
      status: "ready",
      canTradeNow: true,
      summary: `交易计划已由后端生成：方向 ${tradePlan.bias}，结构盈亏比 ${tradePlan.rr}:1；仍必须人工复核，不自动下单。`,
      nextAction: `只在满足入场条件时复核：${tradePlan.entryCondition}`,
      missingPieces: [],
      guardrails: [
        "结构盈亏比已先通过，个人杠杆只做收益/风险换算。",
        "禁止追单；触发条件没到就不做。",
        "任何失效条件触发都必须退出计划。",
      ],
      executionMap,
      positionLensStatus: tradePlan.positionLens.status,
      personalLens: tradePlan.positionLens.summary,
    };
  }

  const isReviewOnly = discovery.opportunityPhase === "late_move" || discovery.overextensionRisk === "high" ||
    blockedReasons.some((reason) => /追涨|追空|晚到|过热|跌深|衰竭|REVIEW_ONLY/iu.test(reason));
  const missingPieces = blockedReasons.length > 0
    ? blockedReasons.slice(0, 8)
    : [
      "等待结构、证据、结构盈亏比、风控门禁和失效条件同时满足。",
    ];

  return {
    schemaVersion: "token-strategy-readiness.v1",
    status: isReviewOnly ? "review_only" : missingPieces.length > 0 ? "blocked" : "watch",
    canTradeNow: false,
    summary: isReviewOnly
      ? "当前更像晚到或延展行情，只能进入复盘/等待回踩或反抽重构，不能追。"
      : "当前没有后端交易计划；前端不得补入场、止损或目标。",
    nextAction: isReviewOnly
      ? "回看启动前窗口，等待新结构给出更好的位置。"
      : "继续等深扫、结构、结构盈亏比和风控门禁完整。",
    missingPieces,
    guardrails: [
      "没有 tradePlan 时不允许显示交易计划。",
      "方向偏多/偏空不代表当前位置可做。",
      "结构盈亏比仍按结构价格距离计算，个人杠杆只在计划生成后换算展示。",
    ],
    executionMap,
    positionLensStatus: "not_applicable",
    personalLens: "尚未生成交易计划，个人仓位镜头不适用。",
  };
}

function buildTokenExecutionMap({
  blockedReasons,
  discovery,
  tradePlan,
}: {
  blockedReasons: string[];
  discovery: DiscoveryFact;
  tradePlan: TradePlanData | null;
}): TokenExecutionMap {
  const blockedText = blockedReasons.join(" / ");
  const reviewOnly = discovery.opportunityPhase === "late_move" || discovery.overextensionRisk === "high" ||
    /追涨|追空|晚到|过热|跌深|衰竭|REVIEW_ONLY/iu.test(blockedText);
  const waitPullback = reviewOnly || /回踩|反抽|pullback|retest|二次确认/iu.test(blockedText);
  const directionRead: TokenExecutionMap["directionRead"] = tradePlan?.bias === "多"
    ? "bullish"
    : tradePlan?.bias === "空"
      ? "bearish"
      : "neutral";
  const tradabilityRead: TokenExecutionMap["tradabilityRead"] = tradePlan
    ? "trade_plan_ready"
    : reviewOnly
      ? "review_only"
      : waitPullback
        ? "wait_pullback_or_retest"
        : blockedReasons.length > 0
          ? "blocked"
          : "wait_confirmation";
  const positionQuality: TokenExecutionMap["positionQuality"] = tradePlan
    ? "good"
    : reviewOnly
      ? "late"
      : discovery.opportunityPhase === "early_setup" || discovery.opportunityPhase === "breakout_watch"
        ? "waiting"
        : "unknown";

  return {
    schemaVersion: "token-execution-map.v1",
    directionRead,
    tradabilityRead,
    positionQuality,
    waitFor: tradePlan
      ? [tradePlan.entryCondition, "人工复核结构、成交和失效条件后再执行。"]
      : waitPullback
        ? ["等待回踩/反抽后重新确认结构盈亏比。", "等待新的失效线靠近价格，不追已经延展的行情。"]
        : ["等待深扫、结构、结构盈亏比、风控门禁和失效条件完整。"],
    invalidIf: tradePlan
      ? [tradePlan.invalidation, "任何反证覆盖支持证据时撤销计划。"]
      : blockedReasons.length > 0
        ? blockedReasons.slice(0, 4)
        : ["证据不足、结构盈亏比不够或高周期冲突时不生成计划。"],
    chartBoundary: tradePlan
      ? `TradingView 只做看图和人工复核；后端计划边界为入场 ${tradePlan.entryCondition} / 止损 ${tradePlan.stop} / 目标 ${tradePlan.tp1}-${tradePlan.tp3}。`
      : "TradingView 只做看图；没有后端 tradePlan 时，前端不得补入场、止损和目标。",
    manualReviewRequired: true,
  };
}

export function buildFrontendTokenDossierContract({
  basePrice = 1,
  dossier,
  now = new Date(),
}: {
  basePrice?: number;
  dossier: SignalBackendDossier;
  now?: Date;
}): Resource<TokenDossier> {
  const signal = dossier.signal;
  const hardBlockedReasons = signal
    ? [
      ...(signal.risk === "blocked" ? ["风控门禁拦截"] : []),
      ...(signal.timeframeGate && !signal.timeframeGate.allowed ? [signal.timeframeGate.summary] : []),
    ]
    : ["后端没有找到该币种的成熟信号"];
  const evidence = dossier.evidence.items.filter((item) => item.polarity === "supportive");
  const counter = dossier.evidence.items.filter((item) => item.polarity === "conflicting" || item.polarity === "blocking");
  const v3Plan = dossier.strategyV3?.tradePlan;
  const rawTradePlan = tradePlanFromV3({
    altcoinMaxLeverage: dossier.execution?.maxLeverage ?? null,
    currentPrice: dossier.strategyV3?.currentPrice ?? null,
    plan: v3Plan,
    symbol: dossier.symbol,
  });
  const reviewOnlyReasons = dossierReviewOnlyReasons(dossier);
  const tradePlan = reviewOnlyReasons.length > 0 ? null : rawTradePlan;
  const blockedReasons = [
    ...hardBlockedReasons,
    ...reviewOnlyReasons,
    ...(signal ? v3TradePlanBlockers(v3Plan) : []),
  ];
  const evidenceItems = evidence.map((item, index) => ({
    sourceId: evidenceSourceId(item, index),
    kind: evidenceKind(item.layer),
    label: item.label,
    weight: evidenceWeight(item, dossier.evidence.total),
    detail: item.value,
    supportive: true,
  }));
  const counterItems = counter.map((item, index) => ({
    sourceId: evidenceSourceId(item, index),
    kind: evidenceKind(item.layer),
    label: item.label,
    detail: item.value,
  }));
  const discovery = discoveryFactFromDossier(dossier);

  return resource({
    symbol: displaySymbol(dossier.symbol),
    direction: tokenDirectionCn(signal?.direction),
    maturity: signal
      ? hardBlockedReasons.length > 0 || v3Plan?.status === "BLOCKED"
        ? "BLOCKED"
        : reviewOnlyReasons.length > 0
          ? "REVIEW_ONLY"
        : tradePlan
          ? "TRADE_PLAN_READY"
          : "EVIDENCE_SIGNAL"
      : "INVALIDATED",
    chart: chartIntegrityFromDossier(dossier),
    discovery,
    structures: structureFromDossier(dossier, basePrice),
    evidence: evidenceItems,
    counter: counterItems,
    riskGate: {
      allowTradePlan: tradePlan !== null,
      reasons: tradePlan ? [] : blockedReasons,
    },
    strategyReadiness: buildTokenStrategyReadiness({
      blockedReasons,
      discovery,
      tradePlan,
    }),
    tradePlan,
    aiReview: {
      reviewed: signal?.timeframeGate !== undefined || dossier.evidence.total > 0,
      findings: counter.map((item) => item.value).slice(0, 5),
      suggestDowngrade: blockedReasons.length > 0,
      note: "外部 AI 已取消；当前只用规则反证检查漏洞，不生成交易结论；最终判定以规则引擎为准。",
    },
    reportSections: buildAnalysisReportSections({
      blockedReasons,
      counter: counterItems,
      dossier,
      discovery,
      evidence: evidenceItems,
      tradePlan,
    }),
  }, dossier.found ? "live" : "empty", {
    ageSec: diffSeconds(dossier.generatedAt, now),
    source: "signal-worker",
  });
}

function lifecycleFromJournal(event: JournalEvent): SignalLifecycle {
  const trigger = event.outcomeMetrics?.entryPrice ?? Number(event.trigger ?? 0);
  const stop = event.outcomeMetrics?.invalidationPrice ?? 0;
  const target = event.outcomeMetrics?.firstTargetPrice ?? 0;
  return {
    id: event.id,
    symbol: displaySymbol(event.symbol),
    hue: symbolHue(event.symbol),
    side: event.direction === "short" ? "空" : "多",
    appearedAt: dateTimeLabel(event.createdAt),
    triggerPrice: trigger,
    stopPrice: stop,
    targetPrice: target,
    verifyWindowH: event.outcomeMetrics?.validationWindowHours ?? 24,
    hitTpFirst: event.firstTargetHit === true || event.result === "win",
    hitSlFirst: event.invalidationHit === true || event.result === "loss",
    timedOut: event.outcomeStatus === "expired",
    mfe: round(event.outcomeMetrics?.mfePercent ?? 0, 2),
    mae: round(event.outcomeMetrics?.maePercent ?? 0, 2),
  };
}

function strategyArchetypeFromStage(stage: BusinessCapabilityStage): StrategyArchetype {
  return {
    key: capabilityKey(stage.id),
    name: stage.title,
    winRate: null,
    avgRR: null,
    samples: 0,
    commonFailure: `样本收集中：${stage.nextAction}`,
  };
}

function buildAiReviewStats(snapshot: MarketRadarSnapshot): AiReviewStats {
  const reviews = snapshot.signals.map((signal) => signal.aiReview).filter(Boolean);

  return {
    disabled: reviews.filter((review) => review?.status === "disabled").length,
    fallback: reviews.filter((review) => review?.status === "fallback").length,
    reviewed: reviews.filter((review) => review?.status === "reviewed").length,
    total: reviews.length,
    unboundFallbackProtected: true,
  };
}

function aiReviewStatsResourceStatus(stats: AiReviewStats): DataStatus {
  if (stats.total === 0) {
    return "empty";
  }

  if (stats.reviewed > 0) {
    return "live";
  }

  return "partial";
}

function reviewSampleStatusToResourceStatus(
  status: BackendContract["analysis"]["reviewStatistics"]["sampleStatus"],
): DataStatus {
  if (status === "empty") {
    return "empty";
  }

  if (status === "usable") {
    return "live";
  }

  return "partial";
}

function buildDiscoveryReviewState(
  backend: BackendContract,
  missedDetectionCount: number,
): DiscoveryReviewState {
  const topCandidates = backend.scanProof.lightScan.topCandidates ?? [];
  const reviewStats = backend.analysis.reviewStatistics;
  const earlyOpportunityCount = topCandidates.filter((candidate) =>
    candidate.opportunityPhase === "early_setup" || (candidate.earlyOpportunityScore ?? 0) >= 55
  ).length;
  const lateMoveCount = topCandidates.filter((candidate) =>
    candidate.opportunityPhase === "late_move" || candidate.overextensionRisk === "high"
  ).length;
  const cvdProxyCandidateCount = topCandidates.filter(candidateHasCvdProxy).length;
  const hasOutcomeSamples = reviewStats.samples.withMetrics > 0 || reviewStats.samples.evidenceLevel > 0;
  const hasClosedSamples = reviewStats.samples.closed > 0;
  const calibrationStatus: DiscoveryReviewState["calibration"]["status"] =
    hasOutcomeSamples && (earlyOpportunityCount > 0 || lateMoveCount > 0)
      ? hasClosedSamples ? "usable" : "collecting"
      : "empty";

  return {
    calibration: {
      earlyOutcomeLink: hasOutcomeSamples && earlyOpportunityCount > 0 ? "ready" : "collecting",
      lateSignalPenalty: lateMoveCount > 0 ? "active" : "collecting",
      mfeMaeLink: hasOutcomeSamples ? "ready" : "collecting",
      notes: [
        "启动前评分只能通过后续最大浮盈/最大回撤、目标/止损先后顺序和超时样本校准。",
        "late_move 不计为优质提前命中；它用于惩罚晚到提示和训练等待规则。",
        "复盘建议只能人工确认，不自动改实时权重。",
      ],
      status: calibrationStatus,
      summary: calibrationStatus === "usable"
        ? "提前发现校准已有可用闭环样本，可开始观察分型表现。"
        : calibrationStatus === "collecting"
          ? "提前发现校准正在收集 outcome；可以展示方向，但不能宣传稳定命中率。"
          : "提前发现校准暂无足够 outcome；只能显示样本状态。",
    },
    cvdProxyCandidateCount,
    earlyOpportunityCount,
    guardrails: [
      "复盘只评估系统是否提前发现，不允许把晚到涨跌榜样本改写成追单信号。",
      "轻扫标记不计入命中率；只有 EVIDENCE_SIGNAL / TRADE_PLAN_READY 才进入策略表现统计。",
      "复盘建议必须人工确认，不能自动修改实时权重。",
    ],
    lateMoveCount,
    missedDetectionCount,
    reviewFocus: [
      "启动前 3h/6h/12h 是否有压缩、量能和主动成交线索。",
      "晚到样本为什么没有在更早阶段进入候选池。",
      "买压/卖压主动买卖代理对后续最大浮盈/最大回撤是否有解释力。",
    ],
    summary: `当前轻扫 Top 样本 ${topCandidates.length} 个：启动前 ${earlyOpportunityCount}，晚到 ${lateMoveCount}，主动买卖代理 ${cvdProxyCandidateCount}，漏判复查 ${missedDetectionCount}。`,
    totalLightCandidates: topCandidates.length,
  };
}

function opportunityCalibrationResourceStatus(status: OpportunityCalibrationState["status"]): DataStatus {
  if (status === "usable") return "live";
  if (status === "collecting") return "partial";
  return "empty";
}

function buildOpportunityCalibrationState(
  backend: BackendContract,
  discoveryReview: DiscoveryReviewState,
): OpportunityCalibrationState {
  const reviewStats = backend.analysis.reviewStatistics;
  const closedSamples = reviewStats.samples.closed;
  const metricSamples = reviewStats.samples.withMetrics;
  const minClosedSamples = 30;
  const minMetricSamples = 15;
  const ready = closedSamples >= minClosedSamples && metricSamples >= minMetricSamples;
  const hasLiveInput = discoveryReview.totalLightCandidates > 0 || closedSamples > 0 || metricSamples > 0 ||
    discoveryReview.missedDetectionCount > 0;
  const status: OpportunityCalibrationState["status"] = ready ? "usable" : hasLiveInput ? "collecting" : "empty";
  const sharedClosed = Math.min(closedSamples, Math.max(0, reviewStats.samples.evidenceLevel));
  const sharedMetrics = Math.min(metricSamples, Math.max(0, reviewStats.samples.withMetrics));

  return {
    schemaVersion: "opportunity-calibration.v1",
    status,
    summary: ready
      ? `机会校准样本门槛已通过：已关闭 ${closedSamples}，带最大浮盈/最大回撤 ${metricSamples}；可以开始观察阈值表现，但仍需人工确认。`
      : hasLiveInput
        ? `机会校准正在收集：已关闭 ${closedSamples}/${minClosedSamples}，带最大浮盈/最大回撤 ${metricSamples}/${minMetricSamples}；阈值不能自动改。`
        : "机会校准暂无样本；只能显示规则边界，不能宣传命中率。",
    sampleGate: {
      minClosedSamples,
      minMetricSamples,
      closedSamples,
      metricSamples,
      ready,
    },
    thresholds: {
      earlyHotScore: 75,
      earlyWarmScore: 55,
      lateMoveHighRisk: "late_move 或 overextensionRisk=high 必须降级为复盘/等待回踩反抽。",
      minimumStructuralRR: 3,
    },
    segments: [
      {
        key: "early_setup",
        label: "启动前候选",
        currentCandidates: discoveryReview.earlyOpportunityCount,
        closedSamples: sharedClosed,
        metricSamples: sharedMetrics,
        interpretation: "只验证系统是否更早发现，不直接提高交易等级。",
        nextAction: "关联后续最大浮盈/最大回撤、目标/止损先后顺序和超时样本，校准启动前评分。",
      },
      {
        key: "breakout_watch",
        label: "突破观察",
        currentCandidates: Math.max(0, discoveryReview.totalLightCandidates - discoveryReview.earlyOpportunityCount - discoveryReview.lateMoveCount),
        closedSamples: sharedClosed,
        metricSamples: sharedMetrics,
        interpretation: "验证突破前沿是否还有位置优势，不能只因突破就追。",
        nextAction: "统计突破后是否给出回踩/二次确认机会，避免晚到追单。",
      },
      {
        key: "late_move",
        label: "晚到样本",
        currentCandidates: discoveryReview.lateMoveCount,
        closedSamples: sharedClosed,
        metricSamples: sharedMetrics,
        interpretation: "晚到样本用于惩罚追涨追跌，不计入优质提前命中。",
        nextAction: "回看启动前窗口，找出未早扫到的原因：轮转、阈值、数据源或结构门控。",
      },
      {
        key: "cvd_proxy",
        label: "主动买卖代理",
        currentCandidates: discoveryReview.cvdProxyCandidateCount,
        closedSamples: sharedClosed,
        metricSamples: sharedMetrics,
        interpretation: "主动买卖代理只评估买卖压力对后续波动的解释力，不冒充官方主动成交差值。",
        nextAction: "把买压/卖压与最大浮盈/最大回撤做相关性观察，样本足够后再人工调整权重。",
      },
    ],
    guardrails: [
      "校准结果只读，不自动改实时权重。",
      "样本不足时只能显示 collecting/empty，不能展示胜率承诺。",
      "启动前评分只影响发现和深扫优先级，不能绕过证据融合、结构盈亏比和风控门禁。",
      "late_move 只能做复盘和等待重构，不能反向生成交易计划。",
    ],
  };
}

function buildDailyMoverReviewState(
  archive?: DailyMoverReadArchiveSuccess | null,
): DailyMoverReviewState {
  if (!archive) {
    return {
      schemaVersion: "daily-mover-review-status.v1",
      status: "empty",
      snapshotCount: 0,
      selectedDetailCount: 0,
      missedReviewCount: 0,
      calibrationSuggestionCount: 0,
      latestSnapshotId: null,
      latestObservedAt: null,
      summary: "每日涨跌榜复盘归档未接入当前页面合同。",
      nextAction: "读取 /api/daily-movers 或后端归档后，再展示真实样本状态。",
      guardrails: [
        "每日涨跌榜复盘只用于研究启动前征兆，不作为追涨追跌信号。",
        "没有归档样本时必须显示暂无样本。",
      ],
    };
  }

  const snapshotCount = archive.snapshots.length;
  const status: DailyMoverReviewState["status"] = snapshotCount === 0
    ? "empty"
    : archive.selectedDetails.length >= 10 || archive.missedAltcoinReviews.length > 0
      ? "usable"
      : "collecting";

  return {
    schemaVersion: "daily-mover-review-status.v1",
    status,
    snapshotCount,
    selectedDetailCount: archive.selectedDetails.length,
    missedReviewCount: archive.missedAltcoinReviews.length,
    calibrationSuggestionCount: archive.calibrationSuggestions.length,
    latestSnapshotId: archive.latestSnapshot?.id ?? null,
    latestObservedAt: archive.latestSnapshot?.observedAt ?? null,
    summary: snapshotCount === 0
      ? "还没有真实每日涨跌榜快照；复盘进化不能宣传已学到涨跌榜规律。"
      : `已归档 ${snapshotCount} 个每日异动快照，当前选中样本 ${archive.selectedDetails.length} 条，漏判复查 ${archive.missedAltcoinReviews.length} 条。`,
    nextAction: snapshotCount === 0
      ? "触发每日异动抓取，并补齐 K 线回看窗口。"
      : status === "usable"
        ? "继续积累样本，人工复核启动前共同征兆，暂不自动改权重。"
        : "继续积累更多涨跌榜样本，至少覆盖多个交易日后再做规律判断。",
    guardrails: [
      archive.guardrail,
      "每日涨跌榜用于复盘启动前征兆，不进入狙击榜。",
      "任何校准建议都必须人工确认，不能自动改实时权重。",
    ],
  };
}

function withShadowLiveJudgeStatus(
  historicalBacktest: Resource<HistoricalBacktestState> | undefined,
  snapshot: MarketRadarSnapshot,
  now: Date,
) {
  if (!historicalBacktest?.data.auditV2?.judgeSystem) {
    return historicalBacktest;
  }

  const shadowEvents = snapshot.journalEvents.filter((event) =>
    event.sourceId?.startsWith("shadow-live:") ||
    event.lessons?.includes("shadow_live_tracking")
  );
  const pending = shadowEvents.filter((event) => event.reviewStatus === "tracking" || event.outcomeStatus === "pending").length;
  const closed = shadowEvents.length - pending;
  const judgeSystem: CoreJudgeSystemState = {
    ...historicalBacktest.data.auditV2.judgeSystem,
    lanes: historicalBacktest.data.auditV2.judgeSystem.lanes.map((lane) => {
      if (lane.id !== "shadow_live") {
        return lane;
      }

      return {
        ...lane,
        source: "journal-shadow-live",
        status: shadowEvents.length > 0 ? "watch" : "waiting",
        summary: shadowEvents.length > 0
          ? `已写入 ${shadowEvents.length} 个影子实盘纸面样本，待验证 ${pending} 个，已关闭 ${closed} 个。`
          : "尚未写入生产候选的影子实盘样本。",
        updatedAt: now.toISOString(),
      };
    }),
  };

  return resource(
    {
      ...historicalBacktest.data,
      auditV2: {
        ...historicalBacktest.data.auditV2,
        judgeSystem,
      },
    },
    historicalBacktest.status,
    {
      ageSec: historicalBacktest.ageSec,
      reason: historicalBacktest.reason,
      source: historicalBacktest.source,
      updatedAt: historicalBacktest.updatedAt,
    },
  );
}

export function buildFrontendReviewContract({
  backend,
  dailyMoverArchive,
  historicalBacktest,
  snapshot,
  now = new Date(),
}: {
  backend: BackendContract;
  dailyMoverArchive?: DailyMoverReadArchiveSuccess | null;
  historicalBacktest?: Resource<HistoricalBacktestState>;
  snapshot: MarketRadarSnapshot;
  now?: Date;
}): ReviewContract {
  const ageSec = diffSeconds(backend.generatedAt, now);
  const lifecycleEvents = snapshot.journalEvents.filter((event) => event.outcomeMetrics || event.riskReward);
  const archetypeStages = backend.analysis.businessCapability.stages.length > 0
    ? backend.analysis.businessCapability.stages
    : [{
      id: "strategy_family_stats",
      title: "策略分型统计",
      status: "collecting",
      score: 45,
      summary: "等待样本",
      evidence: [],
      nextAction: "继续积累复盘样本。",
      guardrail: "不自动改权重",
    } as BusinessCapabilityStage];
  const suggestions = backend.analysis.businessCapability.nextActions.length > 0
    ? backend.analysis.businessCapability.nextActions
    : backend.analysis.businessCapability.gaps;
  const reviewSampleStatus = reviewSampleStatusToResourceStatus(backend.analysis.reviewStatistics.sampleStatus);
  const aiReviewStats = buildAiReviewStats(snapshot);
  const historicalBacktestWithShadowLive = withShadowLiveJudgeStatus(historicalBacktest, snapshot, now);
  const missedDetectionRows = snapshot.journalEvents
    .filter((event) => event.result === "saved" || event.action === "trend_radar_review")
    .slice(0, 20)
    .map((event) => ({
      symbol: displaySymbol(event.symbol),
      hue: symbolHue(event.symbol),
      move: round(event.outcomeMetrics?.mfePercent ?? 0, 2),
      side: (event.direction === "short" ? "跌" : "涨") as "涨" | "跌",
      reason: "证据不足" as const,
      detail: event.note,
      improvement: event.lessons?.[0] ?? "进入漏判复查队列，等待更多样本确认。",
    }));
  const discoveryReview = buildDiscoveryReviewState(backend, missedDetectionRows.length);
  const opportunityCalibration = buildOpportunityCalibrationState(backend, discoveryReview);

  return {
    signalLifecycles: resource(
      lifecycleEvents.map(lifecycleFromJournal),
      lifecycleEvents.length > 0 ? "live" : "empty",
      { ageSec, source: "signal-worker" },
    ),
    strategyArchetypes: resource(
      archetypeStages.map(strategyArchetypeFromStage),
      reviewSampleStatus,
      {
        ageSec,
        source: "signal-worker",
        reason: backend.analysis.reviewStatistics.guardrail,
      },
    ),
    missedDetections: resource(
      missedDetectionRows,
      missedDetectionRows.length > 0 ? "partial" : "empty",
      {
        ageSec,
        source: "signal-worker",
        reason: "漏判归因需要更多 outcome 样本，当前仅展示已写入复盘的记录。",
      },
    ),
    evolutionSuggestions: resource(
      suggestions.slice(0, 8).map((item, index) => ({
        title: item,
        rationale: backend.analysis.businessCapability.gaps[index] ?? backend.analysis.businessCapability.operatorHint,
        impact: index === 0 ? "高" : index < 3 ? "中" : "低",
        adopted: false,
      })),
      suggestions.length > 0 ? "live" : "empty",
      { ageSec, source: "signal-worker" },
    ),
    reviewStats: resource(
      {
        closedSamples: backend.analysis.reviewStatistics.samples.closed,
        evidenceSamples: backend.analysis.reviewStatistics.samples.evidenceLevel,
        maeAvg: backend.analysis.reviewStatistics.mae.averagePercent,
        mfeAvg: backend.analysis.reviewStatistics.mfe.averagePercent,
        pendingSamples: backend.analysis.reviewStatistics.samples.pending,
        sampleStatus: backend.analysis.reviewStatistics.sampleStatus,
        summary: backend.analysis.reviewStatistics.summary,
        totalSamples: backend.analysis.reviewStatistics.samples.total,
        winRate: backend.analysis.reviewStatistics.winRate.expiredExcludedPercent,
      },
      reviewSampleStatus,
      {
        ageSec,
        source: "outcome-review",
        reason: backend.analysis.reviewStatistics.guardrail,
      },
    ),
    discoveryReview: resource(
      discoveryReview,
      discoveryReview.totalLightCandidates > 0 || discoveryReview.missedDetectionCount > 0 ? "partial" : "empty",
      {
        ageSec,
        source: "light-scan-review",
        reason: "提前发现复盘只用于评估扫描是否提前，不生成实时交易结论。",
      },
    ),
    opportunityCalibration: resource(
      opportunityCalibration,
      opportunityCalibrationResourceStatus(opportunityCalibration.status),
      {
        ageSec,
        source: "outcome-calibration",
        reason: opportunityCalibration.summary,
      },
    ),
    dailyMoverReview: resource(
      buildDailyMoverReviewState(dailyMoverArchive),
      dailyMoverArchive
        ? dailyMoverArchive.snapshots.length > 0
          ? "partial"
          : "empty"
        : "empty",
      {
        ageSec,
        source: "daily-mover-review",
        reason: dailyMoverArchive?.guardrail ?? "每日涨跌榜复盘归档未接入当前页面合同。",
      },
    ),
    historicalBacktest: historicalBacktestWithShadowLive ?? resource(
      emptyHistoricalBacktestState("等待生成历史时间点回放报告。"),
      "empty",
      {
        source: "historical-backtest",
        reason: "尚未生成历史回测报告；页面不能展示未验证的命中率。",
      },
    ),
    aiReviewStats: resource(
      aiReviewStats,
      aiReviewStatsResourceStatus(aiReviewStats),
      {
        ageSec,
        source: "rule-reviewer",
        reason: "规则反证只统计成熟信号的证据绑定复核结果，不替代规则引擎。",
      },
    ),
  };
}

export function emptyHistoricalBacktestLaneMetric(
  lane: HistoricalBacktestLaneMetric["lane"],
): HistoricalBacktestLaneMetric {
  return {
    avgMaePct: 0,
    avgMfePct: 0,
    avgOpportunityScore: 0,
    count: 0,
    falsePositiveRatePct: 0,
    hitCount: 0,
    hitRatePct: 0,
    lane,
    lateCount: 0,
    lateRatePct: 0,
  };
}

export function emptyHistoricalBacktestState(summary: string): HistoricalBacktestState {
  return {
    schemaVersion: "historical-backtest.v1",
    status: "empty",
    generatedAt: null,
    reportId: null,
    input: {
      days: null,
      horizonBars: null,
      interval: null,
      moveThresholdPct: null,
      replayTimes: null,
      source: null,
      symbolsUsed: 0,
      topN: null,
    },
    lanes: {
      momentum: emptyHistoricalBacktestLaneMetric("momentum"),
      radar: emptyHistoricalBacktestLaneMetric("radar"),
      random: emptyHistoricalBacktestLaneMetric("random"),
      volume: emptyHistoricalBacktestLaneMetric("volume"),
    },
    findings: [],
    diagnostics: {
      missedOpportunities: [],
      radarReasonMetrics: [],
      radarScoreBuckets: [],
    },
    summary,
    nextAction: "先运行 npm run backtest:historical 生成真实报告，再在前端展示验证结果。",
    guardrails: [
      "历史回测只用于验证扫描逻辑，不是收益承诺。",
      "没有报告时必须显示暂无数据，不能用模拟命中率补位。",
      "回测结论不能自动修改实时权重，必须人工复核。",
    ],
  };
}
