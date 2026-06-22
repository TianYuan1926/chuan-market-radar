// ============================================================
// 雷达系统 · 后端契约 mock 数据层（集中管理）
// ------------------------------------------------------------
// 这里集中定义「全市场山寨趋势切换雷达」后端的所有结构化输出。
// 字段语义对齐后端能力，前端只展示、不做交易判断。
// 后端接入时：把每个 getXxx() 换成真实 fetch，保持返回 Resource<T> 形状。
// ============================================================

import { resource, type Resource } from './data-status'

// ============================================================
// 一、全市场扫描证明
// ============================================================
export type ScanProofData = {
  totalMonitored: number // 总监控币数
  scannable: number // 可扫描币数
  lightScanned: number // 已轻扫
  deepScanned: number // 已深扫
  awaitingDeepScan: number // 等待深扫
  coverage: number // 扫描覆盖率 %
  lastScanAt: string // 最近扫描时间
  nextScanCountdownSec: number // 下一轮扫描倒计时（秒）
  stuck: boolean // 当前扫描是否卡住
}

export function getScanProof(): Resource<ScanProofData> {
  return resource(
    {
      totalMonitored: 2184,
      scannable: 1972,
      lightScanned: 1972,
      deepScanned: 148,
      awaitingDeepScan: 36,
      coverage: 90.3,
      lastScanAt: '13:48:12',
      nextScanCountdownSec: 42,
      stuck: false,
    },
    'live',
    { ageSec: 8, source: 'scanner-worker' },
  )
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
  return resource(
    {
      currentBatch: ['TIA', 'DOGS', 'WIF', 'ZEC'],
      nextBatch: ['SYN', 'BTW', 'ORDI', 'JTO', 'INJ'],
      highPriority: ['PEPE', 'TIA', 'SUI'],
      coldExploration: ['REI', 'ACX', 'MOVR', 'CTSI'],
      longUnscanned: [
        { symbol: 'RDNT', idleMin: 184 },
        { symbol: 'HOOK', idleMin: 156 },
        { symbol: 'ALICE', idleMin: 132 },
      ],
    },
    'live',
    { ageSec: 12, source: 'dynamic-scan-scheduler' },
  )
}

// ============================================================
// 三、系统能力总控（9 个阶段）
// ============================================================
export type CapabilityStage = {
  key: string
  name: string
  desc: string
  status: 'active' | 'standby' | 'degraded'
  note: string
}

export function getCapabilityStages(): Resource<CapabilityStage[]> {
  return resource(
    [
      { key: 'lifecycle', name: '信号生命周期', desc: '从轻扫标记到计划就绪/失效的全链路状态机', status: 'active', note: '7 个状态正常流转' },
      { key: 'review', name: '复盘判定标准', desc: '统一的命中/失败/漏判/超时判定口径', status: 'active', note: '验证窗口 24h' },
      { key: 'rotation', name: '候选池轮换', desc: '动态进出候选池，热门优先、冷门探索', status: 'active', note: '当前 42 个候选' },
      { key: 'maturity', name: '信号成熟度', desc: '轻扫→深扫→证据→计划 分层晋级', status: 'active', note: '分层阈值已加载' },
      { key: 'shadow', name: '影子跟踪', desc: '未交易信号的影子持仓跟踪，用于复盘', status: 'active', note: '跟踪中 38 个' },
      { key: 'archetype', name: '策略分型统计', desc: '压缩突破/吸筹/回踩等分型胜率统计', status: 'active', note: '5 类分型' },
      { key: 'replay', name: '历史案例回放', desc: '扫描帧级别的历史状态回放', status: 'active', note: '保留 30 日' },
      { key: 'ai_review', name: 'AI 反证复核', desc: 'AI 仅复核反证，不生成交易结论', status: 'standby', note: '人工触发 / 定时' },
      { key: 'evolution', name: '进化建议', desc: '研究性建议，不自动改写实时规则', status: 'standby', note: '需人工采纳' },
    ],
    'live',
    { ageSec: 30, source: 'signal-worker' },
  )
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
  return resource(
    [
      { name: 'CoinGlass', feed: 'live', latencyMs: 180, latencyStatus: 'ready', lastUpdate: '13:48:05', note: '深扫衍生品数据正常' },
      { name: 'Binance', feed: 'live', latencyMs: 42, latencyStatus: 'ready', lastUpdate: '13:48:11', note: '公共行情轻扫正常' },
      { name: 'OKX', feed: 'live', latencyMs: 61, latencyStatus: 'ready', lastUpdate: '13:48:10', note: '公共行情轻扫正常' },
      { name: 'Bybit', feed: 'cached', latencyMs: 320, latencyStatus: 'ready', lastUpdate: '13:46:58', note: '行情流抖动，暂用缓存' },
    ],
    'partial',
    { ageSec: 8, source: 'scanner-worker', reason: 'Bybit 暂用缓存数据' },
  )
}

// ============================================================
// 五、信号成熟度分层
// ============================================================
export type SignalMaturity =
  | 'LIGHT_SCAN_MARK' // 轻扫标记
  | 'DEEP_SCAN_CANDIDATE' // 深扫候选
  | 'EVIDENCE_SIGNAL' // 证据融合信号
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
  TRADE_PLAN_READY: { label: '计划就绪', short: '就绪', tone: 'live', order: 4 },
  BLOCKED: { label: 'Risk Gate 拦截', short: '拦截', tone: 'down', order: 5 },
  INVALIDATED: { label: '结构失效', short: '失效', tone: 'down', order: 6 },
  COOLDOWN: { label: '冷却中', short: '冷却', tone: 'warn', order: 7 },
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

const RADAR_SIGNALS: RadarSignal[] = [
  { id: 's-tia', symbol: 'TIA', hue: 220, direction: '多', maturity: 'TRADE_PLAN_READY', rr: 3.2, risk: '中', evidenceCount: 5, counterCount: 1, freshness: 'live', whySelected: '4h 压缩突破 + OI 温和抬升 + 相对强弱领先板块', whyBlocked: null, updatedMinAgo: 2 },
  { id: 's-dogs', symbol: 'DOGS', hue: 35, direction: '多', maturity: 'EVIDENCE_SIGNAL', rr: 2.6, risk: '中', evidenceCount: 4, counterCount: 1, freshness: 'live', whySelected: '突破关键位放量站稳，主力净流入', whyBlocked: null, updatedMinAgo: 4 },
  { id: 's-zec', symbol: 'ZEC', hue: 50, direction: '多', maturity: 'BLOCKED', rr: 1.3, risk: '极高', evidenceCount: 3, counterCount: 4, freshness: 'live', whySelected: '日线趋势加速，量能放大', whyBlocked: '资金费率过热 + OI 拥挤 + RR 不足，Risk Gate 拦截', updatedMinAgo: 3 },
  { id: 's-pepe', symbol: 'PEPE', hue: 130, direction: '多', maturity: 'DEEP_SCAN_CANDIDATE', rr: null, risk: '中', evidenceCount: 2, counterCount: 0, freshness: 'live', whySelected: '1h 结构转多，等待深扫验证 OI/Funding', whyBlocked: '深扫验证中，证据未融合，暂不可交易', updatedMinAgo: 1 },
  { id: 's-wif', symbol: 'WIF', hue: 280, direction: '空', maturity: 'TRADE_PLAN_READY', rr: 2.9, risk: '中', evidenceCount: 5, counterCount: 1, freshness: 'live', whySelected: '跌破支撑 + 主力净流出 + 高周期压力', whyBlocked: null, updatedMinAgo: 5 },
  { id: 's-sui', symbol: 'SUI', hue: 200, direction: '观察', maturity: 'LIGHT_SCAN_MARK', rr: null, risk: '低', evidenceCount: 1, counterCount: 0, freshness: 'cached', whySelected: '轻扫发现量能异动，待进入深扫队列', whyBlocked: '仅轻扫标记，未进入主信号区', updatedMinAgo: 7 },
  { id: 's-inj', symbol: 'INJ', hue: 190, direction: '多', maturity: 'COOLDOWN', rr: null, risk: '中', evidenceCount: 3, counterCount: 2, freshness: 'live', whySelected: '此前触发已离场，进入冷却避免追单', whyBlocked: '冷却期内，避免同标的频繁开仓', updatedMinAgo: 18 },
  { id: 's-ordi', symbol: 'ORDI', hue: 40, direction: '空', maturity: 'INVALIDATED', rr: null, risk: '高', evidenceCount: 2, counterCount: 3, freshness: 'live', whySelected: '曾判定空头结构', whyBlocked: '价格收回关键位，空头结构失效', updatedMinAgo: 9 },
  { id: 's-arb', symbol: 'ARB', hue: 210, direction: '观察', maturity: 'LIGHT_SCAN_MARK', rr: null, risk: '低', evidenceCount: 1, counterCount: 0, freshness: 'live', whySelected: '相对强弱回升，轻扫标记', whyBlocked: '证据不足，等待下一轮深扫', updatedMinAgo: 6 },
  { id: 's-syn', symbol: 'SYN', hue: 285, direction: '多', maturity: 'EVIDENCE_SIGNAL', rr: 2.4, risk: '中', evidenceCount: 4, counterCount: 1, freshness: 'live', whySelected: '板块轮动领涨 + 链上换手放大', whyBlocked: null, updatedMinAgo: 3 },
  { id: 's-jto', symbol: 'JTO', hue: 165, direction: '空', maturity: 'DEEP_SCAN_CANDIDATE', rr: null, risk: '中', evidenceCount: 2, counterCount: 1, freshness: 'live', whySelected: '高位放量滞涨，深扫验证中', whyBlocked: '深扫未完成，证据未融合', updatedMinAgo: 2 },
  { id: 's-sei', symbol: 'SEI', hue: 0, direction: '多', maturity: 'TRADE_PLAN_READY', rr: 3.6, risk: '低', evidenceCount: 6, counterCount: 0, freshness: 'live', whySelected: '多周期共振向上 + 无有效反证', whyBlocked: null, updatedMinAgo: 1 },
  { id: 's-ldo', symbol: 'LDO', hue: 25, direction: '观察', maturity: 'COOLDOWN', rr: null, risk: '中', evidenceCount: 2, counterCount: 1, freshness: 'cached', whySelected: '近期信号刚结算，冷却观察', whyBlocked: '冷却期内', updatedMinAgo: 22 },
  { id: 's-rune', symbol: 'RUNE', hue: 160, direction: '空', maturity: 'EVIDENCE_SIGNAL', rr: 2.2, risk: '高', evidenceCount: 4, counterCount: 2, freshness: 'live', whySelected: '跌破颈线 + Funding 转负', whyBlocked: null, updatedMinAgo: 4 },
  { id: 's-fet', symbol: 'FET', hue: 250, direction: '多', maturity: 'BLOCKED', rr: 1.5, risk: '高', evidenceCount: 3, counterCount: 3, freshness: 'live', whySelected: 'AI 板块强势，结构转多', whyBlocked: '涨幅过大 + 证据冲突，Risk Gate 拦截', updatedMinAgo: 6 },
]

export function getRadarSignals(): Resource<RadarSignal[]> {
  return resource(RADAR_SIGNALS, 'live', { ageSec: 6, source: 'signal-worker' })
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

export type EvidenceItem = { kind: string; label: string; weight: number; detail: string; supportive: boolean }
export type CounterItem = { kind: string; label: string; detail: string }
export type RiskGateResult = {
  allowTradePlan: boolean
  reasons: string[] // 不允许时的明确原因
}
export type TradePlanData = {
  bias: '多' | '空' | '观望'
  entryCondition: string
  stop: string
  tp1: string
  tp2: string
  tp3: string
  rr: number
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

export type TokenDossier = {
  symbol: string
  direction: '看多' | '看空' | '中性'
  maturity: SignalMaturity
  structures: TfStructure[]
  evidence: EvidenceItem[]
  counter: CounterItem[]
  riskGate: RiskGateResult
  tradePlan: TradePlanData | null // 被拦截时为 null
  aiReview: AiReviewData
}

// 确定性生成单币档案（基于 symbol，保证 SSR/CSR 一致）
function seedFrom(symbol: string): number {
  let h = 0
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0
  return h
}

export function getTokenDossier(symbol: string, basePrice = 1): Resource<TokenDossier> {
  const seed = seedFrom(symbol)
  const bullish = seed % 3 !== 0
  const blocked = seed % 7 === 0
  const p = basePrice
  const r = (n: number) => +(p * n).toFixed(p < 0.01 ? 6 : p < 1 ? 4 : 2)
  const mk = (tf: TfStructure['tf'], phase: string, trend: TfStructure['trend'], lo: number, hi: number): TfStructure => ({
    tf,
    phase,
    trend,
    priorHigh: r(hi),
    priorLow: r(lo),
    support: r(lo * 1.01),
    resistance: r(hi * 0.99),
  })

  const dossier: TokenDossier = {
    symbol,
    direction: bullish ? '看多' : '看空',
    maturity: blocked ? 'BLOCKED' : 'TRADE_PLAN_READY',
    structures: [
      mk('15m', bullish ? '回踩确认' : '反弹受阻', bullish ? '多' : '空', 0.97, 1.03),
      mk('1h', bullish ? '突破延续' : '破位下行', bullish ? '多' : '空', 0.94, 1.06),
      mk('4h', bullish ? '压缩突破' : '高位派发', bullish ? '多' : '震荡', 0.9, 1.12),
      mk('1d', bullish ? '上升趋势' : '趋势转弱', bullish ? '多' : '空', 0.82, 1.2),
    ],
    evidence: [
      { kind: 'structure', label: '盘面结构', weight: 24, detail: bullish ? '4h 压缩区上沿放量突破，回踩不破' : '跌破上升趋势线并回踩确认', supportive: true },
      { kind: 'volume', label: '量能', weight: 18, detail: '突破时成交量较 20 周期均量放大 2.4x', supportive: true },
      { kind: 'oi', label: 'OI 持仓', weight: 16, detail: bullish ? 'OI 随价格温和抬升，增量资金进场' : 'OI 高位回落，多头减仓', supportive: true },
      { kind: 'funding', label: '资金费率', weight: 12, detail: '费率中性偏低，未见过热', supportive: true },
      { kind: 'lsr', label: '多空比', weight: 10, detail: '散户多空比未极端，无明显反指', supportive: true },
      { kind: 'rs', label: '相对强弱', weight: 12, detail: '相对 BTC 与板块强弱领先', supportive: true },
      { kind: 'ta', label: '技术指标', weight: 8, detail: 'MACD 金叉延续，RSI 未超买', supportive: true },
    ],
    counter: blocked
      ? [
          { kind: 'hi_tf', label: '高周期压力', detail: '日线前高密集成交区就在上方 3%，压力显著' },
          { kind: 'funding', label: 'Funding 过热', detail: '资金费率连续正向且偏高，多头拥挤' },
          { kind: 'oi_crowd', label: 'OI 拥挤', detail: 'OI 增速过快，回调去杠杆风险高' },
          { kind: 'rr', label: 'RR 不足', detail: '到最近压力位的赔率不足 1.5，不满足开仓门槛' },
        ]
      : [{ kind: 'hi_tf', label: '高周期压力', detail: '日线上方存在前高压力，注意减仓位置' }],
    riskGate: blocked
      ? { allowTradePlan: false, reasons: ['资金费率过热（多头拥挤）', 'OI 拥挤，去杠杆风险��', 'RR 不足 1.5，赔率不达标'] }
      : { allowTradePlan: true, reasons: [] },
    tradePlan: blocked
      ? null
      : {
          bias: bullish ? '多' : '空',
          entryCondition: bullish ? `站稳 ${r(1.0)} 上方且回踩 ${r(0.99)} 不破` : `反弹至 ${r(1.01)} 受阻且跌破 ${r(0.99)}`,
          stop: bullish ? `${r(0.96)}（-4%）` : `${r(1.04)}（+4%）`,
          tp1: r(bullish ? 1.05 : 0.95).toString(),
          tp2: r(bullish ? 1.1 : 0.9).toString(),
          tp3: r(bullish ? 1.18 : 0.82).toString(),
          rr: 3.1,
          scaleOut: 'TP1 减 40% · TP2 减 40% · TP3 剩余 20%',
          invalidation: bullish ? `收盘跌破 ${r(0.96)} 则结构失效` : `收盘站上 ${r(1.04)} 则结构失效`,
          allowChase: false,
        },
    aiReview: {
      reviewed: true,
      findings: blocked
        ? ['确认 Funding 过热与 OI 拥挤反证成立', '建议在拦截解除前不建立交易计划']
        : ['未发现推翻主结论的强反证', '提示关注日线压力位附近的减仓管理'],
      suggestDowngrade: blocked,
      note: 'AI 仅对反证进行复核，不生成交易结论；最终判定以规则引擎为准。',
    },
  }
  return resource(dossier, 'live', { ageSec: 5, source: 'signal-worker' })
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
  return resource(
    [
      { id: 'lc1', symbol: 'DOGS', hue: 35, side: '多', appearedAt: '06/20 13:50', triggerPrice: 0.0392, stopPrice: 0.0361, targetPrice: 0.052, verifyWindowH: 24, hitTpFirst: true, hitSlFirst: false, timedOut: false, mfe: 32.6, mae: -3.1 },
      { id: 'lc2', symbol: 'WIF', hue: 280, side: '空', appearedAt: '06/20 12:31', triggerPrice: 1.82, stopPrice: 1.91, targetPrice: 1.65, verifyWindowH: 24, hitTpFirst: true, hitSlFirst: false, timedOut: false, mfe: 9.8, mae: -2.2 },
      { id: 'lc3', symbol: 'ZEC', hue: 50, side: '多', appearedAt: '06/20 13:33', triggerPrice: 28.4, stopPrice: 26.9, targetPrice: 32.1, verifyWindowH: 24, hitTpFirst: false, hitSlFirst: true, timedOut: false, mfe: 2.1, mae: -6.4 },
      { id: 'lc4', symbol: 'TIA', hue: 220, side: '多', appearedAt: '06/20 13:41', triggerPrice: 9.2, stopPrice: 8.6, targetPrice: 10.5, verifyWindowH: 24, hitTpFirst: false, hitSlFirst: false, timedOut: true, mfe: 7.2, mae: -4.0 },
    ],
    'live',
    { ageSec: 60, source: 'signal-worker' },
  )
}

export type StrategyArchetype = {
  key: string
  name: string
  winRate: number
  avgRR: number
  samples: number
  commonFailure: string
}

export function getStrategyArchetypes(): Resource<StrategyArchetype[]> {
  return resource(
    [
      { key: 'squeeze', name: '压缩突破', winRate: 68, avgRR: 2.9, samples: 124, commonFailure: '假突破后快速回落，未站稳即追入' },
      { key: 'accumulate', name: '吸筹', winRate: 61, avgRR: 2.4, samples: 86, commonFailure: '吸筹周期被低估，过早入场被洗' },
      { key: 'pullback', name: '回踩确认', winRate: 72, avgRR: 2.6, samples: 142, commonFailure: '回踩跌破关键位仍持有，未及时止损' },
      { key: 'accelerate', name: '趋势加速', winRate: 58, avgRR: 3.2, samples: 73, commonFailure: '加速末端追高，遇见顶部反转' },
      { key: 'exhaustion', name: '衰竭风险', winRate: 47, avgRR: 1.9, samples: 51, commonFailure: '衰竭信号提前，趋势仍延续一段' },
    ],
    'live',
    { ageSec: 120, source: 'signal-worker' },
  )
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
  return resource(
    [
      { symbol: 'RE', hue: 20, move: 85.9, side: '涨', reason: '证据不足', detail: '社媒情绪源未接入，仅链上信号未达阈值', improvement: '接入社媒情绪维度，降低纯链上触发门槛' },
      { symbol: 'JTO', hue: 200, move: -7.3, side: '跌', reason: '未进深扫', detail: '盘口撤单发生在两帧之间，未触发深扫', improvement: '提高盘口快照频率，撤单聚集触发即时深扫' },
      { symbol: 'MOVR', hue: 300, move: 41.2, side: '涨', reason: '未进轻扫', detail: '低流动性币种被流动性过滤器排除', improvement: '为冷门探索保留小额扫描配额' },
      { symbol: 'FET', hue: 250, move: 28.4, side: '涨', reason: '被风控挡住', detail: '涨幅过大触发 Risk Gate，错过后续主升', improvement: '区分「追高拦截」与「趋势延续」，加入回踩二次入场判定' },
    ],
    'partial',
    { ageSec: 300, source: 'signal-worker', reason: '社媒情绪维度尚未接入' },
  )
}

export type EvolutionSuggestion = {
  title: string
  rationale: string
  impact: '高' | '中' | '低'
  adopted: boolean
}

export function getEvolutionSuggestions(): Resource<EvolutionSuggestion[]> {
  return resource(
    [
      { title: '接入社媒情绪维度', rationale: '近 30 日漏判中 38% 与纯链上触发阈值过高相关', impact: '高', adopted: false },
      { title: '提高盘口快照频率', rationale: '撤单类漏判反复出现，两帧间隔过大', impact: '中', adopted: false },
      { title: '回踩二次入场判定', rationale: '追高拦截后常错过回踩延续段', impact: '中', adopted: false },
    ],
    'live',
    { ageSec: 600, source: 'signal-worker' },
  )
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
  return resource(
    [
      { key: 'web', name: 'web', status: 'healthy', detail: 'P95 86ms · QPS 1.2k' },
      { key: 'postgres', name: 'postgres', status: 'healthy', detail: '主从同步 · 延迟 12ms' },
      { key: 'redis', name: 'redis', status: 'healthy', detail: '命中率 98.4% · 内存 62%' },
      { key: 'scanner-worker', name: 'scanner-worker', status: 'degraded', detail: '8 节点中 1 节点重启中' },
      { key: 'coinglass-worker', name: 'coinglass-worker', status: 'healthy', detail: 'pacing 1.2s · 正常' },
      { key: 'signal-worker', name: 'signal-worker', status: 'healthy', detail: '队列积压 0 · 正常' },
      { key: 'dynamic-scan-scheduler', name: 'dynamic-scan-scheduler', status: 'healthy', detail: '下一批 42s 后触发' },
    ],
    'live',
    { ageSec: 5, source: 'web' },
  )
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
  return resource(
    {
      lastScanAt: '13:48:12',
      lastWriteAt: '13:48:13',
      stale: false,
      cacheHit: true,
      recentError: 'Coinbase 深度接口超时（240ms）已降级',
      recentSuccess: 'signal-worker 完成 47 条信号融合',
    },
    'live',
    { ageSec: 4, source: 'web' },
  )
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
  return resource(
    {
      provider: 'CoinGlass',
      usedToday: 3420,
      remainingToday: 1580,
      perMinuteLimit: 30,
      pacingMs: 1200,
      throttled: false,
      source: 'redis',
    },
    'live',
    { ageSec: 10, source: 'coinglass-worker' },
  )
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
  return resource(
    {
      system: '正常',
      scan: '扫描中',
      signal: '有就绪信号',
      risk: '中',
      rank: '川流不息',
      discipline: '良好',
      review: '待复盘',
      todayPerf: 76,
    },
    'live',
    { ageSec: 6, source: 'web' },
  )
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
  inCandidatePool: boolean // 是否进候选池
  deepScanned: boolean // 是否已深扫
  hasSignal: boolean // 是否有信号
  blocked: boolean // 是否被 Risk Gate 拦截
  awaitingScan: boolean // 是否等待下一轮扫描
}

function mkRows(kind: LeaderboardKind, seed: number): LeaderboardRow[] {
  const pool = ['SEI', 'TIA', 'DOGS', 'WIF', 'SYN', 'PEPE', 'ZEC', 'INJ', 'ORDI', 'JTO', 'SUI', 'ARB', 'RUNE', 'FET', 'LDO', 'OP', 'BICO', 'REI']
  return pool.slice(0, 12).map((symbol, i) => {
    const s = (seed + i * 37) % 100
    const sign = kind === 'losers' ? -1 : kind === 'funding_hot' ? 1 : s % 5 === 0 ? -1 : 1
    const base =
      kind === 'gainers' || kind === 'losers'
        ? 8 + (s % 120)
        : kind === 'volume'
          ? 2 + (s % 18)
          : kind === 'oi_change'
            ? 5 + (s % 40)
            : kind === 'funding_hot'
              ? 0.01 + (s % 9) / 100
              : 40 + (s % 60)
    return {
      symbol,
      hue: (i * 47 + seed) % 360,
      value: +(base * sign).toFixed(kind === 'funding_hot' ? 4 : 2),
      price: +(0.01 + (s % 80) * 0.8).toFixed(4),
      inCandidatePool: s % 3 !== 0,
      deepScanned: s % 4 === 0,
      hasSignal: s % 5 === 0,
      blocked: s % 11 === 0,
      awaitingScan: s % 7 === 0,
    }
  })
}

export function getLeaderboard(kind: LeaderboardKind): Resource<LeaderboardRow[]> {
  return resource(mkRows(kind, seedFrom(kind) % 100), 'live', { ageSec: 15, source: 'scanner-worker' })
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
  return resource(
    {
      btcState: '强势',
      ethState: '震荡',
      btcDominance: 54.2,
      btcDominanceTrend: '下降',
      total2: 1.42e12,
      total3: 6.85e11,
      altStrength: 64,
      riskMode: '进攻',
      suggestion: '更适合做多',
    },
    'live',
    { ageSec: 20, source: 'binance' },
  )
}

// ============================================================
// 十二、CoinGlass 衍生品状态（不做清算热力图 / 不做清算目标位）
// ============================================================
export type DerivativesState = {
  oiChange: number // OI 变化 %
  funding: number // 资金费率 %
  longShortRatio: number // 多空比
  takerBuySell: number // 主动买卖比
  takerBuySellStatus: 'connected' | 'not_connected'
  exchangeCoverage: number // 交易所覆盖数
  totalExchanges: number
  lastUpdate: string
}

export function getDerivatives(): Resource<DerivativesState> {
  return resource(
    {
      oiChange: 8.4,
      funding: 0.0125,
      longShortRatio: 1.84,
      takerBuySell: 0,
      takerBuySellStatus: 'not_connected',
      exchangeCoverage: 11,
      totalExchanges: 13,
      lastUpdate: '13:48:05',
    },
    'partial',
    { ageSec: 9, source: 'coinglass', reason: 'OI/Funding/多空比已接入；主动买卖和 CVD 暂未接真实源。' },
  )
}

export type FundFlowState = {
  allowedUse: 'market_context_only'
  canCreateTradeSignal: false
  detail: string
  source: 'coinglass_derivatives' | 'not_connected'
  status: 'partial' | 'waiting_source'
  takerBuySellAvailable: boolean
  unavailableFields: string[]
}

export function getFundFlow(): Resource<FundFlowState> {
  return resource(
    {
      allowedUse: 'market_context_only',
      canCreateTradeSignal: false,
      detail: '已接 OI、Funding、Long/Short 等衍生品上下文；主动买卖和 CVD 仍等待真实稳定源。',
      source: 'coinglass_derivatives',
      status: 'partial',
      takerBuySellAvailable: false,
      unavailableFields: ['taker_buy_sell', 'cvd_proxy', 'real_fund_flow'],
    },
    'partial',
    { ageSec: 9, source: 'coinglass', reason: '资金流只能展示已接真实字段；未接 taker/CVD 时必须显示等待数据源。' },
  )
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
  return resource(
    {
      issues: [],
      score: 100,
      status: 'healthy',
      summary: '扫描链路健康，覆盖、归档和 worker 心跳可用。',
    },
    'live',
    { ageSec: 8, source: 'system-health', reason: '扫描稳定性报告只用于运维诊断；不能直接生成交易信号。' },
  )
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
  dataSources: Resource<DataSourceState[]>
  apiUsage: Resource<ApiUsageState>
  dataPipeline: Resource<DataPipelineState>
  petBackendStatus: Resource<PetBackendStatus>
  radarSignals: Resource<RadarSignal[]>
  macroAltEnv: Resource<MacroAltEnv>
  derivatives: Resource<DerivativesState>
  fundFlow: Resource<FundFlowState>
  scanStability: Resource<ScanStabilityState>
  serviceNodes: Resource<ServiceNode[]>
}

export function getRadarContract(): RadarContract {
  return {
    scanProof: getScanProof(),
    deepScanQueue: getDeepScanQueue(),
    capabilityStages: getCapabilityStages(),
    dataSources: getDataSources(),
    apiUsage: getApiUsage(),
    dataPipeline: getDataPipeline(),
    petBackendStatus: getPetBackendStatus(),
    radarSignals: getRadarSignals(),
    macroAltEnv: getMacroAltEnv(),
    derivatives: getDerivatives(),
    fundFlow: getFundFlow(),
    scanStability: getScanStability(),
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
