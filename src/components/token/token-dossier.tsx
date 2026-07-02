'use client'

import {
  Layers,
  ShieldCheck,
  ShieldAlert,
  ScrollText,
  Bot,
  Lock,
  Check,
  X,
  Activity,
} from 'lucide-react'
import type { TokenDossier as TokenDossierData } from '@/lib/radar-contract'
import type { Resource } from '@/lib/data-status'
import { FreshnessTag, StatusBadge } from '@/components/data-state'
import { cn } from '@/lib/utils'

export function TokenDossier({
  dossier,
}: {
  symbol: string
  basePrice?: number
  dossier?: Resource<TokenDossierData>
}) {
  const res = dossier
  const d = res?.data
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
                  <span>支撑 {levelText(s.support)}</span>
                  <span className="text-right">压力 {levelText(s.resistance)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 发现层 / 主动成交 */}
      <div className="border-b border-border px-6 py-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="size-4 text-neon" />
          发现层 / 主动成交
        </h3>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <DiscoveryCell
            index={0}
            label="轻扫命中"
            value={d.discovery.foundInLightScan ? '已命中' : '未命中'}
            tone={d.discovery.foundInLightScan ? 'up' : 'muted'}
          />
          <DiscoveryCell
            index={1}
            label="阶段 / 提前分"
            value={`${phaseLabel(d.discovery.opportunityPhase)} / ${d.discovery.earlyOpportunityScore ?? '—'}`}
            tone={d.discovery.opportunityPhase === 'late_move' ? 'warn' : d.discovery.foundInLightScan ? 'neon' : 'muted'}
          />
          <DiscoveryCell
            index={2}
            label="买卖压力"
            value={`${pressureLabel(d.discovery.pressureSide)} · 盘口 ${pressureLabel(d.discovery.bookPressureSide)} · 主动买卖 ${d.discovery.flowImbalance ?? '—'}`}
            tone={d.discovery.pressureSide === 'buy' ? 'up' : d.discovery.pressureSide === 'sell' ? 'down' : 'muted'}
          />
          <DiscoveryCell
            index={3}
            label="延展风险"
            value={overextensionLabel(d.discovery.overextensionRisk)}
            tone={d.discovery.overextensionRisk === 'high' ? 'warn' : d.discovery.overextensionRisk === 'low' ? 'up' : 'muted'}
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {d.discovery.summary}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {d.discovery.decisionBoundary}
        </p>
        {d.discovery.reasons.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {d.discovery.reasons.slice(0, 8).map((reason) => (
              <span key={reason} className="border border-border bg-secondary/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {displayEngineText(reason)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 策略就绪判断 */}
      <div className="border-b border-border px-6 py-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {d.strategyReadiness.canTradeNow ? (
            <ShieldCheck className="size-4 text-up" />
          ) : (
            <Lock className="size-4 text-down" />
          )}
          策略就绪判断
          <span
            className={cn(
              'ml-auto border px-1.5 py-0.5 font-mono text-[10px]',
              d.strategyReadiness.status === 'ready'
                ? 'border-up/40 bg-up/10 text-up'
                : d.strategyReadiness.status === 'review_only'
                  ? 'border-[oklch(0.8_0.15_75)]/40 bg-[oklch(0.8_0.15_75)]/10 text-[oklch(0.82_0.15_75)]'
                  : 'border-down/40 bg-down/10 text-down',
            )}
          >
            {strategyStatusLabel(d.strategyReadiness.status)}
          </span>
        </h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="border border-border bg-secondary/20 p-3">
            <div className="text-xs font-semibold">
              {d.strategyReadiness.canTradeNow ? '当前可进入人工计划复核' : '当前不能交易'}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {d.strategyReadiness.summary}
            </p>
            <p className="mt-2 border-l-2 border-border pl-3 text-[11px] leading-relaxed text-muted-foreground">
              下一步：{d.strategyReadiness.nextAction}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="border border-border bg-secondary/20 p-3">
              <div className="text-xs font-semibold">还缺什么</div>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {(d.strategyReadiness.missingPieces.length > 0 ? d.strategyReadiness.missingPieces : ['无缺失，等待人工复核']).slice(0, 6).map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 bg-down" />
                    <span>{displayEngineText(item)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-border bg-secondary/20 p-3">
              <div className="text-xs font-semibold">个人仓位镜头</div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {d.strategyReadiness.personalLens}
              </p>
              <p className="mt-2 text-[10px] text-muted-foreground">
                仓位镜头状态：{positionLensStatusLabel(d.strategyReadiness.positionLensStatus)}
              </p>
              <ul className="mt-2 space-y-1 text-[10px] leading-relaxed text-muted-foreground">
                {d.strategyReadiness.guardrails.slice(0, 3).map((item) => (
                  <li key={item}>· {displayEngineText(item)}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="border border-border bg-secondary/20 p-3">
            <div className="text-xs font-semibold">执行地图</div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <div className="text-[10px] text-muted-foreground">方向读取</div>
                <div className="mt-1 font-mono text-[11px] font-semibold">
                  {executionDirectionLabel(d.strategyReadiness.executionMap.directionRead)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">可交易性</div>
                <div className="mt-1 font-mono text-[11px] font-semibold">
                  {tradabilityLabel(d.strategyReadiness.executionMap.tradabilityRead)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">位置质量</div>
                <div className="mt-1 font-mono text-[11px] font-semibold">
                  {positionQualityLabel(d.strategyReadiness.executionMap.positionQuality)}
                </div>
              </div>
            </div>
            <p className="mt-3 border-l-2 border-border pl-3 text-[11px] leading-relaxed text-muted-foreground">
              {d.strategyReadiness.executionMap.chartBoundary}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="border border-border bg-secondary/20 p-3">
              <div className="text-xs font-semibold">等待什么</div>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {d.strategyReadiness.executionMap.waitFor.slice(0, 5).map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check className="mt-0.5 size-3 shrink-0 text-up" />
                    <span>{displayEngineText(item)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-border bg-secondary/20 p-3">
              <div className="text-xs font-semibold">哪里错就撤</div>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {d.strategyReadiness.executionMap.invalidIf.slice(0, 5).map((item) => (
                  <li key={item} className="flex gap-2">
                    <X className="mt-0.5 size-3 shrink-0 text-down" />
                    <span>{displayEngineText(item)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 分层分析报告 */}
      {d.reportSections.length > 0 && (
        <div className="border-b border-border px-6 py-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ScrollText className="size-4 text-neon" />
            分析报告分层
          </h3>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {d.reportSections.map((section, i) => (
              <div
                key={section.key}
                style={{ ['--i' as string]: i }}
                className="data-tile tile-in border border-border bg-secondary/20 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold">{section.title}</div>
                  <span
                    className={cn(
                      'border px-1.5 py-0.5 font-mono text-[10px]',
                      section.status === 'ready'
                        ? 'border-up/40 bg-up/10 text-up'
                        : section.status === 'blocked'
                          ? 'border-down/40 bg-down/10 text-down'
                          : 'border-border bg-muted/40 text-muted-foreground',
                    )}
                  >
                    {sectionStatusLabel(section.status)}
                  </span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {section.items.slice(0, 8).map((item) => (
                    <li key={`${section.key}-${item.label}-${item.sourceId}`} className="text-xs leading-relaxed">
                      <span className="font-semibold">{item.label}：</span>
                      <span className="text-muted-foreground">{displayEngineText(item.detail)}</span>
                      {item.sourceId && (
                        <span className="ml-1 text-[10px] text-muted-foreground/70" title={item.sourceId}>
                          [后端证据链]
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

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
                      {displayEngineText(e.detail)}
                    </div>
                    {e.sourceId && (
                      <div className="mt-1 text-[10px] text-muted-foreground/70" title={e.sourceId}>
                        来源：后端证据链
                      </div>
                    )}
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
                    {displayEngineText(c.detail)}
                  </div>
                  {c.sourceId && (
                    <div className="mt-1 text-[10px] text-muted-foreground/70" title={c.sourceId}>
                      来源：后端证据链
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 风控门禁 */}
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center gap-2">
          {d.riskGate.allowTradePlan ? (
            <span className="inline-flex items-center gap-1.5 bg-up/15 px-2 py-1 text-xs font-semibold text-up">
              <Check className="size-3.5" />
              风控门禁放行 · 允许生成交易计划
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 bg-down/15 px-2 py-1 text-xs font-semibold text-down">
              <Lock className="size-3.5" />
              风控门禁拦截 · 不可交易
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
                {displayEngineText(r)}
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
            <PlanCell index={1} label="结构盈亏比" value={`${d.tradePlan.rr.toFixed(1)}:1`} highlight />
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

      {/* 规则反证复核 */}
      <div className="px-6 py-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Bot className="size-4 text-neon" />
          规则反证复核
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

function levelText(value: number) {
  return Number.isFinite(value) && value > 0 ? String(value) : '待补齐'
}

function phaseLabel(value: TokenDossierData['discovery']['opportunityPhase']) {
  if (value === 'early_setup') return '启动前'
  if (value === 'breakout_watch') return '突破观察'
  if (value === 'late_move') return '已晚到'
  if (value === 'neutral_watch') return '中性观察'
  return '等待'
}

function displayEngineText(value: string) {
  const replacements: Array<[RegExp, string]> = [
    [/\bRR\b/g, '结构盈亏比'],
    [/Risk Gate/g, '风控门禁'],
    [/Evidence/g, '证据融合'],
    [/TradePlan/g, '交易计划'],
    [/tradePlan/g, '交易计划'],
    [/CVD proxy/g, '主动买卖代理'],
    [/\bCVD\b/g, '主动买卖'],
    [/REVIEW_ONLY/g, '只复盘'],
    [/WAIT_PULLBACK/g, '等待回踩'],
    [/WAIT_RETEST/g, '等待反抽'],
    [/WATCH_ONLY/g, '仅观察'],
    [/READY_LONG/g, '多头计划就绪'],
    [/READY_SHORT/g, '空头计划就绪'],
    [/BLOCKED/g, '已拦截'],
  ]

  return replacements.reduce((text, [pattern, next]) => text.replace(pattern, next), value)
}

function pressureLabel(value: TokenDossierData['discovery']['pressureSide']) {
  if (value === 'buy') return '主动买压'
  if (value === 'sell') return '主动卖压'
  if (value === 'neutral') return '买卖均衡'
  return '未确认'
}

function overextensionLabel(value: TokenDossierData['discovery']['overextensionRisk']) {
  if (value === 'high') return '高 · 只复盘/等回踩'
  if (value === 'medium') return '中 · 必须等确认'
  if (value === 'low') return '低'
  return '等待'
}

function executionDirectionLabel(value: TokenDossierData['strategyReadiness']['executionMap']['directionRead']) {
  if (value === 'bullish') return '偏多'
  if (value === 'bearish') return '偏空'
  return '中性'
}

function tradabilityLabel(value: TokenDossierData['strategyReadiness']['executionMap']['tradabilityRead']) {
  if (value === 'trade_plan_ready') return '计划就绪'
  if (value === 'wait_confirmation') return '等确认'
  if (value === 'wait_pullback_or_retest') return '等回踩/反抽'
  if (value === 'review_only') return '只复盘'
  return '被拦截'
}

function positionQualityLabel(value: TokenDossierData['strategyReadiness']['executionMap']['positionQuality']) {
  if (value === 'good') return '位置可评估'
  if (value === 'waiting') return '等待更好位置'
  if (value === 'late') return '已晚到'
  return '未知'
}

function strategyStatusLabel(value: TokenDossierData['strategyReadiness']['status']) {
  if (value === 'ready') return '计划就绪'
  if (value === 'watch') return '观察中'
  if (value === 'review_only') return '只复盘'
  return '被拦截'
}

function sectionStatusLabel(value: TokenDossierData['reportSections'][number]['status']) {
  if (value === 'ready') return '完整'
  if (value === 'partial') return '部分'
  if (value === 'blocked') return '拦截'
  return '暂无'
}

function positionLensStatusLabel(value: TokenDossierData['strategyReadiness']['positionLensStatus']) {
  if (value === 'ready') return '已可换算'
  if (value === 'waiting_leverage') return '等待杠杆信息'
  if (value === 'waiting_equity') return '等待资金信息'
  if (value === 'waiting_price') return '等待价格信息'
  return '不适用'
}

function DiscoveryCell({
  index = 0,
  label,
  tone = 'muted',
  value,
}: {
  index?: number
  label: string
  tone?: 'up' | 'down' | 'neon' | 'warn' | 'muted'
  value: string
}) {
  const toneClass = {
    down: 'text-down',
    muted: 'text-muted-foreground',
    neon: 'text-neon',
    up: 'text-up',
    warn: 'text-[oklch(0.82_0.15_75)]',
  }[tone]

  return (
    <div
      style={{ ['--i' as string]: index }}
      className="data-tile tile-in border border-border bg-secondary/20 px-3 py-2.5"
    >
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('mt-1 break-words font-mono text-xs font-semibold leading-snug', toneClass)}>{value}</div>
    </div>
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
