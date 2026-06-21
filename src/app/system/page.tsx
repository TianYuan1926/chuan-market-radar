import { SiteNav } from '@/components/site-nav'
import { SessionBar } from '@/components/session-bar'
import { SystemStatus } from '@/components/system/system-status'
import {
  getLeaderboardContractForPage,
  getRadarContractForPage,
} from '@/lib/frontend-contract-server'
import {
  radarSignalsToTokens,
  withLeaderboardSignalFallback,
} from '@/lib/frontend-display-adapters'

export const dynamic = 'force-dynamic'

export default async function SystemPage() {
  const [radar, tickerLeaderboard] = await Promise.all([
    getRadarContractForPage(),
    getLeaderboardContractForPage('volume'),
  ])
  const displaySignals = withLeaderboardSignalFallback(
    radar.radarSignals,
    tickerLeaderboard.data,
  )
  const tokens = radarSignalsToTokens(displaySignals.data, tickerLeaderboard.data)

  return (
    <main className="min-h-screen">
      <SiteNav />
      <SessionBar tokens={tokens} />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">系统中心</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            告警流、服务健康监控与扫描/告警偏好设置
          </p>
        </header>
        <SystemStatus contract={radar} />

        <p className="mt-8 text-center text-xs text-muted-foreground">
          后端契约数据仅供市场研究与系统校准，不构成投资建议
        </p>
      </div>
    </main>
  )
}
