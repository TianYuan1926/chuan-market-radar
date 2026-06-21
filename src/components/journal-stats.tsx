'use client'

// ============================================================
// 交易日记 · 数据统计窗口
//   独立于「复盘进化」模块，仅消费交易日记自身数据。
//   可视化：胜率环形图、盈亏分布、资金曲线、多空分布、盈利因子。
//   全部带入场动画（数字滚动 / 曲线绘制 / 进度条生长）。
// ============================================================
import { useEffect, useRef, useState } from 'react'
import { X, TrendingUp, TrendingDown, Trophy, Crosshair, BarChart3, Activity } from 'lucide-react'
import { type JournalStats, fmtUsd } from '@/lib/journal-store'
import { cn } from '@/lib/utils'

export function JournalStatsModal({
  stats,
  onClose,
}: {
  stats: JournalStats
  onClose: () => void
}) {
  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const empty = stats.total === 0
  const noClosed = stats.closed === 0

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-background/85 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="animate-float-up sheet relative w-full max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
          <span className="grid size-7 place-items-center bg-neon-soft text-neon">
            <BarChart3 className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold tracking-tight">交易日记 · 数据统计</h2>
            <p className="text-[11px] text-muted-foreground">
              基于你记录的真实交易，独立统计 · 不与复盘进化引擎对接
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="ml-auto grid size-8 place-items-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {empty ? (
          <div className="flex flex-col items-center gap-2 px-5 py-16 text-center">
            <BarChart3 className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              还没有交易记录，先去记录几笔开仓，统计会自动生成
            </p>
          </div>
        ) : (
          <div className="space-y-5 p-5">
            {/* 顶部：胜率环 + 核心数字 */}
            <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
              <WinRateRing winRate={stats.winRate} wins={stats.wins} losses={stats.losses} noClosed={noClosed} />

              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
                <StatCell label="总单数" value={stats.total} accent="var(--foreground)" />
                <StatCell label="已平仓" value={stats.closed} accent="var(--foreground)" />
                <StatCell label="持仓中" value={stats.open} accent="var(--neon)" />
                <StatCell
                  label="累计已实现盈亏"
                  value={stats.realized}
                  money
                  accent={stats.realized >= 0 ? 'var(--up)' : 'var(--down)'}
                />
                <StatCell
                  label="平均 ROE"
                  value={stats.avgRoe}
                  suffix="%"
                  decimals={1}
                  signed
                  accent={stats.avgRoe >= 0 ? 'var(--up)' : 'var(--down)'}
                />
                <StatCell
                  label="平均盈亏比"
                  value={stats.avgRR}
                  suffix=" : 1"
                  decimals={2}
                  accent="var(--neon)"
                />
              </div>
            </div>

            {/* 盈亏分布条 */}
            <Section title="盈亏分布" icon={<Activity className="size-3.5" />}>
              <WinLossBar wins={stats.wins} losses={stats.losses} />
              <div className="mt-3 grid grid-cols-3 gap-2.5">
                <MiniStat label="盈利因子" value={stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)} tone="var(--neon)" />
                <MiniStat label="最大盈利" value={fmtUsd(stats.bestPnl)} tone="var(--up)" />
                <MiniStat label="最大亏损" value={fmtUsd(stats.worstPnl)} tone="var(--down)" />
              </div>
            </Section>

            {/* 资金曲线 */}
            <Section title="资金曲线（累计已实现盈亏）" icon={<TrendingUp className="size-3.5" />}>
              <EquityCurve equity={stats.equity} />
            </Section>

            {/* 多空分布 */}
            <Section title="多空分布与方向胜率" icon={<Crosshair className="size-3.5" />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <DirectionCard
                  side="long"
                  count={stats.longCount}
                  total={stats.total}
                  wins={stats.longWins}
                />
                <DirectionCard
                  side="short"
                  count={stats.shortCount}
                  total={stats.total}
                  wins={stats.shortWins}
                />
              </div>
              <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
                <Trophy className="size-3.5 text-neon" />
                平均杠杆 <span className="font-mono font-semibold text-foreground">{stats.avgLeverage.toFixed(1)}x</span>
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------- 胜率环形图（SVG 描边扫入动画） ----------------
function WinRateRing({
  winRate,
  wins,
  losses,
  noClosed,
}: {
  winRate: number
  wins: number
  losses: number
  noClosed: boolean
}) {
  const R = 46
  const C = 2 * Math.PI * R
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const start = performance.now()
    const dur = 1200
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setProgress(eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [winRate])

  const shown = winRate * progress
  const offset = C * (1 - shown / 100)
  const tone = winRate >= 50 ? 'var(--up)' : 'var(--down)'

  return (
    <div className="mx-auto grid size-[128px] place-items-center">
      <div className="relative grid size-[128px] place-items-center">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--secondary)" strokeWidth={10} />
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke={noClosed ? 'var(--muted-foreground)' : tone}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={noClosed ? C : offset}
            style={{ filter: `drop-shadow(0 0 6px ${tone})` }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="font-mono text-2xl font-bold" style={{ color: noClosed ? 'var(--muted-foreground)' : tone }}>
            {noClosed ? '—' : `${Math.round(shown)}%`}
          </span>
          <span className="text-[10px] tracking-wide text-muted-foreground">胜率</span>
          {!noClosed && (
            <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
              <span className="text-up">{wins}胜</span> / <span className="text-down">{losses}负</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------- 盈亏分布条 ----------------
function WinLossBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 60)
    return () => clearTimeout(t)
  }, [])

  if (total === 0) {
    return <div className="py-2 text-center text-[12px] text-muted-foreground">暂无已平仓交易</div>
  }
  const winPct = (wins / total) * 100

  return (
    <div>
      <div className="flex h-7 w-full overflow-hidden border border-border">
        <div
          className="flex items-center justify-start bg-up/80 pl-2 text-[11px] font-bold text-[color:var(--background)] transition-[width] duration-1000 ease-out"
          style={{ width: grown ? `${winPct}%` : '0%' }}
        >
          {winPct >= 18 && `${wins}`}
        </div>
        <div
          className="flex flex-1 items-center justify-end bg-down/80 pr-2 text-[11px] font-bold text-[color:var(--background)]"
        >
          {100 - winPct >= 18 && `${losses}`}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span className="text-up">盈利 {wins} 单</span>
        <span className="text-down">亏损 {losses} 单</span>
      </div>
    </div>
  )
}

// ---------------- 资金曲线 ----------------
function EquityCurve({ equity }: { equity: JournalStats['equity'] }) {
  const W = 640
  const H = 150
  const PAD = 8
  const pathRef = useRef<SVGPolylineElement>(null)
  const [len, setLen] = useState(0)
  const [draw, setDraw] = useState(false)

  // 起点补 0，使曲线从基线出发
  const cums = [0, ...equity.map((e) => e.cum)]
  const min = Math.min(0, ...cums)
  const max = Math.max(0, ...cums)
  const range = max - min || 1
  const stepX = equity.length > 0 ? (W - PAD * 2) / Math.max(equity.length, 1) : 0

  const points = cums.map((c, i) => {
    const x = PAD + i * stepX
    const y = PAD + (H - PAD * 2) * (1 - (c - min) / range)
    return [x, y] as const
  })
  const polyPoints = points.map((p) => p.join(',')).join(' ')
  const last = points[points.length - 1]
  const zeroY = PAD + (H - PAD * 2) * (1 - (0 - min) / range)

  useEffect(() => {
    if (pathRef.current) {
      setLen(pathRef.current.getTotalLength())
      const t = setTimeout(() => setDraw(true), 80)
      return () => clearTimeout(t)
    }
  }, [polyPoints])

  if (equity.length === 0) {
    return (
      <div className="grid h-[120px] place-items-center text-[12px] text-muted-foreground">
        平仓交易后，资金曲线会在这里逐步绘制
      </div>
    )
  }

  const up = (last?.[1] ?? 0) <= zeroY
  const tone = up ? 'var(--up)' : 'var(--down)'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 150 }}>
      <defs>
        <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity={0.22} />
          <stop offset="100%" stopColor={tone} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* 零轴 */}
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="var(--border)" strokeWidth={1} strokeDasharray="4 4" />
      {/* 面积填充 */}
      <polygon
        points={`${PAD},${zeroY} ${polyPoints} ${last?.[0] ?? PAD},${zeroY}`}
        fill="url(#equity-fill)"
        opacity={draw ? 1 : 0}
        style={{ transition: 'opacity 0.6s ease 0.6s' }}
      />
      {/* 曲线（描边绘制动画） */}
      <polyline
        ref={pathRef}
        points={polyPoints}
        fill="none"
        stroke={tone}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={draw ? 0 : len}
        style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)', filter: `drop-shadow(0 0 4px ${tone})` }}
      />
      {/* 数据点 */}
      {points.slice(1).map((p, i) => (
        <circle
          key={i}
          cx={p[0]}
          cy={p[1]}
          r={3}
          fill={equity[i].win ? 'var(--up)' : 'var(--down)'}
          opacity={draw ? 1 : 0}
          style={{ transition: `opacity 0.3s ease ${0.6 + i * 0.05}s` }}
        />
      ))}
    </svg>
  )
}

// ---------------- 方向卡片 ----------------
function DirectionCard({
  side,
  count,
  total,
  wins,
}: {
  side: 'long' | 'short'
  count: number
  total: number
  wins: number
}) {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 60)
    return () => clearTimeout(t)
  }, [])
  const tone = side === 'long' ? 'var(--up)' : 'var(--down)'
  const pct = total ? (count / total) * 100 : 0
  const wr = count ? (wins / count) * 100 : 0

  return (
    <div className="border border-border bg-secondary/30 p-3">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: tone }}>
        {side === 'long' ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
        {side === 'long' ? '做多' : '做空'}
        <span className="ml-auto font-mono text-foreground">{count} 单</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden bg-secondary">
        <div
          className="h-full transition-[width] duration-1000 ease-out"
          style={{ width: grown ? `${pct}%` : '0%', background: tone }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>占比 {pct.toFixed(0)}%</span>
        <span>胜率 <span className="font-mono font-semibold" style={{ color: tone }}>{count ? `${wr.toFixed(0)}%` : '—'}</span></span>
      </div>
    </div>
  )
}

// ---------------- 通用小组件 ----------------
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
        <span className="text-neon">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  )
}

function StatCell({
  label,
  value,
  accent,
  money,
  suffix,
  decimals = 0,
  signed,
}: {
  label: string
  value: number
  accent: string
  money?: boolean
  suffix?: string
  decimals?: number
  signed?: boolean
}) {
  const display = useAnimatedNumber(value)
  let text: string
  if (money) {
    text = fmtUsd(display)
  } else {
    const sign = signed && display > 0 ? '+' : ''
    text = `${sign}${display.toFixed(decimals)}${suffix ?? ''}`
  }
  return (
    <div className="border border-border bg-secondary/30 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-bold tabular" style={{ color: accent }}>
        {text}
      </div>
    </div>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="border border-border bg-secondary/30 px-3 py-2 text-center">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-bold" style={{ color: tone }}>
        {value}
      </div>
    </div>
  )
}

// 数字滚动动画（支持小数）
function useAnimatedNumber(value: number, duration = 1100): number {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const start = performance.now()
    const from = 0
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
      setDisplay(from + (value - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return display
}
