import { SiteNav } from '@/components/site-nav'
import { AnomalyBoard } from '@/components/anomaly-board'
import { SniperBoard } from '@/components/sniper-board'
import { SignalMaturityPool } from '@/components/signals/signal-maturity-pool'
import { LiveFeed } from '@/components/live-feed'
import { MarketHeatmap } from '@/components/market-heatmap'
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
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          {/* 候选信号池表格 */}
          <div className="min-w-0">
            {/* 狙击榜：通过最终筛选的精选目标（与复盘进化引擎共用数据源） */}
            <div className="mb-5">
              <SniperBoard targets={sniperTargets} />
            </div>

            {/* 信号成熟度池：按成熟度分层，支持搜索/筛选/排序/滚动（后端承载位） */}
            <div className="mb-5">
              <SignalMaturityPool signals={displaySignals} />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight">候选信号池</h1>
              <span className={`flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold tracking-wide ${SIGNAL_STATUS_CLASS[signalStatus]}`}>
                <span className={`size-1.5 rounded-full ${signalStatus === 'live' ? 'animate-pulse' : ''} ${SIGNAL_DOT_CLASS[signalStatus]}`} />
                {SIGNAL_STATUS_LABEL[signalStatus]}
              </span>
              <span className="text-[13px] text-muted-foreground">
                点击任意一行可展开币种详情、后端证据与计划状态
              </span>
            </div>
            <div className="mt-4">
              <AnomalyBoard cards={cards} />
            </div>
          </div>

          {/* 右侧辅助面板 */}
          <aside className="space-y-5">
            <LiveFeed cards={cards} />
            <MarketHeatmap tokens={tokens} />
          </aside>
        </div>
      </main>

    </div>
  )
}
