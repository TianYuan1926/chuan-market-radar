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
  init()
  return useSyncExternalStore(
    subscribe,
    () => snapshot.get(id) ?? base.get(id)!,
    () => base.get(id)!,
  )
}
