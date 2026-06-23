'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import {
  getEgg,
  unlockEgg,
  useEggProgress,
  RARITY_COLOR,
  type EffectKind,
} from '@/lib/egg-store'
import { playSound } from '@/lib/sound'
import { EggEffects } from './egg-effects'
import { EggCollection } from './egg-collection'
import { cn } from '@/lib/utils'

// 经典 Konami 秘籍序列
const KONAMI = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
]

// 暗号指令 → 彩蛋 id
const COMMANDS: { word: string; egg: string }[] = [
  { word: 'moon', egg: 'moon' },
  { word: 'hodl', egg: 'hodl' },
  { word: 'chuan', egg: 'chuan' },
  { word: 'rekt', egg: 'rekt' },
]

// 幸运时刻（对称/吉利的 HH:MM）
const LUCKY_TIMES = new Set([
  '00:00',
  '04:20',
  '08:08',
  '11:11',
  '12:34',
  '14:14',
  '20:20',
  '22:22',
])

export function EasterEggSystem() {
  const [mounted, setMounted] = useState(false)
  const { count, total, lastUnlock } = useEggProgress()
  const [activeEffect, setActiveEffect] = useState<{ kind: EffectKind; ts: number } | null>(null)
  const [collectionOpen, setCollectionOpen] = useState(false)
  const [banner, setBanner] = useState<{ name: string; line: string; color: string; fresh: boolean } | null>(null)

  const konamiIdx = useRef(0)
  const typeBuf = useRef('')
  const seenBanners = useRef<Set<string>>(new Set())
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cornerClicks = useRef<{ n: number; t: number }>({ n: 0, t: 0 })
  const pokeWindow = useRef<{ n: number; t: number }>({ n: 0, t: 0 })

  useEffect(() => setMounted(true), [])

  const fireEffect = useCallback((kind: EffectKind) => {
    setActiveEffect({ kind, ts: Date.now() })
  }, [])

  // ---- 监听解锁信号：编排特效 / 音效 / 横幅 / 川宝台词 ----
  useEffect(() => {
    if (!lastUnlock) return
    const egg = getEgg(lastUnlock.id)
    if (!egg) return
    const fresh = !seenBanners.current.has(egg.id)
    seenBanners.current.add(egg.id)

    fireEffect(egg.effect)
    // 音效：传说级用升段凯旋音，其余用连击闪光音
    playSound(egg.rarity === 'legendary' ? 'levelup' : 'combo')

    setBanner({ name: egg.name, line: egg.line, color: RARITY_COLOR[egg.rarity], fresh })
    if (bannerTimer.current) clearTimeout(bannerTimer.current)
    bannerTimer.current = setTimeout(() => setBanner(null), 4600)

    // 让川宝说彩蛋台词
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chuan:pet-say', { detail: { text: egg.line } }))
    }
  }, [lastUnlock, fireEffect])

  // ---- 键盘：Konami 秘籍 + 暗号指令 ----
  useEffect(() => {
    if (!mounted) return
    const onKey = (e: KeyboardEvent) => {
      // Konami
      const want = KONAMI[konamiIdx.current]
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (key === want) {
        konamiIdx.current++
        if (konamiIdx.current >= KONAMI.length) {
          konamiIdx.current = 0
          unlockEgg('konami')
        }
      } else {
        // 重新对齐：若当前键正好是序列起点
        konamiIdx.current = key === KONAMI[0] ? 1 : 0
      }

      // 暗号：仅累计单字母
      if (/^[a-z]$/.test(key)) {
        typeBuf.current = (typeBuf.current + key).slice(-12)
        for (const c of COMMANDS) {
          if (typeBuf.current.endsWith(c.word)) {
            unlockEgg(c.egg)
            typeBuf.current = ''
            break
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted])

  // ---- 时间：深夜猎手 + 幸运时刻 ----
  useEffect(() => {
    if (!mounted) return
    const check = () => {
      const now = new Date()
      const h = now.getHours()
      if (h >= 0 && h < 4) unlockEgg('night-owl')
      const hm = `${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      if (LUCKY_TIMES.has(hm)) unlockEgg('lucky-time')
    }
    check()
    const id = setInterval(check, 15000)
    return () => clearInterval(id)
  }, [mounted])

  // ---- 连点川宝（监听川宝派发的互动事件）----
  useEffect(() => {
    if (!mounted) return
    const onPoke = () => {
      const now = Date.now()
      const w = pokeWindow.current
      if (now - w.t > 2600) w.n = 0
      w.n++
      w.t = now
      if (w.n >= 6) {
        w.n = 0
        unlockEgg('pet-whisperer')
      }
    }
    window.addEventListener('chuan:pet-poke', onPoke as EventListener)
    return () => window.removeEventListener('chuan:pet-poke', onPoke as EventListener)
  }, [mounted])

  // ---- 隐藏热区：左上角三连击 ----
  const onCorner = useCallback(() => {
    const now = Date.now()
    const c = cornerClicks.current
    if (now - c.t > 1600) c.n = 0
    c.n++
    c.t = now
    if (c.n >= 3) {
      c.n = 0
      unlockEgg('treasure-corner')
    }
  }, [])

  const replay = useCallback(
    (kind: EffectKind) => {
      fireEffect(kind)
    },
    [fireEffect],
  )

  if (!mounted) return null

  return (
    <>
      {/* 隐藏点击热区：左上角，不可见，三连击触发藏宝角 */}
      <button
        aria-hidden
        tabIndex={-1}
        onClick={onCorner}
        className="fixed left-0 top-0 z-[90] size-7 cursor-default opacity-0"
        style={{ background: 'transparent' }}
      />

      {/* 全屏粒子特效 */}
      <EggEffects effect={activeEffect} />

      {/* 解锁横幅 */}
      {banner && (
        <div className="pointer-events-none fixed inset-x-0 top-6 z-[100] flex justify-center px-4">
          <div
            className="animate-bubble-pop flex max-w-md items-start gap-3 border bg-card/95 px-4 py-3 shadow-2xl backdrop-blur"
            style={{ borderColor: `color-mix(in oklch, ${banner.color} 55%, var(--border))` }}
          >
            <Sparkles className="mt-0.5 size-5 shrink-0" style={{ color: banner.color }} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-bold">
                <span style={{ color: banner.color }}>
                  {banner.fresh ? '新彩蛋解锁' : '彩蛋重现'}
                </span>
                <span className="text-foreground">· {banner.name}</span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{banner.line}</p>
            </div>
          </div>
        </div>
      )}

      {/* 收集册入口：解锁首个彩蛋后出现（左下角，避开川宝） */}
      {count > 0 && (
        <button
          onClick={() => setCollectionOpen(true)}
          aria-label={`打开彩蛋收集册，已解锁 ${count} / ${total}`}
          className={cn(
            'group fixed bottom-4 left-4 z-[60] flex items-center gap-1.5 border border-neon/40 bg-card/90 px-2.5 py-1.5',
            'text-xs font-semibold text-foreground shadow-lg backdrop-blur transition-colors hover:border-neon print:hidden',
          )}
        >
          <Sparkles className="size-4 text-neon transition-transform group-hover:scale-110" />
          <span className="font-mono">
            {count}
            <span className="text-muted-foreground">/{total}</span>
          </span>
        </button>
      )}

      {/* 收集册 */}
      <EggCollection
        open={collectionOpen}
        onClose={() => setCollectionOpen(false)}
        onReplay={replay}
      />
    </>
  )
}
