'use client'

import { cn } from '@/lib/utils'

type Props = {
  size?: number
  className?: string
  animated?: boolean
  withText?: boolean
}

// 川 字三道笔画，重构为高低错落的硬朗竖条：
// 既是「川」，也是三道资金之河 / 三根 K 线 —— 左短、中最高、右中等。
// bottom 统一基线，顶部圆角收口。
const BARS = [
  { x: 26, top: 46, accent: false }, // 左竖（短）
  { x: 45, top: 22, accent: true }, // 中竖（最高、最亮、带雷达亮点）
  { x: 64, top: 36, accent: false }, // 右竖（中等）
]
const BASE = 80 // 竖条基线
const BAR_W = 11

/**
 * 川 品牌标志：直角方框内三道竖条，硬朗、清晰、等高错落。
 * 中竖顶端有跳动的雷达亮点，一道雷达扫描线自上而下扫过，呼应「异动雷达」。
 */
export function ChuanLogo({
  size = 34,
  className,
  animated = true,
  withText = false,
}: Props) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        className="relative grid shrink-0 place-items-center"
        style={{ height: size, width: size }}
        role="img"
        aria-label="CHUANSCAN 川 标志"
      >
        {animated && (
          <span
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 55%, var(--neon-soft) 0%, transparent 70%)',
              animation: 'glow-breathe 3.2s ease-in-out infinite',
            }}
          />
        )}
        <svg
          viewBox="0 0 100 100"
          width={size}
          height={size}
          fill="none"
          className="relative overflow-hidden"
        >
          <defs>
            <linearGradient id="chuan-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.92 0.09 78)" />
              <stop offset="100%" stopColor="var(--neon)" />
            </linearGradient>
            <clipPath id="chuan-frame">
              <rect x="8" y="8" width="84" height="84" />
            </clipPath>
          </defs>

          {/* 直角描边方框 */}
          <rect
            x="8"
            y="8"
            width="84"
            height="84"
            stroke="var(--neon)"
            strokeOpacity={0.34}
            strokeWidth={3}
          />

          <g clipPath="url(#chuan-frame)">
            {/* 底部基线，三河同源 */}
            <line
              x1="20"
              y1={BASE + 4}
              x2="80"
              y2={BASE + 4}
              stroke="var(--neon)"
              strokeOpacity={0.25}
              strokeWidth={2}
            />

            {BARS.map((b, i) => {
              const h = BASE - b.top
              return (
                <g key={i}>
                  {/* 暗底 */}
                  <rect
                    x={b.x}
                    y={b.top}
                    width={BAR_W}
                    height={h}
                    rx={BAR_W / 2}
                    fill="var(--neon)"
                    fillOpacity={0.18}
                  />
                  {/* 实色竖条 */}
                  <rect
                    x={b.x}
                    y={b.top}
                    width={BAR_W}
                    height={h}
                    rx={BAR_W / 2}
                    fill="url(#chuan-grad)"
                    fillOpacity={b.accent ? 1 : 0.78}
                    style={{ filter: 'drop-shadow(0 0 3px var(--neon-soft))' }}
                  />
                  {/* 中竖顶端雷达亮点 */}
                  {b.accent && (
                    <circle
                      cx={b.x + BAR_W / 2}
                      cy={b.top - 5}
                      r={3.4}
                      fill="oklch(0.96 0.04 90)"
                      style={
                        animated
                          ? { animation: 'glow-breathe 1.6s ease-in-out infinite' }
                          : undefined
                      }
                    />
                  )}
                </g>
              )
            })}

            {/* 雷达扫描线：自上而下扫过 */}
            {animated && (
              <rect
                x="8"
                y="8"
                width="84"
                height="3"
                fill="oklch(0.96 0.05 90)"
                opacity={0.7}
                style={{ animation: 'chuan-scan 3.4s ease-in-out infinite' }}
              />
            )}
          </g>
        </svg>
      </span>
      {withText && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-base font-bold tracking-[0.16em] text-foreground">
            CHUANSCAN
          </span>
          <span className="mt-1 text-[10px] tracking-[0.36em] text-muted-foreground">
            异动雷达
          </span>
        </span>
      )}
    </span>
  )
}
