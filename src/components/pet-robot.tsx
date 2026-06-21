'use client'

import { useEffect, useRef, useState } from 'react'
import { usePetState, pokePet } from '@/lib/pet-store'
import { rankForExp, rankProgress, type Rank, type Headgear, type Emblem } from '@/lib/ranks'
import {
  generateReply,
  isSeriousMood,
  type PetMood,
} from '@/lib/pet-brain'
import { RankBadge } from './rank-badge'
import { playSound } from '@/lib/sound'
import { startTrainingEngine } from '@/lib/training-engine'
import { cn } from '@/lib/utils'

const MOOD_TONE: Record<PetMood, string> = {
  idle: 'var(--neon)',
  right: 'var(--up)',
  wrong: 'var(--down)',
  levelup: 'var(--up)',
  leveldown: 'var(--down)',
  greet: 'var(--neon)',
}

// 游走/拖拽边界（距视口边缘留白）
function getBounds() {
  return {
    minX: 12,
    maxX: window.innerWidth - 84,
    minY: 12,
    maxY: window.innerHeight - 96,
  }
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const rand = (a: number, b: number) => a + Math.random() * (b - a)

export function PetRobot() {
  const state = usePetState()
  const [mounted, setMounted] = useState(false)
  const [mood, setMood] = useState<PetMood>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [serious, setSerious] = useState(false)
  const [expFloat, setExpFloat] = useState<{ v: number; id: number } | null>(null)
  const [open, setOpen] = useState(false)
  const [blink, setBlink] = useState(false)

  // 位置 / 游走 / 拖拽
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [winW, setWinW] = useState(0)
  const [dragging, setDragging] = useState(false)
  const posRef = useRef({ x: 0, y: 0 })
  const targetRef = useRef({ x: 0, y: 0 })
  const draggingRef = useRef(false)
  const pauseWanderUntil = useRef(0)
  const down = useRef({ x: 0, y: 0, ox: 0, oy: 0 })

  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTs = useRef(0)

  useEffect(() => {
    setMounted(true)
    // 启动全局常驻判断训练引擎：跨页面、跨标签全时运行，
    // 川宝在任意页面都会对评判结果做出反应。
    startTrainingEngine()
  }, [])

  // 初始化位置（右下角）+ 监听 resize 夹取
  useEffect(() => {
    if (!mounted) return
    const init = () => {
      const x = window.innerWidth - 88
      const y = window.innerHeight - 104
      posRef.current = { x, y }
      targetRef.current = { x, y }
      setPos({ x, y })
      setWinW(window.innerWidth)
    }
    init()
    const onResize = () => {
      const b = getBounds()
      const p = posRef.current
      const nx = clamp(p.x, b.minX, b.maxX)
      const ny = clamp(p.y, b.minY, b.maxY)
      posRef.current = { x: nx, y: ny }
      targetRef.current = { x: nx, y: ny }
      setPos({ x: nx, y: ny })
      setWinW(window.innerWidth)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [mounted])

  // 缓动循环：朝目标点平滑移动（拖拽时不接管）
  useEffect(() => {
    if (!mounted) return
    let raf = 0
    const loop = () => {
      if (!draggingRef.current) {
        const p = posRef.current
        const t = targetRef.current
        const dx = t.x - p.x
        const dy = t.y - p.y
        if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) {
          p.x += dx * 0.045
          p.y += dy * 0.045
          setPos({ x: p.x, y: p.y })
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [mounted])

  // 自主游走：定期挑选新的临近目标点
  useEffect(() => {
    if (!mounted) return
    const id = setInterval(() => {
      if (draggingRef.current || open) return
      if (Date.now() < pauseWanderUntil.current) return
      const b = getBounds()
      const cur = posRef.current
      targetRef.current = {
        x: clamp(cur.x + rand(-200, 200), b.minX, b.maxX),
        y: clamp(cur.y + rand(-150, 150), b.minY, b.maxY),
      }
    }, 5200)
    return () => clearInterval(id)
  }, [mounted, open])

  // 待机眨眼
  useEffect(() => {
    const t = setInterval(() => {
      setBlink(true)
      setTimeout(() => setBlink(false), 160)
    }, 4200)
    return () => clearInterval(t)
  }, [])

  // 话唠：待机时定期自言自语（话术经 pet-brain 生成，未来可换 AI）
  useEffect(() => {
    if (!mounted) return
    const rank = rankForExp(state.exp)
    const id = setInterval(async () => {
      if (draggingRef.current || open) return
      if (mood !== 'idle' || message) return
      const line = await generateReply({
        mood: 'idle',
        rankName: rank.name,
        exp: state.exp,
        streak: state.streak,
        page: typeof window !== 'undefined' ? window.location.pathname : undefined,
      })
      setSerious(false)
      showMessage(line, 5200)
    }, 14000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, mood, message, open, state.exp, state.streak])

  // 响应评判/互动事件
  useEffect(() => {
    const ev = state.lastEvent
    if (!ev || ev.ts === lastTs.current) return
    lastTs.current = ev.ts
    const m = ev.kind as PetMood
    const rank = rankForExp(state.exp)
    setMood(m)
    setSerious(isSeriousMood(m))
    if (ev.delta !== 0) setExpFloat({ v: ev.delta, id: ev.ts })

    // 提示音：升/掉段优先，其次连击/连错档位，再退回普通对错/互动
    if (ev.kind === 'levelup') playSound('levelup')
    else if (ev.kind === 'leveldown') playSound('leveldown')
    else if (ev.kind === 'greet') playSound('poke')
    else if (ev.kind === 'right') playSound(ev.combo ? 'combo' : 'right')
    else if (ev.kind === 'wrong') playSound(ev.combo ? 'slump' : 'wrong')

    const hold = m === 'levelup' || m === 'leveldown' ? 3800 : 2800
    ;(async () => {
      const line = await generateReply({
        mood: m,
        rankName: rank.name,
        gearName: rank.gearName,
        exp: state.exp,
        streak: state.streak,
        wrongStreak: state.wrongStreak,
        combo: ev.combo,
      })
      showMessage(line, hold + 400)
    })()

    if (revertTimer.current) clearTimeout(revertTimer.current)
    revertTimer.current = setTimeout(() => {
      setMood('idle')
      setSerious(false)
    }, hold)
    return () => {
      if (revertTimer.current) clearTimeout(revertTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastEvent])

  // 接收彩蛋系统派发的台词，让川宝在彩蛋触发时开口
  useEffect(() => {
    const onSay = (e: Event) => {
      const detail = (e as CustomEvent).detail as { text?: string } | undefined
      if (!detail?.text) return
      setSerious(false)
      setMood('greet')
      showMessage(detail.text, 5200)
      if (revertTimer.current) clearTimeout(revertTimer.current)
      revertTimer.current = setTimeout(() => setMood('idle'), 5000)
    }
    window.addEventListener('chuan:pet-say', onSay as EventListener)
    return () => window.removeEventListener('chuan:pet-say', onSay as EventListener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function showMessage(text: string, holdMs: number) {
    if (msgTimer.current) clearTimeout(msgTimer.current)
    setMessage(text)
    msgTimer.current = setTimeout(() => setMessage(null), holdMs)
  }

  if (!mounted || !pos) return null

  const rank = rankForExp(state.exp)
  const { next, pct } = rankProgress(state.exp)
  const tone = MOOD_TONE[mood]
  const anim = dragging
    ? ''
    : mood === 'right'
      ? 'animate-pet-hop'
      : mood === 'wrong' || mood === 'leveldown'
        ? 'animate-pet-shake'
        : mood === 'levelup'
          ? 'animate-pet-celebrate'
          : 'animate-pet-bob'

  const side: 'left' | 'right' = pos.x > winW / 2 ? 'right' : 'left'
  const bubbleBorder = serious
    ? 'var(--down)'
    : `color-mix(in oklch, ${tone} 40%, var(--border))`

  // 拖拽手势
  function onPointerDown(e: React.PointerEvent) {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    down.current = {
      x: e.clientX,
      y: e.clientY,
      ox: posRef.current.x,
      oy: posRef.current.y,
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (e.buttons === 0) return
    const dx = e.clientX - down.current.x
    const dy = e.clientY - down.current.y
    if (!draggingRef.current && Math.hypot(dx, dy) < 4) return
    draggingRef.current = true
    if (!dragging) setDragging(true)
    const b = getBounds()
    const nx = clamp(down.current.ox + dx, b.minX, b.maxX)
    const ny = clamp(down.current.oy + dy, b.minY, b.maxY)
    posRef.current = { x: nx, y: ny }
    targetRef.current = { x: nx, y: ny }
    setPos({ x: nx, y: ny })
  }
  function onPointerUp() {
    if (draggingRef.current) {
      draggingRef.current = false
      setDragging(false)
      pauseWanderUntil.current = Date.now() + 6000
    } else {
      setOpen((v) => !v)
      pokePet()
      // 通知彩蛋系统：连点川宝可解锁「川宝挚友」
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('chuan:pet-poke'))
      }
    }
  }

  return (
    <div
      className="fixed z-[60] print:hidden"
      style={{ left: pos.x, top: pos.y, touchAction: 'none' }}
    >
      <div className="relative size-16">
        {/* 展开的迷你段位卡 */}
        {open && (
          <div
            className="animate-bubble-pop absolute bottom-[calc(100%+0.5rem)] w-56 border border-border bg-card/95 p-3 shadow-xl backdrop-blur"
            style={{ [side === 'right' ? 'right' : 'left']: 0 }}
          >
            <div className="flex items-center gap-2">
              <RankBadge level={rank.level} size={40} />
              <div className="min-w-0">
                <div className="flex items-center gap-1 truncate text-sm font-bold" style={{ color: rank.color }}>
                  <span className="font-mono text-[10px]">Lv{rank.level}</span>
                  {rank.name}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">
                  装备 · {rank.gearName}
                </div>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>累计经验</span>
              <span className="font-mono text-foreground">{state.exp}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden bg-secondary">
              <div
                className="h-full transition-all duration-500"
                style={{ width: `${pct * 100}%`, background: rank.color }}
              />
            </div>
            <div className="mt-1 text-right text-[10px] text-muted-foreground">
              {next ? `距 ${next.name} ${next.minExp - state.exp} 经验` : '已达最高段位'}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>对 <span className="font-mono text-up">{state.totalRight}</span></span>
              <span>错 <span className="font-mono text-down">{state.totalWrong}</span></span>
              <span>连对 <span className="font-mono text-foreground">{state.streak}</span></span>
            </div>
          </div>
        )}

        {/* 台词气泡 */}
        {message && (
          <div
            className="animate-bubble-pop absolute bottom-[calc(100%+0.5rem)] w-max max-w-[220px] border bg-card px-3 py-2 text-xs leading-relaxed text-foreground shadow-lg"
            style={{
              borderColor: bubbleBorder,
              [side === 'right' ? 'right' : 'left']: 0,
            }}
          >
            {serious && (
              <span className="mb-0.5 block text-[10px] font-bold text-down">认真提醒</span>
            )}
            {message}
          </div>
        )}

        {/* 经验飘字 */}
        {expFloat && (
          <span
            key={expFloat.id}
            className="animate-exp-float pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 font-mono text-sm font-bold"
            style={{ color: expFloat.v >= 0 ? 'var(--up)' : 'var(--down)' }}
            onAnimationEnd={() => setExpFloat(null)}
          >
            {expFloat.v >= 0 ? `+${expFloat.v}` : expFloat.v} EXP
          </span>
        )}

        {/* 机器人本体（可点击 / 可拖拽） */}
        <button
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          aria-label="交易搭子川宝，点击查看段位，可拖拽移动"
          className={cn(
            'relative touch-none select-none outline-none',
            dragging ? 'cursor-grabbing' : 'cursor-grab',
          )}
        >
          <RobotFace mood={mood} tone={tone} anim={anim} blink={blink} rank={rank} />
          {/* 段位标志角标 */}
          <span className="pointer-events-none absolute -bottom-1.5 -right-1.5">
            <RankBadge level={rank.level} size={22} />
          </span>
        </button>
      </div>
    </div>
  )
}

function RobotFace({
  mood,
  tone,
  anim,
  blink,
  rank,
}: {
  mood: PetMood
  tone: string
  anim: string
  blink: boolean
  rank: Rank
}) {
  return (
    <div
      className={cn('relative grid size-16 place-items-center', anim)}
      style={{ filter: `drop-shadow(0 4px 14px color-mix(in oklch, ${tone} 45%, transparent))` }}
    >
      <svg viewBox="0 0 64 64" className="size-16 overflow-visible">
        {/* 光环（高段位专属） */}
        {rank.aura && (
          <ellipse cx="32" cy="32" rx="30" ry="30" fill="none" stroke={rank.color} strokeWidth="1.4" opacity="0.5">
            <animate attributeName="opacity" values="0.15;0.55;0.15" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="rx" values="29;31;29" dur="2.4s" repeatCount="indefinite" />
          </ellipse>
        )}

        {/* 天线（仅部分造型保留） */}
        {(rank.headgear === 'scope') && (
          <>
            <line x1="32" y1="6" x2="32" y2="14" stroke={tone} strokeWidth="2" />
            <circle cx="32" cy="5" r="3" fill={tone}>
              <animate attributeName="opacity" values="1;0.4;1" dur="1.6s" repeatCount="indefinite" />
            </circle>
          </>
        )}

        {/* 头部外壳 */}
        <rect x="12" y="13" width="40" height="34" rx="11" fill="var(--card)" stroke={tone} strokeWidth="2" />
        {/* 侧耳 */}
        <rect x="8" y="24" width="4" height="12" rx="2" fill={tone} />
        <rect x="52" y="24" width="4" height="12" rx="2" fill={tone} />
        {/* 屏幕脸 */}
        <rect x="17" y="18" width="30" height="24" rx="7" fill="oklch(0.16 0.02 240)" />
        <Face mood={mood} tone={tone} blink={blink} />

        {/* 头部装备（随段位） */}
        <Headgear kind={rank.headgear} color={rank.color} />

        {/* 身体底座 + 段位徽记 */}
        <rect x="20" y="48" width="24" height="10" rx="4" fill="var(--card)" stroke={tone} strokeWidth="1.6" />
        <RankEmblem kind={rank.emblem} color={rank.color} />
      </svg>
    </div>
  )
}

function Headgear({ kind, color }: { kind: Headgear; color: string }) {
  const dark = 'oklch(0.2 0.02 240)'
  switch (kind) {
    case 'sprout':
      return (
        <g>
          <path d="M32 13 Q28 4 22 5 Q24 12 32 13" fill="oklch(0.72 0.15 150)" />
          <path d="M32 13 Q36 4 42 5 Q40 12 32 13" fill="oklch(0.8 0.16 145)" />
          <line x1="32" y1="13" x2="32" y2="8" stroke="oklch(0.7 0.14 150)" strokeWidth="1.4" />
        </g>
      )
    case 'cap':
      return (
        <g>
          <path d="M15 14 Q32 1 49 14 Z" fill={color} />
          <path d="M44 13 L56 12 L56 16 L44 16 Z" fill={color} />
          <circle cx="32" cy="4" r="1.6" fill={dark} />
        </g>
      )
    case 'headset':
      return (
        <g>
          <path d="M15 16 Q32 0 49 16" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
          <rect x="6" y="22" width="7" height="15" rx="3.5" fill={color} />
          <rect x="51" y="22" width="7" height="15" rx="3.5" fill={color} />
          {/* 麦克风臂 */}
          <path d="M13 33 Q4 36 10 42" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <circle cx="11" cy="42" r="2" fill={color} />
        </g>
      )
    case 'visor':
      return (
        <g>
          <rect x="13" y="12" width="38" height="4.5" rx="2.25" fill={color} />
          <path d="M30 16 L55 12 L55 16 L31 19 Z" fill={color} />
        </g>
      )
    case 'huntcap':
      return (
        <g>
          <path d="M15 15 Q32 3 49 15 Z" fill={color} />
          <rect x="13" y="14" width="38" height="3.4" rx="1.7" fill="oklch(0.35 0.06 60)" />
          {/* 羽毛 */}
          <path d="M44 13 Q54 2 51 14" fill="none" stroke="oklch(0.75 0.16 50)" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )
    case 'scope':
      return (
        <g>
          {/* 狙击单眼镜 */}
          <circle cx="38" cy="30" r="7" fill="none" stroke={color} strokeWidth="2" />
          <line x1="31" y1="30" x2="45" y2="30" stroke={color} strokeWidth="0.8" />
          <line x1="38" y1="23" x2="38" y2="37" stroke={color} strokeWidth="0.8" />
          <line x1="45" y1="30" x2="52" y2="28" stroke={color} strokeWidth="1.6" />
        </g>
      )
    case 'halo':
      return (
        <g>
          <ellipse cx="32" cy="7" rx="13" ry="3.4" fill="none" stroke={color} strokeWidth="2.4">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
          </ellipse>
        </g>
      )
    case 'crown':
      return (
        <g>
          <path d="M18 13 L22 4 L27 10 L32 2 L37 10 L42 4 L46 13 Z" fill={color} stroke="oklch(0.95 0.05 90)" strokeWidth="0.8" />
          <circle cx="32" cy="2" r="1.8" fill="oklch(0.92 0.12 90)" />
          <rect x="18" y="12" width="28" height="3" fill={color} />
        </g>
      )
    default:
      return null
  }
}

function RankEmblem({ kind, color }: { kind: Emblem; color: string }) {
  const cy = 53
  switch (kind) {
    case 'bar':
      return <rect x="28" y="52" width="8" height="2.4" rx="1.2" fill={color} />
    case 'chevron':
      return (
        <path d="M27 55 L32 51 L37 55" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      )
    case 'star':
      return <EmblemStar cx={32} cy={cy} r={3.2} color={color} />
    case 'star2':
      return (
        <>
          <EmblemStar cx={27} cy={cy} r={2.6} color={color} />
          <EmblemStar cx={37} cy={cy} r={2.6} color={color} />
        </>
      )
    case 'diamond':
      return (
        <path d="M32 50 L35.5 53 L32 56 L28.5 53 Z" fill={color} />
      )
    case 'crownMark':
      return (
        <path d="M27 55 L28 50 L31 53 L32 49 L33 53 L36 50 L37 55 Z" fill={color} />
      )
    default:
      return null
  }
}

function Face({ mood, tone, blink }: { mood: PetMood; tone: string; blink: boolean }) {
  const eyeColor = tone
  // 眨眼时眼睛压扁为线
  if (blink && (mood === 'idle' || mood === 'greet')) {
    return (
      <>
        <rect x="23" y="29" width="6" height="2" rx="1" fill={eyeColor} />
        <rect x="35" y="29" width="6" height="2" rx="1" fill={eyeColor} />
        <rect x="29" y="36" width="6" height="2" rx="1" fill={eyeColor} />
      </>
    )
  }
  switch (mood) {
    case 'right':
      return (
        <>
          <path d="M22 31 Q26 26 30 31" fill="none" stroke={eyeColor} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M34 31 Q38 26 42 31" fill="none" stroke={eyeColor} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M27 35 Q32 41 37 35" fill="none" stroke={eyeColor} strokeWidth="2.2" strokeLinecap="round" />
        </>
      )
    case 'levelup':
      return (
        <>
          <Star cx={26} cy={30} tone={eyeColor} />
          <Star cx={38} cy={30} tone={eyeColor} />
          <ellipse cx="32" cy="37" rx="3.5" ry="2.6" fill={eyeColor} />
        </>
      )
    case 'wrong':
      return (
        <>
          <path d="M23 28 L28 31 L23 34" fill="none" stroke={eyeColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M41 28 L36 31 L41 34" fill="none" stroke={eyeColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M28 37 Q30 35 32 37 Q34 39 36 37" fill="none" stroke={eyeColor} strokeWidth="2" strokeLinecap="round" />
        </>
      )
    case 'leveldown':
      return (
        <>
          <circle cx="26" cy="30" r="3" fill="none" stroke={eyeColor} strokeWidth="1.6" />
          <circle cx="26" cy="30" r="1" fill={eyeColor} />
          <circle cx="38" cy="30" r="3" fill="none" stroke={eyeColor} strokeWidth="1.6" />
          <circle cx="38" cy="30" r="1" fill={eyeColor} />
          <rect x="28" y="37" width="8" height="2" rx="1" fill={eyeColor} />
        </>
      )
    case 'greet':
      return (
        <>
          <circle cx="26" cy="30" r="2.6" fill={eyeColor} />
          <path d="M35 30 L41 30" stroke={eyeColor} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M27 35 Q32 39 37 35" fill="none" stroke={eyeColor} strokeWidth="2.2" strokeLinecap="round" />
        </>
      )
    default:
      return (
        <>
          <circle cx="26" cy="30" r="2.8" fill={eyeColor} />
          <circle cx="38" cy="30" r="2.8" fill={eyeColor} />
          <path d="M28 36 Q32 39 36 36" fill="none" stroke={eyeColor} strokeWidth="2" strokeLinecap="round" />
        </>
      )
  }
}

function Star({ cx, cy, tone }: { cx: number; cy: number; tone: string }) {
  return <EmblemStar cx={cx} cy={cy} r={3.4} color={tone} />
}

function EmblemStar({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  const pts: string[] = []
  for (let i = 0; i < 5; i++) {
    const outer = i * ((Math.PI * 2) / 5) - Math.PI / 2
    const inner = outer + Math.PI / 5
    pts.push(`${cx + Math.cos(outer) * r},${cy + Math.sin(outer) * r}`)
    pts.push(`${cx + Math.cos(inner) * r * 0.45},${cy + Math.sin(inner) * r * 0.45}`)
  }
  return <polygon points={pts.join(' ')} fill={color} />
}
