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
  };

  return labels[value] ?? value.replaceAll("_", " ");
}

function dailyMoverDirectionLabel(value: SignalDossierDailyMoverMatch["direction"]) {
  return value === "gainer" ? "涨幅样本" : "跌幅样本";
}

function keyLevelDirectionLabel(value: NonNullable<MarketSignal["strategyV3"]>["keyLevels"][number]["direction"]) {
  return {
    BOTH: "双向",
    RESISTANCE: "压力",
    SUPPORT: "支撑",
  }[value];
}

function keyLevelStatusLabel(value: NonNullable<MarketSignal["strategyV3"]>["keyLevels"][number]["status"]) {
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

function forwardRoleLabel(value: NonNullable<MarketSignal["strategyV3"]>["forwardLevels"][number]["role"]) {
  return {
    CURRENT_DEFENSE: "当前防守",
    FIRST_REBOUND_RESISTANCE: "第一反弹压力",
    INVALIDATION_LEVEL: "失效位",
    NEXT_REACTION_ZONE: "下一反应区",
    SECOND_REBOUND_RESISTANCE: "第二反弹压力",
    TREND_CHANGE_LEVEL: "趋势切换位",
  }[value];
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
            <section className="signal-dossier__section" aria-label="当前上下文">
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
              <section className="signal-dossier__section" aria-label="Strategy v2 证据审计">
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
              <section className="signal-dossier__section" aria-label="v3 关键位地图和 Forward Map">
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
            ) : null}

            <section className="signal-dossier__section" aria-label="TradingView K 线入口">
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

            <section className="signal-dossier__section" aria-label="执行策略">
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

            <section className="signal-dossier__section" aria-label="证据链">
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

            <section className="signal-dossier__section" aria-label="每日异动关联">
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

            <section className="signal-dossier__section" aria-label="复盘记录">
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

            <section className="signal-dossier__section" aria-label="告警状态">
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
                <h3>副驾驶反馈</h3>
                <span>纪律优先</span>
              </div>
              <div className="signal-dossier__copilot">
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
