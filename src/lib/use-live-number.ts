'use client'

/**
 * useLiveNumber keeps the old component API stable while preventing fake
 * market movement. It now mirrors the latest backend-provided value only.
 *
 * The second argument is intentionally ignored for compatibility with v0 UI
 * call sites that still pass animation tuning options.
 */
export function useLiveNumber(
  base: number,
  _options: {
    volatility?: number
    intervalMs?: number
    drift?: boolean
    min?: number
    max?: number
  } = {},
) {
  void _options
  return base
}
