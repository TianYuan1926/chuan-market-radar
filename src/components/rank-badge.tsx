'use client'

import { RANKS } from '@/lib/ranks'

/**
 * RankBadge —— 8 段位专属徽章，每段造型与特效各异。
 * - level: 1-8
 * - size: 像素尺寸
 * - animated: 是否启用特效动画（阶梯小图可关闭以降低开销）
 * - dim: 未解锁段位置灰
 */
export function RankBadge({
  level,
  size = 56,
  animated = true,
  dim = false,
}: {
  level: number
  size?: number
  animated?: boolean
  dim?: boolean
}) {
  const rank = RANKS.find((r) => r.level === level) ?? RANKS[0]
  const c = rank.color
  const a = animated && !dim

  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size, opacity: dim ? 0.4 : 1, filter: dim ? 'grayscale(1)' : undefined }}
    >
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        {renderBadge(level, c, a)}
      </svg>
      {/* 高光扫过（高段位） */}
      {a && level >= 7 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="badge-shimmer absolute inset-y-0 w-1/3"
            style={{
              background:
                'linear-gradient(90deg, transparent, color-mix(in oklch, white 55%, transparent), transparent)',
            }}
          />
        </div>
      )}
    </div>
  )
}

function renderBadge(level: number, c: string, a: boolean) {
  switch (level) {
    case 1:
      return <Lv1 c={c} a={a} />
    case 2:
      return <Lv2 c={c} a={a} />
    case 3:
      return <Lv3 c={c} a={a} />
    case 4:
      return <Lv4 c={c} a={a} />
    case 5:
      return <Lv5 c={c} a={a} />
    case 6:
      return <Lv6 c={c} a={a} />
    case 7:
      return <Lv7 c={c} a={a} />
    case 8:
      return <Lv8 c={c} a={a} />
    default:
      return <Lv1 c={c} a={a} />
  }
}

// ---------- 共用工具 ----------
function star(cx: number, cy: number, r: number, inner = 0.42) {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2
    const rad = i % 2 === 0 ? r : r * inner
    pts.push(`${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`)
  }
  return pts.join(' ')
}

function fillSoft(c: string, pct = 16) {
  return `color-mix(in oklch, ${c} ${pct}%, transparent)`
}

// ============================================================
// Lv1 韭菜新手 —— 圆环 + 嫩芽，静态质朴
// ============================================================
function Lv1({ c }: { c: string; a: boolean }) {
  return (
    <g>
      <circle cx="32" cy="32" r="26" fill={fillSoft(c, 12)} stroke={c} strokeWidth="2" />
      {/* 嫩芽 */}
      <path d="M32 44 V30" stroke={c} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M32 32 q-9 -2 -11 -11 q9 0 11 9" fill={fillSoft(c, 45)} stroke={c} strokeWidth="1.6" />
      <path d="M32 28 q9 -2 11 -10 q-9 0 -11 8" fill={fillSoft(c, 45)} stroke={c} strokeWidth="1.6" />
      <circle cx="32" cy="46" r="2" fill={c} />
    </g>
  )
}

// ============================================================
// Lv2 散户玩家 —— 盾牌 + 单根K线
// ============================================================
function Lv2({ c }: { c: string; a: boolean }) {
  return (
    <g>
      <path d="M32 6 L54 14 V34 Q54 50 32 58 Q10 50 10 34 V14 Z" fill={fillSoft(c, 12)} stroke={c} strokeWidth="2" />
      {/* 单根放量K线 */}
      <line x1="32" y1="18" x2="32" y2="46" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <rect x="27" y="26" width="10" height="14" rx="1.5" fill={fillSoft(c, 55)} stroke={c} strokeWidth="2" />
    </g>
  )
}

// ============================================================
// Lv3 见习操盘手 —— 六边形 + 双 V 形章纹 + 呼吸辉光环
// ============================================================
function Lv3({ c, a }: { c: string; a: boolean }) {
  return (
    <g>
      {a && (
        <circle cx="32" cy="32" r="27" fill="none" stroke={c} strokeWidth="2" className="badge-glow" opacity="0.5" />
      )}
      <polygon points="32,6 54,19 54,45 32,58 10,45 10,19" fill={fillSoft(c, 12)} stroke={c} strokeWidth="2" />
      <path d="M20 28 L32 36 L44 28" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 38 L32 46 L44 38" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  )
}

// ============================================================
// Lv4 职业交易员 —— 盾牌 + 星 + 旋转虚线环
// ============================================================
function Lv4({ c, a }: { c: string; a: boolean }) {
  return (
    <g>
      <path d="M32 6 L54 14 V34 Q54 50 32 58 Q10 50 10 34 V14 Z" fill={fillSoft(c, 12)} stroke={c} strokeWidth="2" />
      <g className={a ? 'badge-spin' : undefined} style={{ transformOrigin: '32px 32px' }}>
        <circle cx="32" cy="31" r="17" fill="none" stroke={c} strokeWidth="1.4" strokeDasharray="3 4" opacity="0.7" />
      </g>
      <polygon points={star(32, 31, 11)} fill={fillSoft(c, 55)} stroke={c} strokeWidth="1.8" strokeLinejoin="round" />
    </g>
  )
}

// ============================================================
// Lv5 资深猎手 —— 带翼准星星章 + 辉光
// ============================================================
function Lv5({ c, a }: { c: string; a: boolean }) {
  return (
    <g>
      {a && <circle cx="32" cy="32" r="24" fill={fillSoft(c, 14)} className="badge-glow" />}
      {/* 双翼 */}
      <path d="M30 30 Q14 24 6 30 Q16 32 30 34 Z" fill={fillSoft(c, 40)} stroke={c} strokeWidth="1.4" />
      <path d="M34 30 Q50 24 58 30 Q48 32 34 34 Z" fill={fillSoft(c, 40)} stroke={c} strokeWidth="1.4" />
      {/* 准星圆 */}
      <circle cx="32" cy="32" r="14" fill={fillSoft(c, 14)} stroke={c} strokeWidth="2" />
      <line x1="32" y1="14" x2="32" y2="20" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <line x1="32" y1="44" x2="32" y2="50" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <polygon points={star(32, 32, 8)} fill={c} />
    </g>
  )
}

// ============================================================
// Lv6 狙击手 —— 狙击瞄准镜，旋转准星 + 闪烁激光点
// ============================================================
function Lv6({ c, a }: { c: string; a: boolean }) {
  return (
    <g>
      <circle cx="32" cy="32" r="25" fill={fillSoft(c, 10)} stroke={c} strokeWidth="2" />
      <circle cx="32" cy="32" r="18" fill="none" stroke={c} strokeWidth="1.2" opacity="0.6" />
      {/* 旋转刻度 */}
      <g className={a ? 'badge-spin' : undefined} style={{ transformOrigin: '32px 32px' }}>
        <line x1="32" y1="7" x2="32" y2="15" stroke={c} strokeWidth="2" strokeLinecap="round" />
        <line x1="32" y1="49" x2="32" y2="57" stroke={c} strokeWidth="2" strokeLinecap="round" />
        <line x1="7" y1="32" x2="15" y2="32" stroke={c} strokeWidth="2" strokeLinecap="round" />
        <line x1="49" y1="32" x2="57" y2="32" stroke={c} strokeWidth="2" strokeLinecap="round" />
      </g>
      {/* 十字准线 */}
      <line x1="32" y1="20" x2="32" y2="44" stroke={c} strokeWidth="1" opacity="0.8" />
      <line x1="20" y1="32" x2="44" y2="32" stroke={c} strokeWidth="1" opacity="0.8" />
      {/* 激光红点 */}
      <circle cx="32" cy="32" r="3" fill={c} className={a ? 'badge-blink' : undefined} />
    </g>
  )
}

// ============================================================
// Lv7 量化大师 —— 电路菱形 + 环绕数据节点 + 高光
// ============================================================
function Lv7({ c, a }: { c: string; a: boolean }) {
  const nodes = [0, 60, 120, 180, 240, 300]
  return (
    <g>
      {/* 菱形电路核心 */}
      <polygon points="32,8 56,32 32,56 8,32" fill={fillSoft(c, 12)} stroke={c} strokeWidth="2" />
      <polygon points="32,18 46,32 32,46 18,32" fill={fillSoft(c, 22)} stroke={c} strokeWidth="1.4" />
      {/* 电路线 */}
      <line x1="32" y1="18" x2="32" y2="46" stroke={c} strokeWidth="1" opacity="0.6" />
      <line x1="18" y1="32" x2="46" y2="32" stroke={c} strokeWidth="1" opacity="0.6" />
      <circle cx="32" cy="32" r="3.4" fill={c} />
      {/* 环绕节点 */}
      <g className={a ? 'badge-spin' : undefined} style={{ transformOrigin: '32px 32px' }}>
        {nodes.map((deg, i) => {
          const rad = (deg * Math.PI) / 180
          const x = 32 + 24 * Math.cos(rad)
          const y = 32 + 24 * Math.sin(rad)
          return <circle key={i} cx={x} cy={y} r={i % 2 === 0 ? 2.4 : 1.6} fill={c} />
        })}
      </g>
    </g>
  )
}

// ============================================================
// Lv8 传奇交易员 —— 皇冠 + 桂冠 + 放射光线 + 脉冲
// ============================================================
function Lv8({ c, a }: { c: string; a: boolean }) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315]
  return (
    <g>
      {/* 放射光线 */}
      <g className={a ? 'badge-spin' : undefined} style={{ transformOrigin: '32px 32px' }}>
        {rays.map((deg, i) => {
          const rad = (deg * Math.PI) / 180
          const x1 = 32 + 22 * Math.cos(rad)
          const y1 = 32 + 22 * Math.sin(rad)
          const x2 = 32 + 30 * Math.cos(rad)
          const y2 = 32 + 30 * Math.sin(rad)
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
          )
        })}
      </g>
      {/* 脉冲光晕 */}
      {a && <circle cx="32" cy="32" r="20" fill={fillSoft(c, 18)} className="badge-pulse-scale" />}
      {/* 桂冠 */}
      <path d="M16 40 Q12 30 18 22" fill="none" stroke={c} strokeWidth="1.6" opacity="0.8" />
      <path d="M48 40 Q52 30 46 22" fill="none" stroke={c} strokeWidth="1.6" opacity="0.8" />
      {/* 皇冠 */}
      <path
        d="M18 40 L18 26 L26 33 L32 22 L38 33 L46 26 L46 40 Z"
        fill={fillSoft(c, 55)}
        stroke={c}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <line x1="18" y1="44" x2="46" y2="44" stroke={c} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="32" cy="20" r="2.4" fill={c} />
      <circle cx="18" cy="24" r="1.8" fill={c} />
      <circle cx="46" cy="24" r="1.8" fill={c} />
    </g>
  )
}
