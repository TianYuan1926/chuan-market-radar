'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * useLiveNumber —— 围绕基准值做小幅随机游走，模拟实时行情跳动。
 *
 * 仅用于"无后端时也能看到动画效果"的演示。
 * 对接 codex 后端时，删除本钩子，改为订阅/轮询真实数据：
 *   const price = useSWR('/api/price', fetcher).data
 * 然后把 price 直接传给 <LiveValue value={price} />。
 *
 * @param base       基准值
 * @param volatility 每次跳动相对基准的最大幅度（0.01 = ±1%）
 * @param intervalMs 跳动间隔
 * @param drift      是否允许偏离基准（false 时围绕基准回归）
 */
export function useLiveNumber(
  base: number,
  {
    volatility = 0.004,
    intervalMs = 2200,
    drift = false,
    min,
    max,
  }: {
    volatility?: number
    intervalMs?: number
    drift?: boolean
    min?: number
    max?: number
  } = {},
) {
  const [value, setValue] = useState(base)
  const current = useRef(base)

  useEffect(() => {
    // 尊重无障碍：减少动态偏好时不抖动
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    const id = setInterval(() => {
      const delta = (Math.random() * 2 - 1) * volatility
      let next = current.current * (1 + delta)
      // 非漂移模式下，轻微向基准回归，避免越走越远
      if (!drift) next = next * 0.85 + base * 0.15
      if (typeof min === 'number') next = Math.max(min, next)
      if (typeof max === 'number') next = Math.min(max, next)
      current.current = next
      setValue(next)
    }, intervalMs)
    return () => clearInterval(id)
  }, [base, volatility, intervalMs, drift, min, max])

  return value
}
