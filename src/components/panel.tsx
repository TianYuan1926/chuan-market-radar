import { isValidElement, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Panel({
  title,
  subtitle,
  icon,
  tone = 'var(--neon)',
  right,
  children,
  className,
}: {
  title: string
  subtitle?: string
  // 同时支持传入组件引用（icon={Wind}）或已渲染节点（icon={<Wind />}）
  icon?: LucideIcon | ReactNode
  tone?: string
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  let iconNode: ReactNode = null
  if (icon) {
    if (isValidElement(icon)) {
      iconNode = icon
    } else if (typeof icon === 'function') {
      const Icon = icon as LucideIcon
      iconNode = <Icon className="size-4" style={{ color: tone }} />
    }
  }
  return (
    <section className={cn('border border-border bg-card', className)}>
      <div className="border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-1" style={{ background: tone }} />
          {iconNode}
          <h2 className="font-semibold">{title}</h2>
          {right && <div className="ml-auto">{right}</div>}
        </div>
        {subtitle && (
          <p className="mt-1 pl-3 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  )
}

export function PageHeader({
  title,
  desc,
  right,
}: {
  title: string
  desc?: string
  right?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      {right}
    </div>
  )
}
