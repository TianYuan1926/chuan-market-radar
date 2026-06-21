'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Search, ChevronDown } from 'lucide-react'
import { ChuanLogo } from './chuan-logo'
import { SoundToggle } from './sound-toggle'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard', label: '雷达总控' },
  { href: '/signals', label: '信号池' },
  { href: '/leaderboard', label: '榜单' },
  { href: '/market', label: '大盘数据' },
  { href: '/review', label: '复盘进化' },
  { href: '/system', label: '系统' },
]

export function SiteNav() {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-50 border-b border-border glass">
      <div className="mx-auto flex h-[52px] max-w-[1600px] items-center gap-2 px-4 sm:px-6">
        <Link href="/" className="flex items-center">
          <ChuanLogo size={26} withText />
        </Link>

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
          <SoundToggle />
          <button
            aria-label="搜索"
            className="grid size-8 place-items-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Search className="size-4" />
          </button>
          <button
            aria-label="通知"
            className="relative grid size-8 place-items-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Bell className="size-4" />
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-neon" />
          </button>
          <button className="ml-1 flex items-center gap-1.5 border border-border bg-secondary/50 py-1 pl-1 pr-2 text-[13px] font-medium transition-colors hover:border-neon/40">
            <span className="grid size-6 place-items-center bg-neon font-mono text-xs font-bold text-[var(--primary-foreground)]">
              川
            </span>
            <span className="hidden sm:inline">用户</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>
    </header>
  )
}
