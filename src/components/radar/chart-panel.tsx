import { siteConfig } from "@/lib/config/site";
import { supportedTimeframes } from "@/lib/analysis/constants";
import {
  buildTradingViewUrl,
  toTradingViewInterval,
  toTradingViewSymbol,
} from "@/lib/market/tradingview-links";
import type { MarketSignal, Timeframe } from "@/lib/analysis/types";

type ChartPanelProps = {
  selected?: MarketSignal;
  activeTimeframe: Timeframe;
  onTimeframeChange: (timeframe: Timeframe) => void;
};

function strategyStatusLabel(value?: string) {
  if (!value) {
    return "等待候选";
  }

  const statusLabels: Record<string, string> = {
    actionable: "可执行",
    blocked: "已阻断",
    confirmed: "已确认",
    cooldown: "冷却中",
    invalidated: "已失效",
    near_trigger: "接近触发",
    observe_only: "只观察",
    pending: "待确认",
    tracking: "跟踪中",
    triggered: "已触发",
    waiting: "等待",
  };

  return statusLabels[value] ?? value.replaceAll("_", " ");
}

export function ChartPanel({
  selected,
  activeTimeframe,
  onTimeframeChange,
}: ChartPanelProps) {
  const tradingViewSymbol = toTradingViewSymbol({
    exchange: selected?.exchange,
    symbol: selected?.symbol,
  });
  const tradingViewUrl = buildTradingViewUrl({
    baseUrl: siteConfig.tradingViewBaseUrl,
    exchange: selected?.exchange,
    symbol: selected?.symbol,
    timeframe: activeTimeframe,
  });
  const interval = toTradingViewInterval(activeTimeframe);
  const strategyStatus = strategyStatusLabel(selected?.strategy.status);

  return (
    <section className="module chart-wrap">
      <div className="module-head module-head--flush">
        <h2>{selected ? `${selected.symbol} 结构主图` : "结构主图"}</h2>
        <a className="tag tag--link" href={tradingViewUrl} target="_blank" rel="noreferrer">
          TradingView 图表 ↗
        </a>
      </div>

      <div className="chart-link-strip" aria-label="K线联动状态">
        <span><b>{tradingViewSymbol}</b> 交易对</span>
        <span><b>{activeTimeframe.toUpperCase()}</b> 本地周期</span>
        <span><b>{interval}</b> TV 周期</span>
        <span><b>{strategyStatus}</b> 策略</span>
        <span><b>{selected ? `${selected.strategy.riskReward.toFixed(2)}R` : "--"}</b> RR</span>
      </div>

      <div className="periods" aria-label="K线周期">
        {supportedTimeframes.map((timeframe) => (
          <button
            className={activeTimeframe === timeframe ? "period is-active" : "period"}
            key={timeframe}
            onClick={() => onTimeframeChange(timeframe)}
            type="button"
          >
            {timeframe.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="chart-stage">
        <svg viewBox="0 0 920 420" preserveAspectRatio="none" aria-hidden="true">
          <path
            className="area"
            d="M30 280 C110 250 160 300 240 234 C320 168 390 220 470 176 C570 122 620 168 710 118 C805 64 855 100 890 78 L890 420 L30 420 Z"
          />
          <path
            className="price-path"
            d="M30 280 C110 250 160 300 240 234 C320 168 390 220 470 176 C570 122 620 168 710 118 C805 64 855 100 890 78"
          />
          <line className="threshold" x1="0" x2="920" y1="126" y2="126" />
        </svg>

        <div className="chart-callout">
          <strong>策略提示</strong>
          <span className="muted">
            {selected
              ? selected.strategy.positionHint
              : "等待扫描池返回候选后，这里会显示触发、失效和交易计划。"}
          </span>
        </div>

        <div className="volume-bars" aria-hidden="true">
          {[22, 31, 18, 42, 26, 34, 24, 38, 28, 46, 36, 52, 64, 44, 39, 58, 47, 55].map(
            (height, index) => (
              <span key={`${height}-${index}`} style={{ height: `${height}px` }} />
            ),
          )}
        </div>
      </div>
    </section>
  );
}
