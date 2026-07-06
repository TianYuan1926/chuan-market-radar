'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChuanLogo } from './chuan-logo'
import { PAGE_DISPLAY_NAMES } from '@/lib/ui-schema/display-names'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard', label: PAGE_DISPLAY_NAMES.dashboard },
  { href: '/signals', label: PAGE_DISPLAY_NAMES.signals },
  { href: '/leaderboard', label: PAGE_DISPLAY_NAMES.leaderboard },
  { href: '/market', label: PAGE_DISPLAY_NAMES.market },
  { href: '/review', label: PAGE_DISPLAY_NAMES.review },
  { href: '/system', label: PAGE_DISPLAY_NAMES.system },
]

export function SiteNav() {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-50 border-b border-border glass">
      <div className="mx-auto flex h-[52px] max-w-[1600px] items-center gap-2 px-4 sm:px-6">
        <Link href="/" className="flex items-center">
          <ChuanLogo size={26} withText />
        </Link>

        <div className="hidden border-l border-border pl-3 text-[11px] font-medium text-muted-foreground xl:block">
          全市场发现 → 深扫验证 → 策略计划 → 复盘进化
        </div>

        <div className="mx-3 hidden h-5 w-px bg-border md:block" />

        <nav className="hidden items-center gap-0.5 md:flex">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href === '/signals' && pathname.startsWith('/token'))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative px-3 py-1.5 text-[13px] font-semibold tracking-wide transition-colors',
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-[7px] h-0.5 bg-neon shadow-[0_0_10px_var(--neon)]" />
                )}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <div className="ml-1 flex items-center gap-1.5 border border-border bg-secondary/50 py-1 pl-1 pr-2 text-[13px] font-medium">
            <span className="grid size-6 place-items-center bg-neon font-mono text-xs font-bold text-[var(--primary-foreground)]">
              川
            </span>
            <span className="hidden sm:inline">实战雷达</span>
          </div>
        </div>
      </div>
    </header>
  )
}
