'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TokenAvatar } from '@/components/token-avatar'
import { FreshnessTag, StatusBadge, ResourceBoundary } from '@/components/data-state'
import {
  LEADERBOARD_META,
  type LeaderboardKind,
  type LeaderboardRow,
} from '@/lib/radar-contract'
import type { Resource } from '@/lib/data-status'
import { resource } from '@/lib/data-status'
import { fmtUsd, hasKnownPositiveValue } from '@/lib/display-format'
import { cn } from '@/lib/utils'
import { ListOrdered, ChevronRight } from 'lucide-react'

const KINDS: LeaderboardKind[] = [
  'gainers',
  'losers',
  'volume',
  'volatility_squeeze',
  'relative_strength',
  'oi_change',
  'funding_hot',
]

function formatValue(kind: LeaderboardKind, v: number): string {
  if (kind === 'funding_hot') return `${v > 0 ? '+' : ''}${v.toFixed(4)}%`
  if (kind === 'gainers' || kind === 'losers' || kind === 'oi_change') return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
  if (kind === 'volume') {
    if (Math.abs(v) >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
    return `$${v.toLocaleString()}`
  }
  return v.toFixed(0)
}

function formatPrice(value: number): string {
  return hasKnownPositiveValue(value) ? `$${fmtUsd(value)}` : '等待价格'
}

function emptyLeaderboard(kind: LeaderboardKind) {
  return resource<LeaderboardRow[]>(
    [],
    'empty',
    {
      source: 'frontend-contract',
      reason: `未收到后端 ${LEADERBOARD_META[kind].label} 契约，禁止使用演示榜单兜底`,
    },
  )
}

// 扫描状态标记（候选池 / 深扫 / 信号 / 拦截 / 待扫）
function StatusFlags({ row }: { row: LeaderboardRow }) {
  const flags: { label: string; cls: string; show: boolean }[] = [
    { label: '候选池', cls: 'border-neon/40 bg-neon/10 text-neon', show: row.inCandidatePool },
    { label: '已深扫', cls: 'border-up/40 bg-up/10 text-up', show: row.deepScanned },
    { label: '有信号', cls: 'border-up/50 bg-up/15 text-up font-semibold', show: row.hasSignal },
    { label: '已拦截', cls: 'border-down/40 bg-down/10 text-down', show: row.blocked },
    { label: '待扫描', cls: 'border-[oklch(0.8_0.15_75)]/40 bg-[oklch(0.8_0.15_75)]/10 text-[oklch(0.82_0.15_75)]', show: row.awaitingScan },
  ]
  const active = flags.filter((f) => f.show)
  if (active.length === 0)
    return <span className="text-[10px] text-muted-foreground">未进入扫描</span>
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {active.map((f) => (
        <span key={f.label} className={cn('border px-1.5 py-0.5 text-[10px]', f.cls)}>
          {f.label}
        </span>
      ))}
    </div>
  )
}

export function MarketLeaderboards({
  initialLeaderboards,
}: {
  initialLeaderboards?: Partial<Record<LeaderboardKind, Resource<LeaderboardRow[]>>>
}) {
  const [kind, setKind] = useState<LeaderboardKind>('gainers')
  const res = initialLeaderboards?.[kind] ?? emptyLeaderboard(kind)
  const meta = LEADERBOARD_META[kind]

  return (
    <section className="border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <span className="h-3.5 w-1 bg-neon" />
        <ListOrdered className="size-4 text-neon" />
        <h2 className="font-semibold">全市场榜单</h2>
        <StatusBadge status={res.status} />
        <span className="ml-auto text-xs text-muted-foreground">指标：{meta.metric}</span>
        <FreshnessTag source={res.source} ageSec={res.ageSec} updatedAt={res.updatedAt} />
      </div>

      {/* 7 类榜单 tab */}
      <div className="flex flex-wrap gap-1.5 border-b border-border px-5 py-3">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              'border px-2.5 py-1 text-xs font-medium transition-colors',
              kind === k
                ? 'border-neon/50 bg-neon/15 text-neon'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {LEADERBOARD_META[k].label}
          </button>
        ))}
      </div>

      {/* 列表：切换榜单时整体淡入，行依次浮现 */}
      <div className="px-5 pt-3">
      <ResourceBoundary resource={res} isEmpty={(d) => d.length === 0} emptyText="该榜单暂无数据">
      <div
        key={kind}
        className="fade-swap -mx-5 max-h-[560px] divide-y divide-border overflow-y-auto"
      >
        {res.data.map((row, i) => {
          const pos = kind === 'losers' || row.value < 0
          return (
            <Link
              key={`${kind}-${row.symbol}`}
              href={`/token/${row.symbol.toLowerCase()}`}
              style={{ ['--i' as string]: Math.min(i, 12) }}
              className="row-rail tile-in group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-secondary/40"
            >
              <span className="w-5 shrink-0 text-center font-mono text-xs text-muted-foreground">
                {i + 1}
              </span>
              <TokenAvatar symbol={row.symbol} hue={row.hue} size={28} />
              <div className="min-w-0">
                <div className="font-mono text-sm font-bold">{row.symbol}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {formatPrice(row.price)}
                </div>
                <div className="max-w-[190px] truncate text-[10px] text-muted-foreground">
                  {row.sourceLabel ?? row.sortKey ?? '等待来源'}
                </div>
              </div>
              <span
                className={cn(
                  'ml-2 w-20 shrink-0 text-right font-mono text-sm font-bold',
                  kind === 'funding_hot' || kind === 'oi_change' || kind === 'gainers' || kind === 'losers'
                    ? pos
                      ? 'text-down'
                      : 'text-up'
                    : 'text-foreground',
                )}
              >
                {formatValue(kind, row.value)}
              </span>
              <div className="ml-auto hidden sm:block">
                <StatusFlags row={row} />
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          )
        })}
      </div>
      </ResourceBoundary>
      </div>
      <div className="border-t border-border px-5 py-2 text-center">
        <span className="text-[11px] text-muted-foreground">
          {res.reason ?? '榜单状态标记反映该币当前是否进入扫描/候选/信号流程'}
        </span>
      </div>
    </section>
  )
}
