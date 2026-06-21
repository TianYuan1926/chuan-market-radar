import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Radar, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { SiteNav } from '@/components/site-nav'
import { KlinePanel } from '@/components/kline-panel'
import { SignalArchive } from '@/components/signal-archive'
import { TokenDossier } from '@/components/token/token-dossier'
import { TokenAvatar } from '@/components/token-avatar'
import {
  getToken,
  getTokens,
  getSignals,
  fmtCap,
  fmtUsd,
} from '@/lib/mock-data'
import {
  getLeaderboardContractForPage,
  getRadarContractForPage,
  getTokenDossierContractForPage,
} from '@/lib/frontend-contract-server'
import {
  radarSignalsToFeedSignals,
  radarSignalsToTokens,
} from '@/lib/frontend-display-adapters'
import { cn } from '@/lib/utils'

export function generateStaticParams() {
  return getTokens().map((t) => ({ id: t.id }))
}

export default async function TokenPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const radar = await getRadarContractForPage()
  const tickerLeaderboard = await getLeaderboardContractForPage('volume')
  const tickerRows = tickerLeaderboard.data
  const lookupId = id.toLowerCase()
  const backendToken = radarSignalsToTokens(radar.radarSignals.data, tickerRows).find((item) => item.id === lookupId || item.symbol.toLowerCase() === lookupId)
  const token = backendToken ?? getToken(id)
  if (!token) notFound()
  const dossier = await getTokenDossierContractForPage(token.symbol, token.price)

  const seed = token.hue + token.symbol.length * 31
  const backendSignals = radarSignalsToFeedSignals(radar.radarSignals.data, token.symbol)
  const signals = backendSignals.length > 0 ? backendSignals : getSignals(token.symbol, token.price)
  const up = token.change24h >= 0

  const facts: [string, string][] = [
    ['市值', `$${fmtCap(token.marketCap)}`],
    ['24H 成交额', `$${fmtCap(token.volume24h)}`],
    ['总供应量', '100.00亿'],
    ['流通量', '22.00亿'],
    ['流通率', '22.00%'],
    ['发行时间', '2026/01/15'],
  ]

  return (
    <div className="min-h-dvh bg-background">
      <SiteNav />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Link
          href="/signals"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          返回信号池
        </Link>

        {/* 一张纸：所有信息汇于单一连续表面 */}
        <div
          className="sheet mt-4"
          style={{ animation: 'paper-in 0.6s cubic-bezier(0.22,1,0.36,1) both' }}
        >
          {/* 抬头：身份 + 价格 */}
          <div className="flex flex-wrap items-center gap-4 border-b border-border px-6 py-5">
            <TokenAvatar symbol={token.symbol} hue={token.hue} size={52} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-mono text-2xl font-bold">{token.symbol}</h1>
                {token.tags.includes('Alpha') && (
                  <span className="bg-[var(--chart-4)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--chart-4)]">
                    Alpha
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{token.name}</p>
            </div>
            <div className="ml-auto text-right">
              <div className="font-mono text-3xl font-bold leading-none">
                ${fmtUsd(token.price)}
              </div>
              <div
                className={cn(
                  'mt-1 font-mono text-sm font-semibold',
                  up ? 'text-up' : 'text-down',
                )}
              >
                {up ? '+' : ''}
                {token.change24h.toFixed(2)}% (24H)
              </div>
            </div>
          </div>

          {/* 关键指标：同一纸面上的分栏，发丝分隔 */}
          <div className="grid grid-cols-2 border-b border-border sm:grid-cols-3 lg:grid-cols-6">
            {facts.map(([k, v], i) => (
              <div
                key={k}
                className={cn(
                  'px-6 py-4',
                  'border-border',
                  i % 2 === 0 && 'border-r sm:border-r',
                  i % 3 !== 2 && 'sm:border-r',
                  i < facts.length - 1 && 'lg:border-r',
                  'border-b sm:border-b-0',
                )}
              >
                <div className="text-xs text-muted-foreground">{k}</div>
                <div className="mt-1 font-mono text-sm font-semibold">{v}</div>
              </div>
            ))}
          </div>

          {/* 图表区 + 异动追踪：同纸两栏，中缝发丝线 */}
          <div className="grid lg:grid-cols-[1fr_360px]">
            {/* 左：K 线 + 资金 */}
            <div className="border-b border-border lg:border-b-0 lg:border-r">
              {/* 区块小标题，与右栏对齐统一节奏 */}
              <div className="flex items-center gap-2 border-b border-border px-6 py-3">
                <span className="h-3.5 w-1 bg-neon" />
                <span className="font-semibold">价格走势 · K 线</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {token.symbol}/USDT
                </span>
              </div>
              <div className="px-3 py-2">
                <KlinePanel seed={seed} startPrice={token.price * 0.45} bare />
              </div>

              {/* 主力资金净流入 */}
              <div className="border-t border-border px-6 py-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <span className="h-3.5 w-1 bg-neon" />
                  主力资金 · 近 7 日净流入
                </h3>
                <div className="mt-4 flex h-28 items-end gap-1.5">
                  {Array.from({ length: 28 }).map((_, i) => {
                    const r = ((seed * (i + 3)) % 100) / 100
                    const inflow = r > 0.4
                    const h = 12 + r * 100
                    return (
                      <div
                        key={i}
                        className="flex-1 transition-all hover:opacity-70"
                        style={{
                          height: `${h}%`,
                          background: inflow ? 'var(--up)' : 'var(--down)',
                          opacity: 0.45 + r * 0.55,
                        }}
                        title={`${inflow ? '净流入' : '净流出'} ${(r * 100).toFixed(0)}万`}
                      />
                    )
                  })}
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="size-2 bg-up" />净流入
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 bg-down" />净流出
                  </span>
                </div>
              </div>
            </div>

            {/* 右：异动追踪 */}
            <aside className="flex flex-col">
              <div className="flex items-center gap-2 border-b border-border px-6 py-3">
                <span className="h-3.5 w-1 bg-neon" />
                <div className="grid size-6 place-items-center bg-neon-soft text-neon">
                  <Radar className="size-3.5 animate-spin-slow" />
                </div>
                <span className="font-semibold">异动追踪</span>
                <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-70" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-up" />
                  </span>
                  实时
                </span>
              </div>
              <div className="max-h-[620px] divide-y divide-border overflow-y-auto">
                {signals.map((s, i) => {
                  const Icon =
                    s.type === 'bull'
                      ? TrendingUp
                      : s.type === 'bear'
                        ? TrendingDown
                        : Minus
                  const tone =
                    s.type === 'bull'
                      ? 'text-up'
                      : s.type === 'bear'
                        ? 'text-down'
                        : 'text-muted-foreground'
                  return (
                    <div
                      key={s.id}
                      className="animate-float-up group relative px-6 py-3.5 transition-colors hover:bg-secondary/30"
                      style={{ animationDelay: `${Math.min(i, 10) * 70}ms` }}
                    >
                      {/* 左侧时间脉冲轴 */}
                      <span className="absolute left-[10px] top-5 size-1.5 rounded-full bg-neon shadow-[0_0_8px_var(--neon)] transition-transform group-hover:scale-150" />
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{s.time}</span>
                        <span
                          className={cn(
                            'ml-auto flex items-center gap-1',
                            tone,
                          )}
                        >
                          <Icon className="size-3.5" />
                          异动看涨监控
                        </span>
                      </div>
                      <h4 className="mt-2 text-sm font-semibold leading-snug transition-colors group-hover:text-neon">
                        {s.title}
                      </h4>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {s.body}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {s.tags.map((t) => (
                          <span
                            key={t}
                            className="bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </aside>
          </div>
        </div>

        {/* 信号档案：证据链 / 反证 / 关键位 / 失效条件 / 交易计划 */}
        <SignalArchive token={token} dossier={dossier} />

        {/* 后端承载位：多周期结构 / 证据链 / 反证链 / Risk Gate / 交易计划 / AI 复核 */}
        <TokenDossier symbol={token.symbol} basePrice={token.price} dossier={dossier} />

        <p className="mt-8 text-center text-xs text-muted-foreground">
          数据仅供研究复盘与系统校准，不构成投资建议
        </p>
      </main>
    </div>
  )
}
