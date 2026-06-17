"use client";

import {
  Activity,
  CloudLightning,
  Gauge,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Waves,
  type LucideIcon,
} from "lucide-react";
import type { MacroWeatherRegime, MacroWeatherReport, MacroWeatherTone } from "@/lib/market/macro-weather";

type MacroWeatherPanelProps = {
  ariaLabel?: string;
  report: MacroWeatherReport;
  selectedSymbol?: string;
};

const regimeLabels: Record<MacroWeatherRegime, string> = {
  chop: "震荡",
  deleveraging: "去杠杆",
  headwind: "逆风",
  leverage_crowded: "杠杆拥挤",
  tailwind: "顺风",
  unknown: "未知",
  volatility_expansion: "波动扩张",
};

const regimeIcons: Record<MacroWeatherRegime, LucideIcon> = {
  chop: Waves,
  deleveraging: TrendingDown,
  headwind: TrendingDown,
  leverage_crowded: Gauge,
  tailwind: TrendingUp,
  unknown: Activity,
  volatility_expansion: CloudLightning,
};

const toneLabels: Record<MacroWeatherTone, string> = {
  bad: "防守",
  good: "顺风",
  neutral: "观察",
  warn: "警戒",
};

const regimeToneClasses: Record<MacroWeatherRegime, string> = {
  chop: "macro-weather-regime--chop",
  deleveraging: "macro-weather-regime--deleveraging",
  headwind: "macro-weather-regime--headwind",
  leverage_crowded: "macro-weather-regime--leverage_crowded",
  tailwind: "macro-weather-regime--tailwind",
  unknown: "macro-weather-regime--unknown",
  volatility_expansion: "macro-weather-regime--volatility_expansion",
};

function formatPercent(value: number | null) {
  if (value === null) {
    return "等待";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatScore(value: number | null) {
  return value === null ? "等待" : value.toFixed(1);
}

function formatUsd(value: number) {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }

  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }

  return `$${value.toFixed(0)}`;
}

function compactSymbol(symbol: string) {
  return symbol.replace("USDT", "");
}

function requestPolicyLabel(value: MacroWeatherReport["requestPolicy"]) {
  return value === "no_extra_requests" ? "不新增请求" : value;
}

function weightPolicyLabel(value: MacroWeatherReport["canMutateWeights"]) {
  return value ? "可改权重" : "不改权重";
}

export function MacroWeatherPanel({
  ariaLabel = "Macro Radar 大盘天气",
  report,
  selectedSymbol,
}: MacroWeatherPanelProps) {
  const PrimaryIcon = regimeIcons[report.primaryRegime];
  const breadth = report.metrics.altcoinAdvanceDecline;
  const selectedBase = selectedSymbol ? selectedSymbol.replace("USDT", "") : undefined;

  return (
    <section
      aria-label={ariaLabel}
      className={`module macro-weather-panel macro-weather-panel--${report.primaryRegime}`}
    >
      <div className="module-head">
        <div>
          <h2>大盘天气</h2>
          <span className="macro-weather-panel__legend">BTC / ETH · 山寨环境</span>
        </div>
        <span className="tag">不抢山寨主线</span>
      </div>

      <div className="macro-weather-panel__hero">
        <span className={`macro-weather-panel__badge macro-weather-panel__badge--${report.tone}`}>
          <PrimaryIcon aria-hidden="true" size={15} />
          {report.statusLabel}
        </span>
        <strong>{report.summary}</strong>
        <small>
          {selectedBase
            ? `${selectedBase} 只借用该天气层判断顺逆风，触发仍看自身证据。`
            : "等待候选后联动解释大盘顺逆风。"}
        </small>
      </div>

      <div className="macro-weather-panel__anchors" aria-label="BTC ETH anchor context">
        {report.anchors.map((anchor) => (
          <article className="macro-weather-anchor" key={anchor.symbol}>
            <div>
              <b>{compactSymbol(anchor.symbol)}</b>
              <span>{formatPercent(anchor.changePercent24h)}</span>
            </div>
            <small>资金 Z {formatScore(anchor.fundingRateZScore)}</small>
            <small>OI {formatPercent(anchor.openInterestChangePercent)}</small>
          </article>
        ))}
      </div>

      <div className="macro-weather-panel__grid" aria-label="大盘天气指标">
        <span>
          <b>{formatPercent(report.metrics.averageAnchorChangePercent)}</b>
          BTC/ETH 均值
        </span>
        <span>
          <b>{formatPercent(report.metrics.anchorDivergencePercent)}</b>
          锚点分歧
        </span>
        <span>
          <b>{formatUsd(report.metrics.liquidationUsd24h)}</b>
          24h 清算
        </span>
        <span>
          <b>{breadth.breadthPercent === null ? "等待" : `${breadth.breadthPercent.toFixed(0)}%`}</b>
          山寨宽度
        </span>
      </div>

      <div className="macro-weather-panel__policy" aria-label="天气层边界">
        <span><ShieldCheck aria-hidden="true" size={13} />{requestPolicyLabel(report.requestPolicy)}</span>
        <span><ShieldCheck aria-hidden="true" size={13} />{weightPolicyLabel(report.canMutateWeights)}</span>
        <span><Activity aria-hidden="true" size={13} />{toneLabels[report.tone]}</span>
      </div>

      <div className="macro-weather-panel__evidence" aria-label="大盘天气证据">
        {report.evidence.map((item) => (
          <span className={`macro-weather-evidence macro-weather-evidence--${item.tone}`} key={item.label}>
            <b>{item.label}</b>
            <small>{item.value}</small>
          </span>
        ))}
      </div>

      <div className="macro-weather-panel__regimes" aria-label="天气因子">
        {report.regimes.map((regime) => {
          const Icon = regimeIcons[regime.key];

          return (
            <span
              className={[
                "macro-weather-regime",
                regimeToneClasses[regime.key],
                regime.active ? "is-active" : "",
              ].filter(Boolean).join(" ")}
              key={regime.key}
            >
              <Icon aria-hidden="true" size={13} />
              {regimeLabels[regime.key]}
            </span>
          );
        })}
      </div>

      <div className="macro-weather-panel__guidance">
        <b>山寨环境</b>
        <p>{report.guidance.riskHint}</p>
        <small>{report.guidance.longWeightHint}</small>
        <small>{report.guidance.shortWeightHint}</small>
      </div>
    </section>
  );
}
