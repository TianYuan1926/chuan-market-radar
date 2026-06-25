'use client'

// ============================================================
// 全站信号推送服务 —— 单例。
//   只接受真实后端/SSE/WebSocket 或页面显式发布的事件。
//   不再从旧 mock 市场事实源随机生成市场信号。
// ============================================================
import { useSyncExternalStore } from 'react'

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
const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

export function publishSignalEvent(event: SignalEvent) {
  recent = [event, ...recent].slice(0, 30)
  emit()
}

function subscribe(fn: () => void) {
  listeners.add(fn)
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
