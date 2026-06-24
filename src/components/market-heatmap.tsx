'use client'

import Link from 'next/link'
import { LiveValue } from './live-value'
import { useLiveQuote, usePrimeLiveQuotes } from '@/lib/live-store'
import type { Token } from '@/lib/frontend-market-types'
import { cn } from '@/lib/utils'

export function MarketHeatmap({ tokens }: { tokens: Token[] }) {
  usePrimeLiveQuotes(tokens)
  const list = tokens.slice(0, 9)
  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-semibold">市场热力</span>
        <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <span className="relative flex size-1.5">
            <span className="relative inline-flex size-1.5 rounded-full bg-up" />
          </span>
          行情快照
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 p-3">
        {list.map((t, i) => (
          <HeatCell key={t.id} id={t.id} symbol={t.symbol} delay={i * 50} />
        ))}
      </div>
    </div>
  )
}

function HeatCell({
  id,
  symbol,
  delay,
}: {
  id: string
  symbol: string
  delay: number
}) {
  const q = useLiveQuote(id)
  const up = q.change24h >= 0
  // 颜色强度跟随后端行情快照变化。
  const mag = Math.min(1, Math.abs(q.change24h) / 80)
  const hue = up ? 155 : 20
  return (
    <Link
      href={`/token/${id}`}
      className="animate-float-up border p-3 text-center transition-all duration-700 hover:scale-[1.03]"
      style={{
        background: `oklch(${0.24 + mag * 0.06} ${0.06 + mag * 0.12} ${hue} / ${0.25 + mag * 0.5})`,
        borderColor: `oklch(0.7 0.16 ${hue} / ${0.2 + mag * 0.4})`,
        animationDelay: `${delay}ms`,
      }}
    >
      <div className="font-mono text-sm font-bold text-foreground">{symbol}</div>
      <LiveValue
        value={q.change24h}
        format={(n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`}
        className={cn(
          'mt-1 block font-mono text-xs font-semibold',
          up ? 'text-up' : 'text-down',
        )}
      />
    </Link>
  )
}
