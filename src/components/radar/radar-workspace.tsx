"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertControlPanel } from "./alert-control-panel";
import { ChartPanel } from "./chart-panel";
import { AltcoinOpportunityBoard } from "./altcoin-opportunity-board";
import { DailyMoverPanel } from "./daily-mover-panel";
import { JournalPanel } from "./journal-panel";
import { MacroWeatherPanel } from "./macro-weather-panel";
import { OpsAndFilterPanel } from "./ops-and-filter-panel";
import { PixelCopilot } from "./pixel-copilot";
import { RadarBootBriefing } from "./radar-boot-briefing";
import { RadarCockpitShell } from "./radar-cockpit-shell";
import { RadarTable } from "./radar-table";
import { RankPanel } from "./rank-panel";
import { ReplayPanel } from "./replay-panel";
import { SignalDossier, type SignalDossierDailyMoverMatch } from "./signal-dossier";
import { StrategyCard } from "./strategy-card";
import { SystemHealthPanel } from "./system-health-panel";
import { TopRadarBar, type RadarNavigationSection, type RuntimeStateView } from "./top-radar-bar";
import { signalStateLabels } from "@/lib/analysis/constants";
import {
  buildAlertEvent,
  buildAlertControlReport,
  buildOperationsAlertEvent,
  mergeAlertEventsById,
  notificationCopyForAlert,
  shouldSuppressAlert,
  shouldKeepAlertEventForPreferences,
  soundProfileForSeverity,
  type AlertEvent,
  type AlertPreferences,
  type AlertSignalThreshold,
  type AlertSound,
} from "@/lib/alerts/alert-policy";
import type {
  DailyMoverCalibrationSuggestion,
  DailyMoverReadArchiveResult,
  DailyMoverStrategyDraft,
} from "@/lib/api/daily-mover-readonly";
import {
  buildJournalEntryFromSignal,
  mergeJournalEntry,
} from "@/lib/journal/journal-entry";
import { buildRankProfile } from "@/lib/journal/rank-engine";
import type { JournalEvent, MarketSignal, SignalJournalAction, Timeframe } from "@/lib/analysis/types";
import type { SystemHealthReport } from "@/lib/api/system-health";
import {
  buildRefreshPlan,
  compareSignalSets,
  type SignalSetDelta,
} from "@/lib/market/live-refresh";
import { buildAltcoinOpportunityBoard } from "@/lib/market/altcoin-opportunities";
import { buildMacroWeather } from "@/lib/market/macro-weather";
import type { MarketRadarSnapshot } from "@/lib/market/types";

type RadarWorkspaceProps = {
  dailyMoverArchive: DailyMoverReadArchiveResult["body"];
  health: SystemHealthReport;
  snapshot: MarketRadarSnapshot;
};

type RefreshState = "idle" | "syncing" | "updated" | "quiet" | "error";
type JournalSaveStatus = "idle" | "saving" | "saved" | "error";
type DailyMoverCalibrationReviewStatus = "idle" | "saving" | "saved" | "error";
type DailyMoverStrategyConfirmationStatus = "idle" | "saving" | "saved" | "error";
type AudioContextConstructor = typeof AudioContext;

type WorkspaceDrawerSection = Exclude<RadarNavigationSection, "radar">;

const alertQuietHours = {
  endHour: 8,
  startHour: 23,
  timeZone: "Asia/Shanghai",
};

const defaultAlertPreferences: AlertPreferences = {
  browserNotificationsEnabled: false,
  dedupeWindowMinutes: 8,
  minimumSignalSeverity: "watch",
  quietHours: alertQuietHours,
  quietHoursEnabled: true,
  soundEnabled: false,
};

function formatScanTime(value: string) {
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

function formatChangePercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function formatCompactUsd(value: number) {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }

  return `$${(value / 1_000_000).toFixed(0)}M`;
}

function marketStatusLabel(value: MarketRadarSnapshot["metadata"]["status"]) {
  return {
    failed: "失败",
    partial: "部分",
    ready: "就绪",
    stale: "延迟",
  }[value];
}

function marketSourceLabel(value: MarketRadarSnapshot["metadata"]["source"]) {
  return {
    coingecko: "CoinGecko",
    coinglass: "CoinGlass",
    composite: "聚合源",
    exchange_public: "交易所公开源",
    mock: "演示源",
  }[value];
}

function riskGateLabel(value: MarketRadarSnapshot["metadata"]["riskGate"]) {
  return value === "on" ? "开启" : "关闭";
}

function metadataNote(notes: string[], prefix: string) {
  return notes.find((note) => note.startsWith(prefix));
}

function displayMetadataNote(note: string | undefined) {
  if (!note) {
    return undefined;
  }

  return note
    .replace(/^batch /, "批次 ")
    .replace(/^requests /, "请求 ")
    .replace(/^scan runtime:/, "扫描耗时：");
}

function normalizeDossierSymbol(symbol: string) {
  return symbol
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/(USDT|USDC|USD|PERP)$/u, "");
}

function correlationStatusLabel(value: string) {
  const labels: Record<string, string> = {
    caught_unreviewed: "命中待复盘",
    caught_with_journal: "命中已复盘",
    missed_with_evidence: "漏判有证据",
    not_learnable: "不可学习",
    unlinked: "未关联",
  };

  return labels[value] ?? value.replaceAll("_", " ");
}

function radarStatusLabel(value: string) {
  const labels: Record<string, string> = {
    caught: "抓到",
    missed: "漏判",
    not_learnable: "不可学",
  };

  return labels[value] ?? value.replaceAll("_", " ");
}

function signalPulseTone(signal?: MarketSignal) {
  if (!signal) {
    return "quiet";
  }

  if (signal.risk === "blocked" || signal.risk === "high") {
    return "risk-high";
  }

  if (signal.state === "triggered" || signal.state === "near_trigger") {
    return "alert";
  }

  if (signal.state === "waiting_confirmation" || signal.state === "abnormal_watch") {
    return "watch";
  }

  return "quiet";
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

function formatRefreshInterval(value: number) {
  return value >= 60_000 ? `${Math.round(value / 60_000)}m` : `${Math.round(value / 1000)}s`;
}

function scanFreshnessLabel(health: SystemHealthReport) {
  if (health.scan.ageMinutes === null) {
    return "等待首轮";
  }

  if (health.scan.ageMinutes <= 0) {
    return "刚刚刷新";
  }

  return `${health.scan.ageMinutes}m 前`;
}

function runtimeStateTone(
  status: "blocked" | "ready" | "stale" | "watch",
): RuntimeStateView["tone"] {
  return status;
}

function dataSourceRuntimeTone(health: SystemHealthReport): RuntimeStateView["tone"] {
  if (health.dataSource.status === "missing_key") {
    return runtimeStateTone("blocked");
  }

  if (health.dataSource.status === "fallback") {
    return runtimeStateTone("stale");
  }

  if (health.dataSource.status === "preview" || !health.dataSource.isRealtime) {
    return runtimeStateTone("watch");
  }

  return runtimeStateTone("ready");
}

function persistenceRuntimeTone(health: SystemHealthReport): RuntimeStateView["tone"] {
  if (health.persistence.databaseStatus === "ready" && health.persistence.durable) {
    return runtimeStateTone("ready");
  }

  if (health.persistence.databaseStatus === "fallback") {
    return runtimeStateTone("stale");
  }

  return runtimeStateTone("watch");
}

function scanRuntimeTone(health: SystemHealthReport): RuntimeStateView["tone"] {
  if (health.scan.freshness === "expired" || health.scan.status === "failed") {
    return runtimeStateTone("blocked");
  }

  if (health.scan.freshness === "aging" || health.scan.status === "stale") {
    return runtimeStateTone("stale");
  }

  if (health.scan.freshness === "unknown") {
    return runtimeStateTone("watch");
  }

  return runtimeStateTone("ready");
}

function buildRuntimeStates(liveHealth: SystemHealthReport): RuntimeStateView[] {
  const minutesUntilNextScan = liveHealth.operations.minutesUntilNextScan;
  const minutesUntilStale = liveHealth.operations.minutesUntilStale;
  const cronDetail = minutesUntilStale === null
    ? liveHealth.operations.operatorHint
    : `${minutesUntilStale}m 后进入 stale 护栏`;

  return [
    {
      detail: liveHealth.dataSource.mode === "live" ? liveHealth.dataSource.activeSource : liveHealth.dataSource.detail,
      id: "coinglass",
      label: "CoinGlass",
      tone: dataSourceRuntimeTone(liveHealth),
      value: liveHealth.dataSource.isRealtime ? "实时源" : "预览源",
    },
    {
      detail: liveHealth.persistence.databaseDriver,
      id: "neon",
      label: "Neon",
      tone: persistenceRuntimeTone(liveHealth),
      value: liveHealth.persistence.durable ? "持久化" : "内存",
    },
    {
      detail: liveHealth.archive.retentionMode,
      id: "archive",
      label: "归档",
      tone: liveHealth.archive.entries > 0 ? runtimeStateTone("ready") : runtimeStateTone("watch"),
      value: `${liveHealth.archive.entries} 帧`,
    },
    {
      detail: cronDetail,
      id: "cron",
      label: "Cron",
      tone: scanRuntimeTone(liveHealth),
      value: minutesUntilNextScan === null ? "等待" : `${minutesUntilNextScan}m`,
    },
  ];
}

function formatMarketSessionTime(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(value);
}

function dateFromSnapshot(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return new Date(0);
  }

  return date;
}

function buildMarketSessionClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const minutes = hour * 60 + minute;
  const inAsia = minutes >= 8 * 60 && minutes < 16 * 60;
  const inLondon = minutes >= 15 * 60 && minutes < 23 * 60;
  const inNewYork = minutes >= 21 * 60 + 30 || minutes < 5 * 60;

  if (inLondon && inNewYork) {
    return {
      label: "伦敦 / 纽约重叠",
      localTime: formatMarketSessionTime(now),
      note: "流动性最活跃，谨防假突破和清算针",
      tone: "hot",
    };
  }

  if (inNewYork) {
    return {
      label: "纽约盘",
      localTime: formatMarketSessionTime(now),
      note: "主波动窗口，优先看 BTC/ETH 风险传导",
      tone: "active",
    };
  }

  if (inLondon) {
    return {
      label: "伦敦盘",
      localTime: formatMarketSessionTime(now),
      note: "趋势试探窗口，关注山寨跟随强弱",
      tone: "active",
    };
  }

  if (inAsia) {
    return {
      label: "亚盘",
      localTime: formatMarketSessionTime(now),
      note: "预热和吸筹窗口，避免低流动性追单",
      tone: "watch",
    };
  }

  return {
    label: "低流动窗口",
    localTime: formatMarketSessionTime(now),
    note: "先看证据，不把小波动当启动",
    tone: "quiet",
  };
}

function refreshStatusLabel(state: RefreshState) {
  return {
    error: "重试",
    idle: "自动",
    quiet: "已同步",
    syncing: "同步中",
    updated: "新异动",
  }[state];
}

function journalStatusLabel(state: JournalSaveStatus) {
  return {
    error: "记录失败",
    idle: "日记待命",
    saved: "记录已保存",
    saving: "记录中",
  }[state];
}

const workspaceDrawerCopy: Record<WorkspaceDrawerSection, {
  closeLabel: string;
  kicker: string;
  title: string;
}> = {
  evolution: {
    closeLabel: "关闭进化抽屉",
    kicker: "策略校准 / 段位 / 版本表现",
    title: "Evolution 进化室",
  },
  journal: {
    closeLabel: "关闭日志抽屉",
    kicker: "交易日记 / 行为记录 / 形态复盘统计",
    title: "Journal 日志室",
  },
  review: {
    closeLabel: "关闭复盘抽屉",
    kicker: "扫描回放 / 每日异动 / 漏判归因",
    title: "Review 复盘室",
  },
  settings: {
    closeLabel: "关闭设置抽屉",
    kicker: "系统健康 / 数据源 / 持久化状态",
    title: "Settings 系统设置",
  },
  signals: {
    closeLabel: "关闭信号抽屉",
    kicker: "候选池 / 信号档案 / 当前计划",
    title: "Signals 信号池",
  },
};

function deltaLabel(delta: SignalSetDelta | null) {
  if (!delta) {
    return "观察中";
  }

  if (delta.newSymbols.length > 0) {
    return `新增 ${delta.newSymbols.slice(0, 3).join("/")}`;
  }

  if (delta.changedSymbols.length > 0) {
    return `变化 ${delta.changedSymbols.slice(0, 3).join("/")}`;
  }

  if (delta.removedSymbols.length > 0) {
    return `降温 ${delta.removedSymbols.slice(0, 3).join("/")}`;
  }

  return delta.isNewScan ? "扫描已刷新" : "暂无变化";
}

function audioContextConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext ??
    null;
}

function buildCurrentAlertEvents({
  health,
  now = new Date(),
  preferences,
  previousEvents = [],
  snapshot,
}: {
  health: SystemHealthReport;
  now?: Date;
  preferences: AlertPreferences;
  previousEvents?: AlertEvent[];
  snapshot: MarketRadarSnapshot;
}) {
  const signalEvents = snapshot.signals
    .map((signal) => buildAlertEvent(signal, {
      generatedAt: snapshot.metadata.generatedAt,
      scanId: snapshot.metadata.id,
    }))
    .filter((event): event is AlertEvent => Boolean(event));
  const operationsEvent = buildOperationsAlertEvent(health);
  const events = [
    ...(operationsEvent ? [operationsEvent] : []),
    ...signalEvents,
  ];

  return events
    .filter((event) => shouldKeepAlertEventForPreferences(event, preferences))
    .filter((event) => !shouldSuppressAlert(
      event,
      previousEvents,
      now,
      preferences.dedupeWindowMinutes * 60 * 1000,
    ))
    .slice(0, 5);
}

export function RadarWorkspace({ dailyMoverArchive, health, snapshot }: RadarWorkspaceProps) {
  const [liveSnapshot, setLiveSnapshot] = useState(snapshot);
  const [liveHealth, setLiveHealth] = useState(health);
  const { derivatives, heatmap, instrumentPool, journalEvents, metadata, signals, tickers } = liveSnapshot;
  const [selectedId, setSelectedId] = useState<string | undefined>(signals[0]?.id);
  const [dossierSignalId, setDossierSignalId] = useState<string | undefined>();
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<RadarNavigationSection>("radar");
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>(signals[0]?.timeframe ?? "15m");
  const [journalEntries, setJournalEntries] = useState<JournalEvent[]>(journalEvents);
  const [journalStatus, setJournalStatus] = useState<JournalSaveStatus>("idle");
  const [dailyMoverCalibrationStatus, setDailyMoverCalibrationStatus] =
    useState<DailyMoverCalibrationReviewStatus>("idle");
  const [dailyMoverStrategyStatus, setDailyMoverStrategyStatus] =
    useState<DailyMoverStrategyConfirmationStatus>("idle");
  const [dailyMoverState] = useState(dailyMoverArchive);
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");
  const [alertPreferences, setAlertPreferences] = useState<AlertPreferences>(defaultAlertPreferences);
  const [alertEvents, setAlertEvents] = useState<AlertEvent[]>(() =>
    buildCurrentAlertEvents({
      health,
      now: dateFromSnapshot(snapshot.metadata.generatedAt),
      preferences: defaultAlertPreferences,
      snapshot,
    })
  );
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(() =>
    buildRefreshPlan({
      nextScanAt: snapshot.metadata.nextScanAt,
      now: dateFromSnapshot(snapshot.metadata.generatedAt),
    }).intervalMs
  );
  const [clockNow, setClockNow] = useState(() => dateFromSnapshot(snapshot.metadata.generatedAt));
  const [lastDelta, setLastDelta] = useState<SignalSetDelta | null>(null);
  const soundEnabled = alertPreferences.soundEnabled;
  const snapshotRef = useRef(snapshot);
  const alertEventsRef = useRef(alertEvents);
  const firstRefreshRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const batchNote = displayMetadataNote(metadataNote(metadata.notes, "batch "));
  const requestsNote = displayMetadataNote(metadataNote(metadata.notes, "requests "));
  const coveragePercent = metadata.coverage?.coveragePercent ?? (metadata.scannedCount > 0 ? 100 : 0);
  const marketSession = useMemo(() => buildMarketSessionClock(clockNow), [clockNow]);
  const runtimeStates = useMemo(() => buildRuntimeStates(liveHealth), [liveHealth]);
  const longBiasCount = signals.filter((signal) => signal.direction === "long").length;
  const shortBiasCount = signals.filter((signal) => signal.direction === "short").length;
  const activeSignalCount = signals.filter((signal) =>
    signal.state === "near_trigger" || signal.state === "triggered" || signal.state === "waiting_confirmation"
  ).length;
  const blockedSignalCount = signals.filter((signal) =>
    signal.risk === "blocked" || signal.risk === "high"
  ).length;

  const selected = useMemo(
    () => signals.find((signal) => signal.id === selectedId) ?? signals[0],
    [selectedId, signals],
  );
  const selectedDossierSignal = useMemo(
    () => signals.find((signal) => signal.id === dossierSignalId) ?? (isDossierOpen ? selected : undefined),
    [dossierSignalId, isDossierOpen, selected, signals],
  );
  const rankProfile = useMemo(() => buildRankProfile(journalEntries), [journalEntries]);
  const journalMatches = useMemo(() => {
    if (!selectedDossierSignal) {
      return [];
    }

    const target = normalizeDossierSymbol(selectedDossierSignal.symbol);

    return journalEntries
      .filter((entry) => normalizeDossierSymbol(entry.symbol) === target)
      .slice(0, 8);
  }, [journalEntries, selectedDossierSignal]);
  const chartJournalMatches = useMemo(() => {
    if (!selected) {
      return [];
    }

    const target = normalizeDossierSymbol(selected.symbol);

    return journalEntries
      .filter((entry) => normalizeDossierSymbol(entry.symbol) === target)
      .slice(0, 3);
  }, [journalEntries, selected]);
  const dailyMoverMatches = useMemo<SignalDossierDailyMoverMatch[]>(() => {
    if (!selectedDossierSignal) {
      return [];
    }

    const target = normalizeDossierSymbol(selectedDossierSignal.symbol);
    const matchesById = new Map<string, SignalDossierDailyMoverMatch>();

    for (const link of dailyMoverState.selectedCorrelation?.links ?? []) {
      if (normalizeDossierSymbol(link.symbol) !== target) {
        continue;
      }

      matchesById.set(`correlation-${link.moverId}`, {
        detail: link.suggestedNextStep,
        direction: link.direction,
        id: `correlation-${link.moverId}`,
        journalCount: link.journalEventIds.length,
        nextStep: link.calibrationCandidate ? "保留为规则校准候选" : "继续观察后续复盘结果",
        observedAt: dailyMoverState.selectedCorrelation?.observedAt,
        scanCount: link.matchedScanIds.length,
        status: correlationStatusLabel(link.status),
        symbol: link.symbol,
      });
    }

    for (const detail of dailyMoverState.selectedDetails) {
      if (normalizeDossierSymbol(detail.symbol) !== target) {
        continue;
      }

      matchesById.set(`detail-${detail.id}`, {
        detail: detail.whyMissed,
        direction: detail.direction,
        evidence: detail.primaryDrivers.slice(0, 2).join(" / "),
        id: `detail-${detail.id}`,
        journalCount: detail.journalEventIds.length,
        nextStep: detail.nextReviewAction,
        observedAt: detail.observedAt,
        scanCount: detail.matchedScanIds.length,
        status: radarStatusLabel(detail.radarStatus),
        symbol: detail.symbol,
      });
    }

    return Array.from(matchesById.values()).slice(0, 6);
  }, [dailyMoverState, selectedDossierSignal]);
  const alertMatches = useMemo(() => {
    if (!selectedDossierSignal) {
      return [];
    }

    const target = normalizeDossierSymbol(selectedDossierSignal.symbol);

    return alertEvents
      .filter((event) => shouldKeepAlertEventForPreferences(event, alertPreferences))
      .filter((event) => event.symbol && normalizeDossierSymbol(event.symbol) === target)
      .slice(0, 5);
  }, [alertEvents, alertPreferences, selectedDossierSignal]);
  const visibleAlertEvents = useMemo(
    () => alertEvents.filter((event) => shouldKeepAlertEventForPreferences(event, alertPreferences)),
    [alertEvents, alertPreferences],
  );
  const altcoinOpportunityBoard = useMemo(
    () => buildAltcoinOpportunityBoard({
      dailyMoverDetails: dailyMoverState.selectedDetails,
      journalEvents: journalEntries,
      scanStatus: metadata.status,
      signals,
    }),
    [dailyMoverState.selectedDetails, journalEntries, metadata.status, signals],
  );
  const macroWeather = useMemo(
    () => buildMacroWeather({
      derivatives,
      metadataStatus: metadata.status,
      signals,
      tickers,
    }),
    [derivatives, metadata.status, signals, tickers],
  );
  const alertControlReport = useMemo(
    () => buildAlertControlReport(alertPreferences, clockNow),
    [alertPreferences, clockNow],
  );

  const mood = selected?.risk === "high" || selected?.risk === "blocked"
    ? "serious"
    : selected?.state === "near_trigger" || selected?.state === "triggered"
      ? "alert"
      : rankProfile.petMood;
  const selectedPulseTone = signalPulseTone(selected);
  const opsSummaryItems = [
    { label: "数据状态", value: marketStatusLabel(metadata.status) },
    { label: "自动刷新", value: refreshStatusLabel(refreshState) },
    { label: "当前覆盖", value: `${coveragePercent}%` },
    { label: "待确认", value: activeSignalCount.toString() },
  ];
  const opsFilterItems = [
    { label: "多头", value: longBiasCount.toString() },
    { label: "空头", value: shortBiasCount.toString() },
    { label: "高风险", value: blockedSignalCount.toString() },
    { label: "候选", value: signals.length.toString() },
  ];
  const opsHealthItems = [
    { label: "数据源", value: runtimeStates[0]?.value ?? marketSourceLabel(metadata.source) },
    { label: "数据库", value: runtimeStates[1]?.value ?? "待检" },
    { label: "归档", value: `${liveSnapshot.archive?.entries.length ?? 0} 帧` },
    { label: "Cron", value: runtimeStates.find((state) => state.id === "cron")?.value ?? "等待" },
  ];
  const opsEventItems = visibleAlertEvents.slice(0, 3).map((event) => ({
    label: event.symbol ?? event.type,
    value: notificationCopyForAlert(event).title,
  }));

  if (opsEventItems.length === 0) {
    opsEventItems.push({
      label: "扫描",
      value: "暂无高优先级告警",
    });
  }

  const playSignalTone = useCallback((sound: AlertSound = "pulse", volume = 0.08) => {
    const AudioCtor = audioContextConstructor();

    if (!AudioCtor || sound === "none") {
      return;
    }

    const context = audioContextRef.current ?? new AudioCtor();
    audioContextRef.current = context;

    if (context.state === "suspended") {
      void context.resume();
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    const startFrequency = sound === "alarm" ? 520 : sound === "tick" ? 660 : 740;
    const endFrequency = sound === "alarm" ? 1260 : sound === "tick" ? 760 : 1040;
    const duration = sound === "alarm" ? 0.34 : sound === "tick" ? 0.12 : 0.2;

    oscillator.type = sound === "tick" ? "triangle" : "square";
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration * 0.55);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }, []);

  const maybeShowNotification = useCallback((event: AlertEvent) => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    if (Notification.permission !== "granted") {
      return;
    }

    const copy = notificationCopyForAlert(event);

    new Notification(copy.title, {
      body: copy.body,
      tag: event.id,
    });
  }, []);

  const closeSignalDossier = useCallback(() => {
    setIsDossierOpen(false);
  }, []);

  const closeWorkspaceDrawer = useCallback(() => {
    setActiveSection("radar");
  }, []);

  const navigateWorkspace = useCallback((section: RadarNavigationSection) => {
    setActiveSection(section);
  }, []);

  const openSignalDossier = useCallback((id?: string) => {
    const signal = id ? signals.find((item) => item.id === id) : selected;

    if (!signal) {
      return;
    }

    setSelectedId(signal.id);
    setActiveTimeframe(signal.timeframe);
    setDossierSignalId(signal.id);
    setIsDossierOpen(true);
  }, [selected, signals]);

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

  function toggleSound() {
    if (soundEnabled) {
      setAlertPreferences((current) => ({
        ...current,
        soundEnabled: false,
      }));
      return;
    }

    const AudioCtor = audioContextConstructor();

    if (AudioCtor) {
      const context = audioContextRef.current ?? new AudioCtor();
      audioContextRef.current = context;

      if (context.state === "suspended") {
        void context.resume();
      }
    }

    setAlertPreferences((current) => ({
      ...current,
      soundEnabled: true,
    }));
  }

  function setMinimumAlertSeverity(severity: AlertSignalThreshold) {
    setAlertPreferences((current) => ({
      ...current,
      minimumSignalSeverity: severity,
    }));
  }

  function setAlertDedupeWindow(minutes: number) {
    setAlertPreferences((current) => ({
      ...current,
      dedupeWindowMinutes: minutes,
    }));
  }

  function setAlertQuietHours(enabled: boolean) {
    setAlertPreferences((current) => ({
      ...current,
      quietHoursEnabled: enabled,
    }));
  }

  function setBrowserNotifications(enabled: boolean) {
    if (enabled && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }

    setAlertPreferences((current) => ({
      ...current,
      browserNotificationsEnabled: enabled,
    }));
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function syncRadar() {
      setRefreshState("syncing");

      try {
        const response = await fetch("/api/radar", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("radar_sync_failed");
        }

        const payload = await response.json() as {
          health?: SystemHealthReport;
          ok?: boolean;
          snapshot?: MarketRadarSnapshot;
        };

        if (!payload.ok || !payload.health || !payload.snapshot) {
          throw new Error("radar_payload_invalid");
        }

        const previousSnapshot = snapshotRef.current;
        const nextSnapshot = payload.snapshot;
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
        setLiveHealth(payload.health);
        setJournalEntries((current) => mergeJournalEvents(current, nextSnapshot.journalEvents));
        setLastDelta(delta);
        setRefreshState(delta.hasActionableChange ? "updated" : delta.isNewScan ? "quiet" : "idle");

        const nextAlertEvents = buildCurrentAlertEvents({
          health: payload.health,
          now: new Date(),
          preferences: alertPreferences,
          previousEvents: alertEventsRef.current,
          snapshot: nextSnapshot,
        });

        if (nextAlertEvents.length > 0) {
          setAlertEvents((current) => mergeAlertEventsById([...nextAlertEvents, ...current], 12));
          alertEventsRef.current = mergeAlertEventsById([...nextAlertEvents, ...alertEventsRef.current], 24);
        }

        const soundAlert = nextAlertEvents[0];

        if (soundAlert) {
          const soundProfile = soundProfileForSeverity(soundAlert.severity, {
            now: new Date(),
            quietHours: alertPreferences.quietHoursEnabled ? alertPreferences.quietHours : undefined,
          });

          if (
            alertPreferences.soundEnabled &&
            soundProfile.shouldPlay &&
            !firstRefreshRef.current &&
            document.visibilityState === "visible"
          ) {
            playSignalTone(soundProfile.name, soundProfile.volume);
          }

          if (alertPreferences.browserNotificationsEnabled) {
            maybeShowNotification(soundAlert);
          }
        }

        snapshotRef.current = nextSnapshot;
        firstRefreshRef.current = false;
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

          setRefreshIntervalMs(plan.intervalMs);
          timer = setTimeout(syncRadar, plan.intervalMs);
        }
      }
    }

    const initialPlan = buildRefreshPlan({
      nextScanAt: snapshotRef.current.metadata.nextScanAt,
      now: new Date(),
    });

    setRefreshIntervalMs(initialPlan.intervalMs);
    timer = setTimeout(syncRadar, initialPlan.intervalMs);

    return () => {
      cancelled = true;

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [alertPreferences, maybeShowNotification, playSignalTone]);

  useEffect(() => {
    const updateClock = () => {
      setClockNow(new Date());
    };

    const initialTimer = window.setTimeout(updateClock, 0);
    const timer = window.setInterval(updateClock, 30_000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!isDossierOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeSignalDossier();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeSignalDossier, isDossierOpen]);

  useEffect(() => {
    if (activeSection === "radar" || isDossierOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeWorkspaceDrawer();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeSection, closeWorkspaceDrawer, isDossierOpen]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    };
  }, []);

  function selectSignal(id: string) {
    const signal = signals.find((item) => item.id === id);

    setSelectedId(id);

    if (signal) {
      setActiveTimeframe(signal.timeframe);
    }
  }

  async function createJournalEntry(action: SignalJournalAction) {
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
          signalId: selected.id,
          action,
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
  }

  async function createDailyMoverCalibrationReview(
    suggestion: DailyMoverCalibrationSuggestion,
    context: { observedAt: string; snapshotId: string },
  ) {
    setDailyMoverCalibrationStatus("saving");

    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "calibration_review",
          calibration: {
            guardrail: suggestion.guardrail,
            label: suggestion.label,
            observedAt: context.observedAt,
            recommendation: suggestion.recommendation,
            sampleCount: suggestion.sampleCount,
            snapshotId: context.snapshotId,
            symbols: suggestion.symbols,
            tag: suggestion.tag,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("daily_mover_calibration_request_failed");
      }

      const payload = await response.json() as {
        entry?: JournalEvent;
        entries?: JournalEvent[];
      };

      applyJournalResponse(payload);
      setDailyMoverCalibrationStatus("saved");
      setActiveSection("journal");
    } catch {
      setDailyMoverCalibrationStatus("error");
    }
  }

  async function confirmDailyMoverStrategyDraft(draft: DailyMoverStrategyDraft) {
    setDailyMoverStrategyStatus("saving");

    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "strategy_confirmation",
          strategyDraft: {
            allowedUse: draft.allowedUse,
            canAutoAdjustWeights: draft.canAutoAdjustWeights,
            draftId: draft.id,
            evidenceSummary: draft.evidenceSummary,
            label: draft.label,
            limitation: draft.limitation,
            manualConfirmation: draft.manualConfirmation,
            nextStep: draft.nextStep,
            sourceMode: draft.sourceMode,
            tag: draft.tag,
            validationVerdict: draft.validationVerdict,
            versionLabel: draft.versionLabel,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("daily_mover_strategy_confirmation_failed");
      }

      const payload = await response.json() as {
        entry?: JournalEvent;
        entries?: JournalEvent[];
      };

      applyJournalResponse(payload);
      setDailyMoverStrategyStatus("saved");
      setActiveSection("evolution");
    } catch {
      setDailyMoverStrategyStatus("error");
    }
  }

  const featureDrawerItems = [
    { description: "候选池与信号档案", label: "Signals", section: "signals" as const, value: `${signals.length} 候选` },
    { description: "扫描回放与复盘样本", label: "Review", section: "review" as const, value: `${liveSnapshot.archive?.entries.length ?? 0} 帧` },
    { description: "交易日记和行为记录", label: "Journal", section: "journal" as const, value: `${journalEntries.length} 条` },
    { description: "策略校准与权重学习", label: "Evolution", section: "evolution" as const, value: `${dailyMoverState.strategyConfirmations.length} 版` },
  ];
  const candidateStripSignals = signals.slice(0, 5);
  const selectedSymbol = selected?.symbol.replace("USDT", "") ?? "等待候选";
  const selectedStateLabel = selected ? signalStateLabels[selected.state] : "暂无选中信号";
  const nextActionCopy = selected
    ? selected.risk === "blocked" || selected.risk === "high"
      ? "风险偏高，等待回踩或证据修复。"
      : selected.state === "near_trigger" || selected.state === "triggered"
        ? "检查关键位，满足条件再执行。"
        : "继续观察，不提前抢跑。"
    : "等待下一轮扫描。";
  const isWorkspaceDrawerOpen = activeSection !== "radar";
  const activeDrawerCopy = isWorkspaceDrawerOpen ? workspaceDrawerCopy[activeSection] : undefined;
  let workspaceDrawerContent: ReactNode = null;

  if (activeSection === "signals") {
    workspaceDrawerContent = (
      <div className="workspace-drawer__stack">
        <section className="module workspace-drawer__brief">
          <div className="module-head">
            <h2>候选池操作</h2>
            <span className="tag">{signals.length} 信号</span>
          </div>
          <p>这里只承接信号池、候选切换和档案入口；真正交易判断仍以证据链、关键位、RR 和风控门为准。</p>
          <div className="workspace-drawer__actions">
            <button className="action-button" onClick={() => openSignalDossier()} type="button">
              打开当前信号档案
            </button>
            <button className="action-button action-button--ghost" onClick={() => setActiveSection("review")} type="button">
              去复盘链路
            </button>
          </div>
        </section>
        <RadarTable
          signals={signals}
          selectedId={selected?.id}
          onOpenDossier={openSignalDossier}
          onSelect={selectSignal}
        />
        <StrategyCard selected={selected} />
      </div>
    );
  } else if (activeSection === "review") {
    workspaceDrawerContent = (
      <div className="workspace-drawer__stack">
        <ReplayPanel archive={liveSnapshot.archive} />
        <DailyMoverPanel
          archive={dailyMoverState}
          calibrationReviewStatus={dailyMoverCalibrationStatus}
          onCreateCalibrationReview={createDailyMoverCalibrationReview}
          onConfirmStrategyDraft={confirmDailyMoverStrategyDraft}
          strategyConfirmationStatus={dailyMoverStrategyStatus}
        />
      </div>
    );
  } else if (activeSection === "journal") {
    workspaceDrawerContent = (
      <JournalPanel
        events={journalEntries}
        onCreate={createJournalEntry}
        selected={selected}
        status={journalStatus}
      />
    );
  } else if (activeSection === "evolution") {
    workspaceDrawerContent = (
      <div className="workspace-drawer__stack">
        <RankPanel profile={rankProfile} />
        <DailyMoverPanel
          archive={dailyMoverState}
          calibrationReviewStatus={dailyMoverCalibrationStatus}
          onCreateCalibrationReview={createDailyMoverCalibrationReview}
          onConfirmStrategyDraft={confirmDailyMoverStrategyDraft}
          strategyConfirmationStatus={dailyMoverStrategyStatus}
        />
      </div>
    );
  } else if (activeSection === "settings") {
    workspaceDrawerContent = (
      <div className="workspace-drawer__stack">
        <AlertControlPanel
          alertEvents={visibleAlertEvents}
          preferences={alertPreferences}
          report={alertControlReport}
          onBrowserNotificationsChange={setBrowserNotifications}
          onDedupeWindowChange={setAlertDedupeWindow}
          onMinimumSeverityChange={setMinimumAlertSeverity}
          onQuietHoursChange={setAlertQuietHours}
          onSoundToggle={toggleSound}
        />
        <SystemHealthPanel health={liveHealth} />
      </div>
    );
  }

  return (
    <main className={`studio-shell radar-app-shell studio-shell--${metadata.status} studio-shell--refresh-${refreshState} studio-shell--risk-${metadata.riskGate}`}>
      <div className="studio-scan-grid" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <TopRadarBar
        activeSection={activeSection}
        batchNote={batchNote}
        cadenceMinutes={metadata.cadenceMinutes}
        candidateCount={instrumentPool.summary.accepted}
        dataFreshnessLabel={scanFreshnessLabel(liveHealth)}
        deltaLabel={deltaLabel(lastDelta)}
        freshnessTone={liveHealth.scan.freshness}
        isRealtime={metadata.isRealtime}
        lastScanTime={formatScanTime(liveHealth.scan.generatedAt)}
        marketSession={marketSession}
        marketStatus={marketStatusLabel(metadata.status)}
        nextScanAt={metadata.nextScanAt}
        nextScanTime={formatScanTime(metadata.nextScanAt)}
        onNavigate={navigateWorkspace}
        onToggleSound={toggleSound}
        providerLabel={marketSourceLabel(metadata.source)}
        refreshInterval={formatRefreshInterval(refreshIntervalMs)}
        refreshStateLabel={refreshStatusLabel(refreshState)}
        refreshTone={refreshState}
        requestsNote={requestsNote}
        riskGate={riskGateLabel(metadata.riskGate)}
        runtimeStates={runtimeStates}
        soundEnabled={soundEnabled}
        staleAfterMinutes={metadata.staleAfterMinutes}
      />

      <RadarBootBriefing
        cadenceLabel={`${metadata.cadenceMinutes}m`}
        coverageLabel={`${coveragePercent}%`}
        healthLabel={runtimeStates.every((state) => state.tone === "ready") ? "全绿" : "有观察项"}
        marketSessionLabel={`${marketSession.label} ${marketSession.localTime}`}
        nextScanLabel={formatScanTime(metadata.nextScanAt)}
        onOpenReview={() => navigateWorkspace("review")}
        onOpenSignals={() => navigateWorkspace("signals")}
        providerLabel={marketSourceLabel(metadata.source)}
        requestBudgetLabel={requestsNote}
        signalCount={signals.length}
        statusLabel={marketStatusLabel(metadata.status)}
      />

      <section className={`radar-command-strip radar-command-strip--${metadata.status}`} aria-label="雷达节拍状态">
        <div className="radar-command-strip__beam" aria-hidden="true" />
        <div className="radar-command-strip__cell">
          <span className="mono">扫描节拍</span>
          <strong>{metadata.cadenceMinutes}m / {refreshStatusLabel(refreshState)}</strong>
          <small>{deltaLabel(lastDelta)}</small>
        </div>
        <div className={`radar-command-strip__cell radar-command-strip__cell--${selectedPulseTone}`}>
          <span className="mono">信号脉冲</span>
          <strong>{selected ? `${selected.symbol.replace("USDT", "")} · ${selected.confidence}` : "等待候选"}</strong>
          <small>{selected ? signalStateLabels[selected.state] : "暂无选中信号"}</small>
        </div>
        <div className={`radar-command-strip__cell ${metadata.status === "stale" || metadata.status === "failed" ? "radar-command-strip__cell--alert" : ""}`}>
          <span className="mono">风险/延迟</span>
          <strong>{marketStatusLabel(metadata.status)} / 风控门 {riskGateLabel(metadata.riskGate)}</strong>
          <small>护栏 {metadata.staleAfterMinutes}m · {metadata.isRealtime ? "实时源" : "预览源"}</small>
        </div>
        <div className="radar-command-strip__cell">
          <span className="mono">覆盖密度</span>
          <strong>{coveragePercent}% / {metadata.coverage?.scanned ?? metadata.scannedCount} 已扫</strong>
          <small>{metadata.coverage ? `${metadata.coverage.pending} 待轮转 · 批次 ${metadata.coverage.batchIndex + 1}/${metadata.coverage.totalBatches}` : `${instrumentPool.summary.accepted} 活跃候选`}</small>
        </div>
      </section>

      <RadarCockpitShell
        left={(
          <section aria-label="雷达控制台">
          <OpsAndFilterPanel
            eventItems={opsEventItems}
            filterItems={opsFilterItems}
            healthItems={opsHealthItems}
            marketNote={marketSession.note}
            summaryItems={opsSummaryItems}
          />
          </section>
        )}
        center={(
          <>
            <section className="module signal-arena-command" aria-label="Signal Arena 决策主舞台">
              <div className="module-head module-head--flush">
                <div>
                  <h2>Signal Arena</h2>
                  <span className="signal-arena-command__subtitle">当前主候选 · 证据链 · 执行边界</span>
                </div>
                <button className="action-button action-button--ghost" onClick={() => openSignalDossier()} type="button">
                  打开信号档案
                </button>
              </div>

              <div className="signal-arena-command__focus">
                <div>
                  <span className={`signal-arena-command__pulse signal-arena-command__pulse--${selectedPulseTone}`} />
                  <strong>{selectedSymbol}</strong>
                  <small>{selectedStateLabel}</small>
                </div>
                <p>{selected ? `${selected.strategy.entry} · 失效 ${selected.strategy.invalidation}` : "等待全市场扫描产出候选。"}</p>
                <span className="tag">{nextActionCopy}</span>
              </div>

            </section>

            <section className="signal-candidate-strip" aria-label="信号竞技场候选横条">
              {candidateStripSignals.map((signal, index) => (
                <button
                  className={[
                    "signal-candidate-tile",
                    `signal-candidate-tile--${signal.direction}`,
                    selected?.id === signal.id ? "is-selected" : "",
                  ].filter(Boolean).join(" ")}
                  key={`candidate-${signal.id}`}
                  onClick={() => selectSignal(signal.id)}
                  type="button"
                >
                  <span className="signal-candidate-tile__rank">{index + 1}</span>
                  <span className={`signal-candidate-tile__pulse signal-candidate-tile__pulse--${signalPulseTone(signal)}`} />
                  <strong>{signal.symbol.replace("USDT", "")}</strong>
                  <small>{signalStateLabels[signal.state]}</small>
                  <b>{signal.confidence}</b>
                  <em>RR {signal.strategy.riskReward.toFixed(1)}:1</em>
                </button>
              ))}
            </section>

            <ChartPanel
              activeTimeframe={activeTimeframe}
              journalMatches={chartJournalMatches}
              onTimeframeChange={setActiveTimeframe}
              selected={selected}
            />

            <div className="signal-arena-split">
              <AltcoinOpportunityBoard
                ariaLabel="Altcoin Opportunity Board 山寨机会板"
                board={altcoinOpportunityBoard}
                selectedId={selected?.id}
                onOpenDossier={openSignalDossier}
                onSelectSignal={selectSignal}
              />

              <section className="module altcoin-heat-module">
                <div className="module-head">
                  <h2>山寨热区</h2>
                  <span className="tag">{instrumentPool.summary.accepted} 活跃</span>
                </div>
                <div className="pool-audit" aria-label="扫描池健康度">
                  <span><b>{instrumentPool.summary.total}</b> 原始</span>
                  <span><b>{instrumentPool.summary.rejected}</b> 过滤</span>
                  <span><b>{instrumentPool.summary.duplicatesRemoved}</b> 去重</span>
                  <span><b>{formatCompactUsd(instrumentPool.summary.minVolume24hUsd)}</b> 门槛</span>
                </div>
                <div className="heat-grid">
                  {heatmap.map((item) => {
                    const heatSignal = signals.find((signal) =>
                      normalizeDossierSymbol(signal.symbol) === normalizeDossierSymbol(item.symbol)
                    );

                    return (
                      <button
                        className={`heat-cell heat-cell--${item.tone}`}
                        key={item.symbol}
                        onClick={() => heatSignal && openSignalDossier(heatSignal.id)}
                        type="button"
                      >
                        <b>{item.symbol}</b>
                        <span>{formatChangePercent(item.changePercent)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            <RadarTable
              signals={signals}
              selectedId={selected?.id}
              onOpenDossier={openSignalDossier}
              onSelect={selectSignal}
            />
            <StrategyCard selected={selected} />
          </>
        )}
        right={(
          <>
          <section className="module radar-action-rail" aria-label="Action Rail 下一步行动">
            <div className="module-head module-head--flush">
              <div>
                <h2>下一步行动</h2>
                <span>Action Rail · 只放当前决策相关内容 · {journalStatusLabel(journalStatus)}</span>
              </div>
              <span className="tag">{selectedStateLabel}</span>
            </div>
            <div className="radar-action-rail__primary">
              <span className={`radar-action-rail__dot radar-action-rail__dot--${selectedPulseTone}`} />
              <strong>{nextActionCopy}</strong>
              <small>{selected ? `${selectedSymbol} · RR ${selected.strategy.riskReward.toFixed(1)} : 1` : "等待候选"}</small>
            </div>
            <div className="radar-action-rail__buttons">
              <button className="action-button" onClick={() => openSignalDossier()} type="button">
                查看档案
              </button>
              <button className="action-button action-button--ghost" onClick={() => selected && createJournalEntry("track")} type="button">
                记录观察
              </button>
            </div>
            <div className="feature-drawer-grid" aria-label="功能抽屉">
              {featureDrawerItems.map((item) => (
                <button
                  aria-current={activeSection === item.section ? "page" : undefined}
                  className={`feature-drawer-grid__item ${activeSection === item.section ? "is-active" : ""}`}
                  key={item.label}
                  onClick={() => setActiveSection(item.section)}
                  type="button"
                >
                  <span>{item.label}</span>
                  <b>{item.value}</b>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="module signal-lifecycle-preview" aria-label="Signal Lifecycle Tracker">
            <div className="module-head">
              <h2>信号生命周期</h2>
              <span className="tag">Review cue</span>
            </div>
            <div className="signal-lifecycle-preview__steps">
              <span className={selected ? "is-done" : ""}>扫描</span>
              <span className={selected && selected.state !== "no_trade" ? "is-done" : ""}>证据</span>
              <span className={selected?.state === "near_trigger" || selected?.state === "triggered" ? "is-hot" : ""}>触发</span>
              <span>复盘</span>
            </div>
            <p>{selected ? `${signalStateLabels[selected.state]} · 入场 ${selected.strategy.entry} · 失效 ${selected.strategy.invalidation}` : "暂无选中信号。"}</p>
          </section>

          <MacroWeatherPanel
            ariaLabel="Macro Radar 大盘天气"
            report={macroWeather}
            selectedSymbol={selected?.symbol}
          />

          <PixelCopilot
            mood={mood}
            onOpenDossier={() => openSignalDossier()}
            rankProfile={rankProfile}
            selectedSymbol={selected?.symbol}
          />
          </>
        )}
      />

      <section
        aria-label={activeDrawerCopy?.title ?? "Workspace Drawer"}
        aria-modal={isWorkspaceDrawerOpen}
        className={`workspace-drawer workspace-drawer--${activeSection} ${isWorkspaceDrawerOpen ? "workspace-drawer--open" : ""}`}
        role="dialog"
      >
        <button
          aria-label={activeDrawerCopy?.closeLabel ?? "关闭功能抽屉"}
          className="workspace-drawer__backdrop"
          onClick={closeWorkspaceDrawer}
          tabIndex={isWorkspaceDrawerOpen ? 0 : -1}
          type="button"
        />
        <div className="workspace-drawer__panel">
          <div className="workspace-drawer__head">
            <div>
              <span className="mono">Functional Drawer</span>
              <h2>{activeDrawerCopy?.title ?? "Radar 主控台"}</h2>
              <small>{activeDrawerCopy?.kicker ?? "主雷达工作台"}</small>
            </div>
            <button className="workspace-drawer__close" onClick={closeWorkspaceDrawer} type="button">
              关闭
            </button>
          </div>
          <div className="workspace-drawer__body">
            {workspaceDrawerContent}
          </div>
        </div>
      </section>

      <SignalDossier
        activeTimeframe={activeTimeframe}
        alertMatches={alertMatches}
        dailyMoverMatches={dailyMoverMatches}
        isOpen={isDossierOpen}
        journalMatches={journalMatches}
        onClose={closeSignalDossier}
        onCreateJournalEntry={createJournalEntry}
        signal={selectedDossierSignal}
      />
    </main>
  );
}
