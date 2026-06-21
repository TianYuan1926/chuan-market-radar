'use client'

import { useMemo, useState } from 'react'
import { KlineChart } from './kline-chart'
import { getCandles } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const TFS = ['1分钟', '15分钟', '1小时', '4小时', '1天'] as const

export function KlinePanel({
  seed,
  startPrice,
  bare = false,
}: {
  seed: number
  startPrice: number
  bare?: boolean
}) {
  const [tf, setTf] = useState<(typeof TFS)[number]>('4小时')

  const candles = useMemo(() => {
    const i = TFS.indexOf(tf)
    return getCandles(seed + i * 17, 80, startPrice)
  }, [tf, seed, startPrice])

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
          <span className="flex items-center gap-1">
            <span className="size-2 bg-up" />阳线
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 bg-down" />阴线
          </span>
        </div>
      </div>
      <div className="px-3 pb-2 pt-3">
        <KlineChart candles={candles} />
      </div>
    </div>
  )
}
