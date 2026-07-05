// ============================================================
// 雷达系统 · 前端展示契约类型与旧同步 getter 兼容层
// ------------------------------------------------------------
// 这里集中定义「全市场山寨趋势切换雷达」后端的所有结构化输出。
// 字段语义对齐后端能力，前端只展示、不做交易判断。
// 真实数据入口：
// - Server Component: src/lib/frontend-contract-server.ts
// - HTTP API: /api/frontend/*
//
// 本文件保留旧 getXxx() 仅为兼容历史导入。旧同步 getter 不能再返回
// 演示市场事实，避免 mock 数据被误当成真实扫描、信号或复盘结果。
// ============================================================

import type { CoreChainGovernanceReport } from './api/core-chain-governance'
import { resource, type Resource } from './data-status'
import { MATURITY_DISPLAY_META } from './signal-state-semantics'

const LEGACY_SOURCE = 'legacy-radar-contract'
const LEGACY_DISABLED_REASON =
  '旧同步 getter 已停用。页面必须读取 /api/frontend/* 或 frontend-contract-server 的真实后端契约。'

function legacyEmptyResource<T>(data: T): Resource<T> {
  return resource(data, 'empty', {
    source: LEGACY_SOURCE,
    reason: LEGACY_DISABLED_REASON,
  })
}

// ============================================================
// 一、全市场扫描证明
// ============================================================
export type ScanProofData = {
  totalMonitored: number // 总监控币数
  scannable: number // 可扫描币数
  lightScanned: number // 已轻扫
  deepScanned: number // 已深扫
  awaitingDeepScan: number // 等待深扫
  coverage: number // 全市场轻扫覆盖率 %
  deepCoverage?: number // 本轮 CoinGlass 深扫占比 %
  lastScanAt: string // 最近扫描时间
  nextScanCountdownSec: number // 下一轮扫描倒计时（秒）
  stuck: boolean // 当前扫描是否卡住
}

export function getScanProof(): Resource<ScanProofData> {
  return legacyEmptyResource({
    totalMonitored: 0,
    scannable: 0,
    lightScanned: 0,
    deepScanned: 0,
    awaitingDeepScan: 0,
    coverage: 0,
    deepCoverage: 0,
    lastScanAt: '等待后端契约',
    nextScanCountdownSec: 0,
    stuck: true,
  })
}

// ============================================================
// 二、深扫队列
// ============================================================
export type DeepScanQueue = {
  currentBatch: string[] // 本轮深扫币种
  nextBatch: string[] // 下一批
  highPriority: string[] // 高优先级排队
  coldExploration: string[] // 冷门探索
  longUnscanned: { symbol: string; idleMin: number }[] // 长时间未扫
}

export function getDeepScanQueue(): Resource<DeepScanQueue> {
  return legacyEmptyResource({
    currentBatch: [],
    nextBatch: [],
    highPriority: [],
    coldExploration: [],
    longUnscanned: [],
  })
}

// ============================================================
// 三、系统能力总控（后端 14 阶段 + 核心链路治理）
// ============================================================
export type CapabilityStage = {
  key: string
  name: string
  desc: string
  status: 'active' | 'standby' | 'degraded'
  note: string
}

export function getCapabilityStages(): Resource<CapabilityStage[]> {
  return legacyEmptyResource([])
}

export function getCoreChainGovernance(): Resource<CoreChainGovernanceReport> {
  return legacyEmptyResource({
    schemaVersion: 'core-chain-governance.v1',
    generatedAt: '等待后端契约',
    allowedUse: 'product_governance_only',
    canAutoExecute: false,
    canCreateTradeSignal: false,
    canMutateLiveRanking: false,
    coreObjective: '提前发现有潜力的山寨币异动，并判断它有没有交易价值。',
    chain: [],
    featureTriage: [],
    pageRoles: [],
    apiRoles: [],
    p0Completion: {
      checks: [],
      percent: 0,
      remaining: ['等待真实后端核心链路治理契约。'],
      status: 'blocked',
      summary: '等待真实后端核心链路治理契约。',
    },
    p1Completion: {
      checks: [],
      percent: 0,
      remaining: ['等待真实后端 P1 快速扫描完成度契约。'],
      status: 'blocked',
      summary: '等待真实后端 P1 快速扫描完成度契约。',
    },
    readiness: {
      blockedSteps: 0,
      coreReadySteps: 0,
      status: 'collecting',
      totalSteps: 7,
    },
    cleanupRules: [
      '旧同步 getter 已停用。页面必须读取真实后端契约后再展示功能治理状态。',
    ],
    operatingSequence: [],
  })
}

// ============================================================
// 四、数据源状态
// ============================================================
export type DataSourceState = {
  name: 'CoinGlass' | 'Binance' | 'OKX' | 'Bybit'
  feed: 'live' | 'cached' | 'stale' | 'partial' | 'failed'
  latencyMs: number | null
  latencyStatus?: 'ready' | 'partial' | 'unconfigured' | 'unavailable'
  lastUpdate: string
  note: string
}

export function getDataSources(): Resource<DataSourceState[]> {
  return legacyEmptyResource([])
}

// ============================================================
// 四点五、实时能力分层
// ============================================================
export type RealtimeCadenceBand =
  | 'second_level'
  | 'fast_refresh'
  | 'minute_level'
  | 'low_frequency'
  | 'review_cycle'

export type RealtimeCapabilityLane = {
  key: string
  label: string
  cadenceBand: RealtimeCadenceBand
  cadenceLabel: string
  status: Resource<unknown>['status']
  source: string
  metrics: string[]
  allowedUse: 'anomaly_discovery' | 'candidate_refresh' | 'validation' | 'context' | 'review'
  canCreateTradeSignal: false
  guardrail: string
  note: string
}

export type RealtimeCapabilityState = {
  schemaVersion: 'realtime-capability.v1'
  secondLevelOnline: boolean
  summary: string
  lanes: RealtimeCapabilityLane[]
  boundaries: string[]
}

export function getRealtimeCapability(): Resource<RealtimeCapabilityState> {
  return legacyEmptyResource({
    schemaVersion: 'realtime-capability.v1',
    secondLevelOnline: false,
    summary: '等待后端实时能力契约。',
    lanes: [],
    boundaries: [
      '旧同步 getter 已停用。页面必须读取真实后端契约后再展示实时能力。',
    ],
  })
}

// ============================================================
// 五、信号成熟度分层
// ============================================================
export type SignalMaturity =
  | 'LIGHT_SCAN_MARK' // 轻扫标记
  | 'DEEP_SCAN_CANDIDATE' // 深扫候选
  | 'EVIDENCE_SIGNAL' // 证据观察
  | 'REVIEW_ONLY' // 只做复盘观察
  | 'TRADE_PLAN_READY' // 交易计划就绪
  | 'BLOCKED' // 被风控门禁拦截
  | 'INVALIDATED' // 结构失效
  | 'COOLDOWN' // 冷却中

export const MATURITY_META: Record<
  SignalMaturity,
  { label: string; short: string; tone: 'live' | 'neon' | 'warn' | 'down' | 'muted'; order: number }
> = MATURITY_DISPLAY_META

export type DiscoveryPressureSide = 'buy' | 'neutral' | 'sell'
export type DiscoveryProxyQuality = 'reason_tag_proxy' | 'rolling_price_volume_proxy' | 'taker_trade_proxy'
export type DiscoveryBookProxyQuality = 'book_ticker_proxy' | 'ticker_bbo_proxy'
export type DiscoveryOpportunityPhase = 'breakout_watch' | 'early_setup' | 'late_move' | 'neutral_watch'
export type DiscoveryOverextensionRisk = 'high' | 'low' | 'medium'
export type DiscoveryCandidateState = 'COLD' | 'HOT' | 'PRE_TREND' | 'WARM'

export type DiscoveryFact = {
  bookAskUsd: number | null
  bookBidUsd: number | null
  bookImbalance: number | null
  bookPressureSide: DiscoveryPressureSide | null
  bookProxyQuality: DiscoveryBookProxyQuality | null
  buyPressureUsd: number | null
  changePercent24h: number | null
  cvdProxyUsd: number | null
  decisionBoundary: string
  earlyOpportunityScore: number | null
  flowImbalance: number | null
  foundInLightScan: boolean
  opportunityPhase: DiscoveryOpportunityPhase | null
  overextensionRisk: DiscoveryOverextensionRisk | null
  pressureSide: DiscoveryPressureSide | null
  proxyQuality: DiscoveryProxyQuality | null
  reasons: string[]
  score: number | null
  sellPressureUsd: number | null
  largeBuyTradeUsd: number | null
  largeSellTradeUsd: number | null
  largeTakerTradeCount: number | null
  largeTakerTradeSide: DiscoveryPressureSide | null
  largeTakerTradeUsd: number | null
  spreadBps: number | null
  source: 'light_scan_top_candidate' | 'not_in_light_scan_top_candidates'
  state: DiscoveryCandidateState | null
  summary: string
  symbol: string
  volume24hUsd: number | null
  volumeWindowUsd: number | null
}

export type RadarSignal = {
  id: string
  symbol: string
  hue: number
  direction: '多' | '空' | '观察'
  maturity: SignalMaturity
  lifecycle: SignalLifecycleRead
  operatorRead: SignalOperatorRead
  rr: number | null // 赔率，未就绪为 null
  risk: '低' | '中' | '高' | '极高'
  evidenceCount: number
  counterCount: number
  freshness: DataSourceState['feed']
  whySelected: string // 为什么入选
  whyBlocked: string | null // 为什么不能交易（无则 null）
  updatedMinAgo: number
  discovery?: DiscoveryFact | null
}

export type SignalLifecycleRead = {
  firstSeenAt: string | null
  lastUpdatedAt: string | null
  ageMin: number
  ageLabel: string
  freshnessLabel: '刚出现' | '近期有效' | '旧信号' | '已过期'
  status: 'new' | 'active' | 'stale' | 'expired'
  source: 'current_signal_timestamp' | 'light_scan_snapshot' | 'leaderboard_candidate'
  summary: string
}

export type SignalOperatorLane = 'sniper' | 'watch' | 'validate' | 'blocked' | 'review'

export type SignalOperatorRead = {
  lane: SignalOperatorLane
  laneLabel: '狙击榜' | '重点观察' | '验证中' | '不看' | '只复盘'
  worthWatching: boolean
  canTrade: boolean
  headline: string
  nextAction: string
  noTradeReason: string | null
}

export type OpportunityQualityCandidate = {
  symbol: string
  maturity: SignalMaturity
  phase: DiscoveryOpportunityPhase | null
  earlyOpportunityScore: number | null
  overextensionRisk: DiscoveryOverextensionRisk | null
  whySelected: string
  whyBlocked: string | null
  nextAction: string
}

export type OpportunityQualityState = {
  schemaVersion: 'opportunity-quality.v1'
  status: 'healthy' | 'watch' | 'blocked'
  summary: string
  counts: {
    blocked: number
    breakoutWatch: number
    deepScanCandidate: number
    earlySetup: number
    evidenceSignal: number
    lateMove: number
    reviewOnly: number
    totalVisible: number
    tradePlanReady: number
    waitingPullbackOrRetest: number
  }
  antiChase: {
    blockedLateSignals: number
    guardrails: string[]
  }
  nextActions: string[]
  topCandidates: OpportunityQualityCandidate[]
}

export function getOpportunityQuality(): Resource<OpportunityQualityState> {
  return legacyEmptyResource({
    schemaVersion: 'opportunity-quality.v1',
    status: 'blocked',
    summary: '等待真实机会质量契约。',
    counts: {
      blocked: 0,
      breakoutWatch: 0,
      deepScanCandidate: 0,
      earlySetup: 0,
      evidenceSignal: 0,
      lateMove: 0,
      reviewOnly: 0,
      totalVisible: 0,
      tradePlanReady: 0,
      waitingPullbackOrRetest: 0,
    },
    antiChase: {
      blockedLateSignals: 0,
      guardrails: ['等待真实机会质量契约。'],
    },
    nextActions: [],
    topCandidates: [],
  })
}

export function getRadarSignals(): Resource<RadarSignal[]> {
  return legacyEmptyResource([])
}

// ============================================================
// 六、单币：多周期结构 / 证据链 / 反证链 / 风控门禁 / 交易计划 / 规则反证复核
// ============================================================
export type TfStructure = {
  tf: '15m' | '1h' | '4h' | '1d'
  phase: string // 当前阶段
  trend: '多' | '空' | '震荡'
  priorHigh: number
  priorLow: number
  support: number
  resistance: number
}

export type EvidenceItem = { sourceId?: string; kind: string; label: string; weight: number; detail: string; supportive: boolean }
export type CounterItem = { sourceId?: string; kind: string; label: string; detail: string }
export type RiskGateResult = {
  allowTradePlan: boolean
  reasons: string[] // 不允许时的明确原因
}
export type PersonalPositionLens = {
  status: 'ready' | 'waiting_leverage' | 'waiting_equity' | 'waiting_price'
  marginFraction: number
  marginFractionPercent: number
  leverage: number | null
  leverageSource: 'btc_eth_fixed' | 'exchange_max' | 'unknown'
  entryPrice: number | null
  stopPrice: number | null
  targetPrice: number | null
  structuralRewardRisk: number | null
  notionalPerEquity: number | null
  stopLossPctOfEquity: number | null
  targetProfitPctOfEquity: number | null
  stopLossRoe: number | null
  targetRoe: number | null
  summary: string
}
export type TradePlanData = {
  bias: '多' | '空' | '观望'
  entryCondition: string
  stop: string
  tp1: string
  tp2: string
  tp3: string
  rr: number
  positionLens: PersonalPositionLens
  scaleOut: string // 分批止盈
  invalidation: string // 失效条件
  allowChase: boolean // 是否允许追单
}
export type AiReviewData = {
  reviewed: boolean
  findings: string[] // 发现的反证
  suggestDowngrade: boolean
  note: string // 规则反证只复核不下结论的声明
}
export type AnalysisReportSection = {
  key: 'facts' | 'supportive_evidence' | 'counter_evidence' | 'risk_gate' | 'trade_plan' | 'review_boundary'
  title: string
  status: 'ready' | 'partial' | 'blocked' | 'empty'
  items: { label: string; detail: string; sourceId?: string }[]
}

export type TokenChartIntegrity = {
  availableTimeframes: string[]
  canUseMockCandles: false
  overlaySource: 'v3_key_levels_forward_map_trade_plan' | 'none'
  selectedTimeframe: string
  status: 'ready' | 'partial' | 'empty'
  tradingViewSymbol: string | null
  tradingViewUrl: string | null
}

export type TokenDossier = {
  symbol: string
  direction: '看多' | '看空' | '中性'
  maturity: SignalMaturity
  chart: TokenChartIntegrity
  discovery: DiscoveryFact
  structures: TfStructure[]
  evidence: EvidenceItem[]
  counter: CounterItem[]
  riskGate: RiskGateResult
  strategyReadiness: TokenStrategyReadiness
  tradePlan: TradePlanData | null // 被拦截时为 null
  aiReview: AiReviewData
  reportSections: AnalysisReportSection[]
}

export type TokenStrategyReadiness = {
  schemaVersion: 'token-strategy-readiness.v1'
  status: 'ready' | 'blocked' | 'watch' | 'review_only'
  canTradeNow: boolean
  summary: string
  nextAction: string
  missingPieces: string[]
  guardrails: string[]
  executionMap: TokenExecutionMap
  positionLensStatus: PersonalPositionLens['status'] | 'not_applicable'
  personalLens: string
}

export type TokenExecutionMap = {
  schemaVersion: 'token-execution-map.v1'
  directionRead: 'bullish' | 'bearish' | 'neutral'
  tradabilityRead: 'trade_plan_ready' | 'wait_confirmation' | 'wait_pullback_or_retest' | 'review_only' | 'blocked'
  positionQuality: 'good' | 'waiting' | 'late' | 'unknown'
  waitFor: string[]
  invalidIf: string[]
  chartBoundary: string
  manualReviewRequired: true
}

export function getTokenDossier(symbol: string, basePrice = 1): Resource<TokenDossier> {
  void basePrice
  return legacyEmptyResource({
    symbol: symbol.toUpperCase(),
    direction: '中性',
    maturity: 'LIGHT_SCAN_MARK',
    chart: {
      availableTimeframes: [],
      canUseMockCandles: false,
      overlaySource: 'none',
      selectedTimeframe: '4h',
      status: 'empty',
      tradingViewSymbol: null,
      tradingViewUrl: null,
    },
    discovery: {
      bookAskUsd: null,
      bookBidUsd: null,
      bookImbalance: null,
      bookPressureSide: null,
      bookProxyQuality: null,
      buyPressureUsd: null,
      changePercent24h: null,
      cvdProxyUsd: null,
      decisionBoundary: LEGACY_DISABLED_REASON,
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
      largeBuyTradeUsd: null,
      largeSellTradeUsd: null,
      largeTakerTradeCount: null,
      largeTakerTradeSide: null,
      largeTakerTradeUsd: null,
      spreadBps: null,
      source: 'not_in_light_scan_top_candidates',
      state: null,
      summary: '等待真实后端发现层契约。',
      symbol: symbol.toUpperCase(),
      volume24hUsd: null,
      volumeWindowUsd: null,
    },
    structures: [],
    evidence: [],
    counter: [],
    riskGate: {
      allowTradePlan: false,
      reasons: [LEGACY_DISABLED_REASON],
    },
    strategyReadiness: {
      schemaVersion: 'token-strategy-readiness.v1',
      status: 'blocked',
      canTradeNow: false,
      summary: '等待真实单币策略就绪契约。',
      nextAction: '等待后端契约。',
      missingPieces: [LEGACY_DISABLED_REASON],
      guardrails: ['前端不得补交易计划。'],
      executionMap: {
        schemaVersion: 'token-execution-map.v1',
        directionRead: 'neutral',
        tradabilityRead: 'blocked',
        positionQuality: 'unknown',
        waitFor: ['等待真实单币执行地图契约。'],
        invalidIf: ['证据不足、RR 不够或高周期冲突时不生成计划。'],
        chartBoundary: '等待真实后端 tradePlan；TradingView 只能用于人工看图复核。',
        manualReviewRequired: true,
      },
      positionLensStatus: 'not_applicable',
      personalLens: '尚未生成交易计划。',
    },
    tradePlan: null,
    aiReview: {
      reviewed: false,
      findings: [],
      suggestDowngrade: false,
      note: LEGACY_DISABLED_REASON,
    },
    reportSections: [],
  })
}

// ============================================================
// 七、复盘：信号生命周期 / MFE-MAE / 策略分型 / 漏判复查 / 进化建议
// ============================================================
export type SignalLifecycle = {
  id: string
  symbol: string
  hue: number
  side: '多' | '空'
  appearedAt: string
  triggerPrice: number
  stopPrice: number
  targetPrice: number
  verifyWindowH: number
  hitTpFirst: boolean
  hitSlFirst: boolean
  timedOut: boolean
  mfe: number // 最大有利偏移 %
  mae: number // 最大不利偏移 %
}

export function getSignalLifecycles(): Resource<SignalLifecycle[]> {
  return legacyEmptyResource([])
}

export type StrategyArchetype = {
  key: string
  name: string
  winRate: number | null
  avgRR: number | null
  samples: number
  commonFailure: string
}

export function getStrategyArchetypes(): Resource<StrategyArchetype[]> {
  return legacyEmptyResource([])
}

export type MissedDetection = {
  symbol: string
  hue: number
  move: number // 后续涨跌幅 %
  side: '涨' | '跌'
  reason: '未进轻扫' | '未进深扫' | '被风控挡住' | '证据不足'
  detail: string
  improvement: string
}

export function getMissedDetections(): Resource<MissedDetection[]> {
  return legacyEmptyResource([])
}

export type EvolutionSuggestion = {
  title: string
  rationale: string
  impact: '高' | '中' | '低'
  adopted: boolean
}

export function getEvolutionSuggestions(): Resource<EvolutionSuggestion[]> {
  return legacyEmptyResource([])
}

// ============================================================
// 八、系统中心：服务 / 数据 / API 状态
// ============================================================
export type ServiceNode = {
  key: string
  name: string
  status: 'healthy' | 'degraded' | 'down'
  detail: string
}

export function getServiceNodes(): Resource<ServiceNode[]> {
  return legacyEmptyResource([])
}

export type DataPipelineState = {
  lastScanAt: string
  lastWriteAt: string
  stale: boolean
  cacheHit: boolean
  recentError: string | null
  recentSuccess: string
}

export function getDataPipeline(): Resource<DataPipelineState> {
  return legacyEmptyResource({
    lastScanAt: '等待后端契约',
    lastWriteAt: '等待后端契约',
    stale: true,
    cacheHit: false,
    recentError: LEGACY_DISABLED_REASON,
    recentSuccess: '等待真实后端数据管线状态',
  })
}

export type ApiUsageState = {
  provider: 'CoinGlass'
  usedToday: number
  remainingToday: number
  perMinuteLimit: number
  pacingMs: number
  throttled: boolean
  source?: 'redis' | 'unconfigured' | 'unavailable'
}

export function getApiUsage(): Resource<ApiUsageState> {
  return legacyEmptyResource({
    provider: 'CoinGlass',
    usedToday: 0,
    remainingToday: 0,
    perMinuteLimit: 30,
    pacingMs: 0,
    throttled: false,
    source: 'unconfigured',
  })
}

// ============================================================
// 九、宠物小人 · 后端状态字段（仅预留，不改宠物本体）
// ============================================================
export type PetBackendStatus = {
  system: '正常' | '降级' | '异常'
  scan: '扫描中' | '空闲' | '卡住'
  signal: '有就绪信号' | '验证中' | '无信号'
  risk: '低' | '中' | '高'
  rank: string
  discipline: '优秀' | '良好' | '需改进'
  review: '已完成' | '待复盘'
  todayPerf: number // 今日表现（命中率 %）
}

export function getPetBackendStatus(): Resource<PetBackendStatus> {
  return legacyEmptyResource({
    system: '降级',
    scan: '卡住',
    signal: '无信号',
    risk: '中',
    rank: '等待后端契约',
    discipline: '需改进',
    review: '待复盘',
    todayPerf: 0,
  })
}

// ============================================================
// 十、全市场榜单（7 类）+ 候选池/深扫/信号/拦截标记
// ============================================================
export type LeaderboardKind =
  | 'gainers'
  | 'losers'
  | 'volume'
  | 'volatility_squeeze'
  | 'relative_strength'
  | 'oi_change'
  | 'funding_hot'

export const LEADERBOARD_META: Record<LeaderboardKind, { label: string; metric: string }> = {
  gainers: { label: '涨幅榜', metric: '24h 涨幅' },
  losers: { label: '跌幅榜', metric: '24h 跌幅' },
  volume: { label: '成交量异动榜', metric: '量比' },
  volatility_squeeze: { label: '波动率压缩榜', metric: '压缩度' },
  relative_strength: { label: '相对强弱榜', metric: 'RS 分数' },
  oi_change: { label: 'OI 异动榜', metric: 'OI 变化' },
  funding_hot: { label: 'Funding 过热榜', metric: '资金费率' },
}

export type LeaderboardRow = {
  symbol: string
  hue: number
  value: number // 该榜单对应指标值
  price: number
  source?: 'public_market_ticker' | 'scanner_snapshot_ticker' | 'light_scan_candidate' | 'derivatives_context'
  sourceLabel?: string
  venueScope?: string
  sortKey?: string
  rankingScope?: 'market_board' | 'radar_candidate_board' | 'derivatives_board'
  updatedAt?: string
  inCandidatePool: boolean // 是否进候选池
  deepScanned: boolean // 是否已深扫
  hasSignal: boolean // 是否有信号
  blocked: boolean // 是否被风控门禁拦截
  awaitingScan: boolean // 是否等待下一轮扫描
}

export function getLeaderboard(kind: LeaderboardKind): Resource<LeaderboardRow[]> {
  void kind
  return legacyEmptyResource([])
}

// ============================================================
// 十一、大盘宏观环境（山寨趋势切换专用）
// ============================================================
export type MacroAltEnv = {
  btcState: '强势' | '震荡' | '弱势'
  ethState: '强势' | '震荡' | '弱势'
  btcDominance: number // BTC.D %
  btcDominanceTrend: '上升' | '下降' | '走平'
  total2: number // 美元
  total3: number // 美元
  altStrength: number // 山寨强弱 0-100
  riskMode: '进攻' | '中性' | '防守'
  suggestion: '更适合做多' | '更适合做空' | '建议观望'
}

export function getMacroAltEnv(): Resource<MacroAltEnv> {
  return legacyEmptyResource({
    btcState: '弱势',
    ethState: '弱势',
    btcDominance: 0,
    btcDominanceTrend: '走平',
    total2: 0,
    total3: 0,
    altStrength: 0,
    riskMode: '防守',
    suggestion: '建议观望',
  })
}

// ============================================================
// 十二、CoinGlass 衍生品状态（不做清算热力图 / 不做清算目标位）
// ============================================================
export type DerivativesState = {
  connectedFields: string[]
  oiChange: number // OI 变化 %
  funding: number // 资金费率 %
  longShortRatio: number // 多空比
  takerBuySell: number // 主动买卖比
  takerBuySellStatus: 'connected' | 'not_connected'
  exchangeCoverage: number // 交易所覆盖数
  totalExchanges: number
  lastUpdate: string
  unavailableFields: string[]
}

export function getDerivatives(): Resource<DerivativesState> {
  return legacyEmptyResource({
    connectedFields: [],
    oiChange: 0,
    funding: 0,
    longShortRatio: 0,
    takerBuySell: 0,
    takerBuySellStatus: 'not_connected',
    exchangeCoverage: 0,
    totalExchanges: 0,
    lastUpdate: '等待后端契约',
    unavailableFields: ['open_interest', 'funding_rate', 'long_short_ratio', 'taker_buy_sell', 'cvd_proxy', 'real_fund_flow'],
  })
}

export type FundFlowState = {
  allowedUse: 'market_context_only'
  canCreateTradeSignal: false
  detail: string
  connectedFields: string[]
  decisionBoundary: string
  source: 'coinglass_derivatives' | 'not_connected'
  status: 'partial' | 'waiting_source'
  takerBuySellAvailable: boolean
  unavailableFields: string[]
}

export function getFundFlow(): Resource<FundFlowState> {
  return legacyEmptyResource({
    allowedUse: 'market_context_only',
    canCreateTradeSignal: false,
    connectedFields: [],
    decisionBoundary: '资金流只读展示，不能单独生成交易信号。',
    detail: LEGACY_DISABLED_REASON,
    source: 'not_connected',
    status: 'waiting_source',
    takerBuySellAvailable: false,
    unavailableFields: ['taker_buy_sell', 'cvd_proxy', 'real_fund_flow'],
  })
}

export type ScanStabilityState = {
  issues: Array<{
    code: string
    detail: string
    severity: 'info' | 'watch' | 'critical'
  }>
  score: number
  status: 'blocked' | 'healthy' | 'watch'
  summary: string
}

export function getScanStability(): Resource<ScanStabilityState> {
  return legacyEmptyResource({
    issues: [
      {
        code: 'legacy_contract_disabled',
        detail: LEGACY_DISABLED_REASON,
        severity: 'critical',
      },
    ],
    score: 0,
    status: 'blocked',
    summary: '等待真实 system-health 扫描稳定性报告。',
  })
}

export type LightScanQualityCheckStatus = 'blocked' | 'pass' | 'watch'

export type LightScanQualityCheck = {
  detail: string
  evidence: string[]
  key: string
  label: string
  status: LightScanQualityCheckStatus
}

export type LightScanQualityCandidate = {
  bookImbalance: number | null
  bookPressureSide: 'buy' | 'neutral' | 'sell' | null
  changePercent: number
  earlyOpportunityScore: number | null
  flowImbalance: number | null
  largeTakerTradeSide: 'buy' | 'neutral' | 'sell' | null
  largeTakerTradeUsd: number | null
  opportunityPhase: 'breakout_watch' | 'early_setup' | 'late_move' | 'neutral_watch' | null
  overextensionRisk: 'high' | 'low' | 'medium' | null
  pressureSide: 'buy' | 'neutral' | 'sell' | null
  reasons: string[]
  score: number
  state: 'COLD' | 'HOT' | 'PRE_TREND' | 'WARM'
  symbol: string
  volatilityPercent: number
  volumeWindowUsd: number | null
}

export type LightScanQualityState = {
  ageSec: number | null
  canCreateTradeSignal: false
  checks: LightScanQualityCheck[]
  coverage: {
    acceptedCount: number
    averagePriorityScore: number
    bookPressureCandidateCount: number
    buyPressureCandidateCount: number
    candidateCount: number
    cvdProxyCandidateCount: number
    earlyOpportunityCandidateCount: number
    hotCandidateCount: number
    lateMoveCandidateCount: number
    largeTakerTradeCandidateCount: number
    preTrendCandidateCount: number
    rollingWindowCandidateCount: number
    sellPressureCandidateCount: number
    topCandidateCount: number
    universeCount: number
    zScoreCandidateCount: number
  }
  generatedAt: string
  guardrails: string[]
  schemaVersion: 'light-scan-quality.v1'
  source: string
  staleAfterSec: number
  status: 'blocked' | 'healthy' | 'watch'
  summary: string
  topCandidates: LightScanQualityCandidate[]
}

export function getLightScanQuality(): Resource<LightScanQualityState> {
  return legacyEmptyResource({
    ageSec: null,
    canCreateTradeSignal: false,
    checks: [],
    coverage: {
      acceptedCount: 0,
      averagePriorityScore: 0,
      bookPressureCandidateCount: 0,
      buyPressureCandidateCount: 0,
      candidateCount: 0,
      cvdProxyCandidateCount: 0,
      earlyOpportunityCandidateCount: 0,
      hotCandidateCount: 0,
      lateMoveCandidateCount: 0,
      largeTakerTradeCandidateCount: 0,
      preTrendCandidateCount: 0,
      rollingWindowCandidateCount: 0,
      sellPressureCandidateCount: 0,
      topCandidateCount: 0,
      universeCount: 0,
      zScoreCandidateCount: 0,
    },
    generatedAt: '',
    guardrails: [
      '旧同步 getter 已停用。页面必须读取真实后端契约后再展示轻扫质量。',
      '轻扫质量不能生成交易计划。',
    ],
    schemaVersion: 'light-scan-quality.v1',
    source: 'legacy-radar-contract',
    staleAfterSec: 180,
    status: 'blocked',
    summary: '等待真实 lightScanQuality 契约。',
    topCandidates: [],
  })
}

export type DeepScanQualityState = {
  schemaVersion: 'deep-scan-quality.v1'
  status: 'healthy' | 'watch' | 'blocked'
  summary: string
  plannedAssets: number
  plannedRequests: number
  rawRows: number
  cleanRows: number
  cleanRate: number
  failedAssets: string[]
  requestFailures: Array<{
    code: string | null
    error: string
    symbol: string
  }>
  boundary: string
  guardrails: string[]
}

export function getDeepScanQuality(): Resource<DeepScanQualityState> {
  return legacyEmptyResource({
    schemaVersion: 'deep-scan-quality.v1',
    status: 'blocked',
    summary: '等待真实深扫质量契约。',
    plannedAssets: 0,
    plannedRequests: 0,
    rawRows: 0,
    cleanRows: 0,
    cleanRate: 0,
    failedAssets: [],
    requestFailures: [],
    boundary: 'CoinGlass 深扫状态必须来自后端真实审计。',
    guardrails: ['不得用公开源冒充 CoinGlass。'],
  })
}

export type MacroReadinessState = {
  schemaVersion: 'macro-readiness.v1'
  status: 'healthy' | 'watch' | 'blocked'
  summary: string
  riskMode: MacroAltEnv['riskMode']
  availableFields: string[]
  missingFields: string[]
  guardrails: string[]
}

export function getMacroReadiness(): Resource<MacroReadinessState> {
  return legacyEmptyResource({
    schemaVersion: 'macro-readiness.v1',
    status: 'blocked',
    summary: '等待真实宏观准备度契约。',
    riskMode: '防守',
    availableFields: [],
    missingFields: ['btc_dominance', 'total2', 'total3'],
    guardrails: ['宏观只做背景，不能直接生成个币方向。'],
  })
}

export type OpsReliabilityCheck = {
  key: string
  label: string
  status: 'pass' | 'watch' | 'blocked'
  detail: string
}

export type OpsReliabilityState = {
  schemaVersion: 'ops-reliability.v1'
  status: 'healthy' | 'watch' | 'blocked'
  summary: string
  checks: OpsReliabilityCheck[]
  nextActions: string[]
}

export function getOpsReliability(): Resource<OpsReliabilityState> {
  return legacyEmptyResource({
    schemaVersion: 'ops-reliability.v1',
    status: 'blocked',
    summary: '等待真实生产可靠性契约。',
    checks: [],
    nextActions: [],
  })
}

// ============================================================
// 端点组合 getter —— 与后端 4 个适配接口一一对应
// ------------------------------------------------------------
// 后端接入时：每个组合 getter 换成对单一接口的一次 fetch，
// 返回结构保持「子字段各自是 Resource<T>」，这样每个模块的
// 状态（live/cached/stale/partial/failed/empty）可独立展示。
// 前端只负责把后端已对齐的字段铺到 UI，不做任何派生计算。
// ============================================================

// 1) GET /api/frontend/radar-contract
//    供 dashboard / signals / market / system / pet 共用
export type RadarContract = {
  scanProof: Resource<ScanProofData>
  deepScanQueue: Resource<DeepScanQueue>
  capabilityStages: Resource<CapabilityStage[]>
  coreChainGovernance: Resource<CoreChainGovernanceReport>
  dataSources: Resource<DataSourceState[]>
  apiUsage: Resource<ApiUsageState>
  dataPipeline: Resource<DataPipelineState>
  petBackendStatus: Resource<PetBackendStatus>
  radarSignals: Resource<RadarSignal[]>
  macroAltEnv: Resource<MacroAltEnv>
  derivatives: Resource<DerivativesState>
  fundFlow: Resource<FundFlowState>
  scanStability: Resource<ScanStabilityState>
  lightScanQuality: Resource<LightScanQualityState>
  realtimeCapability: Resource<RealtimeCapabilityState>
  opportunityQuality: Resource<OpportunityQualityState>
  deepScanQuality: Resource<DeepScanQualityState>
  macroReadiness: Resource<MacroReadinessState>
  opsReliability: Resource<OpsReliabilityState>
  serviceNodes: Resource<ServiceNode[]>
}

export function getRadarContract(): RadarContract {
  return {
    scanProof: getScanProof(),
    deepScanQueue: getDeepScanQueue(),
    capabilityStages: getCapabilityStages(),
    coreChainGovernance: getCoreChainGovernance(),
    dataSources: getDataSources(),
    apiUsage: getApiUsage(),
    dataPipeline: getDataPipeline(),
    petBackendStatus: getPetBackendStatus(),
    radarSignals: getRadarSignals(),
    macroAltEnv: getMacroAltEnv(),
    derivatives: getDerivatives(),
    fundFlow: getFundFlow(),
    scanStability: getScanStability(),
    lightScanQuality: getLightScanQuality(),
    realtimeCapability: getRealtimeCapability(),
    opportunityQuality: getOpportunityQuality(),
    deepScanQuality: getDeepScanQuality(),
    macroReadiness: getMacroReadiness(),
    opsReliability: getOpsReliability(),
    serviceNodes: getServiceNodes(),
  }
}

// 2) GET /api/frontend/token-dossier?symbol=XXX
export function getTokenDossierContract(symbol: string, basePrice = 1): Resource<TokenDossier> {
  return getTokenDossier(symbol, basePrice)
}

// 3) GET /api/frontend/leaderboard?kind=XXX
export function getLeaderboardContract(kind: LeaderboardKind): Resource<LeaderboardRow[]> {
  return getLeaderboard(kind)
}

// 4) GET /api/frontend/review-contract
export type ReviewContract = {
  signalLifecycles: Resource<SignalLifecycle[]>
  strategyArchetypes: Resource<StrategyArchetype[]>
  missedDetections: Resource<MissedDetection[]>
  evolutionSuggestions: Resource<EvolutionSuggestion[]>
  reviewStats: Resource<ReviewStatsData>
  discoveryReview: Resource<DiscoveryReviewState>
  opportunityCalibration: Resource<OpportunityCalibrationState>
  dailyMoverReview: Resource<DailyMoverReviewState>
  historicalBacktest: Resource<HistoricalBacktestState>
  aiReviewStats: Resource<AiReviewStats>
}

export type ReviewStatsData = {
  closedSamples: number
  evidenceSamples: number
  maeAvg: number
  mfeAvg: number
  pendingSamples: number
  sampleStatus: 'empty' | 'collecting' | 'usable' | 'statistically_thin'
  summary: string
  totalSamples: number
  winRate: number | null
}

export type AiReviewStats = {
  disabled: number
  fallback: number
  reviewed: number
  total: number
  unboundFallbackProtected: boolean
}

export type DailyMoverReviewState = {
  schemaVersion: 'daily-mover-review-status.v1'
  status: 'empty' | 'collecting' | 'usable'
  snapshotCount: number
  selectedDetailCount: number
  missedReviewCount: number
  calibrationSuggestionCount: number
  latestSnapshotId: string | null
  latestObservedAt: string | null
  summary: string
  nextAction: string
  guardrails: string[]
}

export type HistoricalBacktestLaneMetric = {
  avgMaePct: number
  avgMfePct: number
  avgOpportunityScore: number
  count: number
  falsePositiveRatePct: number
  hitCount: number
  hitRatePct: number
  lane: 'radar' | 'momentum' | 'volume' | 'random'
  lateCount: number
  lateRatePct: number
}

export type HistoricalBacktestFinding = {
  detail: string
  id: string
  severity: 'low' | 'medium' | 'high'
  title: string
}

export type HistoricalBacktestScoreBucket = {
  avgMaePct: number
  avgMfePct: number
  count: number
  hitRatePct: number
  label: string
  lateRatePct: number
}

export type HistoricalBacktestReasonMetric = {
  avgMaePct: number
  avgMfePct: number
  count: number
  hitRatePct: number
  lateRatePct: number
  reason: string
}

export type HistoricalBacktestMissedOpportunity = {
  change24hPct: number
  direction: 'LONG' | 'SHORT'
  mfePct: number
  observedAt: string
  opportunityScore: number
  reasons: string[]
  symbol: string
}

export type HistoricalBacktestAuditV2Finding = {
  detail: string
  id: string
  layer: string
  nextAction: string
  rootCause: string
  severity: 'high' | 'medium' | 'low'
  title: string
}

export type HistoricalBacktestAuditV2Remediation = {
  acceptanceCriteria: string
  action: string
  canAutoApply: false
  layer: string
  priority: 'P0' | 'P1' | 'P2'
  targetModule: string
}

export type HistoricalBacktestAuditV2LaneMetric = {
  avgConfidence: number
  avgMaePct: number
  avgMfePct: number
  avgMoveAtSelectionPct: number
  avgVolumeRatio: number
  count: number
  earlyHitCount: number
  earlyHitRatePct: number
  hitCount: number
  hitRatePct: number
  lane: 'momentum' | 'radar' | 'random' | 'volume'
  lateCount: number
  lateRatePct: number
  qualityScore: number
}

export type HistoricalBacktestAuditV2TimingMetrics = {
  earlyCount: number
  earlyRatePct: number
  lateCount: number
  lateRatePct: number
  noPlanCount: number
  planReadyCount: number
}

export type HistoricalBacktestAuditOpportunityLaneMetric = {
  avgRadarRank: number | null
  avgRadarScore: number
  captureRatePct: number
  capturedCount: number
  hitCount: number
  hitRatePct: number
  label: string
  lane: 'early_setup' | 'higher_timeframe_context' | 'pullback_retest' | 'risk_review'
  lateCount: number
  lateRatePct: number
  missedEarlyHitCount: number
  missedEarlyQualityHitCount: number
  planReadyCount: number
  qualityHitCount: number
  qualityHitRatePct: number
  selectedCount: number
  totalNodes: number
}

export type HistoricalBacktestAuditCoreFailure = {
  code: string
  count: number
  detail: string
  label: string
  nextAction: string
  sampleSymbols: string[]
}

export type HistoricalBacktestAuditCoreCapabilityMetric = {
  failedNodes: number
  id: 'analysis' | 'scan' | 'strategy'
  keyMetrics: Record<string, number | string | null>
  label: string
  mainFailures: HistoricalBacktestAuditCoreFailure[]
  nextAction: string
  passedNodes: number
  passRatePct: number
  score: number
  status: 'fail' | 'pass' | 'watch'
  summary: string
  testedNodes: number
}

export type HistoricalBacktestAuditPlanBlockerMetric = {
  blocker: string
  capturedCount: number
  category: string
  conditionalWaitCount: number
  count: number
  diagnosis: string
  label: string
  lateCount: number
  qualityHitCount: number
  riskReviewCount: number
  sampleContexts: Array<{
    capturedByRadar: boolean
    hit: boolean
    lateAtSelection: boolean
    nodeRole: string
    opportunityLane: string
    qualityHit: boolean
    rewardRisk: number | null
    symbol: string
    tradePlanStatus: string
  }>
  sampleSymbols: string[]
}

export type HistoricalBacktestAuditLevelQualityMetric = {
  blocker: string
  capturedCount: number
  category: string
  conditionalWaitCount: number
  count: number
  diagnosis: string
  label: string
  lateCount: number
  nextAction: string
  primaryReason: string
  primaryReasonLabel: string
  qualityHitCount: number
  qualityHitRatePct: number
  riskReviewCount: number
  sampleContexts: HistoricalBacktestAuditPlanBlockerMetric['sampleContexts']
  sampleSymbols: string[]
}

export type HistoricalBacktestAuditWaitPlanEvaluation = {
  barsToTrigger: number | null
  diagnosticFlags: string[]
  label: string
  maxAdverseAfterTriggerPct: number | null
  maxFavorableAfterTriggerPct: number | null
  outcome: 'bad_wait' | 'inconclusive' | 'no_trade' | 'not_applicable' | 'useful_wait'
  postTriggerRewardRisk: number | null
  reason: string
  status:
    | 'missing_plan_levels'
    | 'not_triggered'
    | 'not_wait_plan'
    | 'triggered_sl_first'
    | 'triggered_timeout'
    | 'triggered_tp_first'
  stopHit: boolean
  targetHit: boolean
  triggerObservedAt: string | null
  triggerPrice: number | null
  triggerQualityScore: number | null
}

export type HistoricalBacktestAuditWaitPlanDiagnosticMetric = {
  code: string
  count: number
  label: string
  sampleSymbols: string[]
}

export type HistoricalBacktestAuditWaitPlanMetric = {
  avgTriggerQualityScore: number | null
  badWaitRatePct: number
  diagnosticBreakdown: HistoricalBacktestAuditWaitPlanDiagnosticMetric[]
  label: string
  missingLevelCount: number
  noTradeRatePct: number
  notTriggeredCount: number
  stopFirstCount: number
  targetFirstCount: number
  timeoutCount: number
  totalWaitPlans: number
  triggeredCount: number
  usefulWaitRatePct: number
}

export type HistoricalBacktestAuditPressureMetric = {
  captureRatePct: number
  earlyCaptureRatePct: number
  label: string
  missedEarlyQualityHitCount: number
  qualityHitRatePct: number
  selectedCount: number
  topN: number
  universePressurePct: number
}

export type HistoricalBacktestAuditMarketRegimeMetric = {
  avgRadarRank: number | null
  captureRatePct: number
  label: string
  lateRatePct: number
  qualityHitRatePct: number
  regime: string
  sampleSymbols: string[]
  totalNodes: number
}

export type HistoricalBacktestAuditRuleStabilityMetric = {
  blocker: string
  label: string
  missedQualityHitCount: number
  occurrenceCount: number
  sampleSymbols: string[]
  selectedUsefulCount: number
  stabilityScore: number
  status: 'stable' | 'unstable' | 'watch'
}

export type HistoricalBacktestAuditRoundTrendMetric = {
  current: number | null
  delta: number | null
  label: string
  previous: number | null
  status: 'flat' | 'improved' | 'regressed' | 'unavailable'
}

export type HistoricalBacktestAuditRoundTrendComparison = {
  metrics: HistoricalBacktestAuditRoundTrendMetric[]
  previousReportId: string | null
  summary: string
}

export type HistoricalBacktestAuditOpportunityQualityId =
  | 'fakeout_risk'
  | 'late_move'
  | 'noise'
  | 'premium_early_setup'
  | 'trade_plan_ready'
  | 'watch_only'

export type HistoricalBacktestAuditOpportunityQualityMetric = {
  avgRadarRank: number | null
  capturedCount: number
  captureRatePct: number
  conditionalWaitCount: number
  falsePositiveCount: number
  falsePositiveRatePct: number
  hitCount: number
  id: HistoricalBacktestAuditOpportunityQualityId
  label: string
  lateCount: number
  missedQualityHitCount: number
  nextAction: string
  planReadyCount: number
  qualityHitCount: number
  qualityHitRatePct: number
  sampleSymbols: string[]
  totalNodes: number
}

export type HistoricalBacktestAuditV2MissedOpportunity = {
  coinType: string
  coinTypeLabel: string
  confidence: number
  direction: 'long' | 'short'
  maePct: number
  mfePct: number
  moveAtSelectionPct: number
  nodeRole: string
  observedAt: string
  opportunityLane: HistoricalBacktestAuditOpportunityLaneMetric['lane']
  opportunityLaneLabel: string
  opportunityLaneScore: number
  opportunityQuality: HistoricalBacktestAuditOpportunityQualityId
  opportunityQualityLabel: string
  planBlockers: string[]
  radarRank: number | null
  radarScore: number
  reason: string
  rewardRisk: number | null
  symbol: string
  timeframeBand: string
  tradePlanStatus: string
  validationWindowLabel: string
  volumeRatio: number
}

export type HistoricalBacktestAuditRoundNode = {
  capturedByRadar: boolean
  coinType: string
  coinTypeLabel: string
  confidence: number
  direction: 'long' | 'short'
  findingCount: number
  hit: boolean
  lateAtSelection: boolean
  maePct: number
  maturity: string
  mfePct: number
  moveAtSelectionPct: number
  nodeIndex: number
  nodeRole: string
  observedAt: string
  opportunityLane: HistoricalBacktestAuditOpportunityLaneMetric['lane']
  opportunityLaneLabel: string
  opportunityLaneScore: number
  opportunityQuality: HistoricalBacktestAuditOpportunityQualityId
  opportunityQualityLabel: string
  planBlockers: string[]
  qualityHit: boolean
  radarRank: number | null
  radarScore: number
  rewardRisk: number | null
  selectedAsOpportunity: boolean
  selectedLane: HistoricalBacktestAuditOpportunityLaneMetric['lane'] | null
  symbol: string
  timeframeBand: 'large' | 'medium' | 'small'
  tradePlanStatus: string
  validationWindowBars: number
  validationWindowHours: number
  validationWindowLabel: string
  topN: number
  volumeRatio: number
  waitPlanEvaluation: HistoricalBacktestAuditWaitPlanEvaluation
}

export type HistoricalBacktestAuditRoundProgress = {
  candidateUniverseSize: number
  completedAt: string | null
  completedNodes: number
  currentNodeRole: string | null
  currentSymbol: string | null
  generatedAt: string
  guardrails: string[]
  nodes: HistoricalBacktestAuditRoundNode[]
  nodesPerSymbol: number
  phase: 'completed' | 'evaluating_nodes' | 'failed' | 'fetching_candles' | 'fetching_derivatives' | 'idle' | 'planning'
  plannedSymbols: Array<{
    coinType: string
    coinTypeLabel: string
    symbol: string
  }>
  schemaVersion: 'professional-backtest-audit-round-progress.v1'
  status: 'completed' | 'failed' | 'running'
  summary: string
  totalNodes: number
  updatedAt: string
}

export type CoreJudgeSystemLane = {
  id:
    | 'analysis_audit'
    | 'formal_audit'
    | 'golden_cases'
    | 'scan_audit'
    | 'shadow_live'
    | 'strategy_audit'
  label: string
  source: string
  status: 'fail' | 'pass' | 'waiting' | 'watch'
  summary: string
  updatedAt?: string
}

export type CoreJudgeSystemState = {
  guardrails: string[]
  lanes: CoreJudgeSystemLane[]
  schemaVersion: 'core-judge-system.v1'
  statusLabel: '不能支撑实战' | '可运行但不完整' | '完整完成' | '等待外部条件' | '临时验证版'
  summary: string
}

export type HistoricalBacktestAuditV2State = {
  schemaVersion: 'professional-backtest-audit-report.v2'
  auditRound?: HistoricalBacktestAuditRoundProgress
  baselineMetrics: {
    momentum: HistoricalBacktestAuditV2LaneMetric
    radar: HistoricalBacktestAuditV2LaneMetric
    random: HistoricalBacktestAuditV2LaneMetric
    volume: HistoricalBacktestAuditV2LaneMetric
  }
  cases: number
  highSeverityFindings: number
  planReadyCount: number
  testedCapabilities: number
  summary: string
  findings: HistoricalBacktestAuditV2Finding[]
  missedOpportunities: HistoricalBacktestAuditV2MissedOpportunity[]
  judgeSystem?: CoreJudgeSystemState
  coreCapabilityMetrics: HistoricalBacktestAuditCoreCapabilityMetric[]
  opportunityLaneMetrics: HistoricalBacktestAuditOpportunityLaneMetric[]
  opportunityQualityMetrics: HistoricalBacktestAuditOpportunityQualityMetric[]
  planBlockerMetrics: HistoricalBacktestAuditPlanBlockerMetric[]
  levelQualityMetrics: HistoricalBacktestAuditLevelQualityMetric[]
  waitPlanMetrics: HistoricalBacktestAuditWaitPlanMetric
  pressureTestMetrics: HistoricalBacktestAuditPressureMetric[]
  marketRegimeMetrics: HistoricalBacktestAuditMarketRegimeMetric[]
  ruleStabilityMetrics: HistoricalBacktestAuditRuleStabilityMetric[]
  roundTrendComparison: HistoricalBacktestAuditRoundTrendComparison
  remediationPlan: HistoricalBacktestAuditV2Remediation[]
  guardrails: string[]
  timingMetrics: HistoricalBacktestAuditV2TimingMetrics
}

export type HistoricalBacktestState = {
  schemaVersion: 'historical-backtest.v1'
  status: 'empty' | 'ready' | 'degraded'
  generatedAt: string | null
  reportId: string | null
  input: {
    days: number | null
    horizonBars: number | null
    interval: string | null
    moveThresholdPct: number | null
    replayTimes: number | null
    source: string | null
    symbolsUsed: number
    topN: number | null
  }
  lanes: {
    momentum: HistoricalBacktestLaneMetric
    radar: HistoricalBacktestLaneMetric
    random: HistoricalBacktestLaneMetric
    volume: HistoricalBacktestLaneMetric
  }
  findings: HistoricalBacktestFinding[]
  diagnostics: {
    missedOpportunities: HistoricalBacktestMissedOpportunity[]
    radarReasonMetrics: HistoricalBacktestReasonMetric[]
    radarScoreBuckets: HistoricalBacktestScoreBucket[]
  }
  summary: string
  nextAction: string
  guardrails: string[]
  auditV2?: HistoricalBacktestAuditV2State
  progress?: HistoricalBacktestAuditRoundProgress
}

export type DiscoveryReviewState = {
  calibration: {
    earlyOutcomeLink: 'ready' | 'collecting'
    lateSignalPenalty: 'active' | 'collecting'
    mfeMaeLink: 'ready' | 'collecting'
    notes: string[]
    status: 'usable' | 'collecting' | 'empty'
    summary: string
  }
  bookPressureCandidateCount: number
  cvdProxyCandidateCount: number
  earlyOpportunityCount: number
  guardrails: string[]
  lateMoveCount: number
  largeTakerTradeCandidateCount: number
  missedDetectionCount: number
  reviewFocus: string[]
  summary: string
  totalLightCandidates: number
}

export type OpportunityCalibrationSegment = {
  key: 'early_setup' | 'breakout_watch' | 'late_move' | 'cvd_proxy'
  label: string
  currentCandidates: number
  closedSamples: number
  metricSamples: number
  interpretation: string
  nextAction: string
}

export type OpportunityCalibrationState = {
  schemaVersion: 'opportunity-calibration.v1'
  status: 'usable' | 'collecting' | 'empty'
  summary: string
  sampleGate: {
    minClosedSamples: number
    minMetricSamples: number
    closedSamples: number
    metricSamples: number
    ready: boolean
  }
  thresholds: {
    earlyHotScore: number
    earlyWarmScore: number
    lateMoveHighRisk: string
    minimumStructuralRR: number
  }
  segments: OpportunityCalibrationSegment[]
  guardrails: string[]
}

export function getReviewStats(): Resource<ReviewStatsData> {
  return resource(
    {
      closedSamples: 0,
      evidenceSamples: 0,
      maeAvg: 0,
      mfeAvg: 0,
      pendingSamples: 0,
      sampleStatus: 'collecting',
      summary: '复盘统计只用于人工校准和回滚验证；不能自动改权重、不能改变实时排序。',
      totalSamples: 0,
      winRate: null,
    },
    'empty',
    { ageSec: 30, source: 'outcome-review' },
  )
}

export function getAiReviewStats(): Resource<AiReviewStats> {
  return resource(
    {
      disabled: 0,
      fallback: 0,
      reviewed: 0,
      total: 0,
      unboundFallbackProtected: true,
    },
    'partial',
    { ageSec: 30, source: 'rule-reviewer', reason: '规则反证只统计 evidence-id 绑定复核结果，不替代规则引擎。' },
  )
}

export function getDiscoveryReview(): Resource<DiscoveryReviewState> {
  return resource(
    {
      bookPressureCandidateCount: 0,
      cvdProxyCandidateCount: 0,
      calibration: {
        earlyOutcomeLink: 'collecting',
        lateSignalPenalty: 'collecting',
        mfeMaeLink: 'collecting',
        notes: [],
        status: 'empty',
        summary: '等待真实提前发现校准契约。',
      },
      earlyOpportunityCount: 0,
      guardrails: [
        '旧同步 getter 已停用。页面必须读取真实后端复盘契约。',
      ],
      lateMoveCount: 0,
      largeTakerTradeCandidateCount: 0,
      missedDetectionCount: 0,
      reviewFocus: [],
      summary: '等待真实提前发现复盘契约。',
      totalLightCandidates: 0,
    },
    'empty',
    { ageSec: 30, source: 'light-scan-review', reason: '未传入后端提前发现复盘契约' },
  )
}

export function getOpportunityCalibration(): Resource<OpportunityCalibrationState> {
  return resource(
    {
      schemaVersion: 'opportunity-calibration.v1',
      status: 'empty',
      summary: '等待真实机会校准契约；不能用空样本宣传命中率。',
      sampleGate: {
        minClosedSamples: 30,
        minMetricSamples: 15,
        closedSamples: 0,
        metricSamples: 0,
        ready: false,
      },
      thresholds: {
        earlyHotScore: 75,
        earlyWarmScore: 55,
        lateMoveHighRisk: 'late_move 或 overextensionRisk=high 必须降级为复盘/等待回踩反抽。',
        minimumStructuralRR: 3,
      },
      segments: [],
      guardrails: [
        '校准结果只读，不自动改实时权重。',
        '样本不足时只能显示 collecting/empty，不能展示胜率承诺。',
      ],
    },
    'empty',
    { ageSec: 30, source: 'outcome-calibration', reason: '未传入后端机会校准契约' },
  )
}

export function getDailyMoverReview(): Resource<DailyMoverReviewState> {
  return resource(
    {
      schemaVersion: 'daily-mover-review-status.v1',
      status: 'empty',
      snapshotCount: 0,
      selectedDetailCount: 0,
      missedReviewCount: 0,
      calibrationSuggestionCount: 0,
      latestSnapshotId: null,
      latestObservedAt: null,
      summary: '等待真实每日涨跌榜复盘样本。',
      nextAction: '先完成每日异动抓取和样本写入，再做启动前征兆归因。',
      guardrails: [
        '每日涨跌榜只做复盘研究，不作为追涨追跌信号。',
        '没有快照时必须显示暂无样本，不能伪造涨跌榜复盘结论。',
      ],
    },
    'empty',
    { ageSec: 30, source: 'daily-mover-review', reason: '未传入后端每日异动复盘契约' },
  )
}

export function emptyHistoricalBacktestLaneMetric(
  lane: HistoricalBacktestLaneMetric['lane'],
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
  }
}

export function getHistoricalBacktest(): Resource<HistoricalBacktestState> {
  return resource(
    {
      schemaVersion: 'historical-backtest.v1',
      status: 'empty',
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
        momentum: emptyHistoricalBacktestLaneMetric('momentum'),
        radar: emptyHistoricalBacktestLaneMetric('radar'),
        random: emptyHistoricalBacktestLaneMetric('random'),
        volume: emptyHistoricalBacktestLaneMetric('volume'),
      },
      findings: [],
      diagnostics: {
        missedOpportunities: [],
        radarReasonMetrics: [],
        radarScoreBuckets: [],
      },
      summary: '等待真实历史回测报告。',
      nextAction: '先运行历史时间点回放，再由后端 review-contract 读取展示。',
      guardrails: [
        '历史回测只用于验证扫描逻辑，不是收益承诺。',
        '没有报告时必须显示暂无数据，不能用模拟命中率补位。',
        '回测结论不能自动修改实时权重，必须人工复核。',
      ],
    },
    'empty',
    { ageSec: 30, source: 'historical-backtest', reason: '旧同步 getter 不读取磁盘报告。' },
  )
}

export function getReviewContract(): ReviewContract {
  return {
    signalLifecycles: getSignalLifecycles(),
    strategyArchetypes: getStrategyArchetypes(),
    missedDetections: getMissedDetections(),
    evolutionSuggestions: getEvolutionSuggestions(),
    reviewStats: getReviewStats(),
    discoveryReview: getDiscoveryReview(),
    opportunityCalibration: getOpportunityCalibration(),
    dailyMoverReview: getDailyMoverReview(),
    historicalBacktest: getHistoricalBacktest(),
    aiReviewStats: getAiReviewStats(),
  }
}
