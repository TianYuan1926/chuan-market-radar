import { SiteNav } from '@/components/site-nav'
import { SessionBar } from '@/components/session-bar'
import { SystemStatus } from '@/components/system/system-status'
import { getRadarContractForPage } from '@/lib/frontend-contract-server'
import { radarSignalsToTokens } from '@/lib/frontend-display-adapters'

export default async function SystemPage() {
  const radar = await getRadarContractForPage()
  const tokens = radarSignalsToTokens(radar.radarSignals.data)

  return (
    <main className="min-h-screen">
      <SiteNav />
      <SessionBar tokens={tokens} />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">系统中心</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            后端契约运行状态：服务健康、数据管线与 CoinGlass 调用预算
          </p>
        </header>

        {/* 后端承载位：服务健康 / 数据管线 / CoinGlass API 用量 */}
        <SystemStatus contract={radar} />

        <p className="mt-8 text-center text-xs text-muted-foreground">
          系统状态仅用于运行监控与风险提示，不构成投资建议
        </p>
      </div>
    </main>
  )
}
