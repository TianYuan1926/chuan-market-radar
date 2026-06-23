'use client'

import { useEffect, useMemo, useState } from 'react'
import { KlineChart } from './kline-chart'
import { DegradeNotice, FreshnessTag, StatusBadge } from './data-state'
import { getCandles, type Candle } from '@/lib/mock-data'
import type { DataStatus } from '@/lib/data-status'
import { cn } from '@/lib/utils'

const TFS = ['1分钟', '15分钟', '1小时', '4小时', '1天'] as const
const TF_TO_INTERVAL: Record<(typeof TFS)[number], string> = {
  '1分钟': '1m',
  '15分钟': '15m',
  '1小时': '1h',
  '4小时': '4h',
  '1天': '1d',
}
export type ChartCandle = Candle

type KlineResourcePayload = {
  status: DataStatus
  data: ChartCandle[]
  updatedAt?: string
  ageSec?: number
  source?: string
  reason?: string
}

export function KlinePanel({
  seed,
  startPrice,
  bare = false,
  candles,
  allowMockFallback = false,
  initialAgeSec,
  initialReason,
  initialSource,
  initialStatus = 'empty',
  initialUpdatedAt,
  symbol,
}: {
  seed: number
  startPrice: number
  bare?: boolean
  candles?: ChartCandle[]
  allowMockFallback?: boolean
  initialAgeSec?: number
  initialReason?: string
  initialSource?: string
  initialStatus?: DataStatus
  initialUpdatedAt?: string
  symbol?: string
}) {
  const [tf, setTf] = useState<(typeof TFS)[number]>('4小时')
  const [remote, setRemote] = useState<KlineResourcePayload>({
    ageSec: initialAgeSec,
    data: candles ?? [],
    reason: initialReason,
    source: initialSource,
    status: initialStatus,
    updatedAt: initialUpdatedAt,
  })

  useEffect(() => {
    setRemote({
      ageSec: initialAgeSec,
      data: candles ?? [],
      reason: initialReason,
      source: initialSource,
      status: initialStatus,
      updatedAt: initialUpdatedAt,
    })
  }, [candles, initialAgeSec, initialReason, initialSource, initialStatus, initialUpdatedAt])

  useEffect(() => {
    if (!symbol) return
    if (tf === '4小时' && candles?.length) {
      setRemote({
        ageSec: initialAgeSec,
        data: candles,
        reason: initialReason,
        source: initialSource,
        status: initialStatus,
        updatedAt: initialUpdatedAt,
      })
      return
    }

    const controller = new AbortController()
    const interval = TF_TO_INTERVAL[tf]

    setRemote((current) => ({
      ...current,
      reason: `正在请求 ${interval} 真实 K 线`,
      status: 'loading',
    }))

    fetch(`/api/frontend/kline-contract?symbol=${encodeURIComponent(symbol)}&tf=${interval}&limit=180`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok || !payload?.kline) {
          throw new Error(payload?.detail ?? payload?.error ?? `HTTP ${response.status}`)
        }
        setRemote(payload.kline)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setRemote({
          data: [],
          reason: error instanceof Error ? error.message : 'K 线请求失败',
          source: 'frontend-kline-contract',
          status: 'failed',
        })
      })

    return () => controller.abort()
  }, [candles, initialAgeSec, initialReason, initialSource, initialStatus, initialUpdatedAt, symbol, tf])

  const displayCandles = useMemo(() => {
    if (remote.data.length) return remote.data
    if (!allowMockFallback) return []
    const i = TFS.indexOf(tf)
    return getCandles(seed + i * 17, 80, startPrice)
  }, [tf, seed, startPrice, remote.data, allowMockFallback])

  return (
    <div className={bare ? '' : 'border border-border bg-card'}>
      <div className="flex flex-wrap items-center border-b border-border px-3">
        {TFS.map((t) => (
          <button
            key={t}
            onClick={() => setTf(t)}
            className={cn(
              'relative px-3 py-2.5 text-[13px] font-semibold transition-colors',
              tf === t
                ? 'text-neon'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t}
            {tf === t && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 bg-neon" />
            )}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 px-2 text-xs text-muted-foreground">
          <StatusBadge status={remote.status} />
          <FreshnessTag source={remote.source} ageSec={remote.ageSec} updatedAt={remote.updatedAt} />
          <span className="flex items-center gap-1">
            <span className="size-2 bg-up" />阳线
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 bg-down" />阴线
          </span>
        </div>
      </div>
      <div className="px-3 pb-2 pt-3">
        <DegradeNotice status={remote.status} reason={remote.reason} className="mb-3" />
        {displayCandles.length > 0 ? (
          <KlineChart candles={displayCandles} />
        ) : (
          <div className="grid min-h-[320px] place-items-center border border-dashed border-border bg-secondary/20 px-4 text-center text-sm text-muted-foreground">
            {remote.reason ?? '等待真实 K 线数据'}
          </div>
        )}
      </div>
    </div>
  )
}
