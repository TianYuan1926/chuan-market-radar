'use client'

// 全站信号通知层：挂载于 root layout，使信号推送与提示音覆盖所有页面。
// 命中用户持仓的信号以「持仓异动告警」样式高亮展示。
import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Radio, AlertTriangle, X } from 'lucide-react'
import Link from 'next/link'
import { useLatestSignal, type SignalEvent } from '@/lib/signal-feed'
import { TokenAvatar } from './token-avatar'
import { cn } from '@/lib/utils'

type Toast = SignalEvent & { dismissing?: boolean }

export function GlobalSignalFeed() {
  const latest = useLatestSignal()
  const [toasts, setToasts] = useState<Toast[]>([])

  // 每来一条新信号，压入一个 toast（最多同时显示 3 条）
  useEffect(() => {
    if (!latest) return
    setToasts((prev) => {
      if (prev.some((t) => t.id === latest.id)) return prev
      return [latest, ...prev].slice(0, 3)
    })
    const ttl = latest.held ? 7000 : 4500
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== latest.id))
    }, ttl)
    return () => clearTimeout(timer)
  }, [latest])

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[min(92vw,340px)] flex-col gap-2">
      {toasts.map((t) => (
        <SignalToast
          key={t.id}
          ev={t}
          onClose={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
        />
      ))}
    </div>
  )
}

function SignalToast({ ev, onClose }: { ev: SignalEvent; onClose: () => void }) {
  const bull = ev.side === 'bull'
  return (
    <Link
      href="/signals"
      className={cn(
        'pointer-events-auto block animate-update-pop border bg-card/95 backdrop-blur-sm transition-colors',
        ev.held ? 'border-down' : 'border-border hover:border-neon',
      )}
      style={
        ev.held
          ? { boxShadow: '0 0 0 1px var(--down), 0 0 18px color-mix(in oklch, var(--down) 40%, transparent)' }
          : undefined
      }
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <TokenAvatar symbol={ev.symbol} hue={ev.hue} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {ev.held ? (
              <span className="flex items-center gap-0.5 text-[11px] font-bold text-down">
                <AlertTriangle className="size-3" />
                持仓异动告警
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-[11px] font-bold text-neon">
                <Radio className="size-3" />
                新信号
              </span>
            )}
            <span className="font-mono text-sm font-bold">{ev.symbol}</span>
            <span
              className={cn(
                'flex items-center gap-0.5 px-1 py-0.5 font-mono text-[10px] font-bold',
                bull ? 'bg-up/15 text-up' : 'bg-down/15 text-down',
              )}
            >
              {bull ? <TrendingUp className="size-2.5" /> : <TrendingDown className="size-2.5" />}
              {bull ? '看涨' : '看空'}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {ev.held
              ? `你持仓的 ${ev.symbol} 出现异动，异动强度 ${ev.anomalyScore}，请及时关注`
              : `${ev.symbol} 触发异动信号，异动强度 ${ev.anomalyScore}`}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.preventDefault()
            onClose()
          }}
          aria-label="关闭通知"
          className="grid size-6 shrink-0 place-items-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </Link>
  )
}
