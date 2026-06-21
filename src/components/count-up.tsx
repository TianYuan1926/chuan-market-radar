'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * 一次性入场数字滚动：元素滚入视口时，从 0 平滑增长到真实值后停止。
 * 这是入场展示效果，不会持续跳动、不伪造实时数据。
 * 尊重 prefers-reduced-motion：直接显示最终值。
 */
export function CountUp({
  value,
  duration = 1100,
  className,
  decimals = 0,
  prefix = '',
  suffix = '',
}: {
  value: number
  duration?: number
  className?: string
  decimals?: number
  prefix?: string
  suffix?: string
}) {
  const [display, setDisplay] = useState(value)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const el = ref.current
    if (reduce || !el) {
      setDisplay(value)
      return
    }
    setDisplay(0)
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started.current) {
          started.current = true
          const start = performance.now()
          const tick = (now: number) => {
            const p = Math.min((now - start) / duration, 1)
            // easeOutExpo
            const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
            setDisplay(eased * value)
            if (p < 1) requestAnimationFrame(tick)
            else setDisplay(value)
          }
          requestAnimationFrame(tick)
        }
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [value, duration])

  const text = display.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return (
    <span ref={ref} className={className}>
      {prefix}
      {text}
      {suffix}
    </span>
  )
}
