"use client";

import Image from "next/image";

type MarketSessionView = {
  label: string;
  localTime: string;
  note: string;
  tone: string;
};

type TopRadarBarProps = {
  batchNote?: string;
  cadenceMinutes: number;
  candidateCount: number;
  deltaLabel: string;
  isRealtime: boolean;
  marketSession: MarketSessionView;
  marketStatus: string;
  nextScanTime: string;
  onToggleSound: () => void;
  providerLabel: string;
  refreshInterval: string;
  refreshStateLabel: string;
  refreshTone: string;
  requestsNote?: string;
  riskGate: string;
  soundEnabled: boolean;
  staleAfterMinutes: number;
};

export function TopRadarBar({
  batchNote,
  cadenceMinutes,
  candidateCount,
  deltaLabel,
  isRealtime,
  marketSession,
  marketStatus,
  nextScanTime,
  onToggleSound,
  providerLabel,
  refreshInterval,
  refreshStateLabel,
  refreshTone,
  requestsNote,
  riskGate,
  soundEnabled,
  staleAfterMinutes,
}: TopRadarBarProps) {
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
        <div className={`market-session-clock market-session-clock--${marketSession.tone}`} aria-label="市场时段时钟">
          <span className="mono">Market Session</span>
          <strong>{marketSession.label}</strong>
          <small>{marketSession.localTime} · {marketSession.note}</small>
        </div>
        <strong>下次扫描 {nextScanTime}</strong>
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
