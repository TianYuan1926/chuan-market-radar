'use client'

import { useMemo } from 'react'
import {
  Layers,
  ShieldCheck,
  ShieldAlert,
  ScrollText,
  Bot,
  Lock,
  Check,
  X,
} from 'lucide-react'
import { getTokenDossier, type TokenDossier as TokenDossierData } from '@/lib/radar-contract'
import type { Resource } from '@/lib/data-status'
import { FreshnessTag, StatusBadge } from '@/components/data-state'
import { cn } from '@/lib/utils'

export function TokenDossier({
  symbol,
  basePrice = 1,
  dossier,
}: {
  symbol: string
  basePrice?: number
  dossier?: Resource<TokenDossierData>
}) {
  const fallback = useMemo(() => getTokenDossier(symbol, basePrice), [symbol, basePrice])
  const res = dossier ?? fallback
  const d = res.data
  if (!d) return null

  const dirTone =
    d.direction === '看多'
      ? 'text-up'
      : d.direction === '看空'
        ? 'text-down'
        : 'text-muted-foreground'

  return (
    <section className="sheet mt-5">
      {/* 抬头 */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3.5">
        <span className="h-3.5 w-1 bg-neon" />
        <span className="font-semibold">判定档案</span>
        <span className={cn('font-mono text-sm font-semibold', dirTone)}>
          {d.direction}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <StatusBadge status={res.status} />
          <FreshnessTag ageSec={res.ageSec} source={res.source} />
        </span>
      </header>

      {/* 多周期结构 */}
      <div className="border-b border-border px-6 py-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="size-4 text-neon" />
          多周期结构
        </h3>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {d.structures.map((s, i) => {
            const tone =
              s.trend === '多'
                ? 'text-up'
                : s.trend === '空'
                  ? 'text-down'
                  : 'text-muted-foreground'
            return (
              <div
                key={s.tf}
                style={{ ['--i' as string]: i }}
                className="data-tile tile-in border border-border bg-secondary/20 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold uppercase">
                    {s.tf}
                  </span>
                  <span className={cn('font-mono text-xs font-semibold', tone)}>
                    {s.trend}
                  </span>
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground">{s.phase}</div>
                <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-[11px] text-muted-foreground">
                  <span>支撑 {s.support}</span>
                  <span className="text-right">压力 {s.resistance}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 证据链 + 反证链 */}
      <div className="grid border-b border-border lg:grid-cols-2">
        <div className="border-b border-border px-6 py-5 lg:border-b-0 lg:border-r">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-up" />
            证据链
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              权重合计 {d.evidence.reduce((a, e) => a + e.weight, 0)}
            </span>
          </h3>
          <ul className="mt-3 space-y-2.5">
            {d.evidence.map((e, i) => {
              const maxW = Math.max(...d.evidence.map((x) => x.weight), 1)
              return (
                <li
                  key={i}
                  style={{ ['--i' as string]: i }}
                  className="tile-in flex items-start gap-2.5"
                >
                  <span className="mt-0.5 grid min-w-9 place-items-center bg-up/15 px-1 py-0.5 font-mono text-[11px] font-semibold text-up">
                    {e.weight}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">{e.label}</div>
                    <div className="text-xs leading-relaxed text-muted-foreground">
                      {e.detail}
                    </div>
                    {/* 权重占比条：入场增长 */}
                    <div className="mt-1.5 h-1 overflow-hidden bg-secondary">
                      <span
                        className="bar-fill block h-full bg-up/60"
                        style={{ width: `${(e.weight / maxW) * 100}%` }}
                      />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="px-6 py-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="size-4 text-down" />
            反证链
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {d.counter.length} 项
            </span>
          </h3>
          <ul className="mt-3 space-y-2.5">
            {d.counter.map((c, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 size-1.5 shrink-0 translate-y-1.5 rounded-full bg-down" />
                <div>
                  <div className="text-xs font-semibold text-down">{c.label}</div>
                  <div className="text-xs leading-relaxed text-muted-foreground">
                    {c.detail}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Risk Gate */}
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center gap-2">
          {d.riskGate.allowTradePlan ? (
            <span className="inline-flex items-center gap-1.5 bg-up/15 px-2 py-1 text-xs font-semibold text-up">
              <Check className="size-3.5" />
              风控放行 · 允许生成交易计划
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 bg-down/15 px-2 py-1 text-xs font-semibold text-down">
              <Lock className="size-3.5" />
              风控拦截 · 不可交易
            </span>
          )}
        </div>
        {!d.riskGate.allowTradePlan && d.riskGate.reasons.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {d.riskGate.reasons.map((r, i) => (
              <li
                key={i}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <X className="size-3.5 text-down" />
                {r}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 交易计划（被拦截时不展示，给出占位说明） */}
      <div className="border-b border-border px-6 py-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ScrollText className="size-4 text-neon" />
          交易计划
        </h3>
        {d.tradePlan ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <PlanCell index={0} label="方向" value={d.tradePlan.bias} />
            <PlanCell index={1} label="盈亏比 RR" value={d.tradePlan.rr.toFixed(1)} highlight />
            <PlanCell index={2} label="是否允许追单" value={d.tradePlan.allowChase ? '允许' : '禁止'} />
            <PlanCell index={3} label="入场条件" value={d.tradePlan.entryCondition} wide />
            <PlanCell index={4} label="止损" value={d.tradePlan.stop} />
            <PlanCell index={5} label="TP1 / TP2 / TP3" value={`${d.tradePlan.tp1} / ${d.tradePlan.tp2} / ${d.tradePlan.tp3}`} />
            <PlanCell index={6} label="分批止盈" value={d.tradePlan.scaleOut} wide />
            <PlanCell index={7} label="失效条件" value={d.tradePlan.invalidation} wide />
          </div>
        ) : (
          <div className="mt-3 border border-dashed border-down/40 bg-down/5 px-4 py-4 text-xs leading-relaxed text-muted-foreground">
            当前信号被风控拦截，未生成交易计划。待拦截原因解除后，后端将下发完整入场 / 止损 / 目标 / 仓位方案。
          </div>
        )}
      </div>

      {/* AI 复核 */}
      <div className="px-6 py-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Bot className="size-4 text-neon" />
          AI 复核
          {d.aiReview.suggestDowngrade && (
            <span className="bg-down/15 px-1.5 py-0.5 text-[10px] font-semibold text-down">
              建议降级
            </span>
          )}
        </h3>
        <ul className="mt-3 space-y-1.5">
          {d.aiReview.findings.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-neon" />
              {f}
            </li>
          ))}
        </ul>
        <p className="mt-3 border-l-2 border-border pl-3 text-[11px] italic leading-relaxed text-muted-foreground">
          {d.aiReview.note}
        </p>
      </div>
    </section>
  )
}

function PlanCell({
  label,
  value,
  highlight,
  wide,
  index = 0,
}: {
  label: string
  value: string
  highlight?: boolean
  wide?: boolean
  index?: number
}) {
  return (
    <div
      style={{ ['--i' as string]: index }}
      className={cn(
        'data-tile tile-in border border-border bg-secondary/20 px-3 py-2.5',
        wide && 'sm:col-span-2 lg:col-span-3',
      )}
    >
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-1 font-mono text-sm font-semibold',
          highlight && 'text-neon',
        )}
      >
        {value}
      </div>
    </div>
  )
}
