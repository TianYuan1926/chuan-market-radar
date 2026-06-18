import {
  BellRing,
  BookOpenCheck,
  ClipboardList,
  ExternalLink,
  KeyRound,
  MapPinned,
  RadioTower,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { signalStateLabels } from "@/lib/analysis/constants";
import type {
  JournalEvent,
  MarketSignal,
  SignalJournalAction,
  Timeframe,
} from "@/lib/analysis/types";
import type { AlertEvent } from "@/lib/alerts/alert-policy";
import { siteConfig } from "@/lib/config/site";
import {
  buildTradingViewUrl,
  toTradingViewInterval,
  toTradingViewSymbol,
} from "@/lib/market/tradingview-links";

export type SignalDossierDailyMoverMatch = {
  detail: string;
  direction: "gainer" | "loser";
  evidence?: string;
  id: string;
  journalCount: number;
  nextStep: string;
  observedAt?: string;
  scanCount: number;
  status: string;
  symbol: string;
};

type SignalDossierProps = {
  activeTimeframe: Timeframe;
  alertMatches: AlertEvent[];
  dailyMoverMatches: SignalDossierDailyMoverMatch[];
  isOpen: boolean;
  journalMatches: JournalEvent[];
  onClose: () => void;
  onCreateJournalEntry: (action: SignalJournalAction) => void;
  signal?: MarketSignal;
};

type SignalStrategyV3 = NonNullable<MarketSignal["strategyV3"]>;
type SignalStrategyV3TrendContext = NonNullable<SignalStrategyV3["trendContext"]>;
type SignalStrategyV3MarketReading = NonNullable<SignalStrategyV3TrendContext["marketReadings"]>[number];

const actionButtons: {
  action: SignalJournalAction;
  helper: string;
  Icon: typeof BookOpenCheck;
  label: string;
}[] = [
  {
    action: "track",
    helper: "进入复盘队列",
    Icon: BookOpenCheck,
    label: "记录观察",
  },
  {
    action: "paper_trade",
    helper: "纸面验证策略",
    Icon: ClipboardList,
    label: "纸面跟踪",
  },
  {
    action: "skip",
    helper: "保留纪律样本",
    Icon: ShieldCheck,
    label: "拒绝追单",
  },
];

function compactSymbol(symbol: string) {
  return symbol.replace(/USDT$/u, "");
}

function formatTime(value?: string) {
  if (!value) {
    return "待同步";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(11, 16);
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

function directionLabel(value: MarketSignal["direction"]) {
  return {
    long: "偏多观察",
    neutral: "中性观察",
    short: "偏空观察",
  }[value];
}

function riskLabel(value: MarketSignal["risk"]) {
  return {
    blocked: "阻断",
    high: "高风险",
    low: "低风险",
    medium: "中风险",
  }[value];
}

function strategyStatusLabel(value?: string) {
  if (!value) {
    return "等待";
  }

  const labels: Record<string, string> = {
    actionable: "可执行",
    blocked: "阻断",
    observe_only: "只观察",
    waiting: "等待",
  };

  return labels[value] ?? value.replaceAll("_", " ");
}

function evidencePolarityLabel(value: MarketSignal["evidence"][number]["polarity"]) {
  return {
    blocking: "阻断",
    conflicting: "反证",
    neutral: "中性",
    supportive: "支持",
  }[value];
}

function alertSeverityLabel(value: AlertEvent["severity"]) {
  return {
    critical: "紧急",
    high: "高",
    operations: "系统",
    watch: "观察",
  }[value];
}

function journalActionLabel(value: JournalEvent["action"]) {
  if (!value) {
    return "复盘";
  }

  const labels: Record<string, string> = {
    calibration_review: "校准复核",
    invalidate: "失效记录",
    outcome_executor_run: "自动复盘",
    paper_trade: "纸面跟踪",
    skip: "拒绝追单",
    strategy_confirmation: "策略确认",
    strategy_weight_change_execution: "权重审计",
    track: "观察记录",
    trend_radar_review: "v3复盘",
    trend_radar_review_run: "v3复盘批次",
  };

  return labels[value] ?? value.replaceAll("_", " ");
}

function dailyMoverDirectionLabel(value: SignalDossierDailyMoverMatch["direction"]) {
  return value === "gainer" ? "涨幅样本" : "跌幅样本";
}

function keyLevelDirectionLabel(value: SignalStrategyV3["keyLevels"][number]["direction"]) {
  return {
    BOTH: "双向",
    RESISTANCE: "压力",
    SUPPORT: "支撑",
  }[value];
}

function keyLevelStatusLabel(value: SignalStrategyV3["keyLevels"][number]["status"]) {
  return {
    ARRIVED: "已到位",
    BROKEN: "已突破",
    CONFIRMED: "已确认",
    INVALIDATED: "已失效",
    POTENTIAL: "潜在",
    REACTION_STARTED: "有反应",
    RECLAIMED: "已收复",
    WEAKENING: "转弱",
  }[value];
}

function forwardRoleLabel(value: SignalStrategyV3["forwardLevels"][number]["role"]) {
  return {
    CURRENT_DEFENSE: "当前防守",
    FIRST_REBOUND_RESISTANCE: "第一反弹压力",
    INVALIDATION_LEVEL: "失效位",
    NEXT_REACTION_ZONE: "下一反应区",
    SECOND_REBOUND_RESISTANCE: "第二反弹压力",
    TREND_CHANGE_LEVEL: "趋势切换位",
  }[value];
}

function trendStateLabel(value: SignalStrategyV3TrendContext["state"]) {
  return {
    CONFLICT: "周期冲突",
    INVALIDATED: "结构失效",
    LONG_BREAKOUT: "多头突破",
    LONG_EXHAUSTION: "多头衰竭",
    LONG_PULLBACK_CONFIRM: "多头回踩",
    LONG_TREND_ACCELERATION: "多头加速",
    PRE_TREND_LONG: "多头预趋势",
    PRE_TREND_SHORT: "空头预趋势",
    RANGE_COMPRESSION: "区间压缩",
    RANGE_IDLE: "区间观察",
    SHORT_BREAKDOWN: "空头跌破",
    SHORT_EXHAUSTION: "空头衰竭",
    SHORT_RETEST_CONFIRM: "空头反抽",
    SHORT_TREND_ACCELERATION: "空头加速",
  }[value];
}

function trendDecisionLabel(value: SignalStrategyV3TrendContext["decision"]) {
  return {
    AVOID_CHASE_LONG: "拒绝追高",
    AVOID_CHASE_SHORT: "拒绝追空",
    CONFLICT_WAIT: "等一致",
    INVALIDATED: "已失效",
    LONG_PLAN: "多头计划",
    NO_TRADE: "不参与",
    PREPARE_LONG: "准备多头",
    PREPARE_SHORT: "准备空头",
    SHORT_PLAN: "空头计划",
    TAKE_PROFIT_LONG: "多头止盈管理",
    TAKE_PROFIT_SHORT: "空头止盈管理",
    TREND_HOLD_LONG: "多头持有观察",
    TREND_HOLD_SHORT: "空头持有观察",
    WAIT_LONG_BREAKOUT: "等多头突破",
    WAIT_LONG_PULLBACK: "等多头回踩",
    WAIT_SHORT_BREAKDOWN: "等空头跌破",
    WAIT_SHORT_RETEST: "等空头反抽",
    WATCH_ONLY: "只观察",
  }[value];
}

function trendStructureLabel(value: SignalStrategyV3TrendContext["timeframes"][number]["structure"]) {
  return {
    COMPRESSING: "压缩",
    DOWNTREND: "下行",
    RANGE: "区间",
    UPTREND: "上行",
  }[value];
}

function marketReadingStructureLabel(value: SignalStrategyV3MarketReading["structure"]) {
  return {
    DOWN_SEQUENCE: "LH/LL 下行",
    INSUFFICIENT_STRUCTURE: "样本不足",
    RANGE_SEQUENCE: "区间序列",
    UP_SEQUENCE: "HH/HL 上行",
  }[value];
}

function marketReadingEventLabel(value: SignalStrategyV3MarketReading["events"][number]["type"]) {
  return {
    BOS_DOWN: "跌破结构",
    BOS_UP: "突破结构",
    CHOCH_DOWN: "转弱变性",
    CHOCH_UP: "转强变性",
    FAKE_BREAKDOWN: "假跌破",
    FAKE_BREAKOUT: "假突破",
    HH: "HH",
    HL: "HL",
    LH: "LH",
    LL: "LL",
  }[value];
}

function positionQualityLabel(value: NonNullable<SignalStrategyV3TrendContext["locationRiskReward"]>["positionQuality"]) {
  return {
    CHASE_RISK: "偏追",
    GOOD_LOCATION: "位置合格",
    NEUTRAL_DIRECTION: "方向中性",
    NO_STRUCTURAL_STOP: "缺止损",
    NO_TARGET: "缺目标",
    POOR_RR: "赔率不足",
    WATCH_LOCATION: "观察位",
  }[value];
}

function reactionStatusLabel(value: NonNullable<SignalStrategyV3TrendContext["reactionQuality"]>["status"]) {
  return {
    CONFIRMED: "已确认",
    FAILED: "已失败",
    NO_REACTION: "无反应",
    REACTION_STARTED: "反应中",
    TOO_FAR_FROM_LEVEL: "未触达",
  }[value];
}

function trendIntegrityStatusLabel(value: NonNullable<SignalStrategyV3TrendContext["trendIntegrity"]>["status"]) {
  return {
    DAMAGED_TREND: "结构受损",
    EXHAUSTION_RISK: "衰竭风险",
    HEALTHY_TREND: "趋势健康",
    INSUFFICIENT_DATA: "样本不足",
    RANGE_BOUND: "区间约束",
  }[value];
}

function tradePlanStatusLabel(value: NonNullable<SignalStrategyV3["tradePlan"]>["status"]) {
  return {
    BLOCKED: "已阻断",
    READY_LONG: "多头草案",
    READY_SHORT: "空头草案",
    WAIT_PULLBACK: "等回踩",
    WAIT_RETEST: "等反抽",
    WATCH_ONLY: "只观察",
  }[value];
}

function patternBiasLabel(value: NonNullable<SignalStrategyV3["patternLibrary"]>["patterns"][number]["bias"]) {
  return {
    BEARISH_CONTEXT: "偏空上下文",
    BULLISH_CONTEXT: "偏多上下文",
    NEUTRAL_CONTEXT: "中性上下文",
    RISK_CONTEXT: "风险上下文",
  }[value];
}

function pricePointLabel(value: number | null) {
  if (value === null) {
    return "待确认";
  }

  return value >= 100 ? value.toFixed(2) : value.toFixed(5);
}

function priceZoneLabel(zoneLow: number, zoneHigh: number) {
  const digits = Math.max(zoneLow, zoneHigh) >= 100 ? 2 : 5;

  return `${zoneLow.toFixed(digits)} - ${zoneHigh.toFixed(digits)}`;
}

function copilotLine(signal: MarketSignal, journalMatches: JournalEvent[], moverMatches: SignalDossierDailyMoverMatch[]) {
  if (signal.risk === "blocked" || signal.risk === "high") {
    return "这票先别急，失效条件必须摆在桌面上。能不能做，先看反证有没有被消化。";
  }

  if (signal.state === "near_trigger" || signal.state === "triggered") {
    return "注意力可以拉高，但手别比脑子快。同一标的联动已经给你收齐了，先看触发和失效。";
  }

  if (moverMatches.length > 0 || journalMatches.length > 0) {
    return "这标的有历史痕迹，别只看眼前一根线。先把旧样本和当前证据对上。";
  }

  return "当前还在观察区。没有好位置就别硬凑，真正的机会会带着风控一起出现。";
}

export function SignalDossier({
  activeTimeframe,
  alertMatches,
  dailyMoverMatches,
  isOpen,
  journalMatches,
  onClose,
  onCreateJournalEntry,
  signal,
}: SignalDossierProps) {
  const tradingViewSymbol = toTradingViewSymbol({
    exchange: signal?.exchange,
    symbol: signal?.symbol,
  });
  const tradingViewUrl = buildTradingViewUrl({
    baseUrl: siteConfig.tradingViewBaseUrl,
    exchange: signal?.exchange,
    symbol: signal?.symbol,
    timeframe: activeTimeframe,
  });
  const interval = toTradingViewInterval(activeTimeframe);
  const compact = signal ? compactSymbol(signal.symbol) : "等待";
  const visibleEvidence = signal?.evidence.slice(0, 9) ?? [];
  const confirmations = signal?.strategy.confirmation?.slice(0, 3) ?? ["等待触发、位置和量能同时确认"];
  const counterEvidence = signal?.strategy.counterEvidence?.slice(0, 3) ?? ["暂无硬阻断反证，继续观察失效位"];
  const strategyV2 = signal?.strategyV2;
  const strategyV3 = signal?.strategyV3;

  return (
    <div className={`signal-dossier ${isOpen ? "signal-dossier--open" : ""}`} aria-hidden={!isOpen}>
      <button
        aria-label="关闭档案"
        className="signal-dossier__backdrop"
        onClick={onClose}
        tabIndex={isOpen ? 0 : -1}
        type="button"
      />

      <aside
        aria-labelledby="signal-dossier-title"
        aria-modal="true"
        className="signal-dossier__drawer"
        role="dialog"
      >
        <div className="signal-dossier__hero">
          <div>
            <span className="tag">信号档案 · 同一标的联动</span>
            <h2 id="signal-dossier-title">{compact} 信号档案</h2>
            <p>{signal?.summary ?? "选择候选后，这里会把策略、证据、复盘、异动和告警收进同一个上下文。"}</p>
          </div>
          <button className="signal-dossier__close" onClick={onClose} type="button">
            <X aria-hidden="true" size={16} strokeWidth={2.4} />
            <span>关闭档案</span>
          </button>
        </div>

        {signal ? (
          <>
            <section
              className={`signal-dossier__command signal-dossier__command--risk-${signal.risk}`}
              aria-label="信号档案决策总览"
            >
              <div className="signal-dossier__command-mark" aria-hidden="true">川</div>
              <div className="signal-dossier__command-main">
                <span className="tag">证据室 · 计划边界</span>
                <strong>
                  {strategyV3?.trendContext
                    ? trendDecisionLabel(strategyV3.trendContext.decision)
                    : directionLabel(signal.direction)}
                </strong>
                <p>
                  {strategyV3?.trendContext?.nextStep
                    ?? signal.strategy.entryZone
                    ?? signal.strategy.entry}
                </p>
              </div>
              <div className="signal-dossier__decision-rail" aria-label="策略状态速览">
                <span>
                  <b>{strategyV3?.trendContext ? trendStateLabel(strategyV3.trendContext.state) : signalStateLabels[signal.state]}</b>
                  阶段
                </span>
                <span>
                  <b>{riskLabel(signal.risk)}</b>
                  风险
                </span>
                <span>
                  <b>{signal.strategy.riskReward.toFixed(2)}R</b>
                  赔率
                </span>
                <span>
                  <b>{strategyV3?.canMutateLiveRanking ? "异常" : "只读"}</b>
                  v3
                </span>
              </div>
            </section>

            <section className="signal-dossier__section signal-dossier__section--context" aria-label="当前上下文">
              <div className="signal-dossier__section-head">
                <h3>当前上下文</h3>
                <span>{signalStateLabels[signal.state]}</span>
              </div>
              <div className="signal-dossier__context-grid">
                <span><b>{directionLabel(signal.direction)}</b>方向</span>
                <span><b>{activeTimeframe.toUpperCase()}</b>周期</span>
                <span><b>{signal.confidence}</b>置信</span>
                <span><b>{riskLabel(signal.risk)}</b>风险</span>
                <span><b>{strategyStatusLabel(signal.strategy.status)}</b>状态</span>
                <span><b>{signal.strategy.riskReward.toFixed(2)}R</b>赔率</span>
              </div>
            </section>

            {strategyV2 ? (
              <section className="signal-dossier__section signal-dossier__section--audit" aria-label="Strategy v2 证据审计">
                <div className="signal-dossier__section-head">
                  <h3>v2 证据审计</h3>
                  <span>{strategyV2.report.title}</span>
                </div>
                <div className="signal-dossier__v2-grid">
                  <span><b>{strategyV2.stage}</b>阶段</span>
                  <span><b>{strategyV2.decision}</b>决策</span>
                  <span><b>{strategyV2.riskGate.allowed ? "通过" : "阻断"}</b>门控</span>
                  <span><b>{strategyV2.scores.preMove}</b>PreMove</span>
                  <span><b>{strategyV2.scores.energy}</b>Energy</span>
                  <span><b>{strategyV2.scores.risk}</b>Risk</span>
                </div>
                <div className="signal-dossier__v2-report">
                  <p>{strategyV2.report.sections.state}</p>
                  <p>{strategyV2.report.sections.risk}</p>
                  <p>{strategyV2.report.sections.plan}</p>
                </div>
                <div className="signal-dossier__v2-trace" aria-label="Strategy v2 evidenceTrace">
                  <article>
                    <strong>supportEvidenceIds</strong>
                    <p>{strategyV2.report.evidenceTrace.supportEvidenceIds.slice(0, 6).join(" / ") || "无"}</p>
                  </article>
                  <article>
                    <strong>counterEvidenceIds</strong>
                    <p>{strategyV2.report.evidenceTrace.counterEvidenceIds.slice(0, 6).join(" / ") || "无"}</p>
                  </article>
                </div>
              </section>
            ) : null}

            {strategyV3 ? (
              <section className="signal-dossier__section signal-dossier__section--v3" aria-label="v3 关键位地图和 Forward Map">
                <div className="signal-dossier__section-head">
                  <h3>关键位地图</h3>
                  <span>{strategyV3.primaryTimeframe} / {strategyV3.sourceTimeframes.length} 周期</span>
                </div>
                <div className="signal-dossier__v3-summary">
                  <MapPinned aria-hidden="true" size={16} strokeWidth={2.35} />
                  <p>{strategyV3.summary}</p>
                  <small>
                    {strategyV3.canMutateLiveRanking ? "可影响排序" : "只读上下文"} / {strategyV3.allowedUse}
                  </small>
                </div>
                <div className="signal-dossier__route-map" aria-label="v3 证据路径">
                  <article>
                    <strong>结构阶段</strong>
                    <span>
                      {strategyV3.trendContext
                        ? trendStateLabel(strategyV3.trendContext.state)
                        : "等待结构"}
                    </span>
                    <p>
                      {strategyV3.trendContext?.guardrail
                        ?? "先读结构，再验证衍生品和量价。"}
                    </p>
                  </article>
                  <article>
                    <strong>关键位置</strong>
                    <span>{strategyV3.keyLevels.length} 区域</span>
                    <p>
                      {strategyV3.keyLevels[0]
                        ? `${keyLevelDirectionLabel(strategyV3.keyLevels[0].direction)} ${priceZoneLabel(strategyV3.keyLevels[0].zoneLow, strategyV3.keyLevels[0].zoneHigh)}`
                        : "等待支撑/压力共振"}
                    </p>
                  </article>
                  <article>
                    <strong>计划边界</strong>
                    <span>{strategyV3.tradePlan ? tradePlanStatusLabel(strategyV3.tradePlan.status) : "待生成"}</span>
                    <p>
                      {strategyV3.tradePlan?.isPlanEligible
                        ? "计划只在确认清单满足后有效。"
                        : strategyV3.tradePlan?.blockedBy.slice(0, 2).join(" / ") || "缺少可执行计划时保持观察。"}
                    </p>
                  </article>
                </div>
                {strategyV3.trendContext ? (
                  <>
                    <div className="signal-dossier__section-head signal-dossier__section-head--sub">
                      <h3>趋势上下文</h3>
                      <span>{trendStateLabel(strategyV3.trendContext.state)} / {trendDecisionLabel(strategyV3.trendContext.decision)}</span>
                    </div>
                    <div className="signal-dossier__v3-trend" aria-label="v3 多周期结构趋势上下文">
                      <p>{strategyV3.trendContext.summary}</p>
                      <small>{strategyV3.trendContext.nextStep} · {strategyV3.trendContext.guardrail}</small>
                    </div>
                    <div className="signal-dossier__v3-scores" aria-label="v3 trend scores">
                      <span><b>{strategyV3.trendContext.scores.longPreTrendScore}</b>多头预势</span>
                      <span><b>{strategyV3.trendContext.scores.shortPreTrendScore}</b>空头预势</span>
                      <span><b>{strategyV3.trendContext.scores.riskScore}</b>风险</span>
                      <span><b>{strategyV3.trendContext.scores.trendHoldScore}</b>持有</span>
                    </div>
                    {strategyV3.trendContext.locationRiskReward ? (
                      <div className="signal-dossier__v3-location" aria-label="v3 位置/RR 风险门控">
                        <div>
                          <strong>位置/RR</strong>
                          <span>{positionQualityLabel(strategyV3.trendContext.locationRiskReward.positionQuality)}</span>
                        </div>
                        <div className="signal-dossier__v3-location-grid">
                          <span><b>{strategyV3.trendContext.locationRiskReward.rewardRisk === null ? "待确认" : `${strategyV3.trendContext.locationRiskReward.rewardRisk.toFixed(2)}R`}</b>盈亏比</span>
                          <span><b>{pricePointLabel(strategyV3.trendContext.locationRiskReward.structuralStop)}</b>结构止损</span>
                          <span><b>{pricePointLabel(strategyV3.trendContext.locationRiskReward.nearestTarget)}</b>最近目标</span>
                          <span><b>{strategyV3.trendContext.locationRiskReward.stopDistancePercent.toFixed(2)}%</b>止损距离</span>
                        </div>
                        <p>{strategyV3.trendContext.locationRiskReward.summary}</p>
                        {strategyV3.trendContext.locationRiskReward.riskFlags.length > 0 ? (
                          <small>{strategyV3.trendContext.locationRiskReward.riskFlags.join(" / ")}</small>
                        ) : null}
                      </div>
                    ) : null}
                    {strategyV3.trendContext.reactionQuality ? (
                      <div className="signal-dossier__v3-reaction" aria-label="v3 回踩/反抽质量">
                        <div>
                          <strong>回踩/反抽</strong>
                          <span>{reactionStatusLabel(strategyV3.trendContext.reactionQuality.status)}</span>
                        </div>
                        <div className="signal-dossier__v3-location-grid">
                          <span><b>{strategyV3.trendContext.reactionQuality.qualityScore}</b>质量分</span>
                          <span><b>{strategyV3.trendContext.reactionQuality.touchedLevelId ?? "待确认"}</b>触达位</span>
                          <span><b>{strategyV3.trendContext.reactionQuality.hasTradeSignal ? "异常" : "否"}</b>交易信号</span>
                          <span><b>{strategyV3.trendContext.reactionQuality.allowedUse}</b>用途</span>
                        </div>
                        <p>{strategyV3.trendContext.reactionQuality.summary}</p>
                        {strategyV3.trendContext.reactionQuality.riskFlags.length > 0 ? (
                          <small>{strategyV3.trendContext.reactionQuality.riskFlags.join(" / ")}</small>
                        ) : (
                          <small>{strategyV3.trendContext.reactionQuality.evidence.slice(0, 2).join(" / ")}</small>
                        )}
                      </div>
                    ) : null}
                    {strategyV3.trendContext.trendIntegrity ? (
                      <div className="signal-dossier__v3-integrity" aria-label="v3 趋势完整度">
                        <div>
                          <strong>趋势完整度</strong>
                          <span>{trendIntegrityStatusLabel(strategyV3.trendContext.trendIntegrity.status)}</span>
                        </div>
                        <div className="signal-dossier__v3-location-grid">
                          <span><b>{strategyV3.trendContext.trendIntegrity.integrityScore}</b>完整度</span>
                          <span><b>{strategyV3.trendContext.trendIntegrity.direction}</b>方向</span>
                          <span><b>{strategyV3.trendContext.trendIntegrity.hasTradeSignal ? "异常" : "否"}</b>交易信号</span>
                          <span><b>{strategyV3.trendContext.trendIntegrity.canMutateLiveRanking ? "异常" : "否"}</b>影响排序</span>
                        </div>
                        <p>{strategyV3.trendContext.trendIntegrity.summary}</p>
                        {strategyV3.trendContext.trendIntegrity.riskFlags.length > 0 ? (
                          <small>{strategyV3.trendContext.trendIntegrity.riskFlags.join(" / ")}</small>
                        ) : (
                          <small>{strategyV3.trendContext.trendIntegrity.evidence.slice(0, 2).join(" / ")}</small>
                        )}
                      </div>
                    ) : null}
                    <div className="signal-dossier__v3-timeframes" aria-label="v3 timeframe structures">
                      {strategyV3.trendContext.timeframes.slice(0, 6).map((timeframe) => (
                        <article key={timeframe.timeframe}>
                          <strong>{timeframe.timeframe}</strong>
                          <span>{trendStructureLabel(timeframe.structure)}</span>
                          <small>{timeframe.changePercent}% / 压缩 {timeframe.compressionScore}</small>
                        </article>
                      ))}
                    </div>
                    {strategyV3.trendContext.marketReadings?.length ? (
                      <>
                        <div className="signal-dossier__section-head signal-dossier__section-head--sub">
                          <h3>盘面结构</h3>
                          <span>{strategyV3.trendContext.marketReadings.length} 周期</span>
                        </div>
                        <div className="signal-dossier__v3-reading" aria-label="v3 盘面结构 market reading">
                          {strategyV3.trendContext.marketReadings.slice(0, 4).map((reading) => (
                            <article key={`${reading.timeframe}-${reading.structure}`}>
                              <div>
                                <strong>{reading.timeframe}</strong>
                                <span>{marketReadingStructureLabel(reading.structure)}</span>
                              </div>
                              <p>{reading.summary}</p>
                              <small>
                                {reading.events.length > 0
                                  ? reading.events.slice(0, 4).map((event) => marketReadingEventLabel(event.type)).join(" / ")
                                  : "等待前高前低给出有效结构事件"}
                              </small>
                            </article>
                          ))}
                        </div>
                      </>
                    ) : null}
                    {strategyV3.trendContext.conflicts.length > 0 ? (
                      <div className="signal-dossier__v3-conflicts" aria-label="v3 timeframe conflicts">
                        {strategyV3.trendContext.conflicts.slice(0, 2).map((conflict) => (
                          <p key={conflict}>{conflict}</p>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
                {strategyV3.tradePlan ? (
                  <div className="signal-dossier__v3-trade-plan" aria-label="v3 计划草案">
                    <div>
                      <strong>v3 计划草案</strong>
                      <span>{tradePlanStatusLabel(strategyV3.tradePlan.status)}</span>
                    </div>
                    <div className="signal-dossier__v3-location-grid">
                      <span><b>{strategyV3.tradePlan.rewardRisk === null ? "待确认" : `${strategyV3.tradePlan.rewardRisk.toFixed(2)}R`}</b>赔率</span>
                      <span><b>{pricePointLabel(strategyV3.tradePlan.structuralStop)}</b>失效</span>
                      <span><b>{strategyV3.tradePlan.targets[0] === undefined ? "待确认" : pricePointLabel(strategyV3.tradePlan.targets[0])}</b>目标</span>
                      <span><b>{strategyV3.tradePlan.hasAutoExecution ? "异常" : "否"}</b>自动执行</span>
                    </div>
                    <p>{strategyV3.tradePlan.summary}</p>
                    <small>
                      {strategyV3.tradePlan.isPlanEligible
                        ? strategyV3.tradePlan.confirmationChecklist.slice(0, 3).join(" / ")
                        : strategyV3.tradePlan.blockedBy.slice(0, 5).join(" / ") || "等待更多证据"}
                    </small>
                  </div>
                ) : null}
                {strategyV3.patternLibrary ? (
                  <div className="signal-dossier__v3-pattern" aria-label="v3 形态辅助">
                    <div>
                      <strong>形态辅助</strong>
                      <span>{strategyV3.patternLibrary.dominantPattern ? patternBiasLabel(strategyV3.patternLibrary.dominantPattern.bias) : "未识别"}</span>
                    </div>
                    <div className="signal-dossier__v3-location-grid">
                      <span><b>{strategyV3.patternLibrary.dominantPattern?.type.replaceAll("_", " ") ?? "等待"}</b>主形态</span>
                      <span><b>{strategyV3.patternLibrary.dominantPattern?.confidence ?? 0}</b>置信</span>
                      <span><b>{strategyV3.patternLibrary.maxWeightPercent}%</b>权重上限</span>
                      <span><b>{strategyV3.patternLibrary.hasTradeSignal ? "异常" : "否"}</b>交易信号</span>
                    </div>
                    <p>{strategyV3.patternLibrary.summary}</p>
                    <small>
                      {strategyV3.patternLibrary.dominantPattern?.invalidationHint
                        ?? "形态只做辅助，不覆盖结构、位置/RR 和 Risk Gate。"}
                    </small>
                  </div>
                ) : null}
                <div className="signal-dossier__v3-levels" aria-label="v3 key levels">
                  {strategyV3.keyLevels.slice(0, 6).map((level) => (
                    <article key={level.id}>
                      <div>
                        <KeyRound aria-hidden="true" size={14} strokeWidth={2.3} />
                        <strong>{keyLevelDirectionLabel(level.direction)} · {level.type.replaceAll("_", " ")}</strong>
                        <span>{level.timeframe} / {keyLevelStatusLabel(level.status)}</span>
                      </div>
                      <p>{priceZoneLabel(level.zoneLow, level.zoneHigh)}</p>
                    </article>
                  ))}
                </div>
                <div className="signal-dossier__section-head signal-dossier__section-head--sub">
                  <h3>Forward Map</h3>
                  <span>{strategyV3.forwardLevels.length} 位</span>
                </div>
                <div className="signal-dossier__v3-map" aria-label="v3 forward map">
                  {strategyV3.forwardLevels.slice(0, 6).map((level) => (
                    <article key={level.id}>
                      <div>
                        <strong>{forwardRoleLabel(level.role)}</strong>
                        <span>{level.side === "SUPPORT" ? "支撑" : "压力"} / {level.status}</span>
                      </div>
                      <p>{priceZoneLabel(level.zoneLow, level.zoneHigh)}</p>
                      <small>{level.confirmationRules[0] ?? level.invalidationRules[0]}</small>
                    </article>
                  ))}
                </div>
              </section>
            ) : (
              <section
                className="signal-dossier__section signal-dossier__section--v3 signal-dossier__section--v3-pending"
                aria-label="v3 关键位地图等待数据"
              >
                <div className="signal-dossier__section-head">
                  <h3>关键位地图</h3>
                  <span>等待 v3 样本</span>
                </div>
                <div className="signal-dossier__v3-summary">
                  <MapPinned aria-hidden="true" size={16} strokeWidth={2.35} />
                  <p>当前信号还没有附带 strategyV3，只展示现有策略和证据；系统不会补画事后关键位。</p>
                  <small>Forward Map 待同步 / 不影响 live ranking</small>
                </div>
                <div className="signal-dossier__route-map" aria-label="v3 证据路径">
                  <article>
                    <strong>结构阶段</strong>
                    <span>等待结构</span>
                    <p>需要多周期 OHLCV 生成 HH/HL、LH/LL、BOS、CHoCH 或区间压缩事实。</p>
                  </article>
                  <article>
                    <strong>关键位置</strong>
                    <span>等待区域</span>
                    <p>关键位必须来自事前结构区间，不使用事后画线或外部拥挤图当作依据。</p>
                  </article>
                  <article>
                    <strong>计划边界</strong>
                    <span>只读等待</span>
                    <p>缺少 v3 Forward Map 时，只保留现有入场、失效、目标和证据链。</p>
                  </article>
                </div>
              </section>
            )}

            <section className="signal-dossier__section signal-dossier__section--tv" aria-label="TradingView K 线入口">
              <div className="signal-dossier__section-head">
                <h3>TradingView</h3>
                <span>{tradingViewSymbol}</span>
              </div>
              <div className="signal-dossier__tv">
                <span><b>{signal.exchange.toUpperCase()}</b>交易所</span>
                <span><b>{interval}</b>TV 周期</span>
                <span><b>{formatTime(signal.updatedAt)}</b>更新</span>
              </div>
              <a className="signal-dossier__tv-link" href={tradingViewUrl} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" size={15} strokeWidth={2.4} />
                <span>打开 TradingView 图表</span>
              </a>
            </section>

            <section className="signal-dossier__section signal-dossier__section--plan" aria-label="执行策略">
              <div className="signal-dossier__section-head">
                <h3>执行策略</h3>
                <span>{signal.strategy.noChase ? "禁止追单" : "等待确认"}</span>
              </div>
              <div className="signal-dossier__strategy">
                <article>
                  <strong>入场条件</strong>
                  <p>{signal.strategy.entryZone ?? signal.strategy.entry}</p>
                </article>
                <article>
                  <strong>失效条件</strong>
                  <p>{signal.strategy.stopLoss ?? signal.strategy.invalidation}</p>
                </article>
                <article>
                  <strong>目标计划</strong>
                  <p>{signal.strategy.takeProfitPlan ?? signal.strategy.targets.join(" / ")}</p>
                </article>
              </div>
              <div className="signal-dossier__checks">
                {confirmations.map((item) => (
                  <span key={`confirm-${item}`}><b>确认</b>{item}</span>
                ))}
                {counterEvidence.map((item) => (
                  <span key={`counter-${item}`}><b>反证</b>{item}</span>
                ))}
              </div>
            </section>

            <section className="signal-dossier__section signal-dossier__section--evidence-room" aria-label="证据链">
              <div className="signal-dossier__section-head">
                <h3>证据链</h3>
                <span>{visibleEvidence.length} 条</span>
              </div>
              <div className="signal-dossier__evidence">
                {visibleEvidence.map((item) => (
                  <article className={`signal-dossier__evidence-item signal-dossier__evidence-item--${item.polarity}`} key={`${item.layer}-${item.label}`}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{evidencePolarityLabel(item.polarity)}</span>
                    </div>
                    <p>{item.value}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="signal-dossier__section signal-dossier__section--review-link" aria-label="每日异动关联">
              <div className="signal-dossier__section-head">
                <h3>每日异动关联</h3>
                <span>{dailyMoverMatches.length} 样本</span>
              </div>
              <div className="signal-dossier__movers">
                {dailyMoverMatches.length > 0 ? dailyMoverMatches.slice(0, 5).map((match) => (
                  <article className={`signal-dossier__mover signal-dossier__mover--${match.direction}`} key={match.id}>
                    <div>
                      <strong>{compactSymbol(match.symbol)}</strong>
                      <span>{dailyMoverDirectionLabel(match.direction)} / {match.status}</span>
                    </div>
                    <p>{match.detail}</p>
                    <small>
                      扫描 {match.scanCount} / 日记 {match.journalCount} / {formatTime(match.observedAt)}
                    </small>
                    <em>{match.nextStep}</em>
                  </article>
                )) : (
                  <p className="signal-dossier__empty">暂无同标的每日异动样本。后续如果它进入涨跌榜，会在这里关联归因。</p>
                )}
              </div>
            </section>

            <section className="signal-dossier__section signal-dossier__section--review-link" aria-label="复盘记录">
              <div className="signal-dossier__section-head">
                <h3>复盘记录</h3>
                <span>{journalMatches.length} 条</span>
              </div>
              <div className="signal-dossier__journal">
                {journalMatches.length > 0 ? journalMatches.slice(0, 5).map((event) => (
                  <article className="signal-dossier__journal-item" key={event.id}>
                    <div>
                      <strong>{journalActionLabel(event.action)}</strong>
                      <span>{formatTime(event.createdAt)}</span>
                    </div>
                    <p>{event.title}</p>
                    <small>{event.trigger ?? event.note}</small>
                  </article>
                )) : (
                  <p className="signal-dossier__empty">这个标的还没有复盘记录。可以先记录观察，后续用于策略校准。</p>
                )}
              </div>
              <div className="signal-dossier__actions" aria-label="信号档案复盘动作">
                {actionButtons.map(({ Icon, action, helper, label }) => (
                  <button key={action} onClick={() => onCreateJournalEntry(action)} type="button">
                    <Icon aria-hidden="true" size={15} strokeWidth={2.35} />
                    <span>
                      <b>{label}</b>
                      <small>{helper}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="signal-dossier__section signal-dossier__section--review-link" aria-label="告警状态">
              <div className="signal-dossier__section-head">
                <h3>告警状态</h3>
                <span>{alertMatches.length ? "有近期事件" : "未触发"}</span>
              </div>
              <div className="signal-dossier__alerts">
                {alertMatches.length > 0 ? alertMatches.slice(0, 4).map((event) => (
                  <article className={`signal-dossier__alert signal-dossier__alert--${event.severity}`} key={event.id}>
                    <BellRing aria-hidden="true" size={15} strokeWidth={2.35} />
                    <div>
                      <strong>{event.title}</strong>
                      <p>{event.detail}</p>
                      <small>{alertSeverityLabel(event.severity)} / {event.actionHint}</small>
                    </div>
                  </article>
                )) : (
                  <div className="signal-dossier__alert signal-dossier__alert--quiet">
                    <RadioTower aria-hidden="true" size={15} strokeWidth={2.35} />
                    <div>
                      <strong>暂无同标的告警</strong>
                      <p>保持观察，不因为静默而降低风控标准。</p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="signal-dossier__section signal-dossier__section--copilot" aria-label="副驾驶反馈">
              <div className="signal-dossier__section-head">
                <h3>副驾驶纪律</h3>
                <span>纪律优先</span>
              </div>
              <div className="signal-dossier__copilot signal-dossier__copilot-card">
                <Sparkles aria-hidden="true" size={16} strokeWidth={2.4} />
                <p>{copilotLine(signal, journalMatches, dailyMoverMatches)}</p>
              </div>
            </section>
          </>
        ) : (
          <div className="signal-dossier__empty-state">
            <strong>等待选择候选</strong>
            <p>点击候选池、信号地图或像素副驾驶后，会打开同一标的联动档案。</p>
          </div>
        )}
      </aside>
    </div>
  );
}
