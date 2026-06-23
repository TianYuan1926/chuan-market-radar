'use client'

import { SiteNav } from '@/components/site-nav'
import { SessionBar } from '@/components/session-bar'
import { Panel, PageHeader } from '@/components/panel'
import { MarketMacroDerivatives } from '@/components/market/macro-derivatives'
import { LiveValue, LiveStat } from '@/components/live-value'
import { useLiveNumber } from '@/lib/use-live-number'
import type { Token } from '@/lib/frontend-market-types'
import { fmtCap } from '@/lib/display-format'
import {
  derivativesResourceToCoinglassData,
  macroResourceToMarketEnv,
  scanProofResourceToDataQuality,
} from '@/lib/frontend-display-adapters'
import type { RadarContract } from '@/lib/radar-contract'
import {
  Globe,
  Database,
  Gauge,
  Bitcoin,
  Wind,
  AlertTriangle,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function MarketPageClient({
  radar,
  tokens,
}: {
  radar: RadarContract
  tokens: Token[]
}) {
  const env = macroResourceToMarketEnv(radar.macroAltEnv, radar.derivatives, tokens)
  const dq = scanProofResourceToDataQuality(radar.scanProof, radar.dataSources)
  const cg = derivativesResourceToCoinglassData(radar.derivatives, radar.apiUsage, tokens)

  const regimeTone =
    env.regime === '顺风'
      ? 'var(--up)'
      : env.regime === '逆风'
        ? 'var(--down)'
        : 'var(--sig-pump)'

  return (
    <div className="min-h-dvh bg-background">
      <SiteNav />
      <SessionBar tokens={tokens} />

      <main className="mx-auto max-w-[1560px] space-y-5 px-4 py-5 sm:px-6">
        <PageHeader
          title="大盘环境与数据面板"
          desc="判断风向、监控数据质量、追踪衍生品拥挤度——决定何时该出手、何时该收手"
        />

        {/* 大盘环境总览条 */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <BigStat
            label="市场风向"
            value={env.regime}
            tone={regimeTone}
            sub={`杠杆拥挤 ${env.leverageCrowding}/100`}
            icon={Wind}
          />
          <BigStat
            label="山寨强弱"
            value={`${env.altStrength}`}
            liveBase={env.altStrength}
            suffix="/100"
            tone={env.altStrength >= 50 ? 'var(--up)' : 'var(--down)'}
            sub={env.altStrength >= 60 ? '山寨季倾向' : '资金偏防御'}
            icon={Activity}
          />
          <BigStat
            label="去杠杆风险"
            value={env.deleverageRisk}
            tone={
              env.deleverageRisk === '高'
                ? 'var(--down)'
                : env.deleverageRisk === '中'
                  ? 'var(--sig-pump)'
                  : 'var(--up)'
            }
            sub="衍生品拥挤监控"
            icon={AlertTriangle}
          />
          <BigStat
            label="山寨温度"
            value={`${env.fearGreed}`}
            liveBase={env.fearGreed}
            tone={env.fearGreed >= 60 ? 'var(--up)' : 'var(--down)'}
            sub={`由宏观合同推导 · ${env.session}`}
            icon={Gauge}
          />
        </div>

        {/* 后端承载位：宏观山寨环境 + CoinGlass 衍生品状态（不含清算热力图） */}
        <MarketMacroDerivatives contract={radar} />

        <div className="grid gap-5 lg:grid-cols-2">
          {/* 大盘环境 */}
          <Panel title="大盘环境" icon={Globe}>
            <div className="grid grid-cols-2 gap-px bg-border">
              <CoinState
                name="BTC"
                price={env.btc.price}
                change={env.btc.change}
                state={env.btc.state}
                icon={Bitcoin}
              />
              <CoinState
                name="ETH"
                price={env.eth.price}
                change={env.eth.change}
                state={env.eth.state}
              />
            </div>
            <div className="space-y-4 px-5 py-4">
              <Meter label="山寨市场强弱" value={env.altStrength} />
              <Meter label="杠杆拥挤度" value={env.leverageCrowding} danger />
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">综合判定</span>
                <span
                  className="px-2 py-0.5 font-semibold"
                  style={{
                    color: regimeTone,
                    background: `color-mix(in oklch, ${regimeTone} 14%, transparent)`,
                  }}
                >
                  {env.regime} · 适度参与
                </span>
              </div>
            </div>
          </Panel>

          {/* CoinGlass */}
          <Panel
            title="CoinGlass 衍生品数据"
            icon={Activity}
            right={
              <span className="font-mono text-xs text-muted-foreground">
                额度 {cg.apiQuotaUsed}/{cg.apiQuotaTotal}
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-px bg-border">
              <LiveDataCell
                label="OI 持仓变化"
                base={cg.oiChange}
                format={(n) => `${n > 0 ? '+' : ''}${n.toFixed(2)}%`}
                tone="var(--up)"
                volatility={0.04}
              />
              <LiveDataCell
                label="资金费率"
                base={cg.funding}
                format={(n) => `${n > 0 ? '+' : ''}${n.toFixed(4)}%`}
                tone={cg.funding > 0 ? 'var(--up)' : 'var(--down)'}
                volatility={0.05}
              />
              <LiveDataCell
                label="多空比"
                base={cg.longShortRatio}
                format={(n) => n.toFixed(2)}
                tone="var(--up)"
                volatility={0.02}
              />
              <LiveDataCell
                label="主动买卖比"
                base={cg.takerBuySell}
                format={(n) => n.toFixed(2)}
                tone="var(--up)"
                volatility={0.02}
              />
              <DataCell label="合约成交量" value={`$${fmtCap(cg.futVolume)}`} />
              <DataCell
                label="衍生品拥挤"
                value={cg.crowding}
                tone={cg.crowding === '高' ? 'var(--down)' : 'var(--up)'}
              />
            </div>
            <div className="border-t border-border px-5 py-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">接口额度使用</span>
                <span className="font-mono">
                  {Math.round((cg.apiQuotaUsed / cg.apiQuotaTotal) * 100)}%
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden bg-secondary">
                <div
                  className="relative h-full origin-left animate-bar-grow bg-neon"
                  style={{ width: `${(cg.apiQuotaUsed / cg.apiQuotaTotal) * 100}%` }}
                >
                  <span
                    className="absolute inset-y-0 w-1/3"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent, color-mix(in oklch, white 45%, transparent), transparent)',
                      animation: 'bar-stream 2.2s linear infinite',
                    }}
                  />
                </div>
              </div>
            </div>
          </Panel>
        </div>

        {/* 数据质量面板 */}
        <Panel
          title="数据质量面板"
          icon={Database}
          right={
            <span
              className={cn(
                'px-2 py-0.5 text-xs font-semibold',
                dq.degraded ? 'bg-down/15 text-down' : 'bg-up/15 text-up',
              )}
            >
              {dq.degraded ? '降级运行' : '正常运行'}
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
            <LiveCountCell label="原始数据" base={dq.raw} volatility={0.015} />
            <LiveCountCell label="清洗后数据" base={dq.cleaned} tone="var(--up)" volatility={0.015} />
            <LiveCountCell label="重复币种处理" base={dq.duplicates} volatility={0.03} />
            <LiveCountCell label="被过滤数据" base={dq.filtered} volatility={0.03} />
            <LiveCountCell label="数据缺失" base={dq.missing} tone="var(--sig-pump)" volatility={0.05} />
            <LiveCountCell label="数据延迟" base={dq.delayMs} suffix="ms" tone="var(--sig-pump)" volatility={0.08} />
            <DataCell
              label="降级状态"
              value={dq.degraded ? '是' : '否'}
              tone={dq.degraded ? 'var(--down)' : 'var(--up)'}
            />
            <LiveDataCell
              label="数据可信度"
              base={dq.trust}
              format={(n) => `${n.toFixed(1)}%`}
              tone="var(--neon)"
              volatility={0.006}
            />
          </div>
        </Panel>

        <p className="text-center text-xs text-muted-foreground">
          后端契约数据仅供市场研究与系统校准，不构成投资建议
        </p>
      </main>
    </div>
  )
}

function BigStat({
  label,
  value,
  liveBase,
  suffix,
  tone,
  sub,
  icon: Icon,
}: {
  label: string
  value: string
  liveBase?: number
  suffix?: string
  tone: string
  sub: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="hover-lift border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-muted-foreground">{label}</span>
        <span
          className="grid size-7 place-items-center"
          style={{ background: `color-mix(in oklch, ${tone} 14%, transparent)`, color: tone }}
        >
          <Icon className="size-3.5" />
        </span>
      </div>
      <div className="mt-2 font-mono text-2xl font-bold" style={{ color: tone }}>
        {typeof liveBase === 'number' ? (
          <LiveStat
            base={liveBase}
            format={(n) => `${Math.round(n)}`}
            volatility={0.02}
            min={0}
            max={100}
          />
        ) : (
          value
        )}
        {suffix && <span className="text-base text-muted-foreground">{suffix}</span>}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full" style={{ background: tone }} />
        {sub}
      </div>
    </div>
  )
}

function CoinState({
  name,
  price,
  change,
  state,
  icon: Icon,
}: {
  name: string
  price: number
  change: number
  state: string
  icon?: React.ComponentType<{ className?: string }>
}) {
  const up = change >= 0
  const livePrice = useLiveNumber(price, {
    volatility: 0.0012,
    intervalMs: 2000,
    drift: true,
  })
  return (
    <div className="bg-card px-5 py-4">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        {Icon && <Icon className="size-4 text-[var(--sig-pump)]" />}
        {name}
        <span
          className="ml-auto px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            color: state === '强势' ? 'var(--up)' : state === '弱势' ? 'var(--down)' : 'var(--sig-pump)',
            background: `color-mix(in oklch, ${state === '强势' ? 'var(--up)' : state === '弱势' ? 'var(--down)' : 'var(--sig-pump)'} 14%, transparent)`,
          }}
        >
          {state}
        </span>
      </div>
      <LiveValue
        value={livePrice}
        format={(n) =>
          `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        }
        className="mt-2 block font-mono text-xl font-bold"
      />
      <div className={cn('font-mono text-sm', up ? 'text-up' : 'text-down')}>
        {up ? '+' : ''}
        {change}%
      </div>
    </div>
  )
}

function DataCell({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="bg-card px-5 py-4">
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

// 实时计数格：整数计数随推送跳动（用于数据质量面板）
function LiveCountCell({
  label,
  base,
  tone,
  suffix = '',
  volatility = 0.01,
}: {
  label: string
  base: number
  tone?: string
  suffix?: string
  volatility?: number
}) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <span
        className="mt-1 block font-mono text-lg font-bold"
        style={tone ? { color: tone } : undefined}
      >
        <LiveStat
          base={base}
          format={(n) => `${Math.round(n).toLocaleString('en-US')}${suffix}`}
          volatility={volatility}
          flash={false}
          drift
        />
      </span>
    </div>
  )
}

// 实时数据格：数值随推送跳动并闪烁
function LiveDataCell({
  label,
  base,
  format,
  tone,
  volatility = 0.02,
}: {
  label: string
  base: number
  format: (n: number) => string
  tone?: string
  volatility?: number
}) {
  const v = useLiveNumber(base, { volatility, intervalMs: 2400, drift: true })
  return (
    <div className="bg-card px-5 py-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <span
        className="mt-1 block font-mono text-lg font-bold"
        style={tone ? { color: tone } : undefined}
      >
        <LiveValue value={v} format={format} />
      </span>
    </div>
  )
}

function Meter({
  label,
  value,
  danger,
}: {
  label: string
  value: number
  danger?: boolean
}) {
  const live = useLiveNumber(value, {
    volatility: 0.02,
    intervalMs: 4200,
    min: 0,
    max: 100,
  })
  const display = Math.round(live)
  const tone = danger
    ? display > 70
      ? 'var(--down)'
      : 'var(--sig-pump)'
    : display > 55
      ? 'var(--up)'
      : 'var(--sig-pump)'
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <LiveValue
          value={live}
          format={(n) => `${Math.round(n)}/100`}
          flash={false}
          className="font-mono font-semibold"
        />
      </div>
      <div className="mt-1.5 h-2 overflow-hidden bg-secondary">
        <div
          className="relative h-full origin-left animate-bar-grow transition-all duration-700"
          style={{ width: `${display}%`, background: tone }}
        >
          {/* 流动高光，强化"实时数据"观感 */}
          <span
            className="absolute inset-y-0 w-1/3"
            style={{
              background:
                'linear-gradient(90deg, transparent, color-mix(in oklch, white 45%, transparent), transparent)',
              animation: 'bar-stream 2.2s linear infinite',
            }}
          />
        </div>
      </div>
    </div>
  )
}
