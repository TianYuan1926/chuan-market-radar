import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Trophy, GitBranch } from 'lucide-react'
import { SiteNav } from '@/components/site-nav'
import { SessionBar } from '@/components/session-bar'
import { ChuanLogo } from '@/components/chuan-logo'
import { CountUp } from '@/components/count-up'
import { IntroHero } from '@/components/intro/intro-hero'
import { IntroRadar } from '@/components/intro/intro-radar'
import { IntroPipeline } from '@/components/intro/intro-pipeline'
import {
  HowItWorks,
  FeatureGrid,
  Personas,
  RankLadder,
  Faq,
} from '@/components/intro/intro-sections'
import { Reveal } from '@/components/intro/reveal'
import {
  getLeaderboardContractForPage,
  getRadarContractForPage,
} from '@/lib/frontend-contract-server'
import {
  radarSignalsToTokens,
  withLeaderboardSignalFallback,
} from '@/lib/frontend-display-adapters'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [radar, tickerLeaderboard] = await Promise.all([
    getRadarContractForPage(),
    getLeaderboardContractForPage('volume'),
  ])
  const displaySignals = withLeaderboardSignalFallback(
    radar.radarSignals,
    tickerLeaderboard.data,
  )
  const tokens = radarSignalsToTokens(displaySignals.data, tickerLeaderboard.data)
  const scan = radar.scanProof.data
  const api = radar.apiUsage.data
  const stats = [
    { v: scan.totalMonitored, suffix: '', label: '监控标的', decimals: 0 },
    { v: radar.radarSignals.data.length, suffix: '', label: '成熟信号', decimals: 0 },
    { v: scan.coverage, suffix: '%', label: '本轮深扫占比', decimals: 1 },
    { v: api.usedToday, suffix: '', label: '今日 API 调用', decimals: 0 },
  ]

  return (
    <div className="min-h-dvh bg-background">
      <SiteNav />
      <SessionBar tokens={tokens} />

      {/* HERO：掌控流向 */}
      <IntroHero />

      {/* 异动雷达扇区 */}
      <section className="relative border-t border-border">
        <div className="bg-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <Reveal className="mb-12 text-center">
            <div className="inline-flex items-center gap-2 border border-border glass px-3 py-1 text-xs text-muted-foreground">
              异动雷达 · ANOMALY RADAR
            </div>
            <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              扫描线扫过之处，<span className="text-neon">异动无所遁形</span>
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-pretty text-muted-foreground">
              监控范围以后端扫描证明为准。每一轮扫描都会标注候选、深扫、信号和数据新鲜度。
            </p>
          </Reveal>

          <Reveal delay={120}>
            <IntroRadar tokens={tokens} />
          </Reveal>
        </div>
      </section>

      {/* 工作原理：5 步流程 */}
      <HowItWorks />

      {/* 噪声 → 信号 管线 */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <Reveal className="mb-10 text-center">
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              把<span className="text-neon">噪声</span>，炼成<span className="text-neon">信号</span>
            </h2>
            <p className="mt-3 text-muted-foreground">
              海量杂乱数据流经三道引擎，收敛为一条可复核的信号流
            </p>
          </Reveal>
          <Reveal delay={120}>
            <IntroPipeline />
          </Reveal>
        </div>
      </section>

      {/* 核心能力详解 */}
      <FeatureGrid />

      {/* 能力矩阵 Bento：链接真实页面 */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <Reveal className="mb-10 text-center">
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              一套系统，<span className="text-neon">从发现到进化</span>
            </h2>
            <p className="mt-3 text-muted-foreground">点击任意模块，立即进入</p>
          </Reveal>

          <div className="grid auto-rows-[180px] gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* 雷达总控（大格） */}
            <Reveal className="sm:col-span-2 sm:row-span-2" delay={0}>
              <BentoCard
                href="/dashboard"
                title="雷达总控"
                desc="全局异动大盘，展示后端扫描覆盖、候选状态与数据源健康。"
                big
              >
                <RadarMotif />
              </BentoCard>
            </Reveal>

            {/* 信号池 */}
            <Reveal delay={80}>
              <BentoCard href="/signals" title="信号池" desc="看涨/看跌信号与风险提示实时推送。">
                <EqualizerMotif />
              </BentoCard>
            </Reveal>

            {/* 榜单 */}
            <Reveal delay={160}>
              <BentoCard href="/leaderboard" title="榜单" desc="涨跌幅、成交额、相对强弱等后端榜单。" icon={Trophy}>
                <RankMotif />
              </BentoCard>
            </Reveal>

            {/* 复盘进化（宽格） */}
            <Reveal className="sm:col-span-2" delay={120}>
              <BentoCard
                href="/review"
                title="复盘进化"
                desc="交易日记、胜率与盈亏比可视化，judgement 段位成长体系。"
                icon={GitBranch}
              >
                <GaugeMotif />
              </BentoCard>
            </Reveal>

            {/* 大盘数据 */}
            <Reveal delay={200}>
              <BentoCard href="/market" title="大盘数据" desc="宏观山寨环境、CoinGlass 衍生品与数据质量面板。">
                <SparkMotif />
              </BentoCard>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 为谁打造：用户画像 */}
      <Personas />

      {/* 段位成长体系 */}
      <RankLadder />

      {/* 数字滚动统计带 */}
      <section className="border-t border-border bg-card/30">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px overflow-hidden px-4 py-16 sm:px-6 lg:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 90} className="text-center">
              <div className="font-mono text-4xl font-bold text-neon sm:text-5xl">
                <CountUp value={s.v} decimals={s.decimals} />
                {s.suffix}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">{s.label}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 常见问题 FAQ */}
      <Faq />

      {/* CTA */}
      <section className="relative overflow-hidden border-t border-border">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(80% 120% at 50% 0%, var(--neon-soft), transparent 60%)',
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-7xl px-4 py-24 text-center sm:px-6">
          <Reveal>
            <ChuanLogo size={56} className="mb-6 justify-center" />
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-5xl">
              让资金的流向，<span className="text-neon">先你一步被看见</span>
            </h2>
            <Link
              href="/dashboard"
              className="group mt-9 inline-flex items-center gap-2 bg-neon px-8 py-4 font-semibold text-primary-foreground transition-all hover:shadow-[0_0_40px_var(--neon-soft)]"
            >
              立即开始监控
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <p className="mt-6 text-xs text-muted-foreground">
              后端契约数据仅供市场研究与系统校准，不构成投资建议
            </p>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <ChuanLogo size={26} withText />
          <span>© 2026 川 Chuan · 虚拟货币异动检测</span>
        </div>
      </footer>
    </div>
  )
}

/* ============ Bento 卡片 ============ */
function BentoCard({
  href,
  title,
  desc,
  children,
  icon: Icon,
  big = false,
}: {
  href: string
  title: string
  desc: string
  children?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  big?: boolean
}) {
  return (
    <Link
      href={href}
      className="frame shine hover-lift group relative flex h-full flex-col justify-between overflow-hidden border border-border bg-card p-5 transition-colors hover:border-neon/40"
    >
      {/* 动态motif */}
      <div className="pointer-events-none absolute inset-0 opacity-60">{children}</div>

      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-4 text-neon" />}
          <h3 className={big ? 'text-xl font-bold' : 'text-base font-semibold'}>{title}</h3>
        </div>
        <ArrowUpRight className="size-4 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-neon" />
      </div>

      <p className="relative max-w-[26ch] text-sm leading-relaxed text-muted-foreground">{desc}</p>
    </Link>
  )
}

/* ============ CSS / SVG 动态motif（无需 JS） ============ */
function RadarMotif() {
  return (
    <div className="absolute -right-10 -top-10 size-64">
      {[1, 0.66, 0.33].map((r, i) => (
        <span
          key={i}
          className="absolute rounded-full border border-neon/20"
          style={{ inset: `${(1 - r) * 50}%` }}
        />
      ))}
      <div
        className="animate-radar-rotate absolute inset-0 rounded-full"
        style={{
          background:
            'conic-gradient(from 0deg, var(--neon-soft) 0deg, oklch(0.77 0.16 62 / 0.25) 30deg, transparent 70deg)',
        }}
      />
      <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neon" />
    </div>
  )
}

function EqualizerMotif() {
  return (
    <div className="absolute bottom-0 right-4 flex h-20 items-end gap-1.5">
      {[1, 2, 3, 4, 1, 2].map((n, i) => (
        <span
          key={i}
          className="w-2 bg-neon/50"
          style={{
            height: '100%',
            transformOrigin: 'bottom',
            animation: `eq-${n} ${1.4 + (i % 3) * 0.3}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  )
}

function RankMotif() {
  return (
    <div className="absolute bottom-4 right-4 flex w-28 flex-col gap-1.5">
      {[100, 72, 48].map((w, i) => (
        <span
          key={i}
          className="animate-bar-grow h-2"
          style={{
            width: `${w}%`,
            background: i === 0 ? 'var(--neon)' : 'var(--neon-soft)',
            animationDelay: `${i * 140}ms`,
            transformOrigin: 'left',
          }}
        />
      ))}
    </div>
  )
}

function GaugeMotif() {
  return (
    <svg className="absolute -right-6 top-1/2 size-44 -translate-y-1/2 -rotate-90" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="6" />
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke="var(--neon)"
        strokeWidth="6"
        strokeLinecap="butt"
        strokeDasharray="251"
        strokeDashoffset="75"
        style={{ ['--c' as string]: '251', animation: 'gauge-sweep 1.6s ease-out both' }}
      />
    </svg>
  )
}

function SparkMotif() {
  return (
    <svg className="absolute bottom-3 right-3 h-16 w-36" viewBox="0 0 120 48" preserveAspectRatio="none">
      <polyline
        points="0,38 16,30 28,34 44,18 60,24 76,10 92,16 108,6 120,12"
        fill="none"
        stroke="var(--neon)"
        strokeWidth="1.5"
        strokeDasharray="6 5"
        style={{ animation: 'flow-dash 8s linear infinite' }}
      />
      <polyline
        points="0,38 16,30 28,34 44,18 60,24 76,10 92,16 108,6 120,12"
        fill="none"
        stroke="var(--neon)"
        strokeWidth="1.5"
        opacity="0.25"
      />
    </svg>
  )
}
