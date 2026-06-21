'use client'

import { Volume2, VolumeX } from 'lucide-react'
import { useSoundEnabled, toggleSound } from '@/lib/sound'
import { cn } from '@/lib/utils'

export function SoundToggle() {
  const enabled = useSoundEnabled()
  return (
    <button
      type="button"
      onClick={toggleSound}
      aria-label={enabled ? '关闭提示音' : '开启提示音'}
      aria-pressed={enabled}
      className={cn(
        'grid size-8 place-items-center transition-colors hover:bg-secondary',
        enabled ? 'text-neon' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {enabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
    </button>
  )
}
