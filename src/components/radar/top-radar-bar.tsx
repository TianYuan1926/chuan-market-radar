"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Activity,
  BarChart3,
  BookOpen,
  CloudRain,
  Gauge,
  Menu,
  Moon,
  Orbit,
  RefreshCw,
  Settings,
  Sparkles,
  Zap,
} from "lucide-react";

type MarketSessionView = {
  label: string;
  localTime: string;
  note: string;
  tone: string;
};

export type RuntimeStateTone = "blocked" | "ready" | "stale" | "watch";

export type RuntimeStateView = {
  detail: string;
  id: string;
  label: string;
  tone: RuntimeStateTone;
  value: string;
};

type TopRadarBarProps = {
  batchNote?: string;
  cadenceMinutes: number;
  candidateCount: number;
  dataFreshnessLabel: string;
  deltaLabel: string;
  freshnessTone: string;
  isRealtime: boolean;
  lastScanTime: string;
  marketSession: MarketSessionView;
  marketStatus: string;
  nextScanAt: string;
  nextScanTime: string;
  onToggleSound: () => void;
  providerLabel: string;
  refreshInterval: string;
  refreshStateLabel: string;
  refreshTone: string;
  requestsNote?: string;
  riskGate: string;
  runtimeStates: RuntimeStateView[];
  soundEnabled: boolean;
  staleAfterMinutes: number;
};

export function formatCountdownLabel(nextScanAt: string, now = new Date()) {
  const targetTime = new Date(nextScanAt).getTime();

  if (Number.isNaN(targetTime)) {
    return "等待调度";
  }

  const remainingMs = targetTime - now.getTime();

  if (remainingMs <= 0) {
    return "等待触发";
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;

    return `${hours}h ${restMinutes.toString().padStart(2, "0")}m`;
  }

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function TopRadarBar({
  batchNote,
  cadenceMinutes,
  candidateCount,
  dataFreshnessLabel,
  deltaLabel,
  freshnessTone,
  isRealtime,
  lastScanTime,
  marketSession,
  marketStatus,
  nextScanAt,
  nextScanTime,
  onToggleSound,
  providerLabel,
  refreshInterval,
  refreshStateLabel,
  refreshTone,
  requestsNote,
  riskGate,
  runtimeStates,
  soundEnabled,
  staleAfterMinutes,
}: TopRadarBarProps) {
  const [countdownLabel, setCountdownLabel] = useState("等待校准");
  const navItems = [
    { icon: Sparkles, label: "Radar", sublabel: "雷达" },
    { icon: Zap, label: "Signals", sublabel: "信号" },
    { icon: RefreshCw, label: "Review", sublabel: "复盘" },
    { icon: BookOpen, label: "Journal", sublabel: "日志" },
    { icon: Orbit, label: "Evolution", sublabel: "进化" },
    { icon: Settings, label: "Settings", sublabel: "设置" },
  ];

  useEffect(() => {
    function tick() {
      setCountdownLabel(formatCountdownLabel(nextScanAt));
    }

    tick();

    const timer = window.setInterval(tick, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [nextScanAt]);

  return (
    <header className="radar-header-shell crystal-brand-banner crystal-brand-banner__top" aria-label="Live Navbar / Banner">
      <div className="radar-header-main navbar">
        <div className="brand live-navbar__brand radar-top-bar__brand">
          <div className="brand-mark">川</div>
          <div>
            <strong>川 Market Radar</strong>
            <span>加密山寨趋势雷达 · 专注趋势切换</span>
          </div>
        </div>

        <div className="crystal-lens liquid-brand-lens live-navbar__lens radar-top-bar__lens" aria-label="雷达之眼 / Crystal Lens">
          <Image
            alt=""
            fill
            loading="eager"
            priority
            sizes="(max-width: 940px) 100vw, 360px"
            src="/assets/radar-crystal-lens.png"
          />
          <span>雷达之眼</span>
        </div>

        <nav className="radar-primary-nav" aria-label="川 Market Radar 主导航">
          {navItems.map((item, index) => {
            const Icon = item.icon;

            return (
              <button
                aria-current={index === 0 ? "page" : undefined}
                className={`radar-primary-nav__item ${index === 0 ? "is-active" : ""}`}
                key={item.label}
                type="button"
              >
                <Icon aria-hidden="true" size={16} />
                <span>{item.label}</span>
                <small>{item.sublabel}</small>
              </button>
            );
          })}
        </nav>

        <button className="radar-menu-button" aria-label="打开菜单" type="button">
          <Menu aria-hidden="true" size={22} />
        </button>
      </div>

      <div className="radar-runtime-bar" aria-label="系统运行状态条">
        <div className={`radar-runtime-card radar-runtime-card--${isRealtime ? "ready" : "watch"}`}>
          <Activity aria-hidden="true" size={15} />
          <div>
            <strong>{providerLabel} Live</strong>
            <span>{isRealtime ? "API 延迟 82ms" : "预览源"} · {marketStatus}</span>
          </div>
        </div>
        <div className={`radar-runtime-card radar-runtime-card--${runtimeStates[1]?.tone ?? "watch"}`}>
          <Zap aria-hidden="true" size={15} />
          <div>
            <strong>Neon Ready</strong>
            <span>{runtimeStates[1]?.detail ?? "持久化"} · {runtimeStates[1]?.value ?? "数据库"}</span>
          </div>
        </div>
        <div className={`radar-runtime-card radar-runtime-card--scan scan-heartbeat next-scan-countdown scan-heartbeat--${refreshTone} scan-heartbeat--freshness-${freshnessTone}`}>
          <Gauge aria-hidden="true" size={17} />
          <span className="scan-heartbeat__dot" aria-hidden="true" />
          <div>
            <span>下一轮扫描</span>
            <strong>{countdownLabel}</strong>
            <small>{refreshStateLabel} · {deltaLabel}</small>
          </div>
        </div>
        <div className={`radar-runtime-card market-session-clock--${marketSession.tone}`}>
          <BarChart3 aria-hidden="true" size={16} />
          <div>
            <strong>{marketSession.label}</strong>
            <span>{marketSession.localTime} · {marketSession.note}</span>
          </div>
        </div>
        <div className="radar-runtime-card">
          <CloudRain aria-hidden="true" size={16} />
          <div>
            <strong>伦敦盘</strong>
            <span>{nextScanTime} · 等待中</span>
          </div>
        </div>
        <div className="radar-runtime-card">
          <Moon aria-hidden="true" size={16} />
          <div>
            <strong>纽约盘</strong>
            <span>20:42:17 · 等待中</span>
          </div>
        </div>
        <div className="radar-runtime-budget" aria-label="今日请求预算">
          <div>
            <strong>今日请求预算</strong>
            <span>{requestsNote ?? `${candidateCount} 候选 · ${cadenceMinutes}m`}</span>
          </div>
          <i><b style={{ width: batchNote ? "36.9%" : "24%" }} /></i>
          <small>{batchNote ?? `护栏 ${staleAfterMinutes}m · 风控门 ${riskGate}`}</small>
        </div>
        <div className={`radar-runtime-card data-freshness freshness-meter freshness-meter--${freshnessTone}`}>
          <div>
            <span>数据新鲜度</span>
            <strong>{dataFreshnessLabel}</strong>
            <small>{refreshInterval} 自动轮询 · 最后 {lastScanTime}</small>
          </div>
          <span className="freshness-meter__bar" aria-hidden="true"><i /></span>
        </div>
        <button
          aria-pressed={soundEnabled}
          className={`btn btn-xs sound-toggle ${soundEnabled ? "is-on" : ""}`}
          onClick={onToggleSound}
          type="button"
        >
          {soundEnabled ? "声音开启" : "声音关闭"}
        </button>
        <div className={`live-console live-console--${refreshTone}`} aria-label="实时控制台">
          <span className="mono">实时状态 · {refreshStateLabel}</span>
          <span className="mono">{dataFreshnessLabel}</span>
        </div>
        <div className="runtime-state-grid" aria-label="运行状态矩阵">
          {runtimeStates.map((state) => (
            <div className={`runtime-state runtime-state--${state.tone}`} key={state.id}>
              <b>{state.label}</b>
              <strong>{state.value}</strong>
              <small>{state.detail}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="market-tape radar-market-ticker" aria-label="市场快讯 ticker">
        <div className="market-tape__track">
          <span>BTC <b>+1.24%</b> 67,892.1</span>
          <span>ETH <b>-0.68%</b> 3,712.45</span>
          <span>SOL <b>+2.31%</b> 153.21</span>
          <span>BNB <b>+0.92%</b> 612.11</span>
          <span>XRP <b>-0.35%</b> 0.5221</span>
          <span>DOGE <b>+1.12%</b> 0.1287</span>
          <span>AVAX <b>+1.85%</b> 36.24</span>
          <span>SUI <b>+2.67%</b> 1.82</span>
          <span>{dataFreshnessLabel} · 最后扫描 {lastScanTime}</span>
          <span>BTC <b>+1.24%</b> 67,892.1</span>
          <span>ETH <b>-0.68%</b> 3,712.45</span>
          <span>SOL <b>+2.31%</b> 153.21</span>
        </div>
      </div>
    </header>
  );
}
