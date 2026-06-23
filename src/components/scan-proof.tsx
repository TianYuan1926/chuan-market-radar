'use client'

import { useEffect, useState } from 'react'
import { Radar, Layers, Clock } from 'lucide-react'
import {
  type ScanState,
  type ExchangeStatus,
} from '@/lib/frontend-market-types'
import { fmtCap } from '@/lib/display-format'
import type { ApiUsageState, DataSourceState, ScanProofData } from '@/lib/radar-contract'
import type { Resource } from '@/lib/data-status'
import {
  dataSourcesResourceToExchangeCoverage,
  scanProofResourceToScanState,
} from '@/lib/frontend-display-adapters'
import { LiveValue } from './live-value'
import { useLiveNumber } from '@/lib/use-live-number'
import { cn } from '@/lib/utils'

const STATUS_TONE: Record<ExchangeStatus['status'], string> = {
  online: 'bg-up',
  degraded: 'bg-[var(--sig-pump)]',
  down: 'bg-down',
}
const STATUS_LABEL: Record<ExchangeStatus['status'], string> = {
  online: '在线',
  degraded: '降级',
  down: '离线',
}

const EMPTY_SCAN: ScanState = {
  coverage: 0,
  scanned: 0,
  pending: 0,
  total: 0,
  batch: 1,
  totalBatches: 1,
  nextBatchSec: 0,
  budgetUsed: 0,
  budgetTotal: 1,
  freshnessSec: 0,
  mode: '轻扫',
}

export function ScanProof({
  scanProof,
  dataSources,
  apiUsage,
}: {
  scanProof?: Resource<ScanProofData>
  dataSources?: Resource<DataSourceState[]>
  apiUsage?: Resource<ApiUsageState>
} = {}) {
  const scan: ScanState = scanProof
    ? scanProofResourceToScanState(scanProof, apiUsage)
    : EMPTY_SCAN
  const exchanges = dataSources
    ? dataSourcesResourceToExchangeCoverage(dataSources)
    : []
  const [countdown, setCountdown] = useState(scan.nextBatchSec)

  // Only mirrors backend values. No generated market movement.
  const liveLightScanShare = useLiveNumber(scan.coverage, {
    volatility: 0.012,
    intervalMs: 2600,
    min: 0,
    max: 100,
  })
  const liveScanned = useLiveNumber(scan.scanned, {
    volatility: 0.01,
    intervalMs: 2600,
    drift: true,
  })
  const liveFreshness = useLiveNumber(scan.freshnessSec, {
    volatility: 0.6,
    intervalMs: 1800,
    min: 1,
    max: 30,
  })

  // 下一批扫描倒计时（纯客户端，避免水合不匹配）
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    const t = setInterval(() => {
      setCountdown((c) => (c <= 1 ? scan.nextBatchSec : c - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [scan.nextBatchSec])

  const budgetPct = Math.round((scan.budgetUsed / scan.budgetTotal) * 100)

  return (
    <section className="border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <span className="h-3.5 w-1 bg-neon" />
        <Radar className="size-4 animate-spin-slow text-neon" />
        <h2 className="font-semibold">全市场扫描证明</h2>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-70" />
            <span className="relative inline-flex size-1.5 rounded-full bg-up" />
          </span>
          {scan.mode}中 · 批次 {scan.batch}/{scan.totalBatches}
        </span>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1.1fr_1fr]">
        {/* 左：全市场轻扫覆盖 + 扫描进度 */}
        <div className="flex items-center gap-5">
          <CoverageRing pct={liveLightScanShare} />
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs text-muted-foreground">已轻扫</span>
              <LiveValue
                value={liveScanned}
                format={(n) => fmtCap(Math.round(n))}
                className="font-mono font-bold text-up"
              />
            </div>
            <Stat label="等待深扫" value={fmtCap(scan.pending)} tone="text-muted-foreground" />
            <Stat label="标的总量" value={fmtCap(scan.total)} />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" />
              数据新鲜度 ·{' '}
              <LiveValue
                value={liveFreshness}
                format={(n) => `${Math.round(n)}s`}
                flash={false}
                className="font-mono"
              />{' '}
              前
            </div>
          </div>
        </div>

        {/* 右：预算 + 下一批 + 交易所覆盖 */}
        <div className="space-y-4">
          {/* 今日扫描预算 */}
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">今日扫描预算</span>
              <span className="font-mono">
                {scan.budgetUsed.toLocaleString()} / {scan.budgetTotal.toLocaleString()}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden bg-secondary">
              <div
                className={cn(
                  'relative h-full origin-left animate-bar-grow transition-all duration-700',
                  budgetPct > 85 ? 'bg-down' : 'bg-neon',
                )}
                style={{ width: `${budgetPct}%` }}
              >
                <span
                  className="absolute inset-y-0 w-1/3"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, color-mix(in oklch, white 45%, transparent), transparent)',
                    animation: 'bar-stream 2.2s linear infinite',
                  }}
                />
              </div>
            </div>
          </div>

          {/* 下一批扫描 */}
          <div className="flex items-center gap-2 border border-border bg-secondary/40 px-3 py-2 text-sm">
            <Layers className="size-4 text-neon" />
            <span className="text-muted-foreground">下一批扫描</span>
            <span className="ml-auto font-mono font-bold tabular-nums">
              {mounted ? `${countdown}s` : `${scan.nextBatchSec}s`}
            </span>
          </div>

          {/* 交易所覆盖状态 */}
          <div>
            <div className="mb-2 text-xs text-muted-foreground">交易所覆盖状态</div>
            <div className="grid grid-cols-2 gap-1.5">
              {exchanges.map((ex) => (
                <div
                  key={ex.name}
                  className="flex items-center gap-2 border border-border px-2.5 py-1.5 text-xs"
                >
                  <span className={cn('size-1.5 rounded-full', STATUS_TONE[ex.status])} />
                  <span className="font-medium">{ex.name}</span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {ex.status === 'down' ? STATUS_LABEL[ex.status] : `${ex.coverage}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
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
    <div className="flex items-center gap-2">
      <span className="w-16 text-xs text-muted-foreground">{label}</span>
      <span className={cn('font-mono font-bold', tone)}>{value}</span>
    </div>
  )
}

function CoverageRing({ pct }: { pct: number }) {
  const r = 46
  const c = 2 * Math.PI * r
  const off = c * (1 - pct / 100)
  // 挂载时从空环扫到目标值（生长入场）
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(t)
  }, [])
  return (
    <div className="relative grid size-[120px] shrink-0 place-items-center">
      <svg width="120" height="120" className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--neon)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={grown ? off : c}
          style={{
            filter: 'drop-shadow(0 0 6px var(--neon))',
            transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <LiveValue
          value={pct}
          format={(n) => `${n.toFixed(1)}%`}
          flash={false}
          className="font-mono text-2xl font-bold text-neon"
        />
        <span className="text-[10px] text-muted-foreground">轻扫覆盖</span>
      </div>
    </div>
  )
}
