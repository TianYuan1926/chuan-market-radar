'use client'

import {
  type CapabilityStage,
  type DataSourceState,
  type DeepScanQueue,
  type RadarContract,
  type ScanProofData,
} from '@/lib/radar-contract'
import { resource } from '@/lib/data-status'
import { StatusBadge, FreshnessTag, ResourceBoundary } from '@/components/data-state'
import { CountUp } from '@/components/count-up'
import {
  Radar,
  Layers,
  Cpu,
  Database,
  CircleDot,
  Timer,
} from 'lucide-react'

const CAP_STATUS_TONE: Record<string, string> = {
  active: 'text-up border-up/40 bg-up/10',
  standby: 'text-neon border-neon/40 bg-neon/10',
  degraded: 'text-down border-down/40 bg-down/10',
}
const CAP_STATUS_LABEL: Record<string, string> = {
  active: '运行中',
  standby: '待命',
  degraded: '降级',
}
const FEED_TONE: Record<string, string> = {
  live: 'text-up',
  cached: 'text-neon',
  stale: 'text-[oklch(0.8_0.15_75)]',
  partial: 'text-[oklch(0.8_0.15_75)]',
  failed: 'text-down',
}
const FEED_LABEL: Record<string, string> = {
  live: '实时',
  cached: '缓存',
  stale: '过期',
  partial: '部分',
  failed: '失败',
}

const EMPTY_SOURCE = {
  source: 'frontend-contract',
  reason: '未收到后端页面契约，禁止使用演示数据兜底',
}

const EMPTY_SCAN = resource<ScanProofData>(
  {
    totalMonitored: 0,
    scannable: 0,
    lightScanned: 0,
    deepScanned: 0,
    awaitingDeepScan: 0,
    coverage: 0,
    lastScanAt: '—',
    nextScanCountdownSec: 0,
    stuck: true,
  },
  'empty',
  EMPTY_SOURCE,
)

const EMPTY_QUEUE = resource<DeepScanQueue>(
  {
    currentBatch: [],
    nextBatch: [],
    highPriority: [],
    coldExploration: [],
    longUnscanned: [],
  },
  'empty',
  EMPTY_SOURCE,
)

const EMPTY_CAPABILITIES = resource<CapabilityStage[]>([], 'empty', EMPTY_SOURCE)
const EMPTY_SOURCES = resource<DataSourceState[]>([], 'empty', EMPTY_SOURCE)

export function DashboardRadarControl({ contract }: { contract?: RadarContract } = {}) {
  const scan = contract?.scanProof ?? EMPTY_SCAN
  const queue = contract?.deepScanQueue ?? EMPTY_QUEUE
  const caps = contract?.capabilityStages ?? EMPTY_CAPABILITIES
  const sources = contract?.dataSources ?? EMPTY_SOURCES

  const sp = scan.data

  const scanMetrics: { label: string; value: number; suffix?: string }[] = [
    { label: '总监控币数', value: sp.totalMonitored },
    { label: '可扫描', value: sp.scannable },
    { label: '已轻扫', value: sp.lightScanned },
    { label: '已深扫', value: sp.deepScanned },
    { label: '等待深扫', value: sp.awaitingDeepScan },
    { label: '本轮深扫占比', value: sp.coverage, suffix: '%' },
  ]

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* 一、全市场扫描证明 */}
      <section className="border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <span className="h-3.5 w-1 bg-neon" />
          <Radar className="size-4 text-neon" />
          <h2 className="font-semibold">全市场扫描证明</h2>
          <StatusBadge status={scan.status} className="ml-auto" />
        </div>
        <div className="p-5">
          <ResourceBoundary resource={scan}>
          <div className="grid grid-cols-3 gap-2.5">
            {scanMetrics.map((m, i) => (
              <div
                key={m.label}
                className="data-tile tile-in border border-border bg-secondary/30 p-2.5"
                style={{ ['--i' as string]: i }}
              >
                <div className="text-[11px] text-muted-foreground">{m.label}</div>
                <div className="mt-1 font-mono text-lg font-bold tracking-tight">
                  <CountUp value={m.value} suffix={m.suffix} />
                </div>
              </div>
            ))}
          </div>
          {/* 本轮深扫占比进度条：入场增长 + 轨道流光 */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>本轮深扫占比</span>
              <span className="font-mono text-foreground">{sp.coverage}%</span>
            </div>
            <div className="bar-track h-1.5 overflow-hidden bg-secondary">
              <div
                className="bar-fill h-full bg-neon"
                style={{ width: `${sp.coverage}%` }}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CircleDot className="size-3.5 text-neon" />
              最近扫描 <span className="font-mono text-foreground">{sp.lastScanAt}</span>
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Timer className="size-3.5 text-neon" />
              下一轮 <span className="font-mono text-foreground">{sp.nextScanCountdownSec}s</span>
            </span>
            <span
              className={`flex items-center gap-1.5 ${sp.stuck ? 'text-down' : 'text-up'}`}
            >
              <span className={`size-1.5 rounded-full ${sp.stuck ? 'bg-down' : 'bg-up animate-pulse'}`} />
              {sp.stuck ? '扫描卡住' : '扫描正常'}
            </span>
          </div>
          <FreshnessTag {...scan} className="mt-2 block" />
          </ResourceBoundary>
        </div>
      </section>

      {/* 二、深扫队列 */}
      <section className="border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <span className="h-3.5 w-1 bg-neon" />
          <Layers className="size-4 text-neon" />
          <h2 className="font-semibold">深扫队列</h2>
          <StatusBadge status={queue.status} className="ml-auto" />
        </div>
        <div className="space-y-3 p-5">
          <ResourceBoundary resource={queue}>
          <QueueRow label="本轮深扫" symbols={queue.data.currentBatch} tone="neon" />
          <QueueRow label="下一批" symbols={queue.data.nextBatch} tone="muted" />
          <QueueRow label="高优先级" symbols={queue.data.highPriority} tone="up" />
          <QueueRow label="冷门探索" symbols={queue.data.coldExploration} tone="muted" />
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              长时间未扫
            </div>
            <div className="flex flex-wrap gap-1.5">
              {queue.data.longUnscanned.map((u) => (
                <span
                  key={u.symbol}
                  className="flex items-center gap-1 border border-[oklch(0.8_0.15_75)]/40 bg-[oklch(0.8_0.15_75)]/10 px-1.5 py-0.5 font-mono text-[11px] text-[oklch(0.82_0.15_75)]"
                >
                  {u.symbol}
                  <span className="opacity-70">{u.idleMin}m</span>
                </span>
              ))}
            </div>
          </div>
          <FreshnessTag {...queue} className="block" />
          </ResourceBoundary>
        </div>
      </section>

      {/* 三、系统能力总控（9 阶段） */}
      <section className="border border-border bg-card lg:col-span-2">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <span className="h-3.5 w-1 bg-neon" />
          <Cpu className="size-4 text-neon" />
          <h2 className="font-semibold">系统能力总控</h2>
          <span className="ml-auto mr-2 text-xs text-muted-foreground">9 个能力阶段</span>
          <StatusBadge status={caps.status} />
        </div>
        <div className="p-5">
          <ResourceBoundary resource={caps} isEmpty={(d) => d.length === 0}>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {caps.data.map((c, i) => (
            <div
              key={c.key}
              className="data-tile tile-in border border-border bg-secondary/30 p-3"
              style={{ ['--i' as string]: i }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm">{c.name}</span>
                <span
                  className={`shrink-0 border px-1.5 py-0.5 text-[10px] ${CAP_STATUS_TONE[c.status]}`}
                >
                  {CAP_STATUS_LABEL[c.status]}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{c.desc}</p>
              <div className="mt-2 font-mono text-[11px] text-neon">{c.note}</div>
            </div>
          ))}
          </div>
          </ResourceBoundary>
        </div>
      </section>

      {/* 四、数据源状态 */}
      <section className="border border-border bg-card lg:col-span-2">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <span className="h-3.5 w-1 bg-neon" />
          <Database className="size-4 text-neon" />
          <h2 className="font-semibold">数据源状态</h2>
          <StatusBadge status={sources.status} className="ml-auto" />
        </div>
        <div className="p-5">
          <ResourceBoundary resource={sources} isEmpty={(d) => d.length === 0}>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {sources.data.map((s, i) => (
              <div
                key={s.name}
                className="data-tile tile-in border border-border bg-secondary/30 p-3"
                style={{ ['--i' as string]: i }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{s.name}</span>
                  <span className={`flex items-center gap-1 text-[11px] font-semibold ${FEED_TONE[s.feed]}`}>
                    <span className="size-1.5 rounded-full bg-current" />
                    {FEED_LABEL[s.feed]}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                  <span>{s.latencyMs === null ? '延迟 待探针' : `延迟 ${s.latencyMs}ms`}</span>
                  <span>{s.lastUpdate}</span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{s.note}</p>
              </div>
            ))}
          </div>
          </ResourceBoundary>
        </div>
      </section>
    </div>
  )
}

function QueueRow({
  label,
  symbols,
  tone,
}: {
  label: string
  symbols: string[]
  tone: 'neon' | 'up' | 'muted'
}) {
  const toneClass =
    tone === 'neon'
      ? 'border-neon/40 bg-neon/10 text-neon'
      : tone === 'up'
        ? 'border-up/40 bg-up/10 text-up'
        : 'border-border bg-secondary/40 text-foreground'
  return (
    <div>
      <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {symbols.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">—</span>
        ) : (
          symbols.map((s) => (
            <span key={s} className={`border px-1.5 py-0.5 font-mono text-[11px] ${toneClass}`}>
              {s}
            </span>
          ))
        )}
      </div>
    </div>
  )
}
