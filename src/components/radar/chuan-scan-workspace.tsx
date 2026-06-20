"use client";
import {
  Activity,
  BookOpen,
  ChevronRight,
  Clock3,
  Database,
  ExternalLink,
  Gauge,
  Layers3,
  Menu,
  Orbit,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signalStateLabels } from "@/lib/analysis/constants";
import type {
  JournalEvent,
  MarketSignal,
  SignalDirection,
  SignalJournalAction,
} from "@/lib/analysis/types";
import { evaluateStrategyV3Readiness } from "@/lib/analysis/v3/readiness";
import type { BackendContract } from "@/lib/api/backend-contract";
import type { DailyMoverReadArchiveResult } from "@/lib/api/daily-mover-readonly";
import type { SystemHealthReport } from "@/lib/api/system-health";
import { buildJournalEntryFromSignal, mergeJournalEntry } from "@/lib/journal/journal-entry";
import { buildRankProfile } from "@/lib/journal/rank-engine";
import { buildRefreshPlan, compareSignalSets, type SignalSetDelta } from "@/lib/market/live-refresh";
import { buildTradingViewUrl } from "@/lib/market/tradingview-links";
import type { MarketRadarSnapshot, MarketTicker } from "@/lib/market/types";

type ChuanScanWorkspaceProps = {
  backendContract: BackendContract;
  dailyMoverArchive: DailyMoverReadArchiveResult["body"];
  health: SystemHealthReport;
  snapshot: MarketRadarSnapshot;
};

type NavigationSection = "radar" | "signals" | "review" | "journal" | "evolution" | "settings";
type SignalFilter = "all" | "long" | "short" | "breakout" | "watch" | "risk";
type JournalSaveStatus = "idle" | "saving" | "saved" | "error";
type RefreshState = "idle" | "syncing" | "updated" | "quiet" | "error";

const navItems: Array<{
  id: NavigationSection;
  label: string;
  sublabel: string;
  Icon: typeof Sparkles;
}> = [
  { id: "radar", label: "Radar", sublabel: "雷达", Icon: Sparkles },
  { id: "signals", label: "Signals", sublabel: "信号", Icon: Zap },
  { id: "review", label: "Review", sublabel: "复盘", Icon: RefreshCw },
  { id: "journal", label: "Journal", sublabel: "日志", Icon: BookOpen },
  { id: "evolution", label: "Evolution", sublabel: "进化", Icon: Orbit },
  { id: "settings", label: "Settings", sublabel: "设置", Icon: Gauge },
];

const actionButtons: Array<{
  action: SignalJournalAction;
  label: string;
  helper: string;
}> = [
  { action: "track", label: "记录观察", helper: "进入复盘队列" },
  { action: "paper_trade", label: "纸面跟踪", helper: "验证计划，不下单" },
  { action: "skip", label: "拒绝追单", helper: "保留纪律样本" },
];

const filterTabs: Array<{
  id: SignalFilter;
  label: string;
}> = [
  { id: "all", label: "全部" },
  { id: "long", label: "看多候选" },
  { id: "short", label: "看空候选" },
  { id: "breakout", label: "突破/临界" },
  { id: "watch", label: "观察池" },
  { id: "risk", label: "高危预警" },
];

function compactSymbol(symbol?: string) {
  return symbol?.replace(/USDT$/u, "") ?? "WAIT";
}

function normalizeSymbol(symbol: string) {
  return symbol
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/(USDT|USDC|USD|PERP)$/u, "");
}

function formatTime(value?: string) {
  if (!value) {
    return "等待";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(11, 16);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function formatDateTime(value?: string) {
  if (!value) {
    return "待同步";
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

function formatPercent(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatPrice(value: number) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  if (value >= 1000) {
    return value.toLocaleString("en-US", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    });
  }

  if (value >= 1) {
    return value.toLocaleString("en-US", {
      maximumFractionDigits: 3,
      minimumFractionDigits: 2,
    });
  }

  return value.toLocaleString("en-US", {
    maximumFractionDigits: 6,
    minimumFractionDigits: 4,
  });
}

function stateTone(signal?: MarketSignal) {
  if (!signal) {
    return "idle";
  }

  if (signal.risk === "blocked" || signal.risk === "high" || signal.state === "invalidated") {
    return "danger";
  }

  if (signal.state === "triggered" || signal.state === "near_trigger") {
    return "hot";
  }

  if (signal.state === "waiting_confirmation" || signal.state === "abnormal_watch") {
    return "watch";
  }

  return "calm";
}

function directionLabel(value: SignalDirection) {
  return {
    long: "多头计划",
    neutral: "中性观察",
    short: "空头计划",
  }[value];
}

function directionTone(value: SignalDirection) {
  return {
    long: "long",
    neutral: "neutral",
    short: "short",
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

function signalFilterMatches(signal: MarketSignal, filter: SignalFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "long") {
    return signal.direction === "long";
  }

  if (filter === "short") {
    return signal.direction === "short";
  }

  if (filter === "breakout") {
    return signal.state === "near_trigger" || signal.state === "triggered" || signal.state === "waiting_confirmation";
  }

  if (filter === "watch") {
    return signal.state === "normal_watch" || signal.state === "abnormal_watch";
  }

  return signal.risk === "high" || signal.risk === "blocked" || signal.state === "invalidated";
}

function strategyStatusLabel(value?: string) {
  if (!value) {
    return "等待";
  }

  const labels: Record<string, string> = {
    actionable: "可执行",
    blocked: "阻断",
    observe_only: "只观察",
    waiting: "等待确认",
  };

  return labels[value] ?? value.replaceAll("_", " ");
}

function v3DecisionLabel(value?: string) {
  if (!value) {
    return "等待结构";
  }

  const labels: Record<string, string> = {
    AVOID_CHASE_LONG: "拒绝追高",
    AVOID_CHASE_SHORT: "拒绝追空",
    CONFLICT_WAIT: "冲突等待",
    INVALIDATED: "结构失效",
    LONG_PLAN: "多头计划",
    NO_TRADE: "不参与",
    PREPARE_LONG: "准备多头",
    PREPARE_SHORT: "准备空头",
    SHORT_PLAN: "空头计划",
    TAKE_PROFIT_LONG: "多头止盈管理",
    TAKE_PROFIT_SHORT: "空头止盈管理",
    TREND_HOLD_LONG: "多头持有观察",
    TREND_HOLD_SHORT: "空头持有观察",
    WAIT_LONG_BREAKOUT: "等待多头突破",
    WAIT_LONG_PULLBACK: "等待多头回踩",
    WAIT_SHORT_BREAKDOWN: "等待空头跌破",
    WAIT_SHORT_RETEST: "等待空头反抽",
    WATCH_ONLY: "只观察",
  };

  return labels[value] ?? value.replaceAll("_", " ");
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
    .slice(0, 10);

  return [...anchorTickers, ...altTickers];
}

function journalStatusLabel(value: JournalSaveStatus) {
  return {
    error: "写入失败",
    idle: "日记待命",
    saved: "已写入",
    saving: "写入中",
  }[value];
}

function refreshStatusLabel(value: RefreshState) {
  return {
    error: "刷新失败",
    idle: "自动轮询",
    quiet: "已同步",
    syncing: "同步中",
    updated: "新变化",
  }[value];
}

function mergeJournalEvents(current: JournalEvent[], incoming: JournalEvent[]) {
  const entriesById = new Map<string, JournalEvent>();

  for (const entry of incoming) {
    entriesById.set(entry.id, entry);
  }

  for (const entry of current) {
    entriesById.set(entry.id, entry);
  }

  return Array.from(entriesById.values()).sort((first, second) =>
    new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()
  );
}

function tradingViewUrl(signal: MarketSignal) {
  return buildTradingViewUrl({
    baseUrl: "https://www.tradingview.com/chart/",
    exchange: signal.exchange,
    symbol: signal.symbol,
    timeframe: signal.timeframe,
  });
}

function ScoreRing({ label, score }: { label: string; score: number }) {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));

  return (
    <div
      aria-label={`${label} ${safeScore}`}
      className="chuan-score-ring"
      style={{ "--score": `${safeScore}%` } as React.CSSProperties}
    >
      <strong>{safeScore}</strong>
      <span>{label}</span>
    </div>
  );
}

function ChuanLogo({ pulse = false }: { pulse?: boolean }) {
  return (
    <div className={`chuan-logo ${pulse ? "chuan-logo--pulse" : ""}`} aria-label="川">
      川
    </div>
  );
}

function EvidenceList({ signal }: { signal?: MarketSignal }) {
  const evidence = signal?.evidence.slice(0, 6) ?? [];

  return (
    <div className="chuan-evidence-list">
      {evidence.length === 0 ? (
        <div className="chuan-empty-state chuan-empty-state--compact">
          <strong>暂无证据链</strong>
          <span>等待下一轮扫描。</span>
        </div>
      ) : null}
      {evidence.map((item, index) => (
        <div className={`chuan-evidence-item chuan-evidence-item--${item.polarity}`} key={`${item.layer}-${item.label}-${index}`}>
          <span>{item.layer.replaceAll("_", " ")}</span>
          <strong>{item.label}</strong>
          <small>{item.value}</small>
        </div>
      ))}
    </div>
  );
}

function DossierOverlay({
  journalEntries,
  onClose,
  onCreateJournalEntry,
  signal,
}: {
  journalEntries: JournalEvent[];
  onClose: () => void;
  onCreateJournalEntry: (action: SignalJournalAction) => void;
  signal?: MarketSignal;
}) {
  if (!signal) {
    return null;
  }

  const relatedJournal = journalEntries
    .filter((entry) => normalizeSymbol(entry.symbol) === normalizeSymbol(signal.symbol))
    .slice(0, 6);
  const tvUrl = tradingViewUrl(signal);
  const strategyV3Readiness = signal.strategyV3 ? evaluateStrategyV3Readiness(signal) : null;

  return (
    <section aria-label={`${signal.symbol} 信号档案`} aria-modal="true" className="chuan-dossier-overlay" role="dialog">
      <button aria-label="关闭信号档案" className="chuan-dossier-overlay__backdrop" onClick={onClose} type="button" />
      <div className="chuan-dossier">
        <div className="chuan-dossier__head">
          <div>
            <span>Signal Dossier</span>
            <h2>{compactSymbol(signal.symbol)} / USDT</h2>
            <small>{directionLabel(signal.direction)} · {signalStateLabels[signal.state]} · {formatDateTime(signal.updatedAt)}</small>
          </div>
          <button aria-label="关闭信号档案" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="chuan-dossier__hero">
          <ScoreRing label="信号分" score={signal.confidence} />
          <div>
            <p>{signal.summary}</p>
            <div className="chuan-chip-row">
              <span>{strategyStatusLabel(signal.strategy.status)}</span>
              <span>RR {signal.strategy.riskReward.toFixed(1)} : 1</span>
              <span>{riskLabel(signal.risk)}</span>
              <span>{v3DecisionLabel(signal.strategyV3?.trendContext?.decision)}</span>
            </div>
            {strategyV3Readiness ? (
              <div className="chuan-dossier__readiness" aria-label="v3 人工复核准备度">
                <strong>{strategyV3Readiness.label} · {strategyV3Readiness.score}</strong>
                <span>{strategyV3Readiness.summary}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="chuan-dossier__grid">
          <section>
            <h3>交易计划</h3>
            <dl className="chuan-plan-list">
              <div><dt>入场</dt><dd>{signal.strategy.entry}</dd></div>
              <div><dt>失效</dt><dd>{signal.strategy.invalidation}</dd></div>
              <div><dt>止损</dt><dd>{signal.strategy.stopLoss ?? "等待计划"}</dd></div>
              <div><dt>止盈</dt><dd>{signal.strategy.takeProfitPlan ?? signal.strategy.targets.join(" / ")}</dd></div>
            </dl>
          </section>
          <section>
            <h3>操作</h3>
            <div className="chuan-dossier__actions">
              {actionButtons.map((item) => (
                <button key={item.action} onClick={() => onCreateJournalEntry(item.action)} type="button">
                  <strong>{item.label}</strong>
                  <span>{item.helper}</span>
                </button>
              ))}
              <a href={tvUrl} rel="noreferrer" target="_blank">
                <strong>打开 TradingView</strong>
                <span>真实外部图表</span>
              </a>
            </div>
          </section>
        </div>

        <section className="chuan-dossier__section">
          <h3>证据链</h3>
          <EvidenceList signal={signal} />
        </section>

        <section className="chuan-dossier__section">
          <h3>关键位 / Forward Map</h3>
          <div className="chuan-keylevel-grid">
            {(signal.strategyV3?.keyLevels.slice(0, 6) ?? []).map((level) => (
              <div key={level.id}>
                <span>{level.timeframe} · {level.direction}</span>
                <strong>{formatPrice(level.zoneLow)} - {formatPrice(level.zoneHigh)}</strong>
                <small>{level.reasons.slice(0, 2).join(" / ")}</small>
              </div>
            ))}
            {(signal.strategyV3?.forwardLevels.slice(0, 4) ?? []).map((level) => (
              <div key={level.id}>
                <span>{level.role.replaceAll("_", " ")}</span>
                <strong>{formatPrice(level.zoneLow)} - {formatPrice(level.zoneHigh)}</strong>
                <small>{level.reasons.slice(0, 2).join(" / ")}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="chuan-dossier__section">
          <h3>相关复盘</h3>
          <div className="chuan-journal-mini">
            {relatedJournal.length === 0 ? <span>暂无该标的复盘记录。</span> : null}
            {relatedJournal.map((entry) => (
              <div key={entry.id}>
                <strong>{entry.title}</strong>
                <small>{formatDateTime(entry.createdAt)} · {entry.result}</small>
                <p>{entry.note}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function Drawer({
  activeSection,
  backendContract,
  dailyMoverArchive,
  journalEntries,
  onClose,
  onOpenDossier,
  onSelectSignal,
  rankProfile,
  selected,
  signals,
}: {
  activeSection: Exclude<NavigationSection, "radar">;
  backendContract: BackendContract;
  dailyMoverArchive: DailyMoverReadArchiveResult["body"];
  journalEntries: JournalEvent[];
  onClose: () => void;
  onOpenDossier: (signal?: MarketSignal) => void;
  onSelectSignal: (signal: MarketSignal) => void;
  rankProfile: ReturnType<typeof buildRankProfile>;
  selected?: MarketSignal;
  signals: MarketSignal[];
}) {
  const title = {
    evolution: "Evolution 进化室",
    journal: "Journal 日志室",
    review: "Review 复盘室",
    settings: "Settings 系统设置",
    signals: "Signals 完整候选池",
  }[activeSection];

  return (
    <section aria-label={title} aria-modal="true" className={`chuan-drawer chuan-drawer--${activeSection}`} role="dialog">
      <button aria-label="关闭功能抽屉" className="chuan-drawer__backdrop" onClick={onClose} type="button" />
      <div className="chuan-drawer__panel">
        <div className="chuan-drawer__head">
          <div>
            <span>Functional Drawer</span>
            <h2>{title}</h2>
          </div>
          <button onClick={onClose} type="button">关闭</button>
        </div>

        {activeSection === "signals" ? (
          <div className="chuan-full-signal-list">
            {signals.map((signal, index) => (
              <button
                className={selected?.id === signal.id ? "is-selected" : ""}
                key={signal.id}
                onClick={() => {
                  onSelectSignal(signal);
                  onOpenDossier(signal);
                }}
                type="button"
              >
                <span>#{index + 1}</span>
                <strong>{compactSymbol(signal.symbol)}</strong>
                <small>{signalStateLabels[signal.state]} · {directionLabel(signal.direction)}</small>
                <b>{signal.confidence}</b>
                <em>RR {signal.strategy.riskReward.toFixed(1)}:1</em>
              </button>
            ))}
          </div>
        ) : null}

        {activeSection === "review" ? (
          <div className="chuan-review-grid">
            <section>
              <h3>扫描回放</h3>
              {(dailyMoverArchive.snapshots ?? []).slice(0, 6).map((snapshot) => (
                <div key={snapshot.id}>
                  <strong>{formatDateTime(snapshot.observedAt)}</strong>
                  <span>涨 {snapshot.gainerCount} / 跌 {snapshot.loserCount} / 复盘 {snapshot.reviewCount}</span>
                </div>
              ))}
              {dailyMoverArchive.snapshots.length === 0 ? <p>暂无每日异动归因样本。</p> : null}
            </section>
            <section>
              <h3>漏判/归因样本</h3>
              {dailyMoverArchive.selectedDetails.slice(0, 8).map((detail) => (
                <div key={detail.id}>
                  <strong>{detail.symbol}</strong>
                  <span>{detail.radarStatus} · {detail.learnability}</span>
                  <small>{detail.whyMissed}</small>
                </div>
              ))}
            </section>
          </div>
        ) : null}

        {activeSection === "journal" ? (
          <div className="chuan-journal-list">
            {journalEntries.slice(0, 18).map((entry) => (
              <article key={entry.id}>
                <strong>{entry.symbol} · {entry.title}</strong>
                <span>{formatDateTime(entry.createdAt)} · {entry.result} · XP {entry.rankDelta}</span>
                <p>{entry.note}</p>
              </article>
            ))}
            {journalEntries.length === 0 ? <p>暂无日记记录。</p> : null}
          </div>
        ) : null}

        {activeSection === "evolution" ? (
          <div className="chuan-evolution-room">
            <section>
              <h3>{rankProfile.tier.label}</h3>
              <p>{rankProfile.petLine}</p>
              <div className="chuan-progress">
                <span style={{ width: `${rankProfile.progressPercent}%` }} />
              </div>
              <small>{rankProfile.totalXp} XP · 距下一段 {rankProfile.xpToNextTier}</small>
            </section>
            <section>
              <h3>纪律样本</h3>
              <div className="chuan-stat-grid">
                <span><b>{rankProfile.wins}</b> win</span>
                <span><b>{rankProfile.losses}</b> loss</span>
                <span><b>{rankProfile.saved}</b> saved</span>
                <span><b>{rankProfile.tracking}</b> tracking</span>
                <span><b>{rankProfile.hitRate}%</b> hit</span>
                <span><b>{rankProfile.disciplineScore}%</b> discipline</span>
              </div>
            </section>
          </div>
        ) : null}

        {activeSection === "settings" ? (
          <div className="chuan-settings-grid">
            <section>
              <h3>后端契约</h3>
              <dl>
                <div><dt>Contract</dt><dd>{backendContract.schemaVersion}</dd></div>
                <div><dt>Source</dt><dd>{backendContract.source.activeSource}</dd></div>
                <div><dt>Runtime</dt><dd>{backendContract.runtime.cacheStatus}</dd></div>
                <div><dt>Repo</dt><dd>{backendContract.runtime.repositoryMode}</dd></div>
              </dl>
            </section>
            <section>
              <h3>扫描证明</h3>
              <dl>
                <div><dt>全市场</dt><dd>{backendContract.scanProof.fullMarket.scannedAssets}/{backendContract.scanProof.fullMarket.eligibleAssets}</dd></div>
                <div><dt>轻扫</dt><dd>{backendContract.scanProof.lightScan.status} · {backendContract.scanProof.lightScan.candidateCount}</dd></div>
                <div><dt>深扫</dt><dd>{backendContract.scanProof.deepScan.plannedAssets.join(", ") || "等待计划"}</dd></div>
                <div><dt>容量</dt><dd>{backendContract.scanProof.allocation.capacity}</dd></div>
              </dl>
            </section>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function ChuanScanWorkspace({
  backendContract,
  dailyMoverArchive,
  health,
  snapshot,
}: ChuanScanWorkspaceProps) {
  const [liveSnapshot, setLiveSnapshot] = useState(snapshot);
  const [liveHealth, setLiveHealth] = useState(health);
  const [liveContract, setLiveContract] = useState(backendContract);
  const [activeSection, setActiveSection] = useState<NavigationSection>("radar");
  const [activeFilter, setActiveFilter] = useState<SignalFilter>("all");
  const [selectedId, setSelectedId] = useState(snapshot.signals[0]?.id);
  const [dossierSignalId, setDossierSignalId] = useState<string | undefined>();
  const [journalEntries, setJournalEntries] = useState<JournalEvent[]>(snapshot.journalEvents);
  const [journalStatus, setJournalStatus] = useState<JournalSaveStatus>("idle");
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");
  const [lastDelta, setLastDelta] = useState<SignalSetDelta | null>(null);
  const [bootVisible, setBootVisible] = useState(true);
  const snapshotRef = useRef(snapshot);

  const { metadata, signals, tickers } = liveSnapshot;
  const selected = useMemo(
    () => signals.find((signal) => signal.id === selectedId) ?? signals[0],
    [selectedId, signals],
  );
  const dossierSignal = useMemo(
    () => signals.find((signal) => signal.id === dossierSignalId),
    [dossierSignalId, signals],
  );
  const rankProfile = useMemo(() => buildRankProfile(journalEntries), [journalEntries]);
  const tapeItems = useMemo(() => marketTapeItems(tickers), [tickers]);
  const filteredSignals = useMemo(
    () => signals.filter((signal) => signalFilterMatches(signal, activeFilter)),
    [activeFilter, signals],
  );
  const topSignals = filteredSignals.slice(0, 12);
  const hiddenSignalCount = Math.max(0, filteredSignals.length - topSignals.length);
  const selectedTicker = selected
    ? tickers.find((ticker) => normalizeSymbol(ticker.symbol) === normalizeSymbol(selected.symbol))
    : undefined;
  const refreshLabel = refreshStatusLabel(refreshState);
  const scanCoverage = liveContract.scanProof.fullMarket;
  const allocation = liveContract.scanProof.allocation;
  const averageConfidence = signals.length > 0
    ? Math.round(signals.reduce((total, signal) => total + signal.confidence, 0) / signals.length)
    : 0;
  const highRiskCount = signals.filter((signal) => signal.risk === "high" || signal.risk === "blocked").length;
  const activeMoverCount = tickers.filter((ticker) => Math.abs(ticker.changePercent24h) >= 3).length;
  const marketHeat = [...tickers]
    .sort((left, right) => Math.abs(right.changePercent24h) - Math.abs(left.changePercent24h))
    .slice(0, 9);

  const openDossier = useCallback((signal?: MarketSignal) => {
    const target = signal ?? selected;

    if (!target) {
      return;
    }

    setSelectedId(target.id);
    setDossierSignalId(target.id);
  }, [selected]);

  const closeDossier = useCallback(() => {
    setDossierSignalId(undefined);
  }, []);

  const selectSignal = useCallback((signal: MarketSignal) => {
    setSelectedId(signal.id);
  }, []);

  const closeDrawer = useCallback(() => {
    setActiveSection("radar");
  }, []);

  const applyJournalResponse = useCallback((payload: {
    entry?: JournalEvent;
    entries?: JournalEvent[];
  }) => {
    if (payload.entry) {
      setJournalEntries((current) => mergeJournalEntry(current, payload.entry as JournalEvent));
    } else if (payload.entries) {
      setJournalEntries(payload.entries);
    }
  }, []);

  const createJournalEntry = useCallback(async (action: SignalJournalAction) => {
    if (!selected) {
      return;
    }

    const optimisticEntry = buildJournalEntryFromSignal(selected, action, {
      createdAt: new Date().toISOString(),
    });

    setJournalEntries((current) => mergeJournalEntry(current, optimisticEntry));
    setJournalStatus("saving");

    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action,
          signalId: selected.id,
        }),
      });

      if (!response.ok) {
        throw new Error("journal_request_failed");
      }

      const payload = await response.json() as {
        entry?: JournalEvent;
        entries?: JournalEvent[];
      };

      applyJournalResponse(payload);
      setJournalStatus("saved");
    } catch {
      setJournalStatus("error");
    }
  }, [applyJournalResponse, selected]);

  useEffect(() => {
    const timer = window.setTimeout(() => setBootVisible(false), 1500);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function syncRadar() {
      setRefreshState("syncing");

      try {
        const [radarResponse, contractResponse] = await Promise.all([
          fetch("/api/radar", { cache: "no-store" }),
          fetch("/api/radar/backend-contract", { cache: "no-store" }),
        ]);

        if (!radarResponse.ok || !contractResponse.ok) {
          throw new Error("radar_sync_failed");
        }

        const radarPayload = await radarResponse.json() as {
          health?: SystemHealthReport;
          ok?: boolean;
          snapshot?: MarketRadarSnapshot;
        };
        const contractPayload = await contractResponse.json() as {
          contract?: BackendContract;
          ok?: boolean;
        };

        if (!radarPayload.ok || !radarPayload.health || !radarPayload.snapshot || !contractPayload.ok || !contractPayload.contract) {
          throw new Error("radar_payload_invalid");
        }

        const previousSnapshot = snapshotRef.current;
        const nextSnapshot = radarPayload.snapshot;
        const delta = compareSignalSets({
          nextScanId: nextSnapshot.metadata.id,
          nextSignals: nextSnapshot.signals,
          previousScanId: previousSnapshot.metadata.id,
          previousSignals: previousSnapshot.signals,
        });

        if (cancelled) {
          return;
        }

        setLiveSnapshot(nextSnapshot);
        setLiveHealth(radarPayload.health);
        setLiveContract(contractPayload.contract);
        setJournalEntries((current) => mergeJournalEvents(current, nextSnapshot.journalEvents));
        setLastDelta(delta);
        setRefreshState(delta.hasActionableChange ? "updated" : delta.isNewScan ? "quiet" : "idle");
        snapshotRef.current = nextSnapshot;
      } catch {
        if (!cancelled) {
          setRefreshState("error");
        }
      } finally {
        if (!cancelled) {
          const plan = buildRefreshPlan({
            nextScanAt: snapshotRef.current.metadata.nextScanAt,
            now: new Date(),
          });

          timer = setTimeout(syncRadar, plan.intervalMs);
        }
      }
    }

    const initialPlan = buildRefreshPlan({
      nextScanAt: snapshotRef.current.metadata.nextScanAt,
      now: new Date(),
    });

    timer = setTimeout(syncRadar, initialPlan.intervalMs);

    return () => {
      cancelled = true;

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  return (
    <main className={`chuan-scan-shell chuan-scan-shell--${metadata.status} chuan-scan-shell--refresh-${refreshState}`}>
      {bootVisible ? (
        <section className="chuan-boot" aria-label="启动动画">
          <div className="chuan-boot__grid" aria-hidden="true" />
          <ChuanLogo pulse />
          <h1>CHUANSCAN</h1>
          <p>REAL-TIME ALTCOIN TREND RADAR · 证据链启动中</p>
          <div className="chuan-boot__bar"><span /></div>
          <button onClick={() => setBootVisible(false)} type="button">进入雷达</button>
        </section>
      ) : null}

      <div className="chuan-bg-grid" aria-hidden="true" />
      <div className="chuan-bg-scanline" aria-hidden="true" />

      <header className="chuan-topbar">
        <div className="chuan-topbar__brand">
          <ChuanLogo />
          <div>
            <strong>CHUANSCAN</strong>
            <span>异动雷达</span>
          </div>
        </div>

        <nav className="chuan-topbar__nav" aria-label="主导航">
          {navItems.map(({ Icon, id, label, sublabel }) => (
            <button
              aria-current={activeSection === id ? "page" : undefined}
              className={activeSection === id ? "is-active" : ""}
              key={id}
              onClick={() => setActiveSection(id)}
              type="button"
            >
              <Icon size={16} />
              <span>{label}</span>
              <small>{sublabel}</small>
            </button>
          ))}
        </nav>

        <div className="chuan-topbar__tools">
          <button aria-label="刷新状态" className="chuan-tool-button" onClick={() => setRefreshState("syncing")} type="button">
            <RefreshCw size={18} />
          </button>
          <button aria-label="打开设置" className="chuan-user-button" onClick={() => setActiveSection("settings")} type="button">
            <span>川</span>
            <strong>用户</strong>
            <ChevronRight size={14} />
          </button>
          <button aria-label="打开菜单" className="chuan-tool-button chuan-tool-button--menu" onClick={() => setActiveSection("settings")} type="button">
            <Menu size={19} />
          </button>
        </div>
      </header>

      <section className="chuan-market-strip" aria-label="市场行情带">
        {tapeItems.map((ticker) => (
          <span className={ticker.changePercent24h >= 0 ? "is-up" : "is-down"} key={`${ticker.exchange}-${ticker.symbol}`}>
            <b>{compactSymbol(ticker.symbol)}</b>
            <small>${formatPrice(ticker.price)}</small>
            <strong>{formatPercent(ticker.changePercent24h)}</strong>
          </span>
        ))}
      </section>

      <section className="chuan-kpi-grid" aria-label="雷达统计">
        <article>
          <span>活跃信号</span>
          <strong>{signals.length}</strong>
          <small>{lastDelta?.newSymbols.length ? `+${lastDelta.newSymbols.length} 新增` : "实时候选池"}</small>
          <Zap size={18} />
        </article>
        <article>
          <span>24H 异动</span>
          <strong>{activeMoverCount}</strong>
          <small>涨跌幅绝对值 ≥ 3%</small>
          <Activity size={18} />
        </article>
        <article>
          <span>平均强度</span>
          <strong>{averageConfidence}<em>/100</em></strong>
          <small>{signals.length > 0 ? "按当前候选计算" : "等待信号"}</small>
          <Gauge size={18} />
        </article>
        <article>
          <span>高危预警</span>
          <strong>{highRiskCount}</strong>
          <small>{highRiskCount > 0 ? "需要关注" : "暂无阻断风险"}</small>
          <ShieldCheck size={18} />
        </article>
      </section>

      <section className="chuan-radar-layout" aria-label="CHUANSCAN radar board">
        <main className="chuan-radar-main">
          <section className="chuan-radar-board">
            <div className="chuan-board-head">
              <div>
                <h1>异动雷达 <em>LIVE</em></h1>
                <p>实时监测全市场异常波动信号，优先展示证据足、位置清晰、风险可控的山寨币候选。</p>
              </div>
              <div className="chuan-board-tools">
                <span>{filteredSignals.length} 条信号</span>
                <button onClick={() => setRefreshState("syncing")} type="button">
                  <RefreshCw size={15} />
                  刷新
                </button>
                <button onClick={() => setActiveSection("signals")} type="button">
                  <Layers3 size={15} />
                  全部候选
                </button>
              </div>
            </div>

            <div className="chuan-filter-tabs" role="tablist" aria-label="信号筛选">
              {filterTabs.map((tab) => (
                <button
                  aria-selected={activeFilter === tab.id}
                  className={activeFilter === tab.id ? "is-active" : ""}
                  key={tab.id}
                  onClick={() => setActiveFilter(tab.id)}
                  role="tab"
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="chuan-radar-card-grid">
              {topSignals.map((signal) => {
                const ticker = tickers.find((item) => normalizeSymbol(item.symbol) === normalizeSymbol(signal.symbol));
                const tone = stateTone(signal);

                return (
                  <article className={`chuan-radar-card chuan-radar-card--${directionTone(signal.direction)} chuan-radar-card--${tone}`} key={signal.id}>
                    <button className="chuan-radar-card__main" onClick={() => selectSignal(signal)} type="button">
                      <span className="chuan-radar-card__tag">{directionLabel(signal.direction)}</span>
                      <span className="chuan-radar-card__live"><i />监测中</span>
                      <time>{formatTime(signal.updatedAt)}</time>

                      <div className="chuan-radar-card__identity">
                        <span>{compactSymbol(signal.symbol)}</span>
                        <small>{signal.exchange}</small>
                      </div>

                      <ScoreRing label="强度" score={signal.confidence} />

                      <div className="chuan-radar-card__metrics">
                        <strong>{ticker ? `$${formatPrice(ticker.price)}` : "价格待同步"}</strong>
                        <b className={ticker && ticker.changePercent24h >= 0 ? "is-up" : "is-down"}>{ticker ? formatPercent(ticker.changePercent24h) : "--"}</b>
                        <small>RR {signal.strategy.riskReward.toFixed(1)} : 1</small>
                      </div>

                      <p>{signal.summary}</p>
                    </button>
                    <div className="chuan-radar-card__foot">
                      <span>{signalStateLabels[signal.state]}</span>
                      <span>{riskLabel(signal.risk)}</span>
                      <button onClick={() => openDossier(signal)} type="button">
                        档案
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </article>
                );
              })}
              {topSignals.length === 0 ? (
                <div className="chuan-empty-state chuan-empty-state--radar">
                  <strong>当前筛选没有候选</strong>
                  <span>切回“全部”，或等待下一轮扫描。</span>
                </div>
              ) : null}
            </div>

            {hiddenSignalCount > 0 ? (
              <button className="chuan-more-signals" onClick={() => setActiveSection("signals")} type="button">
                查看剩余 {hiddenSignalCount} 个候选
                <ChevronRight size={15} />
              </button>
            ) : null}
          </section>

          <section className="chuan-plan-dock">
            <div className="chuan-plan-dock__summary">
              <ScoreRing label="Score" score={selected?.confidence ?? 0} />
              <div>
                <span>{selected ? directionLabel(selected.direction) : "等待候选"}</span>
                <h2>{selected ? `${compactSymbol(selected.symbol)} / USDT` : "No Signal"}</h2>
                <p>{selected?.summary ?? "等待后端扫描结果。前端不会伪造信号、K 线或买卖建议。"}</p>
              </div>
              <strong>{selectedTicker ? `$${formatPrice(selectedTicker.price)}` : "--"}</strong>
            </div>

            <div className="chuan-plan-grid">
              <div><span>阶段</span><strong>{selected ? v3DecisionLabel(selected.strategyV3?.trendContext?.decision) : "等待"}</strong></div>
              <div><span>入场</span><strong>{selected?.strategy.entry ?? "等待"}</strong></div>
              <div><span>失效</span><strong>{selected?.strategy.invalidation ?? "等待"}</strong></div>
              <div><span>RR</span><strong>{selected ? `${selected.strategy.riskReward.toFixed(1)} : 1` : "--"}</strong></div>
            </div>

            <div className="chuan-action-row">
              <button disabled={!selected} onClick={() => openDossier()} type="button">
                <Target size={16} />
                打开信号档案
              </button>
              {selected ? (
                <a href={tradingViewUrl(selected)} rel="noreferrer" target="_blank">
                  <ExternalLink size={16} />
                  TradingView
                </a>
              ) : null}
              {actionButtons.map((item) => (
                <button disabled={!selected} key={item.action} onClick={() => createJournalEntry(item.action)} type="button">
                  {item.label}
                </button>
              ))}
            </div>
          </section>
        </main>

        <aside className="chuan-radar-side">
          <section className="chuan-side-card chuan-alert-list">
            <div className="chuan-side-card__head">
              <h2>实时预警</h2>
              <span>{refreshLabel}</span>
            </div>
            {signals.slice(0, 6).map((signal) => (
              <button key={`alert-${signal.id}`} onClick={() => openDossier(signal)} type="button">
                <time>{formatTime(signal.updatedAt)}</time>
                <strong>{compactSymbol(signal.symbol)}</strong>
                <span>{signalStateLabels[signal.state]}</span>
                <b className={signal.direction === "short" ? "is-down" : "is-up"}>{signal.direction === "short" ? "SHORT" : signal.direction === "long" ? "LONG" : "WAIT"}</b>
              </button>
            ))}
          </section>

          <section className="chuan-side-card chuan-heat-board">
            <div className="chuan-side-card__head">
              <h2>市场热力</h2>
              <span>24H</span>
            </div>
            <div>
              {marketHeat.map((ticker) => (
                <button className={ticker.changePercent24h >= 0 ? "is-up" : "is-down"} key={`heat-${ticker.exchange}-${ticker.symbol}`} type="button">
                  <strong>{compactSymbol(ticker.symbol)}</strong>
                  <span>{formatPercent(ticker.changePercent24h)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="chuan-side-card chuan-proof-card">
            <div className="chuan-side-card__head">
              <h2>扫描证明</h2>
              <span>{scanCoverage.coveragePercent}%</span>
            </div>
            <div className="chuan-proof-compact">
              <span><Database size={15} /> {liveHealth.persistence.durable ? "Neon Ready" : "Memory Mode"}</span>
              <span><RadioTower size={15} /> {liveContract.source.activeSource}</span>
              <span><Clock3 size={15} /> 下一轮 {formatTime(metadata.nextScanAt)}</span>
              <span><Layers3 size={15} /> 深扫容量 {allocation.capacity}</span>
            </div>
            <div className="chuan-progress"><span style={{ width: `${Math.min(100, Math.max(3, scanCoverage.coveragePercent))}%` }} /></div>
            <small>{scanCoverage.scannedAssets} / {scanCoverage.eligibleAssets} scanned · {scanCoverage.pendingAssets} pending</small>
          </section>

          <section className="chuan-side-card chuan-assistant-card">
            <div className="chuan-mini-assistant__avatar">
              <span>川</span>
              <i />
            </div>
            <div>
              <h2>川川助手 · {rankProfile.tier.label}</h2>
              <p>{selected?.risk === "high" || selected?.risk === "blocked" ? "别急着冲。风控门不是装饰，是刹车。" : rankProfile.petLine}</p>
              <div className="chuan-progress"><span style={{ width: `${rankProfile.progressPercent}%` }} /></div>
              <small>{rankProfile.totalXp} XP · 纪律 {rankProfile.disciplineScore}% · {journalStatusLabel(journalStatus)}</small>
            </div>
          </section>
        </aside>
      </section>

      {activeSection !== "radar" ? (
        <Drawer
          activeSection={activeSection}
          backendContract={liveContract}
          dailyMoverArchive={dailyMoverArchive}
          journalEntries={journalEntries}
          onClose={closeDrawer}
          onOpenDossier={openDossier}
          onSelectSignal={selectSignal}
          rankProfile={rankProfile}
          selected={selected}
          signals={signals}
        />
      ) : null}

      <DossierOverlay
        journalEntries={journalEntries}
        onClose={closeDossier}
        onCreateJournalEntry={createJournalEntry}
        signal={dossierSignal}
      />

      <footer className="chuan-footer">
        <span>CHUANSCAN · 数据仅供研究和复盘，不自动下单，不承诺方向。</span>
        <span>{formatDateTime(metadata.generatedAt)} · {liveContract.schemaVersion}</span>
      </footer>
    </main>
  );
}
