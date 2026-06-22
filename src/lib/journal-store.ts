'use client'

// ============================================================
// 交易日记存储
//   记录每一笔真实开仓：币种 / 方向 / 杠杆 / 初始保证金 / 价格 / 截图
//   仓位按「初始保证金 × 杠杆」计算，盈亏比由开仓/止损/目标价自动推导。
//   当前优先同步到 /api/frontend/journal-contract，localStorage 只做离线兜底。
// ============================================================
import { useSyncExternalStore } from 'react'
import type { Resource } from './data-status'

export type TradeSide = 'long' | 'short'
export type TradeStatus = '持仓中' | '已平仓'
export type TradeResult = 'win' | 'loss'

export type TradeJournal = {
  id: string
  symbol: string
  side: TradeSide
  leverage: number // 杠杆倍数
  margin: number // 初始保证金（USDT）
  entry: number // 开仓价
  stop: number // 止损价
  target: number // 目标价
  status: TradeStatus
  note: string
  images: string[] // 截图（base64 data URL，已压缩）
  createdAt: number
  // —— 平仓结算（status === '已平仓' 时存在）——
  exitPrice?: number // 平仓价 / 止盈价
  result?: TradeResult // 成功 / 失败（由盈亏自动判定）
  closeNote?: string // 平仓备注（在哪里止盈、为何离场）
  closedAt?: number // 平仓时间
}

const STORAGE_KEY = 'chuanscan_journal_v2'
const JOURNAL_CONTRACT_ENDPOINT = '/api/frontend/journal-contract'
const LEGACY_SEED_IDS = new Set(['seed-1', 'seed-2'])

let entries: TradeJournal[] | null = null
let serverSyncStarted = false
let serverSyncInFlight = false
const listeners = new Set<() => void>()

type JournalContractResponse = {
  ok: boolean
  journal?: Resource<TradeJournal[]>
  error?: string
}

function loadEntries(): TradeJournal[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TradeJournal[]
    return Array.isArray(parsed)
      ? parsed.filter((entry) => !LEGACY_SEED_IDS.has(entry.id))
      : []
  } catch {
    return []
  }
}

function saveEntries(list: TradeJournal[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch (e) {
    // 多为 localStorage 配额超限（图片过多）
    console.log('[v0] journal save failed:', (e as Error).message)
  }
}

function ensureHydrated() {
  if (entries === null) entries = loadEntries()
  if (!serverSyncStarted) {
    serverSyncStarted = true
    void syncEntriesFromServer()
  }
}

function emit() {
  for (const fn of listeners) fn()
}

function replaceEntriesFromServer(list: TradeJournal[]) {
  entries = list.filter((entry) => !LEGACY_SEED_IDS.has(entry.id))
  saveEntries(entries)
  emit()
}

function isTradeJournalArray(value: unknown): value is TradeJournal[] {
  return Array.isArray(value) && value.every((entry) => (
    entry &&
    typeof entry === 'object' &&
    typeof (entry as TradeJournal).id === 'string' &&
    typeof (entry as TradeJournal).symbol === 'string'
  ))
}

export async function syncEntriesFromServer() {
  if (typeof window === 'undefined' || serverSyncInFlight) return

  serverSyncInFlight = true

  try {
    const response = await fetch(JOURNAL_CONTRACT_ENDPOINT, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })
    const payload = (await response.json()) as JournalContractResponse
    const serverEntries = payload.journal?.data

    if (response.ok && payload.ok && isTradeJournalArray(serverEntries)) {
      const localEntries = entries ?? []

      if (serverEntries.length > 0 || localEntries.length === 0) {
        replaceEntriesFromServer(serverEntries)
      }
    }
  } catch (e) {
    console.log('[v0] journal backend sync failed, using local fallback:', (e as Error).message)
  } finally {
    serverSyncInFlight = false
  }
}

async function postJournalMutation(operation: 'upsert' | 'close' | 'reopen' | 'remove', entry: TradeJournal) {
  if (typeof window === 'undefined') return

  try {
    const response = await fetch(JOURNAL_CONTRACT_ENDPOINT, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ operation, entry }),
    })
    const payload = (await response.json()) as JournalContractResponse
    const serverEntries = payload.journal?.data

    if (response.ok && payload.ok && isTradeJournalArray(serverEntries)) {
      replaceEntriesFromServer(serverEntries)
      return
    }

    console.log('[v0] journal backend mutation failed:', payload.error ?? response.statusText)
  } catch (e) {
    console.log('[v0] journal backend mutation failed, kept local fallback:', (e as Error).message)
  }
}

/** 新增一笔开仓记录 */
export function addJournalEntry(data: Omit<TradeJournal, 'id' | 'createdAt'>) {
  ensureHydrated()
  const entry: TradeJournal = {
    ...data,
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `j-${crypto.randomUUID()}`
      : `j-${Date.now()}`,
    createdAt: Date.now(),
  }
  entries = [entry, ...(entries ?? [])]
  saveEntries(entries)
  emit()
  void postJournalMutation('upsert', entry)
}

/** 删除一笔记录 */
export function removeJournalEntry(id: string) {
  ensureHydrated()
  const removed = (entries ?? []).find((e) => e.id === id)
  entries = (entries ?? []).filter((e) => e.id !== id)
  saveEntries(entries)
  emit()
  if (removed) void postJournalMutation('remove', removed)
}

/** 平仓结算：写入平仓价，按盈亏自动判定成功/失败 */
export function closeTrade(id: string, exitPrice: number, closeNote = '') {
  ensureHydrated()
  let closed: TradeJournal | undefined
  entries = (entries ?? []).map((e) => {
    if (e.id !== id) return e
    const dir = e.side === 'long' ? 1 : -1
    const pnl = exitPrice ? (exitPrice - e.entry) * dir : 0
    closed = {
      ...e,
      status: '已平仓' as TradeStatus,
      exitPrice,
      result: (pnl >= 0 ? 'win' : 'loss') as TradeResult,
      closeNote,
      closedAt: Date.now(),
    }
    return closed
  })
  saveEntries(entries)
  emit()
  if (closed) void postJournalMutation('close', closed)
}

/** 重新打开一笔已平仓记录（撤销结算） */
export function reopenTrade(id: string) {
  ensureHydrated()
  let reopened: TradeJournal | undefined
  entries = (entries ?? []).map((e) => {
    if (e.id !== id) return e
    reopened = {
      ...e,
      status: '持仓中' as TradeStatus,
      exitPrice: undefined,
      result: undefined,
      closeNote: undefined,
      closedAt: undefined,
    }
    return reopened
  })
  saveEntries(entries)
  emit()
  if (reopened) void postJournalMutation('reopen', reopened)
}

/** 当前所有未平仓持仓的币种符号（供信号推送做持仓异动告警） */
export function getOpenSymbols(): string[] {
  ensureHydrated()
  return Array.from(
    new Set((entries ?? []).filter((e) => e.status === '持仓中').map((e) => e.symbol)),
  )
}

function subscribe(fn: () => void) {
  ensureHydrated()
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function getSnapshot(): TradeJournal[] {
  ensureHydrated()
  return entries as TradeJournal[]
}

const SERVER_SNAPSHOT: TradeJournal[] = []

/** 订阅交易日记列表 */
export function useJournal(): TradeJournal[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT)
}

// ------------------------------------------------------------
// 交易计算：仓位按初始保证金 × 杠杆，盈亏比由价格推导
// ------------------------------------------------------------
export type TradeMetrics = {
  positionValue: number // 仓位价值 = 保证金 × 杠杆
  qty: number // 仓位数量 = 仓位价值 / 开仓价
  riskReward: number // 盈亏比 = 潜在盈利 / 潜在亏损
  profitAmount: number // 到目标的盈利额（基于仓位）
  lossAmount: number // 到止损的亏损额（基于仓位）
  profitPctOnMargin: number // 到目标的保证金回报率 %
  lossPctOnMargin: number // 到止损的保证金亏损率 %
  liqPrice: number // 估算强平价（逐仓近似，未计手续费/维持保证金）
}

type TradeInput = {
  side: TradeSide
  leverage: number
  margin: number
  entry: number
  stop: number
  target: number
}

/** 计算一笔交易的衍生指标；价格不完整时返回 null */
export function computeTrade(t: TradeInput): TradeMetrics | null {
  const { side, leverage, margin, entry, stop, target } = t
  if (!entry || !margin || !leverage || entry <= 0) return null

  const positionValue = margin * leverage
  const qty = positionValue / entry

  // 方向感知：做多盈利在上方，做空盈利在下方
  const dir = side === 'long' ? 1 : -1
  const rewardPerUnit = (target - entry) * dir // 正值才是盈利方向
  const riskPerUnit = (entry - stop) * dir // 正值才是合理止损

  const profitAmount = target ? qty * rewardPerUnit : 0
  const lossAmount = stop ? qty * riskPerUnit : 0

  const riskReward =
    stop && target && Math.abs(riskPerUnit) > 0
      ? Math.abs(rewardPerUnit) / Math.abs(riskPerUnit)
      : 0

  const profitPctOnMargin = margin ? (profitAmount / margin) * 100 : 0
  const lossPctOnMargin = margin ? (lossAmount / margin) * 100 : 0

  // 逐仓强平价近似：价格反向变动 ≈ 1/杠杆 时爆仓
  const liqPrice =
    side === 'long' ? entry * (1 - 1 / leverage) : entry * (1 + 1 / leverage)

  return {
    positionValue,
    qty,
    riskReward,
    profitAmount,
    lossAmount,
    profitPctOnMargin,
    lossPctOnMargin,
    liqPrice,
  }
}

/** 盈亏结果（已实现或浮动通用）：基于某一标记价相对开仓价 */
export type PnlResult = {
  pnl: number // 盈亏额（USDT）
  roe: number // 保证金回报率 %
  pricePct: number // 价格变动 %（方向感知，正=有利）
  win: boolean
}

/** 通用盈亏：给定开仓信息与标记价（平仓价或实时价） */
export function pnlAt(
  t: { side: TradeSide; leverage: number; margin: number; entry: number },
  markPrice: number,
): PnlResult | null {
  const { side, leverage, margin, entry } = t
  if (!entry || !margin || !markPrice || entry <= 0) return null
  const qty = (margin * leverage) / entry
  const dir = side === 'long' ? 1 : -1
  const pnl = qty * (markPrice - entry) * dir
  const roe = (pnl / margin) * 100
  const pricePct = ((markPrice - entry) / entry) * 100 * dir
  return { pnl, roe, pricePct, win: pnl >= 0 }
}

/** 已实现盈亏：依据已平仓记录的 exitPrice */
export function realizedPnl(j: TradeJournal): PnlResult | null {
  if (j.status !== '已平仓' || !j.exitPrice) return null
  return pnlAt(j, j.exitPrice)
}

// ------------------------------------------------------------
// 交易统计聚合：胜率 / 盈亏比 / 累计盈亏 / 资金曲线 等
//   仅基于交易日记自身数据，独立于复盘进化模块
// ------------------------------------------------------------
export type JournalStats = {
  total: number // 总单数
  open: number // 持仓中
  closed: number // 已平仓
  wins: number // 盈利单
  losses: number // 亏损单
  winRate: number // 胜率 %（已平仓口径）
  realized: number // 累计已实现盈亏（USDT）
  avgRoe: number // 平均 ROE %（已平仓）
  avgRR: number // 平均计划盈亏比（含止损+目标的单）
  profitFactor: number // 盈利因子 = 总盈利 / 总亏损（Infinity 表示无亏损）
  bestPnl: number // 最大单笔盈利
  worstPnl: number // 最大单笔亏损
  longCount: number
  shortCount: number
  longWins: number
  shortWins: number
  avgLeverage: number
  grossProfit: number
  grossLoss: number // 取正值
  // 资金曲线：按平仓时间升序的累计已实现盈亏
  equity: { t: number; cum: number; pnl: number; symbol: string; win: boolean }[]
}

export function computeStats(list: TradeJournal[]): JournalStats {
  const total = list.length
  const open = list.filter((e) => e.status === '持仓中').length
  const closedList = list.filter((e) => e.status === '已平仓' && e.exitPrice)

  let wins = 0
  let losses = 0
  let realized = 0
  let roeSum = 0
  let grossProfit = 0
  let grossLoss = 0
  let bestPnl = 0
  let worstPnl = 0

  // 资金曲线按平仓时间排序
  const closedSorted = [...closedList].sort(
    (a, b) => (a.closedAt ?? a.createdAt) - (b.closedAt ?? b.createdAt),
  )
  const equity: JournalStats['equity'] = []
  let cum = 0
  for (const e of closedSorted) {
    const p = realizedPnl(e)
    if (!p) continue
    realized += p.pnl
    roeSum += p.roe
    if (p.win) {
      wins++
      grossProfit += p.pnl
    } else {
      losses++
      grossLoss += Math.abs(p.pnl)
    }
    if (p.pnl > bestPnl) bestPnl = p.pnl
    if (p.pnl < worstPnl) worstPnl = p.pnl
    cum += p.pnl
    equity.push({ t: e.closedAt ?? e.createdAt, cum, pnl: p.pnl, symbol: e.symbol, win: p.win })
  }

  const closed = closedSorted.length
  const winRate = closed ? (wins / closed) * 100 : 0
  const avgRoe = closed ? roeSum / closed : 0
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0

  // 平均计划盈亏比：所有含止损+目标价的单
  const rrList = list
    .map((e) => computeTrade(e)?.riskReward ?? 0)
    .filter((r) => r > 0)
  const avgRR = rrList.length ? rrList.reduce((a, b) => a + b, 0) / rrList.length : 0

  const longCount = list.filter((e) => e.side === 'long').length
  const shortCount = list.filter((e) => e.side === 'short').length
  const longWins = closedSorted.filter((e) => e.side === 'long' && e.result === 'win').length
  const shortWins = closedSorted.filter((e) => e.side === 'short' && e.result === 'win').length
  const avgLeverage = total ? list.reduce((a, e) => a + e.leverage, 0) / total : 0

  return {
    total,
    open,
    closed,
    wins,
    losses,
    winRate,
    realized,
    avgRoe,
    avgRR,
    profitFactor,
    bestPnl,
    worstPnl,
    longCount,
    shortCount,
    longWins,
    shortWins,
    avgLeverage,
    grossProfit,
    grossLoss,
    equity,
  }
}

// 价格按量级自适应小数位
export function fmtPrice(n: number): string {
  if (!n) return '—'
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (n >= 1) return n.toFixed(4)
  if (n >= 0.01) return n.toFixed(5)
  return n.toFixed(7)
}

export function fmtUsd(n: number): string {
  const sign = n < 0 ? '-' : ''
  const v = Math.abs(n)
  if (v >= 1000) return `${sign}$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  return `${sign}$${v.toFixed(2)}`
}

// ------------------------------------------------------------
// 图片处理：读取文件 → 压缩为最长边 ≤ 1000px 的 JPEG，控制体积
// ------------------------------------------------------------
const MAX_EDGE = 1000
const JPEG_QUALITY = 0.72

export function fileToCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        let { width, height } = img
        if (width > MAX_EDGE || height > MAX_EDGE) {
          if (width >= height) {
            height = Math.round((height * MAX_EDGE) / width)
            width = MAX_EDGE
          } else {
            width = Math.round((width * MAX_EDGE) / height)
            height = MAX_EDGE
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('canvas 不可用'))
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
      }
      img.onerror = () => reject(new Error('图片解析失败'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}
