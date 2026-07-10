'use client'

import Link from 'next/link'
import { useMemo } from 'react'
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
import { fmtUsd } from '@/lib/display-format'
import { sideLabel, type SniperTarget } from '@/lib/sniper-data'
import { MODULE_DISPLAY_NAMES } from '@/lib/ui-schema/display-names'
import { cn } from '@/lib/utils'

export function SniperBoard({ targets }: { targets?: SniperTarget[] }) {
  // Only backend-provided trade-plan-ready targets can enter the plan review board.
  const pool = useMemo(() => targets ?? [], [targets])

  const locked = useMemo(() => pool.slice(0, 8), [pool])

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
            <span className="sniper-title">{MODULE_DISPLAY_NAMES.planReadyBoard}</span>
            <span className="bg-neon px-1.5 py-0.5 font-mono text-[10px] font-bold text-background">
              计划就绪
            </span>
          </h2>
          <p className="text-[12px] text-muted-foreground">
            只展示后端证据、赔率、风控和失效条件齐全的完整计划样本
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

      {/* 目标卡片网格 */}
      {locked.length > 0 ? (
        <div className="relative z-10 grid gap-px bg-border p-px sm:grid-cols-2 xl:grid-cols-3">
          {locked.map((card) => (
            <SniperCard
              key={card.id}
              card={card}
              justLocked={false}
              evaluating={false}
              evalPhase="analyzing"
            />
          ))}
        </div>
      ) : (
        <div className="relative z-10 border-t border-neon/20 bg-background/55 px-4 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-9 place-items-center border border-neon/30 bg-neon-soft text-neon">
              <Crosshair className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">暂无通过最终筛选的后端计划样本</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                等待证据融合、赔率、风控和失效条件同时满足。验证候选仍会在下方候选区继续展示，不会被隐藏。
              </p>
            </div>
          </div>
        </div>
      )}
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
  const hasTrackedPushPrice = Number.isFinite(card.pushPrice) && card.pushPrice > 0
  const gain = hasTrackedPushPrice ? ((q.price - card.pushPrice) / card.pushPrice) * 100 : null
  const gUp = gain === null ? true : gain >= 0

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

      {/* 后端未提供独立证据完整度时，不用排序分代替。 */}
      <div className="mt-2.5 pl-1.5">
        <div className="flex items-center justify-between font-mono text-[10px]">
          <span className="text-muted-foreground">证据完整度</span>
          <span className="text-muted-foreground">
            {card.confidence === null ? 'n/a' : `${card.confidence}%`}
          </span>
        </div>
        {card.confidence !== null && (
          <div className="mt-1 h-1 overflow-hidden bg-secondary">
            <div className="h-full bg-neon" style={{ width: `${card.confidence}%` }} />
          </div>
        )}
      </div>

      {/* 现价 + 后端生命周期追踪 */}
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
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">追踪</div>
          {gain === null ? (
            <div className="font-mono text-sm font-bold text-muted-foreground">待追踪</div>
          ) : (
            <LiveValue
              value={gain}
              format={(n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`}
              className={cn('font-mono text-sm font-bold', gUp ? 'text-up' : 'text-down')}
            />
          )}
        </div>
      </div>

      {/* 核心策略逻辑 */}
      <p className="mt-2.5 pl-1.5 text-[11px] leading-relaxed text-muted-foreground">
        {card.thesis}
      </p>

      {/* 完整计划必须来自后端单币档案，列表页不生成价格计划。 */}
      <div className="mt-2.5 grid grid-cols-3 gap-px border border-border bg-border font-mono text-[10px]">
        <div className="bg-card p-1.5">
          <div className="text-muted-foreground">计划状态</div>
          <div className="mt-0.5 text-neon">后端完整计划</div>
        </div>
        <div className="bg-card p-1.5">
          <div className="text-muted-foreground">执行边界</div>
          <div className="mt-0.5 text-foreground">单币档案</div>
        </div>
        <div className="bg-card p-1.5">
          <div className="text-muted-foreground">最低赔率</div>
          <div className="mt-0.5 text-up">{card.odds}:1</div>
        </div>
      </div>

      {/* 多维证据清单 */}
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
          <span className={card.score === null ? 'text-muted-foreground' : 'text-neon'}>
            {card.score ?? 'n/a'}
          </span>
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
