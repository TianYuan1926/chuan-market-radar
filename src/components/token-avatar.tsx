'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

/* ============ 真实 logo 源：CoinCap 图标 CDN。失败时明确回退生成式头像。 ============ */
export function logoLookupSymbol(symbol: string): string {
  const clean = symbol
    .trim()
    .toLowerCase()
    .replace(/^binance:/, '')
    .replace(/\.p$/, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/(usdt|usdc|busd|usd|perp|swap)$/u, '')

  return clean.replace(/^(1000000|10000|1000)(?=[a-z])/u, '')
}

export function realLogoUrl(symbol: string): string | null {
  const key = logoLookupSymbol(symbol)
  return key ? `https://assets.coincap.io/assets/icons/${key}@2x.png` : null
}

/* ============ 生成式几何标志（虚构币种各有形状） ============ */
type ShapeKind = 'hex' | 'diamond' | 'ring' | 'triangle' | 'square' | 'shield'
const SHAPES: ShapeKind[] = ['hex', 'diamond', 'ring', 'triangle', 'square', 'shield']

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function GenShape({ kind, color }: { kind: ShapeKind; color: string }) {
  const stroke = { fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'hex':
      return <path d="M12 4 L18.9 8 L18.9 16 L12 20 L5.1 16 L5.1 8 Z" {...stroke} />
    case 'diamond':
      return <path d="M12 4 L20 12 L12 20 L4 12 Z" {...stroke} />
    case 'ring':
      return (
        <>
          <circle cx="12" cy="12" r="7.5" {...stroke} />
          <circle cx="12" cy="12" r="2.6" fill={color} />
        </>
      )
    case 'triangle':
      return <path d="M12 4.5 L19.5 18 L4.5 18 Z" {...stroke} />
    case 'square':
      return <rect x="5.5" y="5.5" width="13" height="13" rx="3" {...stroke} transform="rotate(45 12 12)" />
    case 'shield':
      return <path d="M12 4 L19 7 V12.5 C19 16.5 12 20 12 20 C12 20 5 16.5 5 12.5 V7 Z" {...stroke} />
  }
}

/** 生成式头像（真实 logo 不可用时的回退） */
function GeneratedAvatar({
  symbol,
  hue,
  size,
  className,
}: {
  symbol: string
  hue: number
  size: number
  className?: string
}) {
  const h = hash(symbol)
  const kind = SHAPES[h % SHAPES.length]
  const c1 = `oklch(0.7 0.17 ${hue})`
  const c2 = `oklch(0.55 0.18 ${(hue + 55) % 360})`
  const gid = `g-${symbol}`

  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-full', className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(140deg, ${c1}, ${c2})`,
        boxShadow: `0 0 0 1px oklch(0.8 0.15 ${hue} / 0.4), 0 4px 12px oklch(0.5 0.16 ${hue} / 0.3)`,
      }}
      aria-hidden
    >
      <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 24 24">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(1 0 0 / 0.95)" />
            <stop offset="100%" stopColor="oklch(1 0 0 / 0.65)" />
          </linearGradient>
        </defs>
        <g stroke={`url(#${gid})`}>
          <GenShape kind={kind} color="oklch(1 0 0 / 0.92)" />
        </g>
      </svg>
    </span>
  )
}

export function TokenAvatar({
  symbol,
  hue,
  size = 32,
  className,
}: {
  symbol: string
  hue: number
  size?: number
  className?: string
}) {
  const url = realLogoUrl(symbol)
  const [failed, setFailed] = useState(false)

  // 真实 logo：失败时回退到生成式头像
  if (url && !failed) {
    return (
      <span
        className={cn('grid shrink-0 place-items-center overflow-hidden rounded-full bg-secondary', className)}
        style={{
          width: size,
          height: size,
          boxShadow: '0 0 0 1px oklch(1 0 0 / 0.1), 0 4px 12px oklch(0 0 0 / 0.25)',
        }}
      >
        <img
          src={url}
          alt={`${symbol} logo`}
          width={size}
          height={size}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    )
  }

  return <GeneratedAvatar symbol={symbol} hue={hue} size={size} className={className} />
}
