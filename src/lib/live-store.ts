'use client'

import { useSyncExternalStore } from 'react'
import { getTokens } from './mock-data'

/**
 * 集中式实时行情 store
 * ---------------------------------------------------------------
 * 单一定时器统一驱动所有币种报价的小幅游走，组件通过
 * useSyncExternalStore 订阅，保证盘口条 / 信号表 / 榜单 / 热力图
 * 等各处显示的同一币种数值完全一致，且只用一个 interval。
 *
 * 【对接 codex 后端】：把下方 `tick()` 里的随机游走替换为后端
 * 推送（WebSocket / SSE / 轮询）写入 `snapshot` 并调用 `emit()` 即可，
 * 组件层无需任何改动 —— 数值变化会自动触发补间 + 涨跌闪烁动画。
 */

export type LiveQuote = {
  price: number
  change1h: number
  change24h: number
  change7d: number
  change30d: number
}

const base = new Map<string, LiveQuote>()
let snapshot = new Map<string, LiveQuote>()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

// 确定性初始化（服务端与客户端首帧一致，避免水合不匹配）
function init() {
  if (base.size) return
  for (const t of getTokens()) {
    const q: LiveQuote = {
      price: t.price,
      change1h: t.change1h,
      change24h: t.change24h,
      change7d: t.change7d,
      change30d: t.change30d,
    }
    base.set(t.id, q)
    snapshot.set(t.id, q)
  }
}

function seedFromId(id: string) {
  let hash = 2166136261
  for (const char of id.toUpperCase()) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function fallbackQuoteForId(id: string): LiveQuote {
  const seed = seedFromId(id)
  const roll = (Math.sin(seed) * 10000) % 1
  const unit = Math.abs(roll)
  const price =
    id.toUpperCase() === 'BTC'
      ? 65000
      : id.toUpperCase() === 'ETH'
        ? 3500
        : unit < 0.4
          ? 0.01 + unit * 0.2
          : 0.3 + unit * 80
  const change24h = +(unit * 18 - 5).toFixed(2)

  return {
    price,
    change1h: +(change24h / 10).toFixed(2),
    change24h,
    change7d: +(change24h * 2.2).toFixed(2),
    change30d: +(change24h * 4.8).toFixed(2),
  }
}

function ensureQuote(id: string): LiveQuote {
  init()
  const key = id.trim().toLowerCase()
  const existing = snapshot.get(key) ?? base.get(key)

  if (existing) return existing

  const fallback = fallbackQuoteForId(key)
  base.set(key, fallback)
  snapshot.set(key, fallback)
  return fallback
}

function emit() {
  listeners.forEach((l) => l())
}

// 轮询间隔（ms）。放慢节奏，避免数字跳动过于频繁、刺眼。
// 对接后端时此值无关紧要——届时由后端推送频率决定。
const TICK_MS = 9000

function tick() {
  const next = new Map<string, LiveQuote>()
  for (const [id, q] of snapshot) {
    const drift = (Math.random() - 0.5) * 0.0016 // ±0.08%
    const price = Math.max(q.price * (1 + drift), 0)
    const d = drift * 100
    next.set(id, {
      price,
      change1h: q.change1h + d,
      change24h: q.change24h + d * 0.6,
      change7d: q.change7d + d * 0.3,
      change30d: q.change30d + d * 0.15,
    })
  }
  snapshot = next
  emit()
}

function subscribe(cb: () => void) {
  init()
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

  init()
  return useSyncExternalStore(
    subscribe,
    () => snapshot.get(key) ?? ensureQuote(key),
    () => base.get(key) ?? ensureQuote(key),
  )
}
