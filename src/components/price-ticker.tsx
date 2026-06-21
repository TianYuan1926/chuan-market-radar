'use client'

import { getTokens } from '@/lib/mock-data'
import { TokenAvatar } from './token-avatar'
import { LiveQuotePrice, LiveQuotePct } from './live-value'

export function PriceTicker() {
  const tokens = getTokens()
  const row = [...tokens, ...tokens]
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
