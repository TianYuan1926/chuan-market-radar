import { fmtCap } from './mock-data'

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
