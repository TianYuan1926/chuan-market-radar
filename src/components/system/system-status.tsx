'use client'

import { Server, Database, GaugeCircle } from 'lucide-react'
import {
  type RadarContract,
} from '@/lib/radar-contract'
import { resource } from '@/lib/data-status'
import { Panel } from '@/components/panel'
import { FreshnessTag, StatusBadge, ResourceBoundary } from '@/components/data-state'
import { cn } from '@/lib/utils'

const NODE_TONE: Record<string, string> = {
  healthy: 'text-up',
  degraded: 'text-[oklch(0.8_0.15_75)]',
  down: 'text-down',
}
const NODE_LABEL: Record<string, string> = {
  healthy: '正常',
  degraded: '降级',
  down: '异常',
}

export function SystemStatus({ contract }: { contract?: RadarContract } = {}) {
  const services = contract?.serviceNodes ?? resource([], 'empty', { source: 'radar-contract', reason: '未传入后端服务契约' })
  const pipeline = contract?.dataPipeline ?? resource({
    lastScanAt: '等待数据',
    lastWriteAt: '等待数据',
    stale: true,
    cacheHit: false,
    recentError: null,
    recentSuccess: '等待后端数据管线状态',
  }, 'empty', { source: 'radar-contract', reason: '未传入后端数据管线契约' })
  const api = contract?.apiUsage ?? resource({
    provider: 'CoinGlass',
    usedToday: 0,
    remainingToday: 0,
    perMinuteLimit: 0,
    pacingMs: 0,
    throttled: false,
  }, 'empty', { source: 'radar-contract', reason: '未传入后端 API 用量契约' })
  const p = pipeline.data
  const a = api.data

  return (
    <div className="mt-5 space-y-5">
      {/* 服务健康 */}
      <Panel title="服务健康监控" icon={Server}>
        <div className="px-5 py-4">
          <div className="mb-3 flex items-center justify-end gap-2">
            <StatusBadge status={services.status} />
            <FreshnessTag ageSec={services.ageSec} source={services.source} />
          </div>
          <ResourceBoundary resource={services} isEmpty={(d) => d.length === 0}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(services.data ?? []).map((n, i) => (
              <div
                key={n.key}
                style={{ ['--i' as string]: i }}
                className="data-tile tile-in flex items-start gap-2.5 border border-border bg-secondary/20 p-3"
              >
                <span className="relative mt-1 flex size-2 shrink-0">
                  {n.status === 'healthy' && (
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-60" />
                  )}
                  <span
                    className={cn(
                      'relative inline-flex size-2 rounded-full',
                      n.status === 'healthy'
                        ? 'bg-up'
                        : n.status === 'degraded'
                          ? 'bg-[oklch(0.8_0.15_75)]'
                          : 'bg-down',
                    )}
                  />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{n.name}</span>
                    <span
                      className={cn(
                        'font-mono text-[10px] font-semibold',
                        NODE_TONE[n.status],
                      )}
                    >
                      {NODE_LABEL[n.status]}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{n.detail}</div>
                </div>
              </div>
            ))}
          </div>
          </ResourceBoundary>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 数据管线 */}
        <Panel title="数据管线状态" icon={Database}>
          <div className="px-5 py-4">
            <div className="mb-3 flex items-center justify-end gap-2">
              <StatusBadge status={pipeline.status} />
              <FreshnessTag ageSec={pipeline.ageSec} source={pipeline.source} />
            </div>
            <ResourceBoundary resource={pipeline}>
              <div className="space-y-2 text-sm">
                <Row label="最近扫描" value={p.lastScanAt} />
                <Row label="最近写入" value={p.lastWriteAt} />
                <Row
                  label="数据新鲜度"
                  value={p.stale ? '已过期' : '新鲜'}
                  tone={p.stale ? 'text-down' : 'text-up'}
                />
                <Row
                  label="缓存命中"
                  value={p.cacheHit ? '是' : '否'}
                  tone={p.cacheHit ? 'text-up' : 'text-muted-foreground'}
                />
                <div className="border-t border-border pt-2">
                  <div className="text-xs text-muted-foreground">最近成功</div>
                  <div className="mt-0.5 text-xs text-up">{p.recentSuccess}</div>
                </div>
                {p.recentError && (
                  <div>
                    <div className="text-xs text-muted-foreground">最近异常</div>
                    <div className="mt-0.5 text-xs text-down">{p.recentError}</div>
                  </div>
                )}
              </div>
            </ResourceBoundary>
          </div>
        </Panel>

        {/* CoinGlass API 用量 */}
        <Panel title="CoinGlass API 用量" icon={GaugeCircle}>
          <div className="px-5 py-4">
            <div className="mb-3 flex items-center justify-end gap-2">
              <StatusBadge status={api.status} />
              <FreshnessTag ageSec={api.ageSec} source={api.source} />
            </div>
            <ResourceBoundary resource={api}>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">今日调用</span>
                    <span className="font-mono">
                      {a.usedToday} / {a.usedToday + a.remainingToday}
                    </span>
                  </div>
                  <div className="bar-track mt-1.5 h-2 overflow-hidden bg-secondary">
                    <span
                      className="bar-fill block h-full bg-neon"
                      style={{
                        width: `${(a.usedToday / (a.usedToday + a.remainingToday)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <Row label="每分钟上限" value={`${a.perMinuteLimit} 次`} />
                <Row label="节流间隔 pacing" value={`${a.pacingMs} ms`} />
                <Row
                  label="是否限速"
                  value={a.throttled ? '限速中' : '正常'}
                  tone={a.throttled ? 'text-down' : 'text-up'}
                />
              </div>
            </ResourceBoundary>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-xs font-semibold', tone)}>{value}</span>
    </div>
  )
}
