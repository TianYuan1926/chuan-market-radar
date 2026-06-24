export type Token = {
  id: string
  symbol: string
  name: string
  price: number
  marketCap: number
  volume24h: number
  change1h: number
  change24h: number
  change7d: number
  change30d: number
  hue: number
  tags: ('Alpha' | 'FOMO' | '异常活跃' | '利多' | '合约')[]
  anomalyScore: number
  trend: 'bull' | 'bear' | 'shock'
}

export type SignalType = 'PUMP' | 'WHALE' | 'LIQ' | 'BREAK' | 'FLOW' | 'CRASH'

export type SignalCategory = 'sniper' | 'bull' | 'bear' | 'watch'

export type PoolStatus =
  | 'long'
  | 'short'
  | 'waiting'
  | 'near'
  | 'high_risk'
  | 'low_odds'
  | 'insufficient'
  | 'expired'

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
  maturity:
    | 'LIGHT_SCAN_MARK'
    | 'DEEP_SCAN_CANDIDATE'
    | 'EVIDENCE_SIGNAL'
    | 'TRADE_PLAN_READY'
    | 'BLOCKED'
    | 'INVALIDATED'
    | 'COOLDOWN'
  sourceKind: 'backend_signal' | 'leaderboard_candidate'
  poolStatus: PoolStatus
  score: number
  riskLevel: '低' | '中' | '高' | '极高'
  odds: number
  ageMin: number
  exchange: string
  market: '现货' | '合约'
  volMult: number
  desc: string
  starred: boolean
  firstPush: string
  lastPush: string
  pushPrice: number
  bullSentiment: number
  shortAnomaly: number
  trendAnomaly: number
}

export type Signal = {
  id: string
  time: string
  type: 'bull' | 'bear' | 'neutral'
  title: string
  body: string
  tags: string[]
}

export type ScanState = {
  coverage: number
  scanned: number
  pending: number
  total: number
  batch: number
  totalBatches: number
  nextBatchSec: number
  budgetUsed: number
  budgetTotal: number
  freshnessSec: number
  mode: '轻扫' | '深扫'
}

export type ExchangeStatus = {
  name: string
  status: 'online' | 'degraded' | 'down'
  latencyMs: number | null
  coverage: number
}

export type MarketEnv = {
  btc: { price: number; change: number; state: '强势' | '震荡' | '弱势' }
  eth: { price: number; change: number; state: '强势' | '震荡' | '弱势' }
  altStrength: number
  regime: '顺风' | '逆风' | '震荡'
  leverageCrowding: number
  deleverageRisk: '低' | '中' | '高'
  session: '亚洲盘' | '伦敦盘' | '纽约盘'
  fearGreed: number
}

export type DataQuality = {
  raw: number
  cleaned: number
  duplicates: number
  filtered: number
  missing: number
  delayMs: number
  degraded: boolean
  trust: number
}

export type CoinglassData = {
  oiChange: number
  funding: number
  longShortRatio: number
  takerBuySell: number
  futVolume: number
  crowding: '低' | '中' | '高'
  apiQuotaUsed: number
  apiQuotaTotal: number
}

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
