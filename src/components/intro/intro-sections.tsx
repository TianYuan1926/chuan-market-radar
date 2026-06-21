'use client'

import {
  Database,
  Radar,
  Filter,
  BellRing,
  GitBranch,
  Crosshair,
  Waves,
  ShieldCheck,
  Gauge,
  Eye,
  Layers,
  Zap,
  ChevronDown,
} from 'lucide-react'
import { Reveal } from '@/components/intro/reveal'

/* ============================================================
   工作原理：从链上数据到可执行信号的 5 步流程
   ============================================================ */
const STEPS = [
  {
    icon: Database,
    k: '01',
    title: '接入市场数据',
    desc: '聚合交易所合约行情、CoinGlass 衍生品、扫描归档与复盘样本，形成统一事实源。',
  },
  {
    icon: Radar,
    k: '02',
    title: '雷达全网扫描',
    desc: '按轻扫、候选、深扫、证据融合分层推进，兼顾覆盖率和 CoinGlass 调用预算。',
  },
  {
    icon: Filter,
    k: '03',
    title: '噪声炼成信号',
    desc: '盘面结构、衍生品、量能、相对强弱和风险门控共同筛除低质量候选。',
  },
  {
    icon: BellRing,
    k: '04',
    title: '分层展示信号',
    desc: '区分轻扫标记、深扫候选、证据信号和计划就绪，避免把候选误当交易计划。',
  },
  {
    icon: GitBranch,
    k: '05',
    title: '复盘沉淀进化',
    desc: '用信号生命周期、MFE/MAE、漏判复查和策略分型统计积累可复盘样本。',
  },
]

export function HowItWorks() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <Reveal className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 border border-border glass px-3 py-1 text-xs text-muted-foreground">
            工作原理 · HOW IT WORKS
          </div>
          <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            从一条链上数据，到<span className="text-neon">一次精准出手</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-muted-foreground">
            五个环节闭环运转，让信息差成为你的优势
          </p>
        </Reveal>

        <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* 连接横线（大屏） */}
          <div
            className="pointer-events-none absolute left-0 right-0 top-7 hidden h-px lg:block"
            style={{
              background:
                'linear-gradient(to right, transparent, var(--border) 8%, var(--border) 92%, transparent)',
            }}
            aria-hidden
          />
          {STEPS.map((s, i) => (
            <Reveal key={s.k} delay={i * 90}>
              <div className="frame shine hover-lift group relative flex h-full flex-col border border-border bg-card p-5">
                <div className="relative flex items-center justify-between">
                  <span className="flex size-14 items-center justify-center border border-neon/30 bg-background transition-colors group-hover:border-neon">
                    <s.icon className="size-6 text-neon" />
                  </span>
                  <span className="font-mono text-3xl font-bold text-border transition-colors group-hover:text-neon/40">
                    {s.k}
                  </span>
                </div>
                <h3 className="mt-5 text-base font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============================================================
   核心能力详解
   ============================================================ */
const FEATURES = [
  {
    icon: Crosshair,
    title: '异动狙击',
    desc: '锁定突发放量与资金异动，第一时间标记入场窗口与目标价、止损价。',
  },
  {
    icon: Waves,
    title: '资金流向追踪',
    desc: '可视化主力净流入/流出，看清资金之川的真实流向而非表面价格。',
  },
  {
    icon: Gauge,
    title: '分层扫描节奏',
    desc: '轻扫负责覆盖全市场，深扫负责验证核心候选，前端显式标注数据新鲜度。',
  },
  {
    icon: ShieldCheck,
    title: '风险等级提示',
    desc: '每条信号附带风险评级与杠杆建议，帮助你控制回撤而非盲目追涨。',
  },
  {
    icon: Eye,
    title: '全市场覆盖',
    desc: '覆盖数量以后端扫描证明为准，避免页面展示和真实扫描能力脱节。',
  },
  {
    icon: Layers,
    title: '多维度交叉验证',
    desc: '成交、持仓、资金费率、相对强弱多源印证，过滤单一指标的误判。',
  },
]

export function FeatureGrid() {
  return (
    <section className="border-t border-border">
      <div className="bg-grid absolute inset-0 opacity-0" aria-hidden />
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <Reveal className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 border border-border glass px-3 py-1 text-xs text-muted-foreground">
            核心能力 · CAPABILITIES
          </div>
          <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            不止是提醒，更是<span className="text-neon">一整套交易决策武器</span>
          </h2>
        </Reveal>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 90}>
              <div className="frame shine hover-lift group h-full border border-border bg-card p-6 transition-colors hover:border-neon/40">
                <span className="flex size-11 items-center justify-center border border-border bg-background transition-colors group-hover:border-neon/60">
                  <f.icon className="size-5 text-neon" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============================================================
   为谁打造：用户画像
   ============================================================ */
const PERSONAS = [
  {
    tag: '短线狙击手',
    icon: Crosshair,
    pain: '盘面太快，总是慢半拍',
    gain: '分层扫描 + 证据链 + 风控门控，先把候选和交易计划分清楚。',
  },
  {
    tag: '波段猎人',
    icon: Waves,
    pain: '看不清主力在悄悄做什么',
    gain: '资金净流向与持仓变化追踪，提前埋伏趋势启动点。',
  },
  {
    tag: '风控守门人',
    icon: ShieldCheck,
    pain: '情绪上头，回撤控制不住',
    gain: '风险评级 + 复盘进化体系，用数据约束每一次出手。',
  },
]

export function Personas() {
  return (
    <section className="border-t border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <Reveal className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 border border-border glass px-3 py-1 text-xs text-muted-foreground">
            为谁打造 · FOR WHOM
          </div>
          <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            无论你是哪种猎手，<span className="text-neon">川都为你校准</span>
          </h2>
        </Reveal>

        <div className="grid gap-3 lg:grid-cols-3">
          {PERSONAS.map((p, i) => (
            <Reveal key={p.tag} delay={i * 110}>
              <div className="frame hover-lift group flex h-full flex-col border border-border bg-card p-6 transition-colors hover:border-neon/40">
                <div className="flex items-center gap-3">
                  <span className="flex size-12 items-center justify-center border border-neon/30 bg-background">
                    <p.icon className="size-6 text-neon" />
                  </span>
                  <h3 className="text-xl font-bold">{p.tag}</h3>
                </div>
                <div className="mt-5 border-l-2 border-destructive/50 pl-3">
                  <div className="text-xs text-muted-foreground">痛点</div>
                  <div className="mt-1 text-sm text-foreground/80">{p.pain}</div>
                </div>
                <div className="mt-4 border-l-2 border-neon pl-3">
                  <div className="text-xs text-neon">川的解法</div>
                  <div className="mt-1 text-sm leading-relaxed text-foreground/90">{p.gain}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============================================================
   段位成长体系
   ============================================================ */
const RANKS = [
  { name: '初探', en: 'SCOUT', pct: 20 },
  { name: '猎手', en: 'HUNTER', pct: 45 },
  { name: '狙击', en: 'SNIPER', pct: 68 },
  { name: '主宰', en: 'MASTER', pct: 88 },
  { name: '川主', en: 'LEGEND', pct: 100 },
]

export function RankLadder() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <Reveal className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 border border-border glass px-3 py-1 text-xs text-muted-foreground">
            成长体系 · JUDGEMENT RANK
          </div>
          <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            每一次复盘，都是<span className="text-neon">段位的攀升</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-muted-foreground">
            以胜率、盈亏比与纪律性综合评定，从初探一路进化到川主
          </p>
        </Reveal>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {RANKS.map((r, i) => (
            <Reveal key={r.en} delay={i * 90}>
              <div className="frame hover-lift group relative flex h-full flex-col items-center border border-border bg-card p-5 text-center">
                <div className="font-mono text-xs text-muted-foreground">LV.{i + 1}</div>
                <div className="mt-2 text-2xl font-bold transition-colors group-hover:text-neon">
                  {r.name}
                </div>
                <div className="font-mono text-[11px] tracking-widest text-neon/60">{r.en}</div>
                <div className="mt-4 h-1.5 w-full bg-border">
                  <div
                    className="animate-bar-grow h-full bg-neon"
                    style={{ width: `${r.pct}%`, transformOrigin: 'left', animationDelay: `${i * 120}ms` }}
                  />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============================================================
   常见问题 FAQ（原生 details/summary，无需额外状态）
   ============================================================ */
const FAQS = [
  {
    q: '川的异动信号是如何产生的？',
    a: '川聚合全网交易所与链上数据，通过成交量、资金净流、持仓变化等多维指标交叉验证，经三道过滤引擎剔除噪声后生成高置信度信号。',
  },
  {
    q: '信号延迟有多低？',
    a: '当前以分层扫描和数据新鲜度为核心。页面会展示覆盖率、扫描状态和缓存/过期状态。',
  },
  {
    q: '我需要懂技术分析才能使用吗？',
    a: '不需要。每条信号都附带方向、异动强度、建议入场区间与风险等级，复盘进化模块还会帮你沉淀经验、逐步成长。',
  },
  {
    q: '川会替我自动交易吗？',
    a: '不会。川是异动检测与决策辅助系统，最终的交易决策与执行始终掌握在你自己手中。',
  },
  {
    q: '当前展示的数据是真实的吗？',
    a: '核心雷达、榜单、系统、复盘和单币档案已接入后端契约数据；缺失的数据会显示等待或空态，不再用模拟数据冒充真实结果。',
  },
]

export function Faq() {
  return (
    <section className="border-t border-border bg-card/30">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <Reveal className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 border border-border glass px-3 py-1 text-xs text-muted-foreground">
            常见问题 · FAQ
          </div>
          <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            还有疑问？<span className="text-neon">这里有答案</span>
          </h2>
        </Reveal>

        <div className="flex flex-col gap-3">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={i * 70}>
              <details className="frame group border border-border bg-card transition-colors hover:border-neon/40 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5">
                  <span className="flex items-center gap-3 text-base font-semibold">
                    <Zap className="size-4 shrink-0 text-neon" />
                    {f.q}
                  </span>
                  <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="px-5 pb-5 pl-12 text-sm leading-relaxed text-muted-foreground">
                  {f.a}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
