"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartPanel } from "./chart-panel";
import { DailyMoverPanel } from "./daily-mover-panel";
import { EventCenterPanel } from "./event-center-panel";
import { JournalPanel } from "./journal-panel";
import { PixelS680 } from "./pixel-s680";
import { RadarTable } from "./radar-table";
import { RankPanel } from "./rank-panel";
import { ReplayPanel } from "./replay-panel";
import { SignalDossier, type SignalDossierDailyMoverMatch } from "./signal-dossier";
import { StrategyCard } from "./strategy-card";
import { SystemHealthPanel } from "./system-health-panel";
import { signalStateLabels } from "@/lib/analysis/constants";
import {
  buildAlertEvent,
  buildOperationsAlertEvent,
  mergeAlertEventsById,
  notificationCopyForAlert,
  shouldSuppressAlert,
  soundProfileForSeverity,
  type AlertEvent,
  type AlertSound,
} from "@/lib/alerts/alert-policy";
import type {
  DailyMoverCalibrationSuggestion,
  DailyMoverReadArchiveResult,
  DailyMoverStrategyDraft,
} from "@/lib/api/daily-mover-readonly";
import { siteConfig } from "@/lib/config/site";
import {
  buildJournalEntryFromDailyMoverCalibration,
  buildJournalEntryFromDailyMoverStrategyConfirmation,
  buildJournalEntryFromSignal,
  mergeJournalEntry,
  type StrategyWeightChangeExecutionJournalInput,
} from "@/lib/journal/journal-entry";
import { buildRankProfile } from "@/lib/journal/rank-engine";
import type { JournalEvent, MarketSignal, SignalJournalAction, Timeframe } from "@/lib/analysis/types";
import type { SystemHealthReport } from "@/lib/api/system-health";
import {
  buildRefreshPlan,
  compareSignalSets,
  type SignalSetDelta,
} from "@/lib/market/live-refresh";
import type { MarketRadarSnapshot } from "@/lib/market/types";

type RadarWorkspaceProps = {
  dailyMoverArchive: DailyMoverReadArchiveResult["body"];
  health: SystemHealthReport;
  snapshot: MarketRadarSnapshot;
};

type RefreshState = "idle" | "syncing" | "updated" | "quiet" | "error";
type JournalSaveStatus = "idle" | "saving" | "saved" | "error";
type AudioContextConstructor = typeof AudioContext;

const alertQuietHours = {
  endHour: 8,
  startHour: 23,
  timeZone: "Asia/Shanghai",
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

function refreshStatusLabel(state: RefreshState) {
  return {
    error: "重试",
    idle: "自动",
    quiet: "已同步",
    syncing: "同步中",
    updated: "新异动",
  }[state];
}

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
  previousEvents = [],
  snapshot,
}: {
  health: SystemHealthReport;
  now?: Date;
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

  return events.filter((event) => !shouldSuppressAlert(event, previousEvents, now)).slice(0, 5);
}

export function RadarWorkspace({ dailyMoverArchive, health, snapshot }: RadarWorkspaceProps) {
  const [liveSnapshot, setLiveSnapshot] = useState(snapshot);
  const [liveHealth, setLiveHealth] = useState(health);
  const { heatmap, instrumentPool, journalEvents, metadata, signals } = liveSnapshot;
  const [selectedId, setSelectedId] = useState<string | undefined>(signals[0]?.id);
  const [dossierSignalId, setDossierSignalId] = useState<string | undefined>();
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>(signals[0]?.timeframe ?? "15m");
  const [journalEntries, setJournalEntries] = useState<JournalEvent[]>(journalEvents);
  const [journalStatus, setJournalStatus] = useState<JournalSaveStatus>("idle");
  const [calibrationReviewStatus, setCalibrationReviewStatus] = useState<JournalSaveStatus>("idle");
  const [strategyConfirmationStatus, setStrategyConfirmationStatus] = useState<JournalSaveStatus>("idle");
  const [dailyMoverState, setDailyMoverState] = useState(dailyMoverArchive);
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");
  const [alertEvents, setAlertEvents] = useState<AlertEvent[]>(() =>
    buildCurrentAlertEvents({ health, snapshot })
  );
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(() =>
    buildRefreshPlan({
      nextScanAt: snapshot.metadata.nextScanAt,
      now: new Date(),
    }).intervalMs
  );
  const [lastDelta, setLastDelta] = useState<SignalSetDelta | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const snapshotRef = useRef(snapshot);
  const alertEventsRef = useRef(alertEvents);
  const firstRefreshRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const batchNote = displayMetadataNote(metadataNote(metadata.notes, "batch "));
  const requestsNote = displayMetadataNote(metadataNote(metadata.notes, "requests "));
  const coveragePercent = metadata.coverage?.coveragePercent ?? (metadata.scannedCount > 0 ? 100 : 0);

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
      .filter((event) => event.symbol && normalizeDossierSymbol(event.symbol) === target)
      .slice(0, 5);
  }, [alertEvents, selectedDossierSignal]);

  const mood = selected?.risk === "high" || selected?.risk === "blocked"
    ? "serious"
    : selected?.state === "near_trigger" || selected?.state === "triggered"
      ? "alert"
      : rankProfile.petMood;
  const selectedPulseTone = signalPulseTone(selected);

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

  function toggleSound() {
    if (soundEnabled) {
      setSoundEnabled(false);
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

    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }

    setSoundEnabled(true);
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
            quietHours: alertQuietHours,
          });

          if (
            soundEnabled &&
            soundProfile.shouldPlay &&
            !firstRefreshRef.current &&
            document.visibilityState === "visible"
          ) {
            playSignalTone(soundProfile.name, soundProfile.volume);
          }

          maybeShowNotification(soundAlert);
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
  }, [maybeShowNotification, playSignalTone, soundEnabled]);

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

      if (payload.entry) {
        setJournalEntries((current) => mergeJournalEntry(current, payload.entry as JournalEvent));
      } else if (payload.entries) {
        setJournalEntries(payload.entries);
      }

      setJournalStatus("saved");
    } catch {
      setJournalStatus("error");
    }
  }

  async function createDailyMoverCalibrationReview(
    suggestion: DailyMoverCalibrationSuggestion,
    context: { observedAt: string; snapshotId: string },
  ) {
    const calibration = {
      guardrail: suggestion.guardrail,
      label: suggestion.label,
      observedAt: context.observedAt,
      recommendation: suggestion.recommendation,
      sampleCount: suggestion.sampleCount,
      snapshotId: context.snapshotId,
      symbols: suggestion.symbols,
      tag: suggestion.tag,
    };
    const optimisticEntry = buildJournalEntryFromDailyMoverCalibration(calibration, {
      createdAt: new Date().toISOString(),
    });

    setJournalEntries((current) => mergeJournalEntry(current, optimisticEntry));
    setCalibrationReviewStatus("saving");
    setJournalStatus("saving");

    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "calibration_review",
          calibration,
        }),
      });

      if (!response.ok) {
        throw new Error("daily_mover_calibration_journal_failed");
      }

      const payload = await response.json() as {
        entry?: JournalEvent;
        entries?: JournalEvent[];
      };

      if (payload.entry) {
        setJournalEntries((current) => mergeJournalEntry(current, payload.entry as JournalEvent));
      } else if (payload.entries) {
        setJournalEntries(payload.entries);
      }

      setCalibrationReviewStatus("saved");
      setJournalStatus("saved");
    } catch {
      setCalibrationReviewStatus("error");
      setJournalStatus("error");
    }
  }

  async function createDailyMoverStrategyConfirmation(draft: DailyMoverStrategyDraft) {
    const strategyDraft = {
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
    };
    const optimisticEntry = buildJournalEntryFromDailyMoverStrategyConfirmation(strategyDraft, {
      createdAt: new Date().toISOString(),
    });

    setJournalEntries((current) => mergeJournalEntry(current, optimisticEntry));
    setStrategyConfirmationStatus("saving");
    setJournalStatus("saving");

    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "strategy_confirmation",
          strategyDraft,
        }),
      });

      if (!response.ok) {
        throw new Error("daily_mover_strategy_confirmation_failed");
      }

      const payload = await response.json() as {
        entry?: JournalEvent;
        entries?: JournalEvent[];
      };

      if (payload.entry) {
        setJournalEntries((current) => mergeJournalEntry(current, payload.entry as JournalEvent));
      } else if (payload.entries) {
        setJournalEntries(payload.entries);
      }

      const archiveResponse = await fetch(`/api/daily-movers?limit=${dailyMoverState.retention.limit}`, {
        cache: "no-store",
      });

      if (archiveResponse.ok) {
        const archivePayload = await archiveResponse.json() as DailyMoverReadArchiveResult["body"];
        setDailyMoverState(archivePayload);
      }

      setStrategyConfirmationStatus("saved");
      setJournalStatus("saved");
    } catch {
      setStrategyConfirmationStatus("error");
      setJournalStatus("error");
    }
  }

  async function createStrategyWeightExecutionRecord(
    execution: StrategyWeightChangeExecutionJournalInput,
    adminToken: string,
  ) {
    setJournalStatus("saving");

    try {
      const response = await fetch("/api/admin/strategy-weights/executions/record", {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ execution }),
      });

      if (!response.ok) {
        throw new Error("strategy_weight_execution_record_failed");
      }

      const payload = await response.json() as {
        entry?: JournalEvent;
        entries?: JournalEvent[];
      };

      if (payload.entry) {
        setJournalEntries((current) => mergeJournalEntry(current, payload.entry as JournalEvent));
      } else if (payload.entries) {
        setJournalEntries(payload.entries);
      }

      setJournalStatus("saved");
    } catch {
      setJournalStatus("error");
      throw new Error("strategy_weight_execution_record_failed");
    }
  }

  return (
    <main className={`studio-shell studio-shell--${metadata.status} studio-shell--refresh-${refreshState} studio-shell--risk-${metadata.riskGate}`}>
      <div className="studio-scan-grid" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <header className="topline">
        <div className="brand">
          <div className="brand-mark">川</div>
          <div>
            <strong>雷达中枢</strong>
            <span>公开监控 · CoinGlass 实时源 · 15m 分批扫描</span>
          </div>
        </div>

        <div className="market-tape" aria-label="市场滚动带">
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

        <div className="top-status">
          <strong>下次扫描 {formatScanTime(metadata.nextScanAt)}</strong>
          <span className="mono">
            {metadata.cadenceMinutes}m {marketStatusLabel(metadata.status)} / {marketSourceLabel(metadata.source)} / 候选池 {instrumentPool.summary.accepted}
          </span>
          <span className="mono">
            {batchNote ?? `护栏 ${metadata.staleAfterMinutes}m`} / {metadata.isRealtime ? "实时" : "预览"}
          </span>
          {requestsNote ? (
            <span className="mono">{requestsNote}</span>
          ) : null}
          {batchNote ? (
            <span className="top-status__guard">
              护栏 {metadata.staleAfterMinutes}m
            </span>
          ) : null}
          <div className={`live-console live-console--${refreshState}`}>
            <span className="mono">
              {refreshStatusLabel(refreshState)} · {formatRefreshInterval(refreshIntervalMs)}
            </span>
            <button
              aria-pressed={soundEnabled}
              className={`sound-toggle ${soundEnabled ? "is-on" : ""}`}
              onClick={toggleSound}
              type="button"
            >
              {soundEnabled ? "声音开启" : "声音关闭"}
            </button>
            <span className="mono live-console__delta">{deltaLabel(lastDelta)}</span>
          </div>
        </div>
      </header>

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

      <section className="studio-workspace">
        <aside className="studio-stack studio-stack--left">
          <RadarTable
            signals={signals}
            selectedId={selected?.id}
            onOpenDossier={openSignalDossier}
            onSelect={selectSignal}
          />
          <section className="module">
            <div className="module-head">
              <h2>全市场热区</h2>
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
        </aside>

        <section className="studio-stack studio-stack--center">
          <section className="module hero-module">
            <div className="hero-copy">
              <div>
                <span className="tag">川 · 信号地图</span>
                <h1>把行情异动，压缩成一张可执行的决策地图。</h1>
                <p>不做传统首页，不堆概念。首屏直接展示扫描状态、候选币、触发条件、失效条件和市场热区。</p>
                <div className="hero-actions">
                  <a
                    className="action-button"
                    href={siteConfig.tradingViewBaseUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开主图 <span>↗</span>
                  </a>
                  <button
                    className="action-button action-button--ghost"
                    onClick={() => openSignalDossier()}
                    type="button"
                  >
                    查看逻辑 <span>→</span>
                  </button>
                </div>
              </div>
              <div className="metric-strip">
                <div className="metric"><span className="mono">已扫描</span><strong>{metadata.scannedCount}</strong></div>
                <div className="metric"><span className="mono">异动</span><strong>{metadata.anomalyCount.toString().padStart(2, "0")}</strong></div>
                <div className="metric"><span className="mono">候选</span><strong>{signals.length.toString().padStart(2, "0")}</strong></div>
                <div className="metric"><span className="mono">风控门</span><strong>{riskGateLabel(metadata.riskGate)}</strong></div>
              </div>
              <div className="signal-rhythm" aria-label="候选强度节奏">
                {signals.slice(0, 6).map((signal) => (
                  <button
                    className={[
                      `signal-rhythm__bar signal-rhythm__bar--${signal.direction}`,
                      `signal-rhythm__bar--pulse-${signalPulseTone(signal)}`,
                      selected?.id === signal.id ? "signal-rhythm__bar--active" : "",
                    ].filter(Boolean).join(" ")}
                    key={`rhythm-${signal.id}`}
                    onClick={() => openSignalDossier(signal.id)}
                    type="button"
                  >
                    <i style={{ height: `${Math.max(18, Math.min(signal.confidence, 96))}%` }} />
                    <span>{signal.symbol.replace("USDT", "")}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="signal-map" aria-label="signal map">
              <svg className="map-line" viewBox="0 0 620 340" preserveAspectRatio="none">
                <path d="M55 70 C160 58 190 130 270 120 C365 108 390 62 560 72" />
                <path d="M80 258 C180 220 210 260 300 205 C390 150 440 230 530 240" />
              </svg>
              {["n1", "n2", "n3", "n4", "n5"].map((slot, index) => {
                const signal = signals[index] ?? signals[0];
                const symbol = signal?.symbol.replace("USDT", "") ?? "BTC";
                const nodeClasses = [
                  "signal-node",
                  slot,
                  index === 0 ? "signal-node--hot" : "",
                  signal?.id === selected?.id ? "signal-node--selected" : "",
                  signalPulseTone(signal) === "risk-high" ? "signal-node--risk-high" : "",
                ].filter(Boolean).join(" ");

                return (
                  <button
                    className={nodeClasses}
                    key={`${slot}-${symbol}`}
                    onClick={() => signal && openSignalDossier(signal.id)}
                    type="button"
                  >
                    <b>{symbol}</b>
                    <small>{signal ? signalStateLabels[signal.state] : "观察"}</small>
                  </button>
                );
              })}
            </div>
          </section>

          <ChartPanel
            activeTimeframe={activeTimeframe}
            onTimeframeChange={setActiveTimeframe}
            selected={selected}
          />
        </section>

        <aside className="studio-stack studio-stack--right">
          <SystemHealthPanel
            health={liveHealth}
            onRecordStrategyWeightExecution={createStrategyWeightExecutionRecord}
          />
          <EventCenterPanel
            alertEvents={alertEvents}
            archive={liveSnapshot.archive}
            liveDelta={lastDelta}
            liveGeneratedAt={metadata.generatedAt}
            liveScanId={metadata.id}
          />
          <DailyMoverPanel
            archive={dailyMoverState}
            calibrationReviewStatus={calibrationReviewStatus}
            key={dailyMoverState.strategyConfirmations.map((confirmation) => confirmation.eventId).join("|") || "daily-mover-panel"}
            onCreateCalibrationReview={createDailyMoverCalibrationReview}
            onConfirmStrategyDraft={createDailyMoverStrategyConfirmation}
            strategyConfirmationStatus={strategyConfirmationStatus}
          />
          <StrategyCard selected={selected} />
          <RankPanel profile={rankProfile} />
          <PixelS680
            mood={mood}
            onOpenDossier={() => openSignalDossier()}
            rankProfile={rankProfile}
            selectedSymbol={selected?.symbol}
          />
          <ReplayPanel archive={liveSnapshot.archive} />
          <JournalPanel
            events={journalEntries}
            onCreate={createJournalEntry}
            selected={selected}
            status={journalStatus}
          />
        </aside>
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
