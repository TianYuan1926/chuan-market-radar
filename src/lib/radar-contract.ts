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
  | 'EVIDENCE_SIGNAL' // 证据融合信号
  | 'REVIEW_ONLY' // 只做复盘观察
  | 'TRADE_PLAN_READY' // 交易计划就绪
  | 'BLOCKED' // 被 Risk Gate 拦截
  | 'INVALIDATED' // 结构失效
  | 'COOLDOWN' // 冷却中

export const MATURITY_META: Record<
  SignalMaturity,
  { label: string; short: string; tone: 'live' | 'neon' | 'warn' | 'down' | 'muted'; order: number }
> = {
  LIGHT_SCAN_MARK: { label: '轻扫标记', short: '轻扫', tone: 'muted', order: 1 },
  DEEP_SCAN_CANDIDATE: { label: '深扫候选', short: '深扫', tone: 'neon', order: 2 },
  EVIDENCE_SIGNAL: { label: '证据信号', short: '证据', tone: 'neon', order: 3 },
  REVIEW_ONLY: { label: '复盘观察', short: '复盘', tone: 'warn', order: 4 },
  TRADE_PLAN_READY: { label: '计划就绪', short: '就绪', tone: 'live', order: 5 },
  BLOCKED: { label: 'Risk Gate 拦截', short: '拦截', tone: 'down', order: 6 },
  INVALIDATED: { label: '结构失效', short: '失效', tone: 'down', order: 7 },
  COOLDOWN: { label: '冷却中', short: '冷却', tone: 'warn', order: 8 },
}

export type RadarSignal = {
  id: string
  symbol: string
  hue: number
  direction: '多' | '空' | '观察'
  maturity: SignalMaturity
  rr: number | null // 赔率，未就绪为 null
  risk: '低' | '中' | '高' | '极高'
  evidenceCount: number
  counterCount: number
  freshness: DataSourceState['feed']
  whySelected: string // 为什么入选
  whyBlocked: string | null // 为什么不能交易（无则 null）
  updatedMinAgo: number
}

export function getRadarSignals(): Resource<RadarSignal[]> {
  return legacyEmptyResource([])
}

// ============================================================
// 六、单币：多周期结构 / 证据链 / 反证链 / Risk Gate / 交易计划 / AI 复核
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
  note: string // AI 只复核不下结论的声明
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
  structures: TfStructure[]
  evidence: EvidenceItem[]
  counter: CounterItem[]
  riskGate: RiskGateResult
  tradePlan: TradePlanData | null // 被拦截时为 null
  aiReview: AiReviewData
  reportSections: AnalysisReportSection[]
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
    structures: [],
    evidence: [],
    counter: [],
    riskGate: {
      allowTradePlan: false,
      reasons: [LEGACY_DISABLED_REASON],
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
  blocked: boolean // 是否被 Risk Gate 拦截
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
  changePercent: number
  flowImbalance: number | null
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
    buyPressureCandidateCount: number
    candidateCount: number
    cvdProxyCandidateCount: number
    hotCandidateCount: number
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
      buyPressureCandidateCount: 0,
      candidateCount: 0,
      cvdProxyCandidateCount: 0,
      hotCandidateCount: 0,
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
    { ageSec: 30, source: 'ai-reviewer', reason: 'AI 只统计 evidence-id 绑定复核结果，不替代规则引擎。' },
  )
}

export function getReviewContract(): ReviewContract {
  return {
    signalLifecycles: getSignalLifecycles(),
    strategyArchetypes: getStrategyArchetypes(),
    missedDetections: getMissedDetections(),
    evolutionSuggestions: getEvolutionSuggestions(),
    reviewStats: getReviewStats(),
    aiReviewStats: getAiReviewStats(),
  }
}
