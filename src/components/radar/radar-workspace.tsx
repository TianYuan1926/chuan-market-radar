"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartPanel } from "./chart-panel";
import { EventCenterPanel } from "./event-center-panel";
import { JournalPanel } from "./journal-panel";
import { PixelS680 } from "./pixel-s680";
import { RadarTable } from "./radar-table";
import { RankPanel } from "./rank-panel";
import { ReplayPanel } from "./replay-panel";
import { StrategyCard } from "./strategy-card";
import { SystemHealthPanel } from "./system-health-panel";
import { siteConfig } from "@/lib/config/site";
import { buildJournalEntryFromSignal, mergeJournalEntry } from "@/lib/journal/journal-entry";
import { buildRankProfile } from "@/lib/journal/rank-engine";
import type { JournalAction, JournalEvent, Timeframe } from "@/lib/analysis/types";
import type { SystemHealthReport } from "@/lib/api/system-health";
import {
  buildRefreshPlan,
  compareSignalSets,
  shouldPlaySignalSound,
  type SignalSetDelta,
} from "@/lib/market/live-refresh";
import type { MarketRadarSnapshot } from "@/lib/market/types";

type RadarWorkspaceProps = {
  health: SystemHealthReport;
  snapshot: MarketRadarSnapshot;
};

type RefreshState = "idle" | "syncing" | "updated" | "quiet" | "error";
type AudioContextConstructor = typeof AudioContext;

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

function metadataNote(notes: string[], prefix: string) {
  return notes.find((note) => note.startsWith(prefix));
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
    error: "RETRY",
    idle: "AUTO",
    quiet: "SYNCED",
    syncing: "SYNCING",
    updated: "NEW MOVE",
  }[state];
}

function deltaLabel(delta: SignalSetDelta | null) {
  if (!delta) {
    return "watching";
  }

  if (delta.newSymbols.length > 0) {
    return `new ${delta.newSymbols.slice(0, 3).join("/")}`;
  }

  if (delta.changedSymbols.length > 0) {
    return `shift ${delta.changedSymbols.slice(0, 3).join("/")}`;
  }

  if (delta.removedSymbols.length > 0) {
    return `cooldown ${delta.removedSymbols.slice(0, 3).join("/")}`;
  }

  return delta.isNewScan ? "scan refreshed" : "no change";
}

function audioContextConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext ??
    null;
}

export function RadarWorkspace({ health, snapshot }: RadarWorkspaceProps) {
  const [liveSnapshot, setLiveSnapshot] = useState(snapshot);
  const [liveHealth, setLiveHealth] = useState(health);
  const { heatmap, instrumentPool, journalEvents, metadata, signals } = liveSnapshot;
  const [selectedId, setSelectedId] = useState<string | undefined>(signals[0]?.id);
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>(signals[0]?.timeframe ?? "15m");
  const [journalEntries, setJournalEntries] = useState<JournalEvent[]>(journalEvents);
  const [journalStatus, setJournalStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(() =>
    buildRefreshPlan({
      nextScanAt: snapshot.metadata.nextScanAt,
      now: new Date(),
    }).intervalMs
  );
  const [lastDelta, setLastDelta] = useState<SignalSetDelta | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const snapshotRef = useRef(snapshot);
  const firstRefreshRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const batchNote = metadataNote(metadata.notes, "batch ");
  const requestsNote = metadataNote(metadata.notes, "requests ");

  const selected = useMemo(
    () => signals.find((signal) => signal.id === selectedId) ?? signals[0],
    [selectedId, signals],
  );
  const rankProfile = useMemo(() => buildRankProfile(journalEntries), [journalEntries]);

  const mood = selected?.risk === "high" || selected?.risk === "blocked"
    ? "serious"
    : selected?.state === "near_trigger" || selected?.state === "triggered"
      ? "alert"
      : rankProfile.petMood;

  const playSignalTone = useCallback(() => {
    const AudioCtor = audioContextConstructor();

    if (!AudioCtor) {
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

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(740, now);
    oscillator.frequency.exponentialRampToValueAtTime(1040, now + 0.1);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.2);
  }, []);

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

        if (shouldPlaySignalSound({
          delta,
          firstLoad: firstRefreshRef.current,
          pageVisible: document.visibilityState === "visible",
          soundEnabled,
        })) {
          playSignalTone();
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
  }, [playSignalTone, soundEnabled]);

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

  async function createJournalEntry(action: JournalAction) {
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

  return (
    <main className="studio-shell">
      <header className="topline">
        <div className="brand">
          <div className="brand-mark">川</div>
          <div>
            <strong>Market Studio</strong>
            <span>公开监控 · CoinGlass 实时源 · 15m 分批扫描</span>
          </div>
        </div>

        <div className="market-tape" aria-label="market tape">
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
          <strong>Next Scan {formatScanTime(metadata.nextScanAt)}</strong>
          <span className="mono">
            {metadata.cadenceMinutes}m {metadata.status} / {metadata.source} / pool {instrumentPool.summary.accepted}
          </span>
          <span className="mono">
            {batchNote ?? `guard ${metadata.staleAfterMinutes}m`} / {metadata.isRealtime ? "live" : "demo"}
          </span>
          {requestsNote ? (
            <span className="mono">{requestsNote}</span>
          ) : null}
          {batchNote ? (
            <span className="top-status__guard">
              guard {metadata.staleAfterMinutes}m
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
              {soundEnabled ? "SOUND ON" : "SOUND OFF"}
            </button>
            <span className="mono live-console__delta">{deltaLabel(lastDelta)}</span>
          </div>
        </div>
      </header>

      <section className="studio-workspace">
        <aside className="studio-stack studio-stack--left">
          <RadarTable signals={signals} selectedId={selected?.id} onSelect={selectSignal} />
          <section className="module">
            <div className="module-head">
              <h2>全市场热区</h2>
              <span className="tag">{instrumentPool.summary.accepted} ACTIVE</span>
            </div>
            <div className="pool-audit" aria-label="扫描池健康度">
              <span><b>{instrumentPool.summary.total}</b> raw</span>
              <span><b>{instrumentPool.summary.rejected}</b> filtered</span>
              <span><b>{instrumentPool.summary.duplicatesRemoved}</b> dup</span>
              <span><b>{formatCompactUsd(instrumentPool.summary.minVolume24hUsd)}</b> floor</span>
            </div>
            <div className="heat-grid">
              {heatmap.map((item) => (
                <button className={`heat-cell heat-cell--${item.tone}`} key={item.symbol} type="button">
                  <b>{item.symbol}</b>
                  <span>{formatChangePercent(item.changePercent)}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="studio-stack studio-stack--center">
          <section className="module hero-module">
            <div className="hero-copy">
              <div>
                <span className="tag">CHUAN SIGNAL MAP</span>
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
                  <button className="action-button action-button--ghost" type="button">
                    查看逻辑 <span>→</span>
                  </button>
                </div>
              </div>
              <div className="metric-strip">
                <div className="metric"><span className="mono">SCANNED</span><strong>{metadata.scannedCount}</strong></div>
                <div className="metric"><span className="mono">ANOMALY</span><strong>{metadata.anomalyCount.toString().padStart(2, "0")}</strong></div>
                <div className="metric"><span className="mono">CANDIDATE</span><strong>{signals.length.toString().padStart(2, "0")}</strong></div>
                <div className="metric"><span className="mono">RISK GATE</span><strong>{metadata.riskGate.toUpperCase()}</strong></div>
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
                return (
                  <button
                    className={`signal-node ${slot} ${index === 0 ? "signal-node--hot" : ""}`}
                    key={`${slot}-${symbol}`}
                    onClick={() => signal && selectSignal(signal.id)}
                    type="button"
                  >
                    <b>{symbol}</b>
                    <small>{signal?.state.replaceAll("_", " ") ?? "watch"}</small>
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
          <SystemHealthPanel health={liveHealth} />
          <EventCenterPanel archive={liveSnapshot.archive} />
          <StrategyCard selected={selected} />
          <RankPanel profile={rankProfile} />
          <PixelS680 mood={mood} rankProfile={rankProfile} />
          <ReplayPanel archive={liveSnapshot.archive} />
          <JournalPanel
            events={journalEntries}
            onCreate={createJournalEntry}
            selected={selected}
            status={journalStatus}
          />
        </aside>
      </section>
    </main>
  );
}
