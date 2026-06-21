'use client'

import { useEffect } from 'react'
import { X, Lock, Sparkles, Trophy, Play } from 'lucide-react'
import {
  EGGS,
  RARITY_LABEL,
  RARITY_COLOR,
  useEggProgress,
  type EffectKind,
} from '@/lib/egg-store'
import { cn } from '@/lib/utils'

const TRIGGER_LABEL: Record<string, string> = {
  keyboard: '键盘秘籍',
  command: '暗号指令',
  time: '特殊时刻',
  hotzone: '隐藏热区',
  click: '连点互动',
}

export function EggCollection({
  open,
  onClose,
  onReplay,
}: {
  open: boolean
  onClose: () => void
  onReplay: (kind: EffectKind) => void
}) {
  const { unlocked, count, total, achievements } = useEggProgress()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const pct = Math.round((count / total) * 100)

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="彩蛋收集册"
    >
      {/* 遮罩 */}
      <button
        aria-label="关闭收集册"
        onClick={onClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />

      {/* 面板 */}
      <div className="animate-bubble-pop relative flex max-h-[88vh] w-full max-w-3xl flex-col border border-border bg-card shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between gap-4 border-b border-border p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center border border-neon/40 bg-neon/10">
              <Sparkles className="size-5 text-neon" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">彩蛋收集册</h2>
              <p className="text-xs text-muted-foreground">
                探索全站隐藏彩蛋，集齐它们成为寻宝大师
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="grid size-8 place-items-center border border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 进度总览 */}
        <div className="border-b border-border p-5">
          <div className="flex items-end justify-between">
            <span className="text-sm text-muted-foreground">收集进度</span>
            <span className="font-mono text-sm">
              <span className="text-2xl font-bold text-neon">{count}</span>
              <span className="text-muted-foreground"> / {total}</span>
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden bg-secondary">
            <div
              className="h-full bg-neon transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* 成就 */}
          <div className="mt-4 flex flex-wrap gap-2">
            {achievements.map((a) => {
              const done = count >= a.need
              return (
                <div
                  key={a.id}
                  title={a.desc}
                  className={cn(
                    'flex items-center gap-1.5 border px-2.5 py-1 text-xs',
                    done
                      ? 'border-neon/50 bg-neon/10 text-foreground'
                      : 'border-border text-muted-foreground',
                  )}
                >
                  <Trophy className={cn('size-3.5', done ? 'text-neon' : 'opacity-40')} />
                  {a.name}
                </div>
              )
            })}
          </div>
        </div>

        {/* 彩蛋网格 */}
        <div className="grid grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2">
          {EGGS.map((egg) => {
            const got = Boolean(unlocked[egg.id])
            return (
              <div
                key={egg.id}
                className={cn(
                  'relative flex flex-col gap-2 border p-4 transition-colors',
                  got ? 'border-border bg-secondary/40' : 'border-dashed border-border bg-transparent',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {got ? (
                      <Sparkles className="size-4 shrink-0" style={{ color: RARITY_COLOR[egg.rarity] }} />
                    ) : (
                      <Lock className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className={cn('font-bold', !got && 'text-muted-foreground')}>
                      {got ? egg.name : '？？？'}
                    </span>
                  </div>
                  <span
                    className="shrink-0 border px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{
                      color: RARITY_COLOR[egg.rarity],
                      borderColor: `color-mix(in oklch, ${RARITY_COLOR[egg.rarity]} 45%, transparent)`,
                    }}
                  >
                    {RARITY_LABEL[egg.rarity]}
                  </span>
                </div>

                <p className="min-h-[2.5rem] text-xs leading-relaxed text-muted-foreground">
                  {got ? egg.flavor : egg.hint}
                </p>

                <div className="mt-auto flex items-center justify-between">
                  <span className="border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {TRIGGER_LABEL[egg.trigger]}
                  </span>
                  {got && (
                    <button
                      onClick={() => onReplay(egg.effect)}
                      className="flex items-center gap-1 text-[11px] text-neon transition-opacity hover:opacity-80"
                    >
                      <Play className="size-3" />
                      重放特效
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
