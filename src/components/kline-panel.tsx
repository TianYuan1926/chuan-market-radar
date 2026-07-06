'use client'

import { useEffect, useState } from 'react'
import { KlineChart } from './kline-chart'
import { DegradeNotice, FreshnessTag, StatusBadge } from './data-state'
import type { Timeframe } from '@/lib/analysis/types'
import { filterKlineOverlaysForDisplay, type ChartCandle, type KlineOverlay } from '@/lib/chart-types'
import type { DataStatus } from '@/lib/data-status'
import {
  buildTradingViewWidgetEmbedUrl,
  toTradingViewInterval,
  toTradingViewSymbol,
} from '@/lib/market/tradingview-links'
import { cn } from '@/lib/utils'

const TFS = ['1分钟', '15分钟', '1小时', '4小时', '1天'] as const
const TF_TO_INTERVAL: Record<(typeof TFS)[number], Timeframe> = {
  '1分钟': '1m',
  '15分钟': '15m',
  '1小时': '1h',
  '4小时': '4h',
  '1天': '1d',
}
const EMPTY_OVERLAYS: KlineOverlay[] = []

type TradingViewPayload = {
  interval: string | null
  symbol: string | null
  url: string | null
}

type KlineResourcePayload = {
  status: DataStatus
  data: ChartCandle[]
  overlays?: KlineOverlay[]
  tradingView?: TradingViewPayload
  updatedAt?: string
  ageSec?: number
  source?: string
  reason?: string
}

function normalizeTradingPair(value: string) {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /(USDT|USDC|USD)$/u.test(clean) ? clean : `${clean}USDT`
}

function isTimeframe(value: string | null | undefined): value is Timeframe {
  return value === '1m' || value === '5m' || value === '15m' || value === '30m' || value === '1h' || value === '4h' || value === '1d' || value === '1w'
}

function widgetInterval(value: string | null | undefined, fallback: Timeframe) {
  if (isTimeframe(value)) {
    return toTradingViewInterval(value)
  }
  return value || toTradingViewInterval(fallback)
}

export function KlinePanel({
  bare = false,
  candles,
  initialAgeSec,
  initialReason,
  initialSource,
  initialStatus = 'empty',
  initialTradingView,
  initialUpdatedAt,
  initialOverlays = EMPTY_OVERLAYS,
  symbol,
}: {
  bare?: boolean
  candles?: ChartCandle[]
  initialAgeSec?: number
  initialReason?: string
  initialSource?: string
  initialStatus?: DataStatus
  initialTradingView?: TradingViewPayload
  initialUpdatedAt?: string
  initialOverlays?: KlineOverlay[]
  symbol?: string
}) {
  const [tf, setTf] = useState<(typeof TFS)[number]>('4小时')
  const [remote, setRemote] = useState<KlineResourcePayload>({
    ageSec: initialAgeSec,
    data: candles ?? [],
    overlays: initialOverlays,
    reason: initialReason,
    source: initialSource,
    status: initialStatus,
    tradingView: initialTradingView,
    updatedAt: initialUpdatedAt,
  })

  useEffect(() => {
    setRemote({
      ageSec: initialAgeSec,
      data: candles ?? [],
      overlays: initialOverlays,
      reason: initialReason,
      source: initialSource,
      status: initialStatus,
      tradingView: initialTradingView,
      updatedAt: initialUpdatedAt,
    })
  }, [candles, initialAgeSec, initialOverlays, initialReason, initialSource, initialStatus, initialTradingView, initialUpdatedAt])

  useEffect(() => {
    if (!symbol) return
    if (tf === '4小时' && candles?.length) {
      setRemote({
        ageSec: initialAgeSec,
        data: candles,
        overlays: initialOverlays,
        reason: initialReason,
        source: initialSource,
        status: initialStatus,
        tradingView: initialTradingView,
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
  }, [candles, initialAgeSec, initialOverlays, initialReason, initialSource, initialStatus, initialTradingView, initialUpdatedAt, symbol, tf])

  const displayCandles = remote.data
  const displayOverlays = filterKlineOverlaysForDisplay(remote.overlays, {
    allowReadyTradePlan: remote.status === 'live',
  })
  const activeInterval = TF_TO_INTERVAL[tf]
  const tradingViewSymbol = remote.tradingView?.symbol
    || (symbol ? toTradingViewSymbol({ exchange: 'BINANCE', symbol: normalizeTradingPair(symbol) }) : null)
  const tradingViewEmbedUrl = tradingViewSymbol
    ? buildTradingViewWidgetEmbedUrl({
      interval: widgetInterval(remote.tradingView?.interval, activeInterval),
      symbol: tradingViewSymbol,
    })
    : null
  const tradingViewExternalUrl = remote.tradingView?.url
    || (tradingViewSymbol
      ? `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tradingViewSymbol)}&interval=${encodeURIComponent(toTradingViewInterval(activeInterval))}`
      : null)

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
          {tradingViewEmbedUrl ? (
            <span className="text-neon">TradingView 主图</span>
          ) : (
            <>
              <span className="flex items-center gap-1">
                <span className="size-2 bg-up" />阳线
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 bg-down" />阴线
              </span>
            </>
          )}
        </div>
      </div>
      <div className="px-3 pb-2 pt-3">
        <DegradeNotice status={remote.status} reason={remote.reason} className="mb-3" />
        {tradingViewEmbedUrl ? (
          <>
            <div className="overflow-hidden border border-border bg-black">
              <iframe
                title={`${symbol ?? 'Market'} TradingView chart`}
                src={tradingViewEmbedUrl}
                className="h-[440px] w-full border-0"
                loading="lazy"
                allowFullScreen
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>
                主图来自 TradingView，后端继续负责关键位、证据链和交易计划。
              </span>
              {tradingViewExternalUrl && (
                <a
                  href={tradingViewExternalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-neon underline-offset-4 hover:underline"
                >
                  打开 TradingView
                </a>
              )}
            </div>
            {displayOverlays.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {displayOverlays.slice(0, 10).map((overlay) => (
                  <span
                    key={`${overlay.kind}-${overlay.id}`}
                    className="border border-border bg-secondary/40 px-2 py-1 font-mono text-[10px] text-muted-foreground"
                    title={overlay.detail}
                  >
                    {overlay.label} {overlay.price >= 1 ? overlay.price.toFixed(3) : overlay.price.toFixed(5)}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : displayCandles.length > 0 ? (
          <>
            <KlineChart
              allowReadyTradePlanOverlays={remote.status === 'live'}
              candles={displayCandles}
              overlays={displayOverlays}
            />
            {displayOverlays.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {displayOverlays.slice(0, 8).map((overlay) => (
                  <span
                    key={`${overlay.kind}-${overlay.id}`}
                    className="border border-border bg-secondary/40 px-2 py-1 font-mono text-[10px] text-muted-foreground"
                    title={overlay.detail}
                  >
                    {overlay.label} {overlay.price >= 1 ? overlay.price.toFixed(3) : overlay.price.toFixed(5)}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="grid min-h-[320px] place-items-center border border-dashed border-border bg-secondary/20 px-4 text-center text-sm text-muted-foreground">
            {remote.reason ?? '等待真实 K 线数据'}
          </div>
        )}
      </div>
    </div>
  )
}
