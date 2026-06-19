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
import type { MarketTicker } from "@/lib/market/types";

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

export type RadarNavigationSection = "radar" | "signals" | "review" | "journal" | "evolution" | "settings";

type TopRadarBarProps = {
  activeSection: RadarNavigationSection;
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
  onNavigate: (section: RadarNavigationSection) => void;
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
  tickers: MarketTicker[];
};

const navItems: {
  icon: typeof Sparkles;
  id: RadarNavigationSection;
  label: string;
  sublabel: string;
}[] = [
  { icon: Sparkles, id: "radar", label: "Radar", sublabel: "雷达" },
  { icon: Zap, id: "signals", label: "Signals", sublabel: "信号" },
  { icon: RefreshCw, id: "review", label: "Review", sublabel: "复盘" },
  { icon: BookOpen, id: "journal", label: "Journal", sublabel: "日志" },
  { icon: Orbit, id: "evolution", label: "Evolution", sublabel: "进化" },
  { icon: Settings, id: "settings", label: "Settings", sublabel: "设置" },
];

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

function runtimeStateById(runtimeStates: RuntimeStateView[], id: string) {
  return runtimeStates.find((state) => state.id === id);
}

function budgetFillWidth(...notes: Array<string | undefined>) {
  for (const note of notes) {
    const match = note?.match(/(\d+(?:\.\d+)?)%/u);
    const percent = match ? Number(match[1]) : NaN;

    if (Number.isFinite(percent)) {
      return `${Math.min(100, Math.max(0, percent))}%`;
    }
  }

  return "0%";
}

function compactTickerSymbol(symbol: string) {
  return symbol.replace(/USDT$/u, "");
}

function formatTickerPrice(price: number) {
  if (!Number.isFinite(price)) {
    return "--";
  }

  if (price >= 1000) {
    return price.toLocaleString("en-US", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    });
  }

  if (price >= 1) {
    return price.toLocaleString("en-US", {
      maximumFractionDigits: 3,
      minimumFractionDigits: 2,
    });
  }

  return price.toLocaleString("en-US", {
    maximumFractionDigits: 6,
    minimumFractionDigits: 4,
  });
}

function formatTickerChange(changePercent: number) {
  if (!Number.isFinite(changePercent)) {
    return "--";
  }

  const sign = changePercent > 0 ? "+" : "";

  return `${sign}${changePercent.toFixed(2)}%`;
}

function marketTapeItems(tickers: MarketTicker[]) {
  const anchors = ["BTCUSDT", "ETHUSDT"];
  const bySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));
  const anchorTickers = anchors
    .map((symbol) => bySymbol.get(symbol))
    .filter((ticker): ticker is MarketTicker => Boolean(ticker));
  const altTickers = tickers
    .filter((ticker) => !anchors.includes(ticker.symbol))
    .sort((left, right) => Math.abs(right.changePercent24h) - Math.abs(left.changePercent24h))
    .slice(0, 8);

  return [...anchorTickers, ...altTickers];
}

export function TopRadarBar({
  activeSection,
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
  onNavigate,
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
  tickers,
}: TopRadarBarProps) {
  const [countdownLabel, setCountdownLabel] = useState("等待校准");
  const sourceState = runtimeStateById(runtimeStates, "coinglass");
  const persistenceState = runtimeStateById(runtimeStates, "neon");
  const archiveState = runtimeStateById(runtimeStates, "archive");
  const cronState = runtimeStateById(runtimeStates, "cron");
  const requestBudgetWidth = budgetFillWidth(requestsNote, batchNote);
  const tapeItems = marketTapeItems(tickers);

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
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeSection;

            return (
              <button
                aria-current={isActive ? "page" : undefined}
                className={`radar-primary-nav__item ${isActive ? "is-active" : ""}`}
                key={item.label}
                onClick={() => onNavigate(item.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={16} />
                <span>{item.label}</span>
                <small>{item.sublabel}</small>
              </button>
            );
          })}
        </nav>

        <button className="radar-menu-button" aria-label="打开设置菜单" onClick={() => onNavigate("settings")} type="button">
          <Menu aria-hidden="true" size={22} />
        </button>
      </div>

      <div className="radar-runtime-bar" aria-label="系统运行状态条">
        <div className={`radar-runtime-card radar-runtime-card--${isRealtime ? "ready" : "watch"}`}>
          <Activity aria-hidden="true" size={15} />
          <div>
            <strong>{providerLabel}</strong>
            <span>{sourceState?.value ?? (isRealtime ? "实时源" : "预览源")} · {sourceState?.detail ?? marketStatus}</span>
          </div>
        </div>
        <div className={`radar-runtime-card radar-runtime-card--${persistenceState?.tone ?? "watch"}`}>
          <Zap aria-hidden="true" size={15} />
          <div>
            <strong>{persistenceState?.label ?? "Neon"}</strong>
            <span>{persistenceState?.value ?? "待检测"} · {persistenceState?.detail ?? "数据库"}</span>
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
            <strong>{archiveState?.label ?? "归档"}</strong>
            <span>{archiveState?.value ?? "0 帧"} · {archiveState?.detail ?? `下一轮 ${nextScanTime}`}</span>
          </div>
        </div>
        <div className={`radar-runtime-card radar-runtime-card--${cronState?.tone ?? "watch"}`}>
          <Moon aria-hidden="true" size={16} />
          <div>
            <strong>{cronState?.label ?? "Cron"}</strong>
            <span>{cronState?.value ?? "等待"} · {cronState?.detail ?? `最后 ${lastScanTime}`}</span>
          </div>
        </div>
        <div className="radar-runtime-budget" aria-label="今日请求预算">
          <div>
            <strong>今日请求预算</strong>
            <span>{requestsNote ?? `${candidateCount} 候选 · ${cadenceMinutes}m`}</span>
          </div>
          <i><b style={{ width: requestBudgetWidth }} /></i>
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
          {(tapeItems.length > 0 ? [...tapeItems, ...tapeItems] : []).map((ticker, index) => (
            <span key={`${ticker.exchange}-${ticker.symbol}-${index}`}>
              {compactTickerSymbol(ticker.symbol)} <b>{formatTickerChange(ticker.changePercent24h)}</b>{" "}
              {formatTickerPrice(ticker.price)}
            </span>
          ))}
          <span>{dataFreshnessLabel} · 最后扫描 {lastScanTime} · {marketStatus}</span>
          {tapeItems.length === 0 ? (
            <span>{providerLabel} 暂无 ticker · 等待下一轮扫描</span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
