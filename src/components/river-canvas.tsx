'use client'

import { useEffect, useRef } from 'react'

type Particle = {
  lane: number
  x: number
  baseX: number
  y: number
  speed: number
  size: number
  alpha: number
  sway: number
  swaySpeed: number
}

/**
 * "资金之川"：三条垂直流动的粒子河，呼应"川"字三道笔画。
 * 使用平滑正弦漂移（而非逐帧随机），并以半透明拖影代替全量清屏，消除滞后/抖动感。
 */
export function RiverCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let w = 0
    let h = 0
    let raf = 0
    let t = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const particles: Particle[] = []
    const pointer = { x: 0.5, target: 0.5 }
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const laneX = () => [w * 0.34, w * 0.5, w * 0.66]

    const COUNT = 90
    for (let i = 0; i < COUNT; i++) {
      const lane = i % 3
      const baseX = laneX()[lane]
      particles.push({
        lane,
        baseX,
        x: baseX,
        y: Math.random() * h,
        speed: 0.35 + Math.random() * 1.1,
        size: 0.6 + Math.random() * 1.8,
        alpha: 0.18 + Math.random() * 0.5,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.004 + Math.random() * 0.01,
      })
    }

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      pointer.target = (e.clientX - r.left) / r.width
    }
    window.addEventListener('mousemove', onMove, { passive: true })

    const draw = () => {
      t += 1
      // 平滑跟随指针
      pointer.x += (pointer.target - pointer.x) * 0.05
      // 半透明拖影：留下淡淡尾迹，过渡更顺滑，避免逐帧全清的"频闪/滞后"观感
      ctx.fillStyle = 'oklch(0.15 0.008 260 / 0.28)'
      ctx.fillRect(0, 0, w, h)

      const lanes = laneX()
      for (const p of particles) {
        p.y += p.speed
        if (p.y > h + 12) {
          p.y = -12
          p.baseX = lanes[p.lane]
        }
        // 正弦平滑漂移 + 指针牵引（确定性，无逐帧随机抖动）
        const drift = Math.sin(p.sway + t * p.swaySpeed) * 14
        const pull = (pointer.x - 0.5) * 36
        p.x = p.baseX + drift + pull

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `oklch(0.82 0.16 62 / ${p.alpha})`
        ctx.fill()
        // 拖尾
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x, p.y - p.speed * 9)
        ctx.strokeStyle = `oklch(0.77 0.16 62 / ${p.alpha * 0.28})`
        ctx.lineWidth = p.size * 0.55
        ctx.stroke()
      }
      raf = requestAnimationFrame(draw)
    }

    if (prefersReduced) {
      // 尊重减弱动画偏好：静态绘制一帧
      ctx.fillStyle = 'oklch(0.15 0.008 260)'
      ctx.fillRect(0, 0, w, h)
    } else {
      draw()
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{
        maskImage:
          'radial-gradient(120% 90% at 50% 30%, #000 40%, transparent 85%)',
        WebkitMaskImage:
          'radial-gradient(120% 90% at 50% 30%, #000 40%, transparent 85%)',
      }}
    />
  )
}
