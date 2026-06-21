// 模拟数据引擎：行情、K线、异动信号、榜单
// 全部为确定性伪随机，保证 SSR / CSR 一致

export type Token = {
  id: string
  symbol: string
  name: string
  price: number
  marketCap: number // 单位：美元
  volume24h: number
  change1h: number
  change24h: number
  change7d: number
  change30d: number
  hue: number // 用于生成头像配色
  tags: ('Alpha' | 'FOMO' | '异常活跃' | '利多' | '合约')[]
  anomalyScore: number // 0-100 异动强度
  trend: 'bull' | 'bear' | 'shock'
}

// 简单的可重复伪随机
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SYMBOLS: [string, string][] = [
  ['BTW', 'BitWave'],
  ['REI', 'Reactor'],
  ['LOKA', 'League of Kingdoms'],
  ['OMNI', 'Omni Net'],
  ['BOBO', 'Bobo Cat'],
  ['SLX', 'Solex'],
  ['VELO', 'Velocity'],
  ['KMA', 'Karma'],
  ['HYPE', 'Hyperion'],
  ['WOJK', 'Wojak'],
  ['ALCE', 'AliceVerse'],
  ['EGEN', 'Eigen'],
  ['NEAR', 'NearFlow'],
  ['SYNC', 'SyncDAO'],
  ['PAXG', 'PaxGold'],
  ['DOGS', 'DogSwap'],
  ['RAYS', 'Raydium X'],
  ['PLAY', 'PlayDApp'],
  ['BTC', 'Bitcoin'],
  ['ETH', 'Ethereum'],
  ['SOL', 'Solana'],
  ['ARB', 'Arbitrum'],
  ['OP', 'Optimism'],
  ['SUI', 'Sui Net'],
  ['APT', 'Aptos'],
  ['SEI', 'Sei Labs'],
  ['TIA', 'Celestia'],
  ['PEPE', 'PepeCoin'],
  ['WIF', 'Dogwifhat'],
  ['BONK', 'Bonk Inu'],
  ['FLOKI', 'Floki X'],
  ['JUP', 'Jupiter'],
  ['PYTH', 'Pyth Net'],
  ['RNDR', 'Render'],
  ['INJ', 'Injective'],
  ['FET', 'Fetch AI'],
  ['TAO', 'Bittensor'],
  ['AKT', 'Akash'],
  ['GRT', 'The Graph'],
  ['LDO', 'Lido DAO'],
  ['MKR', 'Maker'],
  ['AAVE', 'Aave'],
  ['UNI', 'Uniswap'],
  ['CRV', 'Curve'],
  ['SNX', 'Synthetix'],
  ['DYDX', 'dYdX'],
  ['GMX', 'GMX Pro'],
  ['ENA', 'Ethena'],
  ['ONDO', 'Ondo Fin'],
  ['STRK', 'Starknet'],
  ['ZK', 'zkSync'],
  ['BLUR', 'Blur NFT'],
  ['MANTA', 'Manta Net'],
  ['ALT', 'AltLayer'],
  ['DYM', 'Dymension'],
  ['PIXL', 'Pixels'],
  ['PORT', 'Portal'],
  ['AXL', 'Axelar'],
  ['METIS', 'Metis DAO'],
  ['KAVA', 'Kava Net'],
]

const ALL_TAGS: Token['tags'] = ['Alpha', 'FOMO', '异常活跃', '利多', '合约']

export function getTokens(): Token[] {
  return SYMBOLS.map(([symbol, name], i) => {
    const rng = mulberry32(i * 7919 + 13)
    const trendRoll = rng()
    const trend: Token['trend'] =
      trendRoll > 0.62 ? 'bull' : trendRoll > 0.32 ? 'shock' : 'bear'
    const base = [0.1421, 0.5715, 0.1231, 1.02, 0.0007469, 0.2071][i % 6]
    const price = +(base * (0.6 + rng() * 4)).toFixed(base < 0.01 ? 6 : 4)
    const dir = trend === 'bull' ? 1 : trend === 'bear' ? -1 : rng() > 0.5 ? 1 : -1
    const mk = (scale: number) =>
      +(dir * (rng() * scale) - (trend === 'shock' ? scale / 2 : 0)).toFixed(2)
    const tagCount = 1 + Math.floor(rng() * 3)
    const tags = [...ALL_TAGS]
      .sort(() => rng() - 0.5)
      .slice(0, tagCount) as Token['tags']
    return {
      id: symbol.toLowerCase(),
      symbol,
      name,
      price,
      marketCap: Math.round((rng() * 2 + 0.1) * 1e8),
      volume24h: Math.round((rng() * 8 + 0.2) * 1e7),
      change1h: mk(8),
      change24h: +(dir * rng() * (trend === 'bull' ? 120 : 60)).toFixed(2),
      change7d: +(dir * rng() * 200).toFixed(2),
      change30d: +(dir * rng() * 600).toFixed(2),
      hue: Math.round(rng() * 360),
      tags,
      anomalyScore: Math.round(40 + rng() * 60),
      trend,
    }
  })
}

export function getToken(id: string): Token | undefined {
  return getTokens().find((t) => t.id === id)
}

export type Candle = {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

// 生成 K 线数据
export function getCandles(seed: number, count = 80, startPrice = 0.06): Candle[] {
  const rng = mulberry32(seed)
  const candles: Candle[] = []
  let price = startPrice
  const now = Date.now()
  for (let i = 0; i < count; i++) {
    // 后段制造一波拉升，模拟"异动"
    const phase = i / count
    const drift =
      phase > 0.6 ? (phase - 0.6) * 0.06 : (rng() - 0.5) * 0.012
    const o = price
    const move = drift + (rng() - 0.48) * 0.03
    let c = +(o * (1 + move)).toFixed(6)
    if (c <= 0) c = o * 0.98
    const h = +(Math.max(o, c) * (1 + rng() * 0.02)).toFixed(6)
    const l = +(Math.min(o, c) * (1 - rng() * 0.02)).toFixed(6)
    const v = Math.round((rng() * 0.8 + 0.2) * (phase > 0.6 ? 3 : 1) * 1e6)
    candles.push({ t: now - (count - i) * 3600_000 * 4, o, h, l, c, v })
    price = c
  }
  return candles
}

export type Signal = {
  id: string
  time: string
  type: 'bull' | 'bear' | 'neutral'
  title: string
  body: string
  tags: string[]
}

export function getSignals(symbol: string, price: number): Signal[] {
  const tpl: Omit<Signal, 'id' | 'time'>[] = [
    {
      type: 'bull',
      title: `${symbol} 合约资金异常活跃，疑似主力进场`,
      body: `${symbol} 主力资金持续净流入，24 小时涨跌幅 +92.03%，现报 $${price}，短期或延续上涨，但需注意高位风险。`,
      tags: ['Alpha', '异常活跃', '利多', '合约'],
    },
    {
      type: 'bull',
      title: `${symbol} 大额买单聚集，链上换手率飙升`,
      body: `检测到 ${symbol} 链上换手率在 30 分钟内放大 4.2 倍，FOMO 情绪升温，趋势强度增强。`,
      tags: ['FOMO', '异常活跃', '合约'],
    },
    {
      type: 'neutral',
      title: `${symbol} 上涨趋势减弱，注意止盈`,
      body: `${symbol} 主力资金流入放缓，现报 $${price}，建议关注 4H 级别的支撑位，保护本金。`,
      tags: ['趋势减弱', '合约'],
    },
    {
      type: 'bear',
      title: `${symbol} 出现大额转入交易所，警惕砸盘`,
      body: `监测到 ${symbol} 有大额代币转入交易所地址，存在抛压释放风险，请谨慎追高。`,
      tags: ['风险', '砸盘风险'],
    },
  ]
  const times = ['12:20', '12:10', '12:05', '11:40']
  return tpl.map((s, i) => ({ ...s, id: `${symbol}-${i}`, time: times[i] }))
}

// ===== 异动雷达信号卡 =====
export type SignalType = 'PUMP' | 'WHALE' | 'LIQ' | 'BREAK' | 'FLOW' | 'CRASH'

// 雷达分类：狙击榜=优质机会（多/空），其余为候选与观察
export type SignalCategory = 'sniper' | 'bull' | 'bear' | 'watch'

// 候选信号池状态（9 类，含全部）
export type PoolStatus =
  | 'long' // 多头候选
  | 'short' // 空头候选
  | 'waiting' // 等待确认
  | 'near' // 接近触发
  | 'high_risk' // 高风险勿追
  | 'low_odds' // 赔率不足
  | 'insufficient' // 数据不足
  | 'expired' // 已失效

export const POOL_META: Record<
  PoolStatus,
  { label: string; tone: 'up' | 'down' | 'warn' | 'muted' | 'neon' }
> = {
  long: { label: '多头候选', tone: 'up' },
  short: { label: '空头候选', tone: 'down' },
  waiting: { label: '等待确认', tone: 'neon' },
  near: { label: '接近触发', tone: 'warn' },
  high_risk: { label: '高风险勿追', tone: 'down' },
  low_odds: { label: '赔率不足', tone: 'muted' },
  insufficient: { label: '数据不足', tone: 'muted' },
  expired: { label: '已失效', tone: 'muted' },
}

export type SignalCard = {
  id: string
  token: Token
  type: SignalType
  category: SignalCategory
  poolStatus: PoolStatus
  score: number // 信号评分 0-100
  riskLevel: '低' | '中' | '高' | '极高'
  odds: number // 盈亏比
  ageMin: number
  exchange: string
  market: '现货' | '合约'
  volMult: number
  desc: string
  starred: boolean
  // ===== 表格展示字段 =====
  firstPush: string // 首次推送时间 MM/DD HH:mm
  lastPush: string // 最新推送时间
  pushPrice: number // 推送价格
  bullSentiment: number // 看涨情绪 0-100
  shortAnomaly: number // 短线异动数
  trendAnomaly: number // 趋势异动数
}

// 基于种子确定性生成 "MM/DD HH:mm" 时间串（避免使用 Date.now 破坏 SSR 一致性）
function fmtTime(dayOffset: number, minOfDay: number): string {
  const day = 20 - dayOffset
  const hh = String(Math.floor(minOfDay / 60)).padStart(2, '0')
  const mm = String(minOfDay % 60).padStart(2, '0')
  return `06/${String(day).padStart(2, '0')} ${hh}:${mm}`
}

const EXCHANGES = ['Binance', 'OKX', 'Coinbase', 'Bybit', 'Bitget']

const TYPE_DESC: Record<SignalType, (s: string, m: number, amt: number) => string> = {
  PUMP: (s, m) => `买单异常涌入，15 分钟成交量激增 ${m} 倍，主力建仓迹象明显`,
  WHALE: (s, m, amt) => `单笔大额转入约 ${amt} 万美元，疑似机构建仓`,
  LIQ: () => `1 小时内空单爆仓超 4,200 万美元，多空比急剧逆转`,
  BREAK: () => `放量突破前高关键阻力位，技术面转强，趋势确认`,
  FLOW: () => `链上净流入持续增加，资金活跃度显著抬升`,
  CRASH: () => `短时大额转入交易所，盘口买盘撤离，警惕闪崩风险`,
}

const TYPES: SignalType[] = ['PUMP', 'WHALE', 'LIQ', 'BREAK', 'FLOW', 'CRASH']

export function getSignalCards(): SignalCard[] {
  const tokens = getTokens()
  return tokens.map((t, i) => {
    const rng = mulberry32(i * 1597 + 41)
    // 依据趋势/标签确定性地分配信号类型
    let type: SignalType
    if (t.trend === 'bear') type = rng() > 0.5 ? 'LIQ' : 'CRASH'
    else if (t.change24h > 60) type = 'PUMP'
    else if (t.marketCap > 1.4e8 && rng() > 0.5) type = 'WHALE'
    else type = TYPES[Math.floor(rng() * 4) + 1] // WHALE/LIQ/BREAK/FLOW
    const volMult = +(2 + rng() * 7).toFixed(1)
    const whaleAmt = Math.round(800 + rng() * 4000)
    // 分类：高异动强度=狙击榜（优质机会，多空皆可），其余按方向分入候选/观察
    let category: SignalCategory
    if (t.anomalyScore >= 82) category = 'sniper'
    else if (t.trend === 'bull') category = 'bull'
    else if (t.trend === 'bear') category = 'bear'
    else category = 'watch'
    const pushPrice = +(t.price / (1 + t.change24h / 100)).toFixed(
      t.price < 0.01 ? 6 : 4,
    )
    const bullSentiment =
      t.trend === 'bull'
        ? Math.round(62 + rng() * 36)
        : t.trend === 'bear'
          ? Math.round(8 + rng() * 30)
          : Math.round(40 + rng() * 22)
    const score = Math.round(t.anomalyScore * 0.6 + bullSentiment * 0.4)
    const odds = +(0.6 + rng() * 3.4).toFixed(1)
    // 候选池状态：确定性分配，覆盖 8 类
    const statusRoll = rng()
    let poolStatus: PoolStatus
    if (t.anomalyScore < 50) poolStatus = 'insufficient'
    else if (score < 45) poolStatus = 'low_odds'
    else if (t.trend === 'bear' && t.anomalyScore > 80) poolStatus = 'high_risk'
    else if (statusRoll < 0.12) poolStatus = 'expired'
    else if (statusRoll < 0.32) poolStatus = 'near'
    else if (statusRoll < 0.5) poolStatus = 'waiting'
    else if (t.trend === 'bear') poolStatus = 'short'
    else poolStatus = 'long'
    const riskLevel: SignalCard['riskLevel'] =
      poolStatus === 'high_risk'
        ? '极高'
        : t.anomalyScore > 78
          ? '高'
          : t.anomalyScore > 60
            ? '中'
            : '低'
    return {
      id: `sig-${t.id}`,
      token: t,
      type,
      category,
      poolStatus,
      score,
      riskLevel,
      odds,
      ageMin: Math.floor(1 + rng() * 58),
      exchange: EXCHANGES[Math.floor(rng() * EXCHANGES.length)],
      market: rng() > 0.5 ? '合约' : '现货',
      volMult,
      desc: TYPE_DESC[type](t.symbol, volMult, whaleAmt),
      starred: false,
      firstPush: fmtTime(1 + Math.floor(rng() * 2), Math.floor(rng() * 1440)),
      lastPush: fmtTime(0, Math.floor(720 + rng() * 120)),
      pushPrice,
      bullSentiment,
      shortAnomaly: Math.floor(rng() * 20),
      trendAnomaly: Math.floor(rng() * 18),
    }
  })
}

export function fmtCap(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`
  if (n >= 1e4) return `${(n / 1e4).toFixed(2)}万`
  return `${n}`
}

export function fmtUsd(n: number): string {
  if (n < 0.01) return n.toPrecision(4)
  if (n < 1) return n.toFixed(4)
  if (n < 1000) return n.toFixed(2)
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

// ============================================================
// 扫描状态 / 全市场覆盖证明
// ============================================================
export type ScanState = {
  coverage: number // 全市场覆盖率 %
  scanned: number // 已扫描
  pending: number // 待扫描
  total: number
  batch: number // 当前批次
  totalBatches: number
  nextBatchSec: number // 下一批倒计时秒
  budgetUsed: number // 今日扫描预算已用
  budgetTotal: number
  freshnessSec: number // 数据新鲜度（秒前）
  mode: '轻扫' | '深扫'
}

export function getScanState(): ScanState {
  const total = SYMBOLS.length * 47 // 模拟更大市场
  const scanned = Math.round(total * 0.876)
  return {
    coverage: 87.6,
    scanned,
    pending: total - scanned,
    total,
    batch: 34,
    totalBatches: 39,
    nextBatchSec: 42,
    budgetUsed: 12840,
    budgetTotal: 20000,
    freshnessSec: 8,
    mode: '深扫',
  }
}

export type ExchangeStatus = {
  name: string
  status: 'online' | 'degraded' | 'down'
  latencyMs: number
  coverage: number
}

export function getExchangeCoverage(): ExchangeStatus[] {
  return [
    { name: 'Binance', status: 'online', latencyMs: 42, coverage: 99.8 },
    { name: 'OKX', status: 'online', latencyMs: 61, coverage: 98.2 },
    { name: 'Bybit', status: 'online', latencyMs: 88, coverage: 96.5 },
    { name: 'Coinbase', status: 'degraded', latencyMs: 240, coverage: 81.0 },
    { name: 'Bitget', status: 'online', latencyMs: 73, coverage: 94.7 },
    { name: 'Gate', status: 'down', latencyMs: 0, coverage: 0 },
  ]
}

// ============================================================
// 大盘环境
// ============================================================
export type MarketEnv = {
  btc: { price: number; change: number; state: '强势' | '震荡' | '弱势' }
  eth: { price: number; change: number; state: '强势' | '震荡' | '弱势' }
  altStrength: number // 山寨强弱 0-100
  regime: '顺风' | '逆风' | '震荡'
  leverageCrowding: number // 杠杆拥挤度 0-100
  deleverageRisk: '低' | '中' | '高'
  session: '亚洲盘' | '伦敦盘' | '纽约盘'
  fearGreed: number
}

export function getMarketEnv(): MarketEnv {
  return {
    btc: { price: 63425.6, change: 1.61, state: '强势' },
    eth: { price: 3417.61, change: -0.44, state: '震荡' },
    altStrength: 64,
    regime: '顺风',
    leverageCrowding: 78,
    deleverageRisk: '中',
    session: '伦敦盘',
    fearGreed: 72,
  }
}

// ============================================================
// 数据质量
// ============================================================
export type DataQuality = {
  raw: number
  cleaned: number
  duplicates: number
  filtered: number
  missing: number
  delayMs: number
  degraded: boolean
  trust: number // 可信度 0-100
}

export function getDataQuality(): DataQuality {
  return {
    raw: 184320,
    cleaned: 176508,
    duplicates: 5120,
    filtered: 2692,
    missing: 318,
    delayMs: 240,
    degraded: false,
    trust: 96,
  }
}

// ============================================================
// CoinGlass 衍生品数据
// ============================================================
export type CoinglassData = {
  oiChange: number // OI 持仓变化 %
  funding: number // 资金费率 %
  longShortRatio: number // 多空比
  takerBuySell: number // 主动买卖比
  futVolume: number // 合约成交量（美元）
  crowding: '低' | '中' | '高'
  apiQuotaUsed: number
  apiQuotaTotal: number
}

export function getCoinglass(): CoinglassData {
  return {
    oiChange: 8.4,
    funding: 0.0125,
    longShortRatio: 1.84,
    takerBuySell: 1.32,
    futVolume: 4.83e10,
    crowding: '高',
    apiQuotaUsed: 3420,
    apiQuotaTotal: 5000,
  }
}

// ============================================================
// 系统健康
// ============================================================
export type ServiceHealth = {
  name: string
  status: 'healthy' | 'degraded' | 'down'
  detail: string
  uptime: number
}

export function getSystemHealth(): ServiceHealth[] {
  return [
    { name: '数据源 · 交易所 API', status: 'healthy', detail: '6 路中 5 路在线', uptime: 99.92 },
    { name: '数据库 · PostgreSQL', status: 'healthy', detail: '主从同步正常 · 延迟 12ms', uptime: 99.99 },
    { name: '缓存 · Redis', status: 'healthy', detail: '命中率 98.4% · 内存 62%', uptime: 99.97 },
    { name: '扫描 · Worker 集群', status: 'degraded', detail: '8 节点中 1 节点重启中', uptime: 99.40 },
    { name: '接口 · API Gateway', status: 'healthy', detail: 'P95 86ms · QPS 1.2k', uptime: 99.95 },
    { name: '调度 · Scan Scheduler', status: 'healthy', detail: '下一批 42s 后触发', uptime: 99.88 },
  ]
}

export type SystemError = { time: string; level: 'warn' | 'error'; msg: string }
export function getRecentErrors(): SystemError[] {
  return [
    { time: '13:42:08', level: 'warn', msg: 'Gate.io 行情流断开，已切换备用源' },
    { time: '13:30:51', level: 'warn', msg: 'Worker-7 内存占用 89%，触发软重启' },
    { time: '12:58:14', level: 'error', msg: 'Coinbase 深度接口超时（240ms）3 次，降级处理' },
    { time: '12:11:02', level: 'warn', msg: 'CoinGlass API 额度使用达 68%' },
  ]
}

// ============================================================
// 告警中心
// ============================================================
export type AlertKind = 'near' | 'triggered' | 'high_risk' | 'data' | 'scan_fail' | 'review_due'
export type Alert = {
  id: string
  kind: AlertKind
  symbol?: string
  title: string
  body: string
  time: string
  read: boolean
}

const ALERT_KIND_META: Record<AlertKind, { label: string; tone: 'up' | 'down' | 'warn' | 'neon' | 'muted' }> = {
  near: { label: '接近触发', tone: 'warn' },
  triggered: { label: '已触发', tone: 'up' },
  high_risk: { label: '高风险提醒', tone: 'down' },
  data: { label: '数据异常', tone: 'warn' },
  scan_fail: { label: '扫描失败', tone: 'down' },
  review_due: { label: '复盘到期', tone: 'neon' },
}
export { ALERT_KIND_META }

export function getAlerts(): Alert[] {
  const raw: Omit<Alert, 'id'>[] = [
    { kind: 'triggered', symbol: 'DOGS', title: 'DOGS 触发多头入场条件', body: '价格突破关键位 $0.0392 并放量站稳，建议关注首仓入场区间。', time: '13:48', read: false },
    { kind: 'near', symbol: 'TIA', title: 'TIA 接近触发（差 1.2%）', body: '距多头触发位仅 1.2%，量能温和放大，请留意确认信号。', time: '13:41', read: false },
    { kind: 'high_risk', symbol: 'ZEC', title: 'ZEC 高位风险升级', body: '资金费率转正且 OI 拥挤，追多风险显著上升，建议规避。', time: '13:33', read: false },
    { kind: 'data', title: 'Coinbase 数据延迟', body: '深度接口延迟达 240ms，相关币种数据可信度下调。', time: '13:20', read: true },
    { kind: 'scan_fail', title: 'Gate.io 扫描失败', body: '行情流断开，该交易所暂时退出覆盖，已自动切换备用源。', time: '13:05', read: true },
    { kind: 'review_due', symbol: 'PEPE', title: 'PEPE 复盘到期', body: '该信号已满 24 小时，等待你的复盘标注（命中/失败/漏判）。', time: '12:50', read: true },
    { kind: 'triggered', symbol: 'WIF', title: 'WIF 触发空头条件', body: '跌破支撑 $1.82 且主力净流出，空头结构确认。', time: '12:31', read: true },
  ]
  return raw.map((a, i) => ({ ...a, id: `al-${i}` }))
}

// ============================================================
// 每日异动榜复盘
// ============================================================
export type ReviewRow = {
  symbol: string
  hue: number
  change: number
  reason: string
  preEvent: string
  radarCaught: boolean
  missReason?: string
}

export function getDailyReview(): { gainers: ReviewRow[]; losers: ReviewRow[] } {
  return {
    gainers: [
      { symbol: 'SYN', hue: 280, change: 128.24, reason: '生态空投预期 + 主力合约建仓', preEvent: '上涨前 2 小时链上换手率放大 4.2 倍', radarCaught: true },
      { symbol: 'BTW', hue: 130, change: 91.49, reason: 'CEX 上线消息发酵，FOMO 资金涌入', preEvent: '上涨前出现连续大额买单聚集', radarCaught: true },
      { symbol: 'RE', hue: 20, change: 85.87, reason: '叙事轮动，板块资金切换', preEvent: '盘前社交媒体热度骤增', radarCaught: false, missReason: '社媒情绪源未接入，仅靠链上信号未达阈值' },
      { symbol: 'BICO', hue: 30, change: 33.62, reason: '回购销毁公告', preEvent: '公告前 OI 缓步抬升', radarCaught: true },
    ],
    losers: [
      { symbol: 'DOT', hue: 330, change: -12.45, reason: '解锁抛压 + 大盘回调', preEvent: '下跌前大额转入交易所', radarCaught: true },
      { symbol: 'ORDI', hue: 40, change: -9.82, reason: '板块降温，获利盘了结', preEvent: '高位放量滞涨', radarCaught: true },
      { symbol: 'JTO', hue: 200, change: -7.31, reason: '做市商撤单，流动性收缩', preEvent: '盘口买墙快速撤离', radarCaught: false, missReason: '盘口快照频率不足，撤单发生在两帧之间' },
    ],
  }
}

// ============================================================
// 扫描回放（历史扫描帧）
// ============================================================
export type ScanFrame = {
  time: string
  added: string[]
  removed: string[]
  changed: { symbol: string; from: string; to: string }[]
  candidates: number
}

export function getScanFrames(): ScanFrame[] {
  return [
    { time: '13:45', added: ['DOGS', 'TIA'], removed: ['ARB'], changed: [{ symbol: 'PEPE', from: '等待确认', to: '接近触发' }], candidates: 42 },
    { time: '13:30', added: ['WIF'], removed: [], changed: [{ symbol: 'DOGS', from: '接近触发', to: '多头候选' }], candidates: 41 },
    { time: '13:15', added: ['BTW', 'SYN'], removed: ['OP', 'SUI'], changed: [], candidates: 40 },
    { time: '13:00', added: [], removed: ['INJ'], changed: [{ symbol: 'ZEC', from: '多头候选', to: '高风险勿追' }], candidates: 40 },
    { time: '12:45', added: ['REI'], removed: [], changed: [{ symbol: 'TIA', from: '数据不足', to: '等待确认' }], candidates: 41 },
  ]
}

// ============================================================
// 交易日记
// ============================================================
export type JournalEntry = {
  id: string
  symbol: string
  hue: number
  status: '观察中' | '已入场' | '已离场' | '已拒绝'
  plan: string
  stop: string
  target: string
  result?: string
  note: string
  time: string
}

export function getJournal(): JournalEntry[] {
  return [
    { id: 'j1', symbol: 'DOGS', hue: 35, status: '已入场', plan: '$0.0392 突破回踩入场', stop: '$0.0361 (-7.9%)', target: 'T1 $0.045 / T2 $0.052', result: '持仓中 +6.2%', note: '量能配合良好，已移动止损至成本', time: '06/20 13:50' },
    { id: 'j2', symbol: 'TIA', hue: 220, status: '观察中', plan: '等待站稳 $9.2 再入场', stop: '$8.6', target: 'T1 $10.5', note: '接近触发，等待确认放量', time: '06/20 13:41' },
    { id: 'j3', symbol: 'ZEC', hue: 50, status: '已拒绝', plan: '—', stop: '—', target: '—', result: '拒绝追单', note: '高位 + 资金费率过热，赔率不足，放弃', time: '06/20 13:33' },
    { id: 'j4', symbol: 'WIF', hue: 280, status: '已离场', plan: '空头跌破 $1.82', stop: '$1.91', target: 'T1 $1.65', result: '已止盈 +9.8%', note: '到达 T1 减仓，结构走完离场', time: '06/20 12:31' },
  ]
}

// ============================================================
// 复盘进化样本
// ============================================================
export type EvolutionStat = {
  hit: number
  fail: number
  miss: number
  total: number
  winRate: number
  avgOdds: number
  ruleEffectiveness: { rule: string; effectiveness: number; samples: number }[]
}

export function getEvolution(): EvolutionStat {
  return {
    hit: 168,
    fail: 74,
    miss: 23,
    total: 265,
    winRate: 63.4,
    avgOdds: 2.3,
    ruleEffectiveness: [
      { rule: '链上换手率放大 > 3x', effectiveness: 78, samples: 92 },
      { rule: '合约 OI 异常抬升', effectiveness: 71, samples: 120 },
      { rule: '大额买单聚集', effectiveness: 66, samples: 84 },
      { rule: '突破前高放量', effectiveness: 61, samples: 103 },
      { rule: '情绪 FOMO 升温', effectiveness: 54, samples: 67 },
      { rule: '资金费率背离', effectiveness: 48, samples: 41 },
    ],
  }
}

// ============================================================
// 每日复盘报告（今日 / 昨日）
// ============================================================
export type DailyReport = {
  key: 'today' | 'yesterday'
  label: string
  date: string
  weekday: string
  marketMood: '进攻' | '震荡' | '防守'
  // 核心指标
  signalsPushed: number
  sniperLocked: number
  hit: number
  fail: number
  miss: number
  winRate: number
  avgOdds: number
  bestCall: { symbol: string; hue: number; side: '多' | '空'; change: number; note: string }
  worstCall: { symbol: string; hue: number; side: '多' | '空'; change: number; note: string }
  hotSectors: { name: string; strength: number }[]
  highlights: string[]
  lessons: string[]
  summary: string
}

export function getDailyReports(): DailyReport[] {
  return [
    {
      key: 'today',
      label: '今日报告',
      date: '06/21',
      weekday: '周六',
      marketMood: '进攻',
      signalsPushed: 47,
      sniperLocked: 6,
      hit: 19,
      fail: 6,
      miss: 3,
      winRate: 76,
      avgOdds: 2.8,
      bestCall: { symbol: 'SYN', hue: 280, side: '多', change: 128.24, note: '空投预期 + 主力建仓，雷达提前 2 小时锁定' },
      worstCall: { symbol: 'JTO', hue: 200, side: '空', change: 4.1, note: '做市撤单回补，止损离场 -3.2%' },
      hotSectors: [
        { name: 'AI Agent', strength: 92 },
        { name: 'MEME', strength: 78 },
        { name: 'RWA', strength: 64 },
        { name: 'DeFi', strength: 47 },
      ],
      highlights: [
        '狙击榜 6 个目标 5 个兑现，方向判断保持高水准',
        'AI Agent 板块轮动捕捉及时，SYN 单笔贡献最大收益',
        '链上换手率放大规则今日有效性达 81%',
      ],
      lessons: [
        'JTO 空头在做市撤单后未及时回补，盘口快照频率仍需加密',
        '尾盘 FOMO 情绪追单 1 次，纪律执行可更严格',
      ],
      summary:
        '市场情绪偏进攻，热点集中在 AI Agent 与 MEME。系统当日命中率 76%，狙击榜表现稳定。需注意尾盘情绪过热时的追单冲动，严守计划入场。',
    },
    {
      key: 'yesterday',
      label: '昨日复盘报告',
      date: '06/20',
      weekday: '周五',
      marketMood: '震荡',
      signalsPushed: 39,
      sniperLocked: 4,
      hit: 14,
      fail: 8,
      miss: 5,
      winRate: 64,
      avgOdds: 2.1,
      bestCall: { symbol: 'DOGS', hue: 35, side: '多', change: 33.6, note: '突破回踩入场，移动止损至成本后吃满主升段' },
      worstCall: { symbol: 'RE', hue: 20, side: '多', change: 85.87, note: '社媒情绪未接入导致漏判，错失主升浪' },
      hotSectors: [
        { name: 'MEME', strength: 71 },
        { name: 'Bitcoin L2', strength: 58 },
        { name: 'AI Agent', strength: 55 },
        { name: 'GameFi', strength: 39 },
      ],
      highlights: [
        'DOGS 全程跟踪到位，移动止损策略锁定利润',
        '震荡市保持耐心，拒绝了 ZEC 等 3 个低赔率追单',
      ],
      lessons: [
        'RE 因社媒情绪源未接入而漏判，需尽快补齐数据维度',
        '震荡市命中率回落至 64%，应降低仓位、提高赔率门槛',
        '盘口撤单类漏判仍是主要失分项',
      ],
      summary:
        '市场全天震荡，热点切换频繁。系统命中率 64% 低于均值，主要失分来自社媒情绪漏判与盘口撤单。震荡市策略应以低仓位、高赔率、强纪律为主。',
    },
  ]
}

// ============================================================
// 单币信号档案（证据链 / 反证 / 关键位 / 失效条件 / 计划）
// ============================================================
export type TokenArchive = {
  direction: '看多' | '看空' | '中性'
  score: number
  risk: '低' | '中' | '高' | '极高'
  evidence: { label: string; weight: number; detail: string }[]
  counterEvidence: { label: string; detail: string }[]
  keyLevels: { support: number; resistance: number; invalidation: number; targets: number[] }
  invalidation: string
  plan: {
    bias: string
    entry: string
    stop: string
    targets: string
    position: string
  }
}

export function getTokenArchive(t: Token): TokenArchive {
  const rng = mulberry32(t.symbol.length * 131 + Math.round(t.price))
  const dir = t.trend === 'bull' ? '看多' : t.trend === 'bear' ? '看空' : '中性'
  const p = t.price
  const support = +(p * 0.92).toFixed(p < 0.01 ? 6 : 4)
  const resistance = +(p * 1.12).toFixed(p < 0.01 ? 6 : 4)
  const invalidation = +(p * 0.86).toFixed(p < 0.01 ? 6 : 4)
  return {
    direction: dir,
    score: Math.round(t.anomalyScore * 0.6 + (dir === '看多' ? 30 : 12)),
    risk: t.anomalyScore > 80 ? '高' : t.anomalyScore > 60 ? '中' : '低',
    evidence: [
      { label: '链上换手率放大 4.2x', weight: 32, detail: '30 分钟内换手率从 0.8% 升至 3.4%，资金活跃度显著抬升' },
      { label: '合约 OI 抬升 +8.4%', weight: 26, detail: '未平仓合约持续增加，多头持仓占优' },
      { label: '大额买单聚集', weight: 22, detail: `检测到 ${Math.round(3 + rng() * 6)} 笔 >50 万美元买单` },
      { label: '突破前高放量', weight: 20, detail: '放量突破 4H 级别前高，技术面转强' },
    ],
    counterEvidence: [
      { label: '资金费率偏高', detail: '当前 +0.0125%，多头拥挤，存在回调风险' },
      { label: '距上方套牢区较近', detail: `上方 ${resistance} 为前期密集成交区，抛压偏重` },
    ],
    keyLevels: {
      support,
      resistance,
      invalidation,
      targets: [
        +(p * 1.08).toFixed(p < 0.01 ? 6 : 4),
        +(p * 1.22).toFixed(p < 0.01 ? 6 : 4),
        +(p * 1.4).toFixed(p < 0.01 ? 6 : 4),
      ],
    },
    invalidation: `4H 收盘跌破 ${invalidation}，或量能萎缩至均量 50% 以下，则信号失效`,
    plan: {
      bias: dir === '看空' ? '逢高做空' : '回踩做多',
      entry: `${support} ~ ${p} 区间分批`,
      stop: `${invalidation} (-${(((p - invalidation) / p) * 100).toFixed(1)}%)`,
      targets: `T1 ${(p * 1.08).toFixed(p < 0.01 ? 6 : 4)} / T2 ${(p * 1.22).toFixed(p < 0.01 ? 6 : 4)} / T3 ${(p * 1.4).toFixed(p < 0.01 ? 6 : 4)}`,
      position: '首仓 30%，确认后加至 60%，单笔风险 ≤ 总仓位 2%',
    },
  }
}
