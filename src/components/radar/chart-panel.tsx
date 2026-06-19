"use client";

import { useState } from "react";
import { siteConfig } from "@/lib/config/site";
import { supportedTimeframes } from "@/lib/analysis/constants";
import {
  buildTradingViewUrl,
  toTradingViewInterval,
  toTradingViewSymbol,
} from "@/lib/market/tradingview-links";
import type { JournalEvent, MarketSignal, Timeframe } from "@/lib/analysis/types";
import { TradingViewEmbed } from "./tradingview-embed";

type ChartPanelProps = {
  selected?: MarketSignal;
  activeTimeframe: Timeframe;
  journalMatches?: JournalEvent[];
  onTimeframeChange: (timeframe: Timeframe) => void;
};

const previewCandles = [
  { x: 6, open: 61, high: 56, low: 70, close: 66 },
  { x: 9, open: 65, high: 58, low: 68, close: 60 },
  { x: 12, open: 60, high: 55, low: 66, close: 63 },
  { x: 15, open: 64, high: 59, low: 71, close: 69 },
  { x: 18, open: 69, high: 62, low: 73, close: 65 },
  { x: 21, open: 65, high: 58, low: 67, close: 59 },
  { x: 24, open: 58, high: 52, low: 62, close: 54 },
  { x: 27, open: 54, high: 49, low: 60, close: 57 },
  { x: 30, open: 57, high: 51, low: 64, close: 61 },
  { x: 33, open: 62, high: 56, low: 66, close: 58 },
  { x: 36, open: 58, high: 50, low: 61, close: 51 },
  { x: 39, open: 51, high: 45, low: 56, close: 48 },
  { x: 42, open: 48, high: 42, low: 54, close: 46 },
  { x: 45, open: 46, high: 41, low: 51, close: 43 },
  { x: 48, open: 43, high: 38, low: 49, close: 45 },
  { x: 51, open: 45, high: 39, low: 48, close: 40 },
  { x: 54, open: 40, high: 34, low: 44, close: 36 },
  { x: 57, open: 36, high: 31, low: 42, close: 39 },
  { x: 60, open: 39, high: 33, low: 43, close: 35 },
  { x: 63, open: 35, high: 28, low: 38, close: 30 },
  { x: 66, open: 30, high: 24, low: 36, close: 27 },
  { x: 69, open: 27, high: 21, low: 33, close: 25 },
  { x: 72, open: 25, high: 19, low: 31, close: 28 },
  { x: 75, open: 28, high: 22, low: 34, close: 24 },
  { x: 78, open: 24, high: 18, low: 29, close: 21 },
  { x: 81, open: 21, high: 16, low: 27, close: 18 },
  { x: 84, open: 18, high: 13, low: 24, close: 20 },
  { x: 87, open: 20, high: 15, low: 26, close: 17 },
  { x: 90, open: 17, high: 12, low: 23, close: 15 },
];

const volumeQualityBars = [
  { height: 22, tone: "base" },
  { height: 31, tone: "base" },
  { height: 18, tone: "base" },
  { height: 42, tone: "active" },
  { height: 26, tone: "base" },
  { height: 34, tone: "base" },
  { height: 24, tone: "base" },
  { height: 38, tone: "base" },
  { height: 28, tone: "base" },
  { height: 46, tone: "active" },
  { height: 36, tone: "base" },
  { height: 52, tone: "active" },
  { height: 64, tone: "surge" },
  { height: 44, tone: "base" },
  { height: 39, tone: "base" },
  { height: 58, tone: "surge" },
  { height: 47, tone: "active" },
  { height: 55, tone: "active" },
];

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

function trendStructureLabel(value?: string) {
  const labels: Record<string, string> = {
    COMPRESSING: "压缩",
    DOWNTREND: "下行",
    RANGE: "震荡",
    UPTREND: "上行",
  };

  return value ? labels[value] ?? value.replaceAll("_", " ") : "待数据";
}

function trendStateLabel(value?: string) {
  const labels: Record<string, string> = {
    CONFLICT: "冲突",
    INVALIDATED: "失效",
    LONG_BREAKOUT: "多头突破",
    LONG_EXHAUSTION: "多头衰竭",
    LONG_PULLBACK_CONFIRM: "多头回踩",
    LONG_TREND_ACCELERATION: "多头加速",
    PRE_TREND_LONG: "多头预备",
    PRE_TREND_SHORT: "空头预备",
    RANGE_COMPRESSION: "区间压缩",
    RANGE_IDLE: "区间等待",
    SHORT_BREAKDOWN: "空头跌破",
    SHORT_EXHAUSTION: "空头衰竭",
    SHORT_RETEST_CONFIRM: "空头反抽",
    SHORT_TREND_ACCELERATION: "空头加速",
  };

  return value ? labels[value] ?? value.replaceAll("_", " ") : "待数据";
}

function keyLevelStatusLabel(value: string) {
  const labels: Record<string, string> = {
    ARRIVED: "已到达",
    BROKEN: "已跌破",
    CONFIRMED: "已确认",
    INVALIDATED: "已失效",
    POTENTIAL: "潜在",
    REACTION_STARTED: "反应中",
    RECLAIMED: "已收复",
    WEAKENING: "转弱",
  };

  return labels[value] ?? value.replaceAll("_", " ");
}

function forwardRoleLabel(value: string) {
  const labels: Record<string, string> = {
    CURRENT_DEFENSE: "当前防守位",
    FIRST_REBOUND_RESISTANCE: "第一反弹压力",
    INVALIDATION_LEVEL: "结构失效位",
    NEXT_REACTION_ZONE: "下一反应区",
    SECOND_REBOUND_RESISTANCE: "第二反弹压力",
    TREND_CHANGE_LEVEL: "趋势切换位",
  };

  return labels[value] ?? value.replaceAll("_", " ");
}

function compactPriceZone(low?: number, high?: number) {
  if (low === undefined || high === undefined) {
    return "等待样本";
  }

  return `${low.toFixed(4)}-${high.toFixed(4)}`;
}

function compactReviewTime(value?: string) {
  if (!value) {
    return "待排程";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function trendReviewTypeLabel(value?: string) {
  const labels: Record<string, string> = {
    forward_map_review: "Forward Map",
    key_level_reaction_review: "关键位反应",
    missed_altcoin_review: "漏判复盘",
    risk_gate_review: "风控复盘",
    trend_switch_review: "趋势切换",
  };

  return value ? labels[value] ?? value.replaceAll("_", " ") : "待复核";
}

function trendReviewVerdictLabel(value?: string) {
  const labels: Record<string, string> = {
    false_positive: "误报",
    invalidated: "失效",
    missed: "漏判",
    needs_more_evidence: "证据不足",
    pending: "待确认",
    reaction_confirmed: "反应确认",
    saved: "保存观察",
  };

  return value ? labels[value] ?? value.replaceAll("_", " ") : "待确认";
}

function patternTypeLabel(value?: string) {
  const labels: Record<string, string> = {
    ASCENDING_TRIANGLE: "上升三角",
    BEAR_FLAG: "熊旗",
    BULL_FLAG: "牛旗",
    DESCENDING_TRIANGLE: "下降三角",
    DOUBLE_BOTTOM: "双底",
    DOUBLE_TOP: "双顶",
    FIBONACCI_PULLBACK: "Fibonacci 回撤",
    HEAD_AND_SHOULDERS: "头肩顶",
    INVERSE_HEAD_AND_SHOULDERS: "反头肩",
  };

  return value ? labels[value] ?? value.replaceAll("_", " ") : "等待识别";
}

export function ChartPanel({
  selected,
  activeTimeframe,
  journalMatches = [],
  onTimeframeChange,
}: ChartPanelProps) {
  const [focusMode, setFocusMode] = useState<"price" | "key" | "forward" | "review">("key");
  const [activeKeyLevelId, setActiveKeyLevelId] = useState<string | undefined>();
  const [activeForwardLevelId, setActiveForwardLevelId] = useState<string | undefined>();
  const strategyV3 = selected?.strategyV3;
  const activeV3Timeframe = strategyV3?.trendContext?.timeframes.find((timeframe) =>
    timeframe.timeframe === activeTimeframe
  ) ?? strategyV3?.trendContext?.timeframes[0];
  const matchingKeyLevels = strategyV3?.keyLevels.filter(
    (level) => level.timeframe === activeV3Timeframe?.timeframe,
  ) ?? [];
  const activeKeyLevels = strategyV3
    ? (matchingKeyLevels.length > 0 ? matchingKeyLevels : strategyV3.keyLevels).slice(0, 3)
    : [];
  const activeForwardLevels = strategyV3?.forwardLevels.slice(0, 2) ?? [];
  const activeDrilldownLevel = activeKeyLevels.find((level) => level.id === activeKeyLevelId)
    ?? activeKeyLevels[0]
    ?? strategyV3?.keyLevels[0];
  const activeForwardDrilldown = activeForwardLevels.find((level) => level.id === activeForwardLevelId)
    ?? activeForwardLevels[0]
    ?? strategyV3?.forwardLevels[0];
  const reviewSamples = journalMatches.slice(0, 3);
  const v3ReviewLessons = Array.from(new Set(
    journalMatches
      .flatMap((entry) => entry.lessons ?? [])
      .filter((lesson) => lesson.startsWith("v3_pattern_") || lesson.startsWith("v3_trade_")),
  )).slice(0, 4);
  const forwardReviewEvents = journalMatches
    .filter((entry) => entry.trendRadarReview?.type === "forward_map_review"
      || entry.trendRadarReview?.type === "key_level_reaction_review")
    .slice(0, 3);
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
  const focusSummary = focusMode === "key"
    ? `关键位 ${compactPriceZone(activeDrilldownLevel?.zoneLow, activeDrilldownLevel?.zoneHigh)}`
    : focusMode === "forward"
      ? `前方位 ${compactPriceZone(activeForwardDrilldown?.zoneLow, activeForwardDrilldown?.zoneHigh)}`
      : focusMode === "review"
        ? `复盘样本 ${reviewSamples.length} 条`
        : `${activeTimeframe.toUpperCase()} 主走势`;

  return (
    <section className="module chart-wrap">
      <div className="module-head module-head--flush">
        <h2>{selected ? `${selected.symbol} 系统结构图` : "系统结构图"}</h2>
        <a className="tag tag--link" href={tradingViewUrl} target="_blank" rel="noreferrer">
          打开 TradingView 实时图 ↗
        </a>
      </div>

      <div className="chart-link-strip" aria-label="K线联动状态">
        <span><b>{tradingViewSymbol}</b> 交易对</span>
        <span><b>{activeTimeframe.toUpperCase()}</b> 系统周期</span>
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

      <div className="chart-subsection-head">
        <div>
          <strong>TradingView 实时图</strong>
          <span>真实外部盘面 · 用于人工确认 K 线、形态和成交量</span>
        </div>
        <span>{tradingViewSymbol}</span>
      </div>

      <TradingViewEmbed interval={interval} symbol={tradingViewSymbol} />

      <div className="chart-focus-toolbar" aria-label="盘面焦点切换">
        {[
          { id: "price", label: "走势", value: activeTimeframe.toUpperCase() },
          { id: "key", label: "关键位", value: activeDrilldownLevel ? keyLevelStatusLabel(activeDrilldownLevel.status) : "等待" },
          { id: "forward", label: "前方位", value: activeForwardLevels.length.toString() },
          { id: "review", label: "复盘", value: reviewSamples.length.toString() },
        ].map((item) => (
          <button
            aria-pressed={focusMode === item.id}
            className={`chart-focus-toolbar__item ${focusMode === item.id ? "is-active" : ""}`}
            key={item.id}
            onClick={() => setFocusMode(item.id as "price" | "key" | "forward" | "review")}
            type="button"
          >
            <span>{item.label}</span>
            <b>{item.value}</b>
          </button>
        ))}
      </div>

      <div className="chart-subsection-head chart-subsection-head--structure">
        <div>
          <strong>系统结构复核层</strong>
          <span>只读关键位、Forward Map、复盘事件和策略边界，不冒充实时 K 线</span>
        </div>
        <span>{focusSummary}</span>
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

        <div className="chart-preview-candles" aria-label="只读K线预览">
          {previewCandles.map((candle, index) => {
            const isUp = candle.close < candle.open;
            const bodyTop = Math.min(candle.open, candle.close);
            const bodyHeight = Math.max(3, Math.abs(candle.close - candle.open));

            return (
              <span
                className={`chart-preview-candle ${isUp ? "is-up" : "is-down"}`}
                key={`${candle.x}-${index}`}
                style={{ left: `${candle.x}%` }}
              >
                <i style={{ height: `${candle.low - candle.high}%`, top: `${candle.high}%` }} />
                <b style={{ height: `${bodyHeight}%`, top: `${bodyTop}%` }} />
              </span>
            );
          })}
        </div>

        <div className={`chart-focus-layer chart-focus-layer--${focusMode}`} aria-hidden="true">
          <span className="chart-focus-layer__level chart-focus-layer__level--key">
            <i />
            <b>Key</b>
          </span>
          <span className="chart-focus-layer__level chart-focus-layer__level--forward">
            <i />
            <b>Map</b>
          </span>
          <span className="chart-focus-layer__review">
            <i />
            <b>Review</b>
          </span>
        </div>

        <div className="chart-level-tags" aria-label="图上关键位标签">
          <span className="chart-level-tag chart-level-tag--key">
            <b>关键位</b>
            {compactPriceZone(activeDrilldownLevel?.zoneLow, activeDrilldownLevel?.zoneHigh)}
          </span>
          <span className="chart-level-tag chart-level-tag--forward">
            <b>前方位</b>
            {compactPriceZone(activeForwardDrilldown?.zoneLow, activeForwardDrilldown?.zoneHigh)}
          </span>
        </div>

        <div className="chart-callout">
          <strong>策略提示</strong>
          <span className="muted">
            {selected
              ? selected.strategy.positionHint
              : "等待扫描池返回候选后，这里会显示触发、失效和交易计划。"}
          </span>
        </div>

        <div className="chart-focus-note">
          <b>{focusSummary}</b>
          <span>只读焦点 · 用于人工复核</span>
        </div>

        <div className="chart-volume-profile" aria-label="成交量质量">
          <span><b>POC</b> 结构中位</span>
          <span><b>VOL</b> {selected ? `${Math.round(selected.confidence)} 质量分` : "等待样本"}</span>
          <span><b>FLOW</b> 只读预览</span>
        </div>

        <div className="volume-bars" aria-hidden="true">
          {volumeQualityBars.map(
            (bar, index) => (
              <span className={`volume-bar--${bar.tone}`} key={`${bar.height}-${index}`} style={{ height: `${bar.height}px` }} />
            ),
          )}
        </div>
      </div>

      {strategyV3 ? (
        <div className="chart-v3-context" aria-label="v3 多周期上下文">
          <div className="chart-v3-context__head">
            <span className="mono">v3 多周期上下文</span>
            <b>{trendStateLabel(strategyV3.trendContext?.state)}</b>
            <small>只读结构 · 不改排序</small>
          </div>

          <div className="chart-v3-context__grid">
            <span><b>{activeV3Timeframe?.timeframe.toUpperCase() ?? activeTimeframe.toUpperCase()}</b>周期</span>
            <span><b>{trendStructureLabel(activeV3Timeframe?.structure)}</b>结构</span>
            <span><b>{activeV3Timeframe?.compressionScore ?? 0}</b>压缩</span>
            <span><b>{strategyV3.trendContext?.riskGate.allowed ? "通过" : "阻断"}</b>风控</span>
          </div>

          <div className="chart-v3-levels" aria-label="v3 当前周期关键位">
            {activeKeyLevels.length > 0 ? activeKeyLevels.map((level) => (
              <button
                aria-pressed={activeDrilldownLevel?.id === level.id && focusMode === "key"}
                className={activeDrilldownLevel?.id === level.id && focusMode === "key" ? "is-active" : ""}
                key={level.id}
                onClick={() => {
                  setActiveKeyLevelId(level.id);
                  setFocusMode("key");
                }}
                type="button"
              >
                <b>{level.direction}</b>
                {level.zoneLow.toFixed(4)}-{level.zoneHigh.toFixed(4)}
                <small>{level.timeframe} / {keyLevelStatusLabel(level.status)}</small>
              </button>
            )) : <span><b>关键位</b>等待样本<small>无可用 v3 key level</small></span>}
          </div>

          <div className="chart-v3-forward-focus" aria-label="v3 前方位焦点">
            {activeForwardLevels.length > 0 ? activeForwardLevels.map((level) => (
              <button
                aria-pressed={activeForwardDrilldown?.id === level.id && focusMode === "forward"}
                className={activeForwardDrilldown?.id === level.id && focusMode === "forward" ? "is-active" : ""}
                key={level.id}
                onClick={() => {
                  setActiveForwardLevelId(level.id);
                  setFocusMode("forward");
                }}
                type="button"
              >
                <b>{forwardRoleLabel(level.role)}</b>
                <span>{compactPriceZone(level.zoneLow, level.zoneHigh)}</span>
              </button>
            )) : (
              <span><b>前方位</b>等待 Forward Map</span>
            )}
          </div>

          <div className="chart-v3-plan" aria-label="v3 计划和事前地图">
            <span><b>{strategyV3.tradePlan?.status ?? "WATCH_ONLY"}</b>计划</span>
            <span><b>{strategyV3.tradePlan?.rewardRisk?.toFixed(2) ?? "--"}R</b>赔率</span>
            <span><b>{activeForwardLevels.length}</b>事前位</span>
            <small>{strategyV3.tradePlan?.summary ?? strategyV3.summary}</small>
          </div>

          <div className="chart-v3-pattern-context" aria-label="v3 形态辅助上下文">
            <div>
              <strong>形态上下文</strong>
              <span>{patternTypeLabel(strategyV3.patternLibrary?.dominantPattern?.type)}</span>
            </div>
            <p>
              {strategyV3.patternLibrary?.dominantPattern
                ? `${strategyV3.patternLibrary.dominantPattern.confidence} 置信 / ${strategyV3.patternLibrary.maxWeightPercent}% 权重上限 / 不生成交易信号`
                : "等待更清晰的盘面结构。"}
            </p>
            <small>
              {strategyV3.patternLibrary?.dominantPattern?.evidence[0]
                ?? "形态只做低权重辅助，不能覆盖关键位、位置/RR 和 Risk Gate。"}
            </small>
          </div>

          <div className="chart-v3-drilldown" aria-label="v3 关键位 drilldown">
            <div>
              <strong>当前关键位</strong>
              <span>{activeDrilldownLevel ? `${activeDrilldownLevel.timeframe} / ${activeDrilldownLevel.type.replaceAll("_", " ")}` : "等待关键位"}</span>
            </div>
            <p>{compactPriceZone(activeDrilldownLevel?.zoneLow, activeDrilldownLevel?.zoneHigh)}</p>
            <small>
              {(activeDrilldownLevel?.reasons[0] ?? activeDrilldownLevel?.confirmationRules[0])
                ?? "暂无关键位原因，等待更多 OHLCV 样本。"}
            </small>
            <small>
              {activeDrilldownLevel
                ? `确认：${activeDrilldownLevel.confirmationRules[0] ?? "等待反应"} / 失效：${activeDrilldownLevel.invalidationRule}`
                : "确认与失效规则待生成。"}
            </small>
          </div>

          <div className="chart-v3-forward-drilldown" aria-label="v3 forward map drilldown">
            <div>
              <strong>下一前方位</strong>
              <span>{activeForwardDrilldown ? forwardRoleLabel(activeForwardDrilldown.role) : "等待前方位"}</span>
            </div>
            <p>{compactPriceZone(activeForwardDrilldown?.zoneLow, activeForwardDrilldown?.zoneHigh)}</p>
            <small>
              {activeForwardDrilldown
                ? `确认：${activeForwardDrilldown.confirmationRules[0] ?? "等待触达"}`
                : "确认规则待生成。"}
            </small>
            <small>
              {activeForwardDrilldown
                ? `失效：${activeForwardDrilldown.invalidationRules[0] ?? "等待复核"}`
                : "失效规则待生成。"}
            </small>
          </div>

          <div className="chart-v3-manual-review" aria-label="v3 只读复核边界">
            <b>只读复核</b>
            <span>关键位、事前位和计划草案只用于人工确认；不自动下单、不改排序、不自动调权。</span>
          </div>

          <div className="chart-v3-review-links" aria-label="v3 复盘样本">
            <div>
              <strong>复盘样本</strong>
              <span>{reviewSamples.length} 条 / {v3ReviewLessons.length} 个 v3 标签</span>
            </div>
            {reviewSamples.length > 0 ? reviewSamples.map((entry) => (
              <button
                className={focusMode === "review" ? "is-active" : ""}
                key={entry.id}
                onClick={() => setFocusMode("review")}
                type="button"
              >
                <b>{entry.title}</b>
                <span>{entry.result} · {entry.reviewStatus ?? "待复查"} · {compactReviewTime(entry.createdAt)}</span>
                <small>plannedReviewAt {compactReviewTime(entry.plannedReviewAt)}</small>
              </button>
            )) : (
              <article>
                <b>等待复盘样本</b>
                <span>记录观察后，这里会显示该标的的最近复盘和 outcome 状态。</span>
                <small>plannedReviewAt 待生成</small>
              </article>
            )}
            {v3ReviewLessons.length > 0 ? (
              <p>{v3ReviewLessons.join(" / ")}</p>
            ) : (
              <p>v3_pattern_ / v3_trade_ 标签等待样本积累。</p>
            )}
          </div>

          <div className="chart-v3-forward-review-events" aria-label="v3 事后复核事件">
            <div>
              <strong>事后复核</strong>
              <span>{forwardReviewEvents.length} 条 Forward Map / 关键位事件</span>
            </div>
            {forwardReviewEvents.length > 0 ? forwardReviewEvents.map((entry) => (
              <article key={entry.id}>
                <b>{trendReviewTypeLabel(entry.trendRadarReview?.type)}</b>
                <span>{trendReviewVerdictLabel(entry.trendRadarReview?.verdict)} · {compactReviewTime(entry.createdAt)}</span>
                <small>{entry.trendRadarReview?.detail ?? entry.note}</small>
                <small>evidenceIds {(entry.trendRadarReview?.evidenceIds ?? []).slice(0, 3).join(" / ") || "等待关联"}</small>
              </article>
            )) : (
              <article>
                <b>等待 Forward Map 复核</b>
                <span>executor 生成 forward_map_review / key_level_reaction_review 后会出现在这里。</span>
                <small>evidenceIds 待关联</small>
              </article>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
