'use client'

import { Activity, Bot, Layers3, SearchX, ShieldCheck, Sparkles } from 'lucide-react'
import {
  type ReviewContract,
} from '@/lib/radar-contract'
import { resource } from '@/lib/data-status'
import { Panel } from '@/components/panel'
import { FreshnessTag, StatusBadge, ResourceBoundary } from '@/components/data-state'
import { TokenAvatar } from '@/components/token-avatar'
import { cn } from '@/lib/utils'

export function ReviewEvolution({ contract }: { contract?: ReviewContract } = {}) {
  const lifecycles = contract?.signalLifecycles ?? resource([], 'empty', { source: 'review-contract', reason: '未传入后端复盘契约' })
  const archetypes = contract?.strategyArchetypes ?? resource([], 'empty', { source: 'review-contract', reason: '未传入后端策略分型契约' })
  const missed = contract?.missedDetections ?? resource([], 'empty', { source: 'review-contract', reason: '未传入后端漏判复查契约' })
  const suggestions = contract?.evolutionSuggestions ?? resource([], 'empty', { source: 'review-contract', reason: '未传入后端进化建议契约' })
  const discoveryReview = contract?.discoveryReview ?? resource({
    calibration: {
      earlyOutcomeLink: 'collecting' as const,
      lateSignalPenalty: 'collecting' as const,
      mfeMaeLink: 'collecting' as const,
      notes: [],
      status: 'empty' as const,
      summary: '未传入后端提前发现校准契约',
    },
    cvdProxyCandidateCount: 0,
    earlyOpportunityCount: 0,
    guardrails: ['未传入后端提前发现复盘契约'],
    lateMoveCount: 0,
    missedDetectionCount: 0,
    reviewFocus: [],
    summary: '未传入后端提前发现复盘契约',
    totalLightCandidates: 0,
  }, 'empty', { source: 'light-scan-review', reason: '未传入后端提前发现复盘契约' })
  const reviewStats = contract?.reviewStats ?? resource({
    closedSamples: 0,
    evidenceSamples: 0,
    maeAvg: 0,
    mfeAvg: 0,
    pendingSamples: 0,
    sampleStatus: 'empty' as const,
    summary: '未传入后端复盘统计契约',
    totalSamples: 0,
    winRate: null,
  }, 'empty', { source: 'outcome-review', reason: '未传入后端复盘统计契约' })
  const aiReviewStats = contract?.aiReviewStats ?? resource({
    disabled: 0,
    fallback: 0,
    reviewed: 0,
    total: 0,
    unboundFallbackProtected: true,
  }, 'empty', { source: 'ai-reviewer', reason: '未传入后端 AI 复核契约' })

  const sampleStatusLabel: Record<typeof reviewStats.data.sampleStatus, string> = {
    collecting: '样本收集中',
    empty: '暂无样本',
    statistically_thin: '样本偏薄',
    usable: '可统计',
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="复盘样本门禁" icon={ShieldCheck} right={<StatusBadge status={reviewStats.status} />}>
          <div className="space-y-4 px-5 py-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['总样本', reviewStats.data.totalSamples],
                ['已关闭', reviewStats.data.closedSamples],
                ['证据级', reviewStats.data.evidenceSamples],
                ['待验证', reviewStats.data.pendingSamples],
              ].map(([label, value]) => (
                <div key={label} className="border border-border bg-secondary/20 p-3">
                  <div className="text-[11px] text-muted-foreground">{label}</div>
                  <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="border border-border bg-secondary/20 p-3">
                <div className="text-[11px] text-muted-foreground">统计状态</div>
                <div className="mt-1 text-sm font-semibold">
                  {sampleStatusLabel[reviewStats.data.sampleStatus]}
                </div>
              </div>
              <div className="border border-border bg-secondary/20 p-3">
                <div className="text-[11px] text-muted-foreground">胜率</div>
                <div className="mt-1 font-mono text-sm font-semibold">
                  {reviewStats.data.winRate === null ? '样本不足' : `${reviewStats.data.winRate}%`}
                </div>
              </div>
              <div className="border border-border bg-secondary/20 p-3">
                <div className="text-[11px] text-muted-foreground">MFE / MAE</div>
                <div className="mt-1 font-mono text-sm font-semibold">
                  +{reviewStats.data.mfeAvg}% / {reviewStats.data.maeAvg}%
                </div>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {reviewStats.data.summary}
            </p>
          </div>
        </Panel>

        <Panel title="AI 反证复核状态" icon={Bot} right={<StatusBadge status={aiReviewStats.status} />}>
          <div className="space-y-4 px-5 py-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['总记录', aiReviewStats.data.total],
                ['已复核', aiReviewStats.data.reviewed],
                ['降级/失败', aiReviewStats.data.fallback],
                ['未启用', aiReviewStats.data.disabled],
              ].map(([label, value]) => (
                <div key={label} className="border border-border bg-secondary/20 p-3">
                  <div className="text-[11px] text-muted-foreground">{label}</div>
                  <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {aiReviewStats.reason ?? 'AI 只做反证、漏洞检查和中文解释，不能替代规则引擎，不能绕过 RR、Risk Gate 或结构失效。'}
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Evidence 绑定保护：{aiReviewStats.data.unboundFallbackProtected ? '开启' : '未开启'}
            </p>
          </div>
        </Panel>
      </div>

      <Panel title="提前发现复盘" icon={Sparkles} right={<StatusBadge status={discoveryReview.status} />}>
        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ['轻扫样本', discoveryReview.data.totalLightCandidates],
              ['启动前', discoveryReview.data.earlyOpportunityCount],
              ['晚到样本', discoveryReview.data.lateMoveCount],
              ['CVD proxy', discoveryReview.data.cvdProxyCandidateCount],
              ['漏判复查', discoveryReview.data.missedDetectionCount],
            ].map(([label, value]) => (
              <div key={label} className="border border-border bg-secondary/20 p-3">
                <div className="text-[11px] text-muted-foreground">{label}</div>
                <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {discoveryReview.data.summary}
          </p>
          <div className="border border-border bg-secondary/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs font-semibold">提前发现校准</div>
              <span
                className={cn(
                  'border px-1.5 py-0.5 font-mono text-[10px]',
                  discoveryReview.data.calibration.status === 'usable'
                    ? 'border-up/40 bg-up/10 text-up'
                    : discoveryReview.data.calibration.status === 'collecting'
                      ? 'border-[oklch(0.8_0.15_75)]/40 bg-[oklch(0.8_0.15_75)]/10 text-[oklch(0.82_0.15_75)]'
                      : 'border-border bg-muted/40 text-muted-foreground',
                )}
              >
                {discoveryReview.data.calibration.status}
              </span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                early→outcome {discoveryReview.data.calibration.earlyOutcomeLink} · late penalty {discoveryReview.data.calibration.lateSignalPenalty} · MFE/MAE {discoveryReview.data.calibration.mfeMaeLink}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {discoveryReview.data.calibration.summary}
            </p>
            <ul className="mt-2 grid gap-1.5 text-[11px] leading-relaxed text-muted-foreground lg:grid-cols-3">
              {discoveryReview.data.calibration.notes.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 bg-neon" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="border border-border bg-secondary/20 p-3">
              <div className="text-xs font-semibold">复盘重点</div>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                {discoveryReview.data.reviewFocus.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 bg-neon" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-border bg-secondary/20 p-3">
              <div className="text-xs font-semibold">硬边界</div>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                {discoveryReview.data.guardrails.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 bg-down" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <FreshnessTag ageSec={discoveryReview.ageSec} source={discoveryReview.source} />
        </div>
      </Panel>

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
                    {a.samples > 0 ? `${a.samples} 样本` : '样本收集中'}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="bar-track h-2 flex-1 overflow-hidden bg-secondary">
                    <span
                      className="bar-fill block h-full bg-neon"
                      style={{ width: `${a.winRate ?? 0}%` }}
                    />
                  </div>
                  <span className="min-w-[96px] text-right font-mono text-[11px]">
                    {a.winRate === null || a.avgRR === null
                      ? '胜率待统计 · RR 待统计'
                      : `胜率 ${a.winRate}% · RR ${a.avgRR}`}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  状态说明：{a.commonFailure}
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
