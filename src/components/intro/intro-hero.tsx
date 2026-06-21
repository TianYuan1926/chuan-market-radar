'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Crosshair, Radio } from 'lucide-react'

/**
 * 介绍页 Hero —— 「掌控流向」
 * · 资金之河画布：三道竖向粒子河，随光标弯折（引力井），象征对资金流向的掌控
 * · 摊开的手掌托起美金：资金之河向下汇入掌心（screen 混合消隐黑底，自然融入深色背景）
 * · 跟随光标的狙击准星 HUD + 实时坐标
 * · 标题「扫描锁定」动画：加密字形快闪 → 被扫描逐字锁定弹入并发光
 * · 漂浮加密币徽章 + 磁吸主按钮
 */
export function IntroHero() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const reticleRef = useRef<HTMLDivElement>(null)
  const vLineRef = useRef<HTMLDivElement>(null)
  const hLineRef = useRef<HTMLDivElement>(null)
  const coordRef = useRef<HTMLSpanElement>(null)
  const magnetRef = useRef<HTMLAnchorElement>(null)

  // 指针位置（0~1 归一），用 ref 避免重渲染
  const pointer = useRef({ x: 0.5, y: 0.35, ax: 0.5, ay: 0.35, inside: false })

  // ===== 资金之河画布：随光标弯折 =====
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let w = 0
    let h = 0
    let raf = 0
    let t = 0

    type P = {
      lane: number
      baseX: number
      x: number
      y: number
      speed: number
      size: number
      alpha: number
      sway: number
      swaySpeed: number
    }
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

    const laneX = () => [w * 0.32, w * 0.5, w * 0.68]
    const COUNT = 150
    for (let i = 0; i < COUNT; i++) {
      const lane = i % 3
      const bx = laneX()[lane]
      particles.push({
        lane,
        baseX: bx,
        x: bx,
        y: Math.random() * h,
        speed: 0.4 + Math.random() * 1.4,
        size: 0.6 + Math.random() * 2,
        alpha: 0.16 + Math.random() * 0.5,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.004 + Math.random() * 0.011,
      })
    }

    const draw = () => {
      t += 1
      pointer.current.ax += (pointer.current.x - pointer.current.ax) * 0.06
      pointer.current.ay += (pointer.current.y - pointer.current.ay) * 0.06
      const cx = pointer.current.ax * w
      const cy = pointer.current.ay * h

      // 半透明拖影
      ctx.fillStyle = 'oklch(0.15 0.008 260 / 0.3)'
      ctx.fillRect(0, 0, w, h)

      const lanes = laneX()
      for (const p of particles) {
        p.y += p.speed
        if (p.y > h + 14) {
          p.y = -14
          p.baseX = lanes[p.lane]
        }
        // 正弦漂移
        const drift = Math.sin(p.sway + t * p.swaySpeed) * 12
        // 引力井：靠近光标的粒子被横向牵引弯折
        const dx = p.x - cx
        const dy = p.y - cy
        const dist2 = dx * dx + dy * dy
        const pull = pointer.current.inside ? (28000 / (dist2 + 9000)) * (cx - p.baseX) * 0.012 : 0
        p.x = p.baseX + drift + pull * 6

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `oklch(0.82 0.16 62 / ${p.alpha})`
        ctx.fill()
        // 拖尾
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x, p.y - p.speed * 10)
        ctx.strokeStyle = `oklch(0.77 0.16 62 / ${p.alpha * 0.3})`
        ctx.lineWidth = p.size * 0.5
        ctx.stroke()
      }
      raf = requestAnimationFrame(draw)
    }

    if (prefersReduced) {
      ctx.fillStyle = 'oklch(0.15 0.008 260)'
      ctx.fillRect(0, 0, w, h)
    } else {
      draw()
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  // ===== 准星 HUD / 辉光：跟随光标，rAF 平滑 =====
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    let raf = 0
    const state = { x: 0.5, y: 0.35 }

    const onMove = (e: MouseEvent) => {
      const r = wrap.getBoundingClientRect()
      pointer.current.x = (e.clientX - r.left) / r.width
      pointer.current.y = (e.clientY - r.top) / r.height
      pointer.current.inside = true
    }
    const onLeave = () => {
      pointer.current.inside = false
      pointer.current.x = 0.5
      pointer.current.y = 0.35
    }
    wrap.addEventListener('mousemove', onMove, { passive: true })
    wrap.addEventListener('mouseleave', onLeave)

    const loop = () => {
      state.x += (pointer.current.x - state.x) * 0.16
      state.y += (pointer.current.y - state.y) * 0.16
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      const px = state.x * w
      const py = state.y * h
      if (glowRef.current) {
        glowRef.current.style.transform = `translate(${px}px, ${py}px)`
      }
      if (reticleRef.current) {
        reticleRef.current.style.transform = `translate(${px}px, ${py}px)`
        reticleRef.current.style.opacity = pointer.current.inside ? '1' : '0'
      }
      if (vLineRef.current) vLineRef.current.style.transform = `translateX(${px}px)`
      if (hLineRef.current) hLineRef.current.style.transform = `translateY(${py}px)`
      if (coordRef.current) {
        coordRef.current.textContent = `X ${(state.x * 100).toFixed(1)}  Y ${(state.y * 100).toFixed(1)}`
      }
      // 磁吸 CTA
      if (magnetRef.current) {
        const b = magnetRef.current.getBoundingClientRect()
        const r = wrap.getBoundingClientRect()
        const bx = b.left + b.width / 2 - r.left
        const by = b.top + b.height / 2 - r.top
        const ddx = px - bx
        const ddy = py - by
        const d = Math.hypot(ddx, ddy)
        if (d < 140 && pointer.current.inside) {
          const f = (1 - d / 140) * 14
          magnetRef.current.style.transform = `translate(${(ddx / d) * f}px, ${(ddy / d) * f}px)`
        } else {
          magnetRef.current.style.transform = 'translate(0,0)'
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      wrap.removeEventListener('mousemove', onMove)
      wrap.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  return (
    <section
      ref={wrapRef}
      className="relative min-h-[94vh] overflow-hidden"
      style={{ cursor: 'crosshair' }}
    >
      {/* 资金之河 */}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{
          maskImage: 'radial-gradient(130% 100% at 50% 24%, #000 40%, transparent 86%)',
          WebkitMaskImage: 'radial-gradient(130% 100% at 50% 24%, #000 40%, transparent 86%)',
        }}
      />

      {/* 透视网格地平面 */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[52%]"
        style={{
          backgroundImage:
            'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          transform: 'perspective(640px) rotateX(64deg)',
          transformOrigin: 'bottom',
          maskImage: 'linear-gradient(to top, #000 0%, transparent 72%)',
          WebkitMaskImage: 'linear-gradient(to top, #000 0%, transparent 72%)',
          opacity: 0.4,
        }}
      />

      {/* 手托美金：手部与漂浮美元拆为独立图层，分别动画 */}
      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        {/* 远景漂浮美元层：更慢、反向，制造视差纵深 */}
        <img
          src="/hero-cash.webp"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full select-none object-cover opacity-40 blur-[2px]"
          style={{
            objectPosition: 'center 26%',
            mixBlendMode: 'screen',
            maskImage:
              'radial-gradient(72% 56% at 50% 46%, transparent 0%, transparent 32%, #000 64%)',
            WebkitMaskImage:
              'radial-gradient(72% 56% at 50% 46%, transparent 0%, transparent 32%, #000 64%)',
            animation: 'cash-drift-far 11s ease-in-out 0.6s infinite, palm-rise 1.4s cubic-bezier(0.22,1,0.36,1) both',
          }}
        />
        {/* 底层：手部托钞票，微微收握的张弛呼吸 + 入场上浮 */}
        <img
          src="/hero-hand-cup.webp"
          alt="手托起美金并微微收拢，象征掌控资金流向"
          className="absolute inset-0 h-full w-full select-none object-cover"
          style={{
            objectPosition: 'center 46%',
            transformOrigin: 'center 80%',
            animation: 'hand-grip 6.5s ease-in-out 1.2s infinite, palm-rise 1.3s cubic-bezier(0.22,1,0.36,1) both',
          }}
        />
        {/* 近景漂浮美元层：主浮动，上下漂移 + 旋转 */}
        <img
          src="/hero-cash.webp"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full select-none object-cover opacity-80"
          style={{
            objectPosition: 'center 30%',
            mixBlendMode: 'screen',
            maskImage:
              'radial-gradient(68% 52% at 50% 46%, transparent 0%, transparent 30%, #000 62%)',
            WebkitMaskImage:
              'radial-gradient(68% 52% at 50% 46%, transparent 0%, transparent 30%, #000 62%)',
            animation: 'cash-drift 8s ease-in-out 0.8s infinite, palm-rise 1.3s cubic-bezier(0.22,1,0.36,1) 0.1s both',
          }}
        />
        {/* 钞票光扫：一束高光自下而上掠过手心钞票，赋予美金动态质感 */}
        <div
          aria-hidden
          className="absolute left-1/2 top-[40%] h-[44%] w-[40%] -translate-x-1/2 mix-blend-screen blur-3xl"
          style={{
            background:
              'linear-gradient(to top, transparent, var(--neon-soft) 45%, transparent)',
            animation: 'cash-sheen 5s ease-in-out 1.6s infinite',
          }}
        />
      </div>

      {/* 整体融合层：四向暗角 + 中心提亮，让全幅手掌图无缝融入深色背景、保证文字可读 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          background:
            'radial-gradient(120% 100% at 50% 46%, transparent 28%, color-mix(in oklch, var(--background) 78%, transparent) 62%, var(--background) 92%), linear-gradient(to bottom, var(--background) 0%, transparent 22%, transparent 70%, var(--background) 100%)',
        }}
      />

      {/* 光标辉光 */}
      <div
        ref={glowRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-[2] -ml-48 -mt-48 size-96 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--neon-soft), transparent 65%)' }}
      />

      {/* 准星十字线（全幅，极淡） */}
      <div
        ref={vLineRef}
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-[2] w-px bg-neon/15"
      />
      <div
        ref={hLineRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-px bg-neon/15"
      />

      {/* 准星 reticle */}
      <div
        ref={reticleRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-20 opacity-0 transition-opacity duration-300"
      >
        <div className="relative -ml-7 -mt-7 size-14">
          <span className="absolute inset-0 animate-radar-rotate border border-neon/40" />
          <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neon shadow-[0_0_10px_var(--neon)]" />
          <span className="absolute -top-1 left-1/2 h-2 w-px -translate-x-1/2 bg-neon" />
          <span className="absolute -bottom-1 left-1/2 h-2 w-px -translate-x-1/2 bg-neon" />
          <span className="absolute -left-1 top-1/2 h-px w-2 -translate-y-1/2 bg-neon" />
          <span className="absolute -right-1 top-1/2 h-px w-2 -translate-y-1/2 bg-neon" />
          <span className="absolute -bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap font-mono text-[9px] font-bold text-neon">
            <Radio className="size-2.5 animate-pulse" />
            <span ref={coordRef}>X 50.0 Y 35.0</span>
          </span>
        </div>
      </div>

      {/* 地平线发光 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-px bg-gradient-to-r from-transparent via-neon/60 to-transparent" />

      {/* 文案 */}
      <div className="relative z-10 mx-auto flex min-h-[94vh] max-w-5xl flex-col items-center justify-center px-4 text-center sm:px-6">
        <div className="animate-float-up inline-flex items-center gap-2 border border-border glass px-3 py-1 text-xs text-muted-foreground">
          <Crosshair className="size-3 text-neon" />
          合约异动雷达 · 移动鼠标，掌控资金之川
        </div>

        {/* 标题 + 漂浮加密币徽章 */}
        <div className="relative mt-6">
          <CryptoBadges />
          <h1 className="relative text-balance text-5xl font-extrabold leading-[1.04] tracking-tight sm:text-7xl lg:text-8xl">
            <ScanLockLine text="先于市场" start={300} />
            <br />
            <ScanLockLine text="看见流向" start={300} startIndex={4} />
          </h1>
        </div>

        <p
          className="animate-float-up mt-7 max-w-xl text-pretty text-base leading-relaxed text-foreground/90 sm:text-lg"
          style={{
            animationDelay: '1500ms',
            textShadow: '0 1px 12px var(--background), 0 0 24px var(--background)',
          }}
        >
          川 Chuan 以分层雷达扫描全市场合约异动，把噪声炼成信号。
          <br className="hidden sm:block" />
          大道至简，知行合一，让资金的流向先你一步被看见。
        </p>

        <div
          className="animate-float-up mt-9 flex flex-col items-center gap-3 sm:flex-row"
          style={{ animationDelay: '1650ms' }}
        >
          <Link
            ref={magnetRef}
            href="/dashboard"
            className="group flex items-center gap-2 bg-neon px-7 py-3.5 font-semibold text-primary-foreground transition-[box-shadow] duration-300 hover:shadow-[0_0_40px_var(--neon-soft)]"
            style={{ transition: 'transform 0.18s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s ease' }}
          >
            进入雷达总控
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/signals"
            className="border border-border px-7 py-3.5 font-semibold text-foreground transition-colors hover:border-neon/50"
          >
            探索信号池
          </Link>
        </div>
      </div>

      {/* 底部滚动提示 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-1 text-muted-foreground">
        <span className="text-[10px] tracking-[0.3em]">向下滚动</span>
        <span className="h-8 w-px animate-pulse bg-gradient-to-b from-neon to-transparent" />
      </div>
    </section>
  )
}

// 加密字形集合：锁定前以这些字形快闪占位
const GLYPHS = '₿Ξ◎$¥€01▲▼█▓§Ð'

/**
 * 「扫描锁定」单行标题动画（两行采用一致效果）
 * · 锁定前：每个字位显示快闪的加密字形（霓虹色、半透明）
 * · 逐字锁定：到达该字的锁定时刻，加密字形 snap 为真实文字并琥珀闪光弹入
 * · 行尾扫描光束循环横扫，保持「雷达扫描」质感
 */
function ScanLockLine({
  text,
  start = 0,
  startIndex = 0,
}: {
  text: string
  start?: number
  startIndex?: number
}) {
  const chars = text.split('')
  const STEP = 150 // 每字锁定间隔
  const [revealed, setRevealed] = useState(0)
  const [flick, setFlick] = useState(0)

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      setRevealed(chars.length)
      return
    }
    let revInt: ReturnType<typeof setInterval>
    // 加密字形快闪
    const flickInt = setInterval(() => setFlick((f) => f + 1), 55)
    // 逐字锁定（带行起始延迟）
    const startTimer = setTimeout(() => {
      revInt = setInterval(() => {
        setRevealed((r) => {
          if (r >= chars.length) {
            clearInterval(revInt)
            return r
          }
          return r + 1
        })
      }, STEP)
    }, start + startIndex * STEP)
    return () => {
      clearTimeout(startTimer)
      clearInterval(flickInt)
      clearInterval(revInt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  return (
    <span className="relative inline-flex">
      {chars.map((c, i) =>
        i < revealed ? (
          <span
            key={`r${i}`}
            className="inline-block"
            style={{ animation: 'char-rise 0.62s cubic-bezier(0.22,1,0.36,1) both' }}
          >
            <span className="crypto-gold-text">{c}</span>
          </span>
        ) : (
          <span
            key={`g${i}`}
            aria-hidden
            className="font-mono text-neon/55"
            style={{ animation: 'glyph-scan 0.5s ease-in-out infinite' }}
          >
            {GLYPHS[(flick + i * 3) % GLYPHS.length]}
          </span>
        ),
      )}
      {/* 扫描光束 */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-y-1 left-0 w-16 bg-gradient-to-r from-transparent via-neon/25 to-transparent blur-md"
        style={{ animation: 'title-beam 3.6s ease-in-out 2s infinite' }}
      />
    </span>
  )
}

// 漂浮的加密币徽章：环绕标题，强化虚拟货币元素
const BADGES = [
  { s: '₿', cls: 'left-[-6%] top-[-8%]', d: '0s', rot: '-12deg', size: 'text-2xl sm:text-4xl' },
  { s: 'Ξ', cls: 'right-[-4%] top-[-2%]', d: '0.8s', rot: '10deg', size: 'text-xl sm:text-3xl' },
  { s: '◎', cls: 'left-[2%] bottom-[-12%]', d: '1.4s', rot: '6deg', size: 'text-lg sm:text-2xl' },
  { s: '$', cls: 'right-[1%] bottom-[-10%]', d: '0.4s', rot: '-8deg', size: 'text-xl sm:text-3xl' },
]

function CryptoBadges() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      {BADGES.map((b) => (
        <span
          key={b.s}
          className={`absolute font-bold text-neon/35 ${b.cls} ${b.size}`}
          style={
            {
              '--rot': b.rot,
              animation: `crypto-bob 6s ease-in-out ${b.d} infinite`,
              textShadow: '0 0 20px var(--neon-soft)',
            } as React.CSSProperties
          }
        >
          {b.s}
        </span>
      ))}
    </div>
  )
}
