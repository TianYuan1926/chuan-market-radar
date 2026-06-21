'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Crosshair,
  Target,
  Zap,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Check,
  X,
  Activity,
} from 'lucide-react'
import { TokenAvatar } from './token-avatar'
import { LiveValue } from './live-value'
import { useLiveQuote } from '@/lib/live-store'
import { playSound } from '@/lib/sound'
import { fmtUsd } from '@/lib/mock-data'
import { getSniperTargets, sideLabel, type SniperTarget } from '@/lib/sniper-data'
import { useTrainingEngine, getTrainingRow } from '@/lib/training-engine'
import { cn } from '@/lib/utils'

export function SniperBoard() {
  // 与复盘进化引擎共用的同一狙击目标池（按评分排序）
  const pool = useMemo(() => getSniperTargets(), [])

  // 复盘进化引擎当前正在评判的目标 → 用于榜单高亮联动
  const { idx, phase } = useTrainingEngine()
  const currentId = getTrainingRow(idx)?.id ?? null

  // 初始锁定前 N 个，其余作为储备，周期性"通过最终筛选"入榜
  const INITIAL = Math.min(6, pool.length)
  const [lockedIds, setLockedIds] = useState<string[]>(() =>
    pool.slice(0, INITIAL).map((c) => c.id),
  )
  const [justLocked, setJustLocked] = useState<string | null>(null)
  const [banner, setBanner] = useState<{
    symbol: string
    side: SniperTarget['side']
    id: number
  } | null>(null)
  const cursor = useRef(INITIAL)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (pool.length <= 1) return
    let alive = true
    function schedule() {
      // 14~26s 随机间隔，模拟新目标通过最终筛选入榜
      const delay = 14000 + Math.random() * 12000
      timer.current = setTimeout(() => {
        if (!alive) return
        const next = pool[cursor.current % pool.length]
        cursor.current += 1
        setLockedIds((prev) => [next.id, ...prev.filter((id) => id !== next.id)].slice(0, 8))
        setJustLocked(next.id)
        setBanner({ symbol: next.symbol, side: next.side, id: Date.now() })
        playSound('sniper')
        setTimeout(() => alive && setJustLocked(null), 1400)
        setTimeout(() => alive && setBanner(null), 4200)
        schedule()
      }, delay)
    }
    schedule()
    return () => {
      alive = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [pool])

  // 始终按评分从高到低展示：从已按评分排序的 pool 中筛出已锁定项，
  // 而非沿用锁定的时间顺序，确保榜单恒为评分降序。
  const locked = useMemo(
    () => pool.filter((c) => lockedIds.includes(c.id)),
    [lockedIds, pool],
  )

  if (pool.length === 0) return null

  const longs = locked.filter((c) => c.side === 'long').length
  const shorts = locked.length - longs

  return (
    <section className="relative overflow-hidden border border-neon/40 bg-card neon-border">
      {/* 扫描线 */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="animate-scan-line h-px w-full bg-gradient-to-r from-transparent via-neon to-transparent" />
      </div>

      {/* 标题栏 */}
      <header className="relative z-10 flex flex-wrap items-center gap-3 border-b border-neon/30 bg-neon-soft px-4 py-3">
        <span className="relative grid size-9 place-items-center">
          <Crosshair className="animate-scope-spin size-9 text-neon/40" />
          <Target className="absolute size-4 text-neon" />
        </span>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span className="sniper-title">狙击榜</span>
            <span className="bg-neon px-1.5 py-0.5 font-mono text-[10px] font-bold text-background">
              SNIPER
            </span>
          </h2>
          <p className="text-[12px] text-muted-foreground">
            通过 AI 最终筛选的高置信目标 · 复盘进化引擎全程实时复盘
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 font-mono text-xs">
          <span className="flex items-center gap-1 text-up">
            <TrendingUp className="size-3.5" />
            {longs} 看涨
          </span>
          <span className="flex items-center gap-1 text-down">
            <TrendingDown className="size-3.5" />
            {shorts} 看空
          </span>
        </div>
      </header>

      {/* 新目标锁定播报条 */}
      <div
        className={cn(
          'relative z-10 overflow-hidden border-b border-neon/20 bg-background/60 transition-all duration-300',
          banner ? 'max-h-12 py-2' : 'max-h-0 py-0',
        )}
      >
        {banner && (
          <div className="animate-update-pop flex items-center gap-2 px-4 text-[13px]">
            <Crosshair className="size-4 shrink-0 animate-pulse text-neon" />
            <span className="font-semibold text-neon">新目标锁定</span>
            <span className="font-mono font-bold">{banner.symbol}</span>
            <span
              className={cn(
                'inline-flex items-center gap-0.5 px-1.5 py-0.5 font-mono text-[10px] font-bold',
                banner.side === 'long' ? 'bg-up/15 text-up' : 'bg-down/15 text-down',
              )}
            >
              {banner.side === 'long' ? (
                <TrendingUp className="size-3" />
              ) : (
                <TrendingDown className="size-3" />
              )}
              {sideLabel(banner.side)}
            </span>
            <span className="text-muted-foreground">已通过最终筛选，进入狙击名单</span>
          </div>
        )}
      </div>

      {/* 目标卡片网格 */}
      <div className="relative z-10 grid gap-px bg-border p-px sm:grid-cols-2 xl:grid-cols-3">
        {locked.map((card) => (
          <SniperCard
            key={card.id}
            card={card}
            justLocked={justLocked === card.id}
            evaluating={currentId === card.id}
            evalPhase={phase}
          />
        ))}
      </div>
    </section>
  )
}

function SniperCard({
  card,
  justLocked,
  evaluating,
  evalPhase,
}: {
  card: SniperTarget
  justLocked: boolean
  evaluating: boolean
  evalPhase: 'analyzing' | 'revealed'
}) {
  const q = useLiveQuote(card.tokenId)
  const long = card.side === 'long'
  const sideTone = long ? 'var(--up)' : 'var(--down)'
  const gain = ((q.price - card.pushPrice) / card.pushPrice) * 100
  const gUp = gain >= 0

  return (
    <Link
      href={`/token/${card.tokenId}`}
      className={cn(
        'frame group relative block bg-card p-3 transition-colors hover:bg-secondary/40',
        justLocked && 'animate-target-lock',
        evaluating && 'bg-neon-soft',
      )}
    >
      {/* 方向色条 */}
      <span
        className="absolute inset-y-0 left-0 w-0.5"
        style={{ background: sideTone }}
        aria-hidden
      />

      {/* 复盘评判中标记 */}
      {evaluating && (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 bg-neon px-1.5 py-0.5 font-mono text-[9px] font-bold text-background">
          <Activity className="size-2.5 animate-pulse" />
          {evalPhase === 'analyzing' ? '复盘评判中' : '复盘揭晓'}
        </span>
      )}

      {/* 顶行：头像 + 代号 + 方向 */}
      <div className="flex items-center gap-2 pl-1.5">
        <TokenAvatar symbol={card.symbol} hue={card.hue} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-mono text-sm font-bold">{card.symbol}</span>
            <span
              className="inline-flex items-center gap-0.5 px-1 py-0.5 font-mono text-[9px] font-bold"
              style={{
                background: `color-mix(in oklch, ${sideTone} 16%, transparent)`,
                color: sideTone,
              }}
            >
              {long ? <TrendingUp className="size-2.5" /> : <TrendingDown className="size-2.5" />}
              {sideLabel(card.side)}
            </span>
          </div>
          <div className="truncate text-[11px] text-muted-foreground">{card.name}</div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      {/* 置信度条 */}
      <div className="mt-2.5 pl-1.5">
        <div className="flex items-center justify-between font-mono text-[10px]">
          <span className="text-muted-foreground">置信度</span>
          <span className="text-neon">{card.confidence}%</span>
        </div>
        <div className="mt-1 h-1 overflow-hidden bg-secondary">
          <div className="h-full bg-neon" style={{ width: `${card.confidence}%` }} />
        </div>
      </div>

      {/* 现价 + 推送后涨幅 */}
      <div className="mt-2.5 flex items-end justify-between pl-1.5">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">现价</div>
          <LiveValue
            value={q.price}
            format={(n) => `$${fmtUsd(n)}`}
            className="font-mono text-sm font-bold"
          />
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">推送后</div>
          <LiveValue
            value={gain}
            format={(n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`}
            className={cn('font-mono text-sm font-bold', gUp ? 'text-up' : 'text-down')}
          />
        </div>
      </div>

      {/* 核心策略逻辑 */}
      <p className="mt-2.5 pl-1.5 text-[11px] leading-relaxed text-muted-foreground">
        {card.thesis}
      </p>

      {/* 交易计划：建仓 / 止损 / 目标 */}
      <div className="mt-2.5 grid grid-cols-3 gap-px border border-border bg-border font-mono text-[10px]">
        <div className="bg-card p-1.5">
          <div className="text-muted-foreground">建仓区间</div>
          <div className="mt-0.5 text-foreground">
            {fmtUsd(card.entryLow)}~{fmtUsd(card.entryHigh)}
          </div>
        </div>
        <div className="bg-card p-1.5">
          <div className="text-muted-foreground">止损</div>
          <div className="mt-0.5 text-down">{fmtUsd(card.stop)}</div>
        </div>
        <div className="bg-card p-1.5">
          <div className="text-muted-foreground">目标</div>
          <div className="mt-0.5 text-up">
            {fmtUsd(card.target1)} / {fmtUsd(card.target2)}
          </div>
        </div>
      </div>

      {/* 多维信号清单 */}
      <div className="mt-2.5 flex flex-wrap gap-1 pl-1.5">
        {card.signals.map((s) => (
          <span
            key={s.label}
            className={cn(
              'inline-flex items-center gap-0.5 px-1 py-0.5 text-[9px]',
              s.hit ? 'bg-up/12 text-up' : 'bg-secondary text-muted-foreground line-through',
            )}
          >
            {s.hit ? <Check className="size-2.5" /> : <X className="size-2.5" />}
            {s.label}
          </span>
        ))}
      </div>

      {/* 底部：评分 / 盈亏比 / 风险 / 交易所 */}
      <div className="mt-2.5 flex items-center gap-3 border-t border-border pl-1.5 pt-2 font-mono text-[11px]">
        <span className="flex items-center gap-1">
          <Target className="size-3 text-neon" />
          <span className="text-neon">{card.score}</span>
          <span className="text-muted-foreground">分</span>
        </span>
        <span className="text-muted-foreground">
          盈亏比 <span className="text-foreground">{card.odds}</span>
        </span>
        <span className="flex items-center gap-1">
          <Zap className="size-3 text-muted-foreground" />
          <span className="text-muted-foreground">{card.riskLevel}风险</span>
        </span>
        <span className="ml-auto text-muted-foreground">{card.exchange}</span>
      </div>
    </Link>
  )
}
