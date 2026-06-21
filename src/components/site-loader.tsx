'use client'

import { useEffect, useRef, useState } from 'react'
import { ChuanLogo } from './chuan-logo'
import { ArrowRight, ShieldAlert } from 'lucide-react'

// 终端启动日志（逐行流入，营造系统冷启动质感）
const BOOT_LOG = [
  { t: '初始化雷达阵列', v: 'ARRAY ONLINE' },
  { t: '接入链上数据源', v: '5/6 LINKED' },
  { t: '校准资金费率 / 持仓', v: 'CALIBRATED' },
  { t: '加载异动检测模型', v: 'v4.2 LOADED' },
  { t: '全市场扫描覆盖', v: '87.6%' },
  { t: '信号通道', v: 'LIVE' },
]

// 雷达上的异动光点（角度°/半径%）
const BLIPS = [
  { a: 42, r: 0.62, up: true, d: 0.6 },
  { a: 138, r: 0.4, up: false, d: 1.1 },
  { a: 205, r: 0.74, up: true, d: 1.6 },
  { a: 312, r: 0.52, up: true, d: 2.0 },
  { a: 268, r: 0.3, up: false, d: 2.4 },
]

export function SiteLoader() {
  const [phase, setPhase] = useState<'boot' | 'intro' | 'leaving' | 'done'>('boot')
  const [logCount, setLogCount] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('chuan_intro_seen')) {
      setPhase('done')
      return
    }
    // 逐行流入启动日志
    BOOT_LOG.forEach((_, i) => {
      timers.current.push(setTimeout(() => setLogCount(i + 1), 350 + i * 260))
    })
    // 启动序列完成 → 进入门户
    timers.current.push(setTimeout(() => setPhase('intro'), 350 + BOOT_LOG.length * 260 + 500))
    return () => timers.current.forEach(clearTimeout)
  }, [])

  function enter() {
    sessionStorage.setItem('chuan_intro_seen', '1')
    setPhase('leaving')
    setTimeout(() => setPhase('done'), 600)
  }

  if (phase === 'done') return null

  const showGate = phase === 'intro' || phase === 'leaving'

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-background"
      style={{ animation: phase === 'leaving' ? 'loader-out 0.55s ease forwards' : undefined }}
    >
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-25" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--neon-soft), transparent 65%)' }}
      />

      <div className="relative flex w-full max-w-md flex-col items-center px-6">
        {/* 顶部字标 */}
        <div className="flex items-center gap-3" style={{ animation: 'boot-log 0.5s ease both' }}>
          <ChuanLogo size={30} />
          <span className="font-mono text-lg font-bold tracking-[0.34em] text-foreground">
            CHUANSCAN
          </span>
        </div>
        <span className="mt-1.5 font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
          链上异动雷达 · BOOT SEQUENCE
        </span>

        {/* 雷达扫描镜 */}
        <div className="relative mt-8 size-60">
          {/* 同心环 */}
          {[1, 0.72, 0.46, 0.22].map((s, i) => (
            <span
              key={s}
              className="absolute left-1/2 top-1/2 rounded-full border border-neon/25"
              style={{
                width: `${s * 100}%`,
                height: `${s * 100}%`,
                transform: 'translate(-50%, -50%)',
                animation: `boot-ring 0.7s ease ${i * 0.12}s both`,
              }}
            />
          ))}
          {/* 十字准线 */}
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-neon/15" />
          <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-neon/15" />

          {/* 旋转扫描臂（扇形渐变） */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'conic-gradient(from 0deg, var(--neon-soft) 0deg, transparent 70deg, transparent 360deg)',
              animation: 'boot-sweep 2.4s linear infinite',
              maskImage: 'radial-gradient(circle, #000 0%, #000 49%, transparent 50%)',
              WebkitMaskImage: 'radial-gradient(circle, #000 0%, #000 49%, transparent 50%)',
            }}
          />

          {/* 异动光点 */}
          {BLIPS.map((b, i) => {
            const rad = (b.a * Math.PI) / 180
            const x = 50 + Math.cos(rad) * b.r * 48
            const y = 50 + Math.sin(rad) * b.r * 48
            return (
              <span
                key={i}
                className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  background: b.up ? 'var(--up)' : 'var(--down)',
                  boxShadow: `0 0 10px ${b.up ? 'var(--up)' : 'var(--down)'}`,
                  animation: `blip-in 0.5s ease ${b.d}s both`,
                }}
              />
            )
          })}

          {/* 中心 + 进度环 */}
          <svg
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            width="120"
            height="120"
            viewBox="0 0 120 120"
          >
            <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" strokeWidth="2" />
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="var(--neon)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="339"
              transform="rotate(-90 60 60)"
              style={{
                ['--dash' as string]: '339',
                animation: 'boot-progress 2.1s cubic-bezier(0.6,0,0.2,1) forwards',
                filter: 'drop-shadow(0 0 4px var(--neon))',
              }}
            />
          </svg>
          <span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neon shadow-[0_0_12px_var(--neon)]" />
        </div>

        {/* 终端启动日志 */}
        {!showGate && (
          <div className="mt-8 w-full space-y-1.5">
            {BOOT_LOG.slice(0, logCount).map((l) => (
              <div
                key={l.t}
                className="flex items-center justify-between font-mono text-[11px]"
                style={{ animation: 'boot-log 0.4s ease both' }}
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-up shadow-[0_0_6px_var(--up)]" />
                  {l.t}
                </span>
                <span className="text-neon">{l.v}</span>
              </div>
            ))}
          </div>
        )}

        {/* 进入门户 */}
        {showGate && (
          <div
            className="mt-8 flex w-full flex-col items-center text-center"
            style={{ animation: 'loader-rise 0.55s ease both' }}
          >
            <h1 className="text-balance text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
              把资金的流向，<span className="text-sheen">先你一步</span>扫描出来
            </h1>

            {/* 精简风险声明（合规所需） */}
            <div className="mt-5 flex items-start gap-2 border-l-2 border-down bg-down/10 px-3 py-2 text-left">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-down" />
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                本系统仅输出数据信号与研究参考，<span className="text-foreground">不构成投资建议</span>。
                加密资产波动剧烈，请独立判断、严格止损，盈亏自负。
              </p>
            </div>

            <button
              onClick={enter}
              className="group mt-6 flex items-center gap-2 bg-neon px-8 py-3 font-semibold text-primary-foreground transition-[box-shadow] hover:shadow-[0_0_36px_var(--neon-soft)]"
            >
              进入雷达系统
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </button>
            <span className="mt-3 text-[11px] text-muted-foreground">
              点击即表示你已知悉上述风险边界
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
