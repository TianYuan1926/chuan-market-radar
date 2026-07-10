import type {
  CoinglassData,
  DataQuality,
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
import type { DataStatus, Resource } from './data-status'

type Direction = RadarSignal['direction']
type TickerRows = LeaderboardRow[]
type TickerLookup = Map<string, LeaderboardRow>
type DataSourceFeed = DataSourceState['feed']

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function positiveNumber(value: number | undefined | null) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

export type DashboardRuntimeStatusLabel = '正常' | '降级' | '异常'

export function dashboardRuntimeStatusLabelFromContracts({
  sourceFeeds,
  statuses,
}: {
  sourceFeeds: DataSourceFeed[]
  statuses: DataStatus[]
}): DashboardRuntimeStatusLabel {
  const failed = statuses.some((status) => status === 'failed' || status === 'error') ||
    sourceFeeds.some((feed) => feed === 'failed')

  if (failed) return '异常'

  const degraded = statuses.some((status) => status !== 'live') ||
    sourceFeeds.some((feed) => feed !== 'live')

  return degraded ? '降级' : '正常'
}

export const systemStatusFromContracts = dashboardRuntimeStatusLabelFromContracts

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
  if (signal.unifiedDecision.canTradeNow && signal.unifiedDecision.readyPlan !== null) {
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
  const ticker = tickerLookup.get(symbol)
  const price = positiveNumber(ticker?.price)
  const trend = trendFor(signal.direction)
  const tags: Token['tags'] = ['合约', '异常活跃']

  if (signal.unifiedDecision.canTradeNow && signal.unifiedDecision.readyPlan !== null) tags.push('Alpha')
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
    anomalyScore: signal.score ?? null,
    trend,
  }
}

function changeForLeaderboardRow(row: LeaderboardRow, kind: LeaderboardKind) {
  if (kind === 'gainers' || kind === 'losers') return row.value
  return 0
}

export function leaderboardRowsToTokens(
  rows: LeaderboardRow[],
  kind: LeaderboardKind = 'volume',
): Token[] {
  return rows.map((row) => {
    const symbol = row.symbol.toUpperCase()
    const change24h = changeForLeaderboardRow(row, kind)
    const tags: Token['tags'] = ['合约']

    if (row.hasSignal || row.inCandidatePool || row.deepScanned) tags.push('异常活跃')
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
      anomalyScore: null,
      trend: 'shock',
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
      anomalyScore: existing.anomalyScore === null
        ? token.anomalyScore
        : token.anomalyScore === null
          ? existing.anomalyScore
          : Math.max(existing.anomalyScore, token.anomalyScore),
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
  const scanned = data.currentCycleScannedAssets
  const total = data.eligibleAssets
  const pending = data.awaitingDeepScan
  const batchSize = Math.max(1, scanned)

  return {
    coverage: clamp(data.lightCoveragePercent, 0, 100),
    scanned,
    pending,
    total,
    batch: Math.max(1, Math.ceil(scanned / batchSize)),
    totalBatches: Math.max(1, Math.ceil(Math.max(1, data.eligibleAssets) / batchSize)),
    nextBatchSec: Math.max(0, data.nextScanCountdownSec),
    budgetUsed: used,
    budgetTotal: totalBudget,
    freshnessSec: Math.max(0, Math.round(scan.ageSec ?? 0)),
    mode: data.deepScanned > 0 ? '深扫' : '轻扫',
  }
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
  const unavailable = scan.status === 'empty' || scan.status === 'error' || scan.status === 'failed' || scan.status === 'loading'
  const latencies = sourceRows
    .map((source) => source.latencyMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  return {
    observed: unavailable ? null : data.observedAssets,
    accepted: unavailable ? null : data.acceptedAssets,
    eligible: unavailable ? null : data.eligibleAssets,
    currentCycleScanned: unavailable ? null : data.currentCycleScannedAssets,
    deepScanned: unavailable ? null : data.deepScanned,
    delayMs: latencies.length > 0 ? Math.max(...latencies) : null,
    degraded,
    evidenceStatus: unavailable ? '不可用' : degraded ? '部分可用' : '可用',
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

export function radarSignalsToTokens(signals: RadarSignal[], tickerRows: TickerRows = []): Token[] {
  const tickerLookup = priceBySymbol(tickerRows)

  return signals.map((signal) => tokenFor(signal, tickerRows, tickerLookup))
}

export function radarSignalsToSignalCards(signals: RadarSignal[], tickerRows: TickerRows = []): SignalCard[] {
  const tickerLookup = priceBySymbol(tickerRows)

  return signals
    .map((signal) => {
      const token = tokenFor(signal, tickerRows, tickerLookup)
      const type = typeFor(signal)
      const ageMin = Math.max(0, signal.updatedMinAgo)
      return {
        id: signal.id,
        token,
        type,
        category: categoryFor(signal),
        maturity: signal.maturity,
        lifecycle: signal.lifecycle,
        operatorRead: signal.operatorRead,
        sourceKind: 'backend_signal' as const,
        poolStatus: poolStatusFor(signal),
        score: signal.score ?? null,
        riskLevel: signal.risk,
        odds: signal.rr ?? 0,
        ageMin,
        exchange: 'n/a',
        market: '合约' as const,
        volMult: null,
        desc: descFor(signal),
        starred: signal.unifiedDecision.canTradeNow,
        firstPush: signal.lifecycle.ageLabel,
        lastPush: signal.lifecycle.ageLabel,
        // 没有后端生命周期触发价时必须保持 0，由 UI 显示“待追踪”。
        // 不能用当前价伪装入选价，否则“入选后变化”会变成假的 0%。
        pushPrice: 0,
        bullSentiment: null,
        shortAnomaly: signal.evidenceCount,
        trendAnomaly: signal.counterCount,
      }
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
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
      const rr = signal.rr ? `，结构盈亏比 ${signal.rr.toFixed(1)}:1` : ''
      const status = signal.operatorRead.headline

      return {
        id: `${signal.id}-feed-${index}`,
        time: signal.lifecycle.ageLabel,
        type,
        title: `${signal.symbol} ${status}`,
        body: `${descFor(signal)}${rr}。新旧状态：${signal.lifecycle.freshnessLabel}。下一步：${signal.operatorRead.nextAction}`,
        tags: [
          signal.direction,
          signal.risk,
          signal.operatorRead.laneLabel,
          signal.whyBlocked ? '风控拦截' : '证据链',
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
    { label: `结构盈亏比 ${signal.rr ?? 0}:1`, hit: (signal.rr ?? 0) >= 3 },
    { label: signal.whyBlocked ? '风控门禁拦截' : '风控门禁通过', hit: !signal.whyBlocked },
  ]
}

export function radarSignalsToSniperTargets(signals: RadarSignal[], tickerRows: TickerRows = []): SniperTarget[] {
  return radarSignalsToSignalCards(signals, tickerRows)
    .filter((card) => {
      const signal = signals.find((item) => item.id === card.id)
      return Boolean(signal?.unifiedDecision.canTradeNow && signal.unifiedDecision.readyPlan && card.token.price > 0)
    })
    .map((card) => {
      const signal = signals.find((item) => item.id === card.id)
      const readyPlan = signal?.unifiedDecision.readyPlan ?? null
      const side = signal ? sniperSide(signal) : card.token.trend === 'bear' ? 'short' : 'long'
      const targets = readyPlan?.targets ?? []

      return {
        id: card.id,
        tokenId: card.token.id,
        symbol: card.token.symbol,
        name: card.token.name,
        hue: card.token.hue,
        side,
        type: card.type,
        score: card.score,
        confidence: null,
        odds: card.odds,
        riskLevel: card.riskLevel,
        exchange: card.exchange,
        market: card.market,
        pushPrice: card.pushPrice,
        entryLow: readyPlan?.plannedEntryPrice ?? 0,
        entryHigh: readyPlan?.plannedEntryPrice ?? 0,
        stop: readyPlan?.structuralStop ?? 0,
        target1: targets[0] ?? 0,
        target2: targets[1] ?? targets[0] ?? 0,
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
