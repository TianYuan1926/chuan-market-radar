'use client'

import { useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type Blip = {
  id: string
  symbol: string
  angle: number // 度，0 在正右，顺时针
  radius: number // 0~1
  dir: 'up' | 'down'
  strength: number // 0~100
}

const BLIPS: Blip[] = [
  { id: 'b1', symbol: 'SOL', angle: 18, radius: 0.62, dir: 'up', strength: 87 },
  { id: 'b2', symbol: 'PEPE', angle: 74, radius: 0.42, dir: 'up', strength: 64 },
  { id: 'b3', symbol: 'WIF', angle: 128, radius: 0.78, dir: 'down', strength: 73 },
  { id: 'b4', symbol: 'ARB', angle: 165, radius: 0.34, dir: 'down', strength: 51 },
  { id: 'b5', symbol: 'TIA', angle: 212, radius: 0.7, dir: 'up', strength: 92 },
  { id: 'b6', symbol: 'DOGE', angle: 268, radius: 0.5, dir: 'down', strength: 45 },
  { id: 'b7', symbol: 'JUP', angle: 318, radius: 0.66, dir: 'up', strength: 78 },
]

type LogItem = { key: number; symbol: string; dir: 'up' | 'down'; strength: number }

export function IntroRadar() {
  const sweepRef = useRef<HTMLDivElement>(null)
  const blipRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const litAt = useRef<Record<string, number>>({})
  const [hovered, setHovered] = useState<Blip | null>(null)
  const [log, setLog] = useState<LogItem[]>([])
  const logKey = useRef(0)

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let angle = 0
    let last = performance.now()
    const SPEED = 60 // 度/秒 → 6s 一圈

    const frame = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      angle = (angle + SPEED * dt) % 360
      if (sweepRef.current) sweepRef.current.style.transform = `rotate(${angle}deg)`

      for (const b of BLIPS) {
        // 角差（扫描线顺时针经过 blip 时点亮）
        let diff = angle - b.angle
        diff = ((diff % 360) + 360) % 360
        if (diff < 6) {
          if (!litAt.current[b.id] || now - litAt.current[b.id] > 1500) {
            litAt.current[b.id] = now
            logKey.current += 1
            const item = { key: logKey.current, symbol: b.symbol, dir: b.dir, strength: b.strength }
            setLog((prev) => [item, ...prev].slice(0, 6))
          }
        }
        // 余辉淡出
        const el = blipRefs.current[b.id]
        if (el) {
          const since = now - (litAt.current[b.id] ?? -9999)
          const glow = Math.max(0, 1 - since / 1400)
          el.style.setProperty('--glow', String(glow))
        }
      }
      raf = requestAnimationFrame(frame)
    }

    if (!prefersReduced) raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1fr_0.9fr]">
      {/* 雷达本体 */}
      <div className="relative mx-auto aspect-square w-full max-w-md">
        {/* 同心环 */}
        {[1, 0.72, 0.46, 0.2].map((r, i) => (
          <span
            key={i}
            className="absolute rounded-full border border-neon/15"
            style={{
              inset: `${(1 - r) * 50}%`,
            }}
          />
        ))}
        {/* 十字 */}
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-neon/15" />
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-neon/15" />
        {/* 斜线 */}
        <span className="absolute inset-0 origin-center rotate-45 border-t border-neon/10" style={{ top: '50%' }} />
        <span className="absolute inset-0 origin-center -rotate-45 border-t border-neon/10" style={{ top: '50%' }} />

        {/* 扫描扇形 */}
        <div
          ref={sweepRef}
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'conic-gradient(from 0deg, var(--neon-soft) 0deg, oklch(0.77 0.16 62 / 0.35) 24deg, transparent 60deg, transparent 360deg)',
            maskImage: 'radial-gradient(circle, #000 0%, #000 70%, transparent 71%)',
            WebkitMaskImage: 'radial-gradient(circle, #000 0%, #000 70%, transparent 71%)',
          }}
        />
        {/* 中心 */}
        <span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neon shadow-[0_0_12px_var(--neon)]" />

        {/* 光点 */}
        {BLIPS.map((b) => {
          const rad = (b.angle * Math.PI) / 180
          const left = 50 + Math.cos(rad) * b.radius * 50
          const top = 50 + Math.sin(rad) * b.radius * 50
          return (
            <button
              key={b.id}
              ref={(el) => {
                blipRefs.current[b.id] = el
              }}
              onMouseEnter={() => setHovered(b)}
              onMouseLeave={() => setHovered((h) => (h?.id === b.id ? null : h))}
              className="group absolute -ml-1.5 -mt-1.5 grid size-3 place-items-center"
              style={{ left: `${left}%`, top: `${top}%` }}
              aria-label={`${b.symbol} 异动光点`}
            >
              {/* 余辉环 */}
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  boxShadow: '0 0 calc(var(--glow,0) * 16px) var(--neon)',
                  background: `color-mix(in oklch, ${b.dir === 'up' ? 'var(--up)' : 'var(--down)'} calc(var(--glow,0.2) * 100%), transparent)`,
                  opacity: 'calc(0.3 + var(--glow,0) * 0.7)',
                }}
              />
              <span
                className="relative size-1.5 rounded-full transition-transform group-hover:scale-150"
                style={{ background: b.dir === 'up' ? 'var(--up)' : 'var(--down)' }}
              />
              {/* 标签 */}
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[9px] font-bold text-foreground opacity-0 transition-opacity group-hover:opacity-100">
                {b.symbol}
              </span>
            </button>
          )
        })}

        {/* 悬停详情卡 */}
        {hovered && (
          <div className="animate-bubble-pop absolute left-1/2 top-full z-20 mt-4 w-52 -translate-x-1/2 border border-neon/40 bg-card p-3 neon-border">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-bold">{hovered.symbol}</span>
              <span
                className={cn(
                  'flex items-center gap-0.5 font-mono text-xs font-bold',
                  hovered.dir === 'up' ? 'text-up' : 'text-down',
                )}
              >
                {hovered.dir === 'up' ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {hovered.dir === 'up' ? '看涨异动' : '看跌异动'}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>异动强度</span>
              <span className="font-mono text-foreground">{hovered.strength}</span>
            </div>
            <div className="mt-1 h-1.5 w-full bg-secondary">
              <div
                className="h-full"
                style={{
                  width: `${hovered.strength}%`,
                  background: hovered.dir === 'up' ? 'var(--up)' : 'var(--down)',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 右侧：实时异动日志 */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-neon opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-neon" />
          </span>
          实时捕获 · LIVE
        </div>
        <div className="mt-4 divide-y divide-border border border-border bg-card/60">
          {log.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              雷达扫描中…
            </div>
          ) : (
            log.map((it) => (
              <div key={it.key} className="row-flash-neon flex items-center gap-3 px-4 py-2.5">
                <span
                  className="grid size-6 place-items-center font-mono text-[11px] font-bold"
                  style={{
                    color: it.dir === 'up' ? 'var(--up)' : 'var(--down)',
                    background: `color-mix(in oklch, ${it.dir === 'up' ? 'var(--up)' : 'var(--down)'} 16%, transparent)`,
                  }}
                >
                  {it.dir === 'up' ? '↑' : '↓'}
                </span>
                <span className="font-mono text-sm font-semibold">{it.symbol}</span>
                <span className="text-xs text-muted-foreground">
                  {it.dir === 'up' ? '资金净流入' : '抛压异动'}
                </span>
                <span className="ml-auto font-mono text-xs text-neon">强度 {it.strength}</span>
              </div>
            ))
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          扫描线每经过一个目标即触发捕获。悬停雷达上的光点查看异动详情。
        </p>
      </div>
    </div>
  )
}
