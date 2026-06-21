'use client'

import { useMemo } from 'react'
import { Activity, Layers3, SearchX, Sparkles } from 'lucide-react'
import {
  getSignalLifecycles,
  getStrategyArchetypes,
  getMissedDetections,
  getEvolutionSuggestions,
  type ReviewContract,
} from '@/lib/radar-contract'
import { Panel } from '@/components/panel'
import { FreshnessTag, StatusBadge, ResourceBoundary } from '@/components/data-state'
import { TokenAvatar } from '@/components/token-avatar'
import { cn } from '@/lib/utils'

export function ReviewEvolution({ contract }: { contract?: ReviewContract } = {}) {
  const fallbackLifecycles = useMemo(() => getSignalLifecycles(), [])
  const fallbackArchetypes = useMemo(() => getStrategyArchetypes(), [])
  const fallbackMissed = useMemo(() => getMissedDetections(), [])
  const fallbackSuggestions = useMemo(() => getEvolutionSuggestions(), [])
  const lifecycles = contract?.signalLifecycles ?? fallbackLifecycles
  const archetypes = contract?.strategyArchetypes ?? fallbackArchetypes
  const missed = contract?.missedDetections ?? fallbackMissed
  const suggestions = contract?.evolutionSuggestions ?? fallbackSuggestions

  return (
    <div className="mt-5 space-y-5">
      {/* 信号生命周期 + MFE/MAE */}
      <Panel title="信号生命周期 · MFE / MAE" icon={Activity}>
        <div className="px-5 py-4">
          <div className="mb-3 flex items-center justify-end gap-2">
            <StatusBadge status={lifecycles.status} />
            <FreshnessTag ageSec={lifecycles.ageSec} source={lifecycles.source} />
          </div>
          <ResourceBoundary resource={lifecycles} isEmpty={(d) => d.length === 0}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">标的</th>
                  <th className="py-2 font-medium">出现</th>
                  <th className="py-2 text-center font-medium">结果</th>
                  <th className="py-2 font-medium">MFE / MAE</th>
                </tr>
              </thead>
              <tbody>
                {(lifecycles.data ?? []).map((lc) => {
                  const outcome = lc.hitTpFirst
                    ? { label: '先到目标', tone: 'text-up' }
                    : lc.hitSlFirst
                      ? { label: '先到止损', tone: 'text-down' }
                      : { label: '超时未达', tone: 'text-muted-foreground' }
                  const span = lc.mfe + Math.abs(lc.mae) || 1
                  return (
                    <tr key={lc.id} className="border-b border-border/60">
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <TokenAvatar symbol={lc.symbol} hue={lc.hue} size={22} />
                          <span className="font-mono text-xs font-semibold">
                            {lc.symbol}
                          </span>
                          <span
                            className={cn(
                              'font-mono text-[11px]',
                              lc.side === '多' ? 'text-up' : 'text-down',
                            )}
                          >
                            {lc.side}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 font-mono text-xs text-muted-foreground">
                        {lc.appearedAt}
                      </td>
                      <td className="py-2.5 text-center">
                        <span className={cn('text-xs font-semibold', outcome.tone)}>
                          {outcome.label}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-2 flex-1 overflow-hidden bg-secondary">
                            <span
                              className="bar-fill bg-up/70"
                              style={{ width: `${(lc.mfe / span) * 100}%` }}
                            />
                            <span
                              className="bar-fill bg-down/70"
                              style={{ width: `${(Math.abs(lc.mae) / span) * 100}%` }}
                            />
                          </div>
                          <span className="min-w-[88px] text-right font-mono text-[11px]">
                            <span className="text-up">+{lc.mfe}%</span>
                            {' / '}
                            <span className="text-down">{lc.mae}%</span>
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </ResourceBoundary>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 策略分型 */}
        <Panel title="策略分型胜率" icon={Layers3} right={<StatusBadge status={archetypes.status} />}>
          <div className="space-y-3 px-5 py-4">
            <ResourceBoundary resource={archetypes} isEmpty={(d) => d.length === 0}>
            {(archetypes.data ?? []).map((a, i) => (
              <div
                key={a.key}
                style={{ ['--i' as string]: i }}
                className="tile-in border border-border bg-secondary/20 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{a.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {a.samples} 样本
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="bar-track h-2 flex-1 overflow-hidden bg-secondary">
                    <span
                      className="bar-fill block h-full bg-neon"
                      style={{ width: `${a.winRate}%` }}
                    />
                  </div>
                  <span className="min-w-[96px] text-right font-mono text-[11px]">
                    胜率 {a.winRate}% · RR {a.avgRR}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  常见失败：{a.commonFailure}
                </p>
              </div>
            ))}
            </ResourceBoundary>
          </div>
        </Panel>

        {/* 漏判复查 */}
        <Panel title="漏判复查" icon={SearchX}>
          <div className="px-5 py-4">
            <div className="mb-3 flex items-center justify-end gap-2">
              <StatusBadge status={missed.status} />
              <FreshnessTag ageSec={missed.ageSec} source={missed.source} />
            </div>
            <ResourceBoundary resource={missed} isEmpty={(d) => d.length === 0} emptyText="暂无漏判记录">
            <div className="space-y-3">
              {(missed.data ?? []).map((m, i) => (
                <div
                  key={i}
                  style={{ ['--i' as string]: i }}
                  className="tile-in border border-border bg-secondary/20 p-3"
                >
                  <div className="flex items-center gap-2">
                    <TokenAvatar symbol={m.symbol} hue={m.hue} size={22} />
                    <span className="font-mono text-xs font-semibold">{m.symbol}</span>
                    <span
                      className={cn(
                        'font-mono text-xs font-semibold',
                        m.side === '涨' ? 'text-up' : 'text-down',
                      )}
                    >
                      {m.side === '涨' ? '+' : ''}
                      {m.move}%
                    </span>
                    <span className="ml-auto bg-down/15 px-1.5 py-0.5 text-[10px] font-semibold text-down">
                      {m.reason}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {m.detail}
                  </p>
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-neon">
                    <Sparkles className="mt-0.5 size-3 shrink-0" />
                    改进：{m.improvement}
                  </p>
                </div>
              ))}
            </div>
            </ResourceBoundary>
          </div>
        </Panel>
      </div>

      {/* 进化建议 */}
      <Panel title="进化建议" icon={Sparkles}>
        <div className="px-5 py-4">
          <div className="mb-3 flex items-center justify-end gap-2">
            <StatusBadge status={suggestions.status} />
            <FreshnessTag ageSec={suggestions.ageSec} source={suggestions.source} />
          </div>
          <ResourceBoundary resource={suggestions} isEmpty={(d) => d.length === 0} emptyText="暂无进化建议">
          <div className="grid gap-3 sm:grid-cols-3">
            {(suggestions.data ?? []).map((s, i) => {
              const tone =
                s.impact === '高'
                  ? 'text-up'
                  : s.impact === '中'
                    ? 'text-neon'
                    : 'text-muted-foreground'
              return (
                <div
                  key={i}
                  style={{ ['--i' as string]: i }}
                  className="data-tile tile-in border border-border bg-secondary/20 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{s.title}</span>
                    <span className={cn('font-mono text-[11px] font-semibold', tone)}>
                      {s.impact}影响
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {s.rationale}
                  </p>
                  <div className="mt-2.5">
                    <span
                      className={cn(
                        'inline-block px-1.5 py-0.5 text-[10px] font-semibold',
                        s.adopted
                          ? 'bg-up/15 text-up'
                          : 'bg-secondary text-muted-foreground',
                      )}
                    >
                      {s.adopted ? '已采纳' : '待评估'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          </ResourceBoundary>
        </div>
      </Panel>
    </div>
  )
}
