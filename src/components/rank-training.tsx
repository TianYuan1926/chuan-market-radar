'use client'

import { useEffect, useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Check,
  X,
  Radar,
  Target,
  RotateCcw,
  Pause,
  Play,
  Loader2,
  Flame,
  Snowflake,
} from 'lucide-react'
import { TokenAvatar } from './token-avatar'
import {
  usePetState,
  resetPet,
  comboTierFor,
  slumpTierFor,
} from '@/lib/pet-store'
import {
  useTrainingEngine,
  getTrainingRow,
  setTrainingMode,
  setTrainingPaused,
} from '@/lib/training-engine'
import { RANKS, rankProgress } from '@/lib/ranks'
import { RankBadge } from './rank-badge'
import { type SniperTarget, sideLabel } from '@/lib/sniper-data'
import { cn } from '@/lib/utils'

// ============================================================
// 段位面板 —— 展示当前段位、经验进度与 8 段阶梯
// ============================================================
export function RankBanner() {
  const state = usePetState()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // 避免 SSR / 首帧与 localStorage 不一致
  const exp = mounted ? state.exp : 0
  const { rank, next, pct } = rankProgress(exp)

  return (
    <div className="border border-border bg-card">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        {/* 当前段位徽章 */}
        <div className="flex items-center gap-3">
          <RankBadge level={rank.level} size={60} />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-bold" style={{ color: rank.color }}>
                Lv{rank.level}
              </span>
              <span className="text-lg font-bold" style={{ color: rank.color }}>
                {rank.name}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">{rank.tagline}</div>
          </div>
        </div>

        {/* 经验进度 */}
        <div className="flex-1 sm:px-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              累计经验 <span className="font-mono text-foreground">{exp}</span>
            </span>
            <span className="text-muted-foreground">
              {next ? (
                <>
                  距 <span style={{ color: next.color }}>{next.name}</span>{' '}
                  <span className="font-mono text-foreground">
                    {next.minExp - exp}
                  </span>
                </>
              ) : (
                '已达最高段位'
              )}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden bg-secondary">
            <div
              className="relative h-full origin-left animate-bar-grow transition-all duration-700"
              style={{ width: `${pct * 100}%`, background: rank.color }}
            >
              <span
                className="absolute inset-y-0 w-1/3"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, color-mix(in oklch, white 45%, transparent), transparent)',
                  animation: 'bar-stream 2.4s linear infinite',
                }}
              />
            </div>
          </div>
          {/* 战绩 */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span>判断正确 <span className="font-mono text-up">{mounted ? state.totalRight : 0}</span></span>
            <span>判断错误 <span className="font-mono text-down">{mounted ? state.totalWrong : 0}</span></span>
            <span>当前连对 <span className="font-mono text-foreground">{mounted ? state.streak : 0}</span></span>
            {/* 实时连击 / 连错档位 */}
            {mounted && comboTierFor(state.streak) && (
              <span className="inline-flex items-center gap-1 bg-up/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-up">
                <Flame className="size-3" />
                {comboTierFor(state.streak)!.name} +{comboTierFor(state.streak)!.bonus}
              </span>
            )}
            {mounted && slumpTierFor(state.wrongStreak) && (
              <span className="inline-flex items-center gap-1 bg-down/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-down">
                <Snowflake className="size-3" />
                {slumpTierFor(state.wrongStreak)!.name} -{slumpTierFor(state.wrongStreak)!.bonus}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={resetPet}
          className="flex items-center gap-1.5 self-start border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground sm:self-center"
        >
          <RotateCcw className="size-3" />
          重置
        </button>
      </div>

      {/* 8 段阶梯 */}
      <div className="grid grid-cols-4 gap-px border-t border-border bg-border sm:grid-cols-8">
        {RANKS.map((r) => {
          const reached = exp >= r.minExp
          const current = r.level === rank.level
          return (
            <div
              key={r.level}
              className={cn(
                'flex flex-col items-center gap-1 bg-card px-2 py-3 text-center transition-colors',
                current && 'bg-secondary/40',
              )}
            >
              <RankBadge level={r.level} size={36} animated={current} dim={!reached} />
              <span
                className="font-mono text-[10px] font-bold"
                style={{ color: reached ? r.color : 'var(--muted-foreground)' }}
              >
                Lv{r.level}
              </span>
              <span
                className="text-[10px] leading-tight"
                style={{
                  color: reached ? 'var(--foreground)' : 'var(--muted-foreground)',
                  opacity: reached ? 1 : 0.5,
                }}
              >
                {r.name}
              </span>
              {current && (
                <span
                  className="size-1.5 animate-pulse rounded-full"
                  style={{ background: r.color }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// 判断训练 —— 订阅全局常驻引擎的纯视图
//   循环逻辑在 lib/training-engine.ts 全时运行（跨页面、跨标签），
//   本组件只负责把引擎当前状态渲染出来。
// ============================================================
type TrainMode = 'direction' | 'radar'

export function JudgementTraining() {
  const { idx, phase, paused, mode, result } = useTrainingEngine()
  const row = getTrainingRow(idx)

  // 样本池未就绪时（理论上不会发生）渲染占位
  if (!row) return null

  function switchMode(m: TrainMode) {
    setTrainingMode(m)
  }

  return (
    <div className="border border-border bg-card">
      {/* 模式切换 */}
      <div className="flex border-b border-border">
        <ModeTab active={mode === 'direction'} onClick={() => switchMode('direction')} icon={Target} label="方向预判" />
        <ModeTab active={mode === 'radar'} onClick={() => switchMode('radar')} icon={Radar} label="捕捉评判" />
      </div>

      <div className="p-5">
        {/* 顶部：狙击目标 + 自动状态 + 暂停 */}
        <div className="flex items-center gap-3">
          <TokenAvatar symbol={row.symbol} hue={row.hue} size={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-base font-bold">{row.symbol}</span>
              <SideBadge side={row.side} />
            </div>
            <div className="text-xs text-muted-foreground">狙击榜目标 · 自动复盘评判</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">#{idx + 1}</span>
            <button
              onClick={() => setTrainingPaused(!paused)}
              className="grid size-7 place-items-center border border-border text-muted-foreground transition-colors hover:text-foreground"
              aria-label={paused ? '继续自动评判' : '暂停自动评判'}
            >
              {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            </button>
          </div>
        </div>

        {/* 核心策略逻辑 */}
        <div className="mt-4 border border-border bg-secondary/30 p-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">核心策略逻辑</div>
            <span className="font-mono text-[11px] text-neon">{row.confidence}% 置信</span>
          </div>
          <div className="mt-1 text-foreground">{row.thesis}</div>
        </div>

        {/* 雷达判断 */}
        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {mode === 'direction' ? '雷达方向预判' : '狙击纳入判定'}
          </div>
          {phase === 'analyzing' ? (
            <AnalyzingRow />
          ) : (
            <RadarVerdict mode={mode} row={row} />
          )}
        </div>

        {/* 揭晓真实结果 + 经验结算 */}
        {phase === 'revealed' && result && (
          <div className="animate-float-up mt-4 border-t border-border pt-4">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center',
                  result.correct ? 'bg-up/15 text-up' : 'bg-down/15 text-down',
                )}
              >
                {result.correct ? <Check className="size-4" /> : <X className="size-4" />}
              </span>
              <div className="flex-1 text-sm">
                <span className={result.correct ? 'text-up' : 'text-down'}>
                  {result.correct ? '判断正确' : '判断失误'}
                </span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {result.delta >= 0 ? `+${result.delta}` : result.delta} 经验
                </span>
                {/* 连对/连错额外奖惩档位徽章 */}
                {result.combo && (
                  <span
                    className={cn(
                      'ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 align-middle font-mono text-[10px] font-bold',
                      result.correct
                        ? 'animate-update-pop bg-up/20 text-up'
                        : 'animate-pet-shake bg-down/20 text-down',
                    )}
                  >
                    {result.correct ? (
                      <Flame className="size-3" />
                    ) : (
                      <Snowflake className="size-3" />
                    )}
                    {result.combo} · {result.correct ? result.streak : result.wrongStreak}连
                  </span>
                )}
                <div className="mt-1 text-xs text-muted-foreground">
                  实际{' '}
                  <span className={row.outcomePct >= 0 ? 'text-up' : 'text-down'}>
                    {row.outcomePct >= 0 ? '上涨 +' : '下跌 '}
                    {row.outcomePct}%
                  </span>
                  ，复盘：{row.outcomeNote}
                </div>
              </div>
            </div>
            {/* 下一题倒计时条 */}
            {!paused && (
              <div className="mt-3 h-0.5 overflow-hidden bg-secondary">
                <div className="h-full animate-countdown bg-neon" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// 分析中：扫描脉冲 + 跳动文案
function AnalyzingRow() {
  return (
    <div className="mt-2 flex items-center gap-3 border border-border bg-secondary/20 p-3">
      <Loader2 className="size-4 shrink-0 animate-spin text-neon" />
      <div className="flex-1">
        <div className="text-sm text-muted-foreground">雷达正在比对链上与合约信号…</div>
        <div className="relative mt-2 h-1 overflow-hidden bg-secondary">
          <span className="absolute inset-y-0 w-1/3 animate-analyze-sweep bg-neon/70" />
        </div>
      </div>
    </div>
  )
}

// 多空方向徽章
function SideBadge({ side }: { side: SniperTarget['side'] }) {
  const long = side === 'long'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 px-1.5 py-0.5 font-mono text-[10px] font-bold',
        long ? 'bg-up/15 text-up' : 'bg-down/15 text-down',
      )}
    >
      {long ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {sideLabel(side)}
    </span>
  )
}

// 雷达判定结果（揭晓态）：展示狙击系统给出的方向预判 / 纳入判定
function RadarVerdict({ mode, row }: { mode: TrainMode; row: SniperTarget }) {
  const long = row.side === 'long'
  if (mode === 'direction') {
    // 方向预判：狙击系统对该目标的多空判断
    return (
      <div
        className={cn(
          'mt-2 flex items-center gap-2 border p-3 text-sm font-semibold',
          long ? 'border-up/40 bg-up/10 text-up' : 'border-down/40 bg-down/10 text-down',
        )}
      >
        {long ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
        预判 {long ? '看涨 / 做多' : '看空 / 做空'} · 盈亏比 {row.odds}
      </div>
    )
  }
  // 狙击纳入判定：该目标已通过最终筛选进入狙击名单
  return (
    <div className="mt-2 flex items-center gap-2 border border-neon/40 bg-neon-soft p-3 text-sm font-semibold text-neon">
      <Check className="size-4" /> 已通过最终筛选 · 纳入狙击名单
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-colors',
        active ? 'text-neon' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="size-4" />
      {label}
      {active && <span className="absolute inset-x-4 -bottom-px h-0.5 bg-neon" />}
    </button>
  )
}
