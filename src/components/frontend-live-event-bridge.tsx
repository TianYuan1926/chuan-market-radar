'use client'

import { useEffect, useRef } from 'react'
import { leaderboardRowsToTokens, mergeTokensBySymbol } from '@/lib/frontend-display-adapters'
import { publishSignalEvent } from '@/lib/signal-feed'
import { upsertLiveQuotes } from '@/lib/live-store'
import type { FrontendLiveEventsContract, FrontendLiveEvent } from '@/lib/market/live-events'
import type { LeaderboardKind, LeaderboardRow } from '@/lib/radar-contract'
import type { Resource } from '@/lib/data-status'

const QUOTE_REFRESH_MS = 15_000
const QUOTE_KINDS: LeaderboardKind[] = ['gainers', 'losers', 'volume']

function hashText(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

function baseSymbol(value: string) {
  return value
    .toUpperCase()
    .replace(/\.P$/, '')
    .replace(/USDT$|USDC$|USD$/, '')
}

function hueFor(symbol: string) {
  return hashText(symbol) % 360
}

function sideFor(event: FrontendLiveEvent): 'bull' | 'bear' {
  if (event.payload.changeKind === 'removed' || event.severity === 'down' || event.severity === 'degraded') {
    return 'bear'
  }
  return 'bull'
}

function anomalyScoreFor(event: FrontendLiveEvent) {
  const metrics = event.payload.metrics
  const raw = Math.max(
    Math.abs(metrics?.anomalyDelta ?? 0),
    Math.abs(metrics?.candidateDelta ?? 0),
    event.severity === 'hot' ? 88 : event.severity === 'watch' ? 64 : 42,
  )
  return Math.max(1, Math.min(99, Math.round(raw)))
}

function publishEvent(event: FrontendLiveEvent) {
  const symbol = baseSymbol(event.symbols[0] ?? '')
  if (!symbol) return

  publishSignalEvent({
    id: hashText(event.id),
    symbol,
    hue: hueFor(symbol),
    side: sideFor(event),
    anomalyScore: anomalyScoreFor(event),
    held: false,
    ts: Date.parse(event.occurredAt) || Date.now(),
  })
}

async function fetchLeaderboard(kind: LeaderboardKind) {
  const response = await fetch(`/api/frontend/leaderboard?kind=${kind}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  })

  if (!response.ok) return []

  const body = await response.json() as {
    leaderboard?: Resource<LeaderboardRow[]>
  }

  return leaderboardRowsToTokens(body.leaderboard?.data ?? [], kind)
}

async function refreshQuotes() {
  const groups = await Promise.all(QUOTE_KINDS.map(fetchLeaderboard))
  const tokens = mergeTokensBySymbol(...groups)
  if (tokens.length > 0) {
    upsertLiveQuotes(tokens)
  }
}

export function FrontendLiveEventBridge() {
  const seen = useRef<Set<string>>(new Set())

  useEffect(() => {
    let closed = false

    const safeRefreshQuotes = () => {
      void refreshQuotes().catch(() => {
        // 前端事件桥只做增强；失败时保留页面 SSR 已注入的数据。
      })
    }

    safeRefreshQuotes()
    const quoteTimer = setInterval(safeRefreshQuotes, QUOTE_REFRESH_MS)

    const stream = new EventSource('/api/frontend/live-events/stream?limit=20&intervalMs=5000')

    stream.addEventListener('frontend-live-events', (message) => {
      if (closed) return

      try {
        const payload = JSON.parse((message as MessageEvent<string>).data) as FrontendLiveEventsContract

        for (const event of payload.events) {
          if (seen.current.has(event.id)) continue
          seen.current.add(event.id)
          publishEvent(event)
        }

        if (seen.current.size > 500) {
          seen.current = new Set([...seen.current].slice(-250))
        }
      } catch {
        // 忽略单次坏包，下一次 SSE 会继续推送最新合同。
      }
    })

    stream.addEventListener('frontend-live-events-error', () => {
      // 错误事件不改变前端事实，只等待下一轮 SSE。
    })

    return () => {
      closed = true
      stream.close()
      clearInterval(quoteTimer)
    }
  }, [])

  return null
}
