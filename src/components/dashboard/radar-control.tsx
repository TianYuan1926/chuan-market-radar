'use client'

import {
  type CapabilityStage,
  type DataSourceState,
  type DeepScanQueue,
  type LightScanQualityState,
  type RadarContract,
  type RealtimeCapabilityState,
  type ScanStabilityState,
  type ScanProofData,
} from '@/lib/radar-contract'
import { resource } from '@/lib/data-status'
import { StatusBadge, FreshnessTag, ResourceBoundary } from '@/components/data-state'
import { CountUp } from '@/components/count-up'
import {
  Radar,
  Layers,
  Cpu,
  Database,
  CircleDot,
  Timer,
  Route,
  ShieldCheck,
  ClipboardList,
  Activity,
} from 'lucide-react'
import type {
  CoreChainGovernanceReport,
  CoreFeatureAction,
  CoreFeatureClass,
  CoreReadinessStatus,
} from '@/lib/api/core-chain-governance'

const CAP_STATUS_TONE: Record<string, string> = {
  active: 'text-up border-up/40 bg-up/10',
  standby: 'text-neon border-neon/40 bg-neon/10',
  degraded: 'text-down border-down/40 bg-down/10',
}
const CAP_STATUS_LABEL: Record<string, string> = {
  active: '运行中',
  standby: '待命',
  degraded: '降级',
}
const FEED_TONE: Record<string, string> = {
  live: 'text-up',
  cached: 'text-neon',
  stale: 'text-[oklch(0.8_0.15_75)]',
  partial: 'text-[oklch(0.8_0.15_75)]',
  failed: 'text-down',
}
const FEED_LABEL: Record<string, string> = {
  live: '实时',
  cached: '缓存',
  stale: '过期',
  partial: '部分',
  failed: '失败',
}
const CORE_STATUS_TONE: Record<CoreReadinessStatus, string> = {
  ready: 'text-up border-up/40 bg-up/10',
  watch: 'text-neon border-neon/40 bg-neon/10',
  partial: 'text-[oklch(0.8_0.15_75)] border-[oklch(0.8_0.15_75)]/40 bg-[oklch(0.8_0.15_75)]/10',
  collecting: 'text-muted-foreground border-border bg-secondary/30',
  blocked: 'text-down border-down/40 bg-down/10',
}
const CORE_STATUS_LABEL: Record<CoreReadinessStatus, string> = {
  ready: '已就绪',
  watch: '观察中',
  partial: '部分可用',
  collecting: '采集中',
  blocked: '阻塞',
}
const FEATURE_CLASS_LABEL: Record<CoreFeatureClass, string> = {
  core: '核心',
  supporting: '辅助',
  downgraded: '降级',
  merge: '合并',
  rebuild: '重构',
  delete: '删除',
}
const FEATURE_ACTION_LABEL: Record<CoreFeatureAction, string> = {
  delete: '删除',
  downgrade: '降级',
  keep: '保留',
  merge: '合并',
  rebuild: '重构',
  strengthen: '做强',
}
const FEATURE_CLASS_TONE: Record<CoreFeatureClass, string> = {
  core: 'text-up border-up/40 bg-up/10',
  supporting: 'text-neon border-neon/40 bg-neon/10',
  downgraded: 'text-[oklch(0.8_0.15_75)] border-[oklch(0.8_0.15_75)]/40 bg-[oklch(0.8_0.15_75)]/10',
  merge: 'text-neon border-neon/40 bg-neon/10',
  rebuild: 'text-[oklch(0.8_0.15_75)] border-[oklch(0.8_0.15_75)]/40 bg-[oklch(0.8_0.15_75)]/10',
  delete: 'text-down border-down/40 bg-down/10',
}
const QUALITY_CHECK_TONE: Record<string, string> = {
  pass: 'text-up border-up/40 bg-up/10',
  watch: 'text-[oklch(0.8_0.15_75)] border-[oklch(0.8_0.15_75)]/40 bg-[oklch(0.8_0.15_75)]/10',
  blocked: 'text-down border-down/40 bg-down/10',
}
const QUALITY_CHECK_LABEL: Record<string, string> = {
  pass: '通过',
  watch: '观察',
  blocked: '阻塞',
}

const EMPTY_SOURCE = {
  source: 'frontend-contract',
  reason: '未收到后端页面契约，禁止使用演示数据兜底',
}

const EMPTY_SCAN = resource<ScanProofData>(
  {
    totalMonitored: 0,
    scannable: 0,
    lightScanned: 0,
    deepScanned: 0,
    awaitingDeepScan: 0,
    deepCoverage: 0,
    coverage: 0,
    lastScanAt: '—',
    nextScanCountdownSec: 0,
    stuck: true,
  },
  'empty',
  EMPTY_SOURCE,
)

const EMPTY_QUEUE = resource<DeepScanQueue>(
  {
    currentBatch: [],
    nextBatch: [],
    highPriority: [],
    coldExploration: [],
    longUnscanned: [],
  },
  'empty',
  EMPTY_SOURCE,
)

const EMPTY_CAPABILITIES = resource<CapabilityStage[]>([], 'empty', EMPTY_SOURCE)
const EMPTY_SOURCES = resource<DataSourceState[]>([], 'empty', EMPTY_SOURCE)
const EMPTY_LIGHT_SCAN_QUALITY = resource<LightScanQualityState>({
  ageSec: null,
  canCreateTradeSignal: false,
  checks: [],
  coverage: {
    acceptedCount: 0,
    averagePriorityScore: 0,
    buyPressureCandidateCount: 0,
    candidateCount: 0,
    cvdProxyCandidateCount: 0,
    earlyOpportunityCandidateCount: 0,
    hotCandidateCount: 0,
    lateMoveCandidateCount: 0,
    preTrendCandidateCount: 0,
    rollingWindowCandidateCount: 0,
    sellPressureCandidateCount: 0,
    topCandidateCount: 0,
    universeCount: 0,
    zScoreCandidateCount: 0,
  },
  generatedAt: '',
  guardrails: [
    '等待后端轻扫质量契约。',
    '轻扫质量不能生成交易计划。',
  ],
  schemaVersion: 'light-scan-quality.v1',
  source: 'frontend-contract',
  staleAfterSec: 180,
  status: 'blocked',
  summary: '等待后端轻扫质量契约。',
  topCandidates: [],
}, 'empty', EMPTY_SOURCE)
const EMPTY_SCAN_STABILITY = resource<ScanStabilityState>({
  issues: [
    {
      code: 'missing_contract',
      detail: '未收到后端扫描稳定性契约。',
      severity: 'watch',
    },
  ],
  score: 0,
  status: 'watch',
  summary: '等待后端扫描稳定性契约。',
}, 'empty', EMPTY_SOURCE)
const EMPTY_REALTIME = resource<RealtimeCapabilityState>({
  schemaVersion: 'realtime-capability.v1',
  secondLevelOnline: false,
  summary: '等待后端实时能力契约。',
  lanes: [],
  boundaries: [
    '秒级数据只负责发现异常，不生成交易计划。',
    '交易计划必须经过结构、证据、RR、Risk Gate 和失效条件。',
  ],
}, 'empty', EMPTY_SOURCE)
const EMPTY_GOVERNANCE = resource<CoreChainGovernanceReport>({
  schemaVersion: 'core-chain-governance.v1',
  generatedAt: '',
  allowedUse: 'product_governance_only',
  canAutoExecute: false,
  canCreateTradeSignal: false,
  canMutateLiveRanking: false,
  coreObjective: '快速全市场覆盖扫描、发现机会、给出策略、自我提升。',
  chain: [],
  featureTriage: [],
  pageRoles: [],
  apiRoles: [],
  p0Completion: {
    checks: [],
    percent: 0,
    remaining: ['等待真实后端核心链路治理契约。'],
    status: 'blocked',
    summary: '等待真实后端核心链路治理契约。',
  },
  p1Completion: {
    checks: [],
    percent: 0,
    remaining: ['等待真实后端 P1 快速扫描完成度契约。'],
    status: 'blocked',
    summary: '等待真实后端 P1 快速扫描完成度契约。',
  },
  readiness: {
    blockedSteps: 0,
    coreReadySteps: 0,
    totalSteps: 0,
    status: 'collecting',
  },
  cleanupRules: [],
  operatingSequence: [],
}, 'empty', EMPTY_SOURCE)

export function DashboardRadarControl({ contract }: { contract?: RadarContract } = {}) {
  const scan = contract?.scanProof ?? EMPTY_SCAN
  const queue = contract?.deepScanQueue ?? EMPTY_QUEUE
  const caps = contract?.capabilityStages ?? EMPTY_CAPABILITIES
  const governance = contract?.coreChainGovernance ?? EMPTY_GOVERNANCE
  const sources = contract?.dataSources ?? EMPTY_SOURCES
  const scanStability = contract?.scanStability ?? EMPTY_SCAN_STABILITY
  const lightScanQuality = contract?.lightScanQuality ?? EMPTY_LIGHT_SCAN_QUALITY
  const realtime = contract?.realtimeCapability ?? EMPTY_REALTIME

  const sp = scan.data

  const scanMetrics: { label: string; value: number; suffix?: string }[] = [
    { label: '总监控币数', value: sp.totalMonitored },
    { label: '可扫描', value: sp.scannable },
    { label: '已轻扫', value: sp.lightScanned },
    { label: '已深扫', value: sp.deepScanned },
    { label: '等待深扫', value: sp.awaitingDeepScan },
    { label: '轻扫覆盖率', value: sp.coverage, suffix: '%' },
    { label: '深扫占比', value: sp.deepCoverage ?? 0, suffix: '%' },
  ]

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* 一、全市场扫描证明 */}
      <section className="border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <span className="h-3.5 w-1 bg-neon" />
          <Radar className="size-4 text-neon" />
          <h2 className="font-semibold">全市场扫描证明</h2>
          <StatusBadge status={scan.status} className="ml-auto" />
        </div>
        <div className="p-5">
          <ResourceBoundary resource={scan}>
          <div className="grid grid-cols-3 gap-2.5">
            {scanMetrics.map((m, i) => (
              <div
                key={m.label}
                className="data-tile tile-in border border-border bg-secondary/30 p-2.5"
                style={{ ['--i' as string]: i }}
              >
                <div className="text-[11px] text-muted-foreground">{m.label}</div>
                <div className="mt-1 font-mono text-lg font-bold tracking-tight">
                  <CountUp value={m.value} suffix={m.suffix} />
                </div>
              </div>
            ))}
          </div>
          {/* 全市场轻扫覆盖进度条：入场增长 + 轨道流光 */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>全市场轻扫覆盖</span>
              <span className="font-mono text-foreground">{sp.coverage}%</span>
            </div>
            <div className="bar-track h-1.5 overflow-hidden bg-secondary">
              <div
                className="bar-fill h-full bg-neon"
                style={{ width: `${sp.coverage}%` }}
              />
            </div>
            {scan.reason && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {scan.reason}
              </p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CircleDot className="size-3.5 text-neon" />
              最近扫描 <span className="font-mono text-foreground">{sp.lastScanAt}</span>
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Timer className="size-3.5 text-neon" />
              下一轮 <span className="font-mono text-foreground">{sp.nextScanCountdownSec}s</span>
            </span>
            <span
              className={`flex items-center gap-1.5 ${sp.stuck ? 'text-down' : 'text-up'}`}
            >
              <span className={`size-1.5 rounded-full ${sp.stuck ? 'bg-down' : 'bg-up animate-pulse'}`} />
              {sp.stuck ? '扫描卡住' : '扫描正常'}
            </span>
          </div>
          <FreshnessTag {...scan} className="mt-2 block" />
          </ResourceBoundary>
        </div>
      </section>

      {/* 二、深扫队列 */}
      <section className="border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <span className="h-3.5 w-1 bg-neon" />
          <Layers className="size-4 text-neon" />
          <h2 className="font-semibold">深扫队列</h2>
          <StatusBadge status={queue.status} className="ml-auto" />
        </div>
        <div className="space-y-3 p-5">
          <ResourceBoundary resource={queue}>
          <QueueRow label="本轮深扫" symbols={queue.data.currentBatch} tone="neon" />
          <QueueRow label="下一批" symbols={queue.data.nextBatch} tone="muted" />
          <QueueRow label="高优先级" symbols={queue.data.highPriority} tone="up" />
          <QueueRow label="冷门探索" symbols={queue.data.coldExploration} tone="muted" />
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              长时间未扫
            </div>
            <div className="flex flex-wrap gap-1.5">
              {queue.data.longUnscanned.map((u) => (
                <span
                  key={u.symbol}
                  className="flex items-center gap-1 border border-[oklch(0.8_0.15_75)]/40 bg-[oklch(0.8_0.15_75)]/10 px-1.5 py-0.5 font-mono text-[11px] text-[oklch(0.82_0.15_75)]"
                >
                  {u.symbol}
                  <span className="opacity-70">{u.idleMin}m</span>
                </span>
              ))}
            </div>
          </div>
          <FreshnessTag {...queue} className="block" />
          </ResourceBoundary>
        </div>
      </section>

      {/* 二点五、扫描稳定性 */}
      <section className="border border-border bg-card lg:col-span-2">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <span className="h-3.5 w-1 bg-neon" />
          <ShieldCheck className="size-4 text-neon" />
          <h2 className="font-semibold">扫描稳定性</h2>
          <span className="ml-auto mr-2 text-xs text-muted-foreground">
            只做运维诊断，不生成交易信号
          </span>
          <StatusBadge status={scanStability.status} />
        </div>
        <div className="p-5">
          <ResourceBoundary resource={scanStability}>
            {(stability) => (
              <div className="grid gap-3 lg:grid-cols-[0.65fr_1.35fr]">
                <div className="border border-border bg-secondary/25 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      {stability.status === 'healthy' ? '稳定' : stability.status === 'watch' ? '观察' : '阻塞'}
                    </span>
                    <span className="font-mono text-lg font-bold text-neon">{stability.score}</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {stability.summary}
                  </p>
                  <FreshnessTag {...scanStability} className="mt-2 block" />
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {stability.issues.length === 0 ? (
                    <div className="border border-up/35 bg-up/10 p-3 text-xs text-up">
                      当前没有扫描稳定性问题。
                    </div>
                  ) : stability.issues.map((issue) => (
                    <div key={`${issue.code}-${issue.detail}`} className="border border-border bg-secondary/25 p-3">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 truncate font-mono text-xs font-semibold">{issue.code}</span>
                        <span className={`ml-auto border px-1.5 py-0.5 text-[10px] ${
                          issue.severity === 'critical'
                            ? 'border-down/40 bg-down/10 text-down'
                            : issue.severity === 'watch'
                              ? 'border-[oklch(0.8_0.15_75)]/40 bg-[oklch(0.8_0.15_75)]/10 text-[oklch(0.82_0.15_75)]'
                              : 'border-neon/40 bg-neon/10 text-neon'
                        }`}
                        >
                          {issue.severity}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                        {issue.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ResourceBoundary>
        </div>
      </section>

      {/* 三、轻扫质量诊断 */}
      <section className="border border-border bg-card lg:col-span-2">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <span className="h-3.5 w-1 bg-neon" />
          <Activity className="size-4 text-neon" />
          <h2 className="font-semibold">轻扫质量诊断</h2>
          <span className="ml-auto mr-2 text-xs text-muted-foreground">
            发现层可靠性，不生成交易计划
          </span>
          <StatusBadge status={lightScanQuality.status} />
        </div>
        <div className="p-5">
          <ResourceBoundary resource={lightScanQuality} isEmpty={(d) => d.checks.length === 0}>
            {(quality) => (
              <div className="space-y-4">
                <div className="grid gap-2.5 lg:grid-cols-[0.85fr_1.15fr]">
                  <div className="border border-border bg-secondary/25 p-3">
                    <div className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${quality.status === 'healthy' ? 'bg-up animate-pulse' : quality.status === 'watch' ? 'bg-[oklch(0.8_0.15_75)]' : 'bg-down'}`} />
                      <span className="text-sm font-semibold">
                        {quality.status === 'healthy' ? '轻扫健康' : quality.status === 'watch' ? '轻扫观察' : '轻扫阻塞'}
                      </span>
                      <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                        age {quality.ageSec ?? '—'}s / stale {quality.staleAfterSec}s
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {quality.summary}
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <MetricPill label="覆盖" value={quality.coverage.acceptedCount} />
                      <MetricPill label="候选" value={quality.coverage.candidateCount} />
                      <MetricPill label="z-score" value={quality.coverage.zScoreCandidateCount} />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <MetricPill label="窗口" value={quality.coverage.rollingWindowCandidateCount} />
                      <MetricPill label="预启动" value={quality.coverage.preTrendCandidateCount} />
                      <MetricPill label="均分" value={quality.coverage.averagePriorityScore} />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <MetricPill label="CVD proxy" value={quality.coverage.cvdProxyCandidateCount} />
                      <MetricPill label="买压" value={quality.coverage.buyPressureCandidateCount} />
                      <MetricPill label="卖压" value={quality.coverage.sellPressureCandidateCount} />
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {quality.checks.map((check) => (
                      <div key={check.key} className="border border-border bg-secondary/25 p-3">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 truncate text-sm font-semibold">{check.label}</span>
                          <span className={`ml-auto shrink-0 border px-1.5 py-0.5 text-[10px] ${QUALITY_CHECK_TONE[check.status]}`}>
                            {QUALITY_CHECK_LABEL[check.status]}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                          {check.detail}
                        </p>
                        <p className="mt-2 line-clamp-1 border-t border-border pt-2 font-mono text-[10px] text-muted-foreground">
                          {check.evidence.slice(0, 2).join(' · ')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2.5 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="border border-border bg-secondary/25 p-3">
                    <div className="text-sm font-semibold">强候选样本</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {quality.topCandidates.length === 0 ? (
                        <span className="text-xs text-muted-foreground">当前没有轻扫候选样本</span>
                      ) : quality.topCandidates.map((candidate) => (
                        <div key={candidate.symbol} className="border border-border bg-background/40 p-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-neon">{candidate.symbol}</span>
                            <span className="ml-auto font-mono text-[11px] text-foreground">{candidate.score}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                            <span>{candidate.opportunityPhase ?? candidate.state}</span>
                            <span>{candidate.changePercent}%</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                            <span>{candidate.pressureSide ?? 'proxy—'}</span>
                            <span>early {candidate.earlyOpportunityScore ?? '—'}</span>
                          </div>
                          {candidate.overextensionRisk === 'high' ? (
                            <div className="mt-1 font-mono text-[10px] text-warning">late / review only</div>
                          ) : null}
                          <p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground">
                            {candidate.reasons.slice(0, 2).join(' / ')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-border bg-secondary/25 p-3">
                    <div className="text-sm font-semibold">轻扫硬边界</div>
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                      {quality.guardrails.map((rule) => (
                        <li key={rule} className="flex gap-2">
                          <span className="mt-1 size-1.5 shrink-0 bg-neon" />
                          <span>{rule}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <FreshnessTag {...lightScanQuality} className="block" />
              </div>
            )}
          </ResourceBoundary>
        </div>
      </section>

      {/* 三、实时能力分层 */}
      <section className="border border-border bg-card lg:col-span-2">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <span className="h-3.5 w-1 bg-neon" />
          <Activity className="size-4 text-neon" />
          <h2 className="font-semibold">实时能力分层</h2>
          <span className="ml-auto mr-2 text-xs text-muted-foreground">
            秒级发现，不直接生成交易计划
          </span>
          <StatusBadge status={realtime.status} />
        </div>
        <div className="p-5">
          <ResourceBoundary resource={realtime} isEmpty={(d) => d.lanes.length === 0}>
            {(rt) => (
              <div className="space-y-4">
                <div className="grid gap-2.5 lg:grid-cols-[0.95fr_1.05fr]">
                  <div className="border border-border bg-secondary/25 p-3">
                    <div className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${rt.secondLevelOnline ? 'bg-up animate-pulse' : 'bg-[oklch(0.8_0.15_75)]'}`} />
                      <span className="text-sm font-semibold">
                        {rt.secondLevelOnline ? '秒级轻扫在线' : '秒级轻扫未完全在线'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {rt.summary}
                    </p>
                  </div>
                  <div className="border border-border bg-secondary/25 p-3">
                    <div className="text-sm font-semibold">硬边界</div>
                    <ul className="mt-2 grid gap-1.5 text-xs leading-relaxed text-muted-foreground sm:grid-cols-2">
                      {rt.boundaries.map((rule) => (
                        <li key={rule} className="flex gap-2">
                          <span className="mt-1 size-1.5 shrink-0 bg-neon" />
                          <span>{rule}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
                  {rt.lanes.map((lane, i) => (
                    <div
                      key={lane.key}
                      className="data-tile tile-in border border-border bg-secondary/30 p-3"
                      style={{ ['--i' as string]: i }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold">{lane.label}</span>
                        <span className="ml-auto shrink-0 border border-border bg-background/40 px-1.5 py-0.5 font-mono text-[10px] text-neon">
                          {lane.cadenceLabel}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className={`flex items-center gap-1 text-[11px] font-semibold ${FEED_TONE[lane.status] ?? 'text-muted-foreground'}`}>
                          <span className="size-1.5 rounded-full bg-current" />
                          {FEED_LABEL[lane.status] ?? lane.status}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {lane.allowedUse.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                        {lane.source}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {lane.metrics.slice(0, 4).map((metric) => (
                          <span key={metric} className="border border-border bg-background/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {metric}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 line-clamp-2 border-t border-border pt-2 text-[11px] leading-relaxed text-down">
                        {lane.guardrail}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                        {lane.note}
                      </p>
                    </div>
                  ))}
                </div>
                <FreshnessTag {...realtime} className="block" />
              </div>
            )}
          </ResourceBoundary>
        </div>
      </section>

      {/* 三、核心链路体检 */}
      <section className="border border-border bg-card lg:col-span-2">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <span className="h-3.5 w-1 bg-neon" />
          <Route className="size-4 text-neon" />
          <h2 className="font-semibold">核心链路体检</h2>
          <span className="ml-auto mr-2 text-xs text-muted-foreground">
            全市场发现 → 复盘进化
          </span>
          <StatusBadge status={governance.status} />
        </div>
        <div className="p-5">
          <ResourceBoundary resource={governance} isEmpty={(d) => d.chain.length === 0}>
            {(g) => (
              <div className="space-y-4">
                <div className="grid gap-2.5 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="border border-border bg-secondary/25 p-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-4 text-neon" />
                      <span className="text-sm font-semibold">唯一核心</span>
                      <span className={`ml-auto border px-1.5 py-0.5 text-[10px] ${CORE_STATUS_TONE[g.readiness.status]}`}>
                        {CORE_STATUS_LABEL[g.readiness.status]}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {g.coreObjective}
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <MetricPill label="环节" value={g.readiness.totalSteps} />
                      <MetricPill label="就绪" value={g.readiness.coreReadySteps} />
                      <MetricPill label="阻塞" value={g.readiness.blockedSteps} />
                    </div>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="border border-border bg-secondary/25 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">P0 完成度</span>
                      <span className={`ml-auto border px-1.5 py-0.5 text-[10px] ${g.p0Completion.status === 'ready' ? 'border-up/40 bg-up/10 text-up' : 'border-down/40 bg-down/10 text-down'}`}>
                        {g.p0Completion.percent}%
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {g.p0Completion.summary}
                    </p>
                    <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                      {g.p0Completion.checks.map((check) => (
                        <div key={check.key} className="flex items-center gap-2 text-[11px]">
                          <span className={`size-1.5 shrink-0 ${check.status === 'pass' ? 'bg-up' : 'bg-down'}`} />
                          <span className="min-w-0 truncate text-muted-foreground">{check.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border border-border bg-secondary/25 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">P1 快速扫描</span>
                      <span className={`ml-auto border px-1.5 py-0.5 text-[10px] ${g.p1Completion.status === 'ready' ? 'border-up/40 bg-up/10 text-up' : 'border-down/40 bg-down/10 text-down'}`}>
                        {g.p1Completion.percent}%
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {g.p1Completion.summary}
                    </p>
                    <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                      {g.p1Completion.checks.map((check) => (
                        <div key={check.key} className="flex items-center gap-2 text-[11px]">
                          <span className={`size-1.5 shrink-0 ${check.status === 'pass' ? 'bg-up' : 'bg-down'}`} />
                          <span className="min-w-0 truncate text-muted-foreground">{check.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  </div>
                </div>

                <div className="grid gap-2.5 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="border border-border bg-secondary/25 p-3">
                    <div className="text-sm font-semibold">清理规则</div>
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                      {g.cleanupRules.map((rule) => (
                        <li key={rule} className="flex gap-2">
                          <span className="mt-1 size-1.5 shrink-0 bg-neon" />
                          <span>{rule}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="border border-border bg-secondary/25 p-3">
                    <div className="text-sm font-semibold">清理队列</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {g.featureTriage
                        .filter((item) => item.action === 'delete' || item.action === 'merge' || item.action === 'rebuild' || item.action === 'downgrade')
                        .map((item) => (
                          <div key={item.id} className="border border-border bg-background/40 p-2">
                            <div className="flex items-center gap-1.5">
                              <span className="min-w-0 truncate text-xs font-semibold">{item.label}</span>
                              <span className={`ml-auto shrink-0 border px-1.5 py-0.5 text-[10px] ${FEATURE_CLASS_TONE[item.classification]}`}>
                                {FEATURE_ACTION_LABEL[item.action]}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                              {item.guardrail}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
                  {g.chain.map((step, i) => (
                    <div
                      key={step.id}
                      className="data-tile tile-in border border-border bg-secondary/30 p-3"
                      style={{ ['--i' as string]: i }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="grid size-5 place-items-center border border-neon/40 font-mono text-[10px] text-neon">
                          {i + 1}
                        </span>
                        <span className="min-w-0 truncate text-sm font-semibold">{step.title}</span>
                        <span className={`ml-auto shrink-0 border px-1.5 py-0.5 text-[10px] ${CORE_STATUS_TONE[step.status]}`}>
                          {CORE_STATUS_LABEL[step.status]}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {step.summary}
                      </p>
                      {step.blockers.length > 0 ? (
                        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-down">
                          {step.blockers[0]}
                        </p>
                      ) : (
                        <p className="mt-2 text-[11px] text-up">当前无阻塞</p>
                      )}
                      <p className="mt-2 line-clamp-2 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
                        {step.guardrail}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-2.5 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="border border-border bg-secondary/25 p-3">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="size-4 text-neon" />
                      <span className="text-sm font-semibold">功能分级</span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        核心 / 辅助 / 清理
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {g.featureTriage.map((item) => (
                        <div key={item.id} className="border border-border bg-background/40 p-2">
                          <div className="flex items-center gap-1.5">
                            <span className="min-w-0 truncate text-xs font-semibold">{item.label}</span>
                            <span className={`ml-auto shrink-0 border px-1.5 py-0.5 text-[10px] ${FEATURE_CLASS_TONE[item.classification]}`}>
                              {FEATURE_CLASS_LABEL[item.classification]}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                            {FEATURE_ACTION_LABEL[item.action]}：{item.reason}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-border bg-secondary/25 p-3">
                    <div className="text-sm font-semibold">页面职责</div>
                    <div className="mt-3 space-y-2">
                      {g.pageRoles.map((page) => (
                        <div key={page.route} className="border border-border bg-background/40 p-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-neon">{page.route}</span>
                            <span className="ml-auto border border-border bg-secondary/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {page.role === 'core' ? '核心页' : '辅助页'}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                            {page.job}
                          </p>
                          <p className="mt-1 line-clamp-1 text-[10px] text-down">
                            禁止：{page.mustNotShow.slice(0, 2).join(' / ')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="border border-border bg-secondary/25 p-3">
                  <div className="text-sm font-semibold">接口职责</div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {g.apiRoles.map((api) => (
                      <div key={api.route} className="border border-border bg-background/40 p-2">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 truncate font-mono text-xs font-semibold text-neon">{api.route}</span>
                          <span className="ml-auto border border-border bg-secondary/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {api.role === 'core' ? '核心接口' : api.role === 'operations' ? '运维接口' : '辅助接口'}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                          {api.job}
                        </p>
                        <p className="mt-1 line-clamp-1 text-[10px] text-down">
                          禁止：{api.mustNotDo.slice(0, 2).join(' / ')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <FreshnessTag {...governance} className="block" />
              </div>
            )}
          </ResourceBoundary>
        </div>
      </section>

      {/* 四、系统能力总控（核心链路阶段） */}
      <section className="border border-border bg-card lg:col-span-2">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <span className="h-3.5 w-1 bg-neon" />
          <Cpu className="size-4 text-neon" />
          <h2 className="font-semibold">系统能力总控</h2>
          <span className="ml-auto mr-2 text-xs text-muted-foreground">
            {caps.data.length} 个核心阶段
          </span>
          <StatusBadge status={caps.status} />
        </div>
        <div className="p-5">
          <ResourceBoundary resource={caps} isEmpty={(d) => d.length === 0}>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {caps.data.map((c, i) => (
            <div
              key={c.key}
              className="data-tile tile-in border border-border bg-secondary/30 p-3"
              style={{ ['--i' as string]: i }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm">{c.name}</span>
                <span
                  className={`shrink-0 border px-1.5 py-0.5 text-[10px] ${CAP_STATUS_TONE[c.status]}`}
                >
                  {CAP_STATUS_LABEL[c.status]}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{c.desc}</p>
              <div className="mt-2 font-mono text-[11px] text-neon">{c.note}</div>
            </div>
          ))}
          </div>
          </ResourceBoundary>
        </div>
      </section>

      {/* 五、数据源状态 */}
      <section className="border border-border bg-card lg:col-span-2">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <span className="h-3.5 w-1 bg-neon" />
          <Database className="size-4 text-neon" />
          <h2 className="font-semibold">数据源状态</h2>
          <StatusBadge status={sources.status} className="ml-auto" />
        </div>
        <div className="p-5">
          <ResourceBoundary resource={sources} isEmpty={(d) => d.length === 0}>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {sources.data.map((s, i) => (
              <div
                key={s.name}
                className="data-tile tile-in border border-border bg-secondary/30 p-3"
                style={{ ['--i' as string]: i }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{s.name}</span>
                  <span className={`flex items-center gap-1 text-[11px] font-semibold ${FEED_TONE[s.feed]}`}>
                    <span className="size-1.5 rounded-full bg-current" />
                    {FEED_LABEL[s.feed]}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                  <span>{s.latencyMs === null ? '延迟 待探针' : `延迟 ${s.latencyMs}ms`}</span>
                  <span>{s.lastUpdate}</span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{s.note}</p>
              </div>
            ))}
          </div>
          </ResourceBoundary>
        </div>
      </section>
    </div>
  )
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border bg-background/40 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-bold text-foreground">{value}</div>
    </div>
  )
}

function QueueRow({
  label,
  symbols,
  tone,
}: {
  label: string
  symbols: string[]
  tone: 'neon' | 'up' | 'muted'
}) {
  const toneClass =
    tone === 'neon'
      ? 'border-neon/40 bg-neon/10 text-neon'
      : tone === 'up'
        ? 'border-up/40 bg-up/10 text-up'
        : 'border-border bg-secondary/40 text-foreground'
  return (
    <div>
      <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {symbols.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">—</span>
        ) : (
          symbols.map((s) => (
            <span key={s} className={`border px-1.5 py-0.5 font-mono text-[11px] ${toneClass}`}>
              {s}
            </span>
          ))
        )}
      </div>
    </div>
  )
}
