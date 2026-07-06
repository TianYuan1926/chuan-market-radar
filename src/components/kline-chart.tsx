'use client'

import { useEffect, useRef, useState } from 'react'
import { filterKlineOverlaysForDisplay, type ChartCandle, type KlineOverlay, type KlineOverlayTone } from '@/lib/chart-types'

type Props = {
  candles: ChartCandle[]
  height?: number
  overlays?: KlineOverlay[]
  allowReadyTradePlanOverlays?: boolean
}

const UP = 'oklch(0.78 0.17 155)'
const DOWN = 'oklch(0.66 0.22 20)'
const UP_SOFT = 'oklch(0.78 0.17 155 / 0.5)'
const DOWN_SOFT = 'oklch(0.66 0.22 20 / 0.5)'
const GRID = 'oklch(0.7 0.02 250 / 0.07)'
const AXIS = 'oklch(0.68 0.02 250 / 0.55)'
const NEON = 'oklch(0.77 0.16 62)'
const BG = 'oklch(0.15 0.008 260)'
const MONO = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
const OVERLAY_COLORS: Record<KlineOverlayTone, string> = {
  neutral: 'oklch(0.72 0.03 250 / 0.72)',
  resistance: 'oklch(0.66 0.22 20 / 0.9)',
  risk: 'oklch(0.62 0.24 28 / 0.95)',
  support: 'oklch(0.78 0.17 155 / 0.9)',
  target: 'oklch(0.77 0.16 62 / 0.95)',
}

function fmtP(p: number) {
  if (p >= 1000) return p.toFixed(1)
  if (p >= 1) return p.toFixed(3)
  return p.toFixed(5)
}

function withAlpha(color: string, alpha: number) {
  return color.replace(/\/\s*[\d.]+\)/, `/ ${alpha})`)
}

export function KlineChart({ candles, height = 440, overlays = [], allowReadyTradePlanOverlays = false }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<{ x: number; i: number } | null>(null)
  const [width, setWidth] = useState(800)

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver((entries) => {
      setWidth(Math.max(320, entries[0].contentRect.width))
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    // 布局：价格区 / 间隔 / 成交量区，明确分区避免脱钩
    const padL = 10
    const padR = 66
    const padT = 14
    const gap = 18
    const volH = 64
    const axisB = 22
    const plotW = width - padL - padR
    const priceH = height - padT - gap - volH - axisB
    const volTop = padT + priceH + gap

    const visibleOverlays = filterKlineOverlaysForDisplay(overlays, {
      allowReadyTradePlan: allowReadyTradePlanOverlays,
    })
      .filter((overlay) => Number.isFinite(overlay.price) && overlay.price > 0)
      .slice(0, 12)
    const overlayPrices = visibleOverlays.flatMap((overlay) =>
      [overlay.price, overlay.zoneLow, overlay.zoneHigh].filter((value): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value > 0
      )
    )
    const highs = [...candles.map((c) => c.h), ...overlayPrices]
    const lows = [...candles.map((c) => c.l), ...overlayPrices]
    const maxP = Math.max(...highs)
    const minP = Math.min(...lows)
    const pad = (maxP - minP) * 0.08 || 1
    const hi = maxP + pad
    const lo = minP - pad
    const range = hi - lo || 1
    const maxV = Math.max(...candles.map((c) => c.v))

    const yP = (p: number) => padT + (1 - (p - lo) / range) * priceH
    const yV = (v: number) => volTop + (1 - v / maxV) * volH
    const cw = plotW / candles.length
    const bodyW = Math.max(2.5, cw * 0.62)

    ctx.font = MONO
    ctx.textBaseline = 'middle'

    // 水平网格 + 右侧价格刻度
    ctx.textAlign = 'left'
    for (let g = 0; g <= 4; g++) {
      const y = padT + (priceH / 4) * g
      ctx.strokeStyle = GRID
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(padL, y + 0.5)
      ctx.lineTo(padL + plotW, y + 0.5)
      ctx.stroke()
      ctx.fillStyle = AXIS
      ctx.fillText(fmtP(hi - (range / 4) * g), padL + plotW + 8, y)
    }
    // 成交量区分隔基线
    ctx.strokeStyle = GRID
    ctx.beginPath()
    ctx.moveTo(padL, volTop + volH + 0.5)
    ctx.lineTo(padL + plotW, volTop + volH + 0.5)
    ctx.stroke()
    ctx.fillStyle = AXIS
    ctx.fillText('VOL', padL + plotW + 8, volTop + 8)

    // 竖向时间网格（每 ~6 根）
    const step = Math.ceil(candles.length / 6)
    ctx.textAlign = 'center'
    for (let i = 0; i < candles.length; i += step) {
      const x = padL + i * cw + cw / 2
      ctx.strokeStyle = GRID
      ctx.beginPath()
      ctx.moveTo(x + 0.5, padT)
      ctx.lineTo(x + 0.5, padT + priceH)
      ctx.stroke()
      ctx.fillStyle = AXIS
      ctx.fillText(`${i}`, x, height - axisB / 2)
    }

    // K 线 + 成交量
    candles.forEach((c, i) => {
      const x = padL + i * cw + cw / 2
      const up = c.c >= c.o
      const color = up ? UP : DOWN
      // 影线
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x + 0.5, yP(c.h))
      ctx.lineTo(x + 0.5, yP(c.l))
      ctx.stroke()
      // 实体
      const yo = yP(c.o)
      const yc = yP(c.c)
      const top = Math.min(yo, yc)
      const bh = Math.max(1.5, Math.abs(yc - yo))
      ctx.fillStyle = color
      ctx.fillRect(x - bodyW / 2, top, bodyW, bh)
      // 成交量柱
      ctx.fillStyle = up ? UP_SOFT : DOWN_SOFT
      const vy = yV(c.v)
      ctx.fillRect(x - bodyW / 2, vy, bodyW, volTop + volH - vy)
    })

    // 后端 v3 关键位 / Forward Map / 止损目标 overlay。只展示后端事实，不在前端生成交易判断。
    visibleOverlays.forEach((overlay, index) => {
      const y = yP(overlay.price)
      const color = OVERLAY_COLORS[overlay.tone] ?? OVERLAY_COLORS.neutral

      if (
        typeof overlay.zoneLow === 'number' &&
        typeof overlay.zoneHigh === 'number' &&
        Number.isFinite(overlay.zoneLow) &&
        Number.isFinite(overlay.zoneHigh) &&
        overlay.zoneHigh > overlay.zoneLow
      ) {
        const yTop = yP(overlay.zoneHigh)
        const yBottom = yP(overlay.zoneLow)
        ctx.fillStyle = withAlpha(color, 0.08)
        ctx.fillRect(padL, yTop, plotW, Math.max(1, yBottom - yTop))
      }

      ctx.strokeStyle = color
      ctx.lineWidth = overlay.kind === 'target' || overlay.kind === 'stop' ? 1.4 : 1
      ctx.setLineDash(overlay.kind === 'forward' ? [6, 5] : overlay.kind === 'target' ? [2, 4] : [])
      ctx.beginPath()
      ctx.moveTo(padL, y + 0.5)
      ctx.lineTo(padL + plotW, y + 0.5)
      ctx.stroke()
      ctx.setLineDash([])

      const labelY = Math.max(padT + 10, Math.min(padT + priceH - 10, y - (index % 3) * 12))
      const text = `${overlay.label} ${fmtP(overlay.price)}`
      const textW = ctx.measureText(text).width + 10
      ctx.fillStyle = 'oklch(0.13 0.01 260 / 0.82)'
      ctx.fillRect(padL + 6, labelY - 8, textW, 16)
      ctx.fillStyle = color
      ctx.textAlign = 'left'
      ctx.fillText(text, padL + 11, labelY)
    })

    // 最新价虚线 + 价签
    const last = candles[candles.length - 1]
    const ly = yP(last.c)
    ctx.strokeStyle = NEON
    ctx.lineWidth = 1
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(padL, ly + 0.5)
    ctx.lineTo(padL + plotW, ly + 0.5)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = NEON
    ctx.fillRect(padL + plotW, ly - 9, padR, 18)
    ctx.fillStyle = BG
    ctx.textAlign = 'left'
    ctx.fillText(fmtP(last.c), padL + plotW + 8, ly)

    // 十字光标
    if (hover) {
      const x = padL + hover.i * cw + cw / 2
      ctx.strokeStyle = 'oklch(0.77 0.16 62 / 0.45)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(x + 0.5, padT)
      ctx.lineTo(x + 0.5, volTop + volH)
      ctx.stroke()
      const hc = candles[hover.i]
      const hy = yP(hc.c)
      ctx.beginPath()
      ctx.moveTo(padL, hy + 0.5)
      ctx.lineTo(padL + plotW, hy + 0.5)
      ctx.stroke()
      ctx.setLineDash([])
      // 价标
      ctx.fillStyle = 'oklch(0.28 0.015 260)'
      ctx.fillRect(padL + plotW, hy - 9, padR, 18)
      ctx.fillStyle = 'oklch(0.96 0.005 250)'
      ctx.fillText(fmtP(hc.c), padL + plotW + 8, hy)
    }
  }, [allowReadyTradePlanOverlays, candles, height, hover, overlays, width])

  const onMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const padL = 10
    const padR = 66
    const cw = (width - padL - padR) / candles.length
    const i = Math.min(
      candles.length - 1,
      Math.max(0, Math.floor((x - padL) / cw)),
    )
    setHover({ x, i })
  }

  const hc = hover ? candles[hover.i] : candles[candles.length - 1]
  const hcUp = hc.c >= hc.o
  const chg = ((hc.c - hc.o) / hc.o) * 100

  return (
    <div ref={wrapRef} className="relative w-full">
      {/* OHLC 抬头信息条：始终展示当前/悬浮蜡烛数据，消除图表与数据的脱钩感 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-2 font-mono text-[11px]">
        {[
          ['开', hc.o],
          ['高', hc.h],
          ['低', hc.l],
          ['收', hc.c],
        ].map(([k, v]) => (
          <span key={k as string} className="text-muted-foreground">
            {k}{' '}
            <span className={hcUp ? 'text-up' : 'text-down'}>
              {fmtP(v as number)}
            </span>
          </span>
        ))}
        <span className={cn(hcUp ? 'text-up' : 'text-down', 'font-semibold')}>
          {hcUp ? '+' : ''}
          {chg.toFixed(2)}%
        </span>
        {overlays.length > 0 && (
          <span className="text-neon">
            关键线 {Math.min(overlays.length, 12)}
          </span>
        )}
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="cursor-crosshair"
      />
    </div>
  )
}

function cn(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(' ')
}
