'use client'

import { useMemo, useState } from 'react'
import {
  Bell,
  CheckCheck,
  Activity,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Settings,
  Server,
} from 'lucide-react'
import { Panel } from './panel'
import { LiveStat } from './live-value'
import {
  getAlerts,
  getSystemHealth,
  getRecentErrors,
  getScanState,
  getExchangeCoverage,
  ALERT_KIND_META,
  type Alert,
  type AlertKind,
} from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const TONE: Record<string, string> = {
  up: 'var(--up)',
  down: 'var(--down)',
  warn: 'var(--sig-pump)',
  neon: 'var(--neon)',
  muted: 'var(--muted-foreground)',
}

type Tab = 'alerts' | 'health' | 'settings'

const TABS: [Tab, string][] = [
  ['alerts', '告警中心'],
  ['health', '系统健康'],
  ['settings', '设置中心'],
]

export function SystemCenter() {
  const [tab, setTab] = useState<Tab>('alerts')
  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-semibold transition-colors',
              tab === id
                ? 'text-neon'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
            {tab === id && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 bg-neon" />
            )}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tab === 'alerts' && <AlertCenter />}
        {tab === 'health' && <SystemHealth />}
        {tab === 'settings' && <SettingsCenter />}
      </div>
    </div>
  )
}

const ALERT_FILTERS: { id: AlertKind | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'triggered', label: '已触发' },
  { id: 'near', label: '接近触发' },
  { id: 'high_risk', label: '高风险' },
  { id: 'data', label: '数据异常' },
  { id: 'scan_fail', label: '扫描失败' },
  { id: 'review_due', label: '复盘到期' },
]

function AlertCenter() {
  const [alerts, setAlerts] = useState<Alert[]>(() => getAlerts())
  const [filter, setFilter] = useState<AlertKind | 'all'>('all')

  const unread = alerts.filter((a) => !a.read).length
  const rows = useMemo(
    () => (filter === 'all' ? alerts : alerts.filter((a) => a.kind === filter)),
    [alerts, filter],
  )

  const markAll = () => setAlerts((prev) => prev.map((a) => ({ ...a, read: true })))
  const toggle = (id: string) =>
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, read: !a.read } : a)),
    )

  return (
    <Panel
      title="告警中心"
      icon={Bell}
      subtitle="信号触发、风险升级、数据与扫描异常的统一告警流"
      right={
        <button
          onClick={markAll}
          className="flex items-center gap-1.5 border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-neon/40 hover:text-foreground"
        >
          <CheckCheck className="size-3.5" />
          全部已读
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-4 py-2.5">
        {ALERT_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'px-2.5 py-1 text-xs font-semibold transition-colors',
              filter === f.id
                ? 'bg-neon-soft text-neon'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {unread} 条未读
        </span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((a, i) => {
          const meta = ALERT_KIND_META[a.kind]
          const tone = TONE[meta.tone]
          return (
            <button
              key={a.id}
              onClick={() => toggle(a.id)}
              className={cn(
                'animate-float-up flex w-full gap-3 px-5 py-3.5 text-left transition-colors hover:bg-secondary/30',
                !a.read && 'bg-secondary/20',
              )}
              style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}
            >
              {a.read ? (
                <span
                  className="mt-1.5 size-2 shrink-0 rounded-full"
                  style={{ background: 'var(--border)' }}
                />
              ) : (
                <span className="relative mt-1.5 flex size-2 shrink-0">
                  <span
                    className="absolute inline-flex size-full animate-ping rounded-full opacity-70"
                    style={{ background: tone }}
                  />
                  <span
                    className="relative inline-flex size-2 rounded-full"
                    style={{ background: tone }}
                  />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      color: tone,
                      background: `color-mix(in oklch, ${tone} 14%, transparent)`,
                    }}
                  >
                    {meta.label}
                  </span>
                  {a.symbol && (
                    <span className="font-mono text-sm font-bold">
                      {a.symbol}
                    </span>
                  )}
                  <span
                    className={cn(
                      'text-sm font-semibold',
                      !a.read && 'text-foreground',
                    )}
                  >
                    {a.title}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                    {a.time}
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {a.body}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </Panel>
  )
}

const HEALTH_META = {
  healthy: { icon: CheckCircle2, tone: 'var(--up)', label: '正常' },
  degraded: { icon: AlertTriangle, tone: 'var(--sig-pump)', label: '降级' },
  down: { icon: XCircle, tone: 'var(--down)', label: '故障' },
}

function SystemHealth() {
  const services = getSystemHealth()
  const errors = getRecentErrors()
  const exchanges = getExchangeCoverage()
  const scan = getScanState()

  return (
    <div className="space-y-5">
      <Panel
        title="服务运行状态"
        icon={Server}
        subtitle="数据源、数据库、缓存、扫描集群与接口网关的实时健康度"
      >
        <div className="grid gap-px bg-border md:grid-cols-2">
          {services.map((s, i) => {
            const m = HEALTH_META[s.status]
            const Icon = m.icon
            return (
              <div
                key={s.name}
                className="animate-float-up bg-card px-5 py-4"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-2">
                  <span className="relative flex size-2">
                    {s.status !== 'down' && (
                      <span
                        className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
                        style={{ background: m.tone }}
                      />
                    )}
                    <span
                      className="relative inline-flex size-2 rounded-full"
                      style={{ background: m.tone }}
                    />
                  </span>
                  <Icon className="size-4" style={{ color: m.tone }} />
                  <span className="text-sm font-semibold">{s.name}</span>
                  <span
                    className="ml-auto font-mono text-xs font-semibold"
                    style={{ color: m.tone }}
                  >
                    {m.label}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between pl-6 text-xs text-muted-foreground">
                  <span>{s.detail}</span>
                  <span className="font-mono">
                    SLA{' '}
                    <LiveStat
                      base={s.uptime}
                      format={(n) => n.toFixed(2)}
                      volatility={0.0006}
                      intervalMs={5000}
                      min={90}
                      max={100}
                      flash={false}
                    />
                    %
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="交易所数据覆盖"
          icon={Activity}
          subtitle="各交易所行情接入状态与延迟"
        >
          <div className="divide-y divide-border">
            {exchanges.map((e, i) => {
              const m =
                e.status === 'online' ? HEALTH_META.healthy : HEALTH_META[e.status]
              return (
                <div
                  key={e.name}
                  className="animate-float-up flex items-center gap-3 px-5 py-2.5 text-sm"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <span className="relative flex size-2">
                    {e.status !== 'down' && (
                      <span
                        className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
                        style={{ background: m.tone }}
                      />
                    )}
                    <span
                      className="relative inline-flex size-2 rounded-full"
                      style={{ background: m.tone }}
                    />
                  </span>
                  <span className="font-semibold">{e.name}</span>
                  <span className="ml-auto flex items-center gap-1 font-mono text-xs text-muted-foreground">
                    {e.status === 'down' ? (
                      '— '
                    ) : e.latencyMs === null ? (
                      '待探针 · '
                    ) : (
                      <>
                        <LiveStat
                          base={e.latencyMs}
                          format={(n) => `${Math.round(n)}ms`}
                          volatility={0.08}
                          intervalMs={3600}
                          flash={false}
                        />
                        {' · '}
                      </>
                    )}
                    覆盖 {e.coverage}%
                  </span>
                </div>
              )
            })}
          </div>
        </Panel>

        <Panel title="近期系统事件" icon={AlertTriangle} tone="var(--sig-pump)">
          <div className="divide-y divide-border">
            {errors.map((e, i) => (
              <div
                key={i}
                className="animate-float-up flex gap-3 px-5 py-2.5 text-[13px]"
                style={{ animationDelay: `${i * 55}ms` }}
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {e.time}
                </span>
                <span
                  className="shrink-0 font-semibold uppercase"
                  style={{
                    color:
                      e.level === 'error' ? 'var(--down)' : 'var(--sig-pump)',
                  }}
                >
                  {e.level}
                </span>
                <span className="text-foreground">{e.msg}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            扫描调度：第 {scan.batch}/{scan.totalBatches} 批 · 下一批{' '}
            {scan.nextBatchSec}s 后触发 · 数据新鲜度 {scan.freshnessSec}s
          </div>
        </Panel>
      </div>
    </div>
  )
}

function SettingsCenter() {
  const [mode, setMode] = useState<'轻扫' | '深扫'>('深扫')
  const [freq, setFreq] = useState(15)
  const [toggles, setToggles] = useState({
    triggered: true,
    near: true,
    high_risk: true,
    data: false,
    review_due: true,
  })
  const [minScore, setMinScore] = useState(60)

  return (
    <div className="space-y-5">
      <Panel
        title="扫描偏好"
        icon={Settings}
        subtitle="控制扫描深度与频率，平衡覆盖率与资源消耗"
      >
        <div className="space-y-5 px-5 py-5">
          <div>
            <div className="mb-2 text-sm font-semibold">扫描模式</div>
            <div className="flex gap-2">
              {(['轻扫', '深扫'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'flex-1 border px-4 py-3 text-left transition-colors',
                    mode === m
                      ? 'border-neon/50 bg-neon-soft'
                      : 'border-border hover:border-neon/30',
                  )}
                >
                  <div
                    className={cn(
                      'text-sm font-bold',
                      mode === m ? 'text-neon' : 'text-foreground',
                    )}
                  >
                    {m}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {m === '轻扫'
                      ? '低频高覆盖，省资源'
                      : '高频深度，信号更敏锐'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold">扫描间隔</span>
              <span className="font-mono text-neon">{freq} 分钟 / 次</span>
            </div>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={freq}
              onChange={(e) => setFreq(+e.target.value)}
              className="w-full accent-[var(--neon)]"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold">最低信号评分阈值</span>
              <span className="font-mono text-neon">{minScore} 分</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={minScore}
              onChange={(e) => setMinScore(+e.target.value)}
              className="w-full accent-[var(--neon)]"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              低于该评分的候选信号将不进入推送与告警
            </p>
          </div>
        </div>
      </Panel>

      <Panel
        title="告警偏好"
        icon={Bell}
        subtitle="选择需要接收推送的告警类型"
      >
        <div className="divide-y divide-border">
          {(
            [
              ['triggered', '信号触发入场条件'],
              ['near', '接近触发提醒'],
              ['high_risk', '高风险/勿追提醒'],
              ['data', '数据异常与降级'],
              ['review_due', '复盘到期提醒'],
            ] as [keyof typeof toggles, string][]
          ).map(([key, label]) => (
            <div
              key={key}
              className="flex items-center justify-between px-5 py-3.5"
            >
              <span className="text-sm">{label}</span>
              <button
                onClick={() =>
                  setToggles((t) => ({ ...t, [key]: !t[key] }))
                }
                className={cn(
                  'relative h-6 w-11 rounded-full transition-colors',
                  toggles[key] ? 'bg-neon' : 'bg-secondary',
                )}
                aria-label={label}
              >
                <span
                  className={cn(
                    'absolute top-0.5 size-5 rounded-full bg-background transition-transform',
                    toggles[key] ? 'translate-x-[22px]' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
