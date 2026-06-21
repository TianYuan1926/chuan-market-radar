'use client'

import type { ComponentType, ReactNode } from 'react'
import { SiteNav } from '@/components/site-nav'
import { SessionBar } from '@/components/session-bar'
import { Panel, PageHeader } from '@/components/panel'
import { MarketMacroDerivatives } from '@/components/market/macro-derivatives'
import { FreshnessTag, ResourceBoundary, StatusBadge } from '@/components/data-state'
import { radarSignalsToTokens } from '@/lib/frontend-display-adapters'
import type { DataSourceState, LeaderboardRow, RadarContract } from '@/lib/radar-contract'
import {
  Activity,
  AlertTriangle,
  Database,
  Gauge,
  Globe,
  Radio,
  ShieldCheck,
  Wind,
} from 'lucide-react'

export function MarketPageClient({
  radar,
  tickerRows = [],
}: {
  radar: RadarContract
  tickerRows?: LeaderboardRow[]
}) {
  const tokens = radarSignalsToTokens(radar.radarSignals.data, tickerRows)
  const macro = radar.macroAltEnv.data
  const scan = radar.scanProof.data
  const api = radar.apiUsage.data
  const marketTone = suggestionTone(macro.suggestion)
  const coverageTone = scan.stuck ? 'var(--down)' : scan.coverage >= 80 ? 'var(--up)' : 'var(--sig-pump)'

  return (
    <div className="min-h-dvh bg-background">
      <SiteNav />
      <SessionBar tokens={tokens} />

      <main className="mx-auto max-w-[1560px] space-y-5 px-4 py-5 sm:px-6">
        <PageHeader
          title="大盘环境与数据面板"
          desc="所有行情环境、衍生品、扫描覆盖和数据源状态均读取后端契约数据；缺失时显式降级，不再用前端模拟数值补位。"
        />

        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <BigStat
            label="市场风向"
            value={macro.suggestion}
            tone={marketTone}
            sub={`风险模式 ${macro.riskMode}`}
            icon={Wind}
            status={<StatusBadge status={radar.macroAltEnv.status} />}
          />
          <BigStat
            label="山寨强弱"
            value={`${macro.altStrength}/100`}
            tone={macro.altStrength >= 50 ? 'var(--up)' : 'var(--down)'}
            sub={`BTC.D ${macro.btcDominance}% · ${macro.btcDominanceTrend}`}
            icon={Activity}
            status={<FreshnessTag {...radar.macroAltEnv} />}
          />
          <BigStat
            label="全市场覆盖"
            value={`${scan.coverage}%`}
            tone={coverageTone}
            sub={`${scan.lightScanned}/${scan.totalMonitored} 轻扫，${scan.deepScanned} 深扫`}
            icon={RadarIcon}
            status={<StatusBadge status={radar.scanProof.status} />}
          />
          <BigStat
            label="CoinGlass 调用"
            value={`${api.usedToday}/${api.usedToday + api.remainingToday}`}
            tone={api.throttled ? 'var(--down)' : 'var(--neon)'}
            sub={`每分钟 ${api.perMinuteLimit} · pacing ${api.pacingMs}ms`}
            icon={Gauge}
            status={<StatusBadge status={radar.apiUsage.status} />}
          />
        </div>

        <MarketMacroDerivatives contract={radar} />

        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <Panel
            title="全市场扫描证明"
            icon={Globe}
            right={<StatusBadge status={radar.scanProof.status} />}
          >
            <ResourceBoundary resource={radar.scanProof}>
              {(s) => (
                <>
                  <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                    <DataCell label="监控币种" value={formatNumber(s.totalMonitored)} />
                    <DataCell label="可扫描" value={formatNumber(s.scannable)} />
                    <DataCell label="已轻扫" value={formatNumber(s.lightScanned)} tone="var(--up)" />
                    <DataCell label="已深扫" value={formatNumber(s.deepScanned)} tone="var(--neon)" />
                    <DataCell label="等待深扫" value={formatNumber(s.awaitingDeepScan)} tone="var(--sig-pump)" />
                    <DataCell label="覆盖率" value={`${s.coverage}%`} tone={coverageTone} />
                    <DataCell label="最近扫描" value={s.lastScanAt} />
                    <DataCell
                      label="扫描状态"
                      value={s.stuck ? '卡住' : '运行中'}
                      tone={s.stuck ? 'var(--down)' : 'var(--up)'}
                    />
                  </div>
                  <ProgressSection
                    label="扫描覆盖进度"
                    value={s.coverage}
                    tone={coverageTone}
                    note={`下一轮倒计时 ${s.nextScanCountdownSec}s`}
                  />
                </>
              )}
            </ResourceBoundary>
            <div className="border-t border-border px-5 py-2">
              <FreshnessTag {...radar.scanProof} />
            </div>
          </Panel>

          <Panel
            title="数据源状态"
            icon={Database}
            right={<StatusBadge status={radar.dataSources.status} />}
          >
            <ResourceBoundary
              resource={radar.dataSources}
              isEmpty={(rows) => rows.length === 0}
              emptyText="后端未返回数据源状态"
            >
              {(rows) => (
                <div className="divide-y divide-border/70">
                  {rows.map((row) => (
                    <DataSourceRow key={row.name} row={row} />
                  ))}
                </div>
              )}
            </ResourceBoundary>
            <div className="border-t border-border px-5 py-2">
              <FreshnessTag {...radar.dataSources} />
            </div>
          </Panel>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel
            title="后端契约数据质量"
            icon={ShieldCheck}
            right={<StatusBadge status={radar.derivatives.status} />}
          >
            <ResourceBoundary resource={radar.derivatives}>
              {(d) => (
                <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
                  <DataCell
                    label="OI 变化"
                    value={`${d.oiChange > 0 ? '+' : ''}${d.oiChange}%`}
                    tone={d.oiChange >= 0 ? 'var(--up)' : 'var(--down)'}
                  />
                  <DataCell
                    label="资金费率"
                    value={`${d.funding > 0 ? '+' : ''}${d.funding}%`}
                    tone={d.funding >= 0 ? 'var(--sig-pump)' : 'var(--up)'}
                  />
                  <DataCell label="多空比" value={d.longShortRatio.toFixed(2)} />
                  <DataCell label="主动买卖比" value={d.takerBuySell.toFixed(2)} />
                  <DataCell label="交易所覆盖" value={`${d.exchangeCoverage}/${d.totalExchanges}`} />
                  <DataCell label="更新时间" value={d.lastUpdate} />
                </div>
              )}
            </ResourceBoundary>
            <div className="border-t border-border px-5 py-2">
              <FreshnessTag {...radar.derivatives} />
            </div>
          </Panel>

          <Panel
            title="调用预算与限速保护"
            icon={AlertTriangle}
            right={<StatusBadge status={radar.apiUsage.status} />}
          >
            <ResourceBoundary resource={radar.apiUsage}>
              {(a) => {
                const total = Math.max(1, a.usedToday + a.remainingToday)
                const usedPct = Math.round((a.usedToday / total) * 100)
                return (
                  <div className="px-5 py-4">
                    <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                      <DataCell label="数据源" value={a.provider} />
                      <DataCell label="已用" value={formatNumber(a.usedToday)} />
                      <DataCell label="剩余" value={formatNumber(a.remainingToday)} tone="var(--up)" />
                      <DataCell label="分钟上限" value={`${a.perMinuteLimit}/min`} tone="var(--neon)" />
                    </div>
                    <ProgressSection
                      label="今日预算使用"
                      value={usedPct}
                      tone={usedPct > 85 ? 'var(--down)' : 'var(--neon)'}
                      note={a.throttled ? '已触发限速保护' : `请求间隔 ${a.pacingMs}ms，未触发限速`}
                    />
                  </div>
                )
              }}
            </ResourceBoundary>
          </Panel>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          后端契约数据仅供研究复盘与系统校准，不构成投资建议
        </p>
      </main>
    </div>
  )
}

function BigStat({
  label,
  value,
  tone,
  sub,
  icon: Icon,
  status,
}: {
  label: string
  value: string
  tone: string
  sub: string
  icon: ComponentType<{ className?: string }>
  status?: ReactNode
}) {
  return (
    <div className="hover-lift border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">{label}</span>
        <span
          className="grid size-7 shrink-0 place-items-center"
          style={{ background: `color-mix(in oklch, ${tone} 14%, transparent)`, color: tone }}
        >
          <Icon className="size-3.5" />
        </span>
      </div>
      <div className="mt-2 break-words font-mono text-2xl font-bold leading-tight" style={{ color: tone }}>
        {value}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="size-1.5 rounded-full" style={{ background: tone }} />
        <span className="min-w-0 break-words">{sub}</span>
      </div>
      {status && <div className="mt-2">{status}</div>}
    </div>
  )
}

function DataCell({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className="mt-1 break-words font-mono text-lg font-bold leading-tight"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </div>
    </div>
  )
}

function DataSourceRow({ row }: { row: DataSourceState }) {
  const tone = feedTone(row.feed)
  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Radio className="size-4 shrink-0" style={{ color: tone }} />
          <div className="min-w-0">
            <div className="font-semibold">{row.name}</div>
            <div className="mt-0.5 break-words text-xs text-muted-foreground">{row.note}</div>
          </div>
        </div>
        <span
          className="shrink-0 border px-2 py-0.5 font-mono text-[10px] uppercase"
          style={{
            color: tone,
            borderColor: `color-mix(in oklch, ${tone} 42%, transparent)`,
            background: `color-mix(in oklch, ${tone} 12%, transparent)`,
          }}
        >
          {row.feed}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>延迟 {row.latencyMs}ms</span>
        <span>更新 {row.lastUpdate}</span>
      </div>
    </div>
  )
}

function ProgressSection({
  label,
  value,
  tone,
  note,
}: {
  label: string
  value: number
  tone: string
  note: string
}) {
  const width = Math.max(0, Math.min(100, value))
  return (
    <div className="border-t border-border px-5 py-3.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{Math.round(width)}%</span>
      </div>
      <div className="bar-track mt-1.5 h-2 overflow-hidden bg-secondary">
        <div className="bar-fill h-full" style={{ width: `${width}%`, background: tone }} />
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{note}</div>
    </div>
  )
}

function suggestionTone(suggestion: string) {
  if (suggestion.includes('多')) return 'var(--up)'
  if (suggestion.includes('空')) return 'var(--down)'
  return 'var(--sig-pump)'
}

function feedTone(feed: DataSourceState['feed']) {
  if (feed === 'live') return 'var(--up)'
  if (feed === 'failed' || feed === 'stale') return 'var(--down)'
  if (feed === 'cached' || feed === 'partial') return 'var(--sig-pump)'
  return 'var(--muted-foreground)'
}

function formatNumber(value: number) {
  return value.toLocaleString('en-US')
}

function RadarIcon({ className }: { className?: string }) {
  return <Activity className={className} />
}
