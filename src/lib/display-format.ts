export function fmtCap(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`
  if (n >= 1e4) return `${(n / 1e4).toFixed(2)}万`
  return `${n}`
}

export function fmtUsd(n: number): string {
  if (n < 0.01) return n.toPrecision(4)
  if (n < 1) return n.toFixed(4)
  if (n < 1000) return n.toFixed(2)
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export function hasKnownPositiveValue(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function fmtKnownCap(
  value: number | null | undefined,
  {
    prefix = '',
    empty = '待补齐',
  }: {
    prefix?: string
    empty?: string
  } = {},
) {
  return hasKnownPositiveValue(value) ? `${prefix}${fmtCap(value as number)}` : empty
}
