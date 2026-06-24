import type {
  CoinglassData,
  DataQuality,
  ExchangeStatus,
  MarketEnv,
  PoolStatus,
  ScanState,
  Signal,
  SignalCard,
  SignalCategory,
  SignalType,
  Token,
} from './frontend-market-types'
import type {
  ApiUsageState,
  DataSourceState,
  DerivativesState,
  LeaderboardKind,
  LeaderboardRow,
  MacroAltEnv,
  RadarSignal,
  ScanProofData,
} from './radar-contract'
import type { SniperSignal, SniperTarget } from './sniper-data'
import type { Resource } from './data-status'

type Direction = RadarSignal['direction']
type Maturity = RadarSignal['maturity']
type TickerRows = LeaderboardRow[]
type TickerLookup = Map<string, LeaderboardRow>

const RISK_PENALTY: Record<RadarSignal['risk'], number> = {
  低: 0,
  中: 8,
  高: 18,
  极高: 32,
}

const MATURITY_BONUS: Record<Maturity, number> = {
  LIGHT_SCAN_MARK: -12,
  DEEP_SCAN_CANDIDATE: 0,
  EVIDENCE_SIGNAL: 12,
  REVIEW_ONLY: -10,
  TRADE_PLAN_READY: 22,
  BLOCKED: -16,
  INVALIDATED: -28,
  COOLDOWN: -18,
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function positiveNumber(value: number | undefined | null) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function priceBySymbol(tickerRows: TickerRows = []) {
  const rows = new Map<string, LeaderboardRow>()

  for (const row of tickerRows) {
    const symbol = row.symbol.toUpperCase()
    if (!rows.has(symbol) && Number.isFinite(row.price) && row.price > 0) {
      rows.set(symbol, row)
    }
  }

  return rows
}

function dedupeSignals(signals: RadarSignal[]) {
  const rows = new Map<string, RadarSignal>()

  for (const signal of signals) {
    const key = signal.symbol.toUpperCase()
    if (!rows.has(key)) rows.set(key, signal)
  }

  return [...rows.values()]
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function scoreFor(signal: RadarSignal) {
  const rrBoost = signal.rr === null ? 0 : clamp(signal.rr * 5, 0, 22)
  const raw =
    42 +
    signal.evidenceCount * 8 -
    signal.counterCount * 7 +
    rrBoost +
    MATURITY_BONUS[signal.maturity] -
    RISK_PENALTY[signal.risk]

  return Math.round(clamp(raw, 8, 99))
}

function typeFor(signal: RadarSignal): SignalType {
  if (signal.maturity === 'INVALIDATED' || signal.direction === '空') return 'CRASH'
  if (signal.maturity === 'BLOCKED') return signal.risk === '极高' ? 'LIQ' : 'WHALE'
  if (signal.maturity === 'REVIEW_ONLY') return 'FLOW'
  if (signal.maturity === 'TRADE_PLAN_READY') return 'BREAK'
  if (signal.maturity === 'EVIDENCE_SIGNAL') return 'FLOW'
  if (signal.maturity === 'DEEP_SCAN_CANDIDATE') return 'WHALE'
  return 'PUMP'
}

function categoryFor(signal: RadarSignal): SignalCategory {
  if (signal.maturity === 'TRADE_PLAN_READY' && signal.rr !== null && signal.rr >= 3 && !signal.whyBlocked) {
    return 'sniper'
  }
  if (signal.direction === '多') return 'bull'
  if (signal.direction === '空') return 'bear'
  return 'watch'
}

function poolStatusFor(signal: RadarSignal): PoolStatus {
  if (signal.maturity === 'INVALIDATED' || signal.maturity === 'COOLDOWN') return 'expired'
  if (signal.maturity === 'REVIEW_ONLY') return 'high_risk'
  if (signal.maturity === 'BLOCKED') {
    if (signal.risk === '高' || signal.risk === '极高') return 'high_risk'
    return 'low_odds'
  }
  if (signal.rr !== null && signal.rr > 0 && signal.rr < 3) return 'low_odds'
  if (signal.maturity === 'LIGHT_SCAN_MARK') return 'insufficient'
  if (signal.maturity === 'DEEP_SCAN_CANDIDATE') return 'waiting'
  if (signal.maturity === 'EVIDENCE_SIGNAL') return 'near'
  if (signal.direction === '空') return 'short'
  if (signal.direction === '多') return 'long'
  return 'waiting'
}

function trendFor(direction: Direction): Token['trend'] {
  if (direction === '多') return 'bull'
  if (direction === '空') return 'bear'
  return 'shock'
}

function tokenFor(
  signal: RadarSignal,
  tickerRows: TickerRows = [],
  tickerLookup: TickerLookup = priceBySymbol(tickerRows),
): Token {
  const symbol = signal.symbol.toUpperCase()
  const score = scoreFor(signal)
  const ticker = tickerLookup.get(symbol)
  const price = positiveNumber(ticker?.price)
  const trend = trendFor(signal.direction)
  const tags: Token['tags'] = ['合约', '异常活跃']

  if (signal.maturity === 'TRADE_PLAN_READY') tags.push('Alpha')
  if (signal.maturity === 'BLOCKED') tags.push('FOMO')
  if (signal.direction === '多') tags.push('利多')

  return {
    id: symbol.toLowerCase(),
    symbol,
    name: `${symbol} / USDT`,
    price,
    marketCap: 0,
    volume24h: Math.round(positiveNumber(ticker?.value)),
    change1h: 0,
    change24h: 0,
    change7d: 0,
    change30d: 0,
    hue: signal.hue,
    tags: [...new Set(tags)] as Token['tags'],
    anomalyScore: clamp(score + signal.evidenceCount * 2 - signal.counterCount * 2, 1, 100),
    trend,
  }
}

function changeForLeaderboardRow(row: LeaderboardRow, kind: LeaderboardKind) {
  if (kind === 'gainers' || kind === 'losers') return row.value
  if (kind === 'relative_strength') return round(row.value / 10, 2)
  if (kind === 'oi_change') return round(row.value / 2, 2)
  return 0
}

function isOverextendedLeaderboardMover(row: LeaderboardRow, kind: LeaderboardKind) {
  return (kind === 'gainers' || kind === 'losers') &&
    !row.hasSignal &&
    Math.abs(row.value) >= 15
}

function maturityForLeaderboardRow(row: LeaderboardRow, kind: LeaderboardKind): Maturity {
  if (row.blocked) return 'BLOCKED'
  if (row.hasSignal) return 'EVIDENCE_SIGNAL'
  if (isOverextendedLeaderboardMover(row, kind)) return 'REVIEW_ONLY'
  if (row.deepScanned || row.inCandidatePool) return 'DEEP_SCAN_CANDIDATE'
  return 'LIGHT_SCAN_MARK'
}

function directionForLeaderboardRow(row: LeaderboardRow, kind: LeaderboardKind): Direction {
  if (kind === 'losers' || row.value < 0) return '空'
  if (kind === 'gainers' || kind === 'relative_strength') return '多'
  return '观察'
}

function whyForLeaderboardRow(row: LeaderboardRow, kind: LeaderboardKind) {
  const metric = {
    gainers: '24h 涨幅靠前',
    losers: '24h 跌幅靠前',
    volume: '成交量/流动性靠前',
    volatility_squeeze: '波动率压缩靠前',
    relative_strength: '相对强弱靠前',
    oi_change: 'OI 异动靠前',
    funding_hot: 'Funding 过热靠前',
  } satisfies Record<LeaderboardKind, string>
  const flags: string[] = []

  if (row.inCandidatePool) flags.push('已进入候选池')
  if (row.deepScanned) flags.push('已完成深扫')
  if (row.awaitingScan) flags.push('等待深扫')
  if (row.hasSignal) flags.push('已有证据融合信号')
  if (row.blocked) flags.push('Risk Gate 拦截')
  if (isOverextendedLeaderboardMover(row, kind)) flags.push('已大幅发生，只做复盘观察，禁止追单')

  return `${metric[kind]}${flags.length ? `；${flags.join('；')}` : '；等待扫描验证'}`
}

export function leaderboardRowsToCandidateSignals(
  rows: LeaderboardRow[],
  kind: LeaderboardKind = 'volume',
): RadarSignal[] {
  return rows.map((row, index) => {
    const symbol = row.symbol.toUpperCase()
    const maturity = maturityForLeaderboardRow(row, kind)
    const evidenceCount = row.hasSignal ? 3 : row.deepScanned ? 2 : row.inCandidatePool ? 1 : 1
    const blocked = row.blocked || maturity === 'BLOCKED'
    const reviewOnly = maturity === 'REVIEW_ONLY'

    return {
      id: `candidate-${kind}-${symbol}`,
      symbol,
      hue: row.hue,
      direction: directionForLeaderboardRow(row, kind),
      maturity,
      rr: null,
      risk: blocked || reviewOnly ? '高' : kind === 'funding_hot' ? '中' : '低',
      evidenceCount,
      counterCount: blocked || reviewOnly ? 2 : 0,
      freshness: 'live',
      whySelected: whyForLeaderboardRow(row, kind),
      whyBlocked: blocked
        ? 'Risk Gate 已标记，不能直接生成交易计划'
        : reviewOnly
          ? '榜单只说明行情已经大幅发生；未完成启动前证据融合，进入复盘样本，不允许追涨追跌。'
        : '候选阶段只代表发现异动，未完成证据融合和 3:1 赔率验证，不能当作交易计划',
      updatedMinAgo: Math.min(index, 59),
    }
  })
}

function displaySignalsFor(
  signals: RadarSignal[],
  tickerRows: TickerRows = [],
  kind: LeaderboardKind = 'volume',
) {
  return dedupeSignals([...signals, ...leaderboardRowsToCandidateSignals(tickerRows, kind)])
}

export function withLeaderboardSignalFallback(
  signals: Resource<RadarSignal[]>,
  tickerRows: TickerRows = [],
  kind: LeaderboardKind = 'volume',
): Resource<RadarSignal[]> {
  const data = displaySignalsFor(signals.data, tickerRows, kind)

  return {
    ...signals,
    data,
    status: data.length > signals.data.length && signals.status === 'empty' ? 'partial' : signals.status,
    source: data.length > signals.data.length
      ? `${signals.source ?? 'signal-worker'}+leaderboard`
      : signals.source,
    reason: data.length > signals.data.length
      ? `${signals.reason ? `${signals.reason}；` : ''}当前无成熟信号时展示全市场候选，候选不等于交易计划`
      : signals.reason,
  }
}

export function leaderboardRowsToTokens(
  rows: LeaderboardRow[],
  kind: LeaderboardKind = 'volume',
): Token[] {
  return rows.map((row) => {
    const symbol = row.symbol.toUpperCase()
    const change24h = changeForLeaderboardRow(row, kind)
    const tags: Token['tags'] = ['合约']

    if (row.hasSignal) tags.push('异常活跃')
    if (row.inCandidatePool) tags.push('Alpha')
    if (change24h > 0) tags.push('利多')
    if (row.blocked) tags.push('FOMO')

    return {
      id: symbol.toLowerCase(),
      symbol,
      name: `${symbol} / USDT`,
      price: positiveNumber(row.price),
      marketCap: 0,
      volume24h: Math.round(kind === 'volume' ? positiveNumber(row.value) : 0),
      change1h: 0,
      change24h,
      change7d: 0,
      change30d: 0,
      hue: row.hue,
      tags: [...new Set(tags)] as Token['tags'],
      anomalyScore: clamp(
        35 +
          Math.min(Math.abs(row.value), 50) +
          (row.hasSignal ? 18 : 0) +
          (row.deepScanned ? 8 : 0),
        1,
        100,
      ),
      trend: change24h > 0 ? 'bull' : change24h < 0 ? 'bear' : 'shock',
    }
  })
}

export function mergeTokensBySymbol(...groups: Token[][]): Token[] {
  const merged = new Map<string, Token>()

  for (const token of groups.flat()) {
    const key = token.symbol.toUpperCase()
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, token)
      continue
    }

    merged.set(key, {
      ...existing,
      ...token,
      price: token.price > 0 ? token.price : existing.price,
      marketCap: Math.max(existing.marketCap, token.marketCap),
      volume24h: Math.max(existing.volume24h, token.volume24h),
      change1h: token.change1h !== 0 ? token.change1h : existing.change1h,
      change24h: token.change24h !== 0 ? token.change24h : existing.change24h,
      change7d: token.change7d !== 0 ? token.change7d : existing.change7d,
      change30d: token.change30d !== 0 ? token.change30d : existing.change30d,
      trend: token.trend !== 'shock' ? token.trend : existing.trend,
      tags: [...new Set([...existing.tags, ...token.tags])] as Token['tags'],
      anomalyScore: Math.max(existing.anomalyScore, token.anomalyScore),
    })
  }

  return [...merged.values()]
}

export function scanProofResourceToScanState(
  scan: Resource<ScanProofData>,
  apiUsage?: Resource<ApiUsageState>,
): ScanState {
  const data = scan.data
  const used = apiUsage?.data.usedToday ?? 0
  const remaining = apiUsage?.data.remainingToday ?? 0
  const totalBudget = Math.max(1, used + remaining)
  const scanned = Math.max(data.lightScanned, data.deepScanned)
  const total = Math.max(data.totalMonitored, data.scannable, scanned + data.awaitingDeepScan)
  const pending = Math.max(0, data.awaitingDeepScan || total - scanned)
  const batchSize = Math.max(1, data.deepScanned || data.lightScanned || 1)

  return {
    coverage: clamp(data.coverage, 0, 100),
    scanned,
    pending,
    total,
    batch: Math.max(1, Math.ceil(scanned / batchSize)),
    totalBatches: Math.max(1, Math.ceil(Math.max(1, data.scannable) / batchSize)),
    nextBatchSec: Math.max(0, data.nextScanCountdownSec),
    budgetUsed: used,
    budgetTotal: totalBudget,
    freshnessSec: Math.max(1, Math.round(scan.ageSec ?? 1)),
    mode: data.deepScanned > 0 ? '深扫' : '轻扫',
  }
}

export function dataSourcesResourceToExchangeCoverage(
  sources: Resource<DataSourceState[]>,
): ExchangeStatus[] {
  const coverageByFeed: Record<DataSourceState['feed'], number> = {
    live: 100,
    cached: 80,
    partial: 65,
    stale: 40,
    failed: 0,
  }
  const statusByFeed: Record<DataSourceState['feed'], ExchangeStatus['status']> = {
    live: 'online',
    cached: 'degraded',
    partial: 'degraded',
    stale: 'degraded',
    failed: 'down',
  }

  return sources.data.map((source) => ({
    name: source.name,
    status: statusByFeed[source.feed],
    latencyMs: source.latencyMs,
    coverage: coverageByFeed[source.feed],
  }))
}

function stateToRegime(state: MacroAltEnv['suggestion']): MarketEnv['regime'] {
  if (state === '更适合做多') return '顺风'
  if (state === '更适合做空') return '逆风'
  return '震荡'
}

function currentSession(): MarketEnv['session'] {
  const hour = new Date().getHours()
  if (hour >= 8 && hour < 15) return '亚洲盘'
  if (hour >= 15 && hour < 21) return '伦敦盘'
  return '纽约盘'
}

export function macroResourceToMarketEnv(
  macro: Resource<MacroAltEnv>,
  derivatives?: Resource<DerivativesState>,
  tokens: Token[] = [],
): MarketEnv {
  const data = macro.data
  const derivative = derivatives?.data
  const btc = tokens.find((token) => token.symbol.toUpperCase() === 'BTC')
  const eth = tokens.find((token) => token.symbol.toUpperCase() === 'ETH')
  const fundingHeat = derivative ? Math.min(35, Math.abs(derivative.funding) * 1200) : 0
  const oiHeat = derivative ? Math.min(45, Math.abs(derivative.oiChange) * 1.4) : 0
  const leverageCrowding = Math.round(clamp(25 + fundingHeat + oiHeat, 0, 100))

  return {
    btc: {
      price: btc?.price ?? 0,
      change: btc?.change24h ?? 0,
      state: data.btcState,
    },
    eth: {
      price: eth?.price ?? 0,
      change: eth?.change24h ?? 0,
      state: data.ethState,
    },
    altStrength: data.altStrength,
    regime: stateToRegime(data.suggestion),
    leverageCrowding,
    deleverageRisk:
      data.riskMode === '防守' || leverageCrowding >= 75
        ? '高'
        : data.riskMode === '中性' || leverageCrowding >= 55
          ? '中'
          : '低',
    session: currentSession(),
    fearGreed: Math.round(clamp(data.altStrength + (data.btcDominanceTrend === '下降' ? 8 : -6), 0, 100)),
  }
}

export function scanProofResourceToDataQuality(
  scan: Resource<ScanProofData>,
  sources?: Resource<DataSourceState[]>,
): DataQuality {
  const data = scan.data
  const sourceRows = sources?.data ?? []
  const degraded = scan.status !== 'live' || sourceRows.some((source) => source.feed !== 'live')

  return {
    raw: data.totalMonitored,
    cleaned: data.scannable,
    duplicates: 0,
    filtered: Math.max(0, data.totalMonitored - data.scannable),
    missing: data.awaitingDeepScan,
    delayMs: Math.max(0, ...sourceRows.map((source) => source.latencyMs ?? 0)),
    degraded,
    trust: clamp(data.coverage, 0, 100),
  }
}

export function derivativesResourceToCoinglassData(
  derivatives: Resource<DerivativesState>,
  apiUsage?: Resource<ApiUsageState>,
  tokens: Token[] = [],
): CoinglassData {
  const data = derivatives.data
  const used = apiUsage?.data.usedToday ?? 0
  const remaining = apiUsage?.data.remainingToday ?? 0
  const volume = tokens.reduce((sum, token) => sum + token.volume24h, 0)
  const heat = Math.abs(data.oiChange) + Math.abs(data.funding) * 1000

  return {
    oiChange: data.oiChange,
    funding: data.funding,
    longShortRatio: data.longShortRatio,
    takerBuySell: data.takerBuySell,
    futVolume: volume,
    crowding: heat >= 18 ? '高' : heat >= 8 ? '中' : '低',
    apiQuotaUsed: used,
    apiQuotaTotal: Math.max(1, used + remaining),
  }
}

function timeLabelFromAge(ageMin: number) {
  if (ageMin <= 0) return '刚刚'
  if (ageMin < 60) return `${ageMin}分钟前`
  return `${Math.floor(ageMin / 60)}小时前`
}

function baseSymbol(value: string) {
  return value
    .toUpperCase()
    .replace(/\.P$/, '')
    .replace(/USDT$|USDC$|USD$/, '')
}

function descFor(signal: RadarSignal) {
  if (signal.whyBlocked) return `${signal.whySelected}；${signal.whyBlocked}`
  return signal.whySelected
}

function signalSourceKind(signal: RadarSignal): SignalCard['sourceKind'] {
  return signal.id.startsWith('candidate-') ? 'leaderboard_candidate' : 'backend_signal'
}

export function radarSignalsToTokens(signals: RadarSignal[], tickerRows: TickerRows = []): Token[] {
  const tickerLookup = priceBySymbol(tickerRows)

  return displaySignalsFor(signals, tickerRows)
    .map((signal) => tokenFor(signal, tickerRows, tickerLookup))
}

export function radarSignalsToSignalCards(signals: RadarSignal[], tickerRows: TickerRows = []): SignalCard[] {
  const tickerLookup = priceBySymbol(tickerRows)

  return displaySignalsFor(signals, tickerRows)
    .map((signal) => {
      const token = tokenFor(signal, tickerRows, tickerLookup)
      const score = scoreFor(signal)
      const type = typeFor(signal)
      const ageMin = Math.max(0, signal.updatedMinAgo)
      return {
        id: signal.id,
        token,
        type,
        category: categoryFor(signal),
        maturity: signal.maturity,
        sourceKind: signalSourceKind(signal),
        poolStatus: poolStatusFor(signal),
        score,
        riskLevel: signal.risk,
        odds: signal.rr ?? 0,
        ageMin,
        exchange: 'CoinGlass',
        market: '合约' as const,
        volMult: round(1 + signal.evidenceCount * 0.7 + Math.max(0, score - 60) / 15, 1),
        desc: descFor(signal),
        starred: signal.maturity === 'TRADE_PLAN_READY',
        firstPush: timeLabelFromAge(ageMin + 15),
        lastPush: timeLabelFromAge(ageMin),
        // 没有后端生命周期触发价时必须保持 0，由 UI 显示“待追踪”。
        // 不能用当前价伪装入选价，否则“入选后变化”会变成假的 0%。
        pushPrice: 0,
        bullSentiment: signal.direction === '空'
          ? clamp(45 - signal.counterCount * 5, 5, 48)
          : signal.direction === '多'
            ? clamp(55 + signal.evidenceCount * 6 - signal.counterCount * 4, 52, 96)
            : clamp(48 + signal.evidenceCount * 3 - signal.counterCount * 4, 25, 75),
        shortAnomaly: signal.evidenceCount + signal.counterCount,
        trendAnomaly: Math.max(0, signal.evidenceCount - signal.counterCount),
      }
    })
    .sort((a, b) => b.score - a.score)
}

export function radarSignalsToFeedSignals(signals: RadarSignal[], symbol: string): Signal[] {
  const wanted = baseSymbol(symbol)

  return signals
    .filter((signal) => baseSymbol(signal.symbol) === wanted)
    .sort((a, b) => a.updatedMinAgo - b.updatedMinAgo)
    .map((signal, index) => {
      const type: Signal['type'] =
        signal.direction === '空'
          ? 'bear'
          : signal.direction === '多'
            ? 'bull'
            : 'neutral'
      const rr = signal.rr ? `，RR ${signal.rr.toFixed(1)}` : ''
      const status = signal.whyBlocked ? '风控拦截' : '证据更新'

      return {
        id: `${signal.id}-feed-${index}`,
        time: timeLabelFromAge(signal.updatedMinAgo),
        type,
        title: `${signal.symbol} ${status} · ${signal.maturity}`,
        body: `${descFor(signal)}${rr}。数据新鲜度：${signal.freshness}。`,
        tags: [
          signal.direction,
          signal.risk,
          signal.maturity,
          signal.whyBlocked ? 'Risk Gate' : '证据链',
        ],
      }
    })
}

function sniperSide(signal: RadarSignal): SniperTarget['side'] {
  return signal.direction === '空' ? 'short' : 'long'
}

function sniperSignals(signal: RadarSignal): SniperSignal[] {
  return [
    { label: `证据 ${signal.evidenceCount} 条`, hit: signal.evidenceCount >= 3 },
    { label: `反证 ${signal.counterCount} 条`, hit: signal.counterCount <= 1 },
    { label: `RR ${signal.rr ?? 0}`, hit: (signal.rr ?? 0) >= 3 },
    { label: signal.whyBlocked ? 'Risk Gate 拦截' : 'Risk Gate 通过', hit: !signal.whyBlocked },
  ]
}

export function radarSignalsToSniperTargets(signals: RadarSignal[], tickerRows: TickerRows = []): SniperTarget[] {
  return radarSignalsToSignalCards(signals, tickerRows)
    .filter((card) => card.category === 'sniper' && card.odds >= 3 && card.token.price > 0)
    .map((card) => {
      const signal = signals.find((item) => item.id === card.id)
      const side = signal ? sniperSide(signal) : card.token.trend === 'bear' ? 'short' : 'long'

      return {
        id: card.id,
        tokenId: card.token.id,
        symbol: card.token.symbol,
        name: card.token.name,
        hue: card.token.hue,
        side,
        type: card.type,
        score: card.score,
        confidence: clamp(card.score + 3, 1, 99),
        odds: card.odds,
        riskLevel: card.riskLevel,
        exchange: card.exchange,
        market: card.market,
        pushPrice: card.pushPrice,
        entryLow: 0,
        entryHigh: 0,
        stop: 0,
        target1: 0,
        target2: 0,
        thesis: card.desc,
        signals: signal ? sniperSignals(signal) : [],
        bullSentiment: card.bullSentiment,
        volMult: card.volMult,
        played: false,
        outcomePct: 0,
        outcomeNote: '等待后端完整交易计划和复盘验证',
      }
    })
}
