'use client'

import { useEffect, useSyncExternalStore } from 'react'
import type { Token } from './mock-data'

/**
 * 集中式实时行情 store
 * ---------------------------------------------------------------
 * 单一定时器统一驱动所有币种报价的小幅游走，组件通过
 * useSyncExternalStore 订阅，保证盘口条 / 信号表 / 榜单 / 热力图
 * 等各处显示的同一币种数值完全一致，且只用一个 interval。
 *
 * 后端对接规则：
 * - 页面拿到真实 token 列表后调用 usePrimeLiveQuotes(tokens) 注入行情。
 * - 后续 WebSocket / SSE 只需要调用 upsertLiveQuotes() 写入最新值。
 * - 不再用随机价格冒充实时行情。
 */

export type LiveQuote = {
  price: number
  change1h: number
  change24h: number
  change7d: number
  change30d: number
}

const base = new Map<string, LiveQuote>()
const snapshot = new Map<string, LiveQuote>()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

const EMPTY_QUOTE: LiveQuote = {
  price: 0,
  change1h: 0,
  change24h: 0,
  change7d: 0,
  change30d: 0,
}

function quoteFromToken(token: Token): LiveQuote {
  return {
    price: Number.isFinite(token.price) && token.price > 0 ? token.price : 0,
    change1h: Number.isFinite(token.change1h) ? token.change1h : 0,
    change24h: Number.isFinite(token.change24h) ? token.change24h : 0,
    change7d: Number.isFinite(token.change7d) ? token.change7d : 0,
    change30d: Number.isFinite(token.change30d) ? token.change30d : 0,
  }
}

function quoteChanged(left: LiveQuote | undefined, right: LiveQuote) {
  return !left ||
    left.price !== right.price ||
    left.change1h !== right.change1h ||
    left.change24h !== right.change24h ||
    left.change7d !== right.change7d ||
    left.change30d !== right.change30d
}

export function upsertLiveQuotes(tokens: Token[]) {
  let changed = false

  for (const token of tokens) {
    const key = token.id.trim().toLowerCase()
    if (!key) continue

    const quote = quoteFromToken(token)
    if (quoteChanged(snapshot.get(key), quote)) {
      changed = true
    }
    base.set(key, quote)
    snapshot.set(key, quote)
  }

  if (changed) {
    emit()
  }
}

function ensureQuote(id: string): LiveQuote {
  const key = id.trim().toLowerCase()
  const existing = snapshot.get(key) ?? base.get(key)

  if (existing) return existing

  return EMPTY_QUOTE
}

function emit() {
  listeners.forEach((l) => l())
}

// 后续接 WebSocket / SSE 时可复用同一个事件入口；当前不随机改价。
const TICK_MS = 9000

function tick() {
  emit()
}

function subscribe(cb: () => void) {
  if (!timer) timer = setInterval(tick, TICK_MS)
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

/** 订阅单个币种的实时报价 */
export function useLiveQuote(id: string): LiveQuote {
  const key = id.trim().toLowerCase()
  ensureQuote(key)

  return useSyncExternalStore(
    subscribe,
    () => snapshot.get(key) ?? ensureQuote(key),
    () => base.get(key) ?? ensureQuote(key),
  )
}

export function usePrimeLiveQuotes(tokens: Token[]) {
  useEffect(() => {
    upsertLiveQuotes(tokens)
  }, [tokens])
}
