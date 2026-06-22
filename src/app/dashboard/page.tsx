import Link from 'next/link'
import { SiteNav } from '@/components/site-nav'
import { SessionBar } from '@/components/session-bar'
import { ScanProof } from '@/components/scan-proof'
import { DashboardRadarControl } from '@/components/dashboard/radar-control'
import { TokenAvatar } from '@/components/token-avatar'
import { CountUp } from '@/components/count-up'
import { LivePrice, LiveStat, LiveQuotePct } from '@/components/live-value'
import { POOL_META } from '@/lib/mock-data'
import {
  macroResourceToMarketEnv,
  radarSignalsToSignalCards,
  radarSignalsToTokens,
  scanProofResourceToScanState,
  withLeaderboardSignalFallback,
} from '@/lib/frontend-display-adapters'
import {
  getLeaderboardContractForPage,
  getRadarContractForPage,
} from '@/lib/frontend-contract-server'
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

  const sniper = cards
    .filter((c) => c.category === 'sniper')
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  const risks = cards
    .filter((c) => c.poolStatus === 'high_risk' || c.type === 'CRASH')
    .slice(0, 4)

  const bull = tokens.filter((t) => t.trend === 'bull').length
  const onlineSources = radar.dataSources.data.filter((source) => source.feed === 'live').length
  const totalSources = radar.dataSources.data.length
  const overview = [
    {
      label: '系统运行状态',
      value: '正常',
      icon: Activity,
      tone: 'var(--up)',
      sub: `${onlineSources}/${totalSources || 0} 数据源在线`,
    },
    {
      label: '活跃候选信号',
      value: cards.length,
      icon: Crosshair,
      tone: 'var(--neon)',
      sub: `多头 ${bull} · 实时更新`,
      count: true,
    },
    {
      label: '轻扫覆盖率',
      value: scan.coverage,
      suffix: '%',
      icon: Gauge,
      tone: 'var(--neon)',
      sub: `轻扫 ${scan.scanned.toLocaleString()} · 深扫 ${radar.scanProof.data.deepScanned.toLocaleString()}`,
      live: true,
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
            <h1 className="text-2xl font-extrabold tracking-tight">雷达总控</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              全市场扫描运行状态、重点候选与风险一览
            </p>
          </div>
          <Link
            href="/signals"
            className="group flex items-center gap-1.5 border border-border px-4 py-2 text-sm font-semibold transition-colors hover:border-neon/40"
          >
            进入候选信号池
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* 系统运行状态概览 */}
        <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
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
                {s.live ? (
                  <LiveStat
                    base={s.value as number}
                    decimals={1}
                    volatility={0.012}
                    min={0}
                    max={100}
                    flash={false}
                  />
                ) : s.count ? (
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
                  className="size-1.5 animate-pulse rounded-full"
                  style={{ background: s.tone }}
                />
                {s.sub}
              </div>
            </div>
          ))}
        </div>

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
          {/* 当前重点候选 */}
          <section className="border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <span className="h-3.5 w-1 bg-neon" />
              <Crosshair className="size-4 text-neon" />
              <h2 className="font-semibold">当前重点候选</h2>
              <span className="ml-auto text-xs text-muted-foreground">狙击榜 Top 5</span>
            </div>
            <div className="divide-y divide-border">
              {sniper.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  当前没有满足证据、赔率和风控要求的狙击目标
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
                  当前无高危信号
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
