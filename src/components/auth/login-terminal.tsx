'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChuanLogo } from '@/components/chuan-logo'
import {
  Crosshair,
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  Radar,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// 核验阶段：表单 -> 扫描中 -> 成功
type Phase = 'idle' | 'scanning' | 'granted'

// 雷达终端启动日志（纯氛围展示）
const BOOT_LOGS = [
  '> 初始化雷达身份模块…',
  '> 链接安全信道 [AES-256] … OK',
  '> 等待操作员凭证输入',
]

// 核验过程中的日志（前端氛围，真实校验由后端完成）
const VERIFY_LOGS = [
  '> 接收凭证指纹…',
  '> 比对操作员身份…',
  '> 校验访问权限等级…',
  '> 身份核验通过 ✓',
]

export function LoginTerminal() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const logTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  // 启动日志逐行出现
  useEffect(() => {
    const bootTimers: ReturnType<typeof setTimeout>[] = []
    BOOT_LOGS.forEach((line, i) => {
      const t = setTimeout(() => setLogs((prev) => [...prev, line]), 400 + i * 450)
      bootTimers.push(t)
      logTimers.current.push(t)
    })
    return () => bootTimers.forEach(clearTimeout)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!account.trim() || !password.trim()) {
      setError('请输入操作员账号与密钥')
      return
    }

    // 服务端会话是唯一登录判定；动画只负责保留原前端核验体验。
    setPhase('scanning')
    setLogs([])
    VERIFY_LOGS.forEach((line, i) => {
      const t = setTimeout(
        () => setLogs((prev) => [...prev, line]),
        300 + i * 520,
      )
      logTimers.current.push(t)
    })

    const done = setTimeout(async () => {
      let authenticated = false
      try {
        const response = await fetch('/api/auth/session', {
          body: JSON.stringify({
            account: account.trim(),
            password,
            remember,
          }),
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        })
        const body = await response.json().catch(() => null)
        authenticated = response.ok && Boolean(body?.authenticated)
      } catch {
        authenticated = false
      }

      if (!authenticated) {
        setPhase('idle')
        setError('身份核验失败，请检查账号或密钥')
        return
      }

      setPhase('granted')
      try {
        // 服务端会话是主凭证；本地标记只做离线兜底。
        const store = remember ? window.localStorage : window.sessionStorage
        store.setItem('chuan_operator', account.trim())
      } catch {
        /* 忽略存储异常 */
      }
      const go = setTimeout(() => {
        // 通知全站门禁（AuthGate）刷新登录态并放行，再进入主控台
        try {
          window.dispatchEvent(new Event('chuan:auth'))
        } catch {
          /* 忽略 */
        }
        router.push('/')
      }, 1100)
      logTimers.current.push(go)
    }, 300 + VERIFY_LOGS.length * 520 + 200)
    logTimers.current.push(done)
  }

  const busy = phase !== 'idle'

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-4 py-10">
      {/* 背景：漂移网格 + 顶部光晕 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          animation: 'grid-drift 24s linear infinite',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, var(--neon-soft), transparent 70%)',
        }}
      />

      <div className="relative grid w-full max-w-4xl grid-cols-1 border border-border glass shadow-2xl md:grid-cols-[1fr_1.05fr]">
        {/* 左：雷达核验可视化 */}
        <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-card/40 p-7 md:flex">
          <div className="flex items-center gap-2 text-xs tracking-[0.3em] text-muted-foreground">
            <Radar className="size-4 text-neon" />
            身份核验终端
          </div>

          {/* 旋转雷达 */}
          <div className="relative mx-auto my-6 grid size-52 place-items-center">
            {/* 同心圈 */}
            {[1, 0.68, 0.36].map((s, i) => (
              <span
                key={i}
                className="absolute rounded-full border border-neon/25"
                style={{ width: `${s * 100}%`, height: `${s * 100}%` }}
              />
            ))}
            {/* 十字准线 */}
            <span className="absolute h-full w-px bg-neon/15" />
            <span className="absolute h-px w-full bg-neon/15" />
            {/* 扫描扇形 */}
            <span
              className="absolute size-full animate-radar-rotate"
              style={{
                background:
                  'conic-gradient(from 0deg, var(--neon-soft), transparent 70deg)',
                borderRadius: '9999px',
              }}
            />
            {/* 中心准星 */}
            <Crosshair
              className={cn(
                'relative size-8 text-neon transition-transform',
                busy && 'scale-110',
              )}
              style={
                phase === 'scanning'
                  ? { animation: 'glow-breathe 1.2s ease-in-out infinite' }
                  : undefined
              }
            />
            {/* 成功锁定环 */}
            {phase === 'granted' && (
              <span
                className="absolute size-full rounded-full border-2 border-up"
                style={{ animation: 'pulse-ring 1.2s ease-out' }}
              />
            )}
          </div>

          {/* 终端日志 */}
          <div className="min-h-[84px] space-y-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {logs.map((line, i) => (
              <div
                key={i}
                style={{ animation: 'float-up 0.4s ease both' }}
                className={cn(
                  line.includes('✓') && 'text-up',
                  line.includes('OK') && 'text-neon',
                )}
              >
                {line}
              </div>
            ))}
            {busy && phase === 'scanning' && (
              <span className="inline-block h-3 w-1.5 animate-pulse bg-neon align-middle" />
            )}
          </div>
        </aside>

        {/* 右：登录表单 */}
        <section className="flex flex-col justify-center p-7 sm:p-10">
          <div className="mb-7">
            <ChuanLogo size={40} withText />
          </div>

          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            操作员身份核验
          </h1>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
            输入你的专属凭证，雷达将核验身份后授予系统访问权限。
          </p>

          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
            {/* 账号 */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs tracking-wider text-muted-foreground">
                操作员账号
              </span>
              <div className="group flex items-center gap-2.5 border border-input bg-background/60 px-3 py-2.5 transition-colors focus-within:border-neon">
                <User className="size-4 shrink-0 text-muted-foreground group-focus-within:text-neon" />
                <input
                  type="text"
                  autoComplete="username"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  disabled={busy}
                  placeholder="代号 / 邮箱"
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-60"
                />
              </div>
            </label>

            {/* 密码 */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs tracking-wider text-muted-foreground">
                访问密钥
              </span>
              <div className="group flex items-center gap-2.5 border border-input bg-background/60 px-3 py-2.5 transition-colors focus-within:border-neon">
                <Lock className="size-4 shrink-0 text-muted-foreground group-focus-within:text-neon" />
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  placeholder="••••••••"
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  disabled={busy}
                  aria-label={showPw ? '隐藏密钥' : '显示密钥'}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-neon"
                >
                  {showPw ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </label>

            {/* 记住 + 找回 */}
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setRemember((v) => !v)}
                disabled={busy}
                className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <span
                  className={cn(
                    'grid size-4 place-items-center border transition-colors',
                    remember
                      ? 'border-neon bg-neon text-primary-foreground'
                      : 'border-input',
                  )}
                >
                  {remember && <ShieldCheck className="size-3" />}
                </span>
                保持登录
              </button>
              <button
                type="button"
                className="text-muted-foreground transition-colors hover:text-neon"
              >
                忘记密钥？
              </button>
            </div>

            {/* 错误提示 */}
            {error && (
              <div
                className="border border-down/40 bg-down/10 px-3 py-2 text-xs text-down"
                style={{ animation: 'float-up 0.3s ease both' }}
              >
                {error}
              </div>
            )}

            {/* 提交 */}
            <button
              type="submit"
              disabled={busy}
              className={cn(
                'shine group relative mt-1 flex items-center justify-center gap-2 bg-neon px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-80',
              )}
            >
              {phase === 'idle' && (
                <>
                  核验身份并进入
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
              {phase === 'scanning' && (
                <>
                  <Radar className="size-4 animate-spin" />
                  雷达核验中…
                </>
              )}
              {phase === 'granted' && (
                <>
                  <ShieldCheck className="size-4" />
                  核验通过，正在进入
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            首次接入雷达？{' '}
            <button className="text-neon underline-offset-4 hover:underline">
              申请操作员权限
            </button>
          </p>
        </section>
      </div>
    </main>
  )
}
