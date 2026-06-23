'use client'

import Link from 'next/link'
import { Radio } from 'lucide-react'
import type { SignalCard, SignalType } from '@/lib/frontend-market-types'
import { cn } from '@/lib/utils'

const TYPE_VAR: Record<SignalType, string> = {
  PUMP: '--sig-pump',
  WHALE: '--sig-whale',
  LIQ: '--sig-liq',
  BREAK: '--sig-break',
  FLOW: '--sig-flow',
  CRASH: '--sig-crash',
}

const ALERT_TEXT: Record<SignalType, (card: SignalCard) => string> = {
  PUMP: (card) => `量能异动 ${card.volMult.toFixed(1)}x，等待证据链确认`,
  WHALE: (card) => `${card.poolStatus === 'waiting' ? '深扫候选' : '衍生品复核'} · ${card.desc}`,
  LIQ: (card) => `风险拥挤提示 · ${card.desc}`,
  BREAK: (card) => `结构突破候选 · RR ${card.odds.toFixed(1)}:1`,
  FLOW: (card) => `证据链更新 · ${card.score}/100`,
  CRASH: (card) => `下跌/风控候选 · ${card.desc}`,
}

type Alert = {
  id: string
  symbol: string
  tokenId: string
  type: SignalType
  text: string
  change: number
  time: string
}

export function LiveFeed({ cards }: { cards: SignalCard[] }) {
  const items: Alert[] = cards.slice(0, 9).map((c, index) => ({
    id: `${c.id}-${index}`,
    symbol: c.token.symbol,
    tokenId: c.token.id,
    type: c.type,
    text: ALERT_TEXT[c.type](c),
    change: c.token.change24h,
    time: c.lastPush || c.firstPush || '等待',
  }))

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Radio className="size-4 animate-pulse text-down" />
        <span className="font-semibold">实时预警</span>
        <span className="ml-auto rounded bg-down/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-down">
          LIVE
        </span>
      </div>
      <div className="max-h-[440px] divide-y divide-border/60 overflow-y-auto">
        {cards.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            暂无实时预警
          </div>
        )}
        {items.map((it, idx) => {
          const up = it.change >= 0
          const color = `var(${TYPE_VAR[it.type]})`
          // 最新一条（idx 0）做整行涨跌高亮，强化"新数据到达"反馈
          const flashClass =
            idx === 0 ? (up ? 'row-flash-up' : 'row-flash-down') : ''
          return (
            <Link
              key={it.id}
              href={`/token/${it.tokenId}`}
              className={cn(
                'animate-float-up block px-4 py-3 transition-colors hover:bg-secondary/40',
                flashClass,
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {it.time}
                </span>
                <span className="font-mono text-sm font-semibold">
                  {it.symbol}
                </span>
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: `color-mix(in oklch, ${color} 16%, transparent)`, color }}
                >
                  {it.type}
                </span>
                <span
                  className={cn(
                    'ml-auto font-mono text-xs font-semibold',
                    up ? 'text-up' : 'text-down',
                  )}
                >
                  {up ? '+' : ''}
                  {it.change.toFixed(1)}%
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{it.text}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
