'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { TokenAvatar } from './token-avatar'
import { LiveQuotePrice, LiveQuotePct, LiveStat } from './live-value'
import { fmtCap, type Token } from '@/lib/mock-data'
import { fmtKnownCap, hasKnownPositiveValue } from '@/lib/display-format'
import { usePrimeLiveQuotes, type LiveQuote } from '@/lib/live-store'
import { cn } from '@/lib/utils'

type Tab = 'gainers' | 'losers'

const PER_PAGE = 20

const COLS: { key: keyof LiveQuote; label: string }[] = [
  { key: 'change1h', label: '1小时' },
  { key: 'change24h', label: '24小时' },
  { key: 'change7d', label: '7天' },
  { key: 'change30d', label: '30天' },
]

export function LeaderboardTable({ tokens }: { tokens: Token[] }) {
  const [tab, setTab] = useState<Tab>('gainers')
  const [page, setPage] = useState(1)
  usePrimeLiveQuotes(tokens)

  const sorted = useMemo(() => {
    return [...tokens].sort((a, b) =>
      tab === 'gainers' ? b.change24h - a.change24h : a.change24h - b.change24h,
    )
  }, [tokens, tab])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE))

  // 切换榜单时回到第 1 页
  useEffect(() => {
    setPage(1)
  }, [tab])

  const rows = useMemo(
    () => sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [sorted, page],
  )

  return (
    <div>
      <div className="flex gap-2">
        {(
          [
            ['gainers', '涨幅榜'],
            ['losers', '跌幅榜'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'border px-5 py-2.5 text-sm font-semibold transition-all',
              tab === id
                ? 'border-neon/50 bg-neon-soft text-neon neon-border'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">币种</th>
              <th className="px-4 py-3 font-medium">当前币价($)</th>
              <th className="px-4 py-3 font-medium">市值</th>
              <th className="px-4 py-3 font-medium">24H 成交额</th>
              {COLS.map((c) => (
                <th key={c.key} className="px-4 py-3 text-right font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => {
              const rank = (page - 1) * PER_PAGE + i + 1
              return (
              <tr
                key={t.id}
                className="group border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40"
              >
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'font-mono',
                      rank <= 3
                        ? 'font-bold text-neon'
                        : 'text-muted-foreground',
                    )}
                  >
                    {rank}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/token/${t.id}`}
                    className="flex items-center gap-2.5"
                  >
                    <TokenAvatar symbol={t.symbol} hue={t.hue} size={30} />
                    <div>
                      <div className="font-mono font-semibold transition-colors group-hover:text-neon">
                        {t.symbol}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.name}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono">
                  <LiveQuotePrice id={t.id} />
                </td>
                <td className="px-4 py-3 font-mono text-muted-foreground">
                  {hasKnownPositiveValue(t.marketCap) ? (
                    <LiveStat
                      base={t.marketCap}
                      format={fmtCap}
                      volatility={0.004}
                      flash={false}
                    />
                  ) : (
                    <span>{fmtKnownCap(t.marketCap)}</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-muted-foreground">
                  <LiveStat
                    base={t.volume24h}
                    format={fmtCap}
                    volatility={0.02}
                    drift
                  />
                </td>
                {COLS.map((c) => (
                  <td
                    key={c.key}
                    className="px-4 py-3 text-right font-mono font-medium"
                  >
                    <LiveQuotePct id={t.id} field={c.key} />
                  </td>
                ))}
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 分页（每页 20 条） */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            共 {sorted.length} 个币种 · 第 {page}/{totalPages} 页
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="grid size-8 place-items-center border border-border text-muted-foreground transition-colors hover:border-neon/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="上一页"
            >
              <ChevronLeft className="size-4" />
            </button>
            {Array.from({ length: totalPages }).map((_, i) => {
              const p = i + 1
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    'grid size-8 place-items-center border text-[13px] font-semibold transition-colors',
                    p === page
                      ? 'border-neon/50 bg-neon-soft text-neon'
                      : 'border-border text-muted-foreground hover:border-neon/40 hover:text-foreground',
                  )}
                >
                  {p}
                </button>
              )
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="grid size-8 place-items-center border border-border text-muted-foreground transition-colors hover:border-neon/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="下一页"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
