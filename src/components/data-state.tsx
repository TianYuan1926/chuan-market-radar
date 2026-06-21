'use client'

import { cn } from '@/lib/utils'
import { DATA_STATUS_META, type DataStatus, type Resource } from '@/lib/data-status'
import { AlertTriangle, Loader2, Inbox, WifiOff, RefreshCw } from 'lucide-react'

// 不同 tone 对应的配色（沿用全站语义令牌）
const TONE_CLASS: Record<string, string> = {
  live: 'text-up border-up/40 bg-up/10',
  neon: 'text-neon border-neon/40 bg-neon/10',
  warn: 'text-[oklch(0.8_0.15_75)] border-[oklch(0.8_0.15_75)]/40 bg-[oklch(0.8_0.15_75)]/10',
  down: 'text-down border-down/40 bg-down/10',
  muted: 'text-muted-foreground border-border bg-muted/40',
}

// ── 状态徽章：live / cached / stale / partial / failed 等 ──
export function StatusBadge({
  status,
  className,
  showDot = true,
}: {
  status: DataStatus
  className?: string
  showDot?: boolean
}) {
  const meta = DATA_STATUS_META[status]
  const tone = TONE_CLASS[meta.tone] ?? TONE_CLASS.muted
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider',
        tone,
        className,
      )}
      title={`数据状态：${meta.label}`}
    >
      {showDot && (
        <span className="relative flex size-1.5">
          {meta.pulse && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-70" />
          )}
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {meta.label}
    </span>
  )
}

// ── 数据新鲜度标签：更新于 / 数据年龄 ──
export function FreshnessTag({
  updatedAt,
  ageSec,
  source,
  className,
}: {
  updatedAt?: string
  ageSec?: number
  source?: string
  className?: string
}) {
  const age =
    typeof ageSec === 'number'
      ? ageSec < 60
        ? `${ageSec}s 前`
        : ageSec < 3600
          ? `${Math.floor(ageSec / 60)}m 前`
          : `${Math.floor(ageSec / 3600)}h 前`
      : null
  return (
    <span className={cn('font-mono text-[10px] text-muted-foreground', className)}>
      {source && <span className="uppercase">{source}</span>}
      {source && (age || updatedAt) && ' · '}
      {age ?? (updatedAt ? `更新于 ${updatedAt}` : '—')}
    </span>
  )
}

// ── 数据占位块：loading / error / empty / failed ──
export function DataStateBlock({
  status,
  onRetry,
  reason,
  emptyText = '暂无数据',
  className,
}: {
  status: 'loading' | 'error' | 'empty' | 'failed'
  onRetry?: () => void
  reason?: string
  emptyText?: string
  className?: string
}) {
  const config = {
    loading: { Icon: Loader2, text: '正在拉取数据…', spin: true, tone: 'text-muted-foreground' },
    error: { Icon: AlertTriangle, text: reason ?? '数据加载失败', spin: false, tone: 'text-down' },
    failed: { Icon: WifiOff, text: reason ?? '后端数据源失败', spin: false, tone: 'text-down' },
    empty: { Icon: Inbox, text: emptyText, spin: false, tone: 'text-muted-foreground' },
  }[status]
  const { Icon, text, spin, tone } = config
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 border border-dashed border-border bg-muted/20 px-6 py-10 text-center',
        className,
      )}
    >
      <Icon className={cn('size-6', tone, spin && 'animate-spin')} />
      <p className={cn('text-sm', tone)}>{text}</p>
      {(status === 'error' || status === 'failed') && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 border border-border px-3 py-1 text-xs text-foreground transition-colors hover:border-neon hover:text-neon"
        >
          <RefreshCw className="size-3" />
          重试
        </button>
      )}
    </div>
  )
}

// ── 资源边界：一处包裹即覆盖全部 7 种数据状态 ──
// loading/empty/error/failed → 渲染占位块（不显示子内容）
// stale/partial/cached       → 顶部降级条 + 照常渲染子内容
// live                       → 仅渲染子内容
// 子内容支持函数式写法 children(data)，避免空数据时访问字段报错。
export function ResourceBoundary<T>({
  resource: res,
  children,
  onRetry,
  emptyText,
  isEmpty,
  className,
}: {
  resource: Resource<T>
  children: React.ReactNode | ((data: T) => React.ReactNode)
  onRetry?: () => void
  emptyText?: string
  // 自定义空判定（例如数组长度为 0）；默认 status === 'empty'
  isEmpty?: (data: T) => boolean
  className?: string
}) {
  const { status, data, reason } = res
  const empty = status === 'empty' || (isEmpty ? isEmpty(data) : false)

  if (status === 'loading' || status === 'error' || status === 'failed') {
    return (
      <DataStateBlock
        status={status}
        reason={reason}
        onRetry={onRetry}
        className={className}
      />
    )
  }
  if (empty) {
    return <DataStateBlock status="empty" emptyText={emptyText} className={className} />
  }
  return (
    <>
      <DegradeNotice status={status} reason={reason} className="mb-3" />
      {typeof children === 'function' ? (children as (d: T) => React.ReactNode)(data) : children}
    </>
  )
}

// ── 降级提示条：partial / stale / cached 时在板块顶部提示 ──
export function DegradeNotice({
  status,
  reason,
  className,
}: {
  status: DataStatus
  reason?: string
  className?: string
}) {
  if (status !== 'partial' && status !== 'stale' && status !== 'cached') return null
  const text =
    status === 'partial'
      ? reason ?? '部分数据源缺失，结果可能不完整'
      : status === 'stale'
        ? reason ?? '数据已过期，正在等待下一轮刷新'
        : reason ?? '当前为缓存数据，可能非最新'
  return (
    <div
      className={cn(
        'flex items-center gap-2 border border-[oklch(0.8_0.15_75)]/40 bg-[oklch(0.8_0.15_75)]/10 px-3 py-1.5 text-xs text-[oklch(0.82_0.15_75)]',
        className,
      )}
    >
      <AlertTriangle className="size-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  )
}
