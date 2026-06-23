'use client'

// ============================================================
// 交易日记 · 浮动抽屉启动器
//   在信号池等页面提供「随用随开」的交易日记，默认收起为右侧竖向标签，
//   零遮挡；点击滑出抽屉，可随时关闭，不影响信号信息浏览。
// ============================================================
import { useEffect, useState } from 'react'
import { NotebookPen, X } from 'lucide-react'
import { ManualJournal } from './manual-journal'
import { useJournal } from '@/lib/journal-store'
import { cn } from '@/lib/utils'

export function JournalLauncher() {
  const [open, setOpen] = useState(false)
  const entries = useJournal()
  const openCount = entries.filter((e) => e.status === '持仓中').length

  // 打开时锁定背景滚动 + Esc 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <>
      {/* 收起态：右边缘竖向标签 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="group fixed right-0 top-[42%] z-40 flex flex-col items-center gap-2 border border-r-0 border-neon/40 bg-card/90 py-3 pl-2 pr-1.5 backdrop-blur transition-colors hover:bg-neon hover:text-[color:var(--background)]"
          style={{ boxShadow: '0 0 20px var(--neon-soft)' }}
          aria-label="打开交易日记"
        >
          <NotebookPen className="size-4 text-neon transition-colors group-hover:text-[color:var(--background)]" />
          <span className="text-[11px] font-bold tracking-[0.2em] text-foreground [writing-mode:vertical-rl] group-hover:text-[color:var(--background)]">
            交易日记
          </span>
          {openCount > 0 && (
            <span className="grid size-4 place-items-center bg-neon font-mono text-[9px] font-bold text-[color:var(--background)] group-hover:bg-[color:var(--background)] group-hover:text-neon">
              {openCount}
            </span>
          )}
        </button>
      )}

      {/* 展开态：scrim + 右侧抽屉 */}
      <div
        className={cn(
          'fixed inset-0 z-50 transition-opacity duration-300',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        {/* 轻量遮罩，点击关闭 */}
        <div className="absolute inset-0 bg-background/45" onClick={() => setOpen(false)} />

        {/* 抽屉本体 */}
        <aside
          className={cn(
            'absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col border-l border-border bg-background shadow-2xl transition-transform duration-300 ease-out',
            open ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <NotebookPen className="size-4 text-neon" />
            <h2 className="text-sm font-bold tracking-tight">交易日记</h2>
            <span className="text-[11px] text-muted-foreground">随用随记 · 不影响信号浏览</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="关闭交易日记"
              className="ml-auto grid size-8 place-items-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <ManualJournal />
          </div>
        </aside>
      </div>
    </>
  )
}
