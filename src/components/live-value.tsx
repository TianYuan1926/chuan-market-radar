'use client'

import { useEffect, useRef, useState } from 'react'
import { fmtUsd } from '@/lib/mock-data'
import { useLiveNumber } from '@/lib/use-live-number'
import { useLiveQuote, type LiveQuote } from '@/lib/live-store'
import { cn } from '@/lib/utils'

/**
 * LiveValue —— 实时数值组件。
 *
 * 当 `value` prop 变化时：
 *   1. 数字从旧值平滑补间到新值
 *   2. 按方向闪烁（上涨绿 / 下跌红），自动恢复
 *
 * 对接后端：把订阅/轮询得到的最新数值直接传入 `value` 即可，
 * 例如 `<LiveValue value={livePrice} format={fmtUsd} />`。
 */
export function LiveValue({
  value,
  format = (n) => n.toLocaleString('en-US'),
  duration = 650,
  flash = true,
  className,
}: {
  value: number
  format?: (n: number) => string
  duration?: number
  flash?: boolean
  className?: string
}) {
  const [display, setDisplay] = useState(value)
  const [dir, setDir] = useState<'up' | 'down' | null>(null)
  const prev = useRef(value)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    const from = prev.current
    const to = value
    if (from === to) return

    if (flash) setDir(to > from ? 'up' : 'down')

    const start = performance.now()
    const step = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
      setDisplay(from + (to - from) * eased)
      if (p < 1) {
        raf.current = requestAnimationFrame(step)
      } else {
        prev.current = to
      }
    }
    raf.current = requestAnimationFrame(step)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [value, duration, flash])

  // 闪烁动画结束后清除方向，便于下次重新触发
  useEffect(() => {
    if (!dir) return
    const t = setTimeout(() => setDir(null), 800)
    return () => clearTimeout(t)
  }, [dir])

  return (
    <span
      className={cn(
        'tabular-nums',
        dir === 'up' && 'flash-up',
        dir === 'down' && 'flash-down',
        className,
      )}
    >
      {format(display)}
    </span>
  )
}

/**
 * LiveStat —— 通用实时统计值（跟随后端值变化 + 补间 + 可选闪烁）。
 * 适用于覆盖率、强弱指数、数据质量计数、命中率等非币种指标。
 * `volatility` 等参数仅为兼容旧 UI 调用保留，不再制造随机跳动。
 */
export function LiveStat({
  base,
  format,
  decimals,
  prefix = '',
  suffix = '',
  volatility = 0.01,
  intervalMs = 4200,
  min,
  max,
  flash = true,
  drift = false,
  className,
}: {
  base: number
  /** 自定义格式化（仅客户端组件可传函数）。 */
  format?: (n: number) => string
  /** 预设格式：小数位数（服务端组件用此替代 format 函数）。 */
  decimals?: number
  prefix?: string
  suffix?: string
  volatility?: number
  intervalMs?: number
  min?: number
  max?: number
  flash?: boolean
  drift?: boolean
  className?: string
}) {
  const v = useLiveNumber(base, { volatility, intervalMs, min, max, drift })
  const fmt =
    format ??
    ((n: number) =>
      `${prefix}${
        typeof decimals === 'number'
          ? n.toFixed(decimals)
          : Math.round(n).toLocaleString('en-US')
      }${suffix}`)
  return <LiveValue value={v} format={fmt} flash={flash} className={className} />
}

/**
 * LivePrice —— 便捷的实时价格组件（含 $ 前缀）。
 * 只展示传入的真实价格，不生成随机价格。
 */
export function LivePrice({
  base,
  className,
}: {
  base: number
  className?: string
}) {
  const v = useLiveNumber(base, {
    volatility: 0.0018,
    intervalMs: 2100,
    drift: true,
  })
  return (
    <LiveValue value={v} format={(n) => `$${fmtUsd(n)}`} className={className} />
  )
}

/**
 * LiveQuotePrice —— 订阅集中行情 store 的实时价格（含 $ 前缀）。
 * 各表格/列表的同一币种价格保持一致，并随后端推送补间 + 闪烁。
 */
export function LiveQuotePrice({
  id,
  className,
}: {
  id: string
  className?: string
}) {
  const q = useLiveQuote(id)
  return (
    <LiveValue
      value={q.price}
      format={(n) => `$${fmtUsd(n)}`}
      className={className}
    />
  )
}

/** LiveQuotePct —— 订阅集中行情 store 的实时涨跌幅（带涨绿跌红 + 闪烁）。 */
export function LiveQuotePct({
  id,
  field = 'change24h',
  className,
}: {
  id: string
  field?: keyof LiveQuote
  className?: string
}) {
  const q = useLiveQuote(id)
  const v = q[field]
  const up = v >= 0
  return (
    <LiveValue
      value={v}
      format={(n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`}
      className={cn(up ? 'text-up' : 'text-down', className)}
    />
  )
}
