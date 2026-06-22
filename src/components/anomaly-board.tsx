'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  ExternalLink,
  Search,
  Star,
  Target,
  Brain,
  Shield,
  Radio,
} from 'lucide-react'
import { TokenAvatar } from './token-avatar'
import { LiveValue } from './live-value'
import { useLiveQuote, usePrimeLiveQuotes } from '@/lib/live-store'
import { useLatestSignal } from '@/lib/signal-feed'
import {
  fmtUsd,
  fmtCap,
  POOL_META,
  type SignalCard,
  type SignalType,
  type PoolStatus,
} from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const TYPE_META: Record<SignalType, { label: string; cssVar: string }> = {
  PUMP: { label: 'PUMP', cssVar: '--sig-pump' },
  WHALE: { label: 'WHALE', cssVar: '--sig-whale' },
  LIQ: { label: 'LIQ', cssVar: '--sig-liq' },
  BREAK: { label: 'BREAK', cssVar: '--sig-break' },
  FLOW: { label: 'FLOW', cssVar: '--sig-flow' },
  CRASH: { label: 'CRASH', cssVar: '--sig-crash' },
}

const POOL_TONE: Record<string, string> = {
  up: 'var(--up)',
  down: 'var(--down)',
  warn: 'var(--sig-pump)',
  neon: 'var(--neon)',
  muted: 'var(--muted-foreground)',
}

const FILTERS: { id: PoolStatus | 'all'; label: string; hint?: string }[] = [
  { id: 'all', label: '全部候选' },
  { id: 'long', label: '多头候选', hint: '趋势结构偏多、量价配合，AI 倾向做多的优质机会' },
  { id: 'short', label: '空头候选', hint: '动能衰减或破位，AI 倾向做空的机会' },
  { id: 'waiting', label: '等待确认', hint: '信号雏形已现，等待放量/突破等确认条件' },
  { id: 'near', label: '接近触发', hint: '距入场触发条件已非常接近，请重点关注' },
  { id: 'high_risk', label: '高风险勿追', hint: '高位资金拥挤、风险极高，建议规避而非追入' },
  { id: 'low_odds', label: '赔率不足', hint: '潜在收益与风险不成比例，赔率偏低' },
  { id: 'insufficient', label: '数据不足', hint: '数据样本不足，信号可信度有限，仅作观察' },
  { id: 'expired', label: '已失效', hint: '触发窗口已过或结构破坏，信号已失效' },
]

// 最新推送的相对时间：基于确定性的 ageMin（距今分钟数），避免绝对时间戳显得过时
function fmtAge(ageMin: number): string {
  if (ageMin < 1) return '刚刚'
  if (ageMin < 60) return `${ageMin} 分钟前`
  const h = Math.floor(ageMin / 60)
  const m = ageMin % 60
  return m === 0 ? `${h} 小时前` : `${h} 小时 ${m} 分前`
}

// 多空方向
function direction(card: SignalCard): 'long' | 'short' {
  if (card.poolStatus === 'short' || card.poolStatus === 'high_risk') return 'short'
  if (card.poolStatus === 'long') return 'long'
  return card.token.trend === 'bear' ? 'short' : 'long'
}

// 分析逻辑文案
function analysisLogic(card: SignalCard): string[] {
  const t = card.token
  const dir = direction(card)
  const base = [
    `主力资金在 ${card.exchange} ${card.market}盘口出现 ×${card.volMult} 异常放量，AI 异动强度评分 ${t.anomalyScore}/100。`,
    `看涨情绪指数 ${card.bullSentiment}%，短线异动 ${card.shortAnomaly} 次、趋势异动 ${card.trendAnomaly} 次，资金活跃度显著高于均值。`,
  ]
  if (dir === 'long') {
    base.push(
      `自首次推送价 $${fmtUsd(card.pushPrice)} 以来已上行，量价齐升、链上换手放大，趋势结构偏多。`,
    )
  } else {
    base.push(
      `盘口买盘撤离、大额转入交易所，多头动能衰减，结构转弱，存在回调或破位风险。`,
    )
  }
  return base
}

// 入场策略
function entryPlan(card: SignalCard) {
  const dir = direction(card)
  const p = card.token.price
  const dp = (x: number) => +(p * x).toFixed(p < 0.01 ? 6 : 4)
  if (dir === 'long') {
    return {
      side: '做多 / Long',
      sideTone: 'var(--up)',
      entry: `$${fmtUsd(dp(0.97))} ~ $${fmtUsd(dp(1.01))}（回踩不破支撑分批建仓）`,
      stop: `$${fmtUsd(dp(0.92))}（跌破止损，约 -8%）`,
      targets: `T1 $${fmtUsd(dp(1.12))} · T2 $${fmtUsd(dp(1.28))} · T3 $${fmtUsd(dp(1.5))}`,
      size: `建议仓位 ≤ 15%，分 2-3 批进场，盈利后移动止损保护本金`,
    }
  }
  return {
    side: '做空 / Short',
    sideTone: 'var(--down)',
    entry: `$${fmtUsd(dp(1.0))} ~ $${fmtUsd(dp(1.04))}（反弹至阻力位分批做空）`,
    stop: `$${fmtUsd(dp(1.09))}（突破止损，约 -8%）`,
    targets: `T1 $${fmtUsd(dp(0.9))} · T2 $${fmtUsd(dp(0.8))} · T3 $${fmtUsd(dp(0.68))}`,
    size: `建议仓位 ≤ 12%，严格止损，避免逆势加仓`,
  }
}

const COLS =
  'grid-cols-[28px_36px_minmax(140px,1.4fr)_repeat(2,minmax(80px,0.9fr))_repeat(3,minmax(72px,0.8fr))_minmax(56px,0.6fr)_minmax(80px,0.8fr)_repeat(2,52px)_28px]'

type SortKey = 'score' | 'age' | 'gain' | 'drop' | 'cap' | 'sentiment'

const PAGE_SIZE = 20

export function AnomalyBoard({ cards }: { cards: SignalCard[] }) {
  const liveTokens = useMemo(() => cards.map((card) => card.token), [cards])
  usePrimeLiveQuotes(liveTokens)
  const [filter, setFilter] = useState<PoolStatus | 'all'>('all')
  const [starred, setStarred] = useState<Record<string, boolean>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('score')
  const [page, setPage] = useState(1)
  // 新信号通知：订阅全站信号源（提示音由全局服务统一播放，此处仅做视觉脉冲）
  const [signalPulse, setSignalPulse] = useState<{ symbol: string; id: number } | null>(null)
  const latestSignal = useLatestSignal()

  useEffect(() => {
    if (!latestSignal) return
    setSignalPulse({ symbol: latestSignal.symbol, id: latestSignal.id })
    const t = setTimeout(() => setSignalPulse(null), 4000)
    return () => clearTimeout(t)
  }, [latestSignal])

  const activeHint = FILTERS.find((f) => f.id === filter)?.hint

  // 各分类计数
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: cards.length }
    for (const c of cards) m[c.poolStatus] = (m[c.poolStatus] ?? 0) + 1
    return m
  }, [cards])

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase()
    let list = filter === 'all' ? cards : cards.filter((c) => c.poolStatus === filter)
    if (q)
      list = list.filter(
        (c) =>
          c.token.symbol.includes(q) ||
          c.token.name.toUpperCase().includes(q),
      )
    return [...list].sort((a, b) => {
      if (sort === 'age') return a.ageMin - b.ageMin
      if (sort === 'gain') {
        const ga = (a.token.price - a.pushPrice) / a.pushPrice
        const gb = (b.token.price - b.pushPrice) / b.pushPrice
        return gb - ga
      }
      if (sort === 'drop') {
        // 推送后跌幅：回撤最深（负得最多）的排在最前
        const da = (a.token.price - a.pushPrice) / a.pushPrice
        const db = (b.token.price - b.pushPrice) / b.pushPrice
        return da - db
      }
      if (sort === 'cap') return b.token.marketCap - a.token.marketCap
      if (sort === 'sentiment') return b.bullSentiment - a.bullSentiment
      return b.score - a.score
    })
  }, [cards, filter, query, sort])

  // 分页
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [rows, safePage],
  )

  // 筛选 / 排序 / 搜索变化时回到第 1 页
  useEffect(() => {
    setPage(1)
  }, [filter, query, sort])

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const active = filter === f.id
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold transition-all duration-200',
                  active
                    ? 'bg-neon-soft text-neon neon-border'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                {f.label}
                <span
                  className={cn(
                    'font-mono text-[11px]',
                    active ? 'text-neon' : 'text-muted-foreground/70',
                  )}
                >
                  {counts[f.id] ?? 0}
                </span>
              </button>
            )
          })}
        </div>

        {/* 实时新信号指示 */}
        <div
          className={cn(
            'ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-semibold transition-all duration-300',
            signalPulse
              ? 'animate-update-pop bg-neon-soft text-neon neon-border'
              : 'text-muted-foreground',
          )}
        >
          <Radio className={cn('size-3.5', signalPulse && 'animate-pulse')} />
          {signalPulse ? (
            <span>
              新信号 <span className="font-mono">{signalPulse.symbol}</span> 接入
            </span>
          ) : (
            <span className="hidden sm:inline">实时监听中</span>
          )}
        </div>
      </div>

      {/* 搜索 / 排序 */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 border border-border bg-card px-2.5 py-1.5">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索币种 / 名称"
            className="w-40 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-1 text-[12px]">
          <span className="text-muted-foreground">排序</span>
          {(
            [
              ['score', '评分'],
              ['gain', '推送后涨幅'],
              ['drop', '推送后跌幅'],
              ['sentiment', '情绪'],
              ['cap', '市值'],
              ['age', '最新'],
            ] as [SortKey, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={cn(
                'px-2 py-1 font-semibold transition-colors',
                sort === k
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[13px] text-muted-foreground">
          {rows.length} 条信号
        </span>
      </div>

      {/* 分类说明 */}
      {activeHint && (
        <div className="animate-float-up mt-3 flex items-center gap-2 border-l-2 border-neon bg-neon-soft px-3 py-2 text-[13px] text-foreground">
          <Crosshair className="size-4 shrink-0 text-neon" />
          {activeHint}
        </div>
      )}

      {/* 表格 */}
      <div className="mt-3 overflow-x-auto border border-border bg-card">
        <div className="min-w-[860px]">
          {/* 表头 */}
          <div
            className={cn(
              'grid items-center gap-2 border-b border-border px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
              COLS,
            )}
          >
            <span />
            <span className="text-center">#</span>
            <span>币种</span>
            <span className="text-right">首次推送</span>
            <span className="text-right">最新推送</span>
            <span className="text-right">推送价</span>
            <span className="text-right">现价</span>
            <span className="text-right">推送后</span>
            <span className="text-center">情绪</span>
            <span className="text-right">市值</span>
            <span className="text-center">短线</span>
            <span className="text-center">趋势</span>
            <span />
          </div>

          {/* 行 */}
          {pageRows.map((card, i) => {
            const idx = (safePage - 1) * PAGE_SIZE + i
            const t = card.token
            const meta = TYPE_META[card.type]
            const color = `var(${meta.cssVar})`
            const isStar = starred[card.id]
            const isOpen = open === card.id
            const plan = entryPlan(card)
            const logic = analysisLogic(card)
            return (
              <div
                key={card.id}
                className="animate-float-up border-b border-border/60 last:border-0"
                style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
              >
                {/* 主行 */}
                <div
                  className={cn(
                    'grid cursor-pointer items-center gap-2 px-3 py-2.5 text-[13px] transition-colors hover:bg-secondary/40',
                    isOpen && 'bg-secondary/50',
                    COLS,
                  )}
                  onClick={() => setOpen(isOpen ? null : card.id)}
                >
                  <button
                    aria-label="收藏"
                    onClick={(e) => {
                      e.stopPropagation()
                      setStarred((s) => ({ ...s, [card.id]: !s[card.id] }))
                    }}
                    className="text-muted-foreground transition-transform hover:scale-125 hover:text-neon"
                  >
                    <Star
                      className={cn('size-3.5', isStar && 'fill-neon text-neon')}
                    />
                  </button>
                  <span className="text-center font-mono text-muted-foreground">
                    {idx + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <TokenAvatar symbol={t.symbol} hue={t.hue} size={26} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-display font-bold leading-none text-foreground">
                          {t.symbol}
                        </span>
                        {t.tags.includes('Alpha') && (
                          <span className="bg-[var(--neon-soft)] px-1 py-0.5 text-[9px] font-bold text-neon">
                            Alpha
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold" style={{ color }}>
                          {meta.label}
                        </span>
                        <span
                          className="px-1 py-0.5 text-[9px] font-semibold leading-none"
                          style={{
                            color: POOL_TONE[POOL_META[card.poolStatus].tone],
                            background: `color-mix(in oklch, ${POOL_TONE[POOL_META[card.poolStatus].tone]} 14%, transparent)`,
                          }}
                        >
                          {POOL_META[card.poolStatus].label}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-right font-mono text-muted-foreground">
                    {card.firstPush}
                  </span>
                  <span
                    className={cn(
                      'flex items-center justify-end gap-1.5 text-right font-mono',
                      card.ageMin <= 8 ? 'text-up' : 'text-muted-foreground',
                    )}
                  >
                    {card.ageMin <= 8 && (
                      <span className="relative flex size-1.5" title="刚刚推送">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-70" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-up" />
                      </span>
                    )}
                    {fmtAge(card.ageMin)}
                  </span>
                  <span className="text-right font-mono">
                    ${fmtUsd(card.pushPrice)}
                  </span>
                  <LivePriceGainCells
                    id={t.id}
                    pushPrice={card.pushPrice}
                  />
                  <div className="flex justify-center">
                    <span
                      className={cn(
                        'inline-block w-12 text-center font-mono text-[12px] font-semibold',
                        card.bullSentiment >= 50 ? 'text-up' : 'text-down',
                      )}
                    >
                      {card.bullSentiment}%
                    </span>
                  </div>
                  <span className="text-right font-mono text-muted-foreground">
                    {fmtCap(t.marketCap)}
                  </span>
                  <span className="text-center font-mono text-foreground">
                    {card.shortAnomaly}
                  </span>
                  <span className="text-center font-mono text-foreground">
                    {card.trendAnomaly}
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-4 text-muted-foreground transition-transform',
                      isOpen && 'rotate-180 text-neon',
                    )}
                  />
                </div>

                {/* 展开：详情 / 分析逻辑 / 入场策略 */}
                {isOpen && (
                  <div className="animate-float-up grid gap-4 border-t border-border bg-background/60 px-4 py-4 lg:grid-cols-3">
                    {/* 详情 */}
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-foreground">
                        <Crosshair className="size-4 text-neon" />
                        信号详情
                      </div>
                      <p className="text-[13px] leading-relaxed text-muted-foreground">
                        {card.desc}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                        <Stat
                          label="信号评分"
                          value={`${card.score}/100`}
                          tone="var(--neon)"
                        />
                        <Stat
                          label="风险等级"
                          value={card.riskLevel}
                          tone={
                            card.riskLevel === '极高' || card.riskLevel === '高'
                              ? 'var(--down)'
                              : undefined
                          }
                        />
                        <Stat label="盈亏比" value={`${card.odds} : 1`} tone="var(--up)" />
                        <Stat
                          label="候选状态"
                          value={POOL_META[card.poolStatus].label}
                          tone={POOL_TONE[POOL_META[card.poolStatus].tone]}
                        />
                        <Stat label="交易所" value={card.exchange} />
                        <Stat label="市场" value={card.market} />
                      </div>
                      <Link
                        href={`/token/${t.id}`}
                        className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-neon hover:underline"
                      >
                        查看 K 线详情
                        <ExternalLink className="size-3.5" />
                      </Link>
                    </div>

                    {/* 分析逻辑 */}
                    <div className="lg:border-l lg:border-border lg:pl-4">
                      <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-foreground">
                        <Brain className="size-4 text-neon" />
                        AI 分析逻辑
                      </div>
                      <ul className="space-y-1.5">
                        {logic.map((l, i) => (
                          <li
                            key={i}
                            className="flex gap-1.5 text-[13px] leading-relaxed text-muted-foreground"
                          >
                            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-neon" />
                            {l}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* 入场策略 */}
                    <div className="lg:border-l lg:border-border lg:pl-4">
                      <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-foreground">
                        <Target className="size-4 text-neon" />
                        入场策略
                      </div>
                      <div
                        className="mb-2 inline-flex items-center gap-1.5 px-2 py-0.5 text-[12px] font-bold"
                        style={{
                          color: plan.sideTone,
                          background: `color-mix(in oklch, ${plan.sideTone} 14%, transparent)`,
                        }}
                      >
                        {plan.side}
                      </div>
                      <dl className="space-y-1.5 text-[12px]">
                        <PlanRow label="建议入场" value={plan.entry} />
                        <PlanRow label="止损" value={plan.stop} tone="var(--down)" />
                        <PlanRow label="目标位" value={plan.targets} tone="var(--up)" />
                        <PlanRow label="仓位管理" value={plan.size} />
                      </dl>
                      <p className="mt-2 flex items-start gap-1 text-[11px] text-muted-foreground">
                        <Shield className="mt-0.5 size-3 shrink-0" />
                        策略为 AI 模拟推演，仅供参考，不构成投资建议。
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 分页 */}
      {rows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[12px] text-muted-foreground">
            第 {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, rows.length)} 条 · 共 {rows.length} 条
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="flex items-center gap-1 border border-border px-2.5 py-1.5 text-[12px] font-semibold transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="size-3.5" />
              上一页
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    p === 1 ||
                    p === totalPages ||
                    Math.abs(p - safePage) <= 1,
                )
                .map((p, i, arr) => (
                  <span key={p} className="flex items-center gap-1">
                    {i > 0 && arr[i - 1] !== p - 1 && (
                      <span className="px-1 text-[12px] text-muted-foreground">…</span>
                    )}
                    <button
                      onClick={() => setPage(p)}
                      className={cn(
                        'min-w-8 px-2 py-1.5 text-center font-mono text-[12px] font-semibold transition-colors',
                        p === safePage
                          ? 'bg-neon-soft text-neon neon-border'
                          : 'border border-border text-muted-foreground hover:bg-secondary hover:text-foreground',
                      )}
                    >
                      {p}
                    </button>
                  </span>
                ))}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="flex items-center gap-1 border border-border px-2.5 py-1.5 text-[12px] font-semibold transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              下一页
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// 现价 + 推送后涨幅：订阅集中行情 store，价格跳动同时实时推导涨幅
function LivePriceGainCells({
  id,
  pushPrice,
}: {
  id: string
  pushPrice: number
}) {
  const q = useLiveQuote(id)
  const gain = ((q.price - pushPrice) / pushPrice) * 100
  const gUp = gain >= 0
  return (
    <>
      <LiveValue
        value={q.price}
        format={(n) => `$${fmtUsd(n)}`}
        className="text-right font-mono font-semibold"
      />
      <LiveValue
        value={gain}
        format={(n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`}
        className={cn(
          'text-right font-mono font-semibold',
          gUp ? 'text-up' : 'text-down',
        )}
      />
    </>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="flex items-center justify-between border border-border/60 px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold" style={tone ? { color: tone } : undefined}>
        {value}
      </span>
    </div>
  )
}

function PlanRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="flex gap-2">
      <dt className="w-14 shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className="flex-1 font-medium"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </dd>
    </div>
  )
}
