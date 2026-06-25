import { Trophy } from 'lucide-react'
import { SiteNav } from '@/components/site-nav'
import { MarketLeaderboards } from '@/components/leaderboard/market-leaderboards'
import { getAllLeaderboardContractsForPage } from '@/lib/frontend-contract-server'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const leaderboards = await getAllLeaderboardContractsForPage()

  return (
    <div className="min-h-dvh bg-background">
      <SiteNav />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-neon-soft text-neon">
            <Trophy className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">每日异动复盘榜</h1>
            <p className="text-sm text-muted-foreground">
              记录真实涨跌幅、成交额、强弱和衍生品排行，用于发现机会与复盘启动前征兆
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
          <div className="border border-border bg-card px-3 py-2">
            榜单只用于市场观察和复盘研究，不等于交易推荐
          </div>
          <div className="border border-border bg-card px-3 py-2">
            每个币会标记是否进入候选池、深扫、信号或拦截
          </div>
          <div className="border border-border bg-card px-3 py-2">
            涨跌幅异常会进入复盘样本，用来反查启动前共同特征
          </div>
        </div>

        {/* 后端承载位：7 类全市场榜单 + 候选池/深扫/信号/拦截标记 */}
        <div className="mt-6">
          <MarketLeaderboards initialLeaderboards={leaderboards} />
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          榜单数据仅供市场研究与系统校准，不构成投资建议
        </p>
      </main>
    </div>
  )
}
