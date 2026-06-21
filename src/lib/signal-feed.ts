'use client'

// ============================================================
// 全站信号推送服务 —— 单例。
//   不再绑定信号页：只要应用运行（全局组件挂载）就周期性推送新信号，
//   并播放提示音，实现"信号池提示音全站覆盖"。
//   若新信号命中用户未平仓持仓，升级为「持仓异动告警」：
//     · 播放最高优先级告警音 holdAlert
//     · 推送带 held 标记的事件，供全站 toast / 持仓卡片高亮
//   接入真实信号源时：用推送数据替换 fire() 内的随机挑选逻辑。
// ============================================================
import { useSyncExternalStore } from 'react'
import { getTokens } from './mock-data'
import { playSound } from './sound'
import { getOpenSymbols } from './journal-store'

export type SignalEvent = {
  id: number
  symbol: string
  hue: number
  side: 'bull' | 'bear'
  anomalyScore: number
  held: boolean // 是否命中用户持仓
  ts: number
}

let recent: SignalEvent[] = []
let started = false
const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

function fire() {
  const tokens = getTokens()
  if (tokens.length === 0) return
  const open = getOpenSymbols()

  // 为让"持仓异动告警"可被感知：有持仓时 40% 概率优先在持仓币种上触发
  let token
  if (open.length > 0 && Math.random() < 0.4) {
    const sym = open[Math.floor(Math.random() * open.length)]
    token = tokens.find((t) => t.symbol === sym) ?? tokens[0]
  } else {
    token = tokens[Math.floor(Math.random() * tokens.length)]
  }

  const held = open.includes(token.symbol)
  const ev: SignalEvent = {
    id: Date.now(),
    symbol: token.symbol,
    hue: token.hue,
    side: token.trend === 'bear' ? 'bear' : 'bull',
    anomalyScore: token.anomalyScore,
    held,
    ts: Date.now(),
  }
  recent = [ev, ...recent].slice(0, 30)
  // 持仓异动 → 最高优先级告警音；普通信号 → 信号音
  playSound(held ? 'holdAlert' : 'signal')
  emit()
}

function scheduleNext() {
  // 16~30s 随机间隔，模拟新信号到达
  const delay = 16000 + Math.random() * 14000
  setTimeout(() => {
    fire()
    scheduleNext()
  }, delay)
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  if (!started && typeof window !== 'undefined') {
    started = true
    scheduleNext()
  }
  return () => {
    listeners.delete(fn)
  }
}

const EMPTY: SignalEvent[] = []

/** 订阅最近信号事件列表（最新在前） */
export function useSignalFeed(): SignalEvent[] {
  return useSyncExternalStore(
    subscribe,
    () => recent,
    () => EMPTY,
  )
}

/** 仅订阅最新一条信号事件 */
export function useLatestSignal(): SignalEvent | null {
  const feed = useSignalFeed()
  return feed[0] ?? null
}
