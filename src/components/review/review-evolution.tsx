'use client'

import { Activity, BarChart3, Bot, Layers3, SearchX, ShieldCheck, Sparkles } from 'lucide-react'
import {
  emptyHistoricalBacktestLaneMetric,
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
  const opportunityCalibration = contract?.opportunityCalibration ?? resource({
    guardrails: ['未传入后端机会校准契约'],
    sampleGate: {
      closedSamples: 0,
      metricSamples: 0,
      minClosedSamples: 30,
      minMetricSamples: 15,
      ready: false,
    },
    schemaVersion: 'opportunity-calibration.v1' as const,
    segments: [],
    status: 'empty' as const,
    summary: '未传入后端机会校准契约',
    thresholds: {
      earlyHotScore: 75,
      earlyWarmScore: 55,
      lateMoveHighRisk: 'late_move 或 overextensionRisk=high 必须降级为复盘/等待回踩反抽。',
      minimumStructuralRR: 3,
    },
  }, 'empty', { source: 'outcome-calibration', reason: '未传入后端机会校准契约' })
  const dailyMoverReview = contract?.dailyMoverReview ?? resource({
    calibrationSuggestionCount: 0,
    guardrails: ['未传入后端每日涨跌榜复盘契约'],
    latestObservedAt: null,
    latestSnapshotId: null,
    missedReviewCount: 0,
    nextAction: '等待真实每日涨跌榜复盘样本。',
    schemaVersion: 'daily-mover-review-status.v1' as const,
    selectedDetailCount: 0,
    snapshotCount: 0,
    status: 'empty' as const,
    summary: '未传入后端每日涨跌榜复盘契约',
  }, 'empty', { source: 'daily-mover-review', reason: '未传入后端每日涨跌榜复盘契约' })
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
  const historicalBacktest = contract?.historicalBacktest ?? resource({
    schemaVersion: 'historical-backtest.v1' as const,
    status: 'empty' as const,
    generatedAt: null,
    reportId: null,
    input: {
      days: null,
      horizonBars: null,
      interval: null,
      moveThresholdPct: null,
      replayTimes: null,
      source: null,
      symbolsUsed: 0,
      topN: null,
    },
    lanes: {
      momentum: emptyHistoricalBacktestLaneMetric('momentum'),
      radar: emptyHistoricalBacktestLaneMetric('radar'),
      random: emptyHistoricalBacktestLaneMetric('random'),
      volume: emptyHistoricalBacktestLaneMetric('volume'),
    },
    findings: [],
    diagnostics: {
      missedOpportunities: [],
      radarReasonMetrics: [],
      radarScoreBuckets: [],
    },
    summary: '未传入后端历史回测契约',
    nextAction: '先生成真实历史回测报告。',
    guardrails: [
      '历史回测只用于验证扫描逻辑，不是收益承诺。',
      '没有报告时必须显示暂无数据，不能用模拟命中率补位。',
    ],
  }, 'empty', { source: 'historical-backtest', reason: '未传入后端历史回测契约' })

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
                <div className="text-[11px] text-muted-foreground">最大浮盈 / 最大回撤</div>
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
              {aiReviewStats.reason ?? 'AI 只做反证、漏洞检查和中文解释，不能替代规则引擎，不能绕过结构盈亏比、风控门禁或结构失效。'}
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              证据绑定保护：{aiReviewStats.data.unboundFallbackProtected ? '开启' : '未开启'}
            </p>
          </div>
        </Panel>
      </div>

      <Panel title="历史回测验证" icon={BarChart3} right={<StatusBadge status={historicalBacktest.status} />}>
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
              用历史时间点回放检查系统有没有“提前筛选优势”。这里显示真实报告；没有报告就空，不用假命中率填充。
            </p>
            <FreshnessTag ageSec={historicalBacktest.ageSec} source={historicalBacktest.source} />
          </div>
          <ResourceBoundary
            resource={historicalBacktest}
            isEmpty={(data) => data.status === 'empty' || data.lanes.radar.count === 0}
            emptyText="暂无历史回测报告"
          >
            {(data) => {
              const radar = data.lanes.radar
              const momentum = data.lanes.momentum
              const random = data.lanes.random
              const volume = data.lanes.volume
              const beatMomentum = radar.hitRatePct > momentum.hitRatePct
              const beatRandom = radar.hitRatePct > random.hitRatePct

              return (
                <div className="space-y-4">
                  <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="border border-border bg-secondary/20 p-3">
                      <div className="flex flex-wrap items-start gap-3">
                        <div>
                          <div className="text-xs font-semibold">本轮结论</div>
                          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                            {data.summary}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'ml-auto border px-1.5 py-0.5 text-[10px] font-semibold',
                            data.status === 'ready'
                              ? 'border-up/40 bg-up/10 text-up'
                              : 'border-[oklch(0.8_0.15_75)]/40 bg-[oklch(0.8_0.15_75)]/10 text-[oklch(0.82_0.15_75)]',
                          )}
                        >
                          {data.status === 'ready' ? '可继续扩大样本' : '需要优先修正'}
                        </span>
                      </div>
                      <p className="mt-3 border-l-2 border-border pl-3 text-[11px] leading-relaxed text-muted-foreground">
                        下一步：{data.nextAction}
                      </p>
                    </div>
                    <div className="border border-border bg-secondary/20 p-3">
                      <div className="text-xs font-semibold">报告输入</div>
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[11px] text-muted-foreground">
                        <span>报告：{data.reportId ?? 'unknown'}</span>
                        <span>周期：{data.input.interval ?? 'unknown'}</span>
                        <span>天数：{formatNullableNumber(data.input.days)}</span>
                        <span>币种：{data.input.symbolsUsed}</span>
                        <span>回放点：{formatNullableNumber(data.input.replayTimes)}</span>
                        <span>每轮：Top {formatNullableNumber(data.input.topN)}</span>
                        <span>窗口：{formatNullableNumber(data.input.horizonBars)} 根</span>
                        <span>阈值：{formatNullableNumber(data.input.moveThresholdPct)}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ['雷达提前评分', radar, '核心系统'],
                      ['24h 涨跌幅基线', momentum, beatMomentum ? '已跑赢' : '未跑赢'],
                      ['成交额基线', volume, '市场热度对照'],
                      ['随机基线', random, beatRandom ? '已跑赢' : '未跑赢'],
                    ].map(([label, lane, caption]) => {
                      const metric = lane as typeof radar
                      return (
                        <div key={String(label)} className="border border-border bg-secondary/20 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-muted-foreground">{String(label)}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">{String(caption)}</span>
                          </div>
                          <div className="mt-2 font-mono text-lg font-semibold">
                            {formatPct(metric.hitRatePct)}
                          </div>
                          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
                            <span>样本 {metric.count}</span>
                            <span>命中 {metric.hitCount}</span>
                            <span>偏晚 {formatPct(metric.lateRatePct)}</span>
                            <span>误报 {formatPct(metric.falsePositiveRatePct)}</span>
                            <span>浮盈 {formatPct(metric.avgMfePct)}</span>
                            <span>回撤 {formatPct(metric.avgMaePct)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
                    <div className="border border-border bg-secondary/20 p-3">
                      <div className="text-xs font-semibold">问题清单</div>
                      {data.findings.length === 0 ? (
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          本轮没有发现阻断级问题，但仍需要扩大币种和时间样本。
                        </p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {data.findings.map((finding) => (
                            <div key={finding.id} className="border border-border bg-background/40 p-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    'border px-1.5 py-0.5 font-mono text-[10px]',
                                    finding.severity === 'high'
                                      ? 'border-down/40 bg-down/10 text-down'
                                      : 'border-[oklch(0.8_0.15_75)]/40 bg-[oklch(0.8_0.15_75)]/10 text-[oklch(0.82_0.15_75)]',
                                  )}
                                >
                                  {finding.severity}
                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground">{finding.id}</span>
                              </div>
                              <div className="mt-1 text-xs font-semibold">{finding.title}</div>
                              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                {finding.detail}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="border border-border bg-secondary/20 p-3">
                      <div className="text-xs font-semibold">雷达分数区间</div>
                      <div className="mt-2 space-y-2">
                        {data.diagnostics.radarScoreBuckets.map((bucket) => (
                          <div key={bucket.label} className="grid grid-cols-[56px_1fr_88px] items-center gap-2 text-[11px]">
                            <span className="font-mono text-muted-foreground">{bucket.label}</span>
                            <div className="h-2 overflow-hidden bg-secondary">
                              <span
                                className="bar-fill block h-full bg-neon"
                                style={{ width: `${Math.min(100, bucket.hitRatePct)}%` }}
                              />
                            </div>
                            <span className="text-right font-mono">
                              {formatPct(bucket.hitRatePct)} · {bucket.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="border border-border bg-secondary/20 p-3">
                      <div className="text-xs font-semibold">原因标签表现</div>
                      <div className="mt-2 space-y-2">
                        {data.diagnostics.radarReasonMetrics.slice(0, 6).map((metric) => (
                          <div key={metric.reason} className="border border-border bg-background/40 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold">{metric.reason}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {metric.count} 样本
                              </span>
                            </div>
                            <div className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                              命中 {formatPct(metric.hitRatePct)} · 浮盈 {formatPct(metric.avgMfePct)} · 回撤 {formatPct(metric.avgMaePct)} · 偏晚 {formatPct(metric.lateRatePct)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border border-border bg-secondary/20 p-3">
                      <div className="text-xs font-semibold">漏掉的未来机会</div>
                      {data.diagnostics.missedOpportunities.length === 0 ? (
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          本轮没有记录到未选中的未来命中机会。
                        </p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {data.diagnostics.missedOpportunities.slice(0, 6).map((miss) => (
                            <div key={`${miss.observedAt}-${miss.symbol}`} className="border border-border bg-background/40 p-2">
                              <div className="flex items-center gap-2">
                                <TokenAvatar symbol={miss.symbol} hue={symbolHue(miss.symbol)} size={20} />
                                <span className="font-mono text-[11px] font-semibold">{miss.symbol}</span>
                                <span className={cn('font-mono text-[10px]', miss.direction === 'LONG' ? 'text-up' : 'text-down')}>
                                  {miss.direction === 'LONG' ? '多' : '空'}
                                </span>
                                <span className="ml-auto font-mono text-[10px] text-up">
                                  后续最大浮盈 {formatPct(miss.mfePct)}
                                </span>
                              </div>
                              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                                当时分数 {miss.opportunityScore} · 24h {formatPct(miss.change24hPct)} · {miss.reasons.join(' / ') || '无原因标签'}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <ul className="grid gap-1.5 text-[11px] leading-relaxed text-muted-foreground lg:grid-cols-2">
                    {data.guardrails.map((rule) => (
                      <li key={rule} className="flex gap-2">
                        <span className="mt-1.5 size-1.5 shrink-0 bg-neon" />
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            }}
          </ResourceBoundary>
        </div>
      </Panel>

      <Panel title="提前发现复盘" icon={Sparkles} right={<StatusBadge status={discoveryReview.status} />}>
        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ['轻扫样本', discoveryReview.data.totalLightCandidates],
              ['启动前', discoveryReview.data.earlyOpportunityCount],
              ['晚到样本', discoveryReview.data.lateMoveCount],
              ['主动买卖代理', discoveryReview.data.cvdProxyCandidateCount],
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
                {calibrationStatusLabel(discoveryReview.data.calibration.status)}
              </span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                提前→结果 {readinessLabel(discoveryReview.data.calibration.earlyOutcomeLink)} · 晚到惩罚 {readinessLabel(discoveryReview.data.calibration.lateSignalPenalty)} · 最大浮盈/最大回撤 {readinessLabel(discoveryReview.data.calibration.mfeMaeLink)}
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
          <div className="border border-border bg-secondary/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs font-semibold">机会校准门禁</div>
              <StatusBadge status={opportunityCalibration.status} />
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                closed {opportunityCalibration.data.sampleGate.closedSamples}/{opportunityCalibration.data.sampleGate.minClosedSamples}
                {' · '}
                最大浮盈/最大回撤 {opportunityCalibration.data.sampleGate.metricSamples}/{opportunityCalibration.data.sampleGate.minMetricSamples}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {opportunityCalibration.data.summary}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {opportunityCalibration.data.segments.map((segment) => (
                <div key={segment.key} className="border border-border bg-background/40 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold">{segment.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {segment.currentCandidates}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                    {segment.interpretation}
                  </p>
                  <p className="mt-1.5 border-l border-border pl-2 text-[10px] leading-relaxed text-muted-foreground">
                    {segment.nextAction}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              <div className="border border-border bg-background/40 p-2.5">
                <div className="text-[11px] font-semibold">固定阈值</div>
                <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  启动前强信号 ≥ {opportunityCalibration.data.thresholds.earlyHotScore} · 启动前温信号 ≥ {opportunityCalibration.data.thresholds.earlyWarmScore} · 结构盈亏比 ≥ {opportunityCalibration.data.thresholds.minimumStructuralRR}:1
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  {opportunityCalibration.data.thresholds.lateMoveHighRisk}
                </p>
              </div>
              <div className="border border-border bg-background/40 p-2.5">
                <div className="text-[11px] font-semibold">校准边界</div>
                <ul className="mt-1.5 space-y-1 text-[10px] leading-relaxed text-muted-foreground">
                  {opportunityCalibration.data.guardrails.slice(0, 4).map((rule) => (
                    <li key={rule}>· {rule}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-3">
              <FreshnessTag ageSec={opportunityCalibration.ageSec} source={opportunityCalibration.source} />
            </div>
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

      {/* 信号生命周期 + 最大浮盈/最大回撤 */}
      <Panel title="信号生命周期 · 最大浮盈 / 最大回撤" icon={Activity}>
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
                  <th className="py-2 font-medium">最大浮盈 / 最大回撤</th>
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

      <Panel title="每日涨跌榜复盘状态" icon={Activity} right={<StatusBadge status={dailyMoverReview.status} />}>
        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['快照数', dailyMoverReview.data.snapshotCount],
              ['选中样本', dailyMoverReview.data.selectedDetailCount],
              ['漏判复查', dailyMoverReview.data.missedReviewCount],
              ['校准建议', dailyMoverReview.data.calibrationSuggestionCount],
            ].map(([label, value]) => (
              <div key={label} className="border border-border bg-secondary/20 p-3">
                <div className="text-[11px] text-muted-foreground">{label}</div>
                <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="border border-border bg-secondary/20 p-3">
              <div className="text-[11px] text-muted-foreground">最近快照</div>
              <div className="mt-1 text-xs font-semibold">
                {dailyMoverReview.data.latestSnapshotId ?? '暂无真实快照'}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {dailyMoverReview.data.latestObservedAt
                  ? `观察时间：${dailyMoverReview.data.latestObservedAt}`
                  : '没有快照时，系统不能声称已经完成每日涨跌榜复盘。'}
              </p>
            </div>
            <div className="border border-border bg-secondary/20 p-3">
              <div className="text-xs font-semibold">当前结论</div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {dailyMoverReview.data.summary}
              </p>
              <p className="mt-2 border-l-2 border-border pl-3 text-[11px] leading-relaxed text-muted-foreground">
                下一步：{dailyMoverReview.data.nextAction}
              </p>
            </div>
          </div>
          <ul className="grid gap-1.5 text-[11px] leading-relaxed text-muted-foreground lg:grid-cols-3">
            {dailyMoverReview.data.guardrails.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 bg-neon" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
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
                      ? '胜率待统计 · 盈亏比待统计'
                      : `胜率 ${a.winRate}% · 盈亏比 ${a.avgRR}`}
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

function calibrationStatusLabel(value: 'usable' | 'collecting' | 'empty') {
  if (value === 'usable') return '可使用'
  if (value === 'collecting') return '样本收集中'
  return '暂无样本'
}

function readinessLabel(value: 'ready' | 'collecting' | 'active') {
  if (value === 'ready' || value === 'active') return '已接通'
  return '收集中'
}

function formatNullableNumber(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'unknown'
  }

  return String(value)
}

function formatPct(value: number) {
  if (!Number.isFinite(value)) {
    return '0%'
  }

  return `${Math.round(value * 100) / 100}%`
}

function symbolHue(symbol: string) {
  let hash = 0

  for (const char of symbol) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }

  return hash % 360
}
