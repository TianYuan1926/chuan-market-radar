import {
  CheckCircle2,
  XCircle,
  Crosshair,
  ShieldAlert,
  Target,
  ExternalLink,
  ClipboardList,
} from 'lucide-react'
import type { Token, TokenArchive } from '@/lib/frontend-market-types'
import { fmtUsd } from '@/lib/display-format'
import type { Resource } from '@/lib/data-status'
import type { TokenDossier } from '@/lib/radar-contract'
import { cn } from '@/lib/utils'

const DIR_TONE: Record<string, string> = {
  看多: 'var(--up)',
  看空: 'var(--down)',
  中性: 'var(--muted-foreground)',
}
const RISK_TONE: Record<string, string> = {
  低: 'var(--up)',
  中: 'var(--sig-pump)',
  高: 'var(--down)',
  极高: 'var(--down)',
}

function validLevel(value: number | undefined) {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : 0
}

export function dossierToArchive(
  dossier: Resource<TokenDossier> | undefined,
): TokenArchive | null {
  const data = dossier?.data
  if (!data) return null
  if (dossier?.status === 'empty' || data.evidence.length === 0) return null
  const mainStructure = data.structures.find((item) => item.tf === '4h') ?? data.structures[0]
  const support = validLevel(mainStructure?.support)
  const resistance = validLevel(mainStructure?.resistance)
  const invalidation = data.tradePlan
    ? Number(data.tradePlan.stop.match(/[\d.]+/)?.[0] ?? support)
    : support

  return {
    direction: data.direction,
    score: Math.max(0, Math.min(100, Math.round(data.evidence.reduce((sum, item) => sum + item.weight, 0)))),
    risk: data.riskGate.allowTradePlan ? '中' : '高',
    evidence: data.evidence.map((item) => ({
      label: item.label,
      weight: item.weight,
      detail: item.detail,
    })),
    counterEvidence: data.counter.map((item) => ({
      label: item.label,
      detail: item.detail,
    })),
    keyLevels: {
      support,
      resistance,
      invalidation,
      targets: data.tradePlan
        ? [data.tradePlan.tp1, data.tradePlan.tp2, data.tradePlan.tp3].map((value) =>
            Number(value.match(/[\d.]+/)?.[0] ?? resistance),
          )
        : resistance > 0 ? [resistance] : [],
    },
    invalidation:
      data.tradePlan?.invalidation ??
      (data.riskGate.reasons.join('；') || '后端暂未生成失效条件'),
    plan: {
      bias: data.tradePlan?.bias ?? '观望',
      entry: data.tradePlan?.entryCondition ?? '等待后端交易计划放行',
      stop: data.tradePlan?.stop ?? '未生成',
      targets: data.tradePlan
        ? `${data.tradePlan.tp1} / ${data.tradePlan.tp2} / ${data.tradePlan.tp3}`
        : '未生成',
      position: data.tradePlan?.scaleOut ?? '风控拦截时不生成仓位计划',
    },
  }
}

export function SignalArchive({
  token,
  dossier,
}: {
  token: Token
  dossier?: Resource<TokenDossier>
}) {
  const a = dossierToArchive(dossier)

  if (!a) {
    return (
      <section className="sheet mt-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
          <span className="h-3.5 w-1 bg-neon" />
          <Crosshair className="size-4 text-neon" />
          <h2 className="font-semibold">信号档案</h2>
          <span className="ml-auto text-xs text-muted-foreground">等待后端证据链</span>
        </div>
        <div className="px-6 py-8 text-center text-sm text-muted-foreground">
          当前标的没有完整后端信号档案。系统不会用模拟证据、模拟关键位或模拟交易计划补位。
        </div>
      </section>
    )
  }

  return (
    <section className="sheet mt-5">
      {/* 抬头：状态 / 方向 / 评分 / 风险 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        <span className="h-3.5 w-1 bg-neon" />
        <Crosshair className="size-4 text-neon" />
        <h2 className="font-semibold">信号档案</h2>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-70" />
            <span className="relative inline-flex size-1.5 rounded-full bg-up" />
          </span>
          信号活跃 · 持续追踪中
        </span>
      </div>

      {/* 概览四联 */}
      <div className="grid grid-cols-2 border-b border-border lg:grid-cols-4">
        <Overview label="当前信号状态" value="活跃" tone="var(--up)" border />
        <Overview
          label="方向倾向"
          value={a.direction}
          tone={DIR_TONE[a.direction]}
          border
        />
        <Overview label="信号评分" value={`${a.score}/100`} tone="var(--neon)" border />
        <Overview label="风险等级" value={a.risk} tone={RISK_TONE[a.risk]} />
      </div>

      <div className="grid lg:grid-cols-2">
        {/* 证据链 */}
        <div className="border-b border-border lg:border-b-0 lg:border-r">
          <SubHead icon={CheckCircle2} tone="var(--up)" title="证据链" />
          <ul className="divide-y divide-border/60">
            {a.evidence.map((e, i) => (
              <li key={e.label} className="px-6 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{e.label}</span>
                  <span className="ml-auto font-mono text-xs text-up">
                    权重 {e.weight}%
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden bg-secondary">
                  <div
                    className="relative h-full origin-left animate-bar-grow bg-up"
                    style={{
                      width: `${Math.min(e.weight * 2.6, 100)}%`,
                      animationDelay: `${i * 80}ms`,
                    }}
                  >
                    <span
                      className="absolute inset-y-0 w-1/3"
                      style={{
                        background:
                          'linear-gradient(90deg, transparent, color-mix(in oklch, white 45%, transparent), transparent)',
                        animation: 'bar-stream 2.4s linear infinite',
                      }}
                    />
                  </div>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {e.detail}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* 反证 + 失效条件 */}
        <div>
          <SubHead icon={XCircle} tone="var(--down)" title="反证 · 风险对照" />
          <ul className="divide-y divide-border/60">
            {a.counterEvidence.map((e) => (
              <li key={e.label} className="px-6 py-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-down">
                  <XCircle className="size-3.5" />
                  {e.label}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {e.detail}
                </p>
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-6 py-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <ShieldAlert className="size-4 text-[var(--sig-pump)]" />
              失效条件
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {a.invalidation}
            </p>
          </div>
        </div>
      </div>

      {/* 关键位 */}
      <div className="border-t border-border">
        <SubHead icon={Target} tone="var(--neon)" title="关键位" />
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
          <Level label="支撑位" value={a.keyLevels.support} tone="var(--up)" />
          <Level label="压力位" value={a.keyLevels.resistance} tone="var(--down)" />
          <Level label="失效位" value={a.keyLevels.invalidation} tone="var(--sig-pump)" />
          {a.keyLevels.targets.map((t, i) => (
            <Level key={i} label={`目标 T${i + 1}`} value={t} tone="var(--neon)" />
          ))}
        </div>
      </div>

      {/* 交易计划草案 */}
      <div className="border-t border-border">
        <SubHead icon={ClipboardList} tone="var(--neon)" title="交易计划草案" />
        <dl className="divide-y divide-border/60">
          <PlanRow label="操作倾向" value={a.plan.bias} />
          <PlanRow label="建议入场" value={a.plan.entry} />
          <PlanRow label="止损" value={a.plan.stop} tone="var(--down)" />
          <PlanRow label="目标位" value={a.plan.targets} tone="var(--up)" />
          <PlanRow label="仓位管理" value={a.plan.position} />
        </dl>
      </div>

      {/* TradingView 入口 */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-6 py-4">
        <a
          href={`https://www.tradingview.com/symbols/${token.symbol}USDT/`}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 bg-neon px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:shadow-[0_0_24px_var(--neon-soft)]"
        >
          在 TradingView 打开
          <ExternalLink className="size-4 transition-transform group-hover:translate-x-0.5" />
        </a>
        <span className="text-xs text-muted-foreground">
          交易计划来自后端结构化研究输出，仅供参考，不构成投资建议。
        </span>
      </div>
    </section>
  )
}

function Overview({
  label,
  value,
  tone,
  border,
}: {
  label: string
  value: string
  tone?: string
  border?: boolean
}) {
  return (
    <div
      className={cn(
        'px-6 py-4',
        border && 'border-b border-border sm:border-b-0 sm:border-r',
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className="mt-1 font-mono text-lg font-bold"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </div>
    </div>
  )
}

function SubHead({
  icon: Icon,
  title,
  tone,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  title: string
  tone: string
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-6 py-3">
      <Icon className="size-4" style={{ color: tone }} />
      <span className="font-semibold">{title}</span>
    </div>
  )
}

function Level({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: string
}) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-bold" style={{ color: tone }}>
        {value > 0 ? `$${fmtUsd(value)}` : '待补齐'}
      </div>
    </div>
  )
}

function PlanRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="flex gap-3 px-6 py-2.5">
      <dt className="w-20 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd
        className="flex-1 text-sm font-medium"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </dd>
    </div>
  )
}
