'use client'

import { useEffect, useState } from 'react'
import { getTokens } from '@/lib/mock-data'
import { LiveQuotePct } from './live-value'
import { cn } from '@/lib/utils'

type Session = {
  name: string
  tz: string
  code: string
  open: number
  close: number
}

// 三大主力交易时段（按各自时区的活跃时段判断开/休市）
const SESSIONS: Session[] = [
  { name: '亚洲盘', tz: 'Asia/Hong_Kong', code: 'HKT', open: 9, close: 18 },
  { name: '伦敦盘', tz: 'Europe/London', code: 'GMT', open: 8, close: 17 },
  { name: '纽约盘', tz: 'America/New_York', code: 'ET', open: 9, close: 17 },
]

function fmtTime(tz: string, d: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(d)
    .replace(/^24/, '00')
}

function tzHour(tz: string, d: Date) {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    hour12: false,
  }).format(d)
  return parseInt(h, 10) % 24
}

export function SessionBar() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const tokens = getTokens()
  const gainers = [...tokens]
    .filter((t) => t.change24h > 0)
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, 6)
  const losers = [...tokens]
    .filter((t) => t.change24h < 0)
    .sort((a, b) => a.change24h - b.change24h)
    .slice(0, 4)

  return (
    <div className="flex items-stretch border-b border-border bg-card/40 text-[13px]">
      {/* 三大盘口 */}
      <div className="flex shrink-0 items-stretch">
        {SESSIONS.map((s) => {
          const hour = now ? tzHour(s.tz, now) : -1
          const active = now ? hour >= s.open && hour < s.close : false
          return (
            <div
              key={s.code}
              className="flex flex-col justify-center gap-0.5 border-r border-border px-4 py-1.5"
            >
              <div className="flex items-center gap-1.5">
                {active ? (
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-70" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-up shadow-[0_0_6px_var(--up)]" />
                  </span>
                ) : (
                  <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                )}
                <span
                  className={cn(
                    'text-[11px] font-semibold tracking-wide',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {s.name}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 pl-3">
                <span
                  className={cn(
                    'font-mono text-base font-bold leading-none tabular-nums',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {now ? (
                    (() => {
                      const [hh, mm] = fmtTime(s.tz, now).split(':')
                      return (
                        <>
                          {hh}
                          <span className="animate-colon-blink">:</span>
                          {mm}
                        </>
                      )
                    })()
                  ) : (
                    '--:--'
                  )}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {active ? '活跃' : '休市'} · {s.code}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* 涨跌幅滚动（仅客户端挂载后渲染，避免水合不匹配） */}
      <div className="relative flex-1 overflow-hidden">
        <div className="animate-ticker flex w-max items-center gap-6 whitespace-nowrap py-1.5 pl-6 font-mono">
          {now && [0, 1].map((dup) => (
            <div key={dup} className="flex items-center gap-6">
              <span className="flex items-center gap-1 font-sans text-[12px] font-semibold text-up">
                ▲ 涨幅榜
              </span>
              {gainers.map((t) => (
                <span key={`g${dup}${t.id}`} className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">{t.symbol}</span>
                  <LiveQuotePct id={t.id} />
                </span>
              ))}
              <span className="ml-2 flex items-center gap-1 font-sans text-[12px] font-semibold text-down">
                ▼ 跌幅榜
              </span>
              {losers.map((t) => (
                <span key={`l${dup}${t.id}`} className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">{t.symbol}</span>
                  <LiveQuotePct id={t.id} />
                </span>
              ))}
            </div>
          ))}
        </div>
        {/* 右侧渐隐 */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-card/80 to-transparent" />
      </div>
    </div>
  )
}
