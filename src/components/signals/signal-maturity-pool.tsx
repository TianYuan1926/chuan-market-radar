'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TokenAvatar } from '@/components/token-avatar'
import { StatusBadge, ResourceBoundary } from '@/components/data-state'
import {
  MATURITY_META,
  type SignalMaturity,
  type RadarSignal,
} from '@/lib/radar-contract'
import type { Resource } from '@/lib/data-status'
import { resource } from '@/lib/data-status'
import { Search, ArrowUpDown, ChevronRight, ShieldX, CheckCircle2, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

const TONE_TEXT: Record<string, string> = {
  live: 'text-up',
  neon: 'text-neon',
  warn: 'text-[oklch(0.82_0.15_75)]',
  down: 'text-down',
  muted: 'text-muted-foreground',
}
const TONE_CHIP: Record<string, string> = {
  live: 'border-up/40 bg-up/10 text-up',
  neon: 'border-neon/40 bg-neon/10 text-neon',
  warn: 'border-[oklch(0.8_0.15_75)]/40 bg-[oklch(0.8_0.15_75)]/10 text-[oklch(0.82_0.15_75)]',
  down: 'border-down/40 bg-down/10 text-down',
  muted: 'border-border bg-secondary/40 text-muted-foreground',
}
const DIR_TONE: Record<RadarSignal['direction'], string> = {
  多: 'text-up border-up/40 bg-up/10',
  空: 'text-down border-down/40 bg-down/10',
  观察: 'text-muted-foreground border-border bg-secondary/40',
}
const RISK_TONE: Record<RadarSignal['risk'], string> = {
  低: 'text-up',
  中: 'text-[oklch(0.82_0.15_75)]',
  高: 'text-down',
  极高: 'text-down',
}

type SortKey = 'maturity' | 'rr' | 'evidence' | 'recent'
const MATURITY_ORDER: SignalMaturity[] = [
  'TRADE_PLAN_READY',
  'EVIDENCE_SIGNAL',
  'DEEP_SCAN_CANDIDATE',
  'LIGHT_SCAN_MARK',
  'COOLDOWN',
  'BLOCKED',
  'INVALIDATED',
]

const EMPTY_SIGNALS = resource<RadarSignal[]>(
  [],
  'empty',
  {
    source: 'frontend-contract',
    reason: '未收到后端信号契约，禁止使用演示信号兜底',
  },
)

export function SignalMaturityPool({ signals }: { signals?: Resource<RadarSignal[]> }) {
  const res = signals ?? EMPTY_SIGNALS
  const all = res.data

  const [query, setQuery] = useState('')
  const [maturityFilter, setMaturityFilter] = useState<SignalMaturity | 'ALL'>('ALL')
  const [dirFilter, setDirFilter] = useState<RadarSignal['direction'] | 'ALL'>('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('maturity')

  // 各成熟度计数
  const counts = useMemo(() => {
    const m = new Map<SignalMaturity, number>()
    for (const s of all) m.set(s.maturity, (m.get(s.maturity) ?? 0) + 1)
    return m
  }, [all])

  const filtered = useMemo(() => {
    let rows = all
    if (query.trim()) {
      const q = query.trim().toUpperCase()
      rows = rows.filter((s) => s.symbol.includes(q))
    }
    if (maturityFilter !== 'ALL') rows = rows.filter((s) => s.maturity === maturityFilter)
    if (dirFilter !== 'ALL') rows = rows.filter((s) => s.direction === dirFilter)
    const sorted = [...rows]
    sorted.sort((a, b) => {
      if (sortKey === 'rr') return (b.rr ?? -1) - (a.rr ?? -1)
      if (sortKey === 'evidence') return b.evidenceCount - a.evidenceCount
      if (sortKey === 'recent') return a.updatedMinAgo - b.updatedMinAgo
      return MATURITY_META[a.maturity].order - MATURITY_META[b.maturity].order
    })
    return sorted
  }, [all, query, maturityFilter, dirFilter, sortKey])

  return (
    <section className="border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <span className="h-3.5 w-1 bg-neon" />
        <Layers className="size-4 text-neon" />
        <h2 className="font-semibold">信号成熟度池</h2>
        <StatusBadge status={res.status} />
        <span className="ml-auto text-xs text-muted-foreground">
          共 {all.length} 条 · 展示 {filtered.length} 条
        </span>
      </div>

      {/* 成熟度分区 chips（可点击筛选） */}
      <div className="flex flex-wrap gap-1.5 border-b border-border px-5 py-3">
        <FilterChip active={maturityFilter === 'ALL'} onClick={() => setMaturityFilter('ALL')}>
          全部 {all.length}
        </FilterChip>
        {MATURITY_ORDER.map((m) => {
          const meta = MATURITY_META[m]
          const c = counts.get(m) ?? 0
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMaturityFilter(maturityFilter === m ? 'ALL' : m)}
              className={cn(
                'border px-2 py-0.5 text-[11px] font-medium transition-colors',
                maturityFilter === m ? TONE_CHIP[meta.tone] : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
              )}
              title={meta.label}
            >
              {meta.label} {c}
            </button>
          )
        })}
      </div>

      {/* 搜索 / 方向 / 排序 工具条 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2.5">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索币种…"
            className="w-full border border-border bg-secondary/30 py-1.5 pl-7 pr-2 text-sm outline-none focus:border-neon/50"
          />
        </div>
        <div className="flex border border-border">
          {(['ALL', '多', '空', '观察'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirFilter(d)}
              className={cn(
                'px-2.5 py-1.5 text-xs transition-colors',
                dirFilter === d ? 'bg-neon/15 text-neon' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {d === 'ALL' ? '全部' : d}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 border border-border px-2 py-1.5 text-xs text-muted-foreground">
          <ArrowUpDown className="size-3.5" />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="bg-transparent text-foreground outline-none"
          >
            <option value="maturity">按成熟度</option>
            <option value="rr">按赔率 RR</option>
            <option value="evidence">按证据数</option>
            <option value="recent">按最新</option>
          </select>
        </label>
      </div>

      {/* 信号列表：可滚动，支持任意数量（不写死 Top5） */}
      <div className="px-5 pt-3">
        <ResourceBoundary resource={res} isEmpty={() => all.length === 0} emptyText="暂无信号">
          <div
            key={`${maturityFilter}-${dirFilter}-${sortKey}`}
            className="fade-swap -mx-5 max-h-[640px] divide-y divide-border overflow-y-auto"
          >
            {filtered.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                没有符合条件的信号
              </div>
            ) : (
              filtered.map((s) => <SignalRow key={s.id} signal={s} />)
            )}
          </div>
        </ResourceBoundary>
      </div>
    </section>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'border px-2 py-0.5 text-[11px] font-medium transition-colors',
        active ? 'border-neon/50 bg-neon/15 text-neon' : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function SignalRow({ signal: s }: { signal: RadarSignal }) {
  const meta = MATURITY_META[s.maturity]
  const tradable = s.maturity === 'TRADE_PLAN_READY'
  return (
    <Link
      href={`/token/${s.symbol.toLowerCase()}`}
      className="row-rail group block px-5 py-3.5 transition-colors hover:bg-secondary/40"
    >
      <div className="flex items-center gap-3">
        <TokenAvatar symbol={s.symbol} hue={s.hue} size={30} />
        <span className="font-mono font-bold">{s.symbol}</span>
        <span className={cn('border px-1.5 py-0.5 text-[10px] font-semibold', DIR_TONE[s.direction])}>
          {s.direction}
        </span>
        <span className={cn('border px-1.5 py-0.5 text-[10px] font-semibold', TONE_CHIP[meta.tone])}>
          {meta.label}
        </span>
        <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      {/* 关键指标行 */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px]">
        <span className="text-muted-foreground">
          RR <span className={cn('font-bold', s.rr ? 'text-foreground' : 'text-muted-foreground')}>{s.rr ?? '—'}</span>
        </span>
        <span className="text-muted-foreground">
          风险 <span className={cn('font-bold', RISK_TONE[s.risk])}>{s.risk}</span>
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <CheckCircle2 className="size-3 text-up" />
          证据 <span className="font-bold text-foreground">{s.evidenceCount}</span>
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <ShieldX className="size-3 text-down" />
          反证 <span className="font-bold text-foreground">{s.counterCount}</span>
        </span>
        <span className={cn('text-muted-foreground', TONE_TEXT[s.freshness === 'live' ? 'live' : s.freshness === 'cached' ? 'neon' : 'warn'])}>
          数据 {s.freshness === 'live' ? '实时' : s.freshness === 'cached' ? '缓存' : '过期'}
        </span>
        <span className="text-muted-foreground">{s.updatedMinAgo}m 前</span>
      </div>

      {/* 为何入选 / 为何不可交易 */}
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        <span className="text-up">入选：</span>
        {s.whySelected}
      </p>
      {s.whyBlocked ? (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-down/90">
          <span className="font-semibold">不可交易：</span>
          {s.whyBlocked}
        </p>
      ) : tradable ? (
        <p className="mt-1 text-xs font-medium text-up">交易计划就绪，可进入详情查看入场/止损/目标</p>
      ) : null}
    </Link>
  )
}
