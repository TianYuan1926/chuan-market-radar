import { Trophy } from 'lucide-react'
import { SiteNav } from '@/components/site-nav'
import { PriceTicker } from '@/components/price-ticker'
import { LeaderboardTable } from '@/components/leaderboard-table'
import { MarketLeaderboards } from '@/components/leaderboard/market-leaderboards'
import { getAllLeaderboardContractsForPage } from '@/lib/frontend-contract-server'
import {
  leaderboardRowsToTokens,
  mergeTokensBySymbol,
} from '@/lib/frontend-display-adapters'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const leaderboards = await getAllLeaderboardContractsForPage()
  const gainers = leaderboardRowsToTokens(leaderboards.gainers?.data ?? [], 'gainers')
  const losers = leaderboardRowsToTokens(leaderboards.losers?.data ?? [], 'losers')
  const volume = leaderboardRowsToTokens(leaderboards.volume?.data ?? [], 'volume')
  const tickerTokens = mergeTokensBySymbol(volume, gainers, losers)
  const tableTokens = mergeTokensBySymbol(gainers, losers, volume)

  return (
    <div className="min-h-dvh bg-background">
      <SiteNav />
      <PriceTicker tokens={tickerTokens} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-neon-soft text-neon">
            <Trophy className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">榜单</h1>
            <p className="text-sm text-muted-foreground">
              全网代币涨跌幅排行，洞察资金动向
            </p>
          </div>
        </div>

        {/* 后端承载位：7 类全市场榜单 + 候选池/深扫/信号/拦截标记 */}
        <div className="mt-6">
          <MarketLeaderboards initialLeaderboards={leaderboards} />
        </div>

        <div className="mt-6">
          <LeaderboardTable tokens={tableTokens} />
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          榜单数据仅供市场研究与系统校准，不构成投资建议
        </p>
      </main>
    </div>
  )
}
