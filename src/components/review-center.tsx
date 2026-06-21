'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  X,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Plus,
  Minus,
  ArrowRight,
  FileText,
  BookOpen,
  ImagePlus,
  Trash2,
  Trophy,
  Flame,
  Lightbulb,
  Search,
  ChevronDown,
  Scale,
  Gauge,
  Activity,
  Radio,
  CheckCircle2,
  XCircle,
  RotateCcw,
  BarChart3,
} from 'lucide-react'
import { Panel } from './panel'
import { LiveStat, LiveValue } from './live-value'
import { RankBanner, JudgementTraining } from './rank-training'
import { TokenAvatar } from './token-avatar'
import {
  getDailyReview,
  getScanFrames,
  getEvolution,
  getDailyReports,
  getTokens,
  type ReviewRow,
  type DailyReport,
  type Token,
} from '@/lib/mock-data'
import {
  useJournal,
  addJournalEntry,
  removeJournalEntry,
  closeTrade,
  reopenTrade,
  fileToCompressedDataUrl,
  computeTrade,
  computeStats,
  pnlAt,
  realizedPnl,
  fmtPrice,
  fmtUsd,
  type TradeSide,
  type TradeStatus,
  type TradeJournal,
} from '@/lib/journal-store'
import { useLiveQuote } from '@/lib/live-store'
import { useLatestSignal } from '@/lib/signal-feed'
import { JournalStatsModal } from './journal-stats'
import { cn } from '@/lib/utils'

type Tab = 'train' | 'report' | 'review' | 'replay' | 'journal'

const TABS: [Tab, string][] = [
  ['train', '判断训练'],
  ['report', '复盘报告'],
  ['review', '每日异动榜复盘'],
  ['replay', '扫描回放'],
  ['journal', '交易日记'],
]

export function ReviewCenter() {
  const [tab, setTab] = useState<Tab>('train')

  return (
    <div>
      {/* 段位面板 */}
      <RankBanner />

      {/* 进化总览 */}
      <div className="mt-6">
        <EvolutionOverview />
      </div>

      {/* 标签切换 */}
      <div className="mt-6 flex flex-wrap gap-1 border-b border-border">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-semibold transition-colors',
              tab === id
                ? 'text-neon'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
            {tab === id && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 bg-neon" />
            )}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'train' && <JudgementTraining />}
        {tab === 'report' && <DailyReports />}
        {tab === 'review' && <DailyReview />}
        {tab === 'replay' && <ScanReplay />}
        {tab === 'journal' && <Journal />}
      </div>
    </div>
  )
}

function EvolutionOverview() {
  const ev = getEvolution()
  const stats = [
    { label: '命中', value: ev.hit, tone: 'var(--up)' },
    { label: '失败', value: ev.fail, tone: 'var(--down)' },
    { label: '漏判', value: ev.miss, tone: 'var(--muted-foreground)' },
    { label: '样本总数', value: ev.total, tone: 'var(--foreground)' },
  ]
  return (
    <Panel title="进化总览" subtitle="信号系统在历史样本上的命中表现与规则有效性">
      <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="animate-float-up bg-card px-5 py-4"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="mt-1 font-mono text-2xl font-bold" style={{ color: s.tone }}>
              <LiveStat
                base={s.value}
                format={(n) => `${Math.round(n)}`}
                volatility={0.012}
                intervalMs={5200}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2">
        <div className="bg-card px-5 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">历史胜率</span>
            <span className="font-mono font-bold text-up">{ev.winRate}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden bg-secondary">
            <div
              className="relative h-full origin-left animate-bar-grow bg-up"
              style={{ width: `${ev.winRate}%` }}
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
        </div>
        <div className="flex items-center justify-between bg-card px-5 py-4 text-sm">
          <span className="text-muted-foreground">平均盈亏比</span>
          <span className="font-mono font-bold text-neon">
            {ev.avgOdds} : 1
          </span>
        </div>
      </div>

      {/* 规则有效性 */}
      <div className="border-t border-border px-5 py-4">
        <div className="mb-3 text-xs font-semibold text-muted-foreground">
          规则有效性（基于历史样本回测）
        </div>
        <div className="space-y-2.5">
          {ev.ruleEffectiveness.map((r, i) => (
            <div
              key={r.rule}
              className="animate-float-up flex items-center gap-3 text-[13px]"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className="w-44 shrink-0 truncate text-foreground">
                {r.rule}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden bg-secondary">
                <div
                  className="h-full origin-left animate-bar-grow"
                  style={{
                    width: `${r.effectiveness}%`,
                    animationDelay: `${i * 70}ms`,
                    background:
                      r.effectiveness >= 65
                        ? 'var(--up)'
                        : r.effectiveness >= 50
                          ? 'var(--neon)'
                          : 'var(--sig-pump)',
                  }}
                />
              </div>
              <span className="w-10 shrink-0 text-right font-mono font-semibold">
                {r.effectiveness}%
              </span>
              <span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground">
                {r.samples} 样本
              </span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}

function ReviewList({ rows, kind }: { rows: ReviewRow[]; kind: 'up' | 'down' }) {
  return (
    <div className="divide-y divide-border">
      {rows.map((r) => (
        <div key={r.symbol} className="px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className="grid size-7 place-items-center text-xs font-bold text-[color:var(--primary-foreground)]"
              style={{ background: `oklch(0.7 0.16 ${r.hue})` }}
            >
              {r.symbol.slice(0, 2)}
            </span>
            <span className="font-semibold">{r.symbol}</span>
            <span
              className={cn(
                'font-mono text-sm font-bold',
                kind === 'up' ? 'text-up' : 'text-down',
              )}
            >
              {r.change > 0 ? '+' : ''}
              {r.change}%
            </span>
            <span className="ml-auto">
              {r.radarCaught ? (
                <span
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-up"
                  style={{ background: 'color-mix(in oklch, var(--up) 14%, transparent)' }}
                >
                  <Check className="size-3" />
                  雷达已捕捉
                </span>
              ) : (
                <span
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-down"
                  style={{ background: 'color-mix(in oklch, var(--down) 14%, transparent)' }}
                >
                  <X className="size-3" />
                  漏判
                </span>
              )}
            </span>
          </div>
          <div className="mt-2 grid gap-1.5 pl-9 text-[13px]">
            <div className="flex gap-2">
              <span className="shrink-0 text-muted-foreground">异动原因</span>
              <span className="text-foreground">{r.reason}</span>
            </div>
            <div className="flex gap-2">
              <span className="shrink-0 text-muted-foreground">前兆信号</span>
              <span className="text-foreground">{r.preEvent}</span>
            </div>
            {!r.radarCaught && r.missReason && (
              <div className="flex gap-2 text-down">
                <span className="shrink-0">漏判原因</span>
                <span>{r.missReason}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function DailyReview() {
  const { gainers, losers } = getDailyReview()
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel
        title="涨幅榜复盘"
        icon={<TrendingUp className="size-3.5 text-up" />}
        subtitle="今日领涨币种的异动原因与雷达捕捉情况"
      >
        <ReviewList rows={gainers} kind="up" />
      </Panel>
      <Panel
        title="跌幅榜复盘"
        icon={<TrendingDown className="size-3.5 text-down" />}
        subtitle="今日领跌币种的异动原因与雷达捕捉情况"
      >
        <ReviewList rows={losers} kind="down" />
      </Panel>
    </div>
  )
}

function ScanReplay() {
  return (
    <Panel
      title="扫描回放"
      subtitle="按时间回放每一帧扫描快照：候选池的新增、移除与状态变化"
    >
      <div className="relative px-5 py-4">
        {/* 时间轴竖线 */}
        <div className="absolute bottom-4 left-[26px] top-4 w-px bg-border" />
        <div className="space-y-5">
          {getScanFrames().map((f) => (
            <div key={f.time} className="relative pl-8">
              <span className="absolute left-0 top-1 size-3 rounded-full border-2 border-neon bg-background shadow-[0_0_8px_var(--neon)]" />
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold">{f.time}</span>
                <span className="text-xs text-muted-foreground">
                  候选池 {f.candidates} 个
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {f.added.map((s) => (
                  <span
                    key={s}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-semibold text-up"
                    style={{ background: 'color-mix(in oklch, var(--up) 14%, transparent)' }}
                  >
                    <Plus className="size-2.5" />
                    {s}
                  </span>
                ))}
                {f.removed.map((s) => (
                  <span
                    key={s}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-semibold text-down"
                    style={{ background: 'color-mix(in oklch, var(--down) 14%, transparent)' }}
                  >
                    <Minus className="size-2.5" />
                    {s}
                  </span>
                ))}
                {f.changed.map((c) => (
                  <span
                    key={c.symbol}
                    className="flex items-center gap-1 bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  >
                    <span className="font-semibold text-foreground">
                      {c.symbol}
                    </span>
                    {c.from}
                    <ArrowRight className="size-2.5" />
                    <span className="text-neon">{c.to}</span>
                  </span>
                ))}
                {f.added.length === 0 &&
                  f.removed.length === 0 &&
                  f.changed.length === 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      无变化
                    </span>
                  )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}

// ============================================================
// 复盘报告（今日 / 昨日）
// ============================================================
const MOOD_TONE: Record<DailyReport['marketMood'], string> = {
  进攻: 'var(--up)',
  震荡: 'var(--neon)',
  防守: 'var(--down)',
}

function DailyReports() {
  const reports = getDailyReports()
  const [active, setActive] = useState<DailyReport['key']>('today')
  const report = reports.find((r) => r.key === active) ?? reports[0]

  return (
    <div>
      {/* 今日 / 昨日切换 */}
      <div className="mb-4 inline-flex border border-border bg-card p-1">
        {reports.map((r) => (
          <button
            key={r.key}
            onClick={() => setActive(r.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-colors',
              active === r.key
                ? 'bg-neon text-[color:var(--background)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <FileText className="size-3.5" />
            {r.label}
            <span className="font-mono text-xs opacity-70">{r.date}</span>
          </button>
        ))}
      </div>

      <Panel
        title={`${report.label} · ${report.date} ${report.weekday}`}
        subtitle="当日信号系统表现、热点板块与复盘要点"
        right={
          <span
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold"
            style={{
              color: MOOD_TONE[report.marketMood],
              background: `color-mix(in oklch, ${MOOD_TONE[report.marketMood]} 14%, transparent)`,
            }}
          >
            <Flame className="size-3" />
            市场情绪 · {report.marketMood}
          </span>
        }
      >
        {/* 核心指标 */}
        <div className="grid gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: '推送信号', value: report.signalsPushed, tone: 'var(--foreground)' },
            { label: '狙击锁定', value: report.sniperLocked, tone: 'var(--neon)' },
            { label: '命中', value: report.hit, tone: 'var(--up)' },
            { label: '失败', value: report.fail, tone: 'var(--down)' },
            { label: '漏判', value: report.miss, tone: 'var(--muted-foreground)' },
            { label: '胜率', value: report.winRate, tone: 'var(--up)', suffix: '%' },
          ].map((s, i) => (
            <div
              key={s.label}
              className="animate-float-up bg-card px-4 py-3"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="text-[11px] text-muted-foreground">{s.label}</div>
              <div className="mt-1 font-mono text-xl font-bold" style={{ color: s.tone }}>
                {s.value}
                {s.suffix ?? ''}
              </div>
            </div>
          ))}
        </div>

        {/* 最佳 / 最差 */}
        <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2">
          <ReportCall kind="best" call={report.bestCall} />
          <ReportCall kind="worst" call={report.worstCall} />
        </div>

        {/* 热点板块 */}
        <div className="border-t border-border px-5 py-4">
          <div className="mb-3 text-xs font-semibold text-muted-foreground">热点板块强度</div>
          <div className="space-y-2.5">
            {report.hotSectors.map((sec, i) => (
              <div
                key={sec.name}
                className="animate-float-up flex items-center gap-3 text-[13px]"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span className="w-24 shrink-0 truncate text-foreground">{sec.name}</span>
                <div className="h-1.5 flex-1 overflow-hidden bg-secondary">
                  <div
                    className="h-full origin-left animate-bar-grow"
                    style={{
                      width: `${sec.strength}%`,
                      animationDelay: `${i * 60}ms`,
                      background:
                        sec.strength >= 70
                          ? 'var(--up)'
                          : sec.strength >= 50
                            ? 'var(--neon)'
                            : 'var(--sig-pump)',
                    }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-mono font-semibold">
                  {sec.strength}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 做对的 / 教训 */}
        <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2">
          <ReportList
            title="做对的"
            icon={<Check className="size-3.5 text-up" />}
            items={report.highlights}
            tone="var(--up)"
          />
          <ReportList
            title="待改进 / 教训"
            icon={<Lightbulb className="size-3.5" style={{ color: 'var(--sig-pump)' }} />}
            items={report.lessons}
            tone="var(--sig-pump)"
          />
        </div>

        {/* 总结 */}
        <div className="border-t border-border px-5 py-4">
          <div className="mb-2 text-xs font-semibold text-muted-foreground">复盘总结</div>
          <p className="text-[13px] leading-relaxed text-foreground">{report.summary}</p>
        </div>
      </Panel>
    </div>
  )
}

function ReportCall({
  kind,
  call,
}: {
  kind: 'best' | 'worst'
  call: DailyReport['bestCall']
}) {
  const isBest = kind === 'best'
  return (
    <div className="bg-card px-5 py-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {isBest ? (
          <Trophy className="size-3.5 text-up" />
        ) : (
          <AlertTriangle className="size-3.5 text-down" />
        )}
        {isBest ? '当日最佳' : '当日最差'}
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <TokenAvatar symbol={call.symbol} hue={call.hue} size={32} />
        <span className="font-semibold">{call.symbol}</span>
        <span
          className={cn(
            'px-1.5 py-0.5 font-mono text-[11px] font-bold',
            call.side === '多' ? 'bg-up/15 text-up' : 'bg-down/15 text-down',
          )}
        >
          {call.side === '多' ? '看涨' : '看空'}
        </span>
        <span
          className={cn(
            'ml-auto font-mono text-sm font-bold',
            isBest ? 'text-up' : 'text-down',
          )}
        >
          {call.change > 0 ? '+' : ''}
          {call.change}%
        </span>
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground">{call.note}</p>
    </div>
  )
}

function ReportList({
  title,
  icon,
  items,
  tone,
}: {
  title: string
  icon: React.ReactNode
  items: string[]
  tone: string
}) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {icon}
        {title}
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li
            key={i}
            className="animate-float-up flex gap-2 text-[13px] leading-relaxed text-foreground"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span className="mt-1.5 size-1.5 shrink-0" style={{ background: tone }} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

const STATUS_TONE: Record<TradeStatus, string> = {
  持仓中: 'var(--neon)',
  已平仓: 'var(--muted-foreground)',
}

export function Journal() {
  const entries = useJournal()
  const [adding, setAdding] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [showStats, setShowStats] = useState(false)
  const stats = useMemo(() => computeStats(entries), [entries])

  return (
    <Panel
      title="交易日记"
      subtitle="记录每一笔真实开仓：杠杆、保证金、价格自动算出仓位与盈亏比，沉淀为可复盘的交易档案"
      right={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStats(true)}
            className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-neon/50 hover:text-foreground"
          >
            <BarChart3 className="size-3.5" />
            数据统计
          </button>
          <button
            onClick={() => setAdding((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors',
              adding
                ? 'bg-secondary text-foreground'
                : 'bg-neon text-[color:var(--background)] hover:opacity-90',
            )}
          >
            {adding ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
            {adding ? '取消' : '记录新开仓'}
          </button>
        </div>
      }
    >
      {showStats && <JournalStatsModal stats={stats} onClose={() => setShowStats(false)} />}
      {adding && <JournalForm onDone={() => setAdding(false)} />}

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
          <BookOpen className="size-7 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            还没有记录，点击右上角「记录新开仓」开始你的第一篇交易日记
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {entries.map((j) => (
            <JournalCard key={j.id} j={j} onLightbox={setLightbox} />
          ))}
        </div>
      )}

      {/* 图片灯箱 */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-6"
        >
          <img
            src={lightbox || '/placeholder.svg'}
            alt="开仓截图大图"
            className="max-h-full max-w-full border border-border object-contain"
          />
          <button
            onClick={() => setLightbox(null)}
            aria-label="关闭"
            className="absolute right-5 top-5 grid size-9 place-items-center border border-border bg-card text-foreground hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </Panel>
  )
}

const LEVERAGE_PRESETS = [1, 3, 5, 10, 20, 50, 100, 125, 150]
const MAX_LEVERAGE = 150

function JournalForm({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState<Token | null>(null)
  const [side, setSide] = useState<TradeSide>('long')
  const [leverage, setLeverage] = useState(10)
  const [margin, setMargin] = useState('')
  const [entry, setEntry] = useState('')
  const [stop, setStop] = useState('')
  const [target, setTarget] = useState('')
  const [note, setNote] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // 实时计算指标
  const metrics = useMemo(
    () =>
      computeTrade({
        side,
        leverage,
        margin: parseFloat(margin) || 0,
        entry: parseFloat(entry) || 0,
        stop: parseFloat(stop) || 0,
        target: parseFloat(target) || 0,
      }),
    [side, leverage, margin, entry, stop, target],
  )

  async function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setBusy(true)
    try {
      const urls = await Promise.all(files.map((f) => fileToCompressedDataUrl(f)))
      setImages((prev) => [...prev, ...urls].slice(0, 6)) // 最多 6 张
    } catch (err) {
      console.log('[v0] image compress failed:', (err as Error).message)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const canSave = Boolean(token) && parseFloat(entry) > 0 && parseFloat(margin) > 0 && leverage > 0

  function submit() {
    if (!canSave || !token) return
    addJournalEntry({
      symbol: token.symbol,
      side,
      leverage,
      margin: parseFloat(margin),
      entry: parseFloat(entry),
      stop: parseFloat(stop) || 0,
      target: parseFloat(target) || 0,
      status: '持仓中',
      note: note.trim(),
      images,
    })
    onDone()
  }

  // 选币时自动用现价预填开仓价
  function pickToken(t: Token) {
    setToken(t)
    if (!entry) setEntry(String(t.price))
  }

  return (
    <div className="animate-float-up border-b border-border bg-secondary/30 px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {/* 币种选择（可搜索） */}
        <div>
          <FieldLabel>币种</FieldLabel>
          <TokenPicker token={token} onPick={pickToken} />
        </div>
        {/* 方向 */}
        <div>
          <FieldLabel>方向</FieldLabel>
          <div className="flex border border-border">
            {(
              [
                ['long', '做多', 'var(--up)'],
                ['short', '做空', 'var(--down)'],
              ] as [TradeSide, string, string][]
            ).map(([v, label, tone]) => (
              <button
                key={v}
                onClick={() => setSide(v)}
                className="flex flex-1 items-center justify-center gap-1 py-2 text-sm font-semibold transition-colors"
                style={
                  side === v
                    ? { background: `color-mix(in oklch, ${tone} 18%, transparent)`, color: tone }
                    : { color: 'var(--muted-foreground)' }
                }
              >
                {v === 'long' ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 杠杆 */}
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <FieldLabel>
            <span className="flex items-center gap-1">
              <Gauge className="size-3" /> 杠杆
            </span>
          </FieldLabel>
          <span className="font-mono text-sm font-bold text-neon">{leverage}x</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {LEVERAGE_PRESETS.map((lv) => (
            <button
              key={lv}
              onClick={() => setLeverage(lv)}
              className={cn(
                'min-w-11 border px-2 py-1.5 font-mono text-xs font-semibold transition-colors',
                leverage === lv
                  ? 'border-neon bg-neon-soft text-neon'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {lv}x
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={MAX_LEVERAGE}
            value={leverage}
            onChange={(e) =>
              setLeverage(Math.max(1, Math.min(MAX_LEVERAGE, parseInt(e.target.value) || 1)))
            }
            className="w-16 border border-border bg-card px-2 py-1.5 text-center font-mono text-xs outline-none focus:border-neon"
            aria-label="自定义杠杆"
          />
        </div>
        <input
          type="range"
          min={1}
          max={MAX_LEVERAGE}
          value={leverage}
          onChange={(e) => setLeverage(parseInt(e.target.value))}
          className="mt-2 w-full accent-[color:var(--neon)]"
          aria-label="杠杆滑块"
        />
      </div>

      {/* 价格 / 保证金 */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NumInput label="初始保证金 (USDT)" value={margin} onChange={setMargin} placeholder="如 500" />
        <NumInput label="开仓价" value={entry} onChange={setEntry} placeholder="如 0.0392" />
        <NumInput label="止损价" value={stop} onChange={setStop} placeholder="如 0.0361" tone="var(--down)" />
        <NumInput label="目标价" value={target} onChange={setTarget} placeholder="如 0.052" tone="var(--up)" />
      </div>

      {/* 实时计算面板 */}
      <div className="mt-3 border border-neon/30 bg-neon-soft/40">
        <div className="flex items-center gap-1.5 border-b border-neon/20 px-3 py-1.5 text-[11px] font-semibold text-neon">
          <Scale className="size-3" /> 自动计算（仓位 = 保证金 × 杠杆）
        </div>
        <div className="grid gap-px bg-border/60 sm:grid-cols-3 lg:grid-cols-5">
          <CalcCell label="仓位价值" value={metrics ? fmtUsd(metrics.positionValue) : '—'} />
          <CalcCell
            label="持仓数量"
            value={metrics && metrics.qty ? `${metrics.qty.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${token?.symbol ?? ''}` : '—'}
          />
          <CalcCell
            label="盈亏比"
            value={metrics && metrics.riskReward > 0 ? `${metrics.riskReward.toFixed(2)} : 1` : '—'}
            tone={
              metrics && metrics.riskReward >= 2
                ? 'var(--up)'
                : metrics && metrics.riskReward >= 1
                  ? 'var(--neon)'
                  : metrics && metrics.riskReward > 0
                    ? 'var(--down)'
                    : undefined
            }
          />
          <CalcCell
            label="到目标盈利"
            value={
              metrics && parseFloat(target) > 0
                ? `${fmtUsd(metrics.profitAmount)} (+${metrics.profitPctOnMargin.toFixed(1)}%)`
                : '—'
            }
            tone="var(--up)"
          />
          <CalcCell
            label="到止损亏损"
            value={
              metrics && parseFloat(stop) > 0
                ? `${fmtUsd(-Math.abs(metrics.lossAmount))} (-${Math.abs(metrics.lossPctOnMargin).toFixed(1)}%)`
                : '—'
            }
            tone="var(--down)"
          />
        </div>
        {metrics && (
          <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
            估算强平价 ≈{' '}
            <span className="font-mono font-semibold text-foreground">{fmtPrice(metrics.liqPrice)}</span>
            <span className="ml-1 opacity-70">（逐仓近似，未计手续费与维持保证金）</span>
          </div>
        )}
      </div>

      {/* 备注 */}
      <div className="mt-3">
        <FieldLabel>备注 / 复盘心得</FieldLabel>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="入场逻辑、情绪、计划调整……"
          className="w-full resize-none border border-border bg-card px-3 py-2 text-sm leading-relaxed outline-none focus:border-neon"
        />
      </div>

      {/* 图片上传 */}
      <div className="mt-3">
        <FieldLabel>开仓截图（最多 6 张）</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          {images.map((src, i) => (
            <div key={i} className="relative overflow-hidden border border-border">
              <img
                src={src || '/placeholder.svg'}
                alt={`截图 ${i + 1}`}
                className="h-16 w-20 object-cover"
              />
              <button
                onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label="移除图片"
                className="absolute right-0.5 top-0.5 grid size-5 place-items-center bg-background/80 text-foreground hover:text-down"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          {images.length < 6 && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex h-16 w-20 flex-col items-center justify-center gap-1 border border-dashed border-border text-muted-foreground transition-colors hover:border-neon hover:text-neon disabled:opacity-50"
            >
              <ImagePlus className="size-4" />
              <span className="text-[10px]">{busy ? '处理中' : '添加'}</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onPickImages}
            className="hidden"
          />
        </div>
      </div>

      {/* 操作 */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!canSave}
          className="flex items-center gap-1.5 bg-neon px-4 py-2 text-sm font-semibold text-[color:var(--background)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check className="size-3.5" />
          保存记录
        </button>
        <button
          onClick={onDone}
          className="px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          取消
        </button>
        {!canSave && (
          <span className="text-[11px] text-muted-foreground">请选择币种并填写开仓价、保证金</span>
        )}
      </div>
    </div>
  )
}

// 可搜索的币种选择器
function TokenPicker({ token, onPick }: { token: Token | null; onPick: (t: Token) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const tokens = useMemo(() => getTokens(), [])
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return tokens
    return tokens.filter(
      (t) => t.symbol.toLowerCase().includes(kw) || t.name.toLowerCase().includes(kw),
    )
  }, [q, tokens])

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-neon"
      >
        {token ? (
          <>
            <TokenAvatar symbol={token.symbol} hue={token.hue} size={20} />
            <span className="font-semibold">{token.symbol}</span>
            <span className="truncate text-xs text-muted-foreground">{token.name}</span>
          </>
        ) : (
          <span className="text-muted-foreground">选择币种…</span>
        )}
        <ChevronDown
          className={cn('ml-auto size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <>
          {/* 点击遮罩关闭 */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 border border-border bg-card shadow-lg">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="size-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索代号或名称…"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <div className="max-h-60 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">无匹配币种</div>
              ) : (
                filtered.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onPick(t)
                      setOpen(false)
                      setQ('')
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary',
                      token?.id === t.id && 'bg-secondary',
                    )}
                  >
                    <TokenAvatar symbol={t.symbol} hue={t.hue} size={22} />
                    <span className="font-semibold">{t.symbol}</span>
                    <span className="truncate text-xs text-muted-foreground">{t.name}</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      ${fmtPrice(t.price)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[11px] font-semibold text-muted-foreground">{children}</div>
}

function NumInput({
  label,
  value,
  onChange,
  placeholder,
  tone,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  tone?: string
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-border bg-card px-3 py-2 font-mono text-sm outline-none focus:border-neon"
        style={tone ? { color: tone } : undefined}
      />
    </div>
  )
}

function CalcCell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-[13px] font-semibold" style={{ color: tone ?? 'var(--foreground)' }}>
        {value}
      </div>
    </div>
  )
}

// 根据符号生成稳定色相（与 TokenAvatar 回退一致的简易哈希）
function hueFor(symbol: string): number {
  let h = 0
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) % 360
  return h
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}

function JournalField({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-secondary/40 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-[13px]" style={{ color: tone ?? 'var(--foreground)' }}>
        {value}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// 单条交易日记卡片
//   · 未平仓：接入实时行情，显示浮动盈亏；命中信号时弹出���持仓异动」告警
//   · 已平仓：显示平仓价、已实现盈亏与成功/失败判定
// ------------------------------------------------------------
function JournalCard({
  j,
  onLightbox,
}: {
  j: TradeJournal
  onLightbox: (src: string) => void
}) {
  const m = computeTrade(j)
  const isOpen = j.status === '持仓中'
  const [closing, setClosing] = useState(false)

  // 实时行情（持仓中据此算浮动盈亏；已平仓忽略）
  const quote = useLiveQuote(j.symbol.toLowerCase())
  const markPrice = quote?.price ?? j.entry
  const floating = isOpen ? pnlAt(j, markPrice) : null
  const realized = realizedPnl(j)

  // 持仓异动告警：全站最新信号命中本持仓币种时高亮
  const latestSignal = useLatestSignal()
  const [anomaly, setAnomaly] = useState(false)
  useEffect(() => {
    if (isOpen && latestSignal && latestSignal.symbol === j.symbol) {
      setAnomaly(true)
      const t = setTimeout(() => setAnomaly(false), 10000)
      return () => clearTimeout(t)
    }
  }, [latestSignal, isOpen, j.symbol])

  return (
    <div
      className={cn(
        'group px-5 py-4 transition-colors',
        anomaly && 'bg-down/5',
      )}
      style={anomaly ? { boxShadow: 'inset 3px 0 0 var(--down)' } : undefined}
    >
      {/* 头部徽章 */}
      <div className="flex flex-wrap items-center gap-2.5">
        <TokenAvatar symbol={j.symbol} hue={hueFor(j.symbol)} size={28} />
        <span className="font-semibold">{j.symbol}</span>
        <span
          className={cn(
            'flex items-center gap-0.5 px-1.5 py-0.5 font-mono text-[11px] font-bold',
            j.side === 'long' ? 'bg-up/15 text-up' : 'bg-down/15 text-down',
          )}
        >
          {j.side === 'long' ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          {j.side === 'long' ? '做多' : '做空'}
        </span>
        <span className="flex items-center gap-0.5 bg-neon-soft px-1.5 py-0.5 font-mono text-[11px] font-bold text-neon">
          <Gauge className="size-3" />
          {j.leverage}x
        </span>
        {/* 状态 / 成败 */}
        {isOpen ? (
          <span
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold"
            style={{
              color: STATUS_TONE['持仓中'],
              background: `color-mix(in oklch, ${STATUS_TONE['持仓中']} 14%, transparent)`,
            }}
          >
            <Activity className="size-3 animate-pulse" />
            持仓中
          </span>
        ) : realized ? (
          <span
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold',
              realized.win ? 'bg-up/15 text-up' : 'bg-down/15 text-down',
            )}
          >
            {realized.win ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
            {realized.win ? '成功' : '失败'}
          </span>
        ) : null}
        {/* 持仓异动告警徽章 */}
        {anomaly && (
          <span className="flex animate-pulse items-center gap-0.5 bg-down px-1.5 py-0.5 text-[11px] font-bold text-[color:var(--background)]">
            <Radio className="size-3" />
            异动告警
          </span>
        )}
        {/* 盈亏比 */}
        {m && m.riskReward > 0 && (
          <span
            className={cn(
              'flex items-center gap-0.5 font-mono text-[13px] font-semibold',
              m.riskReward >= 2 ? 'text-up' : m.riskReward >= 1 ? 'text-neon' : 'text-down',
            )}
          >
            <Scale className="size-3" />
            {m.riskReward.toFixed(2)}R
          </span>
        )}
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {formatTime(j.createdAt)}
        </span>
        <button
          onClick={() => removeJournalEntry(j.id)}
          aria-label="删除记录"
          className="text-muted-foreground/50 opacity-0 transition-opacity hover:text-down group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* 基础字段 */}
      <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <JournalField label="开仓价" value={fmtPrice(j.entry)} />
        <JournalField label="止损" value={fmtPrice(j.stop)} tone="var(--down)" />
        <JournalField label="目标" value={fmtPrice(j.target)} tone="var(--up)" />
        <JournalField label="保证金" value={fmtUsd(j.margin)} />
        <JournalField label="仓位价值" value={m ? fmtUsd(m.positionValue) : '—'} />
        {isOpen ? (
          <JournalField label="现价（实时）" value={fmtPrice(markPrice)} tone="var(--neon)" />
        ) : (
          <JournalField label="平仓价" value={j.exitPrice ? fmtPrice(j.exitPrice) : '—'} />
        )}
      </div>

      {/* 实时浮动盈亏（未平仓） */}
      {isOpen && floating && (
        <div
          className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 border px-3 py-2 text-[12px]"
          style={{
            borderColor: `color-mix(in oklch, ${floating.win ? 'var(--up)' : 'var(--down)'} 35%, transparent)`,
            background: `color-mix(in oklch, ${floating.win ? 'var(--up)' : 'var(--down)'} 7%, transparent)`,
          }}
        >
          <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <span
              className="inline-block size-1.5 animate-pulse rounded-full"
              style={{ background: 'var(--neon)' }}
            />
            实时浮动盈亏
          </span>
          <span
            className="font-mono text-sm font-bold"
            style={{ color: floating.win ? 'var(--up)' : 'var(--down)' }}
          >
            {floating.pnl >= 0 ? '+' : ''}
            {fmtUsd(floating.pnl)}
          </span>
          <span
            className="font-mono text-[13px] font-semibold"
            style={{ color: floating.win ? 'var(--up)' : 'var(--down)' }}
          >
            ROE {floating.roe >= 0 ? '+' : ''}
            {floating.roe.toFixed(1)}%
          </span>
          <span className="text-muted-foreground">
            价格较开仓{' '}
            <span
              className="font-mono font-semibold"
              style={{ color: floating.pricePct >= 0 ? 'var(--up)' : 'var(--down)' }}
            >
              {floating.pricePct >= 0 ? '+' : ''}
              {floating.pricePct.toFixed(2)}%
            </span>
          </span>
        </div>
      )}

      {/* 已实现盈亏（已平仓） */}
      {!isOpen && realized && (
        <div
          className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 border px-3 py-2 text-[12px]"
          style={{
            borderColor: `color-mix(in oklch, ${realized.win ? 'var(--up)' : 'var(--down)'} 35%, transparent)`,
            background: `color-mix(in oklch, ${realized.win ? 'var(--up)' : 'var(--down)'} 7%, transparent)`,
          }}
        >
          <span className="text-[11px] font-semibold text-muted-foreground">已实现盈亏</span>
          <span
            className="font-mono text-sm font-bold"
            style={{ color: realized.win ? 'var(--up)' : 'var(--down)' }}
          >
            {realized.pnl >= 0 ? '+' : ''}
            {fmtUsd(realized.pnl)}
          </span>
          <span
            className="font-mono text-[13px] font-semibold"
            style={{ color: realized.win ? 'var(--up)' : 'var(--down)' }}
          >
            ROE {realized.roe >= 0 ? '+' : ''}
            {realized.roe.toFixed(1)}%
          </span>
          {j.closedAt && (
            <span className="font-mono text-muted-foreground">平仓于 {formatTime(j.closedAt)}</span>
          )}
        </div>
      )}

      {/* 潜在盈亏（仅未平仓时作参考） */}
      {isOpen && m && (m.profitAmount !== 0 || m.lossAmount !== 0) && (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
          {j.target > 0 && (
            <span className="text-muted-foreground">
              到目标{' '}
              <span className="font-mono font-semibold text-up">
                {fmtUsd(m.profitAmount)}（+{m.profitPctOnMargin.toFixed(1)}%）
              </span>
            </span>
          )}
          {j.stop > 0 && (
            <span className="text-muted-foreground">
              到止损{' '}
              <span className="font-mono font-semibold text-down">
                {fmtUsd(-Math.abs(m.lossAmount))}（-{Math.abs(m.lossPctOnMargin).toFixed(1)}%）
              </span>
            </span>
          )}
          <span className="text-muted-foreground">
            估算强平{' '}
            <span className="font-mono font-semibold text-foreground">{fmtPrice(m.liqPrice)}</span>
          </span>
        </div>
      )}

      {j.note && (
        <div className="mt-2 flex gap-2 text-[13px]">
          <span className="shrink-0 text-muted-foreground">备注</span>
          <span className="text-foreground">{j.note}</span>
        </div>
      )}

      {/* 平仓备注（止盈/离场说明） */}
      {!isOpen && j.closeNote && (
        <div className="mt-1.5 flex gap-2 text-[13px]">
          <span className="shrink-0 text-muted-foreground">平仓说明</span>
          <span className="text-foreground">{j.closeNote}</span>
        </div>
      )}

      {j.images.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {j.images.map((src, i) => (
            <button
              key={i}
              onClick={() => onLightbox(src)}
              className="overflow-hidden border border-border transition-colors hover:border-neon"
            >
              {/* 用户上传截图，base64 本地存储 */}
              <img
                src={src || '/placeholder.svg'}
                alt={`${j.symbol} 开仓截图 ${i + 1}`}
                className="h-20 w-28 object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* 操作区：平仓结算 / 撤销 */}
      <div className="mt-3">
        {isOpen ? (
          closing ? (
            <CloseForm j={j} mark={markPrice} onDone={() => setClosing(false)} />
          ) : (
            <button
              onClick={() => setClosing(true)}
              className="flex items-center gap-1.5 border border-neon/40 bg-neon-soft px-3 py-1.5 text-xs font-semibold text-neon transition-colors hover:bg-neon hover:text-[color:var(--background)]"
            >
              <Check className="size-3.5" />
              平仓结算
            </button>
          )
        ) : (
          <button
            onClick={() => reopenTrade(j.id)}
            className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            撤销平仓 / 重新持有
          </button>
        )}
      </div>
    </div>
  )
}

// 平仓结算表单：录入平仓价（止盈/止损价）与说明，自动算盈亏并判定成败
function CloseForm({
  j,
  mark,
  onDone,
}: {
  j: TradeJournal
  mark: number
  onDone: () => void
}) {
  const [exit, setExit] = useState(mark > 0 ? String(+mark.toFixed(mark < 0.01 ? 7 : 4)) : '')
  const [note, setNote] = useState('')
  const exitNum = parseFloat(exit)
  const preview = exitNum > 0 ? pnlAt(j, exitNum) : null

  function submit() {
    if (!(exitNum > 0)) return
    closeTrade(j.id, exitNum, note.trim())
    onDone()
  }

  return (
    <div className="border border-neon/30 bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neon">
        <Check className="size-3" /> 平仓结算（自动计算盈亏并判定成功 / 失败）
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="w-36">
          <NumInput label="平仓价 / 止盈价" value={exit} onChange={setExit} placeholder="平仓成交价" />
        </div>
        {/* 快捷填入 */}
        <div className="flex gap-1">
          {mark > 0 && (
            <QuickFill label="现价" onClick={() => setExit(String(+mark.toFixed(mark < 0.01 ? 7 : 4)))} />
          )}
          {j.target > 0 && <QuickFill label="目标价" onClick={() => setExit(String(j.target))} />}
          {j.stop > 0 && <QuickFill label="止损价" onClick={() => setExit(String(j.stop))} />}
        </div>
      </div>

      {/* 结算预览 */}
      {preview && (
        <div
          className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-1.5 text-[12px]"
          style={{ background: `color-mix(in oklch, ${preview.win ? 'var(--up)' : 'var(--down)'} 10%, transparent)` }}
        >
          <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: preview.win ? 'var(--up)' : 'var(--down)' }}>
            {preview.win ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
            {preview.win ? '成功' : '失败'}
          </span>
          <span className="font-mono font-bold" style={{ color: preview.win ? 'var(--up)' : 'var(--down)' }}>
            盈亏 {preview.pnl >= 0 ? '+' : ''}
            {fmtUsd(preview.pnl)}
          </span>
          <span className="font-mono font-semibold" style={{ color: preview.win ? 'var(--up)' : 'var(--down)' }}>
            ROE {preview.roe >= 0 ? '+' : ''}
            {preview.roe.toFixed(1)}%
          </span>
        </div>
      )}

      <div className="mt-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="平仓说明：在哪里止盈、为何离场……"
          className="w-full border border-border bg-card px-3 py-2 text-sm outline-none focus:border-neon"
        />
      </div>

      <div className="mt-2 flex gap-2">
        <button
          onClick={submit}
          disabled={!(exitNum > 0)}
          className="flex items-center gap-1.5 bg-neon px-3 py-1.5 text-xs font-semibold text-[color:var(--background)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check className="size-3.5" />
          确认平仓
        </button>
        <button
          onClick={onDone}
          className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" />
          取消
        </button>
      </div>
    </div>
  )
}

function QuickFill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="border border-border px-2 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-neon hover:text-neon"
    >
      {label}
    </button>
  )
}
