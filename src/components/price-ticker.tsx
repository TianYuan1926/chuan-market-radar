'use client'

import { getTokens, type Token } from '@/lib/mock-data'
import { TokenAvatar } from './token-avatar'
import { LiveQuotePrice, LiveQuotePct } from './live-value'
import { usePrimeLiveQuotes } from '@/lib/live-store'

export function PriceTicker({ tokens }: { tokens?: Token[] }) {
  const tokenRows = tokens ?? getTokens()
  usePrimeLiveQuotes(tokenRows)
  const tokensToShow = tokenRows.slice(0, 24)
  const row = [...tokensToShow, ...tokensToShow]

  if (row.length === 0) {
    return (
      <div className="border-y border-border bg-card/40 py-2.5 text-center text-xs text-muted-foreground">
        等待行情榜单数据
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden border-y border-border bg-card/40 py-2.5">
      <div className="animate-ticker flex w-max items-center gap-8 whitespace-nowrap">
        {row.map((t, i) => (
          <div key={i} className="flex items-center gap-2 font-mono text-sm">
            <TokenAvatar symbol={t.symbol} hue={t.hue} size={20} />
            <span className="font-semibold text-foreground">{t.symbol}</span>
            <LiveQuotePrice id={t.id} className="text-muted-foreground" />
            <LiveQuotePct id={t.id} />
          </div>
        ))}
      </div>
    </div>
  )
}
