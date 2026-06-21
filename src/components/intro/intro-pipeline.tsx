'use client'

import { useEffect, useRef } from 'react'
import { Radar, Activity, Waves } from 'lucide-react'

const GATES = [
  { at: 0.3, icon: Radar, label: '异动雷达', sub: '分层扫描' },
  { at: 0.5, icon: Activity, label: '证据融合', sub: '规则判定' },
  { at: 0.7, icon: Waves, label: '复盘进化', sub: '样本沉淀' },
]

/**
 * 噪声 → 信号 管线：
 * 左侧杂乱、冷色的噪声粒子，向右流经三道引擎后逐步收敛到中线、转为琥珀信号流。
 */
export function IntroPipeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let w = 0
    let h = 0
    let raf = 0

    type P = { x: number; y: number; baseY: number; speed: number; size: number; seed: number }
    const particles: P[] = []

    const resize = () => {
      w = wrap.clientWidth
      h = wrap.clientHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const spawn = (x?: number): P => ({
      x: x ?? -Math.random() * 40,
      y: 0,
      baseY: Math.random(),
      speed: 0.8 + Math.random() * 1.8,
      size: 0.8 + Math.random() * 2,
      seed: Math.random() * Math.PI * 2,
    })
    for (let i = 0; i < 130; i++) particles.push(spawn(Math.random() * w))

    let t = 0
    const draw = () => {
      t += 0.02
      ctx.clearRect(0, 0, w, h)
      const cy = h / 2

      for (const p of particles) {
        p.x += p.speed
        if (p.x > w + 10) {
          Object.assign(p, spawn())
        }
        const prog = Math.min(Math.max(p.x / w, 0), 1)
        // 噪声 y：左侧铺满全高 + 抖动；越向右越收敛到中线
        const noiseY = (p.baseY - 0.5) * h * (1 - prog * prog) + Math.sin(p.seed + t) * 8 * (1 - prog)
        const y = cy + noiseY
        p.y = y
        // 颜色：冷灰 → 琥珀
        const r = Math.round(120 + (236 - 120) * prog)
        const g = Math.round(132 + (162 - 132) * prog)
        const b = Math.round(150 + (74 - 150) * prog)
        const alpha = 0.25 + prog * 0.6
        ctx.beginPath()
        ctx.arc(p.x, y, p.size * (0.7 + prog * 0.6), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
        ctx.fill()
        // 右段拖尾，强化"信号流"
        if (prog > 0.55) {
          ctx.beginPath()
          ctx.moveTo(p.x, y)
          ctx.lineTo(p.x - p.speed * 7, y)
          ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.5})`
          ctx.lineWidth = p.size * 0.5
          ctx.stroke()
        }
      }
      raf = requestAnimationFrame(draw)
    }

    if (!prefersReduced) draw()
    else {
      // 静态：画一条中线
      ctx.fillStyle = 'rgba(236,162,74,0.4)'
      ctx.fillRect(0, h / 2 - 1, w, 2)
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div ref={wrapRef} className="relative h-44 w-full overflow-hidden border border-border bg-card/40 sm:h-52">
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />

      {/* 两端标签 */}
      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[10px] font-bold tracking-widest text-muted-foreground sm:left-5">
        噪声
        <br />
        NOISE
      </span>
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-right font-mono text-[10px] font-bold tracking-widest text-neon sm:right-5">
        信号
        <br />
        SIGNAL
      </span>

      {/* 三道引擎节点 */}
      {GATES.map((g) => (
        <div
          key={g.label}
          className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
          style={{ left: `${g.at * 100}%` }}
        >
          <div className="h-full" />
          <div className="grid size-9 place-items-center border border-neon/40 bg-background/80 text-neon backdrop-blur-sm">
            <g.icon className="size-4" />
          </div>
          <div className="whitespace-nowrap text-center">
            <div className="text-[11px] font-semibold text-foreground">{g.label}</div>
            <div className="text-[9px] text-muted-foreground">{g.sub}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
