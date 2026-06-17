"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

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
    <header className="topline live-navbar radar-top-bar navbar" aria-label="Live Navbar / Banner">
      <div className="brand live-navbar__brand radar-top-bar__brand">
        <div className="brand-mark">川</div>
        <div>
          <strong>雷达中枢</strong>
          <span>公开监控 · CoinGlass 实时源 · 15m 分批扫描</span>
        </div>
      </div>

      <div className="crystal-lens live-navbar__lens radar-top-bar__lens" aria-label="雷达之眼 / Crystal Lens">
        <Image
          alt=""
          fill
          priority={false}
          sizes="(max-width: 940px) 100vw, 180px"
          src="/assets/radar-crystal-lens.png"
        />
        <span>雷达之眼</span>
      </div>

      <div className="market-tape radar-top-bar__tape" aria-label="市场滚动带">
        <div className="market-tape__track">
          <span>BTC <b>+1.8%</b> 波动扩张</span>
          <span>ENA <b>78</b> 等回踩</span>
          <span>SUI <b>69</b> 假突破观察</span>
          <span>ONDO <b>64</b> 靠近支撑</span>
          <span>TIA <b>52</b> 中位过滤</span>
          <span>BTC <b>+1.8%</b> 波动扩张</span>
          <span>ENA <b>78</b> 等回踩</span>
          <span>SUI <b>69</b> 假突破观察</span>
          <span>ONDO <b>64</b> 靠近支撑</span>
          <span>TIA <b>52</b> 中位过滤</span>
        </div>
      </div>

      <div className="top-status radar-top-bar__status">
        <div className={`scan-heartbeat scan-heartbeat--${refreshTone} scan-heartbeat--freshness-${freshnessTone}`} aria-label="扫描心跳">
          <span className="scan-heartbeat__dot" aria-hidden="true" />
          <span className="mono">扫描心跳</span>
          <strong>{refreshStateLabel}</strong>
          <small>{deltaLabel}</small>
        </div>

        <div className={`market-session-clock market-session-clock--${marketSession.tone}`} aria-label="市场时段时钟">
          <span className="mono">Market Session</span>
          <strong>{marketSession.label}</strong>
          <small>{marketSession.localTime} · {marketSession.note}</small>
        </div>

        <div className="next-scan-countdown" aria-label="下次扫描倒计时">
          <span className="mono">下次扫描</span>
          <strong>{countdownLabel}</strong>
          <small>{nextScanTime} · 自动刷新 {refreshInterval}</small>
        </div>

        <div className={`data-freshness freshness-meter freshness-meter--${freshnessTone}`} aria-label="数据新鲜度">
          <span className="freshness-meter__bar" aria-hidden="true"><i /></span>
          <span className="mono">数据新鲜度</span>
          <strong>{dataFreshnessLabel}</strong>
          <small>最后扫描 {lastScanTime} · 护栏 {staleAfterMinutes}m</small>
        </div>

        <span className="mono">
          {cadenceMinutes}m {marketStatus} / {providerLabel} / 候选池 {candidateCount}
        </span>
        <span className="mono">
          {batchNote ?? `护栏 ${staleAfterMinutes}m`} / {isRealtime ? "实时" : "预览"}
        </span>
        {requestsNote ? (
          <span className="mono">{requestsNote}</span>
        ) : null}
        {batchNote ? (
          <span className="top-status__guard">
            护栏 {staleAfterMinutes}m · 风控门 {riskGate}
          </span>
        ) : null}
        <div className="runtime-state-grid" aria-label="运行状态矩阵">
          {runtimeStates.map((state) => (
            <span className={`runtime-state runtime-state--${state.tone}`} key={state.id}>
              <b>{state.label}</b>
              <strong>{state.value}</strong>
              <small>{state.detail}</small>
            </span>
          ))}
        </div>
        <div className={`live-console live-console--${refreshTone}`}>
          <span className="mono">
            {refreshStateLabel} · {refreshInterval}
          </span>
          <button
            aria-pressed={soundEnabled}
            className={`btn btn-xs sound-toggle ${soundEnabled ? "is-on" : ""}`}
            onClick={onToggleSound}
            type="button"
          >
            {soundEnabled ? "声音开启" : "声音关闭"}
          </button>
          <span className="mono live-console__delta">{deltaLabel}</span>
        </div>
      </div>
    </header>
  );
}
