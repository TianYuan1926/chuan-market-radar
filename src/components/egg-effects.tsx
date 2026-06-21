'use client'

import { useEffect, useRef } from 'react'
import type { EffectKind } from '@/lib/egg-store'

// ============================================================
// 全屏粒子特效引擎（canvas）
//   接收 effect={kind, ts}，每当 ts 变化即播放一轮对应特效，
//   约 2.8s 后自动淡出清场。覆盖全屏、不拦截鼠标。
// ============================================================

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  size: number
  life: number // 已存活毫秒
  ttl: number // 总寿命
  hue: string
  glyph?: string
  shape: 'glyph' | 'bill' | 'diamond' | 'star' | 'tri' | 'heart' | 'spark'
}

const DURATION = 2800

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]

const COIN_GLYPHS = ['$', '₿', 'Ξ', '◎', '¥']

function spawn(kind: EffectKind, W: number, H: number): Particle[] {
  const out: Particle[] = []
  const base = (over: Partial<Particle>): Particle => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    rot: rand(0, Math.PI * 2),
    vr: rand(-0.2, 0.2),
    size: 22,
    life: 0,
    ttl: DURATION,
    hue: 'var(--neon)',
    shape: 'glyph',
    ...over,
  })

  switch (kind) {
    case 'coins':
      for (let i = 0; i < 60; i++)
        out.push(
          base({
            x: rand(0, W),
            y: rand(-H * 0.4, 0),
            vx: rand(-0.4, 0.4),
            vy: rand(3, 7),
            size: rand(18, 34),
            glyph: pick(COIN_GLYPHS),
            hue: pick(['oklch(0.82 0.16 88)', 'oklch(0.9 0.12 92)', 'oklch(0.75 0.17 70)']),
          }),
        )
      break
    case 'money':
      for (let i = 0; i < 46; i++)
        out.push(
          base({
            x: rand(0, W),
            y: rand(-H * 0.4, 0),
            vx: rand(-1.2, 1.2),
            vy: rand(2.2, 5),
            vr: rand(-0.12, 0.12),
            size: rand(26, 44),
            shape: 'bill',
            hue: pick(['oklch(0.68 0.13 150)', 'oklch(0.78 0.12 145)', 'oklch(0.82 0.16 90)']),
          }),
        )
      break
    case 'fireworks':
      // 多轮爆裂在随机点
      for (let b = 0; b < 6; b++) {
        const cx = rand(W * 0.15, W * 0.85)
        const cy = rand(H * 0.12, H * 0.55)
        const hue = pick([
          'oklch(0.82 0.16 88)',
          'oklch(0.7 0.2 25)',
          'oklch(0.75 0.18 300)',
          'oklch(0.78 0.16 200)',
          'oklch(0.85 0.18 140)',
        ])
        const n = 34
        for (let i = 0; i < n; i++) {
          const ang = (Math.PI * 2 * i) / n
          const sp = rand(2.4, 6.2)
          out.push(
            base({
              x: cx,
              y: cy,
              vx: Math.cos(ang) * sp,
              vy: Math.sin(ang) * sp,
              size: rand(2.5, 4.5),
              shape: 'spark',
              hue,
              ttl: DURATION - b * 120,
              life: -b * 260, // 错峰绽放
            }),
          )
        }
      }
      break
    case 'diamonds':
      for (let i = 0; i < 40; i++)
        out.push(
          base({
            x: rand(0, W),
            y: rand(H, H * 1.3),
            vx: rand(-0.5, 0.5),
            vy: rand(-4.5, -2.2), // 上浮
            size: rand(12, 26),
            shape: 'diamond',
            hue: pick(['oklch(0.86 0.1 200)', 'oklch(0.95 0.03 220)', 'oklch(0.8 0.12 190)']),
          }),
        )
      break
    case 'stars':
      for (let i = 0; i < 70; i++)
        out.push(
          base({
            x: rand(0, W),
            y: rand(0, H),
            vx: rand(-0.3, 0.3),
            vy: rand(-0.4, 0.4),
            size: rand(6, 18),
            shape: 'star',
            hue: pick(['oklch(0.92 0.06 90)', 'oklch(0.85 0.12 250)', 'oklch(0.95 0.02 220)']),
          }),
        )
      break
    case 'crash':
      for (let i = 0; i < 52; i++)
        out.push(
          base({
            x: rand(0, W),
            y: rand(-H * 0.4, 0),
            vx: rand(-0.3, 0.3),
            vy: rand(5, 10),
            size: rand(14, 26),
            shape: 'tri',
            hue: pick(['oklch(0.62 0.21 25)', 'oklch(0.7 0.2 22)', 'oklch(0.55 0.2 18)']),
          }),
        )
      break
    case 'hearts':
      for (let i = 0; i < 38; i++)
        out.push(
          base({
            x: rand(0, W),
            y: rand(H, H * 1.25),
            vx: rand(-0.7, 0.7),
            vy: rand(-3.6, -1.8),
            size: rand(14, 30),
            shape: 'heart',
            hue: pick(['oklch(0.72 0.2 12)', 'oklch(0.8 0.16 0)', 'oklch(0.78 0.18 350)']),
          }),
        )
      break
  }
  return out
}

function draw(ctx: CanvasRenderingContext2D, p: Particle, alpha: number) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rot)
  ctx.fillStyle = p.hue
  ctx.strokeStyle = p.hue
  const s = p.size
  switch (p.shape) {
    case 'glyph': {
      ctx.font = `700 ${s}px ui-sans-serif, system-ui`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = p.hue
      ctx.shadowBlur = 12
      ctx.fillText(p.glyph ?? '$', 0, 0)
      break
    }
    case 'bill': {
      const w = s
      const h = s * 0.46
      roundRect(ctx, -w / 2, -h / 2, w, h, 3)
      ctx.fill()
      ctx.globalAlpha = alpha * 0.5
      ctx.fillStyle = 'oklch(0.2 0.02 150)'
      ctx.beginPath()
      ctx.arc(0, 0, h * 0.28, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'diamond': {
      ctx.shadowColor = p.hue
      ctx.shadowBlur = 14
      ctx.beginPath()
      ctx.moveTo(0, -s / 2)
      ctx.lineTo(s * 0.34, -s * 0.12)
      ctx.lineTo(0, s / 2)
      ctx.lineTo(-s * 0.34, -s * 0.12)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'star':
      drawStar(ctx, s / 2)
      break
    case 'tri': {
      ctx.shadowColor = p.hue
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.moveTo(-s / 2, -s / 2)
      ctx.lineTo(s / 2, -s / 2)
      ctx.lineTo(0, s / 2)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'heart':
      drawHeart(ctx, s)
      break
    case 'spark': {
      ctx.shadowColor = p.hue
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.arc(0, 0, s, 0, Math.PI * 2)
      ctx.fill()
      break
    }
  }
  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawStar(ctx: CanvasRenderingContext2D, r: number) {
  ctx.shadowColor = ctx.fillStyle as string
  ctx.shadowBlur = 10
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2
    const rad = i % 2 === 0 ? r : r * 0.44
    ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad)
  }
  ctx.closePath()
  ctx.fill()
}

function drawHeart(ctx: CanvasRenderingContext2D, s: number) {
  const k = s / 28
  ctx.shadowColor = ctx.fillStyle as string
  ctx.shadowBlur = 10
  ctx.beginPath()
  ctx.moveTo(0, 8 * k)
  ctx.bezierCurveTo(-14 * k, -6 * k, -8 * k, -16 * k, 0, -8 * k)
  ctx.bezierCurveTo(8 * k, -16 * k, 14 * k, -6 * k, 0, 8 * k)
  ctx.closePath()
  ctx.fill()
}

export function EggEffects({ effect }: { effect: { kind: EffectKind; ts: number } | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])

  useEffect(() => {
    if (!effect) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    particlesRef.current = spawn(effect.kind, W, H)
    // 降低动效偏好：仅画一帧静态点缀
    if (reduce) {
      ctx.clearRect(0, 0, W, H)
      for (const p of particlesRef.current) draw(ctx, { ...p, life: 400 }, 0.6)
      const t = setTimeout(() => ctx.clearRect(0, 0, W, H), 900)
      return () => clearTimeout(t)
    }

    let last = performance.now()
    const gravity = effect.kind === 'fireworks' ? 0.04 : 0.05

    const loop = (now: number) => {
      const dt = Math.min(now - last, 40)
      last = now
      ctx.clearRect(0, 0, W, H)
      let alive = false
      for (const p of particlesRef.current) {
        p.life += dt
        if (p.life < 0) {
          alive = true
          continue
        }
        if (p.life > p.ttl) continue
        alive = true
        // 物理：烟花/上浮类减速，雨类受重力
        if (effect.kind === 'fireworks') {
          p.vx *= 0.97
          p.vy = p.vy * 0.97 + gravity * (dt / 16)
        } else if (effect.kind === 'diamonds' || effect.kind === 'hearts') {
          p.vy += gravity * 0.25 * (dt / 16)
        } else if (effect.kind === 'stars') {
          // 漂浮，无重力
        } else {
          p.vy += gravity * (dt / 16)
        }
        p.x += p.vx * (dt / 16)
        p.y += p.vy * (dt / 16)
        p.rot += p.vr * (dt / 16)
        const prog = p.life / p.ttl
        const fade = prog > 0.7 ? 1 - (prog - 0.7) / 0.3 : 1
        const twinkle = effect.kind === 'stars' ? 0.5 + 0.5 * Math.sin(p.life / 120 + p.x) : 1
        draw(ctx, p, Math.max(0, fade) * twinkle)
      }
      if (alive) {
        rafRef.current = requestAnimationFrame(loop)
      } else {
        ctx.clearRect(0, 0, W, H)
      }
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [effect])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[95]"
    />
  )
}
