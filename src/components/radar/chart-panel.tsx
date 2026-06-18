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

type ChartPanelProps = {
  selected?: MarketSignal;
  activeTimeframe: Timeframe;
  journalMatches?: JournalEvent[];
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

        <div className="volume-bars" aria-hidden="true">
          {[22, 31, 18, 42, 26, 34, 24, 38, 28, 46, 36, 52, 64, 44, 39, 58, 47, 55].map(
            (height, index) => (
              <span key={`${height}-${index}`} style={{ height: `${height}px` }} />
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
