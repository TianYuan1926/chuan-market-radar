import { SiteNav } from '@/components/site-nav'
import { AnomalyBoard } from '@/components/anomaly-board'
import { SniperBoard } from '@/components/sniper-board'
import { SignalMaturityPool } from '@/components/signals/signal-maturity-pool'
import { SessionBar } from '@/components/session-bar'
import {
  radarSignalsToSignalCards,
  radarSignalsToSniperTargets,
  radarSignalsToTokens,
  withLeaderboardSignalFallback,
} from '@/lib/frontend-display-adapters'
import {
  getLeaderboardContractForPage,
  getRadarContractForPage,
} from '@/lib/frontend-contract-server'
import { PAGE_DISPLAY_NAMES } from '@/lib/ui-schema/display-names'
import type { DataStatus } from '@/lib/data-status'

export const dynamic = 'force-dynamic'

const SIGNAL_STATUS_LABEL: Record<DataStatus, string> = {
  loading: '加载中',
  live: '实时',
  cached: '缓存',
  stale: '偏旧',
  partial: '部分可用',
  empty: '暂无',
  error: '异常',
  failed: '失败',
}

const SIGNAL_STATUS_CLASS: Record<DataStatus, string> = {
  loading: 'bg-secondary text-muted-foreground',
  live: 'bg-neon-soft text-neon',
  cached: 'bg-neon/10 text-neon',
  stale: 'bg-[oklch(0.8_0.15_75)]/15 text-[oklch(0.82_0.15_75)]',
  partial: 'bg-[oklch(0.8_0.15_75)]/15 text-[oklch(0.82_0.15_75)]',
  empty: 'bg-secondary text-muted-foreground',
  error: 'bg-down/15 text-down',
  failed: 'bg-down/15 text-down',
}

const SIGNAL_DOT_CLASS: Record<DataStatus, string> = {
  loading: 'bg-muted-foreground',
  live: 'bg-neon',
  cached: 'bg-neon',
  stale: 'bg-[oklch(0.82_0.15_75)]',
  partial: 'bg-[oklch(0.82_0.15_75)]',
  empty: 'bg-muted-foreground',
  error: 'bg-down',
  failed: 'bg-down',
}

export default async function SignalsPage() {
  const [radar, tickerLeaderboard] = await Promise.all([
    getRadarContractForPage(),
    getLeaderboardContractForPage('volume'),
  ])
  const tickerRows = tickerLeaderboard.data
  const displaySignals = withLeaderboardSignalFallback(radar.radarSignals, tickerRows)
  const signalStatus = displaySignals.status
  const tokens = radarSignalsToTokens(displaySignals.data, tickerRows)
  const cards = radarSignalsToSignalCards(displaySignals.data, tickerRows)
  const sniperTargets = radarSignalsToSniperTargets(radar.radarSignals.data, tickerRows)

  return (
    <div className="min-h-dvh bg-background">
      <SiteNav />
      <SessionBar tokens={tokens} />

      <main className="mx-auto max-w-[1560px] px-4 py-5 sm:px-6">
        <div className="space-y-5">
          <section className="border border-border bg-card px-5 py-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight">{PAGE_DISPLAY_NAMES.signals}</h1>
              <span className={`flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold tracking-wide ${SIGNAL_STATUS_CLASS[signalStatus]}`}>
                <span className={`size-1.5 rounded-full ${signalStatus === 'live' ? 'animate-pulse' : ''} ${SIGNAL_DOT_CLASS[signalStatus]}`} />
                {SIGNAL_STATUS_LABEL[signalStatus]}
              </span>
              <span className="text-[13px] text-muted-foreground">
                轻扫只负责发现异常；只有后端完整计划生成后才进入计划就绪区
              </span>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
              <div className="border border-border bg-secondary/30 px-3 py-2">
                轻扫标记：后台调度，不作为执行依据
              </div>
              <div className="border border-border bg-secondary/30 px-3 py-2">
                深度确认：验证中，只能观察
              </div>
              <div className="border border-border bg-secondary/30 px-3 py-2">
                证据观察：有结构和数据支撑，但仍不能直接执行
              </div>
              <div className="border border-border bg-secondary/30 px-3 py-2">
                后端计划：证据、结构、结构盈亏比、风控和失效条件齐全，仍需人工复核
              </div>
            </div>
          </section>

          {/* 计划就绪区：只展示后端完整计划样本（与复盘进化引擎共用数据源） */}
          <SniperBoard targets={sniperTargets} />

          {/* 验证成熟度池：按成熟度分层，支持搜索/筛选/排序/滚动（后端承载位） */}
          <SignalMaturityPool signals={displaySignals} />

          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-bold tracking-tight">异动候选明细</h2>
              <span className="text-[13px] text-muted-foreground">
                点击任意一行展开币种详情、后端证据与计划门禁
              </span>
            </div>
            <AnomalyBoard cards={cards} />
          </section>
        </div>
      </main>

    </div>
  )
}
