'use client'

import { useEffect, useState } from 'react'
import { Radar, Layers, Clock } from 'lucide-react'
import { type ScanState } from '@/lib/frontend-market-types'
import { fmtCap } from '@/lib/display-format'
import type { ApiUsageState, DataSourceState, ScanProofData } from '@/lib/radar-contract'
import type { DataStatus } from '@/lib/data-status'
import type { Resource } from '@/lib/data-status'
import {
  scanProofResourceToScanState,
} from '@/lib/frontend-display-adapters'
import { StatusBadge } from './data-state'
import { cn } from '@/lib/utils'

const STATUS_TONE: Record<DataSourceState['feed'], string> = {
  live: 'bg-up',
  cached: 'bg-[var(--sig-pump)]',
  partial: 'bg-[var(--sig-pump)]',
  stale: 'bg-[var(--sig-pump)]',
  failed: 'bg-down',
}
const STATUS_LABEL: Record<DataSourceState['feed'], string> = {
  live: '实时',
  cached: '缓存',
  partial: '部分可用',
  stale: '偏旧',
  failed: '失败',
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

const EMPTY_PROOF: ScanProofData = {
  observedAssets: 0,
  acceptedAssets: 0,
  eligibleAssets: 0,
  currentCycleScannedAssets: 0,
  deepScanned: 0,
  awaitingDeepScan: 0,
  lightAcceptancePercent: 0,
  currentCycleCoveragePercent: 0,
  deepCoveragePercent: 0,
  lightAcceptanceDenominator: 'observed_assets',
  currentCycleCoverageDenominator: 'eligible_assets',
  deepCoverageDenominator: 'eligible_assets',
  lastScanAt: 'n/a',
  nextScanCountdownSec: 0,
  stuck: true,
}

const SCAN_DOT_TONE: Record<DataStatus, string> = {
  loading: 'bg-muted-foreground',
  live: 'bg-up',
  cached: 'bg-neon',
  stale: 'bg-[var(--sig-pump)]',
  partial: 'bg-[var(--sig-pump)]',
  empty: 'bg-muted-foreground',
  error: 'bg-down',
  failed: 'bg-down',
}

function scanRuntimeLabel(status: DataStatus, mode: ScanState['mode']) {
  if (status === 'failed' || status === 'error') return '扫描异常'
  if (status === 'empty') return '暂无扫描'
  if (status === 'loading') return '扫描加载中'
  if (status === 'partial' || status === 'stale' || status === 'cached') return `${mode}降级`
  return `${mode}中`
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
  const scanStatus = scanProof?.status ?? 'empty'
  const proof = scanProof?.data ?? EMPTY_PROOF
  const exchanges = dataSources?.data ?? []
  const [countdown, setCountdown] = useState(scan.nextBatchSec)
  const scanAvailable = scanProof !== undefined && !['loading', 'empty', 'error', 'failed'].includes(scanStatus)
  const budgetAvailable = apiUsage !== undefined && !['loading', 'empty', 'error', 'failed'].includes(apiUsage.status)
  const ageLabel = !scanAvailable || scanProof?.ageSec === undefined ? 'n/a' : `${Math.max(0, Math.round(scanProof.ageSec))}s 前`
  const countLabel = (value: number) => scanAvailable ? fmtCap(value) : 'n/a'

  // 下一批扫描倒计时（纯客户端，避免水合不匹配）
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    const t = setInterval(() => {
      setCountdown((c) => (c <= 1 ? scan.nextBatchSec : c - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [scan.nextBatchSec])

  const budgetPct = budgetAvailable
    ? Math.round((scan.budgetUsed / scan.budgetTotal) * 100)
    : null

  return (
    <section className="border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <span className="h-3.5 w-1 bg-neon" />
        <Radar className="size-4 animate-spin-slow text-neon" />
        <h2 className="font-semibold">全市场扫描证明</h2>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="relative flex size-1.5">
            {scanStatus === 'live' && (
              <span className={`absolute inline-flex size-full animate-ping rounded-full ${SCAN_DOT_TONE[scanStatus]} opacity-70`} />
            )}
            <span className={`relative inline-flex size-1.5 rounded-full ${SCAN_DOT_TONE[scanStatus]}`} />
          </span>
          {scanRuntimeLabel(scanStatus, scan.mode)}
          {scanProof && <StatusBadge status={scanProof.status} />}
        </span>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1.1fr_1fr]">
        {/* 左：公开轻扫接受 + 扫描进度 */}
        <div className="flex items-center gap-5">
          <CoverageRing pct={scanAvailable ? proof.lightAcceptancePercent : null} />
          <div className="space-y-3 text-sm">
            <Stat label="观察" value={countLabel(proof.observedAssets)} />
            <Stat label="轻扫接受" value={countLabel(proof.acceptedAssets)} tone="text-up" />
            <Stat label="可扫描" value={countLabel(proof.eligibleAssets)} />
            <Stat label="本周期" value={countLabel(proof.currentCycleScannedAssets)} />
            <Stat label="已深扫" value={countLabel(proof.deepScanned)} tone="text-neon" />
            <Stat label="等待深扫" value={countLabel(scan.pending)} tone="text-muted-foreground" />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" />
              合同年龄 · <span className="font-mono">{ageLabel}</span>
            </div>
            <div className="text-[10px] leading-relaxed text-muted-foreground">
              {scanAvailable
                ? `公开接受 ${proof.acceptedAssets}/${proof.observedAssets} (${proof.lightAcceptancePercent.toFixed(1)}%) · 本周期 ${proof.currentCycleScannedAssets}/${proof.eligibleAssets} (${proof.currentCycleCoveragePercent.toFixed(1)}%) · 深扫 ${proof.deepScanned}/${proof.eligibleAssets} (${proof.deepCoveragePercent.toFixed(1)}%)`
                : '公开接受、本周期与深扫分母 n/a'}
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
                {budgetAvailable
                  ? `${scan.budgetUsed.toLocaleString()} / ${scan.budgetTotal.toLocaleString()}`
                  : 'n/a'}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden bg-secondary">
              <div
                className={cn(
                  'relative h-full origin-left animate-bar-grow transition-all duration-700',
                  (budgetPct ?? 0) > 85 ? 'bg-down' : 'bg-neon',
                )}
                style={{ width: `${budgetPct ?? 0}%` }}
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
              {scanAvailable ? (mounted ? `${countdown}s` : `${scan.nextBatchSec}s`) : 'n/a'}
            </span>
          </div>

          {/* 交易所覆盖状态 */}
          <div>
            <div className="mb-2 text-xs text-muted-foreground">交易所覆盖状态</div>
            <div className="grid grid-cols-2 gap-1.5">
              {exchanges.length === 0 && (
                <div className="col-span-2 border border-border px-2.5 py-1.5 text-xs text-muted-foreground">n/a</div>
              )}
              {exchanges.map((ex) => (
                <div
                  key={ex.name}
                  className="flex items-center gap-2 border border-border px-2.5 py-1.5 text-xs"
                >
                  <span className={cn('size-1.5 rounded-full', STATUS_TONE[ex.feed])} />
                  <span className="font-medium">{ex.name}</span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {STATUS_LABEL[ex.feed]}
                    {ex.latencyMs === null ? '' : ` · ${ex.latencyMs}ms`}
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

function CoverageRing({ pct }: { pct: number | null }) {
  const r = 46
  const c = 2 * Math.PI * r
  const off = c * (1 - (pct ?? 0) / 100)
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
        <span className="font-mono text-2xl font-bold text-neon">{pct === null ? 'n/a' : `${pct.toFixed(1)}%`}</span>
        <span className="text-[10px] text-muted-foreground">轻扫接受率</span>
      </div>
    </div>
  )
}
