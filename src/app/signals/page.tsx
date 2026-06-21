import { SiteNav } from '@/components/site-nav'
import { AnomalyBoard } from '@/components/anomaly-board'
import { SniperBoard } from '@/components/sniper-board'
import { SignalMaturityPool } from '@/components/signals/signal-maturity-pool'
import { LiveFeed } from '@/components/live-feed'
import { MarketHeatmap } from '@/components/market-heatmap'
import { SessionBar } from '@/components/session-bar'
import { JournalLauncher } from '@/components/journal-launcher'
import {
  radarSignalsToSignalCards,
  radarSignalsToSniperTargets,
  radarSignalsToTokens,
} from '@/lib/frontend-display-adapters'
import {
  getLeaderboardContractForPage,
  getRadarContractForPage,
} from '@/lib/frontend-contract-server'

export const dynamic = 'force-dynamic'

export default async function SignalsPage() {
  const [radar, tickerLeaderboard] = await Promise.all([
    getRadarContractForPage(),
    getLeaderboardContractForPage('volume'),
  ])
  const tickerRows = tickerLeaderboard.data
  const tokens = radarSignalsToTokens(radar.radarSignals.data, tickerRows)
  const cards = radarSignalsToSignalCards(radar.radarSignals.data, tickerRows)
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
              <SignalMaturityPool signals={radar.radarSignals} />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight">候选信号池</h1>
              <span className="flex items-center gap-1.5 bg-neon-soft px-2 py-0.5 text-[10px] font-bold tracking-wide text-neon">
                <span className="size-1.5 animate-pulse rounded-full bg-neon" />
                LIVE
              </span>
              <span className="text-[13px] text-muted-foreground">
                点击任意一行可展开币种详情、分析逻辑与入场策略
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

      {/* 交易日记浮动抽屉：默认收起为右侧标签，不遮挡信号信息 */}
      <JournalLauncher />
    </div>
  )
}
