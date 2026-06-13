"use client";

import { useMemo, useState } from "react";
import { ChartPanel } from "./chart-panel";
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
import type { MarketRadarSnapshot } from "@/lib/market/types";

type RadarWorkspaceProps = {
  health: SystemHealthReport;
  snapshot: MarketRadarSnapshot;
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

function metadataNote(notes: string[], prefix: string) {
  return notes.find((note) => note.startsWith(prefix));
}

export function RadarWorkspace({ health, snapshot }: RadarWorkspaceProps) {
  const { heatmap, instrumentPool, journalEvents, metadata, signals } = snapshot;
  const [selectedId, setSelectedId] = useState(signals[0]?.id);
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>(signals[0]?.timeframe ?? "15m");
  const [journalEntries, setJournalEntries] = useState<JournalEvent[]>(journalEvents);
  const [journalStatus, setJournalStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
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
            <span>公开模板 · 演示数据 · 非实时扫描</span>
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
          <SystemHealthPanel health={health} />
          <StrategyCard selected={selected} />
          <RankPanel profile={rankProfile} />
          <PixelS680 mood={mood} rankProfile={rankProfile} />
          <ReplayPanel archive={snapshot.archive} />
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
