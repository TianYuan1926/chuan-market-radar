'use client'

import { Panel } from '@/components/panel'
import { StatusBadge, FreshnessTag, ResourceBoundary } from '@/components/data-state'
import { getMacroAltEnv, getDerivatives, getApiUsage, type RadarContract } from '@/lib/radar-contract'
import { fmtCap } from '@/lib/mock-data'
import { Globe2, Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react'

const STATE_TONE: Record<string, string> = {
  强势: 'var(--up)',
  震荡: 'var(--sig-pump)',
  弱势: 'var(--down)',
}
const SUGGEST_TONE: Record<string, string> = {
  更适合做多: 'var(--up)',
  更适合做空: 'var(--down)',
  建议观望: 'var(--sig-pump)',
}

export function MarketMacroDerivatives({ contract }: { contract?: RadarContract } = {}) {
  const macroRes = contract?.macroAltEnv ?? getMacroAltEnv()
  const derivRes = contract?.derivatives ?? getDerivatives()
  const apiRes = contract?.apiUsage ?? getApiUsage()
  const m = macroRes.data
  const d = derivRes.data
  const a = apiRes.data
  const usedPct = Math.round((a.usedToday / (a.usedToday + a.remainingToday)) * 100)

  const TrendIcon =
    m.btcDominanceTrend === '上升' ? TrendingUp : m.btcDominanceTrend === '下降' ? TrendingDown : Minus

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* 宏观山寨环境 */}
      <Panel
        title="宏观山寨环境"
        icon={Globe2}
        right={<StatusBadge status={macroRes.status} />}
      >
        <ResourceBoundary resource={macroRes}>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
          <Cell index={0} label="BTC 状态" value={m.btcState} tone={STATE_TONE[m.btcState]} />
          <Cell index={1} label="ETH 状态" value={m.ethState} tone={STATE_TONE[m.ethState]} />
          <Cell
            index={2}
            label="BTC.D"
            value={`${m.btcDominance}%`}
            sub={
              <span className="flex items-center gap-1">
                <TrendIcon className="size-3" />
                {m.btcDominanceTrend}
              </span>
            }
          />
          <Cell index={3} label="TOTAL2" value={`$${fmtCap(m.total2)}`} />
          <Cell index={4} label="TOTAL3" value={`$${fmtCap(m.total3)}`} />
          <Cell
            index={5}
            label="山寨强弱"
            value={`${m.altStrength}/100`}
            tone={m.altStrength >= 50 ? 'var(--up)' : 'var(--down)'}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3.5">
          <div className="text-sm text-muted-foreground">
            风险模式 <span className="ml-1 font-semibold text-foreground">{m.riskMode}</span>
          </div>
          <span
            className="px-2.5 py-1 text-sm font-bold"
            style={{
              color: SUGGEST_TONE[m.suggestion],
              background: `color-mix(in oklch, ${SUGGEST_TONE[m.suggestion]} 14%, transparent)`,
            }}
          >
            当前{m.suggestion}
          </span>
        </div>
        </ResourceBoundary>
        <div className="border-t border-border px-5 py-2">
          <FreshnessTag {...macroRes} />
        </div>
      </Panel>

      {/* CoinGlass 衍生品状态 */}
      <Panel
        title="CoinGlass 衍生品状态"
        icon={Activity}
        right={<StatusBadge status={derivRes.status} />}
      >
        <ResourceBoundary resource={derivRes}>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
          <Cell
            index={0}
            label="OI 变化"
            value={`${d.oiChange > 0 ? '+' : ''}${d.oiChange}%`}
            tone={d.oiChange >= 0 ? 'var(--up)' : 'var(--down)'}
          />
          <Cell
            index={1}
            label="资金费率"
            value={`${d.funding > 0 ? '+' : ''}${d.funding}%`}
            tone={d.funding >= 0 ? 'var(--up)' : 'var(--down)'}
          />
          <Cell index={2} label="多空比" value={d.longShortRatio.toFixed(2)} />
          <Cell index={3} label="主动买卖比" value={d.takerBuySell.toFixed(2)} />
          <Cell index={4} label="交易所覆盖" value={`${d.exchangeCoverage}/${d.totalExchanges}`} />
          <Cell index={5} label="数据更新" value={d.lastUpdate} />
        </div>
        </ResourceBoundary>

        {/* API 调用状态 */}
        <ResourceBoundary resource={apiRes}>
        <div className="border-t border-border px-5 py-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">今日调用量</span>
            <span className="font-mono">
              {a.usedToday.toLocaleString()} / {(a.usedToday + a.remainingToday).toLocaleString()}（剩余 {a.remainingToday.toLocaleString()}）
            </span>
          </div>
          <div className="bar-track mt-1.5 h-2 overflow-hidden bg-secondary">
            <div
              className="bar-fill h-full"
              style={{ width: `${usedPct}%`, background: usedPct > 85 ? 'var(--down)' : 'var(--neon)' }}
            />
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              每分钟上限 <span className="font-mono text-foreground">{a.perMinuteLimit}</span>
            </span>
            <span className="text-muted-foreground">
              pacing 间隔 <span className="font-mono text-foreground">{a.pacingMs}ms</span>
            </span>
            <span
              className={`flex items-center gap-1 font-semibold ${a.throttled ? 'text-down' : 'text-up'}`}
            >
              <span className={`size-1.5 rounded-full ${a.throttled ? 'bg-down' : 'bg-up animate-pulse'}`} />
              {a.throttled ? '已触发限速保护' : '未限速'}
            </span>
          </div>
        </div>
        </ResourceBoundary>
      </Panel>
    </div>
  )
}

function Cell({
  label,
  value,
  sub,
  tone,
  index = 0,
}: {
  label: string
  value: string
  sub?: React.ReactNode
  tone?: string
  index?: number
}) {
  return (
    <div className="tile-in bg-card px-4 py-3.5" style={{ ['--i' as string]: index }}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className="mt-1 font-mono text-lg font-bold"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}
