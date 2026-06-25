'use client'

import { useMemo, useState } from 'react'
import {
  BarChart3,
  Check,
  CheckCircle2,
  NotebookPen,
  Plus,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { Panel } from './panel'
import { JournalStatsModal } from './journal-stats'
import {
  addJournalEntry,
  closeTrade,
  computeStats,
  computeTrade,
  fmtPrice,
  fmtUsd,
  realizedPnl,
  removeJournalEntry,
  reopenTrade,
  useJournal,
  type TradeJournal,
  type TradeSide,
} from '@/lib/journal-store'
import { cn } from '@/lib/utils'

type FormState = {
  symbol: string
  side: TradeSide
  leverage: string
  margin: string
  entry: string
  stop: string
  target: string
  note: string
}

const initialForm: FormState = {
  symbol: '',
  side: 'long',
  leverage: '10',
  margin: '',
  entry: '',
  stop: '',
  target: '',
  note: '',
}

function numberValue(value: string) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function formatTime(ts: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ts))
}

export function ManualJournal() {
  const entries = useJournal()
  const stats = useMemo(() => computeStats(entries), [entries])
  const [adding, setAdding] = useState(false)
  const [showStats, setShowStats] = useState(false)

  return (
    <Panel
      title="交易日记"
      subtitle="真实写入 /api/frontend/journal-contract；接口失败时才使用本地兜底"
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
          <NotebookPen className="size-7 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            暂无交易日记。这里不会用样例记录填充，新增记录后会同步到后端。
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {entries.map((entry) => (
            <JournalCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </Panel>
  )
}

function JournalForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState<FormState>(initialForm)
  const metrics = computeTrade({
    side: form.side,
    leverage: numberValue(form.leverage),
    margin: numberValue(form.margin),
    entry: numberValue(form.entry),
    stop: numberValue(form.stop),
    target: numberValue(form.target),
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function submit() {
    const symbol = form.symbol.trim().toUpperCase()
    const leverage = numberValue(form.leverage)
    const margin = numberValue(form.margin)
    const entry = numberValue(form.entry)
    const stop = numberValue(form.stop)
    const target = numberValue(form.target)

    if (!symbol || !leverage || !margin || !entry) return

    addJournalEntry({
      symbol,
      side: form.side,
      leverage,
      margin,
      entry,
      stop,
      target,
      status: '持仓中',
      note: form.note.trim(),
      images: [],
    })
    setForm(initialForm)
    onDone()
  }

  return (
    <div className="border-b border-border bg-secondary/20 p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={form.symbol}
          onChange={(e) => set('symbol', e.target.value)}
          placeholder="币种，如 TIA"
          className="border border-border bg-card px-3 py-2 text-sm outline-none focus:border-neon"
        />
        <select
          value={form.side}
          onChange={(e) => set('side', e.target.value as TradeSide)}
          className="border border-border bg-card px-3 py-2 text-sm outline-none focus:border-neon"
        >
          <option value="long">做多</option>
          <option value="short">做空</option>
        </select>
        <NumInput label="杠杆" value={form.leverage} onChange={(v) => set('leverage', v)} />
        <NumInput label="保证金 USDT" value={form.margin} onChange={(v) => set('margin', v)} />
        <NumInput label="开仓价" value={form.entry} onChange={(v) => set('entry', v)} />
        <NumInput label="止损价" value={form.stop} onChange={(v) => set('stop', v)} />
        <NumInput label="目标价" value={form.target} onChange={(v) => set('target', v)} />
        <input
          value={form.note}
          onChange={(e) => set('note', e.target.value)}
          placeholder="备注"
          className="border border-border bg-card px-3 py-2 text-sm outline-none focus:border-neon"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={submit}
          className="flex items-center gap-1.5 bg-neon px-3 py-1.5 text-xs font-semibold text-[color:var(--background)]"
        >
          <Check className="size-3.5" />
          保存
        </button>
        {metrics && (
          <span className="font-mono text-xs text-muted-foreground">
            仓位 {fmtUsd(metrics.positionValue)} · 结构盈亏比 {metrics.riskReward.toFixed(2)}R
          </span>
        )}
      </div>
    </div>
  )
}

function NumInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="w-full border border-border bg-card px-3 py-2 font-mono text-sm outline-none focus:border-neon"
      />
    </label>
  )
}

function JournalCard({ entry }: { entry: TradeJournal }) {
  const metrics = computeTrade(entry)
  const realized = realizedPnl(entry)
  const [closing, setClosing] = useState(false)
  const [exit, setExit] = useState(entry.exitPrice ? String(entry.exitPrice) : '')
  const [note, setNote] = useState('')
  const exitNum = numberValue(exit)

  function submitClose() {
    if (!exitNum) return
    closeTrade(entry.id, exitNum, note.trim())
    setClosing(false)
  }

  return (
    <div className="group px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-bold">{entry.symbol}</span>
        <span className={cn('font-mono text-xs font-semibold', entry.side === 'long' ? 'text-up' : 'text-down')}>
          {entry.side === 'long' ? '做多' : '做空'}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{entry.leverage}x</span>
        <span className="text-xs text-muted-foreground">{formatTime(entry.createdAt)}</span>
        <span className="ml-auto text-xs text-muted-foreground">{entry.status}</span>
        <button
          onClick={() => removeJournalEntry(entry.id)}
          className="text-muted-foreground/50 opacity-0 transition-opacity hover:text-down group-hover:opacity-100"
          aria-label="删除记录"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <Field label="开仓" value={fmtPrice(entry.entry)} />
        <Field label="止损" value={fmtPrice(entry.stop)} tone="var(--down)" />
        <Field label="目标" value={fmtPrice(entry.target)} tone="var(--up)" />
        <Field label="保证金" value={fmtUsd(entry.margin)} />
        <Field label="仓位" value={metrics ? fmtUsd(metrics.positionValue) : '待计算'} />
        <Field label="赔率" value={metrics ? `${metrics.riskReward.toFixed(2)}R` : '待计算'} />
      </div>

      {entry.note && <p className="mt-2 text-xs text-muted-foreground">备注：{entry.note}</p>}

      {realized && (
        <div className={cn('mt-2 flex items-center gap-2 text-xs', realized.win ? 'text-up' : 'text-down')}>
          {realized.win ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
          已实现盈亏 {realized.pnl >= 0 ? '+' : ''}
          {fmtUsd(realized.pnl)} · ROE {realized.roe.toFixed(1)}%
        </div>
      )}

      <div className="mt-3">
        {entry.status === '持仓中' ? (
          closing ? (
            <div className="flex flex-wrap items-end gap-2">
              <NumInput label="平仓价" value={exit} onChange={setExit} />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="平仓说明"
                className="border border-border bg-card px-3 py-2 text-sm outline-none focus:border-neon"
              />
              <button
                onClick={submitClose}
                className="flex items-center gap-1.5 bg-neon px-3 py-2 text-xs font-semibold text-[color:var(--background)]"
              >
                <Check className="size-3.5" />
                确认平仓
              </button>
              <button
                onClick={() => setClosing(false)}
                className="border border-border px-3 py-2 text-xs font-semibold text-muted-foreground"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => setClosing(true)}
              className="flex items-center gap-1.5 border border-neon/40 bg-neon-soft px-3 py-1.5 text-xs font-semibold text-neon"
            >
              <Check className="size-3.5" />
              平仓结算
            </button>
          )
        ) : (
          <button
            onClick={() => reopenTrade(entry.id)}
            className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground"
          >
            <RotateCcw className="size-3.5" />
            撤销平仓
          </button>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border border-border bg-card px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono font-semibold" style={{ color: tone ?? 'var(--foreground)' }}>
        {value}
      </div>
    </div>
  )
}
