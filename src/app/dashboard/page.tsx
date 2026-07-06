import Link from 'next/link'
import { SiteNav } from '@/components/site-nav'
import { SessionBar } from '@/components/session-bar'
import { ScanProof } from '@/components/scan-proof'
import { DashboardRadarControl } from '@/components/dashboard/radar-control'
import { UiInformationLayerBlock } from '@/components/ui-information-layers'
import { TokenAvatar } from '@/components/token-avatar'
import { CountUp } from '@/components/count-up'
import { LivePrice, LiveQuotePct } from '@/components/live-value'
import { POOL_META } from '@/lib/frontend-market-types'
import {
  macroResourceToMarketEnv,
  radarSignalsToSignalCards,
  radarSignalsToTokens,
  scanProofResourceToScanState,
  systemStatusFromContracts,
  withLeaderboardSignalFallback,
} from '@/lib/frontend-display-adapters'
import {
  getLeaderboardContractForPage,
  getRadarContractForPage,
} from '@/lib/frontend-contract-server'
import { PAGE_DISPLAY_NAMES } from '@/lib/ui-schema/display-names'
import type {
  DataSourceState,
  RadarSignal,
} from '@/lib/radar-contract'
import { buildUiInformationLayers, type UiDecisionState } from '@/lib/ui-schema-guard'
import {
  Activity,
  ArrowRight,
  Crosshair,
  ShieldAlert,
  TrendingUp,
  Gauge,
  ChevronRight,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

function systemStatusTone(label: ReturnType<typeof systemStatusFromContracts>) {
  if (label === '异常') {
    return {
      label: '异常',
      tone: 'var(--down)',
      pulse: 'bg-down',
    }
  }
  if (label === '降级') {
    return {
      label: '降级',
      tone: 'var(--sig-pump)',
      pulse: 'bg-[var(--sig-pump)]',
    }
  }
  return {
    label: '正常',
    tone: 'var(--up)',
    pulse: 'bg-up',
  }
}

function dataStatusLabel(status: string) {
  return {
    cached: '缓存',
    empty: '暂无',
    error: '异常',
    failed: '失败',
    live: '实时',
    loading: '加载',
    partial: '部分',
    stale: '偏旧',
  }[status] ?? '未知'
}

function dashboardDecision({
  status,
}: {
  status: ReturnType<typeof systemStatusTone>
}): UiDecisionState {
  if (status.label === '异常') return 'BLOCKED'
  return status.label === '降级' ? 'BLOCKED' : 'OBSERVE'
}

function dashboardReason(decision: UiDecisionState) {
  if (decision === 'BLOCKED') return '运行链路或数据状态存在异常，先检查数据源、缓存和深扫队列。'
  return '这里只判断系统运行状态；候选和计划数量只做统计，不生成交易结论。'
}

export default async function DashboardPage() {
  const [radar, tickerLeaderboard] = await Promise.all([
    getRadarContractForPage(),
    getLeaderboardContractForPage('volume'),
  ])
  const tickerRows = tickerLeaderboard.data
  const displaySignals = withLeaderboardSignalFallback(radar.radarSignals, tickerRows)
  const tokens = radarSignalsToTokens(displaySignals.data, tickerRows)
  const cards = radarSignalsToSignalCards(displaySignals.data, tickerRows)
  const scan = scanProofResourceToScanState(radar.scanProof, radar.apiUsage)
  const env = macroResourceToMarketEnv(radar.macroAltEnv, radar.derivatives, tokens)
  const matureSignalCount = radar.radarSignals.data.filter(
    (signal: RadarSignal) => signal.maturity === 'EVIDENCE_SIGNAL' || signal.maturity === 'TRADE_PLAN_READY',
  ).length
  const planReadyCount = radar.radarSignals.data.filter(
    (signal: RadarSignal) => signal.maturity === 'TRADE_PLAN_READY',
  ).length
  const reviewOnlyCount = displaySignals.data.filter((signal: RadarSignal) => signal.maturity === 'REVIEW_ONLY').length
  const candidateDisplayCount = Math.max(0, displaySignals.data.length - matureSignalCount - reviewOnlyCount)

  const sniper = cards
    .filter((c) => c.category === 'sniper')
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  const risks = cards
    .filter((c) => c.poolStatus === 'high_risk' || c.type === 'CRASH')
    .slice(0, 4)

  const onlineSources = radar.dataSources.data.filter((source: DataSourceState) => source.feed === 'live').length
  const totalSources = radar.dataSources.data.length
  const systemStatus = systemStatusTone(systemStatusFromContracts({
    // 这里只判断生产运行链路，不把“长期能力缺口/没有计划就绪样本”误算成系统故障。
    // 长期能力缺口由“系统能力总控”独立展示。
    statuses: [
      radar.scanProof.status,
      radar.deepScanQueue.status,
      radar.apiUsage.status,
      radar.dataSources.status,
      radar.scanStability.status,
    ],
    sourceFeeds: radar.dataSources.data.map((source: DataSourceState) => source.feed),
  }))
  const decision = dashboardDecision({
    status: systemStatus,
  })
  const dashboardLayers = buildUiInformationLayers({
    decision,
    reason: dashboardReason(decision),
    evidence: {
      OFI: radar.deepScanQueue.data.metrics.pendingCount,
      OI: candidateDisplayCount,
      Funding: radar.scanProof.status,
      Whale: planReadyCount,
      Volume: scan.scanned,
      Price: scan.coverage,
    },
    technical: [
      { label: 'scanProof.status', value: radar.scanProof.status },
      { label: 'scanProof.statusLabel', value: dataStatusLabel(radar.scanProof.status) },
      { label: 'deepScanQueue.status', value: radar.deepScanQueue.status },
      { label: 'dataSources.status', value: radar.dataSources.status },
      { label: 'source.online', value: `${onlineSources}/${totalSources || 0}` },
      { label: 'coverage.percent', value: scan.coverage },
      { label: 'deep.pending', value: radar.deepScanQueue.data.metrics.pendingCount },
      { label: 'evidence.observation.count', value: matureSignalCount },
      { label: 'plan.ready.count', value: planReadyCount },
    ],
  })
  const overview = [
    {
      label: '系统运行状态',
      value: systemStatus.label,
      icon: Activity,
      tone: systemStatus.tone,
      sub: `${onlineSources}/${totalSources || 0} 数据源在线`,
      pulseClass: systemStatus.pulse,
    },
    {
      label: '机会验证池',
      value: displaySignals.data.length,
      icon: Crosshair,
      tone: 'var(--neon)',
      sub: `证据观察 ${matureSignalCount} · 候选 ${candidateDisplayCount} · 复盘 ${reviewOnlyCount}`,
      count: true,
    },
    {
      label: '轻扫覆盖率',
      value: scan.coverage,
      suffix: '%',
      icon: Gauge,
      tone: 'var(--neon)',
      sub: `轻扫 ${scan.scanned.toLocaleString()} · 深扫 ${radar.scanProof.data.deepScanned.toLocaleString()}`,
      count: true,
    },
    {
      label: '大盘环境',
      value: env.regime,
      icon: TrendingUp,
      tone: env.regime === '顺风' ? 'var(--up)' : 'var(--down)',
      sub: `BTC ${env.btc.state} · 山寨 ${env.altStrength}/100`,
    },
  ]

  return (
    <div className="min-h-dvh bg-background">
      <SiteNav />
      <SessionBar tokens={tokens} />

      <main className="mx-auto max-w-[1560px] px-4 py-5 sm:px-6">
        {/* 标题 */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{PAGE_DISPLAY_NAMES.dashboard}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              全市场扫描运行状态、重点候选与风险一览
            </p>
          </div>
          <Link
            href="/signals"
            className="group flex items-center gap-1.5 border border-border px-4 py-2 text-sm font-semibold transition-colors hover:border-neon/40"
          >
            进入机会观察池
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* Dashboard 四层信息结构：先给决策，再给中文原因、结构化证据和折叠技术层。 */}
        <section className="mt-5 border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-3.5 w-1 bg-neon" />
            <h2 className="font-semibold">系统决策总览</h2>
            <span className="ml-auto text-xs text-muted-foreground">
              候选不等于计划，缓存不等于实时
            </span>
          </div>
          <UiInformationLayerBlock layers={dashboardLayers} />

          <details className="mt-3 border border-border bg-secondary/20 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
              展开运行指标
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {overview.map((s, i) => (
                <div
                  key={s.label}
                  className="hover-lift animate-float-up group border border-border bg-card p-4 hover:border-neon/40"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">{s.label}</span>
                    <span
                      className="grid size-7 place-items-center transition-transform group-hover:scale-110"
                      style={{
                        background: `color-mix(in oklch, ${s.tone} 14%, transparent)`,
                        color: s.tone,
                      }}
                    >
                      <s.icon className="size-3.5" />
                    </span>
                  </div>
                  <div className="mt-2 font-mono text-3xl font-bold tracking-tight">
                    {s.count ? (
                      <CountUp value={s.value as number} />
                    ) : (
                      s.value
                    )}
                    {s.suffix && (
                      <span className="ml-0.5 text-base text-muted-foreground">{s.suffix}</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span
                      className={`size-1.5 animate-pulse rounded-full ${s.pulseClass ?? ''}`}
                      style={{ background: s.tone }}
                    />
                    {s.sub}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </section>

        {/* 扫描证明 */}
        <div className="mt-5">
          <ScanProof
            scanProof={radar.scanProof}
            dataSources={radar.dataSources}
            apiUsage={radar.apiUsage}
          />
        </div>

        {/* 后端承载位：全市场扫描证明 · 深扫队列 · 能力总控 · 数据源状态 */}
        <div className="mt-5">
          <DashboardRadarControl contract={radar} />
        </div>

        {/* 重点候选 + 风险提醒 */}
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          {/* 当前计划就绪目标 */}
          <section className="border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <span className="h-3.5 w-1 bg-neon" />
              <Crosshair className="size-4 text-neon" />
              <h2 className="font-semibold">当前计划就绪目标</h2>
              <span className="ml-auto text-xs text-muted-foreground">只显示后端计划就绪样本</span>
            </div>
            <div className="divide-y divide-border">
              {sniper.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  当前没有满足证据、赔率、风控和失效条件要求的后端计划样本
                </div>
              )}
              {sniper.map((c, i) => (
                <Link
                  key={c.id}
                  href={`/token/${c.token.id}`}
                  className="animate-float-up group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-secondary/40"
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <TokenAvatar symbol={c.token.symbol} hue={c.token.hue} size={32} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">{c.token.symbol}</span>
                      <span
                        className="px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: 'color-mix(in oklch, var(--neon) 14%, transparent)',
                          color: 'var(--neon)',
                        }}
                      >
                        {POOL_META[c.poolStatus].label}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {c.desc}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-4 text-right">
                    <div>
                      <LivePrice
                        base={c.token.price}
                        className="block font-mono text-sm font-bold"
                      />
                      <LiveQuotePct
                        id={c.token.id}
                        className="block font-mono text-xs"
                      />
                    </div>
                    <div className="hidden sm:block">
                      <div className="font-mono text-lg font-bold text-neon">{c.score}</div>
                      <div className="text-[10px] text-muted-foreground">评分</div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* 重要风险提醒 */}
          <section className="border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <span className="h-3.5 w-1 bg-down" />
              <ShieldAlert className="size-4 text-down" />
              <h2 className="font-semibold">重要风险提醒</h2>
            </div>
            <div className="divide-y divide-border">
              {risks.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  当前无高危风险样本
                </div>
              )}
              {risks.map((c, i) => (
                <Link
                  key={c.id}
                  href={`/token/${c.token.id}`}
                  className="animate-float-up block px-5 py-3.5 transition-colors hover:bg-secondary/40"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="flex items-center gap-2">
                    <TokenAvatar symbol={c.token.symbol} hue={c.token.hue} size={22} />
                    <span className="font-mono text-sm font-bold">{c.token.symbol}</span>
                    <span className="ml-auto flex items-center gap-1 bg-down/15 px-1.5 py-0.5 text-[10px] font-semibold text-down">
                      <span className="size-1.5 animate-pulse rounded-full bg-down" />
                      风险 {c.riskLevel}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {c.type === 'CRASH'
                      ? '短时大额转入交易所，盘口买盘撤离，警惕闪崩风险。'
                      : '高位资金拥挤且赔率不足，追高风险显著，建议规避。'}
                  </p>
                </Link>
              ))}
            </div>
            <div className="border-t border-border px-5 py-2.5 text-center">
              <span className="text-[11px] text-muted-foreground">
                风险提示仅供参考，不构成投资建议
              </span>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
